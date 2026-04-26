/* =========================================================
   Onion SPA - HTTP Request Engine
   Archivo: src/services/http.request.js

   Responsabilidades:
   - ejecutar requests base contra AppCore.apiClient
   - aplicar retry policy con backoff + jitter
   - emitir eventos de retry
   - respetar abort signals
   - devolver errores normalizados
   - aislar errores del event bus

   HARDENING EXTREMO:
   - no retries internos duplicados de AppCore.apiClient
   - single error final para caller
   - abort pre-attempt / during-delay / post-delay
   - retry budget por tiempo
   - eventos sin tokens reales
   - AppCore parcial tolerado
   - apiClient faltante normalizado
   - retry delay con Retry-After vía helper
   - no retry si _skipRetry
   - no retry si signal abortada
========================================================= */

import {
  normalizeError,
  buildRetryDelay,
  shouldRetry,
  isAbortError,
  isTimeoutError,
  redactHttpValue,
} from "./http.helpers.js";

import {
  delay,
} from "./http.runtime.js";

/* =========================================================
   STATE
========================================================= */

let requestSeq = 0;

/* =========================================================
   BASICS
========================================================= */

function nowMs() {
  return Date.now();
}

function isoNow() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function nextRequestId() {
  requestSeq += 1;
  return `http_req_${requestSeq}`;
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

function safeObject(value, fallback = {}) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value
    : fallback;
}

function safeRedact(value = "") {
  try {
    return redactHttpValue(value);
  } catch {
    return safeText(value, "");
  }
}

function isFunction(value) {
  return typeof value === "function";
}

function safeEmit(AppCore, eventName, payload = {}) {
  try {
    AppCore?.events?.emit?.(
      eventName,
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
  } catch {
    try {
      console.warn(
        "[HTTP Request]",
        ...args
      );
    } catch {}
  }
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
    return normalizeError(
      reason,
      requestConfig
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

function buildEngineError(error, requestConfig = {}, patch = {}) {
  const normalized =
    normalizeError(
      error,
      requestConfig
    );

  return {
    ...normalized,
    ...patch,
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

function sanitizeErrorForEvent(error = null) {
  if (!error) {
    return null;
  }

  return {
    ...error,

    url:
      safeRedact(error.url || ""),

    redactedUrl:
      safeRedact(
        error.redactedUrl ||
          error.url ||
          ""
      ),

    requestConfig:
      error.requestConfig
        ? {
            ...error.requestConfig,
            path:
              safeRedact(error.requestConfig.path || ""),
            url:
              safeRedact(error.requestConfig.url || ""),
            headers:
              undefined,
            body:
              undefined,
          }
        : null,

    raw:
      error.raw instanceof Error
        ? {
            name:
              error.raw.name,
            message:
              error.raw.message,
          }
        : undefined,
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
      safeRedact(requestConfig?.path || ""),

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

    ...extra,
  };
}

/* =========================================================
   BASE REQUEST
========================================================= */

export async function executeBaseRequest(
  AppCore,
  requestConfig = {}
) {
  const cfg =
    safeObject(requestConfig);

  const apiClient =
    AppCore?.apiClient;

  if (
    !apiClient ||
    !isFunction(apiClient.request)
  ) {
    throw normalizeError(
      {
        name:
          "HttpApiClientUnavailable",

        message:
          "AppCore.apiClient.request no está disponible.",

        status:
          0,

        code:
          "API_CLIENT_UNAVAILABLE",
      },
      cfg
    );
  }

  if (!safeText(cfg.path, "")) {
    throw normalizeError(
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
      cfg
    );
  }

  if (isSignalAborted(cfg.signal)) {
    throw buildAbortError(
      cfg.signal,
      cfg,
      "Request aborted before base request"
    );
  }

  return apiClient.request(
    cfg.path,
    {
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
        Importante:
        El retry lo gestiona este engine.
        AppCore.apiClient debe ejecutar una sola vez.
      */
      retries:
        0,

      dedupe:
        cfg.dedupe !== false,
    }
  );
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

  return nowMs() - startedAt > budget;
}

function buildRetryBudgetError({
  requestConfig,
  requestId,
  attempt,
  startedAt,
} = {}) {
  const elapsedMs =
    nowMs() - startedAt;

  return normalizeError(
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
    nowMs();

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

      lastError.requestId =
        requestId;

      lastError.attempt =
        attempt + 1;

      lastError.elapsedMs =
        nowMs() - startedAt;

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

          lastError.requestId =
            requestId;

          lastError.attempt =
            attempt + 1;

          lastError.elapsedMs =
            nowMs() - startedAt;

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
        await delay(
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
      cfg.path || ""
    );

  safeEmit(
    AppCore,
    "http:request:engine:error",
    {
      requestId,

      path:
        safeRedact(cfg.path || ""),

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

export default {
  executeBaseRequest,
  executeWithRetry,
  getHttpRequestEngineSnapshot,
};
