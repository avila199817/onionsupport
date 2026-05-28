/* =========================================================
   Onion Support - Core DOM
   Archivo: /src/core/dom.js

   Responsabilidad:
   - Cache DOM mínimo.
   - Sólo nodos reales del index.html.
   - Resolver nodos canónicos y aliases de compat.
   - Validar mounts mínimos.
   - Refrescar nodos missing/stale.
   - Sin imports.
   - Sin montaje UI.
   - Sin Auth.
   - Sin Router.
   - Sin Store.
   - Sin fetch.
   - Sin lógica pesada.
========================================================= */

export const DOM_VERSION = "core.dom.v3";

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
  "noscriptRoot",
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

  noscriptRoot: "#noscript-root",

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

const DOM_ALIASES = Object.freeze({
  appLoader: "loader",

  shell: "appShell",

  main: "mainContent",
  appMain: "mainContent",

  viewRoot: "viewContainer",
  routerView: "viewContainer",

  tableHead: "tablehead",
  tableHeadContainer: "tableheadContainer",

  metaThemeColor: "themeColorMeta",
});

const CANONICAL_DOM_KEYS = Object.freeze([
  "html",
  "body",

  "loader",
  "appShell",
  "noscriptRoot",

  "sidebarMount",
  "topbarMount",

  "mainContent",
  "appContent",
  "viewContainer",

  "tablehead",
  "tableheadContainer",

  "themeColorMeta",
  "tileColorMeta",
]);

const DOM_KEYS = Object.freeze([
  ...new Set([
    ...CANONICAL_DOM_KEYS,
    ...Object.keys(DOM_SELECTORS),
    ...Object.keys(DOM_ALIASES),
  ]),
]);

const CANONICAL_KEY_LOOKUP = Object.freeze(
  Object.fromEntries([
    ...CANONICAL_DOM_KEYS.map((key) => [key.toLowerCase(), key]),
    ...Object.entries(DOM_ALIASES).map(([alias, target]) => [
      alias.toLowerCase(),
      target,
    ]),
  ])
);

/* =========================================================
   BASICS
========================================================= */

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

function canonicalKey(key = "") {
  const clean = text(key, "");

  if (!clean) return "";

  return (
    DOM_ALIASES[clean] ||
    CANONICAL_KEY_LOOKUP[clean.toLowerCase()] ||
    clean
  );
}

function emit(events, name, payload = {}) {
  if (!name) return false;

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

/* =========================================================
   QUERY
========================================================= */

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
    return Array.from((root || document).querySelectorAll(selector) || []);
  } catch {
    return [];
  }
}

function bySelector(selector = "", root = null) {
  if (!isBrowser() || !selector) return null;

  if (
    !root &&
    selector.startsWith("#") &&
    /^#[A-Za-z][\w:-]*$/.test(selector)
  ) {
    try {
      return document.getElementById(selector.slice(1));
    } catch {
      return null;
    }
  }

  return query(selector, root);
}

function resolveNode(key = "", root = null) {
  if (!isBrowser()) return null;

  const clean = canonicalKey(key);

  if (clean === "html") return document.documentElement || null;
  if (clean === "body") return document.body || null;

  const selector = DOM_SELECTORS[clean];

  if (!selector) return null;

  return bySelector(selector, root);
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

/* =========================================================
   CACHE INTERNALS
========================================================= */

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

  for (const [alias, target] of Object.entries(DOM_ALIASES)) {
    dom[alias] = dom[target] || null;
  }

  return true;
}

function setCanonicalNode(dom, key = "", node = null) {
  if (!dom) return false;

  const clean = canonicalKey(key);

  if (!clean) return false;

  dom[clean] = node || null;
  return true;
}

function missing(dom, keys = []) {
  return keys.filter((key) => {
    const clean = canonicalKey(key);
    return !isNodeConnected(dom?.[clean]);
  });
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

  for (const key of CANONICAL_DOM_KEYS) {
    const current = dom[key];

    if (!force && isNodeConnected(current)) {
      continue;
    }

    setCanonicalNode(dom, key, resolveNode(key, root));
  }

  applyAliases(dom);

  const now = Date.now();

  dom.cachedAtMs = now;
  dom.cachedAt = new Date(now).toISOString();
  dom.cacheCount = Number(dom.cacheCount || 0) + 1;

  dom.validation = validateRequiredDomDetailed({ dom });

  emit(events, DOM_EVENTS.cached, {
    cacheCount: dom.cacheCount,
    validation: dom.validation,
  });

  return dom;
}

/* =========================================================
   VALIDATION
========================================================= */

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
  const clean = canonicalKey(key);
  const node = dom?.[clean] || dom?.[text(key, "")] || null;

  if (isNodeConnected(node)) return node;

  const fresh = resolveNode(clean);

  return isNodeConnected(fresh) ? fresh : fallback;
}

export function setDomNode(dom, key = "", node = null) {
  const ok = setCanonicalNode(dom, key, node);

  if (ok) {
    applyAliases(dom);
  }

  return ok;
}

export function refreshDomNode({ dom, key, root = null } = {}) {
  const clean = canonicalKey(key);

  if (!dom || !clean) return null;

  const node = resolveNode(clean, root);

  setCanonicalNode(dom, clean, node);
  applyAliases(dom);

  return node;
}

export function refreshDomNodes({ dom, keys = [], root = null } = {}) {
  const output = {};

  for (const key of keys || []) {
    const clean = canonicalKey(key);
    output[clean] = refreshDomNode({ dom, key: clean, root });
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

  const finalKeys = keys.length
    ? [...new Set(keys.map(canonicalKey).filter(Boolean))]
    : CANONICAL_DOM_KEYS;

  const stale = finalKeys.filter((key) => !isNodeConnected(dom?.[key]));

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
  dom.cacheCount = 0;
  dom.validation = emptyValidation();

  applyAliases(dom);

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

export function getNoscriptRoot(dom = {}) {
  return getDomNode(dom, "noscriptRoot", null);
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

export function getTablehead(dom = {}) {
  return getDomNode(dom, "tablehead", null);
}

export function getTableheadContainer(dom = {}) {
  return getDomNode(dom, "tableheadContainer", null);
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
    ariaHidden: node.getAttribute?.("aria-hidden") || "",
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
      noscriptRoot: nodeSnapshot(dom.noscriptRoot),

      mainContent: nodeSnapshot(dom.mainContent),
      appContent: nodeSnapshot(dom.appContent),
      viewContainer: nodeSnapshot(dom.viewContainer),

      sidebarMount: nodeSnapshot(dom.sidebarMount),
      topbarMount: nodeSnapshot(dom.topbarMount),

      tablehead: nodeSnapshot(dom.tablehead),
      tableheadContainer: nodeSnapshot(dom.tableheadContainer),

      themeColorMeta: nodeSnapshot(dom.themeColorMeta),
      tileColorMeta: nodeSnapshot(dom.tileColorMeta),
    },

    policy: {
      cacheOnly: true,
      realIndexNodesOnly: true,
      canonicalKeysOnlyResolved: true,
      aliasesAppliedFromCanonical: true,
      refreshesMissingAndStaleNodes: true,

      noAuth: true,
      noRouter: true,
      noStore: true,
      noFetch: true,
      noMounting: true,
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
  const clean = canonicalKey(key);
  const selector = DOM_SELECTORS[clean] || DOM_SELECTORS[text(key, "")];

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
  getNoscriptRoot,
  getMainContent,
  getViewContainer,
  getAppContent,
  getLoader,
  getSidebarMount,
  getTopbarMount,
  getTablehead,
  getTableheadContainer,

  getDomSnapshot,
  getDomValidationSnapshot,

  findDomCandidates,
  findAllDomCandidates,
};
