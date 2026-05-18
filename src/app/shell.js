/* =========================================================
   Onion Support - App Shell
   Archivo: /src/app/shell.js

   Responsabilidad:
   - Controlar el shell real del index.html.
   - Mantener app-shell visible.
   - Mostrar/ocultar chrome.
   - Obtener #view-container.
   - Marcar ready/busy.
   - Sin imports.
   - Sin Router interno.
   - Sin Auth.
   - Sin eventos.
   - Sin debug pesado.
   - Sin rutas inventadas.
   - Sin magia negra.
========================================================= */

export const SHELL_VERSION = "simple";

const PUBLIC_PATHS = Object.freeze([
  "/login",
  "/password-request",
  "/password-reset",
  "/activate-account",
]);

const READY_CLASSES = ["app-ready"];
const LOADING_CLASSES = ["app-loading", "app-booting", "loading"];

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function byId(id = "") {
  if (!isBrowser() || !id) return null;

  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

function query(selector = "") {
  if (!isBrowser() || !selector) return null;

  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function currentBrowserPath() {
  if (!isBrowser()) return "/";

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function normalizePublicPath(value = "/") {
  let path = text(value, "/");

  if (path.startsWith("#/")) path = path.slice(1);
  if (path.startsWith("#!")) path = path.replace(/^#!\/?/, "/");

  if (!path.startsWith("/")) path = `/${path}`;

  path = path.replace(/\/{2,}/g, "/");

  return path || "/";
}

function cleanPath(value = "/") {
  let path = normalizePublicPath(value).split("?")[0].split("#")[0] || "/";

  if (path.length > 1) {
    path = path.replace(/\/+$/g, "") || "/";
  }

  return path;
}

function isPublicPath(value = currentBrowserPath()) {
  const current = cleanPath(value);

  return PUBLIC_PATHS.includes(current);
}

function hasContent(element = null) {
  return Boolean(
    element &&
      (element.childElementCount > 0 || text(element.textContent, ""))
  );
}

/* =========================================================
   DOM HELPERS
========================================================= */

function setHidden(element = null, hidden = false) {
  if (!element) return false;

  const value = Boolean(hidden);

  try {
    element.hidden = value;
    element.setAttribute("aria-hidden", value ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

function setBusy(element = null, busy = false) {
  if (!element) return false;

  try {
    element.setAttribute("aria-busy", busy ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

function setData(element = null, key = "", value = "") {
  if (!element || !key) return false;

  try {
    if (value === null || value === undefined || value === "") {
      delete element.dataset[key];
    } else {
      element.dataset[key] = String(value);
    }

    return true;
  } catch {
    return false;
  }
}

function addClasses(element = null, classes = []) {
  if (!element) return false;

  try {
    element.classList.add(...classes.filter(Boolean));
    return true;
  } catch {
    return false;
  }
}

function removeClasses(element = null, classes = []) {
  if (!element) return false;

  try {
    element.classList.remove(...classes.filter(Boolean));
    return true;
  } catch {
    return false;
  }
}

function toggleClass(element = null, className = "", enabled = false) {
  if (!element || !className) return false;

  try {
    element.classList.toggle(className, Boolean(enabled));
    return true;
  } catch {
    return false;
  }
}

function clearNode(element = null) {
  if (!element) return false;

  try {
    element.replaceChildren();
    return true;
  } catch {
    try {
      element.textContent = "";
      return true;
    } catch {
      return false;
    }
  }
}

function roots() {
  if (!isBrowser()) return [];
  return [document.documentElement, document.body].filter(Boolean);
}

/* =========================================================
   ELEMENTS
========================================================= */

export function getShellElements() {
  const sidebarMount = byId("sidebar-mount");
  const topbarMount = byId("topbar-mount");

  return {
    html: isBrowser() ? document.documentElement : null,
    body: isBrowser() ? document.body : null,

    shell: byId("app-shell"),
    appShell: byId("app-shell"),

    main: byId("main-content"),
    mainContent: byId("main-content"),

    appContent: byId("app-content"),

    view: byId("view-container"),
    viewContainer: byId("view-container"),
    viewRoot: byId("view-container"),
    routerView: byId("view-container"),

    sidebarMount,
    topbarMount,

    sidebar:
      byId("app-sidebar") ||
      byId("sidebar") ||
      query("[data-sidebar-root]"),

    topbar:
      byId("app-topbar") ||
      byId("topbar") ||
      query("[data-topbar-root]"),

    tablehead: byId("table-head"),
    tableHead: byId("table-head"),

    tableheadContainer: byId("tablehead-container"),
    tableHeadContainer: byId("tablehead-container"),

    mobileToggle:
      byId("toggleSidebarMobile") ||
      query("[data-topbar-sidebar-toggle]") ||
      query("[data-sidebar-mobile-toggle]"),

    loader: byId("app-loader"),
    appLoader: byId("app-loader"),
  };
}

export function getViewContainer() {
  return byId("view-container");
}

function shellNodes() {
  const elements = getShellElements();

  return [
    elements.shell,
    elements.main,
    elements.appContent,
    elements.viewContainer,
  ].filter(Boolean);
}

function chromeNodes() {
  const elements = getShellElements();

  return [
    elements.sidebarMount,
    elements.topbarMount,
    elements.sidebar,
    elements.topbar,
    elements.mobileToggle,
  ].filter(Boolean);
}

/* =========================================================
   STATE SYNC
========================================================= */

function syncState(AppCore = null, patch = {}) {
  if (!isObject(patch)) return patch;

  try {
    AppCore?.setState?.(patch, {
      source: "app.shell",
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

/* =========================================================
   SHELL / CHROME
========================================================= */

function exposeShell() {
  for (const element of shellNodes()) {
    setHidden(element, false);
  }

  return true;
}

function setShellState(state = "ready") {
  const busy = state === "busy";

  exposeShell();

  for (const element of shellNodes()) {
    setBusy(element, busy);
    setData(element, "shellState", state);
    setData(element, "shell", "visible");
  }

  for (const root of roots()) {
    setData(root, "shellState", state);
    setData(root, "shell", "visible");
  }

  return true;
}

function setChromeVisible(visible = true) {
  const chromeVisible = Boolean(visible);
  const chromeState = chromeVisible ? "visible" : "hidden";
  const elements = getShellElements();

  for (const element of chromeNodes()) {
    setHidden(element, !chromeVisible);
    setData(element, "chrome", chromeState);
  }

  if (!chromeVisible) {
    try {
      elements.mobileToggle?.setAttribute?.("aria-expanded", "false");
    } catch {
      // noop
    }
  }

  const hasTablehead = hasContent(elements.tableheadContainer);
  const showTablehead = chromeVisible && hasTablehead;

  setHidden(elements.tablehead, !showTablehead);
  setHidden(elements.tableheadContainer, !showTablehead);

  for (const root of roots()) {
    setData(root, "chrome", chromeState);
    toggleClass(root, "route-auth", !chromeVisible);
    toggleClass(root, "route-app", chromeVisible);
    toggleClass(root, "shell-hidden", false);
    toggleClass(root, "shell-visible", true);
  }

  return chromeVisible;
}

export function readShellVisibility() {
  if (!isBrowser()) return false;
  return document.body?.dataset?.chrome !== "hidden";
}

export function setShellVisibility(AppCore = null, visible = true) {
  const chromeVisible = Boolean(visible);

  setShellState("ready");
  setChromeVisible(chromeVisible);

  syncState(AppCore, {
    appShellVisible: true,

    shellVisible: true,
    shellHidden: false,
    routeShellHidden: false,

    chromeVisible,
    chromeHidden: !chromeVisible,

    authScreen: !chromeVisible,
    routeMode: chromeVisible ? "app" : "auth",
  });

  return chromeVisible;
}

function routeFrom(AppCore = null, Router = null, options = {}) {
  if (options.path) return options.path;
  if (options.publicPath) return options.publicPath;

  try {
    if (typeof Router?.getCurrentPublicPath === "function") {
      return Router.getCurrentPublicPath();
    }

    if (typeof Router?.getCurrentPath === "function") {
      return Router.getCurrentPath();
    }
  } catch {
    // noop
  }

  return AppCore?.state?.publicPath || AppCore?.state?.route || currentBrowserPath();
}

export function updateShellVisibilityByRoute(AppCore = null, Router = null, options = {}) {
  const current = routeFrom(AppCore, Router, options);
  const chromeVisible = !isPublicPath(current);

  setShellVisibility(AppCore, chromeVisible);

  syncState(AppCore, {
    currentShellRoute: cleanPath(current),
  });

  return chromeVisible;
}

/* =========================================================
   LOADER
========================================================= */

function hideInternalLoader() {
  const loader = byId("app-loader");

  if (!loader) return false;

  try {
    loader.hidden = true;
    loader.setAttribute("aria-hidden", "true");
    loader.setAttribute("aria-busy", "false");
    loader.classList.remove("is-visible");
    loader.classList.add("is-hidden");
    loader.dataset.loaderVisible = "false";
    loader.dataset.loaderState = "hidden";
    return true;
  } catch {
    return false;
  }
}

export function applyPostRenderLoaderPolicy({
  AppCore = null,
  Router = null,
  hideLoader: externalHideLoader = null,
} = {}) {
  updateShellVisibilityByRoute(AppCore, Router);
  markShellReady();

  if (typeof externalHideLoader === "function") {
    externalHideLoader();
  } else if (hasContent(getViewContainer())) {
    hideInternalLoader();
  }

  return getShellSnapshot(AppCore);
}

/* =========================================================
   READY / BUSY
========================================================= */

export function markShellReady() {
  setShellState("ready");

  for (const root of roots()) {
    removeClasses(root, LOADING_CLASSES);
    addClasses(root, READY_CLASSES);

    setData(root, "appLoading", "false");
    setData(root, "appBooting", "false");
    setData(root, "appReady", "true");
  }

  return true;
}

export function markShellBusy() {
  setShellState("busy");

  for (const root of roots()) {
    setData(root, "appLoading", "true");
    setData(root, "appBooting", "true");
    setData(root, "appReady", "false");
  }

  return true;
}

/* =========================================================
   ROUTE HELPERS
========================================================= */

export function isLoginPath(_AppCore = null, value = currentBrowserPath()) {
  return cleanPath(value) === "/login";
}

export function isPasswordRequestPath(_AppCore = null, value = currentBrowserPath()) {
  return cleanPath(value) === "/password-request";
}

export function isPasswordResetPath(_AppCore = null, value = currentBrowserPath()) {
  return cleanPath(value) === "/password-reset";
}

export function isActivateAccountPath(_AppCore = null, value = currentBrowserPath()) {
  return cleanPath(value) === "/activate-account";
}

export function isAuthLikePath(_AppCore = null, value = currentBrowserPath()) {
  return isPublicPath(value);
}

export function isAuthLikeRoute(AppCore = null, Router = null) {
  return isPublicPath(routeFrom(AppCore, Router));
}

/* Compat mínima mientras se limpian imports antiguos. */
export const isResetPasswordPath = isPasswordResetPath;
export const isResetPasswordConfirmPath = isPasswordResetPath;

/* =========================================================
   MISC COMPAT
========================================================= */

export function refreshShellElements() {
  return getShellElements();
}

export function resetShellRuntimeState() {
  setShellVisibility(null, true);
  return getShellSnapshot();
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getShellSnapshot(AppCore = null) {
  const elements = getShellElements();
  const view = elements.viewContainer;

  return {
    version: SHELL_VERSION,

    shellVisible: true,
    chromeVisible: readShellVisibility(),

    hasShell: Boolean(elements.shell),
    hasView: Boolean(view),
    hasViewContent: hasContent(view),

    shellState: elements.shell?.dataset?.shellState || "",

    routeMode: AppCore?.state?.routeMode || null,
    currentShellRoute: AppCore?.state?.currentShellRoute || null,

    dom: {
      shell: Boolean(elements.shell),
      main: Boolean(elements.main),
      appContent: Boolean(elements.appContent),
      viewContainer: Boolean(elements.viewContainer),
      sidebarMount: Boolean(elements.sidebarMount),
      topbarMount: Boolean(elements.topbarMount),
      tablehead: Boolean(elements.tablehead),
      tableheadContainer: Boolean(elements.tableheadContainer),
      loader: Boolean(elements.loader),
    },

    policy: {
      shellAlwaysVisible: true,
      chromeToggleOnly: true,
      publicRoutesHideChrome: true,
      noAuth: true,
      noRouterInternal: true,
      noEvents: true,
      noStorage: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SHELL_VERSION,

  getShellElements,
  getViewContainer,

  readShellVisibility,
  setShellVisibility,
  updateShellVisibilityByRoute,
  applyPostRenderLoaderPolicy,

  markShellReady,
  markShellBusy,

  isLoginPath,
  isPasswordRequestPath,
  isPasswordResetPath,
  isResetPasswordPath,
  isResetPasswordConfirmPath,
  isActivateAccountPath,
  isAuthLikePath,
  isAuthLikeRoute,

  refreshShellElements,
  resetShellRuntimeState,
  getShellSnapshot,
};
