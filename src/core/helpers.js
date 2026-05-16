/* =========================================================
   Onion SPA - Core Helpers
   Archivo: src/core/helpers.js

   CORE HELPERS · SIMPLE
   - Utilidades puras para Core/Auth/Router/HTTP
   - Paths públicos/canónicos
   - URL/API builder
   - Redacción de tokens
   - Usuario/session helpers
   - Abort/headers/network helpers
   - /api/auth/me siempre privado
========================================================= */

import { config } from "./config.js";

export const HELPERS_VERSION = "19.0.0-simple";

const DEFAULT_ROUTE = "/";
const LOCAL_ORIGIN = "http://localhost";
const DEFAULT_STORAGE_PREFIX = "onion";
const API_CANONICAL = config?.canonicalProductionApiBase || "https://api.onionit.net";

const ME_PATHS = Object.freeze(["/api/auth/me", "/auth/me", "/api/me", "/me"]);

const FRONTEND_API_ORIGINS = Object.freeze(["https://onionsupport.com", "https://www.onionsupport.com", "http://onionsupport.com", "http://www.onionsupport.com"]);

const PUBLIC_API_PATHS = Object.freeze([
  "/api/auth/login", "/api/auth/refresh",
  "/api/auth/activate", "/api/auth/activate-account", "/api/auth/activate/first-user", "/api/auth/activate/validate",
  "/api/auth/reset-password-request", "/api/auth/reset-password-confirm", "/api/auth/reset-password/validate",
  "/api/auth/reset-password/request", "/api/auth/reset-password/confirm",
  "/api/auth/password-reset/request", "/api/auth/password-reset/confirm", "/api/auth/password-reset/validate", "/api/auth/forgot-password",
  "/api/auth/2fa/login", "/api/auth/2fa/request", "/api/auth/2fa/resend", "/api/auth/2fa/verify",
  "/api/auth/mfa/login", "/api/auth/mfa/request", "/api/auth/mfa/resend", "/api/auth/mfa/verify",
  "/api/auth/_health", "/api/auth/health", "/api/health", "/api/health/ready", "/api/health/live", "/api/_health", "/health",
]);

const PRIVATE_API_PATHS = Object.freeze([
  ...ME_PATHS,
  "/api/auth/logout", "/api/auth/logout-all", "/api/auth/2fa/setup", "/api/auth/2fa/confirm", "/api/auth/2fa/disable", "/api/auth/change-password",
  "/api/tickets", "/api/incidencias", "/api/facturas", "/api/invoices", "/api/clientes", "/api/clients", "/api/users", "/api/usuarios", "/api/search",
]);

const TOKEN_PARAM_NAMES = Object.freeze([
  "token", "activationToken", "activateToken", "activation_token", "activate_token",
  "resetToken", "passwordResetToken", "reset_token", "password_reset_token", "confirmToken", "confirm_token",
  "tempToken", "temp_token", "temporaryToken", "temporary_token", "challengeToken", "challenge_token",
  "twoFactorToken", "two_factor_token", "mfaToken", "mfa_token", "otpToken", "otp_token",
  "code", "otp", "totp", "t", "access_token", "refresh_token", "id_token", "jwt", "bearer", "auth", "authorization",
]);

const BAD_TOKEN_VALUES = Object.freeze(["", "null", "undefined", "false", "true", "nan", "none", "empty", "[object object]", "{}", "[]", "\"\"", "''"]);
const USER_ID_KEYS = Object.freeze(["id", "userId", "user_id", "_id", "uuid", "uid", "sub", "username", "userName", "user_name", "slug", "email", "mail", "phone", "telefono", "name", "nombre", "displayName", "display_name"]);
const USER_WRAPPER_KEYS = Object.freeze(["user", "usuario", "me", "account", "profile", "currentUser", "authUser", "sessionUser"]);
const AUTH_ENVELOPE_KEYS = Object.freeze(["ok", "success", "authenticated", "status", "statusCode", "error", "token", "accessToken", "access_token", "refreshToken", "refresh_token", "tempToken", "temp_token", "data", "payload", "result", "body", "response", "auth", "session", "sessionData"]);
const TECHNICAL_TOKEN_PATHS = Object.freeze(["/activate-account", "/activate", "/activation", "/reset-password/confirm", "/password-reset/confirm", "/2fa", "/otp", "/mfa"]);

const SENSITIVE_KEY_RE = /token|authorization|cookie|password|secret|credential|jwt|bearer|refresh|access|otp|mfa|2fa|csrf|xsrf|connection|string|sas/i;
const JWT_RE = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const BEARER_RE = /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi;

/* =========================================================
   BASICS
========================================================= */

export function isBrowser() { return typeof window !== "undefined" && typeof document !== "undefined"; }
export function isDocumentReady() { try { return isBrowser() && document.readyState !== "loading"; } catch { return false; } }
export function now() { try { return Date.now(); } catch { return 0; } }
export function nowIso(ms = now()) { try { return new Date(ms).toISOString(); } catch { return ""; } }

export function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try { const proto = Object.getPrototypeOf(value); return proto === Object.prototype || proto === null; } catch { return false; }
}

export function isObject(value) { return isPlainObject(value); }
export function isAnyObject(value) { return value !== null && typeof value === "object"; }
export function isFunction(value) { return typeof value === "function"; }

export function safeText(value, fallback = "") { const out = value === null || value === undefined ? "" : String(value).trim(); return out || fallback; }
export function safeLower(value, fallback = "") { return safeText(value, fallback).toLowerCase(); }
export function safeNumber(value, fallback = 0) { const out = Number(value); return Number.isFinite(out) ? out : fallback; }

export function safeBool(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  const clean = safeLower(value, "");
  if (["true", "yes", "si", "sí", "ok", "on", "enabled", "active"].includes(clean)) return true;
  if (["false", "no", "off", "disabled", "inactive"].includes(clean)) return false;
  return Boolean(fallback);
}

export function safeArray(value) { return Array.isArray(value) ? value : []; }
export function safeObject(value, fallback = {}) { return isPlainObject(value) ? value : fallback; }
function toArray(value) { if (Array.isArray(value)) return value; if (value instanceof Set) return [...value]; return value === null || value === undefined ? [] : [value]; }

export function unique(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of toArray(values).flat(Infinity)) {
    const clean = safeText(value, "");
    if (!clean || seen.has(clean)) continue;
    seen.add(clean); out.push(clean);
  }
  return out;
}

export function firstNonEmpty(...values) { for (const value of values) { const clean = safeText(value, ""); if (clean) return clean; } return ""; }
export function hasOwn(obj, key) { try { return Object.prototype.hasOwnProperty.call(obj, key); } catch { return false; } }

export function isDomScope(scope) {
  if (!isBrowser() || !scope) return false;
  try {
    return scope === document || scope === window ||
      (typeof Element !== "undefined" && scope instanceof Element) ||
      (typeof Document !== "undefined" && scope instanceof Document) ||
      (typeof DocumentFragment !== "undefined" && scope instanceof DocumentFragment);
  } catch { return false; }
}

export function normalizeListenerOptions(options = false) {
  if (typeof options === "boolean") return { capture: options };
  if (isPlainObject(options)) return { ...options };
  return { capture: false, passive: false };
}

/* =========================================================
   STORAGE / JSON / CLONE
========================================================= */

export function getStoragePrefix() {
  return safeText(config?.storagePrefix || config?.appKey || config?.appId || DEFAULT_STORAGE_PREFIX, DEFAULT_STORAGE_PREFIX).replace(/^:+|:+$/g, "") || DEFAULT_STORAGE_PREFIX;
}

export function buildStorageKey(key = "") {
  const prefix = getStoragePrefix();
  const cleanKey = safeText(key, "").replace(/^:+/g, "");
  if (!cleanKey) return prefix;
  if (cleanKey.startsWith(`${prefix}:`) || cleanKey.startsWith(`${prefix}.`) || cleanKey.startsWith(`${prefix}_`)) return cleanKey;
  return `${prefix}:${cleanKey}`;
}

export function safeParse(value, fallback = null) {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value === "object") return value;
  const raw = String(value).trim();
  if (!raw || ["undefined", "nan", "[object object]"].includes(raw.toLowerCase())) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export function safeStringify(value, fallback = "") {
  const seen = new WeakSet();
  try {
    return JSON.stringify(value, (_key, item) => {
      if (typeof item === "bigint") return String(item);
      if (item instanceof Error) return cloneError(item);
      if (!item || typeof item !== "object") return item;
      if (seen.has(item)) return "[circular]";
      seen.add(item);
      return item;
    });
  } catch { return fallback; }
}

function cloneDeep(value, fallback = null, depth = 0, seen = new WeakMap()) {
  if (value === undefined) return fallback;
  if (value === null || typeof value !== "object") return value;
  if (depth > 8) return "[depth-limit]";
  try { if (seen.has(value)) return "[circular]"; seen.set(value, true); } catch {}
  if (value instanceof Date) { try { return new Date(value.getTime()); } catch { return String(value); } }
  if (value instanceof Error) return cloneError(value);
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => cloneDeep(item, null, depth + 1, seen));
  const out = {};
  for (const [key, item] of Object.entries(value).slice(0, 300)) if (typeof item !== "function") out[key] = cloneDeep(item, null, depth + 1, seen);
  return out;
}

export function safeClone(value, fallback = null) {
  if (value === undefined) return fallback;
  if (value === null) return null;
  try { if (typeof structuredClone === "function") return structuredClone(value); } catch {}
  try { return JSON.parse(safeStringify(value)); } catch {}
  try { return cloneDeep(value, fallback); } catch { return fallback; }
}

export function cloneError(error = null) {
  if (!error) return null;
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: redactTokenInText(error.message || ""),
      stack: error.stack ? "[stack]" : null,
      code: error.code || null,
      status: error.status || error.statusCode || null,
      statusCode: error.statusCode || error.status || null,
      timeout: Boolean(error.timeout),
      aborted: Boolean(error.aborted),
      data: redactSensitiveObject(error.data, null),
      body: redactSensitiveObject(error.body, null),
      cause: error.cause ? redactTokenInText(safeText(error.cause?.message || error.cause, "")) : null,
    };
  }
  if (typeof error === "object") return redactSensitiveObject(error, { name: "Error", message: redactTokenInText(String(error)) });
  return { name: "Error", message: redactTokenInText(String(error)) };
}

/* =========================================================
   REDACTION
========================================================= */

function escapeRegExp(value = "") { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function allTokenParamNames() { try { return unique([...TOKEN_PARAM_NAMES, ...Object.values(config?.auth?.tokenParamNames || {}).flat(), ...(config?.security?.sensitiveQueryParams || [])]); } catch { return [...TOKEN_PARAM_NAMES]; } }

export function redactTokenInText(value = "") {
  let out = safeText(value, "");
  if (!out) return "";
  for (const name of allTokenParamNames()) {
    try { out = out.replace(new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"), "$1***"); } catch {}
  }
  for (const path of TECHNICAL_TOKEN_PATHS) {
    try { out = out.replace(new RegExp(`(${escapeRegExp(path)})\\/([^/?#\\s]+)`, "gi"), "$1/***"); } catch {}
  }
  try { out = out.replace(BEARER_RE, "$1***"); } catch {}
  try { out = out.replace(JWT_RE, "***"); } catch {}
  return out;
}

export function redactSensitiveObject(value, fallback = null, depth = 0, seen = new WeakMap()) {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value === "string") return redactTokenInText(value);
  if (typeof value !== "object") return value;
  if (depth > 8) return "[depth-limit]";
  try { if (seen.has(value)) return "[circular]"; seen.set(value, true); } catch {}
  if (value instanceof Date) { try { return value.toISOString(); } catch { return String(value); } }
  if (value instanceof Error) return cloneError(value);
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => redactSensitiveObject(item, null, depth + 1, seen));
  const out = {};
  for (const [key, item] of Object.entries(value).slice(0, 300)) out[key] = SENSITIVE_KEY_RE.test(key) ? (item ? "***" : item) : redactSensitiveObject(item, null, depth + 1, seen);
  return out;
}

/* =========================================================
   PATHS
========================================================= */

export function getBaseOrigin() { return isBrowser() && window.location?.origin ? window.location.origin : LOCAL_ORIGIN; }
export function isAbsoluteUrl(value = "") { return /^[a-z][a-z\d+.-]*:\/\//i.test(safeText(value, "")); }
function originFromUrl(value = "") { try { return new URL(safeText(value, ""), getBaseOrigin()).origin; } catch { return ""; } }

export function isHashRouterPath(value = "") { const raw = safeText(value, ""); return raw.startsWith("#/") || raw.startsWith("#!"); }
export function normalizeHashRouterPath(value = "") { const raw = safeText(value, ""); if (!raw) return DEFAULT_ROUTE; return raw.startsWith("#!") ? raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE : raw.replace(/^#\/?/, "/") || DEFAULT_ROUTE; }
export function normalizeSearch(search = "") { const raw = safeText(search, ""); return raw ? (raw.startsWith("?") ? raw : `?${raw.replace(/^\?+/, "")}`) : ""; }
export function normalizeHash(hash = "") { const raw = safeText(hash, ""); return raw ? (raw.startsWith("#") ? raw : `#${raw.replace(/^#+/, "")}`) : ""; }

export function splitPathParts(path = DEFAULT_ROUTE) {
  const raw = safeText(path, DEFAULT_ROUTE) || DEFAULT_ROUTE;
  if (isHashRouterPath(raw)) return splitPathParts(normalizeHashRouterPath(raw));
  let pathname = raw;
  let search = "";
  let hash = "";
  const hashIndex = pathname.indexOf("#");
  if (hashIndex >= 0) { hash = pathname.slice(hashIndex); pathname = pathname.slice(0, hashIndex) || DEFAULT_ROUTE; }
  const searchIndex = pathname.indexOf("?");
  if (searchIndex >= 0) { search = pathname.slice(searchIndex); pathname = pathname.slice(0, searchIndex) || DEFAULT_ROUTE; }
  search = normalizeSearch(search);
  hash = normalizeHash(hash);
  return { pathname, search, hash, suffix: `${search}${hash}` };
}

export function stripSearchAndHash(path = DEFAULT_ROUTE) { return splitPathParts(path).pathname || DEFAULT_ROUTE; }
export function getSearchAndHash(path = DEFAULT_ROUTE) { const p = splitPathParts(path); return `${p.search}${p.hash}`; }

export function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
  let value = String(pathname || DEFAULT_ROUTE).trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (!value) value = DEFAULT_ROUTE;
  if (!value.startsWith("/")) value = `/${value}`;
  const segments = [];
  for (const segment of value.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop(); else segments.push(segment);
  }
  value = `/${segments.join("/")}` || DEFAULT_ROUTE;
  return value.length > 1 ? value.replace(/\/+$/g, "") || DEFAULT_ROUTE : value;
}

export function normalizePath(path = DEFAULT_ROUTE) {
  if (path === null || path === undefined) return DEFAULT_ROUTE;
  let raw = String(path).trim();
  if (!raw) return DEFAULT_ROUTE;
  if (isHashRouterPath(raw)) return normalizePath(normalizeHashRouterPath(raw));
  try {
    if (isAbsoluteUrl(raw)) {
      const url = new URL(raw, getBaseOrigin());
      if (url.hash && isHashRouterPath(url.hash)) return normalizePath(normalizeHashRouterPath(url.hash));
      raw = `${url.pathname || DEFAULT_ROUTE}${url.search || ""}${url.hash || ""}`;
    }
  } catch { return DEFAULT_ROUTE; }
  raw = raw.replace(/^[.][/]+/, "/");
  const { pathname, search, hash } = splitPathParts(raw);
  if (hash && isHashRouterPath(hash)) return normalizePath(normalizeHashRouterPath(hash));
  return `${normalizePathnameOnly(pathname)}${search}${hash}`;
}

export function stripUsernamePrefix(path = DEFAULT_ROUTE) {
  const normalized = normalizePath(path);
  const pathOnly = stripSearchAndHash(normalized);
  const suffix = getSearchAndHash(normalized);
  return normalizePath(`${pathOnly.replace(/^\/@[^/]+(?=\/|$)/i, "") || DEFAULT_ROUTE}${suffix}`);
}

function collapseTechnicalTokenPath(pathOnly = DEFAULT_ROUTE) {
  const clean = normalizePathnameOnly(pathOnly);
  if (clean === "/activate" || clean.startsWith("/activate/") || clean === "/activation" || clean.startsWith("/activation/") || clean === "/activate-account" || clean.startsWith("/activate-account/")) return "/activate-account";
  if (clean === "/password-reset/confirm" || clean.startsWith("/password-reset/confirm/") || clean === "/reset-password/confirm" || clean.startsWith("/reset-password/confirm/")) return "/reset-password/confirm";
  for (const base of ["/2fa", "/otp", "/mfa"]) if (clean === base || clean.startsWith(`${base}/`)) return base;
  return clean;
}

export function normalizeCanonicalPath(path = DEFAULT_ROUTE) { return collapseTechnicalTokenPath(stripSearchAndHash(stripUsernamePrefix(normalizePath(path))) || DEFAULT_ROUTE); }
export function normalizePublicPath(path = DEFAULT_ROUTE) { return normalizePath(path); }

/* =========================================================
   USERNAME / SLUG
========================================================= */

export function sanitizeUsername(value = "") {
  let raw = String(value || "").normalize("NFKC").trim();
  if (!raw) return "";
  raw = raw.replace(/^@+/, "");
  if (raw.includes("@") && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) raw = raw.split("@")[0] || raw;
  return raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "").replace(/[^a-zA-Z0-9._-]/g, "").replace(/[._-]{2,}/g, "-").replace(/^[._-]+|[._-]+$/g, "").toLowerCase().slice(0, 64);
}

export function slugify(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").normalize("NFKC").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[._-]+|[._-]+$/g, "").slice(0, 96);
}

export function buildPublicPath(path = DEFAULT_ROUTE, username = "") {
  const publicPath = stripUsernamePrefix(normalizePath(path));
  const cleanUsername = sanitizeUsername(username);
  if (!cleanUsername) return publicPath;
  if (stripSearchAndHash(publicPath) === DEFAULT_ROUTE && !getSearchAndHash(publicPath)) return `/@${cleanUsername}`;
  return normalizePath(`/@${cleanUsername}${publicPath}`);
}

/* =========================================================
   API BASE / URL
========================================================= */

function canonicalBackendOrigins() { return unique([API_CANONICAL, ...(config?.canonicalBackendApiOrigins || []), ...(config?.api?.canonicalBackendOrigins || []), ...(config?.security?.canonicalBackendApiOrigins || [])]).map(originFromUrl).filter(Boolean); }
function forbiddenFrontendOrigins() { const backends = canonicalBackendOrigins(); return unique([...FRONTEND_API_ORIGINS, ...(config?.forbiddenFrontendApiOrigins || []), ...(config?.api?.forbiddenFrontendOrigins || []), ...(config?.security?.forbiddenFrontendApiOrigins || [])]).map(originFromUrl).filter(Boolean).filter((origin) => !backends.includes(origin)); }
function isForbiddenFrontendApiBase(value = "") { const origin = originFromUrl(value); return Boolean(origin && forbiddenFrontendOrigins().includes(origin)); }
function isProductionEnv() { const env = safeLower(config?.env || config?.environment || "", ""); return env === "production" || env === "prod"; }

export function normalizeApiBase(base = "") {
  const raw = String(base || "").trim();
  if (!raw || raw === "/" || raw === "/api" || raw === "api") return "";
  if (!isAbsoluteUrl(raw)) return raw.replace(/\/+$/g, "");
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    const origin = parsed.origin.replace(/\/+$/g, "");
    const pathname = normalizePathnameOnly(parsed.pathname || "/");
    if (pathname === "/" || pathname === "/api" || canonicalBackendOrigins().includes(origin)) return origin;
    return `${origin}${pathname}`.replace(/\/+$/g, "");
  } catch { return ""; }
}

export function getSafeApiBase() {
  const configuredBase = normalizeApiBase(config?.apiBase || config?.apiOrigin || config?.apiUrl || config?.api?.base || config?.api?.baseUrl || config?.api?.origin || "");
  if (isProductionEnv()) return API_CANONICAL;
  if (configuredBase && isForbiddenFrontendApiBase(configuredBase)) return API_CANONICAL;
  return configuredBase;
}

function basePathFromUrl(base = "") {
  const cleanBase = normalizeApiBase(base);
  if (!cleanBase) return "";
  try { return isAbsoluteUrl(cleanBase) ? normalizePathnameOnly(new URL(cleanBase, getBaseOrigin()).pathname || "") : normalizePathnameOnly(cleanBase); } catch { return ""; }
}

function shouldAvoidDoubleBase(base = "", path = "") {
  const basePath = basePathFromUrl(base).replace(/^\/+/, "");
  const cleanPath = safeText(path, "").replace(/^\/+/, "");
  return Boolean(basePath && cleanPath && (cleanPath === basePath || cleanPath.startsWith(`${basePath}/`)));
}

export function joinUrl(base = "", path = "") {
  const rawPath = String(path || "").trim();
  if (isAbsoluteUrl(rawPath)) return rawPath;
  const cleanBase = normalizeApiBase(base);
  const cleanPath = rawPath.replace(/^\/+/, "");
  if (!cleanPath) return cleanBase || "/";
  if (!cleanBase) return `/${cleanPath}`;
  if (shouldAvoidDoubleBase(cleanBase, cleanPath)) {
    if (isAbsoluteUrl(cleanBase)) { try { return `${new URL(cleanBase, getBaseOrigin()).origin}/${cleanPath}`; } catch {} }
    return `/${cleanPath}`;
  }
  return `${cleanBase}/${cleanPath}`;
}

function appendQueryToUrl(baseUrl = "", query = null) {
  if (!query) return baseUrl;
  let entries = [];
  try {
    if (typeof URLSearchParams !== "undefined" && query instanceof URLSearchParams) entries = [...query.entries()];
    else if (Array.isArray(query)) entries = query;
    else if (isPlainObject(query)) entries = Object.entries(query);
  } catch { entries = []; }
  if (!entries.length) return baseUrl;
  try {
    const absolute = isAbsoluteUrl(baseUrl);
    const url = new URL(baseUrl, getBaseOrigin());
    for (const [key, value] of entries) {
      const cleanKey = safeText(key, "");
      if (!cleanKey || value === undefined || value === null || value === "") continue;
      if (Array.isArray(value)) { for (const item of value) if (item !== undefined && item !== null && item !== "") url.searchParams.append(cleanKey, String(item)); continue; }
      url.searchParams.set(cleanKey, value instanceof Date ? value.toISOString() : typeof value === "object" ? safeStringify(value, "{}") : String(value));
    }
    return absolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch { return baseUrl; }
}

function rewriteForbiddenFrontendApiUrl(url = "") {
  const raw = safeText(url, "");
  if (!raw || !isAbsoluteUrl(raw)) return raw;
  try {
    const parsed = new URL(raw);
    if (!forbiddenFrontendOrigins().includes(parsed.origin)) return raw;
    if (parsed.pathname === "/api" || parsed.pathname.startsWith("/api/")) return `${new URL(API_CANONICAL).origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    return raw;
  } catch { return raw; }
}

export function buildUrl(pathOrBase = "", queryOrPath = null, maybeQuery = null) {
  const first = String(pathOrBase || "").trim();
  if (typeof queryOrPath === "string") return appendQueryToUrl(isAbsoluteUrl(queryOrPath) ? rewriteForbiddenFrontendApiUrl(queryOrPath) : joinUrl(first, queryOrPath), maybeQuery);
  return appendQueryToUrl(isAbsoluteUrl(first) ? rewriteForbiddenFrontendApiUrl(first) : joinUrl(getSafeApiBase(), first), queryOrPath);
}

/* =========================================================
   API PUBLIC / PRIVATE
========================================================= */

export function stripBearerPrefix(token = "") { return safeText(token, "").replace(/^Bearer\s+/i, "").trim(); }
export function hasValidToken(token = null) { const value = stripBearerPrefix(token); return Boolean(value && !BAD_TOKEN_VALUES.includes(value.toLowerCase()) && !/[\s\r\n\t]/.test(value)); }

function apiBasePath() {
  const apiBase = getSafeApiBase();
  if (!apiBase) return "";
  try { return isAbsoluteUrl(apiBase) ? normalizeCanonicalPath(new URL(apiBase, getBaseOrigin()).pathname || "") : normalizeCanonicalPath(apiBase); } catch { return ""; }
}

function stripApiBasePrefix(path = DEFAULT_ROUTE) {
  const normalized = normalizeCanonicalPath(path);
  const basePath = apiBasePath();
  if (!basePath || basePath === DEFAULT_ROUTE) return normalized;
  if (normalized === basePath) return DEFAULT_ROUTE;
  if (normalized.startsWith(`${basePath}/`)) return normalizeCanonicalPath(normalized.slice(basePath.length) || DEFAULT_ROUTE);
  return normalized;
}

function apiPathMatches(path = "", candidate = "") {
  const cleanPath = normalizeCanonicalPath(path);
  const cleanCandidate = normalizeCanonicalPath(candidate);
  if (!cleanCandidate) return false;
  if (cleanCandidate === DEFAULT_ROUTE) return cleanPath === DEFAULT_ROUTE;
  return cleanPath === cleanCandidate || cleanPath.startsWith(`${cleanCandidate}/`);
}

function isMeEndpoint(path = "") {
  const normalized = normalizeCanonicalPath(path);
  const withoutBase = stripApiBasePrefix(normalized);
  return ME_PATHS.some((item) => apiPathMatches(normalized, item) || apiPathMatches(withoutBase, item));
}

function publicApiPaths() { return unique([...PUBLIC_API_PATHS, ...toArray(config?.auth?.publicApiPaths || config?.publicApiPaths || [])]).filter((path) => !isMeEndpoint(path)); }
function privateApiPaths() { return unique([...PRIVATE_API_PATHS, ...ME_PATHS, ...toArray(config?.auth?.privateApiPaths || config?.privateApiPaths || [])]); }

function isExplicitPrivateApiPath(path = "") {
  const normalized = normalizeCanonicalPath(path);
  const withoutBase = stripApiBasePrefix(normalized);
  return privateApiPaths().some((privatePath) => {
    const current = normalizeCanonicalPath(privatePath);
    const currentWithoutBase = stripApiBasePrefix(current);
    return apiPathMatches(normalized, current) || apiPathMatches(withoutBase, current) || apiPathMatches(normalized, currentWithoutBase) || apiPathMatches(withoutBase, currentWithoutBase);
  });
}

export function isPublicApiPath(path = "") {
  const normalized = normalizeCanonicalPath(path);
  const withoutBase = stripApiBasePrefix(normalized);
  if (isMeEndpoint(normalized) || isMeEndpoint(withoutBase)) return false;
  if (isExplicitPrivateApiPath(normalized) || isExplicitPrivateApiPath(withoutBase)) return false;
  return publicApiPaths().some((publicPath) => {
    const current = normalizeCanonicalPath(publicPath);
    const currentWithoutBase = stripApiBasePrefix(current);
    return apiPathMatches(normalized, current) || apiPathMatches(withoutBase, current) || apiPathMatches(normalized, currentWithoutBase) || apiPathMatches(withoutBase, currentWithoutBase);
  });
}

export function isPrivateApiPath(path = "") {
  const normalized = normalizeCanonicalPath(path);
  const withoutBase = stripApiBasePrefix(normalized);
  if (isMeEndpoint(normalized) || isMeEndpoint(withoutBase)) return true;
  return isExplicitPrivateApiPath(normalized) || isExplicitPrivateApiPath(withoutBase);
}

/* =========================================================
   USER
========================================================= */

function pick(source = {}, keys = []) { for (const key of keys) { const value = safeText(source?.[key], ""); if (value) return value; } return ""; }
function pickFrom(source = {}, groups = [], keys = []) { const direct = pick(source, keys); if (direct) return direct; for (const group of groups) { const value = pick(source?.[group], keys); if (value) return value; } return ""; }
function hasIdentity(value = {}) { return isPlainObject(value) && USER_ID_KEYS.some((key) => Boolean(safeText(value[key], ""))); }
function looksLikeAuthEnvelope(value = {}) { return isPlainObject(value) && AUTH_ENVELOPE_KEYS.some((key) => hasOwn(value, key)); }

function normalizeRole(value = "") {
  const key = safeText(value, "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "_").replace(/[^a-z0-9_:.]/g, "").trim();
  return ["admin", "administrator", "administrador", "superadmin", "super_admin", "super-admin", "owner", "root"].includes(key) ? "admin" : "user";
}

function unwrapUserPayload(payload = null) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  for (const key of USER_WRAPPER_KEYS) if (hasIdentity(payload[key])) return payload[key];
  for (const group of ["data", "payload", "result", "auth", "session", "sessionData", "response", "body"]) {
    for (const key of USER_WRAPPER_KEYS) if (hasIdentity(payload[group]?.[key])) return payload[group][key];
  }
  return payload;
}

function normalizeActive(user = {}) {
  const status = safeLower(user.status || user.estado || user.state || user.accountStatus || user.account_status || "", "");
  if (["disabled", "inactive", "deleted", "blocked", "suspended", "banned", "archived", "revoked", "desactivado", "inactivo", "eliminado", "bloqueado", "suspendido"].includes(status)) return false;
  if (user.disabled === true || user.isDisabled === true || user.deleted === true || user.isDeleted === true || user.blocked === true || user.isBlocked === true || user.archived === true || user.revoked === true) return false;
  const candidate = user.active ?? user.is_active ?? user.isActive ?? user.enabled ?? user.isEnabled;
  return candidate === undefined || candidate === null || candidate === "" ? true : safeBool(candidate, true);
}

function isSafeAvatarUrl(url = "") {
  const value = safeText(url, "");
  if (!value) return false;
  const lower = value.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("vbscript:") || lower.startsWith("data:text/html") || lower.startsWith("data:application/") || lower.startsWith("data:image/svg")) return false;
  if (lower.startsWith("data:")) return /^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(value);
  if (lower.startsWith("blob:") || /^\/(?!\/)/.test(value) || /^\.\.?\//.test(value)) return true;
  try { return ["http:", "https:", "blob:"].includes(new URL(value, getBaseOrigin()).protocol); } catch { return false; }
}

function resolveAvatarCandidate(user = {}) {
  const keys = ["avatarUrl", "avatarURL", "avatar_url", "avatar", "photo", "photoUrl", "photoURL", "photo_url", "image", "imageUrl", "imageURL", "image_url", "picture", "pictureUrl", "pictureURL", "picture_url", "thumbnail", "thumbnailUrl", "thumbnail_url"];
  const candidate = pickFrom(user, ["profile", "meta", "settings", "raw"], keys) || pick(user?.raw?.profile, keys);
  return isSafeAvatarUrl(candidate) ? candidate : "";
}

function sanitizeUserPayload(value = {}, depth = 0, seen = new WeakSet()) {
  if (depth > 4 || !isPlainObject(value)) return {};
  try { if (seen.has(value)) return {}; seen.add(value); } catch {}
  const out = {};
  for (const [key, item] of Object.entries(value).slice(0, 160)) {
    if (SENSITIVE_KEY_RE.test(key)) continue;
    if (Array.isArray(item)) { out[key] = item.slice(0, 120).map((entry) => isPlainObject(entry) ? sanitizeUserPayload(entry, depth + 1, seen) : entry); continue; }
    out[key] = isPlainObject(item) ? sanitizeUserPayload(item, depth + 1, seen) : item;
  }
  return out;
}

export function normalizeUser(user = null) {
  const source = unwrapUserPayload(user);
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  if (looksLikeAuthEnvelope(source) && !hasIdentity(source)) return null;
  if (!hasIdentity(source)) return null;

  const id = pickFrom(source, ["profile", "raw"], ["userId", "user_id", "id", "uuid", "_id", "uid", "sub"]);
  const email = pickFrom(source, ["profile", "raw"], ["email", "mail", "emailLower", "email_lower"]);
  const rawName = pickFrom(source, ["profile", "raw"], ["displayName", "display_name", "name", "nombre", "fullName", "full_name"]) || pick(source, ["username"]) || email || id || "Usuario";
  const username = sanitizeUsername(pickFrom(source, ["profile", "raw"], ["username", "userName", "user_name", "nick", "alias", "login", "slug"]) || email || id);
  const slug = sanitizeUsername(pickFrom(source, ["profile", "raw"], ["slug", "usernameSlug", "username_slug"]) || username || slugify(rawName));

  let role = normalizeRole(pickFrom(source, ["profile", "raw"], ["role", "rol", "userRole", "user_role", "type", "user_type", "userType", "perfil"]));
  if (source.isAdmin === true || source.admin === true) role = "admin";

  const roles = unique([...(Array.isArray(source.roles) ? source.roles.map(normalizeRole) : []), role]).filter(Boolean);
  const avatar = resolveAvatarCandidate(source);
  const hasAvatar = source.hasAvatar ?? source.has_avatar ?? source.profile?.hasAvatar ?? source.profile?.has_avatar ?? source.raw?.hasAvatar ?? source.raw?.has_avatar;

  return {
    ...sanitizeUserPayload(source),
    id: id || null,
    userId: pick(source, ["userId", "user_id"]) || id || null,
    user_id: pick(source, ["user_id", "userId"]) || id || null,
    uid: pick(source, ["uid"]) || id || null,
    sub: pick(source, ["sub"]) || id || null,
    username,
    usernameLower: pick(source, ["usernameLower", "username_lower"]) || username || null,
    username_lower: pick(source, ["username_lower", "usernameLower"]) || username || null,
    slug,
    name: rawName,
    nombre: source.nombre || rawName,
    displayName: pickFrom(source, ["profile", "raw"], ["displayName", "display_name"]) || rawName,
    email,
    emailLower: (pick(source, ["emailLower", "email_lower"]) || email).toLowerCase(),
    email_lower: (pick(source, ["email_lower", "emailLower"]) || email).toLowerCase(),
    role,
    rol: role,
    roles,
    permissions: safeArray(source.permissions || source.permisos),
    permisos: safeArray(source.permisos || source.permissions),
    avatar: hasAvatar === false ? null : avatar || null,
    avatarUrl: hasAvatar === false ? null : avatar || null,
    picture: hasAvatar === false ? null : avatar || null,
    hasAvatar: hasAvatar === undefined ? Boolean(avatar) : Boolean(hasAvatar),
    avatarUpdatedAt: source.avatarUpdatedAt ?? source.avatar_updated_at ?? source.profile?.avatarUpdatedAt ?? source.profile?.avatar_updated_at ?? source.raw?.avatarUpdatedAt ?? source.raw?.avatar_updated_at ?? null,
    active: normalizeActive(source),
  };
}

export function isUsableUser(user = null) { const normalized = normalizeUser(user); return Boolean(normalized && normalized.active !== false && firstNonEmpty(normalized.id, normalized.userId, normalized.user_id, normalized.username, normalized.email)); }
export function getUserDisplayName(user = null) { const source = unwrapUserPayload(user); return pickFrom(source, ["profile", "raw"], ["displayName", "display_name", "name", "nombre", "fullName", "full_name"]) || pick(source, ["username", "email"]) || "Usuario"; }
export function getUserUsername(user = null) { const source = unwrapUserPayload(user); return sanitizeUsername(pickFrom(source, ["profile", "raw"], ["username", "userName", "user_name", "nick", "alias", "login", "slug"]) || pick(source, ["email", "id", "userId"])); }
export function getUserAvatarUrl(user = null) { const source = unwrapUserPayload(user); const hasAvatar = source?.hasAvatar ?? source?.has_avatar ?? source?.profile?.hasAvatar ?? source?.profile?.has_avatar ?? source?.raw?.hasAvatar ?? source?.raw?.has_avatar; return hasAvatar === false ? "" : resolveAvatarCandidate(source || {}); }

export function getInitials(value = "") {
  const source = typeof value === "object" ? getUserDisplayName(value) : safeText(value, "");
  if (!source) return "";
  return source.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("").slice(0, 2);
}

/* =========================================================
   LOCATION / HREF
========================================================= */

export function getCurrentLocationPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;
  try {
    const hash = window.location.hash || "";
    if (isHashRouterPath(hash)) return normalizePath(hash);
    return normalizePath(`${window.location.pathname || DEFAULT_ROUTE}${window.location.search || ""}${hash}`);
  } catch { return DEFAULT_ROUTE; }
}

export function getCurrentLocationCanonicalPath() { try { return isBrowser() ? normalizeCanonicalPath(getCurrentLocationPath()) : DEFAULT_ROUTE; } catch { return DEFAULT_ROUTE; } }
export function isHashOnlyHref(href = "") { const value = safeText(href, ""); return value.startsWith("#") && !isHashRouterPath(value); }
export function isUnsafeHref(href = "") { const value = safeText(href, ""); return !value || /^(javascript|data|vbscript):/i.test(value); }
export function isExternalHref(href = "") { const value = safeText(href, ""); if (!value || isUnsafeHref(value) || !isAbsoluteUrl(value)) return false; if (!isBrowser()) return true; try { return new URL(value).origin !== window.location.origin; } catch { return false; } }

/* =========================================================
   HOOKS / THEME
========================================================= */

export async function runHookSeries(hooks = [], payload) {
  let current = payload;
  for (const hook of safeArray(hooks)) {
    if (typeof hook !== "function") continue;
    try { const result = await hook(current); if (result !== undefined) current = result; }
    catch (error) { if (config?.debug) { try { console.error(`[${config?.appName || "Onion"}] Error ejecutando hook`, cloneError(error)); } catch {} } }
  }
  return current;
}

export function getThemeColor(theme = config?.defaultTheme) { return theme === "light" ? config?.ui?.themeColorLight || "#f4f7fb" : config?.ui?.themeColorDark || "#0a0c11"; }

/* =========================================================
   ABORT / HEADERS / NETWORK
========================================================= */

export function createAbortTimeout(ms = config?.requestTimeout) {
  if (typeof AbortController === "undefined") return { controller: null, timeoutId: null, signal: null, clear: () => {} };
  const controller = new AbortController();
  const normalizedMs = Number(ms);
  if (!Number.isFinite(normalizedMs) || normalizedMs <= 0) return { controller, timeoutId: null, signal: controller.signal, clear: () => {} };
  const timeoutId = setTimeout(() => { try { controller.abort("timeout"); } catch { try { controller.abort(); } catch {} } }, normalizedMs);
  return { controller, timeoutId, signal: controller.signal, clear() { try { clearTimeout(timeoutId); } catch {} } };
}

export function normalizeHeaders(headers = {}) {
  let source = [];
  try {
    if (typeof Headers !== "undefined" && headers instanceof Headers) source = [...headers.entries()];
    else if (Array.isArray(headers)) source = headers;
    else source = Object.entries(headers || {});
  } catch { source = []; }
  return source.reduce((acc, [key, value]) => { const normalizedKey = String(key || "").trim(); if (normalizedKey && value !== undefined && value !== null && value !== "") acc[normalizedKey] = value; return acc; }, {});
}

export function mergeAbortSignals(signals = []) {
  const validSignals = toArray(signals).filter(Boolean);
  if (!validSignals.length) return null;
  if (validSignals.length === 1) return validSignals[0];
  try { if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") return AbortSignal.any(validSignals); } catch {}
  if (typeof AbortController === "undefined") return validSignals[0] || null;
  const controller = new AbortController();
  const cleanups = [];
  const teardown = () => { for (const cleanup of cleanups) { try { cleanup?.(); } catch {} } cleanups.length = 0; };
  const abortFrom = (sourceSignal) => { if (controller.signal.aborted) return; try { controller.abort(sourceSignal?.reason || "aborted"); } catch { try { controller.abort(); } catch {} } finally { teardown(); } };
  for (const signal of validSignals) {
    if (signal.aborted) { abortFrom(signal); continue; }
    const onAbort = () => abortFrom(signal);
    try { signal.addEventListener("abort", onAbort, { once: true }); cleanups.push(() => signal.removeEventListener("abort", onAbort)); } catch {}
  }
  return controller.signal;
}

export function isAbortError(error) { const message = String(error?.message || "").toLowerCase(); const name = String(error?.name || "").toLowerCase(); const code = String(error?.code || "").toLowerCase(); return name === "aborterror" || code === "20" || code === "abort_err" || message.includes("aborted") || message.includes("abort"); }
export function isProbablyTimeoutError(error) { const text = `${error?.message || ""} ${error?.name || ""} ${error?.code || ""} ${error?.raw || ""} ${error?.reason || ""}`.toLowerCase(); return error?.timeout === true || text.includes("timeout") || text.includes("etimedout") || text.includes("request_timeout") || text.includes("boot_timeout"); }

export function detectNetworkHints(url = "") {
  const hints = [];
  if (!isBrowser()) return hints;
  try { if (navigator.onLine === false) hints.push("El navegador parece estar offline."); } catch {}
  const rawUrl = safeText(url, "");
  if (!rawUrl) return hints;
  try {
    const currentProtocol = window.location.protocol;
    const apiOrigin = new URL(rawUrl, window.location.origin).origin;
    if (/^https:\/\//i.test(rawUrl) && currentProtocol === "http:") hints.push("Frontend HTTP contra API HTTPS.");
    if (/^http:\/\//i.test(rawUrl) && currentProtocol === "https:") hints.push("Frontend HTTPS contra API HTTP.");
    if (apiOrigin && apiOrigin !== window.location.origin) hints.push("Petición cross-origin: revisar CORS/preflight.");
    if (forbiddenFrontendOrigins().includes(apiOrigin)) hints.push("La petición apunta al dominio frontend. Backend canónico: https://api.onionit.net.");
  } catch {}
  return hints;
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
    apiBasePath: apiBasePath(),
    canonicalProductionApiBase: API_CANONICAL,
    canonicalBackendApiOrigins: canonicalBackendOrigins(),
    forbiddenFrontendApiOrigins: forbiddenFrontendOrigins(),
    storagePrefix: getStoragePrefix(),
    defaultLang: config?.defaultLang || "es",
    defaultTheme: config?.defaultTheme || "dark",
    meIsPublic: isPublicApiPath("/api/auth/me"),
    meIsPrivate: isPrivateApiPath("/api/auth/me"),
    activateEndpoint: config?.auth?.endpoints?.activate || "/api/auth/activate",
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  HELPERS_VERSION,
  isBrowser, isDocumentReady, now, nowIso,
  isPlainObject, isObject, isAnyObject, isFunction,
  safeText, safeLower, safeNumber, safeBool, safeArray, safeObject, unique, firstNonEmpty, hasOwn,
  isDomScope, normalizeListenerOptions,
  getStoragePrefix, buildStorageKey,
  safeParse, safeStringify, safeClone, cloneError,
  redactTokenInText, redactSensitiveObject,
  getBaseOrigin, isAbsoluteUrl, isHashRouterPath, normalizeHashRouterPath, normalizeSearch, normalizeHash,
  splitPathParts, stripSearchAndHash, getSearchAndHash, normalizePathnameOnly,
  sanitizeUsername, slugify,
  normalizeApiBase, getSafeApiBase, normalizePath, stripUsernamePrefix, normalizeCanonicalPath, normalizePublicPath, buildPublicPath,
  joinUrl, buildUrl,
  stripBearerPrefix, hasValidToken, isPublicApiPath, isPrivateApiPath,
  normalizeUser, isUsableUser, getUserDisplayName, getUserUsername, getUserAvatarUrl, getInitials,
  getCurrentLocationPath, getCurrentLocationCanonicalPath,
  isHashOnlyHref, isUnsafeHref, isExternalHref,
  runHookSeries, getThemeColor,
  createAbortTimeout, normalizeHeaders, mergeAbortSignals, isAbortError, isProbablyTimeoutError, detectNetworkHints,
  getHelpersSnapshot,
};
