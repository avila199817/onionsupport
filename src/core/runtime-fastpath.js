/* =========================================================
   Onion Support · Core Runtime Fast Path
   /src/core/runtime-fastpath.js

   Capa de composición, no de dominio:
   - HTTP lee el estado canónico sin structuredClone.
   - Writes internos de HTTP usan setState(..., { raw:true }).
   - Getters calientes de Core/Auth leen escalares o clonan sólo user/session.
   - getState() público mantiene intacto su contrato seguro.
========================================================= */

import { AppCore } from "./index.js";
import Http from "./http.js";

export const RUNTIME_FASTPATH_VERSION =
  "core.runtime-fastpath.v1-zero-copy-boundary";

const MARK = Symbol.for("onion.support.runtime-fastpath");
const AUTH_MARK = Symbol.for("onion.support.runtime-fastpath.auth");
const HTTP_MARK = Symbol.for("onion.support.runtime-fastpath.http");

const NEGATIVE_STATUS = new Set([
  "disabled", "desactivado", "inactive", "inactivo",
  "deleted", "eliminado", "archived", "archivado",
  "revoked", "revocado", "blocked", "bloqueado",
  "banned", "suspended", "suspendido",
]);

let installed = false;
let originalRegisterModule = null;
let originalHttpInstall = null;
let authPatched = false;
let httpFacadeInstalls = 0;

const object = (value) =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const fn = (value) => typeof value === "function";

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return output || fallback;
}

function first(...values) {
  return values.find((value) =>
    value !== undefined &&
    value !== null &&
    !(typeof value === "string" && !value.trim())
  );
}

function token(value = "") {
  const output = text(value, "").replace(/^Bearer\s+/i, "");

  if (!output || /\s/.test(output) || output.length > 8192) return "";

  if (["null", "undefined", "false", "true", "[object object]", "{}", "[]"]
    .includes(output.toLowerCase())) return "";

  return output;
}

function state() {
  return object(AppCore?.state) ? AppCore.state : null;
}

function currentToken(source = state()) {
  return token(first(source?.token, source?.accessToken, source?.access_token, ""));
}

function usableUser(source = state()) {
  const user = object(source?.user)
    ? source.user
    : object(source?.currentUser)
      ? source.currentUser
      : null;

  if (!user || user.usable === false) return null;

  const status = text(first(user.status, user.estado, user.state, ""), "")
    .toLowerCase();

  return NEGATIVE_STATUS.has(status) ? null : user;
}

function role(user = usableUser(), source = state()) {
  if (!user) return "";

  try {
    return AppCore.normalizeRole?.(
      first(user.role, user.rol, user.roles, source?.role, source?.rol, "user")
    ) || "user";
  } catch {
    return text(first(user.role, user.rol, source?.role, "user"), "user")
      .toLowerCase() === "admin" ? "admin" : "user";
  }
}

function cloneUser(user = usableUser()) {
  if (!user) return null;

  return {
    ...user,
    ...(Array.isArray(user.roles) ? { roles: [...user.roles] } : {}),
    ...(Array.isArray(user.permissions) ? { permissions: [...user.permissions] } : {}),
    ...(Array.isArray(user.permisos) ? { permisos: [...user.permisos] } : {}),
  };
}

function cloneSession(source = state()) {
  const session = object(source?.session)
    ? source.session
    : object(source?.sessionData)
      ? source.sessionData
      : null;

  return session ? { ...session } : null;
}

function permissions(user = usableUser()) {
  const values = Array.isArray(user?.permissions)
    ? user.permissions
    : Array.isArray(user?.permisos)
      ? user.permisos
      : [];

  return [...values];
}

function rawSet(patch = {}) {
  if (!object(patch)) return state();

  try {
    return AppCore.setState?.(patch, { raw: true }) || state();
  } catch {
    return state();
  }
}

function sources(payload = {}) {
  if (!object(payload)) return [];

  return [payload, payload.data, payload.payload, payload.result, payload.auth]
    .filter(object);
}

function pick(payload, names) {
  for (const source of sources(payload)) {
    for (const name of names) {
      const value = source?.[name];
      if (value !== undefined && value !== null && value !== "") return value;
    }
  }

  return undefined;
}

function applyHttpSession(payload = {}) {
  if (!object(payload)) return state();

  const patch = {};
  const accessToken = pick(payload, ["token", "accessToken", "access_token"]);
  const user = pick(payload, ["user", "currentUser", "usuario", "me", "account"]);
  const session = pick(payload, ["session", "sessionData", "currentSession"]);

  if (accessToken !== undefined) patch.token = accessToken;
  if (user !== undefined) patch.user = user;
  if (session !== undefined) patch.session = session;

  if (payload.hasRefreshToken !== undefined) {
    patch.hasRefreshToken = payload.hasRefreshToken === true;
  }

  return Object.keys(patch).length ? rawSet(patch) : state();
}

const httpCoreFacade = {
  get state() { return state(); },
  getState() { return state(); },
  setToken(value = null) { return rawSet({ token: value }); },
  applySession(payload = {}) { return applyHttpSession(payload); },
  clearSession() {
    return rawSet({
      token: null,
      user: null,
      session: null,
      hasRefreshToken: false,
    });
  },
  registerModule(...args) {
    return originalRegisterModule
      ? originalRegisterModule(...args)
      : AppCore.registerModule?.(...args);
  },
};

function patchCoreHelpers() {
  AppCore.isAuthenticated = () => Boolean(currentToken() && usableUser());
  AppCore.getCurrentUser = () => cloneUser();
  AppCore.getCurrentRole = () => role() || null;
  AppCore.getAuthHeader = () => {
    const value = currentToken();
    return value ? { Authorization: `Bearer ${value}` } : {};
  };
  AppCore.hasRole = (requested = []) => {
    if (!AppCore.isAuthenticated()) return false;

    const current = role();
    if (current === "admin") return true;

    const list = (Array.isArray(requested) ? requested.flat(Infinity) : [requested])
      .map((value) => {
        try { return AppCore.normalizeRole?.(value) || ""; }
        catch { return ""; }
      })
      .filter(Boolean);

    return !list.length || list.includes(current);
  };
}

function patchAuth(auth) {
  if (!auth || typeof auth !== "object" || auth[AUTH_MARK]) return false;

  Object.defineProperty(auth, AUTH_MARK, { value: true });

  const getUser = () => cloneUser();
  const getSession = () => cloneSession();
  const getToken = () => currentToken();
  const getRole = () => role() || null;
  const authenticated = () => Boolean(getToken() && usableUser());
  const admin = () => authenticated() && role() === "admin";
  const getRoles = () => authenticated() && role() ? [role()] : [];
  const getSlug = () => text(first(usableUser()?.slug, state()?.userSlug, ""), "");
  const getHome = () => text(first(state()?.homePath, state()?.defaultHome, "/"), "/");

  Object.assign(auth, {
    getUser,
    getCurrentUser: getUser,
    getProfile: getUser,
    getSession,
    getCurrentSession: getSession,
    getToken,
    getAccessToken: getToken,
    hasValidToken: () => Boolean(getToken()),
    isAuthenticated: authenticated,
    getRole,
    getCurrentRole: getRole,
    getRoles,
    getCurrentRoles: getRoles,
    getPermissions: () => permissions(),
    isAdmin: admin,
    isCurrentUserAdmin: admin,
    getUserSlug: getSlug,
    getDefaultHome: getHome,
    getPostLoginTarget: () => authenticated() ? getHome() : "/",
    getAuthHeader: () => {
      const value = getToken();
      return value ? { Authorization: `Bearer ${value}` } : {};
    },
    hasRole(required = "") {
      let normalized = "";

      try { normalized = AppCore.normalizeRole?.(required) || ""; }
      catch {}

      if (!normalized || !authenticated()) return false;

      const current = role();
      return current === "admin" || current === normalized;
    },
    requireRole(required = "") {
      if (auth.hasRole(required)) return true;

      const error = new Error("No tienes permisos para acceder a este recurso.");
      error.code = "AUTH_FORBIDDEN";
      error.status = 403;
      throw error;
    },
  });

  authPatched = true;
  return true;
}

function patchRegistration() {
  originalRegisterModule = AppCore.registerModule.bind(AppCore);

  AppCore.registerModule = (name = "", value = null, options = {}) => {
    if (text(name, "").toLowerCase() === "auth") patchAuth(value);
    return originalRegisterModule(name, value, options);
  };

  const existing = AppCore.getModule?.("auth");
  if (existing) patchAuth(existing);
}

function patchHttp() {
  if (Http[HTTP_MARK] || !fn(Http.install)) return;

  originalHttpInstall = Http.install.bind(Http);
  Object.defineProperty(Http, HTTP_MARK, { value: true });

  Http.install = (core = null) => {
    httpFacadeInstalls += 1;
    return originalHttpInstall(!core || core === AppCore ? httpCoreFacade : core);
  };

  Http.install(AppCore);
}

export function installRuntimeFastPath() {
  if (installed || AppCore?.[MARK]) return true;

  patchRegistration();
  patchCoreHelpers();
  patchHttp();

  Object.defineProperty(AppCore, MARK, { value: true });
  installed = true;
  return true;
}

export function getRuntimeFastPathSnapshot() {
  return Object.freeze({
    version: RUNTIME_FASTPATH_VERSION,
    installed,
    httpZeroCopyStateRead: true,
    httpRawStateWrites: true,
    publicGetStateContractChanged: false,
    authPatched,
    httpFacadeInstalls,
  });
}

export const RuntimeFastPath = Object.freeze({
  version: RUNTIME_FASTPATH_VERSION,
  install: installRuntimeFastPath,
  getSnapshot: getRuntimeFastPathSnapshot,
});

installRuntimeFastPath();
export default RuntimeFastPath;
