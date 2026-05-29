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

/* =========================================================
   BASICS
========================================================= */

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

function normalizeKey(key = "") {
  return String(key ?? "").trim();
}

function isBlockedKey(key = "") {
  return BLOCKED_KEYS.has(normalizeKey(key));
}

function isSensitiveKey(key = "") {
  return SENSITIVE_KEY_RE.test(normalizeKey(key));
}

function isRootKey(key = "") {
  return ROOT_KEY_SET.has(normalizeKey(key));
}

function safeClone(value, key = "", rootLevel = false) {
  if (isBlockedKey(key)) return undefined;

  if (isSensitiveKey(key)) {
    return value ? "***" : null;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => safeClone(item))
      .filter((item) => item !== undefined);
  }

  if (isObject(value)) {
    const output = {};

    for (const [childKey, childValue] of Object.entries(value)) {
      if (isBlockedKey(childKey)) continue;
      if (rootLevel && !isRootKey(childKey)) continue;

      const clean = safeClone(childValue, childKey, false);

      if (clean !== undefined) {
        output[childKey] = clean;
      }
    }

    return output;
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return clone(value);
  }

  return undefined;
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
  if (parts.some(isBlockedKey)) return [];
  if (parts.some(isSensitiveKey)) return [];

  return parts;
}

function pathAllowed(path = "") {
  const parts = pathParts(path);

  if (!parts.length) return false;

  return isRootKey(parts[0]);
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
  if (name.includes(".") || name.includes("[") || name.includes("]")) return "";

  return name;
}

function nowSnapshot() {
  return nowIso();
}

function normalizeTheme(value = DEFAULT_THEME) {
  const theme = text(value, DEFAULT_THEME).toLowerCase();

  return ["dark", "light", "system"].includes(theme) ? theme : DEFAULT_THEME;
}

function normalizeEffectiveTheme(value = "") {
  const theme = text(value, "").toLowerCase();

  return theme === "dark" || theme === "light" ? theme : DEFAULT_THEME;
}

function normalizeLang() {
  return DEFAULT_LANG;
}

/* =========================================================
   FACTORY
========================================================= */

export function createSelectors(source = {}) {
  const fixedState = source?.state;

  function root() {
    let value = fixedState;

    if (isFunction(source?.getState)) {
      value = source.getState();
    } else if (isFunction(source?.get)) {
      value = source.get();
    } else if (isFunction(fixedState)) {
      value = fixedState();
    } else if (isObject(source?.store?.state)) {
      value = source.store.state;
    }

    return isObject(value) ? value : {};
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
      return safeClone(app().lastError || root().lastError || root().error || null);
    },

    currentRoute() {
      return text(app().route || root().route, DEFAULT_ROUTE);
    },

    currentCanonicalPath() {
      return text(
        app().canonicalPath ||
          root().canonicalPath ||
          selectors.currentRoute(),
        DEFAULT_ROUTE
      );
    },

    currentPublicPath() {
      return text(
        app().publicPath ||
          root().publicPath ||
          selectors.currentRoute(),
        DEFAULT_ROUTE
      );
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
        ...safeClone(app()),
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
      return normalizeEffectiveTheme(
        ui().effectiveTheme ||
          ui().themeMode ||
          root().effectiveTheme ||
          root().themeMode ||
          ui().theme ||
          root().theme ||
          DEFAULT_THEME
      );
    },

    effectiveTheme() {
      return selectors.currentTheme();
    },

    themePreference() {
      return normalizeTheme(
        ui().themePreference ||
          ui().theme ||
          root().themePreference ||
          root().theme ||
          DEFAULT_THEME
      );
    },

    currentLang() {
      return normalizeLang(
        ui().lang ||
          ui().language ||
          root().lang ||
          DEFAULT_LANG
      );
    },

    isSidebarOpen() {
      return ui().sidebarOpen !== false;
    },

    pageTitle() {
      return text(ui().pageTitle || root().pageTitle, DEFAULT_TITLE);
    },

    topbarTitle() {
      return text(
        ui().topbarTitle ||
          ui().pageTitle ||
          root().topbarTitle,
        selectors.pageTitle()
      );
    },

    density() {
      return text(ui().density, "default");
    },

    uiSnapshot(options = {}) {
      return {
        theme: selectors.currentTheme(),
        effectiveTheme: selectors.effectiveTheme(),
        themePreference: selectors.themePreference(),
        lang: selectors.currentLang(),
        sidebarOpen: selectors.isSidebarOpen(),
        density: selectors.density(),
        pageTitle: selectors.pageTitle(),
        topbarTitle: selectors.topbarTitle(),
        raw: options.includeRaw === true ? safeClone(ui()) : null,
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
      return safeClone(flags()) || {};
    },

    isHydrating() {
      return selectors.flag("hydrating", false);
    },

    isFetching(key = "") {
      const name = collectionName(key);

      return name
        ? selectors.flag(
            `fetching${name[0]?.toUpperCase() || ""}${name.slice(1)}`,
            false
          )
        : false;
    },

    /* =====================================
       ENTITIES / COLLECTIONS
    ===================================== */

    collection(key) {
      return safeClone(collectionRawValue(key));
    },

    collectionRaw(key) {
      return safeClone(collectionRawValue(key));
    },

    collectionList(key) {
      return collectionListRaw(key).map((item) => safeClone(item));
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

      return list.length ? safeClone(list[0]) : null;
    },

    last(key) {
      const list = collectionListRaw(key);

      return list.length ? safeClone(list[list.length - 1]) : null;
    },

    find(key, predicate) {
      if (!isFunction(predicate)) return null;

      for (const item of collectionListRaw(key)) {
        try {
          if (predicate(safeClone(item))) return safeClone(item);
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
            return predicate(safeClone(item));
          } catch {
            return false;
          }
        })
        .map((item) => safeClone(item));
    },

    map(key, mapper) {
      if (!isFunction(mapper)) return [];

      return collectionListRaw(key).map((item, index) => {
        try {
          const mapped = mapper(safeClone(item), index);
          return safeClone(mapped);
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

        if (id) {
          map.set(id, safeClone(item));
        }
      }

      return map;
    },

    entitiesSnapshot() {
      return safeClone(entities()) || {};
    },

    get(path, fallback = undefined) {
      const value = getByPath(root(), path, fallback);

      return value === fallback ? fallback : safeClone(value);
    },

    /* =====================================
       META
    ===================================== */

    meta() {
      return safeClone(meta()) || {};
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
        entities: options.includeEntities === false
          ? null
          : safeClone(entities()) || {},
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
