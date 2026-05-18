/* =========================================================
   Onion Support - Topbar UI
   Archivo: /src/ui/topbar/index.js

   Responsabilidad:
   - Topbar mínimo del panel.
   - Montar en #topbar-mount / #app-topbar.
   - Pintar título de ruta.
   - Mostrar usuario básico.
   - SVGs inline mínimos.
   - Botón sidebar móvil.
   - Logout simple.
   - Sin Store.
   - Sin HTTP.
   - Sin Toast.
   - Sin search runtime.
   - Sin submódulos.
   - Sin rebind storms.
   - Sin CustomEvent.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";
import { Router } from "../../router/index.js";

import {
  getImmutableRoutes,
} from "../../router/routes.js";

export const TOPBAR_UI_VERSION = "simple-svg";

const SOURCE = "topbar.ui";
const APP_NAME = "Onion Support";
const LOGIN_ROUTE = "/login";

let initialized = false;
let mounted = false;
let bound = false;
let root = null;
let cleanupClick = null;

/* =========================================================
   SVG ICONS
========================================================= */

const ICONS = Object.freeze({
  menu: "M4 6h16 M4 12h16 M4 18h16",
  user: "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M5.5 21a6.5 6.5 0 0 1 13 0",
  logout: "M16 17l5-5-5-5 M21 12H9 M4 4h5v16H4z",
});

function icon(name = "user", className = "topbar-svg") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

  svg.setAttribute("class", className);
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");

  path.setAttribute("d", ICONS[name] || ICONS.user);
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
      version: TOPBAR_UI_VERSION,
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
   USER
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

function getMount() {
  return (
    query("#topbar-mount") ||
    query("#app-topbar") ||
    query("#topbar") ||
    query("[data-topbar-mount]") ||
    query("[data-topbar-root]")
  );
}

function cacheRoot(node) {
  try {
    AppCore.dom = isObject(AppCore.dom) ? AppCore.dom : {};
    AppCore.dom.topbar = node;
    AppCore.dom.topbarRoot = node;
    AppCore.dom.topbarMount = query("#topbar-mount") || node;
  } catch {
    // noop
  }

  return node;
}

function buildRoot() {
  const header = create("header", {
    className: "topbar app-topbar",
    attrs: {
      id: "app-topbar",
      "data-topbar-root": "true",
      "aria-label": "Barra superior",
    },
  });

  const left = create("div", {
    className: "topbar-left",
  });

  const toggle = create("button", {
    className: "topbar-sidebar-toggle",
    attrs: {
      type: "button",
      "aria-label": "Abrir menú",
      "data-topbar-sidebar-toggle": "true",
    },
  });

  toggle.appendChild(icon("menu", "topbar-sidebar-toggle-svg"));

  const title = create("h1", {
    className: "topbar-title",
    textContent: APP_NAME,
    attrs: {
      "data-topbar-title": "true",
    },
  });

  left.append(toggle, title);

  const right = create("div", {
    className: "topbar-right",
    attrs: {
      "data-topbar-user": "true",
    },
  });

  header.append(left, right);

  return header;
}

function ensureRoot() {
  if (!isBrowser()) return null;

  const mount = getMount();

  if (!mount) return null;

  if (mount.matches?.("[data-topbar-root], #app-topbar, #topbar")) {
    root = mount;
  } else {
    root = mount.querySelector("[data-topbar-root]");

    if (!root) {
      root = buildRoot();
      clear(mount);
      mount.appendChild(root);
    }
  }

  return cacheRoot(root);
}

function getDom() {
  ensureRoot();

  return {
    topbar: root,
    title: root?.querySelector?.("[data-topbar-title]") || null,
    user: root?.querySelector?.("[data-topbar-user]") || null,
    sidebarToggle: root?.querySelector?.("[data-topbar-sidebar-toggle]") || null,
  };
}

/* =========================================================
   TITLE
========================================================= */

function routeTitle(route = null) {
  return text(route?.title || route?.label || route?.name || "", "");
}

function decodeURIComponentSafe(value = "") {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolveRouteTitle(path = currentPath()) {
  const clean = canonicalPath(path);

  try {
    const route = getImmutableRoutes().find((item) => canonicalPath(item.path) === clean);
    const title = routeTitle(route);

    if (title) return title;
  } catch {
    // noop
  }

  const fallback = {
    "/": "Inicio",
    "/incidencias": "Incidencias",
    "/facturas": "Facturas",
    "/usuarios": "Usuarios",
    "/clientes": "Clientes",
    "/cuenta": "Cuenta",
    "/ajustes": "Ajustes",
    "/servidor": "Servidor",
    "/login": "Acceso",
    "/activate-account": "Activar cuenta",
    "/password-request": "Recuperar acceso",
    "/password-reset": "Nueva contraseña",
  };

  if (fallback[clean]) return fallback[clean];

  const pretty = clean
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((part) => {
      const decoded = decodeURIComponentSafe(part).replace(/[-_]+/g, " ");
      return decoded ? decoded.charAt(0).toUpperCase() + decoded.slice(1) : "";
    })
    .filter(Boolean)
    .join(" · ");

  return pretty || APP_NAME;
}

function syncTitle(path = currentPath()) {
  const { title } = getDom();

  if (!title) return false;

  const next = resolveRouteTitle(path);

  try {
    title.textContent = next;
    title.dataset.routeTitle = next;
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   USER
========================================================= */

function renderUser() {
  const { user: userRoot } = getDom();

  if (!userRoot) return false;

  clear(userRoot);

  const user = getUser();
  const role = getRole();

  const userIcon = create("span", {
    className: "topbar-user-icon",
    attrs: {
      "aria-hidden": "true",
    },
  });

  userIcon.appendChild(icon("user", "topbar-user-svg"));

  const info = create("span", {
    className: "topbar-user-info",
  });

  const name = create("span", {
    className: "topbar-user-name",
    textContent: displayName(user),
  });

  const meta = create("span", {
    className: "topbar-user-role",
    textContent: role === "admin" ? "Admin" : "Usuario",
  });

  info.append(name, meta);

  const logout = create("button", {
    className: "topbar-logout",
    attrs: {
      type: "button",
      "data-topbar-logout": "true",
      "aria-label": "Salir",
    },
  });

  logout.appendChild(icon("logout", "topbar-logout-svg"));

  const logoutText = create("span", {
    className: "topbar-logout-label",
    textContent: "Salir",
  });

  logout.appendChild(logoutText);

  userRoot.append(userIcon, info, logout);

  return true;
}

/* =========================================================
   SIDEBAR BRIDGE
========================================================= */

function getSidebar() {
  try {
    return (
      AppCore?.SidebarUI ||
      AppCore?.Sidebar ||
      AppCore?.sidebarUI ||
      AppCore?.sidebar ||
      AppCore?.modules?.get?.("SidebarUI") ||
      AppCore?.modules?.get?.("sidebar") ||
      null
    );
  } catch {
    return null;
  }
}

function openSidebarMobile() {
  const sidebar = getSidebar();

  try {
    if (isFunction(sidebar?.openSidebar)) return sidebar.openSidebar();
    if (isFunction(sidebar?.open)) return sidebar.open();
  } catch {
    // noop
  }

  try {
    document.body?.classList?.add?.("sidebar-open");
    return true;
  } catch {
    return false;
  }
}

function closeSidebarMobile() {
  const sidebar = getSidebar();

  try {
    if (isFunction(sidebar?.closeSidebar)) return sidebar.closeSidebar();
    if (isFunction(sidebar?.close)) return sidebar.close();
  } catch {
    // noop
  }

  try {
    document.body?.classList?.remove?.("sidebar-open");
    return true;
  } catch {
    return false;
  }
}

function toggleSidebarMobile() {
  const sidebar = getSidebar();

  try {
    if (isFunction(sidebar?.toggleSidebar)) return sidebar.toggleSidebar();
    if (isFunction(sidebar?.toggle)) return sidebar.toggle();
  } catch {
    // noop
  }

  try {
    document.body?.classList?.toggle?.("sidebar-open");
    return true;
  } catch {
    return false;
  }
}

function setMobileToggleState() {
  const { sidebarToggle } = getDom();

  if (!sidebarToggle) return false;

  try {
    const open = Boolean(AppCore?.state?.sidebarOpen);
    sidebarToggle.setAttribute("aria-expanded", open ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

function syncFixedTopbarOffset() {
  return true;
}

function handleViewportResize() {
  return true;
}

/* =========================================================
   LOGOUT / NAVIGATION
========================================================= */

async function navigateTo(path = LOGIN_ROUTE) {
  const target = normalizePath(path || LOGIN_ROUTE);

  try {
    if (isFunction(Router?.replace)) {
      await Router.replace(target, {
        source: SOURCE,
        replaceState: true,
        force: true,
      });
      return true;
    }

    if (isFunction(Router?.navigate)) {
      await Router.navigate(target, {
        source: SOURCE,
        replaceState: true,
        force: true,
      });
      return true;
    }
  } catch {
    // fallback abajo
  }

  if (!isBrowser()) return false;

  try {
    window.location.assign(target);
    return true;
  } catch {
    return false;
  }
}

async function handleLogout() {
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
  } finally {
    await navigateTo(LOGIN_ROUTE);
  }

  return true;
}

/* =========================================================
   EVENTS
========================================================= */

function onClick(event) {
  const target = event.target;

  if (target?.closest?.("[data-topbar-sidebar-toggle]")) {
    event.preventDefault();
    toggleSidebarMobile();
    setMobileToggleState();
    return;
  }

  if (target?.closest?.("[data-topbar-logout]")) {
    event.preventDefault();
    handleLogout();
  }
}

function bind() {
  if (!root || bound) return true;

  root.addEventListener("click", onClick);

  cleanupClick = () => {
    try {
      root?.removeEventListener?.("click", onClick);
    } catch {
      // noop
    }

    cleanupClick = null;
  };

  bound = true;
  return true;
}

function unbind() {
  try {
    cleanupClick?.();
  } catch {
    cleanupClick = null;
  }

  bound = false;
  return true;
}

/* =========================================================
   LIFECYCLE
========================================================= */

function sync(options = {}) {
  ensureRoot();

  if (!root) return false;

  const path = options.path || options.publicPath || currentPath();

  syncTitle(path);
  renderUser();
  setMobileToggleState();

  setHidden(root, Boolean(AppCore?.state?.chromeHidden || AppCore?.state?.routeMode === "auth"));

  mounted = true;

  return true;
}

function init(options = {}) {
  registerPublicApi();

  initialized = true;

  ensureRoot();
  sync(options);
  bind();

  emit("topbar:ready", {
    initialized: true,
    mounted,
    bound,
  });

  return true;
}

function render(options = {}) {
  return sync(options);
}

function refresh(options = {}) {
  return sync(options);
}

function destroy(options = {}) {
  unbind();

  if (options.unmount === true && root) {
    clear(root);
  }

  initialized = false;
  mounted = false;

  unregisterWindowApi();

  emit("topbar:destroyed");
  return true;
}

/* =========================================================
   SEARCH COMPAT NO-OPS
========================================================= */

function hideSearchResults() {
  return true;
}

function clearSearch() {
  return true;
}

function focusSearch() {
  return false;
}

function clearSearchCache() {
  return true;
}

/* =========================================================
   REGISTRATION
========================================================= */

function registerPublicApi() {
  try {
    AppCore.Topbar = api;
    AppCore.TopbarUI = api;
    AppCore.topbar = api;
    AppCore.topbarUI = api;

    AppCore.modules?.register?.("Topbar", api);
    AppCore.modules?.register?.("TopbarUI", api);
    AppCore.modules?.register?.("topbar", api);
    AppCore.modules?.register?.("topbarUI", api);
  } catch {
    // noop
  }

  if (isBrowser()) {
    try {
      window.TopbarUI = api;
      window.OnionTopbarUI = api;
    } catch {
      // noop
    }
  }

  return true;
}

function unregisterWindowApi() {
  if (!isBrowser()) return false;

  try {
    if (window.TopbarUI === api) delete window.TopbarUI;
    if (window.OnionTopbarUI === api) delete window.OnionTopbarUI;
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getDomSnapshot() {
  const dom = getDom();

  return {
    topbar: Boolean(dom.topbar),
    title: Boolean(dom.title),
    user: Boolean(dom.user),
    sidebarToggle: Boolean(dom.sidebarToggle),
  };
}

function getState() {
  return {
    version: TOPBAR_UI_VERSION,

    initialized,
    mounted,
    bound,

    title: root?.querySelector?.("[data-topbar-title]")?.textContent || "",
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

    dom: {
      ...getDomSnapshot(),
      hasSvg: Boolean(root?.querySelector?.("svg")),
    },

    policy: {
      ownAuth: false,
      ownRouter: false,
      ownHttp: false,
      ownStore: false,
      ownToast: false,
      noSubmodules: true,
      noSearchRuntime: true,
      svgIcons: true,
      roles: ["admin", "user"],
    },
  };
}

function getSnapshot() {
  return getState();
}

/* =========================================================
   API
========================================================= */

const api = {
  version: TOPBAR_UI_VERSION,

  init,
  render,
  refresh,
  sync,

  renderUser,
  refreshUser: renderUser,
  updateUser: renderUser,
  syncUser: renderUser,

  bind,
  rebind: sync,
  hardRebind: sync,
  queueRebind: sync,
  destroy,

  mountTopbar: ensureRoot,

  unmountTopbar: (options = {}) => {
    destroy({
      ...options,
      unmount: true,
    });
    return true;
  },

  syncDomCache: getDom,
  getDom,

  syncTitle,
  resolveRouteTitle,

  openSidebarMobile,
  closeSidebarMobile,
  toggleSidebarMobile,
  syncFixedTopbarOffset,
  setMobileToggleState,
  handleViewportResize,

  hideSearchResults,
  clearSearch,
  focusSearch,
  clearSearchCache,

  getState,
  getSnapshot,

  get runtime() {
    return {};
  },

  get initialized() {
    return initialized;
  },

  get bound() {
    return bound;
  },

  get binding() {
    return false;
  },

  get rebinding() {
    return false;
  },
};

registerPublicApi();

export const TopbarUI = api;

export default TopbarUI;
