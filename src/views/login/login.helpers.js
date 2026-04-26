/* =========================================================
   Onion SPA - Login Helpers
   Archivo: src/views/login/login.helpers.js

   Responsabilidades:
   - helpers puros del login
   - validación de credenciales
   - persistencia del identificador recordado
   - normalización estricta de respuesta auth
   - sincronización idempotente de sesión con AppCore real
   - resolución segura de redirect post-login
   - evitar redirect automático por rol hacia /usuarios
   - evitar redirect automático por slug hacia /@usuario
   - compatibilidad con login por usuario o correo
   - tolerancia a 2FA
   - evitar doble emisión / doble sync innecesario

   FIX 10/10:
   - no mezclar respuesta nueva con AppCore.state.user antiguo
   - no aceptar sesión autenticada sin token usable
   - no aceptar sesión autenticada sin usuario identificable
   - detectar payloads ok:false / success:false / status >= 400
   - soportar respuestas backend heterogéneas y anidadas
   - no usar /usuarios, /clientes, /facturas, /incidencias ni /@slug
     como redirect por defecto
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   CONST
========================================================= */

export const LOGIN_REMEMBER_KEY = "auth:last-identifier";

const DEFAULT_HOME_PATH = "/";
const DEFAULT_2FA_PATH = "/2fa";

const AUTH_BLOCKED_REDIRECTS = new Set([
  "/login",
  "/reset-password",
  "/reset-password/confirm",
  "/forgot-password",
  "/recover-password",
  "/password-reset",
  "/activate-account",
]);

const ROLE_DEFAULT_REDIRECTS = new Set([
  "/usuarios",
  "/clientes",
  "/facturas",
  "/incidencias",
  "/servidor",
]);

const AUTH_FAILURE_CODES = new Set([
  "INVALID_CREDENTIALS",
  "MISSING_CREDENTIALS",
  "ACCOUNT_TEMPORARILY_LOCKED",
  "ACCOUNT_DISABLED",
  "USER_DISABLED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "TOKEN_INVALID",
  "INVALID_TOKEN",
  "SESSION_EXPIRED",
]);

/* =========================================================
   BASICS
========================================================= */

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

export function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
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

export function normalizeIdentifier(value = "") {
  return safeText(value, "");
}

export function isValidEmail(value = "") {
  const email = safeText(value, "").toLowerCase();

  if (!email) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function looksLikeEmail(value = "") {
  return safeText(value, "").includes("@");
}

export function slugify(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function getBaseOrigin() {
  if (isBrowser() && window.location?.origin) {
    return window.location.origin;
  }

  return "http://localhost";
}

function pickFirstText(...values) {
  for (const value of values) {
    const text = safeText(value, "");

    if (text) {
      return text;
    }
  }

  return "";
}

function pickFirstValue(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }

  return "";
}

function pickFirstObject(...values) {
  for (const value of values) {
    if (isPlainObject(value)) {
      return value;
    }
  }

  return null;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  const text = safeText(value, "").toLowerCase();

  if (["true", "1", "yes", "si", "sí", "ok"].includes(text)) {
    return true;
  }

  if (["false", "0", "no"].includes(text)) {
    return false;
  }

  return Boolean(fallback);
}

function normalizePathnameOnly(pathname = "/") {
  let value = String(pathname || "/")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (value.length > 1 && value.endsWith("/")) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function splitPath(path = "/") {
  const raw = safeText(path, "/");

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
    pathname: normalizePathnameOnly(pathname),
    search,
    hash,
  };
}

export function normalizePath(path = "/") {
  const raw = safeText(path, "/") || "/";

  try {
    if (typeof AppCore?.utils?.normalizePath === "function") {
      const normalized = AppCore.utils.normalizePath(raw);

      if (normalized) {
        return normalized;
      }
    }
  } catch {}

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw, getBaseOrigin());

      return normalizePath(
        `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`
      );
    }
  } catch {}

  if (raw === "/") {
    return "/";
  }

  const { pathname, search, hash } = splitPath(raw);

  return `${pathname}${search}${hash}`;
}

export function getCurrentBrowserPath() {
  if (!isBrowser()) {
    return "/";
  }

  try {
    return normalizePath(
      `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
    );
  } catch {
    return "/";
  }
}

export function isAuthPath(path = "") {
  const normalized = normalizePath(path);
  const clean = splitPath(normalized).pathname;

  if (AUTH_BLOCKED_REDIRECTS.has(clean)) {
    return true;
  }

  return (
    clean.startsWith("/login/") ||
    clean.startsWith("/reset-password/") ||
    clean.startsWith("/forgot-password/") ||
    clean.startsWith("/recover-password/") ||
    clean.startsWith("/password-reset/") ||
    clean.startsWith("/activate-account/")
  );
}

export function isSafeInternalRedirect(path = "") {
  const value = safeText(path, "").trim();

  if (!value) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (/^(javascript:|data:|vbscript:)/i.test(value)) return false;

  const normalized = normalizePath(value);

  if (isAuthPath(normalized)) {
    return false;
  }

  return true;
}

export function ensureSafeRedirect(path = "", fallback = DEFAULT_HOME_PATH) {
  const normalizedFallback = normalizePath(fallback || DEFAULT_HOME_PATH);
  const normalizedPath = normalizePath(path || "");

  if (!isSafeInternalRedirect(normalizedPath)) {
    return normalizedFallback;
  }

  return normalizedPath;
}

function isRoleDefaultRedirect(path = "") {
  const normalized = normalizePath(path);
  const clean = splitPath(normalized).pathname;

  if (ROLE_DEFAULT_REDIRECTS.has(clean)) {
    return true;
  }

  /*
    Evita que el login mande por defecto a /@slug.
    El home puede construir contexto público si el router lo necesita.
  */
  if (/^\/@[^/]+(?:\/)?$/i.test(clean)) {
    return true;
  }

  return false;
}

function getConfiguredHomePath() {
  const configured = normalizePath(
    AppCore?.config?.routes?.home ||
      AppCore?.config?.homePath ||
      DEFAULT_HOME_PATH
  );

  /*
    Blindaje:
    aunque config.homePath venga como /usuarios, /facturas, etc.,
    el login no debe usarlo como default post-login.
  */
  if (
    !configured ||
    isAuthPath(configured) ||
    isRoleDefaultRedirect(configured)
  ) {
    return DEFAULT_HOME_PATH;
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
  const prefix = safeText(
    AppCore?.config?.storagePrefix,
    "onion"
  );

  return `${prefix}:${safeText(key, "")}`;
}

export function readStorage(key, fallback = "") {
  try {
    const storage = getStorage();

    if (typeof storage?.get === "function") {
      return safeText(storage.get(key), fallback);
    }

    if (!isBrowser()) {
      return fallback;
    }

    return safeText(
      window.localStorage.getItem(getNamespacedKey(key)),
      fallback
    );
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value = "") {
  try {
    const storage = getStorage();
    const finalValue = safeText(value, "");

    if (typeof storage?.set === "function") {
      storage.set(key, finalValue);
      return true;
    }

    if (!isBrowser()) {
      return false;
    }

    window.localStorage.setItem(
      getNamespacedKey(key),
      finalValue
    );

    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key) {
  try {
    const storage = getStorage();

    if (typeof storage?.remove === "function") {
      storage.remove(key);
      return true;
    }

    if (!isBrowser()) {
      return false;
    }

    window.localStorage.removeItem(
      getNamespacedKey(key)
    );

    return true;
  } catch {
    return false;
  }
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

/*
  Compat legacy:
  mantenemos loadRememberedEmail para no romper imports existentes,
  aunque ya trabajamos con identifier.
*/
export function loadRememberedEmail() {
  return loadRememberedIdentifier();
}

export function saveRememberedIdentifier(identifier = "") {
  return writeStorage(
    LOGIN_REMEMBER_KEY,
    normalizeIdentifier(identifier)
  );
}

export function saveRememberedEmail(email = "") {
  return saveRememberedIdentifier(email);
}

export function clearRememberedIdentifier() {
  return removeStorage(
    LOGIN_REMEMBER_KEY
  );
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
  password = "",
  remember = false,
  redirect = "",
} = {}) {
  const normalizedIdentifier =
    normalizeIdentifier(identifier) ||
    normalizeIdentifier(email) ||
    normalizeIdentifier(username) ||
    normalizeIdentifier(user);

  const normalizedPassword = String(password || "");

  return {
    identifier: normalizedIdentifier,

    email: looksLikeEmail(normalizedIdentifier)
      ? normalizedIdentifier.toLowerCase()
      : "",

    username: !looksLikeEmail(normalizedIdentifier)
      ? normalizedIdentifier
      : "",

    user: !looksLikeEmail(normalizedIdentifier)
      ? normalizedIdentifier
      : "",

    password: normalizedPassword,
    remember: Boolean(remember),
    redirect: safeText(redirect, ""),
  };
}

/* =========================================================
   VALIDATION
========================================================= */

export function validateLoginPayload(payload = {}) {
  const identifier = normalizeIdentifier(
    payload.identifier ||
      payload.email ||
      payload.username ||
      payload.user ||
      ""
  );

  const password = String(payload.password || "");

  const errors = {};

  if (!identifier) {
    errors.identifier =
      "Introduce tu email o nombre de usuario.";
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
  } else if (password.length < 6) {
    errors.password =
      "La contraseña debe tener al menos 6 caracteres.";
  }

  return errors;
}

export function getFirstLoginError(errors = {}) {
  return (
    safeText(errors.identifier, "") ||
    safeText(errors.email, "") ||
    safeText(errors.password, "") ||
    ""
  );
}

/* =========================================================
   AUTH RESPONSE HELPERS
========================================================= */

function getNestedData(raw = {}) {
  const data = safeObject(raw.data);
  const payload = safeObject(raw.payload);
  const result = safeObject(raw.result);
  const body = safeObject(raw.body);

  const session =
    pickFirstObject(
      raw.session,
      raw.sessionData,
      data.session,
      data.sessionData,
      payload.session,
      payload.sessionData,
      result.session,
      result.sessionData,
      body.session,
      body.sessionData
    ) || {};

  const auth =
    pickFirstObject(
      raw.auth,
      raw.authData,
      data.auth,
      data.authData,
      payload.auth,
      payload.authData,
      result.auth,
      result.authData,
      body.auth,
      body.authData
    ) || {};

  const sessionData = safeObject(session.data);
  const authData = safeObject(auth.data);

  return {
    data,
    payload,
    result,
    body,
    session,
    auth,
    sessionData,
    authData,
  };
}

function extractToken(raw = {}) {
  const {
    data,
    payload,
    result,
    body,
    session,
    auth,
    sessionData,
    authData,
  } = getNestedData(raw);

  return pickFirstText(
    raw.token,
    raw.accessToken,
    raw.access_token,
    raw.authToken,
    raw.auth_token,
    raw.jwt,
    raw.idToken,
    raw.id_token,

    data.token,
    data.accessToken,
    data.access_token,
    data.authToken,
    data.auth_token,
    data.jwt,
    data.idToken,
    data.id_token,

    payload.token,
    payload.accessToken,
    payload.access_token,
    payload.authToken,
    payload.auth_token,
    payload.jwt,

    result.token,
    result.accessToken,
    result.access_token,
    result.authToken,
    result.auth_token,
    result.jwt,

    body.token,
    body.accessToken,
    body.access_token,
    body.authToken,
    body.auth_token,
    body.jwt,

    session.token,
    session.accessToken,
    session.access_token,
    session.authToken,
    session.auth_token,
    session.jwt,

    auth.token,
    auth.accessToken,
    auth.access_token,
    auth.authToken,
    auth.auth_token,
    auth.jwt,

    sessionData.token,
    sessionData.accessToken,
    sessionData.access_token,
    sessionData.authToken,
    sessionData.auth_token,
    sessionData.jwt,

    authData.token,
    authData.accessToken,
    authData.access_token,
    authData.authToken,
    authData.auth_token,
    authData.jwt
  );
}

function extractRefreshToken(raw = {}) {
  const {
    data,
    payload,
    result,
    body,
    session,
    auth,
    sessionData,
    authData,
  } = getNestedData(raw);

  return pickFirstText(
    raw.refreshToken,
    raw.refresh_token,

    data.refreshToken,
    data.refresh_token,

    payload.refreshToken,
    payload.refresh_token,

    result.refreshToken,
    result.refresh_token,

    body.refreshToken,
    body.refresh_token,

    session.refreshToken,
    session.refresh_token,

    auth.refreshToken,
    auth.refresh_token,

    sessionData.refreshToken,
    sessionData.refresh_token,

    authData.refreshToken,
    authData.refresh_token
  );
}

function extractTempToken(raw = {}) {
  const {
    data,
    payload,
    result,
    body,
    session,
    auth,
    sessionData,
    authData,
  } = getNestedData(raw);

  return pickFirstText(
    raw.tempToken,
    raw.temp_token,
    raw.temporaryToken,
    raw.temporary_token,
    raw.twoFactorToken,
    raw.two_factor_token,
    raw.mfaToken,
    raw.mfa_token,

    data.tempToken,
    data.temp_token,
    data.temporaryToken,
    data.temporary_token,
    data.twoFactorToken,
    data.two_factor_token,
    data.mfaToken,
    data.mfa_token,

    payload.tempToken,
    payload.temp_token,
    payload.temporaryToken,
    payload.temporary_token,
    payload.twoFactorToken,
    payload.two_factor_token,
    payload.mfaToken,
    payload.mfa_token,

    result.tempToken,
    result.temp_token,
    result.temporaryToken,
    result.temporary_token,
    result.twoFactorToken,
    result.two_factor_token,
    result.mfaToken,
    result.mfa_token,

    body.tempToken,
    body.temp_token,
    body.temporaryToken,
    body.temporary_token,
    body.twoFactorToken,
    body.two_factor_token,
    body.mfaToken,
    body.mfa_token,

    session.tempToken,
    session.temp_token,
    session.temporaryToken,
    session.temporary_token,
    session.twoFactorToken,
    session.two_factor_token,
    session.mfaToken,
    session.mfa_token,

    auth.tempToken,
    auth.temp_token,
    auth.temporaryToken,
    auth.temporary_token,
    auth.twoFactorToken,
    auth.two_factor_token,
    auth.mfaToken,
    auth.mfa_token,

    sessionData.tempToken,
    sessionData.temp_token,
    sessionData.temporaryToken,
    sessionData.temporary_token,

    authData.tempToken,
    authData.temp_token,
    authData.temporaryToken,
    authData.temporary_token
  );
}

function extractUser(raw = {}) {
  const {
    data,
    payload,
    result,
    body,
    session,
    auth,
    sessionData,
    authData,
  } = getNestedData(raw);

  return pickFirstObject(
    raw.user,
    raw.usuario,
    raw.account,
    raw.profile,
    raw.me,

    data.user,
    data.usuario,
    data.account,
    data.profile,
    data.me,

    payload.user,
    payload.usuario,
    payload.account,
    payload.profile,
    payload.me,

    result.user,
    result.usuario,
    result.account,
    result.profile,
    result.me,

    body.user,
    body.usuario,
    body.account,
    body.profile,
    body.me,

    session.user,
    session.usuario,
    session.account,
    session.profile,
    session.me,

    auth.user,
    auth.usuario,
    auth.account,
    auth.profile,
    auth.me,

    sessionData.user,
    sessionData.usuario,
    sessionData.account,
    sessionData.profile,
    sessionData.me,

    authData.user,
    authData.usuario,
    authData.account,
    authData.profile,
    authData.me
  );
}

function extractRole(raw = {}, user = null) {
  const {
    data,
    payload,
    result,
    body,
    session,
    auth,
    sessionData,
    authData,
  } = getNestedData(raw);

  return pickFirstText(
    raw.role,
    raw.rol,

    data.role,
    data.rol,

    payload.role,
    payload.rol,

    result.role,
    result.rol,

    body.role,
    body.rol,

    session.role,
    session.rol,

    auth.role,
    auth.rol,

    sessionData.role,
    sessionData.rol,

    authData.role,
    authData.rol,

    user?.role,
    user?.rol,
    user?.type,
    user?.tipo
  );
}

function extractMessage(raw = {}) {
  const {
    data,
    payload,
    result,
    body,
    session,
    auth,
    sessionData,
    authData,
  } = getNestedData(raw);

  return pickFirstText(
    raw.message,
    raw.mensaje,
    raw.error,
    raw.errorMessage,
    raw.error_message,

    data.message,
    data.mensaje,
    data.error,
    data.errorMessage,
    data.error_message,

    payload.message,
    payload.mensaje,
    payload.error,
    payload.errorMessage,
    payload.error_message,

    result.message,
    result.mensaje,
    result.error,
    result.errorMessage,
    result.error_message,

    body.message,
    body.mensaje,
    body.error,
    body.errorMessage,
    body.error_message,

    session.message,
    session.mensaje,

    auth.message,
    auth.mensaje,

    sessionData.message,
    sessionData.mensaje,

    authData.message,
    authData.mensaje
  );
}

function extractCode(raw = {}) {
  const {
    data,
    payload,
    result,
    body,
    session,
    auth,
    sessionData,
    authData,
  } = getNestedData(raw);

  return pickFirstText(
    raw.code,
    raw.errorCode,
    raw.error_code,

    data.code,
    data.errorCode,
    data.error_code,

    payload.code,
    payload.errorCode,
    payload.error_code,

    result.code,
    result.errorCode,
    result.error_code,

    body.code,
    body.errorCode,
    body.error_code,

    session.code,
    session.errorCode,
    session.error_code,

    auth.code,
    auth.errorCode,
    auth.error_code,

    sessionData.code,
    sessionData.errorCode,
    sessionData.error_code,

    authData.code,
    authData.errorCode,
    authData.error_code
  );
}

function extractStatus(raw = {}) {
  const {
    data,
    payload,
    result,
    body,
    session,
    auth,
    sessionData,
    authData,
  } = getNestedData(raw);

  return pickFirstValue(
    raw.status,
    raw.statusCode,
    raw.status_code,

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

    session.status,
    session.statusCode,
    session.status_code,

    auth.status,
    auth.statusCode,
    auth.status_code,

    sessionData.status,
    sessionData.statusCode,
    sessionData.status_code,

    authData.status,
    authData.statusCode,
    authData.status_code
  );
}

function extractRedirectTo(raw = {}) {
  const {
    data,
    payload,
    result,
    body,
    session,
    auth,
    sessionData,
    authData,
  } = getNestedData(raw);

  return pickFirstText(
    raw.redirectTo,
    raw.redirect_to,
    raw.redirect,
    raw.next,
    raw.nextPath,
    raw.next_path,

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

    session.redirectTo,
    session.redirect_to,
    session.redirect,

    auth.redirectTo,
    auth.redirect_to,
    auth.redirect,

    sessionData.redirectTo,
    sessionData.redirect_to,
    sessionData.redirect,

    authData.redirectTo,
    authData.redirect_to,
    authData.redirect
  );
}

function extractNavigationHandled(raw = {}) {
  const {
    data,
    payload,
    result,
    body,
    session,
    auth,
    sessionData,
    authData,
  } = getNestedData(raw);

  return Boolean(
    raw.navigationHandled ||
      raw.navigated ||
      raw.didNavigate ||

      data.navigationHandled ||
      data.navigated ||
      data.didNavigate ||

      payload.navigationHandled ||
      payload.navigated ||
      payload.didNavigate ||

      result.navigationHandled ||
      result.navigated ||
      result.didNavigate ||

      body.navigationHandled ||
      body.navigated ||
      body.didNavigate ||

      session.navigationHandled ||
      session.navigated ||
      session.didNavigate ||

      auth.navigationHandled ||
      auth.navigated ||
      auth.didNavigate ||

      sessionData.navigationHandled ||
      sessionData.navigated ||
      sessionData.didNavigate ||

      authData.navigationHandled ||
      authData.navigated ||
      authData.didNavigate
  );
}

function extractRequires2FA(raw = {}, tempToken = "") {
  const {
    data,
    payload,
    result,
    body,
    session,
    auth,
    sessionData,
    authData,
  } = getNestedData(raw);

  const status = safeText(extractStatus(raw), "").toLowerCase();

  return Boolean(
    normalizeBoolean(raw.requires2FA, false) ||
      normalizeBoolean(raw.require2FA, false) ||
      normalizeBoolean(raw.requiresTwoFactor, false) ||
      normalizeBoolean(raw.twoFactorRequired, false) ||
      normalizeBoolean(raw.mfaRequired, false) ||
      normalizeBoolean(raw.requiresMfa, false) ||

      normalizeBoolean(data.requires2FA, false) ||
      normalizeBoolean(data.require2FA, false) ||
      normalizeBoolean(data.requiresTwoFactor, false) ||
      normalizeBoolean(data.twoFactorRequired, false) ||
      normalizeBoolean(data.mfaRequired, false) ||
      normalizeBoolean(data.requiresMfa, false) ||

      normalizeBoolean(payload.requires2FA, false) ||
      normalizeBoolean(payload.require2FA, false) ||
      normalizeBoolean(payload.requiresTwoFactor, false) ||
      normalizeBoolean(payload.twoFactorRequired, false) ||
      normalizeBoolean(payload.mfaRequired, false) ||
      normalizeBoolean(payload.requiresMfa, false) ||

      normalizeBoolean(result.requires2FA, false) ||
      normalizeBoolean(result.require2FA, false) ||
      normalizeBoolean(result.requiresTwoFactor, false) ||
      normalizeBoolean(result.twoFactorRequired, false) ||
      normalizeBoolean(result.mfaRequired, false) ||
      normalizeBoolean(result.requiresMfa, false) ||

      normalizeBoolean(body.requires2FA, false) ||
      normalizeBoolean(body.require2FA, false) ||
      normalizeBoolean(body.requiresTwoFactor, false) ||
      normalizeBoolean(body.twoFactorRequired, false) ||
      normalizeBoolean(body.mfaRequired, false) ||
      normalizeBoolean(body.requiresMfa, false) ||

      normalizeBoolean(session.requires2FA, false) ||
      normalizeBoolean(session.require2FA, false) ||
      normalizeBoolean(session.requiresTwoFactor, false) ||
      normalizeBoolean(session.twoFactorRequired, false) ||
      normalizeBoolean(session.mfaRequired, false) ||
      normalizeBoolean(session.requiresMfa, false) ||

      normalizeBoolean(auth.requires2FA, false) ||
      normalizeBoolean(auth.require2FA, false) ||
      normalizeBoolean(auth.requiresTwoFactor, false) ||
      normalizeBoolean(auth.twoFactorRequired, false) ||
      normalizeBoolean(auth.mfaRequired, false) ||
      normalizeBoolean(auth.requiresMfa, false) ||

      normalizeBoolean(sessionData.requires2FA, false) ||
      normalizeBoolean(sessionData.twoFactorRequired, false) ||

      normalizeBoolean(authData.requires2FA, false) ||
      normalizeBoolean(authData.twoFactorRequired, false) ||

      Boolean(tempToken) ||
      status === "2fa_required" ||
      status === "mfa_required" ||
      status === "two_factor_required"
  );
}

export function hasUsableToken(token = "") {
  return Boolean(safeText(token, ""));
}

export function hasUsableUser(user = {}) {
  if (!isPlainObject(user)) {
    return false;
  }

  return Boolean(
    safeText(user.id, "") ||
      safeText(user.userId, "") ||
      safeText(user._id, "") ||
      safeText(user.uid, "") ||
      safeText(user.username, "") ||
      safeText(user.email, "") ||
      safeText(user.phone, "") ||
      safeText(user.telefono, "")
  );
}

export function getUserIdentity(user = {}) {
  if (!isPlainObject(user)) {
    return "";
  }

  return (
    safeText(user.userId, "") ||
    safeText(user.id, "") ||
    safeText(user._id, "") ||
    safeText(user.uid, "") ||
    safeText(user.email, "") ||
    safeText(user.username, "") ||
    safeText(user.phone, "") ||
    safeText(user.telefono, "")
  );
}

function isExplicitAuthFailure(raw = {}) {
  const statusValue = extractStatus(raw);
  const statusNumber = Number(statusValue || 0);

  if (Number.isFinite(statusNumber) && statusNumber >= 400) {
    return true;
  }

  const code = safeText(extractCode(raw), "").toUpperCase();

  if (code && AUTH_FAILURE_CODES.has(code)) {
    return true;
  }

  const data = safeObject(raw.data);
  const payload = safeObject(raw.payload);
  const result = safeObject(raw.result);
  const body = safeObject(raw.body);

  if (raw.ok === false || raw.success === false) {
    return true;
  }

  if (data.ok === false || data.success === false) {
    return true;
  }

  if (payload.ok === false || payload.success === false) {
    return true;
  }

  if (result.ok === false || result.success === false) {
    return true;
  }

  if (body.ok === false || body.success === false) {
    return true;
  }

  return false;
}

function getSessionData(raw = {}) {
  const {
    data,
    payload,
    result,
    body,
    session,
    auth,
  } = getNestedData(raw);

  return (
    pickFirstObject(
      raw.sessionData,
      raw.session,
      data.sessionData,
      data.session,
      payload.sessionData,
      payload.session,
      result.sessionData,
      result.session,
      body.sessionData,
      body.session,
      session,
      auth
    ) || null
  );
}

/* =========================================================
   AUTH RESPONSE
========================================================= */

export function normalizeAuthResult(result = {}) {
  const raw = safeObject(result);

  const token = extractToken(raw);
  const refreshToken = extractRefreshToken(raw);
  const tempToken = extractTempToken(raw);
  const user = extractUser(raw);
  const role = extractRole(raw, user);
  const message = extractMessage(raw);
  const code = extractCode(raw);
  const statusValue = extractStatus(raw);
  const redirectTo = extractRedirectTo(raw);
  const sessionData = getSessionData(raw);
  const navigationHandled = extractNavigationHandled(raw);

  const requires2FA = extractRequires2FA(raw, tempToken);
  const explicitFailure = isExplicitAuthFailure(raw);

  const authenticated =
    !explicitFailure &&
    hasUsableToken(token) &&
    hasUsableUser(user) &&
    !requires2FA;

  const ok =
    explicitFailure
      ? false
      : authenticated || requires2FA;

  return {
    raw: result,

    ok,
    success: ok,
    explicitFailure,

    status: safeText(
      statusValue,
      explicitFailure
        ? "auth_failed"
        : requires2FA
          ? "2fa_required"
          : authenticated
            ? "authenticated"
            : ""
    ),

    code: safeText(code, ""),
    message: safeText(message, ""),

    token: safeText(token, ""),
    refreshToken: safeText(refreshToken, ""),
    tempToken: safeText(tempToken, ""),

    sessionData,
    user,
    role: safeText(role, ""),

    redirectTo: safeText(redirectTo, ""),
    requires2FA,
    authenticated,

    navigationHandled,
  };
}

export function resolveAuthErrorMessage(error) {
  const normalizedError = safeObject(error);

  const code =
    safeText(error?.data?.code, "") ||
    safeText(error?.data?.error, "") ||
    safeText(error?.response?.data?.code, "") ||
    safeText(error?.response?.data?.error, "") ||
    safeText(normalizedError.code, "") ||
    safeText(normalizedError.error, "");

  const backendMessage =
    safeText(error?.data?.message, "") ||
    safeText(error?.data?.mensaje, "") ||
    safeText(error?.response?.data?.message, "") ||
    safeText(error?.response?.data?.mensaje, "") ||
    safeText(error?.message, "") ||
    safeText(error?.statusText, "") ||
    safeText(normalizedError.message, "") ||
    safeText(normalizedError.mensaje, "");

  if (backendMessage) {
    return backendMessage;
  }

  switch (code) {
    case "INVALID_CREDENTIALS":
      return "Credenciales incorrectas.";

    case "ACCOUNT_TEMPORARILY_LOCKED":
      return "La cuenta está bloqueada temporalmente. Inténtalo de nuevo más tarde.";

    case "ACCOUNT_DISABLED":
    case "USER_DISABLED":
      return "La cuenta no está disponible.";

    case "MISSING_CREDENTIALS":
      return "Introduce usuario/email y contraseña.";

    case "INVALID_LOGIN_SESSION":
      return "Login inválido: el servidor no devolvió una sesión válida.";

    default:
      return "No se ha podido iniciar sesión.";
  }
}

/* =========================================================
   SESSION
========================================================= */

function getCurrentToken() {
  return (
    safeText(AppCore?.state?.token, "") ||
    safeText(AppCore?.state?.accessToken, "") ||
    safeText(AppCore?.state?.session?.token, "") ||
    safeText(AppCore?.state?.session?.accessToken, "")
  );
}

function isAlreadySyncedSession(token = "", user = null) {
  const currentToken = getCurrentToken();

  if (!token || !currentToken || token !== currentToken) {
    return false;
  }

  const currentUser =
    AppCore?.state?.user ||
    AppCore?.state?.session?.user ||
    null;

  const currentIdentity = getUserIdentity(currentUser || {});
  const nextIdentity = getUserIdentity(user || {});

  if (!nextIdentity || !currentIdentity) {
    return false;
  }

  return (
    Boolean(AppCore?.state?.authenticated) &&
    currentIdentity === nextIdentity
  );
}

function emitSessionSynced({
  user,
  token,
  role,
  authenticated,
  source = "login.helpers",
} = {}) {
  try {
    AppCore?.events?.emit?.("app:user:change", {
      user,
      token,
      role,
      authenticated,
      source,
    });
  } catch {}
}

function buildInvalidSessionError(message = "Login inválido: sesión incompleta.") {
  const error = new Error(message);

  error.status = 401;
  error.data = {
    code: "INVALID_LOGIN_SESSION",
    message,
  };

  return error;
}

function applyFallbackSession({
  token,
  user,
  role,
  refreshToken = "",
  sessionData = null,
} = {}) {
  try {
    AppCore.state = AppCore.state || {};
  } catch {}

  try {
    if (AppCore?.state) {
      AppCore.state.token = token;
      AppCore.state.accessToken = token;
      AppCore.state.user = user;
      AppCore.state.role = role;
      AppCore.state.authenticated = true;

      AppCore.state.session = {
        ...(isPlainObject(AppCore.state.session)
          ? AppCore.state.session
          : {}),
        token,
        accessToken: token,
        refreshToken: refreshToken || "",
        user,
        role,
        authenticated: true,
        data: sessionData || undefined,
      };
    }
  } catch {}
}

export function syncSession(auth = {}) {
  const normalized =
    normalizeAuthResult(auth);

  if (
    normalized.requires2FA &&
    !normalized.token
  ) {
    return {
      token: "",
      user: null,
      role: "",
      authenticated: false,
      requires2FA: true,
      tempToken: normalized.tempToken,
    };
  }

  const token = safeText(
    normalized.token,
    ""
  );

  const user = normalized.user || null;

  const role = safeText(
    normalized.role ||
      normalized.user?.role ||
      normalized.user?.rol ||
      "",
    ""
  );

  if (normalized.explicitFailure || normalized.ok === false) {
    throw buildInvalidSessionError(
      normalized.message || "No se pudo iniciar sesión."
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
    isAlreadySyncedSession(token, user);

  if (!alreadySynced) {
    if (typeof AppCore?.applySession === "function") {
      AppCore.applySession({
        token,
        accessToken: token,
        user,
        role,
        refreshToken: normalized.refreshToken || undefined,
        sessionData: normalized.sessionData || undefined,
        authenticated: true,
      });
    } else {
      applyFallbackSession({
        token,
        user,
        role,
        refreshToken: normalized.refreshToken,
        sessionData: normalized.sessionData,
      });
    }

    try {
      if (typeof AppCore?.setToken === "function") {
        AppCore.setToken(token);
      }
    } catch {}

    try {
      if (typeof AppCore?.setUser === "function") {
        AppCore.setUser(user);
      }
    } catch {}

    try {
      if (typeof AppCore?.setState === "function") {
        AppCore.setState({
          token,
          accessToken: token,
          user,
          role,
          authenticated: true,
        });
      } else {
        applyFallbackSession({
          token,
          user,
          role,
          refreshToken: normalized.refreshToken,
          sessionData: normalized.sessionData,
        });
      }
    } catch {
      applyFallbackSession({
        token,
        user,
        role,
        refreshToken: normalized.refreshToken,
        sessionData: normalized.sessionData,
      });
    }

    emitSessionSynced({
      user,
      token,
      role,
      authenticated: true,
      source: "login.helpers:syncSession",
    });
  }

  try {
    AppCore?.syncUserUI?.();
  } catch {}

  return {
    token,
    user,
    role,
    authenticated: true,
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
    const redirect =
      new URLSearchParams(window.location.search).get("redirect");

    return safeText(redirect, "");
  } catch {
    return "";
  }
}

function resolveExplicitRedirect(options = {}) {
  return (
    safeText(options.redirectTo, "") ||
    safeText(options.successRedirect, "") ||
    safeText(options.redirect, "") ||
    ""
  );
}

function resolveResponseRedirect(auth = {}) {
  const normalized =
    normalizeAuthResult(auth);

  return (
    safeText(normalized.redirectTo, "") ||
    safeText(normalized.raw?.redirectTo, "") ||
    safeText(normalized.raw?.redirect, "") ||
    safeText(normalized.raw?.data?.redirectTo, "") ||
    safeText(normalized.raw?.data?.redirect, "") ||
    ""
  );
}

export function resolveLoginRedirect(
  auth = {},
  options = {}
) {
  const normalized =
    normalizeAuthResult(auth);

  const home = getConfiguredHomePath();

  /*
    1. Redirect explícito del caller.
  */
  const explicitRedirect =
    resolveExplicitRedirect(options);

  if (explicitRedirect) {
    const safeRedirect =
      ensureSafeRedirect(explicitRedirect, home);

    if (isRoleDefaultRedirect(safeRedirect)) {
      return home;
    }

    return safeRedirect;
  }

  /*
    2. Redirect de URL: /login?redirect=/facturas
    Permitimos este redirect porque es intención explícita del usuario/router.
  */
  const queryRedirect =
    getUrlRedirectParam();

  if (queryRedirect) {
    return ensureSafeRedirect(queryRedirect, home);
  }

  /*
    3. 2FA.
  */
  if (normalized?.requires2FA) {
    return ensureSafeRedirect(
      normalized.redirectTo || DEFAULT_2FA_PATH,
      DEFAULT_2FA_PATH
    );
  }

  /*
    4. Redirect de respuesta:
       Por defecto NO aceptamos targets generados por rol/slug.
       Esto corrige el salto automático a /usuarios o /@slug.
  */
  const responseRedirect =
    resolveResponseRedirect(normalized);

  if (
    responseRedirect &&
    options.trustAuthRedirect === true &&
    !isRoleDefaultRedirect(responseRedirect)
  ) {
    return ensureSafeRedirect(responseRedirect, home);
  }

  /*
    5. Default real: Inicio.
  */
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
    resolveLoginRedirect(normalized, options);

  const current =
    getCurrentBrowserPath();

  if (
    normalizePath(current) === normalizePath(target)
  ) {
    return false;
  }

  return true;
}

/* =========================================================
   REMEMBER FLOW
========================================================= */

export function persistRememberedIdentifier({
  identifier = "",
  email = "",
  remember = false,
} = {}) {
  const finalIdentifier =
    normalizeIdentifier(identifier) ||
    normalizeIdentifier(email);

  if (remember) {
    saveRememberedIdentifier(finalIdentifier);
    return;
  }

  clearRememberedIdentifier();
}

/*
  Compat legacy:
  mantenemos el nombre antiguo para index.js y otros módulos
  que todavía llamen persistRememberedEmail().
*/
export function persistRememberedEmail({
  identifier = "",
  email = "",
  remember = false,
} = {}) {
  persistRememberedIdentifier({
    identifier,
    email,
    remember,
  });
}
