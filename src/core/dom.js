/* =========================================================
   Onion SPA - Core DOM
   Archivo: src/core/dom.js

   CORE DOM · CLEAN CACHE
   - Cache único de nodos shell/layout/UI.
   - Required mínimo: body/mainContent/viewContainer.
   - Sidebar/topbar son diferidos: no rompen boot.
   - Compatible con mounts dinámicos.
   - Aliases legacy estables.
========================================================= */

export const DOM_VERSION = "18.0.0-clean";

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
]);

export const DEFERRED_UI_KEYS = Object.freeze([
  "sidebar",
  "topbar",

  "sidebarMenu",
  "sidebarRecents",
  "sidebarFooter",

  "topbarTitle",
  "topbarViewContainer",
  "topbarActions",

  "userToggle",
  "userDropdown",
  "logoutBtn",

  "sidebarAvatar",
  "sidebarAvatarImage",
  "sidebarAvatarFallback",
  "sidebarName",
  "sidebarEmail",
  "sidebarRole",

  "sidebarToggle",
  "sidebarMobileToggle",

  "searchInput",
  "searchResults",
]);

export const OPTIONAL_KEYS = Object.freeze([
  "appRoot",
  "layout",
  "shell",
  "main",
  "appMain",
  "viewRoot",
  "routerView",

  "skipLink",
  "themeColorMeta",
  "metaThemeColor",
  "colorSchemeMeta",
  "tileColorMeta",

  "tablehead",
  "tableHead",
  "tableheadContainer",
  "tableHeadContainer",

  "toastRoot",
  "modalRoot",
  "overlayRoot",
  "tooltipRoot",
  "drawerRoot",
  "portalRoot",
  "liveRegion",
]);

export const DOM_EVENTS = Object.freeze({
  cached: "app:core:dom:cached",
  valid: "app:core:dom:valid",
  invalid: "app:core:dom:invalid",
  refreshedStale: "app:core:dom:refreshed-stale",
  cleared: "app:core:dom:cleared",
});

export const DOM_SELECTORS = Object.freeze({
  skipLink: [
    ".app-skip-link",
    "[data-skip-link]",
    "a[href='#main-content']",
    "a[href='#view-container']",
  ],

  themeColorMeta: [
    'meta[name="theme-color"]',
    "meta[data-onion-theme-color]",
    "meta[data-theme-color]",
  ],
  metaThemeColor: [
    'meta[name="theme-color"]',
    "meta[data-onion-theme-color]",
    "meta[data-theme-color]",
  ],
  colorSchemeMeta: [
    'meta[name="color-scheme"]',
    "meta[data-onion-color-scheme]",
  ],
  tileColorMeta: [
    'meta[name="msapplication-TileColor"]',
    "meta[data-onion-tile-color]",
  ],

  appRoot: [
    "#app",
    "#root",
    "#app-root",
    "[data-app-root]",
    "[data-onion-root]",
  ],
  layout: [
    "#app-layout",
    ".app-layout",
    ".layout",
    "[data-app-layout]",
    "#app-shell",
    "[data-app-shell]",
  ],
  appShell: [
    "#app-shell",
    "[data-app-shell]",
    ".app-shell",
    ".shell",
  ],
  shell: [
    "#app-shell",
    "[data-app-shell]",
    ".app-shell",
    ".shell",
  ],

  loader: [
    "#app-loader",
    "#loader",
    "[data-app-loader]",
    "[data-loader-root]",
    ".app-loader",
    ".loader-root",
  ],
  appLoader: [
    "#app-loader",
    "#loader",
    "[data-app-loader]",
    "[data-loader-root]",
    ".app-loader",
    ".loader-root",
  ],

  sidebarMount: [
    "#sidebar-mount",
    "[data-sidebar-mount]",
  ],
  topbarMount: [
    "#topbar-mount",
    "[data-topbar-mount]",
  ],

  mainContent: [
    "#main-content",
    "#app-main",
    "main#main-content",
    "main.main-content",
    ".main-content",
    "[data-main-content]",
    "[data-app-main]",
    "main",
  ],
  main: [
    "#main-content",
    "#app-main",
    "main#main-content",
    "main.main-content",
    ".main-content",
    "[data-main-content]",
    "[data-app-main]",
    "main",
  ],
  appMain: [
    "#app-main",
    "#main-content",
    "[data-app-main]",
    "[data-main-content]",
    "main",
  ],
  appContent: [
    "#app-content",
    "[data-app-content]",
    ".app-content",
  ],

  viewContainer: [
    "#view-container",
    "#router-view",
    "#app-view",
    "[data-view-root]",
    "[data-view-container]",
    "[data-router-view]",
    "[data-router-outlet]",
    ".view-container",
    ".router-view",
  ],
  viewRoot: [
    "#view-container",
    "#router-view",
    "#app-view",
    "[data-view-root]",
    "[data-view-container]",
    "[data-router-view]",
    "[data-router-outlet]",
    ".view-container",
    ".router-view",
  ],
  routerView: [
    "#view-container",
    "#router-view",
    "#app-view",
    "[data-router-view]",
    "[data-router-outlet]",
    "[data-view-container]",
    ".router-view",
    ".view-container",
  ],

  sidebar: [
    "#app-sidebar",
    "#sidebar",
    "aside#app-sidebar",
    "aside.sidebar",
    ".sidebar",
    "[data-sidebar-root]",
    "[data-sidebar]",
  ],
  sidebarMenu: [
    "#sidebar-menu",
    ".sidebar-menu",
    "[data-sidebar-menu]",
    "[data-sidebar-nav]",
    "nav[data-sidebar-menu]",
  ],
  sidebarRecents: [
    "#sidebar-recents",
    "[data-sidebar-recents]",
    ".sidebar-recents",
  ],
  sidebarFooter: [
    "#sidebar-footer",
    "[data-sidebar-footer]",
    ".sidebar-footer",
  ],

  topbar: [
    "#app-topbar",
    "#topbar",
    "header#app-topbar",
    "header.topbar",
    ".topbar",
    "[data-topbar-root]",
    "[data-topbar]",
  ],
  topbarTitle: [
    "#topbar-title",
    "[data-topbar-title]",
    ".topbar-title",
  ],
  topbarViewContainer: [
    "#topbarview-container",
    "#topbar-view-container",
    "[data-topbar-view-container]",
    ".topbar-view-container",
  ],
  topbarActions: [
    "#topbar-actions",
    "[data-topbar-actions]",
    ".topbar-actions",
  ],

  tablehead: [
    "#table-head",
    "#tablehead",
    ".table-head",
    ".tablehead",
    "[data-tablehead]",
    "[data-table-head]",
  ],
  tableHead: [
    "#table-head",
    "#tablehead",
    ".table-head",
    ".tablehead",
    "[data-tablehead]",
    "[data-table-head]",
  ],
  tableheadContainer: [
    "#tablehead-container",
    "#table-head-container",
    "[data-tablehead-container]",
    "[data-table-head-container]",
    ".tablehead-container",
  ],
  tableHeadContainer: [
    "#tablehead-container",
    "#table-head-container",
    "[data-tablehead-container]",
    "[data-table-head-container]",
    ".tablehead-container",
  ],

  searchInput: [
    "#topbar-search",
    "#search-input",
    "[data-topbar-search]",
    "[data-search-input]",
    "input[type='search']",
  ],
  searchResults: [
    "#topbar-search-results",
    "#search-results",
    "[data-topbar-search-results]",
    "[data-search-results]",
  ],

  userToggle: [
    "#userToggle",
    "#user-toggle",
    "[data-user-toggle]",
    "[data-user-menu-toggle]",
  ],
  userDropdown: [
    "#userDropdown",
    "#user-dropdown",
    "[data-user-dropdown]",
    "[data-user-menu]",
  ],
  logoutBtn: [
    "#logoutBtn",
    "#logout-button",
    "#logout-btn",
    "[data-logout-button]",
    "[data-logout]",
    "[data-action='logout']",
  ],

  sidebarToggle: [
    "#toggleSidebar",
    "#sidebar-toggle",
    "[data-sidebar-toggle]",
    "[data-action='toggle-sidebar']",
  ],
  sidebarMobileToggle: [
    "#toggleSidebarMobile",
    "#sidebar-mobile-toggle",
    "[data-sidebar-mobile-toggle]",
    "[data-action='toggle-sidebar-mobile']",
  ],

  sidebarAvatar: [
    "#sidebar-avatar",
    "#sidebarAvatar",
    "[data-sidebar-avatar]",
    "[data-user-avatar]",
  ],
  sidebarAvatarImage: [
    "#sidebarAvatarImage",
    "#sidebar-avatar-image",
    "[data-sidebar-avatar-image]",
    "[data-user-avatar-image]",
    "#sidebar-avatar img",
    "[data-sidebar-avatar] img",
  ],
  sidebarAvatarFallback: [
    "#sidebarAvatarFallback",
    "#sidebar-avatar-fallback",
    "[data-sidebar-avatar-fallback]",
    "[data-user-avatar-fallback]",
  ],
  sidebarName: [
    "#sidebar-name",
    "#sidebarName",
    "[data-sidebar-name]",
    "[data-user-name]",
  ],
  sidebarEmail: [
    "#sidebar-email",
    "#sidebarEmail",
    "[data-sidebar-email]",
    "[data-user-email]",
  ],
  sidebarRole: [
    "#sidebar-role",
    "#sidebarRole",
    "[data-sidebar-role]",
    "[data-user-role]",
  ],

  toastRoot: [
    "#toast-root",
    "#toast-container",
    "[data-toast-root]",
    "[data-toast-container]",
    ".toast-container",
  ],
  modalRoot: [
    "#modal-root",
    "[data-modal-root]",
    ".modal-root",
  ],
  overlayRoot: [
    "#overlay-root",
    "[data-overlay-root]",
    ".overlay-root",
  ],
  tooltipRoot: [
    "#tooltip-root",
    "[data-tooltip-root]",
    ".tooltip-root",
  ],
  drawerRoot: [
    "#drawer-root",
    "[data-drawer-root]",
    ".drawer-root",
  ],
  portalRoot: [
    "#portal-root",
    "[data-portal-root]",
    ".portal-root",
  ],
  liveRegion: [
    "#app-live-region",
    "[data-live-region]",
    "[aria-live='polite']",
    "[aria-live='assertive']",
  ],
});

const DOM_KEYS = Object.freeze([
  "html",
  "body",
  ...Object.keys(DOM_SELECTORS),
]);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function text(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const out = String(value).trim();
  return out || fallback;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  if (value === null || value === undefined) return [];
  return [value];
}

function unique(values = []) {
  return Array.from(
    new Set(
      toArray(values)
        .flat(Infinity)
        .map((item) => text(item, ""))
        .filter(Boolean)
    )
  );
}

function number(value, fallback = 0) {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
}

function iso(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function emit(events, name, payload = {}) {
  const eventName = text(name, "");
  if (!eventName) return false;

  try {
    if (isFunction(events?.emit)) {
      events.emit(eventName, payload);
      return true;
    }
  } catch {}

  return false;
}

function warn(utils, ...args) {
  try {
    if (isFunction(utils?.warn)) {
      utils.warn("[CoreDOM]", ...args);
      return;
    }
  } catch {}

  try {
    if (utils?.debug === true) {
      console.warn("[CoreDOM]", ...args);
    }
  } catch {}
}

function log(utils, ...args) {
  try {
    utils?.log?.("[CoreDOM]", ...args);
  } catch {}
}

/* =========================================================
   QUERY
========================================================= */

function documentRoot() {
  if (!isBrowser()) return null;

  try {
    return document;
  } catch {
    return null;
  }
}

function rootNode(root = null) {
  if (!isBrowser()) return null;
  return root || documentRoot();
}

function qs(utils, selector, root = null) {
  if (!isBrowser() || !selector) return null;

  const scope = rootNode(root);
  if (!scope) return null;

  try {
    if (isFunction(utils?.qs)) {
      const found = utils.qs(selector, scope);
      if (found) return found;
    }
  } catch {}

  try {
    return scope.querySelector?.(selector) || null;
  } catch {
    return null;
  }
}

function qsa(utils, selector, root = null) {
  if (!isBrowser() || !selector) return [];

  const scope = rootNode(root);
  if (!scope) return [];

  try {
    if (isFunction(utils?.qsa)) {
      const found = utils.qsa(selector, scope);

      if (Array.isArray(found)) return found;
      if (found && typeof found.length === "number") return Array.from(found);
    }
  } catch {}

  try {
    return Array.from(scope.querySelectorAll?.(selector) || []);
  } catch {
    return [];
  }
}

function queryFirst(utils, selectors = [], root = null) {
  for (const selector of toArray(selectors)) {
    const node = qs(utils, selector, root);
    if (node) return node;
  }

  return null;
}

function queryFirstInRoots(utils, selectors = [], roots = []) {
  for (const root of toArray(roots)) {
    const node = queryFirst(utils, selectors, root);
    if (node) return node;
  }

  return null;
}

export function isNodeConnected(node) {
  if (!node || !isBrowser()) return false;

  try {
    if (
      node === window ||
      node === document ||
      node === document.documentElement ||
      node === document.body
    ) {
      return true;
    }
  } catch {}

  try {
    return Boolean(node.isConnected);
  } catch {}

  try {
    return document.contains(node);
  } catch {}

  return false;
}

function canReuse(node, force = false) {
  return Boolean(!force && node && isNodeConnected(node));
}

function addRoot(list, node) {
  if (node && !list.includes(node)) list.push(node);
}

function scopedRoots(dom, key, root = null) {
  const roots = [];
  addRoot(roots, root);

  const sidebarKeys = new Set([
    "sidebar",
    "sidebarMenu",
    "sidebarRecents",
    "sidebarFooter",
    "sidebarToggle",
    "sidebarMobileToggle",
    "sidebarAvatar",
    "sidebarAvatarImage",
    "sidebarAvatarFallback",
    "sidebarName",
    "sidebarEmail",
    "sidebarRole",
    "userToggle",
    "userDropdown",
    "logoutBtn",
  ]);

  const topbarKeys = new Set([
    "topbar",
    "topbarTitle",
    "topbarViewContainer",
    "topbarActions",
    "searchInput",
    "searchResults",
  ]);

  const viewKeys = new Set([
    "main",
    "appMain",
    "mainContent",
    "appContent",
    "viewContainer",
    "viewRoot",
    "routerView",
    "tablehead",
    "tableHead",
    "tableheadContainer",
    "tableHeadContainer",
  ]);

  if (sidebarKeys.has(key)) {
    if (key !== "sidebar") addRoot(roots, dom?.sidebar);
    addRoot(roots, dom?.sidebarMount);
    addRoot(roots, dom?.appShell || dom?.shell);
  }

  if (topbarKeys.has(key)) {
    if (key !== "topbar") addRoot(roots, dom?.topbar);
    addRoot(roots, dom?.topbarMount);
    addRoot(roots, dom?.appShell || dom?.shell);
  }

  if (viewKeys.has(key)) {
    if (!["main", "mainContent", "appMain"].includes(key)) {
      addRoot(roots, dom?.mainContent || dom?.main);
    }

    addRoot(roots, dom?.appContent);
    addRoot(roots, dom?.appShell || dom?.shell);
  }

  addRoot(roots, dom?.appShell || dom?.shell);
  addRoot(roots, documentRoot());

  return roots;
}

function resolveNode({
  dom,
  key,
  utils,
  selectors,
  root = null,
  force = false,
} = {}) {
  const current = dom?.[key] || null;

  if (canReuse(current, force)) return current;

  return queryFirstInRoots(
    utils,
    selectors,
    scopedRoots(dom, key, root)
  );
}

function setNode(dom, key, node) {
  if (!dom || !key) return false;

  try {
    dom[key] = node || null;
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ALIASES
========================================================= */

function alias(dom, key, value) {
  try {
    dom[key] = value || null;
    return true;
  } catch {
    return false;
  }
}

function applyAliases(dom) {
  if (!dom) return false;

  if (!dom.shell && dom.appShell) alias(dom, "shell", dom.appShell);
  if (!dom.appShell && dom.shell) alias(dom, "appShell", dom.shell);

  if (!dom.appLoader && dom.loader) alias(dom, "appLoader", dom.loader);
  if (!dom.loader && dom.appLoader) alias(dom, "loader", dom.appLoader);

  if (!dom.metaThemeColor && dom.themeColorMeta) alias(dom, "metaThemeColor", dom.themeColorMeta);
  if (!dom.themeColorMeta && dom.metaThemeColor) alias(dom, "themeColorMeta", dom.metaThemeColor);

  if (!dom.main && dom.mainContent) alias(dom, "main", dom.mainContent);
  if (!dom.mainContent && dom.main) alias(dom, "mainContent", dom.main);

  if (!dom.appMain && dom.mainContent) alias(dom, "appMain", dom.mainContent);
  if (!dom.mainContent && dom.appMain) alias(dom, "mainContent", dom.appMain);

  if (!dom.viewRoot && dom.viewContainer) alias(dom, "viewRoot", dom.viewContainer);
  if (!dom.routerView && dom.viewContainer) alias(dom, "routerView", dom.viewContainer);

  if (!dom.viewContainer && dom.viewRoot) alias(dom, "viewContainer", dom.viewRoot);
  if (!dom.viewContainer && dom.routerView) alias(dom, "viewContainer", dom.routerView);

  if (!dom.layout && dom.appShell) alias(dom, "layout", dom.appShell);

  if (!dom.tableHead && dom.tablehead) alias(dom, "tableHead", dom.tablehead);
  if (!dom.tablehead && dom.tableHead) alias(dom, "tablehead", dom.tableHead);

  if (!dom.tableHeadContainer && dom.tableheadContainer) {
    alias(dom, "tableHeadContainer", dom.tableheadContainer);
  }

  if (!dom.tableheadContainer && dom.tableHeadContainer) {
    alias(dom, "tableheadContainer", dom.tableHeadContainer);
  }

  if (!dom.appContent && dom.viewContainer) {
    try {
      const parent = dom.viewContainer.parentElement;

      if (
        parent &&
        (
          parent.id === "app-content" ||
          parent.hasAttribute?.("data-app-content") ||
          parent.classList?.contains?.("app-content")
        )
      ) {
        alias(dom, "appContent", parent);
      }
    } catch {}
  }

  if (!dom.sidebarAvatarImage && dom.sidebarAvatar) {
    try {
      const image = dom.sidebarAvatar.matches?.("img")
        ? dom.sidebarAvatar
        : dom.sidebarAvatar.querySelector?.("img");

      if (image) alias(dom, "sidebarAvatarImage", image);
    } catch {}
  }

  return true;
}

/* =========================================================
   CACHE FACTORY
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

/* =========================================================
   CACHE
========================================================= */

export function cacheDom({
  dom,
  utils,
  events,
  root = null,
  force = false,
} = {}) {
  if (!dom || !isBrowser()) return dom;

  const startedAt = Date.now();

  setNode(dom, "html", document.documentElement || null);
  setNode(dom, "body", document.body || null);

  for (const [key, selectors] of Object.entries(DOM_SELECTORS)) {
    setNode(
      dom,
      key,
      resolveNode({
        dom,
        key,
        utils,
        selectors,
        root,
        force,
      })
    );
  }

  applyAliases(dom);

  const cachedAtMs = Date.now();

  try {
    dom.cachedAtMs = cachedAtMs;
    dom.cachedAt = iso(cachedAtMs);
    dom.cacheCount = number(dom.cacheCount, 0) + 1;
  } catch {}

  emit(events, DOM_EVENTS.cached, {
    durationMs: cachedAtMs - startedAt,
    snapshot: getDomSnapshot(dom),
  });

  return dom;
}

/* =========================================================
   VALIDATION
========================================================= */

function buildNodeLists({
  required = REQUIRED_KEYS,
  recommended = RECOMMENDED_KEYS,
  deferred = DEFERRED_UI_KEYS,
  optional = OPTIONAL_KEYS,
} = {}) {
  return {
    required: unique(required),
    recommended: unique(recommended),
    deferred: unique(deferred),
    optional: unique(optional),
  };
}

function missing(dom, keys = []) {
  return toArray(keys)
    .filter((key) => !dom?.[key])
    .map((key) => text(key, ""))
    .filter(Boolean);
}

function warningList({
  dom,
  missingRequired = [],
  missingRecommended = [],
  missingDeferred = [],
  includeDeferred = false,
  warnDeferred = false,
} = {}) {
  const out = [];

  if (missingRequired.includes("body")) {
    out.push({
      code: "BODY_MISSING",
      level: "error",
      message: "Falta document.body. Core se ejecutó antes de que el DOM esté listo.",
    });
  }

  if (missingRequired.includes("mainContent")) {
    out.push({
      code: "MAIN_CONTENT_MISSING",
      level: "error",
      message: "Falta #main-content o equivalente.",
    });
  }

  if (missingRequired.includes("viewContainer")) {
    out.push({
      code: "VIEW_CONTAINER_MISSING",
      level: "error",
      message: "Falta #view-container o equivalente. Router no tendrá destino claro.",
    });
  }

  if (missingRecommended.includes("loader")) {
    out.push({
      code: "LOADER_MISSING",
      level: "warning",
      message: "No se encontró #app-loader.",
    });
  }

  if (missingRecommended.includes("appShell")) {
    out.push({
      code: "APP_SHELL_MISSING",
      level: "warning",
      message: "No se encontró #app-shell.",
    });
  }

  if (missingRecommended.includes("appContent")) {
    out.push({
      code: "APP_CONTENT_MISSING",
      level: "warning",
      message: "No se encontró #app-content.",
    });
  }

  if (missingRecommended.includes("sidebarMount")) {
    out.push({
      code: "SIDEBAR_MOUNT_MISSING",
      level: "warning",
      message: "No se encontró #sidebar-mount.",
    });
  }

  if (missingRecommended.includes("topbarMount")) {
    out.push({
      code: "TOPBAR_MOUNT_MISSING",
      level: "warning",
      message: "No se encontró #topbar-mount.",
    });
  }

  if (dom?.mainContent && dom?.viewContainer && dom.mainContent === dom.viewContainer) {
    out.push({
      code: "MAIN_AND_VIEW_SAME_NODE",
      level: "warning",
      message: "mainContent y viewContainer apuntan al mismo nodo.",
    });
  }

  if (includeDeferred && warnDeferred && missingDeferred.includes("sidebar")) {
    out.push({
      code: "SIDEBAR_DEFERRED_MISSING",
      level: "info",
      message: "Sidebar aún no montado. Correcto si SidebarUI lo monta dinámicamente.",
    });
  }

  if (includeDeferred && warnDeferred && missingDeferred.includes("topbar")) {
    out.push({
      code: "TOPBAR_DEFERRED_MISSING",
      level: "info",
      message: "Topbar aún no montado. Correcto si TopbarUI lo monta dinámicamente.",
    });
  }

  return out;
}

function buildValidation({
  dom,
  required = REQUIRED_KEYS,
  recommended = RECOMMENDED_KEYS,
  deferred = DEFERRED_UI_KEYS,
  optional = OPTIONAL_KEYS,
  includeDeferred = false,
  warnDeferred = false,
} = {}) {
  const lists = buildNodeLists({
    required,
    recommended,
    deferred,
    optional,
  });

  const missingRequired = missing(dom, lists.required);
  const missingRecommended = missing(dom, lists.recommended);
  const missingDeferred = includeDeferred ? missing(dom, lists.deferred) : [];
  const missingOptional = missing(dom, lists.optional);

  return {
    ok: missingRequired.length === 0,

    missing: missingRequired,
    recommendedMissing: missingRecommended,
    deferredMissing: missingDeferred,
    optionalMissing: missingOptional,

    warnings: warningList({
      dom,
      missingRequired,
      missingRecommended,
      missingDeferred,
      includeDeferred,
      warnDeferred,
    }),

    meta: {
      requiredKeys: lists.required,
      recommendedKeys: lists.recommended,
      deferredUiKeys: lists.deferred,
      optionalKeys: lists.optional,
      includeDeferred: Boolean(includeDeferred),
      warnDeferred: Boolean(warnDeferred),
    },
  };
}

export function validateRequiredDom({
  dom,
  utils,
  events,
  required = REQUIRED_KEYS,
  recommended = RECOMMENDED_KEYS,
  deferred = DEFERRED_UI_KEYS,
  optional = OPTIONAL_KEYS,
  includeDeferred = false,
  warnDeferred = false,
  emit: shouldEmit = true,
  log: shouldLog = true,
  logRecommended = false,
} = {}) {
  const validation = buildValidation({
    dom,
    required,
    recommended,
    deferred,
    optional,
    includeDeferred,
    warnDeferred,
  });

  try {
    if (dom) dom.validation = validation;
  } catch {}

  if (shouldLog && validation.missing.length) {
    warn(utils, "Faltan nodos requeridos:", validation.missing);
  }

  if (shouldLog && logRecommended && validation.recommendedMissing.length) {
    warn(utils, "Faltan nodos recomendados:", validation.recommendedMissing);
  }

  if (shouldLog && includeDeferred && warnDeferred && validation.deferredMissing.length) {
    log(utils, "Nodos UI diferidos aún no montados:", validation.deferredMissing);
  }

  if (shouldEmit) {
    emit(
      events,
      validation.ok ? DOM_EVENTS.valid : DOM_EVENTS.invalid,
      {
        validation,
        snapshot: getDomSnapshot(dom),
      }
    );
  }

  /*
    Compat legacy: Core.safeValidateRequiredDom() espera array.
  */
  return validation.missing;
}

export function validateRequiredDomDetailed(options = {}) {
  const validation = buildValidation(options);

  try {
    if (options?.dom) options.dom.validation = validation;
  } catch {}

  return validation;
}

/* =========================================================
   RESOLVERS
========================================================= */

export function getDomNode(dom, key = "", fallback = null) {
  const clean = text(key, "");
  if (!clean) return fallback;

  const node = dom?.[clean] || null;

  return node && isNodeConnected(node)
    ? node
    : fallback;
}

export function setDomNode(dom, key = "", node = null) {
  return setNode(dom, text(key, ""), node);
}

export function refreshDomNode({
  dom,
  utils,
  key,
  root = null,
  force = true,
} = {}) {
  const clean = text(key, "");

  if (!dom || !clean || !DOM_SELECTORS[clean]) return null;

  const node = resolveNode({
    dom,
    key: clean,
    utils,
    selectors: DOM_SELECTORS[clean],
    root,
    force,
  });

  setNode(dom, clean, node);
  applyAliases(dom);

  return node;
}

export function refreshDomNodes({
  dom,
  utils,
  keys = [],
  root = null,
  force = true,
} = {}) {
  const out = {};

  for (const key of toArray(keys)) {
    out[key] = refreshDomNode({
      dom,
      utils,
      key,
      root,
      force,
    });
  }

  return out;
}

export function refreshDeferredDomNodes({
  dom,
  utils,
  root = null,
  force = true,
} = {}) {
  return refreshDomNodes({
    dom,
    utils,
    keys: DEFERRED_UI_KEYS,
    root,
    force,
  });
}

export function refreshMountDomNodes({
  dom,
  utils,
  root = null,
  force = true,
} = {}) {
  return refreshDomNodes({
    dom,
    utils,
    keys: [
      "sidebarMount",
      "topbarMount",
    ],
    root,
    force,
  });
}

export function refreshUserDomNodes({
  dom,
  utils,
  root = null,
  force = true,
} = {}) {
  return refreshDomNodes({
    dom,
    utils,
    keys: [
      "userToggle",
      "userDropdown",
      "logoutBtn",
      "sidebarAvatar",
      "sidebarAvatarImage",
      "sidebarAvatarFallback",
      "sidebarName",
      "sidebarEmail",
      "sidebarRole",
    ],
    root,
    force,
  });
}

export function ensureFreshDom({
  dom,
  utils,
  events,
  keys = [],
  root = null,
} = {}) {
  if (!dom) return dom;

  const finalKeys = toArray(keys).length
    ? unique(keys)
    : unique([
        ...REQUIRED_KEYS,
        ...RECOMMENDED_KEYS,
        ...DEFERRED_UI_KEYS,
        ...OPTIONAL_KEYS,
      ]);

  const staleKeys = finalKeys.filter((key) => {
    const node = dom?.[key];
    return node && !isNodeConnected(node);
  });

  if (!staleKeys.length) return dom;

  refreshDomNodes({
    dom,
    utils,
    keys: staleKeys,
    root,
    force: true,
  });

  emit(events, DOM_EVENTS.refreshedStale, {
    keys: staleKeys,
    snapshot: getDomSnapshot(dom),
  });

  return dom;
}

export function clearDomCache(dom, events = null) {
  if (!dom) return false;

  for (const key of Object.keys(dom)) {
    if (key === "version" || key === "cacheCount") continue;

    if (key === "validation") {
      dom.validation = emptyValidation();
      continue;
    }

    if (key === "cachedAt") {
      dom.cachedAt = "";
      continue;
    }

    if (key === "cachedAtMs") {
      dom.cachedAtMs = 0;
      continue;
    }

    dom[key] = null;
  }

  emit(events, DOM_EVENTS.cleared, {
    at: iso(),
  });

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
  return getDomNode(dom, "appShell", getDomNode(dom, "shell", null));
}

export function getMainContent(dom = {}) {
  return getDomNode(dom, "mainContent", getDomNode(dom, "main", null));
}

export function getViewContainer(dom = {}) {
  return getDomNode(
    dom,
    "viewContainer",
    getDomNode(dom, "viewRoot", getDomNode(dom, "routerView", null))
  );
}

export function getAppContent(dom = {}) {
  return getDomNode(dom, "appContent", null);
}

export function getLoader(dom = {}) {
  return getDomNode(dom, "loader", getDomNode(dom, "appLoader", null));
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

function elementSnapshot(el) {
  if (!el) return { exists: false };

  let className = "";
  let dataset = {};
  let textPreview = "";
  let tag = "";
  let nodeName = "";

  try {
    className = typeof el.className === "string"
      ? el.className
      : text(el.className?.baseVal, "");
  } catch {}

  try {
    dataset = { ...el.dataset };
  } catch {}

  try {
    textPreview = text(el.textContent, "").slice(0, 80);
  } catch {}

  try {
    tag = text(el.tagName, "").toLowerCase();
  } catch {}

  try {
    nodeName = text(el.nodeName, "");
  } catch {}

  return {
    exists: true,
    connected: isNodeConnected(el),

    tag,
    nodeName,

    id: text(el.id, ""),
    className,

    role: text(el.getAttribute?.("role"), ""),

    hidden: Boolean(el.hidden),

    ariaHidden: text(el.getAttribute?.("aria-hidden"), ""),
    ariaBusy: text(el.getAttribute?.("aria-busy"), ""),
    ariaExpanded: text(el.getAttribute?.("aria-expanded"), ""),

    dataRouteMode: text(el.getAttribute?.("data-route-mode"), ""),
    dataShell: text(el.getAttribute?.("data-shell"), ""),
    dataShellState: text(el.getAttribute?.("data-shell-state"), ""),
    dataLoaderState: text(el.getAttribute?.("data-loader-state"), ""),
    dataLoaderVisible: text(el.getAttribute?.("data-loader-visible"), ""),

    childCount: number(el.children?.length, 0),

    hasText: Boolean(textPreview),
    textPreview,

    datasetKeys: Object.keys(dataset),
  };
}

function existsMap(dom = {}) {
  const keys = unique([
    ...REQUIRED_KEYS,
    ...RECOMMENDED_KEYS,
    ...DEFERRED_UI_KEYS,
    ...OPTIONAL_KEYS,
    "shell",
    "appLoader",
    "appMain",
    "viewRoot",
    "routerView",
  ]);

  const out = {};

  for (const key of keys) {
    out[key] = Boolean(dom?.[key]);
  }

  return out;
}

function nodeSnapshots(dom = {}) {
  const out = {};

  for (const key of unique(DOM_KEYS)) {
    out[key] = elementSnapshot(dom?.[key]);
  }

  return out;
}

export function getDomSnapshot(dom = {}) {
  return {
    version: dom?.version || DOM_VERSION,

    browser: isBrowser(),

    cachedAt: dom?.cachedAt || "",
    cachedAtMs: number(dom?.cachedAtMs, 0),
    cacheCount: number(dom?.cacheCount, 0),

    validation: dom?.validation || null,

    groups: {
      required: REQUIRED_KEYS.map((key) => ({
        key,
        exists: Boolean(dom?.[key]),
      })),
      recommended: RECOMMENDED_KEYS.map((key) => ({
        key,
        exists: Boolean(dom?.[key]),
      })),
      deferred: DEFERRED_UI_KEYS.map((key) => ({
        key,
        exists: Boolean(dom?.[key]),
      })),
      optional: OPTIONAL_KEYS.map((key) => ({
        key,
        exists: Boolean(dom?.[key]),
      })),
    },

    exists: existsMap(dom),
    nodes: nodeSnapshots(dom),
  };
}

/* =========================================================
   DEBUG SEARCH
========================================================= */

export function findDomCandidates({
  utils,
  key = "",
  root = null,
} = {}) {
  const clean = text(key, "");
  const selectors = DOM_SELECTORS[clean] || [];

  return toArray(selectors).map((selector) => {
    const nodes = qsa(utils, selector, root);

    return {
      selector,
      count: nodes.length,
      first: elementSnapshot(nodes[0] || null),
      candidates: nodes.slice(0, 8).map((node) => elementSnapshot(node)),
    };
  });
}

export function findAllDomCandidates({
  utils,
  root = null,
} = {}) {
  const out = {};

  for (const key of Object.keys(DOM_SELECTORS)) {
    out[key] = findDomCandidates({
      utils,
      key,
      root,
    });
  }

  return out;
}

export function getDomValidationSnapshot(dom = {}) {
  const validation = buildValidation({
    dom,
    includeDeferred: true,
    warnDeferred: false,
  });

  return {
    ok: validation.ok,

    missing: validation.missing,
    recommendedMissing: validation.recommendedMissing,
    deferredMissing: validation.deferredMissing,
    optionalMissing: validation.optionalMissing,
    warnings: validation.warnings,

    exists: getDomSnapshot(dom).exists,
  };
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
