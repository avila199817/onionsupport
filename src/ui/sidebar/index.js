/* =========================================================
   Onion Support - Sidebar UI
   Archivo: /src/ui/sidebar/index.js

   Responsabilidad:
   - Orquestar el sidebar dentro del SPA.
   - Usar rutas reales desde router/routes.js.
   - Usar template.js para construir DOM.
   - Usar user.js para normalizar usuario/rol.
   - Usar visibility.js para decidir mostrar/ocultar.
   - Usar state.js para estado runtime.
   - Usar actions.js para navegar/logout/open/close.
   - Usar events.js para listener delegado.
   - Sin HTML duplicado.
   - Sin helpers DOM duplicados.
   - Sin lógica de usuario duplicada.
   - Sin navegación propia duplicada.
   - Sin dropdown.
   - Sin HTTP.
   - Sin Toast.
   - Sin Store propio.
   - Sin bridges globales.
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";
import { Router } from "../../router/index.js";
import { getImmutableRoutes } from "../../router/routes.js";

import {
  SIDEBAR_BRAND_HREF,
  SIDEBAR_BRAND_LABEL,
  SIDEBAR_MODULE_KEY,
  SIDEBAR_ROLE_ADMIN,
  SIDEBAR_ROOT_ID,
  canonicalSidebarPath,
  getSidebarRouteIcon,
  getSidebarRouteLabel,
  getSidebarRouteOrder,
  isSidebarPublicRoute,
  normalizeSidebarPath,
} from "./constants.js";

import {
  cacheSidebarDom,
  clearSidebarDomCache,
  getSidebarRoot,
  hideSidebarRoot,
  isBrowser,
  isElement,
  mountSidebarRoot,
} from "./dom.js";

import { createSidebarTemplate } from "./template.js";
import { getSidebarUser } from "./user.js";

import {
  shouldRenderSidebar,
  syncSidebarVisibility,
} from "./visibility.js";

import {
  getSidebarLogoutInFlight,
  getSidebarOpen,
  getSidebarState,
  markSidebarMounted,
  markSidebarUnmounted,
  resetSidebarState,
  setSidebarInitialized,
  setSidebarRoot,
  syncSidebarState,
} from "./state.js";

import {
  closeSidebar as closeSidebarAction,
  handleLogout as handleLogoutAction,
  navigateFromSidebar,
  openSidebar as openSidebarAction,
  setSidebarOpen as setSidebarOpenAction,
  toggleSidebar as toggleSidebarAction,
} from "./actions.js";

import {
  bindSidebarEvents,
  unbindSidebarEvents,
} from "./events.js";

export const SIDEBAR_UI_VERSION = "sidebar.ui.v2";

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function firstText(...values) {
  for (const value of values) {
    const output = String(value ?? "").trim();

    if (output) return output;
  }

  return "";
}

/* =========================================================
   ROUTE / SESSION CONTEXT
========================================================= */

function currentPath() {
  try {
    const routeState = AppCore?.state?.route;

    const routerPath =
      Router?.getCurrentCanonicalPath?.() ||
      Router?.getCurrentPath?.() ||
      (typeof Router?.currentPath === "function"
        ? Router.currentPath()
        : Router?.currentPath);

    const corePath =
      AppCore?.state?.canonicalPath ||
      (typeof routeState === "string" ? routeState : routeState?.path);

    const path =
      routerPath ||
      corePath ||
      (isBrowser() ? window.location.pathname : "/");

    return canonicalSidebarPath(path || "/");
  } catch {
    return isBrowser()
      ? canonicalSidebarPath(window.location.pathname || "/")
      : "/";
  }
}

function getRoutes() {
  try {
    const routes = getImmutableRoutes();
    return Array.isArray(routes) ? routes : [];
  } catch {
    return [];
  }
}

function getCurrentRoute(path = currentPath()) {
  const current = canonicalSidebarPath(path || "/");

  return getRoutes().find((route) => {
    if (!route?.path) return false;
    return canonicalSidebarPath(route.path) === current;
  }) || null;
}

function isAuthenticated() {
  try {
    if (typeof Auth?.isAuthenticated === "function") {
      return Auth.isAuthenticated() === true;
    }

    return AppCore?.state?.authenticated === true;
  } catch {
    return false;
  }
}

function getContext() {
  const path = currentPath();
  const user = getSidebarUser({
    AppCore,
    Auth,
  });

  const hasUser = user?.hasUser === true;
  const hasSession = hasUser && isAuthenticated();

  return {
    AppCore,
    Auth,
    Router,

    path,
    currentPath: path,
    route: getCurrentRoute(path),

    user,
    role: user?.role || "",
    hasUser,
    hasSession,
    sessionValid: hasSession,
    authenticated: hasSession,
  };
}

/* =========================================================
   MENU ITEMS
========================================================= */

function routeRoles(route = null) {
  return [
    route?.role,
    route?.roles,
    route?.meta?.role,
    route?.meta?.roles,
  ]
    .flat()
    .filter(Boolean)
    .map((role) => String(role).toLowerCase());
}

function isAdminRoute(route = null) {
  const roles = routeRoles(route);

  return Boolean(
    route?.admin === true ||
      route?.adminOnly === true ||
      route?.requiresAdmin === true ||
      route?.meta?.admin === true ||
      route?.meta?.adminOnly === true ||
      roles.includes(SIDEBAR_ROLE_ADMIN)
  );
}

function isPublicRoute(route = null, path = "/") {
  return Boolean(
    isSidebarPublicRoute(path) ||
      route?.public === true ||
      route?.hideShell === true ||
      route?.shell === false
  );
}

function isHiddenRoute(route = null) {
  return Boolean(
    route?.sidebar === false ||
      route?.showInSidebar === false ||
      route?.hideFromSidebar === true ||
      route?.menu === false ||
      route?.nav === false
  );
}

function isActivePath(routePath = "/", current = currentPath()) {
  const path = canonicalSidebarPath(routePath || "/");
  const active = canonicalSidebarPath(current || "/");

  if (path === "/") return active === "/";

  return active === path || active.startsWith(`${path}/`);
}

function toSidebarItem(route = null, index = 0, context = getContext()) {
  if (!isObject(route) || !route.path) return null;

  const path = canonicalSidebarPath(route.path);

  if (isPublicRoute(route, path) || isHiddenRoute(route)) return null;

  const adminOnly = isAdminRoute(route);

  if (adminOnly && context.user?.isAdmin !== true) return null;

  const explicitOrder =
    route.sidebarOrder ??
    route.navOrder ??
    route.menuOrder ??
    route.order ??
    route.meta?.order ??
    index;

  const explicitLabel = firstText(
    route.sidebarLabel,
    route.navLabel,
    route.menuLabel,
    route.title,
    route.label,
    route.name
  );

  const explicitIcon = firstText(
    route.sidebarIcon,
    route.navIcon,
    route.menuIcon,
    route.icon,
    route.meta?.icon
  );

  const href = normalizeSidebarPath(path);

  return {
    order: getSidebarRouteOrder(path, explicitOrder),
    href,
    label: getSidebarRouteLabel(path, explicitLabel),
    icon: getSidebarRouteIcon(path, explicitIcon),
    active: isActivePath(href, context.path),
    adminOnly,
    requiredRole: adminOnly ? SIDEBAR_ROLE_ADMIN : "",
    requiredRoles: adminOnly ? [SIDEBAR_ROLE_ADMIN] : [],
  };
}

function sidebarItems(context = getContext()) {
  const seen = new Set();

  return getRoutes()
    .map((route, index) => toSidebarItem(route, index, context))
    .filter(Boolean)
    .filter((item) => {
      const path = canonicalSidebarPath(item.href);

      if (seen.has(path)) return false;

      seen.add(path);
      return true;
    })
    .sort((a, b) => a.order - b.order)
    .map(({ order, ...item }) => item);
}

/* =========================================================
   CORE REGISTRATION
========================================================= */

function registerModule() {
  try {
    AppCore.ui = isObject(AppCore.ui) ? AppCore.ui : {};
    AppCore.ui.sidebar = api;

    AppCore.modules?.register?.(SIDEBAR_MODULE_KEY, api);

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   RENDER / SYNC
========================================================= */

function hideCurrentSidebar() {
  unbindSidebarEvents();

  const root = getSidebarRoot();

  if (root) {
    hideSidebarRoot(root);
  }

  markSidebarUnmounted(AppCore);
  clearSidebarDomCache(AppCore);

  return true;
}

function renderSidebar(context = getContext()) {
  unbindSidebarEvents();

  const nextRoot = createSidebarTemplate({
    id: SIDEBAR_ROOT_ID,
    brandLabel: SIDEBAR_BRAND_LABEL,
    brandHref: SIDEBAR_BRAND_HREF,
    open: getSidebarOpen(),
    items: sidebarItems(context),
    user: context.user,
  });

  if (!nextRoot) return false;

  const mountedRoot = mountSidebarRoot(nextRoot);

  if (!isElement(mountedRoot)) return false;

  setSidebarRoot(mountedRoot, AppCore);
  cacheSidebarDom(AppCore, mountedRoot);

  syncSidebarState({
    AppCore,
    root: mountedRoot,
  });

  syncSidebarVisibility({
    ...context,
    root: mountedRoot,
  });

  bindSidebarEvents({
    AppCore,
    Auth,
    Router,
    root: mountedRoot,
    sync,
  });

  markSidebarMounted(mountedRoot, AppCore);

  return true;
}

function sync() {
  if (!isBrowser()) return api;

  const context = getContext();

  if (!shouldRenderSidebar(context)) {
    hideCurrentSidebar();
    return api;
  }

  if (!renderSidebar(context)) {
    markSidebarUnmounted(AppCore);
  }

  return api;
}

/* =========================================================
   ACTION WRAPPERS
========================================================= */

async function navigateTo(path = "/", options = {}) {
  const ok = await navigateFromSidebar({
    AppCore,
    Auth,
    Router,
    root: getSidebarRoot(),
    target: path,
    ...options,
  });

  sync();

  return ok;
}

function setSidebarOpen(open = true) {
  const root = getSidebarRoot();

  const value = setSidebarOpenAction({
    AppCore,
    root,
    open,
  });

  syncSidebarState({
    AppCore,
    root,
  });

  return value;
}

function openSidebar() {
  const root = getSidebarRoot();

  const value = openSidebarAction({
    AppCore,
    root,
  });

  syncSidebarState({
    AppCore,
    root,
  });

  return value;
}

function closeSidebar() {
  const root = getSidebarRoot();

  const value = closeSidebarAction({
    AppCore,
    root,
  });

  syncSidebarState({
    AppCore,
    root,
  });

  return value;
}

function toggleSidebar() {
  const root = getSidebarRoot();

  const value = toggleSidebarAction({
    AppCore,
    root,
  });

  syncSidebarState({
    AppCore,
    root,
  });

  return value;
}

async function handleLogout(options = {}) {
  const result = await handleLogoutAction({
    AppCore,
    Auth,
    Router,
    root: getSidebarRoot(),
    ...options,
  });

  sync();

  return result;
}

function isAdmin() {
  return getContext().user?.isAdmin === true;
}

/* =========================================================
   LIFECYCLE
========================================================= */

function init() {
  registerModule();

  if (!getSidebarState().initialized) {
    setSidebarInitialized(true, AppCore);
  }

  return sync();
}

function destroy() {
  unbindSidebarEvents();

  const root = getSidebarRoot();

  if (root) {
    hideSidebarRoot(root);
  }

  resetSidebarState(AppCore);
  clearSidebarDomCache(AppCore);

  return api;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getSnapshot() {
  const context = getContext();
  const state = getSidebarState();
  const items = sidebarItems(context);

  return {
    version: SIDEBAR_UI_VERSION,

    initialized: state.initialized,
    mounted: state.mounted,
    open: state.open,
    collapsed: state.collapsed,
    logoutInFlight: getSidebarLogoutInFlight(),

    route: context.path,
    hasSession: context.hasSession,
    isAdmin: context.user?.isAdmin === true,

    user: context.user?.hasUser
      ? {
          id: context.user.id,
          userId: context.user.userId,
          username: context.user.username || null,
          displayName: context.user.displayName,
          role: context.user.role,
        }
      : null,

    menuItems: items.map((item) => ({
      href: item.href,
      label: item.label,
      icon: item.icon,
      active: item.active,
      adminOnly: item.adminOnly === true,
    })),
  };
}

/* =========================================================
   API
========================================================= */

const api = {
  version: SIDEBAR_UI_VERSION,

  init,
  destroy,
  cleanup: destroy,

  sync,
  render: sync,
  refresh: sync,

  navigateTo,
  navigate: navigateTo,

  setSidebarOpen,
  openSidebar,
  closeSidebar,
  toggleSidebar,

  handleLogout,
  logout: handleLogout,

  isAdmin,

  getSnapshot,
  getState: getSnapshot,

  get initialized() {
    return getSidebarState().initialized;
  },

  get mounted() {
    return getSidebarState().mounted;
  },

  get logoutInFlight() {
    return getSidebarLogoutInFlight();
  },
};

registerModule();

export const SidebarUI = api;

export default SidebarUI;
