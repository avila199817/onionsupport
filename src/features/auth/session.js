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
      "",
    ""
  ).toLowerCase();
}

function syncDerivedState() {
  const state =
    ensureCoreState();

  const token =
    safeText(
      state.token,
      ""
    );

  const hasToken =
    Boolean(token);

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
  state.authenticated =
    false;
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
        snapshot?.authenticated
      ),
    token:
      safeText(
        snapshot?.token
      ),
    role:
      safeText(
        snapshot?.role
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
    refreshToken:
      safeText(
        snapshot?.refreshToken
      ),
    sessionId:
      safeText(
        snapshot?.sessionId
      ),
    sessionUserId:
      safeText(
        snapshot?.sessionUserId
      ),
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
      durationMs,
      before,
      after,
      changed:
        buildSessionFingerprint(
          before
        ) !==
        buildSessionFingerprint(
          after
        ),
      at:
        new Date().toISOString(),
      timestamp:
        nowMs(),
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
      : normalizeUser(user);

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

  /* auxiliares */
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

  persistAuxSessionData(
    normalizedUser ===
      undefined
      ? AppCore?.state
          ?.user || null
      : normalizedUser
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

  const after =
    buildSessionSnapshot();

  if (
    !safeBool(silent) &&
    hadData
  ) {
    safeEmit(
      "auth:session:cleared",
      after
    );
  }

  emitSessionState({
    reason:
      safeBool(silent)
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
  const state =
    ensureCoreState();

  syncDerivedState();

  return safeText(
    state.role
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
      AppCore?.state?.token
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
