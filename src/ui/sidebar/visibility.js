/* =========================================================
   Onion SPA - Sidebar Visibility
   Archivo: src/ui/sidebar/visibility.js

   ONION SUPPORT · SIDEBAR VISIBILITY · EXTREME 10/10
   ROLE SAFE · ADMIN RECOVERABLE · NORMAL ITEMS REPAIR

   RESPONSABILIDADES:
   - Aplicar visibilidad por rol dentro del sidebar.
   - Mostrar / ocultar elementos admin.
   - Soportar data-role="admin".
   - Soportar data-admin-only="true".
   - Soportar data-roles="admin,support".
   - Soportar data-sidebar-role / data-sidebar-roles.
   - Soportar data-requires-role / data-requires-roles.
   - Soportar data-required-role / data-required-roles.
   - Soportar data-permission / data-permissions.
   - Soportar data-sidebar-permission / data-sidebar-permissions.
   - Sincronizar aria-hidden / hidden / inert / tabindex.
   - Preservar/restaurar display original.
   - Preservar/restaurar tabindex original.
   - Preservar/restaurar tooltip custom/i18n.
   - Asegurar el item dinámico de servidor si existe callback legacy.
   - Sanear tooltips tras cambios de visibilidad.
   - Limpiar item activo si quedó oculto.
   - Evitar flash de items admin antes de aplicar permisos.
   - Emitir evento estable de visibilidad aplicada.

   REGLAS CRÍTICAS:
   - Un usuario admin debe ver items normales + items admin.
   - Un usuario no admin debe ver items normales y ocultar sólo admin.
   - data-admin-visible/data-role-visible/data-sidebar-visible son estado,
     nunca criterio para decidir si un item requiere admin.
   - visibility.js no toca open/collapsed del sidebar.
   - visibility.js no toca dropdown.
   - visibility.js no navega.
   - Sin CSS inline nuevo: sólo limpia/restaura display legacy si existía.
========================================================= */

import {
  getElements,
  sanitizeFooterTooltipState,
} from "./dom.js";

import {
  getUserRoles as getUserRolesFromUserModule,
  isAdmin as isAdminFromUserModule,
} from "./user.js";

import {
  SIDEBAR_EVENTS,
  SIDEBAR_ADMIN_ROLE_KEYS,
  SIDEBAR_ADMIN_PERMISSION_KEYS,
  SIDEBAR_ADMIN_FLAG_KEYS,
  SERVER_NAV_ID,
  SERVER_ROUTE,
} from "./constants.js";

/* =========================================================
   VERSION
========================================================= */

export const SIDEBAR_VISIBILITY_VERSION =
  "sidebar-visibility-v16-extreme-role-safe";

/* =========================================================
   CONSTANTS
========================================================= */

/*
  Selectores que representan REGLAS reales de acceso.

  Importante:
  NO incluir aquí:
    [data-admin-visible]
    [data-role-visible]
    [data-sidebar-visible]

  Esos son estado visual, no reglas de permisos.
*/
const ACCESS_RULE_SELECTOR =
  [
    "[data-role]",
    "[data-roles]",
    "[data-admin-only]",
    "[data-sidebar-admin-only]",
    "[data-requires-role]",
    "[data-requires-roles]",
    "[data-required-role]",
    "[data-required-roles]",
    "[data-sidebar-role]",
    "[data-sidebar-roles]",
    "[data-permission]",
    "[data-permissions]",
    "[data-sidebar-permission]",
    "[data-sidebar-permissions]",
    "[data-scope]",
    "[data-scopes]",
  ].join(",");

const MENU_REPAIR_SELECTOR =
  [
    ".menu-item",
    "[data-sidebar-nav='true']",
    "[data-sidebar-item='true']",
    "a[data-spa]",
    "a[data-route]",
    "a[data-href]",
    "a[data-to]",
  ].join(",");

const FOCUSABLE_SELECTOR =
  [
    "a[href]",
    "button",
    "input",
    "select",
    "textarea",
    "summary",
    "details",
    "audio[controls]",
    "video[controls]",
    "[tabindex]",
    "[role='button']",
    "[role='link']",
    "[contenteditable='true']",
  ].join(",");

const TOOLTIP_SELECTOR =
  [
    "[title]",
    "[data-tooltip]",
    "[data-i18n-data-tooltip]",
    "[aria-describedby]",
  ].join(",");

const DEFAULT_ADMIN_ROLE_KEYS =
  Object.freeze([
    "admin",
    "administrator",
    "administrador",
    "superadmin",
    "super_admin",
    "super-admin",
    "super_administrador",
    "super-administrador",
    "owner",
    "root",
    "staff",
    "support_admin",
    "soporte_admin",
  ]);

const DEFAULT_ADMIN_PERMISSION_KEYS =
  Object.freeze([
    "*",

    "admin:*",
    "admin.all",
    "admin.full",
    "admin.manage",
    "admin:manage",
    "admin.write",
    "admin:write",
    "admin.read",
    "admin:read",

    "users.manage",
    "users:manage",
    "users.write",
    "users:write",
    "users.admin",
    "users:admin",
    "users.access",
    "users:access",

    "usuarios.manage",
    "usuarios:manage",
    "usuarios.write",
    "usuarios:write",
    "usuarios.admin",
    "usuarios:admin",
    "usuarios.access",
    "usuarios:access",

    "manage_users",
    "can_manage_users",
    "access_users",
    "can_access_users",

    "clients.manage",
    "clients:manage",
    "clients.write",
    "clients:write",
    "clients.admin",
    "clients:admin",

    "clientes.manage",
    "clientes:manage",
    "clientes.write",
    "clientes:write",
    "clientes.admin",
    "clientes:admin",

    "server.manage",
    "server:manage",
    "server.admin",
    "server:admin",
    "server.access",
    "server:access",

    "servidor.manage",
    "servidor:manage",
    "servidor.admin",
    "servidor:admin",
    "servidor.access",
    "servidor:access",

    "settings.manage",
    "settings:manage",
    "settings.admin",
    "settings:admin",

    "ajustes.manage",
    "ajustes:manage",
    "ajustes.admin",
    "ajustes:admin",
  ]);

const DEFAULT_ADMIN_FLAG_KEYS =
  Object.freeze([
    "isAdmin",
    "admin",
    "is_admin",

    "isSuperAdmin",
    "superAdmin",
    "is_super_admin",

    "canManageUsers",
    "can_manage_users",

    "canAccessUsers",
    "can_access_users",

    "canManageClients",
    "can_manage_clients",

    "canAccessClients",
    "can_access_clients",

    "canAccessServer",
    "can_access_server",

    "canManageServer",
    "can_manage_server",

    "canManageSettings",
    "can_manage_settings",
  ]);

const ORIGINAL_NONE =
  "__none__";

const ORIGINAL_EMPTY =
  "__empty__";

const SOURCE =
  "SidebarVisibility";

const OWNER =
  "visibility.js";

const LOG_PREFIX =
  "[SidebarVisibility]";

const EVENT_ROLE_VISIBILITY_APPLIED =
  SIDEBAR_EVENTS?.roleVisibilityApplied ||
  "sidebar:role-visibility:applied";

const EVENT_VISIBILITY_APPLIED =
  SIDEBAR_EVENTS?.visibilityApplied ||
  "sidebar:visibility:applied";

const EVENT_ROLES_APPLIED_LEGACY =
  SIDEBAR_EVENTS?.rolesAppliedLegacy ||
  "sidebar:roles:applied";

const EVENT_ACTIVE_INVALIDATED =
  SIDEBAR_EVENTS?.activeInvalidated ||
  "sidebar:active:invalidated";

const EVENT_INDICATOR_REFRESH_REQUEST =
  SIDEBAR_EVENTS?.indicatorRefreshRequest ||
  "sidebar:indicator:refresh-request";

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return text || fallback;
}

function safeObject(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value
    : {};
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function isFn(value) {
  return typeof value === "function";
}

function first(...values) {
  for (const value of values) {
    if (
      value === undefined ||
      value === null
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

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const key =
      value
        .trim()
        .toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "ok",
        "on",
        "y",
      ].includes(key)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
        "n",
      ].includes(key)
    ) {
      return false;
    }
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }
  }

  return fallback;
}

function hasDatasetKey(element = null, key = "") {
  if (!element?.dataset || !key) {
    return false;
  }

  return Object.prototype.hasOwnProperty.call(
    element.dataset,
    key
  );
}

function nowTs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = nowTs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeWarn(AppCore, ...args) {
  let coreLogged =
    false;

  try {
    if (isFn(AppCore?.utils?.warn)) {
      AppCore.utils.warn(
        LOG_PREFIX,
        ...args
      );

      coreLogged =
        true;
    }
  } catch {
    coreLogged =
      false;
  }

  if (coreLogged) {
    return;
  }

  try {
    console.warn(
      LOG_PREFIX,
      ...args
    );
  } catch {}
}

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const data =
    safeObject(payload);

  const finalPayload =
    {
      ...data,

      source:
        safeText(data.source, SOURCE),

      owner:
        OWNER,

      version:
        SIDEBAR_VISIBILITY_VERSION,

      at:
        safeText(data.at, safeIsoDate()),

      ts:
        data.ts || nowTs(),
    };

  let busAvailable =
    false;

  let busEmitted =
    false;

  try {
    if (isFn(AppCore?.events?.emit)) {
      busAvailable =
        true;

      AppCore.events.emit(
        name,
        finalPayload
      );

      busEmitted =
        true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `AppCore.events.emit("${name}") falló.`,
      error
    );
  }

  /*
    Anti-storm:
    si hay bus interno, NO duplicamos en window.
  */
  if (
    !busAvailable &&
    isBrowser() &&
    typeof CustomEvent !== "undefined"
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent(
          name,
          {
            detail:
              finalPayload,
          }
        )
      );

      return true;
    } catch {}
  }

  return busEmitted;
}

/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeRole(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.*/-]/g, "")
    .trim();
}

function normalizePermission(value = "") {
  return normalizeRole(value);
}

function splitRoleList(value = "") {
  return safeText(value, "")
    .split(/[,\s|;]+/)
    .map(normalizeRole)
    .filter(Boolean);
}

function flattenRoleValue(value, depth = 0) {
  if (depth > 8) {
    return [];
  }

  if (
    value === null ||
    value === undefined
  ) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      flattenRoleValue(item, depth + 1)
    );
  }

  if (typeof value === "string") {
    return value
      .split(/[,\s|;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return [value];
  }

  if (typeof value === "object") {
    const entries =
      Object.entries(value);

    const truthyKeys =
      entries
        .filter(([, entryValue]) =>
          safeBoolean(entryValue, false)
        )
        .map(([key]) => key);

    return [
      value.role,
      value.rol,
      value.name,
      value.key,
      value.value,
      value.id,
      value.code,
      value.slug,
      value.type,
      value.scope,
      value.permission,
      value.authority,

      value.roles,
      value.roleList,
      value.role_list,
      value.permissions,
      value.scopes,
      value.groups,
      value.authorities,
      value.items,
      value.list,

      ...truthyKeys,
    ].flatMap((item) =>
      flattenRoleValue(item, depth + 1)
    );
  }

  return [];
}

function normalizeRoles(value) {
  return flattenRoleValue(value)
    .flat(Infinity)
    .map(normalizeRole)
    .filter(Boolean);
}

function toNormalizedSet(values = []) {
  return new Set(
    safeArray(values)
      .flat(Infinity)
      .map(normalizeRole)
      .filter(Boolean)
  );
}

/* =========================================================
   ADMIN REGISTRY
========================================================= */

const ADMIN_ROLE_KEYS =
  toNormalizedSet([
    ...DEFAULT_ADMIN_ROLE_KEYS,
    ...(
      Array.isArray(SIDEBAR_ADMIN_ROLE_KEYS)
        ? SIDEBAR_ADMIN_ROLE_KEYS
        : []
    ),
  ]);

const ADMIN_PERMISSION_KEYS =
  toNormalizedSet([
    ...DEFAULT_ADMIN_PERMISSION_KEYS,
    ...(
      Array.isArray(SIDEBAR_ADMIN_PERMISSION_KEYS)
        ? SIDEBAR_ADMIN_PERMISSION_KEYS
        : []
    ),
  ]);

const ADMIN_FLAG_KEYS =
  Array.from(
    new Set(
      [
        ...DEFAULT_ADMIN_FLAG_KEYS,
        ...(
          Array.isArray(SIDEBAR_ADMIN_FLAG_KEYS)
            ? SIDEBAR_ADMIN_FLAG_KEYS
            : []
        ),
      ].filter(Boolean)
    )
  );

/* =========================================================
   ADMIN / ROLE MATCHING
========================================================= */

function isAdminRole(value = "") {
  return ADMIN_ROLE_KEYS.has(
    normalizeRole(value)
  );
}

function isAdminPermission(value = "") {
  const key =
    normalizePermission(value);

  if (!key) {
    return false;
  }

  if (ADMIN_PERMISSION_KEYS.has(key)) {
    return true;
  }

  return (
    key === "*" ||
    key.startsWith("admin:") ||
    key.startsWith("admin.") ||
    key.includes(":admin") ||
    key.includes(".admin") ||
    key.endsWith(":manage") ||
    key.endsWith(".manage")
  );
}

function roleMatchesRequirement(userRole = "", requirement = "") {
  const role =
    normalizeRole(userRole);

  const required =
    normalizeRole(requirement);

  if (
    !role ||
    !required
  ) {
    return false;
  }

  if (
    role === required ||
    role === "*"
  ) {
    return true;
  }

  if (
    required.endsWith(":*") &&
    role.startsWith(required.slice(0, -1))
  ) {
    return true;
  }

  if (
    required.endsWith(".*") &&
    role.startsWith(required.slice(0, -1))
  ) {
    return true;
  }

  if (
    role.endsWith(":*") &&
    required.startsWith(role.slice(0, -1))
  ) {
    return true;
  }

  if (
    role.endsWith(".*") &&
    required.startsWith(role.slice(0, -1))
  ) {
    return true;
  }

  return false;
}

function expandRoleAliases(roles = []) {
  const normalized =
    normalizeRoles(roles);

  const result =
    new Set(normalized);

  if (
    normalized.some(isAdminRole) ||
    normalized.some(isAdminPermission)
  ) {
    for (const role of ADMIN_ROLE_KEYS) {
      result.add(role);
    }

    for (const permission of ADMIN_PERMISSION_KEYS) {
      result.add(permission);
    }

    result.add("admin");
  }

  return Array.from(result)
    .filter(Boolean);
}

/* =========================================================
   APP / AUTH USER SOURCES
========================================================= */

function getModuleCandidate(AppCore = null, ...names) {
  try {
    if (isFn(AppCore?.modules?.get)) {
      for (const name of names) {
        const mod =
          AppCore.modules.get(name);

        if (mod) {
          return mod;
        }
      }
    }
  } catch {}

  try {
    for (const name of names) {
      if (AppCore?.modules?.[name]) {
        return AppCore.modules[name];
      }
    }
  } catch {}

  try {
    if (AppCore?.registry?.modules?.get) {
      for (const name of names) {
        const mod =
          AppCore.registry.modules.get(name);

        if (mod) {
          return mod;
        }
      }
    }
  } catch {}

  return null;
}

function getAuthCandidate(AppCore = null) {
  return (
    getModuleCandidate(
      AppCore,
      "auth",
      "Auth",
      "session",
      "Session"
    ) ||
    AppCore?.auth ||
    AppCore?.Auth ||
    AppCore?.features?.auth ||
    null
  );
}

function unwrapUserPayload(payload = null) {
  const value =
    safeObject(payload);

  if (!Object.keys(value).length) {
    return {};
  }

  const candidate =
    first(
      value.user,
      value.usuario,
      value.currentUser,
      value.profile,
      value.account?.user,
      value.account,
      value.session?.user,
      value.data?.user,
      value.data?.usuario,
      value.data?.currentUser,
      value.data?.profile,
      value.payload?.user,
      value.payload?.usuario,
      value.payload?.currentUser,
      value.result?.user,
      value.result?.currentUser,
      value.me,
      value
    );

  return safeObject(candidate);
}

function getCurrentUser(AppCore = null) {
  const state =
    safeObject(AppCore?.state);

  const auth =
    getAuthCandidate(AppCore);

  let authUser =
    null;

  try {
    if (isFn(auth?.getUser)) {
      authUser =
        auth.getUser();
    }
  } catch {}

  try {
    if (
      !authUser &&
      isFn(auth?.getCurrentUser)
    ) {
      authUser =
        auth.getCurrentUser();
    }
  } catch {}

  try {
    if (
      !authUser &&
      isFn(auth?.currentUser)
    ) {
      authUser =
        auth.currentUser();
    }
  } catch {}

  return unwrapUserPayload(
    first(
      state.user,
      state.usuario,
      state.currentUser,
      state.sessionUser,
      state.authUser,
      state.profile,
      state.account,

      state.session?.user,
      state.session?.usuario,
      state.session?.currentUser,
      state.session?.profile,
      state.session?.account,

      state.auth?.user,
      state.auth?.usuario,
      state.auth?.currentUser,
      state.auth?.profile,
      state.auth?.account,

      authUser,
      auth?.user,
      auth?.currentUser,
      auth?.session?.user,
      {}
    )
  );
}

function getUserBranches(user = null) {
  const current =
    safeObject(user);

  return [
    current,

    safeObject(current.raw),
    safeObject(current.profile),
    safeObject(current.account),
    safeObject(current.customer),
    safeObject(current.client),
    safeObject(current.cliente),
    safeObject(current.meta),
    safeObject(current.claims),
    safeObject(current.permissions),

    safeObject(current.raw?.profile),
    safeObject(current.raw?.account),
    safeObject(current.raw?.meta),
    safeObject(current.raw?.claims),
    safeObject(current.raw?.permissions),

    safeObject(current.profile?.permissions),
    safeObject(current.account?.permissions),
    safeObject(current.meta?.permissions),
    safeObject(current.claims?.permissions),
  ].filter((branch) =>
    branch &&
    typeof branch === "object" &&
    Object.keys(branch).length > 0
  );
}

function getRoleCandidatesFromAppCore(AppCore = null) {
  const state =
    safeObject(AppCore?.state);

  const session =
    safeObject(state.session);

  const auth =
    getAuthCandidate(AppCore);

  const user =
    getCurrentUser(AppCore);

  const branches =
    getUserBranches(user);

  const scalarCandidates =
    [
      state.role,
      state.rol,
      state.userRole,
      state.user_role,
      state.type,
      state.userType,
      state.user_type,
      state.perfil,

      session.role,
      session.rol,
      session.userRole,
      session.user_role,
      session.type,
      session.userType,
      session.user_type,
      session.perfil,

      auth?.role,
      auth?.rol,
      auth?.userRole,

      ...branches.flatMap((branch) => [
        branch.role,
        branch.rol,
        branch.userRole,
        branch.user_role,
        branch.type,
        branch.userType,
        branch.user_type,
        branch.perfil,
        branch.scope,
        branch.permission,
        branch.authority,
        branch["custom:role"],
        branch["custom:roles"],
        branch["custom:permissions"],
        branch["https://onion/role"],
        branch["https://onion/roles"],
        branch["https://onion/permissions"],
      ]),
    ];

  const collectionCandidates =
    [
      state.roles,
      state.roleList,
      state.role_list,
      state.permissions,
      state.permisos,
      state.scopes,
      state.groups,
      state.authorities,

      session.roles,
      session.roleList,
      session.role_list,
      session.permissions,
      session.permisos,
      session.scopes,
      session.groups,
      session.authorities,

      auth?.roles,
      auth?.permissions,
      auth?.permisos,
      auth?.scopes,

      ...branches.flatMap((branch) => [
        branch.roles,
        branch.roleList,
        branch.role_list,
        branch.permissions,
        branch.permisos,
        branch.scopes,
        branch.groups,
        branch.authorities,
        branch.items,
        branch.list,
      ]),
    ];

  try {
    if (isFn(auth?.getRole)) {
      scalarCandidates.push(
        auth.getRole()
      );
    }
  } catch {}

  try {
    if (isFn(auth?.getCurrentRole)) {
      scalarCandidates.push(
        auth.getCurrentRole()
      );
    }
  } catch {}

  try {
    if (isFn(auth?.getRoles)) {
      collectionCandidates.push(
        auth.getRoles()
      );
    }
  } catch {}

  try {
    if (isFn(auth?.getPermissions)) {
      collectionCandidates.push(
        auth.getPermissions()
      );
    }
  } catch {}

  try {
    if (isFn(auth?.getScopes)) {
      collectionCandidates.push(
        auth.getScopes()
      );
    }
  } catch {}

  return [
    ...scalarCandidates,
    ...collectionCandidates,
  ];
}

function hasAdminFlag(AppCore = null) {
  const state =
    safeObject(AppCore?.state);

  const session =
    safeObject(state.session);

  const auth =
    getAuthCandidate(AppCore);

  const user =
    getCurrentUser(AppCore);

  const branches =
    getUserBranches(user);

  const values =
    [
      ...ADMIN_FLAG_KEYS.flatMap((key) => [
        state?.[key],
        session?.[key],
        state.auth?.[key],
        user?.[key],
        auth?.[key],
        auth?.state?.[key],
      ]),

      ...branches.flatMap((branch) =>
        ADMIN_FLAG_KEYS.map((key) =>
          branch?.[key]
        )
      ),
    ];

  try {
    if (isFn(auth?.isAdmin)) {
      values.push(
        auth.isAdmin()
      );
    }
  } catch {}

  try {
    if (isFn(auth?.isCurrentUserAdmin)) {
      values.push(
        auth.isCurrentUserAdmin()
      );
    }
  } catch {}

  return values.some((value) =>
    safeBoolean(value, false)
  );
}

function getUserRolesFallback(AppCore = null) {
  const roles =
    getRoleCandidatesFromAppCore(AppCore);

  if (hasAdminFlag(AppCore)) {
    roles.push("admin");
  }

  return expandRoleAliases(roles);
}

function getResolvedUserRoles(AppCore = null) {
  try {
    if (isFn(getUserRolesFromUserModule)) {
      const roles =
        getUserRolesFromUserModule(AppCore);

      if (roles?.length) {
        return expandRoleAliases(roles);
      }
    }
  } catch {}

  return getUserRolesFallback(AppCore);
}

function resolveAdminFlag(AppCore, isAdminFn, userRoles = []) {
  let fromCallback =
    false;

  if (isFn(isAdminFn)) {
    try {
      fromCallback =
        Boolean(isAdminFn(AppCore));
    } catch {
      try {
        fromCallback =
          Boolean(isAdminFn());
      } catch {
        fromCallback =
          false;
      }
    }
  }

  if (fromCallback) {
    return true;
  }

  try {
    if (
      isFn(isAdminFromUserModule) &&
      isAdminFromUserModule(AppCore)
    ) {
      return true;
    }
  } catch {}

  const auth =
    getAuthCandidate(AppCore);

  try {
    if (
      isFn(auth?.isCurrentUserAdmin) &&
      auth.isCurrentUserAdmin()
    ) {
      return true;
    }
  } catch {}

  try {
    if (
      isFn(auth?.isAdmin) &&
      auth.isAdmin()
    ) {
      return true;
    }
  } catch {}

  try {
    if (
      isFn(auth?.hasRole) &&
      auth.hasRole("admin")
    ) {
      return true;
    }
  } catch {}

  if (hasAdminFlag(AppCore)) {
    return true;
  }

  return safeArray(userRoles).some((role) =>
    isAdminRole(role) ||
    isAdminPermission(role)
  );
}

/* =========================================================
   ELEMENT ACCESS RULE RESOLUTION
========================================================= */

function getAttrValues(element = null, attrs = []) {
  if (!element) {
    return [];
  }

  return attrs.flatMap((attrName) => {
    const value =
      element.getAttribute(attrName);

    return splitRoleList(value);
  });
}

function hasAnyAccessRuleAttr(element = null) {
  if (!element) {
    return false;
  }

  return Boolean(
    element.hasAttribute?.("data-role") ||
      element.hasAttribute?.("data-roles") ||
      element.hasAttribute?.("data-admin-only") ||
      element.hasAttribute?.("data-sidebar-admin-only") ||
      element.hasAttribute?.("data-requires-role") ||
      element.hasAttribute?.("data-requires-roles") ||
      element.hasAttribute?.("data-required-role") ||
      element.hasAttribute?.("data-required-roles") ||
      element.hasAttribute?.("data-sidebar-role") ||
      element.hasAttribute?.("data-sidebar-roles") ||
      element.hasAttribute?.("data-permission") ||
      element.hasAttribute?.("data-permissions") ||
      element.hasAttribute?.("data-sidebar-permission") ||
      element.hasAttribute?.("data-sidebar-permissions") ||
      element.hasAttribute?.("data-scope") ||
      element.hasAttribute?.("data-scopes")
  );
}

function isElementAdminOnly(element = null) {
  if (!element) {
    return false;
  }

  const direct =
    element.getAttribute("data-admin-only");

  const sidebar =
    element.getAttribute("data-sidebar-admin-only");

  const value =
    first(
      direct,
      sidebar
    );

  if (
    value === null ||
    value === undefined
  ) {
    return false;
  }

  return (
    value === "" ||
    safeBoolean(value, false)
  );
}

function getElementRequiredRolesRaw(element = null) {
  if (!element) {
    return [];
  }

  const roles =
    [
      ...getAttrValues(
        element,
        [
          "data-role",
          "data-roles",
          "data-sidebar-role",
          "data-sidebar-roles",
          "data-requires-role",
          "data-requires-roles",
          "data-required-role",
          "data-required-roles",
        ]
      ),

      ...getAttrValues(
        element,
        [
          "data-permission",
          "data-permissions",
          "data-sidebar-permission",
          "data-sidebar-permissions",
          "data-scope",
          "data-scopes",
        ]
      ),
    ];

  if (isElementAdminOnly(element)) {
    roles.push("admin");
  }

  return roles
    .map(normalizeRole)
    .filter(Boolean);
}

function getElementRequiredRoles(element = null) {
  return expandRoleAliases(
    getElementRequiredRolesRaw(element)
  );
}

function elementRequiresAdmin(element = null) {
  if (!element) {
    return false;
  }

  if (isElementAdminOnly(element)) {
    return true;
  }

  return getElementRequiredRolesRaw(element).some((role) =>
    isAdminRole(role) ||
    isAdminPermission(role)
  );
}

function isElementAccessControlled(element = null) {
  if (!element) {
    return false;
  }

  if (isElementAdminOnly(element)) {
    return true;
  }

  if (!hasAnyAccessRuleAttr(element)) {
    return false;
  }

  return getElementRequiredRolesRaw(element).length > 0;
}

function userHasRequirement(userRoles = [], requirement = "") {
  const roles =
    expandRoleAliases(userRoles);

  return roles.some((role) =>
    roleMatchesRequirement(role, requirement)
  );
}

function shouldShowElementForRoles(
  element = null,
  userRoles = [],
  admin = false
) {
  if (!isElementAccessControlled(element)) {
    return true;
  }

  const requiredRoles =
    getElementRequiredRolesRaw(element);

  if (!requiredRoles.length) {
    return true;
  }

  /*
    Admin real ve todos los elementos controlados.
  */
  if (admin) {
    return true;
  }

  /*
    data-admin-only="true" sí exige admin real o rol/permiso admin.
  */
  if (isElementAdminOnly(element)) {
    return safeArray(userRoles).some((role) =>
      isAdminRole(role) ||
      isAdminPermission(role)
    );
  }

  /*
    data-roles="admin,support":
    support puede verlo aunque no sea admin.
    Si sólo pide admin, queda oculto para no-admin.
  */
  return requiredRoles.some((requirement) =>
    userHasRequirement(userRoles, requirement)
  );
}

/* =========================================================
   ORIGINAL DOM STATE
========================================================= */

function isInitiallyTemplateHiddenRoleElement(element = null) {
  if (!element) {
    return false;
  }

  /*
    Sólo tratamos como bloqueo inicial anti-flash si el elemento
    tiene regla real de acceso. No por data-admin-visible suelto.
  */
  if (!isElementAccessControlled(element)) {
    return false;
  }

  return Boolean(
    element.dataset?.adminVisible === "false" ||
      element.dataset?.roleVisible === "false" ||
      element.dataset?.sidebarVisible === "false" ||
      element.getAttribute?.("aria-hidden") === "true" ||
      element.hasAttribute?.("hidden") ||
      element.hasAttribute?.("inert")
  );
}

function rememberOriginalDisplay(element = null) {
  if (!element) {
    return;
  }

  if (hasDatasetKey(element, "sidebarOriginalDisplaySet")) {
    return;
  }

  const currentDisplay =
    element.style.display || "";

  const legacyHiddenDisplay =
    currentDisplay === "none" &&
    isInitiallyTemplateHiddenRoleElement(element);

  element.dataset.sidebarOriginalDisplay =
    legacyHiddenDisplay || !currentDisplay
      ? ORIGINAL_EMPTY
      : currentDisplay;

  element.dataset.sidebarOriginalDisplaySet =
    "true";
}

function rememberOriginalTabIndex(element = null) {
  if (!element) {
    return;
  }

  if (hasDatasetKey(element, "sidebarOriginalTabindexSet")) {
    return;
  }

  const tabIndex =
    element.getAttribute("tabindex");

  const shouldTreatMinusOneAsNoOriginal =
    tabIndex === "-1" &&
    isInitiallyTemplateHiddenRoleElement(element);

  element.dataset.sidebarOriginalTabindex =
    tabIndex === null ||
    shouldTreatMinusOneAsNoOriginal
      ? ORIGINAL_NONE
      : tabIndex;

  element.dataset.sidebarOriginalTabindexSet =
    "true";
}

function rememberOriginalTooltipAttrs(
  element = null,
  {
    force = false,
  } = {}
) {
  if (!element) {
    return;
  }

  if (
    !force &&
    hasDatasetKey(element, "sidebarOriginalTooltipSet")
  ) {
    return;
  }

  const title =
    element.getAttribute("title");

  const tooltip =
    element.getAttribute("data-tooltip");

  const i18nTooltip =
    element.getAttribute("data-i18n-data-tooltip");

  element.dataset.sidebarOriginalTitle =
    title === null
      ? ORIGINAL_NONE
      : title;

  element.dataset.sidebarOriginalTooltip =
    tooltip === null
      ? ORIGINAL_NONE
      : tooltip;

  element.dataset.sidebarOriginalI18nTooltip =
    i18nTooltip === null
      ? ORIGINAL_NONE
      : i18nTooltip;

  element.dataset.sidebarOriginalTooltipSet =
    "true";
}

function rememberOriginalState(element = null) {
  if (!element) {
    return;
  }

  rememberOriginalDisplay(element);
  rememberOriginalTabIndex(element);
  rememberOriginalTooltipAttrs(element);
}

function restoreDisplay(element = null) {
  if (!element) {
    return;
  }

  const value =
    element.dataset.sidebarOriginalDisplay;

  if (
    !value ||
    value === ORIGINAL_EMPTY
  ) {
    /*
      Limpia restos inline legacy. No inyecta CSS nuevo.
    */
    element.style.display =
      "";

    return;
  }

  element.style.display =
    value;
}

function restoreTabIndex(element = null) {
  if (!element) {
    return;
  }

  const value =
    element.dataset.sidebarOriginalTabindex;

  if (
    !value ||
    value === ORIGINAL_NONE
  ) {
    element.removeAttribute("tabindex");
    return;
  }

  element.setAttribute(
    "tabindex",
    value
  );
}

function restoreAttributeFromDataset(
  element = null,
  datasetKey = "",
  attrName = ""
) {
  if (
    !element ||
    !datasetKey ||
    !attrName
  ) {
    return;
  }

  if (!hasDatasetKey(element, datasetKey)) {
    return;
  }

  const value =
    element.dataset?.[datasetKey];

  if (
    !value ||
    value === ORIGINAL_NONE
  ) {
    element.removeAttribute(attrName);
    return;
  }

  element.setAttribute(
    attrName,
    value
  );
}

function restoreTooltipAttrs(element = null) {
  if (!element) {
    return;
  }

  restoreAttributeFromDataset(
    element,
    "sidebarOriginalTitle",
    "title"
  );

  restoreAttributeFromDataset(
    element,
    "sidebarOriginalTooltip",
    "data-tooltip"
  );

  restoreAttributeFromDataset(
    element,
    "sidebarOriginalI18nTooltip",
    "data-i18n-data-tooltip"
  );

  try {
    element.removeAttribute("aria-describedby");
  } catch {}
}

function removeTooltipAttrs(element = null) {
  if (!element) {
    return;
  }

  try {
    element.removeAttribute("title");
    element.removeAttribute("data-tooltip");
    element.removeAttribute("data-i18n-data-tooltip");
    element.removeAttribute("aria-describedby");
  } catch {}
}

function removeTooltipAttrsDeep(element = null) {
  if (!element) {
    return;
  }

  removeTooltipAttrs(element);

  try {
    element
      .querySelectorAll(TOOLTIP_SELECTOR)
      .forEach((node) => {
        removeTooltipAttrs(node);
      });
  } catch {}
}

/* =========================================================
   FOCUS / INERT
========================================================= */

function setInert(element = null, inert = false) {
  if (!element) {
    return;
  }

  try {
    element.inert =
      Boolean(inert);
  } catch {}

  try {
    if (inert) {
      element.setAttribute(
        "inert",
        ""
      );
    } else {
      element.removeAttribute(
        "inert"
      );
    }
  } catch {}
}

function rememberChildTabIndex(element = null) {
  if (!element) {
    return;
  }

  if (hasDatasetKey(element, "sidebarChildOriginalTabindexSet")) {
    return;
  }

  const tabIndex =
    element.getAttribute("tabindex");

  element.dataset.sidebarChildOriginalTabindex =
    tabIndex === null
      ? ORIGINAL_NONE
      : tabIndex;

  element.dataset.sidebarChildOriginalTabindexSet =
    "true";
}

function restoreChildTabIndex(element = null) {
  if (!element) {
    return;
  }

  const value =
    element.dataset.sidebarChildOriginalTabindex;

  if (
    !value ||
    value === ORIGINAL_NONE
  ) {
    element.removeAttribute("tabindex");
    return;
  }

  element.setAttribute(
    "tabindex",
    value
  );
}

function getFocusableChildren(element = null) {
  if (!element) {
    return [];
  }

  try {
    return Array.from(
      element.querySelectorAll(FOCUSABLE_SELECTOR)
    ).filter((child) =>
      child !== element
    );
  } catch {
    return [];
  }
}

function disableDescendantFocus(element = null) {
  if (!element) {
    return;
  }

  getFocusableChildren(element).forEach((child) => {
    rememberChildTabIndex(child);

    try {
      child.setAttribute(
        "tabindex",
        "-1"
      );

      child.setAttribute(
        "aria-hidden",
        "true"
      );
    } catch {}
  });
}

function restoreDescendantFocus(element = null) {
  if (!element) {
    return;
  }

  getFocusableChildren(element).forEach((child) => {
    try {
      restoreChildTabIndex(child);

      if (
        child.dataset?.sidebarVisible !== "false" &&
        child.dataset?.roleVisible !== "false" &&
        child.dataset?.adminVisible !== "false"
      ) {
        child.removeAttribute("aria-hidden");
      }
    } catch {}
  });
}

function blurIfFocusInside(element = null) {
  if (
    !isBrowser() ||
    !element
  ) {
    return false;
  }

  try {
    const active =
      document.activeElement;

    if (
      active &&
      active !== document.body &&
      element.contains(active) &&
      isFn(active.blur)
    ) {
      active.blur();
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   DOM STATE
========================================================= */

function setVisibilityDatasets(element = null, visible = true) {
  if (!element) {
    return;
  }

  const accessControlled =
    isElementAccessControlled(element);

  const adminManaged =
    elementRequiresAdmin(element);

  try {
    element.dataset.sidebarVisible =
      visible ? "true" : "false";

    element.dataset.roleVisible =
      visible ? "true" : "false";

    /*
      CRÍTICO:
      data-admin-visible sólo se escribe para elementos realmente admin.
      No se usa como regla.
    */
    if (adminManaged) {
      element.dataset.adminVisible =
        visible ? "true" : "false";
    } else if (
      !accessControlled &&
      hasDatasetKey(element, "adminVisible")
    ) {
      /*
        Reparación legacy:
        si un item normal heredó data-admin-visible=false, se sanea.
      */
      element.dataset.adminVisible =
        "true";
    }
  } catch {}
}

function setElementVisible(element = null, visible = true) {
  if (!element) {
    return false;
  }

  rememberOriginalState(element);

  if (visible) {
    try {
      element.hidden =
        false;

      element.removeAttribute("hidden");
      element.removeAttribute("aria-hidden");

      setInert(
        element,
        false
      );

      restoreDisplay(element);
      restoreTabIndex(element);
      restoreTooltipAttrs(element);
      restoreDescendantFocus(element);

      setVisibilityDatasets(
        element,
        true
      );

      element.classList.remove(
        "is-hidden",
        "is-role-hidden",
        "is-admin-hidden"
      );
    } catch {}

    return true;
  }

  rememberOriginalTooltipAttrs(
    element,
    {
      force:
        true,
    }
  );

  blurIfFocusInside(element);

  try {
    element.hidden =
      true;

    element.setAttribute(
      "hidden",
      ""
    );

    element.setAttribute(
      "aria-hidden",
      "true"
    );

    setInert(
      element,
      true
    );

    /*
      Sin CSS inline nuevo.
      hidden + aria-hidden + inert son suficientes.
      Si hay display legacy, se conserva en dataset para restaurarlo.
    */
    element.setAttribute(
      "tabindex",
      "-1"
    );

    element.classList.remove(
      "active",
      "is-active",
      "router-active"
    );

    element.classList.add(
      "is-role-hidden"
    );

    if (elementRequiresAdmin(element)) {
      element.classList.add(
        "is-admin-hidden"
      );
    }

    element.removeAttribute(
      "aria-current"
    );

    try {
      delete element.dataset.active;
      element.dataset.current =
        "false";
      element.dataset.selected =
        "false";
    } catch {}

    disableDescendantFocus(element);
    removeTooltipAttrsDeep(element);

    setVisibilityDatasets(
      element,
      false
    );
  } catch {}

  return true;
}

function isRoleElementVisible(element = null) {
  if (!element) {
    return false;
  }

  const adminManaged =
    elementRequiresAdmin(element);

  const hardHidden =
    element.hidden === true ||
    element.getAttribute?.("aria-hidden") === "true" ||
    element.hasAttribute?.("hidden") ||
    element.hasAttribute?.("inert") ||
    element.dataset?.sidebarVisible === "false" ||
    element.dataset?.roleVisible === "false";

  if (hardHidden) {
    return false;
  }

  /*
    CRÍTICO:
    data-admin-visible sólo invalida si el elemento realmente requiere admin.
    En items normales no cuenta.
  */
  if (
    adminManaged &&
    element.dataset?.adminVisible === "false"
  ) {
    return false;
  }

  return true;
}

function clearHiddenActiveState(sidebar = null) {
  if (!sidebar) {
    return 0;
  }

  let cleared =
    0;

  try {
    sidebar
      .querySelectorAll(
        [
          "[hidden].active",
          "[hidden].is-active",
          "[hidden].router-active",
          "[hidden][aria-current]",

          "[aria-hidden='true'].active",
          "[aria-hidden='true'].is-active",
          "[aria-hidden='true'].router-active",
          "[aria-hidden='true'][aria-current]",

          "[data-sidebar-visible='false'].active",
          "[data-sidebar-visible='false'].is-active",
          "[data-sidebar-visible='false'].router-active",
          "[data-sidebar-visible='false'][aria-current]",

          "[data-role-visible='false'].active",
          "[data-role-visible='false'].is-active",
          "[data-role-visible='false'].router-active",
          "[data-role-visible='false'][aria-current]",

          "[data-admin-visible='false'].active",
          "[data-admin-visible='false'].is-active",
          "[data-admin-visible='false'].router-active",
          "[data-admin-visible='false'][aria-current]",
        ].join(",")
      )
      .forEach((element) => {
        if (
          element.dataset?.adminVisible === "false" &&
          !elementRequiresAdmin(element)
        ) {
          return;
        }

        element.classList.remove(
          "active",
          "is-active",
          "router-active"
        );

        element.removeAttribute(
          "aria-current"
        );

        try {
          delete element.dataset.active;
          element.dataset.current =
            "false";
          element.dataset.selected =
            "false";
        } catch {}

        cleared += 1;
      });
  } catch {}

  return cleared;
}

function getRoleManagedElements(sidebar = null) {
  if (!sidebar) {
    return [];
  }

  try {
    return Array.from(
      sidebar.querySelectorAll(ACCESS_RULE_SELECTOR)
    ).filter(isElementAccessControlled);
  } catch {
    return [];
  }
}

function getMenuRepairElements(sidebar = null) {
  if (!sidebar) {
    return [];
  }

  try {
    return Array.from(
      sidebar.querySelectorAll(MENU_REPAIR_SELECTOR)
    );
  } catch {
    return [];
  }
}

function repairNormalSidebarItems(sidebar = null) {
  if (!sidebar) {
    return {
      repairedCount:
        0,

      repairedItems:
        [],
    };
  }

  let repairedCount =
    0;

  const repairedItems =
    [];

  const elements =
    getMenuRepairElements(sidebar);

  elements.forEach((element) => {
    if (isElementAccessControlled(element)) {
      return;
    }

    const wasBroken =
      element.hidden === true ||
      element.hasAttribute?.("hidden") ||
      element.hasAttribute?.("inert") ||
      element.getAttribute?.("aria-hidden") === "true" ||
      element.dataset?.sidebarVisible === "false" ||
      element.dataset?.roleVisible === "false" ||
      element.dataset?.adminVisible === "false" ||
      element.classList?.contains?.("is-role-hidden") ||
      element.classList?.contains?.("is-admin-hidden") ||
      element.style?.display === "none";

    /*
      Los items normales del menú deben estar visibles siempre.
      Esto repara el caso crítico: admin ve sólo Usuarios/Clientes/Servidor.
    */
    setElementVisible(
      element,
      true
    );

    try {
      element.dataset.sidebarVisible =
        "true";

      element.dataset.roleVisible =
        "true";

      if (hasDatasetKey(element, "adminVisible")) {
        element.dataset.adminVisible =
          "true";
      }

      element.classList.remove(
        "is-hidden",
        "is-role-hidden",
        "is-admin-hidden"
      );

      /*
        Limpieza de inline display heredado; no añade estilo nuevo.
      */
      if (element.style?.display === "none") {
        element.style.display =
          "";
      }
    } catch {}

    if (wasBroken) {
      repairedCount += 1;

      repairedItems.push(
        {
          id:
            element.id || "",

          route:
            element.getAttribute?.("data-route") ||
            element.getAttribute?.("href") ||
            "",

          text:
            safeText(element.textContent, ""),
        }
      );
    }
  });

  return {
    repairedCount,
    repairedItems,
  };
}

/* =========================================================
   LEGACY SERVER ITEM
========================================================= */

function runLegacyServerNavEnsure({
  AppCore,
  ensureServerNavItem,
  admin,
  userRoles,
} = {}) {
  if (!isFn(ensureServerNavItem)) {
    return false;
  }

  try {
    ensureServerNavItem(
      AppCore,
      () => Boolean(admin),
      userRoles
    );

    return true;
  } catch {}

  try {
    ensureServerNavItem(
      AppCore,
      Boolean(admin),
      userRoles
    );

    return true;
  } catch {}

  try {
    ensureServerNavItem({
      AppCore,
      admin,
      roles:
        userRoles,
    });

    return true;
  } catch {}

  return false;
}

function normalizeServerItemIfPresent(sidebar = null) {
  if (!sidebar) {
    return false;
  }

  try {
    const serverId =
      safeText(SERVER_NAV_ID, "");

    const serverRoute =
      safeText(SERVER_ROUTE, "/servidor");

    const item =
      (
        serverId
          ? sidebar.querySelector(`#${serverId}`)
          : null
      ) ||
      sidebar.querySelector(`[data-route="${serverRoute}"]`) ||
      sidebar.querySelector(`[data-href="${serverRoute}"]`) ||
      sidebar.querySelector(`[data-to="${serverRoute}"]`) ||
      sidebar.querySelector(`[href="${serverRoute}"]`);

    if (!item) {
      return false;
    }

    if (!item.dataset.adminOnly) {
      item.dataset.adminOnly =
        "true";
    }

    if (!item.dataset.role) {
      item.dataset.role =
        "admin";
    }

    if (!item.dataset.requiresRole) {
      item.dataset.requiresRole =
        "admin";
    }

    if (!item.dataset.requiredRole) {
      item.dataset.requiredRole =
        "admin";
    }

    if (!item.dataset.sidebarAdminOnly) {
      item.dataset.sidebarAdminOnly =
        "true";
    }

    if (!item.dataset.adminVisible) {
      item.dataset.adminVisible =
        "false";
    }

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getElementSnapshot(element = null) {
  if (!element) {
    return null;
  }

  return {
    tag:
      element.tagName || "",

    id:
      element.id || "",

    text:
      safeText(element.textContent, ""),

    route:
      element.getAttribute?.("data-route") ||
      element.getAttribute?.("data-href") ||
      element.getAttribute?.("data-to") ||
      element.getAttribute?.("href") ||
      "",

    accessControlled:
      isElementAccessControlled(element),

    requiredRoles:
      getElementRequiredRoles(element),

    requiredRolesRaw:
      getElementRequiredRolesRaw(element),

    adminOnly:
      isElementAdminOnly(element),

    adminManaged:
      elementRequiresAdmin(element),

    hidden:
      Boolean(element.hidden),

    ariaHidden:
      element.getAttribute?.("aria-hidden") || "",

    inert:
      Boolean(element.hasAttribute?.("inert")),

    tabindex:
      element.getAttribute?.("tabindex"),

    sidebarVisible:
      element.dataset?.sidebarVisible || "",

    roleVisible:
      element.dataset?.roleVisible || "",

    adminVisible:
      element.dataset?.adminVisible || "",

    className:
      element.className || "",
  };
}

export function getRoleVisibilitySnapshot(AppCore, isAdminFn) {
  const {
    sidebar,
  } =
    getElements(AppCore);

  const userRoles =
    getResolvedUserRoles(AppCore);

  const admin =
    resolveAdminFlag(
      AppCore,
      isAdminFn,
      userRoles
    );

  const roleElements =
    getRoleManagedElements(sidebar);

  const menuElements =
    getMenuRepairElements(sidebar);

  const normalMenuElements =
    menuElements.filter((element) =>
      !isElementAccessControlled(element)
    );

  const visibleElements =
    roleElements.filter(isRoleElementVisible);

  const hiddenElements =
    roleElements.filter((element) =>
      !isRoleElementVisible(element)
    );

  return {
    version:
      SIDEBAR_VISIBILITY_VERSION,

    ok:
      Boolean(sidebar),

    isAdmin:
      admin,

    roles:
      userRoles,

    counts: {
      roleManagedTotal:
        roleElements.length,

      roleManagedVisible:
        visibleElements.length,

      roleManagedHidden:
        hiddenElements.length,

      menuTotal:
        menuElements.length,

      normalMenuTotal:
        normalMenuElements.length,
    },

    roleItems:
      roleElements.map(getElementSnapshot),

    normalMenuItems:
      normalMenuElements.map(getElementSnapshot),

    menuItems:
      menuElements.map(getElementSnapshot),
  };
}

/* =========================================================
   MAIN
========================================================= */

export function applyRoleVisibility(
  AppCore,
  ensureServerNavItem,
  isAdminFn
) {
  const userRoles =
    getResolvedUserRoles(AppCore);

  const admin =
    resolveAdminFlag(
      AppCore,
      isAdminFn,
      userRoles
    );

  const legacyEnsured =
    runLegacyServerNavEnsure(
      {
        AppCore,
        ensureServerNavItem,
        admin,
        userRoles,
      }
    );

  const {
    sidebar,
  } =
    getElements(AppCore);

  if (!sidebar) {
    const payload =
      {
        ok:
          false,

        reason:
          "sidebar-not-found",

        isAdmin:
          admin,

        roles:
          userRoles,

        hiddenCount:
          0,

        visibleCount:
          0,

        totalCount:
          0,

        normalRepairedCount:
          0,

        legacyEnsured,

        serverNormalized:
          false,
      };

    safeEmit(
      AppCore,
      EVENT_ROLE_VISIBILITY_APPLIED,
      payload
    );

    safeEmit(
      AppCore,
      EVENT_ROLES_APPLIED_LEGACY,
      payload
    );

    return false;
  }

  const serverNormalized =
    normalizeServerItemIfPresent(sidebar);

  /*
    1. Primero se reparan items normales.
       Esto impide que un admin vea sólo Usuarios/Clientes/Servidor.
  */
  const normalRepair =
    repairNormalSidebarItems(sidebar);

  /*
    2. Luego se aplican reglas reales sobre elementos controlados por rol.
  */
  const roleElements =
    getRoleManagedElements(sidebar);

  let hiddenCount =
    0;

  let visibleCount =
    0;

  const hiddenItems =
    [];

  const visibleItems =
    [];

  roleElements.forEach((element) => {
    const requiredRoles =
      getElementRequiredRoles(element);

    const visible =
      shouldShowElementForRoles(
        element,
        userRoles,
        admin
      );

    setElementVisible(
      element,
      visible
    );

    const itemPayload =
      {
        id:
          element.id || "",

        route:
          element.getAttribute?.("data-route") ||
          element.getAttribute?.("data-href") ||
          element.getAttribute?.("data-to") ||
          element.getAttribute?.("href") ||
          "",

        text:
          safeText(element.textContent, ""),

        requiredRoles,

        requiredRolesRaw:
          getElementRequiredRolesRaw(element),

        adminOnly:
          isElementAdminOnly(element),

        adminManaged:
          elementRequiresAdmin(element),

        accessControlled:
          isElementAccessControlled(element),
      };

    if (visible) {
      visibleCount += 1;
      visibleItems.push(itemPayload);
    } else {
      hiddenCount += 1;
      hiddenItems.push(itemPayload);
    }
  });

  const clearedActiveCount =
    clearHiddenActiveState(sidebar);

  try {
    sanitizeFooterTooltipState(AppCore);
  } catch (error) {
    safeWarn(
      AppCore,
      "sanitizeFooterTooltipState falló tras applyRoleVisibility.",
      error
    );
  }

  const payload =
    {
      ok:
        true,

      isAdmin:
        admin,

      roles:
        userRoles,

      hiddenCount,
      visibleCount,

      totalCount:
        roleElements.length,

      normalRepairedCount:
        normalRepair.repairedCount,

      normalRepairedItems:
        normalRepair.repairedItems,

      hiddenItems,
      visibleItems,

      clearedActiveCount,
      legacyEnsured,
      serverNormalized,
    };

  safeEmit(
    AppCore,
    EVENT_ROLE_VISIBILITY_APPLIED,
    payload
  );

  safeEmit(
    AppCore,
    EVENT_VISIBILITY_APPLIED,
    payload
  );

  safeEmit(
    AppCore,
    EVENT_ROLES_APPLIED_LEGACY,
    payload
  );

  if (
    clearedActiveCount > 0 ||
    hiddenCount > 0 ||
    normalRepair.repairedCount > 0
  ) {
    safeEmit(
      AppCore,
      EVENT_ACTIVE_INVALIDATED,
      {
        reason:
          "role-visibility",

        clearedActiveCount,

        hiddenCount,

        normalRepairedCount:
          normalRepair.repairedCount,
      }
    );

    safeEmit(
      AppCore,
      EVENT_INDICATOR_REFRESH_REQUEST,
      {
        reason:
          "role-visibility",
      }
    );
  }

  return true;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SIDEBAR_VISIBILITY_VERSION,

  applyRoleVisibility,
  getRoleVisibilitySnapshot,
};
