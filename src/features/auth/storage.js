/* =========================================================
   Onion SPA - Auth Storage
   Archivo: src/features/auth/storage.js

   Responsabilidades:
   - centralizar storage auxiliar de auth
   - leer refresh token / temp token / contexto de sesión
   - persistir datos auxiliares de usuario
   - persistir contexto de refresh robusto
   - limpiar storage local de auth
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  normalizeTokenValue,
  normalizeSessionValue,
} from "./helpers.js";

import { AUTH_STORAGE_KEYS, AUTH_CONSTANTS } from "./constants.js";

/* =========================================================
   READ HELPERS
========================================================= */
export function getStoredRefreshToken() {
  return AppCore.storage.getRaw(AUTH_STORAGE_KEYS.refreshToken, null);
}

export function getStoredTempToken() {
  return AppCore.storage.getRaw(AUTH_STORAGE_KEYS.tempToken, null);
}

export function getStoredSessionId() {
  return AppCore.storage.getRaw(AUTH_STORAGE_KEYS.sessionId, null);
}

export function getStoredSessionUserId() {
  return AppCore.storage.getRaw(AUTH_STORAGE_KEYS.sessionUserId, null);
}

export function hasRefreshToken() {
  const refreshToken = getStoredRefreshToken();
  return Boolean(refreshToken && String(refreshToken).trim());
}

export function hasRefreshContext() {
  return Boolean(
    hasRefreshToken() &&
      String(getStoredSessionId() || "").trim() &&
      String(getStoredSessionUserId() || "").trim()
  );
}

/* =========================================================
   WRITE HELPERS
========================================================= */
export function persistAuxSessionData(normalizedUser = null) {
  if (normalizedUser?.slug) {
    AppCore.storage.setRaw(AUTH_STORAGE_KEYS.userSlug, normalizedUser.slug);
  } else {
    AppCore.storage.remove(AUTH_STORAGE_KEYS.userSlug);
  }

  if (normalizedUser?.name) {
    AppCore.storage.setRaw(AUTH_STORAGE_KEYS.userName, normalizedUser.name);
  } else {
    AppCore.storage.remove(AUTH_STORAGE_KEYS.userName);
  }

  if (normalizedUser?.role) {
    AppCore.storage.setRaw(AUTH_STORAGE_KEYS.role, normalizedUser.role);
  } else {
    AppCore.storage.remove(AUTH_STORAGE_KEYS.role);
  }
}

export function persistRefreshToken(refreshToken = null) {
  const normalized = normalizeTokenValue(refreshToken);

  if (normalized) {
    AppCore.storage.setRaw(AUTH_STORAGE_KEYS.refreshToken, normalized);
  } else {
    AppCore.storage.remove(AUTH_STORAGE_KEYS.refreshToken);
  }
}

export function persistTempToken(tempToken = null) {
  const normalized = normalizeTokenValue(tempToken);

  if (normalized) {
    AppCore.storage.setRaw(AUTH_STORAGE_KEYS.tempToken, normalized);
  } else {
    AppCore.storage.remove(AUTH_STORAGE_KEYS.tempToken);
  }
}

export function persistSessionContext(sessionData = null, fallbackUser = null) {
  const sessionId = normalizeSessionValue(
    sessionData?.sessionId,
    AUTH_CONSTANTS.sessionValueMaxLength
  );

  const sessionUserId = normalizeSessionValue(
    sessionData?.userId ||
      fallbackUser?.userId ||
      fallbackUser?.id ||
      "",
    AUTH_CONSTANTS.sessionValueMaxLength
  );

  if (sessionId) {
    AppCore.storage.setRaw(AUTH_STORAGE_KEYS.sessionId, sessionId);
  } else {
    AppCore.storage.remove(AUTH_STORAGE_KEYS.sessionId);
  }

  if (sessionUserId) {
    AppCore.storage.setRaw(AUTH_STORAGE_KEYS.sessionUserId, sessionUserId);
  } else {
    AppCore.storage.remove(AUTH_STORAGE_KEYS.sessionUserId);
  }
}

/* =========================================================
   BULK HELPERS
========================================================= */
export function clearAuthStorage() {
  AppCore.storage.remove(AUTH_STORAGE_KEYS.tempToken);
  AppCore.storage.remove(AUTH_STORAGE_KEYS.refreshToken);
  AppCore.storage.remove(AUTH_STORAGE_KEYS.userSlug);
  AppCore.storage.remove(AUTH_STORAGE_KEYS.userName);
  AppCore.storage.remove(AUTH_STORAGE_KEYS.role);
  AppCore.storage.remove(AUTH_STORAGE_KEYS.sessionId);
  AppCore.storage.remove(AUTH_STORAGE_KEYS.sessionUserId);
}
