/* =========================================================
   Onion Support - Core
   Archivo: /src/core/index.js

   Responsabilidad:
   - Kernel mínimo global.
   - Estado en memoria.
   - Event bus mínimo.
   - Registry mínimo de módulos.
   - Cleanup mínimo.
   - Hooks mínimos.
   - Instalar HTTP único desde core/http.js.
   - Auth estricta: token + user usable.
   - User inválido si disabled/deleted/archived/active=false.
   - Roles únicos: admin / user.
   - Home visible de usuario: /@{user.slug}.
   - Session context mínimo seguro en memoria.
   - Sin storage.
   - Sin DOM cache complejo.
   - Sin network listeners.
   - Sin fetch propio.
   - Sin cliente HTTP paralelo.
   - Sin framework interno.
   - Sin magia negra.
========================================================= */

import { config } from "./config.js";
import Http, { installHttp } from "./http.js";

export const CORE_VERSION = "core.index.v4";

const APP_NAME =
  config?.appName ||
  config?.name ||
  "Onion Support";

const ROOT_PATH = "/";
const USER_HOME_PREFIX = "/@";

const VALID_ROLES = Object.freeze(["admin", "user"]);
const INVALID_USER_STATUSES = Object.freeze(["disabled", "deleted", "archived"]);

const DROPPED_STATE_KEYS = Object.freeze([
  "password",
  "passwordHash",
  "hash",
  "salt",

  "refreshToken",
  "refresh_token",

  "resetToken",
  "activationToken",

  "secret",
  "secrets",
  "code",
  "codes",
  "backupCodes",

  "auth",
]);

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
  const output = String(value ?? "").trim();
  return output || fallback;
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
  return String(value || "")
    .replace(/([?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
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

  const role = String(value || "").trim().toLowerCase();

  return VALID_ROLES.includes(role) ? role : "";
}

function cleanRole(value = "") {
  return normalizeRole(value) || "user";
}

/* =========================================================
   TOKEN
========================================================= */

function tokenOk(value = "") {
  const token = cleanText(value, "").replace(/^Bearer\s+/i, "");

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
  const token = cleanText(value, "").replace(/^Bearer\s+/i, "");
  return tokenOk(token) ? token : null;
}

/* =========================================================
   USER NORMALIZATION
========================================================= */

function normalizeSlug(value = "") {
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

function extractUserSlug(user = null) {
  if (!isObject(user)) return "";

  return normalizeSlug(
    user.slug ||
      user.lookup?.slug ||
      user.profile?.slug ||
      ""
  );
}

function buildUserHomePath(user = null) {
  const slug = extractUserSlug(user);
  return slug ? `${USER_HOME_PREFIX}${slug}` : ROOT_PATH;
}

function removeSensitiveUserFields(user = {}) {
  if (!isObject(user)) return {};

  const output = { ...user };

  for (const key of DROPPED_STATE_KEYS) {
    delete output[key];
  }

  for (const key of [
    "token",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "session",
    "sessionData",
  ]) {
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
      INVALID_USER_STATUSES.includes(status)
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

function userOk(user = null) {
  return Boolean(
    isObject(user) &&
      !userDisabled(user) &&
      hasUserIdentity(user)
  );
}

function normalizeUser(user = null) {
  if (!userOk(user)) return null;

  const safeUser = removeSensitiveUserFields(user);

  const id = cleanText(safeUser.userId || safeUser.id, "");
  const slug = extractUserSlug(safeUser);
  const profile = isObject(safeUser.profile) ? safeUser.profile : {};

  const username = cleanText(
    safeUser.username ||
      safeUser.userName ||
      safeUser.user_name ||
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

  return {
    ...safeUser,

    id: id || null,
    userId: safeUser.userId || id || null,

    username: username || null,
    slug: slug || null,

    name: safeUser.name || displayName,
    fullName: safeUser.fullName || displayName,
    displayName,

    email: safeUser.email || null,

    role,
    rol: role,
    roles: [role],

    active: true,
    disabled: false,

    isAdmin: role === "admin",
    isUser: role === "user",
  };
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
    hasAvatar: Boolean(
      normalized.avatar ||
        normalized.avatarUrl ||
        normalized.picture
    ),
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
      user?.userId ||
      user?.id ||
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

    userId: userId || null,
    sessionUserId: userId || null,

    expiresAt,
    refreshExpiresAt: value.refreshExpiresAt || value.refresh_expires_at || expiresAt || null,
  };
}

function sameSessionUser(session = null, user = null) {
  if (!session || !user) return false;

  const sessionUserId = cleanText(session.userId || session.sessionUserId, "");
  const userId = cleanText(user.userId || user.id, "");

  if (!sessionUserId || !userId) return true;

  return sessionUserId === userId;
}

/* =========================================================
   PATHS
========================================================= */

function normalizeHashPath(path = ROOT_PATH) {
  const value = cleanText(path, ROOT_PATH);

  if (value.startsWith("#!")) {
    return value.replace(/^#!\/?/, "/") || ROOT_PATH;
  }

  if (value.startsWith("#/")) {
    return value.slice(1) || ROOT_PATH;
  }

  return value;
}

function normalizePublicPath(path = ROOT_PATH) {
  let value = normalizeHashPath(path);

  if (!value || value.startsWith("//")) {
    return ROOT_PATH;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return ROOT_PATH;
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value = value
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  return value || ROOT_PATH;
}

function stripQueryHash(path = ROOT_PATH) {
  return normalizePublicPath(path)
    .split("?")[0]
    .split("#")[0] || ROOT_PATH;
}

function extractUserHomeSlug(path = ROOT_PATH) {
  const value = stripQueryHash(path);

  if (!value.startsWith(USER_HOME_PREFIX)) return "";

  const slug = value.slice(USER_HOME_PREFIX.length);

  if (!slug || slug.includes("/")) return "";

  return normalizeSlug(slug);
}

function isUserHomePath(path = ROOT_PATH) {
  return Boolean(extractUserHomeSlug(path));
}

function normalizeCanonicalPath(path = ROOT_PATH) {
  let value = stripQueryHash(path);

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || ROOT_PATH;
  }

  return isUserHomePath(value) ? ROOT_PATH : value;
}

function safeInternalPath(path = ROOT_PATH) {
  const target = normalizePublicPath(path);

  if (!target.startsWith("/")) return ROOT_PATH;
  if (target.startsWith("//")) return ROOT_PATH;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return ROOT_PATH;
  if (/[\r\n\t\\]/.test(target)) return ROOT_PATH;

  return target;
}

/* =========================================================
   EVENTS
========================================================= */

function createEvents() {
  const listeners = new Map();

  function on(name = "", handler = null) {
    if (!name || !isFunction(handler)) return () => false;

    if (!listeners.has(name)) {
      listeners.set(name, new Set());
    }

    listeners.get(name).add(handler);

    return () => off(name, handler);
  }

  function once(name = "", handler = null) {
    if (!isFunction(handler)) return () => false;

    const dispose = on(name, (event) => {
      dispose();
      handler(event);
    });

    return dispose;
  }

  function off(name = "", handler = null) {
    if (!name) return false;

    if (!handler) {
      listeners.delete(name);
      return true;
    }

    listeners.get(name)?.delete(handler);
    return true;
  }

  function emit(name = "", payload = {}) {
    if (!name) return false;

    const event = {
      type: name,
      detail: payload,
      payload,
    };

    for (const handler of [...(listeners.get(name) || [])]) {
      try {
        handler(event);
      } catch {
        // Un listener no debe romper Core.
      }
    }

    return true;
  }

  function clear() {
    listeners.clear();
    return true;
  }

  function getSnapshot() {
    return {
      names: [...listeners.keys()],
    };
  }

  return {
    on,
    once,
    off,
    emit,
    clear,
    getSnapshot,
  };
}

/* =========================================================
   MODULES
========================================================= */

function createModules() {
  const map = new Map();

  function register(name = "", value = null) {
    if (!name || !value) return false;

    map.set(name, value);
    return value;
  }

  function get(name = "") {
    return map.get(name) || null;
  }

  function remove(name = "") {
    return map.delete(name);
  }

  function list() {
    return [...map.keys()];
  }

  function getSnapshot() {
    return {
      count: map.size,
      modules: list(),
    };
  }

  return {
    register,
    get,
    has: (name = "") => map.has(name),
    remove,
    list,
    getSnapshot,
  };
}

/* =========================================================
   CLEANUP
========================================================= */

function createCleanup() {
  const scopes = new Map();

  function add(scope = "global", disposer = null) {
    if (!isFunction(disposer)) return () => false;

    if (!scopes.has(scope)) {
      scopes.set(scope, new Set());
    }

    scopes.get(scope).add(disposer);

    return () => {
      try {
        disposer();
      } catch {
        // noop
      }

      scopes.get(scope)?.delete(disposer);
      return true;
    };
  }

  function event(scope = "global", target = null, eventName = "", handler = null, options = false) {
    if (!target || !eventName || !isFunction(handler)) {
      return () => false;
    }

    try {
      target.addEventListener(eventName, handler, options);
    } catch {
      return () => false;
    }

    return add(scope, () => {
      try {
        target.removeEventListener(eventName, handler, options);
      } catch {
        // noop
      }
    });
  }

  function run(scope = "") {
    const names = scope ? [scope] : [...scopes.keys()];

    for (const name of names) {
      for (const disposer of [...(scopes.get(name) || [])]) {
        try {
          disposer();
        } catch {
          // noop
        }
      }

      scopes.delete(name);
    }

    return true;
  }

  function getSnapshot() {
    return {
      scopes: [...scopes.keys()],
    };
  }

  return {
    add,
    event,
    run,
    clear: run,
    dispose: run,
    getSnapshot,
  };
}

/* =========================================================
   HOOKS
========================================================= */

function createHooks() {
  const map = new Map();

  function add(name = "", handler = null) {
    if (!name || !isFunction(handler)) return () => false;

    if (!map.has(name)) {
      map.set(name, []);
    }

    map.get(name).push(handler);

    return () => {
      map.set(
        name,
        (map.get(name) || []).filter((item) => item !== handler)
      );

      return true;
    };
  }

  async function run(name = "", payload = {}) {
    let current = payload;

    for (const handler of map.get(name) || []) {
      try {
        const next = await handler(current);

        if (next !== undefined) {
          current = next;
        }
      } catch {
        // Un hook no debe romper Core.
      }
    }

    return current;
  }

  function clear(name = "") {
    if (name) {
      map.delete(name);
    } else {
      map.clear();
    }

    return true;
  }

  function getSnapshot() {
    return {
      hooks: [...map.keys()],
    };
  }

  return {
    add,
    run,
    clear,
    getSnapshot,
  };
}

const events = createEvents();
const modules = createModules();
const cleanup = createCleanup();
const hooks = createHooks();

const services = {};
const dom = {};

const registry = {
  modules,
  hooks,
  cleanup,
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
  avatar: null,
  avatarUrl: null,

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
};

let initialized = false;
let initPromise = null;
let toastBridge = null;
let httpClient = null;

/* =========================================================
   STATE SANITIZE
========================================================= */

function dropForbiddenStateFields(target = state) {
  for (const key of DROPPED_STATE_KEYS) {
    try {
      delete target[key];
    } catch {
      // noop
    }
  }

  return target;
}

function sanitizeStatePatch(patch = {}) {
  if (!isObject(patch)) return {};

  const output = {};

  for (const [key, value] of Object.entries(patch)) {
    if (DROPPED_STATE_KEYS.includes(key)) {
      continue;
    }

    if (
      key === "token" ||
      key === "accessToken" ||
      key === "access_token"
    ) {
      output[key] = cleanToken(value);
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
      output.publicPath = normalizePublicPath(value);
      output.canonicalPath = normalizeCanonicalPath(value);
      output.route = normalizeCanonicalPath(value);
      continue;
    }

    if (key === "route" || key === "canonicalPath") {
      output[key] = normalizeCanonicalPath(value);
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
  state.avatar = null;
  state.avatarUrl = null;

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
  state.avatar = authenticated ? user.avatar || user.avatarUrl || null : null;
  state.avatarUrl = authenticated ? user.avatarUrl || user.avatar || null : null;

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
  const publicPath = normalizePublicPath(path);
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

function pick(payload = {}, names = []) {
  for (const name of names) {
    const value =
      payload?.[name] ??
      payload?.data?.[name] ??
      payload?.payload?.[name] ??
      payload?.session?.[name] ??
      payload?.sessionData?.[name];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function pickSession(payload = {}) {
  if (!isObject(payload)) return null;

  return (
    (isObject(payload.session) ? payload.session : null) ||
    (isObject(payload.sessionData) ? payload.sessionData : null) ||
    (isObject(payload.data?.session) ? payload.data.session : null) ||
    (isObject(payload.data?.sessionData) ? payload.data.sessionData : null) ||
    (isObject(payload.payload?.session) ? payload.payload.session : null) ||
    (isObject(payload.payload?.sessionData) ? payload.payload.sessionData : null) ||
    null
  );
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
    homePath: state.homePath,
    defaultHome: state.defaultHome,
    postLoginTarget: state.postLoginTarget,
    session: state.session,
  };
}

function clearSession(options = {}) {
  clearSessionFields();

  if (options.emit !== false && options.silent !== true) {
    events.emit("app:state:change", {
      state: getState(),
      source: options.source || "core:clearSession",
    });
  }

  return true;
}

function setTheme(theme = "system") {
  const value = ["dark", "light", "system"].includes(theme)
    ? theme
    : "system";

  state.theme = value;
  return value;
}

function setLang(lang = "es") {
  const value = ["es", "ca", "en"].includes(lang) ? lang : "es";

  state.lang = value;
  state.language = value;
  state.locale = value;

  return value;
}

function setSidebarOpen(value = false) {
  state.sidebarOpen = Boolean(value);
  return state.sidebarOpen;
}

function setLoading(value = false) {
  state.loading = Boolean(value);
  return state.loading;
}

function normalizeError(error = null) {
  if (!error) return null;

  return {
    name: cleanText(error?.name, "Error"),
    message: redact(error?.message || String(error)),
    code: error?.code || error?.status || error?.statusCode || null,
  };
}

function setError(error = null) {
  const normalized = normalizeError(error);

  state.error = normalized;
  state.lastError = normalized;
  state.hasError = Boolean(normalized);

  return normalized;
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
  if (!isFunction(toastBridge)) return null;

  try {
    return toastBridge(message, type, options);
  } catch {
    return null;
  }
}

/* =========================================================
   MODULES
========================================================= */

function registerModule(name = "", value = null) {
  return modules.register(name, value);
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

  httpClient = isFunction(installHttp)
    ? installHttp(AppCore, options)
    : Http;

  services.http = httpClient;

  modules.register("http", httpClient);

  return httpClient;
}

function setHttpClient(value = null) {
  if (!value) return false;

  httpClient = value;
  services.http = httpClient;
  modules.register("http", httpClient);

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
    fn();
    return () => true;
  }

  document.addEventListener("DOMContentLoaded", fn, { once: true });

  return () => {
    document.removeEventListener("DOMContentLoaded", fn);
    return true;
  };
}

async function init(options = {}) {
  if (initialized) return AppCore;
  if (initPromise) return initPromise;

  initPromise = Promise.resolve()
    .then(() => {
      state.booting = true;
      state.loading = true;
      state.ready = false;

      installHttpBridge(options);

      initialized = true;

      state.initialized = true;
      state.booting = false;
      state.loading = false;
      state.ready = true;

      return AppCore;
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

    initialized,
    ready: Boolean(state.ready),
    booting: Boolean(state.booting),
    loading: Boolean(state.loading),

    authenticated: Boolean(state.authenticated),
    hasToken: Boolean(state.hasToken),

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

    policy: {
      memoryStateOnly: true,
      noStorage: true,
      noFetchOwn: true,
      httpFacadeOnly: true,
      noApiClientParallel: true,

      roles: ["admin", "user"],
      authRequiresTokenAndUsableUser: true,

      userSlugHome: true,
      noEmailIdentity: true,

      safeSessionContextOnly: true,
      noSessionSecrets: true,
      noSessionIpUserAgent: true,

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
  isUserHomePath,
  safeInternalPath,

  getSnapshot,
  getDebugSnapshot: getSnapshot,
  snapshot: getSnapshot,

  getUserDisplayName: (user) =>
    normalizeUser(user)?.displayName || "",

  getUserUsername: (user) =>
    normalizeUser(user)?.username || "",

  getUserAvatarUrl: (user) =>
    user?.avatarUrl ||
    user?.avatar ||
    user?.picture ||
    "",
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
      modules.register("router", value);
    },
  },

  router: {
    get() {
      return modules.get("router");
    },
    set(value) {
      modules.register("router", value);
    },
  },

  Auth: {
    get() {
      return modules.get("auth");
    },
    set(value) {
      modules.register("auth", value);
    },
  },

  auth: {
    get() {
      return modules.get("auth");
    },
    set(value) {
      modules.register("auth", value);
    },
  },

  I18n: {
    get() {
      return modules.get("i18n");
    },
    set(value) {
      modules.register("i18n", value);
    },
  },

  i18n: {
    get() {
      return modules.get("i18n");
    },
    set(value) {
      modules.register("i18n", value);
    },
  },

  Toast: {
    get() {
      return modules.get("toast");
    },
    set(value) {
      modules.register("toast", value);
    },
  },

  toast: {
    get() {
      return modules.get("toast");
    },
    set(value) {
      modules.register("toast", value);
    },
  },
});

export default AppCore;
