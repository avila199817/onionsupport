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
  text,
} from "./dom.js";

import { createSidebarTemplate } from "./template.js";

import {
  getSidebarUser,
} from "./user.js";

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

function isFunction(value) {
  return typeof value === "function";
}

/* =========================================================
   CURRENT ROUTE
========================================================= */

function currentPath() {
  try {
    const routerPath =
      Router?.getCurrentCanonicalPath?.() ||
      Router?.getCurrentPath?.() ||
      Router?.currentPath;

    if (routerPath) return canonicalSidebarPath(routerPath);
  } catch {
    // noop
  }

  try {
    const route = AppCore?.state?.route;

    if (typeof route === "string") return canonicalSidebarPath(route);
    if (isObject(route) && route.path) return canonicalSidebarPath(route.path);

    if (AppCore?.state?.canonicalPath) {
      return canonicalSidebarPath(AppCore.state.canonicalPath);
    }
  } catch {
    // noop
  }

  return isBrowser() ? canonicalSidebarPath(window.location.pathname || "/") : "/";
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
  return getRoutes().find((route) => {
    if (!route?.path) return false;

    return canonicalSidebarPath(route.path) === canonicalSidebarPath(path);
  }) || null;
}

/* =========================================================
   SESSION
========================================================= */

function hasAuthToken() {
  try {
    if (Auth?.isAuthenticated?.() === false) return false;
  } catch {
    // noop
  }

  try {
    const session = isFunction(Auth?.getSession) ? Auth.getSession() : null;

    const token =
      Auth?.getToken?.() ||
      Auth?.getAccessToken?.() ||
      Auth?.token ||
      Auth?.accessToken ||
      session?.token ||
      session?.accessToken ||
      AppCore?.state?.token ||
      AppCore?.state?.accessToken ||
      AppCore?.state?.session?.token ||
      AppCore?.state?.session?.accessToken;

    if (text(token, "")) return true;
  } catch {
    // noop
  }

  try {
    return Auth?.isAuthenticated?.() === true;
  } catch {
    return false;
  }
}

function getContext() {
  const path = currentPath();
  const route = getCurrentRoute(path);
  const user = getSidebarUser({
    AppCore,
    Auth,
  });

  const hasUser = user.hasUser === true;
  const hasSession = hasAuthToken() && hasUser;

  return {
    AppCore,
    Auth,
    Router,

    path,
    currentPath: path,
    route,

    user,
    role: user.role,
    hasUser,
    hasSession,
    sessionValid: hasSession,
    authenticated: hasSession,
  };
}

/* =========================================================
   ROUTE MENU
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

function routeRequiresAdmin(route = null) {
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

function routeIsPublic(route = null) {
  const path = canonicalSidebarPath(route?.path || "/");

  return Boolean(
    isSidebarPublicRoute(path) ||
      route?.public === true ||
      route?.hideShell === true ||
      route?.shell === false
  );
}

function routeVisibleInSidebar(route = null) {
  if (!isObject(route)) return false;
  if (!route.path) return false;
  if (routeIsPublic(route)) return false;

  return !(
    route.sidebar === false ||
    route.showInSidebar === false ||
    route.hideFromSidebar === true ||
    route.menu === false ||
    route.nav === false
  );
}

function routeAllowed(route = null, context = getContext()) {
  if (routeRequiresAdmin(route)) {
    return context.user?.isAdmin === true;
  }

  return true;
}

function routeOrder(route = null, index = 0) {
  const path = canonicalSidebarPath(route?.path || "/");

  const explicitOrder =
    route?.sidebarOrder ??
    route?.navOrder ??
    route?.menuOrder ??
    route?.order ??
    route?.meta?.order ??
    null;

  return getSidebarRouteOrder(path, explicitOrder ?? index);
}

function routeLabel(route = null) {
  const path = canonicalSidebarPath(route?.path || "/");

  const explicitLabel =
    route?.sidebarLabel ||
    route?.navLabel ||
    route?.menuLabel ||
    route?.title ||
    route?.label ||
    route?.name ||
    "";

  return getSidebarRouteLabel(path, explicitLabel);
}

function routeIcon(route = null) {
  const path = canonicalSidebarPath(route?.path || "/");

  const explicitIcon =
    route?.sidebarIcon ||
    route?.navIcon ||
    route?.menuIcon ||
    route?.icon ||
    route?.meta?.icon ||
    "";

  return getSidebarRouteIcon(path, explicitIcon);
}

function routeActive(routePath = "/", current = currentPath()) {
  const path = canonicalSidebarPath(routePath);

  if (path === "/") return current === "/";

  return current === path || current.startsWith(`${path}/`);
}

function sidebarRoutes(context = getContext()) {
  const seen = new Set();

  return getRoutes()
    .map((route, index) => ({ route, index }))
    .filter(({ route }) => routeVisibleInSidebar(route))
    .filter(({ route }) => routeAllowed(route, context))
    .filter(({ route }) => {
      const path = canonicalSidebarPath(route.path);

      if (seen.has(path)) return false;

      seen.add(path);
      return true;
    })
    .sort((a, b) => routeOrder(a.route, a.index) - routeOrder(b.route, b.index))
    .map(({ route }) => route);
}

function sidebarItems(context = getContext()) {
  const current = context.path || currentPath();

  return sidebarRoutes(context).map((route) => {
    const href = normalizeSidebarPath(route.path);
    const adminOnly = routeRequiresAdmin(route);

    return {
      href,
      label: routeLabel(route),
      icon: routeIcon(route),
      active: routeActive(href, current),
      adminOnly,
      requiredRole: adminOnly ? SIDEBAR_ROLE_ADMIN : "",
      requiredRoles: adminOnly ? [SIDEBAR_ROLE_ADMIN] : [],
    };
  });
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

  const existingRoot = getSidebarRoot();

  if (existingRoot) {
    hideSidebarRoot(existingRoot);
  }

  markSidebarUnmounted(AppCore);
  clearSidebarDomCache(AppCore);

  return true;
}

function renderSidebar(context = getContext()) {
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
  registerModule();

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
  const value = setSidebarOpenAction({
    AppCore,
    root: getSidebarRoot(),
    open,
  });

  syncSidebarState({
    AppCore,
    root: getSidebarRoot(),
  });

  return value;
}

function openSidebar() {
  return openSidebarAction({
    AppCore,
    root: getSidebarRoot(),
  });
}

function closeSidebar() {
  return closeSidebarAction({
    AppCore,
    root: getSidebarRoot(),
  });
}

function toggleSidebar() {
  return toggleSidebarAction({
    AppCore,
    root: getSidebarRoot(),
  });
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
  if (getSidebarState().initialized) {
    return sync();
  }

  setSidebarInitialized(true, AppCore);
  registerModule();

  return sync();
}

function destroy() {
  unbindSidebarEvents();

  const existingRoot = getSidebarRoot();

  if (existingRoot) {
    hideSidebarRoot(existingRoot);
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

    menuItems: sidebarItems(context).map((item) => ({
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
