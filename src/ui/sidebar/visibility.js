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
  SIDEBAR_SELECTORS,
  canonicalSidebarPath,
  isSidebarAdminFallbackRoute,
  isSidebarPublicRoute,
  normalizeSidebarRole,
} from "./constants.js";

import {
  getSidebarRoot,
  isElement,
  queryAll,
  setActiveLink,
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

/* =========================================================
   CONTEXT
========================================================= */

export function getSidebarVisibilityPath(context = {}) {
  const AppCore = context.AppCore || null;
  const route = context.route || null;

  const value = first(
    context.path,
    context.currentPath,
    typeof route === "string" ? route : "",
    isObject(route) ? route.path : "",
    AppCore?.state?.canonicalPath,
    typeof AppCore?.state?.route === "string" ? AppCore.state.route : "",
    isObject(AppCore?.state?.route) ? AppCore.state.route.path : "",
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
  /*
    El index debe pasar hasSession=true sólo cuando exista:
    - token usable
    - usuario usable

    Por seguridad, el valor por defecto es false.
  */
  return (
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
  const visible = shouldRenderSidebar(context);

  return setSidebarRootVisible(root, visible);
}

/* =========================================================
   ROLE DATA
========================================================= */

function splitRoles(value = "") {
  return text(value, "")
    .split(/[,\s|;]+/)
    .map((role) => normalizeSidebarRole(role))
    .filter(Boolean);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function validSidebarRole(role = "") {
  return role === SIDEBAR_ROLE_ADMIN || role === SIDEBAR_ROLE_USER;
}

function attrIsTrue(element = null, name = "") {
  if (!isElement(element) || !name) return false;

  const value = element.getAttribute(name);

  return value === "" || value === "true" || value === "1";
}

function elementRoute(element = null) {
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

  const roles = [
    ...splitRoles(element.getAttribute("data-role")),
    ...splitRoles(element.getAttribute("data-roles")),
    ...splitRoles(element.getAttribute("data-required-role")),
    ...splitRoles(element.getAttribute("data-required-roles")),
    ...splitRoles(element.getAttribute("data-requires-role")),
    ...splitRoles(element.getAttribute("data-requires-roles")),
  ].filter(validSidebarRole);

  return unique(roles);
}

function elementIsAdminOnly(element = null) {
  if (!isElement(element)) return false;

  if (
    attrIsTrue(element, "data-admin-only") ||
    attrIsTrue(element, "data-sidebar-admin-only")
  ) {
    return true;
  }

  const route = elementRoute(element);

  if (route && isSidebarAdminFallbackRoute(route)) {
    return true;
  }

  const roles = elementRequiredRoles(element);

  return roles.includes(SIDEBAR_ROLE_ADMIN) && !roles.includes(SIDEBAR_ROLE_USER);
}

function elementIsRoleManaged(element = null) {
  if (!isElement(element)) return false;

  return Boolean(
    elementIsAdminOnly(element) ||
      elementRequiredRoles(element).length > 0
  );
}

function userCanSeeElement(element = null, role = SIDEBAR_ROLE_USER) {
  if (!elementIsRoleManaged(element)) return true;
  if (role === SIDEBAR_ROLE_ADMIN) return true;
  if (elementIsAdminOnly(element)) return false;

  const roles = elementRequiredRoles(element);

  if (!roles.length) return true;

  return roles.includes(SIDEBAR_ROLE_USER);
}

function roleVisibilityTarget(element = null) {
  if (!isElement(element)) return null;

  return element.closest?.(`.${SIDEBAR_CLASSES.item}`) || element;
}

/* =========================================================
   ROLE DOM
========================================================= */

function setElementRoleVisible(element = null, visible = true) {
  if (!isElement(element)) return false;

  const target = roleVisibilityTarget(element);
  const show = Boolean(visible);

  if (!target) return false;

  setHidden(target, !show);

  try {
    element.dataset.roleVisible = show ? "true" : "false";
    target.dataset.roleVisible = show ? "true" : "false";

    element.classList.toggle(SIDEBAR_CLASSES.disabled, !show);
    target.classList.toggle(SIDEBAR_CLASSES.hidden, !show);

    if (!show) {
      setActiveLink(element, false);
      element.setAttribute("aria-disabled", "true");
      element.tabIndex = -1;
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

function roleManagedElements(root = getSidebarRoot()) {
  if (!isElement(root)) return [];

  const explicit = queryAll(
    [
      "[data-admin-only]",
      "[data-sidebar-admin-only]",
      "[data-role]",
      "[data-roles]",
      "[data-required-role]",
      "[data-required-roles]",
      "[data-requires-role]",
      "[data-requires-roles]",
    ].join(","),
    root
  );

  const adminRouteLinks = queryAll(SIDEBAR_SELECTORS.navLink, root).filter(
    (element) => {
      const route = elementRoute(element);
      return route && isSidebarAdminFallbackRoute(route);
    }
  );

  return unique([...explicit, ...adminRouteLinks]);
}

function clearHiddenActiveLinks(root = getSidebarRoot()) {
  if (!isElement(root)) return 0;

  let cleared = 0;

  const links = queryAll(
    [
      `${SIDEBAR_SELECTORS.navLink}.${SIDEBAR_CLASSES.active}`,
      `${SIDEBAR_SELECTORS.navLink}[aria-current]`,
      `${SIDEBAR_SELECTORS.link}.${SIDEBAR_CLASSES.active}`,
      `${SIDEBAR_SELECTORS.link}[aria-current]`,
    ].join(","),
    root
  );

  for (const link of links) {
    const hiddenParent = link.closest?.("[hidden], [aria-hidden='true']");

    if (!hiddenParent) continue;

    if (setActiveLink(link, false)) cleared += 1;
  }

  return cleared;
}

/* =========================================================
   ROLE VISIBILITY
========================================================= */

export function getSidebarVisibilityRole(context = {}) {
  const explicit = first(context.role, context.user?.role);

  if (explicit) return normalizeSidebarRole(explicit);

  return getSidebarUserRole(context);
}

export function applyRoleVisibility(context = {}) {
  const root = context.root || getSidebarRoot();

  if (!isElement(root)) return false;

  const role = getSidebarVisibilityRole(context);
  const elements = roleManagedElements(root);

  for (const element of elements) {
    setElementRoleVisible(element, userCanSeeElement(element, role));
  }

  clearHiddenActiveLinks(root);

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
    route: elementRoute(element),
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
    managedItems: elements.map(elementSnapshot),
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
