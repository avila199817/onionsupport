/* =========================================================
   Onion SPA - Router Shell
   Archivo: src/router/shell.js

   FINAL EXTREME SYSTEM · SHELL / ACTIVE MENU / CHROME STATE · 12/10

   RESPONSABILIDADES:
   - resolver elementos visuales del shell
   - limpiar contenedores dinámicos antes de render
   - actualizar título del documento
   - activar menú SPA según ruta canónica actual
   - mostrar/ocultar chrome del shell por ruta
   - reparar clases residuales de auth/login tras navegación privada
   - mantener #app-shell/#main/#view-container siempre disponibles
   - no tocar history
   - no modificar query/hash
   - no destruir rutas públicas técnicas con token
   - evitar event storms entre shell/router/ui

   HARDENING EXTREMO:
   - guards browser totales
   - DOM cache tolerante y autocorrectivo
   - clearDynamicContainers no destruye mounts fijos
   - active menu por canonical exacto
   - /incidencias no puede activar /facturas
   - /facturas no puede activar /incidencias
   - /@usuario/facturas activa /facturas
   - /@usuario/incidencias activa /incidencias
   - auth shell no deja panel debajo del sidebar
   - login/auth limpia sidebar-open/sidebar-collapsed residual
   - visible shell restaura route-app/route-shell-visible
   - eventos deduplicados
   - safeEmit no duplica bus + window
   - snapshots de diagnóstico
========================================================= */

import {
  normalizeCanonicalPath,
  resolveSpaHref,
} from "./helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const SHELL_SOURCE =
  "router.shell";

const SHELL_EVENT_DEDUPE_MS =
  32;

const AUTH_CANONICAL_PATHS =
  new Set([
    "/login",
    "/signin",
    "/sign-in",
    "/auth",
    "/auth/login",
    "/2fa",
    "/otp",
    "/activate-account",
    "/reset-password",
    "/reset-password/confirm",
    "/forgot-password",
    "/recover-password",
    "/recover",
    "/password-reset",
  ]);

const AUTH_CANONICAL_PREFIXES =
  Object.freeze([
    "/activate-account/",
    "/reset-password/confirm/",
  ]);

const ROOT_BOOT_CLASSES =
  Object.freeze([
    "app-booting",
    "app-loading",
    "loading",
  ]);

const ROUTE_AUTH_CLASSES =
  Object.freeze([
    "auth-screen",
    "login-no-scroll",
    "route-auth",
    "route-shell-hidden",
    "shell-hidden",
  ]);

const ROUTE_APP_CLASSES =
  Object.freeze([
    "route-app",
    "route-shell-visible",
    "shell-visible",
  ]);

const SIDEBAR_RESIDUAL_CLASSES =
  Object.freeze([
    "sidebar-open",
    "sidebar-collapsed",
    "sidebar-transitioning",
    "sidebar-tooltips-active",
    "sidebar-mobile-open",
    "has-sidebar-open",
  ]);

const ACTIVE_LINK_CLASSES =
  Object.freeze([
    "active",
    "is-active",
    "router-active",
    "sidebar-link--active",
    "menu-item--active",
  ]);

const ACTIVE_PARENT_CLASSES =
  Object.freeze([
    "active",
    "is-active",
    "router-active",
  ]);

const MENU_SELECTOR =
  [
    "a[data-spa]",
    "a[href][data-route]",
    "a[href][data-nav-route]",
    "a[href][data-menu-route]",
    "[data-spa][href]",
    "[data-route]",
    "[data-nav-route]",
    "[data-menu-route]",
    "[data-sidebar-route]",
  ].join(",");

const DYNAMIC_SELECTOR =
  [
    "[data-router-dynamic]",
    "[data-dynamic-slot]",
    "[data-tablehead-dynamic]",
    "[data-route-dynamic]",
  ].join(",");

const PROTECTED_CLEAR_ROOT_SELECTOR =
  [
    "#app-shell",
    "#main-content",
    "#app-content",
    "#view-container",
    "#app-loader",
    "#sidebar-mount",
    "#topbar-mount",
    "#app-sidebar",
    "#app-topbar",
    ".sidebar",
    ".topbar",
    "[data-app-shell]",
    "[data-main-content]",
    "[data-app-content]",
    "[data-view-root]",
    "[data-app-loader]",
    "[data-sidebar-root]",
    "[data-topbar-root]",
  ].join(",");

const TABLEHEAD_SELECTORS =
  Object.freeze([
    "#table-head",
    ".table-head",
    "[data-tablehead]",
  ]);

const TABLEHEAD_CONTAINER_SELECTORS =
  Object.freeze([
    "#tablehead-container",
    "[data-tablehead-container]",
  ]);

/* =========================================================
   INTERNAL STATE
========================================================= */

let lastShellEventKey =
  "";

let lastShellEventAt =
  0;

let lastActiveMenuKey =
  "";

let lastActiveMenuAt =
  0;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFn(value) {
  return typeof value === "function";
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

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function unique(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    )
  );
}

/* =========================================================
   LOG / EMIT
========================================================= */

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(
      "[Router Shell]",
      ...args
    );
  } catch {}

  try {
    if (AppCore?.config?.debug !== false) {
      console.warn(
        "[Router Shell]",
        ...args
      );
    }
  } catch {}
}

function safeLog(AppCore, ...args) {
  try {
    AppCore?.utils?.log?.(
      "[Router Shell]",
      ...args
    );
  } catch {}
}

function safeWindowDispatch(eventName, payload = {}) {
  if (
    !isBrowser() ||
    !eventName
  ) {
    return false;
  }

  try {
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail:
          payload,
      })
    );

    return true;
  } catch {}

  return false;
}

function safeEmit(AppCore, eventName, payload = {}, options = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const opts =
    safeObject(options);

  let busAvailable =
    false;

  let busEmitted =
    false;

  try {
    if (isFn(AppCore?.events?.emit)) {
      busAvailable = true;

      AppCore.events.emit(
        name,
        payload
      );

      busEmitted = true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `AppCore.events.emit("${name}") falló.`,
      error
    );
  }

  /*
    Anti storm:
    si existe bus interno, NO duplicamos por window salvo force explícito.
  */
  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    const windowOk =
      safeWindowDispatch(
        name,
        payload
      );

    return Boolean(
      busEmitted ||
      windowOk
    );
  }

  return busEmitted;
}

function emitDeduped(AppCore, eventName, payload = {}, dedupeMs = SHELL_EVENT_DEDUPE_MS) {
  const now =
    safeNow();

  const key =
    [
      eventName,
      payload?.source,
      payload?.route,
      payload?.canonicalPath,
      payload?.publicPath,
      payload?.hidden,
      payload?.mode,
      payload?.authScreen,
    ]
      .map((value) => safeText(value, ""))
      .join("|");

  if (
    key === lastShellEventKey &&
    now - lastShellEventAt < dedupeMs
  ) {
    return false;
  }

  lastShellEventKey =
    key;

  lastShellEventAt =
    now;

  return safeEmit(
    AppCore,
    eventName,
    payload
  );
}

/* =========================================================
   DOM HELPERS
========================================================= */

function getDocumentElement() {
  if (!isBrowser()) {
    return null;
  }

  try {
    return document.documentElement || null;
  } catch {
    return null;
  }
}

function getBodyElement(AppCore = null) {
  if (!isBrowser()) {
    return null;
  }

  try {
    const cached =
      AppCore?.dom?.body;

    if (
      cached &&
      document.contains(cached)
    ) {
      return cached;
    }
  } catch {}

  try {
    const body =
      document.body || null;

    if (
      body &&
      AppCore?.dom
    ) {
      AppCore.dom.body = body;
    }

    return body;
  } catch {
    return null;
  }
}

function queryOne(selector = "") {
  if (
    !isBrowser() ||
    !selector
  ) {
    return null;
  }

  try {
    if (selector.startsWith("#")) {
      return document.getElementById(
        selector.slice(1)
      );
    }

    return document.querySelector(
      selector
    );
  } catch {
    return null;
  }
}

function isConnectedNode(node) {
  if (!node) {
    return false;
  }

  try {
    return Boolean(
      node.isConnected ||
      document.contains(node)
    );
  } catch {
    return false;
  }
}

function resolveDomElement(AppCore, keys = [], selectors = []) {
  if (!isBrowser()) {
    return null;
  }

  const keyList =
    Array.isArray(keys)
      ? keys
      : [keys];

  for (const key of keyList) {
    try {
      const fromCore =
        AppCore?.dom?.[key];

      if (
        fromCore &&
        isConnectedNode(fromCore)
      ) {
        return fromCore;
      }
    } catch {}
  }

  for (const selector of selectors) {
    const found =
      queryOne(selector);

    if (found) {
      try {
        if (
          AppCore?.dom &&
          keyList[0]
        ) {
          AppCore.dom[keyList[0]] = found;
        }
      } catch {}

      return found;
    }
  }

  return null;
}

function safeToggleHidden(element, hidden) {
  if (!element) {
    return false;
  }

  const next =
    Boolean(hidden);

  try {
    element.hidden = next;
  } catch {}

  try {
    element.setAttribute(
      "aria-hidden",
      next ? "true" : "false"
    );
  } catch {}

  return true;
}

function safeSetBusy(element, busy = false) {
  if (!element) {
    return false;
  }

  try {
    element.setAttribute(
      "aria-busy",
      busy ? "true" : "false"
    );

    return true;
  } catch {
    return false;
  }
}

function safeSetAttribute(element, name, value) {
  if (
    !element ||
    !name
  ) {
    return false;
  }

  try {
    element.setAttribute(
      name,
      String(value)
    );

    return true;
  } catch {
    return false;
  }
}

function safeRemoveAttribute(element, name) {
  if (
    !element ||
    !name
  ) {
    return false;
  }

  try {
    element.removeAttribute(name);
    return true;
  } catch {
    return false;
  }
}

function safeClassToggle(element, className, enabled) {
  if (
    !element ||
    !className
  ) {
    return false;
  }

  try {
    element.classList.toggle(
      className,
      Boolean(enabled)
    );

    return true;
  } catch {
    return false;
  }
}

function safeClassAdd(element, ...classes) {
  if (!element) {
    return false;
  }

  const clean =
    unique(classes);

  if (!clean.length) {
    return false;
  }

  try {
    element.classList.add(...clean);
    return true;
  } catch {
    return false;
  }
}

function safeClassRemove(element, ...classes) {
  if (!element) {
    return false;
  }

  const clean =
    unique(classes);

  if (!clean.length) {
    return false;
  }

  try {
    element.classList.remove(...clean);
    return true;
  } catch {
    return false;
  }
}

function safeDataset(element, key, value) {
  if (
    !element ||
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
      delete element.dataset[key];
      return true;
    }

    element.dataset[key] =
      String(value);

    return true;
  } catch {
    return false;
  }
}

function safeReplaceChildren(element) {
  if (!element) {
    return false;
  }

  try {
    element.replaceChildren();
    return true;
  } catch {}

  try {
    element.innerHTML = "";
    return true;
  } catch {}

  return false;
}

/* =========================================================
   PATH HELPERS
========================================================= */

function normalizePathnameOnly(pathname = "/") {
  let value =
    safeText(pathname, "/")
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (value.length > 1) {
    value =
      value.replace(/\/+$/g, "") || "/";
  }

  return value || "/";
}

function stripSearchAndHash(path = "/") {
  const raw =
    safeText(path, "/") || "/";

  const clean =
    raw
      .split("?")[0]
      .split("#")[0] || "/";

  return normalizePathnameOnly(clean);
}

function isAuthCanonicalPath(path = "/") {
  const clean =
    stripSearchAndHash(path);

  if (AUTH_CANONICAL_PATHS.has(clean)) {
    return true;
  }

  return AUTH_CANONICAL_PREFIXES.some((prefix) =>
    clean.startsWith(prefix)
  );
}

function safeCanonicalPath(AppCore, path = "/") {
  try {
    return stripSearchAndHash(
      normalizeCanonicalPath(
        AppCore,
        path || "/"
      )
    );
  } catch {
    return stripSearchAndHash(path || "/");
  }
}

function safeResolveSpaHref(AppCore, href = "/") {
  const raw =
    safeText(href, "");

  if (!raw) {
    return "";
  }

  try {
    return resolveSpaHref(
      AppCore,
      raw
    ) || "";
  } catch {
    return raw;
  }
}

/* =========================================================
   ROUTE META
========================================================= */

function getRouteMeta(route = null) {
  return safeObject(route?.meta);
}

function getRoutePath(route = null) {
  return safeText(
    route?.canonicalPath ||
      route?.path ||
      route?.routePath ||
      "",
    ""
  );
}

function routeRequestsHiddenShell(route = null) {
  const meta =
    getRouteMeta(route);

  const routePath =
    getRoutePath(route);

  if (isAuthCanonicalPath(routePath)) {
    return true;
  }

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

function routeRequestsAuthScreen(route = null) {
  const meta =
    getRouteMeta(route);

  const routePath =
    getRoutePath(route);

  return Boolean(
    routeRequestsHiddenShell(route) ||
      isAuthCanonicalPath(routePath) ||
      route?.authScreen === true ||
      meta.authScreen === true ||
      route?.layout === "auth" ||
      meta.layout === "auth"
  );
}

/* =========================================================
   ELEMENTS
========================================================= */

export function getShellElements(AppCore) {
  if (!isBrowser()) {
    return {
      html: null,
      body: null,

      shell: null,
      main: null,
      appContent: null,
      viewContainer: null,

      sidebar: null,
      topbar: null,
      tablehead: null,
      tableheadContainer: null,
      mobileToggle: null,
      loader: null,
    };
  }

  const html =
    getDocumentElement();

  const body =
    getBodyElement(AppCore);

  const shell =
    resolveDomElement(
      AppCore,
      [
        "shell",
        "appShell",
        "layout",
      ],
      [
        "#app-shell",
        "[data-app-shell='true']",
        "[data-app-shell]",
        ".app-shell",
        ".layout",
      ]
    );

  const main =
    resolveDomElement(
      AppCore,
      [
        "main",
        "mainContent",
      ],
      [
        "#main-content",
        ".main-content",
        "[data-main-content='true']",
        "[data-main-content]",
        "main[role='main']",
        "main",
      ]
    );

  const appContent =
    resolveDomElement(
      AppCore,
      [
        "appContent",
        "content",
      ],
      [
        "#app-content",
        "[data-app-content='true']",
        "[data-app-content]",
      ]
    );

  const viewContainer =
    resolveDomElement(
      AppCore,
      [
        "viewContainer",
        "view",
        "routerView",
      ],
      [
        "#view-container",
        "[data-view-root='true']",
        "[data-view-root]",
        "[data-router-view='true']",
        "[data-router-view]",
      ]
    );

  const sidebar =
    resolveDomElement(
      AppCore,
      [
        "sidebar",
        "sidebarRoot",
      ],
      [
        "#app-sidebar",
        "#sidebar",
        ".sidebar",
        "[data-sidebar-root='true']",
        "[data-sidebar-root]",
        "[data-sidebar='true']",
        "[data-sidebar]",
      ]
    );

  const topbar =
    resolveDomElement(
      AppCore,
      [
        "topbar",
        "topbarRoot",
      ],
      [
        "#app-topbar",
        "#topbar",
        ".topbar",
        "[data-topbar-root='true']",
        "[data-topbar-root]",
        "[data-topbar='true']",
        "[data-topbar]",
      ]
    );

  const tablehead =
    resolveDomElement(
      AppCore,
      [
        "tablehead",
        "tableHead",
      ],
      TABLEHEAD_SELECTORS
    );

  const tableheadContainer =
    resolveDomElement(
      AppCore,
      [
        "tableheadContainer",
        "tableHeadContainer",
      ],
      TABLEHEAD_CONTAINER_SELECTORS
    );

  const mobileToggle =
    resolveDomElement(
      AppCore,
      [
        "sidebarMobileToggle",
        "mobileToggle",
      ],
      [
        "#toggleSidebarMobile",
        "[data-sidebar-mobile-toggle]",
        "[data-mobile-sidebar-toggle]",
      ]
    );

  const loader =
    resolveDomElement(
      AppCore,
      [
        "loader",
        "appLoader",
      ],
      [
        "#app-loader",
        ".app-loader",
        "[data-app-loader='true']",
        "[data-app-loader]",
      ]
    );

  try {
    if (AppCore?.dom) {
      AppCore.dom.html = html;
      AppCore.dom.body = body;

      AppCore.dom.shell = shell;
      AppCore.dom.appShell = shell;
      AppCore.dom.layout = shell;

      AppCore.dom.main = main;
      AppCore.dom.mainContent = main;

      AppCore.dom.appContent = appContent;
      AppCore.dom.viewContainer = viewContainer;

      AppCore.dom.sidebar = sidebar;
      AppCore.dom.topbar = topbar;

      AppCore.dom.tablehead = tablehead;
      AppCore.dom.tableHead = tablehead;
      AppCore.dom.tableheadContainer = tableheadContainer;
      AppCore.dom.tableHeadContainer = tableheadContainer;

      AppCore.dom.sidebarMobileToggle = mobileToggle;
      AppCore.dom.loader = loader;
    }
  } catch {}

  return {
    html,
    body,

    shell,
    main,
    appContent,
    viewContainer,

    sidebar,
    topbar,
    tablehead,
    tableheadContainer,
    mobileToggle,
    loader,
  };
}

/* =========================================================
   CORE BRIDGES
========================================================= */

function isProtectedClearNode(node) {
  if (!node) {
    return true;
  }

  try {
    if (node.matches?.(PROTECTED_CLEAR_ROOT_SELECTOR)) {
      return true;
    }
  } catch {}

  try {
    if (
      node.closest?.(
        [
          "#sidebar-mount",
          "#topbar-mount",
          "#app-loader",
          "#app-sidebar",
          "#app-topbar",
          ".sidebar",
          ".topbar",
          "[data-sidebar-root]",
          "[data-topbar-root]",
          "[data-app-loader]",
        ].join(",")
      )
    ) {
      return true;
    }
  } catch {}

  return false;
}

function clearNodeIfSafe(node) {
  if (!node) {
    return false;
  }

  if (isProtectedClearNode(node)) {
    return false;
  }

  return safeReplaceChildren(node);
}

export function clearDynamicContainers(AppCore) {
  /*
    Compatibilidad con Core, pero no confiamos solo en él.
    Si existe y falla, seguimos con limpieza local segura.
  */
  try {
    if (isFn(AppCore?.clearDynamicContainers)) {
      AppCore.clearDynamicContainers({
        source:
          SHELL_SOURCE,
        preserveView:
          true,
        preserveShell:
          true,
        preserveMounts:
          true,
      });
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "AppCore.clearDynamicContainers() falló.",
      error
    );
  }

  if (!isBrowser()) {
    return false;
  }

  let cleared =
    false;

  try {
    const {
      tablehead,
      tableheadContainer,
    } =
      getShellElements(AppCore);

    if (tableheadContainer) {
      safeReplaceChildren(tableheadContainer);
      cleared = true;
    }

    if (tablehead) {
      safeToggleHidden(tablehead, true);
      safeSetBusy(tablehead, false);
      safeDataset(tablehead, "tableheadState", "empty");
      cleared = true;
    }

    document
      .querySelectorAll(DYNAMIC_SELECTOR)
      .forEach((node) => {
        if (clearNodeIfSafe(node)) {
          cleared = true;
        }
      });

    safeEmit(
      AppCore,
      "router:shell:dynamic-cleared",
      {
        source:
          SHELL_SOURCE,
        cleared,
      }
    );

    return true;
  } catch (error) {
    safeWarn(
      AppCore,
      "clearDynamicContainers() local falló.",
      error
    );

    return false;
  }
}

function normalizeDocumentTitle(title = "", appName = "Onion Support") {
  const cleanAppName =
    safeText(appName, "Onion Support");

  const cleanTitle =
    safeText(title, cleanAppName)
      .replace(/\s+/g, " ")
      .slice(0, 140);

  if (
    !cleanTitle ||
    cleanTitle === cleanAppName
  ) {
    return {
      cleanTitle:
        cleanAppName,
      finalTitle:
        cleanAppName,
    };
  }

  return {
    cleanTitle,
    finalTitle:
      `${cleanTitle} · ${cleanAppName}`,
  };
}

export function setDocumentTitle(
  AppCore,
  title = AppCore?.config?.appName
) {
  const appName =
    safeText(
      AppCore?.config?.appName,
      "Onion Support"
    );

  const {
    cleanTitle,
    finalTitle,
  } =
    normalizeDocumentTitle(
      title,
      appName
    );

  try {
    if (isFn(AppCore?.setDocumentTitle)) {
      AppCore.setDocumentTitle(
        cleanTitle,
        {
          finalTitle,
          source:
            SHELL_SOURCE,
        }
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "AppCore.setDocumentTitle() falló.",
      error
    );
  }

  if (!isBrowser()) {
    return false;
  }

  try {
    document.title =
      finalTitle;

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ACTIVE MENU
========================================================= */

function getSpaLinks(AppCore) {
  if (!isBrowser()) {
    return [];
  }

  try {
    const fromCore =
      AppCore?.utils?.qsa?.(
        MENU_SELECTOR
      );

    if (fromCore) {
      return Array.from(fromCore);
    }
  } catch {}

  try {
    return Array.from(
      document.querySelectorAll(MENU_SELECTOR)
    );
  } catch {
    return [];
  }
}

function getElementRouteCandidate(element) {
  if (!element) {
    return "";
  }

  const attributes =
    [
      "data-canonical-path",
      "data-route-path",
      "data-route",
      "data-nav-route",
      "data-menu-route",
      "data-sidebar-route",
      "href",
    ];

  for (const attr of attributes) {
    try {
      const value =
        element.getAttribute?.(attr);

      if (safeText(value, "")) {
        return value;
      }
    } catch {}
  }

  return "";
}

function resolveLinkCanonical(AppCore, element) {
  const candidate =
    getElementRouteCandidate(element);

  if (!candidate) {
    return "";
  }

  try {
    const resolvedHref =
      safeResolveSpaHref(
        AppCore,
        candidate
      );

    if (!resolvedHref) {
      return "";
    }

    return safeCanonicalPath(
      AppCore,
      resolvedHref
    );
  } catch {
    return "";
  }
}

function getActiveParent(element) {
  if (!element) {
    return null;
  }

  try {
    return element.closest?.(
      [
        "[data-menu-item]",
        "[data-sidebar-item]",
        ".sidebar-menu-item",
        ".menu-item",
        ".nav-item",
        "li",
      ].join(",")
    ) || null;
  } catch {
    return null;
  }
}

function toggleActiveElement(element, active = false) {
  if (!element) {
    return false;
  }

  for (const className of ACTIVE_LINK_CLASSES) {
    safeClassToggle(
      element,
      className,
      active
    );
  }

  safeDataset(
    element,
    "active",
    active ? "true" : "false"
  );

  if (active) {
    safeSetAttribute(
      element,
      "aria-current",
      "page"
    );
  } else {
    safeRemoveAttribute(
      element,
      "aria-current"
    );
  }

  const parent =
    getActiveParent(element);

  if (parent && parent !== element) {
    for (const className of ACTIVE_PARENT_CLASSES) {
      safeClassToggle(
        parent,
        className,
        active
      );
    }

    safeDataset(
      parent,
      "active",
      active ? "true" : "false"
    );
  }

  return true;
}

export function setActiveMenu(
  AppCore,
  pathname = "/"
) {
  if (!isBrowser()) {
    return false;
  }

  const currentCanonical =
    safeCanonicalPath(
      AppCore,
      pathname || "/"
    );

  const links =
    getSpaLinks(AppCore);

  let activeCount =
    0;

  for (const link of links) {
    if (!link) {
      continue;
    }

    const hrefCanonical =
      resolveLinkCanonical(
        AppCore,
        link
      );

    const active =
      Boolean(
        hrefCanonical &&
          hrefCanonical === currentCanonical
      );

    if (active) {
      activeCount += 1;
    }

    toggleActiveElement(
      link,
      active
    );
  }

  const now =
    safeNow();

  const eventKey =
    `${currentCanonical}|${links.length}|${activeCount}`;

  if (
    eventKey !== lastActiveMenuKey ||
    now - lastActiveMenuAt > SHELL_EVENT_DEDUPE_MS
  ) {
    lastActiveMenuKey =
      eventKey;

    lastActiveMenuAt =
      now;

    safeEmit(
      AppCore,
      "router:shell:active-menu",
      {
        source:
          SHELL_SOURCE,
        canonicalPath:
          currentCanonical,
        count:
          links.length,
        activeCount,
      }
    );
  }

  return true;
}

/* =========================================================
   SHELL MODE
========================================================= */

function syncShellState(
  AppCore,
  {
    hidden = false,
    authScreen = false,
    routePath = null,
    canonicalPath = null,
    mode = "app",
  } = {}
) {
  const patch = {
    shellVisible:
      !hidden,

    shellHidden:
      Boolean(hidden),

    routeShellHidden:
      Boolean(hidden),

    authScreen:
      Boolean(authScreen),

    routeMode:
      mode,

    currentShellRoute:
      routePath,

    currentShellCanonicalPath:
      canonicalPath || routePath || null,
  };

  try {
    AppCore?.setState?.(patch);
  } catch {
    try {
      if (AppCore?.state) {
        Object.assign(
          AppCore.state,
          patch
        );
      }
    } catch {}
  }

  try {
    if (isFn(AppCore?.setShellVisibility)) {
      AppCore.setShellVisibility(
        !hidden,
        {
          source:
            SHELL_SOURCE,
          mode,
          route:
            routePath,
        }
      );
    }
  } catch {}

  return {
    hidden:
      Boolean(hidden),
    visible:
      !hidden,
    authScreen:
      Boolean(authScreen),
    route:
      routePath,
    canonicalPath:
      canonicalPath || routePath || null,
    mode,
  };
}

function hideLoader(AppCore, reason = "router-shell") {
  const {
    loader,
    body,
    html,
  } =
    getShellElements(AppCore);

  try {
    html?.classList?.remove?.("app-loading");
    body?.classList?.remove?.("app-loading", "loading");
  } catch {}

  if (!loader) {
    return false;
  }

  try {
    loader.classList.remove(
      "is-visible",
      "is-leaving",
      "app-loader--visible"
    );

    loader.classList.add(
      "is-hidden",
      "has-hidden"
    );

    loader.setAttribute(
      "aria-hidden",
      "true"
    );

    loader.setAttribute(
      "aria-busy",
      "false"
    );

    loader.dataset.loaderVisible =
      "false";

    loader.dataset.loaderState =
      "hidden";

    loader.dataset.loaderReason =
      reason;

    loader.hidden =
      true;
  } catch {}

  safeEmit(
    AppCore,
    "app:loader:hidden",
    {
      source:
        SHELL_SOURCE,
      reason,
    }
  );

  return true;
}

function hasContent(element) {
  if (!element) {
    return false;
  }

  try {
    return Boolean(
      safeText(
        element.textContent ||
          element.innerHTML,
        ""
      )
    );
  } catch {
    return false;
  }
}

function applyRootClasses({
  html,
  body,
  hideShell = false,
  authScreen = false,
}) {
  for (const element of [html, body]) {
    safeClassRemove(
      element,
      ...ROOT_BOOT_CLASSES
    );

    safeClassAdd(
      element,
      "app-ready"
    );

    safeClassToggle(
      element,
      "route-auth",
      hideShell
    );

    safeClassToggle(
      element,
      "route-shell-hidden",
      hideShell
    );

    safeClassToggle(
      element,
      "route-shell-visible",
      !hideShell
    );

    safeClassToggle(
      element,
      "route-app",
      !hideShell
    );

    safeClassToggle(
      element,
      "shell-hidden",
      hideShell
    );

    safeClassToggle(
      element,
      "shell-visible",
      !hideShell
    );

    safeClassToggle(
      element,
      "auth-screen",
      authScreen
    );
  }

  if (body) {
    if (hideShell) {
      safeClassRemove(
        body,
        ...SIDEBAR_RESIDUAL_CLASSES
      );
    } else {
      safeClassRemove(
        body,
        "login-no-scroll"
      );
    }
  }
}

function applyRootDatasets({
  html,
  body,
  hideShell = false,
  authScreen = false,
  mode = "app",
  routePath = null,
  canonicalPath = null,
}) {
  for (const element of [html, body]) {
    safeDataset(
      element,
      "shell",
      hideShell ? "hidden" : "visible"
    );

    safeDataset(
      element,
      "shellHidden",
      hideShell ? "true" : "false"
    );

    safeDataset(
      element,
      "authScreen",
      authScreen ? "true" : "false"
    );

    safeDataset(
      element,
      "routeMode",
      mode
    );

    safeDataset(
      element,
      "currentRoute",
      routePath || ""
    );

    safeDataset(
      element,
      "currentCanonicalPath",
      canonicalPath || routePath || ""
    );
  }
}

function applyChromeVisibility({
  hideShell = false,
  sidebar,
  topbar,
  tablehead,
  tableheadContainer,
  mobileToggle,
}) {
  safeToggleHidden(
    sidebar,
    hideShell
  );

  safeToggleHidden(
    topbar,
    hideShell
  );

  const tableheadHasContent =
    hasContent(tableheadContainer);

  safeToggleHidden(
    tablehead,
    hideShell || !tableheadHasContent
  );

  safeToggleHidden(
    tableheadContainer,
    hideShell
  );

  if (mobileToggle) {
    safeToggleHidden(
      mobileToggle,
      hideShell
    );

    safeSetAttribute(
      mobileToggle,
      "aria-hidden",
      hideShell ? "true" : "false"
    );

    if (hideShell) {
      safeSetAttribute(
        mobileToggle,
        "aria-expanded",
        "false"
      );
    }
  }
}

function exposeCoreLayout({
  shell,
  main,
  appContent,
  viewContainer,
}) {
  /*
    No ocultamos estos nodos: el view-container suele vivir dentro.
    Ocultar #app-shell causa pantallas partidas y offsets incorrectos.
  */
  for (const element of [
    shell,
    main,
    appContent,
    viewContainer,
  ]) {
    safeToggleHidden(
      element,
      false
    );

    safeSetBusy(
      element,
      false
    );

    safeSetAttribute(
      element,
      "aria-hidden",
      "false"
    );
  }
}

export function setShellMode(
  AppCore,
  route = null
) {
  const routePath =
    getRoutePath(route) || null;

  const canonicalPath =
    routePath
      ? safeCanonicalPath(
          AppCore,
          routePath
        )
      : null;

  const hideShell =
    routeRequestsHiddenShell(route);

  const authScreen =
    routeRequestsAuthScreen(route);

  const mode =
    hideShell
      ? "auth"
      : "app";

  const elements =
    getShellElements(AppCore);

  const {
    html,
    body,
    sidebar,
    topbar,
    tablehead,
    tableheadContainer,
    mobileToggle,
    shell,
    main,
    appContent,
    viewContainer,
  } =
    elements;

  exposeCoreLayout({
    shell,
    main,
    appContent,
    viewContainer,
  });

  applyChromeVisibility({
    hideShell,
    sidebar,
    topbar,
    tablehead,
    tableheadContainer,
    mobileToggle,
  });

  applyRootClasses({
    html,
    body,
    hideShell,
    authScreen,
  });

  applyRootDatasets({
    html,
    body,
    hideShell,
    authScreen,
    mode,
    routePath,
    canonicalPath,
  });

  safeDataset(
    shell,
    "shell",
    hideShell ? "hidden" : "visible"
  );

  safeDataset(
    shell,
    "routeMode",
    mode
  );

  safeDataset(
    shell,
    "currentRoute",
    routePath || ""
  );

  safeDataset(
    shell,
    "currentCanonicalPath",
    canonicalPath || routePath || ""
  );

  if (hideShell) {
    hideLoader(
      AppCore,
      "router-shell:auth"
    );
  }

  const state =
    syncShellState(
      AppCore,
      {
        hidden:
          hideShell,
        authScreen,
        routePath,
        canonicalPath,
        mode,
      }
    );

  emitDeduped(
    AppCore,
    "router:shell:change",
    {
      ...state,

      source:
        SHELL_SOURCE,

      route:
        routePath,

      canonicalPath,

      hasSidebar:
        Boolean(sidebar),

      hasTopbar:
        Boolean(topbar),

      hasTablehead:
        Boolean(tablehead),

      hasTableheadContainer:
        Boolean(tableheadContainer),

      hasShell:
        Boolean(shell),

      hasMain:
        Boolean(main),

      hasAppContent:
        Boolean(appContent),

      hasViewContainer:
        Boolean(viewContainer),
    }
  );

  safeLog(
    AppCore,
    "setShellMode",
    {
      route:
        routePath,
      canonicalPath,
      hideShell,
      authScreen,
      mode,
    }
  );

  return state;
}

/* =========================================================
   DEBUG
========================================================= */

export function getShellSnapshot(AppCore) {
  const elements =
    getShellElements(AppCore);

  return {
    source:
      SHELL_SOURCE,

    route:
      AppCore?.state?.route || null,

    canonicalPath:
      AppCore?.state?.canonicalPath ||
      AppCore?.state?.route ||
      null,

    publicPath:
      AppCore?.state?.publicPath || null,

    shellVisible:
      AppCore?.state?.shellVisible ?? null,

    shellHidden:
      AppCore?.state?.shellHidden ??
      AppCore?.state?.routeShellHidden ??
      null,

    routeShellHidden:
      AppCore?.state?.routeShellHidden ?? null,

    authScreen:
      AppCore?.state?.authScreen ?? null,

    routeMode:
      AppCore?.state?.routeMode || null,

    lastShellEventKey,
    lastShellEventAt,

    lastActiveMenuKey,
    lastActiveMenuAt,

    dom: {
      bodyClasses:
        elements.body?.className || "",

      htmlClasses:
        elements.html?.className || "",

      bodyShell:
        elements.body?.dataset?.shell || null,

      htmlShell:
        elements.html?.dataset?.shell || null,

      bodyRouteMode:
        elements.body?.dataset?.routeMode || null,

      htmlRouteMode:
        elements.html?.dataset?.routeMode || null,

      bodyCurrentRoute:
        elements.body?.dataset?.currentRoute || null,

      htmlCurrentRoute:
        elements.html?.dataset?.currentRoute || null,

      hasShell:
        Boolean(elements.shell),

      hasMain:
        Boolean(elements.main),

      hasAppContent:
        Boolean(elements.appContent),

      hasViewContainer:
        Boolean(elements.viewContainer),

      hasSidebar:
        Boolean(elements.sidebar),

      hasTopbar:
        Boolean(elements.topbar),

      hasTablehead:
        Boolean(elements.tablehead),

      hasTableheadContainer:
        Boolean(elements.tableheadContainer),

      hasMobileToggle:
        Boolean(elements.mobileToggle),

      hasLoader:
        Boolean(elements.loader),

      shellHidden:
        Boolean(elements.shell?.hidden),

      mainHidden:
        Boolean(elements.main?.hidden),

      appContentHidden:
        Boolean(elements.appContent?.hidden),

      viewHidden:
        Boolean(elements.viewContainer?.hidden),

      sidebarHidden:
        Boolean(elements.sidebar?.hidden),

      topbarHidden:
        Boolean(elements.topbar?.hidden),

      tableheadHidden:
        Boolean(elements.tablehead?.hidden),

      tableheadContainerHidden:
        Boolean(elements.tableheadContainer?.hidden),

      mobileToggleHidden:
        Boolean(elements.mobileToggle?.hidden),

      loaderHidden:
        Boolean(elements.loader?.hidden),
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  getShellElements,

  clearDynamicContainers,
  setDocumentTitle,
  setActiveMenu,
  setShellMode,

  getShellSnapshot,
};
