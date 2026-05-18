/* =========================================================
   Onion Support - HTTP Helpers
   Archivo: /src/services/http.helpers.js

   Responsabilidad:
   - Helpers puros mínimos de compat para Services.
   - Sin motor HTTP.
   - Sin Auth real.
   - Sin Router.
   - Sin Toast.
   - Sin storage.
   - Sin retry real.
   - Sin loader.
   - Sin endpoints legacy.
   - Sin 2FA/MFA/OTP.
   - /api/auth/me siempre privado.
   - Sin magia negra.
========================================================= */

export const HTTP_HELPERS_VERSION = "simple";

export const HTTP_CONFIG = Object.freeze({
  retries: 0,
  timeout: 30000,

  autoRefreshOn401: true,
  autoLogoutOn401: false,

  defaultAuth: true,
  defaultCredentials: "include",
  defaultResponseType: "auto",
  defaultAccept: "application/json",
  defaultContentType: "application/json",

  logRequests: false,
  logResponses: false,
  logErrors: true,

  emitLifecycleEvents: false,
  emitFinalEvents: false,
});

const DEFAULT_METHOD = "GET";
const DEFAULT_ERROR_MESSAGE = "Error en la petición";
const LOCAL_ORIGIN = "http://localhost";

const KNOWN_METHODS = Object.freeze([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);

const BODYLESS_METHODS = Object.freeze([
  "GET",
  "HEAD",
  "OPTIONS",
]);

const IDEMPOTENT_METHODS = Object.freeze([
  "GET",
  "HEAD",
  "OPTIONS",
]);

const RETRYABLE_STATUSES = Object.freeze([
  408,
  425,
  429,
  500,
  502,
  503,
  504,
]);

const AUTH_ME_ENDPOINTS = Object.freeze([
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

const TECHNICAL_PUBLIC_ROUTES = Object.freeze([
  "/login",
  "/password-request",
  "/password-reset",
  "/activate-account",
]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|csrf|xsrf/i;

const SENSITIVE_HEADER_RE =
  /authorization|cookie|set-cookie|token|secret|password|credential|api-key|apikey|jwt|bearer|refresh|access|csrf|xsrf/i;

/* =========================================================
   BASICS
========================================================= */

export function isFn(value) {
  return typeof value === "function";
}

export function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isAnyObject(value) {
  return Boolean(value && typeof value === "object");
}

export function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

export function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

export function safeText(value, fallback = "") {
  const output = String(value ?? "").trim();

  if (!output) return fallback;

  const lower = output.toLowerCase();

  if (["undefined", "null", "nan", "[object object]"].includes(lower)) {
    return fallback;
  }

  return output;
}

export function safeLower(value = "", fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

export function safeNumber(value, fallback = 0) {
  const output = Number(value);
  return Number.isFinite(output) ? output : fallback;
}

export function safeBoolean(value, fallback = false) {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;

  const clean = safeLower(value, "");

  if (["true", "yes", "si", "sí", "on", "ok"].includes(clean)) return true;
  if (["false", "no", "off"].includes(clean)) return false;

  return Boolean(fallback);
}

export function nowMs() {
  return Date.now();
}

export function isoNow(ms = nowMs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

export function getBaseOrigin() {
  try {
    return window.location?.origin || LOCAL_ORIGIN;
  } catch {
    return LOCAL_ORIGIN;
  }
}

export function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function sleep(ms = 0) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, safeNumber(ms, 0)));
  });
}

function firstText(...values) {
  for (const value of values) {
    const clean = safeText(value, "");
    if (clean) return clean;
  }

  return "";
}

/* =========================================================
   METHOD
========================================================= */

export function normalizeMethod(method = DEFAULT_METHOD) {
  const clean = safeText(method, DEFAULT_METHOD).toUpperCase();

  return KNOWN_METHODS.includes(clean) ? clean : DEFAULT_METHOD;
}

export function isKnownMethod(method = "") {
  return KNOWN_METHODS.includes(safeText(method, "").toUpperCase());
}

export function isBodylessMethod(method = DEFAULT_METHOD) {
  return BODYLESS_METHODS.includes(normalizeMethod(method));
}

export function isIdempotentMethod(method = DEFAULT_METHOD) {
  return IDEMPOTENT_METHODS.includes(normalizeMethod(method));
}

/* =========================================================
   REDACTION / SANITIZE
========================================================= */

export function redactHttpValue(value = "") {
  return String(value ?? "")
    .replace(/([?&#](?:token|access_token|refresh_token|auth|authorization|password)=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

export function sanitizeData(value, _depth = 0, keyHint = "") {
  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) {
    return value ? "***" : value;
  }

  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactHttpValue(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redactHttpValue(value.message || ""),
      status: value.status || value.statusCode || value.response?.status || 0,
      code: value.code || null,
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitizeData(item));
  }

  if (isAnyObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 50)) {
      output[key] = sanitizeData(item, 0, key);
    }

    return output;
  }

  return redactHttpValue(String(value));
}

/* =========================================================
   HEADERS
========================================================= */

export function headersToPlainObject(headers = {}) {
  if (!headers) return {};

  try {
    if (typeof Headers !== "undefined" && headers instanceof Headers) {
      const output = {};
      headers.forEach((value, key) => {
        output[key] = value;
      });
      return output;
    }
  } catch {
    // noop
  }

  try {
    if (isFn(headers.forEach)) {
      const output = {};
      headers.forEach((value, key) => {
        output[key] = value;
      });
      return output;
    }
  } catch {
    // noop
  }

  if (Array.isArray(headers)) {
    const output = {};

    for (const pair of headers) {
      if (!Array.isArray(pair) || pair.length < 2) continue;

      const key = safeText(pair[0], "");
      if (key) output[key] = pair[1];
    }

    return output;
  }

  return isObject(headers) ? { ...headers } : {};
}

export function normalizeHeaders(headers = {}) {
  const output = {};

  for (const [key, value] of Object.entries(headersToPlainObject(headers))) {
    const cleanKey = safeText(key, "");

    if (!cleanKey || value === undefined || value === null || value === "") {
      continue;
    }

    const existing = Object.keys(output).find((item) => safeLower(item) === safeLower(cleanKey));

    output[existing || cleanKey] = value;
  }

  return output;
}

export function getHeaderValue(headers = {}, name = "") {
  const target = safeLower(name, "");

  if (!target) return "";

  const plain = headersToPlainObject(headers);
  const key = Object.keys(plain).find((item) => safeLower(item) === target);

  return key ? safeText(plain[key], "") : "";
}

export function hasHeader(headers = {}, name = "") {
  return Boolean(getHeaderValue(headers, name));
}

export function setHeader(headers = {}, name = "", value = "") {
  const output = normalizeHeaders(headers);
  const cleanName = safeText(name, "");

  if (!cleanName || value === undefined || value === null || value === "") {
    return output;
  }

  const existing = Object.keys(output).find((item) => safeLower(item) === safeLower(cleanName));

  output[existing || cleanName] = value;

  return output;
}

export function deleteHeader(headers = {}, name = "") {
  const output = normalizeHeaders(headers);
  const target = safeLower(name, "");

  for (const key of Object.keys(output)) {
    if (safeLower(key) === target) delete output[key];
  }

  return output;
}

export function sanitizeHeaders(headers = {}) {
  const output = {};

  for (const [key, value] of Object.entries(headersToPlainObject(headers))) {
    output[key] = SENSITIVE_HEADER_RE.test(key) && value ? "***" : sanitizeData(value, 0, key);
  }

  return output;
}

/* =========================================================
   ENDPOINT POLICY
========================================================= */

function normalizePath(path = "/") {
  let value = safeLower(path, "/")
    .split("?")[0]
    .split("#")[0]
    .replace(/\\/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/{2,}/g, "/");

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

export function normalizeEndpointPath(path = "") {
  const raw = safeText(path, "");

  if (!raw) return "";

  try {
    const parsed = new URL(raw, getBaseOrigin());
    return normalizePath(parsed.pathname || "/");
  } catch {
    return normalizePath(raw);
  }
}

export function stripApiPrefix(path = "") {
  const clean = normalizeEndpointPath(path);

  if (clean === "/api") return "/";
  if (clean.startsWith("/api/")) return clean.slice(4) || "/";

  return clean;
}

export function getComparableEndpointPaths(path = "") {
  const clean = normalizeEndpointPath(path);
  const stripped = stripApiPrefix(clean);

  return [...new Set([clean, stripped].filter(Boolean))];
}

export function endpointMatches(path = "", markers = []) {
  const candidates = getComparableEndpointPaths(path);

  return safeArray(markers).some((marker) => {
    const cleanMarker = normalizeEndpointPath(marker);
    return Boolean(cleanMarker && candidates.includes(cleanMarker));
  });
}

export function isAuthMeEndpoint(path = "") {
  return endpointMatches(path, AUTH_ME_ENDPOINTS);
}

export function isPublicAuthEndpoint(path = "") {
  if (isAuthMeEndpoint(path)) return false;
  return endpointMatches(path, PUBLIC_AUTH_ENDPOINTS);
}

export function isAuthRefreshControlEndpoint(path = "") {
  if (isAuthMeEndpoint(path)) return false;
  return endpointMatches(path, AUTH_CONTROL_ENDPOINTS);
}

export function isTechnicalPublicRoute(path = "") {
  return endpointMatches(path, TECHNICAL_PUBLIC_ROUTES);
}

export function isTechnicalPublicSpaEndpoint(path = "") {
  return isTechnicalPublicRoute(path);
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

export function isPublicEndpoint(path = "") {
  if (isAuthMeEndpoint(path)) return false;

  return isPublicAuthEndpoint(path) || isTechnicalPublicRoute(path);
}

/* =========================================================
   REQUEST CONFIG
========================================================= */

export function shouldToggleGlobalLoader() {
  return false;
}

export function sanitizeRequestConfig(requestConfig = {}) {
  const cfg = safeObject(requestConfig);
  const path = firstText(cfg.path, cfg.url, cfg.endpoint, cfg.href, cfg.resource);

  return {
    requestId: cfg.requestId || null,
    method: normalizeMethod(cfg.method || DEFAULT_METHOD),
    path: redactHttpValue(path),
    url: redactHttpValue(cfg.url || ""),
    headers: sanitizeHeaders(cfg.headers || {}),
    query: sanitizeData(cfg.query ?? cfg.params ?? null, 0, "query"),
    body: sanitizeData(cfg.body ?? cfg.data ?? cfg.payload ?? null, 0, "body"),
    auth: cfg.auth !== false,
    public: cfg.public === true,
    skipAuth: cfg.skipAuth === true,
    noAuthHeader: cfg.noAuthHeader === true,
    credentials: safeText(cfg.credentials, ""),
    responseType: safeText(cfg.responseType, "auto"),
    timeout: cfg.timeout ?? null,
    raw: cfg.raw === true,
    upload: cfg.upload === true,
    download: cfg.download === true,
    skipRetry: cfg._skipRetry === true || cfg.skipRetry === true,
    skipAuthRefresh: cfg._skipAuthRefresh === true || cfg.skipAuthRefresh === true,
    noAutoRefresh: cfg.noAutoRefresh === true || cfg.autoRefresh === false,
    signal: cfg.signal ? "[AbortSignal]" : null,
    token: cfg.token ? "***" : null,
    accessToken: cfg.accessToken ? "***" : null,
    refreshToken: cfg.refreshToken ? "***" : null,
  };
}

export function buildDefaultRequestConfig(config = {}, AppCore = null, method = DEFAULT_METHOD, path = "/", options = {}) {
  const cfg = {
    ...HTTP_CONFIG,
    ...safeObject(config),
  };

  const opts = safeObject(options);
  const finalMethod = normalizeMethod(opts.method || method || DEFAULT_METHOD);
  const finalPath = safeText(opts.path || path, "");

  const isMe = isAuthMeEndpoint(finalPath);

  const publicLike =
    !isMe &&
    (
      opts.public === true ||
      opts.auth === false ||
      opts.skipAuth === true ||
      opts.noAuthHeader === true ||
      isPublicEndpoint(finalPath)
    );

  const auth = isMe ? true : publicLike ? false : opts.auth ?? cfg.defaultAuth !== false;

  const output = {
    ...opts,

    method: finalMethod,
    path: finalPath,

    apiBase:
      opts.apiBase ||
      cfg.apiBase ||
      AppCore?.config?.apiBase ||
      AppCore?.config?.apiOrigin ||
      "",

    body: isBodylessMethod(finalMethod)
      ? undefined
      : opts.body ?? opts.data ?? opts.payload ?? undefined,

    headers: normalizeHeaders(opts.headers || {}),

    auth,
    public: publicLike,
    skipAuth: publicLike,
    noAuthHeader: publicLike,

    timeout: safeNumber(opts.timeout ?? opts.timeoutMs ?? cfg.timeout, HTTP_CONFIG.timeout),
    responseType: safeText(opts.responseType, cfg.defaultResponseType || HTTP_CONFIG.defaultResponseType),
    credentials: safeText(opts.credentials, cfg.defaultCredentials || HTTP_CONFIG.defaultCredentials),

    query: opts.query ?? opts.params ?? null,

    raw: opts.raw === true,
    upload: opts.upload === true,
    download: opts.download === true,

    retries: safeNumber(opts.retries ?? cfg.retries, HTTP_CONFIG.retries),

    _skipRetry: opts._skipRetry === true || opts.skipRetry === true,
    skipRetry: opts._skipRetry === true || opts.skipRetry === true,

    _skipAuthRefresh: publicLike || opts._skipAuthRefresh === true || opts.skipAuthRefresh === true,
    skipAuthRefresh: publicLike || opts._skipAuthRefresh === true || opts.skipAuthRefresh === true,

    noAutoRefresh: publicLike || opts.noAutoRefresh === true || opts.autoRefresh === false,

    requestId: opts.requestId || null,
    signal: opts.signal || null,
    meta: opts.meta || null,
  };

  if (isBodylessMethod(output.method)) delete output.body;

  return output;
}

export function buildRequestSummary(requestConfig = {}) {
  const cfg = safeObject(requestConfig);
  const path = firstText(cfg.path, cfg.url, cfg.endpoint, cfg.href, cfg.resource);

  return {
    requestId: cfg.requestId || null,
    method: normalizeMethod(cfg.method || DEFAULT_METHOD),
    path: redactHttpValue(path),
    auth: cfg.auth !== false,
    public: cfg.public === true,
    skipAuth: cfg.skipAuth === true,
    noAuthHeader: cfg.noAuthHeader === true,
    responseType: safeText(cfg.responseType, "auto"),
    timeout: cfg.timeout ?? null,
    raw: cfg.raw === true,
    upload: cfg.upload === true,
    download: cfg.download === true,
    skipRetry: cfg._skipRetry === true || cfg.skipRetry === true,
    skipAuthRefresh: cfg._skipAuthRefresh === true || cfg.skipAuthRefresh === true,
    noAutoRefresh: cfg.noAutoRefresh === true || cfg.autoRefresh === false,
  };
}

/* =========================================================
   LOG FLAGS
========================================================= */

export function shouldLogRequests(config = {}, AppCore = null) {
  return Boolean(config?.logRequests && (AppCore?.config?.debug || AppCore?.state?.debug));
}

export function shouldLogResponses(config = {}, AppCore = null) {
  return Boolean(config?.logResponses && (AppCore?.config?.debug || AppCore?.state?.debug));
}

export function shouldLogErrors(config = {}) {
  return Boolean(config?.logErrors);
}

/* =========================================================
   ABORT / TIMEOUT COMPAT
========================================================= */

export function hasAbortSignal(value) {
  return Boolean(value && typeof value === "object" && "aborted" in value && isFn(value.addEventListener));
}

export function withSignal(controllerOrSignal = null) {
  if (!controllerOrSignal) return null;

  try {
    if (typeof AbortController !== "undefined" && controllerOrSignal instanceof AbortController) {
      return controllerOrSignal.signal;
    }
  } catch {
    // noop
  }

  if (hasAbortSignal(controllerOrSignal)) return controllerOrSignal;
  if (hasAbortSignal(controllerOrSignal?.signal)) return controllerOrSignal.signal;

  return null;
}

export function createAbortControllerSafe() {
  try {
    return new AbortController();
  } catch {
    return null;
  }
}

export function createTimeoutSignal() {
  return {
    controller: null,
    signal: null,
    timeoutId: null,
    fired: false,
    clear() {},
  };
}

export function mergeSignals(signals = []) {
  const valid = safeArray(signals).map(withSignal).filter(Boolean);
  return valid[0] || null;
}

export function isAbortError(error = null) {
  const name = safeLower(error?.name || "");
  const message = safeLower(error?.message || "");
  const code = safeLower(error?.code || "");

  return name === "aborterror" || code === "abort_err" || error?.aborted === true || message.includes("abort");
}

export function isTimeoutError(error = null) {
  const name = safeLower(error?.name || "");
  const message = safeLower(error?.message || "");
  const code = safeLower(error?.code || "");

  return Boolean(
    error?.timeout === true ||
      name.includes("timeout") ||
      code.includes("timeout") ||
      message.includes("timeout") ||
      message.includes("timed out")
  );
}

/* =========================================================
   RETRY COMPAT
========================================================= */

export function isRetryableStatus(status = 0, options = {}) {
  const numeric = safeNumber(status, 0);

  if (!numeric) return false;
  if (numeric === 401 && options.retry401 !== true) return false;

  return RETRYABLE_STATUSES.includes(numeric) || numeric >= 500;
}

export function isRetryableError(error = null, options = {}) {
  if (!error) return false;
  if (isAbortError(error)) return false;
  if (isTimeoutError(error)) return options.retryTimeout === true;

  const status = safeNumber(error?.status ?? error?.response?.status, 0);
  return status ? isRetryableStatus(status, options) : false;
}

export function matchesStatusRule(status, retryOnStatuses) {
  if (!Array.isArray(retryOnStatuses)) return null;

  const numeric = Number(status);
  if (!Number.isFinite(numeric)) return false;

  return retryOnStatuses.some((candidate) => Number(candidate) === numeric);
}

export function parseRetryAfterMs(value = "") {
  const raw = safeText(value, "");

  if (!raw) return 0;

  const seconds = Number(raw);

  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const dateMs = Date.parse(raw);

  return Number.isFinite(dateMs) ? Math.max(0, dateMs - nowMs()) : 0;
}

export function buildRetryDelay() {
  return 0;
}

export function shouldRetry(config = {}, error = null, requestConfig = {}, attempt = 0) {
  const cfg = {
    ...HTTP_CONFIG,
    ...safeObject(config),
  };

  const req = safeObject(requestConfig);
  const retries = safeNumber(req.retries ?? cfg.retries, 0);

  if (retries <= 0 || attempt >= retries) return false;
  if (req.retry === false || req._skipRetry === true || req.skipRetry === true) return false;

  const method = normalizeMethod(req.method || DEFAULT_METHOD);

  if (!isIdempotentMethod(method) && req.retryUnsafe !== true) return false;

  return isRetryableError(error, {
    retry401: req.retry401 ?? cfg.retry401,
    retryTimeout: req.retryTimeout ?? cfg.retryTimeout,
  });
}

/* =========================================================
   ERROR NORMALIZATION
========================================================= */

function errorData(error = null) {
  return error?.data || error?.body || error?.payload || error?.response?.data || null;
}

function errorMessage(error = null, fallback = DEFAULT_ERROR_MESSAGE) {
  const data = errorData(error);

  return firstText(
    data?.message,
    data?.mensaje,
    data?.error,
    data?.detail,
    error?.message,
    error?.statusText,
    error?.response?.statusText,
    fallback
  );
}

export function normalizeError(error = null, requestConfig = null) {
  const status = safeNumber(error?.status ?? error?.statusCode ?? error?.response?.status, 0);
  const method = normalizeMethod(error?.method || requestConfig?.method || DEFAULT_METHOD);
  const rawUrl = firstText(error?.url, error?.path, requestConfig?.url, requestConfig?.path);

  const normalized = {
    name: "HttpErrorNormalized",
    message: redactHttpValue(errorMessage(error)),
    status,
    statusText: redactHttpValue(error?.statusText || error?.response?.statusText || ""),
    data: sanitizeData(errorData(error)),
    headers: sanitizeHeaders(error?.headers || error?.response?.headers || {}),
    url: redactHttpValue(rawUrl),
    path: redactHttpValue(error?.path || requestConfig?.path || ""),
    redactedUrl: redactHttpValue(rawUrl),
    method,
    code: error?.code || null,
    requestId: error?.requestId || requestConfig?.requestId || null,
    requestConfig: requestConfig ? sanitizeRequestConfig(requestConfig) : null,
    aborted: isAbortError(error),
    timeout: isTimeoutError(error),
    retryable: isRetryableError(error, requestConfig || {}),
    public: requestConfig?.public === true,
    auth: requestConfig?.auth !== false,
    at: error?.at || isoNow(),
  };

  try {
    Object.defineProperty(normalized, "raw", {
      value: error,
      enumerable: false,
      configurable: true,
    });
  } catch {
    // noop
  }

  return normalized;
}

export function buildAttemptPayload({
  requestConfig = {},
  attempt = 0,
  retries = 0,
  error = null,
  delayMs = 0,
  phase = "attempt",
} = {}) {
  const cfg = safeObject(requestConfig);
  const normalizedError = error ? normalizeError(error, cfg) : null;
  const path = firstText(cfg.path, cfg.url, cfg.endpoint, cfg.href, cfg.resource);

  return {
    phase: safeText(phase, "attempt"),
    requestId: cfg.requestId || null,
    attempt: safeNumber(attempt, 0),
    retries: safeNumber(retries, 0),
    delayMs: safeNumber(delayMs, 0),
    method: normalizeMethod(cfg.method || DEFAULT_METHOD),
    path: redactHttpValue(path),
    auth: cfg.auth !== false,
    public: cfg.public === true,
    status: normalizedError?.status || 0,
    code: normalizedError?.code || null,
    message: normalizedError?.message || "",
    timeout: Boolean(normalizedError?.timeout),
    aborted: Boolean(normalizedError?.aborted),
    retryable: Boolean(normalizedError?.retryable),
    at: isoNow(),
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHttpHelpersSnapshot() {
  return {
    version: HTTP_HELPERS_VERSION,

    config: {
      retries: HTTP_CONFIG.retries,
      timeout: HTTP_CONFIG.timeout,
      autoRefreshOn401: HTTP_CONFIG.autoRefreshOn401,
      defaultCredentials: HTTP_CONFIG.defaultCredentials,
      defaultResponseType: HTTP_CONFIG.defaultResponseType,
    },

    endpointPolicy: {
      authMePrivate: true,
      authMeEndpoints: [...AUTH_ME_ENDPOINTS],
      publicAuthEndpoints: [...PUBLIC_AUTH_ENDPOINTS],
      publicRoutes: [...TECHNICAL_PUBLIC_ROUTES],
    },

    retry: {
      realRetry: false,
      idempotentMethods: [...IDEMPOTENT_METHODS],
      retryableStatuses: [...RETRYABLE_STATUSES],
    },

    policy: {
      helpersOnly: true,
      noHttpEngine: true,
      noFetch: true,
      noAuthReal: true,
      noRouter: true,
      noToast: true,
      noStorage: true,
      noLoader: true,
      noLegacyRoutes: true,
      no2fa: true,
    },

    at: isoNow(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  HTTP_HELPERS_VERSION,
  HTTP_CONFIG,

  isFn,
  isObject,
  isAnyObject,
  safeObject,
  safeArray,
  safeText,
  safeLower,
  safeNumber,
  safeBoolean,
  nowMs,
  isoNow,
  getBaseOrigin,
  escapeRegExp,
  sleep,

  normalizeMethod,
  isKnownMethod,
  isBodylessMethod,
  isIdempotentMethod,

  headersToPlainObject,
  normalizeHeaders,
  getHeaderValue,
  hasHeader,
  setHeader,
  deleteHeader,
  sanitizeHeaders,

  redactHttpValue,
  sanitizeData,
  sanitizeRequestConfig,

  normalizeEndpointPath,
  stripApiPrefix,
  getComparableEndpointPaths,
  endpointMatches,
  isAuthEndpoint,
  isAuthMeEndpoint,
  isPublicAuthEndpoint,
  isAuthRefreshControlEndpoint,
  isTechnicalPublicRoute,
  isTechnicalPublicSpaEndpoint,
  isPublicEndpoint,

  shouldToggleGlobalLoader,
  shouldLogRequests,
  shouldLogResponses,
  shouldLogErrors,

  hasAbortSignal,
  withSignal,
  createAbortControllerSafe,
  createTimeoutSignal,
  mergeSignals,
  isAbortError,
  isTimeoutError,

  isRetryableStatus,
  isRetryableError,
  matchesStatusRule,
  parseRetryAfterMs,
  buildRetryDelay,
  shouldRetry,

  normalizeError,
  buildRequestSummary,
  buildAttemptPayload,
  buildDefaultRequestConfig,

  getHttpHelpersSnapshot,
};
