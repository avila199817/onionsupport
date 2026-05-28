/* =========================================================
   Onion Support - Core State
   Archivo: /src/core/state.js

   Responsabilidad:
   - Estado mínimo en memoria.
   - Config estática mínima desde core/config.js.
   - Auth estricta: token usable + user usable.
   - Token sin user = hasToken, pero NO authenticated.
   - User sin token = NO authenticated.
   - Caducar/rotar/quitar access token NO borra usuario salvo force/clear.
   - Usuario inválido por disabled/suspended/deleted/archived/blocked/revoked.
   - Roles únicos: admin / user.
   - Idioma base: es.
   - Sin storage.
   - Sin HTTP.
   - Sin Router.
   - Sin Toast.
   - Sin network listeners.
   - Sin rutas técnicas.
   - Sin 2FA/MFA/OTP funcional.
   - Sin secretos en snapshots.
========================================================= */

import {
  config,
  ALLOWED_ROLES,
  SENSITIVE_QUERY_PARAMS,
  USER_HOME_PREFIX,
  buildUserHomeRoute as configBuildUserHomeRoute,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "./config.js";

export const STATE_VERSION = "core.state.v3";

const DEFAULT_ROUTE = "/";
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

function clone(value) {
  if (value === undefined) return undefined;

  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {
    // fallback abajo
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function nowIso() {
  return new Date().toISOString();
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

function cleanPath(path = DEFAULT_ROUTE) {
  return splitPath(path).pathname || DEFAULT_ROUTE;
}

function publicPath(path = DEFAULT_ROUTE) {
  const parts = splitPath(path);

  return `${parts.pathname}${parts.search}${parts.hash}` || DEFAULT_ROUTE;
}

function currentPublicPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  return publicPath(
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  );
}

function currentCanonicalPath() {
  return cleanPath(currentPublicPath());
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

function readUserFrom(source = {}) {
  return (
    source.user ||
    source.currentUser ||
    source.authUser ||
    source.sessionUser ||
    null
  );
}

function readTokenFrom(source = {}) {
  return (
    source.token ||
    source.accessToken ||
    source.access_token ||
    null
  );
}

export function computeAuthenticated(user = null, token = null) {
  return Boolean(cleanToken(token) && normalizeUser(user));
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
   PATCH NORMALIZATION
========================================================= */

function normalizeLang(value = DEFAULT_LANG) {
  const lang = text(value, DEFAULT_LANG).toLowerCase();
  return VALID_LANGS.has(lang) ? lang : DEFAULT_LANG;
}

function normalizeTheme(value = DEFAULT_THEME) {
  const theme = text(value, DEFAULT_THEME).toLowerCase();
  return VALID_THEMES.has(theme) ? theme : DEFAULT_THEME;
}

function isSensitivePatchKey(key = "") {
  return SENSITIVE_KEYS.has(normalizeKey(key));
}

function normalizePatch(state, patch = {}, options = {}) {
  const source = isObject(patch) ? patch : {};
  const next = {};

  for (const [key, value] of Object.entries(source)) {
    if (isSensitivePatchKey(key)) continue;

    if (key === "token" || key === "accessToken" || key === "access_token") {
      const token = cleanToken(value);

      next.token = token;
      next.accessToken = token;
      next.access_token = token;
      continue;
    }

    if (
      key === "user" ||
      key === "currentUser" ||
      key === "authUser" ||
      key === "sessionUser"
    ) {
      const user = value ? normalizeUser(value) : null;

      next.user = user;
      next.currentUser = user;
      next.authUser = user;
      next.sessionUser = user;
      continue;
    }

    if (key === "role" || key === "rol" || key === "userRole") {
      const role = normalizeRole(value) || null;

      next.role = role;
      next.rol = role;
      next.userRole = role;
      next.roles = role ? [role] : [];
      continue;
    }

    if (key === "roles") {
      const role = normalizeRole(value) || null;

      next.role = role;
      next.rol = role;
      next.userRole = role;
      next.roles = role ? [role] : [];
      continue;
    }

    if (key === "route" || key === "canonicalPath") {
      const route = cleanPath(value || state.route || DEFAULT_ROUTE);
      next.route = route;
      next.canonicalPath = route;
      continue;
    }

    if (key === "publicPath") {
      const visible = publicPath(value || DEFAULT_ROUTE);
      next.publicPath = visible;
      next.route = cleanPath(visible);
      next.canonicalPath = next.route;
      continue;
    }

    if (key === "lang" || key === "language" || key === "locale") {
      const lang = normalizeLang(value);
      next.lang = lang;
      next.language = lang;
      next.locale = lang;
      continue;
    }

    if (key === "theme") {
      next.theme = normalizeTheme(value);
      continue;
    }

    if (key === "hasRefreshToken") {
      next.hasRefreshToken = value === true;
      continue;
    }

    if (key === "session" || key === "sessionData") {
      const currentUser =
        next.user ||
        next.currentUser ||
        state.user ||
        state.currentUser ||
        null;

      const session = normalizeSessionContext(value, currentUser);

      next.session = session;
      next.sessionData = session;
      next.sessionId = session?.sessionId || null;
      next.sessionUserId = session?.sessionUserId || session?.userId || null;
      continue;
    }

    if (key === "sessionId") {
      next.sessionId = text(value, "") || null;
      continue;
    }

    if (key === "sessionUserId") {
      next.sessionUserId = text(value, "") || null;
      continue;
    }

    if (key === "sidebarOpen") {
      next.sidebarOpen = value === true;
      continue;
    }

    if (
      key === "loading" ||
      key === "booting" ||
      key === "ready" ||
      key === "initialized" ||
      key === "appReady" ||
      key === "appFatal" ||
      key === "shellVisible" ||
      key === "shellHidden" ||
      key === "chromeVisible" ||
      key === "chromeHidden" ||
      key === "appShellVisible" ||
      key === "shellBusy"
    ) {
      next[key] = value === true;
      continue;
    }

    if (key === "error") {
      const error = normalizeError(value);
      next.error = error;
      next.lastError = error;
      next.hasError = Boolean(error);
      continue;
    }

    if (key === "lastError") {
      const error = normalizeError(value);
      next.error = error;
      next.lastError = error;
      next.hasError = Boolean(error);
      continue;
    }

    if (key === "hasError" && value === false) {
      next.error = null;
      next.lastError = null;
      next.hasError = false;
      continue;
    }

    if (typeof value === "string") {
      next[key] = redact(value);
      continue;
    }

    next[key] = value;
  }

  const authKeys = [
    "token",
    "accessToken",
    "access_token",
    "user",
    "currentUser",
    "authUser",
    "sessionUser",
    "authenticated",
    "hasToken",
    "session",
    "sessionData",
    "sessionId",
    "sessionUserId",
  ];

  if (
    options.forceUnauthenticated === true ||
    options.clearSession === true ||
    authKeys.some((key) => key in source || key in next)
  ) {
    Object.assign(next, authPatch({ ...state, ...next }, options));
  }

  return next;
}

function valuesEqual(a, b) {
  if (Object.is(a, b)) return true;

  if (!isObject(a) && !Array.isArray(a) && !isObject(b) && !Array.isArray(b)) {
    return a === b;
  }

  return false;
}

function changedKeys(state, patch) {
  return Object.keys(patch).filter((key) => !valuesEqual(state[key], patch[key]));
}

/* =========================================================
   SNAPSHOT USER
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
    fullName: normalized.fullName || normalized.displayName || null,
    role: normalized.role || null,
    hasAvatar: Boolean(normalized.hasAvatar || userAvatarUrl(normalized)),
  };
}

/* =========================================================
   STATE FACTORY
========================================================= */

export function createInitialState() {
  const createdAt = nowIso();
  const route = currentCanonicalPath();
  const visiblePath = currentPublicPath();

  return {
    __version: STATE_VERSION,

    initialized: false,
    booting: false,
    ready: false,
    appReady: false,
    appFatal: false,
    loading: true,

    route,
    canonicalPath: route,
    publicPath: visiblePath,
    routeParams: {},

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

    lang: isBrowser()
      ? normalizeLang(document.documentElement.lang || DEFAULT_LANG)
      : DEFAULT_LANG,

    language: isBrowser()
      ? normalizeLang(document.documentElement.lang || DEFAULT_LANG)
      : DEFAULT_LANG,

    locale: isBrowser()
      ? normalizeLang(document.documentElement.dataset.locale || document.documentElement.lang || DEFAULT_LANG)
      : DEFAULT_LANG,

    theme: isBrowser()
      ? normalizeTheme(document.documentElement.dataset.theme || DEFAULT_THEME)
      : DEFAULT_THEME,

    sidebarOpen: false,

    shellVisible: true,
    shellHidden: false,
    chromeVisible: true,
    chromeHidden: false,
    appShellVisible: true,
    shellBusy: false,

    error: null,
    lastError: null,
    hasError: false,

    createdAt,
    updatedAt: createdAt,
    stateChangeCount: 0,
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function cloneState(state = {}, options = {}) {
  const snapshot = clone(sanitizeObject(state)) || {};

  const token = readTokenFrom(state);
  const user = readUserFrom(state);
  const authenticated = computeAuthenticated(user, token);
  const clean = cleanToken(token);

  snapshot.token = options.includeToken ? clean : null;
  snapshot.accessToken = options.includeToken ? clean : null;
  snapshot.access_token = options.includeToken ? clean : null;

  snapshot.user = authenticated ? safeSnapshotUser(user) : null;
  snapshot.currentUser = authenticated ? safeSnapshotUser(user) : null;
  snapshot.authUser = authenticated ? safeSnapshotUser(user) : null;
  snapshot.sessionUser = authenticated ? safeSnapshotUser(user) : null;

  snapshot.hasToken = Boolean(clean);
  snapshot.authenticated = authenticated;

  snapshot.hasRefreshToken = Boolean(state.hasRefreshToken);

  snapshot.userSlug = authenticated ? extractUserSlug(user) || null : null;
  snapshot.homePath = authenticated ? buildUserHomePath(user) : DEFAULT_ROUTE;
  snapshot.defaultHome = snapshot.homePath;
  snapshot.postLoginTarget = authenticated ? snapshot.homePath : null;

  snapshot.role = authenticated ? cleanRole(state.role || user?.role || user?.rol || user?.roles) : null;
  snapshot.rol = snapshot.role;
  snapshot.userRole = snapshot.role;
  snapshot.roles = authenticated && snapshot.role ? [snapshot.role] : [];

  snapshot.username = authenticated ? normalizeUser(user)?.username || null : null;

  snapshot.session = null;
  snapshot.sessionData = null;
  snapshot.sessionId = state.sessionId ? "***" : null;
  snapshot.sessionUserId = state.sessionUserId ? "***" : null;

  snapshot.hasAvatar = authenticated
    ? Boolean(normalizeUser(user)?.hasAvatar || userAvatarUrl(user))
    : false;

  snapshot.avatar = authenticated ? userAvatarUrl(user) || null : null;
  snapshot.avatarUrl = snapshot.avatar;
  snapshot.photoUrl = authenticated ? normalizeUser(user)?.photoUrl || snapshot.avatar || null : null;
  snapshot.picture = authenticated ? normalizeUser(user)?.picture || snapshot.avatar || null : null;

  snapshot.isAdmin = authenticated && snapshot.role === "admin";
  snapshot.isUser = authenticated && snapshot.role === "user";
  snapshot.isSupport = false;
  snapshot.isManager = false;
  snapshot.isClient = false;

  snapshot.lang = normalizeLang(state.lang || state.language || state.locale || DEFAULT_LANG);
  snapshot.language = snapshot.lang;
  snapshot.locale = snapshot.lang;
  snapshot.theme = normalizeTheme(state.theme || DEFAULT_THEME);

  snapshot.route = redact(state.route || DEFAULT_ROUTE);
  snapshot.canonicalPath = redact(state.canonicalPath || state.route || DEFAULT_ROUTE);
  snapshot.publicPath = redact(state.publicPath || state.route || DEFAULT_ROUTE);

  snapshot.error = normalizeError(state.error);
  snapshot.lastError = normalizeError(state.lastError);
  snapshot.hasError = Boolean(snapshot.error || snapshot.lastError);

  return snapshot;
}

export function getState(state = {}, options = {}) {
  return cloneState(state, options);
}

export const getStateBase = getState;

/* =========================================================
   WRITE
========================================================= */

export function setStateBase(state, patch = {}, options = {}) {
  if (!isObject(state)) {
    throw new Error("Core state inválido.");
  }

  if (!isObject(patch)) {
    return cloneState(state);
  }

  const normalized = normalizePatch(state, patch, options);
  const keys = changedKeys(state, normalized);

  if (!keys.length) {
    return cloneState(state);
  }

  Object.assign(state, normalized, {
    updatedAt: nowIso(),
    stateChangeCount: Number(state.stateChangeCount || 0) + 1,
  });

  if (options.emitInternal === true && options.events?.emit) {
    options.events.emit("app:state:patched", {
      state: cloneState(state),
      changedKeys: [...keys, "updatedAt", "stateChangeCount"],
      source: options.source || "core:state",
    });
  }

  return cloneState(state);
}

export function setState({ state, events, patch = {}, options = {} } = {}) {
  return setStateBase(state, patch, {
    ...options,
    events,
  });
}

/* =========================================================
   DEBUG
========================================================= */

export function getStateDebugSnapshot(state = {}) {
  const token = readTokenFrom(state);
  const user = readUserFrom(state);
  const authenticated = computeAuthenticated(user, token);
  const role = authenticated ? cleanRole(state.role || user?.role || user?.rol || user?.roles) : null;

  return {
    version: state.__version || STATE_VERSION,

    initialized: Boolean(state.initialized),
    booting: Boolean(state.booting),
    ready: Boolean(state.ready),
    appReady: Boolean(state.appReady),
    appFatal: Boolean(state.appFatal),
    loading: Boolean(state.loading),

    route: redact(state.route || DEFAULT_ROUTE),
    canonicalPath: redact(state.canonicalPath || state.route || DEFAULT_ROUTE),
    publicPath: redact(state.publicPath || state.route || DEFAULT_ROUTE),

    authenticated,
    hasToken: Boolean(cleanToken(token)),
    hasRefreshToken: Boolean(state.hasRefreshToken),

    user: authenticated ? safeSnapshotUser(user) : null,

    role,
    roles: authenticated && role ? [role] : [],
    username: authenticated ? normalizeUser(user)?.username || null : null,

    userSlug: authenticated ? extractUserSlug(user) || null : null,
    homePath: authenticated ? buildUserHomePath(user) : DEFAULT_ROUTE,

    hasSessionContext: Boolean(state.session || state.sessionData || state.sessionId || state.sessionUserId),
    sessionId: state.sessionId ? "***" : null,
    sessionUserId: state.sessionUserId ? "***" : null,

    isAdmin: authenticated && role === "admin",
    isUser: authenticated && role === "user",
    isSupport: false,
    isManager: false,
    isClient: false,

    lang: normalizeLang(state.lang || state.language || state.locale || DEFAULT_LANG),
    theme: normalizeTheme(state.theme || DEFAULT_THEME),

    hasError: Boolean(state.hasError),
    error: normalizeError(state.error),

    stateChangeCount: Number(state.stateChangeCount || 0),
    createdAt: state.createdAt || "",
    updatedAt: state.updatedAt || "",

    policy: {
      memoryOnly: true,
      configStaticImportsOnly: true,
      noStorage: true,
      noHttp: true,
      noRouter: true,
      noToast: true,

      authRequiresTokenAndUser: true,
      tokenWithoutUserIsNotAuthenticated: true,
      userWithoutTokenIsNotAuthenticated: true,
      accessTokenLossDoesNotClearUser: true,

      invalidStatuses: [...INVALID_USER_STATUSES],
      roles: [...VALID_ROLES],

      defaultLang: DEFAULT_LANG,
      snapshotRedacted: true,
      noRefreshTokenStorage: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  STATE_VERSION,

  createInitialState,

  cloneState,
  getState,
  getStateBase,

  setState,
  setStateBase,

  computeAuthenticated,

  getStateDebugSnapshot,
};
