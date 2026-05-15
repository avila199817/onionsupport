/* =========================================================
   Onion SPA - Auth Storage
   Archivo: /src/features/auth/storage.js

   Responsabilidad:
   - Guardar y leer tokens/sesión de auth.
   - Mantener compatibilidad con claves legacy.
   - No tocar rutas públicas técnicas.
   - No limpiar storage completo.
   - No exponer tokens reales en snapshots.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  AUTH_STORAGE_KEYS,
  AUTH_LEGACY_STORAGE_KEYS,
  AUTH_CONSTANTS,
} from "./constants.js";

/* =========================================================
   VERSION
========================================================= */

export const AUTH_STORAGE_VERSION = "v1-simple-auth-storage";

/* =========================================================
   CONFIG
========================================================= */

const DEFAULT_PREFIX = "onion";
const DEFAULT_TOKEN_MAX_LENGTH = 8192;
const DEFAULT_TEXT_MAX_LENGTH = 300;

const memoryStorage = new Map();

let lastStorageError = null;

/* =========================================================
   KEYS
========================================================= */

const DEFAULT_KEYS = Object.freeze({
  accessToken: "accessToken",
  token: "token",
  refreshToken: "refreshToken",
  tempToken: "tempToken",

  sessionId: "sessionId",
  sessionUserId: "sessionUserId",
  userId: "userId",

  userSlug: "userSlug",
  userName: "userName",
  username: "username",
  role: "role",

  lastUsername: "lastUsername",
  lastLoginIdentifier: "lastLoginIdentifier",
  lastResetIdentifier: "lastResetIdentifier",

  redirectAfterLogin: "redirectAfterLogin",
  postLoginTarget: "postLoginTarget",
});

const CORRUPT_VALUES = new Set([
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
  "\"undefined\"",
  "\"null\"",
  "\"false\"",
  "\"true\"",
]);

const SLOT_ALIASES = Object.freeze({
  accessToken: [
    "accessToken",
    "access_token",
    "token",
    "authToken",
    "auth_token",
    "jwt",
    "idToken",
    "id_token",
    "auth.accessToken",
    "auth.access_token",
    "auth.token",
    "session.accessToken",
    "session.access_token",
    "session.token",
    "onion:accessToken",
    "onion:access_token",
    "onion:token",
    "onion.accessToken",
    "onion.access_token",
    "onion.token",
    "onion_access_token",
    "onion_token",
  ],

  refreshToken: [
    "refreshToken",
    "refresh_token",
    "auth.refreshToken",
    "auth.refresh_token",
    "session.refreshToken",
    "session.refresh_token",
    "onion:refreshToken",
    "onion:refresh_token",
    "onion.refreshToken",
    "onion.refresh_token",
    "onion_refresh_token",
  ],

  tempToken: [
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "twoFactorToken",
    "two_factor_token",
    "mfaToken",
    "mfa_token",
    "challengeToken",
    "challenge_token",
    "auth.tempToken",
    "auth.temp_token",
    "onion:tempToken",
    "onion:temp_token",
    "onion.tempToken",
    "onion.temp_token",
    "onion_temp_token",
    "onion_mfa_token",
    "onion_two_factor_token",
  ],

  sessionId: [
    "sessionId",
    "session_id",
    "sid",
    "auth.sessionId",
    "auth.session_id",
    "session.id",
    "session.sessionId",
    "session.session_id",
    "onion:sessionId",
    "onion:session_id",
    "onion.sessionId",
    "onion.session_id",
    "onion_session_id",
  ],

  sessionUserId: [
    "sessionUserId",
    "session_user_id",
    "userId",
    "user_id",
    "uid",
    "sub",
    "auth.sessionUserId",
    "auth.session_user_id",
    "session.userId",
    "session.user_id",
    "onion:sessionUserId",
    "onion:session_user_id",
    "onion:userId",
    "onion:user_id",
    "onion.sessionUserId",
    "onion.session_user_id",
    "onion.userId",
    "onion.user_id",
    "onion_session_user_id",
    "onion_user_id",
  ],

  userSlug: [
    "userSlug",
    "user_slug",
    "slug",
    "onion:userSlug",
    "onion:user_slug",
    "onion_user_slug",
  ],

  userName: [
    "userName",
    "user_name",
    "username",
    "lastUsername",
    "last_username",
    "onion:userName",
    "onion:user_name",
    "onion:username",
    "onion_user_name",
    "onion_username",
  ],

  role: [
    "role",
    "rol",
    "userRole",
    "user_role",
    "auth.role",
    "session.role",
    "onion:role",
    "onion.role",
    "onion_role",
  ],

  lastUsername: [
    "lastUsername",
    "last_username",
    "onion:lastUsername",
    "onion:last_username",
    "onion_last_username",
  ],

  lastLoginIdentifier: [
    "lastLoginIdentifier",
    "last_login_identifier",
    "loginIdentifier",
    "login_identifier",
    "onion:lastLoginIdentifier",
    "onion:last_login_identifier",
    "onion_last_login_identifier",
  ],

  lastResetIdentifier: [
    "lastResetIdentifier",
    "last_reset_identifier",
    "resetIdentifier",
    "reset_identifier",
    "onion:lastResetIdentifier",
    "onion:last_reset_identifier",
    "onion_last_reset_identifier",
  ],

  redirectAfterLogin: [
    "redirectAfterLogin",
    "redirect_after_login",
    "postLoginTarget",
    "post_login_target",
    "auth.redirectAfterLogin",
    "onion:redirectAfterLogin",
    "onion:redirect_after_login",
    "onion:postLoginTarget",
    "onion:post_login_target",
    "onion_redirect_after_login",
    "onion_post_login_target",
  ],
});

const TOKEN_PICK_KEYS = Object.freeze([
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "tempToken",
  "temp_token",
  "temporaryToken",
  "temporary_token",
  "twoFactorToken",
  "two_factor_token",
  "mfaToken",
  "mfa_token",
  "value",
  "raw",
  "data",
]);

const SESSION_ID_PICK_KEYS = Object.freeze([
  "sessionId",
  "session_id",
  "sid",
  "id",
  "value",
  "raw",
  "data",
]);

const SESSION_USER_ID_PICK_KEYS = Object.freeze([
  "sessionUserId",
  "session_user_id",
  "userId",
  "user_id",
  "uid",
  "sub",
  "id",
  "email",
  "username",
  "userName",
  "user_name",
  "value",
  "raw",
  "data",
]);

const TEXT_PICK_KEYS = Object.freeze([
  "value",
  "raw",
  "text",
  "data",
]);

/* =========================================================
   BASIC HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function unique(values = []) {
  return Array.from(
    new Set(
      values
        .flat(Infinity)
        .map((item) => safeText(item, ""))
        .filter(Boolean)
    )
  );
}

function getPrefix() {
  return safeText(
    AppCore?.config?.storagePrefix ||
      AppCore?.config?.appKey ||
      DEFAULT_PREFIX,
    DEFAULT_PREFIX
  ).replace(/^[:._-]+|[:._-]+$/g, "") || DEFAULT_PREFIX;
}

function getKeys() {
  return {
    ...DEFAULT_KEYS,
    ...safeObject(AUTH_STORAGE_KEYS),
  };
}

function getTokenMaxLength() {
  return safeNumber(
    AUTH_CONSTANTS?.tokenMaxLength,
    DEFAULT_TOKEN_MAX_LENGTH
  );
}

function getTextMaxLength() {
  return safeNumber(
    AUTH_CONSTANTS?.textValueMaxLength,
    DEFAULT_TEXT_MAX_LENGTH
  );
}

function getSessionMaxLength() {
  return safeNumber(
    AUTH_CONSTANTS?.sessionValueMaxLength,
    DEFAULT_TEXT_MAX_LENGTH
  );
}

function normalizeRole(value = "") {
  const role = safeText(value, "").toLowerCase();

  if (!role) return "";
  if (role === "admin") return "admin";

  return "user";
}

function isCorrupt(value = "") {
  return CORRUPT_VALUES.has(safeText(value, "").toLowerCase());
}

function redactOpaque(value = "") {
  const text = safeText(value, "");

  if (!text) return null;
  if (text.length <= 8) return "***";

  return `${text.slice(0, 3)}***${text.slice(-3)}`;
}

function recordStorageError(error) {
  lastStorageError = error || null;
}

/* =========================================================
   KEY HELPERS
========================================================= */

function camelToSnake(value = "") {
  return safeText(value, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-.\s:]+/g, "_")
    .toLowerCase();
}

function snakeToCamel(value = "") {
  return safeText(value, "").replace(/[_-]([a-z0-9])/g, (_, char) =>
    String(char || "").toUpperCase()
  );
}

function stripPrefix(key = "") {
  const clean = safeText(key, "");
  const prefix = getPrefix();

  if (clean.startsWith(`${prefix}:`)) return clean.slice(prefix.length + 1);
  if (clean.startsWith(`${prefix}.`)) return clean.slice(prefix.length + 1);
  if (clean.startsWith(`${prefix}_`)) return clean.slice(prefix.length + 1);

  return clean;
}

function canonicalKey(key = "") {
  const clean = stripPrefix(key);
  const prefix = getPrefix();

  return clean ? `${prefix}:${clean}` : "";
}

function keyVariants(key = "") {
  const clean = safeText(key, "");

  if (!clean) return [];

  const stripped = stripPrefix(clean);
  const snake = camelToSnake(stripped);
  const camel = snakeToCamel(stripped);
  const prefix = getPrefix();

  return unique([
    clean,
    stripped,
    snake,
    camel,

    `${prefix}:${stripped}`,
    `${prefix}:${snake}`,
    `${prefix}:${camel}`,

    `${prefix}.${stripped}`,
    `${prefix}.${snake}`,
    `${prefix}.${camel}`,

    `${prefix}_${stripped}`,
    `${prefix}_${snake}`,
    `${prefix}_${camel}`,

    clean.replace(/[:.]/g, "_"),
    clean.replace(/_/g, ":"),
    clean.replace(/_/g, "."),
  ]);
}

function legacyKey(name = "") {
  const legacy = safeObject(AUTH_LEGACY_STORAGE_KEYS);
  return safeText(legacy[name], "");
}

function slotKeys(slot = "") {
  const keys = getKeys();
  const base = [];

  if (keys[slot]) base.push(keys[slot]);
  if (slot === "accessToken") base.push(keys.token);
  if (slot === "sessionUserId") base.push(keys.userId);
  if (slot === "userName") base.push(keys.username);
  if (slot === "redirectAfterLogin") base.push(keys.postLoginTarget);

  base.push(legacyKey(slot));
  base.push(...(SLOT_ALIASES[slot] || []));

  return unique(base);
}

function writeSlotKeys(slot = "") {
  const keys = getKeys();

  const map = {
    accessToken: [
      keys.accessToken,
      keys.token,
      "accessToken",
      "access_token",
      "token",
    ],

    refreshToken: [
      keys.refreshToken,
      "refreshToken",
      "refresh_token",
    ],

    tempToken: [
      keys.tempToken,
      "tempToken",
      "temp_token",
    ],

    sessionId: [
      keys.sessionId,
      "sessionId",
      "session_id",
    ],

    sessionUserId: [
      keys.sessionUserId,
      keys.userId,
      "sessionUserId",
      "session_user_id",
      "userId",
      "user_id",
    ],
  };

  return unique(map[slot] || [keys[slot], slot]);
}

function allClearKeys() {
  const keys = getKeys();

  return unique([
    ...Object.values(keys),

    ...Object.values(safeObject(AUTH_LEGACY_STORAGE_KEYS)),

    ...slotKeys("accessToken"),
    ...slotKeys("refreshToken"),
    ...slotKeys("tempToken"),
    ...slotKeys("sessionId"),
    ...slotKeys("sessionUserId"),
    ...slotKeys("userSlug"),
    ...slotKeys("userName"),
    ...slotKeys("role"),
    ...slotKeys("lastUsername"),
    ...slotKeys("lastLoginIdentifier"),
    ...slotKeys("lastResetIdentifier"),
    ...slotKeys("redirectAfterLogin"),

    "user",
    "currentUser",
    "authUser",
    "sessionUser",
    "session",
    "sessionData",
    "auth.session",
    "auth.user",
    "onion:user",
    "onion:session",
    "onion:sessionData",
    "onion_user",
    "onion_session",
  ]);
}

/* =========================================================
   STORAGE ADAPTERS
========================================================= */

function getAppStorage() {
  const storage = AppCore?.storage;

  if (!storage || typeof storage !== "object") return null;

  if (
    typeof storage.get === "function" ||
    typeof storage.getRaw === "function" ||
    typeof storage.set === "function" ||
    typeof storage.setRaw === "function" ||
    typeof storage.remove === "function" ||
    typeof storage.delete === "function" ||
    typeof storage.del === "function"
  ) {
    return storage;
  }

  return null;
}

function getWebStorage(kind = "localStorage") {
  if (!isBrowser()) return null;

  try {
    const storage = window[kind];
    const testKey = `__onion_auth_probe_${kind}`;

    storage.setItem(testKey, "1");
    storage.removeItem(testKey);

    return storage;
  } catch (error) {
    recordStorageError(error);
    return null;
  }
}

function readAppStorage(key = "") {
  const storage = getAppStorage();

  if (!storage) return "";

  for (const variant of keyVariants(key)) {
    try {
      if (typeof storage.getRaw === "function") {
        const value = storage.getRaw(variant, "");
        if (value) return value;
      }
    } catch (error) {
      recordStorageError(error);
    }

    try {
      if (typeof storage.get === "function") {
        const value = storage.get(variant, "");
        if (value) return value;
      }
    } catch (error) {
      recordStorageError(error);
    }
  }

  return "";
}

function writeAppStorage(key = "", value = "") {
  const storage = getAppStorage();
  const clean = stripPrefix(key);

  if (!storage || !clean || !value) return false;

  try {
    if (typeof storage.setRaw === "function") {
      storage.setRaw(clean, value);
      return true;
    }
  } catch (error) {
    recordStorageError(error);
  }

  try {
    if (typeof storage.set === "function") {
      storage.set(clean, value);
      return true;
    }
  } catch (error) {
    recordStorageError(error);
  }

  return false;
}

function removeAppStorage(key = "") {
  const storage = getAppStorage();

  if (!storage) return false;

  let removed = false;

  for (const variant of keyVariants(key)) {
    try {
      if (typeof storage.remove === "function") {
        storage.remove(variant);
        removed = true;
      }
    } catch (error) {
      recordStorageError(error);
    }

    try {
      if (typeof storage.delete === "function") {
        storage.delete(variant);
        removed = true;
      }
    } catch (error) {
      recordStorageError(error);
    }

    try {
      if (typeof storage.del === "function") {
        storage.del(variant);
        removed = true;
      }
    } catch (error) {
      recordStorageError(error);
    }
  }

  return removed;
}

function readWebStorage(storage, key = "") {
  if (!storage) return "";

  for (const variant of keyVariants(key)) {
    try {
      const value = storage.getItem(variant);
      if (value) return value;
    } catch (error) {
      recordStorageError(error);
    }
  }

  return "";
}

function writeWebStorage(storage, key = "", value = "") {
  if (!storage || !key || !value) return false;

  try {
    storage.setItem(canonicalKey(key), value);
    return true;
  } catch (error) {
    recordStorageError(error);
    return false;
  }
}

function removeWebStorage(storage, key = "") {
  if (!storage) return false;

  let removed = false;

  for (const variant of keyVariants(key)) {
    try {
      storage.removeItem(variant);
      removed = true;
    } catch (error) {
      recordStorageError(error);
    }
  }

  return removed;
}

function readMemory(key = "") {
  for (const variant of keyVariants(key)) {
    if (memoryStorage.has(variant)) {
      return memoryStorage.get(variant);
    }
  }

  return "";
}

function writeMemory(key = "", value = "") {
  const finalKey = canonicalKey(key);

  if (!finalKey || !value) return false;

  memoryStorage.set(finalKey, value);

  return true;
}

function removeMemory(key = "") {
  let removed = false;

  for (const variant of keyVariants(key)) {
    if (memoryStorage.delete(variant)) {
      removed = true;
    }
  }

  return removed;
}

/* =========================================================
   RAW OPERATIONS
========================================================= */

function readRaw(key = "") {
  if (!key) return "";

  return (
    readAppStorage(key) ||
    readWebStorage(getWebStorage("localStorage"), key) ||
    readWebStorage(getWebStorage("sessionStorage"), key) ||
    readMemory(key) ||
    ""
  );
}

function writeRaw(key = "", value = "", options = {}) {
  const cleanValue = safeText(value, "");

  if (!key) return false;

  if (!cleanValue) {
    return removeRaw(key);
  }

  const opts = safeObject(options);

  const appOk = opts.appStorage === false ? false : writeAppStorage(key, cleanValue);
  const localOk = opts.sessionOnly === true ? false : writeWebStorage(getWebStorage("localStorage"), key, cleanValue);
  const sessionOk = opts.localOnly === true ? false : writeWebStorage(getWebStorage("sessionStorage"), key, cleanValue);
  const memoryOk = opts.memory === false ? false : writeMemory(key, cleanValue);

  return Boolean(appOk || localOk || sessionOk || memoryOk);
}

function writeMany(keys = [], value = "", options = {}) {
  const cleanValue = safeText(value, "");

  let ok = false;

  for (const key of unique(keys)) {
    ok = writeRaw(key, cleanValue, options) || ok;
  }

  return ok;
}

function removeRaw(key = "") {
  if (!key) return false;

  return Boolean(
    removeAppStorage(key) ||
      removeWebStorage(getWebStorage("localStorage"), key) ||
      removeWebStorage(getWebStorage("sessionStorage"), key) ||
      removeMemory(key)
  );
}

function removeMany(keys = []) {
  let ok = false;

  for (const key of unique(keys)) {
    ok = removeRaw(key) || ok;
  }

  return ok;
}

function readFirst(keys = []) {
  for (const key of unique(keys)) {
    const value = readRaw(key);

    if (value) return value;
  }

  return "";
}

/* =========================================================
   VALUE NORMALIZATION
========================================================= */

function pickFromObject(objectValue = {}, pickKeys = [], depth = 0) {
  if (!isObject(objectValue) || depth > 4) return "";

  for (const key of pickKeys) {
    const value = objectValue[key];

    if (typeof value === "string" || typeof value === "number") {
      const text = safeText(value, "");
      if (text) return text;
    }

    if (isObject(value)) {
      const nested = pickFromObject(value, pickKeys, depth + 1);
      if (nested) return nested;
    }
  }

  return "";
}

function unwrapValue(value = "", pickKeys = TEXT_PICK_KEYS) {
  if (value === null || value === undefined) return "";

  if (typeof value === "number" || typeof value === "boolean") {
    return safeText(value, "");
  }

  if (isObject(value)) {
    return pickFromObject(value, pickKeys);
  }

  const raw = safeText(value, "");

  if (!raw || isCorrupt(raw)) return "";

  try {
    const parsed = JSON.parse(raw);

    if (typeof parsed === "string" || typeof parsed === "number") {
      return safeText(parsed, "");
    }

    if (isObject(parsed)) {
      return pickFromObject(parsed, pickKeys);
    }

    return "";
  } catch {
    return raw;
  }
}

function normalizeText(value = "", maxLength = getTextMaxLength(), pickKeys = TEXT_PICK_KEYS) {
  const raw = unwrapValue(value, pickKeys);

  if (!raw || isCorrupt(raw)) return "";

  return safeText(raw, "").slice(0, maxLength);
}

function normalizeToken(value = "") {
  let token = unwrapValue(value, TOKEN_PICK_KEYS);

  if (!token || isCorrupt(token)) return "";

  token = token.replace(/^Bearer\s+/i, "").trim();

  if (!token || /\s/.test(token)) return "";

  const maxLength = getTokenMaxLength();

  if (maxLength > 0 && token.length > maxLength) {
    return "";
  }

  return token;
}

function normalizeSessionId(value = "") {
  return normalizeText(value, getSessionMaxLength(), SESSION_ID_PICK_KEYS);
}

function normalizeSessionUserId(value = "") {
  return normalizeText(value, getSessionMaxLength(), SESSION_USER_ID_PICK_KEYS);
}

function normalizeSessionData(sessionData = null, user = null) {
  const data = safeObject(sessionData);
  const session = safeObject(data.session || data.sessionData);
  const auth = safeObject(data.auth);
  const authSession = safeObject(auth.session || auth.sessionData);

  const safeUser = safeObject(
    user ||
      data.user ||
      data.usuario ||
      data.me ||
      data.account ||
      auth.user ||
      auth.usuario
  );

  const sessionId = normalizeSessionId(
    data.sessionId ||
      data.session_id ||
      data.sid ||
      session.sessionId ||
      session.session_id ||
      session.sid ||
      session.id ||
      authSession.sessionId ||
      authSession.session_id ||
      authSession.sid ||
      authSession.id ||
      ""
  );

  const sessionUserId = normalizeSessionUserId(
    data.sessionUserId ||
      data.session_user_id ||
      data.userId ||
      data.user_id ||
      data.uid ||
      session.userId ||
      session.user_id ||
      session.uid ||
      authSession.userId ||
      authSession.user_id ||
      authSession.uid ||
      safeUser.userId ||
      safeUser.user_id ||
      safeUser.id ||
      safeUser.uid ||
      safeUser.sub ||
      safeUser.email ||
      safeUser.username ||
      ""
  );

  return {
    sessionId,
    userId: sessionUserId,
    sessionUserId,
  };
}

/* =========================================================
   TOKENS
========================================================= */

export function persistAccessToken(token = null) {
  const value = normalizeToken(token);

  if (!value) {
    return removeMany(slotKeys("accessToken"));
  }

  return writeMany(writeSlotKeys("accessToken"), value);
}

export function getStoredAccessToken() {
  return normalizeToken(readFirst(slotKeys("accessToken")));
}

export function hasAccessToken() {
  return Boolean(getStoredAccessToken());
}

export function persistRefreshToken(token = null) {
  const value = normalizeToken(token);

  if (!value) {
    return removeMany(slotKeys("refreshToken"));
  }

  return writeMany(writeSlotKeys("refreshToken"), value);
}

export function getStoredRefreshToken() {
  return normalizeToken(readFirst(slotKeys("refreshToken")));
}

export function hasRefreshToken() {
  return Boolean(getStoredRefreshToken());
}

export function persistTempToken(token = null) {
  const value = normalizeToken(token);

  if (!value) {
    return removeMany(slotKeys("tempToken"));
  }

  return writeMany(writeSlotKeys("tempToken"), value);
}

export function getStoredTempToken() {
  return normalizeToken(readFirst(slotKeys("tempToken")));
}

export function hasTempToken() {
  return Boolean(getStoredTempToken());
}

/* =========================================================
   SESSION CONTEXT
========================================================= */

export function persistSessionContext(sessionData = null, user = null) {
  const context = normalizeSessionData(sessionData, user);

  if (context.sessionId) {
    writeMany(writeSlotKeys("sessionId"), context.sessionId);
  } else {
    removeMany(slotKeys("sessionId"));
  }

  if (context.sessionUserId) {
    writeMany(writeSlotKeys("sessionUserId"), context.sessionUserId);
  } else {
    removeMany(slotKeys("sessionUserId"));
  }

  return {
    sessionId: context.sessionId || null,
    session_id: context.sessionId || null,
    userId: context.sessionUserId || null,
    user_id: context.sessionUserId || null,
    sessionUserId: context.sessionUserId || null,
    session_user_id: context.sessionUserId || null,
  };
}

export function persistAuxSessionData(user = null) {
  const safeUser = safeObject(user);
  const keys = getKeys();

  const userId = normalizeSessionUserId(
    safeUser.userId ||
      safeUser.user_id ||
      safeUser.id ||
      safeUser.uid ||
      safeUser.sub ||
      safeUser.email ||
      safeUser.username ||
      ""
  );

  const username = normalizeText(
    safeUser.username ||
      safeUser.userName ||
      safeUser.user_name ||
      safeUser.email ||
      safeUser.name ||
      safeUser.nombre ||
      ""
  );

  const slug = normalizeText(
    safeUser.slug ||
      safeUser.usernameLower ||
      safeUser.username_lower ||
      safeUser.username ||
      safeUser.email ||
      ""
  );

  const role = normalizeRole(safeUser.role || safeUser.rol || "");

  if (userId) writeMany(writeSlotKeys("sessionUserId"), userId);
  if (username) {
    writeRaw(keys.userName, username);
    writeRaw(keys.username, username);
    writeRaw(keys.lastUsername, username);
  }

  if (slug) writeRaw(keys.userSlug, slug);
  if (role) writeRaw(keys.role, role);

  return true;
}

export function getStoredSessionId() {
  return normalizeSessionId(readFirst(slotKeys("sessionId")));
}

export function getStoredSessionUserId() {
  return normalizeSessionUserId(readFirst(slotKeys("sessionUserId")));
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
  return Boolean(
    getStoredRefreshToken() &&
      getStoredSessionId() &&
      getStoredSessionUserId()
  );
}

/* =========================================================
   AUX VALUES
========================================================= */

export function getStoredUserSlug() {
  return normalizeText(readFirst(slotKeys("userSlug")));
}

export function getStoredUserName() {
  return normalizeText(readFirst(slotKeys("userName")));
}

export function getStoredRole() {
  return normalizeRole(readFirst(slotKeys("role")));
}

export function getStoredLastUsername() {
  return normalizeText(readFirst(slotKeys("lastUsername")));
}

export function persistLastLoginIdentifier(value = null) {
  const normalized = normalizeText(value);
  const keys = getKeys();

  if (!normalized) return removeRaw(keys.lastLoginIdentifier);

  return writeRaw(keys.lastLoginIdentifier, normalized);
}

export function getStoredLastLoginIdentifier() {
  return normalizeText(readFirst(slotKeys("lastLoginIdentifier")));
}

export function persistLastResetIdentifier(value = null) {
  const normalized = normalizeText(value);
  const keys = getKeys();

  if (!normalized) return removeRaw(keys.lastResetIdentifier);

  return writeRaw(keys.lastResetIdentifier, normalized);
}

export function getStoredLastResetIdentifier() {
  return normalizeText(readFirst(slotKeys("lastResetIdentifier")));
}

export function persistRedirectAfterLogin(value = null) {
  const normalized = normalizeText(value, 1000);
  const keys = getKeys();

  if (!normalized) return removeStoredRedirectAfterLogin();

  return writeRaw(keys.redirectAfterLogin, normalized);
}

export function getStoredRedirectAfterLogin() {
  return normalizeText(readFirst(slotKeys("redirectAfterLogin")), 1000);
}

export function removeStoredRedirectAfterLogin() {
  return removeMany(slotKeys("redirectAfterLogin"));
}

/* =========================================================
   REPAIR / CLEAR
========================================================= */

export function repairCorruptedAuthStorage() {
  let removed = 0;

  for (const key of allClearKeys()) {
    const raw = readRaw(key);

    if (!raw) continue;

    const unwrapped = unwrapValue(raw, TEXT_PICK_KEYS);

    if (isCorrupt(unwrapped)) {
      if (removeRaw(key)) removed += 1;
    }
  }

  return {
    ok: true,
    removed,
  };
}

export function clearAuthStorage(options = {}) {
  const opts = safeObject(options);
  const includeLegacy = opts.includeLegacy !== false;

  const keys = includeLegacy
    ? allClearKeys()
    : unique([
        ...Object.values(getKeys()),
        ...slotKeys("accessToken"),
        ...slotKeys("refreshToken"),
        ...slotKeys("tempToken"),
        ...slotKeys("sessionId"),
        ...slotKeys("sessionUserId"),
      ]);

  for (const key of keys) {
    removeRaw(key);
  }

  /*
    Nunca hacer:
    - localStorage.clear()
    - sessionStorage.clear()

    Nunca tocar:
    - rutas públicas técnicas
    - theme/lang
    - window.__ONION_INITIAL_URL__
    - window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__
    - window.__ONION_RESET_CONFIRM_INITIAL_URL__
  */

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getAuthStorageSnapshot() {
  const accessToken = getStoredAccessToken();
  const refreshToken = getStoredRefreshToken();
  const tempToken = getStoredTempToken();
  const sessionId = getStoredSessionId();
  const sessionUserId = getStoredSessionUserId();

  return {
    version: AUTH_STORAGE_VERSION,

    prefix: getPrefix(),
    keys: getKeys(),

    hasAppStorage: Boolean(getAppStorage()),
    hasLocalStorage: Boolean(getWebStorage("localStorage")),
    hasSessionStorage: Boolean(getWebStorage("sessionStorage")),
    memoryFallbackSize: memoryStorage.size,

    hasAccessToken: Boolean(accessToken),
    accessTokenPreview: redactOpaque(accessToken),

    hasRefreshToken: Boolean(refreshToken),
    refreshTokenPreview: redactOpaque(refreshToken),

    hasTempToken: Boolean(tempToken),
    tempTokenPreview: redactOpaque(tempToken),

    hasSessionId: Boolean(sessionId),
    sessionId: sessionId ? "***" : null,
    sessionIdPreview: redactOpaque(sessionId),

    hasSessionUserId: Boolean(sessionUserId),
    sessionUserId: sessionUserId ? "***" : null,
    sessionUserIdPreview: redactOpaque(sessionUserId),

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

    at: new Date().toISOString(),
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
