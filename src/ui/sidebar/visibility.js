/* =========================================================
   Onion Support - Sidebar Visibility
   Archivo: /src/ui/sidebar/visibility.js

   Responsabilidad:
   - Decidir si el sidebar debe mostrarse.
   - Aplicar visibilidad al root.
   - Aplicar visibilidad básica por rol admin/user.
   - Usar metadatos estáticos de rutas para ocultar rutas admin.
   - Clientes se oculta para user porque /clientes es ruta admin.
   - Usuarios se oculta para user porque /usuarios es ruta admin.
   - Servidor se oculta para user porque /servidor es ruta admin.
   - Rutas públicas ocultan sidebar.
   - Rutas bloqueadas/sensibles ocultan sidebar.
   - Bloqueos delegados en constants.js -> core/config.js.
   - Sesión válida obligatoria.
   - Entender rutas visibles /@{slug}/{ruta}.
   - No navegar.
   - No hacer logout.
   - No leer Auth directamente.
   - No leer Router runtime directamente.
   - No emitir eventos.
   - No crear DOM.
   - No reparar estructuras legacy.
   - No gestionar comportamiento de dropdown.
   - Sin avatar.
   - Sin denylist local.
   - Sin /home.
   - Sin /403.
   - Sin /404.
   - Sin 2FA/MFA/OTP.
========================================================= */

import {
  SIDEBAR_CLASSES,
  SIDEBAR_ROLE_ADMIN,
  SIDEBAR_ROLE_USER,
  isSidebarAdminFallbackRoute,
  isSidebarBlockedRoute,
  isSidebarPublicRoute,
  getSidebarUserScopedRouteInfo,
  sidebarHomeLookupPath,
} from "./constants.js";

import {
  getSidebarRoot,
  isElement,
  setHidden,
} from "./dom.js";

import {
  getSidebarUserRole,
} from "./user.js";

import {
  getImmutableRoutes,
  resolveRouteLookupPath,
  isAdminRoutePath,
} from "../../router/routes.js";

export const SIDEBAR_VISIBILITY_VERSION = "sidebar.visibility.v8";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

function redact(value = "") {
  return text(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i.test(
    String(value || "")
  );
}

/* =========================================================
   ROLES
========================================================= */

function normalizeRoleStrict(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRoleStrict).filter(Boolean);

    if (roles.includes(SIDEBAR_ROLE_ADMIN)) return SIDEBAR_ROLE_ADMIN;
    if (roles.includes(SIDEBAR_ROLE_USER)) return SIDEBAR_ROLE_USER;

    return "";
  }

  const role = String(value || "").trim().toLowerCase();

  if (role === SIDEBAR_ROLE_ADMIN) return SIDEBAR_ROLE_ADMIN;
  if (role === SIDEBAR_ROLE_USER) return SIDEBAR_ROLE_USER;

  return "";
}

function splitRoles(value = "") {
  if (Array.isArray(value)) {
    return unique(
      value
        .flat(Infinity)
        .map(normalizeRoleStrict)
        .filter(Boolean)
    );
  }

  return unique(
    text(value, "")
      .split(/[,\s|;]+/)
      .map(normalizeRoleStrict)
      .filter(Boolean)
  );
}

function validSidebarRole(role = "") {
  return role === SIDEBAR_ROLE_ADMIN || role === SIDEBAR_ROLE_USER;
}

/* =========================================================
   PATH
========================================================= */

function routeLookupPath(path = "/") {
  if (!path || hasSensitiveQuery(path)) return "";

  const scoped = getSidebarUserScopedRouteInfo(path);

  if (scoped?.blocked === true) return "";

  if (scoped?.scoped === true && scoped.restPath) {
    if (isSidebarBlockedRoute(scoped.restPath)) return "";
  }

  const lookup = sidebarHomeLookupPath(path);

  if (!lookup || isSidebarBlockedRoute(lookup)) return "";

  return lookup;
}

function pathIsBlocked(path = "") {
  if (!path) return true;
  if (hasSensitiveQuery(path)) return true;
  if (isSidebarBlockedRoute(path)) return true;

  const scoped = getSidebarUserScopedRouteInfo(path);

  if (scoped?.blocked === true) return true;

  if (scoped?.scoped === true && scoped.restPath) {
    return isSidebarBlockedRoute(scoped.restPath);
  }

  return false;
}

/* =========================================================
   STATIC ROUTE META
========================================================= */

function getStaticRouteByPath(path = "") {
  const lookupPath = routeLookupPath(path || "/");

  if (!lookupPath) return null;

  try {
    const finalPath = isFunction(resolveRouteLookupPath)
      ? resolveRouteLookupPath(lookupPath)
      : lookupPath;

    if (!finalPath || pathIsBlocked(finalPath)) return null;

    const routes = isFunction(getImmutableRoutes)
      ? getImmutableRoutes()
      : [];

    return routes.find((route) => {
      return Boolean(
        route &&
          (
            route.path === finalPath ||
            route.canonicalPath === finalPath
          )
      );
    }) || null;
  } catch {
    return null;
  }
}

function staticRouteIsAdminPath(path = "") {
  const lookupPath = routeLookupPath(path || "/");

  if (!lookupPath || pathIsBlocked(lookupPath)) return false;

  try {
    return isFunction(isAdminRoutePath) && isAdminRoutePath(lookupPath) === true;
  } catch {
    return false;
  }
}

function staticRouteRoles(route = null) {
  if (!isObject(route)) return [];

  return unique([
    ...splitRoles(route.role),
    ...splitRoles(route.roles),
    ...splitRoles(route.meta?.role),
    ...splitRoles(route.meta?.roles),
  ].filter(validSidebarRole));
}

function staticRouteRequiredRoles(path = "") {
  const lookupPath = routeLookupPath(path || "");
  const route = getStaticRouteByPath(lookupPath);

  return unique([
    ...staticRouteRoles(route),
    ...(staticRouteIsAdminPath(lookupPath) || isSidebarAdminFallbackRoute(lookupPath)
      ? [SIDEBAR_ROLE_ADMIN]
      : []),
  ].filter(validSidebarRole));
}

function staticRouteIsAdminOnly(path = "") {
  const lookupPath = routeLookupPath(path || "");

  if (!lookupPath) return false;
  if (isSidebarAdminFallbackRoute(lookupPath)) return true;
  if (staticRouteIsAdminPath(lookupPath)) return true;

  const route = getStaticRouteByPath(lookupPath);

  if (!route) return false;

  if (
    route.adminOnly === true ||
    route.requiresAdmin === true ||
    route.admin === true ||
    route.meta?.adminOnly === true ||
    route.meta?.requiresAdmin === true ||
    route.meta?.admin === true
  ) {
    return true;
  }

  const roles = staticRouteRoles(route);

  return roles.includes(SIDEBAR_ROLE_ADMIN) && !roles.includes(SIDEBAR_ROLE_USER);
}

/* =========================================================
   CONTEXT
========================================================= */

export function getSidebarVisibilityPath(context = {}) {
  const AppCore = context.AppCore || null;
  const route = context.route || null;
  const state = isObject(AppCore?.state) ? AppCore.state : {};

  const value = first(
    context.canonicalPath,
    context.path,
    context.currentPath,
    context.publicPath,

    typeof route === "string" ? route : "",
    isObject(route) ? route.canonicalPath || route.path : "",

    state.canonicalPath,
    typeof state.route === "string" ? state.route : "",
    isObject(state.route) ? state.route.canonicalPath || state.route.path : "",
    state.publicPath,

    isBrowser()
      ? `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
      : "/"
  );

  return routeLookupPath(value || "/");
}

export function isSidebarRoutePublic(context = {}) {
  const route = context.route || null;
  const path = getSidebarVisibilityPath(context);

  if (!path) return true;

  return Boolean(
    isSidebarPublicRoute(path) ||
      route?.public === true ||
      route?.guestOnly === true ||
      route?.publicOnly === true ||
      route?.hideShell === true ||
      route?.shell === false ||
      route?.layout === "auth" ||
      route?.authScreen === true
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
      route?.layout === "auth" ||
      route?.authScreen === true ||
      state.chromeHidden === true ||
      state.shellHidden === true ||
      state.routeShellHidden === true ||
      state.routeMode === "auth"
  );
}

export function hasRenderableSidebarSession(context = {}) {
  const AppCore = context.AppCore || null;
  const state = isObject(AppCore?.state) ? AppCore.state : {};

  const contextSession = Boolean(
    context.hasSession === true ||
      context.sessionValid === true ||
      (
        context.authenticated === true &&
        context.hasUser === true
      )
  );

  const stateSession = Boolean(
    state.authenticated === true &&
      state.hasToken !== false &&
      Boolean(state.user || state.currentUser || state.authUser || state.sessionUser)
  );

  return Boolean(contextSession || stateSession);
}

export function shouldRenderSidebar(context = {}) {
  const path = getSidebarVisibilityPath(context);

  if (!path) return false;
  if (pathIsBlocked(path)) return false;
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
    root.dataset.sidebarVisible = show ? "true" : "false";
    root.dataset.sidebarVisibilityState = show ? "visible" : "hidden";
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

  if (!raw || hasSensitiveQuery(raw)) return "";

  return routeLookupPath(raw);
}

function elementRequiredRoles(element = null) {
  if (!isElement(element)) return [];

  const path = elementPath(element);

  return unique([
    ...splitRoles(element.getAttribute("data-role")),
    ...splitRoles(element.getAttribute("data-roles")),
    ...splitRoles(element.getAttribute("data-required-role")),
    ...splitRoles(element.getAttribute("data-required-roles")),
    ...splitRoles(element.getAttribute("data-requires-role")),
    ...splitRoles(element.getAttribute("data-requires-roles")),
    ...staticRouteRequiredRoles(path),
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

  if (
    path &&
    (
      isSidebarAdminFallbackRoute(path) ||
      staticRouteIsAdminOnly(path)
    )
  ) {
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

  const routeManaged = [
    ...root.querySelectorAll("[data-route], [data-href], [data-to], a[href]"),
  ].filter((element) => {
    const path = elementPath(element);

    return Boolean(
      path &&
        (
          isSidebarAdminFallbackRoute(path) ||
          staticRouteIsAdminOnly(path) ||
          staticRouteRequiredRoles(path).length
        )
    );
  });

  return unique([...explicit, ...routeManaged]);
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
    target.dataset.sidebarRoleVisible = show ? "true" : "false";

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
  const AppCore = context.AppCore || null;
  const state = isObject(AppCore?.state) ? AppCore.state : {};

  const explicit = first(
    context.role,
    context.roles,
    context.user?.role,
    context.user?.roles,
    state.role,
    state.roles,
    state.user?.role,
    state.user?.roles,
    state.currentUser?.role,
    state.currentUser?.roles,
    getSidebarUserRole(context)
  );

  return normalizeRoleStrict(explicit) || SIDEBAR_ROLE_USER;
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

  const path = elementPath(element);

  return {
    tag: element.tagName?.toLowerCase?.() || "",
    route: redact(path),
    adminOnly: elementIsAdminOnly(element),
    requiredRoles: elementRequiredRoles(element),
    staticRouteRoles: staticRouteRequiredRoles(path),
    staticRouteAdminOnly: staticRouteIsAdminOnly(path),
    staticRouteAdminPath: staticRouteIsAdminPath(path),
    roleVisible: element.dataset?.roleVisible || "",
    hidden: Boolean(element.hidden),
    ariaHidden: element.getAttribute("aria-hidden") || "",
  };
}

export function getSidebarVisibilitySnapshot(context = {}) {
  const root = context.root || getSidebarRoot();
  const role = getSidebarVisibilityRole(context);
  const elements = roleManagedElements(root);
  const path = getSidebarVisibilityPath(context);

  return {
    version: SIDEBAR_VISIBILITY_VERSION,

    hasRoot: isElement(root),
    shouldRender: shouldRenderSidebar(context),

    path: redact(path),
    blockedPath: !path || pathIsBlocked(path),
    routePublic: isSidebarRoutePublic(context),
    shellHidden: isSidebarShellHidden(context),
    hasSession: hasRenderableSidebarSession(context),

    role,
    isAdmin: role === SIDEBAR_ROLE_ADMIN,

    managedCount: elements.length,
    managedItems: elements.map(elementSnapshot).filter(Boolean),

    policy: {
      visibilityOnly: true,

      noNavigation: true,
      noLogout: true,
      noAuthDirect: true,
      noRouterRuntimeDirect: true,
      noEvents: true,
      noDomCreate: true,
      noLegacyRepair: true,
      noDropdownBehavior: true,
      noAvatar: true,

      staticRoutesAsRoleSource: true,
      hidesAdminRoutesForUser: true,
      clientesAdminOnlyFromRoutes: true,
      usuariosAdminOnlyFromRoutes: true,
      servidorAdminOnlyFromRoutes: true,

      blocksRoutesViaConstantsAndCoreConfig: true,
      noLocalBlockedRouteList: true,

      blocksHomeAlias: true,
      blocks403Route: true,
      blocks404Route: true,
      noHomeRoute: true,
      no2fa: true,
      noMfa: true,
      noOtp: true,

      rolesStrict: true,
      userScopedPrivateRoutes: true,
      publicRoutesHideSidebar: true,
      sessionRequired: true,

      snapshotRedacted: true,
      noSensitiveRouteInSnapshot: true,
    },
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
