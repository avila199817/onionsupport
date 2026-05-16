/* =========================================================
   Onion SPA - HTTP Request Engine
   Archivo: src/services/http.request.js

   Motor HTTP base:
   - Ejecuta vía AppCore.apiClient / AppCore.request / fetch.
   - Retry con backoff delegando en http.helpers.js.
   - AbortSignal + timeout real.
   - Fallback fetch con JSON/FormData/raw/blob/text.
   - Authorization sólo en requests privadas.
   - /api sin duplicados.
   - Sin refresh, logout, loader ni interceptores.
   - Eventos internos sólo si diagnostics lo pide.
========================================================= */

import {
  normalizeError,
  buildRetryDelay,
  shouldRetry,
  isAbortError,
  isTimeoutError,
  redactHttpValue,
  headersToPlainObject,
  normalizeHeaders,
  sanitizeHeaders,
  sanitizeData,
} from "./http.helpers.js";

import { delay } from "./http.runtime.js";

/* =========================================================
   VERSION
========================================================= */

export const HTTP_REQUEST_ENGINE_VERSION = "18.0.0-clean";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_METHOD = "GET";
const DEFAULT_RESPONSE_TYPE = "auto";
const DEFAULT_API_BASE = "https://api.onionit.net";

const BODYLESS_METHODS = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
]);

const JSON_TYPES = [
  "application/json",
  "application/problem+json",
  "+json",
];

const TEXT_TYPES = [
  "text/",
  "application/xml",
  "application/xhtml+xml",
  "application/csv",
  "application/javascript",
  "application/x-javascript",
];

const BINARY_TYPES = [
  "application/octet-stream",
  "application/pdf",
  "application/zip",
  "image/",
  "audio/",
  "video/",
];

const AUTH_HEADER_NAMES = [
  "Authorization",
  "authorization",
  "X-Auth-Token",
  "x-auth-token",
  "X-Access-Token",
  "x-access-token",
  "X-Refresh-Token",
  "x-refresh-token",
];

const BAD_TOKEN_VALUES = new Set([
  "",
  "null",
  "undefined",
  "false",
  "true",
  "nan",
  "none",
  "empty",
  "[object object]",
  "{}",
  "[]",
  "\"\"",
  "''",
]);

const REQUEST_EVENTS = Object.freeze({
  attempt: "http:request:attempt",
  attemptSuccess: "http:request:attempt:success",
  attemptError: "http:request:attempt:error",
  retry: "http:retry",
  retryStop: "http:retry:stop",
  retryAborted: "http:retry:aborted",
  retryBudgetTimeout: "http:retry:budget-timeout",
  engineError: "http:request:engine:error",
});

let requestSeq = 0;

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

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeLower(value = "", fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeUpper(value = "", fallback = DEFAULT_METHOD) {
  return safeText(value, fallback).toUpperCase();
}

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function isoNow(ms = nowMs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function nextRequestId() {
  requestSeq += 1;
  return `http_req_${requestSeq}_${nowMs()}`;
}

function safeRedact(value = "") {
  try {
    return redactHttpValue(value);
  } catch {
    return safeText(value, "");
  }
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = safeText(value, "");
    if (text) return text;
  }

  return "";
}

function getBaseOrigin() {
  if (isBrowser() && window.location?.origin) {
    return window.location.origin;
  }

  return "http://localhost";
}

function isAbsoluteUrl(value = "") {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(safeText(value, ""));
}

function getFetch() {
  try {
    if (isFn(globalThis?.fetch)) return globalThis.fetch.bind(globalThis);
  } catch {}

  try {
    if (isFn(window?.fetch)) return window.fetch.bind(window);
  } catch {}

  return null;
}

/* =========================================================
   URL
========================================================= */

function normalizePath(path = "") {
  const raw = safeText(path, "");

  if (!raw) return "";
  if (isAbsoluteUrl(raw)) return raw;

  let output = raw.replace(/\\/g, "/");

  if (!output.startsWith("/")) output = `/${output}`;

  output = output.replace(/\/{2,}/g, "/");

  if (output.length > 1 && output.endsWith("/")) {
    output = output.replace(/\/+$/g, "") || "/";
  }

  return output;
}

function normalizeApiBase(base = "") {
  const raw = safeText(base, "");

  if (!raw || raw === "/" || raw === "/api" || raw === "api") {
    return "";
  }

  if (!isAbsoluteUrl(raw)) {
    return raw.replace(/\/+$/g, "");
  }

  try {
    const parsed = new URL(raw);
    const origin = parsed.origin.replace(/\/+$/g, "");
    const pathname = normalizePath(parsed.pathname || "/");

    if (pathname === "/" || pathname === "/api") {
      return origin;
    }

    return `${origin}${pathname}`.replace(/\/+$/g, "");
  } catch {
    return "";
  }
}

function getUrlPathname(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";

  try {
    if (isAbsoluteUrl(raw)) {
      return normalizePath(new URL(raw, getBaseOrigin()).pathname || "");
    }

    return normalizePath(raw);
  } catch {
    return normalizePath(raw);
  }
}

function joinUrl(base = "", path = "") {
  const rawPath = safeText(path, "");

  if (!rawPath) return "";
  if (isAbsoluteUrl(rawPath)) return rawPath;

  const cleanBase = normalizeApiBase(base);
  const cleanPath = normalizePath(rawPath);

  if (!cleanBase) return cleanPath;

  const basePath = getUrlPathname(cleanBase);

  if (
    basePath &&
    basePath !== "/" &&
    (cleanPath === basePath || cleanPath.startsWith(`${basePath}/`))
  ) {
    try {
      if (isAbsoluteUrl(cleanBase)) {
        const parsed = new URL(cleanBase, getBaseOrigin());
        return `${parsed.origin}${cleanPath}`;
      }
    } catch {}

    return cleanPath;
  }

  return `${cleanBase}/${cleanPath.replace(/^\/+/g, "")}`;
}

function appendQuery(url = "", query = null) {
  if (!query) return url;

  let params = null;

  try {
    if (typeof URLSearchParams !== "undefined" && query instanceof URLSearchParams) {
      params = query;
    } else if (typeof query === "string") {
      params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
    } else if (isObject(query)) {
      params = new URLSearchParams();

      for (const [key, value] of Object.entries(query)) {
        if (value === null || value === undefined || value === "") continue;

        if (Array.isArray(value)) {
          value.forEach((item) => {
            if (item !== null && item !== undefined && item !== "") {
              params.append(key, String(item));
            }
          });
          continue;
        }

        if (value instanceof Date) {
          params.set(key, value.toISOString());
          continue;
        }

        if (typeof value === "object") {
          params.set(key, JSON.stringify(value));
          continue;
        }

        params.set(key, String(value));
      }
    }
  } catch {
    params = null;
  }

  const queryString = params?.toString?.() || "";

  if (!queryString) return url;

  return `${url}${url.includes("?") ? "&" : "?"}${queryString}`;
}

function mergeQueryAndParams(requestConfig = {}) {
  const cfg = safeObject(requestConfig);

  if (isObject(cfg.query) && isObject(cfg.params)) {
    return {
      ...cfg.params,
      ...cfg.query,
    };
  }

  return cfg.query ?? cfg.params ?? null;
}

function resolveApiBase(AppCore, requestConfig = {}) {
  const cfg = safeObject(requestConfig);

  const fromConfig = safeText(
    cfg.apiBase ||
      AppCore?.config?.apiBase ||
      AppCore?.config?.apiOrigin ||
      AppCore?.config?.apiUrl ||
      AppCore?.config?.api?.base ||
      AppCore?.config?.api?.baseUrl ||
      AppCore?.config?.api?.origin ||
      "",
    ""
  );

  return normalizeApiBase(fromConfig) || DEFAULT_API_BASE;
}

function resolveRequestUrl(AppCore, requestConfig = {}) {
  const cfg = safeObject(requestConfig);
  const query = mergeQueryAndParams(cfg);
  const explicitUrl = safeText(cfg.url, "");
  const path = safeText(cfg.path, "");

  if (explicitUrl) {
    return appendQuery(
      isAbsoluteUrl(explicitUrl)
        ? explicitUrl
        : joinUrl(resolveApiBase(AppCore, cfg), explicitUrl),
      query
    );
  }

  if (!path) return "";

  if (isAbsoluteUrl(path)) {
    return appendQuery(path, query);
  }

  try {
    if (isFn(AppCore?.utils?.buildUrl)) {
      const built = AppCore.utils.buildUrl(path);
      if (safeText(built, "")) return appendQuery(built, query);
    }
  } catch {}

  return appendQuery(joinUrl(resolveApiBase(AppCore, cfg), path), query);
}

function getRequestPath(requestConfig = {}) {
  const cfg = safeObject(requestConfig);

  return firstNonEmpty(
    cfg.path,
    cfg.url,
    cfg.endpoint,
    cfg.href,
    cfg.input,
    cfg.resource,
    cfg.finalUrl,
    cfg.originalUrl,
    cfg.requestUrl,
    cfg.redactedUrl,
    cfg.route,
    cfg.pathname
  );
}

/* =========================================================
   AUTH HEADERS
========================================================= */

function stripBearer(token = "") {
  return safeText(token, "").replace(/^Bearer\s+/i, "").trim();
}

function hasUsableToken(token = "") {
  const value = stripBearer(token);

  if (!value) return false;
  if (BAD_TOKEN_VALUES.has(value.toLowerCase())) return false;
  if (/[\s\r\n\t]/.test(value)) return false;

  return true;
}

function hasHeader(headers = {}, name = "") {
  const target = safeText(name, "").toLowerCase();

  if (!target) return false;

  return Object.keys(headersToPlainObject(headers)).some((key) => key.toLowerCase() === target);
}

function getHeaderValue(headers = {}, name = "") {
  const target = safeText(name, "").toLowerCase();

  if (!target) return "";

  for (const [key, value] of Object.entries(headersToPlainObject(headers))) {
    if (key.toLowerCase() === target) return safeText(value, "");
  }

  return "";
}

function setHeader(headers = {}, name = "", value = "") {
  const cleanName = safeText(name, "");

  if (cleanName) headers[cleanName] = value;

  return headers;
}

function deleteHeader(headers = {}, name = "") {
  const target = safeText(name, "").toLowerCase();

  if (!target) return headers;

  Object.keys(headers).forEach((key) => {
    if (key.toLowerCase() === target) delete headers[key];
  });

  return headers;
}

function stripAuthHeaders(headers = {}) {
  AUTH_HEADER_NAMES.forEach((name) => deleteHeader(headers, name));
  return headers;
}

function shouldStripAuthHeaders(requestConfig = {}) {
  const cfg = safeObject(requestConfig);

  return Boolean(
    cfg.public === true ||
      cfg.auth === false ||
      cfg.skipAuth === true ||
      cfg.noAuthHeader === true
  );
}

function getCoreState(AppCore) {
  try {
    if (isFn(AppCore?.getState)) {
      return AppCore.getState({ includeToken: true });
    }
  } catch {}

  return AppCore?.state || {};
}

function getAuthHeaderFromCore(AppCore) {
  try {
    const header = AppCore?.getAuthHeader?.();
    if (header && typeof header === "object") return header;
  } catch {}

  try {
    const header = AppCore?.auth?.getAuthHeader?.();
    if (header && typeof header === "object") return header;
  } catch {}

  return {};
}

function getStateToken(AppCore) {
  const state = getCoreState(AppCore);

  return firstNonEmpty(
    state.token,
    state.accessToken,
    state.access_token,
    state.authToken,
    state.auth_token,
    state.session?.token,
    state.session?.accessToken,
    state.session?.access_token,
    state.sessionData?.token,
    state.sessionData?.accessToken,
    state.sessionData?.access_token
  );
}

function applyAuthHeaderPolicy(AppCore, headers = {}, requestConfig = {}) {
  if (shouldStripAuthHeaders(requestConfig)) {
    return stripAuthHeaders(headers);
  }

  if (hasHeader(headers, "Authorization")) {
    return headers;
  }

  const explicit = getHeaderValue(getAuthHeaderFromCore(AppCore), "Authorization");

  if (explicit) {
    setHeader(headers, "Authorization", explicit);
    return headers;
  }

  const token = getStateToken(AppCore);

  if (hasUsableToken(token)) {
    setHeader(headers, "Authorization", `Bearer ${stripBearer(token)}`);
  }

  return headers;
}

/* =========================================================
   RECURSION GUARD
========================================================= */

function sameFn(a, b) {
  try {
    return Boolean(a && b && a === b);
  } catch {
    return false;
  }
}

function looksLikeHttpService(candidate = null) {
  return Boolean(
    candidate &&
      typeof candidate === "object" &&
      (
        candidate.__ONION_HTTP_SERVICE__ === true ||
        candidate.SERVICE_NAME === "http" ||
        candidate.HTTP_SERVICE_VERSION ||
        candidate.events?.requestStart === "http:request:start"
      ) &&
      isFn(candidate.request) &&
      (isFn(candidate.get) || isFn(candidate.post))
  );
}

function forbiddenEngineCandidate(candidate = null, requestConfig = {}) {
  if (!candidate) return true;

  const cfg = safeObject(requestConfig);

  const serviceRefs = [
    cfg.service,
    cfg.httpService,
    cfg.Http,
    cfg.http,
    cfg.client,
    cfg.serviceClient,
  ].filter(Boolean);

  if (serviceRefs.some((item) => item === candidate)) return true;

  if (
    isFn(candidate) &&
    (
      sameFn(candidate, cfg.serviceRequest) ||
      sameFn(candidate, cfg.httpRequest) ||
      sameFn(candidate, cfg.request)
    )
  ) {
    return true;
  }

  if (
    isObject(candidate) &&
    (
      sameFn(candidate.request, cfg.serviceRequest) ||
      sameFn(candidate.request, cfg.httpRequest)
    )
  ) {
    return true;
  }

  return looksLikeHttpService(candidate);
}

/* =========================================================
   ABORT / TIMEOUT
========================================================= */

function hasAbortSignal(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      "aborted" in value &&
      isFn(value.addEventListener)
  );
}

function signalAborted(signal) {
  try {
    return Boolean(signal?.aborted);
  } catch {
    return false;
  }
}

function signalReason(signal) {
  try {
    return signal?.reason || null;
  } catch {
    return null;
  }
}

function createAbortError(message = "Request aborted", reason = null) {
  if (reason instanceof Error) {
    try {
      reason.aborted = true;
    } catch {}
    return reason;
  }

  const finalMessage = safeText(reason?.message || reason, message);

  try {
    if (typeof DOMException !== "undefined") {
      const error = new DOMException(finalMessage, "AbortError");
      try {
        error.aborted = true;
      } catch {}
      return error;
    }
  } catch {}

  const error = new Error(finalMessage);
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  error.aborted = true;

  return error;
}

function createTimeoutError(message = "Request timeout") {
  const error = new Error(message);
  error.name = "TimeoutError";
  error.code = "REQUEST_TIMEOUT";
  error.timeout = true;
  return error;
}

function abortSignalAny(signals = []) {
  const valid = safeArray(signals).filter(hasAbortSignal);

  if (!valid.length) return null;

  try {
    if (typeof AbortSignal !== "undefined" && isFn(AbortSignal.any)) {
      return AbortSignal.any(valid);
    }
  } catch {}

  if (valid.length === 1 || typeof AbortController === "undefined") {
    return valid[0];
  }

  const controller = new AbortController();
  const cleanups = [];

  function cleanup() {
    cleanups.splice(0).forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  }

  function abortFrom(signal) {
    if (controller.signal.aborted) return;

    try {
      controller.abort(signalReason(signal) || createAbortError());
    } catch {
      try {
        controller.abort();
      } catch {}
    } finally {
      cleanup();
    }
  }

  for (const signal of valid) {
    if (signal.aborted) {
      abortFrom(signal);
      break;
    }

    const handler = () => abortFrom(signal);

    try {
      signal.addEventListener("abort", handler, { once: true });
      cleanups.push(() => signal.removeEventListener("abort", handler));
    } catch {}
  }

  return controller.signal;
}

function createTimeoutSignal(timeoutMs = 0) {
  const timeout = safeNumber(timeoutMs, 0);

  const state = {
    signal: null,
    controller: null,
    fired: false,
    clear: () => {},
  };

  if (timeout <= 0 || typeof AbortController === "undefined") {
    return state;
  }

  const controller = new AbortController();
  let timer = null;

  state.controller = controller;
  state.signal = controller.signal;

  try {
    timer = setTimeout(() => {
      state.fired = true;

      try {
        controller.abort(createTimeoutError());
      } catch {
        try {
          controller.abort();
        } catch {}
      }
    }, timeout);
  } catch {}

  state.clear = () => {
    try {
      if (timer) clearTimeout(timer);
    } catch {}

    timer = null;
  };

  return state;
}

function buildEngineError(error, requestConfig = {}, patch = {}) {
  const normalized = normalizeError(error, requestConfig);

  const timeout = patch.timeout ?? normalized.timeout ?? isTimeoutError(error) ?? false;

  const aborted = patch.aborted ?? (
    timeout ? false : (normalized.aborted ?? isAbortError(error))
  );

  return {
    ...normalized,
    ...safeObject(patch),
    aborted: Boolean(aborted),
    timeout: Boolean(timeout),
  };
}

function buildAbortEngineError(signal, requestConfig = {}, message = "Request aborted") {
  return buildEngineError(
    createAbortError(message, signalReason(signal)),
    requestConfig,
    {
      aborted: true,
      timeout: false,
    }
  );
}

async function runAbortable(executor, requestConfig = {}, label = "operation") {
  const cfg = safeObject(requestConfig);
  const timeout = createTimeoutSignal(cfg.timeout);
  const signal = abortSignalAny([cfg.signal, timeout.signal]);
  const finalConfig = signal ? { ...cfg, signal } : cfg;

  if (!signal) {
    try {
      return await executor(finalConfig);
    } finally {
      timeout.clear();
    }
  }

  if (signalAborted(signal)) {
    timeout.clear();

    if (timeout.fired) {
      throw buildEngineError(
        createTimeoutError(`${label} timeout`),
        cfg,
        {
          timeout: true,
          aborted: false,
        }
      );
    }

    throw buildAbortEngineError(signal, cfg, `${label} aborted before execution`);
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      try {
        signal.removeEventListener?.("abort", onAbort);
      } catch {}

      timeout.clear();
    };

    const onAbort = () => {
      if (settled) return;

      settled = true;
      cleanup();

      reject(
        timeout.fired
          ? buildEngineError(createTimeoutError(`${label} timeout`), cfg, {
              timeout: true,
              aborted: false,
            })
          : buildAbortEngineError(signal, cfg, `${label} aborted`)
      );
    };

    try {
      signal.addEventListener?.("abort", onAbort, { once: true });
    } catch {}

    Promise.resolve()
      .then(() => executor(finalConfig))
      .then((value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      });
  });
}

/* =========================================================
   EVENTS
========================================================= */

function shouldEmitEngineEvent(AppCore, requestConfig = {}) {
  const cfg = safeObject(requestConfig);

  if (cfg.emitEvents === false) return false;

  if (
    cfg.emitEngineEvents === true ||
    cfg.emitRequestEngineEvents === true ||
    cfg.debugEngineEvents === true
  ) {
    return true;
  }

  try {
    return Boolean(
      AppCore?.config?.diagnostics?.httpRequestEngineEvents === true ||
        AppCore?.config?.diagnostics?.httpLifecycleEvents === true ||
        AppCore?.config?.debugHttpRequestEngine === true
    );
  } catch {
    return false;
  }
}

function safeEmit(AppCore, eventName = "", payload = {}, requestConfig = {}) {
  const name = safeText(eventName, "");

  if (!name || !shouldEmitEngineEvent(AppCore, requestConfig)) {
    return false;
  }

  try {
    AppCore?.events?.emit?.(
      name,
      sanitizeData({
        version: HTTP_REQUEST_ENGINE_VERSION,
        ...safeObject(payload),
      })
    );

    return true;
  } catch {
    return false;
  }
}

function safeWarn(AppCore, ...args) {
  const safeArgs = args.map((item) => sanitizeData(item));

  try {
    AppCore?.utils?.warn?.("[HTTP Request]", ...safeArgs);
    return;
  } catch {}

  try {
    if (AppCore?.config?.debug || AppCore?.config?.debugHttpRequestEngine) {
      console.warn("[HTTP Request]", ...safeArgs);
    }
  } catch {}
}

function sanitizeErrorForEvent(error = null) {
  if (!error) return null;

  return sanitizeData({
    name: safeText(error.name, "Error"),
    message: safeRedact(error.message || ""),
    status: safeNumber(error.status, 0),
    statusText: safeText(error.statusText, ""),
    code: error.code || null,
    method: safeText(error.method, ""),
    url: safeRedact(error.url || ""),
    path: safeRedact(error.path || ""),
    redactedUrl: safeRedact(error.redactedUrl || error.url || error.path || ""),
    requestId: error.requestId || null,
    aborted: Boolean(error.aborted),
    timeout: Boolean(error.timeout),
    retryable: Boolean(error.retryable),
    attempt: error.attempt || null,
    attemptIndex: error.attemptIndex ?? null,
    elapsedMs: error.elapsedMs || null,
  });
}

function attemptPayload({
  requestId,
  requestConfig,
  attempt,
  startedAt,
  extra = {},
} = {}) {
  return sanitizeData({
    requestId,
    path: safeRedact(getRequestPath(requestConfig)),
    method: safeUpper(requestConfig?.method, DEFAULT_METHOD),
    attempt: attempt + 1,
    attemptIndex: attempt,
    elapsedMs: nowMs() - startedAt,
    at: isoNow(),
    ...safeObject(extra),
  });
}

/* =========================================================
   ERRORS
========================================================= */

function invalidPathError(requestConfig = {}) {
  return normalizeError(
    {
      name: "HttpInvalidRequestPath",
      message: "HTTP request sin path válido.",
      status: 0,
      code: "HTTP_INVALID_PATH",
    },
    requestConfig
  );
}

function engineUnavailableError(requestConfig = {}) {
  return normalizeError(
    {
      name: "HttpEngineUnavailable",
      message: "No hay motor HTTP disponible.",
      status: 0,
      code: "HTTP_ENGINE_UNAVAILABLE",
    },
    requestConfig
  );
}

function retryBudgetError({ requestConfig, requestId, attempt, startedAt } = {}) {
  const elapsedMs = nowMs() - startedAt;

  const error = normalizeError(
    {
      name: "HttpRetryBudgetTimeout",
      message: "Retry budget agotado por tiempo.",
      timeout: true,
      code: "RETRY_BUDGET_TIMEOUT",
      status: 0,
    },
    requestConfig
  );

  return {
    ...error,
    requestId,
    attempt: attempt + 1,
    attemptIndex: attempt,
    elapsedMs,
    timeout: true,
    aborted: false,
  };
}

/* =========================================================
   BODY / RESPONSE
========================================================= */

function isFormDataLike(value) {
  try {
    return typeof FormData !== "undefined" && value instanceof FormData;
  } catch {
    return false;
  }
}

function isBlobLike(value) {
  try {
    return typeof Blob !== "undefined" && value instanceof Blob;
  } catch {
    return false;
  }
}

function isArrayBufferLike(value) {
  try {
    return typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer;
  } catch {
    return false;
  }
}

function isArrayBufferViewLike(value) {
  try {
    return typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView?.(value);
  } catch {
    return false;
  }
}

function isUrlSearchParamsLike(value) {
  try {
    return typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams;
  } catch {
    return false;
  }
}

function isReadableStreamLike(value) {
  try {
    return typeof ReadableStream !== "undefined" && value instanceof ReadableStream;
  } catch {
    return false;
  }
}

function prepareFetchBodyAndHeaders(AppCore, requestConfig = {}) {
  const cfg = safeObject(requestConfig);
  const method = safeUpper(cfg.method, DEFAULT_METHOD);
  const headers = normalizeHeaders(cfg.headers || {});

  applyAuthHeaderPolicy(AppCore, headers, cfg);

  if (!hasHeader(headers, "Accept")) {
    headers.Accept = "application/json";
  }

  if (BODYLESS_METHODS.has(method)) {
    deleteHeader(headers, "Content-Type");
    deleteHeader(headers, "content-type");

    return {
      body: undefined,
      headers,
    };
  }

  const body = cfg.body !== undefined
    ? cfg.body
    : cfg.data !== undefined
      ? cfg.data
      : cfg.payload !== undefined
        ? cfg.payload
        : undefined;

  if (body === undefined || body === null) {
    return {
      body: undefined,
      headers,
    };
  }

  if (isFormDataLike(body)) {
    deleteHeader(headers, "Content-Type");
    deleteHeader(headers, "content-type");

    return {
      body,
      headers,
    };
  }

  if (isUrlSearchParamsLike(body)) {
    if (!hasHeader(headers, "Content-Type")) {
      headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
    }

    return {
      body,
      headers,
    };
  }

  if (
    cfg.rawBody === true ||
    cfg.upload === true ||
    isBlobLike(body) ||
    isArrayBufferLike(body) ||
    isArrayBufferViewLike(body) ||
    isReadableStreamLike(body) ||
    typeof body === "string"
  ) {
    return {
      body,
      headers,
    };
  }

  if (!hasHeader(headers, "Content-Type")) {
    headers["Content-Type"] = "application/json";
  }

  try {
    return {
      body: JSON.stringify(body),
      headers,
    };
  } catch {
    return {
      body: undefined,
      headers,
    };
  }
}

function contentTypeIncludes(contentType = "", fragments = []) {
  const clean = safeLower(contentType, "");
  return fragments.some((fragment) => clean.includes(fragment));
}

function responseHasBody(response) {
  return Boolean(
    response &&
      response.status !== 204 &&
      response.status !== 205 &&
      response.status !== 304
  );
}

async function parseFetchResponse(response, requestConfig = {}) {
  const cfg = safeObject(requestConfig);
  const responseType = safeLower(cfg.responseType, DEFAULT_RESPONSE_TYPE);

  if (responseType === "response" || responseType === "raw" || cfg.raw === true) {
    return response;
  }

  if (
    responseType === "void" ||
    responseType === "none" ||
    responseType === "empty" ||
    !responseHasBody(response)
  ) {
    return null;
  }

  if (responseType === "blob") {
    return isFn(response.blob) ? response.blob() : response.arrayBuffer();
  }

  if (responseType === "arraybuffer") {
    return response.arrayBuffer();
  }

  if (responseType === "formdata") {
    return isFn(response.formData) ? response.formData() : null;
  }

  if (responseType === "text") {
    return response.text();
  }

  const contentType = safeLower(response.headers?.get?.("content-type"), "");

  if (responseType === "json" || contentTypeIncludes(contentType, JSON_TYPES)) {
    const text = await response.text();

    if (!safeText(text, "")) return null;

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  if (contentType.includes("multipart/form-data") && isFn(response.formData)) {
    return response.formData();
  }

  if (contentTypeIncludes(contentType, BINARY_TYPES)) {
    return response.arrayBuffer();
  }

  if (contentTypeIncludes(contentType, TEXT_TYPES)) {
    return response.text();
  }

  try {
    const text = await response.text();

    if (!safeText(text, "")) return null;

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}

function responseHeadersToObject(response) {
  const output = {};

  try {
    response?.headers?.forEach?.((value, key) => {
      output[key] = value;
    });
  } catch {}

  return output;
}

function isExpectedStatus(status, expectedStatuses = []) {
  if (!Array.isArray(expectedStatuses)) return false;

  const numeric = safeNumber(status, 0);

  return expectedStatuses
    .map((item) => safeNumber(item, -1))
    .includes(numeric);
}

function extractErrorMessage(data = null, fallback = "") {
  if (!data) return fallback;
  if (typeof data === "string") return data || fallback;
  if (!isObject(data)) return safeText(data, fallback);

  const nested = isObject(data.error) ? data.error : null;
  const errors = Array.isArray(data.errors) ? data.errors : [];

  return (
    safeText(data.message, "") ||
    safeText(data.mensaje, "") ||
    safeText(nested?.message, "") ||
    safeText(nested?.mensaje, "") ||
    safeText(nested?.detail, "") ||
    safeText(nested?.code, "") ||
    safeText(data.error, "") ||
    safeText(data.detail, "") ||
    safeText(data.title, "") ||
    safeText(data.reason, "") ||
    safeText(data.description, "") ||
    safeText(data.msg, "") ||
    safeText(errors?.[0]?.message, "") ||
    safeText(errors?.[0]?.detail, "") ||
    safeText(errors?.[0], "") ||
    fallback
  );
}

function fetchError({ response, data, requestConfig, url } = {}) {
  return normalizeError(
    {
      name: "HttpFetchError",
      message: extractErrorMessage(
        data,
        response?.statusText || `HTTP ${response?.status || 0}`
      ),
      status: response?.status || 0,
      statusText: response?.statusText || "",
      data,
      headers: responseHeadersToObject(response),
      url: safeRedact(url),
      method: requestConfig?.method || DEFAULT_METHOD,
      requestId: requestConfig?.requestId || null,
    },
    requestConfig
  );
}

/* =========================================================
   CORE CLIENT OPTIONS
========================================================= */

function coreRequestOptions(requestConfig = {}) {
  const cfg = safeObject(requestConfig);

  const body = cfg.body !== undefined
    ? cfg.body
    : cfg.data !== undefined
      ? cfg.data
      : null;

  return {
    method: safeUpper(cfg.method, DEFAULT_METHOD),
    body,
    headers: cfg.headers ?? {},

    auth:
      cfg.auth !== false &&
      cfg.public !== true &&
      cfg.skipAuth !== true &&
      cfg.noAuthHeader !== true,

    public: cfg.public === true,
    skipAuth: cfg.skipAuth === true,
    noAuthHeader: cfg.noAuthHeader === true,

    timeout: cfg.timeout,
    signal: cfg.signal,

    raw: cfg.raw === true,
    rawBody: cfg.rawBody === true,
    upload: cfg.upload === true,
    download: cfg.download === true,
    responseType: cfg.responseType || DEFAULT_RESPONSE_TYPE,

    query: cfg.query ?? null,
    params: cfg.params ?? null,

    credentials: cfg.credentials,
    cache: cfg.cache,
    mode: cfg.mode,
    redirect: cfg.redirect,
    referrerPolicy: cfg.referrerPolicy,
    keepalive: cfg.keepalive,

    expectedStatuses: cfg.expectedStatuses || [],
    requestId: cfg.requestId || null,

    emitEvents: cfg.emitCoreEvents === true,
    emitLifecycleEvents: false,
    emitStartEvent: false,
    emitRetryEvents: false,
    emitDedupeEvents: false,
    emitFinalEvents: cfg.emitCoreFinalEvents === true,
    storeError: cfg.storeCoreError === true,
    silent: cfg.silent === true,

    retries: 0,
    retry: false,
    retryUnsafe: false,
    retryUnsafeMethods: false,
    _skipRetry: true,
    skipRetry: true,

    _skipAuthRefresh: cfg._skipAuthRefresh === true || cfg.skipAuthRefresh === true,
    skipAuthRefresh: cfg._skipAuthRefresh === true || cfg.skipAuthRefresh === true,
    noAutoRefresh: cfg.noAutoRefresh === true || cfg.autoRefresh === false,
    autoRefresh:
      cfg.autoRefresh === false || cfg.noAutoRefresh === true
        ? false
        : undefined,

    noAutoLogout: cfg.noAutoLogout === true || cfg.autoLogout === false,
    autoLogout:
      cfg.autoLogout === false || cfg.noAutoLogout === true
        ? false
        : undefined,

    dedupe: cfg.dedupe !== false,
  };
}

async function executeViaMethodClient(client, requestConfig = {}) {
  const cfg = safeObject(requestConfig);
  const method = safeUpper(cfg.method, DEFAULT_METHOD);
  const target = getRequestPath(cfg);
  const options = coreRequestOptions(cfg);

  if (method === "GET" && isFn(client.get)) return client.get(target, options);
  if (method === "HEAD" && isFn(client.head)) return client.head(target, options);
  if (method === "OPTIONS" && isFn(client.options)) return client.options(target, options);

  if (method === "POST" && isFn(client.post)) return client.post(target, options.body, options);
  if (method === "PUT" && isFn(client.put)) return client.put(target, options.body, options);
  if (method === "PATCH" && isFn(client.patch)) return client.patch(target, options.body, options);

  if (method === "DELETE" && isFn(client.delete)) {
    return options.body !== null && options.body !== undefined && client.delete.length >= 3
      ? client.delete(target, options.body, options)
      : client.delete(target, options);
  }

  if (method === "DELETE" && isFn(client.del)) {
    return options.body !== null && options.body !== undefined && client.del.length >= 3
      ? client.del(target, options.body, options)
      : client.del(target, options);
  }

  return undefined;
}

/* =========================================================
   BASE EXECUTION
========================================================= */

async function executeViaApiClient(AppCore, requestConfig = {}) {
  const cfg = safeObject(requestConfig);

  if (cfg.forceFetch === true || cfg.useFetchOnly === true || cfg.skipApiClient === true) {
    return { available: false, value: null };
  }

  const client = AppCore?.apiClient;

  if (!client || forbiddenEngineCandidate(client, cfg)) {
    return { available: false, value: null };
  }

  return runAbortable(
    async (operationConfig) => {
      const target = getRequestPath(operationConfig);
      const options = coreRequestOptions(operationConfig);

      if (isFn(client.request)) {
        return {
          available: true,
          value: await client.request(target, options),
        };
      }

      const value = await executeViaMethodClient(client, operationConfig);

      return value !== undefined
        ? { available: true, value }
        : { available: false, value: null };
    },
    cfg,
    "apiClient"
  );
}

async function executeViaCoreRequest(AppCore, requestConfig = {}) {
  const cfg = safeObject(requestConfig);

  if (cfg.forceFetch === true || cfg.useFetchOnly === true || cfg.skipCoreRequest === true) {
    return { available: false, value: null };
  }

  const requestFn = AppCore?.request;

  if (!isFn(requestFn) || forbiddenEngineCandidate(requestFn, cfg)) {
    return { available: false, value: null };
  }

  return runAbortable(
    async (operationConfig) => ({
      available: true,
      value: await requestFn(
        getRequestPath(operationConfig),
        coreRequestOptions(operationConfig)
      ),
    }),
    cfg,
    "coreRequest"
  );
}

async function executeViaFetch(AppCore, requestConfig = {}) {
  const fetchFn = getFetch();

  if (!fetchFn) {
    return { available: false, value: null };
  }

  const cfg = safeObject(requestConfig);
  const url = resolveRequestUrl(AppCore, cfg);

  if (!url) throw invalidPathError(cfg);

  const timeout = createTimeoutSignal(cfg.timeout);
  const signal = abortSignalAny([cfg.signal, timeout.signal]);
  const prepared = prepareFetchBodyAndHeaders(AppCore, cfg);

  try {
    const init = {
      method: safeUpper(cfg.method, DEFAULT_METHOD),
      headers: prepared.headers,
    };

    if (prepared.body !== undefined) init.body = prepared.body;
    if (signal) init.signal = signal;

    for (const key of [
      "credentials",
      "cache",
      "mode",
      "redirect",
      "referrerPolicy",
      "keepalive",
    ]) {
      if (cfg[key] !== undefined) init[key] = cfg[key];
    }

    const response = await fetchFn(url, init);
    const data = await parseFetchResponse(response, cfg);
    const expected = isExpectedStatus(response.status, cfg.expectedStatuses);

    if (!response.ok && !expected) {
      throw fetchError({
        response,
        data,
        requestConfig: cfg,
        url,
      });
    }

    return { available: true, value: data };
  } catch (error) {
    const timeoutAborted = Boolean(
      timeout.fired === true ||
        (timeout.signal?.aborted === true && cfg.signal?.aborted !== true)
    );

    const manualAborted = Boolean(cfg.signal?.aborted && !timeoutAborted);

    if (timeoutAborted) {
      throw buildEngineError(error, cfg, {
        timeout: true,
        aborted: false,
      });
    }

    if (manualAborted || isAbortError(error)) {
      throw buildEngineError(error, cfg, {
        aborted: true,
        timeout: false,
      });
    }

    throw error;
  } finally {
    timeout.clear();
  }
}

export async function executeBaseRequest(AppCore, requestConfig = {}) {
  const cfg = safeObject(requestConfig);

  if (!safeText(getRequestPath(cfg), "")) {
    throw invalidPathError(cfg);
  }

  if (signalAborted(cfg.signal)) {
    throw buildAbortEngineError(cfg.signal, cfg, "Request aborted before base request");
  }

  for (const executor of [
    executeViaApiClient,
    executeViaCoreRequest,
    executeViaFetch,
  ]) {
    try {
      const result = await executor(AppCore, cfg);
      if (result.available) return result.value;
    } catch (error) {
      throw buildEngineError(error, cfg);
    }
  }

  throw engineUnavailableError(cfg);
}

/* =========================================================
   RETRY
========================================================= */

function retryBudgetExceeded(startedAt, maxElapsedMs = 0) {
  const budget = safeNumber(maxElapsedMs, 0);
  return budget > 0 && nowMs() - startedAt >= budget;
}

function isLikelyPublicAuthRequest(requestConfig = {}) {
  const cfg = safeObject(requestConfig);
  const path = safeLower(getRequestPath(cfg), "");

  if (!path) return false;

  if (
    path.endsWith("/auth/me") ||
    path.endsWith("/api/auth/me") ||
    path === "/me" ||
    path === "/api/me"
  ) {
    return false;
  }

  return Boolean(
    cfg.public === true &&
      (
        path.includes("/auth/login") ||
        path.includes("/auth/register") ||
        path.includes("/auth/signup") ||
        path.includes("/auth/refresh") ||
        path.includes("/auth/activate") ||
        path.includes("/auth/activate-account") ||
        path.includes("/auth/reset-password") ||
        path.includes("/auth/password-reset") ||
        path.includes("/auth/forgot-password") ||
        path.includes("/auth/recover-password") ||
        path.includes("/auth/2fa") ||
        path.includes("/auth/mfa") ||
        path.includes("/auth/otp")
      )
  );
}

function hardRetryStopReason(error = null, requestConfig = {}) {
  const cfg = safeObject(requestConfig);
  const status = safeNumber(error?.status || error?.statusCode, 0);

  if (cfg._skipRetry === true || cfg.skipRetry === true) return "skip-retry";
  if (cfg.retry === false) return "retry-disabled";
  if (safeNumber(cfg.retries, null) === 0) return "retries-zero";
  if (error?.aborted === true || isAbortError(error) || signalAborted(cfg.signal)) return "aborted";

  if (error?.timeout === true || isTimeoutError(error)) {
    return cfg.retryTimeout === true ? "" : "timeout-not-retryable";
  }

  if (status === 401 && cfg.retry401 !== true) return "401-managed-by-auth-refresh";
  if (safeUpper(cfg.method, DEFAULT_METHOD) === "OPTIONS") return "options-no-retry";
  if (isLikelyPublicAuthRequest(cfg) && cfg.retryPublicAuth !== true) return "public-auth-no-retry";

  return "";
}

function fallbackDelay(ms = 0, signal = null, requestConfig = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;

    const cleanup = () => {
      try {
        if (timer) clearTimeout(timer);
      } catch {}

      try {
        signal?.removeEventListener?.("abort", onAbort);
      } catch {}

      timer = null;
    };

    const onAbort = () => {
      if (settled) return;

      settled = true;
      cleanup();

      reject(
        buildAbortEngineError(
          signal,
          requestConfig,
          "Request aborted during retry delay"
        )
      );
    };

    try {
      if (signalAborted(signal)) {
        onAbort();
        return;
      }

      timer = setTimeout(() => {
        if (settled) return;

        settled = true;
        cleanup();
        resolve(true);
      }, Math.max(0, safeNumber(ms, 0)));

      signal?.addEventListener?.("abort", onAbort, { once: true });
    } catch (error) {
      settled = true;
      cleanup();
      reject(error);
    }
  });
}

async function waitForRetry(AppCore, waitMs = 0, signal = null, requestConfig = {}) {
  const ms = Math.max(0, safeNumber(waitMs, 0));

  if (signalAborted(signal)) {
    throw buildAbortEngineError(signal, requestConfig, "Request aborted before retry delay");
  }

  if (ms <= 0) return true;

  if (isFn(delay)) {
    const meta = {
      source: "http.request:retry-delay",
      requestId: requestConfig?.requestId || null,
    };

    const attempts = [
      () => delay(AppCore, ms, signal, meta),
      () => delay(ms, signal, meta),
      () => delay(ms),
    ];

    for (const attempt of attempts) {
      try {
        const result = await attempt();

        if (signalAborted(signal)) {
          throw buildAbortEngineError(signal, requestConfig, "Request aborted after runtime retry delay");
        }

        return result ?? true;
      } catch (error) {
        if (signalAborted(signal) || isAbortError(error)) {
          throw buildAbortEngineError(signal, requestConfig, "Request aborted during retry delay");
        }
      }
    }
  }

  return fallbackDelay(ms, signal, requestConfig);
}

export async function executeWithRetry({
  AppCore,
  config,
  requestConfig = {},
} = {}) {
  const cfg = safeObject(requestConfig);

  const requestId = cfg.requestId || nextRequestId();
  cfg.requestId = requestId;
  cfg.method = safeUpper(cfg.method, DEFAULT_METHOD);

  const startedAt = safeNumber(cfg.startedAt || cfg._startedAt, nowMs());
  cfg.startedAt = startedAt;
  cfg._startedAt = startedAt;

  const maxElapsedMs = safeNumber(cfg.maxElapsedMs, 0);

  let attempt = 0;
  let lastError = null;

  while (true) {
    if (signalAborted(cfg.signal)) {
      lastError = buildAbortEngineError(cfg.signal, cfg, "Request aborted before attempt");

      lastError.requestId = requestId;
      lastError.attempt = attempt + 1;
      lastError.attemptIndex = attempt;
      lastError.elapsedMs = nowMs() - startedAt;

      throw lastError;
    }

    if (retryBudgetExceeded(startedAt, maxElapsedMs)) {
      lastError = retryBudgetError({
        requestConfig: cfg,
        requestId,
        attempt,
        startedAt,
      });

      safeEmit(
        AppCore,
        REQUEST_EVENTS.retryBudgetTimeout,
        attemptPayload({
          requestId,
          requestConfig: cfg,
          attempt,
          startedAt,
          extra: {
            maxElapsedMs,
            error: sanitizeErrorForEvent(lastError),
          },
        }),
        cfg
      );

      throw lastError;
    }

    safeEmit(
      AppCore,
      REQUEST_EVENTS.attempt,
      attemptPayload({
        requestId,
        requestConfig: cfg,
        attempt,
        startedAt,
      }),
      cfg
    );

    try {
      const response = await executeBaseRequest(AppCore, cfg);

      safeEmit(
        AppCore,
        REQUEST_EVENTS.attemptSuccess,
        attemptPayload({
          requestId,
          requestConfig: cfg,
          attempt,
          startedAt,
        }),
        cfg
      );

      return response;
    } catch (error) {
      lastError = buildEngineError(error, cfg, {
        requestId,
        attempt: attempt + 1,
        attemptIndex: attempt,
        elapsedMs: nowMs() - startedAt,
      });

      if (isAbortError(lastError)) lastError.aborted = true;

      if (isTimeoutError(lastError)) {
        lastError.timeout = true;
        lastError.aborted = false;
      }

      safeEmit(
        AppCore,
        REQUEST_EVENTS.attemptError,
        attemptPayload({
          requestId,
          requestConfig: cfg,
          attempt,
          startedAt,
          extra: {
            error: sanitizeErrorForEvent(lastError),
          },
        }),
        cfg
      );

      const stopReason = hardRetryStopReason(lastError, cfg);
      const canRetry = stopReason
        ? false
        : shouldRetry(config, lastError, cfg, attempt);

      if (!canRetry) {
        safeEmit(
          AppCore,
          REQUEST_EVENTS.retryStop,
          attemptPayload({
            requestId,
            requestConfig: cfg,
            attempt,
            startedAt,
            extra: {
              reason: stopReason || "not-retryable",
              error: sanitizeErrorForEvent(lastError),
            },
          }),
          cfg
        );

        break;
      }

      let waitMs = Math.max(
        0,
        safeNumber(buildRetryDelay(config, cfg, attempt, lastError), 0)
      );

      if (maxElapsedMs > 0) {
        const remaining = Math.max(0, maxElapsedMs - (nowMs() - startedAt));

        if (remaining <= 0) {
          lastError = retryBudgetError({
            requestConfig: cfg,
            requestId,
            attempt,
            startedAt,
          });

          safeEmit(
            AppCore,
            REQUEST_EVENTS.retryBudgetTimeout,
            attemptPayload({
              requestId,
              requestConfig: cfg,
              attempt,
              startedAt,
              extra: {
                maxElapsedMs,
                error: sanitizeErrorForEvent(lastError),
              },
            }),
            cfg
          );

          break;
        }

        waitMs = Math.min(waitMs, remaining);
      }

      safeEmit(
        AppCore,
        REQUEST_EVENTS.retry,
        attemptPayload({
          requestId,
          requestConfig: cfg,
          attempt,
          startedAt,
          extra: {
            nextAttempt: attempt + 2,
            waitMs,
            error: sanitizeErrorForEvent(lastError),
          },
        }),
        cfg
      );

      try {
        cfg?.onRetry?.({
          requestId,
          path: cfg.path,
          redactedPath: safeRedact(getRequestPath(cfg)),
          method: cfg.method,
          attempt: attempt + 1,
          attemptIndex: attempt,
          nextAttempt: attempt + 2,
          waitMs,
          elapsedMs: nowMs() - startedAt,
          error: lastError,
        });
      } catch (retryCallbackError) {
        safeWarn(AppCore, "onRetry callback falló.", retryCallbackError);
      }

      try {
        await waitForRetry(AppCore, waitMs, cfg.signal, cfg);
      } catch (delayError) {
        lastError = buildEngineError(delayError, cfg, {
          requestId,
          attempt: attempt + 1,
          attemptIndex: attempt,
          elapsedMs: nowMs() - startedAt,
          aborted: true,
          timeout: false,
        });

        safeEmit(
          AppCore,
          REQUEST_EVENTS.retryAborted,
          attemptPayload({
            requestId,
            requestConfig: cfg,
            attempt,
            startedAt,
            extra: {
              waitMs,
              error: sanitizeErrorForEvent(lastError),
            },
          }),
          cfg
        );

        break;
      }

      if (signalAborted(cfg.signal)) {
        lastError = buildAbortEngineError(cfg.signal, cfg, "Request aborted after retry delay");

        lastError.requestId = requestId;
        lastError.attempt = attempt + 1;
        lastError.attemptIndex = attempt;
        lastError.elapsedMs = nowMs() - startedAt;

        break;
      }

      attempt += 1;
    }
  }

  if (!lastError) {
    lastError = normalizeError(
      {
        name: "HttpRequestFailed",
        message: "HTTP request failed.",
        status: 0,
        code: "HTTP_REQUEST_FAILED",
      },
      cfg
    );
  }

  if (isAbortError(lastError)) lastError.aborted = true;

  if (isTimeoutError(lastError)) {
    lastError.timeout = true;
    lastError.aborted = false;
  }

  lastError.requestId = requestId;
  lastError.elapsedMs = nowMs() - startedAt;
  lastError.path = safeRedact(getRequestPath(cfg));

  lastError.requestConfig = lastError.requestConfig || {
    requestId,
    method: cfg.method || DEFAULT_METHOD,
    path: safeRedact(cfg.path || ""),
    url: safeRedact(cfg.url || ""),
    headers: sanitizeHeaders(cfg.headers || {}),
    auth: cfg.auth !== false,
    public: cfg.public === true,
    skipAuth: cfg.skipAuth === true,
    noAuthHeader: cfg.noAuthHeader === true,
    skipRetry: cfg._skipRetry === true || cfg.skipRetry === true,
    skipAuthRefresh: cfg._skipAuthRefresh === true || cfg.skipAuthRefresh === true,
  };

  safeEmit(
    AppCore,
    REQUEST_EVENTS.engineError,
    {
      requestId,
      path: safeRedact(getRequestPath(cfg)),
      method: cfg.method || DEFAULT_METHOD,
      elapsedMs: lastError.elapsedMs,
      error: sanitizeErrorForEvent(lastError),
    },
    cfg
  );

  throw lastError;
}

/* =========================================================
   DEBUG
========================================================= */

export function getHttpRequestEngineSnapshot() {
  return sanitizeData({
    version: HTTP_REQUEST_ENGINE_VERSION,
    requestSeq,

    policy: {
      fallbackApiBase: DEFAULT_API_BASE,
      noRefresh: true,
      noLogout: true,
      noLoader: true,
      noInterceptors: true,
      recursionGuard: true,
      timeoutWrapsApiClient: true,
      stripsAuthOnPublicRequests: true,
      noInternal401Retry: true,
      noPublicAuthRetryByDefault: true,
      fallbackFetchCanAttachPrivateAuthHeader: true,
      doubleApiGuard: true,
    },

    at: isoNow(),
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  HTTP_REQUEST_ENGINE_VERSION,

  executeBaseRequest,
  executeWithRetry,

  getHttpRequestEngineSnapshot,
};
