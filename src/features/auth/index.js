/* =========================================================
   Onion SPA - Auth Facade
   Archivo: src/features/auth/index.js

   AUTH FACADE · SIMPLE ORCHESTRATOR · NO GHOST AUTH

   Responsabilidades:
   - Punto público único de Auth.
   - Delegar login/logout/restore/refresh/me/guards/flows.
   - Mantener AppCore.Auth/AppCore.auth.
   - Emitir auth:login:success una sola vez desde fachada.
   - Reparar sidebar/topbar tras sesión real.
   - No duplicar motores de normalización/transporte.
   - No exponer tokens en eventos/snapshots.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  AUTH_ENDPOINTS,
  AUTH_STORAGE_KEYS,
  AUTH_CONSTANTS,
  AUTH_PUBLIC_TECHNICAL_ROUTES,
  getPublicAuthRequestOptions,
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
  isAuthenticated,
  getCurrentUser as sessionGetCurrentUser,
  getCurrentToken as sessionGetCurrentToken,
  getCurrentRole,
  getCurrentRoles,
  isCurrentUserAdmin,
  isCurrentUserSupport,
  isCurrentUserManager,
  isCurrentUserClient,
  hasRole,
  requireRole,
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
  fetchMe as restoreFetchMe,
  refreshSession as restoreRefreshSession,
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
  guardSupport,
  guardManager,
  canAccessRoute,
  syncAuthState,
  buildGuardErrorPayload,
  getAuthGuardsSnapshot,
} from "./guards.js";

import * as ActivationApi from "./activation.js";
import * as TwoFactorApi from "./2fa.js";
import * as PasswordResetApi from "./password-reset.js";

/* =========================================================
   VERSION
========================================================= */

export const AUTH_MODULE_VERSION = "17.0.0-simple-facade";

const SOURCE = "Auth";
const BACKEND_ORIGIN = "https://api.onionit.net";

const PRIVATE_ME_ENDPOINTS = Object.freeze([
  "/me",
  "/api/me",
  "/auth/me",
  "/api/auth/me",
]);

const PUBLIC_TECHNICAL_ROUTES = Object.freeze([
  ...(Array.isArray(AUTH_PUBLIC_TECHNICAL_ROUTES)
    ? AUTH_PUBLIC_TECHNICAL_ROUTES
    : []),
  "/login",
  "/activate-account",
  "/reset-password",
  "/reset-password/confirm",
  "/forgot-password",
  "/recover-password",
  "/password-reset",
  "/password-reset/confirm",
  "/2fa",
  "/otp",
  "/mfa",
]);

const SENSITIVE_KEYS_RE =
  /token|authorization|password|secret|credential|cookie|jwt|bearer|refresh|access|otp|mfa|2fa|code|totp|csrf|xsrf/i;

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
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
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
        .map((item) => safeText(item))
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
    return safeText(value)
      .replace(
        /([?&#](?:token|code|t|otp|totp|access_token|refresh_token|id_token|tempToken|temp_token)=)([^&#\s]+)/gi,
        "$1***"
      )
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(
        /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        "***"
      );
  }
}

function sanitizeUser(user = null) {
  if (!isObject(user)) return null;

  const output = {
    ...user,
  };

  for (const key of Object.keys(output)) {
    if (
      SENSITIVE_KEYS_RE.test(key) ||
      key.startsWith("_")
    ) {
      delete output[key];
    }
  }

  if (output.avatarUrl) output.avatarUrl = redact(output.avatarUrl);
  if (output.avatar) output.avatar = redact(output.avatar);
  if (output.picture) output.picture = redact(output.picture);

  return output;
}

function sanitizePayload(value, depth = 0, seen = new WeakSet()) {
  if (depth > 6) return "[MaxDepth]";

  if (typeof value === "string") return redact(value);

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[Function]";

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redact(value.message || ""),
      status: value.status || value.statusCode || value.response?.status || null,
      code: value.code || value.data?.code || value.response?.data?.code || null,
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) => sanitizePayload(item, depth + 1, seen));
  }

  if (isObject(value)) {
    try {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    } catch {}

    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      if (SENSITIVE_KEYS_RE.test(key)) {
        output[key] = item ? "***" : item;
        continue;
      }

      if (["user", "currentUser", "profile", "account", "sessionUser"].includes(key)) {
        output[key] = sanitizeUser(item);
        continue;
      }

      if (
        typeof item === "string" &&
        /path|url|redirect|endpoint/i.test(key)
      ) {
        output[key] = redact(item);
        continue;
      }

      output[key] = sanitizePayload(item, depth + 1, seen);
    }

    return output;
  }

  return String(value);
}

function emit(eventName = "", payload = {}, options = {}) {
  if (
    options.emit === false ||
    options.emitEvents === false ||
    options.silentEvents === true
  ) {
    return false;
  }

  const name = safeText(eventName);
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
    if (isBrowser()) {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    }
  } catch {}

  return false;
}

function repairUserUI(reason = "auth-session", options = {}) {
  try {
    AppCore?.syncUserUI?.({
      reason,
      source: SOURCE,
    });
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
    options
  );

  return true;
}

/* =========================================================
   STATE HELPERS
========================================================= */

function hasToken(value = sessionGetCurrentToken()) {
  const token = safeText(value).replace(/^Bearer\s+/i, "").trim();

  if (!token) return false;
  if (/[\s\r\n\t]/.test(token)) return false;

  const lower = token.toLowerCase();

  if (
    [
      "null",
      "undefined",
      "false",
      "true",
      "none",
      "nan",
      "[object object]",
      "{}",
      "[]",
    ].includes(lower)
  ) {
    return false;
  }

  try {
    if (isFn(AppCore?.utils?.hasValidToken)) {
      return Boolean(AppCore.utils.hasValidToken(token));
    }
  } catch {}

  return true;
}

function normalizeUserForFacade(user = null) {
  if (!isObject(user)) return null;

  try {
    const normalized = normalizeUser(user);
    if (normalized?.active !== false) return normalized;
  } catch {}

  return user.active === false ? null : user;
}

function getUser() {
  const fromSession = safeCall(sessionGetCurrentUser, null);
  const state = safeObject(AppCore?.state);

  return normalizeUserForFacade(
    fromSession ||
      state.user ||
      state.currentUser ||
      state.sessionUser ||
      state.authUser ||
      state.account ||
      state.profile ||
      state.session?.user ||
      state.session?.usuario ||
      state.sessionData?.user ||
      state.sessionData?.usuario ||
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
  return safeCall(sessionGetCurrentToken, "") || null;
}

function getAccessToken() {
  return getToken();
}

function hasValidToken() {
  return hasToken(getToken());
}

function isAuthenticatedSafe() {
  try {
    return Boolean(isAuthenticated());
  } catch {
    return Boolean(hasValidToken() && getUser());
  }
}

function getRole() {
  return (
    safeCall(getCurrentRole, "") ||
    getUser()?.role ||
    getUser()?.rol ||
    ""
  );
}

function getRoles() {
  return unique([
    ...safeArray(safeCall(getCurrentRoles, [])),
    ...safeArray(getUser()?.roles),
    getRole(),
  ]);
}

function getPermissions() {
  const user = getUser();

  return unique([
    ...safeArray(user?.permissions),
    ...safeArray(user?.permisos),
  ]);
}

/* =========================================================
   ROUTES
========================================================= */

function routePublicPath() {
  return safeCall(getCurrentPublicPath, "") ||
    safeText(AppCore?.state?.publicPath) ||
    safeText(AppCore?.state?.route) ||
    "/";
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
  return safeCall(helperIsActivationRoute, false, path) ||
    routeCanonicalPath(path).startsWith("/activate-account");
}

function isResetConfirmRoute(path = routePublicPath()) {
  const clean = routeCanonicalPath(path);

  return safeCall(helperIsResetPasswordConfirmRoute, false, path) ||
    clean === "/reset-password/confirm" ||
    clean.startsWith("/reset-password/confirm/") ||
    clean === "/password-reset/confirm" ||
    clean.startsWith("/password-reset/confirm/");
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
   API REQUEST MINI-BRIDGE
========================================================= */

function isPrivateMeEndpoint(path = "") {
  const clean = safeText(path).split("?")[0].replace(/\/+$/g, "") || "/";

  return PRIVATE_ME_ENDPOINTS.some((endpoint) => clean === endpoint || clean.endsWith(endpoint));
}

function resolveApiBase() {
  const raw = safeText(
    AppCore?.config?.apiBase ||
      AppCore?.config?.apiOrigin ||
      AppCore?.config?.apiUrl ||
      AppCore?.config?.api?.baseUrl ||
      AppCore?.config?.api?.base ||
      BACKEND_ORIGIN,
    BACKEND_ORIGIN
  );

  try {
    const parsed = new URL(raw);
    const origin = parsed.origin.replace(/\/+$/g, "");
    const pathname = (parsed.pathname || "/").replace(/\/+$/g, "") || "/";

    if (pathname === "/" || pathname === "/api") return origin;

    return `${origin}${pathname}`.replace(/\/+$/g, "");
  } catch {
    return raw.replace(/\/+$/g, "") || BACKEND_ORIGIN;
  }
}

function buildApiUrl(path = "") {
  const endpoint = safeText(path, "/");

  if (/^https?:\/\//i.test(endpoint)) return endpoint;

  const base = resolveApiBase();
  let cleanPath = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  if (base.endsWith("/api") && cleanPath.startsWith("/api/")) {
    cleanPath = cleanPath.slice(4);
  }

  return `${base}${cleanPath}`;
}

function getHttpClient() {
  return (
    AppCore?.http ||
    AppCore?.Http ||
    AppCore?.apiClient ||
    AppCore?.services?.http ||
    AppCore?.services?.Http ||
    AppCore?.services?.apiClient ||
    AppCore?.services?.api ||
    null
  );
}

function buildRequestOptions(path = "", options = {}) {
  const privateMe = isPrivateMeEndpoint(path);

  const basePublicOptions =
    options.public === true && !privateMe
      ? safeCall(getPublicAuthRequestOptions, {}, options)
      : {};

  return {
    ...basePublicOptions,
    ...safeObject(options),

    public: privateMe ? false : options.public === true,
    auth: privateMe ? true : options.auth !== false,
    skipAuth: privateMe ? false : options.skipAuth === true,
    noAuthHeader: privateMe ? false : options.noAuthHeader === true,

    noStore: true,
    cache: "no-store",

    headers: {
      ...(safeObject(options.headers)),
      ...(options.auth === false || options.skipAuth === true || options.public === true
        ? {}
        : getAuthHeader()),
    },
  };
}

function shouldFetchFallback(error) {
  const status =
    error?.status ||
    error?.statusCode ||
    error?.response?.status ||
    error?.data?.status ||
    0;

  if (status) return false;
  if (error?.name === "AbortError") return false;

  return true;
}

async function requestWithClient(method = "GET", path = "", body = undefined, options = {}) {
  const client = getHttpClient();

  if (!client) throw new Error("HTTP_CLIENT_MISSING");

  const requestOptions = buildRequestOptions(path, {
    ...options,
    method,
    body,
  });

  const upper = safeText(method, "GET").toUpperCase();

  if (upper === "GET" && isFn(client.get)) return client.get(path, requestOptions);
  if (upper === "POST" && isFn(client.post)) return client.post(path, body, requestOptions);
  if (upper === "PUT" && isFn(client.put)) return client.put(path, body, requestOptions);
  if (upper === "PATCH" && isFn(client.patch)) return client.patch(path, body, requestOptions);
  if (upper === "DELETE" && isFn(client.delete)) return client.delete(path, requestOptions);

  if (isFn(client.request)) {
    try {
      return await client.request(upper, path, requestOptions);
    } catch (error) {
      if (!shouldFetchFallback(error)) throw error;

      return client.request(path, {
        ...requestOptions,
        method: upper,
      });
    }
  }

  if (isFn(client)) {
    return client(path, requestOptions);
  }

  throw new Error("HTTP_CLIENT_INVALID");
}

async function requestWithFetch(method = "GET", path = "", body = undefined, options = {}) {
  if (typeof fetch !== "function") throw new Error("FETCH_UNAVAILABLE");

  const requestOptions = buildRequestOptions(path, options);
  const upper = safeText(method, "GET").toUpperCase();

  const hasBody =
    body !== undefined &&
    body !== null &&
    upper !== "GET" &&
    upper !== "HEAD";

  const headers = {
    Accept: "application/json",
    ...(requestOptions.headers || {}),
  };

  if (
    hasBody &&
    typeof FormData !== "undefined" &&
    !(body instanceof FormData) &&
    !headers["Content-Type"] &&
    !headers["content-type"]
  ) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(buildApiUrl(path), {
    method: upper,
    headers,
    credentials: requestOptions.credentials || "include",
    cache: "no-store",
    signal: requestOptions.signal || undefined,
    body: hasBody
      ? typeof FormData !== "undefined" && body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined,
  });

  const contentType = response.headers?.get?.("content-type") || "";

  let data = null;

  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = {};
    }
  } else {
    try {
      data = await response.text();
    } catch {
      data = "";
    }
  }

  if (!response.ok) {
    const error = new Error(
      safeText(data?.message || data?.error?.message || data?.error || response.statusText, `HTTP ${response.status}`)
    );

    error.name = "AuthApiError";
    error.status = response.status;
    error.data = data;
    error.response = response;
    error.code = data?.code || data?.error?.code || data?.error || null;

    throw error;
  }

  return data;
}

async function authApiRequest(method = "GET", path = "", body = undefined, options = {}) {
  try {
    return await requestWithClient(method, path, body, options);
  } catch (error) {
    if (options.noFetchFallback === true || !shouldFetchFallback(error)) throw error;

    return requestWithFetch(method, path, body, options);
  }
}

/* =========================================================
   SESSION COMMIT
========================================================= */

function normalizeAuthPayload(payload = {}, options = {}) {
  const normalized = normalizeAuthResponse(payload, {
    allow2FAWithoutTempToken: true,
    ...safeObject(options),
  });

  const fallbackToken =
    options.useCurrentToken === false
      ? ""
      : getToken();

  const token = normalized.token || normalized.accessToken || fallbackToken || "";

  return {
    ...normalized,

    token: token || null,
    accessToken: token || null,
    access_token: token || null,

    user: normalizeUserForFacade(normalized.user || extractUser(payload) || null),
  };
}

function applySessionFacade(payload = {}, options = {}) {
  const source = options.source || "Auth.applySession";

  const snapshot = applySession(
    {
      ...safeObject(payload),
      source,
      eventMode: options.eventMode || "manual",
    },
    {
      ...safeObject(options),
      source,
    }
  );

  try {
    syncAuthState();
  } catch {}

  if (options.repairUI !== false) {
    repairUserUI(options.reason || source, options);
  }

  return snapshot;
}

/* =========================================================
   CORE ACTION WRAPPERS
========================================================= */

async function fetchMe(options = {}) {
  if (Auth.session.mePromise) return Auth.session.mePromise;

  Auth.session.checking = true;

  Auth.session.mePromise = (async () => {
    try {
      let result = null;

      if (options.forceDirect === true) {
        result = await fetchMeDirect(options);
      } else {
        try {
          result = await restoreFetchMe(Auth.session);
        } catch (error) {
          if (!shouldFetchFallback(error)) throw error;
          result = await fetchMeDirect(options);
        }
      }

      try {
        syncAuthState();
      } catch {}

      repairUserUI("auth-me");

      Auth.session.lastMeAt = Date.now();
      Auth.session.lastError = null;

      return result;
    } catch (error) {
      Auth.session.lastError = {
        type: "me",
        message: safeMessage(error),
        at: nowIso(),
      };

      throw error;
    } finally {
      Auth.session.checking = false;
      Auth.session.mePromise = null;
    }
  })();

  return Auth.session.mePromise;
}

async function fetchMeDirect(options = {}) {
  const result = await authApiRequest(
    "GET",
    AUTH_ENDPOINTS?.me || "/api/auth/me",
    undefined,
    {
      ...safeObject(options),
      auth: true,
      public: false,
      skipAuth: false,
    }
  );

  const normalized = normalizeAuthPayload(result, {
    allowUserOnly: true,
    useCurrentToken: true,
  });

  if (normalized.user && (normalized.token || getToken())) {
    applySessionFacade(
      {
        ...result,
        ...normalized,
        token: normalized.token || getToken(),
        accessToken: normalized.token || getToken(),
        access_token: normalized.token || getToken(),
        authenticated: Boolean(normalized.token || getToken()),
      },
      {
        source: "Auth.fetchMeDirect",
        eventMode: "me",
        reason: "auth-me-direct",
      }
    );
  }

  return {
    ...safeObject(result),
    ...normalized,
    ok: normalized.ok !== false,
  };
}

async function refreshSession(options = {}) {
  if (Auth.session.refreshPromise) return Auth.session.refreshPromise;

  Auth.session.refreshing = true;

  Auth.session.refreshPromise = (async () => {
    try {
      const result = await restoreRefreshSession(Auth.session);
      const normalized = normalizeAuthPayload(result, {
        allowTokenOnly: true,
        useCurrentToken: true,
      });

      if (normalized.token && normalized.user) {
        applySessionFacade(
          normalized,
          {
            source: "Auth.refresh",
            eventMode: "refresh",
            reason: "auth-refresh",
          }
        );
      } else if (normalized.token && !getUser()) {
        try {
          await fetchMe({
            forceDirect: true,
          });
        } catch {}
      }

      Auth.session.lastRefreshAt = Date.now();
      Auth.session.refreshFailCount = 0;

      return result;
    } catch (error) {
      Auth.session.refreshFailCount += 1;
      Auth.session.lastError = {
        type: "refresh",
        message: safeMessage(error),
        at: nowIso(),
      };

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
          await fetchMe({
            forceDirect: true,
          });
        } catch {}
      }

      if (isAuthenticatedSafe()) {
        repairUserUI("auth-restore");
      }

      Auth.session.lastRestoreAt = Date.now();
      Auth.session.restoreFailCount = 0;

      return result;
    } catch (error) {
      Auth.session.restoreFailCount += 1;
      Auth.session.lastError = {
        type: "restore",
        message: safeMessage(error),
        at: nowIso(),
      };

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
        const normalized = normalizeAuthPayload(result, {
          useCurrentToken: true,
        });

        if (normalized.token && normalized.user) {
          applySessionFacade(normalized, {
            source: "Auth.login",
            eventMode: "login",
            reason: "auth-login",
          });
        }
      }

      if (!isAuthenticatedSafe()) {
        throw new Error("Login inválido: no hay sesión autenticada usable.");
      }

      const user = getUser();

      Auth.session.lastLoginAt = Date.now();
      Auth.session.loginFailCount = 0;

      emit("auth:login:success", {
        durationMs: Date.now() - startedAt,
        authenticated: true,
        user,
        role: getRole(),
        roles: getRoles(),
        redirectTo: result?.redirectTo || null,
        sessionId: result?.sessionId || AppCore?.state?.sessionId || null,
      });

      repairUserUI("auth-login");

      afterPaint(() => {
        repairUserUI("auth-login-after-paint", {
          silentEvents: true,
        });
      });

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
      Auth.session.lastError = {
        type: "login",
        message: safeMessage(error),
        at: nowIso(),
      };

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

    if (result?.authenticated) {
      emit("auth:login:success", {
        authenticated: true,
        user: getUser(),
        role: getRole(),
        roles: getRoles(),
      });

      repairUserUI("auth-login-form");
    }

    return result;
  }

  const HTMLForm = isBrowser() ? window.HTMLFormElement : null;

  if (!HTMLForm || !(formElement instanceof HTMLForm)) {
    throw new Error("Se esperaba un formulario HTML válido.");
  }

  options?.event?.preventDefault?.();

  const formData = new FormData(formElement);

  return login(
    {
      identifier:
        formData.get("identifier") ||
        formData.get("username") ||
        formData.get("email") ||
        formData.get("phone") ||
        formData.get("telefono") ||
        formData.get("user") ||
        formData.get("login") ||
        "",
      password: formData.get("password") || "",
      remember:
        formData.get("remember") === "on" ||
        formData.get("remember") === "true" ||
        formData.get("remember") === "1",
    },
    options
  );
}

async function logout(options = {}) {
  const result = await coreLogout(options);

  try {
    syncAuthState();
  } catch {}

  repairUserUI("auth-logout", {
    silentEvents: true,
  });

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
    clearAuthStorage({
      silent: true,
      includeLegacy: true,
    });
  } catch {}

  try {
    syncAuthState();
  } catch {}

  repairUserUI("auth-clear-session", {
    silentEvents: true,
  });

  return true;
}

/* =========================================================
   FLOW RE-EXPORTS
========================================================= */

const activateAccount =
  pickExport(ActivationApi, "activateAccount", "activate", "activation") ||
  missing("activateAccount");

const activateFirstUser =
  pickExport(ActivationApi, "activateFirstUser", "firstUserActivation", "activateInitialUser") ||
  missing("activateFirstUser");

const validateActivationToken =
  pickExport(ActivationApi, "validateActivationToken", "validateActivateAccountToken", "activationValidate") ||
  missing("validateActivationToken");

const verifyTwoFactorCore =
  pickExport(TwoFactorApi, "verifyTwoFactor", "verify2FA", "login2fa", "twoFactorLogin", "verifyMfa", "mfaLogin") ||
  missing("verifyTwoFactor");

const requestTwoFactorCode =
  pickExport(TwoFactorApi, "requestTwoFactorCode", "request2FA", "requestMfa", "sendTwoFactorCode") ||
  missing("requestTwoFactorCode");

const resendTwoFactorCode =
  pickExport(TwoFactorApi, "resendTwoFactorCode", "resend2FA", "resendMfa") ||
  missing("resendTwoFactorCode");

async function verifyTwoFactor(payload = {}, options = {}) {
  const result = await verifyTwoFactorCore(payload, options);

  if (result?.authenticated || result?.sessionApplied) {
    try {
      syncAuthState();
    } catch {}

    emit("auth:login:success", {
      authenticated: true,
      user: getUser(),
      role: getRole(),
      roles: getRoles(),
      reason: "2fa",
    });

    repairUserUI("auth-2fa-success");
  }

  return result;
}

const requestPasswordReset =
  pickExport(PasswordResetApi, "requestPasswordReset", "forgotPassword", "resetPasswordRequest", "requestResetPassword") ||
  missing("requestPasswordReset");

const confirmResetPassword =
  pickExport(PasswordResetApi, "confirmResetPassword", "resetPasswordConfirm", "confirmPasswordReset") ||
  missing("confirmResetPassword");

const validateResetPasswordToken =
  pickExport(PasswordResetApi, "validateResetPasswordToken", "validateResetToken", "resetPasswordValidate") ||
  missing("validateResetPasswordToken");

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

    isAdmin: safeCall(isCurrentUserAdmin, false),
    isSupport: safeCall(isCurrentUserSupport, false),
    isManager: safeCall(isCurrentUserManager, false),
    isClient: safeCall(isCurrentUserClient, false),

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
      apiBase: resolveApiBase(),
      meEndpoint: AUTH_ENDPOINTS?.me || "/api/auth/me",
      mePrivate: true,
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
  } catch {}

  try {
    AppCore.auth = api;
  } catch {}

  try {
    AppCore.modules?.register?.("Auth", api, {
      replace: true,
      overwrite: true,
      emit: false,
      source: "features/auth/index.js",
    });
  } catch {}

  try {
    AppCore.modules?.register?.("auth", api, {
      replace: true,
      overwrite: true,
      emit: false,
      source: "features/auth/index.js",
    });
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

  /* user/state */
  getUser,
  getCurrentUser,
  currentUser,
  getProfile,
  getAccount,
  getSessionUser,

  getToken,
  getAccessToken,
  hasValidToken,

  getRole,
  getRoles,
  getPermissions,

  isAuthenticated,
  syncAuthState,

  getCurrentRole,
  getCurrentRoles,
  isCurrentUserAdmin,
  isCurrentUserSupport,
  isCurrentUserManager,
  isCurrentUserClient,

  hasRole,
  requireRole,

  /* actions */
  login,
  logout,
  handleLoginFormSubmit,

  fetchMe,
  me: fetchMe,
  loadMe: fetchMe,
  fetchMeDirect,

  refreshSession,
  refresh: refreshSession,
  refreshToken: refreshSession,

  restoreSession,
  restore: restoreSession,

  clearSession,
  clearSessionLocal,
  applySession: applySessionFacade,

  /* guards */
  guardAuthenticated,
  guardRole,
  guardGuest,
  guardAdmin,
  guardSupport,
  guardManager,
  canAccessRoute,
  buildGuardErrorPayload,

  requireAuth: guardAuthenticated,
  ensureAuthenticated: guardAuthenticated,
  requireGuest: guardGuest,
  requireAdmin: guardAdmin,
  requireSupport: guardSupport,
  requireManager: guardManager,
  can: hasRole,
  canAccess: canAccessRoute,

  /* session helpers */
  getAuthHeader,
  buildSessionSnapshot,
  getSessionDebugSnapshot,

  /* login helpers */
  resolveLoginIdentifier,
  normalizeLoginPayload,
  buildLoginRequestBody,
  buildLoginRedirectPath,
  getPostLoginTarget,

  /* activation */
  activateAccount,
  activate: activateAccount,
  activation: activateAccount,
  confirmActivation: activateAccount,
  accountActivation: activateAccount,
  createUserActivation: activateAccount,

  activateFirstUser,
  firstUserActivation: activateFirstUser,
  activateInitialUser: activateFirstUser,

  validateActivationToken,
  validateActivateAccountToken: validateActivationToken,
  activationValidate: validateActivationToken,

  resolveActivationToken:
    pickExport(ActivationApi, "resolveActivationToken", "extractActivationToken") ||
    (() => ""),

  normalizeActivationPayload:
    pickExport(ActivationApi, "normalizeActivationPayload", "normalizeActivateAccountPayload") ||
    ((payload = {}) => payload),

  normalizeFirstUserActivationPayload:
    pickExport(ActivationApi, "normalizeFirstUserActivationPayload") ||
    ((payload = {}) => payload),

  buildActivationRequestBody:
    pickExport(ActivationApi, "buildActivationRequestBody", "buildActivateAccountBody") ||
    ((payload = {}) => payload),

  buildActivateFirstUserBody:
    pickExport(ActivationApi, "buildActivateFirstUserBody", "buildFirstUserActivationBody") ||
    ((payload = {}) => payload),

  normalizeActivationResponse:
    pickExport(ActivationApi, "normalizeActivationResponse", "normalizeActivateAccountResponse") ||
    ((response = {}) => response),

  normalizeFirstUserActivationResponse:
    pickExport(ActivationApi, "normalizeFirstUserActivationResponse") ||
    ((response = {}) => response),

  getActivateAccountEndpoint:
    pickExport(ActivationApi, "getActivateAccountEndpoint", "getActivationEndpoint") ||
    (() => AUTH_ENDPOINTS?.activateAccount || null),

  getActivateFirstUserEndpoint:
    pickExport(ActivationApi, "getActivateFirstUserEndpoint") ||
    (() => AUTH_ENDPOINTS?.activateFirstUser || null),

  getValidateActivationTokenEndpoint:
    pickExport(ActivationApi, "getValidateActivationTokenEndpoint") ||
    (() => AUTH_ENDPOINTS?.validateActivationToken || null),

  /* 2FA */
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

  resolveTwoFactorTempToken:
    pickExport(TwoFactorApi, "resolveTwoFactorTempToken") ||
    (() => getStoredTempToken() || ""),

  normalizeTwoFactorPayload:
    pickExport(TwoFactorApi, "normalizeTwoFactorPayload", "normalizeVerifyTwoFactorPayload") ||
    ((payload = {}) => payload),

  normalizeRequestTwoFactorPayload:
    pickExport(TwoFactorApi, "normalizeRequestTwoFactorPayload") ||
    ((payload = {}) => payload),

  buildTwoFactorVerifyBody:
    pickExport(TwoFactorApi, "buildTwoFactorVerifyBody", "buildVerifyTwoFactorBody") ||
    ((payload = {}) => payload),

  buildTwoFactorRequestBody:
    pickExport(TwoFactorApi, "buildTwoFactorRequestBody", "buildRequestTwoFactorBody") ||
    ((payload = {}) => payload),

  buildResendTwoFactorBody:
    pickExport(TwoFactorApi, "buildResendTwoFactorBody") ||
    ((payload = {}) => payload),

  normalizeTwoFactorResponse:
    pickExport(TwoFactorApi, "normalizeTwoFactorResponse", "normalizeVerifyTwoFactorResponse") ||
    ((response = {}) => response),

  normalizeRequestTwoFactorResponse:
    pickExport(TwoFactorApi, "normalizeRequestTwoFactorResponse") ||
    ((response = {}) => response),

  normalizeResendTwoFactorResponse:
    pickExport(TwoFactorApi, "normalizeResendTwoFactorResponse") ||
    ((response = {}) => response),

  isTwoFactorRoute:
    pickExport(TwoFactorApi, "isTwoFactorRoute") ||
    (() => false),

  getTwoFactorRedirectPath:
    pickExport(TwoFactorApi, "getTwoFactorRedirectPath") ||
    (() => "/2fa"),

  getTwoFactorLoginEndpoint:
    pickExport(TwoFactorApi, "getTwoFactorLoginEndpoint", "getTwoFactorVerifyEndpoint") ||
    (() => AUTH_ENDPOINTS?.twoFactorLogin || null),

  getTwoFactorRequestEndpoint:
    pickExport(TwoFactorApi, "getTwoFactorRequestEndpoint") ||
    (() => AUTH_ENDPOINTS?.twoFactorRequest || null),

  getTwoFactorResendEndpoint:
    pickExport(TwoFactorApi, "getTwoFactorResendEndpoint") ||
    (() => AUTH_ENDPOINTS?.twoFactorResend || null),

  /* password reset */
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

  resolveResetPasswordIdentifier:
    pickExport(PasswordResetApi, "resolveResetPasswordIdentifier") ||
    ((payload = {}) => safeText(payload?.identifier || payload?.email || payload?.username || payload)),

  resolveResetPasswordToken:
    pickExport(PasswordResetApi, "resolveResetPasswordToken") ||
    (() => ""),

  normalizeResetPasswordPayload:
    pickExport(PasswordResetApi, "normalizeResetPasswordPayload") ||
    ((payload = {}) => payload),

  normalizeConfirmResetPasswordPayload:
    pickExport(PasswordResetApi, "normalizeConfirmResetPasswordPayload") ||
    ((payload = {}) => payload),

  normalizeValidateResetTokenPayload:
    pickExport(PasswordResetApi, "normalizeValidateResetTokenPayload", "normalizeValidateResetPasswordTokenPayload") ||
    ((payload = {}) => payload),

  buildResetPasswordRequestBody:
    pickExport(PasswordResetApi, "buildResetPasswordRequestBody") ||
    ((payload = {}) => payload),

  buildConfirmResetPasswordBody:
    pickExport(PasswordResetApi, "buildConfirmResetPasswordBody") ||
    ((payload = {}) => payload),

  buildValidateResetTokenBody:
    pickExport(PasswordResetApi, "buildValidateResetTokenBody", "buildValidateResetPasswordTokenBody") ||
    ((payload = {}) => payload),

  normalizeResetPasswordResponse:
    pickExport(PasswordResetApi, "normalizeResetPasswordResponse") ||
    ((response = {}) => response),

  normalizeConfirmResetPasswordResponse:
    pickExport(PasswordResetApi, "normalizeConfirmResetPasswordResponse") ||
    ((response = {}) => response),

  normalizeValidateResetTokenResponse:
    pickExport(PasswordResetApi, "normalizeValidateResetTokenResponse", "normalizeValidateResetPasswordTokenResponse") ||
    ((response = {}) => response),

  getRequestPasswordResetEndpoint:
    pickExport(PasswordResetApi, "getRequestPasswordResetEndpoint", "getResetPasswordRequestEndpoint") ||
    (() => AUTH_ENDPOINTS?.requestPasswordReset || null),

  getConfirmResetPasswordEndpoint:
    pickExport(PasswordResetApi, "getConfirmResetPasswordEndpoint", "getConfirmPasswordResetEndpoint") ||
    (() => AUTH_ENDPOINTS?.confirmPasswordReset || null),

  getValidateResetTokenEndpoint:
    pickExport(PasswordResetApi, "getValidateResetTokenEndpoint", "getValidateResetPasswordTokenEndpoint") ||
    (() => AUTH_ENDPOINTS?.validateResetToken || null),

  /* storage */
  hasRefreshToken,
  hasRefreshContext,
  getStoredRefreshToken,
  getStoredTempToken,
  getStoredSessionId,
  getStoredSessionUserId,

  /* routes */
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

  /* normalize/api/debug */
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
