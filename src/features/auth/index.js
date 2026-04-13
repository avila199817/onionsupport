/* =========================================================
   Onion SPA - Auth / Session
   Archivo: src/features/auth/index.js

   Responsabilidades:
   - punto de entrada del módulo auth
   - composición de login / logout / restore / guards
   - exponer helpers auth para toda la SPA
   - serializar restore / refresh / me
   - mantener compatibilidad con backend heterogéneo
   - exponer aliases públicos estables para auth flows
   - preparar el módulo para reset-password / forgot-password
========================================================= */

import {
  AUTH_ENDPOINTS,
  AUTH_STORAGE_KEYS,
  AUTH_CONSTANTS,
} from "./constants.js";

import {
  isAuthRoute,
} from "./helpers.js";

import {
  normalizeUser,
} from "./normalize.js";

import {
  getStoredRefreshToken,
  getStoredTempToken,
  getStoredSessionId,
  getStoredSessionUserId,
  hasRefreshToken,
  hasRefreshContext,
} from "./storage.js";

import {
  buildSessionSnapshot,
  applySession,
  clearSessionLocal,
  isAuthenticated,
  getCurrentRole,
  hasRole,
  requireRole,
  getAuthHeader,
  getSessionDebugSnapshot,
} from "./session.js";

import {
  resolveLoginIdentifier,
  normalizeLoginPayload,
  buildLoginRequestBody,
  buildLoginRedirectPath,
  getPostLoginTarget,
  login,
  handleLoginFormSubmit,
} from "./login.js";

import {
  fetchMe,
  refreshSession,
  restoreSession,
} from "./restore.js";

import {
  logout,
} from "./logout.js";

import {
  guardAuthenticated,
  guardRole,
} from "./guards.js";

/* =========================================================
   INTERNAL HELPERS
========================================================= */

function createNotImplementedError(methodName = "authMethod") {
  return new Error(
    `[Auth] ${methodName} no está implementado todavía. ` +
    `Conecta el flujo real en src/features/auth/password-reset.js ` +
    `o expón el método desde AppCore.services.auth.`
  );
}

function resolveExternalResetExecutor() {
  const candidates = [
    globalThis?.AppCore?.services?.auth?.requestPasswordReset,
    globalThis?.AppCore?.services?.auth?.resetPasswordRequest,
    globalThis?.AppCore?.services?.auth?.forgotPassword,
    globalThis?.AppCore?.auth?.requestPasswordReset,
    globalThis?.AppCore?.auth?.resetPasswordRequest,
    globalThis?.AppCore?.auth?.forgotPassword,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "function") {
      return candidate;
    }
  }

  return null;
}

async function requestPasswordReset(payload = {}) {
  const externalExecutor = resolveExternalResetExecutor();

  if (typeof externalExecutor === "function") {
    return externalExecutor(payload);
  }

  throw createNotImplementedError("requestPasswordReset");
}

async function resetPasswordRequest(payload = {}) {
  return requestPasswordReset(payload);
}

async function forgotPassword(payload = {}) {
  return requestPasswordReset(payload);
}

/* =========================================================
   AUTH MODULE
========================================================= */

export const Auth = (() => {
  "use strict";

  /* =========================================================
     INTERNAL SESSION STATE
  ========================================================= */
  const session = {
    restoring: false,
    checking: false,
    refreshing: false,

    lastCheckAt: null,
    lastRefreshAt: null,

    refreshPromise: null,
    mePromise: null,
    restorePromise: null,

    refreshFailCount: 0,
    refreshBlockedUntil: 0,
  };

  /* =========================================================
     WRAPPERS SERIALIZADOS
  ========================================================= */
  function runFetchMe() {
    return fetchMe(session);
  }

  function runRefreshSession() {
    return refreshSession(session);
  }

  function runRestoreSession() {
    return restoreSession(session);
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */
  return {
    AUTH_ENDPOINTS,
    AUTH_STORAGE_KEYS,
    AUTH_CONSTANTS,

    session,

    /* auth actions */
    login,
    logout,
    handleLoginFormSubmit,

    /*
      reset password / forgot password
      - requestPasswordReset: nombre principal recomendado
      - resetPasswordRequest: alias legacy / semántico
      - forgotPassword: alias común de backend heterogéneo
    */
    requestPasswordReset,
    resetPasswordRequest,
    forgotPassword,

    /* session recovery */
    fetchMe: runFetchMe,
    refreshSession: runRefreshSession,
    restoreSession: runRestoreSession,

    /* auth state */
    isAuthenticated,
    isAuthRoute,

    /* roles / guards */
    hasRole,
    requireRole,
    guardAuthenticated,
    guardRole,
    getCurrentRole,

    /* headers */
    getAuthHeader,

    /* session local */
    clearSessionLocal,
    applySession,
    buildSessionSnapshot,
    getSessionDebugSnapshot,

    /* normalize */
    normalizeUser,

    /* login helpers */
    resolveLoginIdentifier,
    normalizeLoginPayload,
    buildLoginRequestBody,
    buildLoginRedirectPath,
    getPostLoginTarget,

    /* storage helpers */
    hasRefreshToken,
    hasRefreshContext,
    getStoredRefreshToken,
    getStoredTempToken,
    getStoredSessionId,
    getStoredSessionUserId,
  };
})();
