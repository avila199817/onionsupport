/* =========================================================
   Onion Support - Store Selectors
   Archivo: /src/store/selectors.js

   Responsabilidad:
   - Selectores mínimos sobre slices reales del Store.
   - Store sólo expone app/ui/entities/flags/meta.
   - Compat antigua para selectores Auth como no-op seguro.
   - Sin imports.
   - Sin collections.js.
   - Sin recursos inventados.
   - Sin permisos complejos.
   - Sin token raw.
   - Sin usuario Auth.
   - Sin sesión Auth.
   - Sin roles Auth.
   - Auth real pertenece a features/auth + core/state.
========================================================= */

export const STORE_SELECTORS_VERSION = "store.selectors.v3";

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

function isBlockedKey(key = "") {
  return BLOCKED_KEYS.has(String(key || ""));
}

function isSensitiveKey(key = "") {
  return SENSITIVE_KEY_RE.test(String(key || ""));
}

function isRootKey(key = "") {
  return ROOT_KEYS.includes(String(key || ""));
}

function pathParts(path = "") {
  return String(path || "")
    .replace(/\[(["'`]?)(.*?)\1\]/g, ".$2")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !isBlockedKey(part))
    .filter((part) => !isSensitiveKey(part));
}

function pathAllowed(path = "") {
  const parts = pathParts(path);

  if (!parts.length) return false;
  if (!isRootKey(parts[0])) return false;

  return true;
}

function getByPath(object, path, fallback = undefined) {
  const parts = pathParts(path);

  if (!parts.length || !pathAllowed(parts)) return fallback;

  let current = object;

  for (const part of parts) {
    if (current === null || current === undefined) return fallback;
    current = current[part];
  }

  return current === undefined ? fallback : current;
}

function entityId(entity = null) {
  if (!isObject(entity)) return "";

  return text(
    entity.id ||
      entity.ticketId ||
      entity.clienteId ||
      entity.facturaId ||
      entity.invoiceId ||
      entity.uuid ||
      "",
    ""
  );
}

function collectionName(key = "") {
  const name = text(key, "");

  if (!name) return "";
  if (isBlockedKey(name)) return "";
  if (isSensitiveKey(name)) return "";

  return name;
}

function nowSnapshot() {
  return nowIso();
}

function normalizeTheme(value = DEFAULT_THEME) {
  const theme = text(value, DEFAULT_THEME).toLowerCase();

  return ["dark", "light", "system"].includes(theme) ? theme : DEFAULT_THEME;
}

function normalizeLang(value = DEFAULT_LANG) {
  const lang = text(value, DEFAULT_LANG).toLowerCase().split("-")[0];

  return ["ca", "es", "en"].includes(lang) ? lang : DEFAULT_LANG;
}

/* =========================================================
   FACTORY
========================================================= */

export function createSelectors({ state } = {}) {
  const rootState = state || {};

  function root() {
    return isObject(rootState) ? rootState : {};
  }

  function app() {
    return isObject(root().app) ? root().app : {};
  }

  function ui() {
    return isObject(root().ui) ? root().ui : {};
  }

  function entities() {
    return isObject(root().entities) ? root().entities : {};
  }

  function flags() {
    return isObject(root().flags) ? root().flags : {};
  }

  function meta() {
    return isObject(root().meta) ? root().meta : {};
  }

  function collectionRawValue(key = "") {
    const name = collectionName(key);

    if (!name) return undefined;

    if (Object.prototype.hasOwnProperty.call(entities(), name)) {
      return entities()[name];
    }

    return undefined;
  }

  function collectionListRaw(key = "") {
    const value = collectionRawValue(key);
    return Array.isArray(value) ? value : [];
  }

  function emptySessionSnapshot() {
    return {
      version: STORE_SELECTORS_VERSION,

      authenticated: false,
      hasToken: false,

      token: null,
      accessToken: null,
      access_token: null,
      refreshToken: null,
      refresh_token: null,

      user: null,
      userIdentity: null,
      userId: null,
      username: null,
      displayName: null,
      avatar: null,

      role: null,
      roles: [],
      permissions: [],

      isAdmin: false,
      isUser: false,
      isSupport: false,
      isManager: false,
      isClient: false,

      raw: null,
      at: nowSnapshot(),

      policy: {
        compatOnly: true,
        storeDoesNotOwnAuth: true,
        storeDoesNotOwnSession: true,
        noTokenExposure: true,
        noUserAuthObjects: true,
      },
    };
  }

  const selectors = {
    /* =====================================
       APP
    ===================================== */

    isReady() {
      return Boolean(app().ready || root().ready);
    },

    isInitialized() {
      return Boolean(app().initialized || root().initialized);
    },

    isBooting() {
      return Boolean(app().booting || root().booting);
    },

    isLoading() {
      return Boolean(app().loading || root().loading);
    },

    isFatal() {
      return Boolean(app().fatal || root().fatal || root().appFatal);
    },

    lastError() {
      return clone(app().lastError || root().lastError || root().error || null);
    },

    currentRoute() {
      return text(app().route || root().route, DEFAULT_ROUTE);
    },

    currentCanonicalPath() {
      return text(app().canonicalPath || root().canonicalPath || selectors.currentRoute(), DEFAULT_ROUTE);
    },

    currentPublicPath() {
      return text(app().publicPath || root().publicPath || selectors.currentRoute(), DEFAULT_ROUTE);
    },

    routeSnapshot() {
      return {
        route: selectors.currentRoute(),
        canonicalPath: selectors.currentCanonicalPath(),
        publicPath: selectors.currentPublicPath(),
      };
    },

    appSnapshot() {
      return {
        ...clone(app()),
        initialized: selectors.isInitialized(),
        ready: selectors.isReady(),
        booting: selectors.isBooting(),
        loading: selectors.isLoading(),
        fatal: selectors.isFatal(),
        route: selectors.currentRoute(),
        canonicalPath: selectors.currentCanonicalPath(),
        publicPath: selectors.currentPublicPath(),
      };
    },

    /* =====================================
       AUTH / SESSION COMPAT NO-OP
    ===================================== */

    isAuthenticated() {
      return false;
    },

    hasToken() {
      return false;
    },

    hasUser() {
      return false;
    },

    currentUser() {
      return null;
    },

    currentUserRaw() {
      return null;
    },

    currentUserIdentity() {
      return null;
    },

    currentUserId() {
      return null;
    },

    currentUsername() {
      return null;
    },

    currentDisplayName() {
      return null;
    },

    currentAvatar() {
      return null;
    },

    currentRole() {
      return null;
    },

    currentRoles() {
      return [];
    },

    currentPermissions() {
      return [];
    },

    isAdmin() {
      return false;
    },

    isUser() {
      return false;
    },

    isSupport() {
      return false;
    },

    isManager() {
      return false;
    },

    isClient() {
      return false;
    },

    hasRole() {
      return false;
    },

    hasAnyRole() {
      return false;
    },

    hasAllRoles() {
      return false;
    },

    hasPermission() {
      return false;
    },

    hasAnyPermission() {
      return false;
    },

    hasAllPermissions() {
      return false;
    },

    token() {
      return null;
    },

    authHeader() {
      return {};
    },

    sessionSnapshot() {
      return emptySessionSnapshot();
    },

    /* =====================================
       UI
    ===================================== */

    currentTheme() {
      return normalizeTheme(ui().theme || root().theme || DEFAULT_THEME);
    },

    themePreference() {
      return normalizeTheme(ui().themePreference || selectors.currentTheme());
    },

    currentLang() {
      return normalizeLang(ui().lang || ui().language || root().lang || DEFAULT_LANG);
    },

    isSidebarOpen() {
      return ui().sidebarOpen !== false;
    },

    pageTitle() {
      return text(ui().pageTitle || root().pageTitle, DEFAULT_TITLE);
    },

    topbarTitle() {
      return text(ui().topbarTitle || ui().pageTitle || root().topbarTitle, selectors.pageTitle());
    },

    density() {
      return text(ui().density, "default");
    },

    uiSnapshot(options = {}) {
      return {
        theme: selectors.currentTheme(),
        themePreference: selectors.themePreference(),
        lang: selectors.currentLang(),
        sidebarOpen: selectors.isSidebarOpen(),
        density: selectors.density(),
        pageTitle: selectors.pageTitle(),
        topbarTitle: selectors.topbarTitle(),
        raw: options.includeRaw === true ? clone(ui()) : null,
      };
    },

    /* =====================================
       FLAGS
    ===================================== */

    flag(key, fallback = false) {
      const name = collectionName(key);

      return name && Object.prototype.hasOwnProperty.call(flags(), name)
        ? Boolean(flags()[name])
        : fallback;
    },

    flags() {
      return clone(flags()) || {};
    },

    isHydrating() {
      return selectors.flag("hydrating", false);
    },

    isFetching(key = "") {
      const name = collectionName(key);

      return name
        ? selectors.flag(`fetching${name[0]?.toUpperCase() || ""}${name.slice(1)}`, false)
        : false;
    },

    /* =====================================
       ENTITIES / COLLECTIONS
    ===================================== */

    collection(key) {
      return clone(collectionRawValue(key));
    },

    collectionRaw(key) {
      return collectionRawValue(key);
    },

    collectionList(key) {
      return collectionListRaw(key).map((item) => clone(item));
    },

    count(key) {
      const value = collectionRawValue(key);
      if (Array.isArray(value)) return value.length;
      return value ? 1 : 0;
    },

    isEmpty(key) {
      return selectors.count(key) === 0;
    },

    first(key) {
      const list = collectionListRaw(key);
      return list.length ? clone(list[0]) : null;
    },

    last(key) {
      const list = collectionListRaw(key);
      return list.length ? clone(list[list.length - 1]) : null;
    },

    find(key, predicate) {
      if (!isFunction(predicate)) return null;

      for (const item of collectionListRaw(key)) {
        try {
          if (predicate(item)) return clone(item);
        } catch {
          // noop
        }
      }

      return null;
    },

    filter(key, predicate) {
      if (!isFunction(predicate)) return [];

      return collectionListRaw(key)
        .filter((item) => {
          try {
            return predicate(item);
          } catch {
            return false;
          }
        })
        .map((item) => clone(item));
    },

    map(key, mapper) {
      if (!isFunction(mapper)) return [];

      return collectionListRaw(key).map((item, index) => {
        try {
          return mapper(clone(item), index);
        } catch {
          return null;
        }
      });
    },

    byId(key, id) {
      const wanted = text(id, "");
      if (!wanted) return null;

      return selectors.find(key, (item) => entityId(item) === wanted);
    },

    ids(key) {
      return collectionListRaw(key)
        .map(entityId)
        .filter(Boolean);
    },

    entityMap(key) {
      const map = new Map();

      for (const item of collectionListRaw(key)) {
        const id = entityId(item);
        if (id) map.set(id, clone(item));
      }

      return map;
    },

    entitiesSnapshot() {
      return clone(entities()) || {};
    },

    get(path, fallback = undefined) {
      return clone(getByPath(root(), path, fallback));
    },

    /* =====================================
       META
    ===================================== */

    meta() {
      return clone(meta()) || {};
    },

    hydrated() {
      return Boolean(meta().hydrated || root().hydrated);
    },

    revision() {
      return Number(meta().revision || root().revision || 0);
    },

    createdAt() {
      return meta().createdAt || root().createdAt || null;
    },

    updatedAt() {
      return meta().updatedAt || root().updatedAt || null;
    },

    /* =====================================
       FULL SNAPSHOT
    ===================================== */

    snapshot(options = {}) {
      return {
        version: STORE_SELECTORS_VERSION,

        app: selectors.appSnapshot(),

        ui: selectors.uiSnapshot({
          includeRaw: options.includeRawUi === true,
        }),

        flags: selectors.flags(),
        entities: options.includeEntities === false ? null : clone(entities()) || {},
        meta: selectors.meta(),

        /*
          Compat explícita: no es fuente Auth.
        */
        session: options.includeCompatSession === true
          ? selectors.sessionSnapshot()
          : null,

        policy: {
          storeSelectorsOnly: true,
          slices: [...ROOT_KEYS],

          noAuth: true,
          noSession: true,
          noToken: true,
          noUserAuthObjects: true,
          noRolesAuth: true,

          authSelectorsAreCompatNoop: true,
        },

        at: nowSnapshot(),
      };
    },

    getSnapshot(options = {}) {
      return selectors.snapshot(options);
    },

    getDebugSnapshot(options = {}) {
      return selectors.snapshot(options);
    },
  };

  return selectors;
}

export default {
  STORE_SELECTORS_VERSION,
  createSelectors,
};
