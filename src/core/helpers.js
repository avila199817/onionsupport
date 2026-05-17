/* =========================================================
   Onion Support - Core Helpers
   Archivo: /src/core/helpers.js

   Responsabilidad:
   - Helpers puros mínimos.
   - Sin fetch.
   - Sin storage real.
   - Sin Auth.
   - Sin Router.
   - Sin Store.
   - Sin Toast.
   - Token param único: token.
   - /api/auth/me siempre privado.
   - Usuario inválido sólo si disabled.
   - Roles únicos: admin / user.
========================================================= */

import { config } from "./config.js";

export const HELPERS_VERSION = "simple";

const DEFAULT_ROUTE = "/";
const LOCAL_ORIGIN = "http://localhost";
const API_BASE = config?.apiBase || "https://api.onionit.net";
const TOKEN_PARAM = "token";

const PUBLIC_API_PATHS = [
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/activate",
  "/api/auth/reset-password-request",
  "/api/auth/reset-password-confirm",
];

const PRIVATE_API_PATHS = [
  "/api/auth/me",
  "/api/auth/logout",
  "/api/users",
  "/api/clientes",
  "/api/tickets",
  "/api/incidencias",
  "/api/facturas",
  "/api/search",
];

/* =========================================================
   BASICS
========================================================= */

export function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function isDocumentReady() {
  return isBrowser() && document.readyState !== "loading";
}

export function now() {
  return Date.now();
}

export function nowIso(ms = now()) {
  return new Date(ms).toISOString();
}

export function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export const isObject = isPlainObject;

export function isAnyObject(value) {
  return Boolean(value && typeof value === "object");
}

export function isFunction(value) {
  return typeof value === "function";
}

export function safeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

export function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function safeBool(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;

  const clean = safeLower(value, "");

  if (["true", "yes", "si", "sí", "on"].includes(clean)) return true;
  if (["false", "no", "off"].includes(clean)) return false;

  return Boolean(fallback);
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function safeObject(value, fallback = {}) {
  return isPlainObject(value) ? value : fallback;
}

export function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).filter(Boolean))];
}

export function firstNonEmpty(...values) {
  for (const value of values) {
    const clean = safeText(value, "");
    if (clean) return clean;
  }

  return "";
}

export function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function isDomScope(scope) {
  if (!isBrowser() || !scope) return false;

  return (
    scope === document ||
    scope === window ||
    scope instanceof Element ||
    scope instanceof Document ||
    scope instanceof DocumentFragment
  );
}

export function normalizeListenerOptions(options = false) {
  return typeof options === "boolean" ? { capture: options } : safeObject(options, {});
}

/* =========================================================
   CLONE / JSON / ERROR
========================================================= */

export function safeParse(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

export function safeStringify(value, fallback = "") {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

export function safeClone(value, fallback = null) {
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback;
    }
  }
}

export function cloneError(error = null) {
  if (!error) return null;

  return {
    name: error.name || "Error",
    message: redactTokenInText(error.message || String(error)),
    code: error.code || null,
    status: error.status || error.statusCode || null,
  };
}

/* =========================================================
   STORAGE COMPAT
========================================================= */

export function getStoragePrefix() {
  return config?.storagePrefix || "onion";
}

export function buildStorageKey(key = "") {
  return `${getStoragePrefix()}:${safeText(key, "")}`;
}

/* =========================================================
   REDACTION
========================================================= */

export function redactTokenInText(value = "") {
  return String(value || "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

export function redactSensitiveObject(value, fallback = null) {
  if (value === undefined) return fallback;
  if (value === null) return null;

  if (typeof value === "string") {
    return redactTokenInText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveObject(item, null));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const output = {};

  for (const [key, item] of Object.entries(value)) {
    if (/token|password|secret|authorization|cookie|jwt|refresh|access/i.test(key)) {
      output[key] = item ? "***" : item;
    } else {
      output[key] = redactSensitiveObject(item, null);
    }
  }

  return output;
}

/* =========================================================
   PATHS
========================================================= */

export function getBaseOrigin() {
  return isBrowser() ? window.location.origin : LOCAL_ORIGIN;
}

export function isAbsoluteUrl(value = "") {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(safeText(value, ""));
}

export function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

export function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, DEFAULT_ROUTE);

  if (raw.startsWith("#!")) return `/${raw.replace(/^#!\/?/, "")}` || DEFAULT_ROUTE;
  if (raw.startsWith("#/")) return `/${raw.replace(/^#\/?/, "")}` || DEFAULT_ROUTE;

  return raw;
}

export function normalizeSearch(search = "") {
  const raw = safeText(search, "");
  return raw ? (raw.startsWith("?") ? raw : `?${raw}`) : "";
}

export function normalizeHash(hash = "") {
  const raw = safeText(hash, "");
  return raw ? (raw.startsWith("#") ? raw : `#${raw}`) : "";
}

export function splitPathParts(path = DEFAULT_ROUTE) {
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

  return {
    pathname,
    search,
    hash,
    suffix: `${search}${hash}`,
  };
}

export function stripSearchAndHash(path = DEFAULT_ROUTE) {
  return normalizePathnameOnly(splitPathParts(path).pathname);
}

export function getSearchAndHash(path = DEFAULT_ROUTE) {
  return splitPathParts(path).suffix;
}

export function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
  let value = safeText(pathname, DEFAULT_ROUTE).replace(/\\/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/+/g, "/");

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "");
  }

  return value || DEFAULT_ROUTE;
}

export function normalizePath(path = DEFAULT_ROUTE) {
  if (path === null || path === undefined) return DEFAULT_ROUTE;

  let raw = safeText(path, DEFAULT_ROUTE);

  if (isHashRouterPath(raw)) {
    raw = normalizeHashRouterPath(raw);
  }

  if (isAbsoluteUrl(raw)) {
    try {
      const url = new URL(raw, getBaseOrigin());
      raw = `${url.pathname}${url.search}${url.hash}`;
    } catch {
      raw = DEFAULT_ROUTE;
    }
  }

  const { pathname, search, hash } = splitPathParts(raw);

  return `${normalizePathnameOnly(pathname)}${search}${hash}`;
}

export function stripUsernamePrefix(path = DEFAULT_ROUTE) {
  const normalized = normalizePath(path);
  const pathname = stripSearchAndHash(normalized);
  const suffix = getSearchAndHash(normalized);
  const parts = pathname.split("/").filter(Boolean);

  if (parts[0]?.startsWith("@")) {
    return normalizePath(`/${parts.slice(1).join("/")}${suffix}`);
  }

  return normalized;
}

export function normalizeCanonicalPath(path = DEFAULT_ROUTE) {
  return stripSearchAndHash(stripUsernamePrefix(normalizePath(path)));
}

export function normalizePublicPath(path = DEFAULT_ROUTE) {
  return normalizePath(path);
}

export function getCurrentLocationPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  return normalizePath(
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  );
}

export function getCurrentLocationCanonicalPath() {
  return normalizeCanonicalPath(getCurrentLocationPath());
}

/* =========================================================
   HREF
========================================================= */

export function isHashOnlyHref(href = "") {
  const value = safeText(href, "");
  return value.startsWith("#") && !isHashRouterPath(value);
}

export function isUnsafeHref(href = "") {
  return /^(javascript|data|vbscript):/i.test(safeText(href, ""));
}

export function isExternalHref(href = "") {
  const value = safeText(href, "");

  if (!value || isUnsafeHref(value) || !isAbsoluteUrl(value)) {
    return false;
  }

  if (!isBrowser()) return true;

  try {
    return new URL(value).origin !== window.location.origin;
  } catch {
    return false;
  }
}

/* =========================================================
   USERNAME / SLUG
========================================================= */

export function sanitizeUsername(value = "") {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/^@+/, "")
    .replace(/@.*$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/[._-]{2,}/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .toLowerCase()
    .slice(0, 64);
}

export function slugify(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 96);
}

export function buildPublicPath(path = DEFAULT_ROUTE, username = "") {
  const cleanPath = stripUsernamePrefix(normalizePublicPath(path));
  const cleanUser = sanitizeUsername(username);

  return cleanUser ? normalizePath(`/@${cleanUser}${cleanPath}`) : cleanPath;
}

/* =========================================================
   API / URL
========================================================= */

export function normalizeApiBase(base = API_BASE) {
  const raw = safeText(base, API_BASE).replace(/\/+$/g, "");

  if (!raw || raw === "/api" || raw === "api") return "";

  if (!isAbsoluteUrl(raw)) return raw;

  try {
    const url = new URL(raw);
    return url.pathname === "/api" ? url.origin : raw;
  } catch {
    return "";
  }
}

export function getSafeApiBase() {
  return normalizeApiBase(config?.apiBase || API_BASE) || API_BASE;
}

export function joinUrl(base = "", path = "") {
  if (isAbsoluteUrl(path)) return path;

  const root = normalizeApiBase(base).replace(/\/+$/g, "");
  const cleanPath = String(path || "").replace(/^\/+/g, "");

  return root ? `${root}/${cleanPath}` : `/${cleanPath}`;
}

export function buildUrl(path = "", query = null) {
  const baseUrl = joinUrl(getSafeApiBase(), path);

  if (!query || !isPlainObject(query)) return baseUrl;

  const url = new URL(baseUrl, getBaseOrigin());

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return isAbsoluteUrl(baseUrl) ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
}

function pathMatches(path = "", candidate = "") {
  const current = normalizeCanonicalPath(path);
  const target = normalizeCanonicalPath(candidate);

  return current === target || current.startsWith(`${target}/`);
}

export function isPublicApiPath(path = "") {
  const clean = normalizeCanonicalPath(path);

  if (clean === "/api/auth/me") return false;

  return PUBLIC_API_PATHS.some((item) => pathMatches(clean, item));
}

export function isPrivateApiPath(path = "") {
  const clean = normalizeCanonicalPath(path);

  if (clean === "/api/auth/me") return true;

  return PRIVATE_API_PATHS.some((item) => pathMatches(clean, item));
}

/* =========================================================
   TOKEN
========================================================= */

export function stripBearerPrefix(token = "") {
  return safeText(token, "").replace(/^Bearer\s+/i, "");
}

export function hasValidToken(token = null) {
  const value = stripBearerPrefix(token);

  if (!value) return false;
  if (/\s/.test(value)) return false;

  return !["null", "undefined", "false", "true", "[object object]"].includes(
    value.toLowerCase()
  );
}

/* =========================================================
   USER
========================================================= */

function userPayload(value = null) {
  if (!isPlainObject(value)) return null;

  return (
    value.user ||
    value.usuario ||
    value.me ||
    value.account ||
    value.profile ||
    value
  );
}

function userDisabled(user = {}) {
  return user.disabled === true || String(user.status || "").toLowerCase() === "disabled";
}

function normalizeRole(value = "") {
  return String(value).toLowerCase() === "admin" ? "admin" : "user";
}

export function normalizeUser(user = null) {
  const source = userPayload(user);

  if (!isPlainObject(source)) return null;
  if (userDisabled(source)) return null;

  const id = source.userId || source.id || null;
  const email = source.email || null;
  const username = sanitizeUsername(source.username || source.slug || email || id || "");

  if (!id && !username && !email) return null;

  const name =
    source.name ||
    source.fullName ||
    source.displayName ||
    source.nombre ||
    username ||
    email ||
    id ||
    "Usuario";

  const role = normalizeRole(source.role || source.rol);

  const avatar =
    source.avatarUrl ||
    source.avatar ||
    source.picture ||
    null;

  return {
    ...source,

    id,
    userId: source.userId || id,
    username,
    usernameLower: username,
    slug: source.slug || username,

    name,
    fullName: source.fullName || name,
    displayName: source.displayName || name,

    email,
    emailLower: email ? String(email).toLowerCase() : null,

    role,
    rol: role,
    roles: [role],

    avatar,
    avatarUrl: avatar,
    picture: avatar,
    hasAvatar: Boolean(avatar),

    active: true,
    disabled: false,
  };
}

export function isUsableUser(user = null) {
  return Boolean(normalizeUser(user));
}

export function getUserDisplayName(user = null) {
  const source = userPayload(user) || {};

  return (
    source.name ||
    source.fullName ||
    source.displayName ||
    source.nombre ||
    source.username ||
    source.email ||
    "Usuario"
  );
}

export function getUserUsername(user = null) {
  const source = userPayload(user) || {};
  return sanitizeUsername(source.username || source.slug || source.email || source.id || source.userId || "");
}

export function getUserAvatarUrl(user = null) {
  const source = userPayload(user) || {};
  return source.avatarUrl || source.avatar || source.picture || "";
}

export function getInitials(value = "") {
  const source = typeof value === "object" ? getUserDisplayName(value) : safeText(value, "");

  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 2);
}

/* =========================================================
   HOOKS / THEME
========================================================= */

export async function runHookSeries(hooks = [], payload = {}) {
  let current = payload;

  for (const hook of safeArray(hooks)) {
    if (typeof hook !== "function") continue;

    const result = await hook(current);

    if (result !== undefined) {
      current = result;
    }
  }

  return current;
}

export function getThemeColor(theme = "system") {
  return theme === "light" ? "#ffffff" : "#0a0c11";
}

/* =========================================================
   ABORT / HEADERS / NETWORK
========================================================= */

export function createAbortTimeout(ms = 30000) {
  if (typeof AbortController === "undefined") {
    return {
      controller: null,
      timeoutId: null,
      signal: null,
      clear: () => {},
    };
  }

  const controller = new AbortController();
  const timeout = Number(ms);

  if (!Number.isFinite(timeout) || timeout <= 0) {
    return {
      controller,
      timeoutId: null,
      signal: controller.signal,
      clear: () => {},
    };
  }

  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return {
    controller,
    timeoutId,
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
}

export function normalizeHeaders(headers = {}) {
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...(headers || {}) };
}

export function mergeAbortSignals(signals = []) {
  const valid = safeArray(signals).filter(Boolean);

  if (!valid.length) return null;
  if (valid.length === 1) return valid[0];

  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
    return AbortSignal.any(valid);
  }

  return valid[0];
}

export function isAbortError(error) {
  return String(error?.name || "").toLowerCase() === "aborterror";
}

export function isProbablyTimeoutError(error) {
  return /timeout/i.test(String(error?.message || error?.code || ""));
}

export function detectNetworkHints() {
  if (!isBrowser()) return [];

  return navigator.onLine === false ? ["offline"] : [];
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHelpersSnapshot() {
  return {
    version: HELPERS_VERSION,
    browser: isBrowser(),
    documentReady: isDocumentReady(),
    locationPath: redactTokenInText(getCurrentLocationPath()),
    locationCanonicalPath: redactTokenInText(getCurrentLocationCanonicalPath()),
    apiBase: getSafeApiBase(),
    meIsPublic: isPublicApiPath("/api/auth/me"),
    meIsPrivate: isPrivateApiPath("/api/auth/me"),
    tokenParam: TOKEN_PARAM,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  HELPERS_VERSION,

  isBrowser,
  isDocumentReady,
  now,
  nowIso,

  isPlainObject,
  isObject,
  isAnyObject,
  isFunction,

  safeText,
  safeLower,
  safeNumber,
  safeBool,
  safeArray,
  safeObject,
  unique,
  firstNonEmpty,
  hasOwn,

  isDomScope,
  normalizeListenerOptions,

  getStoragePrefix,
  buildStorageKey,

  safeParse,
  safeStringify,
  safeClone,
  cloneError,

  redactTokenInText,
  redactSensitiveObject,

  getBaseOrigin,
  isAbsoluteUrl,
  isHashRouterPath,
  normalizeHashRouterPath,
  normalizeSearch,
  normalizeHash,
  splitPathParts,
  stripSearchAndHash,
  getSearchAndHash,
  normalizePathnameOnly,

  sanitizeUsername,
  slugify,

  normalizeApiBase,
  getSafeApiBase,
  normalizePath,
  stripUsernamePrefix,
  normalizeCanonicalPath,
  normalizePublicPath,
  buildPublicPath,

  joinUrl,
  buildUrl,

  stripBearerPrefix,
  hasValidToken,
  isPublicApiPath,
  isPrivateApiPath,

  normalizeUser,
  isUsableUser,
  getUserDisplayName,
  getUserUsername,
  getUserAvatarUrl,
  getInitials,

  getCurrentLocationPath,
  getCurrentLocationCanonicalPath,
  isHashOnlyHref,
  isUnsafeHref,
  isExternalHref,

  runHookSeries,
  getThemeColor,

  createAbortTimeout,
  normalizeHeaders,
  mergeAbortSignals,
  isAbortError,
  isProbablyTimeoutError,
  detectNetworkHints,

  getHelpersSnapshot,
};
