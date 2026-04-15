/* =========================================================
   Onion SPA - Auth Storage
   Archivo: src/features/auth/storage.js

   Responsabilidades:
   - centralizar storage auth
   - persistir token temporal / refresh
   - persistir contexto de sesión
   - leer claves de forma segura
   - limpiar storage auth
   - namespacing consistente con AppCore
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
   HELPERS
========================================================= */

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

function getPrefix() {
  return safeText(
    AppCore?.config
      ?.storagePrefix,
    "onion"
  );
}

function buildKey(
  key = ""
) {
  return `${getPrefix()}:${safeText(
    key,
    ""
  )}`;
}

function getStorageApi() {
  try {
    if (
      AppCore?.storage &&
      typeof AppCore
        .storage.get ===
        "function"
    ) {
      return AppCore.storage;
    }
  } catch {}

  return null;
}

function readRaw(
  key,
  fallback = ""
) {
  try {
    const storage =
      getStorageApi();

    if (storage) {
      return safeText(
        storage.get(key),
        fallback
      );
    }

    return safeText(
      window.localStorage.getItem(
        buildKey(key)
      ),
      fallback
    );
  } catch {
    return fallback;
  }
}

function writeRaw(
  key,
  value
) {
  try {
    const storage =
      getStorageApi();

    const finalValue =
      safeText(value, "");

    if (storage) {
      storage.set(
        key,
        finalValue
      );

      return true;
    }

    window.localStorage.setItem(
      buildKey(key),
      finalValue
    );

    return true;
  } catch {
    return false;
  }
}

function removeRaw(
  key
) {
  try {
    const storage =
      getStorageApi();

    if (storage) {
      storage.remove(key);
      return true;
    }

    window.localStorage.removeItem(
      buildKey(key)
    );

    return true;
  } catch {
    return false;
  }
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

  writeRaw(
    key,
    finalValue
  );

  return true;
}

function maxLen() {
  return Number(
    AUTH_CONSTANTS
      ?.sessionValueMaxLength ??
      200
  ) || 200;
}

/* =========================================================
   TOKENS
========================================================= */

export function persistRefreshToken(
  token = null
) {
  return writeNullable(
    AUTH_STORAGE_KEYS.refreshToken,
    token
  );
}

export function getStoredRefreshToken() {
  return readRaw(
    AUTH_STORAGE_KEYS.refreshToken,
    ""
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
  return writeNullable(
    AUTH_STORAGE_KEYS.tempToken,
    token
  );
}

export function getStoredTempToken() {
  return readRaw(
    AUTH_STORAGE_KEYS.tempToken,
    ""
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
  const sessionId =
    normalizeSessionValue(
      sessionData
        ?.sessionId,
      maxLen()
    );

  const userId =
    normalizeSessionValue(
      sessionData
        ?.userId ??
        user?.userId ??
        user?.id,
      maxLen()
    );

  writeNullable(
    AUTH_STORAGE_KEYS.sessionId,
    sessionId
  );

  writeNullable(
    AUTH_STORAGE_KEYS.sessionUserId,
    userId
  );

  return {
    sessionId:
      sessionId ||
      null,

    userId:
      userId ||
      null,
  };
}

export function persistAuxSessionData(
  user = null
) {
  const userId =
    normalizeSessionValue(
      user?.userId ??
        user?.id,
      maxLen()
    );

  if (userId) {
    writeRaw(
      AUTH_STORAGE_KEYS.sessionUserId,
      userId
    );
  }

  return true;
}

export function getStoredSessionId() {
  return readRaw(
    AUTH_STORAGE_KEYS.sessionId,
    ""
  );
}

export function getStoredSessionUserId() {
  return readRaw(
    AUTH_STORAGE_KEYS.sessionUserId,
    ""
  );
}

export function hasRefreshContext() {
  return Boolean(
    getStoredRefreshToken() &&
      getStoredSessionId() &&
      getStoredSessionUserId()
  );
}

/* =========================================================
   CLEAR
========================================================= */

export function clearAuthStorage() {
  removeRaw(
    AUTH_STORAGE_KEYS.refreshToken
  );

  removeRaw(
    AUTH_STORAGE_KEYS.tempToken
  );

  removeRaw(
    AUTH_STORAGE_KEYS.sessionId
  );

  removeRaw(
    AUTH_STORAGE_KEYS.sessionUserId
  );

  return true;
}

/* =========================================================
   DEBUG
========================================================= */

export function getAuthStorageSnapshot() {
  return {
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
