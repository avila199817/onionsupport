/* =========================================================
   Onion Support - Auth Session
   Archivo: /src/features/auth/session.js

   Responsabilidad:
   - Núcleo mínimo local de sesión Auth.
   - Auth estricta: token + user usable.
   - Token sin user: hasToken true, authenticated false.
   - User sin token: authenticated false.
   - User inválido sólo si disabled.
   - Roles únicos: admin / user.
   - Sin fetch.
   - Sin login HTTP.
   - Sin refresh HTTP.
   - Sin Router.
   - Sin Toast.
   - Sin 2FA/MFA/OTP.
   - Sin rutas técnicas legacy.
   - Sin storage.clear().
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  extractMessage,
  redactTokenInText,
} from "./helpers.js";

import {
  normalizeUser,
} from "./normalize.js";

import {
  getStoredAccessToken,
  getStoredRefreshToken,
  getStoredSessionId,
  getStoredSessionUserId,
  persistAuxSessionData,
  persistRefreshToken,
  persistAccessToken,
  persistSessionContext,
  clearAuthStorage,
} from "./storage.js";

export const AUTH_SESSION_VERSION = "simple";

const SESSION_SOURCE = "auth.session";

const EVENTS = Object.freeze({
  applied: "auth:session:applied",
  partial: "auth:session:partial",
  cleared: "auth:session:cleared",
  change: "auth:change",
  appChange: "app:auth:change",
});

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }
}

function cleanRole(value = "") {
  return String(value).toLowerCase() === "admin" ? "admin" : "user";
}

function stripBearer(value = "") {
  return text(value, "").replace(/^Bearer\s+/i, "");
}

function tokenOk(value = "") {
  const token = stripBearer(value);

  if (!token) return false;
  if (/\s/.test(token)) return false;

  return !["null", "undefined", "false", "true", "[object object]", "{}", "[]"].includes(
    token.toLowerCase()
  );
}

function cleanToken(value = "") {
  return tokenOk(value) ? stripBearer(value) : "";
}

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  return (
    user.disabled === true ||
    String(user.status || "").toLowerCase() === "disabled"
  );
}

function normalizeUserSafe(user = null) {
  if (!isObject(user)) return null;
  if (userDisabled(user)) return null;

  let normalized = null;

  try {
    normalized = normalizeUser(user);
  } catch {
    normalized = user;
  }

  if (!isObject(normalized)) return null;
  if (userDisabled(normalized)) return null;

  const id = normalized.userId || normalized.id || null;
  const username = normalized.username || normalized.slug || normalized.email || id || null;

  if (!id && !username && !normalized.email) return null;

  const displayName =
    normalized.name ||
    normalized.fullName ||
    normalized.displayName ||
    normalized.nombre ||
    username ||
    normalized.email ||
    id ||
    "Usuario";

  const role = cleanRole(normalized.role || normalized.rol);

  return {
    ...clone(normalized),

    id,
    userId: normalized.userId || id,

    username,
    slug: normalized.slug || username,

    name: normalized.name || displayName,
    fullName: normalized.fullName || displayName,
    displayName,

    email: normalized.email || null,

    role,
    rol: role,
    userRole: role,
    roles: [role],

    isAdmin: role === "admin",
    isSupport: false,
    isManager: false,
    isClient: false,

    avatar: normalized.avatar || normalized.avatarUrl || normalized.picture || null,
    avatarUrl: normalized.avatarUrl || normalized.avatar || normalized.picture || null,
    picture: normalized.picture || normalized.avatarUrl || normalized.avatar || null,
    hasAvatar: Boolean(normalized.avatar || normalized.avatarUrl || normalized.picture),

    active: true,
    disabled: false,
  };
}

function userOk(user = null) {
  return Boolean(normalizeUserSafe(user));
}

function readState() {
  return isObject(AppCore?.state) ? AppCore.state : {};
}

function commitState(patch = {}, options = {}) {
  const cleanPatch = isObject(patch) ? patch : {};

  const opts = {
    source: options.source || SESSION_SOURCE,
    silent: options.silent !== false,
    emit: options.emit === true,
  };

  try {
    if (isFunction(AppCore?.setState)) {
      AppCore.setState(cleanPatch, opts);
      return readState();
    }
  } catch {
    // noop
  }

  try {
    if (isFunction(AppCore?.patchState)) {
      AppCore.patchState(cleanPatch, opts);
      return readState();
    }
  } catch {
    // noop
  }

  try {
    Object.assign(readState(), cleanPatch);
  } catch {
    // noop
  }

  return readState();
}

function safeRedact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return text(value, "")
      .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
  }
}

function emit(eventName = "", payload = {}, options = {}) {
  if (options.silent === true || options.emit === false || options.emitEvents === false) {
    return false;
  }

  const event = text(eventName, "");

  if (!event) return false;

  try {
    AppCore?.events?.emit?.(event, {
      source: SESSION_SOURCE,
      version: AUTH_SESSION_VERSION,
      at: nowIso(),
      ...payload,
      token: null,
      accessToken: null,
      refreshToken: null,
    });

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   PAYLOAD EXTRACTION
========================================================= */

function nested(payload = {}) {
  const source = isObject(payload) ? payload : {};

  return [
    source,
    isObject(source.data) ? source.data : null,
    isObject(source.payload) ? source.payload : null,
    isObject(source.result) ? source.result : null,
    isObject(source.body) ? source.body : null,
    isObject(source.response?.data) ? source.response.data : null,
    isObject(source.auth) ? source.auth : null,
    isObject(source.session) ? source.session : null,
    isObject(source.sessionData) ? source.sessionData : null,
  ].filter(Boolean);
}

function pick(nodes = [], keys = []) {
  for (const node of nodes) {
    for (const key of keys) {
      const value = node?.[key];

      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  }

  return undefined;
}

function readTokenFromPayload(payload = {}) {
  return cleanToken(
    pick(nested(payload), [
      "token",
      "accessToken",
      "access_token",
    ])
  );
}

function readRefreshTokenFromPayload(payload = {}) {
  return cleanToken(
    pick(nested(payload), [
      "refreshToken",
      "refresh_token",
    ])
  );
}

function readUserFromPayload(payload = {}) {
  for (const node of nested(payload)) {
    const candidate =
      node.user ||
      node.usuario ||
      node.me ||
      node.account ||
      node.profile;

    const user = normalizeUserSafe(candidate);

    if (user) return user;
  }

  return normalizeUserSafe(payload);
}

function readSessionFromPayload(payload = {}, user = null) {
  const session =
    pick(nested(payload), [
      "session",
      "sessionData",
    ]) || {};

  const sessionId = text(
    session.sessionId ||
      session.session_id ||
      session.sid ||
      session.id ||
      payload.sessionId ||
      payload.session_id ||
      "",
    ""
  );

  const sessionUserId = text(
    session.sessionUserId ||
      session.session_user_id ||
      session.userId ||
      session.user_id ||
      payload.sessionUserId ||
      payload.session_user_id ||
      user?.userId ||
      user?.id ||
      "",
    ""
  );

  const expiresAt =
    session.expiresAt ||
    session.expires_at ||
    session.exp ||
    payload.expiresAt ||
    payload.expires_at ||
    null;

  if (!sessionId && !sessionUserId && !expiresAt) return null;

  return {
    id: sessionId || null,
    sessionId: sessionId || null,
    session_id: sessionId || null,
    sid: sessionId || null,

    userId: sessionUserId || null,
    user_id: sessionUserId || null,
    sessionUserId: sessionUserId || null,
    session_user_id: sessionUserId || null,

    expiresAt,
    expires_at: expiresAt,
  };
}

/* =========================================================
   STATE DERIVATION
========================================================= */

function bestStateToken() {
  const state = readState();

  return cleanToken(
    state.token ||
      state.accessToken ||
      state.access_token ||
      state.session?.token ||
      state.session?.accessToken ||
      state.session?.access_token ||
      getStoredAccessToken() ||
      ""
  );
}

function bestStateUser() {
  const state = readState();

  return (
    normalizeUserSafe(state.user) ||
    normalizeUserSafe(state.currentUser) ||
    normalizeUserSafe(state.authUser) ||
    normalizeUserSafe(state.sessionUser) ||
    normalizeUserSafe(state.session?.user) ||
    normalizeUserSafe(state.sessionData?.user) ||
    null
  );
}

function bestStateSession(user = bestStateUser()) {
  const state = readState();

  return (
    readSessionFromPayload(state.session || {}, user) ||
    readSessionFromPayload(state.sessionData || {}, user) ||
    {
      sessionId: getStoredSessionId() || null,
      session_id: getStoredSessionId() || null,
      sessionUserId: getStoredSessionUserId() || null,
      session_user_id: getStoredSessionUserId() || null,
      userId: getStoredSessionUserId() || null,
      user_id: getStoredSessionUserId() || null,
    }
  );
}

function buildStatePatch({ token = "", user = null, session = null } = {}) {
  const clean = cleanToken(token);
  const safeUser = normalizeUserSafe(user);
  const hasToken = Boolean(clean);
  const authenticated = Boolean(hasToken && safeUser);
  const role = authenticated ? cleanRole(safeUser.role || safeUser.rol) : null;

  const sessionAlias = authenticated && session
    ? {
        ...session,
        user: safeUser,
        usuario: safeUser,
        role,
        rol: role,
        roles: [role],
        authenticated: true,
      }
    : null;

  return {
    token: hasToken ? clean : null,
    accessToken: hasToken ? clean : null,
    access_token: hasToken ? clean : null,

    refreshToken: null,
    refresh_token: null,

    user: authenticated ? safeUser : null,
    currentUser: authenticated ? safeUser : null,
    authUser: authenticated ? safeUser : null,
    sessionUser: authenticated ? safeUser : null,
    account: authenticated ? safeUser : null,
    profile: authenticated ? safeUser : null,

    authenticated,
    hasToken,

    role,
    rol: role,
    userRole: role,
    roles: authenticated ? [role] : [],

    isAdmin: role === "admin",
    isSupport: false,
    isManager: false,
    isClient: false,

    session: sessionAlias,
    sessionData: sessionAlias,
    sessionId: authenticated ? session?.sessionId || session?.id || null : null,
    sessionUserId: authenticated ? session?.sessionUserId || session?.userId || null : null,

    username: authenticated ? safeUser.slug || safeUser.username || null : null,
    currentResolvedUsername: authenticated ? safeUser.slug || safeUser.username || null : null,
    resolvedUsername: authenticated ? safeUser.slug || safeUser.username || null : null,

    avatar: authenticated ? safeUser.avatar || safeUser.avatarUrl || null : null,
    avatarUrl: authenticated ? safeUser.avatarUrl || safeUser.avatar || null : null,

    tempToken: null,
    temp_token: null,
    twoFactorPending: false,

    lastAuthSyncAt: nowIso(),
  };
}

function syncDerivedState() {
  const token = bestStateToken();
  const user = bestStateUser();
  const session = bestStateSession(user);

  const patch = buildStatePatch({
    token,
    user,
    session,
  });

  commitState(patch, {
    source: `${SESSION_SOURCE}:sync`,
    silent: true,
  });

  return readState();
}

function syncUserUI() {
  try {
    AppCore?.syncUserUI?.({
      source: SESSION_SOURCE,
      reason: "auth-session",
    });
  } catch {
    try {
      AppCore?.syncUserUI?.();
    } catch {
      // noop
    }
  }
}

/* =========================================================
   SNAPSHOTS
========================================================= */

function internalSnapshot(extra = {}) {
  const state = syncDerivedState();
  const token = cleanToken(bestStateToken());
  const user = bestStateUser();
  const session = bestStateSession(user);
  const authenticated = Boolean(token && user);

  return {
    version: AUTH_SESSION_VERSION,

    authenticated,
    hasToken: Boolean(token),

    token: token || null,
    accessToken: token || null,
    refreshToken: getStoredRefreshToken() || null,

    user: authenticated ? user : null,
    role: authenticated ? cleanRole(state.role || user?.role) : null,
    roles: authenticated ? [cleanRole(state.role || user?.role)] : [],

    isAdmin: authenticated && cleanRole(state.role || user?.role) === "admin",
    isSupport: false,
    isManager: false,
    isClient: false,

    session: authenticated ? session : null,
    sessionData: authenticated ? session : null,
    sessionId: authenticated ? session?.sessionId || session?.id || null : null,
    sessionUserId: authenticated ? session?.sessionUserId || session?.userId || null : null,

    storedSessionId: getStoredSessionId() || null,
    storedSessionUserId: getStoredSessionUserId() || null,

    route: state.route || "/",
    publicPath: state.publicPath || "/",

    ...extra,
  };
}

function publicUser(user = null) {
  if (!isObject(user)) return null;

  return {
    id: user.id || user.userId || null,
    userId: user.userId || user.id || null,
    username: user.username || user.slug || null,
    displayName: user.displayName || user.name || user.username || null,
    role: user.role || user.rol || null,
    hasAvatar: Boolean(user.avatar || user.avatarUrl || user.picture),
  };
}

function publicSnapshot(snapshot = {}) {
  return {
    version: AUTH_SESSION_VERSION,

    authenticated: Boolean(snapshot.authenticated),
    hasToken: Boolean(snapshot.hasToken),

    token: null,
    accessToken: null,
    refreshToken: null,

    user: publicUser(snapshot.user),
    role: snapshot.role || null,
    roles: Array.isArray(snapshot.roles) ? snapshot.roles : [],

    isAdmin: Boolean(snapshot.isAdmin),
    isSupport: false,
    isManager: false,
    isClient: false,

    sessionId: snapshot.sessionId ? "***" : null,
    sessionUserId: snapshot.sessionUserId ? "***" : null,

    route: safeRedact(snapshot.route || "/"),
    publicPath: safeRedact(snapshot.publicPath || "/"),

    source: snapshot.source || "",
    eventMode: snapshot.eventMode || "",
  };
}

export function buildSessionSnapshot(extra = {}) {
  return publicSnapshot(internalSnapshot(extra));
}

function emitSession(eventName, snapshot, options = {}) {
  const payload = publicSnapshot(snapshot);

  emit(eventName, payload, options);
  emit(EVENTS.change, payload, options);
  emit(EVENTS.appChange, payload, options);
}

/* =========================================================
   APPLY SESSION
========================================================= */

export function applySession(payload = {}, options = {}) {
  const source = options.source || SESSION_SOURCE;
  const mode = options.eventMode || "apply";

  const token =
    readTokenFromPayload(payload) ||
    (options.useCurrentToken === false ? "" : bestStateToken());

  const refreshToken = readRefreshTokenFromPayload(payload);
  const user = readUserFromPayload(payload) || bestStateUser();
  const session = readSessionFromPayload(payload, user) || bestStateSession(user);

  if (token) {
    persistAccessToken(token);
  }

  if (refreshToken) {
    persistRefreshToken(refreshToken);
  }

  const patch = buildStatePatch({
    token,
    user,
    session,
  });

  commitState(patch, {
    source: `${SESSION_SOURCE}:apply`,
    silent: true,
  });

  if (patch.authenticated) {
    persistSessionContext(session, user);
    persistAuxSessionData(user);
  } else if (!patch.hasToken) {
    persistSessionContext(null, null);
  }

  syncDerivedState();
  syncUserUI();

  const snapshot = internalSnapshot({
    source,
    eventMode: mode,
  });

  emitSession(snapshot.authenticated ? EVENTS.applied : EVENTS.partial, snapshot, options);

  return publicSnapshot(snapshot);
}

/* =========================================================
   CLEAR SESSION
========================================================= */

export function clearSessionLocal(options = {}) {
  clearAuthStorage();
  persistAccessToken(null);
  persistRefreshToken(null);
  persistSessionContext(null, null);

  commitState({
    token: null,
    accessToken: null,
    access_token: null,

    refreshToken: null,
    refresh_token: null,

    user: null,
    currentUser: null,
    authUser: null,
    sessionUser: null,
    account: null,
    profile: null,

    authenticated: false,
    hasToken: false,

    role: null,
    rol: null,
    userRole: null,
    roles: [],

    isAdmin: false,
    isSupport: false,
    isManager: false,
    isClient: false,

    session: null,
    sessionData: null,
    sessionId: null,
    sessionUserId: null,

    username: null,
    currentResolvedUsername: null,
    resolvedUsername: null,

    avatar: null,
    avatarUrl: null,

    tempToken: null,
    temp_token: null,
    twoFactorPending: false,

    lastAuthSyncAt: nowIso(),
  }, {
    source: `${SESSION_SOURCE}:clear`,
    silent: true,
    forceUnauthenticated: true,
  });

  syncUserUI();

  const snapshot = internalSnapshot({
    source: options.source || SESSION_SOURCE,
    eventMode: "clear",
  });

  emitSession(EVENTS.cleared, snapshot, options);

  return true;
}

/* =========================================================
   AUTH HELPERS
========================================================= */

export function isAuthenticated() {
  const token = bestStateToken();
  const user = bestStateUser();

  return Boolean(token && user);
}

export function getCurrentUser() {
  return isAuthenticated() ? bestStateUser() : null;
}

export function getCurrentToken() {
  return cleanToken(bestStateToken());
}

export function getCurrentRole() {
  const user = getCurrentUser();

  return user ? cleanRole(readState().role || user.role || user.rol) : "";
}

export function getCurrentRoles() {
  const role = getCurrentRole();

  return role ? [role] : [];
}

export function isCurrentUserAdmin() {
  return getCurrentRole() === "admin";
}

export function isCurrentUserSupport() {
  return false;
}

export function isCurrentUserManager() {
  return false;
}

export function isCurrentUserClient() {
  return false;
}

export function hasRole(...roles) {
  if (!isAuthenticated()) return false;
  if (!roles.length) return true;

  const current = getCurrentRole();

  return roles
    .flat()
    .map(cleanRole)
    .some((role) => role === current);
}

export function requireRole(...roles) {
  if (!hasRole(...roles)) {
    const error = new Error("No tienes permisos para acceder a este recurso.");
    error.code = "AUTH_FORBIDDEN";
    error.status = 403;
    throw error;
  }

  return true;
}

export function getAuthHeader() {
  const token = getCurrentToken();

  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

/* =========================================================
   DEBUG
========================================================= */

export function getSessionDebugSnapshot() {
  const snapshot = internalSnapshot();

  return {
    version: AUTH_SESSION_VERSION,

    authenticated: Boolean(snapshot.authenticated),
    hasToken: Boolean(snapshot.hasToken),
    hasUser: Boolean(snapshot.user),

    role: snapshot.role || null,
    roles: snapshot.roles || [],

    isAdmin: Boolean(snapshot.isAdmin),
    isSupport: false,
    isManager: false,
    isClient: false,

    user: publicUser(snapshot.user),

    token: null,
    accessToken: null,
    refreshToken: null,

    hasRefreshToken: Boolean(snapshot.refreshToken),
    sessionId: snapshot.sessionId ? "***" : null,
    sessionUserId: snapshot.sessionUserId ? "***" : null,
    storedSessionId: snapshot.storedSessionId ? "***" : null,
    storedSessionUserId: snapshot.storedSessionUserId ? "***" : null,

    route: safeRedact(snapshot.route || "/"),
    publicPath: safeRedact(snapshot.publicPath || "/"),

    policy: {
      ownFetch: false,
      ownRefresh: false,
      ownRouter: false,
      ownToast: false,
      no2fa: true,
      noTempToken: true,
      authenticatedRequiresTokenAndUser: true,
      roles: ["admin", "user"],
    },

    at: nowIso(),
  };
}

export function buildAuthErrorPayload(error) {
  return {
    error: error
      ? {
          name: text(error.name, "Error"),
          status: error.status || error.response?.status || error.data?.status || null,
          code: error.code || error.data?.code || error.response?.data?.code || null,
        }
      : null,
    message: extractMessage(error),
  };
}

export function exposeSessionDebugApi() {
  return {
    version: AUTH_SESSION_VERSION,
    snapshot: getSessionDebugSnapshot,
    getSnapshot: getSessionDebugSnapshot,
    isAuthenticated,
    getCurrentUser,
    getCurrentToken,
    getCurrentRole,
    getCurrentRoles,
    isCurrentUserAdmin,
    isCurrentUserClient,
    hasRole,
    requireRole,
    getAuthHeader,
    clear: clearSessionLocal,
    apply: applySession,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  AUTH_SESSION_VERSION,

  applySession,
  clearSessionLocal,
  buildSessionSnapshot,

  isAuthenticated,

  getCurrentUser,
  getCurrentToken,

  getCurrentRole,
  getCurrentRoles,

  isCurrentUserAdmin,
  isCurrentUserSupport,
  isCurrentUserManager,
  isCurrentUserClient,

  hasRole,
  requireRole,

  getAuthHeader,

  getSessionDebugSnapshot,
  buildAuthErrorPayload,
  exposeSessionDebugApi,
};
