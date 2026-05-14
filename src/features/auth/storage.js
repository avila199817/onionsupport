/* =========================================================
   Onion SPA - Auth Storage
   Archivo: src/features/auth/storage.js

   AUTH STORAGE · FINAL EXTREME PRO SYSTEM · 15/10

   RESPONSABILIDADES:
   - centralizar storage auth
   - persistir refresh token / temp token / access token
   - persistir contexto refresh: sessionId + sessionUserId
   - leer claves modernas y legacy de forma segura
   - limpiar sólo claves auth conocidas
   - no tocar rutas públicas técnicas
   - no tocar window.__ONION_INITIAL_URL__
   - no tocar window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__
   - no tocar window.__ONION_RESET_CONFIRM_INITIAL_URL__
   - no hacer localStorage.clear()
   - no hacer sessionStorage.clear()

   HARDENING:
   - browser guard total
   - AppCore.storage + localStorage + sessionStorage + memoria
   - fallback memoria si Web Storage no está disponible
   - lectura legacy: snake_case / camelCase / dot / colon / prefijo onion
   - valores corruptos descartados: null/undefined/false/{}/[]
   - JSON-string values compatibles
   - tokens nunca se truncan: se invalidan si exceden límite
   - session values sí se normalizan por longitud controlada
   - snapshots sin tokens/session ids reales
   - hasRefreshContext = refreshToken OR sessionId+sessionUserId
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  AUTH_STORAGE_KEYS,
  AUTH_LEGACY_STORAGE_KEYS,
  AUTH_CONSTANTS,
} from "./constants.js";

import {
  normalizeSessionValue,
} from "./helpers.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

export const AUTH_STORAGE_VERSION =
  "15.0.0";

const DEFAULT_PREFIX =
  "onion";

const DEFAULT_SESSION_VALUE_MAX =
  200;

const DEFAULT_TEXT_VALUE_MAX =
  2048;

const DEFAULT_TOKEN_MAX =
  8192;

const WEB_STORAGE_PROBE_PREFIX =
  "__onion_auth_storage_probe__";

const AUTH_STORAGE_EVENTS =
  Object.freeze({
    write:
      "auth:storage:write",

    remove:
      "auth:storage:remove",

    cleared:
      "auth:storage:cleared",

    sessionContext:
      "auth:storage:session-context",

    auxSession:
      "auth:storage:aux-session",

    repair:
      "auth:storage:repair",

    error:
      "auth:storage:error",
  });

const CORRUPTED_VALUES =
  new Set([
    "",
    "undefined",
    "null",
    "\"undefined\"",
    "\"null\"",
    "false",
    "\"false\"",
    "true",
    "\"true\"",
    "nan",
    "none",
    "{}",
    "[]",
    "[object object]",
    "\"\"",
    "''",
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
    "bearer",

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
    "data",
  ]);

const SESSION_ID_PICK_KEYS =
  Object.freeze([
    "sessionId",
    "session_id",
    "sid",
    "id",
    "value",
    "raw",
    "data",
  ]);

const SESSION_USER_ID_PICK_KEYS =
  Object.freeze([
    "sessionUserId",
    "session_user_id",
    "userId",
    "user_id",
    "uid",
    "sub",
    "id",
    "_id",
    "email",
    "mail",
    "username",
    "userName",
    "user_name",
    "phone",
    "telefono",
    "mobile",
    "value",
    "raw",
    "data",
  ]);

const TEXT_VALUE_PICK_KEYS =
  Object.freeze([
    "value",
    "raw",
    "text",
    "data",
  ]);

const PROTECTED_RUNTIME_KEYS =
  Object.freeze([
    "__ONION_INITIAL_URL__",
    "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
    "__ONION_RESET_CONFIRM_INITIAL_URL__",
    "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
  ]);

/* =========================================================
   MEMORY FALLBACK
========================================================= */

const memoryStorage =
  new Map();

let lastStorageError =
  null;

const webStorageAvailability = {
  localStorage:
    undefined,

  sessionStorage:
    undefined,
};

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isAnyObject(value) {
  return (
    value !== null &&
    typeof value === "object"
  );
}

function isFunction(value) {
  return typeof value === "function";
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
    const key =
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
        "enabled",
        "active",
      ].includes(key)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
        "disabled",
        "inactive",
      ].includes(key)
    ) {
      return false;
    }
  }

  return Boolean(fallback);
}

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeObject(value) {
  return isPlainObject(value)
    ? value
    : {};
}

function safeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return [];
  }

  return [value];
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
      safeArray(values)
        .flat(Infinity)
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
    if (AppCore?.config?.debug) {
      console.warn(
        "[AuthStorage]",
        ...args
      );
    }
  } catch {}
}

/* =========================================================
   SANITIZE / EVENTS
========================================================= */

function redactString(value = "") {
  return safeText(value, "")
    .replace(
      /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token|tempToken|temp_token|temporaryToken|temporary_token|twoFactorToken|two_factor_token|mfaToken|mfa_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(
      /(\/activate-account\/)([^/?#\s]+)/gi,
      "$1***"
    )
    .replace(
      /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
      "$1***"
    )
    .replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    )
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
}

function sanitizePayload(value, depth = 0, keyHint = "") {
  const lowerKey =
    safeText(keyHint, "").toLowerCase();

  if (
    /token|authorization|secret|password|credential|cookie|jwt|bearer|refresh|access|otp|mfa|2fa|code/i.test(lowerKey)
  ) {
    return value
      ? "***"
      : value;
  }

  if (depth > 5) {
    return "[MaxDepth]";
  }

  if (typeof value === "string") {
    return redactString(value);
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
    return {
      name:
        value.name || "Error",

      message:
        redactString(value.message || ""),

      code:
        value.code || null,

      status:
        value.status || value.statusCode || null,
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 80)
      .map((item) =>
        sanitizePayload(
          item,
          depth + 1,
          keyHint
        )
      );
  }

  if (isAnyObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 100)) {
      output[key] =
        sanitizePayload(
          item,
          depth + 1,
          key
        );
    }

    return output;
  }

  return redactString(String(value));
}

function sanitizeMeta(meta = {}) {
  return sanitizePayload(
    safeObject(meta)
  );
}

function safeEmit(eventName, payload = {}, options = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  if (
    options?.emit === false ||
    options?.silent === true
  ) {
    return false;
  }

  try {
    AppCore?.events?.emit?.(
      name,
      sanitizePayload({
        source:
          "auth.storage",

        version:
          AUTH_STORAGE_VERSION,

        at:
          safeIsoNow(),

        ...safeObject(payload),
      })
    );

    return true;
  } catch {}

  return false;
}

function recordStorageError(source = "storage", error = null, meta = {}) {
  lastStorageError =
    error || null;

  const payload = {
    source:
      safeText(source, "storage"),

    message:
      safeText(
        error?.message || error,
        "Storage error."
      ),

    name:
      safeText(
        error?.name,
        "StorageError"
      ),

    meta:
      sanitizeMeta(meta),

    at:
      safeIsoNow(),
  };

  safeEmit(
    AUTH_STORAGE_EVENTS.error,
    payload
  );

  return payload;
}

/* =========================================================
   CONFIG
========================================================= */

function getPrefix() {
  return safeText(
    AppCore?.config?.storagePrefix ||
      AppCore?.config?.appKey ||
      DEFAULT_PREFIX,
    DEFAULT_PREFIX
  )
    .replace(/^:+|:+$/g, "") ||
    DEFAULT_PREFIX;
}

function getSessionValueMaxLen() {
  return (
    safeNumber(
      AUTH_CONSTANTS?.sessionValueMaxLength,
      DEFAULT_SESSION_VALUE_MAX
    ) || DEFAULT_SESSION_VALUE_MAX
  );
}

function getTextValueMaxLen() {
  return (
    safeNumber(
      AUTH_CONSTANTS?.textValueMaxLength,
      DEFAULT_TEXT_VALUE_MAX
    ) || DEFAULT_TEXT_VALUE_MAX
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

    username:
      safeText(
        AUTH_STORAGE_KEYS?.username,
        "username"
      ),

    role:
      safeText(
        AUTH_STORAGE_KEYS?.role,
        "role"
      ),

    roles:
      safeText(
        AUTH_STORAGE_KEYS?.roles,
        "roles"
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

    postLoginTarget:
      safeText(
        AUTH_STORAGE_KEYS?.postLoginTarget,
        "postLoginTarget"
      ),
  };
}

/* =========================================================
   KEY NORMALIZATION
========================================================= */

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
    cleanKey.startsWith(`${prefix}_`) ||
    cleanKey.startsWith(`${prefix}.`)
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

  if (cleanKey.startsWith(`${prefix}.`)) {
    return cleanKey.slice(prefix.length + 1);
  }

  return cleanKey;
}

function camelToSnake(value = "") {
  return safeText(value, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-.\s:]+/g, "_")
    .toLowerCase();
}

function snakeToCamel(value = "") {
  return safeText(value, "")
    .replace(/[_-]([a-z0-9])/g, (_, char) =>
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

function underscored(value = "") {
  return safeText(value, "")
    .replace(/[:.]/g, "_");
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

  const underscore =
    underscored(stripped);

  return unique([
    cleanKey,
    stripped,

    snake,
    camel,
    dot,
    colon,
    underscore,

    `${prefix}:${stripped}`,
    `${prefix}:${snake}`,
    `${prefix}:${camel}`,
    `${prefix}:${dot}`,
    `${prefix}:${colon}`,
    `${prefix}:${underscore}`,

    `${prefix}.${stripped}`,
    `${prefix}.${snake}`,
    `${prefix}.${camel}`,
    `${prefix}.${dot}`,
    `${prefix}.${underscore}`,

    `${prefix}_${stripped}`,
    `${prefix}_${snake}`,
    `${prefix}_${camel}`,
    `${prefix}_${underscore}`,

    cleanKey.replace(/:/g, "."),
    cleanKey.replace(/\./g, ":"),
    cleanKey.replace(/[:.]/g, "_"),
  ]);
}

function getLegacyValue(key = "") {
  const legacy =
    AUTH_LEGACY_STORAGE_KEYS || {};

  const clean =
    safeText(key, "");

  if (!clean) {
    return "";
  }

  return safeText(
    legacy[clean],
    ""
  );
}

function getSlotKeys(slot = "") {
  const keys =
    getStorageKeys();

  const map = {
    refreshToken: [
      keys.refreshToken,
      getLegacyValue("refreshToken"),
      "refreshToken",
      "refresh_token",
      "auth.refreshToken",
      "auth.refresh_token",
      "session.refreshToken",
      "session.refresh_token",
      "onion_refresh_token",
      "onion:refreshToken",
      "onion:refresh_token",
      "onion.refreshToken",
      "onion.refresh_token",
    ],

    tempToken: [
      keys.tempToken,
      getLegacyValue("tempToken"),
      getLegacyValue("temporaryToken"),
      getLegacyValue("twoFactorToken"),
      getLegacyValue("mfaToken"),
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
      "onion:tempToken",
      "onion:temp_token",
      "onion.tempToken",
      "onion.temp_token",
    ],

    accessToken: [
      keys.accessToken,
      keys.token,
      getLegacyValue("token"),
      getLegacyValue("accessToken"),
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
      "onion_token",
      "onion_access_token",
      "auth_token",
      "onion:token",
      "onion:accessToken",
      "onion:access_token",
      "onion.token",
      "onion.accessToken",
      "onion.access_token",
    ],

    sessionId: [
      keys.sessionId,
      getLegacyValue("sessionId"),
      "sessionId",
      "session_id",
      "sid",
      "auth.sessionId",
      "auth.session_id",
      "session.id",
      "session.sessionId",
      "session.session_id",
      "onion_session_id",
      "onion:sessionId",
      "onion:session_id",
      "onion.sessionId",
      "onion.session_id",
    ],

    sessionUserId: [
      keys.sessionUserId,
      keys.userId,
      getLegacyValue("sessionUserId"),
      getLegacyValue("userId"),
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
      "onion:sessionUserId",
      "onion:session_user_id",
      "onion:userId",
      "onion:user_id",
      "onion.sessionUserId",
      "onion.session_user_id",
      "onion.userId",
      "onion.user_id",
    ],

    userSlug: [
      keys.userSlug,
      getLegacyValue("userSlug"),
      "userSlug",
      "user_slug",
      "slug",
      "onion_user_slug",
      "onion:userSlug",
      "onion:user_slug",
    ],

    userName: [
      keys.userName,
      keys.username,
      getLegacyValue("userName"),
      "userName",
      "user_name",
      "username",
      "lastUsername",
      "last_username",
      "onion_user_name",
      "onion_username",
      "onion:userName",
      "onion:user_name",
      "onion:username",
    ],

    role: [
      keys.role,
      getLegacyValue("role"),
      "role",
      "rol",
      "userRole",
      "user_role",
      "auth.role",
      "session.role",
      "onion_role",
      "onion:role",
      "onion.role",
    ],

    lastUsername: [
      keys.lastUsername,
      "lastUsername",
      "last_username",
      "username",
      "onion_last_username",
      "onion:lastUsername",
      "onion:last_username",
    ],

    lastLoginIdentifier: [
      keys.lastLoginIdentifier,
      "lastLoginIdentifier",
      "last_login_identifier",
      "loginIdentifier",
      "login_identifier",
      "onion_last_login_identifier",
      "onion:lastLoginIdentifier",
      "onion:last_login_identifier",
    ],

    lastResetIdentifier: [
      keys.lastResetIdentifier,
      "lastResetIdentifier",
      "last_reset_identifier",
      "resetIdentifier",
      "reset_identifier",
      "onion_last_reset_identifier",
      "onion:lastResetIdentifier",
      "onion:last_reset_identifier",
    ],

    redirectAfterLogin: [
      keys.redirectAfterLogin,
      keys.postLoginTarget,
      "redirectAfterLogin",
      "redirect_after_login",
      "postLoginTarget",
      "post_login_target",
      "auth.redirectAfterLogin",
      "onion_redirect_after_login",
      "onion_post_login_target",
      "onion:redirectAfterLogin",
      "onion:redirect_after_login",
      "onion:postLoginTarget",
      "onion:post_login_target",
    ],
  };

  return unique(
    map[slot] || [
      keys[slot],
      slot,
    ]
  );
}

function getWriteSlotKeys(slot = "") {
  const keys =
    getStorageKeys();

  const map = {
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

    accessToken: [
      keys.accessToken,
      keys.token,
      "accessToken",
      "access_token",
      "token",
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
    AppCore?.config?.storageKeys?.accessToken,
    AppCore?.config?.storageKeys?.access_token,
    AppCore?.config?.storageKeys?.user,
    AppCore?.config?.storageKeys?.refreshToken,
    AppCore?.config?.storageKeys?.refresh_token,
    AppCore?.config?.storageKeys?.tempToken,
    AppCore?.config?.storageKeys?.temp_token,
    AppCore?.config?.storageKeys?.sessionId,
    AppCore?.config?.storageKeys?.sessionUserId,
    AppCore?.config?.storageKeys?.role,

    "token",
    "accessToken",
    "access_token",
    "user",
    "currentUser",
    "authUser",
    "sessionUser",
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
    "session",
    "sessionData",
    "sessionId",
    "session_id",
    "sessionUserId",
    "session_user_id",
    "role",
    "rol",
    "userRole",
    "user_role",
  ]);
}

function getLegacyAuthKeys() {
  const legacyValues =
    AUTH_LEGACY_STORAGE_KEYS &&
    typeof AUTH_LEGACY_STORAGE_KEYS === "object"
      ? Object.values(AUTH_LEGACY_STORAGE_KEYS)
      : [];

  return unique([
    ...legacyValues,

    "onion_token",
    "onion_access_token",
    "onion_refresh_token",
    "onion_temp_token",
    "onion_temporary_token",
    "onion_two_factor_token",
    "onion_mfa_token",
    "onion_session_id",
    "onion_session_user_id",
    "onion_user",
    "onion_user_id",
    "onion_user_name",
    "onion_user_slug",
    "onion_role",

    "onion:token",
    "onion:accessToken",
    "onion:access_token",
    "onion:refreshToken",
    "onion:refresh_token",
    "onion:tempToken",
    "onion:temp_token",
    "onion:session",
    "onion:sessionData",
    "onion:sessionId",
    "onion:session_id",
    "onion:sessionUserId",
    "onion:session_user_id",
    "onion:user",
    "onion:userId",
    "onion:user_id",
    "onion:userName",
    "onion:user_name",
    "onion:userSlug",
    "onion:user_slug",
    "onion:role",

    "onion.token",
    "onion.accessToken",
    "onion.access_token",
    "onion.refreshToken",
    "onion.refresh_token",
    "onion.tempToken",
    "onion.temp_token",
    "onion.session",
    "onion.sessionData",
    "onion.sessionId",
    "onion.session_id",
    "onion.sessionUserId",
    "onion.session_user_id",
    "onion.user",
    "onion.role",

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
    "accessToken",
    "access_token",
    "session",
    "sessionData",
    "session_id",
    "sessionId",
    "session_user_id",
    "sessionUserId",
    "user",
    "currentUser",
    "authUser",
    "sessionUser",
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
    "auth.session",
    "auth.sessionData",
    "auth.sessionId",
    "auth.session_id",
    "auth.sessionUserId",
    "auth.session_user_id",
    "auth.user",
    "auth.role",

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
    safeText(value, "").toLowerCase();

  return CORRUPTED_VALUES.has(text);
}

function pickFromObject(obj = {}, preferredKeys = [], depth = 0) {
  if (
    !isPlainObject(obj) ||
    depth > 4
  ) {
    return "";
  }

  for (const key of preferredKeys) {
    if (!hasOwn(obj, key)) {
      continue;
    }

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

    if (isPlainObject(value)) {
      const nested =
        pickFromObject(
          value,
          preferredKeys,
          depth + 1
        );

      if (nested) {
        return nested;
      }
    }
  }

  for (const key of TEXT_VALUE_PICK_KEYS) {
    if (!hasOwn(obj, key)) {
      continue;
    }

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

    if (isPlainObject(value)) {
      const nested =
        pickFromObject(
          value,
          preferredKeys,
          depth + 1
        );

      if (nested) {
        return nested;
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
      return pickFromObject(
        parsed,
        preferredKeys
      );
    }

    return "";
  } catch {
    return raw;
  }
}

function normalizeStoredValue(value = "", maxLen = getSessionValueMaxLen()) {
  const unwrapped =
    safeJsonUnwrap(
      value,
      TEXT_VALUE_PICK_KEYS
    );

  if (isCorruptedValue(unwrapped)) {
    return "";
  }

  const limit =
    Math.max(
      1,
      safeNumber(
        maxLen,
        getSessionValueMaxLen()
      )
    );

  try {
    return (
      normalizeSessionValue(
        unwrapped,
        limit
      ) || ""
    );
  } catch {
    return safeText(unwrapped, "").slice(
      0,
      limit
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

  if (
    !token ||
    isCorruptedValue(token) ||
    /[\r\n\t\s]/.test(token)
  ) {
    return "";
  }

  const max =
    getTokenMaxLen();

  /*
    Regla dura:
    Tokens no se truncan. Si exceden, se descartan.
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
    unwrapped,
    getSessionValueMaxLen()
  );
}

function normalizeStoredSessionUserId(value = "") {
  const unwrapped =
    safeJsonUnwrap(
      value,
      SESSION_USER_ID_PICK_KEYS
    );

  return normalizeStoredValue(
    unwrapped,
    getSessionValueMaxLen()
  );
}

function normalizeStoredText(value = "") {
  return normalizeStoredValue(
    value,
    getTextValueMaxLen()
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
    safeObject(raw.user || raw.usuario);

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
      raw.sessionUserId ??
        raw.session_user_id ??
        raw.userId ??
        raw.user_id ??
        raw.uid ??
        raw.sub ??
        nestedSession.sessionUserId ??
        nestedSession.session_user_id ??
        nestedSession.userId ??
        nestedSession.user_id ??
        nestedSession.uid ??
        nestedSession.sub ??
        rawUser.userId ??
        rawUser.user_id ??
        rawUser.id ??
        rawUser._id ??
        rawUser.uid ??
        rawUser.sub ??
        rawUser.email ??
        rawUser.username ??
        rawUser.userName ??
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

  return {
    sessionId:
      sessionId || "",

    userId:
      userId || "",

    sessionUserId:
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
        isFunction(storage.get) ||
        isFunction(storage.getRaw) ||
        isFunction(storage.set) ||
        isFunction(storage.setRaw) ||
        isFunction(storage.remove) ||
        isFunction(storage.delete) ||
        isFunction(storage.del)
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

  if (webStorageAvailability[kind] !== undefined) {
    return Boolean(webStorageAvailability[kind]);
  }

  try {
    const storage =
      window?.[kind];

    if (!storage) {
      webStorageAvailability[kind] =
        false;

      return false;
    }

    const key =
      `${WEB_STORAGE_PROBE_PREFIX}${kind}`;

    storage.setItem(
      key,
      "1"
    );

    storage.removeItem(key);

    webStorageAvailability[kind] =
      true;

    return true;
  } catch (error) {
    lastStorageError =
      error;

    webStorageAvailability[kind] =
      false;

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
      if (isFunction(storage.getRaw)) {
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
      if (isFunction(storage.get)) {
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

  if (
    !cleanKey ||
    !finalValue
  ) {
    return false;
  }

  try {
    if (isFunction(storage.setRaw)) {
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
    if (isFunction(storage.set)) {
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
      if (isFunction(storage.remove)) {
        storage.remove(candidate);
        removed = true;
      }
    } catch (error) {
      lastStorageError =
        error;
    }

    try {
      if (isFunction(storage.delete)) {
        storage.delete(candidate);
        removed = true;
      }
    } catch (error) {
      lastStorageError =
        error;
    }

    try {
      if (isFunction(storage.del)) {
        storage.del(candidate);
        removed = true;
      }
    } catch (error) {
      lastStorageError =
        error;
    }

    try {
      if (isFunction(storage.setRaw)) {
        storage.setRaw(
          candidate,
          ""
        );

        removed = true;
      }
    } catch {}

    try {
      if (isFunction(storage.set)) {
        storage.set(
          candidate,
          null
        );

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

  if (
    !finalKey ||
    !finalValue
  ) {
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

  if (
    !finalKey ||
    !finalValue
  ) {
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
  for (const key of unique(keys)) {
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
    return removeRaw(
      cleanKey,
      {
        emit:
          options.emit,
        silent:
          options.silent,
      }
    );
  }

  const opts =
    safeObject(options);

  const {
    sessionOnly = false,
    localOnly = false,
    appStorage = true,
    localStorage = true,
    sessionStorage = true,
    memory = true,
  } = opts;

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
    AUTH_STORAGE_EVENTS.write,
    {
      key:
        stripKnownPrefix(cleanKey),

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
    },
    opts
  );

  return ok;
}

function writeRawMany(keys = [], value, options = {}) {
  const cleanValue =
    safeText(value, "");

  if (!cleanValue) {
    let removed =
      false;

    for (const key of unique(keys)) {
      removed =
        removeRaw(
          key,
          {
            emit:
              false,
          }
        ) || removed;
    }

    return removed;
  }

  let ok =
    false;

  for (const key of unique(keys)) {
    ok =
      writeRaw(
        key,
        cleanValue,
        options
      ) || ok;
  }

  return ok;
}

function removeRaw(key, options = {}) {
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
    AUTH_STORAGE_EVENTS.remove,
    {
      key:
        stripKnownPrefix(cleanKey),

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
    },
    options
  );

  return ok;
}

function writeNullable(key, value, options = {}) {
  const finalValue =
    safeText(value, "");

  if (!finalValue) {
    removeRaw(
      key,
      {
        ...options,
        emit:
          options.emit === true,
      }
    );

    return false;
  }

  return writeRaw(
    key,
    finalValue,
    options
  );
}

function clearSlot(slot = "") {
  const keys =
    getSlotKeys(slot);

  let removed =
    false;

  for (const key of keys) {
    removed =
      removeRaw(
        key,
        {
          emit:
            false,
          silent:
            true,
        }
      ) || removed;
  }

  return removed;
}

/* =========================================================
   TOKENS
========================================================= */

export function persistRefreshToken(token = null) {
  const normalized =
    normalizeStoredToken(token);

  if (!normalized) {
    return clearSlot("refreshToken");
  }

  return writeRawMany(
    getWriteSlotKeys("refreshToken"),
    normalized,
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
  const normalized =
    normalizeStoredToken(token);

  if (!normalized) {
    return clearSlot("tempToken");
  }

  return writeRawMany(
    getWriteSlotKeys("tempToken"),
    normalized,
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
  const normalized =
    normalizeStoredToken(token);

  if (!normalized) {
    return clearSlot("accessToken");
  }

  /*
    Compat crítica:
    Core puede mirar `token`, Auth puede mirar `access_token`.
    Se persisten ambas claves lógicas, sin duplicar valor corrupto.
  */
  return writeRawMany(
    getWriteSlotKeys("accessToken"),
    normalized,
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
  const {
    sessionId,
    userId,
  } =
    normalizeSessionData(
      sessionData,
      user
    );

  if (sessionId) {
    writeRawMany(
      getWriteSlotKeys("sessionId"),
      sessionId,
      {
        emit:
          false,
      }
    );
  } else {
    clearSlot("sessionId");
  }

  if (userId) {
    writeRawMany(
      getWriteSlotKeys("sessionUserId"),
      userId,
      {
        emit:
          false,
      }
    );
  } else {
    clearSlot("sessionUserId");
  }

  safeEmit(
    AUTH_STORAGE_EVENTS.sessionContext,
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

    sessionUserId:
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
        safeUser.mail ??
        safeUser.username ??
        safeUser.userName ??
        safeUser.user_name ??
        ""
    );

  const username =
    normalizeStoredValue(
      safeUser.username ??
        safeUser.userName ??
        safeUser.user_name ??
        safeUser.email ??
        safeUser.mail ??
        safeUser.name ??
        safeUser.nombre ??
        "",
      getSessionValueMaxLen()
    );

  const slug =
    normalizeStoredValue(
      safeUser.slug ??
        safeUser.usernameLower ??
        safeUser.username_lower ??
        safeUser.username ??
        safeUser.userName ??
        safeUser.user_name ??
        safeUser.email ??
        "",
      getSessionValueMaxLen()
    );

  const role =
    normalizeStoredValue(
      safeUser.role ??
        safeUser.rol ??
        safeUser.userRole ??
        safeUser.user_role ??
        "",
      getSessionValueMaxLen()
    );

  if (userId) {
    writeRawMany(
      getWriteSlotKeys("sessionUserId"),
      userId,
      {
        emit:
          false,
      }
    );
  } else {
    clearSlot("sessionUserId");
  }

  if (username) {
    writeRaw(
      keys.userName,
      username,
      {
        emit:
          false,
      }
    );

    writeRaw(
      keys.username,
      username,
      {
        emit:
          false,
      }
    );

    writeRaw(
      keys.lastUsername,
      username,
      {
        emit:
          false,
      }
    );
  } else {
    removeRaw(
      keys.userName,
      {
        emit:
          false,
      }
    );

    removeRaw(
      keys.username,
      {
        emit:
          false,
      }
    );
  }

  if (slug) {
    writeRaw(
      keys.userSlug,
      slug,
      {
        emit:
          false,
      }
    );
  } else {
    removeRaw(
      keys.userSlug,
      {
        emit:
          false,
        }
    );
  }

  if (role) {
    writeRaw(
      keys.role,
      role,
      {
        emit:
          false,
      }
    );
  } else {
    removeRaw(
      keys.role,
      {
        emit:
          false,
      }
    );
  }

  safeEmit(
    AUTH_STORAGE_EVENTS.auxSession,
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

export function getStoredSessionContext() {
  const sessionId =
    getStoredSessionId();

  const sessionUserId =
    getStoredSessionUserId();

  return {
    sessionId:
      sessionId || null,

    session_id:
      sessionId || null,

    userId:
      sessionUserId || null,

    user_id:
      sessionUserId || null,

    sessionUserId:
      sessionUserId || null,

    session_user_id:
      sessionUserId || null,
  };
}

export function hasSessionContext() {
  return Boolean(
    getStoredSessionId() &&
      getStoredSessionUserId()
  );
}

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
    ),
    getSessionValueMaxLen()
  );
}

export function getStoredUserName() {
  return normalizeStoredValue(
    readFirst(
      getSlotKeys("userName"),
      "",
      TEXT_VALUE_PICK_KEYS
    ),
    getSessionValueMaxLen()
  );
}

export function getStoredRole() {
  return normalizeStoredValue(
    readFirst(
      getSlotKeys("role"),
      "",
      TEXT_VALUE_PICK_KEYS
    ),
    getSessionValueMaxLen()
  );
}

export function getStoredLastUsername() {
  return normalizeStoredValue(
    readFirst(
      getSlotKeys("lastUsername"),
      "",
      TEXT_VALUE_PICK_KEYS
    ),
    getSessionValueMaxLen()
  );
}

export function persistLastLoginIdentifier(value = null) {
  const keys =
    getStorageKeys();

  return writeNullable(
    keys.lastLoginIdentifier,
    normalizeStoredText(value)
  );
}

export function getStoredLastLoginIdentifier() {
  return normalizeStoredText(
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
    normalizeStoredText(value)
  );
}

export function getStoredLastResetIdentifier() {
  return normalizeStoredText(
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
    normalizeStoredText(value)
  );
}

export function getStoredRedirectAfterLogin() {
  return normalizeStoredText(
    readFirst(
      getSlotKeys("redirectAfterLogin"),
      "",
      TEXT_VALUE_PICK_KEYS
    )
  );
}

export function removeStoredRedirectAfterLogin() {
  return clearSlot("redirectAfterLogin");
}

/* =========================================================
   REPAIR
========================================================= */

export function repairCorruptedAuthStorage() {
  const keys =
    getAllAuthClearKeys();

  let removed =
    0;

  for (const key of keys) {
    const raw =
      readRaw(
        key,
        "",
        TEXT_VALUE_PICK_KEYS
      );

    if (
      raw &&
      !isCorruptedValue(raw)
    ) {
      continue;
    }

    if (
      removeRaw(
        key,
        {
          emit:
            false,
          silent:
            true,
        }
      )
    ) {
      removed += 1;
    }
  }

  safeEmit(
    AUTH_STORAGE_EVENTS.repair,
    {
      removed,
    }
  );

  return {
    ok:
      true,

    removed,
  };
}

/* =========================================================
   CLEAR
========================================================= */

export function clearAuthStorage(options = {}) {
  const opts =
    safeObject(options);

  const silent =
    opts.silent !== undefined
      ? safeBool(
          opts.silent,
          true
        )
      : true;

  const includeLegacy =
    opts.includeLegacy !== undefined
      ? safeBool(
          opts.includeLegacy,
          true
        )
      : true;

  const keys =
    includeLegacy
      ? getAllAuthClearKeys()
      : getKnownAuthKeys();

  let removed =
    0;

  for (const key of keys) {
    if (
      removeRaw(
        key,
        {
          emit:
            false,
          silent:
            true,
        }
      )
    ) {
      removed += 1;
    }
  }

  /*
    Deliberadamente NO se hace:
      - localStorage.clear()
      - sessionStorage.clear()

    Deliberadamente NO se toca:
      - lang
      - theme
      - sidebarOpen
      - route
      - publicPath
      - lastRoute
      - lastPublicPath
      - window.__ONION_INITIAL_URL__
      - window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__
      - window.__ONION_RESET_CONFIRM_INITIAL_URL__
  */

  if (!silent) {
    safeEmit(
      AUTH_STORAGE_EVENTS.cleared,
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

    protectedRuntimeKeys:
      PROTECTED_RUNTIME_KEYS,

    hasAppStorage:
      Boolean(getStorageApi()),

    hasLocalStorage:
      Boolean(getLocalStorage()),

    hasSessionStorage:
      Boolean(getSessionStorage()),

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
      getStoredUserSlug() || null,

    userName:
      getStoredUserName() || null,

    role:
      getStoredRole() || null,

    lastUsername:
      getStoredLastUsername() || null,

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
  AUTH_STORAGE_VERSION,

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
