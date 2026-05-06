/* =========================================================
   Onion SPA - App Shell
   Archivo: src/app/shell.js

   ONION SUPPORT · APP SHELL CONTROLLER
   NO FLICKER · BOOT LOADER ALIGNED · EXTREME 10/10

   RESPONSABILIDADES:
   - Resolver elementos principales del shell.
   - Controlar visibilidad de sidebar/topbar/tablehead por ruta.
   - No ocultar #app-shell en login/reset/activate.
   - Mantener app-shell estable durante boot.
   - Sincronizar aria-busy / aria-hidden / data-shell / data-chrome.
   - No esconder loader global antes de finalizeBoot.
   - Evitar re-toggle visual innecesario.
   - Snapshot robusto para debug.
   - Emitir eventos de shell consistentes sin duplicar bus + window.

   ALINEADO CON:
   - src/app/index.js
   - src/app/loader.js
   - src/css/core/loader.css
   - index.html con #app-loader estático
   - index.html con #sidebar-mount / #topbar-mount

   REGLA:
   - Loader global lo decide App Bootstrap.
   - shell.js puede pedir hideLoader solo cuando NO hay boot activo.
   - Durante boot, app-booting/app-loading mantiene #app-shell oculto por CSS.
   - setShellVisibility() controla chrome, no destruye #app-shell.
   - Login/reset/activate ocultan chrome, pero mantienen shell principal.
========================================================= */

import {
  getCurrentCanonicalPath,
  getCurrentPublicPath,
} from "./helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_ROUTE = "/";

const SHELL_EVENTS = Object.freeze({
  change: "router:shell:change",
  state: "router:shell:state",
  appState: "app:shell:state",
  postRender: "app:shell:post-render",
  ready: "app:shell:ready",
  busy: "app:shell:busy",
  elements: "app:shell:elements",
});

const DOM_IDS = Object.freeze({
  appShell: "app-shell",
  mainContent: "main-content",
  appContent: "app-content",
  viewContainer: "view-container",

  sidebarMount: "sidebar-mount",
  topbarMount: "topbar-mount",

  sidebar: "app-sidebar",
  topbar: "app-topbar",

  tablehead: "table-head",
  tableheadContainer: "tablehead-container",

  loader: "app-loader",
});

const AUTH_LIKE_PATHS = Object.freeze([
  "/login",
  "/signin",
  "/sign-in",
  "/register",
  "/signup",
  "/sign-up",
  "/forgot-password",
  "/recover-password",
  "/password-reset",
  "/reset-password",
  "/reset-password/confirm",
  "/activate-account",
]);

const AUTH_LIKE_PREFIXES = Object.freeze([
  "/activate-account",
  "/reset-password/confirm",
]);

const TOKEN_PARAM_NAMES = Object.freeze([
  "token",
  "activationToken",
  "activateToken",
  "resetToken",
  "passwordResetToken",
  "code",
  "t",
  "access_token",
  "refresh_token",
  "id_token",
]);

const BOOT_BODY_CLASSES = Object.freeze([
  "app-booting",
  "app-loading",
  "is-booting",
  "is-loading",
]);

const HIDDEN_LOADER_CLASSES = Object.freeze([
  "is-hidden",
  "has-hidden",
  "loader-hidden",
]);

const VISIBLE_LOADER_CLASSES = Object.freeze([
  "is-visible",
  "is-entering",
  "is-leaving",
  "loader-visible",
]);

const CHROME_HIDDEN_CLASS = "route-chrome-hidden";
const CHROME_VISIBLE_CLASS = "route-chrome-visible";
const SHELL_HIDDEN_CLASS = "route-shell-hidden";
const SHELL_VISIBLE_CLASS = "route-shell-visible";
const ROUTE_AUTH_CLASS = "route-auth";
const ROUTE_APP_CLASS = "route-app";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value) {
  return isObject(value)
    ? value
    : {};
}

function isFunction(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function isExtensibleObject(value) {
  try {
    return (
      isObject(value) &&
      Object.isExtensible(value)
    );
  } catch {}

  return false;
}

function safeArrayFromClassList(classList) {
  try {
    return Array.from(classList || []);
  } catch {
    return [];
  }
}

/* =========================================================
   LOG / EMIT
========================================================= */

function safeLog(AppCore, ...args) {
  try {
    AppCore?.utils?.log?.("[AppShell]", ...args);
    return;
  } catch {}

  try {
    console.log("[AppShell]", ...args);
  } catch {}
}

function safeWarn(AppCore, ...args) {
  let coreLogged = false;

  try {
    if (isFunction(AppCore?.utils?.warn)) {
      AppCore.utils.warn("[AppShell]", ...args);
      coreLogged = true;
    }
  } catch {
    coreLogged = false;
  }

  if (coreLogged) {
    return;
  }

  try {
    console.warn("[AppShell]", ...args);
  } catch {}
}

function safeEmit(AppCore, name, payload = {}, options = {}) {
  const eventName = safeText(name, "");

  if (!eventName) {
    return false;
  }

  const opts = safeObject(options);

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable = true;
      AppCore.events.emit(eventName, payload);
      busEmitted = true;
    }
  } catch {}

  /*
    Evita tormenta de eventos:
    - si existe AppCore.events, no duplicamos por window
    - window solo como fallback o si se fuerza explícitamente
  */
  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: payload,
        })
      );

      return true;
    } catch {}
  }

  return busEmitted;
}

/* =========================================================
   PATH / TOKEN HELPERS
========================================================= */

function redactTokenInText(value = "") {
  let output = safeText(value, "");

  if (!output) {
    return "";
  }

  for (const name of TOKEN_PARAM_NAMES) {
    try {
      output = output.replace(
        new RegExp(`([?&#]${name}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  try {
    output = output.replace(
      /(\/activate-account\/)([^/?#\s]+)/gi,
      "$1***"
    );
  } catch {}

  try {
    output = output.replace(
      /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
      "$1***"
    );
  } catch {}

  try {
    output = output.replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    );
  } catch {}

  return output;
}

function normalizePath(AppCore, path = DEFAULT_ROUTE) {
  try {
    if (isFunction(AppCore?.utils?.normalizePath)) {
      return AppCore.utils.normalizePath(path);
    }
  } catch {}

  let raw = safeText(path, DEFAULT_ROUTE)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!raw.startsWith("/")) {
    raw = `/${raw}`;
  }

  const hashIndex = raw.indexOf("#");
  const queryIndex = raw.indexOf("?");

  let cutIndex = -1;

  if (
    queryIndex >= 0 &&
    hashIndex >= 0
  ) {
    cutIndex = Math.min(queryIndex, hashIndex);
  } else if (queryIndex >= 0) {
    cutIndex = queryIndex;
  } else if (hashIndex >= 0) {
    cutIndex = hashIndex;
  }

  const suffix = cutIndex >= 0
    ? raw.slice(cutIndex)
    : "";

  let pathname = cutIndex >= 0
    ? raw.slice(0, cutIndex)
    : raw;

  pathname = pathname.replace(/\/+$/g, "") || DEFAULT_ROUTE;

  return `${pathname}${suffix}`;
}

function pathnameOnly(AppCore, path = DEFAULT_ROUTE) {
  const normalized = normalizePath(AppCore, path);

  return (
    normalized
      .split("?")[0]
      .split("#")[0]
      .replace(/\/+$/g, "") ||
    DEFAULT_ROUTE
  );
}

function getBrowserPath() {
  if (!isBrowser()) {
    return DEFAULT_ROUTE;
  }

  try {
    const pathname = window.location.pathname || DEFAULT_ROUTE;
    const search = window.location.search || "";
    const hash = window.location.hash || "";

    return `${pathname}${search}${hash}` || DEFAULT_ROUTE;
  } catch {
    return DEFAULT_ROUTE;
  }
}

/* =========================================================
   DOM LOW LEVEL
========================================================= */

function queryFirst(selectors = []) {
  if (!isBrowser()) {
    return null;
  }

  for (const selector of selectors) {
    try {
      const el = selector.startsWith("#")
        ? document.getElementById(selector.slice(1))
        : document.querySelector(selector);

      if (el) {
        return el;
      }
    } catch {}
  }

  return null;
}

function setDataset(el, key, value) {
  if (
    !el ||
    !key
  ) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      delete el.dataset[key];
      return true;
    }

    const next = String(value);

    if (el.dataset[key] === next) {
      return true;
    }

    el.dataset[key] = next;

    return true;
  } catch {}

  return false;
}

function toggleClass(el, name, force) {
  if (
    !el ||
    !name
  ) {
    return false;
  }

  try {
    const next = Boolean(force);

    if (el.classList.contains(name) === next) {
      return true;
    }

    el.classList.toggle(name, next);

    return true;
  } catch {}

  return false;
}

function setAttribute(el, name, value) {
  if (
    !el ||
    !name
  ) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined
    ) {
      if (el.hasAttribute(name)) {
        el.removeAttribute(name);
      }

      return true;
    }

    const next = String(value);

    if (el.getAttribute(name) === next) {
      return true;
    }

    el.setAttribute(name, next);

    return true;
  } catch {}

  return false;
}

function applyHidden(el, hidden = false) {
  if (!el) {
    return false;
  }

  const next = Boolean(hidden);

  try {
    if (el.hidden !== next) {
      el.hidden = next;
    }
  } catch {}

  setAttribute(el, "aria-hidden", next ? "true" : "false");

  return true;
}

function applyBusy(el, busy = false) {
  if (!el) {
    return false;
  }

  setAttribute(el, "aria-busy", Boolean(busy) ? "true" : "false");

  return true;
}

function safeAssignDomCache(AppCore, payload = {}) {
  try {
    if (!AppCore) {
      return false;
    }

    if (
      !AppCore.dom &&
      isExtensibleObject(AppCore)
    ) {
      AppCore.dom = {};
    }

    if (!isObject(AppCore.dom)) {
      return false;
    }

    Object.assign(AppCore.dom, payload);

    return true;
  } catch {}

  return false;
}

/* =========================================================
   ELEMENTS
========================================================= */

export function getShellElements(AppCore) {
  if (!isBrowser()) {
    return {
      appShell: null,
      mainContent: null,
      appContent: null,
      viewContainer: null,

      sidebarMount: null,
      topbarMount: null,

      sidebar: null,
      topbar: null,

      tablehead: null,
      tableheadContainer: null,

      loader: null,

      body: null,
      html: null,
    };
  }

  const dom = safeObject(AppCore?.dom);

  const appShell =
    dom.appShell ||
    queryFirst([
      `#${DOM_IDS.appShell}`,
      "[data-app-shell='true']",
      "[data-app-shell]",
      ".app-shell",
    ]);

  const mainContent =
    dom.mainContent ||
    queryFirst([
      `#${DOM_IDS.mainContent}`,
      "main.main-content",
      "[data-main-content]",
      ".main-content",
    ]);

  const appContent =
    dom.appContent ||
    queryFirst([
      `#${DOM_IDS.appContent}`,
      "[data-app-content]",
      ".app-content",
    ]);

  const viewContainer =
    dom.viewContainer ||
    queryFirst([
      `#${DOM_IDS.viewContainer}`,
      "[data-view-root]",
      "[data-router-view]",
      ".view-container",
    ]);

  const sidebarMount =
    dom.sidebarMount ||
    queryFirst([
      `#${DOM_IDS.sidebarMount}`,
      "[data-sidebar-mount='true']",
      "[data-sidebar-mount]",
    ]);

  const topbarMount =
    dom.topbarMount ||
    queryFirst([
      `#${DOM_IDS.topbarMount}`,
      "[data-topbar-mount='true']",
      "[data-topbar-mount]",
    ]);

  const sidebar =
    dom.sidebar ||
    queryFirst([
      `#${DOM_IDS.sidebar}`,
      ".sidebar",
      "[data-sidebar-root]",
      "[data-sidebar]",
    ]);

  const topbar =
    dom.topbar ||
    queryFirst([
      `#${DOM_IDS.topbar}`,
      ".topbar",
      "[data-topbar-root]",
      "[data-topbar]",
    ]);

  const tablehead =
    dom.tablehead ||
    queryFirst([
      `#${DOM_IDS.tablehead}`,
      ".table-head",
      "[data-tablehead]",
    ]);

  const tableheadContainer =
    dom.tableheadContainer ||
    queryFirst([
      `#${DOM_IDS.tableheadContainer}`,
      "[data-tablehead-container]",
      ".tablehead-container",
    ]);

  const loader =
    dom.loader ||
    queryFirst([
      `#${DOM_IDS.loader}`,
      "[data-app-loader='true']",
      "[data-app-loader]",
      ".app-loader",
    ]);

  safeAssignDomCache(
    AppCore,
    {
      appShell,
      mainContent,
      appContent,
      viewContainer,

      sidebarMount,
      topbarMount,

      sidebar,
      topbar,

      tablehead,
      tableheadContainer,

      loader,
    }
  );

  return {
    appShell,
    mainContent,
    appContent,
    viewContainer,

    sidebarMount,
    topbarMount,

    sidebar,
    topbar,

    tablehead,
    tableheadContainer,

    loader,

    body: document.body || null,
    html: document.documentElement || null,
  };
}

export function getViewContainer(AppCore) {
  if (!isBrowser()) {
    return null;
  }

  const el =
    AppCore?.dom?.viewContainer ||
    queryFirst([
      `#${DOM_IDS.viewContainer}`,
      "[data-view-root]",
      "[data-router-view]",
      ".view-container",
    ]);

  if (el) {
    safeAssignDomCache(
      AppCore,
      {
        viewContainer: el,
      }
    );
  }

  return el;
}

/* =========================================================
   STATE HELPERS
========================================================= */

function getCoreState(AppCore) {
  return safeObject(AppCore?.state);
}

function setCoreState(AppCore, payload = {}) {
  const cleanPayload = safeObject(payload);

  try {
    AppCore?.setState?.(cleanPayload);
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(AppCore.state, cleanPayload);
    }
  } catch {}

  return cleanPayload;
}

function hasBodyBootClass() {
  if (!isBrowser()) {
    return false;
  }

  try {
    return BOOT_BODY_CLASSES.some((className) =>
      Boolean(
        document.body?.classList?.contains(className) ||
        document.documentElement?.classList?.contains(className)
      )
    );
  } catch {}

  return false;
}

function isBootingOrLoading(AppCore) {
  const state = getCoreState(AppCore);

  return Boolean(
    state.booting ||
    state.loading ||
    state.appBooting ||
    state.bootInProgress ||
    state.ready === false ||
    hasBodyBootClass()
  );
}

function elementHasHiddenLoaderClass(loader) {
  if (!loader) {
    return false;
  }

  try {
    return HIDDEN_LOADER_CLASSES.some((className) =>
      loader.classList.contains(className)
    );
  } catch {}

  return false;
}

function elementHasVisibleLoaderClass(loader) {
  if (!loader) {
    return false;
  }

  try {
    return VISIBLE_LOADER_CLASSES.some((className) =>
      loader.classList.contains(className)
    );
  } catch {}

  return false;
}

function isLoaderVisible(AppCore) {
  const { loader } = getShellElements(AppCore);

  if (!loader) {
    return false;
  }

  try {
    if (loader.hidden) {
      return false;
    }

    if (loader.getAttribute("aria-hidden") === "true") {
      return false;
    }

    if (elementHasHiddenLoaderClass(loader)) {
      return false;
    }

    const dataVisible = safeText(loader.dataset?.loaderVisible, "");

    if (dataVisible === "false") {
      return false;
    }

    const dataState = safeText(loader.dataset?.loaderState, "");

    if (
      dataState === "hidden" ||
      dataState === "removed"
    ) {
      return false;
    }

    if (elementHasVisibleLoaderClass(loader)) {
      return true;
    }

    return true;
  } catch {}

  return false;
}

function hasViewContent(viewContainer) {
  if (!viewContainer) {
    return false;
  }

  try {
    if (viewContainer.childElementCount > 0) {
      return true;
    }
  } catch {}

  try {
    return Boolean(safeText(viewContainer.textContent, ""));
  } catch {}

  return false;
}

/* =========================================================
   SHELL DOM STATE
========================================================= */

function setAppShellBusy(AppCore, busy = false) {
  const {
    appShell,
    mainContent,
    appContent,
    viewContainer,
  } = getShellElements(AppCore);

  applyBusy(appShell, busy);
  applyBusy(mainContent, busy);
  applyBusy(appContent, busy);
  applyBusy(viewContainer, busy);

  return Boolean(busy);
}

function applyRootShellClasses(root, {
  chromeVisible,
  authLike,
  appShellVisible,
} = {}) {
  if (!root) {
    return false;
  }

  toggleClass(root, ROUTE_AUTH_CLASS, authLike);
  toggleClass(root, ROUTE_APP_CLASS, !authLike);

  toggleClass(root, CHROME_HIDDEN_CLASS, !chromeVisible);
  toggleClass(root, CHROME_VISIBLE_CLASS, chromeVisible);

  toggleClass(root, SHELL_VISIBLE_CLASS, appShellVisible);
  toggleClass(root, SHELL_HIDDEN_CLASS, !appShellVisible);

  setDataset(root, "shell", appShellVisible ? "visible" : "hidden");
  setDataset(root, "chrome", chromeVisible ? "visible" : "hidden");
  setDataset(root, "routeMode", authLike ? "auth" : "app");

  return true;
}

function applyElementShellDataset(el, {
  chromeVisible,
  authLike,
  appShellVisible,
} = {}) {
  if (!el) {
    return false;
  }

  setDataset(el, "shell", appShellVisible ? "visible" : "hidden");
  setDataset(el, "chrome", chromeVisible ? "visible" : "hidden");
  setDataset(el, "routeMode", authLike ? "auth" : "app");

  return true;
}

function markShellDomState(AppCore, {
  chromeVisible = true,
  authLike = false,
  busy = false,
  appShellVisible = true,
} = {}) {
  const {
    appShell,
    mainContent,
    appContent,
    viewContainer,
    sidebarMount,
    topbarMount,
    sidebar,
    topbar,
    tablehead,
    tableheadContainer,
    body,
    html,
  } = getShellElements(AppCore);

  const finalChromeVisible = Boolean(chromeVisible);
  const finalAuthLike = Boolean(authLike);
  const finalBusy = Boolean(busy);
  const finalAppShellVisible = appShellVisible !== false;

  applyRootShellClasses(body, {
    chromeVisible: finalChromeVisible,
    authLike: finalAuthLike,
    appShellVisible: finalAppShellVisible,
  });

  applyRootShellClasses(html, {
    chromeVisible: finalChromeVisible,
    authLike: finalAuthLike,
    appShellVisible: finalAppShellVisible,
  });

  for (const el of [
    appShell,
    mainContent,
    appContent,
    viewContainer,
  ]) {
    applyElementShellDataset(el, {
      chromeVisible: finalChromeVisible,
      authLike: finalAuthLike,
      appShellVisible: finalAppShellVisible,
    });
  }

  for (const el of [
    sidebarMount,
    topbarMount,
    sidebar,
    topbar,
    tablehead,
    tableheadContainer,
  ]) {
    applyElementShellDataset(el, {
      chromeVisible: finalChromeVisible,
      authLike: finalAuthLike,
      appShellVisible: finalAppShellVisible,
    });
  }

  /*
    #app-shell no se oculta en auth/reset/activate.
    Sólo se oculta si hideAppShell=true desde setShellVisibility().
  */
  if (!finalAppShellVisible) {
    applyHidden(appShell, true);
  } else if (appShell) {
    try {
      if (appShell.hidden) {
        appShell.hidden = false;
      }
    } catch {}

    setAttribute(appShell, "aria-hidden", "false");
  }

  setAppShellBusy(AppCore, finalBusy);

  return {
    shellVisible: finalAppShellVisible,
    chromeVisible: finalChromeVisible,
    authLike: finalAuthLike,
    busy: finalBusy,
  };
}

export function readShellVisibility(AppCore) {
  const state = getCoreState(AppCore);

  if (typeof state.chromeVisible === "boolean") {
    return state.chromeVisible;
  }

  if (typeof state.shellVisible === "boolean") {
    return state.shellVisible;
  }

  const {
    body,
    html,
    sidebarMount,
    topbarMount,
    sidebar,
    topbar,
  } = getShellElements(AppCore);

  const bodyChrome = safeText(body?.dataset?.chrome, "");

  if (bodyChrome === "visible") {
    return true;
  }

  if (bodyChrome === "hidden") {
    return false;
  }

  const htmlChrome = safeText(html?.dataset?.chrome, "");

  if (htmlChrome === "visible") {
    return true;
  }

  if (htmlChrome === "hidden") {
    return false;
  }

  if (
    body?.classList?.contains(CHROME_HIDDEN_CLASS) ||
    html?.classList?.contains(CHROME_HIDDEN_CLASS)
  ) {
    return false;
  }

  if (
    sidebarMount?.hidden ||
    topbarMount?.hidden ||
    sidebar?.hidden ||
    topbar?.hidden
  ) {
    return false;
  }

  return true;
}

/* =========================================================
   SHELL / CHROME VISIBILITY
========================================================= */

export function setShellVisibility(AppCore, visible = true, options = {}) {
  const opts = safeObject(options);

  const nextChromeVisible = Boolean(visible);
  const force = Boolean(opts.force);
  const emit = opts.emit !== false;

  const prevChromeVisible = readShellVisibility(AppCore);

  const authLike = Boolean(opts.authLike);

  const busy = opts.busy !== undefined
    ? Boolean(opts.busy)
    : isBootingOrLoading(AppCore);

  const appShellVisible = opts.hideAppShell === true
    ? false
    : true;

  const {
    sidebarMount,
    topbarMount,
    sidebar,
    topbar,
    tablehead,
    tableheadContainer,
  } = getShellElements(AppCore);

  const chromeHidden = !nextChromeVisible;

  if (
    force ||
    prevChromeVisible !== nextChromeVisible
  ) {
    /*
      Sólo ocultamos chrome:
      - mounts
      - sidebar/topbar reales
      - tablehead

      Nunca ocultamos #app-shell aquí.
    */
    for (const chromeElement of [
      sidebarMount,
      topbarMount,
      sidebar,
      topbar,
      tablehead,
      tableheadContainer,
    ]) {
      applyHidden(chromeElement, chromeHidden);
    }
  }

  const domState = markShellDomState(
    AppCore,
    {
      chromeVisible: nextChromeVisible,
      authLike,
      busy,
      appShellVisible,
    }
  );

  setCoreState(
    AppCore,
    {
      /*
        Compat legacy:
        shellVisible se mantiene, pero representa chromeVisible.
      */
      shellVisible: nextChromeVisible,
      chromeVisible: nextChromeVisible,

      appShellVisible: domState.shellVisible,

      shellAuthLike: authLike,
      shellBusy: busy,

      shellUpdatedAt: safeIsoDate(),
    }
  );

  if (emit) {
    const snapshot = getShellSnapshot(AppCore);

    const payload = {
      hidden: chromeHidden,
      visible: nextChromeVisible,

      chromeVisible: nextChromeVisible,
      appShellVisible: domState.shellVisible,

      changed: prevChromeVisible !== nextChromeVisible,

      authLike,
      busy,

      snapshot,
    };

    safeEmit(AppCore, SHELL_EVENTS.change, payload);
    safeEmit(AppCore, SHELL_EVENTS.state, payload);
    safeEmit(AppCore, SHELL_EVENTS.appState, payload);
  }

  return nextChromeVisible;
}

/* =========================================================
   ROUTES
========================================================= */

export function isLoginPath(AppCore, path = "") {
  const p = pathnameOnly(AppCore, path);

  return (
    p === "/login" ||
    p === "/signin" ||
    p === "/sign-in"
  );
}

export function isResetPasswordPath(AppCore, path = "") {
  const p = pathnameOnly(AppCore, path);

  return (
    p === "/reset-password" ||
    p === "/forgot-password" ||
    p === "/recover-password" ||
    p === "/password-reset"
  );
}

export function isResetPasswordConfirmPath(AppCore, path = "") {
  const p = pathnameOnly(AppCore, path);

  return (
    p === "/reset-password/confirm" ||
    p.startsWith("/reset-password/confirm/")
  );
}

export function isActivateAccountPath(AppCore, path = "") {
  const p = pathnameOnly(AppCore, path);

  return (
    p === "/activate-account" ||
    p.startsWith("/activate-account/")
  );
}

export function isAuthLikePath(AppCore, path = "") {
  const p = pathnameOnly(AppCore, path);

  if (AUTH_LIKE_PATHS.includes(p)) {
    return true;
  }

  return AUTH_LIKE_PREFIXES.some((prefix) =>
    p === prefix ||
    p.startsWith(`${prefix}/`)
  );
}

export function isAuthLikeRoute(AppCore, Router) {
  const canonical = normalizePath(
    AppCore,
    getCurrentCanonicalPath(AppCore, Router) ||
      AppCore?.state?.route ||
      DEFAULT_ROUTE
  );

  const publicPath = normalizePath(
    AppCore,
    getCurrentPublicPath(AppCore, Router) ||
      AppCore?.state?.publicPath ||
      getBrowserPath() ||
      DEFAULT_ROUTE
  );

  const browserPath = normalizePath(
    AppCore,
    getBrowserPath()
  );

  return [
    canonical,
    publicPath,
    browserPath,
  ].some((path) =>
    isAuthLikePath(AppCore, path)
  );
}

export function updateShellVisibilityByRoute(AppCore, Router, options = {}) {
  const opts = safeObject(options);

  const authLike = opts.authLike !== undefined
    ? Boolean(opts.authLike)
    : isAuthLikeRoute(AppCore, Router);

  /*
    En auth-like ocultamos chrome.
    #app-shell sigue visible para login/reset/activate.
  */
  return setShellVisibility(
    AppCore,
    !authLike,
    {
      ...opts,
      authLike,
      hideAppShell: false,
    }
  );
}

/* =========================================================
   LOADER
========================================================= */

function hideLoaderDomFallback(AppCore) {
  const { loader } = getShellElements(AppCore);

  if (!loader) {
    return false;
  }

  try {
    loader.hidden = true;

    for (const className of HIDDEN_LOADER_CLASSES) {
      loader.classList.add(className);
    }

    for (const className of VISIBLE_LOADER_CLASSES) {
      loader.classList.remove(className);
    }

    loader.setAttribute("aria-hidden", "true");
    loader.setAttribute("aria-busy", "false");

    loader.dataset.loaderVisible = "false";
    loader.dataset.loaderState = "hidden";

    return true;
  } catch {
    return false;
  }
}

function hideLoaderSafe(AppCore, hideLoader, options = {}) {
  const opts = safeObject(options);

  const bootBusy =
    isBootingOrLoading(AppCore) ||
    hasBodyBootClass();

  /*
    Regla anti-flicker:
    durante boot/loading real NO escondemos loader desde shell.js
    salvo force explícito.
  */
  if (
    bootBusy &&
    opts.force !== true
  ) {
    return false;
  }

  try {
    if (isFunction(hideLoader)) {
      hideLoader(
        AppCore,
        {
          reason: opts.reason || "shell-post-render",
          minVisibleMs: opts.minVisibleMs,
        }
      );

      return true;
    }
  } catch {}

  /*
    Fallback DOM sólo fuera de boot. En boot ya habríamos retornado arriba.
  */
  return hideLoaderDomFallback(AppCore);
}

/* =========================================================
   POST RENDER
========================================================= */

export function applyPostRenderLoaderPolicy({
  AppCore,
  Router,
  hideLoader,
  forceHideLoader = false,
  hideLoaderOnPostRender = true,
  minVisibleMs = undefined,
} = {}) {
  const view = getViewContainer(AppCore);

  const hasContent = hasViewContent(view);

  const authLike = isAuthLikeRoute(AppCore, Router);

  const bootBusy =
    isBootingOrLoading(AppCore) ||
    hasBodyBootClass();

  const chromeVisible = updateShellVisibilityByRoute(
    AppCore,
    Router,
    {
      authLike,
      busy: !hasContent || bootBusy,
      hideAppShell: false,
    }
  );

  const shouldConsiderHide =
    hideLoaderOnPostRender !== false &&
    (authLike || hasContent);

  const loaderHidden = shouldConsiderHide
    ? hideLoaderSafe(
        AppCore,
        hideLoader,
        {
          force: forceHideLoader,
          reason: "post-render",
          minVisibleMs,
        }
      )
    : false;

  if (hasContent) {
    setAppShellBusy(AppCore, bootBusy);
  }

  const shellSnapshot = getShellSnapshot(
    AppCore,
    Router
  );

  safeEmit(
    AppCore,
    SHELL_EVENTS.postRender,
    {
      authLike,

      hasViewContent: hasContent,

      shellVisible: shellSnapshot.appShellVisible,
      chromeVisible,

      loaderHidden,
      loaderVisible: isLoaderVisible(AppCore),

      bootBusy,

      snapshot: shellSnapshot,
    }
  );

  return shellSnapshot;
}

/* =========================================================
   APP READY / BUSY HELPERS
========================================================= */

export function markShellReady(AppCore, options = {}) {
  const opts = safeObject(options);

  const authLike = opts.authLike !== undefined
    ? Boolean(opts.authLike)
    : isAuthLikeRoute(AppCore, opts.Router || null);

  setAppShellBusy(AppCore, false);

  markShellDomState(
    AppCore,
    {
      chromeVisible: opts.chromeVisible !== undefined
        ? Boolean(opts.chromeVisible)
        : readShellVisibility(AppCore),

      authLike,

      busy: false,

      appShellVisible: opts.appShellVisible !== false,
    }
  );

  setCoreState(
    AppCore,
    {
      shellBusy: false,
      appShellVisible: opts.appShellVisible !== false,
      shellReady: true,
    }
  );

  safeEmit(
    AppCore,
    SHELL_EVENTS.ready,
    {
      snapshot: getShellSnapshot(AppCore, opts.Router || null),
    }
  );

  return true;
}

export function markShellBusy(AppCore, options = {}) {
  const opts = safeObject(options);

  setAppShellBusy(AppCore, true);

  markShellDomState(
    AppCore,
    {
      chromeVisible: opts.chromeVisible !== undefined
        ? Boolean(opts.chromeVisible)
        : readShellVisibility(AppCore),

      authLike: Boolean(opts.authLike),

      busy: true,

      appShellVisible: opts.appShellVisible !== false,
    }
  );

  setCoreState(
    AppCore,
    {
      shellBusy: true,
      appShellVisible: opts.appShellVisible !== false,
    }
  );

  safeEmit(
    AppCore,
    SHELL_EVENTS.busy,
    {
      snapshot: getShellSnapshot(AppCore, opts.Router || null),
    }
  );

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getElementSnapshot(el) {
  if (!el) {
    return {
      exists: false,
    };
  }

  return {
    exists: true,

    hidden: Boolean(el.hidden),

    ariaHidden: safeText(el.getAttribute?.("aria-hidden"), ""),
    ariaBusy: safeText(el.getAttribute?.("aria-busy"), ""),

    datasetShell: safeText(el.dataset?.shell, ""),
    datasetChrome: safeText(el.dataset?.chrome, ""),
    datasetRouteMode: safeText(el.dataset?.routeMode, ""),
    datasetShellInteractive: safeText(el.dataset?.shellInteractive, ""),

    className: safeText(el.className, ""),
  };
}

export function getShellSnapshot(AppCore, Router = null) {
  const {
    appShell,
    mainContent,
    appContent,
    viewContainer,

    sidebarMount,
    topbarMount,

    sidebar,
    topbar,

    tablehead,
    tableheadContainer,

    loader,

    body,
    html,
  } = getShellElements(AppCore);

  const state = getCoreState(AppCore);

  const canonical =
    getCurrentCanonicalPath(AppCore, Router) ||
    state.route ||
    DEFAULT_ROUTE;

  const publicPath =
    getCurrentPublicPath(AppCore, Router) ||
    state.publicPath ||
    DEFAULT_ROUTE;

  const chromeVisible = readShellVisibility(AppCore);

  const appShellVisible = appShell
    ? !appShell.hidden &&
      appShell.getAttribute("aria-hidden") !== "true"
    : false;

  return {
    shellVisible: chromeVisible,
    chromeVisible,
    appShellVisible,

    authLike: isAuthLikeRoute(AppCore, Router),

    canonical: redactTokenInText(canonical),
    publicPath: redactTokenInText(publicPath),

    booting: Boolean(state.booting),
    loading: Boolean(state.loading),
    ready: Boolean(state.ready),

    bootBusy: isBootingOrLoading(AppCore),
    bodyBootClass: hasBodyBootClass(),

    loaderVisible: isLoaderVisible(AppCore),

    elements: {
      appShell: getElementSnapshot(appShell),
      mainContent: getElementSnapshot(mainContent),
      appContent: getElementSnapshot(appContent),
      viewContainer: getElementSnapshot(viewContainer),

      sidebarMount: getElementSnapshot(sidebarMount),
      topbarMount: getElementSnapshot(topbarMount),

      sidebar: getElementSnapshot(sidebar),
      topbar: getElementSnapshot(topbar),

      tablehead: getElementSnapshot(tablehead),
      tableheadContainer: getElementSnapshot(tableheadContainer),

      loader: getElementSnapshot(loader),
    },

    appShellExists: Boolean(appShell),
    appShellHidden: Boolean(appShell?.hidden),
    appShellBusy: safeText(appShell?.getAttribute?.("aria-busy"), ""),

    mainContentExists: Boolean(mainContent),
    appContentExists: Boolean(appContent),

    hasView: Boolean(viewContainer),
    hasViewContent: hasViewContent(viewContainer),

    sidebarMountExists: Boolean(sidebarMount),
    sidebarMountHidden: Boolean(sidebarMount?.hidden),

    topbarMountExists: Boolean(topbarMount),
    topbarMountHidden: Boolean(topbarMount?.hidden),

    sidebarExists: Boolean(sidebar),
    sidebarHidden: Boolean(sidebar?.hidden),

    topbarExists: Boolean(topbar),
    topbarHidden: Boolean(topbar?.hidden),

    tableheadExists: Boolean(tablehead),
    tableheadHidden: Boolean(tablehead?.hidden),

    tableheadContainerExists: Boolean(tableheadContainer),
    tableheadContainerHidden: Boolean(tableheadContainer?.hidden),

    loaderExists: Boolean(loader),
    loaderHidden: Boolean(loader?.hidden),

    bodyShell: safeText(body?.dataset?.shell, ""),
    htmlShell: safeText(html?.dataset?.shell, ""),

    bodyChrome: safeText(body?.dataset?.chrome, ""),
    htmlChrome: safeText(html?.dataset?.chrome, ""),

    bodyRouteMode: safeText(body?.dataset?.routeMode, ""),
    htmlRouteMode: safeText(html?.dataset?.routeMode, ""),

    bodyClasses: safeArrayFromClassList(body?.classList),
    htmlClasses: safeArrayFromClassList(html?.classList),
  };
}

/* =========================================================
   DEBUG / MAINTENANCE
========================================================= */

export function refreshShellElements(AppCore) {
  const elements = getShellElements(AppCore);

  safeEmit(
    AppCore,
    SHELL_EVENTS.elements,
    {
      snapshot: getShellSnapshot(AppCore),
    }
  );

  return elements;
}

export function resetShellRuntimeState(AppCore) {
  setCoreState(
    AppCore,
    {
      shellVisible: true,
      chromeVisible: true,
      appShellVisible: true,
      shellAuthLike: false,
      shellBusy: false,
      shellReady: false,
    }
  );

  markShellDomState(
    AppCore,
    {
      chromeVisible: true,
      authLike: false,
      busy: false,
      appShellVisible: true,
    }
  );

  return getShellSnapshot(AppCore);
}

/* =========================================================
   EXPORT
========================================================= */

export default {
  getShellElements,
  getViewContainer,

  readShellVisibility,
  setShellVisibility,

  isLoginPath,
  isResetPasswordPath,
  isResetPasswordConfirmPath,
  isActivateAccountPath,
  isAuthLikePath,
  isAuthLikeRoute,

  updateShellVisibilityByRoute,
  applyPostRenderLoaderPolicy,

  markShellReady,
  markShellBusy,

  refreshShellElements,
  resetShellRuntimeState,

  getShellSnapshot,
};
