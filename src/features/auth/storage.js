/* =========================================================
   Onion Support - Auth Storage
   Archivo: /src/features/auth/storage.js

   Responsabilidad:
   - Storage mínimo de Auth.
   - Claves concretas.
   - Fallback memory.
   - Nunca storage.clear().
   - Sin AppCore.
   - Sin Router.
   - Sin HTTP.
   - Sin sesión compleja.
   - Sin legacy masivo.
   - Sin 2FA/MFA/OTP.
   - Sin temp token real.
========================================================= */

import {
  AUTH_STORAGE_KEYS,
  AUTH_CONSTANTS,
} from "./constants.js";

export const AUTH_STORAGE_VERSION = "simple";

const PREFIX = "onion:auth:";

const memory = new Map();

let lastStorageError = null;

const KEYS = Object.freeze({
  token: AUTH_STORAGE_KEYS?.token || "token",
  accessToken: AUTH_STORAGE_KEYS?.accessToken || "access_token",
  refreshToken: AUTH_STORAGE_KEYS?.refreshToken || "refresh_token",

  user: AUTH_STORAGE_KEYS?.user || "user",
  role: AUTH_STORAGE_KEYS?.role || "role",

  sessionId: "session_id",
  sessionUserId: "session_user_id",
  userId: "user_id",
  userSlug: "user_slug",
  userName: "user_name",
  username: "username",

  lastUsername: "last_username",
  lastLoginIdentifier: "last_login_identifier",
  lastResetIdentifier: "last_reset_identifier",

  redirectAfterLogin: "redirect_after_login",
});

const CLEAR_KEYS = Object.freeze([
  KEYS.token,
  KEYS.accessToken,
  KEYS.refreshToken,

  KEYS.user,
  KEYS.role,

  KEYS.sessionId,
  KEYS.sessionUserId,
  KEYS.userId,
  KEYS.userSlug,
  KEYS.userName,
  KEYS.username,

  KEYS.lastUsername,
  KEYS.lastLoginIdentifier,
  KEYS.lastResetIdentifier,

  KEYS.redirectAfterLogin,
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

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function number(value, fallback = 0) {
  const output = Number(value);
  return Number.isFinite(output) ? output : fallback;
}

function recordError(error = null) {
  lastStorageError = error || null;
}

function key(name = "") {
  const clean = text(name, "");
  return clean ? `${PREFIX}${clean}` : "";
}

function local() {
  try {
    return isBrowser() ? window.localStorage : null;
  } catch (error) {
    recordError(error);
    return null;
  }
}

function session() {
  try {
    return isBrowser() ? window.sessionStorage : null;
  } catch (error) {
    recordError(error);
    return null;
  }
}

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
    readFrom(local(), name) ||
    readFrom(session(), name) ||
    readMemory(name) ||
    ""
  );
}

function writeRaw(name = "", value = "", options = {}) {
  const clean = text(value, "");

  if (!name) return false;
  if (!clean) return removeRaw(name);

  const storage = options.session === true ? session() : local();

  const ok =
    writeTo(storage, name, clean) ||
    writeMemory(name, clean);

  return Boolean(ok);
}

function removeRaw(name = "") {
  if (!name) return false;

  removeFrom(local(), name);
  removeFrom(session(), name);
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
  return BAD_VALUES.has(text(value, "").toLowerCase());
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

function unwrap(value = null) {
  if (value === null || value === undefined) return "";

  if (isObject(value)) {
    return (
      value.token ||
      value.accessToken ||
      value.access_token ||
      value.refreshToken ||
      value.refresh_token ||
      value.value ||
      value.raw ||
      value.data ||
      ""
    );
  }

  return value;
}

function normalizeToken(value = null) {
  let token = text(unwrap(value), "");

  token = token.replace(/^Bearer\s+/i, "").trim();

  if (!token) return "";
  if (isBad(token)) return "";
  if (/\s/.test(token)) return "";
  if (token.length > maxTokenLength()) return "";

  return token;
}

function normalizeText(value = null, limit = maxTextLength()) {
  const output = text(unwrap(value), "");

  if (!output) return "";
  if (isBad(output)) return "";
  if (output.length > limit) return "";

  return output;
}

function normalizeSessionValue(value = null) {
  return normalizeText(value, maxSessionLength());
}

function normalizeRole(value = "") {
  return String(value).toLowerCase() === "admin" ? "admin" : "user";
}

function normalizeRoute(value = "") {
  const route = text(value, "");

  if (!route) return "";
  if (route.length > 1000) return "";
  if (!route.startsWith("/")) return "";
  if (route.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(route)) return "";
  if (/[\r\n\t\\]/.test(route)) return "";

  return route;
}

/* =========================================================
   TOKENS
========================================================= */

export function persistAccessToken(token = null, options = {}) {
  const value = normalizeToken(token);

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
  return normalizeToken(readFirst([KEYS.accessToken, KEYS.token]));
}

export function hasAccessToken() {
  return Boolean(getStoredAccessToken());
}

export function persistRefreshToken(token = null, options = {}) {
  const value = normalizeToken(token);

  if (!value) {
    removeRaw(KEYS.refreshToken);
    return false;
  }

  return writeRaw(KEYS.refreshToken, value, options);
}

export function getStoredRefreshToken() {
  return normalizeToken(readRaw(KEYS.refreshToken));
}

export function hasRefreshToken() {
  return Boolean(getStoredRefreshToken());
}

/* Compat: no hay temp token / 2FA / MFA / OTP en el SPA mínimo actual. */
export function persistTempToken() {
  return false;
}

export function getStoredTempToken() {
  return "";
}

export function hasTempToken() {
  return false;
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
      safeUser.userId ||
      safeUser.id ||
      safeUser.email ||
      safeUser.username ||
      ""
  );

  if (sessionId) {
    writeRaw(KEYS.sessionId, sessionId, options);
  } else {
    removeRaw(KEYS.sessionId);
  }

  if (sessionUserId) {
    writeRaw(KEYS.sessionUserId, sessionUserId, options);
    writeRaw(KEYS.userId, sessionUserId, options);
  } else {
    removeRaw(KEYS.sessionUserId);
    removeRaw(KEYS.userId);
  }

  return {
    sessionId: sessionId || null,
    session_id: sessionId || null,

    userId: sessionUserId || null,
    user_id: sessionUserId || null,

    sessionUserId: sessionUserId || null,
    session_user_id: sessionUserId || null,
  };
}

export function persistAuxSessionData(user = null, options = {}) {
  if (!isObject(user)) return false;

  const userId = normalizeSessionValue(user.userId || user.id || user.email || user.username || "");
  const username = normalizeText(user.username || user.slug || user.email || user.name || "");
  const slug = normalizeText(user.slug || user.username || user.email || "");
  const role = normalizeRole(user.role || user.rol || "");

  if (userId) {
    writeRaw(KEYS.sessionUserId, userId, options);
    writeRaw(KEYS.userId, userId, options);
  }

  if (username) {
    writeRaw(KEYS.userName, username, options);
    writeRaw(KEYS.username, username, options);
    writeRaw(KEYS.lastUsername, username, options);
  }

  if (slug) {
    writeRaw(KEYS.userSlug, slug, options);
  }

  if (role) {
    writeRaw(KEYS.role, role, options);
  }

  return true;
}

export function getStoredSessionId() {
  return normalizeSessionValue(readRaw(KEYS.sessionId));
}

export function getStoredSessionUserId() {
  return normalizeSessionValue(readFirst([KEYS.sessionUserId, KEYS.userId]));
}

export function getStoredSessionContext() {
  const sessionId = getStoredSessionId();
  const sessionUserId = getStoredSessionUserId();

  return {
    sessionId: sessionId || null,
    session_id: sessionId || null,

    userId: sessionUserId || null,
    user_id: sessionUserId || null,

    sessionUserId: sessionUserId || null,
    session_user_id: sessionUserId || null,
  };
}

export function hasSessionContext() {
  return Boolean(getStoredSessionId() && getStoredSessionUserId());
}

export function hasRefreshContext() {
  return Boolean(getStoredRefreshToken() || hasSessionContext());
}

export function hasCompleteRefreshContext() {
  return Boolean(getStoredRefreshToken() && getStoredSessionId() && getStoredSessionUserId());
}

/* =========================================================
   AUX VALUES
========================================================= */

export function getStoredUserSlug() {
  return normalizeText(readRaw(KEYS.userSlug));
}

export function getStoredUserName() {
  return normalizeText(readFirst([KEYS.userName, KEYS.username]));
}

export function getStoredRole() {
  const role = normalizeText(readRaw(KEYS.role));
  return role ? normalizeRole(role) : "";
}

export function getStoredLastUsername() {
  return normalizeText(readRaw(KEYS.lastUsername));
}

export function persistLastLoginIdentifier(value = null, options = {}) {
  const normalized = normalizeText(value);

  if (!normalized) {
    removeRaw(KEYS.lastLoginIdentifier);
    return false;
  }

  return writeRaw(KEYS.lastLoginIdentifier, normalized, options);
}

export function getStoredLastLoginIdentifier() {
  return normalizeText(readRaw(KEYS.lastLoginIdentifier));
}

export function persistLastResetIdentifier(value = null, options = {}) {
  const normalized = normalizeText(value);

  if (!normalized) {
    removeRaw(KEYS.lastResetIdentifier);
    return false;
  }

  return writeRaw(KEYS.lastResetIdentifier, normalized, options);
}

export function getStoredLastResetIdentifier() {
  return normalizeText(readRaw(KEYS.lastResetIdentifier));
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

  return {
    version: AUTH_STORAGE_VERSION,

    prefix: PREFIX,

    hasLocalStorage: Boolean(local()),
    hasSessionStorage: Boolean(session()),
    memoryFallbackSize: memory.size,

    hasAccessToken: Boolean(accessToken),
    accessToken: null,

    hasRefreshToken: Boolean(refreshToken),
    refreshToken: null,

    hasTempToken: false,
    tempToken: null,

    hasSessionId: Boolean(sessionId),
    sessionId: sessionId ? "***" : null,

    hasSessionUserId: Boolean(sessionUserId),
    sessionUserId: sessionUserId ? "***" : null,

    hasSessionContext: hasSessionContext(),
    hasRefreshContext: hasRefreshContext(),
    hasCompleteRefreshContext: hasCompleteRefreshContext(),

    userSlug: getStoredUserSlug() || null,
    userName: getStoredUserName() || null,
    role: getStoredRole() || null,
    lastUsername: getStoredLastUsername() || null,

    lastStorageError: lastStorageError
      ? {
          name: lastStorageError.name || "StorageError",
          message: lastStorageError.message || String(lastStorageError),
        }
      : null,

    policy: {
      concreteKeysOnly: true,
      noStorageClear: true,
      noLegacyMassive: true,
      noTempToken: true,
      no2fa: true,
      ownSessionLogic: false,
      ownRouter: false,
      ownHttp: false,
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

  persistRefreshToken,
  getStoredRefreshToken,
  hasRefreshToken,

  persistTempToken,
  getStoredTempToken,
  hasTempToken,

  persistSessionContext,
  persistAuxSessionData,

  getStoredSessionId,
  getStoredSessionUserId,
  getStoredSessionContext,

  hasSessionContext,
  hasRefreshContext,
  hasCompleteRefreshContext,

  getStoredUserSlug,
  getStoredUserName,
  getStoredRole,
  getStoredLastUsername,

  persistLastLoginIdentifier,
  getStoredLastLoginIdentifier,

  persistLastResetIdentifier,
  getStoredLastResetIdentifier,

  persistRedirectAfterLogin,
  getStoredRedirectAfterLogin,
  removeStoredRedirectAfterLogin,

  repairCorruptedAuthStorage,
  clearAuthStorage,

  getAuthStorageSnapshot,
};
