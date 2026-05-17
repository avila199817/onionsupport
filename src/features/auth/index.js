/* =========================================================
   Onion SPA - Auth Facade
   Archivo: src/features/auth/index.js

   AUTH FACADE · SIMPLE
   - punto público único de Auth
   - sesión real delegada en session.js/login.js/restore.js/logout.js
   - transporte delegado en CoreHttp
   - sin fetch propio, apiClient propio, Router, Toast ni storage paralelo
   - roles reales: admin / user
   - sin tokens en eventos/snapshots
========================================================= */

import { AppCore } from "../../core/index.js";
import CoreHttp from "../../core/http.js";

import {
  AUTH_ENDPOINTS,
  AUTH_STORAGE_KEYS,
  AUTH_CONSTANTS,
  AUTH_PUBLIC_TECHNICAL_ROUTES,
} from "./constants.js";

import {
  isAuthRoute as helperIsAuthRoute,
  isPublicTechnicalRoute as helperIsPublicTechnicalRoute,
  isActivationRoute as helperIsActivationRoute,
  isResetPasswordConfirmRoute as helperIsResetPasswordConfirmRoute,
  hasActivationToken as helperHasActivationToken,
  hasResetToken as helperHasResetToken,
  getCurrentPublicPath,
  getCurrentCanonicalPath,
  normalizePublicPath,
  normalizeCanonicalPath,
  sanitizeRedirectPath,
  extractMessage,
  redactTokenInText,
} from "./helpers.js";

import {
  normalizeUser,
  normalizeAuthResponse,
  extractUser,
  extractToken,
} from "./normalize.js";

import {
  getStoredRefreshToken,
  getStoredTempToken,
  getStoredSessionId,
  getStoredSessionUserId,
  hasRefreshToken,
  hasRefreshContext,
  clearAuthStorage,
} from "./storage.js";

import {
  buildSessionSnapshot,
  applySession,
  clearSessionLocal,
  isAuthenticated as sessionIsAuthenticated,
  getCurrentUser as sessionGetCurrentUser,
  getCurrentToken as sessionGetCurrentToken,
  getCurrentRole as sessionGetCurrentRole,
  getCurrentRoles as sessionGetCurrentRoles,
  isCurrentUserAdmin as sessionIsCurrentUserAdmin,
  hasRole as sessionHasRole,
  requireRole as sessionRequireRole,
  getAuthHeader,
  getSessionDebugSnapshot,
} from "./session.js";

import {
  resolveLoginIdentifier,
  normalizeLoginPayload,
  buildLoginRequestBody,
  buildLoginRedirectPath,
  getPostLoginTarget,
  login as coreLogin,
  handleLoginFormSubmit as coreHandleLoginFormSubmit,
  getLoginSnapshot,
} from "./login.js";

import {
  restoreSession as restoreSessionCore,
  getRestoreSnapshot,
} from "./restore.js";

import {
  logout as coreLogout,
  getLogoutSnapshot,
} from "./logout.js";

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
import * as TwoFactorApi from "./2fa.js";
import * as PasswordResetApi from "./password-reset.js";

export const AUTH_MODULE_VERSION = "21.0.0-simple";

const SOURCE = "Auth";
const BACKEND_ORIGIN = "https://api.onionit.net";

const PRIVATE_ME_ENDPOINTS = Object.freeze([
  "/me",
  "/api/me",
  "/auth/me",
  "/api/auth/me",
]);

const PUBLIC_TECHNICAL_ROUTES = Object.freeze([
  ...(Array.isArray(AUTH_PUBLIC_TECHNICAL_ROUTES) ? AUTH_PUBLIC_TECHNICAL_ROUTES : []),
  "/login",
  "/activate-account",
  "/activate",
  "/activation",
  "/account/activate",
  "/activate/first-user",
  "/reset-password",
  "/reset-password/confirm",
  "/reset-password-confirm",
  "/forgot-password",
  "/recover-password",
  "/recover",
  "/password-reset",
  "/password-reset/confirm",
  "/password-reset-confirm",
  "/confirm-reset-password",
  "/2fa",
  "/otp",
  "/mfa",
]);

const VALID_ROLES = Object.freeze(["admin", "user"]);

const ADMIN_ALIASES = new Set([
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
  "super-admin",
  "owner",
  "root",
]);

const USER_ALIASES = new Set([
  "user",
  "usuario",
  "client",
  "cliente",
  "customer",
]);

const SENSITIVE_KEYS_RE = /token|authorization|password|secret|credential|cookie|jwt|bearer|refresh|access|otp|mfa|2fa|code|totp|csrf|xsrf/i;

/* =========================================================
   BASICS
========================================================= */

const isFn = (value) => typeof value === "function";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value === null || value === undefined) return [];
  return [value];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function unique(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flat(Infinity)
        .map((item) => safeText(item, ""))
        .filter(Boolean)
    ),
  ];
}

function safeCall(fn, fallback, ...args) {
  try {
    return isFn(fn) ? fn(...args) : fallback;
  } catch {
    return fallback;
  }
}

function safeMessage(error) {
  try {
    return extractMessage(error);
  } catch {
    return safeText(
      error?.data?.message ||
        error?.response?.data?.message ||
        error?.message ||
        String(error),
      "Error de autenticación"
    );
  }
}

/* =========================================================
   SANITIZE / EVENTS
========================================================= */

function redact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "")
      .replace(/([?&#](?:token|code|t|otp|totp|access_token|refresh_token|id_token|tempToken|temp_token)=)([^&#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  }
}

function sanitizeUser(user = null) {
  if (!isObject(user)) return null;

  const output = { ...user };

  for (const key of Object.keys(output)) {
    if (SENSITIVE_KEYS_RE.test(key) || key.startsWith("_")) delete output[key];
  }

  for (const key of ["avatar", "avatarUrl", "picture", "photo", "image"]) {
    if (output[key]) output[key] = redact(output[key]);
  }

  return output;
}

function sanitizePayload(value, depth = 0, keyHint = "", seen = new WeakSet()) {
  if (SENSITIVE_KEYS_RE.test(safeText(keyHint, ""))) return value ? "***" : null;
  if (depth > 4) return "[depth-limit]";

  if (typeof value === "string") return redact(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redact(value.message || ""),
      status: value.status || value.statusCode || value.response?.status || null,
      code: value.code || value.data?.code || value.response?.data?.code || null,
      stack: value.stack ? "[stack]" : null,
    };
  }

  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizePayload(item, depth + 1, keyHint, seen));

  if (isObject(value)) {
    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      if (["user", "currentUser", "profile", "account", "sessionUser"].includes(key)) {
        output[key] = sanitizeUser(item);
        continue;
      }

      output[key] = sanitizePayload(item, depth + 1, key, seen);
    }

    return output;
  }

  return String(value);
}

function emit(eventName = "", payload = {}, options = {}) {
  if (options.emit === false || options.emitEvents === false || options.silentEvents === true) return false;

  const name = safeText(eventName, "");
  if (!name) return false;

  const detail = sanitizePayload({
    source: SOURCE,
    version: AUTH_MODULE_VERSION,
    at: nowIso(),
    ...safeObject(payload),
  });

  try {
    AppCore?.events?.emit?.(name, detail);
    return true;
  } catch {}

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    }
  } catch {}

  return false;
}

function repairUserUI(reason = "auth-session", options = {}) {
  try {
    AppCore?.syncUserUI?.({ reason, source: SOURCE });
  } catch {
    try {
      AppCore?.syncUserUI?.();
    } catch {}
  }

  emit(
    "app:ui:repair-request",
    {
      reason,
      authenticated: isAuthenticatedSafe(),
      user: getUser(),
      role: getRole(),
      repairShell: false,
      hardRepair: false,
      rebind: false,
    },
    { ...safeObject(options), silentEvents: options.emitRepairEvent === true ? false : true }
  );

  return true;
}

/* =========================================================
   ROLE / STATE HELPERS
========================================================= */

function normalizeRole(value = "", fallback = "") {
  const role = safeText(value, fallback)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");

  if (ADMIN_ALIASES.has(role)) return "admin";
  if (USER_ALIASES.has(role)) return "user";
  return VALID_ROLES.includes(role) ? role : fallback;
}

function normalizeRoles(values = []) {
  const roles = unique(safeArray(values).flat(Infinity).map((role) => normalizeRole(role, "")).filter(Boolean));
  if (roles.includes("admin")) return ["admin"];
  return roles.includes("user") ? ["user"] : [];
}

function usableToken(value = "") {
  const token = safeText(value, "").replace(/^Bearer\s+/i, "").trim();
  if (!token || /[\s\r\n\t]/.test(token)) return "";

  if (["null", "undefined", "false", "true", "none", "nan", "[object object]", "{}", "[]"].includes(token.toLowerCase())) return "";

  try {
    if (isFn(AppCore?.utils?.hasValidToken) && !AppCore.utils.hasValidToken(token)) return "";
  } catch {}

  return token;
}

function normalizeUserForFacade(user = null) {
  if (!isObject(user)) return null;

  let normalized = null;

  try {
    normalized = normalizeUser(user);
  } catch {
    normalized = user;
  }

  if (!isObject(normalized)) return null;
  if (normalized.active === false || normalized.disabled === true || normalized.deleted === true || normalized.archived === true || normalized.blocked === true) return null;

  const role = normalizeRole(normalized.role || normalized.rol, "user");
  const roles = normalizeRoles([role, ...safeArray(normalized.roles)]);

  return {
    ...normalized,
    role,
    rol: role,
    userRole: role,
    roles: roles.length ? roles : [role],
  };
}

function getUser() {
  const state = safeObject(AppCore?.state);
  const session = safeObject(state.session || state.sessionData);

  return normalizeUserForFacade(
    safeCall(sessionGetCurrentUser, null) ||
      state.user ||
      state.currentUser ||
      state.sessionUser ||
      state.authUser ||
      state.account ||
      state.profile ||
      session.user ||
      session.usuario ||
      null
  );
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

function getToken() {
  return usableToken(
    safeCall(sessionGetCurrentToken, "") ||
      safeCall(CoreHttp?.getAccessToken, "") ||
      AppCore?.state?.token ||
      AppCore?.state?.accessToken ||
      AppCore?.state?.access_token ||
      AppCore?.state?.session?.token ||
      AppCore?.state?.session?.accessToken ||
      AppCore?.state?.sessionData?.token ||
      ""
  ) || null;
}

function getAccessToken() {
  return getToken();
}

function hasValidToken() {
  return Boolean(getToken());
}

function isAuthenticatedSafe() {
  const strict = Boolean(hasValidToken() && getUser());
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

  return normalizeRole(safeCall(sessionGetCurrentRole, "") || user.role || user.rol, "user");
}

function getRoles() {
  const user = getUser();
  if (!user) return [];

  const roles = normalizeRoles([
    ...safeArray(safeCall(sessionGetCurrentRoles, [])),
    ...safeArray(user.roles),
    getRole(),
  ]);

  return roles.length ? roles : ["user"];
}

function getPermissions() {
  const user = getUser();
  return unique([...safeArray(user?.permissions), ...safeArray(user?.permisos)]);
}

function isAdmin() {
  return getRole() === "admin" || safeCall(sessionIsCurrentUserAdmin, false) === true;
}

function unsupportedLegacyRole() {
  return false;
}

function hasRoleFacade(role) {
  const clean = normalizeRole(role, "");
  if (!clean) return false;

  try {
    return Boolean(sessionHasRole(clean));
  } catch {
    return getRoles().includes(clean);
  }
}

function requireRoleFacade(role) {
  const clean = normalizeRole(role, "");

  if (!clean || !hasRoleFacade(clean)) {
    const error = new Error("No tienes permisos para acceder a este recurso.");
    error.code = "AUTH_FORBIDDEN";
    error.status = 403;
    throw error;
  }

  try {
    return sessionRequireRole(clean);
  } catch {
    return true;
  }
}

/* =========================================================
   ROUTES
========================================================= */

function routePublicPath() {
  return safeCall(getCurrentPublicPath, "") || safeText(AppCore?.state?.publicPath || AppCore?.state?.route, "/");
}

function routeCanonicalPath(path = routePublicPath()) {
  return safeCall(normalizeCanonicalPath, "/", path) || "/";
}

function routePublicNormalize(path = "/") {
  return safeCall(normalizePublicPath, "/", path) || "/";
}

function isPublicTechnicalRoute(path = routePublicPath()) {
  if (safeCall(helperIsPublicTechnicalRoute, false, path)) return true;

  const clean = routeCanonicalPath(path).toLowerCase();

  return PUBLIC_TECHNICAL_ROUTES.some((route) => {
    const routeClean = routeCanonicalPath(route).toLowerCase();
    return clean === routeClean || clean.startsWith(`${routeClean}/`);
  });
}

function isActivationRoute(path = routePublicPath()) {
  return safeCall(helperIsActivationRoute, false, path) || routeCanonicalPath(path).startsWith("/activate-account");
}

function isResetConfirmRoute(path = routePublicPath()) {
  const clean = routeCanonicalPath(path);

  return Boolean(
    safeCall(helperIsResetPasswordConfirmRoute, false, path) ||
      clean === "/reset-password/confirm" ||
      clean.startsWith("/reset-password/confirm/") ||
      clean === "/password-reset/confirm" ||
      clean.startsWith("/password-reset/confirm/")
  );
}

function hasActivationToken(path = routePublicPath()) {
  return Boolean(safeCall(helperHasActivationToken, false, path));
}

function hasResetConfirmToken(path = routePublicPath()) {
  return Boolean(safeCall(helperHasResetToken, false, path));
}

function getCurrentRouteContext() {
  const publicPath = routePublicNormalize(routePublicPath());
  const canonicalPath = routeCanonicalPath(publicPath);

  return {
    publicPath,
    canonicalPath,
    route: canonicalPath,
    isAuthRoute: safeCall(helperIsAuthRoute, false, publicPath),
    isPublicTechnicalRoute: isPublicTechnicalRoute(publicPath),
    isActivationRoute: isActivationRoute(publicPath),
    isResetConfirmRoute: isResetConfirmRoute(publicPath),
    hasActivationToken: hasActivationToken(publicPath),
    hasResetConfirmToken: hasResetConfirmToken(publicPath),
  };
}

/* =========================================================
   MODULE PICKERS
========================================================= */

function pickExport(moduleApi, ...names) {
  for (const name of names) {
    if (isFn(moduleApi?.[name])) return moduleApi[name];
    if (isFn(moduleApi?.default?.[name])) return moduleApi.default[name];
  }

  return null;
}

function missing(name) {
  return async function missingExecutor() {
    throw new Error(`Auth: falta ${name}.`);
  };
}

/* =========================================================
   CORE HTTP BRIDGE
========================================================= */

function isPrivateMeEndpoint(path = "") {
  const clean = safeText(path, "/").split("?")[0].replace(/\/+$/g, "") || "/";
  return PRIVATE_ME_ENDPOINTS.some((endpoint) => clean === endpoint || clean.endsWith(endpoint));
}

function authRequestOptions(path = "", options = {}) {
  const opts = safeObject(options);
  const privateMe = isPrivateMeEndpoint(path);

  return {
    ...opts,
    public: privateMe ? false : opts.public === true,
    auth: privateMe ? true : opts.auth !== false,
    skipAuth: privateMe ? false : opts.skipAuth === true,
    noAuthHeader: privateMe ? false : opts.noAuthHeader === true,
    cache: opts.cache || "no-store",
  };
}

async function authApiRequest(method = "GET", path = "", body = undefined, options = {}) {
  const upper = safeText(method, "GET").toUpperCase();
  const opts = authRequestOptions(path, { ...safeObject(options), method: upper });

  if (!["GET", "HEAD", "OPTIONS"].includes(upper)) opts.body = body;

  return CoreHttp.request(path, opts);
}

/* =========================================================
   SESSION COMMIT
========================================================= */

function normalizeAuthPayload(payload = {}, options = {}) {
  const normalized = normalizeAuthResponse(payload, {
    allow2FAWithoutTempToken: true,
    ...safeObject(options),
  });

  const fallbackToken = options.useCurrentToken === false ? "" : getToken();
  const token = usableToken(normalized.token || normalized.accessToken || normalized.access_token || fallbackToken || "");
  const user = normalizeUserForFacade(normalized.user || extractUser(payload) || null);

  return {
    ...normalized,
    token: token || null,
    accessToken: token || null,
    access_token: token || null,
    user,
  };
}

function applySessionFacade(payload = {}, options = {}) {
  const source = options.source || "Auth.applySession";
  const normalized = normalizeAuthPayload(payload, options);

  const snapshot = applySession(
    {
      ...safeObject(payload),
      ...normalized,
      source,
      eventMode: options.eventMode || "manual",
    },
    {
      ...safeObject(options),
      source,
    }
  );

  try {
    CoreHttp?.setAuthTokens?.(normalized);
  } catch {}

  try {
    syncAuthState();
  } catch {}

  if (options.repairUI !== false) repairUserUI(options.reason || source, options);

  return snapshot;
}

/* =========================================================
   CORE ACTIONS
========================================================= */

async function fetchMe(options = {}) {
  if (Auth.session.mePromise) return Auth.session.mePromise;

  Auth.session.checking = true;

  Auth.session.mePromise = (async () => {
    try {
      const result = await CoreHttp.me({
        ...safeObject(options),
        auth: true,
        public: false,
        captureAuth: true,
        retries: 0,
      });

      const normalized = normalizeAuthPayload(result, {
        allowUserOnly: true,
        useCurrentToken: true,
      });

      const currentToken = normalized.token || getToken();

      if (normalized.user && currentToken) {
        applySessionFacade(
          {
            ...safeObject(result),
            ...normalized,
            token: currentToken,
            accessToken: currentToken,
            access_token: currentToken,
          },
          {
            source: "Auth.me",
            eventMode: "me",
            reason: "auth-me",
            repairUI: options.repairUI !== false,
          }
        );
      }

      Auth.session.lastMeAt = Date.now();
      Auth.session.lastError = null;

      return {
        ...safeObject(result),
        ...normalized,
        ok: normalized.ok !== false,
      };
    } catch (error) {
      Auth.session.lastError = { type: "me", message: safeMessage(error), at: nowIso() };
      throw error;
    } finally {
      Auth.session.checking = false;
      Auth.session.mePromise = null;
    }
  })();

  return Auth.session.mePromise;
}

async function refreshSession(options = {}) {
  if (Auth.session.refreshPromise) return Auth.session.refreshPromise;

  Auth.session.refreshing = true;

  Auth.session.refreshPromise = (async () => {
    try {
      const result = await CoreHttp.refreshSession({
        ...safeObject(options),
        captureAuth: true,
        retries: 0,
      });

      const normalized = normalizeAuthPayload(result, {
        allowTokenOnly: true,
        useCurrentToken: true,
      });

      const token = normalized.token || getToken();
      const user = normalized.user || getUser();

      if (token && user) {
        applySessionFacade(
          { ...safeObject(result), ...normalized, token, accessToken: token, access_token: token, user },
          {
            source: "Auth.refresh",
            eventMode: "refresh",
            reason: "auth-refresh",
            repairUI: options.repairUI !== false,
          }
        );
      } else if (token && !user) {
        try {
          await fetchMe({ repairUI: options.repairUI !== false });
        } catch {}
      }

      Auth.session.lastRefreshAt = Date.now();
      Auth.session.refreshFailCount = 0;
      Auth.session.lastError = null;

      return result;
    } catch (error) {
      Auth.session.refreshFailCount += 1;
      Auth.session.lastError = { type: "refresh", message: safeMessage(error), at: nowIso() };
      throw error;
    } finally {
      Auth.session.refreshing = false;
      Auth.session.refreshPromise = null;
    }
  })();

  return Auth.session.refreshPromise;
}

async function restoreSession(options = {}) {
  if (Auth.session.restorePromise) return Auth.session.restorePromise;

  const routeContext = getCurrentRouteContext();

  const restoreOptions = {
    ...safeObject(options),
    skipNavigation: true,
    skipRedirect: true,
    noRedirect: true,
    preserveRoute: options.preserveRoute ?? routeContext.isPublicTechnicalRoute,
    preserveCurrentRoute: options.preserveCurrentRoute ?? routeContext.isPublicTechnicalRoute,
    publicRoute: options.publicRoute ?? routeContext.isPublicTechnicalRoute,
    route: options.route || routeContext.canonicalPath,
    publicPath: options.publicPath || routeContext.publicPath,
    activationBoot: Boolean(routeContext.isActivationRoute && routeContext.hasActivationToken),
    resetConfirmBoot: Boolean(routeContext.isResetConfirmRoute && routeContext.hasResetConfirmToken),
  };

  Auth.session.restoring = true;

  Auth.session.restorePromise = (async () => {
    try {
      const result = await restoreSessionCore(Auth.session, restoreOptions);

      try {
        syncAuthState();
      } catch {}

      if (hasValidToken() && !getUser() && restoreOptions.publicRoute !== true) {
        try {
          await fetchMe({ repairUI: false });
        } catch {}
      }

      if (isAuthenticatedSafe()) repairUserUI("auth-restore", { silentEvents: true });

      Auth.session.lastRestoreAt = Date.now();
      Auth.session.restoreFailCount = 0;
      Auth.session.lastError = null;

      return result;
    } catch (error) {
      Auth.session.restoreFailCount += 1;
      Auth.session.lastError = { type: "restore", message: safeMessage(error), at: nowIso() };
      throw error;
    } finally {
      Auth.session.restoring = false;
      Auth.session.restorePromise = null;
    }
  })();

  return Auth.session.restorePromise;
}

async function login(credentials = {}, options = {}) {
  if (Auth.session.loginPromise) return Auth.session.loginPromise;

  Auth.session.loggingIn = true;
  Auth.session.twoFactorPending = false;

  const startedAt = Date.now();

  Auth.session.loginPromise = (async () => {
    try {
      const result = await coreLogin(credentials, {
        ...safeObject(options),
        emitLoginSuccessEvent: false,
      });

      if (result?.requires2FA) {
        Auth.session.twoFactorPending = true;

        emit("auth:login:2fa-required", {
          authenticated: false,
          requires2FA: true,
          redirectTo: result.redirectTo || "/2fa",
          hasUser: Boolean(result.user),
        });

        return result;
      }

      try {
        syncAuthState();
      } catch {}

      if (!isAuthenticatedSafe()) {
        const normalized = normalizeAuthPayload(result, { useCurrentToken: true });
        if (normalized.token && normalized.user) {
          applySessionFacade(normalized, { source: "Auth.login", eventMode: "login", reason: "auth-login" });
        }
      }

      if (!isAuthenticatedSafe()) throw new Error("Login inválido: no hay sesión autenticada usable.");

      const user = getUser();

      Auth.session.lastLoginAt = Date.now();
      Auth.session.loginFailCount = 0;
      Auth.session.lastError = null;

      emit("auth:login:success", {
        durationMs: Date.now() - startedAt,
        authenticated: true,
        user,
        role: getRole(),
        roles: getRoles(),
        redirectTo: result?.redirectTo || null,
        sessionId: result?.sessionId || AppCore?.state?.sessionId || null,
      });

      repairUserUI("auth-login", { silentEvents: true });

      return {
        ...safeObject(result),
        ok: true,
        success: true,
        authenticated: true,
        user,
        role: getRole(),
        roles: getRoles(),
      };
    } catch (error) {
      Auth.session.loginFailCount += 1;
      Auth.session.lastLoginErrorAt = Date.now();
      Auth.session.lastError = { type: "login", message: safeMessage(error), at: nowIso() };
      throw error;
    } finally {
      Auth.session.loggingIn = false;
      Auth.session.loginPromise = null;
    }
  })();

  return Auth.session.loginPromise;
}

async function handleLoginFormSubmit(formElement, options = {}) {
  if (isFn(coreHandleLoginFormSubmit)) {
    const result = await coreHandleLoginFormSubmit(formElement, {
      ...safeObject(options),
      emitLoginSuccessEvent: false,
    });

    if (result?.authenticated || isAuthenticatedSafe()) {
      emit("auth:login:success", { authenticated: true, user: getUser(), role: getRole(), roles: getRoles() });
      repairUserUI("auth-login-form", { silentEvents: true });
    }

    return result;
  }

  const HTMLForm = isBrowser() ? window.HTMLFormElement : null;

  if (!HTMLForm || !(formElement instanceof HTMLForm)) throw new Error("Se esperaba un formulario HTML válido.");

  options?.event?.preventDefault?.();

  const formData = new FormData(formElement);

  return login(
    {
      identifier: formData.get("identifier") || formData.get("username") || formData.get("email") || formData.get("phone") || formData.get("telefono") || formData.get("user") || formData.get("login") || "",
      password: formData.get("password") || "",
      remember: ["on", "true", "1"].includes(String(formData.get("remember") || "").toLowerCase()),
    },
    options
  );
}

async function logout(options = {}) {
  const result = await coreLogout({ ...safeObject(options), skipRedirect: true, noRedirect: true });

  try {
    CoreHttp?.clearAuthTokens?.();
  } catch {}

  try {
    syncAuthState();
  } catch {}

  repairUserUI("auth-logout", { silentEvents: true });
  return result;
}

function clearSession(options = {}) {
  const routeContext = getCurrentRouteContext();
  const preserve = options.preserveRoute ?? routeContext.isPublicTechnicalRoute;

  try {
    clearSessionLocal({
      ...safeObject(options),
      silent: options.silent !== false,
      source: "Auth.clearSession",
      preserveRoute: preserve,
      preserveCurrentRoute: preserve,
      route: routeContext.canonicalPath,
      publicPath: routeContext.publicPath,
    });
  } catch {}

  try {
    clearAuthStorage({ silent: true, includeLegacy: true });
  } catch {}

  try {
    CoreHttp?.clearAuthTokens?.();
  } catch {}

  try {
    syncAuthState();
  } catch {}

  repairUserUI("auth-clear-session", { silentEvents: true });
  return true;
}

/* =========================================================
   FLOW RE-EXPORTS
========================================================= */

const activateAccount = pickExport(ActivationApi, "activateAccount", "activate", "activation") || missing("activateAccount");
const activateFirstUser = pickExport(ActivationApi, "activateFirstUser", "firstUserActivation", "activateInitialUser") || missing("activateFirstUser");
const validateActivationToken = pickExport(ActivationApi, "validateActivationToken", "validateActivateAccountToken", "activationValidate") || missing("validateActivationToken");

const verifyTwoFactorCore = pickExport(TwoFactorApi, "verifyTwoFactor", "verify2FA", "login2fa", "twoFactorLogin", "verifyMfa", "mfaLogin") || missing("verifyTwoFactor");
const requestTwoFactorCode = pickExport(TwoFactorApi, "requestTwoFactorCode", "request2FA", "requestMfa", "sendTwoFactorCode") || missing("requestTwoFactorCode");
const resendTwoFactorCode = pickExport(TwoFactorApi, "resendTwoFactorCode", "resend2FA", "resendMfa") || missing("resendTwoFactorCode");

async function verifyTwoFactor(payload = {}, options = {}) {
  const result = await verifyTwoFactorCore(payload, options);

  if (result?.authenticated || result?.sessionApplied || isAuthenticatedSafe()) {
    try {
      syncAuthState();
    } catch {}

    emit("auth:login:success", { authenticated: true, user: getUser(), role: getRole(), roles: getRoles(), reason: "2fa" });
    repairUserUI("auth-2fa-success", { silentEvents: true });
  }

  return result;
}

const requestPasswordReset = pickExport(PasswordResetApi, "requestPasswordReset", "forgotPassword", "resetPasswordRequest", "requestResetPassword") || missing("requestPasswordReset");
const confirmResetPassword = pickExport(PasswordResetApi, "confirmResetPassword", "resetPasswordConfirm", "confirmPasswordReset") || missing("confirmResetPassword");
const validateResetPasswordToken = pickExport(PasswordResetApi, "validateResetPasswordToken", "validateResetToken", "resetPasswordValidate") || missing("validateResetPasswordToken");

function guardUnsupportedRole() {
  return {
    ok: false,
    allowed: false,
    authenticated: isAuthenticatedSafe(),
    reason: "unsupported-role",
    role: getRole(),
    roles: getRoles(),
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getAuthModuleSnapshot() {
  const user = getUser();

  return sanitizePayload({
    version: AUTH_MODULE_VERSION,
    authenticated: isAuthenticatedSafe(),
    hasToken: hasValidToken(),
    hasUser: Boolean(user),
    user: user
      ? {
          id: user.id || user.userId || null,
          userId: user.userId || user.id || null,
          username: user.username || user.usernameLower || user.slug || null,
          displayName: user.displayName || user.name || null,
          role: user.role || user.rol || null,
          hasAvatar: Boolean(user.avatar || user.avatarUrl || user.picture),
          avatarUrl: user.avatarUrl || user.avatar || null,
        }
      : null,
    role: getRole() || null,
    roles: getRoles(),
    permissions: getPermissions(),
    isAdmin: isAdmin(),
    isSupport: false,
    isManager: false,
    isClient: false,
    route: getCurrentRouteContext(),
    session: {
      loggingIn: Boolean(Auth.session.loggingIn),
      restoring: Boolean(Auth.session.restoring),
      checking: Boolean(Auth.session.checking),
      refreshing: Boolean(Auth.session.refreshing),
      twoFactorPending: Boolean(Auth.session.twoFactorPending),
      loginFailCount: Auth.session.loginFailCount || 0,
      refreshFailCount: Auth.session.refreshFailCount || 0,
      restoreFailCount: Auth.session.restoreFailCount || 0,
      lastError: Auth.session.lastError || null,
    },
    storage: {
      hasRefreshToken: hasRefreshToken(),
      hasRefreshContext: hasRefreshContext(),
      hasTempToken: Boolean(getStoredTempToken()),
      hasSessionId: Boolean(getStoredSessionId()),
      hasSessionUserId: Boolean(getStoredSessionUserId()),
      refreshToken: null,
      tempToken: null,
      sessionId: getStoredSessionId() ? "***" : null,
      sessionUserId: getStoredSessionUserId() ? "***" : null,
    },
    debug: {
      session: safeCall(getSessionDebugSnapshot, null),
      login: safeCall(getLoginSnapshot, null),
      restore: safeCall(getRestoreSnapshot, null, Auth.session),
      guards: safeCall(getAuthGuardsSnapshot, null),
      logout: safeCall(getLogoutSnapshot, null),
    },
    backend: {
      origin: BACKEND_ORIGIN,
      apiBase: safeCall(CoreHttp?.getApiOrigin, BACKEND_ORIGIN) || BACKEND_ORIGIN,
      meEndpoint: AUTH_ENDPOINTS?.me || "/api/auth/me",
      mePrivate: true,
    },
    policy: {
      ownFetch: false,
      ownApiClient: false,
      ownRouter: false,
      ownToast: false,
      roles: [...VALID_ROLES],
      authenticatedRequiresTokenAndUser: true,
    },
    at: nowIso(),
  });
}

/* =========================================================
   CORE BRIDGE
========================================================= */

function attachToCore(api) {
  try {
    AppCore.Auth = api;
    AppCore.auth = api;
  } catch {}

  try {
    AppCore.modules?.register?.("Auth", api, { replace: true, overwrite: true, emit: false, source: "features/auth/index.js" });
    AppCore.modules?.register?.("auth", api, { replace: true, overwrite: true, emit: false, source: "features/auth/index.js" });
  } catch {}

  try {
    AppCore.registry?.modules?.set?.("Auth", api);
    AppCore.registry?.modules?.set?.("auth", api);
  } catch {}

  try {
    if (isBrowser()) {
      window.Auth = api;
      window.OnionAuth = api;
    }
  } catch {}

  return true;
}

/* =========================================================
   AUTH SINGLETON
========================================================= */

export const Auth = {
  version: AUTH_MODULE_VERSION,

  AUTH_ENDPOINTS,
  AUTH_STORAGE_KEYS,
  AUTH_CONSTANTS,

  session: {
    loggingIn: false,
    restoring: false,
    checking: false,
    refreshing: false,
    twoFactorPending: false,
    loginPromise: null,
    restorePromise: null,
    refreshPromise: null,
    mePromise: null,
    loginFailCount: 0,
    refreshFailCount: 0,
    restoreFailCount: 0,
    lastLoginAt: null,
    lastLoginErrorAt: null,
    lastRestoreAt: null,
    lastRefreshAt: null,
    lastMeAt: null,
    lastError: null,
  },

  getUser,
  getCurrentUser,
  currentUser,
  getProfile,
  getAccount,
  getSessionUser,
  getToken,
  getAccessToken,
  hasValidToken,
  isAuthenticated: isAuthenticatedSafe,
  syncAuthState,
  getRole,
  getRoles,
  getPermissions,
  getCurrentRole: getRole,
  getCurrentRoles: getRoles,
  isCurrentUserAdmin: isAdmin,
  isCurrentUserSupport: unsupportedLegacyRole,
  isCurrentUserManager: unsupportedLegacyRole,
  isCurrentUserClient: unsupportedLegacyRole,
  hasRole: hasRoleFacade,
  requireRole: requireRoleFacade,

  login,
  logout,
  handleLoginFormSubmit,
  fetchMe,
  me: fetchMe,
  loadMe: fetchMe,
  refreshSession,
  refresh: refreshSession,
  refreshToken: refreshSession,
  restoreSession,
  restore: restoreSession,
  clearSession,
  clearSessionLocal,
  applySession: applySessionFacade,

  guardAuthenticated,
  guardRole,
  guardGuest,
  guardAdmin,
  guardSupport: guardUnsupportedRole,
  guardManager: guardUnsupportedRole,
  requireAuth: guardAuthenticated,
  ensureAuthenticated: guardAuthenticated,
  requireGuest: guardGuest,
  requireAdmin: guardAdmin,
  requireSupport: guardUnsupportedRole,
  requireManager: guardUnsupportedRole,
  can: hasRoleFacade,
  canAccess: canAccessRoute,
  canAccessRoute,
  buildGuardErrorPayload,

  getAuthHeader,
  buildSessionSnapshot,
  getSessionDebugSnapshot,

  resolveLoginIdentifier,
  normalizeLoginPayload,
  buildLoginRequestBody,
  buildLoginRedirectPath,
  getPostLoginTarget,

  activateAccount,
  activate: activateAccount,
  activation: activateAccount,
  confirmActivation: activateAccount,
  activateFirstUser,
  firstUserActivation: activateFirstUser,
  activateInitialUser: activateFirstUser,
  validateActivationToken,
  validateActivateAccountToken: validateActivationToken,
  activationValidate: validateActivationToken,
  resolveActivationToken: pickExport(ActivationApi, "resolveActivationToken", "extractActivationToken") || (() => ""),
  normalizeActivationPayload: pickExport(ActivationApi, "normalizeActivationPayload", "normalizeActivateAccountPayload") || ((payload = {}) => payload),
  buildActivationRequestBody: pickExport(ActivationApi, "buildActivationRequestBody", "buildActivateAccountBody") || ((payload = {}) => payload),
  normalizeActivationResponse: pickExport(ActivationApi, "normalizeActivationResponse", "normalizeActivateAccountResponse") || ((response = {}) => response),

  verifyTwoFactor,
  verify2FA: verifyTwoFactor,
  login2fa: verifyTwoFactor,
  twoFactorLogin: verifyTwoFactor,
  twoFactorVerify: verifyTwoFactor,
  verifyMfa: verifyTwoFactor,
  mfaLogin: verifyTwoFactor,
  submitTwoFactorCode: verifyTwoFactor,
  requestTwoFactorCode,
  request2FA: requestTwoFactorCode,
  requestMfa: requestTwoFactorCode,
  sendTwoFactorCode: requestTwoFactorCode,
  resendTwoFactorCode,
  resend2FA: resendTwoFactorCode,
  resendMfa: resendTwoFactorCode,
  resolveTwoFactorTempToken: pickExport(TwoFactorApi, "resolveTwoFactorTempToken") || (() => getStoredTempToken() || ""),
  normalizeTwoFactorPayload: pickExport(TwoFactorApi, "normalizeTwoFactorPayload", "normalizeVerifyTwoFactorPayload") || ((payload = {}) => payload),
  buildTwoFactorVerifyBody: pickExport(TwoFactorApi, "buildTwoFactorVerifyBody", "buildVerifyTwoFactorBody") || ((payload = {}) => payload),
  normalizeTwoFactorResponse: pickExport(TwoFactorApi, "normalizeTwoFactorResponse", "normalizeVerifyTwoFactorResponse") || ((response = {}) => response),
  isTwoFactorRoute: pickExport(TwoFactorApi, "isTwoFactorRoute") || (() => false),
  getTwoFactorRedirectPath: pickExport(TwoFactorApi, "getTwoFactorRedirectPath") || (() => "/2fa"),

  requestPasswordReset,
  resetPasswordRequest: requestPasswordReset,
  requestResetPassword: requestPasswordReset,
  passwordResetRequest: requestPasswordReset,
  forgotPassword: requestPasswordReset,
  recoverPassword: requestPasswordReset,
  confirmResetPassword,
  resetPasswordConfirm: confirmResetPassword,
  confirmPasswordReset: confirmResetPassword,
  passwordResetConfirm: confirmResetPassword,
  validateResetPasswordToken,
  validateResetToken: validateResetPasswordToken,
  resetPasswordValidate: validateResetPasswordToken,
  validatePasswordReset: validateResetPasswordToken,
  passwordResetValidate: validateResetPasswordToken,
  resolveResetPasswordIdentifier: pickExport(PasswordResetApi, "resolveResetPasswordIdentifier") || ((payload = {}) => safeText(payload?.identifier || payload?.email || payload?.username || payload)),
  resolveResetPasswordToken: pickExport(PasswordResetApi, "resolveResetPasswordToken") || (() => ""),
  normalizeResetPasswordPayload: pickExport(PasswordResetApi, "normalizeResetPasswordPayload") || ((payload = {}) => payload),
  normalizeConfirmResetPasswordPayload: pickExport(PasswordResetApi, "normalizeConfirmResetPasswordPayload") || ((payload = {}) => payload),
  buildResetPasswordRequestBody: pickExport(PasswordResetApi, "buildResetPasswordRequestBody") || ((payload = {}) => payload),
  buildConfirmResetPasswordBody: pickExport(PasswordResetApi, "buildConfirmResetPasswordBody") || ((payload = {}) => payload),
  normalizeResetPasswordResponse: pickExport(PasswordResetApi, "normalizeResetPasswordResponse") || ((response = {}) => response),
  normalizeConfirmResetPasswordResponse: pickExport(PasswordResetApi, "normalizeConfirmResetPasswordResponse") || ((response = {}) => response),

  hasRefreshToken,
  hasRefreshContext,
  getStoredRefreshToken,
  getStoredTempToken,
  getStoredSessionId,
  getStoredSessionUserId,

  getCurrentRouteContext,
  getCurrentPublicPath,
  getCurrentCanonicalPath,
  isAuthRoute: helperIsAuthRoute,
  isPublicTechnicalRoute,
  isActivationRoute,
  isResetConfirmRoute,
  hasActivationToken,
  hasResetConfirmToken,
  normalizePublicPath: routePublicNormalize,
  normalizeCanonicalPath: routeCanonicalPath,
  sanitizeRedirectPath,

  normalizeUser,
  normalizeAuthPayload,
  normalizeAuthResponse,
  extractUser,
  extractToken,
  authApiRequest,
  getAuthModuleSnapshot,
  getSnapshot: getAuthModuleSnapshot,
  getDebugSnapshot: getAuthModuleSnapshot,
};

attachToCore(Auth);

try {
  Object.freeze(Auth);
} catch {}

export default Auth;
