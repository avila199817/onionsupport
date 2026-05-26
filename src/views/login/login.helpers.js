/* =========================================================
   Onion Support - Login Helpers
   Archivo: /src/views/login/login.helpers.js

   Responsabilidad:
   - Helpers puros mínimos para la vista Login.
   - Validación mínima del formulario.
   - Payload compatible con Auth.login().
   - Normalización segura del resultado Auth.
   - Sesión estricta: access token usable + user usable.
   - Redirect seguro post-login.
   - Rutas/base/path helpers desde core/config.js.
   - Mantener exports legacy en modo compat seguro.
   - Sin DOM.
   - Sin HTTP.
   - Sin Router navigation.
   - Sin Auth directo.
   - Sin AppCore state mutation.
   - Sin aplicar sesión.
   - Sin storage propio.
   - Sin eventos.
   - Sin Toast.
   - Sin 2FA/MFA/OTP.
   - Sin /home.
   - Sin rutas legacy.
========================================================= */

import {
  ROUTES,
  PUBLIC_ROUTES,
  TOKEN_PARAM as CONFIG_TOKEN_PARAM,
  USER_HOME_PREFIX as CONFIG_USER_HOME_PREFIX,
  buildUserHomeRoute as configBuildUserHomeRoute,
  canonicalRoutePath as configCanonicalRoutePath,
  getUserScopedRouteInfo as configGetUserScopedRouteInfo,
  isBlockedRoutePath as configIsBlockedRoutePath,
  isPublicRoute as configIsPublicRoute,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../../core/config.js";

export const LOGIN_HELPERS_VERSION = "login.helpers.v22";
export const LOGIN_REMEMBER_KEY = "auth:last-identifier";

const HOME_ROUTE = "/";
const USER_HOME_PREFIX = CONFIG_USER_HOME_PREFIX || "/@";
const TOKEN_PARAM = CONFIG_TOKEN_PARAM || "token";

const LOGIN_ROUTE = ROUTES.login || "/login";
const PASSWORD_REQUEST_ROUTE = ROUTES.passwordRequest || "/password-request";
const PASSWORD_RESET_ROUTE = ROUTES.passwordReset || "/password-reset";
const ACTIVATE_ACCOUNT_ROUTE = ROUTES.activateAccount || "/activate-account";

const IDENTIFIER_MAX = 160;
const PASSWORD_MIN = 1;
const PASSWORD_MAX = 1024;
const TOKEN_MAX = 8192;
const REDIRECT_MAX = 2048;

const VALID_ROLES = Object.freeze(["admin", "user"]);

const TOKEN_KEYS = Object.freeze([
  "token",
  "accessToken",
  "access_token",
]);

const REFRESH_TOKEN_KEYS = Object.freeze([
  "refreshToken",
  "refresh_token",
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
]);

const WALK_KEYS = Object.freeze([
  "data",
  "payload",
  "result",
  "body",
  "response",
  "auth",
  "session",
  "sessionData",
  "session_data",
]);

const USER_ID_KEYS = Object.freeze([
  "id",
  "userId",
  "user_id",
  "uid",
  "sub",
  "username",
  "userName",
  "user_name",
  "slug",
]);

const INVALID_USER_STATUSES = new Set([
  "disabled",
  "inactive",
  "deleted",
  "archived",
  "revoked",
  "blocked",
  "banned",
  "suspended",
  "desactivado",
  "inactivo",
  "eliminado",
  "archivado",
  "bloqueado",
  "suspendido",
]);

const FAILURE_CODES = new Set([
  "INVALID_CREDENTIALS",
  "MISSING_CREDENTIALS",
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

const PUBLIC_AUTH_PATHS = new Set(
  (
    Array.isArray(PUBLIC_ROUTES) && PUBLIC_ROUTES.length
      ? PUBLIC_ROUTES
      : [
          LOGIN_ROUTE,
          PASSWORD_REQUEST_ROUTE,
          PASSWORD_RESET_ROUTE,
          ACTIVATE_ACCOUNT_ROUTE,
        ]
  )
    .map((path) => normalizeCanonicalPath(path))
    .filter(Boolean)
);

const SENSITIVE_KEY_RE = /token|authorization|cookie|password|secret|credential|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;
const TOKENISH_RE = /(bearer\s+)[a-z0-9._~+/=-]+|[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|code|t)=)[^&#\s]+/gi;

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
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  return [];
}

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
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
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;

  const clean = safeText(value, "").toLowerCase();

  if (["true", "yes", "si", "sí", "ok", "on", "enabled", "active"].includes(clean)) return true;
  if (["false", "no", "off", "disabled", "inactive"].includes(clean)) return false;

  return Boolean(fallback);
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isPlainObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

function firstText(...values) {
  for (const value of values) {
    const output = safeText(value, "");
    if (output) return output;
  }

  return "";
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

function identifierMax() {
  return IDENTIFIER_MAX;
}

function passwordMin() {
  return PASSWORD_MIN;
}

function passwordMax() {
  return PASSWORD_MAX;
}

function tokenMax() {
  return TOKEN_MAX;
}

/* =========================================================
   REDACTION / HTML
========================================================= */

function redactText(value = "") {
  const output = safeText(value, "");

  if (!output) return "";

  try {
    return output
      .replace(TOKENISH_RE, (match, bearerPrefix, queryPrefix) => {
        if (bearerPrefix) return `${bearerPrefix}***`;
        if (queryPrefix) return `${queryPrefix}***`;
        return "***";
      })
      .replace(
        /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
        "$1***"
      );
  } catch {
    return output;
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
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return redactText(value);
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redactText(value.message || ""),
    };
  }

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
  const id =
    normalizeIdentifier(identifier) ||
    normalizeIdentifier(email) ||
    normalizeIdentifier(username) ||
    normalizeIdentifier(user) ||
    normalizeIdentifier(login) ||
    normalizeIdentifier(phone) ||
    normalizeIdentifier(telefono);

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
   STORAGE / REMEMBER COMPAT
========================================================= */

export function getStorage() {
  return null;
}

export function getNamespacedKey(key = "") {
  const clean = safeText(key, "").replace(/^:+/g, "");
  return clean ? `onion:${clean}` : "onion";
}

export function readStorage(_key, fallback = "") {
  return fallback;
}

export function writeStorage() {
  return false;
}

export function removeStorage() {
  return false;
}

export function loadRememberedIdentifier() {
  return "";
}

export function loadRememberedEmail() {
  return "";
}

export function saveRememberedIdentifier() {
  return false;
}

export function saveRememberedEmail() {
  return false;
}

export function clearRememberedIdentifier() {
  return false;
}

export function clearRememberedEmail() {
  return false;
}

export function persistRememberedIdentifier() {
  return false;
}

export function persistRememberedEmail() {
  return false;
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

  if (!raw) return HOME_ROUTE;
  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || HOME_ROUTE;

  return raw.replace(/^#\/?/, "/") || HOME_ROUTE;
}

function normalizePathname(pathname = HOME_ROUTE) {
  try {
    return configNormalizeRoutePath(pathname) || HOME_ROUTE;
  } catch {
    let value = safeText(pathname, HOME_ROUTE)
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

    if (!value.startsWith("/")) value = `/${value}`;

    const stack = [];

    for (const part of value.split("/").filter(Boolean)) {
      if (part === ".") continue;
      if (part === "..") stack.pop();
      else stack.push(part);
    }

    value = `/${stack.join("/")}`;

    return value.length > 1 ? value.replace(/\/+$/g, "") : value;
  }
}

function normalizeSearch(search = "") {
  const value = safeText(search, "");

  if (!value || value === "?") return "";

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value = safeText(hash, "");

  if (!value || value === "#") return "";

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function splitPath(path = HOME_ROUTE) {
  let raw = safeText(path, HOME_ROUTE) || HOME_ROUTE;

  if (isHashRouterPath(raw)) raw = normalizeHashRouterPath(raw);

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || HOME_ROUTE;
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || HOME_ROUTE;
  }

  return {
    pathname: normalizePathname(pathname),
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
  };
}

function pathFromUrlLike(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";

  if (isHashRouterPath(raw)) return normalizeHashRouterPath(raw);

  try {
    const delegated = configRoutePathFromUrlLike(raw);

    if (delegated) return delegated;
  } catch {
    // fallback abajo
  }

  if (raw.startsWith("//")) return HOME_ROUTE;

  try {
    if (/^https?:\/\//i.test(raw)) {
      const parsed = new URL(raw, baseOrigin());

      if (parsed.origin !== baseOrigin()) return HOME_ROUTE;
      if (parsed.hash && isHashRouterPath(parsed.hash)) return normalizeHashRouterPath(parsed.hash);

      return `${parsed.pathname || HOME_ROUTE}${parsed.search || ""}${parsed.hash || ""}`;
    }
  } catch {
    return HOME_ROUTE;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return HOME_ROUTE;

  return raw;
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i.test(
    String(value || "")
  );
}

function isBlockedPath(path = HOME_ROUTE) {
  try {
    if (configIsBlockedRoutePath(path) === true) return true;
  } catch {
    // noop
  }

  const pathname = splitPath(path).pathname;

  try {
    if (configIsBlockedRoutePath(pathname) === true) return true;
  } catch {
    // noop
  }

  try {
    const scoped = configGetUserScopedRouteInfo(pathname);

    if (scoped?.scoped && scoped?.restPath) {
      return configIsBlockedRoutePath(scoped.restPath) === true;
    }
  } catch {
    // noop
  }

  return false;
}

export function normalizePath(path = HOME_ROUTE) {
  const raw = pathFromUrlLike(path) || HOME_ROUTE;

  if (hasSensitiveQuery(raw) || isBlockedPath(raw)) return HOME_ROUTE;

  const { pathname, search, hash } = splitPath(raw);

  if (isBlockedPath(pathname)) return HOME_ROUTE;

  return `${pathname}${search}${hash}`;
}

function stripSearchAndHash(path = HOME_ROUTE) {
  return splitPath(normalizePath(path)).pathname || HOME_ROUTE;
}

export function getCurrentBrowserPath() {
  if (!isBrowser()) return HOME_ROUTE;

  try {
    const hash = window.location.hash || "";
    if (isHashRouterPath(hash)) return normalizePath(hash);

    return normalizePath(
      `${window.location.pathname || HOME_ROUTE}${window.location.search || ""}${hash}`
    );
  } catch {
    return HOME_ROUTE;
  }
}

export function normalizeCanonicalPath(path = HOME_ROUTE) {
  if (isBlockedPath(path)) return HOME_ROUTE;

  try {
    const canonical = configCanonicalRoutePath(path) || HOME_ROUTE;
    return isBlockedPath(canonical) ? HOME_ROUTE : normalizePathname(canonical);
  } catch {
    const pathname = stripSearchAndHash(path);
    const scoped = getUserScopedInfo(pathname);
    const canonical = scoped.scoped ? scoped.lookupPath : pathname;

    return isBlockedPath(canonical) ? HOME_ROUTE : canonical;
  }
}

function getUserScopedInfo(path = HOME_ROUTE) {
  try {
    const info = configGetUserScopedRouteInfo(path);

    if (isPlainObject(info)) {
      return {
        scoped: Boolean(info.scoped),
        home: Boolean(info.home),
        slug: normalizeUserSlug(info.slug || ""),
        restPath: normalizePathname(info.restPath || info.canonicalPath || HOME_ROUTE),
        lookupPath: normalizePathname(info.lookupPath || info.canonicalPath || info.restPath || HOME_ROUTE),
      };
    }
  } catch {
    // fallback abajo
  }

  const pathname = stripSearchAndHash(path);

  if (!pathname.startsWith(USER_HOME_PREFIX)) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: pathname,
      lookupPath: pathname,
    };
  }

  const rest = pathname.slice(USER_HOME_PREFIX.length);
  const [slugSegment = "", ...restSegments] = rest.split("/");
  const slug = normalizeUserSlug(slugSegment);

  if (!slug) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: pathname,
      lookupPath: pathname,
    };
  }

  const restPath = restSegments.length
    ? normalizePathname(`/${restSegments.join("/")}`)
    : HOME_ROUTE;

  return {
    scoped: true,
    home: restPath === HOME_ROUTE,
    slug,
    restPath,
    lookupPath: restPath,
  };
}

function normalizeUserSlug(value = "") {
  try {
    return configNormalizeUserSlug(value) || "";
  } catch {
    const slug = safeText(value, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^\/+/, "")
      .replace(/^@+/, "")
      .split(/[/?#]/)[0]
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .toLowerCase();

    if (!slug) return "";

    return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
  }
}

export function isAuthPath(path = "") {
  const clean = normalizeCanonicalPath(path);

  if (!clean || isBlockedPath(clean)) return false;
  if (getUserScopedInfo(clean).scoped) return false;

  try {
    if (configIsPublicRoute(clean) === true) return true;
  } catch {
    // fallback abajo
  }

  return PUBLIC_AUTH_PATHS.has(clean);
}

function hasOpenRedirectRisk(value = "") {
  const raw = safeText(value, "");

  if (
    !raw ||
    raw.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(raw) ||
    /[\r\n\t\\]/.test(raw)
  ) {
    return true;
  }

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
    const decoded = decodeURIComponent(raw)
      .trim()
      .replace(/\\/g, "/");

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

  if (!value || !value.startsWith("/") || hasOpenRedirectRisk(value)) return false;
  if (hasSensitiveQuery(value)) return false;

  const normalized = normalizePath(value);

  if (!normalized || isBlockedPath(normalized)) return false;
  if (opts.allowAuthPaths !== true && isAuthPath(normalized)) return false;

  return true;
}

export function ensureSafeRedirect(path = "", fallback = HOME_ROUTE, options = {}) {
  const fallbackPath = isSafeInternalRedirect(
    fallback,
    { allowAuthPaths: options.allowFallbackAuthPath === true }
  )
    ? normalizePath(fallback)
    : HOME_ROUTE;

  const candidate = normalizePath(path || "");

  return isSafeInternalRedirect(candidate, options) ? candidate : fallbackPath;
}

function userSlugFromAuthResult(normalized = {}) {
  return normalizeUserSlug(
    normalized.user?.slug ||
      normalized.user?.lookup?.slug ||
      normalized.user?.profile?.slug ||
      ""
  );
}

function configuredHome(normalized = {}) {
  const slug = userSlugFromAuthResult(normalized);

  if (slug) {
    try {
      const home = configBuildUserHomeRoute(slug);
      if (home && isSafeInternalRedirect(home)) return normalizePath(home);
    } catch {
      return `${USER_HOME_PREFIX}${slug}`;
    }
  }

  return HOME_ROUTE;
}

export function getUrlRedirectParam() {
  if (!isBrowser()) return "";

  try {
    const value = new URLSearchParams(window.location.search || "").get("redirect");
    if (value) return safeText(value, "");
  } catch {
    // noop
  }

  try {
    const hash = window.location.hash || "";

    if (hash.includes("?")) {
      const query = hash.split("?").slice(1).join("?");
      const value = new URLSearchParams(query).get("redirect");

      if (value) return safeText(value, "");
    }
  } catch {
    // noop
  }

  return "";
}

/* =========================================================
   AUTH WALK / EXTRACTION
========================================================= */

function collectObjects(payload = null) {
  const out = [];
  const seen = new WeakSet();
  const queue = [payload];

  while (queue.length && out.length < 100) {
    const current = queue.shift();

    if (!current || typeof current !== "object") continue;

    try {
      if (seen.has(current)) continue;
      seen.add(current);
    } catch {
      // noop
    }

    out.push(current);

    for (const key of WALK_KEYS) {
      const child = current[key];
      if (child && typeof child === "object") queue.push(child);
    }

    if (current.response?.data && typeof current.response.data === "object") {
      queue.push(current.response.data);
    }
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

  if (
    !value ||
    BAD_TOKEN_VALUES.has(value.toLowerCase()) ||
    /[\s\r\n\t]/.test(value) ||
    value.length > tokenMax()
  ) {
    return "";
  }

  return value;
}

export function hasUsableToken(token = "") {
  return Boolean(normalizeToken(token));
}

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = safeText(value, "").toLowerCase();

  if (role === "admin") return "admin";
  if (role === "user") return "user";

  return "";
}

function userActive(user = null) {
  if (!isPlainObject(user)) return false;

  const status = safeText(
    user.status ||
      user.estado ||
      user.state ||
      "",
    ""
  ).toLowerCase();

  return !(
    user.active === false ||
    user.enabled === false ||
    user.disabled === true ||
    user.deleted === true ||
    user.blocked === true ||
    user.locked === true ||
    user.suspended === true ||
    user.banned === true ||
    user.archived === true ||
    user.revoked === true ||
    Boolean(user.deletedAt) ||
    INVALID_USER_STATUSES.has(status)
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

function authEnvelopeSignal(value = {}) {
  if (!isPlainObject(value)) return false;

  return Boolean(
    value.token ||
      value.accessToken ||
      value.access_token ||
      value.refreshToken ||
      value.refresh_token ||
      value.session ||
      value.sessionData ||
      value.auth ||
      value.payload ||
      value.result
  );
}

function sanitizeUserRaw(value = {}, depth = 0, seen = new WeakSet()) {
  if (depth > 4 || !isPlainObject(value)) return {};

  try {
    if (seen.has(value)) return {};
    seen.add(value);
  } catch {
    // noop
  }

  const output = {};

  for (const [key, item] of Object.entries(value).slice(0, 160)) {
    if (SENSITIVE_KEY_RE.test(key)) continue;

    if (Array.isArray(item)) {
      output[key] = item
        .slice(0, 100)
        .map((entry) => (isPlainObject(entry) ? sanitizeUserRaw(entry, depth + 1, seen) : entry));
    } else if (isPlainObject(item)) {
      output[key] = sanitizeUserRaw(item, depth + 1, seen);
    } else {
      output[key] = item;
    }
  }

  return output;
}

function fallbackNormalizeUser(user = {}) {
  if (!isPlainObject(user) || !hasNestedIdentity(user)) return null;
  if (authEnvelopeSignal(user) && !hasIdentity(user)) return null;
  if (!userActive(user)) return null;

  const profile = safeObject(user.profile);
  const lookup = safeObject(user.lookup);
  const routing = safeObject(user.routing);

  const id = first(
    user.userId,
    user.user_id,
    user.id,
    user.uid,
    user.sub,
    profile.userId,
    profile.id
  ) || null;

  const username = normalizeUsername(
    firstText(
      user.username,
      user.userName,
      user.user_name,
      user.usernameLower,
      user.username_lower,
      profile.username
    )
  );

  const slug = normalizeUserSlug(
    firstText(
      user.slug,
      lookup.slug,
      profile.slug,
      routing.slug
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
    profile.name,
    username,
    slug,
    id,
    "Usuario"
  );

  const email = firstText(
    user.email,
    user.mail,
    user.emailLower,
    user.email_lower,
    profile.email
  ).toLowerCase();

  const role = normalizeRole(user.role || user.rol || user.roles) || "user";
  const clean = sanitizeUserRaw(user);

  return {
    ...clean,

    id,
    userId: user.userId ?? user.user_id ?? id,
    user_id: user.user_id ?? user.userId ?? id,
    uid: user.uid ?? id,
    sub: user.sub ?? id,

    username: username || null,
    usernameLower: user.usernameLower || user.username_lower || username || null,
    username_lower: user.username_lower || user.usernameLower || username || null,

    /*
      Slug real únicamente.
      No se fabrica desde email/username/id/displayName.
    */
    slug: slug || null,

    name: displayName,
    nombre: user.nombre || displayName,
    displayName,
    fullName: user.fullName || user.full_name || displayName,
    full_name: user.full_name || user.fullName || displayName,

    email: email || null,
    emailLower: firstText(user.emailLower, user.email_lower, email).toLowerCase() || null,
    email_lower: firstText(user.email_lower, user.emailLower, email).toLowerCase() || null,

    role,
    rol: role,
    roles: [role],

    active: true,
    disabled: false,
    deleted: false,
    archived: false,
  };
}

function normalizeUserCandidate(user = null) {
  if (!isPlainObject(user)) return null;

  const fallback = fallbackNormalizeUser(user);
  return hasUsableUser(fallback) ? fallback : null;
}

export function hasUsableUser(user = {}) {
  if (!isPlainObject(user) || !userActive(user)) return false;
  return USER_ID_KEYS.some((key) => Boolean(safeText(user[key], "")));
}

export function getUserIdentity(user = {}) {
  if (!isPlainObject(user)) return "";

  return (
    safeText(user.userId, "") ||
    safeText(user.user_id, "") ||
    safeText(user.id, "") ||
    safeText(user.uid, "") ||
    safeText(user.sub, "") ||
    safeText(user.username, "") ||
    safeText(user.userName, "") ||
    safeText(user.user_name, "") ||
    safeText(user.slug, "")
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
    if (
      isPlainObject(object) &&
      hasNestedIdentity(object) &&
      !authEnvelopeSignal(object)
    ) {
      candidates.push(object);
    }
  }

  for (const candidate of candidates) {
    const user = normalizeUserCandidate(candidate);
    if (user) return user;
  }

  return null;
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

function extractResponseMessage(raw = {}) {
  for (const object of collectObjects(raw)) {
    const value = pickValue(
      [object],
      ["message", "mensaje", "errorMessage", "error_message", "detail", "description", "title", "reason", "msg", "error"]
    );

    if (typeof value === "string" || typeof value === "number") {
      const output = safeText(value, "");
      if (output && output !== "[object Object]") return output;
    }

    if (isPlainObject(value)) {
      const output = firstText(
        value.message,
        value.mensaje,
        value.detail,
        value.description,
        value.title,
        value.code,
        value.error
      );

      if (output) return output;
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

  return objects.some((object) => {
    return object?.ok === false ||
      object?.success === false ||
      (
        object?.authenticated === false &&
        ["unauthorized", "auth_error", "not_authenticated"].includes(status)
      );
  });
}

function declaredSuccess(raw = {}) {
  const objects = collectObjects(raw);
  const status = statusKey(extractStatus(raw));

  if (status && SUCCESS_STATUSES.has(status)) return true;

  return objects.some((object) => {
    return object?.ok === true ||
      object?.success === true ||
      object?.authenticated === true ||
      object?.status === true;
  });
}

function hasTokenSignal(raw = {}, token = "") {
  if (hasUsableToken(token)) return true;

  return collectObjects(raw).some((object) => {
    return object?.hasToken === true ||
      object?.hasAccessToken === true ||
      object?.authenticated === true;
  });
}

function hasRefreshTokenSignal(raw = {}, refreshToken = "") {
  if (hasUsableToken(refreshToken)) return true;

  return collectObjects(raw).some((object) => {
    return object?.hasRefreshToken === true;
  });
}

export function normalizeAuthResult(result = {}) {
  const raw = result && typeof result === "object"
    ? result
    : { message: safeText(result, "") };

  const objects = collectObjects(raw);

  const token = normalizeToken(pickText(objects, TOKEN_KEYS));
  const refreshToken = normalizeToken(pickText(objects, REFRESH_TOKEN_KEYS));
  const user = extractUser(raw);
  const sessionData = pickObject(objects, SESSION_KEYS);

  const failed = explicitFailure(raw);
  const success = declaredSuccess(raw);
  const message = extractResponseMessage(raw);
  const code = extractCode(raw);
  const statusValue = extractStatus(raw);
  const status = statusKey(statusValue);

  const tokenSignal = hasTokenSignal(raw, token);
  const refreshSignal = hasRefreshTokenSignal(raw, refreshToken);
  const userUsable = hasUsableUser(user);

  const authenticated = Boolean(
    !failed &&
      userUsable &&
      (
        hasUsableToken(token) ||
        (
          tokenSignal &&
          collectObjects(raw).some((object) => object?.authenticated === true)
        )
      )
  );

  const tokenOnly = Boolean(!failed && tokenSignal && !userUsable);
  const userOnly = Boolean(!failed && !tokenSignal && userUsable);

  const redirectTo = pickText(objects, [
    "postLoginTarget",
    "homePath",
    "defaultHome",
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

  const navigationHandled = objects.some((object) => {
    return safeBool(object.navigationHandled, false) ||
      safeBool(object.navigated, false) ||
      safeBool(object.didNavigate, false) ||
      safeBool(object.redirected, false);
  });

  const role = normalizeRole(
    firstText(
      pickText(objects, ["role", "rol", "userRole", "user_role"]),
      user?.role,
      user?.rol
    )
  ) || (userUsable ? "user" : "");

  const ok = failed ? false : Boolean(authenticated);

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
        : authenticated
          ? "authenticated"
          : tokenOnly
            ? "token_only"
            : userOnly
              ? "user_only"
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

    hasToken: tokenSignal,
    hasRefreshToken: refreshSignal,

    tempToken: null,
    temp_token: null,

    sessionData,
    session: sessionData,

    user,
    usuario: user,

    role,

    redirectTo: safeText(redirectTo, ""),

    requires2FA: false,
    requiresMfa: false,
    requiresOtp: false,

    authenticated,
    tokenOnly,
    userOnly,

    usedCoreSession: false,
    navigationHandled,
  };
}

export function resolveAuthErrorMessage(error) {
  const normalized = normalizeAuthResult(error);
  const payload = safeObject(error?.data) || safeObject(error?.response?.data);

  const code = (
    safeText(payload.code, "") ||
    safeText(payload.error, "") ||
    safeText(error?.code, "") ||
    safeText(normalized.code, "")
  ).toUpperCase();

  const backendMessage =
    safeText(payload.message, "") ||
    safeText(payload.mensaje, "") ||
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
   SESSION COMPAT
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

export function syncSession(auth = {}) {
  const normalized = normalizeAuthResult(auth);

  if (normalized.explicitFailure || normalized.ok === false) {
    throw invalidSessionError(normalized.message || "No se pudo iniciar sesión.");
  }

  if (!hasUsableToken(normalized.token)) {
    throw invalidSessionError("No se recibió token de autenticación.");
  }

  if (!hasUsableUser(normalized.user)) {
    throw invalidSessionError("No se recibió usuario válido para la sesión.");
  }

  /*
    Compat segura:
    este helper ya no aplica sesión ni muta AppCore.
    La sesión la aplica Auth.login()/features/auth/index.js.
  */
  return {
    token: normalized.token,
    user: normalized.user,
    role: normalized.role || normalized.user?.role || "user",
    authenticated: true,
    requires2FA: false,
    tempToken: "",
    alreadySynced: false,
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
  const home = configuredHome(normalized);
  const explicit = explicitRedirect(options);

  if (explicit) return ensureSafeRedirect(explicit, home);

  const queryRedirect = getUrlRedirectParam();

  if (queryRedirect) return ensureSafeRedirect(queryRedirect, home);

  if (normalized.redirectTo) {
    return ensureSafeRedirect(normalized.redirectTo, home);
  }

  return home;
}

export function shouldRedirectAfterLogin(auth = {}, options = {}) {
  if (options.redirectAfterSuccess === false) return false;

  const normalized = normalizeAuthResult(auth);

  if (normalized.navigationHandled) return false;
  if (!normalized.authenticated) return false;

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
    rememberStorageEnabled: false,
    rememberedIdentifier: "",

    currentPath: getCurrentBrowserPath(),
    homePath: configuredHome(normalized || {}),

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
          requires2FA: false,
          hasToken: Boolean(normalized.token || normalized.hasToken),
          hasRefreshToken: Boolean(normalized.refreshToken || normalized.hasRefreshToken),
          hasTempToken: false,
          hasUser: Boolean(normalized.user),
          usedCoreSession: false,
          tokenOnly: Boolean(normalized.tokenOnly),
          userOnly: Boolean(normalized.userOnly),
          role: normalized.role || null,
          redirectTo: normalized.redirectTo || "",
        }
      : null,

    policy: {
      helpersOnly: true,

      ownDom: false,
      ownHttp: false,
      ownRouterNavigation: false,
      ownAuth: false,
      ownStorage: false,
      ownEvents: false,
      ownSessionApply: false,

      configOwnsRoutes: true,
      configOwnsBlockedRoutes: true,
      configOwnsUserHomeRoute: true,

      strictSession: true,
      tokenAndUserRequired: true,
      noEmailIdentity: true,
      noSlugFabrication: true,

      rememberCompatNoop: true,

      no2fa: true,
      noMfa: true,
      noOtp: true,
      noHomeRoute: true,

      snapshotRedacted: true,
    },

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
