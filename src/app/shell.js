/* =========================================================
   Onion Support - App Shell
   Archivo: /src/app/shell.js

   Responsabilidad:
   - Controlar el shell real del index.html durante boot/fatal.
   - Mantener app-shell visible.
   - Mostrar/ocultar chrome de forma básica.
   - Obtener #view-container.
   - Marcar ready/busy.
   - Sin imports.
   - Sin Router interno.
   - Sin Auth.
   - Sin eventos.
   - Sin debug pesado.
   - Sin rutas inventadas.
   - Sin /home.
   - Sin magia negra.

   Nota:
   - La visibilidad final por ruta la gobierna /src/router/shell.js.
   - Este módulo sólo da soporte base al arranque de la app.
========================================================= */

export const SHELL_VERSION = "app.shell.v2";

const HOME_PATH = "/";

const PUBLIC_AUTH_PATHS = Object.freeze([
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

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function redact(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/([?&#]access_token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
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

function roots() {
  if (!isBrowser()) return [];
  return [document.documentElement, document.body].filter(Boolean);
}

function currentBrowserPath() {
  if (!isBrowser()) return HOME_PATH;

  try {
    return `${window.location.pathname || HOME_PATH}${window.location.search || ""}${window.location.hash || ""}`;
  } catch {
    return HOME_PATH;
  }
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

function sameOriginUrlToPath(value = "") {
  try {
    const base = isBrowser() ? window.location.origin : "http://localhost";
    const url = new URL(value, base);

    if (url.origin !== base) {
      return HOME_PATH;
    }

    if (url.hash.startsWith("#/") || url.hash.startsWith("#!")) {
      return normalizeHashPath(url.hash);
    }

    return `${url.pathname || HOME_PATH}${url.search || ""}${url.hash || ""}`;
  } catch {
    return HOME_PATH;
  }
}

function normalizePublicPath(path = HOME_PATH) {
  let value = normalizeHashPath(path);

  if (!value || value.startsWith("//")) {
    return HOME_PATH;
  }

  if (/^https?:\/\//i.test(value)) {
    value = sameOriginUrlToPath(value);
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return HOME_PATH;
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value = value.replace(/\\/g, "/").replace(/\/{2,}/g, "/");

  return value || HOME_PATH;
}

function cleanPath(path = HOME_PATH) {
  let value = normalizePublicPath(path).split("?")[0].split("#")[0] || HOME_PATH;

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || HOME_PATH;
  }

  return value || HOME_PATH;
}

function isPublicAuthPath(path = currentBrowserPath()) {
  return PUBLIC_AUTH_PATHS.includes(cleanPath(path));
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

  return (
    AppCore?.state?.publicPath ||
    AppCore?.state?.canonicalPath ||
    AppCore?.state?.route ||
    currentBrowserPath()
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

function setAttr(element = null, key = "", value = "") {
  if (!element || !key) return false;

  try {
    if (value === null || value === undefined || value === "") {
      element.removeAttribute(key);
    } else {
      element.setAttribute(key, String(value));
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

function hasContent(element = null) {
  return Boolean(
    element &&
      (
        element.childElementCount > 0 ||
        text(element.textContent, "")
      )
  );
}

/* =========================================================
   ELEMENTS
========================================================= */

export function getShellElements() {
  if (!isBrowser()) {
    return {
      html: null,
      body: null,

      shell: null,
      appShell: null,

      main: null,
      mainContent: null,

      appContent: null,

      view: null,
      viewContainer: null,
      viewRoot: null,
      routerView: null,

      sidebarMount: null,
      topbarMount: null,

      sidebar: null,
      topbar: null,

      tablehead: null,
      tableHead: null,

      tableheadContainer: null,
      tableHeadContainer: null,

      mobileToggle: null,

      loader: null,
      appLoader: null,
    };
  }

  const shell = byId("app-shell");
  const main = byId("main-content");
  const appContent = byId("app-content");
  const viewContainer = byId("view-container");

  const sidebarMount = byId("sidebar-mount");
  const topbarMount = byId("topbar-mount");

  const tablehead = byId("table-head");
  const tableheadContainer = byId("tablehead-container");

  const loader = byId("app-loader");

  return {
    html: document.documentElement,
    body: document.body,

    shell,
    appShell: shell,

    main,
    mainContent: main,

    appContent,

    view: viewContainer,
    viewContainer,
    viewRoot: viewContainer,
    routerView: viewContainer,

    sidebarMount,
    topbarMount,

    sidebar:
      byId("app-sidebar") ||
      query("[data-sidebar-root]"),

    topbar:
      byId("app-topbar") ||
      query("[data-topbar-root]"),

    tablehead,
    tableHead: tablehead,

    tableheadContainer,
    tableHeadContainer: tableheadContainer,

    mobileToggle:
      query("[data-topbar-sidebar-toggle]") ||
      query("[data-sidebar-mobile-toggle]"),

    loader,
    appLoader: loader,
  };
}

export function getViewContainer() {
  return byId("view-container");
}

function shellNodes(elements = getShellElements()) {
  return [
    elements.shell,
    elements.main,
    elements.appContent,
    elements.viewContainer,
  ].filter(Boolean);
}

function chromeNodes(elements = getShellElements()) {
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
      AppCore.state = isObject(AppCore.state) ? AppCore.state : {};
      Object.assign(AppCore.state, patch);
    } catch {
      // noop
    }
  }

  return patch;
}

/* =========================================================
   SHELL BASE
========================================================= */

function exposeShell(elements = getShellElements()) {
  for (const element of shellNodes(elements)) {
    setHidden(element, false);
  }

  return true;
}

function setShellState(state = "ready") {
  const value = text(state, "ready");
  const busy = value === "busy";
  const elements = getShellElements();

  exposeShell(elements);

  for (const element of shellNodes(elements)) {
    setBusy(element, busy);
    setData(element, "shellState", value);
    setData(element, "shell", "visible");
    setData(element, "shellInteractive", busy ? "false" : "true");
  }

  for (const root of roots()) {
    setData(root, "shellState", value);
    setData(root, "shell", "visible");
    setData(root, "shellInteractive", busy ? "false" : "true");
    toggleClass(root, "shell-hidden", false);
    toggleClass(root, "shell-visible", true);
  }

  return true;
}

/* =========================================================
   CHROME
========================================================= */

function setChromeVisible(visible = true) {
  const chromeVisible = Boolean(visible);
  const chromeState = chromeVisible ? "visible" : "hidden";
  const elements = getShellElements();

  for (const element of chromeNodes(elements)) {
    setHidden(element, !chromeVisible);
    setData(element, "chrome", chromeState);
  }

  if (!chromeVisible) {
    setAttr(elements.mobileToggle, "aria-expanded", "false");
  }

  const showTablehead =
    chromeVisible &&
    hasContent(elements.tableheadContainer);

  setHidden(elements.tablehead, !showTablehead);
  setHidden(elements.tableheadContainer, !showTablehead);
  setData(elements.tablehead, "tableheadState", showTablehead ? "visible" : "empty");

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
  const mode = chromeVisible ? "app" : "auth";

  setShellState("ready");
  setChromeVisible(chromeVisible);

  syncState(AppCore, {
    appShellVisible: true,

    shellVisible: true,
    shellHidden: false,
    routeShellHidden: !chromeVisible,

    chromeVisible,
    chromeHidden: !chromeVisible,

    authScreen: !chromeVisible,
    routeMode: mode,
  });

  return chromeVisible;
}

export function updateShellVisibilityByRoute(AppCore = null, Router = null, options = {}) {
  const current = routeFrom(AppCore, Router, options);
  const chromeVisible = !isPublicAuthPath(current);
  const currentShellRoute = cleanPath(current);

  setShellVisibility(AppCore, chromeVisible);

  syncState(AppCore, {
    currentShellRoute,
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
    return getShellSnapshot(AppCore);
  }

  if (hasContent(getViewContainer())) {
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
    removeClasses(root, READY_CLASSES);
    addClasses(root, LOADING_CLASSES);

    setData(root, "appLoading", "true");
    setData(root, "appBooting", "true");
    setData(root, "appReady", "false");
  }

  return true;
}

/* =========================================================
   DYNAMIC AREAS
========================================================= */

export function clearDynamicContainers() {
  const elements = getShellElements();

  let changed = false;

  if (elements.tableheadContainer) {
    changed = clearNode(elements.tableheadContainer) || changed;
  }

  if (elements.tablehead) {
    setHidden(elements.tablehead, true);
    setData(elements.tablehead, "tableheadState", "empty");
    changed = true;
  }

  return changed;
}

/* =========================================================
   ROUTE HELPERS COMPAT
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
  return isPublicAuthPath(value);
}

export function isAuthLikeRoute(AppCore = null, Router = null) {
  return isPublicAuthPath(routeFrom(AppCore, Router));
}

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
    currentShellRoute: redact(AppCore?.state?.currentShellRoute || ""),

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
      appBootShellOnly: true,
      shellAlwaysVisible: true,
      chromeToggleOnly: true,
      publicAuthRoutesHideChrome: true,

      finalRouteShellOwner: "router/shell.js",

      noAuth: true,
      noRouterInternal: true,
      noEvents: true,
      noStorage: true,
      noHomeRoute: true,
      snapshotRedacted: true,
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

  clearDynamicContainers,

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
