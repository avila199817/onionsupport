/* =========================================================
   Onion Support - Auth Facade
   Archivo: /src/features/auth/index.js

   Responsabilidad:
   - Fachada pública mínima de Auth.
   - Delegar login/restore/logout/session/guards.
   - HTTP delegado en CoreHttp.
   - Sin Router.
   - Sin Toast.
   - Sin fetch propio.
   - Sin storage paralelo.
   - Sin rutas inventadas.
   - Sin 2FA/MFA/OTP en esta fachada.
   - Roles únicos: admin / user.
   - Auth estricta: token + user usable.
   - User inválido sólo si disabled.
   - Sin magia negra.
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
  passwordRequest: "/password-request",
  passwordReset: "/password-reset",
  activateAccount: "/activate-account",
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

function pickFn(moduleApi = {}, ...names) {
  const flat = names.flat().filter(Boolean);

  for (const name of flat) {
    if (isFunction(moduleApi?.[name])) return moduleApi[name];

    if (isObject(moduleApi?.default) && isFunction(moduleApi.default[name])) {
      return moduleApi.default[name].bind(moduleApi.default);
    }
  }

  if (flat.includes("default") && isFunction(moduleApi?.default)) {
    return moduleApi.default;
  }

  return null;
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
   MODULE FUNCTIONS
========================================================= */

const loginCore = pickFn(LoginApi, "login", "default");
const handleLoginFormSubmitCore = pickFn(LoginApi, "handleLoginFormSubmit");

const restoreSessionCore = pickFn(RestoreApi, "restoreSession", "restore", "default");
const logoutCore = pickFn(LogoutApi, "logout", "default");

const sessionApplySession = pickFn(SessionApi, "applySession");
const sessionClearSessionLocal = pickFn(SessionApi, "clearSessionLocal", "clearSession");
const sessionBuildSnapshot = pickFn(SessionApi, "buildSessionSnapshot");
const sessionIsAuthenticated = pickFn(SessionApi, "isAuthenticated");
const sessionGetCurrentUser = pickFn(SessionApi, "getCurrentUser");
const sessionGetCurrentToken = pickFn(SessionApi, "getCurrentToken");
const sessionGetCurrentRole = pickFn(SessionApi, "getCurrentRole");
const sessionGetCurrentRoles = pickFn(SessionApi, "getCurrentRoles");
const sessionGetAuthHeader = pickFn(SessionApi, "getAuthHeader");
const sessionDebugSnapshot = pickFn(SessionApi, "getSessionDebugSnapshot");

const guardAuthenticatedCore = pickFn(GuardsApi, "guardAuthenticated", "requireAuth");
const guardRoleCore = pickFn(GuardsApi, "guardRole", "requireRole");
const guardGuestCore = pickFn(GuardsApi, "guardGuest", "requireGuest");
const guardAdminCore = pickFn(GuardsApi, "guardAdmin", "requireAdmin");
const canAccessRouteCore = pickFn(GuardsApi, "canAccessRoute", "canAccess");
const syncAuthStateCore = pickFn(GuardsApi, "syncAuthState");
const buildGuardErrorPayloadCore = pickFn(GuardsApi, "buildGuardErrorPayload");
const getAuthGuardsSnapshotCore = pickFn(GuardsApi, "getAuthGuardsSnapshot");

/* =========================================================
   TOKEN / USER
========================================================= */

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
    return sessionIsAuthenticated?.() === false ? false : strict;
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

  const roleFromSession = isFunction(sessionGetCurrentRoles)
    ? sessionGetCurrentRoles()
    : null;

  if (Array.isArray(roleFromSession) && roleFromSession.length) {
    return roleFromSession.map(cleanRole).filter((role) => VALID_ROLES.includes(role));
  }

  const role = getRole();

  return role ? [role] : [];
}

function getPermissions() {
  return [];
}

function isAdmin() {
  return isAuthenticated() && getRole() === "admin";
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

/* =========================================================
   PAYLOAD NORMALIZATION
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
  const user = normalizeUserForAuth(extractUser(payload) || getUser());

  return {
    ...payload,

    token: cleanToken,
    accessToken: cleanToken,
    access_token: cleanToken,

    user,

    role: user?.role || null,
    rol: user?.role || null,
    roles: user?.role ? [user.role] : [],

    authenticated: Boolean(cleanToken && user),
  };
}

/* =========================================================
   SESSION
========================================================= */

function syncAuthState() {
  try {
    if (isFunction(syncAuthStateCore)) {
      return syncAuthStateCore();
    }
  } catch {
    // fallback abajo
  }

  try {
    AppCore?.setState?.(
      {
        token: getToken(),
        accessToken: getToken(),
        access_token: getToken(),
        user: getUser(),
        currentUser: getUser(),
        authenticated: isAuthenticated(),
        hasToken: hasValidToken(),
        role: getRole() || null,
        rol: getRole() || null,
        roles: getRoles(),
        isAdmin: isAdmin(),
        isUser: getRole() === "user",
        isSupport: false,
        isManager: false,
        isClient: false,
      },
      {
        source: "Auth.syncAuthState",
        silent: true,
        emit: false,
      }
    );
  } catch {
    // noop
  }

  return true;
}

function applySession(payload = {}, options = {}) {
  const normalized = normalizeAuthPayload(payload);

  let result = normalized;

  try {
    if (isFunction(sessionApplySession)) {
      result = sessionApplySession(normalized, {
        source: options.source || "Auth.applySession",
        ...options,
      });
    } else {
      AppCore?.applySession?.(normalized, {
        source: options.source || "Auth.applySession",
      });
    }
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
    if (normalized.token && isFunction(CoreHttp?.setAuthTokens)) {
      CoreHttp.setAuthTokens(normalized);
    }
  } catch {
    // noop
  }

  syncAuthState();

  return result;
}

function clearSession(options = {}) {
  try {
    if (isFunction(sessionClearSessionLocal)) {
      sessionClearSessionLocal({
        source: "Auth.clearSession",
        ...options,
      });
    } else {
      AppCore?.clearSession?.({
        source: "Auth.clearSession",
      });
    }
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
    if (isFunction(CoreHttp?.clearAuthTokens)) {
      CoreHttp.clearAuthTokens();
    }
  } catch {
    // noop
  }

  syncAuthState();

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
   HTTP HELPERS
========================================================= */

async function httpRequest(method = "GET", path = "", body = undefined, options = {}) {
  const upper = text(method, "GET").toUpperCase();

  if (isFunction(CoreHttp?.request)) {
    return CoreHttp.request(path, {
      ...options,
      method: upper,
      ...(body !== undefined ? { body } : {}),
    });
  }

  const methodName = upper === "DELETE" ? "delete" : upper.toLowerCase();

  if (isFunction(CoreHttp?.[methodName])) {
    if (["GET", "HEAD", "OPTIONS", "DELETE"].includes(upper)) {
      return CoreHttp[methodName](path, options);
    }

    return CoreHttp[methodName](path, body, options);
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

async function httpRefresh(options = {}) {
  if (isFunction(CoreHttp?.refreshSession)) {
    return CoreHttp.refreshSession({
      ...options,
      auth: false,
      public: true,
      skipAuth: true,
      captureAuth: true,
    });
  }

  if (isFunction(CoreHttp?.refresh)) {
    return CoreHttp.refresh({}, {
      ...options,
      auth: false,
      public: true,
      skipAuth: true,
      captureAuth: true,
    });
  }

  return httpPost(AUTH_ENDPOINTS.refresh, {}, {
    ...options,
    auth: false,
    public: true,
    skipAuth: true,
  });
}

async function httpMe(options = {}) {
  if (isFunction(CoreHttp?.me)) {
    return CoreHttp.me({
      ...options,
      auth: true,
      public: false,
      skipAuth: false,
      captureAuth: true,
    });
  }

  return httpRequest("GET", AUTH_ENDPOINTS.me, undefined, {
    ...options,
    auth: true,
    public: false,
    skipAuth: false,
  });
}

/* =========================================================
   CORE FLOWS
========================================================= */

async function login(credentials = {}, options = {}) {
  if (Auth.session.loginPromise) return Auth.session.loginPromise;

  Auth.session.loggingIn = true;

  Auth.session.loginPromise = (async () => {
    try {
      const result = isFunction(loginCore)
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

      if (result) {
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
      remember: data.get("remember") === "on" || data.get("remember") === "1",
    },
    options
  );
}

async function restoreSession(options = {}) {
  if (Auth.session.restorePromise) return Auth.session.restorePromise;

  Auth.session.restoring = true;

  Auth.session.restorePromise = (async () => {
    try {
      let result = null;

      if (isFunction(restoreSessionCore)) {
        result = restoreSessionCore.length >= 2
          ? await restoreSessionCore(Auth.session, {
              ...options,
              skipNavigation: true,
              skipRedirect: true,
              noRedirect: true,
            })
          : await restoreSessionCore({
              ...options,
              skipNavigation: true,
              skipRedirect: true,
              noRedirect: true,
            });
      }

      syncAuthState();

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
      const result = await httpRefresh(options);

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
      const result = await httpMe(options);

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
      });
    }
  } catch {
    // Logout remoto es best-effort.
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
   ROUTES
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
    AUTH_ROUTES.passwordRequest,
    AUTH_ROUTES.passwordReset,
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
   GUARDS
========================================================= */

function guardAuthenticated(...args) {
  if (isFunction(guardAuthenticatedCore)) return guardAuthenticatedCore(...args);

  if (!isAuthenticated()) {
    return {
      ok: false,
      allowed: false,
      redirectTo: AUTH_ROUTES.login,
      code: "AUTH_REQUIRED",
    };
  }

  return {
    ok: true,
    allowed: true,
  };
}

function guardGuest(...args) {
  if (isFunction(guardGuestCore)) return guardGuestCore(...args);

  if (isAuthenticated()) {
    return {
      ok: false,
      allowed: false,
      redirectTo: "/",
      code: "GUEST_ONLY",
    };
  }

  return {
    ok: true,
    allowed: true,
  };
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

  const roles = Array.isArray(route?.roles) ? route.roles.map(cleanRole) : [];

  if (roles.length && !roles.includes(getRole())) return false;

  return true;
}

function buildGuardErrorPayload(error = {}) {
  if (isFunction(buildGuardErrorPayloadCore)) {
    return buildGuardErrorPayloadCore(error);
  }

  return {
    ok: false,
    allowed: false,
    code: error?.code || "AUTH_ERROR",
    status: error?.status || 401,
    message: error?.message || "No autorizado.",
  };
}

function getAuthGuardsSnapshot() {
  if (isFunction(getAuthGuardsSnapshotCore)) {
    return getAuthGuardsSnapshotCore();
  }

  return {
    version: AUTH_MODULE_VERSION,
    authenticated: isAuthenticated(),
    role: getRole(),
    roles: getRoles(),
  };
}

/* =========================================================
   FLOWS
========================================================= */

const activationDelegate =
  pickFn(ActivationApi, "activateAccount", "activate");

const validateActivationDelegate =
  pickFn(ActivationApi, "validateActivationToken");

const requestResetDelegate =
  pickFn(PasswordResetApi, "requestPasswordReset");

const confirmResetDelegate =
  pickFn(PasswordResetApi, "confirmResetPassword", "confirmPasswordReset");

const validateResetDelegate =
  pickFn(PasswordResetApi, "validateResetPasswordToken");

async function activateAccount(payload = {}, options = {}) {
  const result = isFunction(activationDelegate)
    ? await activationDelegate(payload, options)
    : await httpPost(AUTH_ENDPOINTS.activate, payload, {
        ...options,
        auth: false,
        public: true,
        skipAuth: true,
      });

  const normalized = normalizeAuthPayload(result);

  if (normalized.authenticated) {
    applySession(normalized, {
      source: "Auth.activateAccount",
    });
  }

  return result;
}

function validateActivationToken(payload = {}, options = {}) {
  if (isFunction(validateActivationDelegate)) {
    return validateActivationDelegate(payload, options);
  }

  return Promise.resolve({
    ok: Boolean(payload?.token || payload),
  });
}

async function requestPasswordReset(payload = {}, options = {}) {
  return isFunction(requestResetDelegate)
    ? requestResetDelegate(payload, options)
    : httpPost(AUTH_ENDPOINTS.requestPasswordReset, payload, {
        ...options,
        auth: false,
        public: true,
        skipAuth: true,
      });
}

async function confirmResetPassword(payload = {}, options = {}) {
  const result = isFunction(confirmResetDelegate)
    ? await confirmResetDelegate(payload, options)
    : await httpPost(AUTH_ENDPOINTS.confirmPasswordReset, payload, {
        ...options,
        auth: false,
        public: true,
        skipAuth: true,
      });

  const normalized = normalizeAuthPayload(result);

  if (normalized.authenticated) {
    applySession(normalized, {
      source: "Auth.confirmResetPassword",
    });
  }

  return result;
}

function validateResetPasswordToken(payload = {}, options = {}) {
  if (isFunction(validateResetDelegate)) {
    return validateResetDelegate(payload, options);
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
  if (isFunction(sessionBuildSnapshot)) {
    try {
      return sessionBuildSnapshot();
    } catch {
      // fallback abajo
    }
  }

  return {
    authenticated: isAuthenticated(),
    hasToken: hasValidToken(),
    user: getUser(),
    role: getRole(),
  };
}

function getSessionDebugSnapshotSafe() {
  if (isFunction(sessionDebugSnapshot)) {
    try {
      return sessionDebugSnapshot();
    } catch {
      // fallback abajo
    }
  }

  return buildSessionSnapshotSafe();
}

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

    policy: {
      noRouter: true,
      noToast: true,
      noFetchOwn: true,
      noStorageParallel: true,
      roles: ["admin", "user"],
      invalidOnlyDisabled: true,
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
  clearSessionLocal: clearSession,

  syncAuthState,

  getAuthHeader,
  buildSessionSnapshot: buildSessionSnapshotSafe,
  getSessionDebugSnapshot: getSessionDebugSnapshotSafe,

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
