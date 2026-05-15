/* =========================================================
   Onion SPA - Core Session
   Archivo: src/core/session.js

   ONION SUPPORT · CORE SESSION
   PREFERENCES · SESSION · STRICT AUTH · ROUTE SAFE · 17/10

   Responsabilidades:
   - cargar preferencias persistidas
   - cargar sesión persistida sin ghost-auth
   - sincronizar route/publicPath
   - aplicar usuario/token en una mutación lógica cuando setState existe
   - limpiar sesión local sin tocar preferencias
   - mantener auth consistente con state.computeAuthenticated()
   - preservar currentResolvedUsername sólo con sesión autenticada
   - sincronizar UI base, tema, idioma, sidebar y loader

   Candados:
   - token sin usuario usable NO autentica
   - usuario sin token usable NO autentica
   - no pinta usuario antiguo si no hay token válido
   - no emite token real en eventos/snapshots
   - canonical route sin query/hash
   - publicPath conserva query/hash y /@usuario
   - clearSession no borra theme/lang/appearance/sidebar/settings/ui/preferences
   - compatible con storage local/session/memory
   - compatible con preboot theme system/light/dark
   - cero throws accidentales
========================================================= */

import { config } from "./config.js";

import {
  normalizePath,
  normalizeCanonicalPath,
  normalizeUser,
  hasValidToken,
  isUsableUser,
  getUserUsername,
  getUserDisplayName,
  getUserAvatarUrl,
  getThemeColor,
  sanitizeUsername,
  safeText,
  safeBool,
  safeObject,
  safeArray,
  safeLower,
  redactTokenInText,
  cloneError as helperCloneError,
} from "./helpers.js";

import {
  computeAuthenticated,
} from "./state.js";

import {
  removeLegacySessionKeys,
} from "./storage.js";

/* =========================================================
   CONSTANTS
========================================================= */

const SESSION_VERSION = "17.0.0";

const DEFAULT_ROUTE = "/";
const DEFAULT_LANG = "es";
const DEFAULT_THEME = "dark";
const DEFAULT_THEME_MODE = "system";

const ACTIVATION_PATH = "/activate-account";
const RESET_CONFIRM_PATH = "/reset-password/confirm";

const VALID_THEMES = Object.freeze([
  "dark",
  "light",
]);

const VALID_THEME_MODES = Object.freeze([
  "dark",
  "light",
  "system",
]);

const VALID_LANG_RE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i;

const SESSION_EVENTS = Object.freeze({
  routeChange: "app:route:change",
  publicPathChange: "app:public-path:change",
  userChange: "app:user:change",
  tokenChange: "app:token:change",
  authChange: "app:auth:change",
  sessionState: "app:session:state",
  sessionApplied: "app:session:applied",
  sessionLoaded: "app:session:loaded",
  sessionCleared: "app:session:cleared",
  preferencesLoaded: "app:preferences:loaded",
  themeChange: "app:theme:change",
  langChange: "app:lang:change",
  sidebarChange: "app:sidebar:change",
  loadingChange: "app:loading:change",
  error: "app:error",
});

const STORAGE_KEY_FALLBACKS = Object.freeze({
  token: "token",
  accessToken: "accessToken",
  access_token: "access_token",
  refreshToken: "refreshToken",
  refresh_token: "refresh_token",
  tempToken: "tempToken",
  temp_token: "temp_token",
  sessionId: "sessionId",
  sessionUserId: "sessionUserId",
  user: "user",
  currentUser: "currentUser",
  authUser: "authUser",
  sessionUser: "sessionUser",
  role: "role",
  roles: "roles",
  theme: "theme",
  themeMode: "themeMode",
  appearance: "appearance",
  lang: "lang",
  sidebarOpen: "sidebarOpen",
  sidebarCollapsed: "sidebarCollapsed",
  lastRoute: "lastRoute",
  lastPublicPath: "lastPublicPath",
  postLoginTarget: "postLoginTarget",
  redirectAfterLogin: "redirectAfterLogin",
});

const AUTH_STORAGE_KEYS = Object.freeze([
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "tempToken",
  "temp_token",
  "sessionId",
  "sessionUserId",
  "user",
  "currentUser",
  "authUser",
  "sessionUser",
  "role",
  "roles",
  "postLoginTarget",
  "redirectAfterLogin",
]);

const TOKEN_STORAGE_KEYS = Object.freeze([
  "token",
  "accessToken",
  "access_token",
]);

const AUX_TOKEN_STORAGE_KEYS = Object.freeze([
  "refreshToken",
  "refresh_token",
  "tempToken",
  "temp_token",
]);

const USER_ID_KEYS = Object.freeze([
  "id",
  "userId",
  "user_id",
  "_id",
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
]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return value !== null && typeof value === "object";
}

function isPlainObject(value) {
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

function isFunction(value) {
  return typeof value === "function";
}

function localSafeText(value, fallback = "") {
  try {
    if (typeof safeText === "function") {
      return safeText(value, fallback);
    }
  } catch {}

  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function localSafeObject(value, fallback = {}) {
  try {
    if (typeof safeObject === "function") {
      return safeObject(value, fallback);
    }
  } catch {}

  return isPlainObject(value) ? value : fallback;
}

function localSafeLower(value, fallback = "") {
  try {
    if (typeof safeLower === "function") {
      return safeLower(value, fallback);
    }
  } catch {}

  return localSafeText(value, fallback).toLowerCase();
}

function localSafeBool(value, fallback = false) {
  try {
    if (typeof safeBool === "function") {
      return safeBool(value, fallback);
    }
  } catch {}

  if (value === true) return true;
  if (value === false) return false;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const clean = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí", "ok", "on", "enabled"].includes(clean)) {
      return true;
    }

    if (["false", "0", "no", "off", "disabled"].includes(clean)) {
      return false;
    }
  }

  return Boolean(fallback);
}

function localSafeArray(value) {
  try {
    if (typeof safeArray === "function") {
      return safeArray(value);
    }
  } catch {}

  return Array.isArray(value) ? value : [];
}

function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeNowIso(ms = safeNow()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function hasOwn(obj, key) {
  try {
    return Boolean(
      obj &&
      typeof obj === "object" &&
      Object.prototype.hasOwnProperty.call(obj, key)
    );
  } catch {
    return false;
  }
}

function safeEmit(events, name, payload = {}) {
  const eventName = localSafeText(name, "");

  if (!eventName) {
    return false;
  }

  try {
    if (isFunction(events?.emit)) {
      events.emit(eventName, sanitizeForEvent(payload));
      return true;
    }
  } catch {}

  try {
    if (isFunction(events?.dispatch)) {
      events.dispatch(eventName, sanitizeForEvent(payload));
      return true;
    }
  } catch {}

  return false;
}

function safeSetState(setState, patch = {}, options = undefined) {
  if (!isFunction(setState)) {
    return false;
  }

  try {
    if (options !== undefined) {
      setState(localSafeObject(patch), options);
    } else {
      setState(localSafeObject(patch));
    }

    return true;
  } catch {}

  return false;
}

function commitState({
  state,
  setState,
  patch = {},
  options = {},
} = {}) {
  const cleanPatch = localSafeObject(patch, {});
  const wrote = safeSetState(setState, cleanPatch, options);

  if (state && isObject(state)) {
    try {
      Object.assign(state, cleanPatch);
    } catch {}
  }

  return wrote;
}

function getStorageKey(name = "", fallback = "") {
  const cleanName = localSafeText(name, "");
  const keys = localSafeObject(config?.storageKeys, {});

  return (
    localSafeText(keys?.[cleanName], "") ||
    localSafeText(STORAGE_KEY_FALLBACKS?.[cleanName], "") ||
    localSafeText(fallback, "") ||
    cleanName
  );
}

function safeStorageGet(storage, key, fallback = null, options = undefined) {
  const finalKey = localSafeText(key, "");

  if (!finalKey) {
    return fallback;
  }

  try {
    if (options !== undefined) {
      return storage?.get?.(finalKey, fallback, options);
    }

    return storage?.get?.(finalKey, fallback);
  } catch {
    return fallback;
  }
}

function safeStorageGetRaw(storage, key, fallback = null, options = undefined) {
  const finalKey = localSafeText(key, "");

  if (!finalKey) {
    return fallback;
  }

  try {
    if (isFunction(storage?.getRaw)) {
      if (options !== undefined) {
        return storage.getRaw(finalKey, fallback, options);
      }

      return storage.getRaw(finalKey, fallback);
    }
  } catch {}

  return safeStorageGet(storage, finalKey, fallback, options);
}

function safeStorageSet(storage, key, value, options = undefined) {
  const finalKey = localSafeText(key, "");

  if (!finalKey) {
    return false;
  }

  try {
    if (options !== undefined) {
      storage?.set?.(finalKey, value, options);
    } else {
      storage?.set?.(finalKey, value);
    }

    return true;
  } catch {}

  return false;
}

function safeStorageSetRaw(storage, key, value, options = undefined) {
  const finalKey = localSafeText(key, "");

  if (!finalKey) {
    return false;
  }

  try {
    if (isFunction(storage?.setRaw)) {
      if (options !== undefined) {
        storage.setRaw(finalKey, value, options);
      } else {
        storage.setRaw(finalKey, value);
      }

      return true;
    }
  } catch {}

  return safeStorageSet(storage, finalKey, value, options);
}

function safeStorageRemove(storage, key, options = undefined) {
  const finalKey = localSafeText(key, "");

  if (!finalKey) {
    return false;
  }

  try {
    if (isFunction(storage?.remove)) {
      if (options !== undefined) {
        storage.remove(finalKey, options);
      } else {
        storage.remove(finalKey);
      }

      return true;
    }

    if (isFunction(storage?.delete)) {
      storage.delete(finalKey);
      return true;
    }

    if (isFunction(storage?.del)) {
      storage.del(finalKey);
      return true;
    }
  } catch {}

  return false;
}

function safeRedact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return localSafeText(value, "");
  }
}

function stripBearerPrefix(token = "") {
  return localSafeText(token, "").replace(/^Bearer\s+/i, "").trim();
}

function safeHasValidToken(token = null) {
  try {
    return Boolean(hasValidToken(token));
  } catch {
    return Boolean(localSafeText(token, ""));
  }
}

function normalizeTokenValue(token = null) {
  const clean = stripBearerPrefix(token);
  return safeHasValidToken(clean) ? clean : null;
}

function safeNormalizeUser(user = null) {
  if (!user) {
    return null;
  }

  try {
    return normalizeUser(user);
  } catch {
    return isPlainObject(user) ? user : null;
  }
}

function safeIsUsableUser(user = null) {
  try {
    if (typeof isUsableUser === "function") {
      return Boolean(isUsableUser(user));
    }
  } catch {}

  return hasUsableUser(user);
}

function safeGetUserUsername(user = null) {
  try {
    return getUserUsername(user) || null;
  } catch {
    return null;
  }
}

function safeGetUserDisplayName(user = null) {
  try {
    return getUserDisplayName(user) || null;
  } catch {
    return null;
  }
}

function safeGetUserAvatarUrl(user = null) {
  try {
    return getUserAvatarUrl(user) || null;
  } catch {
    return null;
  }
}

function safeSanitizeUsername(value = "") {
  try {
    return sanitizeUsername(value) || null;
  } catch {
    return null;
  }
}

/* =========================================================
   REDACTION / SNAPSHOT SAFETY
========================================================= */

function sanitizeForEvent(value, depth = 0, keyHint = "") {
  if (SENSITIVE_KEY_RE.test(localSafeText(keyHint, ""))) {
    return value ? "***" : null;
  }

  if (depth > 4) {
    return "[depth-limit]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return safeRedact(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "function") {
    return "[function]";
  }

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: safeRedact(value.message || "Error"),
      stack: value.stack ? "[stack]" : null,
      code: value.code || null,
      status: value.status || value.statusCode || null,
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 80)
      .map((item) => sanitizeForEvent(item, depth + 1, keyHint));
  }

  if (isPlainObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      output[key] = SENSITIVE_KEY_RE.test(key)
        ? item ? "***" : null
        : sanitizeForEvent(item, depth + 1, key);
    }

    return output;
  }

  try {
    return safeRedact(String(value));
  } catch {
    return "[unserializable]";
  }
}

function safeCloneError(cloneErrorFn, error = null) {
  try {
    if (isFunction(cloneErrorFn)) {
      return cloneErrorFn(error);
    }
  } catch {}

  try {
    return helperCloneError(error);
  } catch {}

  if (!error) {
    return null;
  }

  return sanitizeForEvent(error);
}

function createUserSnapshot(user = null) {
  if (!user || !isObject(user)) {
    return null;
  }

  const normalized = safeNormalizeUser(user);

  const snapshot = {
    id: normalized?.id || normalized?.userId || null,
    userId: normalized?.userId || normalized?.id || null,
    username: normalized?.username || null,
    slug: normalized?.slug || null,
    email: normalized?.email || null,
    name: normalized?.name || null,
    displayName: normalized?.displayName || normalized?.name || null,
    role: normalized?.role || normalized?.rol || null,
    roles: localSafeArray(normalized?.roles),
    avatar: normalized?.avatar ? safeRedact(normalized.avatar) : null,
    avatarUrl: normalized?.avatarUrl ? safeRedact(normalized.avatarUrl) : null,
    hasAvatar: Boolean(normalized?.hasAvatar),
    avatarUpdatedAt: normalized?.avatarUpdatedAt || null,
    active: normalized?.active !== false,
  };

  return sanitizeForEvent(snapshot);
}

/* =========================================================
   PATH HELPERS
========================================================= */

function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
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

  for (const segment of value.split("/").filter(Boolean)) {
    if (segment === ".") {
      continue;
    }

    if (segment === "..") {
      normalizedSegments.pop();
      continue;
    }

    normalizedSegments.push(segment);
  }

  value = `/${normalizedSegments.join("/")}`;

  if (!value) {
    value = DEFAULT_ROUTE;
  }

  if (value.length > 1 && value.endsWith("/")) {
    value = value.replace(/\/+$/g, "") || DEFAULT_ROUTE;
  }

  return value;
}

function normalizeSearch(search = "") {
  const raw = localSafeText(search, "");

  if (!raw) {
    return "";
  }

  return raw.startsWith("?") ? raw : `?${raw.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const raw = localSafeText(hash, "");

  if (!raw) {
    return "";
  }

  return raw.startsWith("#") ? raw : `#${raw.replace(/^#+/, "")}`;
}

function isHashRouterPath(value = "") {
  const raw = localSafeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = localSafeText(value, "");

  if (!raw) {
    return DEFAULT_ROUTE;
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  }

  return raw.replace(/^#\/?/, "/") || DEFAULT_ROUTE;
}

function splitFullPath(value = DEFAULT_ROUTE) {
  const raw = localSafeText(value, DEFAULT_ROUTE) || DEFAULT_ROUTE;

  if (isHashRouterPath(raw)) {
    return splitFullPath(normalizeHashRouterPath(raw));
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
    pathname: normalizePathnameOnly(pathname),
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
  };
}

function getBaseOrigin() {
  if (isBrowser() && window.location?.origin) {
    return window.location.origin;
  }

  return "http://localhost";
}

function normalizePublicPathLocal(value = DEFAULT_ROUTE) {
  const raw = localSafeText(value, DEFAULT_ROUTE) || DEFAULT_ROUTE;

  if (isHashRouterPath(raw)) {
    return normalizePublicPathLocal(normalizeHashRouterPath(raw));
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed = new URL(raw, getBaseOrigin());

      if (parsed.hash && isHashRouterPath(parsed.hash)) {
        return normalizePublicPathLocal(normalizeHashRouterPath(parsed.hash));
      }

      return normalizePublicPathLocal(
        `${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {}

  try {
    return normalizePath(raw);
  } catch {}

  const { pathname, search, hash } = splitFullPath(raw);
  return `${pathname}${search}${hash}`;
}

function stripPublicUsernamePrefix(path = DEFAULT_ROUTE) {
  const parts = splitFullPath(normalizePublicPathLocal(path));
  const segments = parts.pathname.split("/").filter(Boolean);

  if (segments.length > 0 && /^@[A-Za-z0-9._-]{1,80}$/.test(segments[0])) {
    const rest = segments.slice(1).join("/");
    const cleanPathname = rest ? normalizePathnameOnly(`/${rest}`) : DEFAULT_ROUTE;

    return `${cleanPathname}${parts.search}${parts.hash}`;
  }

  return `${parts.pathname}${parts.search}${parts.hash}`;
}

function stripSearchAndHash(path = DEFAULT_ROUTE) {
  const parts = splitFullPath(path);
  return normalizePathnameOnly(parts.pathname || DEFAULT_ROUTE);
}

function collapseTechnicalCanonicalPath(pathname = DEFAULT_ROUTE) {
  const clean = normalizePathnameOnly(pathname);

  if (clean === ACTIVATION_PATH || clean.startsWith(`${ACTIVATION_PATH}/`)) {
    return ACTIVATION_PATH;
  }

  if (clean === RESET_CONFIRM_PATH || clean.startsWith(`${RESET_CONFIRM_PATH}/`)) {
    return RESET_CONFIRM_PATH;
  }

  return clean;
}

function safeCanonicalPath(value = DEFAULT_ROUTE, fallback = DEFAULT_ROUTE) {
  const source = value || fallback || DEFAULT_ROUTE;

  try {
    const noUsername = stripPublicUsernamePrefix(source);
    const delegated = normalizeCanonicalPath(noUsername || DEFAULT_ROUTE);

    return collapseTechnicalCanonicalPath(
      stripSearchAndHash(delegated || noUsername || DEFAULT_ROUTE)
    );
  } catch {}

  return collapseTechnicalCanonicalPath(
    stripSearchAndHash(stripPublicUsernamePrefix(source))
  );
}

function safePublicPath(value = DEFAULT_ROUTE, fallback = DEFAULT_ROUTE) {
  const source = value || fallback || DEFAULT_ROUTE;
  return normalizePublicPathLocal(source);
}

function extractUsernameFromPublicPath(publicPath = DEFAULT_ROUTE) {
  const clean = normalizePublicPathLocal(publicPath);
  const match = clean.match(/^\/@([^/]+)(?:\/|$)/i);

  return safeSanitizeUsername(match?.[1] || "");
}

/* =========================================================
   AUTH DERIVED STATE
========================================================= */

function normalizeRoleKey(value = "") {
  return localSafeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "")
    .trim();
}

function resolveRole(user = null) {
  const role = normalizeRoleKey(
    user?.role ||
      user?.rol ||
      user?.type ||
      user?.userType ||
      user?.user_type ||
      user?.profile?.role ||
      user?.profile?.rol ||
      user?.raw?.role ||
      user?.raw?.rol ||
      ""
  );

  if (!role) {
    return null;
  }

  const aliases = config?.auth?.roles || {};

  for (const [alias, target] of Object.entries(aliases)) {
    if (normalizeRoleKey(alias) === role) {
      return normalizeRoleKey(target || role) || role;
    }
  }

  return role;
}

function resolveRoles(user = null) {
  const result = [];

  const pushRole = (value) => {
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(pushRole);
      return;
    }

    if (isPlainObject(value)) {
      for (const [key, enabled] of Object.entries(value)) {
        if (localSafeBool(enabled, false)) {
          pushRole(key);
        }
      }

      return;
    }

    if (typeof value === "string") {
      value
        .split(/[,\s|]+/g)
        .map(normalizeRoleKey)
        .filter(Boolean)
        .forEach((item) => result.push(resolveRole({ role: item }) || item));
      return;
    }

    const role = resolveRole({ role: value });

    if (role) {
      result.push(role);
    }
  };

  pushRole(user?.roles);
  pushRole(user?.roleList);
  pushRole(user?.role_list);
  pushRole(resolveRole(user));

  return Array.from(new Set(result.filter(Boolean)));
}

function roleFlags(roles = []) {
  const set = new Set(localSafeArray(roles));

  return {
    isAdmin: set.has("admin"),
    isSupport: set.has("support") || set.has("agent"),
    isManager: set.has("manager"),
    isClient: set.has("client"),
  };
}

function hasUsableUser(user = null) {
  const normalized = safeNormalizeUser(user);

  if (!normalized || !isObject(normalized)) {
    return false;
  }

  if (
    normalized.active === false ||
    normalized.disabled === true ||
    normalized.isDisabled === true ||
    normalized.deleted === true ||
    normalized.isDeleted === true ||
    normalized.blocked === true ||
    normalized.isBlocked === true
  ) {
    return false;
  }

  const status = localSafeLower(
    normalized.status ||
      normalized.estado ||
      normalized.state ||
      normalized.accountStatus ||
      "",
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
      "revoked",
      "desactivado",
      "inactivo",
      "bloqueado",
      "eliminado",
      "suspendido",
    ].includes(status)
  ) {
    return false;
  }

  return USER_ID_KEYS.some((key) => Boolean(localSafeText(normalized?.[key], "")));
}

function computeAuthSafe(user = null, token = null) {
  const normalizedUser = safeNormalizeUser(user);
  const validToken = safeHasValidToken(token);
  const usableUser = safeIsUsableUser(normalizedUser) || hasUsableUser(normalizedUser);

  if (!validToken || !usableUser) {
    return false;
  }

  try {
    return Boolean(computeAuthenticated(normalizedUser, token));
  } catch {}

  return true;
}

function resolveResolvedUsername({
  state = {},
  user = null,
  publicPath = "",
  authenticated = false,
} = {}) {
  if (!authenticated) {
    return null;
  }

  const fromPath = extractUsernameFromPublicPath(
    publicPath || state?.publicPath || DEFAULT_ROUTE
  );

  const fromUser = safeSanitizeUsername(
    safeGetUserUsername(user) ||
      user?.username ||
      user?.userName ||
      user?.nick ||
      user?.alias ||
      user?.login ||
      user?.slug ||
      user?.email ||
      ""
  );

  const fromPrevious = safeSanitizeUsername(
    state?.currentResolvedUsername ||
      state?.resolvedUsername ||
      ""
  );

  return fromPath || fromUser || fromPrevious || null;
}

function clearAuthPatch() {
  return {
    authenticated: false,
    hasToken: false,

    user: null,
    currentUser: null,
    authUser: null,
    sessionUser: null,

    token: null,
    accessToken: null,
    access_token: null,

    role: null,
    rol: null,
    userRole: null,
    roles: [],

    username: null,

    isAdmin: false,
    isSupport: false,
    isManager: false,
    isClient: false,

    currentResolvedUsername: null,
    resolvedUsername: null,
  };
}

function buildAuthPatch(state, options = {}) {
  const root = localSafeObject(state);
  const opts = localSafeObject(options);

  const normalizedToken = normalizeTokenValue(root.token);
  const normalizedUser = root.user ? safeNormalizeUser(root.user) : null;

  const forceUnauthenticated = opts.forceUnauthenticated === true;

  const authenticated = forceUnauthenticated
    ? false
    : computeAuthSafe(normalizedUser, normalizedToken);

  if (!authenticated) {
    return clearAuthPatch();
  }

  const role = resolveRole(normalizedUser);
  const roles = resolveRoles(normalizedUser);
  const finalRoles = roles.length ? roles : role ? [role] : [];
  const flags = roleFlags(finalRoles);

  const currentResolvedUsername = resolveResolvedUsername({
    state: root,
    user: normalizedUser,
    publicPath: root.publicPath,
    authenticated,
  });

  return {
    authenticated: true,
    hasToken: true,

    user: normalizedUser,
    currentUser: normalizedUser,
    authUser: normalizedUser,
    sessionUser: normalizedUser,

    token: normalizedToken,
    accessToken: normalizedToken,
    access_token: normalizedToken,

    role,
    rol: role,
    userRole: role,
    roles: finalRoles,

    username: safeGetUserUsername(normalizedUser),

    ...flags,

    currentResolvedUsername,
    resolvedUsername: currentResolvedUsername,
  };
}

function syncAuthState(state, options = {}) {
  if (!state || !isObject(state)) {
    return state;
  }

  const patch = buildAuthPatch(state, options);
  Object.assign(state, patch);

  return state;
}

function emitAuthChangeIfNeeded(events, previousSnapshot, state, cause = "unknown") {
  const previousAuth = Boolean(previousSnapshot?.authenticated);
  const nextAuth = Boolean(state?.authenticated);

  const previousHasToken = Boolean(previousSnapshot?.hasToken);
  const nextHasToken = Boolean(state?.hasToken);

  const previousUsername = previousSnapshot?.username || null;
  const nextUsername = state?.username || null;

  const previousResolved = previousSnapshot?.currentResolvedUsername || null;
  const nextResolved = state?.currentResolvedUsername || null;

  if (
    previousAuth === nextAuth &&
    previousHasToken === nextHasToken &&
    previousUsername === nextUsername &&
    previousResolved === nextResolved
  ) {
    return false;
  }

  return safeEmit(events, SESSION_EVENTS.authChange, {
    authenticated: nextAuth,
    hasToken: nextHasToken,
    role: state?.role || null,
    username: nextUsername,
    currentResolvedUsername: nextResolved,
    cause,
    changedAt: safeNowIso(),
  });
}

/* =========================================================
   DOM HELPERS
========================================================= */

function setAriaExpanded(el, value) {
  if (!el) {
    return false;
  }

  try {
    el.setAttribute("aria-expanded", String(Boolean(value)));
    return true;
  } catch {}

  return false;
}

function toggleClass(el, className, force) {
  if (!el || !className) {
    return false;
  }

  try {
    el.classList.toggle(className, Boolean(force));
    return true;
  } catch {}

  return false;
}

function addClass(el, className) {
  if (!el || !className) {
    return false;
  }

  try {
    el.classList.add(className);
    return true;
  } catch {
    return false;
  }
}

function removeClass(el, className) {
  if (!el || !className) {
    return false;
  }

  try {
    el.classList.remove(className);
    return true;
  } catch {
    return false;
  }
}

function setAttribute(el, name, value) {
  if (!el || !name) {
    return false;
  }

  try {
    if (value === null || value === undefined || value === "") {
      el.removeAttribute(name);
    } else {
      el.setAttribute(name, String(value));
    }

    return true;
  } catch {}

  return false;
}

function setDataset(el, key, value) {
  if (!el || !key) {
    return false;
  }

  try {
    if (value === null || value === undefined || value === "") {
      delete el.dataset[key];
    } else {
      el.dataset[key] = String(value);
    }

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   THEME / LANG
========================================================= */

function normalizeTheme(theme = config.defaultTheme) {
  const value = localSafeLower(theme, config.defaultTheme || DEFAULT_THEME);
  return VALID_THEMES.includes(value) ? value : DEFAULT_THEME;
}

function normalizeThemeMode(mode = DEFAULT_THEME_MODE) {
  const value = localSafeLower(mode, DEFAULT_THEME_MODE);

  if (
    [
      "auto",
      "automatic",
      "browser",
      "os",
      "device",
      "system-preference",
      "system_preference",
    ].includes(value)
  ) {
    return "system";
  }

  return VALID_THEME_MODES.includes(value) ? value : DEFAULT_THEME_MODE;
}

function normalizeLang(lang = config.defaultLang) {
  const value = localSafeLower(lang, config.defaultLang || DEFAULT_LANG).replace(/_/g, "-");
  return VALID_LANG_RE.test(value) ? value : config.defaultLang || DEFAULT_LANG;
}

function getBootThemeSnapshot() {
  if (!isBrowser()) {
    return {};
  }

  try {
    return window.__ONION_BOOT_THEME__ || {};
  } catch {
    return {};
  }
}

function resolveSystemTheme() {
  if (!isBrowser()) {
    return DEFAULT_THEME;
  }

  try {
    if (isFunction(window.matchMedia) && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
  } catch {}

  return "light";
}

function resolveThemeFromMode(mode = DEFAULT_THEME_MODE) {
  const finalMode = normalizeThemeMode(mode);

  if (finalMode === "dark") {
    return "dark";
  }

  if (finalMode === "light") {
    return "light";
  }

  return resolveSystemTheme();
}

function resolveThemeFromUser(user = null) {
  if (!user || !isObject(user)) {
    return null;
  }

  const explicitTheme = localSafeLower(
    user.theme ??
      user?.preferences?.theme ??
      user?.settings?.theme ??
      user?.raw?.theme ??
      user?.raw?.preferences?.theme ??
      user?.raw?.settings?.theme ??
      "",
    ""
  );

  if (VALID_THEMES.includes(explicitTheme)) {
    return explicitTheme;
  }

  const explicitMode = normalizeThemeMode(
    user.themeMode ??
      user.theme_mode ??
      user.appearance ??
      user?.preferences?.themeMode ??
      user?.preferences?.theme_mode ??
      user?.preferences?.appearance ??
      user?.settings?.themeMode ??
      user?.settings?.theme_mode ??
      user?.settings?.appearance ??
      user?.raw?.themeMode ??
      user?.raw?.theme_mode ??
      user?.raw?.appearance ??
      ""
  );

  if (explicitMode) {
    return resolveThemeFromMode(explicitMode);
  }

  return null;
}

function resolveStoredTheme(storage) {
  const bootTheme = getBootThemeSnapshot();

  const bootMode = normalizeThemeMode(bootTheme?.mode || "");
  const bootResolvedTheme = VALID_THEMES.includes(bootTheme?.theme) ? bootTheme.theme : "";

  const storedThemeModeRaw =
    safeStorageGet(storage, getStorageKey("themeMode"), "") ||
    safeStorageGet(storage, getStorageKey("appearance"), "");

  const storedThemeMode = storedThemeModeRaw
    ? normalizeThemeMode(storedThemeModeRaw)
    : "";

  const storedThemeRaw = safeStorageGet(
    storage,
    getStorageKey("theme"),
    bootResolvedTheme || config.defaultTheme || DEFAULT_THEME
  );

  const storedTheme = normalizeTheme(storedThemeRaw);

  const finalMode =
    storedThemeMode ||
    bootMode ||
    normalizeThemeMode(config?.defaultThemeMode || config?.appearance || "") ||
    DEFAULT_THEME_MODE;

  const finalTheme = storedThemeMode
    ? resolveThemeFromMode(storedThemeMode)
    : bootResolvedTheme ||
      storedTheme ||
      resolveThemeFromMode(finalMode);

  return {
    theme: normalizeTheme(finalTheme),
    themeMode: normalizeThemeMode(finalMode),
  };
}

export function syncThemeMetaColor({
  dom,
  theme = config.defaultTheme,
} = {}) {
  const finalTheme = normalizeTheme(theme);
  const color = getThemeColor(finalTheme);

  const candidates = [
    dom?.themeColorMeta,
    dom?.metaThemeColor,
    isBrowser() ? document.querySelector?.("meta[name='theme-color']") : null,
  ].filter(Boolean);

  let synced = false;

  for (const meta of candidates) {
    try {
      meta.setAttribute("content", color);
      synced = true;
    } catch {}
  }

  return synced;
}

function applyThemeDom({
  dom,
  theme,
  themeMode = "",
} = {}) {
  const finalTheme = normalizeTheme(theme);
  const finalMode = themeMode ? normalizeThemeMode(themeMode) : finalTheme;

  setAttribute(dom?.html, "data-theme", finalTheme);
  setAttribute(dom?.html, "data-theme-mode", finalMode);
  setAttribute(dom?.body, "data-theme", finalTheme);
  setAttribute(dom?.body, "data-theme-mode", finalMode);

  removeClass(dom?.html, "theme-dark");
  removeClass(dom?.html, "theme-light");
  removeClass(dom?.body, "theme-dark");
  removeClass(dom?.body, "theme-light");

  addClass(dom?.html, `theme-${finalTheme}`);
  addClass(dom?.body, `theme-${finalTheme}`);

  syncThemeMetaColor({
    dom,
    theme: finalTheme,
  });

  return finalTheme;
}

/* =========================================================
   SNAPSHOTS
========================================================= */

function createAuthSnapshot(state) {
  return {
    authenticated: Boolean(state?.authenticated),
    hasToken: Boolean(state?.hasToken),
    role: state?.role || null,
    username: state?.username || safeGetUserUsername(state?.user) || null,
    currentResolvedUsername: state?.currentResolvedUsername || null,
  };
}

function createSessionSnapshot(state, cause = "unknown") {
  const publicPath = safePublicPath(
    state?.publicPath ||
      state?.route ||
      DEFAULT_ROUTE
  );

  return {
    version: SESSION_VERSION,

    authenticated: Boolean(state?.authenticated),
    hasToken: Boolean(state?.hasToken),

    token: null,
    accessToken: null,
    refreshToken: null,
    tempToken: null,

    user: createUserSnapshot(state?.user || null),

    role: state?.role || null,
    roles: localSafeArray(state?.roles),

    username: state?.username || safeGetUserUsername(state?.user) || null,
    displayName: safeGetUserDisplayName(state?.user),
    avatarUrl: safeRedact(safeGetUserAvatarUrl(state?.user) || ""),

    currentResolvedUsername: state?.currentResolvedUsername || null,
    resolvedUsername: state?.resolvedUsername || null,

    route: safeCanonicalPath(state?.route || DEFAULT_ROUTE),
    publicPath: safeRedact(publicPath),

    theme: state?.theme || config.defaultTheme || DEFAULT_THEME,
    themeMode: state?.themeMode || null,
    lang: state?.lang || config.defaultLang || DEFAULT_LANG,

    cause,
    changedAt: safeNowIso(),
  };
}

function userFingerprint(user = null) {
  if (!user) {
    return "";
  }

  const normalized = safeNormalizeUser(user);

  try {
    return JSON.stringify({
      id: normalized?.id || normalized?.userId || null,
      username: normalized?.username || null,
      email: normalized?.email || null,
      role: normalized?.role || normalized?.rol || null,
      roles: localSafeArray(normalized?.roles),
      avatar: normalized?.avatar || normalized?.avatarUrl || null,
      avatarUpdatedAt: normalized?.avatarUpdatedAt || null,
      active: normalized?.active ?? null,
    });
  } catch {
    return String(user);
  }
}

function tokenFingerprint(token = null) {
  const clean = normalizeTokenValue(token);

  if (!clean) {
    return "";
  }

  return `${clean.length}:${clean.slice(0, 8)}:${clean.slice(-8)}`;
}

/* =========================================================
   ROUTE
========================================================= */

function syncRouteFields({
  state,
  setState,
  route,
  publicPath,
} = {}) {
  if (!state) {
    return {
      route: DEFAULT_ROUTE,
      publicPath: DEFAULT_ROUTE,
      currentResolvedUsername: null,
    };
  }

  const nextPublicPath = safePublicPath(
    publicPath ||
      state?.publicPath ||
      route ||
      state?.route ||
      DEFAULT_ROUTE,
    state?.publicPath ||
      state?.route ||
      DEFAULT_ROUTE
  );

  const nextCanonical = safeCanonicalPath(
    route ||
      nextPublicPath ||
      state?.route ||
      DEFAULT_ROUTE,
    DEFAULT_ROUTE
  );

  const nextStatePreview = {
    ...state,
    route: nextCanonical,
    canonicalPath: nextCanonical,
    publicPath: nextPublicPath,
  };

  const authPatch = buildAuthPatch(nextStatePreview);

  const patch = {
    route: nextCanonical,
    canonicalPath: nextCanonical,
    publicPath: nextPublicPath,
    currentResolvedUsername: authPatch.currentResolvedUsername,
    resolvedUsername: authPatch.resolvedUsername,
  };

  commitState({
    state,
    setState,
    patch,
    options: {
      source: "core-session:syncRouteFields",
    },
  });

  return {
    route: nextCanonical,
    publicPath: nextPublicPath,
    currentResolvedUsername: authPatch.currentResolvedUsername,
  };
}

export function setRoute({
  state,
  setState,
  events,
  route = DEFAULT_ROUTE,
  options = {},
} = {}) {
  const previousRoute = safeCanonicalPath(state?.route || DEFAULT_ROUTE);
  const normalized = safeCanonicalPath(route || DEFAULT_ROUTE);

  if (previousRoute === normalized) {
    return normalized;
  }

  const preview = {
    ...localSafeObject(state),
    route: normalized,
    canonicalPath: normalized,
  };

  const authPatch = buildAuthPatch(preview);

  const patch = {
    lastRoute: previousRoute,
    route: normalized,
    canonicalPath: normalized,
    currentResolvedUsername: authPatch.currentResolvedUsername,
    resolvedUsername: authPatch.resolvedUsername,
  };

  commitState({
    state,
    setState,
    patch,
    options: {
      ...localSafeObject(options),
      source: options?.source || "core-session:setRoute",
    },
  });

  safeEmit(events, SESSION_EVENTS.routeChange, {
    route: normalized,
    canonicalPath: normalized,
    previousRoute,
    publicPath: safeRedact(state?.publicPath || normalized),
    changedAt: safeNowIso(),
  });

  return normalized;
}

export function setPublicPath({
  state,
  storage,
  setState,
  events,
  path = DEFAULT_ROUTE,
  options = {},
} = {}) {
  const previousPublicPath = safePublicPath(state?.publicPath || DEFAULT_ROUTE);
  const normalized = safePublicPath(path || DEFAULT_ROUTE);

  if (previousPublicPath === normalized) {
    return normalized;
  }

  const nextCanonical = safeCanonicalPath(normalized, state?.route || DEFAULT_ROUTE);

  const preview = {
    ...localSafeObject(state),
    publicPath: normalized,
    route: nextCanonical,
    canonicalPath: nextCanonical,
  };

  const authPatch = buildAuthPatch(preview);

  const patch = {
    lastPublicPath: previousPublicPath,
    publicPath: normalized,
    route: nextCanonical,
    canonicalPath: nextCanonical,
    currentResolvedUsername: authPatch.currentResolvedUsername,
    resolvedUsername: authPatch.resolvedUsername,
  };

  commitState({
    state,
    setState,
    patch,
    options: {
      ...localSafeObject(options),
      source: options?.source || "core-session:setPublicPath",
    },
  });

  safeStorageSet(storage, getStorageKey("lastPublicPath"), normalized);

  safeEmit(events, SESSION_EVENTS.publicPathChange, {
    publicPath: safeRedact(normalized),
    previousPublicPath: safeRedact(previousPublicPath),
    route: nextCanonical,
    canonicalPath: nextCanonical,
    changedAt: safeNowIso(),
  });

  return normalized;
}

/* =========================================================
   USER / TOKEN
========================================================= */

function persistStrictAuthStorage({
  storage,
  token,
  user,
  authenticated,
  tokenWasProvided = true,
  userWasProvided = true,
} = {}) {
  if (authenticated) {
    if (tokenWasProvided && token) {
      safeStorageSetRaw(storage, getStorageKey("token"), token);
      safeStorageSetRaw(storage, getStorageKey("accessToken"), token);
    }

    if (userWasProvided && user) {
      safeStorageSet(storage, getStorageKey("user"), user);
    }

    return;
  }

  if (tokenWasProvided) {
    for (const keyName of TOKEN_STORAGE_KEYS) {
      safeStorageRemove(storage, getStorageKey(keyName), { all: true });
    }
  }

  if (userWasProvided) {
    for (const keyName of ["user", "currentUser", "authUser", "sessionUser"]) {
      safeStorageRemove(storage, getStorageKey(keyName), { all: true });
    }
  }
}

export function setUser({
  state,
  storage,
  events,
  setState,
  syncUserUI,
  user = null,
  options = {},
} = {}) {
  const normalizedUser = user ? safeNormalizeUser(user) : null;

  const previousAuth = createAuthSnapshot(state);
  const previousUserFingerprint = userFingerprint(state?.user);
  const nextUserFingerprint = userFingerprint(normalizedUser);

  const preview = {
    ...localSafeObject(state),
    user: normalizedUser,
  };

  const authPatch = buildAuthPatch(preview, {
    forceUnauthenticated: !normalizeTokenValue(preview.token) || !hasUsableUser(normalizedUser),
  });

  const patch = {
    ...authPatch,
  };

  if (previousUserFingerprint !== nextUserFingerprint || previousAuth.authenticated !== authPatch.authenticated) {
    commitState({
      state,
      setState,
      patch,
      options: {
        ...localSafeObject(options),
        source: options?.source || "core-session:setUser",
        forceUnauthenticated: !authPatch.authenticated,
      },
    });
  } else if (state) {
    Object.assign(state, patch);
  }

  persistStrictAuthStorage({
    storage,
    token: authPatch.token,
    user: authPatch.user,
    authenticated: authPatch.authenticated,
    tokenWasProvided: false,
    userWasProvided: true,
  });

  try {
    syncUserUI?.();
  } catch {}

  emitAuthChangeIfNeeded(events, previousAuth, state, "setUser");

  safeEmit(events, SESSION_EVENTS.userChange, {
    user: createUserSnapshot(state?.user),
    authenticated: Boolean(state?.authenticated),
    hasToken: Boolean(state?.hasToken),
    role: state?.role || null,
    username: state?.username || safeGetUserUsername(state?.user),
    displayName: safeGetUserDisplayName(state?.user),
    currentResolvedUsername: state?.currentResolvedUsername || null,
    avatarUrl: safeRedact(safeGetUserAvatarUrl(state?.user) || ""),
    changedAt: safeNowIso(),
  });

  safeEmit(events, SESSION_EVENTS.sessionState, createSessionSnapshot(state, "setUser"));

  return state?.user || null;
}

export function setToken({
  state,
  storage,
  events,
  setState,
  token = null,
  options = {},
} = {}) {
  const normalized = normalizeTokenValue(token);

  const previousAuth = createAuthSnapshot(state);
  const previousTokenFingerprint = tokenFingerprint(state?.token);
  const nextTokenFingerprint = tokenFingerprint(normalized);

  const preview = {
    ...localSafeObject(state),
    token: normalized,
    accessToken: normalized,
    access_token: normalized,
  };

  const authPatch = buildAuthPatch(preview, {
    forceUnauthenticated: !normalized || !hasUsableUser(preview.user),
  });

  const patch = {
    ...authPatch,
  };

  if (previousTokenFingerprint !== nextTokenFingerprint || previousAuth.authenticated !== authPatch.authenticated) {
    commitState({
      state,
      setState,
      patch,
      options: {
        ...localSafeObject(options),
        source: options?.source || "core-session:setToken",
        forceUnauthenticated: !authPatch.authenticated,
      },
    });
  } else if (state) {
    Object.assign(state, patch);
  }

  persistStrictAuthStorage({
    storage,
    token: authPatch.token,
    user: authPatch.user,
    authenticated: authPatch.authenticated,
    tokenWasProvided: true,
    userWasProvided: false,
  });

  emitAuthChangeIfNeeded(events, previousAuth, state, "setToken");

  safeEmit(events, SESSION_EVENTS.tokenChange, {
    token: null,
    hasToken: Boolean(state?.hasToken),
    authenticated: Boolean(state?.authenticated),
    role: state?.role || null,
    username: state?.username || null,
    currentResolvedUsername: state?.currentResolvedUsername || null,
    changedAt: safeNowIso(),
  });

  safeEmit(events, SESSION_EVENTS.sessionState, createSessionSnapshot(state, "setToken"));

  return state?.token || null;
}

/* =========================================================
   AUX SESSION STORAGE
========================================================= */

function persistAuxSessionValue(storage, keyName, value, { removeWhenEmpty = true } = {}) {
  const key = getStorageKey(keyName);

  if (value === undefined) {
    return false;
  }

  if (value === null || value === "") {
    if (!removeWhenEmpty) {
      return false;
    }

    return safeStorageRemove(storage, key, { all: true });
  }

  if (keyName.toLowerCase().includes("token")) {
    return safeStorageSetRaw(storage, key, String(value));
  }

  return safeStorageSet(storage, key, value);
}

function clearAuxTokens(storage) {
  for (const keyName of AUX_TOKEN_STORAGE_KEYS) {
    safeStorageRemove(storage, getStorageKey(keyName), { all: true });
  }
}

/* =========================================================
   APPLY SESSION
========================================================= */

function resolveApplySessionArgs(input = {}) {
  const data = localSafeObject(input);

  const token =
    data.token ??
    data.accessToken ??
    data.access_token ??
    data.authToken ??
    data.auth_token ??
    data.jwt ??
    undefined;

  const user =
    data.user ??
    data.usuario ??
    data.me ??
    data.account ??
    data.profile ??
    data.currentUser ??
    data.authUser ??
    data.sessionUser ??
    data.data?.user ??
    data.payload?.user ??
    undefined;

  const refreshToken =
    data.refreshToken ??
    data.refresh_token ??
    undefined;

  const tempToken =
    data.tempToken ??
    data.temp_token ??
    data.temporaryToken ??
    data.temporary_token ??
    data.twoFactorToken ??
    data.two_factor_token ??
    data.mfaToken ??
    data.mfa_token ??
    undefined;

  const session =
    data.sessionData ||
    data.session ||
    data.authSession ||
    data.auth_session ||
    {};

  const sessionId =
    data.sessionId ??
    data.session_id ??
    session.sessionId ??
    session.session_id ??
    session.id ??
    undefined;

  const sessionUserId =
    data.sessionUserId ??
    data.session_user_id ??
    session.sessionUserId ??
    session.session_user_id ??
    session.userId ??
    session.user_id ??
    undefined;

  return {
    token,
    user,
    refreshToken,
    tempToken,
    sessionId,
    sessionUserId,
    session,

    route: data.route,
    publicPath: data.publicPath,

    options: data.options || {},
  };
}

function callFlexibleSetter(fn, objectArg, directValue, key) {
  if (!isFunction(fn)) {
    return null;
  }

  try {
    return fn(objectArg);
  } catch {}

  try {
    return fn(directValue);
  } catch {}

  try {
    return fn({ [key]: directValue });
  } catch {}

  return null;
}

export function applySession(input = {}) {
  const {
    state,
    storage,
    events,
    setUser: injectedSetUser,
    setToken: injectedSetToken,
    setState,
  } = localSafeObject(input);

  const resolved = resolveApplySessionArgs(input);
  const opts = localSafeObject(input.options || resolved.options);

  const previousAuth = createAuthSnapshot(state);

  const tokenWasProvided = resolved.token !== undefined;
  const userWasProvided = resolved.user !== undefined;

  const nextToken = tokenWasProvided
    ? normalizeTokenValue(resolved.token)
    : normalizeTokenValue(state?.token);

  const nextUser = userWasProvided
    ? resolved.user
      ? safeNormalizeUser(resolved.user)
      : null
    : state?.user ?? null;

  const routeWasProvided = resolved.route !== undefined;
  const publicPathWasProvided = resolved.publicPath !== undefined;

  const nextPublicPath = publicPathWasProvided
    ? safePublicPath(
        resolved.publicPath,
        state?.publicPath || state?.route || DEFAULT_ROUTE
      )
    : state?.publicPath || DEFAULT_ROUTE;

  const nextRoute = routeWasProvided
    ? safeCanonicalPath(resolved.route, state?.route || DEFAULT_ROUTE)
    : safeCanonicalPath(nextPublicPath || state?.route || DEFAULT_ROUTE);

  const sessionPatch = {};

  if (resolved.session && isObject(resolved.session)) {
    sessionPatch.session = resolved.session;
    sessionPatch.sessionData = resolved.session;
  }

  if (resolved.sessionId !== undefined) {
    sessionPatch.sessionId = resolved.sessionId || null;
  }

  if (resolved.sessionUserId !== undefined) {
    sessionPatch.sessionUserId = resolved.sessionUserId || null;
  }

  const preview = {
    ...localSafeObject(state),
    ...sessionPatch,
    token: nextToken,
    accessToken: nextToken,
    access_token: nextToken,
    user: nextUser,
    route: nextRoute,
    canonicalPath: nextRoute,
    publicPath: nextPublicPath,
  };

  const authPatch = buildAuthPatch(preview, {
    forceUnauthenticated: !nextToken || !hasUsableUser(nextUser),
  });

  if (isFunction(setState) && state) {
    const basePatch = {
      ...sessionPatch,
      route: nextRoute,
      canonicalPath: nextRoute,
      publicPath: nextPublicPath,
      ...authPatch,
    };

    commitState({
      state,
      setState,
      patch: basePatch,
      options: {
        ...opts,
        source: opts.source || "core-session:applySession",
        forceUnauthenticated: !authPatch.authenticated,
      },
    });
  } else {
    if (tokenWasProvided) {
      callFlexibleSetter(
        injectedSetToken,
        { token: resolved.token },
        resolved.token,
        "token"
      );
    }

    if (userWasProvided) {
      callFlexibleSetter(
        injectedSetUser,
        { user: resolved.user },
        resolved.user,
        "user"
      );
    }

    if (routeWasProvided || publicPathWasProvided) {
      syncRouteFields({
        state,
        setState,
        route: nextRoute,
        publicPath: nextPublicPath,
      });
    }

    if (state) {
      Object.assign(state, sessionPatch, authPatch);
    }
  }

  persistStrictAuthStorage({
    storage,
    token: authPatch.token,
    user: authPatch.user,
    authenticated: authPatch.authenticated,
    tokenWasProvided,
    userWasProvided,
  });

  if (authPatch.authenticated) {
    persistAuxSessionValue(storage, "refreshToken", resolved.refreshToken);
    persistAuxSessionValue(storage, "tempToken", resolved.tempToken);
    persistAuxSessionValue(storage, "sessionId", resolved.sessionId);
    persistAuxSessionValue(storage, "sessionUserId", resolved.sessionUserId);
  } else {
    clearAuxTokens(storage);

    if (resolved.sessionId !== undefined) {
      safeStorageRemove(storage, getStorageKey("sessionId"), { all: true });
    }

    if (resolved.sessionUserId !== undefined) {
      safeStorageRemove(storage, getStorageKey("sessionUserId"), { all: true });
    }
  }

  if (state) {
    syncAuthState(state, {
      forceUnauthenticated: !authPatch.authenticated,
    });
  }

  emitAuthChangeIfNeeded(events, previousAuth, state, "applySession");

  const snapshot = createSessionSnapshot(state, "applySession");

  safeEmit(events, SESSION_EVENTS.sessionApplied, snapshot);
  safeEmit(events, SESSION_EVENTS.sessionState, snapshot);

  return snapshot;
}

/* =========================================================
   CLEAR SESSION
========================================================= */

export function clearSession({
  state,
  storage,
  events,
  setState,
  syncUserUI,
  utils,
  options = {},
} = {}) {
  const opts = localSafeObject(options);
  const previousAuth = createAuthSnapshot(state);

  for (const keyName of AUTH_STORAGE_KEYS) {
    safeStorageRemove(storage, getStorageKey(keyName), { all: true });
  }

  try {
    removeLegacySessionKeys(utils, events);
  } catch {}

  const patch = {
    ...clearAuthPatch(),
    refreshToken: null,
    refresh_token: null,
    tempToken: null,
    temp_token: null,
    session: null,
    sessionData: null,
    sessionId: null,
    sessionUserId: null,
  };

  commitState({
    state,
    setState,
    patch,
    options: {
      source: opts.source || "core-session:clearSession",
      forceUnauthenticated: true,
    },
  });

  try {
    syncUserUI?.();
  } catch {}

  emitAuthChangeIfNeeded(events, previousAuth, state, "clearSession");

  const payload = {
    authenticated: false,
    hasToken: false,
    token: null,
    user: null,
    role: null,
    username: null,
    currentResolvedUsername: null,
    silent: Boolean(opts.silent),
    reason: opts.reason || "clearSession",
    changedAt: safeNowIso(),
  };

  safeEmit(events, SESSION_EVENTS.sessionCleared, payload);
  safeEmit(events, SESSION_EVENTS.sessionState, createSessionSnapshot(state, "clearSession"));

  return true;
}

/* =========================================================
   PREFS LOAD
========================================================= */

function resolveStoredSidebarOpen(storage) {
  const collapsed = safeStorageGet(storage, getStorageKey("sidebarCollapsed"), null);

  if (collapsed !== null && collapsed !== undefined && collapsed !== "") {
    return !localSafeBool(collapsed, false);
  }

  const stored = safeStorageGet(storage, getStorageKey("sidebarOpen"), null);

  if (stored === null || stored === undefined || stored === "") {
    return true;
  }

  return localSafeBool(stored, true);
}

export function loadPreferences({
  state,
  storage,
  dom,
  events,
  setState,
} = {}) {
  const resolvedTheme = resolveStoredTheme(storage);

  const savedLang = safeStorageGet(
    storage,
    getStorageKey("lang"),
    config.defaultLang || DEFAULT_LANG
  );

  const theme = normalizeTheme(resolvedTheme.theme);
  const themeMode = normalizeThemeMode(resolvedTheme.themeMode);
  const lang = normalizeLang(savedLang);
  const sidebarOpen = resolveStoredSidebarOpen(storage);

  commitState({
    state,
    setState,
    patch: {
      theme,
      themeMode,
      lang,
      sidebarOpen,
    },
    options: {
      source: "core-session:loadPreferences",
    },
  });

  applyThemeDom({
    dom,
    theme,
    themeMode,
  });

  setAttribute(dom?.html, "lang", lang);

  toggleClass(dom?.body, "sidebar-open", sidebarOpen);
  toggleClass(dom?.body, "sidebar-collapsed", !sidebarOpen);

  toggleClass(dom?.sidebar, "open", sidebarOpen);
  toggleClass(dom?.sidebar, "collapsed", !sidebarOpen);
  toggleClass(dom?.sidebar, "is-open", sidebarOpen);
  toggleClass(dom?.sidebar, "is-collapsed", !sidebarOpen);

  setAriaExpanded(dom?.sidebarToggle, sidebarOpen);
  setAriaExpanded(dom?.sidebarMobileToggle, sidebarOpen);

  const payload = {
    theme,
    themeMode,
    lang,
    sidebarOpen,
    loadedAt: safeNowIso(),
  };

  safeEmit(events, SESSION_EVENTS.preferencesLoaded, payload);

  return payload;
}

/* =========================================================
   SESSION LOAD
========================================================= */

function readStoredToken(storage) {
  return (
    safeStorageGetRaw(storage, getStorageKey("token"), null) ||
    safeStorageGetRaw(storage, getStorageKey("accessToken"), null) ||
    safeStorageGetRaw(storage, getStorageKey("access_token"), null)
  );
}

function readStoredUser(storage) {
  return (
    safeStorageGet(storage, getStorageKey("user"), null) ||
    safeStorageGet(storage, getStorageKey("currentUser"), null) ||
    safeStorageGet(storage, getStorageKey("authUser"), null) ||
    safeStorageGet(storage, getStorageKey("sessionUser"), null)
  );
}

export function loadSession({
  state,
  storage,
  dom,
  events,
  setState,
} = {}) {
  const savedToken = normalizeTokenValue(readStoredToken(storage));
  const storedUser = savedToken ? safeNormalizeUser(readStoredUser(storage)) : null;
  const usableSavedUser = hasUsableUser(storedUser) ? storedUser : null;

  const sessionId = safeStorageGet(storage, getStorageKey("sessionId"), null);
  const sessionUserId = safeStorageGet(storage, getStorageKey("sessionUserId"), null);

  const preview = {
    ...localSafeObject(state),
    token: savedToken,
    accessToken: savedToken,
    access_token: savedToken,
    user: usableSavedUser,
    sessionId: sessionId || null,
    sessionUserId: sessionUserId || null,
  };

  const authPatch = buildAuthPatch(preview, {
    forceUnauthenticated: !savedToken || !usableSavedUser,
  });

  const patch = {
    sessionId: authPatch.authenticated ? sessionId || null : null,
    sessionUserId: authPatch.authenticated ? sessionUserId || null : null,
    ...authPatch,
  };

  commitState({
    state,
    setState,
    patch,
    options: {
      source: "core-session:loadSession",
      forceUnauthenticated: !authPatch.authenticated,
    },
  });

  if (!savedToken) {
    for (const keyName of ["user", "currentUser", "authUser", "sessionUser"]) {
      safeStorageRemove(storage, getStorageKey(keyName), { all: true });
    }
  }

  const userTheme = authPatch.authenticated
    ? resolveThemeFromUser(authPatch.user)
    : null;

  if (userTheme === "light" || userTheme === "dark") {
    commitState({
      state,
      setState,
      patch: {
        theme: userTheme,
        themeMode: state?.themeMode || userTheme,
      },
      options: {
        source: "core-session:loadSession:userTheme",
      },
    });

    safeStorageSet(storage, getStorageKey("theme"), userTheme);

    applyThemeDom({
      dom,
      theme: userTheme,
      themeMode: state?.themeMode || userTheme,
    });
  }

  const snapshot = createSessionSnapshot(state, "loadSession");

  safeEmit(events, SESSION_EVENTS.sessionLoaded, snapshot);
  safeEmit(events, SESSION_EVENTS.sessionState, snapshot);

  return state;
}

/* =========================================================
   UI SETTERS
========================================================= */

export function setTheme({
  dom,
  storage,
  events,
  setState,
  theme = config.defaultTheme,
  themeMode = "",
} = {}) {
  const normalizedMode = themeMode
    ? normalizeThemeMode(themeMode)
    : VALID_THEME_MODES.includes(theme)
      ? normalizeThemeMode(theme)
      : "";

  const normalizedTheme = normalizedMode
    ? resolveThemeFromMode(normalizedMode)
    : normalizeTheme(theme);

  const finalMode = normalizedMode || normalizedTheme;

  commitState({
    state: null,
    setState,
    patch: {
      theme: normalizedTheme,
      themeMode: finalMode,
    },
    options: {
      source: "core-session:setTheme",
    },
  });

  safeStorageSet(storage, getStorageKey("theme"), normalizedTheme);
  safeStorageSet(storage, getStorageKey("themeMode"), finalMode);
  safeStorageSet(storage, getStorageKey("appearance"), finalMode);

  applyThemeDom({
    dom,
    theme: normalizedTheme,
    themeMode: finalMode,
  });

  try {
    if (isBrowser() && window.__ONION_THEME__?.set && themeMode) {
      window.__ONION_THEME__.set(finalMode, {
        source: "core-session:setTheme",
        emit: false,
      });
    }
  } catch {}

  safeEmit(events, SESSION_EVENTS.themeChange, {
    theme: normalizedTheme,
    themeMode: finalMode,
    changedAt: safeNowIso(),
  });

  return normalizedTheme;
}

export function setLang({
  dom,
  storage,
  events,
  setState,
  lang = config.defaultLang,
} = {}) {
  const normalized = normalizeLang(lang);

  safeSetState(
    setState,
    { lang: normalized },
    { source: "core-session:setLang" }
  );

  safeStorageSet(storage, getStorageKey("lang"), normalized);

  setAttribute(dom?.html, "lang", normalized);

  safeEmit(events, SESSION_EVENTS.langChange, {
    lang: normalized,
    changedAt: safeNowIso(),
  });

  return normalized;
}

export function setSidebarOpen({
  dom,
  storage,
  events,
  setState,
  value,
} = {}) {
  const next = Boolean(value);

  safeSetState(
    setState,
    { sidebarOpen: next },
    { source: "core-session:setSidebarOpen" }
  );

  safeStorageSet(storage, getStorageKey("sidebarOpen"), next);
  safeStorageSet(storage, getStorageKey("sidebarCollapsed"), !next);

  toggleClass(dom?.body, "sidebar-open", next);
  toggleClass(dom?.body, "sidebar-collapsed", !next);

  toggleClass(dom?.sidebar, "open", next);
  toggleClass(dom?.sidebar, "collapsed", !next);
  toggleClass(dom?.sidebar, "is-open", next);
  toggleClass(dom?.sidebar, "is-collapsed", !next);

  setAriaExpanded(dom?.sidebarToggle, next);
  setAriaExpanded(dom?.sidebarMobileToggle, next);

  safeEmit(events, SESSION_EVENTS.sidebarChange, {
    open: next,
    changedAt: safeNowIso(),
  });

  return next;
}

export function setLoading({
  dom,
  events,
  setState,
  value,
} = {}) {
  const next = Boolean(value);

  safeSetState(
    setState,
    { loading: next },
    { source: "core-session:setLoading" }
  );

  toggleClass(dom?.html, "app-loading", next);
  toggleClass(dom?.body, "loading", next);
  toggleClass(dom?.body, "app-loading", next);

  setDataset(dom?.html, "appLoading", next ? "true" : "false");
  setDataset(dom?.body, "appLoading", next ? "true" : "false");

  if (dom?.loader) {
    try {
      dom.loader.hidden = !next;
    } catch {}

    setAttribute(dom.loader, "aria-hidden", String(!next));
    setAttribute(dom.loader, "aria-busy", String(next));
    setDataset(dom.loader, "loaderVisible", next ? "true" : "false");
    setDataset(dom.loader, "loaderState", next ? "visible" : "hidden");
  }

  safeEmit(events, SESSION_EVENTS.loadingChange, {
    loading: next,
    changedAt: safeNowIso(),
  });

  return next;
}

export function setError({
  events,
  setState,
  cloneError,
  error = null,
} = {}) {
  const normalized = error
    ? safeCloneError(cloneError, error) || error
    : null;

  safeSetState(
    setState,
    {
      lastError: normalized,
      error: normalized,
      hasError: Boolean(normalized),
    },
    {
      source: "core-session:setError",
    }
  );

  safeEmit(events, SESSION_EVENTS.error, {
    error: sanitizeForEvent(normalized),
    hasError: Boolean(normalized),
    changedAt: safeNowIso(),
  });

  return normalized;
}

/* =========================================================
   BASE UI
========================================================= */

export function syncBaseUI({
  setDocumentTitle,
  syncUserUI,
} = {}) {
  try {
    setDocumentTitle?.(config.appName);
  } catch {}

  try {
    syncUserUI?.();
  } catch {}

  return true;
}

/* =========================================================
   DEBUG
========================================================= */

export function getSessionDebugSnapshot(state) {
  return {
    version: SESSION_VERSION,

    authenticated: Boolean(state?.authenticated),
    hasToken: Boolean(state?.hasToken),

    token: null,
    accessToken: null,
    refreshToken: null,
    tempToken: null,

    role: state?.role || null,
    roles: localSafeArray(state?.roles),

    username: state?.username || safeGetUserUsername(state?.user),
    displayName: safeGetUserDisplayName(state?.user),
    avatarUrl: safeRedact(safeGetUserAvatarUrl(state?.user) || ""),

    currentResolvedUsername: state?.currentResolvedUsername || null,
    resolvedUsername: state?.resolvedUsername || null,

    route: safeCanonicalPath(state?.route || DEFAULT_ROUTE),
    publicPath: safeRedact(
      safePublicPath(state?.publicPath || state?.route || DEFAULT_ROUTE)
    ),

    theme: state?.theme || config.defaultTheme || DEFAULT_THEME,
    themeMode: state?.themeMode || null,
    lang: state?.lang || config.defaultLang || DEFAULT_LANG,

    sidebarOpen: typeof state?.sidebarOpen === "boolean" ? state.sidebarOpen : null,

    hasUser: hasUsableUser(state?.user),

    at: safeNowIso(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export {
  SESSION_VERSION,
  SESSION_EVENTS,
};

export default {
  SESSION_VERSION,
  SESSION_EVENTS,

  setRoute,
  setPublicPath,

  setUser,
  setToken,
  applySession,
  clearSession,

  loadPreferences,
  loadSession,

  syncThemeMetaColor,

  setTheme,
  setLang,
  setSidebarOpen,
  setLoading,
  setError,

  syncBaseUI,
  getSessionDebugSnapshot,
};
