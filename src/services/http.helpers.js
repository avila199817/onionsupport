/* =========================================================
   Onion SPA - HTTP Helpers
   Archivo: src/services/http.helpers.js

   ONION SUPPORT · HTTP HELPERS
   PURE HELPERS · RETRY SAFE · ERROR SAFE · TOKEN SAFE · 16/10

   RESPONSABILIDADES:
   - Config base del servicio HTTP.
   - Helpers puros de request / retry / error.
   - Detección de endpoints auth.
   - Detección de endpoints públicos técnicos.
   - Normalización de errores.
   - Sanitización de logs/eventos/snapshots.
   - Utilidades de signal / abort / timeout.
   - Cálculo de Retry-After y delays.
   - Construcción de requestConfig por defecto.
   - Normalización de headers desde Object, Headers o arrays.
   - Soporte robusto para Core Request, Http Service y retry engine.

   HARDENING EXTREMO:
   - Sin dependencias externas.
   - Sin acceso obligatorio a window/document.
   - Sin exposición de tokens en logs/summaries/errors.
   - Compatibilidad con /api/auth y /auth.
   - /api/auth/me, /auth/me, /api/me y /me NO son públicos.
   - Activation/reset tratados como públicos.
   - Retry solo seguro por defecto.
   - Retry unsafe solo si el caller lo pide.
   - Retry-After compatible con segundos y fecha HTTP.
   - AbortController browser-safe/server-safe.
   - Headers normalizados desde Object, Headers o arrays.
   - Error.raw no enumerable.
   - Snapshots y summaries redactados.
   - Eventos HTTP low-level apagados por defecto desde config.

   FIX CRÍTICO 16/10:
   - sanitizeData() con WeakSet anti-circular.
   - sanitizeData() con límite real de profundidad, claves, arrays y strings.
   - sanitizeData() no intenta recorrer Response/Request/Headers/FormData/Blob.
   - sanitizeRequestConfig() ya NO hace spread completo del requestConfig.
   - normalizeError() ya NO arrastra objetos raw/response/request gigantes.
   - Redacción con regex cacheadas para evitar rebuild masivo en loops.
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

  /*
    Backend real cross-origin:
    https://api.onionit.net
  */
  defaultCredentials:
    "include",

  defaultResponseType:
    "auto",

  defaultAccept:
    "application/json",

  defaultContentType:
    "application/json",

  requestIdHeader:
    "X-Request-Id",

  clientHeader:
    "X-Onion-Client",

  clientHeaderValue:
    "onion-spa",

  emitLifecycleEvents:
    false,

  emitFinalEvents:
    true,

  emitReadyEvent:
    true,

  emitBridgeEvent:
    false,

  emitInterceptorEvents:
    false,

  emitInitSkippedEvents:
    false,

  emitRefreshEvents:
    true,

  emitReplayEvents:
    true,

  emitAutoLogoutEvents:
    true,

  emitRuntimeEvents:
    false,

  emitAuthRefreshEvents:
    false,

  emitRequestEngineEvents:
    false,
});

/* =========================================================
   CONSTANTS
========================================================= */

export const HTTP_HELPERS_VERSION =
  "16.0.0";

const DEFAULT_METHOD =
  "GET";

const DEFAULT_ERROR_MESSAGE =
  "Error en la petición";

const LOCAL_ORIGIN =
  "http://localhost";

const MAX_SANITIZE_DEPTH =
  5;

const MAX_SANITIZE_ARRAY_ITEMS =
  50;

const MAX_SANITIZE_OBJECT_KEYS =
  80;

const MAX_SANITIZE_STRING_LENGTH =
  4_000;

const MAX_REDACT_INPUT_LENGTH =
  12_000;

const KNOWN_METHODS =
  Object.freeze([
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ]);

const BODYLESS_METHODS =
  Object.freeze([
    "GET",
    "HEAD",
    "OPTIONS",
  ]);

const IDEMPOTENT_METHODS =
  Object.freeze([
    "GET",
    "HEAD",
    "OPTIONS",
  ]);

const SENSITIVE_QUERY_NAMES =
  Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "activation_token",
    "activate_token",
    "resetToken",
    "passwordResetToken",
    "password_reset_token",
    "confirmToken",
    "confirm_token",
    "code",
    "otp",
    "totp",
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
    "jwt",
    "bearer",
    "auth",
    "authorization",
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
    "jwt",
    "bearer",
    "refresh",
    "access",
    "otp",
    "mfa",
    "2fa",
    "csrf",
    "xsrf",
  ]);

const SENSITIVE_OBJECT_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

const HEAVY_OBJECT_KEY_RE =
  /^(raw|response|request|requestInit|fetchInit|controller|abortController|signal|stack|source|target|currentTarget|nativeEvent|event|promise|reader|stream)$/i;

const AUTH_ME_ENDPOINTS =
  Object.freeze([
    "/me",
    "/api/me",
    "/auth/me",
    "/api/auth/me",
  ]);

const AUTH_ENDPOINT_MARKERS =
  Object.freeze([
    "/auth/login",
    "/auth/logout",
    "/auth/logout-all",
    "/auth/me",
    "/auth/session",
    "/auth/refresh",

    "/auth/2fa",
    "/auth/2fa/login",
    "/auth/mfa",
    "/auth/mfa/login",
    "/auth/otp",
    "/auth/otp/login",

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
    "/auth/mfa/login",
    "/auth/otp/login",

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

const AUTH_CONTROL_SKIP_REFRESH_MARKERS =
  Object.freeze([
    "/auth/login",
    "/auth/refresh",
    "/auth/logout",
    "/auth/logout-all",

    "/auth/2fa/login",
    "/auth/mfa/login",
    "/auth/otp/login",

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
    "/recover-password",
    "/password-reset",
    "/reset-password/confirm",
  ]);

const DEFAULT_RETRYABLE_STATUSES =
  Object.freeze([
    408,
    425,
    429,
    500,
    502,
    503,
    504,
  ]);

const CORRUPT_TEXT_VALUES =
  Object.freeze([
    "undefined",
    "null",
    "nan",
    "[object object]",
  ]);

/* =========================================================
   BASICS
========================================================= */

export function isFn(value) {
  return typeof value === "function";
}

export function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

export function isAnyObject(value) {
  return (
    value !== null &&
    typeof value === "object"
  );
}

export function safeObject(value, fallback = {}) {
  return isObject(value)
    ? value
    : fallback;
}

export function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

export function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  if (!text) {
    return fallback;
  }

  if (
    CORRUPT_TEXT_VALUES.includes(
      text.toLowerCase()
    )
  ) {
    return fallback;
  }

  return text;
}

export function safeLower(value = "", fallback = "") {
  return safeText(
    value,
    fallback
  ).toLowerCase();
}

export function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

export function safeBoolean(value, fallback = false) {
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
        "ok",
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

export function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

export function isoNow(ms = nowMs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

export function getBaseOrigin() {
  try {
    if (
      typeof window !== "undefined" &&
      window.location?.origin
    ) {
      return window.location.origin;
    }
  } catch {}

  return LOCAL_ORIGIN;
}

export function escapeRegExp(value = "") {
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
        Math.max(
          0,
          safeNumber(ms, 0)
        )
      );
    } catch {
      resolve();
    }
  });
}

export function normalizeMethod(method = DEFAULT_METHOD) {
  const clean =
    safeText(method, DEFAULT_METHOD)
      .toUpperCase();

  return KNOWN_METHODS.includes(clean)
    ? clean
    : DEFAULT_METHOD;
}

export function isKnownMethod(method = "") {
  return KNOWN_METHODS.includes(
    safeText(method, "")
      .toUpperCase()
  );
}

export function isBodylessMethod(method = DEFAULT_METHOD) {
  return BODYLESS_METHODS.includes(
    normalizeMethod(method)
  );
}

/* =========================================================
   STRING / REDACTION INTERNALS
========================================================= */

let redactionQueryRulesCache =
  null;

function getRedactionQueryRules() {
  if (redactionQueryRulesCache) {
    return redactionQueryRulesCache;
  }

  redactionQueryRulesCache =
    SENSITIVE_QUERY_NAMES.map((name) => {
      try {
        return new RegExp(
          `([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`,
          "gi"
        );
      } catch {
        return null;
      }
    }).filter(Boolean);

  return redactionQueryRulesCache;
}

function trimForRedaction(value = "") {
  const text =
    String(value ?? "");

  if (text.length <= MAX_REDACT_INPUT_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_REDACT_INPUT_LENGTH)}…[truncated:${text.length}]`;
}

function previewString(value = "", maxLength = MAX_SANITIZE_STRING_LENGTH) {
  const text =
    String(value ?? "");

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}…[truncated:${text.length}]`;
}

/* =========================================================
   SANITIZE / REDACT
========================================================= */

export function redactHttpValue(value = "") {
  let output =
    trimForRedaction(value).trim();

  if (!output) {
    return "";
  }

  for (const rule of getRedactionQueryRules()) {
    try {
      output =
        output.replace(
          rule,
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

function getObjectTag(value) {
  try {
    return Object.prototype.toString.call(value);
  } catch {
    return "";
  }
}

function isArrayBufferLike(value) {
  try {
    return (
      typeof ArrayBuffer !== "undefined" &&
      (
        value instanceof ArrayBuffer ||
        ArrayBuffer.isView?.(value)
      )
    );
  } catch {
    return false;
  }
}

function sanitizeSpecialObject(value, depth, keyHint, seen) {
  if (!value) {
    return value;
  }

  if (isDomNodeLike(value)) {
    return {
      type:
        "DOMNode",

      node:
        safeText(value.nodeName, "Node"),

      id:
        safeText(value.id, ""),

      className:
        safeText(
          value.className?.baseVal ||
            value.className,
          ""
        ),
    };
  }

  try {
    if (
      typeof Headers !== "undefined" &&
      value instanceof Headers
    ) {
      return sanitizeHeaders(value);
    }
  } catch {}

  try {
    if (
      typeof Request !== "undefined" &&
      value instanceof Request
    ) {
      return {
        type:
          "Request",

        method:
          safeText(value.method, ""),

        url:
          redactHttpValue(value.url || ""),

        credentials:
          safeText(value.credentials, ""),

        cache:
          safeText(value.cache, ""),

        mode:
          safeText(value.mode, ""),

        headers:
          sanitizeHeaders(value.headers),
      };
    }
  } catch {}

  try {
    if (
      typeof Response !== "undefined" &&
      value instanceof Response
    ) {
      return {
        type:
          "Response",

        status:
          value.status || 0,

        ok:
          Boolean(value.ok),

        statusText:
          safeText(value.statusText, ""),

        url:
          redactHttpValue(value.url || ""),

        redirected:
          Boolean(value.redirected),

        headers:
          sanitizeHeaders(value.headers),
      };
    }
  } catch {}

  try {
    if (
      typeof URL !== "undefined" &&
      value instanceof URL
    ) {
      return redactHttpValue(value.toString());
    }
  } catch {}

  try {
    if (
      typeof URLSearchParams !== "undefined" &&
      value instanceof URLSearchParams
    ) {
      const output = {};

      for (const [paramKey, paramValue] of value.entries()) {
        output[paramKey] =
          SENSITIVE_OBJECT_KEY_RE.test(paramKey)
            ? "***"
            : redactHttpValue(paramValue);
      }

      return output;
    }
  } catch {}

  try {
    if (
      typeof AbortSignal !== "undefined" &&
      value instanceof AbortSignal
    ) {
      return {
        type:
          "AbortSignal",

        aborted:
          Boolean(value.aborted),

        reason:
          value.aborted
            ? safeText(value.reason, "")
            : null,
      };
    }
  } catch {}

  try {
    if (
      typeof FormData !== "undefined" &&
      value instanceof FormData
    ) {
      const keys = [];

      try {
        for (const key of value.keys()) {
          keys.push(key);
        }
      } catch {}

      return {
        type:
          "FormData",

        keys:
          keys.slice(0, 30),
      };
    }
  } catch {}

  try {
    if (
      typeof Blob !== "undefined" &&
      value instanceof Blob
    ) {
      return {
        type:
          value.constructor?.name || "Blob",

        mime:
          safeText(value.type, ""),

        size:
          safeNumber(value.size, 0),
      };
    }
  } catch {}

  if (isArrayBufferLike(value)) {
    return {
      type:
        value.constructor?.name || "ArrayBuffer",

      byteLength:
        safeNumber(value.byteLength, 0),
    };
  }

  try {
    if (
      typeof ReadableStream !== "undefined" &&
      value instanceof ReadableStream
    ) {
      return "[ReadableStream]";
    }
  } catch {}

  if (value instanceof Date) {
    try {
      return value.toISOString();
    } catch {
      return String(value);
    }
  }

  if (value instanceof RegExp) {
    return String(value);
  }

  if (value instanceof Error) {
    const output = {
      name:
        safeText(value.name, "Error"),

      message:
        redactHttpValue(value.message || ""),

      code:
        value.code || null,

      status:
        value.status ||
        value.statusCode ||
        value.response?.status ||
        null,

      statusText:
        value.statusText ||
        value.response?.statusText ||
        null,

      timeout:
        Boolean(value.timeout),

      aborted:
        Boolean(value.aborted),

      stack:
        value.stack ? "[stack]" : null,
    };

    if (value.data !== undefined) {
      output.data =
        sanitizeDataInternal(
          value.data,
          depth + 1,
          "data",
          seen
        );
    }

    if (value.body !== undefined) {
      output.body =
        sanitizeDataInternal(
          value.body,
          depth + 1,
          "body",
          seen
        );
    }

    if (value.headers !== undefined) {
      output.headers =
        sanitizeHeaders(value.headers);
    }

    if (value.url) {
      output.url =
        redactHttpValue(value.url);
    }

    if (value.requestId) {
      output.requestId =
        safeText(value.requestId, "");
    }

    return output;
  }

  const tag =
    getObjectTag(value);

  if (
    tag === "[object Promise]" ||
    isFn(value.then)
  ) {
    return "[Promise]";
  }

  return null;
}

function sanitizeDataInternal(value, depth = 0, keyHint = "", seen = new WeakSet()) {
  const cleanKeyHint =
    safeText(keyHint, "");

  if (
    cleanKeyHint &&
    SENSITIVE_OBJECT_KEY_RE.test(cleanKeyHint)
  ) {
    return value
      ? "***"
      : null;
  }

  if (depth > MAX_SANITIZE_DEPTH) {
    return "[MaxDepth]";
  }

  if (typeof value === "string") {
    return previewString(
      redactHttpValue(value)
    );
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (isAnyObject(value)) {
    try {
      if (seen.has(value)) {
        return "[Circular]";
      }

      seen.add(value);
    } catch {}
  }

  const special =
    sanitizeSpecialObject(
      value,
      depth,
      cleanKeyHint,
      seen
    );

  if (special !== null) {
    return special;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_SANITIZE_ARRAY_ITEMS)
      .map((item) =>
        sanitizeDataInternal(
          item,
          depth + 1,
          cleanKeyHint,
          seen
        )
      );
  }

  if (isAnyObject(value)) {
    const output = {};

    const entries =
      Object.entries(value)
        .slice(0, MAX_SANITIZE_OBJECT_KEYS);

    for (const [key, item] of entries) {
      if (SENSITIVE_OBJECT_KEY_RE.test(key)) {
        output[key] =
          item ? "***" : item;

        continue;
      }

      if (HEAVY_OBJECT_KEY_RE.test(key)) {
        output[key] =
          item
            ? `[${key}]`
            : item;

        continue;
      }

      output[key] =
        sanitizeDataInternal(
          item,
          depth + 1,
          key,
          seen
        );
    }

    const totalKeys =
      Object.keys(value).length;

    if (totalKeys > MAX_SANITIZE_OBJECT_KEYS) {
      output.__truncatedKeys =
        totalKeys - MAX_SANITIZE_OBJECT_KEYS;
    }

    return output;
  }

  return previewString(
    redactHttpValue(String(value))
  );
}

export function sanitizeData(value, depth = 0, keyHint = "", seenArg = null) {
  let finalKeyHint =
    keyHint;

  let seen =
    seenArg;

  try {
    if (
      typeof WeakSet !== "undefined" &&
      keyHint instanceof WeakSet
    ) {
      seen =
        keyHint;

      finalKeyHint =
        "";
    }
  } catch {}

  if (
    !seen ||
    typeof seen !== "object"
  ) {
    seen =
      new WeakSet();
  }

  return sanitizeDataInternal(
    value,
    depth,
    finalKeyHint,
    seen
  );
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
          output[key] =
            value;
        });

        return output;
      }
    } catch {}
  }

  try {
    if (
      headers &&
      isFn(headers.forEach)
    ) {
      const output = {};

      headers.forEach((value, key) => {
        output[key] =
          value;
      });

      return output;
    }
  } catch {}

  if (Array.isArray(headers)) {
    const output = {};

    for (const item of headers) {
      if (
        Array.isArray(item) &&
        item.length >= 2
      ) {
        const key =
          safeText(item[0], "");

        if (key) {
          output[key] =
            item[1];
        }
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

export function normalizeHeaders(headers = {}) {
  const source =
    headersToPlainObject(headers);

  const output = {};

  for (const [key, value] of Object.entries(source)) {
    const cleanKey =
      safeText(key, "");

    if (!cleanKey) {
      continue;
    }

    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      continue;
    }

    const existingKey =
      Object.keys(output).find((candidate) =>
        safeLower(candidate, "") === safeLower(cleanKey, "")
      );

    output[existingKey || cleanKey] =
      value;
  }

  return output;
}

export function getHeaderValue(headers = {}, name = "") {
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

export function hasHeader(headers = {}, name = "") {
  return getHeaderValue(
    headers,
    name
  ) !== "";
}

export function setHeader(headers = {}, name = "", value = "") {
  const output =
    normalizeHeaders(headers);

  const cleanName =
    safeText(name, "");

  if (
    !cleanName ||
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return output;
  }

  const existingKey =
    Object.keys(output).find((candidate) =>
      safeLower(candidate, "") === safeLower(cleanName, "")
    );

  output[existingKey || cleanName] =
    value;

  return output;
}

export function deleteHeader(headers = {}, name = "") {
  const output =
    normalizeHeaders(headers);

  const target =
    safeLower(name, "");

  if (!target) {
    return output;
  }

  for (const key of Object.keys(output)) {
    if (safeLower(key, "") === target) {
      delete output[key];
    }
  }

  return output;
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
        : sanitizeData(value, 0, key);
  }

  return output;
}

/* =========================================================
   REQUEST CONFIG SANITIZE
========================================================= */

export function sanitizeRequestConfig(requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

  const output = {
    requestId:
      cfg.requestId || null,

    method:
      normalizeMethod(cfg.method || DEFAULT_METHOD),

    path:
      redactHttpValue(cfg.path || ""),

    url:
      redactHttpValue(cfg.url || ""),

    apiBase:
      redactHttpValue(cfg.apiBase || ""),

    headers:
      sanitizeHeaders(cfg.headers || {}),

    query:
      sanitizeData(cfg.query ?? cfg.params ?? null, 0, "query"),

    params:
      sanitizeData(cfg.params ?? null, 0, "params"),

    body:
      sanitizeData(cfg.body ?? null, 0, "body"),

    auth:
      cfg.auth !== false,

    public:
      cfg.public === true,

    skipAuth:
      cfg.skipAuth === true,

    credentials:
      safeText(cfg.credentials, ""),

    useLoader:
      shouldToggleGlobalLoader(cfg),

    silent:
      cfg.silent === true,

    background:
      cfg.background === true,

    responseType:
      safeText(cfg.responseType, "auto"),

    timeout:
      cfg.timeout ?? null,

    raw:
      cfg.raw === true,

    rawBody:
      cfg.rawBody === true,

    upload:
      cfg.upload === true,

    download:
      cfg.download === true,

    retries:
      cfg.retries ?? null,

    retry:
      cfg.retry !== false,

    retryUnsafe:
      cfg.retryUnsafe === true,

    retryUnsafeMethods:
      cfg.retryUnsafeMethods === true,

    retryStrategy:
      safeText(cfg.retryStrategy, ""),

    retryDelay:
      cfg.retryDelay ?? null,

    retryJitter:
      cfg.retryJitter ?? null,

    retryMaxDelay:
      cfg.retryMaxDelay ?? null,

    retryOnStatuses:
      Array.isArray(cfg.retryOnStatuses)
        ? cfg.retryOnStatuses.slice(0, 20)
        : null,

    retryOnConflict:
      cfg.retryOnConflict === true,

    retryOnLocked:
      cfg.retryOnLocked === true,

    maxElapsedMs:
      cfg.maxElapsedMs || 0,

    signal:
      cfg.signal
        ? "[AbortSignal]"
        : null,

    meta:
      sanitizeData(cfg.meta || null, 0, "meta"),

    startedAt:
      cfg.startedAt || cfg._startedAt || 0,

    skipRetry:
      cfg._skipRetry === true,

    skipAuthRefresh:
      cfg._skipAuthRefresh === true,

    authRefreshAttempted:
      cfg._authRefreshAttempted === true,

    authRefreshSucceeded:
      cfg._authRefreshSucceeded === true,

    authRefreshFailed:
      cfg._authRefreshFailed === true,

    emitEvents:
      cfg.emitEvents !== false,

    emitFinalEvents:
      cfg.emitFinalEvents !== false,

    emitLifecycleEvents:
      cfg.emitLifecycleEvents === true,

    emitRuntimeEvents:
      cfg.emitRuntimeEvents === true,

    emitAuthRefreshEvents:
      cfg.emitAuthRefreshEvents === true,

    emitRequestEngineEvents:
      cfg.emitRequestEngineEvents === true,
  };

  if (SENSITIVE_OBJECT_KEY_RE.test("token")) {
    output.token =
      cfg.token ? "***" : null;

    output.accessToken =
      cfg.accessToken ? "***" : null;

    output.access_token =
      cfg.access_token ? "***" : null;

    output.refreshToken =
      cfg.refreshToken ? "***" : null;

    output.refresh_token =
      cfg.refresh_token ? "***" : null;
  }

  return output;
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
    )
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/g, "") ||
      "/";
  } catch {}

  return safeLower(
    raw
      .split("?")[0]
      .split("#")[0] ||
      raw
  )
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/g, "") ||
    "/";
}

export function stripApiPrefix(path = "") {
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

export function getComparableEndpointPaths(path = "") {
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

export function endpointMatches(path = "", markers = []) {
  const paths =
    getComparableEndpointPaths(path);

  return safeArray(markers).some((marker) => {
    const cleanMarker =
      normalizeEndpointPath(marker);

    if (!cleanMarker) {
      return false;
    }

    return paths.some((candidate) =>
      candidate === cleanMarker ||
      candidate.startsWith(`${cleanMarker}/`)
    );
  });
}

export function isAuthMeEndpoint(path = "") {
  const paths =
    getComparableEndpointPaths(path);

  return paths.some((candidate) =>
    AUTH_ME_ENDPOINTS.some((endpoint) =>
      candidate === endpoint ||
      candidate.startsWith(`${endpoint}/`)
    ) ||
    candidate === "/auth/me" ||
    candidate.startsWith("/auth/me/")
  );
}

export function isAuthEndpoint(path = "") {
  return Boolean(
    isAuthMeEndpoint(path) ||
      endpointMatches(
        path,
        AUTH_ENDPOINT_MARKERS
      )
  );
}

export function isPublicAuthEndpoint(path = "") {
  if (isAuthMeEndpoint(path)) {
    return false;
  }

  return endpointMatches(
    path,
    PUBLIC_AUTH_ENDPOINT_MARKERS
  );
}

export function isAuthRefreshControlEndpoint(path = "") {
  if (isAuthMeEndpoint(path)) {
    return false;
  }

  return endpointMatches(
    path,
    AUTH_CONTROL_SKIP_REFRESH_MARKERS
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
  if (isAuthMeEndpoint(path)) {
    return false;
  }

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
  if (cfg._noLoader === true) return false;

  return true;
}

export function shouldLogRequests(config, AppCore) {
  return Boolean(
    config?.logRequests &&
      (
        AppCore?.config?.debug ||
        AppCore?.state?.debug
      )
  );
}

export function shouldLogResponses(config, AppCore) {
  return Boolean(
    config?.logResponses &&
      (
        AppCore?.config?.debug ||
        AppCore?.state?.debug
      )
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

export function hasAbortSignal(value) {
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

  if (hasAbortController()) {
    try {
      if (controllerOrSignal instanceof AbortController) {
        return controllerOrSignal.signal;
      }
    } catch {}
  }

  if (hasAbortSignal(controllerOrSignal)) {
    return controllerOrSignal;
  }

  if (hasAbortSignal(controllerOrSignal?.signal)) {
    return controllerOrSignal.signal;
  }

  return null;
}

export function createAbortControllerSafe() {
  try {
    if (hasAbortController()) {
      return new AbortController();
    }
  } catch {}

  return null;
}

export function createTimeoutSignal(ms = 0) {
  const timeoutMs =
    safeNumber(ms, 0);

  const controller =
    createAbortControllerSafe();

  const timeoutState = {
    controller,

    signal:
      controller?.signal || null,

    timeoutId:
      null,

    fired:
      false,

    clear() {
      if (this.timeoutId) {
        try {
          clearTimeout(this.timeoutId);
        } catch {}
      }

      this.timeoutId =
        null;
    },
  };

  if (!controller) {
    return timeoutState;
  }

  if (timeoutMs <= 0) {
    return timeoutState;
  }

  try {
    timeoutState.timeoutId =
      setTimeout(() => {
        timeoutState.fired =
          true;

        try {
          controller.abort("timeout");
        } catch {
          try {
            controller.abort();
          } catch {}
        }
      }, timeoutMs);
  } catch {}

  return timeoutState;
}

export function mergeSignals(signals = []) {
  const validSignals =
    safeArray(signals)
      .map(withSignal)
      .filter(Boolean);

  if (!validSignals.length) {
    return null;
  }

  try {
    if (
      typeof AbortSignal !== "undefined" &&
      isFn(AbortSignal.any)
    ) {
      return AbortSignal.any(validSignals);
    }
  } catch {}

  if (validSignals.length === 1) {
    return validSignals[0];
  }

  const controller =
    createAbortControllerSafe();

  if (!controller) {
    return validSignals[0] || null;
  }

  const cleanups = [];

  function teardown() {
    for (const cleanup of cleanups.splice(0)) {
      try {
        cleanup();
      } catch {}
    }
  }

  function abortFrom(signal) {
    if (controller.signal.aborted) {
      return;
    }

    try {
      controller.abort(
        signal?.reason || "aborted"
      );
    } catch {
      try {
        controller.abort();
      } catch {}
    } finally {
      teardown();
    }
  }

  for (const signal of validSignals) {
    if (signal.aborted) {
      abortFrom(signal);
      break;
    }

    const onAbort = () => {
      abortFrom(signal);
    };

    try {
      signal.addEventListener(
        "abort",
        onAbort,
        {
          once:
            true,
        }
      );

      cleanups.push(() => {
        signal.removeEventListener(
          "abort",
          onAbort
        );
      });
    } catch {}
  }

  return controller.signal;
}

export function isAbortError(error) {
  const name =
    safeText(error?.name || "");

  const message =
    safeLower(error?.message || "");

  const code =
    safeLower(error?.code || "");

  return (
    name === "AbortError" ||
    safeLower(name) === "aborterror" ||
    code === "abort_err" ||
    code === "20" ||
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

export function isRetryableStatus(status = 0, options = {}) {
  const numericStatus =
    safeNumber(status, 0);

  if (!numericStatus) {
    return false;
  }

  if (
    numericStatus === 409 &&
    options.retryOnConflict === true
  ) {
    return true;
  }

  if (
    numericStatus === 423 &&
    options.retryOnLocked === true
  ) {
    return true;
  }

  return DEFAULT_RETRYABLE_STATUSES.includes(numericStatus) ||
    (
      numericStatus >= 500 &&
      numericStatus <= 599
    );
}

export function isRetryableError(error, options = {}) {
  if (!error) {
    return false;
  }

  const timeout =
    isTimeoutError(error);

  if (
    !timeout &&
    isAbortError(error)
  ) {
    return false;
  }

  if (timeout) {
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

  return isRetryableStatus(
    status,
    options
  );
}

export function matchesStatusRule(status, retryOnStatuses) {
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

export function parseRetryAfterMs(value = "") {
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

  const timeout =
    isTimeoutError(error);

  if (
    !timeout &&
    (
      error?.aborted === true ||
      isAbortError(error)
    )
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
    normalizeMethod(req.method || "GET");

  const allowUnsafeRetry =
    req.retryUnsafe === true ||
    req.retryUnsafeMethods === true;

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
    safeText(data?.mensaje, "") ||
    safeText(data?.error, "") ||
    safeText(data?.detail, "") ||
    safeText(data?.title, "") ||
    safeText(data?.reason, "") ||
    safeText(data?.description, "") ||
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

        writable:
          false,
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
  const sanitizedConfig =
    requestConfig
      ? sanitizeRequestConfig(requestConfig)
      : null;

  if (
    error?.name === "HttpErrorNormalized"
  ) {
    const timeout =
      error.timeout === true ||
      isTimeoutError(error);

    const aborted =
      timeout
        ? false
        : (
            error.aborted === true ||
            isAbortError(error)
          );

    const normalizedAgain = {
      name:
        "HttpErrorNormalized",

      message:
        redactHttpValue(
          safeText(error.message, DEFAULT_ERROR_MESSAGE)
        ),

      status:
        safeNumber(error.status, 0),

      statusText:
        redactHttpValue(error.statusText || ""),

      data:
        sanitizeData(error.data || null),

      headers:
        sanitizeHeaders(error.headers || {}),

      url:
        redactHttpValue(error.url || ""),

      redactedUrl:
        redactHttpValue(error.redactedUrl || error.url || ""),

      method:
        normalizeMethod(error.method || requestConfig?.method || DEFAULT_METHOD),

      code:
        error.code || null,

      requestId:
        error.requestId ||
        requestConfig?.requestId ||
        null,

      requestConfig:
        sanitizeRequestConfig(
          error.requestConfig ||
            requestConfig ||
            {}
        ),

      aborted,
      timeout,

      retryable:
        error.retryable === true,

      public:
        error.public === true,

      auth:
        error.auth !== false,

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
    normalizeMethod(
      error?.method ||
        requestConfig?.method ||
        DEFAULT_METHOD
    );

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

  const timeout =
    error?.timeout === true ||
    isTimeoutError(error);

  const aborted =
    timeout
      ? false
      : (
          error?.aborted === true ||
          isAbortError(error)
        );

  const normalized = {
    name:
      "HttpErrorNormalized",

    message:
      redactHttpValue(
        extractErrorMessage(error)
      ),

    status,

    statusText:
      redactHttpValue(statusText),

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
      sanitizedConfig,

    aborted,

    timeout,

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
      normalizeMethod(cfg.method || DEFAULT_METHOD),

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

    download:
      cfg.download === true,

    skipRetry:
      cfg._skipRetry === true,

    skipAuthRefresh:
      cfg._skipAuthRefresh === true,
  };
}

export function buildAttemptPayload({
  requestConfig = {},
  attempt = 0,
  retries = 0,
  error = null,
  delayMs = 0,
  phase = "attempt",
} = {}) {
  const cfg =
    safeObject(requestConfig);

  const normalizedError =
    error
      ? normalizeError(error, cfg)
      : null;

  return {
    phase:
      safeText(phase, "attempt"),

    requestId:
      cfg.requestId || null,

    attempt:
      safeNumber(attempt, 0),

    retries:
      safeNumber(retries, 0),

    delayMs:
      safeNumber(delayMs, 0),

    method:
      normalizeMethod(cfg.method || DEFAULT_METHOD),

    path:
      redactHttpValue(cfg.path || cfg.url || ""),

    auth:
      cfg.auth !== false,

    public:
      cfg.public === true,

    status:
      normalizedError?.status || 0,

    code:
      normalizedError?.code || null,

    message:
      normalizedError?.message || "",

    timeout:
      Boolean(normalizedError?.timeout),

    aborted:
      Boolean(normalizedError?.aborted),

    retryable:
      Boolean(normalizedError?.retryable),

    at:
      isoNow(),
  };
}

function resolveDefaultTimeout(baseConfig = {}, AppCore = null) {
  const fromCore =
    safeNumber(
      AppCore?.config?.requestTimeout ??
        AppCore?.config?.httpTimeout ??
        AppCore?.config?.timeout ??
        AppCore?.config?.api?.timeout,
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

function resolveApiBase(config = {}, AppCore = null, options = {}) {
  return (
    safeText(options.apiBase, "") ||
    safeText(config.apiBase, "") ||
    safeText(config.baseUrl, "") ||
    safeText(AppCore?.config?.apiBase, "") ||
    safeText(AppCore?.config?.api?.baseUrl, "") ||
    safeText(AppCore?.config?.api?.base, "") ||
    ""
  );
}

function shouldDefaultPublic(path = "", options = {}) {
  const opts =
    safeObject(options);

  if (isAuthMeEndpoint(path)) {
    return false;
  }

  return Boolean(
    opts.public === true ||
      opts.auth === false ||
      opts.skipAuth === true ||
      isPublicEndpoint(path)
  );
}

function normalizeRetryStatuses(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .map((item) => {
      if (typeof item === "number") {
        return item;
      }

      const text =
        safeText(item, "");

      return text || null;
    })
    .filter(Boolean);
}

export function buildDefaultRequestConfig(config, AppCore, method, path, options = {}) {
  const cfg = {
    ...HTTP_CONFIG,
    ...safeObject(config),
  };

  const opts =
    safeObject(options);

  const finalMethod =
    normalizeMethod(
      opts.method ||
        method ||
        DEFAULT_METHOD
    );

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

  const authMeEndpoint =
    isAuthMeEndpoint(finalPath);

  const defaultTimeout =
    resolveDefaultTimeout(
      cfg,
      AppCore
    );

  const defaultAuth =
    authMeEndpoint
      ? true
      : publicEndpoint
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

    apiBase:
      resolveApiBase(
        cfg,
        AppCore,
        opts
      ),

    body:
      null,

    headers:
      {},

    auth:
      defaultAuth,

    public:
      publicEndpoint,

    skipAuth:
      publicEndpoint,

    timeout:
      defaultTimeout,

    raw:
      false,

    rawBody:
      false,

    upload:
      false,

    download:
      false,

    responseType:
      cfg.defaultResponseType ||
      HTTP_CONFIG.defaultResponseType,

    query:
      null,

    params:
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

    retryUnsafeMethods:
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
      normalizeRetryStatuses(
        cfg.retryOnStatuses
      ),

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

    emitEvents:
      true,

    emitFinalEvents:
      cfg.emitFinalEvents !== false,

    emitLifecycleEvents:
      cfg.emitLifecycleEvents === true,

    emitRuntimeEvents:
      cfg.emitRuntimeEvents === true,

    emitAuthRefreshEvents:
      cfg.emitAuthRefreshEvents === true,

    emitRequestEngineEvents:
      cfg.emitRequestEngineEvents === true,

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

  const mergedPath =
    safeText(
      merged.path || finalPath,
      finalPath
    );

  const mergedAuthMe =
    isAuthMeEndpoint(mergedPath);

  const mergedPublic =
    mergedAuthMe
      ? false
      : shouldDefaultPublic(
          mergedPath,
          merged
        );

  /*
    /api/auth/me, /auth/me, /api/me y /me son SIEMPRE privados.
    No permitimos que public/auth:false los deje sin Authorization.
  */
  const mergedAuth =
    mergedAuthMe
      ? true
      : merged.auth === false ||
        merged.public === true ||
        merged.skipAuth === true ||
        mergedPublic
          ? false
          : merged.auth ?? defaultAuth;

  const headers =
    normalizeHeaders(
      merged.headers
    );

  const finalRequestConfig = {
    ...merged,

    method:
      normalizeMethod(
        merged.method || finalMethod
      ),

    path:
      mergedPath,

    apiBase:
      resolveApiBase(
        cfg,
        AppCore,
        merged
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

    retryUnsafeMethods:
      merged.retryUnsafeMethods === true,

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
      normalizeRetryStatuses(
        merged.retryOnStatuses
      ) ||
      normalizeRetryStatuses(
        cfg.retryOnStatuses
      ),

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

    skipAuth:
      mergedPublic || mergedAuth === false,

    auth:
      mergedAuth,

    useLoader:
      shouldToggleGlobalLoader({
        ...merged,
        useLoader:
          merged.useLoader ?? defaultUseLoader,
      }),

    _startedAt:
      safeNumber(
        merged._startedAt ||
          merged.startedAt,
        0
      ),

    emitEvents:
      merged.emitEvents !== false,

    emitFinalEvents:
      merged.emitFinalEvents !== false,

    emitLifecycleEvents:
      merged.emitLifecycleEvents === true,

    emitRuntimeEvents:
      merged.emitRuntimeEvents === true,

    emitAuthRefreshEvents:
      merged.emitAuthRefreshEvents === true,

    emitRequestEngineEvents:
      merged.emitRequestEngineEvents === true,

    _skipRetry:
      merged._skipRetry === true,

    _skipAuthRefresh:
      mergedAuthMe
        ? merged._skipAuthRefresh === true
        : (
            merged._skipAuthRefresh === true ||
            mergedPublic ||
            mergedAuth === false
          ),

    _authRefreshAttempted:
      merged._authRefreshAttempted === true,

    _authRefreshSucceeded:
      merged._authRefreshSucceeded === true,

    _authRefreshFailed:
      merged._authRefreshFailed === true,
  };

  if (isBodylessMethod(finalRequestConfig.method)) {
    delete finalRequestConfig.body;
  }

  return finalRequestConfig;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHttpHelpersSnapshot() {
  return {
    version:
      HTTP_HELPERS_VERSION,

    defaultConfig:
      {
        retries:
          HTTP_CONFIG.retries,

        timeout:
          HTTP_CONFIG.timeout,

        autoRefreshOn401:
          HTTP_CONFIG.autoRefreshOn401,

        autoLogoutOn401:
          HTTP_CONFIG.autoLogoutOn401,

        defaultCredentials:
          HTTP_CONFIG.defaultCredentials,

        defaultResponseType:
          HTTP_CONFIG.defaultResponseType,

        emitLifecycleEvents:
          HTTP_CONFIG.emitLifecycleEvents,

        emitFinalEvents:
          HTTP_CONFIG.emitFinalEvents,

        emitRuntimeEvents:
          HTTP_CONFIG.emitRuntimeEvents,

        emitAuthRefreshEvents:
          HTTP_CONFIG.emitAuthRefreshEvents,

        emitRequestEngineEvents:
          HTTP_CONFIG.emitRequestEngineEvents,
      },

    endpointPolicy: {
      authMePrivate:
        true,

      authMeEndpoints:
        [...AUTH_ME_ENDPOINTS],

      authMarkers:
        AUTH_ENDPOINT_MARKERS.length,

      publicAuthMarkers:
        PUBLIC_AUTH_ENDPOINT_MARKERS.length,

      skipRefreshMarkers:
        AUTH_CONTROL_SKIP_REFRESH_MARKERS.length,

      technicalPublicRoutes:
        [...TECHNICAL_PUBLIC_ROUTES],
    },

    sanitize:
      {
        maxDepth:
          MAX_SANITIZE_DEPTH,

        maxArrayItems:
          MAX_SANITIZE_ARRAY_ITEMS,

        maxObjectKeys:
          MAX_SANITIZE_OBJECT_KEYS,

        maxStringLength:
          MAX_SANITIZE_STRING_LENGTH,

        circularSafe:
          true,
      },

    retry: {
      idempotentMethods:
        [...IDEMPOTENT_METHODS],

      bodylessMethods:
        [...BODYLESS_METHODS],

      retryableStatuses:
        [...DEFAULT_RETRYABLE_STATUSES],
    },

    at:
      isoNow(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  HTTP_HELPERS_VERSION,
  HTTP_CONFIG,

  isFn,
  isObject,
  isAnyObject,
  safeObject,
  safeArray,
  safeText,
  safeLower,
  safeNumber,
  safeBoolean,
  nowMs,
  isoNow,
  getBaseOrigin,
  escapeRegExp,
  sleep,

  normalizeMethod,
  isKnownMethod,
  isBodylessMethod,

  headersToPlainObject,
  normalizeHeaders,
  getHeaderValue,
  hasHeader,
  setHeader,
  deleteHeader,
  sanitizeHeaders,

  redactHttpValue,
  sanitizeData,
  sanitizeRequestConfig,

  normalizeEndpointPath,
  stripApiPrefix,
  getComparableEndpointPaths,
  endpointMatches,
  isAuthEndpoint,
  isAuthMeEndpoint,
  isPublicAuthEndpoint,
  isAuthRefreshControlEndpoint,
  isTechnicalPublicRoute,
  isTechnicalPublicSpaEndpoint,
  isPublicEndpoint,

  shouldToggleGlobalLoader,
  shouldLogRequests,
  shouldLogResponses,
  shouldLogErrors,

  hasAbortSignal,
  withSignal,
  createAbortControllerSafe,
  createTimeoutSignal,
  mergeSignals,
  isAbortError,
  isTimeoutError,

  isIdempotentMethod,
  isRetryableStatus,
  isRetryableError,
  matchesStatusRule,
  parseRetryAfterMs,
  buildRetryDelay,
  shouldRetry,

  normalizeError,
  buildRequestSummary,
  buildAttemptPayload,
  buildDefaultRequestConfig,

  getHttpHelpersSnapshot,
};
