/* =========================================================
   Onion SPA - HTTP Helpers
   Archivo: src/services/http.helpers.js

   Responsabilidades:
   - config base del servicio HTTP
   - helpers puros de request / retry / error
   - detección de endpoints auth
   - detección de endpoints públicos técnicos
   - normalización de errores
   - sanitización de logs/eventos
   - utilidades de signal / abort

   HARDENING EXTREMO:
   - timeouts explícitos
   - soporte 409/423 opcional
   - logs consistentes
   - sanitización robusta de config
   - no exponer tokens en summaries/errors
   - retry con status groups
   - Retry-After compatible
   - AbortController browser-safe
   - helpers puros sin dependencias externas
========================================================= */

/* =========================================================
   CONFIG
========================================================= */

export const HTTP_CONFIG = Object.freeze({
  retries: 1,
  retryDelay: 400,
  retryJitter: 120,
  retryStrategy: "linear",
  retryMaxDelay: 10_000,

  retryOnStatuses: null,
  retryOnConflict: false,
  retryOnLocked: false,

  timeout: 15_000,

  autoRefreshOn401: true,
  autoLogoutOn401: true,
  refreshMinIntervalMs: 0,

  logRequests: true,
  logResponses: true,
  logErrors: true,

  defaultUseLoader: true,
  defaultAuth: true,

  defaultCredentials: "same-origin",
  defaultResponseType: "auto",
});

/* =========================================================
   BASICS
========================================================= */

export function isFn(value) {
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

function safeLower(value = "") {
  return safeText(value, "")
    .toLowerCase();
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
  return Boolean(fallback);
}

function safeObject(value, fallback = {}) {
  return isObject(value)
    ? value
    : fallback;
}

function hasAbortController() {
  return typeof AbortController !== "undefined";
}

function hasAbortSignal(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    "aborted" in value &&
    isFn(value.addEventListener)
  );
}

/* =========================================================
   SANITIZE / REDACT
========================================================= */

export function redactHttpValue(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  let output =
    raw;

  try {
    output = output.replace(
      /([?&](?:token|activationToken|activateToken|resetToken|passwordResetToken|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(\/activate-account\/)([^/?#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    );
  } catch {}

  return output;
}

export function sanitizeHeaders(headers = {}) {
  const source =
    isObject(headers)
      ? headers
      : {};

  const output = {};

  for (const [key, value] of Object.entries(source)) {
    const lower =
      safeLower(key);

    if (
      lower === "authorization" ||
      lower === "cookie" ||
      lower === "set-cookie" ||
      lower.includes("token") ||
      lower.includes("secret") ||
      lower.includes("password")
    ) {
      output[key] = "***";
    } else {
      output[key] = value;
    }
  }

  return output;
}

export function sanitizeRequestConfig(requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

  return {
    ...cfg,

    path:
      redactHttpValue(cfg.path || ""),

    url:
      redactHttpValue(cfg.url || ""),

    headers:
      sanitizeHeaders(cfg.headers),

    token:
      null,
  };
}

/* =========================================================
   URL / ENDPOINTS
========================================================= */

export function normalizeEndpointPath(path = "") {
  const raw =
    safeText(path, "");

  if (!raw) {
    return "";
  }

  try {
    const parsed =
      new URL(
        raw,
        typeof window !== "undefined" &&
          window.location?.origin
          ? window.location.origin
          : "http://localhost"
      );

    return safeLower(
      parsed.pathname || raw
    );
  } catch {
    return safeLower(
      raw.split("?")[0].split("#")[0] || raw
    );
  }
}

export function isAuthEndpoint(path = "") {
  const value =
    normalizeEndpointPath(path);

  return (
    value.includes("/api/auth/login") ||
    value.includes("/auth/login") ||

    value.includes("/api/auth/logout") ||
    value.includes("/auth/logout") ||

    value.includes("/api/auth/me") ||
    value.includes("/auth/me") ||

    value.includes("/api/auth/session") ||
    value.includes("/auth/session") ||

    value.includes("/api/auth/refresh") ||
    value.includes("/auth/refresh") ||

    value.includes("/api/auth/2fa") ||
    value.includes("/auth/2fa") ||

    value.includes("/api/auth/activate") ||
    value.includes("/auth/activate") ||

    value.includes("/api/auth/activate-account") ||
    value.includes("/auth/activate-account") ||

    value.includes("/api/auth/account/activate") ||
    value.includes("/auth/account/activate") ||

    value.includes("/api/auth/activation") ||
    value.includes("/auth/activation") ||

    value.includes("/api/auth/reset-password") ||
    value.includes("/auth/reset-password") ||

    value.includes("/api/auth/password-reset") ||
    value.includes("/auth/password-reset") ||

    value.includes("/api/auth/forgot-password") ||
    value.includes("/auth/forgot-password") ||

    value.includes("/api/auth/recover-password") ||
    value.includes("/auth/recover-password")
  );
}

export function isPublicAuthEndpoint(path = "") {
  const value =
    normalizeEndpointPath(path);

  return (
    value.includes("/api/auth/login") ||
    value.includes("/auth/login") ||

    value.includes("/api/auth/refresh") ||
    value.includes("/auth/refresh") ||

    value.includes("/api/auth/2fa/login") ||
    value.includes("/auth/2fa/login") ||

    value.includes("/api/auth/_health") ||
    value.includes("/auth/_health") ||

    value.includes("/api/auth/activate") ||
    value.includes("/auth/activate") ||

    value.includes("/api/auth/activate-account") ||
    value.includes("/auth/activate-account") ||

    value.includes("/api/auth/account/activate") ||
    value.includes("/auth/account/activate") ||

    value.includes("/api/auth/activation") ||
    value.includes("/auth/activation") ||

    value.includes("/api/auth/activate/first-user") ||
    value.includes("/auth/activate/first-user") ||

    value.includes("/api/auth/reset-password-request") ||
    value.includes("/auth/reset-password-request") ||

    value.includes("/api/auth/reset-password-confirm") ||
    value.includes("/auth/reset-password-confirm") ||

    value.includes("/api/auth/reset-password") ||
    value.includes("/auth/reset-password") ||

    value.includes("/api/auth/password-reset") ||
    value.includes("/auth/password-reset") ||

    value.includes("/api/auth/forgot-password") ||
    value.includes("/auth/forgot-password") ||

    value.includes("/api/auth/recover-password") ||
    value.includes("/auth/recover-password")
  );
}

export function isTechnicalPublicRoute(path = "") {
  const value =
    normalizeEndpointPath(path);

  return (
    value === "/activate-account" ||
    value.startsWith("/activate-account/") ||

    value === "/reset-password" ||
    value === "/forgot-password" ||

    value === "/reset-password/confirm" ||
    value.startsWith("/reset-password/confirm/")
  );
}

/* =========================================================
   LOG FLAGS
========================================================= */

export function shouldToggleGlobalLoader(requestConfig = {}) {
  return requestConfig.useLoader !== false;
}

export function shouldLogRequests(config, AppCore) {
  return Boolean(
    config?.logRequests &&
      AppCore?.config?.debug
  );
}

export function shouldLogResponses(config, AppCore) {
  return Boolean(
    config?.logResponses &&
      AppCore?.config?.debug
  );
}

export function shouldLogErrors(config) {
  return Boolean(config?.logErrors);
}

/* =========================================================
   ABORT / TIMEOUT
========================================================= */

export function isAbortError(error) {
  const message =
    safeLower(error?.message || "");

  const name =
    safeText(error?.name || "");

  return (
    name === "AbortError" ||
    error?.code === "ABORT_ERR" ||
    error?.code === 20 ||
    error?.aborted === true ||
    message.includes("aborted") ||
    message.includes("abort")
  );
}

export function isTimeoutError(error) {
  const message =
    safeLower(error?.message || "");

  const reason =
    safeLower(error?.reason || "");

  return (
    error?.timeout === true ||
    message.includes("timeout") ||
    reason.includes("timeout") ||
    message.includes("timed out")
  );
}

export function withSignal(controllerOrSignal) {
  if (!controllerOrSignal) {
    return null;
  }

  if (
    hasAbortController() &&
    controllerOrSignal instanceof AbortController
  ) {
    return controllerOrSignal.signal;
  }

  if (hasAbortSignal(controllerOrSignal)) {
    return controllerOrSignal;
  }

  if (hasAbortSignal(controllerOrSignal?.signal)) {
    return controllerOrSignal.signal;
  }

  return null;
}

/* =========================================================
   RETRY
========================================================= */

export function isIdempotentMethod(method = "GET") {
  return [
    "GET",
    "HEAD",
    "OPTIONS",
  ].includes(
    safeText(method, "GET")
      .toUpperCase()
  );
}

export function isRetryableError(error, options = {}) {
  if (!error) {
    return false;
  }

  if (isAbortError(error)) {
    return false;
  }

  const status =
    safeNumber(error?.status, 0);

  if (isTimeoutError(error)) {
    return true;
  }

  if (!status) {
    return true;
  }

  if (status === 408) return true;
  if (status === 425) return true;
  if (status === 429) return true;

  if (
    status === 409 &&
    options.retryOnConflict === true
  ) {
    return true;
  }

  if (
    status === 423 &&
    options.retryOnLocked === true
  ) {
    return true;
  }

  if (status >= 500) {
    return true;
  }

  return false;
}

function matchesStatusRule(status, retryOnStatuses) {
  if (!Array.isArray(retryOnStatuses)) {
    return null;
  }

  const numericStatus =
    Number(status);

  return retryOnStatuses.some((candidate) => {
    if (typeof candidate === "number") {
      return candidate === numericStatus;
    }

    const rule =
      safeLower(candidate);

    if (rule === "5xx") {
      return numericStatus >= 500 && numericStatus <= 599;
    }

    if (rule === "4xx") {
      return numericStatus >= 400 && numericStatus <= 499;
    }

    if (rule.endsWith("xx")) {
      const group =
        Number(rule[0]);

      return (
        Number.isFinite(group) &&
        numericStatus >= group * 100 &&
        numericStatus <= group * 100 + 99
      );
    }

    return Number(rule) === numericStatus;
  });
}

function parseRetryAfterMs(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return 0;
  }

  const seconds =
    Number(raw);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const dateMs =
    Date.parse(raw);

  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return 0;
}

function getHeaderValue(headers = {}, name = "") {
  const target =
    safeLower(name);

  if (!target || !isObject(headers)) {
    return "";
  }

  const key =
    Object.keys(headers).find((candidate) =>
      safeLower(candidate) === target
    );

  return key
    ? headers[key]
    : "";
}

export function buildRetryDelay(config, requestConfig = {}, attempt = 0, error = null) {
  const retryAfterMs =
    parseRetryAfterMs(
      getHeaderValue(error?.headers, "retry-after") ||
        getHeaderValue(error?.headers, "Retry-After")
    );

  const maxDelay =
    Math.max(
      0,
      safeNumber(
        requestConfig.retryMaxDelay ??
          config?.retryMaxDelay,
        HTTP_CONFIG.retryMaxDelay
      )
    );

  if (retryAfterMs > 0) {
    return maxDelay > 0
      ? Math.min(maxDelay, retryAfterMs)
      : retryAfterMs;
  }

  const strategy =
    safeLower(
      requestConfig.retryStrategy ||
        config?.retryStrategy ||
        HTTP_CONFIG.retryStrategy
    );

  const baseDelay =
    Math.max(
      0,
      safeNumber(
        requestConfig.retryDelay ??
          config?.retryDelay,
        HTTP_CONFIG.retryDelay
      )
    );

  const jitter =
    Math.max(
      0,
      safeNumber(
        requestConfig.retryJitter ??
          config?.retryJitter,
        HTTP_CONFIG.retryJitter
      )
    );

  const safeAttempt =
    Math.max(
      0,
      safeNumber(attempt, 0)
    );

  const randomJitter =
    jitter > 0
      ? Math.floor(Math.random() * jitter)
      : 0;

  let computedDelay =
    baseDelay;

  if (strategy === "exponential") {
    computedDelay =
      baseDelay * 2 ** safeAttempt;
  } else if (strategy === "fixed") {
    computedDelay =
      baseDelay;
  } else {
    computedDelay =
      baseDelay * (safeAttempt + 1);
  }

  const delay =
    computedDelay + randomJitter;

  return maxDelay > 0
    ? Math.min(maxDelay, delay)
    : delay;
}

export function shouldRetry(config, error, requestConfig = {}, attempt = 0) {
  const maxRetries =
    Number.isFinite(Number(requestConfig.retries))
      ? Number(requestConfig.retries)
      : safeNumber(config?.retries, HTTP_CONFIG.retries);

  if (attempt >= maxRetries) {
    return false;
  }

  if (requestConfig.retry === false) {
    return false;
  }

  if (requestConfig._skipRetry === true) {
    return false;
  }

  if (error?.aborted === true || isAbortError(error)) {
    return false;
  }

  const status =
    safeNumber(error?.status, 0);

  if (Array.isArray(requestConfig.retryOnStatuses)) {
    return Boolean(
      matchesStatusRule(
        status,
        requestConfig.retryOnStatuses
      )
    );
  }

  const method =
    safeText(
      requestConfig.method,
      "GET"
    ).toUpperCase();

  const allowUnsafeRetry =
    requestConfig.retryUnsafe === true;

  if (
    !isIdempotentMethod(method) &&
    !allowUnsafeRetry
  ) {
    return false;
  }

  return isRetryableError(error, {
    retryOnConflict:
      requestConfig.retryOnConflict ??
      config?.retryOnConflict,

    retryOnLocked:
      requestConfig.retryOnLocked ??
      config?.retryOnLocked,
  });
}

/* =========================================================
   ERROR NORMALIZATION
========================================================= */

function extractErrorMessage(error, fallback = "Error en la petición") {
  if (!error) {
    return fallback;
  }

  return (
    safeText(error?.data?.message, "") ||
    safeText(error?.data?.error, "") ||
    safeText(error?.data?.detail, "") ||
    safeText(error?.data?.title, "") ||
    safeText(error?.response?.data?.message, "") ||
    safeText(error?.response?.data?.error, "") ||
    safeText(error?.message, "") ||
    safeText(error?.statusText, "") ||
    fallback
  );
}

export function normalizeError(error, requestConfig = null) {
  if (
    error?.name === "HttpErrorNormalized"
  ) {
    return {
      ...error,
      url:
        redactHttpValue(error.url || ""),
      redactedUrl:
        redactHttpValue(error.redactedUrl || error.url || ""),
      requestConfig:
        sanitizeRequestConfig(error.requestConfig || requestConfig || {}),
    };
  }

  const cfg =
    requestConfig
      ? sanitizeRequestConfig(requestConfig)
      : null;

  const status =
    safeNumber(
      error?.status ??
        error?.response?.status,
      0
    );

  const statusText =
    safeText(
      error?.statusText ??
        error?.response?.statusText,
      ""
    );

  const url =
    redactHttpValue(
      error?.redactedUrl ||
        error?.url ||
        requestConfig?.path ||
        ""
    );

  const method =
    safeText(
      error?.method ||
        requestConfig?.method ||
        "",
      ""
    ).toUpperCase() || null;

  return {
    name:
      "HttpErrorNormalized",

    message:
      extractErrorMessage(error),

    status,

    statusText,

    data:
      error?.data ||
      error?.response?.data ||
      null,

    url,

    redactedUrl:
      url,

    method,

    code:
      error?.code || null,

    requestId:
      error?.requestId ||
      requestConfig?.requestId ||
      null,

    requestConfig:
      cfg,

    raw:
      error,

    aborted:
      isAbortError(error),

    timeout:
      isTimeoutError(error),

    retryable:
      isRetryableError(error, {
        retryOnConflict:
          requestConfig?.retryOnConflict,

        retryOnLocked:
          requestConfig?.retryOnLocked,
      }),

    at:
      new Date().toISOString(),
  };
}

/* =========================================================
   REQUEST CONFIG
========================================================= */

export function buildRequestSummary(requestConfig = {}) {
  return {
    requestId:
      requestConfig.requestId ||
      null,

    method:
      requestConfig.method ||
      "GET",

    path:
      redactHttpValue(
        requestConfig.path || ""
      ) || null,

    query:
      requestConfig.query ||
      null,

    auth:
      requestConfig.auth !== false,

    public:
      requestConfig.public === true,

    retries:
      requestConfig.retries,

    retry:
      requestConfig.retry !== false,

    retryStrategy:
      requestConfig.retryStrategy ||
      "linear",

    useLoader:
      requestConfig.useLoader !== false,

    responseType:
      requestConfig.responseType ||
      "auto",

    timeout:
      requestConfig.timeout ||
      null,
  };
}

export function buildDefaultRequestConfig(config, AppCore, method, path, options = {}) {
  const cfg =
    safeObject(config, HTTP_CONFIG);

  const opts =
    safeObject(options);

  const finalMethod =
    safeText(method, "GET")
      .toUpperCase();

  const finalPath =
    safeText(path, "");

  const publicEndpoint =
    isPublicAuthEndpoint(finalPath) ||
    isTechnicalPublicRoute(finalPath);

  const defaultTimeout =
    safeNumber(
      AppCore?.config?.requestTimeout,
      safeNumber(
        cfg.timeout,
        HTTP_CONFIG.timeout
      )
    );

  const defaultAuth =
    publicEndpoint
      ? false
      : cfg.defaultAuth !== false;

  return {
    method:
      finalMethod,

    path:
      finalPath,

    body:
      null,

    headers:
      {},

    auth:
      defaultAuth,

    public:
      publicEndpoint,

    timeout:
      defaultTimeout,

    raw:
      false,

    responseType:
      cfg.defaultResponseType ||
      "auto",

    query:
      null,

    credentials:
      cfg.defaultCredentials ||
      "same-origin",

    useLoader:
      cfg.defaultUseLoader !== false,

    retries:
      safeNumber(
        cfg.retries,
        HTTP_CONFIG.retries
      ),

    retryStrategy:
      cfg.retryStrategy ||
      HTTP_CONFIG.retryStrategy,

    retryDelay:
      safeNumber(
        cfg.retryDelay,
        HTTP_CONFIG.retryDelay
      ),

    retryJitter:
      safeNumber(
        cfg.retryJitter,
        HTTP_CONFIG.retryJitter
      ),

    retryMaxDelay:
      safeNumber(
        cfg.retryMaxDelay,
        HTTP_CONFIG.retryMaxDelay
      ),

    retry:
      true,

    retryUnsafe:
      false,

    retryOnStatuses:
      cfg.retryOnStatuses || null,

    retryOnConflict:
      cfg.retryOnConflict === true,

    retryOnLocked:
      cfg.retryOnLocked === true,

    signal:
      null,

    meta:
      null,

    requestId:
      null,

    maxElapsedMs:
      0,

    _skipRetry:
      false,

    _skipAuthRefresh:
      publicEndpoint,

    _authRefreshAttempted:
      false,

    _authRefreshFailed:
      false,

    ...opts,

    method:
      safeText(opts.method || finalMethod, finalMethod).toUpperCase(),

    path:
      safeText(opts.path || finalPath, finalPath),

    signal:
      withSignal(opts.signal),

    public:
      opts.public === true || publicEndpoint,

    auth:
      opts.auth === false || opts.public === true || publicEndpoint
        ? false
        : opts.auth ?? defaultAuth,

    _skipAuthRefresh:
      opts._skipAuthRefresh === true ||
      opts.public === true ||
      opts.auth === false ||
      publicEndpoint,
  };
}
