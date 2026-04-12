/* =========================================================
   Onion SPA - Auth Session
   Archivo: src/features/auth/session.js

   Responsabilidades:
   - aplicar sesión autenticada sobre AppCore
   - limpiar sesión local y storage auxiliar
   - exponer helpers auth de estado / rol
   - construir snapshots consistentes
   - exponer Authorization header
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
export function buildSessionSnapshot(
  extra = {}
) {
  return {
    authenticated:
      Boolean(
        AppCore.state
          .authenticated
      ),

    token:
      AppCore.state.token ||
      null,

    user:
      AppCore.state.user ||
      null,

    role:
      AppCore.state.role ||
      null,

    refreshToken:
      getStoredRefreshToken() ||
      null,

    sessionId:
      getStoredSessionId() ||
      null,

    sessionUserId:
      getStoredSessionUserId() ||
      null,

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
    user === undefined
      ? undefined
      : normalizeUser(
          user
        );

  /* token first */
  if (
    token !== undefined
  ) {
    AppCore.setToken(
      token || null
    );
  }

  /* user second */
  if (
    user !== undefined
  ) {
    AppCore.setUser(
      normalizedUser ||
        null
    );
  }

  /* storage auth */
  if (
    refreshToken !==
    undefined
  ) {
    persistRefreshToken(
      refreshToken ||
        null
    );
  }

  if (
    tempToken !==
    undefined
  ) {
    persistTempToken(
      tempToken ||
        null
    );
  }

  /* context */
  if (
    sessionData !==
    undefined
  ) {
    persistSessionContext(
      sessionData ||
        null,
      normalizedUser ||
        AppCore.state
          .user
    );
  }

  /* aux user data */
  persistAuxSessionData(
    normalizedUser ===
      undefined
      ? AppCore.state
          .user
      : normalizedUser
  );

  const snapshot =
    buildSessionSnapshot();

  AppCore.events.emit(
    "auth:session:applied",
    snapshot
  );

  return snapshot;
}

/* =========================================================
   CLEAR SESSION LOCAL
========================================================= */
export function clearSessionLocal(
  options = {}
) {
  const {
    silent = false,
  } = options;

  const hadSomething =
    Boolean(
      AppCore.state.token
    ) ||
    Boolean(
      AppCore.state.user
    ) ||
    Boolean(
      getStoredRefreshToken()
    ) ||
    Boolean(
      getStoredSessionId()
    ) ||
    Boolean(
      getStoredSessionUserId()
    );

  AppCore.clearSession();

  clearAuthStorage();

  if (
    !silent &&
    hadSomething
  ) {
    AppCore.events.emit(
      "auth:session:cleared",
      {
        authenticated:
          false,
        token: null,
        user: null,
        role: null,
        refreshToken:
          null,
        sessionId: null,
        sessionUserId:
          null,
      }
    );
  }
}

/* =========================================================
   AUTH HELPERS
========================================================= */
export function isAuthenticated() {
  return Boolean(
    AppCore.state
      .authenticated
  );
}

export function getCurrentRole() {
  return String(
    AppCore.state.role ||
      ""
  )
    .trim()
    .toLowerCase();
}

export function hasRole(
  ...roles
) {
  if (!roles.length)
    return true;

  const currentRole =
    getCurrentRole();

  if (!currentRole)
    return false;

  return roles
    .flat()
    .map((role) =>
      String(
        role || ""
      )
        .trim()
        .toLowerCase()
    )
    .filter(Boolean)
    .includes(
      currentRole
    );
}

export function requireRole(
  ...roles
) {
  return (
    isAuthenticated() &&
    hasRole(...roles)
  );
}

/* =========================================================
   AUTH HEADER
========================================================= */
export function getAuthHeader() {
  const token =
    String(
      AppCore.state.token ||
        ""
    ).trim();

  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

/* =========================================================
   DEBUG
========================================================= */
export function getSessionDebugSnapshot() {
  return {
    authenticated:
      Boolean(
        AppCore.state
          .authenticated
      ),

    role:
      AppCore.state.role ||
      null,

    username:
      AppCore.state.user
        ?.username ||
      null,

    hasToken:
      Boolean(
        AppCore.state.token
      ),

    refreshToken:
      getStoredRefreshToken() ||
      null,

    sessionId:
      getStoredSessionId() ||
      null,

    sessionUserId:
      getStoredSessionUserId() ||
      null,
  };
}

export function buildAuthErrorPayload(
  error
) {
  return {
    error,
    message:
      extractMessage(
        error
      ),
  };
}
