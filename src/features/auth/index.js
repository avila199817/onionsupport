/* =========================================================
   Onion Support - Auth Facade
   Archivo: /src/features/auth/index.js

   Responsabilidad:
   - Fachada pública mínima de Auth.
   - Delegar login/restore/logout/session/guards.
   - HTTP delegado en CoreHttp/AppCore.
   - Normalizar usuario autenticado.
   - Exponer home privada por slug: /@{user.slug}.
   - Sin Router.
   - Sin Toast.
   - Sin fetch propio.
   - Sin storage paralelo.
   - Sin rutas inventadas.
   - Sin /home.
   - Sin 2FA/MFA/OTP.
   - Roles únicos: admin / user.
   - Auth estricta: token usable + user usable.
========================================================= */

import { AppCore } from "../../core/index.js";
import * as CoreHttpModule from "../../core/http.js";

import * as LoginApi from "./login.js";
import * as RestoreApi from "./restore.js";
import * as LogoutApi from "./logout.js";
import * as SessionApi from "./session.js";
import * as GuardsApi from "./guards.js";
import * as ActivationApi from "./activation.js";
import * as PasswordResetApi from "./password-reset.js";

export const AUTH_MODULE_VERSION = "auth.facade.v2";

export const AUTH_ENDPOINTS = Object.freeze({
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  me: "/api/auth/me",
  refresh: "/api/auth/refresh",
  activate: "/api/auth/activate",
  requestPasswordReset: "/api/auth/reset-password-request",
  confirmPasswordReset: "/api/auth/reset-password-confirm",
});

export const AUTH_ROUTES = Object.freeze({
  login: "/login",
  passwordRequest: "/password-request",
  passwordReset: "/password-reset",
  activateAccount: "/activate-account",
});

export const AUTH_HOME = Object.freeze({
  canonical: "/",
  userPrefix: "/@",
});

const VALID_ROLES = Object.freeze(["admin", "user"]);

const CoreHttp =
  CoreHttpModule.default ||
  CoreHttpModule.Http ||
  CoreHttpModule.http ||
  CoreHttpModule;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function cleanRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(cleanRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "user";
  }

  return String(value || "").toLowerCase() === "admin" ? "admin" : "user";
}

function stripBearer(value = "") {
  return text(value, "").replace(/^Bearer\s+/i, "");
}

function tokenOk(value = "") {
  const token = stripBearer(value);

  if (!token) return false;
  if (/\s/.test(token)) return false;

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

function pickFn(moduleApi = {}, ...names) {
  for (const name of names.flat().filter(Boolean)) {
    if (isFn(moduleApi?.[name])) return moduleApi[name];

    if (isObject(moduleApi?.default) && isFn(moduleApi.default[name])) {
      return moduleApi.default[name].bind(moduleApi.default);
    }

    if (name === "default" && isFn(moduleApi?.default)) {
      return moduleApi.default;
    }
  }

  return null;
}

function state() {
  return isObject(AppCore?.state) ? AppCore.state : {};
}

function emit(eventName = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(eventName, {
      source: "Auth",
      version: AUTH_MODULE_VERSION,
      ...payload,
      token: null,
      accessToken: null,
      refreshToken: null,
    });

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SLUG / HOME
========================================================= */

function normalizeSlug(value = "") {
  const slug = text(value, "")
    .replace(/^\/+/, "")
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();

  if (!slug) return "";

  return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
}

function extractUserSlug(user = null) {
  if (!isObject(user)) return "";

  return normalizeSlug(
    user.slug ||
      user.lookup?.slug ||
      user.profile?.slug ||
      ""
  );
}

function buildUserHomePathFromSlug(slug = "") {
  const clean = normalizeSlug(slug);
  return clean ? `${AUTH_HOME.userPrefix}${clean}` : AUTH_HOME.canonical;
}

function buildUserHomePath(user = null) {
  return buildUserHomePathFromSlug(extractUserSlug(user));
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

function isUserHomePath(path = "") {
  return /^\/@[a-z0-9][a-z0-9._-]{0,95}$/i.test(normalizePath(path));
}

/* =========================================================
   USER / TOKEN
========================================================= */

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  const status = text(user.status || user.estado, "").toLowerCase();

  return Boolean(
    user.disabled === true ||
      user.deleted === true ||
      user.archived === true ||
      user.active === false ||
      status === "disabled" ||
      status === "deleted" ||
      status === "archived"
  );
}

function userOk(user = null) {
  if (userDisabled(user)) return false;

  return Boolean(
    text(user.id, "") ||
      text(user.userId, "") ||
      text(user.username, "") ||
      text(user.slug, "") ||
      text(user.lookup?.slug, "")
  );
}

function normalizeUser(user = null) {
  if (!userOk(user)) return null;

  const id = text(user.userId || user.id, "");
  const slug = extractUserSlug(user);

  const profile = isObject(user.profile) ? user.profile : {};

  const username = text(
    user.username ||
      user.userName ||
      user.user_name ||
      slug ||
      id,
    ""
  );

  const displayName = text(
    user.displayName ||
      user.fullName ||
      user.name ||
      user.nombre ||
      profile.displayName ||
      profile.fullName ||
      profile.name ||
      profile.nombre ||
      username ||
      id,
    "Usuario"
  );

  const role = cleanRole(user.role || user.rol || user.roles);

  return {
    ...user,

    id: id || null,
    userId: text(user.userId || id, "") || null,

    username: username || null,
    slug: slug || null,

    name: user.name || displayName,
    fullName: user.fullName || displayName,
    displayName,

    email: user.email || null,

    role,
    rol: role,
    roles: [role],

    active: true,
    disabled: false,
  };
}

function getToken() {
  const value =
    sessionGetCurrentToken?.() ||
    CoreHttp?.getAccessToken?.() ||
    state().token ||
    state().accessToken ||
    state().access_token ||
    state().session?.token ||
    state().session?.accessToken ||
    "";

  return tokenOk(value) ? stripBearer(value) : null;
}

function getAccessToken() {
  return getToken();
}

function hasValidToken() {
  return Boolean(getToken());
}

function getUser() {
  const user =
    sessionGetCurrentUser?.() ||
    state().user ||
    state().currentUser ||
    state().sessionUser ||
    state().authUser ||
    state().session?.user ||
    state().auth?.user ||
    null;

  return normalizeUser(user);
}

function getRole() {
  const user = getUser();

  if (!user) return "";

  return cleanRole(sessionGetCurrentRole?.() || user.role || user.rol || user.roles);
}

function getRoles() {
  if (!isAuthenticated()) return [];

  const fromSession = sessionGetCurrentRoles?.();

  if (Array.isArray(fromSession) && fromSession.length) {
    const roles = fromSession
      .map(cleanRole)
      .filter((role) => VALID_ROLES.includes(role));

    return roles.includes("admin") ? ["admin"] : ["user"];
  }

  const role = getRole();
  return role ? [role] : [];
}

function isAuthenticated() {
  const strict = Boolean(getToken() && getUser());

  if (!strict) return false;

  try {
    return sessionIsAuthenticated?.() === false ? false : strict;
  } catch {
    return strict;
  }
}

function isAdmin() {
  return isAuthenticated() && getRole() === "admin";
}

function hasRole(role = "") {
  return isAuthenticated() && getRoles().includes(cleanRole(role));
}

function requireRole(role = "") {
  if (hasRole(role)) return true;

  const error = new Error("No tienes permisos para acceder a este recurso.");
  error.code = "AUTH_FORBIDDEN";
  error.status = 403;
  throw error;
}

function getPermissions() {
  return [];
}

/* =========================================================
   DELEGATES
========================================================= */

const loginCore = pickFn(LoginApi, "login", "default");
const handleLoginFormSubmitCore = pickFn(LoginApi, "handleLoginFormSubmit");

const restoreSessionCore = pickFn(RestoreApi, "restoreSession", "restore", "default");
const logoutCore = pickFn(LogoutApi, "logout", "default");

const sessionApplySession = pickFn(SessionApi, "applySession");
const sessionClearSession = pickFn(SessionApi, "clearSessionLocal", "clearSession");
const sessionBuildSnapshot = pickFn(SessionApi, "buildSessionSnapshot");
const sessionIsAuthenticated = pickFn(SessionApi, "isAuthenticated");
const sessionGetCurrentUser = pickFn(SessionApi, "getCurrentUser");
const sessionGetCurrentToken = pickFn(SessionApi, "getCurrentToken");
const sessionGetCurrentRole = pickFn(SessionApi, "getCurrentRole");
const sessionGetCurrentRoles = pickFn(SessionApi, "getCurrentRoles");
const sessionGetAuthHeader = pickFn(SessionApi, "getAuthHeader");
const sessionDebugSnapshot = pickFn(SessionApi, "getSessionDebugSnapshot");

const guardAuthenticatedCore = pickFn(GuardsApi, "guardAuthenticated", "requireAuth");
const guardGuestCore = pickFn(GuardsApi, "guardGuest", "requireGuest");
const guardRoleCore = pickFn(GuardsApi, "guardRole", "requireRole");
const guardAdminCore = pickFn(GuardsApi, "guardAdmin", "requireAdmin");
const canAccessRouteCore = pickFn(GuardsApi, "canAccessRoute", "canAccess");
const syncAuthStateCore = pickFn(GuardsApi, "syncAuthState");
const buildGuardErrorPayloadCore = pickFn(GuardsApi, "buildGuardErrorPayload");
const getAuthGuardsSnapshotCore = pickFn(GuardsApi, "getAuthGuardsSnapshot");

const activateAccountCore = pickFn(ActivationApi, "activateAccount", "activate");
const validateActivationTokenCore = pickFn(ActivationApi, "validateActivationToken");

const requestPasswordResetCore = pickFn(PasswordResetApi, "requestPasswordReset");
const confirmResetPasswordCore = pickFn(
  PasswordResetApi,
  "confirmResetPassword",
  "confirmPasswordReset"
);
const validateResetPasswordTokenCore = pickFn(PasswordResetApi, "validateResetPasswordToken");

/* =========================================================
   PAYLOAD
========================================================= */

function extractUser(payload = {}) {
  if (!isObject(payload)) return null;

  return (
    payload.user ||
    payload.usuario ||
    payload.me ||
    payload.account ||
    payload.profile ||
    payload.data?.user ||
    payload.data?.usuario ||
    payload.data?.me ||
    payload.auth?.user ||
    payload.auth?.usuario ||
    payload.auth?.me ||
    payload.session?.user ||
    payload.session?.usuario ||
    payload.session?.me ||
    null
  );
}

function extractToken(payload = {}) {
  if (!isObject(payload)) return "";

  return (
    payload.token ||
    payload.accessToken ||
    payload.access_token ||
    payload.data?.token ||
    payload.data?.accessToken ||
    payload.data?.access_token ||
    payload.auth?.token ||
    payload.auth?.accessToken ||
    payload.auth?.access_token ||
    payload.session?.token ||
    payload.session?.accessToken ||
    payload.session?.access_token ||
    ""
  );
}

function normalizeAuthPayload(payload = {}) {
  const token = extractToken(payload) || getToken();
  const cleanToken = tokenOk(token) ? stripBearer(token) : null;
  const user = normalizeUser(extractUser(payload) || getUser());
  const slug = extractUserSlug(user);
  const homePath = buildUserHomePath(user);
  const role = user?.role || null;

  return {
    ...payload,

    token: cleanToken,
    accessToken: cleanToken,
    access_token: cleanToken,

    user,
    currentUser: user,

    userSlug: slug || null,
    homePath,
    defaultHome: homePath,
    postLoginTarget: homePath,

    role,
    rol: role,
    roles: role ? [role] : [],

    authenticated: Boolean(cleanToken && user),
  };
}

function publicUser(user = null) {
  const normalized = normalizeUser(user);

  if (!normalized) return null;

  return {
    id: normalized.id || normalized.userId || null,
    userId: normalized.userId || normalized.id || null,
    username: normalized.username || null,
    slug: normalized.slug || null,
    displayName: normalized.displayName || null,
    role: normalized.role || null,
  };
}

/* =========================================================
   STATE
========================================================= */

function writeAuthState(patch = {}, source = "Auth.state") {
  try {
    AppCore?.setState?.(patch, {
      source,
      silent: true,
      emit: false,
    });
  } catch {
    try {
      Object.assign(state(), patch);
    } catch {
      // noop
    }
  }

  return patch;
}

function writeClearedAuthState(source = "Auth.clearSession") {
  return writeAuthState(
    {
      token: null,
      accessToken: null,
      access_token: null,

      user: null,
      currentUser: null,
      sessionUser: null,
      authUser: null,

      userSlug: null,
      homePath: AUTH_HOME.canonical,
      defaultHome: AUTH_HOME.canonical,
      postLoginTarget: null,

      authenticated: false,
      hasToken: false,

      role: null,
      rol: null,
      roles: [],

      isAdmin: false,
      isUser: false,
    },
    source
  );
}

function writeNormalizedAuthState(normalized = {}, source = "Auth.applySession") {
  const user = normalizeUser(normalized.user || normalized.currentUser);
  const token = tokenOk(normalized.token || normalized.accessToken)
    ? stripBearer(normalized.token || normalized.accessToken)
    : null;

  const role = user ? cleanRole(user.role || user.rol || user.roles) : "";
  const slug = extractUserSlug(user);
  const homePath = user ? buildUserHomePath(user) : AUTH_HOME.canonical;

  return writeAuthState(
    {
      token,
      accessToken: token,
      access_token: token,

      user,
      currentUser: user,

      userSlug: slug || null,
      homePath,
      defaultHome: homePath,
      postLoginTarget: user ? homePath : null,

      authenticated: Boolean(token && user),
      hasToken: Boolean(token),

      role: role || null,
      rol: role || null,
      roles: role ? [role] : [],

      isAdmin: role === "admin",
      isUser: role === "user",
    },
    source
  );
}

/* =========================================================
   SESSION
========================================================= */

function syncHttpToken(token = "", payload = {}) {
  try {
    if (token && isFn(CoreHttp?.setAuthTokens)) {
      CoreHttp.setAuthTokens({
        ...payload,
        token,
        accessToken: token,
        access_token: token,
      });
      return true;
    }

    if (token && isFn(CoreHttp?.setAccessToken)) {
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
    if (isFn(CoreHttp?.clearAuthTokens)) {
      CoreHttp.clearAuthTokens();
      return true;
    }

    if (isFn(CoreHttp?.setAccessToken)) {
      CoreHttp.setAccessToken(null);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function patchAuthStateFromCurrentSession() {
  const user = getUser();
  const token = getToken();

  if (!token || !user) {
    writeClearedAuthState("Auth.syncAuthState");
    return true;
  }

  writeNormalizedAuthState(
    {
      token,
      user,
    },
    "Auth.syncAuthState"
  );

  return true;
}

function syncAuthState() {
  try {
    if (isFn(syncAuthStateCore)) {
      syncAuthStateCore();
    }
  } catch {
    // fallback abajo
  }

  patchAuthStateFromCurrentSession();

  return true;
}

function applySession(payload = {}, options = {}) {
  const normalized = normalizeAuthPayload(payload);

  try {
    if (isFn(sessionApplySession)) {
      sessionApplySession(normalized, {
        source: options.source || "Auth.applySession",
        ...options,
      });
    } else if (isFn(AppCore?.applySession)) {
      AppCore.applySession(normalized, {
        source: options.source || "Auth.applySession",
      });
    }
  } catch {
    // seguimos escribiendo estado propio abajo
  }

  syncHttpToken(normalized.token, normalized);
  writeNormalizedAuthState(normalized, options.source || "Auth.applySession");
  syncAuthState();

  const user = getUser();
  const homePath = buildUserHomePath(user);

  return {
    ...normalized,
    authenticated: isAuthenticated(),
    user,
    currentUser: user,
    userSlug: extractUserSlug(user) || null,
    homePath,
    defaultHome: homePath,
    postLoginTarget: homePath,
    role: getRole() || null,
    roles: getRoles(),
  };
}

function clearSession(options = {}) {
  try {
    if (isFn(sessionClearSession)) {
      sessionClearSession({
        source: "Auth.clearSession",
        ...options,
      });
    } else if (isFn(AppCore?.clearSession)) {
      AppCore.clearSession({
        source: "Auth.clearSession",
      });
    }
  } catch {
    // noop
  }

  clearHttpToken();
  writeClearedAuthState(options.source || "Auth.clearSession");

  return true;
}

function getAuthHeader() {
  try {
    const header = sessionGetAuthHeader?.();

    if (header && Object.keys(header).length) return header;
  } catch {
    // noop
  }

  const token = getToken();

  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* =========================================================
   HTTP
========================================================= */

async function httpRequest(method = "GET", path = "", body = undefined, options = {}) {
  const upper = text(method, "GET").toUpperCase();

  if (isFn(CoreHttp?.request)) {
    return CoreHttp.request(path, {
      ...options,
      method: upper,
      ...(body !== undefined ? { body } : {}),
    });
  }

  const methodName = upper === "DELETE" ? "delete" : upper.toLowerCase();

  if (isFn(CoreHttp?.[methodName])) {
    if (["GET", "HEAD", "OPTIONS", "DELETE"].includes(upper)) {
      return CoreHttp[methodName](path, options);
    }

    return CoreHttp[methodName](path, body, options);
  }

  if (isFn(AppCore?.request)) {
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

/* =========================================================
   CORE FLOWS
========================================================= */

async function login(credentials = {}, options = {}) {
  if (Auth.session.loginPromise) return Auth.session.loginPromise;

  Auth.session.loggingIn = true;

  Auth.session.loginPromise = (async () => {
    try {
      const raw = isFn(loginCore)
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
          });

      const result = applySession(raw || {}, {
        source: "Auth.login",
      });

      if (result.authenticated) {
        emit("auth:login:success", {
          authenticated: true,
          user: publicUser(result.user),
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
      Auth.session.lastError = {
        type: "login",
        message: error?.message || String(error),
        at: new Date().toISOString(),
      };

      throw error;
    } finally {
      Auth.session.loggingIn = false;
      Auth.session.loginPromise = null;
    }
  })();

  return Auth.session.loginPromise;
}

async function handleLoginFormSubmit(form, options = {}) {
  if (isFn(handleLoginFormSubmitCore)) {
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

  if (!isBrowser() || !(form instanceof HTMLFormElement)) {
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
      const raw = isFn(restoreSessionCore)
        ? await restoreSessionCore({
            ...options,
            skipNavigation: true,
            skipRedirect: true,
            noRedirect: true,
          })
        : null;

      if (raw) {
        applySession(raw, {
          source: "Auth.restoreSession",
        });
      } else {
        syncAuthState();
      }

      Auth.session.lastError = null;
      Auth.session.lastRestoreAt = Date.now();

      return buildSessionSnapshotSafe();
    } catch (error) {
      Auth.session.lastError = {
        type: "restore",
        message: error?.message || String(error),
        at: new Date().toISOString(),
      };

      clearSession({
        source: "Auth.restoreSession.error",
      });

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
      const raw = isFn(CoreHttp?.refreshSession)
        ? await CoreHttp.refreshSession(options)
        : isFn(CoreHttp?.refresh)
          ? await CoreHttp.refresh({}, options)
          : await httpPost(AUTH_ENDPOINTS.refresh, {}, {
              ...options,
              public: true,
              auth: false,
              skipAuth: true,
            });

      const result = applySession(raw || {}, {
        source: "Auth.refreshSession",
      });

      Auth.session.lastError = null;
      Auth.session.lastRefreshAt = Date.now();

      return result;
    } catch (error) {
      Auth.session.lastError = {
        type: "refresh",
        message: error?.message || String(error),
        at: new Date().toISOString(),
      };

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
      const raw = isFn(CoreHttp?.me)
        ? await CoreHttp.me(options)
        : await httpRequest("GET", AUTH_ENDPOINTS.me, undefined, {
            ...options,
            auth: true,
            public: false,
            skipAuth: false,
          });

      const result = applySession(raw || {}, {
        source: "Auth.me",
      });

      Auth.session.lastError = null;
      Auth.session.lastMeAt = Date.now();

      return result;
    } catch (error) {
      Auth.session.lastError = {
        type: "me",
        message: error?.message || String(error),
        at: new Date().toISOString(),
      };

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
    if (isFn(logoutCore)) {
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
   ROUTES
========================================================= */

function normalizePath(path = "/") {
  let value = text(path, "/").split("?")[0].split("#")[0];

  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1) value = value.replace(/\/+$/g, "");

  return value || "/";
}

function getCurrentPublicPath() {
  if (!isBrowser()) return "/";

  return `${window.location.pathname}${window.location.search}${window.location.hash}` || "/";
}

function getCurrentCanonicalPath(path = getCurrentPublicPath()) {
  const normalized = normalizePath(path);

  return isUserHomePath(normalized) ? AUTH_HOME.canonical : normalized;
}

function isAuthRoute(path = getCurrentPublicPath()) {
  return getCurrentCanonicalPath(path) === AUTH_ROUTES.login;
}

function isPasswordRequestRoute(path = getCurrentPublicPath()) {
  return getCurrentCanonicalPath(path) === AUTH_ROUTES.passwordRequest;
}

function isPasswordResetRoute(path = getCurrentPublicPath()) {
  return getCurrentCanonicalPath(path) === AUTH_ROUTES.passwordReset;
}

function isActivationRoute(path = getCurrentPublicPath()) {
  return getCurrentCanonicalPath(path) === AUTH_ROUTES.activateAccount;
}

function isPublicTechnicalRoute(path = getCurrentPublicPath()) {
  return [
    AUTH_ROUTES.login,
    AUTH_ROUTES.passwordRequest,
    AUTH_ROUTES.passwordReset,
    AUTH_ROUTES.activateAccount,
  ].includes(getCurrentCanonicalPath(path));
}

function getCurrentRouteContext() {
  const publicPath = getCurrentPublicPath();
  const canonicalPath = getCurrentCanonicalPath(publicPath);

  return {
    publicPath,
    canonicalPath,
    route: canonicalPath,

    isUserHomeRoute: isUserHomePath(publicPath),

    isAuthRoute: isAuthRoute(canonicalPath),
    isPublicTechnicalRoute: isPublicTechnicalRoute(canonicalPath),
    isActivationRoute: isActivationRoute(canonicalPath),
    isPasswordResetRoute: isPasswordResetRoute(canonicalPath),
    isPasswordRequestRoute: isPasswordRequestRoute(canonicalPath),
  };
}

/* =========================================================
   GUARDS
========================================================= */

function guardAuthenticated(...args) {
  if (isFn(guardAuthenticatedCore)) return guardAuthenticatedCore(...args);

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
  if (isFn(guardGuestCore)) return guardGuestCore(...args);

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
  if (isFn(guardRoleCore)) return guardRoleCore(role, ...args);

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
  if (isFn(guardAdminCore)) return guardAdminCore(...args);
  return guardRole("admin");
}

function canAccessRoute(route = {}) {
  if (isFn(canAccessRouteCore)) return canAccessRouteCore(route);

  if (route?.public === true) return true;
  if (route?.guestOnly === true) return !isAuthenticated();
  if (route?.requiresAuth !== false && !isAuthenticated()) return false;

  const roles = Array.isArray(route?.roles) ? route.roles.map(cleanRole) : [];

  if (!roles.length) return true;
  if (getRole() === "admin") return true;

  return roles.includes(getRole());
}

function buildGuardErrorPayload(error = {}) {
  if (isFn(buildGuardErrorPayloadCore)) return buildGuardErrorPayloadCore(error);

  return {
    ok: false,
    allowed: false,
    code: error?.code || "AUTH_ERROR",
    status: error?.status || 401,
    message: error?.message || "No autorizado.",
  };
}

function getAuthGuardsSnapshot() {
  if (isFn(getAuthGuardsSnapshotCore)) return getAuthGuardsSnapshotCore();

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
  const raw = isFn(activateAccountCore)
    ? await activateAccountCore(payload, options)
    : await httpPost(AUTH_ENDPOINTS.activate, payload, {
        ...options,
        auth: false,
        public: true,
        skipAuth: true,
      });

  const normalized = normalizeAuthPayload(raw);

  if (normalized.authenticated) {
    applySession(normalized, {
      source: "Auth.activateAccount",
    });
  }

  return raw;
}

function validateActivationToken(payload = {}, options = {}) {
  if (isFn(validateActivationTokenCore)) {
    return validateActivationTokenCore(payload, options);
  }

  return Promise.resolve({
    ok: Boolean(payload?.token || payload),
  });
}

function requestPasswordReset(payload = {}, options = {}) {
  return isFn(requestPasswordResetCore)
    ? requestPasswordResetCore(payload, options)
    : httpPost(AUTH_ENDPOINTS.requestPasswordReset, payload, {
        ...options,
        auth: false,
        public: true,
        skipAuth: true,
      });
}

async function confirmResetPassword(payload = {}, options = {}) {
  const raw = isFn(confirmResetPasswordCore)
    ? await confirmResetPasswordCore(payload, options)
    : await httpPost(AUTH_ENDPOINTS.confirmPasswordReset, payload, {
        ...options,
        auth: false,
        public: true,
        skipAuth: true,
      });

  const normalized = normalizeAuthPayload(raw);

  if (normalized.authenticated) {
    applySession(normalized, {
      source: "Auth.confirmResetPassword",
    });
  }

  return raw;
}

function validateResetPasswordToken(payload = {}, options = {}) {
  if (isFn(validateResetPasswordTokenCore)) {
    return validateResetPasswordTokenCore(payload, options);
  }

  return Promise.resolve({
    ok: Boolean(payload?.token || payload),
  });
}

function authApiRequest(method = "GET", path = "", body = undefined, options = {}) {
  return httpRequest(method, path, body, options);
}

/* =========================================================
   SNAPSHOT
========================================================= */

function buildSessionSnapshotSafe() {
  try {
    if (isFn(sessionBuildSnapshot)) {
      const snapshot = sessionBuildSnapshot();

      return {
        ...snapshot,
        token: null,
        accessToken: null,
        refreshToken: null,
        user: publicUser(getUser()),
        userSlug: getUserSlug() || null,
        homePath: getDefaultHome(),
        defaultHome: getDefaultHome(),
        role: getRole() || null,
        roles: getRoles(),
        authenticated: isAuthenticated(),
        hasToken: hasValidToken(),
        hasUser: Boolean(getUser()),
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
    user: publicUser(user),
    userSlug: extractUserSlug(user) || null,
    homePath,
    defaultHome: homePath,
    role: getRole(),
    roles: getRoles(),
  };
}

function getSessionDebugSnapshotSafe() {
  try {
    if (isFn(sessionDebugSnapshot)) {
      const snapshot = sessionDebugSnapshot();

      return {
        ...snapshot,
        token: null,
        accessToken: null,
        refreshToken: null,
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

    route: getCurrentRouteContext(),
  };
}

/* =========================================================
   CORE BRIDGE
========================================================= */

function attachToCore(api) {
  try {
    AppCore.Auth = api;
    AppCore.auth = api;
    AppCore.modules?.register?.("Auth", api);
    AppCore.modules?.register?.("auth", api);
  } catch {
    // noop
  }

  return true;
}

function init() {
  attachToCore(Auth);
  syncAuthState();
  return Auth;
}

const start = init;
const boot = init;

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
  start,
  boot,

  getUser,
  getCurrentUser: getUser,
  currentUser: getUser,
  getProfile: getUser,
  getAccount: getUser,
  getSessionUser: getUser,

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

  isCurrentUserSupport: () => false,
  isCurrentUserManager: () => false,
  isCurrentUserClient: () => false,

  hasRole,
  requireRole,

  normalizeSlug,
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
  restore: restoreSession,

  refreshSession,
  refresh: refreshSession,
  refreshToken: refreshSession,

  fetchMe,
  me: fetchMe,
  loadMe: fetchMe,

  applySession,
  clearSession,
  clearSessionLocal: clearSession,
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

  canAccess: canAccessRoute,
  canAccessRoute,

  buildGuardErrorPayload,
  getAuthGuardsSnapshot,

  activateAccount,
  activate: activateAccount,
  validateActivationToken,

  requestPasswordReset,
  confirmResetPassword,
  validateResetPasswordToken,

  authApiRequest,

  getCurrentRouteContext,
  getCurrentPublicPath,
  getCurrentCanonicalPath,

  isAuthRoute,
  isPublicTechnicalRoute,
  isActivationRoute,
  isPasswordResetRoute,
  isPasswordRequestRoute,

  normalizeUser,
  normalizeAuthPayload,

  getAuthModuleSnapshot,
  getSnapshot: getAuthModuleSnapshot,
  getDebugSnapshot: getAuthModuleSnapshot,
};

attachToCore(Auth);

export default Auth;
