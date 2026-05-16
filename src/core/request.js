/* =========================================================
   Onion SPA - Core Request
   Archivo: src/core/request.js

   CORE REQUEST · SIMPLE
   - Motor fetch único
   - Timeout real por intento
   - Retry explícito y seguro
   - Dedupe sólo GET/HEAD
   - /api/auth/me siempre privado
   - Sin UI, sin router, sin toast, sin storage
   - Sin tokens en eventos/snapshots
========================================================= */

import { config } from "./config.js";

import {
  buildUrl,
  hasValidToken,
  isPublicApiPath,
  mergeAbortSignals,
  normalizeHeaders,
  isAbortError,
  isProbablyTimeoutError,
  detectNetworkHints,
  redactTokenInText,
  safeText as helperSafeText,
  safeObject as helperSafeObject,
  safeArray as helperSafeArray,
  safeClone as helperSafeClone,
} from "./helpers.js";

export const REQUEST_VERSION = "21.0.0-simple";

const DEFAULT_METHOD = "GET";
const DEFAULT_RESPONSE_TYPE = "auto";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRIES = 0;
const DEFAULT_RETRY_DELAY_MS = 300;
const DEFAULT_RETRY_MAX_DELAY_MS = 4000;

const KNOWN_METHODS = Object.freeze(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const BODYLESS_METHODS = Object.freeze(["GET", "HEAD", "OPTIONS"]);
const DEDUPE_METHODS = Object.freeze(["GET", "HEAD"]);
const RETRYABLE_METHODS = Object.freeze(["GET", "HEAD", "OPTIONS"]);
const RETRYABLE_STATUSES = Object.freeze([408, 425, 429, 500, 502, 503, 504]);
const PRIVATE_ME_PATHS = Object.freeze(["/me", "/api/me", "/auth/me", "/api/auth/me"]);

const JSON_TYPES = Object.freeze(["application/json", "application/problem+json", "+json"]);
const TEXT_TYPES = Object.freeze(["text/", "application/xml", "application/xhtml+xml", "application/csv", "application/javascript", "application/x-javascript"]);
const BINARY_TYPES = Object.freeze(["application/octet-stream", "application/pdf", "application/zip", "image/", "audio/", "video/"]);

const OPTION_KEYS = Object.freeze([
  "method", "headers", "query", "params", "body", "data", "payload", "auth", "public", "skipAuth", "token",
  "timeout", "signal", "retries", "retryDelay", "retryDelayMs", "retryMaxDelay", "retryMaxDelayMs",
  "retryStatuses", "retryMethods", "retryUnsafeMethods", "dedupe", "dedupeKey", "responseType", "raw",
  "silent", "emitEvents", "emitFinalEvents", "emitLifecycleEvents", "emitStartEvent", "emitRetryEvents",
  "emitDedupeEvents", "emitAbortAsError", "expectedStatuses", "credentials", "cache", "mode", "redirect",
  "referrerPolicy", "keepalive", "storeError", "storeAbortError",
]);

const SENSITIVE_HEADER_RE = /authorization|cookie|set-cookie|token|secret|password|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;
const SENSITIVE_KEY_RE = /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

export const REQUEST_EVENTS = Object.freeze({
  start: "app:request:start",
  success: "app:request:success",
  error: "app:request:error",
  retry: "app:request:retry",
  deduped: "app:request:deduped",
  abort: "app:request:abort",
  clearInFlight: "app:request:clear-in-flight",
});

/* =========================================================
   BASICS
========================================================= */

const isFn = (value) => typeof value === "function";
const isObj = (value) => value !== null && typeof value === "object";

function isPlainObject(value) {
  if (!isObj(value) || Array.isArray(value)) return false;
  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

function safeText(value, fallback = "") {
  try {
    if (isFn(helperSafeText)) return helperSafeText(value, fallback);
  } catch {}

  if (value === null || value === undefined) return fallback;
  const out = String(value).trim();
  return out || fallback;
}

function safeObject(value, fallback = {}) {
  try {
    if (isFn(helperSafeObject)) return helperSafeObject(value, fallback);
  } catch {}

  return isPlainObject(value) ? value : fallback;
}

function safeArray(value) {
  try {
    if (isFn(helperSafeArray)) return helperSafeArray(value);
  } catch {}

  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value === null || value === undefined) return [];
  return [value];
}

function safeClone(value, fallback = null) {
  try {
    if (isFn(helperSafeClone)) return helperSafeClone(value, fallback);
  } catch {}

  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function number(value, fallback = 0) {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
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
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "");
  }
}

function hashText(value = "") {
  const input = safeText(value, "");
  let hash = 2166136261;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return `h${(hash >>> 0).toString(36)}`;
}

function normalizeMethod(method = DEFAULT_METHOD) {
  const clean = safeText(method, DEFAULT_METHOD).toUpperCase();
  return KNOWN_METHODS.includes(clean) ? clean : DEFAULT_METHOD;
}

function isKnownMethod(method = "") {
  return KNOWN_METHODS.includes(safeText(method, "").toUpperCase());
}

function bodyAllowed(method = DEFAULT_METHOD) {
  return !BODYLESS_METHODS.includes(normalizeMethod(method));
}

function canDedupe(method = DEFAULT_METHOD) {
  return DEDUPE_METHODS.includes(normalizeMethod(method));
}

function normalizeToken(token = "") {
  const clean = safeText(token, "").replace(/^Bearer\s+/i, "").trim();
  if (!clean) return "";

  try {
    return hasValidToken(clean) ? clean : "";
  } catch {
    return /[\s\r\n\t]/.test(clean) ? "" : clean;
  }
}

function stateToken(state = {}) {
  return normalizeToken(
    state?.token ||
      state?.accessToken ||
      state?.access_token ||
      state?.auth?.token ||
      state?.auth?.accessToken ||
      state?.auth?.access_token ||
      state?.session?.token ||
      state?.session?.accessToken ||
      state?.session?.access_token ||
      ""
  );
}

function getFetch() {
  try {
    return isFn(globalThis?.fetch) ? globalThis.fetch.bind(globalThis) : null;
  } catch {
    return null;
  }
}

/* =========================================================
   PATH POLICY
========================================================= */

function pathForPolicy(path = "") {
  let value = safeText(path, "");
  if (!value) return "/";

  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://local.invalid";
    value = new URL(value, base).pathname || "/";
  } catch {
    value = value.split("?")[0].split("#")[0] || "/";
  }

  value = `/${value}`.replace(/\/+/g, "/").replace(/\/$/, "");
  return (value || "/").toLowerCase();
}

function isPrivateMePath(path = "") {
  return PRIVATE_ME_PATHS.includes(pathForPolicy(path));
}

function isPublicRequestPath(path = "") {
  if (isPrivateMePath(path)) return false;
  try {
    return Boolean(isPublicApiPath(path));
  } catch {
    return false;
  }
}

/* =========================================================
   ARGUMENTS / HEADERS
========================================================= */

function normalizeRequestArguments(arg1, arg2 = {}, arg3 = undefined) {
  if (typeof arg1 === "string" && isKnownMethod(arg1) && typeof arg2 === "string") {
    return {
      path: arg2,
      options: {
        ...safeObject(arg3),
        method: normalizeMethod(arg1),
      },
    };
  }

  if (isPlainObject(arg1)) {
    return {
      path: arg1.path || arg1.url || arg1.endpoint || "/",
      options: {
        ...arg1,
        ...safeObject(arg2),
      },
    };
  }

  return {
    path: arg1,
    options: safeObject(arg2),
  };
}

function looksLikeOptionsObject(value = {}) {
  return isPlainObject(value) && OPTION_KEYS.some((key) => Object.hasOwn(value, key));
}

function headersToObject(headers = {}) {
  const out = {};
  if (!headers) return out;

  try {
    if (typeof Headers !== "undefined" && headers instanceof Headers) {
      headers.forEach((value, key) => {
        out[key] = value;
      });
      return out;
    }
  } catch {}

  try {
    if (isFn(headers.forEach)) {
      headers.forEach((value, key) => {
        out[key] = value;
      });
      return out;
    }
  } catch {}

  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (Array.isArray(entry) && entry.length >= 2) out[entry[0]] = entry[1];
    }
    return out;
  }

  return isPlainObject(headers) ? { ...headers } : out;
}

function normalizePlainHeaders(headers = {}) {
  const source = headersToObject(headers);

  try {
    return headersToObject(normalizeHeaders(source));
  } catch {
    return source;
  }
}

function headerKey(headers = {}, name = "") {
  const target = safeText(name, "").toLowerCase();
  if (!target) return "";
  return Object.keys(headersToObject(headers)).find((key) => key.toLowerCase() === target) || "";
}

function getHeader(headers = {}, name = "") {
  const source = headersToObject(headers);
  const key = headerKey(source, name);
  return key ? source[key] : undefined;
}

function setHeader(headers = {}, name = "", value = "") {
  if (!headers || !name || value === undefined || value === null || value === "") return headers;
  headers[headerKey(headers, name) || name] = value;
  return headers;
}

function deleteHeader(headers = {}, name = "") {
  const key = headerKey(headers, name);
  if (key) delete headers[key];
  return headers;
}

function hasHeader(headers = {}, name = "") {
  return getHeader(headers, name) !== undefined;
}

function responseHeaders(response = null) {
  const out = {};
  try {
    response?.headers?.forEach?.((value, key) => {
      out[key] = value;
    });
  } catch {}
  return out;
}

function sanitizeHeaders(headers = {}) {
  const out = {};
  for (const [key, value] of Object.entries(headersToObject(headers))) {
    out[key] = SENSITIVE_HEADER_RE.test(key) ? "***" : redact(String(value));
  }
  return out;
}

/* =========================================================
   SANITIZE / EVENTS
========================================================= */

function sanitizeValue(value, depth = 0, keyHint = "", seen = new WeakSet()) {
  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) return value ? "***" : null;
  if (depth > 4) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redact(value);
  if (["number", "boolean"].includes(typeof value)) return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redact(value.message || "Error"),
      stack: value.stack ? "[stack]" : null,
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1, keyHint, seen));
  }

  if (isObj(value)) {
    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      out[key] = sanitizeValue(item, depth + 1, key, seen);
    }
    return out;
  }

  return redact(String(value));
}

function sanitizeError(error = {}) {
  const out = safeClone(error, {}) || {};
  out.url = redact(out.url || "");
  out.redactedUrl = redact(out.redactedUrl || out.url || "");
  out.message = redact(out.message || "");
  out.statusText = redact(out.statusText || "");
  out.raw = undefined;
  out.stack = out.stack ? "[stack]" : undefined;
  if (out.headers) out.headers = sanitizeHeaders(out.headers);
  if (out.data) out.data = sanitizeValue(out.data);
  if (out.hints) out.hints = sanitizeValue(out.hints);
  return out;
}

function emit(events, eventName, payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  const clean = sanitizeValue(payload);
  for (const method of ["emit", "dispatch", "trigger"]) {
    try {
      if (isFn(events?.[method])) {
        events[method](name, clean);
        return true;
      }
    } catch {}
  }
  return false;
}

function debugWarn(...args) {
  try {
    if (config?.debug) console.warn("[Request]", ...args.map((item) => sanitizeValue(item)));
  } catch {}
}

/* =========================================================
   RESPONSE PARSER
========================================================= */

function includesAny(value = "", fragments = []) {
  const clean = safeText(value, "").toLowerCase();
  return safeArray(fragments).some((fragment) => clean.includes(fragment));
}

function responseHasBody(response) {
  return Boolean(response && ![204, 205, 304].includes(response.status));
}

export async function parseResponseBody(response, responseType = DEFAULT_RESPONSE_TYPE) {
  if (!responseHasBody(response)) return null;

  const type = safeText(responseType, DEFAULT_RESPONSE_TYPE);
  const contentType = safeText(response.headers?.get?.("content-type"), "").toLowerCase();

  try {
    if (type === "response" || type === "raw") return response;
    if (["void", "none", "empty"].includes(type)) return null;
    if (type === "blob") return isFn(response.blob) ? await response.blob() : await response.arrayBuffer();
    if (type === "arrayBuffer" || type === "arraybuffer") return await response.arrayBuffer();
    if (type === "formData" || type === "formdata") return isFn(response.formData) ? await response.formData() : null;
    if (type === "text") return await response.text();

    if (type === "json" || includesAny(contentType, JSON_TYPES)) {
      const raw = await response.text();
      if (!safeText(raw, "")) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return type === "json" ? null : raw;
      }
    }

    if (contentType.includes("multipart/form-data") && isFn(response.formData)) return await response.formData();
    if (includesAny(contentType, BINARY_TYPES)) return await response.arrayBuffer();
    if (includesAny(contentType, TEXT_TYPES)) return await response.text();

    return await response.text();
  } catch {
    return null;
  }
}

/* =========================================================
   ERROR FACTORY
========================================================= */

function extractDataMessage(data = null) {
  if (!data) return "";
  if (typeof data === "string") return data;
  if (!isObj(data)) return safeText(data, "");

  const errors = Array.isArray(data.errors) ? data.errors : [];

  return (
    safeText(data.message, "") ||
    safeText(data.mensaje, "") ||
    safeText(data.error?.message, "") ||
    safeText(data.error, "") ||
    safeText(data.detail, "") ||
    safeText(data.title, "") ||
    safeText(data.reason, "") ||
    safeText(data.description, "") ||
    safeText(data.msg, "") ||
    safeText(errors?.[0]?.message, "") ||
    safeText(errors?.[0]?.detail, "") ||
    safeText(errors?.[0], "")
  );
}

export function buildRequestError({
  response = null,
  data = null,
  url = "",
  method = DEFAULT_METHOD,
  timeout = false,
  aborted = false,
  raw = null,
  requestId = "",
  attempt = 0,
  attempts = 0,
} = {}) {
  const status = number(response?.status, 0);
  const statusText = safeText(
    response?.statusText,
    timeout ? "Request Timeout" : aborted ? "Request Aborted" : status === 0 ? "Network Error" : "HTTP Error"
  );

  const rawMessage = typeof raw === "string" ? raw : raw?.message || raw?.reason || "";
  const message = safeText(extractDataMessage(data) || rawMessage, statusText);
  const error = new Error(redact(message));

  error.name = "RequestError";
  error.ok = false;
  error.status = status;
  error.statusText = redact(statusText);
  error.url = url;
  error.redactedUrl = redact(url);
  error.method = normalizeMethod(method);
  error.timeout = timeout === true;
  error.aborted = timeout === true ? false : aborted === true;
  error.raw = raw;
  error.data = data;
  error.headers = responseHeaders(response);
  error.hints = status === 0 ? detectNetworkHints(url) : null;
  error.requestId = safeText(requestId, "");
  error.attempt = number(attempt, 0);
  error.attempts = number(attempts, 0);
  error.at = iso();

  return error;
}

/* =========================================================
   ABORT / RETRY
========================================================= */

function isSignal(value) {
  return Boolean(value && typeof value === "object" && "aborted" in value && isFn(value.addEventListener));
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

function abortText(reason, fallback = "Request aborted") {
  return reason instanceof Error ? reason.message || fallback : safeText(reason?.message || reason, fallback);
}

function createAbortError({ signal = null, url = "", method = DEFAULT_METHOD, requestId = "", attempt = 0, attempts = 0, message = "Request aborted" } = {}) {
  return buildRequestError({
    url,
    method,
    aborted: true,
    raw: abortText(signalReason(signal), message),
    requestId,
    attempt,
    attempts,
  });
}

function createController() {
  try {
    return typeof AbortController !== "undefined" ? new AbortController() : null;
  } catch {
    return null;
  }
}

function createTimeout(timeoutMs = 0) {
  const controller = createController();
  const state = {
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

  if (!controller || !timeoutMs || timeoutMs <= 0) return state;

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

function mergeSignals(signals = []) {
  const clean = safeArray(signals).filter(isSignal);
  if (!clean.length) return null;
  if (clean.length === 1) return clean[0];

  try {
    if (typeof AbortSignal !== "undefined" && isFn(AbortSignal.any)) return AbortSignal.any(clean);
  } catch {}

  try {
    if (isFn(mergeAbortSignals)) return mergeAbortSignals(clean);
  } catch {}

  const controller = createController();
  if (!controller) return clean[0];

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
      controller.abort(signalReason(signal) || "aborted");
    } catch {
      try {
        controller.abort();
      } catch {}
    } finally {
      cleanup();
    }
  };

  for (const signal of clean) {
    if (signal.aborted) {
      abortFrom(signal);
      return controller.signal;
    }

    const onAbort = () => abortFrom(signal);
    try {
      signal.addEventListener("abort", onAbort, { once: true });
      cleanups.push(() => signal.removeEventListener("abort", onAbort));
    } catch {}
  }

  return controller.signal;
}

function abortableDelay(ms = 0, signal = null) {
  const delayMs = Math.max(0, number(ms, 0));
  if (delayMs <= 0) return Promise.resolve(true);
  if (signalAborted(signal)) return Promise.reject(createAbortError({ signal, message: "Request aborted before retry delay" }));

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

    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };

    const onAbort = () => settle(reject, createAbortError({ signal, message: "Request aborted during retry delay" }));

    try {
      timer = setTimeout(() => settle(resolve, true), delayMs);
      if (isSignal(signal)) signal.addEventListener("abort", onAbort, { once: true });
    } catch (error) {
      settle(reject, error);
    }
  });
}

function retryAfterMs(value = "") {
  const raw = safeText(value, "");
  if (!raw) return 0;

  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const dateMs = Date.parse(raw);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : 0;
}

function retryMethods(requestConfig = {}) {
  const configured = requestConfig.retryMethods?.length
    ? requestConfig.retryMethods
    : config?.requestRetryMethods || config?.api?.retryMethods;

  return safeArray(configured).flat(Infinity).map(normalizeMethod).filter(Boolean);
}

function isNonReplayableBody(body) {
  try {
    return typeof ReadableStream !== "undefined" && body instanceof ReadableStream;
  } catch {
    return false;
  }
}

function isRetryableMethod(method = DEFAULT_METHOD, requestConfig = {}) {
  if (requestConfig.retryUnsafeMethods === true) return true;
  const methods = retryMethods(requestConfig);
  return (methods.length ? methods : RETRYABLE_METHODS).includes(normalizeMethod(method));
}

export function shouldRetryRequest(error, requestConfig = {}) {
  const retries = number(requestConfig?.retries ?? config?.requestRetries ?? config?.api?.retries, DEFAULT_RETRIES);
  if (retries <= 0) return false;
  if (!isRetryableMethod(requestConfig?.method, requestConfig)) return false;
  if (isNonReplayableBody(requestConfig?.body) && requestConfig.retryUnsafeMethods !== true) return false;
  if (error?.aborted && !error?.timeout) return false;
  if (error?.timeout || error?.status === 0) return true;

  const statuses = safeArray(requestConfig.retryStatuses).map((status) => number(status, -1));
  if (statuses.length) return statuses.includes(number(error?.status, 0));

  const status = number(error?.status, 0);
  return RETRYABLE_STATUSES.includes(status) || status >= 500;
}

function retryDelayMs(error, attempt, requestConfig = {}) {
  const base = number(requestConfig?.retryDelay ?? requestConfig?.retryDelayMs ?? config?.requestRetryDelayMs ?? config?.api?.retryDelayMs, DEFAULT_RETRY_DELAY_MS);
  const max = number(requestConfig?.retryMaxDelay ?? requestConfig?.retryMaxDelayMs ?? config?.requestRetryMaxDelayMs ?? config?.api?.retryMaxDelayMs, DEFAULT_RETRY_MAX_DELAY_MS);
  const after = retryAfterMs(getHeader(error?.headers, "retry-after"));
  if (after > 0) return Math.min(max, after);

  const backoff = Math.min(max, base * 2 ** attempt);
  const jitter = Math.floor(Math.random() * Math.max(1, base));
  return Math.min(max, backoff + jitter);
}

export async function executeFetchWithRetry(url, fetchFactory, requestConfig = {}, utils = {}) {
  void utils;

  const retries = number(requestConfig?.retries ?? config?.requestRetries ?? config?.api?.retries, DEFAULT_RETRIES);
  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    if (signalAborted(requestConfig.retrySignal)) {
      throw createAbortError({
        signal: requestConfig.retrySignal,
        url,
        method: requestConfig.method,
        attempt,
        attempts: attempt + 1,
        message: "Request aborted before attempt",
      });
    }

    try {
      return await fetchFactory(attempt);
    } catch (error) {
      const normalized = error?.status !== undefined
        ? error
        : buildRequestError({
            url,
            method: requestConfig.method,
            timeout: isProbablyTimeoutError(error),
            aborted: isAbortError(error),
            raw: error?.message || error,
            attempt,
            attempts: attempt + 1,
          });

      normalized.attempt = attempt;
      normalized.attempts = attempt + 1;
      lastError = normalized;

      if (attempt >= retries || !shouldRetryRequest(normalized, requestConfig)) throw normalized;

      const delayMs = retryDelayMs(normalized, attempt, requestConfig);

      try {
        requestConfig?.onRetry?.({
          url,
          redactedUrl: redact(url),
          error: sanitizeError(normalized),
          attempt,
          nextAttempt: attempt + 1,
          retries,
          delayMs,
        });
      } catch {}

      await abortableDelay(delayMs, requestConfig.retrySignal);
      attempt += 1;
    }
  }

  throw lastError || buildRequestError({ url, method: requestConfig.method });
}

/* =========================================================
   HOOKS
========================================================= */

function normalizeHookList(hooks) {
  if (!hooks) return [];
  if (Array.isArray(hooks)) return hooks;
  if (isFn(hooks)) return [hooks];
  if (isPlainObject(hooks)) {
    if (Array.isArray(hooks.handlers)) return hooks.handlers;
    if (Array.isArray(hooks.items)) return hooks.items;
    if (isFn(hooks.handler)) return [hooks];
  }
  return [];
}

function registryHookList(registry, name = "") {
  const hookName = safeText(name, "");
  const source = registry?.hooks;
  if (!hookName || !source) return [];

  if (Array.isArray(source?.[hookName])) return source[hookName];

  if (isFn(source?.get)) {
    try {
      return normalizeHookList(source.get(hookName));
    } catch {}
  }

  return normalizeHookList(source?.[hookName]);
}

async function runHookList(hooks, payload, context = {}) {
  let current = payload;

  for (const item of normalizeHookList(hooks)) {
    const handler = isFn(item) ? item : isFn(item?.handler) ? item.handler : null;
    if (!handler || item?.enabled === false) continue;

    try {
      const result = await handler(current, { ...context, hook: item });
      if (result !== undefined) current = result;
      if (item?.once === true) item.enabled = false;
    } catch (error) {
      debugWarn("Hook request falló.", error);
      if (context?.stopOnHookError === true) throw error;
    }
  }

  return current;
}

async function runNamedHooks({ hooks, registry, name, payload, context } = {}) {
  const hookName = safeText(name, "");
  if (!hookName) return payload;

  try {
    if (isFn(hooks?.runSeries)) {
      const result = await hooks.runSeries(hookName, payload, { context });
      return result === undefined ? payload : result;
    }

    if (isFn(hooks?.run)) {
      const result = await hooks.run(hookName, payload, { context });
      return result === undefined ? payload : result;
    }
  } catch (error) {
    debugWarn(`hooks.${hookName} falló.`, error);
    if (context?.stopOnHookError === true) throw error;
    return payload;
  }

  return runHookList(registryHookList(registry, hookName), payload, context);
}

/* =========================================================
   BODY / URL
========================================================= */

function isFormDataBody(value) {
  try {
    return typeof FormData !== "undefined" && value instanceof FormData;
  } catch {
    return false;
  }
}

function isUrlSearchParamsBody(value) {
  try {
    return typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams;
  } catch {
    return false;
  }
}

function isBlobBody(value) {
  try {
    return typeof Blob !== "undefined" && value instanceof Blob;
  } catch {
    return false;
  }
}

function isArrayBufferBody(value) {
  try {
    return typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer;
  } catch {
    return false;
  }
}

function isReadableStreamBody(value) {
  try {
    return typeof ReadableStream !== "undefined" && value instanceof ReadableStream;
  } catch {
    return false;
  }
}

function serializeBody({ method, body, headers } = {}) {
  if (!bodyAllowed(method)) {
    deleteHeader(headers, "Content-Type");
    return undefined;
  }

  if (body === null || body === undefined) return undefined;

  if (isFormDataBody(body)) {
    deleteHeader(headers, "Content-Type");
    return body;
  }

  if (isUrlSearchParamsBody(body)) {
    if (!hasHeader(headers, "Content-Type")) setHeader(headers, "Content-Type", "application/x-www-form-urlencoded;charset=UTF-8");
    return body;
  }

  if (isBlobBody(body) || isArrayBufferBody(body) || isReadableStreamBody(body)) return body;
  if (typeof body === "string") return body;

  const contentType = safeText(getHeader(headers, "Content-Type"), "").toLowerCase();

  if (isPlainObject(body) || Array.isArray(body)) {
    if (!hasHeader(headers, "Content-Type")) setHeader(headers, "Content-Type", "application/json");
    if (!contentType || contentType.includes("application/json") || contentType.includes("+json")) {
      try {
        return JSON.stringify(body);
      } catch {
        return undefined;
      }
    }
  }

  return body;
}

function fetchInit(options = {}) {
  const init = {
    method: options.method,
    headers: options.headers,
  };

  for (const key of ["body", "credentials", "signal", "cache", "mode", "redirect", "referrerPolicy", "keepalive"]) {
    if (options[key] !== undefined && options[key] !== null) init[key] = options[key];
  }

  return init;
}

function buildRequestUrl(path, query = null) {
  try {
    return buildUrl(path, query);
  } catch {}

  const rawPath = safeText(path, "/");
  if (!query || !isPlainObject(query)) return rawPath;

  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://local.invalid";
    const url = new URL(rawPath, base);

    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, String(value));
      }
    }

    return /^https?:\/\//i.test(rawPath) ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return rawPath;
  }
}

/* =========================================================
   REQUEST META
========================================================= */

function shouldEmitLifecycle(requestConfig = {}, type = "") {
  if (requestConfig.emitEvents === false) return false;
  if (requestConfig.emitLifecycleEvents === true) return true;

  if (type === "start") {
    return requestConfig.emitStartEvent === true || config?.diagnostics?.requestLifecycleEvents === true || config?.debugRequestLifecycle === true;
  }

  if (type === "retry") {
    return requestConfig.emitRetryEvents === true || config?.diagnostics?.requestRetryEvents === true || config?.debugRequestLifecycle === true;
  }

  if (type === "deduped") {
    return requestConfig.emitDedupeEvents === true || config?.diagnostics?.requestDedupeEvents === true || config?.debugRequestLifecycle === true;
  }

  return false;
}

function shouldEmitFinal(requestConfig = {}) {
  return requestConfig.emitEvents !== false && requestConfig.emitFinalEvents !== false;
}

function storeError(setError, error) {
  if (!isFn(setError)) return false;
  const clean = sanitizeError(error);

  try {
    setError(clean);
    return true;
  } catch {}

  try {
    setError({ error: clean });
    return true;
  } catch {}

  return false;
}

function expectedStatus(status, expectedStatuses = []) {
  return safeArray(expectedStatuses)
    .map((item) => number(item, -1))
    .filter((item) => item >= 100 && item <= 599)
    .includes(number(status, 0));
}

function stableStringify(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item, seen)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${key}:${stableStringify(value[key], seen)}`).join("|")}}`;
}

function fingerprint({ method, url, headers, payload, auth, token }) {
  return [
    method,
    url,
    auth ? "auth" : "public",
    auth && token ? hashText(token) : "no-token",
    stableStringify(sanitizeHeaders(headers)),
    stableStringify(sanitizeValue(payload)),
  ].join("::");
}

/* =========================================================
   REQUEST FACTORY
========================================================= */

export function createRequest({ state, events, setError, utils, registry, hooks } = {}) {
  let sequence = 0;

  const inFlight = new Map();
  const inFlightMeta = new Map();
  const controllers = new Map();

  const stats = {
    version: REQUEST_VERSION,
    total: 0,
    success: 0,
    error: 0,
    deduped: 0,
    retry: 0,
    aborted: 0,
    cleared: 0,
    lastRequestAt: 0,
    lastUrl: "",
    lastError: null,
  };

  function authDefault(path = "", opts = {}) {
    if (isPrivateMePath(path)) return true;
    if (opts.public === true || opts.skipAuth === true || opts.auth === false) return false;
    if (opts.auth !== undefined && opts.auth !== null) return Boolean(opts.auth);
    return !isPublicRequestPath(path);
  }

  function baseConfig(path, options = {}) {
    const opts = safeObject(options);
    const auth = authDefault(path, opts);

    return {
      method: DEFAULT_METHOD,
      path,
      headers: {},
      body: opts.body ?? opts.data ?? opts.payload ?? null,

      auth,
      public: auth === false,
      skipAuth: auth === false,

      timeout: number(config?.requestTimeout ?? config?.api?.timeout, DEFAULT_TIMEOUT_MS),
      retries: number(config?.requestRetries ?? config?.api?.retries, DEFAULT_RETRIES),
      retryDelay: config?.requestRetryDelayMs ?? config?.api?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      retryMaxDelay: config?.requestRetryMaxDelayMs ?? config?.api?.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS,
      retryUnsafeMethods: false,
      retryStatuses: [],
      retryMethods: [],

      raw: false,
      responseType: DEFAULT_RESPONSE_TYPE,
      query: opts.query ?? opts.params ?? null,
      params: opts.params ?? null,
      credentials: opts.credentials ?? config?.api?.credentials ?? (config?.api?.withCredentials ? "include" : "same-origin"),
      signal: null,

      dedupe: true,
      dedupeKey: "",
      silent: false,

      emitEvents: true,
      emitFinalEvents: true,
      emitLifecycleEvents: false,
      emitStartEvent: false,
      emitRetryEvents: false,
      emitDedupeEvents: false,
      emitAbortAsError: false,

      storeError: true,
      storeAbortError: false,
      expectedStatuses: [],

      cache: undefined,
      mode: undefined,
      redirect: undefined,
      referrerPolicy: undefined,
      keepalive: undefined,

      ...opts,
    };
  }

  function finalizeConfig(candidate, fallback) {
    const merged = { ...fallback, ...safeObject(candidate, fallback) };

    merged.method = normalizeMethod(merged.method);
    merged.path = safeText(merged.path, fallback.path || "/");
    merged.body = merged.body ?? merged.data ?? merged.payload;
    merged.query = merged.query ?? merged.params ?? null;

    if (isPrivateMePath(merged.path)) {
      merged.auth = true;
      merged.public = false;
      merged.skipAuth = false;
    } else if (merged.public === true || merged.skipAuth === true || merged.auth === false) {
      merged.auth = false;
      merged.public = true;
      merged.skipAuth = true;
    } else {
      merged.auth = merged.auth === undefined || merged.auth === null ? !isPublicRequestPath(merged.path) : Boolean(merged.auth);
      merged.public = merged.auth === false;
      merged.skipAuth = merged.auth === false;
    }

    merged.timeout = number(merged.timeout, DEFAULT_TIMEOUT_MS);
    merged.retries = number(merged.retries, DEFAULT_RETRIES);
    merged.retryDelay = number(merged.retryDelay ?? merged.retryDelayMs, DEFAULT_RETRY_DELAY_MS);
    merged.retryMaxDelay = number(merged.retryMaxDelay ?? merged.retryMaxDelayMs, DEFAULT_RETRY_MAX_DELAY_MS);
    merged.expectedStatuses = safeArray(merged.expectedStatuses);
    merged.retryStatuses = safeArray(merged.retryStatuses);
    merged.retryMethods = safeArray(merged.retryMethods);

    if (isNonReplayableBody(merged.body) && merged.retryUnsafeMethods !== true) merged.retries = 0;
    if (!bodyAllowed(merged.method)) merged.body = undefined;

    return merged;
  }

  function incPending() {
    try {
      if (!state || typeof state !== "object") return;
      state.requestPending = Math.max(0, number(state.requestPending, 0) + 1);
      state.pendingRequests = Math.max(0, number(state.pendingRequests, 0) + 1);
    } catch {}
  }

  function decPending() {
    try {
      if (!state || typeof state !== "object") return;
      state.requestPending = Math.max(0, number(state.requestPending, 0) - 1);
      state.pendingRequests = Math.max(0, number(state.pendingRequests, 0) - 1);
    } catch {}
  }

  async function request(...args) {
    const parsed = normalizeRequestArguments(...args);
    const startedAt = now();
    const requestId = `req_${++sequence}`;

    const base = baseConfig(parsed.path, parsed.options);

    let requestConfig = await runNamedHooks({
      hooks,
      registry,
      name: "beforeRequest",
      payload: base,
      context: { phase: "beforeRequest", requestId, utils },
    });

    requestConfig = finalizeConfig(requestConfig, base);

    const method = requestConfig.method;
    const url = buildRequestUrl(requestConfig.path, requestConfig.query);
    const redactedUrl = redact(url);
    const tokenHeader = config?.auth?.tokenHeader || "Authorization";
    const bearerPrefix = config?.auth?.bearerPrefix || "Bearer";
    const token = normalizeToken(requestConfig.token || stateToken(state));

    const headers = normalizePlainHeaders({
      Accept: "application/json",
      ...headersToObject(config?.api?.headers),
      ...headersToObject(requestConfig.headers),
    });

    if (requestConfig.auth && token && !hasHeader(headers, tokenHeader)) {
      setHeader(headers, tokenHeader, `${bearerPrefix} ${token}`);
    }

    if (!requestConfig.auth) {
      deleteHeader(headers, tokenHeader);
      deleteHeader(headers, "Authorization");
    }

    const payload = serializeBody({ method, body: requestConfig.body, headers });
    const dedupeKey = requestConfig.dedupe !== false && canDedupe(method)
      ? requestConfig.dedupeKey || fingerprint({ method, url, headers, payload, auth: requestConfig.auth, token: requestConfig.auth ? token : "" })
      : null;

    if (dedupeKey && inFlight.has(dedupeKey)) {
      stats.deduped += 1;

      if (shouldEmitLifecycle(requestConfig, "deduped")) {
        emit(events, REQUEST_EVENTS.deduped, {
          requestId,
          url: redactedUrl,
          method,
          auth: Boolean(requestConfig.auth),
        });
      }

      return inFlight.get(dedupeKey);
    }

    stats.total += 1;
    stats.lastRequestAt = startedAt;
    stats.lastUrl = redactedUrl;
    incPending();

    const requestController = createController();
    if (requestController) controllers.set(requestId, requestController);

    const retrySignal = mergeSignals([requestConfig.signal, requestController?.signal]);

    if (shouldEmitLifecycle(requestConfig, "start")) {
      emit(events, REQUEST_EVENTS.start, {
        requestId,
        url: redactedUrl,
        method,
        auth: Boolean(requestConfig.auth),
        headers: sanitizeHeaders(headers),
        at: iso(startedAt),
      });
    }

    const promise = (async () => {
      let attempts = 1;

      try {
        if (state && typeof state === "object") {
          state.lastRequestAt = iso();
          state.lastRequestUrl = redactedUrl;
          state.lastRequestMethod = method;
        }

        const response = await executeFetchWithRetry(
          url,
          async (attempt = 0) => {
            attempts = attempt + 1;

            const timeout = createTimeout(requestConfig.timeout);
            const signal = mergeSignals([timeout.signal, requestConfig.signal, requestController?.signal]);

            try {
              const fetchFn = getFetch();
              if (!fetchFn) throw new Error("Fetch API no disponible.");

              const currentResponse = await fetchFn(url, fetchInit({
                method,
                headers,
                body: payload,
                credentials: requestConfig.credentials,
                signal,
                cache: requestConfig.cache,
                mode: requestConfig.mode,
                redirect: requestConfig.redirect,
                referrerPolicy: requestConfig.referrerPolicy,
                keepalive: requestConfig.keepalive,
              }));

              const allowed = expectedStatus(currentResponse.status, requestConfig.expectedStatuses);

              if (requestConfig.raw !== true && !currentResponse.ok && !allowed) {
                const errorData = await parseResponseBody(currentResponse, DEFAULT_RESPONSE_TYPE);
                throw buildRequestError({ response: currentResponse, data: errorData, url, method, requestId, attempt, attempts });
              }

              return currentResponse;
            } catch (error) {
              if (error?.status !== undefined) throw error;

              const timeoutAborted = Boolean(
                timeout.fired === true ||
                  (timeout.signal?.aborted === true && String(timeout.signal?.reason || "").toLowerCase().includes("timeout"))
              );

              const manualAborted = Boolean(
                requestController?.signal?.aborted === true ||
                  (requestConfig.signal?.aborted === true && !timeoutAborted)
              );

              throw buildRequestError({
                url,
                method,
                timeout: timeoutAborted || isProbablyTimeoutError(error),
                aborted: !timeoutAborted && (manualAborted || isAbortError(error)),
                raw: error?.message || error,
                requestId,
                attempt,
                attempts,
              });
            } finally {
              try {
                timeout.clear?.();
              } catch {}
            }
          },
          {
            ...requestConfig,
            method,
            body: payload,
            retrySignal,
            retryDelay: requestConfig.retryDelay,
            retryMaxDelay: requestConfig.retryMaxDelay,
            onRetry: (meta) => {
              stats.retry += 1;

              if (!shouldEmitLifecycle(requestConfig, "retry")) return;

              emit(events, REQUEST_EVENTS.retry, {
                requestId,
                url: redactedUrl,
                method,
                attempt: meta.attempt,
                nextAttempt: meta.nextAttempt,
                retries: meta.retries,
                delayMs: meta.delayMs,
                status: meta.error?.status || 0,
                message: redact(meta.error?.message || ""),
              });
            },
          },
          utils
        );

        if (state && typeof state === "object") state.lastRequestStatus = response.status || null;

        if (requestConfig.raw === true) {
          stats.success += 1;

          if (shouldEmitFinal(requestConfig)) {
            emit(events, REQUEST_EVENTS.success, {
              requestId,
              url: redactedUrl,
              method,
              status: response.status,
              attempts,
              durationMs: now() - startedAt,
              raw: true,
            });
          }

          return response;
        }

        const data = await parseResponseBody(response, requestConfig.responseType);
        const allowed = expectedStatus(response.status, requestConfig.expectedStatuses);

        if (!response.ok && !allowed) {
          throw buildRequestError({ response, data, url, method, requestId, attempts });
        }

        const finalData = await runNamedHooks({
          hooks,
          registry,
          name: "afterResponse",
          payload: data,
          context: {
            phase: "afterResponse",
            requestId,
            utils,
            response,
            requestConfig: {
              ...requestConfig,
              url: redactedUrl,
              headers: sanitizeHeaders(headers),
            },
          },
        });

        stats.success += 1;

        if (shouldEmitFinal(requestConfig)) {
          emit(events, REQUEST_EVENTS.success, {
            requestId,
            url: redactedUrl,
            method,
            status: response.status,
            attempts,
            durationMs: now() - startedAt,
          });
        }

        return finalData;
      } catch (error) {
        const normalized = error?.status !== undefined
          ? error
          : buildRequestError({
              url,
              method,
              timeout: isProbablyTimeoutError(error),
              aborted: isAbortError(error),
              raw: error?.message || error,
              requestId,
              attempts,
            });

        normalized.requestId = requestId;
        normalized.url = normalized.url || url;
        normalized.redactedUrl = redactedUrl;
        normalized.durationMs = now() - startedAt;
        normalized.attempts = normalized.attempts || attempts;
        normalized.retryable = shouldRetryRequest(normalized, requestConfig);

        if (state && typeof state === "object") state.lastRequestStatus = normalized.status || 0;

        const manualAbort = Boolean(normalized.aborted && !normalized.timeout);
        if (manualAbort) stats.aborted += 1;

        stats.error += 1;
        stats.lastError = sanitizeError({ ...normalized, url: redactedUrl, redactedUrl });

        const silent = requestConfig.silent === true;

        if (!silent && requestConfig.storeError !== false && (!manualAbort || requestConfig.storeAbortError === true)) {
          storeError(setError, normalized);
        }

        if (!silent) {
          await runNamedHooks({
            hooks,
            registry,
            name: "onRequestError",
            payload: normalized,
            context: {
              phase: "onRequestError",
              requestId,
              utils,
              requestConfig: {
                ...requestConfig,
                url: redactedUrl,
                headers: sanitizeHeaders(headers),
              },
            },
          });
        }

        if (!silent && shouldEmitFinal(requestConfig)) {
          if (manualAbort && requestConfig.emitAbortAsError !== true) {
            emit(events, REQUEST_EVENTS.abort, {
              requestId,
              url: redactedUrl,
              method,
              reason: redact(normalized.message || "aborted"),
              durationMs: normalized.durationMs,
              at: iso(),
            });
          } else {
            emit(events, REQUEST_EVENTS.error, sanitizeError({ ...normalized, url: redactedUrl, redactedUrl }));
          }
        }

        throw normalized;
      }
    })();

    if (dedupeKey) {
      inFlight.set(dedupeKey, promise);
      inFlightMeta.set(dedupeKey, {
        requestId,
        url: redactedUrl,
        method,
        auth: Boolean(requestConfig.auth),
        startedAt: iso(startedAt),
      });
    }

    try {
      return await promise;
    } finally {
      decPending();

      if (dedupeKey) {
        inFlight.delete(dedupeKey);
        inFlightMeta.delete(dedupeKey);
      }

      controllers.delete(requestId);
    }
  }

  request.getSnapshot = function getRequestSnapshot(options = {}) {
    const opts = safeObject(options);

    return {
      version: REQUEST_VERSION,
      sequence,
      inFlight: inFlight.size,
      controllers: controllers.size,
      inFlightRequests: opts.includeInFlight === true
        ? Array.from(inFlightMeta.values()).map((item) => sanitizeValue(item))
        : [],
      stats: sanitizeValue(stats),
      state: {
        requestPending: number(state?.requestPending, 0),
        pendingRequests: number(state?.pendingRequests, 0),
      },
      at: iso(),
    };
  };

  request.getDebugSnapshot = request.getSnapshot;
  request.snapshot = request.getSnapshot;

  request.clearInFlight = function clearInFlight(options = {}) {
    const opts = safeObject(options);
    const count = inFlight.size;

    if (opts.abort === true) {
      for (const controller of controllers.values()) {
        try {
          controller.abort(opts.reason || "clearInFlight");
        } catch {}
      }
    }

    inFlight.clear();
    inFlightMeta.clear();
    controllers.clear();

    stats.cleared += count;

    if (opts.emitEvents !== false) {
      emit(events, REQUEST_EVENTS.clearInFlight, {
        count,
        abort: opts.abort === true,
        reason: opts.reason || "clearInFlight",
        at: iso(),
      });
    }

    return count;
  };

  request.abortInFlight = function abortInFlight(reason = "abortInFlight", options = {}) {
    const opts = safeObject(options);
    let count = 0;

    for (const controller of controllers.values()) {
      try {
        controller.abort(reason);
        count += 1;
      } catch {}
    }

    if (opts.emitEvents !== false) {
      emit(events, REQUEST_EVENTS.abort, {
        count,
        reason: redact(reason),
        at: iso(),
      });
    }

    return count;
  };

  return request;
}

/* =========================================================
   API CLIENT
========================================================= */

export function createApiClient(request) {
  function withMethod(method, path, bodyOrOptions = null, maybeOptions = {}) {
    const finalMethod = normalizeMethod(method);

    if (BODYLESS_METHODS.includes(finalMethod)) {
      return request(finalMethod, path, {
        ...safeObject(bodyOrOptions),
        method: finalMethod,
      });
    }

    return request(finalMethod, path, {
      ...safeObject(maybeOptions),
      method: finalMethod,
      body: bodyOrOptions,
    });
  }

  function deleteWithOptionalBody(path, bodyOrOptions = {}, maybeOptions = undefined) {
    if (maybeOptions !== undefined) {
      return request("DELETE", path, {
        ...safeObject(maybeOptions),
        method: "DELETE",
        body: bodyOrOptions,
      });
    }

    if (looksLikeOptionsObject(bodyOrOptions)) {
      return request("DELETE", path, {
        ...safeObject(bodyOrOptions),
        method: "DELETE",
      });
    }

    return request("DELETE", path, {
      method: "DELETE",
      body: bodyOrOptions,
    });
  }

  return {
    get: (path, options = {}) => withMethod("GET", path, options),
    head: (path, options = {}) => withMethod("HEAD", path, options),
    options: (path, options = {}) => withMethod("OPTIONS", path, options),

    post: (path, body = null, options = {}) => withMethod("POST", path, body, options),
    put: (path, body = null, options = {}) => withMethod("PUT", path, body, options),
    patch: (path, body = null, options = {}) => withMethod("PATCH", path, body, options),

    delete: (path, bodyOrOptions = {}, maybeOptions = undefined) => deleteWithOptionalBody(path, bodyOrOptions, maybeOptions),
    del: (path, bodyOrOptions = {}, maybeOptions = undefined) => deleteWithOptionalBody(path, bodyOrOptions, maybeOptions),

    upload(path, formData, options = {}) {
      return request(path, {
        ...options,
        method: options.method || "POST",
        body: formData,
      });
    },

    download(path, options = {}) {
      return request(path, {
        ...options,
        method: options.method || "GET",
        responseType: options.responseType || "blob",
      });
    },

    raw(path, options = {}) {
      return request(path, {
        ...options,
        raw: true,
      });
    },

    request: (arg1, arg2 = {}, arg3 = undefined) => request(arg1, arg2, arg3),

    getSnapshot: (options = {}) => request.getSnapshot?.(options) || null,
    getDebugSnapshot: (options = {}) => request.getDebugSnapshot?.(options) || null,
    snapshot: (options = {}) => request.snapshot?.(options) || request.getSnapshot?.(options) || null,
    clearInFlight: (options = {}) => request.clearInFlight?.(options) || 0,
    abortInFlight: (reason = "abortInFlight", options = {}) => request.abortInFlight?.(reason, options) || 0,
  };
}

export default {
  REQUEST_VERSION,
  REQUEST_EVENTS,
  createRequest,
  createApiClient,
  parseResponseBody,
  buildRequestError,
  shouldRetryRequest,
  executeFetchWithRetry,
};
