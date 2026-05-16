/* =========================================================
   Onion SPA - Core Session
   Archivo: src/core/session.js

   CORE SESSION · SIMPLE
   - Auth estricta: token + user usable = authenticated
   - Token sin user: hasToken=true, authenticated=false
   - User sin token: authenticated=false y no se pinta usuario
   - clearSession no toca preferencias/UI
   - publicPath conserva /@usuario/query/hash
   - canonicalPath limpia /@usuario/query/hash y rutas token
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
  safeLower,
  redactTokenInText,
  cloneError as helperCloneError,
} from "./helpers.js";

import { computeAuthenticated } from "./state.js";
import { removeLegacySessionKeys } from "./storage.js";

export const SESSION_VERSION = "19.0.0-simple";

const DEFAULT_ROUTE = "/";
const DEFAULT_LANG = "es";
const DEFAULT_THEME = "dark";
const DEFAULT_THEME_MODE = "system";

const VALID_THEMES = Object.freeze(["dark", "light"]);
const VALID_THEME_MODES = Object.freeze(["dark", "light", "system"]);
const VALID_LANG_RE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i;

export const SESSION_EVENTS = Object.freeze({
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
  accessToken: "access_token",
  access_token: "access_token",
  refreshToken: "refresh_token",
  refresh_token: "refresh_token",
  tempToken: "temp_token",
  temp_token: "temp_token",
  sessionId: "session_id",
  sessionUserId: "session_user_id",
  user: "user",
  currentUser: "current_user",
  authUser: "auth_user",
  sessionUser: "session_user",
  role: "role",
  roles: "roles",
  theme: "theme",
  themeMode: "theme_mode",
  appearance: "appearance",
  lang: "lang",
  language: "language",
  locale: "locale",
  sidebarOpen: "sidebar_open",
  sidebarCollapsed: "sidebar_collapsed",
  lastRoute: "last_route",
  lastPublicPath: "last_public_path",
  postLoginTarget: "post_login_target",
  redirectAfterLogin: "redirect_after_login",
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

const ACCESS_TOKEN_KEYS = Object.freeze(["token", "accessToken", "access_token"]);
const USER_STORAGE_KEYS = Object.freeze(["user", "currentUser", "authUser", "sessionUser"]);
const AUX_KEYS = Object.freeze(["refreshToken", "refresh_token", "tempToken", "temp_token", "sessionId", "sessionUserId"]);

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
  if (!isObject(value) || Array.isArray(value)) return false;

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

function text(value, fallback = "") {
  try {
    if (typeof safeText === "function") return safeText(value, fallback);
  } catch {}

  if (value === null || value === undefined) return fallback;

  const out = String(value).trim();
  return out || fallback;
}

function object(value, fallback = {}) {
  try {
    if (typeof safeObject === "function") return safeObject(value, fallback);
  } catch {}

  return isPlainObject(value) ? value : fallback;
}

function lower(value, fallback = "") {
  try {
    if (typeof safeLower === "function") return safeLower(value, fallback);
  } catch {}

  return text(value, fallback).toLowerCase();
}

function bool(value, fallback = false) {
  try {
    if (typeof safeBool === "function") return safeBool(value, fallback);
  } catch {}

  if (value === true || value === false) return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;

  const clean = lower(value, "");

  if (["true", "yes", "si", "sí", "ok", "on", "enabled", "active"].includes(clean)) return true;
  if (["false", "no", "off", "disabled", "inactive"].includes(clean)) return false;

  return Boolean(fallback);
}

function array(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value === null || value === undefined) return [];
  return [value];
}

function unique(values = []) {
  return [...new Set(array(values).flat(Infinity).map((item) => text(item, "")).filter(Boolean))];
}

function now() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function iso(ms = now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function redact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return text(value, "");
  }
}

function emit(events, name, payload = {}) {
  const eventName = text(name, "");
  if (!eventName) return false;

  const cleanPayload = sanitize(payload);

  for (const method of ["emit", "dispatch", "trigger"]) {
    try {
      if (isFunction(events?.[method])) {
        events[method](eventName, cleanPayload);
        return true;
      }
    } catch {}
  }

  return false;
}

function setStateSafe(setState, patch = {}, options = undefined) {
  if (!isFunction(setState)) return false;

  try {
    if (options !== undefined) setState(object(patch), options);
    else setState(object(patch));
    return true;
  } catch {
    return false;
  }
}

function commitState({ state, setState, patch = {}, options = {} } = {}) {
  const cleanPatch = object(patch, {});
  const wrote = setStateSafe(setState, cleanPatch, options);

  if (state && isObject(state)) {
    try {
      Object.assign(state, cleanPatch);
    } catch {}
  }

  return wrote;
}

/* =========================================================
   STORAGE
========================================================= */

function storageKey(name = "", fallback = "") {
  const cleanName = text(name, "");
  const keys = object(config?.storageKeys, {});

  return (
    text(keys?.[cleanName], "") ||
    text(STORAGE_KEY_FALLBACKS?.[cleanName], "") ||
    text(fallback, "") ||
    cleanName
  );
}

function storageGet(storage, key, fallback = null, options = undefined) {
  const finalKey = text(key, "");
  if (!finalKey) return fallback;

  try {
    if (options !== undefined) return storage?.get?.(finalKey, fallback, options);
    return storage?.get?.(finalKey, fallback);
  } catch {
    return fallback;
  }
}

function storageGetRaw(storage, key, fallback = null, options = undefined) {
  const finalKey = text(key, "");
  if (!finalKey) return fallback;

  try {
    if (isFunction(storage?.getRaw)) {
      if (options !== undefined) return storage.getRaw(finalKey, fallback, options);
      return storage.getRaw(finalKey, fallback);
    }
  } catch {}

  return storageGet(storage, finalKey, fallback, options);
}

function storageSet(storage, key, value, options = undefined) {
  const finalKey = text(key, "");
  if (!finalKey) return false;

  try {
    if (options !== undefined) storage?.set?.(finalKey, value, options);
    else storage?.set?.(finalKey, value);
    return true;
  } catch {
    return false;
  }
}

function storageSetRaw(storage, key, value, options = undefined) {
  const finalKey = text(key, "");
  if (!finalKey) return false;

  try {
    if (isFunction(storage?.setRaw)) {
      if (options !== undefined) storage.setRaw(finalKey, value, options);
      else storage.setRaw(finalKey, value);
      return true;
    }
  } catch {}

  return storageSet(storage, finalKey, value, options);
}

function storageRemove(storage, key, options = undefined) {
  const finalKey = text(key, "");
  if (!finalKey) return false;

  try {
    if (isFunction(storage?.remove)) {
      if (options !== undefined) storage.remove(finalKey, options);
      else storage.remove(finalKey);
      return true;
    }
  } catch {}

  try {
    if (isFunction(storage?.delete)) {
      storage.delete(finalKey);
      return true;
    }
  } catch {}

  try {
    if (isFunction(storage?.del)) {
      storage.del(finalKey);
      return true;
    }
  } catch {}

  return false;
}

function removeStorageKeys(storage, keys = []) {
  for (const keyName of keys) {
    storageRemove(storage, storageKey(keyName), { all: true });
  }
}

/* =========================================================
   SANITIZE
========================================================= */

function sanitize(value, depth = 0, keyHint = "", seen = new WeakSet()) {
  if (SENSITIVE_KEY_RE.test(text(keyHint, ""))) return value ? "***" : null;
  if (depth > 4) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redact(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redact(value.message || "Error"),
      stack: value.stack ? "[stack]" : null,
      code: value.code || null,
      status: value.status || value.statusCode || null,
    };
  }

  if (Array.isArray(value)) return value.slice(0, 80).map((item) => sanitize(item, depth + 1, keyHint, seen));

  if (isObject(value)) {
    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      out[key] = sanitize(item, depth + 1, key, seen);
    }
    return out;
  }

  try {
    return redact(String(value));
  } catch {
    return "[unserializable]";
  }
}

function cloneErrorSafe(cloneError, error = null) {
  try {
    if (isFunction(cloneError)) return cloneError(error);
  } catch {}

  try {
    return helperCloneError(error);
  } catch {}

  return error ? sanitize(error) : null;
}

/* =========================================================
   PATHS
========================================================= */

function baseOrigin() {
  if (isBrowser() && window.location?.origin) return window.location.origin;
  return "http://localhost";
}

function isHashRouterPath(value = "") {
  const raw = text(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = text(value, "");
  if (!raw) return DEFAULT_ROUTE;
  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  return raw.replace(/^#\/?/, "/") || DEFAULT_ROUTE;
}

function publicPath(value = DEFAULT_ROUTE, fallback = DEFAULT_ROUTE) {
  const raw = text(value, "") || fallback || DEFAULT_ROUTE;

  if (isHashRouterPath(raw)) return publicPath(normalizeHashRouterPath(raw), fallback);

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed = new URL(raw, baseOrigin());

      if (parsed.hash && isHashRouterPath(parsed.hash)) {
        return publicPath(normalizeHashRouterPath(parsed.hash), fallback);
      }

      return normalizePath(`${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`);
    }
  } catch {}

  try {
    return normalizePath(raw);
  } catch {
    return DEFAULT_ROUTE;
  }
}

function stripSearchAndHash(path = DEFAULT_ROUTE) {
  return publicPath(path).split("?")[0].split("#")[0] || DEFAULT_ROUTE;
}

function stripUsernamePrefix(path = DEFAULT_ROUTE) {
  const visible = publicPath(path);
  const suffix = visible.includes("?") || visible.includes("#")
    ? visible.slice(stripSearchAndHash(visible).length)
    : "";
  const clean = stripSearchAndHash(visible).replace(/^\/@[^/]+(?=\/|$)/i, "") || DEFAULT_ROUTE;
  return publicPath(`${clean}${suffix}`);
}

function canonicalPath(value = DEFAULT_ROUTE, fallback = DEFAULT_ROUTE) {
  const source = value || fallback || DEFAULT_ROUTE;

  try {
    return normalizeCanonicalPath(stripUsernamePrefix(source) || DEFAULT_ROUTE);
  } catch {
    return stripSearchAndHash(stripUsernamePrefix(source));
  }
}

function usernameFromPublicPath(value = DEFAULT_ROUTE) {
  const match = publicPath(value).match(/^\/@([^/]+)(?:\/|$)/i);

  try {
    return sanitizeUsername(match?.[1] || "") || null;
  } catch {
    return null;
  }
}

/* =========================================================
   USER / TOKEN
========================================================= */

function stripBearer(token = "") {
  return text(token, "").replace(/^Bearer\s+/i, "").trim();
}

function tokenValid(token = null) {
  const clean = stripBearer(token);
  if (!clean) return false;

  try {
    return Boolean(hasValidToken(clean));
  } catch {
    return Boolean(clean && !/[\s\r\n\t]/.test(clean));
  }
}

function normalizeToken(token = null) {
  const clean = stripBearer(token);
  return tokenValid(clean) ? clean : null;
}

function normalizeUserSafe(user = null) {
  if (!user) return null;

  try {
    return normalizeUser(user);
  } catch {
    return isPlainObject(user) ? user : null;
  }
}

function usableUser(user = null) {
  const normalized = normalizeUserSafe(user);
  if (!normalized || !isObject(normalized)) return false;

  try {
    if (typeof isUsableUser === "function") return Boolean(isUsableUser(normalized));
  } catch {}

  if (
    normalized.active === false ||
    normalized.disabled === true ||
    normalized.deleted === true ||
    normalized.archived === true ||
    normalized.blocked === true ||
    normalized.suspended === true ||
    normalized.revoked === true
  ) {
    return false;
  }

  const status = lower(normalized.status || normalized.estado || normalized.state || normalized.accountStatus || "", "");

  if (
    [
      "disabled",
      "inactive",
      "deleted",
      "blocked",
      "suspended",
      "banned",
      "revoked",
      "archived",
      "desactivado",
      "inactivo",
      "bloqueado",
      "eliminado",
      "suspendido",
      "archivado",
    ].includes(status)
  ) {
    return false;
  }

  return USER_ID_KEYS.some((key) => Boolean(text(normalized?.[key], "")));
}

function userUsername(user = null) {
  try {
    return getUserUsername(user) || null;
  } catch {
    return null;
  }
}

function userDisplayName(user = null) {
  try {
    return getUserDisplayName(user) || null;
  } catch {
    return null;
  }
}

function userAvatarUrl(user = null) {
  try {
    return getUserAvatarUrl(user) || null;
  } catch {
    return null;
  }
}

function normalizeRole(value = "") {
  const clean = text(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .trim();

  return ["admin", "administrator", "administrador", "superadmin", "super_admin", "super-admin", "owner", "root"].includes(clean)
    ? "admin"
    : "user";
}

function roleOf(user = null) {
  return normalizeRole(
    user?.role ||
      user?.rol ||
      user?.userRole ||
      user?.user_role ||
      user?.type ||
      user?.userType ||
      user?.user_type ||
      user?.profile?.role ||
      user?.profile?.rol ||
      user?.raw?.role ||
      user?.raw?.rol ||
      "user"
  );
}

function computeAuth(user = null, token = null) {
  const normalizedUser = normalizeUserSafe(user);
  const validToken = tokenValid(token);
  const validUser = usableUser(normalizedUser);

  if (!validToken || !validUser) return false;

  try {
    return Boolean(computeAuthenticated(normalizedUser, token));
  } catch {
    return true;
  }
}

/*
  Estado auth estricto:
  - Sin token => limpia todo auth.
  - Token sin user => conserva token + hasToken, authenticated=false.
  - User sin token => no autentica.
  - Token + user usable => authenticated=true.
*/
function buildAuthPatch(root = {}, options = {}) {
  const source = object(root, {});
  const forceUnauthenticated = options?.forceUnauthenticated === true;

  const token = normalizeToken(source.token || source.accessToken || source.access_token || null);
  const user = source.user ? normalizeUserSafe(source.user) : null;

  const clear = {
    authenticated: false,
    user: null,
    currentUser: null,
    authUser: null,
    sessionUser: null,
    role: null,
    rol: null,
    userRole: null,
    roles: [],
    username: null,
    currentResolvedUsername: null,
    resolvedUsername: null,
    isAdmin: false,
    isUser: false,
    isClient: false,
    isSupport: false,
    isManager: false,
  };

  if (!token) {
    return {
      ...clear,
      hasToken: false,
      token: null,
      accessToken: null,
      access_token: null,
    };
  }

  if (forceUnauthenticated || !usableUser(user) || !computeAuth(user, token)) {
    return {
      ...clear,
      hasToken: true,
      token,
      accessToken: token,
      access_token: token,
    };
  }

  const role = roleOf(user);
  const fromPath = usernameFromPublicPath(source.publicPath || source.route || DEFAULT_ROUTE);
  const fromUser = (() => {
    try {
      return sanitizeUsername(userUsername(user) || user?.username || user?.email || "") || null;
    } catch {
      return null;
    }
  })();

  const previous = (() => {
    try {
      return sanitizeUsername(source.currentResolvedUsername || source.resolvedUsername || "") || null;
    } catch {
      return null;
    }
  })();

  const currentResolvedUsername = fromPath || fromUser || previous || null;

  return {
    authenticated: true,
    hasToken: true,

    token,
    accessToken: token,
    access_token: token,

    user,
    currentUser: user,
    authUser: user,
    sessionUser: user,

    role,
    rol: role,
    userRole: role,
    roles: [role],

    username: userUsername(user),

    isAdmin: role === "admin",
    isUser: role === "user",
    isClient: false,
    isSupport: false,
    isManager: false,

    currentResolvedUsername,
    resolvedUsername: currentResolvedUsername,
  };
}

function syncAuthState(state, options = {}) {
  if (!state || !isObject(state)) return state;
  Object.assign(state, buildAuthPatch(state, options));
  return state;
}

/* =========================================================
   SNAPSHOTS / EVENTS
========================================================= */

function authSnapshot(state) {
  return {
    authenticated: Boolean(state?.authenticated),
    hasToken: Boolean(state?.hasToken),
    role: state?.role || null,
    username: state?.username || userUsername(state?.user) || null,
    currentResolvedUsername: state?.currentResolvedUsername || null,
  };
}

function userSnapshot(user = null) {
  const normalized = normalizeUserSafe(user);
  if (!normalized || !isObject(normalized)) return null;

  return sanitize({
    id: normalized.id || normalized.userId || null,
    userId: normalized.userId || normalized.id || null,
    username: normalized.username || null,
    slug: normalized.slug || null,
    email: normalized.email || null,
    name: normalized.name || null,
    displayName: normalized.displayName || normalized.name || null,
    role: normalized.role || normalized.rol || null,
    roles: array(normalized.roles),
    avatar: normalized.avatar ? redact(normalized.avatar) : null,
    avatarUrl: normalized.avatarUrl ? redact(normalized.avatarUrl) : null,
    hasAvatar: Boolean(normalized.hasAvatar),
    avatarUpdatedAt: normalized.avatarUpdatedAt || null,
    active: normalized.active !== false,
  });
}

function sessionSnapshot(state, cause = "unknown") {
  const visiblePublicPath = publicPath(state?.publicPath || state?.route || DEFAULT_ROUTE);

  return {
    version: SESSION_VERSION,

    authenticated: Boolean(state?.authenticated),
    hasToken: Boolean(state?.hasToken),

    token: null,
    accessToken: null,
    refreshToken: null,
    tempToken: null,

    user: state?.authenticated ? userSnapshot(state?.user || null) : null,

    role: state?.role || null,
    roles: array(state?.roles),

    username: state?.username || userUsername(state?.user) || null,
    displayName: state?.authenticated ? userDisplayName(state?.user) : null,
    avatarUrl: state?.authenticated ? redact(userAvatarUrl(state?.user) || "") : null,

    currentResolvedUsername: state?.currentResolvedUsername || null,
    resolvedUsername: state?.resolvedUsername || null,

    route: canonicalPath(state?.route || DEFAULT_ROUTE),
    publicPath: redact(visiblePublicPath),

    theme: state?.theme || config.defaultTheme || DEFAULT_THEME,
    themeMode: state?.themeMode || null,
    lang: state?.lang || config.defaultLang || DEFAULT_LANG,

    cause,
    changedAt: iso(),
  };
}

function emitAuthChangeIfNeeded(events, previous, state, cause = "unknown") {
  const next = authSnapshot(state);

  if (
    previous?.authenticated === next.authenticated &&
    previous?.hasToken === next.hasToken &&
    previous?.role === next.role &&
    previous?.username === next.username &&
    previous?.currentResolvedUsername === next.currentResolvedUsername
  ) {
    return false;
  }

  return emit(events, SESSION_EVENTS.authChange, {
    ...next,
    previousAuthenticated: Boolean(previous?.authenticated),
    cause,
    changedAt: iso(),
  });
}

function userFingerprint(user = null) {
  if (!user) return "";
  const normalized = normalizeUserSafe(user);

  try {
    return JSON.stringify({
      id: normalized?.id || normalized?.userId || null,
      username: normalized?.username || null,
      email: normalized?.email || null,
      role: normalized?.role || normalized?.rol || null,
      avatar: normalized?.avatar || normalized?.avatarUrl || null,
      avatarUpdatedAt: normalized?.avatarUpdatedAt || null,
      active: normalized?.active ?? null,
    });
  } catch {
    return String(user);
  }
}

function tokenFingerprint(token = null) {
  const clean = normalizeToken(token);
  if (!clean) return "";
  return `${clean.length}:${clean.slice(0, 8)}:${clean.slice(-8)}`;
}

/* =========================================================
   DOM HELPERS
========================================================= */

function setAttribute(el, name, value) {
  if (!el || !name) return false;

  try {
    if (value === null || value === undefined || value === "") el.removeAttribute(name);
    else el.setAttribute(name, String(value));
    return true;
  } catch {
    return false;
  }
}

function setDataset(el, key, value) {
  if (!el || !key) return false;

  try {
    if (value === null || value === undefined || value === "") delete el.dataset[key];
    else el.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function addClass(el, className) {
  try {
    el?.classList?.add?.(className);
    return true;
  } catch {
    return false;
  }
}

function removeClass(el, className) {
  try {
    el?.classList?.remove?.(className);
    return true;
  } catch {
    return false;
  }
}

function toggleClass(el, className, force) {
  try {
    el?.classList?.toggle?.(className, Boolean(force));
    return true;
  } catch {
    return false;
  }
}

function setAriaExpanded(el, value) {
  return setAttribute(el, "aria-expanded", String(Boolean(value)));
}

/* =========================================================
   THEME / LANG
========================================================= */

function normalizeTheme(theme = config.defaultTheme) {
  const value = lower(theme, config.defaultTheme || DEFAULT_THEME);
  return VALID_THEMES.includes(value) ? value : DEFAULT_THEME;
}

function normalizeThemeMode(mode = DEFAULT_THEME_MODE) {
  const value = lower(mode, DEFAULT_THEME_MODE);

  if (["auto", "automatic", "browser", "os", "device", "system-preference", "system_preference"].includes(value)) {
    return "system";
  }

  return VALID_THEME_MODES.includes(value) ? value : DEFAULT_THEME_MODE;
}

function normalizeLang(lang = config.defaultLang) {
  const value = lower(lang, config.defaultLang || DEFAULT_LANG).replace(/_/g, "-");
  return VALID_LANG_RE.test(value) ? value : config.defaultLang || DEFAULT_LANG;
}

function bootThemeSnapshot() {
  if (!isBrowser()) return {};

  try {
    return window.__ONION_BOOT_THEME__ || {};
  } catch {
    return {};
  }
}

function systemTheme() {
  if (!isBrowser()) return DEFAULT_THEME;

  try {
    if (isFunction(window.matchMedia) && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  } catch {}

  return "light";
}

function themeFromMode(mode = DEFAULT_THEME_MODE) {
  const finalMode = normalizeThemeMode(mode);
  if (finalMode === "dark") return "dark";
  if (finalMode === "light") return "light";
  return systemTheme();
}

function themeFromUser(user = null) {
  if (!user || !isObject(user)) return null;

  const explicitTheme = lower(
    user.theme ??
      user?.preferences?.theme ??
      user?.settings?.theme ??
      user?.raw?.theme ??
      user?.raw?.preferences?.theme ??
      user?.raw?.settings?.theme ??
      "",
    ""
  );

  if (VALID_THEMES.includes(explicitTheme)) return explicitTheme;

  const explicitMode = lower(
    user.themeMode ??
      user.theme_mode ??
      user.appearance ??
      user?.preferences?.themeMode ??
      user?.preferences?.theme_mode ??
      user?.preferences?.appearance ??
      user?.settings?.themeMode ??
      user?.settings?.theme_mode ??
      user?.settings?.appearance ??
      "",
    ""
  );

  return explicitMode ? themeFromMode(explicitMode) : null;
}

function storedTheme(storage) {
  const boot = bootThemeSnapshot();

  const bootMode = normalizeThemeMode(boot?.mode || "");
  const bootTheme = VALID_THEMES.includes(boot?.theme) ? boot.theme : "";

  const storedModeRaw =
    storageGet(storage, storageKey("themeMode"), "") ||
    storageGet(storage, storageKey("appearance"), "");

  const storedMode = storedModeRaw ? normalizeThemeMode(storedModeRaw) : "";

  const storedThemeRaw = storageGet(storage, storageKey("theme"), bootTheme || config.defaultTheme || DEFAULT_THEME);
  const stored = normalizeTheme(storedThemeRaw);

  const finalMode =
    storedMode ||
    bootMode ||
    normalizeThemeMode(config?.defaultThemeMode || config?.appearance || "") ||
    DEFAULT_THEME_MODE;

  const finalTheme = storedMode ? themeFromMode(storedMode) : bootTheme || stored || themeFromMode(finalMode);

  return {
    theme: normalizeTheme(finalTheme),
    themeMode: normalizeThemeMode(finalMode),
  };
}

export function syncThemeMetaColor({ dom, theme = config.defaultTheme } = {}) {
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

function applyThemeDom({ dom, theme, themeMode = "" } = {}) {
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

  syncThemeMetaColor({ dom, theme: finalTheme });

  return finalTheme;
}

/* =========================================================
   ROUTE
========================================================= */

function syncRouteFields({ state, setState, route, publicPath: nextPublicPath } = {}) {
  const visiblePath = publicPath(nextPublicPath || state?.publicPath || route || state?.route || DEFAULT_ROUTE);
  const canonical = canonicalPath(route || visiblePath || state?.route || DEFAULT_ROUTE);

  const preview = {
    ...object(state),
    route: canonical,
    canonicalPath: canonical,
    publicPath: visiblePath,
  };

  const authPatch = buildAuthPatch(preview);

  const patch = {
    route: canonical,
    canonicalPath: canonical,
    publicPath: visiblePath,
    currentResolvedUsername: authPatch.currentResolvedUsername,
    resolvedUsername: authPatch.resolvedUsername,
  };

  commitState({
    state,
    setState,
    patch,
    options: { source: "core-session:syncRouteFields" },
  });

  return patch;
}

export function setRoute({ state, setState, events, route = DEFAULT_ROUTE, options = {} } = {}) {
  const previousRoute = canonicalPath(state?.route || DEFAULT_ROUTE);
  const nextRoute = canonicalPath(route || DEFAULT_ROUTE);

  if (previousRoute === nextRoute) return nextRoute;

  const preview = {
    ...object(state),
    route: nextRoute,
    canonicalPath: nextRoute,
  };

  const authPatch = buildAuthPatch(preview);

  const patch = {
    lastRoute: previousRoute,
    route: nextRoute,
    canonicalPath: nextRoute,
    currentResolvedUsername: authPatch.currentResolvedUsername,
    resolvedUsername: authPatch.resolvedUsername,
  };

  commitState({
    state,
    setState,
    patch,
    options: {
      ...object(options),
      source: options?.source || "core-session:setRoute",
    },
  });

  emit(events, SESSION_EVENTS.routeChange, {
    route: nextRoute,
    canonicalPath: nextRoute,
    previousRoute,
    publicPath: redact(state?.publicPath || nextRoute),
    changedAt: iso(),
  });

  return nextRoute;
}

export function setPublicPath({ state, storage, setState, events, path = DEFAULT_ROUTE, options = {} } = {}) {
  const previousPublicPath = publicPath(state?.publicPath || DEFAULT_ROUTE);
  const nextPublicPath = publicPath(path || DEFAULT_ROUTE);

  if (previousPublicPath === nextPublicPath) return nextPublicPath;

  const nextRoute = canonicalPath(nextPublicPath, state?.route || DEFAULT_ROUTE);

  const preview = {
    ...object(state),
    publicPath: nextPublicPath,
    route: nextRoute,
    canonicalPath: nextRoute,
  };

  const authPatch = buildAuthPatch(preview);

  const patch = {
    lastPublicPath: previousPublicPath,
    publicPath: nextPublicPath,
    route: nextRoute,
    canonicalPath: nextRoute,
    currentResolvedUsername: authPatch.currentResolvedUsername,
    resolvedUsername: authPatch.resolvedUsername,
  };

  commitState({
    state,
    setState,
    patch,
    options: {
      ...object(options),
      source: options?.source || "core-session:setPublicPath",
    },
  });

  storageSet(storage, storageKey("lastPublicPath"), nextPublicPath);

  emit(events, SESSION_EVENTS.publicPathChange, {
    publicPath: redact(nextPublicPath),
    previousPublicPath: redact(previousPublicPath),
    route: nextRoute,
    canonicalPath: nextRoute,
    changedAt: iso(),
  });

  return nextPublicPath;
}

/* =========================================================
   AUTH STORAGE
========================================================= */

function persistAccessToken(storage, token) {
  if (token) {
    storageSetRaw(storage, storageKey("token"), token);
    storageSetRaw(storage, storageKey("accessToken"), token);
    storageSetRaw(storage, storageKey("access_token"), token);
    return true;
  }

  removeStorageKeys(storage, ACCESS_TOKEN_KEYS);
  return false;
}

function persistUser(storage, user, authenticated) {
  if (authenticated && user) {
    storageSet(storage, storageKey("user"), user);
    storageSet(storage, storageKey("currentUser"), user);
    return true;
  }

  removeStorageKeys(storage, USER_STORAGE_KEYS);
  return false;
}

function persistValue(storage, keyName, value, { raw = false, removeWhenEmpty = true } = {}) {
  if (value === undefined) return false;

  const key = storageKey(keyName);

  if (value === null || value === "") {
    if (!removeWhenEmpty) return false;
    return storageRemove(storage, key, { all: true });
  }

  return raw ? storageSetRaw(storage, key, String(value)) : storageSet(storage, key, value);
}

function persistAuxValues(storage, values = {}) {
  persistValue(storage, "refreshToken", values.refreshToken ?? values.refresh_token, { raw: true });
  persistValue(storage, "refresh_token", values.refreshToken ?? values.refresh_token, { raw: true });
  persistValue(storage, "tempToken", values.tempToken ?? values.temp_token, { raw: true });
  persistValue(storage, "temp_token", values.tempToken ?? values.temp_token, { raw: true });
  persistValue(storage, "sessionId", values.sessionId);
  persistValue(storage, "sessionUserId", values.sessionUserId);
}

function clearAuxValues(storage) {
  removeStorageKeys(storage, AUX_KEYS);
}

/* =========================================================
   USER / TOKEN SETTERS
========================================================= */

export function setUser({ state, storage, events, setState, syncUserUI, user = null, options = {} } = {}) {
  const normalizedUser = user ? normalizeUserSafe(user) : null;
  const previousAuth = authSnapshot(state);
  const previousUser = userFingerprint(state?.user);
  const nextUser = userFingerprint(normalizedUser);

  const preview = {
    ...object(state),
    user: normalizedUser,
  };

  const authPatch = buildAuthPatch(preview, {
    forceUnauthenticated: !normalizeToken(preview.token) || !usableUser(normalizedUser),
  });

  if (previousUser !== nextUser || previousAuth.authenticated !== authPatch.authenticated) {
    commitState({
      state,
      setState,
      patch: authPatch,
      options: {
        ...object(options),
        source: options?.source || "core-session:setUser",
        forceUnauthenticated: !authPatch.authenticated,
      },
    });
  } else if (state) {
    Object.assign(state, authPatch);
  }

  persistUser(storage, authPatch.user, authPatch.authenticated);

  try {
    syncUserUI?.();
  } catch {}

  emitAuthChangeIfNeeded(events, previousAuth, state, "setUser");

  emit(events, SESSION_EVENTS.userChange, {
    user: state?.authenticated ? userSnapshot(state?.user) : null,
    authenticated: Boolean(state?.authenticated),
    hasToken: Boolean(state?.hasToken),
    role: state?.role || null,
    username: state?.username || null,
    displayName: state?.authenticated ? userDisplayName(state?.user) : null,
    currentResolvedUsername: state?.currentResolvedUsername || null,
    avatarUrl: state?.authenticated ? redact(userAvatarUrl(state?.user) || "") : null,
    changedAt: iso(),
  });

  emit(events, SESSION_EVENTS.sessionState, sessionSnapshot(state, "setUser"));

  return state?.user || null;
}

export function setToken({ state, storage, events, setState, token = null, options = {} } = {}) {
  const normalizedToken = normalizeToken(token);
  const previousAuth = authSnapshot(state);
  const previousToken = tokenFingerprint(state?.token);
  const nextToken = tokenFingerprint(normalizedToken);

  const preview = {
    ...object(state),
    token: normalizedToken,
    accessToken: normalizedToken,
    access_token: normalizedToken,
  };

  const authPatch = buildAuthPatch(preview, {
    forceUnauthenticated: !normalizedToken || !usableUser(preview.user),
  });

  if (previousToken !== nextToken || previousAuth.authenticated !== authPatch.authenticated) {
    commitState({
      state,
      setState,
      patch: authPatch,
      options: {
        ...object(options),
        source: options?.source || "core-session:setToken",
        forceUnauthenticated: !authPatch.authenticated,
      },
    });
  } else if (state) {
    Object.assign(state, authPatch);
  }

  persistAccessToken(storage, authPatch.token);
  persistUser(storage, authPatch.user, authPatch.authenticated);

  emitAuthChangeIfNeeded(events, previousAuth, state, "setToken");

  emit(events, SESSION_EVENTS.tokenChange, {
    token: null,
    hasToken: Boolean(state?.hasToken),
    authenticated: Boolean(state?.authenticated),
    role: state?.role || null,
    username: state?.username || null,
    currentResolvedUsername: state?.currentResolvedUsername || null,
    changedAt: iso(),
  });

  emit(events, SESSION_EVENTS.sessionState, sessionSnapshot(state, "setToken"));

  return state?.token || null;
}

/* =========================================================
   APPLY / CLEAR SESSION
========================================================= */

function resolveApplySession(input = {}) {
  const data = object(input);
  const session = data.sessionData || data.session || data.authSession || data.auth_session || {};

  return {
    token: data.token ?? data.accessToken ?? data.access_token ?? data.authToken ?? data.auth_token ?? data.jwt ?? undefined,
    user: data.user ?? data.usuario ?? data.me ?? data.account ?? data.profile ?? data.currentUser ?? data.authUser ?? data.sessionUser ?? data.data?.user ?? data.payload?.user ?? undefined,
    refreshToken: data.refreshToken ?? data.refresh_token ?? undefined,
    tempToken: data.tempToken ?? data.temp_token ?? data.temporaryToken ?? data.temporary_token ?? data.twoFactorToken ?? data.two_factor_token ?? data.mfaToken ?? data.mfa_token ?? undefined,
    sessionId: data.sessionId ?? data.session_id ?? session.sessionId ?? session.session_id ?? session.id ?? undefined,
    sessionUserId: data.sessionUserId ?? data.session_user_id ?? session.sessionUserId ?? session.session_user_id ?? session.userId ?? session.user_id ?? undefined,
    session,
    route: data.route,
    publicPath: data.publicPath,
    options: data.options || {},
  };
}

function callFlexibleSetter(fn, objectArg, directValue, key) {
  if (!isFunction(fn)) return null;

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
  } = object(input);

  const resolved = resolveApplySession(input);
  const opts = object(input.options || resolved.options);
  const previousAuth = authSnapshot(state);

  const tokenWasProvided = resolved.token !== undefined;
  const userWasProvided = resolved.user !== undefined;
  const routeWasProvided = resolved.route !== undefined;
  const publicPathWasProvided = resolved.publicPath !== undefined;

  const nextToken = tokenWasProvided ? normalizeToken(resolved.token) : normalizeToken(state?.token);
  const nextUser = userWasProvided ? (resolved.user ? normalizeUserSafe(resolved.user) : null) : state?.user ?? null;
  const nextPublicPath = publicPathWasProvided ? publicPath(resolved.publicPath, state?.publicPath || state?.route || DEFAULT_ROUTE) : state?.publicPath || DEFAULT_ROUTE;
  const nextRoute = routeWasProvided ? canonicalPath(resolved.route, state?.route || DEFAULT_ROUTE) : canonicalPath(nextPublicPath || state?.route || DEFAULT_ROUTE);

  const sessionPatch = {};

  if (resolved.session && isObject(resolved.session)) {
    sessionPatch.session = resolved.session;
    sessionPatch.sessionData = resolved.session;
  }

  if (resolved.sessionId !== undefined) sessionPatch.sessionId = resolved.sessionId || null;
  if (resolved.sessionUserId !== undefined) sessionPatch.sessionUserId = resolved.sessionUserId || null;

  const preview = {
    ...object(state),
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
    forceUnauthenticated: !nextToken || !usableUser(nextUser),
  });

  const patch = {
    ...sessionPatch,
    route: nextRoute,
    canonicalPath: nextRoute,
    publicPath: nextPublicPath,
    ...authPatch,
  };

  if (isFunction(setState) && state) {
    commitState({
      state,
      setState,
      patch,
      options: {
        ...opts,
        source: opts.source || "core-session:applySession",
        forceUnauthenticated: !authPatch.authenticated,
      },
    });
  } else {
    if (tokenWasProvided) callFlexibleSetter(injectedSetToken, { token: resolved.token }, resolved.token, "token");
    if (userWasProvided) callFlexibleSetter(injectedSetUser, { user: resolved.user }, resolved.user, "user");

    if (routeWasProvided || publicPathWasProvided) {
      syncRouteFields({ state, setState, route: nextRoute, publicPath: nextPublicPath });
    }

    if (state) Object.assign(state, patch);
  }

  persistAccessToken(storage, authPatch.token);
  persistUser(storage, authPatch.user, authPatch.authenticated);

  if (authPatch.hasToken) {
    persistAuxValues(storage, {
      refreshToken: resolved.refreshToken,
      tempToken: resolved.tempToken,
      sessionId: resolved.sessionId,
      sessionUserId: resolved.sessionUserId,
    });
  } else {
    clearAuxValues(storage);
  }

  if (state) syncAuthState(state, { forceUnauthenticated: !authPatch.authenticated });

  emitAuthChangeIfNeeded(events, previousAuth, state, "applySession");

  const snapshot = sessionSnapshot(state, "applySession");

  emit(events, SESSION_EVENTS.sessionApplied, snapshot);
  emit(events, SESSION_EVENTS.sessionState, snapshot);

  return snapshot;
}

export function clearSession({ state, storage, events, setState, syncUserUI, utils, options = {} } = {}) {
  const opts = object(options);
  const previousAuth = authSnapshot(state);

  removeStorageKeys(storage, AUTH_STORAGE_KEYS);

  try {
    removeLegacySessionKeys(utils, events);
  } catch {}

  const patch = {
    ...buildAuthPatch({ token: null, user: null }),
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

  emit(events, SESSION_EVENTS.sessionCleared, {
    authenticated: false,
    hasToken: false,
    token: null,
    user: null,
    role: null,
    username: null,
    currentResolvedUsername: null,
    silent: Boolean(opts.silent),
    reason: opts.reason || "clearSession",
    changedAt: iso(),
  });

  emit(events, SESSION_EVENTS.sessionState, sessionSnapshot(state, "clearSession"));

  return true;
}

/* =========================================================
   LOAD PREFERENCES / SESSION
========================================================= */

function storedSidebarOpen(storage) {
  const collapsed = storageGet(storage, storageKey("sidebarCollapsed"), null);

  if (collapsed !== null && collapsed !== undefined && collapsed !== "") return !bool(collapsed, false);

  const stored = storageGet(storage, storageKey("sidebarOpen"), null);
  if (stored === null || stored === undefined || stored === "") return true;

  return bool(stored, true);
}

export function loadPreferences({ state, storage, dom, events, setState } = {}) {
  const resolvedTheme = storedTheme(storage);

  const savedLang =
    storageGet(storage, storageKey("lang"), "") ||
    storageGet(storage, storageKey("language"), "") ||
    storageGet(storage, storageKey("locale"), "") ||
    config.defaultLang ||
    DEFAULT_LANG;

  const theme = normalizeTheme(resolvedTheme.theme);
  const themeMode = normalizeThemeMode(resolvedTheme.themeMode);
  const lang = normalizeLang(savedLang);
  const sidebarOpen = storedSidebarOpen(storage);

  commitState({
    state,
    setState,
    patch: { theme, themeMode, lang, sidebarOpen },
    options: { source: "core-session:loadPreferences" },
  });

  applyThemeDom({ dom, theme, themeMode });
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
    loadedAt: iso(),
  };

  emit(events, SESSION_EVENTS.preferencesLoaded, payload);

  return payload;
}

function readStoredToken(storage) {
  return (
    storageGetRaw(storage, storageKey("token"), null) ||
    storageGetRaw(storage, storageKey("accessToken"), null) ||
    storageGetRaw(storage, storageKey("access_token"), null)
  );
}

function readStoredUser(storage) {
  return (
    storageGet(storage, storageKey("user"), null) ||
    storageGet(storage, storageKey("currentUser"), null) ||
    storageGet(storage, storageKey("authUser"), null) ||
    storageGet(storage, storageKey("sessionUser"), null)
  );
}

export function loadSession({ state, storage, dom, events, setState } = {}) {
  const savedToken = normalizeToken(readStoredToken(storage));
  const storedUser = savedToken ? normalizeUserSafe(readStoredUser(storage)) : null;
  const usableStoredUser = usableUser(storedUser) ? storedUser : null;

  const sessionId = storageGet(storage, storageKey("sessionId"), null);
  const sessionUserId = storageGet(storage, storageKey("sessionUserId"), null);

  const preview = {
    ...object(state),
    token: savedToken,
    accessToken: savedToken,
    access_token: savedToken,
    user: usableStoredUser,
    sessionId: sessionId || null,
    sessionUserId: sessionUserId || null,
  };

  const authPatch = buildAuthPatch(preview, {
    forceUnauthenticated: !savedToken || !usableStoredUser,
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
    removeStorageKeys(storage, USER_STORAGE_KEYS);
    removeStorageKeys(storage, ACCESS_TOKEN_KEYS);
    clearAuxValues(storage);
  }

  if (savedToken && !usableStoredUser) {
    removeStorageKeys(storage, USER_STORAGE_KEYS);
    persistAccessToken(storage, savedToken);
  }

  const userTheme = authPatch.authenticated ? themeFromUser(authPatch.user) : null;

  if (userTheme === "light" || userTheme === "dark") {
    commitState({
      state,
      setState,
      patch: {
        theme: userTheme,
        themeMode: state?.themeMode || userTheme,
      },
      options: { source: "core-session:loadSession:userTheme" },
    });

    storageSet(storage, storageKey("theme"), userTheme);
    applyThemeDom({ dom, theme: userTheme, themeMode: state?.themeMode || userTheme });
  }

  const snapshot = sessionSnapshot(state, "loadSession");

  emit(events, SESSION_EVENTS.sessionLoaded, snapshot);
  emit(events, SESSION_EVENTS.sessionState, snapshot);

  return state;
}

/* =========================================================
   UI SETTERS
========================================================= */

export function setTheme({ dom, storage, events, setState, theme = config.defaultTheme, themeMode = "" } = {}) {
  const normalizedMode = themeMode
    ? normalizeThemeMode(themeMode)
    : VALID_THEME_MODES.includes(theme)
      ? normalizeThemeMode(theme)
      : "";

  const normalizedTheme = normalizedMode ? themeFromMode(normalizedMode) : normalizeTheme(theme);
  const finalMode = normalizedMode || normalizedTheme;

  setStateSafe(setState, { theme: normalizedTheme, themeMode: finalMode }, { source: "core-session:setTheme" });

  storageSet(storage, storageKey("theme"), normalizedTheme);
  storageSet(storage, storageKey("themeMode"), finalMode);
  storageSet(storage, storageKey("appearance"), finalMode);

  applyThemeDom({ dom, theme: normalizedTheme, themeMode: finalMode });

  try {
    if (isBrowser() && window.__ONION_THEME__?.set && themeMode) {
      window.__ONION_THEME__.set(finalMode, { source: "core-session:setTheme", emit: false });
    }
  } catch {}

  emit(events, SESSION_EVENTS.themeChange, {
    theme: normalizedTheme,
    themeMode: finalMode,
    changedAt: iso(),
  });

  return normalizedTheme;
}

export function setLang({ dom, storage, events, setState, lang = config.defaultLang } = {}) {
  const normalized = normalizeLang(lang);

  setStateSafe(setState, { lang: normalized }, { source: "core-session:setLang" });
  storageSet(storage, storageKey("lang"), normalized);
  storageSet(storage, storageKey("language"), normalized);
  storageSet(storage, storageKey("locale"), normalized);

  setAttribute(dom?.html, "lang", normalized);

  emit(events, SESSION_EVENTS.langChange, {
    lang: normalized,
    changedAt: iso(),
  });

  return normalized;
}

export function setSidebarOpen({ dom, storage, events, setState, value } = {}) {
  const next = Boolean(value);

  setStateSafe(setState, { sidebarOpen: next }, { source: "core-session:setSidebarOpen" });

  storageSet(storage, storageKey("sidebarOpen"), next);
  storageSet(storage, storageKey("sidebarCollapsed"), !next);

  toggleClass(dom?.body, "sidebar-open", next);
  toggleClass(dom?.body, "sidebar-collapsed", !next);

  toggleClass(dom?.sidebar, "open", next);
  toggleClass(dom?.sidebar, "collapsed", !next);
  toggleClass(dom?.sidebar, "is-open", next);
  toggleClass(dom?.sidebar, "is-collapsed", !next);

  setAriaExpanded(dom?.sidebarToggle, next);
  setAriaExpanded(dom?.sidebarMobileToggle, next);

  emit(events, SESSION_EVENTS.sidebarChange, {
    open: next,
    changedAt: iso(),
  });

  return next;
}

export function setLoading({ dom, events, setState, value } = {}) {
  const next = Boolean(value);

  setStateSafe(setState, { loading: next }, { source: "core-session:setLoading" });

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

  emit(events, SESSION_EVENTS.loadingChange, {
    loading: next,
    changedAt: iso(),
  });

  return next;
}

export function setError({ events, setState, cloneError, error = null } = {}) {
  const normalized = error ? cloneErrorSafe(cloneError, error) || error : null;

  setStateSafe(
    setState,
    {
      lastError: normalized,
      error: normalized,
      hasError: Boolean(normalized),
    },
    { source: "core-session:setError" }
  );

  emit(events, SESSION_EVENTS.error, {
    error: sanitize(normalized),
    hasError: Boolean(normalized),
    changedAt: iso(),
  });

  return normalized;
}

/* =========================================================
   BASE UI / DEBUG
========================================================= */

export function syncBaseUI({ setDocumentTitle, syncUserUI } = {}) {
  try {
    setDocumentTitle?.(config.appName);
  } catch {}

  try {
    syncUserUI?.();
  } catch {}

  return true;
}

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
    roles: array(state?.roles),

    username: state?.username || userUsername(state?.user),
    displayName: state?.authenticated ? userDisplayName(state?.user) : null,
    avatarUrl: state?.authenticated ? redact(userAvatarUrl(state?.user) || "") : null,

    currentResolvedUsername: state?.currentResolvedUsername || null,
    resolvedUsername: state?.resolvedUsername || null,

    route: canonicalPath(state?.route || DEFAULT_ROUTE),
    publicPath: redact(publicPath(state?.publicPath || state?.route || DEFAULT_ROUTE)),

    theme: state?.theme || config.defaultTheme || DEFAULT_THEME,
    themeMode: state?.themeMode || null,
    lang: state?.lang || config.defaultLang || DEFAULT_LANG,

    sidebarOpen: typeof state?.sidebarOpen === "boolean" ? state.sidebarOpen : null,

    hasUser: usableUser(state?.user),
    at: iso(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

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
