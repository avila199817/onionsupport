/* =========================================================
   Onion Support - Core
   Archivo: /src/core/index.js

   Responsabilidad:
   - Kernel mínimo global.
   - Estado en memoria delegado en core/state.js.
   - Compat de sesión delegada en core/session.js.
   - Event bus canónico desde core/events.js.
   - Registry de módulos canónico desde core/modules.js.
   - Cleanup canónico desde core/cleanup.js.
   - Hooks canónicos desde core/hooks.js.
   - HTTP único desde core/http.js.
   - Auth estricta base: access token usable + user usable.
   - Roles únicos: admin / user.
   - Home interna: /.
   - Home visible de usuario: /@{user.slug}.
   - Rutas, user-scope y bloqueos delegados en core/config.js.
   - Session context mínimo seguro en memoria.
   - No guardar refresh token en Core.
   - No guardar secretos persistentes.
   - Sin storage.
   - Sin DOM cache complejo.
   - Sin network listeners.
   - Sin fetch propio.
   - Sin cliente HTTP paralelo.
   - Sin framework interno.
   - Sin /home local.
   - Sin 2FA/MFA/OTP funcional.

   Contrato crítico:
   - Cambiar/rotar/caducar access token NO equivale a logout.
   - setToken(null) NO borra sesión salvo clearSession/force explícito.
   - Core no hace refresh automático; lo orquesta Auth/Session.
========================================================= */

import {
  config,
  ALLOWED_ROLES,
  SENSITIVE_QUERY_PARAMS,
  USER_HOME_PREFIX as CONFIG_USER_HOME_PREFIX,
  buildUserHomeRoute as configBuildUserHomeRoute,
  canonicalRoutePath as configCanonicalRoutePath,
  getUserScopedRouteInfo as configGetUserScopedRouteInfo,
  isBlockedRoutePath as configIsBlockedRoutePath,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "./config.js";

import {
  createInitialState,
  getStateBase as getStateSnapshot,
  setStateBase as setStateSnapshot,
  getStateDebugSnapshot,
} from "./state.js";

import {
  setRoute as sessionSetRoute,
  setPublicPath as sessionSetPublicPath,
  setUser as sessionSetUser,
  setToken as sessionSetToken,
  applySession as sessionApplySession,
  clearSession as sessionClearSession,
  setTheme as sessionSetTheme,
  setLang as sessionSetLang,
  setSidebarOpen as sessionSetSidebarOpen,
  setLoading as sessionSetLoading,
  setError as sessionSetError,
} from "./session.js";

import { createEvents } from "./events.js";
import { createModules } from "./modules.js";
import { createCleanup } from "./cleanup.js";
import { createHooks } from "./hooks.js";

import Http, { installHttp } from "./http.js";

export const CORE_VERSION = "core.index.v10";

const APP_NAME =
  config?.appName ||
  config?.name ||
  "Onion Support";

const ROOT_PATH = "/";
const USER_HOME_PREFIX = CONFIG_USER_HOME_PREFIX || "/@";

const VALID_ROLES = new Set(
  (Array.isArray(ALLOWED_ROLES) && ALLOWED_ROLES.length
    ? ALLOWED_ROLES
    : ["admin", "user"]
  ).map((role) => String(role).toLowerCase())
);

const TOKEN_STATE_KEYS = new Set([
  "token",
  "accesstoken",
  "access_token",
]);

const DROPPED_STATE_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",

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

  "password",
  "passwordhash",
  "password_hash",
  "hash",
  "salt",
  "passwordmeta",

  "secret",
  "secrets",
  "backupcode",
  "backupcodes",
  "backup_code",
  "backup_codes",

  "otp",
  "otpcode",
  "totp",
  "mfa",
  "twofa",
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
  ...DROPPED_STATE_KEYS,

  "token",
  "accesstoken",
  "access_token",
  "jwt",
  "bearer",
  "apikey",
  "api_key",
  "sas",
  "connectionstring",
  "connection_string",
]);

const SENSITIVE_QUERY_KEYS = new Set(
  [
    ...(Array.isArray(SENSITIVE_QUERY_PARAMS) ? SENSITIVE_QUERY_PARAMS : []),
    "token",
    "access_token",
    "accessToken",
    "refresh_token",
    "refreshToken",
    "id_token",
    "idToken",
    "code",
    "session",
    "sessionId",
  ]
    .map((key) => String(key || "").trim().toLowerCase())
    .filter(Boolean)
);

const SENSITIVE_QUERY_PATTERN = buildSensitiveQueryPattern();

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

function isPlainObject(value) {
  if (!isObject(value)) return false;

  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
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
  if (value === null) return null;

  const valueType = typeof value;

  if (
    valueType === "function" ||
    valueType === "symbol" ||
    valueType === "bigint"
  ) {
    return undefined;
  }

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
    return undefined;
  }
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
  const text = cleanText(value, "");
  const redactedQuery = SENSITIVE_QUERY_PATTERN
    ? text.replace(SENSITIVE_QUERY_PATTERN, "$1***")
    : text;

  return redactedQuery
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
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

/* =========================================================
   ROLES / TOKEN
========================================================= */

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
  return tokenOk(token) ? token : null;
}

/* =========================================================
   ROUTES / PATHS
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

  const normalized = value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;

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
  const value = cleanText(hash, "");

  if (!value || value === "#") return "";

  const normalized = value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;

  const body = normalized.slice(1);

  if (!body || /[\r\n\t\\]/.test(body)) return "";

  const queryIndex = body.indexOf("?");

  if (queryIndex >= 0) {
    const hashPath = body
      .slice(0, queryIndex)
      .replace(/[?#\\]/g, "");
    const query = body.slice(queryIndex + 1);
    const cleanQuery = normalizeSearch(`?${query}`);

    return cleanQuery ? `#${hashPath}${cleanQuery}` : `#${hashPath}`;
  }

  if (/^[^/?#=&]+=/i.test(body)) {
    const cleanQuery = normalizeSearch(`?${body}`);
    return cleanQuery ? `#${cleanQuery.slice(1)}` : "";
  }

  return redact(normalized);
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

function joinPath(parts = {}) {
  return [
    normalizePathname(parts.pathname || ROOT_PATH),
    normalizeSearch(parts.search || ""),
    normalizeHash(parts.hash || ""),
  ].join("");
}

function isBlockedRoutePath(path = ROOT_PATH) {
  try {
    return configIsBlockedRoutePath(path) === true;
  } catch {
    return false;
  }
}

function normalizePublicPath(path = ROOT_PATH) {
  const parts = splitPath(path);

  if (isBlockedRoutePath(parts.pathname)) {
    return ROOT_PATH;
  }

  return joinPath(parts) || ROOT_PATH;
}

function stripQueryHash(path = ROOT_PATH) {
  return splitPath(path).pathname || ROOT_PATH;
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
    // fallback mínimo abajo
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

function normalizeCanonicalPath(path = ROOT_PATH) {
  if (isBlockedRoutePath(path)) return ROOT_PATH;

  try {
    const canonical = configCanonicalRoutePath(path) || ROOT_PATH;
    return isBlockedRoutePath(canonical)
      ? ROOT_PATH
      : normalizePathname(canonical);
  } catch {
    const info = getUserScopedPathInfo(path);
    const canonical = info.scoped ? info.canonicalPath : stripQueryHash(path);

    return isBlockedRoutePath(canonical)
      ? ROOT_PATH
      : normalizePathname(canonical || ROOT_PATH);
  }
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

function safeInternalPath(path = ROOT_PATH) {
  const raw = cleanText(path, ROOT_PATH);

  if (!raw) return ROOT_PATH;
  if (raw.startsWith("//")) return ROOT_PATH;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return ROOT_PATH;
  if (/[\r\n\t\\]/.test(raw)) return ROOT_PATH;

  const target = normalizePublicPath(raw);

  if (!target.startsWith("/")) return ROOT_PATH;
  if (target.startsWith("//")) return ROOT_PATH;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return ROOT_PATH;
  if (/[\r\n\t\\]/.test(target)) return ROOT_PATH;
  if (isBlockedRoutePath(target)) return ROOT_PATH;

  return target || ROOT_PATH;
}

/* =========================================================
   USER / SESSION UTILITIES
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
  const slug = isObject(user)
    ? extractUserSlug(user)
    : normalizeSlug(user);

  try {
    return configBuildUserHomeRoute(slug) || ROOT_PATH;
  } catch {
    return slug ? `${USER_HOME_PREFIX}${slug}` : ROOT_PATH;
  }
}

function normalizeUser(user = null) {
  if (!isObject(user)) return null;

  const probe = createInitialState();

  setStateSnapshot(
    probe,
    {
      token: "__core_probe_token__",
      accessToken: "__core_probe_token__",
      user,
      currentUser: user,
    },
    {
      source: "core:normalizeUser",
      silent: true,
      emit: false,
    }
  );

  return probe.user || null;
}

function publicUser(user = null) {
  const normalized = normalizeUser(user);

  if (!normalized) return null;

  return {
    id: normalized.id || normalized.userId || null,
    userId: normalized.userId || normalized.id || null,
    username: normalized.username || null,
    slug: normalized.slug || null,
    displayName: normalized.displayName || null,
    role: normalized.role || null,
    hasAvatar: Boolean(normalized.hasAvatar || normalized.avatarUrl || normalized.avatar),
  };
}

function userAvatarUrl(user = null) {
  const normalized = normalizeUser(user);

  if (!normalized) return "";

  return cleanText(
    normalized.avatarUrl ||
      normalized.avatar ||
      normalized.picture ||
      normalized.photoUrl ||
      "",
    ""
  );
}

function normalizeSessionContext(value = null, user = null) {
  if (!isObject(value)) return null;

  const normalizedUser = normalizeUser(user) || user;

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
      normalizedUser?.userId ||
      normalizedUser?.id ||
      normalizedUser?.uid ||
      normalizedUser?.sub ||
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
   STATE
========================================================= */

const state = createInitialState();

let initialized = false;
let initPromise = null;
let toastBridge = null;
let httpClient = null;

/* =========================================================
   STATE SANITIZE
========================================================= */

function isDroppedStateKey(key = "") {
  return DROPPED_STATE_KEYS.has(normalizeKey(key));
}

function isTokenStateKey(key = "") {
  return TOKEN_STATE_KEYS.has(normalizeKey(key));
}

function isSensitiveObjectKey(key = "") {
  return SENSITIVE_OBJECT_KEYS.has(normalizeKey(key));
}

function sanitizeErrorValue(error = null) {
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
    name: cleanText(error.name, "Error"),
    message: redact(
      first(
        error.message,
        error.detail,
        error.reason,
        String(error)
      ) || ""
    ),
    code: error.code || error.error || null,
    status: error.status || error.statusCode || error.response?.status || null,
  };
}

function sanitizeObject(value, depth = 0) {
  if (depth > 8) return null;

  if (value === undefined) return undefined;
  if (value === null) return null;

  const valueType = typeof value;

  if (
    valueType === "function" ||
    valueType === "symbol" ||
    valueType === "bigint"
  ) {
    return undefined;
  }

  if (valueType === "string") {
    return redact(value);
  }

  if (valueType === "number" || valueType === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 500)
      .map((item) => sanitizeObject(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (!isPlainObject(value)) {
    return null;
  }

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

    if (key === "error" || key === "lastError") {
      output[key] = sanitizeErrorValue(value);
      continue;
    }

    const sanitized = sanitizeObject(value);

    if (sanitized !== undefined) {
      output[key] = sanitized;
    }
  }

  return output;
}

function collectChangedPathsFromPatch(patch = {}) {
  if (!isObject(patch)) return [];

  return [
    ...new Set(
      Object.keys(patch)
        .map((key) => cleanText(key, ""))
        .filter(Boolean)
        .filter((key) => !isDroppedStateKey(key))
        .filter((key) => !isTokenStateKey(key))
    ),
  ];
}

function emitStateChange(source = "core:setState", changedPaths = []) {
  const paths = Array.isArray(changedPaths)
    ? changedPaths.filter(Boolean)
    : [];

  events.emit("app:state:change", {
    state: getState(),
    source,
    changedPaths: paths,
    paths,
    timestamp: Date.now(),
  });
}

/* =========================================================
   STATE API
========================================================= */

function getState(options = {}) {
  dropForbiddenStateFields(state);

  return options.raw === true
    ? state
    : getStateSnapshot(state, options);
}

function setState(patch = {}, options = {}) {
  dropForbiddenStateFields(state);

  const safePatch = sanitizeStatePatch(patch);
  const changedPaths = collectChangedPathsFromPatch(safePatch);
  const beforeCount = Number(state.stateChangeCount || 0);

  const snapshot = setStateSnapshot(
    state,
    safePatch,
    {
      ...options,
      source: options.source || "core:setState",
    }
  );

  dropForbiddenStateFields(state);

  if (
    Number(state.stateChangeCount || 0) !== beforeCount &&
    options.emit !== false &&
    options.silent !== true
  ) {
    emitStateChange(options.source || "core:setState", changedPaths);
  }

  return options.raw === true ? state : snapshot;
}

function patchState(patch = {}, options = {}) {
  return setState(patch, options);
}

function isAuthenticated() {
  return Boolean(getState().authenticated);
}

function getCurrentUser() {
  return getState().user || null;
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

  if (!requested.length) return true;

  const required = requested.map(normalizeRole).filter(Boolean);

  if (!required.length) return false;
  if (snapshot.role === "admin") return true;

  return required.includes(snapshot.role);
}

function getAuthHeader() {
  const snapshot = getState({ includeToken: true });
  const token = cleanToken(snapshot.token || snapshot.accessToken || snapshot.access_token);

  if (!token) return {};

  return {
    Authorization: `Bearer ${token}`,
  };
}

/* =========================================================
   STATE WRAPPERS
========================================================= */

function setRoute(route = ROOT_PATH, options = {}) {
  return sessionSetRoute({
    state,
    setState,
    events,
    route,
    options: {
      ...options,
      source: options.source || "core:setRoute",
    },
  });
}

function setPublicPath(path = ROOT_PATH, options = {}) {
  return sessionSetPublicPath({
    state,
    setState,
    events,
    path,
    options: {
      ...options,
      source: options.source || "core:setPublicPath",
    },
  });
}

function setUser(user = null, options = {}) {
  return sessionSetUser({
    state,
    setState,
    events,
    user,
    options: {
      ...options,
      source: options.source || "core:setUser",
    },
  });
}

function setToken(token = null, options = {}) {
  const clean = cleanToken(token);

  const result = sessionSetToken({
    state,
    setState,
    events,
    token,
    options: {
      ...options,
      source: options.source || "core:setToken",
    },
  });

  if (clean) {
    safeCall((httpClient || Http)?.setAccessToken, httpClient || Http, clean);
  }

  if (!clean && (options.clearSession === true || options.forceUnauthenticated === true)) {
    safeCall((httpClient || Http)?.clearAuthTokens, httpClient || Http, {
      clearState: true,
    });
  }

  return result;
}

function applySession(payload = {}, options = {}) {
  const snapshot = sessionApplySession({
    ...(isObject(payload) ? payload : {}),
    state,
    setState,
    events,
    options: {
      ...options,
      source: options.source || "core:applySession",
    },
  });

  const token = cleanToken(state.token || state.accessToken || state.access_token);

  if (token) {
    safeCall((httpClient || Http)?.setAccessToken, httpClient || Http, token);
  }

  return snapshot;
}

function clearSession(options = {}) {
  const result = sessionClearSession({
    state,
    setState,
    events,
    options: {
      ...options,
      source: options.source || "core:clearSession",
    },
  });

  safeCall((httpClient || Http)?.clearAuthTokens, httpClient || Http, {
    clearState: true,
  });

  return result;
}

function setTheme(_theme = "system", options = {}) {
  return sessionSetTheme({
    setState,
    events,
    theme: "system",
    options: {
      ...options,
      source: options.source || "core:setTheme",
    },
  });
}

function setLang(_lang = "es", options = {}) {
  return sessionSetLang({
    setState,
    events,
    lang: "es",
    options: {
      ...options,
      source: options.source || "core:setLang",
    },
  });
}

function setSidebarOpen(value = false) {
  return sessionSetSidebarOpen({
    setState,
    value,
  });
}

function setLoading(value = false) {
  return sessionSetLoading({
    setState,
    events,
    value,
  });
}

function setError(error = null, options = {}) {
  return sessionSetError({
    setState,
    events,
    error,
    options,
  });
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
      setState(
        {
          booting: true,
          loading: true,
          ready: false,
          appReady: false,
          appFatal: false,
        },
        {
          source: "core:init:start",
          silent: true,
        }
      );

      await hooks.run("beforeInit", {
        core: AppCore,
        options,
      });

      installHttpBridge(options);

      initialized = true;

      setState(
        {
          initialized: true,
          booting: false,
          loading: false,
          ready: true,
          appReady: true,
        },
        {
          source: "core:init:ready",
          silent: true,
        }
      );

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
      setState(
        {
          booting: false,
          loading: false,
          ready: false,
          appReady: false,
          appFatal: true,
        },
        {
          source: "core:init:error",
          silent: true,
        }
      );

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
  const snapshot = getState();
  const debug = getStateDebugSnapshot(state);

  return {
    version: CORE_VERSION,

    appName: APP_NAME,

    initialized,
    ready: Boolean(snapshot.ready),
    booting: Boolean(snapshot.booting),
    loading: Boolean(snapshot.loading),

    authenticated: Boolean(snapshot.authenticated),
    hasToken: Boolean(snapshot.hasToken),
    hasRefreshToken: Boolean(snapshot.hasRefreshToken),

    token: null,
    accessToken: null,
    refreshToken: null,

    user: publicUser(snapshot.user),

    userSlug: snapshot.userSlug || null,
    homePath: snapshot.homePath || ROOT_PATH,
    defaultHome: snapshot.defaultHome || snapshot.homePath || ROOT_PATH,

    role: snapshot.role,
    roles: Array.isArray(snapshot.roles) ? [...snapshot.roles] : [],

    hasSessionContext: Boolean(snapshot.sessionId || snapshot.sessionUserId || snapshot.session),
    sessionId: snapshot.sessionId ? "***" : null,
    sessionUserId: snapshot.sessionUserId ? "***" : null,

    route: redact(snapshot.route || ROOT_PATH),
    canonicalPath: redact(snapshot.canonicalPath || ROOT_PATH),
    publicPath: redact(snapshot.publicPath || ROOT_PATH),

    lang: snapshot.lang,
    locale: snapshot.locale,
    theme: snapshot.theme,

    hasHttp: Boolean(httpClient),
    modules: modules.list(),
    events: events.names(),
    cleanup: cleanup.getSnapshot?.() || null,
    hooks: hooks.getSnapshot?.() || null,

    updatedAt: snapshot.updatedAt || null,
    stateChangeCount: Number(snapshot.stateChangeCount || 0),

    state: {
      version: debug.version,
      policy: debug.policy,
    },

    policy: {
      memoryStateOnly: true,
      stateDelegatedToCoreState: true,
      sessionDelegatedToCoreSession: true,

      noStorage: true,
      noFetchOwn: true,
      httpFacadeOnly: true,
      noApiClientParallel: true,

      configOwnsRouteNormalization: true,
      configOwnsUserScope: true,
      configOwnsBlockedRoutes: true,
      noLocalBlockedRouteList: true,

      roles: [...VALID_ROLES],
      authRequiresTokenAndUsableUser: true,

      userSlugHome: true,
      userScopedPrivateRoutes: true,
      noEmailIdentity: true,

      safeSessionContextOnly: true,
      noSessionSecrets: true,
      noSessionIpUserAgent: true,
      noRefreshTokenInCoreState: true,

      tokenRotationDoesNotLogout: true,
      emptySetTokenDoesNotLogout: true,

      themeOwnedBySystem: true,
      langBaseEs: true,

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
