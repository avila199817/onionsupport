/* =========================================================
   Onion SPA - HTTP Request Engine
   Archivo: src/services/http.request.js

   ONION SUPPORT · HTTP REQUEST ENGINE
   BASE EXECUTION · RETRY ENGINE · ABORT SAFE · TOKEN SAFE

   Responsabilidades:
   - Ejecutar requests base contra AppCore.apiClient / AppCore.request.
   - Aplicar retry policy con backoff + jitter.
   - Emitir eventos internos de intento/retry sin romper el flujo.
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
   - AppCore parcial tolerado.
   - apiClient faltante con fallback controlado.
   - Retry-After vía helper.
   - No retry si _skipRetry.
   - No retry si signal abortada.
   - No exponer headers/body sensibles en eventos.
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
} from "./http.helpers.js";

import {
  delay,
} from "./http.runtime.js";

/* =========================================================
   MODULE STATE
========================================================= */

let requestSeq =
  0;

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

  return output;
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

  const cleanBase =
    safeText(base, "");

  if (!cleanBase) {
    return normalizePath(cleanPath);
  }

  return `${cleanBase.replace(/\/+$/g, "")}/${cleanPath.replace(/^\/+/g, "")}`;
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

function buildAbortError(signal, requestConfig = {}, message = "Request aborted") {
  const reason =
    getSignalReason(signal);

  if (reason instanceof Error) {
    return buildEngineError(
      reason,
      requestConfig,
      {
        aborted:
          true,
      }
    );
  }

  return normalizeError(
    {
      name:
        "AbortError",

      message:
        safeText(
          reason?.message || reason,
          message
        ),

      code:
        "ABORT_ERR",

      aborted:
        true,
    },
    requestConfig
  );
}

function abortSignalAny(signals = []) {
  const validSignals =
    signals.filter(hasAbortSignal);

  if (!validSignals.length) {
    return null;
  }

  if (validSignals.length === 1) {
    return validSignals[0];
  }

  if (typeof AbortController === "undefined") {
    return validSignals[0];
  }

  const controller =
    new AbortController();

  const abort = (signal) => {
    if (controller.signal.aborted) {
      return;
    }

    try {
      controller.abort(
        getSignalReason(signal) ||
          new DOMException(
            "Request aborted",
            "AbortError"
          )
      );
    } catch {
      try {
        controller.abort();
      } catch {}
    }
  };

  for (const signal of validSignals) {
    if (signal.aborted) {
      abort(signal);
      break;
    }

    try {
      signal.addEventListener(
        "abort",
        () => abort(signal),
        {
          once:
            true,
        }
      );
    } catch {}
  }

  return controller.signal;
}

function createTimeoutSignal(timeoutMs = 0) {
  const timeout =
    safeNumber(timeoutMs, 0);

  if (
    timeout <= 0 ||
    typeof AbortController === "undefined"
  ) {
    return {
      signal:
        null,

      clear:
        () => {},
    };
  }

  const controller =
    new AbortController();

  let timer =
    null;

  try {
    timer =
      setTimeout(() => {
        try {
          controller.abort(
            new Error("Request timeout")
          );
        } catch {
          try {
            controller.abort();
          } catch {}
        }
      }, timeout);
  } catch {}

  return {
    signal:
      controller.signal,

    clear:
      () => {
        try {
          if (timer) {
            clearTimeout(timer);
          }
        } catch {}
      },
  };
}

/* =========================================================
   EVENTS / LOGS
========================================================= */

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  try {
    AppCore?.events?.emit?.(
      name,
      payload
    );

    return true;
  } catch {}

  return false;
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(
      "[HTTP Request]",
      ...args
    );

    return;
  } catch {}

  try {
    console.warn(
      "[HTTP Request]",
      ...args
    );
  } catch {}
}

function sanitizeErrorForEvent(error = null) {
  if (!error) {
    return null;
  }

  return {
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

    redactedUrl:
      safeRedact(
        error.redactedUrl ||
          error.url ||
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
  };
}

function buildAttemptPayload({
  requestId,
  requestConfig,
  attempt,
  startedAt,
  extra = {},
} = {}) {
  return {
    requestId,

    path:
      safeRedact(requestConfig?.path || requestConfig?.url || ""),

    method:
      requestConfig?.method || "GET",

    attempt:
      attempt + 1,

    attemptIndex:
      attempt,

    elapsedMs:
      nowMs() - startedAt,

    at:
      isoNow(),

    ...safeObject(extra),
  };
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

  return {
    ...normalized,

    ...safeObject(patch),

    aborted:
      patch.aborted ??
      normalized.aborted ??
      isAbortError(normalized),

    timeout:
      patch.timeout ??
      normalized.timeout ??
      isTimeoutError(normalized),
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
    if (query instanceof URLSearchParams) {
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
          value === undefined
        ) {
          continue;
        }

        if (Array.isArray(value)) {
          for (const item of value) {
            params.append(
              key,
              String(item)
            );
          }

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
    return appendQuery(
      explicitUrl,
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

  let base =
    "";

  try {
    base =
      safeText(
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

  const built =
    AppCore?.utils?.buildUrl &&
    isFunction(AppCore.utils.buildUrl)
      ? AppCore.utils.buildUrl(path)
      : joinUrl(base, path);

  return appendQuery(
    built,
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

function prepareFallbackBodyAndHeaders(requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

  const headers =
    headersToPlainObject(cfg.headers || {});

  const body =
    cfg.body;

  const method =
    safeText(cfg.method, "GET").toUpperCase();

  if (
    method === "GET" ||
    method === "HEAD"
  ) {
    return {
      body:
        undefined,

      headers,
    };
  }

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

  if (
    cfg.rawBody === true ||
    cfg.upload === true ||
    isFormDataLike(body) ||
    isBlobLike(body) ||
    isArrayBufferLike(body) ||
    isUrlSearchParamsLike(body) ||
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

  return {
    body:
      JSON.stringify(body),

    headers,
  };
}

async function parseFallbackResponse(response, requestConfig = {}) {
  const responseType =
    safeText(
      requestConfig.responseType,
      "auto"
    ).toLowerCase();

  if (requestConfig.raw === true) {
    return response;
  }

  if (responseType === "raw") {
    return response;
  }

  if (responseType === "blob") {
    return response.blob();
  }

  if (responseType === "arraybuffer") {
    return response.arrayBuffer();
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
    contentType.includes("application/json") ||
    contentType.includes("+json")
  ) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    return await response.text();
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
        data?.message ||
        data?.error ||
        data?.detail ||
        response?.statusText ||
        `HTTP ${response?.status || 0}`,

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
        requestConfig?.method || "GET",

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
      cfg.method || "GET",

    body:
      cfg.body ?? null,

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
      cfg.responseType || "auto",

    query:
      cfg.query ?? null,

    credentials:
      cfg.credentials,

    signal:
      cfg.signal,

    expectedStatuses:
      cfg.expectedStatuses || [],

    emitEvents:
      cfg.emitCoreEvents === true,

    storeError:
      cfg.storeCoreError === true,

    silent:
      cfg.silent === true,

    /*
      Este engine gestiona retry.
      El Core/apiClient debe ejecutar un solo intento.
    */
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

async function executeViaApiClient(AppCore, requestConfig = {}) {
  const apiClient =
    AppCore?.apiClient;

  if (
    !apiClient ||
    !isFunction(apiClient.request)
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

  const result =
    await apiClient.request(
      cfg.path,
      buildCoreRequestOptions(cfg)
    );

  return {
    available:
      true,

    value:
      result,
    };
}

async function executeViaCoreRequest(AppCore, requestConfig = {}) {
  if (!isFunction(AppCore?.request)) {
    return {
      available:
        false,

      value:
        null,
    };
  }

  const cfg =
    safeObject(requestConfig);

  const result =
    await AppCore.request(
      cfg.path,
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
    const response =
      await fetch(
        url,
        {
          method:
            cfg.method || "GET",

          headers:
            prepared.headers,

          body:
            prepared.body,

          credentials:
            cfg.credentials,

          signal:
            signal || undefined,
        }
      );

    const data =
      await parseFallbackResponse(
        response,
        cfg
      );

    if (!response.ok) {
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
    if (
      timeout.signal?.aborted &&
      !isAbortError(error)
    ) {
      throw buildEngineError(
        error,
        cfg,
        {
          timeout:
            true,
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

  let apiClientResult =
    null;

  try {
    apiClientResult =
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

  let coreRequestResult =
    null;

  try {
    coreRequestResult =
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

async function waitForRetry(AppCore, waitMs = 0, signal = null) {
  const ms =
    Math.max(
      0,
      safeNumber(waitMs, 0)
    );

  if (ms <= 0) {
    if (isSignalAborted(signal)) {
      throw buildAbortError(
        signal,
        {},
        "Request aborted before retry"
      );
    }

    return true;
  }

  if (isFunction(delay)) {
    return delay(
      AppCore,
      ms,
      signal
    );
  }

  return new Promise((resolve, reject) => {
    if (isSignalAborted(signal)) {
      reject(
        buildAbortError(
          signal,
          {},
          "Request aborted before retry delay"
        )
      );

      return;
    }

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
    };

    const onAbort = () => {
      cleanup();

      reject(
        buildAbortError(
          signal,
          {},
          "Request aborted during retry delay"
        )
      );
    };

    try {
      timer =
        setTimeout(() => {
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
    /* =====================================================
       PRE-ATTEMPT ABORT / BUDGET
    ===================================================== */

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
        "http:retry:budget-timeout",
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
        })
      );

      throw lastError;
    }

    /* =====================================================
       ATTEMPT START
    ===================================================== */

    safeEmit(
      AppCore,
      "http:request:attempt",
      buildAttemptPayload({
        requestId,
        requestConfig:
          cfg,
        attempt,
        startedAt,
      })
    );

    try {
      const response =
        await executeBaseRequest(
          AppCore,
          cfg
        );

      safeEmit(
        AppCore,
        "http:request:attempt:success",
        buildAttemptPayload({
          requestId,
          requestConfig:
            cfg,
          attempt,
          startedAt,
        })
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

      /* ===================================================
         RETRY DECISION
      =================================================== */

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
          "http:retry:stop",
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
          })
        );

        break;
      }

      /* ===================================================
         RETRY DELAY
      =================================================== */

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
        "http:retry",
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
        })
      );

      try {
        cfg?.onRetry?.({
          requestId,

          path:
            cfg.path,

          redactedPath:
            safeRedact(cfg.path || ""),

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
          cfg.signal
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
            }
          );

        safeEmit(
          AppCore,
          "http:retry:aborted",
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
          })
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

  /* =======================================================
     FINAL THROW
  ======================================================= */

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

  lastError.requestId =
    requestId;

  lastError.elapsedMs =
    nowMs() - startedAt;

  lastError.path =
    safeRedact(
      cfg.path || cfg.url || ""
    );

  safeEmit(
    AppCore,
    "http:request:engine:error",
    {
      requestId,

      path:
        safeRedact(cfg.path || cfg.url || ""),

      method:
        cfg.method || "GET",

      elapsedMs:
        lastError.elapsedMs,

      error:
        sanitizeErrorForEvent(lastError),
    }
  );

  throw lastError;
}

/* =========================================================
   DEBUG
========================================================= */

export function getHttpRequestEngineSnapshot() {
  return {
    requestSeq,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  executeBaseRequest,
  executeWithRetry,
  getHttpRequestEngineSnapshot,
};
