/* =========================================================
   Onion SPA - HTTP Helpers
   Archivo: src/services/http.helpers.js

   Responsabilidades:
   - config base del servicio HTTP
   - helpers puros de request / retry / error
   - detección de endpoints auth
   - normalización de errores
   - utilidades de signal / abort

   HARDENING:
   - timeouts explícitos
   - soporte 409/423 opcional
   - logs consistentes
   - sanitización robusta de config
========================================================= */

export const HTTP_CONFIG = Object.freeze({
  retries: 1,
  retryDelay: 400,
  retryJitter: 120,

  autoRefreshOn401: true,
  autoLogoutOn401: true,

  logRequests: true,
  logResponses: true,
  logErrors: true,

  defaultUseLoader: true,
  defaultAuth: true,
});

export function isFn(value) {
  return typeof value === "function";
}

export function isAbortError(error) {
  return (
    error?.name === "AbortError" ||
    error?.code === "ABORT_ERR" ||
    String(error?.message || "")
      .toLowerCase()
      .includes("aborted")
  );
}

export function isTimeoutError(error) {
  return (
    error?.timeout === true ||
    String(error?.message || "")
      .toLowerCase()
      .includes("timeout")
  );
}

export function shouldToggleGlobalLoader(
  requestConfig = {}
) {
  return requestConfig.useLoader !== false;
}

export function shouldLogRequests(
  config,
  AppCore
) {
  return Boolean(
    config?.logRequests &&
      AppCore?.config?.debug
  );
}

export function shouldLogResponses(
  config,
  AppCore
) {
  return Boolean(
    config?.logResponses &&
      AppCore?.config?.debug
  );
}

export function shouldLogErrors(config) {
  return Boolean(config?.logErrors);
}

export function isAuthEndpoint(
  path = ""
) {
  const value = String(
    path || ""
  ).toLowerCase();

  return (
    value.includes("/api/auth/login") ||
    value.includes("/api/auth/logout") ||
    value.includes("/api/auth/me") ||
    value.includes("/api/auth/refresh") ||
    value.includes("/api/auth/2fa")
  );
}

export function isRetryableError(
  error
) {
  if (!error) return false;
  if (isAbortError(error)) return false;

  const status = Number(
    error?.status || 0
  );

  if (isTimeoutError(error)) {
    return true;
  }

  if (!status) return true;
  if (status === 408) return true;
  if (status === 425) return true;
  if (status === 429) return true;
  if (status >= 500) return true;

  return false;
}

export function isIdempotentMethod(
  method = "GET"
) {
  return [
    "GET",
    "HEAD",
    "OPTIONS",
  ].includes(
    String(method || "GET")
      .toUpperCase()
  );
}

export function buildRetryDelay(
  config,
  requestConfig = {},
  attempt = 0
) {
  const baseDelay =
    typeof requestConfig.retryDelay ===
    "number"
      ? requestConfig.retryDelay
      : config.retryDelay;

  const jitter =
    typeof requestConfig.retryJitter ===
    "number"
      ? requestConfig.retryJitter
      : config.retryJitter;

  const safeBase = Math.max(
    0,
    Number(baseDelay || 0)
  );

  const safeJitter = Math.max(
    0,
    Number(jitter || 0)
  );

  const randomJitter =
    Math.floor(
      Math.random() * safeJitter
    );

  return (
    safeBase *
      (attempt + 1) +
    randomJitter
  );
}

export function shouldRetry(
  config,
  error,
  requestConfig = {},
  attempt = 0
) {
  const maxRetries =
    typeof requestConfig.retries ===
    "number"
      ? requestConfig.retries
      : config.retries;

  if (attempt >= maxRetries) {
    return false;
  }

  if (requestConfig.retry === false) {
    return false;
  }

  if (
    requestConfig._skipRetry === true
  ) {
    return false;
  }

  const method = String(
    requestConfig.method || "GET"
  ).toUpperCase();

  const allowUnsafeRetry =
    requestConfig.retryUnsafe ===
    true;

  if (
    !isIdempotentMethod(method) &&
    !allowUnsafeRetry
  ) {
    return false;
  }

  return isRetryableError(error);
}

export function normalizeError(
  error,
  requestConfig = null
) {
  if (!error) {
    return {
      name:
        "HttpErrorNormalized",
      message:
        "Error desconocido",
      status: 0,
      statusText: "",
      data: null,
      code: null,
      url:
        requestConfig?.path ||
        null,
      method:
        requestConfig?.method ||
        null,
      requestConfig,
      raw: error,
      aborted: false,
      timeout: false,
    };
  }

  if (
    error?.name ===
    "HttpErrorNormalized"
  ) {
    return error;
  }

  return {
    name:
      "HttpErrorNormalized",

    message:
      error?.data?.message ||
      error?.data?.error ||
      error?.message ||
      error?.statusText ||
      "Error en la petición",

    status: Number(
      error?.status || 0
    ),

    statusText:
      error?.statusText || "",

    data:
      error?.data || null,

    url:
      error?.url ||
      requestConfig?.path ||
      null,

    method:
      error?.method ||
      requestConfig?.method ||
      null,

    code:
      error?.code || null,

    requestConfig,

    raw: error,

    aborted:
      isAbortError(error),

    timeout:
      isTimeoutError(error),
  };
}

export function buildRequestSummary(
  requestConfig = {}
) {
  return {
    method:
      requestConfig.method ||
      "GET",

    path:
      requestConfig.path ||
      null,

    query:
      requestConfig.query ||
      null,

    auth:
      requestConfig.auth !==
      false,

    retries:
      requestConfig.retries,

    useLoader:
      requestConfig.useLoader !==
      false,

    responseType:
      requestConfig.responseType ||
      "auto",
  };
}

export function buildDefaultRequestConfig(
  config,
  AppCore,
  method,
  path,
  options = {}
) {
  return {
    method: String(
      method || "GET"
    ).toUpperCase(),

    path,

    body: null,
    headers: {},

    auth:
      config.defaultAuth,

    timeout:
      AppCore?.config
        ?.requestTimeout,

    raw: false,
    responseType: "auto",

    query: null,

    credentials:
      "same-origin",

    useLoader:
      config.defaultUseLoader,

    retries:
      config.retries,

    retryDelay:
      config.retryDelay,

    retryJitter:
      config.retryJitter,

    retry: true,
    retryUnsafe: false,

    signal: null,
    meta: null,

    _skipRetry: false,
    _skipAuthRefresh: false,
    _authRefreshAttempted: false,

    ...options,
  };
}

export function withSignal(
  controllerOrSignal
) {
  if (!controllerOrSignal) {
    return null;
  }

  if (
    controllerOrSignal instanceof
    AbortController
  ) {
    return controllerOrSignal.signal;
  }

  return controllerOrSignal;
}
