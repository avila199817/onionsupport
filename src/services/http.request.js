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
} from "./http.helpers.js";

import {
  delay,
} from "./http.runtime.js";

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
  let attempt = 0;
  let lastError = null;

  while (true) {
    try {
      return await executeBaseRequest(
        AppCore,
        requestConfig
      );
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
          path:
            requestConfig.path,
          method:
            requestConfig.method,
          attempt:
            attempt + 1,
          waitMs,
          error:
            lastError,
        }
      );

      await delay(
        AppCore,
        waitMs,
        requestConfig.signal
      );

      attempt += 1;
    }
  }

  throw lastError;
}
