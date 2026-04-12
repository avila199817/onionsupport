/* =========================================================
   Onion SPA - Auth Storage
   Archivo: src/features/auth/storage.js

   Responsabilidades:
   - centralizar storage auxiliar auth
   - leer refresh/temp/contexto sesión
   - persistir datos auxiliares usuario
   - persistir refresh context robusto
   - limpiar storage auth
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  normalizeTokenValue,
  normalizeSessionValue,
} from "./helpers.js";

import {
  AUTH_STORAGE_KEYS,
  AUTH_CONSTANTS,
} from "./constants.js";

/* =========================================================
   INTERNAL
========================================================= */
function getRaw(
  key,
  fallback = null
) {
  return AppCore.storage.getRaw(
    key,
    fallback
  );
}

function setRaw(
  key,
  value
) {
  AppCore.storage.setRaw(
    key,
    value
  );
}

function remove(
  key
) {
  AppCore.storage.remove(
    key
  );
}

/* =========================================================
   READ HELPERS
========================================================= */
export function getStoredRefreshToken() {
  return getRaw(
    AUTH_STORAGE_KEYS.refreshToken,
    null
  );
}

export function getStoredTempToken() {
  return getRaw(
    AUTH_STORAGE_KEYS.tempToken,
    null
  );
}

export function getStoredSessionId() {
  return getRaw(
    AUTH_STORAGE_KEYS.sessionId,
    null
  );
}

export function getStoredSessionUserId() {
  return getRaw(
    AUTH_STORAGE_KEYS.sessionUserId,
    null
  );
}

export function hasRefreshToken() {
  const token =
    getStoredRefreshToken();

  return Boolean(
    token &&
      String(token).trim()
  );
}

export function hasRefreshContext() {
  const sessionId = String(
    getStoredSessionId() ||
      ""
  ).trim();

  const userId = String(
    getStoredSessionUserId() ||
      ""
  ).trim();

  return Boolean(
    hasRefreshToken() &&
      sessionId &&
      userId
  );
}

/* =========================================================
   WRITE HELPERS
========================================================= */
export function persistAuxSessionData(
  normalizedUser = null
) {
  const slug =
    String(
      normalizedUser?.slug ||
        ""
    ).trim();

  const name =
    String(
      normalizedUser?.name ||
        ""
    ).trim();

  const role =
    String(
      normalizedUser?.role ||
        ""
    ).trim();

  if (slug) {
    setRaw(
      AUTH_STORAGE_KEYS.userSlug,
      slug
    );
  } else {
    remove(
      AUTH_STORAGE_KEYS.userSlug
    );
  }

  if (name) {
    setRaw(
      AUTH_STORAGE_KEYS.userName,
      name
    );
  } else {
    remove(
      AUTH_STORAGE_KEYS.userName
    );
  }

  if (role) {
    setRaw(
      AUTH_STORAGE_KEYS.role,
      role
    );
  } else {
    remove(
      AUTH_STORAGE_KEYS.role
    );
  }
}

export function persistRefreshToken(
  refreshToken = null
) {
  const normalized =
    normalizeTokenValue(
      refreshToken
    );

  if (normalized) {
    setRaw(
      AUTH_STORAGE_KEYS.refreshToken,
      normalized
    );
  } else {
    remove(
      AUTH_STORAGE_KEYS.refreshToken
    );
  }
}

export function persistTempToken(
  tempToken = null
) {
  const normalized =
    normalizeTokenValue(
      tempToken
    );

  if (normalized) {
    setRaw(
      AUTH_STORAGE_KEYS.tempToken,
      normalized
    );
  } else {
    remove(
      AUTH_STORAGE_KEYS.tempToken
    );
  }
}

export function persistSessionContext(
  sessionData = null,
  fallbackUser = null
) {
  const max =
    AUTH_CONSTANTS.sessionValueMaxLength;

  const sessionId =
    normalizeSessionValue(
      sessionData?.sessionId,
      max
    );

  const sessionUserId =
    normalizeSessionValue(
      sessionData?.userId ||
        fallbackUser?.userId ||
        fallbackUser?.id ||
        "",
      max
    );

  if (sessionId) {
    setRaw(
      AUTH_STORAGE_KEYS.sessionId,
      sessionId
    );
  } else {
    remove(
      AUTH_STORAGE_KEYS.sessionId
    );
  }

  if (sessionUserId) {
    setRaw(
      AUTH_STORAGE_KEYS.sessionUserId,
      sessionUserId
    );
  } else {
    remove(
      AUTH_STORAGE_KEYS.sessionUserId
    );
  }
}

/* =========================================================
   BULK
========================================================= */
export function clearAuthStorage() {
  [
    AUTH_STORAGE_KEYS.tempToken,
    AUTH_STORAGE_KEYS.refreshToken,
    AUTH_STORAGE_KEYS.userSlug,
    AUTH_STORAGE_KEYS.userName,
    AUTH_STORAGE_KEYS.role,
    AUTH_STORAGE_KEYS.sessionId,
    AUTH_STORAGE_KEYS.sessionUserId,
  ].forEach(remove);
}
