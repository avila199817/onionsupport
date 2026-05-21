/* =========================================================
   Onion Support - Router Shell
   Archivo: /src/router/shell.js

   Responsabilidad:
   - Bridge mínimo Router → Shell DOM.
   - Limpiar tablehead.
   - Aplicar document.title.
   - Marcar menú activo usando canonicalPath.
   - /@{user.slug} marca Home porque canonicalPath = /.
   - /@{user.slug}/{ruta} marca la ruta canónica /{ruta}.
   - Mostrar/ocultar chrome según route.hideShell/public/auth layout.
   - Mantener app-shell visible.
   - No pisar el host activo de router/render.js.
   - Delegar normalización de rutas/user-scope/bloqueos en core/config.js.
   - Sin Auth.
   - Sin guards.
   - Sin render de vistas.
   - Sin history.
   - Sin storage.
   - Sin Toast.
   - Sin eventos.
   - Sin rutas inventadas.
   - Sin alias /home.
   - Sin /403.
   - Sin /404.
   - Sin 2FA/MFA/OTP.
========================================================= */

import {
  config,
  BLOCKED_FRONTEND_ROUTES,
  USER_HOME_PREFIX as CONFIG_USER_HOME_PREFIX,
  canonicalRoutePath as configCanonicalRoutePath,
  getUserScopedRouteInfo as getConfigUserScopedRouteInfo,
  isBlockedRoutePath as configIsBlockedRoutePath,
  isUserHomeRoute as configIsUserHomeRoute,
  isUserScopedRoute as configIsUserScopedRoute,
  normalizeRoutePath as configNormalizeRoutePath,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../core/config.js";

export const ROUTER_SHELL_VERSION = "router.shell.v6";

const APP_NAME = config?.appName || config?.name || "Onion Support";

const HOME_PATH = "/";
const USER_HOME_PREFIX = CONFIG_USER_HOME_PREFIX || "/@";

const ACTIVE_CLASS = "is-active";
const ROUTER_VIEW_HOST_ATTR = "data-router-view-host";

const ROOT_READY_CLASSES = Object.freeze(["app-ready"]);
const ROOT_LOADING_CLASSES = Object.freeze(["app-loading", "app-booting"]);

const BLOCKED_LEGACY_PATHS = new Set(
  Array.isArray(BLOCKED_FRONTEND_ROUTES) && BLOCKED_FRONTEND_ROUTES.length
    ? BLOCKED_FRONTEND_ROUTES
    : [
        "/home",
        "/403",
        "/404",
        "/2fa",
        "/mfa",
        "/otp",
      ]
);

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

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function appName(AppCore = null) {
  return cleanText(
    AppCore?.config?.appName ||
      AppCore?.config?.name ||
      APP_NAME,
    APP_NAME
  );
}

function safeTitle(value = "") {
  return cleanText(value, APP_NAME)
    .replace(/\s+/g, " ")
    .slice(0, 140);
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=/i.test(
    String(value || "")
  );
}

/* =========================================================
   PATHS
========================================================= */

function pathFromInput(path = HOME_PATH) {
  try {
    return configRoutePathFromUrlLike(path) || HOME_PATH;
  } catch {
    return HOME_PATH;
  }
}

function normalizePath(path = HOME_PATH) {
  try {
    return configNormalizeRoutePath(pathFromInput(path)) || HOME_PATH;
  } catch {
    return HOME_PATH;
  }
}

function isBlockedLegacyPath(path = HOME_PATH) {
  try {
    if (configIsBlockedRoutePath(path) === true) return true;
  } catch {
    // fallback local
  }

  const clean = normalizePath(path).toLowerCase();

  if (BLOCKED_LEGACY_PATHS.has(clean)) return true;

  return (
    clean.startsWith("/2fa/") ||
    clean.startsWith("/mfa/") ||
    clean.startsWith("/otp/")
  );
}

function getUserScopedRouteInfo(path = HOME_PATH) {
  try {
    const info = getConfigUserScopedRouteInfo(path);

    if (isObject(info)) {
      const restPath = info.restPath || info.canonicalPath || normalizePath(path);
      const lookupPath = info.canonicalPath || info.lookupPath || restPath;

      return {
        scoped: Boolean(info.scoped),
        home: Boolean(info.home),
        slug: cleanText(info.slug, ""),
        restPath,
        lookupPath,
      };
    }
  } catch {
    // fallback abajo
  }

  return {
    scoped: false,
    home: false,
    slug: "",
    restPath: normalizePath(path),
    lookupPath: normalizePath(path),
  };
}

function extractUserHomeSlug(path = HOME_PATH) {
  return getUserScopedRouteInfo(path).slug;
}

function isUserHomePath(path = HOME_PATH) {
  try {
    return configIsUserHomeRoute(path) === true;
  } catch {
    return Boolean(getUserScopedRouteInfo(path).home);
  }
}

function isUserScopedPath(path = HOME_PATH) {
  try {
    return configIsUserScopedRoute(path) === true;
  } catch {
    return Boolean(getUserScopedRouteInfo(path).scoped);
  }
}

function canonicalPath(path = HOME_PATH) {
  try {
    return configCanonicalRoutePath(path) || normalizePath(path);
  } catch {
    return getUserScopedRouteInfo(path).lookupPath || normalizePath(path);
  }
}

/* =========================================================
   DOM
========================================================= */

function byId(id = "") {
  if (!isBrowser() || !id) return null;

  try {
    return document.getElementById(id);
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

function isRouteHost(node = null) {
  try {
    return node?.getAttribute?.(ROUTER_VIEW_HOST_ATTR) === "true";
  } catch {
    return false;
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
  if (!node || !classes.length) return false;

  try {
    node.classList.add(...classes.filter(Boolean));
    return true;
  } catch {
    return false;
  }
}

function removeClasses(node = null, classes = []) {
  if (!node || !classes.length) return false;

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

function hasContent(node = null) {
  return Boolean(
    node &&
      (
        node.childElementCount > 0 ||
        cleanText(node.textContent, "")
      )
  );
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

function cacheViewRoot(AppCore = null, node = null) {
  if (!AppCore || !node) return node;

  try {
    AppCore.dom = isObject(AppCore.dom) ? AppCore.dom : {};

    AppCore.dom.routerViewContainer = node;
    AppCore.dom.appViewContainer = node;
    AppCore.dom.rootViewContainer = node;

    /*
      No pisar el host activo creado por router/render.js.
      Durante una ruta, AppCore.dom.viewContainer debe poder apuntar
      al host estable donde pintan las vistas existentes.
    */
    if (!AppCore.dom.viewContainer || !isRouteHost(AppCore.dom.viewContainer)) {
      AppCore.dom.viewContainer = node;
    }
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

      tablehead: null,
      tableheadContainer: null,
    };
  }

  const html = document.documentElement;
  const body = document.body;

  const shell = byId("app-shell");
  const main = byId("main-content");
  const appContent = byId("app-content");
  const viewContainer = byId("view-container");

  const sidebarMount = byId("sidebar-mount");
  const topbarMount = byId("topbar-mount");

  const tablehead = byId("table-head");
  const tableheadContainer = byId("tablehead-container");

  cacheDom(AppCore, "html", html);
  cacheDom(AppCore, "body", body);

  cacheDom(AppCore, "shell", shell);
  cacheDom(AppCore, "main", main);
  cacheDom(AppCore, "mainContent", main);
  cacheDom(AppCore, "appContent", appContent);

  cacheViewRoot(AppCore, viewContainer);

  cacheDom(AppCore, "sidebarMount", sidebarMount);
  cacheDom(AppCore, "topbarMount", topbarMount);

  cacheDom(AppCore, "tablehead", tablehead);
  cacheDom(AppCore, "tableHead", tablehead);
  cacheDom(AppCore, "tableheadContainer", tableheadContainer);
  cacheDom(AppCore, "tableHeadContainer", tableheadContainer);

  return {
    html,
    body,

    shell,
    main,
    appContent,
    viewContainer,

    sidebarMount,
    topbarMount,

    tablehead,
    tableheadContainer,
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
    const value = cleanText(link.getAttribute?.(attr), "");

    if (value) return value;
  }

  return "";
}

function isIgnoredHref(href = "") {
  const value = cleanText(href, "");

  if (!value) return true;
  if (value.startsWith("#")) return true;
  if (value.startsWith("mailto:") || value.startsWith("tel:")) return true;
  if (value.startsWith("//")) return true;
  if (hasSensitiveQuery(value)) return true;
  if (isBlockedLegacyPath(value)) return true;

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
  const currentBlocked = isBlockedLegacyPath(pathname || current || HOME_PATH);
  const links = queryAll(MENU_SELECTOR);

  for (const link of links) {
    setActive(link, false);
  }

  if (currentBlocked) return true;

  for (const link of links) {
    const href = linkPath(link);

    if (isIgnoredHref(href)) continue;

    const candidate = canonicalPath(href);

    if (!isBlockedLegacyPath(candidate) && candidate === current) {
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

  for (const root of [html, body].filter(Boolean)) {
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
  ]) {
    setHidden(node, hidden);
    setData(node, "chrome", hidden ? "hidden" : "visible");
  }

  const showTablehead =
    !hidden &&
    hasContent(elements.tableheadContainer);

  setHidden(elements.tablehead, !showTablehead);
  setHidden(elements.tableheadContainer, hidden || !showTablehead);

  setData(
    elements.tablehead,
    "tableheadState",
    showTablehead ? "visible" : "empty"
  );
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
    isRouteHost: isRouteHost(node),
  };
}

export function getShellSnapshot(AppCore = null) {
  const elements = getShellElements(AppCore);
  const publicPath = cleanText(AppCore?.state?.publicPath, "");

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
    publicPath: redact(publicPath),
    publicSlug: extractUserHomeSlug(publicPath) || null,
    isUserHomePath: isUserHomePath(publicPath || HOME_PATH),
    isUserScopedPath: isUserScopedPath(publicPath || HOME_PATH),
    blockedLegacyPath: isBlockedLegacyPath(publicPath || route || HOME_PATH),

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
      activeViewContainer: elementSnapshot(AppCore?.dom?.viewContainer || null),
      routerViewHost: elementSnapshot(AppCore?.dom?.routerViewHost || null),
      sidebarMount: elementSnapshot(elements.sidebarMount),
      topbarMount: elementSnapshot(elements.topbarMount),
      tablehead: elementSnapshot(elements.tablehead),
      tableheadContainer: elementSnapshot(elements.tableheadContainer),
    },

    policy: {
      shellOnly: true,
      configDrivenBase: true,
      configOwnsPathNormalization: true,
      configOwnsUserScopeParsing: true,
      configOwnsBlockedRoutes: true,

      ownAuth: false,
      ownGuards: false,
      ownRender: false,
      ownHistory: false,
      ownStorage: false,
      ownToast: false,
      ownEvents: false,

      userSlugHome: true,
      userScopedPrivateRoutes: true,
      canonicalizesUserHome: true,
      canonicalizesUserScopedRoutes: true,

      doesNotClobberActiveRouteHost: true,

      homeInternalPath: HOME_PATH,
      homeVisiblePattern: `${USER_HOME_PREFIX}{user.slug}`,

      noHomeAlias: true,
      noHomeRoute: true,
      no403: true,
      no404: true,
      no2fa: true,
      noMfa: true,
      noOtp: true,

      chromeByRouteOnly: true,
      keepsAppShellVisible: true,
      snapshotRedacted: true,
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
