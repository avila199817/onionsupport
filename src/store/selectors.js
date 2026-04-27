/* =========================================================
   Onion SPA - Store Selectors
   Archivo: src/store/selectors.js

   Responsabilidades:
   - exponer selectores semánticos del store
   - leer estado derivado app / session / ui
   - leer colecciones de forma segura
   - devolver datos desacoplados mediante clone
   - centralizar lecturas frecuentes
   - evitar estados auth fantasma
   - normalizar roles / permisos
   - soportar aliases admin/support/manager
   - tolerar slices parciales durante boot
   - blindaje enterprise sin throws accidentales
========================================================= */

import {
  deepClone,
  isFunction,
} from "./helpers.js";

import {
  ensureCollectionKey,
} from "./collections.js";

/* =========================================================
   ROLE CONSTANTS
========================================================= */

const ADMIN_ROLE_KEYS = new Set([
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
  "super_administrador",
  "owner",
  "root",
]);

const SUPPORT_ROLE_KEYS = new Set([
  "support",
  "soporte",
  "agent",
  "agente",
  "helpdesk",
  "operator",
  "operador",
]);

const MANAGER_ROLE_KEYS = new Set([
  "manager",
  "gestor",
  "gerente",
  "lead",
]);

/* =========================================================
   BASICS
========================================================= */

function safeText(
  value,
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return [];
  }

  return [value];
}

function clone(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  return deepClone(value);
}

function first(...values) {
  for (const value of values) {
    if (
      value === null ||
      value === undefined
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    if (
      Array.isArray(value) &&
      value.length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function hasOwn(
  obj,
  key
) {
  return Boolean(
    obj &&
      typeof obj === "object" &&
      Object.prototype.hasOwnProperty.call(
        obj,
        key
      )
  );
}

/* =========================================================
   STATE SLICES
========================================================= */

function getAppSlice(state) {
  return safeObject(
    state?.app
  );
}

function getSessionSlice(state) {
  return safeObject(
    state?.session
  );
}

function getUiSlice(state) {
  return safeObject(
    state?.ui
  );
}

function getEntitiesSlice(state) {
  return safeObject(
    state?.entities
  );
}

function getFlagsSlice(state) {
  return safeObject(
    state?.flags
  );
}

function getMetaSlice(state) {
  return safeObject(
    state?.meta
  );
}

/* =========================================================
   USER / TOKEN
========================================================= */

function hasUsableToken(token = "") {
  return Boolean(
    safeText(token, "")
  );
}

function hasUsableUser(user = null) {
  const current =
    safeObject(user);

  return Boolean(
    safeText(current.id, "") ||
      safeText(current.userId, "") ||
      safeText(current.user_id, "") ||
      safeText(current._id, "") ||
      safeText(current.uid, "") ||
      safeText(current.username, "") ||
      safeText(current.userName, "") ||
      safeText(current.user_name, "") ||
      safeText(current.email, "") ||
      safeText(current.mail, "") ||
      safeText(current.phone, "") ||
      safeText(current.telefono, "") ||
      safeText(current.mobile, "")
  );
}

function getTokenFromSession(session = {}) {
  return safeText(
    first(
      session.token,
      session.accessToken,
      session.access_token
    ),
    ""
  );
}

function getUserFromSession(session = {}) {
  const user =
    first(
      session.user,
      session.currentUser,
      session.authUser,
      session.profile
    );

  return safeObject(user);
}

function getUserIdentity(user = null) {
  const current =
    safeObject(user);

  return (
    safeText(current.userId, "") ||
    safeText(current.user_id, "") ||
    safeText(current.id, "") ||
    safeText(current._id, "") ||
    safeText(current.uid, "") ||
    safeText(current.email, "") ||
    safeText(current.mail, "") ||
    safeText(current.username, "") ||
    safeText(current.userName, "") ||
    safeText(current.phone, "") ||
    safeText(current.telefono, "") ||
    ""
  );
}

function getUserDisplayName(user = null) {
  const current =
    safeObject(user);

  return (
    safeText(current.displayName, "") ||
    safeText(current.display_name, "") ||
    safeText(current.name, "") ||
    safeText(current.nombre, "") ||
    safeText(current.fullName, "") ||
    safeText(current.full_name, "") ||
    safeText(current.username, "") ||
    safeText(current.userName, "") ||
    safeText(current.email, "") ||
    safeText(current.phone, "") ||
    "Usuario"
  );
}

function getUserAvatar(user = null) {
  const current =
    safeObject(user);

  return (
    safeText(current.avatarUrl, "") ||
    safeText(current.avatar_url, "") ||
    safeText(current.avatar, "") ||
    safeText(current.photoUrl, "") ||
    safeText(current.photo_url, "") ||
    safeText(current.picture, "") ||
    safeText(current.imageUrl, "") ||
    ""
  );
}

/* =========================================================
   ROLE NORMALIZATION
========================================================= */

function normalizeRole(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .trim();
}

function normalizeRoles(value) {
  return toArray(value)
    .flat(Infinity)
    .map(normalizeRole)
    .filter(Boolean);
}

function isAdminRole(value = "") {
  return ADMIN_ROLE_KEYS.has(
    normalizeRole(value)
  );
}

function isSupportRole(value = "") {
  return SUPPORT_ROLE_KEYS.has(
    normalizeRole(value)
  );
}

function isManagerRole(value = "") {
  return MANAGER_ROLE_KEYS.has(
    normalizeRole(value)
  );
}

function expandRoleAliases(roles = []) {
  const normalized =
    normalizeRoles(roles);

  const result =
    new Set(normalized);

  if (
    normalized.some(isAdminRole)
  ) {
    for (const role of ADMIN_ROLE_KEYS) {
      result.add(role);
    }

    result.add("admin");
  }

  if (
    normalized.some(isSupportRole)
  ) {
    for (const role of SUPPORT_ROLE_KEYS) {
      result.add(role);
    }

    result.add("support");
  }

  if (
    normalized.some(isManagerRole)
  ) {
    for (const role of MANAGER_ROLE_KEYS) {
      result.add(role);
    }

    result.add("manager");
  }

  return Array.from(result)
    .filter(Boolean);
}

function resolveCanonicalRole(roles = []) {
  const expanded =
    expandRoleAliases(roles);

  if (
    expanded.some(isAdminRole)
  ) {
    return "admin";
  }

  if (
    expanded.some(isSupportRole)
  ) {
    return "support";
  }

  if (
    expanded.some(isManagerRole)
  ) {
    return "manager";
  }

  return expanded[0] || null;
}

function collectRolesFromUser(user = null) {
  const current =
    safeObject(user);

  const raw =
    safeObject(current.raw);

  const profile =
    safeObject(current.profile);

  const meta =
    safeObject(current.meta);

  const claims =
    safeObject(current.claims);

  const account =
    safeObject(current.account);

  const roleCandidates = [
    current.role,
    current.rol,
    current.userRole,
    current.user_role,
    current.type,
    current.userType,
    current.user_type,
    current.perfil,

    profile.role,
    profile.rol,
    profile.userRole,
    profile.user_role,
    profile.type,
    profile.perfil,

    account.role,
    account.rol,
    account.userRole,
    account.type,

    meta.role,
    meta.rol,
    meta.userRole,

    claims.role,
    claims.rol,
    claims.userRole,
    claims["custom:role"],
    claims["https://onion/role"],

    raw.role,
    raw.rol,
    raw.userRole,
    raw.user_role,
    raw.type,
    raw.userType,
    raw.user_type,
    raw.perfil,

    raw?.profile?.role,
    raw?.profile?.rol,
    raw?.profile?.userRole,
    raw?.profile?.type,

    raw?.meta?.role,
    raw?.meta?.rol,

    raw?.claims?.role,
    raw?.claims?.rol,
    raw?.claims?.["custom:role"],
    raw?.claims?.["https://onion/role"],
  ];

  const roleArrays = [
    current.roles,
    current.roleList,
    current.role_list,
    current.permissions,
    current.scopes,
    current.groups,
    current.authorities,

    profile.roles,
    profile.permissions,
    profile.scopes,
    profile.groups,
    profile.authorities,

    account.roles,
    account.permissions,
    account.scopes,
    account.groups,

    meta.roles,
    meta.permissions,
    meta.scopes,
    meta.groups,

    claims.roles,
    claims.permissions,
    claims.scopes,
    claims.groups,

    raw.roles,
    raw.roleList,
    raw.role_list,
    raw.permissions,
    raw.scopes,
    raw.groups,
    raw.authorities,

    raw?.profile?.roles,
    raw?.profile?.permissions,
    raw?.profile?.scopes,

    raw?.meta?.roles,
    raw?.meta?.permissions,
    raw?.meta?.scopes,

    raw?.claims?.roles,
    raw?.claims?.permissions,
    raw?.claims?.scopes,
  ];

  const roles = [
    ...roleCandidates,
    ...roleArrays.flatMap((value) =>
      toArray(value)
    ),
  ];

  const adminFlag = [
    current.isAdmin,
    current.admin,
    current.isSuperAdmin,
    current.superAdmin,
    current.is_super_admin,
    current.canManageUsers,
    current.can_manage_users,
    current.canAccessUsers,
    current.can_access_users,

    profile.isAdmin,
    profile.admin,
    profile.isSuperAdmin,
    profile.superAdmin,
    profile.canManageUsers,
    profile.canAccessUsers,

    account.isAdmin,
    account.admin,
    account.isSuperAdmin,
    account.superAdmin,

    meta.isAdmin,
    meta.admin,
    meta.isSuperAdmin,
    meta.superAdmin,
    meta.canManageUsers,
    meta.canAccessUsers,

    claims.isAdmin,
    claims.admin,
    claims.isSuperAdmin,
    claims.superAdmin,
    claims.canManageUsers,
    claims.canAccessUsers,

    raw.isAdmin,
    raw.admin,
    raw.isSuperAdmin,
    raw.superAdmin,
    raw.canManageUsers,
    raw.canAccessUsers,

    raw?.profile?.isAdmin,
    raw?.profile?.admin,
    raw?.profile?.isSuperAdmin,
    raw?.profile?.superAdmin,

    raw?.meta?.isAdmin,
    raw?.meta?.admin,

    raw?.claims?.isAdmin,
    raw?.claims?.admin,
  ].some((value) => value === true);

  if (adminFlag) {
    roles.push("admin");
  }

  return expandRoleAliases(roles);
}

function collectSessionRoles(session = {}) {
  const user =
    getUserFromSession(session);

  return expandRoleAliases([
    session.role,
    session.rol,
    session.userRole,
    session.user_role,
    session.roles,
    session.permissions,
    session.scopes,
    ...collectRolesFromUser(user),
  ]);
}

function collectPermissionsFromUser(user = null) {
  const current =
    safeObject(user);

  const raw =
    safeObject(current.raw);

  const profile =
    safeObject(current.profile);

  const meta =
    safeObject(current.meta);

  const claims =
    safeObject(current.claims);

  return Array.from(
    new Set(
      [
        ...normalizeRoles(current.permissions),
        ...normalizeRoles(current.scopes),
        ...normalizeRoles(current.authorities),

        ...normalizeRoles(profile.permissions),
        ...normalizeRoles(profile.scopes),
        ...normalizeRoles(profile.authorities),

        ...normalizeRoles(meta.permissions),
        ...normalizeRoles(meta.scopes),

        ...normalizeRoles(claims.permissions),
        ...normalizeRoles(claims.scopes),

        ...normalizeRoles(raw.permissions),
        ...normalizeRoles(raw.scopes),
        ...normalizeRoles(raw.authorities),

        ...normalizeRoles(raw?.profile?.permissions),
        ...normalizeRoles(raw?.profile?.scopes),

        ...normalizeRoles(raw?.meta?.permissions),
        ...normalizeRoles(raw?.meta?.scopes),

        ...normalizeRoles(raw?.claims?.permissions),
        ...normalizeRoles(raw?.claims?.scopes),
      ].filter(Boolean)
    )
  );
}

/* =========================================================
   UI NORMALIZATION
========================================================= */

function normalizeTheme(value = "") {
  const theme =
    safeText(value, "")
      .toLowerCase();

  if (theme === "light") {
    return "light";
  }

  if (theme === "dark") {
    return "dark";
  }

  if (theme === "system") {
    return "system";
  }

  return "";
}

function getSystemThemeFallback() {
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
    ) {
      return window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches
        ? "dark"
        : "light";
    }
  } catch {}

  return "light";
}

/* =========================================================
   FACTORY
========================================================= */

export function createSelectors({
  AppCore,
  state,
}) {
  function app() {
    return getAppSlice(state);
  }

  function session() {
    return getSessionSlice(state);
  }

  function ui() {
    return getUiSlice(state);
  }

  function entities() {
    return getEntitiesSlice(state);
  }

  function flags() {
    return getFlagsSlice(state);
  }

  function meta() {
    return getMetaSlice(state);
  }

  function cloneUser() {
    const user =
      getUserFromSession(session());

    return hasUsableUser(user)
      ? clone(user)
      : null;
  }

  function currentTokenValue() {
    return getTokenFromSession(
      session()
    );
  }

  function authenticatedStrict() {
    const currentSession =
      session();

    const token =
      currentTokenValue();

    const user =
      getUserFromSession(
        currentSession
      );

    return Boolean(
      currentSession.authenticated === true &&
        hasUsableToken(token) &&
        hasUsableUser(user)
    );
  }

  function currentRolesValue() {
    if (!authenticatedStrict()) {
      return [];
    }

    return collectSessionRoles(
      session()
    );
  }

  function currentRoleValue() {
    if (!authenticatedStrict()) {
      return null;
    }

    return resolveCanonicalRole(
      currentRolesValue()
    );
  }

  function getCollection(key) {
    const finalKey =
      ensureCollectionKey(
        state,
        key
      );

    const value =
      entities()[finalKey];

    if (
      Array.isArray(value)
    ) {
      return value.map((item) =>
        clone(item)
      );
    }

    return clone(value);
  }

  function getCollectionRaw(key) {
    const finalKey =
      ensureCollectionKey(
        state,
        key
      );

    return entities()[finalKey];
  }

  return {
    /* =====================================
       APP
    ===================================== */

    isReady() {
      const current =
        app();

      return Boolean(
        current.ready &&
          current.booted
      );
    },

    isInitialized() {
      return Boolean(
        app().initialized
      );
    },

    isBooting() {
      return Boolean(
        app().booting
      );
    },

    isLoading() {
      return Boolean(
        app().loading
      );
    },

    lastError() {
      const error =
        app().lastError;

      return error
        ? clone(error)
        : null;
    },

    currentRoute() {
      return (
        safeText(
          app().route,
          "/"
        ) || "/"
      );
    },

    currentPublicPath() {
      return (
        safeText(
          app().publicPath,
          "/"
        ) || "/"
      );
    },

    routeSnapshot() {
      return {
        route:
          this.currentRoute(),
        publicPath:
          this.currentPublicPath(),
      };
    },

    /* =====================================
       SESSION
    ===================================== */

    isAuthenticated() {
      return authenticatedStrict();
    },

    currentUser() {
      return cloneUser();
    },

    currentUserIdentity() {
      return getUserIdentity(
        getUserFromSession(
          session()
        )
      ) || null;
    },

    currentUsername() {
      const user =
        getUserFromSession(
          session()
        );

      return (
        safeText(user.username, "") ||
        safeText(user.userName, "") ||
        safeText(user.user_name, "") ||
        safeText(user.email, "") ||
        null
      );
    },

    currentDisplayName() {
      const user =
        getUserFromSession(
          session()
        );

      return hasUsableUser(user)
        ? getUserDisplayName(user)
        : null;
    },

    currentAvatar() {
      const user =
        getUserFromSession(
          session()
        );

      return getUserAvatar(user) || null;
    },

    currentRole() {
      return currentRoleValue();
    },

    currentRoles() {
      return [
        ...currentRolesValue(),
      ];
    },

    currentPermissions() {
      if (!authenticatedStrict()) {
        return [];
      }

      const user =
        getUserFromSession(
          session()
        );

      return [
        ...collectPermissionsFromUser(user),
      ];
    },

    isAdmin() {
      return currentRolesValue()
        .some(isAdminRole);
    },

    isSupport() {
      return currentRolesValue()
        .some(isSupportRole);
    },

    isManager() {
      return currentRolesValue()
        .some(isManagerRole);
    },

    hasRole(...roles) {
      if (!authenticatedStrict()) {
        return false;
      }

      const allowed =
        expandRoleAliases(
          roles.flat()
        );

      if (!allowed.length) {
        return true;
      }

      const current =
        new Set(
          currentRolesValue()
        );

      return allowed.some((role) =>
        current.has(role)
      );
    },

    hasAnyRole(roles = []) {
      return this.hasRole(
        ...toArray(roles).flat()
      );
    },

    hasAllRoles(roles = []) {
      if (!authenticatedStrict()) {
        return false;
      }

      const required =
        expandRoleAliases(
          toArray(roles).flat()
        );

      if (!required.length) {
        return true;
      }

      const current =
        new Set(
          currentRolesValue()
        );

      return required.every((role) =>
        current.has(role)
      );
    },

    hasPermission(...permissions) {
      if (!authenticatedStrict()) {
        return false;
      }

      const required =
        normalizeRoles(
          permissions.flat()
        );

      if (!required.length) {
        return true;
      }

      const current =
        new Set(
          this.currentPermissions()
        );

      return required.some((permission) =>
        current.has(permission)
      );
    },

    token() {
      const token =
        currentTokenValue();

      return hasUsableToken(token)
        ? token
        : null;
    },

    authHeader() {
      const token =
        this.token();

      return token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {};
    },

    sessionSnapshot() {
      const currentSession =
        session();

      return {
        authenticated:
          authenticatedStrict(),

        token:
          this.token(),

        user:
          cloneUser(),

        role:
          currentRoleValue(),

        roles:
          currentRolesValue(),

        permissions:
          this.currentPermissions(),

        isAdmin:
          this.isAdmin(),

        isSupport:
          this.isSupport(),

        isManager:
          this.isManager(),

        userIdentity:
          this.currentUserIdentity(),

        username:
          this.currentUsername(),

        displayName:
          this.currentDisplayName(),

        avatar:
          this.currentAvatar(),

        raw:
          clone(currentSession),
      };
    },

    /* =====================================
       UI
    ===================================== */

    currentTheme() {
      const fromState =
        normalizeTheme(
          ui().theme
        );

      const fromCore =
        normalizeTheme(
          AppCore?.state?.theme
        );

      const fromConfig =
        normalizeTheme(
          AppCore?.config?.defaultTheme
        );

      return (
        fromState ||
        fromCore ||
        fromConfig ||
        getSystemThemeFallback()
      );
    },

    currentLang() {
      return (
        safeText(
          ui().lang,
          ""
        ) ||
        safeText(
          AppCore?.state?.lang,
          ""
        ) ||
        safeText(
          AppCore?.config?.defaultLang,
          ""
        ) ||
        "es"
      );
    },

    isSidebarOpen() {
      return Boolean(
        ui().sidebarOpen
      );
    },

    pageTitle() {
      return (
        safeText(
          ui().pageTitle,
          ""
        ) ||
        safeText(
          AppCore?.config?.appName,
          ""
        ) ||
        "Onion Support"
      );
    },

    topbarTitle() {
      return (
        safeText(
          ui().topbarTitle,
          ""
        ) ||
        safeText(
          ui().pageTitle,
          ""
        ) ||
        safeText(
          AppCore?.config?.appName,
          ""
        ) ||
        "Onion Support"
      );
    },

    uiSnapshot() {
      return {
        theme:
          this.currentTheme(),

        lang:
          this.currentLang(),

        sidebarOpen:
          this.isSidebarOpen(),

        pageTitle:
          this.pageTitle(),

        topbarTitle:
          this.topbarTitle(),

        raw:
          clone(ui()),
      };
    },

    /* =====================================
       FLAGS
    ===================================== */

    flag(
      key,
      fallback = false
    ) {
      const name =
        safeText(key, "");

      if (!name) {
        return fallback;
      }

      if (
        !hasOwn(flags(), name)
      ) {
        return fallback;
      }

      return Boolean(
        flags()[name]
      );
    },

    flags() {
      return clone(flags());
    },

    /* =====================================
       ENTITIES
    ===================================== */

    collection(key) {
      return getCollection(key);
    },

    collectionRaw(key) {
      const value =
        getCollectionRaw(key);

      return value;
    },

    count(key) {
      const value =
        getCollectionRaw(key);

      if (
        Array.isArray(value)
      ) {
        return value.length;
      }

      return value
        ? 1
        : 0;
    },

    isEmpty(key) {
      return this.count(key) === 0;
    },

    first(key) {
      const value =
        getCollectionRaw(key);

      if (
        Array.isArray(value)
      ) {
        return value.length
          ? clone(value[0])
          : null;
      }

      return value
        ? clone(value)
        : null;
    },

    last(key) {
      const value =
        getCollectionRaw(key);

      if (
        Array.isArray(value)
      ) {
        return value.length
          ? clone(value[value.length - 1])
          : null;
      }

      return value
        ? clone(value)
        : null;
    },

    find(
      key,
      predicate
    ) {
      const list =
        getCollectionRaw(key);

      if (
        !Array.isArray(list) ||
        !isFunction(predicate)
      ) {
        return null;
      }

      const item =
        list.find((entry, index) =>
          predicate(
            clone(entry),
            index,
            clone(list)
          )
        );

      return item
        ? clone(item)
        : null;
    },

    filter(
      key,
      predicate
    ) {
      const list =
        getCollectionRaw(key);

      if (
        !Array.isArray(list) ||
        !isFunction(predicate)
      ) {
        return [];
      }

      return list
        .filter((entry, index) =>
          predicate(
            clone(entry),
            index,
            clone(list)
          )
        )
        .map((entry) =>
          clone(entry)
        );
    },

    map(
      key,
      mapper
    ) {
      const list =
        getCollectionRaw(key);

      if (
        !Array.isArray(list) ||
        !isFunction(mapper)
      ) {
        return [];
      }

      return list.map((entry, index) =>
        clone(
          mapper(
            clone(entry),
            index,
            clone(list)
          )
        )
      );
    },

    byId(
      key,
      id
    ) {
      const targetId =
        safeText(id, "");

      if (!targetId) {
        return null;
      }

      return this.find(
        key,
        (item) =>
          safeText(item?.id, "") === targetId ||
          safeText(item?._id, "") === targetId ||
          safeText(item?.uuid, "") === targetId
      );
    },

    entitiesSnapshot() {
      return clone(
        entities()
      );
    },

    /* =====================================
       META
    ===================================== */

    meta() {
      return clone(meta());
    },

    hydrated() {
      return Boolean(
        meta().hydrated
      );
    },

    updatedAt() {
      return (
        meta().updatedAt ||
        null
      );
    },

    /* =====================================
       FULL SNAPSHOT
    ===================================== */

    snapshot() {
      return {
        app:
          clone(app()),

        session:
          this.sessionSnapshot(),

        ui:
          this.uiSnapshot(),

        flags:
          clone(flags()),

        entities:
          clone(entities()),

        meta:
          clone(meta()),
      };
    },
  };
}

export default {
  createSelectors,
};
