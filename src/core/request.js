/* =========================================================
   Onion SPA - Core Request
   Archivo: src/core/request.js

   CORE REQUEST · CLEAN
   - Motor fetch único
   - Retry explícito
   - Timeout real
   - Dedupe sólo GET/HEAD
   - /api/auth/me siempre privado
   - Eventos finales controlados
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

/* =========================================================
   CONSTANTS
========================================================= */

export const REQUEST_VERSION = "18.0.0-clean";

const DEFAULT_METHOD = "GET";
const DEFAULT_RESPONSE_TYPE = "auto";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRIES = 0;
const DEFAULT_RETRY_DELAY_MS = 300;
const DEFAULT_RETRY_MAX_DELAY_MS = 4000;

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

const DEDUPE_METHODS = Object.freeze([
  "GET",
  "HEAD",
]);

const DEFAULT_RETRYABLE_METHODS = Object.freeze([
  "GET",
  "HEAD",
  "OPTIONS",
]);

const RETRYABLE_HTTP_STATUSES = Object.freeze([
  408,
  425,
  429,
  500,
  502,
  503,
  504,
]);

const JSON_CONTENT_TYPES = Object.freeze([
  "application/json",
  "application/problem+json",
  "+json",
]);

const TEXT_CONTENT_TYPES = Object.freeze([
  "text/",
  "application/xml",
  "application/xhtml+xml",
  "application/csv",
  "application/javascript",
  "application/x-javascript",
]);

const BINARY_CONTENT_TYPES = Object.freeze([
  "application/octet-stream",
  "application/pdf",
  "application/zip",
  "image/",
  "audio/",
  "video/",
]);

const OPTION_LIKE_KEYS = Object.freeze([
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
  "timeout",
  "signal",
  "retries",
  "retryDelay",
  "retryDelayMs",
  "retryMaxDelay",
  "retryMaxDelayMs",
  "retryStatuses",
  "retryMethods",
  "retryUnsafeMethods",
  "dedupe",
  "dedupeKey",
  "responseType",
  "raw",
  "silent",
  "emitEvents",
  "emitFinalEvents",
  "emitLifecycleEvents",
  "expectedStatuses",
  "credentials",
  "cache",
  "mode",
  "redirect",
  "referrerPolicy",
  "keepalive",
  "storeError",
]);

const PRIVATE_ME_PATHS = Object.freeze([
  "/me",
  "/api/me",
  "/auth/me",
  "/api/auth/me",
]);

const SENSITIVE_HEADER_RE =
  /authorization|cookie|set-cookie|token|secret|password|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

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

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

function isAnyObject(value) {
  return value !== null && typeof value === "object";
}

function safeText(value, fallback = "") {
  try {
    if (typeof helperSafeText === "function") {
      return helperSafeText(value, fallback);
    }
  } catch {}

  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

function safeObject(value, fallback = {}) {
  try {
    if (typeof helperSafeObject === "function") {
      return helperSafeObject(value, fallback);
    }
  } catch {}

  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  try {
    if (typeof helperSafeArray === "function") {
      return helperSafeArray(value);
    }
  } catch {}

  return Array.isArray(value) ? value : [];
}

function safeClone(value, fallback = null) {
  try {
    if (typeof helperSafeClone === "function") {
      return helperSafeClone(value, fallback);
    }
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

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeBoolean(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const clean = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí", "ok", "on", "enabled"].includes(clean)) {
      return true;
    }

    if (["false", "0", "no", "off", "disabled"].includes(clean)) {
      return false;
    }
  }

  return Boolean(fallback);
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  if (value === null || value === undefined) return [];
  return [value];
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

function getFetch() {
  try {
    if (typeof globalThis !== "undefined" && isFunction(globalThis.fetch)) {
      return globalThis.fetch.bind(globalThis);
    }
  } catch {}

  return null;
}

function normalizeMethod(method = DEFAULT_METHOD) {
  const clean = safeText(method, DEFAULT_METHOD).toUpperCase();
  return KNOWN_METHODS.includes(clean) ? clean : DEFAULT_METHOD;
}

function isKnownMethod(method = "") {
  return KNOWN_METHODS.includes(safeText(method, "").toUpperCase());
}

function isBodyAllowed(method = DEFAULT_METHOD) {
  return !BODYLESS_METHODS.includes(normalizeMethod(method));
}

function canDedupeMethod(method = DEFAULT_METHOD) {
  return DEDUPE_METHODS.includes(normalizeMethod(method));
}

function stripBearer(token = "") {
  return safeText(token, "").replace(/^Bearer\s+/i, "").trim();
}

function tokenIsValid(token = "") {
  const clean = stripBearer(token);

  if (!clean) return false;

  try {
    return Boolean(hasValidToken(clean));
  } catch {
    return Boolean(clean && !/[\s\r\n\t]/.test(clean));
  }
}

function normalizeToken(token = "") {
  const clean = stripBearer(token);
  return tokenIsValid(clean) ? clean : "";
}

function stateToken(state = {}) {
  return normalizeToken(
    state?.token ||
      state?.accessToken ||
      state?.access_token ||
      state?.session?.token ||
      state?.session?.accessToken ||
      state?.session?.access_token ||
      ""
  );
}

function hashText(value = "") {
  const text = safeText(value, "");
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }

  return `h${(hash >>> 0).toString(36)}`;
}

/* =========================================================
   PATH POLICY
========================================================= */

function pathForPolicy(path = "") {
  let value = safeText(path, "");

  if (!value) return "/";

  try {
    const url = new URL(
      value,
      typeof window !== "undefined"
        ? window.location.origin
        : "https://local.invalid"
    );

    value = url.pathname || "/";
  } catch {
    value = value.split("?")[0].split("#")[0] || "/";
  }

  value = `/${value}`
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");

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
   ARGUMENT NORMALIZATION
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

  return {
    path: arg1,
    options: safeObject(arg2),
  };
}

function looksLikeOptionsObject(value = {}) {
  if (!isObject(value)) return false;
  return OPTION_LIKE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

/* =========================================================
   HEADERS
========================================================= */

function headersToObject(headers = {}) {
  const output = {};

  if (!headers) return output;

  try {
    if (typeof Headers !== "undefined" && headers instanceof Headers) {
      headers.forEach((value, key) => {
        output[key] = value;
      });

      return output;
    }
  } catch {}

  try {
    if (isFunction(headers.forEach)) {
      headers.forEach((value, key) => {
        output[key] = value;
      });

      return output;
    }
  } catch {}

  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (Array.isArray(entry) && entry.length >= 2) {
        output[entry[0]] = entry[1];
      }
    }

    return output;
  }

  return isObject(headers) ? { ...headers } : output;
}

function normalizePlainHeaders(headers = {}) {
  const source = headersToObject(headers);

  try {
    return headersToObject(normalizeHeaders(source));
  } catch {
    return source;
  }
}

function getHeader(headers, name = "") {
  const target = safeText(name, "").toLowerCase();
  if (!target) return undefined;

  const source = headersToObject(headers);
  const key = Object.keys(source).find((item) => item.toLowerCase() === target);

  return key ? source[key] : undefined;
}

function hasHeader(headers, name = "") {
  return getHeader(headers, name) !== undefined;
}

function setHeader(headers, name, value) {
  if (!headers || !name || value === undefined || value === null || value === "") {
    return headers;
  }

  const target = safeText(name).toLowerCase();
  const existing = Object.keys(headers).find((item) => item.toLowerCase() === target);

  headers[existing || name] = value;
  return headers;
}

function deleteHeader(headers, name = "") {
  if (!headers || !name) return headers;

  const target = safeText(name).toLowerCase();

  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) delete headers[key];
  }

  return headers;
}

function headerFromObject(headers = {}, name = "") {
  const target = safeText(name, "").toLowerCase();
  if (!target) return "";

  for (const [key, value] of Object.entries(headers || {})) {
    if (safeText(key).toLowerCase() === target) return value;
  }

  return "";
}

function responseHeaders(response = null) {
  const output = {};

  try {
    response?.headers?.forEach?.((value, key) => {
      output[key] = value;
    });
  } catch {}

  return output;
}

function sanitizeHeaders(headers = {}) {
  const output = {};

  for (const [key, value] of Object.entries(headersToObject(headers))) {
    output[key] = SENSITIVE_HEADER_RE.test(key)
      ? "***"
      : redact(String(value));
  }

  return output;
}

/* =========================================================
   SANITIZE
========================================================= */

function sanitizeValue(value, depth = 0, keyHint = "", seen = new WeakSet()) {
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
      message: redact(value.message || "Error"),
      stack: value.stack ? "[stack]" : null,
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1, keyHint, seen));
  }

  if (isAnyObject(value)) {
    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      output[key] = sanitizeValue(item, depth + 1, key, seen);
    }

    return output;
  }

  try {
    return redact(String(value));
  } catch {
    return "[unserializable]";
  }
}

function sanitizeError(error = {}) {
  const output = safeClone(error, {}) || {};

  output.url = redact(output.url || "");
  output.redactedUrl = redact(output.redactedUrl || output.url || "");
  output.message = redact(output.message || "");
  output.statusText = redact(output.statusText || "");
  output.raw = undefined;
  output.stack = output.stack ? "[stack]" : undefined;

  if (output.headers) output.headers = sanitizeHeaders(output.headers);
  if (output.data) output.data = sanitizeValue(output.data);
  if (output.hints) output.hints = sanitizeValue(output.hints);

  return output;
}

function emit(events, eventName, payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  const clean = sanitizeValue(payload);

  try {
    if (isFunction(events?.emit)) {
      events.emit(name, clean);
      return true;
    }
  } catch {}

  try {
    if (isFunction(events?.dispatch)) {
      events.dispatch(name, clean);
      return true;
    }
  } catch {}

  try {
    if (isFunction(events?.trigger)) {
      events.trigger(name, clean);
      return true;
    }
  } catch {}

  return false;
}

function warn(utils, ...args) {
  const clean = args.map((item) => sanitizeValue(item));

  try {
    utils?.warn?.("[Request]", ...clean);
  } catch {}

  try {
    if (config?.debug) console.warn("[Request]", ...clean);
  } catch {}
}

/* =========================================================
   RESPONSE PARSER
========================================================= */

function contentTypeIncludes(contentType = "", fragments = []) {
  const value = safeText(contentType, "").toLowerCase();
  return toArray(fragments).some((fragment) => value.includes(fragment));
}

function responseHasBody(response) {
  if (!response) return false;
  if ([204, 205, 304].includes(response.status)) return false;
  return true;
}

export async function parseResponseBody(response, responseType = DEFAULT_RESPONSE_TYPE) {
  if (!response || !responseHasBody(response)) return null;

  const finalType = safeText(responseType, DEFAULT_RESPONSE_TYPE);
  const contentType = safeText(response.headers?.get?.("content-type"), "").toLowerCase();

  try {
    if (finalType === "response" || finalType === "raw") return response;
    if (finalType === "void" || finalType === "none" || finalType === "empty") return null;

    if (finalType === "blob") {
      return isFunction(response.blob) ? await response.blob() : await response.arrayBuffer();
    }

    if (finalType === "arrayBuffer" || finalType === "arraybuffer") {
      return await response.arrayBuffer();
    }

    if (finalType === "formData" || finalType === "formdata") {
      return isFunction(response.formData) ? await response.formData() : null;
    }

    if (finalType === "text") return await response.text();

    if (finalType === "json") {
      const text = await response.text();
      if (!safeText(text, "")) return null;

      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }

    if (contentTypeIncludes(contentType, JSON_CONTENT_TYPES)) {
      const text = await response.text();
      if (!safeText(text, "")) return null;

      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }

    if (contentType.includes("multipart/form-data") && isFunction(response.formData)) {
      return await response.formData();
    }

    if (contentTypeIncludes(contentType, BINARY_CONTENT_TYPES)) {
      return await response.arrayBuffer();
    }

    if (contentTypeIncludes(contentType, TEXT_CONTENT_TYPES)) {
      return await response.text();
    }

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
  if (!isAnyObject(data)) return safeText(data, "");

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
  const status = safeNumber(response?.status, 0);

  const statusText = safeText(
    response?.statusText,
    timeout
      ? "Request Timeout"
      : aborted
        ? "Request Aborted"
        : status === 0
          ? "Network Error"
          : "HTTP Error"
  );

  const rawMessage =
    typeof raw === "string"
      ? raw
      : raw?.message ||
        raw?.reason ||
        "";

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
  error.attempt = safeNumber(attempt, 0);
  error.attempts = safeNumber(attempts, 0);
  error.at = iso();

  return error;
}

/* =========================================================
   ABORT / RETRY
========================================================= */

function isSignal(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      "aborted" in value &&
      isFunction(value.addEventListener)
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

function abortMessage(reason, fallback = "Request aborted") {
  if (reason instanceof Error) return reason.message || fallback;
  return safeText(reason?.message || reason, fallback);
}

function createAbortRequestError({
  signal = null,
  url = "",
  method = DEFAULT_METHOD,
  requestId = "",
  attempt = 0,
  attempts = 0,
  message = "Request aborted",
} = {}) {
  return buildRequestError({
    url,
    method,
    aborted: true,
    timeout: false,
    raw: abortMessage(signalReason(signal), message),
    requestId,
    attempt,
    attempts,
  });
}

function createAbortControllerSafe() {
  try {
    if (typeof AbortController !== "undefined") return new AbortController();
  } catch {}

  return null;
}

function createTimeout(timeoutMs = 0) {
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

  try {
    if (typeof AbortSignal !== "undefined" && isFunction(AbortSignal.any)) {
      return AbortSignal.any(clean);
    }
  } catch {}

  try {
    if (isFunction(mergeAbortSignals)) return mergeAbortSignals(clean);
  } catch {}

  if (clean.length === 1) return clean[0];

  const controller = createAbortControllerSafe();

  if (!controller) return clean[0] || null;

  const cleanupFns = [];

  const cleanup = () => {
    for (const fn of cleanupFns.splice(0)) {
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
      cleanupFns.push(() => signal.removeEventListener("abort", onAbort));
    } catch {}
  }

  return controller.signal;
}

function abortableDelay(ms = 0, signal = null) {
  const delayMs = Math.max(0, safeNumber(ms, 0));

  if (delayMs <= 0) return Promise.resolve(true);

  if (signalAborted(signal)) {
    return Promise.reject(
      createAbortRequestError({
        signal,
        message: "Request aborted before retry delay",
      })
    );
  }

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
        createAbortRequestError({
          signal,
          message: "Request aborted during retry delay",
        })
      );
    };

    try {
      timer = setTimeout(() => {
        if (settled) return;

        settled = true;
        cleanup();
        resolve(true);
      }, delayMs);

      if (isSignal(signal)) signal.addEventListener("abort", onAbort, { once: true });
    } catch (error) {
      settled = true;
      cleanup();
      reject(error);
    }
  });
}

function retryAfterMs(value = "") {
  const raw = safeText(value, "");
  if (!raw) return 0;

  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const dateMs = Date.parse(raw);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());

  return 0;
}

function normalizeRetryMethods(methods = []) {
  return toArray(methods)
    .flat(Infinity)
    .map(normalizeMethod)
    .filter(Boolean);
}

function isNonReplayableBody(body) {
  try {
    return typeof ReadableStream !== "undefined" && body instanceof ReadableStream;
  } catch {
    return false;
  }
}

function isRetryableMethod(method = DEFAULT_METHOD, requestConfig = {}) {
  const finalMethod = normalizeMethod(method);

  if (requestConfig.retryUnsafeMethods === true) return true;

  const configured = normalizeRetryMethods(
    requestConfig.retryMethods?.length
      ? requestConfig.retryMethods
      : config?.requestRetryMethods || config?.api?.retryMethods
  );

  const methods = configured.length ? configured : DEFAULT_RETRYABLE_METHODS;

  return methods.includes(finalMethod);
}

export function shouldRetryRequest(error, requestConfig = {}) {
  const retries = safeNumber(
    requestConfig?.retries ??
      config?.requestRetries ??
      config?.api?.retries,
    DEFAULT_RETRIES
  );

  if (retries <= 0) return false;

  const method = normalizeMethod(requestConfig?.method);

  if (!isRetryableMethod(method, requestConfig)) return false;

  if (isNonReplayableBody(requestConfig?.body) && requestConfig.retryUnsafeMethods !== true) {
    return false;
  }

  if (error?.aborted && !error?.timeout) return false;
  if (error?.timeout) return true;
  if (error?.status === 0) return true;

  if (safeArray(requestConfig.retryStatuses).length) {
    return safeArray(requestConfig.retryStatuses)
      .map((status) => safeNumber(status, -1))
      .includes(safeNumber(error?.status, 0));
  }

  return (
    RETRYABLE_HTTP_STATUSES.includes(safeNumber(error?.status, 0)) ||
    safeNumber(error?.status, 0) >= 500
  );
}

function retryDelayMs(error, attempt, requestConfig = {}) {
  const baseDelay = safeNumber(
    requestConfig?.retryDelay ??
      requestConfig?.retryDelayMs ??
      config?.requestRetryDelayMs ??
      config?.api?.retryDelayMs,
    DEFAULT_RETRY_DELAY_MS
  );

  const maxDelay = safeNumber(
    requestConfig?.retryMaxDelay ??
      requestConfig?.retryMaxDelayMs ??
      config?.requestRetryMaxDelayMs ??
      config?.api?.retryMaxDelayMs,
    DEFAULT_RETRY_MAX_DELAY_MS
  );

  const afterMs = retryAfterMs(headerFromObject(error?.headers, "retry-after"));

  if (afterMs > 0) return Math.min(maxDelay, afterMs);

  const backoff = Math.min(maxDelay, baseDelay * 2 ** attempt);
  const jitter = Math.floor(Math.random() * Math.max(1, baseDelay));

  return Math.min(maxDelay, backoff + jitter);
}

export async function executeFetchWithRetry(url, fetchFactory, requestConfig = {}, utils = {}) {
  const retries = safeNumber(
    requestConfig?.retries ??
      config?.requestRetries ??
      config?.api?.retries,
    DEFAULT_RETRIES
  );

  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    if (signalAborted(requestConfig.retrySignal)) {
      throw createAbortRequestError({
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
      const normalized =
        error?.status !== undefined
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

      if (attempt >= retries || !shouldRetryRequest(normalized, requestConfig)) {
        throw normalized;
      }

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

      try {
        await abortableDelay(delayMs, requestConfig.retrySignal);
      } catch (delayError) {
        throw delayError?.status !== undefined
          ? delayError
          : createAbortRequestError({
              signal: requestConfig.retrySignal,
              url,
              method: requestConfig.method,
              attempt,
              attempts: attempt + 1,
              message: "Request aborted during retry delay",
            });
      }

      attempt += 1;
    }
  }

  throw (
    lastError ||
    buildRequestError({
      url,
      method: requestConfig.method,
    })
  );
}

/* =========================================================
   HOOKS
========================================================= */

function normalizeHookList(hooks) {
  if (!hooks) return [];
  if (Array.isArray(hooks)) return hooks;
  if (isFunction(hooks)) return [hooks];

  if (isObject(hooks)) {
    if (Array.isArray(hooks.handlers)) return hooks.handlers;
    if (Array.isArray(hooks.items)) return hooks.items;
    if (isFunction(hooks.handler)) return [hooks];
  }

  return [];
}

function registryHooks(registry, name = "") {
  const hookName = safeText(name, "");
  if (!hookName) return [];

  const source = registry?.hooks;

  if (!source) return [];

  if (Array.isArray(source?.[hookName])) return source[hookName];

  if (isFunction(source?.get)) {
    try {
      return normalizeHookList(source.get(hookName));
    } catch {}
  }

  return normalizeHookList(source?.[hookName]);
}

async function runHookList(hooks, payload, context = {}) {
  const list = normalizeHookList(hooks);

  if (!list.length) return payload;

  let current = payload;

  for (const item of list) {
    const handler = isFunction(item)
      ? item
      : isFunction(item?.handler)
        ? item.handler
        : null;

    if (!handler || item?.enabled === false) continue;

    try {
      const result = await handler(current, {
        ...context,
        hook: item,
      });

      if (result !== undefined) current = result;

      if (item?.once === true) {
        try {
          item.enabled = false;
        } catch {}
      }
    } catch (error) {
      warn(context?.utils, "Hook request falló.", error);

      if (context?.stopOnHookError === true) throw error;
    }
  }

  return current;
}

async function runNamedHooks({ hooks, registry, name, payload, context } = {}) {
  const hookName = safeText(name, "");
  if (!hookName) return payload;

  try {
    if (isFunction(hooks?.runSeries)) {
      const result = await hooks.runSeries(hookName, payload, { context });
      return result === undefined ? payload : result;
    }

    if (isFunction(hooks?.run)) {
      const result = await hooks.run(hookName, payload, { context });
      return result === undefined ? payload : result;
    }
  } catch (error) {
    warn(context?.utils, `hooks.${hookName} falló.`, error);

    if (context?.stopOnHookError === true) throw error;

    return payload;
  }

  return runHookList(registryHooks(registry, hookName), payload, context);
}

/* =========================================================
   BODY
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
  if (!isBodyAllowed(method)) {
    deleteHeader(headers, "Content-Type");
    return undefined;
  }

  if (body === null || body === undefined) return undefined;

  if (isFormDataBody(body)) {
    deleteHeader(headers, "Content-Type");
    return body;
  }

  if (isUrlSearchParamsBody(body)) {
    if (!hasHeader(headers, "Content-Type")) {
      setHeader(headers, "Content-Type", "application/x-www-form-urlencoded;charset=UTF-8");
    }

    return body;
  }

  if (isBlobBody(body) || isArrayBufferBody(body) || isReadableStreamBody(body)) {
    return body;
  }

  if (typeof body === "string") return body;

  const contentType = safeText(getHeader(headers, "Content-Type"), "").toLowerCase();

  if (isObject(body) || Array.isArray(body)) {
    if (!hasHeader(headers, "Content-Type")) {
      setHeader(headers, "Content-Type", "application/json");
    }

    if (contentType.includes("application/json") || contentType.includes("+json") || !contentType) {
      try {
        return JSON.stringify(body);
      } catch {
        return undefined;
      }
    }
  }

  return body;
}

function fetchInit({
  method,
  headers,
  body,
  credentials,
  signal,
  cache,
  mode,
  redirect,
  referrerPolicy,
  keepalive,
} = {}) {
  const init = {
    method,
    headers,
  };

  if (body !== undefined) init.body = body;
  if (credentials !== undefined) init.credentials = credentials;
  if (signal) init.signal = signal;
  if (cache !== undefined) init.cache = cache;
  if (mode !== undefined) init.mode = mode;
  if (redirect !== undefined) init.redirect = redirect;
  if (referrerPolicy !== undefined) init.referrerPolicy = referrerPolicy;
  if (keepalive !== undefined) init.keepalive = keepalive;

  return init;
}

/* =========================================================
   URL / EVENTS
========================================================= */

function buildRequestUrl(path, query = null) {
  try {
    return buildUrl(path, query);
  } catch {}

  const rawPath = safeText(path, "/");

  if (!query || !isObject(query)) return rawPath;

  try {
    const url = new URL(
      rawPath,
      typeof window !== "undefined"
        ? window.location.origin
        : "https://local.invalid"
    );

    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;

      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, String(item));
        }
      } else {
        url.searchParams.set(key, String(value));
      }
    }

    return /^https?:\/\//i.test(rawPath)
      ? url.toString()
      : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return rawPath;
  }
}

function shouldEmitLifecycle(requestConfig = {}, type = "") {
  if (requestConfig.emitEvents === false) return false;
  if (requestConfig.emitLifecycleEvents === true) return true;

  if (type === "start") {
    return requestConfig.emitStartEvent === true ||
      config?.diagnostics?.requestLifecycleEvents === true ||
      config?.debugRequestLifecycle === true;
  }

  if (type === "retry") {
    return requestConfig.emitRetryEvents === true ||
      config?.diagnostics?.requestRetryEvents === true ||
      config?.debugRequestLifecycle === true;
  }

  if (type === "deduped") {
    return requestConfig.emitDedupeEvents === true ||
      config?.diagnostics?.requestDedupeEvents === true ||
      config?.debugRequestLifecycle === true;
  }

  return false;
}

function shouldEmitFinal(requestConfig = {}) {
  return requestConfig.emitEvents !== false && requestConfig.emitFinalEvents !== false;
}

function storeError(setError, error) {
  if (!isFunction(setError)) return false;

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

function isExpectedStatus(status, expectedStatuses = []) {
  const list = safeArray(expectedStatuses)
    .map((item) => safeNumber(item, -1))
    .filter((item) => item >= 100 && item <= 599);

  return list.includes(safeNumber(status, 0));
}

/* =========================================================
   REQUEST FACTORY
========================================================= */

export function createRequest({
  state,
  events,
  setError,
  utils,
  registry,
  hooks,
} = {}) {
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

  function stableStringify(value, seen = new WeakSet()) {
    if (value === null || value === undefined) return "";
    if (typeof value !== "object") return String(value);

    if (seen.has(value)) return "[circular]";
    seen.add(value);

    if (Array.isArray(value)) {
      return `[${value.map((item) => stableStringify(item, seen)).join(",")}]`;
    }

    return `{${Object.keys(value)
      .sort()
      .map((key) => `${key}:${stableStringify(value[key], seen)}`)
      .join("|")}}`;
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

  function authDefault(path = "", opts = {}) {
    if (isPrivateMePath(path)) return true;

    if (opts.public === true || opts.skipAuth === true || opts.auth === false) {
      return false;
    }

    if (opts.auth !== undefined && opts.auth !== null) {
      return Boolean(opts.auth);
    }

    return !isPublicRequestPath(path);
  }

  function bodyFromOptions(opts = {}) {
    if (opts.body !== undefined) return opts.body;
    if (opts.data !== undefined) return opts.data;
    if (opts.payload !== undefined) return opts.payload;
    return null;
  }

  function baseConfig(path, options = {}) {
    const opts = safeObject(options);
    const auth = authDefault(path, opts);

    return {
      method: DEFAULT_METHOD,
      headers: {},
      body: bodyFromOptions(opts),

      auth,
      public: auth === false && isPublicRequestPath(path),
      skipAuth: auth === false,

      timeout: safeNumber(
        config?.requestTimeout ??
          config?.api?.timeout,
        DEFAULT_TIMEOUT_MS
      ),

      raw: false,
      responseType: DEFAULT_RESPONSE_TYPE,

      query: opts.query ?? opts.params ?? null,
      params: opts.params ?? null,

      credentials:
        opts.credentials ??
        config?.api?.credentials ??
        (
          config?.api?.withCredentials
            ? "include"
            : "same-origin"
        ),

      signal: null,

      retries: safeNumber(
        config?.requestRetries ??
          config?.api?.retries,
        DEFAULT_RETRIES
      ),

      retryDelay:
        config?.requestRetryDelayMs ??
        config?.api?.retryDelayMs ??
        DEFAULT_RETRY_DELAY_MS,

      retryMaxDelay:
        config?.requestRetryMaxDelayMs ??
        config?.api?.retryMaxDelayMs ??
        DEFAULT_RETRY_MAX_DELAY_MS,

      retryUnsafeMethods: false,
      retryStatuses: [],
      retryMethods: [],

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
      path,
    };
  }

  function finalizeConfig(candidate, fallback) {
    const merged = {
      ...fallback,
      ...safeObject(candidate, fallback),
    };

    merged.method = normalizeMethod(merged.method);
    merged.path = safeText(merged.path, fallback.path);

    if (merged.body === undefined && (merged.data !== undefined || merged.payload !== undefined)) {
      merged.body = merged.data !== undefined ? merged.data : merged.payload;
    }

    merged.query = merged.query ?? merged.params ?? null;

    if (isPrivateMePath(merged.path)) {
      merged.auth = true;
      merged.public = false;
      merged.skipAuth = false;
    } else if (merged.public === true || merged.skipAuth === true || merged.auth === false) {
      merged.auth = false;
      merged.public = true;
      merged.skipAuth = true;
    } else if (merged.auth === undefined || merged.auth === null) {
      merged.auth = !isPublicRequestPath(merged.path);
    } else {
      merged.auth = Boolean(merged.auth);
    }

    merged.timeout = safeNumber(merged.timeout, DEFAULT_TIMEOUT_MS);
    merged.retries = safeNumber(merged.retries, DEFAULT_RETRIES);

    merged.retryDelay = safeNumber(
      merged.retryDelay ?? merged.retryDelayMs,
      DEFAULT_RETRY_DELAY_MS
    );

    merged.retryMaxDelay = safeNumber(
      merged.retryMaxDelay ?? merged.retryMaxDelayMs,
      DEFAULT_RETRY_MAX_DELAY_MS
    );

    merged.expectedStatuses = safeArray(merged.expectedStatuses);
    merged.retryStatuses = safeArray(merged.retryStatuses);
    merged.retryMethods = safeArray(merged.retryMethods);

    if (isNonReplayableBody(merged.body) && merged.retryUnsafeMethods !== true) {
      merged.retries = 0;
    }

    if (!isBodyAllowed(merged.method)) merged.body = undefined;

    return merged;
  }

  function incrementPending() {
    try {
      if (!state || typeof state !== "object") return;

      state.requestPending = Math.max(0, safeNumber(state.requestPending, 0) + 1);
      state.pendingRequests = Math.max(0, safeNumber(state.pendingRequests, 0) + 1);
    } catch {}
  }

  function decrementPending() {
    try {
      if (!state || typeof state !== "object") return;

      state.requestPending = Math.max(0, safeNumber(state.requestPending, 0) - 1);
      state.pendingRequests = Math.max(0, safeNumber(state.pendingRequests, 0) - 1);
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
      context: {
        phase: "beforeRequest",
        requestId,
        utils,
      },
    });

    requestConfig = finalizeConfig(requestConfig, base);

    const method = requestConfig.method;
    const url = buildRequestUrl(requestConfig.path, requestConfig.query);
    const redactedUrl = redact(url);

    const headers = normalizePlainHeaders({
      Accept: "application/json",
      ...safeObject(config?.api?.headers),
      ...safeObject(requestConfig.headers),
    });

    const token = normalizeToken(requestConfig.token || stateToken(state));

    if (requestConfig.auth && token && !hasHeader(headers, "Authorization")) {
      setHeader(
        headers,
        config?.auth?.tokenHeader || "Authorization",
        `${config?.auth?.bearerPrefix || "Bearer"} ${token}`
      );
    }

    if (!requestConfig.auth) {
      deleteHeader(headers, "Authorization");
    }

    const payload = serializeBody({
      method,
      body: requestConfig.body,
      headers,
    });

    const dedupeKey =
      requestConfig.dedupe !== false &&
      canDedupeMethod(method)
        ? requestConfig.dedupeKey ||
          fingerprint({
            method,
            url,
            headers,
            payload,
            auth: requestConfig.auth,
            token: requestConfig.auth ? token : "",
          })
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

    incrementPending();

    const requestController = createAbortControllerSafe();

    if (requestController) {
      controllers.set(requestId, requestController);
    }

    const retrySignal = mergeSignals([
      requestConfig.signal,
      requestController?.signal,
    ]);

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

            const signal = mergeSignals([
              timeout.signal,
              requestConfig.signal,
              requestController?.signal,
            ]);

            try {
              const fetchFn = getFetch();

              if (!fetchFn) throw new Error("Fetch API no disponible.");

              const currentResponse = await fetchFn(
                url,
                fetchInit({
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
                })
              );

              const allowedStatus = isExpectedStatus(
                currentResponse.status,
                requestConfig.expectedStatuses
              );

              if (requestConfig.raw !== true && !currentResponse.ok && !allowedStatus) {
                const errorData = await parseResponseBody(currentResponse, DEFAULT_RESPONSE_TYPE);

                throw buildRequestError({
                  response: currentResponse,
                  data: errorData,
                  url,
                  method,
                  requestId,
                  attempt,
                  attempts,
                });
              }

              return currentResponse;
            } catch (error) {
              if (error?.status !== undefined) throw error;

              const timeoutAborted = Boolean(
                timeout.fired === true ||
                  (
                    timeout.signal?.aborted === true &&
                    String(timeout.signal?.reason || "").toLowerCase().includes("timeout")
                  )
              );

              const manualAborted = Boolean(
                requestController?.signal?.aborted === true ||
                  (
                    requestConfig.signal?.aborted === true &&
                    !timeoutAborted
                  )
              );

              throw buildRequestError({
                url,
                method,
                timeout: timeoutAborted || isProbablyTimeoutError(error),
                aborted:
                  !timeoutAborted &&
                  (
                    manualAborted ||
                    isAbortError(error)
                  ),
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
            onRetry: (retryMeta) => {
              stats.retry += 1;

              if (!shouldEmitLifecycle(requestConfig, "retry")) return;

              emit(events, REQUEST_EVENTS.retry, {
                requestId,
                url: redactedUrl,
                method,
                attempt: retryMeta.attempt,
                nextAttempt: retryMeta.nextAttempt,
                retries: retryMeta.retries,
                delayMs: retryMeta.delayMs,
                status: retryMeta.error?.status || 0,
                message: redact(retryMeta.error?.message || ""),
              });
            },
          },
          utils
        );

        if (state && typeof state === "object") {
          state.lastRequestStatus = response.status || null;
        }

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

        const allowedStatus = isExpectedStatus(
          response.status,
          requestConfig.expectedStatuses
        );

        if (!response.ok && !allowedStatus) {
          throw buildRequestError({
            response,
            data,
            url,
            method,
            requestId,
            attempts,
          });
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
        const normalized =
          error?.status !== undefined
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

        if (state && typeof state === "object") {
          state.lastRequestStatus = normalized.status || 0;
        }

        const manualAbort = Boolean(normalized.aborted && !normalized.timeout);

        if (manualAbort) stats.aborted += 1;

        stats.error += 1;
        stats.lastError = sanitizeError({ ...normalized, url: redactedUrl, redactedUrl });

        const silent = safeBoolean(requestConfig.silent, false);

        if (
          !silent &&
          requestConfig.storeError !== false &&
          (
            !manualAbort ||
            requestConfig.storeAbortError === true
          )
        ) {
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
            emit(
              events,
              REQUEST_EVENTS.error,
              sanitizeError({
                ...normalized,
                url: redactedUrl,
                redactedUrl,
              })
            );
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
      decrementPending();

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

      inFlightRequests:
        opts.includeInFlight === true
          ? Array.from(inFlightMeta.values()).map((item) => sanitizeValue(item))
          : [],

      stats: sanitizeValue(stats),

      state: {
        requestPending: safeNumber(state?.requestPending, 0),
        pendingRequests: safeNumber(state?.pendingRequests, 0),
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
        reason,
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
  function requestWithOverload(arg1, arg2 = {}, arg3 = undefined) {
    return request(arg1, arg2, arg3);
  }

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
    get(path, options = {}) {
      return withMethod("GET", path, options);
    },

    head(path, options = {}) {
      return withMethod("HEAD", path, options);
    },

    options(path, options = {}) {
      return withMethod("OPTIONS", path, options);
    },

    post(path, body = null, options = {}) {
      return withMethod("POST", path, body, options);
    },

    put(path, body = null, options = {}) {
      return withMethod("PUT", path, body, options);
    },

    patch(path, body = null, options = {}) {
      return withMethod("PATCH", path, body, options);
    },

    delete(path, bodyOrOptions = {}, maybeOptions = undefined) {
      return deleteWithOptionalBody(path, bodyOrOptions, maybeOptions);
    },

    del(path, bodyOrOptions = {}, maybeOptions = undefined) {
      return deleteWithOptionalBody(path, bodyOrOptions, maybeOptions);
    },

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

    request: requestWithOverload,

    getSnapshot(options = {}) {
      return request.getSnapshot?.(options) || null;
    },

    getDebugSnapshot(options = {}) {
      return request.getDebugSnapshot?.(options) || null;
    },

    snapshot(options = {}) {
      return request.snapshot?.(options) || request.getSnapshot?.(options) || null;
    },

    clearInFlight(options = {}) {
      return request.clearInFlight?.(options) || 0;
    },

    abortInFlight(reason = "abortInFlight", options = {}) {
      return request.abortInFlight?.(reason, options) || 0;
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

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
