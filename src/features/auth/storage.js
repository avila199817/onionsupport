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
   - compatibilidad AppCore.storage / localStorage
   - lectura legacy prefijada y no prefijada
   - limpieza limitada a AUTH_STORAGE_KEYS
   - normalización estricta de valores de sesión
   - hasRefreshContext robusto
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

/* =========================================================
   STORAGE ADAPTER
========================================================= */

function getStorageApi() {
  try {
    const storage =
      AppCore?.storage || null;

    if (
      storage &&
      typeof storage.get === "function"
    ) {
      return storage;
    }
  } catch {}

  return null;
}

function canUseLocalStorage() {
  if (!isBrowser()) {
    return false;
  }

  try {
    const key =
      "__onion_storage_probe__";

    window.localStorage.setItem(
      key,
      "1"
    );

    window.localStorage.removeItem(
      key
    );

    return true;
  } catch {
    return false;
  }
}

function getLocalStorage() {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/* =========================================================
   RAW READ / WRITE / REMOVE
========================================================= */

function readFromAppStorage(
  key,
  fallback = ""
) {
  const storage =
    getStorageApi();

  if (!storage) {
    return fallback;
  }

  const candidates = [
    key,
    buildKey(key),
  ].filter(Boolean);

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

  if (!storage) {
    return false;
  }

  const finalValue =
    safeText(value, "");

  try {
    storage.set(
      key,
      finalValue
    );

    return true;
  } catch (error) {
    safeWarn(
      "AppCore.storage.set() falló.",
      {
        key,
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

  const candidates = [
    key,
    buildKey(key),
  ].filter(Boolean);

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
      }
    } catch {}
  }

  return removed;
}

function readFromLocalStorage(
  key,
  fallback = ""
) {
  const storage =
    getLocalStorage();

  if (!storage) {
    return fallback;
  }

  const candidates = [
    buildKey(key),
    key,
  ].filter(Boolean);

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

function writeToLocalStorage(
  key,
  value
) {
  const storage =
    getLocalStorage();

  if (!storage) {
    return false;
  }

  const finalKey =
    buildKey(key);

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
      "localStorage.setItem() falló.",
      {
        key: finalKey,
        error,
      }
    );

    return false;
  }
}

function removeFromLocalStorage(key) {
  const storage =
    getLocalStorage();

  if (!storage) {
    return false;
  }

  const candidates = [
    buildKey(key),
    key,
  ].filter(Boolean);

  let removed = false;

  for (const candidate of candidates) {
    try {
      storage.removeItem(candidate);
      removed = true;
    } catch {}
  }

  return removed;
}

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
    readFromLocalStorage(
      cleanKey,
      ""
    );

  if (fromLocalStorage) {
    return fromLocalStorage;
  }

  return fallback;
}

function writeRaw(
  key,
  value
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

  const appOk =
    writeToAppStorage(
      cleanKey,
      finalValue
    );

  const localOk =
    appOk
      ? true
      : writeToLocalStorage(
          cleanKey,
          finalValue
        );

  safeEmit(
    "auth:storage:write",
    {
      key: cleanKey,
      ok:
        Boolean(appOk || localOk),
      target:
        appOk
          ? "app-storage"
          : localOk
            ? "local-storage"
            : "none",
    }
  );

  return Boolean(
    appOk || localOk
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
    removeFromLocalStorage(cleanKey);

  safeEmit(
    "auth:storage:remove",
    {
      key: cleanKey,
      ok:
        Boolean(appOk || localOk),
    }
  );

  return Boolean(
    appOk || localOk
  );
}

function writeNullable(
  key,
  value
) {
  const finalValue =
    safeText(value, "");

  if (!finalValue) {
    removeRaw(key);
    return false;
  }

  return writeRaw(
    key,
    finalValue
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
      2048
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
        raw.sid ??
        raw.id ??
        ""
    );

  const userId =
    normalizeStoredValue(
      raw.userId ??
        raw.uid ??
        raw.sessionUserId ??
        user?.userId ??
        user?.id ??
        user?.user_id ??
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
    normalizeStoredToken(token)
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

  return writeNullable(
    keys.tempToken,
    normalizeStoredToken(token)
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
        user?.id ??
        user?.user_id ??
        ""
    );

  if (userId) {
    writeRaw(
      keys.sessionUserId,
      userId
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
  } = options;

  const keys =
    getAllowedAuthKeys();

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

    hasAppStorage:
      Boolean(
        getStorageApi()
      ),

    hasLocalStorage:
      Boolean(
        getLocalStorage()
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
