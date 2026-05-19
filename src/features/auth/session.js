/* =========================================================
   Onion Support - Auth Session
   Archivo: /src/features/auth/session.js

   Responsabilidad:
   - Núcleo local mínimo de sesión Auth.
   - Auth estricta: token usable + user usable.
   - Token sin user: hasToken true, authenticated false.
   - User sin token: authenticated false.
   - User inválido si disabled/deleted/archived/active=false.
   - Roles únicos: admin / user.
   - Leer token persistido para soportar reload.
   - Leer refresh token persistido para permitir restore vía refresh.
   - Persistir token/refresh/session auxiliar al aplicar sesión.
   - No fabricar user desde storage.
   - Conservar slug real del usuario si existe.
   - Exponer homePath: /@{user.slug} si el usuario trae slug real.
   - Sin fetch.
   - Sin login HTTP.
   - Sin refresh HTTP.
   - Sin Router.
   - Sin Toast.
   - Sin storage paralelo fuera de storage.js.
   - Sin eventos globales.
   - Sin 2FA/MFA/OTP.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  clearAuthStorage,
  getStoredAccessToken,
  getStoredRefreshToken,
  getStoredSessionContext,
  persistAuthStorage,
} from "./storage.js";

export const AUTH_SESSION_VERSION = "auth.session.v3";

const SOURCE = "auth.session";

const AUTH_HOME = Object.freeze({
  canonical: "/",
  userPrefix: "/@",
});

const VALID_ROLES = Object.freeze(["admin", "user"]);

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function cleanRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(cleanRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "user";
  }

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

function ensureState() {
  try {
    AppCore.state = isObject(AppCore.state) ? AppCore.state : {};
    return AppCore.state;
  } catch {
    return {};
  }
}

function readState() {
  return isObject(AppCore?.state) ? AppCore.state : {};
}

function commitState(patch = {}, options = {}) {
  const cleanPatch = isObject(patch) ? patch : {};

  const opts = {
    source: options.source || SOURCE,
    silent: options.silent !== false,
    emit: false,
    forceUnauthenticated: options.forceUnauthenticated === true,
  };

  try {
    if (typeof AppCore?.setState === "function") {
      AppCore.setState(cleanPatch, opts);
      return readState();
    }
  } catch {
    // fallback abajo
  }

  try {
    if (typeof AppCore?.patchState === "function") {
      AppCore.patchState(cleanPatch, opts);
      return readState();
    }
  } catch {
    // fallback abajo
  }

  try {
    Object.assign(ensureState(), cleanPatch);
  } catch {
    // noop
  }

  return readState();
}

function syncUserUI() {
  try {
    AppCore?.syncUserUI?.({
      source: SOURCE,
      reason: "auth-session",
    });
    return true;
  } catch {
    try {
      AppCore?.syncUserUI?.();
      return true;
    } catch {
      return false;
    }
  }
}

/* =========================================================
   SLUG / HOME
========================================================= */

export function normalizeSessionSlug(value = "") {
  const slug = text(value, "")
    .replace(/^\/+/, "")
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]
    .trim()
    .toLowerCase();

  if (!slug) return "";

  return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
}

export function extractSessionUserSlug(user = null) {
  if (!isObject(user)) return "";

  return normalizeSessionSlug(
    user.slug ||
      user.lookup?.slug ||
      user.profile?.slug ||
      ""
  );
}

export function buildSessionUserHomePath(user = null) {
  const slug = extractSessionUserSlug(user);

  return slug ? `${AUTH_HOME.userPrefix}${slug}` : AUTH_HOME.canonical;
}

export function getCurrentUserSlug() {
  return extractSessionUserSlug(bestStateUser());
}

export function getCurrentUserHomePath() {
  return buildSessionUserHomePath(bestStateUser());
}

/* =========================================================
   USER
========================================================= */

function removeSensitiveUserFields(user = {}) {
  const output = { ...user };

  for (const key of [
    "password",
    "passwordHash",
    "hash",
    "salt",

    "token",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",

    "resetToken",
    "activationToken",

    "otp",
    "otpCode",
    "mfa",
    "twofa_secret",
    "twofaSecret",
    "totpSecret",
    "backupCodes",
  ]) {
    try {
      delete output[key];
    } catch {
      // noop
    }
  }

  return output;
}

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  const status = text(user.status || user.estado, "").toLowerCase();

  return Boolean(
    user.disabled === true ||
      user.deleted === true ||
      user.archived === true ||
      user.active === false ||
      status === "disabled" ||
      status === "deleted" ||
      status === "archived"
  );
}

function hasUserIdentity(user = null) {
  if (!isObject(user)) return false;

  return Boolean(
    text(user.id, "") ||
      text(user.userId, "") ||
      text(user.username, "") ||
      text(user.slug, "") ||
      text(user.lookup?.slug, "")
  );
}

export function normalizeUser(user = null) {
  if (!isObject(user)) return null;
  if (userDisabled(user)) return null;

  const safeUser = removeSensitiveUserFields(user);

  if (!hasUserIdentity(safeUser)) return null;

  const id = text(safeUser.userId || safeUser.id, "");
  const slug = extractSessionUserSlug(safeUser);

  const username = text(
    safeUser.username ||
      safeUser.userName ||
      safeUser.user_name ||
      slug ||
      id,
    ""
  );

  const profile = isObject(safeUser.profile) ? safeUser.profile : {};

  const displayName = text(
    safeUser.displayName ||
      safeUser.fullName ||
      safeUser.name ||
      safeUser.nombre ||
      profile.displayName ||
      profile.fullName ||
      profile.name ||
      profile.nombre ||
      username ||
      id,
    "Usuario"
  );

  const role = cleanRole(safeUser.role || safeUser.rol || safeUser.roles);

  return {
    ...safeUser,

    id: id || safeUser.id || safeUser.userId || null,
    userId: safeUser.userId || id || null,

    username: username || null,

    /*
      Slug real únicamente.
      No se inventa desde username/email/id.
    */
    slug: slug || null,

    name: safeUser.name || displayName,
    fullName: safeUser.fullName || displayName,
    displayName,

    email: safeUser.email || null,

    role,
    rol: role,
    userRole: role,
    roles: [role],

    active: true,
    disabled: false,

    isAdmin: role === "admin",
    isUser: role === "user",
  };
}

/* =========================================================
   PAYLOAD READERS
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
  const nodes = nested(payload);

  const sessionNode =
    nodes.find((node) => isObject(node.session))?.session ||
    nodes.find((node) => isObject(node.sessionData))?.sessionData ||
    null;

  const sessionId = text(
    sessionNode?.sessionId ||
      sessionNode?.session_id ||
      sessionNode?.sid ||
      sessionNode?.id ||
      pick(nodes, ["sessionId", "session_id", "sid"]) ||
      "",
    ""
  );

  const userId = text(
    sessionNode?.userId ||
      sessionNode?.user_id ||
      pick(nodes, ["sessionUserId", "session_user_id", "userId", "user_id"]) ||
      user?.userId ||
      user?.id ||
      "",
    ""
  );

  const expiresAt =
    sessionNode?.expiresAt ||
    sessionNode?.expires_at ||
    sessionNode?.refreshExpiresAt ||
    sessionNode?.refresh_expires_at ||
    pick(nodes, ["expiresAt", "expires_at", "refreshExpiresAt", "refresh_expires_at"]) ||
    null;

  if (!sessionId && !userId && !expiresAt) return null;

  return {
    sessionId: sessionId || null,
    id: sessionId || null,
    userId: userId || null,
    sessionUserId: userId || null,
    expiresAt,
    refreshExpiresAt: expiresAt,
  };
}

/* =========================================================
   STORAGE DERIVATION
========================================================= */

function storedToken() {
  try {
    return cleanToken(getStoredAccessToken?.() || "");
  } catch {
    return "";
  }
}

function storedRefreshToken() {
  try {
    return cleanToken(getStoredRefreshToken?.() || "");
  } catch {
    return "";
  }
}

function storedSession() {
  try {
    const session = getStoredSessionContext?.();

    if (!isObject(session)) return null;

    const sessionId = text(session.sessionId || session.session_id || session.id, "");
    const userId = text(session.userId || session.user_id || session.sessionUserId || session.session_user_id, "");
    const expiresAt = session.expiresAt || session.expires_at || session.refreshExpiresAt || session.refresh_expires_at || null;

    if (!sessionId && !userId && !expiresAt) return null;

    return {
      sessionId: sessionId || null,
      id: sessionId || null,
      userId: userId || null,
      sessionUserId: userId || null,
      expiresAt,
      refreshExpiresAt: expiresAt,
    };
  } catch {
    return null;
  }
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
      storedToken() ||
      ""
  );
}

function bestStateRefreshToken() {
  const state = readState();

  return cleanToken(
    state.refreshToken ||
      state.refresh_token ||
      storedRefreshToken() ||
      ""
  );
}

function bestStateUser() {
  const state = readState();

  /*
    No se fabrica usuario desde storage.
    El reload se restaura así:
      token persistido -> restore.js -> /me -> user canónico.
      token caducado -> restore.js -> refresh context -> /refresh -> user canónico.
  */
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

function sameSessionUser(session = null, user = null) {
  if (!session || !user) return false;

  const sessionUserId = text(session.userId || session.sessionUserId, "");
  const userId = text(user.userId || user.id, "");

  if (!sessionUserId || !userId) return true;

  return sessionUserId === userId;
}

function bestStateSession(user = bestStateUser()) {
  const state = readState();

  const session =
    readSessionFromPayload(state.session || {}, user) ||
    readSessionFromPayload(state.sessionData || {}, user) ||
    storedSession() ||
    null;

  if (!session) return null;
  if (!user) return session;

  return sameSessionUser(session, user) ? session : null;
}

/* =========================================================
   STATE PATCH
========================================================= */

function buildStatePatch({
  token = "",
  refreshToken = "",
  user = null,
  session = null,
} = {}) {
  const safeToken = cleanToken(token);
  const safeRefreshToken = cleanToken(refreshToken);
  const safeUser = normalizeUser(user);

  const hasToken = Boolean(safeToken);
  const hasRefreshToken = Boolean(safeRefreshToken);
  const authenticated = Boolean(hasToken && safeUser);
  const role = authenticated ? cleanRole(safeUser.role || safeUser.rol || safeUser.roles) : null;
  const slug = authenticated ? extractSessionUserSlug(safeUser) : "";
  const homePath = authenticated
    ? buildSessionUserHomePath(safeUser)
    : AUTH_HOME.canonical;

  const sessionData = authenticated && session
    ? {
        ...session,
        user: safeUser,
        role,
        roles: [role],
        userSlug: slug || null,
        homePath,
        authenticated: true,
      }
    : null;

  return {
    token: hasToken ? safeToken : null,
    accessToken: hasToken ? safeToken : null,
    access_token: hasToken ? safeToken : null,

    refreshToken: hasRefreshToken ? safeRefreshToken : null,
    refresh_token: hasRefreshToken ? safeRefreshToken : null,

    user: authenticated ? safeUser : null,
    currentUser: authenticated ? safeUser : null,
    authUser: authenticated ? safeUser : null,
    sessionUser: authenticated ? safeUser : null,

    authenticated,
    hasToken,
    hasRefreshToken,

    role,
    rol: role,
    userRole: role,
    roles: authenticated ? [role] : [],

    isAdmin: role === "admin",
    isUser: role === "user",

    userSlug: authenticated ? slug || null : null,
    homePath,
    defaultHome: homePath,
    postLoginTarget: authenticated ? homePath : null,

    session: sessionData,
    sessionData,
    sessionId: authenticated ? session?.sessionId || session?.id || null : null,
    sessionUserId: authenticated ? session?.sessionUserId || session?.userId || null : null,

    username: authenticated ? safeUser.username || null : null,
    avatar: authenticated ? safeUser.avatar || safeUser.avatarUrl || null : null,
    avatarUrl: authenticated ? safeUser.avatarUrl || safeUser.avatar || null : null,

    lastAuthSyncAt: nowIso(),
  };
}

function persistPatch({
  token = "",
  refreshToken = "",
  session = null,
} = {}) {
  const safeToken = cleanToken(token);
  const safeRefreshToken = cleanToken(refreshToken);

  if (!safeToken) return false;

  try {
    persistAuthStorage(
      {
        token: safeToken,
        accessToken: safeToken,
        access_token: safeToken,

        refreshToken: safeRefreshToken || undefined,
        refresh_token: safeRefreshToken || undefined,

        session,
      },
      {
        source: SOURCE,
      }
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SNAPSHOT
========================================================= */

function currentSnapshot(extra = {}) {
  const token = bestStateToken();
  const refreshToken = bestStateRefreshToken();
  const user = bestStateUser();
  const session = bestStateSession(user);

  const hasToken = Boolean(token);
  const hasRefreshToken = Boolean(refreshToken);
  const authenticated = Boolean(hasToken && user);
  const role = authenticated ? cleanRole(user.role || user.rol || user.roles) : null;
  const slug = authenticated ? extractSessionUserSlug(user) : "";
  const homePath = authenticated
    ? buildSessionUserHomePath(user)
    : AUTH_HOME.canonical;

  return {
    version: AUTH_SESSION_VERSION,

    authenticated,
    hasToken,
    hasRefreshToken,

    user: authenticated ? user : null,

    userSlug: slug || null,
    homePath,
    defaultHome: homePath,
    postLoginTarget: authenticated ? homePath : null,

    role,
    roles: authenticated ? [role] : [],

    isAdmin: role === "admin",
    isUser: role === "user",

    session: authenticated ? session : null,
    sessionId: authenticated ? session?.sessionId || session?.id || null : null,
    sessionUserId: authenticated ? session?.sessionUserId || session?.userId || null : null,

    ...extra,
  };
}

function publicUser(user = null) {
  const normalized = normalizeUser(user);

  if (!normalized) return null;

  return {
    id: normalized.id || normalized.userId || null,
    userId: normalized.userId || normalized.id || null,
    username: normalized.username || null,
    slug: extractSessionUserSlug(normalized) || null,
    displayName: normalized.displayName || normalized.name || normalized.username || null,
    role: normalized.role || normalized.rol || null,
    hasAvatar: Boolean(normalized.avatar || normalized.avatarUrl || normalized.picture),
  };
}

function publicSnapshot(snapshot = {}) {
  return {
    version: AUTH_SESSION_VERSION,

    authenticated: Boolean(snapshot.authenticated),
    hasToken: Boolean(snapshot.hasToken),
    hasRefreshToken: Boolean(snapshot.hasRefreshToken),

    token: null,
    accessToken: null,
    refreshToken: null,

    user: publicUser(snapshot.user),

    userSlug: snapshot.userSlug || null,
    homePath: snapshot.homePath || AUTH_HOME.canonical,
    defaultHome: snapshot.defaultHome || snapshot.homePath || AUTH_HOME.canonical,
    postLoginTarget: snapshot.postLoginTarget || null,

    role: snapshot.role || null,
    roles: Array.isArray(snapshot.roles) ? snapshot.roles : [],

    isAdmin: Boolean(snapshot.isAdmin),
    isUser: Boolean(snapshot.isUser),

    sessionId: snapshot.sessionId ? "***" : null,
    sessionUserId: snapshot.sessionUserId ? "***" : null,

    source: snapshot.source || "",
    eventMode: snapshot.eventMode || "",
    at: snapshot.at || nowIso(),
  };
}

/* =========================================================
   SESSION API
========================================================= */

export function applySession(payload = {}, options = {}) {
  const source = options.source || SOURCE;
  const eventMode = options.eventMode || "apply";

  const token =
    readTokenFromPayload(payload) ||
    (options.useCurrentToken === false ? "" : bestStateToken());

  const refreshToken =
    readRefreshTokenFromPayload(payload) ||
    (options.useCurrentRefreshToken === false ? "" : bestStateRefreshToken());

  const user =
    readUserFromPayload(payload) ||
    (options.useCurrentUser === false ? null : bestStateUser());

  const session =
    readSessionFromPayload(payload, user) ||
    (options.keepCurrentSession === false ? null : bestStateSession(user));

  const patch = buildStatePatch({
    token,
    refreshToken,
    user,
    session,
  });

  commitState(patch, {
    source: `${SOURCE}:apply`,
    silent: true,
    emit: false,
    forceUnauthenticated: !patch.authenticated,
  });

  /*
    Persistimos token/refresh/contexto auxiliar.
    No persistimos user como fuente de autenticación.
  */
  if (patch.hasToken) {
    persistPatch({
      token,
      refreshToken,
      session,
    });
  }

  syncUserUI();

  return buildSessionSnapshot({
    source,
    eventMode,
  });
}

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
      hasRefreshToken: false,

      role: null,
      rol: null,
      userRole: null,
      roles: [],

      isAdmin: false,
      isUser: false,

      userSlug: null,
      homePath: AUTH_HOME.canonical,
      defaultHome: AUTH_HOME.canonical,
      postLoginTarget: null,

      session: null,
      sessionData: null,
      sessionId: null,
      sessionUserId: null,

      username: null,
      avatar: null,
      avatarUrl: null,

      lastAuthSyncAt: nowIso(),
    },
    {
      source: `${SOURCE}:clear`,
      silent: true,
      emit: false,
      forceUnauthenticated: true,
    }
  );

  if (options.keepStorage !== true) {
    try {
      clearAuthStorage();
    } catch {
      // noop
    }
  }

  syncUserUI();

  return true;
}

export const clearSession = clearSessionLocal;

export function syncAuthState(options = {}) {
  const user = bestStateUser();

  const patch = buildStatePatch({
    token: bestStateToken(),
    refreshToken: bestStateRefreshToken(),
    user,
    session: bestStateSession(user),
  });

  commitState(patch, {
    source: options.source || `${SOURCE}:sync`,
    silent: true,
    emit: false,
    forceUnauthenticated: !patch.authenticated,
  });

  return buildSessionSnapshot({
    source: options.source || SOURCE,
    eventMode: "sync",
  });
}

export function buildSessionSnapshot(extra = {}) {
  return publicSnapshot(
    currentSnapshot({
      ...extra,
      at: nowIso(),
    })
  );
}

/* =========================================================
   AUTH HELPERS
========================================================= */

export function isAuthenticated() {
  return Boolean(bestStateToken() && bestStateUser());
}

export function hasToken() {
  return Boolean(bestStateToken());
}

export function hasRefreshToken() {
  return Boolean(bestStateRefreshToken());
}

export function getCurrentUser() {
  return isAuthenticated() ? bestStateUser() : null;
}

export function getCurrentToken() {
  return bestStateToken();
}

export function getCurrentRefreshToken() {
  return bestStateRefreshToken();
}

export function getCurrentSessionContext() {
  const user = bestStateUser();
  return bestStateSession(user);
}

export function getCurrentRole() {
  const user = getCurrentUser();

  return user ? cleanRole(readState().role || user.role || user.rol || user.roles) : "";
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

  if (current === "admin") return true;

  return roles
    .flat()
    .map(cleanRole)
    .filter((role) => VALID_ROLES.includes(role))
    .some((role) => role === current);
}

export function requireRole(...roles) {
  if (hasRole(...roles)) return true;

  const error = new Error("No tienes permisos para acceder a este recurso.");
  error.code = "AUTH_FORBIDDEN";
  error.status = 403;
  throw error;
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
  return buildSessionSnapshot({
    eventMode: "debug",
  });
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
    message:
      text(error?.data?.message, "") ||
      text(error?.response?.data?.message, "") ||
      text(error?.message, "") ||
      String(error || ""),
  };
}

export function exposeSessionDebugApi() {
  return {
    version: AUTH_SESSION_VERSION,

    snapshot: getSessionDebugSnapshot,
    getSnapshot: getSessionDebugSnapshot,

    isAuthenticated,
    hasToken,
    hasRefreshToken,

    getCurrentUser,
    getCurrentToken,
    getCurrentRefreshToken,
    getCurrentSessionContext,

    getCurrentRole,
    getCurrentRoles,

    getCurrentUserSlug,
    getCurrentUserHomePath,

    isCurrentUserAdmin,
    isCurrentUserClient,

    hasRole,
    requireRole,

    getAuthHeader,

    clear: clearSessionLocal,
    apply: applySession,
    sync: syncAuthState,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  AUTH_SESSION_VERSION,

  applySession,
  clearSessionLocal,
  clearSession,
  syncAuthState,

  buildSessionSnapshot,

  isAuthenticated,
  hasToken,
  hasRefreshToken,

  getCurrentUser,
  getCurrentToken,
  getCurrentRefreshToken,
  getCurrentSessionContext,

  getCurrentRole,
  getCurrentRoles,

  getCurrentUserSlug,
  getCurrentUserHomePath,

  isCurrentUserAdmin,
  isCurrentUserSupport,
  isCurrentUserManager,
  isCurrentUserClient,

  hasRole,
  requireRole,

  getAuthHeader,

  normalizeSessionSlug,
  extractSessionUserSlug,
  buildSessionUserHomePath,

  normalizeUser,

  getSessionDebugSnapshot,
  buildAuthErrorPayload,
  exposeSessionDebugApi,
};
