/* =========================================================
   Onion SPA - Sidebar Visibility
   Archivo: src/ui/sidebar/visibility.js

   FINAL PRO SYSTEM · SIDEBAR ROLE VISIBILITY · 10/10

   Responsabilidades:
   - aplicar visibilidad por rol dentro del sidebar
   - mostrar / ocultar elementos admin
   - soportar data-role="admin"
   - soportar data-admin-only="true"
   - soportar data-roles="admin,support"
   - sincronizar aria-hidden / hidden / inert / tabindex
   - asegurar el item dinámico de servidor si existe callback legacy
   - sanear tooltips tras cambios de visibilidad
   - emitir evento estable de visibilidad aplicada

   HARDENING:
   - no depende solo de role === admin
   - no rompe si AppCore o sidebar no existen
   - guarda/restaura display original
   - guarda/restaura tabindex original
   - elimina tooltip/title de elementos ocultos
   - limpia item activo si quedó oculto
========================================================= */

import { getElements, sanitizeFooterTooltipState } from "./dom.js";

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
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];

  return [value];
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
    .split(/[,\s|]+/)
    .map(normalizeRole)
    .filter(Boolean);
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

/* =========================================================
   USER ROLE RESOLUTION FALLBACK
========================================================= */

function isAdminRole(value = "") {
  return ADMIN_ROLE_KEYS.has(normalizeRole(value));
}

function getCurrentUser(AppCore = null) {
  return safeObject(
    AppCore?.state?.user ||
      AppCore?.state?.currentUser ||
      AppCore?.state?.sessionUser ||
      AppCore?.state?.authUser ||
      AppCore?.state?.session?.user
  );
}

function getUserRolesFallback(AppCore = null) {
  const user = getCurrentUser(AppCore);

  const roles = [
    AppCore?.state?.role,
    AppCore?.state?.rol,
    AppCore?.state?.userRole,
    AppCore?.state?.type,

    AppCore?.state?.session?.role,
    AppCore?.state?.session?.rol,
    AppCore?.state?.session?.userRole,

    user?.role,
    user?.rol,
    user?.userRole,
    user?.type,
    user?.userType,

    ...toArray(AppCore?.state?.roles),
    ...toArray(AppCore?.state?.permissions),
    ...toArray(AppCore?.state?.scopes),

    ...toArray(AppCore?.state?.session?.roles),
    ...toArray(AppCore?.state?.session?.permissions),
    ...toArray(AppCore?.state?.session?.scopes),

    ...toArray(user?.roles),
    ...toArray(user?.permissions),
    ...toArray(user?.scopes),
  ]
    .flat(Infinity)
    .map(normalizeRole)
    .filter(Boolean);

  const adminFlag = [
    AppCore?.state?.isAdmin,
    AppCore?.state?.admin,
    AppCore?.state?.isSuperAdmin,
    AppCore?.state?.superAdmin,
    AppCore?.state?.canManageUsers,
    AppCore?.state?.canAccessUsers,

    AppCore?.state?.session?.isAdmin,
    AppCore?.state?.session?.admin,
    AppCore?.state?.session?.isSuperAdmin,
    AppCore?.state?.session?.superAdmin,
    AppCore?.state?.session?.canManageUsers,
    AppCore?.state?.session?.canAccessUsers,

    user?.isAdmin,
    user?.admin,
    user?.isSuperAdmin,
    user?.superAdmin,
    user?.canManageUsers,
    user?.canAccessUsers,
  ].some((value) => safeBoolean(value, false));

  if (adminFlag) {
    roles.push("admin");
  }

  if (roles.some(isAdminRole)) {
    for (const role of ADMIN_ROLE_KEYS) {
      roles.push(role);
    }
  }

  return unique(roles);
}

/* =========================================================
   ELEMENT ROLE RESOLUTION
========================================================= */

function getElementRequiredRoles(element = null) {
  if (!element) return [];

  const roles = [
    ...splitRoles(element.getAttribute("data-role")),
    ...splitRoles(element.getAttribute("data-roles")),
    ...splitRoles(element.getAttribute("data-sidebar-role")),
    ...splitRoles(element.getAttribute("data-sidebar-roles")),
  ];

  const adminOnly = safeBoolean(
    element.getAttribute("data-admin-only"),
    false
  );

  if (adminOnly) {
    roles.push("admin");
  }

  if (roles.some(isAdminRole)) {
    for (const role of ADMIN_ROLE_KEYS) {
      roles.push(role);
    }
  }

  return unique(roles);
}

function shouldShowElementForRoles(element = null, userRoles = [], admin = false) {
  const requiredRoles = getElementRequiredRoles(element);

  if (!requiredRoles.length) {
    return true;
  }

  if (requiredRoles.some(isAdminRole)) {
    return admin || userRoles.some(isAdminRole);
  }

  const userRoleSet = new Set(userRoles.map(normalizeRole));

  return requiredRoles.some((role) => userRoleSet.has(role));
}

/* =========================================================
   DOM STATE
========================================================= */

function rememberOriginalState(element = null) {
  if (!element) return;

  if (!element.dataset.originalDisplay) {
    element.dataset.originalDisplay = element.style.display || "";
  }

  if (!element.dataset.originalTabindex) {
    const tabIndex = element.getAttribute("tabindex");

    if (tabIndex !== null) {
      element.dataset.originalTabindex = tabIndex;
    } else {
      element.dataset.originalTabindex = "__none__";
    }
  }
}

function restoreTabIndex(element = null) {
  if (!element) return;

  const value = element.dataset.originalTabindex;

  if (!value || value === "__none__") {
    element.removeAttribute("tabindex");
    return;
  }

  element.setAttribute("tabindex", value);
}

function setElementVisible(element = null, visible = true) {
  if (!element) return;

  rememberOriginalState(element);

  if (visible) {
    element.hidden = false;
    element.removeAttribute("aria-hidden");
    element.removeAttribute("inert");
    element.style.display = element.dataset.originalDisplay || "";
    restoreTabIndex(element);

    element.dataset.sidebarVisible = "true";
    return;
  }

  element.hidden = true;
  element.setAttribute("aria-hidden", "true");
  element.setAttribute("inert", "");
  element.style.display = "none";
  element.setAttribute("tabindex", "-1");

  element.classList.remove("active", "is-active", "router-active");
  element.removeAttribute("aria-current");

  element.removeAttribute("title");
  element.removeAttribute("data-tooltip");
  element.removeAttribute("data-i18n-data-tooltip");

  element.dataset.sidebarVisible = "false";
}

function clearHiddenActiveState(sidebar = null) {
  if (!sidebar) return;

  sidebar
    .querySelectorAll('[hidden].active, [hidden].is-active, [hidden][aria-current]')
    .forEach((element) => {
      element.classList.remove("active", "is-active", "router-active");
      element.removeAttribute("aria-current");
    });
}

/* =========================================================
   MAIN
========================================================= */

export function applyRoleVisibility(AppCore, ensureServerNavItem, isAdminFn) {
  let admin = false;

  try {
    admin =
      typeof isAdminFn === "function"
        ? Boolean(isAdminFn(AppCore))
        : false;
  } catch {
    admin = false;
  }

  const userRoles = getUserRolesFallback(AppCore);

  if (!admin && userRoles.some(isAdminRole)) {
    admin = true;
  }

  const { sidebar } = getElements(AppCore);

  if (typeof ensureServerNavItem === "function") {
    try {
      ensureServerNavItem(AppCore, isAdminFn);
    } catch {}
  }

  if (!sidebar) return false;

  const roleElements = Array.from(sidebar.querySelectorAll(ROLE_SELECTOR));

  roleElements.forEach((element) => {
    const visible = shouldShowElementForRoles(element, userRoles, admin);
    setElementVisible(element, visible);
  });

  clearHiddenActiveState(sidebar);

  try {
    sanitizeFooterTooltipState(AppCore);
  } catch {}

  try {
    AppCore?.events?.emit?.("sidebar:roles:applied", {
      isAdmin: admin,
      roles: userRoles,
      hiddenCount: roleElements.filter((element) => element.hidden).length,
      visibleCount: roleElements.filter((element) => !element.hidden).length,
    });
  } catch {}

  return true;
}

export default {
  applyRoleVisibility,
};
