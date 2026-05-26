/* =========================================================
   Onion Support - Auth Storage
   Archivo: /src/features/auth/storage.js

   Responsabilidad:
   - Storage mínimo de Auth.
   - Persistir access token para soportar reload.
   - Persistir refresh token para restore persistente.
   - Persistir contexto auxiliar mínimo no canónico.
   - No autenticar por sí mismo.
   - Nunca storage.clear().
   - Delegar slug/rutas bloqueadas en core/config.js.
   - Sin AppCore.
   - Sin Router.
   - Sin HTTP.
   - Sin sesión compleja.
   - Sin legacy masivo.
   - Sin 2FA/MFA/OTP.
   - Sin temp token real.
   - Sin inventar slug.
   - Sin persistir usuario completo.
   - Sin fabricar usuario desde payload token-only.
   - Sin arrastrar refresh/session de otro usuario.

   CONTRATO RESTORE:
   - refreshToken es el contexto mínimo para intentar /api/auth/refresh.
   - sessionId/userId son preferidos si existen.
   - user completo nunca se usa como fuente canónica desde storage.
========================================================= */

import {
  USER_HOME_PREFIX as CONFIG_USER_HOME_PREFIX,
  isBlockedRoutePath as configIsBlockedRoutePath,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../../core/config.js";

import {
  AUTH_STORAGE_KEYS,
  AUTH_CONSTANTS,
} from "./constants.js";

export const AUTH_STORAGE_VERSION = "auth.storage.v8";

const PREFIX = "onion:auth:";
const USER_HOME_PREFIX = CONFIG_USER_HOME_PREFIX || "/@";

const memory = new Map();

let lastStorageError = null;

/* =========================================================
   KEYS
========================================================= */

const KEYS = Object.freeze({
  token: AUTH_STORAGE_KEYS?.token || "token",
  accessToken: AUTH_STORAGE_KEYS?.accessToken || "access_token",
  refreshToken: AUTH_STORAGE_KEYS?.refreshToken || "refresh_token",

  role: AUTH_STORAGE_KEYS?.role || "role",

  sessionId: "session_id",
  sessionUserId: "session_user_id",
  userId: "user_id",
  sessionExpiresAt: "session_expires_at",

  userSlug: "user_slug",

  redirectAfterLogin: "redirect_after_login",
});

const CLEAR_KEYS = Object.freeze([
  KEYS.token,
  KEYS.accessToken,
  KEYS.refreshToken,

  KEYS.role,

  KEYS.sessionId,
  KEYS.sessionUserId,
  KEYS.userId,
  KEYS.sessionExpiresAt,

  KEYS.userSlug,

  KEYS.redirectAfterLogin,
]);

const SESSION_CONTEXT_KEYS = Object.freeze([
  KEYS.sessionId,
  KEYS.sessionUserId,
  KEYS.userId,
  KEYS.sessionExpiresAt,
]);

const AUX_USER_KEYS = Object.freeze([
  KEYS.userSlug,
  KEYS.role,
]);

const BAD_VALUES = new Set([
  "",
  "undefined",
  "null",
  "false",
  "true",
  "nan",
  "none",
  "{}",
  "[]",
  "[object object]",
  "\"\"",
  "''",
]);

const ACCESS_TOKEN_FIELDS = Object.freeze([
  "token",
  "accessToken",
  "access_token",
  "value",
]);

const REFRESH_TOKEN_FIELDS = Object.freeze([
  "refreshToken",
  "refresh_token",
  "value",
]);

const SENSITIVE_QUERY_KEYS = Object.freeze([
  "token",
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

function isBrowser() {
  return typeof window !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function number(value, fallback = 0) {
  const output = Number(value);
  return Number.isFinite(output) ? output : fallback;
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function recordError(error = null) {
  lastStorageError = error || null;
}

function key(name = "") {
  const clean = cleanText(name, "");
  return clean ? `${PREFIX}${clean}` : "";
}

function localStore() {
  try {
    return isBrowser() ? window.localStorage : null;
  } catch (error) {
    recordError(error);
    return null;
  }
}

function sessionStore() {
  try {
    return isBrowser() ? window.sessionStorage : null;
  } catch (error) {
    recordError(error);
    return null;
  }
}

/* =========================================================
   RAW STORAGE
========================================================= */

function readFrom(storage, name = "") {
  if (!storage || !name) return "";

  try {
    return storage.getItem(key(name)) || "";
  } catch (error) {
    recordError(error);
    return "";
  }
}

function writeTo(storage, name = "", value = "") {
  if (!storage || !name || !value) return false;

  try {
    storage.setItem(key(name), value);
    return true;
  } catch (error) {
    recordError(error);
    return false;
  }
}

function removeFrom(storage, name = "") {
  if (!storage || !name) return false;

  try {
    storage.removeItem(key(name));
    return true;
  } catch (error) {
    recordError(error);
    return false;
  }
}

function readMemory(name = "") {
  return memory.get(key(name)) || "";
}

function writeMemory(name = "", value = "") {
  if (!name || !value) return false;

  memory.set(key(name), value);
  return true;
}

function removeMemory(name = "") {
  return memory.delete(key(name));
}

function readRaw(name = "") {
  return (
    readFrom(sessionStore(), name) ||
    readFrom(localStore(), name) ||
    readMemory(name) ||
    ""
  );
}

function writeRaw(name = "", value = "", options = {}) {
  const clean = cleanText(value, "");

  if (!name) return false;
  if (!clean) return removeRaw(name);

  const useSession = options.session === true || options.storage === "session";

  const primary = useSession ? sessionStore() : localStore();
  const secondary = useSession ? localStore() : sessionStore();

  /*
    Sólo removemos nuestras claves concretas namespaced.
    Nunca se llama storage.clear().
  */
  removeFrom(secondary, name);
  removeMemory(name);

  return Boolean(writeTo(primary, name, clean) || writeMemory(name, clean));
}

function removeRaw(name = "") {
  if (!name) return false;

  removeFrom(localStore(), name);
  removeFrom(sessionStore(), name);
  removeMemory(name);

  return true;
}

function readFirst(names = []) {
  for (const name of names) {
    const value = readRaw(name);

    if (value) return value;
  }

  return "";
}

function removeMany(names = []) {
  for (const name of names) {
    removeRaw(name);
  }

  return true;
}

/* =========================================================
   NORMALIZERS
========================================================= */

function isBad(value = "") {
  return BAD_VALUES.has(cleanText(value, "").toLowerCase());
}

function maxTokenLength() {
  return number(AUTH_CONSTANTS?.tokenMaxLength, 8192) || 8192;
}

function maxTextLength() {
  return number(AUTH_CONSTANTS?.textValueMaxLength, 300) || 300;
}

function maxSessionLength() {
  return number(AUTH_CONSTANTS?.sessionValueMaxLength, 200) || 200;
}

function unwrapTokenValue(value = null, fields = ACCESS_TOKEN_FIELDS) {
  if (value === null || value === undefined) return "";

  if (isObject(value)) {
    for (const field of fields) {
      const output = value[field];

      if (output !== undefined && output !== null && output !== "") {
        return output;
      }
    }

    return "";
  }

  return value;
}

function normalizeToken(value = null, fields = ACCESS_TOKEN_FIELDS) {
  let token = cleanText(unwrapTokenValue(value, fields), "");

  token = token.replace(/^Bearer\s+/i, "").trim();

  if (!token) return "";
  if (isBad(token)) return "";
  if (/\s/.test(token)) return "";
  if (token.length > maxTokenLength()) return "";

  return token;
}

function normalizeAccessToken(value = null) {
  return normalizeToken(value, ACCESS_TOKEN_FIELDS);
}

function normalizeRefreshToken(value = null) {
  return normalizeToken(value, REFRESH_TOKEN_FIELDS);
}

function normalizeText(value = null, limit = maxTextLength()) {
  const output = cleanText(
    isObject(value) ? value.value : value,
    ""
  );

  if (!output) return "";
  if (isBad(output)) return "";
  if (output.length > limit) return "";

  return output;
}

function normalizeSessionValue(value = null) {
  return normalizeText(value, maxSessionLength());
}

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = cleanText(value, "").toLowerCase();

  return role === "admin" || role === "user" ? role : "";
}

function normalizeSlug(value = "") {
  try {
    return configNormalizeUserSlug(value) || "";
  } catch {
    const slug = cleanText(value, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^\/+/, "")
      .replace(/^@+/, "")
      .split(/[/?#]/)[0]
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .toLowerCase();

    if (!slug) return "";

    return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
  }
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i.test(
    String(value || "")
  );
}

function normalizeRoutePathOnly(value = "") {
  try {
    return configNormalizeRoutePath(value) || "";
  } catch {
    let path = cleanText(value, "")
      .split("#")[0]
      .split("?")[0]
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

    if (!path) return "";

    if (!path.startsWith("/")) {
      path = `/${path}`;
    }

    if (path.length > 1) {
      path = path.replace(/\/+$/g, "") || "/";
    }

    return path || "";
  }
}

function userScopedRestPath(path = "") {
  const clean = normalizeRoutePathOnly(path);

  if (!clean.startsWith(USER_HOME_PREFIX)) return "";

  const rest = clean.slice(USER_HOME_PREFIX.length);
  const [slugSegment = "", ...segments] = rest.split("/");
  const slug = normalizeSlug(slugSegment);

  if (!slug) return "";

  return segments.length
    ? normalizeRoutePathOnly(`/${segments.join("/")}`)
    : "/";
}

function isBlockedFallbackRoute(path = "") {
  const clean = normalizeRoutePathOnly(path).toLowerCase();

  return Boolean(
    clean === "/home" ||
      clean.startsWith("/home/") ||
      clean === "/403" ||
      clean.startsWith("/403/") ||
      clean === "/404" ||
      clean.startsWith("/404/") ||
      clean === "/2fa" ||
      clean.startsWith("/2fa/") ||
      clean === "/mfa" ||
      clean.startsWith("/mfa/") ||
      clean === "/otp" ||
      clean.startsWith("/otp/")
  );
}

function isBlockedRoute(path = "") {
  try {
    if (configIsBlockedRoutePath(path) === true) return true;
  } catch {
    // fallback abajo
  }

  if (isBlockedFallbackRoute(path)) return true;

  const scopedRest = userScopedRestPath(path);

  return Boolean(scopedRest && isBlockedFallbackRoute(scopedRest));
}

function normalizeRoute(value = "") {
  let route = cleanText(value, "");

  if (!route) return "";
  if (route.length > 1000) return "";
  if (route.startsWith("//")) return "";
  if (/[\r\n\t\\]/.test(route)) return "";
  if (hasSensitiveQuery(route)) return "";

  try {
    route = configRoutePathFromUrlLike(route) || "";
  } catch {
    // fallback abajo
  }

  if (!route) return "";
  if (!route.startsWith("/")) return "";
  if (route.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(route)) return "";
  if (/[\r\n\t\\]/.test(route)) return "";
  if (hasSensitiveQuery(route)) return "";

  const hashIndex = route.indexOf("#");
  const beforeHash = hashIndex >= 0 ? route.slice(0, hashIndex) : route;
  const hash = hashIndex >= 0 ? route.slice(hashIndex) : "";

  const queryIndex = beforeHash.indexOf("?");
  const pathnameRaw = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const search = queryIndex >= 0 ? beforeHash.slice(queryIndex) : "";

  const pathname = normalizeRoutePathOnly(pathnameRaw);

  if (!pathname) return "";
  if (isBlockedRoute(pathname)) return "";

  return `${pathname}${search}${hash}`;
}

function extractRealUserSlug(user = null) {
  if (!isObject(user)) return "";

  return normalizeSlug(
    user.slug ||
      user.lookup?.slug ||
      user.profile?.slug ||
      user.routing?.slug ||
      ""
  );
}

function extractUserId(user = null) {
  if (!isObject(user)) return "";

  return normalizeSessionValue(
    user.userId ||
      user.id ||
      user.uid ||
      user.sub ||
      ""
  );
}

function looksLikeNestedUserObject(value = null) {
  if (!isObject(value)) return false;

  return Boolean(
    cleanText(value.userId || value.id || value.uid || value.sub, "") ||
      cleanText(value.username || value.userName || value.user_name, "") ||
      cleanText(value.slug, "") ||
      cleanText(value.lookup?.slug, "") ||
      cleanText(value.profile?.slug, "")
  );
}

function looksLikeStandaloneUserObject(value = null) {
  if (!isObject(value)) return false;

  const hasUserSignal = Boolean(
    cleanText(value.username || value.userName || value.user_name, "") ||
      cleanText(value.slug, "") ||
      cleanText(value.lookup?.slug, "") ||
      cleanText(value.profile?.slug, "") ||
      cleanText(value.displayName || value.fullName || value.name || value.nombre, "")
  );

  const hasSessionOnlySignal = Boolean(
    value.token ||
      value.accessToken ||
      value.access_token ||
      value.refreshToken ||
      value.refresh_token ||
      value.sessionId ||
      value.session_id ||
      value.session ||
      value.sessionData
  );

  return Boolean(hasUserSignal && !hasSessionOnlySignal);
}

/* =========================================================
   PAYLOAD HELPERS
========================================================= */

function nested(payload = {}) {
  const source = isObject(payload) ? payload : {};

  return [
    source,
    isObject(source.data) ? source.data : null,
    isObject(source.payload) ? source.payload : null,
    isObject(source.result) ? source.result : null,
    isObject(source.auth) ? source.auth : null,
    isObject(source.session) ? source.session : null,
    isObject(source.sessionData) ? source.sessionData : null,
  ].filter(Boolean);
}

function pick(nodes = [], names = []) {
  for (const node of nodes) {
    for (const name of names) {
      const value = node?.[name];

      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  }

  return undefined;
}

function readUserFromPayload(payload = {}) {
  for (const node of nested(payload)) {
    const user =
      node.user ||
      node.usuario ||
      node.me ||
      node.account ||
      node.profile ||
      null;

    if (looksLikeNestedUserObject(user)) return user;
  }

  return looksLikeStandaloneUserObject(payload) ? payload : null;
}

function readSessionFromPayload(payload = {}) {
  for (const node of nested(payload)) {
    const session =
      node.session ||
      node.sessionData ||
      null;

    if (isObject(session)) return session;
  }

  return null;
}

function explicitIdentityMismatch({
  user = null,
  sessionData = null,
} = {}) {
  const safeUser = isObject(user) ? user : null;
  const safeSession = isObject(sessionData) ? sessionData : null;

  const explicitUserId = extractUserId(safeUser);

  const sessionUserId = normalizeSessionValue(
    safeSession?.sessionUserId ||
      safeSession?.session_user_id ||
      safeSession?.userId ||
      safeSession?.user_id ||
      safeSession?.uid ||
      ""
  );

  const storedUserId = getStoredSessionUserId() || getStoredUserId();

  if (explicitUserId && storedUserId && explicitUserId !== storedUserId) return true;
  if (sessionUserId && storedUserId && sessionUserId !== storedUserId) return true;
  if (explicitUserId && sessionUserId && explicitUserId !== sessionUserId) return true;

  return false;
}

/* =========================================================
   TOKENS
========================================================= */

export function persistAccessToken(token = null, options = {}) {
  const value = normalizeAccessToken(token);

  if (!value) {
    removeRaw(KEYS.token);
    removeRaw(KEYS.accessToken);
    return false;
  }

  writeRaw(KEYS.token, value, options);
  writeRaw(KEYS.accessToken, value, options);

  return true;
}

export function getStoredAccessToken() {
  return normalizeAccessToken(readFirst([KEYS.accessToken, KEYS.token]));
}

export function hasAccessToken() {
  return Boolean(getStoredAccessToken());
}

export function removeStoredAccessToken() {
  removeRaw(KEYS.token);
  removeRaw(KEYS.accessToken);
  return true;
}

export function persistRefreshToken(token = null, options = {}) {
  const value = normalizeRefreshToken(token);

  if (!value) {
    removeRaw(KEYS.refreshToken);
    return false;
  }

  return writeRaw(KEYS.refreshToken, value, options);
}

export function getStoredRefreshToken() {
  return normalizeRefreshToken(readRaw(KEYS.refreshToken));
}

export function hasRefreshToken() {
  return Boolean(getStoredRefreshToken());
}

export function removeStoredRefreshToken() {
  return removeRaw(KEYS.refreshToken);
}

/* =========================================================
   SESSION CONTEXT
========================================================= */

export function persistSessionContext(sessionData = null, user = null, options = {}) {
  const data = isObject(sessionData) ? sessionData : {};
  const safeUser = isObject(user) ? user : {};

  const sessionId = normalizeSessionValue(
    data.sessionId ||
      data.session_id ||
      data.sid ||
      data.id ||
      ""
  );

  const sessionUserId = normalizeSessionValue(
    data.sessionUserId ||
      data.session_user_id ||
      data.userId ||
      data.user_id ||
      data.uid ||
      ""
  );

  const explicitUserId = extractUserId(safeUser);

  if (sessionUserId && explicitUserId && sessionUserId !== explicitUserId) {
    removeStoredSessionContext();

    return {
      sessionId: null,
      session_id: null,

      userId: null,
      user_id: null,

      sessionUserId: null,
      session_user_id: null,

      expiresAt: null,
      expires_at: null,
    };
  }

  const userId = sessionUserId || explicitUserId;

  const expiresAt = normalizeSessionValue(
    data.expiresAt ||
      data.expires_at ||
      data.refreshExpiresAt ||
      data.refresh_expires_at ||
      ""
  );

  if (sessionId) {
    writeRaw(KEYS.sessionId, sessionId, options);
  } else {
    removeRaw(KEYS.sessionId);
  }

  if (userId) {
    writeRaw(KEYS.sessionUserId, userId, options);
    writeRaw(KEYS.userId, userId, options);
  } else {
    removeRaw(KEYS.sessionUserId);
    removeRaw(KEYS.userId);
  }

  if (expiresAt) {
    writeRaw(KEYS.sessionExpiresAt, expiresAt, options);
  } else {
    removeRaw(KEYS.sessionExpiresAt);
  }

  return {
    sessionId: sessionId || null,
    session_id: sessionId || null,

    userId: userId || null,
    user_id: userId || null,

    sessionUserId: userId || null,
    session_user_id: userId || null,

    expiresAt: expiresAt || null,
    expires_at: expiresAt || null,
  };
}

export function removeStoredSessionContext() {
  removeMany(SESSION_CONTEXT_KEYS);
  return true;
}

function removeStoredAuxSessionData() {
  removeMany(AUX_USER_KEYS);
  return true;
}

export function persistAuxSessionData(user = null, options = {}) {
  const safeUser = isObject(user) ? user : null;

  if (!safeUser) return false;

  const userId = extractUserId(safeUser);
  const slug = extractRealUserSlug(safeUser);
  const role = normalizeRole(safeUser?.role || safeUser?.rol || safeUser?.roles || "");

  if (userId) {
    writeRaw(KEYS.sessionUserId, userId, options);
    writeRaw(KEYS.userId, userId, options);
  }

  if (slug) {
    writeRaw(KEYS.userSlug, slug, options);
  } else {
    removeRaw(KEYS.userSlug);
  }

  if (role) {
    writeRaw(KEYS.role, role, options);
  } else {
    removeRaw(KEYS.role);
  }

  return Boolean(userId || slug || role);
}

export function getStoredSessionId() {
  return normalizeSessionValue(readRaw(KEYS.sessionId));
}

export function getStoredSessionUserId() {
  return normalizeSessionValue(
    readFirst([KEYS.sessionUserId, KEYS.userId])
  );
}

function getStoredUserId() {
  return normalizeSessionValue(readRaw(KEYS.userId));
}

export function getStoredSessionExpiresAt() {
  return normalizeSessionValue(readRaw(KEYS.sessionExpiresAt));
}

export function getStoredSessionContext() {
  const sessionId = getStoredSessionId();
  const userId = getStoredSessionUserId();
  const expiresAt = getStoredSessionExpiresAt();

  if (!sessionId && !userId && !expiresAt) return null;

  return {
    sessionId: sessionId || null,
    session_id: sessionId || null,
    id: sessionId || null,
    sid: sessionId || null,

    userId: userId || null,
    user_id: userId || null,
    sessionUserId: userId || null,
    session_user_id: userId || null,

    expiresAt: expiresAt || null,
    expires_at: expiresAt || null,
    refreshExpiresAt: expiresAt || null,
    refresh_expires_at: expiresAt || null,
  };
}

export function hasSessionContext() {
  return Boolean(getStoredSessionId() || getStoredSessionUserId() || getStoredSessionExpiresAt());
}

export function hasAnyRefreshContext() {
  return Boolean(hasRefreshToken());
}

export function hasRefreshContext() {
  /*
    Contexto mínimo permitido por contrato: refreshToken.
  */
  return Boolean(getStoredRefreshToken());
}

export function hasCompleteRefreshContext() {
  return Boolean(
    getStoredRefreshToken() &&
      getStoredSessionId() &&
      getStoredSessionUserId()
  );
}

/* =========================================================
   AUTH PAYLOAD
========================================================= */

export function persistAuthStorage(payload = {}, options = {}) {
  const nodes = nested(payload);
  const user = readUserFromPayload(payload);
  const sessionData = readSessionFromPayload(payload);

  const accessToken = normalizeAccessToken(
    pick(nodes, [
      "token",
      "accessToken",
      "access_token",
    ])
  );

  const refreshToken = normalizeRefreshToken(
    pick(nodes, [
      "refreshToken",
      "refresh_token",
    ])
  );

  const userChanged = explicitIdentityMismatch({
    user,
    sessionData,
  });

  if (userChanged) {
    removeStoredAccessToken();
    removeStoredRefreshToken();
    removeStoredSessionContext();
    removeStoredAuxSessionData();
  }

  let accessStored = false;
  let refreshStored = false;

  if (accessToken) {
    accessStored = persistAccessToken(accessToken, options);
  } else if (options.clearMissingAccessToken === true || userChanged) {
    removeStoredAccessToken();
  }

  if (refreshToken) {
    refreshStored = persistRefreshToken(refreshToken, options);
  } else if (options.clearMissingRefreshToken === true || userChanged) {
    removeStoredRefreshToken();
  }

  if (sessionData) {
    persistSessionContext(sessionData, user, options);
  } else if (options.clearMissingSessionContext === true || userChanged) {
    removeStoredSessionContext();
  }

  if (user) {
    persistAuxSessionData(user, options);
  } else if (options.clearMissingUserAux === true || userChanged) {
    removeStoredAuxSessionData();
  }

  return {
    ok: Boolean(accessStored || refreshStored || hasStoredAuthPayload()),
    hasAccessToken: hasAccessToken(),
    hasRefreshToken: hasRefreshToken(),
    hasSessionContext: hasSessionContext(),
    hasAnyRefreshContext: hasAnyRefreshContext(),
    hasRefreshContext: hasRefreshContext(),
    hasCompleteRefreshContext: hasCompleteRefreshContext(),
    userSlug: getStoredUserSlug() || null,
    role: getStoredRole() || null,
  };
}

export function getStoredAuthPayload() {
  const token = getStoredAccessToken();
  const refreshToken = getStoredRefreshToken();
  const sessionContext = getStoredSessionContext() || {};
  const userSlug = getStoredUserSlug();
  const role = getStoredRole();

  return {
    token: token || null,
    accessToken: token || null,
    access_token: token || null,

    refreshToken: refreshToken || null,
    refresh_token: refreshToken || null,

    userSlug: userSlug || null,

    role: role || null,
    rol: role || null,
    roles: role ? [role] : [],

    session: hasSessionContext()
      ? {
          ...sessionContext,
          userSlug: userSlug || null,
        }
      : null,

    /*
      Importante:
      No devolvemos user fabricado.
      Restore debe usar token -> /me -> user canónico,
      o refreshToken -> /refresh -> user canónico.
    */
    user: null,
  };
}

export function hasStoredAuthPayload() {
  return Boolean(hasAccessToken() || hasRefreshToken());
}

/* =========================================================
   AUX VALUES
========================================================= */

export function getStoredUserSlug() {
  return normalizeSlug(readRaw(KEYS.userSlug));
}

export function getStoredRole() {
  return normalizeRole(readRaw(KEYS.role));
}

export function persistRedirectAfterLogin(value = null, options = {}) {
  const normalized = normalizeRoute(value);

  if (!normalized) {
    removeStoredRedirectAfterLogin();
    return false;
  }

  return writeRaw(KEYS.redirectAfterLogin, normalized, options);
}

export function getStoredRedirectAfterLogin() {
  return normalizeRoute(readRaw(KEYS.redirectAfterLogin));
}

export function removeStoredRedirectAfterLogin() {
  return removeRaw(KEYS.redirectAfterLogin);
}

/* =========================================================
   REPAIR / CLEAR
========================================================= */

export function repairCorruptedAuthStorage() {
  let removed = 0;

  for (const name of CLEAR_KEYS) {
    const raw = readRaw(name);

    if (!raw) continue;

    if (isBad(raw)) {
      removeRaw(name);
      removed += 1;
    }
  }

  const rawToken = readRaw(KEYS.token);
  const rawAccessToken = readRaw(KEYS.accessToken);
  const rawRefreshToken = readRaw(KEYS.refreshToken);
  const rawSessionId = readRaw(KEYS.sessionId);
  const rawSessionUserId = readRaw(KEYS.sessionUserId);
  const rawUserId = readRaw(KEYS.userId);
  const rawSessionExpiresAt = readRaw(KEYS.sessionExpiresAt);
  const rawUserSlug = readRaw(KEYS.userSlug);
  const rawRole = readRaw(KEYS.role);
  const rawRedirect = readRaw(KEYS.redirectAfterLogin);

  if (rawToken && !normalizeAccessToken(rawToken)) {
    removeRaw(KEYS.token);
    removed += 1;
  }

  if (rawAccessToken && !normalizeAccessToken(rawAccessToken)) {
    removeRaw(KEYS.accessToken);
    removed += 1;
  }

  if (rawRefreshToken && !normalizeRefreshToken(rawRefreshToken)) {
    removeRaw(KEYS.refreshToken);
    removed += 1;
  }

  if (rawSessionId && !normalizeSessionValue(rawSessionId)) {
    removeRaw(KEYS.sessionId);
    removed += 1;
  }

  if (rawSessionUserId && !normalizeSessionValue(rawSessionUserId)) {
    removeRaw(KEYS.sessionUserId);
    removed += 1;
  }

  if (rawUserId && !normalizeSessionValue(rawUserId)) {
    removeRaw(KEYS.userId);
    removed += 1;
  }

  if (rawSessionExpiresAt && !normalizeSessionValue(rawSessionExpiresAt)) {
    removeRaw(KEYS.sessionExpiresAt);
    removed += 1;
  }

  if (rawUserSlug && !normalizeSlug(rawUserSlug)) {
    removeRaw(KEYS.userSlug);
    removed += 1;
  }

  if (rawRole && !normalizeRole(rawRole)) {
    removeRaw(KEYS.role);
    removed += 1;
  }

  if (rawRedirect && !normalizeRoute(rawRedirect)) {
    removeRaw(KEYS.redirectAfterLogin);
    removed += 1;
  }

  return {
    ok: true,
    removed,
  };
}

export function clearAuthStorage() {
  removeMany(CLEAR_KEYS);
  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getAuthStorageSnapshot() {
  const accessToken = getStoredAccessToken();
  const refreshToken = getStoredRefreshToken();
  const sessionId = getStoredSessionId();
  const sessionUserId = getStoredSessionUserId();
  const sessionExpiresAt = getStoredSessionExpiresAt();

  return {
    version: AUTH_STORAGE_VERSION,

    prefix: PREFIX,

    hasLocalStorage: Boolean(localStore()),
    hasSessionStorage: Boolean(sessionStore()),
    memoryFallbackSize: memory.size,

    hasAccessToken: Boolean(accessToken),
    accessToken: null,

    hasRefreshToken: Boolean(refreshToken),
    refreshToken: null,

    hasSessionId: Boolean(sessionId),
    sessionId: sessionId ? "***" : null,

    hasSessionUserId: Boolean(sessionUserId),
    sessionUserId: sessionUserId ? "***" : null,

    hasSessionExpiresAt: Boolean(sessionExpiresAt),

    hasSessionContext: hasSessionContext(),
    hasAnyRefreshContext: hasAnyRefreshContext(),
    hasRefreshContext: hasRefreshContext(),
    hasCompleteRefreshContext: hasCompleteRefreshContext(),

    hasStoredAuthPayload: hasStoredAuthPayload(),

    userSlug: getStoredUserSlug() || null,
    role: getStoredRole() || null,

    redirectAfterLogin: redact(getStoredRedirectAfterLogin() || ""),

    lastStorageError: lastStorageError
      ? {
          name: lastStorageError.name || "StorageError",
          message: redact(lastStorageError.message || String(lastStorageError)),
        }
      : null,

    policy: {
      concreteKeysOnly: true,
      noStorageClear: true,
      noLegacyMassive: true,

      configOwnsSlugNormalization: true,
      configOwnsRouteNormalization: true,
      configOwnsBlockedRoutes: true,

      persistsAccessToken: true,
      persistsRefreshToken: true,
      persistsAuxContextOnly: true,
      persistsFullUser: false,
      authenticatesByItself: false,

      refreshTokenIsMinimumContext: true,
      sessionIdUserIdPreferredButOptional: true,
      tokenOnlyDoesNotFabricateUser: true,
      preservesSessionContextWhenPayloadOmitsSession: true,
      preservesRefreshTokenWhenPayloadOmitsRefresh: true,
      clearsStaleContextOnUserMismatch: true,
      clearsStaleContextOnSessionUserMismatch: true,

      noTempToken: true,
      no2fa: true,
      noMfa: true,
      noOtp: true,

      ownSessionLogic: false,
      ownRouter: false,
      ownHttp: false,

      noFabricatedUser: true,
      noFabricatedSlug: true,
      noUsernamePublicSlug: true,
      noStoredUsername: true,

      snapshotRedacted: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  AUTH_STORAGE_VERSION,

  persistAccessToken,
  getStoredAccessToken,
  hasAccessToken,
  removeStoredAccessToken,

  persistRefreshToken,
  getStoredRefreshToken,
  hasRefreshToken,
  removeStoredRefreshToken,

  persistSessionContext,
  removeStoredSessionContext,
  persistAuxSessionData,

  persistAuthStorage,
  getStoredAuthPayload,
  hasStoredAuthPayload,

  getStoredSessionId,
  getStoredSessionUserId,
  getStoredSessionExpiresAt,
  getStoredSessionContext,

  hasSessionContext,
  hasAnyRefreshContext,
  hasRefreshContext,
  hasCompleteRefreshContext,

  getStoredUserSlug,
  getStoredRole,

  persistRedirectAfterLogin,
  getStoredRedirectAfterLogin,
  removeStoredRedirectAfterLogin,

  repairCorruptedAuthStorage,
  clearAuthStorage,

  getAuthStorageSnapshot,
};
