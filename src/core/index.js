/* =========================================================
   Onion Support - Core
   Archivo: /src/core/index.js

   Responsabilidad:
   - Kernel mínimo global.
   - Estado mínimo en memoria.
   - Sesión actual en memoria.
   - Helpers básicos de usuario/rol/ruta.
   - Registro mínimo de módulos.
   - Puente único hacia core/http.js.
   - Sin Store.
   - Sin Services.
   - Sin hooks.
   - Sin cleanup global.
   - Sin event bus.
   - Sin network listeners.
   - Sin fetch propio.
   - Sin i18n funcional.
   - Sin framework interno.
========================================================= */

import {
  config,
  USER_HOME_PREFIX as CONFIG_USER_HOME_PREFIX,
  ALLOWED_ROLES,
  SENSITIVE_QUERY_PARAMS,
  buildUserHomeRoute as configBuildUserHomeRoute,
  getUserScopedRouteInfo as configGetUserScopedRouteInfo,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "./config.js";

import Http from "./http.js";

export const CORE_VERSION = "core.minimal.v5";

const APP_NAME = config?.appName || config?.name || "Onion Support";
const ROOT_PATH = "/";
const USER_HOME_PREFIX = CONFIG_USER_HOME_PREFIX || "/@";

const VALID_ROLES = new Set(
  (Array.isArray(ALLOWED_ROLES) && ALLOWED_ROLES.length
    ? ALLOWED_ROLES
    : ["admin", "user"]
  ).map((role) => String(role).toLowerCase())
);

const DISABLED_STATUSES = new Set([
  "disabled",
  "desactivado",
  "inactive",
  "inactivo",
  "deleted",
  "eliminado",
  "archived",
  "archivado",
  "revoked",
  "revocado",
  "blocked",
  "bloqueado",
  "banned",
  "suspended",
  "suspendido",
]);

const SENSITIVE_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",

  "password",
  "passwordhash",
  "password_hash",
  "passwordmeta",
  "password_meta",

  "refreshtoken",
  "refresh_token",
  "idtoken",
  "id_token",
  "jwt",
  "bearer",
  "authorization",

  "resettoken",
  "reset_token",
  "activationtoken",
  "activation_token",

  "secret",
  "secrets",
  "apikey",
  "api_key",
  "connectionstring",
  "connection_string",
  "sas",

  "_rid",
  "_self",
  "_etag",
  "_attachments",
  "_ts",
  "_lsn",
  "_metadata",
]);

const SENSITIVE_QUERY_KEYS = new Set(
  (Array.isArray(SENSITIVE_QUERY_PARAMS) && SENSITIVE_QUERY_PARAMS.length
    ? SENSITIVE_QUERY_PARAMS
    : [
        "token",
        "access_token",
        "accessToken",
        "refresh_token",
        "refreshToken",
        "id_token",
        "idToken",
        "code",
        "secret",
        "session",
        "sessionId",
        "session_id",
        "password",
        "pwd",
        "key",
        "sig",
        "signature",
        "jwt",
        "authorization",
        "reset_token",
        "resetToken",
        "activation_token",
        "activationToken",
      ]
  )
    .map((key) => normalizeKey(key))
    .filter(Boolean)
);

const state = {
  initialized: false,
  ready: false,
  booting: false,
  loading: false,
  error: null,

  token: null,
  accessToken: null,
  access_token: null,
  hasToken: false,

  authenticated: false,
  user: null,
  currentUser: null,
  hasUser: false,

  role: null,
  rol: null,
  roles: [],

  userSlug: null,
  homePath: ROOT_PATH,
  defaultHome: ROOT_PATH,
  postLoginTarget: null,

  session: null,
  sessionData: null,
  sessionId: null,
  sessionUserId: null,
  hasSession: false,
  hasRefreshToken: false,

  route: ROOT_PATH,
  canonicalPath: ROOT_PATH,
  publicPath: ROOT_PATH,
  routeParams: {},

  sidebarOpen: false,

  lang: "es",
  locale: "es-ES",
  theme: "system",

  updatedAt: null,
};

const dom = {};
const ui = {};
const moduleRegistry = new Map();

let httpClient = null;
let toastBridge = null;

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
  return cleanText(value, "")
    .replace(/[-_\s]/g, "")
    .toLowerCase();
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }

  return null;
}

function clone(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {
    // fallback abajo
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? undefined : JSON.parse(serialized);
  } catch {
    return null;
  }
}

function touch() {
  state.updatedAt = new Date().toISOString();
}

function redact(value = "") {
  let output = cleanText(value, "");

  try {
    const fakeUrl = new URL(output, "https://onionsupport.local");

    for (const key of [...fakeUrl.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(normalizeKey(key))) {
        fakeUrl.searchParams.set(key, "***");
      }
    }

    output = /^https?:\/\//i.test(output)
      ? fakeUrl.toString()
      : `${fakeUrl.pathname}${fakeUrl.search}${fakeUrl.hash}`;
  } catch {
    output = output.replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    );
  }

  return output
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
}

function safeError(error = null) {
  if (!error) return null;

  return {
    name: cleanText(error.name, "Error"),
    message: redact(error.message || String(error)),
    status: error.status || error.statusCode || error.response?.status || null,
    code: error.code || error.error || null,
  };
}

/* =========================================================
   TOKEN / ROLE / USER
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

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = cleanText(value, "").toLowerCase();

  return VALID_ROLES.has(role) ? role : "";
}

function normalizeSlug(value = "") {
  try {
    if (isFunction(configNormalizeUserSlug)) {
      return configNormalizeUserSlug(value) || "";
    }
  } catch {
    // fallback abajo
  }

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

function extractUserSlug(user = null) {
  if (!isObject(user)) return "";

  return normalizeSlug(
    first(
      user.slug,
      user.lookup?.slug,
      user.profile?.slug,
      user.routing?.slug,
      user.username,
      user.userName,
      user.user_name,
      user.usernameLower,
      user.username_lower,
      user.userId,
      user.id,
      ""
    )
  );
}

function buildUserHomePath(userOrSlug = null) {
  const slug = isObject(userOrSlug)
    ? extractUserSlug(userOrSlug)
    : normalizeSlug(userOrSlug);

  if (!slug) return ROOT_PATH;

  try {
    if (isFunction(configBuildUserHomeRoute)) {
      return configBuildUserHomeRoute(slug) || `${USER_HOME_PREFIX}${slug}`;
    }
  } catch {
    // fallback abajo
  }

  return `${USER_HOME_PREFIX}${slug}`;
}

function userStatus(user = null) {
  if (!isObject(user)) return "";

  return cleanText(
    first(user.status, user.estado, user.state, user.accountStatus, ""),
    ""
  ).toLowerCase();
}

function userLooksDisabledByFlag(user = null) {
  if (!isObject(user)) return true;

  return Boolean(
    user.usable === false ||
      user.disabled === true ||
      user.deleted === true ||
      user.archived === true ||
      user.revoked === true ||
      user.blocked === true ||
      user.banned === true ||
      user.suspended === true ||
      user.active === false ||
      user.enabled === false
  );
}

function isUsableUser(user = null) {
  if (!isObject(user)) return false;
  if (userLooksDisabledByFlag(user)) return false;

  return !DISABLED_STATUSES.has(userStatus(user));
}

function publicUser(user = null) {
  if (!isObject(user)) return null;

  const role = normalizeRole(first(user.role, user.rol, user.roles, "")) || "user";
  const slug = extractUserSlug(user);
  const status = userStatus(user) || (userLooksDisabledByFlag(user) ? "disabled" : "active");

  return {
    id: first(user.id, user.userId, null),
    userId: first(user.userId, user.id, null),

    username: first(user.username, user.userName, user.user_name, null),
    slug,

    displayName: first(
      user.displayName,
      user.fullName,
      user.name,
      user.nombre,
      user.profile?.displayName,
      user.profile?.name,
      user.username,
      "Usuario"
    ),

    role,
    rol: role,
    roles: [role],

    avatarUrl: cleanText(
      first(
        user.avatarUrl,
        user.avatar,
        user.picture,
        user.photoUrl,
        user.profile?.avatarUrl,
        user.profile?.avatar,
        ""
      ),
      ""
    ),

    status,
  };
}

function normalizeUser(user = null) {
  const output = publicUser(user);

  if (!output) return null;

  return {
    ...output,
    usable: isUsableUser(user),
  };
}

function updateAuthFlags() {
  const user = state.user;
  const usableUser = isUsableUser(user);
  const token = cleanToken(state.token || state.accessToken || state.access_token);

  const safeUser = usableUser ? user : null;
  const role = normalizeRole(
    first(safeUser?.role, safeUser?.rol, safeUser?.roles, state.role, state.rol, "user")
  ) || "user";

  const slug = extractUserSlug(safeUser);

  state.token = token;
  state.accessToken = token;
  state.access_token = token;
  state.hasToken = Boolean(token);

  state.user = safeUser;
  state.currentUser = safeUser;
  state.hasUser = Boolean(safeUser);

  state.role = safeUser ? role : null;
  state.rol = safeUser ? role : null;
  state.roles = safeUser ? [role] : [];

  state.userSlug = safeUser ? slug || null : null;
  state.homePath = safeUser ? buildUserHomePath(slug) : ROOT_PATH;
  state.defaultHome = state.homePath;
  state.postLoginTarget = token && safeUser ? state.homePath : null;

  state.authenticated = Boolean(token && safeUser);
  state.hasSession = Boolean(state.session || state.sessionId || state.sessionUserId);

  touch();
}

/* =========================================================
   ROUTES
========================================================= */

function normalizePathname(value = ROOT_PATH) {
  try {
    if (isFunction(configNormalizeRoutePath)) {
      return configNormalizeRoutePath(value) || ROOT_PATH;
    }
  } catch {
    // fallback abajo
  }

  let path = cleanText(value, ROOT_PATH)
    .split("#")[0]
    .split("?")[0]
    .replace(/\\/g, "/");

  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  path = path.replace(/\/{2,}/g, "/");

  if (path.length > 1) {
    path = path.replace(/\/+$/g, "") || ROOT_PATH;
  }

  return path || ROOT_PATH;
}

function safeSearch(value = "") {
  const raw = cleanText(value, "");

  if (!raw || raw === "?") return "";

  const search = raw.startsWith("?") ? raw : `?${raw.replace(/^\?+/, "")}`;

  try {
    const params = new URLSearchParams(search);

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

function safeHash(value = "") {
  const hash = cleanText(value, "");

  if (!hash || hash === "#") return "";
  if (/[\r\n\t\\]/.test(hash)) return "";

  return hash.startsWith("#")
    ? redact(hash)
    : redact(`#${hash.replace(/^#+/, "")}`);
}

function pathFromInput(value = ROOT_PATH) {
  const raw = cleanText(value, ROOT_PATH);

  try {
    if (isFunction(configRoutePathFromUrlLike)) {
      return configRoutePathFromUrlLike(raw) || ROOT_PATH;
    }
  } catch {
    // fallback abajo
  }

  if (!raw) return ROOT_PATH;
  if (raw.startsWith("//")) return ROOT_PATH;

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    try {
      const url = new URL(raw);

      if (isBrowser() && url.origin === window.location.origin) {
        return `${url.pathname || ROOT_PATH}${url.search || ""}${url.hash || ""}`;
      }

      return ROOT_PATH;
    } catch {
      return ROOT_PATH;
    }
  }

  if (/[\r\n\t\\]/.test(raw)) return ROOT_PATH;

  return raw;
}

function splitPath(value = ROOT_PATH) {
  let pathname = pathFromInput(value);
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
    search: safeSearch(search),
    hash: safeHash(hash),
  };
}

function normalizePublicPath(value = ROOT_PATH) {
  const parts = splitPath(value);

  return `${parts.pathname}${parts.search}${parts.hash}` || ROOT_PATH;
}

function normalizeCanonicalPath(value = ROOT_PATH) {
  const pathname = splitPath(value).pathname;

  if (!pathname.startsWith(USER_HOME_PREFIX)) {
    return pathname || ROOT_PATH;
  }

  const rest = pathname.slice(USER_HOME_PREFIX.length);
  const [, ...segments] = rest.split("/");

  return segments.length
    ? normalizePathname(`/${segments.join("/")}`)
    : ROOT_PATH;
}

function getUserScopedRouteInfo(value = ROOT_PATH) {
  try {
    if (isFunction(configGetUserScopedRouteInfo)) {
      return configGetUserScopedRouteInfo(value);
    }
  } catch {
    // fallback abajo
  }

  const pathname = splitPath(value).pathname;

  if (!pathname.startsWith(USER_HOME_PREFIX)) {
    return {
      scoped: false,
      home: false,
      slug: "",
      canonicalPath: pathname,
      restPath: pathname,
      lookupPath: pathname,
    };
  }

  const rest = pathname.slice(USER_HOME_PREFIX.length);
  const [slugSegment = "", ...segments] = rest.split("/");
  const slug = normalizeSlug(slugSegment);

  if (!slug) {
    return {
      scoped: false,
      home: false,
      slug: "",
      canonicalPath: pathname,
      restPath: pathname,
      lookupPath: pathname,
    };
  }

  const restPath = segments.length
    ? normalizePathname(`/${segments.join("/")}`)
    : ROOT_PATH;

  return {
    scoped: true,
    home: restPath === ROOT_PATH,
    slug,
    canonicalPath: restPath,
    restPath,
    lookupPath: restPath,
  };
}

function safeInternalPath(value = ROOT_PATH) {
  const raw = cleanText(value, ROOT_PATH);

  if (!raw) return ROOT_PATH;
  if (raw.startsWith("//")) return ROOT_PATH;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return ROOT_PATH;
  if (/[\r\n\t\\]/.test(raw)) return ROOT_PATH;

  const path = normalizePublicPath(raw);

  return path.startsWith("/") ? path : ROOT_PATH;
}

/* =========================================================
   SESSION
========================================================= */

function normalizeSessionContext(value = null, user = null) {
  if (!isObject(value)) return null;

  const sessionId = cleanText(
    first(value.sessionId, value.session_id, value.sid, value.id, ""),
    ""
  );

  const userId = cleanText(
    first(
      value.sessionUserId,
      value.session_user_id,
      value.userId,
      value.user_id,
      user?.userId,
      user?.id,
      ""
    ),
    ""
  );

  const expiresAt = first(
    value.expiresAt,
    value.expires_at,
    value.refreshExpiresAt,
    value.refresh_expires_at,
    null
  );

  if (!sessionId && !userId && !expiresAt) return null;

  return {
    sessionId: sessionId || null,
    id: sessionId || null,
    userId: userId || null,
    sessionUserId: userId || null,
    expiresAt,
    active: value.active !== false,
    revoked: value.revoked === true,
    persistent: value.persistent === true || value.restoreOnBoot === true,
  };
}

/* =========================================================
   STATE
========================================================= */

function sanitizePatchValue(key = "", value = null) {
  const normalizedKey = normalizeKey(key);

  if (SENSITIVE_KEYS.has(normalizedKey)) return undefined;

  if (key === "error" || key === "lastError") {
    return safeError(value);
  }

  if (key === "route" || key === "publicPath") {
    return normalizePublicPath(value);
  }

  if (key === "canonicalPath") {
    return normalizeCanonicalPath(value);
  }

  if (key === "routeParams") {
    return isObject(value) ? clone(value) || {} : {};
  }

  if (key === "theme") return "system";
  if (key === "lang") return "es";
  if (key === "locale") return "es-ES";

  if (
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint"
  ) {
    return undefined;
  }

  return clone(value);
}

function getState(options = {}) {
  updateAuthFlags();

  if (options.raw === true) {
    return state;
  }

  const snapshot = clone(state) || {};

  if (options.includeToken !== true) {
    snapshot.token = null;
    snapshot.accessToken = null;
    snapshot.access_token = null;
  }

  return snapshot;
}

function setState(patch = {}, options = {}) {
  if (!isObject(patch)) return getState(options);

  for (const [key, value] of Object.entries(patch)) {
    if (
      key === "user" ||
      key === "currentUser" ||
      key === "authUser" ||
      key === "sessionUser"
    ) {
      state.user = normalizeUser(value);
      continue;
    }

    if (key === "token" || key === "accessToken" || key === "access_token") {
      state.token = cleanToken(value);
      state.accessToken = state.token;
      state.access_token = state.token;
      continue;
    }

    if (key === "session" || key === "sessionData" || key === "currentSession") {
      const session = normalizeSessionContext(value, state.user);

      state.session = session;
      state.sessionData = session;
      state.sessionId = session?.sessionId || null;
      state.sessionUserId = session?.sessionUserId || null;
      state.hasSession = Boolean(session);
      continue;
    }

    const sanitized = sanitizePatchValue(key, value);

    if (sanitized !== undefined) {
      state[key] = sanitized;
    }
  }

  updateAuthFlags();

  return getState(options);
}

function patchState(patch = {}, options = {}) {
  return setState(patch, options);
}

function setRoute(route = ROOT_PATH) {
  state.route = normalizeCanonicalPath(route);
  state.canonicalPath = normalizeCanonicalPath(route);
  state.publicPath = normalizePublicPath(route);
  touch();

  return getState();
}

function setPublicPath(path = ROOT_PATH) {
  state.publicPath = normalizePublicPath(path);
  state.canonicalPath = normalizeCanonicalPath(path);
  state.route = state.canonicalPath;
  touch();

  return getState();
}

function setUser(user = null) {
  state.user = normalizeUser(user);
  updateAuthFlags();

  return getState();
}

function setToken(token = null) {
  const clean = cleanToken(token);

  state.token = clean;
  state.accessToken = clean;
  state.access_token = clean;

  updateAuthFlags();

  return getState();
}

function applySession(payload = {}) {
  if (!isObject(payload)) return getState();

  const token = first(
    payload.token,
    payload.accessToken,
    payload.access_token,
    payload.data?.token,
    payload.data?.accessToken,
    payload.data?.access_token,
    payload.auth?.token,
    payload.auth?.accessToken,
    null
  );

  const user = first(
    payload.user,
    payload.currentUser,
    payload.data?.user,
    payload.data?.currentUser,
    payload.auth?.user,
    payload.auth?.currentUser,
    null
  );

  const sessionPayload = first(
    payload.session,
    payload.sessionData,
    payload.currentSession,
    payload.data?.session,
    payload.auth?.session,
    null
  );

  if (token !== null && token !== undefined) {
    setToken(token);
  }

  if (user !== null && user !== undefined) {
    setUser(user);
  }

  if (sessionPayload !== null && sessionPayload !== undefined) {
    const session = normalizeSessionContext(sessionPayload, state.user);

    state.session = session;
    state.sessionData = session;
    state.sessionId = session?.sessionId || null;
    state.sessionUserId = session?.sessionUserId || null;
    state.hasSession = Boolean(session);
  }

  if (payload.hasRefreshToken !== undefined) {
    state.hasRefreshToken = payload.hasRefreshToken === true;
  }

  updateAuthFlags();

  return getState();
}

function clearSession() {
  state.token = null;
  state.accessToken = null;
  state.access_token = null;
  state.hasToken = false;

  state.authenticated = false;
  state.user = null;
  state.currentUser = null;
  state.hasUser = false;

  state.role = null;
  state.rol = null;
  state.roles = [];

  state.userSlug = null;
  state.homePath = ROOT_PATH;
  state.defaultHome = ROOT_PATH;
  state.postLoginTarget = null;

  state.session = null;
  state.sessionData = null;
  state.sessionId = null;
  state.sessionUserId = null;
  state.hasSession = false;
  state.hasRefreshToken = false;

  try {
    getHttpClient()?.clearAuthTokens?.();
  } catch {
    // noop
  }

  touch();

  return getState();
}

function setTheme() {
  state.theme = "system";
  touch();

  return getState();
}

function setLang() {
  state.lang = "es";
  state.locale = "es-ES";
  touch();

  return getState();
}

function setSidebarOpen(value = false) {
  state.sidebarOpen = value === true;
  touch();

  return getState();
}

function setLoading(value = false) {
  state.loading = value === true;
  touch();

  return getState();
}

function setError(error = null) {
  state.error = safeError(error);
  touch();

  return getState();
}

/* =========================================================
   AUTH HELPERS
========================================================= */

function isAuthenticated() {
  return getState().authenticated === true;
}

function getCurrentUser() {
  const snapshot = getState();

  return snapshot.hasUser ? snapshot.user || null : null;
}

function getCurrentRole() {
  return getState().role || null;
}

function hasRole(roleOrRoles = []) {
  const snapshot = getState();

  if (!snapshot.authenticated) return false;

  const requested = Array.isArray(roleOrRoles)
    ? roleOrRoles.flat(Infinity)
    : [roleOrRoles];

  const roles = requested.map(normalizeRole).filter(Boolean);

  if (!roles.length) return true;
  if (snapshot.role === "admin") return true;

  return roles.includes(snapshot.role);
}

function getAuthHeader() {
  const token = cleanToken(state.token || state.accessToken || state.access_token);

  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

/* =========================================================
   MODULES
========================================================= */

function registerModule(name = "", value = null, options = {}) {
  const key = cleanText(name, "");

  if (!key) return null;

  if (moduleRegistry.has(key) && options.overwrite === false) {
    return moduleRegistry.get(key);
  }

  moduleRegistry.set(key, value);

  return value;
}

function getModule(name = "") {
  return moduleRegistry.get(cleanText(name, "")) || null;
}

function removeModule(name = "") {
  return moduleRegistry.delete(cleanText(name, ""));
}

function listModules() {
  return [...moduleRegistry.keys()];
}

const modules = {
  register: registerModule,
  get: getModule,
  remove: removeModule,
  list: listModules,
};

/* =========================================================
   HTTP
========================================================= */

function setHttpClient(value = null) {
  if (!value) return false;

  httpClient = value;

  registerModule("http", httpClient, {
    overwrite: true,
  });

  return true;
}

function getHttpClient() {
  if (httpClient) return httpClient;

  httpClient = Http;

  registerModule("http", httpClient, {
    overwrite: true,
  });

  return httpClient;
}

function installHttpBridge(value = null) {
  if (value) {
    setHttpClient(value);
  }

  const client = getHttpClient();

  try {
    client?.install?.(AppCore);
  } catch {
    // noop
  }

  return client;
}

function getActiveRequest() {
  const client = getHttpClient();

  if (isFunction(client?.request)) {
    return client.request.bind(client);
  }

  if (isFunction(client)) {
    return client;
  }

  return null;
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
   TOAST BRIDGE
========================================================= */

function setShowToast(fn = null) {
  if (!isFunction(fn)) return false;

  toastBridge = fn;

  return true;
}

function showToast(message = "", type = "info", options = {}) {
  const text = isObject(message)
    ? cleanText(first(message.message, message.text, message.title, ""))
    : cleanText(message, "");

  if (!text) return null;

  const variant = isObject(message)
    ? cleanText(first(message.type, message.variant, type, "info"), "info")
    : cleanText(type, "info");

  if (toastBridge) {
    return toastBridge(text, variant, options);
  }

  const toast = getModule("toast");

  if (isFunction(toast?.show)) {
    return toast.show({
      ...(isObject(options) ? options : {}),
      type: variant,
      message: text,
    });
  }

  if (isFunction(toast?.[variant])) {
    return toast[variant](text, options);
  }

  return null;
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

  document.addEventListener("DOMContentLoaded", fn, {
    once: true,
  });

  return () => {
    try {
      document.removeEventListener("DOMContentLoaded", fn);
    } catch {
      // noop
    }

    return true;
  };
}

async function init() {
  if (state.initialized) return AppCore;

  state.booting = true;
  state.loading = true;
  state.ready = false;
  touch();

  installHttpBridge(Http);

  state.initialized = true;
  state.booting = false;
  state.loading = false;
  state.ready = true;
  touch();

  return AppCore;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function snapshotUser(user = null) {
  const safe = publicUser(user);

  if (!safe) return null;

  return {
    ...safe,
    avatarUrl: safe.avatarUrl ? "***" : "",
  };
}

function getSnapshot() {
  const snapshot = getState();

  return {
    version: CORE_VERSION,
    appName: APP_NAME,

    initialized: snapshot.initialized === true,
    ready: snapshot.ready === true,
    booting: snapshot.booting === true,
    loading: snapshot.loading === true,

    authenticated: snapshot.authenticated === true,
    hasToken: snapshot.hasToken === true,
    hasUser: snapshot.hasUser === true,

    user: snapshotUser(snapshot.user),
    role: snapshot.role,
    roles: Array.isArray(snapshot.roles) ? [...snapshot.roles] : [],

    userSlug: snapshot.userSlug,
    homePath: snapshot.homePath || ROOT_PATH,

    route: redact(snapshot.route || ROOT_PATH),
    canonicalPath: redact(snapshot.canonicalPath || ROOT_PATH),
    publicPath: redact(snapshot.publicPath || ROOT_PATH),

    lang: snapshot.lang,
    locale: snapshot.locale,
    theme: snapshot.theme,

    hasHttp: Boolean(httpClient),
    modules: listModules(),

    session: {
      hasSession: snapshot.hasSession === true,
      sessionId: snapshot.sessionId ? "***" : null,
      sessionUserId: snapshot.sessionUserId ? "***" : null,
      hasRefreshToken: snapshot.hasRefreshToken === true,
    },

    error: snapshot.error,
    updatedAt: snapshot.updatedAt,
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
  ui,

  modules,

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
  setHttpClient,
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
  isUsableUser,

  normalizeSessionContext,

  normalizePublicPath,
  normalizeCanonicalPath,
  getUserScopedRouteInfo,
  safeInternalPath,

  utils: {
    cleanText,
    text: cleanText,
    clone,
    redact,
    safeError,
    isObject,
    isFunction,
  },

  getSnapshot,
  getDebugSnapshot: getSnapshot,
  snapshot: getSnapshot,
};

Object.defineProperties(AppCore, {
  http: {
    get() {
      return getHttpClient();
    },
    set(value) {
      setHttpClient(value);
    },
  },

  Http: {
    get() {
      return getHttpClient();
    },
    set(value) {
      setHttpClient(value);
    },
  },

  auth: {
    get() {
      return getModule("auth");
    },
    set(value) {
      registerModule("auth", value, {
        overwrite: true,
      });
    },
  },

  Auth: {
    get() {
      return getModule("auth");
    },
    set(value) {
      registerModule("auth", value, {
        overwrite: true,
      });
    },
  },

  router: {
    get() {
      return getModule("router");
    },
    set(value) {
      registerModule("router", value, {
        overwrite: true,
      });
    },
  },

  Router: {
    get() {
      return getModule("router");
    },
    set(value) {
      registerModule("router", value, {
        overwrite: true,
      });
    },
  },

  toast: {
    get() {
      return getModule("toast");
    },
    set(value) {
      registerModule("toast", value, {
        overwrite: true,
      });
    },
  },

  Toast: {
    get() {
      return getModule("toast");
    },
    set(value) {
      registerModule("toast", value, {
        overwrite: true,
      });
    },
  },

  sidebar: {
    get() {
      return getModule("sidebar");
    },
    set(value) {
      registerModule("sidebar", value, {
        overwrite: true,
      });
    },
  },

  Sidebar: {
    get() {
      return getModule("sidebar");
    },
    set(value) {
      registerModule("sidebar", value, {
        overwrite: true,
      });
    },
  },

  topbar: {
    get() {
      return getModule("topbar");
    },
    set(value) {
      registerModule("topbar", value, {
        overwrite: true,
      });
    },
  },

  Topbar: {
    get() {
      return getModule("topbar");
    },
    set(value) {
      registerModule("topbar", value, {
        overwrite: true,
      });
    },
  },
});

export default AppCore;
