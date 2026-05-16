/* =========================================================
   Onion SPA - HTTP Auth
   Archivo: src/services/http.auth.js

   HTTP AUTH · FINAL SIMPLE
   - Compat mínima para Services
   - Auto-refresh sólo en 401 privado
   - Single-flight para refresh concurrente
   - /api/auth/me, /auth/me, /api/me y /me siempre privados
   - Delega refresh en src/core/http.js
   - Sin fetch directo, sin restoreSession, sin logout, sin storage
   - Sin Router, Toast, interceptores ni lógica de sesión pesada
========================================================= */

import CoreHttp from "../core/http.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

export const HTTP_AUTH_VERSION = "20.0.0-final";

const AUTH_ME_ENDPOINTS = Object.freeze([
  "/me",
  "/api/me",
  "/auth/me",
  "/api/auth/me",
]);

const PUBLIC_AUTH_MARKERS = Object.freeze([
  "/auth/login",
  "/auth/register",
  "/auth/signup",

  "/auth/refresh",
  "/auth/token/refresh",
  "/auth/renew",

  "/auth/2fa",
  "/auth/mfa",
  "/auth/otp",

  "/auth/activate",
  "/auth/activate-account",
  "/auth/account/activate",
  "/auth/activation",

  "/auth/reset-password",
  "/auth/reset-password-request",
  "/auth/reset-password-confirm",
  "/auth/reset-password/confirm",
  "/auth/password-reset",
  "/auth/password-reset/request",
  "/auth/password-reset/confirm",
  "/auth/forgot-password",
  "/auth/recover-password",

  "/auth/_health",
  "/auth/health",
]);

const AUTH_CONTROL_MARKERS = Object.freeze([
  ...PUBLIC_AUTH_MARKERS,
  "/auth/logout",
  "/auth/logout-all",
  "/auth/signout",
  "/auth/sign-out",
]);

const TECHNICAL_PUBLIC_ROUTES = Object.freeze([
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

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

const fallbackState = {
  refreshPromise: null,
  refreshStats: createRefreshStats(),
};

/* =========================================================
   BASICS
========================================================= */

const isFn = (value) => typeof value === "function";
const isObject = (value) => value !== null && typeof value === "object";

function safeObject(value, fallback = {}) {
  return isObject(value) && !Array.isArray(value) ? value : fallback;
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
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

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function now() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function iso(ms = now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function redact(value = "") {
  let output = safeText(value, "");

  if (!output) return "";

  try {
    output = output
      .replace(
        /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token|tempToken|temp_token|otp|totp)=)([^&#\s]+)/gi,
        "$1***"
      )
      .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  } catch {}

  return output;
}

function sanitize(value, depth = 0, keyHint = "", seen = new WeakSet()) {
  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) return value ? "***" : null;
  if (depth > 4) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redact(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redact(value.message || ""),
      status: value.status || value.statusCode || 0,
      code: value.code || "",
      timeout: Boolean(value.timeout),
      aborted: Boolean(value.aborted),
      stack: value.stack ? "[stack]" : "",
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitize(item, depth + 1, keyHint, seen));
  }

  if (isObject(value)) {
    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      output[key] = sanitize(item, depth + 1, key, seen);
    }

    return output;
  }

  return redact(String(value));
}

function getRequestPath(requestConfig = {}) {
  const cfg = safeObject(requestConfig);

  return safeText(
    cfg.path ||
      cfg.url ||
      cfg.endpoint ||
      cfg.href ||
      cfg.input ||
      cfg.resource ||
      cfg.finalUrl ||
      cfg.originalUrl ||
      cfg.requestUrl ||
      cfg.redactedUrl ||
      cfg.route ||
      cfg.pathname ||
      "",
    ""
  );
}

function rootFor(stateRef) {
  const root = stateRef && typeof stateRef === "object"
    ? stateRef
    : fallbackState;

  if (!root.refreshStats || typeof root.refreshStats !== "object") {
    root.refreshStats = createRefreshStats();
  }

  if (!Object.prototype.hasOwnProperty.call(root, "refreshPromise")) {
    root.refreshPromise = null;
  }

  return root;
}

/* =========================================================
   ENDPOINT POLICY
========================================================= */

function baseOrigin() {
  try {
    return window.location?.origin || "http://localhost";
  } catch {
    return "http://localhost";
  }
}

export function normalizeEndpointPath(path = "") {
  const raw = safeText(path, "");
  if (!raw) return "";

  try {
    const parsed = new URL(raw, baseOrigin());
    return normalizePathname(parsed.pathname || "/");
  } catch {
    return normalizePathname(raw.split("?")[0].split("#")[0] || "/");
  }
}

function normalizePathname(pathname = "/") {
  let value = safeText(pathname, "/")
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

function comparablePaths(path = "") {
  const clean = normalizeEndpointPath(path);
  const stripped = stripApiPrefix(clean);
  return [...new Set([clean, stripped].filter(Boolean))];
}

function endpointMatches(path = "", markers = []) {
  const paths = comparablePaths(path);

  return safeArray(markers).some((marker) => {
    const cleanMarker = normalizeEndpointPath(marker);
    if (!cleanMarker) return false;

    return paths.some((candidate) => (
      candidate === cleanMarker || candidate.startsWith(`${cleanMarker}/`)
    ));
  });
}

export function isAuthMeEndpoint(path = "") {
  return comparablePaths(path).some((candidate) => AUTH_ME_ENDPOINTS.includes(candidate));
}

export function isPublicAuthEndpoint(path = "") {
  if (isAuthMeEndpoint(path)) return false;
  return endpointMatches(path, PUBLIC_AUTH_MARKERS);
}

export function isAuthRefreshControlEndpoint(path = "") {
  if (isAuthMeEndpoint(path)) return false;
  return endpointMatches(path, AUTH_CONTROL_MARKERS);
}

export function isTechnicalPublicRoute(path = "") {
  return endpointMatches(path, TECHNICAL_PUBLIC_ROUTES);
}

export function isPublicEndpoint(path = "", AppCore = null) {
  if (isAuthMeEndpoint(path)) return false;
  if (isPublicAuthEndpoint(path) || isTechnicalPublicRoute(path)) return true;

  try {
    if (isFn(AppCore?.utils?.isPublicApiPath)) {
      return Boolean(AppCore.utils.isPublicApiPath(path));
    }
  } catch {}

  try {
    if (isFn(AppCore?.isPublicApiPath)) {
      return Boolean(AppCore.isPublicApiPath(path));
    }
  } catch {}

  return false;
}

export function isAuthEndpoint(path = "") {
  const clean = normalizeEndpointPath(path);
  return clean === "/auth" || clean === "/api/auth" || clean.includes("/auth/") || isAuthMeEndpoint(clean);
}

/* =========================================================
   STATS
========================================================= */

function createRefreshStats() {
  return {
    version: HTTP_AUTH_VERSION,
    attempts: 0,
    failures: 0,
    skipped: 0,
    joined: 0,
    successes: 0,
    lastAttemptAt: 0,
    lastSuccessAt: 0,
    lastFailureAt: 0,
    lastSkipAt: 0,
    lastJoinAt: 0,
    lastSkipReason: "",
    lastError: null,
  };
}

function markSkip(root, reason = "skipped") {
  const stats = root.refreshStats;
  stats.skipped += 1;
  stats.lastSkipAt = now();
  stats.lastSkipReason = safeText(reason, "skipped");
  return false;
}

function markFailure(root, error = null) {
  const stats = root.refreshStats;
  stats.failures += 1;
  stats.lastFailureAt = now();
  stats.lastError = sanitize(error);
  return false;
}

function markSuccess(root) {
  const stats = root.refreshStats;
  stats.successes += 1;
  stats.lastSuccessAt = now();
  stats.lastError = null;
  return true;
}

function markJoin(root) {
  const stats = root.refreshStats;
  stats.joined += 1;
  stats.lastJoinAt = now();
}

/* =========================================================
   REFRESH POLICY
========================================================= */

function statusFromError(error = null) {
  return safeNumber(
    error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      error?.data?.status,
    0
  );
}

function isAbortOrTimeout(error = null, requestConfig = {}) {
  if (error?.aborted === true || error?.name === "AbortError") return true;
  if (error?.timeout === true || error?.code === "TIMEOUT" || error?.code === "REQUEST_TIMEOUT") return true;

  try {
    return Boolean(requestConfig?.signal?.aborted);
  } catch {
    return false;
  }
}

function skipReason({ AppCore, config, error, requestConfig } = {}) {
  const cfg = safeObject(config);
  const req = safeObject(requestConfig);
  const status = statusFromError(error);
  const path = getRequestPath(req);

  if (cfg.autoRefreshOn401 === false) return "auto-refresh-disabled";
  if (status !== 401 && status !== 419) return "status-not-refreshable";
  if (isAbortOrTimeout(error, req)) return "aborted-or-timeout";

  if (req._authRefreshAttempted === true || req._retriedAfterRefresh === true) return "already-attempted";
  if (req._skipAuthRefresh === true || req.skipAuthRefresh === true) return "skip-auth-refresh";
  if (req.noAutoRefresh === true || req.autoRefresh === false) return "auto-refresh-disabled-request";

  if (req.public === true || req.auth === false || req.skipAuth === true || req.noAuthHeader === true) {
    return "public-or-auth-disabled";
  }

  if (!isAuthMeEndpoint(path)) {
    if (isAuthRefreshControlEndpoint(path)) return "auth-control-endpoint";
    if (isPublicAuthEndpoint(path)) return "public-auth-endpoint";
  }

  if (isTechnicalPublicRoute(path)) return "technical-public-route";
  if (isPublicEndpoint(path, AppCore)) return "public-endpoint";

  return "";
}

function refreshSucceeded(result) {
  if (result === true) return true;
  if (!result) return false;

  if (typeof result === "string") {
    return ["ok", "success", "true", "refreshed"].includes(result.trim().toLowerCase());
  }

  const data = safeObject(result);

  if (data.ok === false || data.success === false || data.error) return false;
  if (data.ok === true || data.success === true || data.refreshed === true || data.authenticated === true) return true;

  return Boolean(
    data.token ||
      data.accessToken ||
      data.access_token ||
      data.refreshToken ||
      data.refresh_token ||
      data.user ||
      data.usuario ||
      data.session ||
      data.data?.token ||
      data.data?.accessToken ||
      data.data?.access_token ||
      data.data?.user ||
      data.payload?.token ||
      data.payload?.accessToken ||
      data.payload?.access_token ||
      data.payload?.user
  );
}

async function refreshViaCoreHttp(options = {}) {
  if (isFn(CoreHttp?.refreshSession)) return CoreHttp.refreshSession(options);
  if (isFn(CoreHttp?.refresh)) return CoreHttp.refresh(options);

  throw new Error("CoreHttp refresh no disponible.");
}

/* =========================================================
   MAIN API
========================================================= */

export async function runAutoRefreshIfNeeded({
  AppCore,
  Auth,
  config,
  state,
  error,
  requestConfig,
} = {}) {
  const root = rootFor(state);
  const cfg = safeObject(config);
  const req = safeObject(requestConfig);
  const reason = skipReason({ AppCore, config: cfg, error, requestConfig: req });

  if (reason) return markSkip(root, reason);

  if (root.refreshPromise) {
    markJoin(root);

    try {
      const joined = await root.refreshPromise;
      return refreshSucceeded(joined);
    } catch (joinError) {
      return markFailure(root, joinError);
    }
  }

  root.refreshStats.attempts += 1;
  root.refreshStats.lastAttemptAt = now();

  root.refreshPromise = refreshViaCoreHttp({
    reason: "http-auto-refresh",
    source: "services/http.auth.js",
    requestId: req.requestId || null,
    silent: true,
    captureAuth: true,
    emitAuthEvents: cfg.emitAuthRefreshEvents === true || req.emitAuthRefreshEvents === true,
    _skipAuthRefresh: true,
    skipAuthRefresh: true,
    noAutoRefresh: true,
    autoRefresh: false,
    retries: 0,
  }).finally(() => {
    root.refreshPromise = null;
  });

  try {
    const result = await root.refreshPromise;
    return refreshSucceeded(result) ? markSuccess(root) : markFailure(root, {
      name: "RefreshRejected",
      message: "Refresh finalizado sin sesión/token usable.",
      status: 401,
    });
  } catch (refreshError) {
    return markFailure(root, refreshError);
  }
}

/* =========================================================
   DEBUG
========================================================= */

export function getHttpAuthSnapshot(stateRef) {
  const root = rootFor(stateRef);
  const stats = root.refreshStats;

  return sanitize({
    version: HTTP_AUTH_VERSION,
    refreshInFlight: Boolean(root.refreshPromise),
    endpointPolicy: {
      authMePrivate: true,
      authMeEndpoints: AUTH_ME_ENDPOINTS,
      publicAuthMarkers: PUBLIC_AUTH_MARKERS.length,
      authControlMarkers: AUTH_CONTROL_MARKERS.length,
      technicalPublicRoutes: TECHNICAL_PUBLIC_ROUTES,
      delegatesRefreshToCoreHttp: true,
      directFetchFallback: false,
      restoreSessionExcluded: true,
      logoutExcluded: true,
      storageExcluded: true,
      routerExcluded: true,
      toastExcluded: true,
    },
    refreshStats: {
      ...stats,
      lastAttemptAtIso: stats.lastAttemptAt ? iso(stats.lastAttemptAt) : "",
      lastSuccessAtIso: stats.lastSuccessAt ? iso(stats.lastSuccessAt) : "",
      lastFailureAtIso: stats.lastFailureAt ? iso(stats.lastFailureAt) : "",
      lastSkipAtIso: stats.lastSkipAt ? iso(stats.lastSkipAt) : "",
      lastJoinAtIso: stats.lastJoinAt ? iso(stats.lastJoinAt) : "",
      lastError: stats.lastError || null,
    },
    at: iso(),
  });
}

export function resetHttpAuthRuntime(stateRef) {
  const root = rootFor(stateRef);
  root.refreshPromise = null;
  root.refreshStats = createRefreshStats();
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
