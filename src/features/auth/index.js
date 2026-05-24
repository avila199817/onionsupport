/* =========================================================
   Onion Support - Auth Facade
   Archivo: /src/features/auth/index.js

   Responsabilidad:
   - Fachada pública mínima de Auth.
   - Delegar login/restore/logout/session/guards.
   - HTTP delegado en CoreHttp/AppCore.
   - Normalizar usuario autenticado delegando en session.js.
   - Preservar campos públicos visuales del usuario vía session.js.
   - Exponer Home privada por slug: /@{user.slug}.
   - Pedir restore persistente/silent refresh a restore.js.
   - Init sólo registra Auth; restoreSession gobierna la restauración.
   - Sin Router.
   - Sin Toast.
   - Sin fetch propio.
   - Sin storage paralelo.
   - Sin rutas inventadas.
   - Sin /home.
   - Sin 2FA/MFA/OTP.
   - Roles únicos: admin / user.
   - Auth estricta: access token usable + user usable.
========================================================= */

import { AppCore } from "../../core/index.js";
import * as CoreHttpModule from "../../core/http.js";

import {
  AUTH_ENDPOINTS,
  ROUTES,
  USER_HOME_PREFIX,
  buildUserHomeRoute as configBuildUserHomeRoute,
  isBlockedRoutePath as configIsBlockedRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
} from "../../core/config.js";

import * as LoginApi from "./login.js";
import * as RestoreApi from "./restore.js";
import * as LogoutApi from "./logout.js";
import * as SessionApi from "./session.js";
import * as GuardsApi from "./guards.js";
import * as ActivationApi from "./activation.js";
import * as PasswordResetApi from "./password-reset.js";

export const AUTH_MODULE_VERSION = "auth.facade.v8";

const VALID_ROLES = Object.freeze(["admin", "user"]);

const AUTH_ROUTES = Object.freeze({
  login: ROUTES.login,
  passwordRequest: ROUTES.passwordRequest,
  passwordReset: ROUTES.passwordReset,
  activateAccount: ROUTES.activateAccount,
});

const AUTH_HOME = Object.freeze({
  canonical: "/",
  userPrefix: USER_HOME_PREFIX || "/@",
});

const CoreHttp =
  CoreHttpModule.default ||
  CoreHttpModule.Http ||
  CoreHttpModule.http ||
  CoreHttpModule;

const SENSITIVE_KEYS = new Set([
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "idToken",
  "id_token",
  "password",
  "pwd",
  "secret",
  "code",
  "key",
  "sig",
  "signature",
  "jwt",
  "authorization",
  "resetToken",
  "reset_token",
  "activationToken",
  "activation_token",
]);

/* =========================================================
   BASICS
========================================================= */

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function cleanRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(cleanRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = cleanText(value, "").toLowerCase();

  return VALID_ROLES.includes(role) ? role : "";
}

function defaultRole(value = "") {
  return cleanRole(value) || "user";
}

function stripBearer(value = "") {
  return cleanText(value, "").replace(/^Bearer\s+/i, "");
}

function tokenOk(value = "") {
  const token = stripBearer(value);

  if (!token) return false;
  if (/\s/.test(token)) return false;
  if (token.length > 8192) return false;

  return ![
    "null",
    "undefined",
    "false",
    "true",
    "[object object]",
    "{}",
    "[]",
  ].includes(token.toLowerCase());
}

function cleanToken(value = "") {
  const token = stripBearer(value);
  return tokenOk(token) ? token : null;
}

function state() {
  return isObject(AppCore?.state) ? AppCore.state : {};
}

function safeCall(fn = null, ...args) {
  try {
    return isFunction(fn) ? fn(...args) : null;
  } catch {
    return null;
  }
}

function optionalMethod(moduleApi = {}, name = "") {
  if (isFunction(moduleApi?.[name])) {
    return moduleApi[name];
  }

  if (isObject(moduleApi?.default) && isFunction(moduleApi.default[name])) {
    return moduleApi.default[name].bind(moduleApi.default);
  }

  return null;
}

function sanitizePayload(value = null, depth = 0) {
  if (depth > 5) return null;

  if (typeof value === "string") {
    return redact(value);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizePayload(item, depth + 1));
  }

  if (!isObject(value)) return value;

  const output = {};

  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) {
      output[key] = null;
      continue;
    }

    output[key] = sanitizePayload(child, depth + 1);
  }

  return output;
}

function emit(eventName = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(eventName, {
      source: "Auth",
      version: AUTH_MODULE_VERSION,
      ...sanitizePayload(payload),

      token: null,
      accessToken: null,
      refreshToken: null,
      refresh_token: null,
    });

    return true;
  } catch {
    return false;
  }
}

function safeError(error = null, type = "runtime") {
  return {
    type,
    name: error?.name || "Error",
    message: redact(error?.message || String(error || "")),
    code: error?.code || null,
    status: error?.status || error?.statusCode || error?.response?.status || null,
    refreshable: isRefreshableAuthError(error),
    shouldClearSession: shouldClearSessionForAuthError(error),
    at: new Date().toISOString(),
  };
}

/* =========================================================
   ROUTE / USER HELPERS
========================================================= */

function normalizeSlug(value = "") {
  try {
    return configNormalizeUserSlug(value) || "";
  } catch {
    const slug = cleanText(value, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^\/+/, "")
      .replace(/^@+/, "")
      .split(/[/?#]/)[0]
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .toLowerCase();

    if (!slug) return "";

    return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
  }
}

function normalizeSpaPath(path = "") {
  const raw = cleanText(path, "");

  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";

  const clean = raw.startsWith("/") ? raw : `/${raw}`;
  const pathOnly = clean
    .split("?")[0]
    .split("#")[0]
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/g, "") || "/";

  try {
    if (configIsBlockedRoutePath(pathOnly) === true) return "";
  } catch {
    // fallback local
  }

  if (pathOnly === "/home" || pathOnly.startsWith("/home/")) return "";
  if (pathOnly === "/403" || pathOnly.startsWith("/403/")) return "";
  if (pathOnly === "/404" || pathOnly.startsWith("/404/")) return "";
  if (pathOnly === "/2fa" || pathOnly.startsWith("/2fa/")) return "";
  if (pathOnly === "/mfa" || pathOnly.startsWith("/mfa/")) return "";
  if (pathOnly === "/otp" || pathOnly.startsWith("/otp/")) return "";

  return pathOnly;
}

function isUserDisabled(user = {}) {
  const status = cleanText(user.status || user.estado || user.state, "").toLowerCase();

  return Boolean(
    user.disabled === true ||
      user.deleted === true ||
      user.archived === true ||
      user.revoked === true ||
      user.blocked === true ||
      user.banned === true ||
      user.suspended === true ||
      user.active === false ||
      user.enabled === false ||
      Boolean(user.deletedAt) ||
      [
        "disabled",
        "inactive",
        "deleted",
        "archived",
        "revoked",
        "blocked",
        "banned",
        "suspended",
        "desactivado",
        "inactivo",
        "eliminado",
        "archivado",
        "bloqueado",
        "suspendido",
      ].includes(status)
  );
}

function extractUserSlug(user = null) {
  if (isFunction(AppCore?.extractUserSlug)) {
    return AppCore.extractUserSlug(user);
  }

  return normalizeSlug(
    user?.slug ||
      user?.lookup?.slug ||
      user?.profile?.slug ||
      user?.routing?.slug ||
      ""
  );
}

function buildUserHomePath(user = null) {
  if (isFunction(AppCore?.buildUserHomePath)) {
    return AppCore.buildUserHomePath(user);
  }

  const slug = extractUserSlug(user);

  try {
    return configBuildUserHomeRoute(slug) || AUTH_HOME.canonical;
  } catch {
    return slug ? `${AUTH_HOME.userPrefix}${slug}` : AUTH_HOME.canonical;
  }
}

function buildUserHomePathFromSlug(slug = "") {
  const clean = normalizeSlug(slug);

  try {
    return configBuildUserHomeRoute(clean) || AUTH_HOME.canonical;
  } catch {
    return clean ? `${AUTH_HOME.userPrefix}${clean}` : AUTH_HOME.canonical;
  }
}

function isUserHomePath(path = "") {
  const value = normalizeSpaPath(path);
  return /^\/@[a-z0-9][a-z0-9._-]{0,95}$/i.test(value);
}

function stripSensitiveUserFields(user = {}) {
  if (!isObject(user)) return {};

  const output = {};

  for (const [key, value] of Object.entries(user)) {
    if (SENSITIVE_KEYS.has(key)) continue;
    output[key] = value;
  }

  return output;
}

function normalizeUser(user = null) {
  if (!isObject(user)) return null;

  if (isFunction(SessionApi.normalizeUser)) {
    const normalized = safeCall(SessionApi.normalizeUser, user);
    return normalized && !isUserDisabled(normalized) ? normalized : null;
  }

  if (isFunction(AppCore?.normalizeUser)) {
    const normalized = AppCore.normalizeUser(user);
    return normalized && !isUserDisabled(normalized) ? normalized : null;
  }

  if (isUserDisabled(user)) return null;

  const safeUser = stripSensitiveUserFields(user);

  const id = cleanText(safeUser.userId || safeUser.id || safeUser.uid || safeUser.sub, "");
  const slug = extractUserSlug(safeUser);

  const username = cleanText(
    safeUser.username ||
      safeUser.userName ||
      safeUser.user_name ||
      safeUser.usernameLower ||
      safeUser.username_lower ||
      slug ||
      "",
    ""
  );

  if (!id && !username && !slug) return null;

  const profile = isObject(safeUser.profile) ? safeUser.profile : {};

  const displayName = cleanText(
    safeUser.displayName ||
      safeUser.fullName ||
      safeUser.name ||
      safeUser.nombre ||
      profile.displayName ||
      profile.fullName ||
      profile.name ||
      profile.nombre ||
      username ||
      slug ||
      id,
    "Usuario"
  );

  const role = defaultRole(safeUser.role || safeUser.rol || safeUser.roles);

  return {
    ...safeUser,

    id: id || null,
    userId: cleanText(safeUser.userId || id, "") || null,
    uid: cleanText(safeUser.uid || id, "") || null,
    sub: cleanText(safeUser.sub || id, "") || null,

    username: username || null,
    slug: slug || null,

    name: safeUser.name || displayName,
    nombre: safeUser.nombre || displayName,
    fullName: safeUser.fullName || displayName,
    displayName,

    email: safeUser.email || null,

    role,
    rol: role,
    roles: [role],

    active: true,
    enabled: true,
    disabled: false,
    deleted: false,
    archived: false,

    isAdmin: role === "admin",
    isUser: role === "user",
  };
}

function avatarFromUser(user = null) {
  if (!isObject(user)) return "";

  return cleanText(
    user.avatarUrl ||
      user.avatar ||
      user.picture ||
      user.pictureUrl ||
      user.photoUrl ||
      user.photoURL ||
      user.imageUrl ||
      user.image ||
      user.profile?.avatarUrl ||
      user.profile?.avatar ||
      user.profile?.picture ||
      "",
    ""
  );
}

function publicUser(user = null) {
  const normalized = normalizeUser(user);

  if (!normalized) return null;

  const appPublic = isFunction(AppCore?.publicUser)
    ? AppCore.publicUser(normalized)
    : null;

  const base = isObject(appPublic)
    ? appPublic
    : {
        id: normalized.id || normalized.userId || null,
        userId: normalized.userId || normalized.id || null,
        username: normalized.username || null,
        slug: normalized.slug || null,
        displayName: normalized.displayName || null,
        role: normalized.role || null,
      };

  const avatar = avatarFromUser(normalized) || avatarFromUser(base);

  return {
    ...base,

    hasAvatar: Boolean(base.hasAvatar || normalized.hasAvatar || avatar),
    avatar: base.avatar || avatar || null,
    avatarUrl: base.avatarUrl || avatar || null,
    picture: base.picture || normalized.picture || avatar || null,
    photoUrl: base.photoUrl || normalized.photoUrl || avatar || null,
    avatarUpdatedAt: base.avatarUpdatedAt || normalized.avatarUpdatedAt || null,
  };
}

/* =========================================================
   DELEGATES
========================================================= */

const loginCore = optionalMethod(LoginApi, "login");
const handleLoginFormSubmitCore = optionalMethod(LoginApi, "handleLoginFormSubmit");

const restoreSessionCore = optionalMethod(RestoreApi, "restoreSession");
const restoreRefreshSessionCore = optionalMethod(RestoreApi, "refreshSession");

const logoutCore = optionalMethod(LogoutApi, "logout");

const sessionApplySession = optionalMethod(SessionApi, "applySession");
const sessionClearSession = optionalMethod(SessionApi, "clearSession");
const sessionBuildSnapshot = optionalMethod(SessionApi, "buildSessionSnapshot");
const sessionIsAuthenticated = optionalMethod(SessionApi, "isAuthenticated");
const sessionGetCurrentUser = optionalMethod(SessionApi, "getCurrentUser");
const sessionGetCurrentSession = optionalMethod(SessionApi, "getCurrentSession");
const sessionGetCurrentToken = optionalMethod(SessionApi, "getCurrentToken");
const sessionGetCurrentRole = optionalMethod(SessionApi, "getCurrentRole");
const sessionGetCurrentRoles = optionalMethod(SessionApi, "getCurrentRoles");
const sessionGetAuthHeader = optionalMethod(SessionApi, "getAuthHeader");
const sessionDebugSnapshot = optionalMethod(SessionApi, "getSessionDebugSnapshot");

const guardAuthenticatedCore = optionalMethod(GuardsApi, "guardAuthenticated");
const guardGuestCore = optionalMethod(GuardsApi, "guardGuest");
const guardRoleCore = optionalMethod(GuardsApi, "guardRole");
const guardAdminCore = optionalMethod(GuardsApi, "guardAdmin");
const canAccessRouteCore = optionalMethod(GuardsApi, "canAccessRoute");
const syncAuthStateCore = optionalMethod(GuardsApi, "syncAuthState");
const buildGuardErrorPayloadCore = optionalMethod(GuardsApi, "buildGuardErrorPayload");
const getAuthGuardsSnapshotCore = optionalMethod(GuardsApi, "getAuthGuardsSnapshot");

const activateAccountCore = optionalMethod(ActivationApi, "activateAccount");
const validateActivationTokenCore = optionalMethod(ActivationApi, "validateActivationToken");

const requestPasswordResetCore = optionalMethod(PasswordResetApi, "requestPasswordReset");
const confirmResetPasswordCore = optionalMethod(PasswordResetApi, "confirmResetPassword");
const validateResetPasswordTokenCore = optionalMethod(PasswordResetApi, "validateResetPasswordToken");

/* =========================================================
   SESSION READ
========================================================= */

function getToken() {
  const value =
    safeCall(sessionGetCurrentToken) ||
    safeCall(CoreHttp?.getAccessToken?.bind?.(CoreHttp) || CoreHttp?.getAccessToken) ||
    state().token ||
    state().accessToken ||
    state().access_token ||
    "";

  return cleanToken(value);
}

function getAccessToken() {
  return getToken();
}

function hasValidToken() {
  return Boolean(getToken());
}

function getUser() {
  const currentState = state();

  const user =
    safeCall(sessionGetCurrentUser) ||
    safeCall(AppCore?.getCurrentUser?.bind?.(AppCore) || AppCore?.getCurrentUser) ||
    currentState.user ||
    currentState.currentUser ||
    currentState.sessionUser ||
    currentState.authUser ||
    currentState.session?.user ||
    currentState.sessionData?.user ||
    currentState.auth?.user ||
    AppCore?.user ||
    AppCore?.currentUser ||
    null;

  return normalizeUser(user);
}

function getCurrentSession() {
  return (
    safeCall(sessionGetCurrentSession) ||
    state().session ||
    state().sessionData ||
    null
  );
}

function getUserSlug() {
  return extractUserSlug(getUser());
}

function getDefaultHome() {
  return buildUserHomePath(getUser());
}

function getPostLoginTarget() {
  return getDefaultHome();
}

function getRole() {
  const user = getUser();

  if (!user) return "";

  return defaultRole(
    safeCall(sessionGetCurrentRole) ||
      user.role ||
      user.rol ||
      user.roles
  );
}

function getRoles() {
  if (!isAuthenticated()) return [];

  const fromSession = safeCall(sessionGetCurrentRoles);

  if (Array.isArray(fromSession) && fromSession.length) {
    const roles = fromSession
      .map(cleanRole)
      .filter(Boolean);

    return roles.includes("admin") ? ["admin"] : ["user"];
  }

  const role = getRole();

  return role ? [role] : [];
}

function isAuthenticated() {
  const strict = Boolean(getToken() && getUser());

  if (!strict) return false;

  try {
    return safeCall(sessionIsAuthenticated) === false ? false : strict;
  } catch {
    return strict;
  }
}

function isAdmin() {
  return isAuthenticated() && getRole() === "admin";
}

function hasRole(role = "") {
  const required = cleanRole(role);

  if (!required) return false;
  if (!isAuthenticated()) return false;
  if (getRole() === "admin") return true;

  return getRoles().includes(required);
}

function requireRole(role = "") {
  if (hasRole(role)) return true;

  const error = new Error("No tienes permisos para acceder a este recurso.");
  error.code = "AUTH_FORBIDDEN";
  error.status = 403;

  throw error;
}

function getPermissions() {
  const user = getUser();
  const permissions = user?.permissions || user?.permisos;

  return Array.isArray(permissions) ? permissions : [];
}

/* =========================================================
   PAYLOAD
========================================================= */

function nestedPayloads(payload = {}) {
  if (!isObject(payload)) return [];

  return [
    payload,
    isObject(payload.data) ? payload.data : null,
    isObject(payload.payload) ? payload.payload : null,
    isObject(payload.result) ? payload.result : null,
    isObject(payload.auth) ? payload.auth : null,
    isObject(payload.session) ? payload.session : null,
    isObject(payload.sessionData) ? payload.sessionData : null,
  ].filter(Boolean);
}

function pickNested(payload = {}, names = []) {
  for (const node of nestedPayloads(payload)) {
    for (const name of names) {
      const value =
        node?.[name] ??
        node?.session?.[name] ??
        node?.sessionData?.[name];

      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  }

  return null;
}

function extractUser(payload = {}) {
  if (!isObject(payload)) return null;

  return pickNested(payload, [
    "user",
    "usuario",
    "me",
    "account",
    "profile",
  ]);
}

function extractToken(payload = {}) {
  if (!isObject(payload)) return "";

  return pickNested(payload, [
    "token",
    "accessToken",
    "access_token",
  ]) || "";
}

function extractRefreshToken(payload = {}) {
  if (!isObject(payload)) return "";

  return pickNested(payload, [
    "refreshToken",
    "refresh_token",
  ]) || "";
}

function extractSession(payload = {}) {
  if (!isObject(payload)) return null;

  const session =
    payload.session ||
    payload.sessionData ||
    payload.data?.session ||
    payload.data?.sessionData ||
    payload.auth?.session ||
    payload.auth?.sessionData ||
    null;

  return isObject(session) ? session : null;
}

function extractRouting(payload = {}) {
  if (!isObject(payload)) return null;

  const routing =
    payload.routing ||
    payload.data?.routing ||
    payload.auth?.routing ||
    null;

  return isObject(routing) ? routing : null;
}

function extractBackendHomePath(payload = {}, user = null) {
  const routing = extractRouting(payload);

  const candidate = normalizeSpaPath(
    pickNested(payload, [
      "homePath",
      "canonicalPath",
      "publicPath",
      "redirectTo",
      "profilePath",
    ]) ||
      routing?.homePath ||
      routing?.canonicalPath ||
      routing?.publicPath ||
      routing?.profilePath ||
      ""
  );

  if (isUserHomePath(candidate)) return candidate;

  return buildUserHomePath(user);
}

function normalizeAuthPayload(payload = {}) {
  const source = isObject(payload) ? payload : {};

  const token = cleanToken(extractToken(source) || getToken());
  const refreshToken = cleanToken(extractRefreshToken(source) || "");

  const user = normalizeUser(extractUser(source) || getUser());
  const session = extractSession(source);
  const routing = extractRouting(source);

  const slug = extractUserSlug(user);
  const homePath = extractBackendHomePath(source, user);
  const role = user ? defaultRole(user.role || user.rol || user.roles) : "";

  const authenticated = Boolean(token && user);

  return {
    token,
    accessToken: token,
    access_token: token,

    hasRefreshToken: Boolean(refreshToken),

    session,
    sessionData: session,

    routing,

    user,
    currentUser: user,

    userSlug: slug || null,
    homePath,
    defaultHome: homePath,
    postLoginTarget: authenticated ? homePath : null,

    role: role || null,
    rol: role || null,
    roles: role ? [role] : [],

    authenticated,
  };
}

function publicAuthResult(payload = {}) {
  const user = getUser();
  const homePath = getDefaultHome();

  return {
    ok: payload.authenticated === true || isAuthenticated(),
    authenticated: isAuthenticated(),

    user: publicUser(user),
    currentUser: publicUser(user),

    session: getCurrentSession(),
    sessionData: getCurrentSession(),

    userSlug: getUserSlug() || null,
    homePath,
    defaultHome: homePath,
    postLoginTarget: getPostLoginTarget(),

    role: getRole() || null,
    roles: getRoles(),

    hasToken: hasValidToken(),
    hasUser: Boolean(user),
    hasSession: Boolean(getCurrentSession()),
    hasRefreshToken: payload.hasRefreshToken === true,

    token: null,
    accessToken: null,
    access_token: null,
    refreshToken: null,
    refresh_token: null,
  };
}

/* =========================================================
   STATE WRITE
========================================================= */

function syncHttpToken(token = "") {
  try {
    if (token && isFunction(CoreHttp?.setAuthTokens)) {
      CoreHttp.setAuthTokens({
        token,
        accessToken: token,
        access_token: token,
      });

      return true;
    }

    if (token && isFunction(CoreHttp?.setAccessToken)) {
      CoreHttp.setAccessToken(token);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function clearHttpToken() {
  try {
    if (isFunction(CoreHttp?.clearAuthTokens)) {
      CoreHttp.clearAuthTokens();
      return true;
    }

    if (isFunction(CoreHttp?.setAccessToken)) {
      CoreHttp.setAccessToken(null);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function writeSession(payload = {}, options = {}) {
  const normalized = normalizeAuthPayload(payload);

  if (!(normalized.token && normalized.user)) {
    clearSession({
      ...options,
      source: options.source || "Auth.writeSession.invalid",
    });

    return normalizeAuthPayload({});
  }

  try {
    if (isFunction(sessionApplySession)) {
      sessionApplySession(normalized, {
        source: options.source || "Auth.applySession",
        ...options,
      });
    } else if (isFunction(AppCore?.applySession)) {
      AppCore.applySession(normalized, {
        source: options.source || "Auth.applySession",
        silent: options.silent,
        emit: options.emit,
      });
    } else if (isFunction(AppCore?.setState)) {
      AppCore.setState(normalized, {
        source: options.source || "Auth.applySession",
        silent: true,
        emit: false,
      });
    }
  } catch {
    if (isFunction(AppCore?.setState)) {
      AppCore.setState(normalized, {
        source: options.source || "Auth.applySession",
        silent: true,
        emit: false,
      });
    }
  }

  syncHttpToken(normalized.token);

  return normalized;
}

function applySession(payload = {}, options = {}) {
  const result = writeSession(payload, {
    source: options.source || "Auth.applySession",
    ...options,
  });

  return publicAuthResult(result);
}

function clearSession(options = {}) {
  try {
    if (isFunction(sessionClearSession)) {
      sessionClearSession({
        source: options.source || "Auth.clearSession",
        ...options,
      });
    } else if (isFunction(AppCore?.clearSession)) {
      AppCore.clearSession({
        source: options.source || "Auth.clearSession",
        silent: options.silent,
        emit: options.emit,
      });
    } else if (isFunction(AppCore?.setState)) {
      AppCore.setState(
        {
          token: null,
          accessToken: null,
          access_token: null,

          user: null,
          currentUser: null,
          authUser: null,
          sessionUser: null,

          session: null,
          sessionData: null,

          authenticated: false,
          hasToken: false,
          hasRefreshToken: false,

          userSlug: null,
          homePath: AUTH_HOME.canonical,
          defaultHome: AUTH_HOME.canonical,
          postLoginTarget: null,

          role: null,
          rol: null,
          userRole: null,
          roles: [],

          isAdmin: false,
          isUser: false,
        },
        {
          source: options.source || "Auth.clearSession",
          silent: true,
          emit: false,
          forceUnauthenticated: true,
        }
      );
    }
  } catch {
    // noop
  }

  clearHttpToken();

  return true;
}

function syncAuthState() {
  try {
    if (isFunction(syncAuthStateCore)) {
      syncAuthStateCore();
    }
  } catch {
    // se normaliza abajo
  }

  const token = getToken();
  const user = getUser();

  if (!(token && user)) {
    clearSession({
      source: "Auth.syncAuthState",
      silent: true,
      emit: false,
    });

    return false;
  }

  writeSession(
    {
      token,
      user,
      session: getCurrentSession(),
    },
    {
      source: "Auth.syncAuthState",
      silent: true,
      emit: false,
    }
  );

  return true;
}

function getAuthHeader() {
  try {
    const header = safeCall(sessionGetAuthHeader);

    if (header && Object.keys(header).length) return header;
  } catch {
    // fallback abajo
  }

  const token = getToken();

  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* =========================================================
   HTTP
========================================================= */

async function httpRequest(method = "GET", path = "", body = undefined, options = {}) {
  const upper = cleanText(method, "GET").toUpperCase();

  if (isFunction(CoreHttp?.request)) {
    return CoreHttp.request(path, {
      ...options,
      method: upper,
      ...(body !== undefined ? { body } : {}),
    });
  }

  if (isFunction(AppCore?.request)) {
    return AppCore.request(path, {
      ...options,
      method: upper,
      ...(body !== undefined ? { body } : {}),
    });
  }

  throw new Error("Cliente HTTP no disponible.");
}

function httpPost(path = "", body = {}, options = {}) {
  return httpRequest("POST", path, body, options);
}

function isRefreshableAuthError(error = null) {
  try {
    if (isFunction(CoreHttp?.isRefreshableAuthError)) {
      return CoreHttp.isRefreshableAuthError(error);
    }
  } catch {
    return false;
  }

  return false;
}

function shouldClearSessionForAuthError(error = null) {
  try {
    if (isFunction(CoreHttp?.shouldClearSessionForAuthError)) {
      return CoreHttp.shouldClearSessionForAuthError(error);
    }
  } catch {
    return false;
  }

  return false;
}

/* =========================================================
   RESTORE PAYLOAD
========================================================= */

function createRestoreOptions(options = {}) {
  return {
    ...options,

    source: options.source || "Auth.restoreSession",

    persistent: true,
    restoreOnBoot: true,
    allowSilentRefresh: true,
    silentRefresh: true,

    skipNavigation: true,
    skipRedirect: true,
    noRedirect: true,
  };
}

/* =========================================================
   FLOWS
========================================================= */

async function login(credentials = {}, options = {}) {
  if (Auth.session.loginPromise) return Auth.session.loginPromise;

  Auth.session.loggingIn = true;

  Auth.session.loginPromise = (async () => {
    try {
      const raw = isFunction(loginCore)
        ? await loginCore(credentials, {
            ...options,
            skipNavigation: true,
            skipRedirect: true,
            noRedirect: true,
          })
        : await httpPost(AUTH_ENDPOINTS.login, credentials, {
            ...options,
            public: true,
            auth: false,
            skipAuth: true,
            noAuthHeader: true,
          });

      const result = applySession(raw || {}, {
        source: "Auth.login",
      });

      if (result.authenticated) {
        emit("auth:login:success", {
          authenticated: true,
          user: publicUser(getUser()),
          role: result.role,
          userSlug: result.userSlug || null,
          homePath: result.homePath,
          postLoginTarget: result.postLoginTarget,
        });
      }

      Auth.session.lastError = null;
      Auth.session.lastLoginAt = Date.now();

      return result;
    } catch (error) {
      Auth.session.lastError = safeError(error, "login");
      throw error;
    } finally {
      Auth.session.loggingIn = false;
      Auth.session.loginPromise = null;
    }
  })();

  return Auth.session.loginPromise;
}

async function handleLoginFormSubmit(form, options = {}) {
  if (isFunction(handleLoginFormSubmitCore)) {
    const raw = await handleLoginFormSubmitCore(form, {
      ...options,
      skipNavigation: true,
      skipRedirect: true,
      noRedirect: true,
    });

    if (isObject(raw)) {
      const normalized = normalizeAuthPayload(raw);

      if (normalized.authenticated) {
        return applySession(normalized, {
          source: "Auth.handleLoginFormSubmit",
        });
      }
    }

    return raw;
  }

  const FormCtor = globalThis?.HTMLFormElement;

  if (!FormCtor || !(form instanceof FormCtor)) {
    throw new Error("Formulario de login inválido.");
  }

  options.event?.preventDefault?.();

  const data = new FormData(form);

  return login(
    {
      identifier: data.get("identifier") || data.get("email") || data.get("username") || "",
      password: data.get("password") || "",
      remember: ["1", "on", "true"].includes(String(data.get("remember") || "").toLowerCase()),
    },
    options
  );
}

async function restoreSession(options = {}) {
  if (Auth.session.restorePromise) return Auth.session.restorePromise;

  Auth.session.restoring = true;

  Auth.session.restorePromise = (async () => {
    try {
      const raw = isFunction(restoreSessionCore)
        ? await restoreSessionCore(createRestoreOptions(options))
        : null;

      if (raw) {
        const normalized = normalizeAuthPayload(raw);

        if (normalized.authenticated) {
          applySession(normalized, {
            source: "Auth.restoreSession",
          });
        } else {
          syncAuthState();
        }
      } else {
        syncAuthState();
      }

      Auth.session.lastError = null;
      Auth.session.lastRestoreAt = Date.now();

      return buildSessionSnapshotSafe();
    } catch (error) {
      Auth.session.lastError = safeError(error, "restore");

      if (shouldClearSessionForAuthError(error)) {
        clearSession({
          source: "Auth.restoreSession.error",
          silent: true,
          emit: false,
        });
      } else {
        syncAuthState();
      }

      return buildSessionSnapshotSafe();
    } finally {
      Auth.session.restoring = false;
      Auth.session.restorePromise = null;
    }
  })();

  return Auth.session.restorePromise;
}

async function refreshSession(options = {}) {
  if (Auth.session.refreshPromise) return Auth.session.refreshPromise;

  Auth.session.refreshing = true;

  Auth.session.refreshPromise = (async () => {
    try {
      const body = isObject(options.body) ? options.body : {};

      const raw = isFunction(restoreRefreshSessionCore)
        ? await restoreRefreshSessionCore({
            ...options,
            body,
            skipNavigation: true,
            skipRedirect: true,
            noRedirect: true,
          })
        : isFunction(CoreHttp?.refreshSession)
          ? await CoreHttp.refreshSession(body, options)
          : await httpPost(AUTH_ENDPOINTS.refresh, body, {
              ...options,
              public: true,
              auth: false,
              skipAuth: true,
              noAuthHeader: true,
            });

      const result = applySession(raw || {}, {
        source: "Auth.refreshSession",
      });

      Auth.session.lastError = null;
      Auth.session.lastRefreshAt = Date.now();

      return result;
    } catch (error) {
      Auth.session.lastError = safeError(error, "refresh");

      if (shouldClearSessionForAuthError(error)) {
        clearSession({
          source: "Auth.refreshSession.error",
          silent: true,
          emit: false,
        });
      }

      throw error;
    } finally {
      Auth.session.refreshing = false;
      Auth.session.refreshPromise = null;
    }
  })();

  return Auth.session.refreshPromise;
}

async function fetchMe(options = {}) {
  if (Auth.session.mePromise) return Auth.session.mePromise;

  Auth.session.checking = true;

  Auth.session.mePromise = (async () => {
    try {
      const raw = isFunction(CoreHttp?.me)
        ? await CoreHttp.me(options)
        : await httpRequest("GET", AUTH_ENDPOINTS.me, undefined, {
            ...options,
            auth: true,
            public: false,
            skipAuth: false,
            noAuthHeader: false,
          });

      const result = applySession(raw || {}, {
        source: "Auth.me",
      });

      Auth.session.lastError = null;
      Auth.session.lastMeAt = Date.now();

      return result;
    } catch (error) {
      Auth.session.lastError = safeError(error, "me");

      if (shouldClearSessionForAuthError(error)) {
        clearSession({
          source: "Auth.me.error",
          silent: true,
          emit: false,
        });
      }

      throw error;
    } finally {
      Auth.session.checking = false;
      Auth.session.mePromise = null;
    }
  })();

  return Auth.session.mePromise;
}

async function logout(options = {}) {
  try {
    if (isFunction(logoutCore)) {
      await logoutCore({
        ...options,
        skipNavigation: true,
        skipRedirect: true,
        noRedirect: true,
      });
    } else {
      await httpPost(AUTH_ENDPOINTS.logout, {}, {
        ...options,
        auth: true,
        public: false,
        skipAuth: false,
        noAuthHeader: false,
      });
    }
  } catch {
    // Logout remoto best-effort.
  }

  clearSession({
    source: "Auth.logout",
  });

  emit("auth:logout:success", {
    authenticated: false,
  });

  return true;
}

/* =========================================================
   GUARDS
========================================================= */

function guardAuthenticated(...args) {
  if (isFunction(guardAuthenticatedCore)) return guardAuthenticatedCore(...args);

  return isAuthenticated()
    ? { ok: true, allowed: true }
    : {
        ok: false,
        allowed: false,
        redirectTo: AUTH_ROUTES.login,
        code: "AUTH_REQUIRED",
        status: 401,
      };
}

function guardGuest(...args) {
  if (isFunction(guardGuestCore)) return guardGuestCore(...args);

  return isAuthenticated()
    ? {
        ok: false,
        allowed: false,
        redirectTo: getDefaultHome(),
        code: "GUEST_ONLY",
      }
    : { ok: true, allowed: true };
}

function guardRole(role = "user", ...args) {
  if (isFunction(guardRoleCore)) return guardRoleCore(role, ...args);

  return hasRole(role)
    ? { ok: true, allowed: true }
    : {
        ok: false,
        allowed: false,
        code: "AUTH_FORBIDDEN",
        status: 403,
      };
}

function guardAdmin(...args) {
  if (isFunction(guardAdminCore)) return guardAdminCore(...args);
  return guardRole("admin");
}

function canAccessRoute(route = {}) {
  if (isFunction(canAccessRouteCore)) return canAccessRouteCore(route);

  if (route?.public === true) return true;
  if (route?.guestOnly === true) return !isAuthenticated();
  if (route?.requiresAuth !== false && !isAuthenticated()) return false;

  const roles = Array.isArray(route?.roles)
    ? route.roles.map(cleanRole).filter(Boolean)
    : [];

  if (!roles.length) return true;
  if (getRole() === "admin") return true;

  return roles.includes(getRole());
}

function buildGuardErrorPayload(error = {}) {
  if (isFunction(buildGuardErrorPayloadCore)) return buildGuardErrorPayloadCore(error);

  return {
    ok: false,
    allowed: false,
    code: error?.code || "AUTH_ERROR",
    status: error?.status || 401,
    message: redact(error?.message || "No autorizado."),
  };
}

function getAuthGuardsSnapshot() {
  if (isFunction(getAuthGuardsSnapshotCore)) return getAuthGuardsSnapshotCore();

  return {
    version: AUTH_MODULE_VERSION,
    authenticated: isAuthenticated(),
    role: getRole(),
    roles: getRoles(),
  };
}

/* =========================================================
   PUBLIC FLOWS
========================================================= */

async function activateAccount(payload = {}, options = {}) {
  const raw = isFunction(activateAccountCore)
    ? await activateAccountCore(payload, options)
    : await httpPost(AUTH_ENDPOINTS.activate, payload, {
        ...options,
        auth: false,
        public: true,
        skipAuth: true,
        noAuthHeader: true,
      });

  const normalized = normalizeAuthPayload(raw);

  if (normalized.authenticated) {
    return applySession(normalized, {
      source: "Auth.activateAccount",
    });
  }

  return sanitizePayload(raw);
}

function validateActivationToken(payload = {}, options = {}) {
  if (!isFunction(validateActivationTokenCore)) {
    return Promise.resolve({
      ok: false,
      valid: false,
      reason: "VALIDATION_ENDPOINT_NOT_AVAILABLE",
    });
  }

  return validateActivationTokenCore(payload, options);
}

function requestPasswordReset(payload = {}, options = {}) {
  return isFunction(requestPasswordResetCore)
    ? requestPasswordResetCore(payload, options)
    : httpPost(AUTH_ENDPOINTS.requestPasswordReset, payload, {
        ...options,
        auth: false,
        public: true,
        skipAuth: true,
        noAuthHeader: true,
      });
}

async function confirmResetPassword(payload = {}, options = {}) {
  const raw = isFunction(confirmResetPasswordCore)
    ? await confirmResetPasswordCore(payload, options)
    : await httpPost(AUTH_ENDPOINTS.confirmPasswordReset, payload, {
        ...options,
        auth: false,
        public: true,
        skipAuth: true,
        noAuthHeader: true,
      });

  const normalized = normalizeAuthPayload(raw);

  if (normalized.authenticated) {
    return applySession(normalized, {
      source: "Auth.confirmResetPassword",
    });
  }

  return sanitizePayload(raw);
}

function validateResetPasswordToken(payload = {}, options = {}) {
  if (!isFunction(validateResetPasswordTokenCore)) {
    return Promise.resolve({
      ok: false,
      valid: false,
      reason: "VALIDATION_ENDPOINT_NOT_AVAILABLE",
    });
  }

  return validateResetPasswordTokenCore(payload, options);
}

function authApiRequest(method = "GET", path = "", body = undefined, options = {}) {
  return httpRequest(method, path, body, options);
}

/* =========================================================
   SNAPSHOT
========================================================= */

function buildSessionSnapshotSafe() {
  try {
    if (isFunction(sessionBuildSnapshot)) {
      const snapshot = sessionBuildSnapshot();

      return {
        ...sanitizePayload(snapshot),
        token: null,
        accessToken: null,
        access_token: null,
        refreshToken: null,
        refresh_token: null,

        user: publicUser(getUser()),

        userSlug: getUserSlug() || null,
        homePath: getDefaultHome(),
        defaultHome: getDefaultHome(),

        role: getRole() || null,
        roles: getRoles(),

        authenticated: isAuthenticated(),
        hasToken: hasValidToken(),
        hasUser: Boolean(getUser()),
        hasSession: Boolean(getCurrentSession()),
      };
    }
  } catch {
    // fallback abajo
  }

  const user = getUser();
  const homePath = buildUserHomePath(user);

  return {
    authenticated: isAuthenticated(),
    hasToken: hasValidToken(),
    hasUser: Boolean(user),
    hasSession: Boolean(getCurrentSession()),

    user: publicUser(user),

    userSlug: extractUserSlug(user) || null,
    homePath,
    defaultHome: homePath,

    role: getRole(),
    roles: getRoles(),

    token: null,
    accessToken: null,
    refreshToken: null,
    refresh_token: null,
  };
}

function getSessionDebugSnapshotSafe() {
  try {
    if (isFunction(sessionDebugSnapshot)) {
      const snapshot = sessionDebugSnapshot();

      return {
        ...sanitizePayload(snapshot),
        token: null,
        accessToken: null,
        access_token: null,
        refreshToken: null,
        refresh_token: null,
        user: publicUser(getUser()),
      };
    }
  } catch {
    // fallback abajo
  }

  return buildSessionSnapshotSafe();
}

function getAuthModuleSnapshot() {
  const user = getUser();
  const slug = extractUserSlug(user);
  const homePath = buildUserHomePath(user);

  return {
    version: AUTH_MODULE_VERSION,

    authenticated: isAuthenticated(),
    hasToken: hasValidToken(),
    hasUser: Boolean(user),
    hasSession: Boolean(getCurrentSession()),

    token: null,
    accessToken: null,
    access_token: null,
    refreshToken: null,
    refresh_token: null,

    user: publicUser(user),

    userSlug: slug || null,
    homePath,
    defaultHome: homePath,
    postLoginTarget: getPostLoginTarget(),

    role: getRole() || null,
    roles: getRoles(),
    isAdmin: isAdmin(),

    session: {
      loggingIn: Auth.session.loggingIn,
      restoring: Auth.session.restoring,
      checking: Auth.session.checking,
      refreshing: Auth.session.refreshing,
      lastError: Auth.session.lastError,
    },

    policy: {
      strictAuth: true,
      requiresTokenAndUsableUser: true,

      delegatesUserNormalizationToSession: true,
      avatarNormalizationOwner: "features/auth/session.js",

      persistentSession: true,
      restoreRequestsSilentRefresh: true,
      tokenExpiredDoesNotMeanLogout: true,

      initOnlyAttachesAuth: true,
      restoreOwnsBootstrapSession: true,
      userSlugHome: true,

      roles: ["admin", "user"],

      noRouter: true,
      noToast: true,
      noFetchOwn: true,
      noStorageParallel: true,
      noRefreshTokenExposure: true,
      noHomeRoute: true,
      no2fa: true,
      noMfa: true,
      noOtp: true,

      snapshotRedacted: true,
    },
  };
}

/* =========================================================
   CORE BRIDGE
========================================================= */

function attachToCore(api) {
  try {
    AppCore.Auth = api;
    AppCore.auth = api;
    AppCore.modules?.register?.("auth", api);
  } catch {
    // noop
  }

  return true;
}

function init() {
  attachToCore(Auth);
  return Auth;
}

/* =========================================================
   AUTH SINGLETON
========================================================= */

export const Auth = {
  version: AUTH_MODULE_VERSION,

  AUTH_ENDPOINTS,
  AUTH_ROUTES,
  AUTH_HOME,

  session: {
    loggingIn: false,
    restoring: false,
    checking: false,
    refreshing: false,

    loginPromise: null,
    restorePromise: null,
    refreshPromise: null,
    mePromise: null,

    lastLoginAt: null,
    lastRestoreAt: null,
    lastRefreshAt: null,
    lastMeAt: null,
    lastError: null,
  },

  init,

  getUser,
  getCurrentUser: getUser,
  getProfile: getUser,

  getCurrentSession,
  getSession: getCurrentSession,

  getToken,
  getAccessToken,
  hasValidToken,
  isAuthenticated,

  getRole,
  getRoles,
  getCurrentRole: getRole,
  getCurrentRoles: getRoles,
  getPermissions,

  isAdmin,
  isCurrentUserAdmin: isAdmin,

  hasRole,
  requireRole,

  normalizeSlug,
  normalizeUser,
  normalizeAuthPayload,

  extractUserSlug,
  getUserSlug,

  buildUserHomePath,
  buildUserHomePathFromSlug,
  getDefaultHome,
  getPostLoginTarget,
  isUserHomePath,

  login,
  logout,
  handleLoginFormSubmit,

  restoreSession,
  refreshSession,

  fetchMe,
  me: fetchMe,

  applySession,
  clearSession,
  syncAuthState,

  getAuthHeader,
  buildSessionSnapshot: buildSessionSnapshotSafe,
  getSessionDebugSnapshot: getSessionDebugSnapshotSafe,

  guardAuthenticated,
  guardGuest,
  guardRole,
  guardAdmin,

  requireAuth: guardAuthenticated,
  requireGuest: guardGuest,

  requireAdmin: guardAdmin,

  canAccessRoute,

  buildGuardErrorPayload,
  getAuthGuardsSnapshot,

  activateAccount,
  validateActivationToken,

  requestPasswordReset,
  confirmResetPassword,
  validateResetPasswordToken,

  authApiRequest,

  getAuthModuleSnapshot,
  getSnapshot: getAuthModuleSnapshot,
  getDebugSnapshot: getAuthModuleSnapshot,
};

export default Auth;
