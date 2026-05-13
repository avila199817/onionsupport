/* =========================================================
   Onion SPA - Core Request
   Archivo: src/core/request.js

   CORE REQUEST · API CLIENT · ENTERPRISE HARDENED · 14/10

   RESPONSABILIDADES:
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

   HARDENING EXTREMO:
   - single emit final
   - timeout real con AbortController
   - timeout separado de abort manual
   - merge signals robusto
   - json/text/blob/arrayBuffer/formData auto
   - dedupe GET/HEAD
   - OPTIONS sin body accidental
   - retry enterprise con backoff+jitter
   - retry HTTP real para 408/425/429/5xx
   - soporte Retry-After
   - protección hooks
   - cleanup total de inflight map
   - abort in-flight opcional
   - errores consistentes
   - eventos sin tokens reales
   - compat con hooks.runSeries y registry.hooks
   - compat con registry.hooks como arrays, funciones o entradas { handler }
   - /api/auth/me recibe Authorization si config lo marca como privado
   - no ReferenceError si fetch/FormData/Blob/Headers/ReadableStream no existen
========================================================= */

import { config } from "./config.js";

import {
  now,
  buildUrl,
  hasValidToken,
  isPublicApiPath,
  createAbortTimeout,
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

export const REQUEST_VERSION =
  "14.0.0";

const DEFAULT_METHOD =
  "GET";

const DEFAULT_RESPONSE_TYPE =
  "auto";

const DEFAULT_TIMEOUT_MS =
  30000;

const DEFAULT_RETRIES =
  1;

const DEFAULT_RETRY_DELAY_MS =
  300;

const DEFAULT_RETRY_MAX_DELAY_MS =
  4000;

const DEFAULT_DEDUPE =
  true;

const RETRYABLE_HTTP_STATUSES =
  Object.freeze([
    408,
    425,
    429,
    500,
    502,
    503,
    504,
  ]);

const BODYLESS_METHODS =
  Object.freeze([
    "GET",
    "HEAD",
    "OPTIONS",
  ]);

const DEDUPE_METHODS =
  Object.freeze([
    "GET",
    "HEAD",
  ]);

const DEFAULT_RETRYABLE_METHODS =
  Object.freeze([
    "GET",
    "HEAD",
    "OPTIONS",
  ]);

const KNOWN_METHODS =
  Object.freeze([
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ]);

const JSON_CONTENT_TYPES =
  Object.freeze([
    "application/json",
    "application/problem+json",
    "+json",
  ]);

const TEXT_CONTENT_TYPES =
  Object.freeze([
    "text/",
    "application/xml",
    "application/xhtml+xml",
    "application/csv",
    "application/javascript",
    "application/x-javascript",
  ]);

const BINARY_CONTENT_TYPES =
  Object.freeze([
    "application/octet-stream",
    "application/pdf",
    "application/zip",
    "image/",
    "audio/",
    "video/",
  ]);

const SENSITIVE_HEADER_RE =
  /authorization|cookie|set-cookie|token|secret|password|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code/i;

const SENSITIVE_PAYLOAD_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code/i;

const REQUEST_EVENTS =
  Object.freeze({
    start:
      "app:request:start",

    success:
      "app:request:success",

    error:
      "app:request:error",

    retry:
      "app:request:retry",

    deduped:
      "app:request:deduped",

    abort:
      "app:request:abort",

    clearInFlight:
      "app:request:clear-in-flight",
  });

/* =========================================================
   BASICS
========================================================= */

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeText(value, fallback = "") {
  try {
    if (typeof helperSafeText === "function") {
      return helperSafeText(
        value,
        fallback
      );
    }
  } catch {}

  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeBoolean(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const clean =
      value.trim().toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "ok",
        "on",
        "enabled",
      ].includes(clean)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
        "disabled",
      ].includes(clean)
    ) {
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

  return Array.isArray(value)
    ? value
    : [];
}

function safeObject(value, fallback = {}) {
  try {
    if (typeof helperSafeObject === "function") {
      return helperSafeObject(
        value,
        fallback
      );
    }
  } catch {}

  return isObject(value)
    ? value
    : fallback;
}

function safeClone(value, fallback = null) {
  try {
    if (typeof helperSafeClone === "function") {
      return helperSafeClone(
        value,
        fallback
      );
    }
  } catch {}

  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {
    return fallback;
  }
}

function safeIsoDate(ms = Date.now()) {
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

function safeEmit(events, eventName, payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  try {
    events?.emit?.(
      name,
      payload
    );

    return true;
  } catch {}

  return false;
}

function safeWarn(utils, ...args) {
  try {
    utils?.warn?.(
      "[Request]",
      ...args
    );
  } catch {}

  try {
    if (config?.debug) {
      console.warn(
        "[Request]",
        ...args
      );
    }
  } catch {}
}

function sleep(ms = 0) {
  return new Promise((resolve) => {
    try {
      setTimeout(
        resolve,
        Math.max(
          0,
          safeNumber(ms, 0)
        )
      );
    } catch {
      resolve();
    }
  });
}

function getFetch() {
  try {
    if (
      typeof globalThis !== "undefined" &&
      isFunction(globalThis.fetch)
    ) {
      return globalThis.fetch.bind(globalThis);
    }
  } catch {}

  return null;
}

function normalizeMethod(method = DEFAULT_METHOD) {
  return safeText(
    method,
    DEFAULT_METHOD
  ).toUpperCase();
}

function isKnownMethod(value = "") {
  return KNOWN_METHODS.includes(
    normalizeMethod(value)
  );
}

function isBodyAllowed(method = DEFAULT_METHOD) {
  return !BODYLESS_METHODS.includes(
    normalizeMethod(method)
  );
}

function canDedupeMethod(method = DEFAULT_METHOD) {
  return DEDUPE_METHODS.includes(
    normalizeMethod(method)
  );
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

function getStateToken(state = {}) {
  return safeText(
    state?.token ||
      state?.accessToken ||
      state?.access_token ||
      state?.session?.token ||
      state?.session?.accessToken ||
      state?.session?.access_token ||
      "",
    ""
  );
}

/* =========================================================
   REQUEST ARGUMENT NORMALIZATION
========================================================= */

function normalizeRequestArguments(arg1, arg2 = {}, arg3 = undefined) {
  /*
    Firma:
      request(method, path, options)
  */
  if (
    typeof arg1 === "string" &&
    isKnownMethod(arg1) &&
    typeof arg2 === "string"
  ) {
    return {
      path:
        arg2,

      options: {
        ...safeObject(arg3),
        method:
          normalizeMethod(arg1),
      },
    };
  }

  /*
    Firma:
      request(path, options)
  */
  return {
    path:
      arg1,

    options:
      safeObject(arg2),
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
    if (
      typeof Headers !== "undefined" &&
      headers instanceof Headers
    ) {
      headers.forEach((value, key) => {
        output[key] =
          value;
      });

      return output;
    }
  } catch {}

  try {
    if (isFunction(headers.forEach)) {
      headers.forEach((value, key) => {
        output[key] =
          value;
      });

      return output;
    }
  } catch {}

  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (
        Array.isArray(entry) &&
        entry.length >= 2
      ) {
        output[entry[0]] =
          entry[1];
      }
    }

    return output;
  }

  if (isObject(headers)) {
    return {
      ...headers,
    };
  }

  return output;
}

function normalizePlainHeaders(headers = {}) {
  const source =
    headersToPlainObject(headers);

  try {
    const normalized =
      normalizeHeaders(source);

    return headersToPlainObject(normalized);
  } catch {
    return source;
  }
}

function getHeader(headers, name) {
  const target =
    safeText(name).toLowerCase();

  if (!target) {
    return undefined;
  }

  const source =
    headersToPlainObject(headers);

  const key =
    Object.keys(source).find((item) =>
      safeText(item).toLowerCase() === target
    );

  return key
    ? source[key]
    : undefined;
}

function hasHeader(headers, name) {
  return getHeader(
    headers,
    name
  ) !== undefined;
}

function setHeader(headers, name, value) {
  if (
    !headers ||
    !name ||
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return headers;
  }

  const target =
    safeText(name).toLowerCase();

  const existingKey =
    Object.keys(headers).find((item) =>
      safeText(item).toLowerCase() === target
    );

  headers[existingKey || name] =
    value;

  return headers;
}

function deleteHeader(headers, name) {
  if (
    !headers ||
    !name
  ) {
    return headers;
  }

  const target =
    safeText(name).toLowerCase();

  for (const key of Object.keys(headers)) {
    if (
      safeText(key).toLowerCase() === target
    ) {
      delete headers[key];
    }
  }

  return headers;
}

function sanitizeHeadersForLog(headers = {}) {
  const output = {};

  for (const [key, value] of Object.entries(headersToPlainObject(headers))) {
    const lower =
      safeText(key).toLowerCase();

    output[key] =
      SENSITIVE_HEADER_RE.test(lower)
        ? "***"
        : safeRedact(String(value));
  }

  return output;
}

function readResponseHeaders(response = null) {
  const output = {};

  try {
    response?.headers?.forEach?.((value, key) => {
      output[key] =
        value;
    });
  } catch {}

  return output;
}

function getHeaderFromObject(headers = {}, name = "") {
  const target =
    safeText(name, "").toLowerCase();

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
  const list =
    safeArray(expectedStatuses)
      .map((item) =>
        safeNumber(item, -1)
      )
      .filter((item) =>
        item >= 100 &&
        item <= 599
      );

  return list.includes(
    safeNumber(status, 0)
  );
}

function contentTypeIncludes(contentType = "", fragments = []) {
  const value =
    safeText(contentType, "").toLowerCase();

  return safeArray(fragments).some((fragment) =>
    value.includes(fragment)
  );
}

function responseHasBody(response) {
  if (!response) {
    return false;
  }

  if (
    response.status === 204 ||
    response.status === 205 ||
    response.status === 304
  ) {
    return false;
  }

  return true;
}

/* =========================================================
   RESPONSE PARSER
========================================================= */

export async function parseResponseBody(response, responseType = DEFAULT_RESPONSE_TYPE) {
  if (
    !response ||
    !responseHasBody(response)
  ) {
    return null;
  }

  const finalType =
    safeText(
      responseType,
      DEFAULT_RESPONSE_TYPE
    );

  const contentType =
    safeText(
      response.headers?.get?.("content-type"),
      ""
    ).toLowerCase();

  try {
    if (finalType === "response") {
      return response;
    }

    if (
      finalType === "void" ||
      finalType === "none" ||
      finalType === "empty"
    ) {
      return null;
    }

    if (finalType === "blob") {
      return isFunction(response.blob)
        ? await response.blob()
        : await response.arrayBuffer();
    }

    if (
      finalType === "arrayBuffer" ||
      finalType === "arraybuffer"
    ) {
      return await response.arrayBuffer();
    }

    if (
      finalType === "formData" ||
      finalType === "formdata"
    ) {
      return isFunction(response.formData)
        ? await response.formData()
        : null;
    }

    if (finalType === "text") {
      return await response.text();
    }

    if (finalType === "json") {
      const text =
        await response.text();

      if (!safeText(text, "")) {
        return null;
      }

      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }

    if (
      contentTypeIncludes(
        contentType,
        JSON_CONTENT_TYPES
      )
    ) {
      const text =
        await response.text();

      if (!safeText(text, "")) {
        return null;
      }

      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }

    if (
      contentType.includes("multipart/form-data") &&
      isFunction(response.formData)
    ) {
      return await response.formData();
    }

    if (
      contentTypeIncludes(
        contentType,
        BINARY_CONTENT_TYPES
      )
    ) {
      return await response.arrayBuffer();
    }

    if (
      contentTypeIncludes(
        contentType,
        TEXT_CONTENT_TYPES
      )
    ) {
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
  if (!data) {
    return "";
  }

  if (typeof data === "string") {
    return data;
  }

  if (!isObject(data)) {
    return safeText(data, "");
  }

  const errors =
    Array.isArray(data.errors)
      ? data.errors
      : [];

  return (
    safeText(data.message, "") ||
    safeText(data.mensaje, "") ||
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
    return value
      ? "***"
      : null;
  }

  if (depth > 3) {
    return "[depth-limit]";
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (typeof value === "string") {
    return safeRedact(value);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
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
      name:
        value.name || "Error",
      message:
        safeRedact(value.message || "Error"),
      stack:
        value.stack ? "[stack]" : null,
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) =>
        sanitizeValueForEvent(
          item,
          depth + 1,
          keyHint
        )
      );
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      output[key] =
        SENSITIVE_PAYLOAD_KEY_RE.test(key)
          ? item
            ? "***"
            : null
          : sanitizeValueForEvent(
              item,
              depth + 1,
              key
            );
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
  const output =
    safeClone(
      error,
      {}
    ) || {};

  output.url =
    safeRedact(
      output.url || ""
    );

  output.redactedUrl =
    safeRedact(
      output.redactedUrl ||
        output.url ||
        ""
    );

  output.message =
    safeRedact(
      output.message || ""
    );

  output.statusText =
    safeRedact(
      output.statusText || ""
    );

  output.raw =
    undefined;

  if (output.headers) {
    output.headers =
      sanitizeHeadersForLog(
        output.headers
      );
  }

  if (output.data) {
    output.data =
      sanitizeValueForEvent(
        output.data
      );
  }

  return output;
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
  const status =
    safeNumber(
      response?.status,
      0
    );

  const statusText =
    safeText(
      response?.statusText,
      timeout
        ? "Request Timeout"
        : aborted
          ? "Request Aborted"
          : status === 0
            ? "Network Error"
            : "HTTP Error"
    );

  const dataMessage =
    extractDataMessage(data);

  const rawMessage =
    typeof raw === "string"
      ? raw
      : raw?.message ||
        raw?.reason ||
        "";

  const message =
    safeText(
      dataMessage ||
        rawMessage,
      statusText
    );

  const finalMethod =
    normalizeMethod(method);

  const error = new Error(
    safeRedact(message)
  );

  error.name =
    "RequestError";

  error.ok =
    false;

  error.status =
    status;

  error.statusText =
    safeRedact(statusText);

  error.url =
    url;

  error.redactedUrl =
    safeRedact(url);

  error.method =
    finalMethod;

  error.timeout =
    timeout === true;

  /*
    Timeout y abort manual quedan separados.
    Si timeout=true, aborted=false para permitir retry.
  */
  error.aborted =
    timeout === true
      ? false
      : aborted === true;

  error.raw =
    raw;

  error.data =
    data;

  error.headers =
    readResponseHeaders(response);

  error.hints =
    status === 0
      ? detectNetworkHints(url)
      : null;

  error.requestId =
    safeText(requestId, "");

  error.attempt =
    safeNumber(attempt, 0);

  error.attempts =
    safeNumber(attempts, 0);

  error.at =
    safeIsoDate();

  return error;
}

/* =========================================================
   RETRY POLICY
========================================================= */

function parseRetryAfterMs(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return 0;
  }

  const seconds =
    Number(raw);

  if (Number.isFinite(seconds)) {
    return Math.max(
      0,
      seconds * 1000
    );
  }

  const dateMs =
    Date.parse(raw);

  if (Number.isFinite(dateMs)) {
    return Math.max(
      0,
      dateMs - Date.now()
    );
  }

  return 0;
}

function isRetryableMethod(method = DEFAULT_METHOD, requestConfig = {}) {
  const finalMethod =
    normalizeMethod(method);

  if (requestConfig.retryUnsafeMethods === true) {
    return true;
  }

  const configuredMethods =
    safeArray(
      requestConfig.retryMethods ||
        config?.requestRetryMethods ||
        config?.api?.retryMethods
    );

  const methods =
    configuredMethods.length
      ? configuredMethods.map(normalizeMethod)
      : DEFAULT_RETRYABLE_METHODS;

  return methods.includes(finalMethod);
}

export function shouldRetryRequest(error, requestConfig = {}) {
  const retries =
    safeNumber(
      requestConfig?.retries ??
        config?.requestRetries ??
        config?.api?.retries,
      0
    );

  if (retries <= 0) {
    return false;
  }

  const method =
    normalizeMethod(
      requestConfig?.method
    );

  if (!isRetryableMethod(method, requestConfig)) {
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
  const baseDelay =
    safeNumber(
      requestConfig?.retryDelay ??
        requestConfig?.retryDelayMs ??
        config?.requestRetryDelayMs ??
        config?.api?.retryDelayMs,
      DEFAULT_RETRY_DELAY_MS
    );

  const maxDelay =
    safeNumber(
      requestConfig?.retryMaxDelay ??
        requestConfig?.retryMaxDelayMs ??
        config?.requestRetryMaxDelayMs ??
        config?.api?.retryMaxDelayMs,
      DEFAULT_RETRY_MAX_DELAY_MS
    );

  const retryAfterMs =
    parseRetryAfterMs(
      getHeaderFromObject(
        error?.headers,
        "retry-after"
      )
    );

  if (retryAfterMs > 0) {
    return Math.min(
      maxDelay,
      retryAfterMs
    );
  }

  const backoff =
    Math.min(
      maxDelay,
      baseDelay * 2 ** attempt
    );

  const jitter =
    Math.floor(
      Math.random() * Math.max(1, baseDelay)
    );

  return Math.min(
    maxDelay,
    backoff + jitter
  );
}

/* =========================================================
   FETCH WITH RETRY
========================================================= */

export async function executeFetchWithRetry(url, fetchFactory, requestConfig = {}, utils = {}) {
  const retries =
    safeNumber(
      requestConfig?.retries ??
        config?.requestRetries ??
        config?.api?.retries,
      0
    );

  const sleeper =
    utils?.sleep ||
    sleep;

  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    try {
      return await fetchFactory(attempt);
    } catch (error) {
      const normalized =
        error?.status !== undefined
          ? error
          : buildRequestError({
              url,
              method:
                requestConfig.method,
              timeout:
                isProbablyTimeoutError(error),
              aborted:
                isAbortError(error),
              raw:
                error?.message ||
                error,
              attempt,
              attempts:
                attempt + 1,
            });

      normalized.attempt =
        attempt;

      normalized.attempts =
        attempt + 1;

      lastError =
        normalized;

      const retry =
        shouldRetryRequest(
          normalized,
          requestConfig
        );

      if (
        attempt >= retries ||
        !retry
      ) {
        throw normalized;
      }

      const delayMs =
        computeRetryDelayMs(
          normalized,
          attempt,
          requestConfig
        );

      try {
        requestConfig?.onRetry?.({
          url,
          redactedUrl:
            safeRedact(url),
          error:
            sanitizeErrorForEvent(normalized),
          attempt,
          nextAttempt:
            attempt + 1,
          retries,
          delayMs,
        });
      } catch {}

      await sleeper(delayMs);

      attempt += 1;
    }
  }

  throw (
    lastError ||
    buildRequestError({
      url,
      method:
        requestConfig.method,
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
  const hookName =
    safeText(name, "");

  if (!hookName) {
    return [];
  }

  const registryHooks =
    registry?.hooks;

  if (!registryHooks) {
    return [];
  }

  if (Array.isArray(registryHooks?.[hookName])) {
    return registryHooks[hookName];
  }

  if (isFunction(registryHooks?.get)) {
    try {
      return normalizeHookList(
        registryHooks.get(hookName)
      );
    } catch {}
  }

  return normalizeHookList(
    registryHooks?.[hookName]
  );
}

async function safeRunHooks(hooks, payload, context = {}) {
  const list =
    normalizeHookList(hooks);

  if (!list.length) {
    return payload;
  }

  let current =
    payload;

  for (const item of list) {
    const handler =
      isFunction(item)
        ? item
        : isFunction(item?.handler)
          ? item.handler
          : null;

    if (!handler) {
      continue;
    }

    if (item?.enabled === false) {
      continue;
    }

    try {
      const result =
        await handler(
          current,
          {
            ...context,
            hook:
              item,
          }
        );

      if (result !== undefined) {
        current =
          result;
      }

      if (item?.once === true) {
        try {
          item.enabled =
            false;
        } catch {}
      }
    } catch (error) {
      safeWarn(
        context?.utils,
        "Hook request falló.",
        error
      );

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
  const hookName =
    safeText(name, "");

  if (!hookName) {
    return payload;
  }

  try {
    if (isFunction(hooks?.runSeries)) {
      return await hooks.runSeries(
        hookName,
        payload,
        {
          context:
            safeObject(context),
        }
      );
    }

    if (isFunction(hooks?.run)) {
      return await hooks.run(
        hookName,
        payload,
        {
          context:
            safeObject(context),
        }
      );
    }
  } catch (error) {
    safeWarn(
      context?.utils,
      `hooks.${hookName} falló.`,
      error
    );

    if (context?.stopOnHookError === true) {
      throw error;
    }

    return payload;
  }

  return safeRunHooks(
    getRegistryHookList(
      registry,
      hookName
    ),
    payload,
    context
  );
}

/* =========================================================
   BODY SERIALIZATION
========================================================= */

function isFormDataBody(value) {
  return (
    typeof FormData !== "undefined" &&
    value instanceof FormData
  );
}

function isUrlSearchParamsBody(value) {
  return (
    typeof URLSearchParams !== "undefined" &&
    value instanceof URLSearchParams
  );
}

function isBlobBody(value) {
  return (
    typeof Blob !== "undefined" &&
    value instanceof Blob
  );
}

function isArrayBufferBody(value) {
  return (
    typeof ArrayBuffer !== "undefined" &&
    value instanceof ArrayBuffer
  );
}

function isReadableStreamBody(value) {
  return (
    typeof ReadableStream !== "undefined" &&
    value instanceof ReadableStream
  );
}

function serializeBody({
  method,
  body,
  headers,
} = {}) {
  if (!isBodyAllowed(method)) {
    deleteHeader(
      headers,
      "Content-Type"
    );

    return undefined;
  }

  if (
    body === null ||
    body === undefined
  ) {
    return undefined;
  }

  if (isFormDataBody(body)) {
    deleteHeader(
      headers,
      "Content-Type"
    );

    return body;
  }

  if (isUrlSearchParamsBody(body)) {
    if (
      !hasHeader(
        headers,
        "Content-Type"
      )
    ) {
      setHeader(
        headers,
        "Content-Type",
        "application/x-www-form-urlencoded;charset=UTF-8"
      );
    }

    return body;
  }

  if (
    isBlobBody(body) ||
    isArrayBufferBody(body) ||
    isReadableStreamBody(body)
  ) {
    return body;
  }

  if (typeof body === "string") {
    return body;
  }

  const contentType =
    safeText(
      getHeader(
        headers,
        "Content-Type"
      ),
      ""
    ).toLowerCase();

  if (
    isObject(body) ||
    Array.isArray(body)
  ) {
    if (
      !hasHeader(
        headers,
        "Content-Type"
      )
    ) {
      setHeader(
        headers,
        "Content-Type",
        "application/json"
      );
    }

    if (
      contentType.includes("application/json") ||
      !contentType
    ) {
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
  try {
    if (isFunction(createAbortTimeout)) {
      return createAbortTimeout(timeoutMs);
    }
  } catch {}

  const controller =
    createAbortControllerSafe();

  if (
    !controller ||
    !timeoutMs ||
    timeoutMs <= 0
  ) {
    return {
      controller,
      signal:
        controller?.signal || null,
      timeoutId:
        null,
      clear() {},
    };
  }

  let timeoutId =
    null;

  try {
    timeoutId =
      setTimeout(() => {
        try {
          controller.abort("timeout");
        } catch {
          try {
            controller.abort();
          } catch {}
        }
      }, timeoutMs);
  } catch {}

  return {
    controller,
    signal:
      controller.signal,
    timeoutId,
    clear() {
      if (timeoutId) {
        try {
          clearTimeout(timeoutId);
        } catch {}
      }
    },
  };
}

function mergeSignalsSafe(signals = []) {
  const cleanSignals =
    safeArray(signals)
      .filter(Boolean);

  if (!cleanSignals.length) {
    return null;
  }

  try {
    if (isFunction(mergeAbortSignals)) {
      return mergeAbortSignals(cleanSignals);
    }
  } catch {}

  if (cleanSignals.length === 1) {
    return cleanSignals[0];
  }

  const controller =
    createAbortControllerSafe();

  if (!controller) {
    return cleanSignals[0] || null;
  }

  for (const signal of cleanSignals) {
    if (signal?.aborted) {
      try {
        controller.abort(signal.reason || "aborted");
      } catch {
        try {
          controller.abort();
        } catch {}
      }

      return controller.signal;
    }

    try {
      signal.addEventListener(
        "abort",
        () => {
          try {
            controller.abort(signal.reason || "aborted");
          } catch {
            try {
              controller.abort();
            } catch {}
          }
        },
        {
          once:
            true,
        }
      );
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

  if (body !== undefined) {
    init.body =
      body;
  }

  if (credentials !== undefined) {
    init.credentials =
      credentials;
  }

  if (signal) {
    init.signal =
      signal;
  }

  if (cache !== undefined) {
    init.cache =
      cache;
  }

  if (mode !== undefined) {
    init.mode =
      mode;
  }

  if (redirect !== undefined) {
    init.redirect =
      redirect;
  }

  if (referrerPolicy !== undefined) {
    init.referrerPolicy =
      referrerPolicy;
  }

  if (keepalive !== undefined) {
    init.keepalive =
      keepalive;
  }

  return init;
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

  const inFlightRequests =
    new Map();

  const inFlightMeta =
    new Map();

  const inFlightControllers =
    new Map();

  const stats = {
    version:
      REQUEST_VERSION,

    total:
      0,

    success:
      0,

    error:
      0,

    deduped:
      0,

    retry:
      0,

    aborted:
      0,

    cleared:
      0,

    lastRequestAt:
      0,

    lastUrl:
      "",

    lastError:
      null,
  };

  function stableStringify(value, seen = new WeakSet()) {
    if (
      value === null ||
      value === undefined
    ) {
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
      return `[${value.map((item) =>
        stableStringify(item, seen)
      ).join(",")}]`;
    }

    return `{${Object.keys(value)
      .sort()
      .map((key) =>
        `${key}:${stableStringify(value[key], seen)}`
      )
      .join("|")}}`;
  }

  function buildFingerprint({
    method,
    url,
    headers,
    payload,
    auth,
  }) {
    return [
      method,
      url,
      auth ? "auth" : "public",
      stableStringify(
        sanitizeHeadersForLog(headers)
      ),
      stableStringify(payload),
    ].join("::");
  }

  function resolveAuthDefault(path = "", opts = {}) {
    if (
      opts.public === true ||
      opts.skipAuth === true ||
      opts.auth === false
    ) {
      return false;
    }

    if (
      opts.auth !== undefined &&
      opts.auth !== null
    ) {
      return Boolean(opts.auth);
    }

    return !isPublicApiPath(path);
  }

  function buildBaseConfig(path, options = {}) {
    const opts =
      safeObject(options);

    const authDefault =
      resolveAuthDefault(
        path,
        opts
      );

    return {
      method:
        DEFAULT_METHOD,

      headers:
        {},

      body:
        null,

      auth:
        authDefault,

      public:
        false,

      skipAuth:
        false,

      timeout:
        getConfiguredTimeout(),

      raw:
        false,

      responseType:
        DEFAULT_RESPONSE_TYPE,

      query:
        opts.query ?? opts.params ?? null,

      params:
        opts.params ?? null,

      credentials:
        config?.api?.withCredentials
          ? "include"
          : "omit",

      signal:
        null,

      retries:
        getConfiguredRetries(),

      retryDelay:
        config?.requestRetryDelayMs ??
        config?.api?.retryDelayMs ??
        DEFAULT_RETRY_DELAY_MS,

      retryMaxDelay:
        config?.requestRetryMaxDelayMs ??
        config?.api?.retryMaxDelayMs ??
        DEFAULT_RETRY_MAX_DELAY_MS,

      retryUnsafeMethods:
        false,

      retryStatuses:
        [],

      retryMethods:
        [],

      dedupe:
        DEFAULT_DEDUPE,

      dedupeKey:
        "",

      silent:
        false,

      emitEvents:
        true,

      storeError:
        true,

      expectedStatuses:
        [],

      cache:
        undefined,

      mode:
        undefined,

      redirect:
        undefined,

      referrerPolicy:
        undefined,

      keepalive:
        undefined,

      ...opts,

      path,
    };
  }

  function normalizeFinalRequestConfig(requestConfig, baseConfig) {
    const merged = {
      ...baseConfig,
      ...safeObject(
        requestConfig,
        baseConfig
      ),
    };

    merged.method =
      normalizeMethod(
        merged.method
      );

    merged.path =
      safeText(
        merged.path,
        baseConfig.path
      );

    merged.query =
      merged.query ??
      merged.params ??
      null;

    if (
      merged.public === true ||
      merged.skipAuth === true ||
      merged.auth === false
    ) {
      merged.auth =
        false;
    } else if (
      merged.auth === undefined ||
      merged.auth === null
    ) {
      merged.auth =
        !isPublicApiPath(
          merged.path
        );
    } else {
      merged.auth =
        Boolean(merged.auth);
    }

    merged.timeout =
      safeNumber(
        merged.timeout,
        getConfiguredTimeout()
      );

    merged.retries =
      safeNumber(
        merged.retries,
        getConfiguredRetries()
      );

    merged.retryDelay =
      safeNumber(
        merged.retryDelay ??
          merged.retryDelayMs,
        config?.requestRetryDelayMs ??
          config?.api?.retryDelayMs ??
          DEFAULT_RETRY_DELAY_MS
      );

    merged.retryMaxDelay =
      safeNumber(
        merged.retryMaxDelay ??
          merged.retryMaxDelayMs,
        config?.requestRetryMaxDelayMs ??
          config?.api?.retryMaxDelayMs ??
          DEFAULT_RETRY_MAX_DELAY_MS
      );

    merged.expectedStatuses =
      safeArray(
        merged.expectedStatuses
      );

    merged.retryStatuses =
      safeArray(
        merged.retryStatuses
      );

    merged.retryMethods =
      safeArray(
        merged.retryMethods
      );

    return merged;
  }

  function incrementPending() {
    try {
      if (
        state &&
        typeof state === "object"
      ) {
        state.requestPending =
          Math.max(
            0,
            safeNumber(
              state.requestPending,
              0
            ) + 1
          );
      }
    } catch {}
  }

  function decrementPending() {
    try {
      if (
        state &&
        typeof state === "object"
      ) {
        state.requestPending =
          Math.max(
            0,
            safeNumber(
              state.requestPending,
              0
            ) - 1
          );
      }
    } catch {}
  }

  async function request(...args) {
    const normalizedArgs =
      normalizeRequestArguments(
        ...args
      );

    const path =
      normalizedArgs.path;

    const options =
      normalizedArgs.options;

    const startedAt =
      Date.now();

    const requestId =
      `req_${++requestSequence}`;

    const baseConfig =
      buildBaseConfig(
        path,
        options
      );

    let requestConfig =
      await safeRunNamedHooks({
        hooks,
        registry,
        name:
          "beforeRequest",
        payload:
          baseConfig,
        context: {
          phase:
            "beforeRequest",
          requestId,
          utils,
        },
      });

    requestConfig =
      normalizeFinalRequestConfig(
        requestConfig,
        baseConfig
      );

    const method =
      requestConfig.method;

    const url =
      buildUrl(
        requestConfig.path,
        requestConfig.query
      );

    const redactedUrl =
      safeRedact(url);

    const finalHeaders =
      normalizePlainHeaders({
        Accept:
          "application/json",
        ...safeObject(
          config?.api?.headers
        ),
        ...safeObject(
          requestConfig.headers
        ),
      });

    const token =
      getStateToken(state);

    if (
      requestConfig.auth &&
      hasValidToken(token)
    ) {
      setHeader(
        finalHeaders,
        config?.auth?.tokenHeader || "Authorization",
        `${config?.auth?.bearerPrefix || "Bearer"} ${token}`
      );
    }

    const payload =
      serializeBody({
        method,
        body:
          requestConfig.body,
        headers:
          finalHeaders,
      });

    const dedupeAllowed =
      requestConfig.dedupe !== false &&
      canDedupeMethod(method);

    const dedupeKey =
      requestConfig.dedupeKey
        ? safeText(requestConfig.dedupeKey, "")
        : dedupeAllowed
          ? buildFingerprint({
              method,
              url,
              headers:
                finalHeaders,
              payload,
              auth:
                requestConfig.auth,
            })
          : null;

    if (
      dedupeKey &&
      inFlightRequests.has(dedupeKey)
    ) {
      stats.deduped += 1;

      if (requestConfig.emitEvents !== false) {
        safeEmit(
          events,
          REQUEST_EVENTS.deduped,
          {
            requestId,
            url:
              redactedUrl,
            method,
            auth:
              Boolean(requestConfig.auth),
            dedupeKey:
              safeRedact(dedupeKey),
          }
        );
      }

      return inFlightRequests.get(dedupeKey);
    }

    stats.total += 1;
    stats.lastRequestAt =
      startedAt;
    stats.lastUrl =
      redactedUrl;

    incrementPending();

    const requestAbortController =
      createAbortControllerSafe();

    if (requestAbortController) {
      inFlightControllers.set(
        requestId,
        requestAbortController
      );
    }

    if (requestConfig.emitEvents !== false) {
      safeEmit(
        events,
        REQUEST_EVENTS.start,
        {
          requestId,
          url:
            redactedUrl,
          method,
          auth:
            Boolean(requestConfig.auth),
          headers:
            sanitizeHeadersForLog(finalHeaders),
          at:
            safeIsoDate(startedAt),
        }
      );
    }

    const promise =
      (async () => {
        let attempts =
          1;

        try {
          if (
            state &&
            typeof state === "object"
          ) {
            state.lastRequestAt =
              now();

            state.lastRequestUrl =
              redactedUrl;

            state.lastRequestMethod =
              method;
          }

          const response =
            await executeFetchWithRetry(
              url,
              async (attempt = 0) => {
                attempts =
                  attempt + 1;

                const timeout =
                  createTimeoutSafe(
                    requestConfig.timeout
                  );

                const timeoutSignal =
                  timeout.signal ||
                  timeout.controller?.signal ||
                  null;

                const signal =
                  mergeSignalsSafe([
                    timeoutSignal,
                    requestConfig.signal,
                    requestAbortController?.signal,
                  ]);

                try {
                  const fetchFn =
                    getFetch();

                  if (!fetchFn) {
                    throw new Error(
                      "Fetch API no disponible."
                    );
                  }

                  const fetchInit =
                    buildFetchInit({
                      method,
                      headers:
                        finalHeaders,
                      body:
                        payload,
                      credentials:
                        requestConfig.credentials,
                      signal,
                      cache:
                        requestConfig.cache,
                      mode:
                        requestConfig.mode,
                      redirect:
                        requestConfig.redirect,
                      referrerPolicy:
                        requestConfig.referrerPolicy,
                      keepalive:
                        requestConfig.keepalive,
                    });

                  const currentResponse =
                    await fetchFn(
                      url,
                      fetchInit
                    );

                  const allowedStatus =
                    isExpectedStatus(
                      currentResponse.status,
                      requestConfig.expectedStatuses
                    );

                  if (
                    requestConfig.raw !== true &&
                    !currentResponse.ok &&
                    !allowedStatus
                  ) {
                    const errorData =
                      await parseResponseBody(
                        currentResponse,
                        requestConfig.responseType
                      );

                    throw buildRequestError({
                      response:
                        currentResponse,
                      data:
                        errorData,
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

                  const timeoutReason =
                    String(
                      timeoutSignal?.reason ||
                        timeout.controller?.signal?.reason ||
                        ""
                    ).toLowerCase();

                  const timeoutAborted =
                    Boolean(
                      timeoutSignal?.aborted === true &&
                      (
                        timeoutReason.includes("timeout") ||
                        timeoutReason === ""
                      )
                    );

                  const manualAborted =
                    Boolean(
                      requestAbortController?.signal?.aborted === true ||
                      (
                        requestConfig.signal?.aborted === true &&
                        !timeoutAborted
                      )
                    );

                  throw buildRequestError({
                    url,
                    method,
                    timeout:
                      isProbablyTimeoutError(error) ||
                      timeoutAborted,
                    aborted:
                      !timeoutAborted &&
                      (
                        manualAborted ||
                        isAbortError(error)
                      ),
                    raw:
                      error?.message ||
                      error,
                    requestId,
                    attempt,
                    attempts,
                  });
                } finally {
                  try {
                    timeout.clear?.();
                  } catch {}

                  try {
                    if (timeout.timeoutId) {
                      clearTimeout(timeout.timeoutId);
                    }
                  } catch {}
                }
              },
              {
                ...requestConfig,
                method,
                retryDelay:
                  requestConfig.retryDelay,
                retryMaxDelay:
                  requestConfig.retryMaxDelay,
                onRetry:
                  (retryMeta) => {
                    stats.retry += 1;

                    if (requestConfig.emitEvents === false) {
                      return;
                    }

                    safeEmit(
                      events,
                      REQUEST_EVENTS.retry,
                      {
                        requestId,
                        url:
                          redactedUrl,
                        method,
                        attempt:
                          retryMeta.attempt,
                        nextAttempt:
                          retryMeta.nextAttempt,
                        retries:
                          retryMeta.retries,
                        delayMs:
                          retryMeta.delayMs,
                        status:
                          retryMeta.error?.status || 0,
                        message:
                          safeRedact(
                            retryMeta.error?.message || ""
                          ),
                      }
                    );
                  },
              },
              utils
            );

          if (
            state &&
            typeof state === "object"
          ) {
            state.lastRequestStatus =
              response.status || null;
          }

          if (requestConfig.raw === true) {
            stats.success += 1;

            if (requestConfig.emitEvents !== false) {
              safeEmit(
                events,
                REQUEST_EVENTS.success,
                {
                  requestId,
                  url:
                    redactedUrl,
                  method,
                  status:
                    response.status,
                  attempts,
                  durationMs:
                    Date.now() - startedAt,
                  raw:
                    true,
                }
              );
            }

            return response;
          }

          const data =
            await parseResponseBody(
              response,
              requestConfig.responseType
            );

          const allowedStatus =
            isExpectedStatus(
              response.status,
              requestConfig.expectedStatuses
            );

          if (
            !response.ok &&
            !allowedStatus
          ) {
            throw buildRequestError({
              response,
              data,
              url,
              method,
              requestId,
              attempts,
            });
          }

          const finalData =
            await safeRunNamedHooks({
              hooks,
              registry,
              name:
                "afterResponse",
              payload:
                data,
              context: {
                phase:
                  "afterResponse",
                requestId,
                utils,
                response,
                requestConfig:
                  {
                    ...requestConfig,
                    url:
                      redactedUrl,
                    headers:
                      sanitizeHeadersForLog(finalHeaders),
                  },
              },
            });

          stats.success += 1;

          if (requestConfig.emitEvents !== false) {
            safeEmit(
              events,
              REQUEST_EVENTS.success,
              {
                requestId,
                url:
                  redactedUrl,
                method,
                status:
                  response.status,
                attempts,
                durationMs:
                  Date.now() - startedAt,
              }
            );
          }

          return finalData;
        } catch (error) {
          const normalized =
            error?.status !== undefined
              ? error
              : buildRequestError({
                  url,
                  method,
                  timeout:
                    isProbablyTimeoutError(error),
                  aborted:
                    isAbortError(error),
                  raw:
                    error?.message ||
                    error,
                  requestId,
                  attempts,
                });

          normalized.requestId =
            requestId;

          normalized.url =
            normalized.url || url;

          normalized.redactedUrl =
            redactedUrl;

          normalized.durationMs =
            Date.now() - startedAt;

          normalized.attempts =
            normalized.attempts || attempts;

          normalized.retryable =
            shouldRetryRequest(
              normalized,
              requestConfig
            );

          if (
            state &&
            typeof state === "object"
          ) {
            state.lastRequestStatus =
              normalized.status || 0;
          }

          if (normalized.aborted) {
            stats.aborted += 1;
          }

          stats.error += 1;

          stats.lastError =
            sanitizeErrorForEvent({
              ...normalized,
              url:
                redactedUrl,
              redactedUrl,
            });

          const silent =
            safeBoolean(
              requestConfig.silent,
              false
            );

          if (
            !silent &&
            requestConfig.storeError !== false
          ) {
            try {
              setError?.(
                sanitizeErrorForEvent(normalized)
              );
            } catch {}
          }

          if (!silent) {
            await safeRunNamedHooks({
              hooks,
              registry,
              name:
                "onRequestError",
              payload:
                normalized,
              context: {
                phase:
                  "onRequestError",
                requestId,
                utils,
                requestConfig:
                  {
                    ...requestConfig,
                    url:
                      redactedUrl,
                    headers:
                      sanitizeHeadersForLog(finalHeaders),
                  },
              },
            });
          }

          if (
            !silent &&
            requestConfig.emitEvents !== false
          ) {
            safeEmit(
              events,
              REQUEST_EVENTS.error,
              sanitizeErrorForEvent({
                ...normalized,
                url:
                  redactedUrl,
                redactedUrl,
              })
            );
          }

          throw normalized;
        }
      })();

    if (dedupeKey) {
      inFlightRequests.set(
        dedupeKey,
        promise
      );

      inFlightMeta.set(
        dedupeKey,
        {
          requestId,
          url:
            redactedUrl,
          method,
          auth:
            Boolean(requestConfig.auth),
          startedAt:
            safeIsoDate(startedAt),
        }
      );
    }

    try {
      return await promise;
    } finally {
      decrementPending();

      if (dedupeKey) {
        inFlightRequests.delete(
          dedupeKey
        );

        inFlightMeta.delete(
          dedupeKey
        );
      }

      inFlightControllers.delete(
        requestId
      );
    }
  }

  request.getSnapshot =
    function getRequestSnapshot(options = {}) {
      const opts =
        safeObject(options);

      return {
        version:
          REQUEST_VERSION,

        sequence:
          requestSequence,

        inFlight:
          inFlightRequests.size,

        inFlightRequests:
          opts.includeInFlight === true
            ? Array.from(inFlightMeta.values())
            : [],

        stats:
          safeClone(
            stats,
            {}
          ),

        at:
          safeIsoDate(),
      };
    };

  request.getDebugSnapshot =
    request.getSnapshot;

  request.clearInFlight =
    function clearInFlight(options = {}) {
      const opts =
        safeObject(options);

      const count =
        inFlightRequests.size;

      if (opts.abort === true) {
        for (const controller of inFlightControllers.values()) {
          try {
            controller.abort(
              opts.reason || "clearInFlight"
            );
          } catch {}
        }
      }

      inFlightRequests.clear();
      inFlightMeta.clear();
      inFlightControllers.clear();

      stats.cleared += count;

      safeEmit(
        events,
        REQUEST_EVENTS.clearInFlight,
        {
          count,
          abort:
            opts.abort === true,
          reason:
            opts.reason || "clearInFlight",
          at:
            safeIsoDate(),
        }
      );

      return count;
    };

  request.abortInFlight =
    function abortInFlight(reason = "abortInFlight") {
      let count = 0;

      for (const controller of inFlightControllers.values()) {
        try {
          controller.abort(reason);
          count += 1;
        } catch {}
      }

      safeEmit(
        events,
        REQUEST_EVENTS.abort,
        {
          count,
          reason,
          at:
            safeIsoDate(),
        }
      );

      return count;
    };

  return request;
}

/* =========================================================
   API CLIENT
========================================================= */

export function createApiClient(request) {
  function requestWithOverload(arg1, arg2 = {}, arg3 = undefined) {
    return request(
      arg1,
      arg2,
      arg3
    );
  }

  function withMethod(method, path, bodyOrOptions = null, maybeOptions = {}) {
    const finalMethod =
      normalizeMethod(method);

    if (BODYLESS_METHODS.includes(finalMethod)) {
      return request(path, {
        ...safeObject(bodyOrOptions),
        method:
          finalMethod,
      });
    }

    return request(path, {
      ...safeObject(maybeOptions),
      method:
        finalMethod,
      body:
        bodyOrOptions,
    });
  }

  function deleteWithOptionalBody(path, bodyOrOptions = {}, maybeOptions = undefined) {
    if (maybeOptions !== undefined) {
      return withMethod(
        "DELETE",
        path,
        bodyOrOptions,
        maybeOptions
      );
    }

    return request(path, {
      ...safeObject(bodyOrOptions),
      method:
        "DELETE",
    });
  }

  return {
    get(path, options = {}) {
      return withMethod(
        "GET",
        path,
        options
      );
    },

    head(path, options = {}) {
      return withMethod(
        "HEAD",
        path,
        options
      );
    },

    options(path, options = {}) {
      return withMethod(
        "OPTIONS",
        path,
        options
      );
    },

    post(path, body = null, options = {}) {
      return withMethod(
        "POST",
        path,
        body,
        options
      );
    },

    put(path, body = null, options = {}) {
      return withMethod(
        "PUT",
        path,
        body,
        options
      );
    },

    patch(path, body = null, options = {}) {
      return withMethod(
        "PATCH",
        path,
        body,
        options
      );
    },

    delete(path, bodyOrOptions = {}, maybeOptions = undefined) {
      return deleteWithOptionalBody(
        path,
        bodyOrOptions,
        maybeOptions
      );
    },

    del(path, bodyOrOptions = {}, maybeOptions = undefined) {
      return deleteWithOptionalBody(
        path,
        bodyOrOptions,
        maybeOptions
      );
    },

    upload(path, formData, options = {}) {
      return request(path, {
        ...options,
        method:
          options.method || "POST",
        body:
          formData,
      });
    },

    download(path, options = {}) {
      return request(path, {
        ...options,
        method:
          options.method || "GET",
        responseType:
          options.responseType || "blob",
      });
    },

    raw(path, options = {}) {
      return request(path, {
        ...options,
        raw:
          true,
      });
    },

    request:
      requestWithOverload,

    getSnapshot(options = {}) {
      return request.getSnapshot?.(options) || null;
    },

    getDebugSnapshot(options = {}) {
      return request.getDebugSnapshot?.(options) || null;
    },

    clearInFlight(options = {}) {
      return request.clearInFlight?.(options) || 0;
    },

    abortInFlight(reason = "abortInFlight") {
      return request.abortInFlight?.(reason) || 0;
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  REQUEST_VERSION,

  createRequest,
  createApiClient,

  parseResponseBody,
  buildRequestError,
  shouldRetryRequest,
  executeFetchWithRetry,
};
