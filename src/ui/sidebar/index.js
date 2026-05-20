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
   - Usar dropdown.js para dropdown de cuenta.
   - Home visible: /@{user.slug}.
   - Home interna/canónica: /.
   - Rutas privadas visibles: /@{user.slug}/{ruta}.
   - Sin HTML duplicado.
   - Sin helpers DOM duplicados.
   - Sin lógica de usuario duplicada.
   - Sin navegación propia duplicada.
   - Sin HTTP.
   - Sin Toast.
   - Sin Store propio.
   - Sin /home.
   - Sin rutas legacy.
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";
import { Router } from "../../router/index.js";
import { getImmutableRoutes } from "../../router/routes.js";

import {
  HOME_ROUTE,
  SIDEBAR_BRAND_HREF,
  SIDEBAR_BRAND_LABEL,
  SIDEBAR_MODULE_KEY,
  SIDEBAR_MODULE_NAME,
  SIDEBAR_ROLE_ADMIN,
  SIDEBAR_ROOT_ID,
  USER_HOME_PREFIX,
  getSidebarRouteIcon,
  getSidebarRouteLabel,
  getSidebarRouteOrder,
  isSidebarHomeRoute,
  isSidebarPublicRoute,
  normalizeSidebarPath,
  normalizeSidebarSlug,
  sidebarHomeLookupPath,
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

import {
  bindSidebarDropdown,
  unbindSidebarDropdown,
} from "./dropdown.js";

export const SIDEBAR_UI_VERSION = "sidebar.ui.v6";

let syncing = false;

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function firstText(...values) {
  for (const value of values) {
    const output = String(value ?? "").trim();
    if (output) return output;
  }

  return "";
}

function redact(value = "") {
  return String(value || "")
    .replace(/([?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=/i.test(
    String(value || "")
  );
}

function normalizeHashPath(path = HOME_ROUTE) {
  const value = String(path || HOME_ROUTE).trim();

  if (value.startsWith("#!")) {
    return value.replace(/^#!\/?/, "/") || HOME_ROUTE;
  }

  if (value.startsWith("#/")) {
    return value.slice(1) || HOME_ROUTE;
  }

  return value;
}

function isUnsafePath(path = "") {
  const raw = String(path || "").trim();
  const lower = raw.toLowerCase();

  return Boolean(
    !raw ||
      raw.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:/i.test(raw) ||
      /[\r\n\t\\]/.test(raw) ||
      hasSensitiveQuery(raw) ||
      lower.startsWith("javascript:") ||
      lower.startsWith("data:") ||
      lower.startsWith("vbscript:") ||
      lower.startsWith("mailto:") ||
      lower.startsWith("tel:") ||
      lower.startsWith("file:") ||
      lower.startsWith("blob:")
  );
}

function safeSidebarPath(path = HOME_ROUTE, fallback = HOME_ROUTE) {
  let raw = normalizeHashPath(path || fallback);

  if (raw.startsWith("#") && !raw.startsWith("#/") && !raw.startsWith("#!")) {
    raw = fallback;
  }

  if (isUnsafePath(raw)) {
    raw = fallback;
  }

  if (!raw.startsWith("/")) {
    raw = `/${raw}`;
  }

  const normalized = normalizeSidebarPath(raw || fallback);
  const canonical = normalized.split("?")[0].split("#")[0] || HOME_ROUTE;

  if (canonical === "/home") {
    return normalizeSidebarPath(fallback === "/home" ? HOME_ROUTE : fallback);
  }

  return normalized || normalizeSidebarPath(fallback || HOME_ROUTE);
}

/* =========================================================
   ROUTER HREF
========================================================= */

function userHomeHref(context = {}, fallback = SIDEBAR_BRAND_HREF) {
  const slug = normalizeSidebarSlug(context.user?.slug || "");

  if (slug) {
    return `${USER_HOME_PREFIX}${slug}`;
  }

  return safeSidebarPath(fallback || HOME_ROUTE, HOME_ROUTE);
}

function routerPublicPath(path = HOME_ROUTE, context = {}) {
  const lookupPath = sidebarHomeLookupPath(
    safeSidebarPath(path || HOME_ROUTE, HOME_ROUTE)
  );

  if (isFunction(Router?.buildPublicPath)) {
    try {
      const built = safeSidebarPath(
        Router.buildPublicPath(lookupPath, {
          useSlugHome: true,
          useSlugPrivate: true,
        }),
        ""
      );

      if (built) return built;
    } catch {
      // fallback abajo
    }
  }

  if (lookupPath === HOME_ROUTE) {
    return userHomeHref(context, HOME_ROUTE);
  }

  const home = userHomeHref(context, HOME_ROUTE);

  if (home.startsWith(USER_HOME_PREFIX)) {
    return safeSidebarPath(`${home}${lookupPath}`, lookupPath);
  }

  return safeSidebarPath(lookupPath, HOME_ROUTE);
}

function routeHref(path = HOME_ROUTE, context = {}) {
  return routerPublicPath(path, context);
}

/* =========================================================
   ROUTE / SESSION CONTEXT
========================================================= */

function browserPath() {
  if (!isBrowser()) return HOME_ROUTE;

  try {
    return `${window.location.pathname || HOME_ROUTE}${window.location.search || ""}${window.location.hash || ""}`;
  } catch {
    return HOME_ROUTE;
  }
}

function currentPublicPath() {
  try {
    return safeSidebarPath(
      Router?.getCurrentPublicPath?.() ||
        Router?.getCurrentPath?.() ||
        AppCore?.state?.publicPath ||
        browserPath(),
      HOME_ROUTE
    );
  } catch {
    return safeSidebarPath(browserPath(), HOME_ROUTE);
  }
}

function currentCanonicalPath() {
  try {
    return sidebarHomeLookupPath(
      Router?.getCurrentCanonicalPath?.() ||
        AppCore?.state?.canonicalPath ||
        AppCore?.state?.route ||
        currentPublicPath()
    );
  } catch {
    return HOME_ROUTE;
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

function getCurrentRoute(path = currentCanonicalPath()) {
  const current = sidebarHomeLookupPath(path);

  return (
    getRoutes().find((route) => {
      if (!route?.path) return false;
      return sidebarHomeLookupPath(route.path) === current;
    }) || null
  );
}

function isAuthenticated() {
  try {
    if (isFunction(Auth?.isAuthenticated)) {
      return Auth.isAuthenticated() === true;
    }

    return AppCore?.state?.authenticated === true;
  } catch {
    return false;
  }
}

function getContext() {
  const publicPath = currentPublicPath();
  const canonicalPath = currentCanonicalPath();

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

    publicPath,
    canonicalPath,
    path: publicPath,
    currentPath: publicPath,

    route: getCurrentRoute(canonicalPath),

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
    .flat(Infinity)
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

function isPublicRoute(route = null, path = HOME_ROUTE) {
  return Boolean(
    isSidebarPublicRoute(path) ||
      route?.public === true ||
      route?.hideShell === true ||
      route?.shell === false ||
      route?.layout === "auth" ||
      route?.authScreen === true
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

function isActivePath(routePath = HOME_ROUTE, current = currentPublicPath()) {
  const path = sidebarHomeLookupPath(routePath);
  const active = sidebarHomeLookupPath(current);

  if (path === HOME_ROUTE) {
    return active === HOME_ROUTE || isSidebarHomeRoute(current);
  }

  return active === path || active.startsWith(`${path}/`);
}

function toSidebarItem(route = null, index = 0, context = getContext()) {
  if (!isObject(route) || !route.path) return null;

  const path = sidebarHomeLookupPath(route.path);

  if (!path || path === "/home") return null;

  if (isPublicRoute(route, path) || isHiddenRoute(route)) {
    return null;
  }

  const adminOnly = isAdminRoute(route);

  if (adminOnly && context.user?.isAdmin !== true) {
    return null;
  }

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

  const href = routeHref(path, context);

  if (!href || href === "/home") return null;

  return {
    key: firstText(route.sidebarKey, route.viewKey, route.name, path),
    order: getSidebarRouteOrder(path, explicitOrder),

    href,
    label: getSidebarRouteLabel(path, explicitLabel),
    icon: getSidebarRouteIcon(path, explicitIcon),

    active: isActivePath(path, context.publicPath),
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
      const lookupPath = sidebarHomeLookupPath(item.href);

      if (!lookupPath || seen.has(lookupPath)) return false;

      seen.add(lookupPath);
      return true;
    })
    .sort((left, right) => {
      return left.order - right.order || left.href.localeCompare(right.href);
    })
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

    if (SIDEBAR_MODULE_NAME && SIDEBAR_MODULE_NAME !== SIDEBAR_MODULE_KEY) {
      AppCore.modules?.register?.(SIDEBAR_MODULE_NAME, api);
    }

    return true;
  } catch {
    return false;
  }
}

function unregisterModule() {
  try {
    if (AppCore.ui?.sidebar === api) {
      delete AppCore.ui.sidebar;
    }

    AppCore.modules?.remove?.(SIDEBAR_MODULE_KEY);

    if (SIDEBAR_MODULE_NAME && SIDEBAR_MODULE_NAME !== SIDEBAR_MODULE_KEY) {
      AppCore.modules?.remove?.(SIDEBAR_MODULE_NAME);
    }

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   RENDER / SYNC
========================================================= */

function unbindAllSidebarDom() {
  const root = getSidebarRoot();

  try {
    unbindSidebarDropdown(root);
  } catch {
    // noop
  }

  try {
    unbindSidebarEvents();
  } catch {
    // noop
  }

  return true;
}

function hideCurrentSidebar() {
  unbindAllSidebarDom();

  const root = getSidebarRoot();

  if (root) {
    hideSidebarRoot(root);
  }

  markSidebarUnmounted(AppCore);
  clearSidebarDomCache(AppCore);

  return true;
}

function bindRenderedSidebar(root = null) {
  if (!isElement(root)) return false;

  bindSidebarEvents({
    AppCore,
    Auth,
    Router,
    root,
    sync,
  });

  bindSidebarDropdown(root);

  return true;
}

function renderSidebar(context = getContext()) {
  unbindAllSidebarDom();

  const nextRoot = createSidebarTemplate({
    id: SIDEBAR_ROOT_ID,
    brandLabel: SIDEBAR_BRAND_LABEL,
    brandHref: userHomeHref(context, SIDEBAR_BRAND_HREF),
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

  bindRenderedSidebar(mountedRoot);

  markSidebarMounted(mountedRoot, AppCore);

  return true;
}

function sync() {
  if (!isBrowser()) return api;
  if (syncing) return api;

  syncing = true;

  try {
    const context = getContext();

    if (!shouldRenderSidebar(context)) {
      hideCurrentSidebar();
      return api;
    }

    if (!renderSidebar(context)) {
      markSidebarUnmounted(AppCore);
    }

    return api;
  } finally {
    syncing = false;
  }
}

/* =========================================================
   ACTION WRAPPERS
========================================================= */

async function navigateTo(path = HOME_ROUTE, options = {}) {
  const target = routeHref(path, getContext());

  if (!target) return false;

  const ok = await navigateFromSidebar({
    AppCore,
    Auth,
    Router,
    root: getSidebarRoot(),
    target,
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
  unbindAllSidebarDom();

  const root = getSidebarRoot();

  if (root) {
    hideSidebarRoot(root);
  }

  resetSidebarState(AppCore);
  clearSidebarDomCache(AppCore);
  unregisterModule();

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

    publicPath: redact(context.publicPath),
    canonicalPath: redact(context.canonicalPath),
    homeHref: redact(userHomeHref(context, SIDEBAR_BRAND_HREF)),

    hasSession: context.hasSession,
    isAdmin: context.user?.isAdmin === true,

    user: context.user?.hasUser
      ? {
          slug: context.user.slug || null,
          username: context.user.username || null,
          displayName: context.user.displayName,
          role: context.user.role,
        }
      : null,

    menuItems: items.map((item) => ({
      href: redact(item.href),
      label: item.label,
      icon: item.icon,
      active: item.active,
      adminOnly: item.adminOnly === true,
    })),

    policy: {
      controllerOnly: true,

      usesRouterRoutes: true,
      usesTemplate: true,
      usesUserViewModel: true,
      usesVisibility: true,
      usesRuntimeState: true,
      usesActions: true,
      usesDelegatedEvents: true,
      usesDropdown: true,

      userSlugHome: true,
      userScopedPrivateRoutes: true,
      noHomeRoute: true,
      noSensitiveRoutes: true,

      noHtmlDuplicate: true,
      noDomHelpersDuplicate: true,
      noUserLogicDuplicate: true,
      noNavigationDuplicate: true,

      noHttp: true,
      noToast: true,
      noStoreOwn: true,
      noImportSideEffectRegistration: true,
    },
  };
}

const getDebugSnapshot = getSnapshot;

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
  getDebugSnapshot,

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

export const SidebarUI = api;

export default SidebarUI;
