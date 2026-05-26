/* =========================================================
   Onion Support - Core Helpers
   Archivo: /src/core/helpers.js

   Responsabilidad:
   - Helpers puros mínimos.
   - Compat utilitaria del Core.
   - Delegar rutas/endpoints/API base en core/config.js.
   - Sin fetch.
   - Sin storage real.
   - Sin Auth runtime.
   - Sin Router.
   - Sin Store.
   - Sin Toast.
   - Sin estado global mutable.
   - Token param único: token.
   - /api/auth/me siempre privado.
   - Usuario inválido si disabled/deleted/archived/active=false.
   - Roles únicos: admin / user.
   - Idioma base: es.
   - Sin 2FA/MFA/OTP funcional.
========================================================= */

import {
  config,
  CANONICAL_PRODUCTION_API_BASE,
  CANONICAL_BACKEND_API_ORIGINS,
  TOKEN_PARAM,
  AUTH_ENDPOINTS,
  PUBLIC_API_PATHS,
  PRIVATE_API_PATHS,
  getApiBase as configGetApiBase,
  isCanonicalBackendApiBase,
  isPublicApiPath as configIsPublicApiPath,
  isPrivateApiPath as configIsPrivateApiPath,
  routePathFromUrlLike as configRoutePathFromUrlLike,
  endpointPathFromUrlLike as configEndpointPathFromUrlLike,
  normalizeUserSlug as configNormalizeUserSlug,
} from "./config.js";

export const HELPERS_VERSION = "core.helpers.v2";

const DEFAULT_ROUTE = "/";
const DEFAULT_LANG = "es";
const DEFAULT_THEME = "system";
const LOCAL_ORIGIN = "http://localhost";
const STORAGE_PREFIX = "onion";

const VALID_LANGS = new Set(["es", "ca", "en"]);
const VALID_THEMES = new Set(["dark", "light", "system"]);
const VALID_ROLES = new Set(["admin", "user"]);

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

const SENSITIVE_KEYS = new Set([
  "token",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "id_token",
  "idtoken",
  "jwt",

  "password",
  "passwordhash",
  "password_hash",
  "hash",
  "salt",
  "passwordmeta",

  "authorization",
  "authheader",
  "cookie",

  "secret",
  "secrets",
  "code",
  "codes",
  "backupcodes",
  "backup_codes",

  "otp",
  "otpcode",
  "totp",
  "mfa",
  "twofa_secret",
  "twofasecret",
  "totpsecret",

  "apikey",
  "api_key",
  "sas",
  "connectionstring",
  "connection_string",

  "_rid",
  "_self",
  "_etag",
  "_attachments",
  "_ts",
  "_lsn",
  "_metadata",
]);

const SENSITIVE_QUERY_KEYS = new Set([
  TOKEN_PARAM,
  "access_token",
  "refresh_token",
  "id_token",
  "secret",
  "session",
  "code",
  "password",
  "pwd",
  "key",
  "sig",
  "signature",
  "jwt",
  "authorization",
  "reset_token",
  "activation_token",
]);

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
  const text = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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
  return [
    ...new Set(
      (Array.isArray(values) ? values : [values]).filter(Boolean)
    ),
  ];
}

export function firstNonEmpty(...values) {
  for (const value of values) {
    const clean = safeText(value, "");
    if (clean) return clean;
  }

  return "";
}

export function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(Object(object), key);
}

export function isDomScope(scope) {
  if (!isBrowser() || !scope) return false;

  return Boolean(
    scope === document ||
      scope === window ||
      (
        typeof Element !== "undefined" &&
        scope instanceof Element
      ) ||
      (
        typeof Document !== "undefined" &&
        scope instanceof Document
      ) ||
      (
        typeof DocumentFragment !== "undefined" &&
        scope instanceof DocumentFragment
      )
  );
}

export function normalizeListenerOptions(options = false) {
  if (typeof options === "boolean") {
    return {
      capture: options,
    };
  }

  return safeObject(options, {});
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
  if (value === undefined) return undefined;

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
    return fallback;
  }
}

export function cloneError(error = null) {
  if (!error) return null;

  return {
    name: error.name || "Error",
    message: redactTokenInText(error.message || String(error)),
    code: error.code || error.error || null,
    status: error.status || error.statusCode || error.response?.status || null,
  };
}

/* =========================================================
   STORAGE COMPAT
   No toca storage real. Sólo construye claves.
========================================================= */

export function getStoragePrefix() {
  return safeText(config?.storagePrefix, STORAGE_PREFIX);
}

export function buildStorageKey(key = "") {
  const clean = safeText(key, "");

  if (!clean) return getStoragePrefix();

  const prefix = getStoragePrefix().replace(/:+$/g, "");

  if (clean.startsWith(`${prefix}:`)) {
    return clean;
  }

  return `${prefix}:${clean.replace(/^:+/g, "")}`;
}

/* =========================================================
   REDACTION
========================================================= */

function normalizeKey(value = "") {
  return safeText(value, "").toLowerCase();
}

function keyIsSensitive(value = "") {
  return SENSITIVE_KEYS.has(normalizeKey(value));
}

export function redactTokenInText(value = "") {
  return String(value || "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

export function redactSensitiveObject(value, fallback = null, depth = 0) {
  if (depth > 8) return null;
  if (value === undefined) return fallback;
  if (value === null) return null;

  if (typeof value === "string") {
    return redactTokenInText(value);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 500)
      .map((item) => redactSensitiveObject(item, null, depth + 1));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const output = {};

  for (const [key, item] of Object.entries(value)) {
    if (keyIsSensitive(key)) {
      output[key] = item ? "***" : item;
      continue;
    }

    output[key] = redactSensitiveObject(item, null, depth + 1);
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

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  }

  if (raw.startsWith("#/")) {
    return raw.slice(1) || DEFAULT_ROUTE;
  }

  return raw || DEFAULT_ROUTE;
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

  try {
    raw = configRoutePathFromUrlLike(raw) || DEFAULT_ROUTE;
  } catch {
    // fallback local abajo
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

export function normalizePath(path = DEFAULT_ROUTE) {
  if (path === null || path === undefined) return DEFAULT_ROUTE;

  let raw = safeText(path, DEFAULT_ROUTE);

  if (isHashRouterPath(raw)) {
    raw = normalizeHashRouterPath(raw);
  }

  try {
    raw = configRoutePathFromUrlLike(raw) || DEFAULT_ROUTE;
  } catch {
    if (isAbsoluteUrl(raw)) {
      try {
        const url = new URL(raw, getBaseOrigin());
        raw = url.origin === getBaseOrigin()
          ? `${url.pathname}${url.search}${url.hash}`
          : DEFAULT_ROUTE;
      } catch {
        raw = DEFAULT_ROUTE;
      }
    }
  }

  const { pathname, search, hash } = splitPathParts(raw);

  return `${normalizePathnameOnly(pathname)}${normalizeSearch(search)}${normalizeHash(hash)}`;
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

  return cleanUser
    ? normalizePath(`/@${cleanUser}${cleanPath}`)
    : cleanPath;
}

/* =========================================================
   API / URL
========================================================= */

export function normalizeApiBase(base = CANONICAL_PRODUCTION_API_BASE) {
  const raw = safeText(base, configGetApiBase()).replace(/\/+$/g, "");

  if (!raw || raw === "/api" || raw === "api") {
    return configGetApiBase();
  }

  if (!isAbsoluteUrl(raw)) {
    return configGetApiBase();
  }

  try {
    const url = new URL(raw);

    if (!["http:", "https:"].includes(url.protocol)) {
      return configGetApiBase();
    }

    if (!isCanonicalBackendApiBase(url.origin)) {
      return configGetApiBase();
    }

    return url.origin;
  } catch {
    return configGetApiBase();
  }
}

export function getSafeApiBase() {
  return normalizeApiBase(
    config?.apiBase ||
      config?.apiOrigin ||
      config?.api?.baseUrl ||
      config?.api?.base ||
      configGetApiBase()
  );
}

function endpointPathFromInput(path = "") {
  try {
    return configEndpointPathFromUrlLike(path) || "";
  } catch {
    const raw = safeText(path, "");

    if (!raw) return "";
    if (raw.startsWith("//")) return "";

    try {
      if (/^https?:\/\//i.test(raw)) {
        const url = new URL(raw);

        return isCanonicalBackendApiBase(url.origin)
          ? `${url.pathname || "/"}${url.search || ""}`
          : "";
      }
    } catch {
      return "";
    }

    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
      return "";
    }

    return raw.startsWith("/") ? raw : `/${raw}`;
  }
}

export function joinUrl(base = "", path = "") {
  const root = normalizeApiBase(base || getSafeApiBase()).replace(/\/+$/g, "");
  const endpoint = endpointPathFromInput(path);

  if (!root || !endpoint) return root || "";

  const cleanPath = endpoint.replace(/^\/+/g, "");

  return `${root}/${cleanPath}`;
}

export function buildUrl(path = "", query = null) {
  const baseUrl = joinUrl(getSafeApiBase(), path);

  if (!baseUrl || !query || !isPlainObject(query)) return baseUrl;

  const url = new URL(baseUrl, getBaseOrigin());

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== "") {
          url.searchParams.append(key, String(item));
        }
      }

      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

export function isPublicApiPath(path = "") {
  try {
    return configIsPublicApiPath(path);
  } catch {
    const clean = normalizeCanonicalPath(path);

    if (clean === AUTH_ENDPOINTS.me) return false;

    return PUBLIC_API_PATHS.some((item) => clean === item);
  }
}

export function isPrivateApiPath(path = "") {
  try {
    return configIsPrivateApiPath(path);
  } catch {
    const clean = normalizeCanonicalPath(path);

    if (clean === AUTH_ENDPOINTS.me) return true;

    return PRIVATE_API_PATHS.some((item) => clean === item);
  }
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
  if (value.length > 8192) return false;

  return ![
    "null",
    "undefined",
    "false",
    "true",
    "[object object]",
    "{}",
    "[]",
  ].includes(value.toLowerCase());
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
  if (!isPlainObject(user)) return true;

  const status = safeLower(
    user.status ||
      user.estado ||
      user.state ||
      "",
    ""
  );

  return Boolean(
    user.disabled === true ||
      user.deleted === true ||
      user.archived === true ||
      user.revoked === true ||
      user.blocked === true ||
      user.banned === true ||
      user.suspended === true ||
      user.active === false ||
      user.enabled === false ||
      Boolean(user.deletedAt) ||
      INVALID_USER_STATUSES.has(status)
  );
}

function hasUserIdentity(user = null) {
  if (!isPlainObject(user)) return false;

  return Boolean(
    safeText(user.id, "") ||
      safeText(user.userId, "") ||
      safeText(user.uid, "") ||
      safeText(user.sub, "") ||
      safeText(user.username, "") ||
      safeText(user.slug, "") ||
      safeText(user.lookup?.slug, "")
  );
}

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = safeLower(value, "");

  return VALID_ROLES.has(role) ? role : "";
}

function cleanRole(value = "") {
  return normalizeRole(value) || "user";
}

function normalizeUserSlug(value = "") {
  try {
    return configNormalizeUserSlug(value) || "";
  } catch {
    return slugify(value);
  }
}

export function normalizeUser(user = null) {
  const source = userPayload(user);

  if (!isPlainObject(source)) return null;
  if (userDisabled(source)) return null;
  if (!hasUserIdentity(source)) return null;

  const safeUser = redactSensitiveObject(source, null);

  if (!isPlainObject(safeUser)) return null;

  const id = safeText(
    safeUser.userId ||
      safeUser.id ||
      safeUser.uid ||
      safeUser.sub ||
      "",
    ""
  );

  const email = safeText(safeUser.email, "") || null;

  const slug = normalizeUserSlug(
    safeUser.slug ||
      safeUser.lookup?.slug ||
      safeUser.profile?.slug ||
      safeUser.routing?.slug ||
      safeUser.username ||
      safeUser.userName ||
      safeUser.user_name ||
      safeUser.usernameLower ||
      safeUser.username_lower ||
      id ||
      ""
  );

  const username = sanitizeUsername(
    safeUser.username ||
      safeUser.userName ||
      safeUser.user_name ||
      safeUser.usernameLower ||
      safeUser.username_lower ||
      slug ||
      email ||
      id ||
      ""
  );

  if (!id && !username && !email) return null;

  const profile = isPlainObject(safeUser.profile) ? safeUser.profile : {};

  const name = firstNonEmpty(
    safeUser.name,
    safeUser.fullName,
    safeUser.displayName,
    safeUser.nombre,
    profile.name,
    profile.fullName,
    profile.displayName,
    profile.nombre,
    username,
    email,
    id,
    "Usuario"
  );

  const role = cleanRole(safeUser.role || safeUser.rol || safeUser.roles);

  const avatar = firstNonEmpty(
    safeUser.avatarUrl,
    safeUser.avatar,
    safeUser.picture,
    safeUser.pictureUrl,
    safeUser.photoUrl,
    safeUser.photoURL,
    safeUser.imageUrl,
    safeUser.image,
    profile.avatarUrl,
    profile.avatar,
    profile.picture
  );

  return {
    ...safeUser,

    id: id || null,
    userId: safeUser.userId || id || null,
    uid: safeUser.uid || id || null,
    sub: safeUser.sub || id || null,

    username: username || null,
    usernameLower: username || null,
    slug: safeUser.slug || slug || username || null,

    name,
    nombre: safeUser.nombre || name,
    fullName: safeUser.fullName || name,
    displayName: safeUser.displayName || name,

    email,
    emailLower: email ? email.toLowerCase() : null,

    role,
    rol: role,
    userRole: role,
    roles: [role],

    avatar: avatar || null,
    avatarUrl: avatar || null,
    picture: safeUser.picture || safeUser.pictureUrl || avatar || null,
    photoUrl: safeUser.photoUrl || safeUser.photoURL || avatar || null,
    hasAvatar: Boolean(safeUser.hasAvatar || avatar),

    active: true,
    enabled: true,
    disabled: false,
    deleted: false,
    archived: false,

    isAdmin: role === "admin",
    isUser: role === "user",
  };
}

export function isUsableUser(user = null) {
  return Boolean(normalizeUser(user));
}

export function getUserDisplayName(user = null) {
  const normalized = normalizeUser(user);

  return (
    normalized?.displayName ||
    normalized?.fullName ||
    normalized?.name ||
    normalized?.nombre ||
    normalized?.username ||
    normalized?.email ||
    "Usuario"
  );
}

export function getUserUsername(user = null) {
  const normalized = normalizeUser(user);
  return normalized?.username || "";
}

export function getUserAvatarUrl(user = null) {
  const normalized = normalizeUser(user);

  return (
    normalized?.avatarUrl ||
    normalized?.avatar ||
    normalized?.picture ||
    normalized?.photoUrl ||
    ""
  );
}

export function getInitials(value = "") {
  const source = typeof value === "object"
    ? getUserDisplayName(value)
    : safeText(value, "");

  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 2) || "ON";
}

/* =========================================================
   HOOKS / THEME
========================================================= */

export async function runHookSeries(hooks = [], payload = {}) {
  let current = payload;

  for (const hook of safeArray(hooks)) {
    if (!isFunction(hook)) continue;

    const result = await hook(current);

    if (result !== undefined) {
      current = result;
    }
  }

  return current;
}

export function getThemeColor(theme = DEFAULT_THEME) {
  return normalizeTheme(theme) === "light" ? "#ffffff" : "#0a0c11";
}

function normalizeTheme(value = DEFAULT_THEME) {
  const theme = safeLower(value, DEFAULT_THEME);
  return VALID_THEMES.has(theme) ? theme : DEFAULT_THEME;
}

export function normalizeLang(value = DEFAULT_LANG) {
  const lang = safeLower(value, DEFAULT_LANG);
  return VALID_LANGS.has(lang) ? lang : DEFAULT_LANG;
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
      clear: () => true,
    };
  }

  const controller = new AbortController();
  const timeout = safeNumber(ms, 30000);

  if (!Number.isFinite(timeout) || timeout <= 0) {
    return {
      controller,
      timeoutId: null,
      signal: controller.signal,
      clear: () => true,
    };
  }

  const timeoutId = setTimeout(() => {
    try {
      controller.abort("timeout");
    } catch {
      controller.abort();
    }
  }, timeout);

  return {
    controller,
    timeoutId,
    signal: controller.signal,
    clear: () => {
      clearTimeout(timeoutId);
      return true;
    },
  };
}

export function normalizeHeaders(headers = null) {
  const output = {};

  if (!headers) return output;

  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    headers.forEach((value, key) => {
      output[key] = value;
    });

    return output;
  }

  if (Array.isArray(headers)) {
    for (const pair of headers) {
      if (Array.isArray(pair) && pair.length >= 2) {
        output[String(pair[0])] = String(pair[1]);
      }
    }

    return output;
  }

  if (isPlainObject(headers)) {
    return {
      ...headers,
    };
  }

  return output;
}

export function mergeAbortSignals(...signals) {
  const list = signals.flat(Infinity).filter(Boolean);
  const valid = list.filter((signal) => {
    return Boolean(
      signal &&
        typeof signal === "object" &&
        "aborted" in signal
    );
  });

  if (!valid.length) return null;
  if (valid.length === 1) return valid[0];

  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
    return AbortSignal.any(valid);
  }

  if (typeof AbortController === "undefined") {
    return valid[0];
  }

  const controller = new AbortController();

  const abort = (signal) => {
    try {
      controller.abort(signal?.reason || "aborted");
    } catch {
      controller.abort();
    }
  };

  for (const signal of valid) {
    if (signal.aborted) {
      abort(signal);
      break;
    }

    try {
      signal.addEventListener("abort", () => abort(signal), { once: true });
    } catch {
      // noop
    }
  }

  return controller.signal;
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
    canonicalApiBase: CANONICAL_PRODUCTION_API_BASE,
    canonicalBackendApiOrigins: CANONICAL_BACKEND_API_ORIGINS,

    meIsPublic: isPublicApiPath(AUTH_ENDPOINTS.me),
    meIsPrivate: isPrivateApiPath(AUTH_ENDPOINTS.me),

    tokenParam: TOKEN_PARAM,

    defaults: {
      lang: DEFAULT_LANG,
      theme: DEFAULT_THEME,
    },

    policy: {
      pureHelpers: true,
      noFetch: true,
      noStorageReal: true,
      noAuthRuntime: true,
      noRouter: true,
      noStore: true,
      noToast: true,
      configOwnsRoutesAndApi: true,
      meAlwaysPrivate: true,
      snapshotRedacted: true,
    },
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
  normalizeLang,

  createAbortTimeout,
  normalizeHeaders,
  mergeAbortSignals,
  isAbortError,
  isProbablyTimeoutError,
  detectNetworkHints,

  getHelpersSnapshot,
};
