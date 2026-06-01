/* =========================================================
   Onion Support - Sidebar UI
   Archivo: /src/ui/sidebar/index.js

   Responsabilidad:
   - Controlador mínimo del sidebar.
   - Montar en #sidebar-mount.
   - Calcular usuario, rutas visibles y estado open/collapsed.
   - Consumir template.js para TODO el DOM visual.
   - Conectar callbacks de template: toggle/dropdown/logout.
   - Dejar navegación normal en Router global vía data-spa/data-route.
   - Delegar logout en Auth.
   - Sin construir HTML visual.
   - Sin guards.
   - Sin HTTP.
   - Sin Toast.
   - Sin Store.
   - Sin Services.
   - Sin rutas inventadas.
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth as DefaultAuth } from "../../features/auth/index.js";
import { Router as DefaultRouter } from "../../router/index.js";

import {
  ROUTES,
  USER_HOME_PREFIX,
  buildUserHomeRoute,
  buildUserScopedRoute,
  isBlockedRoutePath,
  normalizeRoutePath,
  normalizeUserSlug,
} from "../../core/config.js";

import { getImmutableRoutes } from "../../router/routes.js";

import {
  createSidebarTemplate,
  bindSidebarTemplate,
  unbindSidebarTemplate,
  setSidebarTemplateOpen,
  closeSidebarDropdown,
} from "./template.js";

export const SIDEBAR_VERSION = "sidebar.controller.v2";

const SIDEBAR_ROOT_ID = "app-sidebar";
const SIDEBAR_MOUNT_ID = "sidebar-mount";
const BRAND_LABEL = "Onion Support";

let initialized = false;
let mounted = false;
let sidebarOpen = true;
let logoutInFlight = false;

let root = null;
let cleanupTemplate = null;

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

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
}

/* =========================================================
   DOM
========================================================= */

function byId(id = "") {
  if (!isBrowser() || !id) return null;

  return document.getElementById(id);
}

function getMount() {
  if (!isBrowser()) return null;

  return (
    byId(SIDEBAR_MOUNT_ID) ||
    document.querySelector?.("[data-sidebar-mount]") ||
    null
  );
}

function clear(node = null) {
  if (!node) return false;

  try {
    node.replaceChildren();
    return true;
  } catch {
    try {
      node.textContent = "";
      return true;
    } catch {
      return false;
    }
  }
}

function setHidden(node = null, hidden = false) {
  if (!node) return false;

  const value = Boolean(hidden);

  try {
    node.hidden = value;
    node.setAttribute("aria-hidden", value ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

function cacheDom() {
  try {
    const dom = isObject(AppCore.dom) ? AppCore.dom : null;

    if (!dom) return false;

    dom.sidebar = root;
    dom.appSidebar = root;
    dom.sidebarRoot = root;
    dom.sidebarMount = byId(SIDEBAR_MOUNT_ID) || null;

    return true;
  } catch {
    return false;
  }
}

function clearDomCache() {
  try {
    if (!isObject(AppCore.dom)) return false;

    delete AppCore.dom.sidebar;
    delete AppCore.dom.appSidebar;
    delete AppCore.dom.sidebarRoot;
    delete AppCore.dom.sidebarMount;

    return true;
  } catch {
    return false;
  }
}

function unbindTemplate() {
  try {
    cleanupTemplate?.();
  } catch {
    // noop
  }

  try {
    if (root) {
      unbindSidebarTemplate(root);
    }
  } catch {
    // noop
  }

  cleanupTemplate = null;

  return true;
}

/* =========================================================
   AUTH / ROUTER
========================================================= */

function getAuth() {
  return (
    AppCore.auth ||
    AppCore.Auth ||
    AppCore.getModule?.("auth") ||
    DefaultAuth ||
    null
  );
}

function getRouter() {
  return (
    AppCore.router ||
    AppCore.Router ||
    AppCore.getModule?.("router") ||
    DefaultRouter ||
    null
  );
}

function getAuthUser() {
  const auth = getAuth();

  try {
    return (
      auth?.getUser?.() ||
      auth?.getCurrentUser?.() ||
      AppCore.getCurrentUser?.() ||
      null
    );
  } catch {
    return null;
  }
}

function getRole() {
  const auth = getAuth();

  try {
    return (
      auth?.getRole?.() ||
      auth?.getCurrentRole?.() ||
      AppCore.getCurrentRole?.() ||
      ""
    );
  } catch {
    return "";
  }
}

function isAuthenticated() {
  const auth = getAuth();

  try {
    return auth?.isAuthenticated?.() === true || AppCore.isAuthenticated?.() === true;
  } catch {
    return false;
  }
}

function isAdmin() {
  const auth = getAuth();

  try {
    return auth?.isAdmin?.() === true || getRole() === "admin";
  } catch {
    return false;
  }
}

/* =========================================================
   USER
========================================================= */

function safeImageUrl(value = "") {
  const raw = cleanText(value, "");

  if (!raw) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return "";

  if (raw.startsWith("/")) return raw;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);

      if (
        url.hostname === "api.onionit.net" ||
        url.hostname.endsWith(".onionit.net") ||
        url.hostname.endsWith(".blob.core.windows.net")
      ) {
        return url.toString();
      }
    } catch {
      return "";
    }
  }

  return "";
}

function initialsFrom(value = "") {
  return (
    cleanText(value, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 2) || "ON"
  );
}

function normalizeRole(value = "") {
  const role = cleanText(value, "").toLowerCase();

  return role === "admin" ? "admin" : "user";
}

function getUserViewModel() {
  const raw = getAuthUser();

  if (!raw || !isAuthenticated()) {
    return {
      hasUser: false,
      role: "",
      roles: [],
      isAdmin: false,
      isUser: false,
      displayName: "Usuario",
      initials: "ON",
      avatarUrl: "",
      hasAvatar: false,
      slug: "",
    };
  }

  const publicUser = isFunction(AppCore.publicUser)
    ? AppCore.publicUser(raw)
    : raw;

  const role = normalizeRole(
    publicUser?.role ||
      raw.role ||
      raw.rol ||
      getRole()
  );

  const displayName = cleanText(
    publicUser?.displayName ||
      publicUser?.fullName ||
      publicUser?.name ||
      raw.displayName ||
      raw.fullName ||
      raw.name ||
      raw.nombre ||
      raw.username ||
      "Usuario",
    "Usuario"
  );

  const slug = normalizeUserSlug(
    publicUser?.slug ||
      raw.slug ||
      raw.lookup?.slug ||
      raw.profile?.slug ||
      raw.username ||
      raw.userId ||
      raw.id ||
      ""
  );

  const avatarUrl = safeImageUrl(
    publicUser?.avatarUrl ||
      publicUser?.avatar ||
      publicUser?.picture ||
      publicUser?.photoUrl ||
      raw.avatarUrl ||
      raw.avatar ||
      raw.picture ||
      raw.photoUrl ||
      raw.profile?.avatarUrl ||
      ""
  );

  return {
    hasUser: true,

    id: publicUser?.id || raw.id || raw.userId || null,
    userId: publicUser?.userId || raw.userId || raw.id || null,

    username: publicUser?.username || raw.username || "",
    slug,

    displayName,
    name: displayName,

    role,
    rol: role,
    roles: [role],

    roleLabel: role === "admin" ? "Administrador" : "Estándar",

    isAdmin: role === "admin",
    isUser: role === "user",

    avatarUrl,
    hasAvatar: Boolean(avatarUrl),
    initials: initialsFrom(displayName),
  };
}

/* =========================================================
   PATHS
========================================================= */

function normalizePath(path = "/") {
  try {
    return normalizeRoutePath(path) || "/";
  } catch {
    let value = cleanText(path, "/")
      .split("?")[0]
      .split("#")[0]
      .replace(/\\/g, "/");

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    value = value.replace(/\/{2,}/g, "/");

    if (value.length > 1) {
      value = value.replace(/\/+$/g, "") || "/";
    }

    return value || "/";
  }
}

function routeLookupPath(path = "/") {
  const clean = normalizePath(path);

  if (!clean.startsWith(USER_HOME_PREFIX)) {
    return clean;
  }

  const rest = clean.slice(USER_HOME_PREFIX.length);
  const [, ...segments] = rest.split("/");

  return segments.length ? normalizePath(`/${segments.join("/")}`) : "/";
}

function currentPublicPath() {
  const router = getRouter();

  try {
    return (
      router?.getCurrentPublicPath?.() ||
      router?.getCurrentPath?.() ||
      AppCore.state?.publicPath ||
      (isBrowser()
        ? `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
        : "/")
    );
  } catch {
    return "/";
  }
}

function currentCanonicalPath() {
  const router = getRouter();

  try {
    return normalizePath(
      router?.getCurrentCanonicalPath?.() ||
        AppCore.state?.canonicalPath ||
        AppCore.state?.route ||
        routeLookupPath(currentPublicPath())
    );
  } catch {
    return "/";
  }
}

function isUnsafePath(path = "") {
  const raw = cleanText(path, "");
  const lower = raw.toLowerCase();

  return Boolean(
    !raw ||
      raw.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:/i.test(raw) ||
      /[\r\n\t\\]/.test(raw) ||
      /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i.test(raw) ||
      lower.startsWith("javascript:") ||
      lower.startsWith("data:") ||
      lower.startsWith("vbscript:")
  );
}

function safePath(path = "/", fallback = "/") {
  const raw = cleanText(path || fallback, fallback);

  if (isUnsafePath(raw)) return fallback;

  const normalized = normalizePath(raw);

  try {
    if (isBlockedRoutePath(normalized)) return fallback;
  } catch {
    return fallback;
  }

  return normalized || fallback;
}

function userHomeHref(user = getUserViewModel()) {
  const slug = normalizeUserSlug(user.slug || "");

  if (!slug) return "/";

  try {
    return buildUserHomeRoute(slug) || `${USER_HOME_PREFIX}${slug}`;
  } catch {
    return `${USER_HOME_PREFIX}${slug}`;
  }
}

function routeHref(routePath = "/", user = getUserViewModel()) {
  const path = safePath(routePath, "/");
  const slug = normalizeUserSlug(user.slug || "");

  if (!slug) return path;

  try {
    return buildUserScopedRoute(slug, path);
  } catch {
    return path === "/"
      ? `${USER_HOME_PREFIX}${slug}`
      : `${USER_HOME_PREFIX}${slug}${path}`;
  }
}

/* =========================================================
   MENU
========================================================= */

function routeIcon(path = "/") {
  const clean = normalizePath(path);

  if (clean === "/") return "home";
  if (clean === ROUTES.incidencias) return "incidencias";
  if (clean === ROUTES.facturas) return "facturas";
  if (clean === ROUTES.clientes) return "clientes";
  if (clean === ROUTES.usuarios) return "usuarios";
  if (clean === ROUTES.servidor) return "servidor";
  if (clean === ROUTES.cuenta) return "cuenta";
  if (clean === ROUTES.ajustes) return "ajustes";

  return "home";
}

function routeLabel(route = null) {
  const path = normalizePath(route?.path || "/");

  if (route?.title) return cleanText(route.title);
  if (route?.label) return cleanText(route.label);

  if (path === "/") return "Inicio";

  return cleanText(route?.name || path.replace(/^\/+/, ""), path);
}

function isRouteAdmin(route = null) {
  return Boolean(route?.adminOnly || route?.requiresAdmin);
}

function isRouteVisible(route = null, user = getUserViewModel()) {
  if (!user?.hasUser) return false;
  if (!route?.path) return false;

  if (route.public === true) return false;
  if (route.hideShell === true || route.layout === "auth") return false;
  if (route.showInSidebar === false || route.sidebar === false) return false;

  const path = normalizePath(route.path);

  if (!path) return false;

  try {
    if (isBlockedRoutePath(path)) return false;
  } catch {
    return false;
  }

  if (isRouteAdmin(route) && user.isAdmin !== true) return false;

  return true;
}

function isActive(path = "/", current = currentCanonicalPath()) {
  const itemPath = routeLookupPath(path);
  const activePath = routeLookupPath(current);

  if (itemPath === "/") {
    return activePath === "/";
  }

  return activePath === itemPath || activePath.startsWith(`${itemPath}/`);
}

function getMenuItems(context = getContext()) {
  if (!context.authenticated || !context.user?.hasUser) return [];

  const user = context.user;
  const seen = new Set();

  return getImmutableRoutes()
    .filter((route) => isRouteVisible(route, user))
    .map((route, index) => {
      const path = normalizePath(route.path);
      const lookup = routeLookupPath(path);

      if (seen.has(lookup)) return null;

      seen.add(lookup);

      return {
        key: cleanText(route.sidebarKey || route.viewKey || route.name || lookup, lookup),
        href: routeHref(path, user),
        path,
        label: routeLabel(route),
        icon: routeIcon(path),
        active: isActive(path, context.canonicalPath),
        adminOnly: isRouteAdmin(route),
        order: Number(route.order || index || 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order || a.href.localeCompare(b.href));
}

/* =========================================================
   CONTEXT / VISIBILITY
========================================================= */

function getCurrentRoute() {
  const router = getRouter();

  try {
    return router?.getCurrentRoute?.() || null;
  } catch {
    return null;
  }
}

function getContext() {
  const auth = getAuth();
  const router = getRouter();
  const user = getUserViewModel();

  return {
    AppCore,
    Auth: auth,
    Router: router,

    user,
    role: user.role || "",

    authenticated: isAuthenticated(),
    hasUser: user.hasUser === true,
    hasSession: isAuthenticated() && user.hasUser === true,

    publicPath: currentPublicPath(),
    canonicalPath: currentCanonicalPath(),
    route: getCurrentRoute(),
  };
}

function shouldRenderSidebar(context = getContext()) {
  if (!context.authenticated || !context.user?.hasUser) return false;

  const route = context.route;

  if (route?.public === true) return false;
  if (route?.hideShell === true) return false;
  if (route?.layout === "auth") return false;

  return true;
}

/* =========================================================
   DOCUMENT STATE
========================================================= */

function syncDocumentSidebarState(open = false, options = {}) {
  if (!isBrowser()) return false;

  const hidden = options?.hidden === true;
  const nextOpen = hidden ? false : open === true;
  const state = hidden ? "hidden" : nextOpen ? "open" : "collapsed";

  const nodes = [
    document.documentElement,
    document.body,
  ].filter(Boolean);

  for (const node of nodes) {
    node.classList.toggle("sidebar-open", state === "open");
    node.classList.toggle("sidebar-collapsed", state === "collapsed");
    node.classList.toggle("sidebar-hidden", state === "hidden");

    node.setAttribute("data-sidebar-state", state);
    node.setAttribute("data-sidebar-open", state === "open" ? "true" : "false");
    node.setAttribute("data-sidebar-hidden", state === "hidden" ? "true" : "false");
  }

  return true;
}

/* =========================================================
   TEMPLATE CALLBACKS
========================================================= */

function onTemplateOpenChange(open = false) {
  sidebarOpen = open === true;

  try {
    syncDocumentSidebarState(sidebarOpen);
  } catch {
    // noop
  }

  try {
    AppCore.setSidebarOpen?.(sidebarOpen);
  } catch {
    // noop
  }

  return sidebarOpen;
}

async function onTemplateLogout() {
  await handleLogout();
}

/* =========================================================
   MOUNT / RENDER
========================================================= */

function mountRoot(nextRoot) {
  const mount = getMount();

  if (!mount || !nextRoot) return null;

  unbindTemplate();

  clear(mount);
  mount.appendChild(nextRoot);

  root = nextRoot;

  setHidden(mount, false);
  setHidden(root, false);

  cleanupTemplate = bindSidebarTemplate(root, {
    onOpenChange: onTemplateOpenChange,
    onLogout: onTemplateLogout,
  });

  cacheDom();
  mounted = true;

  return root;
}

function hideSidebar() {
  unbindTemplate();

  const mount = getMount();
  const current = root || byId(SIDEBAR_ROOT_ID);

  if (current) {
    setHidden(current, true);
  }

  if (mount) {
    setHidden(mount, true);
  }

  try {
    syncDocumentSidebarState(false, {
      hidden: true,
    });
  } catch {
    // noop
  }

  mounted = false;
  cacheDom();

  return true;
}

function renderSidebar(context = getContext()) {
  if (!shouldRenderSidebar(context)) {
    hideSidebar();
    return SidebarUI;
  }

  const user = context.user;
  const items = getMenuItems(context);

  const nextRoot = createSidebarTemplate({
    id: SIDEBAR_ROOT_ID,
    open: sidebarOpen,
    user,
    items,
    brandLabel: BRAND_LABEL,
    brandHref: userHomeHref(user),
    accountLinks: {
      cuentaHref: routeHref(ROUTES.cuenta || "/cuenta", user),
      ajustesHref: routeHref(ROUTES.ajustes || "/ajustes", user),
    },
  });

  mountRoot(nextRoot);
  onTemplateOpenChange(sidebarOpen);

  return SidebarUI;
}

function sync() {
  if (!isBrowser()) return SidebarUI;

  return renderSidebar(getContext());
}

/* =========================================================
   ACTIONS
========================================================= */

async function navigateTo(path = "/", options = {}) {
  const router = getRouter();
  const context = getContext();
  const target = routeHref(path, context.user);

  if (!router || !target) return false;

  await router.navigate?.(target, {
    source: "sidebar",
    ...options,
  });

  closeSidebar();

  return true;
}

function setSidebarOpen(value = true) {
  sidebarOpen = value === true;

  if (root) {
    setSidebarTemplateOpen(root, sidebarOpen, {
      onOpenChange: onTemplateOpenChange,
    });
  } else {
    onTemplateOpenChange(sidebarOpen);
  }

  return sidebarOpen;
}

function openSidebar() {
  return setSidebarOpen(true);
}

function closeSidebar() {
  try {
    closeSidebarDropdown(root, {
      focus: false,
    });
  } catch {
    // noop
  }

  return setSidebarOpen(false);
}

function toggleSidebar() {
  return setSidebarOpen(!sidebarOpen);
}

async function handleLogout(options = {}) {
  if (logoutInFlight) return false;

  const auth = getAuth();
  const router = getRouter();

  logoutInFlight = true;
  sync();

  try {
    await auth?.logout?.(options);
  } catch {
    // logout remoto best-effort
  } finally {
    logoutInFlight = false;
    sidebarOpen = false;

    try {
      closeSidebarDropdown(root, {
        focus: false,
      });
    } catch {
      // noop
    }

    hideSidebar();

    await router?.replace?.(ROUTES.login || "/login", {
      source: "sidebar.logout",
      replaceState: true,
    });
  }

  return true;
}

/* =========================================================
   REGISTRATION
========================================================= */

function registerModule() {
  try {
    if (isObject(AppCore.ui)) {
      AppCore.ui.sidebar = SidebarUI;
    }

    AppCore.registerModule?.("sidebar", SidebarUI, {
      overwrite: true,
    });

    return true;
  } catch {
    return false;
  }
}

function unregisterModule() {
  try {
    if (AppCore.ui?.sidebar === SidebarUI) {
      delete AppCore.ui.sidebar;
    }

    AppCore.modules?.remove?.("sidebar");

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   LIFECYCLE
========================================================= */

function init() {
  initialized = true;

  registerModule();
  sync();

  return SidebarUI;
}

function destroy() {
  unbindTemplate();

  const mount = getMount();

  if (root) {
    setHidden(root, true);
  }

  if (mount) {
    clear(mount);
    setHidden(mount, true);
  }

  try {
    syncDocumentSidebarState(false, {
      hidden: true,
    });
  } catch {
    // noop
  }

  mounted = false;
  initialized = false;
  sidebarOpen = false;
  logoutInFlight = false;
  root = null;

  clearDomCache();
  unregisterModule();

  return SidebarUI;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getSnapshot() {
  const context = getContext();
  const items = shouldRenderSidebar(context) ? getMenuItems(context) : [];

  return {
    version: SIDEBAR_VERSION,

    initialized,
    mounted,
    open: sidebarOpen,
    logoutInFlight,

    publicPath: redact(context.publicPath),
    canonicalPath: redact(context.canonicalPath),

    authenticated: context.authenticated,
    isAdmin: context.user?.isAdmin === true,

    user: context.user?.hasUser
      ? {
          hasUser: true,
          id: context.user.id || null,
          userId: context.user.userId || null,
          slug: context.user.slug || null,
          username: context.user.username || "",
          displayName: context.user.displayName,
          role: context.user.role,
          roleLabel: context.user.roleLabel,
          isAdmin: context.user.isAdmin,
          avatarUrl: context.user.avatarUrl ? "***" : "",
          hasAvatar: context.user.hasAvatar,
          initials: context.user.initials,
        }
      : null,

    menuItems: items.map((item) => ({
      href: redact(item.href),
      label: item.label,
      active: item.active,
      adminOnly: item.adminOnly,
    })),
  };
}

/* =========================================================
   API
========================================================= */

export const SidebarUI = {
  version: SIDEBAR_VERSION,

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
  getDebugSnapshot: getSnapshot,

  get initialized() {
    return initialized;
  },

  get mounted() {
    return mounted;
  },

  get logoutInFlight() {
    return logoutInFlight;
  },
};

export default SidebarUI;
