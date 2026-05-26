/* =========================================================
   Onion Support - Auth Helpers
   Archivo: /src/features/auth/helpers.js

   Responsabilidad:
   - Utilidades puras mínimas para Auth.
   - Sin AppCore.
   - Sin CoreHttp.
   - Sin Router.
   - Sin Toast.
   - Sin Storage.
   - Sin sesión.
   - Sin 2FA/MFA/OTP.
   - Sin rutas legacy.
   - Token param único: token.
   - Rutas reales actuales:
     /login
     /password-reset
     /password-request
     /activate-account
========================================================= */

import {
  AUTH_CONSTANTS,
  AUTH_PUBLIC_TECHNICAL_ROUTES,
  AUTH_TOKEN_PARAM_NAMES,
  LOGIN_ROUTE,
  PASSWORD_RESET_ROUTE,
  PASSWORD_REQUEST_ROUTE,
  ACTIVATE_ACCOUNT_ROUTE,
} from "./constants.js";

export const AUTH_HELPERS_VERSION = "auth.helpers.v2";

const DEFAULT_ROUTE = "/";
const LOCAL_ORIGIN = "http://localhost";

const TOKEN_PARAM = Array.isArray(AUTH_TOKEN_PARAM_NAMES?.generic) &&
  AUTH_TOKEN_PARAM_NAMES.generic[0]
  ? AUTH_TOKEN_PARAM_NAMES.generic[0]
  : "token";

const LOGIN_PATH = LOGIN_ROUTE || "/login";
const PASSWORD_RESET_PATH = PASSWORD_RESET_ROUTE || "/password-reset";
const PASSWORD_REQUEST_PATH = PASSWORD_REQUEST_ROUTE || "/password-request";
const ACTIVATE_ACCOUNT_PATH = ACTIVATE_ACCOUNT_ROUTE || "/activate-account";

const AUTH_ROUTES = Object.freeze([
  LOGIN_PATH,
  PASSWORD_RESET_PATH,
  PASSWORD_REQUEST_PATH,
  ACTIVATE_ACCOUNT_PATH,
]);

const PUBLIC_ROUTES = Object.freeze([
  ...AUTH_PUBLIC_TECHNICAL_ROUTES,
]);

const BLOCKED_ROUTES = Object.freeze([
  "/home",
  "/403",
  "/404",
  "/2fa",
  "/mfa",
  "/otp",
]);

const SENSITIVE_KEY_RE = /token|authorization|password|secret|credential|jwt|bearer|refresh|access|cookie|csrf|xsrf/i;
const JWT_RE = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const BEARER_RE = /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi;

/* =========================================================
   BASE
========================================================= */

export function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function safeText(value, fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

export function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function safeInt(value, fallback = 0) {
  return Math.trunc(safeNumber(value, fallback));
}

export function clampNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = safeNumber(value, min);
  return Math.min(Math.max(number, min), max);
}

export function safeBool(value, fallback = false) {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;

  const clean = safeText(value, "").toLowerCase();

  if (["true", "yes", "si", "sí", "on"].includes(clean)) return true;
  if (["false", "no", "off"].includes(clean)) return false;

  return Boolean(fallback);
}

export function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export const isPlainObject = isObject;
export const isFn = (value) => typeof value === "function";

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value === null || value === undefined) return [];
  return [value];
}

export function safeClone(value, fallback = null) {
  if (value === undefined) return fallback;
  if (value === null) return null;

  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {
    // fallback abajo
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback === undefined ? value : fallback;
  }
}

function isBadText(value = "") {
  return [
    "",
    "undefined",
    "null",
    "false",
    "true",
    "[object object]",
    "{}",
    "[]",
  ].includes(safeText(value, "").toLowerCase());
}

/* =========================================================
   PATHS
========================================================= */

function getBaseOrigin() {
  return isBrowser() && window.location?.origin
    ? window.location.origin
    : LOCAL_ORIGIN;
}

export function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

export function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");

  if (!raw) return DEFAULT_ROUTE;
  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  if (raw.startsWith("#/")) return raw.slice(1) || DEFAULT_ROUTE;

  return DEFAULT_ROUTE;
}

function normalizeSearch(search = "") {
  const value = safeText(search, "");

  if (!value || value === "?") return "";

  return value.startsWith("?") ? value : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value = safeText(hash, "");

  if (!value || value === "#") return "";

  return value.startsWith("#") ? value : `#${value.replace(/^#+/, "")}`;
}

export function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
  let value = safeText(pathname, DEFAULT_ROUTE)
    .split("?")[0]
    .split("#")[0]
    .replace(/\\/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/+/g, "/");

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "");
  }

  return value || DEFAULT_ROUTE;
}

function isBlockedPath(path = DEFAULT_ROUTE) {
  const clean = normalizePathnameOnly(path).toLowerCase();

  return BLOCKED_ROUTES.some((blocked) => {
    return clean === blocked || clean.startsWith(`${blocked}/`);
  });
}

export function splitPath(path = DEFAULT_ROUTE) {
  let raw = safeText(path, DEFAULT_ROUTE);

  if (isHashRouterPath(raw)) {
    raw = normalizeHashRouterPath(raw);
  }

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || DEFAULT_ROUTE;
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || DEFAULT_ROUTE;
  }

  const cleanSearch = normalizeSearch(search);
  const cleanHash = normalizeHash(hash);

  return {
    pathname: normalizePathnameOnly(pathname),
    search: cleanSearch,
    hash: cleanHash,
    suffix: `${cleanSearch}${cleanHash}`,
  };
}

function rawPathFromUrlLike(value = DEFAULT_ROUTE) {
  const raw = safeText(value, DEFAULT_ROUTE);

  if (!raw || raw.startsWith("//")) return DEFAULT_ROUTE;

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  if (/[\r\n\t\\]/.test(raw)) {
    return DEFAULT_ROUTE;
  }

  try {
    if (/^https?:\/\//i.test(raw)) {
      const base = getBaseOrigin();
      const url = new URL(raw, base);

      if (url.origin !== base) {
        return DEFAULT_ROUTE;
      }

      if (url.hash && isHashRouterPath(url.hash)) {
        return normalizeHashRouterPath(url.hash);
      }

      return `${url.pathname || DEFAULT_ROUTE}${url.search || ""}${url.hash || ""}`;
    }
  } catch {
    return DEFAULT_ROUTE;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return DEFAULT_ROUTE;
  }

  return raw;
}

export function fallbackNormalizePath(value = DEFAULT_ROUTE) {
  const raw = rawPathFromUrlLike(value);
  const { pathname, search, hash } = splitPath(raw);

  if (isBlockedPath(pathname)) return DEFAULT_ROUTE;

  return `${pathname}${search}${hash}`;
}

export function stripSearchAndHash(path = DEFAULT_ROUTE) {
  return splitPath(fallbackNormalizePath(path)).pathname || DEFAULT_ROUTE;
}

export function getSearchAndHash(path = DEFAULT_ROUTE) {
  const { search, hash } = splitPath(fallbackNormalizePath(path));
  return `${search}${hash}`;
}

export function stripUsernamePrefix(path = DEFAULT_ROUTE) {
  const normalized = fallbackNormalizePath(path);
  const { pathname, search, hash } = splitPath(normalized);
  const parts = pathname.split("/").filter(Boolean);

  if (parts[0]?.startsWith("@")) {
    return fallbackNormalizePath(`/${parts.slice(1).join("/")}${search}${hash}`);
  }

  return normalized;
}

export function normalizePath(path = DEFAULT_ROUTE) {
  return fallbackNormalizePath(path || DEFAULT_ROUTE);
}

export function normalizePublicPath(path = DEFAULT_ROUTE) {
  return fallbackNormalizePath(path || DEFAULT_ROUTE);
}

export function normalizeCanonicalPath(path = DEFAULT_ROUTE) {
  return stripSearchAndHash(stripUsernamePrefix(path || DEFAULT_ROUTE));
}

export function pathFromUrlLike(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";
  return fallbackNormalizePath(raw);
}

export function getCurrentPublicPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  try {
    const hash = window.location.hash || "";

    if (hash && isHashRouterPath(hash)) {
      return normalizePublicPath(normalizeHashRouterPath(hash));
    }

    return normalizePublicPath(
      `${window.location.pathname || DEFAULT_ROUTE}${window.location.search || ""}${hash}`
    );
  } catch {
    return DEFAULT_ROUTE;
  }
}

export function getCurrentCanonicalPath() {
  return normalizeCanonicalPath(getCurrentPublicPath());
}

export function configLikeRoute(path = DEFAULT_ROUTE) {
  return normalizePath(path || DEFAULT_ROUTE);
}

/* =========================================================
   ROUTES
========================================================= */

function routeEquals(path = DEFAULT_ROUTE, route = DEFAULT_ROUTE) {
  return normalizeCanonicalPath(path).toLowerCase() === normalizeCanonicalPath(route).toLowerCase();
}

export function isAuthRoute(path = getCurrentPublicPath()) {
  return AUTH_ROUTES.some((route) => routeEquals(path, route));
}

export function isPublicTechnicalRoute(path = getCurrentPublicPath()) {
  return PUBLIC_ROUTES.some((route) => routeEquals(path, route));
}

export function isActivationRoute(path = getCurrentPublicPath()) {
  return routeEquals(path, ACTIVATE_ACCOUNT_PATH);
}

export function isResetPasswordRoute(path = getCurrentPublicPath()) {
  return routeEquals(path, PASSWORD_RESET_PATH) || routeEquals(path, PASSWORD_REQUEST_PATH);
}

export function isResetPasswordConfirmRoute(path = getCurrentPublicPath()) {
  return routeEquals(path, PASSWORD_RESET_PATH);
}

export function isForgotPasswordRoute(path = getCurrentPublicPath()) {
  return routeEquals(path, PASSWORD_REQUEST_PATH);
}

export function isTwoFactorRoute() {
  return false;
}

/* =========================================================
   REDIRECT SAFETY
========================================================= */

function hasRedirectRisk(path = "") {
  const raw = safeText(path, "");
  const lower = raw.toLowerCase();

  if (!raw) return true;
  if (raw.startsWith("//")) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return true;
  if (/[\r\n\t\\]/.test(raw)) return true;
  if (lower.includes("%0d") || lower.includes("%0a") || lower.includes("%09") || lower.includes("%5c")) return true;

  try {
    const decoded = decodeURIComponent(raw).replace(/\\/g, "/").trim();

    return (
      decoded.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:/i.test(decoded) ||
      /[\r\n\t]/.test(decoded)
    );
  } catch {
    return true;
  }
}

export function isSafeRelativePath(path = "") {
  const raw = safeText(path, "");

  if (!raw || !raw.startsWith("/")) return false;
  if (hasRedirectRisk(raw)) return false;
  if (isBlockedPath(raw)) return false;

  return true;
}

export function sanitizeRedirectPath(path = DEFAULT_ROUTE, fallback = DEFAULT_ROUTE) {
  const fallbackPath = isSafeRelativePath(fallback)
    ? normalizePublicPath(fallback)
    : DEFAULT_ROUTE;

  if (!isSafeRelativePath(path)) return fallbackPath;

  return normalizePublicPath(path);
}

export function buildSafeRedirectParam(path = DEFAULT_ROUTE) {
  return encodeURIComponent(sanitizeRedirectPath(path, DEFAULT_ROUTE));
}

/* =========================================================
   USER / SLUG
========================================================= */

export function sanitizeUsername(value = "") {
  const max = clampNumber(
    AUTH_CONSTANTS?.usernameMaxLength || AUTH_CONSTANTS?.identifierMaxLength || 80,
    1,
    160
  );

  let raw = String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/^@+/, "");

  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) {
    raw = raw.split("@")[0] || raw;
  }

  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/[._-]{2,}/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .toLowerCase()
    .slice(0, max);
}

export function slugify(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 160);
}

/* =========================================================
   TOKENS / SESSION VALUES
========================================================= */

function tokenMax(maxLength = AUTH_CONSTANTS?.tokenMaxLength) {
  return clampNumber(maxLength || 8192, 1, 32768);
}

function sessionMax(maxLength = AUTH_CONSTANTS?.sessionValueMaxLength) {
  return clampNumber(maxLength || 200, 1, 2048);
}

function unwrapToken(value = null) {
  if (value === null || value === undefined) return null;

  if (isObject(value)) {
    return value.token || value.accessToken || value.access_token || value.value || null;
  }

  return value;
}

export function normalizeTokenValue(token = null, maxLength = AUTH_CONSTANTS?.tokenMaxLength) {
  const candidate = unwrapToken(token);

  if (candidate === null || candidate === undefined) return null;

  let value = String(candidate).normalize("NFKC").trim();

  value = value.replace(/^Bearer\s+/i, "").trim();

  if (!value || isBadText(value) || /\s/.test(value)) return null;
  if (value.length > tokenMax(maxLength)) return null;

  return value;
}

export function normalizeSessionValue(value = null, maxLength = AUTH_CONSTANTS?.sessionValueMaxLength) {
  if (value === null || value === undefined) return null;

  const normalized = String(value).normalize("NFKC").trim().replace(/[\r\n\t]/g, "");

  if (!normalized || isBadText(normalized)) return null;
  if (normalized.length > sessionMax(maxLength)) return null;

  return normalized;
}

export function hasValidToken(token = null) {
  return Boolean(normalizeTokenValue(token));
}

/* =========================================================
   TOKEN PARAMS
========================================================= */

export function getAuthTokenParamNames() {
  if (Array.isArray(AUTH_TOKEN_PARAM_NAMES?.generic) && AUTH_TOKEN_PARAM_NAMES.generic.length) {
    return [...AUTH_TOKEN_PARAM_NAMES.generic];
  }

  return [TOKEN_PARAM];
}

export function getAllAuthTokenParamNames() {
  return [TOKEN_PARAM];
}

export function hasTokenInSearch(search = "", names = [TOKEN_PARAM]) {
  const raw = safeText(search, "");

  if (!raw) return false;

  try {
    const params = new URLSearchParams(raw.startsWith("?") ? raw : `?${raw}`);
    return names.some((name) => Boolean(safeText(params.get(name), "")));
  } catch {
    return false;
  }
}

export function extractTokenFromSearch(search = "", names = [TOKEN_PARAM]) {
  const raw = safeText(search, "");

  if (!raw) return null;

  try {
    const params = new URLSearchParams(raw.startsWith("?") ? raw : `?${raw}`);

    for (const name of names) {
      const token = normalizeTokenValue(params.get(name));
      if (token) return token;
    }
  } catch {
    return null;
  }

  return null;
}

/* Compat: no usamos tokens por path en el SPA mínimo. */
export function extractPathToken() {
  return null;
}

function extractTokenFromHash(hash = "", names = [TOKEN_PARAM]) {
  const value = safeText(hash, "");

  if (!value) return null;

  const body = value.replace(/^#/, "");

  if (!body) return null;

  if (body.includes("?")) {
    const query = body.slice(body.indexOf("?") + 1);
    return extractTokenFromSearch(query ? `?${query}` : "", names);
  }

  if (/^[^/?#=&]+=/i.test(body)) {
    return extractTokenFromSearch(`?${body}`, names);
  }

  return null;
}

export function extractActivationToken(pathOrUrl = getCurrentPublicPath()) {
  const path = pathFromUrlLike(pathOrUrl);
  const { search, hash } = splitPath(path);

  return extractTokenFromSearch(search) || extractTokenFromHash(hash);
}

export function extractResetToken(pathOrUrl = getCurrentPublicPath()) {
  const path = pathFromUrlLike(pathOrUrl);
  const { search, hash } = splitPath(path);

  return extractTokenFromSearch(search) || extractTokenFromHash(hash);
}

export function hasTokenInUrl(pathOrUrl = "") {
  const path = pathFromUrlLike(pathOrUrl);
  const { search, hash } = splitPath(path);

  return Boolean(
    extractTokenFromSearch(search) ||
      extractTokenFromHash(hash)
  );
}

export function hasActivationToken(pathOrUrl = getCurrentPublicPath()) {
  return isActivationRoute(pathOrUrl) && hasTokenInUrl(pathOrUrl);
}

export function hasResetToken(pathOrUrl = getCurrentPublicPath()) {
  return isResetPasswordRoute(pathOrUrl) && hasTokenInUrl(pathOrUrl);
}

/* =========================================================
   REDACTION
========================================================= */

export function redactTokenInText(value = "") {
  let output = safeText(value, "");

  if (!output) return "";

  output = output.replace(/([?&#](?:token|access_token|refresh_token|id_token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi, "$1***");

  try {
    output = output.replace(BEARER_RE, "$1***");
  } catch {
    // noop
  }

  try {
    output = output.replace(JWT_RE, "***");
  } catch {
    // noop
  }

  return output;
}

/* =========================================================
   ERRORS
========================================================= */

export function extractMessage(error) {
  if (!error) return "Error de autenticación";
  if (typeof error === "string") return redactTokenInText(error) || "Error de autenticación";

  const candidates = [
    error?.data?.message,
    error?.data?.mensaje,
    error?.data?.error,
    error?.response?.data?.message,
    error?.response?.data?.mensaje,
    error?.response?.data?.error,
    error?.body?.message,
    error?.payload?.message,
    error?.message,
    error?.statusText,
    error?.reason,
  ];

  for (const item of candidates) {
    const message = safeText(item, "");
    if (message) return redactTokenInText(message);
  }

  return "Error de autenticación";
}

export function buildErrorPayload(error) {
  return {
    error,
    message: extractMessage(error),
  };
}

export function buildSafeErrorPayload(error) {
  return {
    message: extractMessage(error),
    name: error?.name || "Error",
    status: error?.status || error?.statusCode || error?.response?.status || 0,
    code: error?.code || error?.data?.code || error?.response?.data?.code || null,
    timeout: error?.timeout === true,
    aborted: error?.aborted === true,
  };
}

/* =========================================================
   PAYLOAD
========================================================= */

export function compactPayload(payload = {}) {
  if (!isObject(payload)) return {};

  const output = {};

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null || value === "") continue;
    output[key] = value;
  }

  return output;
}

export function sanitizeAuthPayload(payload = {}, depth = 0, seen = new WeakSet()) {
  if (depth > 4) return "[depth-limit]";
  if (payload === null || payload === undefined) return payload;
  if (payload instanceof Error) return buildSafeErrorPayload(payload);
  if (typeof payload === "string") return redactTokenInText(payload);
  if (typeof payload !== "object") return payload;

  try {
    if (seen.has(payload)) return "[circular]";
    seen.add(payload);
  } catch {
    // noop
  }

  if (Array.isArray(payload)) {
    return payload.slice(0, 50).map((item) => sanitizeAuthPayload(item, depth + 1, seen));
  }

  const output = {};

  for (const [key, value] of Object.entries(payload).slice(0, 80)) {
    output[key] = SENSITIVE_KEY_RE.test(key)
      ? value
        ? "***"
        : value
      : sanitizeAuthPayload(value, depth + 1, seen);
  }

  return output;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getAuthHelpersSnapshot() {
  const publicPath = getCurrentPublicPath();

  return {
    version: AUTH_HELPERS_VERSION,

    publicPath: redactTokenInText(publicPath),
    canonicalPath: redactTokenInText(normalizeCanonicalPath(publicPath)),

    isAuthRoute: isAuthRoute(publicPath),
    isPublicTechnicalRoute: isPublicTechnicalRoute(publicPath),
    isActivationRoute: isActivationRoute(publicPath),
    isResetPasswordRoute: isResetPasswordRoute(publicPath),
    isResetPasswordConfirmRoute: isResetPasswordConfirmRoute(publicPath),
    isForgotPasswordRoute: isForgotPasswordRoute(publicPath),
    isTwoFactorRoute: false,

    hasActivationToken: hasActivationToken(publicPath),
    hasResetToken: hasResetToken(publicPath),

    policy: {
      tokenParam: TOKEN_PARAM,

      pureHelpers: true,

      ownStorage: false,
      ownSession: false,
      ownRouter: false,
      ownHttp: false,
      ownToast: false,

      noLegacyRoutes: true,
      blocksLegacyRoutes: true,

      no2fa: true,
      noMfa: true,
      noOtp: true,

      snapshotRedacted: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  AUTH_HELPERS_VERSION,

  isBrowser,

  safeText,
  safeNumber,
  safeInt,
  clampNumber,
  safeBool,
  isObject,
  isPlainObject,
  isFn,
  safeArray,
  toArray,
  safeClone,

  isHashRouterPath,
  normalizeHashRouterPath,
  normalizePathnameOnly,
  splitPath,
  fallbackNormalizePath,
  stripSearchAndHash,
  getSearchAndHash,
  stripUsernamePrefix,
  normalizePath,
  normalizePublicPath,
  normalizeCanonicalPath,
  pathFromUrlLike,

  getCurrentPublicPath,
  getCurrentCanonicalPath,
  configLikeRoute,

  isAuthRoute,
  isPublicTechnicalRoute,
  isActivationRoute,
  isResetPasswordRoute,
  isResetPasswordConfirmRoute,
  isForgotPasswordRoute,
  isTwoFactorRoute,

  isSafeRelativePath,
  sanitizeRedirectPath,
  buildSafeRedirectParam,

  sanitizeUsername,
  slugify,

  normalizeTokenValue,
  normalizeSessionValue,
  hasValidToken,

  getAuthTokenParamNames,
  getAllAuthTokenParamNames,
  hasTokenInSearch,
  hasTokenInUrl,
  extractTokenFromSearch,
  extractPathToken,
  extractActivationToken,
  extractResetToken,
  hasActivationToken,
  hasResetToken,

  redactTokenInText,

  extractMessage,
  buildErrorPayload,
  buildSafeErrorPayload,

  compactPayload,
  sanitizeAuthPayload,

  getAuthHelpersSnapshot,
};
