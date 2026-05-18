/* =========================================================
   Onion Support - Sidebar UI
   Archivo: /src/ui/sidebar/index.js

   Responsabilidad:
   - Conectar el sidebar con el SPA.
   - Montar en #sidebar-mount o #app-sidebar.
   - Construir items desde rutas privadas reales.
   - Ocultar rutas públicas / hideShell.
   - Ocultar rutas admin si no eres admin.
   - Marcar ruta activa.
   - Pasar usuario básico al template.
   - Navegar usando Router.
   - Logout usando Auth.
   - Sin HTML duplicado.
   - Sin HTTP.
   - Sin Toast.
   - Sin Store propio.
   - Sin dropdown.
   - Sin bridges globales.
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";
import { Router } from "../../router/index.js";
import { getImmutableRoutes } from "../../router/routes.js";
import { createSidebarTemplate } from "./template.js";

export const SIDEBAR_UI_VERSION = "sidebar-ui.v1";

const SOURCE = "sidebar.ui";
const LOGIN_ROUTE = "/login";

const PUBLIC_ROUTES = new Set([
  "/login",
  "/password-request",
  "/password-reset",
  "/activate-account",
]);

let initialized = false;
let mounted = false;
let logoutInFlight = false;
let sidebarOpen = true;
let root = null;
let boundRoot = null;

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
    const routerPath =
      Router?.getCurrentCanonicalPath?.() ||
      Router?.getCurrentPath?.() ||
      Router?.currentPath;

    if (routerPath) return canonicalPath(routerPath);
  } catch {
    // noop
  }

  try {
    const route = AppCore?.state?.route;

    if (typeof route === "string") return canonicalPath(route);
    if (isObject(route) && route.path) return canonicalPath(route.path);

    if (AppCore?.state?.canonicalPath) {
      return canonicalPath(AppCore.state.canonicalPath);
    }
  } catch {
    // noop
  }

  return isBrowser() ? canonicalPath(window.location.pathname || "/") : "/";
}

/* =========================================================
   AUTH / USER
========================================================= */

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  const status = String(user.status || user.estado || "").toLowerCase();

  return (
    user.disabled === true ||
    user.deleted === true ||
    status === "disabled" ||
    status === "deleted"
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
  const candidates = [];

  try {
    candidates.push(Auth?.getUser?.());
    candidates.push(Auth?.getCurrentUser?.());
    candidates.push(Auth?.user);
    candidates.push(Auth?.currentUser);
  } catch {
    // noop
  }

  try {
    const state = isObject(AppCore?.state) ? AppCore.state : {};

    candidates.push(state.user);
    candidates.push(state.currentUser);
    candidates.push(state.authUser);
    candidates.push(state.sessionUser);
    candidates.push(state.session?.user);
  } catch {
    // noop
  }

  return candidates.find(usableUser) || null;
}

function hasToken() {
  try {
    if (Auth?.isAuthenticated?.() === false) return false;
    if (Auth?.isAuthenticated?.() === true) return true;
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

    return Boolean(text(token));
  } catch {
    return false;
  }
}

function hasSession() {
  return hasToken() && Boolean(getUser());
}

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    return value.map(normalizeRole).includes("admin") ? "admin" : "user";
  }

  return String(value || "").toLowerCase() === "admin" ? "admin" : "user";
}

function getRole(user = getUser()) {
  try {
    const role = Auth?.getRole?.() || Auth?.getCurrentRole?.();

    if (role) return normalizeRole(role);
  } catch {
    // noop
  }

  if (Array.isArray(user?.roles) && user.roles.includes("admin")) {
    return "admin";
  }

  return normalizeRole(
    user?.role ||
      user?.rol ||
      AppCore?.state?.role ||
      "user"
  );
}

function isAdmin() {
  return getRole() === "admin";
}

function displayName(user = null) {
  return text(
    user?.displayName ||
      user?.fullName ||
      user?.name ||
      user?.nombre ||
      user?.username ||
      user?.email,
    "Usuario"
  );
}

function initialsFromName(name = "") {
  const parts = text(name, "Usuario").split(/\s+/).filter(Boolean);

  if (parts.length <= 1) {
    return text(parts[0], "U").slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function sidebarUser() {
  const user = getUser();
  const name = displayName(user);
  const role = getRole(user);

  return {
    displayName: name,
    initials: initialsFromName(name),
    roleLabel: role === "admin" ? "Admin" : "Usuario",
  };
}

/* =========================================================
   ROUTES
========================================================= */

function allRoutes() {
  try {
    const routes = getImmutableRoutes();

    return Array.isArray(routes) ? routes : [];
  } catch {
    return [];
  }
}

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

  return (
    route?.admin === true ||
    route?.adminOnly === true ||
    route?.requiresAdmin === true ||
    route?.meta?.admin === true ||
    route?.meta?.adminOnly === true ||
    roles.includes("admin")
  );
}

function routeIsPublic(route = null) {
  const path = canonicalPath(route?.path || "/");

  return (
    route?.public === true ||
    route?.hideShell === true ||
    route?.shell === false ||
    PUBLIC_ROUTES.has(path)
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

function routeAllowed(route = null) {
  if (routeRequiresAdmin(route)) return isAdmin();

  return true;
}

function routeOrder(route = null, index = 0) {
  const value =
    route?.sidebarOrder ??
    route?.navOrder ??
    route?.menuOrder ??
    route?.order ??
    index;

  const number = Number(value);

  return Number.isFinite(number) ? number : index;
}

function routeLabel(route = null) {
  const path = canonicalPath(route?.path || "/");

  const fallback =
    path === "/"
      ? "Inicio"
      : path
          .replace(/^\//, "")
          .replace(/[-_]+/g, " ")
          .replace(/^\w/, (letter) => letter.toUpperCase());

  return text(
    route?.sidebarLabel ||
      route?.navLabel ||
      route?.menuLabel ||
      route?.title ||
      route?.label ||
      route?.name,
    fallback
  );
}

function routeIcon(route = null) {
  const path = canonicalPath(route?.path || "/");
  const key = String(
    route?.icon ||
      route?.viewKey ||
      route?.name ||
      route?.id ||
      route?.title ||
      ""
  ).toLowerCase();

  if (path === "/") return "home";

  if (path.includes("incidencia") || path.includes("ticket")) {
    return "incidencias";
  }

  if (path.includes("factura") || path.includes("invoice")) {
    return "facturas";
  }

  if (path.includes("cliente") || path.includes("client")) {
    return "clientes";
  }

  if (path.includes("usuario") || path.includes("user")) {
    return "usuarios";
  }

  if (path.includes("cuenta") || path.includes("account")) {
    return "cuenta";
  }

  if (path.includes("ajuste") || path.includes("setting")) {
    return "ajustes";
  }

  if (path.includes("servidor") || path.includes("server")) {
    return "servidor";
  }

  if (key.includes("incidencia") || key.includes("ticket")) {
    return "incidencias";
  }

  if (key.includes("factura") || key.includes("invoice")) {
    return "facturas";
  }

  if (key.includes("cliente") || key.includes("client")) {
    return "clientes";
  }

  if (key.includes("usuario") || key.includes("user")) {
    return "usuarios";
  }

  if (key.includes("cuenta") || key.includes("account")) {
    return "cuenta";
  }

  if (key.includes("ajuste") || key.includes("setting")) {
    return "ajustes";
  }

  if (key.includes("servidor") || key.includes("server")) {
    return "servidor";
  }

  return "home";
}

function routeActive(path = "/", current = currentPath()) {
  const routePath = canonicalPath(path);

  if (routePath === "/") return current === "/";

  return current === routePath || current.startsWith(`${routePath}/`);
}

function sidebarRoutes() {
  const seen = new Set();

  return allRoutes()
    .map((route, index) => ({ route, index }))
    .filter(({ route }) => routeVisibleInSidebar(route))
    .filter(({ route }) => routeAllowed(route))
    .filter(({ route }) => {
      const path = canonicalPath(route.path);

      if (seen.has(path)) return false;

      seen.add(path);
      return true;
    })
    .sort((a, b) => routeOrder(a.route, a.index) - routeOrder(b.route, b.index))
    .map(({ route }) => route);
}

function sidebarItems() {
  const current = currentPath();

  return sidebarRoutes().map((route) => {
    const href = normalizePath(route.path);

    return {
      href,
      label: routeLabel(route),
      icon: routeIcon(route),
      active: routeActive(href, current),
    };
  });
}

function currentRoute() {
  const current = currentPath();

  return allRoutes().find((route) => {
    if (!route?.path) return false;

    return canonicalPath(route.path) === current;
  });
}

/* =========================================================
   VISIBILITY
========================================================= */

function shellHidden() {
  const state = isObject(AppCore?.state) ? AppCore.state : {};

  return Boolean(
    state.chromeHidden ||
      state.shellHidden ||
      state.routeShellHidden ||
      state.routeMode === "auth"
  );
}

function shouldRenderSidebar() {
  const path = currentPath();
  const route = currentRoute();

  if (!hasSession()) return false;
  if (PUBLIC_ROUTES.has(path)) return false;
  if (route && routeIsPublic(route)) return false;
  if (shellHidden()) return false;

  return true;
}

/* =========================================================
   DOM MOUNT
========================================================= */

function getMount() {
  if (!isBrowser()) return null;

  return (
    document.getElementById("sidebar-mount") ||
    document.getElementById("app-sidebar") ||
    document.querySelector("[data-sidebar-mount]") ||
    document.querySelector("[data-sidebar-root]")
  );
}

function isSidebarRoot(node = null) {
  if (!node) return false;

  return (
    node.id === "app-sidebar" ||
    node.dataset?.sidebarRoot === "true" ||
    node.matches?.("aside.sidebar")
  );
}

function hideSidebar() {
  const mount = getMount();

  unbindEvents();

  const target = isSidebarRoot(mount)
    ? mount
    : mount?.querySelector?.("[data-sidebar-root]");

  if (target) {
    target.hidden = true;
    target.setAttribute("aria-hidden", "true");
    target.replaceChildren();
    root = target;
  }

  mounted = false;

  return true;
}

function mountSidebar(nextRoot) {
  const mount = getMount();

  if (!mount || !nextRoot) return false;

  unbindEvents();

  if (isSidebarRoot(mount)) {
    mount.replaceWith(nextRoot);
  } else {
    mount.replaceChildren(nextRoot);
  }

  root = nextRoot;
  root.hidden = false;
  root.setAttribute("aria-hidden", "false");

  mounted = true;

  return bindEvents();
}

function syncOpenState() {
  if (!root) return false;

  root.dataset.open = sidebarOpen ? "true" : "false";
  root.classList.toggle("is-open", sidebarOpen);
  root.classList.toggle("is-collapsed", !sidebarOpen);

  const toggle = root.querySelector("[data-sidebar-toggle]");

  if (toggle) {
    toggle.setAttribute("aria-expanded", sidebarOpen ? "true" : "false");
    toggle.setAttribute(
      "aria-label",
      sidebarOpen ? "Cerrar navegación" : "Abrir navegación"
    );
  }

  return true;
}

/* =========================================================
   NAVIGATION / ACTIONS
========================================================= */

function isPlainLeftClick(event) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function internalHref(href = "") {
  const value = text(href);

  if (!value || value === "#") return false;
  if (value.startsWith("mailto:")) return false;
  if (value.startsWith("tel:")) return false;
  if (/^https?:\/\//i.test(value)) return false;

  return true;
}

async function navigateTo(path = "/", options = {}) {
  const target = normalizePath(path);
  const replace = options.replace === true || options.replaceState === true;

  try {
    if (replace && isFunction(Router?.replace)) {
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
      if (replace) window.location.replace(target);
      else window.location.assign(target);
    }

    sync();

    return true;
  } catch {
    return false;
  }
}

function setSidebarOpen(open = true) {
  sidebarOpen = Boolean(open);

  try {
    AppCore.state = isObject(AppCore.state) ? AppCore.state : {};
    AppCore.state.sidebarOpen = sidebarOpen;
  } catch {
    // noop
  }

  syncOpenState();

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

async function handleLogout() {
  if (logoutInFlight) return false;

  logoutInFlight = true;

  try {
    root
      ?.querySelector?.("[data-sidebar-logout]")
      ?.setAttribute("aria-busy", "true");

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

    return await navigateTo(LOGIN_ROUTE, {
      replace: true,
      force: true,
    });
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

  const link = target?.closest?.("[data-sidebar-link]");

  if (!link || !isPlainLeftClick(event)) return;
  if (link.dataset.disabled === "true") return;

  const href = link.getAttribute("href") || "";

  if (!internalHref(href)) return;

  event.preventDefault();
  navigateTo(href);
}

function bindEvents() {
  if (!root) return false;
  if (boundRoot === root) return true;

  unbindEvents();

  root.addEventListener("click", onClick);
  boundRoot = root;

  return true;
}

function unbindEvents() {
  if (!boundRoot) return true;

  try {
    boundRoot.removeEventListener("click", onClick);
  } catch {
    // noop
  }

  boundRoot = null;

  return true;
}

/* =========================================================
   CORE REGISTRATION
========================================================= */

function registerModule() {
  try {
    AppCore.ui = isObject(AppCore.ui) ? AppCore.ui : {};
    AppCore.ui.sidebar = api;

    AppCore.modules?.register?.("sidebar", api);

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   LIFECYCLE
========================================================= */

function sync() {
  registerModule();

  if (!isBrowser()) return api;

  if (!shouldRenderSidebar()) {
    hideSidebar();
    return api;
  }

  const nextRoot = createSidebarTemplate({
    id: "app-sidebar",
    brandLabel: "Onion Support",
    brandHref: "/",
    open: sidebarOpen,
    items: sidebarItems(),
    user: sidebarUser(),
  });

  mountSidebar(nextRoot);
  syncOpenState();

  return api;
}

function init() {
  if (initialized) return sync();

  initialized = true;

  return sync();
}

function destroy() {
  unbindEvents();

  if (root) {
    root.hidden = true;
    root.removeAttribute("aria-hidden");
    root.replaceChildren();
    root.classList.remove("is-open", "is-collapsed");
    delete root.dataset.open;
  }

  initialized = false;
  mounted = false;
  logoutInFlight = false;
  root = null;

  return api;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getSnapshot() {
  const user = getUser();

  return {
    version: SIDEBAR_UI_VERSION,
    initialized,
    mounted,
    open: sidebarOpen,
    logoutInFlight,
    route: currentPath(),
    isAdmin: isAdmin(),
    user: user
      ? {
          id: user.id || user.userId || null,
          userId: user.userId || user.id || null,
          username: user.username || user.slug || null,
          displayName: displayName(user),
          role: getRole(user),
        }
      : null,
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
    return initialized;
  },

  get mounted() {
    return mounted;
  },

  get logoutInFlight() {
    return logoutInFlight;
  },
};

registerModule();

export const SidebarUI = api;

export default SidebarUI;
