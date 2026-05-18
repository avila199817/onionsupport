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
   - Sin storage paralelo.
   - Sin storage.clear().
   - Sin 2FA/MFA/OTP.
   - Sin rutas técnicas legacy.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../../core/index.js";

export const AUTH_SESSION_VERSION = "simple";

const SOURCE = "auth.session";

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
  return String(value || "").toLowerCase() === "admin" ? "admin" : "user";
}

function stripBearer(value = "") {
  return text(value, "").replace(/^Bearer\s+/i, "");
}

function tokenOk(value = "") {
  const token = stripBearer(value);

  if (!token) return false;
  if (/\s/.test(token)) return false;

  return ![
    "null",
    "undefined",
    "false",
    "true",
    "[object object]",
    "{}",
    "[]",
  ].includes(token.toLowerCase());
}

function cleanToken(value = "") {
  return tokenOk(value) ? stripBearer(value) : "";
}

function redactTokenInText(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function extractMessage(error = null) {
  return (
    error?.data?.message ||
    error?.response?.data?.message ||
    error?.message ||
    String(error || "")
  );
}

/* =========================================================
   USER
========================================================= */

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  return (
    user.disabled === true ||
    String(user.status || "").toLowerCase() === "disabled"
  );
}

function normalizeUser(user = null) {
  if (!isObject(user)) return null;
  if (userDisabled(user)) return null;

  const id = user.userId || user.id || null;
  const email = user.email || null;
  const username = user.username || user.slug || email || id || null;

  if (!id && !username && !email) return null;

  const displayName =
    user.name ||
    user.fullName ||
    user.displayName ||
    user.nombre ||
    username ||
    email ||
    id ||
    "Usuario";

  const role = cleanRole(user.role || user.rol);

  return {
    ...clone(user),

    id,
    userId: user.userId || id,

    username,
    slug: user.slug || username,

    name: user.name || displayName,
    fullName: user.fullName || displayName,
    displayName,

    email,

    role,
    rol: role,
    userRole: role,
    roles: [role],

    isAdmin: role === "admin",
    isSupport: false,
    isManager: false,
    isClient: false,

    avatar: user.avatar || user.avatarUrl || user.picture || null,
    avatarUrl: user.avatarUrl || user.avatar || user.picture || null,
    picture: user.picture || user.avatarUrl || user.avatar || null,
    hasAvatar: Boolean(user.avatar || user.avatarUrl || user.picture),

    active: true,
    disabled: false,
  };
}

/* =========================================================
   STATE
========================================================= */

function readState() {
  return isObject(AppCore?.state) ? AppCore.state : {};
}

function commitState(patch = {}, options = {}) {
  const cleanPatch = isObject(patch) ? patch : {};

  const opts = {
    source: options.source || SOURCE,
    silent: options.silent !== false,
    emit: options.emit === true,
    forceUnauthenticated: options.forceUnauthenticated === true,
  };

  try {
    if (isFunction(AppCore?.setState)) {
      AppCore.setState(cleanPatch, opts);
      return readState();
    }
  } catch {
    // fallback abajo
  }

  try {
    if (isFunction(AppCore?.patchState)) {
      AppCore.patchState(cleanPatch, opts);
      return readState();
    }
  } catch {
    // fallback abajo
  }

  try {
    Object.assign(readState(), cleanPatch);
  } catch {
    // noop
  }

  return readState();
}

function emit(eventName = "", payload = {}, options = {}) {
  if (options.silent === true || options.emit === false || options.emitEvents === false) {
    return false;
  }

  const name = text(eventName, "");

  if (!name) return false;

  try {
    AppCore?.events?.emit?.(name, {
      source: SOURCE,
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

function readUserFromPayload(payload = {}) {
  for (const node of nested(payload)) {
    const user = normalizeUser(
      node.user ||
        node.usuario ||
        node.me ||
        node.account ||
        node.profile
    );

    if (user) return user;
  }

  return normalizeUser(payload);
}

function readSessionFromPayload(payload = {}, user = null) {
  const session = pick(nested(payload), ["session", "sessionData"]) || {};

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
    payload.expiresAt ||
    payload.expires_at ||
    null;

  if (!sessionId && !sessionUserId && !expiresAt) return null;

  return {
    sessionId: sessionId || null,
    id: sessionId || null,
    userId: sessionUserId || null,
    sessionUserId: sessionUserId || null,
    expiresAt,
  };
}

/* =========================================================
   DERIVATION
========================================================= */

function bestStateToken() {
  const state = readState();

  return cleanToken(
    state.token ||
      state.accessToken ||
      state.access_token ||
      ""
  );
}

function bestStateUser() {
  const state = readState();

  return (
    normalizeUser(state.user) ||
    normalizeUser(state.currentUser) ||
    normalizeUser(state.authUser) ||
    normalizeUser(state.sessionUser) ||
    normalizeUser(state.session?.user) ||
    normalizeUser(state.sessionData?.user) ||
    null
  );
}

function bestStateSession(user = bestStateUser()) {
  const state = readState();

  return (
    readSessionFromPayload(state.session || {}, user) ||
    readSessionFromPayload(state.sessionData || {}, user) ||
    null
  );
}

function buildStatePatch({ token = "", user = null, session = null } = {}) {
  const clean = cleanToken(token);
  const safeUser = normalizeUser(user);

  const hasToken = Boolean(clean);
  const authenticated = Boolean(hasToken && safeUser);
  const role = authenticated ? cleanRole(safeUser.role || safeUser.rol) : null;

  const sessionData = authenticated && session
    ? {
        ...session,
        user: safeUser,
        role,
        roles: [role],
        authenticated: true,
      }
    : null;

  return {
    token: hasToken ? clean : null,
    accessToken: hasToken ? clean : null,
    access_token: hasToken ? clean : null,

    user: authenticated ? safeUser : null,
    currentUser: authenticated ? safeUser : null,
    authUser: authenticated ? safeUser : null,
    sessionUser: authenticated ? safeUser : null,

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

    session: sessionData,
    sessionData,
    sessionId: authenticated ? session?.sessionId || session?.id || null : null,
    sessionUserId: authenticated ? session?.sessionUserId || session?.userId || null : null,

    username: authenticated ? safeUser.username || safeUser.slug || null : null,
    avatar: authenticated ? safeUser.avatar || safeUser.avatarUrl || null : null,
    avatarUrl: authenticated ? safeUser.avatarUrl || safeUser.avatar || null : null,

    tempToken: null,
    temp_token: null,
    twoFactorPending: false,

    lastAuthSyncAt: nowIso(),
  };
}

function deriveCurrentSnapshot(extra = {}) {
  const token = bestStateToken();
  const user = bestStateUser();
  const session = bestStateSession(user);

  const hasToken = Boolean(token);
  const authenticated = Boolean(hasToken && user);
  const role = authenticated ? cleanRole(user.role || user.rol) : null;

  const state = readState();

  return {
    version: AUTH_SESSION_VERSION,

    authenticated,
    hasToken,

    user: authenticated ? user : null,
    role,
    roles: authenticated ? [role] : [],

    isAdmin: role === "admin",
    isSupport: false,
    isManager: false,
    isClient: false,

    session: authenticated ? session : null,
    sessionId: authenticated ? session?.sessionId || session?.id || null : null,
    sessionUserId: authenticated ? session?.sessionUserId || session?.userId || null : null,

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

    route: redactTokenInText(snapshot.route || "/"),
    publicPath: redactTokenInText(snapshot.publicPath || "/"),

    source: snapshot.source || "",
    eventMode: snapshot.eventMode || "",
  };
}

export function buildSessionSnapshot(extra = {}) {
  return publicSnapshot(deriveCurrentSnapshot(extra));
}

function emitSession(eventName, snapshot, options = {}) {
  const payload = publicSnapshot(snapshot);

  emit(eventName, payload, options);
  emit(EVENTS.change, payload, options);
  emit(EVENTS.appChange, payload, options);
}

function syncUserUI() {
  try {
    AppCore?.syncUserUI?.({
      source: SOURCE,
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
   APPLY SESSION
========================================================= */

export function applySession(payload = {}, options = {}) {
  const source = options.source || SOURCE;
  const mode = options.eventMode || "apply";

  const token =
    readTokenFromPayload(payload) ||
    (options.useCurrentToken === false ? "" : bestStateToken());

  const user =
    readUserFromPayload(payload) ||
    (options.useCurrentUser === false ? null : bestStateUser());

  const session = readSessionFromPayload(payload, user) || bestStateSession(user);

  const patch = buildStatePatch({
    token,
    user,
    session,
  });

  commitState(patch, {
    source: `${SOURCE}:apply`,
    silent: true,
    forceUnauthenticated: !patch.authenticated,
  });

  syncUserUI();

  const snapshot = deriveCurrentSnapshot({
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
  commitState(
    {
      token: null,
      accessToken: null,
      access_token: null,

      refreshToken: null,
      refresh_token: null,

      user: null,
      currentUser: null,
      authUser: null,
      sessionUser: null,

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
      avatar: null,
      avatarUrl: null,

      tempToken: null,
      temp_token: null,
      twoFactorPending: false,

      lastAuthSyncAt: nowIso(),
    },
    {
      source: `${SOURCE}:clear`,
      silent: true,
      forceUnauthenticated: true,
    }
  );

  syncUserUI();

  const snapshot = deriveCurrentSnapshot({
    source: options.source || SOURCE,
    eventMode: "clear",
  });

  emitSession(EVENTS.cleared, snapshot, options);

  return true;
}

/* =========================================================
   AUTH HELPERS
========================================================= */

export function isAuthenticated() {
  return Boolean(bestStateToken() && bestStateUser());
}

export function getCurrentUser() {
  return isAuthenticated() ? bestStateUser() : null;
}

export function getCurrentToken() {
  return bestStateToken();
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
   DEBUG / ERROR
========================================================= */

export function getSessionDebugSnapshot() {
  const snapshot = deriveCurrentSnapshot();

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

    sessionId: snapshot.sessionId ? "***" : null,
    sessionUserId: snapshot.sessionUserId ? "***" : null,

    route: redactTokenInText(snapshot.route || "/"),
    publicPath: redactTokenInText(snapshot.publicPath || "/"),

    policy: {
      ownFetch: false,
      ownRefresh: false,
      ownRouter: false,
      ownToast: false,
      ownStorage: false,
      no2fa: true,
      noTempToken: true,
      authenticatedRequiresTokenAndUser: true,
      invalidOnlyDisabled: true,
      roles: ["admin", "user"],
    },

    at: nowIso(),
  };
}

export function buildAuthErrorPayload(error = null) {
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
