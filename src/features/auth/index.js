/* =========================================================
   Onion Support - Auth Facade
   Archivo: /src/features/auth/index.js

   Responsabilidad:
   - Fachada pública mínima de Auth.
   - Delegar login/restore/logout/session/guards.
   - HTTP delegado en CoreHttp/AppCore.
   - Sin Router.
   - Sin Toast.
   - Sin fetch propio.
   - Sin storage paralelo.
   - Sin rutas inventadas.
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

export const AUTH_MODULE_VERSION = "minimal-1";

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
  return (
    !isObject(user) ||
    user.disabled === true ||
    String(user.status || "").toLowerCase() === "disabled"
  );
}

function userOk(user = null) {
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

function normalizeUser(user = null) {
  if (!userOk(user)) return null;

  const id = user.userId || user.id || null;
  const username = user.username || user.slug || user.email || id || null;
  const displayName =
    user.displayName ||
    user.fullName ||
    user.name ||
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

    active: true,
    disabled: false,
  };
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
   TOKEN / USER
========================================================= */

function getToken() {
  const value =
    sessionGetCurrentToken?.() ||
    CoreHttp?.getAccessToken?.() ||
    state().token ||
    state().accessToken ||
    state().access_token ||
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
    null;

  return normalizeUser(user);
}

function getRole() {
  const user = getUser();
  if (!user) return "";

  return cleanRole(sessionGetCurrentRole?.() || user.role || user.rol);
}

function getRoles() {
  if (!isAuthenticated()) return [];

  const fromSession = sessionGetCurrentRoles?.();

  if (Array.isArray(fromSession) && fromSession.length) {
    return fromSession.map(cleanRole).filter((role) => VALID_ROLES.includes(role));
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

function syncAuthState() {
  try {
    if (isFn(syncAuthStateCore)) {
      return syncAuthStateCore();
    }
  } catch {
    // fallback abajo
  }

  const user = getUser();
  const token = getToken();
  const role = user ? getRole() : "";

  try {
    AppCore?.setState?.(
      {
        token,
        accessToken: token,
        access_token: token,

        user,
        currentUser: user,

        authenticated: Boolean(token && user),
        hasToken: Boolean(token),

        role: role || null,
        rol: role || null,
        roles: role ? [role] : [],

        isAdmin: role === "admin",
        isUser: role === "user",
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
    } else {
      AppCore?.setState?.(normalized, {
        source: options.source || "Auth.applySession",
        silent: true,
        emit: false,
      });
    }
  } catch {
    // noop
  }

  syncHttpToken(normalized.token || getToken(), normalized);
  syncAuthState();

  return {
    ...normalized,
    authenticated: isAuthenticated(),
    user: getUser(),
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
    } else {
      AppCore?.setState?.(
        {
          token: null,
          accessToken: null,
          access_token: null,
          user: null,
          currentUser: null,
          authenticated: false,
          hasToken: false,
          role: null,
          rol: null,
          roles: [],
          isAdmin: false,
          isUser: false,
        },
        {
          source: "Auth.clearSession",
          silent: true,
          emit: false,
        }
      );
    }
  } catch {
    // noop
  }

  clearHttpToken();
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
          user: result.user,
          role: result.role,
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

      return raw || buildSessionSnapshotSafe();
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
  return normalizePath(path);
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
        redirectTo: "/",
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

  return !roles.length || roles.includes(getRole());
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
    if (isFn(sessionBuildSnapshot)) return sessionBuildSnapshot();
  } catch {
    // fallback abajo
  }

  return {
    authenticated: isAuthenticated(),
    hasToken: hasValidToken(),
    hasUser: Boolean(getUser()),
    user: getUser(),
    role: getRole(),
    roles: getRoles(),
  };
}

function getSessionDebugSnapshotSafe() {
  try {
    if (isFn(sessionDebugSnapshot)) return sessionDebugSnapshot();
  } catch {
    // fallback abajo
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
        }
      : null,

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
