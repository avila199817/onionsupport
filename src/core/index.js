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
   - HTTP único mínimo.
   - Auth estricta: token + user usable.
   - User inválido sólo si disabled.
   - Roles únicos: admin / user.
   - Sin storage.
   - Sin DOM cache complejo.
   - Sin network listeners.
   - Sin framework interno.
   - Sin magia negra.
========================================================= */

import { config } from "./config.js";

export const CORE_VERSION = "simple";

const API_BASE =
  config?.apiBase ||
  config?.apiBaseUrl ||
  config?.api?.baseUrl ||
  config?.api?.baseURL ||
  "https://api.onionit.net";

const APP_NAME =
  config?.appName ||
  config?.name ||
  "Onion Support";

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

function cleanRole(value = "") {
  return String(value || "").toLowerCase() === "admin" ? "admin" : "user";
}

function tokenOk(value = "") {
  const token = text(value, "").replace(/^Bearer\s+/i, "");

  if (!token) return false;
  if (/\s/.test(token)) return false;

  if (
    ["null", "undefined", "false", "true", "[object object]", "{}", "[]"].includes(
      token.toLowerCase()
    )
  ) {
    return false;
  }

  return token.length >= 8;
}

function userOk(user = null) {
  if (!isObject(user)) return false;
  if (user.disabled === true) return false;

  const status = String(user.status || "").toLowerCase();

  if (status === "disabled") return false;

  return Boolean(
    user.id ||
      user.userId ||
      user.username ||
      user.email
  );
}

function publicUser(user = null) {
  if (!isObject(user)) return null;

  const name =
    user.name ||
    user.fullName ||
    user.displayName ||
    user.nombre ||
    user.username ||
    user.email ||
    null;

  return {
    id: user.id || user.userId || null,
    userId: user.userId || user.id || null,
    username: user.username || user.slug || user.email || null,
    displayName: name,
    fullName: name,
    role: cleanRole(user.role || user.rol),
    hasAvatar: Boolean(user.avatar || user.avatarUrl || user.picture),
  };
}

function redact(value = "") {
  return String(value || "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function joinUrl(base = "", path = "") {
  if (/^https?:\/\//i.test(path)) return path;

  const root = String(base || "").replace(/\/+$/g, "");
  const clean = String(path || "").replace(/^\/+/g, "");

  return `${root}/${clean}`;
}

function isFormData(value) {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function isUrlSearchParams(value) {
  return typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams;
}

function buildBody(body, method = "GET") {
  if (body === undefined || body === null) return undefined;
  if (method === "GET" || method === "HEAD") return undefined;
  if (isFormData(body)) return body;
  if (isUrlSearchParams(body)) return body;
  if (typeof body === "string") return body;

  return JSON.stringify(body);
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
  ? document.documentElement.lang || "en"
  : "en";

const initialLocale = isBrowser()
  ? document.documentElement.dataset.locale || initialLang
  : "en";

const initialTheme = isBrowser()
  ? document.documentElement.dataset.theme || "system"
  : "system";

const state = {
  initialized: false,
  ready: false,
  booting: false,
  loading: false,

  route: "/",
  canonicalPath: "/",
  publicPath: "/",

  token: null,
  accessToken: null,
  access_token: null,

  user: null,
  currentUser: null,

  authenticated: false,
  hasToken: false,

  role: null,
  rol: null,
  roles: [],

  isAdmin: false,
  isUser: false,
  isSupport: false,
  isManager: false,
  isClient: false,

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
  const rawToken = state.token || state.accessToken || state.access_token;
  const token = tokenOk(rawToken)
    ? String(rawToken).replace(/^Bearer\s+/i, "")
    : null;

  const rawUser = state.user || state.currentUser;
  const user = userOk(rawUser) ? rawUser : null;

  state.token = token;
  state.accessToken = token;
  state.access_token = token;

  state.user = user;
  state.currentUser = user;

  state.hasToken = Boolean(token);
  state.authenticated = Boolean(token && user);

  if (state.authenticated) {
    const role = cleanRole(user.role || user.rol || state.role);

    state.role = role;
    state.rol = role;
    state.roles = [role];

    state.isAdmin = role === "admin";
    state.isUser = role === "user";
  } else {
    state.role = null;
    state.rol = null;
    state.roles = [];

    state.isAdmin = false;
    state.isUser = false;
  }

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
  }

  if (options.forceUnauthenticated === true) {
    state.token = null;
    state.accessToken = null;
    state.access_token = null;
    state.user = null;
    state.currentUser = null;
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
  const roles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
  return roles.map(cleanRole).includes(getCurrentRole());
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

function normalizeRoutePath(route = "/") {
  let path = String(route || "/").split("?")[0].split("#")[0] || "/";

  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/g, "") || "/";

  return path;
}

function setRoute(route = "/", options = {}) {
  const path = normalizeRoutePath(route);

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

function setPublicPath(path = "/", options = {}) {
  const publicPath = String(path || "/");
  const route = normalizeRoutePath(publicPath);

  setState(
    {
      publicPath,
      route,
      canonicalPath: route,
    },
    {
      source: options.source || "core:setPublicPath",
      silent: options.silent,
    }
  );

  return publicPath;
}

function setUser(user = null, options = {}) {
  const cleanUser = userOk(user) ? user : null;

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
  const cleanToken = tokenOk(token)
    ? String(token).replace(/^Bearer\s+/i, "")
    : null;

  setState(
    {
      token: cleanToken,
      accessToken: cleanToken,
      access_token: cleanToken,
    },
    {
      source: options.source || "core:setToken",
      silent: options.silent,
      forceUnauthenticated: !cleanToken,
    }
  );

  return state.token;
}

function pick(payload = {}, names = []) {
  for (const name of names) {
    const value =
      payload?.[name] ??
      payload?.data?.[name] ??
      payload?.auth?.[name] ??
      payload?.session?.[name];

    if (value !== undefined && value !== null) {
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

  const cleanToken = tokenOk(token)
    ? String(token).replace(/^Bearer\s+/i, "")
    : state.token;

  const cleanUser = userOk(user) ? user : state.user;

  setState(
    {
      token: cleanToken,
      accessToken: cleanToken,
      access_token: cleanToken,
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
  };
}

function clearSession(options = {}) {
  setState(
    {
      token: null,
      accessToken: null,
      access_token: null,

      user: null,
      currentUser: null,

      authenticated: false,
      hasToken: false,

      role: null,
      rol: null,
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

function setLang(lang = "en") {
  const value = ["ca", "es", "en"].includes(lang) ? lang : "en";

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

async function navigate(path = "/", options = {}) {
  const target = String(path || "/");

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

async function request(url = "", options = {}) {
  const fetchFn = isBrowser()
    ? window.fetch?.bind(window)
    : typeof globalThis !== "undefined"
      ? globalThis.fetch?.bind(globalThis)
      : null;

  if (!isFn(fetchFn)) {
    throw new Error("Fetch API no disponible.");
  }

  const method = text(options.method, "GET").toUpperCase();
  const finalUrl = /^https?:\/\//i.test(url) ? url : joinUrl(API_BASE, url);

  const publicRequest =
    options.public === true ||
    options.auth === false ||
    options.skipAuth === true;

  const body = buildBody(options.body, method);

  const headers = {
    Accept: "application/json",
    ...(body && !isFormData(options.body) && !isUrlSearchParams(options.body)
      ? { "Content-Type": "application/json" }
      : {}),
    ...(publicRequest ? {} : getAuthHeader()),
    ...(options.headers || {}),
  };

  const response = await fetchFn(finalUrl, {
    method,
    headers,
    credentials: options.credentials || "include",
    cache: options.cache || "default",
    body,
  });

  const contentType = response.headers.get("content-type") || "";

  const data = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    const error = new Error(
      data?.message ||
        data?.error ||
        response.statusText ||
        `HTTP ${response.status}`
    );

    error.status = response.status;
    error.statusCode = response.status;
    error.data = data;

    throw error;
  }

  return data;
}

function createHttpClient() {
  return {
    request,

    get: (url, options = {}) =>
      request(url, { ...options, method: "GET" }),

    post: (url, body = undefined, options = {}) =>
      request(url, { ...options, method: "POST", body }),

    put: (url, body = undefined, options = {}) =>
      request(url, { ...options, method: "PUT", body }),

    patch: (url, body = undefined, options = {}) =>
      request(url, { ...options, method: "PATCH", body }),

    delete: (url, options = {}) =>
      request(url, { ...options, method: "DELETE" }),

    del: (url, options = {}) =>
      request(url, { ...options, method: "DELETE" }),

    login: (body = {}, options = {}) =>
      request("/api/auth/login", {
        ...options,
        method: "POST",
        body,
        public: true,
        auth: false,
        skipAuth: true,
      }),

    refresh: (body = {}, options = {}) =>
      request("/api/auth/refresh", {
        ...options,
        method: "POST",
        body,
        public: true,
        auth: false,
        skipAuth: true,
      }),

    me: (options = {}) =>
      request("/api/auth/me", {
        ...options,
        method: "GET",
      }),

    logout: (body = {}, options = {}) =>
      request("/api/auth/logout", {
        ...options,
        method: "POST",
        body,
      }),

    getSnapshot: () => ({
      version: "simple-http",
      apiBase: API_BASE,
    }),
  };
}

function installHttpBridge() {
  if (!httpClient) {
    httpClient = createHttpClient();
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

async function init() {
  if (initialized) return AppCore;
  if (initPromise) return initPromise;

  initPromise = Promise.resolve()
    .then(() => {
      state.booting = true;
      state.ready = false;

      installHttpBridge();

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

    user: publicUser(state.user),
    role: state.role,

    route: redact(state.route || "/"),
    publicPath: redact(state.publicPath || "/"),

    lang: state.lang,
    theme: state.theme,

    hasHttp: Boolean(httpClient),
    modules: modules.list(),
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

  getSnapshot,
  getDebugSnapshot: getSnapshot,
  snapshot: getSnapshot,

  normalizeUser: (user) => user,

  getUserDisplayName: (user) =>
    user?.name ||
    user?.fullName ||
    user?.displayName ||
    user?.username ||
    "",

  getUserUsername: (user) =>
    user?.username ||
    user?.slug ||
    user?.email ||
    "",

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
