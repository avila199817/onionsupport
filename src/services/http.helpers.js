/* =========================================================
   Onion SPA - HTTP Helpers
   Archivo: src/services/http.helpers.js

   HTTP HELPERS · FINAL SIMPLE
   - Helpers puros de compatibilidad para Services
   - Sin motor HTTP, sin Auth, sin Router, sin Toast, sin storage
   - Endpoint policy mínimo: /api/auth/me, /auth/me, /api/me y /me privados
   - Sanitización/redacción sin tokens
   - Retry helpers mínimos para compat legacy
========================================================= */

/* =========================================================
   CONFIG
========================================================= */

export const HTTP_HELPERS_VERSION = "20.0.0-final";

export const HTTP_CONFIG = Object.freeze({
  retries: 0,
  retryDelay: 300,
  retryJitter: 100,
  retryStrategy: "linear",
  retryMaxDelay: 4000,
  retryOnStatuses: null,
  retryOnConflict: false,
  retryOnLocked: false,
  retry401: false,
  retryTimeout: false,
  retryPublicAuth: false,

  timeout: 30000,

  autoRefreshOn401: true,
  autoLogoutOn401: false,
  refreshMinIntervalMs: 0,

  logRequests: false,
  logResponses: false,
  logErrors: true,

  defaultUseLoader: false,
  defaultAuth: true,
  defaultCredentials: "include",
  defaultResponseType: "auto",
  defaultAccept: "application/json",
  defaultContentType: "application/json",

  requestIdHeader: "X-Request-Id",
  clientHeader: "X-Onion-Client",
  clientHeaderValue: "onion-spa",

  emitLifecycleEvents: false,
  emitFinalEvents: false,
  emitReadyEvent: false,
  emitBridgeEvent: false,
  emitInterceptorEvents: false,
  emitInitSkippedEvents: false,
  emitRefreshEvents: false,
  emitReplayEvents: false,
  emitAutoLogoutEvents: false,
  emitRuntimeEvents: false,
  emitAuthRefreshEvents: false,
  emitRequestEngineEvents: false,
});

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_METHOD = "GET";
const DEFAULT_ERROR_MESSAGE = "Error en la petición";
const LOCAL_ORIGIN = "http://localhost";

const KNOWN_METHODS = Object.freeze(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const BODYLESS_METHODS = Object.freeze(["GET", "HEAD", "OPTIONS"]);
const IDEMPOTENT_METHODS = Object.freeze(["GET", "HEAD", "OPTIONS"]);
const DEFAULT_RETRYABLE_STATUSES = Object.freeze([408, 425, 429, 500, 502, 503, 504]);

const AUTH_ME_ENDPOINTS = Object.freeze(["/me", "/api/me", "/auth/me", "/api/auth/me"]);

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

const AUTH_ENDPOINT_MARKERS = Object.freeze([
  ...PUBLIC_AUTH_MARKERS,
  "/auth/logout",
  "/auth/logout-all",
  "/auth/signout",
  "/auth/sign-out",
  "/auth/me",
  "/auth/session",
]);

const AUTH_CONTROL_SKIP_REFRESH_MARKERS = Object.freeze([
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

const SENSITIVE_HEADER_RE = /authorization|cookie|set-cookie|token|secret|password|credential|apikey|api-key|jwt|bearer|refresh|access|otp|totp|mfa|2fa|csrf|xsrf/i;
const SENSITIVE_KEY_RE = /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|totp|mfa|2fa|csrf|xsrf|code|pin/i;

const MAX_DEPTH = 4;
const MAX_ARRAY = 50;
const MAX_KEYS = 80;
const MAX_STRING = 4000;

/* =========================================================
   BASICS
========================================================= */

export function isFn(value) {
  return typeof value === "function";
}

export function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isAnyObject(value) {
  return value !== null && typeof value === "object";
}

export function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

export function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  if (value === null || value === undefined) return [];
  return [value];
}

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return fallback;

  const lower = text.toLowerCase();
  if (["undefined", "null", "nan", "[object object]"].includes(lower)) return fallback;

  return text;
}

export function safeLower(value = "", fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

export function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function safeBoolean(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const text = safeLower(value, "");

  if (["true", "1", "yes", "si", "sí", "ok", "on", "enabled", "active"].includes(text)) return true;
  if (["false", "0", "no", "off", "disabled", "inactive"].includes(text)) return false;

  return Boolean(fallback);
}

export function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
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
    try {
      setTimeout(resolve, Math.max(0, safeNumber(ms, 0)));
    } catch {
      resolve();
    }
  });
}

function firstText(...values) {
  for (const value of values) {
    const text = safeText(value, "");
    if (text) return text;
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

/* =========================================================
   REDACTION / SANITIZE
========================================================= */

function preview(value = "", max = MAX_STRING) {
  const text = String(value ?? "");
  return text.length <= max ? text : `${text.slice(0, max)}…[truncated:${text.length}]`;
}

export function redactHttpValue(value = "") {
  let output = preview(value, 12000).trim();
  if (!output) return "";

  try {
    output = output
      .replace(
        /([?&#](?:token|activationToken|activateToken|activation_token|resetToken|reset_token|passwordResetToken|password_reset_token|confirmToken|confirm_token|code|otp|totp|pin|t|access_token|refresh_token|id_token|tempToken|temp_token|temporaryToken|temporary_token|twoFactorToken|two_factor_token|mfaToken|mfa_token|jwt|bearer|auth|authorization|password|newPassword|currentPassword)=)([^&#\s]+)/gi,
        "$1***"
      )
      .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/password-reset\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  } catch {}

  return output;
}

function sanitizeSpecial(value) {
  if (!value) return null;

  if (value instanceof Error) {
    return {
      name: safeText(value.name, "Error"),
      message: redactHttpValue(value.message || ""),
      code: value.code || null,
      status: value.status || value.statusCode || value.response?.status || null,
      timeout: Boolean(value.timeout),
      aborted: Boolean(value.aborted),
      stack: value.stack ? "[stack]" : null,
      url: value.url ? redactHttpValue(value.url) : undefined,
      requestId: value.requestId || undefined,
    };
  }

  try {
    if (typeof Headers !== "undefined" && value instanceof Headers) return sanitizeHeaders(value);
  } catch {}

  try {
    if (typeof URL !== "undefined" && value instanceof URL) return redactHttpValue(value.toString());
  } catch {}

  try {
    if (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams) {
      const output = {};
      for (const [key, item] of value.entries()) {
        output[key] = SENSITIVE_KEY_RE.test(key) ? "***" : redactHttpValue(item);
      }
      return output;
    }
  } catch {}

  try {
    if (typeof FormData !== "undefined" && value instanceof FormData) {
      return {
        type: "FormData",
        keys: Array.from(value.keys()).slice(0, 30),
      };
    }
  } catch {}

  try {
    if (typeof Blob !== "undefined" && value instanceof Blob) {
      return {
        type: value.constructor?.name || "Blob",
        mime: safeText(value.type, ""),
        size: safeNumber(value.size, 0),
      };
    }
  } catch {}

  try {
    if (typeof AbortSignal !== "undefined" && value instanceof AbortSignal) {
      return {
        type: "AbortSignal",
        aborted: Boolean(value.aborted),
        reason: value.aborted ? safeText(value.reason, "") : null,
      };
    }
  } catch {}

  if (value instanceof Date) {
    try {
      return value.toISOString();
    } catch {
      return String(value);
    }
  }

  if (value instanceof RegExp) return String(value);

  return null;
}

function sanitizeInternal(value, depth = 0, keyHint = "", seen = new WeakSet()) {
  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) return value ? "***" : value;
  if (depth > MAX_DEPTH) return "[MaxDepth]";

  if (typeof value === "string") return preview(redactHttpValue(value));
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[Function]";

  if (isAnyObject(value)) {
    try {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    } catch {}
  }

  const special = sanitizeSpecial(value);
  if (special !== null) return special;

  if (Array.isArray(value)) {
    const output = value.slice(0, MAX_ARRAY).map((item) => sanitizeInternal(item, depth + 1, keyHint, seen));
    if (value.length > MAX_ARRAY) output.push(`[truncated:${value.length - MAX_ARRAY}]`);
    return output;
  }

  if (isAnyObject(value)) {
    const output = {};
    const entries = Object.entries(value).slice(0, MAX_KEYS);

    for (const [key, item] of entries) {
      output[key] = sanitizeInternal(item, depth + 1, key, seen);
    }

    const total = Object.keys(value).length;
    if (total > MAX_KEYS) output.__truncatedKeys = total - MAX_KEYS;

    return output;
  }

  return preview(redactHttpValue(String(value)));
}

export function sanitizeData(value, depth = 0, keyHint = "", seenArg = null) {
  let finalKeyHint = keyHint;
  let seen = seenArg;

  try {
    if (typeof WeakSet !== "undefined" && keyHint instanceof WeakSet) {
      seen = keyHint;
      finalKeyHint = "";
    }
  } catch {}

  if (!seen || typeof seen !== "object") seen = new WeakSet();
  return sanitizeInternal(value, depth, finalKeyHint, seen);
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
  } catch {}

  try {
    if (isFn(headers.forEach)) {
      const output = {};
      headers.forEach((value, key) => {
        output[key] = value;
      });
      return output;
    }
  } catch {}

  if (Array.isArray(headers)) {
    const output = {};
    for (const item of headers) {
      if (Array.isArray(item) && item.length >= 2) {
        const key = safeText(item[0], "");
        if (key) output[key] = item[1];
      }
    }
    return output;
  }

  return isObject(headers) ? { ...headers } : {};
}

export function normalizeHeaders(headers = {}) {
  const output = {};

  for (const [key, value] of Object.entries(headersToPlainObject(headers))) {
    const cleanKey = safeText(key, "");
    if (!cleanKey || value === undefined || value === null || value === "") continue;

    const existing = Object.keys(output).find((candidate) => safeLower(candidate) === safeLower(cleanKey));
    output[existing || cleanKey] = value;
  }

  return output;
}

export function getHeaderValue(headers = {}, name = "") {
  const target = safeLower(name, "");
  if (!target) return "";

  const plain = headersToPlainObject(headers);
  const key = Object.keys(plain).find((candidate) => safeLower(candidate) === target);
  return key ? safeText(plain[key], "") : "";
}

export function hasHeader(headers = {}, name = "") {
  return getHeaderValue(headers, name) !== "";
}

export function setHeader(headers = {}, name = "", value = "") {
  const output = normalizeHeaders(headers);
  const cleanName = safeText(name, "");
  if (!cleanName || value === undefined || value === null || value === "") return output;

  const existing = Object.keys(output).find((candidate) => safeLower(candidate) === safeLower(cleanName));
  output[existing || cleanName] = value;
  return output;
}

export function deleteHeader(headers = {}, name = "") {
  const output = normalizeHeaders(headers);
  const target = safeLower(name, "");
  if (!target) return output;

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
   URL / ENDPOINT POLICY
========================================================= */

export function normalizeEndpointPath(path = "") {
  const raw = safeText(path, "");
  if (!raw) return "";

  try {
    const parsed = new URL(raw, getBaseOrigin());
    return normalizePath(parsed.pathname || "/");
  } catch {
    return normalizePath(raw.split("?")[0].split("#")[0] || "/");
  }
}

function normalizePath(path = "/") {
  let value = safeLower(path, "/").replace(/\\/g, "/");
  if (!value.startsWith("/")) value = `/${value}`;
  value = value.replace(/\/{2,}/g, "/");
  if (value.length > 1) value = value.replace(/\/+$/g, "") || "/";
  return value || "/";
}

export function stripApiPrefix(path = "") {
  const normalized = normalizeEndpointPath(path);
  if (normalized === "/api") return "/";
  if (normalized.startsWith("/api/")) return normalized.slice(4) || "/";
  return normalized;
}

export function getComparableEndpointPaths(path = "") {
  const normalized = normalizeEndpointPath(path);
  return Array.from(new Set([normalized, stripApiPrefix(normalized)].filter(Boolean)));
}

export function endpointMatches(path = "", markers = []) {
  const paths = getComparableEndpointPaths(path);

  return safeArray(markers).some((marker) => {
    const cleanMarker = normalizeEndpointPath(marker);
    if (!cleanMarker) return false;

    return paths.some((candidate) => candidate === cleanMarker || candidate.startsWith(`${cleanMarker}/`));
  });
}

export function isAuthMeEndpoint(path = "") {
  return getComparableEndpointPaths(path).some((candidate) => AUTH_ME_ENDPOINTS.includes(candidate));
}

export function isAuthEndpoint(path = "") {
  return Boolean(isAuthMeEndpoint(path) || endpointMatches(path, AUTH_ENDPOINT_MARKERS));
}

export function isPublicAuthEndpoint(path = "") {
  if (isAuthMeEndpoint(path)) return false;
  return endpointMatches(path, PUBLIC_AUTH_MARKERS);
}

export function isAuthRefreshControlEndpoint(path = "") {
  if (isAuthMeEndpoint(path)) return false;
  return endpointMatches(path, AUTH_CONTROL_SKIP_REFRESH_MARKERS);
}

export function isTechnicalPublicRoute(path = "") {
  return endpointMatches(path, TECHNICAL_PUBLIC_ROUTES);
}

export function isTechnicalPublicSpaEndpoint(path = "") {
  return isTechnicalPublicRoute(path);
}

export function isPublicEndpoint(path = "") {
  if (isAuthMeEndpoint(path)) return false;
  return Boolean(isPublicAuthEndpoint(path) || isTechnicalPublicRoute(path));
}

/* =========================================================
   REQUEST CONFIG SANITIZE
========================================================= */

export function shouldToggleGlobalLoader(requestConfig = {}) {
  const cfg = safeObject(requestConfig);

  if (cfg.useLoader === false) return false;
  if (cfg.loader === false) return false;
  if (cfg.noLoader === true) return false;
  if (cfg.silent === true) return false;
  if (cfg.background === true) return false;
  if (cfg._noLoader === true) return false;

  return false;
}

export function sanitizeRequestConfig(requestConfig = {}) {
  const cfg = safeObject(requestConfig);
  const path = firstText(cfg.path, cfg.url, cfg.endpoint, cfg.href, cfg.resource);

  return {
    requestId: cfg.requestId || null,
    method: normalizeMethod(cfg.method || DEFAULT_METHOD),
    path: redactHttpValue(path || ""),
    url: redactHttpValue(cfg.url || ""),
    apiBase: redactHttpValue(cfg.apiBase || ""),
    headers: sanitizeHeaders(cfg.headers || {}),
    query: sanitizeData(cfg.query ?? null, 0, "query"),
    params: sanitizeData(cfg.params ?? null, 0, "params"),
    body: sanitizeData(cfg.body ?? null, 0, "body"),
    auth: cfg.auth !== false,
    public: cfg.public === true,
    skipAuth: cfg.skipAuth === true,
    noAuthHeader: cfg.noAuthHeader === true,
    credentials: safeText(cfg.credentials, ""),
    useLoader: shouldToggleGlobalLoader(cfg),
    silent: cfg.silent === true,
    background: cfg.background === true,
    responseType: safeText(cfg.responseType, "auto"),
    timeout: cfg.timeout ?? null,
    raw: cfg.raw === true,
    upload: cfg.upload === true,
    download: cfg.download === true,
    retries: cfg.retries ?? null,
    retry: cfg.retry !== false,
    skipRetry: cfg._skipRetry === true || cfg.skipRetry === true,
    skipAuthRefresh: cfg._skipAuthRefresh === true || cfg.skipAuthRefresh === true,
    noAutoRefresh: cfg.noAutoRefresh === true || cfg.autoRefresh === false,
    noAutoLogout: cfg.noAutoLogout === true || cfg.autoLogout === false,
    signal: cfg.signal ? "[AbortSignal]" : null,
    meta: sanitizeData(cfg.meta || null, 0, "meta"),
    token: cfg.token ? "***" : null,
    accessToken: cfg.accessToken ? "***" : null,
    access_token: cfg.access_token ? "***" : null,
    refreshToken: cfg.refreshToken ? "***" : null,
    refresh_token: cfg.refresh_token ? "***" : null,
  };
}

/* =========================================================
   LOG FLAGS
========================================================= */

export function shouldLogRequests(config, AppCore) {
  return Boolean(config?.logRequests && (AppCore?.config?.debug || AppCore?.state?.debug));
}

export function shouldLogResponses(config, AppCore) {
  return Boolean(config?.logResponses && (AppCore?.config?.debug || AppCore?.state?.debug));
}

export function shouldLogErrors(config) {
  return Boolean(config?.logErrors);
}

/* =========================================================
   ABORT / TIMEOUT
========================================================= */

export function hasAbortSignal(value) {
  return Boolean(value && typeof value === "object" && "aborted" in value && isFn(value.addEventListener));
}

export function withSignal(controllerOrSignal) {
  if (!controllerOrSignal) return null;

  try {
    if (typeof AbortController !== "undefined" && controllerOrSignal instanceof AbortController) {
      return controllerOrSignal.signal;
    }
  } catch {}

  if (hasAbortSignal(controllerOrSignal)) return controllerOrSignal;
  if (hasAbortSignal(controllerOrSignal?.signal)) return controllerOrSignal.signal;

  return null;
}

export function createAbortControllerSafe() {
  try {
    if (typeof AbortController !== "undefined") return new AbortController();
  } catch {}
  return null;
}

export function createTimeoutSignal(ms = 0) {
  const timeoutMs = safeNumber(ms, 0);
  const controller = createAbortControllerSafe();

  const state = {
    controller,
    signal: controller?.signal || null,
    timeoutId: null,
    fired: false,
    clear() {
      if (!this.timeoutId) return;
      try {
        clearTimeout(this.timeoutId);
      } catch {}
      this.timeoutId = null;
    },
  };

  if (!controller || timeoutMs <= 0) return state;

  try {
    state.timeoutId = setTimeout(() => {
      state.fired = true;
      try {
        controller.abort("timeout");
      } catch {
        try {
          controller.abort();
        } catch {}
      }
    }, timeoutMs);
  } catch {}

  return state;
}

export function mergeSignals(signals = []) {
  const valid = safeArray(signals).map(withSignal).filter(Boolean);
  if (!valid.length) return null;

  try {
    if (typeof AbortSignal !== "undefined" && isFn(AbortSignal.any)) return AbortSignal.any(valid);
  } catch {}

  if (valid.length === 1) return valid[0];

  const controller = createAbortControllerSafe();
  if (!controller) return valid[0] || null;

  const cleanups = [];
  const cleanup = () => {
    for (const fn of cleanups.splice(0)) {
      try {
        fn();
      } catch {}
    }
  };

  const abortFrom = (signal) => {
    if (controller.signal.aborted) return;
    try {
      controller.abort(signal?.reason || "aborted");
    } catch {
      try {
        controller.abort();
      } catch {}
    } finally {
      cleanup();
    }
  };

  for (const signal of valid) {
    if (signal.aborted) {
      abortFrom(signal);
      break;
    }

    const onAbort = () => abortFrom(signal);

    try {
      signal.addEventListener("abort", onAbort, { once: true });
      cleanups.push(() => signal.removeEventListener("abort", onAbort));
    } catch {}
  }

  return controller.signal;
}

export function isAbortError(error) {
  const name = safeLower(error?.name || "");
  const message = safeLower(error?.message || "");
  const code = safeLower(error?.code || "");

  return name === "aborterror" || code === "abort_err" || error?.aborted === true || message.includes("abort");
}

export function isTimeoutError(error) {
  const name = safeLower(error?.name || "");
  const message = safeLower(error?.message || "");
  const reason = safeLower(error?.reason || "");
  const code = safeLower(error?.code || "");

  return Boolean(
    error?.timeout === true ||
      name.includes("timeout") ||
      code.includes("timeout") ||
      message.includes("timeout") ||
      reason.includes("timeout") ||
      message.includes("timed out")
  );
}

/* =========================================================
   RETRY COMPAT
========================================================= */

export function isIdempotentMethod(method = "GET") {
  return IDEMPOTENT_METHODS.includes(normalizeMethod(method));
}

export function isRetryableStatus(status = 0, options = {}) {
  const numeric = safeNumber(status, 0);
  if (!numeric) return false;
  if (numeric === 401 && options.retry401 !== true) return false;
  if (numeric === 409 && options.retryOnConflict === true) return true;
  if (numeric === 423 && options.retryOnLocked === true) return true;
  return DEFAULT_RETRYABLE_STATUSES.includes(numeric) || numeric >= 500;
}

export function isRetryableError(error, options = {}) {
  if (!error) return false;

  const timeout = isTimeoutError(error);
  if (!timeout && isAbortError(error)) return false;
  if (timeout) return options.retryTimeout === true;

  const status = safeNumber(error?.status ?? error?.response?.status, 0);
  return status ? isRetryableStatus(status, options) : true;
}

export function matchesStatusRule(status, retryOnStatuses) {
  if (!Array.isArray(retryOnStatuses)) return null;

  const numeric = Number(status);
  if (!Number.isFinite(numeric)) return false;

  return retryOnStatuses.some((candidate) => {
    if (typeof candidate === "number") return candidate === numeric;

    const rule = safeLower(candidate, "");
    if (!rule) return false;
    if (rule === "5xx") return numeric >= 500 && numeric <= 599;
    if (rule === "4xx") return numeric >= 400 && numeric <= 499;

    if (rule.endsWith("xx")) {
      const group = Number(rule[0]);
      return Number.isFinite(group) && numeric >= group * 100 && numeric <= group * 100 + 99;
    }

    return Number(rule) === numeric;
  });
}

export function parseRetryAfterMs(value = "") {
  const raw = safeText(value, "");
  if (!raw) return 0;

  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const dateMs = Date.parse(raw);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - nowMs()) : 0;
}

export function buildRetryDelay(config, requestConfig = {}, attempt = 0, error = null) {
  const cfg = { ...HTTP_CONFIG, ...safeObject(config) };
  const req = safeObject(requestConfig);

  const retryAfter = getHeaderValue(error?.headers, "retry-after") || getHeaderValue(error?.response?.headers, "retry-after");
  const retryAfterMs = parseRetryAfterMs(retryAfter);

  const maxDelay = Math.max(0, safeNumber(req.retryMaxDelay ?? cfg.retryMaxDelay, HTTP_CONFIG.retryMaxDelay));
  if (retryAfterMs > 0) return maxDelay > 0 ? Math.min(maxDelay, retryAfterMs) : retryAfterMs;

  const base = Math.max(0, safeNumber(req.retryDelay ?? cfg.retryDelay, HTTP_CONFIG.retryDelay));
  const jitter = Math.max(0, safeNumber(req.retryJitter ?? cfg.retryJitter, HTTP_CONFIG.retryJitter));
  const randomJitter = jitter > 0 ? Math.floor(Math.random() * jitter) : 0;

  const strategy = safeLower(req.retryStrategy || cfg.retryStrategy, HTTP_CONFIG.retryStrategy);
  const safeAttempt = Math.max(0, safeNumber(attempt, 0));

  const computed = strategy === "exponential"
    ? base * 2 ** safeAttempt
    : strategy === "fixed"
      ? base
      : base * (safeAttempt + 1);

  const delay = computed + randomJitter;
  return maxDelay > 0 ? Math.min(maxDelay, delay) : delay;
}

export function shouldRetry(config, error, requestConfig = {}, attempt = 0) {
  const cfg = { ...HTTP_CONFIG, ...safeObject(config) };
  const req = safeObject(requestConfig);

  if (req.retry === false || req._skipRetry === true || req.skipRetry === true) return false;

  const maxRetries = Number.isFinite(Number(req.retries))
    ? Number(req.retries)
    : safeNumber(cfg.retries, HTTP_CONFIG.retries);

  if (maxRetries <= 0 || attempt >= maxRetries) return false;

  const status = safeNumber(error?.status ?? error?.response?.status, 0);
  if (status === 401 && req.retry401 !== true && cfg.retry401 !== true) return false;

  if (req.public === true && isPublicAuthEndpoint(firstText(req.path, req.url, req.endpoint)) && req.retryPublicAuth !== true) {
    return false;
  }

  const retryOnStatuses = Array.isArray(req.retryOnStatuses) ? req.retryOnStatuses : cfg.retryOnStatuses;
  if (Array.isArray(retryOnStatuses)) return Boolean(matchesStatusRule(status, retryOnStatuses));

  const method = normalizeMethod(req.method || DEFAULT_METHOD);
  const allowUnsafe = req.retryUnsafe === true || req.retryUnsafeMethods === true;
  if (!isIdempotentMethod(method) && !allowUnsafe) return false;

  return isRetryableError(error, {
    retryOnConflict: req.retryOnConflict ?? cfg.retryOnConflict,
    retryOnLocked: req.retryOnLocked ?? cfg.retryOnLocked,
    retry401: req.retry401 ?? cfg.retry401,
    retryTimeout: req.retryTimeout ?? cfg.retryTimeout,
  });
}

/* =========================================================
   ERROR NORMALIZATION
========================================================= */

function extractErrorData(error = null) {
  return error?.data || error?.body || error?.payload || error?.response?.data || error?.response?.body || null;
}

function extractErrorHeaders(error = null) {
  return error?.headers || error?.response?.headers || null;
}

function extractErrorMessage(error, fallback = DEFAULT_ERROR_MESSAGE) {
  if (!error) return fallback;

  const data = extractErrorData(error);
  const nested = isObject(data?.error) ? data.error : null;

  return firstText(
    data?.message,
    data?.mensaje,
    nested?.message,
    nested?.mensaje,
    nested?.detail,
    data?.error,
    data?.detail,
    data?.title,
    data?.reason,
    data?.description,
    error?.message,
    error?.statusText,
    error?.response?.statusText,
    fallback
  );
}

function defineRaw(target, raw) {
  if (!target || !raw) return target;

  try {
    Object.defineProperty(target, "raw", {
      value: raw,
      enumerable: false,
      configurable: true,
      writable: false,
    });
  } catch {}

  return target;
}

export function normalizeError(error, requestConfig = null) {
  const raw = error?.raw || error;
  const status = safeNumber(error?.status ?? error?.statusCode ?? error?.response?.status, 0);
  const statusText = safeText(error?.statusText ?? error?.response?.statusText, "");
  const method = normalizeMethod(error?.method || requestConfig?.method || DEFAULT_METHOD);

  const rawUrl = firstText(
    error?.redactedUrl,
    error?.url,
    error?.path,
    requestConfig?.url,
    requestConfig?.path
  );

  const timeout = error?.timeout === true || isTimeoutError(error);
  const aborted = timeout ? false : error?.aborted === true || isAbortError(error);

  const normalized = {
    name: "HttpErrorNormalized",
    message: redactHttpValue(extractErrorMessage(error)),
    status,
    statusText: redactHttpValue(statusText),
    data: sanitizeData(extractErrorData(error)),
    headers: sanitizeHeaders(extractErrorHeaders(error)),
    url: redactHttpValue(rawUrl),
    path: redactHttpValue(error?.path || requestConfig?.path || ""),
    redactedUrl: redactHttpValue(rawUrl),
    method,
    code: error?.code || null,
    requestId: error?.requestId || requestConfig?.requestId || null,
    requestConfig: requestConfig ? sanitizeRequestConfig(requestConfig) : null,
    aborted,
    timeout,
    retryable: isRetryableError(error, {
      retryOnConflict: requestConfig?.retryOnConflict,
      retryOnLocked: requestConfig?.retryOnLocked,
      retry401: requestConfig?.retry401,
      retryTimeout: requestConfig?.retryTimeout,
    }),
    public: requestConfig?.public === true,
    auth: requestConfig?.auth !== false,
    at: error?.at || isoNow(),
  };

  return defineRaw(normalized, raw);
}

/* =========================================================
   REQUEST SUMMARY / DEFAULT CONFIG
========================================================= */

export function buildRequestSummary(requestConfig = {}) {
  const cfg = safeObject(requestConfig);
  const path = firstText(cfg.path, cfg.url, cfg.endpoint, cfg.href, cfg.resource);

  return {
    requestId: cfg.requestId || null,
    method: normalizeMethod(cfg.method || DEFAULT_METHOD),
    path: redactHttpValue(path),
    query: sanitizeData(cfg.query || null, 0, "query"),
    auth: cfg.auth !== false,
    public: cfg.public === true,
    skipAuth: cfg.skipAuth === true,
    noAuthHeader: cfg.noAuthHeader === true,
    retries: cfg.retries ?? null,
    retry: cfg.retry !== false,
    useLoader: shouldToggleGlobalLoader(cfg),
    responseType: cfg.responseType || "auto",
    timeout: cfg.timeout ?? null,
    raw: cfg.raw === true,
    upload: cfg.upload === true,
    download: cfg.download === true,
    skipRetry: cfg._skipRetry === true || cfg.skipRetry === true,
    skipAuthRefresh: cfg._skipAuthRefresh === true || cfg.skipAuthRefresh === true,
    noAutoRefresh: cfg.noAutoRefresh === true || cfg.autoRefresh === false,
    noAutoLogout: cfg.noAutoLogout === true || cfg.autoLogout === false,
  };
}

export function buildAttemptPayload({ requestConfig = {}, attempt = 0, retries = 0, error = null, delayMs = 0, phase = "attempt" } = {}) {
  const cfg = safeObject(requestConfig);
  const normalizedError = error ? normalizeError(error, cfg) : null;

  return {
    phase: safeText(phase, "attempt"),
    requestId: cfg.requestId || null,
    attempt: safeNumber(attempt, 0),
    retries: safeNumber(retries, 0),
    delayMs: safeNumber(delayMs, 0),
    method: normalizeMethod(cfg.method || DEFAULT_METHOD),
    path: redactHttpValue(firstText(cfg.path, cfg.url, cfg.endpoint, cfg.href, cfg.resource)),
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

function resolveApiBase(config = {}, AppCore = null, options = {}) {
  return firstText(
    options.apiBase,
    config.apiBase,
    config.baseUrl,
    AppCore?.config?.apiBase,
    AppCore?.config?.apiOrigin,
    AppCore?.config?.apiUrl,
    AppCore?.config?.api?.baseUrl,
    AppCore?.config?.api?.base,
    AppCore?.config?.api?.origin,
    ""
  );
}

export function buildDefaultRequestConfig(config, AppCore, method, path, options = {}) {
  const cfg = { ...HTTP_CONFIG, ...safeObject(config) };
  const opts = safeObject(options);

  const finalMethod = normalizeMethod(opts.method || method || DEFAULT_METHOD);
  const finalPath = safeText(opts.path || path, "");
  const authMe = isAuthMeEndpoint(finalPath);
  const publicEndpoint = !authMe && (
    opts.public === true ||
    opts.auth === false ||
    opts.skipAuth === true ||
    opts.noAuthHeader === true ||
    isPublicEndpoint(finalPath)
  );

  const auth = authMe ? true : publicEndpoint ? false : opts.auth ?? cfg.defaultAuth !== false;
  const publicLike = !authMe && (publicEndpoint || auth === false);

  const finalConfig = {
    ...opts,
    method: finalMethod,
    path: finalPath,
    url: opts.url || "",
    apiBase: resolveApiBase(cfg, AppCore, opts),
    body: isBodylessMethod(finalMethod) ? undefined : opts.body ?? opts.data ?? opts.payload ?? null,
    headers: normalizeHeaders(opts.headers || {}),
    auth,
    public: publicLike,
    skipAuth: publicLike,
    noAuthHeader: publicLike,
    timeout: safeNumber(opts.timeout ?? opts.timeoutMs ?? cfg.timeout, HTTP_CONFIG.timeout),
    raw: opts.raw === true,
    rawBody: opts.rawBody === true,
    upload: opts.upload === true,
    download: opts.download === true,
    responseType: safeText(opts.responseType, cfg.defaultResponseType || HTTP_CONFIG.defaultResponseType),
    query: opts.query ?? null,
    params: opts.params ?? null,
    credentials: safeText(opts.credentials, cfg.defaultCredentials || HTTP_CONFIG.defaultCredentials),
    useLoader: shouldToggleGlobalLoader(opts),
    retries: safeNumber(opts.retries ?? cfg.retries, HTTP_CONFIG.retries),
    retry: opts.retry !== false,
    retryUnsafe: opts.retryUnsafe === true,
    retryUnsafeMethods: opts.retryUnsafeMethods === true,
    retry401: opts.retry401 === true,
    retryTimeout: opts.retryTimeout === true,
    retryPublicAuth: opts.retryPublicAuth === true,
    retryStrategy: safeText(opts.retryStrategy, cfg.retryStrategy || HTTP_CONFIG.retryStrategy),
    retryDelay: safeNumber(opts.retryDelay ?? opts.retryDelayMs ?? cfg.retryDelay, HTTP_CONFIG.retryDelay),
    retryJitter: safeNumber(opts.retryJitter ?? cfg.retryJitter, HTTP_CONFIG.retryJitter),
    retryMaxDelay: safeNumber(opts.retryMaxDelay ?? opts.retryMaxDelayMs ?? cfg.retryMaxDelay, HTTP_CONFIG.retryMaxDelay),
    retryOnStatuses: Array.isArray(opts.retryOnStatuses) ? opts.retryOnStatuses : cfg.retryOnStatuses,
    retryOnConflict: opts.retryOnConflict === true || cfg.retryOnConflict === true,
    retryOnLocked: opts.retryOnLocked === true || cfg.retryOnLocked === true,
    maxElapsedMs: safeNumber(opts.maxElapsedMs, 0),
    signal: withSignal(opts.signal),
    meta: opts.meta || null,
    requestId: opts.requestId || null,
    _startedAt: safeNumber(opts._startedAt || opts.startedAt, 0),
    emitEvents: opts.emitEvents !== false,
    emitFinalEvents: opts.emitFinalEvents !== false,
    emitLifecycleEvents: opts.emitLifecycleEvents === true,
    emitRuntimeEvents: opts.emitRuntimeEvents === true,
    emitAuthRefreshEvents: opts.emitAuthRefreshEvents === true,
    emitRequestEngineEvents: opts.emitRequestEngineEvents === true,
    _skipRetry: opts._skipRetry === true || opts.skipRetry === true,
    skipRetry: opts._skipRetry === true || opts.skipRetry === true,
    _skipAuthRefresh: authMe ? opts._skipAuthRefresh === true || opts.skipAuthRefresh === true : opts._skipAuthRefresh === true || opts.skipAuthRefresh === true || publicLike,
    skipAuthRefresh: authMe ? opts._skipAuthRefresh === true || opts.skipAuthRefresh === true : opts._skipAuthRefresh === true || opts.skipAuthRefresh === true || publicLike,
    noAutoRefresh: authMe ? opts.noAutoRefresh === true || opts.autoRefresh === false : opts.noAutoRefresh === true || opts.autoRefresh === false || publicLike,
    autoRefresh: !authMe && publicLike ? false : opts.autoRefresh === false ? false : undefined,
    noAutoLogout: authMe ? opts.noAutoLogout === true || opts.autoLogout === false : opts.noAutoLogout === true || opts.autoLogout === false || publicLike,
    autoLogout: !authMe && publicLike ? false : opts.autoLogout === false ? false : undefined,
    _authRefreshAttempted: opts._authRefreshAttempted === true,
    _authRefreshSucceeded: opts._authRefreshSucceeded === true,
    _authRefreshFailed: opts._authRefreshFailed === true,
  };

  if (isBodylessMethod(finalConfig.method)) delete finalConfig.body;
  return finalConfig;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHttpHelpersSnapshot() {
  return sanitizeData({
    version: HTTP_HELPERS_VERSION,
    defaultConfig: {
      retries: HTTP_CONFIG.retries,
      timeout: HTTP_CONFIG.timeout,
      autoRefreshOn401: HTTP_CONFIG.autoRefreshOn401,
      autoLogoutOn401: HTTP_CONFIG.autoLogoutOn401,
      defaultCredentials: HTTP_CONFIG.defaultCredentials,
      defaultResponseType: HTTP_CONFIG.defaultResponseType,
      emitLifecycleEvents: HTTP_CONFIG.emitLifecycleEvents,
      emitFinalEvents: HTTP_CONFIG.emitFinalEvents,
    },
    endpointPolicy: {
      authMePrivate: true,
      authMeEndpoints: [...AUTH_ME_ENDPOINTS],
      publicAuthMarkers: PUBLIC_AUTH_MARKERS.length,
      skipRefreshMarkers: AUTH_CONTROL_SKIP_REFRESH_MARKERS.length,
      technicalPublicRoutes: [...TECHNICAL_PUBLIC_ROUTES],
    },
    sanitize: {
      maxDepth: MAX_DEPTH,
      maxArrayItems: MAX_ARRAY,
      maxObjectKeys: MAX_KEYS,
      maxStringLength: MAX_STRING,
      circularSafe: true,
    },
    retry: {
      idempotentMethods: [...IDEMPOTENT_METHODS],
      bodylessMethods: [...BODYLESS_METHODS],
      retryableStatuses: [...DEFAULT_RETRYABLE_STATUSES],
      defaultRetries: HTTP_CONFIG.retries,
    },
    at: isoNow(),
  });
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

  isIdempotentMethod,
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
