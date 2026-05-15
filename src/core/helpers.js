/* =========================================================
   Onion SPA - Core Helpers
   Archivo: src/core/helpers.js

   ONION SUPPORT · CORE HELPERS
   PATHS · USER · URL · REQUEST · TOKEN SAFE · 17/10

   Responsabilidades:
   - utilidades base del core
   - normalización de paths, usernames, slugs y usuarios
   - helpers de clonación / parse seguro
   - helpers URL / headers / abort / timeout
   - diagnóstico de red
   - soporte robusto de avatar backend /me
   - redacción segura de tokens para logs/snapshots
   - soporte history-router, hash-router y hashbang
   - construir URLs API sin doble /api
   - impedir que /api/auth/me, /auth/me, /api/me o /me sean públicos
   - reforzar backend canónico api.onionit.net en producción

   Candados:
   - normalizeCanonicalPath elimina /@usuario, query/hash y colapsa rutas token
   - normalizePublicPath conserva /@usuario, query y hash
   - buildUrl evita https://api.onionit.net/api/api/...
   - buildUrl reescribe dominios frontend /api hacia backend canónico
   - api.onionit.net permitido como backend canónico
   - dominios frontend bloqueados como API base
   - producción fuerza https://api.onionit.net
   - cero throws accidentales
========================================================= */

import { config } from "./config.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const HELPERS_VERSION = "17.0.0";

const DEFAULT_ROUTE = "/";
const LOCAL_ORIGIN = "http://localhost";
const DEFAULT_STORAGE_PREFIX = "onion";

const CANONICAL_PRODUCTION_API_BASE =
  config?.canonicalProductionApiBase || "https://api.onionit.net";

const REQUIRED_PRIVATE_ME_PATHS = Object.freeze([
  "/api/auth/me",
  "/auth/me",
  "/api/me",
  "/me",
]);

const FALLBACK_FORBIDDEN_FRONTEND_API_ORIGINS = Object.freeze([
  "https://onionsupport.com",
  "https://www.onionsupport.com",
  "http://onionsupport.com",
  "http://www.onionsupport.com",
]);

const FALLBACK_PUBLIC_API_PATHS = Object.freeze([
  "/api/auth/login",
  "/api/auth/refresh",

  "/api/auth/reset-password-request",
  "/api/auth/reset-password-confirm",
  "/api/auth/reset-password/validate",
  "/api/auth/reset-password/request",
  "/api/auth/reset-password/confirm",
  "/api/auth/password-reset/request",
  "/api/auth/password-reset/confirm",
  "/api/auth/password-reset/validate",
  "/api/auth/forgot-password",

  "/api/auth/activate",
  "/api/auth/activate-account",
  "/api/auth/activate/first-user",
  "/api/auth/activate/validate",

  "/api/auth/2fa/login",
  "/api/auth/2fa/request",
  "/api/auth/2fa/resend",
  "/api/auth/2fa/verify",
  "/api/auth/mfa/login",
  "/api/auth/mfa/request",
  "/api/auth/mfa/resend",
  "/api/auth/mfa/verify",

  "/api/auth/_health",
  "/api/auth/health",
  "/api/health",
  "/api/health/ready",
  "/api/health/live",
  "/api/_health",
  "/health",
]);

const FALLBACK_PRIVATE_API_PATHS = Object.freeze([
  ...REQUIRED_PRIVATE_ME_PATHS,

  "/api/auth/logout",
  "/api/auth/logout-all",
  "/api/auth/2fa/setup",
  "/api/auth/2fa/confirm",
  "/api/auth/2fa/disable",
  "/api/auth/change-password",

  "/api/tickets",
  "/api/incidencias",
  "/api/facturas",
  "/api/invoices",
  "/api/clientes",
  "/api/clients",
  "/api/users",
  "/api/usuarios",
  "/api/search",
]);

const TOKEN_PARAM_NAMES = Object.freeze([
  "token",
  "activationToken",
  "activateToken",
  "activation_token",
  "activate_token",
  "resetToken",
  "passwordResetToken",
  "reset_token",
  "password_reset_token",
  "confirmToken",
  "confirm_token",
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
  "code",
  "otp",
  "totp",
  "t",
  "access_token",
  "refresh_token",
  "id_token",
  "jwt",
  "bearer",
  "auth",
  "authorization",
]);

const BAD_TOKEN_VALUES = Object.freeze([
  "",
  "null",
  "undefined",
  "false",
  "true",
  "nan",
  "none",
  "empty",
  "[object object]",
  "{}",
  "[]",
  "\"\"",
  "''",
]);

const TECHNICAL_TOKEN_PATHS = Object.freeze([
  "/activate-account",
  "/reset-password/confirm",
  "/password/reset",
  "/auth/activate",
  "/auth/reset",
]);

const TOKEN_COLLAPSE_PATHS = Object.freeze([
  "/activate-account",
  "/reset-password/confirm",
]);

const USER_IDENTITY_KEYS = Object.freeze([
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
  "name",
  "nombre",
  "fullName",
  "full_name",
  "displayName",
  "display_name",
]);

const AUTH_ENVELOPE_KEYS = Object.freeze([
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
  "authData",
  "session",
  "sessionData",
]);

const MAX_SAFE_CLONE_DEPTH = 8;
const MAX_SAFE_CLONE_ARRAY = 500;
const MAX_SAFE_CLONE_KEYS = 300;

const SAFE_USERNAME_MAX = 64;
const SAFE_SLUG_MAX = 96;

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|csrf|xsrf/i;

const JWT_RE =
  /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

const BEARER_RE =
  /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi;

/* =========================================================
   BASE
========================================================= */

export function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function isDocumentReady() {
  if (!isBrowser()) {
    return false;
  }

  try {
    return document.readyState !== "loading";
  } catch {
    return false;
  }
}

export function now() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

export function nowIso(ms = now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

export function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

export function isObject(value) {
  return isPlainObject(value);
}

export function isAnyObject(value) {
  return value !== null && typeof value === "object";
}

export function isFunction(value) {
  return typeof value === "function";
}

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
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
  if (value === true) return true;
  if (value === false) return false;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const clean = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí", "ok", "on", "enabled", "active"].includes(clean)) {
      return true;
    }

    if (["false", "0", "no", "off", "disabled", "inactive"].includes(clean)) {
      return false;
    }
  }

  return Boolean(fallback);
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function safeObject(value, fallback = {}) {
  return isPlainObject(value) ? value : fallback;
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value instanceof Set) {
    return Array.from(value);
  }

  if (value === null || value === undefined) {
    return [];
  }

  return [value];
}

export function unique(values = []) {
  const output = [];
  const seen = new Set();

  for (const value of toArray(values).flat(Infinity)) {
    const clean = safeText(value, "");

    if (!clean || seen.has(clean)) {
      continue;
    }

    seen.add(clean);
    output.push(clean);
  }

  return output;
}

export function firstNonEmpty(...values) {
  for (const value of values) {
    const text = safeText(value, "");

    if (text) {
      return text;
    }
  }

  return "";
}

export function hasOwn(obj, key) {
  try {
    return Object.prototype.hasOwnProperty.call(obj, key);
  } catch {
    return false;
  }
}

export function isDomScope(scope) {
  if (!isBrowser() || !scope) {
    return false;
  }

  try {
    return (
      scope === document ||
      scope === window ||
      (typeof Element !== "undefined" && scope instanceof Element) ||
      (typeof Document !== "undefined" && scope instanceof Document) ||
      (typeof DocumentFragment !== "undefined" && scope instanceof DocumentFragment)
    );
  } catch {
    return false;
  }
}

export function normalizeListenerOptions(options = false) {
  if (typeof options === "boolean") {
    return { capture: options };
  }

  if (isPlainObject(options)) {
    return { ...options };
  }

  return {
    capture: false,
    passive: false,
  };
}

/* =========================================================
   STORAGE / JSON / CLONE
========================================================= */

export function getStoragePrefix() {
  return (
    safeText(
      config?.storagePrefix || config?.appKey || config?.appId || DEFAULT_STORAGE_PREFIX,
      DEFAULT_STORAGE_PREFIX
    )
      .replace(/:+$/g, "")
      .replace(/^:+/g, "") || DEFAULT_STORAGE_PREFIX
  );
}

export function buildStorageKey(key = "") {
  const prefix = getStoragePrefix();
  const cleanKey = safeText(key, "").replace(/^:+/g, "");

  if (!cleanKey) {
    return prefix;
  }

  if (
    cleanKey.startsWith(`${prefix}:`) ||
    cleanKey.startsWith(`${prefix}.`) ||
    cleanKey.startsWith(`${prefix}_`)
  ) {
    return cleanKey;
  }

  return `${prefix}:${cleanKey}`;
}

export function safeParse(value, fallback = null) {
  if (value === undefined) {
    return fallback;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  const raw = String(value).trim();

  if (!raw) {
    return fallback;
  }

  if (["undefined", "nan", "[object object]"].includes(raw.toLowerCase())) {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function safeStringify(value, fallback = "") {
  try {
    return JSON.stringify(value, (_key, item) => {
      if (typeof item === "bigint") {
        return String(item);
      }

      if (item instanceof Error) {
        return cloneError(item);
      }

      return item;
    });
  } catch {
    return fallback;
  }
}

function cloneDeepFallback(value, fallback = null, depth = 0, seen = new WeakMap()) {
  if (value === undefined) {
    return fallback;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (depth > MAX_SAFE_CLONE_DEPTH) {
    return "[depth-limit]";
  }

  try {
    if (seen.has(value)) {
      return "[circular]";
    }

    seen.set(value, true);
  } catch {}

  if (value instanceof Date) {
    try {
      return new Date(value.getTime());
    } catch {
      return String(value);
    }
  }

  if (value instanceof Error) {
    return cloneError(value);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_SAFE_CLONE_ARRAY)
      .map((item) => cloneDeepFallback(item, null, depth + 1, seen));
  }

  const output = {};
  const entries = Object.entries(value).slice(0, MAX_SAFE_CLONE_KEYS);

  for (const [key, item] of entries) {
    if (typeof item === "function") {
      continue;
    }

    output[key] = cloneDeepFallback(item, null, depth + 1, seen);
  }

  return output;
}

export function safeClone(value, fallback = null) {
  if (value === undefined) {
    return fallback;
  }

  if (value === null) {
    return null;
  }

  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(safeStringify(value));
  } catch {}

  try {
    return cloneDeepFallback(value, fallback);
  } catch {
    return fallback;
  }
}

export function cloneError(error = null) {
  if (!error) {
    return null;
  }

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
      cause: error.cause
        ? redactTokenInText(safeText(error.cause?.message || error.cause, ""))
        : null,
    };
  }

  if (typeof error === "object") {
    return redactSensitiveObject(error, {
      message: redactTokenInText(String(error)),
    });
  }

  return {
    name: "Error",
    message: redactTokenInText(String(error)),
  };
}

/* =========================================================
   TOKEN REDACTION
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getAllTokenParamNames() {
  try {
    const fromConfig = Object.values(config?.auth?.tokenParamNames || {}).flat();

    return unique([
      ...TOKEN_PARAM_NAMES,
      ...fromConfig,
      ...(config?.security?.sensitiveQueryParams || []),
    ]);
  } catch {
    return [...TOKEN_PARAM_NAMES];
  }
}

export function redactTokenInText(value = "") {
  let output = safeText(value, "");

  if (!output) {
    return "";
  }

  for (const name of getAllTokenParamNames()) {
    try {
      output = output.replace(
        new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  for (const path of TECHNICAL_TOKEN_PATHS) {
    try {
      output = output.replace(
        new RegExp(`(${escapeRegExp(path)})\\/([^/?#\\s]+)`, "gi"),
        "$1/***"
      );
    } catch {}
  }

  try {
    output = output.replace(BEARER_RE, "$1***");
  } catch {}

  try {
    output = output.replace(JWT_RE, "***");
  } catch {}

  return output;
}

export function redactSensitiveObject(value, fallback = null, depth = 0, seen = new WeakMap()) {
  if (value === undefined) {
    return fallback;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return redactTokenInText(value);
  }

  if (typeof value !== "object") {
    return value;
  }

  if (depth > MAX_SAFE_CLONE_DEPTH) {
    return "[depth-limit]";
  }

  try {
    if (seen.has(value)) {
      return "[circular]";
    }

    seen.set(value, true);
  } catch {}

  if (value instanceof Date) {
    try {
      return value.toISOString();
    } catch {
      return String(value);
    }
  }

  if (value instanceof Error) {
    return cloneError(value);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_SAFE_CLONE_ARRAY)
      .map((item) => redactSensitiveObject(item, null, depth + 1, seen));
  }

  const output = {};

  for (const [key, item] of Object.entries(value).slice(0, MAX_SAFE_CLONE_KEYS)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      output[key] = "***";
      continue;
    }

    output[key] = redactSensitiveObject(item, null, depth + 1, seen);
  }

  return output;
}

/* =========================================================
   PATH PARTS
========================================================= */

export function getBaseOrigin() {
  if (isBrowser() && window.location?.origin) {
    return window.location.origin;
  }

  return LOCAL_ORIGIN;
}

export function isAbsoluteUrl(value = "") {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(safeText(value, ""));
}

function getOriginFromUrlLike(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  try {
    if (isAbsoluteUrl(raw)) {
      return new URL(raw).origin;
    }

    return new URL(raw, getBaseOrigin()).origin;
  } catch {
    return "";
  }
}

export function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

export function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return DEFAULT_ROUTE;
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  }

  return raw.replace(/^#\/?/, "/") || DEFAULT_ROUTE;
}

export function normalizeSearch(search = "") {
  const raw = safeText(search, "");

  if (!raw) {
    return "";
  }

  return raw.startsWith("?") ? raw : `?${raw.replace(/^\?+/, "")}`;
}

export function normalizeHash(hash = "") {
  const raw = safeText(hash, "");

  if (!raw) {
    return "";
  }

  return raw.startsWith("#") ? raw : `#${raw.replace(/^#+/, "")}`;
}

export function splitPathParts(path = DEFAULT_ROUTE) {
  const raw = safeText(path, DEFAULT_ROUTE) || DEFAULT_ROUTE;

  if (isHashRouterPath(raw)) {
    return splitPathParts(normalizeHashRouterPath(raw));
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
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
    suffix: `${normalizeSearch(search)}${normalizeHash(hash)}`,
  };
}

export function stripSearchAndHash(path = DEFAULT_ROUTE) {
  return splitPathParts(path).pathname || DEFAULT_ROUTE;
}

export function getSearchAndHash(path = DEFAULT_ROUTE) {
  const parts = splitPathParts(path);
  return `${parts.search}${parts.hash}`;
}

export function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
  let value = String(pathname || DEFAULT_ROUTE)
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) {
    value = DEFAULT_ROUTE;
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  const normalizedSegments = [];

  for (const segment of value.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      normalizedSegments.pop();
      continue;
    }

    normalizedSegments.push(segment);
  }

  value = `/${normalizedSegments.join("/")}` || DEFAULT_ROUTE;

  if (value.length > 1 && value.endsWith("/")) {
    value = value.replace(/\/+$/g, "") || DEFAULT_ROUTE;
  }

  return value;
}

export function normalizePath(path = DEFAULT_ROUTE) {
  if (path === null || path === undefined) {
    return DEFAULT_ROUTE;
  }

  let raw = String(path).trim();

  if (!raw) {
    return DEFAULT_ROUTE;
  }

  if (isHashRouterPath(raw)) {
    return normalizePath(normalizeHashRouterPath(raw));
  }

  try {
    if (isAbsoluteUrl(raw)) {
      const url = new URL(raw, getBaseOrigin());

      if (url.hash && isHashRouterPath(url.hash)) {
        return normalizePath(normalizeHashRouterPath(url.hash));
      }

      raw = `${url.pathname || DEFAULT_ROUTE}${url.search || ""}${url.hash || ""}`;
    }
  } catch {
    return DEFAULT_ROUTE;
  }

  raw = raw.replace(/^[.][/]+/, "/");

  const { pathname, search, hash } = splitPathParts(raw);

  if (hash && isHashRouterPath(hash)) {
    return normalizePath(normalizeHashRouterPath(hash));
  }

  return `${normalizePathnameOnly(pathname)}${search}${hash}`;
}

export function stripUsernamePrefix(path = DEFAULT_ROUTE) {
  const normalized = normalizePath(path);
  const pathOnly = stripSearchAndHash(normalized);
  const suffix = getSearchAndHash(normalized);

  const stripped = pathOnly.replace(/^\/@[^/]+(?=\/|$)/i, "") || DEFAULT_ROUTE;

  return normalizePath(`${stripped}${suffix}`);
}

function collapseTechnicalTokenPath(pathOnly = DEFAULT_ROUTE) {
  const clean = normalizePathnameOnly(pathOnly);

  for (const base of TOKEN_COLLAPSE_PATHS) {
    if (clean === base || clean.startsWith(`${base}/`)) {
      return base;
    }
  }

  return clean;
}

export function normalizeCanonicalPath(path = DEFAULT_ROUTE) {
  const normalized = normalizePath(path);
  const noSlug = stripUsernamePrefix(normalized);
  const pathOnly = stripSearchAndHash(noSlug);

  return collapseTechnicalTokenPath(pathOnly || DEFAULT_ROUTE);
}

export function normalizePublicPath(path = DEFAULT_ROUTE) {
  return normalizePath(path);
}

/* =========================================================
   USERNAME / SLUG
========================================================= */

export function sanitizeUsername(value = "") {
  let raw = String(value || "").normalize("NFKC").trim();

  if (!raw) {
    return "";
  }

  raw = raw.replace(/^@+/, "");

  if (raw.includes("@") && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) {
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
    .slice(0, SAFE_USERNAME_MAX);
}

export function slugify(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, SAFE_SLUG_MAX);
}

export function buildPublicPath(path = DEFAULT_ROUTE, username = "") {
  const publicPath = stripUsernamePrefix(normalizePath(path));
  const cleanUsername = sanitizeUsername(username);

  if (!cleanUsername) {
    return publicPath;
  }

  if (stripSearchAndHash(publicPath) === DEFAULT_ROUTE && !getSearchAndHash(publicPath)) {
    return `/@${cleanUsername}`;
  }

  return normalizePath(`/@${cleanUsername}${publicPath}`);
}

/* =========================================================
   API BASE / URL BUILD
========================================================= */

function getCanonicalBackendOrigins() {
  return unique([
    CANONICAL_PRODUCTION_API_BASE,
    ...(config?.canonicalBackendApiOrigins || []),
    ...(config?.api?.canonicalBackendOrigins || []),
    ...(config?.security?.canonicalBackendApiOrigins || []),
  ])
    .map((origin) => getOriginFromUrlLike(origin))
    .filter(Boolean);
}

function getForbiddenFrontendApiOrigins() {
  const backendOrigins = getCanonicalBackendOrigins();

  return unique([
    ...FALLBACK_FORBIDDEN_FRONTEND_API_ORIGINS,
    ...(config?.forbiddenFrontendApiOrigins || []),
    ...(config?.api?.forbiddenFrontendOrigins || []),
    ...(config?.security?.forbiddenFrontendApiOrigins || []),
  ])
    .map((origin) => getOriginFromUrlLike(origin))
    .filter(Boolean)
    .filter((origin) => !backendOrigins.includes(origin));
}

function isForbiddenFrontendApiBase(value = "") {
  const origin = getOriginFromUrlLike(value);
  return Boolean(origin && getForbiddenFrontendApiOrigins().includes(origin));
}

function isProductionEnv() {
  const env = safeLower(config?.env || config?.environment || "", "");

  return env === "production" || env === "prod";
}

export function normalizeApiBase(base = "") {
  const raw = String(base || "").trim();

  if (!raw || raw === "/" || raw === "/api" || raw === "api") {
    return "";
  }

  if (isAbsoluteUrl(raw)) {
    try {
      const parsed = new URL(raw);

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "";
      }

      const origin = parsed.origin.replace(/\/+$/g, "");
      const pathname = normalizePathnameOnly(parsed.pathname || "/");
      const canonicalOrigins = getCanonicalBackendOrigins();

      if (pathname === "/" || pathname === "/api" || canonicalOrigins.includes(origin)) {
        return origin;
      }

      return `${origin}${pathname}`.replace(/\/+$/g, "");
    } catch {
      return "";
    }
  }

  return raw.replace(/\/+$/g, "");
}

export function getSafeApiBase() {
  const configuredBase = normalizeApiBase(
    config?.apiBase ||
      config?.apiOrigin ||
      config?.apiUrl ||
      config?.api?.base ||
      config?.api?.baseUrl ||
      config?.api?.origin ||
      ""
  );

  if (isProductionEnv()) {
    return CANONICAL_PRODUCTION_API_BASE;
  }

  if (configuredBase && isForbiddenFrontendApiBase(configuredBase)) {
    return CANONICAL_PRODUCTION_API_BASE;
  }

  return configuredBase;
}

function getBasePathFromUrlLike(base = "") {
  const cleanBase = normalizeApiBase(base);

  if (!cleanBase) {
    return "";
  }

  try {
    if (isAbsoluteUrl(cleanBase)) {
      return normalizePathnameOnly(new URL(cleanBase, getBaseOrigin()).pathname || "");
    }

    return normalizePathnameOnly(cleanBase);
  } catch {
    return "";
  }
}

function shouldAvoidDoubleBase(base = "", path = "") {
  const basePath = getBasePathFromUrlLike(base).replace(/^\/+/, "");
  const cleanPath = safeText(path, "").replace(/^\/+/, "");

  if (!basePath || !cleanPath) {
    return false;
  }

  return cleanPath === basePath || cleanPath.startsWith(`${basePath}/`);
}

export function joinUrl(base = "", path = "") {
  const rawPath = String(path || "").trim();

  if (isAbsoluteUrl(rawPath)) {
    return rawPath;
  }

  const cleanBase = normalizeApiBase(base);
  const cleanPath = rawPath.replace(/^\/+/, "");

  if (!cleanPath) {
    return cleanBase || "/";
  }

  if (!cleanBase) {
    return `/${cleanPath}`;
  }

  if (shouldAvoidDoubleBase(cleanBase, cleanPath)) {
    if (isAbsoluteUrl(cleanBase)) {
      try {
        const parsed = new URL(cleanBase, getBaseOrigin());
        return `${parsed.origin}/${cleanPath}`;
      } catch {}
    }

    return `/${cleanPath}`;
  }

  return `${cleanBase}/${cleanPath}`;
}

function appendQueryToUrl(baseUrl = "", query = null) {
  if (!query) {
    return baseUrl;
  }

  let queryEntries = [];

  try {
    if (typeof URLSearchParams !== "undefined" && query instanceof URLSearchParams) {
      queryEntries = Array.from(query.entries());
    } else if (Array.isArray(query)) {
      queryEntries = query;
    } else if (isPlainObject(query)) {
      queryEntries = Object.entries(query);
    }
  } catch {
    queryEntries = [];
  }

  if (!queryEntries.length) {
    return baseUrl;
  }

  const wasAbsolute = isAbsoluteUrl(baseUrl);
  let url;

  try {
    url = new URL(baseUrl, getBaseOrigin());
  } catch {
    return baseUrl;
  }

  for (const [key, value] of queryEntries) {
    const cleanKey = safeText(key, "");

    if (!cleanKey || value === undefined || value === null || value === "") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== "") {
          url.searchParams.append(cleanKey, String(item));
        }
      }

      continue;
    }

    if (value instanceof Date) {
      url.searchParams.set(cleanKey, value.toISOString());
      continue;
    }

    if (typeof value === "object") {
      url.searchParams.set(cleanKey, safeStringify(value, "{}"));
      continue;
    }

    url.searchParams.set(cleanKey, String(value));
  }

  if (wasAbsolute) {
    return url.toString();
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function rewriteForbiddenFrontendApiUrl(url = "") {
  const raw = safeText(url, "");

  if (!raw || !isAbsoluteUrl(raw)) {
    return raw;
  }

  try {
    const parsed = new URL(raw);

    if (!getForbiddenFrontendApiOrigins().includes(parsed.origin)) {
      return raw;
    }

    if (parsed.pathname === "/api" || parsed.pathname.startsWith("/api/")) {
      const backend = new URL(CANONICAL_PRODUCTION_API_BASE);
      return `${backend.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    return raw;
  } catch {
    return raw;
  }
}

export function buildUrl(path = "", query = null) {
  const rawPath = String(path || "").trim();
  const apiBase = getSafeApiBase();

  const baseUrl = isAbsoluteUrl(rawPath)
    ? rewriteForbiddenFrontendApiUrl(rawPath)
    : joinUrl(apiBase, rawPath);

  return appendQueryToUrl(baseUrl, query);
}

/* =========================================================
   TOKEN / PUBLIC API
========================================================= */

export function stripBearerPrefix(token = "") {
  return safeText(token, "").replace(/^Bearer\s+/i, "").trim();
}

export function hasValidToken(token = null) {
  const value = stripBearerPrefix(token);

  if (!value) {
    return false;
  }

  const lower = value.toLowerCase();

  if (BAD_TOKEN_VALUES.includes(lower)) {
    return false;
  }

  if (/[\s\r\n\t]/.test(value)) {
    return false;
  }

  return true;
}

function getApiBasePath() {
  const apiBase = getSafeApiBase();

  if (!apiBase) {
    return "";
  }

  try {
    if (isAbsoluteUrl(apiBase)) {
      return normalizeCanonicalPath(new URL(apiBase, getBaseOrigin()).pathname || "");
    }

    return normalizeCanonicalPath(apiBase);
  } catch {
    return "";
  }
}

function stripApiBasePrefix(path = DEFAULT_ROUTE) {
  const normalized = normalizeCanonicalPath(path);
  const apiBasePath = getApiBasePath();

  if (!apiBasePath || apiBasePath === DEFAULT_ROUTE) {
    return normalized;
  }

  if (normalized === apiBasePath) {
    return DEFAULT_ROUTE;
  }

  if (normalized.startsWith(`${apiBasePath}/`)) {
    return normalizeCanonicalPath(normalized.slice(apiBasePath.length) || DEFAULT_ROUTE);
  }

  return normalized;
}

function pathMatches(path = "", candidate = "") {
  const cleanPath = normalizeCanonicalPath(path);
  const cleanCandidate = normalizeCanonicalPath(candidate);

  if (!cleanCandidate) {
    return false;
  }

  if (cleanCandidate === DEFAULT_ROUTE) {
    return cleanPath === DEFAULT_ROUTE;
  }

  return cleanPath === cleanCandidate || cleanPath.startsWith(`${cleanCandidate}/`);
}

function getConfiguredPublicApiPaths() {
  const configured = config?.auth?.publicApiPaths || config?.publicApiPaths || [];

  return unique([
    ...FALLBACK_PUBLIC_API_PATHS,
    ...safeArray(configured),
  ]).filter((path) => !isPrivateMePath(path));
}

function getConfiguredPrivateApiPaths() {
  const configured = config?.auth?.privateApiPaths || config?.privateApiPaths || [];

  return unique([
    ...FALLBACK_PRIVATE_API_PATHS,
    ...REQUIRED_PRIVATE_ME_PATHS,
    ...safeArray(configured),
  ]);
}

function isPrivateMePath(path = "") {
  const normalized = normalizeCanonicalPath(path);
  const withoutApiBase = stripApiBasePrefix(normalized);

  return REQUIRED_PRIVATE_ME_PATHS.some((privatePath) => (
    pathMatches(normalized, privatePath) ||
    pathMatches(withoutApiBase, privatePath)
  ));
}

function isExplicitPrivateApiPath(path = "") {
  const normalized = normalizeCanonicalPath(path);
  const withoutApiBase = stripApiBasePrefix(normalized);

  return getConfiguredPrivateApiPaths().some((privatePath) => {
    const current = normalizeCanonicalPath(privatePath);
    const currentWithoutApiBase = stripApiBasePrefix(current);

    return (
      pathMatches(normalized, current) ||
      pathMatches(withoutApiBase, current) ||
      pathMatches(normalized, currentWithoutApiBase) ||
      pathMatches(withoutApiBase, currentWithoutApiBase)
    );
  });
}

export function isPublicApiPath(path = "") {
  const normalized = normalizeCanonicalPath(path);
  const withoutApiBase = stripApiBasePrefix(normalized);

  if (isPrivateMePath(normalized) || isPrivateMePath(withoutApiBase)) {
    return false;
  }

  if (isExplicitPrivateApiPath(normalized) || isExplicitPrivateApiPath(withoutApiBase)) {
    return false;
  }

  return getConfiguredPublicApiPaths().some((publicPath) => {
    const current = normalizeCanonicalPath(publicPath);
    const currentWithoutApiBase = stripApiBasePrefix(current);

    return (
      pathMatches(normalized, current) ||
      pathMatches(withoutApiBase, current) ||
      pathMatches(normalized, currentWithoutApiBase) ||
      pathMatches(withoutApiBase, currentWithoutApiBase)
    );
  });
}

export function isPrivateApiPath(path = "") {
  const normalized = normalizeCanonicalPath(path);
  const withoutApiBase = stripApiBasePrefix(normalized);

  if (isPrivateMePath(normalized) || isPrivateMePath(withoutApiBase)) {
    return true;
  }

  return isExplicitPrivateApiPath(normalized) || isExplicitPrivateApiPath(withoutApiBase);
}

/* =========================================================
   USER NORMALIZATION
========================================================= */

function normalizeRoleKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .trim();
}

function normalizeRole(value = "") {
  const key = normalizeRoleKey(value);

  if (!key) {
    return "";
  }

  const aliases = config?.auth?.roles || {};

  for (const [alias, target] of Object.entries(aliases)) {
    if (normalizeRoleKey(alias) === key) {
      return normalizeRoleKey(target || key);
    }
  }

  return key;
}

function looksLikeAuthEnvelope(value = {}) {
  if (!isPlainObject(value)) {
    return false;
  }

  return AUTH_ENVELOPE_KEYS.some((key) => hasOwn(value, key));
}

function hasIdentityInObject(value = {}) {
  if (!isPlainObject(value)) {
    return false;
  }

  return USER_IDENTITY_KEYS.some((key) => Boolean(safeText(value[key], "")));
}

function unwrapUserPayload(payload = null) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const candidates = [
    payload.user,
    payload.usuario,
    payload.me,
    payload.account,
    payload.profile,
    payload.currentUser,
    payload.authUser,
    payload.sessionUser,

    payload.data?.user,
    payload.data?.usuario,
    payload.data?.me,
    payload.data?.account,
    payload.data?.profile,

    payload.payload?.user,
    payload.payload?.usuario,
    payload.payload?.me,
    payload.payload?.account,
    payload.payload?.profile,

    payload.result?.user,
    payload.result?.usuario,
    payload.result?.me,

    payload.auth?.user,
    payload.auth?.usuario,
    payload.auth?.me,

    payload.session?.user,
    payload.sessionData?.user,
    payload.response?.user,
    payload.body?.user,
  ];

  for (const candidate of candidates) {
    if (isPlainObject(candidate) && hasIdentityInObject(candidate)) {
      return candidate;
    }
  }

  return payload;
}

function normalizeActive(user = {}) {
  const status = safeText(
    user.status ||
      user.estado ||
      user.state ||
      user.accountStatus ||
      user.account_status ||
      "",
    ""
  ).toLowerCase();

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
    user.disabled === true ||
    user.isDisabled === true ||
    user.deleted === true ||
    user.isDeleted === true ||
    user.blocked === true ||
    user.isBlocked === true ||
    user.archived === true ||
    user.revoked === true
  ) {
    return false;
  }

  const candidate =
    user.active ??
    user.is_active ??
    user.isActive ??
    user.enabled ??
    user.isEnabled;

  if (candidate === undefined || candidate === null || candidate === "") {
    return true;
  }

  return safeBool(candidate, true);
}

function isSafeAvatarUrl(url = "") {
  const value = safeText(url, "");

  if (!value) {
    return false;
  }

  const lower = value.toLowerCase();

  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("data:text/html") ||
    lower.startsWith("data:application/")
  ) {
    return false;
  }

  if (lower.startsWith("data:image/svg")) {
    return false;
  }

  if (lower.startsWith("data:")) {
    return /^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(value);
  }

  if (lower.startsWith("blob:")) {
    return true;
  }

  if (/^\/(?!\/)/.test(value)) {
    return true;
  }

  if (/^\.\.?\//.test(value)) {
    return true;
  }

  try {
    const parsed = new URL(value, getBaseOrigin());
    return ["http:", "https:", "blob:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function resolveAvatarCandidate(user = {}) {
  const profile = isPlainObject(user.profile) ? user.profile : {};
  const raw = isPlainObject(user.raw) ? user.raw : {};
  const rawProfile = isPlainObject(raw.profile) ? raw.profile : {};
  const meta = isPlainObject(user.meta) ? user.meta : {};
  const settings = isPlainObject(user.settings) ? user.settings : {};

  const candidate = firstNonEmpty(
    user.avatarUrl,
    user.avatarURL,
    user.avatar_url,
    user.avatar,
    user.photo,
    user.photoUrl,
    user.photoURL,
    user.photo_url,
    user.image,
    user.imageUrl,
    user.imageURL,
    user.image_url,
    user.profileImage,
    user.profile_image,
    user.picture,
    user.pictureUrl,
    user.pictureURL,
    user.picture_url,
    user.thumbnail,
    user.thumbnailUrl,
    user.thumbnail_url,

    profile.avatarUrl,
    profile.avatarURL,
    profile.avatar_url,
    profile.avatar,
    profile.photo,
    profile.photoUrl,
    profile.photoURL,
    profile.photo_url,
    profile.image,
    profile.imageUrl,
    profile.imageURL,
    profile.image_url,
    profile.picture,
    profile.pictureUrl,
    profile.pictureURL,
    profile.picture_url,

    meta.avatarUrl,
    meta.avatarURL,
    meta.avatar_url,
    meta.avatar,
    meta.picture,
    meta.pictureUrl,
    meta.pictureURL,
    meta.picture_url,

    settings.avatarUrl,
    settings.avatar_url,
    settings.avatar,

    raw.avatarUrl,
    raw.avatarURL,
    raw.avatar_url,
    raw.avatar,
    raw.photo,
    raw.photoUrl,
    raw.photoURL,
    raw.photo_url,
    raw.image,
    raw.imageUrl,
    raw.imageURL,
    raw.image_url,
    raw.picture,
    raw.pictureUrl,
    raw.pictureURL,
    raw.picture_url,

    rawProfile.avatarUrl,
    rawProfile.avatarURL,
    rawProfile.avatar_url,
    rawProfile.avatar,
    rawProfile.photo,
    rawProfile.photoUrl,
    rawProfile.photoURL,
    rawProfile.photo_url,
    rawProfile.image,
    rawProfile.imageUrl,
    rawProfile.imageURL,
    rawProfile.image_url,
    rawProfile.picture,
    rawProfile.pictureUrl,
    rawProfile.pictureURL,
    rawProfile.picture_url
  );

  return isSafeAvatarUrl(candidate) ? candidate : "";
}

function sanitizeUserPayloadForState(value = {}, depth = 0, seen = new WeakSet()) {
  if (depth > 4 || !isPlainObject(value)) {
    return {};
  }

  try {
    if (seen.has(value)) {
      return {};
    }

    seen.add(value);
  } catch {}

  const output = {};

  for (const [key, item] of Object.entries(value).slice(0, 160)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      continue;
    }

    if (Array.isArray(item)) {
      output[key] = item.slice(0, 120).map((entry) =>
        isPlainObject(entry)
          ? sanitizeUserPayloadForState(entry, depth + 1, seen)
          : entry
      );
      continue;
    }

    if (isPlainObject(item)) {
      output[key] = sanitizeUserPayloadForState(item, depth + 1, seen);
      continue;
    }

    output[key] = item;
  }

  return output;
}

export function normalizeUser(user = null) {
  const source = unwrapUserPayload(user);

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }

  if (looksLikeAuthEnvelope(source) && !hasIdentityInObject(source)) {
    return null;
  }

  if (!hasIdentityInObject(source)) {
    return null;
  }

  const profile = isPlainObject(source.profile) ? source.profile : {};
  const raw = isPlainObject(source.raw) ? source.raw : {};

  const id = firstNonEmpty(
    source.id,
    source.userId,
    source.user_id,
    source.uuid,
    source._id,
    source.uid,
    source.sub,
    profile.id,
    profile.userId,
    profile.user_id,
    raw.id,
    raw.userId,
    raw.user_id,
    raw.sub
  );

  const email = firstNonEmpty(
    source.email,
    source.mail,
    source.emailLower,
    source.email_lower,
    profile.email,
    profile.mail,
    raw.email,
    raw.mail
  );

  const rawName = firstNonEmpty(
    source.name,
    source.nombre,
    source.full_name,
    source.fullName,
    source.display_name,
    source.displayName,
    profile.name,
    profile.nombre,
    profile.full_name,
    profile.fullName,
    profile.display_name,
    profile.displayName,
    raw.name,
    raw.nombre,
    raw.full_name,
    raw.fullName,
    raw.display_name,
    raw.displayName,
    source.username,
    email,
    id,
    "Usuario"
  );

  const username = sanitizeUsername(
    firstNonEmpty(
      source.username,
      source.userName,
      source.user_name,
      source.nick,
      source.alias,
      source.login,
      source.slug,
      profile.username,
      profile.userName,
      profile.user_name,
      profile.nick,
      profile.alias,
      profile.login,
      profile.slug,
      raw.username,
      raw.userName,
      raw.user_name,
      raw.nick,
      raw.alias,
      raw.login,
      raw.slug,
      email,
      id
    )
  );

  const slug = sanitizeUsername(
    firstNonEmpty(
      source.slug,
      source.usernameSlug,
      source.username_slug,
      profile.slug,
      raw.slug,
      username,
      slugify(rawName || "usuario")
    )
  );

  let role = normalizeRole(
    firstNonEmpty(
      source.role,
      source.rol,
      source.userRole,
      source.user_role,
      source.type,
      source.user_type,
      source.userType,
      source.perfil,
      source.profileType,
      profile.role,
      profile.rol,
      profile.userRole,
      profile.user_role,
      raw.role,
      raw.rol,
      raw.userRole,
      raw.user_role
    )
  );

  if (!role && (source.isAdmin === true || source.admin === true)) {
    role = "admin";
  }

  const roles = unique([
    ...(Array.isArray(source.roles) ? source.roles.map(normalizeRole) : []),
    role,
  ]).filter(Boolean);

  const hasAvatar =
    source.hasAvatar ??
    source.has_avatar ??
    source.avatarEnabled ??
    source.avatar_enabled ??
    profile.hasAvatar ??
    profile.has_avatar ??
    raw.hasAvatar ??
    raw.has_avatar;

  const avatar = resolveAvatarCandidate(source);
  const active = normalizeActive(source);
  const cleanSource = sanitizeUserPayloadForState(source);

  return {
    ...cleanSource,

    id: id || null,

    userId: firstNonEmpty(source.userId, source.user_id, id) || null,
    user_id: firstNonEmpty(source.user_id, source.userId, id) || null,
    uid: firstNonEmpty(source.uid, id) || null,
    sub: firstNonEmpty(source.sub, id) || null,

    username,
    usernameLower: firstNonEmpty(source.usernameLower, source.username_lower, username) || null,
    username_lower: firstNonEmpty(source.username_lower, source.usernameLower, username) || null,

    slug,

    name: rawName,
    nombre: source.nombre || rawName,

    displayName: firstNonEmpty(
      source.displayName,
      source.display_name,
      profile.displayName,
      profile.display_name,
      raw.displayName,
      raw.display_name,
      rawName
    ),

    email,
    emailLower: firstNonEmpty(source.emailLower, source.email_lower, email).toLowerCase(),
    email_lower: firstNonEmpty(source.email_lower, source.emailLower, email).toLowerCase(),

    role,
    rol: role,
    roles,

    permissions: safeArray(source.permissions || source.permisos),
    permisos: safeArray(source.permisos || source.permissions),

    avatar: hasAvatar === false ? null : avatar || null,
    avatarUrl: hasAvatar === false ? null : avatar || null,
    picture: hasAvatar === false ? null : avatar || null,

    hasAvatar: hasAvatar === undefined ? Boolean(avatar) : Boolean(hasAvatar),

    avatarUpdatedAt:
      source.avatarUpdatedAt ??
      source.avatar_updated_at ??
      profile.avatarUpdatedAt ??
      profile.avatar_updated_at ??
      raw.avatarUpdatedAt ??
      raw.avatar_updated_at ??
      null,

    active,
  };
}

export function isUsableUser(user = null) {
  const normalized = normalizeUser(user);

  if (!normalized || normalized.active === false) {
    return false;
  }

  return Boolean(
    firstNonEmpty(
      normalized.id,
      normalized.userId,
      normalized.user_id,
      normalized.username,
      normalized.email
    )
  );
}

export function getUserDisplayName(user = null) {
  const source = unwrapUserPayload(user);

  return firstNonEmpty(
    source?.displayName,
    source?.display_name,
    source?.name,
    source?.nombre,
    source?.fullName,
    source?.full_name,
    source?.profile?.displayName,
    source?.profile?.display_name,
    source?.profile?.name,
    source?.raw?.displayName,
    source?.raw?.display_name,
    source?.raw?.name,
    source?.username,
    source?.email,
    "Usuario"
  );
}

export function getUserUsername(user = null) {
  const source = unwrapUserPayload(user);

  return sanitizeUsername(
    firstNonEmpty(
      source?.username,
      source?.userName,
      source?.user_name,
      source?.nick,
      source?.alias,
      source?.login,
      source?.slug,
      source?.profile?.username,
      source?.profile?.userName,
      source?.profile?.user_name,
      source?.profile?.slug,
      source?.raw?.username,
      source?.raw?.userName,
      source?.raw?.user_name,
      source?.raw?.slug,
      source?.email,
      source?.id,
      source?.userId
    )
  );
}

export function getUserAvatarUrl(user = null) {
  const source = unwrapUserPayload(user);

  const hasAvatar =
    source?.hasAvatar ??
    source?.has_avatar ??
    source?.profile?.hasAvatar ??
    source?.profile?.has_avatar ??
    source?.raw?.hasAvatar ??
    source?.raw?.has_avatar;

  if (hasAvatar === false) {
    return "";
  }

  return resolveAvatarCandidate(source || {});
}

export function getInitials(value = "") {
  const text = typeof value === "object" ? getUserDisplayName(value) : safeText(value, "");

  if (!text) {
    return "";
  }

  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 2);
}

/* =========================================================
   LOCATION
========================================================= */

export function getCurrentLocationPath() {
  if (!isBrowser()) {
    return DEFAULT_ROUTE;
  }

  try {
    const hash = window.location.hash || "";

    if (isHashRouterPath(hash)) {
      return normalizePath(hash);
    }

    return normalizePath(
      `${window.location.pathname || DEFAULT_ROUTE}${window.location.search || ""}${hash}`
    );
  } catch {
    return DEFAULT_ROUTE;
  }
}

export function getCurrentLocationCanonicalPath() {
  if (!isBrowser()) {
    return DEFAULT_ROUTE;
  }

  try {
    const hash = window.location.hash || "";

    if (isHashRouterPath(hash)) {
      return normalizeCanonicalPath(hash);
    }

    return normalizeCanonicalPath(
      `${window.location.pathname || DEFAULT_ROUTE}${window.location.search || ""}${hash}`
    );
  } catch {
    return DEFAULT_ROUTE;
  }
}

/* =========================================================
   HREF SAFETY
========================================================= */

export function isHashOnlyHref(href = "") {
  const value = safeText(href, "");
  return value.startsWith("#") && !isHashRouterPath(value);
}

export function isUnsafeHref(href = "") {
  const value = safeText(href, "");

  if (!value) {
    return true;
  }

  return /^(javascript|data|vbscript):/i.test(value);
}

export function isExternalHref(href = "") {
  const value = safeText(href, "");

  if (!value || isUnsafeHref(value)) {
    return false;
  }

  if (!isAbsoluteUrl(value)) {
    return false;
  }

  if (!isBrowser()) {
    return true;
  }

  try {
    return new URL(value).origin !== window.location.origin;
  } catch {
    return false;
  }
}

/* =========================================================
   HOOKS / THEME
========================================================= */

export async function runHookSeries(hooks = [], payload) {
  let current = payload;

  for (const hook of safeArray(hooks)) {
    if (typeof hook !== "function") {
      continue;
    }

    try {
      const result = await hook(current);

      if (result !== undefined) {
        current = result;
      }
    } catch (error) {
      if (config?.debug) {
        try {
          console.error(`[${config?.appName || "Onion"}] Error ejecutando hook`, cloneError(error));
        } catch {}
      }
    }
  }

  return current;
}

export function getThemeColor(theme = config?.defaultTheme) {
  return theme === "light"
    ? config?.ui?.themeColorLight || "#f4f7fb"
    : config?.ui?.themeColorDark || "#0a0c11";
}

/* =========================================================
   ABORT / HEADERS / NETWORK
========================================================= */

export function createAbortTimeout(ms = config?.requestTimeout) {
  if (typeof AbortController === "undefined") {
    return {
      controller: null,
      timeoutId: null,
      signal: null,
      clear: () => {},
    };
  }

  const controller = new AbortController();
  const normalizedMs = Number(ms);

  if (!Number.isFinite(normalizedMs) || normalizedMs <= 0) {
    return {
      controller,
      timeoutId: null,
      signal: controller.signal,
      clear: () => {},
    };
  }

  const timeoutId = setTimeout(() => {
    try {
      controller.abort("timeout");
    } catch {
      try {
        controller.abort();
      } catch {}
    }
  }, normalizedMs);

  return {
    controller,
    timeoutId,
    signal: controller.signal,

    clear() {
      try {
        clearTimeout(timeoutId);
      } catch {}
    },
  };
}

export function normalizeHeaders(headers = {}) {
  let source = [];

  try {
    if (typeof Headers !== "undefined" && headers instanceof Headers) {
      source = Array.from(headers.entries());
    } else if (Array.isArray(headers)) {
      source = headers;
    } else {
      source = Object.entries(headers || {});
    }
  } catch {
    source = [];
  }

  return source.reduce((acc, [key, value]) => {
    const normalizedKey = String(key || "").trim();

    if (!normalizedKey) {
      return acc;
    }

    if (value !== undefined && value !== null && value !== "") {
      acc[normalizedKey] = value;
    }

    return acc;
  }, {});
}

export function mergeAbortSignals(signals = []) {
  const validSignals = safeArray(signals).filter(Boolean);

  if (!validSignals.length) {
    return null;
  }

  if (validSignals.length === 1) {
    return validSignals[0];
  }

  try {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
      return AbortSignal.any(validSignals);
    }
  } catch {}

  if (typeof AbortController === "undefined") {
    return validSignals[0] || null;
  }

  const controller = new AbortController();
  const cleanups = [];

  function teardown() {
    for (const cleanup of cleanups) {
      try {
        cleanup?.();
      } catch {}
    }

    cleanups.length = 0;
  }

  function abortFrom(sourceSignal) {
    if (controller.signal.aborted) {
      return;
    }

    try {
      controller.abort(sourceSignal?.reason || "aborted");
    } catch {
      try {
        controller.abort();
      } catch {}
    } finally {
      teardown();
    }
  }

  for (const signal of validSignals) {
    if (signal.aborted) {
      abortFrom(signal);
      continue;
    }

    const onAbort = () => abortFrom(signal);

    try {
      signal.addEventListener("abort", onAbort, { once: true });

      cleanups.push(() => {
        try {
          signal.removeEventListener("abort", onAbort);
        } catch {}
      });
    } catch {}
  }

  return controller.signal;
}

export function isAbortError(error) {
  const message = String(error?.message || "").toLowerCase();
  const name = String(error?.name || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    name === "aborterror" ||
    code === "20" ||
    code === "abort_err" ||
    message.includes("aborted") ||
    message.includes("abort")
  );
}

export function isProbablyTimeoutError(error) {
  const message = String(error?.message || "").toLowerCase();
  const name = String(error?.name || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  const raw = String(error?.raw || "").toLowerCase();
  const reason = String(error?.reason || "").toLowerCase();

  return (
    name === "timeouterror" ||
    code === "etimedout" ||
    code === "request_timeout" ||
    code === "boot_timeout" ||
    message.includes("timeout") ||
    raw.includes("timeout") ||
    reason.includes("timeout") ||
    error?.timeout === true
  );
}

export function detectNetworkHints(url = "") {
  const hints = [];

  if (!isBrowser()) {
    return hints;
  }

  try {
    if (navigator.onLine === false) {
      hints.push("El navegador parece estar offline.");
    }
  } catch {}

  const rawUrl = safeText(url, "");

  if (!rawUrl) {
    return hints;
  }

  try {
    const currentProtocol = window.location.protocol;

    if (/^https:\/\//i.test(rawUrl) && currentProtocol === "http:") {
      hints.push("Hay mezcla de protocolos: frontend en HTTP y API en HTTPS.");
    }

    if (/^http:\/\//i.test(rawUrl) && currentProtocol === "https:") {
      hints.push("Hay mezcla de protocolos: frontend en HTTPS y API en HTTP.");
    }

    const apiOrigin = new URL(rawUrl, window.location.origin).origin;

    if (apiOrigin && apiOrigin !== window.location.origin) {
      hints.push("Petición cross-origin: revisa CORS y preflight OPTIONS.");
    }

    if (getForbiddenFrontendApiOrigins().includes(apiOrigin)) {
      hints.push("La petición apunta al dominio frontend. El backend canónico es https://api.onionit.net.");
    }
  } catch {}

  return hints;
}

/* =========================================================
   DEBUG SNAPSHOT
========================================================= */

export function getHelpersSnapshot() {
  return {
    version: HELPERS_VERSION,
    browser: isBrowser(),
    documentReady: isDocumentReady(),

    locationPath: redactTokenInText(getCurrentLocationPath()),
    locationCanonicalPath: redactTokenInText(getCurrentLocationCanonicalPath()),

    apiBase: getSafeApiBase(),
    apiBasePath: getApiBasePath(),
    canonicalProductionApiBase: CANONICAL_PRODUCTION_API_BASE,
    canonicalBackendApiOrigins: getCanonicalBackendOrigins(),
    forbiddenFrontendApiOrigins: getForbiddenFrontendApiOrigins(),

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
