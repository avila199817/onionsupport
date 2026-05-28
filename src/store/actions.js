/* =========================================================
   Onion Support - Store Actions
   Archivo: /src/store/actions.js

   Responsabilidad:
   - Acciones mínimas de compat.
   - Sólo app/ui/entities/flags/meta.
   - No duplica Auth.
   - No duplica sesión.
   - No duplica Core State.
   - No duplica Router.
   - No duplica HTTP.
   - No guarda tokens reales.
   - No guarda usuario Auth.
   - No guarda roles Auth.
   - Sin rutas técnicas legacy.
   - Sin colecciones concretas inventadas.
   - Sin imports.
========================================================= */

export const STORE_ACTIONS_VERSION = "store.actions.v3";

const DEFAULT_ROUTE = "/";
const DEFAULT_LANG = "es";
const DEFAULT_THEME = "system";
const DEFAULT_TITLE = "Onion Support";

const ROOT_KEYS = Object.freeze([
  "app",
  "ui",
  "entities",
  "flags",
  "meta",
]);

const BLOCKED_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

const SENSITIVE_KEY_RE =
  /(^auth$|^session$|^sessionData$|^currentUser$|^authUser$|^sessionUser$|^user$|token|authorization|cookie|password|passwd|pwd|secret|credential|jwt|bearer|refresh|accessToken|access_token|idToken|id_token|apiKey|api_key|privateKey|private_key|connectionString|connection_string|sas|otp|totp|mfa|twofa|2fa|backupCode|backup_code|backupCodes|backup_codes|sessionId|session_id|role|roles|permissions)/i;

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
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function normalizeTheme(value = DEFAULT_THEME) {
  const theme = String(value || "").toLowerCase();

  return ["dark", "light", "system"].includes(theme) ? theme : DEFAULT_THEME;
}

function normalizeLang(value = DEFAULT_LANG) {
  const lang = String(value || "").toLowerCase().split("-")[0];

  return ["ca", "es", "en"].includes(lang) ? lang : DEFAULT_LANG;
}

function cleanPath(value = DEFAULT_ROUTE) {
  let path = text(value, DEFAULT_ROUTE)
    .split("?")[0]
    .split("#")[0]
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/g, "") || DEFAULT_ROUTE;

  return path || DEFAULT_ROUTE;
}

function publicPath(value = DEFAULT_ROUTE) {
  const raw = text(value, DEFAULT_ROUTE);

  if (!raw) return DEFAULT_ROUTE;
  if (raw.startsWith("//")) return DEFAULT_ROUTE;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return DEFAULT_ROUTE;
  if (/[\r\n\t\\]/.test(raw)) return DEFAULT_ROUTE;

  return raw.startsWith("/") ? raw : `/${raw}`;
}

function canonicalPath(value = DEFAULT_ROUTE) {
  return cleanPath(value);
}

function normalizeKey(value = "") {
  return text(value, "")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.:-]/g, "");
}

function isUnsafeKey(key = "") {
  return BLOCKED_KEYS.has(String(key || ""));
}

function isSensitiveKey(key = "") {
  return SENSITIVE_KEY_RE.test(String(key || ""));
}

function isRootKey(key = "") {
  return ROOT_KEYS.includes(String(key || ""));
}

function safeKey(value = "") {
  const key = normalizeKey(value);

  if (!key) return "";
  if (isUnsafeKey(key)) return "";
  if (isSensitiveKey(key)) return "";

  return key;
}

function pathParts(path = "") {
  return String(path || "")
    .replace(/\[(["'`]?)(.*?)\1\]/g, ".$2")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !isUnsafeKey(part))
    .filter((part) => !isSensitiveKey(part));
}

function pathAllowed(path = "") {
  const parts = pathParts(path);

  if (!parts.length) return false;
  if (!isRootKey(parts[0])) return false;

  return true;
}

function getByPath(root, path, fallback = undefined) {
  const parts = pathParts(path);

  if (!parts.length || !pathAllowed(parts)) return fallback;

  let current = root;

  for (const part of parts) {
    if (current === null || current === undefined) return fallback;
    current = current[part];
  }

  return current === undefined ? fallback : current;
}

function setByPath(root, path, value) {
  const parts = pathParts(path);

  if (!root || !parts.length || !pathAllowed(parts)) return false;

  let current = root;

  for (const part of parts.slice(0, -1)) {
    if (!isObject(current[part])) {
      current[part] = {};
    }

    current = current[part];
  }

  current[parts.at(-1)] = sanitizeValue(value, parts.at(-1));

  return true;
}

function deleteByPath(root, path) {
  const parts = pathParts(path);

  if (!root || !parts.length || !pathAllowed(parts)) return false;

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

function sanitizeValue(value, keyHint = "") {
  if (isUnsafeKey(keyHint) || isSensitiveKey(keyHint)) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeValue(item))
      .filter((item) => item !== undefined);
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, child] of Object.entries(value)) {
      if (isUnsafeKey(key)) continue;
      if (isSensitiveKey(key)) continue;

      const clean = sanitizeValue(child, key);

      if (clean !== undefined) {
        output[key] = clean;
      }
    }

    return output;
  }

  return clone(value);
}

function sanitizeRootPatch(source = {}) {
  if (!isObject(source)) return {};

  const output = {};

  for (const [key, value] of Object.entries(source)) {
    if (!isRootKey(key)) continue;
    if (isUnsafeKey(key)) continue;
    if (isSensitiveKey(key)) continue;

    const clean = sanitizeValue(value, key);

    if (clean !== undefined) {
      output[key] = clean;
    }
  }

  return output;
}

function mergeDeep(target = {}, source = {}) {
  const output = isObject(target) ? clone(target) : {};

  if (!isObject(source)) return output;

  for (const [key, value] of Object.entries(source)) {
    if (isUnsafeKey(key)) continue;
    if (isSensitiveKey(key)) continue;

    const clean = sanitizeValue(value, key);

    if (clean === undefined) continue;

    output[key] =
      isObject(clean) && isObject(output[key])
        ? mergeDeep(output[key], clean)
        : clean;
  }

  return output;
}

function entityId(item = null) {
  if (!isObject(item)) return "";

  return text(
    item.id ||
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
  return Array.isArray(items) ? sanitizeValue(items) : [sanitizeValue(items)].filter((item) => item !== undefined);
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

function safeError(error = null) {
  if (!error) return null;

  if (typeof error === "string") {
    return {
      name: "Error",
      message: text(error, ""),
      code: null,
      status: null,
    };
  }

  if (!isObject(error)) {
    return {
      name: "Error",
      message: text(String(error), ""),
      code: null,
      status: null,
    };
  }

  return {
    name: text(error.name, "Error"),
    message: text(error.message || error.detail || error.reason || String(error), ""),
    code: error.code || error.error || null,
    status: error.status || error.statusCode || error.response?.status || null,
  };
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
        if (!pathAllowed(path)) return undefined;
        setByPath(state, path, clone(value));
        return getByPath(state, path);
      };

  const writePatch = isFunction(patch)
    ? patch
    : (partial) => {
        const cleanPatch = sanitizeRootPatch(partial);
        const next = mergeDeep(state, cleanPatch);

        for (const key of Object.keys(state)) {
          delete state[key];
        }

        Object.assign(state, next);
        return state;
      };

  const writeReplace = isFunction(replace)
    ? replace
    : (nextState) => {
        const cleanPatch = sanitizeRootPatch(nextState);

        for (const key of Object.keys(state)) {
          delete state[key];
        }

        Object.assign(state, clone(cleanPatch));
        return state;
      };

  const writeUpdate = isFunction(update)
    ? update
    : (path, updater) => {
        if (!pathAllowed(path)) return undefined;

        const current = getByPath(state, path);
        return writeSet(path, updater(current));
      };

  const writeRemove = isFunction(remove)
    ? remove
    : (path) => deleteByPath(state, path);

  function patchApp(value = {}) {
    return writePatch({
      app: {
        ...(state.app || {}),
        ...(isObject(value) ? sanitizeValue(value, "app") : {}),
      },
    });
  }

  function patchUi(value = {}) {
    return writePatch({
      ui: {
        ...(state.ui || {}),
        ...(isObject(value) ? sanitizeValue(value, "ui") : {}),
      },
    });
  }

  function patchMeta(extra = {}) {
    return writePatch({
      meta: {
        ...(state.meta || {}),
        ...(isObject(extra) ? sanitizeValue(extra, "meta") : {}),
        version: STORE_ACTIONS_VERSION,
        updatedAt: nowIso(),
        revision: Number(state.meta?.revision || 0) + 1,
      },
    });
  }

  function authNoop() {
    /*
      Compat antigua:
      Store ya no escribe Auth/session/token/user/role.
      Esas responsabilidades pertenecen a features/auth y core/state.
    */
    return false;
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
        lastError: safeError(error),
        error: safeError(error),
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

    setRouteSnapshot({
      route = undefined,
      canonicalPath: canonical = undefined,
      publicPath: visible = undefined,
    } = {}) {
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

    /* AUTH / SESSION COMPAT NO-OP */

    setSession: authNoop,
    applySession: authNoop,
    clearSession: authNoop,
    setAuthenticated: authNoop,
    setToken: authNoop,
    setAccessToken: authNoop,
    setRefreshToken: authNoop,
    setTempToken: authNoop,
    setSessionId: authNoop,
    setSessionUserId: authNoop,
    setUser: authNoop,
    setRole: authNoop,
    setRoles: authNoop,
    setPermissions: authNoop,

    /* UI */

    setTheme(theme = DEFAULT_THEME) {
      const value = normalizeTheme(theme);

      return patchUi({
        theme: value,
        themeMode: value,
        themePreference: value,
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
        const clean = sanitizeValue(item);

        if (clean === undefined) return current;

        return [...current, clean];
      });
    },

    prependToCollection(key = "", item = null) {
      return writeUpdate(collectionPath(key), (list = []) => {
        const current = Array.isArray(list) ? list : [];
        const clean = sanitizeValue(item);

        if (clean === undefined) return current;

        return [clean, ...current];
      });
    },

    replaceCollectionItem(key = "", matcher = null, nextItem = null) {
      const cleanItem = sanitizeValue(nextItem);
      const match = matcherFor(matcher, cleanItem);

      return writeUpdate(collectionPath(key), (list = []) => {
        const current = Array.isArray(list) ? list : [];
        return current.map((item) => (match(item) ? cleanItem : item));
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
          const clean = sanitizeValue(next);

          return clean === undefined ? item : clean;
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
      const nextItem = sanitizeValue(item);

      if (nextItem === undefined) {
        return writeUpdate(collectionPath(key), (list = []) => Array.isArray(list) ? list : []);
      }

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
          fatal: Boolean(coreState.fatal || coreState.appFatal),
          route,
          canonicalPath: route,
          publicPath: visible,
          lastError: safeError(coreState.lastError || coreState.error || null),
        },

        ui: {
          ...(state.ui || {}),
          theme: normalizeTheme(coreState.theme || state.ui?.theme || DEFAULT_THEME),
          themeMode: normalizeTheme(coreState.theme || state.ui?.themeMode || DEFAULT_THEME),
          themePreference: normalizeTheme(coreState.theme || state.ui?.themePreference || DEFAULT_THEME),
          lang: normalizeLang(coreState.lang || coreState.language || state.ui?.lang || DEFAULT_LANG),
          language: normalizeLang(coreState.language || coreState.lang || state.ui?.language || DEFAULT_LANG),
          locale: normalizeLang(coreState.locale || coreState.lang || state.ui?.locale || DEFAULT_LANG),
          sidebarOpen: coreState.sidebarOpen !== false,
          shellVisible: coreState.shellVisible !== false,
          chromeVisible: coreState.chromeVisible !== false,
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
