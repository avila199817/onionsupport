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
const THEME_PREFERENCE = "system";
const DEFAULT_TITLE = "Onion Support";

const ROOT_KEYS = Object.freeze([
  "ui",
  "app",
  "entities",
  "flags",
  "meta",
]);

const ROOT_KEY_SET = new Set(ROOT_KEYS);

const BLOCKED_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

const SENSITIVE_KEY_RE =
  /(^auth$|^session$|^sessionData$|^currentUser$|^authUser$|^sessionUser$|^user$|token|authorization|cookie|password|passwd|pwd|secret|credential|jwt|bearer|refresh|accessToken|access_token|idToken|id_token|apiKey|api_key|privateKey|private_key|connectionString|connection_string|sas|otp|totp|mfa|twofa|2fa|backupCode|backup_code|backupCodes|backup_codes|sessionId|session_id|^role$|^roles$|^permissions$|^_rid$|^_self$|^_etag$|^_attachments$|^_ts$)/i;

const SENSITIVE_QUERY_KEYS = new Set([
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
]);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
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

function normalizeKey(value = "") {
  return String(value ?? "").trim();
}

function isUnsafeKey(key = "") {
  return BLOCKED_KEYS.has(normalizeKey(key));
}

function isSensitiveKey(key = "") {
  return SENSITIVE_KEY_RE.test(normalizeKey(key));
}

function isRootKey(key = "") {
  return ROOT_KEY_SET.has(normalizeKey(key));
}

function readState(source = {}) {
  if (isFunction(source.get)) {
    const next = source.get();
    return isObject(next) ? next : {};
  }

  if (isFunction(source.getState)) {
    const next = source.getState();
    return isObject(next) ? next : {};
  }

  if (isFunction(source.state)) {
    const next = source.state();
    return isObject(next) ? next : {};
  }

  return isObject(source.state) ? source.state : {};
}

function redact(value = "") {
  return text(value, "")
    .replace(/([?&#](?:token|access_token|accessToken|refresh_token|refreshToken|id_token|idToken|code|session|sessionId)=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
}

function normalizeLang() {
  return DEFAULT_LANG;
}

function readEffectiveTheme() {
  if (isBrowser()) {
    const domTheme = text(document.documentElement?.dataset?.theme, "").toLowerCase();

    if (domTheme === "dark" || domTheme === "light") {
      return domTheme;
    }

    try {
      return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
        ? "dark"
        : "light";
    } catch {
      return THEME_PREFERENCE;
    }
  }

  return THEME_PREFERENCE;
}

function cleanPath(value = DEFAULT_ROUTE) {
  const raw = text(value, DEFAULT_ROUTE);

  if (!raw) return DEFAULT_ROUTE;
  if (raw.startsWith("//")) return DEFAULT_ROUTE;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return DEFAULT_ROUTE;
  if (/[\r\n\t\\]/.test(raw)) return DEFAULT_ROUTE;

  let path = raw
    .split("?")[0]
    .split("#")[0]
    .replace(/\/{2,}/g, "/");

  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  if (path.length > 1) {
    path = path.replace(/\/+$/g, "") || DEFAULT_ROUTE;
  }

  return path || DEFAULT_ROUTE;
}

function cleanSearch(search = "") {
  const raw = text(search, "");

  if (!raw || raw === "?") return "";

  const normalized = raw.startsWith("?")
    ? raw
    : `?${raw.replace(/^\?+/, "")}`;

  try {
    const params = new URLSearchParams(normalized);

    for (const key of [...params.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(key) || SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        params.delete(key);
      }
    }

    const output = params.toString();

    return output ? `?${output}` : "";
  } catch {
    return "";
  }
}

function cleanHash(hash = "") {
  const raw = text(hash, "");

  if (!raw || raw === "#") return "";
  if (/[\r\n\t\\]/.test(raw)) return "";

  const normalized = raw.startsWith("#")
    ? raw
    : `#${raw.replace(/^#+/, "")}`;

  const body = normalized.slice(1);

  if (!body) return "";

  const queryIndex = body.indexOf("?");

  if (queryIndex >= 0) {
    const hashPath = body.slice(0, queryIndex).replace(/[?#\\]/g, "");
    const query = cleanSearch(`?${body.slice(queryIndex + 1)}`);

    return query ? `#${hashPath}${query}` : `#${hashPath}`;
  }

  if (/^[^/?#=&]+=/i.test(body)) {
    const query = cleanSearch(`?${body}`);
    return query ? `#${query.slice(1)}` : "";
  }

  return redact(normalized);
}

function splitRouteLike(value = DEFAULT_ROUTE) {
  let raw = text(value, DEFAULT_ROUTE);

  if (!raw) raw = DEFAULT_ROUTE;

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
    pathname,
    search,
    hash,
  };
}

function publicPath(value = DEFAULT_ROUTE) {
  const raw = text(value, DEFAULT_ROUTE);

  if (!raw) return DEFAULT_ROUTE;
  if (raw.startsWith("//")) return DEFAULT_ROUTE;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return DEFAULT_ROUTE;
  if (/[\r\n\t\\]/.test(raw)) return DEFAULT_ROUTE;

  const parts = splitRouteLike(raw);
  const pathname = cleanPath(parts.pathname);
  const output = `${pathname}${cleanSearch(parts.search)}${cleanHash(parts.hash)}`;

  return output || DEFAULT_ROUTE;
}

function canonicalPath(value = DEFAULT_ROUTE) {
  return cleanPath(value);
}

function safeDataKey(value = "") {
  const key = text(value, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!key) return "";
  if (isUnsafeKey(key)) return "";
  if (isSensitiveKey(key)) return "";

  return key;
}

function pathParts(path = "") {
  const source = Array.isArray(path)
    ? path
    : String(path ?? "")
        .replace(/\[(["'`]?)(.*?)\1\]/g, ".$2")
        .split(".");

  const parts = source
    .map((part) => normalizeKey(part))
    .filter(Boolean);

  if (!parts.length) return [];
  if (parts.some(isUnsafeKey)) return [];
  if (parts.some(isSensitiveKey)) return [];

  return parts;
}

function pathAllowed(path = "") {
  const parts = pathParts(path);

  if (!parts.length) return false;

  return isRootKey(parts[0]);
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

  if (!isObject(root) || !parts.length || !pathAllowed(parts)) return false;

  const key = parts.at(-1);
  const clean = sanitizeValue(value, key);

  if (clean === undefined) return false;
  if (parts.length === 1 && !isObject(clean)) return false;

  let current = root;

  for (const part of parts.slice(0, -1)) {
    if (current[part] === undefined) {
      current[part] = {};
    }

    if (!isObject(current[part])) {
      return false;
    }

    current = current[part];
  }

  current[key] = clean;

  return true;
}

function sanitizeValue(value, keyHint = "") {
  if (isUnsafeKey(keyHint) || isSensitiveKey(keyHint)) {
    return undefined;
  }

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

  if (
    valueType === "string" ||
    valueType === "number" ||
    valueType === "boolean"
  ) {
    return clone(value);
  }

  return undefined;
}

function sanitizeRootPatch(source = {}) {
  if (!isObject(source)) return {};

  const output = {};

  for (const [key, value] of Object.entries(source)) {
    if (!isRootKey(key)) continue;
    if (isUnsafeKey(key)) continue;
    if (isSensitiveKey(key)) continue;

    const clean = sanitizeValue(value, key);

    if (isObject(clean)) {
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
  if (isFunction(matcher)) {
    return (current) => {
      try {
        return Boolean(matcher(clone(current)));
      } catch {
        return false;
      }
    };
  }

  const wanted = text(matcher || entityId(item), "");

  return wanted
    ? (current) => entityId(current) === wanted
    : () => false;
}

function normalizeItems(items = []) {
  if (items === null || items === undefined) return [];

  const source = Array.isArray(items) ? items : [items];

  return source
    .map((item) => sanitizeValue(item))
    .filter((item) => item !== undefined);
}

function collectionKey(key = "") {
  const clean = safeDataKey(key);

  if (!clean) {
    throw new Error("Collection key requerido.");
  }

  return clean;
}

function collectionPath(key = "") {
  return `entities.${collectionKey(key)}`;
}

function readDocumentTitle() {
  if (!isBrowser()) return DEFAULT_TITLE;

  return redact(text(document.title, DEFAULT_TITLE));
}

function safeError(error = null) {
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
   FACTORY
========================================================= */

export function createActions({
  AppCore = null,
  state = {},
  get = null,
  getState = null,
  set = null,
  patch = null,
  update = null,
} = {}) {
  const source = {
    state,
    get,
    getState,
  };

  const writeSet = isFunction(set)
    ? set
    : (path, value) => {
        const currentState = readState(source);

        if (!pathAllowed(path)) return undefined;

        const ok = setByPath(currentState, path, value);

        return ok ? clone(getByPath(currentState, path)) : undefined;
      };

  const writePatch = isFunction(patch)
    ? patch
    : (partial) => {
        const currentState = readState(source);
        const cleanPatch = sanitizeRootPatch(partial);
        const next = mergeDeep(currentState, cleanPatch);

        for (const key of Object.keys(currentState)) {
          delete currentState[key];
        }

        Object.assign(currentState, next);

        return clone(currentState);
      };

  const writeUpdate = isFunction(update)
    ? update
    : (path, updater) => {
        const currentState = readState(source);

        if (!isFunction(updater)) return undefined;
        if (!pathAllowed(path)) return undefined;

        const current = clone(getByPath(currentState, path));
        return writeSet(path, updater(current));
      };

  function current() {
    return readState(source);
  }

  function patchApp(value = {}) {
    const clean = isObject(value) ? sanitizeValue(value, "app") : {};

    return writePatch({
      app: clean,
    });
  }

  function patchUi(value = {}) {
    const clean = isObject(value) ? sanitizeValue(value, "ui") : {};

    return writePatch({
      ui: clean,
    });
  }

  function patchMeta(extra = {}) {
    const meta = current().meta || {};

    return writePatch({
      meta: {
        ...(isObject(extra) ? sanitizeValue(extra, "meta") : {}),
        version: STORE_ACTIONS_VERSION,
        updatedAt: nowIso(),
        revision: Number(meta.revision || 0) + 1,
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
      const app = current().app || {};
      const ready = Boolean(value);

      return patchApp({
        ready,
        loading: ready ? false : Boolean(app.loading),
        booting: ready ? false : Boolean(app.booting),
      });
    },

    markBooted(value = true) {
      const app = current().app || {};
      const booted = Boolean(value);

      return patchApp({
        booted,
        booting: booted ? false : Boolean(app.booting),
        loading: booted ? false : Boolean(app.loading),
      });
    },

    setInitialized(value = true) {
      return writeSet("app.initialized", Boolean(value));
    },

    setBooting(value = false) {
      const app = current().app || {};
      const booting = Boolean(value);

      return patchApp({
        booting,
        loading: booting ? true : Boolean(app.loading),
      });
    },

    setLoading(value = false) {
      return writeSet("app.loading", Boolean(value));
    },

    setError(error = null) {
      const clean = safeError(error);

      return patchApp({
        lastError: clean,
        error: clean,
        hasError: Boolean(clean),
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
      const app = current().app || {};
      const nextPublicPath = publicPath(
        visible ||
          route ||
          canonical ||
          app.publicPath ||
          DEFAULT_ROUTE
      );
      const nextRoute = canonicalPath(canonical || route || nextPublicPath);

      return patchApp({
        route: nextRoute,
        canonicalPath: nextRoute,
        publicPath: nextPublicPath,
      });
    },

    setAppReady(value = true) {
      const app = current().app || {};
      const ready = Boolean(value);

      return patchApp({
        ready,
        booted: ready ? true : Boolean(app.booted),
        loading: ready ? false : Boolean(app.loading),
        booting: ready ? false : Boolean(app.booting),
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

    setTheme() {
      return patchUi({
        theme: THEME_PREFERENCE,
        themePreference: THEME_PREFERENCE,
        themeMode: readEffectiveTheme(),
        effectiveTheme: readEffectiveTheme(),
      });
    },

    setThemePreference() {
      return api.setTheme();
    },

    setLang() {
      const value = normalizeLang();

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
      const ui = current().ui || {};

      return api.setSidebarOpen(!Boolean(ui.sidebarOpen));
    },

    setPageTitle(title = DEFAULT_TITLE) {
      const value = redact(text(title, DEFAULT_TITLE));

      return patchUi({
        pageTitle: value,
        topbarTitle: value,
      });
    },

    setTopbarTitle(title = DEFAULT_TITLE) {
      return writeSet("ui.topbarTitle", redact(text(title, DEFAULT_TITLE)));
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
      const key = safeDataKey(flag);

      if (!key) {
        throw new Error("actions.setFlag(flag, value) requiere flag válido.");
      }

      return writeSet(`flags.${key}`, Boolean(value));
    },

    clearFlag(flag = "") {
      return api.setFlag(flag, false);
    },

    toggleFlag(flag = "") {
      const key = safeDataKey(flag);

      if (!key) {
        throw new Error("actions.toggleFlag(flag) requiere flag válido.");
      }

      return writeSet(`flags.${key}`, !Boolean(current().flags?.[key]));
    },

    setFlags(flags = {}) {
      const next = {};

      for (const [key, value] of Object.entries(isObject(flags) ? flags : {})) {
        const clean = safeDataKey(key);

        if (clean) {
          next[clean] = Boolean(value);
        }
      }

      return writePatch({
        flags: next,
      });
    },

    resetFlags() {
      return writePatch({
        flags: {},
      });
    },

    setFetching(key = "", value = true) {
      const clean = safeDataKey(key);

      if (!clean) {
        throw new Error("actions.setFetching(key, value) requiere key válido.");
      }

      return api.setFlag(
        `fetching${clean[0].toUpperCase()}${clean.slice(1)}`,
        value
      );
    },

    /* COLLECTIONS */

    setCollection(key = "", items = []) {
      return writeSet(collectionPath(key), normalizeItems(items));
    },

    appendToCollection(key = "", item = null) {
      return writeUpdate(collectionPath(key), (list = []) => {
        const currentList = Array.isArray(list) ? list : [];
        const clean = sanitizeValue(item);

        if (clean === undefined) return currentList;

        return [...currentList, clean];
      });
    },

    prependToCollection(key = "", item = null) {
      return writeUpdate(collectionPath(key), (list = []) => {
        const currentList = Array.isArray(list) ? list : [];
        const clean = sanitizeValue(item);

        if (clean === undefined) return currentList;

        return [clean, ...currentList];
      });
    },

    replaceCollectionItem(key = "", matcher = null, nextItem = null) {
      const cleanItem = sanitizeValue(nextItem);

      if (cleanItem === undefined) {
        return writeUpdate(collectionPath(key), (list = []) =>
          Array.isArray(list) ? list : []
        );
      }

      const match = matcherFor(matcher, cleanItem);

      return writeUpdate(collectionPath(key), (list = []) => {
        const currentList = Array.isArray(list) ? list : [];

        return currentList.map((item) => (match(item) ? cleanItem : item));
      });
    },

    updateCollectionItem(key = "", matcher = null, updater = null) {
      if (!isFunction(updater)) {
        throw new Error("actions.updateCollectionItem(key, matcher, updater) requiere updater.");
      }

      const match = matcherFor(matcher);

      return writeUpdate(collectionPath(key), (list = []) => {
        const currentList = Array.isArray(list) ? list : [];

        return currentList.map((item) => {
          if (!match(item)) return item;

          const next = updater(clone(item));
          const clean = sanitizeValue(next);

          return clean === undefined ? item : clean;
        });
      });
    },

    patchCollectionItem(key = "", matcher = null, partial = {}) {
      const cleanPartial = isObject(partial) ? sanitizeValue(partial) : {};

      return api.updateCollectionItem(key, matcher, (item) => ({
        ...(isObject(item) ? item : {}),
        ...(isObject(cleanPartial) ? cleanPartial : {}),
      }));
    },

    upsertCollectionItem(key = "", item = null, matcher = null) {
      const nextItem = sanitizeValue(item);

      if (nextItem === undefined) {
        return writeUpdate(collectionPath(key), (list = []) =>
          Array.isArray(list) ? list : []
        );
      }

      const match = matcherFor(matcher, nextItem);

      return writeUpdate(collectionPath(key), (list = []) => {
        const currentList = Array.isArray(list) ? [...list] : [];
        const index = currentList.findIndex((entry) => match(entry));

        if (index >= 0) {
          currentList[index] = nextItem;
        } else {
          currentList.push(nextItem);
        }

        return currentList;
      });
    },

    removeCollectionItem(key = "", matcher = null) {
      const match = matcherFor(matcher);

      return writeUpdate(collectionPath(key), (list = []) => {
        const currentList = Array.isArray(list) ? list : [];

        return currentList.filter((item) => !match(item));
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
      const route = canonicalPath(
        coreState.canonicalPath ||
          coreState.route ||
          coreState.publicPath ||
          DEFAULT_ROUTE
      );
      const visible = publicPath(
        coreState.publicPath ||
          coreState.route ||
          DEFAULT_ROUTE
      );
      const lang = normalizeLang();

      return writePatch({
        app: {
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
          theme: THEME_PREFERENCE,
          themePreference: THEME_PREFERENCE,
          themeMode: readEffectiveTheme(),
          effectiveTheme: readEffectiveTheme(),

          lang,
          language: lang,
          locale: lang,

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
