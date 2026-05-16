/* =========================================================
   Onion SPA - Auth Helpers
   Archivo: src/features/auth/helpers.js

   AUTH HELPERS · FINAL SIMPLE
   - Utilidades puras para Auth
   - Path público conserva query/hash
   - Path canónico elimina query/hash y /@usuario
   - Rutas técnicas con token no se rompen
   - Tokens no se truncan: si exceden límite, se invalidan
   - Sin AppCore, storage, sesión, Router, Toast ni transporte
========================================================= */

import {
  AUTH_CONSTANTS,
  AUTH_PUBLIC_TECHNICAL_ROUTES,
  AUTH_TOKEN_PARAM_NAMES,
} from "./constants.js";

/* =========================================================
   META / CONSTANTS
========================================================= */

export const AUTH_HELPERS_VERSION = "20.0.0-final";

const DEFAULT_ROUTE = "/";
const LOCAL_ORIGIN = "http://localhost";

const DEFAULT_USERNAME_MAX = 80;
const DEFAULT_SLUG_MAX = 160;
const DEFAULT_TOKEN_MAX = 8192;
const DEFAULT_SESSION_VALUE_MAX = 200;
const SESSION_VALUE_ABSOLUTE_MAX = 2048;
const URL_MAX = 4096;
const SANITIZE_MAX_DEPTH = 4;

const BAD_TEXT = new Set([
  "",
  "undefined",
  "null",
  "false",
  "true",
  "none",
  "nan",
  "[object object]",
  "{}",
  "[]",
  "\"undefined\"",
  "\"null\"",
  "\"false\"",
  "\"true\"",
  "\"\"",
  "''",
]);

const AUTH_ROUTES = Object.freeze([
  "/login",
  "/signin",
  "/sign-in",
  "/auth",
  "/auth/login",
  "/forgot-password",
  "/recover",
  "/recover-password",
  "/reset-password",
  "/reset-password/confirm",
  "/reset-password-confirm",
  "/password-reset",
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
]);

const DEFAULT_PUBLIC_ROUTES = Object.freeze([
  "/activate-account",
  "/activate",
  "/activation",
  "/account/activate",
  "/activate/first-user",
  "/reset-password",
  "/reset-password/confirm",
  "/reset-password-confirm",
  "/password-reset",
  "/password-reset/confirm",
  "/password-reset-confirm",
  "/confirm-reset-password",
  "/forgot-password",
  "/recover-password",
  "/2fa",
  "/otp",
  "/mfa",
]);

const ACTIVATION_BASES = Object.freeze([
  "/activate/first-user",
  "/account/activate",
  "/activate-account",
  "/activation",
  "/activate",
]);

const RESET_CONFIRM_BASES = Object.freeze([
  "/reset-password/confirm",
  "/password-reset/confirm",
  "/reset-password-confirm",
  "/password-reset-confirm",
  "/confirm-reset-password",
]);

const CANONICAL_COLLAPSE = Object.freeze([
  ...ACTIVATION_BASES.map((base) => ({ base, canonical: "/activate-account" })),
  ...RESET_CONFIRM_BASES.map((base) => ({ base, canonical: "/reset-password/confirm" })),
]);

const FALLBACK_TOKEN_NAMES = Object.freeze({
  generic: Object.freeze(["token", "code", "t"]),
  activation: Object.freeze(["token", "activationToken", "activateToken", "activation_token", "activate_token", "code", "t"]),
  reset: Object.freeze(["token", "resetToken", "passwordResetToken", "confirmToken", "reset_token", "password_reset_token", "confirm_token", "code", "t"]),
  auth: Object.freeze(["token", "accessToken", "access_token", "refreshToken", "refresh_token", "idToken", "id_token", "authToken", "auth_token", "jwt", "bearer"]),
  twoFactor: Object.freeze(["tempToken", "temp_token", "temporaryToken", "temporary_token", "challengeToken", "challenge_token", "twoFactorToken", "two_factor_token", "mfaToken", "mfa_token", "code", "otp", "totp", "t"]),
});

const SENSITIVE_KEY_RE = /token|authorization|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|cookie|csrf|xsrf/i;
const JWT_RE = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const BEARER_RE = /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi;

/* =========================================================
   BASE
========================================================= */

export function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

export function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function safeInt(value, fallback = 0) {
  return Math.trunc(safeNumber(value, fallback));
}

export function clampNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Math.min(Math.max(safeNumber(value, min), min), max);
}

export function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === 1) return true;
  if (value === 0) return false;

  const text = safeText(value, "").toLowerCase();
  if (["true", "1", "yes", "si", "sí", "ok", "on", "enabled", "active"].includes(text)) return true;
  if (["false", "0", "no", "off", "disabled", "inactive"].includes(text)) return false;

  return Boolean(fallback);
}

export function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const isPlainObject = isObject;
export const isFn = (value) => typeof value === "function";

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

export function safeClone(value, fallback = null) {
  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback === undefined ? value : fallback;
  }
}

function safeLower(value = "") {
  return safeText(value, "").toLowerCase();
}

function unique(values = []) {
  return [
    ...new Set(
      toArray(values)
        .flat(Infinity)
        .map((item) => safeText(item, ""))
        .filter(Boolean)
    ),
  ];
}

function escapeRegExp(value = "") {
  return safeText(value, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isBadText(value = "") {
  return BAD_TEXT.has(safeLower(value));
}

function limitUrl(value = "") {
  return safeText(value, "").slice(0, URL_MAX);
}

/* =========================================================
   URL / PATH
========================================================= */

function getBaseOrigin() {
  if (isBrowser() && window.location?.origin) return window.location.origin;
  return LOCAL_ORIGIN;
}

export function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

export function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");
  if (!raw) return DEFAULT_ROUTE;
  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  return raw.replace(/^#\/?/, "/") || DEFAULT_ROUTE;
}

function normalizeSearch(search = "") {
  const value = safeText(search, "");
  if (!value) return "";
  return value.startsWith("?") ? value : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value = safeText(hash, "");
  if (!value) return "";
  return value.startsWith("#") ? value : `#${value.replace(/^#+/, "")}`;
}

export function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
  let value = safeText(pathname, DEFAULT_ROUTE)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  const segments = [];

  for (const segment of value.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  value = `/${segments.join("/")}` || DEFAULT_ROUTE;
  if (value.length > 1) value = value.replace(/\/+$/g, "") || DEFAULT_ROUTE;

  return value;
}

export function splitPath(path = DEFAULT_ROUTE) {
  const raw = limitUrl(path) || DEFAULT_ROUTE;

  if (isHashRouterPath(raw)) return splitPath(normalizeHashRouterPath(raw));

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

export function fallbackNormalizePath(value = DEFAULT_ROUTE) {
  const raw = limitUrl(value) || DEFAULT_ROUTE;

  if (isHashRouterPath(raw)) return fallbackNormalizePath(normalizeHashRouterPath(raw));

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed = new URL(raw, getBaseOrigin());
      if (parsed.hash && isHashRouterPath(parsed.hash)) return fallbackNormalizePath(normalizeHashRouterPath(parsed.hash));
      return fallbackNormalizePath(`${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`);
    }
  } catch {}

  const { pathname, search, hash } = splitPath(raw);
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
  const stripped = pathname.replace(/^\/@[^/]+(?=\/|$)/i, "") || DEFAULT_ROUTE;
  return fallbackNormalizePath(`${normalizePathnameOnly(stripped)}${search}${hash}`);
}

function collapseCanonical(pathname = DEFAULT_ROUTE) {
  const clean = normalizePathnameOnly(pathname);

  for (const rule of CANONICAL_COLLAPSE) {
    if (clean === rule.base || clean.startsWith(`${rule.base}/`)) return rule.canonical;
  }

  return clean;
}

export function normalizePath(path = DEFAULT_ROUTE) {
  return fallbackNormalizePath(path || DEFAULT_ROUTE);
}

export function normalizePublicPath(path = DEFAULT_ROUTE) {
  return fallbackNormalizePath(path || DEFAULT_ROUTE);
}

export function normalizeCanonicalPath(path = DEFAULT_ROUTE) {
  return collapseCanonical(stripSearchAndHash(stripUsernamePrefix(path || DEFAULT_ROUTE)));
}

export function pathFromUrlLike(value = "") {
  const raw = limitUrl(value);
  if (!raw) return "";
  if (isHashRouterPath(raw)) return fallbackNormalizePath(normalizeHashRouterPath(raw));

  try {
    const parsed = new URL(raw, getBaseOrigin());
    if (parsed.hash && isHashRouterPath(parsed.hash)) return fallbackNormalizePath(normalizeHashRouterPath(parsed.hash));
    return fallbackNormalizePath(`${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`);
  } catch {
    return fallbackNormalizePath(raw);
  }
}

/* =========================================================
   CURRENT PATHS
========================================================= */

export function getCurrentPublicPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  try {
    const pathname = window.location.pathname || DEFAULT_ROUTE;
    const search = window.location.search || "";
    const hash = window.location.hash || "";

    if (hash && isHashRouterPath(hash)) return normalizePublicPath(normalizeHashRouterPath(hash));
    return normalizePublicPath(`${pathname}${search}${hash}`);
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

function routeStartsWith(path = DEFAULT_ROUTE, candidate = DEFAULT_ROUTE) {
  const cleanPath = normalizeCanonicalPath(path).toLowerCase();
  const cleanCandidate = normalizeCanonicalPath(candidate).toLowerCase();
  return cleanPath === cleanCandidate || cleanPath.startsWith(`${cleanCandidate}/`);
}

export function isAuthRoute(path = isBrowser() ? window.location.pathname : DEFAULT_ROUTE) {
  return AUTH_ROUTES.some((route) => routeStartsWith(path, route));
}

export function isPublicTechnicalRoute(path = getCurrentPublicPath()) {
  const configured = Array.isArray(AUTH_PUBLIC_TECHNICAL_ROUTES) ? AUTH_PUBLIC_TECHNICAL_ROUTES : [];
  const routes = unique([...DEFAULT_PUBLIC_ROUTES, ...configured]);
  return routes.some((route) => routeStartsWith(path, route));
}

export function isActivationRoute(path = getCurrentPublicPath()) {
  return ACTIVATION_BASES.some((route) => routeStartsWith(path, route));
}

export function isResetPasswordRoute(path = getCurrentPublicPath()) {
  return routeStartsWith(path, "/reset-password") || routeStartsWith(path, "/password-reset");
}

export function isResetPasswordConfirmRoute(path = getCurrentPublicPath()) {
  return RESET_CONFIRM_BASES.some((route) => routeStartsWith(path, route));
}

export function isForgotPasswordRoute(path = getCurrentPublicPath()) {
  return routeStartsWith(path, "/forgot-password") || routeStartsWith(path, "/recover") || routeStartsWith(path, "/recover-password") || routeStartsWith(path, "/password-reset");
}

export function isTwoFactorRoute(path = getCurrentPublicPath()) {
  return routeStartsWith(path, "/2fa") || routeStartsWith(path, "/otp") || routeStartsWith(path, "/mfa");
}

/* =========================================================
   REDIRECT SAFETY
========================================================= */

function hasEncodedRedirectRisk(path = "") {
  const raw = safeText(path, "");
  const lower = raw.toLowerCase();
  if (!raw) return true;

  if (lower.includes("%0d") || lower.includes("%0a") || lower.includes("%09") || lower.includes("%5c") || raw.includes("\\")) {
    return true;
  }

  try {
    const decoded = decodeURIComponent(raw).trim().replace(/\\/g, "/");
    return decoded.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(decoded) || /[\r\n\t]/.test(decoded);
  } catch {
    return true;
  }
}

export function isSafeRelativePath(path = "") {
  const raw = limitUrl(path);
  return Boolean(raw && raw.startsWith("/") && !raw.startsWith("//") && !/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/[\r\n\t]/.test(raw) && !hasEncodedRedirectRisk(raw));
}

export function sanitizeRedirectPath(path = DEFAULT_ROUTE, fallback = DEFAULT_ROUTE) {
  const fallbackPath = isSafeRelativePath(fallback) ? normalizePublicPath(fallback) : DEFAULT_ROUTE;
  const raw = limitUrl(path);

  if (!isSafeRelativePath(raw)) return fallbackPath;

  const candidate = normalizePublicPath(raw);
  if (!isSafeRelativePath(candidate)) return fallbackPath;
  if (isAuthRoute(candidate) && !isPublicTechnicalRoute(candidate)) return fallbackPath;

  return candidate;
}

export function buildSafeRedirectParam(path = DEFAULT_ROUTE) {
  return encodeURIComponent(sanitizeRedirectPath(path, DEFAULT_ROUTE));
}

/* =========================================================
   USER / SLUG
========================================================= */

export function sanitizeUsername(value = "") {
  const max = clampNumber(AUTH_CONSTANTS?.usernameMaxLength || AUTH_CONSTANTS?.identifierMaxLength || DEFAULT_USERNAME_MAX, 1, 160);

  let raw = String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/^@+/, "");

  if (raw.includes("@") && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) raw = raw.split("@")[0] || raw;

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
    .slice(0, DEFAULT_SLUG_MAX);
}

/* =========================================================
   TOKENS / SESSION VALUES
========================================================= */

function tokenMax(maxLength = AUTH_CONSTANTS?.tokenMaxLength) {
  return clampNumber(maxLength || DEFAULT_TOKEN_MAX, 1, 32768);
}

function sessionMax(maxLength = AUTH_CONSTANTS?.sessionValueMaxLength) {
  return clampNumber(maxLength || DEFAULT_SESSION_VALUE_MAX, 1, SESSION_VALUE_ABSOLUTE_MAX);
}

function unwrapToken(value = null) {
  if (value === null || value === undefined) return null;

  if (isObject(value)) {
    for (const key of ["token", "accessToken", "access_token", "refreshToken", "refresh_token", "tempToken", "temp_token", "value", "raw", "data"]) {
      if (value[key] !== null && value[key] !== undefined && value[key] !== "") return value[key];
    }
    return null;
  }

  return value;
}

export function normalizeTokenValue(token = null, maxLength = AUTH_CONSTANTS?.tokenMaxLength) {
  const candidate = unwrapToken(token);
  if (candidate === null || candidate === undefined) return null;

  let value = String(candidate).normalize("NFKC").trim();
  if (/^bearer\s+/i.test(value)) value = value.replace(/^bearer\s+/i, "").trim();

  if (!value || isBadText(value) || /[\r\n\t\s]/.test(value)) return null;
  if (value.length > tokenMax(maxLength)) return null;

  return value;
}

export function normalizeSessionValue(value = null, maxLength = AUTH_CONSTANTS?.sessionValueMaxLength) {
  if (value === null || value === undefined) return null;

  const normalized = String(value).normalize("NFKC").trim().replace(/[\r\n\t]/g, "");
  if (!normalized || isBadText(normalized)) return null;

  return normalized.slice(0, sessionMax(maxLength));
}

export function hasValidToken(token = null) {
  return Boolean(normalizeTokenValue(token));
}

/* =========================================================
   TOKEN PARAMS / EXTRACTORS
========================================================= */

function constantTokenNames(type = "generic") {
  if (Array.isArray(AUTH_TOKEN_PARAM_NAMES)) return AUTH_TOKEN_PARAM_NAMES;
  if (AUTH_TOKEN_PARAM_NAMES && Array.isArray(AUTH_TOKEN_PARAM_NAMES[type])) return AUTH_TOKEN_PARAM_NAMES[type];
  return [];
}

export function getAuthTokenParamNames(type = "generic") {
  const cleanType = safeText(type, "generic");
  return unique([...constantTokenNames(cleanType), ...(FALLBACK_TOKEN_NAMES[cleanType] || FALLBACK_TOKEN_NAMES.generic)]);
}

export function getAllAuthTokenParamNames() {
  const constantNames = [];

  if (Array.isArray(AUTH_TOKEN_PARAM_NAMES)) {
    constantNames.push(...AUTH_TOKEN_PARAM_NAMES);
  } else if (AUTH_TOKEN_PARAM_NAMES && typeof AUTH_TOKEN_PARAM_NAMES === "object") {
    for (const value of Object.values(AUTH_TOKEN_PARAM_NAMES)) {
      if (Array.isArray(value)) constantNames.push(...value);
    }
  }

  return unique([...Object.values(FALLBACK_TOKEN_NAMES).flat(), ...constantNames]);
}

export function hasTokenInSearch(search = "", names = []) {
  const finalNames = Array.isArray(names) && names.length ? names : getAuthTokenParamNames("generic");

  try {
    const params = new URLSearchParams(safeText(search, "").startsWith("?") ? search : `?${search}`);
    return finalNames.some((name) => Boolean(safeText(params.get(name), "")));
  } catch {
    return false;
  }
}

export function extractTokenFromSearch(search = "", names = []) {
  const finalNames = Array.isArray(names) && names.length ? names : getAuthTokenParamNames("generic");

  try {
    const params = new URLSearchParams(safeText(search, "").startsWith("?") ? search : `?${search}`);

    for (const name of finalNames) {
      const token = normalizeTokenValue(params.get(name));
      if (token) return token;
    }
  } catch {}

  return null;
}

export function extractPathToken(path = "", basePath = "") {
  const pathname = stripSearchAndHash(stripUsernamePrefix(normalizePublicPath(path)));
  const base = normalizeCanonicalPath(basePath);

  if (!base || !pathname.startsWith(`${base}/`)) return null;

  const rawToken = pathname.slice(`${base}/`.length).split("/")[0];

  try {
    return normalizeTokenValue(decodeURIComponent(rawToken || ""));
  } catch {
    return normalizeTokenValue(rawToken);
  }
}

function extractPathTokenFromBases(path = "", bases = []) {
  for (const base of [...bases].sort((a, b) => b.length - a.length)) {
    const token = extractPathToken(path, base);
    if (token) return token;
  }
  return null;
}

function extractTokenFromHashQuery(hash = "", names = []) {
  const value = safeText(hash, "");
  if (!value || !value.includes("?")) return null;

  const query = value.split("?").slice(1).join("?");
  return extractTokenFromSearch(query ? `?${query}` : "", names);
}

export function extractActivationToken(pathOrUrl = getCurrentPublicPath()) {
  const path = pathFromUrlLike(pathOrUrl);
  const pathToken = extractPathTokenFromBases(path, ACTIVATION_BASES);
  if (pathToken) return pathToken;

  const { search, hash } = splitPath(path);
  return extractTokenFromSearch(search, getAuthTokenParamNames("activation")) || extractTokenFromHashQuery(hash, getAuthTokenParamNames("activation"));
}

export function extractResetToken(pathOrUrl = getCurrentPublicPath()) {
  const path = pathFromUrlLike(pathOrUrl);
  const pathToken = extractPathTokenFromBases(path, RESET_CONFIRM_BASES);
  if (pathToken) return pathToken;

  const { search, hash } = splitPath(path);
  return extractTokenFromSearch(search, getAuthTokenParamNames("reset")) || extractTokenFromHashQuery(hash, getAuthTokenParamNames("reset"));
}

export function hasTokenInUrl(pathOrUrl = "", type = "generic") {
  const path = pathFromUrlLike(pathOrUrl);
  if (!path) return false;

  const { search, hash } = splitPath(path);
  const names = getAuthTokenParamNames(type);

  if (hasTokenInSearch(search, names)) return true;

  if (hash && hash.includes("?")) {
    const query = hash.split("?").slice(1).join("?");
    return hasTokenInSearch(query ? `?${query}` : "", names);
  }

  return false;
}

export function hasActivationToken(pathOrUrl = getCurrentPublicPath()) {
  return Boolean(extractActivationToken(pathOrUrl));
}

export function hasResetToken(pathOrUrl = getCurrentPublicPath()) {
  return Boolean(extractResetToken(pathOrUrl));
}

/* =========================================================
   REDACTION
========================================================= */

function redactQueryTokens(value = "") {
  let output = safeText(value, "");

  for (const name of getAllAuthTokenParamNames()) {
    try {
      output = output.replace(new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"), "$1***");
    } catch {}
  }

  return output;
}

function redactJsonTokenFields(value = "") {
  let output = safeText(value, "");
  const names = unique([...getAllAuthTokenParamNames(), "authorization", "password", "secret", "otp", "totp", "cookie", "csrf", "xsrf"]);

  for (const name of names) {
    const escaped = escapeRegExp(name);

    try {
      output = output.replace(new RegExp(`("${escaped}"\\s*:\\s*")([^"]+)(")`, "gi"), "$1***$3");
    } catch {}

    try {
      output = output.replace(new RegExp(`('${escaped}'\\s*:\\s*')([^']+)(')`, "gi"), "$1***$3");
    } catch {}
  }

  return output;
}

function redactPathTokens(value = "") {
  let output = safeText(value, "");

  for (const base of [...ACTIVATION_BASES, ...RESET_CONFIRM_BASES]) {
    try {
      output = output.replace(new RegExp(`(${escapeRegExp(base)}/)([^/?#\\s]+)`, "gi"), "$1***");
    } catch {}
  }

  return output;
}

export function redactTokenInText(value = "") {
  let output = safeText(value, "");
  if (!output) return "";

  output = redactQueryTokens(output);
  output = redactPathTokens(output);
  output = redactJsonTokenFields(output);

  try {
    output = output.replace(BEARER_RE, "$1***");
  } catch {}

  try {
    output = output.replace(JWT_RE, "***");
  } catch {}

  return output;
}

/* =========================================================
   ERRORS
========================================================= */

export function extractMessage(error) {
  if (!error) return "Error de autenticación";
  if (typeof error === "string") return redactTokenInText(error) || "Error de autenticación";

  const firstArrayError = Array.isArray(error?.errors)
    ? error.errors[0]
    : Array.isArray(error?.data?.errors)
      ? error.data.errors[0]
      : Array.isArray(error?.response?.data?.errors)
        ? error.response.data.errors[0]
        : null;

  const candidates = [
    firstArrayError?.message,
    firstArrayError?.detail,
    typeof firstArrayError === "string" ? firstArrayError : "",
    error?.data?.message,
    error?.data?.mensaje,
    error?.data?.detail,
    error?.data?.error,
    error?.data?.title,
    error?.data?.description,
    error?.response?.data?.message,
    error?.response?.data?.mensaje,
    error?.response?.data?.detail,
    error?.response?.data?.error,
    error?.response?.data?.title,
    error?.response?.data?.description,
    error?.body?.message,
    error?.body?.mensaje,
    error?.body?.detail,
    error?.body?.error,
    error?.payload?.message,
    error?.payload?.mensaje,
    error?.payload?.error,
    error?.result?.message,
    error?.result?.mensaje,
    error?.result?.error,
    error?.message,
    error?.statusText,
    error?.reason?.message,
    error?.reason,
  ];

  for (const item of candidates) {
    const text = safeText(item, "");
    if (text) return redactTokenInText(text);
  }

  return "Error de autenticación";
}

export function buildErrorPayload(error) {
  return { error, message: extractMessage(error) };
}

export function buildSafeErrorPayload(error) {
  return {
    message: extractMessage(error),
    name: error?.name || "Error",
    status: error?.status || error?.statusCode || error?.response?.status || error?.data?.status || 0,
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
  if (depth > SANITIZE_MAX_DEPTH) return "[depth-limit]";
  if (payload === null || payload === undefined) return payload;
  if (payload instanceof Error) return buildSafeErrorPayload(payload);
  if (Array.isArray(payload)) return payload.slice(0, 50).map((item) => sanitizeAuthPayload(item, depth + 1, seen));
  if (!isObject(payload)) return typeof payload === "string" ? redactTokenInText(payload) : payload;

  try {
    if (seen.has(payload)) return "[circular]";
    seen.add(payload);
  } catch {}

  const output = {};

  for (const [key, value] of Object.entries(payload).slice(0, 80)) {
    output[key] = SENSITIVE_KEY_RE.test(key) ? (value ? "***" : value) : sanitizeAuthPayload(value, depth + 1, seen);
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
    canonicalPath: normalizeCanonicalPath(publicPath),
    isAuthRoute: isAuthRoute(publicPath),
    isPublicTechnicalRoute: isPublicTechnicalRoute(publicPath),
    isActivationRoute: isActivationRoute(publicPath),
    isResetPasswordRoute: isResetPasswordRoute(publicPath),
    isResetPasswordConfirmRoute: isResetPasswordConfirmRoute(publicPath),
    isForgotPasswordRoute: isForgotPasswordRoute(publicPath),
    isTwoFactorRoute: isTwoFactorRoute(publicPath),
    hasActivationToken: hasActivationToken(publicPath),
    hasResetToken: hasResetToken(publicPath),
    policy: {
      pureHelpers: true,
      ownStorage: false,
      ownSession: false,
      ownRouter: false,
      ownHttp: false,
      ownToast: false,
    },
    at: new Date().toISOString(),
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
