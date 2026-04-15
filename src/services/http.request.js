/* =========================================================
   Onion SPA - HTTP Request Engine
   Archivo: src/services/http.request.js

   Responsabilidades:
   - ejecutar requests base contra AppCore.apiClient
   - aplicar retry policy con backoff + jitter
   - emitir eventos de retry
   - respetar abort signals
   - devolver errores normalizados
========================================================= */

import {
  normalizeError,
  buildRetryDelay,
  shouldRetry,
  isAbortError,
} from "./http.helpers.js";

import {
  delay,
} from "./http.runtime.js";

let requestSeq = 0;

function nowMs() {
  return Date.now();
}

function nextRequestId() {
  requestSeq += 1;
  return `http_req_${requestSeq}`;
}

/* =========================================================
   BASE REQUEST
========================================================= */
export async function executeBaseRequest(
  AppCore,
  requestConfig = {}
) {
  return AppCore.apiClient.request(
    requestConfig.path,
    {
      method:
        requestConfig.method,

      body:
        requestConfig.body ??
        null,

      headers:
        requestConfig.headers ??
        {},

      auth:
        requestConfig.auth !==
        false,

      timeout:
        requestConfig.timeout,

      raw:
        requestConfig.raw,

      responseType:
        requestConfig.responseType,

      query:
        requestConfig.query ??
        null,

      credentials:
        requestConfig.credentials,

      signal:
        requestConfig.signal,

      retries: 0,
    }
  );
}

/* =========================================================
   RETRY ENGINE
========================================================= */
export async function executeWithRetry({
  AppCore,
  config,
  requestConfig = {},
}) {
  const requestId =
    requestConfig.requestId ||
    nextRequestId();

  const startedAt =
    nowMs();

  const maxElapsedMs = Number(
    requestConfig.maxElapsedMs ||
      0
  );

  let attempt = 0;
  let lastError = null;

  while (true) {
    const elapsedBeforeAttempt =
      nowMs() - startedAt;

    if (
      Number.isFinite(
        maxElapsedMs
      ) &&
      maxElapsedMs > 0 &&
      elapsedBeforeAttempt >
        maxElapsedMs
    ) {
      const timeoutError =
        normalizeError(
          {
            message:
              "Retry budget agotado por tiempo.",
            timeout: true,
            code: "RETRY_BUDGET_TIMEOUT",
          },
          requestConfig
        );

      timeoutError.requestId =
        requestId;
      timeoutError.attempt =
        attempt;
      timeoutError.elapsedMs =
        elapsedBeforeAttempt;

      throw timeoutError;
    }

    if (
      requestConfig.signal
        ?.aborted
    ) {
      throw normalizeError(
        requestConfig.signal
          .reason || {
          name: "AbortError",
          message:
            "Request aborted before attempt",
        },
        requestConfig
      );
    }

    AppCore.events.emit(
      "http:request:attempt",
      {
        requestId,
        path:
          requestConfig.path,
        method:
          requestConfig.method,
        attempt:
          attempt + 1,
      }
    );

    try {
      const response =
        await executeBaseRequest(
        AppCore,
        requestConfig
      );

      AppCore.events.emit(
        "http:request:attempt:success",
        {
          requestId,
          path:
            requestConfig.path,
          method:
            requestConfig.method,
          attempt:
            attempt + 1,
          elapsedMs:
            nowMs() -
            startedAt,
        }
      );

      return response;
    } catch (error) {
      lastError =
        normalizeError(
          error,
          requestConfig
        );

      const canRetry =
        shouldRetry(
          config,
          lastError,
          requestConfig,
          attempt
        );

      if (!canRetry) {
        lastError.requestId =
          requestId;
        lastError.attempt =
          attempt + 1;
        lastError.elapsedMs =
          nowMs() - startedAt;

        AppCore.events.emit(
          "http:retry:stop",
          {
            requestId,
            path:
              requestConfig.path,
            method:
              requestConfig.method,
            attempt:
              attempt + 1,
            elapsedMs:
              lastError.elapsedMs,
            error:
              lastError,
          }
        );

        break;
      }

      const waitMs =
        buildRetryDelay(
          config,
          requestConfig,
          attempt
        );

      AppCore.events.emit(
        "http:retry",
        {
          requestId,
          path:
            requestConfig.path,
          method:
            requestConfig.method,
          attempt:
            attempt + 1,
          waitMs,
          error:
            lastError,
          elapsedMs:
            nowMs() -
            startedAt,
        }
      );

      try {
        requestConfig?.onRetry?.(
          {
            requestId,
            path:
              requestConfig.path,
            method:
              requestConfig.method,
            attempt:
              attempt + 1,
            waitMs,
            elapsedMs:
              nowMs() -
              startedAt,
            error:
              lastError,
          }
        );
      } catch {}

      await delay(
        AppCore,
        waitMs,
        requestConfig.signal
      );

      attempt += 1;
    }
  }

  if (
    !lastError &&
    requestConfig.signal
      ?.aborted
  ) {
    lastError =
      normalizeError(
        requestConfig.signal
          .reason || {
          name: "AbortError",
          message: "Aborted",
        },
        requestConfig
      );
  }

  if (
    lastError &&
    isAbortError(lastError)
  ) {
    lastError.aborted =
      true;
  }

  if (lastError) {
    lastError.requestId =
      requestId;
    lastError.elapsedMs =
      nowMs() - startedAt;
  }

  throw lastError;
}
