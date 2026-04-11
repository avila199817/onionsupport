/* =========================================================
   Onion SPA - HTTP Request Engine
   Archivo: src/services/http.request.js

   Responsabilidades:
   - ejecutar requests base contra AppCore.apiClient
   - aplicar retry policy con backoff + jitter
   - emitir eventos de retry
========================================================= */

import {
  normalizeError,
  buildRetryDelay,
  shouldRetry,
} from "./http.helpers.js";

import { delay } from "./http.runtime.js";

export async function executeBaseRequest(AppCore, requestConfig = {}) {
  return AppCore.apiClient.request(requestConfig.path, {
    method: requestConfig.method,
    body: requestConfig.body ?? null,
    headers: requestConfig.headers ?? {},
    auth: requestConfig.auth !== false,
    timeout: requestConfig.timeout,
    raw: requestConfig.raw,
    responseType: requestConfig.responseType,
    query: requestConfig.query ?? null,
    credentials: requestConfig.credentials,
    signal: requestConfig.signal,
  });
}

export async function executeWithRetry({
  AppCore,
  config,
  requestConfig = {},
}) {
  let attempt = 0;
  let lastError = null;

  while (
    attempt === 0 ||
    shouldRetry(config, lastError, requestConfig, attempt - 1)
  ) {
    try {
      return await executeBaseRequest(AppCore, requestConfig);
    } catch (error) {
      lastError = normalizeError(error, requestConfig);

      if (!shouldRetry(config, lastError, requestConfig, attempt)) {
        break;
      }

      const waitMs = buildRetryDelay(config, requestConfig, attempt);

      AppCore.events.emit("http:retry", {
        path: requestConfig.path,
        method: requestConfig.method,
        attempt: attempt + 1,
        waitMs,
        error: lastError,
      });

      await delay(AppCore, waitMs);
      attempt += 1;
    }
  }

  throw lastError;
}
