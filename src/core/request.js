/* =========================================================
   Onion SPA - Core Request
   Archivo: src/core/request.js

   CORE REQUEST · API CLIENT · ENTERPRISE HARDENED · 17/10

   Responsabilidades:
   - parsear respuestas HTTP
   - construir errores normalizados
   - decidir reintentos
   - ejecutar fetch con retry real
   - exponer request base y apiClient
   - no duplicar setError / eventos en retries
   - soportar firmas:
       request(path, options)
       request(method, path, options)
       apiClient.post(path, body, options)
       apiClient.request(path, options)
       apiClient.request(method, path, options)

   Candados:
   - eventos finales controlados, lifecycle opt-in
   - timeout real con AbortController
   - timeout separado de abort manual
   - abort manual no contamina setError por defecto
   - merge signals robusto
   - retry delay abortable
   - json/text/blob/arrayBuffer/formData auto
   - dedupe sólo GET/HEAD
   - OPTIONS/GET/HEAD sin body accidental
   - retry HTTP real para 408/425/429/5xx
   - soporte Retry-After
   - protección hooks
   - cleanup total de inflight map
   - abort in-flight opcional
   - errores consistentes
   - eventos sin tokens reales
   - compat con hooks.runSeries y registry.hooks
   - /api/auth/me, /auth/me, /api/me y /me son privados
   - no ReferenceError si fetch/FormData/Blob/Headers/ReadableStream no existen
   - no storm de app:request:start/attempt por defecto
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

export const REQUEST_VERSION = "17.0.0";

const DEFAULT_METHOD = "GET";
const DEFAULT_RESPONSE_TYPE = "auto";

const DEFAULT_TIMEOUT_MS = 30000;

/*
  El config canónico usa 0 por defecto.
  El retry existe, pero debe ser explícito por config/opción.
*/
const DEFAULT_RETRIES = 0;

const DEFAULT_RETRY_DELAY_MS = 300;
const DEFAULT_RETRY_MAX_DELAY_MS = 4000;
const DEFAULT_DEDUPE = true;

const RETRYABLE_HTTP_STATUSES = Object.freeze([
  408,
  425,
  429,
  500,
  502,
  503,
  504,
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

const KNOWN_METHODS = Object.freeze([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
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

const SENSITIVE_HEADER_RE =
  /authorization|cookie|set-cookie|token|secret|password|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

const SENSITIVE_PAYLOAD_KEY_RE =
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

  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
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

function safeArray(value) {
  try {
    if (typeof helperSafeArray === "function") {
      return helperSafeArray(value);
    }
  } catch {}

  return Array.isArray(value) ? value : [];
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value instanceof Set) {
    return Array.from(value);
  }

  if (value === null || value === undefined) {
    return [];
  }

  return [value];
}

function safeObject(value, fallback = {}) {
  try {
    if (typeof helperSafeObject === "function") {
      return helperSafeObject(value, fallback);
    }
  } catch {}

  return isObject(value) ? value : fallback;
}

function safeClone(value, fallback = null) {
  try {
    if (typeof helperSafeClone === "function") {
      return helperSafeClone(value, fallback);
    }
  } catch {}

  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = safeNow()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeRedact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "");
  }
}

function safeWarn(utils, ...args) {
  try {
    utils?.warn?.("[Request]", ...args.map((item) => sanitizeValueForEvent(item)));
  } catch {}

  try {
    if (config?.debug) {
      console.warn("[Request]", ...args.map((item) => sanitizeValueForEvent(item)));
    }
  } catch {}
}

function safeEmit(events, eventName, payload = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  const cleanPayload = sanitizeValueForEvent(payload);

  try {
    if (isFunction(events?.emit)) {
      events.emit(name, cleanPayload);
      return true;
    }
  } catch {}

  try {
    if (isFunction(events?.dispatch)) {
      events.dispatch(name, cleanPayload);
      return true;
    }
  } catch {}

  try {
    if (isFunction(events?.trigger)) {
      events.trigger(name, cleanPayload);
      return true;
    }
  } catch {}

  return false;
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

function isKnownMethod(value = "") {
  return KNOWN_METHODS.includes(safeText(value, "").toUpperCase());
}

function isBodyAllowed(method = DEFAULT_METHOD) {
  return !BODYLESS_METHODS.includes(normalizeMethod(method));
}

function canDedupeMethod(method = DEFAULT_METHOD) {
  return DEDUPE_METHODS.includes(normalizeMethod(method));
}

function getConfiguredTimeout() {
  return safeNumber(
    config?.requestTimeout ??
      config?.api?.timeout ??
      DEFAULT_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  );
}

function getConfiguredRetries() {
  return safeNumber(
    config?.requestRetries ??
      config?.api?.retries ??
      DEFAULT_RETRIES,
    DEFAULT_RETRIES
  );
}

function stripBearerPrefix(token = "") {
  return safeText(token, "").replace(/^Bearer\s+/i, "").trim();
}

function safeHasValidToken(token = "") {
  const clean = stripBearerPrefix(token);

  try {
    return Boolean(hasValidToken(clean));
  } catch {
    return Boolean(clean);
  }
}

function normalizeToken(token = "") {
  const clean = stripBearerPrefix(token);
  return safeHasValidToken(clean) ? clean : "";
}

function getStateToken(state = {}) {
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

function normalizePathForPolicy(path = "") {
  let value = safeText(path, "");

  if (!value) {
    return "/";
  }

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

  if (!value) {
    return "/";
  }

  return value.toLowerCase();
}

function isPrivateAuthMePath(path = "") {
  const normalized = normalizePathForPolicy(path);

  return [
    "/me",
    "/api/me",
    "/auth/me",
    "/api/auth/me",
  ].includes(normalized);
}

function isPublicPathForRequest(path = "") {
  if (isPrivateAuthMePath(path)) {
    return false;
  }

  try {
    return Boolean(isPublicApiPath(path));
  } catch {
    return false;
  }
}

/* =========================================================
   ARGUMENTS
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

/* =========================================================
   HEADERS
========================================================= */

function headersToPlainObject(headers = {}) {
  const output = {};

  if (!headers) {
    return output;
  }

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

  if (isObject(headers)) {
    return { ...headers };
  }

  return output;
}

function normalizePlainHeaders(headers = {}) {
  const source = headersToPlainObject(headers);

  try {
    const normalized = normalizeHeaders(source);
    return headersToPlainObject(normalized);
  } catch {
    return source;
  }
}

function getHeader(headers, name) {
  const target = safeText(name).toLowerCase();

  if (!target) {
    return undefined;
  }

  const source = headersToPlainObject(headers);
  const key = Object.keys(source).find((item) => safeText(item).toLowerCase() === target);

  return key ? source[key] : undefined;
}

function hasHeader(headers, name) {
  return getHeader(headers, name) !== undefined;
}

function setHeader(headers, name, value) {
  if (!headers || !name || value === undefined || value === null || value === "") {
    return headers;
  }

  const target = safeText(name).toLowerCase();
  const existingKey = Object.keys(headers).find((item) => safeText(item).toLowerCase() === target);

  headers[existingKey || name] = value;

  return headers;
}

function deleteHeader(headers, name) {
  if (!headers || !name) {
    return headers;
  }

  const target = safeText(name).toLowerCase();

  for (const key of Object.keys(headers)) {
    if (safeText(key).toLowerCase() === target) {
      delete headers[key];
    }
  }

  return headers;
}

function sanitizeHeadersForLog(headers = {}) {
  const output = {};

  for (const [key, value] of Object.entries(headersToPlainObject(headers))) {
    const lower = safeText(key).toLowerCase();

    output[key] = SENSITIVE_HEADER_RE.test(lower)
      ? "***"
      : safeRedact(String(value));
  }

  return output;
}

function readResponseHeaders(response = null) {
  const output = {};

  try {
    response?.headers?.forEach?.((value, key) => {
      output[key] = value;
    });
  } catch {}

  return output;
}

function getHeaderFromObject(headers = {}, name = "") {
  const target = safeText(name, "").toLowerCase();

  if (!target) {
    return "";
  }

  for (const [key, value] of Object.entries(headers || {})) {
    if (safeText(key, "").toLowerCase() === target) {
      return value;
    }
  }

  return "";
}

/* =========================================================
   STATUS / CONTENT
========================================================= */

function isExpectedStatus(status, expectedStatuses) {
  const list = safeArray(expectedStatuses)
    .map((item) => safeNumber(item, -1))
    .filter((item) => item >= 100 && item <= 599);

  return list.includes(safeNumber(status, 0));
}

function contentTypeIncludes(contentType = "", fragments = []) {
  const value = safeText(contentType, "").toLowerCase();

  return toArray(fragments).some((fragment) => value.includes(fragment));
}

function responseHasBody(response) {
  if (!response) {
    return false;
  }

  if (response.status === 204 || response.status === 205 || response.status === 304) {
    return false;
  }

  return true;
}

/* =========================================================
   RESPONSE PARSER
========================================================= */

export async function parseResponseBody(response, responseType = DEFAULT_RESPONSE_TYPE) {
  if (!response || !responseHasBody(response)) {
    return null;
  }

  const finalType = safeText(responseType, DEFAULT_RESPONSE_TYPE);
  const contentType = safeText(response.headers?.get?.("content-type"), "").toLowerCase();

  try {
    if (finalType === "response" || finalType === "raw") {
      return response;
    }

    if (finalType === "void" || finalType === "none" || finalType === "empty") {
      return null;
    }

    if (finalType === "blob") {
      return isFunction(response.blob)
        ? await response.blob()
        : await response.arrayBuffer();
    }

    if (finalType === "arrayBuffer" || finalType === "arraybuffer") {
      return await response.arrayBuffer();
    }

    if (finalType === "formData" || finalType === "formdata") {
      return isFunction(response.formData) ? await response.formData() : null;
    }

    if (finalType === "text") {
      return await response.text();
    }

    if (finalType === "json") {
      const text = await response.text();

      if (!safeText(text, "")) {
        return null;
      }

      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }

    if (contentTypeIncludes(contentType, JSON_CONTENT_TYPES)) {
      const text = await response.text();

      if (!safeText(text, "")) {
        return null;
      }

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
   EVENT / ERROR SANITIZE
========================================================= */

function extractDataMessage(data = null) {
  if (!data) {
    return "";
  }

  if (typeof data === "string") {
    return data;
  }

  if (!isAnyObject(data)) {
    return safeText(data, "");
  }

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

function sanitizeValueForEvent(value, depth = 0, keyHint = "") {
  if (SENSITIVE_PAYLOAD_KEY_RE.test(safeText(keyHint, ""))) {
    return value ? "***" : null;
  }

  if (depth > 4) {
    return "[depth-limit]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return safeRedact(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "function") {
    return "[function]";
  }

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: safeRedact(value.message || "Error"),
      stack: value.stack ? "[stack]" : null,
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) => sanitizeValueForEvent(item, depth + 1, keyHint));
  }

  if (isAnyObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      output[key] = SENSITIVE_PAYLOAD_KEY_RE.test(key)
        ? item ? "***" : null
        : sanitizeValueForEvent(item, depth + 1, key);
    }

    return output;
  }

  try {
    return safeRedact(String(value));
  } catch {
    return "[unserializable]";
  }
}

function sanitizeErrorForEvent(error = {}) {
  const output = safeClone(error, {}) || {};

  output.url = safeRedact(output.url || "");
  output.redactedUrl = safeRedact(output.redactedUrl || output.url || "");
  output.message = safeRedact(output.message || "");
  output.statusText = safeRedact(output.statusText || "");

  output.raw = undefined;
  output.stack = output.stack ? "[stack]" : undefined;

  if (output.headers) {
    output.headers = sanitizeHeadersForLog(output.headers);
  }

  if (output.data) {
    output.data = sanitizeValueForEvent(output.data);
  }

  if (output.hints) {
    output.hints = sanitizeValueForEvent(output.hints);
  }

  return output;
}

/* =========================================================
   ERROR FACTORY
========================================================= */

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

  const dataMessage = extractDataMessage(data);

  const rawMessage =
    typeof raw === "string"
      ? raw
      : raw?.message ||
        raw?.reason ||
        "";

  const message = safeText(dataMessage || rawMessage, statusText);
  const finalMethod = normalizeMethod(method);

  const error = new Error(safeRedact(message));

  error.name = "RequestError";
  error.ok = false;
  error.status = status;
  error.statusText = safeRedact(statusText);
  error.url = url;
  error.redactedUrl = safeRedact(url);
  error.method = finalMethod;
  error.timeout = timeout === true;
  error.aborted = timeout === true ? false : aborted === true;
  error.raw = raw;
  error.data = data;
  error.headers = readResponseHeaders(response);
  error.hints = status === 0 ? detectNetworkHints(url) : null;
  error.requestId = safeText(requestId, "");
  error.attempt = safeNumber(attempt, 0);
  error.attempts = safeNumber(attempts, 0);
  error.at = safeIsoDate();

  return error;
}

/* =========================================================
   ABORT / DELAY
========================================================= */

function isSignal(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      "aborted" in value &&
      isFunction(value.addEventListener)
  );
}

function isSignalAborted(signal) {
  try {
    return Boolean(signal?.aborted);
  } catch {
    return false;
  }
}

function getSignalReason(signal) {
  try {
    return signal?.reason || null;
  } catch {
    return null;
  }
}

function abortReasonToMessage(reason, fallback = "Request aborted") {
  if (reason instanceof Error) {
    return reason.message || fallback;
  }

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
    raw: abortReasonToMessage(getSignalReason(signal), message),
    requestId,
    attempt,
    attempts,
  });
}

function abortableDelay(ms = 0, signal = null) {
  const delayMs = Math.max(0, safeNumber(ms, 0));

  if (delayMs <= 0) {
    return Promise.resolve(true);
  }

  if (isSignalAborted(signal)) {
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
        if (timer) {
          clearTimeout(timer);
        }
      } catch {}

      try {
        signal?.removeEventListener?.("abort", onAbort);
      } catch {}

      timer = null;
    };

    const onAbort = () => {
      if (settled) {
        return;
      }

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
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve(true);
      }, delayMs);

      if (isSignal(signal)) {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    } catch (error) {
      settled = true;
      cleanup();
      reject(error);
    }
  });
}

/* =========================================================
   RETRY POLICY
========================================================= */

function parseRetryAfterMs(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return 0;
  }

  const seconds = Number(raw);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const dateMs = Date.parse(raw);

  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return 0;
}

function normalizeRetryMethods(methods = []) {
  return toArray(methods)
    .flat(Infinity)
    .map(normalizeMethod)
    .filter(Boolean);
}

function isRetryableMethod(method = DEFAULT_METHOD, requestConfig = {}) {
  const finalMethod = normalizeMethod(method);

  if (requestConfig.retryUnsafeMethods === true) {
    return true;
  }

  const configuredMethods =
    normalizeRetryMethods(requestConfig.retryMethods).length
      ? normalizeRetryMethods(requestConfig.retryMethods)
      : normalizeRetryMethods(config?.requestRetryMethods || config?.api?.retryMethods);

  const methods = configuredMethods.length
    ? configuredMethods
    : DEFAULT_RETRYABLE_METHODS;

  return methods.includes(finalMethod);
}

function isNonReplayableBody(body) {
  try {
    return typeof ReadableStream !== "undefined" && body instanceof ReadableStream;
  } catch {
    return false;
  }
}

export function shouldRetryRequest(error, requestConfig = {}) {
  const retries = safeNumber(
    requestConfig?.retries ??
      config?.requestRetries ??
      config?.api?.retries,
    0
  );

  if (retries <= 0) {
    return false;
  }

  const method = normalizeMethod(requestConfig?.method);

  if (!isRetryableMethod(method, requestConfig)) {
    return false;
  }

  if (isNonReplayableBody(requestConfig?.body) && requestConfig.retryUnsafeMethods !== true) {
    return false;
  }

  if (error?.aborted && !error?.timeout) {
    return false;
  }

  if (error?.timeout) {
    return true;
  }

  if (error?.status === 0) {
    return true;
  }

  if (safeArray(requestConfig.retryStatuses).length) {
    return safeArray(requestConfig.retryStatuses)
      .map((status) => safeNumber(status, -1))
      .includes(safeNumber(error?.status, 0));
  }

  return RETRYABLE_HTTP_STATUSES.some((status) => {
    if (status === 500) {
      return error?.status >= 500;
    }

    return error?.status === status;
  });
}

function computeRetryDelayMs(error, attempt, requestConfig = {}) {
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

  const retryAfterMs = parseRetryAfterMs(
    getHeaderFromObject(error?.headers, "retry-after")
  );

  if (retryAfterMs > 0) {
    return Math.min(maxDelay, retryAfterMs);
  }

  const backoff = Math.min(maxDelay, baseDelay * 2 ** attempt);
  const jitter = Math.floor(Math.random() * Math.max(1, baseDelay));

  return Math.min(maxDelay, backoff + jitter);
}

/* =========================================================
   FETCH WITH RETRY
========================================================= */

export async function executeFetchWithRetry(url, fetchFactory, requestConfig = {}, utils = {}) {
  const retries = safeNumber(
    requestConfig?.retries ??
      config?.requestRetries ??
      config?.api?.retries,
    0
  );

  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    if (isSignalAborted(requestConfig.retrySignal)) {
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

      const retry = shouldRetryRequest(normalized, requestConfig);

      if (attempt >= retries || !retry) {
        throw normalized;
      }

      const delayMs = computeRetryDelayMs(normalized, attempt, requestConfig);

      try {
        requestConfig?.onRetry?.({
          url,
          redactedUrl: safeRedact(url),
          error: sanitizeErrorForEvent(normalized),
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
  if (!hooks) {
    return [];
  }

  if (Array.isArray(hooks)) {
    return hooks;
  }

  if (isFunction(hooks)) {
    return [hooks];
  }

  if (isObject(hooks)) {
    if (Array.isArray(hooks.handlers)) {
      return hooks.handlers;
    }

    if (Array.isArray(hooks.items)) {
      return hooks.items;
    }

    if (isFunction(hooks.handler)) {
      return [hooks];
    }
  }

  return [];
}

function getRegistryHookList(registry, name = "") {
  const hookName = safeText(name, "");

  if (!hookName) {
    return [];
  }

  const registryHooks = registry?.hooks;

  if (!registryHooks) {
    return [];
  }

  if (Array.isArray(registryHooks?.[hookName])) {
    return registryHooks[hookName];
  }

  if (isFunction(registryHooks?.get)) {
    try {
      return normalizeHookList(registryHooks.get(hookName));
    } catch {}
  }

  return normalizeHookList(registryHooks?.[hookName]);
}

async function safeRunHooks(hooks, payload, context = {}) {
  const list = normalizeHookList(hooks);

  if (!list.length) {
    return payload;
  }

  let current = payload;

  for (const item of list) {
    const handler = isFunction(item)
      ? item
      : isFunction(item?.handler)
        ? item.handler
        : null;

    if (!handler || item?.enabled === false) {
      continue;
    }

    try {
      const result = await handler(current, {
        ...context,
        hook: item,
      });

      if (result !== undefined) {
        current = result;
      }

      if (item?.once === true) {
        try {
          item.enabled = false;
        } catch {}
      }
    } catch (error) {
      safeWarn(context?.utils, "Hook request falló.", error);

      if (context?.stopOnHookError === true) {
        throw error;
      }
    }
  }

  return current;
}

async function safeRunNamedHooks({
  hooks,
  registry,
  name,
  payload,
  context,
} = {}) {
  const hookName = safeText(name, "");

  if (!hookName) {
    return payload;
  }

  try {
    if (isFunction(hooks?.runSeries)) {
      const result = await hooks.runSeries(hookName, payload, {
        context: safeObject(context),
      });

      return result === undefined ? payload : result;
    }

    if (isFunction(hooks?.run)) {
      const result = await hooks.run(hookName, payload, {
        context: safeObject(context),
      });

      return result === undefined ? payload : result;
    }
  } catch (error) {
    safeWarn(context?.utils, `hooks.${hookName} falló.`, error);

    if (context?.stopOnHookError === true) {
      throw error;
    }

    return payload;
  }

  return safeRunHooks(
    getRegistryHookList(registry, hookName),
    payload,
    context
  );
}

/* =========================================================
   BODY SERIALIZATION
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

function serializeBody({
  method,
  body,
  headers,
} = {}) {
  if (!isBodyAllowed(method)) {
    deleteHeader(headers, "Content-Type");
    return undefined;
  }

  if (body === null || body === undefined) {
    return undefined;
  }

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

  if (typeof body === "string") {
    return body;
  }

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

/* =========================================================
   ABORT / FETCH INIT
========================================================= */

function createAbortControllerSafe() {
  try {
    if (typeof AbortController !== "undefined") {
      return new AbortController();
    }
  } catch {}

  return null;
}

function createTimeoutSafe(timeoutMs = 0) {
  const controller = createAbortControllerSafe();

  const timeoutState = {
    controller,
    signal: controller?.signal || null,
    timeoutId: null,
    fired: false,
    clear() {
      if (this.timeoutId) {
        try {
          clearTimeout(this.timeoutId);
        } catch {}
      }

      this.timeoutId = null;
    },
  };

  if (!controller || !timeoutMs || timeoutMs <= 0) {
    return timeoutState;
  }

  try {
    timeoutState.timeoutId = setTimeout(() => {
      timeoutState.fired = true;

      try {
        controller.abort("timeout");
      } catch {
        try {
          controller.abort();
        } catch {}
      }
    }, timeoutMs);
  } catch {}

  return timeoutState;
}

function mergeSignalsSafe(signals = []) {
  const cleanSignals = safeArray(signals).filter(isSignal);

  if (!cleanSignals.length) {
    return null;
  }

  try {
    if (typeof AbortSignal !== "undefined" && isFunction(AbortSignal.any)) {
      return AbortSignal.any(cleanSignals);
    }
  } catch {}

  try {
    if (isFunction(mergeAbortSignals)) {
      return mergeAbortSignals(cleanSignals);
    }
  } catch {}

  if (cleanSignals.length === 1) {
    return cleanSignals[0];
  }

  const controller = createAbortControllerSafe();

  if (!controller) {
    return cleanSignals[0] || null;
  }

  const cleanupFns = [];

  const cleanup = () => {
    for (const fn of cleanupFns.splice(0)) {
      try {
        fn();
      } catch {}
    }
  };

  const abortFrom = (signal) => {
    if (controller.signal.aborted) {
      return;
    }

    try {
      controller.abort(getSignalReason(signal) || "aborted");
    } catch {
      try {
        controller.abort();
      } catch {}
    } finally {
      cleanup();
    }
  };

  for (const signal of cleanSignals) {
    if (signal?.aborted) {
      abortFrom(signal);
      return controller.signal;
    }

    const onAbort = () => abortFrom(signal);

    try {
      signal.addEventListener("abort", onAbort, { once: true });

      cleanupFns.push(() => {
        signal.removeEventListener("abort", onAbort);
      });
    } catch {}
  }

  return controller.signal;
}

function buildFetchInit({
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
   URL / EVENTS POLICY
========================================================= */

function buildRequestUrl(path, query = null) {
  try {
    return buildUrl(path, query);
  } catch {}

  const rawPath = safeText(path, "/");

  if (!query || !isObject(query)) {
    return rawPath;
  }

  try {
    const url = new URL(
      rawPath,
      typeof window !== "undefined"
        ? window.location.origin
        : "https://local.invalid"
    );

    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) {
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, String(item));
        }
      } else {
        url.searchParams.set(key, String(value));
      }
    }

    if (/^https?:\/\//i.test(rawPath)) {
      return url.toString();
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return rawPath;
  }
}

function shouldEmitLifecycleEvent(requestConfig = {}, eventType = "") {
  if (requestConfig.emitEvents === false) {
    return false;
  }

  if (requestConfig.emitLifecycleEvents === true) {
    return true;
  }

  if (eventType === "start") {
    return requestConfig.emitStartEvent === true ||
      config?.diagnostics?.requestLifecycleEvents === true ||
      config?.debugRequestLifecycle === true;
  }

  if (eventType === "retry") {
    return requestConfig.emitRetryEvents === true ||
      config?.diagnostics?.requestRetryEvents === true ||
      config?.debugRequestLifecycle === true;
  }

  if (eventType === "deduped") {
    return requestConfig.emitDedupeEvents === true ||
      config?.diagnostics?.requestDedupeEvents === true ||
      config?.debugRequestLifecycle === true;
  }

  return false;
}

function shouldEmitFinalEvent(requestConfig = {}) {
  return requestConfig.emitEvents !== false &&
    requestConfig.emitFinalEvents !== false;
}

function looksLikeOptionsObject(value = {}) {
  if (!isObject(value)) {
    return false;
  }

  return OPTION_LIKE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function safeStoreError(setError, error) {
  if (!isFunction(setError)) {
    return false;
  }

  const cleanError = sanitizeErrorForEvent(error);

  try {
    setError(cleanError);
    return true;
  } catch {}

  try {
    setError({ error: cleanError });
    return true;
  } catch {}

  return false;
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
  let requestSequence = 0;

  const inFlightRequests = new Map();
  const inFlightMeta = new Map();
  const inFlightControllers = new Map();

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
    if (value === null || value === undefined) {
      return "";
    }

    if (typeof value !== "object") {
      return String(value);
    }

    if (seen.has(value)) {
      return "[circular]";
    }

    seen.add(value);

    if (Array.isArray(value)) {
      return `[${value.map((item) => stableStringify(item, seen)).join(",")}]`;
    }

    return `{${Object.keys(value)
      .sort()
      .map((key) => `${key}:${stableStringify(value[key], seen)}`)
      .join("|")}}`;
  }

  function buildFingerprint({
    method,
    url,
    headers,
    payload,
    auth,
    token,
  }) {
    return [
      method,
      url,
      auth ? "auth" : "public",
      auth && token ? hashText(token) : "no-token",
      stableStringify(sanitizeHeadersForLog(headers)),
      stableStringify(sanitizeValueForEvent(payload)),
    ].join("::");
  }

  function resolveAuthDefault(path = "", opts = {}) {
    if (isPrivateAuthMePath(path)) {
      return true;
    }

    if (opts.public === true || opts.skipAuth === true || opts.auth === false) {
      return false;
    }

    if (opts.auth !== undefined && opts.auth !== null) {
      return Boolean(opts.auth);
    }

    return !isPublicPathForRequest(path);
  }

  function resolveBodyFromOptions(opts = {}) {
    if (opts.body !== undefined) return opts.body;
    if (opts.data !== undefined) return opts.data;
    if (opts.payload !== undefined) return opts.payload;

    return null;
  }

  function buildBaseConfig(path, options = {}) {
    const opts = safeObject(options);
    const authDefault = resolveAuthDefault(path, opts);

    return {
      method: DEFAULT_METHOD,
      headers: {},
      body: resolveBodyFromOptions(opts),

      auth: authDefault,
      public: authDefault === false && isPublicPathForRequest(path),
      skipAuth: authDefault === false,

      timeout: getConfiguredTimeout(),

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

      retries: getConfiguredRetries(),
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

      dedupe: DEFAULT_DEDUPE,
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

  function normalizeFinalRequestConfig(requestConfig, baseConfig) {
    const merged = {
      ...baseConfig,
      ...safeObject(requestConfig, baseConfig),
    };

    merged.method = normalizeMethod(merged.method);
    merged.path = safeText(merged.path, baseConfig.path);

    if (merged.body === undefined && (merged.data !== undefined || merged.payload !== undefined)) {
      merged.body = merged.data !== undefined ? merged.data : merged.payload;
    }

    merged.query = merged.query ?? merged.params ?? null;

    if (isPrivateAuthMePath(merged.path)) {
      merged.auth = true;
      merged.public = false;
      merged.skipAuth = false;
    } else if (merged.public === true || merged.skipAuth === true || merged.auth === false) {
      merged.auth = false;
      merged.skipAuth = true;
    } else if (merged.auth === undefined || merged.auth === null) {
      merged.auth = !isPublicPathForRequest(merged.path);
    } else {
      merged.auth = Boolean(merged.auth);
    }

    if (merged.auth === false) {
      merged.public = merged.public === true || isPublicPathForRequest(merged.path);
    }

    merged.timeout = safeNumber(merged.timeout, getConfiguredTimeout());
    merged.retries = safeNumber(merged.retries, getConfiguredRetries());

    merged.retryDelay = safeNumber(
      merged.retryDelay ?? merged.retryDelayMs,
      config?.requestRetryDelayMs ??
        config?.api?.retryDelayMs ??
        DEFAULT_RETRY_DELAY_MS
    );

    merged.retryMaxDelay = safeNumber(
      merged.retryMaxDelay ?? merged.retryMaxDelayMs,
      config?.requestRetryMaxDelayMs ??
        config?.api?.retryMaxDelayMs ??
        DEFAULT_RETRY_MAX_DELAY_MS
    );

    merged.expectedStatuses = safeArray(merged.expectedStatuses);
    merged.retryStatuses = safeArray(merged.retryStatuses);
    merged.retryMethods = safeArray(merged.retryMethods);

    if (isNonReplayableBody(merged.body) && merged.retryUnsafeMethods !== true) {
      merged.retries = 0;
    }

    if (!isBodyAllowed(merged.method)) {
      merged.body = undefined;
    }

    return merged;
  }

  function incrementPending() {
    try {
      if (state && typeof state === "object") {
        state.requestPending = Math.max(0, safeNumber(state.requestPending, 0) + 1);
        state.pendingRequests = Math.max(0, safeNumber(state.pendingRequests, 0) + 1);
      }
    } catch {}
  }

  function decrementPending() {
    try {
      if (state && typeof state === "object") {
        state.requestPending = Math.max(0, safeNumber(state.requestPending, 0) - 1);
        state.pendingRequests = Math.max(0, safeNumber(state.pendingRequests, 0) - 1);
      }
    } catch {}
  }

  async function request(...args) {
    const normalizedArgs = normalizeRequestArguments(...args);
    const path = normalizedArgs.path;
    const options = normalizedArgs.options;

    const startedAt = safeNow();
    const requestId = `req_${++requestSequence}`;

    const baseConfig = buildBaseConfig(path, options);

    let requestConfig = await safeRunNamedHooks({
      hooks,
      registry,
      name: "beforeRequest",
      payload: baseConfig,
      context: {
        phase: "beforeRequest",
        requestId,
        utils,
      },
    });

    requestConfig = normalizeFinalRequestConfig(requestConfig, baseConfig);

    const method = requestConfig.method;
    const url = buildRequestUrl(requestConfig.path, requestConfig.query);
    const redactedUrl = safeRedact(url);

    const finalHeaders = normalizePlainHeaders({
      Accept: "application/json",
      ...safeObject(config?.api?.headers),
      ...safeObject(requestConfig.headers),
    });

    const token = normalizeToken(requestConfig.token || getStateToken(state));

    if (requestConfig.auth && token && !hasHeader(finalHeaders, "Authorization")) {
      setHeader(
        finalHeaders,
        config?.auth?.tokenHeader || "Authorization",
        `${config?.auth?.bearerPrefix || "Bearer"} ${token}`
      );
    }

    if (!requestConfig.auth) {
      deleteHeader(finalHeaders, "Authorization");
    }

    const payload = serializeBody({
      method,
      body: requestConfig.body,
      headers: finalHeaders,
    });

    const dedupeAllowed =
      requestConfig.dedupe !== false &&
      canDedupeMethod(method);

    const dedupeKey = requestConfig.dedupeKey
      ? safeText(requestConfig.dedupeKey, "")
      : dedupeAllowed
        ? buildFingerprint({
            method,
            url,
            headers: finalHeaders,
            payload,
            auth: requestConfig.auth,
            token: requestConfig.auth ? token : "",
          })
        : null;

    if (dedupeKey && inFlightRequests.has(dedupeKey)) {
      stats.deduped += 1;

      if (shouldEmitLifecycleEvent(requestConfig, "deduped")) {
        safeEmit(events, REQUEST_EVENTS.deduped, {
          requestId,
          url: redactedUrl,
          method,
          auth: Boolean(requestConfig.auth),
        });
      }

      return inFlightRequests.get(dedupeKey);
    }

    stats.total += 1;
    stats.lastRequestAt = startedAt;
    stats.lastUrl = redactedUrl;

    incrementPending();

    const requestAbortController = createAbortControllerSafe();

    if (requestAbortController) {
      inFlightControllers.set(requestId, requestAbortController);
    }

    const retrySignal = mergeSignalsSafe([
      requestConfig.signal,
      requestAbortController?.signal,
    ]);

    if (shouldEmitLifecycleEvent(requestConfig, "start")) {
      safeEmit(events, REQUEST_EVENTS.start, {
        requestId,
        url: redactedUrl,
        method,
        auth: Boolean(requestConfig.auth),
        headers: sanitizeHeadersForLog(finalHeaders),
        at: safeIsoDate(startedAt),
      });
    }

    const promise = (async () => {
      let attempts = 1;

      try {
        if (state && typeof state === "object") {
          state.lastRequestAt = safeIsoDate();
          state.lastRequestUrl = redactedUrl;
          state.lastRequestMethod = method;
        }

        const response = await executeFetchWithRetry(
          url,
          async (attempt = 0) => {
            attempts = attempt + 1;

            const timeout = createTimeoutSafe(requestConfig.timeout);

            const signal = mergeSignalsSafe([
              timeout.signal,
              requestConfig.signal,
              requestAbortController?.signal,
            ]);

            try {
              const fetchFn = getFetch();

              if (!fetchFn) {
                throw new Error("Fetch API no disponible.");
              }

              const fetchInit = buildFetchInit({
                method,
                headers: finalHeaders,
                body: payload,
                credentials: requestConfig.credentials,
                signal,
                cache: requestConfig.cache,
                mode: requestConfig.mode,
                redirect: requestConfig.redirect,
                referrerPolicy: requestConfig.referrerPolicy,
                keepalive: requestConfig.keepalive,
              });

              const currentResponse = await fetchFn(url, fetchInit);

              const allowedStatus = isExpectedStatus(
                currentResponse.status,
                requestConfig.expectedStatuses
              );

              if (requestConfig.raw !== true && !currentResponse.ok && !allowedStatus) {
                const errorData = await parseResponseBody(
                  currentResponse,
                  DEFAULT_RESPONSE_TYPE
                );

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
              if (error?.status !== undefined) {
                throw error;
              }

              const timeoutAborted = Boolean(
                timeout.fired === true ||
                  (
                    timeout.signal?.aborted === true &&
                    String(timeout.signal?.reason || "").toLowerCase().includes("timeout")
                  )
              );

              const manualAborted = Boolean(
                requestAbortController?.signal?.aborted === true ||
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

              if (!shouldEmitLifecycleEvent(requestConfig, "retry")) {
                return;
              }

              safeEmit(events, REQUEST_EVENTS.retry, {
                requestId,
                url: redactedUrl,
                method,
                attempt: retryMeta.attempt,
                nextAttempt: retryMeta.nextAttempt,
                retries: retryMeta.retries,
                delayMs: retryMeta.delayMs,
                status: retryMeta.error?.status || 0,
                message: safeRedact(retryMeta.error?.message || ""),
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

          if (shouldEmitFinalEvent(requestConfig)) {
            safeEmit(events, REQUEST_EVENTS.success, {
              requestId,
              url: redactedUrl,
              method,
              status: response.status,
              attempts,
              durationMs: safeNow() - startedAt,
              raw: true,
            });
          }

          return response;
        }

        const data = await parseResponseBody(
          response,
          requestConfig.responseType
        );

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

        const finalData = await safeRunNamedHooks({
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
              headers: sanitizeHeadersForLog(finalHeaders),
            },
          },
        });

        stats.success += 1;

        if (shouldEmitFinalEvent(requestConfig)) {
          safeEmit(events, REQUEST_EVENTS.success, {
            requestId,
            url: redactedUrl,
            method,
            status: response.status,
            attempts,
            durationMs: safeNow() - startedAt,
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
        normalized.durationMs = safeNow() - startedAt;
        normalized.attempts = normalized.attempts || attempts;
        normalized.retryable = shouldRetryRequest(normalized, requestConfig);

        if (state && typeof state === "object") {
          state.lastRequestStatus = normalized.status || 0;
        }

        const manualAbort = Boolean(normalized.aborted && !normalized.timeout);

        if (manualAbort) {
          stats.aborted += 1;
        }

        stats.error += 1;

        stats.lastError = sanitizeErrorForEvent({
          ...normalized,
          url: redactedUrl,
          redactedUrl,
        });

        const silent = safeBoolean(requestConfig.silent, false);

        const shouldStoreError =
          !silent &&
          requestConfig.storeError !== false &&
          (
            !manualAbort ||
            requestConfig.storeAbortError === true
          );

        if (shouldStoreError) {
          safeStoreError(setError, normalized);
        }

        if (!silent) {
          await safeRunNamedHooks({
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
                headers: sanitizeHeadersForLog(finalHeaders),
              },
            },
          });
        }

        if (!silent && shouldEmitFinalEvent(requestConfig)) {
          if (manualAbort && requestConfig.emitAbortAsError !== true) {
            safeEmit(events, REQUEST_EVENTS.abort, {
              requestId,
              url: redactedUrl,
              method,
              reason: safeRedact(normalized.message || "aborted"),
              durationMs: normalized.durationMs,
              at: safeIsoDate(),
            });
          } else {
            safeEmit(
              events,
              REQUEST_EVENTS.error,
              sanitizeErrorForEvent({
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
      inFlightRequests.set(dedupeKey, promise);

      inFlightMeta.set(dedupeKey, {
        requestId,
        url: redactedUrl,
        method,
        auth: Boolean(requestConfig.auth),
        startedAt: safeIsoDate(startedAt),
      });
    }

    try {
      return await promise;
    } finally {
      decrementPending();

      if (dedupeKey) {
        inFlightRequests.delete(dedupeKey);
        inFlightMeta.delete(dedupeKey);
      }

      inFlightControllers.delete(requestId);
    }
  }

  request.getSnapshot = function getRequestSnapshot(options = {}) {
    const opts = safeObject(options);

    return {
      version: REQUEST_VERSION,
      sequence: requestSequence,
      inFlight: inFlightRequests.size,
      controllers: inFlightControllers.size,

      inFlightRequests:
        opts.includeInFlight === true
          ? Array.from(inFlightMeta.values()).map((item) => sanitizeValueForEvent(item))
          : [],

      stats: sanitizeValueForEvent(stats),

      state: {
        requestPending: safeNumber(state?.requestPending, 0),
        pendingRequests: safeNumber(state?.pendingRequests, 0),
      },

      at: safeIsoDate(),
    };
  };

  request.getDebugSnapshot = request.getSnapshot;
  request.snapshot = request.getSnapshot;

  request.clearInFlight = function clearInFlight(options = {}) {
    const opts = safeObject(options);
    const count = inFlightRequests.size;

    if (opts.abort === true) {
      for (const controller of inFlightControllers.values()) {
        try {
          controller.abort(opts.reason || "clearInFlight");
        } catch {}
      }
    }

    inFlightRequests.clear();
    inFlightMeta.clear();
    inFlightControllers.clear();

    stats.cleared += count;

    if (opts.emitEvents !== false) {
      safeEmit(events, REQUEST_EVENTS.clearInFlight, {
        count,
        abort: opts.abort === true,
        reason: opts.reason || "clearInFlight",
        at: safeIsoDate(),
      });
    }

    return count;
  };

  request.abortInFlight = function abortInFlight(reason = "abortInFlight", options = {}) {
    const opts = safeObject(options);
    let count = 0;

    for (const controller of inFlightControllers.values()) {
      try {
        controller.abort(reason);
        count += 1;
      } catch {}
    }

    if (opts.emitEvents !== false) {
      safeEmit(events, REQUEST_EVENTS.abort, {
        count,
        reason,
        at: safeIsoDate(),
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
