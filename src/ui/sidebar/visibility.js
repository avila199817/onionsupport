/* =========================================================
   Onion SPA - Sidebar Visibility
   Archivo: src/ui/sidebar/visibility.js

   FINAL PRO SYSTEM · SIDEBAR ROLE VISIBILITY · 10/10

   RESPONSABILIDADES:
   - aplicar visibilidad por rol dentro del sidebar
   - mostrar / ocultar elementos admin
   - soportar data-role="admin"
   - soportar data-admin-only="true"
   - soportar data-roles="admin,support"
   - soportar data-sidebar-role / data-sidebar-roles
   - sincronizar aria-hidden / hidden / inert / tabindex
   - preservar/restaurar display original
   - preservar/restaurar tabindex original
   - preservar/restaurar tooltip custom/i18n
   - asegurar el item dinámico de servidor si existe callback legacy
   - sanear tooltips tras cambios de visibilidad
   - limpiar item activo si quedó oculto
   - emitir evento estable de visibilidad aplicada

   HARDENING:
   - no depende solo de role === admin
   - soporta aliases admin/superadmin/owner/root
   - soporta flags isAdmin/admin/canManageUsers/canAccessUsers
   - inspecciona state/session/user/profile/raw/meta/claims
   - no rompe si AppCore o sidebar no existen
   - no deja elementos ocultos focusables
   - no destruye permanentemente tooltips i18n
   - evita estado visual fantasma tras login/logout/restore
========================================================= */

import {
  getElements,
  sanitizeFooterTooltipState,
} from "./dom.js";

/* =========================================================
   CONSTANTS
========================================================= */

const ROLE_SELECTOR = [
  "[data-role]",
  "[data-roles]",
  "[data-admin-only]",
  "[data-sidebar-role]",
  "[data-sidebar-roles]",
].join(",");

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

const ORIGINAL_NONE = "__none__";
const ORIGINAL_EMPTY = "__empty__";

/* =========================================================
   SAFE HELPERS
========================================================= */

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

    return value;
  }

  return null;
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí"].includes(key)) return true;
    if (["false", "0", "no"].includes(key)) return false;
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

function normalizeRole(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .trim();
}

function splitRoles(value = "") {
  return safeText(value, "")
    .split(/[,\s|;]+/)
    .map(normalizeRole)
    .filter(Boolean);
}

function normalizeRoles(value) {
  return toArray(value)
    .flat(Infinity)
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

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  try {
    AppCore?.events?.emit?.(name, payload);
    return true;
  } catch {}

  try {
    if (
      typeof window !== "undefined" &&
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
   ROLE RESOLUTION
========================================================= */

function isAdminRole(value = "") {
  return ADMIN_ROLE_KEYS.has(normalizeRole(value));
}

function expandRoleAliases(roles = []) {
  const normalized = normalizeRoles(roles);
  const result = new Set(normalized);

  if (normalized.some(isAdminRole)) {
    for (const role of ADMIN_ROLE_KEYS) {
      result.add(role);
    }

    result.add("admin");
  }

  return Array.from(result).filter(Boolean);
}

function getCurrentUser(AppCore = null) {
  const state = safeObject(AppCore?.state);

  return safeObject(
    first(
      state.user,
      state.currentUser,
      state.sessionUser,
      state.authUser,
      state.session?.user
    )
  );
}

function getUserBranches(user = null) {
  const current = safeObject(user);

  return [
    current,
    safeObject(current.raw),
    safeObject(current.profile),
    safeObject(current.meta),
    safeObject(current.claims),
    safeObject(current.permissions),
    safeObject(current.raw?.profile),
    safeObject(current.raw?.meta),
    safeObject(current.raw?.claims),
    safeObject(current.profile?.permissions),
  ];
}

function getUserRolesFallback(AppCore = null) {
  const state = safeObject(AppCore?.state);
  const session = safeObject(state.session);
  const user = getCurrentUser(AppCore);
  const branches = getUserBranches(user);

  const roleCandidates = [
    state.role,
    state.rol,
    state.userRole,
    state.type,

    session.role,
    session.rol,
    session.userRole,
    session.type,

    ...branches.flatMap((branch) => [
      branch.role,
      branch.rol,
      branch.userRole,
      branch.type,
      branch.userType,
      branch.perfil,
      branch["custom:role"],
      branch["https://onion/role"],
    ]),
  ];

  const roleArrays = [
    state.roles,
    state.permissions,
    state.scopes,
    state.groups,
    state.authorities,

    session.roles,
    session.permissions,
    session.scopes,
    session.groups,
    session.authorities,

    ...branches.flatMap((branch) => [
      branch.roles,
      branch.roleList,
      branch.permissions,
      branch.scopes,
      branch.groups,
      branch.authorities,
      branch.items,
    ]),
  ];

  const roles = [
    ...roleCandidates,
    ...roleArrays.flatMap((value) => toArray(value)),
  ];

  const adminFlag = [
    state.isAdmin,
    state.admin,
    state.isSuperAdmin,
    state.superAdmin,
    state.canManageUsers,
    state.canAccessUsers,

    session.isAdmin,
    session.admin,
    session.isSuperAdmin,
    session.superAdmin,
    session.canManageUsers,
    session.canAccessUsers,

    ...branches.flatMap((branch) => [
      branch.isAdmin,
      branch.admin,
      branch.isSuperAdmin,
      branch.superAdmin,
      branch.canManageUsers,
      branch.canAccessUsers,
    ]),
  ].some((value) => safeBoolean(value, false));

  if (adminFlag) {
    roles.push("admin");
  }

  return expandRoleAliases(roles);
}

/* =========================================================
   ELEMENT ROLE RESOLUTION
========================================================= */

function getElementRequiredRoles(element = null) {
  if (!element) {
    return [];
  }

  const roles = [
    ...splitRoles(element.getAttribute("data-role")),
    ...splitRoles(element.getAttribute("data-roles")),
    ...splitRoles(element.getAttribute("data-sidebar-role")),
    ...splitRoles(element.getAttribute("data-sidebar-roles")),
  ];

  const adminOnlyAttr =
    element.getAttribute("data-admin-only");

  const hasAdminOnlyAttr =
    adminOnlyAttr !== null;

  const adminOnly =
    hasAdminOnlyAttr &&
    (
      adminOnlyAttr === "" ||
      safeBoolean(adminOnlyAttr, false)
    );

  if (adminOnly) {
    roles.push("admin");
  }

  return expandRoleAliases(roles);
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

  if (requiredRoles.some(isAdminRole)) {
    return (
      Boolean(admin) ||
      userRoles.some(isAdminRole)
    );
  }

  const userRoleSet = new Set(
    normalizeRoles(userRoles)
  );

  return requiredRoles.some((role) => {
    return userRoleSet.has(normalizeRole(role));
  });
}

/* =========================================================
   ORIGINAL DOM STATE
========================================================= */

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

  element.dataset.sidebarOriginalTabindex =
    tabIndex === null
      ? ORIGINAL_NONE
      : tabIndex;

  element.dataset.sidebarOriginalTabindexSet =
    "true";
}

function rememberOriginalTooltipAttrs(element = null) {
  if (!element) return;

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
}

function rememberOriginalState(element = null) {
  if (!element) return;

  rememberOriginalDisplay(element);
  rememberOriginalTabIndex(element);
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
    aria-describedby lo dejamos fuera.
    Suele pertenecer a una instancia runtime de tooltip.
    Restaurarlo puede dejar referencias rotas.
  */
  element.removeAttribute("aria-describedby");
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

/* =========================================================
   DOM STATE
========================================================= */

function setElementVisible(element = null, visible = true) {
  if (!element) return;

  rememberOriginalState(element);

  if (visible) {
    try {
      element.hidden = false;
      element.removeAttribute("aria-hidden");
      setInert(element, false);

      restoreDisplay(element);
      restoreTabIndex(element);
      restoreTooltipAttrs(element);

      element.dataset.sidebarVisible = "true";
    } catch {}

    return;
  }

  /*
    Guardamos tooltip actual justo antes de ocultar.
    Así, si i18n lo cambió en caliente, no restauramos texto viejo.
  */
  rememberOriginalTooltipAttrs(element);

  try {
    element.hidden = true;
    element.setAttribute("aria-hidden", "true");
    setInert(element, true);

    element.style.display = "none";
    element.setAttribute("tabindex", "-1");

    element.classList.remove(
      "active",
      "is-active",
      "router-active"
    );

    element.removeAttribute("aria-current");

    removeTooltipAttrsDeep(element);

    element.dataset.sidebarVisible = "false";
  } catch {}
}

function clearHiddenActiveState(sidebar = null) {
  if (!sidebar) return;

  try {
    sidebar
      .querySelectorAll(
        [
          "[hidden].active",
          "[hidden].is-active",
          "[hidden].router-active",
          "[hidden][aria-current]",
          "[data-sidebar-visible='false'].active",
          "[data-sidebar-visible='false'].is-active",
          "[data-sidebar-visible='false'].router-active",
          "[data-sidebar-visible='false'][aria-current]",
        ].join(",")
      )
      .forEach((element) => {
        element.classList.remove(
          "active",
          "is-active",
          "router-active"
        );

        element.removeAttribute("aria-current");
      });
  } catch {}
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
  if (typeof ensureServerNavItem !== "function") {
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

/* =========================================================
   MAIN
========================================================= */

export function applyRoleVisibility(
  AppCore,
  ensureServerNavItem,
  isAdminFn
) {
  let admin = false;

  try {
    if (typeof isAdminFn === "function") {
      admin = Boolean(isAdminFn(AppCore));
    }
  } catch {
    try {
      admin = Boolean(isAdminFn());
    } catch {
      admin = false;
    }
  }

  const userRoles =
    getUserRolesFallback(AppCore);

  if (!admin && userRoles.some(isAdminRole)) {
    admin = true;
  }

  runLegacyServerNavEnsure({
    AppCore,
    ensureServerNavItem,
    admin,
    userRoles,
  });

  const { sidebar } =
    getElements(AppCore);

  if (!sidebar) {
    safeEmit(
      AppCore,
      "sidebar:roles:applied",
      {
        ok: false,
        reason: "sidebar-not-found",
        isAdmin: admin,
        roles: userRoles,
        hiddenCount: 0,
        visibleCount: 0,
      }
    );

    return false;
  }

  const roleElements = Array.from(
    sidebar.querySelectorAll(ROLE_SELECTOR)
  );

  let hiddenCount = 0;
  let visibleCount = 0;

  roleElements.forEach((element) => {
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

    if (visible) {
      visibleCount += 1;
    } else {
      hiddenCount += 1;
    }
  });

  clearHiddenActiveState(sidebar);

  try {
    sanitizeFooterTooltipState(AppCore);
  } catch {}

  safeEmit(
    AppCore,
    "sidebar:roles:applied",
    {
      ok: true,
      isAdmin: admin,
      roles: userRoles,
      hiddenCount,
      visibleCount,
      totalCount: roleElements.length,
    }
  );

  return true;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  applyRoleVisibility,
};
