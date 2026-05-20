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
   - No arrastrar refresh/session de otro usuario.
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
  ROUTES,
  USER_HOME_PREFIX,
} from "../../core/config.js";

import {
  clearAuthStorage,
  getStoredAccessToken,
  getStoredRefreshToken,
  getStoredSessionContext,
  persistAuthStorage,
} from "./storage.js";

export const AUTH_SESSION_VERSION = "auth.session.v5";

const SOURCE = "auth.session";

const AUTH_HOME = Object.freeze({
  canonical: ROUTES.home || "/",
  userPrefix: USER_HOME_PREFIX || "/@",
});

const VALID_ROLES = Object.freeze(["admin", "user"]);

const SENSITIVE_USER_KEYS = Object.freeze([
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

  "secret",
  "secrets",
  "code",
  "codes",
  "backupCodes",

  "otp",
  "otpCode",
  "mfa",
  "twofa_secret",
  "twofaSecret",
  "totpSecret",
]);

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function cleanText(value = "", fallback = "") {
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

function redact(value = "") {
  return String(value || "")
    .replace(/([?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

/* =========================================================
   ROLE / TOKEN
========================================================= */

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = String(value || "").trim().toLowerCase();

  return VALID_ROLES.includes(role) ? role : "";
}

function cleanRole(value = "") {
  return normalizeRole(value) || "user";
}

function stripBearer(value = "") {
  return cleanText(value, "").replace(/^Bearer\s+/i, "");
}

function tokenOk(value = "") {
  const token = stripBearer(value);

  if (!token) return false;
  if (/\s/.test(token)) return false;
  if (token.length > 8192) return false;

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
  const token = stripBearer(value);
  return tokenOk(token) ? token : "";
}

/* =========================================================
   STATE
========================================================= */

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
    Object.assign(ensureState(), cleanPatch);
  } catch {
    // noop
  }

  return readState();
}

/* =========================================================
   SLUG / HOME
========================================================= */

export function normalizeSessionSlug(value = "") {
  if (isFunction(AppCore?.normalizeSlug)) {
    return AppCore.normalizeSlug(value);
  }

  const slug = cleanText(value, "")
    .replace(/^\/+/, "")
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();

  if (!slug) return "";

  return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
}

export function extractSessionUserSlug(user = null) {
  if (isFunction(AppCore?.extractUserSlug)) {
    return AppCore.extractUserSlug(user);
  }

  if (!isObject(user)) return "";

  return normalizeSessionSlug(
    user.slug ||
      user.lookup?.slug ||
      user.profile?.slug ||
      ""
  );
}

export function buildSessionUserHomePath(user = null) {
  if (isFunction(AppCore?.buildUserHomePath)) {
    return AppCore.buildUserHomePath(user);
  }

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
  if (!isObject(user)) return {};

  const output = { ...user };

  for (const key of SENSITIVE_USER_KEYS) {
    delete output[key];
  }

  return output;
}

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  const status = cleanText(user.status || user.estado, "").toLowerCase();

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
    cleanText(user.id, "") ||
      cleanText(user.userId, "") ||
      cleanText(user.username, "") ||
      cleanText(user.slug, "") ||
      cleanText(user.lookup?.slug, "")
  );
}

export function normalizeUser(user = null) {
  if (isFunction(AppCore?.normalizeUser)) {
    return AppCore.normalizeUser(user);
  }

  if (!isObject(user)) return null;
  if (userDisabled(user)) return null;

  const safeUser = removeSensitiveUserFields(user);

  if (!hasUserIdentity(safeUser)) return null;

  const id = cleanText(safeUser.userId || safeUser.id, "");
  const slug = extractSessionUserSlug(safeUser);

  const username = cleanText(
    safeUser.username ||
      safeUser.userName ||
      safeUser.user_name ||
      slug ||
      id,
    ""
  );

  const profile = isObject(safeUser.profile) ? safeUser.profile : {};

  const displayName = cleanText(
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

  const sessionId = cleanText(
    sessionNode?.sessionId ||
      sessionNode?.session_id ||
      sessionNode?.sid ||
      sessionNode?.id ||
      pick(nodes, ["sessionId", "session_id", "sid"]) ||
      "",
    ""
  );

  const userId = cleanText(
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

    const sessionId = cleanText(session.sessionId || session.session_id || session.id, "");
    const userId = cleanText(session.userId || session.user_id || session.sessionUserId || session.session_user_id, "");

    const expiresAt =
      session.expiresAt ||
      session.expires_at ||
      session.refreshExpiresAt ||
      session.refresh_expires_at ||
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

  const sessionUserId = cleanText(session.userId || session.sessionUserId, "");
  const userId = cleanText(user.userId || user.id, "");

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

function shouldKeepCurrentRefreshContext({
  explicitUser = null,
  user = null,
  session = null,
} = {}) {
  /*
    Si el payload trae usuario explícito, sólo conservamos contexto auxiliar
    si la sesión actual pertenece al mismo usuario. Así no se arrastra refresh
    de un login anterior.
  */
  if (!explicitUser) return true;
  if (!user) return false;
  if (!session) return false;

  return sameSessionUser(session, user);
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

  const role = authenticated
    ? cleanRole(safeUser.role || safeUser.rol || safeUser.roles)
    : null;

  const slug = authenticated ? extractSessionUserSlug(safeUser) : "";

  const homePath = authenticated
    ? buildSessionUserHomePath(safeUser)
    : AUTH_HOME.canonical;

  const sessionData = authenticated && session
    ? {
        sessionId: session.sessionId || session.id || null,
        id: session.sessionId || session.id || null,
        userId: session.userId || session.sessionUserId || safeUser.userId || safeUser.id || null,
        sessionUserId: session.sessionUserId || session.userId || safeUser.userId || safeUser.id || null,
        expiresAt: session.expiresAt || null,
        refreshExpiresAt: session.refreshExpiresAt || session.expiresAt || null,
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

    /*
      El refresh token no se mantiene como estado canónico.
      Sólo se lee/persiste vía storage.js para restore controlado.
    */
    hasRefreshToken,

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
    isUser: role === "user",

    userSlug: authenticated ? slug || null : null,
    homePath,
    defaultHome: homePath,
    postLoginTarget: authenticated ? homePath : null,

    session: sessionData,
    sessionData,
    sessionId: authenticated ? sessionData?.sessionId || null : null,
    sessionUserId: authenticated ? sessionData?.sessionUserId || null : null,

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

  const role = authenticated
    ? cleanRole(user.role || user.rol || user.roles)
    : null;

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

  const explicitToken = readTokenFromPayload(payload);
  const explicitRefreshToken = readRefreshTokenFromPayload(payload);
  const explicitUser = readUserFromPayload(payload);

  const token =
    explicitToken ||
    (options.useCurrentToken === false ? "" : bestStateToken());

  const user =
    explicitUser ||
    (options.useCurrentUser === false ? null : bestStateUser());

  const currentSession = options.keepCurrentSession === false
    ? null
    : bestStateSession(user);

  const explicitSession = readSessionFromPayload(payload, user);

  const canKeepCurrentRefreshContext = shouldKeepCurrentRefreshContext({
    explicitUser,
    user,
    session: explicitSession || currentSession,
  });

  const refreshToken =
    explicitRefreshToken ||
    (
      options.useCurrentRefreshToken === false || !canKeepCurrentRefreshContext
        ? ""
        : bestStateRefreshToken()
    );

  const session =
    explicitSession ||
    (
      canKeepCurrentRefreshContext
        ? currentSession
        : null
    );

  const patch = buildStatePatch({
    token,
    refreshToken,
    user,
    session,
  });

  commitState(patch, {
    source,
    silent: true,
    emit: false,

    /*
      Importante:
      token sin user debe conservar hasToken=true y authenticated=false.
      Sólo forzamos limpieza total si no hay token.
    */
    forceUnauthenticated: !patch.hasToken,
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

      hasRefreshToken: false,

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
      source: options.source || `${SOURCE}:clear`,
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
    forceUnauthenticated: !patch.hasToken,
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

  return user
    ? cleanRole(readState().role || user.role || user.rol || user.roles)
    : "";
}

export function getCurrentRoles() {
  const role = getCurrentRole();

  return role ? [role] : [];
}

export function isCurrentUserAdmin() {
  return getCurrentRole() === "admin";
}

export function hasRole(...roles) {
  if (!isAuthenticated()) return false;
  if (!roles.length) return true;

  const current = getCurrentRole();

  if (current === "admin") return true;

  return roles
    .flat()
    .map(normalizeRole)
    .filter(Boolean)
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
   ERROR / SNAPSHOT
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
          name: cleanText(error.name, "Error"),
          status: error.status || error.response?.status || error.data?.status || null,
          code: error.code || error.data?.code || error.response?.data?.code || null,
        }
      : null,

    message: redact(
      cleanText(error?.data?.message, "") ||
        cleanText(error?.response?.data?.message, "") ||
        cleanText(error?.message, "") ||
        String(error || "")
    ),
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

  hasRole,
  requireRole,

  getAuthHeader,

  normalizeSessionSlug,
  extractSessionUserSlug,
  buildSessionUserHomePath,

  normalizeUser,

  getSessionDebugSnapshot,
  buildAuthErrorPayload,
};
