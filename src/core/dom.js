/* =========================================================
   Onion Support - Core DOM
   Archivo: /src/core/dom.js

   Responsabilidad:
   - Cache DOM mínimo.
   - Sólo nodos reales del index.html.
   - Sin imports.
   - Sin selectors legacy masivos.
   - Sin montaje UI.
   - Sin Auth.
   - Sin Router.
   - Sin Store.
   - Sin fetch.
========================================================= */

export const DOM_VERSION = "simple";

export const REQUIRED_KEYS = Object.freeze([
  "body",
  "mainContent",
  "viewContainer",
]);

export const RECOMMENDED_KEYS = Object.freeze([
  "html",
  "appShell",
  "appContent",
  "loader",
  "sidebarMount",
  "topbarMount",
  "tablehead",
  "tableheadContainer",
]);

export const DEFERRED_UI_KEYS = Object.freeze([]);

export const OPTIONAL_KEYS = Object.freeze([
  "themeColorMeta",
  "tileColorMeta",
]);

export const DOM_EVENTS = Object.freeze({
  cached: "app:core:dom:cached",
  valid: "app:core:dom:valid",
  invalid: "app:core:dom:invalid",
  refreshedStale: "app:core:dom:refreshed-stale",
  cleared: "app:core:dom:cleared",
});

export const DOM_SELECTORS = Object.freeze({
  loader: "#app-loader",
  appLoader: "#app-loader",

  appShell: "#app-shell",
  shell: "#app-shell",

  sidebarMount: "#sidebar-mount",
  topbarMount: "#topbar-mount",

  mainContent: "#main-content",
  main: "#main-content",
  appMain: "#main-content",

  appContent: "#app-content",

  viewContainer: "#view-container",
  viewRoot: "#view-container",
  routerView: "#view-container",

  tablehead: "#table-head",
  tableHead: "#table-head",

  tableheadContainer: "#tablehead-container",
  tableHeadContainer: "#tablehead-container",

  themeColorMeta: 'meta[name="theme-color"]:not([media])',
  metaThemeColor: 'meta[name="theme-color"]:not([media])',
  tileColorMeta: 'meta[name="msapplication-TileColor"]',
});

const DOM_KEYS = Object.freeze([
  "html",
  "body",
  ...Object.keys(DOM_SELECTORS),
]);

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function emit(events, name, payload = {}) {
  try {
    if (isFunction(events?.emit)) {
      events.emit(name, payload);
      return true;
    }

    if (isFunction(events?.dispatch)) {
      events.dispatch(name, payload);
      return true;
    }

    if (isFunction(events?.trigger)) {
      events.trigger(name, payload);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function query(selector = "", root = null) {
  if (!isBrowser() || !selector) return null;

  try {
    return (root || document).querySelector(selector);
  } catch {
    return null;
  }
}

function queryAll(selector = "", root = null) {
  if (!isBrowser() || !selector) return [];

  try {
    return [...((root || document).querySelectorAll(selector) || [])];
  } catch {
    return [];
  }
}

function bySelector(selector = "", root = null) {
  if (!selector) return null;

  if (selector.startsWith("#") && !selector.includes(" ")) {
    try {
      return document.getElementById(selector.slice(1));
    } catch {
      return null;
    }
  }

  return query(selector, root);
}

export function isNodeConnected(node) {
  if (!node || !isBrowser()) return false;

  if (
    node === window ||
    node === document ||
    node === document.documentElement ||
    node === document.body
  ) {
    return true;
  }

  try {
    return Boolean(node.isConnected);
  } catch {
    return false;
  }
}

function emptyValidation() {
  return {
    ok: false,
    missing: [],
    recommendedMissing: [],
    deferredMissing: [],
    optionalMissing: [],
    warnings: [],
  };
}

function applyAliases(dom) {
  if (!dom) return false;

  dom.shell = dom.appShell;
  dom.appLoader = dom.loader;

  dom.main = dom.mainContent;
  dom.appMain = dom.mainContent;

  dom.viewRoot = dom.viewContainer;
  dom.routerView = dom.viewContainer;

  dom.tableHead = dom.tablehead;
  dom.tableHeadContainer = dom.tableheadContainer;

  dom.metaThemeColor = dom.themeColorMeta;

  return true;
}

function setNode(dom, key, node) {
  if (!dom || !key) return false;

  dom[key] = node || null;
  return true;
}

function resolveNode(key = "", root = null) {
  if (!isBrowser()) return null;

  if (key === "html") return document.documentElement || null;
  if (key === "body") return document.body || null;

  const selector = DOM_SELECTORS[key];

  if (!selector) return null;

  return bySelector(selector, root);
}

/* =========================================================
   CACHE
========================================================= */

export function createDomCache() {
  const dom = {
    version: DOM_VERSION,
    cachedAt: "",
    cachedAtMs: 0,
    cacheCount: 0,
    validation: emptyValidation(),
  };

  for (const key of DOM_KEYS) {
    dom[key] = null;
  }

  applyAliases(dom);

  return dom;
}

export function cacheDom({ dom, events, root = null, force = false } = {}) {
  if (!dom || !isBrowser()) return dom;

  for (const key of DOM_KEYS) {
    const current = dom[key];

    if (!force && isNodeConnected(current)) {
      continue;
    }

    setNode(dom, key, resolveNode(key, root));
  }

  applyAliases(dom);

  const now = Date.now();

  dom.cachedAtMs = now;
  dom.cachedAt = new Date(now).toISOString();
  dom.cacheCount = Number(dom.cacheCount || 0) + 1;

  dom.validation = validateRequiredDomDetailed({ dom });

  emit(events, DOM_EVENTS.cached, {
    cacheCount: dom.cacheCount,
  });

  return dom;
}

/* =========================================================
   VALIDATION
========================================================= */

function missing(dom, keys = []) {
  return keys.filter((key) => !dom?.[key]);
}

export function validateRequiredDomDetailed({
  dom,
  required = REQUIRED_KEYS,
  recommended = RECOMMENDED_KEYS,
  deferred = DEFERRED_UI_KEYS,
  optional = OPTIONAL_KEYS,
} = {}) {
  const missingRequired = missing(dom, required);
  const missingRecommended = missing(dom, recommended);
  const missingDeferred = missing(dom, deferred);
  const missingOptional = missing(dom, optional);

  const warnings = [];

  if (missingRequired.includes("body")) {
    warnings.push({
      code: "BODY_MISSING",
      level: "error",
      message: "Falta document.body.",
    });
  }

  if (missingRequired.includes("mainContent")) {
    warnings.push({
      code: "MAIN_CONTENT_MISSING",
      level: "error",
      message: "Falta #main-content.",
    });
  }

  if (missingRequired.includes("viewContainer")) {
    warnings.push({
      code: "VIEW_CONTAINER_MISSING",
      level: "error",
      message: "Falta #view-container.",
    });
  }

  return {
    ok: missingRequired.length === 0,
    missing: missingRequired,
    recommendedMissing: missingRecommended,
    deferredMissing: missingDeferred,
    optionalMissing: missingOptional,
    warnings,
  };
}

export function validateRequiredDom({ dom, events } = {}) {
  const validation = validateRequiredDomDetailed({ dom });

  if (dom) {
    dom.validation = validation;
  }

  emit(events, validation.ok ? DOM_EVENTS.valid : DOM_EVENTS.invalid, {
    validation,
  });

  return validation.missing;
}

/* =========================================================
   RESOLVERS
========================================================= */

export function getDomNode(dom, key = "", fallback = null) {
  const node = dom?.[text(key, "")] || null;

  return isNodeConnected(node) ? node : fallback;
}

export function setDomNode(dom, key = "", node = null) {
  return setNode(dom, text(key, ""), node);
}

export function refreshDomNode({ dom, key, root = null } = {}) {
  const clean = text(key, "");

  if (!dom || !clean) return null;

  const node = resolveNode(clean, root);

  setNode(dom, clean, node);
  applyAliases(dom);

  return node;
}

export function refreshDomNodes({ dom, keys = [], root = null } = {}) {
  const output = {};

  for (const key of keys || []) {
    output[key] = refreshDomNode({ dom, key, root });
  }

  return output;
}

export function refreshMountDomNodes({ dom, root = null } = {}) {
  return refreshDomNodes({
    dom,
    root,
    keys: ["sidebarMount", "topbarMount"],
  });
}

export function refreshDeferredDomNodes() {
  return {};
}

export function refreshUserDomNodes() {
  return {};
}

export function ensureFreshDom({ dom, events, keys = [] } = {}) {
  if (!dom) return dom;

  const finalKeys = keys.length ? keys : DOM_KEYS;
  const stale = finalKeys.filter((key) => dom[key] && !isNodeConnected(dom[key]));

  if (!stale.length) return dom;

  refreshDomNodes({ dom, keys: stale });

  emit(events, DOM_EVENTS.refreshedStale, {
    keys: stale,
  });

  return dom;
}

export function clearDomCache(dom, events = null) {
  if (!dom) return false;

  for (const key of DOM_KEYS) {
    dom[key] = null;
  }

  dom.cachedAt = "";
  dom.cachedAtMs = 0;
  dom.validation = emptyValidation();

  emit(events, DOM_EVENTS.cleared, {});

  return true;
}

/* =========================================================
   GETTERS
========================================================= */

export function getHtml(dom = {}) {
  return getDomNode(dom, "html", isBrowser() ? document.documentElement : null);
}

export function getBody(dom = {}) {
  return getDomNode(dom, "body", isBrowser() ? document.body : null);
}

export function getAppShell(dom = {}) {
  return getDomNode(dom, "appShell", null);
}

export function getMainContent(dom = {}) {
  return getDomNode(dom, "mainContent", null);
}

export function getViewContainer(dom = {}) {
  return getDomNode(dom, "viewContainer", null);
}

export function getAppContent(dom = {}) {
  return getDomNode(dom, "appContent", null);
}

export function getLoader(dom = {}) {
  return getDomNode(dom, "loader", null);
}

export function getSidebarMount(dom = {}) {
  return getDomNode(dom, "sidebarMount", null);
}

export function getTopbarMount(dom = {}) {
  return getDomNode(dom, "topbarMount", null);
}

/* =========================================================
   SNAPSHOT
========================================================= */

function nodeSnapshot(node) {
  if (!node) {
    return {
      exists: false,
    };
  }

  return {
    exists: true,
    connected: isNodeConnected(node),
    id: node.id || "",
    tag: String(node.tagName || "").toLowerCase(),
    hidden: Boolean(node.hidden),
    childCount: Number(node.children?.length || 0),
  };
}

export function getDomSnapshot(dom = {}) {
  return {
    version: dom?.version || DOM_VERSION,
    browser: isBrowser(),
    cachedAt: dom?.cachedAt || "",
    cacheCount: Number(dom?.cacheCount || 0),
    validation: dom?.validation || null,
    exists: Object.fromEntries(
      DOM_KEYS.map((key) => [key, Boolean(dom?.[key])])
    ),
    nodes: {
      html: nodeSnapshot(dom.html),
      body: nodeSnapshot(dom.body),
      appShell: nodeSnapshot(dom.appShell),
      loader: nodeSnapshot(dom.loader),
      mainContent: nodeSnapshot(dom.mainContent),
      appContent: nodeSnapshot(dom.appContent),
      viewContainer: nodeSnapshot(dom.viewContainer),
      sidebarMount: nodeSnapshot(dom.sidebarMount),
      topbarMount: nodeSnapshot(dom.topbarMount),
      tablehead: nodeSnapshot(dom.tablehead),
      tableheadContainer: nodeSnapshot(dom.tableheadContainer),
    },
  };
}

export function getDomValidationSnapshot(dom = {}) {
  return validateRequiredDomDetailed({ dom });
}

/* =========================================================
   DEBUG SEARCH COMPAT
========================================================= */

export function findDomCandidates({ key = "", root = null } = {}) {
  const selector = DOM_SELECTORS[text(key, "")];

  if (!selector) return [];

  const nodes = queryAll(selector, root);

  return [
    {
      selector,
      count: nodes.length,
      first: nodeSnapshot(nodes[0] || null),
    },
  ];
}

export function findAllDomCandidates({ root = null } = {}) {
  const output = {};

  for (const key of Object.keys(DOM_SELECTORS)) {
    output[key] = findDomCandidates({ key, root });
  }

  return output;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  DOM_VERSION,
  DOM_EVENTS,
  DOM_SELECTORS,

  REQUIRED_KEYS,
  RECOMMENDED_KEYS,
  DEFERRED_UI_KEYS,
  OPTIONAL_KEYS,

  createDomCache,
  cacheDom,

  validateRequiredDom,
  validateRequiredDomDetailed,

  isNodeConnected,

  getDomNode,
  setDomNode,

  refreshDomNode,
  refreshDomNodes,
  refreshMountDomNodes,
  refreshDeferredDomNodes,
  refreshUserDomNodes,
  ensureFreshDom,
  clearDomCache,

  getHtml,
  getBody,
  getAppShell,
  getMainContent,
  getViewContainer,
  getAppContent,
  getLoader,
  getSidebarMount,
  getTopbarMount,

  getDomSnapshot,
  getDomValidationSnapshot,

  findDomCandidates,
  findAllDomCandidates,
};
