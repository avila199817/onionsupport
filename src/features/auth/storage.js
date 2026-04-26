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
   - lectura legacy prefijada y no prefijada
   - limpieza limitada a claves auth conocidas
   - normalización estricta de valores de sesión
   - hasRefreshContext robusto
   - limpieza legacy completa de restos de login fallido
   - protección contra valores corruptos "undefined" / "null"
   - soporte JSON-string values desde AppCore.storage

   FIX 10/10:
   - clearAuthStorage elimina refresh/temp/session context
   - clearAuthStorage elimina access/token/user/role legacy
   - clearAuthStorage elimina claves legacy no namespaced
   - clearAuthStorage elimina claves legacy namespaced
   - clearAuthStorage elimina localStorage + sessionStorage
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
  } catch {}
}

/* =========================================================
   CONFIG
========================================================= */

function getPrefix() {
  return safeText(
    AppCore?.config?.storagePrefix,
    "onion"
  );
}

function buildKey(key = "") {
  const cleanKey =
    safeText(key, "");

  if (!cleanKey) {
    return "";
  }

  return `${getPrefix()}:${cleanKey}`;
}

function getMaxLen() {
  return (
    safeNumber(
      AUTH_CONSTANTS?.sessionValueMaxLength,
      200
    ) || 200
  );
}

function getTokenMaxLen() {
  return Math.max(
    getMaxLen(),
    safeNumber(
      AUTH_CONSTANTS?.tokenMaxLength,
      4096
    ) || 4096
  );
}

function getStorageKeys() {
  return {
    refreshToken:
      safeText(
        AUTH_STORAGE_KEYS?.refreshToken,
        "refresh_token"
      ),

    tempToken:
      safeText(
        AUTH_STORAGE_KEYS?.tempToken,
        "temp_token"
      ),

    accessToken:
      safeText(
        AUTH_STORAGE_KEYS?.accessToken,
        "access_token"
      ),

    sessionId:
      safeText(
        AUTH_STORAGE_KEYS?.sessionId,
        "session_id"
      ),

    sessionUserId:
      safeText(
        AUTH_STORAGE_KEYS?.sessionUserId,
        "session_user_id"
      ),

    userSlug:
      safeText(
        AUTH_STORAGE_KEYS?.userSlug,
        "user_slug"
      ),

    userName:
      safeText(
        AUTH_STORAGE_KEYS?.userName,
        "user_name"
      ),

    role:
      safeText(
        AUTH_STORAGE_KEYS?.role,
        "role"
      ),

    lastUsername:
      safeText(
        AUTH_STORAGE_KEYS?.lastUsername,
        "last_username"
      ),

    lastLoginIdentifier:
      safeText(
        AUTH_STORAGE_KEYS?.lastLoginIdentifier,
        "last_login_identifier"
      ),

    lastResetIdentifier:
      safeText(
        AUTH_STORAGE_KEYS?.lastResetIdentifier,
        "last_reset_identifier"
      ),

    redirectAfterLogin:
      safeText(
        AUTH_STORAGE_KEYS?.redirectAfterLogin,
        "redirect_after_login"
      ),
  };
}

function getKnownAuthKeys() {
  const keys =
    getStorageKeys();

  return Object.values(keys)
    .map((value) =>
      safeText(value, "")
    )
    .filter(Boolean);
}

function getCoreAuthStorageKeys() {
  return [
    AppCore?.config?.storageKeys?.token,
    AppCore?.config?.storageKeys?.user,
  ]
    .map((value) =>
      safeText(value, "")
    )
    .filter(Boolean);
}

function getLegacyAuthKeys() {
  return [
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
  ];
}

function getAllAuthClearKeys() {
  return Array.from(
    new Set([
      ...getKnownAuthKeys(),
      ...getCoreAuthStorageKeys(),
      ...getLegacyAuthKeys(),
    ].filter(Boolean))
  );
}

/* =========================================================
   VALUE NORMALIZATION
========================================================= */

function isCorruptedValue(value) {
  const text =
    safeText(value, "").toLowerCase();

  return (
    !text ||
    text === "undefined" ||
    text === "null" ||
    text === "\"undefined\"" ||
    text === "\"null\"" ||
    text === "{}" ||
    text === "[]"
  );
}

function safeJsonUnwrap(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (typeof value === "string") {
    const raw =
      value.trim();

    if (!raw) {
      return "";
    }

    if (isCorruptedValue(raw)) {
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

      if (
        parsed === null ||
        parsed === undefined
      ) {
        return "";
      }

      return raw;
    } catch {
      return raw;
    }
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return safeText(value, "");
  }

  return "";
}

function normalizeStoredValue(value = "") {
  const unwrapped =
    safeJsonUnwrap(value);

  if (isCorruptedValue(unwrapped)) {
    return "";
  }

  return (
    normalizeSessionValue(
      unwrapped,
      getMaxLen()
    ) || ""
  );
}

function normalizeStoredToken(value = "") {
  const unwrapped =
    safeJsonUnwrap(value);

  if (isCorruptedValue(unwrapped)) {
    return "";
  }

  return (
    normalizeSessionValue(
      unwrapped,
      getTokenMaxLen()
    ) || ""
  );
}

function normalizeSessionData(sessionData = null, user = null) {
  const raw =
    safeObject(sessionData);

  const safeUser =
    safeObject(user);

  const sessionId =
    normalizeStoredValue(
      raw.sessionId ??
        raw.session_id ??
        raw.sid ??
        raw.id ??
        raw.session?.id ??
        ""
    );

  const userId =
    normalizeStoredValue(
      raw.userId ??
        raw.user_id ??
        raw.uid ??
        raw.sessionUserId ??
        raw.session_user_id ??
        raw.user?.userId ??
        raw.user?.user_id ??
        raw.user?.id ??
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
        typeof storage.delete === "function"
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
      `__onion_${kind}_probe__`;

    storage.setItem(key, "1");
    storage.removeItem(key);

    return true;
  } catch {
    return false;
  }
}

function getLocalStorage() {
  if (!canUseWebStorage("localStorage")) {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getSessionStorage() {
  if (!canUseWebStorage("sessionStorage")) {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/* =========================================================
   KEY CANDIDATES
========================================================= */

function getKeyCandidates(key = "") {
  const cleanKey =
    safeText(key, "");

  if (!cleanKey) {
    return [];
  }

  const prefix =
    getPrefix();

  const prefixed =
    buildKey(cleanKey);

  const colonToDot =
    cleanKey.replace(/:/g, ".");

  const dotToColon =
    cleanKey.replace(/\./g, ":");

  const snakeLike =
    cleanKey
      .replace(/\./g, "_")
      .replace(/:/g, "_");

  const prefixedSnake =
    `${prefix}_${snakeLike}`;

  return Array.from(
    new Set([
      cleanKey,
      prefixed,

      colonToDot,
      dotToColon,

      prefixed
        ? prefixed.replace(/:/g, ".")
        : "",

      prefixed
        ? prefixed.replace(/\./g, ":")
        : "",

      snakeLike,
      prefixedSnake,

      cleanKey.startsWith(`${prefix}:`)
        ? cleanKey.slice(prefix.length + 1)
        : "",

      cleanKey.startsWith(`${prefix}_`)
        ? cleanKey.slice(prefix.length + 1)
        : "",
    ].filter(Boolean))
  );
}

/* =========================================================
   RAW READ / WRITE / REMOVE - APPCORE
========================================================= */

function readFromAppStorage(key, fallback = "") {
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
          storage.getRaw(candidate, "");

        const text =
          safeJsonUnwrap(raw);

        if (text) {
          return text;
        }
      }
    } catch {}

    try {
      if (typeof storage.get === "function") {
        const value =
          storage.get(candidate, "");

        const text =
          safeJsonUnwrap(value);

        if (text) {
          return text;
        }
      }
    } catch {}
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
    safeText(key, "");

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
  } catch {}

  try {
    if (typeof storage.set === "function") {
      /*
        Clave lógica. AppCore.storage aplica namespace internamente.
      */
      storage.set(
        cleanKey,
        finalValue
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      "AppCore.storage.set() falló.",
      {
        key: cleanKey,
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

  let removed = false;

  for (const candidate of candidates) {
    try {
      if (typeof storage.remove === "function") {
        storage.remove(candidate);
        removed = true;
        continue;
      }
    } catch {}

    try {
      if (typeof storage.delete === "function") {
        storage.delete(candidate);
        removed = true;
        continue;
      }
    } catch {}

    try {
      if (typeof storage.setRaw === "function") {
        storage.setRaw(candidate, "");
        removed = true;
        continue;
      }
    } catch {}

    try {
      if (typeof storage.set === "function") {
        storage.set(candidate, "");
        removed = true;
      }
    } catch {}
  }

  return removed;
}

/* =========================================================
   RAW READ / WRITE / REMOVE - WEB STORAGE
========================================================= */

function readFromWebStorage(storage, key, fallback = "") {
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
        safeJsonUnwrap(value);

      if (text) {
        return text;
      }
    } catch {}
  }

  return fallback;
}

function writeToWebStorage(storage, key, value) {
  if (!storage) {
    return false;
  }

  const cleanKey =
    safeText(key, "");

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
    safeWarn(
      "webStorage.setItem() falló.",
      {
        key: finalKey,
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

  let removed = false;

  for (const candidate of candidates) {
    try {
      storage.removeItem(candidate);
      removed = true;
    } catch {}
  }

  return removed;
}

/* =========================================================
   RAW READ / WRITE / REMOVE
========================================================= */

function readRaw(key, fallback = "") {
  const cleanKey =
    safeText(key, "");

  if (!cleanKey) {
    return fallback;
  }

  const fromAppStorage =
    readFromAppStorage(cleanKey, "");

  if (fromAppStorage) {
    return fromAppStorage;
  }

  const fromLocalStorage =
    readFromWebStorage(
      getLocalStorage(),
      cleanKey,
      ""
    );

  if (fromLocalStorage) {
    return fromLocalStorage;
  }

  const fromSessionStorage =
    readFromWebStorage(
      getSessionStorage(),
      cleanKey,
      ""
    );

  if (fromSessionStorage) {
    return fromSessionStorage;
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
  } = options;

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

  const ok =
    Boolean(
      appOk ||
      localOk ||
      sessionOk
    );

  safeEmit(
    "auth:storage:write",
    {
      key: cleanKey,
      ok,
      targets: {
        appStorage:
          Boolean(appOk),
        localStorage:
          Boolean(localOk),
        sessionStorage:
          Boolean(sessionOk),
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

  const ok =
    Boolean(
      appOk ||
      localOk ||
      sessionOk
    );

  safeEmit(
    "auth:storage:remove",
    {
      key: cleanKey,
      ok,
      targets: {
        appStorage:
          Boolean(appOk),
        localStorage:
          Boolean(localOk),
        sessionStorage:
          Boolean(sessionOk),
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
      localOnly: false,
      sessionOnly: false,
    }
  );
}

export function getStoredRefreshToken() {
  const keys =
    getStorageKeys();

  return normalizeStoredToken(
    readRaw(
      keys.refreshToken,
      ""
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
    - se escribe en local + session para compatibilidad.
    - clearAuthStorage lo elimina siempre.
  */
  return writeNullable(
    keys.tempToken,
    normalizeStoredToken(token),
    {
      localOnly: false,
      sessionOnly: false,
    }
  );
}

export function getStoredTempToken() {
  const keys =
    getStorageKeys();

  return normalizeStoredToken(
    readRaw(
      keys.tempToken,
      ""
    )
  );
}

export function hasTempToken() {
  return Boolean(
    getStoredTempToken()
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
  } = normalizeSessionData(
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
    normalizeStoredValue(
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
  const keys =
    getStorageKeys();

  return normalizeStoredValue(
    readRaw(
      keys.sessionId,
      ""
    )
  );
}

export function getStoredSessionUserId() {
  const keys =
    getStorageKeys();

  return normalizeStoredValue(
    readRaw(
      keys.sessionUserId,
      ""
    )
  );
}

/*
  Robusto:
  - refreshToken solo ya es contexto suficiente para intentar refresh.
  - sessionId/sessionUserId enriquecen backend legacy, pero no bloquean.
*/
export function hasRefreshContext() {
  return Boolean(
    getStoredRefreshToken()
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
   AUX READERS
========================================================= */

export function getStoredUserSlug() {
  const keys =
    getStorageKeys();

  return normalizeStoredValue(
    readRaw(
      keys.userSlug,
      ""
    )
  );
}

export function getStoredUserName() {
  const keys =
    getStorageKeys();

  return normalizeStoredValue(
    readRaw(
      keys.userName,
      ""
    )
  );
}

export function getStoredRole() {
  const keys =
    getStorageKeys();

  return normalizeStoredValue(
    readRaw(
      keys.role,
      ""
    )
  );
}

export function getStoredLastUsername() {
  const keys =
    getStorageKeys();

  return normalizeStoredValue(
    readRaw(
      keys.lastUsername,
      ""
    )
  );
}

/* =========================================================
   CLEAR
========================================================= */

export function clearAuthStorage(options = {}) {
  const {
    silent = true,
    includeLegacy = true,
  } = options;

  const keys =
    includeLegacy
      ? getAllAuthClearKeys()
      : getKnownAuthKeys();

  let removed = 0;

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
      route
      publicPath
      window.__ONION_INITIAL_URL__
      window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__
      window.__ONION_RESET_CONFIRM_INITIAL_URL__
  */

  if (!safeBool(silent, true)) {
    safeEmit(
      "auth:storage:cleared",
      {
        removed,
        keys,
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

  return {
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

    hasRefreshToken:
      hasRefreshToken(),

    hasTempToken:
      hasTempToken(),

    sessionId:
      getStoredSessionId() ||
      null,

    sessionUserId:
      getStoredSessionUserId() ||
      null,

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

    hasRefreshContext:
      hasRefreshContext(),

    hasCompleteRefreshContext:
      hasCompleteRefreshContext(),
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

  persistSessionContext,
  persistAuxSessionData,

  getStoredSessionId,
  getStoredSessionUserId,

  hasRefreshContext,
  hasCompleteRefreshContext,

  getStoredUserSlug,
  getStoredUserName,
  getStoredRole,
  getStoredLastUsername,

  clearAuthStorage,
  getAuthStorageSnapshot,
};
