/* =========================================================
   Onion Support - Sidebar Visibility
   Archivo: /src/ui/sidebar/visibility.js

   Responsabilidad:
   - Decidir si el sidebar debe mostrarse.
   - Aplicar visibilidad al root.
   - Aplicar visibilidad básica por rol admin/user.
   - No navegar.
   - No hacer logout.
   - No leer Auth directamente.
   - No leer Router directamente.
   - No emitir eventos.
   - No crear DOM.
   - No reparar estructuras legacy.
   - No gestionar dropdown.
========================================================= */

import {
  SIDEBAR_CLASSES,
  SIDEBAR_ROLE_ADMIN,
  SIDEBAR_ROLE_USER,
  canonicalSidebarPath,
  isSidebarAdminFallbackRoute,
  isSidebarPublicRoute,
  normalizeSidebarRole,
} from "./constants.js";

import {
  getSidebarRoot,
  isElement,
  setHidden,
} from "./dom.js";

import {
  getSidebarUserRole,
} from "./user.js";

export const SIDEBAR_VISIBILITY_VERSION = "sidebar.visibility.v1";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;

    return value;
  }

  return null;
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

/* =========================================================
   CONTEXT
========================================================= */

export function getSidebarVisibilityPath(context = {}) {
  const AppCore = context.AppCore || null;
  const route = context.route || null;
  const state = isObject(AppCore?.state) ? AppCore.state : {};

  const value = first(
    context.path,
    context.currentPath,
    typeof route === "string" ? route : "",
    isObject(route) ? route.path : "",
    state.canonicalPath,
    typeof state.route === "string" ? state.route : "",
    isObject(state.route) ? state.route.path : "",
    isBrowser() ? window.location.pathname : "/"
  );

  return canonicalSidebarPath(value || "/");
}

export function isSidebarRoutePublic(context = {}) {
  const route = context.route || null;
  const path = getSidebarVisibilityPath(context);

  return Boolean(
    isSidebarPublicRoute(path) ||
      route?.public === true ||
      route?.hideShell === true ||
      route?.shell === false
  );
}

export function isSidebarShellHidden(context = {}) {
  const AppCore = context.AppCore || null;
  const state = isObject(AppCore?.state) ? AppCore.state : {};
  const route = context.route || null;

  return Boolean(
    context.shellHidden === true ||
      context.chromeHidden === true ||
      route?.hideShell === true ||
      route?.shell === false ||
      state.chromeHidden === true ||
      state.shellHidden === true ||
      state.routeShellHidden === true ||
      state.routeMode === "auth"
  );
}

export function hasRenderableSidebarSession(context = {}) {
  return Boolean(
    context.hasSession === true ||
      context.sessionValid === true ||
      (context.authenticated === true && context.hasUser === true)
  );
}

export function shouldRenderSidebar(context = {}) {
  if (!hasRenderableSidebarSession(context)) return false;
  if (isSidebarRoutePublic(context)) return false;
  if (isSidebarShellHidden(context)) return false;

  return true;
}

export function shouldHideSidebar(context = {}) {
  return !shouldRenderSidebar(context);
}

/* =========================================================
   ROOT VISIBILITY
========================================================= */

export function setSidebarRootVisible(root = getSidebarRoot(), visible = true) {
  if (!isElement(root)) return false;

  const show = Boolean(visible);

  setHidden(root, !show);

  try {
    root.dataset.visible = show ? "true" : "false";
  } catch {
    // noop
  }

  return true;
}

export function applySidebarVisibility(context = {}) {
  const root = context.root || getSidebarRoot();
  return setSidebarRootVisible(root, shouldRenderSidebar(context));
}

/* =========================================================
   ROLE HELPERS
========================================================= */

function splitRoles(value = "") {
  return text(value, "")
    .split(/[,\s|;]+/)
    .map((role) => normalizeSidebarRole(role))
    .filter(Boolean);
}

function validSidebarRole(role = "") {
  return role === SIDEBAR_ROLE_ADMIN || role === SIDEBAR_ROLE_USER;
}

function attrIsTrue(element = null, name = "") {
  if (!isElement(element) || !name) return false;

  const value = element.getAttribute(name);

  return value === "" || value === "true" || value === "1";
}

function elementPath(element = null) {
  if (!isElement(element)) return "";

  const raw = first(
    element.dataset?.route,
    element.dataset?.href,
    element.dataset?.to,
    element.getAttribute("data-route"),
    element.getAttribute("data-href"),
    element.getAttribute("data-to"),
    element.getAttribute("href")
  );

  return raw ? canonicalSidebarPath(raw) : "";
}

function elementRequiredRoles(element = null) {
  if (!isElement(element)) return [];

  return unique([
    ...splitRoles(element.getAttribute("data-role")),
    ...splitRoles(element.getAttribute("data-roles")),
    ...splitRoles(element.getAttribute("data-required-role")),
    ...splitRoles(element.getAttribute("data-required-roles")),
    ...splitRoles(element.getAttribute("data-requires-role")),
    ...splitRoles(element.getAttribute("data-requires-roles")),
  ].filter(validSidebarRole));
}

function elementIsAdminOnly(element = null) {
  if (!isElement(element)) return false;

  if (
    attrIsTrue(element, "data-admin-only") ||
    attrIsTrue(element, "data-sidebar-admin-only")
  ) {
    return true;
  }

  const path = elementPath(element);

  if (path && isSidebarAdminFallbackRoute(path)) {
    return true;
  }

  const roles = elementRequiredRoles(element);

  return roles.includes(SIDEBAR_ROLE_ADMIN) && !roles.includes(SIDEBAR_ROLE_USER);
}

function userCanSeeElement(element = null, role = SIDEBAR_ROLE_USER) {
  if (!isElement(element)) return false;
  if (role === SIDEBAR_ROLE_ADMIN) return true;
  if (elementIsAdminOnly(element)) return false;

  const roles = elementRequiredRoles(element);

  if (!roles.length) return true;

  return roles.includes(SIDEBAR_ROLE_USER);
}

function roleVisibilityTarget(element = null) {
  if (!isElement(element)) return null;

  const itemClass = SIDEBAR_CLASSES.item || "";

  if (!itemClass) return element;

  return element.closest?.(`.${itemClass}`) || element;
}

function roleManagedElements(root = getSidebarRoot()) {
  if (!isElement(root)) return [];

  const explicit = [
    ...root.querySelectorAll(
      [
        "[data-admin-only]",
        "[data-sidebar-admin-only]",
        "[data-role]",
        "[data-roles]",
        "[data-required-role]",
        "[data-required-roles]",
        "[data-requires-role]",
        "[data-requires-roles]",
      ].join(",")
    ),
  ];

  const adminFallbackRoutes = [
    ...root.querySelectorAll("[data-route], [data-href], [data-to], a[href]"),
  ].filter((element) => {
    const path = elementPath(element);
    return path && isSidebarAdminFallbackRoute(path);
  });

  return unique([...explicit, ...adminFallbackRoutes]);
}

function setElementRoleVisible(element = null, visible = true) {
  if (!isElement(element)) return false;

  const target = roleVisibilityTarget(element);

  if (!isElement(target)) return false;

  const show = Boolean(visible);

  setHidden(target, !show);

  try {
    element.dataset.roleVisible = show ? "true" : "false";
    target.dataset.roleVisible = show ? "true" : "false";

    if (SIDEBAR_CLASSES.hidden) {
      target.classList.toggle(SIDEBAR_CLASSES.hidden, !show);
    }

    if (SIDEBAR_CLASSES.disabled) {
      element.classList.toggle(SIDEBAR_CLASSES.disabled, !show);
    }

    if (!show) {
      element.setAttribute("aria-disabled", "true");
      element.removeAttribute("aria-current");
      element.tabIndex = -1;

      if (SIDEBAR_CLASSES.active) {
        element.classList.remove(SIDEBAR_CLASSES.active);
      }
    } else {
      element.removeAttribute("aria-disabled");

      if (element.getAttribute("tabindex") === "-1") {
        element.removeAttribute("tabindex");
      }
    }

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ROLE VISIBILITY
========================================================= */

export function getSidebarVisibilityRole(context = {}) {
  const explicit = first(
    context.role,
    context.user?.role,
    getSidebarUserRole(context)
  );

  return normalizeSidebarRole(explicit || SIDEBAR_ROLE_USER);
}

export function applyRoleVisibility(context = {}) {
  const root = context.root || getSidebarRoot();

  if (!isElement(root)) return false;

  const role = getSidebarVisibilityRole(context);
  const elements = roleManagedElements(root);

  for (const element of elements) {
    setElementRoleVisible(element, userCanSeeElement(element, role));
  }

  return true;
}

export function syncSidebarVisibility(context = {}) {
  const root = context.root || getSidebarRoot();

  if (!isElement(root)) return false;

  const visible = shouldRenderSidebar(context);

  setSidebarRootVisible(root, visible);

  if (visible) {
    applyRoleVisibility({
      ...context,
      root,
    });
  }

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function elementSnapshot(element = null) {
  if (!isElement(element)) return null;

  return {
    tag: element.tagName?.toLowerCase?.() || "",
    text: text(element.textContent, ""),
    route: elementPath(element),
    adminOnly: elementIsAdminOnly(element),
    requiredRoles: elementRequiredRoles(element),
    roleVisible: element.dataset?.roleVisible || "",
    hidden: Boolean(element.hidden),
    ariaHidden: element.getAttribute("aria-hidden") || "",
  };
}

export function getSidebarVisibilitySnapshot(context = {}) {
  const root = context.root || getSidebarRoot();
  const role = getSidebarVisibilityRole(context);
  const elements = roleManagedElements(root);

  return {
    version: SIDEBAR_VISIBILITY_VERSION,
    hasRoot: isElement(root),
    shouldRender: shouldRenderSidebar(context),
    path: getSidebarVisibilityPath(context),
    routePublic: isSidebarRoutePublic(context),
    shellHidden: isSidebarShellHidden(context),
    hasSession: hasRenderableSidebarSession(context),
    role,
    isAdmin: role === SIDEBAR_ROLE_ADMIN,
    managedCount: elements.length,
    managedItems: elements.map(elementSnapshot).filter(Boolean),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SIDEBAR_VISIBILITY_VERSION,

  getSidebarVisibilityPath,
  isSidebarRoutePublic,
  isSidebarShellHidden,
  hasRenderableSidebarSession,

  shouldRenderSidebar,
  shouldHideSidebar,

  setSidebarRootVisible,
  applySidebarVisibility,

  getSidebarVisibilityRole,
  applyRoleVisibility,
  syncSidebarVisibility,

  getSidebarVisibilitySnapshot,
};
