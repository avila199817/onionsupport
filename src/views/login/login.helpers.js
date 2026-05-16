/* =========================================================
   Onion SPA - Login Helpers
   Archivo: src/views/login/login.helpers.js

   Login helpers limpios:
   - validación mínima
   - payload Auth.login
   - normalización respuesta auth/2FA
   - sesión estricta token+user
   - redirect seguro post-login
   - remember identifier
   - sin DOM, sin HTTP, sin navegación directa
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

export const LOGIN_HELPERS_VERSION = "17.0.0-clean";
export const LOGIN_REMEMBER_KEY = "auth:last-identifier";

const DEFAULT_HOME_PATH = "/";
const DEFAULT_2FA_PATH = "/2fa";

const IDENTIFIER_MAX = 160;
const PASSWORD_MIN = 1;
const PASSWORD_MAX = 1024;
const TOKEN_MAX = 8192;
const REDIRECT_MAX = 2048;

const REMEMBER_KEYS = Object.freeze([
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

const BAD_TOKEN_VALUES = new Set([
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
]);

const TOKEN_KEYS = Object.freeze([
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

const REFRESH_TOKEN_KEYS = Object.freeze([
  "refreshToken",
  "refresh_token",
]);

const TEMP_TOKEN_KEYS = Object.freeze([
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

const USER_KEYS = Object.freeze([
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

const SESSION_KEYS = Object.freeze([
  "session",
  "sessionData",
  "session_data",
  "authSession",
  "auth_session",
]);

const WALK_KEYS = Object.freeze([
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

const USER_ID_KEYS = Object.freeze([
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
  "slug",
  "email",
  "mail",
  "phone",
  "telefono",
  "mobile",
  "cellphone",
]);

const ENVELOPE_KEYS = Object.freeze([
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

const FAILURE_CODES = new Set([
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
  "BAD_CREDENTIALS",
  "CREDENTIALS_INVALID",
  "TOKEN_VERSION_MISMATCH",
]);

const FAILURE_STATUSES = new Set([
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

const SUCCESS_STATUSES = new Set([
  "ok",
  "success",
  "successful",
  "authenticated",
  "active",
  "valid",
  "completed",
  "done",
]);

const TWO_FACTOR_STATUSES = new Set([
  "2fa_required",
  "mfa_required",
  "totp_required",
  "two_factor_required",
  "verification_required",
  "challenge_required",
  "otp_required",
]);

const AUTH_BLOCKED_REDIRECTS = new Set([
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

const ROLE_DEFAULT_REDIRECTS = new Set([
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

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

const TOKENISH_RE =
  /(bearer\s+[a-z0-9._~+/=-]+)|([a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)|([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|tempToken|temp_token|code|t)=)[^&#\s]+/gi;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

export function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;

  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

export function safeObject(value, fallback = {}) {
  return isPlainObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function rawText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === 1) return true;
  if (value === 0) return false;

  const text = safeText(value, "").toLowerCase();

  if (["true", "1", "yes", "si", "sí", "ok", "on", "enabled", "active"].includes(text)) return true;
  if (["false", "0", "no", "off", "disabled", "inactive"].includes(text)) return false;

  return Boolean(fallback);
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    return value;
  }

  return null;
}

function firstText(...values) {
  for (const value of values) {
    const text = safeText(value, "");
    if (text) return text;
  }

  return "";
}

function hasOwn(obj, key) {
  try {
    return Object.prototype.hasOwnProperty.call(obj, key);
  } catch {
    return false;
  }
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function limitText(value = "", max = 1024) {
  return safeText(value, "").slice(0, Math.max(1, safeNumber(max, 1024)));
}

function configNumber(paths = [], fallback = 0) {
  for (const path of safeArray(paths)) {
    let current = AppCore?.config;

    for (const part of safeText(path, "").split(".").filter(Boolean)) {
      current = current?.[part];
    }

    if (current !== undefined && current !== null && current !== "") {
      return safeNumber(current, fallback);
    }
  }

  return fallback;
}

function identifierMax() {
  return Math.max(1, configNumber(["auth.identifierMaxLength", "auth.loginIdentifierMaxLength"], IDENTIFIER_MAX));
}

function passwordMin() {
  return Math.max(1, configNumber(["auth.loginPasswordMinLength", "auth.passwordMinLength"], PASSWORD_MIN));
}

function passwordMax() {
  return Math.max(passwordMin(), configNumber(["auth.loginPasswordMaxLength", "auth.passwordMaxLength"], PASSWORD_MAX));
}

function tokenMax() {
  return Math.max(1, configNumber(["auth.tokenMaxLength"], TOKEN_MAX));
}

/* =========================================================
   REDACTION / HTML
========================================================= */

function redactText(value = "") {
  const text = safeText(value, "");
  if (!text) return "";

  try {
    if (isFunction(AppCore?.utils?.redactTokenInText)) {
      return AppCore.utils.redactTokenInText(text);
    }
  } catch {}

  try {
    return text
      .replace(TOKENISH_RE, (match) => {
        if (/^bearer\s+/i.test(match)) return "Bearer ***";
        if (/^[?&#]/.test(match)) return match.replace(/=.+$/g, "=***");
        return "***";
      })
      .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***");
  } catch {
    return text;
  }
}

export function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeForSnapshot(value, depth = 0, keyHint = "") {
  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) return value ? "***" : null;
  if (depth > 4) return "[depth-limit]";

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") return redactText(value);
  if (typeof value === "function") return "[function]";
  if (value instanceof Error) return { name: value.name || "Error", message: redactText(value.message || "") };

  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) => sanitizeForSnapshot(item, depth + 1, keyHint));
  }

  if (value && typeof value === "object") {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      output[key] = sanitizeForSnapshot(item, depth + 1, key);
    }

    return output;
  }

  return String(value);
}

/* =========================================================
   IDENTIFIER / PAYLOAD
========================================================= */

export function normalizeIdentifier(value = "") {
  return limitText(value, identifierMax() + 1)
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

export function isValidEmail(value = "") {
  const email = safeText(value, "").toLowerCase();
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

export function looksLikeEmail(value = "") {
  return safeText(value, "").includes("@");
}

function looksLikePhone(value = "") {
  return /^\+?\d{6,20}$/.test(safeText(value, "").replace(/[^\d+]/g, ""));
}

function normalizePhone(value = "") {
  return safeText(value, "").replace(/[^\d+]/g, "").slice(0, 32);
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
  const id = (
    normalizeIdentifier(identifier) ||
    normalizeIdentifier(email) ||
    normalizeIdentifier(username) ||
    normalizeIdentifier(user) ||
    normalizeIdentifier(login) ||
    normalizeIdentifier(phone) ||
    normalizeIdentifier(telefono)
  );

  const finalEmail = looksLikeEmail(id) ? id.toLowerCase() : "";
  const finalPhone = !finalEmail && looksLikePhone(id) ? normalizePhone(id) : "";
  const finalUsername = !finalEmail && !finalPhone ? normalizeUsername(id) : "";
  const finalRemember = rememberMe !== undefined ? safeBool(rememberMe, false) : Boolean(remember);

  return {
    identifier: id,
    login: id,

    email: finalEmail,
    username: finalUsername,
    user: finalUsername || id,

    phone: finalPhone,
    telefono: finalPhone,

    /*
      Password intencionadamente sin trim.
      Sólo se valida presencia con .trim().
    */
    password: rawText(password, ""),

    remember: finalRemember,
    rememberMe: finalRemember,

    redirect: safeText(redirect, ""),
  };
}

export function validateLoginPayload(payload = {}) {
  const identifier = normalizeIdentifier(
    payload.identifier ||
      payload.email ||
      payload.username ||
      payload.user ||
      payload.login ||
      payload.phone ||
      payload.telefono ||
      ""
  );

  const password = rawText(payload.password, "");
  const errors = {};

  if (!identifier) {
    errors.identifier = "Introduce tu email o nombre de usuario.";
  } else if (identifier.length > identifierMax()) {
    errors.identifier = "El identificador es demasiado largo.";
  } else if (looksLikeEmail(identifier) && !isValidEmail(identifier)) {
    errors.identifier = "El formato del email no es válido.";
  }

  if (!password.trim()) {
    errors.password = "Introduce tu contraseña.";
  } else if (password.length < passwordMin()) {
    errors.password = `La contraseña debe tener al menos ${passwordMin()} caracteres.`;
  } else if (password.length > passwordMax()) {
    errors.password = "La contraseña es demasiado larga.";
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
   STORAGE / REMEMBER
========================================================= */

export function getStorage() {
  try {
    return AppCore?.storage || null;
  } catch {
    return null;
  }
}

export function getNamespacedKey(key = "") {
  const prefix = safeText(
    AppCore?.config?.storagePrefix ||
      AppCore?.config?.appKey ||
      AppCore?.config?.appId,
    "onion"
  ).replace(/^:+|:+$/g, "") || "onion";

  const clean = safeText(key, "").replace(/^:+/g, "");
  return `${prefix}:${clean}`;
}

function storageCandidates(key = "") {
  const base = [key, getNamespacedKey(key)];

  if (key === LOGIN_REMEMBER_KEY) {
    base.push(
      ...REMEMBER_KEYS,
      ...REMEMBER_KEYS.map(getNamespacedKey)
    );
  }

  return Array.from(new Set(base.map((item) => safeText(item, "")).filter(Boolean)));
}

function unwrapStoredText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const raw = String(value).trim();
    if (!raw) return fallback;

    try {
      return unwrapStoredText(JSON.parse(raw), raw);
    } catch {
      return raw;
    }
  }

  if (isPlainObject(value)) {
    return firstText(
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

export function readStorage(key, fallback = "") {
  const clean = safeText(key, "");
  if (!clean) return fallback;

  const storage = getStorage();

  for (const candidate of storageCandidates(clean)) {
    try {
      const value = unwrapStoredText(storage?.getRaw?.(candidate, ""), "");
      if (value) return value;
    } catch {}

    try {
      const value = unwrapStoredText(storage?.get?.(candidate, ""), "");
      if (value) return value;
    } catch {}

    try {
      const value = unwrapStoredText(storage?.getJson?.(candidate, null), "");
      if (value) return value;
    } catch {}
  }

  if (!isBrowser()) return fallback;

  for (const candidate of storageCandidates(clean)) {
    try {
      const value = unwrapStoredText(window.localStorage?.getItem?.(candidate), "");
      if (value) return value;
    } catch {}

    try {
      const value = unwrapStoredText(window.sessionStorage?.getItem?.(candidate), "");
      if (value) return value;
    } catch {}
  }

  return fallback;
}

export function writeStorage(key, value = "") {
  const clean = safeText(key, "");
  const text = safeText(value, "");

  if (!clean) return false;
  if (!text) return removeStorage(clean);

  const storage = getStorage();

  try {
    if (isFunction(storage?.setRaw)) {
      storage.setRaw(clean, text);
      return true;
    }
  } catch {}

  try {
    if (isFunction(storage?.set)) {
      storage.set(clean, text);
      return true;
    }
  } catch {}

  if (!isBrowser()) return false;

  try {
    window.localStorage?.setItem?.(getNamespacedKey(clean), text);
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key) {
  const clean = safeText(key, "");
  if (!clean) return false;

  const storage = getStorage();
  let removed = false;

  for (const candidate of storageCandidates(clean)) {
    try {
      storage?.remove?.(candidate);
      removed = true;
    } catch {}

    try {
      storage?.delete?.(candidate);
      removed = true;
    } catch {}

    try {
      storage?.del?.(candidate);
      removed = true;
    } catch {}
  }

  if (isBrowser()) {
    for (const candidate of storageCandidates(clean)) {
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

export function loadRememberedIdentifier() {
  return readStorage(LOGIN_REMEMBER_KEY, "");
}

export function loadRememberedEmail() {
  return loadRememberedIdentifier();
}

export function saveRememberedIdentifier(identifier = "") {
  const clean = normalizeIdentifier(identifier);

  if (!clean) return clearRememberedIdentifier();

  return writeStorage(LOGIN_REMEMBER_KEY, clean);
}

export function saveRememberedEmail(email = "") {
  return saveRememberedIdentifier(email);
}

export function clearRememberedIdentifier() {
  return REMEMBER_KEYS.reduce((ok, key) => removeStorage(key) || ok, false);
}

export function clearRememberedEmail() {
  return clearRememberedIdentifier();
}

export function persistRememberedIdentifier({
  identifier = "",
  email = "",
  username = "",
  user = "",
  login = "",
  remember = false,
  rememberMe = undefined,
} = {}) {
  const id =
    normalizeIdentifier(identifier) ||
    normalizeIdentifier(email) ||
    normalizeIdentifier(username) ||
    normalizeIdentifier(user) ||
    normalizeIdentifier(login);

  const shouldRemember = rememberMe !== undefined ? safeBool(rememberMe, false) : Boolean(remember);

  if (shouldRemember) {
    saveRememberedIdentifier(id);
    return true;
  }

  clearRememberedIdentifier();
  return false;
}

export function persistRememberedEmail(payload = {}) {
  return persistRememberedIdentifier(payload);
}

/* =========================================================
   PATH / REDIRECT
========================================================= */

function baseOrigin() {
  if (isBrowser() && window.location?.origin) return window.location.origin;
  return "http://localhost";
}

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");
  if (!raw) return "/";
  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || "/";
  return raw.replace(/^#\/?/, "/") || "/";
}

function normalizePathname(pathname = "/") {
  let value = safeText(pathname, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  const stack = [];

  for (const part of value.split("/").filter(Boolean)) {
    if (part === ".") continue;
    if (part === "..") {
      stack.pop();
      continue;
    }
    stack.push(part);
  }

  value = `/${stack.join("/")}`;
  return value.length > 1 ? value.replace(/\/+$/g, "") : value;
}

function splitPath(path = "/") {
  let raw = safeText(path, "/") || "/";

  if (isHashRouterPath(raw)) raw = normalizeHashRouterPath(raw);

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");
  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex = pathname.indexOf("?");
  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || "/";
  }

  return {
    pathname: normalizePathname(pathname),
    search,
    hash,
  };
}

function pathFromUrlLike(value = "") {
  const raw = safeText(value, "");
  if (!raw) return "";

  if (isHashRouterPath(raw)) return normalizeHashRouterPath(raw);

  try {
    const parsed = new URL(raw, baseOrigin());

    if (parsed.hash && isHashRouterPath(parsed.hash)) {
      return normalizeHashRouterPath(parsed.hash);
    }

    return `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;
  } catch {
    return raw;
  }
}

export function normalizePath(path = "/") {
  try {
    const delegated = AppCore?.utils?.normalizePath?.(path);
    if (delegated) return delegated;
  } catch {}

  const raw = pathFromUrlLike(path) || "/";
  const { pathname, search, hash } = splitPath(raw);

  return `${pathname}${search}${hash}`;
}

function stripSearchAndHash(path = "/") {
  return splitPath(normalizePath(path)).pathname || "/";
}

export function getCurrentBrowserPath() {
  if (!isBrowser()) return "/";

  try {
    const hash = window.location.hash || "";

    if (isHashRouterPath(hash)) return normalizePath(hash);

    return normalizePath(`${window.location.pathname || "/"}${window.location.search || ""}${hash}`);
  } catch {
    return "/";
  }
}

export function isAuthPath(path = "") {
  const clean = stripSearchAndHash(path).toLowerCase();

  if (AUTH_BLOCKED_REDIRECTS.has(clean)) return true;

  return (
    clean.startsWith("/login/") ||
    clean.startsWith("/logout/") ||
    clean.startsWith("/reset-password/") ||
    clean.startsWith("/forgot-password/") ||
    clean.startsWith("/recover-password/") ||
    clean.startsWith("/password-reset/") ||
    clean.startsWith("/activate-account/") ||
    clean.startsWith("/activate/") ||
    clean.startsWith("/activation/") ||
    clean.startsWith("/account/activate/") ||
    clean.startsWith("/2fa/") ||
    clean.startsWith("/otp/") ||
    clean.startsWith("/mfa/")
  );
}

function hasOpenRedirectRisk(value = "") {
  const raw = safeText(value, "");

  if (!raw) return true;
  if (raw.startsWith("//")) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return true;
  if (/[\r\n\t\\]/.test(raw)) return true;

  const lower = raw.toLowerCase();

  if (
    lower.includes("%0d") ||
    lower.includes("%0a") ||
    lower.includes("%09") ||
    lower.includes("%5c")
  ) {
    return true;
  }

  try {
    const decoded = decodeURIComponent(raw).trim().replace(/\\/g, "/");

    return (
      decoded.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:/i.test(decoded) ||
      /[\r\n\t]/.test(decoded)
    );
  } catch {
    return true;
  }
}

export function isSafeInternalRedirect(path = "", options = {}) {
  const opts = safeObject(options);
  const value = safeText(path, "").slice(0, REDIRECT_MAX);

  if (!value || !value.startsWith("/")) return false;
  if (hasOpenRedirectRisk(value)) return false;

  const normalized = normalizePath(value);

  if (opts.allowAuthPaths !== true && isAuthPath(normalized)) return false;

  return true;
}

export function ensureSafeRedirect(path = "", fallback = DEFAULT_HOME_PATH, options = {}) {
  const fallbackPath = isSafeInternalRedirect(fallback, {
    allowAuthPaths: options.allowFallbackAuthPath === true,
  })
    ? normalizePath(fallback)
    : DEFAULT_HOME_PATH;

  const candidate = normalizePath(path || "");

  return isSafeInternalRedirect(candidate, options)
    ? candidate
    : fallbackPath;
}

function isRoleDefaultRedirect(path = "") {
  const clean = stripSearchAndHash(path).toLowerCase();

  return ROLE_DEFAULT_REDIRECTS.has(clean) || /^\/@[^/]+\/?$/i.test(clean);
}

function configuredHome() {
  const home = normalizePath(
    AppCore?.config?.routes?.home ||
      AppCore?.config?.auth?.homeRoute ||
      AppCore?.config?.auth?.postLoginFallback ||
      DEFAULT_HOME_PATH
  );

  return home && !isAuthPath(home) && !isRoleDefaultRedirect(home)
    ? home
    : DEFAULT_HOME_PATH;
}

function configured2FA() {
  const target = normalizePath(
    AppCore?.config?.routes?.twoFactor ||
      AppCore?.config?.routes?.mfa ||
      AppCore?.config?.auth?.twoFactorRoute ||
      DEFAULT_2FA_PATH
  );

  return isSafeInternalRedirect(target, {
    allowAuthPaths: true,
  })
    ? target
    : DEFAULT_2FA_PATH;
}

export function getUrlRedirectParam() {
  if (!isBrowser()) return "";

  try {
    const value = new URLSearchParams(window.location.search || "").get("redirect");
    if (value) return safeText(value, "");
  } catch {}

  try {
    const hash = window.location.hash || "";

    if (hash.includes("?")) {
      const query = hash.split("?").slice(1).join("?");
      const value = new URLSearchParams(query).get("redirect");
      if (value) return safeText(value, "");
    }
  } catch {}

  return "";
}

/* =========================================================
   AUTH WALK / EXTRACTION
========================================================= */

function collectObjects(payload = null) {
  const out = [];
  const seen = new WeakSet();
  const queue = [payload];

  let guard = 0;

  while (queue.length && guard < 140) {
    guard += 1;

    const current = queue.shift();

    if (!current || typeof current !== "object") continue;

    try {
      if (seen.has(current)) continue;
      seen.add(current);
    } catch {}

    out.push(current);

    for (const key of WALK_KEYS) {
      const child = current[key];
      if (child && typeof child === "object") queue.push(child);
    }

    if (current.response?.data && typeof current.response.data === "object") queue.push(current.response.data);
    if (current.auth?.data && typeof current.auth.data === "object") queue.push(current.auth.data);
    if (current.session?.data && typeof current.session.data === "object") queue.push(current.session.data);
  }

  return out;
}

function pickValue(objects = [], keys = []) {
  for (const object of safeArray(objects)) {
    if (!object || typeof object !== "object") continue;

    for (const key of keys) {
      const value = object[key];

      if (
        value !== null &&
        value !== undefined &&
        !(typeof value === "string" && value.trim() === "")
      ) {
        return value;
      }
    }
  }

  return undefined;
}

function pickText(objects = [], keys = []) {
  return safeText(pickValue(objects, keys), "");
}

function pickObject(objects = [], keys = []) {
  for (const object of safeArray(objects)) {
    if (!object || typeof object !== "object") continue;

    for (const key of keys) {
      if (isPlainObject(object[key])) return object[key];
    }
  }

  return null;
}

/* =========================================================
   TOKEN / USER
========================================================= */

function normalizeToken(token = null) {
  if (token === null || token === undefined) return "";

  let value = String(token).trim();

  if (/^bearer\s+/i.test(value)) {
    value = value.replace(/^bearer\s+/i, "").trim();
  }

  if (!value) return "";
  if (BAD_TOKEN_VALUES.has(value.toLowerCase())) return "";
  if (/[\s\r\n\t]/.test(value)) return "";
  if (value.length > tokenMax()) return "";

  return value;
}

export function hasUsableToken(token = "") {
  const value = normalizeToken(token);
  if (!value) return false;

  try {
    if (isFunction(AppCore?.utils?.hasValidToken)) {
      return Boolean(AppCore.utils.hasValidToken(value));
    }
  } catch {}

  return true;
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

function userActive(user = null) {
  if (!isPlainObject(user)) return false;

  const status = normalizeRole(
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

  return !(
    user.active === false ||
    user.enabled === false ||
    user.disabled === true ||
    user.deleted === true ||
    user.blocked === true ||
    user.locked === true ||
    user.suspended === true ||
    user.banned === true ||
    user.archived === true
  );
}

function hasIdentity(value = {}) {
  if (!isPlainObject(value)) return false;

  return USER_ID_KEYS.some((key) => Boolean(safeText(value[key], "")));
}

function hasNestedIdentity(value = {}) {
  if (!isPlainObject(value)) return false;

  return [
    value,
    value.user,
    value.usuario,
    value.me,
    value.account,
    value.profile,
    value.currentUser,
    value.authUser,
    value.sessionUser,
    value.raw,
    value.raw?.user,
    value.raw?.profile,
  ].some(hasIdentity);
}

function isEnvelope(value = {}) {
  if (!isPlainObject(value)) return false;
  return ENVELOPE_KEYS.some((key) => hasOwn(value, key));
}

function sanitizeUserRaw(value = {}, depth = 0, seen = new WeakSet()) {
  if (depth > 4 || !isPlainObject(value)) return {};

  try {
    if (seen.has(value)) return {};
    seen.add(value);
  } catch {}

  const output = {};

  for (const [key, item] of Object.entries(value).slice(0, 160)) {
    if (SENSITIVE_KEY_RE.test(key)) continue;

    if (Array.isArray(item)) {
      output[key] = item.slice(0, 100).map((entry) => (
        isPlainObject(entry)
          ? sanitizeUserRaw(entry, depth + 1, seen)
          : entry
      ));
      continue;
    }

    if (isPlainObject(item)) {
      output[key] = sanitizeUserRaw(item, depth + 1, seen);
      continue;
    }

    output[key] = item;
  }

  return output;
}

function fallbackNormalizeUser(user = {}) {
  if (!isPlainObject(user) || !hasNestedIdentity(user)) return null;

  const profile = safeObject(user.profile);
  const raw = safeObject(user.raw);

  const id = first(
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

  const email = firstText(
    user.email,
    user.mail,
    user.emailLower,
    user.email_lower,
    profile.email,
    profile.mail,
    raw.email,
    raw.mail
  );

  const username = normalizeUsername(
    firstText(
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

  const displayName = firstText(
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

  const role = normalizeRole(
    firstText(
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

  const clean = sanitizeUserRaw(user);

  return {
    ...clean,

    id,

    userId: user.userId ?? user.user_id ?? id,
    user_id: user.user_id ?? user.userId ?? id,
    uid: user.uid ?? id,
    sub: user.sub ?? id,

    username,
    usernameLower: user.usernameLower || user.username_lower || username || null,
    username_lower: user.username_lower || user.usernameLower || username || null,

    slug: normalizeUsername(firstText(user.slug, profile.slug, raw.slug, username, slugify(displayName))),

    name: displayName,
    nombre: user.nombre || displayName,
    displayName,

    email,
    emailLower: firstText(user.emailLower, user.email_lower, email).toLowerCase(),
    email_lower: firstText(user.email_lower, user.emailLower, email).toLowerCase(),

    role,
    rol: role,
    roles: Array.isArray(user.roles) ? user.roles : role ? [role] : [],

    active: userActive(user),
  };
}

function normalizeUserCandidate(user = null) {
  if (!isPlainObject(user)) return null;

  if (isEnvelope(user) && !hasNestedIdentity(user)) return null;

  try {
    const normalized = AppCore?.utils?.normalizeUser?.(user);
    if (hasUsableUser(normalized)) return normalized;
  } catch {}

  const fallback = fallbackNormalizeUser(user);
  return hasUsableUser(fallback) ? fallback : null;
}

export function hasUsableUser(user = {}) {
  if (!isPlainObject(user)) return false;
  if (!userActive(user)) return false;

  return USER_ID_KEYS.some((key) => Boolean(safeText(user[key], "")));
}

export function getUserIdentity(user = {}) {
  if (!isPlainObject(user)) return "";

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

function extractUser(raw = {}) {
  const objects = collectObjects(raw);
  const candidates = [];

  for (const object of objects) {
    for (const key of USER_KEYS) {
      if (isPlainObject(object?.[key])) candidates.push(object[key]);
    }
  }

  for (const object of objects) {
    if (isPlainObject(object) && hasNestedIdentity(object)) candidates.push(object);
  }

  for (const candidate of candidates) {
    const user = normalizeUserCandidate(candidate);
    if (user) return user;
  }

  return null;
}

function currentToken() {
  return normalizeToken(
    AppCore?.state?.token ||
      AppCore?.state?.accessToken ||
      AppCore?.state?.access_token ||
      AppCore?.state?.auth?.token ||
      AppCore?.state?.session?.token ||
      AppCore?.state?.session?.accessToken ||
      ""
  );
}

function currentUser() {
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

function currentAuthenticated() {
  return Boolean(
    AppCore?.state?.authenticated === true ||
      AppCore?.state?.auth?.authenticated === true ||
      AppCore?.state?.session?.authenticated === true
  );
}

/* =========================================================
   AUTH NORMALIZATION
========================================================= */

function extractStatus(raw = {}) {
  return pickValue(collectObjects(raw), ["status", "statusCode", "status_code", "state", "estado"]);
}

function statusKey(value = "") {
  const raw = safeText(value, "").toLowerCase();

  if (!raw || Number.isFinite(Number(raw))) return "";

  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function extractCode(raw = {}) {
  return pickText(collectObjects(raw), ["code", "errorCode", "error_code", "error"]);
}

function extractMessage(raw = {}) {
  for (const object of collectObjects(raw)) {
    const value = pickValue(object ? [object] : [], [
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
    ]);

    if (typeof value === "string" || typeof value === "number") {
      const text = safeText(value, "");
      if (text && text !== "[object Object]") return text;
    }

    if (isPlainObject(value)) {
      const text = firstText(value.message, value.mensaje, value.detail, value.description, value.title, value.code, value.error);
      if (text) return text;
    }
  }

  return "";
}

function explicitFailure(raw = {}) {
  const objects = collectObjects(raw);
  const statusValue = extractStatus(raw);
  const numeric = Number(statusValue || 0);

  if (Number.isFinite(numeric) && numeric >= 400) return true;

  const status = statusKey(statusValue);
  if (status && FAILURE_STATUSES.has(status)) return true;

  const code = safeText(extractCode(raw), "").toUpperCase();
  if (code && FAILURE_CODES.has(code)) return true;

  return objects.some((object) => (
    object?.ok === false ||
    object?.success === false ||
    (
      object?.authenticated === false &&
      ["unauthorized", "auth_error", "not_authenticated"].includes(status)
    )
  ));
}

function declaredSuccess(raw = {}) {
  const objects = collectObjects(raw);
  const status = statusKey(extractStatus(raw));

  if (status && SUCCESS_STATUSES.has(status)) return true;

  return objects.some((object) => (
    object?.ok === true ||
    object?.success === true ||
    object?.authenticated === true ||
    object?.status === true
  ));
}

function requires2FA(raw = {}, { tempToken = "", token = "", user = null } = {}) {
  const objects = collectObjects(raw);
  const status = statusKey(extractStatus(raw));

  if (TWO_FACTOR_STATUSES.has(status)) return true;

  const flags = [
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

  if (objects.some((object) => flags.some((key) => safeBool(object?.[key], false)))) {
    return true;
  }

  return Boolean(tempToken && !(token && hasUsableUser(user)));
}

function fillFromCoreSession({ token = "", user = null, success = false, failed = false } = {}) {
  if (failed || !success) {
    return { token, user, usedCoreSession: false };
  }

  const stateToken = currentToken();
  const stateUser = normalizeUserCandidate(currentUser());
  const stateIdentity = getUserIdentity(stateUser || {});
  const rawIdentity = getUserIdentity(user || {});

  if (!token && !user && currentAuthenticated() && hasUsableToken(stateToken) && hasUsableUser(stateUser)) {
    return { token: stateToken, user: stateUser, usedCoreSession: true };
  }

  if (token && !user && stateToken === token && hasUsableUser(stateUser)) {
    return { token, user: stateUser, usedCoreSession: true };
  }

  if (user && !token && rawIdentity && stateIdentity && rawIdentity === stateIdentity && hasUsableToken(stateToken)) {
    return { token: stateToken, user, usedCoreSession: true };
  }

  return { token, user, usedCoreSession: false };
}

export function normalizeAuthResult(result = {}) {
  const raw = result && typeof result === "object"
    ? result
    : { message: safeText(result, "") };

  const objects = collectObjects(raw);

  let token = normalizeToken(pickText(objects, TOKEN_KEYS));
  const refreshToken = normalizeToken(pickText(objects, REFRESH_TOKEN_KEYS));
  let tempToken = normalizeToken(pickText(objects, TEMP_TOKEN_KEYS));

  let user = extractUser(raw);

  const failed = explicitFailure(raw);
  const success = declaredSuccess(raw);
  const message = extractMessage(raw);
  const code = extractCode(raw);
  const statusValue = extractStatus(raw);
  const status = statusKey(statusValue);

  const filled = fillFromCoreSession({
    token,
    user,
    success,
    failed,
  });

  token = filled.token;
  user = filled.user;

  let need2FA = requires2FA(raw, {
    tempToken,
    token,
    user,
  });

  if (need2FA && !tempToken && token && !hasUsableUser(user)) {
    tempToken = token;
    token = "";
  }

  if (need2FA) token = "";

  const authenticated = Boolean(
    !failed &&
      !need2FA &&
      hasUsableToken(token) &&
      hasUsableUser(user)
  );

  const tokenOnly = Boolean(!failed && !need2FA && hasUsableToken(token) && !hasUsableUser(user));
  const userOnly = Boolean(!failed && !need2FA && !hasUsableToken(token) && hasUsableUser(user));

  const redirectTo = pickText(objects, [
    "redirectTo",
    "redirect_to",
    "redirect",
    "returnTo",
    "return_to",
    "next",
    "nextPath",
    "next_path",
    "target",
  ]);

  const sessionData = pickObject(objects, SESSION_KEYS);

  const navigationHandled = objects.some((object) => (
    safeBool(object.navigationHandled, false) ||
    safeBool(object.navigated, false) ||
    safeBool(object.didNavigate, false) ||
    safeBool(object.redirected, false)
  ));

  const role = normalizeRole(
    firstText(
      pickText(objects, ["role", "rol", "userRole", "user_role", "type", "tipo", "perfil"]),
      user?.role,
      user?.rol
    )
  );

  const ok = failed ? false : Boolean(authenticated || need2FA);

  return {
    raw: result,

    ok,
    success: ok,
    explicitFailure: failed,
    declaredSuccess: success,

    status: safeText(
      statusValue,
      failed
        ? "auth_failed"
        : need2FA
          ? "2fa_required"
          : authenticated
            ? "authenticated"
            : tokenOnly
              ? "token_only"
              : userOnly
                ? "user_only"
                : SUCCESS_STATUSES.has(status)
                  ? status
                  : success
                    ? "success_without_session"
                    : ""
    ),

    code: safeText(code, ""),
    message: safeText(message, ""),

    token,
    accessToken: token,
    access_token: token,

    refreshToken,
    refresh_token: refreshToken,

    tempToken,
    temp_token: tempToken,

    sessionData,
    session: sessionData,

    user,
    usuario: user,

    role,

    redirectTo: safeText(redirectTo, ""),

    requires2FA: Boolean(need2FA),
    authenticated,
    tokenOnly,
    userOnly,

    usedCoreSession: Boolean(filled.usedCoreSession),
    navigationHandled,
  };
}

export function resolveAuthErrorMessage(error) {
  const normalized = normalizeAuthResult(error);

  const code = (
    safeText(error?.data?.code, "") ||
    safeText(error?.data?.error, "") ||
    safeText(error?.response?.data?.code, "") ||
    safeText(error?.response?.data?.error, "") ||
    safeText(error?.code, "") ||
    safeText(normalized.code, "")
  ).toUpperCase();

  const backendMessage =
    safeText(error?.data?.message, "") ||
    safeText(error?.data?.mensaje, "") ||
    safeText(error?.response?.data?.message, "") ||
    safeText(error?.response?.data?.mensaje, "") ||
    safeText(error?.message, "") ||
    safeText(error?.statusText, "") ||
    safeText(normalized.message, "");

  if (backendMessage && backendMessage !== "[object Object]") {
    return redactText(backendMessage);
  }

  switch (code) {
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
   Thin compatibility wrapper. Auth/Core remain owners.
========================================================= */

function invalidSessionError(message = "Login inválido: sesión incompleta.") {
  const error = new Error(message);

  error.name = "LoginSessionError";
  error.status = 401;
  error.code = "INVALID_LOGIN_SESSION";
  error.data = {
    code: "INVALID_LOGIN_SESSION",
    message,
  };

  return error;
}

function alreadySynced(token = "", user = null) {
  const currentIdentity = getUserIdentity(currentUser() || {});
  const nextIdentity = getUserIdentity(user || {});

  return Boolean(
    currentAuthenticated() &&
      currentToken() === token &&
      currentIdentity &&
      nextIdentity &&
      currentIdentity === nextIdentity
  );
}

function fallbackApplySession({ token, user, role = "", refreshToken = "", sessionData = null } = {}) {
  const patch = {
    token,
    accessToken: token,
    access_token: token,

    refreshToken: refreshToken || null,
    refresh_token: refreshToken || null,

    user,
    currentUser: user,
    authUser: user,
    sessionUser: user,

    role: role || user?.role || user?.rol || "",
    rol: role || user?.role || user?.rol || "",
    userRole: role || user?.role || user?.rol || "",

    authenticated: true,
    hasToken: true,

    session: {
      ...safeObject(AppCore?.state?.session),
      token,
      accessToken: token,
      access_token: token,
      refreshToken: refreshToken || null,
      refresh_token: refreshToken || null,
      user,
      role: role || user?.role || user?.rol || "",
      authenticated: true,
      data: sessionData || undefined,
    },
  };

  try {
    AppCore?.setState?.(patch, {
      source: "login.helpers:fallback-session",
      allowExplicitAuthenticated: true,
      forceAuthenticated: true,
      emitDerived: true,
    });

    return true;
  } catch {}

  try {
    Object.assign(AppCore.state, patch);
    return true;
  } catch {
    return false;
  }
}

export function syncSession(auth = {}, options = {}) {
  const normalized = normalizeAuthResult(auth);

  if (normalized.requires2FA && !normalized.token) {
    return {
      token: "",
      user: null,
      role: "",
      authenticated: false,
      requires2FA: true,
      tempToken: normalized.tempToken || "",
      alreadySynced: false,
    };
  }

  if (normalized.explicitFailure || normalized.ok === false) {
    throw invalidSessionError(normalized.message || "No se pudo iniciar sesión.");
  }

  if (!hasUsableToken(normalized.token)) {
    throw invalidSessionError("No se recibió token de autenticación.");
  }

  if (!hasUsableUser(normalized.user)) {
    throw invalidSessionError("No se recibió usuario válido para la sesión.");
  }

  const token = normalizeToken(normalized.token);
  const user = normalized.user;
  const role = normalized.role || user?.role || user?.rol || "";
  const synced = alreadySynced(token, user);

  if (!synced) {
    try {
      AppCore?.applySession?.(
        {
          token,
          accessToken: token,
          access_token: token,

          refreshToken: normalized.refreshToken || null,
          refresh_token: normalized.refreshToken || null,

          user,
          usuario: user,
          me: user,
          account: user,
          profile: user,

          role,
          rol: role,

          session: normalized.sessionData || null,
          sessionData: normalized.sessionData || null,

          authenticated: true,
          source: options.source || "login.helpers:syncSession",
        },
        {
          source: options.source || "login.helpers:syncSession",
          allowExplicitAuthenticated: true,
          forceAuthenticated: true,
        }
      );
    } catch {
      fallbackApplySession({
        token,
        user,
        role,
        refreshToken: normalized.refreshToken,
        sessionData: normalized.sessionData,
      });
    }

    if (!alreadySynced(token, user)) {
      fallbackApplySession({
        token,
        user,
        role,
        refreshToken: normalized.refreshToken,
        sessionData: normalized.sessionData,
      });
    }
  }

  try {
    AppCore?.syncUserUI?.();
  } catch {}

  try {
    AppCore?.events?.emit?.("auth:login:session-synced", {
      authenticated: true,
      alreadySynced: synced,
      userId: getUserIdentity(user) || null,
      role: role || null,
      source: options.source || "login.helpers:syncSession",
      at: nowIso(),
    });
  } catch {}

  return {
    token,
    user,
    role,
    authenticated: true,
    alreadySynced: synced,
  };
}

/* =========================================================
   REDIRECT RESOLUTION
========================================================= */

function explicitRedirect(options = {}) {
  return (
    safeText(options.redirectTo, "") ||
    safeText(options.successRedirect, "") ||
    safeText(options.redirect, "") ||
    safeText(options.target, "") ||
    ""
  );
}

export function resolveLoginRedirect(auth = {}, options = {}) {
  const normalized = normalizeAuthResult(auth);
  const home = configuredHome();

  const explicit = explicitRedirect(options);

  if (explicit) {
    return ensureSafeRedirect(explicit, home);
  }

  const queryRedirect = getUrlRedirectParam();

  if (queryRedirect) {
    return ensureSafeRedirect(queryRedirect, home);
  }

  if (normalized.requires2FA) {
    const twoFactor = configured2FA();

    return ensureSafeRedirect(
      normalized.redirectTo || twoFactor,
      twoFactor,
      {
        allowAuthPaths: true,
        allowFallbackAuthPath: true,
      }
    );
  }

  if (
    normalized.redirectTo &&
    options.trustAuthRedirect === true &&
    !isRoleDefaultRedirect(normalized.redirectTo)
  ) {
    return ensureSafeRedirect(normalized.redirectTo, home);
  }

  return home;
}

export function shouldRedirectAfterLogin(auth = {}, options = {}) {
  if (options.redirectAfterSuccess === false) return false;

  const normalized = normalizeAuthResult(auth);

  if (normalized.navigationHandled) return false;

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

  return normalizePath(getCurrentBrowserPath()) !== normalizePath(resolveLoginRedirect(normalized, options));
}

/* =========================================================
   UI STATE HELPERS
========================================================= */

export function createLoginUiState(overrides = {}) {
  return {
    loading: false,
    submitting: false,
    success: false,
    error: "",
    message: "",
    requires2FA: false,
    redirectTo: "",
    ...safeObject(overrides),
  };
}

export function setLoginLoading(uiState = {}, loading = true) {
  return {
    ...safeObject(uiState),
    loading: Boolean(loading),
    submitting: Boolean(loading),
    error: Boolean(loading) ? "" : safeText(uiState.error, ""),
  };
}

export function setLoginError(uiState = {}, error = "") {
  return {
    ...safeObject(uiState),
    loading: false,
    submitting: false,
    success: false,
    error: redactText(safeText(error, "No se ha podido iniciar sesión.")),
  };
}

export function setLoginSuccess(uiState = {}, message = "Sesión iniciada.") {
  return {
    ...safeObject(uiState),
    loading: false,
    submitting: false,
    success: true,
    error: "",
    message: safeText(message, "Sesión iniciada."),
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getLoginHelpersSnapshot(auth = null) {
  const normalized = auth ? normalizeAuthResult(auth) : null;

  return sanitizeForSnapshot({
    version: LOGIN_HELPERS_VERSION,

    rememberKey: LOGIN_REMEMBER_KEY,
    rememberedIdentifier: loadRememberedIdentifier() ? "***" : "",

    currentPath: getCurrentBrowserPath(),
    homePath: configuredHome(),
    twoFactorPath: configured2FA(),

    limits: {
      identifierMaxLength: identifierMax(),
      passwordMinLength: passwordMin(),
      passwordMaxLength: passwordMax(),
      tokenMaxLength: tokenMax(),
    },

    auth: normalized
      ? {
          ok: normalized.ok,
          status: normalized.status,
          explicitFailure: normalized.explicitFailure,
          declaredSuccess: normalized.declaredSuccess,
          authenticated: normalized.authenticated,
          requires2FA: normalized.requires2FA,
          hasToken: Boolean(normalized.token),
          hasRefreshToken: Boolean(normalized.refreshToken),
          hasTempToken: Boolean(normalized.tempToken),
          hasUser: Boolean(normalized.user),
          usedCoreSession: Boolean(normalized.usedCoreSession),
          tokenOnly: Boolean(normalized.tokenOnly),
          userOnly: Boolean(normalized.userOnly),
          role: normalized.role || null,
          redirectTo: normalized.redirectTo || "",
        }
      : null,

    at: nowIso(),
  });
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

  createLoginUiState,
  setLoginLoading,
  setLoginError,
  setLoginSuccess,

  getLoginHelpersSnapshot,
};
