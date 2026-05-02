/* =========================================================
   Onion SPA - Sidebar Visibility
   Archivo: src/ui/sidebar/visibility.js

   FINAL EXTREME SYSTEM · SIDEBAR ROLE VISIBILITY · 10/10

   RESPONSABILIDADES:
   - aplicar visibilidad por rol dentro del sidebar
   - mostrar / ocultar elementos admin
   - soportar data-role="admin"
   - soportar data-admin-only="true"
   - soportar data-roles="admin,support"
   - soportar data-sidebar-role / data-sidebar-roles
   - soportar data-requires-role / data-requires-roles
   - soportar data-permission / data-permissions
   - sincronizar aria-hidden / hidden / inert / tabindex
   - preservar/restaurar display original
   - preservar/restaurar tabindex original
   - preservar/restaurar tooltip custom/i18n
   - asegurar el item dinámico de servidor si existe callback legacy
   - sanear tooltips tras cambios de visibilidad
   - limpiar item activo si quedó oculto
   - evitar flash de items admin antes de aplicar permisos
   - emitir evento estable de visibilidad aplicada

   HARDENING:
   - no depende solo de role === admin
   - soporta aliases admin/superadmin/owner/root/support/staff
   - soporta flags isAdmin/admin/canManageUsers/canAccessUsers
   - soporta permisos admin-like: users.manage / manage_users / admin:*
   - inspecciona state/session/user/profile/raw/meta/claims/account
   - no rompe si AppCore o sidebar no existen
   - no deja elementos ocultos focusables
   - no destruye permanentemente tooltips i18n
   - evita estado visual fantasma tras login/logout/restore
   - restaura correctamente items admin ocultos inicialmente por template
   - safeEmit usa AppCore.events si existe; window solo fallback
========================================================= */

import {
  getElements,
  sanitizeFooterTooltipState,
} from "./dom.js";

import {
  SIDEBAR_EVENTS,
  SIDEBAR_ADMIN_ROLE_KEYS,
  SIDEBAR_ADMIN_FLAG_KEYS,
  SERVER_NAV_ID,
  SERVER_ROUTE,
} from "./constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

const ROLE_SELECTOR = [
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

const FOCUSABLE_SELECTOR = [
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

const DEFAULT_ADMIN_ROLE_KEYS = [
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
  "super_administrador",
  "owner",
  "root",
  "staff",
  "support",
];

const ADMIN_ROLE_KEYS = new Set(
  [
    ...DEFAULT_ADMIN_ROLE_KEYS,
    ...(
      Array.isArray(SIDEBAR_ADMIN_ROLE_KEYS)
        ? SIDEBAR_ADMIN_ROLE_KEYS
        : []
    ),
  ].map(normalizeRole)
);

const ADMIN_FLAG_KEYS = [
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

  ...(Array.isArray(SIDEBAR_ADMIN_FLAG_KEYS) ? SIDEBAR_ADMIN_FLAG_KEYS : []),
];

const ADMIN_PERMISSION_KEYS = new Set([
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
]);

const ORIGINAL_NONE = "__none__";
const ORIGINAL_EMPTY = "__empty__";

const EVENT_ROLE_VISIBILITY_APPLIED =
  SIDEBAR_EVENTS?.roleVisibilityApplied ||
  "sidebar:role-visibility:applied";

const EVENT_VISIBILITY_APPLIED = "sidebar:visibility:applied";
const EVENT_ROLES_APPLIED_LEGACY = "sidebar:roles:applied";
const EVENT_ACTIVE_INVALIDATED = "sidebar:active:invalidated";
const EVENT_INDICATOR_REFRESH_REQUEST = "sidebar:indicator:refresh-request";

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
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function isFn(value) {
  return typeof value === "function";
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return [];
  }

  return [value];
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

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
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí", "ok", "on"].includes(key)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(key)) {
      return false;
    }
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
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

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[SidebarVisibility]", ...args);
  } catch {}

  try {
    console.warn("[SidebarVisibility]", ...args);
  } catch {}
}

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  /*
    Importante:
    No emitir por AppCore.events y window a la vez.
    events.js puede escuchar ambos canales en fallback.
  */
  try {
    if (isFn(AppCore?.events?.emit)) {
      AppCore.events.emit(name, payload);
      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `AppCore.events.emit("${name}") falló.`,
      error
    );
  }

  try {
    if (
      isBrowser() &&
      typeof CustomEvent !== "undefined"
    ) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );

      return true;
    }
  } catch {}

  return false;
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

function unique(values = []) {
  return Array.from(
    new Set(
      values
        .flat(Infinity)
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    )
  );
}

function flattenRoleValue(value, depth = 0) {
  if (depth > 8) {
    return [];
  }

  if (value === null || value === undefined) {
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
    const entries = Object.entries(value);

    const truthyKeys = entries
      .filter(([, entryValue]) => safeBoolean(entryValue, false))
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

/* =========================================================
   ROLE / PERMISSION RESOLUTION
========================================================= */

function isAdminRole(value = "") {
  return ADMIN_ROLE_KEYS.has(normalizeRole(value));
}

function isAdminPermission(value = "") {
  const key = normalizePermission(value);

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

function expandRoleAliases(roles = []) {
  const normalized = normalizeRoles(roles);
  const result = new Set(normalized);

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

  return Array.from(result).filter(Boolean);
}

function getModuleCandidate(AppCore = null, ...names) {
  try {
    if (isFn(AppCore?.modules?.get)) {
      for (const name of names) {
        const mod = AppCore.modules.get(name);
        if (mod) return mod;
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
    null
  );
}

function getCurrentUser(AppCore = null) {
  const state = safeObject(AppCore?.state);
  const auth = getAuthCandidate(AppCore);

  let authUser = null;

  try {
    if (isFn(auth?.getUser)) {
      authUser = auth.getUser();
    }
  } catch {}

  try {
    if (!authUser && isFn(auth?.getCurrentUser)) {
      authUser = auth.getCurrentUser();
    }
  } catch {}

  try {
    if (!authUser && isFn(auth?.currentUser)) {
      authUser = auth.currentUser();
    }
  } catch {}

  return safeObject(
    first(
      state.user,
      state.currentUser,
      state.sessionUser,
      state.authUser,
      state.profile,
      state.session?.user,
      authUser,
      auth?.user,
      {}
    )
  );
}

function getUserBranches(user = null) {
  const current = safeObject(user);

  return [
    current,

    safeObject(current.raw),
    safeObject(current.profile),
    safeObject(current.account),
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
  ];
}

function getRoleCandidatesFromAppCore(AppCore = null) {
  const state = safeObject(AppCore?.state);
  const session = safeObject(state.session);
  const auth = getAuthCandidate(AppCore);
  const user = getCurrentUser(AppCore);
  const branches = getUserBranches(user);

  const scalarCandidates = [
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

  const collectionCandidates = [
    state.roles,
    state.roleList,
    state.role_list,
    state.permissions,
    state.scopes,
    state.groups,
    state.authorities,

    session.roles,
    session.roleList,
    session.role_list,
    session.permissions,
    session.scopes,
    session.groups,
    session.authorities,

    auth?.roles,
    auth?.permissions,
    auth?.scopes,

    ...branches.flatMap((branch) => [
      branch.roles,
      branch.roleList,
      branch.role_list,
      branch.permissions,
      branch.scopes,
      branch.groups,
      branch.authorities,
      branch.items,
      branch.list,
    ]),
  ];

  try {
    if (isFn(auth?.getRole)) {
      scalarCandidates.push(auth.getRole());
    }
  } catch {}

  try {
    if (isFn(auth?.getCurrentRole)) {
      scalarCandidates.push(auth.getCurrentRole());
    }
  } catch {}

  try {
    if (isFn(auth?.getRoles)) {
      collectionCandidates.push(auth.getRoles());
    }
  } catch {}

  try {
    if (isFn(auth?.getPermissions)) {
      collectionCandidates.push(auth.getPermissions());
    }
  } catch {}

  return [
    ...scalarCandidates,
    ...collectionCandidates,
  ];
}

function hasAdminFlag(AppCore = null) {
  const state = safeObject(AppCore?.state);
  const session = safeObject(state.session);
  const user = getCurrentUser(AppCore);
  const branches = getUserBranches(user);

  const values = [
    ...ADMIN_FLAG_KEYS.flatMap((key) => [
      state?.[key],
      session?.[key],
      user?.[key],
    ]),

    ...branches.flatMap((branch) => {
      return ADMIN_FLAG_KEYS.map((key) => branch?.[key]);
    }),
  ];

  return values.some((value) => safeBoolean(value, false));
}

function getUserRolesFallback(AppCore = null) {
  const roles = getRoleCandidatesFromAppCore(AppCore);

  if (hasAdminFlag(AppCore)) {
    roles.push("admin");
  }

  return expandRoleAliases(roles);
}

function resolveAdminFlag(AppCore, isAdminFn, userRoles = []) {
  let fromCallback = false;

  if (isFn(isAdminFn)) {
    try {
      fromCallback = Boolean(isAdminFn(AppCore));
    } catch {
      try {
        fromCallback = Boolean(isAdminFn());
      } catch {
        fromCallback = false;
      }
    }
  }

  if (fromCallback) {
    return true;
  }

  const auth = getAuthCandidate(AppCore);

  try {
    if (isFn(auth?.isCurrentUserAdmin) && auth.isCurrentUserAdmin()) {
      return true;
    }
  } catch {}

  try {
    if (isFn(auth?.hasRole) && auth.hasRole("admin")) {
      return true;
    }
  } catch {}

  if (hasAdminFlag(AppCore)) {
    return true;
  }

  return userRoles.some((role) => {
    return isAdminRole(role) || isAdminPermission(role);
  });
}

/* =========================================================
   ELEMENT ROLE RESOLUTION
========================================================= */

function getAttrValues(element = null, attrs = []) {
  if (!element) {
    return [];
  }

  return attrs.flatMap((attrName) => {
    const value = element.getAttribute(attrName);

    return splitRoleList(value);
  });
}

function isElementAdminOnly(element = null) {
  if (!element) {
    return false;
  }

  const direct =
    element.getAttribute("data-admin-only");

  const sidebar =
    element.getAttribute("data-sidebar-admin-only");

  const value = first(direct, sidebar);

  if (value === null || value === undefined) {
    return false;
  }

  return (
    value === "" ||
    safeBoolean(value, false)
  );
}

function getElementRequiredRoles(element = null) {
  if (!element) {
    return [];
  }

  const roles = [
    ...getAttrValues(element, [
      "data-role",
      "data-roles",
      "data-sidebar-role",
      "data-sidebar-roles",
      "data-requires-role",
      "data-requires-roles",
      "data-required-role",
      "data-required-roles",
    ]),

    ...getAttrValues(element, [
      "data-permission",
      "data-permissions",
      "data-sidebar-permission",
      "data-sidebar-permissions",
      "data-scope",
      "data-scopes",
    ]),
  ];

  if (isElementAdminOnly(element)) {
    roles.push("admin");
  }

  return expandRoleAliases(roles);
}

function elementRequiresAdmin(element = null) {
  if (!element) {
    return false;
  }

  if (isElementAdminOnly(element)) {
    return true;
  }

  return getElementRequiredRoles(element).some((role) => {
    return isAdminRole(role) || isAdminPermission(role);
  });
}

function shouldShowElementForRoles(
  element = null,
  userRoles = [],
  admin = false
) {
  const requiredRoles =
    getElementRequiredRoles(element);

  if (!requiredRoles.length) {
    return true;
  }

  if (
    requiredRoles.some(isAdminRole) ||
    requiredRoles.some(isAdminPermission)
  ) {
    return (
      Boolean(admin) ||
      userRoles.some(isAdminRole) ||
      userRoles.some(isAdminPermission)
    );
  }

  const userRoleSet =
    new Set(normalizeRoles(userRoles));

  return requiredRoles.some((role) => {
    const normalized = normalizeRole(role);

    return (
      userRoleSet.has(normalized) ||
      userRoles.some((candidate) =>
        normalizeRole(candidate) === normalized
      )
    );
  });
}

/* =========================================================
   ORIGINAL DOM STATE
========================================================= */

function isInitiallyTemplateHiddenRoleElement(element = null) {
  if (!element) {
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
  if (!element) return;

  if (hasDatasetKey(element, "sidebarOriginalDisplaySet")) {
    return;
  }

  const currentDisplay =
    element.style.display || "";

  element.dataset.sidebarOriginalDisplay =
    currentDisplay || ORIGINAL_EMPTY;

  element.dataset.sidebarOriginalDisplaySet =
    "true";
}

function rememberOriginalTabIndex(element = null) {
  if (!element) return;

  if (hasDatasetKey(element, "sidebarOriginalTabindexSet")) {
    return;
  }

  const tabIndex =
    element.getAttribute("tabindex");

  /*
    Caso crítico:
    El template puede nacer con admin items en:
      data-admin-visible="false" + aria-hidden="true" + tabindex="-1"

    Ese tabindex="-1" NO es el tabindex original real.
    Es el bloqueo inicial anti-flash. Al mostrar el item, un <a> debe volver
    a su foco natural, sin tabindex.
  */
  const shouldTreatMinusOneAsNoOriginal =
    tabIndex === "-1" &&
    isInitiallyTemplateHiddenRoleElement(element);

  element.dataset.sidebarOriginalTabindex =
    tabIndex === null || shouldTreatMinusOneAsNoOriginal
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
  if (!element) return;

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
  if (!element) return;

  rememberOriginalDisplay(element);
  rememberOriginalTabIndex(element);
  rememberOriginalTooltipAttrs(element);
}

function restoreDisplay(element = null) {
  if (!element) return;

  const value =
    element.dataset.sidebarOriginalDisplay;

  if (!value || value === ORIGINAL_EMPTY) {
    element.style.display = "";
    return;
  }

  element.style.display = value;
}

function restoreTabIndex(element = null) {
  if (!element) return;

  const value =
    element.dataset.sidebarOriginalTabindex;

  if (!value || value === ORIGINAL_NONE) {
    element.removeAttribute("tabindex");
    return;
  }

  element.setAttribute("tabindex", value);
}

function restoreAttributeFromDataset(
  element = null,
  datasetKey = "",
  attrName = ""
) {
  if (!element || !datasetKey || !attrName) {
    return;
  }

  if (!hasDatasetKey(element, datasetKey)) {
    return;
  }

  const value =
    element.dataset?.[datasetKey];

  if (!value || value === ORIGINAL_NONE) {
    element.removeAttribute(attrName);
    return;
  }

  element.setAttribute(attrName, value);
}

function restoreTooltipAttrs(element = null) {
  if (!element) return;

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

  /*
    aria-describedby suele pertenecer a una instancia runtime del tooltip.
    Restaurarlo puede dejar referencias rotas.
  */
  try {
    element.removeAttribute("aria-describedby");
  } catch {}
}

function removeTooltipAttrs(element = null) {
  if (!element) return;

  try {
    element.removeAttribute("title");
    element.removeAttribute("data-tooltip");
    element.removeAttribute("data-i18n-data-tooltip");
    element.removeAttribute("aria-describedby");
  } catch {}
}

function removeTooltipAttrsDeep(element = null) {
  if (!element) return;

  removeTooltipAttrs(element);

  try {
    element
      .querySelectorAll(
        "[title], [data-tooltip], [data-i18n-data-tooltip], [aria-describedby]"
      )
      .forEach((node) => {
        removeTooltipAttrs(node);
      });
  } catch {}
}

/* =========================================================
   FOCUS / INERT
========================================================= */

function setInert(element = null, inert = false) {
  if (!element) return;

  try {
    element.inert = Boolean(inert);
  } catch {}

  try {
    if (inert) {
      element.setAttribute("inert", "");
    } else {
      element.removeAttribute("inert");
    }
  } catch {}
}

function rememberChildTabIndex(element = null) {
  if (!element) return;

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
  if (!element) return;

  const value =
    element.dataset.sidebarChildOriginalTabindex;

  if (!value || value === ORIGINAL_NONE) {
    element.removeAttribute("tabindex");
    return;
  }

  element.setAttribute("tabindex", value);
}

function getFocusableChildren(element = null) {
  if (!element) {
    return [];
  }

  try {
    return Array.from(
      element.querySelectorAll(FOCUSABLE_SELECTOR)
    ).filter((child) => child !== element);
  } catch {
    return [];
  }
}

function disableDescendantFocus(element = null) {
  if (!element) return;

  getFocusableChildren(element).forEach((child) => {
    rememberChildTabIndex(child);

    try {
      child.setAttribute("tabindex", "-1");
      child.setAttribute("aria-hidden", "true");
    } catch {}
  });
}

function restoreDescendantFocus(element = null) {
  if (!element) return;

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
  if (!isBrowser() || !element) {
    return false;
  }

  try {
    const active = document.activeElement;

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

function setVisibilityDatasets(
  element = null,
  visible = true
) {
  if (!element) return;

  const isAdminManaged =
    elementRequiresAdmin(element) ||
    hasDatasetKey(element, "adminVisible") ||
    hasDatasetKey(element, "adminOnly") ||
    hasDatasetKey(element, "sidebarAdminOnly");

  try {
    element.dataset.sidebarVisible =
      visible ? "true" : "false";

    element.dataset.roleVisible =
      visible ? "true" : "false";

    if (isAdminManaged) {
      element.dataset.adminVisible =
        visible ? "true" : "false";
    }
  } catch {}
}

function setElementVisible(element = null, visible = true) {
  if (!element) return false;

  rememberOriginalState(element);

  if (visible) {
    try {
      element.hidden = false;
      element.removeAttribute("hidden");
      element.removeAttribute("aria-hidden");

      setInert(element, false);

      restoreDisplay(element);
      restoreTabIndex(element);
      restoreTooltipAttrs(element);
      restoreDescendantFocus(element);

      setVisibilityDatasets(element, true);

      element.classList.remove(
        "is-hidden",
        "is-role-hidden",
        "is-admin-hidden"
      );
    } catch {}

    return true;
  }

  /*
    Guardamos tooltip actual justo antes de ocultar.
    Así, si i18n lo cambió en caliente, no restauramos texto viejo.
  */
  rememberOriginalTooltipAttrs(element, {
    force: true,
  });

  blurIfFocusInside(element);

  try {
    element.hidden = true;
    element.setAttribute("hidden", "");
    element.setAttribute("aria-hidden", "true");

    setInert(element, true);

    element.style.display = "none";
    element.setAttribute("tabindex", "-1");

    element.classList.remove(
      "active",
      "is-active",
      "router-active"
    );

    element.classList.add(
      "is-role-hidden"
    );

    if (elementRequiresAdmin(element)) {
      element.classList.add("is-admin-hidden");
    }

    element.removeAttribute("aria-current");

    disableDescendantFocus(element);
    removeTooltipAttrsDeep(element);

    setVisibilityDatasets(element, false);
  } catch {}

  return true;
}

function isRoleElementVisible(element = null) {
  if (!element) {
    return false;
  }

  return !(
    element.hidden === true ||
    element.getAttribute?.("aria-hidden") === "true" ||
    element.hasAttribute?.("hidden") ||
    element.hasAttribute?.("inert") ||
    element.dataset?.sidebarVisible === "false" ||
    element.dataset?.roleVisible === "false" ||
    element.dataset?.adminVisible === "false"
  );
}

function clearHiddenActiveState(sidebar = null) {
  if (!sidebar) return 0;

  let cleared = 0;

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
        element.classList.remove(
          "active",
          "is-active",
          "router-active"
        );

        element.removeAttribute("aria-current");

        try {
          delete element.dataset.active;
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
      sidebar.querySelectorAll(ROLE_SELECTOR)
    );
  } catch {
    return [];
  }
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
    /*
      Forma compatible:
      - segundo arg como función isAdmin legacy
      - tercer arg con roles por si el callback nuevo lo usa
    */
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

  return false;
}

function normalizeServerItemIfPresent(sidebar = null) {
  if (!sidebar) {
    return false;
  }

  try {
    const item =
      sidebar.querySelector(`#${SERVER_NAV_ID}`) ||
      sidebar.querySelector(`[data-route="${SERVER_ROUTE}"]`) ||
      sidebar.querySelector(`[href="${SERVER_ROUTE}"]`);

    if (!item) {
      return false;
    }

    if (!item.dataset.adminOnly) {
      item.dataset.adminOnly = "true";
    }

    if (!item.dataset.role) {
      item.dataset.role = "admin";
    }

    if (!item.dataset.requiresRole) {
      item.dataset.requiresRole = "admin";
    }

    if (!item.dataset.adminVisible) {
      item.dataset.adminVisible = "false";
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
      element.getAttribute?.("href") ||
      "",

    requiredRoles:
      getElementRequiredRoles(element),

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
  const { sidebar } =
    getElements(AppCore);

  const userRoles =
    getUserRolesFallback(AppCore);

  const admin =
    resolveAdminFlag(
      AppCore,
      isAdminFn,
      userRoles
    );

  const elements =
    getRoleManagedElements(sidebar);

  const visibleElements =
    elements.filter(isRoleElementVisible);

  const hiddenElements =
    elements.filter((element) => !isRoleElementVisible(element));

  return {
    ok: Boolean(sidebar),
    isAdmin: admin,
    roles: userRoles,

    counts: {
      total: elements.length,
      visible: visibleElements.length,
      hidden: hiddenElements.length,
    },

    items: elements.map(getElementSnapshot),
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
    getUserRolesFallback(AppCore);

  const admin =
    resolveAdminFlag(
      AppCore,
      isAdminFn,
      userRoles
    );

  const legacyEnsured =
    runLegacyServerNavEnsure({
      AppCore,
      ensureServerNavItem,
      admin,
      userRoles,
    });

  const { sidebar } =
    getElements(AppCore);

  if (!sidebar) {
    const payload = {
      ok: false,
      reason: "sidebar-not-found",
      isAdmin: admin,
      roles: userRoles,
      hiddenCount: 0,
      visibleCount: 0,
      totalCount: 0,
      legacyEnsured,
      serverNormalized: false,
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

  const roleElements =
    getRoleManagedElements(sidebar);

  let hiddenCount = 0;
  let visibleCount = 0;

  const hiddenItems = [];
  const visibleItems = [];

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

    const itemPayload = {
      id:
        element.id || "",

      route:
        element.getAttribute?.("data-route") ||
        element.getAttribute?.("href") ||
        "",

      text:
        safeText(element.textContent, ""),

      requiredRoles,

      adminManaged:
        elementRequiresAdmin(element),
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

  const payload = {
    ok: true,
    isAdmin: admin,
    roles: userRoles,

    hiddenCount,
    visibleCount,
    totalCount: roleElements.length,

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

  /*
    Legacy event: se mantiene por compatibilidad con builds previos.
  */
  safeEmit(
    AppCore,
    EVENT_ROLES_APPLIED_LEGACY,
    payload
  );

  if (clearedActiveCount > 0 || hiddenCount > 0) {
    safeEmit(
      AppCore,
      EVENT_ACTIVE_INVALIDATED,
      {
        reason: "role-visibility",
        clearedActiveCount,
      }
    );

    safeEmit(
      AppCore,
      EVENT_INDICATOR_REFRESH_REQUEST,
      {
        reason: "role-visibility",
      }
    );
  }

  return true;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  applyRoleVisibility,
  getRoleVisibilitySnapshot,
};
