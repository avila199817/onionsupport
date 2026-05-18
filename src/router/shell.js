/* =========================================================
   Onion Support - Router Shell
   Archivo: /src/router/shell.js

   Responsabilidad:
   - Bridge mínimo Router → Shell DOM.
   - Limpiar tablehead.
   - Aplicar document.title.
   - Marcar menú activo usando canonicalPath.
   - /@{user.slug} marca Home porque canonicalPath = /.
   - Mostrar/ocultar chrome según route.hideShell.
   - Mantener app-shell visible.
   - Sin Auth.
   - Sin guards.
   - Sin render de vistas.
   - Sin history.
   - Sin storage.
   - Sin Toast.
   - Sin eventos.
   - Sin rutas inventadas.
   - Sin alias /home.
========================================================= */

export const ROUTER_SHELL_VERSION = "router.shell.v2";

const APP_NAME = "Onion Support";
const HOME_PATH = "/";
const USER_HOME_PREFIX = "/@";

const ACTIVE_CLASS = "is-active";

const ROOT_READY_CLASSES = ["app-ready"];
const ROOT_LOADING_CLASSES = ["app-loading", "app-booting", "loading"];

const MENU_SELECTOR = [
  "a[data-sidebar-link]",
  "a[data-sidebar-nav-link]",
  "a[data-sidebar-brand]",
  "a[data-topbar-link]",
  "a[data-route]",
].join(",");

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

function appName(AppCore = null) {
  return text(AppCore?.config?.appName || AppCore?.config?.name, APP_NAME);
}

function safeTitle(value = "") {
  return text(value, APP_NAME).replace(/\s+/g, " ").slice(0, 140);
}

/* =========================================================
   PATHS
========================================================= */

function normalizeHashPath(path = HOME_PATH) {
  const value = text(path, HOME_PATH);

  if (value.startsWith("#!")) {
    return value.replace(/^#!\/?/, "/") || HOME_PATH;
  }

  if (value.startsWith("#/")) {
    return value.slice(1) || HOME_PATH;
  }

  return value;
}

function pathFromInput(path = HOME_PATH) {
  let value = normalizeHashPath(path);

  if (value.startsWith("//")) {
    return HOME_PATH;
  }

  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(
        value,
        isBrowser() ? window.location.origin : "http://localhost"
      );

      value = `${url.pathname || HOME_PATH}${url.search || ""}${url.hash || ""}`;
    }
  } catch {
    return HOME_PATH;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return HOME_PATH;
  }

  return value;
}

function normalizePath(path = HOME_PATH) {
  let value = pathFromInput(path).replace(/\\/g, "/");

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value = value.replace(/\/{2,}/g, "/");

  return value || HOME_PATH;
}

function stripQueryHash(path = HOME_PATH) {
  return normalizePath(path).split("?")[0].split("#")[0] || HOME_PATH;
}

function normalizeUserSlug(value = "") {
  const slug = text(value, "")
    .replace(/^\/+/, "")
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]
    .trim()
    .toLowerCase();

  if (!slug) return "";

  return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
}

function extractUserHomeSlug(path = HOME_PATH) {
  const value = stripQueryHash(path);

  if (!value.startsWith(USER_HOME_PREFIX)) return "";

  const slug = value.slice(USER_HOME_PREFIX.length);

  if (!slug || slug.includes("/")) return "";

  return normalizeUserSlug(slug);
}

function isUserHomePath(path = HOME_PATH) {
  return Boolean(extractUserHomeSlug(path));
}

function canonicalPath(path = HOME_PATH) {
  let value = stripQueryHash(path);

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || HOME_PATH;
  }

  return isUserHomePath(value) ? HOME_PATH : value;
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

function queryAll(selector = "") {
  if (!isBrowser() || !selector) return [];

  try {
    return [...document.querySelectorAll(selector)];
  } catch {
    return [];
  }
}

function setHidden(node = null, hidden = false) {
  if (!node) return false;

  const value = Boolean(hidden);

  try {
    node.hidden = value;
    node.setAttribute("aria-hidden", value ? "true" : "false");
    node.setAttribute("aria-busy", "false");
    return true;
  } catch {
    return false;
  }
}

function setData(node = null, key = "", value = "") {
  if (!node || !key) return false;

  try {
    if (value === null || value === undefined || value === "") {
      delete node.dataset[key];
    } else {
      node.dataset[key] = String(value);
    }

    return true;
  } catch {
    return false;
  }
}

function setAttr(node = null, key = "", value = "") {
  if (!node || !key) return false;

  try {
    if (value === null || value === undefined || value === "") {
      node.removeAttribute(key);
    } else {
      node.setAttribute(key, String(value));
    }

    return true;
  } catch {
    return false;
  }
}

function addClasses(node = null, classes = []) {
  if (!node) return false;

  try {
    node.classList.add(...classes.filter(Boolean));
    return true;
  } catch {
    return false;
  }
}

function removeClasses(node = null, classes = []) {
  if (!node) return false;

  try {
    node.classList.remove(...classes.filter(Boolean));
    return true;
  } catch {
    return false;
  }
}

function toggleClass(node = null, className = "", active = false) {
  if (!node || !className) return false;

  try {
    node.classList.toggle(className, Boolean(active));
    return true;
  } catch {
    return false;
  }
}

function clearNode(node = null) {
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

function cacheDom(AppCore = null, key = "", node = null) {
  if (!AppCore || !key || !node) return node;

  try {
    AppCore.dom = isObject(AppCore.dom) ? AppCore.dom : {};
    AppCore.dom[key] = node;
  } catch {
    // noop
  }

  return node;
}

/* =========================================================
   ELEMENTS
========================================================= */

export function getShellElements(AppCore = null) {
  if (!isBrowser()) {
    return {
      html: null,
      body: null,
      shell: null,
      main: null,
      appContent: null,
      viewContainer: null,
      sidebarMount: null,
      topbarMount: null,
      sidebar: null,
      topbar: null,
      tablehead: null,
      tableheadContainer: null,
      mobileToggle: null,
      loader: null,
    };
  }

  const html = document.documentElement;
  const body = document.body;

  const shell = query("#app-shell");
  const main = query("#main-content");
  const appContent = query("#app-content");
  const viewContainer = query("#view-container");

  const sidebarMount = query("#sidebar-mount");
  const topbarMount = query("#topbar-mount");

  const sidebar = query("#app-sidebar") || query("[data-sidebar-root]");
  const topbar = query("#app-topbar") || query("[data-topbar-root]");

  const tablehead = query("#table-head");
  const tableheadContainer = query("#tablehead-container");

  const mobileToggle =
    query("[data-topbar-sidebar-toggle]") ||
    query("[data-sidebar-mobile-toggle]") ||
    null;

  const loader = query("#app-loader");

  cacheDom(AppCore, "html", html);
  cacheDom(AppCore, "body", body);
  cacheDom(AppCore, "shell", shell);
  cacheDom(AppCore, "main", main);
  cacheDom(AppCore, "mainContent", main);
  cacheDom(AppCore, "appContent", appContent);
  cacheDom(AppCore, "viewContainer", viewContainer);
  cacheDom(AppCore, "sidebarMount", sidebarMount);
  cacheDom(AppCore, "topbarMount", topbarMount);
  cacheDom(AppCore, "sidebar", sidebar);
  cacheDom(AppCore, "topbar", topbar);
  cacheDom(AppCore, "tablehead", tablehead);
  cacheDom(AppCore, "tableHead", tablehead);
  cacheDom(AppCore, "tableheadContainer", tableheadContainer);
  cacheDom(AppCore, "tableHeadContainer", tableheadContainer);
  cacheDom(AppCore, "mobileToggle", mobileToggle);
  cacheDom(AppCore, "loader", loader);

  return {
    html,
    body,
    shell,
    main,
    appContent,
    viewContainer,
    sidebarMount,
    topbarMount,
    sidebar,
    topbar,
    tablehead,
    tableheadContainer,
    mobileToggle,
    loader,
  };
}

/* =========================================================
   CLEAR DYNAMIC
========================================================= */

export function clearDynamicContainers(AppCore = null) {
  if (!isBrowser()) return false;

  const { tablehead, tableheadContainer } = getShellElements(AppCore);

  let changed = false;

  if (tableheadContainer) {
    changed = clearNode(tableheadContainer) || changed;
  }

  if (tablehead) {
    setHidden(tablehead, true);
    setData(tablehead, "tableheadState", "empty");
    changed = true;
  }

  return changed;
}

/* =========================================================
   DOCUMENT TITLE
========================================================= */

export function setDocumentTitle(AppCore = null, title = "") {
  if (!isBrowser()) return false;

  const name = appName(AppCore);
  const cleanTitle = safeTitle(title || name);
  const finalTitle = cleanTitle === name ? name : `${cleanTitle} · ${name}`;

  try {
    document.title = finalTitle;
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ACTIVE MENU
========================================================= */

function linkPath(link = null) {
  if (!link) return "";

  for (const attr of [
    "data-canonical-path",
    "data-route-path",
    "data-route",
    "data-sidebar-route",
    "href",
  ]) {
    const value = text(link.getAttribute?.(attr), "");

    if (value) return value;
  }

  return "";
}

function isIgnoredHref(href = "") {
  const value = text(href, "");

  if (!value) return true;
  if (value.startsWith("#")) return true;
  if (value.startsWith("mailto:") || value.startsWith("tel:")) return true;
  if (value.startsWith("//")) return true;

  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) {
    return true;
  }

  if (/^https?:\/\//i.test(value) && isBrowser()) {
    try {
      return new URL(value, window.location.origin).origin !== window.location.origin;
    } catch {
      return true;
    }
  }

  return false;
}

function setActive(node = null, active = false) {
  if (!node) return false;

  toggleClass(node, ACTIVE_CLASS, active);
  setData(node, "active", active ? "true" : "false");
  setAttr(node, "aria-current", active ? "page" : "");

  return true;
}

export function setActiveMenu(_AppCore = null, pathname = HOME_PATH) {
  if (!isBrowser()) return false;

  const current = canonicalPath(pathname || HOME_PATH);
  const links = queryAll(MENU_SELECTOR);

  for (const link of links) {
    setActive(link, false);
  }

  for (const link of links) {
    const href = linkPath(link);

    if (isIgnoredHref(href)) continue;

    const candidate = canonicalPath(href);

    if (candidate === current) {
      setActive(link, true);
    }
  }

  return true;
}

/* =========================================================
   SHELL MODE
========================================================= */

function routePath(route = null) {
  return canonicalPath(route?.canonicalPath || route?.path || HOME_PATH);
}

function routeHidesChrome(route = null) {
  return Boolean(
    route?.hideShell === true ||
      route?.shell === false ||
      route?.showShell === false ||
      route?.layout === "auth" ||
      route?.authScreen === true ||
      route?.public === true
  );
}

function exposeLayout(elements = {}) {
  for (const node of [
    elements.shell,
    elements.main,
    elements.appContent,
    elements.viewContainer,
  ]) {
    setHidden(node, false);
  }
}

function applyRootState(
  elements = {},
  {
    chromeHidden = false,
    mode = "app",
    route = HOME_PATH,
  } = {}
) {
  const { html, body, shell } = elements;

  for (const root of [html, body]) {
    removeClasses(root, ROOT_LOADING_CLASSES);
    addClasses(root, ROOT_READY_CLASSES);

    toggleClass(root, "route-auth", chromeHidden);
    toggleClass(root, "route-app", !chromeHidden);
    toggleClass(root, "shell-hidden", false);
    toggleClass(root, "shell-visible", true);

    setData(root, "appLoading", "false");
    setData(root, "appBooting", "false");
    setData(root, "appReady", "true");

    setData(root, "routeMode", mode);
    setData(root, "chrome", chromeHidden ? "hidden" : "visible");
    setData(root, "shell", "visible");
    setData(root, "shellState", "ready");
    setData(root, "shellInteractive", "true");
    setData(root, "currentRoute", route);
  }

  setHidden(shell, false);
  setData(shell, "routeMode", mode);
  setData(shell, "chrome", chromeHidden ? "hidden" : "visible");
  setData(shell, "shell", "visible");
  setData(shell, "shellState", "ready");
  setData(shell, "shellInteractive", "true");
  setData(shell, "currentRoute", route);
}

function applyChrome(elements = {}, hidden = false) {
  for (const node of [
    elements.sidebarMount,
    elements.topbarMount,
    elements.sidebar,
    elements.topbar,
    elements.mobileToggle,
  ]) {
    setHidden(node, hidden);
  }

  if (hidden) {
    setAttr(elements.mobileToggle, "aria-expanded", "false");
  }

  const hasTablehead = Boolean(elements.tableheadContainer?.childElementCount);
  const showTablehead = !hidden && hasTablehead;

  setHidden(elements.tablehead, !showTablehead);
  setHidden(elements.tableheadContainer, hidden || !showTablehead);

  setData(elements.tablehead, "tableheadState", showTablehead ? "visible" : "empty");
}

function syncState(AppCore = null, patch = {}) {
  try {
    AppCore?.setState?.(patch, {
      source: "router.shell",
      silent: true,
      emit: false,
    });
  } catch {
    try {
      AppCore.state = isObject(AppCore.state) ? AppCore.state : {};
      Object.assign(AppCore.state, patch);
    } catch {
      // noop
    }
  }

  return patch;
}

export function setShellMode(AppCore = null, route = null) {
  const path = routePath(route);
  const chromeHidden = routeHidesChrome(route);
  const mode = chromeHidden ? "auth" : "app";
  const elements = getShellElements(AppCore);

  exposeLayout(elements);
  applyChrome(elements, chromeHidden);

  applyRootState(elements, {
    chromeHidden,
    mode,
    route: path,
  });

  const patch = syncState(AppCore, {
    appShellVisible: true,

    shellVisible: true,
    shellHidden: false,
    routeShellHidden: chromeHidden,

    chromeVisible: !chromeHidden,
    chromeHidden,

    authScreen: chromeHidden,
    routeMode: mode,
    currentShellRoute: path,
  });

  return {
    hidden: false,
    visible: true,

    chromeHidden,
    chromeVisible: !chromeHidden,

    authScreen: chromeHidden,
    mode,
    route: path,
    state: patch,
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

function elementSnapshot(node = null) {
  if (!node) {
    return {
      exists: false,
    };
  }

  return {
    exists: true,
    id: node.id || "",
    tag: node.tagName?.toLowerCase?.() || "",
    hidden: Boolean(node.hidden),
    ariaHidden: node.getAttribute?.("aria-hidden") || "",
    ariaBusy: node.getAttribute?.("aria-busy") || "",
  };
}

export function getShellSnapshot(AppCore = null) {
  const elements = getShellElements(AppCore);
  const publicPath = text(AppCore?.state?.publicPath, "");
  const route = canonicalPath(
    AppCore?.state?.route ||
      AppCore?.state?.canonicalPath ||
      publicPath ||
      HOME_PATH
  );

  return {
    version: ROUTER_SHELL_VERSION,
    source: "router.shell",

    route,
    publicPath,
    publicSlug: extractUserHomeSlug(publicPath) || null,
    isUserHomePath: isUserHomePath(publicPath || HOME_PATH),

    shellVisible: AppCore?.state?.shellVisible ?? null,
    shellHidden: AppCore?.state?.shellHidden ?? null,

    chromeVisible: AppCore?.state?.chromeVisible ?? null,
    chromeHidden: AppCore?.state?.chromeHidden ?? null,

    authScreen: AppCore?.state?.authScreen ?? null,
    routeMode: AppCore?.state?.routeMode || null,

    dom: {
      html: elementSnapshot(elements.html),
      body: elementSnapshot(elements.body),
      shell: elementSnapshot(elements.shell),
      main: elementSnapshot(elements.main),
      appContent: elementSnapshot(elements.appContent),
      viewContainer: elementSnapshot(elements.viewContainer),
      sidebarMount: elementSnapshot(elements.sidebarMount),
      topbarMount: elementSnapshot(elements.topbarMount),
      sidebar: elementSnapshot(elements.sidebar),
      topbar: elementSnapshot(elements.topbar),
      tablehead: elementSnapshot(elements.tablehead),
      tableheadContainer: elementSnapshot(elements.tableheadContainer),
      mobileToggle: elementSnapshot(elements.mobileToggle),
      loader: elementSnapshot(elements.loader),
    },

    policy: {
      ownAuth: false,
      ownGuards: false,
      ownRender: false,
      ownHistory: false,
      ownStorage: false,
      ownToast: false,

      shellOnly: true,
      userSlugHome: true,
      canonicalizesUserHome: true,

      noHomeAlias: true,
      chromeOnlyForAuth: true,
      eventless: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  ROUTER_SHELL_VERSION,

  getShellElements,

  clearDynamicContainers,
  setDocumentTitle,
  setActiveMenu,
  setShellMode,

  getShellSnapshot,
};
