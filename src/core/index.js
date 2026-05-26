/* =========================================================
   Onion Support - Core
   Archivo: /src/core/index.js

   Responsabilidad:
   - Kernel mínimo global.
   - Estado en memoria.
   - Event bus canónico desde core/events.js.
   - Registry de módulos canónico desde core/modules.js.
   - Cleanup canónico desde core/cleanup.js.
   - Hooks canónicos desde core/hooks.js.
   - Instalar HTTP único desde core/http.js.
   - Auth estricta base: access token usable + user usable.
   - User inválido si disabled/deleted/archived/active=false.
   - Roles únicos: admin / user.
   - Home interna: /.
   - Home visible de usuario: /@{user.slug}.
   - Delegar rutas, user-scope y bloqueos en core/config.js.
   - Session context mínimo seguro en memoria.
   - No guardar refresh token en Core.
   - No guardar secretos persistentes.
   - Sin storage.
   - Sin DOM cache complejo.
   - Sin network listeners.
   - Sin fetch propio.
   - Sin cliente HTTP paralelo.
   - Sin framework interno.
   - Sin /home.
   - Sin 2FA/MFA/OTP.
========================================================= */

import {
  config,
  USER_HOME_PREFIX as CONFIG_USER_HOME_PREFIX,
  BLOCKED_FRONTEND_ROUTES,
  buildUserHomeRoute as configBuildUserHomeRoute,
  canonicalRoutePath as configCanonicalRoutePath,
  getUserScopedRouteInfo as configGetUserScopedRouteInfo,
  isBlockedRoutePath as configIsBlockedRoutePath,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "./config.js";

import { createEvents } from "./events.js";
import { createModules } from "./modules.js";
import { createCleanup } from "./cleanup.js";
import { createHooks } from "./hooks.js";

import Http, { installHttp } from "./http.js";

export const CORE_VERSION = "core.index.v8";

const APP_NAME =
  config?.appName ||
  config?.name ||
  "Onion Support";

const ROOT_PATH = "/";
const USER_HOME_PREFIX = CONFIG_USER_HOME_PREFIX || "/@";

const VALID_ROLES = Object.freeze(["admin", "user"]);

const INVALID_USER_STATUSES = Object.freeze([
  "disabled",
  "inactive",
  "deleted",
  "archived",
  "revoked",
  "blocked",
  "banned",
  "suspended",
  "desactivado",
  "inactivo",
  "eliminado",
  "archivado",
  "bloqueado",
  "suspendido",
]);

const BLOCKED_ROUTES = Object.freeze(
  Array.isArray(BLOCKED_FRONTEND_ROUTES)
    ? BLOCKED_FRONTEND_ROUTES
    : ["/home", "/403", "/404", "/2fa", "/mfa", "/otp"]
);

const TOKEN_STATE_KEYS = new Set([
  "token",
  "accesstoken",
  "access_token",
]);

const SENSITIVE_STATE_KEYS = new Set([
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

  "auth",

  "_rid",
  "_self",
  "_etag",
  "_attachments",
  "_ts",
  "_lsn",
  "_metadata",
]);

const SENSITIVE_OBJECT_KEYS = new Set([
  ...SENSITIVE_STATE_KEYS,
  "token",
  "accesstoken",
  "access_token",
  "jwt",
  "apikey",
  "api_key",
  "sas",
  "connectionstring",
  "connection_string",
]);

const SENSITIVE_QUERY_KEYS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "secret",
  "session",
  "code",
  "password",
  "pwd",
  "key",
  "sig",
  "signature",
  "jwt",
  "authorization",
  "reset_token",
  "activation_token",
]);

const DROPPED_STATE_KEYS = Object.freeze([...SENSITIVE_STATE_KEYS]);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function normalizeKey(value = "") {
  return cleanText(value, "").toLowerCase();
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

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }

  return null;
}

function safeCall(fn = null, context = null, ...args) {
  try {
    return isFunction(fn) ? fn.apply(context, args) : null;
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

/* =========================================================
   ROLES
========================================================= */

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = cleanText(value, "").toLowerCase();

  return VALID_ROLES.includes(role) ? role : "";
}

function cleanRole(value = "") {
  return normalizeRole(value) || "user";
}

/* =========================================================
   TOKEN
========================================================= */

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
  return tokenOk(token) ? token : null;
}

/* =========================================================
   PATHS
========================================================= */

function pathFromInput(path = ROOT_PATH) {
  try {
    return configRoutePathFromUrlLike(path) || ROOT_PATH;
  } catch {
    return ROOT_PATH;
  }
}

function normalizePathname(pathname = ROOT_PATH) {
  try {
    return configNormalizeRoutePath(pathname) || ROOT_PATH;
  } catch {
    let value = cleanText(pathname, ROOT_PATH)
      .split("#")[0]
      .split("?")[0]
      .replace(/\\/g, "/");

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    value = value.replace(/\/{2,}/g, "/");

    if (value.length > 1) {
      value = value.replace(/\/+$/g, "") || ROOT_PATH;
    }

    return value || ROOT_PATH;
  }
}

function normalizeSearch(search = "") {
  const value = cleanText(search, "");

  if (!value || value === "?") return "";

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value = cleanText(hash, "");

  if (!value || value === "#") return "";

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function splitPath(path = ROOT_PATH) {
  let raw = pathFromInput(path);
  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || ROOT_PATH;
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || ROOT_PATH;
  }

  return {
    pathname: normalizePathname(pathname),
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
  };
}

function keyIsSensitiveQueryParam(key = "") {
  return SENSITIVE_QUERY_KEYS.has(cleanText(key, "").toLowerCase());
}

function sanitizeSearch(search = "") {
  const normalized = normalizeSearch(search);

  if (!normalized) return "";

  try {
    const params = new URLSearchParams(normalized);

    for (const key of [...params.keys()]) {
      if (keyIsSensitiveQueryParam(key)) {
        params.delete(key);
      }
    }

    const output = params.toString();

    return output ? `?${output}` : "";
  } catch {
    return "";
  }
}

function sanitizeHash(hash = "") {
  const normalized = normalizeHash(hash);

  if (!normalized) return "";

  const body = normalized.slice(1);

  if (!body || /[\r\n\t\\]/.test(body)) return "";

  const queryIndex = body.indexOf("?");

  if (queryIndex >= 0) {
    const hashPath = body.slice(0, queryIndex);
    const query = body.slice(queryIndex + 1);
    const cleanQuery = sanitizeSearch(`?${query}`);

    return cleanQuery ? `#${hashPath}${cleanQuery}` : `#${hashPath}`;
  }

  if (/^[^/?#=&]+=/i.test(body)) {
    const cleanQuery = sanitizeSearch(`?${body}`);
    return cleanQuery ? `#${cleanQuery.slice(1)}` : "";
  }

  return redact(normalized);
}

function joinPath(parts = {}) {
  return [
    normalizePathname(parts.pathname || ROOT_PATH),
    normalizeSearch(parts.search || ""),
    normalizeHash(parts.hash || ""),
  ].join("");
}

function normalizePublicPath(path = ROOT_PATH) {
  const parts = splitPath(path);

  if (isBlockedRoutePath(parts.pathname)) {
    return ROOT_PATH;
  }

  return joinPath({
    pathname: parts.pathname,
    search: sanitizeSearch(parts.search),
    hash: sanitizeHash(parts.hash),
  });
}

function stripQueryHash(path = ROOT_PATH) {
  return splitPath(path).pathname || ROOT_PATH;
}

function locallyBlockedRoutePath(path = ROOT_PATH) {
  const clean = normalizePathname(stripQueryHash(path)).toLowerCase();

  if (
    BLOCKED_ROUTES.some((blocked) => {
      const target = normalizePathname(blocked).toLowerCase();
      return clean === target || clean.startsWith(`${target}/`);
    })
  ) {
    return true;
  }

  return (
    clean.startsWith("/2fa/") ||
    clean.startsWith("/mfa/") ||
    clean.startsWith("/otp/")
  );
}

function getUserScopedPathInfo(path = ROOT_PATH) {
  try {
    const info = configGetUserScopedRouteInfo(path);

    if (isObject(info)) {
      const restPath = normalizePathname(
        info.restPath || info.canonicalPath || stripQueryHash(path)
      );

      const canonicalPath = normalizePathname(
        info.canonicalPath || info.lookupPath || restPath
      );

      return {
        scoped: Boolean(info.scoped),
        home: Boolean(info.home),
        slug: normalizeSlug(info.slug || ""),
        restPath,
        canonicalPath,
        lookupPath: canonicalPath,
      };
    }
  } catch {
    // fallback abajo
  }

  const value = stripQueryHash(path);

  if (!value.startsWith(USER_HOME_PREFIX)) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: value,
      canonicalPath: value,
      lookupPath: value,
    };
  }

  const rest = value.slice(USER_HOME_PREFIX.length);
  const [slugSegment = "", ...restSegments] = rest.split("/");
  const slug = normalizeSlug(slugSegment);

  if (!slug) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: value,
      canonicalPath: value,
      lookupPath: value,
    };
  }

  const restPath = restSegments.length
    ? normalizePathname(`/${restSegments.join("/")}`)
    : ROOT_PATH;

  return {
    scoped: true,
    home: restPath === ROOT_PATH,
    slug,
    restPath,
    canonicalPath: restPath,
    lookupPath: restPath,
  };
}

function isBlockedRoutePath(path = ROOT_PATH) {
  try {
    if (configIsBlockedRoutePath(path) === true) return true;
  } catch {
    // fallback local
  }

  if (locallyBlockedRoutePath(path)) return true;

  const scoped = getUserScopedPathInfo(path);

  if (scoped.scoped && locallyBlockedRoutePath(scoped.restPath)) {
    return true;
  }

  return false;
}

function extractUserHomeSlug(path = ROOT_PATH) {
  const info = getUserScopedPathInfo(path);
  return info.home ? info.slug : "";
}

function extractUserScopedSlug(path = ROOT_PATH) {
  return getUserScopedPathInfo(path).slug;
}

function isUserHomePath(path = ROOT_PATH) {
  return Boolean(extractUserHomeSlug(path));
}

function isUserScopedPath(path = ROOT_PATH) {
  return Boolean(getUserScopedPathInfo(path).scoped);
}

function normalizeCanonicalPath(path = ROOT_PATH) {
  if (isBlockedRoutePath(path)) return ROOT_PATH;

  try {
    const canonical = configCanonicalRoutePath(path) || ROOT_PATH;
    return isBlockedRoutePath(canonical) ? ROOT_PATH : normalizePathname(canonical);
  } catch {
    const info = getUserScopedPathInfo(path);
    const canonical = info.scoped ? info.canonicalPath : stripQueryHash(path);

    return isBlockedRoutePath(canonical)
      ? ROOT_PATH
      : normalizePathname(canonical || ROOT_PATH);
  }
}

function rawPathHasSensitiveQuery(path = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i.test(
    String(path || "")
  );
}

function safeInternalPath(path = ROOT_PATH) {
  const raw = cleanText(path, ROOT_PATH);

  if (!raw) return ROOT_PATH;
  if (raw.startsWith("//")) return ROOT_PATH;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) return ROOT_PATH;
  if (/[\r\n\t\\]/.test(raw)) return ROOT_PATH;

  const target = normalizePublicPath(raw);

  if (!target.startsWith("/")) return ROOT_PATH;
  if (target.startsWith("//")) return ROOT_PATH;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return ROOT_PATH;
  if (/[\r\n\t\\]/.test(target)) return ROOT_PATH;
  if (isBlockedRoutePath(target)) return ROOT_PATH;

  if (rawPathHasSensitiveQuery(raw)) {
    return target;
  }

  return target;
}

/* =========================================================
   USER NORMALIZATION
========================================================= */

function normalizeSlug(value = "") {
  try {
    return configNormalizeUserSlug(value) || "";
  } catch {
    const slug = cleanText(value, "")
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
    return configBuildUserHomeRoute(slug) || ROOT_PATH;
  } catch {
    return slug ? `${USER_HOME_PREFIX}${slug}` : ROOT_PATH;
  }
}

function isSensitiveObjectKey(key = "") {
  return SENSITIVE_OBJECT_KEYS.has(normalizeKey(key));
}

function isDroppedStateKey(key = "") {
  return DROPPED_STATE_KEYS.includes(normalizeKey(key));
}

function isTokenStateKey(key = "") {
  return TOKEN_STATE_KEYS.has(normalizeKey(key));
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
    if (isSensitiveObjectKey(key)) continue;

    const sanitized = sanitizeObject(child, depth + 1);

    if (sanitized !== undefined) {
      output[key] = sanitized;
    }
  }

  return output;
}

function removeSensitiveUserFields(user = {}) {
  return isObject(user) ? sanitizeObject(user) || {} : {};
}

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  const status = cleanText(
    user.status ||
      user.estado ||
      user.state ||
      "",
    ""
  ).toLowerCase();

  return Boolean(
    user.disabled === true ||
      user.deleted === true ||
      user.archived === true ||
      user.revoked === true ||
      user.blocked === true ||
      user.banned === true ||
      user.suspended === true ||
      user.active === false ||
      user.enabled === false ||
      Boolean(user.deletedAt) ||
      INVALID_USER_STATUSES.includes(status)
  );
}

function hasUserIdentity(user = null) {
  if (!isObject(user)) return false;

  return Boolean(
    cleanText(user.id, "") ||
      cleanText(user.userId, "") ||
      cleanText(user.uid, "") ||
      cleanText(user.sub, "") ||
      cleanText(user.username, "") ||
      cleanText(user.slug, "") ||
      cleanText(user.lookup?.slug, "")
  );
}

function userOk(user = null) {
  return Boolean(
    isObject(user) &&
      !userDisabled(user) &&
      hasUserIdentity(user)
  );
}

function userAvatarUrl(user = null) {
  if (!isObject(user)) return "";

  return cleanText(
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

function normalizeUser(user = null) {
  if (!userOk(user)) return null;

  const safeUser = removeSensitiveUserFields(user);

  if (!isObject(safeUser)) return null;

  const id = cleanText(
    safeUser.userId ||
      safeUser.id ||
      safeUser.uid ||
      safeUser.sub ||
      "",
    ""
  );

  const slug = extractUserSlug(safeUser);
  const profile = isObject(safeUser.profile) ? safeUser.profile : {};

  const username = cleanText(
    safeUser.username ||
      safeUser.userName ||
      safeUser.user_name ||
      safeUser.usernameLower ||
      safeUser.username_lower ||
      slug ||
      id,
    ""
  );

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

    email: safeUser.email || null,
    emailLower: safeUser.email ? String(safeUser.email).toLowerCase() : null,

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
    deleted: false,
    archived: false,

    isAdmin: role === "admin",
    isUser: role === "user",
  };
}

function publicUser(user = null) {
  const normalized = normalizeUser(user);

  if (!normalized) return null;

  const avatar = userAvatarUrl(normalized);

  return {
    id: normalized.id || normalized.userId || null,
    userId: normalized.userId || normalized.id || null,
    username: normalized.username || null,
    slug: normalized.slug || null,
    displayName: normalized.displayName || null,
    role: normalized.role || null,
    hasAvatar: Boolean(normalized.hasAvatar || avatar),
  };
}

/* =========================================================
   SESSION CONTEXT
========================================================= */

function normalizeSessionContext(value = null, user = null) {
  if (!isObject(value)) return null;

  const sessionId = cleanText(
    value.sessionId ||
      value.session_id ||
      value.sid ||
      value.id ||
      "",
    ""
  );

  const userId = cleanText(
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

  const sessionUserId = cleanText(session.userId || session.sessionUserId, "");
  const userId = cleanText(
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

/* =========================================================
   CANONICAL CORE REGISTRIES
========================================================= */

const internalRegistry = {};
const events = createEvents();
const modules = createModules({ registry: internalRegistry, events });
const cleanup = createCleanup({ registry: internalRegistry, events });
const hooks = createHooks({ registry: internalRegistry, events });

const services = {};
const dom = {};

const registry = {
  modules,
  hooks,
  cleanup,
  records: internalRegistry,
};

/* =========================================================
   INITIAL STATE
========================================================= */

const initialLang = isBrowser()
  ? document.documentElement.lang || "es"
  : "es";

const initialLocale = isBrowser()
  ? document.documentElement.dataset.locale || initialLang || "es"
  : "es";

const initialTheme = isBrowser()
  ? document.documentElement.dataset.theme || "system"
  : "system";

const createdAt = nowIso();

const state = {
  initialized: false,
  ready: false,
  booting: false,
  loading: false,

  route: ROOT_PATH,
  canonicalPath: ROOT_PATH,
  publicPath: ROOT_PATH,
  routeParams: {},

  token: null,
  accessToken: null,
  access_token: null,

  user: null,
  currentUser: null,
  authUser: null,
  sessionUser: null,

  authenticated: false,
  hasToken: false,
  hasRefreshToken: false,

  userSlug: null,
  homePath: ROOT_PATH,
  defaultHome: ROOT_PATH,
  postLoginTarget: null,

  role: null,
  rol: null,
  userRole: null,
  roles: [],

  isAdmin: false,
  isUser: false,

  session: null,
  sessionData: null,
  sessionId: null,
  sessionUserId: null,

  username: null,
  hasAvatar: false,
  avatar: null,
  avatarUrl: null,
  photoUrl: null,
  picture: null,
  avatarUpdatedAt: null,

  shellVisible: true,
  shellHidden: false,
  chromeVisible: true,
  chromeHidden: false,
  routeMode: "boot",

  sidebarOpen: false,

  lang: initialLang,
  language: initialLang,
  locale: initialLocale,

  theme: initialTheme,

  error: null,
  lastError: null,
  hasError: false,

  createdAt,
  updatedAt: createdAt,
  stateChangeCount: 0,
};

let initialized = false;
let initPromise = null;
let toastBridge = null;
let httpClient = null;

/* =========================================================
   STATE SANITIZE
========================================================= */

function dropForbiddenStateFields(target = state) {
  if (!isObject(target)) return target;

  for (const key of Object.keys(target)) {
    if (isDroppedStateKey(key)) {
      try {
        delete target[key];
      } catch {
        // noop
      }
    }
  }

  return target;
}

function sanitizeStatePatch(patch = {}) {
  if (!isObject(patch)) return {};

  const output = {};

  for (const [key, value] of Object.entries(patch)) {
    if (isTokenStateKey(key)) {
      output[key] = cleanToken(value);
      continue;
    }

    if (isDroppedStateKey(key)) {
      continue;
    }

    if (key === "hasRefreshToken") {
      output.hasRefreshToken = value === true;
      continue;
    }

    if (
      key === "user" ||
      key === "currentUser" ||
      key === "authUser" ||
      key === "sessionUser"
    ) {
      output[key] = value ? normalizeUser(value) : null;
      continue;
    }

    if (key === "role" || key === "rol" || key === "userRole") {
      output[key] = normalizeRole(value) || null;
      continue;
    }

    if (key === "roles") {
      output[key] = Array.isArray(value)
        ? value.map(normalizeRole).filter(Boolean)
        : [];
      continue;
    }

    if (key === "session" || key === "sessionData") {
      const currentUser =
        output.user ||
        output.currentUser ||
        state.user ||
        state.currentUser ||
        null;

      const session = normalizeSessionContext(value, currentUser);

      output.session = session;
      output.sessionData = session;
      output.sessionId = session?.sessionId || null;
      output.sessionUserId = session?.sessionUserId || session?.userId || null;
      continue;
    }

    if (key === "sessionId") {
      output.sessionId = cleanText(value, "") || null;
      continue;
    }

    if (key === "sessionUserId") {
      output.sessionUserId = cleanText(value, "") || null;
      continue;
    }

    if (key === "publicPath") {
      output.publicPath = safeInternalPath(value);
      output.canonicalPath = normalizeCanonicalPath(value);
      output.route = normalizeCanonicalPath(value);
      continue;
    }

    if (key === "route" || key === "canonicalPath") {
      output[key] = normalizeCanonicalPath(value);
      continue;
    }

    if (key === "lang" || key === "language" || key === "locale") {
      const lang = ["es", "ca", "en"].includes(value) ? value : "es";
      output.lang = lang;
      output.language = lang;
      output.locale = lang;
      continue;
    }

    if (key === "theme") {
      output.theme = ["dark", "light", "system"].includes(value)
        ? value
        : "system";
      continue;
    }

    if (key === "error") {
      const normalized = normalizeError(value);
      output.error = normalized;
      output.lastError = normalized;
      output.hasError = Boolean(normalized);
      continue;
    }

    if (key === "lastError") {
      const normalized = normalizeError(value);
      output.error = normalized;
      output.lastError = normalized;
      output.hasError = Boolean(normalized);
      continue;
    }

    if (key === "hasError" && value === false) {
      output.error = null;
      output.lastError = null;
      output.hasError = false;
      continue;
    }

    if (typeof value === "string") {
      output[key] = redact(value);
      continue;
    }

    output[key] = value;
  }

  return output;
}

function clearSessionFields() {
  state.token = null;
  state.accessToken = null;
  state.access_token = null;

  state.user = null;
  state.currentUser = null;
  state.authUser = null;
  state.sessionUser = null;

  state.authenticated = false;
  state.hasToken = false;
  state.hasRefreshToken = false;

  state.userSlug = null;
  state.homePath = ROOT_PATH;
  state.defaultHome = ROOT_PATH;
  state.postLoginTarget = null;

  state.role = null;
  state.rol = null;
  state.userRole = null;
  state.roles = [];

  state.isAdmin = false;
  state.isUser = false;

  state.session = null;
  state.sessionData = null;
  state.sessionId = null;
  state.sessionUserId = null;

  state.username = null;
  state.hasAvatar = false;
  state.avatar = null;
  state.avatarUrl = null;
  state.photoUrl = null;
  state.picture = null;
  state.avatarUpdatedAt = null;

  dropForbiddenStateFields(state);

  return state;
}

/* =========================================================
   AUTH STATE
========================================================= */

function syncAuth() {
  dropForbiddenStateFields(state);

  const rawUser =
    state.user ||
    state.currentUser ||
    state.authUser ||
    state.sessionUser ||
    null;

  const user = normalizeUser(rawUser);
  const invalidExplicitUser = Boolean(rawUser) && !user;

  const token = invalidExplicitUser
    ? null
    : cleanToken(state.token || state.accessToken || state.access_token);

  const authenticated = Boolean(token && user);
  const role = authenticated
    ? cleanRole(user.role || user.rol || user.roles || state.role)
    : null;

  const slug = authenticated ? extractUserSlug(user) : "";
  const homePath = authenticated ? buildUserHomePath(user) : ROOT_PATH;

  const sessionSource =
    state.session ||
    state.sessionData ||
    (
      state.sessionId || state.sessionUserId
        ? {
            sessionId: state.sessionId,
            sessionUserId: state.sessionUserId,
          }
        : null
    );

  const session = authenticated
    ? normalizeSessionContext(sessionSource, user)
    : null;

  const validSession = authenticated && session && sameSessionUser(session, user)
    ? session
    : null;

  const avatar = authenticated ? userAvatarUrl(user) : "";

  state.token = token;
  state.accessToken = token;
  state.access_token = token;

  state.user = authenticated ? user : null;
  state.currentUser = authenticated ? user : null;
  state.authUser = authenticated ? user : null;
  state.sessionUser = authenticated ? user : null;

  state.hasToken = Boolean(token);
  state.authenticated = authenticated;

  state.userSlug = authenticated ? slug || null : null;
  state.homePath = homePath;
  state.defaultHome = homePath;
  state.postLoginTarget = authenticated ? homePath : null;

  state.role = role;
  state.rol = role;
  state.userRole = role;
  state.roles = authenticated && role ? [role] : [];

  state.isAdmin = role === "admin";
  state.isUser = role === "user";

  state.session = validSession;
  state.sessionData = validSession;
  state.sessionId = validSession?.sessionId || null;
  state.sessionUserId = validSession?.sessionUserId || validSession?.userId || null;

  state.username = authenticated ? user.username || null : null;
  state.hasAvatar = authenticated ? Boolean(user.hasAvatar || avatar) : false;
  state.avatar = authenticated ? avatar || null : null;
  state.avatarUrl = authenticated ? avatar || null : null;
  state.photoUrl = authenticated ? user.photoUrl || avatar || null : null;
  state.picture = authenticated ? user.picture || avatar || null : null;
  state.avatarUpdatedAt = authenticated ? user.avatarUpdatedAt || null : null;

  return state;
}

function getState(options = {}) {
  syncAuth();
  return options.raw === true ? state : clone(state);
}

function setState(patch = {}, options = {}) {
  const nextPatch = sanitizeStatePatch(patch);

  Object.assign(state, nextPatch);

  if (options.forceUnauthenticated === true) {
    clearSessionFields();
  }

  syncAuth();

  state.updatedAt = nowIso();
  state.stateChangeCount = Number(state.stateChangeCount || 0) + 1;

  if (options.emit !== false && options.silent !== true) {
    events.emit("app:state:change", {
      state: getState(),
      source: options.source || "core:setState",
    });
  }

  return getState(options);
}

function patchState(patch = {}, options = {}) {
  return setState(patch, options);
}

function isAuthenticated() {
  syncAuth();
  return Boolean(state.authenticated);
}

function getCurrentUser() {
  syncAuth();
  return state.user;
}

function getCurrentRole() {
  syncAuth();
  return state.role;
}

function hasRole(roleOrRoles = []) {
  syncAuth();

  if (!state.authenticated) return false;

  const requested = Array.isArray(roleOrRoles)
    ? roleOrRoles.flat(Infinity)
    : [roleOrRoles];

  if (!requested.length) return true;

  const required = requested.map(normalizeRole).filter(Boolean);

  if (!required.length) return false;
  if (state.role === "admin") return true;

  return required.includes(state.role);
}

function getAuthHeader() {
  syncAuth();

  if (!state.token) return {};

  return {
    Authorization: `Bearer ${state.token}`,
  };
}

/* =========================================================
   STATE WRAPPERS
========================================================= */

function setRoute(route = ROOT_PATH, options = {}) {
  const path = normalizeCanonicalPath(route);

  setState(
    {
      route: path,
      canonicalPath: path,
    },
    {
      source: options.source || "core:setRoute",
      silent: options.silent,
      emit: options.emit,
    }
  );

  return path;
}

function setPublicPath(path = ROOT_PATH, options = {}) {
  const publicPath = safeInternalPath(path);
  const canonicalPath = normalizeCanonicalPath(publicPath);

  setState(
    {
      publicPath,
      route: canonicalPath,
      canonicalPath,
    },
    {
      source: options.source || "core:setPublicPath",
      silent: options.silent,
      emit: options.emit,
    }
  );

  return publicPath;
}

function setUser(user = null, options = {}) {
  const cleanUser = normalizeUser(user);

  setState(
    {
      user: cleanUser,
      currentUser: cleanUser,
    },
    {
      source: options.source || "core:setUser",
      silent: options.silent,
      emit: options.emit,
      forceUnauthenticated: !cleanUser,
    }
  );

  return state.user;
}

function setToken(token = null, options = {}) {
  const clean = cleanToken(token);

  setState(
    {
      token: clean,
      accessToken: clean,
      access_token: clean,
    },
    {
      source: options.source || "core:setToken",
      silent: options.silent,
      emit: options.emit,
      forceUnauthenticated: !clean,
    }
  );

  return state.token;
}

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

function applySession(payload = {}, options = {}) {
  const token = pick(payload, ["token", "accessToken", "access_token"]);

  const user =
    pick(payload, ["user", "usuario", "me", "account", "profile"]) ||
    (userOk(payload) ? payload : null);

  const clean = cleanToken(token);
  const cleanUser = normalizeUser(user);
  const session = normalizeSessionContext(pickSession(payload), cleanUser);

  setState(
    {
      token: clean,
      accessToken: clean,
      access_token: clean,

      user: cleanUser,
      currentUser: cleanUser,

      session,
      sessionData: session,

      hasRefreshToken: Boolean(
        pick(payload, ["refreshToken", "refresh_token"])
      ),
    },
    {
      source: options.source || "core:applySession",
      silent: options.silent,
      emit: options.emit,
      forceUnauthenticated: !(clean && cleanUser),
    }
  );

  return {
    token: state.token,
    user: state.user,
    authenticated: state.authenticated,
    hasToken: state.hasToken,
    hasRefreshToken: state.hasRefreshToken,
    homePath: state.homePath,
    defaultHome: state.defaultHome,
    postLoginTarget: state.postLoginTarget,
    session: state.session,
  };
}

function clearSession(options = {}) {
  clearSessionFields();

  state.updatedAt = nowIso();
  state.stateChangeCount = Number(state.stateChangeCount || 0) + 1;

  if (options.emit !== false && options.silent !== true) {
    events.emit("app:state:change", {
      state: getState(),
      source: options.source || "core:clearSession",
    });
  }

  return true;
}

function setTheme(theme = "system", options = {}) {
  const value = ["dark", "light", "system"].includes(theme)
    ? theme
    : "system";

  state.theme = value;
  state.updatedAt = nowIso();

  if (options.emit === true) {
    events.emit("app:theme:change", {
      theme: value,
    });
  }

  return value;
}

function setLang(lang = "es", options = {}) {
  const value = ["es", "ca", "en"].includes(lang) ? lang : "es";

  state.lang = value;
  state.language = value;
  state.locale = value;
  state.updatedAt = nowIso();

  if (options.emit === true) {
    events.emit("app:lang:change", {
      lang: value,
      language: value,
      locale: value,
    });
  }

  return value;
}

function setSidebarOpen(value = false) {
  state.sidebarOpen = Boolean(value);
  state.updatedAt = nowIso();
  return state.sidebarOpen;
}

function setLoading(value = false) {
  state.loading = Boolean(value);
  state.updatedAt = nowIso();
  return state.loading;
}

function normalizeError(error = null) {
  if (!error) return null;

  return {
    name: cleanText(error?.name, "Error"),
    message: redact(error?.message || String(error)),
    code: error?.code || error?.status || error?.statusCode || error?.response?.status || null,
  };
}

function setError(error = null, options = {}) {
  const normalized = normalizeError(error);

  state.error = normalized;
  state.lastError = normalized;
  state.hasError = Boolean(normalized);
  state.updatedAt = nowIso();

  if (options.emit === true) {
    events.emit("app:error", {
      error: normalized,
    });
  }

  return normalized;
}

/* =========================================================
   TOAST BRIDGE
========================================================= */

function normalizeToastType(type = "info") {
  const value = cleanText(type, "info").toLowerCase();

  if (value === "warn") return "warning";
  if (value === "danger") return "error";

  if (value === "success") return "success";
  if (value === "error") return "error";
  if (value === "warning") return "warning";
  if (value === "info") return "info";

  return "info";
}

function getRegisteredToast() {
  return (
    toastBridge ||
    modules.get("toast") ||
    modules.get("Toast") ||
    services.toast ||
    null
  );
}

function callToastModule(toast = null, message = "", type = "info", options = {}) {
  if (!toast) return null;

  const toastType = normalizeToastType(type);
  const textValue = redact(message);

  if (!textValue) return null;

  if (isFunction(toast?.[toastType])) {
    return safeCall(toast[toastType], toast, textValue, options);
  }

  if (toastType === "warning" && isFunction(toast?.warn)) {
    return safeCall(toast.warn, toast, textValue, options);
  }

  if (isFunction(toast?.show)) {
    return safeCall(toast.show, toast, {
      ...(isObject(options) ? options : {}),
      type: toastType,
      message: textValue,
    });
  }

  if (isFunction(toast)) {
    return safeCall(toast, null, textValue, toastType, options);
  }

  return null;
}

function setShowToast(fn = null) {
  if (!isFunction(fn)) return false;

  toastBridge = fn;
  return true;
}

function showToast(message = "", type = "info", options = {}) {
  const toast = getRegisteredToast();

  return callToastModule(
    toast,
    isObject(message)
      ? first(message.message, message.text, message.title, "")
      : message,
    isObject(message)
      ? first(message.type, message.variant, type, "info")
      : type,
    isObject(message)
      ? {
          ...message,
          ...(isObject(options) ? options : {}),
        }
      : options
  );
}

/* =========================================================
   MODULES
========================================================= */

function registerModule(name = "", value = null, options = {}) {
  return modules.register(name, value, {
    ...options,
    overwrite: options.overwrite !== false,
  });
}

function getModule(name = "") {
  return modules.get(name);
}

/* =========================================================
   HTTP
========================================================= */

function installHttpBridge(options = {}) {
  if (httpClient) {
    return httpClient;
  }

  try {
    httpClient = isFunction(installHttp)
      ? installHttp(AppCore, options)
      : Http;
  } catch {
    httpClient = Http;
  }

  if (!httpClient) {
    httpClient = Http;
  }

  services.http = httpClient;
  modules.register("http", httpClient, { overwrite: true });

  return httpClient;
}

function setHttpClient(value = null) {
  if (!value) return false;

  httpClient = value;
  services.http = httpClient;
  modules.register("http", httpClient, { overwrite: true });

  return true;
}

function getHttpClient() {
  return httpClient || installHttpBridge();
}

function getActiveRequest() {
  const client = getHttpClient();

  return isFunction(client?.request)
    ? client.request.bind(client)
    : null;
}

function getActiveApiClient() {
  return getHttpClient();
}

function request(...args) {
  const activeRequest = getActiveRequest();

  if (!isFunction(activeRequest)) {
    throw new Error("HTTP request() no disponible.");
  }

  return activeRequest(...args);
}

/* =========================================================
   LIFECYCLE
========================================================= */

function ready(fn = null) {
  if (!isFunction(fn)) return () => false;

  if (!isBrowser() || document.readyState !== "loading") {
    try {
      fn();
    } catch {
      // noop
    }

    return () => true;
  }

  try {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  } catch {
    return () => false;
  }

  return () => {
    try {
      document.removeEventListener("DOMContentLoaded", fn);
    } catch {
      // noop
    }

    return true;
  };
}

async function init(options = {}) {
  if (initialized) return AppCore;
  if (initPromise) return initPromise;

  initPromise = Promise.resolve()
    .then(async () => {
      state.booting = true;
      state.loading = true;
      state.ready = false;

      await hooks.run("beforeInit", {
        core: AppCore,
        options,
      });

      installHttpBridge(options);

      initialized = true;

      state.initialized = true;
      state.booting = false;
      state.loading = false;
      state.ready = true;
      state.updatedAt = nowIso();

      await hooks.run("afterInit", {
        core: AppCore,
        options,
      });

      events.emit("core:ready", {
        version: CORE_VERSION,
      });

      return AppCore;
    })
    .catch((error) => {
      state.booting = false;
      state.loading = false;
      state.ready = false;

      setError(error, { emit: true });

      throw error;
    })
    .finally(() => {
      initPromise = null;
    });

  return initPromise;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getSnapshot() {
  syncAuth();

  return {
    version: CORE_VERSION,

    appName: APP_NAME,

    initialized,
    ready: Boolean(state.ready),
    booting: Boolean(state.booting),
    loading: Boolean(state.loading),

    authenticated: Boolean(state.authenticated),
    hasToken: Boolean(state.hasToken),
    hasRefreshToken: Boolean(state.hasRefreshToken),

    token: null,
    accessToken: null,
    refreshToken: null,

    user: publicUser(state.user),

    userSlug: state.userSlug || null,
    homePath: state.homePath || ROOT_PATH,
    defaultHome: state.defaultHome || state.homePath || ROOT_PATH,

    role: state.role,
    roles: [...state.roles],

    hasSessionContext: Boolean(state.sessionId || state.sessionUserId || state.session),
    sessionId: state.sessionId ? "***" : null,
    sessionUserId: state.sessionUserId ? "***" : null,

    route: redact(state.route || ROOT_PATH),
    canonicalPath: redact(state.canonicalPath || ROOT_PATH),
    publicPath: redact(state.publicPath || ROOT_PATH),

    lang: state.lang,
    locale: state.locale,
    theme: state.theme,

    hasHttp: Boolean(httpClient),
    modules: modules.list(),
    events: events.names(),
    cleanup: cleanup.getSnapshot?.() || null,
    hooks: hooks.getSnapshot?.() || null,

    updatedAt: state.updatedAt || null,
    stateChangeCount: Number(state.stateChangeCount || 0),

    policy: {
      memoryStateOnly: true,
      noStorage: true,
      noFetchOwn: true,
      httpFacadeOnly: true,
      noApiClientParallel: true,

      configOwnsRouteNormalization: true,
      configOwnsUserScope: true,
      configOwnsBlockedRoutes: true,

      roles: ["admin", "user"],
      authRequiresTokenAndUsableUser: true,

      userSlugHome: true,
      userScopedPrivateRoutes: true,
      noEmailIdentity: true,

      safeSessionContextOnly: true,
      noSessionSecrets: true,
      noSessionIpUserAgent: true,
      noRefreshTokenInCoreState: true,

      blocksHomeAlias: true,
      noHomeRoute: true,
      no2fa: true,
      noMfa: true,
      noOtp: true,

      snapshotRedacted: true,
    },
  };
}

/* =========================================================
   API
========================================================= */

export const AppCore = {
  CORE_VERSION,
  version: CORE_VERSION,

  config,
  state,
  dom,
  registry,

  utils: {
    text: cleanText,
    clone,
    redact,
    isObject,
    isFunction,
  },

  events,
  cleanup,
  modules,
  hooks,
  services,

  init,
  ready,

  getState,
  setState,
  patchState,

  isAuthenticated,
  getCurrentUser,
  getCurrentRole,
  hasRole,
  getAuthHeader,

  setRoute,
  setPublicPath,

  setUser,
  setToken,
  applySession,
  clearSession,

  setTheme,
  setLang,
  setSidebarOpen,
  setLoading,
  setError,

  setShowToast,
  showToast,

  registerModule,
  getModule,

  installHttpBridge,
  getHttpClient,
  getActiveRequest,
  getActiveApiClient,
  request,

  normalizeRole,
  normalizeUser,
  normalizeSlug,
  extractUserSlug,
  buildUserHomePath,
  publicUser,

  normalizeSessionContext,

  normalizePublicPath,
  normalizeCanonicalPath,
  extractUserHomeSlug,
  extractUserScopedSlug,
  isUserHomePath,
  isUserScopedPath,
  safeInternalPath,

  getSnapshot,
  getDebugSnapshot: getSnapshot,
  snapshot: getSnapshot,

  getUserDisplayName: (user) =>
    normalizeUser(user)?.displayName || "",

  getUserUsername: (user) =>
    normalizeUser(user)?.username || "",

  getUserAvatarUrl: (user) =>
    userAvatarUrl(user),
};

Object.defineProperties(AppCore, {
  Http: {
    get() {
      return getHttpClient();
    },
    set(value) {
      setHttpClient(value);
    },
  },

  http: {
    get() {
      return getHttpClient();
    },
    set(value) {
      setHttpClient(value);
    },
  },

  Router: {
    get() {
      return modules.get("router");
    },
    set(value) {
      modules.register("router", value, { overwrite: true });
    },
  },

  router: {
    get() {
      return modules.get("router");
    },
    set(value) {
      modules.register("router", value, { overwrite: true });
    },
  },

  Auth: {
    get() {
      return modules.get("auth");
    },
    set(value) {
      modules.register("auth", value, { overwrite: true });
    },
  },

  auth: {
    get() {
      return modules.get("auth");
    },
    set(value) {
      modules.register("auth", value, { overwrite: true });
    },
  },

  I18n: {
    get() {
      return modules.get("i18n");
    },
    set(value) {
      modules.register("i18n", value, { overwrite: true });
    },
  },

  i18n: {
    get() {
      return modules.get("i18n");
    },
    set(value) {
      modules.register("i18n", value, { overwrite: true });
    },
  },

  Toast: {
    get() {
      return modules.get("toast");
    },
    set(value) {
      modules.register("toast", value, { overwrite: true });
      services.toast = value;
    },
  },

  toast: {
    get() {
      return modules.get("toast");
    },
    set(value) {
      modules.register("toast", value, { overwrite: true });
      services.toast = value;
    },
  },
});

export default AppCore;
