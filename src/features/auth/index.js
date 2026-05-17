/* =========================================================
   Onion Support - Auth Facade
   Archivo: /src/features/auth/index.js

   Responsabilidad:
   - Fachada pública mínima de Auth.
   - Login delegado en login.js.
   - Restore delegado en restore.js.
   - Logout delegado en logout.js.
   - Sesión delegada en session.js.
   - HTTP delegado en CoreHttp.
   - Guards delegados en guards.js.
   - Sin Router.
   - Sin Toast.
   - Sin fetch propio.
   - Sin storage paralelo.
   - Sin rutas inventadas.
   - Sin 2FA/MFA/OTP en esta fachada.
   - Roles únicos: admin / user.
   - Auth estricta: token + user usable.
========================================================= */

import { AppCore } from "../../core/index.js";
import CoreHttp from "../../core/http.js";

import {
  login as loginCore,
  handleLoginFormSubmit as handleLoginFormSubmitCore,
} from "./login.js";

import {
  restoreSession as restoreSessionCore,
} from "./restore.js";

import {
  logout as logoutCore,
} from "./logout.js";

import {
  applySession as applySessionCore,
  clearSessionLocal,
  buildSessionSnapshot,
  isAuthenticated as sessionIsAuthenticated,
  getCurrentUser as sessionGetCurrentUser,
  getCurrentToken as sessionGetCurrentToken,
  getCurrentRole as sessionGetCurrentRole,
  getCurrentRoles as sessionGetCurrentRoles,
  getAuthHeader as sessionGetAuthHeader,
  getSessionDebugSnapshot,
} from "./session.js";

import {
  guardAuthenticated,
  guardRole,
  guardGuest,
  guardAdmin,
  canAccessRoute,
  syncAuthState,
  buildGuardErrorPayload,
  getAuthGuardsSnapshot,
} from "./guards.js";

import * as ActivationApi from "./activation.js";
import * as PasswordResetApi from "./password-reset.js";

export const AUTH_MODULE_VERSION = "simple";

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
  passwordReset: "/password-reset",
  passwordRequest: "/password-request",
  activateAccount: "/activate-account",
});

const VALID_ROLES = Object.freeze(["admin", "user"]);

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
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
  return String(value).toLowerCase() === "admin" ? "admin" : "user";
}

function stripBearer(value = "") {
  return text(value, "").replace(/^Bearer\s+/i, "");
}

function tokenOk(value = "") {
  const token = stripBearer(value);

  if (!token) return false;
  if (/\s/.test(token)) return false;

  return !["null", "undefined", "false", "true", "[object object]"].includes(
    token.toLowerCase()
  );
}

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  return (
    user.disabled === true ||
    String(user.status || "").toLowerCase() === "disabled"
  );
}

function userOk(user = null) {
  if (!isObject(user)) return false;
  if (userDisabled(user)) return false;

  return Boolean(
    user.id ||
      user.userId ||
      user.username ||
      user.slug ||
      user.email
  );
}

function normalizeUserForAuth(user = null) {
  if (!userOk(user)) return null;

  const id = user.userId || user.id || null;
  const username = user.username || user.slug || user.email || id || null;

  const displayName =
    user.name ||
    user.fullName ||
    user.displayName ||
    user.nombre ||
    username ||
    user.email ||
    id ||
    "Usuario";

  const role = cleanRole(user.role || user.rol);

  return {
    ...user,

    id,
    userId: user.userId || id,

    username,
    slug: user.slug || username,

    name: user.name || displayName,
    fullName: user.fullName || displayName,
    displayName,

    email: user.email || null,

    role,
    rol: role,
    roles: [role],

    avatar: user.avatar || user.avatarUrl || user.picture || null,
    avatarUrl: user.avatarUrl || user.avatar || user.picture || null,
    picture: user.picture || user.avatarUrl || user.avatar || null,
    hasAvatar: Boolean(user.avatar || user.avatarUrl || user.picture),

    active: true,
    disabled: false,
  };
}

function readState() {
  return isObject(AppCore?.state) ? AppCore.state : {};
}

function getToken() {
  const fromSession = isFunction(sessionGetCurrentToken)
    ? sessionGetCurrentToken()
    : "";

  const fromHttp = isFunction(CoreHttp?.getAccessToken)
    ? CoreHttp.getAccessToken()
    : "";

  const state = readState();

  const token =
    fromSession ||
    fromHttp ||
    state.token ||
    state.accessToken ||
    state.access_token ||
    "";

  return tokenOk(token) ? stripBearer(token) : null;
}

function getAccessToken() {
  return getToken();
}

function hasValidToken() {
  return Boolean(getToken());
}

function getUser() {
  const state = readState();

  const user =
    (isFunction(sessionGetCurrentUser) ? sessionGetCurrentUser() : null) ||
    state.user ||
    state.currentUser ||
    state.sessionUser ||
    state.authUser ||
    null;

  return normalizeUserForAuth(user);
}

function getCurrentUser() {
  return getUser();
}

function currentUser() {
  return getUser();
}

function getProfile() {
  return getUser();
}

function getAccount() {
  return getUser();
}

function getSessionUser() {
  return getUser();
}

function isAuthenticated() {
  const strict = Boolean(getToken() && getUser());

  if (!strict) return false;

  try {
    return sessionIsAuthenticated() === false ? false : strict;
  } catch {
    return strict;
  }
}

function getRole() {
  const user = getUser();

  if (!user) return "";

  const role =
    (isFunction(sessionGetCurrentRole) ? sessionGetCurrentRole() : "") ||
    user.role ||
    user.rol ||
    "user";

  return cleanRole(role);
}

function getRoles() {
  if (!isAuthenticated()) return [];

  const role = getRole();

  return role ? [role] : [];
}

function getPermissions() {
  return [];
}

function isAdmin() {
  return getRole() === "admin";
}

function hasRole(role = "") {
  const requested = cleanRole(role);

  return isAuthenticated() && getRoles().includes(requested);
}

function requireRole(role = "") {
  if (!hasRole(role)) {
    const error = new Error("No tienes permisos para acceder a este recurso.");
    error.code = "AUTH_FORBIDDEN";
    error.status = 403;
    throw error;
  }

  return true;
}

function emit(eventName = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(eventName, {
      source: "Auth",
      version: AUTH_MODULE_VERSION,
      ...payload,
    });
    return true;
  } catch {
    return false;
  }
}

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
  const user = normalizeUserForAuth(extractUser(payload) || getUser());

  return {
    ...payload,
    token: tokenOk(token) ? stripBearer(token) : null,
    accessToken: tokenOk(token) ? stripBearer(token) : null,
    access_token: tokenOk(token) ? stripBearer(token) : null,
    user,
    role: user?.role || null,
    roles: user?.role ? [user.role] : [],
    authenticated: Boolean(tokenOk(token) && user),
  };
}

/* =========================================================
   SESSION
========================================================= */

function applySession(payload = {}, options = {}) {
  const normalized = normalizeAuthPayload(payload);

  let result = normalized;

  try {
    result = applySessionCore(normalized, {
      source: options.source || "Auth.applySession",
      ...options,
    });
  } catch {
    try {
      AppCore?.applySession?.(normalized, {
        source: options.source || "Auth.applySession",
      });
    } catch {
      // noop
    }
  }

  try {
    if (normalized.token) {
      CoreHttp?.setAuthTokens?.(normalized);
    }
  } catch {
    // noop
  }

  try {
    syncAuthState?.();
  } catch {
    // noop
  }

  return result;
}

function clearSession(options = {}) {
  try {
    clearSessionLocal({
      source: "Auth.clearSession",
      ...options,
    });
  } catch {
    try {
      AppCore?.clearSession?.({
        source: "Auth.clearSession",
      });
    } catch {
      // noop
    }
  }

  try {
    CoreHttp?.clearAuthTokens?.();
  } catch {
    // noop
  }

  try {
    syncAuthState?.();
  } catch {
    // noop
  }

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

  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

/* =========================================================
   CORE FLOWS
========================================================= */

async function login(credentials = {}, options = {}) {
  if (Auth.session.loginPromise) return Auth.session.loginPromise;

  Auth.session.loggingIn = true;

  Auth.session.loginPromise = (async () => {
    try {
      const result = await loginCore(credentials, {
        ...options,
        skipNavigation: true,
        skipRedirect: true,
        noRedirect: true,
      });

      if (!isAuthenticated() && result) {
        applySession(result, {
          source: "Auth.login",
        });
      }

      const authenticated = isAuthenticated();

      if (authenticated) {
        emit("auth:login:success", {
          authenticated: true,
          user: getUser(),
          role: getRole(),
        });
      }

      Auth.session.lastError = null;
      Auth.session.lastLoginAt = Date.now();

      return {
        ...result,
        authenticated,
        user: getUser(),
        role: getRole(),
        roles: getRoles(),
      };
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
  if (isFunction(handleLoginFormSubmitCore)) {
    return handleLoginFormSubmitCore(form, {
      ...options,
      skipNavigation: true,
      skipRedirect: true,
      noRedirect: true,
    });
  }

  if (!isBrowser() || !(form instanceof HTMLFormElement)) {
    throw new Error("Formulario de login inválido.");
  }

  options.event?.preventDefault?.();

  const data = new FormData(form);

  return login(
    {
      identifier:
        data.get("identifier") ||
        data.get("email") ||
        data.get("username") ||
        "",
      password: data.get("password") || "",
      remember: data.get("remember") === "on",
    },
    options
  );
}

async function restoreSession(options = {}) {
  if (Auth.session.restorePromise) return Auth.session.restorePromise;

  Auth.session.restoring = true;

  Auth.session.restorePromise = (async () => {
    try {
      const result = await restoreSessionCore(Auth.session, {
        ...options,
        skipNavigation: true,
        skipRedirect: true,
        noRedirect: true,
      });

      try {
        syncAuthState?.();
      } catch {
        // noop
      }

      Auth.session.lastError = null;
      Auth.session.lastRestoreAt = Date.now();

      return result;
    } catch (error) {
      Auth.session.lastError = {
        type: "restore",
        message: error?.message || String(error),
        at: new Date().toISOString(),
      };

      throw error;
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
      const result = await CoreHttp.refreshSession({
        ...options,
        auth: false,
        public: true,
        skipAuth: true,
        captureAuth: true,
      });

      applySession(result, {
        source: "Auth.refresh",
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
      const result = await CoreHttp.me({
        ...options,
        auth: true,
        public: false,
        skipAuth: false,
        captureAuth: true,
      });

      applySession(result, {
        source: "Auth.me",
      });

      Auth.session.lastError = null;
      Auth.session.lastMeAt = Date.now();

      return {
        ...result,
        authenticated: isAuthenticated(),
        user: getUser(),
        role: getRole(),
      };
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
    await logoutCore({
      ...options,
      skipNavigation: true,
      skipRedirect: true,
      noRedirect: true,
    });
  } finally {
    clearSession({
      source: "Auth.logout",
    });

    emit("auth:logout:success", {
      authenticated: false,
    });
  }

  return true;
}

/* =========================================================
   PUBLIC ROUTES
========================================================= */

function normalizePath(path = "/") {
  let value = text(path, "/").split("?")[0].split("#")[0];

  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1) value = value.replace(/\/+$/g, "");

  return value || "/";
}

function currentPath() {
  if (!isBrowser()) return "/";

  return normalizePath(window.location.pathname || "/");
}

function getCurrentPublicPath() {
  if (!isBrowser()) return "/";

  return `${window.location.pathname}${window.location.search}${window.location.hash}` || "/";
}

function getCurrentCanonicalPath(path = currentPath()) {
  return normalizePath(path);
}

function isAuthRoute(path = currentPath()) {
  return normalizePath(path) === AUTH_ROUTES.login;
}

function isPublicTechnicalRoute(path = currentPath()) {
  const clean = normalizePath(path);

  return [
    AUTH_ROUTES.login,
    AUTH_ROUTES.passwordReset,
    AUTH_ROUTES.passwordRequest,
    AUTH_ROUTES.activateAccount,
  ].includes(clean);
}

function isActivationRoute(path = currentPath()) {
  return normalizePath(path) === AUTH_ROUTES.activateAccount;
}

function isPasswordResetRoute(path = currentPath()) {
  return normalizePath(path) === AUTH_ROUTES.passwordReset;
}

function isPasswordRequestRoute(path = currentPath()) {
  return normalizePath(path) === AUTH_ROUTES.passwordRequest;
}

function getCurrentRouteContext() {
  const publicPath = getCurrentPublicPath();
  const canonicalPath = getCurrentCanonicalPath(publicPath);

  return {
    publicPath,
    canonicalPath,
    route: canonicalPath,
    isAuthRoute: isAuthRoute(canonicalPath),
    isPublicTechnicalRoute: isPublicTechnicalRoute(canonicalPath),
    isActivationRoute: isActivationRoute(canonicalPath),
    isPasswordResetRoute: isPasswordResetRoute(canonicalPath),
    isPasswordRequestRoute: isPasswordRequestRoute(canonicalPath),
  };
}

/* =========================================================
   FLOW HELPERS
========================================================= */

function pick(moduleApi, name, fallback = null) {
  return isFunction(moduleApi?.[name])
    ? moduleApi[name]
    : isFunction(moduleApi?.default?.[name])
      ? moduleApi.default[name]
      : fallback;
}

const activateAccount =
  pick(ActivationApi, "activateAccount") ||
  pick(ActivationApi, "activate") ||
  ((payload = {}, options = {}) =>
    CoreHttp.post(AUTH_ENDPOINTS.activate, payload, {
      ...options,
      auth: false,
      public: true,
      skipAuth: true,
    }));

const validateActivationToken =
  pick(ActivationApi, "validateActivationToken") ||
  (() => Promise.resolve({ ok: true }));

const requestPasswordReset =
  pick(PasswordResetApi, "requestPasswordReset") ||
  ((payload = {}, options = {}) =>
    CoreHttp.post(AUTH_ENDPOINTS.requestPasswordReset, payload, {
      ...options,
      auth: false,
      public: true,
      skipAuth: true,
    }));

const confirmResetPassword =
  pick(PasswordResetApi, "confirmResetPassword") ||
  pick(PasswordResetApi, "confirmPasswordReset") ||
  ((payload = {}, options = {}) =>
    CoreHttp.post(AUTH_ENDPOINTS.confirmPasswordReset, payload, {
      ...options,
      auth: false,
      public: true,
      skipAuth: true,
    }));

const validateResetPasswordToken =
  pick(PasswordResetApi, "validateResetPasswordToken") ||
  (() => Promise.resolve({ ok: true }));

function authApiRequest(method = "GET", path = "", body = undefined, options = {}) {
  const upper = text(method, "GET").toUpperCase();

  if (["GET", "HEAD", "OPTIONS"].includes(upper)) {
    return CoreHttp.request(path, {
      ...options,
      method: upper,
    });
  }

  return CoreHttp.request(path, {
    ...options,
    method: upper,
    body,
  });
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getAuthModuleSnapshot() {
  const user = getUser();

  return {
    version: AUTH_MODULE_VERSION,
    authenticated: isAuthenticated(),
    hasToken: hasValidToken(),
    hasUser: Boolean(user),
    user: user
      ? {
          id: user.id || user.userId || null,
          userId: user.userId || user.id || null,
          username: user.username || null,
          displayName: user.displayName || user.name || user.username || null,
          role: user.role || user.rol || null,
          hasAvatar: Boolean(user.avatar || user.avatarUrl || user.picture),
        }
      : null,
    role: getRole() || null,
    roles: getRoles(),
    permissions: [],
    isAdmin: isAdmin(),
    route: getCurrentRouteContext(),
    session: {
      loggingIn: Auth.session.loggingIn,
      restoring: Auth.session.restoring,
      checking: Auth.session.checking,
      refreshing: Auth.session.refreshing,
      lastError: Auth.session.lastError,
    },
    endpoints: AUTH_ENDPOINTS,
    routes: AUTH_ROUTES,
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
  return Auth;
}

function start() {
  return init();
}

function boot() {
  return init();
}

/* =========================================================
   AUTH SINGLETON
========================================================= */

export const Auth = {
  version: AUTH_MODULE_VERSION,

  AUTH_ENDPOINTS,
  AUTH_ROUTES,

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
  getCurrentUser,
  currentUser,
  getProfile,
  getAccount,
  getSessionUser,

  getToken,
  getAccessToken,
  hasValidToken,
  isAuthenticated,

  getRole,
  getRoles,
  getPermissions,

  getCurrentRole: getRole,
  getCurrentRoles: getRoles,

  isCurrentUserAdmin: isAdmin,
  isAdmin,

  isCurrentUserSupport: () => false,
  isCurrentUserManager: () => false,
  isCurrentUserClient: () => false,

  hasRole,
  requireRole,

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
  clearSessionLocal,

  getAuthHeader,
  buildSessionSnapshot,
  getSessionDebugSnapshot,

  guardAuthenticated,
  guardRole,
  guardGuest,
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

  normalizeUser: normalizeUserForAuth,
  normalizeAuthPayload,

  getAuthModuleSnapshot,
  getSnapshot: getAuthModuleSnapshot,
  getDebugSnapshot: getAuthModuleSnapshot,
};

attachToCore(Auth);

export default Auth;
