/* =========================================================
   Onion SPA - HTTP Helpers
   Archivo: src/services/http.helpers.js

   ONION SUPPORT · HTTP HELPERS
   PURE HELPERS · RETRY SAFE · ERROR SAFE · TOKEN SAFE

   Responsabilidades:
   - Config base del servicio HTTP.
   - Helpers puros de request / retry / error.
   - Detección de endpoints auth.
   - Detección de endpoints públicos técnicos.
   - Normalización de errores.
   - Sanitización de logs/eventos/snapshots.
   - Utilidades de signal / abort / timeout.
   - Cálculo de Retry-After y delays.
   - Construcción de requestConfig por defecto.

   HARDENING EXTREMO:
   - Sin dependencias externas.
   - Sin acceso obligatorio a window/document.
   - Sin exposición de tokens en logs/summaries/errors.
   - Compatibilidad con /api/auth y /auth.
   - Activation/reset tratados como públicos.
   - Retry solo seguro por defecto.
   - Retry unsafe solo si el caller lo pide.
   - Retry-After compatible con segundos y fecha HTTP.
   - AbortController browser-safe/server-safe.
   - Headers normalizados desde Object, Headers o arrays.
========================================================= */

/* =========================================================
   CONFIG
========================================================= */

export const HTTP_CONFIG = Object.freeze({
  retries:
    1,

  retryDelay:
    400,

  retryJitter:
    120,

  retryStrategy:
    "linear",

  retryMaxDelay:
    10_000,

  retryOnStatuses:
    null,

  retryOnConflict:
    false,

  retryOnLocked:
    false,

  timeout:
    15_000,

  autoRefreshOn401:
    true,

  autoLogoutOn401:
    true,

  refreshMinIntervalMs:
    0,

  logRequests:
    true,

  logResponses:
    true,

  logErrors:
    true,

  defaultUseLoader:
    true,

  defaultAuth:
    true,

  defaultCredentials:
    "same-origin",

  defaultResponseType:
    "auto",

  defaultAccept:
    "application/json",

  defaultContentType:
    "application/json",
});

/* =========================================================
   CONSTANTS
========================================================= */

const SENSITIVE_QUERY_NAMES =
  Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "resetToken",
    "passwordResetToken",
    "confirmToken",
    "code",
    "t",
    "access_token",
    "refresh_token",
    "id_token",
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "twoFactorToken",
    "two_factor_token",
    "mfaToken",
    "mfa_token",
  ]);

const SENSITIVE_HEADER_PARTS =
  Object.freeze([
    "authorization",
    "cookie",
    "set-cookie",
    "token",
    "secret",
    "password",
    "credential",
    "apikey",
    "api-key",
    "x-api-key",
  ]);

const AUTH_ENDPOINT_MARKERS =
  Object.freeze([
    "/auth/login",
    "/auth/logout",
    "/auth/me",
    "/auth/session",
    "/auth/refresh",

    "/auth/2fa",
    "/auth/2fa/login",

    "/auth/activate",
    "/auth/activate-account",
    "/auth/account/activate",
    "/auth/activation",
    "/auth/activate/first-user",

    "/auth/reset-password",
    "/auth/reset-password-request",
    "/auth/reset-password-confirm",
    "/auth/password-reset",
    "/auth/forgot-password",
    "/auth/recover-password",

    "/auth/_health",
  ]);

const PUBLIC_AUTH_ENDPOINT_MARKERS =
  Object.freeze([
    "/auth/login",
    "/auth/refresh",

    "/auth/2fa/login",

    "/auth/activate",
    "/auth/activate-account",
    "/auth/account/activate",
    "/auth/activation",
    "/auth/activate/first-user",

    "/auth/reset-password",
    "/auth/reset-password-request",
    "/auth/reset-password-confirm",
    "/auth/password-reset",
    "/auth/forgot-password",
    "/auth/recover-password",

    "/auth/_health",
  ]);

const TECHNICAL_PUBLIC_ROUTES =
  Object.freeze([
    "/activate-account",
    "/reset-password",
    "/forgot-password",
    "/reset-password/confirm",
  ]);

const IDEMPOTENT_METHODS =
  Object.freeze([
    "GET",
    "HEAD",
    "OPTIONS",
  ]);

const DEFAULT_ERROR_MESSAGE =
  "Error en la petición";

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
        "on",
        "enabled",
        "active",
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
        "inactive",
      ].includes(clean)
    ) {
      return false;
    }
  }

  return Boolean(fallback);
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

function getBaseOrigin() {
  try {
    if (
      typeof window !== "undefined" &&
      window.location?.origin
    ) {
      return window.location.origin;
    }
  } catch {}

  return "http://localhost";
}

function escapeRegExp(value = "") {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

export function sleep(ms = 0) {
  return new Promise((resolve) => {
    try {
      setTimeout(
        resolve,
        Math.max(0, safeNumber(ms, 0))
      );
    } catch {
      resolve();
    }
  });
}

/* =========================================================
   HEADERS
========================================================= */

export function headersToPlainObject(headers = {}) {
  if (!headers) {
    return {};
  }

  if (typeof Headers !== "undefined") {
    try {
      if (headers instanceof Headers) {
        const output = {};

        headers.forEach((value, key) => {
          output[key] = value;
        });

        return output;
      }
    } catch {}
  }

  if (Array.isArray(headers)) {
    const output = {};

    for (const item of headers) {
      if (
        Array.isArray(item) &&
        item.length >= 2
      ) {
        output[safeText(item[0], "")] =
          item[1];
      }
    }

    return output;
  }

  if (isObject(headers)) {
    return {
      ...headers,
    };
  }

  return {};
}

function getHeaderValue(headers = {}, name = "") {
  const target =
    safeLower(name, "");

  if (!target) {
    return "";
  }

  if (typeof Headers !== "undefined") {
    try {
      if (headers instanceof Headers) {
        return safeText(headers.get(name), "");
      }
    } catch {}
  }

  const plain =
    headersToPlainObject(headers);

  const key =
    Object.keys(plain).find((candidate) =>
      safeLower(candidate, "") === target
    );

  return key
    ? safeText(plain[key], "")
    : "";
}

export function sanitizeHeaders(headers = {}) {
  const source =
    headersToPlainObject(headers);

  const output = {};

  for (const [key, value] of Object.entries(source)) {
    const lower =
      safeLower(key, "");

    const sensitive =
      SENSITIVE_HEADER_PARTS.some((part) =>
        lower.includes(part)
      );

    output[key] =
      sensitive && value
        ? "***"
        : value;
  }

  return output;
}

/* =========================================================
   SANITIZE / REDACT
========================================================= */

export function redactHttpValue(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  for (const name of SENSITIVE_QUERY_NAMES) {
    try {
      output =
        output.replace(
          new RegExp(
            `([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`,
            "gi"
          ),
          "$1***"
        );
    } catch {}
  }

  try {
    output =
      output.replace(
        /(\/activate-account\/)([^/?#\s]+)/gi,
        "$1***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
        "$1***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /(authorization["'\s:=]+)(Bearer\s+)?([A-Za-z0-9._~+/=-]+)/gi,
        "$1$2***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        "***"
      );
  } catch {}

  return output;
}

function isDomNodeLike(value) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  try {
    return Boolean(
      typeof Node !== "undefined" &&
        value instanceof Node
    );
  } catch {}

  try {
    return Boolean(
      value.nodeType &&
        value.nodeName
    );
  } catch {}

  return false;
}

export function sanitizeData(value, depth = 0) {
  if (depth > 6) {
    return "[MaxDepth]";
  }

  if (typeof value === "string") {
    return redactHttpValue(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (isDomNodeLike(value)) {
    return {
      node:
        safeText(value.nodeName, "Node"),

      id:
        safeText(value.id, ""),

      className:
        safeText(value.className, ""),
    };
  }

  if (value instanceof Error) {
    return {
      name:
        safeText(value.name, "Error"),

      message:
        redactHttpValue(value.message || ""),

      code:
        value.code || null,

      status:
        value.status || value.statusCode || null,
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 80)
      .map((item) =>
        sanitizeData(item, depth + 1)
      );
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (
        /token|secret|password|authorization|credential|cookie/i.test(key)
      ) {
        output[key] =
          item ? "***" : item;

        continue;
      }

      output[key] =
        sanitizeData(item, depth + 1);
    }

    return output;
  }

  return redactHttpValue(String(value));
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
      cfg.token ? "***" : null,

    accessToken:
      cfg.accessToken ? "***" : null,

    refreshToken:
      cfg.refreshToken ? "***" : null,

    signal:
      cfg.signal
        ? "[AbortSignal]"
        : null,
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
        getBaseOrigin()
      );

    return safeLower(
      parsed.pathname || raw
    ).replace(/\/{2,}/g, "/");
  } catch {}

  return safeLower(
    raw
      .split("?")[0]
      .split("#")[0] ||
      raw
  ).replace(/\/{2,}/g, "/");
}

function stripApiPrefix(path = "") {
  const normalized =
    normalizeEndpointPath(path);

  if (normalized.startsWith("/api/")) {
    return normalized.slice(4) || "/";
  }

  if (normalized === "/api") {
    return "/";
  }

  return normalized;
}

function getComparableEndpointPaths(path = "") {
  const normalized =
    normalizeEndpointPath(path);

  const noApi =
    stripApiPrefix(normalized);

  return Array.from(
    new Set([
      normalized,
      noApi,
    ].filter(Boolean))
  );
}

function endpointMatches(path = "", markers = []) {
  const paths =
    getComparableEndpointPaths(path);

  return safeArray(markers).some((marker) => {
    const cleanMarker =
      normalizeEndpointPath(marker);

    if (!cleanMarker) {
      return false;
    }

    return paths.some((candidate) =>
      candidate.includes(cleanMarker)
    );
  });
}

export function isAuthEndpoint(path = "") {
  return endpointMatches(
    path,
    AUTH_ENDPOINT_MARKERS
  );
}

export function isPublicAuthEndpoint(path = "") {
  return endpointMatches(
    path,
    PUBLIC_AUTH_ENDPOINT_MARKERS
  );
}

export function isTechnicalPublicRoute(path = "") {
  const paths =
    getComparableEndpointPaths(path);

  return TECHNICAL_PUBLIC_ROUTES.some((route) => {
    const clean =
      normalizeEndpointPath(route);

    return paths.some((candidate) =>
      candidate === clean ||
      candidate.startsWith(`${clean}/`)
    );
  });
}

export function isTechnicalPublicSpaEndpoint(path = "") {
  return isTechnicalPublicRoute(path);
}

export function isPublicEndpoint(path = "") {
  return (
    isPublicAuthEndpoint(path) ||
    isTechnicalPublicRoute(path)
  );
}

/* =========================================================
   LOG FLAGS
========================================================= */

export function shouldToggleGlobalLoader(requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

  if (cfg.useLoader === false) return false;
  if (cfg.loader === false) return false;
  if (cfg.noLoader === true) return false;
  if (cfg.silent === true) return false;
  if (cfg.background === true) return false;

  return true;
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
  return Boolean(
    config?.logErrors
  );
}

/* =========================================================
   ABORT / TIMEOUT
========================================================= */

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

export function isAbortError(error) {
  const name =
    safeText(error?.name || "");

  const message =
    safeLower(error?.message || "");

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
  const name =
    safeLower(error?.name || "");

  const message =
    safeLower(error?.message || "");

  const reason =
    safeLower(error?.reason || "");

  const code =
    safeLower(error?.code || "");

  return (
    error?.timeout === true ||
    name.includes("timeout") ||
    code.includes("timeout") ||
    message.includes("timeout") ||
    reason.includes("timeout") ||
    message.includes("timed out")
  );
}

/* =========================================================
   RETRY
========================================================= */

export function isIdempotentMethod(method = "GET") {
  return IDEMPOTENT_METHODS.includes(
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

  if (isTimeoutError(error)) {
    return true;
  }

  const status =
    safeNumber(
      error?.status ??
        error?.response?.status,
      0
    );

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

  if (status >= 500 && status <= 599) {
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

  if (!Number.isFinite(numericStatus)) {
    return false;
  }

  return retryOnStatuses.some((candidate) => {
    if (typeof candidate === "number") {
      return candidate === numericStatus;
    }

    const rule =
      safeLower(candidate, "");

    if (!rule) {
      return false;
    }

    if (rule === "5xx") {
      return numericStatus >= 500 &&
        numericStatus <= 599;
    }

    if (rule === "4xx") {
      return numericStatus >= 400 &&
        numericStatus <= 499;
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
      dateMs - nowMs()
    );
  }

  return 0;
}

export function buildRetryDelay(config, requestConfig = {}, attempt = 0, error = null) {
  const cfg = {
    ...HTTP_CONFIG,
    ...safeObject(config),
  };

  const req =
    safeObject(requestConfig);

  const retryAfter =
    getHeaderValue(error?.headers, "retry-after") ||
    getHeaderValue(error?.response?.headers, "retry-after");

  const retryAfterMs =
    parseRetryAfterMs(retryAfter);

  const maxDelay =
    Math.max(
      0,
      safeNumber(
        req.retryMaxDelay ??
          cfg.retryMaxDelay,
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
      req.retryStrategy ||
        cfg.retryStrategy ||
        HTTP_CONFIG.retryStrategy,
      HTTP_CONFIG.retryStrategy
    );

  const baseDelay =
    Math.max(
      0,
      safeNumber(
        req.retryDelay ??
          cfg.retryDelay,
        HTTP_CONFIG.retryDelay
      )
    );

  const jitter =
    Math.max(
      0,
      safeNumber(
        req.retryJitter ??
          cfg.retryJitter,
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
  const cfg = {
    ...HTTP_CONFIG,
    ...safeObject(config),
  };

  const req =
    safeObject(requestConfig);

  if (req.retry === false) {
    return false;
  }

  if (req._skipRetry === true) {
    return false;
  }

  if (
    error?.aborted === true ||
    isAbortError(error)
  ) {
    return false;
  }

  const maxRetries =
    Number.isFinite(Number(req.retries))
      ? Number(req.retries)
      : safeNumber(cfg.retries, HTTP_CONFIG.retries);

  if (attempt >= maxRetries) {
    return false;
  }

  const maxElapsedMs =
    safeNumber(req.maxElapsedMs, 0);

  const startedAt =
    safeNumber(
      req.startedAt ||
        req._startedAt,
      0
    );

  if (
    maxElapsedMs > 0 &&
    startedAt > 0 &&
    nowMs() - startedAt >= maxElapsedMs
  ) {
    return false;
  }

  const status =
    safeNumber(
      error?.status ??
        error?.response?.status,
      0
    );

  const retryOnStatuses =
    Array.isArray(req.retryOnStatuses)
      ? req.retryOnStatuses
      : cfg.retryOnStatuses;

  if (Array.isArray(retryOnStatuses)) {
    return Boolean(
      matchesStatusRule(
        status,
        retryOnStatuses
      )
    );
  }

  const method =
    safeText(
      req.method,
      "GET"
    ).toUpperCase();

  const allowUnsafeRetry =
    req.retryUnsafe === true;

  if (
    !isIdempotentMethod(method) &&
    !allowUnsafeRetry
  ) {
    return false;
  }

  return isRetryableError(error, {
    retryOnConflict:
      req.retryOnConflict ??
      cfg.retryOnConflict,

    retryOnLocked:
      req.retryOnLocked ??
      cfg.retryOnLocked,
  });
}

/* =========================================================
   ERROR NORMALIZATION
========================================================= */

function extractErrorData(error = null) {
  if (!error) {
    return null;
  }

  return (
    error?.data ||
    error?.body ||
    error?.payload ||
    error?.response?.data ||
    error?.response?.body ||
    null
  );
}

function extractErrorMessage(error, fallback = DEFAULT_ERROR_MESSAGE) {
  if (!error) {
    return fallback;
  }

  const data =
    extractErrorData(error);

  return (
    safeText(data?.message, "") ||
    safeText(data?.error, "") ||
    safeText(data?.detail, "") ||
    safeText(data?.title, "") ||
    safeText(error?.message, "") ||
    safeText(error?.statusText, "") ||
    safeText(error?.response?.statusText, "") ||
    fallback
  );
}

function extractErrorHeaders(error = null) {
  return (
    error?.headers ||
    error?.response?.headers ||
    null
  );
}

function defineRawError(target, raw) {
  if (!target || !raw) {
    return target;
  }

  try {
    Object.defineProperty(
      target,
      "raw",
      {
        value:
          raw,

        enumerable:
          false,

        configurable:
          true,
      }
    );
  } catch {
    try {
      target.raw =
        raw;
    } catch {}
  }

  return target;
}

export function normalizeError(error, requestConfig = null) {
  const cfg =
    requestConfig
      ? sanitizeRequestConfig(requestConfig)
      : null;

  if (
    error?.name === "HttpErrorNormalized"
  ) {
    const normalizedAgain = {
      ...error,

      message:
        redactHttpValue(
          safeText(error.message, DEFAULT_ERROR_MESSAGE)
        ),

      url:
        redactHttpValue(error.url || ""),

      redactedUrl:
        redactHttpValue(error.redactedUrl || error.url || ""),

      data:
        sanitizeData(error.data || null),

      headers:
        sanitizeHeaders(error.headers || {}),

      requestConfig:
        sanitizeRequestConfig(
          error.requestConfig ||
          requestConfig ||
          {}
        ),

      at:
        error.at || isoNow(),
    };

    return defineRawError(
      normalizedAgain,
      error.raw || error
    );
  }

  const status =
    safeNumber(
      error?.status ??
        error?.statusCode ??
        error?.response?.status,
      0
    );

  const statusText =
    safeText(
      error?.statusText ??
        error?.response?.statusText,
      ""
    );

  const method =
    safeText(
      error?.method ||
        requestConfig?.method ||
        "",
      ""
    ).toUpperCase() || null;

  const url =
    redactHttpValue(
      error?.redactedUrl ||
        error?.url ||
        error?.path ||
        requestConfig?.url ||
        requestConfig?.path ||
        ""
    );

  const data =
    extractErrorData(error);

  const headers =
    extractErrorHeaders(error);

  const normalized = {
    name:
      "HttpErrorNormalized",

    message:
      redactHttpValue(
        extractErrorMessage(error)
      ),

    status,

    statusText,

    data:
      sanitizeData(data),

    headers:
      sanitizeHeaders(headers),

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

    public:
      requestConfig?.public === true,

    auth:
      requestConfig?.auth !== false,

    at:
      isoNow(),
  };

  return defineRawError(
    normalized,
    error
  );
}

/* =========================================================
   REQUEST CONFIG
========================================================= */

export function buildRequestSummary(requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

  return {
    requestId:
      cfg.requestId || null,

    method:
      safeText(cfg.method, "GET").toUpperCase(),

    path:
      redactHttpValue(
        cfg.path || cfg.url || ""
      ) || null,

    query:
      sanitizeData(cfg.query || null),

    auth:
      cfg.auth !== false,

    public:
      cfg.public === true,

    retries:
      cfg.retries ?? null,

    retry:
      cfg.retry !== false,

    retryStrategy:
      cfg.retryStrategy ||
      "linear",

    useLoader:
      shouldToggleGlobalLoader(cfg),

    responseType:
      cfg.responseType ||
      "auto",

    timeout:
      cfg.timeout ?? null,

    raw:
      cfg.raw === true,

    upload:
      cfg.upload === true,

    skipRetry:
      cfg._skipRetry === true,

    skipAuthRefresh:
      cfg._skipAuthRefresh === true,
  };
}

function resolveDefaultTimeout(baseConfig = {}, AppCore = null) {
  const fromCore =
    safeNumber(
      AppCore?.config?.requestTimeout ??
        AppCore?.config?.httpTimeout ??
        AppCore?.config?.timeout,
      NaN
    );

  if (Number.isFinite(fromCore)) {
    return fromCore;
  }

  return safeNumber(
    baseConfig.timeout,
    HTTP_CONFIG.timeout
  );
}

function shouldDefaultPublic(path = "", options = {}) {
  const opts =
    safeObject(options);

  return Boolean(
    opts.public === true ||
      opts.auth === false ||
      isPublicEndpoint(path)
  );
}

export function buildDefaultRequestConfig(config, AppCore, method, path, options = {}) {
  const cfg = {
    ...HTTP_CONFIG,
    ...safeObject(config),
  };

  const opts =
    safeObject(options);

  const finalMethod =
    safeText(
      opts.method || method,
      "GET"
    ).toUpperCase();

  const finalPath =
    safeText(
      opts.path || path,
      ""
    );

  const publicEndpoint =
    shouldDefaultPublic(
      finalPath,
      opts
    );

  const defaultTimeout =
    resolveDefaultTimeout(
      cfg,
      AppCore
    );

  const defaultAuth =
    publicEndpoint
      ? false
      : cfg.defaultAuth !== false;

  const defaultUseLoader =
    cfg.defaultUseLoader !== false;

  const base = {
    method:
      finalMethod,

    path:
      finalPath,

    url:
      "",

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

    rawBody:
      false,

    upload:
      false,

    responseType:
      cfg.defaultResponseType ||
      HTTP_CONFIG.defaultResponseType,

    query:
      null,

    credentials:
      cfg.defaultCredentials ||
      HTTP_CONFIG.defaultCredentials,

    useLoader:
      defaultUseLoader,

    retries:
      safeNumber(
        cfg.retries,
        HTTP_CONFIG.retries
      ),

    retry:
      true,

    retryUnsafe:
      false,

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

    retryOnStatuses:
      cfg.retryOnStatuses || null,

    retryOnConflict:
      cfg.retryOnConflict === true,

    retryOnLocked:
      cfg.retryOnLocked === true,

    maxElapsedMs:
      0,

    signal:
      null,

    meta:
      null,

    requestId:
      null,

    startedAt:
      0,

    _startedAt:
      0,

    _skipRetry:
      false,

    _skipAuthRefresh:
      publicEndpoint,

    _authRefreshAttempted:
      false,

    _authRefreshSucceeded:
      false,

    _authRefreshFailed:
      false,
  };

  const merged = {
    ...base,
    ...opts,
  };

  const mergedPublic =
    shouldDefaultPublic(
      merged.path || finalPath,
      merged
    );

  const mergedAuth =
    merged.auth === false ||
    merged.public === true ||
    mergedPublic
      ? false
      : merged.auth ?? defaultAuth;

  const headers =
    headersToPlainObject(
      merged.headers
    );

  return {
    ...merged,

    method:
      safeText(
        merged.method || finalMethod,
        finalMethod
      ).toUpperCase(),

    path:
      safeText(
        merged.path || finalPath,
        finalPath
      ),

    headers,

    timeout:
      safeNumber(
        merged.timeout,
        defaultTimeout
      ),

    responseType:
      safeText(
        merged.responseType,
        cfg.defaultResponseType ||
          HTTP_CONFIG.defaultResponseType
      ),

    credentials:
      safeText(
        merged.credentials,
        cfg.defaultCredentials ||
          HTTP_CONFIG.defaultCredentials
      ),

    retries:
      safeNumber(
        merged.retries,
        safeNumber(cfg.retries, HTTP_CONFIG.retries)
      ),

    retry:
      merged.retry !== false,

    retryUnsafe:
      merged.retryUnsafe === true,

    retryStrategy:
      safeText(
        merged.retryStrategy,
        cfg.retryStrategy ||
          HTTP_CONFIG.retryStrategy
      ),

    retryDelay:
      safeNumber(
        merged.retryDelay,
        safeNumber(cfg.retryDelay, HTTP_CONFIG.retryDelay)
      ),

    retryJitter:
      safeNumber(
        merged.retryJitter,
        safeNumber(cfg.retryJitter, HTTP_CONFIG.retryJitter)
      ),

    retryMaxDelay:
      safeNumber(
        merged.retryMaxDelay,
        safeNumber(cfg.retryMaxDelay, HTTP_CONFIG.retryMaxDelay)
      ),

    retryOnStatuses:
      Array.isArray(merged.retryOnStatuses)
        ? merged.retryOnStatuses
        : cfg.retryOnStatuses || null,

    retryOnConflict:
      safeBoolean(
        merged.retryOnConflict,
        cfg.retryOnConflict === true
      ),

    retryOnLocked:
      safeBoolean(
        merged.retryOnLocked,
        cfg.retryOnLocked === true
      ),

    signal:
      withSignal(merged.signal),

    public:
      mergedPublic,

    auth:
      mergedAuth,

    useLoader:
      shouldToggleGlobalLoader({
        ...merged,
        useLoader:
          merged.useLoader ?? defaultUseLoader,
      }),

    _skipRetry:
      merged._skipRetry === true,

    _skipAuthRefresh:
      merged._skipAuthRefresh === true ||
      mergedPublic ||
      mergedAuth === false,

    _authRefreshAttempted:
      merged._authRefreshAttempted === true,

    _authRefreshSucceeded:
      merged._authRefreshSucceeded === true,

    _authRefreshFailed:
      merged._authRefreshFailed === true,
  };
}
