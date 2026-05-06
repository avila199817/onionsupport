/* =========================================================
   Onion SPA - Core Request
   Archivo: src/core/request.js

   RESPONSABILIDADES:
   - parsear respuestas HTTP
   - construir errores normalizados
   - decidir reintentos
   - ejecutar fetch con retry real
   - exponer request base y apiClient
   - no duplicar setError / eventos en retries

   HARDENING EXTREMO:
   - single emit final
   - timeout real con AbortController
   - merge signals robusto
   - json/text/blob/arrayBuffer/formData auto
   - dedupe GET/HEAD
   - retry enterprise con backoff+jitter
   - retry HTTP real para 408/425/429/5xx
   - soporte Retry-After
   - protección hooks
   - cleanup total de inflight map
   - abort in-flight opcional
   - errores consistentes
   - eventos sin tokens reales
   - compat con registry.hooks como arrays, funciones o entradas { handler }
   - /api/auth/me recibe Authorization si config lo marca como privado
   - no ReferenceError si fetch/FormData/Blob/Headers no existen
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

const REQUEST_VERSION =
  "11.0.0";

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
  ]);

const DEFAULT_RETRYABLE_METHODS =
  Object.freeze([
    "GET",
    "HEAD",
    "OPTIONS",
  ]);

const JSON_CONTENT_TYPES =
  Object.freeze([
    "application/json",
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
    "application/problem+json",
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

function isAnyObject(value) {
  return (
    value !== null &&
    typeof value === "object"
  );
}

function safeText(value, fallback = "") {
  try {
    if (typeof helperSafeText === "function") {
      return helperSafeText(value, fallback);
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
      return helperSafeObject(value, fallback);
    }
  } catch {}

  return isObject(value)
    ? value
    : fallback;
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
  try {
    events?.emit?.(
      eventName,
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
    if (typeof globalThis !== "undefined" && isFunction(globalThis.fetch)) {
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

function isBodyAllowed(method = DEFAULT_METHOD) {
  return !BODYLESS_METHODS.includes(
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

/* =========================================================
   HEADERS
========================================================= */

function getHeader(headers, name) {
  const target =
    safeText(name).toLowerCase();

  if (!target) {
    return undefined;
  }

  const source =
    safeObject(headers);

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

  for (const [key, value] of Object.entries(headers || {})) {
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

    if (finalType === "blob") {
      return await response.blob();
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
      return await response.formData();
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
      contentType.includes("multipart/form-data")
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

  error.aborted =
    aborted === true;

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

  if (error?.aborted) {
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
   FETCH INIT
========================================================= */

function createAbortControllerSafe() {
  try {
    if (typeof AbortController !== "undefined") {
      return new AbortController();
    }
  } catch {}

  return null;
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
    if (opts.public === true || opts.skipAuth === true) {
      return false;
    }

    if (opts.auth !== undefined && opts.auth !== null) {
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
      merged.skipAuth === true
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

  async function request(path, options = {}) {
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
      await safeRunHooks(
        getRegistryHookList(registry, "beforeRequest"),
        baseConfig,
        {
          phase:
            "beforeRequest",
          requestId,
          utils,
        }
      );

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
      normalizeHeaders({
        Accept:
          "application/json",
        ...safeObject(
          requestConfig.headers
        ),
      });

    if (
      requestConfig.auth &&
      hasValidToken(state?.token)
    ) {
      setHeader(
        finalHeaders,
        config?.auth?.tokenHeader || "Authorization",
        `${config?.auth?.bearerPrefix || "Bearer"} ${state.token}`
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

    const canDedupe =
      requestConfig.dedupe !== false &&
      BODYLESS_METHODS.includes(method);

    const dedupeKey =
      requestConfig.dedupeKey
        ? safeText(requestConfig.dedupeKey, "")
        : canDedupe
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
                  createAbortTimeout(
                    requestConfig.timeout
                  );

                const signal =
                  mergeAbortSignals([
                    timeout.signal ||
                      timeout.controller?.signal,
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

                  const timeoutAborted =
                    timeout.controller?.signal?.aborted === true &&
                    String(timeout.controller?.signal?.reason || "")
                      .toLowerCase()
                      .includes("timeout");

                  throw buildRequestError({
                    url,
                    method,
                    timeout:
                      isProbablyTimeoutError(error) ||
                      timeoutAborted,
                    aborted:
                      isAbortError(error) ||
                      requestAbortController?.signal?.aborted === true,
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
            await safeRunHooks(
              getRegistryHookList(registry, "afterResponse"),
              data,
              {
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
              }
            );

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
            await safeRunHooks(
              getRegistryHookList(registry, "onRequestError"),
              normalized,
              {
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
              }
            );
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

    delete(path, options = {}) {
      return withMethod(
        "DELETE",
        path,
        null,
        options
      );
    },

    del(path, options = {}) {
      return withMethod(
        "DELETE",
        path,
        null,
        options
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

    request,

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

export default {
  REQUEST_VERSION,

  createRequest,
  createApiClient,

  parseResponseBody,
  buildRequestError,
  shouldRetryRequest,
  executeFetchWithRetry,
};
