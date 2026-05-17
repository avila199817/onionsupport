/* =========================================================
   Onion Support - Store Actions
   Archivo: /src/store/actions.js

   Responsabilidad:
   - Acciones mínimas de compat.
   - No duplica Auth.
   - No duplica Core.
   - No duplica Router.
   - No duplica HTTP.
   - No guarda tokens reales.
   - Roles únicos: admin / user.
   - User inválido sólo si disabled.
   - Sin rutas técnicas legacy.
   - Sin 2FA/MFA/OTP.
   - Sin colecciones concretas inventadas.
   - Sin imports.
========================================================= */

export const STORE_ACTIONS_VERSION = "simple";

const DEFAULT_ROUTE = "/";
const DEFAULT_LANG = "en";
const DEFAULT_THEME = "system";
const DEFAULT_TITLE = "Onion Support";

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
  const output = String(value ?? "").trim();
  return output || fallback;
}

function clone(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

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

function nowIso() {
  return new Date().toISOString();
}

function normalizeTheme(value = DEFAULT_THEME) {
  const theme = String(value || "").toLowerCase();

  return ["dark", "light", "system"].includes(theme) ? theme : DEFAULT_THEME;
}

function normalizeLang(value = DEFAULT_LANG) {
  const lang = String(value || "").toLowerCase().split("-")[0];

  return ["ca", "es", "en"].includes(lang) ? lang : DEFAULT_LANG;
}

function normalizeRole(value = "") {
  return String(value).toLowerCase() === "admin" ? "admin" : "user";
}

function cleanPath(value = DEFAULT_ROUTE) {
  let path = text(value, DEFAULT_ROUTE).split("?")[0].split("#")[0];

  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/g, "");

  return path || DEFAULT_ROUTE;
}

function publicPath(value = DEFAULT_ROUTE) {
  let path = text(value, DEFAULT_ROUTE);

  if (!path.startsWith("/")) path = `/${path}`;

  return path || DEFAULT_ROUTE;
}

function canonicalPath(value = DEFAULT_ROUTE) {
  let path = cleanPath(value);

  if (path.startsWith("/@")) {
    path = `/${path.split("/").slice(2).join("/")}`;
  }

  return cleanPath(path);
}

function safeKey(value = "") {
  return text(value, "")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.:-]/g, "");
}

function isUnsafeKey(key = "") {
  return ["__proto__", "prototype", "constructor"].includes(String(key));
}

function pathParts(path = "") {
  return String(path || "")
    .replace(/\[(["'`]?)(.*?)\1\]/g, ".$2")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !isUnsafeKey(part));
}

function getByPath(root, path, fallback = undefined) {
  const parts = pathParts(path);

  if (!parts.length) return fallback;

  let current = root;

  for (const part of parts) {
    if (current === null || current === undefined) return fallback;
    current = current[part];
  }

  return current === undefined ? fallback : current;
}

function setByPath(root, path, value) {
  const parts = pathParts(path);

  if (!root || !parts.length) return false;

  let current = root;

  for (const part of parts.slice(0, -1)) {
    if (!isObject(current[part])) {
      current[part] = {};
    }

    current = current[part];
  }

  current[parts.at(-1)] = value;

  return true;
}

function deleteByPath(root, path) {
  const parts = pathParts(path);

  if (!root || !parts.length) return false;

  let current = root;

  for (const part of parts.slice(0, -1)) {
    if (!isObject(current[part])) return false;
    current = current[part];
  }

  const key = parts.at(-1);

  if (!(key in current)) return false;

  delete current[key];
  return true;
}

function mergeDeep(target = {}, source = {}) {
  const output = isObject(target) ? clone(target) : {};

  if (!isObject(source)) return output;

  for (const [key, value] of Object.entries(source)) {
    if (isUnsafeKey(key)) continue;

    output[key] =
      isObject(value) && isObject(output[key])
        ? mergeDeep(output[key], value)
        : clone(value);
  }

  return output;
}

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  return (
    user.disabled === true ||
    String(user.status || "").toLowerCase() === "disabled"
  );
}

function usableUser(user = null) {
  if (!isObject(user)) return false;
  if (userDisabled(user)) return false;

  return Boolean(
    user.id ||
      user.userId ||
      user.username ||
      user.slug ||
      user.email
  );
}

function normalizeUser(user = null) {
  if (!usableUser(user)) return null;

  const id = user.userId || user.id || null;
  const username = user.username || user.slug || user.email || id || null;

  const displayName =
    user.name ||
    user.fullName ||
    user.displayName ||
    user.nombre ||
    username ||
    user.email ||
    id ||
    "Usuario";

  const role = normalizeRole(user.role || user.rol);

  return {
    ...clone(user),

    id,
    userId: user.userId || id,

    username,
    slug: user.slug || username,

    name: user.name || displayName,
    fullName: user.fullName || displayName,
    displayName,

    email: user.email || null,

    role,
    rol: role,
    roles: [role],

    avatar: user.avatar || user.avatarUrl || user.picture || null,
    avatarUrl: user.avatarUrl || user.avatar || user.picture || null,
    picture: user.picture || user.avatarUrl || user.avatar || null,
    hasAvatar: Boolean(user.avatar || user.avatarUrl || user.picture),

    active: true,
    disabled: false,
  };
}

function tokenProvided(value = "") {
  const token = text(value, "").replace(/^Bearer\s+/i, "");

  if (!token) return false;
  if (/\s/.test(token)) return false;

  return !["null", "undefined", "false", "true", "[object object]"].includes(
    token.toLowerCase()
  );
}

function sessionPatch(input = {}, currentSession = {}) {
  const source = isObject(input) ? input : {};
  const user = normalizeUser(source.user ?? currentSession.user ?? null);

  const hasToken =
    source.hasToken === true ||
    currentSession.hasToken === true ||
    tokenProvided(source.token || source.accessToken || source.access_token);

  const authenticated = Boolean(source.authenticated !== false && hasToken && user);
  const role = authenticated
    ? normalizeRole(source.role || source.rol || user.role || user.rol)
    : null;

  if (!authenticated) {
    return {
      authenticated: false,
      hasToken,

      token: null,
      accessToken: null,

      user: null,
      role: null,
      roles: [],

      username: null,
      displayName: null,
      avatarUrl: null,

      isAdmin: false,
      isUser: false,
      isSupport: false,
      isManager: false,
      isClient: false,
    };
  }

  return {
    authenticated: true,
    hasToken: true,

    token: null,
    accessToken: null,

    user,
    role,
    roles: [role],

    username: user.username || null,
    displayName: user.displayName || user.name || user.username || null,
    avatarUrl: user.avatarUrl || null,

    isAdmin: role === "admin",
    isUser: role === "user",
    isSupport: false,
    isManager: false,
    isClient: false,
  };
}

function extractSession(payload = {}) {
  const data = isObject(payload.data) ? payload.data : {};
  const auth = isObject(payload.auth) ? payload.auth : {};
  const session = isObject(payload.session) ? payload.session : {};

  return {
    token:
      payload.token ||
      payload.accessToken ||
      payload.access_token ||
      data.token ||
      data.accessToken ||
      data.access_token ||
      auth.token ||
      auth.accessToken ||
      auth.access_token ||
      session.token ||
      session.accessToken ||
      session.access_token ||
      "",

    hasToken:
      payload.hasToken ??
      data.hasToken ??
      auth.hasToken ??
      session.hasToken,

    authenticated:
      payload.authenticated ??
      data.authenticated ??
      auth.authenticated ??
      session.authenticated,

    user:
      payload.user ||
      payload.usuario ||
      payload.me ||
      payload.account ||
      payload.profile ||
      data.user ||
      data.usuario ||
      data.me ||
      auth.user ||
      auth.usuario ||
      auth.me ||
      session.user ||
      session.usuario ||
      session.me ||
      null,

    role:
      payload.role ||
      payload.rol ||
      data.role ||
      data.rol ||
      auth.role ||
      auth.rol ||
      session.role ||
      session.rol ||
      null,
  };
}

function entityId(item = null) {
  if (!isObject(item)) return "";

  return text(
    item.id ||
      item.userId ||
      item.ticketId ||
      item.clienteId ||
      item.facturaId ||
      item.invoiceId ||
      item.uuid ||
      "",
    ""
  );
}

function matcherFor(matcher, item = null) {
  if (isFunction(matcher)) return matcher;

  const wanted = text(matcher || entityId(item), "");

  return wanted
    ? (current) => entityId(current) === wanted
    : () => false;
}

function normalizeItems(items = []) {
  if (items === null || items === undefined) return [];
  return Array.isArray(items) ? clone(items) : [clone(items)];
}

function collectionKey(key = "") {
  const clean = safeKey(key);

  if (!clean) throw new Error("Collection key requerido.");

  return clean;
}

function collectionPath(key = "") {
  return `entities.${collectionKey(key)}`;
}

function readDocumentTitle() {
  if (!isBrowser()) return DEFAULT_TITLE;
  return text(document.title, DEFAULT_TITLE);
}

/* =========================================================
   FACTORY
========================================================= */

export function createActions({
  AppCore = null,
  state = {},
  set = null,
  patch = null,
  replace = null,
  update = null,
  remove = null,
} = {}) {
  const writeSet = isFunction(set)
    ? set
    : (path, value) => {
        setByPath(state, path, clone(value));
        return getByPath(state, path);
      };

  const writePatch = isFunction(patch)
    ? patch
    : (partial) => {
        const next = mergeDeep(state, partial);

        for (const key of Object.keys(state)) {
          delete state[key];
        }

        Object.assign(state, next);
        return state;
      };

  const writeReplace = isFunction(replace)
    ? replace
    : (nextState) => {
        for (const key of Object.keys(state)) {
          delete state[key];
        }

        Object.assign(state, clone(nextState));
        return state;
      };

  const writeUpdate = isFunction(update)
    ? update
    : (path, updater) => {
        const current = getByPath(state, path);
        return writeSet(path, updater(current));
      };

  const writeRemove = isFunction(remove)
    ? remove
    : (path) => deleteByPath(state, path);

  function patchApp(value = {}) {
    return writePatch({ app: { ...(state.app || {}), ...(isObject(value) ? value : {}) } });
  }

  function patchSession(value = {}) {
    return writePatch({
      session: sessionPatch(value, state.session || {}),
    });
  }

  function patchUi(value = {}) {
    return writePatch({ ui: { ...(state.ui || {}), ...(isObject(value) ? value : {}) } });
  }

  function patchMeta(extra = {}) {
    return writePatch({
      meta: {
        ...(state.meta || {}),
        ...(isObject(extra) ? extra : {}),
        version: STORE_ACTIONS_VERSION,
        updatedAt: nowIso(),
        revision: Number(state.meta?.revision || 0) + 1,
      },
    });
  }

  const api = {
    version: STORE_ACTIONS_VERSION,

    /* APP */

    markReady(value = true) {
      const ready = Boolean(value);

      return patchApp({
        ready,
        loading: ready ? false : Boolean(state.app?.loading),
        booting: ready ? false : Boolean(state.app?.booting),
      });
    },

    markBooted(value = true) {
      const booted = Boolean(value);

      return patchApp({
        booted,
        booting: booted ? false : Boolean(state.app?.booting),
        loading: booted ? false : Boolean(state.app?.loading),
      });
    },

    setInitialized(value = true) {
      return writeSet("app.initialized", Boolean(value));
    },

    setBooting(value = false) {
      const booting = Boolean(value);

      return patchApp({
        booting,
        loading: booting ? true : Boolean(state.app?.loading),
      });
    },

    setLoading(value = false) {
      return writeSet("app.loading", Boolean(value));
    },

    setError(error = null) {
      return patchApp({
        lastError: error || null,
        error: error || null,
        hasError: Boolean(error),
      });
    },

    clearError() {
      return api.setError(null);
    },

    setRoute(route = DEFAULT_ROUTE) {
      const next = canonicalPath(route);

      return patchApp({
        route: next,
        canonicalPath: next,
      });
    },

    setCanonicalPath(route = DEFAULT_ROUTE) {
      return api.setRoute(route);
    },

    setPublicPath(path = DEFAULT_ROUTE) {
      return writeSet("app.publicPath", publicPath(path));
    },

    setRouteSnapshot({ route = undefined, canonicalPath: canonical = undefined, publicPath: visible = undefined } = {}) {
      const nextPublicPath = publicPath(visible || route || canonical || state.app?.publicPath || DEFAULT_ROUTE);
      const nextRoute = canonicalPath(canonical || route || nextPublicPath);

      return patchApp({
        route: nextRoute,
        canonicalPath: nextRoute,
        publicPath: nextPublicPath,
      });
    },

    setAppReady(value = true) {
      const ready = Boolean(value);

      return patchApp({
        ready,
        booted: ready ? true : Boolean(state.app?.booted),
        loading: ready ? false : Boolean(state.app?.loading),
        booting: ready ? false : Boolean(state.app?.booting),
      });
    },

    /* SESSION */

    setSession(payload = {}) {
      return patchSession(payload);
    },

    applySession(payload = {}) {
      return patchSession(extractSession(payload));
    },

    clearSession() {
      return patchSession({
        authenticated: false,
        hasToken: false,
        user: null,
      });
    },

    setAuthenticated(value = false) {
      if (!value) return api.clearSession();

      return patchSession({
        authenticated: true,
        hasToken: state.session?.hasToken === true,
        user: state.session?.user || null,
      });
    },

    setToken(value = "") {
      return patchSession({
        hasToken: tokenProvided(value),
        user: state.session?.user || null,
        authenticated: state.session?.authenticated === true,
      });
    },

    setAccessToken(value = "") {
      return api.setToken(value);
    },

    setRefreshToken() {
      return true;
    },

    setTempToken() {
      return true;
    },

    setSessionId() {
      return true;
    },

    setSessionUserId() {
      return true;
    },

    setUser(user = null) {
      return patchSession({
        hasToken: state.session?.hasToken === true,
        authenticated: state.session?.authenticated === true,
        user,
      });
    },

    setRole(role = "user") {
      return patchSession({
        hasToken: state.session?.hasToken === true,
        authenticated: state.session?.authenticated === true,
        user: state.session?.user || null,
        role,
      });
    },

    setRoles(roles = []) {
      const role = Array.isArray(roles) && roles.includes("admin") ? "admin" : "user";
      return api.setRole(role);
    },

    setPermissions() {
      return true;
    },

    /* UI */

    setTheme(theme = DEFAULT_THEME) {
      return patchUi({
        theme: normalizeTheme(theme),
        themeMode: normalizeTheme(theme),
        themePreference: normalizeTheme(theme),
      });
    },

    setThemePreference(theme = DEFAULT_THEME) {
      const value = normalizeTheme(theme);

      return patchUi({
        themePreference: value,
        themeMode: value,
      });
    },

    setLang(lang = DEFAULT_LANG) {
      const value = normalizeLang(lang);

      return patchUi({
        lang: value,
        language: value,
        locale: value,
      });
    },

    setSidebarOpen(value = false) {
      return writeSet("ui.sidebarOpen", Boolean(value));
    },

    toggleSidebar() {
      return api.setSidebarOpen(!Boolean(state.ui?.sidebarOpen));
    },

    setPageTitle(title = DEFAULT_TITLE) {
      const value = text(title, DEFAULT_TITLE);

      return patchUi({
        pageTitle: value,
        topbarTitle: value,
      });
    },

    setTopbarTitle(title = DEFAULT_TITLE) {
      return writeSet("ui.topbarTitle", text(title, DEFAULT_TITLE));
    },

    setDensity(density = "default") {
      return writeSet("ui.density", text(density, "default"));
    },

    resetTitles() {
      return api.setPageTitle(DEFAULT_TITLE);
    },

    hydrateTitles() {
      return api.setPageTitle(readDocumentTitle());
    },

    /* FLAGS */

    setFlag(flag = "", value = true) {
      const key = safeKey(flag);

      if (!key) throw new Error("actions.setFlag(flag, value) requiere flag válido.");

      return writeSet(`flags.${key}`, Boolean(value));
    },

    clearFlag(flag = "") {
      return api.setFlag(flag, false);
    },

    toggleFlag(flag = "") {
      const key = safeKey(flag);

      if (!key) throw new Error("actions.toggleFlag(flag) requiere flag válido.");

      return writeSet(`flags.${key}`, !Boolean(state.flags?.[key]));
    },

    setFlags(flags = {}) {
      const next = {};

      for (const [key, value] of Object.entries(isObject(flags) ? flags : {})) {
        const clean = safeKey(key);

        if (clean) next[clean] = Boolean(value);
      }

      return writePatch({
        flags: {
          ...(state.flags || {}),
          ...next,
        },
      });
    },

    resetFlags() {
      return writePatch({
        flags: {},
      });
    },

    setFetching(key = "", value = true) {
      const clean = safeKey(key);

      if (!clean) throw new Error("actions.setFetching(key, value) requiere key válido.");

      return api.setFlag(`fetching${clean[0].toUpperCase()}${clean.slice(1)}`, value);
    },

    /* COLLECTIONS */

    setCollection(key = "", items = []) {
      return writeSet(collectionPath(key), normalizeItems(items));
    },

    appendToCollection(key = "", item = null) {
      return writeUpdate(collectionPath(key), (list = []) => {
        const current = Array.isArray(list) ? list : [];
        return [...current, clone(item)];
      });
    },

    prependToCollection(key = "", item = null) {
      return writeUpdate(collectionPath(key), (list = []) => {
        const current = Array.isArray(list) ? list : [];
        return [clone(item), ...current];
      });
    },

    replaceCollectionItem(key = "", matcher = null, nextItem = null) {
      const match = matcherFor(matcher, nextItem);

      return writeUpdate(collectionPath(key), (list = []) => {
        const current = Array.isArray(list) ? list : [];
        return current.map((item) => (match(item) ? clone(nextItem) : item));
      });
    },

    updateCollectionItem(key = "", matcher = null, updater = null) {
      if (!isFunction(updater)) {
        throw new Error("actions.updateCollectionItem(key, matcher, updater) requiere updater.");
      }

      const match = matcherFor(matcher);

      return writeUpdate(collectionPath(key), (list = []) => {
        const current = Array.isArray(list) ? list : [];

        return current.map((item) => {
          if (!match(item)) return item;

          const next = updater(clone(item));
          return next === undefined ? item : next;
        });
      });
    },

    patchCollectionItem(key = "", matcher = null, partial = {}) {
      return api.updateCollectionItem(key, matcher, (item) => ({
        ...(isObject(item) ? item : {}),
        ...(isObject(partial) ? clone(partial) : {}),
      }));
    },

    upsertCollectionItem(key = "", item = null, matcher = null) {
      const nextItem = clone(item);
      const match = matcherFor(matcher, nextItem);

      return writeUpdate(collectionPath(key), (list = []) => {
        const current = Array.isArray(list) ? [...list] : [];
        const index = current.findIndex((entry) => match(entry));

        if (index >= 0) {
          current[index] = nextItem;
        } else {
          current.push(nextItem);
        }

        return current;
      });
    },

    removeCollectionItem(key = "", matcher = null) {
      const match = matcherFor(matcher);

      return writeUpdate(collectionPath(key), (list = []) => {
        const current = Array.isArray(list) ? list : [];
        return current.filter((item) => !match(item));
      });
    },

    clearCollection(key = "") {
      return writeSet(collectionPath(key), []);
    },

    clearCollections() {
      return writePatch({
        entities: {},
      });
    },

    /* CORE COMPAT */

    hydrateFromCore() {
      const coreState = isObject(AppCore?.state) ? AppCore.state : {};

      const route = canonicalPath(coreState.canonicalPath || coreState.route || coreState.publicPath || DEFAULT_ROUTE);
      const visible = publicPath(coreState.publicPath || coreState.route || DEFAULT_ROUTE);

      return writePatch({
        app: {
          ...(state.app || {}),
          ready: Boolean(coreState.ready || coreState.appReady),
          initialized: Boolean(coreState.initialized),
          booting: Boolean(coreState.booting),
          loading: Boolean(coreState.loading),
          route,
          canonicalPath: route,
          publicPath: visible,
          lastError: coreState.lastError || coreState.error || null,
        },

        session: sessionPatch({
          authenticated: coreState.authenticated,
          hasToken: coreState.hasToken,
          user: coreState.user || coreState.currentUser || null,
          role: coreState.role || coreState.rol || null,
        }),

        ui: {
          ...(state.ui || {}),
          theme: normalizeTheme(coreState.theme || state.ui?.theme || DEFAULT_THEME),
          themeMode: normalizeTheme(coreState.theme || state.ui?.themeMode || DEFAULT_THEME),
          lang: normalizeLang(coreState.lang || coreState.language || state.ui?.lang || DEFAULT_LANG),
          language: normalizeLang(coreState.language || coreState.lang || state.ui?.language || DEFAULT_LANG),
          locale: normalizeLang(coreState.locale || coreState.lang || state.ui?.locale || DEFAULT_LANG),
          sidebarOpen: coreState.sidebarOpen !== false,
          pageTitle: readDocumentTitle(),
          topbarTitle: readDocumentTitle(),
        },
      });
    },

    touchMeta(extra = {}) {
      return patchMeta(extra);
    },
  };

  return api;
}

export default {
  STORE_ACTIONS_VERSION,
  createActions,
};
