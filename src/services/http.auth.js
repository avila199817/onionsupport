/* =========================================================
   Onion Support - Services HTTP Auth
   Archivo: /src/services/http.auth.js

   Responsabilidad:
   - Compat mínima de auth para Services.
   - /api/auth/me, /auth/me, /api/me y /me siempre privados.
   - Detectar endpoints públicos reales.
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
   - Sin 2FA/MFA/OTP.
   - Sin magia negra.
========================================================= */

import CoreHttp from "../core/http.js";

export const HTTP_AUTH_VERSION = "simple";

const PRIVATE_ME_ENDPOINTS = Object.freeze([
  "/api/auth/me",
  "/auth/me",
  "/api/me",
  "/me",
]);

const PUBLIC_AUTH_ENDPOINTS = Object.freeze([
  "/api/auth/login",
  "/auth/login",

  "/api/auth/refresh",
  "/auth/refresh",

  "/api/auth/activate",
  "/auth/activate",

  "/api/auth/reset-password-request",
  "/auth/reset-password-request",

  "/api/auth/reset-password-confirm",
  "/auth/reset-password-confirm",
]);

const AUTH_CONTROL_ENDPOINTS = Object.freeze([
  ...PUBLIC_AUTH_ENDPOINTS,

  "/api/auth/logout",
  "/auth/logout",
]);

const PUBLIC_ROUTES = Object.freeze([
  "/login",
  "/password-request",
  "/password-reset",
  "/activate-account",
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
  const output = String(value ?? "").trim();
  return output || fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function redact(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function statusFromError(error = null) {
  return Number(
    error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      error?.data?.status ||
      0
  ) || 0;
}

function publicError(error = null) {
  if (!error) return null;

  return {
    name: error.name || "Error",
    message: redact(error.message || String(error)),
    status: statusFromError(error),
    code: error.code || error.data?.code || error.response?.data?.code || null,
  };
}

/* =========================================================
   PATH POLICY
========================================================= */

function baseOrigin() {
  try {
    return window.location?.origin || "http://localhost";
  } catch {
    return "http://localhost";
  }
}

export function normalizeEndpointPath(path = "") {
  const raw = text(path, "");

  if (!raw) return "";

  try {
    const parsed = new URL(raw, baseOrigin());
    return normalizePathname(parsed.pathname || "/");
  } catch {
    return normalizePathname(raw.split("?")[0].split("#")[0] || "/");
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

function stripApiPrefix(path = "") {
  const clean = normalizeEndpointPath(path);

  if (clean === "/api") return "/";
  if (clean.startsWith("/api/")) return clean.slice(4) || "/";

  return clean;
}

function pathCandidates(path = "") {
  const clean = normalizeEndpointPath(path);
  const stripped = stripApiPrefix(clean);

  return [...new Set([clean, stripped].filter(Boolean))];
}

function pathMatches(path = "", list = []) {
  const candidates = pathCandidates(path);

  return list.some((item) => {
    const marker = normalizeEndpointPath(item);
    return candidates.includes(marker);
  });
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
  return pathMatches(path, PRIVATE_ME_ENDPOINTS);
}

export function isPublicAuthEndpoint(path = "") {
  if (isAuthMeEndpoint(path)) return false;

  return pathMatches(path, PUBLIC_AUTH_ENDPOINTS);
}

export function isAuthRefreshControlEndpoint(path = "") {
  if (isAuthMeEndpoint(path)) return false;

  return pathMatches(path, AUTH_CONTROL_ENDPOINTS);
}

export function isTechnicalPublicRoute(path = "") {
  return pathMatches(path, PUBLIC_ROUTES);
}

export function isPublicEndpoint(path = "") {
  if (isAuthMeEndpoint(path)) return false;

  return isPublicAuthEndpoint(path) || isTechnicalPublicRoute(path);
}

export function isAuthEndpoint(path = "") {
  const clean = normalizeEndpointPath(path);

  return (
    clean === "/api/auth" ||
    clean === "/auth" ||
    clean.startsWith("/api/auth/") ||
    clean.startsWith("/auth/") ||
    isAuthMeEndpoint(clean)
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

function skipReason({ config = {}, error = null, requestConfig = {} } = {}) {
  const cfg = isObject(config) ? config : {};
  const req = isObject(requestConfig) ? requestConfig : {};
  const path = requestPath(req);
  const status = statusFromError(error);

  if (cfg.autoRefreshOn401 === false) return "auto-refresh-disabled";
  if (status !== 401 && status !== 419) return "status-not-refreshable";
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
  if (data.ok === true || data.success === true || data.refreshed === true) return true;

  return Boolean(
    data.token ||
      data.accessToken ||
      data.access_token ||
      data.data?.token ||
      data.data?.accessToken ||
      data.data?.access_token ||
      data.auth?.token ||
      data.auth?.accessToken ||
      data.auth?.access_token
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

    _skipAuthRefresh: true,
    skipAuthRefresh: true,
    noAutoRefresh: true,
    autoRefresh: false,

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
    return CoreHttp.post("/api/auth/refresh", {}, requestOptions);
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
      message: "Refresh finalizado sin token usable.",
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
      privateMeEndpoints: [...PRIVATE_ME_ENDPOINTS],
      publicAuthEndpoints: [...PUBLIC_AUTH_ENDPOINTS],
      publicRoutes: [...PUBLIC_ROUTES],
    },

    policy: {
      bridgeOnly: true,
      delegatesRefreshToCoreHttp: true,
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
