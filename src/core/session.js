/* =========================================================
   Onion Support - Core Session
   Archivo: /src/core/session.js

   Responsabilidad:
   - Compat mínima de sesión para Core.
   - Estado en memoria delegado.
   - Config estática mínima desde core/config.js.
   - Auth estricta: token usable + user usable.
   - Token sin user = hasToken, pero NO authenticated.
   - User sin token = NO authenticated.
   - Caducar/rotar/quitar access token NO borra usuario salvo force/clear.
   - Usuario inválido por disabled/suspended/deleted/archived/blocked/revoked.
   - Roles únicos: admin / user.
   - Home visible de usuario: /@{user.slug}.
   - Theme simple.
   - Idioma base: es.
   - Sin storage.
   - Sin HTTP.
   - Sin Router.
   - Sin Toast.
   - Sin rutas legacy.
   - Sin 2FA/MFA/OTP funcional.
   - Sin secretos en snapshots.

   Regla crítica:
   - Cambiar/rotar/caducar access token NO equivale a logout.
   - setToken(null) NO borra sesión salvo clearSession/force explícito.
========================================================= */

import {
  config,
  ALLOWED_ROLES,
  SENSITIVE_QUERY_PARAMS,
  USER_HOME_PREFIX as CONFIG_USER_HOME_PREFIX,
  buildUserHomeRoute as configBuildUserHomeRoute,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "./config.js";

export const SESSION_VERSION = "core.session.v3";

export const SESSION_EVENTS = Object.freeze({
  routeChange: "app:route:change",
  publicPathChange: "app:public-path:change",
  userChange: "app:user:change",
  tokenChange: "app:token:change",
  authChange: "app:auth:change",
  sessionApplied: "app:session:applied",
  sessionLoaded: "app:session:loaded",
  sessionCleared: "app:session:cleared",
  themeChange: "app:theme:change",
  langChange: "app:lang:change",
  loadingChange: "app:loading:change",
  error: "app:error",
});

const DEFAULT_ROUTE = "/";
const USER_HOME_PREFIX = CONFIG_USER_HOME_PREFIX || "/@";
const DEFAULT_LANG = config?.defaultLang || "es";
const DEFAULT_THEME = config?.defaultTheme || "system";

const VALID_LANGS = new Set(
  (Array.isArray(config?.supportedLangs) && config.supportedLangs.length
    ? config.supportedLangs
    : ["es", "ca", "en"]
  ).map((lang) => String(lang).toLowerCase())
);

const VALID_THEMES = new Set(["dark", "light", "system"]);

const VALID_ROLES = new Set(
  (Array.isArray(ALLOWED_ROLES) && ALLOWED_ROLES.length
    ? ALLOWED_ROLES
    : ["admin", "user"]
  ).map((role) => String(role).toLowerCase())
);

const INVALID_USER_STATUSES = new Set([
  "disabled",
  "inactive",
  "suspended",
  "deleted",
  "archived",
  "revoked",
  "blocked",
  "banned",

  "desactivado",
  "inactivo",
  "suspendido",
  "eliminado",
  "archivado",
  "revocado",
  "bloqueado",
  "baneado",
  "baja",
]);

const INVALID_SESSION_STATUSES = new Set([
  "revoked",
  "invalid",
  "expired",
  "deleted",
  "archived",
  "disabled",

  "revocado",
  "invalido",
  "inválido",
  "expirado",
  "eliminado",
  "archivado",
  "desactivado",
]);

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "password_hash",
  "hash",
  "salt",
  "passwordmeta",

  "refreshtoken",
  "refresh_token",
  "refreshtokenhash",
  "refresh_token_hash",

  "idtoken",
  "id_token",

  "resettoken",
  "reset_token",
  "activationtoken",
  "activation_token",

  "authorization",
  "authheader",

  "secret",
  "secrets",
  "code",
  "codes",
  "backupcodes",
  "backup_codes",

  "otp",
  "otpcode",
  "totp",
  "mfa",
  "twofa_secret",
  "twofasecret",
  "totpsecret",

  "jwt",
  "apikey",
  "api_key",
  "sas",
  "connectionstring",
  "connection_string",

  "_rid",
  "_self",
  "_etag",
  "_attachments",
  "_ts",
  "_lsn",
  "_metadata",
]);

const SENSITIVE_QUERY_KEYS = new Set(
  SENSITIVE_QUERY_PARAMS.map((key) => String(key).toLowerCase())
);

const SENSITIVE_QUERY_PATTERN = buildSensitiveQueryPattern();

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function normalizeKey(value = "") {
  return text(value, "").toLowerCase();
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSensitiveQueryPattern() {
  const keys = [...SENSITIVE_QUERY_KEYS]
    .map(escapeRegExp)
    .filter(Boolean)
    .join("|");

  return keys
    ? new RegExp(`([?&#](?:${keys})=)([^&#\\s]+)`, "gi")
    : null;
}

function redact(value = "") {
  const clean = text(value, "");
  const redactedQuery = SENSITIVE_QUERY_PATTERN
    ? clean.replace(SENSITIVE_QUERY_PATTERN, "$1***")
    : clean;

  return redactedQuery
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function emit(events, name, payload = {}) {
  if (!name) return false;

  try {
    if (isFunction(events?.emit)) {
      events.emit(name, payload);
      return true;
    }

    if (isFunction(events?.dispatch)) {
      events.dispatch(name, payload);
      return true;
    }

    if (isFunction(events?.trigger)) {
      events.trigger(name, payload);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function commitState({ state, setState, patch = {}, options = {} } = {}) {
  if (!isObject(patch)) return false;

  if (isFunction(setState)) {
    try {
      setState(patch, options);
      return true;
    } catch {
      // fallback abajo
    }
  }

  if (isObject(state)) {
    try {
      Object.assign(state, patch);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

function normalizeError(error = null) {
  if (!error) return null;

  if (typeof error === "string") {
    return {
      name: "Error",
      message: redact(error),
      code: null,
      status: null,
    };
  }

  if (!isObject(error)) {
    return {
      name: "Error",
      message: redact(String(error)),
      code: null,
      status: null,
    };
  }

  return {
    name: text(error.name, "Error"),
    message: redact(error.message || error.detail || error.reason || String(error)),
    code: error.code || error.error || null,
    status: error.status || error.statusCode || error.response?.status || null,
  };
}

function sanitizeObject(value, depth = 0) {
  if (depth > 8) return null;

  if (typeof value === "string") {
    return redact(value);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 500)
      .map((item) => sanitizeObject(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (!isObject(value)) return value;

  const output = {};

  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(normalizeKey(key))) continue;

    const sanitized = sanitizeObject(child, depth + 1);

    if (sanitized !== undefined) {
      output[key] = sanitized;
    }
  }

  return output;
}

/* =========================================================
   PATHS
========================================================= */

function routePathFromInput(value = DEFAULT_ROUTE) {
  try {
    return configRoutePathFromUrlLike(value) || DEFAULT_ROUTE;
  } catch {
    return DEFAULT_ROUTE;
  }
}

function normalizePathname(pathname = DEFAULT_ROUTE) {
  try {
    return configNormalizeRoutePath(pathname) || DEFAULT_ROUTE;
  } catch {
    let value = text(pathname, DEFAULT_ROUTE)
      .split("#")[0]
      .split("?")[0]
      .replace(/\\/g, "/");

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    value = value.replace(/\/{2,}/g, "/");

    if (value.length > 1) {
      value = value.replace(/\/+$/g, "") || DEFAULT_ROUTE;
    }

    return value || DEFAULT_ROUTE;
  }
}

function normalizeSearch(search = "") {
  const raw = text(search, "");

  if (!raw || raw === "?") return "";

  const normalized = raw.startsWith("?")
    ? raw
    : `?${raw.replace(/^\?+/, "")}`;

  try {
    const params = new URLSearchParams(normalized);

    for (const key of [...params.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(normalizeKey(key))) {
        params.delete(key);
      }
    }

    const output = params.toString();

    return output ? `?${output}` : "";
  } catch {
    return "";
  }
}

function normalizeHash(hash = "") {
  const raw = text(hash, "");

  if (!raw || raw === "#") return "";

  const normalized = raw.startsWith("#")
    ? raw
    : `#${raw.replace(/^#+/, "")}`;

  const body = normalized.slice(1);

  if (!body || /[\r\n\t\\]/.test(body)) return "";

  const queryIndex = body.indexOf("?");

  if (queryIndex >= 0) {
    const hashPath = body.slice(0, queryIndex);
    const cleanQuery = normalizeSearch(`?${body.slice(queryIndex + 1)}`);

    return cleanQuery ? `#${hashPath}${cleanQuery}` : `#${hashPath}`;
  }

  if (/^[^/?#=&]+=/i.test(body)) {
    const cleanQuery = normalizeSearch(`?${body}`);
    return cleanQuery ? `#${cleanQuery.slice(1)}` : "";
  }

  return redact(normalized);
}

function splitPath(path = DEFAULT_ROUTE) {
  let raw = routePathFromInput(path);
  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || DEFAULT_ROUTE;
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || DEFAULT_ROUTE;
  }

  return {
    pathname: normalizePathname(pathname),
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
  };
}

function normalizePublicPath(value = DEFAULT_ROUTE) {
  const parts = splitPath(value);
  return `${parts.pathname}${parts.search}${parts.hash}` || DEFAULT_ROUTE;
}

function normalizeCanonicalPath(value = DEFAULT_ROUTE) {
  return normalizePathname(normalizePublicPath(value));
}

/* =========================================================
   LANG / THEME
========================================================= */

function normalizeLang(value = DEFAULT_LANG) {
  const lang = text(value, DEFAULT_LANG).toLowerCase();
  return VALID_LANGS.has(lang) ? lang : DEFAULT_LANG;
}

function normalizeTheme(value = DEFAULT_THEME) {
  const theme = text(value, DEFAULT_THEME).toLowerCase();
  return VALID_THEMES.has(theme) ? theme : DEFAULT_THEME;
}

function themeMetaColor(theme = DEFAULT_THEME) {
  return normalizeTheme(theme) === "light" ? "#ffffff" : "#0a0c11";
}

/* =========================================================
   AUTH NORMALIZATION
========================================================= */

function stripBearer(token = "") {
  return text(token, "").replace(/^Bearer\s+/i, "");
}

function validToken(token = "") {
  const clean = stripBearer(token);

  if (!clean) return false;
  if (/\s/.test(clean)) return false;
  if (clean.length > 8192) return false;

  return ![
    "null",
    "undefined",
    "false",
    "true",
    "[object object]",
    "{}",
    "[]",
  ].includes(clean.toLowerCase());
}

function cleanToken(token = "") {
  const clean = stripBearer(token);
  return validToken(clean) ? clean : null;
}

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = text(value, "").toLowerCase();

  return VALID_ROLES.has(role) ? role : "";
}

function cleanRole(value = "") {
  return normalizeRole(value) || "user";
}

function looksLikeUser(value = null) {
  if (!isObject(value)) return false;

  return Boolean(
    text(value.id, "") ||
      text(value.userId, "") ||
      text(value.uid, "") ||
      text(value.sub, "") ||
      text(value.username, "") ||
      text(value.slug, "") ||
      text(value.lookup?.slug, "") ||
      text(value.role, "") ||
      text(value.rol, "") ||
      Array.isArray(value.roles)
  );
}

function userPayload(value = null) {
  if (!isObject(value)) return null;
  if (looksLikeUser(value)) return value;

  return (
    value.user ||
    value.usuario ||
    value.me ||
    value.account ||
    value.profile ||
    value
  );
}

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  const status = normalizeKey(
    user.status ||
      user.estado ||
      user.state ||
      ""
  );

  return Boolean(
    user.disabled === true ||
      user.suspended === true ||
      user.deleted === true ||
      user.archived === true ||
      user.revoked === true ||
      user.blocked === true ||
      user.banned === true ||
      user.active === false ||
      user.enabled === false ||
      INVALID_USER_STATUSES.has(status)
  );
}

function hasUserIdentity(user = null) {
  if (!isObject(user)) return false;

  return Boolean(
    text(user.id, "") ||
      text(user.userId, "") ||
      text(user.uid, "") ||
      text(user.sub, "") ||
      text(user.username, "") ||
      text(user.slug, "") ||
      text(user.lookup?.slug, "")
  );
}

function normalizeSlug(value = "") {
  try {
    return configNormalizeUserSlug(value) || "";
  } catch {
    const slug = text(value, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^\/+/, "")
      .replace(/^@+/, "")
      .split(/[/?#]/)[0]
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .toLowerCase();

    if (!slug) return "";

    return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
  }
}

function extractUserSlug(user = null) {
  if (!isObject(user)) return "";

  return normalizeSlug(
    user.slug ||
      user.lookup?.slug ||
      user.profile?.slug ||
      user.routing?.slug ||
      user.username ||
      user.userName ||
      user.user_name ||
      user.usernameLower ||
      user.username_lower ||
      user.userId ||
      user.id ||
      ""
  );
}

function buildUserHomePath(user = null) {
  const slug = extractUserSlug(user);

  try {
    return configBuildUserHomeRoute(slug) || DEFAULT_ROUTE;
  } catch {
    return slug ? `${USER_HOME_PREFIX}${slug}` : DEFAULT_ROUTE;
  }
}

function userAvatarUrl(user = null) {
  if (!isObject(user)) return "";

  return text(
    user.avatarUrl ||
      user.avatar ||
      user.picture ||
      user.pictureUrl ||
      user.photoUrl ||
      user.photoURL ||
      user.imageUrl ||
      user.image ||
      user.profile?.avatarUrl ||
      user.profile?.avatar ||
      user.profile?.picture ||
      "",
    ""
  );
}

function normalizeUser(value = null) {
  const source = userPayload(value);

  if (!isObject(source)) return null;
  if (userDisabled(source)) return null;
  if (!hasUserIdentity(source)) return null;

  const safeUser = sanitizeObject(source);

  if (!isObject(safeUser)) return null;

  const id = text(
    safeUser.userId ||
      safeUser.id ||
      safeUser.uid ||
      safeUser.sub ||
      "",
    ""
  );

  const email = text(safeUser.email, "") || null;
  const slug = extractUserSlug(safeUser);

  const username = text(
    safeUser.username ||
      safeUser.userName ||
      safeUser.user_name ||
      safeUser.usernameLower ||
      safeUser.username_lower ||
      slug ||
      id,
    ""
  );

  if (!id && !username) return null;

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
  const avatar = userAvatarUrl(safeUser);

  return {
    ...safeUser,

    id: id || null,
    userId: safeUser.userId || id || null,
    uid: safeUser.uid || id || null,
    sub: safeUser.sub || id || null,

    username: username || null,
    usernameLower: username ? username.toLowerCase() : null,
    slug: slug || username || null,

    name: safeUser.name || displayName,
    nombre: safeUser.nombre || displayName,
    fullName: safeUser.fullName || displayName,
    displayName,

    email,
    emailLower: email ? email.toLowerCase() : null,

    role,
    rol: role,
    userRole: role,
    roles: [role],

    hasAvatar: Boolean(safeUser.hasAvatar || avatar),
    avatar: avatar || safeUser.avatar || null,
    avatarUrl: avatar || safeUser.avatarUrl || null,
    photoUrl: safeUser.photoUrl || safeUser.photoURL || avatar || null,
    picture: safeUser.picture || safeUser.pictureUrl || avatar || null,
    avatarUpdatedAt: safeUser.avatarUpdatedAt || null,

    active: true,
    enabled: true,
    disabled: false,
    suspended: false,
    deleted: false,
    archived: false,
    blocked: false,
    banned: false,
    revoked: false,

    isAdmin: role === "admin",
    isUser: role === "user",
  };
}

/* =========================================================
   SESSION CONTEXT
========================================================= */

function normalizeSessionContext(value = null, user = null) {
  if (!isObject(value)) return null;

  const sessionId = text(
    value.sessionId ||
      value.session_id ||
      value.sid ||
      value.id ||
      "",
    ""
  );

  const userId = text(
    value.sessionUserId ||
      value.session_user_id ||
      value.userId ||
      value.user_id ||
      value.uid ||
      user?.userId ||
      user?.id ||
      user?.uid ||
      user?.sub ||
      "",
    ""
  );

  const expiresAt =
    value.expiresAt ||
    value.expires_at ||
    value.refreshExpiresAt ||
    value.refresh_expires_at ||
    null;

  if (!sessionId && !userId && !expiresAt) return null;

  return {
    sessionId: sessionId || null,
    id: sessionId || null,
    sid: sessionId || null,

    userId: userId || null,
    sessionUserId: userId || null,

    expiresAt,
    refreshExpiresAt: value.refreshExpiresAt || value.refresh_expires_at || expiresAt || null,

    persistent: value.persistent === true,
    restoreOnBoot: value.restoreOnBoot === true,
    rollingRefresh: value.rollingRefresh === true,
    expiryEnforced: value.expiryEnforced === true,

    revoked: value.revoked === true,
    active: value.active !== false,
    status: value.status || value.estado || "active",
  };
}

function sameSessionUser(session = null, user = null) {
  if (!session || !user) return false;

  const sessionUserId = text(session.userId || session.sessionUserId, "");
  const userId = text(
    user.userId ||
      user.id ||
      user.uid ||
      user.sub ||
      "",
    ""
  );

  if (!sessionUserId || !userId) return true;

  return sessionUserId === userId;
}

function sessionRevoked(session = null) {
  if (!isObject(session)) return false;

  const status = normalizeKey(session.status || session.estado || "");

  return Boolean(
    session.revoked === true ||
      session.active === false ||
      INVALID_SESSION_STATUSES.has(status)
  );
}

/* =========================================================
   AUTH PATCH
========================================================= */

function readTokenFrom(source = {}) {
  return (
    source.token ||
    source.accessToken ||
    source.access_token ||
    null
  );
}

function readUserFrom(source = {}) {
  return (
    source.user ||
    source.currentUser ||
    source.authUser ||
    source.sessionUser ||
    null
  );
}

function clearAuthPatch() {
  return {
    token: null,
    accessToken: null,
    access_token: null,

    user: null,
    currentUser: null,
    authUser: null,
    sessionUser: null,

    hasToken: false,
    hasRefreshToken: false,
    authenticated: false,

    userSlug: null,
    homePath: DEFAULT_ROUTE,
    defaultHome: DEFAULT_ROUTE,
    postLoginTarget: null,

    role: null,
    rol: null,
    userRole: null,
    roles: [],

    username: null,

    session: null,
    sessionData: null,
    sessionId: null,
    sessionUserId: null,

    hasAvatar: false,
    avatar: null,
    avatarUrl: null,
    photoUrl: null,
    picture: null,
    avatarUpdatedAt: null,

    isAdmin: false,
    isUser: false,
    isSupport: false,
    isManager: false,
    isClient: false,
  };
}

function sessionSourceFrom(source = {}) {
  return (
    source.session ||
    source.sessionData ||
    (
      source.sessionId || source.sessionUserId
        ? {
            sessionId: source.sessionId,
            sessionUserId: source.sessionUserId,
          }
        : null
    )
  );
}

function unauthenticatedUserPatch(source = {}) {
  const user = normalizeUser(readUserFrom(source));
  const hasRefreshToken = source.hasRefreshToken === true;

  if (!user) {
    return {
      ...clearAuthPatch(),
      hasRefreshToken,
    };
  }

  const slug = extractUserSlug(user);
  const homePath = buildUserHomePath(user);
  const avatar = userAvatarUrl(user);
  const session = normalizeSessionContext(sessionSourceFrom(source), user);

  if (sessionRevoked(session)) {
    return clearAuthPatch();
  }

  const validSession = session && sameSessionUser(session, user)
    ? session
    : null;

  return {
    token: null,
    accessToken: null,
    access_token: null,

    user,
    currentUser: user,
    authUser: user,
    sessionUser: user,

    hasToken: false,
    hasRefreshToken,
    authenticated: false,

    userSlug: slug || null,
    homePath,
    defaultHome: homePath,
    postLoginTarget: homePath,

    role: null,
    rol: null,
    userRole: null,
    roles: [],

    username: user.username || null,

    session: validSession,
    sessionData: validSession,
    sessionId: validSession?.sessionId || null,
    sessionUserId: validSession?.sessionUserId || validSession?.userId || null,

    hasAvatar: Boolean(user.hasAvatar || avatar),
    avatar: avatar || null,
    avatarUrl: avatar || null,
    photoUrl: user.photoUrl || avatar || null,
    picture: user.picture || avatar || null,
    avatarUpdatedAt: user.avatarUpdatedAt || null,

    isAdmin: false,
    isUser: false,
    isSupport: false,
    isManager: false,
    isClient: false,
  };
}

function authPatch(source = {}, options = {}) {
  if (options.forceUnauthenticated === true || options.clearSession === true) {
    return clearAuthPatch();
  }

  const token = cleanToken(readTokenFrom(source));

  if (!token) {
    return unauthenticatedUserPatch(source);
  }

  const user = normalizeUser(readUserFrom(source));

  if (!user) {
    return {
      ...clearAuthPatch(),

      token,
      accessToken: token,
      access_token: token,

      hasToken: true,
      hasRefreshToken: source.hasRefreshToken === true,
      authenticated: false,
    };
  }

  const role = cleanRole(user.role || user.rol || user.roles);
  const slug = extractUserSlug(user);
  const homePath = buildUserHomePath(user);
  const avatar = userAvatarUrl(user);
  const session = normalizeSessionContext(sessionSourceFrom(source), user);

  if (sessionRevoked(session)) {
    return clearAuthPatch();
  }

  const validSession = session && sameSessionUser(session, user)
    ? session
    : null;

  return {
    token,
    accessToken: token,
    access_token: token,

    user,
    currentUser: user,
    authUser: user,
    sessionUser: user,

    hasToken: true,
    hasRefreshToken: source.hasRefreshToken === true,
    authenticated: true,

    userSlug: slug || null,
    homePath,
    defaultHome: homePath,
    postLoginTarget: homePath,

    role,
    rol: role,
    userRole: role,
    roles: [role],

    username: user.username || null,

    session: validSession,
    sessionData: validSession,
    sessionId: validSession?.sessionId || null,
    sessionUserId: validSession?.sessionUserId || validSession?.userId || null,

    hasAvatar: Boolean(user.hasAvatar || avatar),
    avatar: avatar || null,
    avatarUrl: avatar || null,
    photoUrl: user.photoUrl || avatar || null,
    picture: user.picture || avatar || null,
    avatarUpdatedAt: user.avatarUpdatedAt || null,

    isAdmin: role === "admin",
    isUser: role === "user",
    isSupport: false,
    isManager: false,
    isClient: false,
  };
}

/* =========================================================
   PAYLOAD PICKERS
========================================================= */

function nestedPayloads(payload = {}) {
  if (!isObject(payload)) return [];

  return [
    payload,
    isObject(payload.data) ? payload.data : null,
    isObject(payload.payload) ? payload.payload : null,
    isObject(payload.result) ? payload.result : null,
    isObject(payload.auth) ? payload.auth : null,
    isObject(payload.session) ? payload.session : null,
    isObject(payload.sessionData) ? payload.sessionData : null,
  ].filter(Boolean);
}

function pick(payload = {}, names = []) {
  for (const node of nestedPayloads(payload)) {
    for (const name of names) {
      const value =
        node?.[name] ??
        node?.session?.[name] ??
        node?.sessionData?.[name];

      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  }

  return null;
}

function pickSession(payload = {}) {
  for (const node of nestedPayloads(payload)) {
    const session =
      (isObject(node.session) ? node.session : null) ||
      (isObject(node.sessionData) ? node.sessionData : null);

    if (session) return session;
  }

  return null;
}

function pickUser(payload = {}) {
  return (
    pick(payload, ["user", "usuario", "me", "account", "profile"]) ||
    (normalizeUser(payload) ? payload : null)
  );
}

function pickHasRefresh(payload = {}) {
  return Boolean(
    pick(payload, [
      "hasRefreshToken",
      "refreshAvailable",
      "canRefresh",
      "persistent",
      "restoreOnBoot",
      "refreshToken",
      "refresh_token",
    ])
  );
}

/* =========================================================
   SNAPSHOT
========================================================= */

function safeSnapshotUser(user = null) {
  const normalized = normalizeUser(user);

  if (!normalized) return null;

  return {
    id: normalized.id || normalized.userId || null,
    userId: normalized.userId || normalized.id || null,
    username: normalized.username || null,
    slug: normalized.slug || null,
    displayName: normalized.displayName || normalized.name || normalized.username || null,
    role: normalized.role || null,
    hasAvatar: Boolean(normalized.hasAvatar || userAvatarUrl(normalized)),
  };
}

function sessionSnapshot(state = {}, cause = "session") {
  const token = cleanToken(readTokenFrom(state));
  const user = normalizeUser(readUserFrom(state));
  const authenticated = Boolean(token && user);
  const role = authenticated ? cleanRole(state.role || user.role || user.rol || user.roles) : null;

  return {
    version: SESSION_VERSION,
    cause,

    authenticated,
    hasToken: Boolean(token),
    hasRefreshToken: Boolean(state.hasRefreshToken),

    user: authenticated ? safeSnapshotUser(user) : null,

    userSlug: user ? extractUserSlug(user) || null : null,
    homePath: user ? buildUserHomePath(user) : DEFAULT_ROUTE,

    role,
    roles: authenticated && role ? [role] : [],
    username: user ? user.username || null : null,

    isAdmin: authenticated && role === "admin",
    isUser: authenticated && role === "user",

    hasSessionContext: Boolean(state.session || state.sessionData || state.sessionId || state.sessionUserId),
    sessionId: state.sessionId ? "***" : null,
    sessionUserId: state.sessionUserId ? "***" : null,

    route: redact(state.route || DEFAULT_ROUTE),
    canonicalPath: redact(state.canonicalPath || state.route || DEFAULT_ROUTE),
    publicPath: redact(state.publicPath || state.route || DEFAULT_ROUTE),

    theme: normalizeTheme(state.theme || DEFAULT_THEME),
    lang: normalizeLang(state.lang || state.language || state.locale || DEFAULT_LANG),

    hasError: Boolean(state.hasError),
    error: normalizeError(state.error),
  };
}

/* =========================================================
   ROUTE
========================================================= */

export function setRoute({ state, setState, events, route = DEFAULT_ROUTE, options = {} } = {}) {
  const nextRoute = normalizeCanonicalPath(route);
  const previousRoute = state?.route || DEFAULT_ROUTE;

  commitState({
    state,
    setState,
    patch: {
      route: nextRoute,
      canonicalPath: nextRoute,
    },
    options: {
      ...options,
      source: options.source || "core-session:setRoute",
    },
  });

  if (previousRoute !== nextRoute) {
    emit(events, SESSION_EVENTS.routeChange, {
      route: nextRoute,
      previousRoute,
    });
  }

  return nextRoute;
}

export function setPublicPath({ state, setState, events, path = DEFAULT_ROUTE, options = {} } = {}) {
  const nextPublicPath = normalizePublicPath(path);
  const nextRoute = normalizeCanonicalPath(nextPublicPath);
  const previousPublicPath = state?.publicPath || DEFAULT_ROUTE;

  commitState({
    state,
    setState,
    patch: {
      publicPath: nextPublicPath,
      route: nextRoute,
      canonicalPath: nextRoute,
    },
    options: {
      ...options,
      source: options.source || "core-session:setPublicPath",
    },
  });

  if (previousPublicPath !== nextPublicPath) {
    emit(events, SESSION_EVENTS.publicPathChange, {
      publicPath: nextPublicPath,
      previousPublicPath,
      route: nextRoute,
    });
  }

  return nextPublicPath;
}

/* =========================================================
   USER / TOKEN
========================================================= */

export function setUser({ state, events, setState, user = null, options = {} } = {}) {
  const patch = authPatch({
    ...state,
    user,
    currentUser: user,
    authUser: user,
    sessionUser: user,
  }, options);

  commitState({
    state,
    setState,
    patch,
    options: {
      ...options,
      source: options.source || "core-session:setUser",
    },
  });

  emit(events, SESSION_EVENTS.userChange, sessionSnapshot(state, "setUser"));
  emit(events, SESSION_EVENTS.authChange, sessionSnapshot(state, "setUser"));

  return state?.user || patch.user || null;
}

export function setToken({ state, events, setState, token = null, options = {} } = {}) {
  const nextToken = cleanToken(token);

  if (!nextToken) {
    if (options.clearSession === true || options.forceUnauthenticated === true) {
      return clearSession({
        state,
        events,
        setState,
        options: {
          ...options,
          source: options.source || "core-session:setToken:clear",
        },
      });
    }

    commitState({
      state,
      setState,
      patch: authPatch({
        ...state,
        token: null,
        accessToken: null,
        access_token: null,
      }, options),
      options: {
        ...options,
        source: options.source || "core-session:setToken:empty",
      },
    });

    emit(events, SESSION_EVENTS.tokenChange, {
      hasToken: false,
      authenticated: false,
      ignored: false,
      reason: "empty-token",
    });

    emit(events, SESSION_EVENTS.authChange, sessionSnapshot(state, "setToken:empty"));

    return null;
  }

  const patch = authPatch({
    ...state,
    token: nextToken,
    accessToken: nextToken,
    access_token: nextToken,
  }, options);

  commitState({
    state,
    setState,
    patch,
    options: {
      ...options,
      source: options.source || "core-session:setToken",
    },
  });

  emit(events, SESSION_EVENTS.tokenChange, {
    hasToken: Boolean(patch.hasToken),
    authenticated: Boolean(patch.authenticated),
  });

  emit(events, SESSION_EVENTS.authChange, sessionSnapshot(state, "setToken"));

  return state?.token || patch.token || null;
}

/* =========================================================
   APPLY / CLEAR SESSION
========================================================= */

export function applySession(input = {}) {
  const { state, events, setState } = input || {};

  const token = pick(input, ["token", "accessToken", "access_token"]);
  const user = pickUser(input);
  const normalizedUser = normalizeUser(user);
  const session = normalizeSessionContext(pickSession(input), normalizedUser);

  const patch = authPatch({
    ...state,

    token,
    accessToken: token,
    access_token: token,

    user,
    currentUser: user,
    authUser: user,
    sessionUser: user,

    session,
    sessionData: session,

    hasRefreshToken: pickHasRefresh(input),
  }, input.options || {});

  if (input.route || input.publicPath) {
    const visible = normalizePublicPath(input.publicPath || input.route || DEFAULT_ROUTE);

    patch.publicPath = visible;
    patch.route = normalizeCanonicalPath(visible);
    patch.canonicalPath = patch.route;
  }

  commitState({
    state,
    setState,
    patch,
    options: {
      ...(input.options || {}),
      source: input.options?.source || "core-session:applySession",
    },
  });

  const snapshot = sessionSnapshot(state, "applySession");

  emit(events, SESSION_EVENTS.sessionApplied, snapshot);
  emit(events, SESSION_EVENTS.authChange, snapshot);

  return snapshot;
}

export function clearSession({ state, events, setState, options = {} } = {}) {
  const patch = clearAuthPatch();

  commitState({
    state,
    setState,
    patch,
    options: {
      ...options,
      source: options.source || "core-session:clearSession",
      forceUnauthenticated: true,
    },
  });

  const snapshot = sessionSnapshot(state, "clearSession");

  emit(events, SESSION_EVENTS.sessionCleared, snapshot);
  emit(events, SESSION_EVENTS.authChange, snapshot);

  return true;
}

/* =========================================================
   LOAD
========================================================= */

export function loadPreferences({ state, setState } = {}) {
  const lang = isBrowser()
    ? normalizeLang(document.documentElement.lang || DEFAULT_LANG)
    : DEFAULT_LANG;

  const theme = isBrowser()
    ? normalizeTheme(document.documentElement.dataset.theme || DEFAULT_THEME)
    : DEFAULT_THEME;

  commitState({
    state,
    setState,
    patch: {
      lang,
      language: lang,
      locale: lang,
      theme,
    },
    options: {
      source: "core-session:loadPreferences",
    },
  });

  return {
    lang: state?.lang || lang,
    theme: state?.theme || theme,
  };
}

export function loadSession({ state, events, setState } = {}) {
  const patch = authPatch({
    ...state,
  });

  commitState({
    state,
    setState,
    patch,
    options: {
      source: "core-session:loadSession",
    },
  });

  const snapshot = sessionSnapshot(state, "loadSession");

  emit(events, SESSION_EVENTS.sessionLoaded, snapshot);
  emit(events, SESSION_EVENTS.authChange, snapshot);

  return state;
}

/* =========================================================
   UI SETTERS
========================================================= */

export function syncThemeMetaColor({ theme = DEFAULT_THEME } = {}) {
  if (!isBrowser()) return false;

  const color = themeMetaColor(theme);
  let changed = false;

  try {
    document
      .querySelectorAll("meta[name='theme-color']")
      .forEach((meta) => {
        const media = meta.getAttribute("media") || "";

        if (!media) {
          meta.setAttribute("content", color);
          changed = true;
        }
      });
  } catch {
    return false;
  }

  return changed;
}

export function setTheme({ setState, events, theme = DEFAULT_THEME } = {}) {
  const value = normalizeTheme(theme);

  setState?.(
    {
      theme: value,
    },
    {
      source: "core-session:setTheme",
    }
  );

  if (isBrowser()) {
    document.documentElement.dataset.theme = value;
  }

  syncThemeMetaColor({ theme: value });

  emit(events, SESSION_EVENTS.themeChange, {
    theme: value,
  });

  return value;
}

export function setLang({ setState, events, lang = DEFAULT_LANG } = {}) {
  const value = normalizeLang(lang);

  setState?.(
    {
      lang: value,
      language: value,
      locale: value,
    },
    {
      source: "core-session:setLang",
    }
  );

  if (isBrowser()) {
    document.documentElement.lang = value;
    document.documentElement.dataset.locale = value;
  }

  emit(events, SESSION_EVENTS.langChange, {
    lang: value,
    language: value,
    locale: value,
  });

  return value;
}

export function setSidebarOpen({ setState, value = false } = {}) {
  const open = Boolean(value);

  setState?.(
    {
      sidebarOpen: open,
    },
    {
      source: "core-session:setSidebarOpen",
    }
  );

  return open;
}

export function setLoading({ setState, events, value = false } = {}) {
  const loading = Boolean(value);

  setState?.(
    {
      loading,
    },
    {
      source: "core-session:setLoading",
    }
  );

  emit(events, SESSION_EVENTS.loadingChange, {
    loading,
  });

  return loading;
}

export function setError({ events, setState, error = null } = {}) {
  const normalized = normalizeError(error);

  setState?.(
    {
      error: normalized,
      lastError: normalized,
      hasError: Boolean(normalized),
    },
    {
      source: "core-session:setError",
    }
  );

  emit(events, SESSION_EVENTS.error, {
    error: normalized,
  });

  return normalized;
}

/* =========================================================
   BASE UI / SNAPSHOT
========================================================= */

export function syncBaseUI({ setDocumentTitle, syncUserUI } = {}) {
  try {
    setDocumentTitle?.("Onion Support");
  } catch {
    // noop
  }

  try {
    syncUserUI?.();
  } catch {
    // noop
  }

  return true;
}

export function getSessionDebugSnapshot(state = {}) {
  return sessionSnapshot(state, "debug");
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SESSION_VERSION,
  SESSION_EVENTS,

  setRoute,
  setPublicPath,

  setUser,
  setToken,

  applySession,
  clearSession,

  loadPreferences,
  loadSession,

  syncThemeMetaColor,

  setTheme,
  setLang,
  setSidebarOpen,
  setLoading,
  setError,

  syncBaseUI,
  getSessionDebugSnapshot,
};
