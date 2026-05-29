/* =========================================================
   Onion Support - Core
   Archivo: /src/core/index.js

   Responsabilidad:
   - Kernel mínimo global.
   - Estado mínimo en memoria.
   - Sesión actual en memoria.
   - Helpers básicos de usuario/rol/ruta.
   - Puente único hacia core/http.js.
   - Sin Store, Services, hooks, cleanup, event bus, network listeners,
     fetch propio, i18n funcional ni framework interno.
========================================================= */

import { config } from "./config.js";
import Http from "./http.js";

export const CORE_VERSION = "core.minimal.v1";

const APP_NAME = config?.appName || config?.name || "Onion Support";
const ROOT_PATH = "/";
const USER_HOME_PREFIX = "/@";

const VALID_ROLES = new Set(["admin", "user"]);

const BAD_USER_STATUSES = new Set([
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
  "revocado",
  "bloqueado",
  "baneado",
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

  "token",
  "accesstoken",
  "access_token",
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

  "otp",
  "totp",
  "mfa",
  "twofa",
  "twofa_secret",
  "backupcode",
  "backupcodes",
  "backup_code",
  "backup_codes",

  "_rid",
  "_self",
  "_etag",
  "_attachments",
  "_ts",
  "_lsn",
  "_metadata",
]);

const SENSITIVE_QUERY_KEYS = new Set([
  "token",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "id_token",
  "idtoken",
  "code",
  "secret",
  "session",
  "sessionid",
  "session_id",
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

const state = {
  initialized: false,
  ready: false,
  booting: false,
  loading: false,
  error: null,

  token: null,
  accessToken: null,
  hasToken: false,

  authenticated: false,
  user: null,
  currentUser: null,
  hasUser: false,

  role: null,
  roles: [],

  userSlug: null,
  homePath: ROOT_PATH,

  session: null,
  sessionId: null,
  sessionUserId: null,

  route: ROOT_PATH,
  canonicalPath: ROOT_PATH,
  publicPath: ROOT_PATH,

  lang: "es",
  locale: "es-ES",
  theme: "system",

  updatedAt: null,
};

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
  return cleanText(value, "").replace(/[-_\s]/g, "").toLowerCase();
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
  let text = cleanText(value, "");

  try {
    const fakeUrl = new URL(text, "https://onionsupport.local");

    for (const key of [...fakeUrl.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(normalizeKey(key))) {
        fakeUrl.searchParams.set(key, "***");
      }
    }

    if (text.startsWith("http://") || text.startsWith("https://")) {
      text = fakeUrl.toString();
    } else {
      text = `${fakeUrl.pathname}${fakeUrl.search}${fakeUrl.hash}`;
    }
  } catch {
    text = text.replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    );
  }

  return text
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
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

  return slug ? `${USER_HOME_PREFIX}${slug}` : ROOT_PATH;
}

function userStatus(user = null) {
  if (!isObject(user)) return "";

  return cleanText(
    first(user.status, user.estado, user.state, user.accountStatus, ""),
    ""
  ).toLowerCase();
}

function isUsableUser(user = null) {
  if (!isObject(user)) return false;
  if (user.disabled === true) return false;
  if (user.deleted === true) return false;
  if (user.archived === true) return false;
  if (user.active === false) return false;

  const status = userStatus(user);

  if (status && BAD_USER_STATUSES.has(status)) return false;

  return true;
}

function publicUser(user = null) {
  if (!isObject(user)) return null;

  return {
    id: first(user.id, user.userId, null),
    userId: first(user.userId, user.id, null),

    username: first(user.username, user.userName, user.user_name, null),
    slug: extractUserSlug(user),

    displayName: first(
      user.displayName,
      user.fullName,
      user.name,
      user.nombre,
      user.profile?.displayName,
      user.profile?.name,
      ""
    ),

    email: first(user.email, user.mail, null),

    role: normalizeRole(first(user.role, user.rol, user.roles, "")) || "user",
    roles: [normalizeRole(first(user.role, user.rol, user.roles, "")) || "user"],

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

    active: user.active !== false,
    status: userStatus(user) || "active",
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
  const token = cleanToken(state.token || state.accessToken);

  const role = normalizeRole(first(user?.role, state.role, "user")) || "user";
  const slug = extractUserSlug(user);

  state.token = token;
  state.accessToken = token;
  state.hasToken = Boolean(token);

  state.hasUser = usableUser;
  state.currentUser = user || null;

  state.role = usableUser ? role : null;
  state.roles = usableUser ? [role] : [];

  state.userSlug = usableUser ? slug || null : null;
  state.homePath = usableUser ? buildUserHomePath(slug) : ROOT_PATH;

  state.authenticated = Boolean(token && usableUser);

  touch();
}

/* =========================================================
   ROUTES
========================================================= */

function normalizePathname(value = ROOT_PATH) {
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

  return hash.startsWith("#") ? redact(hash) : redact(`#${hash.replace(/^#+/, "")}`);
}

function splitPath(value = ROOT_PATH) {
  let raw = cleanText(value, ROOT_PATH);

  if (raw.startsWith("//")) raw = ROOT_PATH;

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    try {
      const url = new URL(raw);

      if (isBrowser() && url.origin === window.location.origin) {
        raw = `${url.pathname}${url.search}${url.hash}`;
      } else {
        raw = ROOT_PATH;
      }
    } catch {
      raw = ROOT_PATH;
    }
  }

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
  const pathname = splitPath(value).pathname;

  if (!pathname.startsWith(USER_HOME_PREFIX)) {
    return {
      scoped: false,
      home: false,
      slug: "",
      canonicalPath: pathname,
      restPath: pathname,
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

  if (key === "theme") return "system";
  if (key === "lang") return "es";
  if (key === "locale") return "es-ES";

  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
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
  }

  return snapshot;
}

function setState(patch = {}, options = {}) {
  if (!isObject(patch)) return getState(options);

  for (const [key, value] of Object.entries(patch)) {
    if (key === "user" || key === "currentUser") {
      state.user = normalizeUser(value);
      continue;
    }

    if (key === "token" || key === "accessToken" || key === "access_token") {
      state.token = cleanToken(value);
      state.accessToken = state.token;
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

function setToken(token = null, options = {}) {
  const clean = cleanToken(token);

  state.token = clean;
  state.accessToken = clean;

  if (clean) {
    callHttp("setAccessToken", clean);
  } else if (options.clearSession === true || options.force === true) {
    callHttp("clearAuthTokens");
  }

  updateAuthFlags();

  return getState();
}

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
    persistent: value.persistent === true,
  };
}

function applySession(payload = {}, options = {}) {
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
    payload.currentSession,
    payload.data?.session,
    payload.auth?.session,
    payload,
    null
  );

  if (token !== null && token !== undefined) {
    setToken(token, options);
  }

  if (user !== null && user !== undefined) {
    setUser(user);
  }

  const session = normalizeSessionContext(sessionPayload, state.user);

  state.session = session;
  state.sessionId = session?.sessionId || null;
  state.sessionUserId = session?.sessionUserId || null;

  updateAuthFlags();

  return getState();
}

function clearSession() {
  state.token = null;
  state.accessToken = null;
  state.hasToken = false;

  state.authenticated = false;
  state.user = null;
  state.currentUser = null;
  state.hasUser = false;

  state.role = null;
  state.roles = [];

  state.userSlug = null;
  state.homePath = ROOT_PATH;

  state.session = null;
  state.sessionId = null;
  state.sessionUserId = null;

  callHttp("clearAuthTokens");

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

  const roles = requested.map(normalizeRole).filter(Boolean);

  if (!roles.length) return true;
  if (snapshot.role === "admin") return true;

  return roles.includes(snapshot.role);
}

function getAuthHeader() {
  const token = cleanToken(state.token || state.accessToken);

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

function callHttp(method = "", ...args) {
  const client = getHttpClient();
  const fn = client?.[method];

  if (!isFunction(fn)) return null;

  try {
    return fn.apply(client, args);
  } catch {
    return null;
  }
}

function setHttpClient(value = null) {
  if (!value) return false;

  httpClient = value;
  registerModule("http", httpClient, { overwrite: true });

  return true;
}

function getHttpClient() {
  if (httpClient) return httpClient;

  httpClient = Http;
  registerModule("http", httpClient, { overwrite: true });

  return httpClient;
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

function installHttpBridge(value = null) {
  if (value) {
    setHttpClient(value);
  }

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

  document.addEventListener("DOMContentLoaded", fn, { once: true });

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

  getHttpClient();

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

    user: publicUser(snapshot.user),
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
      hasSession: Boolean(snapshot.sessionId || snapshot.sessionUserId || snapshot.session),
      sessionId: snapshot.sessionId ? "***" : null,
      sessionUserId: snapshot.sessionUserId ? "***" : null,
    },

    error: snapshot.error,
    updatedAt: snapshot.updatedAt,

    policy: {
      memoryOnly: true,
      noStore: true,
      noServices: true,
      noEvents: true,
      noHooks: true,
      noCleanupRegistry: true,
      noNetworkListeners: true,
      noFetchOwn: true,
      httpBridgeOnly: true,
      roles: ["admin", "user"],
      themeSystemOnly: true,
      langBaseEs: true,
      noMfaOtp: true,
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
  dom: {},

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
      registerModule("auth", value, { overwrite: true });
    },
  },

  Auth: {
    get() {
      return getModule("auth");
    },
    set(value) {
      registerModule("auth", value, { overwrite: true });
    },
  },

  router: {
    get() {
      return getModule("router");
    },
    set(value) {
      registerModule("router", value, { overwrite: true });
    },
  },

  Router: {
    get() {
      return getModule("router");
    },
    set(value) {
      registerModule("router", value, { overwrite: true });
    },
  },

  toast: {
    get() {
      return getModule("toast");
    },
    set(value) {
      registerModule("toast", value, { overwrite: true });
    },
  },

  Toast: {
    get() {
      return getModule("toast");
    },
    set(value) {
      registerModule("toast", value, { overwrite: true });
    },
  },
});

export default AppCore;
