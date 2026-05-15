/* =========================================================
   Onion SPA - Router Render
   Archivo: src/router/render.js

   Render host limpio:
   - renderRoot aislado por navegación.
   - state commit antes de render success.
   - canonical/public path coherentes.
   - sin innerHTML, sin CSS inline, sin event storm.
   - no emite router:rendered en flujos internos.
========================================================= */

import {
  getRouteNames,
  normalizeCanonicalPath,
  normalizePath,
  getSearchAndHash,
  getCurrentPublicPath,
  getCurrentResolvedUsername,
  getCurrentUsername,
  extractUsernameFromPath,
  buildPublicPath,
  buildLoginUrl,
  getDefaultHomeTarget,
  getProtectedInitialPublicPath,
  redactTokenInText,
} from "./helpers.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

export const ROUTER_RENDER_VERSION = "16.0.0-clean";

const DEFAULT_ROUTE = "/";
const SOURCE = "router.render";

const RENDER_HOST_ATTR = "data-router-view-host";
const RENDER_HOST_CLASS = "router-view-host";

const AUTH_CANONICAL_PATHS = new Set([
  "/login",
  "/signin",
  "/sign-in",
  "/forgot-password",
  "/recover-password",
  "/password-reset",
  "/reset-password",
  "/reset-password/confirm",
  "/activate-account",
  "/2fa",
  "/otp",
  "/mfa",
]);

const REPAIR_EVENT_DEDUPE_MS = 32;

/* =========================================================
   BASIC HELPERS
========================================================= */

let renderSeq = 0;
let activeController = null;
let lastRepairKey = "";
let lastRepairAt = 0;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isNode(value) {
  try {
    return Boolean(typeof Node !== "undefined" && value instanceof Node);
  } catch {
    return Boolean(value && typeof value.nodeType === "number");
  }
}

function isPromiseLike(value) {
  return Boolean(value && (typeof value === "object" || typeof value === "function") && isFn(value.then));
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function perfMs() {
  try {
    return typeof performance !== "undefined" && isFn(performance.now)
      ? performance.now()
      : nowMs();
  } catch {
    return nowMs();
  }
}

function afterPaint(callback) {
  if (!isFn(callback)) return;

  if (!isBrowser()) {
    try { callback(); } catch {}
    return;
  }

  try {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        try { callback(); } catch {}
      });
    });
    return;
  } catch {}

  try {
    window.setTimeout(() => {
      try { callback(); } catch {}
    }, 0);
  } catch {}
}

function microtask(callback) {
  if (!isFn(callback)) return;

  try {
    queueMicrotask(() => {
      try { callback(); } catch {}
    });
    return;
  } catch {}

  try {
    Promise.resolve().then(() => {
      try { callback(); } catch {}
    });
  } catch {}
}

function sanitize(value, depth = 0, seen = new WeakSet()) {
  if (depth > 5) return "[MaxDepth]";

  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    try {
      return redactTokenInText(value);
    } catch {
      return value;
    }
  }

  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "function") return "[Function]";

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redactTokenInText(value.message || ""),
      code: value.code || null,
      status: value.status || value.statusCode || null,
      stack: value.stack ? "[stack]" : null,
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) => sanitize(item, depth + 1, seen));
  }

  if (isObject(value)) {
    try {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    } catch {}

    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 140)) {
      if (/token|authorization|password|secret|credential|jwt|bearer|otp|totp|code/i.test(key)) {
        output[key] = item ? "***" : item;
        continue;
      }

      output[key] = sanitize(item, depth + 1, seen);
    }

    return output;
  }

  return String(value);
}

function emit(AppCore, eventName, payload = {}, options = {}) {
  const name = safeText(eventName);
  if (!name) return false;

  const cleanPayload = sanitize({
    source: SOURCE,
    version: ROUTER_RENDER_VERSION,
    at: new Date().toISOString(),
    ...safeObject(payload),
  });

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFn(AppCore?.events?.emit)) {
      busAvailable = true;
      AppCore.events.emit(name, cleanPayload);
      busEmitted = true;
    }
  } catch {}

  if (options.window === true || (!busAvailable && isBrowser())) {
    try {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: cleanPayload,
        })
      );
      return true;
    } catch {}
  }

  return busEmitted;
}

function warn(AppCore, ...args) {
  const clean = args.map((item) => sanitize(item));

  try {
    AppCore?.utils?.warn?.("[RouterRender]", ...clean);
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.warn("[RouterRender]", ...clean);
    }
  } catch {}
}

function errorLog(AppCore, ...args) {
  const clean = args.map((item) => sanitize(item));

  try {
    AppCore?.utils?.error?.("[RouterRender]", ...clean);
  } catch {}

  try {
    console.error("[RouterRender]", ...clean);
  } catch {}
}

/* =========================================================
   PATH HELPERS
========================================================= */

function canonical(AppCore, path = DEFAULT_ROUTE) {
  try {
    return normalizeCanonicalPath(AppCore, path) || DEFAULT_ROUTE;
  } catch {
    return DEFAULT_ROUTE;
  }
}

function publicPath(AppCore, path = DEFAULT_ROUTE) {
  try {
    return normalizePath(AppCore, path) || DEFAULT_ROUTE;
  } catch {
    return path || DEFAULT_ROUTE;
  }
}

function stripSearchAndHash(path = DEFAULT_ROUTE) {
  return (
    safeText(path, DEFAULT_ROUTE)
      .split("?")[0]
      .split("#")[0] ||
    DEFAULT_ROUTE
  );
}

function suffixOf(path = "") {
  try {
    return getSearchAndHash(path || "") || "";
  } catch {
    const raw = safeText(path, "");
    const queryIndex = raw.indexOf("?");
    const hashIndex = raw.indexOf("#");

    if (queryIndex >= 0) return raw.slice(queryIndex);
    if (hashIndex >= 0) return raw.slice(hashIndex);

    return "";
  }
}

function sameCanonical(AppCore, a = DEFAULT_ROUTE, b = DEFAULT_ROUTE) {
  return stripSearchAndHash(canonical(AppCore, a)) === stripSearchAndHash(canonical(AppCore, b));
}

function isUsernameScoped(path = "") {
  return /^\/@[^/]+(?:\/|$)/i.test(safeText(path, ""));
}

function usernameFrom(AppCore, requestedUsername = null, path = "") {
  return (
    safeText(requestedUsername, "") ||
    extractUsernameFromPath(AppCore, path || "") ||
    getCurrentResolvedUsername(AppCore) ||
    getCurrentUsername(AppCore) ||
    AppCore?.state?.user?.username ||
    AppCore?.state?.user?.slug ||
    null
  );
}

function protectedPublicPath(AppCore) {
  try {
    return getProtectedInitialPublicPath(AppCore) || "";
  } catch {
    return "";
  }
}

function preservePublicContext(AppCore, candidate = DEFAULT_ROUTE) {
  const cleanCandidate = publicPath(AppCore, candidate || DEFAULT_ROUTE);
  const protectedPath = protectedPublicPath(AppCore);

  if (protectedPath && sameCanonical(AppCore, protectedPath, cleanCandidate)) {
    return protectedPath;
  }

  const currentPublic = getCurrentPublicPath(AppCore);

  if (
    currentPublic &&
    cleanCandidate &&
    sameCanonical(AppCore, currentPublic, cleanCandidate)
  ) {
    const currentSuffix = suffixOf(currentPublic);
    const candidateSuffix = suffixOf(cleanCandidate);

    if (currentSuffix && !candidateSuffix) return currentPublic;
    if (isUsernameScoped(currentPublic) && !isUsernameScoped(cleanCandidate)) return currentPublic;
  }

  return cleanCandidate;
}

function resolveRoutePaths({
  AppCore,
  getRoute,
  route = null,
  requestedPath = DEFAULT_ROUTE,
  canonicalPath = DEFAULT_ROUTE,
  publicPath: explicitPublicPath = "",
  requestedUsername = null,
} = {}) {
  const canonicalPathClean = stripSearchAndHash(
    canonical(AppCore, canonicalPath || route?.path || requestedPath || DEFAULT_ROUTE)
  );

  const requestedPublic = publicPath(
    AppCore,
    explicitPublicPath || requestedPath || canonicalPathClean || DEFAULT_ROUTE
  );

  const username = usernameFrom(AppCore, requestedUsername, requestedPublic);

  let builtPublic = "";

  try {
    builtPublic =
      buildPublicPath(
        AppCore,
        getRoute || (() => route),
        `${canonicalPathClean}${suffixOf(requestedPublic)}`,
        {
          username,
          resolvedUsername: username,
          fromPath: requestedPublic,
          publicPath: requestedPublic,
          canonicalPath: canonicalPathClean,
        }
      ) || "";
  } catch {
    builtPublic = "";
  }

  const requestedCompatible =
    requestedPublic &&
    sameCanonical(AppCore, requestedPublic, canonicalPathClean) &&
    (
      isUsernameScoped(requestedPublic) ||
      suffixOf(requestedPublic) ||
      protectedPublicPath(AppCore)
    );

  const finalPublicPath = preservePublicContext(
    AppCore,
    requestedCompatible
      ? requestedPublic
      : builtPublic || requestedPublic || canonicalPathClean || DEFAULT_ROUTE
  );

  return {
    canonicalPath: canonicalPathClean,
    publicPath: finalPublicPath,
    username,
  };
}

/* =========================================================
   DOM HELPERS
========================================================= */

function queryFirst(selectors = []) {
  if (!isBrowser()) return null;

  for (const selector of selectors) {
    try {
      const element = selector.startsWith("#")
        ? document.getElementById(selector.slice(1))
        : document.querySelector(selector);

      if (element) return element;
    } catch {}
  }

  return null;
}

function setDataset(element, key, value) {
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

function setHidden(element, hidden = false) {
  if (!element) return false;

  try {
    element.hidden = Boolean(hidden);
  } catch {}

  try {
    element.setAttribute("aria-hidden", hidden ? "true" : "false");
  } catch {}

  return true;
}

function setBusy(element, busy = false) {
  if (!element) return false;

  try {
    element.setAttribute("aria-busy", busy ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

function empty(element) {
  if (!element) return false;

  try {
    element.replaceChildren();
    return true;
  } catch {}

  try {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }

    return true;
  } catch {
    return false;
  }
}

function el(tagName = "div", {
  className = "",
  text = "",
  attrs = {},
  dataset = {},
} = {}) {
  const node = document.createElement(tagName);

  if (className) node.className = className;
  if (text) node.textContent = text;

  for (const [key, value] of Object.entries(safeObject(attrs))) {
    try {
      if (value === null || value === undefined || value === "") {
        node.removeAttribute(key);
      } else {
        node.setAttribute(key, String(value));
      }
    } catch {}
  }

  for (const [key, value] of Object.entries(safeObject(dataset))) {
    setDataset(node, key, value);
  }

  return node;
}

function append(parent, children = []) {
  if (!parent) return parent;

  for (const child of children) {
    if (!child) continue;

    try {
      parent.appendChild(child);
    } catch {}
  }

  return parent;
}

export function getViewContainer(AppCore) {
  if (!isBrowser()) return null;

  try {
    if (AppCore?.dom?.viewContainer && document.contains(AppCore.dom.viewContainer)) {
      return AppCore.dom.viewContainer;
    }
  } catch {}

  const view =
    queryFirst([
      "#view-container",
      "[data-view-root]",
      "[data-view-container='true']",
      "[data-router-view]",
    ]);

  try {
    if (view && AppCore?.dom) {
      AppCore.dom.viewContainer = view;
    }
  } catch {}

  return view;
}

function domSnapshot(AppCore) {
  if (!isBrowser()) {
    return {
      html: null,
      body: null,
      shell: null,
      main: null,
      appContent: null,
      view: null,
      sidebarMount: null,
      topbarMount: null,
      sidebar: null,
      topbar: null,
      tablehead: null,
      tableheadContainer: null,
      loader: null,
    };
  }

  const view = getViewContainer(AppCore);

  const dom = {
    html: document.documentElement || null,
    body: document.body || null,

    shell:
      AppCore?.dom?.appShell ||
      AppCore?.dom?.shell ||
      queryFirst(["#app-shell", "[data-app-shell='true']", "[data-app-shell]", ".app-shell", ".layout"]),

    main:
      AppCore?.dom?.mainContent ||
      AppCore?.dom?.main ||
      queryFirst(["#main-content", ".main-content", "main[role='main']", "main"]),

    appContent:
      AppCore?.dom?.appContent ||
      queryFirst(["#app-content", "[data-app-content]"]),

    view,

    sidebarMount:
      AppCore?.dom?.sidebarMount ||
      queryFirst(["#sidebar-mount", "[data-sidebar-mount]"]),

    topbarMount:
      AppCore?.dom?.topbarMount ||
      queryFirst(["#topbar-mount", "[data-topbar-mount]"]),

    sidebar:
      AppCore?.dom?.sidebar ||
      queryFirst(["#app-sidebar", "#sidebar", ".sidebar", "[data-sidebar-root]", "[data-sidebar]"]),

    topbar:
      AppCore?.dom?.topbar ||
      queryFirst(["#app-topbar", "#topbar", ".topbar", "[data-topbar-root]", "[data-topbar]"]),

    tablehead:
      AppCore?.dom?.tablehead ||
      queryFirst(["#table-head", ".table-head", "[data-tablehead]"]),

    tableheadContainer:
      AppCore?.dom?.tableheadContainer ||
      queryFirst(["#tablehead-container", "[data-tablehead-container]"]),

    loader:
      AppCore?.dom?.loader ||
      queryFirst(["#app-loader", "[data-app-loader='true']", "[data-app-loader]", ".app-loader"]),
  };

  try {
    if (AppCore?.dom) {
      AppCore.dom.appShell = dom.shell;
      AppCore.dom.shell = dom.shell;
      AppCore.dom.mainContent = dom.main;
      AppCore.dom.main = dom.main;
      AppCore.dom.appContent = dom.appContent;
      AppCore.dom.viewContainer = dom.view;
      AppCore.dom.sidebarMount = dom.sidebarMount;
      AppCore.dom.topbarMount = dom.topbarMount;
      AppCore.dom.sidebar = dom.sidebar;
      AppCore.dom.topbar = dom.topbar;
      AppCore.dom.tablehead = dom.tablehead;
      AppCore.dom.tableheadContainer = dom.tableheadContainer;
      AppCore.dom.loader = dom.loader;
    }
  } catch {}

  return dom;
}

function hideLoader(AppCore, reason = "router-render") {
  const { html, body, loader } = domSnapshot(AppCore);

  try {
    html?.classList?.remove?.("app-loading");
    body?.classList?.remove?.("app-loading", "loading");
  } catch {}

  if (!loader) return false;

  try {
    loader.classList.remove("is-visible", "is-entering", "is-leaving", "app-loader--visible");
    loader.classList.add("is-hidden", "has-hidden");
    loader.setAttribute("aria-hidden", "true");
    loader.setAttribute("aria-busy", "false");
    loader.dataset.loaderVisible = "false";
    loader.dataset.loaderState = "hidden";
    loader.hidden = true;
  } catch {}

  emit(AppCore, "app:loader:hidden", {
    reason,
  });

  return true;
}

/* =========================================================
   SHELL REPAIR
========================================================= */

function shellHiddenForRoute(AppCore, route = null, canonicalPath = DEFAULT_ROUTE) {
  const routePath = stripSearchAndHash(
    canonical(AppCore, canonicalPath || route?.path || DEFAULT_ROUTE)
  );

  if (
    route?.shell === false ||
    route?.hideShell === true ||
    route?.showShell === false ||
    route?.layout === "auth" ||
    route?.layout === "public" ||
    route?.meta?.shell === false ||
    route?.meta?.hideShell === true ||
    route?.meta?.showShell === false ||
    route?.meta?.layout === "auth" ||
    route?.meta?.layout === "public"
  ) {
    return true;
  }

  return AUTH_CANONICAL_PATHS.has(routePath);
}

function patchShellState(AppCore, visible = true) {
  const patch = {
    shellVisible: Boolean(visible),
    chromeVisible: Boolean(visible),
    appShellVisible: true,
    routeShellHidden: !Boolean(visible),
    shellHidden: !Boolean(visible),
    authScreen: !Boolean(visible),
    routeMode: visible ? "app" : "auth",
  };

  try {
    AppCore?.setState?.(patch, {
      source: SOURCE,
      emit: false,
      emitState: false,
      emitDerived: false,
      silent: true,
    });
  } catch {}

  try {
    if (AppCore?.state) Object.assign(AppCore.state, patch);
  } catch {}
}

function emitShellRepair(AppCore, payload = {}) {
  const key = [
    payload.phase || "",
    payload.shellHidden ? "hidden" : "visible",
    payload.canonicalPath || "",
    payload.publicPath || "",
  ].join("|");

  const ts = nowMs();

  if (key === lastRepairKey && ts - lastRepairAt < REPAIR_EVENT_DEDUPE_MS) {
    return false;
  }

  lastRepairKey = key;
  lastRepairAt = ts;

  return emit(AppCore, "router:shell:repair", payload);
}

function repairShell({
  AppCore,
  route = null,
  canonicalPath = DEFAULT_ROUTE,
  publicPath: routePublicPath = DEFAULT_ROUTE,
  phase = "render",
  hideLoading = false,
  emitRepair = true,
} = {}) {
  if (!isBrowser()) {
    return {
      applied: false,
      shellHidden: false,
      reason: "not-browser",
    };
  }

  const finalCanonical = stripSearchAndHash(
    canonical(AppCore, canonicalPath || route?.path || DEFAULT_ROUTE)
  );

  const finalPublic = preservePublicContext(
    AppCore,
    routePublicPath || finalCanonical
  );

  const shellHidden = shellHiddenForRoute(AppCore, route, finalCanonical);

  const {
    html,
    body,
    shell,
    main,
    appContent,
    view,
    sidebarMount,
    topbarMount,
    sidebar,
    topbar,
    tablehead,
    tableheadContainer,
  } = domSnapshot(AppCore);

  if (!html || !body) {
    return {
      applied: false,
      shellHidden,
      reason: "missing-document",
    };
  }

  try {
    html.classList.remove("app-booting", "app-loading");
    body.classList.remove("app-booting", "app-loading", "loading");
    html.classList.add("app-ready");
    body.classList.add("app-ready");

    html.dataset.routeMode = shellHidden ? "auth" : "app";
    body.dataset.routeMode = shellHidden ? "auth" : "app";
    html.dataset.chrome = shellHidden ? "hidden" : "visible";
    body.dataset.chrome = shellHidden ? "hidden" : "visible";
    html.dataset.shell = "visible";
    body.dataset.shell = "visible";
  } catch {}

  if (shellHidden) {
    try {
      body.classList.add("auth-screen", "route-auth", "route-shell-hidden", "route-chrome-hidden");
      body.classList.remove("route-app", "route-shell-visible", "route-chrome-visible", "sidebar-open", "sidebar-collapsed");

      html.classList.add("route-auth", "route-shell-hidden", "route-chrome-hidden");
      html.classList.remove("route-app", "route-shell-visible", "route-chrome-visible");
    } catch {}

    for (const element of [shell, main, appContent, view]) {
      setHidden(element, false);
      setBusy(element, false);
    }

    for (const element of [sidebarMount, topbarMount, sidebar, topbar, tablehead, tableheadContainer]) {
      setHidden(element, true);
      setBusy(element, false);
    }

    setDataset(shell, "shell", "visible");
    setDataset(shell, "chrome", "hidden");
    setDataset(shell, "routeMode", "auth");

    patchShellState(AppCore, false);
  } else {
    try {
      body.classList.remove("auth-screen", "login-no-scroll", "route-auth", "route-shell-hidden", "route-chrome-hidden");
      body.classList.add("route-app", "route-shell-visible", "route-chrome-visible");

      html.classList.remove("route-auth", "route-shell-hidden", "route-chrome-hidden");
      html.classList.add("route-app", "route-shell-visible", "route-chrome-visible");
    } catch {}

    for (const element of [shell, main, appContent, view, sidebarMount, topbarMount, sidebar, topbar]) {
      setHidden(element, false);
      setBusy(element, false);
    }

    const tableheadHasContent = Boolean(tableheadContainer && safeText(tableheadContainer.textContent, ""));
    setHidden(tablehead, !tableheadHasContent);
    setHidden(tableheadContainer, !tableheadHasContent);

    setDataset(shell, "shell", "visible");
    setDataset(shell, "chrome", "visible");
    setDataset(shell, "routeMode", "app");

    patchShellState(AppCore, true);
  }

  if (hideLoading) {
    hideLoader(AppCore, `router:${phase}`);
  }

  const payload = {
    phase,
    shellHidden,
    canonicalPath: finalCanonical,
    publicPath: finalPublic,
    routePath: route?.path || null,
    routeName: route?.name || null,
    viewKey: route?.viewKey || null,
    viewName: route?.viewName || null,
    hasShell: Boolean(shell),
    hasSidebar: Boolean(sidebar || sidebarMount),
    hasTopbar: Boolean(topbar || topbarMount),
  };

  if (emitRepair !== false) {
    emitShellRepair(AppCore, payload);
  }

  return {
    applied: true,
    ...payload,
  };
}

/* =========================================================
   HOST ISOLATION
========================================================= */

function createAbortController() {
  try {
    return typeof AbortController === "function"
      ? new AbortController()
      : null;
  } catch {
    return null;
  }
}

function abortActiveRender(reason = "superseded") {
  try {
    activeController?.abort?.(reason);
  } catch {}

  activeController = null;
}

function beginRender() {
  abortActiveRender("superseded");

  const renderId = ++renderSeq;
  const controller = createAbortController();

  activeController = controller;

  return {
    renderId,
    controller,
    signal: controller?.signal || null,
  };
}

function currentRender(AppCore, renderId, canonicalPath = "") {
  if (renderId !== renderSeq) return false;

  const view = getViewContainer(AppCore);
  if (!view) return false;

  const viewRenderId = safeText(view.dataset?.routerRenderId, "");

  if (viewRenderId && viewRenderId !== String(renderId)) return false;

  const expectedCanonical = stripSearchAndHash(canonicalPath || "");
  const viewCanonical = stripSearchAndHash(view.dataset?.routerCanonicalPath || "");

  return !expectedCanonical || !viewCanonical || expectedCanonical === viewCanonical;
}

function markView({
  AppCore,
  view,
  renderId,
  route = null,
  canonicalPath = DEFAULT_ROUTE,
  publicPath = DEFAULT_ROUTE,
  status = "pending",
} = {}) {
  if (!view) return false;

  setDataset(view, "routerRenderId", renderId);
  setDataset(view, "routerStatus", status);
  setDataset(view, "routerCanonicalPath", canonicalPath);
  setDataset(view, "routerPublicPath", publicPath);
  setDataset(view, "routerRoute", route?.path || canonicalPath);
  setDataset(view, "routerRouteName", route?.name || "");
  setDataset(view, "routerViewKey", route?.viewKey || "");
  setDataset(view, "routerViewName", route?.viewName || "");

  try {
    view.classList.add("router-view-root");
    view.classList.toggle("is-rendering", status === "pending");
    view.classList.toggle("is-ready", status === "ready");
    view.classList.toggle("has-error", status === "error");
  } catch {}

  try {
    if (AppCore?.dom) AppCore.dom.viewContainer = view;
  } catch {}

  return true;
}

function prepareHost({
  AppCore,
  route = null,
  renderId,
  canonicalPath = DEFAULT_ROUTE,
  publicPath = DEFAULT_ROUTE,
  mode = "success",
} = {}) {
  const view = getViewContainer(AppCore);

  if (!view) {
    return {
      view: null,
      host: null,
    };
  }

  markView({
    AppCore,
    view,
    renderId,
    route,
    canonicalPath,
    publicPath,
    status: "pending",
  });

  const host = el("div", {
    className: RENDER_HOST_CLASS,
    attrs: {
      [RENDER_HOST_ATTR]: "true",
      "data-router-render-id": renderId,
      "data-router-mode": mode,
      "data-router-route": route?.path || canonicalPath,
      "data-router-route-name": route?.name || "",
      "data-router-view-key": route?.viewKey || "",
      "data-router-view-name": route?.viewName || "",
      "data-router-canonical-path": canonicalPath,
      "data-router-public-path": publicPath,
    },
  });

  try {
    view.replaceChildren(host);
  } catch {
    empty(view);
    try { view.appendChild(host); } catch {}
  }

  try {
    if (AppCore?.dom) {
      AppCore.dom.routerViewHost = host;
      AppCore.dom.viewHost = host;
    }
  } catch {}

  return {
    view,
    host,
  };
}

function currentHost(AppCore) {
  const view = getViewContainer(AppCore);
  if (!view) return null;

  try {
    return view.querySelector(`[${RENDER_HOST_ATTR}="true"]`);
  } catch {
    return null;
  }
}

function markReady(AppCore, renderId, canonicalPath = DEFAULT_ROUTE) {
  if (renderId && !currentRender(AppCore, renderId, canonicalPath)) return false;

  const view = getViewContainer(AppCore);
  if (!view) return false;

  markView({
    AppCore,
    view,
    renderId,
    canonicalPath,
    publicPath: view.dataset?.routerPublicPath || canonicalPath,
    status: "ready",
  });

  return true;
}

function markError(AppCore, renderId, canonicalPath = DEFAULT_ROUTE) {
  if (renderId && !currentRender(AppCore, renderId, canonicalPath)) return false;

  const view = getViewContainer(AppCore);
  if (!view) return false;

  markView({
    AppCore,
    view,
    renderId,
    canonicalPath,
    publicPath: view.dataset?.routerPublicPath || canonicalPath,
    status: "error",
  });

  return true;
}

function adoptResult(target, result) {
  if (!target || result === null || result === undefined) return result || null;

  if (typeof result === "string") {
    const wrapper = el("div", {
      className: "router-rendered-text",
      text: result,
    });

    try {
      target.replaceChildren(wrapper);
    } catch {
      empty(target);
      try { target.appendChild(wrapper); } catch {}
    }

    return wrapper;
  }

  if (!isNode(result)) return result;
  if (result === target) return result;

  try {
    if (target.contains(result)) return result;
  } catch {}

  try {
    target.replaceChildren(result);
  } catch {
    empty(target);
    try { target.appendChild(result); } catch {}
  }

  return result;
}

/* =========================================================
   PAYLOADS / STATE
========================================================= */

export function buildRenderPayload({
  AppCore = null,
  path = "",
  requestedPath = "",
  canonicalPath = "",
  publicPath: routePublicPath = "",
  username = null,
  route = null,
  found = false,
  forbidden = false,
  redirectedFrom = null,
  options = null,
  renderId = null,
  flow = "",
  status = "",
} = {}) {
  const resolved = resolveRoutePaths({
    AppCore,
    route,
    requestedPath: requestedPath || path || routePublicPath || canonicalPath || route?.path || DEFAULT_ROUTE,
    canonicalPath: canonicalPath || route?.path || requestedPath || path || DEFAULT_ROUTE,
    publicPath: routePublicPath || path || requestedPath || "",
    requestedUsername: username,
  });

  return {
    path: resolved.publicPath,
    requestedPath: requestedPath || path || resolved.publicPath,
    canonicalPath: resolved.canonicalPath,
    publicPath: resolved.publicPath,
    username: resolved.username || username || null,

    route: route || null,
    routePath: route?.path || resolved.canonicalPath,
    routeName: route?.name || null,
    viewKey: route?.viewKey || null,
    viewName: route?.viewName || null,

    found: Boolean(found),
    forbidden: Boolean(forbidden),
    redirectedFrom: redirectedFrom || null,

    options: options || null,
    renderId: renderId || null,
    flow: flow || null,
    status: status || null,

    ts: nowMs(),
  };
}

export function emitBeforeRender(AppCore, payload = {}) {
  const finalPayload = buildRenderPayload({
    AppCore,
    ...safeObject(payload),
    flow: payload?.flow || "before-render",
  });

  emit(AppCore, "router:before-render", finalPayload);

  return finalPayload;
}

export function emitRendered(AppCore, payload = {}) {
  const finalPayload = buildRenderPayload({
    AppCore,
    ...safeObject(payload),
    flow: payload?.flow || "rendered",
  });

  emit(AppCore, "router:rendered", finalPayload);

  return finalPayload;
}

export function syncRouteState(AppCore, canonicalPath = DEFAULT_ROUTE, routePublicPath = null) {
  const finalCanonical = stripSearchAndHash(canonical(AppCore, canonicalPath || DEFAULT_ROUTE));
  const finalPublic = preservePublicContext(AppCore, routePublicPath || finalCanonical);
  const username = usernameFrom(AppCore, null, finalPublic);

  try { AppCore?.setRoute?.(finalCanonical); } catch {}
  try { AppCore?.setPublicPath?.(finalPublic); } catch {}

  const patch = {
    route: finalCanonical,
    canonicalPath: finalCanonical,
    publicPath: finalPublic,
    currentResolvedUsername: username,
  };

  try {
    AppCore?.setState?.(patch, {
      source: SOURCE,
      emit: false,
      emitState: false,
      emitDerived: false,
      silent: true,
    });
  } catch {}

  try {
    if (AppCore?.state) Object.assign(AppCore.state, patch);
  } catch {}

  return {
    canonicalPath: finalCanonical,
    publicPath: finalPublic,
    username,
  };
}

function commitState(AppCore, payload = {}) {
  const built = buildRenderPayload({
    AppCore,
    ...safeObject(payload),
  });

  const synced = syncRouteState(AppCore, built.canonicalPath, built.publicPath);

  return buildRenderPayload({
    AppCore,
    ...built,
    canonicalPath: synced.canonicalPath,
    publicPath: synced.publicPath,
    username: synced.username || built.username,
  });
}

export function applyResolvedRouteState(AppCore, canonicalPath, fallbackPublicPath) {
  return syncRouteState(
    AppCore,
    canonicalPath,
    protectedPublicPath(AppCore) || fallbackPublicPath || canonicalPath || DEFAULT_ROUTE
  );
}

/* =========================================================
   CONTEXT / RENDERER
========================================================= */

export function buildRouteRenderContext({
  AppCore,
  route = null,
  requestedPath = DEFAULT_ROUTE,
  canonicalPath = DEFAULT_ROUTE,
  requestedUsername = null,
  publicPath: routePublicPath = null,
  redirectedFrom = null,
  found = true,
  forbidden = false,
  renderId = null,
  signal = null,
  renderRoot = null,
  viewContainer = null,
} = {}) {
  const resolved = resolveRoutePaths({
    AppCore,
    route,
    requestedPath: routePublicPath || requestedPath,
    canonicalPath,
    publicPath: routePublicPath || requestedPath,
    requestedUsername,
  });

  const rootView = viewContainer || getViewContainer(AppCore);
  const host = renderRoot || currentHost(AppCore) || rootView;

  return Object.freeze({
    AppCore,
    route,

    path: resolved.publicPath,
    requestedPath: resolved.publicPath,
    canonicalPath: resolved.canonicalPath,
    publicPath: resolved.publicPath,

    username: resolved.username,
    requestedUsername: resolved.username,

    redirectedFrom,

    found: Boolean(found),
    forbidden: Boolean(forbidden),

    renderId,
    signal,

    viewContainer: rootView,
    renderRoot: host,
    renderHost: host,

    routePath: route?.path || resolved.canonicalPath,
    routeName: route?.name || null,
    viewKey: route?.viewKey || null,
    viewName: route?.viewName || null,

    isCurrent: () =>
      renderId
        ? currentRender(AppCore, renderId, resolved.canonicalPath)
        : true,

    isStale: () =>
      renderId
        ? !currentRender(AppCore, renderId, resolved.canonicalPath)
        : false,
  });
}

function routeRenderer(route = null) {
  if (isFn(route?.render)) return { render: route.render, thisArg: route, source: "route.render" };
  if (isFn(route?.view)) return { render: route.view, thisArg: route, source: "route.view" };
  if (isFn(route?.component)) return { render: route.component, thisArg: route, source: "route.component" };
  if (isFn(route?.handler)) return { render: route.handler, thisArg: route, source: "route.handler" };
  if (isFn(route?.component?.render)) return { render: route.component.render, thisArg: route.component, source: "route.component.render" };
  if (isFn(route?.view?.render)) return { render: route.view.render, thisArg: route.view, source: "route.view.render" };
  if (isFn(route?.adapter?.render)) return { render: route.adapter.render, thisArg: route.adapter, source: "route.adapter.render" };

  return {
    render: null,
    thisArg: null,
    source: "",
  };
}

function runRenderer(AppCore, route, target, context) {
  const renderer = routeRenderer(route);

  if (!target || !isFn(renderer.render)) return null;

  const ctx = {
    ...context,
    rendererSource: renderer.source,
  };

  try {
    if (renderer.render.length >= 2) {
      return renderer.render.call(renderer.thisArg || route, target, ctx);
    }

    if (renderer.render.length === 1) {
      return renderer.render.call(renderer.thisArg || route, ctx);
    }

    return renderer.render.call(renderer.thisArg || route, target, ctx);
  } catch (error) {
    return Promise.reject(error);
  }
}

function shouldAwaitRouteRender(AppCore, route = null) {
  if (route?.awaitRender === true || route?.renderMode === "blocking" || route?.blockingRender === true) {
    return true;
  }

  if (route?.awaitRender === false || route?.renderMode === "non-blocking" || route?.nonBlockingRender === true) {
    return false;
  }

  return Boolean(
    AppCore?.config?.routerAwaitRouteRender === true ||
      AppCore?.config?.awaitRouteRender === true
  );
}

function deferredView({
  AppCore,
  renderId,
  canonicalPath,
} = {}) {
  let current = null;
  let destroyed = false;

  return {
    set(value) {
      current = value || null;

      if (destroyed && current && isFn(current.destroy)) {
        try { current.destroy(); } catch {}
      }
    },

    destroy() {
      destroyed = true;

      if (current && isFn(current.destroy)) {
        try { current.destroy(); } catch {}
      }

      current = null;

      if (renderId && currentRender(AppCore, renderId, canonicalPath)) {
        abortActiveRender("view-destroyed");
      }
    },

    get current() {
      return current;
    },
  };
}

/* =========================================================
   FALLBACK VIEWS
========================================================= */

function panelFallback({
  kind = "generic",
  eyebrow = "",
  title = "",
  message = "",
  meta = [],
  action = null,
} = {}) {
  const section = el("section", {
    className: `content-wrapper router-fallback-view router-fallback-view--${kind}`,
    dataset: {
      routerFallback: kind,
    },
  });

  const card = el("div", {
    className: "panel-block router-fallback-card",
  });

  const inner = el("div", {
    className: "router-fallback-card__inner",
  });

  const header = el("div", {
    className: "router-fallback-card__header",
  });

  if (eyebrow) {
    header.appendChild(
      el("p", {
        className: "router-fallback-card__eyebrow",
        text: eyebrow,
      })
    );
  }

  header.appendChild(
    el("h2", {
      className: "router-fallback-card__title",
      text: title || "Vista",
    })
  );

  if (message) {
    header.appendChild(
      el("p", {
        className: "router-fallback-card__message",
        text: message,
      })
    );
  }

  inner.appendChild(header);

  if (meta.length) {
    const metaBox = el("div", {
      className: "router-fallback-card__meta",
    });

    for (const item of meta) {
      const row = el("div", {
        className: "router-fallback-card__meta-row",
      });

      append(row, [
        el("strong", { text: item?.label || "" }),
        el("span", { text: item?.value || "—" }),
      ]);

      metaBox.appendChild(row);
    }

    inner.appendChild(metaBox);
  }

  if (action?.href && action?.text) {
    const actions = el("div", {
      className: "router-fallback-card__actions",
    });

    actions.appendChild(
      el("a", {
        className: "ui-btn ui-btn-primary router-fallback-card__action",
        text: action.text,
        attrs: {
          href: action.href,
          "data-spa": "",
        },
      })
    );

    inner.appendChild(actions);
  }

  card.appendChild(inner);
  section.appendChild(card);

  return section;
}

function paint(target, node) {
  if (!target || !node) return null;

  try {
    target.replaceChildren(node);
  } catch {
    empty(target);
    try { target.appendChild(node); } catch {}
  }

  return node;
}

export function renderGenericView(AppCore, route, target = null) {
  const root = target || currentHost(AppCore) || getViewContainer(AppCore);
  if (!root) return null;

  return paint(
    root,
    panelFallback({
      kind: "generic",
      eyebrow: "Router",
      title: route?.title || route?.name || "Vista",
      message: "Vista conectada al router.",
      meta: [
        {
          label: "Ruta:",
          value: route?.path || AppCore?.state?.route || DEFAULT_ROUTE,
        },
      ],
    })
  );
}

export function renderForbiddenView(AppCore, getRoute) {
  const root = getViewContainer(AppCore);
  if (!root) return null;

  return paint(
    root,
    panelFallback({
      kind: "forbidden",
      eyebrow: "403",
      title: "Acceso denegado",
      message: "No tienes permisos para acceder.",
      action: {
        href: getDefaultHomeTarget(AppCore, getRoute),
        text: "Volver",
      },
    })
  );
}

export function renderNotFoundView(AppCore, requestedPath, getRoute) {
  const root = getViewContainer(AppCore);
  if (!root) return null;

  return paint(
    root,
    panelFallback({
      kind: "not-found",
      eyebrow: "404",
      title: "Ruta no encontrada",
      message: "No se ha podido resolver la ruta solicitada.",
      meta: [
        {
          label: "Ruta:",
          value: redactTokenInText(requestedPath || "—"),
        },
      ],
      action: {
        href: getDefaultHomeTarget(AppCore, getRoute),
        text: "Inicio",
      },
    })
  );
}

export function renderRuntimeErrorView(AppCore, error, getRoute) {
  const root = getViewContainer(AppCore);
  if (!root) return null;

  return paint(
    root,
    panelFallback({
      kind: "runtime-error",
      eyebrow: "Router error",
      title: "Error de navegación",
      message: redactTokenInText(error?.message || "Error inesperado."),
      action: {
        href: getDefaultHomeTarget(AppCore, getRoute),
        text: "Recuperar",
      },
    })
  );
}

function transitionView(AppCore, route = null, target = null) {
  const root = target || currentHost(AppCore) || getViewContainer(AppCore);
  if (!root) return null;

  if (route?.transitionView === false || route?.skipTransitionView === true) {
    return root;
  }

  return paint(
    root,
    panelFallback({
      kind: "transition",
      eyebrow: "Onion",
      title: route?.title || route?.label || "Cargando vista",
      message: "Preparando contenido...",
    })
  );
}

/* =========================================================
   FLOW HELPERS
========================================================= */

function setDocumentTitle(fn, title) {
  try {
    if (isFn(fn)) fn(title);
  } catch {}
}

function setShellMode(fn, route) {
  try {
    if (isFn(fn)) fn(route);
  } catch {}
}

function clearDynamic(fn) {
  try {
    if (isFn(fn)) fn();
  } catch {}
}

function setActiveMenu(fn, path) {
  try {
    if (isFn(fn)) fn(path);
  } catch {}
}

function updateHistory(fn, payload = {}) {
  try {
    if (isFn(fn)) return fn(payload);
  } catch {}

  return false;
}

function flowMetric(AppCore, flow, payload = {}) {
  emit(AppCore, "router:render:flow", {
    flow,
    ...payload,
  });
}

function asyncRenderError({
  AppCore,
  error,
  route,
  requestedPath,
  canonicalPath,
  publicPath,
  username,
  getRoute,
  renderId,
} = {}) {
  if (renderId && !currentRender(AppCore, renderId, canonicalPath)) return;

  errorLog(AppCore, "async route render error", error);

  markError(AppCore, renderId, canonicalPath);

  renderRuntimeErrorView(AppCore, error, getRoute);

  repairShell({
    AppCore,
    route,
    canonicalPath,
    publicPath,
    phase: "async-error",
    hideLoading: true,
  });

  emit(AppCore, "router:render:error", {
    error,
    message: error?.message || "Error de navegación",
    routePath: route?.path || null,
    routeName: route?.name || null,
    viewKey: route?.viewKey || null,
    viewName: route?.viewName || null,
    requestedPath,
    canonicalPath,
    publicPath,
    username,
    renderId,
  });
}

/* =========================================================
   MAIN FLOWS
========================================================= */

export async function renderRouteSuccess({
  AppCore,
  route,
  requestedPath,
  canonicalPath,
  requestedUsername,
  setShellMode: setShellModeFn,
  setDocumentTitle: setDocumentTitleFn,
  getRoute,
} = {}) {
  const startedAt = perfMs();
  const { renderId, signal } = beginRender();

  const resolved = resolveRoutePaths({
    AppCore,
    getRoute,
    route,
    requestedPath,
    canonicalPath,
    requestedUsername,
  });

  const committed = commitState(AppCore, {
    requestedPath: requestedPath || resolved.publicPath,
    canonicalPath: resolved.canonicalPath,
    publicPath: resolved.publicPath,
    username: resolved.username,
    route,
    found: true,
    forbidden: false,
    renderId,
    flow: "success",
    status: "state-committed",
  });

  emit(AppCore, "router:render:state-committed", committed);

  repairShell({
    AppCore,
    route,
    canonicalPath: committed.canonicalPath,
    publicPath: committed.publicPath,
    phase: "before-success-render",
    hideLoading: false,
  });

  setShellMode(setShellModeFn, route);
  setDocumentTitle(setDocumentTitleFn, route?.title || AppCore?.config?.appName || "Onion");

  const { view, host } = prepareHost({
    AppCore,
    route,
    renderId,
    canonicalPath: committed.canonicalPath,
    publicPath: committed.publicPath,
    mode: "success",
  });

  const ctx = buildRouteRenderContext({
    AppCore,
    route,
    requestedPath: committed.publicPath,
    canonicalPath: committed.canonicalPath,
    requestedUsername: committed.username,
    publicPath: committed.publicPath,
    renderId,
    signal,
    viewContainer: view,
    renderRoot: host,
  });

  const renderer = routeRenderer(route);
  const awaitRender = shouldAwaitRouteRender(AppCore, route);

  let viewInstance = null;
  let asyncDispatched = false;

  if (isFn(renderer.render)) {
    if (!awaitRender) {
      transitionView(AppCore, route, host);
    }

    const result = runRenderer(AppCore, route, host || view, ctx);

    if (awaitRender) {
      viewInstance = await Promise.resolve(result);

      if (!currentRender(AppCore, renderId, committed.canonicalPath)) {
        try { viewInstance?.destroy?.(); } catch {}
        return null;
      }

      adoptResult(host || view, viewInstance);
      markReady(AppCore, renderId, committed.canonicalPath);

      repairShell({
        AppCore,
        route,
        canonicalPath: committed.canonicalPath,
        publicPath: committed.publicPath,
        phase: "after-blocking-render",
        hideLoading: true,
      });
    } else if (isPromiseLike(result)) {
      asyncDispatched = true;

      const deferred = deferredView({
        AppCore,
        renderId,
        canonicalPath: committed.canonicalPath,
      });

      result
        .then((asyncView) => {
          if (!currentRender(AppCore, renderId, committed.canonicalPath)) {
            try { asyncView?.destroy?.(); } catch {}
            return;
          }

          deferred.set(asyncView);
          adoptResult(host || view, asyncView);
          markReady(AppCore, renderId, committed.canonicalPath);

          repairShell({
            AppCore,
            route,
            canonicalPath: committed.canonicalPath,
            publicPath: committed.publicPath,
            phase: "async-complete",
            hideLoading: true,
          });

          afterPaint(() => {
            if (!currentRender(AppCore, renderId, committed.canonicalPath)) return;

            repairShell({
              AppCore,
              route,
              canonicalPath: committed.canonicalPath,
              publicPath: committed.publicPath,
              phase: "async-complete-after-paint",
              hideLoading: true,
            });
          });

          emit(AppCore, "router:render:async-complete", {
            ...committed,
            hasView: Boolean(asyncView),
            durationMs: Math.round(perfMs() - startedAt),
          });
        })
        .catch((error) => {
          asyncRenderError({
            AppCore,
            error,
            route,
            requestedPath: requestedPath || committed.publicPath,
            canonicalPath: committed.canonicalPath,
            publicPath: committed.publicPath,
            username: committed.username,
            getRoute,
            renderId,
          });
        });

      viewInstance = deferred;

      microtask(() => {
        if (!currentRender(AppCore, renderId, committed.canonicalPath)) return;

        repairShell({
          AppCore,
          route,
          canonicalPath: committed.canonicalPath,
          publicPath: committed.publicPath,
          phase: "after-non-blocking-dispatch",
          hideLoading: true,
        });
      });
    } else {
      viewInstance = result || host || view || null;

      if (!currentRender(AppCore, renderId, committed.canonicalPath)) {
        try { viewInstance?.destroy?.(); } catch {}
        return null;
      }

      adoptResult(host || view, viewInstance);
      markReady(AppCore, renderId, committed.canonicalPath);

      repairShell({
        AppCore,
        route,
        canonicalPath: committed.canonicalPath,
        publicPath: committed.publicPath,
        phase: "after-sync-render",
        hideLoading: true,
      });
    }
  } else {
    viewInstance = renderGenericView(AppCore, route, host || view);

    markReady(AppCore, renderId, committed.canonicalPath);

    repairShell({
      AppCore,
      route,
      canonicalPath: committed.canonicalPath,
      publicPath: committed.publicPath,
      phase: "after-generic-render",
      hideLoading: true,
    });
  }

  afterPaint(() => {
    if (!currentRender(AppCore, renderId, committed.canonicalPath)) return;

    repairShell({
      AppCore,
      route,
      canonicalPath: committed.canonicalPath,
      publicPath: committed.publicPath,
      phase: "success-after-paint",
      hideLoading: true,
    });
  });

  flowMetric(AppCore, "success", {
    ...committed,
    renderMode: awaitRender ? "blocking" : "non-blocking",
    rendererSource: renderer.source || null,
    asyncDispatched,
    durationMs: Math.round(perfMs() - startedAt),
  });

  return viewInstance || null;
}

export function renderRouteForbidden(args = {}) {
  const startedAt = perfMs();

  abortActiveRender("forbidden");

  setShellMode(args.setShellMode, args.route || null);
  setDocumentTitle(args.setDocumentTitle, "Acceso denegado");

  renderForbiddenView(args.AppCore, args.getRoute);

  repairShell({
    AppCore: args.AppCore,
    route: args.route || null,
    canonicalPath: args.canonicalPath || args.requestedPath || DEFAULT_ROUTE,
    publicPath: args.requestedPath || args.canonicalPath || DEFAULT_ROUTE,
    phase: "forbidden",
    hideLoading: true,
  });

  flowMetric(args.AppCore, "forbidden", {
    canonicalPath: args.canonicalPath || args.requestedPath || DEFAULT_ROUTE,
    publicPath: args.requestedPath || args.canonicalPath || DEFAULT_ROUTE,
    durationMs: Math.round(perfMs() - startedAt),
  });

  return null;
}

export function renderRouteNotFound(args = {}) {
  const startedAt = perfMs();

  abortActiveRender("not-found");

  setShellMode(args.setShellMode, args.route || null);
  setDocumentTitle(args.setDocumentTitle, "404");

  renderNotFoundView(args.AppCore, args.requestedPath, args.getRoute);

  repairShell({
    AppCore: args.AppCore,
    route: args.route || null,
    canonicalPath: args.canonicalPath || args.requestedPath || DEFAULT_ROUTE,
    publicPath: args.requestedPath || args.canonicalPath || DEFAULT_ROUTE,
    phase: "not-found",
    hideLoading: true,
  });

  flowMetric(args.AppCore, "not-found", {
    canonicalPath: args.canonicalPath || args.requestedPath || DEFAULT_ROUTE,
    publicPath: args.requestedPath || args.canonicalPath || DEFAULT_ROUTE,
    durationMs: Math.round(perfMs() - startedAt),
  });

  return null;
}

export async function renderLoginRedirect(args = {}) {
  const startedAt = perfMs();

  abortActiveRender("login-redirect");

  const names = getRouteNames(args.AppCore);
  const loginPath = names.LOGIN || "/login";

  const loginUrl =
    safeText(args.redirectTo, "") ||
    buildLoginUrl(
      args.AppCore,
      args.publicPath || args.requestedPath || args.canonicalPath || DEFAULT_ROUTE
    );

  const route = args.getRoute?.(loginPath) || null;
  const finalPublic = publicPath(args.AppCore, loginUrl || loginPath);

  clearDynamic(args.clearDynamicContainers);
  setActiveMenu(args.setActiveMenu, loginPath);
  setShellMode(args.setShellMode, route);
  setDocumentTitle(args.setDocumentTitle, route?.title || "Login");

  updateHistory(args.updateHistory, {
    AppCore: args.AppCore,
    getRoute: args.getRoute,
    pathname: finalPublic,
    options: {
      replaceState: true,
      redirectedFrom: args.publicPath || args.requestedPath || args.canonicalPath || null,
      source: "guard:not-authenticated",
    },
  });

  syncRouteState(args.AppCore, loginPath, finalPublic);

  repairShell({
    AppCore: args.AppCore,
    route,
    canonicalPath: loginPath,
    publicPath: finalPublic,
    phase: "login-redirect-before-render",
    hideLoading: false,
  });

  const { renderId, signal } = beginRender();

  const { view, host } = prepareHost({
    AppCore: args.AppCore,
    route,
    renderId,
    canonicalPath: loginPath,
    publicPath: finalPublic,
    mode: "login",
  });

  const ctx = buildRouteRenderContext({
    AppCore: args.AppCore,
    route,
    requestedPath: finalPublic,
    canonicalPath: loginPath,
    publicPath: finalPublic,
    redirectedFrom: args.publicPath || args.requestedPath || args.canonicalPath || null,
    renderId,
    signal,
    viewContainer: view,
    renderRoot: host,
  });

  const renderer = routeRenderer(route);

  if (isFn(renderer.render)) {
    const result = await Promise.resolve(
      runRenderer(args.AppCore, route, host || view, ctx)
    );

    if (currentRender(args.AppCore, renderId, loginPath)) {
      adoptResult(host || view, result);
    }
  } else {
    renderGenericView(args.AppCore, route, host || view);
  }

  markReady(args.AppCore, renderId, loginPath);

  repairShell({
    AppCore: args.AppCore,
    route,
    canonicalPath: loginPath,
    publicPath: finalPublic,
    phase: "login-redirect-after-render",
    hideLoading: true,
  });

  flowMetric(args.AppCore, "login-redirect", {
    renderId,
    durationMs: Math.round(perfMs() - startedAt),
  });

  return null;
}

export function renderRouteRuntimeError(args = {}) {
  const startedAt = perfMs();

  abortActiveRender("runtime-error");

  setShellMode(args.setShellMode, args.route || null);
  setDocumentTitle(args.setDocumentTitle, "Error de navegación");

  renderRuntimeErrorView(args.AppCore, args.error, args.getRoute);

  repairShell({
    AppCore: args.AppCore,
    route: args.route || null,
    canonicalPath: args.canonicalPath || args.requestedPath || DEFAULT_ROUTE,
    publicPath: args.requestedPath || args.canonicalPath || DEFAULT_ROUTE,
    phase: "runtime-error",
    hideLoading: true,
  });

  flowMetric(args.AppCore, "runtime-error", {
    error: args.error?.message || "Error",
    durationMs: Math.round(perfMs() - startedAt),
  });

  errorLog(args.AppCore, "runtime-error", args.error);

  return null;
}

/* =========================================================
   DEBUG
========================================================= */

export function getRenderSnapshot(AppCore) {
  const dom = domSnapshot(AppCore);
  const host = currentHost(AppCore);
  const currentPublic = getCurrentPublicPath(AppCore);

  return sanitize({
    version: ROUTER_RENDER_VERSION,

    currentPublicPath: currentPublic,
    currentCanonicalPath: canonical(AppCore, AppCore?.state?.route || currentPublic || DEFAULT_ROUTE),
    protectedPublicPath: protectedPublicPath(AppCore),

    renderSeq,
    activeRenderAborted: Boolean(activeController?.signal?.aborted),

    lastRepairKey,
    lastRepairAt,

    dom: {
      bodyClasses: dom.body?.className || "",
      htmlClasses: dom.html?.className || "",

      bodyShell: dom.body?.dataset?.shell || null,
      htmlShell: dom.html?.dataset?.shell || null,

      bodyChrome: dom.body?.dataset?.chrome || null,
      htmlChrome: dom.html?.dataset?.chrome || null,

      bodyRouteMode: dom.body?.dataset?.routeMode || null,
      htmlRouteMode: dom.html?.dataset?.routeMode || null,

      hasShell: Boolean(dom.shell),
      hasMain: Boolean(dom.main),
      hasAppContent: Boolean(dom.appContent),
      hasView: Boolean(dom.view),
      hasRenderHost: Boolean(host),
      hasSidebar: Boolean(dom.sidebar || dom.sidebarMount),
      hasTopbar: Boolean(dom.topbar || dom.topbarMount),
      hasTablehead: Boolean(dom.tablehead),
      hasLoader: Boolean(dom.loader),

      viewRenderId: dom.view?.dataset?.routerRenderId || null,
      viewStatus: dom.view?.dataset?.routerStatus || null,
      viewCanonicalPath: dom.view?.dataset?.routerCanonicalPath || null,
      viewPublicPath: dom.view?.dataset?.routerPublicPath || null,
      viewRoute: dom.view?.dataset?.routerRoute || null,
      viewRouteName: dom.view?.dataset?.routerRouteName || null,
      viewKey: dom.view?.dataset?.routerViewKey || null,
      viewName: dom.view?.dataset?.routerViewName || null,

      hostRenderId: host?.getAttribute?.("data-router-render-id") || null,
      hostCanonicalPath: host?.getAttribute?.("data-router-canonical-path") || null,
      hostPublicPath: host?.getAttribute?.("data-router-public-path") || null,
      hostRoute: host?.getAttribute?.("data-router-route") || null,
      hostRouteName: host?.getAttribute?.("data-router-route-name") || null,
      hostViewKey: host?.getAttribute?.("data-router-view-key") || null,
      hostViewName: host?.getAttribute?.("data-router-view-name") || null,
    },
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  ROUTER_RENDER_VERSION,

  getViewContainer,

  buildRenderPayload,
  emitBeforeRender,
  emitRendered,

  syncRouteState,
  applyResolvedRouteState,
  buildRouteRenderContext,

  renderGenericView,
  renderForbiddenView,
  renderNotFoundView,
  renderRuntimeErrorView,

  renderRouteSuccess,
  renderRouteForbidden,
  renderRouteNotFound,
  renderLoginRedirect,
  renderRouteRuntimeError,

  getRenderSnapshot,
};
