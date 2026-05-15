/* =========================================================
   Onion SPA - HTTP Request Engine
   Archivo: src/services/http.request.js

   ONION SUPPORT · HTTP REQUEST ENGINE
   BASE EXECUTION · RETRY ENGINE · ABORT SAFE · TOKEN SAFE · 17/10

   Responsabilidades:
   - Ejecutar requests base contra AppCore.apiClient / AppCore.request / fetch.
   - Aplicar retry policy con backoff + jitter.
   - Emitir eventos internos de intento/retry sólo si diagnostics lo pide.
   - Respetar AbortSignal antes, durante y después del retry delay.
   - Normalizar errores para el caller.
   - Evitar retry interno duplicado de AppCore.apiClient.
   - Construir fallback fetch si AppCore.apiClient no está disponible.
   - Serializar body JSON/FormData/raw correctamente en fallback.
   - Parsear respuesta fallback según responseType.
   - Adjuntar Authorization sólo en fallback privado cuando proceda.
   - Eliminar Authorization en requests públicas/auth:false/noAuthHeader.
   - No gestionar refresh token.
   - No gestionar logout.
   - No gestionar loader.
   - No ejecutar interceptores.

   HARDENING EXTREMO:
   - Single final error para caller.
   - Abort pre-attempt / during-delay / post-delay.
   - Timeout real también para apiClient/AppCore.request si no respetan signal.
   - Retry budget por tiempo.
   - Eventos sin tokens reales.
   - Eventos internos opt-in para evitar firebreak storms.
   - AppCore parcial tolerado.
   - apiClient faltante con fallback controlado.
   - Retry-After vía helper.
   - No retry si _skipRetry/skipRetry/retry:false/retries:0.
   - No retry interno de 401 salvo retry401:true explícito.
   - No retry en auth público salvo retryPublicAuth:true explícito.
   - No retry si signal abortada.
   - Timeout distinguido de abort manual.
   - Fallback fetch con expectedStatuses.
   - No doble /api si apiBase ya trae /api.
   - No exponer headers/body sensibles en eventos.
   - Evita recursión si AppCore.apiClient/AppCore.request apuntan al Http service.
   - No emite objetos raw/response/request completos.
   - Eventos y snapshots pasan por sanitizeData circular-safe.
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

import {
  delay,
} from "./http.runtime.js";

/* =========================================================
   VERSION
========================================================= */

export const HTTP_REQUEST_ENGINE_VERSION =
  "17.0.0";

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

const DEFAULT_API_BASE =
  "https://api.onionit.net";

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

const AUTH_HEADER_NAMES =
  Object.freeze([
    "Authorization",
    "authorization",
    "X-Auth-Token",
    "x-auth-token",
    "X-Access-Token",
    "x-access-token",
    "X-Refresh-Token",
    "x-refresh-token",
  ]);

const BAD_TOKEN_VALUES =
  Object.freeze([
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

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
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

function safeLower(value = "", fallback = "") {
  return safeText(value, fallback)
    .toLowerCase();
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

function firstNonEmpty(...values) {
  for (const value of values) {
    const text =
      safeText(value, "");

    if (text) {
      return text;
    }
  }

  return "";
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
    output =
      `/${output}`;
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

function normalizeApiBase(base = "") {
  const raw =
    safeText(base, "");

  if (
    !raw ||
    raw === "/"
  ) {
    return "";
  }

  if (
    raw === "/api" ||
    raw === "api"
  ) {
    return "";
  }

  if (!isAbsoluteUrl(raw)) {
    return raw.replace(/\/+$/g, "");
  }

  try {
    const parsed =
      new URL(raw);

    const origin =
      parsed.origin.replace(/\/+$/g, "");

    const pathname =
      normalizePath(parsed.pathname || "/");

    if (
      pathname === "/" ||
      pathname === "/api"
    ) {
      return origin;
    }

    return `${origin}${pathname}`.replace(/\/+$/g, "");
  } catch {
    return "";
  }
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
    normalizeApiBase(base);

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

function getFetchFunction() {
  try {
    if (
      typeof globalThis !== "undefined" &&
      isFunction(globalThis.fetch)
    ) {
      return globalThis.fetch.bind(globalThis);
    }
  } catch {}

  try {
    if (
      typeof window !== "undefined" &&
      isFunction(window.fetch)
    ) {
      return window.fetch.bind(window);
    }
  } catch {}

  return null;
}

function getRequestPath(requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

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
   TOKEN HELPERS
========================================================= */

function stripBearer(token = "") {
  return safeText(token, "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function hasUsableToken(token = "") {
  const value =
    stripBearer(token);

  if (!value) {
    return false;
  }

  const lower =
    value.toLowerCase();

  if (BAD_TOKEN_VALUES.includes(lower)) {
    return false;
  }

  if (/[\s\r\n\t]/.test(value)) {
    return false;
  }

  return true;
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

function getHeaderValue(headers = {}, name = "") {
  const target =
    safeText(name, "").toLowerCase();

  if (!target) {
    return "";
  }

  const plain =
    headersToPlainObject(headers);

  for (const [key, value] of Object.entries(plain)) {
    if (key.toLowerCase() === target) {
      return safeText(value, "");
    }
  }

  return "";
}

function setHeader(headers = {}, name = "", value = "") {
  const cleanName =
    safeText(name, "");

  if (!cleanName) {
    return headers;
  }

  headers[cleanName] =
    value;

  return headers;
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

function stripAuthHeaders(headers = {}) {
  for (const name of AUTH_HEADER_NAMES) {
    deleteHeader(
      headers,
      name
    );
  }

  return headers;
}

function shouldStripAuthHeaders(requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

  return Boolean(
    cfg.public === true ||
      cfg.auth === false ||
      cfg.skipAuth === true ||
      cfg.noAuthHeader === true
  );
}

function getCoreState(AppCore) {
  try {
    if (isFunction(AppCore?.getState)) {
      return AppCore.getState({
        includeToken:
          true,
      });
    }
  } catch {}

  try {
    return AppCore?.state || {};
  } catch {
    return {};
  }
}

function getAuthHeaderFromCore(AppCore) {
  try {
    if (isFunction(AppCore?.getAuthHeader)) {
      const header =
        AppCore.getAuthHeader();

      if (
        header &&
        typeof header === "object"
      ) {
        return header;
      }
    }
  } catch {}

  try {
    if (isFunction(AppCore?.auth?.getAuthHeader)) {
      const header =
        AppCore.auth.getAuthHeader();

      if (
        header &&
        typeof header === "object"
      ) {
        return header;
      }
    }
  } catch {}

  return {};
}

function getStateToken(AppCore) {
  const state =
    getCoreState(AppCore);

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
  const cfg =
    safeObject(requestConfig);

  if (shouldStripAuthHeaders(cfg)) {
    return stripAuthHeaders(headers);
  }

  if (hasHeader(headers, "Authorization")) {
    return headers;
  }

  const coreHeader =
    getAuthHeaderFromCore(AppCore);

  const explicitAuthorization =
    getHeaderValue(coreHeader, "Authorization");

  if (explicitAuthorization) {
    setHeader(
      headers,
      "Authorization",
      explicitAuthorization
    );

    return headers;
  }

  const token =
    getStateToken(AppCore);

  if (hasUsableToken(token)) {
    setHeader(
      headers,
      "Authorization",
      `Bearer ${stripBearer(token)}`
    );
  }

  return headers;
}

/* =========================================================
   RECURSION GUARDS
========================================================= */

function functionEquals(a, b) {
  if (!a || !b) {
    return false;
  }

  try {
    return a === b;
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
      isFunction(candidate.request) &&
      (
        isFunction(candidate.get) ||
        isFunction(candidate.post)
      )
  );
}

function isForbiddenEngineCandidate(candidate = null, requestConfig = {}) {
  if (!candidate) {
    return true;
  }

  const cfg =
    safeObject(requestConfig);

  const serviceRefs = [
    cfg.service,
    cfg.httpService,
    cfg.Http,
    cfg.http,
    cfg.client,
    cfg.serviceClient,
  ].filter(Boolean);

  if (serviceRefs.some((item) => item === candidate)) {
    return true;
  }

  if (
    isFunction(candidate) &&
    (
      functionEquals(candidate, cfg.serviceRequest) ||
      functionEquals(candidate, cfg.httpRequest) ||
      functionEquals(candidate, cfg.request)
    )
  ) {
    return true;
  }

  if (
    isObject(candidate) &&
    (
      functionEquals(candidate.request, cfg.serviceRequest) ||
      functionEquals(candidate.request, cfg.httpRequest)
    )
  ) {
    return true;
  }

  if (looksLikeHttpService(candidate)) {
    return true;
  }

  return false;
}

/* =========================================================
   SIGNAL / ABORT / TIMEOUT
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
    safeArray(signals)
      .filter(hasAbortSignal);

  if (!validSignals.length) {
    return null;
  }

  try {
    if (
      typeof AbortSignal !== "undefined" &&
      isFunction(AbortSignal.any)
    ) {
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
        try {
          signal.removeEventListener(
            "abort",
            handler
          );
        } catch {}
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

async function runAbortableOperation(AppCore, executor, requestConfig = {}, label = "operation") {
  const cfg =
    safeObject(requestConfig);

  const timeout =
    createTimeoutSignal(cfg.timeout);

  const signal =
    abortSignalAny([
      cfg.signal,
      timeout.signal,
    ]);

  const operationConfig =
    signal
      ? {
          ...cfg,
          signal,
        }
      : cfg;

  if (!signal) {
    try {
      return await executor(operationConfig);
    } finally {
      timeout.clear();
    }
  }

  if (isSignalAborted(signal)) {
    timeout.clear();

    if (timeout.fired === true) {
      throw buildEngineError(
        createTimeoutErrorObject(`${label} timeout`),
        cfg,
        {
          timeout:
            true,

          aborted:
            false,
        }
      );
    }

    throw buildAbortError(
      signal,
      cfg,
      `${label} aborted before execution`
    );
  }

  return new Promise((resolve, reject) => {
    let settled =
      false;

    const cleanup = () => {
      try {
        signal.removeEventListener?.(
          "abort",
          onAbort
        );
      } catch {}

      timeout.clear();
    };

    const onAbort = () => {
      if (settled) {
        return;
      }

      settled =
        true;

      cleanup();

      if (timeout.fired === true) {
        reject(
          buildEngineError(
            createTimeoutErrorObject(`${label} timeout`),
            cfg,
            {
              timeout:
                true,

              aborted:
                false,
            }
          )
        );

        return;
      }

      reject(
        buildAbortError(
          signal,
          cfg,
          `${label} aborted`
        )
      );
    };

    try {
      signal.addEventListener?.(
        "abort",
        onAbort,
        {
          once:
            true,
        }
      );
    } catch {}

    Promise.resolve()
      .then(() =>
        executor(operationConfig)
      )
      .then((value) => {
        if (settled) {
          return;
        }

        settled =
          true;

        cleanup();

        resolve(value);
      })
      .catch((error) => {
        if (settled) {
          return;
        }

        settled =
          true;

        cleanup();

        reject(error);
      });
  });
}

/* =========================================================
   EVENTS / LOGS
========================================================= */

function shouldEmitEngineEvent(AppCore, requestConfig = {}) {
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

  if (!shouldEmitEngineEvent(AppCore, requestConfig)) {
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
    if (
      AppCore?.config?.debug ||
      AppCore?.config?.debugHttpRequestEngine
    ) {
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
        getRequestPath(requestConfig)
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

function mergeQueryAndParams(requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

  if (
    cfg.query &&
    cfg.params &&
    isObject(cfg.query) &&
    isObject(cfg.params)
  ) {
    return {
      ...cfg.params,
      ...cfg.query,
    };
  }

  return cfg.query ?? cfg.params ?? null;
}

function resolveApiBase(AppCore, requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

  const fromConfig =
    safeText(
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

  const normalized =
    normalizeApiBase(fromConfig);

  if (normalized) {
    return normalized;
  }

  return DEFAULT_API_BASE;
}

function resolveRequestUrl(AppCore, requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

  const explicitUrl =
    safeText(cfg.url, "");

  const query =
    mergeQueryAndParams(cfg);

  const base =
    resolveApiBase(
      AppCore,
      cfg
    );

  if (explicitUrl) {
    if (isAbsoluteUrl(explicitUrl)) {
      return appendQuery(
        explicitUrl,
        query
      );
    }

    return appendQuery(
      joinUrl(
        base,
        explicitUrl
      ),
      query
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
      query
    );
  }

  try {
    if (isFunction(AppCore?.utils?.buildUrl)) {
      const built =
        AppCore.utils.buildUrl(path);

      if (safeText(built, "")) {
        return appendQuery(
          built,
          query
        );
      }
    }
  } catch {}

  return appendQuery(
    joinUrl(
      base,
      path
    ),
    query
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

function isArrayBufferViewLike(value) {
  try {
    return (
      typeof ArrayBuffer !== "undefined" &&
      ArrayBuffer.isView?.(value)
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

function prepareFallbackBodyAndHeaders(AppCore, requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

  const headers =
    normalizeHeaders(
      cfg.headers || {}
    );

  const method =
    safeUpper(cfg.method, DEFAULT_METHOD);

  applyAuthHeaderPolicy(
    AppCore,
    headers,
    cfg
  );

  if (!hasHeader(headers, "Accept")) {
    headers.Accept =
      "application/json";
  }

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

    deleteHeader(
      headers,
      "content-type"
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

  const rawResponseType =
    safeText(
      cfg.responseType,
      DEFAULT_RESPONSE_TYPE
    );

  const responseType =
    rawResponseType.toLowerCase();

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

  if (responseType === "arraybuffer") {
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
      return text;
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
    const text =
      await response.text();

    if (!safeText(text, "")) {
      return null;
    }

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

  const nestedError =
    isObject(data.error)
      ? data.error
      : null;

  return (
    safeText(data.message, "") ||
    safeText(data.mensaje, "") ||
    safeText(nestedError?.message, "") ||
    safeText(nestedError?.mensaje, "") ||
    safeText(nestedError?.detail, "") ||
    safeText(nestedError?.code, "") ||
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
      cfg.public !== true &&
      cfg.skipAuth !== true &&
      cfg.noAuthHeader !== true,

    public:
      cfg.public === true,

    skipAuth:
      cfg.skipAuth === true,

    noAuthHeader:
      cfg.noAuthHeader === true,

    timeout:
      cfg.timeout,

    raw:
      cfg.raw === true,

    rawBody:
      cfg.rawBody === true,

    upload:
      cfg.upload === true,

    download:
      cfg.download === true,

    responseType:
      cfg.responseType || DEFAULT_RESPONSE_TYPE,

    query:
      cfg.query ?? null,

    params:
      cfg.params ?? null,

    credentials:
      cfg.credentials,

    cache:
      cfg.cache,

    mode:
      cfg.mode,

    redirect:
      cfg.redirect,

    referrerPolicy:
      cfg.referrerPolicy,

    keepalive:
      cfg.keepalive,

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

    retryUnsafe:
      false,

    retryUnsafeMethods:
      false,

    _skipRetry:
      true,

    skipRetry:
      true,

    _skipAuthRefresh:
      cfg._skipAuthRefresh === true ||
      cfg.skipAuthRefresh === true,

    skipAuthRefresh:
      cfg._skipAuthRefresh === true ||
      cfg.skipAuthRefresh === true,

    noAutoRefresh:
      cfg.noAutoRefresh === true ||
      cfg.autoRefresh === false,

    autoRefresh:
      cfg.autoRefresh === false
        ? false
        : cfg.noAutoRefresh === true
          ? false
          : undefined,

    noAutoLogout:
      cfg.noAutoLogout === true ||
      cfg.autoLogout === false,

    autoLogout:
      cfg.autoLogout === false
        ? false
        : cfg.noAutoLogout === true
          ? false
          : undefined,

    dedupe:
      cfg.dedupe !== false,

    requestId:
      cfg.requestId || null,
  };
}

function getRequestTarget(requestConfig = {}) {
  return getRequestPath(requestConfig);
}

async function executeViaMethodClient(client, requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

  const method =
    safeUpper(cfg.method, DEFAULT_METHOD);

  const target =
    getRequestTarget(cfg);

  const options =
    buildCoreRequestOptions(cfg);

  if (
    method === "GET" &&
    isFunction(client.get)
  ) {
    return client.get(target, options);
  }

  if (
    method === "HEAD" &&
    isFunction(client.head)
  ) {
    return client.head(target, options);
  }

  if (
    method === "OPTIONS" &&
    isFunction(client.options)
  ) {
    return client.options(target, options);
  }

  if (
    method === "POST" &&
    isFunction(client.post)
  ) {
    return client.post(
      target,
      options.body,
      options
    );
  }

  if (
    method === "PUT" &&
    isFunction(client.put)
  ) {
    return client.put(
      target,
      options.body,
      options
    );
  }

  if (
    method === "PATCH" &&
    isFunction(client.patch)
  ) {
    return client.patch(
      target,
      options.body,
      options
    );
  }

  if (
    method === "DELETE" &&
    isFunction(client.delete)
  ) {
    if (
      options.body !== null &&
      options.body !== undefined &&
      client.delete.length >= 3
    ) {
      return client.delete(
        target,
        options.body,
        options
      );
    }

    return client.delete(
      target,
      options
    );
  }

  if (
    method === "DELETE" &&
    isFunction(client.del)
  ) {
    if (
      options.body !== null &&
      options.body !== undefined &&
      client.del.length >= 3
    ) {
      return client.del(
        target,
        options.body,
        options
      );
    }

    return client.del(
      target,
      options
    );
  }

  return undefined;
}

async function executeViaApiClient(AppCore, requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

  if (
    cfg.forceFetch === true ||
    cfg.useFetchOnly === true ||
    cfg.skipApiClient === true
  ) {
    return {
      available:
        false,

      value:
        null,
    };
  }

  const apiClient =
    AppCore?.apiClient;

  if (
    !apiClient ||
    isForbiddenEngineCandidate(apiClient, cfg)
  ) {
    return {
      available:
        false,

      value:
        null,
    };
  }

  return runAbortableOperation(
    AppCore,
    async (operationConfig) => {
      const target =
        getRequestTarget(operationConfig);

      const options =
        buildCoreRequestOptions(operationConfig);

      if (isFunction(apiClient.request)) {
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

      const viaMethod =
        await executeViaMethodClient(
          apiClient,
          operationConfig
        );

      if (viaMethod !== undefined) {
        return {
          available:
            true,

          value:
            viaMethod,
        };
      }

      return {
        available:
          false,

        value:
          null,
      };
    },
    cfg,
    "apiClient"
  );
}

async function executeViaCoreRequest(AppCore, requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

  if (
    cfg.forceFetch === true ||
    cfg.useFetchOnly === true ||
    cfg.skipCoreRequest === true
  ) {
    return {
      available:
        false,

      value:
        null,
    };
  }

  const requestFn =
    AppCore?.request;

  if (
    !isFunction(requestFn) ||
    isForbiddenEngineCandidate(requestFn, cfg)
  ) {
    return {
      available:
        false,

      value:
        null,
    };
  }

  return runAbortableOperation(
    AppCore,
    async (operationConfig) => {
      const target =
        getRequestTarget(operationConfig);

      const result =
        await requestFn(
          target,
          buildCoreRequestOptions(operationConfig)
        );

      return {
        available:
          true,

        value:
          result,
      };
    },
    cfg,
    "coreRequest"
  );
}

async function executeViaFetch(AppCore, requestConfig = {}) {
  const fetchFn =
    getFetchFunction();

  if (!fetchFn) {
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
    prepareFallbackBodyAndHeaders(
      AppCore,
      cfg
    );

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
      await fetchFn(
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
      Boolean(
        timeout.fired === true ||
          (
            timeout.signal?.aborted === true &&
            cfg.signal?.aborted !== true
          )
      );

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

    if (
      manualAborted ||
      isAbortError(error)
    ) {
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

  if (!safeText(getRequestPath(cfg), "")) {
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
   RETRY POLICY FIREBREAK
========================================================= */

function isLikelyAuthPublicRequest(requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

  const path =
    safeLower(
      getRequestPath(cfg),
      ""
    );

  if (!path) {
    return false;
  }

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

function getHardRetryStopReason(error = null, requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

  const status =
    safeNumber(
      error?.status ||
        error?.statusCode,
      0
    );

  if (
    cfg._skipRetry === true ||
    cfg.skipRetry === true
  ) {
    return "skip-retry";
  }

  if (cfg.retry === false) {
    return "retry-disabled";
  }

  if (safeNumber(cfg.retries, null) === 0) {
    return "retries-zero";
  }

  if (
    error?.aborted === true ||
    isAbortError(error) ||
    isSignalAborted(cfg.signal)
  ) {
    return "aborted";
  }

  if (
    error?.timeout === true ||
    isTimeoutError(error)
  ) {
    if (cfg.retryTimeout === true) {
      return "";
    }

    return "timeout-not-retryable";
  }

  /*
    401 lo gestiona Http Service con refresh.
    El engine no debe gastar reintentos internos antes del refresh.
  */
  if (
    status === 401 &&
    cfg.retry401 !== true
  ) {
    return "401-managed-by-auth-refresh";
  }

  if (
    safeUpper(cfg.method, DEFAULT_METHOD) === "OPTIONS"
  ) {
    return "options-no-retry";
  }

  if (
    isLikelyAuthPublicRequest(cfg) &&
    cfg.retryPublicAuth !== true
  ) {
    return "public-auth-no-retry";
  }

  return "";
}

/* =========================================================
   RETRY DELAY
========================================================= */

function fallbackDelay(ms = 0, signal = null, requestConfig = {}) {
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
      if (isSignalAborted(signal)) {
        onAbort();
        return;
      }

      timer =
        setTimeout(() => {
          if (settled) {
            return;
          }

          settled =
            true;

          cleanup();
          resolve(true);
        }, Math.max(0, safeNumber(ms, 0)));

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
    const meta = {
      source:
        "http.request:retry-delay",

      requestId:
        requestConfig?.requestId || null,
    };

    const attempts = [
      () => delay(
        AppCore,
        ms,
        signal,
        meta
      ),

      () => delay(
        ms,
        signal,
        meta
      ),

      () => delay(
        ms
      ),
    ];

    for (const attempt of attempts) {
      try {
        const result =
          await attempt();

        if (isSignalAborted(signal)) {
          throw buildAbortError(
            signal,
            requestConfig,
            "Request aborted after runtime retry delay"
          );
        }

        return result ?? true;
      } catch (error) {
        if (
          isSignalAborted(signal) ||
          isAbortError(error)
        ) {
          throw buildAbortError(
            signal,
            requestConfig,
            "Request aborted during retry delay"
          );
        }
      }
    }
  }

  return fallbackDelay(
    ms,
    signal,
    requestConfig
  );
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

      const hardStopReason =
        getHardRetryStopReason(
          lastError,
          cfg
        );

      const canRetry =
        hardStopReason
          ? false
          : shouldRetry(
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
                hardStopReason ||
                "not-retryable",

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
            safeRedact(getRequestPath(cfg)),

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
      getRequestPath(cfg)
    );

  lastError.requestConfig =
    lastError.requestConfig || {
      requestId,

      method:
        cfg.method || DEFAULT_METHOD,

      path:
        safeRedact(cfg.path || ""),

      url:
        safeRedact(cfg.url || ""),

      headers:
        sanitizeHeaders(cfg.headers || {}),

      auth:
        cfg.auth !== false,

      public:
        cfg.public === true,

      skipAuth:
        cfg.skipAuth === true,

      noAuthHeader:
        cfg.noAuthHeader === true,

      skipRetry:
        cfg._skipRetry === true ||
        cfg.skipRetry === true,

      skipAuthRefresh:
        cfg._skipAuthRefresh === true ||
        cfg.skipAuthRefresh === true,
    };

  safeEmit(
    AppCore,
    REQUEST_EVENTS.engineError,
    {
      requestId,

      path:
        safeRedact(getRequestPath(cfg)),

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
  return sanitizeData({
    version:
      HTTP_REQUEST_ENGINE_VERSION,

    requestSeq,

    policy: {
      fallbackApiBase:
        DEFAULT_API_BASE,

      noRefresh:
        true,

      noLogout:
        true,

      noLoader:
        true,

      noInterceptors:
        true,

      recursionGuard:
        true,

      timeoutWrapsApiClient:
        true,

      stripsAuthOnPublicRequests:
        true,

      noInternal401Retry:
        true,

      noPublicAuthRetryByDefault:
        true,

      fallbackFetchCanAttachPrivateAuthHeader:
        true,

      doubleApiGuard:
        true,
    },

    at:
      isoNow(),
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
