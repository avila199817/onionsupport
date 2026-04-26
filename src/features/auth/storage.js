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
   - no hacer localStorage.clear()

   HARDENING EXTREMO:
   - browser guard total
   - compatibilidad AppCore.storage / localStorage / sessionStorage
   - lectura legacy prefijada y no prefijada
   - limpieza limitada a claves auth conocidas
   - normalización estricta de valores de sesión
   - hasRefreshContext robusto
   - limpieza legacy completa de restos de login fallido

   FIX 10/10:
   - clearAuthStorage elimina refresh/temp/session context
   - clearAuthStorage elimina tokens legacy no namespaced
   - clearAuthStorage elimina tokens legacy namespaced
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

function safeText(
  value,
  fallback = ""
) {
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

function safeBool(value) {
  return value === true;
}

function safeNumber(
  value,
  fallback = 0
) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
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

function safeEmit(
  eventName,
  payload = {}
) {
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

function getStorageKeys() {
  return {
    refreshToken:
      safeText(
        AUTH_STORAGE_KEYS?.refreshToken,
        "auth.refreshToken"
      ),

    tempToken:
      safeText(
        AUTH_STORAGE_KEYS?.tempToken,
        "auth.tempToken"
      ),

    sessionId:
      safeText(
        AUTH_STORAGE_KEYS?.sessionId,
        "auth.sessionId"
      ),

    sessionUserId:
      safeText(
        AUTH_STORAGE_KEYS?.sessionUserId,
        "auth.sessionUserId"
      ),
  };
}

function getAllowedAuthKeys() {
  const keys =
    getStorageKeys();

  return [
    keys.refreshToken,
    keys.tempToken,
    keys.sessionId,
    keys.sessionUserId,
  ].filter(Boolean);
}

function getLegacyAuthKeys() {
  return [
    "onion_token",
    "onion_access_token",
    "onion_refresh_token",
    "onion_temp_token",
    "onion_session_id",
    "onion_session_user_id",
    "onion_user_id",
    "onion_user_name",
    "onion_role",

    "auth_token",
    "access_token",
    "refresh_token",
    "temp_token",
    "token",
    "session",
    "user",
    "role",

    "auth.token",
    "auth.accessToken",
    "auth.refreshToken",
    "auth.tempToken",
    "auth.sessionId",
    "auth.sessionUserId",

    "session.token",
    "session.accessToken",
    "session.refreshToken",
    "session.user",
  ];
}

function getAllAuthClearKeys() {
  return Array.from(
    new Set([
      ...getAllowedAuthKeys(),
      ...getLegacyAuthKeys(),
    ].filter(Boolean))
  );
}

/* =========================================================
   STORAGE ADAPTER
========================================================= */

function getStorageApi() {
  try {
    const storage =
      AppCore?.storage || null;

    if (
      storage &&
      (
        typeof storage.get === "function" ||
        typeof storage.set === "function" ||
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

    storage.setItem(
      key,
      "1"
    );

    storage.removeItem(
      key
    );

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

  const prefixed =
    buildKey(cleanKey);

  return Array.from(
    new Set([
      cleanKey,
      prefixed,

      /*
        Compatibilidad con claves antiguas donde se usaban
        separadores alternativos.
      */
      cleanKey.replace(/\./g, ":"),
      cleanKey.replace(/:/g, "."),

      prefixed
        ? prefixed.replace(/\./g, ":")
        : "",

      prefixed
        ? prefixed.replace(/:/g, ".")
        : "",
    ].filter(Boolean))
  );
}

/* =========================================================
   RAW READ / WRITE / REMOVE - APPCORE
========================================================= */

function readFromAppStorage(
  key,
  fallback = ""
) {
  const storage =
    getStorageApi();

  if (!storage || typeof storage.get !== "function") {
    return fallback;
  }

  const candidates =
    getKeyCandidates(key);

  for (const candidate of candidates) {
    try {
      const value =
        storage.get(candidate);

      const text =
        safeText(value, "");

      if (text) {
        return text;
      }
    } catch {}
  }

  return fallback;
}

function writeToAppStorage(
  key,
  value
) {
  const storage =
    getStorageApi();

  if (!storage || typeof storage.set !== "function") {
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
    /*
      Escribimos la clave lógica, no sólo la prefijada.
      AppCore.storage normalmente ya aplica namespace interno.
    */
    storage.set(
      cleanKey,
      finalValue
    );

    return true;
  } catch (error) {
    safeWarn(
      "AppCore.storage.set() falló.",
      {
        key: cleanKey,
        error,
      }
    );

    return false;
  }
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
      if (
        typeof storage.remove === "function"
      ) {
        storage.remove(candidate);
        removed = true;
      } else if (
        typeof storage.delete === "function"
      ) {
        storage.delete(candidate);
        removed = true;
      } else if (
        typeof storage.set === "function"
      ) {
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

function readFromWebStorage(
  storage,
  key,
  fallback = ""
) {
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
        safeText(value, "");

      if (text) {
        return text;
      }
    } catch {}
  }

  return fallback;
}

function writeToWebStorage(
  storage,
  key,
  value
) {
  if (!storage) {
    return false;
  }

  const cleanKey =
    safeText(key, "");

  const finalKey =
    buildKey(cleanKey);

  if (!finalKey) {
    return false;
  }

  try {
    storage.setItem(
      finalKey,
      safeText(value, "")
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

function removeFromWebStorage(
  storage,
  key
) {
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

function readRaw(
  key,
  fallback = ""
) {
  const cleanKey =
    safeText(key, "");

  if (!cleanKey) {
    return fallback;
  }

  const fromAppStorage =
    readFromAppStorage(
      cleanKey,
      ""
    );

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

function writeRaw(
  key,
  value,
  options = {}
) {
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
  } = options;

  const appOk =
    !sessionOnly
      ? writeToAppStorage(
          cleanKey,
          finalValue
        )
      : false;

  const localOk =
    !sessionOnly
      ? writeToWebStorage(
          getLocalStorage(),
          cleanKey,
          finalValue
        )
      : false;

  const sessionOk =
    !localOnly
      ? writeToWebStorage(
          getSessionStorage(),
          cleanKey,
          finalValue
        )
      : false;

  safeEmit(
    "auth:storage:write",
    {
      key: cleanKey,
      ok:
        Boolean(appOk || localOk || sessionOk),
      targets: {
        appStorage: Boolean(appOk),
        localStorage: Boolean(localOk),
        sessionStorage: Boolean(sessionOk),
      },
    }
  );

  return Boolean(
    appOk || localOk || sessionOk
  );
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

  safeEmit(
    "auth:storage:remove",
    {
      key: cleanKey,
      ok:
        Boolean(appOk || localOk || sessionOk),
      targets: {
        appStorage: Boolean(appOk),
        localStorage: Boolean(localOk),
        sessionStorage: Boolean(sessionOk),
      },
    }
  );

  return Boolean(
    appOk || localOk || sessionOk
  );
}

function writeNullable(
  key,
  value,
  options = {}
) {
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
   NORMALIZATION
========================================================= */

function normalizeStoredValue(value = "") {
  return normalizeSessionValue(
    value,
    getMaxLen()
  );
}

function normalizeStoredToken(value = "") {
  return normalizeSessionValue(
    value,
    Math.max(
      getMaxLen(),
      4096
    )
  );
}

function normalizeSessionData(
  sessionData = null,
  user = null
) {
  const raw =
    sessionData &&
    typeof sessionData === "object"
      ? sessionData
      : {};

  const sessionId =
    normalizeStoredValue(
      raw.sessionId ??
        raw.session_id ??
        raw.sid ??
        raw.id ??
        ""
    );

  const userId =
    normalizeStoredValue(
      raw.userId ??
        raw.user_id ??
        raw.uid ??
        raw.sessionUserId ??
        raw.session_user_id ??
        user?.userId ??
        user?.user_id ??
        user?.id ??
        user?._id ??
        user?.uid ??
        user?.email ??
        user?.username ??
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
   TOKENS
========================================================= */

export function persistRefreshToken(
  token = null
) {
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

export function persistTempToken(
  token = null
) {
  const keys =
    getStorageKeys();

  /*
    Temp token puede vivir en sessionStorage también.
    Lo escribimos en ambos para compatibilidad, pero clearAuthStorage
    lo elimina siempre.
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

export function persistSessionContext(
  sessionData = null,
  user = null
) {
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

export function persistAuxSessionData(
  user = null
) {
  const keys =
    getStorageKeys();

  const userId =
    normalizeStoredValue(
      user?.userId ??
        user?.user_id ??
        user?.id ??
        user?._id ??
        user?.uid ??
        user?.email ??
        user?.username ??
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

export function hasRefreshContext() {
  const refreshToken =
    getStoredRefreshToken();

  const sessionId =
    getStoredSessionId();

  const sessionUserId =
    getStoredSessionUserId();

  return Boolean(
    refreshToken &&
      sessionId &&
      sessionUserId
  );
}

/* =========================================================
   CLEAR
========================================================= */

export function clearAuthStorage(
  options = {}
) {
  const {
    silent = true,
    includeLegacy = true,
  } = options;

  const keys =
    includeLegacy
      ? getAllAuthClearKeys()
      : getAllowedAuthKeys();

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

    Y no tocamos:
      lang
      theme
      route
      publicPath
      __ONION_INITIAL_URL__
      __ONION_ACTIVATE_ACCOUNT_INITIAL_URL__
  */

  if (!safeBool(silent)) {
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

    hasRefreshContext:
      hasRefreshContext(),
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

  clearAuthStorage,
  getAuthStorageSnapshot,
};
