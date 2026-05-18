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

export const CORE_VERSION = "core.index.v2";

const APP_NAME =
  config?.appName ||
  config?.name ||
  "Onion Support";

const HOME_PATH = "/";
const USER_HOME_PREFIX = "/@";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function clone(value) {
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

function redact(value = "") {
  return String(value || "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/([?&#]access_token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

/* =========================================================
   AUTH NORMALIZATION
========================================================= */

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = String(value || "").toLowerCase();

  return role === "admin" || role === "user" ? role : "";
}

function cleanRole(value = "") {
  return normalizeRole(value) || "user";
}

function tokenOk(value = "") {
  const token = text(value, "").replace(/^Bearer\s+/i, "");

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
  const token = text(value, "").replace(/^Bearer\s+/i, "");
  return tokenOk(token) ? token : null;
}

function normalizeSlug(value = "") {
  const slug = text(value, "")
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
  return slug ? `${USER_HOME_PREFIX}${slug}` : HOME_PATH;
}

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
  const id = text(safeUser.userId || safeUser.id, "");
  const slug = extractUserSlug(safeUser);
  const profile = isObject(safeUser.profile) ? safeUser.profile : {};

  const username = text(
    safeUser.username ||
      safeUser.userName ||
      safeUser.user_name ||
      slug ||
      id,
    ""
  );

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
    hasAvatar: Boolean(normalized.avatar || normalized.avatarUrl || normalized.picture),
  };
}

/* =========================================================
   PATHS
========================================================= */

function normalizeHashPath(path = HOME_PATH) {
  const value = text(path, HOME_PATH);

  if (value.startsWith("#!")) {
    return value.replace(/^#!\/?/, "/") || HOME_PATH;
  }

  if (value.startsWith("#/")) {
    return value.slice(1) || HOME_PATH;
  }

  return value;
}

function normalizePublicPath(path = HOME_PATH) {
  let value = normalizeHashPath(path);

  if (value.startsWith("//")) {
    return HOME_PATH;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return HOME_PATH;
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value = value.replace(/\\/g, "/").replace(/\/{2,}/g, "/");

  return value || HOME_PATH;
}

function stripQueryHash(path = HOME_PATH) {
  return normalizePublicPath(path).split("?")[0].split("#")[0] || HOME_PATH;
}

function extractUserHomeSlug(path = HOME_PATH) {
  const value = stripQueryHash(path);

  if (!value.startsWith(USER_HOME_PREFIX)) return "";

  const slug = value.slice(USER_HOME_PREFIX.length);

  if (!slug || slug.includes("/")) return "";

  return normalizeSlug(slug);
}

function isUserHomePath(path = HOME_PATH) {
  return Boolean(extractUserHomeSlug(path));
}

function normalizeCanonicalPath(path = HOME_PATH) {
  let value = stripQueryHash(path);

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || HOME_PATH;
  }

  return isUserHomePath(value) ? HOME_PATH : value;
}

/* =========================================================
   EVENTS
========================================================= */

function createEvents() {
  const listeners = new Map();

  function on(name, handler) {
    if (!name || !isFn(handler)) return () => false;

    if (!listeners.has(name)) {
      listeners.set(name, new Set());
    }

    listeners.get(name).add(handler);

    return () => off(name, handler);
  }

  function once(name, handler) {
    if (!isFn(handler)) return () => false;

    const dispose = on(name, (...args) => {
      dispose();
      handler(...args);
    });

    return dispose;
  }

  function off(name, handler = null) {
    if (!name) return false;

    if (!handler) {
      listeners.delete(name);
      return true;
    }

    listeners.get(name)?.delete(handler);
    return true;
  }

  function emit(name, payload = {}) {
    if (!name) return false;

    const event = {
      type: name,
      detail: payload,
      payload,
    };

    for (const handler of listeners.get(name) || []) {
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

  return {
    on,
    once,
    off,
    emit,
    dispatch: emit,
    trigger: emit,
    clear,
    getSnapshot: () => ({
      names: [...listeners.keys()],
    }),
  };
}

/* =========================================================
   MODULES
========================================================= */

function createModules() {
  const map = new Map();

  function register(name, value) {
    if (!name || !value) return false;

    map.set(name, value);
    return value;
  }

  function get(name) {
    return map.get(name) || null;
  }

  function remove(name) {
    return map.delete(name);
  }

  return {
    register,
    set: register,
    upsert: register,
    get,
    has: (name) => map.has(name),
    remove,
    delete: remove,
    list: () => [...map.keys()],
    names: () => [...map.keys()],
    getSnapshot: () => ({
      count: map.size,
      modules: [...map.keys()],
    }),
  };
}

/* =========================================================
   CLEANUP
========================================================= */

function createCleanup() {
  const scopes = new Map();

  function add(scope = "global", disposer = null) {
    if (!isFn(disposer)) return () => false;

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

  function event(scope, target, eventName, handler, options = false) {
    if (!target || !eventName || !isFn(handler)) return () => false;

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
      for (const disposer of scopes.get(name) || []) {
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

  return {
    add,
    event,
    on: event,
    run,
    clear: run,
    dispose: run,
    scope: (name = "global") => ({ name }),
    ensureScope: (name = "global") => ({ name }),
    getSnapshot: () => ({
      scopes: [...scopes.keys()],
    }),
  };
}

/* =========================================================
   HOOKS
========================================================= */

function createHooks() {
  const map = new Map();

  function add(name, handler) {
    if (!name || !isFn(handler)) return () => false;

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

  async function run(name, payload = {}) {
    let current = payload;

    for (const handler of map.get(name) || []) {
      try {
        const next = await handler(current);

        if (next !== undefined) {
          current = next;
        }
      } catch {
        // noop
      }
    }

    return current;
  }

  return {
    add,
    on: add,
    use: add,
    register: add,
    run,
    runSeries: run,
    clear: (name = "") => {
      if (name) map.delete(name);
      else map.clear();

      return true;
    },
    getSnapshot: () => ({
      hooks: [...map.keys()],
    }),
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

  route: HOME_PATH,
  canonicalPath: HOME_PATH,
  publicPath: HOME_PATH,
  routeParams: {},

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

  userSlug: null,
  homePath: HOME_PATH,
  defaultHome: HOME_PATH,
  postLoginTarget: null,

  role: null,
  rol: null,
  userRole: null,
  roles: [],

  isAdmin: false,
  isUser: false,
  isSupport: false,
  isManager: false,
  isClient: false,

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
   AUTH STATE
========================================================= */

function syncAuth() {
  const token = cleanToken(state.token || state.accessToken || state.access_token);

  const user = normalizeUser(
    state.user ||
      state.currentUser ||
      state.authUser ||
      state.sessionUser ||
      state.session?.user ||
      state.sessionData?.user ||
      null
  );

  const authenticated = Boolean(token && user);
  const role = authenticated ? cleanRole(user.role || user.rol || user.roles || state.role) : null;
  const slug = authenticated ? extractUserSlug(user) : "";
  const homePath = authenticated ? buildUserHomePath(user) : HOME_PATH;

  state.token = token;
  state.accessToken = token;
  state.access_token = token;

  state.user = authenticated ? user : null;
  state.currentUser = authenticated ? user : null;

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

  state.isSupport = false;
  state.isManager = false;
  state.isClient = false;

  return state;
}

function getState(options = {}) {
  syncAuth();
  return options.raw ? state : clone(state);
}

function setState(patch = {}, options = {}) {
  if (isObject(patch)) {
    Object.assign(state, patch);

    if (patch.user === null) {
      state.currentUser = null;
      state.authUser = null;
      state.sessionUser = null;
    }

    if (patch.currentUser === null) {
      state.user = null;
      state.authUser = null;
      state.sessionUser = null;
    }
  }

  if (options.forceUnauthenticated === true) {
    state.token = null;
    state.accessToken = null;
    state.access_token = null;
    state.refreshToken = null;
    state.refresh_token = null;

    state.user = null;
    state.currentUser = null;
    state.authUser = null;
    state.sessionUser = null;
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

function setRoute(route = HOME_PATH, options = {}) {
  const path = normalizeCanonicalPath(route);

  setState(
    {
      route: path,
      canonicalPath: path,
    },
    {
      source: options.source || "core:setRoute",
      silent: options.silent,
    }
  );

  return path;
}

function setPublicPath(path = HOME_PATH, options = {}) {
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
      forceUnauthenticated: !cleanUser && !state.token,
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
      payload?.auth?.[name] ??
      payload?.session?.[name] ??
      payload?.sessionData?.[name];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function applySession(payload = {}, options = {}) {
  const token = pick(payload, ["token", "accessToken", "access_token"]);
  const user =
    pick(payload, ["user", "usuario", "me", "account", "profile"]) ||
    (userOk(payload) ? payload : null);

  const clean = cleanToken(token) || state.token;
  const cleanUser = normalizeUser(user) || state.user;

  setState(
    {
      token: clean,
      accessToken: clean,
      access_token: clean,
      user: cleanUser,
      currentUser: cleanUser,
    },
    {
      source: options.source || "core:applySession",
      silent: options.silent,
    }
  );

  return {
    token: state.token,
    user: state.user,
    authenticated: state.authenticated,
    homePath: state.homePath,
    defaultHome: state.defaultHome,
    postLoginTarget: state.postLoginTarget,
  };
}

function clearSession(options = {}) {
  setState(
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

      userSlug: null,
      homePath: HOME_PATH,
      defaultHome: HOME_PATH,
      postLoginTarget: null,

      role: null,
      rol: null,
      userRole: null,
      roles: [],

      isAdmin: false,
      isUser: false,
      isSupport: false,
      isManager: false,
      isClient: false,
    },
    {
      source: options.source || "core:clearSession",
      silent: options.silent,
      emit: options.emit,
      forceUnauthenticated: true,
    }
  );

  return true;
}

function setTheme(theme = "system") {
  const value = ["dark", "light", "system"].includes(theme)
    ? theme
    : "system";

  state.theme = value;

  if (isBrowser()) {
    document.documentElement.dataset.theme = value;
  }

  return value;
}

function setLang(lang = "es") {
  const value = ["es", "ca", "en"].includes(lang) ? lang : "es";

  state.lang = value;
  state.language = value;
  state.locale = value;

  if (isBrowser()) {
    document.documentElement.lang = value;
    document.documentElement.dataset.locale = value;
  }

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

function setError(error = null) {
  state.error = error;
  state.lastError = error;
  state.hasError = Boolean(error);

  return error;
}

/* =========================================================
   UI COMPAT
========================================================= */

function setDocumentTitle(title = APP_NAME) {
  if (!isBrowser()) return false;

  document.title = text(title, APP_NAME);
  return document.title;
}

function clearDynamicContainers() {
  return true;
}

function syncUserUI() {
  return true;
}

function setShowToast(fn) {
  if (!isFn(fn)) return false;

  toastBridge = fn;
  return true;
}

function showToast(message = "", type = "info", options = {}) {
  if (!isFn(toastBridge)) return null;

  try {
    return toastBridge(message, type, options);
  } catch {
    return null;
  }
}

/* =========================================================
   MODULES / BRIDGES
========================================================= */

function registerModule(name = "", value = null) {
  if (!name || !value) return false;

  modules.register(name, value);
  return value;
}

function getModule(name = "") {
  return modules.get(name);
}

function bridgeAliases(name = "") {
  return {
    Router: ["Router", "router"],
    router: ["Router", "router"],

    Auth: ["Auth", "auth"],
    auth: ["Auth", "auth"],

    Store: ["Store", "store"],
    store: ["Store", "store"],

    Http: ["Http", "http", "api", "apiClient"],
    http: ["Http", "http", "api", "apiClient"],
    api: ["Http", "http", "api", "apiClient"],
    apiClient: ["Http", "http", "api", "apiClient"],
  }[name] || [name];
}

function registerBridge(name = "", value = null) {
  if (!name || !value) return false;

  for (const alias of bridgeAliases(name)) {
    modules.register(alias, value);
  }

  return value;
}

function getBridge(name = "") {
  for (const alias of bridgeAliases(name)) {
    const value = modules.get(alias);

    if (value) return value;
  }

  return null;
}

/* =========================================================
   NAVIGATION COMPAT
========================================================= */

function safeInternalPath(path = HOME_PATH) {
  const target = normalizePublicPath(path);

  if (!target.startsWith("/")) return HOME_PATH;
  if (target.startsWith("//")) return HOME_PATH;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return HOME_PATH;
  if (/[\r\n\t\\]/.test(target)) return HOME_PATH;

  return target;
}

async function navigate(path = HOME_PATH, options = {}) {
  const target = safeInternalPath(path || HOME_PATH);

  try {
    const router = getBridge("Router");

    if (isFn(router?.replace) && options.replaceState === true) {
      await router.replace(target, {
        source: options.source || "core:navigate",
        ...options,
      });

      return true;
    }

    if (isFn(router?.navigate)) {
      await router.navigate(target, {
        source: options.source || "core:navigate",
        ...options,
      });

      return true;
    }
  } catch {
    // fallback abajo
  }

  if (!isBrowser()) return false;

  try {
    window.location.assign(target);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   HTTP
========================================================= */

function installHttpBridge(options = {}) {
  if (!httpClient) {
    httpClient = isFn(installHttp)
      ? installHttp(AppCore, options)
      : Http;
  }

  services.http = httpClient;
  services.Http = httpClient;
  services.api = httpClient;
  services.apiClient = httpClient;

  registerBridge("Http", httpClient);

  return httpClient;
}

function getHttpClient() {
  return httpClient || installHttpBridge();
}

function getActiveRequest() {
  return getHttpClient().request;
}

function getActiveApiClient() {
  return getHttpClient();
}

function request(...args) {
  return getHttpClient().request(...args);
}

/* =========================================================
   LIFECYCLE
========================================================= */

function ready(fn) {
  if (!isFn(fn)) return () => false;

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
      state.ready = false;

      installHttpBridge(options);

      initialized = true;

      state.initialized = true;
      state.booting = false;
      state.ready = true;

      events.emit("app:core:ready", {
        version: CORE_VERSION,
      });

      return AppCore;
    })
    .finally(() => {
      initPromise = null;
    });

  return initPromise;
}

function rebootCore() {
  initialized = false;

  state.initialized = false;
  state.ready = false;
  state.booting = false;

  cleanup.run();

  httpClient = null;

  return init();
}

function getSnapshot() {
  syncAuth();

  return {
    version: CORE_VERSION,

    initialized,
    ready: Boolean(state.ready),
    booting: Boolean(state.booting),

    authenticated: Boolean(state.authenticated),
    hasToken: Boolean(state.hasToken),

    token: null,
    accessToken: null,
    refreshToken: null,

    user: publicUser(state.user),

    userSlug: state.userSlug || null,
    homePath: state.homePath || HOME_PATH,
    defaultHome: state.defaultHome || state.homePath || HOME_PATH,

    role: state.role,
    roles: state.roles,

    route: redact(state.route || HOME_PATH),
    canonicalPath: redact(state.canonicalPath || HOME_PATH),
    publicPath: redact(state.publicPath || HOME_PATH),

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
      roles: ["admin", "user"],
      userSlugHome: true,
      noEmailIdentity: true,
      no2fa: true,
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
    text,
    clone,
    redact,

    byId: (id) => (isBrowser() ? document.getElementById(id) : null),
    qs: (selector) => (isBrowser() ? document.querySelector(selector) : null),
    qsa: (selector) => (isBrowser() ? [...document.querySelectorAll(selector)] : []),

    log: (...args) => console.log("[Onion]", ...args),
    warn: (...args) => console.warn("[Onion]", ...args),
    error: (...args) => console.error("[Onion]", ...args),
  },

  events,
  cleanup,
  modules,
  hooks,
  services,

  init,
  rebootCore,
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

  setDocumentTitle,
  clearDynamicContainers,
  syncUserUI,

  setShowToast,
  showToast,

  registerModule,
  getModule,
  registerBridge,
  getBridge,

  navigate,

  installHttpBridge,
  getHttpClient,
  getActiveRequest,
  getActiveApiClient,

  request,
  apiClient: null,

  normalizeUser,
  normalizeSlug,
  extractUserSlug,
  buildUserHomePath,

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
      if (value) {
        httpClient = value;
        registerBridge("Http", httpClient);
      }
    },
  },

  http: {
    get() {
      return getHttpClient();
    },
    set(value) {
      if (value) {
        httpClient = value;
        registerBridge("Http", httpClient);
      }
    },
  },

  Router: {
    get() {
      return getBridge("Router");
    },
    set(value) {
      registerBridge("Router", value);
    },
  },

  router: {
    get() {
      return getBridge("Router");
    },
    set(value) {
      registerBridge("Router", value);
    },
  },

  Auth: {
    get() {
      return getBridge("Auth");
    },
    set(value) {
      registerBridge("Auth", value);
    },
  },

  auth: {
    get() {
      return getBridge("Auth");
    },
    set(value) {
      registerBridge("Auth", value);
    },
  },

  Store: {
    get() {
      return getBridge("Store");
    },
    set(value) {
      registerBridge("Store", value);
    },
  },

  store: {
    get() {
      return getBridge("Store");
    },
    set(value) {
      registerBridge("Store", value);
    },
  },
});

AppCore.apiClient = getHttpClient();

if (isBrowser()) {
  window.__ONION_CORE__ = AppCore;
  window.AppCore = AppCore;
}

export default AppCore;
