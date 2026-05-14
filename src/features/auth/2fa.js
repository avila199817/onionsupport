/* =========================================================
   Onion SPA - Auth 2FA
   Archivo: src/features/auth/2fa.js

   AUTH 2FA / MFA · FINAL EXTREME PRO SYSTEM · GOD MODE v15

   RESPONSABILIDADES:
   - verificar códigos 2FA/MFA/TOTP/OTP
   - consumir tempToken/challengeToken generado por login
   - leer tempToken desde payload, storage, query, path y hash-router
   - ejecutar verificación contra API pública
   - soportar backend Onion Auth:
       · token / accessToken / access_token
       · refreshToken / refresh_token
       · session / sessionData
       · user / usuario / me / account / profile
       · data / payload / result / body / response.data / auth
   - aplicar sesión sólo si backend devuelve token + user válidos
   - limpiar tempToken tras verificación correcta
   - no marcar authenticated en respuestas parciales
   - soportar reenvío/request opcional de código si backend lo expone
   - normalizar respuestas y errores
   - exponer aliases legacy estables

   HARDENING EXTREMO:
   - browser/server safe
   - timeout real en fetch
   - transporte compatible con AppCore.apiClient, AppCore.request,
     AppCore.http, AppCore.Http, services.http y fetch
   - eventos sin tokens/códigos/passwords reales
   - no CSS / no inline style / no estilos inyectados
   - no localStorage.clear()
   - no sessionStorage.clear()
   - no refresh automático
   - no authenticated sin token + user
   - tempToken no se trunca: se invalida si excede límite
   - código normalizado por longitud controlada
   - snapshots sin secretos
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  AUTH_ENDPOINTS,
  AUTH_ENDPOINT_CANDIDATES,
  AUTH_CONSTANTS,
  AUTH_TOKEN_PARAM_NAMES,
  getTwoFactorLoginEndpoint as getTwoFactorLoginEndpointFromConstants,
} from "./constants.js";

import {
  normalizeTokenValue as helperNormalizeTokenValue,
  sanitizeRedirectPath,
  redactTokenInText,
} from "./helpers.js";

import {
  extractToken,
  extractRefreshToken,
  extractUser,
  normalizeSessionPayload,
} from "./normalize.js";

import {
  getStoredTempToken,
  persistTempToken,
} from "./storage.js";

import {
  applySession,
} from "./session.js";

/* =========================================================
   VERSION
========================================================= */

export const TWO_FACTOR_MODULE_VERSION =
  "2fa.15.0.0";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_VERIFY_ENDPOINT =
  "/api/auth/2fa/login";

const DEFAULT_VERIFY_MFA_ENDPOINT =
  "/api/auth/mfa/login";

const DEFAULT_VERIFY_OTP_ENDPOINT =
  "/api/auth/otp/login";

const DEFAULT_VERIFY_2FA_ENDPOINT =
  "/api/auth/2fa/verify";

const DEFAULT_VERIFY_MFA_ALT_ENDPOINT =
  "/api/auth/mfa/verify";

const DEFAULT_REQUEST_ENDPOINT =
  "/api/auth/2fa/request";

const DEFAULT_REQUEST_MFA_ENDPOINT =
  "/api/auth/mfa/request";

const DEFAULT_REQUEST_OTP_ENDPOINT =
  "/api/auth/otp/request";

const DEFAULT_RESEND_ENDPOINT =
  "/api/auth/2fa/resend";

const DEFAULT_RESEND_MFA_ENDPOINT =
  "/api/auth/mfa/resend";

const DEFAULT_RESEND_OTP_ENDPOINT =
  "/api/auth/otp/resend";

const DEFAULT_HOME_REDIRECT =
  "/";

const TWO_FACTOR_PATH =
  "/2fa";

const OTP_PATH =
  "/otp";

const MFA_PATH =
  "/mfa";

const LOCAL_ORIGIN =
  "http://localhost";

const DEFAULT_TIMEOUT_MS =
  15000;

const SUCCESS_STATUS_TEXTS =
  Object.freeze([
    "ok",
    "success",
    "succeeded",
    "accepted",
    "valid",
    "verified",
    "authenticated",
    "completed",
    "done",
  ]);

const FAILURE_STATUS_TEXTS =
  Object.freeze([
    "error",
    "failed",
    "failure",
    "invalid",
    "unauthorized",
    "forbidden",
    "expired",
    "token_expired",
    "token_invalid",
    "code_expired",
    "code_invalid",
    "otp_invalid",
    "totp_invalid",
    "mfa_failed",
    "2fa_failed",
    "rate_limited",
    "too_many_requests",
  ]);

const FAILURE_CODES =
  Object.freeze([
    "INVALID_TOKEN",
    "TOKEN_INVALID",
    "TOKEN_EXPIRED",
    "TEMP_TOKEN_INVALID",
    "TEMP_TOKEN_EXPIRED",
    "MISSING_TEMP_TOKEN",
    "MISSING_2FA_TEMP_TOKEN",
    "MISSING_CODE",
    "INVALID_CODE",
    "CODE_INVALID",
    "CODE_EXPIRED",
    "OTP_INVALID",
    "OTP_EXPIRED",
    "TOTP_INVALID",
    "TOTP_EXPIRED",
    "MFA_FAILED",
    "TWO_FACTOR_FAILED",
    "RATE_LIMITED",
    "TOO_MANY_REQUESTS",
    "UNAUTHORIZED",
    "FORBIDDEN",
  ]);

const CORRUPTED_TEXT_VALUES =
  Object.freeze([
    "undefined",
    "null",
    "false",
    "true",
    "[object object]",
    "{}",
    "[]",
    "\"undefined\"",
    "\"null\"",
    "\"false\"",
    "\"true\"",
  ]);

const TEMP_TOKEN_FIELD_NAMES =
  Object.freeze([
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "challengeToken",
    "challenge_token",
    "twoFactorToken",
    "two_factor_token",
    "mfaToken",
    "mfa_token",
    "otpToken",
    "otp_token",
    "token",
  ]);

const CODE_FIELD_NAMES =
  Object.freeze([
    "code",
    "otp",
    "totp",
    "mfaCode",
    "mfa_code",
    "twoFactorCode",
    "two_factor_code",
    "verificationCode",
    "verification_code",
  ]);

const REQUEST_METHOD_OPTIONS =
  Object.freeze({
    method:
      "POST",

    auth:
      false,

    public:
      true,

    skipAuth:
      true,

    silent:
      true,

    storeError:
      false,

    dedupe:
      false,

    _skipAuthRefresh:
      true,

    skipAuthRefresh:
      true,
  });

const FALLBACK_NEXT_ENDPOINT_STATUSES =
  new Set([
    404,
    405,
    410,
    501,
  ]);

/* =========================================================
   RUNTIME STATE
========================================================= */

const runtime = {
  verifyInFlight:
    null,

  requestInFlight:
    null,

  resendInFlight:
    null,

  lastVerifyAt:
    0,

  lastRequestAt:
    0,

  lastResendAt:
    0,

  verifyCount:
    0,

  requestCount:
    0,

  resendCount:
    0,

  failCount:
    0,

  cooldownUntil:
    0,

  lastError:
    null,

  lastResult:
    null,
};

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
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
  const numeric =
    Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : fallback;
}

function safeBool(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const text =
    safeText(value, "")
      .toLowerCase();

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
    ].includes(text)
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
    ].includes(text)
  ) {
    return false;
  }

  return Boolean(fallback);
}

function clampNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const numeric =
    safeNumber(value, min);

  return Math.min(
    Math.max(numeric, min),
    max
  );
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value) {
  return isObject(value)
    ? value
    : {};
}

function safeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return [];
  }

  return [value];
}

function isFunction(value) {
  return typeof value === "function";
}

function isAbsoluteUrl(value = "") {
  return /^https?:\/\//i.test(
    String(value || "")
  );
}

function isCorruptedTextValue(value = "") {
  const text =
    safeText(value, "")
      .toLowerCase();

  return (
    !text ||
    CORRUPTED_TEXT_VALUES.includes(text)
  );
}

function pickFirst(...values) {
  for (const value of values) {
    if (
      value === null ||
      value === undefined
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function pickFirstText(...values) {
  return safeText(
    pickFirst(...values),
    ""
  );
}

function safeClone(value, fallback = null) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {
    return fallback;
  }
}

function unique(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .flat(Infinity)
        .map((item) =>
          safeText(item, "")
        )
        .filter(Boolean)
    )
  );
}

/* =========================================================
   EVENT SAFETY
========================================================= */

function redactSafe(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "")
      .replace(
        /([?&#](?:token|tempToken|temp_token|temporaryToken|temporary_token|challengeToken|challenge_token|twoFactorToken|two_factor_token|mfaToken|mfa_token|otpToken|otp_token|code|otp|totp|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi,
        "$1***"
      )
      .replace(
        /(\/(?:2fa|otp|mfa)\/)([^/?#\s]+)/gi,
        "$1***"
      )
      .replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  }
}

function sanitizeEventPayload(payload = {}, depth = 0) {
  if (depth > 6) {
    return "[MaxDepth]";
  }

  if (Array.isArray(payload)) {
    return payload.map((item) =>
      sanitizeEventPayload(
        item,
        depth + 1
      )
    );
  }

  if (!isObject(payload)) {
    return typeof payload === "string"
      ? redactSafe(payload)
      : payload;
  }

  const output = {};

  for (const [key, value] of Object.entries(payload)) {
    const lower =
      safeText(key, "")
        .toLowerCase();

    if (
      lower.includes("token") ||
      lower.includes("authorization") ||
      lower.includes("password") ||
      lower.includes("secret") ||
      lower === "code" ||
      lower === "otp" ||
      lower === "totp" ||
      lower === "t"
    ) {
      output[key] =
        value ? "***" : value;
      continue;
    }

    if (
      lower.includes("url") ||
      lower.includes("path") ||
      lower.includes("redirect") ||
      lower.includes("endpoint")
    ) {
      output[key] =
        typeof value === "string"
          ? redactSafe(value)
          : sanitizeEventPayload(
              value,
              depth + 1
            );
      continue;
    }

    output[key] =
      sanitizeEventPayload(
        value,
        depth + 1
      );
  }

  return output;
}

function safeEmit(eventName, payload = {}) {
  const cleanEvent =
    safeText(eventName, "");

  if (!cleanEvent) {
    return false;
  }

  const cleanPayload =
    sanitizeEventPayload(payload);

  let emitted =
    false;

  try {
    AppCore?.events?.emit?.(
      cleanEvent,
      cleanPayload
    );

    emitted =
      true;
  } catch {}

  try {
    if (
      isBrowser() &&
      !emitted
    ) {
      document.dispatchEvent(
        new CustomEvent(cleanEvent, {
          detail:
            cleanPayload,
          bubbles:
            false,
          cancelable:
            false,
        })
      );

      emitted =
        true;
    }
  } catch {}

  return emitted;
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[Auth2FA]",
      ...args
    );
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.warn(
        "[Auth2FA]",
        ...args
      );
    }
  } catch {}
}

/* =========================================================
   LIMITS
========================================================= */

function getCodeMinLength() {
  return clampNumber(
    AUTH_CONSTANTS?.twoFactorCodeMinLength ??
      4,
    1,
    64
  );
}

function getCodeMaxLength() {
  return clampNumber(
    AUTH_CONSTANTS?.twoFactorCodeMaxLength ??
      12,
    getCodeMinLength(),
    128
  );
}

function getTokenMinLength() {
  return clampNumber(
    AUTH_CONSTANTS?.tempTokenMinLength ??
      AUTH_CONSTANTS?.tokenMinLength ??
      8,
    1,
    4096
  );
}

function getTokenMaxLength() {
  return clampNumber(
    AUTH_CONSTANTS?.tempTokenMaxLength ??
      AUTH_CONSTANTS?.tokenMaxLength ??
      8192,
    getTokenMinLength(),
    32768
  );
}

function getRequestTimeout() {
  return clampNumber(
    AUTH_CONSTANTS?.requestTimeout ??
      AppCore?.config?.requestTimeout ??
      AppCore?.config?.api?.timeout ??
      DEFAULT_TIMEOUT_MS,
    1000,
    120000
  );
}

function getCooldownMs() {
  return clampNumber(
    AUTH_CONSTANTS?.twoFactorCooldownMs ??
      30000,
    0,
    600000
  );
}

function getMaxAttempts() {
  return clampNumber(
    AUTH_CONSTANTS?.twoFactorMaxAttempts ??
      5,
    1,
    50
  );
}

/* =========================================================
   DEFAULT MESSAGES
========================================================= */

function getDefaultVerifySuccessMessage() {
  return "Verificación completada correctamente.";
}

function getDefaultVerifyErrorMessage() {
  return "No se pudo verificar el código.";
}

function getDefaultRequestSuccessMessage() {
  return "Código solicitado correctamente.";
}

function getDefaultRequestErrorMessage() {
  return "No se pudo solicitar el código.";
}

function getDefaultResendSuccessMessage() {
  return "Código reenviado correctamente.";
}

function getDefaultResendErrorMessage() {
  return "No se pudo reenviar el código.";
}

function getRateLimitMessage() {
  return "Espera un momento antes de volver a intentarlo.";
}

/* =========================================================
   ENDPOINTS
========================================================= */

function firstEndpoint(candidates = [], fallback = "") {
  for (const candidate of candidates) {
    const value =
      safeText(candidate, "");

    if (value) {
      return value;
    }
  }

  return fallback;
}

function getConfiguredVerifyEndpoint() {
  return firstEndpoint(
    [
      isFunction(getTwoFactorLoginEndpointFromConstants)
        ? getTwoFactorLoginEndpointFromConstants()
        : "",
      AUTH_ENDPOINTS?.twoFactorLogin,
      AUTH_ENDPOINTS?.login2fa,
      AUTH_ENDPOINTS?.mfaLogin,
      AUTH_ENDPOINTS?.verify2FA,
      AUTH_ENDPOINTS?.verifyMfa,
      AUTH_ENDPOINTS?.twoFactorVerify,
      DEFAULT_VERIFY_ENDPOINT,
    ],
    DEFAULT_VERIFY_ENDPOINT
  );
}

function getConfiguredRequestEndpoint() {
  return firstEndpoint(
    [
      AUTH_ENDPOINTS?.twoFactorRequest,
      AUTH_ENDPOINTS?.request2FA,
      AUTH_ENDPOINTS?.requestMfa,
      AUTH_ENDPOINTS?.send2FA,
      AUTH_ENDPOINTS?.sendMfa,
      DEFAULT_REQUEST_ENDPOINT,
    ],
    DEFAULT_REQUEST_ENDPOINT
  );
}

function getConfiguredResendEndpoint() {
  return firstEndpoint(
    [
      AUTH_ENDPOINTS?.twoFactorResend,
      AUTH_ENDPOINTS?.resend2FA,
      AUTH_ENDPOINTS?.resendMfa,
      AUTH_ENDPOINTS?.twoFactorRequest,
      DEFAULT_RESEND_ENDPOINT,
    ],
    DEFAULT_RESEND_ENDPOINT
  );
}

function endpointCandidatesFor(type = "verify") {
  if (type === "request") {
    return unique([
      getConfiguredRequestEndpoint(),
      AUTH_ENDPOINTS?.twoFactorRequest,
      AUTH_ENDPOINTS?.request2FA,
      AUTH_ENDPOINTS?.requestMfa,
      AUTH_ENDPOINTS?.send2FA,
      AUTH_ENDPOINTS?.sendMfa,
      DEFAULT_REQUEST_ENDPOINT,
      DEFAULT_REQUEST_MFA_ENDPOINT,
      DEFAULT_REQUEST_OTP_ENDPOINT,
    ]);
  }

  if (type === "resend") {
    return unique([
      getConfiguredResendEndpoint(),
      AUTH_ENDPOINTS?.twoFactorResend,
      AUTH_ENDPOINTS?.resend2FA,
      AUTH_ENDPOINTS?.resendMfa,
      DEFAULT_RESEND_ENDPOINT,
      DEFAULT_RESEND_MFA_ENDPOINT,
      DEFAULT_RESEND_OTP_ENDPOINT,
    ]);
  }

  return unique([
    getConfiguredVerifyEndpoint(),
    ...(Array.isArray(AUTH_ENDPOINT_CANDIDATES?.twoFactorLogin)
      ? AUTH_ENDPOINT_CANDIDATES.twoFactorLogin
      : []),
    DEFAULT_VERIFY_ENDPOINT,
    DEFAULT_VERIFY_MFA_ENDPOINT,
    DEFAULT_VERIFY_OTP_ENDPOINT,
    DEFAULT_VERIFY_2FA_ENDPOINT,
    DEFAULT_VERIFY_MFA_ALT_ENDPOINT,
  ]);
}

export function getTwoFactorLoginEndpoint() {
  return getConfiguredVerifyEndpoint();
}

export function getTwoFactorVerifyEndpoint() {
  return getConfiguredVerifyEndpoint();
}

export function getMfaVerifyEndpoint() {
  return getConfiguredVerifyEndpoint();
}

export function getTwoFactorRequestEndpoint() {
  return getConfiguredRequestEndpoint();
}

export function getTwoFactorResendEndpoint() {
  return getConfiguredResendEndpoint();
}

/* =========================================================
   REDIRECT SAFETY
========================================================= */

function normalizeRelativePath(path = "") {
  let value =
    safeText(path, "");

  if (!value) {
    return "";
  }

  if (value.startsWith("//")) {
    return "";
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return "";
  }

  if (/[\r\n\t]/.test(value)) {
    return "";
  }

  if (
    value.toLowerCase().includes("%0d") ||
    value.toLowerCase().includes("%0a") ||
    value.toLowerCase().includes("%09") ||
    value.toLowerCase().includes("%5c") ||
    value.includes("\\")
  ) {
    return "";
  }

  try {
    const decoded =
      decodeURIComponent(value)
        .replace(/\\/g, "/");

    if (
      decoded.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:/i.test(decoded) ||
      /[\r\n\t]/.test(decoded)
    ) {
      return "";
    }
  } catch {
    return "";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value =
    value
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  return value || "";
}

function sanitizeRedirect(value = "", fallback = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return fallback;
  }

  if (isAbsoluteUrl(raw)) {
    try {
      const parsed =
        new URL(raw);

      if (
        isBrowser() &&
        parsed.origin === window.location.origin
      ) {
        return normalizeRelativePath(
          `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
        ) || fallback;
      }

      return fallback;
    } catch {
      return fallback;
    }
  }

  try {
    return sanitizeRedirectPath(
      raw,
      fallback || ""
    );
  } catch {
    return normalizeRelativePath(raw) || fallback;
  }
}

/* =========================================================
   PATH / TOKEN RESOLUTION
========================================================= */

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return LOCAL_ORIGIN;
}

function isHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || "/";
  }

  return raw.replace(/^#\/?/, "/") || "/";
}

function normalizePathnameOnly(pathname = "/") {
  let value =
    safeText(pathname, "/")
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value =
      `/${value}`;
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") ||
      "/";
  }

  return value;
}

function getCurrentPath() {
  if (!isBrowser()) {
    return "";
  }

  try {
    const pathname =
      window.location.pathname || "/";

    const search =
      window.location.search || "";

    const hash =
      window.location.hash || "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
      return normalizeHashRouterPath(hash);
    }

    return `${pathname}${search}${hash}`;
  } catch {
    return "";
  }
}

function getTokenParamNames() {
  const names =
    AUTH_TOKEN_PARAM_NAMES?.twoFactor;

  if (Array.isArray(names)) {
    return names;
  }

  return [
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "challengeToken",
    "challenge_token",
    "twoFactorToken",
    "two_factor_token",
    "mfaToken",
    "mfa_token",
    "otpToken",
    "otp_token",
    "token",
    "code",
    "t",
  ];
}

function normalizeTempTokenValue(value = "") {
  const raw =
    safeText(value, "");

  if (
    !raw ||
    isCorruptedTextValue(raw)
  ) {
    return "";
  }

  let normalized =
    "";

  try {
    normalized =
      helperNormalizeTokenValue(
        raw,
        getTokenMaxLength()
      ) || "";
  } catch {
    normalized =
      raw;
  }

  normalized =
    safeText(normalized, "");

  if (/^bearer\s+/i.test(normalized)) {
    normalized =
      normalized.replace(/^bearer\s+/i, "")
        .trim();
  }

  if (
    !normalized ||
    isCorruptedTextValue(normalized) ||
    /[\r\n\t\s]/.test(normalized)
  ) {
    return "";
  }

  if (
    normalized.length > getTokenMaxLength()
  ) {
    return "";
  }

  return normalized;
}

function extractTempTokenFromSearch(search = "", names = getTokenParamNames()) {
  try {
    const params =
      new URLSearchParams(search || "");

    for (const name of names) {
      const token =
        normalizeTempTokenValue(
          params.get(name)
        );

      if (token) {
        return token;
      }
    }
  } catch {}

  return "";
}

function extractTempTokenFromHashQuery(hash = "", names = getTokenParamNames()) {
  const cleanHash =
    safeText(hash, "");

  if (
    !cleanHash ||
    !cleanHash.includes("?")
  ) {
    return "";
  }

  const query =
    cleanHash
      .split("?")
      .slice(1)
      .join("?");

  return extractTempTokenFromSearch(
    query ? `?${query}` : "",
    names
  );
}

function extractTempTokenFromPath(path = "") {
  const raw =
    safeText(path, "");

  if (!raw) {
    return "";
  }

  let pathname =
    "";

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    pathname =
      normalizePathnameOnly(
        parsed.pathname || "/"
      );
  } catch {
    pathname =
      normalizePathnameOnly(
        raw
          .split("?")[0]
          .split("#")[0] ||
          "/"
      );
  }

  const routePrefixes = [
    TWO_FACTOR_PATH,
    OTP_PATH,
    MFA_PATH,
  ];

  for (const route of routePrefixes) {
    const marker =
      `${route}/`;

    if (pathname.startsWith(marker)) {
      const token =
        pathname
          .slice(marker.length)
          .split("/")[0];

      try {
        return normalizeTempTokenValue(
          decodeURIComponent(token || "")
        ) || "";
      } catch {
        return normalizeTempTokenValue(token) || "";
      }
    }
  }

  return "";
}

function extractTempTokenFromUrl(pathOrUrl = getCurrentPath()) {
  const raw =
    safeText(pathOrUrl, "");

  if (!raw) {
    return "";
  }

  const normalizedRaw =
    isHashRouterPath(raw)
      ? normalizeHashRouterPath(raw)
      : raw;

  const pathToken =
    extractTempTokenFromPath(normalizedRaw);

  if (pathToken) {
    return pathToken;
  }

  try {
    const parsed =
      new URL(
        normalizedRaw,
        getBaseOrigin()
      );

    const fromSearch =
      extractTempTokenFromSearch(
        parsed.search,
        getTokenParamNames()
      );

    if (fromSearch) {
      return fromSearch;
    }

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      const hashPath =
        normalizeHashRouterPath(parsed.hash);

      const hashPathToken =
        extractTempTokenFromPath(hashPath);

      if (hashPathToken) {
        return hashPathToken;
      }

      const hashQuery =
        hashPath.includes("?")
          ? hashPath
              .split("?")
              .slice(1)
              .join("?")
          : "";

      const fromHashRouterQuery =
        extractTempTokenFromSearch(
          hashQuery ? `?${hashQuery}` : "",
          getTokenParamNames()
        );

      if (fromHashRouterQuery) {
        return fromHashRouterQuery;
      }
    }

    const fromHash =
      extractTempTokenFromHashQuery(
        parsed.hash,
        getTokenParamNames()
      );

    if (fromHash) {
      return fromHash;
    }
  } catch {
    const query =
      normalizedRaw.includes("?")
        ? normalizedRaw
            .split("?")
            .slice(1)
            .join("?")
            .split("#")[0]
        : "";

    if (query) {
      const fromQuery =
        extractTempTokenFromSearch(
          `?${query}`,
          getTokenParamNames()
        );

      if (fromQuery) {
        return fromQuery;
      }
    }
  }

  return "";
}

export function resolveTwoFactorTempToken(payload = {}) {
  return normalizeTempTokenValue(
    payload?.tempToken ??
      payload?.temp_token ??
      payload?.temporaryToken ??
      payload?.temporary_token ??
      payload?.challengeToken ??
      payload?.challenge_token ??
      payload?.twoFactorToken ??
      payload?.two_factor_token ??
      payload?.mfaToken ??
      payload?.mfa_token ??
      payload?.otpToken ??
      payload?.otp_token ??
      payload?.token ??
      getStoredTempToken() ??
      extractTempTokenFromUrl()
  ) || "";
}

/* =========================================================
   CODE / IDENTIFIER
========================================================= */

function normalizeCodeValue(value = "") {
  const raw =
    String(value ?? "")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, "")
      .slice(0, getCodeMaxLength() + 1);

  if (isCorruptedTextValue(raw)) {
    return "";
  }

  return raw;
}

function resolveTwoFactorCode(payload = {}) {
  return normalizeCodeValue(
    payload?.code ??
      payload?.otp ??
      payload?.totp ??
      payload?.mfaCode ??
      payload?.mfa_code ??
      payload?.twoFactorCode ??
      payload?.two_factor_code ??
      payload?.verificationCode ??
      payload?.verification_code ??
      ""
  );
}

function normalizeIdentifier(value = "") {
  const raw =
    safeText(value)
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .slice(0, 160);

  if (isCorruptedTextValue(raw)) {
    return "";
  }

  return raw;
}

function resolveIdentifier(payload = {}) {
  return safeText(
    payload?.identifier ??
      payload?.login ??
      payload?.email ??
      payload?.username ??
      payload?.user ??
      payload?.phone ??
      payload?.telefono ??
      payload?.mobile ??
      "",
    ""
  );
}

/* =========================================================
   PAYLOAD NORMALIZATION
========================================================= */

export function normalizeTwoFactorPayload(payload = {}) {
  const tempToken =
    resolveTwoFactorTempToken(payload);

  const code =
    resolveTwoFactorCode(payload);

  const identifier =
    normalizeIdentifier(
      resolveIdentifier(payload)
    );

  const redirect =
    sanitizeRedirect(
      payload?.redirect ??
        payload?.redirectTo ??
        payload?.returnTo ??
        "",
      ""
    );

  const remember =
    safeBool(
      payload?.remember,
      false
    );

  const trustDevice =
    safeBool(
      payload?.trustDevice ??
        payload?.trust_device ??
        payload?.rememberDevice ??
        payload?.remember_device,
      false
    );

  const method =
    safeText(
      payload?.method ??
        payload?.channel ??
        payload?.type ??
        "",
      ""
    ).slice(0, 32);

  return {
    tempToken,
    code,
    identifier,
    redirect,
    remember,
    trustDevice,
    method,
  };
}

export function normalizeVerifyTwoFactorPayload(payload = {}) {
  return normalizeTwoFactorPayload(payload);
}

export function normalizeRequestTwoFactorPayload(payload = {}) {
  const tempToken =
    resolveTwoFactorTempToken(payload);

  const identifier =
    normalizeIdentifier(
      resolveIdentifier(payload)
    );

  const method =
    safeText(
      payload?.method ??
        payload?.channel ??
        payload?.type ??
        "",
      ""
    ).slice(0, 32);

  return {
    tempToken,
    identifier,
    method,
  };
}

/* =========================================================
   REQUEST BODY
========================================================= */

function stripEmptyValues(obj = {}) {
  const output = {};

  for (const [key, value] of Object.entries(obj || {})) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      continue;
    }

    output[key] = value;
  }

  return output;
}

export function buildTwoFactorVerifyBody(payload = {}) {
  const normalized =
    normalizeTwoFactorPayload(payload);

  return stripEmptyValues({
    tempToken:
      normalized.tempToken,

    temp_token:
      normalized.tempToken,

    temporaryToken:
      normalized.tempToken,

    temporary_token:
      normalized.tempToken,

    challengeToken:
      normalized.tempToken,

    challenge_token:
      normalized.tempToken,

    twoFactorToken:
      normalized.tempToken,

    two_factor_token:
      normalized.tempToken,

    mfaToken:
      normalized.tempToken,

    mfa_token:
      normalized.tempToken,

    otpToken:
      normalized.tempToken,

    otp_token:
      normalized.tempToken,

    token:
      normalized.tempToken,

    code:
      normalized.code,

    otp:
      normalized.code,

    totp:
      normalized.code,

    mfaCode:
      normalized.code,

    mfa_code:
      normalized.code,

    twoFactorCode:
      normalized.code,

    two_factor_code:
      normalized.code,

    verificationCode:
      normalized.code,

    verification_code:
      normalized.code,

    identifier:
      normalized.identifier,

    login:
      normalized.identifier,

    email:
      normalized.identifier.includes("@")
        ? normalized.identifier
        : undefined,

    username:
      !normalized.identifier.includes("@")
        ? normalized.identifier
        : undefined,

    method:
      normalized.method,

    channel:
      normalized.method,

    remember:
      normalized.remember,

    rememberMe:
      normalized.remember,

    remember_me:
      normalized.remember,

    trustDevice:
      normalized.trustDevice,

    trust_device:
      normalized.trustDevice,

    rememberDevice:
      normalized.trustDevice,

    remember_device:
      normalized.trustDevice,

    redirect:
      normalized.redirect,

    redirectTo:
      normalized.redirect,

    returnTo:
      normalized.redirect,
  });
}

export function buildVerifyTwoFactorBody(payload = {}) {
  return buildTwoFactorVerifyBody(payload);
}

export function buildTwoFactorRequestBody(payload = {}) {
  const normalized =
    normalizeRequestTwoFactorPayload(payload);

  return stripEmptyValues({
    tempToken:
      normalized.tempToken,

    temp_token:
      normalized.tempToken,

    temporaryToken:
      normalized.tempToken,

    temporary_token:
      normalized.tempToken,

    challengeToken:
      normalized.tempToken,

    challenge_token:
      normalized.tempToken,

    twoFactorToken:
      normalized.tempToken,

    two_factor_token:
      normalized.tempToken,

    mfaToken:
      normalized.tempToken,

    mfa_token:
      normalized.tempToken,

    otpToken:
      normalized.tempToken,

    otp_token:
      normalized.tempToken,

    token:
      normalized.tempToken,

    identifier:
      normalized.identifier,

    login:
      normalized.identifier,

    email:
      normalized.identifier.includes("@")
        ? normalized.identifier
        : undefined,

    username:
      !normalized.identifier.includes("@")
        ? normalized.identifier
        : undefined,

    method:
      normalized.method,

    channel:
      normalized.method,
  });
}

export function buildRequestTwoFactorBody(payload = {}) {
  return buildTwoFactorRequestBody(payload);
}

export function buildResendTwoFactorBody(payload = {}) {
  return buildTwoFactorRequestBody(payload);
}

/* =========================================================
   RESPONSE NODE
========================================================= */

function getNode(input = {}) {
  const root =
    safeObject(input);

  const data =
    safeObject(root.data);

  const payload =
    safeObject(root.payload);

  const result =
    safeObject(root.result);

  const body =
    safeObject(root.body);

  const responseNode =
    safeObject(root.response);

  const responseData =
    safeObject(responseNode.data);

  const auth =
    safeObject(root.auth);

  const authData =
    safeObject(root.authData);

  const session =
    safeObject(root.session);

  const sessionData =
    safeObject(root.sessionData);

  const meta =
    safeObject(root.meta);

  return {
    root,
    data,
    payload,
    result,
    body,
    responseNode,
    responseData,
    auth,
    authData,
    session,
    sessionData,
    meta,
  };
}

function nodeList(input = {}) {
  const nodes =
    getNode(input);

  return Object.values(nodes)
    .filter(isObject);
}

/* =========================================================
   RESPONSE RESOLUTION
========================================================= */

function resolveExplicitOk(input = {}) {
  const nodes =
    nodeList(input);

  const keys = [
    "ok",
    "success",
    "valid",
    "accepted",
    "completed",
    "verified",
    "authenticated",
  ];

  for (const node of nodes) {
    for (const key of keys) {
      if (typeof node[key] === "boolean") {
        return node[key];
      }
    }
  }

  return null;
}

function resolveStatus(input = {}) {
  const nodes =
    nodeList(input);

  for (const node of nodes) {
    const status =
      pickFirst(
        node.status,
        node.statusCode,
        node.status_code
      );

    if (
      status !== null &&
      status !== undefined &&
      status !== ""
    ) {
      return safeNumber(status, 0);
    }
  }

  return 0;
}

function normalizeStatusText(value = "") {
  const text =
    safeText(value, "")
      .toLowerCase()
      .trim();

  if (!text) {
    return "";
  }

  const numeric =
    Number(text);

  if (Number.isFinite(numeric)) {
    return "";
  }

  return text;
}

function resolveStatusText(input = {}) {
  const nodes =
    nodeList(input);

  for (const node of nodes) {
    const candidates = [
      node.statusText,
      node.status_text,
      node.state,
      node.status,
    ];

    for (const candidate of candidates) {
      const text =
        normalizeStatusText(candidate);

      if (text) {
        return text;
      }
    }
  }

  return "";
}

function resolveCode(input = {}) {
  const nodes =
    nodeList(input);

  for (const node of nodes) {
    const code =
      pickFirstText(
        node.code,
        node.errorCode,
        node.error_code,
        node.error
      );

    if (code) {
      return code;
    }
  }

  return "";
}

function parseRetryAfterToSeconds(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return 0;
  }

  const numeric =
    Number(raw);

  if (Number.isFinite(numeric)) {
    return Math.max(
      0,
      Math.ceil(numeric)
    );
  }

  const dateMs =
    Date.parse(raw);

  if (Number.isFinite(dateMs)) {
    return Math.max(
      0,
      Math.ceil((dateMs - Date.now()) / 1000)
    );
  }

  return 0;
}

function resolveRetryAfter(input = {}) {
  const nodes =
    nodeList(input);

  for (const node of nodes) {
    const retryAfter =
      safeNumber(
        pickFirst(
          node.retryAfter,
          node.retry_after,
          node.cooldownSeconds,
          node.cooldown_seconds,
          node.rateLimitSeconds,
          node.rate_limit_seconds
        ),
        0
      );

    if (retryAfter > 0) {
      return retryAfter;
    }
  }

  return 0;
}

function resolveMessage(input = {}, fallback = "") {
  const nodes =
    nodeList(input);

  for (const node of nodes) {
    const message =
      pickFirstText(
        node.message,
        node.mensaje,
        node.detail,
        node.description,
        node.error,
        node.title,
        node.reason,
        node.msg
      );

    if (message) {
      return message;
    }
  }

  return fallback;
}

function resolveRedirectTo(input = {}, fallback = "") {
  const nodes =
    nodeList(input);

  for (const node of nodes) {
    const redirect =
      sanitizeRedirect(
        pickFirstText(
          node.redirectTo,
          node.redirect_to,
          node.redirect,
          node.next,
          node.nextPath,
          node.next_path,
          node.returnTo,
          node.return_to
        ),
        ""
      );

    if (redirect) {
      return redirect;
    }
  }

  return fallback;
}

function extractTempTokenFromResponse(input = {}) {
  const nodes =
    nodeList(input);

  for (const node of nodes) {
    for (const key of TEMP_TOKEN_FIELD_NAMES) {
      const token =
        normalizeTempTokenValue(
          node?.[key]
        );

      if (token) {
        return token;
      }
    }
  }

  return "";
}

function isExplicitFailure(input = {}) {
  const explicitOk =
    resolveExplicitOk(input);

  if (explicitOk === false) {
    return true;
  }

  const status =
    resolveStatus(input);

  if (
    Number.isFinite(status) &&
    status >= 400
  ) {
    return true;
  }

  const statusText =
    resolveStatusText(input);

  if (
    statusText &&
    FAILURE_STATUS_TEXTS.includes(statusText)
  ) {
    return true;
  }

  const code =
    resolveCode(input)
      .toUpperCase();

  if (
    code &&
    FAILURE_CODES.includes(code)
  ) {
    return true;
  }

  return false;
}

function isDeclaredSuccess(input = {}) {
  const explicitOk =
    resolveExplicitOk(input);

  if (explicitOk === true) {
    return true;
  }

  if (explicitOk === false) {
    return false;
  }

  const status =
    resolveStatus(input);

  if (
    status >= 200 &&
    status < 300
  ) {
    return true;
  }

  const statusText =
    resolveStatusText(input);

  return Boolean(
    statusText &&
      SUCCESS_STATUS_TEXTS.includes(statusText)
  );
}

function hasCompleteSession(input = {}) {
  const token =
    safeText(extractToken(input), "");

  const user =
    extractUser(input);

  return Boolean(
    token &&
      user &&
      (
        user.id ||
        user.userId ||
        user.user_id ||
        user.email ||
        user.username ||
        user.phone
      )
  );
}

function isCooldownResponse(input = {}) {
  const status =
    resolveStatus(input);

  const retryAfter =
    resolveRetryAfter(input);

  const code =
    resolveCode(input)
      .toUpperCase();

  const statusText =
    resolveStatusText(input);

  const nodes =
    nodeList(input);

  return Boolean(
    status === 429 ||
      retryAfter > 0 ||
      code === "RATE_LIMITED" ||
      code === "TOO_MANY_REQUESTS" ||
      statusText === "rate_limited" ||
      statusText === "too_many_requests" ||
      nodes.some((node) =>
        node.cooldown === true ||
        node.rateLimited === true ||
        node.rate_limited === true
      )
  );
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

function buildBaseNormalizedResponse({
  input = {},
  successMessage = "",
  errorMessage = "",
  redirectFallback = "",
} = {}) {
  const cooldown =
    isCooldownResponse(input);

  const retryAfter =
    resolveRetryAfter(input);

  const explicitFailure =
    isExplicitFailure(input);

  const sessionComplete =
    hasCompleteSession(input);

  const ok =
    explicitFailure
      ? false
      : (
          isDeclaredSuccess(input) ||
          sessionComplete
        );

  const token =
    extractToken(input);

  const refreshToken =
    extractRefreshToken(input);

  const user =
    extractUser(input);

  const sessionData =
    normalizeSessionPayload(input);

  const tempToken =
    extractTempTokenFromResponse(input);

  const message =
    resolveMessage(
      input,
      ok
        ? successMessage
        : cooldown
          ? getRateLimitMessage()
          : errorMessage
    );

  return {
    raw:
      input,

    ok,
    success:
      ok,
    error:
      !ok,

    verified:
      ok,

    authenticated:
      Boolean(sessionComplete),

    status:
      resolveStatus(input),

    statusText:
      resolveStatusText(input) || null,

    code:
      resolveCode(input) || null,

    explicitFailure,

    cooldown,
    rateLimited:
      cooldown,

    retryAfter,
    cooldownSeconds:
      retryAfter,

    message,

    redirectTo:
      resolveRedirectTo(
        input,
        redirectFallback
      ),

    token:
      token || null,

    accessToken:
      token || null,

    access_token:
      token || null,

    refreshToken:
      refreshToken || null,

    refresh_token:
      refreshToken || null,

    tempToken:
      tempToken || null,

    temp_token:
      tempToken || null,

    user:
      user || null,

    usuario:
      user || null,

    me:
      user || null,

    session:
      sessionData || null,

    sessionData:
      sessionData || null,

    at:
      isoNow(),
  };
}

export function normalizeTwoFactorResponse(input = {}) {
  return buildBaseNormalizedResponse({
    input,
    successMessage:
      getDefaultVerifySuccessMessage(),
    errorMessage:
      getDefaultVerifyErrorMessage(),
    redirectFallback:
      DEFAULT_HOME_REDIRECT,
  });
}

export function normalizeVerifyTwoFactorResponse(input = {}) {
  return normalizeTwoFactorResponse(input);
}

export function normalizeRequestTwoFactorResponse(input = {}) {
  return buildBaseNormalizedResponse({
    input,
    successMessage:
      getDefaultRequestSuccessMessage(),
    errorMessage:
      getDefaultRequestErrorMessage(),
    redirectFallback:
      TWO_FACTOR_PATH,
  });
}

export function normalizeResendTwoFactorResponse(input = {}) {
  return buildBaseNormalizedResponse({
    input,
    successMessage:
      getDefaultResendSuccessMessage(),
    errorMessage:
      getDefaultResendErrorMessage(),
    redirectFallback:
      TWO_FACTOR_PATH,
  });
}

/* =========================================================
   URL RESOLUTION
========================================================= */

function buildFinalUrl(endpoint = "") {
  const clean =
    safeText(endpoint, "");

  if (!clean) {
    return DEFAULT_VERIFY_ENDPOINT;
  }

  if (isAbsoluteUrl(clean)) {
    return clean;
  }

  const apiBase =
    safeText(
      AppCore?.config?.apiBase ||
        AppCore?.config?.api?.baseUrl ||
        AppCore?.config?.api?.base ||
        "",
      ""
    );

  if (!apiBase) {
    return clean;
  }

  const base =
    apiBase.replace(/\/+$/g, "");

  const path =
    clean.startsWith("/")
      ? clean
      : `/${clean}`;

  if (
    base.endsWith("/api") &&
    path.startsWith("/api/")
  ) {
    return `${base}${path.slice(4)}`;
  }

  return `${base}${path}`;
}

/* =========================================================
   ERROR NORMALIZATION
========================================================= */

function normalizeTransportError(
  error = null,
  fallbackMessage = getDefaultVerifyErrorMessage()
) {
  const status =
    safeNumber(
      error?.status ??
        error?.statusCode ??
        error?.response?.status ??
        error?.data?.status ??
        error?.response?.data?.status ??
        0,
      0
    );

  const retryAfter =
    Math.max(
      0,
      safeNumber(
        error?.retryAfter ??
          error?.retry_after ??
          error?.cooldownSeconds ??
          error?.cooldown_seconds ??
          error?.data?.retryAfter ??
          error?.data?.retry_after ??
          error?.data?.cooldownSeconds ??
          error?.data?.cooldown_seconds ??
          error?.response?.data?.retryAfter ??
          error?.response?.data?.retry_after ??
          error?.response?.data?.cooldownSeconds ??
          error?.response?.data?.cooldown_seconds ??
          0,
        0
      )
    );

  const message =
    safeText(
      error?.data?.message ??
        error?.data?.mensaje ??
        error?.data?.error ??
        error?.response?.data?.message ??
        error?.response?.data?.mensaje ??
        error?.response?.data?.error ??
        error?.message,
      status === 429 || retryAfter > 0
        ? getRateLimitMessage()
        : fallbackMessage
    );

  return {
    ok:
      false,
    success:
      false,
    error:
      true,

    status,

    statusText:
      error?.statusText || null,

    code:
      error?.code ||
      error?.data?.code ||
      error?.response?.data?.code ||
      null,

    retryAfter,
    cooldownSeconds:
      retryAfter,

    cooldown:
      status === 429 || retryAfter > 0,

    rateLimited:
      status === 429 || retryAfter > 0,

    message,

    data:
      error?.data ||
      error?.response?.data ||
      null,

    raw:
      error || null,
  };
}

function rememberError(type = "unknown", error = null) {
  runtime.lastError = {
    type,
    message:
      safeText(error?.message, ""),
    status:
      error?.status || 0,
    code:
      error?.code || null,
    at:
      isoNow(),
  };
}

function rememberResult(type = "unknown", result = {}) {
  runtime.lastResult = {
    type,
    ok:
      Boolean(result?.ok),
    authenticated:
      Boolean(result?.authenticated),
    status:
      result?.status || 0,
    statusText:
      result?.statusText || null,
    code:
      result?.code || null,
    cooldown:
      Boolean(result?.cooldown),
    retryAfter:
      result?.retryAfter || 0,
    at:
      isoNow(),
  };

  if (result?.ok) {
    runtime.failCount =
      0;

    runtime.cooldownUntil =
      0;
  }

  if (
    result?.cooldown &&
    result?.retryAfter
  ) {
    runtime.cooldownUntil =
      nowMs() + result.retryAfter * 1000;
  }
}

function getErrorStatus(error = null) {
  return safeNumber(
    error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      error?.data?.status ||
      error?.response?.data?.status ||
      0,
    0
  );
}

function shouldTryNextEndpoint(error = null) {
  return FALLBACK_NEXT_ENDPOINT_STATUSES.has(
    getErrorStatus(error)
  );
}

function getRemainingCooldownSeconds() {
  const remaining =
    runtime.cooldownUntil - nowMs();

  return Math.max(
    0,
    Math.ceil(remaining / 1000)
  );
}

function buildCooldownResponse(message = getRateLimitMessage()) {
  const retryAfter =
    getRemainingCooldownSeconds();

  return {
    ok:
      false,
    success:
      false,
    error:
      true,

    status:
      429,

    code:
      "RATE_LIMITED",

    cooldown:
      true,

    rateLimited:
      true,

    retryAfter,

    cooldownSeconds:
      retryAfter,

    message,

    raw: {
      ok:
        false,
      status:
        429,
      retryAfter,
      message,
    },

    at:
      isoNow(),
  };
}

/* =========================================================
   ABORT / FETCH WITH TIMEOUT
========================================================= */

function hasAbortSignal(value = null) {
  return Boolean(
    value &&
      typeof value === "object" &&
      "aborted" in value &&
      isFunction(value.addEventListener)
  );
}

function createAbortError(message = "Request aborted") {
  try {
    if (typeof DOMException !== "undefined") {
      return new DOMException(
        message,
        "AbortError"
      );
    }
  } catch {}

  const error =
    new Error(message);

  error.name =
    "AbortError";
  error.aborted =
    true;

  return error;
}

function mergeAbortSignals(signals = []) {
  const validSignals =
    safeArray(signals)
      .filter(hasAbortSignal);

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
        signal.reason ||
          createAbortError()
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

async function parseFetchBody(httpResponse) {
  const contentType =
    safeText(
      httpResponse?.headers?.get?.("content-type"),
      ""
    ).toLowerCase();

  try {
    if (contentType.includes("application/json")) {
      return await httpResponse.json();
    }

    const text =
      await httpResponse.text();

    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      return {
        message:
          text,
      };
    }
  } catch {
    return {};
  }
}

async function fetchJsonWithTimeout(
  url,
  body,
  timeoutMs = getRequestTimeout(),
  externalSignal = null
) {
  if (typeof fetch !== "function") {
    const error =
      new Error("Fetch API no disponible.");

    error.status =
      500;
    error.code =
      "FETCH_MISSING";

    throw error;
  }

  if (externalSignal?.aborted) {
    throw createAbortError(
      "Request aborted before two-factor fetch."
    );
  }

  const controller =
    typeof AbortController !== "undefined"
      ? new AbortController()
      : null;

  let timeoutTriggered =
    false;

  const timer =
    controller
      ? setTimeout(() => {
          timeoutTriggered =
            true;

          try {
            controller.abort("two-factor-timeout");
          } catch {
            try {
              controller.abort();
            } catch {}
          }
        }, timeoutMs)
      : null;

  const signal =
    mergeAbortSignals([
      controller?.signal,
      externalSignal,
    ]);

  try {
    const httpResponse =
      await fetch(url, {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          Accept:
            "application/json",
        },

        credentials:
          "omit",

        cache:
          "no-store",

        body:
          JSON.stringify(body),

        signal:
          signal || undefined,
      });

    const payload =
      safeObject(
        await parseFetchBody(httpResponse)
      );

    const retryAfterHeader =
      parseRetryAfterToSeconds(
        httpResponse.headers?.get?.("retry-after") || ""
      );

    const enrichedPayload = {
      ...payload,

      status:
        payload.status ??
        payload.statusCode ??
        httpResponse.status,

      statusCode:
        payload.statusCode ??
        payload.status ??
        httpResponse.status,

      retryAfter:
        payload.retryAfter ??
        payload.retry_after ??
        payload.cooldownSeconds ??
        retryAfterHeader,
    };

    if (!httpResponse.ok) {
      const error =
        new Error(
          resolveMessage(
            enrichedPayload,
            httpResponse.statusText || getDefaultVerifyErrorMessage()
          )
        );

      error.status =
        httpResponse.status;
      error.statusText =
        httpResponse.statusText;
      error.data =
        enrichedPayload;
      error.retryAfter =
        enrichedPayload.retryAfter || 0;

      throw error;
    }

    return enrichedPayload;
  } catch (error) {
    if (timeoutTriggered) {
      try {
        error.timeout =
          true;
        error.aborted =
          false;
        error.code =
          error.code || "REQUEST_TIMEOUT";
      } catch {}
    }

    throw error;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/* =========================================================
   TRANSPORTS
========================================================= */

function buildRequestOptions(options = {}) {
  return {
    ...REQUEST_METHOD_OPTIONS,

    timeout:
      getRequestTimeout(),

    timeoutMs:
      getRequestTimeout(),

    useLoader:
      options.useLoader !== false,

    ...safeObject(options),

    auth:
      false,

    public:
      true,

    skipAuth:
      true,

    silent:
      true,

    storeError:
      false,

    _skipAuthRefresh:
      true,

    skipAuthRefresh:
      true,
  };
}

async function requestWithApiClient(endpoint, body, options = {}) {
  const apiClient =
    AppCore?.apiClient || null;

  if (!apiClient) {
    return null;
  }

  const requestOptions =
    buildRequestOptions(options);

  if (isFunction(apiClient.post)) {
    return apiClient.post(
      endpoint,
      body,
      requestOptions
    );
  }

  if (isFunction(apiClient.request)) {
    try {
      return await apiClient.request(
        endpoint,
        {
          ...requestOptions,
          method:
            "POST",
          body,
        }
      );
    } catch (error) {
      if (shouldTryNextEndpoint(error)) {
        throw error;
      }

      try {
        return await apiClient.request(
          "POST",
          endpoint,
          {
            ...requestOptions,
            body,
          }
        );
      } catch {
        throw error;
      }
    }
  }

  return null;
}

async function requestWithAppCoreRequest(endpoint, body, options = {}) {
  if (!isFunction(AppCore?.request)) {
    return null;
  }

  const requestOptions =
    buildRequestOptions(options);

  try {
    return await AppCore.request(
      endpoint,
      {
        ...requestOptions,
        method:
          "POST",
        body,
      }
    );
  } catch (error) {
    if (shouldTryNextEndpoint(error)) {
      throw error;
    }

    try {
      return await AppCore.request(
        "POST",
        endpoint,
        {
          ...requestOptions,
          body,
        }
      );
    } catch {
      throw error;
    }
  }
}

async function requestWithHttpService(endpoint, body, options = {}) {
  const http =
    AppCore?.http ||
    AppCore?.Http ||
    AppCore?.services?.http ||
    AppCore?.services?.Http ||
    null;

  if (!http) {
    return null;
  }

  const requestOptions =
    buildRequestOptions(options);

  if (isFunction(http.post)) {
    return http.post(
      endpoint,
      body,
      requestOptions
    );
  }

  if (isFunction(http.request)) {
    try {
      return await http.request(
        "POST",
        endpoint,
        {
          ...requestOptions,
          body,
        }
      );
    } catch (error) {
      if (shouldTryNextEndpoint(error)) {
        throw error;
      }

      try {
        return await http.request(
          endpoint,
          {
            ...requestOptions,
            method:
              "POST",
            body,
          }
        );
      } catch {
        throw error;
      }
    }
  }

  return null;
}

async function requestWithFetch(endpoint, body, options = {}) {
  const url =
    buildFinalUrl(endpoint);

  return fetchJsonWithTimeout(
    url,
    body,
    getRequestTimeout(),
    options?.signal || null
  );
}

async function executeTwoFactorRequest(endpoint, body, options = {}) {
  const transports = [
    requestWithApiClient,
    requestWithAppCoreRequest,
    requestWithHttpService,
  ];

  for (const transport of transports) {
    const result =
      await transport(
        endpoint,
        body,
        options
      );

    if (
      result !== null &&
      result !== undefined
    ) {
      return result;
    }
  }

  return requestWithFetch(
    endpoint,
    body,
    options
  );
}

async function executeTwoFactorRequestWithCandidates(
  candidates = [],
  body = {},
  options = {}
) {
  const endpoints =
    unique(candidates);

  let lastError =
    null;

  for (const endpoint of endpoints) {
    try {
      return await executeTwoFactorRequest(
        endpoint,
        body,
        {
          ...safeObject(options),
          endpoint,
        }
      );
    } catch (error) {
      lastError =
        error;

      if (!shouldTryNextEndpoint(error)) {
        throw error;
      }
    }
  }

  throw lastError ||
    new Error("No hay endpoint 2FA disponible.");
}

/* =========================================================
   VALIDATION
========================================================= */

function validateVerifyPayload(normalized = {}) {
  if (!normalized.tempToken) {
    return "No se recibió token temporal de verificación.";
  }

  if (
    normalized.tempToken.length <
    getTokenMinLength()
  ) {
    return "El token temporal no es válido.";
  }

  if (!normalized.code) {
    return "El código de verificación es obligatorio.";
  }

  if (
    normalized.code.length <
    getCodeMinLength()
  ) {
    return `El código debe tener al menos ${getCodeMinLength()} caracteres.`;
  }

  if (
    normalized.code.length >
    getCodeMaxLength()
  ) {
    return "El código de verificación es demasiado largo.";
  }

  return "";
}

function validateRequestPayload(normalized = {}) {
  if (
    !normalized.tempToken &&
    !normalized.identifier
  ) {
    return "No se recibió contexto para solicitar el código.";
  }

  if (
    normalized.tempToken &&
    normalized.tempToken.length < getTokenMinLength()
  ) {
    return "El token temporal no es válido.";
  }

  return "";
}

/* =========================================================
   SESSION COMMIT
========================================================= */

function hasUsableReturnedUser(user = null) {
  return Boolean(
    user &&
      isObject(user) &&
      user.active !== false &&
      (
        user.id ||
        user.userId ||
        user.user_id ||
        user.email ||
        user.username ||
        user.phone
      )
  );
}

function clearTempTokenSafe() {
  try {
    persistTempToken(null);
  } catch {}

  try {
    persistTempToken("");
  } catch {}

  return true;
}

function maybePersistReturnedTempToken(normalizedResponse = {}, source = "2fa") {
  const token =
    normalizeTempTokenValue(
      normalizedResponse?.tempToken ||
        normalizedResponse?.temp_token ||
        ""
    );

  if (!token) {
    return false;
  }

  try {
    persistTempToken(token);
  } catch {}

  safeEmit(
    "auth:2fa:temp-token-updated",
    {
      source,
      hasTempToken:
        true,
    }
  );

  return true;
}

function maybeApplyReturnedSession(normalizedResponse = {}, source = "2fa") {
  if (
    !normalizedResponse?.authenticated ||
    !normalizedResponse?.token ||
    !hasUsableReturnedUser(normalizedResponse?.user)
  ) {
    return null;
  }

  try {
    const snapshot =
      applySession({
        token:
          normalizedResponse.token,

        accessToken:
          normalizedResponse.token,

        access_token:
          normalizedResponse.token,

        refreshToken:
          normalizedResponse.refreshToken || null,

        refresh_token:
          normalizedResponse.refreshToken || null,

        user:
          normalizedResponse.user,

        usuario:
          normalizedResponse.user,

        me:
          normalizedResponse.user,

        account:
          normalizedResponse.user,

        profile:
          normalizedResponse.user,

        session:
          normalizedResponse.sessionData ||
          normalizedResponse.session ||
          null,

        sessionData:
          normalizedResponse.sessionData ||
          normalizedResponse.session ||
          null,

        authenticated:
          true,

        preserveExistingUser:
          false,

        source,
        eventMode:
          "login",
      });

    clearTempTokenSafe();

    safeEmit(
      "auth:2fa:session-applied",
      {
        authenticated:
          Boolean(snapshot?.authenticated),
        hasUser:
          Boolean(snapshot?.user),
        role:
          snapshot?.role || null,
        source,
      }
    );

    return snapshot;
  } catch (error) {
    safeWarn(
      "No se pudo aplicar sesión devuelta por 2FA.",
      error
    );

    return null;
  }
}

/* =========================================================
   ACTIONS
========================================================= */

export async function verifyTwoFactor(payload = {}, options = {}) {
  if (runtime.verifyInFlight) {
    return runtime.verifyInFlight;
  }

  const activeCooldown =
    getRemainingCooldownSeconds();

  if (activeCooldown > 0) {
    return normalizeTwoFactorResponse(
      buildCooldownResponse()
    );
  }

  const normalized =
    normalizeTwoFactorPayload(payload);

  const validationError =
    validateVerifyPayload(normalized);

  if (validationError) {
    return normalizeTwoFactorResponse({
      ok:
        false,
      status:
        400,
      message:
        validationError,
    });
  }

  const endpoints =
    endpointCandidatesFor("verify");

  const body =
    buildTwoFactorVerifyBody(normalized);

  runtime.verifyCount += 1;
  runtime.lastVerifyAt =
    nowMs();

  safeEmit(
    "auth:2fa:verify:start",
    {
      endpoints,
      hasIdentifier:
        Boolean(normalized.identifier),
      trustDevice:
        Boolean(normalized.trustDevice),
      remember:
        Boolean(normalized.remember),
    }
  );

  runtime.verifyInFlight =
    (async () => {
      try {
        const raw =
          await executeTwoFactorRequestWithCandidates(
            endpoints,
            body,
            {
              ...safeObject(options),
              _skipAuthRefresh:
                true,
              auth:
                false,
              public:
                true,
              silent:
                true,
              storeError:
                false,
            }
          );

        const normalizedResponse =
          normalizeTwoFactorResponse(raw);

        const sessionSnapshot =
          maybeApplyReturnedSession(
            normalizedResponse,
            "2fa:verify"
          );

        const finalResponse = {
          ...normalizedResponse,

          sessionApplied:
            Boolean(sessionSnapshot),
        };

        if (
          finalResponse.ok &&
          !finalResponse.authenticated &&
          options.requireSession !== false
        ) {
          finalResponse.ok =
            false;
          finalResponse.success =
            false;
          finalResponse.error =
            true;
          finalResponse.message =
            finalResponse.message ||
            "La verificación no devolvió una sesión completa.";
        }

        if (
          finalResponse.ok &&
          finalResponse.tempToken
        ) {
          maybePersistReturnedTempToken(
            finalResponse,
            "2fa:verify"
          );
        }

        rememberResult(
          "verify",
          finalResponse
        );

        safeEmit(
          "auth:2fa:verify:complete",
          {
            ok:
              finalResponse.ok,
            authenticated:
              finalResponse.authenticated,
            sessionApplied:
              finalResponse.sessionApplied,
            status:
              finalResponse.status,
            statusText:
              finalResponse.statusText,
            redirectTo:
              finalResponse.redirectTo,
          }
        );

        return finalResponse;
      } catch (error) {
        runtime.failCount += 1;

        if (
          runtime.failCount >=
          getMaxAttempts()
        ) {
          runtime.cooldownUntil =
            nowMs() + getCooldownMs();
        }

        rememberError(
          "verify",
          error
        );

        const normalizedError =
          normalizeTransportError(
            error,
            getDefaultVerifyErrorMessage()
          );

        const normalizedResponse =
          normalizeTwoFactorResponse(
            normalizedError
          );

        rememberResult(
          "verify:error",
          normalizedResponse
        );

        safeEmit(
          "auth:2fa:verify:error",
          {
            status:
              normalizedResponse.status,
            statusText:
              normalizedResponse.statusText,
            code:
              normalizedResponse.code,
            message:
              normalizedResponse.message,
            cooldown:
              normalizedResponse.cooldown,
            retryAfter:
              normalizedResponse.retryAfter,
          }
        );

        return normalizedResponse;
      } finally {
        runtime.verifyInFlight =
          null;
      }
    })();

  return runtime.verifyInFlight;
}

export async function requestTwoFactorCode(payload = {}, options = {}) {
  if (runtime.requestInFlight) {
    return runtime.requestInFlight;
  }

  const normalized =
    normalizeRequestTwoFactorPayload(payload);

  const validationError =
    validateRequestPayload(normalized);

  if (validationError) {
    return normalizeRequestTwoFactorResponse({
      ok:
        false,
      status:
        400,
      message:
        validationError,
    });
  }

  const endpoints =
    endpointCandidatesFor("request");

  const body =
    buildTwoFactorRequestBody(normalized);

  runtime.requestCount += 1;
  runtime.lastRequestAt =
    nowMs();

  safeEmit(
    "auth:2fa:request:start",
    {
      endpoints,
      hasIdentifier:
        Boolean(normalized.identifier),
      method:
        normalized.method || null,
    }
  );

  runtime.requestInFlight =
    (async () => {
      try {
        const raw =
          await executeTwoFactorRequestWithCandidates(
            endpoints,
            body,
            {
              ...safeObject(options),
              _skipAuthRefresh:
                true,
              auth:
                false,
              public:
                true,
              silent:
                true,
              storeError:
                false,
            }
          );

        const normalizedResponse =
          normalizeRequestTwoFactorResponse(raw);

        if (
          normalizedResponse.ok &&
          normalizedResponse.tempToken
        ) {
          maybePersistReturnedTempToken(
            normalizedResponse,
            "2fa:request"
          );
        }

        rememberResult(
          "request",
          normalizedResponse
        );

        safeEmit(
          "auth:2fa:request:complete",
          {
            ok:
              normalizedResponse.ok,
            status:
              normalizedResponse.status,
            statusText:
              normalizedResponse.statusText,
            cooldown:
              normalizedResponse.cooldown,
            retryAfter:
              normalizedResponse.retryAfter,
            hasTempToken:
              Boolean(normalizedResponse.tempToken),
          }
        );

        return normalizedResponse;
      } catch (error) {
        rememberError(
          "request",
          error
        );

        const normalizedError =
          normalizeTransportError(
            error,
            getDefaultRequestErrorMessage()
          );

        const normalizedResponse =
          normalizeRequestTwoFactorResponse(
            normalizedError
          );

        rememberResult(
          "request:error",
          normalizedResponse
        );

        safeEmit(
          "auth:2fa:request:error",
          {
            status:
              normalizedResponse.status,
            code:
              normalizedResponse.code,
            message:
              normalizedResponse.message,
          }
        );

        return normalizedResponse;
      } finally {
        runtime.requestInFlight =
          null;
      }
    })();

  return runtime.requestInFlight;
}

export async function resendTwoFactorCode(payload = {}, options = {}) {
  if (runtime.resendInFlight) {
    return runtime.resendInFlight;
  }

  const normalized =
    normalizeRequestTwoFactorPayload(payload);

  const validationError =
    validateRequestPayload(normalized);

  if (validationError) {
    return normalizeResendTwoFactorResponse({
      ok:
        false,
      status:
        400,
      message:
        validationError,
    });
  }

  const endpoints =
    endpointCandidatesFor("resend");

  const body =
    buildResendTwoFactorBody(normalized);

  runtime.resendCount += 1;
  runtime.lastResendAt =
    nowMs();

  safeEmit(
    "auth:2fa:resend:start",
    {
      endpoints,
      hasIdentifier:
        Boolean(normalized.identifier),
      method:
        normalized.method || null,
    }
  );

  runtime.resendInFlight =
    (async () => {
      try {
        const raw =
          await executeTwoFactorRequestWithCandidates(
            endpoints,
            body,
            {
              ...safeObject(options),
              _skipAuthRefresh:
                true,
              auth:
                false,
              public:
                true,
              silent:
                true,
              storeError:
                false,
            }
          );

        const normalizedResponse =
          normalizeResendTwoFactorResponse(raw);

        if (
          normalizedResponse.ok &&
          normalizedResponse.tempToken
        ) {
          maybePersistReturnedTempToken(
            normalizedResponse,
            "2fa:resend"
          );
        }

        rememberResult(
          "resend",
          normalizedResponse
        );

        safeEmit(
          "auth:2fa:resend:complete",
          {
            ok:
              normalizedResponse.ok,
            status:
              normalizedResponse.status,
            statusText:
              normalizedResponse.statusText,
            cooldown:
              normalizedResponse.cooldown,
            retryAfter:
              normalizedResponse.retryAfter,
            hasTempToken:
              Boolean(normalizedResponse.tempToken),
          }
        );

        return normalizedResponse;
      } catch (error) {
        rememberError(
          "resend",
          error
        );

        const normalizedError =
          normalizeTransportError(
            error,
            getDefaultResendErrorMessage()
          );

        const normalizedResponse =
          normalizeResendTwoFactorResponse(
            normalizedError
          );

        rememberResult(
          "resend:error",
          normalizedResponse
        );

        safeEmit(
          "auth:2fa:resend:error",
          {
            status:
              normalizedResponse.status,
            code:
              normalizedResponse.code,
            message:
              normalizedResponse.message,
          }
        );

        return normalizedResponse;
      } finally {
        runtime.resendInFlight =
          null;
      }
    })();

  return runtime.resendInFlight;
}

/* =========================================================
   ALIASES
========================================================= */

export async function verify2FA(payload = {}, options = {}) {
  return verifyTwoFactor(
    payload,
    options
  );
}

export async function login2fa(payload = {}, options = {}) {
  return verifyTwoFactor(
    payload,
    options
  );
}

export async function verifyMfa(payload = {}, options = {}) {
  return verifyTwoFactor(
    payload,
    options
  );
}

export async function mfaLogin(payload = {}, options = {}) {
  return verifyTwoFactor(
    payload,
    options
  );
}

export async function twoFactorLogin(payload = {}, options = {}) {
  return verifyTwoFactor(
    payload,
    options
  );
}

export async function twoFactorVerify(payload = {}, options = {}) {
  return verifyTwoFactor(
    payload,
    options
  );
}

export async function submitTwoFactorCode(payload = {}, options = {}) {
  return verifyTwoFactor(
    payload,
    options
  );
}

export async function request2FA(payload = {}, options = {}) {
  return requestTwoFactorCode(
    payload,
    options
  );
}

export async function requestMfa(payload = {}, options = {}) {
  return requestTwoFactorCode(
    payload,
    options
  );
}

export async function sendTwoFactorCode(payload = {}, options = {}) {
  return requestTwoFactorCode(
    payload,
    options
  );
}

export async function resend2FA(payload = {}, options = {}) {
  return resendTwoFactorCode(
    payload,
    options
  );
}

export async function resendMfa(payload = {}, options = {}) {
  return resendTwoFactorCode(
    payload,
    options
  );
}

/* =========================================================
   ROUTE HELPERS
========================================================= */

export function isTwoFactorRoute(path = getCurrentPath()) {
  const raw =
    safeText(path, "");

  const clean =
    normalizePathnameOnly(
      raw
        .split("?")[0]
        .split("#")[0] ||
        "/"
    );

  return (
    clean === TWO_FACTOR_PATH ||
    clean.startsWith(`${TWO_FACTOR_PATH}/`) ||
    clean === OTP_PATH ||
    clean.startsWith(`${OTP_PATH}/`) ||
    clean === MFA_PATH ||
    clean.startsWith(`${MFA_PATH}/`)
  );
}

export function getTwoFactorRedirectPath(payload = {}) {
  const redirect =
    sanitizeRedirect(
      payload?.redirect ??
        payload?.redirectTo ??
        payload?.returnTo ??
        "",
      ""
    );

  if (redirect) {
    return redirect;
  }

  return TWO_FACTOR_PATH;
}

/* =========================================================
   DEBUG
========================================================= */

function sanitizeBodyForSnapshot(body = {}) {
  const output = {};

  for (const [key, value] of Object.entries(body || {})) {
    if (
      CODE_FIELD_NAMES.includes(key) ||
      TEMP_TOKEN_FIELD_NAMES.includes(key)
    ) {
      output[key] =
        value ? "***" : value;
      continue;
    }

    output[key] =
      typeof value === "string"
        ? redactSafe(value)
        : value;
  }

  return output;
}

export function getTwoFactorSnapshot() {
  const storedTempToken =
    getStoredTempToken();

  return {
    version:
      TWO_FACTOR_MODULE_VERSION,

    verifyEndpoint:
      getTwoFactorVerifyEndpoint(),

    verifyEndpointCandidates:
      endpointCandidatesFor("verify"),

    requestEndpoint:
      getTwoFactorRequestEndpoint(),

    requestEndpointCandidates:
      endpointCandidatesFor("request"),

    resendEndpoint:
      getTwoFactorResendEndpoint(),

    resendEndpointCandidates:
      endpointCandidatesFor("resend"),

    currentPath:
      redactSafe(
        getCurrentPath()
      ),

    isTwoFactorRoute:
      isTwoFactorRoute(),

    hasStoredTempToken:
      Boolean(storedTempToken),

    hasTempTokenInCurrentUrl:
      Boolean(
        extractTempTokenFromUrl()
      ),

    limits: {
      codeMinLength:
        getCodeMinLength(),

      codeMaxLength:
        getCodeMaxLength(),

      tempTokenMinLength:
        getTokenMinLength(),

      tempTokenMaxLength:
        getTokenMaxLength(),

      timeout:
        getRequestTimeout(),

      cooldownMs:
        getCooldownMs(),

      maxAttempts:
        getMaxAttempts(),
    },

    runtime: {
      verifyInFlight:
        Boolean(runtime.verifyInFlight),

      requestInFlight:
        Boolean(runtime.requestInFlight),

      resendInFlight:
        Boolean(runtime.resendInFlight),

      lastVerifyAt:
        runtime.lastVerifyAt,

      lastRequestAt:
        runtime.lastRequestAt,

      lastResendAt:
        runtime.lastResendAt,

      verifyCount:
        runtime.verifyCount,

      requestCount:
        runtime.requestCount,

      resendCount:
        runtime.resendCount,

      failCount:
        runtime.failCount,

      cooldownUntil:
        runtime.cooldownUntil,

      remainingCooldownSeconds:
        getRemainingCooldownSeconds(),

      lastError:
        runtime.lastError
          ? safeClone(runtime.lastError, null)
          : null,

      lastResult:
        runtime.lastResult
          ? safeClone(runtime.lastResult, null)
          : null,
    },

    transports: {
      hasHttpService:
        Boolean(
          AppCore?.http ||
          AppCore?.Http ||
          AppCore?.services?.http ||
          AppCore?.services?.Http
        ),

      hasApiClient:
        Boolean(AppCore?.apiClient),

      hasAppCoreRequest:
        isFunction(AppCore?.request),

      hasFetch:
        typeof fetch === "function",
    },

    at:
      isoNow(),
  };
}

export function getTwoFactorDebugPayload(payload = {}) {
  return {
    verify:
      sanitizeBodyForSnapshot(
        buildTwoFactorVerifyBody(payload)
      ),

    request:
      sanitizeBodyForSnapshot(
        buildTwoFactorRequestBody(payload)
      ),

    resend:
      sanitizeBodyForSnapshot(
        buildResendTwoFactorBody(payload)
      ),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

const TwoFactor =
  Object.assign(
    verifyTwoFactor,
    {
      version:
        TWO_FACTOR_MODULE_VERSION,

      verifyTwoFactor,
      verify2FA,
      login2fa,
      verifyMfa,
      mfaLogin,
      twoFactorLogin,
      twoFactorVerify,
      submitTwoFactorCode,

      requestTwoFactorCode,
      request2FA,
      requestMfa,
      sendTwoFactorCode,

      resendTwoFactorCode,
      resend2FA,
      resendMfa,

      resolveTwoFactorTempToken,

      normalizeTwoFactorPayload,
      normalizeVerifyTwoFactorPayload,
      normalizeRequestTwoFactorPayload,

      buildTwoFactorVerifyBody,
      buildVerifyTwoFactorBody,
      buildTwoFactorRequestBody,
      buildRequestTwoFactorBody,
      buildResendTwoFactorBody,

      normalizeTwoFactorResponse,
      normalizeVerifyTwoFactorResponse,
      normalizeRequestTwoFactorResponse,
      normalizeResendTwoFactorResponse,

      getTwoFactorLoginEndpoint,
      getTwoFactorVerifyEndpoint,
      getMfaVerifyEndpoint,
      getTwoFactorRequestEndpoint,
      getTwoFactorResendEndpoint,

      isTwoFactorRoute,
      getTwoFactorRedirectPath,

      getTwoFactorSnapshot,
      getTwoFactorDebugPayload,
    }
  );

export default TwoFactor;
