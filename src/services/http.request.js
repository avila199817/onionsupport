/* =========================================================
   Onion SPA - HTTP Request Engine
   Archivo: src/services/http.request.js

   ONION SUPPORT · HTTP REQUEST ENGINE
   BASE EXECUTION · RETRY ENGINE · ABORT SAFE · TOKEN SAFE · 15/10

   Responsabilidades:
   - Ejecutar requests base contra AppCore.apiClient / AppCore.request.
   - Aplicar retry policy con backoff + jitter.
   - Emitir eventos internos de intento/retry solo si diagnostics lo pide.
   - Respetar AbortSignal antes, durante y después del retry delay.
   - Normalizar errores para el caller.
   - Evitar retry interno duplicado de AppCore.apiClient.
   - Construir fallback fetch si AppCore.apiClient no está disponible.
   - Serializar body JSON/FormData/raw correctamente en fallback.
   - Parsear respuesta fallback según responseType.
   - No gestionar refresh token.
   - No gestionar logout.
   - No gestionar loader.
   - No ejecutar interceptores.

   HARDENING EXTREMO:
   - Single final error para caller.
   - Abort pre-attempt / during-delay / post-delay.
   - Retry budget por tiempo.
   - Eventos sin tokens reales.
   - Eventos internos opt-in para evitar firebreak storms.
   - AppCore parcial tolerado.
   - apiClient faltante con fallback controlado.
   - Retry-After vía helper.
   - No retry si _skipRetry.
   - No retry si signal abortada.
   - Timeout distinguido de abort manual.
   - Fallback fetch con expectedStatuses.
   - No doble /api si apiBase ya trae /api.
   - No exponer headers/body sensibles en eventos.
   - Evita recursión si AppCore.apiClient/AppCore.request apuntan al Http service.
========================================================= */

import {
  normalizeError,
  buildRetryDelay,
  shouldRetry,
  isAbortError,
  isTimeoutError,
  redactHttpValue,
  headersToPlainObject,
  sanitizeHeaders,
  sanitizeData,
} from "./http.helpers.js";

import {
  delay,
} from "./http.runtime.js";

/* =========================================================
   VERSION
========================================================= */

export const HTTP_REQUEST_ENGINE_VERSION =
  "15.0.0";

/* =========================================================
   MODULE STATE
========================================================= */

let requestSeq =
  0;

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_METHOD =
  "GET";

const DEFAULT_RESPONSE_TYPE =
  "auto";

const BODYLESS_METHODS =
  Object.freeze([
    "GET",
    "HEAD",
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

const REQUEST_EVENTS =
  Object.freeze({
    attempt:
      "http:request:attempt",

    attemptSuccess:
      "http:request:attempt:success",

    attemptError:
      "http:request:attempt:error",

    retry:
      "http:retry",

    retryStop:
      "http:retry:stop",

    retryAborted:
      "http:retry:aborted",

    retryBudgetTimeout:
      "http:retry:budget-timeout",

    engineError:
      "http:request:engine:error",
  });

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

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

function safeObject(value, fallback = {}) {
  return isObject(value)
    ? value
    : fallback;
}

function safeText(value, fallback = "") {
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

function safeUpper(value = "", fallback = DEFAULT_METHOD) {
  return safeText(value, fallback)
    .toUpperCase();
}

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

function isAbsoluteUrl(value = "") {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(
    safeText(value, "")
  );
}

function normalizePath(path = "") {
  const raw =
    safeText(path, "");

  if (!raw) {
    return "";
  }

  if (isAbsoluteUrl(raw)) {
    return raw;
  }

  let output =
    raw.replace(/\\/g, "/");

  if (!output.startsWith("/")) {
    output = `/${output}`;
  }

  output =
    output.replace(/\/{2,}/g, "/");

  if (
    output.length > 1 &&
    output.endsWith("/")
  ) {
    output =
      output.replace(/\/+$/g, "") ||
      "/";
  }

  return output;
}

function getUrlPathname(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  try {
    if (isAbsoluteUrl(raw)) {
      return normalizePath(
        new URL(raw, getBaseOrigin()).pathname || ""
      );
    }

    return normalizePath(raw);
  } catch {
    return normalizePath(raw);
  }
}

function joinUrl(base = "", path = "") {
  const cleanPath =
    safeText(path, "");

  if (!cleanPath) {
    return "";
  }

  if (isAbsoluteUrl(cleanPath)) {
    return cleanPath;
  }

  const normalizedPath =
    normalizePath(cleanPath);

  const cleanBase =
    safeText(base, "")
      .replace(/\/+$/g, "");

  if (!cleanBase) {
    return normalizedPath;
  }

  const basePath =
    getUrlPathname(cleanBase);

  /*
    Evita doble /api:
      apiBase = https://api.onionit.net/api
      path    = /api/auth/login
      => https://api.onionit.net/api/auth/login
  */
  if (
    basePath &&
    basePath !== "/" &&
    (
      normalizedPath === basePath ||
      normalizedPath.startsWith(`${basePath}/`)
    )
  ) {
    try {
      if (isAbsoluteUrl(cleanBase)) {
        const parsed =
          new URL(cleanBase, getBaseOrigin());

        return `${parsed.origin}${normalizedPath}`;
      }
    } catch {}

    return normalizedPath;
  }

  return `${cleanBase}/${normalizedPath.replace(/^\/+/g, "")}`;
}

function looksLikeHttpService(candidate = null) {
  return Boolean(
    candidate &&
      typeof candidate === "object" &&
      (
        candidate.SERVICE_NAME === "http" ||
        candidate.SERVICE_VERSION ||
        candidate.events?.requestStart === "http:request:start"
      ) &&
      isFunction(candidate.request) &&
      isFunction(candidate.get) &&
      isFunction(candidate.post)
  );
}

/* =========================================================
   SIGNAL / ABORT
========================================================= */

function hasAbortSignal(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      "aborted" in value &&
      isFunction(value.addEventListener)
  );
}

function getSignalReason(signal) {
  try {
    return signal?.reason || null;
  } catch {
    return null;
  }
}

function isSignalAborted(signal) {
  try {
    return Boolean(signal?.aborted);
  } catch {
    return false;
  }
}

function createAbortErrorObject(message = "Request aborted", reason = null) {
  if (reason instanceof Error) {
    try {
      reason.aborted =
        true;
    } catch {}

    return reason;
  }

  const finalMessage =
    safeText(
      reason?.message || reason,
      message
    );

  try {
    if (typeof DOMException !== "undefined") {
      const error =
        new DOMException(
          finalMessage,
          "AbortError"
        );

      try {
        error.aborted =
          true;
      } catch {}

      return error;
    }
  } catch {}

  const error =
    new Error(finalMessage);

  error.name =
    "AbortError";

  error.code =
    "ABORT_ERR";

  error.aborted =
    true;

  return error;
}

function createTimeoutErrorObject(message = "Request timeout") {
  const error =
    new Error(message);

  error.name =
    "TimeoutError";

  error.code =
    "REQUEST_TIMEOUT";

  error.timeout =
    true;

  return error;
}

function buildAbortError(signal, requestConfig = {}, message = "Request aborted") {
  const reason =
    getSignalReason(signal);

  return buildEngineError(
    createAbortErrorObject(
      message,
      reason
    ),
    requestConfig,
    {
      aborted:
        true,

      timeout:
        false,
    }
  );
}

function abortSignalAny(signals = []) {
  const validSignals =
    signals.filter(hasAbortSignal);

  if (!validSignals.length) {
    return null;
  }

  try {
    if (typeof AbortSignal !== "undefined" && isFunction(AbortSignal.any)) {
      return AbortSignal.any(validSignals);
    }
  } catch {}

  if (validSignals.length === 1) {
    return validSignals[0];
  }

  if (typeof AbortController === "undefined") {
    return validSignals[0];
  }

  const controller =
    new AbortController();

  const cleanups =
    [];

  function cleanup() {
    for (const dispose of cleanups.splice(0)) {
      try {
        dispose();
      } catch {}
    }
  }

  function abortFrom(signal) {
    if (controller.signal.aborted) {
      return;
    }

    try {
      controller.abort(
        getSignalReason(signal) ||
          createAbortErrorObject()
      );
    } catch {
      try {
        controller.abort();
      } catch {}
    } finally {
      cleanup();
    }
  }

  for (const signal of validSignals) {
    if (signal.aborted) {
      abortFrom(signal);
      break;
    }

    const handler =
      () => abortFrom(signal);

    try {
      signal.addEventListener(
        "abort",
        handler,
        {
          once:
            true,
        }
      );

      cleanups.push(() => {
        signal.removeEventListener(
          "abort",
          handler
        );
      });
    } catch {}
  }

  return controller.signal;
}

function createTimeoutSignal(timeoutMs = 0) {
  const timeout =
    safeNumber(timeoutMs, 0);

  const state = {
    signal:
      null,

    controller:
      null,

    fired:
      false,

    clear:
      () => {},
  };

  if (
    timeout <= 0 ||
    typeof AbortController === "undefined"
  ) {
    return state;
  }

  const controller =
    new AbortController();

  let timer =
    null;

  state.controller =
    controller;

  state.signal =
    controller.signal;

  try {
    timer =
      setTimeout(() => {
        state.fired =
          true;

        try {
          controller.abort(
            createTimeoutErrorObject()
          );
        } catch {
          try {
            controller.abort();
          } catch {}
        }
      }, timeout);
  } catch {}

  state.clear =
    () => {
      try {
        if (timer) {
          clearTimeout(timer);
        }
      } catch {}

      timer =
        null;
    };

  return state;
}

/* =========================================================
   EVENTS / LOGS
========================================================= */

function shouldEmitEngineEvent(AppCore, requestConfig = {}, eventName = "") {
  const cfg =
    safeObject(requestConfig);

  if (cfg.emitEvents === false) {
    return false;
  }

  if (cfg.emitEngineEvents === true) {
    return true;
  }

  if (cfg.emitRequestEngineEvents === true) {
    return true;
  }

  if (cfg.debugEngineEvents === true) {
    return true;
  }

  try {
    return Boolean(
      AppCore?.config?.diagnostics?.httpRequestEngineEvents === true ||
        AppCore?.config?.diagnostics?.httpLifecycleEvents === true ||
        AppCore?.config?.debugHttpRequestEngine === true
    );
  } catch {}

  return false;
}

function safeEmit(AppCore, eventName = "", payload = {}, requestConfig = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  if (!shouldEmitEngineEvent(AppCore, requestConfig, name)) {
    return false;
  }

  try {
    AppCore?.events?.emit?.(
      name,
      sanitizeData({
        version:
          HTTP_REQUEST_ENGINE_VERSION,

        ...safeObject(payload),
      })
    );

    return true;
  } catch {}

  return false;
}

function safeWarn(AppCore, ...args) {
  const safeArgs =
    args.map((item) =>
      sanitizeData(item)
    );

  try {
    AppCore?.utils?.warn?.(
      "[HTTP Request]",
      ...safeArgs
    );

    return;
  } catch {}

  try {
    if (AppCore?.config?.debug || AppCore?.config?.debugHttpRequestEngine) {
      console.warn(
        "[HTTP Request]",
        ...safeArgs
      );
    }
  } catch {}
}

function sanitizeErrorForEvent(error = null) {
  if (!error) {
    return null;
  }

  return sanitizeData({
    name:
      safeText(error.name, "Error"),

    message:
      safeRedact(error.message || ""),

    status:
      safeNumber(error.status, 0),

    statusText:
      safeText(error.statusText, ""),

    code:
      error.code || null,

    method:
      safeText(error.method, ""),

    url:
      safeRedact(error.url || ""),

    path:
      safeRedact(error.path || ""),

    redactedUrl:
      safeRedact(
        error.redactedUrl ||
          error.url ||
          error.path ||
          ""
      ),

    requestId:
      error.requestId || null,

    aborted:
      Boolean(error.aborted),

    timeout:
      Boolean(error.timeout),

    retryable:
      Boolean(error.retryable),

    attempt:
      error.attempt || null,

    attemptIndex:
      error.attemptIndex ?? null,

    elapsedMs:
      error.elapsedMs || null,

    requestConfig:
      error.requestConfig
        ? {
            requestId:
              error.requestConfig.requestId || null,

            method:
              error.requestConfig.method || null,

            path:
              safeRedact(error.requestConfig.path || ""),

            url:
              safeRedact(error.requestConfig.url || ""),

            headers:
              sanitizeHeaders(error.requestConfig.headers || {}),

            auth:
              error.requestConfig.auth !== false,

            public:
              error.requestConfig.public === true,
          }
        : null,
  });
}

function buildAttemptPayload({
  requestId,
  requestConfig,
  attempt,
  startedAt,
  extra = {},
} = {}) {
  return sanitizeData({
    requestId,

    path:
      safeRedact(
        requestConfig?.path ||
          requestConfig?.url ||
          ""
      ),

    method:
      safeUpper(
        requestConfig?.method,
        DEFAULT_METHOD
      ),

    attempt:
      attempt + 1,

    attemptIndex:
      attempt,

    elapsedMs:
      nowMs() - startedAt,

    at:
      isoNow(),

    ...safeObject(extra),
  });
}

/* =========================================================
   ENGINE ERROR
========================================================= */

function buildEngineError(error, requestConfig = {}, patch = {}) {
  const normalized =
    normalizeError(
      error,
      requestConfig
    );

  const timeout =
    patch.timeout ??
    normalized.timeout ??
    isTimeoutError(error) ??
    false;

  const aborted =
    patch.aborted ??
    (
      timeout
        ? false
        : (
            normalized.aborted ??
            isAbortError(error)
          )
    );

  return {
    ...normalized,

    ...safeObject(patch),

    aborted:
      Boolean(aborted),

    timeout:
      Boolean(timeout),
  };
}

function buildInvalidPathError(requestConfig = {}) {
  return normalizeError(
    {
      name:
        "HttpInvalidRequestPath",

      message:
        "HTTP request sin path válido.",

      status:
        0,

      code:
        "HTTP_INVALID_PATH",
    },
    requestConfig
  );
}

function buildApiClientUnavailableError(requestConfig = {}) {
  return normalizeError(
    {
      name:
        "HttpApiClientUnavailable",

      message:
        "No hay motor HTTP disponible: AppCore.apiClient/request/fetch no está disponible.",

      status:
        0,

      code:
        "HTTP_ENGINE_UNAVAILABLE",
    },
    requestConfig
  );
}

function buildRetryBudgetError({
  requestConfig,
  requestId,
  attempt,
  startedAt,
} = {}) {
  const elapsedMs =
    nowMs() - startedAt;

  const error =
    normalizeError(
      {
        name:
          "HttpRetryBudgetTimeout",

        message:
          "Retry budget agotado por tiempo.",

        timeout:
          true,

        code:
          "RETRY_BUDGET_TIMEOUT",

        status:
          0,
      },
      requestConfig
    );

  return {
    ...error,

    requestId,

    attempt:
      attempt + 1,

    attemptIndex:
      attempt,

    elapsedMs,

    timeout:
      true,

    aborted:
      false,
  };
}

/* =========================================================
   URL / QUERY
========================================================= */

function appendQuery(url = "", query = null) {
  if (!query) {
    return url;
  }

  let params =
    null;

  try {
    if (
      typeof URLSearchParams !== "undefined" &&
      query instanceof URLSearchParams
    ) {
      params =
        query;
    } else if (typeof query === "string") {
      params =
        new URLSearchParams(
          query.startsWith("?")
            ? query.slice(1)
            : query
        );
    } else if (isObject(query)) {
      params =
        new URLSearchParams();

      for (const [key, value] of Object.entries(query)) {
        if (
          value === null ||
          value === undefined ||
          value === ""
        ) {
          continue;
        }

        if (Array.isArray(value)) {
          for (const item of value) {
            if (
              item !== null &&
              item !== undefined &&
              item !== ""
            ) {
              params.append(
                key,
                String(item)
              );
            }
          }

          continue;
        }

        if (value instanceof Date) {
          params.set(
            key,
            value.toISOString()
          );

          continue;
        }

        if (typeof value === "object") {
          params.set(
            key,
            JSON.stringify(value)
          );

          continue;
        }

        params.set(
          key,
          String(value)
        );
      }
    }
  } catch {
    params =
      null;
  }

  const queryString =
    params?.toString?.() || "";

  if (!queryString) {
    return url;
  }

  return `${url}${url.includes("?") ? "&" : "?"}${queryString}`;
}

function resolveRequestUrl(AppCore, requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

  const explicitUrl =
    safeText(cfg.url, "");

  if (explicitUrl) {
    if (isAbsoluteUrl(explicitUrl)) {
      return appendQuery(
        explicitUrl,
        cfg.query
      );
    }

    return appendQuery(
      joinUrl(
        safeText(AppCore?.config?.apiBase || "", ""),
        explicitUrl
      ),
      cfg.query
    );
  }

  const path =
    safeText(cfg.path, "");

  if (!path) {
    return "";
  }

  if (isAbsoluteUrl(path)) {
    return appendQuery(
      path,
      cfg.query
    );
  }

  try {
    if (isFunction(AppCore?.utils?.buildUrl)) {
      return appendQuery(
        AppCore.utils.buildUrl(path),
        cfg.query
      );
    }
  } catch {}

  let base =
    "";

  try {
    base =
      safeText(
        cfg.apiBase ||
          AppCore?.config?.apiBase ||
          AppCore?.config?.apiBaseUrl ||
          AppCore?.config?.baseURL ||
          AppCore?.config?.baseUrl ||
          "",
        ""
      );
  } catch {
    base =
      "";
  }

  return appendQuery(
    joinUrl(base, path),
    cfg.query
  );
}

/* =========================================================
   BODY / RESPONSE FALLBACK
========================================================= */

function isFormDataLike(value) {
  try {
    return (
      typeof FormData !== "undefined" &&
      value instanceof FormData
    );
  } catch {
    return false;
  }
}

function isBlobLike(value) {
  try {
    return (
      typeof Blob !== "undefined" &&
      value instanceof Blob
    );
  } catch {
    return false;
  }
}

function isArrayBufferLike(value) {
  try {
    return (
      typeof ArrayBuffer !== "undefined" &&
      value instanceof ArrayBuffer
    );
  } catch {
    return false;
  }
}

function isUrlSearchParamsLike(value) {
  try {
    return (
      typeof URLSearchParams !== "undefined" &&
      value instanceof URLSearchParams
    );
  } catch {
    return false;
  }
}

function isReadableStreamLike(value) {
  try {
    return (
      typeof ReadableStream !== "undefined" &&
      value instanceof ReadableStream
    );
  } catch {
    return false;
  }
}

function hasHeader(headers = {}, name = "") {
  const target =
    safeText(name, "").toLowerCase();

  if (!target) {
    return false;
  }

  const plain =
    headersToPlainObject(headers);

  return Object.keys(plain).some((key) =>
    key.toLowerCase() === target
  );
}

function deleteHeader(headers = {}, name = "") {
  const target =
    safeText(name, "").toLowerCase();

  if (!target) {
    return headers;
  }

  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) {
      delete headers[key];
    }
  }

  return headers;
}

function prepareFallbackBodyAndHeaders(requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

  const headers =
    headersToPlainObject(cfg.headers || {});

  const method =
    safeUpper(cfg.method, DEFAULT_METHOD);

  if (BODYLESS_METHODS.includes(method)) {
    deleteHeader(
      headers,
      "Content-Type"
    );

    deleteHeader(
      headers,
      "content-type"
    );

    return {
      body:
        undefined,

      headers,
    };
  }

  const body =
    cfg.body !== undefined
      ? cfg.body
      : cfg.data !== undefined
        ? cfg.data
        : cfg.payload !== undefined
          ? cfg.payload
          : undefined;

  if (
    body === undefined ||
    body === null
  ) {
    return {
      body:
        undefined,

      headers,
    };
  }

  if (isFormDataLike(body)) {
    deleteHeader(
      headers,
      "Content-Type"
    );

    return {
      body,
      headers,
    };
  }

  if (isUrlSearchParamsLike(body)) {
    if (!hasHeader(headers, "Content-Type")) {
      headers["Content-Type"] =
        "application/x-www-form-urlencoded;charset=UTF-8";
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
    isReadableStreamLike(body) ||
    typeof body === "string"
  ) {
    return {
      body,
      headers,
    };
  }

  if (!hasHeader(headers, "Content-Type")) {
    headers["Content-Type"] =
      "application/json";
  }

  try {
    return {
      body:
        JSON.stringify(body),

      headers,
    };
  } catch {
    return {
      body:
        undefined,

      headers,
    };
  }
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

function contentTypeIncludes(contentType = "", fragments = []) {
  const value =
    safeText(contentType, "")
      .toLowerCase();

  return fragments.some((fragment) =>
    value.includes(fragment)
  );
}

async function parseFallbackResponse(response, requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

  const responseType =
    safeText(
      cfg.responseType,
      DEFAULT_RESPONSE_TYPE
    ).toLowerCase();

  if (
    responseType === "response" ||
    responseType === "raw" ||
    cfg.raw === true
  ) {
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
    return isFunction(response.blob)
      ? response.blob()
      : response.arrayBuffer();
  }

  if (
    responseType === "arraybuffer" ||
    responseType === "arrayBuffer"
  ) {
    return response.arrayBuffer();
  }

  if (responseType === "formdata") {
    return isFunction(response.formData)
      ? response.formData()
      : null;
  }

  if (responseType === "text") {
    return response.text();
  }

  const contentType =
    safeText(
      response.headers?.get?.("content-type"),
      ""
    ).toLowerCase();

  if (
    responseType === "json" ||
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
    return response.formData();
  }

  if (
    contentTypeIncludes(
      contentType,
      BINARY_CONTENT_TYPES
    )
  ) {
    return response.arrayBuffer();
  }

  if (
    contentTypeIncludes(
      contentType,
      TEXT_CONTENT_TYPES
    )
  ) {
    return response.text();
  }

  try {
    return response.text();
  } catch {
    return null;
  }
}

function responseHeadersToObject(response) {
  const output = {};

  try {
    response?.headers?.forEach?.((value, key) => {
      output[key] =
        value;
    });
  } catch {}

  return output;
}

function extractErrorMessageFromData(data = null, fallback = "") {
  if (!data) {
    return fallback;
  }

  if (typeof data === "string") {
    return data || fallback;
  }

  if (!isObject(data)) {
    return safeText(data, fallback);
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
    safeText(errors?.[0], "") ||
    fallback
  );
}

function isExpectedStatus(status, expectedStatuses = []) {
  if (!Array.isArray(expectedStatuses)) {
    return false;
  }

  const numeric =
    safeNumber(status, 0);

  return expectedStatuses
    .map((item) =>
      safeNumber(item, -1)
    )
    .includes(numeric);
}

function buildFallbackFetchError({
  response,
  data,
  requestConfig,
  url,
} = {}) {
  return normalizeError(
    {
      name:
        "HttpFetchError",

      message:
        extractErrorMessageFromData(
          data,
          response?.statusText ||
            `HTTP ${response?.status || 0}`
        ),

      status:
        response?.status || 0,

      statusText:
        response?.statusText || "",

      data,

      headers:
        responseHeadersToObject(response),

      url:
        safeRedact(url),

      method:
        requestConfig?.method || DEFAULT_METHOD,

      requestId:
        requestConfig?.requestId || null,
    },
    requestConfig
  );
}

/* =========================================================
   EXECUTION ADAPTERS
========================================================= */

function buildCoreRequestOptions(requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

  return {
    method:
      safeUpper(cfg.method, DEFAULT_METHOD),

    body:
      cfg.body !== undefined
        ? cfg.body
        : cfg.data !== undefined
          ? cfg.data
          : null,

    headers:
      cfg.headers ?? {},

    auth:
      cfg.auth !== false &&
      cfg.public !== true,

    public:
      cfg.public === true,

    timeout:
      cfg.timeout,

    raw:
      cfg.raw === true,

    rawBody:
      cfg.rawBody === true,

    upload:
      cfg.upload === true,

    responseType:
      cfg.responseType || DEFAULT_RESPONSE_TYPE,

    query:
      cfg.query ?? null,

    params:
      cfg.params ?? null,

    credentials:
      cfg.credentials,

    signal:
      cfg.signal,

    expectedStatuses:
      cfg.expectedStatuses || [],

    /*
      El service engine gestiona retry.
      Core/apiClient debe ejecutar un solo intento.
    */
    emitEvents:
      cfg.emitCoreEvents === true,

    emitLifecycleEvents:
      false,

    emitStartEvent:
      false,

    emitRetryEvents:
      false,

    emitDedupeEvents:
      false,

    emitFinalEvents:
      cfg.emitCoreFinalEvents === true,

    storeError:
      cfg.storeCoreError === true,

    silent:
      cfg.silent === true,

    retries:
      0,

    retry:
      false,

    _skipRetry:
      true,

    dedupe:
      cfg.dedupe !== false,

    requestId:
      cfg.requestId || null,
  };
}

function getRequestTarget(requestConfig = {}) {
  return (
    safeText(requestConfig.path, "") ||
    safeText(requestConfig.url, "")
  );
}

async function executeViaApiClient(AppCore, requestConfig = {}) {
  const apiClient =
    AppCore?.apiClient;

  if (
    !apiClient ||
    !isFunction(apiClient.request) ||
    looksLikeHttpService(apiClient)
  ) {
    return {
      available:
        false,

      value:
        null,
    };
  }

  const cfg =
    safeObject(requestConfig);

  const target =
    getRequestTarget(cfg);

  const options =
    buildCoreRequestOptions(cfg);

  const result =
    await apiClient.request(
      target,
      options
    );

  return {
    available:
      true,

    value:
      result,
  };
}

async function executeViaCoreRequest(AppCore, requestConfig = {}) {
  if (
    !isFunction(AppCore?.request) ||
    AppCore?.request === requestConfig?.serviceRequest
  ) {
    return {
      available:
        false,

      value:
        null,
    };
  }

  const cfg =
    safeObject(requestConfig);

  const target =
    getRequestTarget(cfg);

  const result =
    await AppCore.request(
      target,
      buildCoreRequestOptions(cfg)
    );

  return {
    available:
      true,

      value:
        result,
    };
}

async function executeViaFetch(AppCore, requestConfig = {}) {
  if (typeof fetch !== "function") {
    return {
      available:
        false,

      value:
        null,
    };
  }

  const cfg =
    safeObject(requestConfig);

  const url =
    resolveRequestUrl(
      AppCore,
      cfg
    );

  if (!url) {
    throw buildInvalidPathError(cfg);
  }

  const timeout =
    createTimeoutSignal(cfg.timeout);

  const signal =
    abortSignalAny([
      cfg.signal,
      timeout.signal,
    ]);

  const prepared =
    prepareFallbackBodyAndHeaders(cfg);

  try {
    const init = {
      method:
        safeUpper(cfg.method, DEFAULT_METHOD),

      headers:
        prepared.headers,
    };

    if (prepared.body !== undefined) {
      init.body =
        prepared.body;
    }

    if (cfg.credentials !== undefined) {
      init.credentials =
        cfg.credentials;
    }

    if (signal) {
      init.signal =
        signal;
    }

    if (cfg.cache !== undefined) {
      init.cache =
        cfg.cache;
    }

    if (cfg.mode !== undefined) {
      init.mode =
        cfg.mode;
    }

    if (cfg.redirect !== undefined) {
      init.redirect =
        cfg.redirect;
    }

    if (cfg.referrerPolicy !== undefined) {
      init.referrerPolicy =
        cfg.referrerPolicy;
    }

    if (cfg.keepalive !== undefined) {
      init.keepalive =
        cfg.keepalive;
    }

    const response =
      await fetch(
        url,
        init
      );

    const data =
      await parseFallbackResponse(
        response,
        cfg
      );

    const expected =
      isExpectedStatus(
        response.status,
        cfg.expectedStatuses
      );

    if (
      !response.ok &&
      !expected
    ) {
      throw buildFallbackFetchError({
        response,
        data,
        requestConfig:
          cfg,
        url,
      });
    }

    return {
      available:
        true,

      value:
        data,
    };
  } catch (error) {
    const timeoutAborted =
      Boolean(timeout.fired === true || timeout.signal?.aborted);

    const manualAborted =
      Boolean(
        cfg.signal?.aborted &&
          !timeoutAborted
      );

    if (timeoutAborted) {
      throw buildEngineError(
        error,
        cfg,
        {
          timeout:
            true,

          aborted:
            false,
        }
      );
    }

    if (manualAborted || isAbortError(error)) {
      throw buildEngineError(
        error,
        cfg,
        {
          aborted:
            true,

          timeout:
            false,
        }
      );
    }

    throw error;
  } finally {
    timeout.clear();
  }
}

/* =========================================================
   BASE REQUEST
========================================================= */

export async function executeBaseRequest(AppCore, requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

  if (!safeText(cfg.path || cfg.url, "")) {
    throw buildInvalidPathError(cfg);
  }

  if (isSignalAborted(cfg.signal)) {
    throw buildAbortError(
      cfg.signal,
      cfg,
      "Request aborted before base request"
    );
  }

  try {
    const apiClientResult =
      await executeViaApiClient(
        AppCore,
        cfg
      );

    if (apiClientResult.available) {
      return apiClientResult.value;
    }
  } catch (error) {
    throw buildEngineError(
      error,
      cfg
    );
  }

  try {
    const coreRequestResult =
      await executeViaCoreRequest(
        AppCore,
        cfg
      );

    if (coreRequestResult.available) {
      return coreRequestResult.value;
    }
  } catch (error) {
    throw buildEngineError(
      error,
      cfg
    );
  }

  try {
    const fetchResult =
      await executeViaFetch(
        AppCore,
        cfg
      );

    if (fetchResult.available) {
      return fetchResult.value;
    }
  } catch (error) {
    throw buildEngineError(
      error,
      cfg
    );
  }

  throw buildApiClientUnavailableError(cfg);
}

/* =========================================================
   RETRY BUDGET
========================================================= */

function isRetryBudgetExceeded(startedAt, maxElapsedMs = 0) {
  const budget =
    safeNumber(maxElapsedMs, 0);

  if (budget <= 0) {
    return false;
  }

  return nowMs() - startedAt >= budget;
}

/* =========================================================
   RETRY DELAY
========================================================= */

async function waitForRetry(AppCore, waitMs = 0, signal = null, requestConfig = {}) {
  const ms =
    Math.max(
      0,
      safeNumber(waitMs, 0)
    );

  if (isSignalAborted(signal)) {
    throw buildAbortError(
      signal,
      requestConfig,
      "Request aborted before retry delay"
    );
  }

  if (ms <= 0) {
    return true;
  }

  if (isFunction(delay)) {
    return delay(
      AppCore,
      ms,
      signal,
      {
        source:
          "http.request:retry-delay",

        requestId:
          requestConfig?.requestId || null,
      }
    );
  }

  return new Promise((resolve, reject) => {
    let settled =
      false;

    let timer =
      null;

    const cleanup = () => {
      try {
        if (timer) {
          clearTimeout(timer);
        }
      } catch {}

      try {
        signal?.removeEventListener?.(
          "abort",
          onAbort
        );
      } catch {}

      timer =
        null;
    };

    const onAbort = () => {
      if (settled) {
        return;
      }

      settled =
        true;

      cleanup();

      reject(
        buildAbortError(
          signal,
          requestConfig,
          "Request aborted during retry delay"
        )
      );
    };

    try {
      timer =
        setTimeout(() => {
          if (settled) {
            return;
          }

          settled =
            true;

          cleanup();
          resolve(true);
        }, ms);

      signal?.addEventListener?.(
        "abort",
        onAbort,
        {
          once:
            true,
        }
      );
    } catch (error) {
      settled =
        true;

      cleanup();
      reject(error);
    }
  });
}

/* =========================================================
   RETRY ENGINE
========================================================= */

export async function executeWithRetry({
  AppCore,
  config,
  requestConfig = {},
} = {}) {
  const cfg =
    safeObject(requestConfig);

  const requestId =
    cfg.requestId ||
    nextRequestId();

  cfg.requestId =
    requestId;

  cfg.method =
    safeUpper(
      cfg.method,
      DEFAULT_METHOD
    );

  const startedAt =
    safeNumber(
      cfg.startedAt ||
        cfg._startedAt,
      nowMs()
    );

  cfg.startedAt =
    startedAt;

  cfg._startedAt =
    startedAt;

  const maxElapsedMs =
    safeNumber(
      cfg.maxElapsedMs,
      0
    );

  let attempt =
    0;

  let lastError =
    null;

  while (true) {
    if (isSignalAborted(cfg.signal)) {
      lastError =
        buildAbortError(
          cfg.signal,
          cfg,
          "Request aborted before attempt"
        );

      lastError.requestId =
        requestId;

      lastError.attempt =
        attempt + 1;

      lastError.attemptIndex =
        attempt;

      lastError.elapsedMs =
        nowMs() - startedAt;

      throw lastError;
    }

    if (
      isRetryBudgetExceeded(
        startedAt,
        maxElapsedMs
      )
    ) {
      lastError =
        buildRetryBudgetError({
          requestConfig:
            cfg,

          requestId,
          attempt,
          startedAt,
        });

      safeEmit(
        AppCore,
        REQUEST_EVENTS.retryBudgetTimeout,
        buildAttemptPayload({
          requestId,
          requestConfig:
            cfg,
          attempt,
          startedAt,
          extra: {
            maxElapsedMs,

            error:
              sanitizeErrorForEvent(lastError),
          },
        }),
        cfg
      );

      throw lastError;
    }

    safeEmit(
      AppCore,
      REQUEST_EVENTS.attempt,
      buildAttemptPayload({
        requestId,
        requestConfig:
          cfg,
        attempt,
        startedAt,
      }),
      cfg
    );

    try {
      const response =
        await executeBaseRequest(
          AppCore,
          cfg
        );

      safeEmit(
        AppCore,
        REQUEST_EVENTS.attemptSuccess,
        buildAttemptPayload({
          requestId,
          requestConfig:
            cfg,
          attempt,
          startedAt,
        }),
        cfg
      );

      return response;
    } catch (error) {
      lastError =
        buildEngineError(
          error,
          cfg,
          {
            requestId,

            attempt:
              attempt + 1,

            attemptIndex:
              attempt,

            elapsedMs:
              nowMs() - startedAt,
          }
        );

      if (isAbortError(lastError)) {
        lastError.aborted =
          true;
      }

      if (isTimeoutError(lastError)) {
        lastError.timeout =
          true;
        lastError.aborted =
          false;
      }

      safeEmit(
        AppCore,
        REQUEST_EVENTS.attemptError,
        buildAttemptPayload({
          requestId,
          requestConfig:
            cfg,
          attempt,
          startedAt,
          extra: {
            error:
              sanitizeErrorForEvent(lastError),
          },
        }),
        cfg
      );

      const canRetry =
        shouldRetry(
          config,
          lastError,
          cfg,
          attempt
        );

      if (!canRetry) {
        safeEmit(
          AppCore,
          REQUEST_EVENTS.retryStop,
          buildAttemptPayload({
            requestId,
            requestConfig:
              cfg,
            attempt,
            startedAt,
            extra: {
              reason:
                cfg._skipRetry === true
                  ? "skip-retry"
                  : lastError.aborted
                    ? "aborted"
                    : lastError.timeout
                      ? "timeout-not-retryable"
                      : "not-retryable",

              error:
                sanitizeErrorForEvent(lastError),
            },
          }),
          cfg
        );

        break;
      }

      let waitMs =
        buildRetryDelay(
          config,
          cfg,
          attempt,
          lastError
        );

      waitMs =
        Math.max(
          0,
          safeNumber(waitMs, 0)
        );

      if (maxElapsedMs > 0) {
        const elapsed =
          nowMs() - startedAt;

        const remaining =
          Math.max(
            0,
            maxElapsedMs - elapsed
          );

        if (remaining <= 0) {
          lastError =
            buildRetryBudgetError({
              requestConfig:
                cfg,

              requestId,
              attempt,
              startedAt,
            });

          safeEmit(
            AppCore,
            REQUEST_EVENTS.retryBudgetTimeout,
            buildAttemptPayload({
              requestId,
              requestConfig:
                cfg,
              attempt,
              startedAt,
              extra: {
                maxElapsedMs,

                error:
                  sanitizeErrorForEvent(lastError),
              },
            }),
            cfg
          );

          break;
        }

        waitMs =
          Math.min(
            waitMs,
            remaining
          );
      }

      safeEmit(
        AppCore,
        REQUEST_EVENTS.retry,
        buildAttemptPayload({
          requestId,
          requestConfig:
            cfg,
          attempt,
          startedAt,
          extra: {
            nextAttempt:
              attempt + 2,

            waitMs,

            error:
              sanitizeErrorForEvent(lastError),
          },
        }),
        cfg
      );

      try {
        cfg?.onRetry?.({
          requestId,

          path:
            cfg.path,

          redactedPath:
            safeRedact(cfg.path || cfg.url || ""),

          method:
            cfg.method,

          attempt:
            attempt + 1,

          attemptIndex:
            attempt,

          nextAttempt:
            attempt + 2,

          waitMs,

          elapsedMs:
            nowMs() - startedAt,

          error:
            lastError,
        });
      } catch (retryCallbackError) {
        safeWarn(
          AppCore,
          "onRetry callback falló.",
          retryCallbackError
        );
      }

      try {
        await waitForRetry(
          AppCore,
          waitMs,
          cfg.signal,
          cfg
        );
      } catch (delayError) {
        lastError =
          buildEngineError(
            delayError,
            cfg,
            {
              requestId,

              attempt:
                attempt + 1,

              attemptIndex:
                attempt,

              elapsedMs:
                nowMs() - startedAt,

              aborted:
                true,

              timeout:
                false,
            }
          );

        safeEmit(
          AppCore,
          REQUEST_EVENTS.retryAborted,
          buildAttemptPayload({
            requestId,
            requestConfig:
              cfg,
            attempt,
            startedAt,
            extra: {
              waitMs,

              error:
                sanitizeErrorForEvent(lastError),
            },
          }),
          cfg
        );

        break;
      }

      if (isSignalAborted(cfg.signal)) {
        lastError =
          buildAbortError(
            cfg.signal,
            cfg,
            "Request aborted after retry delay"
          );

        lastError.requestId =
          requestId;

        lastError.attempt =
          attempt + 1;

        lastError.attemptIndex =
          attempt;

        lastError.elapsedMs =
          nowMs() - startedAt;

        break;
      }

      attempt += 1;
    }
  }

  if (!lastError) {
    lastError =
      normalizeError(
        {
          name:
            "HttpRequestFailed",

          message:
            "HTTP request failed.",

          status:
            0,

          code:
            "HTTP_REQUEST_FAILED",
        },
        cfg
      );
  }

  if (isAbortError(lastError)) {
    lastError.aborted =
      true;
  }

  if (isTimeoutError(lastError)) {
    lastError.timeout =
      true;
    lastError.aborted =
      false;
  }

  lastError.requestId =
    requestId;

  lastError.elapsedMs =
    nowMs() - startedAt;

  lastError.path =
    safeRedact(
      cfg.path || cfg.url || ""
    );

  lastError.requestConfig =
    lastError.requestConfig || {
      requestId,
      method:
        cfg.method || DEFAULT_METHOD,
      path:
        cfg.path || "",
      url:
        cfg.url || "",
      headers:
        sanitizeHeaders(cfg.headers || {}),
      auth:
        cfg.auth !== false,
      public:
        cfg.public === true,
    };

  safeEmit(
    AppCore,
    REQUEST_EVENTS.engineError,
    {
      requestId,

      path:
        safeRedact(cfg.path || cfg.url || ""),

      method:
        cfg.method || DEFAULT_METHOD,

      elapsedMs:
        lastError.elapsedMs,

      error:
        sanitizeErrorForEvent(lastError),
    },
    cfg
  );

  throw lastError;
}

/* =========================================================
   DEBUG
========================================================= */

export function getHttpRequestEngineSnapshot() {
  return {
    version:
      HTTP_REQUEST_ENGINE_VERSION,

    requestSeq,
  };
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
