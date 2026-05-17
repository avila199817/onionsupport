/* =========================================================
   Onion Support - Store Selectors
   Archivo: /src/store/selectors.js

   Responsabilidad:
   - Selectores mínimos sobre slices reales.
   - Sin imports.
   - Sin collections.js.
   - Sin recursos inventados.
   - Sin permisos complejos.
   - Sin token raw por defecto.
   - Auth estricta: hasToken + user usable.
   - User inválido sólo si disabled.
   - Roles únicos: admin / user.
========================================================= */

export const STORE_SELECTORS_VERSION = "simple";

const ROLE_ADMIN = "admin";
const ROLE_USER = "user";

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

function getByPath(object, path, fallback = undefined) {
  const parts = String(path || "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !["__proto__", "prototype", "constructor"].includes(part));

  if (!parts.length) return fallback;

  let current = object;

  for (const part of parts) {
    if (current === null || current === undefined) return fallback;
    current = current[part];
  }

  return current === undefined ? fallback : current;
}

function normalizeRole(value = "") {
  return String(value).toLowerCase() === ROLE_ADMIN ? ROLE_ADMIN : ROLE_USER;
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

function userId(user = null) {
  return user?.userId || user?.id || null;
}

function username(user = null) {
  return user?.username || user?.slug || user?.email || "";
}

function displayName(user = null) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.nombre ||
    user?.username ||
    user?.email ||
    "Usuario"
  );
}

function avatarUrl(user = null) {
  return user?.avatarUrl || user?.avatar || user?.picture || "";
}

function hasToken(session = {}, root = {}) {
  return Boolean(session.hasToken || root.hasToken);
}

function sessionUser(session = {}, root = {}) {
  return (
    session.user ||
    session.currentUser ||
    root.user ||
    root.currentUser ||
    null
  );
}

function isAuthenticated(session = {}, root = {}) {
  return Boolean(
    (session.authenticated === true || root.authenticated === true) &&
      hasToken(session, root) &&
      usableUser(sessionUser(session, root))
  );
}

function entityId(entity = null) {
  if (!isObject(entity)) return "";

  return text(
    entity.id ||
      entity.userId ||
      entity.ticketId ||
      entity.clienteId ||
      entity.facturaId ||
      entity.invoiceId ||
      entity.uuid ||
      "",
    ""
  );
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function nowIso() {
  return new Date().toISOString();
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

  function session() {
    return isObject(root().session) ? root().session : {};
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

  function currentUserRaw() {
    return isAuthenticated(session(), root())
      ? sessionUser(session(), root())
      : null;
  }

  function currentRoleRaw() {
    const user = currentUserRaw();

    if (!user) return null;

    return normalizeRole(session().role || root().role || user.role || user.rol);
  }

  function collectionRawValue(key = "") {
    const name = text(key, "");

    if (!name) return undefined;

    if (Object.prototype.hasOwnProperty.call(entities(), name)) {
      return entities()[name];
    }

    if (Object.prototype.hasOwnProperty.call(root(), name)) {
      return root()[name];
    }

    return undefined;
  }

  function collectionListRaw(key = "") {
    const value = collectionRawValue(key);
    return Array.isArray(value) ? value : [];
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
      return text(app().route || root().route, "/");
    },

    currentCanonicalPath() {
      return text(app().canonicalPath || root().canonicalPath || selectors.currentRoute(), "/");
    },

    currentPublicPath() {
      return text(app().publicPath || root().publicPath || selectors.currentRoute(), "/");
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
       SESSION
    ===================================== */

    isAuthenticated() {
      return isAuthenticated(session(), root());
    },

    hasToken() {
      return hasToken(session(), root());
    },

    hasUser() {
      return usableUser(currentUserRaw());
    },

    currentUser() {
      return clone(currentUserRaw());
    },

    currentUserRaw() {
      return currentUserRaw();
    },

    currentUserIdentity() {
      const user = currentUserRaw();
      return user ? userId(user) || username(user) || null : null;
    },

    currentUserId() {
      const user = currentUserRaw();
      return user ? userId(user) : null;
    },

    currentUsername() {
      const user = currentUserRaw();
      return user ? username(user) || null : null;
    },

    currentDisplayName() {
      const user = currentUserRaw();
      return user ? displayName(user) : null;
    },

    currentAvatar() {
      const user = currentUserRaw();
      return user ? avatarUrl(user) || null : null;
    },

    currentRole() {
      return currentRoleRaw();
    },

    currentRoles() {
      const role = currentRoleRaw();
      return role ? [role] : [];
    },

    currentPermissions() {
      return [];
    },

    isAdmin() {
      return currentRoleRaw() === ROLE_ADMIN;
    },

    isUser() {
      return currentRoleRaw() === ROLE_USER;
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

    hasRole(...roles) {
      if (!selectors.isAuthenticated()) return false;

      const requested = roles
        .flat()
        .map(normalizeRole)
        .filter(Boolean);

      if (!requested.length) return true;

      return requested.includes(currentRoleRaw());
    },

    hasAnyRole(roles = []) {
      return selectors.hasRole(...roles);
    },

    hasAllRoles(roles = []) {
      if (!selectors.isAuthenticated()) return false;

      const requested = roles
        .flat()
        .map(normalizeRole)
        .filter(Boolean);

      if (!requested.length) return true;

      return requested.every((role) => role === currentRoleRaw());
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

    sessionSnapshot(options = {}) {
      const user = currentUserRaw();
      const role = currentRoleRaw();

      return {
        version: STORE_SELECTORS_VERSION,

        authenticated: selectors.isAuthenticated(),
        hasToken: selectors.hasToken(),

        token: options.includeToken === true ? null : null,
        accessToken: options.includeToken === true ? null : null,

        user: clone(user),
        userIdentity: selectors.currentUserIdentity(),
        userId: selectors.currentUserId(),
        username: selectors.currentUsername(),
        displayName: selectors.currentDisplayName(),
        avatar: selectors.currentAvatar(),

        role,
        roles: role ? [role] : [],
        permissions: [],

        isAdmin: role === ROLE_ADMIN,
        isUser: role === ROLE_USER,
        isSupport: false,
        isManager: false,
        isClient: false,

        raw: options.includeRaw === true ? clone(session()) : null,
        at: nowIso(),
      };
    },

    /* =====================================
       UI
    ===================================== */

    currentTheme() {
      const theme = ui().theme || root().theme || "system";
      return ["dark", "light", "system"].includes(theme) ? theme : "system";
    },

    themePreference() {
      return selectors.currentTheme();
    },

    currentLang() {
      const lang = ui().lang || ui().language || root().lang || "en";
      return ["ca", "es", "en"].includes(lang) ? lang : "en";
    },

    isSidebarOpen() {
      return ui().sidebarOpen !== false;
    },

    pageTitle() {
      return text(ui().pageTitle || root().pageTitle, "Onion Support");
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
      const name = text(key, "");
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
      const name = text(key, "");
      return name ? selectors.flag(`fetching${name[0]?.toUpperCase() || ""}${name.slice(1)}`, false) : false;
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
        session: selectors.sessionSnapshot({
          includeToken: options.includeToken === true,
          includeRaw: options.includeRawSession === true,
        }),
        ui: selectors.uiSnapshot({
          includeRaw: options.includeRawUi === true,
        }),
        flags: selectors.flags(),
        entities: options.includeEntities === false ? null : clone(entities()) || {},
        meta: selectors.meta(),
        at: nowIso(),
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
