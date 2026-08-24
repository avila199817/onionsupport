/* =========================================================
   Onion Support - Core
   Archivo: /src/core/index.js

   Kernel mínimo de la SPA:
   - estado canónico en memoria;
   - snapshots públicos aislados y sin access token;
   - runtimeState zero-copy con reconciliación Auth dirty-guarded;
   - normalización de usuario/sesión/rutas;
   - registro de módulos y puente HTTP/Toast.
========================================================= */

import {
  config,
  USER_HOME_PREFIX as CONFIG_USER_HOME_PREFIX,
  ALLOWED_ROLES,
  SENSITIVE_QUERY_PARAMS,
  buildUserHomeRoute as configBuildUserHomeRoute,
  getUserScopedRouteInfo as configGetUserScopedRouteInfo,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "./config.js";
import Http from "./http.js";

export const CORE_VERSION = "core.minimal.v8-dirty-runtime-state";
const RUNTIME_STATE_VERSION = "core.runtime-state.v2-dirty-guard";
const APP_NAME = config?.appName || config?.name || "Onion Support";
const ROOT_PATH = "/";
const USER_HOME_PREFIX = CONFIG_USER_HOME_PREFIX || "/@";
const LEGACY_RESET_TOKEN_PATH = /(\/(?:reset-password|password-reset)\/confirm\/)([^/?#\s]+)/gi;
const VALID_ROLES = new Set((Array.isArray(ALLOWED_ROLES) && ALLOWED_ROLES.length ? ALLOWED_ROLES : ["admin", "user"]).map((role) => String(role).toLowerCase()));
const DISABLED_STATUSES = new Set(["disabled", "desactivado", "inactive", "inactivo", "deleted", "eliminado", "archived", "archivado", "revoked", "revocado", "blocked", "bloqueado", "banned", "suspended", "suspendido"]);

function isBrowser() { return typeof window !== "undefined" && typeof document !== "undefined"; }
function isFunction(value) { return typeof value === "function"; }
function isObject(value) { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function cleanText(value = "", fallback = "") {
  const output = String(value ?? "").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
  return output || fallback;
}
function normalizeKey(value = "") { return cleanText(value, "").replace(/[-_\s]/g, "").toLowerCase(); }
function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }
  return null;
}
function clone(value) {
  if (value === undefined || value === null) return value;
  try { if (typeof structuredClone === "function") return structuredClone(value); } catch {}
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? undefined : JSON.parse(serialized);
  } catch { return null; }
}

const SENSITIVE_STATE_KEYS = new Set([
  "__proto__", "prototype", "constructor", "password", "passwordHash", "password_hash", "passwordMeta", "password_meta",
  "refreshToken", "refresh_token", "idToken", "id_token", "jwt", "bearer", "authorization", "resetToken", "reset_token",
  "activationToken", "activation_token", "secret", "secrets", "apiKey", "api_key", "connectionString", "connection_string", "sas",
  "_rid", "_self", "_etag", "_attachments", "_ts", "_lsn", "_metadata",
].map(normalizeKey).filter(Boolean));
const SENSITIVE_OBJECT_KEYS = new Set([...SENSITIVE_STATE_KEYS, "token", "accessToken", "access_token", "sessionId", "session_id", "cookie", "setCookie", "set_cookie", "code", "sig", "signature"].map(normalizeKey).filter(Boolean));
const SENSITIVE_QUERY_KEYS = new Set((Array.isArray(SENSITIVE_QUERY_PARAMS) && SENSITIVE_QUERY_PARAMS.length ? SENSITIVE_QUERY_PARAMS : [
  "token", "access_token", "accessToken", "refresh_token", "refreshToken", "id_token", "idToken", "code", "secret", "session",
  "sessionId", "session_id", "password", "pwd", "key", "sig", "signature", "jwt", "authorization", "reset_token", "resetToken",
  "activation_token", "activationToken",
]).map(normalizeKey).filter(Boolean));

const state = {
  initialized: false, ready: false, booting: false, loading: false, error: null,
  token: null, accessToken: null, access_token: null, hasToken: false,
  authenticated: false, user: null, currentUser: null, hasUser: false,
  role: null, rol: null, roles: [], userSlug: null, homePath: ROOT_PATH, defaultHome: ROOT_PATH, postLoginTarget: null,
  session: null, sessionData: null, sessionId: null, sessionUserId: null, hasSession: false, hasRefreshToken: false,
  route: ROOT_PATH, canonicalPath: ROOT_PATH, publicPath: ROOT_PATH, routeParams: {},
  sidebarOpen: false, lang: "es", locale: "es-ES", theme: "system", updatedAt: null,
};
const dom = {};
const ui = {};
const moduleRegistry = new Map();
let httpClient = null;
let toastBridge = null;
let activeRequestClient = null;
let activeRequestBound = null;

const runtimeMetrics = { reads: 0, reconciliations: 0, legacyRepairs: 0, writes: 0 };
const authSignal = {
  initialized: false,
  token: null, accessToken: null, access_token: null,
  user: null, userStatus: null, userRole: null, userSlug: null, userFlags: 0,
  session: null, sessionId: null, sessionUserId: null,
  fallbackRole: null, fallbackRol: null,
};

function touch() { state.updatedAt = new Date().toISOString(); return state.updatedAt; }
function sameArray(left = [], right = []) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
}
function setScalar(key, value) { if (state[key] === value) return false; state[key] = value; return true; }
function setArray(key, value = []) {
  const next = Array.isArray(value) ? value : [];
  if (sameArray(state[key], next)) return false;
  state[key] = [...next];
  return true;
}
function mutate(mutator = null, options = {}) {
  if (!isFunction(mutator)) return false;
  let changed = false;
  try { changed = mutator() === true; } catch { changed = false; }
  if (changed && options.touch !== false) touch();
  return changed;
}

function redact(value = "") {
  let output = cleanText(value, "");
  if (!output) return "";
  output = output.replace(LEGACY_RESET_TOKEN_PATH, "$1***");
  try {
    const fakeUrl = new URL(output, "https://onionsupport.local");
    for (const key of [...fakeUrl.searchParams.keys()]) if (SENSITIVE_QUERY_KEYS.has(normalizeKey(key))) fakeUrl.searchParams.set(key, "***");
    output = /^https?:\/\//i.test(output) ? fakeUrl.toString() : `${fakeUrl.pathname}${fakeUrl.search}${fakeUrl.hash}`;
  } catch {
    output = output.replace(/([?&#](?:access_token|accessToken|refresh_token|refreshToken|id_token|idToken|token|code|secret|session|sessionId|session_id|password|pwd|key|sig|signature|jwt|authorization|reset_token|resetToken|activation_token|activationToken)=)([^&#\s]+)/gi, "$1***");
  }
  return output.replace(LEGACY_RESET_TOKEN_PATH, "$1***").replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***").replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}
function safeError(error = null) {
  if (!error) return null;
  return {
    name: cleanText(error?.name, "Error"), message: redact(error?.message || String(error)),
    status: error?.status || error?.statusCode || error?.response?.status || null,
    code: cleanText(error?.code || error?.error || "", "") || null,
  };
}
function sanitizeObject(value, depth = 0) {
  if (depth > 6) return null;
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redact(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (["function", "symbol", "bigint"].includes(typeof value)) return undefined;
  if (Array.isArray(value)) return value.slice(0, 250).map((item) => sanitizeObject(item, depth + 1));
  if (!isObject(value)) return null;
  const output = Object.create(null);
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_OBJECT_KEYS.has(normalizeKey(key))) { output[key] = child ? "***" : null; continue; }
    const safeChild = sanitizeObject(child, depth + 1);
    if (safeChild !== undefined) output[key] = safeChild;
  }
  return output;
}

function stripBearer(value = "") { return cleanText(value, "").replace(/^Bearer\s+/i, ""); }
function tokenOk(value = "") {
  const token = stripBearer(value);
  if (!token || /\s/.test(token) || token.length > 8192) return false;
  return !["null", "undefined", "false", "true", "[object object]", "{}", "[]"].includes(token.toLowerCase());
}
function cleanToken(value = "") { const token = stripBearer(value); return tokenOk(token) ? token : null; }
function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    let sawUser = false;
    for (const item of value.flat(Infinity)) {
      const role = normalizeRole(item);
      if (role === "admin") return "admin";
      if (role === "user") sawUser = true;
    }
    return sawUser ? "user" : "";
  }
  const role = cleanText(value, "").toLowerCase();
  return VALID_ROLES.has(role) ? role : "";
}
function normalizeSlug(value = "") {
  try { if (isFunction(configNormalizeUserSlug)) return configNormalizeUserSlug(value) || ""; } catch {}
  const slug = cleanText(value, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^\/+/, "").replace(/^@+/, "").split(/[/?#]/)[0].replace(/\s+/g, "").replace(/[^a-zA-Z0-9._-]/g, "").toLowerCase();
  return slug && /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
}
function rawUserSlug(user = null) {
  return isObject(user) ? first(user.slug, user.lookup?.slug, user.profile?.slug, user.routing?.slug, user.username, user.userName, user.user_name, user.usernameLower, user.username_lower, user.userId, user.id, "") : "";
}
function extractUserSlug(user = null) { return normalizeSlug(rawUserSlug(user)); }
function buildUserHomePath(userOrSlug = null) {
  const slug = isObject(userOrSlug) ? extractUserSlug(userOrSlug) : normalizeSlug(userOrSlug);
  if (!slug) return ROOT_PATH;
  try { if (isFunction(configBuildUserHomeRoute)) return configBuildUserHomeRoute(slug) || `${USER_HOME_PREFIX}${slug}`; } catch {}
  return `${USER_HOME_PREFIX}${slug}`;
}
function userStatus(user = null) { return isObject(user) ? cleanText(first(user.status, user.estado, user.state, user.accountStatus, ""), "").toLowerCase() : ""; }
function userFlagBits(user = null) {
  if (!isObject(user)) return -1;
  let bits = 0;
  if (user.usable === false) bits |= 1;
  if (user.disabled === true) bits |= 2;
  if (user.deleted === true) bits |= 4;
  if (user.archived === true) bits |= 8;
  if (user.revoked === true) bits |= 16;
  if (user.blocked === true) bits |= 32;
  if (user.banned === true) bits |= 64;
  if (user.suspended === true) bits |= 128;
  if (user.active === false) bits |= 256;
  if (user.enabled === false) bits |= 512;
  return bits;
}
function userLooksDisabledByFlag(user = null) { return userFlagBits(user) !== 0; }
function isUsableUser(user = null) { return isObject(user) && !userLooksDisabledByFlag(user) && !DISABLED_STATUSES.has(userStatus(user)); }
function normalizePermissions(value = []) {
  const input = Array.isArray(value) ? value.flat(Infinity) : [];
  return [...new Set(input.map((item) => cleanText(item, "")).filter(Boolean).slice(0, 250))];
}
function publicUser(user = null) {
  if (!isObject(user)) return null;
  const role = normalizeRole(first(user.role, user.rol, user.roles, "")) || "user";
  const slug = extractUserSlug(user);
  const status = userStatus(user) || (userLooksDisabledByFlag(user) ? "disabled" : "active");
  return {
    id: first(user.id, user.userId, null), userId: first(user.userId, user.id, null),
    username: first(user.username, user.userName, user.user_name, null), slug,
    displayName: first(user.displayName, user.fullName, user.name, user.nombre, user.profile?.displayName, user.profile?.name, user.username, "Usuario"),
    role, rol: role, roles: [role],
    avatarUrl: cleanText(first(user.avatarUrl, user.avatar, user.picture, user.photoUrl, user.profile?.avatarUrl, user.profile?.avatar, ""), ""), status,
  };
}
function normalizeUser(user = null) {
  const output = publicUser(user);
  if (!output) return null;
  const permissions = normalizePermissions(first(user.permissions, user.permisos, user.profile?.permissions, []));
  return { ...output, permissions, permisos: [...permissions], usable: isUsableUser(user) };
}
function cloneCanonicalUser(user = null) {
  if (!isObject(user) || !isUsableUser(user)) return null;
  return { ...user, roles: Array.isArray(user.roles) ? [...user.roles] : [], permissions: Array.isArray(user.permissions) ? [...user.permissions] : [], permisos: Array.isArray(user.permisos) ? [...user.permisos] : [] };
}

function currentUserRoleSignal(user = state.user) {
  if (!isObject(user)) return "";
  return normalizeRole(first(user.role, user.rol, user.roles, ""));
}
function authInputsChanged() {
  const user = state.user;
  return !authSignal.initialized ||
    authSignal.token !== state.token || authSignal.accessToken !== state.accessToken || authSignal.access_token !== state.access_token ||
    authSignal.user !== user || authSignal.userStatus !== (isObject(user) ? first(user.status, user.estado, user.state, user.accountStatus, null) : null) ||
    authSignal.userRole !== currentUserRoleSignal(user) || authSignal.userSlug !== rawUserSlug(user) || authSignal.userFlags !== userFlagBits(user) ||
    authSignal.session !== state.session || authSignal.sessionId !== state.sessionId || authSignal.sessionUserId !== state.sessionUserId ||
    authSignal.fallbackRole !== state.role || authSignal.fallbackRol !== state.rol;
}
function captureAuthInputs() {
  const user = state.user;
  authSignal.initialized = true;
  authSignal.token = state.token; authSignal.accessToken = state.accessToken; authSignal.access_token = state.access_token;
  authSignal.user = user;
  authSignal.userStatus = isObject(user) ? first(user.status, user.estado, user.state, user.accountStatus, null) : null;
  authSignal.userRole = currentUserRoleSignal(user);
  authSignal.userSlug = rawUserSlug(user);
  authSignal.userFlags = userFlagBits(user);
  authSignal.session = state.session; authSignal.sessionId = state.sessionId; authSignal.sessionUserId = state.sessionUserId;
  authSignal.fallbackRole = state.role; authSignal.fallbackRol = state.rol;
}
function syncAuthDerivedState(options = {}) {
  runtimeMetrics.reconciliations += 1;
  const user = state.user;
  const safeUser = isUsableUser(user) ? user : null;
  const token = cleanToken(state.token || state.accessToken || state.access_token);
  const role = safeUser ? (normalizeRole(first(safeUser.role, safeUser.rol, safeUser.roles, state.role, state.rol, "user")) || "user") : null;
  const slug = safeUser ? extractUserSlug(safeUser) : "";
  const homePath = safeUser ? buildUserHomePath(slug) : ROOT_PATH;
  const roles = safeUser && role ? [role] : [];
  const hasSession = Boolean(state.session || state.sessionId || state.sessionUserId);
  let changed = false;
  for (const [key, value] of [["token", token], ["accessToken", token], ["access_token", token], ["hasToken", Boolean(token)], ["user", safeUser], ["currentUser", safeUser], ["hasUser", Boolean(safeUser)], ["role", role], ["rol", role], ["userSlug", safeUser ? slug || null : null], ["homePath", homePath], ["defaultHome", homePath], ["postLoginTarget", token && safeUser ? homePath : null], ["authenticated", Boolean(token && safeUser)], ["hasSession", hasSession]]) changed = setScalar(key, value) || changed;
  changed = setArray("roles", roles) || changed;
  captureAuthInputs();
  if (changed && options.touch === true) touch();
  return changed;
}

function normalizePathname(value = ROOT_PATH) {
  try { if (isFunction(configNormalizeRoutePath)) return configNormalizeRoutePath(value) || ROOT_PATH; } catch {}
  let path = cleanText(value, ROOT_PATH).split("#")[0].split("?")[0].replace(/\\/g, "/");
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/g, "") || ROOT_PATH;
  return path || ROOT_PATH;
}
function sanitizeLegacyTokenPath(value = ROOT_PATH) { return cleanText(value, ROOT_PATH).replace(LEGACY_RESET_TOKEN_PATH, "$1***"); }
function safeSearch(value = "") {
  const raw = cleanText(value, "");
  if (!raw || raw === "?") return "";
  const search = raw.startsWith("?") ? raw : `?${raw.replace(/^\?+/, "")}`;
  try {
    const params = new URLSearchParams(search);
    for (const key of [...params.keys()]) if (SENSITIVE_QUERY_KEYS.has(normalizeKey(key))) params.delete(key);
    const output = params.toString(); return output ? `?${output}` : "";
  } catch { return ""; }
}
function safeHash(value = "") {
  const hash = cleanText(value, "");
  if (!hash || hash === "#" || /[\r\n\t\\]/.test(hash)) return "";
  return redact(hash.startsWith("#") ? hash : `#${hash.replace(/^#+/, "")}`);
}
function pathFromInput(value = ROOT_PATH) {
  const raw = cleanText(value, ROOT_PATH);
  try { if (isFunction(configRoutePathFromUrlLike)) return configRoutePathFromUrlLike(raw) || ROOT_PATH; } catch {}
  if (!raw || raw.startsWith("//") || /[\r\n\t\\]/.test(raw)) return ROOT_PATH;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    try { const url = new URL(raw); return isBrowser() && url.origin === window.location.origin ? `${url.pathname || ROOT_PATH}${url.search || ""}${url.hash || ""}` : ROOT_PATH; }
    catch { return ROOT_PATH; }
  }
  return raw;
}
function splitPath(value = ROOT_PATH) {
  let pathname = pathFromInput(value); let search = ""; let hash = "";
  const hashIndex = pathname.indexOf("#");
  if (hashIndex >= 0) { hash = pathname.slice(hashIndex); pathname = pathname.slice(0, hashIndex) || ROOT_PATH; }
  const searchIndex = pathname.indexOf("?");
  if (searchIndex >= 0) { search = pathname.slice(searchIndex); pathname = pathname.slice(0, searchIndex) || ROOT_PATH; }
  return { pathname: normalizePathname(sanitizeLegacyTokenPath(pathname)), search: safeSearch(search), hash: safeHash(hash) };
}
function normalizePublicPath(value = ROOT_PATH) { const parts = splitPath(value); return `${parts.pathname}${parts.search}${parts.hash}` || ROOT_PATH; }
function normalizeCanonicalPath(value = ROOT_PATH) {
  const pathname = splitPath(value).pathname;
  if (!pathname.startsWith(USER_HOME_PREFIX)) return pathname || ROOT_PATH;
  const [, ...segments] = pathname.slice(USER_HOME_PREFIX.length).split("/");
  return segments.length ? normalizePathname(`/${segments.join("/")}`) : ROOT_PATH;
}
function getUserScopedRouteInfo(value = ROOT_PATH) {
  const safeValue = normalizePublicPath(value);
  try { if (isFunction(configGetUserScopedRouteInfo)) return configGetUserScopedRouteInfo(safeValue); } catch {}
  const pathname = splitPath(safeValue).pathname;
  if (!pathname.startsWith(USER_HOME_PREFIX)) return { scoped: false, home: false, slug: "", canonicalPath: pathname, restPath: pathname, lookupPath: pathname };
  const [slugSegment = "", ...segments] = pathname.slice(USER_HOME_PREFIX.length).split("/");
  const slug = normalizeSlug(slugSegment);
  if (!slug) return { scoped: false, home: false, slug: "", canonicalPath: pathname, restPath: pathname, lookupPath: pathname };
  const restPath = segments.length ? normalizePathname(`/${segments.join("/")}`) : ROOT_PATH;
  return { scoped: true, home: restPath === ROOT_PATH, slug, canonicalPath: restPath, restPath, lookupPath: restPath };
}
function safeInternalPath(value = ROOT_PATH) {
  const raw = cleanText(value, ROOT_PATH);
  if (!raw || raw.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(raw) || /[\r\n\t\\]/.test(raw)) return ROOT_PATH;
  const path = normalizePublicPath(raw); return path.startsWith("/") ? path : ROOT_PATH;
}

function normalizeSessionContext(value = null, user = null) {
  if (!isObject(value)) return null;
  const sessionId = cleanText(first(value.sessionId, value.session_id, value.sid, value.id, ""), "");
  const userId = cleanText(first(value.sessionUserId, value.session_user_id, value.userId, value.user_id, user?.userId, user?.id, ""), "");
  const expiresAt = first(value.expiresAt, value.expires_at, value.refreshExpiresAt, value.refresh_expires_at, null);
  if (!sessionId && !userId && !expiresAt) return null;
  return { sessionId: sessionId || null, id: sessionId || null, userId: userId || null, sessionUserId: userId || null, expiresAt, active: value.active !== false, revoked: value.revoked === true, persistent: value.persistent === true || value.restoreOnBoot === true };
}

function sanitizePatchValue(key = "", value = null) {
  const normalizedKey = normalizeKey(key);
  if (SENSITIVE_STATE_KEYS.has(normalizedKey)) return undefined;
  if (normalizedKey === "error" || normalizedKey === "lasterror") return safeError(value);
  if (normalizedKey === "route" || normalizedKey === "publicpath") return normalizePublicPath(value);
  if (normalizedKey === "canonicalpath") return normalizeCanonicalPath(value);
  if (normalizedKey === "routeparams") { const safe = sanitizeObject(isObject(value) ? value : {}); return isObject(safe) ? safe : {}; }
  if (normalizedKey === "theme") return "system";
  if (normalizedKey === "lang") return "es";
  if (normalizedKey === "locale") return "es-ES";
  if (["function", "symbol", "bigint"].includes(typeof value)) return undefined;
  return clone(value);
}

function getRuntimeState() {
  runtimeMetrics.reads += 1;
  if (authInputsChanged()) {
    runtimeMetrics.legacyRepairs += authSignal.initialized ? 1 : 0;
    syncAuthDerivedState({ touch: false });
  }
  return state;
}
function getState(options = {}) {
  const current = getRuntimeState();
  if (options.raw === true) return current;
  const snapshot = clone(current) || {};
  if (options.includeToken !== true) snapshot.token = snapshot.accessToken = snapshot.access_token = null;
  return snapshot;
}
function setState(patch = {}, options = {}) {
  if (!isObject(patch)) return getState(options);
  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    const normalizedKey = normalizeKey(key);
    if (["user", "currentuser", "authuser", "sessionuser"].includes(normalizedKey)) {
      changed = setScalar("user", normalizeUser(value)) || changed; continue;
    }
    if (["token", "accesstoken"].includes(normalizedKey)) {
      const next = cleanToken(value);
      changed = setScalar("token", next) || changed;
      changed = setScalar("accessToken", next) || changed;
      changed = setScalar("access_token", next) || changed;
      continue;
    }
    if (["session", "sessiondata", "currentsession"].includes(normalizedKey)) {
      const session = normalizeSessionContext(value, state.user);
      changed = setScalar("session", session) || changed;
      changed = setScalar("sessionData", session) || changed;
      changed = setScalar("sessionId", session?.sessionId || null) || changed;
      changed = setScalar("sessionUserId", session?.sessionUserId || null) || changed;
      changed = setScalar("hasSession", Boolean(session)) || changed;
      continue;
    }
    const sanitized = sanitizePatchValue(key, value);
    if (sanitized === undefined) continue;
    if (Array.isArray(sanitized)) { changed = setArray(key, sanitized) || changed; continue; }
    if (state[key] !== sanitized) { state[key] = sanitized; changed = true; }
  }
  const derivedChanged = syncAuthDerivedState({ touch: false });
  if (changed || derivedChanged) touch();
  return getState(options);
}
function setRuntimeState(patch = {}) { runtimeMetrics.writes += 1; return setState(patch, { raw: true }); }
const runtimeState = Object.freeze({
  version: RUNTIME_STATE_VERSION,
  read: getRuntimeState,
  write: setRuntimeState,
  getStats: () => Object.freeze({ ...runtimeMetrics }),
});
function patchState(patch = {}, options = {}) { return setState(patch, options); }

function setRoute(route = ROOT_PATH) {
  const publicPath = normalizePublicPath(route); const canonicalPath = normalizeCanonicalPath(route);
  mutate(() => { let changed = false; changed = setScalar("route", canonicalPath) || changed; changed = setScalar("canonicalPath", canonicalPath) || changed; changed = setScalar("publicPath", publicPath) || changed; return changed; });
  return getState();
}
function setPublicPath(path = ROOT_PATH) {
  const publicPath = normalizePublicPath(path); const canonicalPath = normalizeCanonicalPath(path);
  mutate(() => { let changed = false; changed = setScalar("publicPath", publicPath) || changed; changed = setScalar("canonicalPath", canonicalPath) || changed; changed = setScalar("route", canonicalPath) || changed; return changed; });
  return getState();
}
function setUser(user = null) {
  const changed = setScalar("user", normalizeUser(user)); const derivedChanged = syncAuthDerivedState({ touch: false });
  if (changed || derivedChanged) touch(); return getState();
}
function setToken(token = null) {
  const clean = cleanToken(token); let changed = false;
  changed = setScalar("token", clean) || changed; changed = setScalar("accessToken", clean) || changed; changed = setScalar("access_token", clean) || changed;
  const derivedChanged = syncAuthDerivedState({ touch: false }); if (changed || derivedChanged) touch(); return getState();
}
function applySession(payload = {}) {
  if (!isObject(payload)) return getState();
  const token = first(payload.token, payload.accessToken, payload.access_token, payload.data?.token, payload.data?.accessToken, payload.data?.access_token, payload.auth?.token, payload.auth?.accessToken, null);
  const user = first(payload.user, payload.currentUser, payload.data?.user, payload.data?.currentUser, payload.auth?.user, payload.auth?.currentUser, null);
  const sessionPayload = first(payload.session, payload.sessionData, payload.currentSession, payload.data?.session, payload.auth?.session, null);
  let changed = false;
  if (token !== null && token !== undefined) {
    const clean = cleanToken(token); changed = setScalar("token", clean) || changed; changed = setScalar("accessToken", clean) || changed; changed = setScalar("access_token", clean) || changed;
  }
  if (user !== null && user !== undefined) changed = setScalar("user", normalizeUser(user)) || changed;
  if (sessionPayload !== null && sessionPayload !== undefined) {
    const session = normalizeSessionContext(sessionPayload, state.user);
    changed = setScalar("session", session) || changed; changed = setScalar("sessionData", session) || changed;
    changed = setScalar("sessionId", session?.sessionId || null) || changed; changed = setScalar("sessionUserId", session?.sessionUserId || null) || changed; changed = setScalar("hasSession", Boolean(session)) || changed;
  }
  if (payload.hasRefreshToken !== undefined) changed = setScalar("hasRefreshToken", payload.hasRefreshToken === true) || changed;
  const derivedChanged = syncAuthDerivedState({ touch: false }); if (changed || derivedChanged) touch(); return getState();
}
function clearSession() {
  let changed = false;
  for (const key of ["token", "accessToken", "access_token", "user", "currentUser", "role", "rol", "userSlug", "postLoginTarget", "session", "sessionData", "sessionId", "sessionUserId"]) changed = setScalar(key, null) || changed;
  for (const key of ["hasToken", "authenticated", "hasUser", "hasSession", "hasRefreshToken"]) changed = setScalar(key, false) || changed;
  changed = setArray("roles", []) || changed; changed = setScalar("homePath", ROOT_PATH) || changed; changed = setScalar("defaultHome", ROOT_PATH) || changed;
  captureAuthInputs();
  try { getHttpClient()?.clearAuthTokens?.(); } catch {}
  if (changed) touch(); return getState();
}
function setTheme() { if (state.theme !== "system") { state.theme = "system"; touch(); } return getState(); }
function setLang() { const changed = state.lang !== "es" || state.locale !== "es-ES"; state.lang = "es"; state.locale = "es-ES"; if (changed) touch(); return getState(); }
function setSidebarOpen(value = false) { const next = value === true; if (state.sidebarOpen !== next) { state.sidebarOpen = next; touch(); } return getState(); }
function setLoading(value = false) { const next = value === true; if (state.loading !== next) { state.loading = next; touch(); } return getState(); }
function setError(error = null) { state.error = safeError(error); touch(); return getState(); }

function isAuthenticated() { return getRuntimeState().authenticated === true; }
function getCurrentUser() { const current = getRuntimeState(); return current.hasUser ? cloneCanonicalUser(current.user) : null; }
function getCurrentRole() { return getRuntimeState().role || null; }
function hasRole(roleOrRoles = []) {
  const current = getRuntimeState(); if (!current.authenticated) return false;
  const requested = Array.isArray(roleOrRoles) ? roleOrRoles.flat(Infinity) : [roleOrRoles];
  const roles = requested.map(normalizeRole).filter(Boolean); if (!roles.length || current.role === "admin") return true; return roles.includes(current.role);
}
function getAuthHeader() { const token = getRuntimeState().token; return token ? { Authorization: `Bearer ${token}` } : {}; }

function registerModule(name = "", value = null, options = {}) {
  const key = cleanText(name, ""); if (!key) return null;
  if (moduleRegistry.has(key) && options.overwrite === false) return moduleRegistry.get(key);
  moduleRegistry.set(key, value); return value;
}
function getModule(name = "") { return moduleRegistry.get(cleanText(name, "")) || null; }
function removeModule(name = "") { return moduleRegistry.delete(cleanText(name, "")); }
function listModules() { return [...moduleRegistry.keys()]; }
const modules = { register: registerModule, get: getModule, remove: removeModule, list: listModules };

function setHttpClient(value = null) {
  if (!value) return false; if (httpClient === value) return true;
  httpClient = value; activeRequestClient = null; activeRequestBound = null;
  registerModule("http", httpClient, { overwrite: true }); return true;
}
function getHttpClient() {
  if (httpClient) return httpClient;
  httpClient = Http; registerModule("http", httpClient, { overwrite: true }); return httpClient;
}
function installHttpBridge(value = null) {
  if (value) setHttpClient(value); const client = getHttpClient(); try { client?.install?.(AppCore); } catch {} return client;
}
function getActiveRequest() {
  const client = getHttpClient();
  if (isFunction(client?.request)) {
    if (activeRequestClient !== client || !isFunction(activeRequestBound)) { activeRequestClient = client; activeRequestBound = client.request.bind(client); }
    return activeRequestBound;
  }
  return isFunction(client) ? client : null;
}
function getActiveApiClient() { return getHttpClient(); }
function request(...args) { const activeRequest = getActiveRequest(); if (!isFunction(activeRequest)) throw new Error("HTTP request() no disponible."); return activeRequest(...args); }

function setShowToast(fn = null) { if (!isFunction(fn)) return false; toastBridge = fn; return true; }
function showToast(message = "", type = "info", options = {}) {
  const text = isObject(message) ? cleanText(first(message.message, message.text, message.title, "")) : cleanText(message, "");
  if (!text) return null;
  const variant = isObject(message) ? cleanText(first(message.type, message.variant, type, "info"), "info") : cleanText(type, "info");
  if (toastBridge) return toastBridge(text, variant, options);
  const toast = getModule("toast");
  if (isFunction(toast?.show)) return toast.show({ ...(isObject(options) ? options : {}), type: variant, message: text });
  if (isFunction(toast?.[variant])) return toast[variant](text, options);
  return null;
}

function ready(fn = null) {
  if (!isFunction(fn)) return () => false;
  if (!isBrowser() || document.readyState !== "loading") { try { fn(); } catch {} return () => true; }
  document.addEventListener("DOMContentLoaded", fn, { once: true });
  return () => { try { document.removeEventListener("DOMContentLoaded", fn); } catch {} return true; };
}
async function init() {
  if (state.initialized) return AppCore;
  state.booting = true; state.loading = true; state.ready = false; state.error = null; touch();
  try {
    installHttpBridge(Http); state.initialized = true; state.booting = false; state.loading = false; state.ready = true; touch(); captureAuthInputs(); return AppCore;
  } catch (error) {
    state.booting = false; state.loading = false; state.ready = false; state.error = safeError(error); touch(); throw error;
  }
}
function snapshotUser(user = null) { const safe = publicUser(user); return safe ? { ...safe, avatarUrl: safe.avatarUrl ? "***" : "" } : null; }
function getSnapshot() {
  const snapshot = getState();
  return Object.freeze({
    version: CORE_VERSION, appName: APP_NAME, initialized: snapshot.initialized === true, ready: snapshot.ready === true,
    booting: snapshot.booting === true, loading: snapshot.loading === true, authenticated: snapshot.authenticated === true,
    hasToken: snapshot.hasToken === true, hasUser: snapshot.hasUser === true, user: snapshotUser(snapshot.user), role: snapshot.role,
    roles: Array.isArray(snapshot.roles) ? [...snapshot.roles] : [], userSlug: snapshot.userSlug, homePath: snapshot.homePath || ROOT_PATH,
    route: redact(snapshot.route || ROOT_PATH), canonicalPath: redact(snapshot.canonicalPath || ROOT_PATH), publicPath: redact(snapshot.publicPath || ROOT_PATH),
    lang: snapshot.lang, locale: snapshot.locale, theme: snapshot.theme, hasHttp: Boolean(httpClient), hasRuntimeStatePort: true,
    runtimeState: Object.freeze({ version: RUNTIME_STATE_VERSION, ...runtimeMetrics }),
    modules: Object.freeze(listModules()),
    session: Object.freeze({ hasSession: snapshot.hasSession === true, sessionId: snapshot.sessionId ? "***" : null, sessionUserId: snapshot.sessionUserId ? "***" : null, hasRefreshToken: snapshot.hasRefreshToken === true }),
    error: snapshot.error, updatedAt: snapshot.updatedAt,
  });
}

export const AppCore = {
  CORE_VERSION, version: CORE_VERSION, config, state, runtimeState, dom, ui, modules,
  init, ready, getState, setState, patchState, getRuntimeState, setRuntimeState,
  isAuthenticated, getCurrentUser, getCurrentRole, hasRole, getAuthHeader,
  setRoute, setPublicPath, setUser, setToken, applySession, clearSession,
  setTheme, setLang, setSidebarOpen, setLoading, setError,
  setShowToast, showToast, registerModule, getModule,
  installHttpBridge, setHttpClient, getHttpClient, getActiveRequest, getActiveApiClient, request,
  normalizeRole, normalizeUser, normalizeSlug, extractUserSlug, buildUserHomePath, publicUser, isUsableUser,
  normalizeSessionContext, normalizePublicPath, normalizeCanonicalPath, getUserScopedRouteInfo, safeInternalPath,
  utils: { cleanText, text: cleanText, clone, redact, safeError, isObject, isFunction },
  getSnapshot, getDebugSnapshot: getSnapshot, snapshot: getSnapshot,
};

function defineModuleAlias(name = "", registryName = "") {
  Object.defineProperty(AppCore, name, { configurable: true, enumerable: false, get() { return getModule(registryName); }, set(value) { registerModule(registryName, value, { overwrite: true }); } });
}
Object.defineProperties(AppCore, {
  http: { configurable: true, enumerable: false, get() { return getHttpClient(); }, set(value) { setHttpClient(value); } },
  Http: { configurable: true, enumerable: false, get() { return getHttpClient(); }, set(value) { setHttpClient(value); } },
});
for (const [name, registryName] of [["auth", "auth"], ["Auth", "auth"], ["router", "router"], ["Router", "router"], ["toast", "toast"], ["Toast", "toast"], ["sidebar", "sidebar"], ["Sidebar", "sidebar"], ["topbar", "topbar"], ["Topbar", "topbar"]]) defineModuleAlias(name, registryName);

export default AppCore;
