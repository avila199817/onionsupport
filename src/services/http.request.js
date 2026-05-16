/* =========================================================
   Onion SPA - HTTP Request Engine
   Archivo: src/services/http.request.js

   SERVICES HTTP REQUEST · FINAL SIMPLE
   - Capa fina de compatibilidad para Services
   - Delega siempre en src/core/http.js
   - Sin fetch propio, URL builder propio, retry propio ni parser propio
   - Sin refresh, logout, loader, router, toast ni storage
   - Core/Auth/Router/App/Store/Toast/Services separados
========================================================= */

import CoreHttp from "../core/http.js";

/* =========================================================
   VERSION
========================================================= */

export const HTTP_REQUEST_ENGINE_VERSION = "20.0.0-final";

const DEFAULT_METHOD = "GET";
const DEFAULT_API_BASE = "https://api.onionit.net";

const PATH_KEYS = Object.freeze([
  "path",
  "url",
  "endpoint",
  "href",
  "input",
  "resource",
  "finalUrl",
  "originalUrl",
  "requestUrl",
  "route",
  "pathname",
]);

const OPTION_KEYS = Object.freeze([
  "method",
  "headers",
  "query",
  "params",
  "body",
  "data",
  "payload",
  "auth",
  "public",
  "skipAuth",
  "noAuthHeader",
  "timeout",
  "timeoutMs",
  "signal",
  "retries",
  "retryDelay",
  "retryDelayMs",
  "retryMaxDelay",
  "retryMaxDelayMs",
  "responseType",
  "raw",
  "expectedStatuses",
  "credentials",
  "cache",
  "mode",
  "redirect",
  "referrerPolicy",
  "keepalive",
  "silent",
  "dedupe",
]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

let requestSeq = 0;

const stats = {
  total: 0,
  success: 0,
  error: 0,
  lastRequestAt: "",
  lastPath: "",
  lastError: null,
};

/* =========================================================
   BASICS
========================================================= */

const isFn = (value) => typeof value === "function";
const isObject = (value) => value !== null && typeof value === "object";

function isPlainObject(value) {
  if (!isObject(value) || Array.isArray(value)) return false;

  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

function safeObject(value, fallback = {}) {
  return isPlainObject(value) ? value : fallback;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(Object(object), key);
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

function safeUpper(value = "", fallback = DEFAULT_METHOD) {
  return safeText(value, fallback).toUpperCase();
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

function nextRequestId() {
  requestSeq += 1;
  return `svc_req_${requestSeq}_${now()}`;
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
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  } catch {}

  return output;
}

function sanitize(value, depth = 0, keyHint = "", seen = new WeakSet()) {
  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) {
    return value ? "***" : null;
  }

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

/* =========================================================
   REQUEST NORMALIZATION
========================================================= */

function getRequestPath(requestConfig = {}) {
  const cfg = safeObject(requestConfig);

  for (const key of PATH_KEYS) {
    const value = safeText(cfg[key], "");
    if (value) return value;
  }

  return "";
}

function looksLikeOptionsObject(value = {}) {
  return isPlainObject(value) && OPTION_KEYS.some((key) => hasOwn(value, key));
}

function normalizeRequestConfig(requestConfig = {}) {
  const cfg = safeObject(requestConfig);
  const method = safeUpper(cfg.method, DEFAULT_METHOD);

  const body = cfg.body !== undefined
    ? cfg.body
    : cfg.data !== undefined
      ? cfg.data
      : cfg.payload !== undefined
        ? cfg.payload
        : undefined;

  const options = {
    ...cfg,
    method,
    body,
    requestId: cfg.requestId || nextRequestId(),
  };

  if (cfg.timeout === undefined && cfg.timeoutMs !== undefined) {
    options.timeout = cfg.timeoutMs;
  }

  if (cfg.query === undefined && cfg.params !== undefined) {
    options.query = cfg.params;
  }

  if (cfg.retry === false || cfg.skipRetry === true || cfg._skipRetry === true) {
    options.retries = 0;
  }

  return options;
}

function normalizeDirectArgs(firstArg = "/", secondArg = {}, thirdArg = {}) {
  if (isPlainObject(firstArg)) {
    return {
      path: getRequestPath(firstArg),
      options: normalizeRequestConfig({
        ...firstArg,
        ...safeObject(secondArg),
      }),
    };
  }

  if (
    typeof firstArg === "string" &&
    /^[A-Z]+$/i.test(firstArg) &&
    typeof secondArg === "string"
  ) {
    return {
      path: secondArg,
      options: normalizeRequestConfig({
        ...safeObject(thirdArg),
        method: firstArg,
      }),
    };
  }

  return {
    path: safeText(firstArg, ""),
    options: normalizeRequestConfig(secondArg),
  };
}

function normalizeMethodArgs(method, endpoint = "/", bodyOrOptions = undefined, maybeOptions = undefined) {
  const finalMethod = safeUpper(method, DEFAULT_METHOD);

  if (["GET", "HEAD", "OPTIONS"].includes(finalMethod)) {
    return {
      path: endpoint,
      options: normalizeRequestConfig({
        ...safeObject(bodyOrOptions),
        method: finalMethod,
      }),
    };
  }

  if (finalMethod === "DELETE" && maybeOptions === undefined && looksLikeOptionsObject(bodyOrOptions)) {
    return {
      path: endpoint,
      options: normalizeRequestConfig({
        ...safeObject(bodyOrOptions),
        method: finalMethod,
      }),
    };
  }

  return {
    path: endpoint,
    options: normalizeRequestConfig({
      ...safeObject(maybeOptions),
      method: finalMethod,
      body: bodyOrOptions,
    }),
  };
}

/* =========================================================
   CORE HTTP RESOLUTION
========================================================= */

function isServiceHttpCandidate(candidate = null) {
  return Boolean(
    candidate &&
      typeof candidate === "object" &&
      (
        candidate.__ONION_HTTP_SERVICE__ === true ||
        candidate.SERVICE_NAME === "http" ||
        candidate.HTTP_SERVICE_VERSION ||
        candidate.HTTP_REQUEST_ENGINE_VERSION === HTTP_REQUEST_ENGINE_VERSION
      )
  );
}

function isCoreHttpCandidate(candidate = null) {
  return Boolean(
    candidate &&
      typeof candidate === "object" &&
      isFn(candidate.request) &&
      !isServiceHttpCandidate(candidate)
  );
}

function resolveCoreHttp(AppCore = null) {
  const candidates = [
    AppCore?.http,
    AppCore?.Http,
    AppCore?.api,
    AppCore?.apiClient,
    AppCore?.services?.http,
    AppCore?.services?.Http,
    AppCore?.services?.api,
    AppCore?.services?.apiClient,
    CoreHttp,
  ];

  for (const candidate of candidates) {
    if (isCoreHttpCandidate(candidate)) return candidate;
  }

  return CoreHttp;
}

async function callCoreHttp(client, path = "/", options = {}) {
  const method = safeUpper(options.method, DEFAULT_METHOD);

  if (isFn(client?.request)) {
    return client.request(path, options);
  }

  if (method === "GET" && isFn(client?.get)) return client.get(path, options);
  if (method === "HEAD" && isFn(client?.head)) return client.head(path, options);
  if (method === "OPTIONS" && isFn(client?.options)) return client.options(path, options);
  if (method === "POST" && isFn(client?.post)) return client.post(path, options.body, options);
  if (method === "PUT" && isFn(client?.put)) return client.put(path, options.body, options);
  if (method === "PATCH" && isFn(client?.patch)) return client.patch(path, options.body, options);
  if (method === "DELETE" && isFn(client?.delete)) return client.delete(path, options.body, options);
  if (method === "DELETE" && isFn(client?.del)) return client.del(path, options.body, options);

  throw createEngineError("HTTP_ENGINE_UNAVAILABLE", "No hay Core HTTP disponible.", {
    path,
    method,
  });
}

/* =========================================================
   ERRORS
========================================================= */

function createEngineError(code = "HTTP_REQUEST_ERROR", message = "HTTP request error.", patch = {}) {
  const error = new Error(message);

  error.name = "HttpRequestEngineError";
  error.code = code;
  error.status = patch.status || 0;
  error.statusCode = patch.status || 0;
  error.method = patch.method || "";
  error.path = redact(patch.path || "");
  error.url = redact(patch.url || "");
  error.requestId = patch.requestId || "";
  error.timeout = Boolean(patch.timeout);
  error.aborted = Boolean(patch.aborted);
  error.network = Boolean(patch.network);
  error.at = iso();

  return error;
}

function normalizeThrownError(error, requestConfig = {}) {
  if (error instanceof Error) {
    if (!error.requestId && requestConfig.requestId) {
      try {
        error.requestId = requestConfig.requestId;
      } catch {}
    }

    return error;
  }

  return createEngineError(
    "HTTP_REQUEST_ERROR",
    safeText(error?.message || error, "HTTP request error."),
    {
      method: requestConfig.method,
      path: getRequestPath(requestConfig),
      requestId: requestConfig.requestId,
      status: error?.status || error?.statusCode || 0,
      timeout: error?.timeout,
      aborted: error?.aborted,
      network: error?.network,
    }
  );
}

/* =========================================================
   PUBLIC ENGINE
========================================================= */

export async function executeBaseRequest(AppCore, requestConfig = {}) {
  const cfg = normalizeRequestConfig(requestConfig);
  const path = getRequestPath(cfg);

  if (!path) {
    throw createEngineError("HTTP_INVALID_PATH", "HTTP request sin path válido.", {
      method: cfg.method,
      requestId: cfg.requestId,
    });
  }

  stats.total += 1;
  stats.lastRequestAt = iso();
  stats.lastPath = redact(path);

  try {
    const client = resolveCoreHttp(AppCore);
    const result = await callCoreHttp(client, path, cfg);

    stats.success += 1;
    return result;
  } catch (error) {
    const normalized = normalizeThrownError(error, cfg);

    stats.error += 1;
    stats.lastError = sanitize(normalized);

    throw normalized;
  }
}

export async function executeWithRetry({
  AppCore,
  config = {},
  requestConfig = {},
} = {}) {
  const cfg = normalizeRequestConfig({
    ...safeObject(requestConfig),
  });

  const runtimeConfig = safeObject(config);

  if (cfg.retries === undefined && runtimeConfig.retries !== undefined) {
    cfg.retries = runtimeConfig.retries;
  }

  if (cfg.retryDelay === undefined && runtimeConfig.retryDelay !== undefined) {
    cfg.retryDelay = runtimeConfig.retryDelay;
  }

  if (cfg.retryDelayMs === undefined && runtimeConfig.retryDelayMs !== undefined) {
    cfg.retryDelayMs = runtimeConfig.retryDelayMs;
  }

  if (cfg.retryMaxDelay === undefined && runtimeConfig.retryMaxDelay !== undefined) {
    cfg.retryMaxDelay = runtimeConfig.retryMaxDelay;
  }

  if (cfg.retryMaxDelayMs === undefined && runtimeConfig.retryMaxDelayMs !== undefined) {
    cfg.retryMaxDelayMs = runtimeConfig.retryMaxDelayMs;
  }

  return executeBaseRequest(AppCore, cfg);
}

/* =========================================================
   OPTIONAL DIRECT HELPERS
========================================================= */

export function request(AppCore, firstArg = "/", secondArg = {}, thirdArg = {}) {
  const parsed = normalizeDirectArgs(firstArg, secondArg, thirdArg);

  return executeBaseRequest(AppCore, {
    ...parsed.options,
    path: parsed.path,
  });
}

export function get(AppCore, endpoint = "/", options = {}) {
  const parsed = normalizeMethodArgs("GET", endpoint, options);
  return executeBaseRequest(AppCore, { ...parsed.options, path: parsed.path });
}

export function head(AppCore, endpoint = "/", options = {}) {
  const parsed = normalizeMethodArgs("HEAD", endpoint, options);
  return executeBaseRequest(AppCore, { ...parsed.options, path: parsed.path });
}

export function options(AppCore, endpoint = "/", requestOptions = {}) {
  const parsed = normalizeMethodArgs("OPTIONS", endpoint, requestOptions);
  return executeBaseRequest(AppCore, { ...parsed.options, path: parsed.path });
}

export function post(AppCore, endpoint = "/", body = undefined, requestOptions = {}) {
  const parsed = normalizeMethodArgs("POST", endpoint, body, requestOptions);
  return executeBaseRequest(AppCore, { ...parsed.options, path: parsed.path });
}

export function put(AppCore, endpoint = "/", body = undefined, requestOptions = {}) {
  const parsed = normalizeMethodArgs("PUT", endpoint, body, requestOptions);
  return executeBaseRequest(AppCore, { ...parsed.options, path: parsed.path });
}

export function patch(AppCore, endpoint = "/", body = undefined, requestOptions = {}) {
  const parsed = normalizeMethodArgs("PATCH", endpoint, body, requestOptions);
  return executeBaseRequest(AppCore, { ...parsed.options, path: parsed.path });
}

export function del(AppCore, endpoint = "/", bodyOrOptions = {}, maybeOptions = undefined) {
  const parsed = normalizeMethodArgs("DELETE", endpoint, bodyOrOptions, maybeOptions);
  return executeBaseRequest(AppCore, { ...parsed.options, path: parsed.path });
}

/* =========================================================
   DEBUG
========================================================= */

export function getHttpRequestEngineSnapshot() {
  return sanitize({
    version: HTTP_REQUEST_ENGINE_VERSION,
    requestSeq,
    backend: DEFAULT_API_BASE,
    policy: {
      delegatesToCoreHttp: true,
      ownFetch: false,
      ownUrlBuilder: false,
      ownRetry: false,
      ownParser: false,
      ownRefresh: false,
      ownLogout: false,
      ownLoader: false,
      ownInterceptors: false,
    },
    stats,
    at: iso(),
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  HTTP_REQUEST_ENGINE_VERSION,

  executeBaseRequest,
  executeWithRetry,

  request,
  get,
  head,
  options,
  post,
  put,
  patch,
  delete: del,
  del,

  getHttpRequestEngineSnapshot,
};
