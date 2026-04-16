/* =========================================================
   Onion SPA - Auth Session
   Archivo: src/features/auth/session.js

   RESPONSABILIDADES:
   - aplicar sesión autenticada sobre AppCore
   - limpiar sesión local y storage auxiliar
   - exponer helpers auth de estado / rol
   - construir snapshots consistentes
   - exponer Authorization header
   - endurecer sync con AppCore.state
   - evitar estados auth fantasma

   HARDENING EXTREMO:
   - estado derivado robusto
   - persistencia ordenada
   - sync UI seguro
   - helpers enterprise
   - cero estados partidos
   - emisiones sólo cuando cambian datos
   - fingerprint robusto
   - token/user desacoplados sin corrupción
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

function nowMs() {
  return Date.now();
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
      user?.type ??
      user?.perfil ??
      "",
    ""
  ).toLowerCase();
}

function resolveAuthenticated(
  state
) {
  return Boolean(
    safeText(
      state?.token
    )
  );
}

function syncDerivedState() {
  const state =
    ensureCoreState();

  state.authenticated =
    resolveAuthenticated(
      state
    );

  state.role =
    state.authenticated
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

function safeSetState(
  patch = {}
) {
  try {
    AppCore?.setState?.(
      patch
    );
  } catch {}

  try {
    Object.assign(
      ensureCoreState(),
      patch
    );
  } catch {}
}

function safeSetToken(
  token = null
) {
  if (
    typeof AppCore?.setToken ===
    "function"
  ) {
    try {
      AppCore.setToken(
        token || null
      );
      return;
    } catch {}
  }

  safeSetState({
    token:
      token || null,
  });
}

function safeSetUser(
  user = null
) {
  if (
    typeof AppCore?.setUser ===
    "function"
  ) {
    try {
      AppCore.setUser(
        user || null
      );
      return;
    } catch {}
  }

  safeSetState({
    user:
      user || null,
  });
}

function safeClearSession() {
  if (
    typeof AppCore?.clearSession ===
    "function"
  ) {
    try {
      AppCore.clearSession();
      return;
    } catch {}
  }

  safeSetState({
    token: null,
    user: null,
    role: "",
    authenticated:
      false,
  });
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
   FINGERPRINT
========================================================= */

function buildSessionFingerprint(
  snapshot = {}
) {
  const user =
    snapshot?.user || {};

  return JSON.stringify({
    authenticated:
      Boolean(
        snapshot.authenticated
      ),
    token:
      safeText(
        snapshot.token
      ),
    role:
      safeText(
        snapshot.role
      ),
    refreshToken:
      safeText(
        snapshot.refreshToken
      ),
    sessionId:
      safeText(
        snapshot.sessionId
      ),
    sessionUserId:
      safeText(
        snapshot.sessionUserId
      ),
    userId:
      user.id ||
      user.userId ||
      user.user_id ||
      null,
    username:
      user.username ||
      user.userName ||
      user.email ||
      null,
  });
}

function emitSessionState({
  reason = "unknown",
  before = null,
  after = null,
  durationMs = 0,
} = {}) {
  safeEmit(
    "auth:session:state",
    {
      reason,
      before,
      after,
      changed:
        buildSessionFingerprint(
          before
        ) !==
        buildSessionFingerprint(
          after
        ),
      durationMs,
      timestamp:
        nowMs(),
      at:
        new Date().toISOString(),
    }
  );
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
  const startedAt =
    nowMs();

  const before =
    buildSessionSnapshot();

  const normalizedUser =
    user === undefined
      ? undefined
      : normalizeUser(
          user
        );

  /* token primero */
  if (
    token !== undefined
  ) {
    safeSetToken(
      token || null
    );
  }

  /* user después */
  if (
    user !== undefined
  ) {
    safeSetUser(
      normalizedUser ||
        null
    );
  }

  /* persistencia */
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

  const effectiveUser =
    normalizedUser ===
    undefined
      ? ensureCoreState()
          .user || null
      : normalizedUser;

  if (
    sessionData !==
    undefined
  ) {
    persistSessionContext(
      sessionData ||
        null,
      effectiveUser
    );
  }

  persistAuxSessionData(
    effectiveUser
  );

  syncDerivedState();

  safeSyncUserUI();

  const after =
    buildSessionSnapshot();

  emitSessionState({
    reason: "apply",
    before,
    after,
    durationMs:
      nowMs() -
      startedAt,
  });

  if (
    buildSessionFingerprint(
      before
    ) !==
    buildSessionFingerprint(
      after
    )
  ) {
    safeEmit(
      "auth:session:applied",
      after
    );

    safeEmit(
      "app:user:change",
      after
    );
  }

  return after;
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

  const startedAt =
    nowMs();

  const before =
    buildSessionSnapshot();

  const hadData =
    Boolean(
      before.token
    ) ||
    Boolean(
      before.user
    ) ||
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

  const after =
    buildSessionSnapshot();

  if (
    !safeBool(
      silent
    ) &&
    hadData
  ) {
    safeEmit(
      "auth:session:cleared",
      after
    );

    safeEmit(
      "app:user:change",
      after
    );
  }

  emitSessionState({
    reason:
      safeBool(
        silent
      )
        ? "clear:silent"
        : "clear",
    before,
    after,
    durationMs:
      nowMs() -
      startedAt,
  });

  return true;
}

/* =========================================================
   HELPERS AUTH
========================================================= */

export function isAuthenticated() {
  const state =
    ensureCoreState();

  syncDerivedState();

  return Boolean(
    state.authenticated &&
      safeText(
        state.token
      )
  );
}

export function getCurrentRole() {
  syncDerivedState();

  return safeText(
    ensureCoreState()
      .role
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
        role
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
      ensureCoreState()
        .token
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

export default {
  applySession,
  clearSessionLocal,
  buildSessionSnapshot,
  isAuthenticated,
  getCurrentRole,
  hasRole,
  requireRole,
  getAuthHeader,
  getSessionDebugSnapshot,
  buildAuthErrorPayload,
};
