/* =========================================================
   Onion Support - Services HTTP Auth
   Archivo: /src/services/http.auth.js

   Responsabilidad:
   - Compat mínima de auth para Services.
   - /api/auth/me siempre privado.
   - /api/auth/refresh público y sin Authorization.
   - Detectar endpoints públicos reales desde core/config.js.
   - Auto-refresh opcional sólo en 401/419 privado.
   - Single-flight mínimo para refresh concurrente.
   - Delegar refresh siempre en src/core/http.js.
   - Sin fetch directo.
   - Sin restoreSession.
   - Sin logout.
   - Sin storage.
   - Sin Router.
   - Sin Toast.
   - Sin interceptores reales.
   - Sin aliases legacy.
   - Sin /auth/me.
   - Sin /api/me.
   - Sin /me.
   - Sin 2FA/MFA/OTP.
   - Sin magia negra.
========================================================= */

import CoreHttp from "../core/http.js";

import {
  AUTH_ENDPOINTS,
  PUBLIC_API_PATHS,
  PUBLIC_ROUTES,
  normalizeEndpointPath as normalizeConfigEndpointPath,
  normalizeRoutePath as normalizeConfigRoutePath,
  isPublicApiPath,
} from "../core/config.js";

export const HTTP_AUTH_VERSION = "services.http.auth.v2";

const PRIVATE_ME_ENDPOINT = AUTH_ENDPOINTS.me;

const AUTH_CONTROL_ENDPOINTS = Object.freeze([
  ...PUBLIC_API_PATHS,
  AUTH_ENDPOINTS.logout,
  AUTH_ENDPOINTS.logoutAll,
]);

let refreshPromise = null;
let attempts = 0;
let successes = 0;
let failures = 0;
let skipped = 0;
let joined = 0;
let lastSkipReason = "";
let lastError = null;
let lastRefreshAt = "";

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function redact(value = "") {
  return text(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function statusFromError(error = null) {
  return Number(
    error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      error?.data?.status ||
      error?.payload?.status ||
      error?.responseData?.status ||
      0
  ) || 0;
}

function codeFromError(error = null) {
  return text(
    error?.code ||
      error?.error ||
      error?.data?.auth?.code ||
      error?.data?.code ||
      error?.payload?.auth?.code ||
      error?.payload?.code ||
      error?.responseData?.auth?.code ||
      error?.responseData?.code ||
      error?.response?.data?.auth?.code ||
      error?.response?.data?.code ||
      "",
    ""
  );
}

function publicError(error = null) {
  if (!error) return null;

  return {
    name: error.name || "Error",
    message: redact(error.message || String(error)),
    status: statusFromError(error),
    code: codeFromError(error) || null,
  };
}

/* =========================================================
   PATH POLICY
========================================================= */

export function normalizeEndpointPath(path = "") {
  try {
    return normalizeConfigEndpointPath(path) || "";
  } catch {
    const raw = text(path, "");

    if (!raw) return "";

    try {
      const parsed = new URL(raw);
      return normalizePathname(parsed.pathname || "/");
    } catch {
      return normalizePathname(raw.split("?")[0].split("#")[0] || "/");
    }
  }
}

function normalizeRoutePath(path = "") {
  try {
    return normalizeConfigRoutePath(path) || "";
  } catch {
    return normalizePathname(path);
  }
}

function normalizePathname(pathname = "/") {
  let value = text(pathname, "/")
    .toLowerCase()
    .replace(/\\/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/{2,}/g, "/");

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function endpointMatches(path = "", endpoint = "") {
  const clean = normalizeEndpointPath(path);
  const target = normalizeEndpointPath(endpoint);

  return Boolean(clean && target && clean === target);
}

function routeMatches(path = "", route = "") {
  const clean = normalizeRoutePath(path);
  const target = normalizeRoutePath(route);

  return Boolean(clean && target && clean === target);
}

function requestPath(requestConfig = {}) {
  const cfg = isObject(requestConfig) ? requestConfig : {};

  return text(
    cfg.path ||
      cfg.url ||
      cfg.endpoint ||
      cfg.href ||
      cfg.input ||
      cfg.resource ||
      cfg.pathname ||
      "",
    ""
  );
}

export function isAuthMeEndpoint(path = "") {
  return endpointMatches(path, PRIVATE_ME_ENDPOINT);
}

export function isPublicAuthEndpoint(path = "") {
  if (isAuthMeEndpoint(path)) return false;

  try {
    return isPublicApiPath(path) === true;
  } catch {
    return PUBLIC_API_PATHS.some((endpoint) => endpointMatches(path, endpoint));
  }
}

export function isAuthRefreshControlEndpoint(path = "") {
  if (isAuthMeEndpoint(path)) return false;

  return AUTH_CONTROL_ENDPOINTS.some((endpoint) => endpointMatches(path, endpoint));
}

export function isTechnicalPublicRoute(path = "") {
  return PUBLIC_ROUTES.some((route) => routeMatches(path, route));
}

export function isPublicEndpoint(path = "") {
  if (isAuthMeEndpoint(path)) return false;

  return isPublicAuthEndpoint(path) || isTechnicalPublicRoute(path);
}

export function isAuthEndpoint(path = "") {
  const clean = normalizeEndpointPath(path);

  return Boolean(
    clean === "/api/auth" ||
      clean.startsWith("/api/auth/")
  );
}

/* =========================================================
   REFRESH POLICY
========================================================= */

function isAbortOrTimeout(error = null, requestConfig = {}) {
  if (error?.name === "AbortError" || error?.aborted === true) return true;
  if (error?.timeout === true) return true;
  if (error?.code === "TIMEOUT" || error?.code === "REQUEST_TIMEOUT") return true;

  try {
    return Boolean(requestConfig?.signal?.aborted);
  } catch {
    return false;
  }
}

function coreHttpSaysRefreshable(error = null) {
  try {
    return isFunction(CoreHttp?.isRefreshableAuthError) &&
      CoreHttp.isRefreshableAuthError(error) === true;
  } catch {
    return false;
  }
}

function coreHttpSaysClearSession(error = null) {
  try {
    return isFunction(CoreHttp?.shouldClearSessionForAuthError) &&
      CoreHttp.shouldClearSessionForAuthError(error) === true;
  } catch {
    return false;
  }
}

function skipReason({ config = {}, error = null, requestConfig = {} } = {}) {
  const cfg = isObject(config) ? config : {};
  const req = isObject(requestConfig) ? requestConfig : {};
  const path = requestPath(req);
  const status = statusFromError(error);

  if (cfg.autoRefreshOn401 === false) return "auto-refresh-disabled";
  if (coreHttpSaysClearSession(error)) return "terminal-auth-error";
  if (status !== 401 && status !== 419 && !coreHttpSaysRefreshable(error)) {
    return "status-not-refreshable";
  }

  if (isAbortOrTimeout(error, req)) return "aborted-or-timeout";

  if (req._authRefreshAttempted === true || req._retriedAfterRefresh === true) {
    return "already-attempted";
  }

  if (
    req._skipAuthRefresh === true ||
    req.skipAuthRefresh === true ||
    req.noAutoRefresh === true ||
    req.autoRefresh === false
  ) {
    return "request-disabled";
  }

  if (
    req.public === true ||
    req.auth === false ||
    req.skipAuth === true ||
    req.noAuthHeader === true
  ) {
    return "public-request";
  }

  /*
    /api/auth/me es privado y sí puede disparar refresh.
    El resto de endpoints de control auth no deben hacerlo.
  */
  if (!isAuthMeEndpoint(path) && isAuthRefreshControlEndpoint(path)) {
    return "auth-control-endpoint";
  }

  if (isPublicEndpoint(path)) {
    return "public-endpoint";
  }

  return "";
}

function refreshSucceeded(result = null) {
  if (result === true) return true;
  if (!result) return false;

  if (typeof result === "string") {
    return ["ok", "success", "true", "refreshed"].includes(result.trim().toLowerCase());
  }

  const data = isObject(result) ? result : {};

  if (data.ok === false || data.success === false || data.error) return false;

  if (
    data.ok === true ||
    data.success === true ||
    data.refreshed === true ||
    data.authenticated === true ||
    data.restored === true
  ) {
    return true;
  }

  return Boolean(
    data.token ||
      data.accessToken ||
      data.access_token ||
      data.data?.token ||
      data.data?.accessToken ||
      data.data?.access_token ||
      data.auth?.token ||
      data.auth?.accessToken ||
      data.auth?.access_token ||
      data.session?.token ||
      data.session?.accessToken ||
      data.session?.access_token
  );
}

function commitRefreshTokens(result = null) {
  if (!isObject(result)) return false;

  try {
    CoreHttp?.setAuthTokens?.(result);
    return true;
  } catch {
    return false;
  }
}

async function refreshViaCore(options = {}) {
  const requestOptions = {
    ...options,

    auth: false,
    public: true,
    skipAuth: true,
    noAuthHeader: true,

    _skipAuthRefresh: true,
    skipAuthRefresh: true,
    noAutoRefresh: true,
    autoRefresh: false,

    credentials: options.credentials || "include",
    cache: "no-store",
    retries: 0,
    storeError: false,
  };

  if (isFunction(CoreHttp?.refreshSession)) {
    return CoreHttp.refreshSession({}, requestOptions);
  }

  if (isFunction(CoreHttp?.refresh)) {
    return CoreHttp.refresh(requestOptions);
  }

  if (isFunction(CoreHttp?.post)) {
    return CoreHttp.post(AUTH_ENDPOINTS.refresh, {}, requestOptions);
  }

  throw new Error("CoreHttp refresh no disponible.");
}

/* =========================================================
   MAIN API
========================================================= */

export async function runAutoRefreshIfNeeded({
  config = {},
  error = null,
  requestConfig = {},
} = {}) {
  const reason = skipReason({
    config,
    error,
    requestConfig,
  });

  if (reason) {
    skipped += 1;
    lastSkipReason = reason;
    return false;
  }

  if (refreshPromise) {
    joined += 1;

    try {
      const joinedResult = await refreshPromise;
      return refreshSucceeded(joinedResult);
    } catch (joinError) {
      failures += 1;
      lastError = publicError(joinError);
      return false;
    }
  }

  attempts += 1;
  lastError = null;

  refreshPromise = refreshViaCore({
    source: "services.http.auth",
    reason: "auto-refresh",
    requestId: requestConfig?.requestId || null,
    silent: true,
  }).finally(() => {
    refreshPromise = null;
  });

  try {
    const result = await refreshPromise;
    const ok = refreshSucceeded(result);

    if (ok) {
      successes += 1;
      lastRefreshAt = nowIso();
      commitRefreshTokens(result);
      return true;
    }

    failures += 1;
    lastError = {
      name: "RefreshRejected",
      message: "Refresh finalizado sin sesión/token usable.",
      status: 401,
      code: "REFRESH_REJECTED",
    };

    return false;
  } catch (refreshError) {
    failures += 1;
    lastError = publicError(refreshError);
    return false;
  }
}

/* =========================================================
   SNAPSHOT / RESET
========================================================= */

export function getHttpAuthSnapshot() {
  return {
    version: HTTP_AUTH_VERSION,

    refreshInFlight: Boolean(refreshPromise),

    counters: {
      attempts,
      successes,
      failures,
      skipped,
      joined,
    },

    lastSkipReason,
    lastRefreshAt,
    lastError,

    endpointPolicy: {
      authMePrivate: true,
      privateMeEndpoint: PRIVATE_ME_ENDPOINT,
      publicAuthEndpoints: [...PUBLIC_API_PATHS],
      publicRoutes: [...PUBLIC_ROUTES],
    },

    policy: {
      bridgeOnly: true,
      delegatesRefreshToCoreHttp: true,

      canonicalMeOnly: true,
      meEndpoint: "/api/auth/me",
      noAuthMeAliases: true,
      noApiMeAlias: true,
      noRootMeAlias: true,

      directFetch: false,
      restoreSession: false,
      logout: false,
      storage: false,
      router: false,
      toast: false,
      twoFactor: false,
    },
  };
}

export function resetHttpAuthRuntime() {
  refreshPromise = null;

  attempts = 0;
  successes = 0;
  failures = 0;
  skipped = 0;
  joined = 0;

  lastSkipReason = "";
  lastError = null;
  lastRefreshAt = "";

  return true;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  HTTP_AUTH_VERSION,

  runAutoRefreshIfNeeded,

  getHttpAuthSnapshot,
  resetHttpAuthRuntime,

  normalizeEndpointPath,
  isAuthEndpoint,
  isAuthMeEndpoint,
  isPublicAuthEndpoint,
  isAuthRefreshControlEndpoint,
  isTechnicalPublicRoute,
  isPublicEndpoint,
};
