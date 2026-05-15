/* =========================================================
   Onion SPA - Login Helpers
   Archivo: src/views/login/login.helpers.js

   LOGIN HELPERS · CORE/AUTH SAFE · NO GHOST AUTH · 16/10

   RESPONSABILIDADES:
   - Helpers puros del login.
   - Validación de credenciales.
   - Persistencia del identificador recordado.
   - Normalización estricta de respuesta auth.
   - Sincronización idempotente de sesión con AppCore real.
   - Resolución segura de redirect post-login.
   - Evitar redirect automático por rol hacia /usuarios.
   - Evitar redirect automático por slug hacia /@usuario.
   - Compatibilidad con login por usuario, email o teléfono.
   - Tolerancia controlada a 2FA/MFA.
   - Evitar doble emisión / doble sync innecesario.
   - Evitar sesión autenticada sin token usable + usuario usable.
   - No mezclar payload nuevo con AppCore.state.user antiguo salvo match verificable.

   HARDENING:
   - Detecta ok:false / success:false / status >= 400.
   - Soporta data / payload / result / body / response.data / auth / session.
   - Token no se trunca: si es corrupto se invalida.
   - Password no se trimea en payload final.
   - Redirects internos anti open-redirect.
   - /login, reset, activation y 2FA no son destinos post-login normales.
   - /usuarios, /clientes, /facturas, /incidencias, /servidor y /@slug
     no se usan como redirect por defecto.
   - Eventos/snapshots sin token real.
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

export const LOGIN_HELPERS_VERSION =
  "16.0.0-extreme-pro";

export const LOGIN_REMEMBER_KEY =
  "auth:last-identifier";

const DEFAULT_HOME_PATH =
  "/";

const DEFAULT_2FA_PATH =
  "/2fa";

const DEFAULT_IDENTIFIER_MAX_LENGTH =
  160;

const DEFAULT_PASSWORD_MIN_LENGTH =
  6;

const DEFAULT_PASSWORD_MAX_LENGTH =
  1024;

const DEFAULT_TOKEN_MAX_LENGTH =
  8192;

const SAFE_REDIRECT_MAX_LENGTH =
  2048;

const AUTH_BLOCKED_REDIRECTS =
  Object.freeze([
    "/login",
    "/logout",

    "/reset-password",
    "/reset-password/confirm",
    "/reset-password-confirm",
    "/forgot-password",
    "/recover-password",
    "/password-reset",
    "/password-reset/request",
    "/password-reset/confirm",
    "/password-reset-confirm",
    "/confirm-reset-password",

    "/activate-account",
    "/activate",
    "/activation",
    "/account/activate",
    "/activate/first-user",

    "/2fa",
    "/otp",
    "/mfa",

    "/403",
    "/404",
  ]);

const ROLE_DEFAULT_REDIRECTS =
  Object.freeze([
    "/usuarios",
    "/users",
    "/clientes",
    "/clients",
    "/facturas",
    "/invoices",
    "/incidencias",
    "/tickets",
    "/servidor",
    "/server",
    "/hardware",
  ]);

const REMEMBER_IDENTIFIER_KEYS =
  Object.freeze([
    LOGIN_REMEMBER_KEY,
    "auth:last-email",
    "auth:lastEmail",
    "login:last-identifier",
    "login:lastIdentifier",
    "login:last-email",
    "login:lastEmail",
    "last_login_identifier",
    "lastLoginIdentifier",
    "last_username",
    "lastUsername",
  ]);

const BAD_TOKEN_VALUES =
  Object.freeze([
    "",
    "null",
    "undefined",
    "false",
    "true",
    "none",
    "nan",
    "empty",
    "[object object]",
    "{}",
    "[]",
    "\"\"",
    "''",
    "\"null\"",
    "\"undefined\"",
    "\"false\"",
  ]);

const TOKEN_KEYS =
  Object.freeze([
    "token",
    "accessToken",
    "access_token",
    "authToken",
    "auth_token",
    "jwt",
    "idToken",
    "id_token",
    "bearer",
  ]);

const REFRESH_TOKEN_KEYS =
  Object.freeze([
    "refreshToken",
    "refresh_token",
  ]);

const TEMP_TOKEN_KEYS =
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
  ]);

const USER_KEYS =
  Object.freeze([
    "user",
    "usuario",
    "me",
    "account",
    "profile",
    "currentUser",
    "current_user",
    "authUser",
    "auth_user",
    "sessionUser",
    "session_user",
  ]);

const SESSION_KEYS =
  Object.freeze([
    "session",
    "sessionData",
    "session_data",
    "authSession",
    "auth_session",
  ]);

const AUTH_OBJECT_KEYS =
  Object.freeze([
    "data",
    "payload",
    "result",
    "body",
    "response",
    "auth",
    "authData",
    "auth_data",
    "session",
    "sessionData",
    "session_data",
    "meta",
  ]);

const USER_IDENTITY_KEYS =
  Object.freeze([
    "id",
    "userId",
    "user_id",
    "_id",
    "uuid",
    "uid",
    "sub",
    "username",
    "userName",
    "user_name",
    "email",
    "mail",
    "phone",
    "telefono",
    "mobile",
    "cellphone",
  ]);

const AUTH_ENVELOPE_KEYS =
  Object.freeze([
    "ok",
    "success",
    "authenticated",
    "status",
    "statusCode",
    "status_code",
    "error",
    "errorCode",
    "error_code",
    "token",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "tempToken",
    "temp_token",
    "data",
    "payload",
    "result",
    "body",
    "response",
    "auth",
    "session",
    "sessionData",
  ]);

const AUTH_FAILURE_CODES =
  new Set([
    "INVALID_CREDENTIALS",
    "MISSING_CREDENTIALS",
    "ACCOUNT_TEMPORARILY_LOCKED",
    "ACCOUNT_DISABLED",
    "USER_DISABLED",
    "USER_NOT_AVAILABLE",
    "USER_NOT_FOUND",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "TOKEN_INVALID",
    "INVALID_TOKEN",
    "TOKEN_EXPIRED",
    "SESSION_EXPIRED",
    "SESSION_REVOKED",
    "SESSION_NOT_FOUND",
    "INVALID_LOGIN_SESSION",
    "LOGIN_FAILED",
    "AUTH_FAILED",
    "AUTH_RESTORE_FAILED",
    "BAD_CREDENTIALS",
    "CREDENTIALS_INVALID",
    "TOKEN_VERSION_MISMATCH",
  ]);

const AUTH_FAILURE_STATUSES =
  new Set([
    "error",
    "failed",
    "failure",
    "invalid",
    "unauthorized",
    "forbidden",
    "expired",
    "auth_error",
    "auth_failed",
    "login_failed",
    "not_authenticated",
    "session_expired",
    "token_expired",
    "invalid_token",
    "disabled",
    "blocked",
    "locked",
    "revoked",
  ]);

const AUTH_SUCCESS_STATUSES =
  new Set([
    "ok",
    "success",
    "successful",
    "authenticated",
    "active",
    "valid",
    "completed",
    "done",
  ]);

const TWO_FACTOR_STATUSES =
  new Set([
    "2fa_required",
    "mfa_required",
    "totp_required",
    "two_factor_required",
    "verification_required",
    "challenge_required",
    "otp_required",
  ]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return typeof value === "function";
}

export function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

export function safeObject(value, fallback = {}) {
  return isPlainObject(value)
    ? value
    : fallback;
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

  return text || fallback;
}

function safeRawText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  return String(value);
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

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function unique(values = []) {
  const input =
    Array.isArray(values)
      ? values
      : [values];

  const output =
    [];

  const seen =
    new Set();

  for (const value of input.flat(Infinity)) {
    const clean =
      safeText(value, "");

    if (
      clean &&
      !seen.has(clean)
    ) {
      seen.add(clean);
      output.push(clean);
    }
  }

  return output;
}

function pickFirstValue(...values) {
  for (const value of values) {
    if (
      value !== null &&
      value !== undefined &&
      !(
        typeof value === "string" &&
        value.trim() === ""
      )
    ) {
      return value;
    }
  }

  return "";
}

function pickFirstText(...values) {
  for (const value of values) {
    const text =
      safeText(value, "");

    if (text) {
      return text;
    }
  }

  return "";
}

function hasOwn(obj, key) {
  try {
    return Object.prototype.hasOwnProperty.call(
      obj,
      key
    );
  } catch {
    return false;
  }
}

function safeIsoNow() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function redactText(value = "") {
  try {
    if (isFunction(AppCore?.utils?.redactTokenInText)) {
      return AppCore.utils.redactTokenInText(value);
    }
  } catch {}

  return safeText(value, "")
    .replace(
      /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|otp|totp|t|access_token|refresh_token|id_token|tempToken|temp_token|mfaToken|mfa_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    )
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    )
    .replace(
      /(\/activate-account\/)([^/?#\s]+)/gi,
      "$1***"
    )
    .replace(
      /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
      "$1***"
    );
}

export function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/* =========================================================
   CONFIG LIMITS
========================================================= */

function getConfigNumber(paths = [], fallback = 0) {
  for (const path of safeArray(paths)) {
    const parts =
      safeText(path, "")
        .split(".")
        .filter(Boolean);

    let current =
      AppCore?.config || {};

    for (const part of parts) {
      current =
        current?.[part];
    }

    if (
      current !== undefined &&
      current !== null &&
      current !== ""
    ) {
      return safeNumber(
        current,
        fallback
      );
    }
  }

  return fallback;
}

function getIdentifierMaxLength() {
  return Math.max(
    1,
    getConfigNumber(
      [
        "auth.identifierMaxLength",
        "auth.loginIdentifierMaxLength",
        "identifierMaxLength",
      ],
      DEFAULT_IDENTIFIER_MAX_LENGTH
    )
  );
}

function getLoginPasswordMinLength() {
  return Math.max(
    1,
    getConfigNumber(
      [
        "auth.loginPasswordMinLength",
        "auth.passwordMinLength",
        "passwordMinLength",
      ],
      DEFAULT_PASSWORD_MIN_LENGTH
    )
  );
}

function getLoginPasswordMaxLength() {
  return Math.max(
    getLoginPasswordMinLength(),
    getConfigNumber(
      [
        "auth.loginPasswordMaxLength",
        "auth.passwordMaxLength",
        "passwordMaxLength",
      ],
      DEFAULT_PASSWORD_MAX_LENGTH
    )
  );
}

function getTokenMaxLength() {
  return Math.max(
    1,
    getConfigNumber(
      [
        "auth.tokenMaxLength",
        "tokenMaxLength",
      ],
      DEFAULT_TOKEN_MAX_LENGTH
    )
  );
}

/* =========================================================
   IDENTIFIER
========================================================= */

export function normalizeIdentifier(value = "") {
  return safeText(value, "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .slice(0, getIdentifierMaxLength() + 1);
}

export function isValidEmail(value = "") {
  const email =
    safeText(value, "")
      .toLowerCase();

  if (!email) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function looksLikeEmail(value = "") {
  return safeText(value, "")
    .includes("@");
}

function looksLikePhone(value = "") {
  const clean =
    safeText(value, "")
      .replace(/[^\d+]/g, "");

  return /^\+?\d{6,20}$/.test(clean);
}

function normalizePhone(value = "") {
  return safeText(value, "")
    .replace(/[^\d+]/g, "")
    .slice(0, 32);
}

function normalizeUsername(value = "") {
  return safeText(value, "")
    .normalize("NFKC")
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .toLowerCase()
    .slice(0, 80);
}

export function slugify(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFKC")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 160);
}

/* =========================================================
   PATH HELPERS
========================================================= */

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
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

  const segments =
    value.split("/");

  const normalized =
    [];

  for (const segment of segments) {
    if (
      !segment ||
      segment === "."
    ) {
      continue;
    }

    if (segment === "..") {
      normalized.pop();
      continue;
    }

    normalized.push(segment);
  }

  value =
    `/${normalized.join("/")}` || "/";

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

function pathFromUrlLike(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      return normalizeHashRouterPath(parsed.hash);
    }

    return `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;
  } catch {
    return raw;
  }
}

function splitPath(path = "/") {
  const raw =
    safeText(path, "/") || "/";

  if (isHashRouterPath(raw)) {
    return splitPath(
      normalizeHashRouterPath(raw)
    );
  }

  let pathname =
    raw;

  let search =
    "";

  let hash =
    "";

  const hashIndex =
    pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash =
      pathname.slice(hashIndex);

    pathname =
      pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search =
      pathname.slice(searchIndex);

    pathname =
      pathname.slice(0, searchIndex) || "/";
  }

  return {
    pathname:
      normalizePathnameOnly(pathname),

    search,
    hash,
  };
}

export function normalizePath(path = "/") {
  const raw =
    safeText(path, "/") || "/";

  try {
    if (isFunction(AppCore?.utils?.normalizePath)) {
      const normalized =
        AppCore.utils.normalizePath(raw);

      if (normalized) {
        return normalized;
      }
    }
  } catch {}

  const urlPath =
    pathFromUrlLike(raw) || "/";

  const {
    pathname,
    search,
    hash,
  } =
    splitPath(urlPath);

  return `${pathname}${search}${hash}`;
}

function stripSearchAndHash(path = "/") {
  const {
    pathname,
  } =
    splitPath(
      normalizePath(path)
    );

  return pathname || "/";
}

export function getCurrentBrowserPath() {
  if (!isBrowser()) {
    return "/";
  }

  try {
    const hash =
      window.location.hash || "";

    if (isHashRouterPath(hash)) {
      return normalizePath(hash);
    }

    return normalizePath(
      `${window.location.pathname || "/"}${window.location.search || ""}${hash}`
    );
  } catch {
    return "/";
  }
}

export function isAuthPath(path = "") {
  const clean =
    stripSearchAndHash(path)
      .toLowerCase();

  if (AUTH_BLOCKED_REDIRECTS.includes(clean)) {
    return true;
  }

  return (
    clean.startsWith("/login/") ||
    clean.startsWith("/logout/") ||
    clean.startsWith("/reset-password/") ||
    clean.startsWith("/reset-password-confirm/") ||
    clean.startsWith("/forgot-password/") ||
    clean.startsWith("/recover-password/") ||
    clean.startsWith("/password-reset/") ||
    clean.startsWith("/password-reset-confirm/") ||
    clean.startsWith("/confirm-reset-password/") ||
    clean.startsWith("/activate-account/") ||
    clean.startsWith("/activate/") ||
    clean.startsWith("/activation/") ||
    clean.startsWith("/account/activate/") ||
    clean.startsWith("/2fa/") ||
    clean.startsWith("/otp/") ||
    clean.startsWith("/mfa/")
  );
}

function hasEncodedOpenRedirectRisk(path = "") {
  const raw =
    safeText(path, "");

  if (!raw) {
    return true;
  }

  const lower =
    raw.toLowerCase();

  if (
    lower.includes("%0d") ||
    lower.includes("%0a") ||
    lower.includes("%09") ||
    lower.includes("%5c") ||
    raw.includes("\\")
  ) {
    return true;
  }

  try {
    const decoded =
      decodeURIComponent(raw)
        .trim()
        .replace(/\\/g, "/");

    if (
      decoded.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:/i.test(decoded) ||
      /[\r\n\t]/.test(decoded)
    ) {
      return true;
    }
  } catch {
    return true;
  }

  return false;
}

export function isSafeInternalRedirect(path = "", options = {}) {
  const opts =
    safeObject(options);

  const value =
    safeText(path, "")
      .slice(0, SAFE_REDIRECT_MAX_LENGTH);

  if (!value) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  if (/[\r\n\t]/.test(value)) return false;
  if (hasEncodedOpenRedirectRisk(value)) return false;

  const normalized =
    normalizePath(value);

  if (
    opts.allowAuthPaths !== true &&
    isAuthPath(normalized)
  ) {
    return false;
  }

  return true;
}

export function ensureSafeRedirect(
  path = "",
  fallback = DEFAULT_HOME_PATH,
  options = {}
) {
  const fallbackPath =
    isSafeInternalRedirect(
      fallback,
      {
        allowAuthPaths:
          options.allowFallbackAuthPath === true,
      }
    )
      ? normalizePath(fallback)
      : DEFAULT_HOME_PATH;

  const candidate =
    normalizePath(path || "");

  if (
    !isSafeInternalRedirect(
      candidate,
      options
    )
  ) {
    return fallbackPath;
  }

  return candidate;
}

function isRoleDefaultRedirect(path = "") {
  const clean =
    stripSearchAndHash(path)
      .toLowerCase();

  if (ROLE_DEFAULT_REDIRECTS.includes(clean)) {
    return true;
  }

  if (/^\/@[^/]+\/?$/i.test(clean)) {
    return true;
  }

  return false;
}

function getConfiguredHomePath() {
  const configured =
    normalizePath(
      AppCore?.config?.routes?.home ||
        AppCore?.config?.auth?.homeRoute ||
        AppCore?.config?.homePath ||
        DEFAULT_HOME_PATH
    );

  if (
    !configured ||
    isAuthPath(configured) ||
    isRoleDefaultRedirect(configured)
  ) {
    return DEFAULT_HOME_PATH;
  }

  return configured;
}

function getConfiguredTwoFactorPath() {
  const configured =
    normalizePath(
      AppCore?.config?.routes?.twoFactor ||
        AppCore?.config?.routes?.mfa ||
        AppCore?.config?.auth?.twoFactorRoute ||
        DEFAULT_2FA_PATH
    );

  if (
    !configured ||
    !isSafeInternalRedirect(
      configured,
      {
        allowAuthPaths:
          true,
      }
    )
  ) {
    return DEFAULT_2FA_PATH;
  }

  return configured;
}

/* =========================================================
   STORAGE
========================================================= */

export function getStorage() {
  try {
    if (AppCore?.storage) {
      return AppCore.storage;
    }
  } catch {}

  return null;
}

export function getNamespacedKey(key = "") {
  const prefix =
    safeText(
      AppCore?.config?.storagePrefix ||
        AppCore?.config?.appKey ||
        AppCore?.config?.appId,
      "onion"
    ).replace(/^:+|:+$/g, "") || "onion";

  const cleanKey =
    safeText(key, "")
      .replace(/^:+/g, "");

  return `${prefix}:${cleanKey}`;
}

function unwrapStoredText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    const raw =
      String(value).trim();

    if (!raw) {
      return fallback;
    }

    try {
      const parsed =
        JSON.parse(raw);

      return unwrapStoredText(
        parsed,
        raw
      );
    } catch {
      return raw;
    }
  }

  if (isPlainObject(value)) {
    return pickFirstText(
      value.value,
      value.raw,
      value.data,
      value.identifier,
      value.email,
      value.username,
      value.user,
      fallback
    );
  }

  return fallback;
}

function getStorageCandidates(key = "") {
  return unique([
    key,
    getNamespacedKey(key),
    ...(
      key === LOGIN_REMEMBER_KEY
        ? REMEMBER_IDENTIFIER_KEYS
        : []
    ),
    ...(
      key === LOGIN_REMEMBER_KEY
        ? REMEMBER_IDENTIFIER_KEYS.map(getNamespacedKey)
        : []
    ),
  ]);
}

export function readStorage(key, fallback = "") {
  const cleanKey =
    safeText(key, "");

  if (!cleanKey) {
    return fallback;
  }

  const storage =
    getStorage();

  const candidates =
    getStorageCandidates(cleanKey);

  for (const candidate of candidates) {
    try {
      if (isFunction(storage?.getRaw)) {
        const value =
          unwrapStoredText(
            storage.getRaw(candidate, ""),
            ""
          );

        if (value) {
          return value;
        }
      }
    } catch {}

    try {
      if (isFunction(storage?.get)) {
        const value =
          unwrapStoredText(
            storage.get(candidate, ""),
            ""
          );

        if (value) {
          return value;
        }
      }
    } catch {}

    try {
      if (isFunction(storage?.getJson)) {
        const value =
          unwrapStoredText(
            storage.getJson(candidate, null),
            ""
          );

        if (value) {
          return value;
        }
      }
    } catch {}
  }

  if (!isBrowser()) {
    return fallback;
  }

  for (const candidate of candidates) {
    try {
      const value =
        unwrapStoredText(
          window.localStorage?.getItem?.(candidate),
          ""
        );

      if (value) {
        return value;
      }
    } catch {}

    try {
      const value =
        unwrapStoredText(
          window.sessionStorage?.getItem?.(candidate),
          ""
        );

      if (value) {
        return value;
      }
    } catch {}
  }

  return fallback;
}

export function writeStorage(key, value = "") {
  const cleanKey =
    safeText(key, "");

  const finalValue =
    safeText(value, "");

  if (!cleanKey) {
    return false;
  }

  if (!finalValue) {
    return removeStorage(cleanKey);
  }

  const storage =
    getStorage();

  try {
    if (isFunction(storage?.setRaw)) {
      storage.setRaw(
        cleanKey,
        finalValue
      );

      return true;
    }
  } catch {}

  try {
    if (isFunction(storage?.set)) {
      storage.set(
        cleanKey,
        finalValue
      );

      return true;
    }
  } catch {}

  try {
    if (isFunction(storage?.setJson)) {
      storage.setJson(
        cleanKey,
        finalValue
      );

      return true;
    }
  } catch {}

  if (!isBrowser()) {
    return false;
  }

  try {
    window.localStorage?.setItem?.(
      getNamespacedKey(cleanKey),
      finalValue
    );

    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key) {
  const cleanKey =
    safeText(key, "");

  if (!cleanKey) {
    return false;
  }

  const storage =
    getStorage();

  const candidates =
    getStorageCandidates(cleanKey);

  let removed =
    false;

  for (const candidate of candidates) {
    try {
      if (isFunction(storage?.remove)) {
        storage.remove(candidate);
        removed = true;
      }
    } catch {}

    try {
      if (isFunction(storage?.delete)) {
        storage.delete(candidate);
        removed = true;
      }
    } catch {}

    try {
      if (isFunction(storage?.del)) {
        storage.del(candidate);
        removed = true;
      }
    } catch {}
  }

  if (isBrowser()) {
    for (const candidate of candidates) {
      try {
        window.localStorage?.removeItem?.(candidate);
        removed = true;
      } catch {}

      try {
        window.sessionStorage?.removeItem?.(candidate);
        removed = true;
      } catch {}
    }
  }

  return removed;
}

/* =========================================================
   REMEMBER IDENTIFIER
========================================================= */

export function loadRememberedIdentifier() {
  return readStorage(
    LOGIN_REMEMBER_KEY,
    ""
  );
}

export function loadRememberedEmail() {
  return loadRememberedIdentifier();
}

export function saveRememberedIdentifier(identifier = "") {
  const clean =
    normalizeIdentifier(identifier);

  if (!clean) {
    return clearRememberedIdentifier();
  }

  return writeStorage(
    LOGIN_REMEMBER_KEY,
    clean
  );
}

export function saveRememberedEmail(email = "") {
  return saveRememberedIdentifier(email);
}

export function clearRememberedIdentifier() {
  let removed =
    false;

  for (const key of REMEMBER_IDENTIFIER_KEYS) {
    removed =
      removeStorage(key) || removed;
  }

  return removed;
}

export function clearRememberedEmail() {
  return clearRememberedIdentifier();
}

/* =========================================================
   LOGIN PAYLOAD
========================================================= */

export function createLoginPayload({
  identifier = "",
  email = "",
  username = "",
  user = "",
  login = "",
  phone = "",
  telefono = "",
  password = "",
  remember = false,
  rememberMe = undefined,
  redirect = "",
} = {}) {
  const normalizedIdentifier =
    normalizeIdentifier(identifier) ||
    normalizeIdentifier(email) ||
    normalizeIdentifier(username) ||
    normalizeIdentifier(user) ||
    normalizeIdentifier(login) ||
    normalizeIdentifier(phone) ||
    normalizeIdentifier(telefono);

  const isEmail =
    looksLikeEmail(normalizedIdentifier);

  const finalEmail =
    isEmail
      ? normalizedIdentifier.toLowerCase()
      : "";

  const finalPhone =
    !finalEmail && looksLikePhone(normalizedIdentifier)
      ? normalizePhone(normalizedIdentifier)
      : "";

  const finalUsername =
    !finalEmail && !finalPhone
      ? normalizeUsername(normalizedIdentifier)
      : "";

  const finalRemember =
    rememberMe !== undefined
      ? safeBool(rememberMe, false)
      : Boolean(remember);

  return {
    identifier:
      normalizedIdentifier,

    login:
      normalizedIdentifier,

    email:
      finalEmail,

    username:
      finalUsername,

    user:
      finalUsername || normalizedIdentifier,

    phone:
      finalPhone,

    telefono:
      finalPhone,

    password:
      safeRawText(password, ""),

    remember:
      finalRemember,

    rememberMe:
      finalRemember,

    redirect:
      safeText(redirect, ""),
  };
}

/* =========================================================
   VALIDATION
========================================================= */

export function validateLoginPayload(payload = {}) {
  const identifier =
    normalizeIdentifier(
      payload.identifier ||
        payload.email ||
        payload.username ||
        payload.user ||
        payload.login ||
        payload.phone ||
        payload.telefono ||
        ""
    );

  const password =
    safeRawText(
      payload.password,
      ""
    );

  const errors =
    {};

  const passwordMin =
    getLoginPasswordMinLength();

  const passwordMax =
    getLoginPasswordMaxLength();

  if (!identifier) {
    errors.identifier =
      "Introduce tu email o nombre de usuario.";
  } else if (
    identifier.length >
    getIdentifierMaxLength()
  ) {
    errors.identifier =
      "El identificador es demasiado largo.";
  } else if (
    looksLikeEmail(identifier) &&
    !isValidEmail(identifier)
  ) {
    errors.identifier =
      "El formato del email no es válido.";
  }

  if (!password.trim()) {
    errors.password =
      "Introduce tu contraseña.";
  } else if (
    passwordMin > 1 &&
    password.length < passwordMin
  ) {
    errors.password =
      `La contraseña debe tener al menos ${passwordMin} caracteres.`;
  } else if (password.length > passwordMax) {
    errors.password =
      "La contraseña es demasiado larga.";
  }

  return errors;
}

export function getFirstLoginError(errors = {}) {
  return (
    safeText(errors.identifier, "") ||
    safeText(errors.email, "") ||
    safeText(errors.username, "") ||
    safeText(errors.user, "") ||
    safeText(errors.password, "") ||
    safeText(errors.global, "") ||
    safeText(errors.form, "") ||
    safeText(errors.message, "") ||
    ""
  );
}

/* =========================================================
   AUTH PAYLOAD COLLECTION
========================================================= */

function collectAuthObjects(payload = null) {
  const output =
    [];

  const seen =
    new WeakSet();

  const queue =
    [
      payload,
    ];

  let guard =
    0;

  while (
    queue.length &&
    guard < 160
  ) {
    guard += 1;

    const current =
      queue.shift();

    if (
      !current ||
      typeof current !== "object"
    ) {
      continue;
    }

    try {
      if (seen.has(current)) {
        continue;
      }

      seen.add(current);
    } catch {}

    output.push(current);

    for (const key of AUTH_OBJECT_KEYS) {
      const child =
        current[key];

      if (
        child &&
        typeof child === "object"
      ) {
        queue.push(child);
      }
    }

    try {
      if (
        current.response?.data &&
        typeof current.response.data === "object"
      ) {
        queue.push(current.response.data);
      }
    } catch {}

    try {
      if (
        current.auth?.data &&
        typeof current.auth.data === "object"
      ) {
        queue.push(current.auth.data);
      }
    } catch {}

    try {
      if (
        current.session?.data &&
        typeof current.session.data === "object"
      ) {
        queue.push(current.session.data);
      }
    } catch {}
  }

  return output;
}

function pickValueFromObjects(objects = [], keys = []) {
  for (const object of safeArray(objects)) {
    if (
      !object ||
      typeof object !== "object"
    ) {
      continue;
    }

    for (const key of keys) {
      if (
        object[key] !== null &&
        object[key] !== undefined &&
        !(
          typeof object[key] === "string" &&
          object[key].trim() === ""
        )
      ) {
        return object[key];
      }
    }
  }

  return undefined;
}

function pickTextFromObjects(objects = [], keys = []) {
  return safeText(
    pickValueFromObjects(
      objects,
      keys
    ),
    ""
  );
}

function pickObjectFromObjects(objects = [], keys = []) {
  for (const object of safeArray(objects)) {
    if (
      !object ||
      typeof object !== "object"
    ) {
      continue;
    }

    for (const key of keys) {
      if (isPlainObject(object[key])) {
        return object[key];
      }
    }
  }

  return null;
}

/* =========================================================
   TOKEN / CURRENT SESSION
========================================================= */

function normalizeTokenValue(token = null) {
  if (
    token === null ||
    token === undefined
  ) {
    return "";
  }

  let value =
    String(token)
      .trim();

  if (!value) {
    return "";
  }

  if (/^bearer\s+/i.test(value)) {
    value =
      value.replace(/^bearer\s+/i, "")
        .trim();
  }

  const lower =
    value.toLowerCase();

  if (
    BAD_TOKEN_VALUES.includes(lower) ||
    /[\r\n\t]/.test(value)
  ) {
    return "";
  }

  const max =
    getTokenMaxLength();

  if (
    max > 0 &&
    value.length > max
  ) {
    return "";
  }

  return value;
}

export function hasUsableToken(token = "") {
  const value =
    normalizeTokenValue(token);

  if (!value) {
    return false;
  }

  try {
    if (isFunction(AppCore?.utils?.hasValidToken)) {
      return Boolean(
        AppCore.utils.hasValidToken(value)
      );
    }
  } catch {}

  return true;
}

function getCurrentToken() {
  return normalizeTokenValue(
    AppCore?.state?.token ||
      AppCore?.state?.accessToken ||
      AppCore?.state?.access_token ||
      AppCore?.state?.auth?.token ||
      AppCore?.state?.auth?.accessToken ||
      AppCore?.state?.auth?.access_token ||
      AppCore?.state?.session?.token ||
      AppCore?.state?.session?.accessToken ||
      AppCore?.state?.session?.access_token ||
      ""
  );
}

function getCurrentUser() {
  return (
    AppCore?.state?.user ||
    AppCore?.state?.currentUser ||
    AppCore?.state?.authUser ||
    AppCore?.state?.sessionUser ||
    AppCore?.state?.me ||
    AppCore?.state?.account ||
    AppCore?.state?.profile ||
    AppCore?.state?.auth?.user ||
    AppCore?.state?.session?.user ||
    null
  );
}

function getStateAuthenticated() {
  return Boolean(
    AppCore?.state?.authenticated === true ||
      AppCore?.state?.auth?.authenticated === true ||
      AppCore?.state?.session?.authenticated === true
  );
}

/* =========================================================
   TOKEN / STATUS EXTRACTION
========================================================= */

function extractToken(raw = {}) {
  return normalizeTokenValue(
    pickTextFromObjects(
      collectAuthObjects(raw),
      TOKEN_KEYS
    )
  );
}

function extractRefreshToken(raw = {}) {
  return normalizeTokenValue(
    pickTextFromObjects(
      collectAuthObjects(raw),
      REFRESH_TOKEN_KEYS
    )
  );
}

function extractTempToken(raw = {}) {
  return normalizeTokenValue(
    pickTextFromObjects(
      collectAuthObjects(raw),
      TEMP_TOKEN_KEYS
    )
  );
}

function extractStatus(raw = {}) {
  return pickValueFromObjects(
    collectAuthObjects(raw),
    [
      "status",
      "statusCode",
      "status_code",
      "state",
      "estado",
    ]
  );
}

function normalizeStatusKey(value = "") {
  const raw =
    safeText(value, "")
      .toLowerCase();

  if (!raw) {
    return "";
  }

  if (Number.isFinite(Number(raw))) {
    return "";
  }

  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function extractCode(raw = {}) {
  return pickTextFromObjects(
    collectAuthObjects(raw),
    [
      "code",
      "errorCode",
      "error_code",
      "error",
    ]
  );
}

function extractMessage(raw = {}) {
  const objects =
    collectAuthObjects(raw);

  for (const object of objects) {
    const value =
      pickValueFromObjects(
        [object],
        [
          "message",
          "mensaje",
          "errorMessage",
          "error_message",
          "detail",
          "description",
          "title",
          "reason",
          "msg",
          "error",
        ]
      );

    if (
      typeof value === "string" ||
      typeof value === "number"
    ) {
      const text =
        safeText(value, "");

      if (text && text !== "[object Object]") {
        return text;
      }
    }

    if (isPlainObject(value)) {
      const text =
        pickFirstText(
          value.message,
          value.mensaje,
          value.detail,
          value.description,
          value.title,
          value.code,
          value.error
        );

      if (text) {
        return text;
      }
    }
  }

  return "";
}

function extractRedirectTo(raw = {}) {
  return pickTextFromObjects(
    collectAuthObjects(raw),
    [
      "redirectTo",
      "redirect_to",
      "redirect",
      "returnTo",
      "return_to",
      "next",
      "nextPath",
      "next_path",
      "target",
    ]
  );
}

function extractNavigationHandled(raw = {}) {
  const objects =
    collectAuthObjects(raw);

  return objects.some((object) =>
    safeBool(object.navigationHandled, false) ||
      safeBool(object.navigated, false) ||
      safeBool(object.didNavigate, false) ||
      safeBool(object.redirected, false)
  );
}

function extractSessionData(raw = {}) {
  return (
    pickObjectFromObjects(
      collectAuthObjects(raw),
      SESSION_KEYS
    ) ||
    null
  );
}

/* =========================================================
   USER EXTRACTION / NORMALIZATION
========================================================= */

function looksLikeAuthEnvelope(value = {}) {
  if (!isPlainObject(value)) {
    return false;
  }

  return AUTH_ENVELOPE_KEYS.some((key) =>
    hasOwn(
      value,
      key
    )
  );
}

function hasIdentityInObject(value = {}) {
  if (!isPlainObject(value)) {
    return false;
  }

  return USER_IDENTITY_KEYS.some((key) =>
    Boolean(
      safeText(value[key], "")
    )
  );
}

function hasNestedUserIdentity(value = {}) {
  if (!isPlainObject(value)) {
    return false;
  }

  const branches =
    [
      value,
      value.user,
      value.usuario,
      value.me,
      value.account,
      value.profile,
      value.currentUser,
      value.current_user,
      value.authUser,
      value.auth_user,
      value.sessionUser,
      value.session_user,
      value.raw,
      value.raw?.user,
      value.raw?.profile,
      value.raw?.account,
    ];

  return branches.some(hasIdentityInObject);
}

function sanitizeUserRaw(value = {}, depth = 0, seen = new WeakSet()) {
  if (
    depth > 4 ||
    !isPlainObject(value)
  ) {
    return {};
  }

  try {
    if (seen.has(value)) {
      return {};
    }

    seen.add(value);
  } catch {}

  const output =
    {};

  for (const [key, item] of Object.entries(value).slice(0, 180)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      continue;
    }

    if (Array.isArray(item)) {
      output[key] =
        item
          .slice(0, 120)
          .map((entry) =>
            isPlainObject(entry)
              ? sanitizeUserRaw(
                  entry,
                  depth + 1,
                  seen
                )
              : entry
          );

      continue;
    }

    if (isPlainObject(item)) {
      output[key] =
        sanitizeUserRaw(
          item,
          depth + 1,
          seen
        );

      continue;
    }

    output[key] =
      item;
  }

  return output;
}

function normalizeRole(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function isUserActive(user = null) {
  if (!isPlainObject(user)) {
    return false;
  }

  const status =
    normalizeRole(
      user.status ||
        user.estado ||
        user.state ||
        user.accountStatus ||
        user.account_status ||
        ""
    );

  if (
    [
      "disabled",
      "inactive",
      "deleted",
      "blocked",
      "suspended",
      "banned",
      "archived",
      "revoked",
      "desactivado",
      "inactivo",
      "eliminado",
      "bloqueado",
      "suspendido",
    ].includes(status)
  ) {
    return false;
  }

  if (
    user.active === false ||
    user.enabled === false ||
    user.disabled === true ||
    user.deleted === true ||
    user.blocked === true ||
    user.locked === true ||
    user.suspended === true ||
    user.banned === true ||
    user.archived === true
  ) {
    return false;
  }

  return true;
}

export function hasUsableUser(user = {}) {
  if (!isPlainObject(user)) {
    return false;
  }

  if (!isUserActive(user)) {
    return false;
  }

  return Boolean(
    safeText(user.id, "") ||
      safeText(user.userId, "") ||
      safeText(user.user_id, "") ||
      safeText(user._id, "") ||
      safeText(user.uid, "") ||
      safeText(user.sub, "") ||
      safeText(user.username, "") ||
      safeText(user.userName, "") ||
      safeText(user.user_name, "") ||
      safeText(user.email, "") ||
      safeText(user.mail, "") ||
      safeText(user.phone, "") ||
      safeText(user.telefono, "") ||
      safeText(user.mobile, "")
  );
}

function fallbackNormalizeUser(user = {}) {
  if (
    !isPlainObject(user) ||
    !hasNestedUserIdentity(user)
  ) {
    return null;
  }

  const profile =
    safeObject(user.profile);

  const raw =
    safeObject(user.raw);

  const id =
    pickFirstValue(
      user.id,
      user.userId,
      user.user_id,
      user.uuid,
      user._id,
      user.uid,
      user.sub,
      profile.id,
      profile.userId,
      profile.user_id,
      raw.id,
      raw.userId,
      raw.user_id,
      raw.sub
    ) || null;

  const email =
    pickFirstText(
      user.email,
      user.mail,
      user.emailLower,
      user.email_lower,
      profile.email,
      profile.mail,
      raw.email,
      raw.mail
    );

  const username =
    normalizeUsername(
      pickFirstText(
        user.username,
        user.userName,
        user.user_name,
        user.nick,
        user.alias,
        user.login,
        user.slug,
        profile.username,
        profile.userName,
        profile.user_name,
        profile.slug,
        raw.username,
        raw.userName,
        raw.user_name,
        raw.slug,
        email,
        id
      )
    );

  const displayName =
    pickFirstText(
      user.displayName,
      user.display_name,
      user.name,
      user.nombre,
      user.fullName,
      user.full_name,
      profile.displayName,
      profile.display_name,
      profile.name,
      profile.nombre,
      raw.displayName,
      raw.display_name,
      raw.name,
      username,
      email,
      id,
      "Usuario"
    );

  const role =
    normalizeRole(
      pickFirstText(
        user.role,
        user.rol,
        user.userRole,
        user.user_role,
        user.type,
        user.userType,
        user.user_type,
        user.perfil,
        profile.role,
        profile.rol,
        raw.role,
        raw.rol
      )
    );

  const clean =
    sanitizeUserRaw(user);

  return {
    ...clean,

    id,

    userId:
      user.userId ??
      user.user_id ??
      id,

    user_id:
      user.user_id ??
      user.userId ??
      id,

    uid:
      user.uid ??
      id,

    sub:
      user.sub ??
      id,

    username,

    usernameLower:
      user.usernameLower ||
      user.username_lower ||
      username ||
      null,

    username_lower:
      user.username_lower ||
      user.usernameLower ||
      username ||
      null,

    slug:
      normalizeUsername(
        pickFirstText(
          user.slug,
          profile.slug,
          raw.slug,
          username,
          slugify(displayName)
        )
      ),

    name:
      displayName,

    nombre:
      user.nombre ||
      displayName,

    displayName,

    email,

    emailLower:
      pickFirstText(
        user.emailLower,
        user.email_lower,
        email
      ).toLowerCase(),

    email_lower:
      pickFirstText(
        user.email_lower,
        user.emailLower,
        email
      ).toLowerCase(),

    role,

    rol:
      role,

    roles:
      Array.isArray(user.roles)
        ? user.roles
        : role
          ? [role]
          : [],

    active:
      isUserActive(user),
  };
}

function normalizeUserCandidate(user = null) {
  if (!isPlainObject(user)) {
    return null;
  }

  if (
    looksLikeAuthEnvelope(user) &&
    !hasNestedUserIdentity(user)
  ) {
    return null;
  }

  try {
    if (isFunction(AppCore?.utils?.normalizeUser)) {
      const normalized =
        AppCore.utils.normalizeUser(user);

      if (hasUsableUser(normalized)) {
        return normalized;
      }
    }
  } catch {}

  const fallback =
    fallbackNormalizeUser(user);

  return hasUsableUser(fallback)
    ? fallback
    : null;
}

function extractUser(raw = {}) {
  const objects =
    collectAuthObjects(raw);

  const candidates =
    [];

  for (const object of objects) {
    for (const key of USER_KEYS) {
      if (isPlainObject(object?.[key])) {
        candidates.push(object[key]);
      }
    }
  }

  for (const object of objects) {
    if (
      isPlainObject(object) &&
      hasNestedUserIdentity(object)
    ) {
      candidates.push(object);
    }
  }

  for (const candidate of candidates) {
    const user =
      normalizeUserCandidate(candidate);

    if (user) {
      return user;
    }
  }

  return null;
}

function extractRole(raw = {}, user = null) {
  return normalizeRole(
    pickFirstText(
      pickTextFromObjects(
        collectAuthObjects(raw),
        [
          "role",
          "rol",
          "userRole",
          "user_role",
          "type",
          "tipo",
          "perfil",
        ]
      ),
      user?.role,
      user?.rol,
      user?.userRole,
      user?.user_role
    )
  );
}

export function getUserIdentity(user = {}) {
  if (!isPlainObject(user)) {
    return "";
  }

  return (
    safeText(user.userId, "") ||
    safeText(user.user_id, "") ||
    safeText(user.id, "") ||
    safeText(user._id, "") ||
    safeText(user.uid, "") ||
    safeText(user.sub, "") ||
    safeText(user.email, "") ||
    safeText(user.mail, "") ||
    safeText(user.username, "") ||
    safeText(user.userName, "") ||
    safeText(user.user_name, "") ||
    safeText(user.phone, "") ||
    safeText(user.telefono, "")
  );
}

/* =========================================================
   AUTH RESPONSE
========================================================= */

function isExplicitAuthFailure(raw = {}) {
  const objects =
    collectAuthObjects(raw);

  const statusValue =
    extractStatus(raw);

  const statusNumber =
    Number(statusValue || 0);

  if (
    Number.isFinite(statusNumber) &&
    statusNumber >= 400
  ) {
    return true;
  }

  const statusKey =
    normalizeStatusKey(statusValue);

  if (
    statusKey &&
    AUTH_FAILURE_STATUSES.has(statusKey)
  ) {
    return true;
  }

  const code =
    safeText(
      extractCode(raw),
      ""
    ).toUpperCase();

  if (
    code &&
    AUTH_FAILURE_CODES.has(code)
  ) {
    return true;
  }

  return objects.some((object) => {
    if (object?.ok === false) {
      return true;
    }

    if (object?.success === false) {
      return true;
    }

    if (
      object?.authenticated === false &&
      (
        statusKey === "unauthorized" ||
        statusKey === "auth_error" ||
        statusKey === "not_authenticated"
      )
    ) {
      return true;
    }

    return false;
  });
}

function rawDeclaresAuthSuccess(raw = {}) {
  const objects =
    collectAuthObjects(raw);

  const statusKey =
    normalizeStatusKey(
      extractStatus(raw)
    );

  if (
    statusKey &&
    AUTH_SUCCESS_STATUSES.has(statusKey)
  ) {
    return true;
  }

  return objects.some((object) =>
    object?.ok === true ||
      object?.success === true ||
      object?.authenticated === true ||
      object?.status === true
  );
}

function extractRequires2FA(raw = {}, {
  tempToken = "",
  token = "",
  user = null,
} = {}) {
  const objects =
    collectAuthObjects(raw);

  const statusKey =
    normalizeStatusKey(
      extractStatus(raw)
    );

  if (TWO_FACTOR_STATUSES.has(statusKey)) {
    return true;
  }

  const boolKeys =
    [
      "requires2FA",
      "requires_2fa",
      "require2FA",
      "require_2fa",
      "requiresTwoFactor",
      "twoFactorRequired",
      "requiresMfa",
      "requires_mfa",
      "mfaRequired",
      "mfa_required",
      "totpRequired",
      "totp_required",
      "challengeRequired",
      "challenge_required",
    ];

  const flagged =
    objects.some((object) =>
      boolKeys.some((key) =>
        safeBool(
          object?.[key],
          false
        )
      )
    );

  if (flagged) {
    return true;
  }

  return Boolean(
    tempToken &&
      !(
        token &&
        hasUsableUser(user)
      )
  );
}

function fillFromAppliedCoreSession({
  token = "",
  user = null,
  declaredSuccess = false,
  explicitFailure = false,
} = {}) {
  if (
    explicitFailure ||
    !declaredSuccess
  ) {
    return {
      token,
      user,
      usedCoreSession:
        false,
    };
  }

  const stateToken =
    getCurrentToken();

  const stateUser =
    normalizeUserCandidate(
      getCurrentUser()
    );

  const stateIdentity =
    getUserIdentity(
      stateUser || {}
    );

  const rawIdentity =
    getUserIdentity(
      user || {}
    );

  let finalToken =
    token;

  let finalUser =
    user;

  let usedCoreSession =
    false;

  /*
    No mezcla peligrosa:
    - token+user ausentes: acepta state sólo si AppCore ya está authenticated.
    - token presente sin user: usa state.user sólo si el token coincide.
    - user presente sin token: usa state.token sólo si la identidad coincide.
  */
  if (
    !finalToken &&
    !finalUser &&
    getStateAuthenticated() &&
    hasUsableToken(stateToken) &&
    hasUsableUser(stateUser)
  ) {
    finalToken =
      stateToken;

    finalUser =
      stateUser;

    usedCoreSession =
      true;
  } else if (
    finalToken &&
    !finalUser &&
    stateToken === finalToken &&
    hasUsableUser(stateUser)
  ) {
    finalUser =
      stateUser;

    usedCoreSession =
      true;
  } else if (
    finalUser &&
    !finalToken &&
    rawIdentity &&
    stateIdentity &&
    rawIdentity === stateIdentity &&
    hasUsableToken(stateToken)
  ) {
    finalToken =
      stateToken;

    usedCoreSession =
      true;
  }

  return {
    token:
      finalToken,

    user:
      finalUser,

    usedCoreSession,
  };
}

export function normalizeAuthResult(result = {}) {
  const raw =
    result && typeof result === "object"
      ? result
      : {
          message:
            safeText(result, ""),
        };

  let token =
    extractToken(raw);

  const refreshToken =
    extractRefreshToken(raw);

  let tempToken =
    extractTempToken(raw);

  let user =
    extractUser(raw);

  const message =
    extractMessage(raw);

  const code =
    extractCode(raw);

  const statusValue =
    extractStatus(raw);

  const redirectTo =
    extractRedirectTo(raw);

  const sessionData =
    extractSessionData(raw);

  const navigationHandled =
    extractNavigationHandled(raw);

  const explicitFailure =
    isExplicitAuthFailure(raw);

  const declaredSuccess =
    rawDeclaresAuthSuccess(raw);

  const coreFill =
    fillFromAppliedCoreSession({
      token,
      user,
      declaredSuccess,
      explicitFailure,
    });

  token =
    coreFill.token;

  user =
    coreFill.user;

  const role =
    extractRole(raw, user);

  let requires2FA =
    extractRequires2FA(
      raw,
      {
        tempToken,
        token,
        user,
      }
    );

  if (
    requires2FA &&
    !tempToken &&
    token &&
    !hasUsableUser(user)
  ) {
    tempToken =
      token;

    token =
      "";
  }

  if (requires2FA) {
    token =
      "";
  }

  const authenticated =
    Boolean(
      !explicitFailure &&
        !requires2FA &&
        hasUsableToken(token) &&
        hasUsableUser(user)
    );

  const tokenOnly =
    Boolean(
      !explicitFailure &&
        !requires2FA &&
        hasUsableToken(token) &&
        !hasUsableUser(user)
    );

  const userOnly =
    Boolean(
      !explicitFailure &&
        !requires2FA &&
        !hasUsableToken(token) &&
        hasUsableUser(user)
    );

  const statusKey =
    normalizeStatusKey(statusValue);

  const declaredSuccessStatus =
    statusKey &&
    AUTH_SUCCESS_STATUSES.has(statusKey);

  const ok =
    explicitFailure
      ? false
      : Boolean(
          authenticated ||
            requires2FA
        );

  const finalStatus =
    safeText(
      statusValue,
      explicitFailure
        ? "auth_failed"
        : requires2FA
          ? "2fa_required"
          : authenticated
            ? "authenticated"
            : tokenOnly
              ? "token_only"
              : userOnly
                ? "user_only"
                : declaredSuccessStatus
                  ? statusKey
                  : declaredSuccess
                    ? "success_without_session"
                    : ""
    );

  return {
    raw:
      result,

    ok,
    success:
      ok,

    explicitFailure,

    declaredSuccess:
      Boolean(declaredSuccess),

    status:
      finalStatus,

    code:
      safeText(code, ""),

    message:
      safeText(message, ""),

    token:
      safeText(token, ""),

    accessToken:
      safeText(token, ""),

    access_token:
      safeText(token, ""),

    refreshToken:
      safeText(refreshToken, ""),

    refresh_token:
      safeText(refreshToken, ""),

    tempToken:
      safeText(tempToken, ""),

    temp_token:
      safeText(tempToken, ""),

    sessionData,
    session:
      sessionData,

    user,
    usuario:
      user,

    role:
      safeText(role, ""),

    redirectTo:
      safeText(redirectTo, ""),

    requires2FA:
      Boolean(requires2FA),

    authenticated,

    tokenOnly,
    userOnly,

    usedCoreSession:
      Boolean(coreFill.usedCoreSession),

    navigationHandled:
      Boolean(navigationHandled),
  };
}

export function resolveAuthErrorMessage(error) {
  const normalized =
    normalizeAuthResult(error);

  const code =
    safeText(
      error?.data?.code,
      ""
    ) ||
    safeText(
      error?.data?.error,
      ""
    ) ||
    safeText(
      error?.response?.data?.code,
      ""
    ) ||
    safeText(
      error?.response?.data?.error,
      ""
    ) ||
    safeText(
      error?.code,
      ""
    ) ||
    safeText(
      normalized.code,
      ""
    );

  const backendMessage =
    safeText(
      error?.data?.message,
      ""
    ) ||
    safeText(
      error?.data?.mensaje,
      ""
    ) ||
    safeText(
      error?.response?.data?.message,
      ""
    ) ||
    safeText(
      error?.response?.data?.mensaje,
      ""
    ) ||
    safeText(
      error?.message,
      ""
    ) ||
    safeText(
      error?.statusText,
      ""
    ) ||
    safeText(
      normalized.message,
      ""
    );

  if (
    backendMessage &&
    backendMessage !== "[object Object]"
  ) {
    return redactText(backendMessage);
  }

  switch (safeText(code, "").toUpperCase()) {
    case "INVALID_CREDENTIALS":
    case "BAD_CREDENTIALS":
    case "CREDENTIALS_INVALID":
      return "Credenciales incorrectas.";

    case "ACCOUNT_TEMPORARILY_LOCKED":
      return "La cuenta está bloqueada temporalmente. Inténtalo de nuevo más tarde.";

    case "ACCOUNT_DISABLED":
    case "USER_DISABLED":
    case "USER_NOT_AVAILABLE":
      return "La cuenta no está disponible.";

    case "MISSING_CREDENTIALS":
      return "Introduce usuario/email y contraseña.";

    case "INVALID_LOGIN_SESSION":
      return "Login inválido: el servidor no devolvió una sesión válida.";

    case "TOKEN_VERSION_MISMATCH":
    case "SESSION_EXPIRED":
    case "SESSION_REVOKED":
      return "La sesión no es válida. Inicia sesión de nuevo.";

    case "UNAUTHORIZED":
    case "FORBIDDEN":
      return "No tienes autorización para acceder.";

    default:
      return "No se ha podido iniciar sesión.";
  }
}

/* =========================================================
   SESSION SYNC
========================================================= */

function isAlreadySyncedSession(token = "", user = null) {
  const currentToken =
    getCurrentToken();

  if (
    !token ||
    !currentToken ||
    token !== currentToken
  ) {
    return false;
  }

  const currentIdentity =
    getUserIdentity(
      getCurrentUser() || {}
    );

  const nextIdentity =
    getUserIdentity(
      user || {}
    );

  return Boolean(
    getStateAuthenticated() &&
      currentIdentity &&
      nextIdentity &&
      currentIdentity === nextIdentity
  );
}

function buildInvalidSessionError(message = "Login inválido: sesión incompleta.") {
  const error =
    new Error(message);

  error.name =
    "LoginSessionError";

  error.status =
    401;

  error.code =
    "INVALID_LOGIN_SESSION";

  error.data = {
    code:
      "INVALID_LOGIN_SESSION",

    message,
  };

  return error;
}

function emitSessionSynced({
  user,
  role,
  authenticated,
  alreadySynced = false,
  source = "login.helpers",
} = {}) {
  const identity =
    getUserIdentity(user || {});

  try {
    AppCore?.events?.emit?.(
      "auth:login:session-synced",
      {
        authenticated:
          Boolean(authenticated),

        alreadySynced:
          Boolean(alreadySynced),

        userId:
          identity || null,

        role:
          role || null,

        source,

        at:
          safeIsoNow(),
      }
    );
  } catch {}
}

function applyFallbackSession({
  token,
  user,
  role,
  refreshToken = "",
  sessionData = null,
} = {}) {
  const patch = {
    token,
    accessToken:
      token,
    access_token:
      token,

    refreshToken:
      refreshToken || null,
    refresh_token:
      refreshToken || null,

    user,
    currentUser:
      user,
    authUser:
      user,
    sessionUser:
      user,

    role:
      role || user?.role || user?.rol || "",
    rol:
      role || user?.role || user?.rol || "",
    userRole:
      role || user?.role || user?.rol || "",

    authenticated:
      true,
    hasToken:
      true,

    session:
      {
        ...(isPlainObject(AppCore?.state?.session)
          ? AppCore.state.session
          : {}),

        token,
        accessToken:
          token,
        access_token:
          token,

        refreshToken:
          refreshToken || null,
        refresh_token:
          refreshToken || null,

        user,
        role:
          role || user?.role || user?.rol || "",
        authenticated:
          true,

        data:
          sessionData || undefined,
      },
  };

  try {
    if (isFunction(AppCore?.setState)) {
      AppCore.setState(
        patch,
        {
          source:
            "login.helpers:fallback-session",

          allowExplicitAuthenticated:
            true,

          forceAuthenticated:
            true,

          emitDerived:
            true,
        }
      );

      return true;
    }
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        patch
      );

      return true;
    }
  } catch {}

  return false;
}

function commitSessionOnce({
  token,
  user,
  role,
  refreshToken = "",
  sessionData = null,
  source = "login.helpers:syncSession",
} = {}) {
  if (isFunction(AppCore?.applySession)) {
    try {
      AppCore.applySession(
        {
          token,
          accessToken:
            token,
          access_token:
            token,

          refreshToken:
            refreshToken || null,
          refresh_token:
            refreshToken || null,

          user,
          usuario:
            user,
          me:
            user,
          account:
            user,
          profile:
            user,

          role,
          rol:
            role,

          session:
            sessionData || null,
          sessionData:
            sessionData || null,

          authenticated:
            true,

          source,
        },
        {
          source,
          allowExplicitAuthenticated:
            true,
          forceAuthenticated:
            true,
        }
      );

      return true;
    } catch {}
  }

  return applyFallbackSession({
    token,
    user,
    role,
    refreshToken,
    sessionData,
  });
}

function verifyCoreSession(token = "", user = null) {
  const currentToken =
    getCurrentToken();

  const currentIdentity =
    getUserIdentity(
      getCurrentUser() || {}
    );

  const nextIdentity =
    getUserIdentity(
      user || {}
    );

  return Boolean(
    getStateAuthenticated() &&
      currentToken &&
      currentToken === token &&
      currentIdentity &&
      nextIdentity &&
      currentIdentity === nextIdentity
  );
}

export function syncSession(auth = {}, options = {}) {
  const normalized =
    normalizeAuthResult(auth);

  if (
    normalized.requires2FA &&
    !normalized.token
  ) {
    return {
      token:
        "",

      user:
        null,

      role:
        "",

      authenticated:
        false,

      requires2FA:
        true,

      tempToken:
        normalized.tempToken || "",

      alreadySynced:
        false,
    };
  }

  const token =
    normalizeTokenValue(
      normalized.token
    );

  const user =
    normalized.user || null;

  const role =
    safeText(
      normalized.role ||
        normalized.user?.role ||
        normalized.user?.rol ||
        "",
      ""
    );

  if (
    normalized.explicitFailure ||
    normalized.ok === false
  ) {
    throw buildInvalidSessionError(
      normalized.message ||
        "No se pudo iniciar sesión."
    );
  }

  if (!hasUsableToken(token)) {
    throw buildInvalidSessionError(
      "No se recibió token de autenticación."
    );
  }

  if (!hasUsableUser(user)) {
    throw buildInvalidSessionError(
      "No se recibió usuario válido para la sesión."
    );
  }

  const alreadySynced =
    isAlreadySyncedSession(
      token,
      user
    );

  if (!alreadySynced) {
    commitSessionOnce({
      token,
      user,
      role,
      refreshToken:
        normalized.refreshToken,
      sessionData:
        normalized.sessionData,
      source:
        options.source ||
        "login.helpers:syncSession",
    });

    if (
      !verifyCoreSession(
        token,
        user
      )
    ) {
      applyFallbackSession({
        token,
        user,
        role,
        refreshToken:
          normalized.refreshToken,
        sessionData:
          normalized.sessionData,
      });
    }
  }

  try {
    AppCore?.syncUserUI?.();
  } catch {}

  emitSessionSynced({
    user,
    role,
    authenticated:
      true,
    alreadySynced,
    source:
      options.source ||
      "login.helpers:syncSession",
  });

  return {
    token,
    user,
    role,
    authenticated:
      true,
    alreadySynced,
  };
}

/* =========================================================
   REDIRECT
========================================================= */

export function getUrlRedirectParam() {
  if (!isBrowser()) {
    return "";
  }

  try {
    const fromSearch =
      new URLSearchParams(
        window.location.search || ""
      ).get("redirect");

    if (fromSearch) {
      return safeText(fromSearch, "");
    }
  } catch {}

  try {
    const hash =
      window.location.hash || "";

    if (
      hash &&
      hash.includes("?")
    ) {
      const query =
        hash
          .split("?")
          .slice(1)
          .join("?");

      const fromHash =
        new URLSearchParams(
          query
        ).get("redirect");

      if (fromHash) {
        return safeText(fromHash, "");
      }
    }
  } catch {}

  return "";
}

function resolveExplicitRedirect(options = {}) {
  return (
    safeText(options.redirectTo, "") ||
    safeText(options.successRedirect, "") ||
    safeText(options.redirect, "") ||
    safeText(options.target, "") ||
    ""
  );
}

function resolveResponseRedirect(auth = {}) {
  const normalized =
    normalizeAuthResult(auth);

  return (
    safeText(normalized.redirectTo, "") ||
    safeText(normalized.raw?.redirectTo, "") ||
    safeText(normalized.raw?.redirect_to, "") ||
    safeText(normalized.raw?.redirect, "") ||
    safeText(normalized.raw?.next, "") ||
    safeText(normalized.raw?.data?.redirectTo, "") ||
    safeText(normalized.raw?.data?.redirect_to, "") ||
    safeText(normalized.raw?.data?.redirect, "") ||
    safeText(normalized.raw?.auth?.redirectTo, "") ||
    safeText(normalized.raw?.session?.redirectTo, "") ||
    ""
  );
}

export function resolveLoginRedirect(auth = {}, options = {}) {
  const normalized =
    normalizeAuthResult(auth);

  const home =
    getConfiguredHomePath();

  const explicitRedirect =
    resolveExplicitRedirect(options);

  if (explicitRedirect) {
    return ensureSafeRedirect(
      explicitRedirect,
      home
    );
  }

  const queryRedirect =
    getUrlRedirectParam();

  if (queryRedirect) {
    return ensureSafeRedirect(
      queryRedirect,
      home
    );
  }

  if (normalized.requires2FA) {
    const twoFactorPath =
      getConfiguredTwoFactorPath();

    return ensureSafeRedirect(
      normalized.redirectTo ||
        twoFactorPath,
      twoFactorPath,
      {
        allowAuthPaths:
          true,
        allowFallbackAuthPath:
          true,
      }
    );
  }

  const responseRedirect =
    resolveResponseRedirect(normalized);

  if (
    responseRedirect &&
    options.trustAuthRedirect === true &&
    !isRoleDefaultRedirect(responseRedirect)
  ) {
    return ensureSafeRedirect(
      responseRedirect,
      home
    );
  }

  return home;
}

export function shouldRedirectAfterLogin(auth = {}, options = {}) {
  if (options.redirectAfterSuccess === false) {
    return false;
  }

  const normalized =
    normalizeAuthResult(auth);

  if (normalized.navigationHandled === true) {
    return false;
  }

  if (
    !normalized.requires2FA &&
    (
      normalized.explicitFailure ||
      !hasUsableToken(normalized.token) ||
      !hasUsableUser(normalized.user)
    )
  ) {
    return false;
  }

  const target =
    resolveLoginRedirect(
      normalized,
      options
    );

  const current =
    getCurrentBrowserPath();

  return normalizePath(current) !== normalizePath(target);
}

/* =========================================================
   REMEMBER FLOW
========================================================= */

export function persistRememberedIdentifier({
  identifier = "",
  email = "",
  username = "",
  user = "",
  login = "",
  remember = false,
  rememberMe = undefined,
} = {}) {
  const finalIdentifier =
    normalizeIdentifier(identifier) ||
    normalizeIdentifier(email) ||
    normalizeIdentifier(username) ||
    normalizeIdentifier(user) ||
    normalizeIdentifier(login);

  const shouldRemember =
    rememberMe !== undefined
      ? safeBool(rememberMe, false)
      : Boolean(remember);

  if (shouldRemember) {
    saveRememberedIdentifier(finalIdentifier);
    return true;
  }

  clearRememberedIdentifier();
  return false;
}

export function persistRememberedEmail({
  identifier = "",
  email = "",
  remember = false,
  rememberMe = undefined,
} = {}) {
  return persistRememberedIdentifier({
    identifier,
    email,
    remember,
    rememberMe,
  });
}

/* =========================================================
   DEBUG SNAPSHOT
========================================================= */

export function getLoginHelpersSnapshot(auth = null) {
  const normalized =
    auth
      ? normalizeAuthResult(auth)
      : null;

  return {
    version:
      LOGIN_HELPERS_VERSION,

    rememberKey:
      LOGIN_REMEMBER_KEY,

    rememberedIdentifier:
      loadRememberedIdentifier()
        ? "***"
        : "",

    currentPath:
      redactText(
        getCurrentBrowserPath()
      ),

    homePath:
      getConfiguredHomePath(),

    twoFactorPath:
      getConfiguredTwoFactorPath(),

    limits: {
      identifierMaxLength:
        getIdentifierMaxLength(),

      passwordMinLength:
        getLoginPasswordMinLength(),

      passwordMaxLength:
        getLoginPasswordMaxLength(),

      tokenMaxLength:
        getTokenMaxLength(),
    },

    auth:
      normalized
        ? {
            ok:
              normalized.ok,

            status:
              normalized.status,

            explicitFailure:
              normalized.explicitFailure,

            declaredSuccess:
              normalized.declaredSuccess,

            authenticated:
              normalized.authenticated,

            requires2FA:
              normalized.requires2FA,

            hasToken:
              Boolean(normalized.token),

            hasRefreshToken:
              Boolean(normalized.refreshToken),

            hasTempToken:
              Boolean(normalized.tempToken),

            hasUser:
              Boolean(normalized.user),

            usedCoreSession:
              Boolean(normalized.usedCoreSession),

            tokenOnly:
              Boolean(normalized.tokenOnly),

            userOnly:
              Boolean(normalized.userOnly),

            role:
              normalized.role || null,

            redirectTo:
              normalized.redirectTo
                ? redactText(normalized.redirectTo)
                : "",
          }
        : null,

    at:
      safeIsoNow(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  LOGIN_HELPERS_VERSION,

  LOGIN_REMEMBER_KEY,

  safeText,
  safeObject,
  isPlainObject,
  escapeHtml,

  normalizeIdentifier,
  isValidEmail,
  looksLikeEmail,
  slugify,

  normalizePath,
  getCurrentBrowserPath,
  isAuthPath,
  isSafeInternalRedirect,
  ensureSafeRedirect,

  getStorage,
  getNamespacedKey,
  readStorage,
  writeStorage,
  removeStorage,

  loadRememberedIdentifier,
  loadRememberedEmail,
  saveRememberedIdentifier,
  saveRememberedEmail,
  clearRememberedIdentifier,
  clearRememberedEmail,

  createLoginPayload,
  validateLoginPayload,
  getFirstLoginError,

  hasUsableToken,
  hasUsableUser,
  getUserIdentity,

  normalizeAuthResult,
  resolveAuthErrorMessage,

  syncSession,

  getUrlRedirectParam,
  resolveLoginRedirect,
  shouldRedirectAfterLogin,

  persistRememberedIdentifier,
  persistRememberedEmail,

  getLoginHelpersSnapshot,
};
