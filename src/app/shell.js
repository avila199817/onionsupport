/* =========================================================
   Onion SPA - App Shell
   Archivo: src/app/shell.js

   ONION SUPPORT · APP SHELL CONTROLLER
   NO FLICKER · BOOT LOADER ALIGNED · EXTREME 12/10

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
   - src/css/core/layout.css
   - src/css/core/loader.css
   - index.html con #app-loader estático
   - index.html con #sidebar-mount / #topbar-mount

   REGLA:
   - Loader global lo decide App Bootstrap.
   - shell.js puede pedir hideLoader sólo cuando NO hay boot activo.
   - Durante boot, app-booting/app-loading mantiene #app-shell oculto por CSS.
   - setShellVisibility() controla chrome, no destruye #app-shell.
   - Login/reset/activate ocultan chrome, pero mantienen shell principal.

   HARDENING:
   - Soporte rutas públicas técnicas con token query/path/hash.
   - Soporte hash-router /#/login, /#/activate-account?token=...
   - Soporte publicPath con /@usuario.
   - No degrada /@usuario/incidencias a /.
   - Compatibilidad AppCore.dom heterogéneo.
   - Compatibilidad ids antiguos y nuevos.
   - Tablehead auto-hidden si no hay contenido.
   - Mobile sidebar toggle coherente.
   - Deduplicación de eventos de shell.
   - Logs y snapshots con tokens redactados.
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

  mobileSidebarToggle: "toggleSidebarMobile",

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
  "confirmToken",
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
  "loading",
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

const AUTH_SCREEN_CLASS = "auth-screen";
const LOGIN_NO_SCROLL_CLASS = "login-no-scroll";

const SHELL_EVENT_DEDUPE_MS = 40;

/* =========================================================
   RUNTIME
========================================================= */

let lastShellEventKey = "";
let lastShellEventAt = 0;

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

function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
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
    - window sólo como fallback o si se fuerza explícitamente
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

function emitShellEvent(AppCore, name, payload = {}, options = {}) {
  const opts = safeObject(options);

  if (opts.dedupe === false) {
    return safeEmit(AppCore, name, payload, opts);
  }

  const key = [
    safeText(name, ""),
    payload?.chromeVisible ? "chrome-visible" : "chrome-hidden",
    payload?.appShellVisible ? "shell-visible" : "shell-hidden",
    payload?.authLike ? "auth" : "app",
    payload?.busy ? "busy" : "idle",
    safeText(payload?.canonical || payload?.snapshot?.canonical, ""),
    safeText(payload?.publicPath || payload?.snapshot?.publicPath, ""),
  ].join("|");

  const now = safeNow();

  if (
    key === lastShellEventKey &&
    now - lastShellEventAt < SHELL_EVENT_DEDUPE_MS
  ) {
    return false;
  }

  lastShellEventKey = key;
  lastShellEventAt = now;

  return safeEmit(AppCore, name, payload, opts);
}

/* =========================================================
   TOKEN / PATH HELPERS
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

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return DEFAULT_ROUTE;
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
  let value = safeText(pathname, DEFAULT_ROUTE)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) {
    value = DEFAULT_ROUTE;
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || DEFAULT_ROUTE;
  }

  return value;
}

function normalizeSearch(search = "") {
  const value = safeText(search, "");

  if (!value) {
    return "";
  }

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value = safeText(hash, "");

  if (!value) {
    return "";
  }

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function splitFullPath(value = DEFAULT_ROUTE) {
  const raw = safeText(value, DEFAULT_ROUTE);

  if (isHashRouterPath(raw)) {
    return splitFullPath(
      normalizeHashRouterPath(raw)
    );
  }

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || DEFAULT_ROUTE;
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || DEFAULT_ROUTE;
  }

  return {
    pathname: normalizePathnameOnly(pathname),
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
  };
}

function normalizeLocalFullPath(path = DEFAULT_ROUTE) {
  const raw = safeText(path, DEFAULT_ROUTE);

  if (!raw) {
    return DEFAULT_ROUTE;
  }

  if (isHashRouterPath(raw)) {
    return normalizeLocalFullPath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed = new URL(raw, getBaseOrigin());

      if (
        parsed.hash &&
        isHashRouterPath(parsed.hash)
      ) {
        return normalizeLocalFullPath(
          normalizeHashRouterPath(parsed.hash)
        );
      }

      return normalizeLocalFullPath(
        `${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {}

  const {
    pathname,
    search,
    hash,
  } = splitFullPath(raw);

  return `${pathname}${search}${hash}`;
}

function normalizePath(AppCore, path = DEFAULT_ROUTE) {
  const local = normalizeLocalFullPath(path || DEFAULT_ROUTE);

  /*
    Si AppCore expone normalizador propio, lo usamos sólo si no degrada
    rutas no-root a "/".
  */
  try {
    if (isFunction(AppCore?.utils?.normalizePath)) {
      const external = normalizeLocalFullPath(
        AppCore.utils.normalizePath(path || DEFAULT_ROUTE) || local
      );

      const localClean = stripSearchAndHash(local);
      const externalClean = stripSearchAndHash(external);

      if (
        localClean !== DEFAULT_ROUTE &&
        externalClean === DEFAULT_ROUTE
      ) {
        return local;
      }

      return external || local;
    }
  } catch {}

  return local;
}

function stripSearchAndHash(path = DEFAULT_ROUTE) {
  const normalized = normalizeLocalFullPath(path || DEFAULT_ROUTE);

  return (
    normalized
      .split("?")[0]
      .split("#")[0] ||
    DEFAULT_ROUTE
  );
}

function isPublicUsernameSegment(segment = "") {
  return /^@[A-Za-z0-9._-]{1,80}$/.test(
    safeText(segment, "")
  );
}

function stripPublicUsernamePrefix(path = DEFAULT_ROUTE) {
  const {
    pathname,
    search,
    hash,
  } = splitFullPath(
    normalizeLocalFullPath(path || DEFAULT_ROUTE)
  );

  const segments = pathname
    .split("/")
    .filter(Boolean);

  if (
    segments.length > 0 &&
    isPublicUsernameSegment(segments[0])
  ) {
    const rest = segments.slice(1).join("/");

    const cleanPathname = rest
      ? normalizePathnameOnly(`/${rest}`)
      : DEFAULT_ROUTE;

    return `${cleanPathname}${search}${hash}`;
  }

  return `${pathname}${search}${hash}`;
}

function pathnameOnly(AppCore, path = DEFAULT_ROUTE) {
  const normalized = normalizePath(AppCore, path || DEFAULT_ROUTE);
  const canonical = stripPublicUsernamePrefix(normalized);

  return stripSearchAndHash(canonical);
}

function getBrowserPath() {
  if (!isBrowser()) {
    return DEFAULT_ROUTE;
  }

  try {
    const pathname = window.location.pathname || DEFAULT_ROUTE;
    const search = window.location.search || "";
    const hash = window.location.hash || "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
      return normalizeLocalFullPath(
        normalizeHashRouterPath(hash)
      );
    }

    return normalizeLocalFullPath(
      `${pathname}${search}${hash}`
    );
  } catch {
    return DEFAULT_ROUTE;
  }
}

/* =========================================================
   DOM LOW LEVEL
========================================================= */

function documentContains(element) {
  if (!isBrowser() || !element) {
    return false;
  }

  try {
    return document.contains(element);
  } catch {
    return false;
  }
}

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

function getCachedDomElement(AppCore, key = "", selectors = []) {
  if (!isBrowser()) {
    return null;
  }

  try {
    const cached = AppCore?.dom?.[key];

    if (
      cached &&
      documentContains(cached)
    ) {
      return cached;
    }
  } catch {}

  const found = queryFirst(selectors);

  if (found) {
    safeAssignDomCache(
      AppCore,
      {
        [key]: found,
      }
    );
  }

  return found;
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

function removeClass(el, name) {
  if (
    !el ||
    !name
  ) {
    return false;
  }

  try {
    if (el.classList.contains(name)) {
      el.classList.remove(name);
    }

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
      mobileSidebarToggle: null,

      loader: null,

      body: null,
      html: null,
    };
  }

  const appShell =
    getCachedDomElement(
      AppCore,
      "appShell",
      [
        `#${DOM_IDS.appShell}`,
        "[data-app-shell='true']",
        "[data-app-shell]",
        ".app-shell",
        ".layout",
      ]
    );

  const mainContent =
    getCachedDomElement(
      AppCore,
      "mainContent",
      [
        `#${DOM_IDS.mainContent}`,
        "main.main-content",
        "[data-main-content]",
        ".main-content",
      ]
    );

  const appContent =
    getCachedDomElement(
      AppCore,
      "appContent",
      [
        `#${DOM_IDS.appContent}`,
        "[data-app-content]",
        ".app-content",
      ]
    );

  const viewContainer =
    getCachedDomElement(
      AppCore,
      "viewContainer",
      [
        `#${DOM_IDS.viewContainer}`,
        "[data-view-root]",
        "[data-router-view]",
        "[data-view-container='true']",
        ".view-container",
      ]
    );

  const sidebarMount =
    getCachedDomElement(
      AppCore,
      "sidebarMount",
      [
        `#${DOM_IDS.sidebarMount}`,
        "[data-sidebar-mount='true']",
        "[data-sidebar-mount]",
      ]
    );

  const topbarMount =
    getCachedDomElement(
      AppCore,
      "topbarMount",
      [
        `#${DOM_IDS.topbarMount}`,
        "[data-topbar-mount='true']",
        "[data-topbar-mount]",
      ]
    );

  const sidebar =
    getCachedDomElement(
      AppCore,
      "sidebar",
      [
        `#${DOM_IDS.sidebar}`,
        ".sidebar",
        "[data-sidebar-root]",
        "[data-sidebar]",
      ]
    );

  const topbar =
    getCachedDomElement(
      AppCore,
      "topbar",
      [
        `#${DOM_IDS.topbar}`,
        ".topbar",
        "[data-topbar-root]",
        "[data-topbar]",
      ]
    );

  const tablehead =
    getCachedDomElement(
      AppCore,
      "tablehead",
      [
        `#${DOM_IDS.tablehead}`,
        ".table-head",
        "[data-tablehead]",
      ]
    );

  const tableheadContainer =
    getCachedDomElement(
      AppCore,
      "tableheadContainer",
      [
        `#${DOM_IDS.tableheadContainer}`,
        "[data-tablehead-container]",
        ".tablehead-container",
      ]
    );

  const mobileSidebarToggle =
    getCachedDomElement(
      AppCore,
      "sidebarMobileToggle",
      [
        `#${DOM_IDS.mobileSidebarToggle}`,
        "[data-sidebar-mobile-toggle]",
        "[data-mobile-sidebar-toggle]",
      ]
    );

  const loader =
    getCachedDomElement(
      AppCore,
      "loader",
      [
        `#${DOM_IDS.loader}`,
        "[data-app-loader='true']",
        "[data-app-loader]",
        ".app-loader",
      ]
    );

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
      sidebarMobileToggle: mobileSidebarToggle,

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
    mobileSidebarToggle,

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
    getCachedDomElement(
      AppCore,
      "viewContainer",
      [
        `#${DOM_IDS.viewContainer}`,
        "[data-view-root]",
        "[data-router-view]",
        "[data-view-container='true']",
        ".view-container",
      ]
    );

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
      state.loaderVisible ||
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

function tableheadHasContent(tableheadContainer) {
  if (!tableheadContainer) {
    return false;
  }

  try {
    if (tableheadContainer.childElementCount > 0) {
      return true;
    }
  } catch {}

  try {
    return Boolean(safeText(tableheadContainer.textContent, ""));
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

  toggleClass(root, AUTH_SCREEN_CLASS, authLike);

  if (!authLike) {
    removeClass(root, LOGIN_NO_SCROLL_CLASS);
  }

  toggleClass(root, CHROME_HIDDEN_CLASS, !chromeVisible);
  toggleClass(root, CHROME_VISIBLE_CLASS, chromeVisible);

  /*
    Compat layout.css:
    route-shell-hidden indica chrome oculto / route auth,
    no implica destruir #app-shell.
  */
  toggleClass(root, SHELL_VISIBLE_CLASS, appShellVisible);
  toggleClass(root, SHELL_HIDDEN_CLASS, !chromeVisible);

  setDataset(root, "shell", appShellVisible ? "visible" : "hidden");
  setDataset(root, "chrome", chromeVisible ? "visible" : "hidden");
  setDataset(root, "routeMode", authLike ? "auth" : "app");
  setDataset(root, "authScreen", authLike ? "true" : "false");

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
    #app-shell NO se oculta en auth/reset/activate.
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
    mobileSidebarToggle,
  } = getShellElements(AppCore);

  const chromeHidden = !nextChromeVisible;

  const hasTableheadContent =
    tableheadHasContent(tableheadContainer);

  if (
    force ||
    prevChromeVisible !== nextChromeVisible ||
    opts.forceChromeSync === true
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
    ]) {
      applyHidden(chromeElement, chromeHidden);
    }

    applyHidden(
      tablehead,
      chromeHidden || !hasTableheadContent
    );

    applyHidden(
      tableheadContainer,
      chromeHidden
    );

    if (mobileSidebarToggle) {
      applyHidden(mobileSidebarToggle, chromeHidden);

      setAttribute(
        mobileSidebarToggle,
        "aria-expanded",
        chromeHidden ? "false" : "true"
      );
    }
  } else {
    /*
      Aunque chrome no cambie, tablehead puede haber cambiado de contenido.
    */
    applyHidden(
      tablehead,
      chromeHidden || !hasTableheadContent
    );
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
        shellVisible representa chromeVisible.
        appShellVisible representa el shell raíz real.
      */
      shellVisible: nextChromeVisible,
      chromeVisible: nextChromeVisible,

      routeShellHidden: !nextChromeVisible,
      shellHidden: !nextChromeVisible,

      appShellVisible: domState.shellVisible,

      shellAuthLike: authLike,
      shellBusy: busy,

      routeMode: authLike ? "auth" : "app",

      shellUpdatedAt: safeIsoDate(),
    }
  );

  if (emit) {
    const snapshot = getShellSnapshot(AppCore);

    const payload = {
      reason: safeText(opts.reason, "set-shell-visibility"),

      hidden: chromeHidden,
      visible: nextChromeVisible,

      chromeVisible: nextChromeVisible,
      appShellVisible: domState.shellVisible,

      changed: prevChromeVisible !== nextChromeVisible,

      authLike,
      busy,

      canonical: snapshot.canonical,
      publicPath: snapshot.publicPath,

      snapshot,
    };

    emitShellEvent(AppCore, SHELL_EVENTS.change, payload);
    emitShellEvent(AppCore, SHELL_EVENTS.state, payload);
    emitShellEvent(AppCore, SHELL_EVENTS.appState, payload);
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

function routeRequestsHiddenChrome(route = null) {
  const meta = safeObject(route?.meta);

  return Boolean(
    route?.hideShell === true ||
      route?.shell === false ||
      route?.showShell === false ||
      route?.layout === "auth" ||
      route?.layout === "public" ||
      meta.hideShell === true ||
      meta.shell === false ||
      meta.showShell === false ||
      meta.layout === "auth" ||
      meta.layout === "public"
  );
}

function getRouterRoute(AppCore, Router, canonicalPath = "") {
  try {
    if (isFunction(Router?.getRoute)) {
      return Router.getRoute(canonicalPath || getCurrentCanonicalPath(AppCore, Router));
    }
  } catch {}

  try {
    if (isFunction(Router?.currentRoute)) {
      return Router.currentRoute();
    }
  } catch {}

  try {
    return Router?.route || Router?.current || null;
  } catch {
    return null;
  }
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

  const route = getRouterRoute(
    AppCore,
    Router,
    canonical
  );

  if (routeRequestsHiddenChrome(route)) {
    return true;
  }

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

  const canonical = normalizePath(
    AppCore,
    opts.canonicalPath ||
      getCurrentCanonicalPath(AppCore, Router) ||
      AppCore?.state?.route ||
      DEFAULT_ROUTE
  );

  const route =
    opts.route ||
    getRouterRoute(
      AppCore,
      Router,
      canonical
    );

  const authLike = opts.authLike !== undefined
    ? Boolean(opts.authLike)
    : Boolean(
        routeRequestsHiddenChrome(route) ||
          isAuthLikeRoute(AppCore, Router)
      );

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
      reason: opts.reason || "update-shell-visibility-by-route",
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
      reason: "post-render-policy",
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

  emitShellEvent(
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

      canonical: shellSnapshot.canonical,
      publicPath: shellSnapshot.publicPath,

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

  const Router = opts.Router || null;

  const authLike = opts.authLike !== undefined
    ? Boolean(opts.authLike)
    : isAuthLikeRoute(AppCore, Router);

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
      shellReadyAt: safeIsoDate(),
    }
  );

  emitShellEvent(
    AppCore,
    SHELL_EVENTS.ready,
    {
      snapshot: getShellSnapshot(AppCore, Router),
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

  emitShellEvent(
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
    datasetLoaderVisible: safeText(el.dataset?.loaderVisible, ""),
    datasetLoaderState: safeText(el.dataset?.loaderState, ""),

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
    mobileSidebarToggle,

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
    ready: Boolean(state.ready || state.appReady),

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
      mobileSidebarToggle: getElementSnapshot(mobileSidebarToggle),

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
    tableheadHasContent: tableheadHasContent(tableheadContainer),

    mobileSidebarToggleExists: Boolean(mobileSidebarToggle),
    mobileSidebarToggleHidden: Boolean(mobileSidebarToggle?.hidden),

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

    lastShellEventKey,
    lastShellEventAt,
  };
}

/* =========================================================
   DEBUG / MAINTENANCE
========================================================= */

export function refreshShellElements(AppCore) {
  const elements = getShellElements(AppCore);

  emitShellEvent(
    AppCore,
    SHELL_EVENTS.elements,
    {
      snapshot: getShellSnapshot(AppCore),
    },
    {
      dedupe: false,
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
      routeShellHidden: false,
      shellHidden: false,

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
   DEFAULT EXPORT
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
