/* =========================================================
   Onion SPA - Core State
   Archivo: src/core/state.js

   ONION SUPPORT · CORE STATE
   GLOBAL STATE · STRICT AUTH · ROUTE/PUBLIC PATH SAFE · 17/10

   Responsabilidades:
   - definir el estado global base del core
   - exponer snapshot seguro del estado
   - computar autenticación estricta
   - aplicar patches de estado normalizados
   - mantener route/publicPath consistentes
   - preservar currentResolvedUsername sólo con auth válida
   - evitar ghost auth
   - evitar eventos falsos de state change
   - normalizar red/network/ui/boot/session
   - proteger snapshots frente a token leakage
   - mantener compatibilidad con AppCore.setState()
   - mantener aliases legacy setStateBase/getStateBase

   Candados:
   - route/canonicalPath siempre sin query/hash
   - publicPath conserva /@usuario/query/hash
   - token válido + usuario usable requerido para authenticated=true
   - token sin user usable NO autentica
   - user sin token usable NO autentica
   - usuario inactivo/bloqueado NO autentica
   - snapshots sin token real por defecto
   - updatedAt/stateChangeCount sólo si hay cambios reales
   - undefined no escribe estado
   - null limpia valores
   - evento interno opt-in para diagnóstico
========================================================= */

import { config } from "./config.js";

import {
  cloneError,
  safeClone,
  normalizeUser,
  hasValidToken,
  isUsableUser,
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

/* =========================================================
   CONSTANTS
========================================================= */

export const STATE_VERSION = "17.0.0";

const DEFAULT_ROUTE = "/";
const DEFAULT_LANG = "es";
const DEFAULT_THEME = "dark";

const VALID_THEMES = Object.freeze([
  "dark",
  "light",
]);

const VALID_THEME_MODES = Object.freeze([
  "dark",
  "light",
  "system",
]);

const VALID_NETWORK_STATUSES = Object.freeze([
  "online",
  "offline",
  "unknown",
]);

const VALID_LANG_RE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i;

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
  "appShellVisible",
  "shellBusy",
  "authScreen",

  "hasError",
  "authenticated",
  "hasToken",

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

  "isAdmin",
  "isSupport",
  "isManager",
  "isClient",
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

const NUMERIC_KEYS = Object.freeze([
  "coreInitCycle",
  "lastRequestStatus",
  "requestPending",
  "stateChangeCount",
]);

const TOKEN_ALIAS_KEYS = Object.freeze([
  "token",
  "accessToken",
  "access_token",
  "jwt",
  "idToken",
  "id_token",
  "bearer",
]);

const USER_ALIAS_KEYS = Object.freeze([
  "user",
  "currentUser",
  "authUser",
  "sessionUser",
]);

const SESSION_ALIAS_KEYS = Object.freeze([
  "session",
  "sessionData",
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

const INTERNAL_STATE_PATCH_EVENT = "app:state:patched";

const ROLE_ALIASES = Object.freeze({
  administrator: "admin",
  administrador: "admin",
  superadmin: "admin",
  super_admin: "admin",
  "super-admin": "admin",
  owner: "admin",
  root: "admin",

  soporte: "support",
  tecnico: "support",
  "técnico": "support",
  technician: "support",
  technical: "support",
  agent: "support",
  agente: "support",
  staff: "support",
  helpdesk: "support",

  manager: "manager",
  gestor: "manager",
  gerente: "manager",
  supervisor: "manager",
  lead: "manager",

  cliente: "client",
  customer: "client",

  usuario: "user",
});

/* =========================================================
   BASIC HELPERS
========================================================= */

function isObject(value) {
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
  if (value === null || value === undefined) {
    return fallback;
  }

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
  const result = [];
  const seen = new Set();

  for (const value of toArray(values).flat(Infinity)) {
    const clean = safeText(value, "");

    if (!clean || seen.has(clean)) {
      continue;
    }

    seen.add(clean);
    result.push(clean);
  }

  return result;
}

function safeCloneValue(value, fallback = null) {
  try {
    const cloned = safeClone(value);

    if (cloned !== undefined) {
      return cloned;
    }
  } catch {}

  if (Array.isArray(value)) {
    return value.map((item) => safeCloneValue(item, item));
  }

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

  if (!raw) {
    return "";
  }

  try {
    return redactTokenInText(raw);
  } catch {
    return raw;
  }
}

function stripBearerPrefix(token = "") {
  return safeText(token, "").replace(/^Bearer\s+/i, "").trim();
}

function safeHasValidToken(token) {
  try {
    return Boolean(hasValidToken(token));
  } catch {
    return Boolean(safeText(token, ""));
  }
}

function normalizeTokenValue(token) {
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
    return isObject(user) ? user : null;
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

/* =========================================================
   SNAPSHOT SANITIZE
========================================================= */

function sanitizeSnapshotDeep(value, depth = 0, seen = new WeakSet()) {
  if (depth > 8) {
    return "[MaxDepth]";
  }

  if (typeof value === "string") {
    return safeRedact(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (value instanceof Error) {
    return normalizeError(value);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 200)
      .map((item) => sanitizeSnapshotDeep(item, depth + 1, seen));
  }

  if (isAnyObject(value)) {
    try {
      if (seen.has(value)) {
        return "[Circular]";
      }

      seen.add(value);
    } catch {}

    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (/token|secret|password|authorization|bearer|credential|otp|code|session/i.test(key)) {
        output[key] = item ? "***" : item;
        continue;
      }

      output[key] = sanitizeSnapshotDeep(item, depth + 1, seen);
    }

    return output;
  }

  return String(value);
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

  if (!value) {
    return "";
  }

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

  return VALID_THEME_MODES.includes(value) ? value : "";
}

function normalizeLang(lang = DEFAULT_LANG) {
  const value = safeLower(lang, DEFAULT_LANG).replace(/_/g, "-");
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
  if (!value) {
    return null;
  }

  try {
    return cloneError(value);
  } catch {
    if (value instanceof Error) {
      return {
        name: value.name || "Error",
        message: safeRedact(value.message || "Error"),
      };
    }

    return sanitizeSnapshotDeep(value);
  }
}

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

  if (!role) {
    return null;
  }

  const configuredAliases = config?.auth?.roles || {};

  for (const [alias, target] of Object.entries(configuredAliases)) {
    if (normalizeRoleKey(alias) === role) {
      return normalizeRoleKey(target || role) || role;
    }
  }

  return ROLE_ALIASES[role] || role || null;
}

function normalizeRoleList(value = []) {
  const roles = [];

  const pushRole = (item) => {
    if (!item) {
      return;
    }

    if (Array.isArray(item)) {
      item.forEach(pushRole);
      return;
    }

    if (isObject(item)) {
      for (const [key, enabled] of Object.entries(item)) {
        if (safeBool(enabled, false)) {
          pushRole(key);
        }
      }

      return;
    }

    if (typeof item === "string") {
      item
        .split(/[,\s|]+/g)
        .map(normalizeRole)
        .filter(Boolean)
        .forEach((role) => roles.push(role));

      return;
    }

    const role = normalizeRole(item);

    if (role) {
      roles.push(role);
    }
  };

  pushRole(value);

  return unique(roles);
}

function resolveOnlineState() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      return navigator.onLine !== false;
    }
  } catch {}

  return null;
}

function resolveNetworkPatchFromOnline(onlineValue) {
  const online = onlineValue === null ? null : Boolean(onlineValue);
  const offline = online === null ? null : !online;

  return {
    online,
    offline,
    networkOnline: online,
    networkOffline: offline,
    networkStatus: online === null ? "unknown" : online ? "online" : "offline",
  };
}

function resolveNetworkPatchFromOffline(offlineValue) {
  const offline = offlineValue === null ? null : Boolean(offlineValue);
  const online = offline === null ? null : !offline;

  return {
    online,
    offline,
    networkOnline: online,
    networkOffline: offline,
    networkStatus: online === null ? "unknown" : online ? "online" : "offline",
  };
}

function resolveNetworkPatchFromStatus(statusValue) {
  const status = normalizeNetworkStatus(statusValue);

  if (status === "online") {
    return resolveNetworkPatchFromOnline(true);
  }

  if (status === "offline") {
    return resolveNetworkPatchFromOnline(false);
  }

  if (status === "unknown") {
    return resolveNetworkPatchFromOnline(null);
  }

  return {};
}

function resolveRole(user = null, explicitRole = "") {
  const normalized = normalizeRole(
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

  return normalized || null;
}

function resolveRoles(user = null, explicitRoles = []) {
  const role = resolveRole(user);

  const roles = normalizeRoleList([
    explicitRoles,
    user?.roles,
    user?.roleList,
    user?.role_list,
    user?.permissions?.roles,
    role,
  ]);

  return roles.length ? roles : role ? [role] : [];
}

function extractUsernameFromPublicPath(publicPath = DEFAULT_ROUTE) {
  const match = String(publicPath || "").match(/^\/@([^/]+)(?:\/|$)/i);
  return sanitizeUsername(match?.[1] || "") || null;
}

function resolveUsernameFromUser(user = null) {
  return (
    sanitizeUsername(
      safeGetUserUsername(user) ||
        user?.username ||
        user?.userName ||
        user?.user_name ||
        user?.nick ||
        user?.alias ||
        user?.login ||
        user?.slug ||
        user?.email ||
        ""
    ) || null
  );
}

function hasUsableUser(user = null) {
  const normalized = safeNormalizeUser(user);

  if (!normalized || typeof normalized !== "object") {
    return false;
  }

  if (
    normalized.active === false ||
    normalized.disabled === true ||
    normalized.deleted === true
  ) {
    return false;
  }

  return Boolean(
    safeText(normalized.id, "") ||
      safeText(normalized.userId, "") ||
      safeText(normalized.user_id, "") ||
      safeText(normalized._id, "") ||
      safeText(normalized.uid, "") ||
      safeText(normalized.sub, "") ||
      safeText(normalized.username, "") ||
      safeText(normalized.userName, "") ||
      safeText(normalized.user_name, "") ||
      safeText(normalized.email, "") ||
      safeText(normalized.mail, "") ||
      safeText(normalized.phone, "") ||
      safeText(normalized.telefono, "")
  );
}

function isUserInactive(user = null) {
  if (!user || typeof user !== "object") {
    return true;
  }

  const status = safeLower(
    user.status ||
      user.estado ||
      user.state ||
      user.accountStatus ||
      user.account_status ||
      "",
    ""
  )
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");

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
    return true;
  }

  return Boolean(
    user.active === false ||
      user.enabled === false ||
      user.isActive === false ||
      user.is_active === false ||
      user.isEnabled === false ||
      user.is_enabled === false ||
      user.disabled === true ||
      user.deleted === true ||
      user.blocked === true ||
      user.suspended === true ||
      user.banned === true ||
      user.archived === true
  );
}

function resolveCurrentResolvedUsername({
  user = null,
  publicPath = DEFAULT_ROUTE,
  previous = null,
  authenticated = false,
} = {}) {
  if (!authenticated) {
    return null;
  }

  const fromPath = extractUsernameFromPublicPath(publicPath);
  const fromUser = resolveUsernameFromUser(user);
  const fromPrevious = sanitizeUsername(previous || "") || null;

  return fromPath || fromUser || fromPrevious || null;
}

function roleFlags(roles = []) {
  const roleSet = new Set(normalizeRoleList(roles));

  return {
    isAdmin: roleSet.has("admin"),
    isSupport: roleSet.has("support") || roleSet.has("agent"),
    isManager: roleSet.has("manager"),
    isClient: roleSet.has("client"),
  };
}

/* =========================================================
   PATCH / DIFF HELPERS
========================================================= */

function sanitizePatchInput(patch = {}) {
  const output = {};

  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return output;
  }

  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }

  return output;
}

function stableStringify(value, seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return String(value);
  }

  const type = typeof value;

  if (type === "string" || type === "number" || type === "boolean" || type === "bigint") {
    return `${type}:${String(value)}`;
  }

  if (type === "function") {
    return `function:${value.name || "anonymous"}`;
  }

  if (value instanceof Date) {
    return `date:${value.toISOString()}`;
  }

  if (value instanceof Error) {
    return `error:${value.name}:${value.message}`;
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item, seen)).join(",")}]`;
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[circular]";
    }

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
  if (Object.is(previous, next)) {
    return true;
  }

  const previousIsObject = previous !== null && typeof previous === "object";
  const nextIsObject = next !== null && typeof next === "object";

  if (previousIsObject || nextIsObject) {
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

function compactChangedKeys(keys = []) {
  return Array.from(new Set(keys.filter(Boolean)));
}

/* =========================================================
   AUTH
========================================================= */

export function computeAuthenticated(nextUser, nextToken) {
  const normalizedUser = safeNormalizeUser(nextUser);
  const validToken = safeHasValidToken(nextToken);

  if (!validToken) {
    return false;
  }

  if (!safeIsUsableUser(normalizedUser)) {
    return false;
  }

  if (isUserInactive(normalizedUser)) {
    return false;
  }

  return true;
}

function deriveAuthPatch({ state, patch } = {}) {
  const nextUser = hasOwn(patch, "user") ? patch.user : state.user;
  const nextToken = hasOwn(patch, "token") ? patch.token : state.token;

  const authenticated = computeAuthenticated(nextUser, nextToken);
  const hasToken = authenticated && safeHasValidToken(nextToken);

  const roles = authenticated
    ? resolveRoles(nextUser, hasOwn(patch, "roles") ? patch.roles : state.roles)
    : [];

  const role = authenticated
    ? (
        resolveRole(nextUser, hasOwn(patch, "role") ? patch.role : state.role) ||
        roles[0] ||
        null
      )
    : null;

  const flags = roleFlags(roles);

  return {
    authenticated,
    hasToken,

    role,
    rol: role,
    userRole: role,

    roles,

    username: authenticated ? resolveUsernameFromUser(nextUser) : null,

    ...flags,
  };
}

/* =========================================================
   STATE FACTORY
========================================================= */

export function createInitialState(input = {}) {
  const localConfig = input?.config || input || config || {};

  const route = safeLocationCanonicalPath();
  const publicPath = safeLocationPublicPath(route);

  const lang = normalizeLang(
    localConfig?.defaultLang ||
      localConfig?.i18n?.defaultLang ||
      localConfig?.lang ||
      DEFAULT_LANG
  );

  const theme = normalizeTheme(
    localConfig?.defaultTheme ||
      localConfig?.ui?.defaultTheme ||
      localConfig?.theme ||
      DEFAULT_THEME
  );

  const themeMode =
    normalizeThemeMode(
      localConfig?.defaultThemeMode ||
        localConfig?.themeMode ||
        localConfig?.appearance ||
        ""
    ) || null;

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

    role: null,
    rol: null,
    userRole: null,
    roles: [],
    username: null,

    authenticated: false,

    isAdmin: false,
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

function sanitizeSnapshotValue(key, value, options = {}) {
  const includeToken =
    options?.includeToken === true ||
    options?.unsafeIncludeToken === true;

  if (SENSITIVE_STATE_KEYS.includes(key)) {
    if (
      includeToken &&
      (
        key === "token" ||
        key === "accessToken" ||
        key === "access_token"
      )
    ) {
      return value || null;
    }

    return value ? "***" : null;
  }

  if (REDACTABLE_PATH_KEYS.includes(key)) {
    return safeRedact(value || "");
  }

  if (key === "error" || key === "lastError") {
    return normalizeError(value);
  }

  if (USER_ALIAS_KEYS.includes(key)) {
    return value ? sanitizeSnapshotDeep(value) : null;
  }

  return value;
}

export function cloneState(state, options = {}) {
  const opts = isObject(options) ? options : {};
  const source = state && typeof state === "object" ? state : {};
  const raw = safeCloneValue(source, {}) || {};
  const snapshot = {};

  for (const [key, value] of Object.entries(raw)) {
    snapshot[key] = sanitizeSnapshotValue(key, value, opts);
  }

  const token =
    source.token ||
    source.accessToken ||
    source.access_token ||
    null;

  const user =
    source.user ||
    source.currentUser ||
    source.authUser ||
    source.sessionUser ||
    null;

  const authenticated = computeAuthenticated(user, token);

  snapshot.__version = source.__version || STATE_VERSION;

  snapshot.user = user ? sanitizeSnapshotDeep(user) : null;
  snapshot.currentUser = user ? sanitizeSnapshotDeep(user) : null;
  snapshot.authUser = user ? sanitizeSnapshotDeep(user) : null;
  snapshot.sessionUser = user ? sanitizeSnapshotDeep(user) : null;

  snapshot.token = opts.includeToken === true || opts.unsafeIncludeToken === true ? token || null : null;
  snapshot.accessToken = opts.includeToken === true || opts.unsafeIncludeToken === true ? token || null : null;
  snapshot.access_token = opts.includeToken === true || opts.unsafeIncludeToken === true ? token || null : null;

  snapshot.hasToken = authenticated && safeHasValidToken(token);
  snapshot.authenticated = authenticated;

  snapshot.lastError = normalizeError(source.lastError || source.error);
  snapshot.error = normalizeError(source.error || source.lastError);

  snapshot.route = safeCanonicalPath(source.route || DEFAULT_ROUTE);
  snapshot.canonicalPath = safeCanonicalPath(source.canonicalPath || source.route || DEFAULT_ROUTE);
  snapshot.publicPath = safeRedact(safePublicPath(source.publicPath || source.route || DEFAULT_ROUTE));

  snapshot.lastRoute = source.lastRoute ? safeCanonicalPath(source.lastRoute, DEFAULT_ROUTE) : null;
  snapshot.lastPublicPath = source.lastPublicPath
    ? safeRedact(safePublicPath(source.lastPublicPath, DEFAULT_ROUTE))
    : null;

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
    if (hasOwn(cloned, key)) {
      cloned[key] = cloned[key] ? "***" : null;
    }
  }

  for (const key of REDACTABLE_PATH_KEYS) {
    if (hasOwn(cloned, key)) {
      cloned[key] = safeRedact(cloned[key] || "");
    }
  }

  for (const key of USER_ALIAS_KEYS) {
    if (hasOwn(cloned, key)) {
      cloned[key] = cloned[key] ? sanitizeSnapshotDeep(cloned[key]) : null;
    }
  }

  if (hasOwn(cloned, "error")) {
    cloned.error = normalizeError(cloned.error);
  }

  if (hasOwn(cloned, "lastError")) {
    cloned.lastError = normalizeError(cloned.lastError);
  }

  return cloned;
}

/* =========================================================
   PATCH NORMALIZATION
========================================================= */

function normalizeSessionAliases(normalizedPatch) {
  if (!hasOwn(normalizedPatch, "session")) {
    for (const key of SESSION_ALIAS_KEYS) {
      if (key !== "session" && hasOwn(normalizedPatch, key)) {
        normalizedPatch.session = normalizedPatch[key];
        break;
      }
    }
  }

  if (hasOwn(normalizedPatch, "session")) {
    const session = normalizedPatch.session || null;

    normalizedPatch.session = session;
    normalizedPatch.sessionData = session;

    if (session && typeof session === "object") {
      if (!hasOwn(normalizedPatch, "user")) {
        normalizedPatch.user =
          session.user ||
          session.currentUser ||
          session.authUser ||
          session.sessionUser ||
          session.data?.user ||
          session.payload?.user ||
          null;
      }

      if (!hasOwn(normalizedPatch, "token")) {
        normalizedPatch.token =
          session.token ||
          session.accessToken ||
          session.access_token ||
          session.jwt ||
          null;
      }

      if (!hasOwn(normalizedPatch, "refreshToken") && !hasOwn(normalizedPatch, "refresh_token")) {
        normalizedPatch.refreshToken =
          session.refreshToken ||
          session.refresh_token ||
          null;
      }

      if (!hasOwn(normalizedPatch, "sessionId")) {
        normalizedPatch.sessionId =
          session.sessionId ||
          session.session_id ||
          session.id ||
          null;
      }

      if (!hasOwn(normalizedPatch, "sessionUserId")) {
        normalizedPatch.sessionUserId =
          session.sessionUserId ||
          session.session_user_id ||
          session.userId ||
          session.user_id ||
          null;
      }
    }
  }

  return normalizedPatch;
}

function normalizeTokenAliases(normalizedPatch) {
  if (normalizedPatch.hasToken === false && !TOKEN_ALIAS_KEYS.some((key) => hasOwn(normalizedPatch, key))) {
    normalizedPatch.token = null;
  }

  if (!hasOwn(normalizedPatch, "token")) {
    for (const key of TOKEN_ALIAS_KEYS) {
      if (key !== "token" && hasOwn(normalizedPatch, key)) {
        normalizedPatch.token = normalizedPatch[key];
        break;
      }
    }
  }

  if (hasOwn(normalizedPatch, "token")) {
    const token = normalizeTokenValue(normalizedPatch.token);

    normalizedPatch.token = token;
    normalizedPatch.accessToken = token;
    normalizedPatch.access_token = token;
  }

  return normalizedPatch;
}

function normalizeRefreshTokenAliases(normalizedPatch) {
  if (hasOwn(normalizedPatch, "refreshToken") && !hasOwn(normalizedPatch, "refresh_token")) {
    normalizedPatch.refresh_token = normalizeTokenValue(normalizedPatch.refreshToken);
    normalizedPatch.refreshToken = normalizedPatch.refresh_token;
  }

  if (hasOwn(normalizedPatch, "refresh_token") && !hasOwn(normalizedPatch, "refreshToken")) {
    normalizedPatch.refreshToken = normalizeTokenValue(normalizedPatch.refresh_token);
    normalizedPatch.refresh_token = normalizedPatch.refreshToken;
  }

  return normalizedPatch;
}

function normalizeTempTokenAliases(normalizedPatch) {
  if (hasOwn(normalizedPatch, "tempToken") && !hasOwn(normalizedPatch, "temp_token")) {
    normalizedPatch.temp_token = normalizeTokenValue(normalizedPatch.tempToken);
    normalizedPatch.tempToken = normalizedPatch.temp_token;
  }

  if (hasOwn(normalizedPatch, "temp_token") && !hasOwn(normalizedPatch, "tempToken")) {
    normalizedPatch.tempToken = normalizeTokenValue(normalizedPatch.temp_token);
    normalizedPatch.temp_token = normalizedPatch.tempToken;
  }

  return normalizedPatch;
}

function normalizeUserAliases(normalizedPatch) {
  if (!hasOwn(normalizedPatch, "user")) {
    for (const key of USER_ALIAS_KEYS) {
      if (key !== "user" && hasOwn(normalizedPatch, key)) {
        normalizedPatch.user = normalizedPatch[key];
        break;
      }
    }
  }

  if (hasOwn(normalizedPatch, "user")) {
    const user = safeNormalizeUser(normalizedPatch.user);

    normalizedPatch.user = user;
    normalizedPatch.currentUser = user;
    normalizedPatch.authUser = user;
    normalizedPatch.sessionUser = user;
  }

  return normalizedPatch;
}

function normalizeRoutePatch(state, normalizedPatch) {
  const routeWasProvided =
    hasOwn(normalizedPatch, "route") ||
    hasOwn(normalizedPatch, "canonicalPath");

  const publicPathWasProvided = hasOwn(normalizedPatch, "publicPath");

  if (!hasOwn(normalizedPatch, "route") && hasOwn(normalizedPatch, "canonicalPath")) {
    normalizedPatch.route = normalizedPatch.canonicalPath;
  }

  if (routeWasProvided) {
    const nextRoute = safeCanonicalPath(
      normalizedPatch.route || normalizedPatch.canonicalPath,
      state.route || DEFAULT_ROUTE
    );

    if (nextRoute !== state.route && !hasOwn(normalizedPatch, "lastRoute")) {
      normalizedPatch.lastRoute = state.route || null;
    }

    normalizedPatch.route = nextRoute;
    normalizedPatch.canonicalPath = nextRoute;
  }

  if (publicPathWasProvided) {
    const nextPublicPath = safePublicPath(
      normalizedPatch.publicPath,
      state.publicPath || state.route || DEFAULT_ROUTE
    );

    if (nextPublicPath !== state.publicPath && !hasOwn(normalizedPatch, "lastPublicPath")) {
      normalizedPatch.lastPublicPath = state.publicPath || null;
    }

    normalizedPatch.publicPath = nextPublicPath;
  }

  if (hasOwn(normalizedPatch, "lastRoute")) {
    normalizedPatch.lastRoute = normalizedPatch.lastRoute
      ? safeCanonicalPath(normalizedPatch.lastRoute, DEFAULT_ROUTE)
      : null;
  }

  if (hasOwn(normalizedPatch, "lastPublicPath")) {
    normalizedPatch.lastPublicPath = normalizedPatch.lastPublicPath
      ? safePublicPath(normalizedPatch.lastPublicPath, DEFAULT_ROUTE)
      : null;
  }

  if (routeWasProvided && !publicPathWasProvided) {
    const currentPublicCanonical = state.publicPath
      ? safeCanonicalPath(state.publicPath, state.route || DEFAULT_ROUTE)
      : "";

    const shouldPreserveCurrentPublic = Boolean(
      state.publicPath &&
        currentPublicCanonical === normalizedPatch.route
    );

    normalizedPatch.publicPath = shouldPreserveCurrentPublic
      ? safePublicPath(state.publicPath, normalizedPatch.route)
      : safePublicPath(normalizedPatch.route, normalizedPatch.route);
  }

  if (publicPathWasProvided && !routeWasProvided) {
    normalizedPatch.route = safeCanonicalPath(normalizedPatch.publicPath, state.route || DEFAULT_ROUTE);
    normalizedPatch.canonicalPath = normalizedPatch.route;
  }

  if (!normalizedPatch.route && !state.route) {
    normalizedPatch.route = DEFAULT_ROUTE;
    normalizedPatch.canonicalPath = DEFAULT_ROUTE;
  }

  if (!normalizedPatch.publicPath && !state.publicPath) {
    normalizedPatch.publicPath = safePublicPath(
      normalizedPatch.route || state.route || DEFAULT_ROUTE,
      DEFAULT_ROUTE
    );
  }

  return normalizedPatch;
}

function normalizeBootPatch(normalizedPatch) {
  for (const key of [
    "bootInitialPath",
    "bootCanonicalPath",
    "bootProtectedInitialPath",
    "bootProtectedInitialPublicPath",
    "bootActivationInitialPath",
    "bootActivationInitialPublicPath",
    "bootResetConfirmInitialPath",
    "bootResetConfirmInitialPublicPath",
  ]) {
    if (hasOwn(normalizedPatch, key)) {
      normalizedPatch[key] = normalizedPatch[key]
        ? safePublicPath(normalizedPatch[key], DEFAULT_ROUTE)
        : "";
    }
  }

  for (const key of [
    "bootInitialUrl",
    "bootProtectedInitialUrl",
    "bootActivationInitialUrl",
    "bootResetConfirmInitialUrl",
  ]) {
    if (hasOwn(normalizedPatch, key)) {
      normalizedPatch[key] = safeText(normalizedPatch[key], "");
    }
  }

  for (const key of [
    "bootIsPublicTokenRoute",
    "bootIsActivation",
    "bootHasActivationToken",
    "bootIsResetConfirm",
    "bootHasResetToken",
    "bootHasProtectedToken",
  ]) {
    if (hasOwn(normalizedPatch, key)) {
      normalizedPatch[key] = Boolean(normalizedPatch[key]);
    }
  }

  if (hasOwn(normalizedPatch, "bootHasActivationToken") || hasOwn(normalizedPatch, "bootHasResetToken")) {
    normalizedPatch.bootHasProtectedToken = Boolean(
      normalizedPatch.bootHasProtectedToken ||
        normalizedPatch.bootHasActivationToken ||
        normalizedPatch.bootHasResetToken
    );
  }

  if (hasOwn(normalizedPatch, "bootIsActivation") || hasOwn(normalizedPatch, "bootIsResetConfirm")) {
    normalizedPatch.bootIsPublicTokenRoute = Boolean(
      normalizedPatch.bootIsPublicTokenRoute ||
        normalizedPatch.bootIsActivation ||
        normalizedPatch.bootIsResetConfirm
    );
  }

  return normalizedPatch;
}

function normalizeNetworkPatch(normalizedPatch) {
  if (hasOwn(normalizedPatch, "online")) {
    Object.assign(normalizedPatch, resolveNetworkPatchFromOnline(normalizedPatch.online));
  }

  if (hasOwn(normalizedPatch, "offline")) {
    Object.assign(normalizedPatch, resolveNetworkPatchFromOffline(normalizedPatch.offline));
  }

  if (hasOwn(normalizedPatch, "networkStatus")) {
    Object.assign(normalizedPatch, resolveNetworkPatchFromStatus(normalizedPatch.networkStatus));
  }

  return normalizedPatch;
}

function normalizePrimitivePatch(normalizedPatch) {
  if (hasOwn(normalizedPatch, "theme")) {
    normalizedPatch.theme = normalizeTheme(normalizedPatch.theme);
  }

  if (hasOwn(normalizedPatch, "themeMode")) {
    normalizedPatch.themeMode = normalizeThemeMode(normalizedPatch.themeMode) || null;
  }

  if (hasOwn(normalizedPatch, "lang")) {
    normalizedPatch.lang = normalizeLang(normalizedPatch.lang);
  }

  for (const key of BOOLEAN_KEYS) {
    if (hasOwn(normalizedPatch, key)) {
      normalizedPatch[key] = Boolean(normalizedPatch[key]);
    }
  }

  for (const key of NULLABLE_STRING_KEYS) {
    if (hasOwn(normalizedPatch, key)) {
      normalizedPatch[key] = normalizedPatch[key] === null
        ? null
        : safeText(normalizedPatch[key], "") || null;
    }
  }

  for (const key of NUMERIC_KEYS) {
    if (hasOwn(normalizedPatch, key)) {
      const normalizedNumber = safeNumber(normalizedPatch[key], 0);
      normalizedPatch[key] = key === "requestPending" ? Math.max(0, normalizedNumber) : normalizedNumber;
    }
  }

  if (hasOwn(normalizedPatch, "roles")) {
    normalizedPatch.roles = normalizeRoleList(normalizedPatch.roles);
  }

  if (hasOwn(normalizedPatch, "role")) {
    normalizedPatch.role = normalizeRole(normalizedPatch.role);
    normalizedPatch.rol = normalizedPatch.role;
    normalizedPatch.userRole = normalizedPatch.role;
  }

  if (hasOwn(normalizedPatch, "rol")) {
    normalizedPatch.role = normalizeRole(normalizedPatch.rol);
    normalizedPatch.rol = normalizedPatch.role;
    normalizedPatch.userRole = normalizedPatch.role;
  }

  if (hasOwn(normalizedPatch, "userRole")) {
    normalizedPatch.role = normalizeRole(normalizedPatch.userRole);
    normalizedPatch.rol = normalizedPatch.role;
    normalizedPatch.userRole = normalizedPatch.role;
  }

  return normalizedPatch;
}

function normalizeShellPatch(normalizedPatch) {
  if (hasOwn(normalizedPatch, "shellHidden") && !hasOwn(normalizedPatch, "shellVisible")) {
    normalizedPatch.shellVisible = !Boolean(normalizedPatch.shellHidden);
  }

  if (hasOwn(normalizedPatch, "shellVisible") && !hasOwn(normalizedPatch, "shellHidden")) {
    normalizedPatch.shellHidden = !Boolean(normalizedPatch.shellVisible);
  }

  if (hasOwn(normalizedPatch, "appShellVisible") && !hasOwn(normalizedPatch, "chromeVisible")) {
    normalizedPatch.chromeVisible = Boolean(normalizedPatch.appShellVisible);
  }

  if (hasOwn(normalizedPatch, "chromeVisible") && !hasOwn(normalizedPatch, "appShellVisible")) {
    normalizedPatch.appShellVisible = Boolean(normalizedPatch.chromeVisible);
  }

  return normalizedPatch;
}

function normalizeErrorPatch(normalizedPatch) {
  if (hasOwn(normalizedPatch, "error")) {
    normalizedPatch.error = normalizeError(normalizedPatch.error);
    normalizedPatch.lastError = normalizedPatch.error;
    normalizedPatch.hasError = Boolean(normalizedPatch.error);
  }

  if (hasOwn(normalizedPatch, "lastError")) {
    normalizedPatch.lastError = normalizeError(normalizedPatch.lastError);
    normalizedPatch.error = normalizedPatch.lastError;
    normalizedPatch.hasError = Boolean(normalizedPatch.lastError);
  }

  if (hasOwn(normalizedPatch, "hasError") && normalizedPatch.hasError === false) {
    normalizedPatch.error = null;
    normalizedPatch.lastError = null;
  }

  return normalizedPatch;
}

function normalizeRequestPatch(normalizedPatch) {
  if (hasOwn(normalizedPatch, "lastRequestUrl")) {
    normalizedPatch.lastRequestUrl = safeText(normalizedPatch.lastRequestUrl, "") || null;
  }

  if (hasOwn(normalizedPatch, "lastRequestMethod")) {
    normalizedPatch.lastRequestMethod = normalizeHttpMethod(normalizedPatch.lastRequestMethod);
  }

  if (hasOwn(normalizedPatch, "lastRequestStatus")) {
    const status = safeNumber(normalizedPatch.lastRequestStatus, 0);
    normalizedPatch.lastRequestStatus = status > 0 ? status : null;
  }

  if (hasOwn(normalizedPatch, "requestPending")) {
    normalizedPatch.requestPending = Math.max(0, safeNumber(normalizedPatch.requestPending, 0));
  }

  return normalizedPatch;
}

function shouldRecomputeAuthFromPatch(normalizedPatch) {
  return Boolean(
    hasOwn(normalizedPatch, "user") ||
      hasOwn(normalizedPatch, "currentUser") ||
      hasOwn(normalizedPatch, "authUser") ||
      hasOwn(normalizedPatch, "sessionUser") ||
      hasOwn(normalizedPatch, "token") ||
      hasOwn(normalizedPatch, "accessToken") ||
      hasOwn(normalizedPatch, "access_token") ||
      hasOwn(normalizedPatch, "authenticated") ||
      hasOwn(normalizedPatch, "hasToken") ||
      hasOwn(normalizedPatch, "role") ||
      hasOwn(normalizedPatch, "rol") ||
      hasOwn(normalizedPatch, "userRole") ||
      hasOwn(normalizedPatch, "roles") ||
      hasOwn(normalizedPatch, "username")
  );
}

function clearStrictAuthFields(normalizedPatch) {
  normalizedPatch.authenticated = false;
  normalizedPatch.hasToken = false;

  normalizedPatch.user = null;
  normalizedPatch.currentUser = null;
  normalizedPatch.authUser = null;
  normalizedPatch.sessionUser = null;

  normalizedPatch.token = null;
  normalizedPatch.accessToken = null;
  normalizedPatch.access_token = null;

  normalizedPatch.role = null;
  normalizedPatch.rol = null;
  normalizedPatch.userRole = null;
  normalizedPatch.roles = [];
  normalizedPatch.username = null;

  normalizedPatch.isAdmin = false;
  normalizedPatch.isSupport = false;
  normalizedPatch.isManager = false;
  normalizedPatch.isClient = false;

  normalizedPatch.currentResolvedUsername = null;
  normalizedPatch.resolvedUsername = null;

  return normalizedPatch;
}

function applyStrictAuthNormalization(state, normalizedPatch, options = {}) {
  const forceUnauthenticated =
    options?.forceUnauthenticated === true ||
    normalizedPatch.authenticated === false ||
    normalizedPatch.hasToken === false;

  const shouldRecomputeAuth =
    shouldRecomputeAuthFromPatch(normalizedPatch) ||
    forceUnauthenticated;

  if (!shouldRecomputeAuth) {
    return normalizedPatch;
  }

  if (forceUnauthenticated) {
    return clearStrictAuthFields(normalizedPatch);
  }

  const authPatch = deriveAuthPatch({
    state,
    patch: normalizedPatch,
  });

  Object.assign(normalizedPatch, authPatch);

  if (!authPatch.authenticated) {
    clearStrictAuthFields(normalizedPatch);
  }

  return normalizedPatch;
}

function normalizeStatePatch(state, patch = {}, options = {}) {
  const normalizedPatch = sanitizePatchInput(patch);

  normalizeSessionAliases(normalizedPatch);
  normalizeTokenAliases(normalizedPatch);
  normalizeRefreshTokenAliases(normalizedPatch);
  normalizeTempTokenAliases(normalizedPatch);
  normalizeUserAliases(normalizedPatch);

  normalizeRoutePatch(state, normalizedPatch);
  normalizeBootPatch(normalizedPatch);

  normalizeNetworkPatch(normalizedPatch);
  normalizePrimitivePatch(normalizedPatch);
  normalizeShellPatch(normalizedPatch);
  normalizeErrorPatch(normalizedPatch);
  normalizeRequestPatch(normalizedPatch);

  applyStrictAuthNormalization(state, normalizedPatch, options);

  const nextUserForUsername = hasOwn(normalizedPatch, "user") ? normalizedPatch.user : state.user;
  const nextPublicPathForUsername = hasOwn(normalizedPatch, "publicPath") ? normalizedPatch.publicPath : state.publicPath;
  const nextAuthenticated = hasOwn(normalizedPatch, "authenticated") ? normalizedPatch.authenticated : state.authenticated;

  const resolvedUsername = resolveCurrentResolvedUsername({
    user: nextUserForUsername,
    publicPath: nextPublicPathForUsername,
    previous: state.currentResolvedUsername,
    authenticated: nextAuthenticated,
  });

  normalizedPatch.currentResolvedUsername = resolvedUsername;
  normalizedPatch.resolvedUsername = resolvedUsername;

  return normalizedPatch;
}

/* =========================================================
   WRITE STATE
========================================================= */

export function setStateBase(state, patch = {}, options = {}) {
  if (!state || typeof state !== "object") {
    throw new Error("Core state inválido.");
  }

  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return cloneState(state);
  }

  const opts = isObject(options) ? options : {};

  const normalizedPatch = normalizeStatePatch(state, patch, opts);
  const changedKeys = getChangedKeys(state, normalizedPatch);

  if (!changedKeys.length) {
    return cloneState(state);
  }

  const previousState = cloneState(state);

  normalizedPatch.updatedAt = safeIsoDate();
  normalizedPatch.stateChangeCount = safeNumber(state.stateChangeCount, 0) + 1;

  const finalChangedKeys = compactChangedKeys([
    ...changedKeys,
    "updatedAt",
    "stateChangeCount",
  ]);

  Object.assign(state, normalizedPatch);

  const nextSnapshot = cloneState(state);

  if (opts.emitInternal === true && opts.silent !== true && opts.emit !== false) {
    try {
      opts.events?.emit?.(INTERNAL_STATE_PATCH_EVENT, {
        state: nextSnapshot,
        patch: clonePatchForEvent(normalizedPatch),
        previousState,
        changedKeys: finalChangedKeys,
        source: opts.source || "core:state",
      });
    } catch {}
  }

  return nextSnapshot;
}

export function setState({
  state,
  events,
  patch = {},
  options = {},
} = {}) {
  return setStateBase(state, patch, {
    ...(isObject(options) ? options : {}),
    events,
  });
}

/* =========================================================
   DEBUG HELPERS
========================================================= */

export function getStateDebugSnapshot(state) {
  const source = state && typeof state === "object" ? state : {};

  const token =
    source.token ||
    source.accessToken ||
    source.access_token ||
    null;

  const user =
    source.user ||
    source.currentUser ||
    source.authUser ||
    source.sessionUser ||
    null;

  const roles = normalizeRoleList(source.roles || user?.roles || []);
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

    authenticated: computeAuthenticated(user, token),
    hasToken: computeAuthenticated(user, token) && safeHasValidToken(token),
    hasUsableUser: hasUsableUser(user),

    role: source.role || null,
    roles,

    username: source.username || null,
    displayName: safeGetUserDisplayName(user),
    avatarUrl: safeGetUserAvatarUrl(user),

    currentResolvedUsername: source.currentResolvedUsername || null,
    resolvedUsername: source.resolvedUsername || null,

    isAdmin: Boolean(source.isAdmin || flags.isAdmin),
    isSupport: Boolean(source.isSupport || flags.isSupport),
    isManager: Boolean(source.isManager || flags.isManager),
    isClient: Boolean(source.isClient || flags.isClient),

    lang: source.lang || DEFAULT_LANG,
    theme: source.theme || DEFAULT_THEME,
    themeMode: source.themeMode || null,

    sidebarOpen: typeof source.sidebarOpen === "boolean" ? source.sidebarOpen : null,

    shellVisible: typeof source.shellVisible === "boolean" ? source.shellVisible : null,
    shellHidden: typeof source.shellHidden === "boolean" ? source.shellHidden : null,
    routeShellHidden: typeof source.routeShellHidden === "boolean" ? source.routeShellHidden : null,
    chromeVisible: typeof source.chromeVisible === "boolean" ? source.chromeVisible : null,
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
