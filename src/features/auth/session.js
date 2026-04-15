/* =========================================================
   Onion SPA - Auth Session
   Archivo: src/features/auth/session.js

   Responsabilidades:
   - aplicar sesión autenticada sobre AppCore
   - limpiar sesión local y storage auxiliar
   - exponer helpers auth de estado / rol
   - construir snapshots consistentes
   - exponer Authorization header
   - endurecer sync con AppCore.state
   - evitar estados auth fantasma

   HARDENING PRO:
   - estado derivado robusto
   - persistencia ordenada
   - sync UI seguro
   - helpers enterprise
   - cero estados partidos
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
   BASICS
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

function safeBool(value) {
  return value === true;
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

function ensureCoreState() {
  if (
    !AppCore.state ||
    typeof AppCore.state !==
      "object"
  ) {
    AppCore.state = {};
  }

  return AppCore.state;
}

function resolveRoleFromUser(
  user = null
) {
  return safeText(
    user?.role ??
      user?.rol ??
      "",
    ""
  ).toLowerCase();
}

function syncDerivedState() {
  const state =
    ensureCoreState();

  const hasToken =
    Boolean(
      safeText(
        state.token,
        ""
      )
    );

  state.authenticated =
    hasToken;

  state.role =
    hasToken
      ? resolveRoleFromUser(
          state.user
        )
      : "";

  return state;
}

function safeSyncUserUI() {
  try {
    AppCore?.syncUserUI?.();
  } catch {}
}

function safeSetToken(
  token = null
) {
  if (
    typeof AppCore?.setToken ===
    "function"
  ) {
    AppCore.setToken(
      token || null
    );
    return;
  }

  const state =
    ensureCoreState();

  state.token =
    token || null;

  syncDerivedState();
}

function safeSetUser(
  user = null
) {
  if (
    typeof AppCore?.setUser ===
    "function"
  ) {
    AppCore.setUser(
      user || null
    );
    return;
  }

  const state =
    ensureCoreState();

  state.user =
    user || null;

  syncDerivedState();
}

function safeClearSession() {
  if (
    typeof AppCore?.clearSession ===
    "function"
  ) {
    AppCore.clearSession();
    return;
  }

  const state =
    ensureCoreState();

  state.token = null;
  state.user = null;
  state.role = "";
  state.authenticated = false;
}

function getCurrentStateSnapshotBase() {
  const state =
    ensureCoreState();

  syncDerivedState();

  return {
    authenticated:
      Boolean(
        state.authenticated
      ),

    token:
      state.token || null,

    user:
      state.user || null,

    role:
      state.role || null,
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function buildSessionSnapshot(
  extra = {}
) {
  const base =
    getCurrentStateSnapshotBase();

  return {
    ...base,

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
      : normalizeUser(user);

  /* TOKEN FIRST */
  if (
    token !== undefined
  ) {
    safeSetToken(
      token || null
    );
  }

  /* USER SECOND */
  if (
    user !== undefined
  ) {
    safeSetUser(
      normalizedUser ||
        null
    );
  }

  /* TOKENS AUX */
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
    tempToken !== undefined
  ) {
    persistTempToken(
      tempToken || null
    );
  }

  /* CONTEXT */
  if (
    sessionData !==
    undefined
  ) {
    persistSessionContext(
      sessionData || null,
      normalizedUser ===
        undefined
        ? AppCore?.state
            ?.user || null
        : normalizedUser
    );
  }

  /* AUX USER CACHE */
  persistAuxSessionData(
    normalizedUser ===
      undefined
      ? AppCore?.state
          ?.user || null
      : normalizedUser
  );

  syncDerivedState();

  safeSyncUserUI();

  const snapshot =
    buildSessionSnapshot();

  safeEmit(
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

  const before =
    buildSessionSnapshot();

  const hadSomething =
    Boolean(before.token) ||
    Boolean(before.user) ||
    Boolean(
      before.refreshToken
    ) ||
    Boolean(
      before.sessionId
    ) ||
    Boolean(
      before.sessionUserId
    );

  safeClearSession();

  clearAuthStorage();

  syncDerivedState();

  safeSyncUserUI();

  if (
    !safeBool(silent) &&
    hadSomething
  ) {
    safeEmit(
      "auth:session:cleared",
      {
        authenticated:
          false,
        token: null,
        user: null,
        role: null,
        refreshToken: null,
        sessionId: null,
        sessionUserId: null,
      }
    );
  }

  return true;
}

/* =========================================================
   AUTH HELPERS
========================================================= */

export function isAuthenticated() {
  const state =
    ensureCoreState();

  syncDerivedState();

  return Boolean(
    state.authenticated &&
      state.token
  );
}

export function getCurrentRole() {
  const state =
    ensureCoreState();

  syncDerivedState();

  return safeText(
    state.role,
    ""
  ).toLowerCase();
}

export function hasRole(
  ...roles
) {
  if (!roles.length) {
    return true;
  }

  const currentRole =
    getCurrentRole();

  if (!currentRole) {
    return false;
  }

  return roles
    .flat()
    .map((role) =>
      safeText(
        role,
        ""
      ).toLowerCase()
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
    safeText(
      AppCore?.state?.token,
      ""
    );

  if (!token) {
    return {};
  }

  return {
    Authorization:
      `Bearer ${token}`,
  };
}

/* =========================================================
   DEBUG
========================================================= */

export function getSessionDebugSnapshot() {
  const snapshot =
    buildSessionSnapshot();

  return {
    authenticated:
      Boolean(
        snapshot.authenticated
      ),

    role:
      snapshot.role ||
      null,

    username:
      snapshot.user
        ?.username ||
      snapshot.user
        ?.email ||
      snapshot.user
        ?.name ||
      snapshot.user
        ?.nombre ||
      null,

    hasToken:
      Boolean(
        snapshot.token
      ),

    hasRefreshToken:
      Boolean(
        snapshot.refreshToken
      ),

    sessionId:
      snapshot.sessionId ||
      null,

    sessionUserId:
      snapshot.sessionUserId ||
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
