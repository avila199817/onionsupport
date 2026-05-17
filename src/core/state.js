/* =========================================================
   Onion SPA - Core State
   Archivo: src/core/state.js

   CORE STATE · SIMPLE
   - route/canonicalPath sin /@usuario, query ni hash
   - publicPath conserva /@usuario, query y hash
   - token + user usable => authenticated=true
   - token sin user => hasToken=true, authenticated=false
   - user sin token => authenticated=false, user=null
   - roles reales: admin / user
   - snapshots sin tokens reales por defecto
   - setState sólo cambia updatedAt/stateChangeCount si hay diff real
========================================================= */

import { config } from "./config.js";

import {
  cloneError,
  safeClone,
  normalizeUser,
  hasValidToken,
  isUsableUser as helperIsUsableUser,
  sanitizeUsername,
  getCurrentLocationCanonicalPath,
  getCurrentLocationPath,
  normalizeCanonicalPath,
  normalizePublicPath,
  normalizePath,
  getUserUsername,
  getUserDisplayName,
  getUserAvatarUrl,
  redactTokenInText,
} from "./helpers.js";

export const STATE_VERSION = "21.0.0-simple";

const DEFAULT_ROUTE = "/";
const DEFAULT_LANG = "es";
const DEFAULT_THEME = "dark";

const VALID_THEMES = Object.freeze(["dark", "light"]);
const VALID_THEME_MODES = Object.freeze(["dark", "light", "system"]);
const VALID_NETWORK_STATUSES = Object.freeze(["online", "offline", "unknown"]);
const VALID_LANG_RE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i;

const INTERNAL_STATE_PATCH_EVENT = "app:state:patched";

const TOKEN_KEYS = Object.freeze(["token", "accessToken", "access_token", "jwt", "idToken", "id_token", "bearer"]);
const USER_KEYS = Object.freeze(["user", "currentUser", "authUser", "sessionUser"]);
const SESSION_KEYS = Object.freeze(["session", "sessionData"]);

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

const SENSITIVE_STATE_KEYS = Object.freeze([
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "idToken",
  "id_token",
  "tempToken",
  "temp_token",
  "temporaryToken",
  "temporary_token",
  "mfaToken",
  "mfa_token",
  "twoFactorToken",
  "two_factor_token",
  "sessionId",
  "password",
  "otp",
  "code",
  "authorization",
  "authHeader",
]);

const REDACTABLE_PATH_KEYS = Object.freeze([
  "route",
  "canonicalPath",
  "publicPath",
  "lastRoute",
  "lastPublicPath",
  "lastRequestUrl",
  "bootInitialUrl",
  "bootInitialPath",
  "bootCanonicalPath",
  "bootProtectedInitialUrl",
  "bootProtectedInitialPath",
  "bootProtectedInitialPublicPath",
  "bootActivationInitialUrl",
  "bootActivationInitialPath",
  "bootActivationInitialPublicPath",
  "bootResetConfirmInitialUrl",
  "bootResetConfirmInitialPath",
  "bootResetConfirmInitialPublicPath",
]);

const BOOLEAN_KEYS = Object.freeze([
  "initialized",
  "booting",
  "ready",
  "appReady",
  "appFatal",
  "coreInitializing",
  "coreReady",
  "loading",
  "sidebarOpen",
  "shellVisible",
  "shellHidden",
  "routeShellHidden",
  "chromeVisible",
  "chromeHidden",
  "appShellVisible",
  "shellBusy",
  "authScreen",
  "hasError",
  "bootHasProtectedToken",
  "bootIsPublicTokenRoute",
  "bootIsActivation",
  "bootHasActivationToken",
  "bootIsResetConfirm",
  "bootHasResetToken",
  "initialRouteRendered",
  "bootNavigationHandled",
  "loginNavigationHandled",
  "postRestoreNavigationSkipped",
  "loginInProgress",
  "twoFactorPending",
  "restoring",
  "authRestoring",
  "sessionRestoring",
]);

const NULLABLE_STRING_KEYS = Object.freeze([
  "role",
  "rol",
  "userRole",
  "username",
  "currentResolvedUsername",
  "resolvedUsername",
  "lastRoute",
  "lastPublicPath",
  "lastRequestAt",
  "lastRequestUrl",
  "lastRequestMethod",
  "bootPhase",
  "mainPhase",
  "mainReason",
  "routeMode",
  "currentShellRoute",
  "currentShellCanonicalPath",
  "sessionId",
  "sessionUserId",
  "bootInitialUrl",
  "bootInitialPath",
  "bootCanonicalPath",
  "bootProtectedInitialUrl",
  "bootProtectedInitialPath",
  "bootProtectedInitialPublicPath",
  "bootProtectedRouteKey",
  "bootCapturedAt",
  "bootActivationInitialUrl",
  "bootActivationInitialPath",
  "bootActivationInitialPublicPath",
  "bootResetConfirmInitialUrl",
  "bootResetConfirmInitialPath",
  "bootResetConfirmInitialPublicPath",
]);

const NUMERIC_KEYS = Object.freeze(["coreInitCycle", "lastRequestStatus", "requestPending", "stateChangeCount"]);

const ADMIN_ALIASES = Object.freeze([
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
  "super-admin",
  "owner",
  "root",
]);

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;

  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

function isAnyObject(value) {
  return value !== null && typeof value === "object";
}

function hasOwn(obj, key) {
  try {
    return Object.prototype.hasOwnProperty.call(obj, key);
  } catch {
    return false;
  }
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;

  const clean = safeLower(value, "");
  if (["true", "yes", "si", "sí", "ok", "on", "enabled", "active"].includes(clean)) return true;
  if (["false", "no", "off", "disabled", "inactive"].includes(clean)) return false;

  return Boolean(fallback);
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  if (value === null || value === undefined) return [];
  return [value];
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function unique(values = []) {
  const output = [];
  const seen = new Set();

  for (const value of toArray(values).flat(Infinity)) {
    const clean = safeText(value, "");
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    output.push(clean);
  }

  return output;
}

function safeCloneValue(value, fallback = null) {
  try {
    const cloned = safeClone(value);
    if (cloned !== undefined) return cloned;
  } catch {}

  if (Array.isArray(value)) return value.map((item) => safeCloneValue(item, item));

  if (isObject(value)) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return { ...value };
    }
  }

  return value === undefined ? fallback : value;
}

function safeRedact(value = "") {
  const raw = safeText(value, "");
  if (!raw) return "";

  try {
    return redactTokenInText(raw);
  } catch {
    return raw;
  }
}

/* =========================================================
   TOKEN / USER
========================================================= */

function stripBearerPrefix(token = "") {
  return safeText(token, "").replace(/^Bearer\s+/i, "").trim();
}

function safeHasValidToken(token) {
  const clean = stripBearerPrefix(token);
  if (!clean) return false;

  try {
    return Boolean(hasValidToken(clean));
  } catch {
    return Boolean(clean && !/[\s\r\n\t]/.test(clean));
  }
}

function normalizeTokenValue(token) {
  const clean = stripBearerPrefix(token);
  return safeHasValidToken(clean) ? clean : null;
}

function safeNormalizeUser(user = null) {
  if (!user) return null;

  try {
    return normalizeUser(user);
  } catch {
    return isObject(user) ? user : null;
  }
}

function hasUsableUser(user = null) {
  const normalized = safeNormalizeUser(user);
  if (!normalized || typeof normalized !== "object") return false;

  try {
    if (typeof helperIsUsableUser === "function" && helperIsUsableUser(normalized) === false) return false;
  } catch {}

  if (
    normalized.active === false ||
    normalized.enabled === false ||
    normalized.isActive === false ||
    normalized.is_active === false ||
    normalized.isEnabled === false ||
    normalized.is_enabled === false ||
    normalized.disabled === true ||
    normalized.deleted === true ||
    normalized.blocked === true ||
    normalized.suspended === true ||
    normalized.banned === true ||
    normalized.archived === true ||
    normalized.revoked === true
  ) return false;

  const status = safeLower(normalized.status || normalized.estado || normalized.state || normalized.accountStatus || normalized.account_status || "", "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");

  if (["disabled", "inactive", "deleted", "blocked", "suspended", "banned", "archived", "revoked", "desactivado", "inactivo", "eliminado", "bloqueado", "suspendido"].includes(status)) return false;

  return USER_ID_KEYS.some((key) => Boolean(safeText(normalized?.[key], "")));
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

/* =========================================================
   PATHS
========================================================= */

function safeCanonicalPath(value = DEFAULT_ROUTE, fallback = DEFAULT_ROUTE) {
  try {
    return normalizeCanonicalPath(value || fallback || DEFAULT_ROUTE);
  } catch {
    return fallback || DEFAULT_ROUTE;
  }
}

function safePublicPath(value = DEFAULT_ROUTE, fallback = DEFAULT_ROUTE) {
  try {
    return normalizePublicPath(value || fallback || DEFAULT_ROUTE);
  } catch {}

  try {
    return normalizePath(value || fallback || DEFAULT_ROUTE);
  } catch {
    return fallback || DEFAULT_ROUTE;
  }
}

function safeLocationCanonicalPath() {
  try {
    return safeCanonicalPath(getCurrentLocationCanonicalPath(), DEFAULT_ROUTE);
  } catch {
    return DEFAULT_ROUTE;
  }
}

function safeLocationPublicPath(fallback = DEFAULT_ROUTE) {
  try {
    return safePublicPath(getCurrentLocationPath(), fallback);
  } catch {
    return fallback || DEFAULT_ROUTE;
  }
}

function extractUsernameFromPublicPath(publicPath = DEFAULT_ROUTE) {
  const match = String(publicPath || "").match(/^\/@([^/]+)(?:\/|$)/i);

  try {
    return sanitizeUsername(match?.[1] || "") || null;
  } catch {
    return null;
  }
}

/* =========================================================
   ROLES · SOLO ADMIN / USER
========================================================= */

function normalizeRoleKey(value = "") {
  return safeLower(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "")
    .trim();
}

function normalizeRole(value = "") {
  const role = normalizeRoleKey(value);
  if (!role) return null;
  return ADMIN_ALIASES.includes(role) ? "admin" : "user";
}

function normalizeRoleList(value = []) {
  const roles = [];

  const push = (item) => {
    if (!item) return;

    if (Array.isArray(item)) {
      item.forEach(push);
      return;
    }

    if (isObject(item)) {
      for (const [key, enabled] of Object.entries(item)) {
        if (safeBool(enabled, false)) push(key);
      }
      return;
    }

    if (typeof item === "string") {
      item.split(/[,\s|]+/g).map(normalizeRole).filter(Boolean).forEach((role) => roles.push(role));
      return;
    }

    const role = normalizeRole(item);
    if (role) roles.push(role);
  };

  push(value);

  const uniqueRoles = unique(roles).filter((role) => role === "admin" || role === "user");
  return uniqueRoles.includes("admin") ? ["admin"] : uniqueRoles.includes("user") ? ["user"] : [];
}

function resolveRole(user = null, explicitRole = "") {
  const role = normalizeRole(
    explicitRole ||
      user?.role ||
      user?.rol ||
      user?.userRole ||
      user?.user_role ||
      user?.type ||
      user?.userType ||
      user?.user_type ||
      user?.perfil ||
      user?.profile?.role ||
      user?.profile?.rol ||
      user?.raw?.role ||
      user?.raw?.rol ||
      ""
  );

  return role || "user";
}

function resolveRoles(user = null, explicitRoles = []) {
  const roles = normalizeRoleList([explicitRoles, user?.roles, user?.roleList, user?.role_list, user?.permissions?.roles, resolveRole(user)]);
  return roles.includes("admin") ? ["admin"] : ["user"];
}

function roleFlags(roles = []) {
  const set = new Set(normalizeRoleList(roles));

  return {
    isAdmin: set.has("admin"),
    isUser: set.has("user"),
    isSupport: false,
    isManager: false,
    isClient: false,
  };
}

function resolveUsernameFromUser(user = null) {
  try {
    return sanitizeUsername(safeGetUserUsername(user) || user?.username || user?.userName || user?.user_name || user?.nick || user?.alias || user?.login || user?.slug || user?.email || "") || null;
  } catch {
    return null;
  }
}

function resolveCurrentResolvedUsername({ user = null, publicPath = DEFAULT_ROUTE, previous = null, authenticated = false } = {}) {
  if (!authenticated) return null;
  return extractUsernameFromPublicPath(publicPath) || resolveUsernameFromUser(user) || sanitizeUsername(previous || "") || null;
}

/* =========================================================
   AUTH
========================================================= */

export function computeAuthenticated(nextUser, nextToken) {
  const token = normalizeTokenValue(nextToken);
  const user = safeNormalizeUser(nextUser);

  if (!token) return false;
  if (!hasUsableUser(user)) return false;

  return true;
}

function buildAuthPatch(source = {}, options = {}) {
  const root = source && typeof source === "object" ? source : {};
  const forceUnauthenticated = options?.forceUnauthenticated === true;
  const token = normalizeTokenValue(root.token || root.accessToken || root.access_token || null);
  const user = root.user ? safeNormalizeUser(root.user) : null;

  if (!token || forceUnauthenticated) {
    return {
      authenticated: false,
      hasToken: false,
      token: null,
      accessToken: null,
      access_token: null,
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
      isSupport: false,
      isManager: false,
      isClient: false,
    };
  }

  if (!computeAuthenticated(user, token)) {
    return {
      authenticated: false,
      hasToken: true,
      token,
      accessToken: token,
      access_token: token,
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
      isSupport: false,
      isManager: false,
      isClient: false,
    };
  }

  const role = resolveRole(user);
  const roles = resolveRoles(user, root.roles);
  const flags = roleFlags(roles);
  const currentResolvedUsername = resolveCurrentResolvedUsername({ user, publicPath: root.publicPath || root.route || DEFAULT_ROUTE, previous: root.currentResolvedUsername || root.resolvedUsername, authenticated: true });

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
    roles,
    username: resolveUsernameFromUser(user),
    ...flags,
    currentResolvedUsername,
    resolvedUsername: currentResolvedUsername,
  };
}

/* =========================================================
   NORMALIZERS
========================================================= */

function normalizeTheme(theme = DEFAULT_THEME) {
  const value = safeLower(theme, DEFAULT_THEME);
  return VALID_THEMES.includes(value) ? value : DEFAULT_THEME;
}

function normalizeThemeMode(themeMode = "") {
  const value = safeLower(themeMode, "");
  if (!value) return "";
  if (["auto", "automatic", "browser", "os", "device", "system-preference", "system_preference"].includes(value)) return "system";
  return VALID_THEME_MODES.includes(value) ? value : "";
}

function normalizeLang(lang = DEFAULT_LANG) {
  const value = safeLower(lang, DEFAULT_LANG).replace(/_/g, "-");

  if (["spa", "spanish", "castellano", "español", "espanol"].includes(value)) return "es";
  if (["eng", "english"].includes(value)) return "en";
  if (["cat", "catalan", "català", "catalan", "catala"].includes(value)) return "ca";

  return VALID_LANG_RE.test(value) ? value : DEFAULT_LANG;
}

function normalizeNetworkStatus(value = "") {
  const clean = safeLower(value, "");
  return VALID_NETWORK_STATUSES.includes(clean) ? clean : "";
}

function normalizeHttpMethod(value = "") {
  const method = safeText(value, "").toUpperCase();
  return method || null;
}

function normalizeError(value = null) {
  if (!value) return null;

  try {
    return cloneError(value);
  } catch {
    if (value instanceof Error) return { name: value.name || "Error", message: safeRedact(value.message || "Error") };
    return sanitizeSnapshotDeep(value);
  }
}

function resolveOnlineState() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") return navigator.onLine !== false;
  } catch {}
  return null;
}

function networkPatchFromOnline(value) {
  const online = value === null ? null : Boolean(value);
  const offline = online === null ? null : !online;

  return {
    online,
    offline,
    networkOnline: online,
    networkOffline: offline,
    networkStatus: online === null ? "unknown" : online ? "online" : "offline",
  };
}

function networkPatchFromOffline(value) {
  const offline = value === null ? null : Boolean(value);
  const online = offline === null ? null : !offline;

  return {
    online,
    offline,
    networkOnline: online,
    networkOffline: offline,
    networkStatus: online === null ? "unknown" : online ? "online" : "offline",
  };
}

function networkPatchFromStatus(value) {
  const status = normalizeNetworkStatus(value);
  if (status === "online") return networkPatchFromOnline(true);
  if (status === "offline") return networkPatchFromOnline(false);
  if (status === "unknown") return networkPatchFromOnline(null);
  return {};
}

/* =========================================================
   DIFF / SANITIZE
========================================================= */

function sanitizePatchInput(patch = {}) {
  const output = {};
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return output;

  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) output[key] = value;
  }

  return output;
}

function stableStringify(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return String(value);

  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean" || type === "bigint") return `${type}:${String(value)}`;
  if (type === "function") return `function:${value.name || "anonymous"}`;
  if (value instanceof Date) return `date:${value.toISOString()}`;
  if (value instanceof Error) return `error:${value.name}:${value.message}`;
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item, seen)).join(",")}]`;

  if (typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${key}:${stableStringify(value[key], seen)}`).join("|")}}`;
  }

  try {
    return String(value);
  } catch {
    return "[unserializable]";
  }
}

function valuesEqual(previous, next) {
  if (Object.is(previous, next)) return true;

  if ((previous !== null && typeof previous === "object") || (next !== null && typeof next === "object")) {
    try {
      return stableStringify(previous) === stableStringify(next);
    } catch {
      return false;
    }
  }

  return false;
}

function getChangedKeys(state, patch = {}) {
  return Object.keys(patch).filter((key) => !valuesEqual(state?.[key], patch[key]));
}

function compactKeys(keys = []) {
  return Array.from(new Set(keys.filter(Boolean)));
}

/* =========================================================
   PATCH NORMALIZATION
========================================================= */

function normalizeSessionAliases(patch) {
  if (!hasOwn(patch, "session")) {
    for (const key of SESSION_KEYS) {
      if (key !== "session" && hasOwn(patch, key)) {
        patch.session = patch[key];
        break;
      }
    }
  }

  if (!hasOwn(patch, "session")) return patch;

  const session = patch.session || null;
  patch.session = session;
  patch.sessionData = session;

  if (session && typeof session === "object") {
    if (!hasOwn(patch, "user")) patch.user = session.user || session.currentUser || session.authUser || session.sessionUser || session.data?.user || session.payload?.user || null;
    if (!hasOwn(patch, "token")) patch.token = session.token || session.accessToken || session.access_token || session.jwt || null;
    if (!hasOwn(patch, "refreshToken") && !hasOwn(patch, "refresh_token")) patch.refreshToken = session.refreshToken || session.refresh_token || null;
    if (!hasOwn(patch, "tempToken") && !hasOwn(patch, "temp_token")) patch.tempToken = session.tempToken || session.temp_token || session.temporaryToken || session.temporary_token || session.twoFactorToken || session.two_factor_token || session.mfaToken || session.mfa_token || null;
    if (!hasOwn(patch, "sessionId")) patch.sessionId = session.sessionId || session.session_id || session.id || null;
    if (!hasOwn(patch, "sessionUserId")) patch.sessionUserId = session.sessionUserId || session.session_user_id || session.userId || session.user_id || null;
  }

  return patch;
}

function normalizeTokenAliases(patch) {
  if (patch.hasToken === false && !TOKEN_KEYS.some((key) => hasOwn(patch, key))) patch.token = null;

  if (!hasOwn(patch, "token")) {
    for (const key of TOKEN_KEYS) {
      if (key !== "token" && hasOwn(patch, key)) {
        patch.token = patch[key];
        break;
      }
    }
  }

  if (hasOwn(patch, "token")) {
    const token = normalizeTokenValue(patch.token);
    patch.token = token;
    patch.accessToken = token;
    patch.access_token = token;
  }

  return patch;
}

function normalizeAuxTokenAliases(patch) {
  if (hasOwn(patch, "refreshToken") || hasOwn(patch, "refresh_token")) {
    const refreshToken = normalizeTokenValue(patch.refreshToken || patch.refresh_token);
    patch.refreshToken = refreshToken;
    patch.refresh_token = refreshToken;
  }

  if (hasOwn(patch, "tempToken") || hasOwn(patch, "temp_token")) {
    const tempToken = normalizeTokenValue(patch.tempToken || patch.temp_token);
    patch.tempToken = tempToken;
    patch.temp_token = tempToken;
  }

  return patch;
}

function normalizeUserAliases(patch) {
  if (!hasOwn(patch, "user")) {
    for (const key of USER_KEYS) {
      if (key !== "user" && hasOwn(patch, key)) {
        patch.user = patch[key];
        break;
      }
    }
  }

  if (hasOwn(patch, "user")) {
    const user = safeNormalizeUser(patch.user);
    patch.user = user;
    patch.currentUser = user;
    patch.authUser = user;
    patch.sessionUser = user;
  }

  return patch;
}

function normalizeRoutePatch(state, patch) {
  const routeWasProvided = hasOwn(patch, "route") || hasOwn(patch, "canonicalPath");
  const publicPathWasProvided = hasOwn(patch, "publicPath");

  if (!hasOwn(patch, "route") && hasOwn(patch, "canonicalPath")) patch.route = patch.canonicalPath;

  if (routeWasProvided) {
    const nextRoute = safeCanonicalPath(patch.route || patch.canonicalPath, state.route || DEFAULT_ROUTE);
    if (nextRoute !== state.route && !hasOwn(patch, "lastRoute")) patch.lastRoute = state.route || null;
    patch.route = nextRoute;
    patch.canonicalPath = nextRoute;
  }

  if (publicPathWasProvided) {
    const nextPublicPath = safePublicPath(patch.publicPath, state.publicPath || state.route || DEFAULT_ROUTE);
    if (nextPublicPath !== state.publicPath && !hasOwn(patch, "lastPublicPath")) patch.lastPublicPath = state.publicPath || null;
    patch.publicPath = nextPublicPath;
  }

  if (hasOwn(patch, "lastRoute")) patch.lastRoute = patch.lastRoute ? safeCanonicalPath(patch.lastRoute, DEFAULT_ROUTE) : null;
  if (hasOwn(patch, "lastPublicPath")) patch.lastPublicPath = patch.lastPublicPath ? safePublicPath(patch.lastPublicPath, DEFAULT_ROUTE) : null;

  if (routeWasProvided && !publicPathWasProvided) {
    const currentPublicCanonical = state.publicPath ? safeCanonicalPath(state.publicPath, state.route || DEFAULT_ROUTE) : "";
    const preserveCurrentPublic = Boolean(state.publicPath && currentPublicCanonical === patch.route);
    patch.publicPath = preserveCurrentPublic ? safePublicPath(state.publicPath, patch.route) : safePublicPath(patch.route, patch.route);
  }

  if (publicPathWasProvided && !routeWasProvided) {
    patch.route = safeCanonicalPath(patch.publicPath, state.route || DEFAULT_ROUTE);
    patch.canonicalPath = patch.route;
  }

  if (!patch.route && !state.route) {
    patch.route = DEFAULT_ROUTE;
    patch.canonicalPath = DEFAULT_ROUTE;
  }

  if (!patch.publicPath && !state.publicPath) patch.publicPath = safePublicPath(patch.route || state.route || DEFAULT_ROUTE, DEFAULT_ROUTE);

  return patch;
}

function normalizeBootPatch(patch) {
  for (const key of ["bootInitialPath", "bootCanonicalPath", "bootProtectedInitialPath", "bootProtectedInitialPublicPath", "bootActivationInitialPath", "bootActivationInitialPublicPath", "bootResetConfirmInitialPath", "bootResetConfirmInitialPublicPath"]) {
    if (hasOwn(patch, key)) patch[key] = patch[key] ? safePublicPath(patch[key], DEFAULT_ROUTE) : "";
  }

  for (const key of ["bootInitialUrl", "bootProtectedInitialUrl", "bootActivationInitialUrl", "bootResetConfirmInitialUrl"]) {
    if (hasOwn(patch, key)) patch[key] = safeText(patch[key], "");
  }

  for (const key of ["bootIsPublicTokenRoute", "bootIsActivation", "bootHasActivationToken", "bootIsResetConfirm", "bootHasResetToken", "bootHasProtectedToken"]) {
    if (hasOwn(patch, key)) patch[key] = Boolean(patch[key]);
  }

  if (hasOwn(patch, "bootHasActivationToken") || hasOwn(patch, "bootHasResetToken")) patch.bootHasProtectedToken = Boolean(patch.bootHasProtectedToken || patch.bootHasActivationToken || patch.bootHasResetToken);
  if (hasOwn(patch, "bootIsActivation") || hasOwn(patch, "bootIsResetConfirm")) patch.bootIsPublicTokenRoute = Boolean(patch.bootIsPublicTokenRoute || patch.bootIsActivation || patch.bootIsResetConfirm);

  return patch;
}

function normalizeNetworkPatch(patch) {
  if (hasOwn(patch, "online")) Object.assign(patch, networkPatchFromOnline(patch.online));
  if (hasOwn(patch, "offline")) Object.assign(patch, networkPatchFromOffline(patch.offline));
  if (hasOwn(patch, "networkStatus")) Object.assign(patch, networkPatchFromStatus(patch.networkStatus));
  return patch;
}

function normalizePrimitivePatch(patch) {
  if (hasOwn(patch, "theme")) patch.theme = normalizeTheme(patch.theme);
  if (hasOwn(patch, "themeMode")) patch.themeMode = normalizeThemeMode(patch.themeMode) || null;
  if (hasOwn(patch, "lang")) patch.lang = normalizeLang(patch.lang);

  for (const key of BOOLEAN_KEYS) {
    if (hasOwn(patch, key)) patch[key] = Boolean(patch[key]);
  }

  for (const key of NULLABLE_STRING_KEYS) {
    if (hasOwn(patch, key)) patch[key] = patch[key] === null ? null : safeText(patch[key], "") || null;
  }

  for (const key of NUMERIC_KEYS) {
    if (hasOwn(patch, key)) {
      const number = safeNumber(patch[key], 0);
      patch[key] = key === "requestPending" ? Math.max(0, number) : number;
    }
  }

  if (hasOwn(patch, "roles")) patch.roles = normalizeRoleList(patch.roles);

  for (const key of ["role", "rol", "userRole"]) {
    if (hasOwn(patch, key)) {
      const role = normalizeRole(patch[key]);
      patch.role = role;
      patch.rol = role;
      patch.userRole = role;
    }
  }

  return patch;
}

function normalizeShellPatch(patch) {
  if (hasOwn(patch, "shellHidden") && !hasOwn(patch, "shellVisible")) patch.shellVisible = !Boolean(patch.shellHidden);
  if (hasOwn(patch, "shellVisible") && !hasOwn(patch, "shellHidden")) patch.shellHidden = !Boolean(patch.shellVisible);
  if (hasOwn(patch, "appShellVisible") && !hasOwn(patch, "chromeVisible")) patch.chromeVisible = Boolean(patch.appShellVisible);
  if (hasOwn(patch, "chromeVisible") && !hasOwn(patch, "appShellVisible")) patch.appShellVisible = Boolean(patch.chromeVisible);
  if (hasOwn(patch, "chromeHidden") && !hasOwn(patch, "chromeVisible")) patch.chromeVisible = !Boolean(patch.chromeHidden);
  if (hasOwn(patch, "chromeVisible") && !hasOwn(patch, "chromeHidden")) patch.chromeHidden = !Boolean(patch.chromeVisible);
  return patch;
}

function normalizeErrorPatch(patch) {
  if (hasOwn(patch, "error")) {
    patch.error = normalizeError(patch.error);
    patch.lastError = patch.error;
    patch.hasError = Boolean(patch.error);
  }

  if (hasOwn(patch, "lastError")) {
    patch.lastError = normalizeError(patch.lastError);
    patch.error = patch.lastError;
    patch.hasError = Boolean(patch.lastError);
  }

  if (hasOwn(patch, "hasError") && patch.hasError === false) {
    patch.error = null;
    patch.lastError = null;
  }

  return patch;
}

function normalizeRequestPatch(patch) {
  if (hasOwn(patch, "lastRequestUrl")) patch.lastRequestUrl = safeText(patch.lastRequestUrl, "") || null;
  if (hasOwn(patch, "lastRequestMethod")) patch.lastRequestMethod = normalizeHttpMethod(patch.lastRequestMethod);
  if (hasOwn(patch, "lastRequestStatus")) {
    const status = safeNumber(patch.lastRequestStatus, 0);
    patch.lastRequestStatus = status > 0 ? status : null;
  }
  if (hasOwn(patch, "requestPending")) patch.requestPending = Math.max(0, safeNumber(patch.requestPending, 0));
  return patch;
}

function shouldRecomputeAuth(patch) {
  return Boolean(
    TOKEN_KEYS.some((key) => hasOwn(patch, key)) ||
      USER_KEYS.some((key) => hasOwn(patch, key)) ||
      hasOwn(patch, "authenticated") ||
      hasOwn(patch, "hasToken") ||
      hasOwn(patch, "role") ||
      hasOwn(patch, "rol") ||
      hasOwn(patch, "userRole") ||
      hasOwn(patch, "roles") ||
      hasOwn(patch, "username") ||
      hasOwn(patch, "publicPath") ||
      hasOwn(patch, "route") ||
      hasOwn(patch, "canonicalPath")
  );
}

function normalizeAuthPatch(state, patch, options = {}) {
  const forceUnauthenticated = options?.forceUnauthenticated === true || patch.hasToken === false || (hasOwn(patch, "token") && patch.token === null);

  if (!shouldRecomputeAuth(patch) && !forceUnauthenticated) return patch;

  const preview = { ...state, ...patch };
  Object.assign(patch, buildAuthPatch(preview, { forceUnauthenticated }));
  return patch;
}

function normalizeStatePatch(state, patch = {}, options = {}) {
  const normalized = sanitizePatchInput(patch);

  normalizeSessionAliases(normalized);
  normalizeTokenAliases(normalized);
  normalizeAuxTokenAliases(normalized);
  normalizeUserAliases(normalized);
  normalizeRoutePatch(state, normalized);
  normalizeBootPatch(normalized);
  normalizeNetworkPatch(normalized);
  normalizePrimitivePatch(normalized);
  normalizeShellPatch(normalized);
  normalizeErrorPatch(normalized);
  normalizeRequestPatch(normalized);
  normalizeAuthPatch(state, normalized, options);

  return normalized;
}

/* =========================================================
   STATE FACTORY
========================================================= */

export function createInitialState(input = {}) {
  const localConfig = input?.config || input || config || {};
  const route = safeLocationCanonicalPath();
  const publicPath = safeLocationPublicPath(route);
  const lang = normalizeLang(localConfig?.defaultLang || localConfig?.i18n?.defaultLang || localConfig?.lang || DEFAULT_LANG);
  const theme = normalizeTheme(localConfig?.defaultTheme || localConfig?.ui?.defaultTheme || localConfig?.theme || DEFAULT_THEME);
  const themeMode = normalizeThemeMode(localConfig?.defaultThemeMode || localConfig?.themeMode || localConfig?.appearance || "") || null;
  const online = resolveOnlineState();
  const createdAt = safeIsoDate();

  return {
    __version: STATE_VERSION,

    initialized: false,
    booting: false,
    ready: false,
    appReady: false,
    appFatal: false,

    coreInitializing: false,
    coreReady: false,
    loading: true,

    bootPhase: null,
    mainPhase: null,
    mainReason: null,
    mainUpdatedAt: null,

    coreInitCycle: 0,
    coreVersion: STATE_VERSION,
    coreReadyAt: null,
    coreErrorAt: null,

    route,
    canonicalPath: route,
    publicPath,
    lastRoute: null,
    lastPublicPath: null,

    user: null,
    currentUser: null,
    authUser: null,
    sessionUser: null,

    token: null,
    accessToken: null,
    access_token: null,
    refreshToken: null,
    refresh_token: null,
    tempToken: null,
    temp_token: null,

    hasToken: false,
    authenticated: false,

    role: null,
    rol: null,
    userRole: null,
    roles: [],
    username: null,

    isAdmin: false,
    isUser: false,
    isSupport: false,
    isManager: false,
    isClient: false,

    currentResolvedUsername: null,
    resolvedUsername: null,

    session: null,
    sessionData: null,
    sessionId: null,
    sessionUserId: null,

    lang,
    theme,
    themeMode,

    sidebarOpen: true,

    shellVisible: true,
    shellHidden: false,
    routeShellHidden: false,
    chromeVisible: true,
    chromeHidden: false,
    appShellVisible: true,
    shellBusy: false,
    authScreen: false,
    routeMode: "boot",
    currentShellRoute: null,
    currentShellCanonicalPath: null,

    online,
    offline: online === null ? null : !online,
    networkOnline: online,
    networkOffline: online === null ? null : !online,
    networkStatus: online === null ? "unknown" : online ? "online" : "offline",

    lastError: null,
    error: null,
    hasError: false,

    lastRequestAt: null,
    lastRequestUrl: null,
    lastRequestMethod: null,
    lastRequestStatus: null,
    requestPending: 0,

    bootInitialUrl: "",
    bootInitialPath: "",
    bootCanonicalPath: "",
    bootProtectedInitialUrl: "",
    bootProtectedInitialPath: "",
    bootProtectedInitialPublicPath: "",
    bootProtectedRouteKey: "",
    bootIsPublicTokenRoute: false,
    bootHasProtectedToken: false,
    bootCapturedAt: "",

    bootIsActivation: false,
    bootHasActivationToken: false,
    bootActivationInitialUrl: "",
    bootActivationInitialPath: "",
    bootActivationInitialPublicPath: "",

    bootIsResetConfirm: false,
    bootHasResetToken: false,
    bootResetConfirmInitialUrl: "",
    bootResetConfirmInitialPath: "",
    bootResetConfirmInitialPublicPath: "",

    initialRouteRendered: false,
    bootNavigationHandled: false,
    loginNavigationHandled: false,
    postRestoreNavigationSkipped: false,
    loginInProgress: false,
    twoFactorPending: false,
    restoring: false,
    authRestoring: false,
    sessionRestoring: false,

    createdAt,
    updatedAt: createdAt,
    stateChangeCount: 0,
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

function sanitizeSnapshotDeep(value, depth = 0, seen = new WeakSet(), keyHint = "") {
  if (depth > 8) return "[MaxDepth]";

  if (/token|secret|password|authorization|bearer|credential|otp|code/i.test(keyHint)) return value ? "***" : value;
  if (typeof value === "string") return safeRedact(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[Function]";
  if (value instanceof Error) return normalizeError(value);

  if (Array.isArray(value)) return value.slice(0, 200).map((item) => sanitizeSnapshotDeep(item, depth + 1, seen, keyHint));

  if (isAnyObject(value)) {
    try {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    } catch {}

    const output = {};
    for (const [key, item] of Object.entries(value)) output[key] = sanitizeSnapshotDeep(item, depth + 1, seen, key);
    return output;
  }

  return String(value);
}

function sanitizeSnapshotValue(key, value, options = {}) {
  const includeToken = options?.includeToken === true || options?.unsafeIncludeToken === true;

  if (SENSITIVE_STATE_KEYS.includes(key)) {
    if (includeToken && (key === "token" || key === "accessToken" || key === "access_token")) return value || null;
    return value ? "***" : null;
  }

  if (SESSION_KEYS.includes(key)) return value ? sanitizeSnapshotDeep(value, 0, new WeakSet(), key) : null;
  if (REDACTABLE_PATH_KEYS.includes(key)) return safeRedact(value || "");
  if (key === "error" || key === "lastError") return normalizeError(value);
  if (USER_KEYS.includes(key)) return value ? sanitizeSnapshotDeep(value) : null;

  return sanitizeSnapshotDeep(value, 0, new WeakSet(), key);
}

export function cloneState(state, options = {}) {
  const opts = isObject(options) ? options : {};
  const source = state && typeof state === "object" ? state : {};
  const raw = safeCloneValue(source, {}) || {};
  const snapshot = {};

  for (const [key, value] of Object.entries(raw)) snapshot[key] = sanitizeSnapshotValue(key, value, opts);

  const token = source.token || source.accessToken || source.access_token || null;
  const user = source.user || source.currentUser || source.authUser || source.sessionUser || null;
  const hasToken = safeHasValidToken(token);
  const authenticated = computeAuthenticated(user, token);
  const cleanToken = normalizeTokenValue(token);

  snapshot.__version = source.__version || STATE_VERSION;

  snapshot.user = authenticated && user ? sanitizeSnapshotDeep(user) : null;
  snapshot.currentUser = authenticated && user ? sanitizeSnapshotDeep(user) : null;
  snapshot.authUser = authenticated && user ? sanitizeSnapshotDeep(user) : null;
  snapshot.sessionUser = authenticated && user ? sanitizeSnapshotDeep(user) : null;

  snapshot.token = opts.includeToken === true || opts.unsafeIncludeToken === true ? cleanToken : null;
  snapshot.accessToken = opts.includeToken === true || opts.unsafeIncludeToken === true ? cleanToken : null;
  snapshot.access_token = opts.includeToken === true || opts.unsafeIncludeToken === true ? cleanToken : null;

  snapshot.hasToken = hasToken;
  snapshot.authenticated = authenticated;

  snapshot.role = authenticated ? source.role || null : null;
  snapshot.rol = authenticated ? source.rol || source.role || null : null;
  snapshot.userRole = authenticated ? source.userRole || source.role || null : null;
  snapshot.roles = authenticated ? normalizeRoleList(source.roles) : [];
  snapshot.username = authenticated ? source.username || null : null;
  snapshot.currentResolvedUsername = authenticated ? source.currentResolvedUsername || null : null;
  snapshot.resolvedUsername = authenticated ? source.resolvedUsername || null : null;

  snapshot.isAdmin = Boolean(authenticated && source.isAdmin);
  snapshot.isUser = Boolean(authenticated && source.isUser);
  snapshot.isSupport = false;
  snapshot.isManager = false;
  snapshot.isClient = false;

  snapshot.lastError = normalizeError(source.lastError || source.error);
  snapshot.error = normalizeError(source.error || source.lastError);

  snapshot.route = safeCanonicalPath(source.route || DEFAULT_ROUTE);
  snapshot.canonicalPath = safeCanonicalPath(source.canonicalPath || source.route || DEFAULT_ROUTE);
  snapshot.publicPath = safeRedact(safePublicPath(source.publicPath || source.route || DEFAULT_ROUTE));
  snapshot.lastRoute = source.lastRoute ? safeCanonicalPath(source.lastRoute, DEFAULT_ROUTE) : null;
  snapshot.lastPublicPath = source.lastPublicPath ? safeRedact(safePublicPath(source.lastPublicPath, DEFAULT_ROUTE)) : null;
  snapshot.lastRequestUrl = safeRedact(source.lastRequestUrl || "");

  return snapshot;
}

export function getState(state, options = {}) {
  return cloneState(state, options);
}

export const getStateBase = getState;

function clonePatchForEvent(patch = {}) {
  const cloned = safeCloneValue(patch || {}, {}) || {};

  for (const key of SENSITIVE_STATE_KEYS) {
    if (hasOwn(cloned, key)) cloned[key] = cloned[key] ? "***" : null;
  }

  for (const key of REDACTABLE_PATH_KEYS) {
    if (hasOwn(cloned, key)) cloned[key] = safeRedact(cloned[key] || "");
  }

  for (const key of USER_KEYS) {
    if (hasOwn(cloned, key)) cloned[key] = cloned[key] ? sanitizeSnapshotDeep(cloned[key]) : null;
  }

  for (const key of SESSION_KEYS) {
    if (hasOwn(cloned, key)) cloned[key] = cloned[key] ? sanitizeSnapshotDeep(cloned[key], 0, new WeakSet(), key) : null;
  }

  if (hasOwn(cloned, "error")) cloned.error = normalizeError(cloned.error);
  if (hasOwn(cloned, "lastError")) cloned.lastError = normalizeError(cloned.lastError);

  return cloned;
}

/* =========================================================
   WRITE STATE
========================================================= */

export function setStateBase(state, patch = {}, options = {}) {
  if (!state || typeof state !== "object") throw new Error("Core state inválido.");
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return cloneState(state);

  const opts = isObject(options) ? options : {};
  const normalized = normalizeStatePatch(state, patch, opts);
  const changedKeys = getChangedKeys(state, normalized);

  if (!changedKeys.length) return cloneState(state);

  const previousState = cloneState(state);
  normalized.updatedAt = safeIsoDate();
  normalized.stateChangeCount = safeNumber(state.stateChangeCount, 0) + 1;

  const finalChangedKeys = compactKeys([...changedKeys, "updatedAt", "stateChangeCount"]);

  Object.assign(state, normalized);

  const nextSnapshot = cloneState(state);

  if (opts.emitInternal === true && opts.silent !== true && opts.emit !== false) {
    try {
      opts.events?.emit?.(INTERNAL_STATE_PATCH_EVENT, {
        state: nextSnapshot,
        patch: clonePatchForEvent(normalized),
        previousState,
        changedKeys: finalChangedKeys,
        source: opts.source || "core:state",
      });
    } catch {}
  }

  return nextSnapshot;
}

export function setState({ state, events, patch = {}, options = {} } = {}) {
  return setStateBase(state, patch, { ...(isObject(options) ? options : {}), events });
}

/* =========================================================
   DEBUG
========================================================= */

export function getStateDebugSnapshot(state) {
  const source = state && typeof state === "object" ? state : {};
  const token = source.token || source.accessToken || source.access_token || null;
  const user = source.user || source.currentUser || source.authUser || source.sessionUser || null;
  const hasToken = safeHasValidToken(token);
  const authenticated = computeAuthenticated(user, token);
  const roles = authenticated ? normalizeRoleList(source.roles || user?.roles || []) : [];
  const flags = roleFlags(roles);

  return {
    version: source.__version || STATE_VERSION,

    initialized: Boolean(source.initialized),
    booting: Boolean(source.booting),
    ready: Boolean(source.ready),
    appReady: Boolean(source.appReady),
    appFatal: Boolean(source.appFatal),
    coreInitializing: Boolean(source.coreInitializing),
    coreReady: Boolean(source.coreReady),
    loading: Boolean(source.loading),

    bootPhase: source.bootPhase || "",
    mainPhase: source.mainPhase || "",
    mainReason: source.mainReason || "",
    coreInitCycle: safeNumber(source.coreInitCycle, 0),

    route: safeCanonicalPath(source.route || DEFAULT_ROUTE),
    canonicalPath: safeCanonicalPath(source.canonicalPath || source.route || DEFAULT_ROUTE),
    publicPath: safeRedact(safePublicPath(source.publicPath || source.route || DEFAULT_ROUTE)),
    lastRoute: source.lastRoute || null,
    lastPublicPath: safeRedact(source.lastPublicPath || "") || null,

    authenticated,
    hasToken,
    hasUsableUser: hasUsableUser(user),

    role: authenticated ? source.role || null : null,
    roles,
    username: authenticated ? source.username || null : null,
    displayName: authenticated ? safeGetUserDisplayName(user) : null,
    avatarUrl: authenticated ? safeGetUserAvatarUrl(user) : null,
    currentResolvedUsername: authenticated ? source.currentResolvedUsername || null : null,
    resolvedUsername: authenticated ? source.resolvedUsername || null : null,

    isAdmin: Boolean(authenticated && (source.isAdmin || flags.isAdmin)),
    isUser: Boolean(authenticated && (source.isUser || flags.isUser)),
    isSupport: false,
    isManager: false,
    isClient: false,

    lang: source.lang || DEFAULT_LANG,
    theme: source.theme || DEFAULT_THEME,
    themeMode: source.themeMode || null,

    sidebarOpen: typeof source.sidebarOpen === "boolean" ? source.sidebarOpen : null,
    shellVisible: typeof source.shellVisible === "boolean" ? source.shellVisible : null,
    shellHidden: typeof source.shellHidden === "boolean" ? source.shellHidden : null,
    routeShellHidden: typeof source.routeShellHidden === "boolean" ? source.routeShellHidden : null,
    chromeVisible: typeof source.chromeVisible === "boolean" ? source.chromeVisible : null,
    chromeHidden: typeof source.chromeHidden === "boolean" ? source.chromeHidden : null,
    appShellVisible: typeof source.appShellVisible === "boolean" ? source.appShellVisible : null,
    shellBusy: typeof source.shellBusy === "boolean" ? source.shellBusy : null,
    authScreen: typeof source.authScreen === "boolean" ? source.authScreen : null,
    routeMode: source.routeMode || null,

    session: {
      hasSession: Boolean(source.session || source.sessionData),
      sessionId: source.sessionId ? "***" : null,
      sessionUserId: source.sessionUserId || null,
    },

    online: source.online ?? null,
    offline: source.offline ?? null,
    networkOnline: source.networkOnline ?? null,
    networkOffline: source.networkOffline ?? null,
    networkStatus: source.networkStatus || "",

    hasError: Boolean(source.hasError),
    error: normalizeError(source.error),
    lastError: normalizeError(source.lastError),

    lastRequestAt: source.lastRequestAt || null,
    lastRequestUrl: safeRedact(source.lastRequestUrl || ""),
    lastRequestMethod: source.lastRequestMethod || null,
    lastRequestStatus: source.lastRequestStatus || null,
    requestPending: safeNumber(source.requestPending, 0),

    boot: {
      bootInitialUrl: safeRedact(source.bootInitialUrl || ""),
      bootInitialPath: safeRedact(source.bootInitialPath || ""),
      bootCanonicalPath: safeRedact(source.bootCanonicalPath || ""),
      bootProtectedInitialUrl: safeRedact(source.bootProtectedInitialUrl || ""),
      bootProtectedInitialPath: safeRedact(source.bootProtectedInitialPath || ""),
      bootProtectedInitialPublicPath: safeRedact(source.bootProtectedInitialPublicPath || ""),
      bootProtectedRouteKey: source.bootProtectedRouteKey || "",
      bootIsPublicTokenRoute: Boolean(source.bootIsPublicTokenRoute),
      bootHasProtectedToken: Boolean(source.bootHasProtectedToken),
      bootCapturedAt: source.bootCapturedAt || "",
      bootIsActivation: Boolean(source.bootIsActivation),
      bootHasActivationToken: Boolean(source.bootHasActivationToken),
      bootActivationInitialUrl: safeRedact(source.bootActivationInitialUrl || ""),
      bootActivationInitialPath: safeRedact(source.bootActivationInitialPath || ""),
      bootActivationInitialPublicPath: safeRedact(source.bootActivationInitialPublicPath || ""),
      bootIsResetConfirm: Boolean(source.bootIsResetConfirm),
      bootHasResetToken: Boolean(source.bootHasResetToken),
      bootResetConfirmInitialUrl: safeRedact(source.bootResetConfirmInitialUrl || ""),
      bootResetConfirmInitialPath: safeRedact(source.bootResetConfirmInitialPath || ""),
      bootResetConfirmInitialPublicPath: safeRedact(source.bootResetConfirmInitialPublicPath || ""),
    },

    stateChangeCount: safeNumber(source.stateChangeCount, 0),
    createdAt: source.createdAt || "",
    updatedAt: source.updatedAt || "",
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  STATE_VERSION,
  createInitialState,
  cloneState,
  getState,
  getStateBase,
  setState,
  setStateBase,
  computeAuthenticated,
  getStateDebugSnapshot,
};
