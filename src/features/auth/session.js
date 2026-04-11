/* =========================================================
   Onion SPA - Auth Session
   Archivo: src/features/auth/session.js

   Responsabilidades:
   - aplicar sesión autenticada sobre AppCore
   - limpiar sesión local y storage auxiliar
   - exponer helpers auth de estado / rol
   - construir snapshots consistentes de sesión
   - exponer header Authorization
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  extractMessage,
} from "./helpers.js";

import {
  normalizeUser,
} from "./normalize.js";

import {
  getStoredRefreshToken,
  getStoredSessionId,
  getStoredSessionUserId,
  persistAuxSessionData,
  persistRefreshToken,
  persistTempToken,
  persistSessionContext,
  clearAuthStorage,
} from "./storage.js";

/* =========================================================
   SNAPSHOT
========================================================= */
export function buildSessionSnapshot(extra = {}) {
  return {
    authenticated: Boolean(AppCore.state.authenticated),
    token: AppCore.state.token,
    user: AppCore.state.user,
    role: AppCore.state.role,
    refreshToken: getStoredRefreshToken(),
    sessionId: getStoredSessionId(),
    sessionUserId: getStoredSessionUserId(),
    ...extra,
  };
}

/* =========================================================
   APPLY SESSION
========================================================= */
export function applySession({
  token = undefined,
  user = undefined,
  refreshToken = undefined,
  tempToken = undefined,
  sessionData = undefined,
} = {}) {
  const normalizedUser =
    user === undefined ? undefined : normalizeUser(user);

  if (token !== undefined) {
    AppCore.setToken(token || null);
  }

  if (user !== undefined) {
    AppCore.setUser(normalizedUser || null);
  }

  if (refreshToken !== undefined) {
    persistRefreshToken(refreshToken || null);
  }

  if (tempToken !== undefined) {
    persistTempToken(tempToken || null);
  }

  if (sessionData !== undefined) {
    persistSessionContext(
      sessionData || null,
      normalizedUser || AppCore.state.user
    );
  }

  persistAuxSessionData(
    normalizedUser === undefined ? AppCore.state.user : normalizedUser
  );

  const snapshot = buildSessionSnapshot();

  AppCore.events.emit("auth:session:applied", snapshot);

  return snapshot;
}

/* =========================================================
   CLEAR SESSION LOCAL
========================================================= */
export function clearSessionLocal(options = {}) {
  const { silent = false } = options;

  const hadSomething =
    Boolean(AppCore.state.token) ||
    Boolean(AppCore.state.user) ||
    Boolean(getStoredRefreshToken()) ||
    Boolean(getStoredSessionId()) ||
    Boolean(getStoredSessionUserId());

  AppCore.clearSession();
  clearAuthStorage();

  if (!silent && hadSomething) {
    AppCore.events.emit("auth:session:cleared", {
      authenticated: false,
      token: null,
      user: null,
      role: null,
      refreshToken: null,
      sessionId: null,
      sessionUserId: null,
    });
  }
}

/* =========================================================
   AUTH / ROLE HELPERS
========================================================= */
export function isAuthenticated() {
  return Boolean(AppCore.state.authenticated);
}

export function getCurrentRole() {
  return String(AppCore.state.role || "").trim().toLowerCase();
}

export function hasRole(...roles) {
  if (!roles.length) return true;

  const currentRole = getCurrentRole();
  if (!currentRole) return false;

  return roles
    .flat()
    .map((role) => String(role || "").trim().toLowerCase())
    .filter(Boolean)
    .includes(currentRole);
}

export function requireRole(...roles) {
  return isAuthenticated() && hasRole(...roles);
}

export function getAuthHeader() {
  if (!AppCore.state.token || !String(AppCore.state.token).trim()) {
    return {};
  }

  return {
    Authorization: `Bearer ${AppCore.state.token}`,
  };
}

/* =========================================================
   DEBUG / MESSAGE
========================================================= */
export function getSessionDebugSnapshot() {
  return {
    authenticated: Boolean(AppCore.state.authenticated),
    role: AppCore.state.role || null,
    username: AppCore.state.user?.username || null,
    hasToken: Boolean(AppCore.state.token),
    refreshToken: getStoredRefreshToken(),
    sessionId: getStoredSessionId(),
    sessionUserId: getStoredSessionUserId(),
  };
}

export function buildAuthErrorPayload(error) {
  return {
    error,
    message: extractMessage(error),
  };
}
