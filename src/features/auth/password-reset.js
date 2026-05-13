/* =========================================================
   Onion SPA - Password Reset
   Archivo: src/features/auth/password-reset.js

   AUTH PASSWORD RESET · FINAL EXTREME PRO SYSTEM · GOD MODE v11

   RESPONSABILIDADES:
   - resolver identificador de recuperación
   - normalizar payload de reset-password-request
   - construir body robusto compatible con backends legacy
   - ejecutar petición recovery vía AppCore / Http / apiClient / fetch
   - normalizar respuestas y errores
   - soportar cooldown / rate-limit sin romper UX
   - nunca asumir success por defecto si backend no lo declara
   - endurecer urls / timeout / payload / redirects
   - soportar confirmación de nueva contraseña
   - soportar validación opcional de token reset
   - api pública estable para Auth module

   HARDENING EXTREMO:
   - transporte compatible con AppCore.apiClient, AppCore.request,
     AppCore.http, AppCore.Http, services.http y fetch
   - timeout real en fetch
   - redirects anti open-redirect
   - token/password/identifier con límites
   - tokens/passwords NO se truncan silenciosamente
   - respuestas nested: data / payload / result / body / response.data
   - status textual robusto: status/statusText/state
   - rate-limit: 429 / Retry-After / retryAfter / cooldownSeconds
   - errores normalizados sin throws hacia la UI pública
   - confirm password estricto
   - eventos sin tokens ni passwords reales
   - no toca sesión auth ni rutas públicas técnicas
   - no llama refresh
   - no asume éxito por HTTP 200 si backend no declara ok/success/accepted/valid/completed
   - default export callable + métodos públicos colgados

   FIX CRÍTICO:
   - sin conflicto SyntaxError por Identifier 'response'
   - getNode() expone responseNode en lugar de response
   - todos los resolvers usan responseNode
   - status:"success" / status:"valid" / status:"error" se interpretan correctamente
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  AUTH_ENDPOINTS,
  AUTH_CONSTANTS,
  AUTH_STORAGE_KEYS,
  AUTH_TOKEN_PARAM_NAMES,
  getRequestPasswordResetEndpoint as getRequestPasswordResetEndpointFromConstants,
  getConfirmPasswordResetEndpoint as getConfirmPasswordResetEndpointFromConstants,
  getValidateResetTokenEndpoint as getValidateResetTokenEndpointFromConstants,
} from "./constants.js";

import {
  normalizeTokenValue,
  sanitizeRedirectPath,
  redactTokenInText,
} from "./helpers.js";

/* =========================================================
   VERSION
========================================================= */

export const PASSWORD_RESET_MODULE_VERSION =
  "password-reset.11.0.0-god-mode";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_REQUEST_ENDPOINT =
  "/api/auth/reset-password-request";

const DEFAULT_CONFIRM_ENDPOINT =
  "/api/auth/reset-password-confirm";

const DEFAULT_VALIDATE_ENDPOINT =
  "/api/auth/reset-password/validate";

const DEFAULT_LOGIN_REDIRECT =
  "/login";

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
    "sent",
    "email_sent",
    "reset_sent",
    "password_reset_sent",
    "password_updated",
    "password_changed",
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
    "rate_limited",
    "too_many_requests",
  ]);

const FAILURE_CODES =
  Object.freeze([
    "INVALID_TOKEN",
    "TOKEN_INVALID",
    "TOKEN_EXPIRED",
    "RESET_TOKEN_EXPIRED",
    "RESET_TOKEN_INVALID",
    "PASSWORD_RESET_TOKEN_INVALID",
    "PASSWORD_RESET_TOKEN_EXPIRED",
    "INVALID_IDENTIFIER",
    "MISSING_IDENTIFIER",
    "MISSING_TOKEN",
    "MISSING_PASSWORD",
    "PASSWORD_MISMATCH",
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
    "[object object]",
    "{}",
    "[]",
    "\"undefined\"",
    "\"null\"",
    "\"false\"",
  ]);

const PASSWORD_FIELD_NAMES =
  Object.freeze([
    "password",
    "newPassword",
    "new_password",
    "confirmPassword",
    "passwordConfirmation",
    "password_confirmation",
    "repeatPassword",
    "repeat_password",
  ]);

const TOKEN_FIELD_NAMES =
  Object.freeze([
    "token",
    "code",
    "t",
    "resetToken",
    "reset_token",
    "reset_code",
    "passwordResetToken",
    "password_reset_token",
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

/* =========================================================
   RUNTIME STATE
========================================================= */

const runtime = {
  requestInFlight:
    null,

  confirmInFlight:
    null,

  validateInFlight:
    null,

  lastRequestAt:
    0,

  lastConfirmAt:
    0,

  lastValidateAt:
    0,

  requestCount:
    0,

  confirmCount:
    0,

  validateCount:
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

function isoNow() {
  try {
    return new Date().toISOString();
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

/* =========================================================
   EVENT SAFETY
========================================================= */

function redactSafe(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "")
      .replace(
        /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi,
        "$1***"
      )
      .replace(
        /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
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
      lower.includes("password") ||
      lower.includes("authorization") ||
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
      "[PasswordReset]",
      ...args
    );
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.warn(
        "[PasswordReset]",
        ...args
      );
    }
  } catch {}
}

/* =========================================================
   LIMITS
========================================================= */

function getResetIdentifierMaxLength() {
  return clampNumber(
    AUTH_CONSTANTS?.resetIdentifierMaxLength ??
      AUTH_CONSTANTS?.identifierMaxLength ??
      160,
    1,
    512
  );
}

function getResetTokenMinLength() {
  return clampNumber(
    AUTH_CONSTANTS?.resetTokenMinLength ??
      AUTH_CONSTANTS?.tokenMinLength ??
      8,
    1,
    4096
  );
}

function getResetTokenMaxLength() {
  return clampNumber(
    AUTH_CONSTANTS?.resetTokenMaxLength ??
      AUTH_CONSTANTS?.tokenMaxLength ??
      8192,
    getResetTokenMinLength(),
    32768
  );
}

function getResetPasswordMinLength() {
  return clampNumber(
    AUTH_CONSTANTS?.resetPasswordMinLength ??
      AUTH_CONSTANTS?.passwordMinLength ??
      8,
    1,
    1024
  );
}

function getResetPasswordMaxLength() {
  return clampNumber(
    AUTH_CONSTANTS?.resetPasswordMaxLength ??
      AUTH_CONSTANTS?.passwordMaxLength ??
      1024,
    getResetPasswordMinLength(),
    8192
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

function getDefaultCooldownSeconds() {
  return clampNumber(
    AUTH_CONSTANTS?.resetCooldownDefaultSeconds ??
      60,
    0,
    3600
  );
}

/* =========================================================
   DEFAULT MESSAGES
========================================================= */

function getDefaultSuccessMessage() {
  return "Si el identificador existe, te enviaremos las instrucciones para restablecer la contraseña.";
}

function getDefaultErrorMessage() {
  return "No se pudo iniciar la recuperación de acceso.";
}

function getDefaultConfirmSuccessMessage() {
  return "La contraseña se ha actualizado correctamente.";
}

function getDefaultConfirmErrorMessage() {
  return "No se pudo restablecer la contraseña.";
}

function getDefaultValidateSuccessMessage() {
  return "El token de recuperación es válido.";
}

function getDefaultValidateErrorMessage() {
  return "El token de recuperación no es válido.";
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

function getConfiguredRequestEndpoint() {
  return firstEndpoint(
    [
      isFunction(getRequestPasswordResetEndpointFromConstants)
        ? getRequestPasswordResetEndpointFromConstants()
        : "",
      AUTH_ENDPOINTS?.requestPasswordReset,
      AUTH_ENDPOINTS?.resetPasswordRequest,
      AUTH_ENDPOINTS?.forgotPassword,
      AUTH_ENDPOINTS?.recoverPassword,
      AUTH_ENDPOINTS?.recover,
      AUTH_ENDPOINTS?.forgot,
      AUTH_ENDPOINTS?.passwordResetRequest,
      DEFAULT_REQUEST_ENDPOINT,
    ],
    DEFAULT_REQUEST_ENDPOINT
  );
}

function getConfiguredConfirmEndpoint() {
  return firstEndpoint(
    [
      isFunction(getConfirmPasswordResetEndpointFromConstants)
        ? getConfirmPasswordResetEndpointFromConstants()
        : "",
      AUTH_ENDPOINTS?.confirmResetPassword,
      AUTH_ENDPOINTS?.confirmPasswordReset,
      AUTH_ENDPOINTS?.resetPasswordConfirm,
      AUTH_ENDPOINTS?.passwordResetConfirm,
      AUTH_ENDPOINTS?.resetPasswordUpdate,
      AUTH_ENDPOINTS?.resetPasswordFinalize,
      AUTH_ENDPOINTS?.changeForgottenPassword,
      DEFAULT_CONFIRM_ENDPOINT,
    ],
    DEFAULT_CONFIRM_ENDPOINT
  );
}

function getConfiguredValidateEndpoint() {
  return firstEndpoint(
    [
      isFunction(getValidateResetTokenEndpointFromConstants)
        ? getValidateResetTokenEndpointFromConstants()
        : "",
      AUTH_ENDPOINTS?.validateResetToken,
      AUTH_ENDPOINTS?.resetPasswordValidate,
      AUTH_ENDPOINTS?.validatePasswordReset,
      AUTH_ENDPOINTS?.passwordResetValidate,
      DEFAULT_VALIDATE_ENDPOINT,
    ],
    DEFAULT_VALIDATE_ENDPOINT
  );
}

export function getRequestPasswordResetEndpoint() {
  return getConfiguredRequestEndpoint();
}

export function getResetPasswordRequestEndpoint() {
  return getConfiguredRequestEndpoint();
}

export function getConfirmResetPasswordEndpoint() {
  return getConfiguredConfirmEndpoint();
}

export function getConfirmPasswordResetEndpoint() {
  return getConfiguredConfirmEndpoint();
}

export function getValidateResetPasswordTokenEndpoint() {
  return getConfiguredValidateEndpoint();
}

export function getValidateResetTokenEndpoint() {
  return getConfiguredValidateEndpoint();
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

function getCurrentPath() {
  if (!isBrowser()) {
    return "";
  }

  try {
    return `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
  } catch {
    return "";
  }
}

function getTokenParamNames(type = "reset") {
  const names =
    AUTH_TOKEN_PARAM_NAMES?.[type];

  if (Array.isArray(names)) {
    return names;
  }

  return [
    "token",
    "resetToken",
    "passwordResetToken",
    "code",
    "t",
  ];
}

function extractTokenFromSearch(search = "", names = getTokenParamNames("reset")) {
  try {
    const params =
      new URLSearchParams(search || "");

    for (const name of names) {
      const token =
        normalizeTokenValue(
          params.get(name),
          getResetTokenMaxLength()
        );

      if (token) {
        return token;
      }
    }
  } catch {}

  return "";
}

function extractTokenFromPath(path = "") {
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

    const pathname =
      parsed.pathname || "";

    const marker =
      "/reset-password/confirm/";

    if (pathname.startsWith(marker)) {
      const token =
        pathname
          .slice(marker.length)
          .split("/")[0];

      try {
        return normalizeTokenValue(
          decodeURIComponent(token || ""),
          getResetTokenMaxLength()
        ) || "";
      } catch {
        return normalizeTokenValue(
          token,
          getResetTokenMaxLength()
        ) || "";
      }
    }
  } catch {}

  return "";
}

function extractResetTokenFromUrl(pathOrUrl = getCurrentPath()) {
  const raw =
    safeText(pathOrUrl, "");

  if (!raw) {
    return "";
  }

  const pathToken =
    extractTokenFromPath(raw);

  if (pathToken) {
    return pathToken;
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    const fromSearch =
      extractTokenFromSearch(
        parsed.search,
        getTokenParamNames("reset")
      );

    if (fromSearch) {
      return fromSearch;
    }

    if (
      parsed.hash &&
      parsed.hash.includes("?")
    ) {
      const query =
        parsed.hash
          .split("?")
          .slice(1)
          .join("?");

      return extractTokenFromSearch(
        query ? `?${query}` : "",
        getTokenParamNames("reset")
      );
    }
  } catch {}

  return "";
}

/* =========================================================
   IDENTIFIER / TOKEN / PASSWORD
========================================================= */

function looksLikeEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    safeText(value)
  );
}

function looksLikePhone(value = "") {
  const clean =
    safeText(value)
      .replace(/[^\d+]/g, "");

  return /^\+?\d{6,20}$/.test(clean);
}

function normalizeEmail(value = "") {
  return safeText(value)
    .toLowerCase()
    .slice(0, 254);
}

function normalizePhone(value = "") {
  return safeText(value)
    .replace(/[^\d+]/g, "")
    .slice(0, 32);
}

function normalizeUsername(value = "") {
  return safeText(value)
    .normalize("NFKC")
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .toLowerCase()
    .slice(0, 80);
}

function normalizeIdentifier(value = "") {
  const raw =
    safeText(value)
      .normalize("NFKC")
      .replace(/\s+/g, " ");

  if (isCorruptedTextValue(raw)) {
    return "";
  }

  /*
    No truncamos silenciosamente. Conservamos max+1 para que
    validateRequestPayload pueda detectar exceso.
  */
  return raw.slice(
    0,
    getResetIdentifierMaxLength() + 1
  );
}

function normalizeResetToken(value = "") {
  const token =
    normalizeTokenValue(
      value,
      getResetTokenMaxLength()
    );

  return token || "";
}

function normalizePasswordValue(value = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  /*
    No trim y no truncate:
    una contraseña demasiado larga debe fallar validación,
    no mutarse silenciosamente antes de enviarla.
  */
  return String(value);
}

export function resolveResetPasswordIdentifier(payload = {}) {
  return safeText(
    payload?.identifier ??
      payload?.login ??
      payload?.email ??
      payload?.username ??
      payload?.user ??
      payload?.phone ??
      payload?.telefono ??
      payload?.mobile ??
      ""
  );
}

export function resolveResetPasswordToken(payload = {}) {
  return normalizeResetToken(
    payload?.token ??
      payload?.code ??
      payload?.resetToken ??
      payload?.reset_token ??
      payload?.reset_code ??
      payload?.passwordResetToken ??
      payload?.password_reset_token ??
      payload?.t ??
      extractResetTokenFromUrl()
  );
}

export function normalizeResetPasswordPayload(payload = {}) {
  const identifier =
    normalizeIdentifier(
      resolveResetPasswordIdentifier(payload)
    );

  const email =
    looksLikeEmail(identifier)
      ? normalizeEmail(identifier)
      : "";

  const phone =
    !email && looksLikePhone(identifier)
      ? normalizePhone(identifier)
      : "";

  const username =
    !email && !phone
      ? normalizeUsername(identifier)
      : "";

  const redirect =
    sanitizeRedirect(
      payload?.redirect ??
        payload?.redirectTo ??
        payload?.returnTo ??
        "",
      ""
    );

  const lang =
    safeText(
      payload?.lang ??
        payload?.language ??
        AppCore?.state?.lang ??
        AppCore?.config?.defaultLang ??
        "es",
      "es"
    ).slice(0, 8);

  return {
    identifier,
    email,
    phone,
    username,
    redirect,
    lang,
  };
}

export function normalizeConfirmResetPasswordPayload(payload = {}) {
  const token =
    resolveResetPasswordToken(payload);

  const password =
    normalizePasswordValue(
      payload?.password ??
        payload?.newPassword ??
        payload?.new_password ??
        ""
    );

  const confirmPassword =
    normalizePasswordValue(
      payload?.confirmPassword ??
        payload?.passwordConfirmation ??
        payload?.password_confirmation ??
        payload?.repeatPassword ??
        payload?.repeat_password ??
        ""
    );

  const redirect =
    sanitizeRedirect(
      payload?.redirect ??
        payload?.redirectTo ??
        payload?.returnTo ??
        DEFAULT_LOGIN_REDIRECT,
      DEFAULT_LOGIN_REDIRECT
    );

  return {
    token,
    password,
    confirmPassword,
    redirect,
  };
}

export function normalizeValidateResetTokenPayload(payload = {}) {
  const token =
    resolveResetPasswordToken(payload);

  return {
    token,
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

export function buildResetPasswordRequestBody(payload = {}) {
  const normalized =
    normalizeResetPasswordPayload(payload);

  return stripEmptyValues({
    identifier:
      normalized.identifier,

    email:
      normalized.email,

    username:
      normalized.username,

    user:
      normalized.username,

    login:
      normalized.identifier,

    phone:
      normalized.phone,

    telefono:
      normalized.phone,

    redirect:
      normalized.redirect,

    redirectTo:
      normalized.redirect,

    returnTo:
      normalized.redirect,

    lang:
      normalized.lang,

    language:
      normalized.lang,
  });
}

export function buildConfirmResetPasswordBody(payload = {}) {
  const normalized =
    normalizeConfirmResetPasswordPayload(payload);

  return stripEmptyValues({
    token:
      normalized.token,

    code:
      normalized.token,

    t:
      normalized.token,

    resetToken:
      normalized.token,

    reset_token:
      normalized.token,

    reset_code:
      normalized.token,

    passwordResetToken:
      normalized.token,

    password_reset_token:
      normalized.token,

    password:
      normalized.password,

    newPassword:
      normalized.password,

    new_password:
      normalized.password,

    confirmPassword:
      normalized.confirmPassword,

    passwordConfirmation:
      normalized.confirmPassword,

    password_confirmation:
      normalized.confirmPassword,

    repeatPassword:
      normalized.confirmPassword,

    repeat_password:
      normalized.confirmPassword,

    redirect:
      normalized.redirect,

    redirectTo:
      normalized.redirect,

    returnTo:
      normalized.redirect,
  });
}

export function buildValidateResetTokenBody(payload = {}) {
  const normalized =
    normalizeValidateResetTokenPayload(payload);

  return stripEmptyValues({
    token:
      normalized.token,

    code:
      normalized.token,

    t:
      normalized.token,

    resetToken:
      normalized.token,

    reset_token:
      normalized.token,

    passwordResetToken:
      normalized.token,

    password_reset_token:
      normalized.token,
  });
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
    meta,
  };
}

/* =========================================================
   RESPONSE RESOLUTION
========================================================= */

function resolveExplicitOk(input = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseNode,
    responseData,
    meta,
  } = getNode(input);

  const values = [
    root.ok,
    root.success,
    root.valid,
    root.accepted,
    root.completed,

    data.ok,
    data.success,
    data.valid,
    data.accepted,
    data.completed,

    payload.ok,
    payload.success,
    payload.valid,
    payload.accepted,
    payload.completed,

    result.ok,
    result.success,
    result.valid,
    result.accepted,
    result.completed,

    body.ok,
    body.success,
    body.valid,
    body.accepted,
    body.completed,

    responseNode.ok,
    responseNode.success,
    responseNode.valid,
    responseNode.accepted,
    responseNode.completed,

    responseData.ok,
    responseData.success,
    responseData.valid,
    responseData.accepted,
    responseData.completed,

    meta.ok,
    meta.success,
    meta.valid,
    meta.accepted,
    meta.completed,
  ];

  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function resolveStatus(input = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseNode,
    responseData,
    meta,
  } = getNode(input);

  return safeNumber(
    pickFirst(
      root.status,
      root.statusCode,
      root.status_code,

      data.status,
      data.statusCode,
      data.status_code,

      payload.status,
      payload.statusCode,
      payload.status_code,

      result.status,
      result.statusCode,
      result.status_code,

      body.status,
      body.statusCode,
      body.status_code,

      responseNode.status,
      responseNode.statusCode,
      responseNode.status_code,

      responseData.status,
      responseData.statusCode,
      responseData.status_code,

      meta.status,
      meta.statusCode,
      meta.status_code
    ),
    0
  );
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
  const {
    root,
    data,
    payload,
    result,
    body,
    responseNode,
    responseData,
    meta,
  } = getNode(input);

  const candidates = [
    root.statusText,
    root.status_text,
    root.state,
    root.status,

    data.statusText,
    data.status_text,
    data.state,
    data.status,

    payload.statusText,
    payload.status_text,
    payload.state,
    payload.status,

    result.statusText,
    result.status_text,
    result.state,
    result.status,

    body.statusText,
    body.status_text,
    body.state,
    body.status,

    responseNode.statusText,
    responseNode.status_text,
    responseNode.state,
    responseNode.status,

    responseData.statusText,
    responseData.status_text,
    responseData.state,
    responseData.status,

    meta.statusText,
    meta.status_text,
    meta.state,
    meta.status,
  ];

  for (const candidate of candidates) {
    const text =
      normalizeStatusText(candidate);

    if (text) {
      return text;
    }
  }

  return "";
}

function resolveCode(input = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseNode,
    responseData,
    meta,
  } = getNode(input);

  return safeText(
    pickFirst(
      root.code,
      root.errorCode,
      root.error_code,
      root.error,

      data.code,
      data.errorCode,
      data.error_code,
      data.error,

      payload.code,
      payload.errorCode,
      payload.error_code,
      payload.error,

      result.code,
      result.errorCode,
      result.error_code,
      result.error,

      body.code,
      body.errorCode,
      body.error_code,
      body.error,

      responseNode.code,
      responseNode.errorCode,
      responseNode.error_code,
      responseNode.error,

      responseData.code,
      responseData.errorCode,
      responseData.error_code,
      responseData.error,

      meta.code,
      meta.errorCode,
      meta.error_code,
      meta.error
    ),
    ""
  );
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
  const {
    root,
    data,
    payload,
    result,
    body,
    responseNode,
    responseData,
    meta,
  } = getNode(input);

  return Math.max(
    0,
    safeNumber(
      pickFirst(
        root.retryAfter,
        root.retry_after,
        root.cooldownSeconds,
        root.cooldown_seconds,
        root.rateLimitSeconds,
        root.rate_limit_seconds,

        data.retryAfter,
        data.retry_after,
        data.cooldownSeconds,
        data.cooldown_seconds,
        data.rateLimitSeconds,
        data.rate_limit_seconds,

        payload.retryAfter,
        payload.retry_after,
        payload.cooldownSeconds,
        payload.cooldown_seconds,

        result.retryAfter,
        result.retry_after,
        result.cooldownSeconds,
        result.cooldown_seconds,

        body.retryAfter,
        body.retry_after,
        body.cooldownSeconds,
        body.cooldown_seconds,

        responseNode.retryAfter,
        responseNode.retry_after,
        responseNode.cooldownSeconds,
        responseNode.cooldown_seconds,

        responseData.retryAfter,
        responseData.retry_after,
        responseData.cooldownSeconds,
        responseData.cooldown_seconds,

        meta.retryAfter,
        meta.retry_after,
        meta.cooldownSeconds,
        meta.cooldown_seconds
      ),
      0
    )
  );
}

function resolveMessage(input = {}, fallback = "") {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseNode,
    responseData,
    meta,
  } = getNode(input);

  return pickFirstText(
    root.message,
    root.mensaje,
    root.detail,
    root.description,
    root.error,

    data.message,
    data.mensaje,
    data.detail,
    data.description,
    data.error,

    payload.message,
    payload.mensaje,
    payload.detail,
    payload.description,
    payload.error,

    result.message,
    result.mensaje,
    result.detail,
    result.description,
    result.error,

    body.message,
    body.mensaje,
    body.detail,
    body.description,
    body.error,

    responseNode.message,
    responseNode.mensaje,
    responseNode.detail,
    responseNode.description,
    responseNode.error,

    responseData.message,
    responseData.mensaje,
    responseData.detail,
    responseData.description,
    responseData.error,

    meta.message,
    meta.mensaje,
    meta.detail,
    meta.description,
    meta.error,

    fallback
  );
}

function resolveRedirectTo(input = {}, fallback = "") {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseNode,
    responseData,
    meta,
  } = getNode(input);

  return sanitizeRedirect(
    pickFirstText(
      root.redirectTo,
      root.redirect_to,
      root.redirect,
      root.next,
      root.nextPath,
      root.next_path,

      data.redirectTo,
      data.redirect_to,
      data.redirect,
      data.next,
      data.nextPath,
      data.next_path,

      payload.redirectTo,
      payload.redirect_to,
      payload.redirect,
      payload.next,
      payload.nextPath,
      payload.next_path,

      result.redirectTo,
      result.redirect_to,
      result.redirect,
      result.next,
      result.nextPath,
      result.next_path,

      body.redirectTo,
      body.redirect_to,
      body.redirect,
      body.next,
      body.nextPath,
      body.next_path,

      responseNode.redirectTo,
      responseNode.redirect_to,
      responseNode.redirect,
      responseNode.next,
      responseNode.nextPath,
      responseNode.next_path,

      responseData.redirectTo,
      responseData.redirect_to,
      responseData.redirect,
      responseData.next,
      responseData.nextPath,
      responseData.next_path,

      meta.redirectTo,
      meta.redirect_to,
      meta.redirect,
      meta.next,

      fallback
    ),
    fallback
  );
}

function resolveEmailMasked(input = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseNode,
    responseData,
    meta,
  } = getNode(input);

  return pickFirstText(
    root.emailMasked,
    root.maskedEmail,
    root.masked_email,

    data.emailMasked,
    data.maskedEmail,
    data.masked_email,

    payload.emailMasked,
    payload.maskedEmail,
    payload.masked_email,

    result.emailMasked,
    result.maskedEmail,
    result.masked_email,

    body.emailMasked,
    body.maskedEmail,
    body.masked_email,

    responseNode.emailMasked,
    responseNode.maskedEmail,
    responseNode.masked_email,

    responseData.emailMasked,
    responseData.maskedEmail,
    responseData.masked_email,

    meta.emailMasked,
    meta.maskedEmail,
    meta.masked_email
  );
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

  const statusText =
    resolveStatusText(input);

  return Boolean(
    statusText &&
      SUCCESS_STATUS_TEXTS.includes(statusText)
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

  const {
    root,
    data,
    payload,
    result,
    body,
    responseNode,
    responseData,
    meta,
  } = getNode(input);

  return Boolean(
    status === 429 ||
      retryAfter > 0 ||
      code === "RATE_LIMITED" ||
      code === "TOO_MANY_REQUESTS" ||
      statusText === "rate_limited" ||
      statusText === "too_many_requests" ||
      root.cooldown === true ||
      data.cooldown === true ||
      payload.cooldown === true ||
      result.cooldown === true ||
      body.cooldown === true ||
      responseNode.cooldown === true ||
      responseData.cooldown === true ||
      meta.cooldown === true
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

  /*
    Regla estricta:
    - HTTP 200/202/204 sin ok/success/valid/accepted/completed NO es éxito.
    - status/statusText/state declarativo tipo "success" sí cuenta como éxito.
  */
  const ok =
    explicitFailure
      ? false
      : isDeclaredSuccess(input);

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

    emailMasked:
      resolveEmailMasked(input),

    at:
      isoNow(),
  };
}

export function normalizeResetPasswordResponse(input = {}) {
  return buildBaseNormalizedResponse({
    input,
    successMessage:
      getDefaultSuccessMessage(),
    errorMessage:
      getDefaultErrorMessage(),
    redirectFallback:
      "",
  });
}

export function normalizeConfirmResetPasswordResponse(input = {}) {
  const normalized =
    buildBaseNormalizedResponse({
      input,
      successMessage:
        getDefaultConfirmSuccessMessage(),
      errorMessage:
        getDefaultConfirmErrorMessage(),
      redirectFallback:
        DEFAULT_LOGIN_REDIRECT,
    });

  return {
    ...normalized,

    redirectTo:
      normalized.redirectTo ||
      DEFAULT_LOGIN_REDIRECT,
  };
}

export function normalizeValidateResetTokenResponse(input = {}) {
  return buildBaseNormalizedResponse({
    input,
    successMessage:
      getDefaultValidateSuccessMessage(),
    errorMessage:
      getDefaultValidateErrorMessage(),
    redirectFallback:
      "",
  });
}

export const normalizeValidateResetPasswordTokenResponse =
  normalizeValidateResetTokenResponse;

/* =========================================================
   URL RESOLUTION
========================================================= */

function buildFinalUrl(endpoint = "") {
  const clean =
    safeText(endpoint, "");

  if (!clean) {
    return DEFAULT_REQUEST_ENDPOINT;
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
  fallbackMessage = getDefaultErrorMessage()
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

/* =========================================================
   FETCH WITH TIMEOUT
========================================================= */

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
  timeoutMs = getRequestTimeout()
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

  const controller =
    typeof AbortController !== "undefined"
      ? new AbortController()
      : null;

  const timer =
    controller
      ? setTimeout(() => {
          try {
            controller.abort("password-reset-timeout");
          } catch {
            try {
              controller.abort();
            } catch {}
          }
        }, timeoutMs)
      : null;

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
          controller?.signal,
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
            httpResponse.statusText || getDefaultErrorMessage()
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
      /*
        Compat legacy controlada:
        sólo reintenta firma method/path si el primer intento parece
        un error de firma, no un error HTTP normal.
      */
      if (
        error?.status ||
        error?.response?.status ||
        error?.data?.status
      ) {
        throw error;
      }

      return apiClient.request(
        "POST",
        endpoint,
        {
          ...requestOptions,
          body,
        }
      );
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
    if (
      error?.status ||
      error?.response?.status ||
      error?.data?.status
    ) {
      throw error;
    }

    return AppCore.request(
      "POST",
      endpoint,
      {
        ...requestOptions,
        body,
      }
    );
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
      if (
        error?.status ||
        error?.response?.status ||
        error?.data?.status
      ) {
        throw error;
      }

      return http.request(
        endpoint,
        {
          ...requestOptions,
          method:
            "POST",
          body,
        }
      );
    }
  }

  return null;
}

async function requestWithFetch(endpoint, body) {
  const url =
    buildFinalUrl(endpoint);

  return fetchJsonWithTimeout(
    url,
    body,
    getRequestTimeout()
  );
}

async function executePasswordResetRequest(endpoint, body, options = {}) {
  const transports = [
    requestWithApiClient,
    requestWithAppCoreRequest,
    requestWithHttpService,
  ];

  for (const transport of transports) {
    try {
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
    } catch (error) {
      throw error;
    }
  }

  return requestWithFetch(
    endpoint,
    body
  );
}

/* =========================================================
   COOLDOWN
========================================================= */

function getCooldownStorageKey() {
  return safeText(
    AUTH_STORAGE_KEYS?.resetCooldownUntil,
    "reset_cooldown_until"
  );
}

function readCooldownFromStorage() {
  try {
    const key =
      getCooldownStorageKey();

    const value =
      AppCore?.storage?.getRaw?.(key) ??
      AppCore?.storage?.get?.(key) ??
      "";

    return safeNumber(value, 0);
  } catch {
    return 0;
  }
}

function writeCooldownToStorage(untilMs = 0) {
  try {
    const key =
      getCooldownStorageKey();

    if (untilMs > 0) {
      AppCore?.storage?.setRaw?.(
        key,
        String(untilMs)
      );

      AppCore?.storage?.set?.(
        key,
        String(untilMs)
      );
    } else {
      AppCore?.storage?.remove?.(key);
    }
  } catch {}
}

function getCooldownUntil() {
  return Math.max(
    safeNumber(runtime.cooldownUntil, 0),
    readCooldownFromStorage()
  );
}

function getRemainingCooldownSeconds() {
  const remainingMs =
    getCooldownUntil() - nowMs();

  return Math.max(
    0,
    Math.ceil(remainingMs / 1000)
  );
}

function setCooldown(seconds = 0) {
  const finalSeconds =
    clampNumber(
      seconds || getDefaultCooldownSeconds(),
      0,
      3600
    );

  if (finalSeconds <= 0) {
    runtime.cooldownUntil = 0;
    writeCooldownToStorage(0);
    return 0;
  }

  const until =
    nowMs() + finalSeconds * 1000;

  runtime.cooldownUntil =
    until;

  writeCooldownToStorage(until);

  return finalSeconds;
}

export function clearPasswordResetCooldown() {
  runtime.cooldownUntil =
    0;

  writeCooldownToStorage(0);

  return true;
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
   VALIDATION
========================================================= */

function validateRequestPayload(normalized = {}) {
  if (!normalized.identifier) {
    return "No se recibió identificador para recuperación de acceso.";
  }

  if (
    normalized.identifier.length >
    getResetIdentifierMaxLength()
  ) {
    return "El identificador es demasiado largo.";
  }

  return "";
}

function validateConfirmPayload(normalized = {}) {
  if (!normalized.token) {
    return "No se recibió token de recuperación.";
  }

  if (
    normalized.token.length <
    getResetTokenMinLength()
  ) {
    return "El token de recuperación no es válido.";
  }

  if (!normalized.password) {
    return "La nueva contraseña es obligatoria.";
  }

  if (
    normalized.password.length <
    getResetPasswordMinLength()
  ) {
    return `La contraseña debe tener al menos ${getResetPasswordMinLength()} caracteres.`;
  }

  if (
    normalized.password.length >
    getResetPasswordMaxLength()
  ) {
    return "La contraseña es demasiado larga.";
  }

  if (!normalized.confirmPassword) {
    return "La confirmación de contraseña es obligatoria.";
  }

  if (
    normalized.confirmPassword.length >
    getResetPasswordMaxLength()
  ) {
    return "La confirmación de contraseña es demasiado larga.";
  }

  if (
    normalized.password !==
    normalized.confirmPassword
  ) {
    return "Las contraseñas no coinciden.";
  }

  return "";
}

function validateTokenPayload(normalized = {}) {
  if (!normalized.token) {
    return "No se recibió token de recuperación.";
  }

  if (
    normalized.token.length <
    getResetTokenMinLength()
  ) {
    return "El token de recuperación no es válido.";
  }

  return "";
}

/* =========================================================
   RESULT BOOKKEEPING
========================================================= */

function rememberResult(type = "unknown", result = {}) {
  runtime.lastResult = {
    type,
    ok:
      Boolean(result?.ok),
    status:
      result?.status || 0,
    code:
      result?.code || null,
    cooldown:
      Boolean(result?.cooldown),
    retryAfter:
      result?.retryAfter || 0,
    at:
      isoNow(),
  };

  if (
    result?.cooldown &&
    result?.retryAfter
  ) {
    setCooldown(result.retryAfter);
  }

  if (result?.ok) {
    clearPasswordResetCooldown();
  }
}

/* =========================================================
   ACTIONS
========================================================= */

export async function requestPasswordReset(payload = {}, options = {}) {
  if (runtime.requestInFlight) {
    return runtime.requestInFlight;
  }

  const activeCooldown =
    getRemainingCooldownSeconds();

  if (activeCooldown > 0) {
    return normalizeResetPasswordResponse(
      buildCooldownResponse()
    );
  }

  const normalized =
    normalizeResetPasswordPayload(payload);

  const validationError =
    validateRequestPayload(normalized);

  if (validationError) {
    return normalizeResetPasswordResponse({
      ok:
        false,
      status:
        400,
      message:
        validationError,
    });
  }

  const endpoint =
    getRequestPasswordResetEndpoint();

  const body =
    buildResetPasswordRequestBody(normalized);

  runtime.requestCount += 1;
  runtime.lastRequestAt =
    nowMs();

  safeEmit(
    "auth:password-reset:request:start",
    {
      endpoint,
      identifierType:
        normalized.email
          ? "email"
          : normalized.phone
            ? "phone"
            : normalized.username
              ? "username"
              : "identifier",
    }
  );

  runtime.requestInFlight =
    (async () => {
      try {
        const raw =
          await executePasswordResetRequest(
            endpoint,
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
          normalizeResetPasswordResponse(raw);

        rememberResult(
          "request",
          normalizedResponse
        );

        safeEmit(
          "auth:password-reset:request:complete",
          {
            ok:
              normalizedResponse.ok,
            status:
              normalizedResponse.status,
            cooldown:
              normalizedResponse.cooldown,
            retryAfter:
              normalizedResponse.retryAfter,
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
            getDefaultErrorMessage()
          );

        const normalizedResponse =
          normalizeResetPasswordResponse(
            normalizedError
          );

        rememberResult(
          "request:error",
          normalizedResponse
        );

        safeEmit(
          "auth:password-reset:request:error",
          {
            status:
              normalizedResponse.status,
            cooldown:
              normalizedResponse.cooldown,
            retryAfter:
              normalizedResponse.retryAfter,
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

export async function confirmResetPassword(payload = {}, options = {}) {
  if (runtime.confirmInFlight) {
    return runtime.confirmInFlight;
  }

  const normalized =
    normalizeConfirmResetPasswordPayload(payload);

  const validationError =
    validateConfirmPayload(normalized);

  if (validationError) {
    return normalizeConfirmResetPasswordResponse({
      ok:
        false,
      status:
        400,
      message:
        validationError,
    });
  }

  const endpoint =
    getConfirmResetPasswordEndpoint();

  const body =
    buildConfirmResetPasswordBody(normalized);

  runtime.confirmCount += 1;
  runtime.lastConfirmAt =
    nowMs();

  safeEmit(
    "auth:password-reset:confirm:start",
    {
      endpoint,
    }
  );

  runtime.confirmInFlight =
    (async () => {
      try {
        const raw =
          await executePasswordResetRequest(
            endpoint,
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
          normalizeConfirmResetPasswordResponse(raw);

        rememberResult(
          "confirm",
          normalizedResponse
        );

        safeEmit(
          "auth:password-reset:confirm:complete",
          {
            ok:
              normalizedResponse.ok,
            status:
              normalizedResponse.status,
            cooldown:
              normalizedResponse.cooldown,
            retryAfter:
              normalizedResponse.retryAfter,
            redirectTo:
              normalizedResponse.redirectTo,
          }
        );

        return normalizedResponse;
      } catch (error) {
        rememberError(
          "confirm",
          error
        );

        const normalizedError =
          normalizeTransportError(
            error,
            getDefaultConfirmErrorMessage()
          );

        const normalizedResponse =
          normalizeConfirmResetPasswordResponse(
            normalizedError
          );

        rememberResult(
          "confirm:error",
          normalizedResponse
        );

        safeEmit(
          "auth:password-reset:confirm:error",
          {
            status:
              normalizedResponse.status,
            cooldown:
              normalizedResponse.cooldown,
            retryAfter:
              normalizedResponse.retryAfter,
            message:
              normalizedResponse.message,
          }
        );

        return normalizedResponse;
      } finally {
        runtime.confirmInFlight =
          null;
      }
    })();

  return runtime.confirmInFlight;
}

export async function validateResetPasswordToken(payload = {}, options = {}) {
  if (runtime.validateInFlight) {
    return runtime.validateInFlight;
  }

  const normalized =
    normalizeValidateResetTokenPayload(payload);

  const validationError =
    validateTokenPayload(normalized);

  if (validationError) {
    return normalizeValidateResetTokenResponse({
      ok:
        false,
      status:
        400,
      message:
        validationError,
    });
  }

  const endpoint =
    getValidateResetPasswordTokenEndpoint();

  const body =
    buildValidateResetTokenBody(normalized);

  runtime.validateCount += 1;
  runtime.lastValidateAt =
    nowMs();

  safeEmit(
    "auth:password-reset:validate:start",
    {
      endpoint,
    }
  );

  runtime.validateInFlight =
    (async () => {
      try {
        const raw =
          await executePasswordResetRequest(
            endpoint,
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
          normalizeValidateResetTokenResponse(raw);

        rememberResult(
          "validate",
          normalizedResponse
        );

        safeEmit(
          "auth:password-reset:validate:complete",
          {
            ok:
              normalizedResponse.ok,
            status:
              normalizedResponse.status,
          }
        );

        return normalizedResponse;
      } catch (error) {
        rememberError(
          "validate",
          error
        );

        const normalizedError =
          normalizeTransportError(
            error,
            getDefaultValidateErrorMessage()
          );

        const normalizedResponse =
          normalizeValidateResetTokenResponse(
            normalizedError
          );

        rememberResult(
          "validate:error",
          normalizedResponse
        );

        safeEmit(
          "auth:password-reset:validate:error",
          {
            status:
              normalizedResponse.status,
            message:
              normalizedResponse.message,
          }
        );

        return normalizedResponse;
      } finally {
        runtime.validateInFlight =
          null;
      }
    })();

  return runtime.validateInFlight;
}

/* =========================================================
   ALIASES
========================================================= */

export async function resetPasswordRequest(payload = {}, options = {}) {
  return requestPasswordReset(
    payload,
    options
  );
}

export async function requestResetPassword(payload = {}, options = {}) {
  return requestPasswordReset(
    payload,
    options
  );
}

export async function passwordResetRequest(payload = {}, options = {}) {
  return requestPasswordReset(
    payload,
    options
  );
}

export async function forgotPassword(payload = {}, options = {}) {
  return requestPasswordReset(
    payload,
    options
  );
}

export async function recoverPassword(payload = {}, options = {}) {
  return requestPasswordReset(
    payload,
    options
  );
}

export async function resetPasswordConfirm(payload = {}, options = {}) {
  return confirmResetPassword(
    payload,
    options
  );
}

export async function confirmPasswordReset(payload = {}, options = {}) {
  return confirmResetPassword(
    payload,
    options
  );
}

export async function passwordResetConfirm(payload = {}, options = {}) {
  return confirmResetPassword(
    payload,
    options
  );
}

export async function validateResetToken(payload = {}, options = {}) {
  return validateResetPasswordToken(
    payload,
    options
  );
}

export async function resetPasswordValidate(payload = {}, options = {}) {
  return validateResetPasswordToken(
    payload,
    options
  );
}

export async function validatePasswordReset(payload = {}, options = {}) {
  return validateResetPasswordToken(
    payload,
    options
  );
}

export async function passwordResetValidate(payload = {}, options = {}) {
  return validateResetPasswordToken(
    payload,
    options
  );
}

/* =========================================================
   DEBUG
========================================================= */

function sanitizeBodyForSnapshot(body = {}) {
  const output = {};

  for (const [key, value] of Object.entries(body || {})) {
    if (
      PASSWORD_FIELD_NAMES.includes(key) ||
      TOKEN_FIELD_NAMES.includes(key)
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

export function getPasswordResetSnapshot() {
  return {
    version:
      PASSWORD_RESET_MODULE_VERSION,

    requestEndpoint:
      getRequestPasswordResetEndpoint(),

    confirmEndpoint:
      getConfirmResetPasswordEndpoint(),

    validateEndpoint:
      getValidateResetPasswordTokenEndpoint(),

    limits: {
      identifierMaxLength:
        getResetIdentifierMaxLength(),

      tokenMinLength:
        getResetTokenMinLength(),

      tokenMaxLength:
        getResetTokenMaxLength(),

      passwordMinLength:
        getResetPasswordMinLength(),

      passwordMaxLength:
        getResetPasswordMaxLength(),

      timeout:
        getRequestTimeout(),

      defaultCooldownSeconds:
        getDefaultCooldownSeconds(),
    },

    runtime: {
      requestInFlight:
        Boolean(runtime.requestInFlight),

      confirmInFlight:
        Boolean(runtime.confirmInFlight),

      validateInFlight:
        Boolean(runtime.validateInFlight),

      lastRequestAt:
        runtime.lastRequestAt,

      lastConfirmAt:
        runtime.lastConfirmAt,

      lastValidateAt:
        runtime.lastValidateAt,

      requestCount:
        runtime.requestCount,

      confirmCount:
        runtime.confirmCount,

      validateCount:
        runtime.validateCount,

      cooldownUntil:
        getCooldownUntil(),

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
  };
}

export function getPasswordResetDebugPayload(payload = {}) {
  return {
    request:
      sanitizeBodyForSnapshot(
        buildResetPasswordRequestBody(payload)
      ),

    confirm:
      sanitizeBodyForSnapshot(
        buildConfirmResetPasswordBody(payload)
      ),

    validate:
      sanitizeBodyForSnapshot(
        buildValidateResetTokenBody(payload)
      ),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

const PasswordReset =
  Object.assign(
    requestPasswordReset,
    {
      version:
        PASSWORD_RESET_MODULE_VERSION,

      requestPasswordReset,
      resetPasswordRequest,
      requestResetPassword,
      passwordResetRequest,
      forgotPassword,
      recoverPassword,

      confirmResetPassword,
      resetPasswordConfirm,
      confirmPasswordReset,
      passwordResetConfirm,

      validateResetPasswordToken,
      validateResetToken,
      resetPasswordValidate,
      validatePasswordReset,
      passwordResetValidate,

      resolveResetPasswordIdentifier,
      resolveResetPasswordToken,

      normalizeResetPasswordPayload,
      normalizeConfirmResetPasswordPayload,
      normalizeValidateResetTokenPayload,

      buildResetPasswordRequestBody,
      buildConfirmResetPasswordBody,
      buildValidateResetTokenBody,

      normalizeResetPasswordResponse,
      normalizeConfirmResetPasswordResponse,
      normalizeValidateResetTokenResponse,
      normalizeValidateResetPasswordTokenResponse,

      getRequestPasswordResetEndpoint,
      getResetPasswordRequestEndpoint,
      getConfirmResetPasswordEndpoint,
      getConfirmPasswordResetEndpoint,
      getValidateResetPasswordTokenEndpoint,
      getValidateResetTokenEndpoint,

      clearPasswordResetCooldown,

      getPasswordResetSnapshot,
      getPasswordResetDebugPayload,
    }
  );

export default PasswordReset;
