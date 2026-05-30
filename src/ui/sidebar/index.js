/* =========================================================
   Onion Support - Sidebar UI
   Archivo: /src/ui/sidebar/index.js

   Responsabilidad:
   - Sidebar mínimo del panel.
   - Montar en #sidebar-mount.
   - Pintar marca, menú, usuario y logout.
   - Usar rutas reales desde router/routes.js.
   - Ocultar rutas admin para usuarios no admin.
   - Construir URLs visibles /@{user.slug}/{ruta}.
   - Delegar navegación en Router.
   - Delegar logout en Auth.
   - Sin submódulos, sin HTTP, sin Toast, sin Store,
     sin dropdown externo, sin template externo y sin rutas inventadas.
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";
import { Router } from "../../router/index.js";

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

export const SIDEBAR_VERSION = "sidebar.minimal.v1";

const SIDEBAR_ROOT_ID = "app-sidebar";
const BRAND_LABEL = "Onion Support";

let initialized = false;
let mounted = false;
let sidebarOpen = false;
let logoutInFlight = false;

let root = null;
let cleanupEvents = null;

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
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function titleCase(value = "") {
  return cleanText(value, "")
    .replace(/^\/+/, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/* =========================================================
   DOM
========================================================= */

function byId(id = "") {
  if (!isBrowser() || !id) return null;
  return document.getElementById(id);
}

function clear(node = null) {
  if (!node) return false;

  try {
    node.replaceChildren();
    return true;
  } catch {
    node.textContent = "";
    return true;
  }
}

function create(tag = "div", options = {}) {
  const node = document.createElement(tag);

  if (options.className) {
    node.className = options.className;
  }

  if (options.textContent) {
    node.textContent = options.textContent;
  }

  for (const [key, value] of Object.entries(options.attrs || {})) {
    if (value === false || value === null || value === undefined) continue;
    node.setAttribute(key, value === true ? "true" : String(value));
  }

  for (const [key, value] of Object.entries(options.dataset || {})) {
    if (value === false || value === null || value === undefined) continue;
    node.dataset[key] = String(value);
  }

  return node;
}

function setHidden(node = null, hidden = false) {
  if (!node) return false;

  const value = Boolean(hidden);

  node.hidden = value;
  node.setAttribute("aria-hidden", value ? "true" : "false");

  return true;
}

function getMount() {
  if (!isBrowser()) return null;

  return (
    byId("sidebar-mount") ||
    byId("app-sidebar") ||
    document.querySelector?.("[data-sidebar-mount]") ||
    document.querySelector?.("[data-sidebar-root]") ||
    null
  );
}

function cacheDom() {
  try {
    AppCore.dom = isObject(AppCore.dom) ? AppCore.dom : {};

    AppCore.dom.sidebar = root;
    AppCore.dom.appSidebar = root;
    AppCore.dom.sidebarRoot = root;
    AppCore.dom.sidebarMount =
      byId("sidebar-mount") ||
      (root?.parentElement?.id === "sidebar-mount" ? root.parentElement : null);

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

/* =========================================================
   USER
========================================================= */

function getAuthUser() {
  try {
    return Auth.getUser?.() || Auth.getCurrentUser?.() || AppCore.getCurrentUser?.() || null;
  } catch {
    return null;
  }
}

function getRole() {
  try {
    return Auth.getRole?.() || Auth.getCurrentRole?.() || AppCore.getCurrentRole?.() || "";
  } catch {
    return "";
  }
}

function isAuthenticated() {
  try {
    return Auth.isAuthenticated?.() === true || AppCore.isAuthenticated?.() === true;
  } catch {
    return false;
  }
}

function isAdmin() {
  try {
    return Auth.isAdmin?.() === true || getRole() === "admin";
  } catch {
    return false;
  }
}

function safeImageUrl(value = "") {
  const raw = cleanText(value, "");

  if (!raw) return "";
  if (/[\r\n\t]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return "";

  if (raw.startsWith("/")) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;

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

function getUserViewModel() {
  const raw = getAuthUser();

  if (!raw || !isAuthenticated()) {
    return {
      hasUser: false,
      role: "",
      isAdmin: false,
      displayName: "Usuario",
      initials: "ON",
      avatarUrl: "",
      slug: "",
    };
  }

  const publicUser = isFunction(AppCore.publicUser)
    ? AppCore.publicUser(raw)
    : raw;

  const role = cleanText(publicUser?.role || raw.role || raw.rol || getRole(), "user");
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
    role,
    roles: role ? [role] : [],

    roleLabel: role === "admin" ? "Administrador" : "Usuario",

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
  try {
    return (
      Router.getCurrentPublicPath?.() ||
      Router.getCurrentPath?.() ||
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
  try {
    return normalizePath(
      Router.getCurrentCanonicalPath?.() ||
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

  if (clean === "/") return "⌂";
  if (clean === ROUTES.incidencias) return "!";
  if (clean === ROUTES.facturas) return "€";
  if (clean === ROUTES.clientes) return "C";
  if (clean === ROUTES.usuarios) return "U";
  if (clean === ROUTES.servidor) return "S";
  if (clean === ROUTES.cuenta) return "◎";
  if (clean === ROUTES.ajustes) return "⚙";

  return "•";
}

function routeLabel(route = null) {
  const path = normalizePath(route?.path || "/");

  if (route?.title) return cleanText(route.title);
  if (route?.label) return cleanText(route.label);
  if (route?.name) return titleCase(route.name);

  if (path === "/") return "Inicio";

  return titleCase(path);
}

function isRouteAdmin(route = null) {
  return Boolean(route?.adminOnly || route?.requiresAdmin || route?.routeGroup === "admin");
}

function isRouteVisible(route = null, user = getUserViewModel()) {
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
   CONTEXT
========================================================= */

function getCurrentRoute() {
  try {
    return Router.getCurrentRoute?.() || null;
  } catch {
    return null;
  }
}

function shouldRenderSidebar(context = getContext()) {
  if (!context.authenticated || !context.user?.hasUser) return false;

  const route = context.route;

  if (route?.public === true) return false;
  if (route?.hideShell === true) return false;
  if (route?.layout === "auth") return false;

  return true;
}

function getContext() {
  const user = getUserViewModel();

  return {
    AppCore,
    Auth,
    Router,

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

/* =========================================================
   RENDER
========================================================= */

function createBrand(context) {
  const brand = create("a", {
    className: "sidebar-brand",
    attrs: {
      href: userHomeHref(context.user),
      "data-spa": "true",
      "data-route": userHomeHref(context.user),
      "aria-label": BRAND_LABEL,
    },
  });

  const mark = create("span", {
    className: "sidebar-brand-mark",
    textContent: "ON",
    attrs: {
      "aria-hidden": "true",
    },
  });

  const label = create("span", {
    className: "sidebar-brand-label",
    textContent: BRAND_LABEL,
  });

  brand.append(mark, label);

  return brand;
}

function createMenuItem(item) {
  const link = create("a", {
    className: `sidebar-link${item.active ? " is-active" : ""}`,
    attrs: {
      href: item.href,
      "data-spa": "true",
      "data-route": item.href,
      "data-sidebar-key": item.key,
      "aria-current": item.active ? "page" : "false",
    },
  });

  const icon = create("span", {
    className: "sidebar-link-icon",
    textContent: item.icon,
    attrs: {
      "aria-hidden": "true",
    },
  });

  const label = create("span", {
    className: "sidebar-link-label",
    textContent: item.label,
  });

  link.append(icon, label);

  if (item.adminOnly) {
    link.dataset.adminOnly = "true";
  }

  return link;
}

function createMenu(items = []) {
  const nav = create("nav", {
    className: "sidebar-nav",
    attrs: {
      "aria-label": "Navegación principal",
    },
  });

  const list = create("ul", {
    className: "sidebar-menu",
  });

  for (const item of items) {
    const li = create("li", {
      className: "sidebar-menu-item",
    });

    li.appendChild(createMenuItem(item));
    list.appendChild(li);
  }

  nav.appendChild(list);

  return nav;
}

function createAvatar(user) {
  const avatar = create("div", {
    className: "sidebar-user-avatar",
  });

  if (user.hasAvatar && user.avatarUrl) {
    const img = create("img", {
      className: "sidebar-user-avatar-img",
      attrs: {
        src: user.avatarUrl,
        alt: "",
        loading: "lazy",
        referrerpolicy: "no-referrer",
      },
    });

    avatar.appendChild(img);
    return avatar;
  }

  avatar.textContent = user.initials || "ON";
  avatar.setAttribute("aria-hidden", "true");

  return avatar;
}

function createUserBlock(user) {
  const block = create("section", {
    className: "sidebar-user",
    attrs: {
      "aria-label": "Usuario",
    },
  });

  const summary = create("div", {
    className: "sidebar-user-summary",
  });

  const info = create("div", {
    className: "sidebar-user-info",
  });

  const name = create("strong", {
    className: "sidebar-user-name",
    textContent: user.displayName || "Usuario",
  });

  const role = create("span", {
    className: "sidebar-user-role",
    textContent: user.roleLabel || "Usuario",
  });

  info.append(name, role);
  summary.append(createAvatar(user), info);

  const logout = create("button", {
    className: "sidebar-logout",
    textContent: logoutInFlight ? "Cerrando..." : "Cerrar sesión",
    attrs: {
      type: "button",
      "data-sidebar-action": "logout",
      disabled: logoutInFlight ? "true" : null,
    },
  });

  block.append(summary, logout);

  return block;
}

function createRoot(context, items) {
  const aside = create("aside", {
    className: `sidebar app-sidebar${sidebarOpen ? " is-open" : ""}`,
    attrs: {
      id: SIDEBAR_ROOT_ID,
      "data-sidebar-root": "true",
      "data-sidebar-open": sidebarOpen ? "true" : "false",
      "aria-label": "Menú principal",
    },
  });

  aside.append(createBrand(context), createMenu(items), createUserBlock(context.user));

  return aside;
}

function mountRoot(nextRoot) {
  const mount = getMount();

  if (!mount || !nextRoot) return null;

  unbindEvents();

  if (mount.matches?.("[data-sidebar-root], #app-sidebar")) {
    clear(mount);

    for (const child of [...nextRoot.childNodes]) {
      mount.appendChild(child);
    }

    mount.className = nextRoot.className;
    mount.dataset.sidebarRoot = "true";
    mount.dataset.sidebarOpen = sidebarOpen ? "true" : "false";
    mount.setAttribute("aria-label", "Menú principal");

    root = mount;
  } else {
    clear(mount);
    mount.appendChild(nextRoot);
    root = nextRoot;
  }

  setHidden(root, false);
  cacheDom();
  bindEvents();

  mounted = true;

  return root;
}

function hideSidebar() {
  unbindEvents();

  const current = root || byId(SIDEBAR_ROOT_ID);

  if (current) {
    setHidden(current, true);
  }

  mounted = false;
  cacheDom();

  return true;
}

function syncSidebarStateToDom() {
  if (!root) return false;

  root.classList.toggle("is-open", sidebarOpen);
  root.dataset.sidebarOpen = sidebarOpen ? "true" : "false";

  try {
    document.body?.classList.toggle("sidebar-open", sidebarOpen);
    document.documentElement?.classList.toggle("sidebar-open", sidebarOpen);
  } catch {
    // noop
  }

  try {
    AppCore.setSidebarOpen?.(sidebarOpen);
  } catch {
    // noop
  }

  return true;
}

function renderSidebar(context = getContext()) {
  if (!shouldRenderSidebar(context)) {
    hideSidebar();
    return SidebarUI;
  }

  const items = getMenuItems(context);
  const nextRoot = createRoot(context, items);

  mountRoot(nextRoot);
  syncSidebarStateToDom();

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
  const context = getContext();
  const target = routeHref(path, context.user);

  if (!target) return false;

  await Router.navigate?.(target, {
    source: "sidebar",
    ...options,
  });

  closeSidebar();
  sync();

  return true;
}

function setSidebarOpen(value = true) {
  sidebarOpen = value === true;
  syncSidebarStateToDom();
  return sidebarOpen;
}

function openSidebar() {
  return setSidebarOpen(true);
}

function closeSidebar() {
  return setSidebarOpen(false);
}

function toggleSidebar() {
  return setSidebarOpen(!sidebarOpen);
}

async function handleLogout(options = {}) {
  if (logoutInFlight) return false;

  logoutInFlight = true;
  sync();

  try {
    await Auth.logout?.(options);
  } finally {
    logoutInFlight = false;
    sidebarOpen = false;

    await Router.replace?.(ROUTES.login || "/login", {
      source: "sidebar.logout",
      replaceState: true,
    });

    sync();
  }

  return true;
}

/* =========================================================
   EVENTS
========================================================= */

function linkHref(element = null) {
  return cleanText(
    element?.dataset?.route ||
      element?.dataset?.href ||
      element?.dataset?.to ||
      element?.getAttribute?.("href"),
    ""
  );
}

function onClick(event) {
  const action = event.target?.closest?.("[data-sidebar-action]");
  const link = event.target?.closest?.("a[data-spa], a[data-route]");

  if (action) {
    const type = cleanText(action.dataset.sidebarAction, "");

    event.preventDefault();

    if (type === "logout") {
      void handleLogout();
      return;
    }

    if (type === "open") openSidebar();
    if (type === "close") closeSidebar();
    if (type === "toggle") toggleSidebar();

    return;
  }

  if (!link) return;

  const href = linkHref(link);

  if (!href || isUnsafePath(href)) return;

  event.preventDefault();

  void navigateTo(href);
}

function bindEvents() {
  if (!root || cleanupEvents) return false;

  root.addEventListener("click", onClick);

  cleanupEvents = () => {
    try {
      root?.removeEventListener("click", onClick);
    } catch {
      // noop
    }

    cleanupEvents = null;
  };

  return true;
}

function unbindEvents() {
  try {
    cleanupEvents?.();
  } catch {
    cleanupEvents = null;
  }

  return true;
}

/* =========================================================
   REGISTRATION
========================================================= */

function registerModule() {
  try {
    AppCore.ui = isObject(AppCore.ui) ? AppCore.ui : {};
    AppCore.ui.sidebar = SidebarUI;

    AppCore.sidebar = SidebarUI;
    AppCore.Sidebar = SidebarUI;

    AppCore.registerModule?.("sidebar", SidebarUI, {
      overwrite: true,
    });

    AppCore.modules?.register?.("sidebar", SidebarUI, {
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

    if (AppCore.sidebar === SidebarUI) {
      delete AppCore.sidebar;
    }

    if (AppCore.Sidebar === SidebarUI) {
      delete AppCore.Sidebar;
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
  unbindEvents();

  if (root) {
    setHidden(root, true);
  }

  mounted = false;
  initialized = false;
  sidebarOpen = false;
  logoutInFlight = false;

  clearDomCache();
  unregisterModule();

  return SidebarUI;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getSnapshot() {
  const context = getContext();
  const items = getMenuItems(context);

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
