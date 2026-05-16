/* =========================================================
   Onion SPA - Sidebar Visibility
   Archivo: src/ui/sidebar/visibility.js

   SIDEBAR VISIBILITY · SIMPLE
   - elementos normales siempre visibles
   - elementos admin sólo visibles para admin
   - soporta data-role / data-roles / admin-only / permissions
   - no toca navegación, dropdown ni open/collapsed
   - repara estados legacy en items normales
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

export const SIDEBAR_VISIBILITY_VERSION = "sidebar-visibility-v17-simple";

const SOURCE = "SidebarVisibility";
const OWNER = "visibility.js";
const LOG_PREFIX = "[SidebarVisibility]";

const ACCESS_RULE_SELECTOR = [
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

const MENU_REPAIR_SELECTOR = [
  ".menu-item",
  "[data-sidebar-nav='true']",
  "[data-sidebar-item='true']",
  "a[data-spa]",
  "a[data-route]",
  "a[data-href]",
  "a[data-to]",
].join(",");

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "details",
  "[tabindex]",
  "[role='button']",
  "[role='link']",
  "[contenteditable='true']",
].join(",");

const TOOLTIP_SELECTOR = "[title], [data-tooltip], [data-i18n-data-tooltip], [aria-describedby]";

const DEFAULT_ADMIN_ROLE_KEYS = Object.freeze([
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
  "super-admin",
  "owner",
  "root",
]);

const DEFAULT_ADMIN_PERMISSION_KEYS = Object.freeze([
  "*",
  "admin",
  "admin:*",
  "admin:manage",
  "admin.manage",
  "users:manage",
  "users.manage",
  "usuarios:manage",
  "usuarios.manage",
  "server:manage",
  "server.manage",
  "servidor:manage",
  "servidor.manage",
  "settings:manage",
  "settings.manage",
  "ajustes:manage",
  "ajustes.manage",
]);

const DEFAULT_ADMIN_FLAG_KEYS = Object.freeze([
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
  "canAccessServer",
  "can_access_server",
  "canManageServer",
  "can_manage_server",
  "canManageSettings",
  "can_manage_settings",
]);

const ORIGINAL_NONE = "__none__";
const ORIGINAL_EMPTY = "__empty__";

const EVENTS = Object.freeze({
  roleVisibilityApplied: SIDEBAR_EVENTS?.roleVisibilityApplied || "sidebar:role-visibility:applied",
  visibilityApplied: SIDEBAR_EVENTS?.visibilityApplied || "sidebar:visibility:applied",
  rolesAppliedLegacy: SIDEBAR_EVENTS?.rolesAppliedLegacy || "sidebar:roles:applied",
  activeInvalidated: SIDEBAR_EVENTS?.activeInvalidated || "sidebar:active:invalidated",
  indicatorRefreshRequest: SIDEBAR_EVENTS?.indicatorRefreshRequest || "sidebar:indicator:refresh-request",
});

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value === null || value === undefined) return [];
  return [value];
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) continue;
    return value;
  }

  return null;
}

function safeBoolean(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;

  const key = safeText(value, "").toLowerCase();
  if (["true", "yes", "si", "sí", "ok", "on", "y"].includes(key)) return true;
  if (["false", "no", "off", "n"].includes(key)) return false;

  return Boolean(fallback);
}

function hasDatasetKey(element = null, key = "") {
  if (!element?.dataset || !key) return false;
  return Object.prototype.hasOwnProperty.call(element.dataset, key);
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
  try {
    AppCore?.utils?.warn?.(LOG_PREFIX, ...args);
    return;
  } catch {}

  try {
    console.warn(LOG_PREFIX, ...args);
  } catch {}
}

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  const detail = {
    ...safeObject(payload),
    source: safeText(payload?.source, SOURCE),
    owner: OWNER,
    version: SIDEBAR_VISIBILITY_VERSION,
    at: safeText(payload?.at, safeIsoDate()),
    ts: payload?.ts || nowTs(),
  };

  try {
    if (isFn(AppCore?.events?.emit)) {
      AppCore.events.emit(name, detail);
      return true;
    }
  } catch (error) {
    safeWarn(AppCore, `AppCore.events.emit("${name}") falló.`, error);
  }

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    }
  } catch {}

  return false;
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
    .replace(/[^a-z0-9_:.*/-]/g, "")
    .trim();
}

function splitRoleList(value = "") {
  return safeText(value, "")
    .split(/[,\s|;]+/)
    .map(normalizeRole)
    .filter(Boolean);
}

function flattenRoleValue(value, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => flattenRoleValue(item, depth + 1));
  if (typeof value === "string") return value.split(/[,\s|;]+/).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "number" || typeof value === "boolean") return [value];

  if (typeof value === "object") {
    const truthyKeys = Object.entries(value)
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
      value.permissions,
      value.permisos,
      value.scopes,
      value.groups,
      value.authorities,
      value.items,
      value.list,
      ...truthyKeys,
    ].flatMap((item) => flattenRoleValue(item, depth + 1));
  }

  return [];
}

function normalizeRoles(value) {
  return flattenRoleValue(value).map(normalizeRole).filter(Boolean);
}

function normalizedSet(values = []) {
  return new Set(safeArray(values).flat(Infinity).map(normalizeRole).filter(Boolean));
}

const ADMIN_ROLE_KEYS = normalizedSet([
  ...DEFAULT_ADMIN_ROLE_KEYS,
  ...(Array.isArray(SIDEBAR_ADMIN_ROLE_KEYS) ? SIDEBAR_ADMIN_ROLE_KEYS : []),
]);

const ADMIN_PERMISSION_KEYS = normalizedSet([
  ...DEFAULT_ADMIN_PERMISSION_KEYS,
  ...(Array.isArray(SIDEBAR_ADMIN_PERMISSION_KEYS) ? SIDEBAR_ADMIN_PERMISSION_KEYS : []),
]);

const ADMIN_FLAG_KEYS = [
  ...new Set([
    ...DEFAULT_ADMIN_FLAG_KEYS,
    ...(Array.isArray(SIDEBAR_ADMIN_FLAG_KEYS) ? SIDEBAR_ADMIN_FLAG_KEYS : []),
  ].filter(Boolean)),
];

function isAdminRole(value = "") {
  return ADMIN_ROLE_KEYS.has(normalizeRole(value));
}

function isAdminPermission(value = "") {
  const key = normalizeRole(value);
  if (!key) return false;
  if (ADMIN_PERMISSION_KEYS.has(key)) return true;

  return key === "*" || key.startsWith("admin:") || key.startsWith("admin.") || key.includes(":admin") || key.includes(".admin") || key.endsWith(":manage") || key.endsWith(".manage");
}

function roleMatches(userRole = "", requirement = "") {
  const role = normalizeRole(userRole);
  const required = normalizeRole(requirement);

  if (!role || !required) return false;
  if (role === required || role === "*") return true;
  if (required.endsWith(":*") && role.startsWith(required.slice(0, -1))) return true;
  if (required.endsWith(".*") && role.startsWith(required.slice(0, -1))) return true;
  if (role.endsWith(":*") && required.startsWith(role.slice(0, -1))) return true;
  if (role.endsWith(".*") && required.startsWith(role.slice(0, -1))) return true;

  return false;
}

function expandRoleAliases(roles = []) {
  const normalized = normalizeRoles(roles);
  const out = new Set(normalized);

  if (normalized.some(isAdminRole) || normalized.some(isAdminPermission)) {
    out.add("admin");
    for (const role of ADMIN_ROLE_KEYS) out.add(role);
    for (const permission of ADMIN_PERMISSION_KEYS) out.add(permission);
  }

  if (!out.size) out.add("user");
  return [...out].filter(Boolean);
}

/* =========================================================
   USER / AUTH SOURCES
========================================================= */

function getModule(AppCore = null, ...names) {
  for (const name of names) {
    try {
      const mod = AppCore?.modules?.get?.(name);
      if (mod) return mod;
    } catch {}

    try {
      if (AppCore?.modules?.[name]) return AppCore.modules[name];
    } catch {}
  }

  return null;
}

function getAuth(AppCore = null) {
  return getModule(AppCore, "auth", "Auth", "session", "Session") || AppCore?.auth || AppCore?.Auth || AppCore?.features?.auth || null;
}

function unwrapUser(payload = null) {
  const value = safeObject(payload);
  if (!Object.keys(value).length) return {};

  return safeObject(first(
    value.user,
    value.usuario,
    value.currentUser,
    value.profile,
    value.account?.user,
    value.account,
    value.session?.user,
    value.data?.user,
    value.data?.usuario,
    value.payload?.user,
    value.result?.user,
    value.me,
    value
  ));
}

function getCurrentUser(AppCore = null) {
  const state = safeObject(AppCore?.state);
  const auth = getAuth(AppCore);

  let authUser = null;

  try { authUser = auth?.getUser?.(); } catch {}
  try { authUser = authUser || auth?.getCurrentUser?.(); } catch {}
  try { authUser = authUser || auth?.currentUser?.(); } catch {}

  return unwrapUser(first(
    state.user,
    state.usuario,
    state.currentUser,
    state.sessionUser,
    state.authUser,
    state.profile,
    state.account,
    state.session?.user,
    state.session?.usuario,
    state.auth?.user,
    authUser,
    auth?.user,
    auth?.currentUser,
    auth?.session?.user,
    {}
  ));
}

function userBranches(user = null) {
  const current = safeObject(user);

  return [
    current,
    safeObject(current.profile),
    safeObject(current.account),
    safeObject(current.meta),
    safeObject(current.claims),
    safeObject(current.permissions),
    safeObject(current.raw),
    safeObject(current.raw?.profile),
    safeObject(current.raw?.account),
  ].filter((branch) => branch && typeof branch === "object" && Object.keys(branch).length > 0);
}

function roleCandidatesFromAppCore(AppCore = null) {
  const state = safeObject(AppCore?.state);
  const session = safeObject(state.session);
  const auth = getAuth(AppCore);
  const user = getCurrentUser(AppCore);
  const branches = userBranches(user);

  const values = [
    state.role,
    state.rol,
    state.userRole,
    state.user_role,
    state.roles,
    state.permissions,
    state.permisos,
    state.scopes,
    session.role,
    session.rol,
    session.roles,
    session.permissions,
    session.permisos,
    session.scopes,
    auth?.role,
    auth?.rol,
    auth?.roles,
    auth?.permissions,
    auth?.permisos,
    auth?.scopes,
    ...branches.flatMap((branch) => [
      branch.role,
      branch.rol,
      branch.userRole,
      branch.user_role,
      branch.type,
      branch.perfil,
      branch.roles,
      branch.permissions,
      branch.permisos,
      branch.scopes,
      branch.groups,
      branch.authorities,
      branch["custom:role"],
      branch["custom:roles"],
      branch["custom:permissions"],
    ]),
  ];

  try { values.push(auth?.getRole?.()); } catch {}
  try { values.push(auth?.getCurrentRole?.()); } catch {}
  try { values.push(auth?.getRoles?.()); } catch {}
  try { values.push(auth?.getPermissions?.()); } catch {}
  try { values.push(auth?.getScopes?.()); } catch {}

  return values;
}

function hasAdminFlag(AppCore = null) {
  const state = safeObject(AppCore?.state);
  const session = safeObject(state.session);
  const auth = getAuth(AppCore);
  const user = getCurrentUser(AppCore);
  const branches = userBranches(user);

  const values = [
    ...ADMIN_FLAG_KEYS.flatMap((key) => [state?.[key], session?.[key], state.auth?.[key], user?.[key], auth?.[key], auth?.state?.[key]]),
    ...branches.flatMap((branch) => ADMIN_FLAG_KEYS.map((key) => branch?.[key])),
  ];

  try { values.push(auth?.isAdmin?.()); } catch {}
  try { values.push(auth?.isCurrentUserAdmin?.()); } catch {}

  return values.some((value) => safeBoolean(value, false));
}

function fallbackUserRoles(AppCore = null) {
  const roles = roleCandidatesFromAppCore(AppCore);
  if (hasAdminFlag(AppCore)) roles.push("admin");
  return expandRoleAliases(roles);
}

function resolvedUserRoles(AppCore = null) {
  try {
    const roles = getUserRolesFromUserModule?.(AppCore);
    if (roles?.length) return expandRoleAliases(roles);
  } catch {}

  return fallbackUserRoles(AppCore);
}

function resolveAdmin(AppCore, isAdminFn, userRoles = []) {
  try {
    if (isFn(isAdminFn) && (isAdminFn(AppCore) || isAdminFn())) return true;
  } catch {}

  try {
    if (isAdminFromUserModule?.(AppCore)) return true;
  } catch {}

  const auth = getAuth(AppCore);

  try { if (auth?.isCurrentUserAdmin?.()) return true; } catch {}
  try { if (auth?.isAdmin?.()) return true; } catch {}
  try { if (auth?.hasRole?.("admin")) return true; } catch {}

  return hasAdminFlag(AppCore) || safeArray(userRoles).some((role) => isAdminRole(role) || isAdminPermission(role));
}

/* =========================================================
   ACCESS RULES
========================================================= */

function attrValues(element = null, attrs = []) {
  if (!element) return [];

  return attrs.flatMap((attrName) => splitRoleList(element.getAttribute(attrName)));
}

function hasAccessRuleAttr(element = null) {
  if (!element) return false;

  try {
    return Boolean(element.matches?.(ACCESS_RULE_SELECTOR));
  } catch {
    return false;
  }
}

function elementAdminOnly(element = null) {
  if (!element) return false;

  const value = first(element.getAttribute("data-admin-only"), element.getAttribute("data-sidebar-admin-only"));
  if (value === null || value === undefined) return false;

  return value === "" || safeBoolean(value, false);
}

function requiredRolesRaw(element = null) {
  if (!element) return [];

  const roles = [
    ...attrValues(element, [
      "data-role",
      "data-roles",
      "data-sidebar-role",
      "data-sidebar-roles",
      "data-requires-role",
      "data-requires-roles",
      "data-required-role",
      "data-required-roles",
    ]),
    ...attrValues(element, [
      "data-permission",
      "data-permissions",
      "data-sidebar-permission",
      "data-sidebar-permissions",
      "data-scope",
      "data-scopes",
    ]),
  ];

  if (elementAdminOnly(element)) roles.push("admin");
  return roles.map(normalizeRole).filter(Boolean);
}

function requiredRoles(element = null) {
  return expandRoleAliases(requiredRolesRaw(element));
}

function elementRequiresAdmin(element = null) {
  if (!element) return false;
  if (elementAdminOnly(element)) return true;
  return requiredRolesRaw(element).some((role) => isAdminRole(role) || isAdminPermission(role));
}

function accessControlled(element = null) {
  if (!element) return false;
  if (elementAdminOnly(element)) return true;
  if (!hasAccessRuleAttr(element)) return false;
  return requiredRolesRaw(element).length > 0;
}

function userHasRequirement(userRoles = [], requirement = "") {
  return expandRoleAliases(userRoles).some((role) => roleMatches(role, requirement));
}

function shouldShowElement(element = null, userRoles = [], admin = false) {
  if (!accessControlled(element)) return true;
  if (admin) return true;

  const raw = requiredRolesRaw(element);
  if (!raw.length) return true;
  if (elementAdminOnly(element)) return false;

  return raw.some((requirement) => userHasRequirement(userRoles, requirement));
}

/* =========================================================
   ORIGINAL DOM STATE
========================================================= */

function rememberOriginalState(element = null) {
  if (!element) return;

  if (!hasDatasetKey(element, "sidebarOriginalDisplaySet")) {
    const display = element.style.display || "";
    element.dataset.sidebarOriginalDisplay = !display || display === "none" ? ORIGINAL_EMPTY : display;
    element.dataset.sidebarOriginalDisplaySet = "true";
  }

  if (!hasDatasetKey(element, "sidebarOriginalTabindexSet")) {
    const tabIndex = element.getAttribute("tabindex");
    element.dataset.sidebarOriginalTabindex = tabIndex === null || tabIndex === "-1" ? ORIGINAL_NONE : tabIndex;
    element.dataset.sidebarOriginalTabindexSet = "true";
  }

  if (!hasDatasetKey(element, "sidebarOriginalTooltipSet")) {
    element.dataset.sidebarOriginalTitle = element.getAttribute("title") ?? ORIGINAL_NONE;
    element.dataset.sidebarOriginalTooltip = element.getAttribute("data-tooltip") ?? ORIGINAL_NONE;
    element.dataset.sidebarOriginalI18nTooltip = element.getAttribute("data-i18n-data-tooltip") ?? ORIGINAL_NONE;
    element.dataset.sidebarOriginalTooltipSet = "true";
  }
}

function restoreDatasetAttr(element = null, datasetKey = "", attrName = "") {
  if (!element || !datasetKey || !attrName || !hasDatasetKey(element, datasetKey)) return;

  const value = element.dataset?.[datasetKey];

  try {
    if (!value || value === ORIGINAL_NONE) element.removeAttribute(attrName);
    else element.setAttribute(attrName, value);
  } catch {}
}

function restoreVisibleState(element = null) {
  if (!element) return;

  const display = element.dataset.sidebarOriginalDisplay;

  try {
    element.hidden = false;
    element.removeAttribute("hidden");
    element.removeAttribute("aria-hidden");
    element.removeAttribute("inert");
    element.classList.remove("is-hidden", "is-role-hidden", "is-admin-hidden");
    element.style.display = !display || display === ORIGINAL_EMPTY ? "" : display;

    const tabIndex = element.dataset.sidebarOriginalTabindex;
    if (!tabIndex || tabIndex === ORIGINAL_NONE) element.removeAttribute("tabindex");
    else element.setAttribute("tabindex", tabIndex);

    restoreDatasetAttr(element, "sidebarOriginalTitle", "title");
    restoreDatasetAttr(element, "sidebarOriginalTooltip", "data-tooltip");
    restoreDatasetAttr(element, "sidebarOriginalI18nTooltip", "data-i18n-data-tooltip");
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
    element.querySelectorAll(TOOLTIP_SELECTOR).forEach((node) => removeTooltipAttrs(node));
  } catch {}
}

function focusableChildren(element = null) {
  if (!element) return [];

  try {
    return [...element.querySelectorAll(FOCUSABLE_SELECTOR)].filter((child) => child !== element);
  } catch {
    return [];
  }
}

function rememberChildTabIndex(element = null) {
  if (!element || hasDatasetKey(element, "sidebarChildOriginalTabindexSet")) return;

  const tabIndex = element.getAttribute("tabindex");
  element.dataset.sidebarChildOriginalTabindex = tabIndex === null ? ORIGINAL_NONE : tabIndex;
  element.dataset.sidebarChildOriginalTabindexSet = "true";
}

function restoreChildTabIndex(element = null) {
  if (!element) return;

  const value = element.dataset.sidebarChildOriginalTabindex;

  try {
    if (!value || value === ORIGINAL_NONE) element.removeAttribute("tabindex");
    else element.setAttribute("tabindex", value);
  } catch {}
}

function disableDescendantFocus(element = null) {
  for (const child of focusableChildren(element)) {
    rememberChildTabIndex(child);

    try {
      child.setAttribute("tabindex", "-1");
      child.setAttribute("aria-hidden", "true");
    } catch {}
  }
}

function restoreDescendantFocus(element = null) {
  for (const child of focusableChildren(element)) {
    try {
      restoreChildTabIndex(child);
      child.removeAttribute("aria-hidden");
    } catch {}
  }
}

function blurIfFocusInside(element = null) {
  if (!isBrowser() || !element) return false;

  try {
    const active = document.activeElement;
    if (active && active !== document.body && element.contains(active) && isFn(active.blur)) {
      active.blur();
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   DOM VISIBILITY
========================================================= */

function setVisibilityDatasets(element = null, visible = true) {
  if (!element) return;

  const adminManaged = elementRequiresAdmin(element);

  try {
    element.dataset.sidebarVisible = visible ? "true" : "false";
    element.dataset.roleVisible = visible ? "true" : "false";

    if (adminManaged) element.dataset.adminVisible = visible ? "true" : "false";
    else if (hasDatasetKey(element, "adminVisible")) element.dataset.adminVisible = "true";
  } catch {}
}

function setElementVisible(element = null, visible = true) {
  if (!element) return false;

  rememberOriginalState(element);

  if (visible) {
    restoreVisibleState(element);
    restoreDescendantFocus(element);
    setVisibilityDatasets(element, true);
    return true;
  }

  blurIfFocusInside(element);

  try {
    element.hidden = true;
    element.setAttribute("hidden", "");
    element.setAttribute("aria-hidden", "true");
    element.setAttribute("inert", "");
    element.setAttribute("tabindex", "-1");
    element.classList.remove("active", "is-active", "router-active");
    element.classList.add("is-role-hidden");
    if (elementRequiresAdmin(element)) element.classList.add("is-admin-hidden");
    element.removeAttribute("aria-current");
    delete element.dataset.active;
    element.dataset.current = "false";
    element.dataset.selected = "false";
  } catch {}

  disableDescendantFocus(element);
  removeTooltipAttrsDeep(element);
  setVisibilityDatasets(element, false);

  return true;
}

function isRoleElementVisible(element = null) {
  if (!element) return false;
  if (element.hidden === true || element.getAttribute?.("aria-hidden") === "true" || element.hasAttribute?.("hidden") || element.hasAttribute?.("inert")) return false;
  if (element.dataset?.sidebarVisible === "false" || element.dataset?.roleVisible === "false") return false;
  if (elementRequiresAdmin(element) && element.dataset?.adminVisible === "false") return false;
  return true;
}

function clearHiddenActiveState(sidebar = null) {
  if (!sidebar) return 0;

  let cleared = 0;

  try {
    sidebar.querySelectorAll(".active,.is-active,.router-active,[aria-current]").forEach((element) => {
      if (isRoleElementVisible(element)) return;

      element.classList.remove("active", "is-active", "router-active");
      element.removeAttribute("aria-current");
      delete element.dataset.active;
      element.dataset.current = "false";
      element.dataset.selected = "false";
      cleared += 1;
    });
  } catch {}

  return cleared;
}

function roleManagedElements(sidebar = null) {
  if (!sidebar) return [];

  try {
    return [...sidebar.querySelectorAll(ACCESS_RULE_SELECTOR)].filter(accessControlled);
  } catch {
    return [];
  }
}

function menuRepairElements(sidebar = null) {
  if (!sidebar) return [];

  try {
    return [...sidebar.querySelectorAll(MENU_REPAIR_SELECTOR)];
  } catch {
    return [];
  }
}

function repairNormalSidebarItems(sidebar = null) {
  if (!sidebar) return { repairedCount: 0, repairedItems: [] };

  let repairedCount = 0;
  const repairedItems = [];

  for (const element of menuRepairElements(sidebar)) {
    if (accessControlled(element)) continue;

    const wasBroken = Boolean(
      element.hidden === true ||
        element.hasAttribute?.("hidden") ||
        element.hasAttribute?.("inert") ||
        element.getAttribute?.("aria-hidden") === "true" ||
        element.dataset?.sidebarVisible === "false" ||
        element.dataset?.roleVisible === "false" ||
        element.dataset?.adminVisible === "false" ||
        element.classList?.contains?.("is-role-hidden") ||
        element.classList?.contains?.("is-admin-hidden") ||
        element.style?.display === "none"
    );

    setElementVisible(element, true);

    try {
      element.dataset.sidebarVisible = "true";
      element.dataset.roleVisible = "true";
      if (hasDatasetKey(element, "adminVisible")) element.dataset.adminVisible = "true";
      element.classList.remove("is-hidden", "is-role-hidden", "is-admin-hidden");
      if (element.style?.display === "none") element.style.display = "";
    } catch {}

    if (wasBroken) {
      repairedCount += 1;
      repairedItems.push({
        id: element.id || "",
        route: element.getAttribute?.("data-route") || element.getAttribute?.("href") || "",
        text: safeText(element.textContent, ""),
      });
    }
  }

  return { repairedCount, repairedItems };
}

/* =========================================================
   SERVER ITEM
========================================================= */

function runLegacyServerEnsure({ AppCore, ensureServerNavItem, admin, userRoles } = {}) {
  if (!isFn(ensureServerNavItem)) return false;

  try {
    ensureServerNavItem(AppCore, () => Boolean(admin), userRoles);
    return true;
  } catch {}

  try {
    ensureServerNavItem(AppCore, Boolean(admin), userRoles);
    return true;
  } catch {}

  try {
    ensureServerNavItem({ AppCore, admin, roles: userRoles });
    return true;
  } catch {}

  return false;
}

function normalizeServerItem(sidebar = null) {
  if (!sidebar) return false;

  try {
    const serverId = safeText(SERVER_NAV_ID, "");
    const serverRoute = safeText(SERVER_ROUTE, "/servidor");
    const item = (serverId ? sidebar.querySelector(`#${serverId}`) : null) ||
      sidebar.querySelector(`[data-route="${serverRoute}"]`) ||
      sidebar.querySelector(`[data-href="${serverRoute}"]`) ||
      sidebar.querySelector(`[data-to="${serverRoute}"]`) ||
      sidebar.querySelector(`[href="${serverRoute}"]`);

    if (!item) return false;

    item.dataset.adminOnly = item.dataset.adminOnly || "true";
    item.dataset.sidebarAdminOnly = item.dataset.sidebarAdminOnly || "true";
    item.dataset.role = item.dataset.role || "admin";
    item.dataset.requiresRole = item.dataset.requiresRole || "admin";

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SNAPSHOT
========================================================= */

function elementSnapshot(element = null) {
  if (!element) return null;

  return {
    tag: element.tagName || "",
    id: element.id || "",
    text: safeText(element.textContent, ""),
    route: element.getAttribute?.("data-route") || element.getAttribute?.("data-href") || element.getAttribute?.("data-to") || element.getAttribute?.("href") || "",
    accessControlled: accessControlled(element),
    requiredRoles: requiredRoles(element),
    requiredRolesRaw: requiredRolesRaw(element),
    adminOnly: elementAdminOnly(element),
    adminManaged: elementRequiresAdmin(element),
    hidden: Boolean(element.hidden),
    ariaHidden: element.getAttribute?.("aria-hidden") || "",
    inert: Boolean(element.hasAttribute?.("inert")),
    tabindex: element.getAttribute?.("tabindex"),
    sidebarVisible: element.dataset?.sidebarVisible || "",
    roleVisible: element.dataset?.roleVisible || "",
    adminVisible: element.dataset?.adminVisible || "",
    className: element.className || "",
  };
}

export function getRoleVisibilitySnapshot(AppCore, isAdminFn) {
  const { sidebar } = getElements(AppCore);
  const userRoles = resolvedUserRoles(AppCore);
  const admin = resolveAdmin(AppCore, isAdminFn, userRoles);
  const roleItems = roleManagedElements(sidebar);
  const menuItems = menuRepairElements(sidebar);
  const normalMenuItems = menuItems.filter((element) => !accessControlled(element));
  const visibleItems = roleItems.filter(isRoleElementVisible);
  const hiddenItems = roleItems.filter((element) => !isRoleElementVisible(element));

  return {
    version: SIDEBAR_VISIBILITY_VERSION,
    ok: Boolean(sidebar),
    isAdmin: admin,
    roles: userRoles,
    counts: {
      roleManagedTotal: roleItems.length,
      roleManagedVisible: visibleItems.length,
      roleManagedHidden: hiddenItems.length,
      menuTotal: menuItems.length,
      normalMenuTotal: normalMenuItems.length,
    },
    roleItems: roleItems.map(elementSnapshot),
    normalMenuItems: normalMenuItems.map(elementSnapshot),
    menuItems: menuItems.map(elementSnapshot),
  };
}

/* =========================================================
   MAIN
========================================================= */

export function applyRoleVisibility(AppCore, ensureServerNavItem, isAdminFn) {
  const userRoles = resolvedUserRoles(AppCore);
  const admin = resolveAdmin(AppCore, isAdminFn, userRoles);
  const legacyEnsured = runLegacyServerEnsure({ AppCore, ensureServerNavItem, admin, userRoles });
  const { sidebar } = getElements(AppCore);

  if (!sidebar) {
    const payload = {
      ok: false,
      reason: "sidebar-not-found",
      isAdmin: admin,
      roles: userRoles,
      hiddenCount: 0,
      visibleCount: 0,
      totalCount: 0,
      normalRepairedCount: 0,
      legacyEnsured,
      serverNormalized: false,
    };

    safeEmit(AppCore, EVENTS.roleVisibilityApplied, payload);
    safeEmit(AppCore, EVENTS.rolesAppliedLegacy, payload);
    return false;
  }

  const serverNormalized = normalizeServerItem(sidebar);
  const normalRepair = repairNormalSidebarItems(sidebar);
  const roleItems = roleManagedElements(sidebar);

  let hiddenCount = 0;
  let visibleCount = 0;
  const hiddenItems = [];
  const visibleItems = [];

  for (const element of roleItems) {
    const visible = shouldShowElement(element, userRoles, admin);
    setElementVisible(element, visible);

    const item = {
      id: element.id || "",
      route: element.getAttribute?.("data-route") || element.getAttribute?.("data-href") || element.getAttribute?.("data-to") || element.getAttribute?.("href") || "",
      text: safeText(element.textContent, ""),
      requiredRoles: requiredRoles(element),
      requiredRolesRaw: requiredRolesRaw(element),
      adminOnly: elementAdminOnly(element),
      adminManaged: elementRequiresAdmin(element),
      accessControlled: accessControlled(element),
    };

    if (visible) {
      visibleCount += 1;
      visibleItems.push(item);
    } else {
      hiddenCount += 1;
      hiddenItems.push(item);
    }
  }

  const clearedActiveCount = clearHiddenActiveState(sidebar);

  try {
    sanitizeFooterTooltipState(AppCore);
  } catch (error) {
    safeWarn(AppCore, "sanitizeFooterTooltipState falló tras applyRoleVisibility.", error);
  }

  const payload = {
    ok: true,
    isAdmin: admin,
    roles: userRoles,
    hiddenCount,
    visibleCount,
    totalCount: roleItems.length,
    normalRepairedCount: normalRepair.repairedCount,
    normalRepairedItems: normalRepair.repairedItems,
    hiddenItems,
    visibleItems,
    clearedActiveCount,
    legacyEnsured,
    serverNormalized,
  };

  safeEmit(AppCore, EVENTS.roleVisibilityApplied, payload);
  safeEmit(AppCore, EVENTS.visibilityApplied, payload);
  safeEmit(AppCore, EVENTS.rolesAppliedLegacy, payload);

  if (clearedActiveCount > 0 || hiddenCount > 0 || normalRepair.repairedCount > 0) {
    safeEmit(AppCore, EVENTS.activeInvalidated, {
      reason: "role-visibility",
      clearedActiveCount,
      hiddenCount,
      normalRepairedCount: normalRepair.repairedCount,
    });

    safeEmit(AppCore, EVENTS.indicatorRefreshRequest, { reason: "role-visibility" });
  }

  return true;
}

export default {
  SIDEBAR_VISIBILITY_VERSION,
  applyRoleVisibility,
  getRoleVisibilitySnapshot,
};
