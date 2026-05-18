/* =========================================================
   Onion Support - Sidebar UI
   Archivo: /src/ui/sidebar/index.js

   Responsabilidad:
   - Sidebar mínimo del panel.
   - Montar en #sidebar-mount / #app-sidebar.
   - Pintar rutas privadas reales.
   - SVGs inline mínimos.
   - Ocultar rutas admin si no eres admin.
   - Marcar ruta activa.
   - Mostrar usuario básico.
   - Logout simple.
   - Sin Store.
   - Sin HTTP.
   - Sin Toast.
   - Sin submódulos.
   - Sin dropdown complejo.
   - Sin event storms.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";
import { Router } from "../../router/index.js";

import {
  getImmutableRoutes,
} from "../../router/routes.js";

export const SIDEBAR_UI_VERSION = "simple-svg";

const SOURCE = "sidebar.ui";
const LOGIN_ROUTE = "/login";

let initialized = false;
let mounted = false;
let logoutInFlight = false;
let root = null;
let cleanupClick = null;

/* =========================================================
   SVG ICONS
========================================================= */

const ICONS = Object.freeze({
  brand: "M12 2.5c4.3 0 7.5 3.1 7.5 7.3 0 5.1-4.5 9.5-7.5 11.7-3-2.2-7.5-6.6-7.5-11.7C4.5 5.6 7.7 2.5 12 2.5Zm0 4.2a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Z",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  home: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z",
  incidencias: "M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  facturas: "M6 2h9l5 5v15H6z M14 2v6h6 M8.5 12h7 M8.5 16h5",
  usuarios: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4 21c0-4 4-7 8-7s8 3 8 7",
  clientes: "M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M8 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M2.5 21c0-3.3 2.8-6 6.2-6s6.2 2.7 6.2 6 M13.5 15.2c.8-.3 1.7-.5 2.7-.5 3 0 5.3 2.3 5.3 5.3",
  cuenta: "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M5.5 21a6.5 6.5 0 0 1 13 0",
  ajustes: "M4 6h10 M4 12h6 M4 18h12 M16 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z M18 16a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z",
  servidor: "M4 5h16v5H4z M4 14h16v5H4z M8 7.5h.01 M8 16.5h.01 M11 7.5h5 M11 16.5h5",
  logout: "M16 17l5-5-5-5 M21 12H9 M4 4h5v16H4z",
});

function icon(name = "home", className = "sidebar-svg") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

  svg.setAttribute("class", className);
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");

  path.setAttribute("d", ICONS[name] || ICONS.home);
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.7");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");

  svg.appendChild(path);
  return svg;
}

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
  const output = String(value ?? "").trim();
  return output || fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function emit(eventName = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(eventName, {
      source: SOURCE,
      version: SIDEBAR_UI_VERSION,
      at: nowIso(),
      ...payload,
      token: null,
      accessToken: null,
      refreshToken: null,
    });

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   PATHS
========================================================= */

function normalizePath(path = "/") {
  let value = text(path, "/");

  if (value.startsWith("#/")) value = value.slice(1);
  if (value.startsWith("#!")) value = value.replace(/^#!\/?/, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/{2,}/g, "/");

  return value || "/";
}

function canonicalPath(path = "/") {
  let value = normalizePath(path).split("?")[0].split("#")[0] || "/";

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "");
  }

  return value || "/";
}

function currentPath() {
  try {
    return (
      Router?.getCurrentCanonicalPath?.() ||
      AppCore?.state?.canonicalPath ||
      AppCore?.state?.route ||
      (isBrowser() ? window.location.pathname : "/") ||
      "/"
    );
  } catch {
    return "/";
  }
}

/* =========================================================
   AUTH / USER
========================================================= */

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  return (
    user.disabled === true ||
    String(user.status || "").toLowerCase() === "disabled"
  );
}

function usableUser(user = null) {
  if (!isObject(user)) return false;
  if (userDisabled(user)) return false;

  return Boolean(
    user.id ||
      user.userId ||
      user.username ||
      user.slug ||
      user.email
  );
}

function getUser() {
  try {
    const user = Auth?.getUser?.() || Auth?.getCurrentUser?.();

    if (usableUser(user)) return user;
  } catch {
    // noop
  }

  const state = isObject(AppCore?.state) ? AppCore.state : {};

  const user =
    state.user ||
    state.currentUser ||
    state.authUser ||
    state.sessionUser ||
    state.session?.user ||
    null;

  return usableUser(user) ? user : null;
}

function normalizeRole(value = "") {
  return String(value || "").toLowerCase() === "admin" ? "admin" : "user";
}

function getRole() {
  try {
    const role = Auth?.getRole?.() || Auth?.getCurrentRole?.();

    if (role) return normalizeRole(role);
  } catch {
    // noop
  }

  const user = getUser();
  const state = isObject(AppCore?.state) ? AppCore.state : {};

  return normalizeRole(state.role || user?.role || user?.rol || "user");
}

function isAdmin() {
  return getRole() === "admin";
}

function displayName(user = null) {
  return text(
    user?.name ||
      user?.fullName ||
      user?.displayName ||
      user?.nombre ||
      user?.username ||
      user?.email ||
      "Usuario",
    "Usuario"
  );
}

function userInitials(user = null) {
  const name = displayName(user);
  const parts = name.split(/\s+/).filter(Boolean);

  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

/* =========================================================
   DOM
========================================================= */

function query(selector = "") {
  if (!isBrowser() || !selector) return null;

  try {
    if (selector.startsWith("#")) {
      return document.getElementById(selector.slice(1));
    }

    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function create(tag = "div", { className = "", textContent = "", attrs = {}, dataset = {} } = {}) {
  const node = document.createElement(tag);

  if (className) node.className = className;
  if (textContent) node.textContent = textContent;

  for (const [key, value] of Object.entries(isObject(attrs) ? attrs : {})) {
    if (value === false || value === null || value === undefined) continue;
    node.setAttribute(key, String(value));
  }

  for (const [key, value] of Object.entries(isObject(dataset) ? dataset : {})) {
    if (value === false || value === null || value === undefined) continue;
    node.dataset[key] = String(value);
  }

  return node;
}

function clear(node) {
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

function setHidden(node, hidden = false) {
  if (!node) return false;

  try {
    node.hidden = Boolean(hidden);
    node.setAttribute("aria-hidden", hidden ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

function setActive(node, active = false) {
  if (!node) return false;

  try {
    node.classList.toggle("active", active);
    node.classList.toggle("is-active", active);
    node.classList.toggle("router-active", active);
    node.dataset.active = active ? "true" : "false";

    if (active) node.setAttribute("aria-current", "page");
    else node.removeAttribute("aria-current");

    return true;
  } catch {
    return false;
  }
}

function getMount() {
  return (
    query("#sidebar-mount") ||
    query("#app-sidebar") ||
    query("#sidebar") ||
    query("[data-sidebar-mount]") ||
    query("[data-sidebar-root]")
  );
}

function cacheRoot(node) {
  try {
    AppCore.dom = isObject(AppCore.dom) ? AppCore.dom : {};
    AppCore.dom.sidebar = node;
    AppCore.dom.sidebarRoot = node;
    AppCore.dom.sidebarMount = query("#sidebar-mount") || node;
  } catch {
    // noop
  }

  return node;
}

/* =========================================================
   ROOT
========================================================= */

function buildRoot() {
  return create("aside", {
    className: "sidebar app-sidebar",
    attrs: {
      id: "app-sidebar",
      "data-sidebar-root": "true",
      "aria-label": "Navegación principal",
    },
  });
}

function ensureRoot() {
  if (!isBrowser()) return null;

  const mount = getMount();

  if (!mount) return null;

  if (mount.matches?.("[data-sidebar-root], #app-sidebar, #sidebar")) {
    root = mount;
  } else {
    root = mount.querySelector("[data-sidebar-root]");

    if (!root) {
      root = buildRoot();
      clear(mount);
      mount.appendChild(root);
    }
  }

  return cacheRoot(root);
}

/* =========================================================
   ROUTES / MENU
========================================================= */

function getRoutes() {
  try {
    return getImmutableRoutes()
      .filter((route) => route && route.public !== true && route.hideShell !== true)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  } catch {
    return [];
  }
}

function routeAllowed(route = null) {
  const roles = Array.isArray(route?.roles) ? route.roles : [];

  if (!roles.length) return true;
  if (roles.includes("admin")) return isAdmin();

  return true;
}

function routeTitle(route = null) {
  return text(route?.title || route?.label || route?.name || route?.path || "Ruta", "Ruta");
}

function routeIcon(route = null) {
  const path = canonicalPath(route?.path || "");
  const key = String(route?.viewKey || route?.name || route?.id || "").toLowerCase();

  if (path === "/") return "home";
  if (path === "/incidencias" || key.includes("incidencia") || key.includes("ticket")) return "incidencias";
  if (path === "/facturas" || key.includes("factura") || key.includes("invoice")) return "facturas";
  if (path === "/usuarios" || key.includes("usuario") || key.includes("user")) return "usuarios";
  if (path === "/clientes" || key.includes("cliente") || key.includes("client")) return "clientes";
  if (path === "/cuenta" || key.includes("cuenta") || key.includes("account")) return "cuenta";
  if (path === "/ajustes" || key.includes("ajuste") || key.includes("setting")) return "ajustes";
  if (path === "/servidor" || key.includes("servidor") || key.includes("server")) return "servidor";

  return "home";
}

/* =========================================================
   RENDER
========================================================= */

function renderShell() {
  if (!root) return false;

  clear(root);

  const header = create("header", {
    className: "sidebar-header",
  });

  const brand = create("a", {
    className: "sidebar-brand",
    attrs: {
      href: "/",
      "data-spa": "",
      "data-sidebar-brand": "true",
    },
  });

  const brandIcon = create("span", {
    className: "sidebar-brand-icon",
    attrs: {
      "aria-hidden": "true",
    },
  });

  brandIcon.appendChild(icon("brand", "sidebar-brand-svg"));

  const brandLabel = create("span", {
    className: "sidebar-brand-label",
    textContent: "Onion Support",
  });

  brand.append(brandIcon, brandLabel);

  const toggle = create("button", {
    className: "sidebar-toggle",
    attrs: {
      type: "button",
      "aria-label": "Abrir navegación",
      "data-sidebar-toggle": "true",
    },
  });

  toggle.appendChild(icon("menu", "sidebar-toggle-svg"));

  header.append(brand, toggle);

  const nav = create("nav", {
    className: "sidebar-nav",
    attrs: {
      "aria-label": "Secciones",
    },
    dataset: {
      sidebarNav: "true",
    },
  });

  const footer = create("footer", {
    className: "sidebar-footer",
    dataset: {
      sidebarFooter: "true",
    },
  });

  root.append(header, nav, footer);

  return true;
}

function renderMenu() {
  if (!root) return false;

  const nav = root.querySelector("[data-sidebar-nav]");

  if (!nav) return false;

  clear(nav);

  const current = canonicalPath(currentPath());

  for (const route of getRoutes()) {
    if (!routeAllowed(route)) continue;

    const path = normalizePath(route.path || "/");
    const active = canonicalPath(path) === current;

    const link = create("a", {
      className: "sidebar-link",
      attrs: {
        href: path,
        "data-spa": "",
        "data-sidebar-nav-link": "true",
        "data-route": path,
      },
    });

    const linkIcon = create("span", {
      className: "sidebar-link-icon",
      attrs: {
        "aria-hidden": "true",
      },
    });

    linkIcon.appendChild(icon(routeIcon(route), "sidebar-link-svg"));

    const label = create("span", {
      className: "sidebar-link-label",
      textContent: routeTitle(route),
    });

    link.append(linkIcon, label);

    setActive(link, active);
    nav.appendChild(link);
  }

  return true;
}

function renderUser() {
  if (!root) return false;

  const footer = root.querySelector("[data-sidebar-footer]");

  if (!footer) return false;

  clear(footer);

  const user = getUser();
  const role = getRole();

  const userBox = create("div", {
    className: "sidebar-user",
    dataset: {
      sidebarUser: "true",
    },
  });

  const avatar = create("div", {
    className: "sidebar-user-avatar",
    textContent: userInitials(user),
    attrs: {
      "aria-hidden": "true",
    },
  });

  const info = create("div", {
    className: "sidebar-user-info",
  });

  const name = create("div", {
    className: "sidebar-user-name",
    textContent: displayName(user),
  });

  const meta = create("div", {
    className: "sidebar-user-meta",
    textContent: role === "admin" ? "Admin" : "Usuario",
  });

  info.append(name, meta);
  userBox.append(avatar, info);

  const logout = create("button", {
    className: "sidebar-logout",
    attrs: {
      type: "button",
      "data-sidebar-logout": "true",
    },
  });

  const logoutIcon = create("span", {
    className: "sidebar-logout-icon",
    attrs: {
      "aria-hidden": "true",
    },
  });

  logoutIcon.appendChild(icon("logout", "sidebar-logout-svg"));

  const logoutLabel = create("span", {
    className: "sidebar-logout-label",
    textContent: "Salir",
  });

  logout.append(logoutIcon, logoutLabel);

  footer.append(userBox, logout);

  return true;
}

/* =========================================================
   VISIBILITY / OPEN
========================================================= */

function sidebarHiddenByShell() {
  const state = isObject(AppCore?.state) ? AppCore.state : {};

  return Boolean(
    state.chromeHidden ||
      state.shellHidden ||
      state.routeShellHidden ||
      state.routeMode === "auth"
  );
}

function syncVisibility() {
  if (!root) return false;

  setHidden(root, sidebarHiddenByShell());

  return true;
}

function setSidebarOpen(open = true) {
  const value = Boolean(open);

  try {
    AppCore.state = isObject(AppCore.state) ? AppCore.state : {};
    AppCore.state.sidebarOpen = value;
  } catch {
    // noop
  }

  if (root) {
    root.classList.toggle("is-open", value);
    root.classList.toggle("is-collapsed", !value);
    root.dataset.open = value ? "true" : "false";
  }

  try {
    document.body?.classList?.toggle?.("sidebar-open", value);
  } catch {
    // noop
  }

  return true;
}

function openSidebar() {
  return setSidebarOpen(true);
}

function closeSidebar() {
  return setSidebarOpen(false);
}

function toggleSidebar() {
  const current = Boolean(AppCore?.state?.sidebarOpen);
  return setSidebarOpen(!current);
}

/* =========================================================
   ACTIONS
========================================================= */

async function navigateTo(path = "/", options = {}) {
  const target = normalizePath(path || "/");

  try {
    if (isFunction(Router?.replace) && options.replaceState === true) {
      await Router.replace(target, {
        source: SOURCE,
        ...options,
      });
    } else if (isFunction(Router?.navigate)) {
      await Router.navigate(target, {
        source: SOURCE,
        ...options,
      });
    } else if (isBrowser()) {
      window.location.assign(target);
    }

    sync();
    return true;
  } catch {
    return false;
  }
}

async function handleLogout() {
  if (logoutInFlight) return false;

  logoutInFlight = true;

  try {
    if (isFunction(Auth?.logout)) {
      await Auth.logout({
        source: SOURCE,
        skipNavigation: true,
        skipRedirect: true,
        noRedirect: true,
      });
    } else if (isFunction(Auth?.clearSession)) {
      Auth.clearSession({
        source: SOURCE,
      });
    }

    await navigateTo(LOGIN_ROUTE, {
      replaceState: true,
      force: true,
    });

    return true;
  } finally {
    logoutInFlight = false;
    sync();
  }
}

/* =========================================================
   EVENTS
========================================================= */

function onClick(event) {
  const target = event.target;

  const logout = target?.closest?.("[data-sidebar-logout]");

  if (logout) {
    event.preventDefault();
    handleLogout();
    return;
  }

  const toggle = target?.closest?.("[data-sidebar-toggle]");

  if (toggle) {
    event.preventDefault();
    toggleSidebar();
    return;
  }

  const brand = target?.closest?.("[data-sidebar-brand]");
  const link = target?.closest?.("[data-sidebar-nav-link]");
  const routeLink = link || brand;

  if (!routeLink) return;

  const href = routeLink.getAttribute("href") || "";

  if (!href) return;

  event.preventDefault();
  navigateTo(href);
}

function bindEvents() {
  if (!root || cleanupClick) return true;

  root.addEventListener("click", onClick);

  cleanupClick = () => {
    try {
      root?.removeEventListener?.("click", onClick);
    } catch {
      // noop
    }

    cleanupClick = null;
  };

  return true;
}

function unbindEvents() {
  try {
    cleanupClick?.();
  } catch {
    cleanupClick = null;
  }

  return true;
}

/* =========================================================
   CORE REGISTRATION
========================================================= */

function registerModule() {
  try {
    AppCore.Sidebar = api;
    AppCore.SidebarUI = api;
    AppCore.sidebar = api;
    AppCore.sidebarUI = api;

    AppCore.modules?.register?.("Sidebar", api);
    AppCore.modules?.register?.("SidebarUI", api);
    AppCore.modules?.register?.("sidebar", api);
    AppCore.modules?.register?.("sidebarUI", api);

    return true;
  } catch {
    return false;
  }
}

function exposeGlobalBridge() {
  if (!isBrowser()) return false;

  try {
    window.SidebarUI = api;
    window.OnionSidebarUI = api;
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   LIFECYCLE
========================================================= */

function sync() {
  ensureRoot();

  if (!root) return api;

  renderShell();
  renderMenu();
  renderUser();
  syncVisibility();
  bindEvents();

  mounted = true;

  return api;
}

function init() {
  if (initialized) {
    registerModule();
    return sync();
  }

  initialized = true;

  registerModule();
  exposeGlobalBridge();

  sync();

  emit("sidebar:ready", {
    initialized: true,
  });

  return api;
}

function destroy() {
  unbindEvents();

  if (root) clear(root);

  initialized = false;
  mounted = false;
  logoutInFlight = false;
  root = null;

  emit("sidebar:destroyed");

  return api;
}

/* =========================================================
   COMPAT NO-OPS
========================================================= */

function noopTrue() {
  return true;
}

function dropdownFalse() {
  return false;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getSnapshot() {
  return {
    version: SIDEBAR_UI_VERSION,

    initialized,
    mounted,
    logoutInFlight,

    hasRoot: Boolean(root),

    route: canonicalPath(currentPath()),

    user: (() => {
      const user = getUser();

      return user
        ? {
            id: user.id || user.userId || null,
            userId: user.userId || user.id || null,
            username: user.username || user.slug || null,
            displayName: displayName(user),
            role: getRole(),
          }
        : null;
    })(),

    isAdmin: isAdmin(),

    dom: {
      hidden: Boolean(root?.hidden),
      open: Boolean(AppCore?.state?.sidebarOpen),
      menuItems: root
        ? [...root.querySelectorAll("[data-sidebar-nav-link]")].map((link) => ({
            href: link.getAttribute("href") || "",
            text: text(link.textContent, ""),
            active: link.dataset.active === "true",
            hasSvg: Boolean(link.querySelector("svg")),
          }))
        : [],
    },

    policy: {
      ownAuth: false,
      ownRouter: false,
      ownHttp: false,
      ownStore: false,
      ownToast: false,
      noSubmodules: true,
      svgIcons: true,
      roles: ["admin", "user"],
    },
  };
}

function debug() {
  const snapshot = getSnapshot();

  try {
    console.log("[SidebarUI]", snapshot);
  } catch {
    // noop
  }

  return snapshot;
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
  repair: sync,
  scheduleRepair: sync,

  bind: bindEvents,
  rebind: bindEvents,
  bindEvents,
  rebindEvents: bindEvents,

  renderUser,
  refreshUser: renderUser,
  updateUser: renderUser,
  syncUser: renderUser,

  applyRoleVisibility: renderMenu,

  syncSidebarState: syncVisibility,
  repairSidebarState: syncVisibility,

  openDropdown: dropdownFalse,
  closeDropdown: noopTrue,
  toggleDropdown: dropdownFalse,
  repairDropdown: noopTrue,

  setSidebarOpen,
  openSidebar,
  closeSidebar,
  toggleSidebar,
  collapseSidebar: closeSidebar,
  expandSidebar: openSidebar,

  ensureSidebarOpenForUserMenu: openSidebar,
  closeSidebarOnMobileAfterNavigation: closeSidebar,

  navigateTo,
  navigate: navigateTo,

  handleLogout,

  updateToggleLabel: noopTrue,

  syncRouteAndIndicator: renderMenu,
  syncIndicator: renderMenu,
  scheduleIndicatorSync: renderMenu,

  ensureMenuInteractive: noopTrue,
  sanitizeSidebarDom: noopTrue,

  isAdmin,

  registerModule,
  exposeGlobalBridge,

  debug,
  debugDropdown: getSnapshot,
  debugIndicator: getSnapshot,

  getSnapshot,
  getState: getSnapshot,

  get initialized() {
    return initialized;
  },

  get eventsBound() {
    return Boolean(cleanupClick);
  },

  get bindingEvents() {
    return false;
  },

  get logoutInFlight() {
    return logoutInFlight;
  },
};

registerModule();

export const SidebarUI = api;

export default SidebarUI;
