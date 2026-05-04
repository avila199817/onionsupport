/* =========================================================
   Onion SPA - Auth Storage
   Archivo: src/features/auth/storage.js

   Responsabilidades:
   - centralizar storage auth
   - persistir token temporal / refresh
   - persistir contexto de sesión
   - leer claves de forma segura
   - limpiar storage auth sin tocar rutas públicas
   - namespacing consistente con AppCore
   - no tocar window.__ONION_INITIAL_URL__
   - no tocar window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__
   - no tocar window.__ONION_RESET_CONFIRM_INITIAL_URL__
   - no hacer localStorage.clear()

   HARDENING EXTREMO:
   - browser guard total
   - compatibilidad AppCore.storage / localStorage / sessionStorage
   - fallback en memoria si Web Storage no está disponible
   - lectura legacy prefijada y no prefijada
   - lectura snake_case / camelCase / dot / colon
   - limpieza limitada a claves auth conocidas
   - normalización estricta de valores de sesión
   - hasRefreshContext robusto: refreshToken OR sessionId+sessionUserId
   - limpieza legacy completa de restos de login fallido
   - protección contra valores corruptos "undefined" / "null"
   - soporte JSON-string values desde AppCore.storage
   - tokens no se truncan: se invalidan si exceden límite
   - snapshots sin tokens/session ids reales

   FIX 10/10:
   - clearAuthStorage elimina refresh/temp/session context
   - clearAuthStorage elimina access/token/user/role legacy
   - clearAuthStorage elimina claves legacy no namespaced
   - clearAuthStorage elimina claves legacy namespaced
   - clearAuthStorage elimina localStorage + sessionStorage + memory fallback
   - no elimina lang/theme/rutas/initial URLs
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  AUTH_STORAGE_KEYS,
  AUTH_CONSTANTS,
} from "./constants.js";

import {
  normalizeSessionValue,
} from "./helpers.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

const AUTH_STORAGE_VERSION =
  "10.1.0";

const DEFAULT_PREFIX =
  "onion";

const DEFAULT_SESSION_VALUE_MAX =
  200;

const DEFAULT_TOKEN_MAX =
  8192;

const CORRUPTED_VALUES =
  new Set([
    "",
    "undefined",
    "null",
    "\"undefined\"",
    "\"null\"",
    "false",
    "\"false\"",
    "nan",
    "{}",
    "[]",
    "[object object]",
  ]);

const TOKEN_PICK_KEYS =
  Object.freeze([
    "token",
    "accessToken",
    "access_token",
    "authToken",
    "auth_token",
    "jwt",
    "idToken",
    "id_token",
    "refreshToken",
    "refresh_token",
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
    "value",
    "raw",
  ]);

const SESSION_ID_PICK_KEYS =
  Object.freeze([
    "sessionId",
    "session_id",
    "sid",
    "id",
    "value",
    "raw",
  ]);

const SESSION_USER_ID_PICK_KEYS =
  Object.freeze([
    "sessionUserId",
    "session_user_id",
    "userId",
    "user_id",
    "uid",
    "id",
    "_id",
    "email",
    "username",
    "userName",
    "user_name",
    "value",
    "raw",
  ]);

const TEXT_VALUE_PICK_KEYS =
  Object.freeze([
    "value",
    "raw",
    "text",
    "data",
  ]);

/* =========================================================
   MEMORY FALLBACK
========================================================= */

const memoryStorage =
  new Map();

let lastStorageError =
  null;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeBool(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const normalized =
      value.trim().toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "ok",
        "on",
      ].includes(normalized)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
      ].includes(normalized)
    ) {
      return false;
    }
  }

  return Boolean(fallback);
}

function safeNumber(value, fallback = 0) {
  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value) {
  return isPlainObject(value)
    ? value
    : {};
}

function hasOwn(obj, key) {
  return Boolean(
    obj &&
      typeof obj === "object" &&
      Object.prototype.hasOwnProperty.call(
        obj,
        key
      )
  );
}

function unique(values = []) {
  return Array.from(
    new Set(
      values
        .map((item) =>
          safeText(item, "")
        )
        .filter(Boolean)
    )
  );
}

function safeIsoNow() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[AuthStorage]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[AuthStorage]",
      ...args
    );
  } catch {}
}

function safeEmit(eventName, payload = {}) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );

    return true;
  } catch {}

  return false;
}

/* =========================================================
   CONFIG
========================================================= */

function getPrefix() {
  return safeText(
    AppCore?.config?.storagePrefix,
    DEFAULT_PREFIX
  );
}

function buildKey(key = "") {
  const cleanKey =
    safeText(key, "");

  if (!cleanKey) {
    return "";
  }

  const prefix =
    getPrefix();

  if (
    cleanKey.startsWith(`${prefix}:`) ||
    cleanKey.startsWith(`${prefix}_`)
  ) {
    return cleanKey;
  }

  return `${prefix}:${cleanKey}`;
}

function stripKnownPrefix(key = "") {
  const cleanKey =
    safeText(key, "");

  const prefix =
    getPrefix();

  if (cleanKey.startsWith(`${prefix}:`)) {
    return cleanKey.slice(prefix.length + 1);
  }

  if (cleanKey.startsWith(`${prefix}_`)) {
    return cleanKey.slice(prefix.length + 1);
  }

  return cleanKey;
}

function getMaxLen() {
  return (
    safeNumber(
      AUTH_CONSTANTS?.sessionValueMaxLength,
      DEFAULT_SESSION_VALUE_MAX
    ) || DEFAULT_SESSION_VALUE_MAX
  );
}

function getTokenMaxLen() {
  return (
    safeNumber(
      AUTH_CONSTANTS?.tokenMaxLength,
      DEFAULT_TOKEN_MAX
    ) || DEFAULT_TOKEN_MAX
  );
}

function getStorageKeys() {
  return {
    refreshToken:
      safeText(
        AUTH_STORAGE_KEYS?.refreshToken,
        "refreshToken"
      ),

    tempToken:
      safeText(
        AUTH_STORAGE_KEYS?.tempToken,
        "tempToken"
      ),

    accessToken:
      safeText(
        AUTH_STORAGE_KEYS?.accessToken,
        "accessToken"
      ),

    token:
      safeText(
        AUTH_STORAGE_KEYS?.token,
        "token"
      ),

    sessionId:
      safeText(
        AUTH_STORAGE_KEYS?.sessionId,
        "sessionId"
      ),

    sessionUserId:
      safeText(
        AUTH_STORAGE_KEYS?.sessionUserId,
        "sessionUserId"
      ),

    userId:
      safeText(
        AUTH_STORAGE_KEYS?.userId,
        "userId"
      ),

    userSlug:
      safeText(
        AUTH_STORAGE_KEYS?.userSlug,
        "userSlug"
      ),

    userName:
      safeText(
        AUTH_STORAGE_KEYS?.userName,
        "userName"
      ),

    role:
      safeText(
        AUTH_STORAGE_KEYS?.role,
        "role"
      ),

    lastUsername:
      safeText(
        AUTH_STORAGE_KEYS?.lastUsername,
        "lastUsername"
      ),

    lastLoginIdentifier:
      safeText(
        AUTH_STORAGE_KEYS?.lastLoginIdentifier,
        "lastLoginIdentifier"
      ),

    lastResetIdentifier:
      safeText(
        AUTH_STORAGE_KEYS?.lastResetIdentifier,
        "lastResetIdentifier"
      ),

    redirectAfterLogin:
      safeText(
        AUTH_STORAGE_KEYS?.redirectAfterLogin,
        "redirectAfterLogin"
      ),
  };
}

/* =========================================================
   KEY NORMALIZATION
========================================================= */

function camelToSnake(value = "") {
  return safeText(value, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-.\s:]+/g, "_")
    .toLowerCase();
}

function snakeToCamel(value = "") {
  const raw =
    safeText(value, "");

  return raw.replace(/[_-]([a-z0-9])/g, (_, char) =>
    String(char || "").toUpperCase()
  );
}

function dotted(value = "") {
  return safeText(value, "")
    .replace(/:/g, ".")
    .replace(/_/g, ".");
}

function coloned(value = "") {
  return safeText(value, "")
    .replace(/\./g, ":");
}

function getKeyCandidates(key = "") {
  const cleanKey =
    safeText(key, "");

  if (!cleanKey) {
    return [];
  }

  const prefix =
    getPrefix();

  const stripped =
    stripKnownPrefix(cleanKey);

  const snake =
    camelToSnake(stripped);

  const camel =
    snakeToCamel(stripped);

  const dot =
    dotted(stripped);

  const colon =
    coloned(stripped);

  const variants =
    unique([
      cleanKey,
      stripped,

      snake,
      camel,
      dot,
      colon,

      `${prefix}:${stripped}`,
      `${prefix}:${snake}`,
      `${prefix}:${camel}`,
      `${prefix}:${dot}`,
      `${prefix}:${colon}`,

      `${prefix}_${stripped}`,
      `${prefix}_${snake}`,
      `${prefix}_${camel}`,

      cleanKey.replace(/:/g, "."),
      cleanKey.replace(/\./g, ":"),
      cleanKey.replace(/[:.]/g, "_"),
    ]);

  return variants;
}

function getSlotKeys(slot = "") {
  const keys =
    getStorageKeys();

  const map = {
    refreshToken: [
      keys.refreshToken,
      "refreshToken",
      "refresh_token",
      "auth.refreshToken",
      "auth.refresh_token",
      "session.refreshToken",
      "session.refresh_token",
      "onion_refresh_token",
    ],

    tempToken: [
      keys.tempToken,
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
      "auth.tempToken",
      "auth.temp_token",
      "onion_temp_token",
      "onion_temporary_token",
      "onion_two_factor_token",
      "onion_mfa_token",
    ],

    accessToken: [
      keys.accessToken,
      keys.token,
      "accessToken",
      "access_token",
      "token",
      "authToken",
      "auth_token",
      "jwt",
      "auth.accessToken",
      "auth.access_token",
      "auth.token",
      "session.accessToken",
      "session.access_token",
      "session.token",
      "onion_token",
      "onion_access_token",
      "auth_token",
    ],

    sessionId: [
      keys.sessionId,
      "sessionId",
      "session_id",
      "sid",
      "auth.sessionId",
      "auth.session_id",
      "session.id",
      "session.sessionId",
      "session.session_id",
      "onion_session_id",
    ],

    sessionUserId: [
      keys.sessionUserId,
      keys.userId,
      "sessionUserId",
      "session_user_id",
      "userId",
      "user_id",
      "uid",
      "auth.sessionUserId",
      "auth.session_user_id",
      "session.userId",
      "session.user_id",
      "onion_session_user_id",
      "onion_user_id",
    ],

    userSlug: [
      keys.userSlug,
      "userSlug",
      "user_slug",
      "slug",
      "onion_user_slug",
    ],

    userName: [
      keys.userName,
      "userName",
      "user_name",
      "username",
      "lastUsername",
      "last_username",
      "onion_user_name",
    ],

    role: [
      keys.role,
      "role",
      "rol",
      "userRole",
      "user_role",
      "auth.role",
      "session.role",
      "onion_role",
    ],

    lastUsername: [
      keys.lastUsername,
      "lastUsername",
      "last_username",
      "username",
      "onion_last_username",
    ],

    lastLoginIdentifier: [
      keys.lastLoginIdentifier,
      "lastLoginIdentifier",
      "last_login_identifier",
      "loginIdentifier",
      "login_identifier",
    ],

    lastResetIdentifier: [
      keys.lastResetIdentifier,
      "lastResetIdentifier",
      "last_reset_identifier",
      "resetIdentifier",
      "reset_identifier",
    ],

    redirectAfterLogin: [
      keys.redirectAfterLogin,
      "redirectAfterLogin",
      "redirect_after_login",
      "postLoginTarget",
      "post_login_target",
      "auth.redirectAfterLogin",
    ],
  };

  return unique(
    map[slot] || [
      keys[slot],
      slot,
    ]
  );
}

function getKnownAuthKeys() {
  const keys =
    getStorageKeys();

  return unique([
    ...Object.values(keys),
    ...getSlotKeys("refreshToken"),
    ...getSlotKeys("tempToken"),
    ...getSlotKeys("accessToken"),
    ...getSlotKeys("sessionId"),
    ...getSlotKeys("sessionUserId"),
    ...getSlotKeys("userSlug"),
    ...getSlotKeys("userName"),
    ...getSlotKeys("role"),
    ...getSlotKeys("lastUsername"),
    ...getSlotKeys("lastLoginIdentifier"),
    ...getSlotKeys("lastResetIdentifier"),
    ...getSlotKeys("redirectAfterLogin"),
  ]);
}

function getCoreAuthStorageKeys() {
  return unique([
    AppCore?.config?.storageKeys?.token,
    AppCore?.config?.storageKeys?.user,
    AppCore?.config?.storageKeys?.refreshToken,
    AppCore?.config?.storageKeys?.tempToken,
    AppCore?.config?.storageKeys?.sessionId,
    AppCore?.config?.storageKeys?.sessionUserId,
    "token",
    "user",
    "refreshToken",
    "tempToken",
    "sessionId",
    "sessionUserId",
  ]);
}

function getLegacyAuthKeys() {
  return unique([
    "onion_token",
    "onion_access_token",
    "onion_refresh_token",
    "onion_temp_token",
    "onion_temporary_token",
    "onion_two_factor_token",
    "onion_mfa_token",
    "onion_session_id",
    "onion_session_user_id",
    "onion_user_id",
    "onion_user_name",
    "onion_user_slug",
    "onion_role",

    "auth_token",
    "authToken",
    "access_token",
    "accessToken",
    "refresh_token",
    "refreshToken",
    "temp_token",
    "tempToken",
    "temporary_token",
    "temporaryToken",
    "challenge_token",
    "challengeToken",
    "two_factor_token",
    "twoFactorToken",
    "mfa_token",
    "mfaToken",

    "token",
    "session",
    "session_id",
    "sessionId",
    "session_user_id",
    "sessionUserId",
    "user",
    "user_id",
    "userId",
    "user_name",
    "userName",
    "user_slug",
    "userSlug",
    "role",
    "rol",
    "userRole",
    "user_role",

    "auth.token",
    "auth.accessToken",
    "auth.access_token",
    "auth.refreshToken",
    "auth.refresh_token",
    "auth.tempToken",
    "auth.temp_token",
    "auth.sessionId",
    "auth.session_id",
    "auth.sessionUserId",
    "auth.session_user_id",

    "session.token",
    "session.accessToken",
    "session.access_token",
    "session.refreshToken",
    "session.refresh_token",
    "session.user",
    "session.role",
  ]);
}

function getAllAuthClearKeys() {
  return unique([
    ...getKnownAuthKeys(),
    ...getCoreAuthStorageKeys(),
    ...getLegacyAuthKeys(),
  ]);
}

/* =========================================================
   VALUE NORMALIZATION
========================================================= */

function isCorruptedValue(value) {
  const text =
    safeText(value, "")
      .toLowerCase();

  return CORRUPTED_VALUES.has(text);
}

function pickFromObject(obj = {}, preferredKeys = []) {
  if (!isPlainObject(obj)) {
    return "";
  }

  for (const key of preferredKeys) {
    if (hasOwn(obj, key)) {
      const value =
        obj[key];

      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        const text =
          safeText(value, "");

        if (text) {
          return text;
        }
      }
    }
  }

  for (const key of TEXT_VALUE_PICK_KEYS) {
    if (hasOwn(obj, key)) {
      const value =
        obj[key];

      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        const text =
          safeText(value, "");

        if (text) {
          return text;
        }
      }
    }
  }

  return "";
}

function safeJsonUnwrap(value, preferredKeys = []) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return safeText(value, "");
  }

  if (isPlainObject(value)) {
    return pickFromObject(
      value,
      preferredKeys
    );
  }

  if (typeof value !== "string") {
    return "";
  }

  const raw =
    value.trim();

  if (
    !raw ||
    isCorruptedValue(raw)
  ) {
    return "";
  }

  try {
    const parsed =
      JSON.parse(raw);

    if (
      typeof parsed === "string" ||
      typeof parsed === "number" ||
      typeof parsed === "boolean"
    ) {
      return safeText(parsed, "");
    }

    if (isPlainObject(parsed)) {
      return (
        pickFromObject(
          parsed,
          preferredKeys
        ) ||
        ""
      );
    }

    return "";
  } catch {
    return raw;
  }
}

function normalizeStoredValue(value = "") {
  const unwrapped =
    safeJsonUnwrap(
      value,
      TEXT_VALUE_PICK_KEYS
    );

  if (isCorruptedValue(unwrapped)) {
    return "";
  }

  try {
    return (
      normalizeSessionValue(
        unwrapped,
        getMaxLen()
      ) || ""
    );
  } catch {
    return safeText(
      unwrapped,
      ""
    ).slice(
      0,
      getMaxLen()
    );
  }
}

function normalizeStoredToken(value = "") {
  const unwrapped =
    safeJsonUnwrap(
      value,
      TOKEN_PICK_KEYS
    );

  if (isCorruptedValue(unwrapped)) {
    return "";
  }

  let token =
    safeText(unwrapped, "");

  if (/^bearer\s+/i.test(token)) {
    token =
      token.replace(/^bearer\s+/i, "")
        .trim();
  }

  if (isCorruptedValue(token)) {
    return "";
  }

  const max =
    getTokenMaxLen();

  /*
    Regla dura:
    no se trunca token; token excedido = token corrupto.
  */
  if (
    max > 0 &&
    token.length > max
  ) {
    return "";
  }

  return token;
}

function normalizeStoredSessionId(value = "") {
  const unwrapped =
    safeJsonUnwrap(
      value,
      SESSION_ID_PICK_KEYS
    );

  return normalizeStoredValue(
    unwrapped
  );
}

function normalizeStoredSessionUserId(value = "") {
  const unwrapped =
    safeJsonUnwrap(
      value,
      SESSION_USER_ID_PICK_KEYS
    );

  return normalizeStoredValue(
    unwrapped
  );
}

function normalizeSessionData(sessionData = null, user = null) {
  const raw =
    safeObject(sessionData);

  const nestedSession =
    safeObject(raw.session);

  const safeUser =
    safeObject(user);

  const rawUser =
    safeObject(raw.user);

  const sessionId =
    normalizeStoredSessionId(
      raw.sessionId ??
        raw.session_id ??
        raw.sid ??
        raw.id ??
        nestedSession.sessionId ??
        nestedSession.session_id ??
        nestedSession.sid ??
        nestedSession.id ??
        ""
    );

  const userId =
    normalizeStoredSessionUserId(
      raw.userId ??
        raw.user_id ??
        raw.uid ??
        raw.sessionUserId ??
        raw.session_user_id ??
        nestedSession.userId ??
        nestedSession.user_id ??
        nestedSession.uid ??
        rawUser.userId ??
        rawUser.user_id ??
        rawUser.id ??
        safeUser.userId ??
        safeUser.user_id ??
        safeUser.id ??
        safeUser._id ??
        safeUser.uid ??
        safeUser.email ??
        safeUser.username ??
        safeUser.userName ??
        ""
    );

  return {
    sessionId:
      sessionId || "",

    userId:
      userId || "",
  };
}

function redactOpaque(value = "") {
  const text =
    safeText(value, "");

  if (!text) {
    return null;
  }

  if (text.length <= 8) {
    return "***";
  }

  return `${text.slice(0, 3)}***${text.slice(-3)}`;
}

/* =========================================================
   STORAGE ADAPTERS
========================================================= */

function getStorageApi() {
  try {
    const storage =
      AppCore?.storage || null;

    if (
      storage &&
      (
        typeof storage.get === "function" ||
        typeof storage.getRaw === "function" ||
        typeof storage.set === "function" ||
        typeof storage.setRaw === "function" ||
        typeof storage.remove === "function" ||
        typeof storage.delete === "function" ||
        typeof storage.del === "function"
      )
    ) {
      return storage;
    }
  } catch {}

  return null;
}

function canUseWebStorage(kind = "localStorage") {
  if (!isBrowser()) {
    return false;
  }

  try {
    const storage =
      window?.[kind];

    if (!storage) {
      return false;
    }

    const key =
      `__onion_auth_${kind}_probe__`;

    storage.setItem(key, "1");
    storage.removeItem(key);

    return true;
  } catch (error) {
    lastStorageError =
      error;

    return false;
  }
}

function getLocalStorage() {
  if (!canUseWebStorage("localStorage")) {
    return null;
  }

  try {
    return window.localStorage;
  } catch (error) {
    lastStorageError =
      error;

    return null;
  }
}

function getSessionStorage() {
  if (!canUseWebStorage("sessionStorage")) {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch (error) {
    lastStorageError =
      error;

    return null;
  }
}

/* =========================================================
   APPCORE STORAGE
========================================================= */

function readFromAppStorage(key, fallback = "", preferredKeys = []) {
  const storage =
    getStorageApi();

  if (!storage) {
    return fallback;
  }

  const candidates =
    getKeyCandidates(key);

  for (const candidate of candidates) {
    try {
      if (typeof storage.getRaw === "function") {
        const raw =
          storage.getRaw(
            candidate,
            ""
          );

        const text =
          safeJsonUnwrap(
            raw,
            preferredKeys
          );

        if (text) {
          return text;
        }
      }
    } catch (error) {
      lastStorageError =
        error;
    }

    try {
      if (typeof storage.get === "function") {
        const value =
          storage.get(
            candidate,
            ""
          );

        const text =
          safeJsonUnwrap(
            value,
            preferredKeys
          );

        if (text) {
          return text;
        }
      }
    } catch (error) {
      lastStorageError =
        error;
    }
  }

  return fallback;
}

function writeToAppStorage(key, value) {
  const storage =
    getStorageApi();

  if (!storage) {
    return false;
  }

  const cleanKey =
    stripKnownPrefix(key);

  const finalValue =
    safeText(value, "");

  if (!cleanKey || !finalValue) {
    return false;
  }

  try {
    if (typeof storage.setRaw === "function") {
      storage.setRaw(
        cleanKey,
        finalValue
      );

      return true;
    }
  } catch (error) {
    lastStorageError =
      error;
  }

  try {
    if (typeof storage.set === "function") {
      storage.set(
        cleanKey,
        finalValue
      );

      return true;
    }
  } catch (error) {
    lastStorageError =
      error;

    safeWarn(
      "AppCore.storage.set() falló.",
      {
        key:
          cleanKey,
        error,
      }
    );
  }

  return false;
}

function removeFromAppStorage(key) {
  const storage =
    getStorageApi();

  if (!storage) {
    return false;
  }

  const candidates =
    getKeyCandidates(key);

  let removed =
    false;

  for (const candidate of candidates) {
    try {
      if (typeof storage.remove === "function") {
        storage.remove(candidate);
        removed = true;
      }
    } catch (error) {
      lastStorageError =
        error;
    }

    try {
      if (typeof storage.delete === "function") {
        storage.delete(candidate);
        removed = true;
      }
    } catch (error) {
      lastStorageError =
        error;
    }

    try {
      if (typeof storage.del === "function") {
        storage.del(candidate);
        removed = true;
      }
    } catch (error) {
      lastStorageError =
        error;
    }

    /*
      Compat fallback para storages sin remove real.
    */
    try {
      if (typeof storage.setRaw === "function") {
        storage.setRaw(candidate, "");
        removed = true;
      }
    } catch {}

    try {
      if (typeof storage.set === "function") {
        storage.set(candidate, null);
        removed = true;
      }
    } catch {}
  }

  return removed;
}

/* =========================================================
   WEB STORAGE
========================================================= */

function readFromWebStorage(storage, key, fallback = "", preferredKeys = []) {
  if (!storage) {
    return fallback;
  }

  const candidates =
    getKeyCandidates(key);

  for (const candidate of candidates) {
    try {
      const value =
        storage.getItem(candidate);

      const text =
        safeJsonUnwrap(
          value,
          preferredKeys
        );

      if (text) {
        return text;
      }
    } catch (error) {
      lastStorageError =
        error;
    }
  }

  return fallback;
}

function writeToWebStorage(storage, key, value) {
  if (!storage) {
    return false;
  }

  const cleanKey =
    stripKnownPrefix(key);

  const finalKey =
    buildKey(cleanKey);

  const finalValue =
    safeText(value, "");

  if (!finalKey || !finalValue) {
    return false;
  }

  try {
    storage.setItem(
      finalKey,
      finalValue
    );

    return true;
  } catch (error) {
    lastStorageError =
      error;

    safeWarn(
      "webStorage.setItem() falló.",
      {
        key:
          finalKey,
        error,
      }
    );

    return false;
  }
}

function removeFromWebStorage(storage, key) {
  if (!storage) {
    return false;
  }

  const candidates =
    getKeyCandidates(key);

  let removed =
    false;

  for (const candidate of candidates) {
    try {
      storage.removeItem(candidate);
      removed = true;
    } catch (error) {
      lastStorageError =
        error;
    }
  }

  return removed;
}

/* =========================================================
   MEMORY STORAGE
========================================================= */

function readFromMemory(key, fallback = "", preferredKeys = []) {
  const candidates =
    getKeyCandidates(key);

  for (const candidate of candidates) {
    if (!memoryStorage.has(candidate)) {
      continue;
    }

    const value =
      memoryStorage.get(candidate);

    const text =
      safeJsonUnwrap(
        value,
        preferredKeys
      );

    if (text) {
      return text;
    }
  }

  return fallback;
}

function writeToMemory(key, value) {
  const cleanKey =
    stripKnownPrefix(key);

  const finalKey =
    buildKey(cleanKey);

  const finalValue =
    safeText(value, "");

  if (!finalKey || !finalValue) {
    return false;
  }

  memoryStorage.set(
    finalKey,
    finalValue
  );

  return true;
}

function removeFromMemory(key) {
  const candidates =
    getKeyCandidates(key);

  let removed =
    false;

  for (const candidate of candidates) {
    if (memoryStorage.delete(candidate)) {
      removed = true;
    }
  }

  return removed;
}

/* =========================================================
   RAW READ / WRITE / REMOVE
========================================================= */

function readRaw(key, fallback = "", preferredKeys = []) {
  const cleanKey =
    safeText(key, "");

  if (!cleanKey) {
    return fallback;
  }

  const fromAppStorage =
    readFromAppStorage(
      cleanKey,
      "",
      preferredKeys
    );

  if (fromAppStorage) {
    return fromAppStorage;
  }

  const fromLocalStorage =
    readFromWebStorage(
      getLocalStorage(),
      cleanKey,
      "",
      preferredKeys
    );

  if (fromLocalStorage) {
    return fromLocalStorage;
  }

  const fromSessionStorage =
    readFromWebStorage(
      getSessionStorage(),
      cleanKey,
      "",
      preferredKeys
    );

  if (fromSessionStorage) {
    return fromSessionStorage;
  }

  const fromMemory =
    readFromMemory(
      cleanKey,
      "",
      preferredKeys
    );

  if (fromMemory) {
    return fromMemory;
  }

  return fallback;
}

function readFirst(keys = [], fallback = "", preferredKeys = []) {
  for (const key of keys) {
    const value =
      readRaw(
        key,
        "",
        preferredKeys
      );

    if (value) {
      return value;
    }
  }

  return fallback;
}

function writeRaw(key, value, options = {}) {
  const cleanKey =
    safeText(key, "");

  if (!cleanKey) {
    return false;
  }

  const finalValue =
    safeText(value, "");

  if (!finalValue) {
    return removeRaw(cleanKey);
  }

  const {
    sessionOnly = false,
    localOnly = false,
    appStorage = true,
    localStorage = true,
    sessionStorage = true,
    memory = true,
  } = safeObject(options);

  const appOk =
    appStorage !== false &&
    !sessionOnly
      ? writeToAppStorage(
          cleanKey,
          finalValue
        )
      : false;

  const localOk =
    localStorage !== false &&
    !sessionOnly
      ? writeToWebStorage(
          getLocalStorage(),
          cleanKey,
          finalValue
        )
      : false;

  const sessionOk =
    sessionStorage !== false &&
    !localOnly
      ? writeToWebStorage(
          getSessionStorage(),
          cleanKey,
          finalValue
        )
      : false;

  const memoryOk =
    memory !== false
      ? writeToMemory(
          cleanKey,
          finalValue
        )
      : false;

  const ok =
    Boolean(
      appOk ||
        localOk ||
        sessionOk ||
        memoryOk
    );

  safeEmit(
    "auth:storage:write",
    {
      key:
        cleanKey,
      ok,
      targets: {
        appStorage:
          Boolean(appOk),
        localStorage:
          Boolean(localOk),
        sessionStorage:
          Boolean(sessionOk),
        memory:
          Boolean(memoryOk),
      },
    }
  );

  return ok;
}

function removeRaw(key) {
  const cleanKey =
    safeText(key, "");

  if (!cleanKey) {
    return false;
  }

  const appOk =
    removeFromAppStorage(cleanKey);

  const localOk =
    removeFromWebStorage(
      getLocalStorage(),
      cleanKey
    );

  const sessionOk =
    removeFromWebStorage(
      getSessionStorage(),
      cleanKey
    );

  const memoryOk =
    removeFromMemory(cleanKey);

  const ok =
    Boolean(
      appOk ||
        localOk ||
        sessionOk ||
        memoryOk
    );

  safeEmit(
    "auth:storage:remove",
    {
      key:
        cleanKey,
      ok,
      targets: {
        appStorage:
          Boolean(appOk),
        localStorage:
          Boolean(localOk),
        sessionStorage:
          Boolean(sessionOk),
        memory:
          Boolean(memoryOk),
      },
    }
  );

  return ok;
}

function writeNullable(key, value, options = {}) {
  const finalValue =
    safeText(value, "");

  if (!finalValue) {
    removeRaw(key);
    return false;
  }

  return writeRaw(
    key,
    finalValue,
    options
  );
}

/* =========================================================
   TOKENS
========================================================= */

export function persistRefreshToken(token = null) {
  const keys =
    getStorageKeys();

  return writeNullable(
    keys.refreshToken,
    normalizeStoredToken(token),
    {
      localOnly:
        false,
      sessionOnly:
        false,
    }
  );
}

export function getStoredRefreshToken() {
  return normalizeStoredToken(
    readFirst(
      getSlotKeys("refreshToken"),
      "",
      TOKEN_PICK_KEYS
    )
  );
}

export function hasRefreshToken() {
  return Boolean(
    getStoredRefreshToken()
  );
}

export function persistTempToken(token = null) {
  const keys =
    getStorageKeys();

  /*
    Temp token:
    - se escribe en local + session + memory para compatibilidad.
    - clearAuthStorage lo elimina siempre.
  */
  return writeNullable(
    keys.tempToken,
    normalizeStoredToken(token),
    {
      localOnly:
        false,
      sessionOnly:
        false,
    }
  );
}

export function getStoredTempToken() {
  return normalizeStoredToken(
    readFirst(
      getSlotKeys("tempToken"),
      "",
      TOKEN_PICK_KEYS
    )
  );
}

export function hasTempToken() {
  return Boolean(
    getStoredTempToken()
  );
}

export function persistAccessToken(token = null) {
  const keys =
    getStorageKeys();

  return writeNullable(
    keys.accessToken,
    normalizeStoredToken(token),
    {
      localOnly:
        false,
      sessionOnly:
        false,
    }
  );
}

export function getStoredAccessToken() {
  return normalizeStoredToken(
    readFirst(
      getSlotKeys("accessToken"),
      "",
      TOKEN_PICK_KEYS
    )
  );
}

export function hasAccessToken() {
  return Boolean(
    getStoredAccessToken()
  );
}

/* =========================================================
   SESSION CONTEXT
========================================================= */

export function persistSessionContext(sessionData = null, user = null) {
  const keys =
    getStorageKeys();

  const {
    sessionId,
    userId,
  } =
    normalizeSessionData(
      sessionData,
      user
    );

  writeNullable(
    keys.sessionId,
    sessionId
  );

  writeNullable(
    keys.sessionUserId,
    userId
  );

  safeEmit(
    "auth:storage:session-context",
    {
      hasSessionId:
        Boolean(sessionId),
      hasUserId:
        Boolean(userId),
    }
  );

  return {
    sessionId:
      sessionId || null,

    userId:
      userId || null,
  };
}

export function persistAuxSessionData(user = null) {
  const keys =
    getStorageKeys();

  const safeUser =
    safeObject(user);

  const userId =
    normalizeStoredSessionUserId(
      safeUser.userId ??
        safeUser.user_id ??
        safeUser.id ??
        safeUser._id ??
        safeUser.uid ??
        safeUser.sub ??
        safeUser.email ??
        safeUser.username ??
        safeUser.userName ??
        ""
    );

  const username =
    normalizeStoredValue(
      safeUser.username ??
        safeUser.userName ??
        safeUser.user_name ??
        safeUser.email ??
        safeUser.name ??
        safeUser.nombre ??
        ""
    );

  const slug =
    normalizeStoredValue(
      safeUser.slug ??
        safeUser.username ??
        safeUser.userName ??
        safeUser.email ??
        ""
    );

  const role =
    normalizeStoredValue(
      safeUser.role ??
        safeUser.rol ??
        safeUser.userRole ??
        safeUser.user_role ??
        ""
    );

  if (userId) {
    writeRaw(
      keys.sessionUserId,
      userId
    );
  } else {
    removeRaw(
      keys.sessionUserId
    );
  }

  if (username) {
    writeRaw(
      keys.userName,
      username
    );

    writeRaw(
      keys.lastUsername,
      username
    );
  } else {
    removeRaw(
      keys.userName
    );
  }

  if (slug) {
    writeRaw(
      keys.userSlug,
      slug
    );
  } else {
    removeRaw(
      keys.userSlug
    );
  }

  if (role) {
    writeRaw(
      keys.role,
      role
    );
  } else {
    removeRaw(
      keys.role
    );
  }

  safeEmit(
    "auth:storage:aux-session",
    {
      hasUserId:
        Boolean(userId),
      hasUsername:
        Boolean(username),
      hasSlug:
        Boolean(slug),
      hasRole:
        Boolean(role),
    }
  );

  return true;
}

export function getStoredSessionId() {
  return normalizeStoredSessionId(
    readFirst(
      getSlotKeys("sessionId"),
      "",
      SESSION_ID_PICK_KEYS
    )
  );
}

export function getStoredSessionUserId() {
  return normalizeStoredSessionUserId(
    readFirst(
      getSlotKeys("sessionUserId"),
      "",
      SESSION_USER_ID_PICK_KEYS
    )
  );
}

export function hasSessionContext() {
  return Boolean(
    getStoredSessionId() &&
      getStoredSessionUserId()
  );
}

/*
  Robusto:
  - refreshToken solo ya es contexto suficiente.
  - sessionId + sessionUserId también es contexto útil si backend soporta refresh por contexto.
  - Esto queda alineado con restore.js:
      hasUsableRefreshPayload = refreshToken OR (sessionId && userId)
*/
export function hasRefreshContext() {
  return Boolean(
    getStoredRefreshToken() ||
      hasSessionContext()
  );
}

export function hasCompleteRefreshContext() {
  return Boolean(
    getStoredRefreshToken() &&
      getStoredSessionId() &&
      getStoredSessionUserId()
  );
}

/* =========================================================
   AUX READERS / WRITERS
========================================================= */

export function getStoredUserSlug() {
  return normalizeStoredValue(
    readFirst(
      getSlotKeys("userSlug"),
      "",
      TEXT_VALUE_PICK_KEYS
    )
  );
}

export function getStoredUserName() {
  return normalizeStoredValue(
    readFirst(
      getSlotKeys("userName"),
      "",
      TEXT_VALUE_PICK_KEYS
    )
  );
}

export function getStoredRole() {
  return normalizeStoredValue(
    readFirst(
      getSlotKeys("role"),
      "",
      TEXT_VALUE_PICK_KEYS
    )
  );
}

export function getStoredLastUsername() {
  return normalizeStoredValue(
    readFirst(
      getSlotKeys("lastUsername"),
      "",
      TEXT_VALUE_PICK_KEYS
    )
  );
}

export function persistLastLoginIdentifier(value = null) {
  const keys =
    getStorageKeys();

  return writeNullable(
    keys.lastLoginIdentifier,
    normalizeStoredValue(value)
  );
}

export function getStoredLastLoginIdentifier() {
  return normalizeStoredValue(
    readFirst(
      getSlotKeys("lastLoginIdentifier"),
      "",
      TEXT_VALUE_PICK_KEYS
    )
  );
}

export function persistLastResetIdentifier(value = null) {
  const keys =
    getStorageKeys();

  return writeNullable(
    keys.lastResetIdentifier,
    normalizeStoredValue(value)
  );
}

export function getStoredLastResetIdentifier() {
  return normalizeStoredValue(
    readFirst(
      getSlotKeys("lastResetIdentifier"),
      "",
      TEXT_VALUE_PICK_KEYS
    )
  );
}

export function persistRedirectAfterLogin(value = null) {
  const keys =
    getStorageKeys();

  return writeNullable(
    keys.redirectAfterLogin,
    normalizeStoredValue(value)
  );
}

export function getStoredRedirectAfterLogin() {
  return normalizeStoredValue(
    readFirst(
      getSlotKeys("redirectAfterLogin"),
      "",
      TEXT_VALUE_PICK_KEYS
    )
  );
}

/* =========================================================
   CLEAR
========================================================= */

export function clearAuthStorage(options = {}) {
  const opts =
    safeObject(options);

  const silent =
    opts.silent !== undefined
      ? safeBool(opts.silent, true)
      : true;

  const includeLegacy =
    opts.includeLegacy !== undefined
      ? safeBool(opts.includeLegacy, true)
      : true;

  const keys =
    includeLegacy
      ? getAllAuthClearKeys()
      : getKnownAuthKeys();

  let removed =
    0;

  for (const key of keys) {
    if (removeRaw(key)) {
      removed += 1;
    }
  }

  /*
    Importante:
    No hacemos:
      localStorage.clear()
      sessionStorage.clear()

    No tocamos:
      lang
      theme
      sidebarOpen
      lastPublicPath
      lastRoute
      route
      publicPath
      postLoginTarget global si Core lo gestiona fuera de Auth
      window.__ONION_INITIAL_URL__
      window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__
      window.__ONION_RESET_CONFIRM_INITIAL_URL__
  */

  if (!silent) {
    safeEmit(
      "auth:storage:cleared",
      {
        removed,
        includeLegacy:
          Boolean(includeLegacy),
      }
    );
  }

  return true;
}

/* =========================================================
   DEBUG
========================================================= */

export function getAuthStorageSnapshot() {
  const keys =
    getStorageKeys();

  const refreshToken =
    getStoredRefreshToken();

  const tempToken =
    getStoredTempToken();

  const accessToken =
    getStoredAccessToken();

  const sessionId =
    getStoredSessionId();

  const sessionUserId =
    getStoredSessionUserId();

  return {
    version:
      AUTH_STORAGE_VERSION,

    keys,

    prefix:
      getPrefix(),

    clearableKeys:
      getAllAuthClearKeys(),

    hasAppStorage:
      Boolean(
        getStorageApi()
      ),

    hasLocalStorage:
      Boolean(
        getLocalStorage()
      ),

    hasSessionStorage:
      Boolean(
        getSessionStorage()
      ),

    memoryFallbackSize:
      memoryStorage.size,

    hasRefreshToken:
      Boolean(refreshToken),

    refreshTokenPreview:
      refreshToken
        ? redactOpaque(refreshToken)
        : null,

    hasTempToken:
      Boolean(tempToken),

    tempTokenPreview:
      tempToken
        ? redactOpaque(tempToken)
        : null,

    hasAccessToken:
      Boolean(accessToken),

    accessTokenPreview:
      accessToken
        ? redactOpaque(accessToken)
        : null,

    hasSessionId:
      Boolean(sessionId),

    sessionId:
      sessionId
        ? "***"
        : null,

    sessionIdPreview:
      sessionId
        ? redactOpaque(sessionId)
        : null,

    hasSessionUserId:
      Boolean(sessionUserId),

    sessionUserId:
      sessionUserId
        ? "***"
        : null,

    sessionUserIdPreview:
      sessionUserId
        ? redactOpaque(sessionUserId)
        : null,

    userSlug:
      getStoredUserSlug() ||
      null,

    userName:
      getStoredUserName() ||
      null,

    role:
      getStoredRole() ||
      null,

    lastUsername:
      getStoredLastUsername() ||
      null,

    hasSessionContext:
      hasSessionContext(),

    hasRefreshContext:
      hasRefreshContext(),

    hasCompleteRefreshContext:
      hasCompleteRefreshContext(),

    lastStorageError:
      lastStorageError
        ? {
            name:
              lastStorageError.name || "StorageError",
            message:
              lastStorageError.message || String(lastStorageError),
          }
        : null,

    at:
      safeIsoNow(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  persistRefreshToken,
  getStoredRefreshToken,
  hasRefreshToken,

  persistTempToken,
  getStoredTempToken,
  hasTempToken,

  persistAccessToken,
  getStoredAccessToken,
  hasAccessToken,

  persistSessionContext,
  persistAuxSessionData,

  getStoredSessionId,
  getStoredSessionUserId,

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

  clearAuthStorage,
  getAuthStorageSnapshot,
};
