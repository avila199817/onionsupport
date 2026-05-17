/* =========================================================
   Onion Support - Router Shell
   Archivo: /src/router/shell.js

   Responsabilidad:
   - Bridge mínimo Router → Shell DOM.
   - Limpiar slots dinámicos mínimos.
   - Aplicar document.title.
   - Marcar menú activo.
   - Mostrar/ocultar chrome según route.hideShell.
   - Sin Auth.
   - Sin guards.
   - Sin render de vistas.
   - Sin history.
   - Sin storage.
   - Sin Toast.
   - Sin eventos.
   - Sin rutas inventadas.
   - Sin magia negra.
========================================================= */

export const ROUTER_SHELL_VERSION = "simple";

const SOURCE = "router.shell";
const APP_NAME = "Onion Support";

const ACTIVE_CLASSES = ["active", "is-active", "router-active"];
const ROOT_READY_CLASSES = ["app-ready"];
const ROOT_LOADING_CLASSES = ["app-loading", "app-booting", "loading"];

const MENU_SELECTOR = [
  "a[data-spa]",
  "a[href][data-route]",
  "a[href][data-nav-route]",
  "a[href][data-menu-route]",
  "[data-route]",
  "[data-nav-route]",
  "[data-menu-route]",
  "[data-sidebar-route]",
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

function normalizePath(path = "/") {
  let value = text(path, "/");

  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value, isBrowser() ? window.location.origin : "http://localhost");
      value = `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`;
    }
  } catch {
    // noop
  }

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

function safeTitle(value = "") {
  return text(value, APP_NAME).slice(0, 140);
}

function appName(AppCore = null) {
  return text(AppCore?.config?.appName, APP_NAME);
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

function setHidden(node, hidden = false) {
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

function setData(node, key = "", value = "") {
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

function setAttr(node, key = "", value = "") {
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

function addClasses(node, classes = []) {
  if (!node) return false;

  try {
    node.classList.add(...classes.filter(Boolean));
    return true;
  } catch {
    return false;
  }
}

function removeClasses(node, classes = []) {
  if (!node) return false;

  try {
    node.classList.remove(...classes.filter(Boolean));
    return true;
  } catch {
    return false;
  }
}

function toggleClass(node, className = "", active = false) {
  if (!node || !className) return false;

  try {
    node.classList.toggle(className, Boolean(active));
    return true;
  } catch {
    return false;
  }
}

function clearNode(node) {
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
  const sidebar = query("#app-sidebar") || query("#sidebar") || query("[data-sidebar-root]");
  const topbar = query("#app-topbar") || query("#topbar") || query("[data-topbar-root]");
  const tablehead = query("#table-head");
  const tableheadContainer = query("#tablehead-container");
  const mobileToggle = query("#toggleSidebarMobile") || query("[data-sidebar-mobile-toggle]");
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

  for (const node of queryAll("[data-router-dynamic], [data-dynamic-slot], [data-tablehead-dynamic]")) {
    changed = clearNode(node) || changed;
  }

  return changed;
}

/* =========================================================
   DOCUMENT TITLE
========================================================= */

export function setDocumentTitle(AppCore = null, title = "") {
  const name = appName(AppCore);
  const cleanTitle = safeTitle(title || name);
  const finalTitle = cleanTitle === name ? name : `${cleanTitle} · ${name}`;

  try {
    if (typeof AppCore?.setDocumentTitle === "function") {
      AppCore.setDocumentTitle(cleanTitle, {
        finalTitle,
        source: SOURCE,
      });

      return true;
    }
  } catch {
    // noop
  }

  if (!isBrowser()) return false;

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

function linkPath(link) {
  if (!link) return "";

  for (const attr of [
    "data-canonical-path",
    "data-route-path",
    "data-route",
    "data-nav-route",
    "data-menu-route",
    "data-sidebar-route",
    "href",
  ]) {
    const value = text(link.getAttribute?.(attr), "");

    if (value) return value;
  }

  return "";
}

function isExternalHref(href = "") {
  const value = text(href, "");

  if (!value) return false;
  if (value.startsWith("#")) return true;
  if (value.startsWith("mailto:") || value.startsWith("tel:")) return true;
  if (value.startsWith("//")) return true;

  if (/^https?:\/\//i.test(value) && isBrowser()) {
    try {
      return new URL(value, window.location.origin).origin !== window.location.origin;
    } catch {
      return true;
    }
  }

  return false;
}

function activeParent(link) {
  try {
    return link.closest("[data-menu-item], [data-sidebar-item], .menu-item, .nav-item, li");
  } catch {
    return null;
  }
}

function setActive(node, active = false) {
  if (!node) return false;

  for (const className of ACTIVE_CLASSES) {
    toggleClass(node, className, active);
  }

  setData(node, "active", active ? "true" : "false");
  setAttr(node, "aria-current", active ? "page" : "");

  return true;
}

export function setActiveMenu(_AppCore = null, pathname = "/") {
  if (!isBrowser()) return false;

  const current = canonicalPath(pathname || "/");
  const links = queryAll(MENU_SELECTOR);

  for (const link of links) {
    setActive(link, false);

    const parent = activeParent(link);
    if (parent && parent !== link) setActive(parent, false);
  }

  for (const link of links) {
    const href = linkPath(link);

    if (!href || isExternalHref(href)) continue;

    const candidate = canonicalPath(href);

    if (candidate !== current) continue;

    setActive(link, true);

    const parent = activeParent(link);
    if (parent && parent !== link) setActive(parent, true);
  }

  return true;
}

/* =========================================================
   SHELL MODE
========================================================= */

function routePath(route = null) {
  return canonicalPath(route?.canonicalPath || route?.path || "/");
}

function routeHidesChrome(route = null) {
  const meta = isObject(route?.meta) ? route.meta : {};

  return Boolean(
    route?.hideShell === true ||
      route?.shell === false ||
      route?.showShell === false ||
      route?.layout === "auth" ||
      route?.authScreen === true ||
      route?.public === true ||
      meta.hideShell === true ||
      meta.shell === false ||
      meta.showShell === false ||
      meta.layout === "auth" ||
      meta.authScreen === true
  );
}

function exposeLayout(elements) {
  for (const node of [
    elements.shell,
    elements.main,
    elements.appContent,
    elements.viewContainer,
  ]) {
    setHidden(node, false);
  }
}

function applyRootState(elements, { chromeHidden = false, mode = "app", route = "/" } = {}) {
  const { html, body, shell } = elements;

  for (const root of [html, body]) {
    removeClasses(root, ROOT_LOADING_CLASSES);
    addClasses(root, ROOT_READY_CLASSES);

    toggleClass(root, "route-auth", chromeHidden);
    toggleClass(root, "route-app", !chromeHidden);
    toggleClass(root, "shell-hidden", chromeHidden);
    toggleClass(root, "shell-visible", !chromeHidden);

    setData(root, "routeMode", mode);
    setData(root, "chrome", chromeHidden ? "hidden" : "visible");
    setData(root, "currentRoute", route);
    setData(root, "appLoading", "false");
  }

  setData(shell, "routeMode", mode);
  setData(shell, "chrome", chromeHidden ? "hidden" : "visible");
  setData(shell, "currentRoute", route);
}

function applyChrome(elements, hidden = false) {
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

  const showTablehead = !hidden && Boolean(elements.tableheadContainer?.childElementCount);

  setHidden(elements.tablehead, !showTablehead);
  setHidden(elements.tableheadContainer, hidden || !showTablehead);
}

function syncState(AppCore = null, patch = {}) {
  try {
    AppCore?.setState?.(patch, {
      source: SOURCE,
      silent: true,
      emit: false,
    });
  } catch {
    try {
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
    shellVisible: !chromeHidden,
    shellHidden: chromeHidden,
    routeShellHidden: chromeHidden,
    chromeVisible: !chromeHidden,
    chromeHidden,
    authScreen: chromeHidden,
    routeMode: mode,
    currentShellRoute: path,
  });

  return {
    hidden: chromeHidden,
    visible: !chromeHidden,
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

function elementSnapshot(node) {
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

  return {
    version: ROUTER_SHELL_VERSION,
    source: SOURCE,

    route: canonicalPath(AppCore?.state?.route || "/"),
    publicPath: text(AppCore?.state?.publicPath, ""),

    shellVisible: AppCore?.state?.shellVisible ?? null,
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
      noRoutesHardcoded: true,
      shellOnly: true,
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
