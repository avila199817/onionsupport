/* =========================================================
   Onion SPA - Core DOM
   Archivo: src/core/dom.js

   RESPONSABILIDADES:
   - centralizar cache de nodos shell SPA
   - validar nodos mínimos del layout
   - resolver referencias reutilizables
   - tolerar variantes de IDs/clases legacy
   - no romper boot si falta un nodo opcional
   - soportar DOM montado tarde
   - soportar recache de nodos desconectados
   - exponer snapshots de diagnóstico

   HARDENING EXTREMO:
   - cache idempotente
   - aliases legacy/fallbacks robustos
   - validación estructural clara
   - cero throws accidentales
   - no lanzar errores por DOM parcial
   - no duplicar eventos DOM
   - no false warning para sidebar/topbar durante Core.init()
   - compatible con index.html estático y mounts dinámicos
   - compatible con #sidebar-mount / #topbar-mount
   - compatible con #app-loader estático
   - compatible con #app-shell / #main-content / #view-container

   FIX BOOT / UI DINÁMICA:
   - sidebar/topbar NO son required durante Core.init()
   - sidebar/topbar reales son deferred UI nodes porque los monta JS
   - sidebarMount/topbarMount sí son nodos estáticos recomendados
   - validateRequiredDom() permite includeDeferred:true para diagnóstico tardío

   CONTRATO CON index.html:
   - #app-loader
   - #app-shell
   - #sidebar-mount
   - #topbar-mount
   - #main-content
   - #table-head
   - #tablehead-container
   - #app-content
   - #view-container
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const DOM_VERSION =
  "11.0.0";

const REQUIRED_KEYS =
  Object.freeze([
    "body",
    "mainContent",
    "viewContainer",
  ]);

/*
  Recomendados reales del shell estático.

  Importante:
  sidebar/topbar NO van aquí porque en Onion SPA los montan
  SidebarUI/TopbarUI durante initUISystems().
*/
const RECOMMENDED_KEYS =
  Object.freeze([
    "html",
    "appShell",
    "appContent",
    "loader",
    "sidebarMount",
    "topbarMount",
  ]);

/*
  Nodos UI montados tarde.
  No deben generar warning en Core.init().
*/
const DEFERRED_UI_KEYS =
  Object.freeze([
    "sidebar",
    "topbar",
    "sidebarMenu",
    "sidebarRecents",
    "topbarTitle",
    "topbarViewContainer",
    "userToggle",
    "userDropdown",
    "logoutBtn",
    "sidebarAvatar",
    "sidebarName",
  ]);

const OPTIONAL_KEYS =
  Object.freeze([
    "appRoot",
    "layout",
    "shell",
    "main",
    "viewRoot",
    "routerView",

    "skipLink",
    "themeColorMeta",
    "colorSchemeMeta",
    "tileColorMeta",

    "tablehead",
    "tableHead",
    "tableheadContainer",
    "tableHeadContainer",

    "searchInput",
    "searchResults",

    "sidebarToggle",
    "sidebarMobileToggle",

    "toastRoot",
    "modalRoot",
    "overlayRoot",
    "tooltipRoot",
    "drawerRoot",
    "portalRoot",
  ]);

const DOM_SELECTORS =
  Object.freeze({
    skipLink: [
      ".app-skip-link",
      "[data-skip-link='true']",
      "[data-skip-link]",
      "a[href='#main-content']",
    ],

    themeColorMeta: [
      'meta[name="theme-color"]',
      "meta[data-onion-theme-color='true']",
      "meta[data-theme-color]",
    ],

    colorSchemeMeta: [
      'meta[name="color-scheme"]',
      "meta[data-onion-color-scheme='true']",
    ],

    tileColorMeta: [
      'meta[name="msapplication-TileColor"]',
      "meta[data-onion-tile-color='true']",
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
      "[data-app-layout='true']",
      "[data-app-layout]",
      "#app-shell",
      "[data-app-shell]",
      "#app",
      "#root",
    ],

    appShell: [
      "#app-shell",
      "[data-app-shell='true']",
      "[data-app-shell]",
      ".app-shell",
      ".shell",
    ],

    sidebarMount: [
      "#sidebar-mount",
      "[data-sidebar-mount='true']",
      "[data-sidebar-mount]",
    ],

    topbarMount: [
      "#topbar-mount",
      "[data-topbar-mount='true']",
      "[data-topbar-mount]",
    ],

    mainContent: [
      "#main-content",
      "#app-main",
      "main#main-content",
      "main.main-content",
      ".main-content",
      "[data-main-content='true']",
      "[data-main-content]",
      "[data-app-main]",
      "main",
    ],

    appContent: [
      "#app-content",
      "[data-app-content='true']",
      "[data-app-content]",
      ".app-content",
    ],

    viewContainer: [
      "#view-container",
      "#router-view",
      "#app-view",
      "[data-view-root='true']",
      "[data-view-root]",
      "[data-view-container='true']",
      "[data-view-container]",
      "[data-router-view='true']",
      "[data-router-view]",
      "[data-router-outlet]",
      ".view-container",
      ".router-view",
    ],

    loader: [
      "#app-loader",
      "#loader",
      "[data-app-loader='true']",
      "[data-app-loader]",
      "[data-loader-root]",
      ".app-loader",
      ".loader-root",
    ],

    sidebar: [
      "#app-sidebar",
      "#sidebar",
      "aside#app-sidebar",
      "aside.sidebar",
      ".sidebar",
      "[data-sidebar-root='true']",
      "[data-sidebar-root]",
      "[data-sidebar='true']",
      "[data-sidebar]",
    ],

    sidebarMenu: [
      "#sidebar-menu",
      ".sidebar-menu",
      "[data-sidebar-menu='true']",
      "[data-sidebar-menu]",
      "[data-sidebar-nav]",
      "nav[data-sidebar-menu]",
    ],

    sidebarRecents: [
      "#sidebar-recents",
      "[data-sidebar-recents='true']",
      "[data-sidebar-recents]",
      ".sidebar-recents",
    ],

    topbar: [
      "#app-topbar",
      "#topbar",
      "header#app-topbar",
      "header.topbar",
      ".topbar",
      "[data-topbar-root='true']",
      "[data-topbar-root]",
      "[data-topbar='true']",
      "[data-topbar]",
    ],

    topbarTitle: [
      "#topbar-title",
      "[data-topbar-title='true']",
      "[data-topbar-title]",
      ".topbar-title",
    ],

    topbarViewContainer: [
      "#topbarview-container",
      "#topbar-view-container",
      "[data-topbar-view-container='true']",
      "[data-topbar-view-container]",
      ".topbar-view-container",
    ],

    tablehead: [
      "#table-head",
      "#tablehead",
      ".table-head",
      ".tablehead",
      "[data-tablehead='true']",
      "[data-tablehead]",
      "[data-table-head]",
    ],

    tableheadContainer: [
      "#tablehead-container",
      "#table-head-container",
      "[data-tablehead-container='true']",
      "[data-tablehead-container]",
      "[data-table-head-container]",
      ".tablehead-container",
    ],

    searchInput: [
      "#topbar-search",
      "#search-input",
      "[data-topbar-search='true']",
      "[data-topbar-search]",
      "[data-search-input]",
      "input[type='search']",
    ],

    searchResults: [
      "#topbar-search-results",
      "#search-results",
      "[data-topbar-search-results='true']",
      "[data-topbar-search-results]",
      "[data-search-results]",
    ],

    userToggle: [
      "#userToggle",
      "#user-toggle",
      "[data-user-toggle='true']",
      "[data-user-toggle]",
      "[data-user-menu-toggle]",
    ],

    userDropdown: [
      "#userDropdown",
      "#user-dropdown",
      "[data-user-dropdown='true']",
      "[data-user-dropdown]",
      "[data-user-menu]",
    ],

    logoutBtn: [
      "#logoutBtn",
      "#logout-button",
      "#logout-btn",
      "[data-logout-button='true']",
      "[data-logout-button]",
      "[data-logout]",
      "[data-action='logout']",
    ],

    sidebarToggle: [
      "#toggleSidebar",
      "#sidebar-toggle",
      "[data-sidebar-toggle='true']",
      "[data-sidebar-toggle]",
      "[data-action='toggle-sidebar']",
    ],

    sidebarMobileToggle: [
      "#toggleSidebarMobile",
      "#sidebar-mobile-toggle",
      "[data-sidebar-mobile-toggle='true']",
      "[data-sidebar-mobile-toggle]",
      "[data-action='toggle-sidebar-mobile']",
    ],

    sidebarAvatar: [
      "#sidebar-avatar",
      "#sidebarAvatar",
      "[data-sidebar-avatar='true']",
      "[data-sidebar-avatar]",
      "[data-user-avatar]",
    ],

    sidebarName: [
      "#sidebar-name",
      "#sidebarName",
      "[data-sidebar-name='true']",
      "[data-sidebar-name]",
      "[data-user-name]",
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
  });

const DOM_EVENTS =
  Object.freeze({
    cached:
      "app:core:dom:cached",

    valid:
      "app:core:dom:valid",

    invalid:
      "app:core:dom:invalid",

    refreshedStale:
      "app:core:dom:refreshed-stale",

    cleared:
      "app:core:dom:cleared",
  });

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
    typeof value === "object"
  );
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

  const text =
    String(value).trim();

  return text || fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function uniqueList(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    )
  );
}

function safeWarn(utils, ...args) {
  try {
    utils?.warn?.(
      "[CoreDOM]",
      ...args
    );

    return;
  } catch {}

  try {
    console.warn(
      "[CoreDOM]",
      ...args
    );
  } catch {}
}

function safeLog(utils, ...args) {
  try {
    utils?.log?.(
      "[CoreDOM]",
      ...args
    );
  } catch {}
}

function safeEmit(events, name, payload = {}) {
  const eventName =
    safeText(name, "");

  if (!eventName) {
    return false;
  }

  try {
    if (isFunction(events?.emit)) {
      events.emit(
        eventName,
        payload
      );

      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   QUERY HELPERS
========================================================= */

function getRoot(root = null) {
  if (!isBrowser()) {
    return null;
  }

  return root || document;
}

function safeQs(utils, selector, root = null) {
  if (
    !isBrowser() ||
    !selector
  ) {
    return null;
  }

  const scope =
    getRoot(root);

  try {
    if (isFunction(utils?.qs)) {
      const found =
        utils.qs(
          selector,
          scope
        );

      if (found) {
        return found;
      }
    }
  } catch {}

  try {
    return (
      scope?.querySelector?.(
        selector
      ) || null
    );
  } catch {
    return null;
  }
}

function safeQsa(utils, selector, root = null) {
  if (
    !isBrowser() ||
    !selector
  ) {
    return [];
  }

  const scope =
    getRoot(root);

  try {
    if (isFunction(utils?.qsa)) {
      const found =
        utils.qsa(
          selector,
          scope
        );

      if (Array.isArray(found)) {
        return found;
      }
    }
  } catch {}

  try {
    return Array.from(
      scope?.querySelectorAll?.(
        selector
      ) || []
    );
  } catch {
    return [];
  }
}

function firstMatch(values = []) {
  for (const value of values) {
    if (value) {
      return value;
    }
  }

  return null;
}

function queryFirst(utils, selectors = [], root = null) {
  const list =
    safeArray(selectors);

  const values =
    list.map((selector) =>
      safeQs(
        utils,
        selector,
        root
      )
    );

  return firstMatch(values);
}

function queryAllCandidates(utils, selectors = [], root = null) {
  const output = [];

  for (const selector of safeArray(selectors)) {
    const nodes =
      safeQsa(
        utils,
        selector,
        root
      );

    for (const node of nodes) {
      if (!output.includes(node)) {
        output.push(node);
      }
    }
  }

  return output;
}

function isNodeConnected(node) {
  if (!node) {
    return false;
  }

  if (!isBrowser()) {
    return false;
  }

  try {
    if (
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

function shouldReuseNode(node, force = false) {
  if (force) {
    return false;
  }

  if (!node) {
    return false;
  }

  return isNodeConnected(node);
}

function resolveNode({
  dom,
  key,
  utils,
  selectors,
  root,
  force = false,
}) {
  const current =
    dom?.[key] || null;

  if (
    shouldReuseNode(
      current,
      force
    )
  ) {
    return current;
  }

  return queryFirst(
    utils,
    selectors,
    root
  );
}

function safeSet(dom, key, value) {
  if (
    !dom ||
    !key
  ) {
    return false;
  }

  try {
    dom[key] =
      value || null;

    return true;
  } catch {
    return false;
  }
}

function setAlias(dom, alias, sourceKey) {
  try {
    dom[alias] =
      dom[sourceKey] || null;

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   FACTORY
========================================================= */

export function createDomCache() {
  return {
    version:
      DOM_VERSION,

    cachedAt:
      "",

    cachedAtMs:
      0,

    cacheCount:
      0,

    html:
      null,

    body:
      null,

    skipLink:
      null,

    themeColorMeta:
      null,

    colorSchemeMeta:
      null,

    tileColorMeta:
      null,

    appRoot:
      null,

    layout:
      null,

    shell:
      null,

    appShell:
      null,

    loader:
      null,

    appLoader:
      null,

    sidebarMount:
      null,

    topbarMount:
      null,

    sidebar:
      null,

    sidebarMenu:
      null,

    sidebarRecents:
      null,

    main:
      null,

    mainContent:
      null,

    appContent:
      null,

    viewContainer:
      null,

    viewRoot:
      null,

    routerView:
      null,

    topbar:
      null,

    topbarTitle:
      null,

    topbarViewContainer:
      null,

    tablehead:
      null,

    tableHead:
      null,

    tableheadContainer:
      null,

    tableHeadContainer:
      null,

    searchInput:
      null,

    searchResults:
      null,

    userToggle:
      null,

    userDropdown:
      null,

    logoutBtn:
      null,

    sidebarToggle:
      null,

    sidebarMobileToggle:
      null,

    sidebarAvatar:
      null,

    sidebarName:
      null,

    toastRoot:
      null,

    modalRoot:
      null,

    overlayRoot:
      null,

    tooltipRoot:
      null,

    drawerRoot:
      null,

    portalRoot:
      null,

    validation:
      {
        ok:
          false,

        missing:
          [],

        recommendedMissing:
          [],

        deferredMissing:
          [],

        optionalMissing:
          [],

        warnings:
          [],
      },
  };
}

/* =========================================================
   CACHE DOM
========================================================= */

function applyAliases(dom) {
  if (!dom) {
    return false;
  }

  if (!dom.shell && dom.appShell) {
    setAlias(
      dom,
      "shell",
      "appShell"
    );
  }

  if (!dom.appShell && dom.shell) {
    safeSet(
      dom,
      "appShell",
      dom.shell
    );
  }

  if (!dom.appLoader && dom.loader) {
    setAlias(
      dom,
      "appLoader",
      "loader"
    );
  }

  if (!dom.loader && dom.appLoader) {
    safeSet(
      dom,
      "loader",
      dom.appLoader
    );
  }

  if (!dom.main && dom.mainContent) {
    setAlias(
      dom,
      "main",
      "mainContent"
    );
  }

  if (!dom.mainContent && dom.main) {
    safeSet(
      dom,
      "mainContent",
      dom.main
    );
  }

  if (!dom.viewRoot && dom.viewContainer) {
    setAlias(
      dom,
      "viewRoot",
      "viewContainer"
    );
  }

  if (!dom.routerView && dom.viewContainer) {
    setAlias(
      dom,
      "routerView",
      "viewContainer"
    );
  }

  if (!dom.viewContainer && dom.viewRoot) {
    safeSet(
      dom,
      "viewContainer",
      dom.viewRoot
    );
  }

  if (!dom.appContent && dom.viewContainer) {
    try {
      const parent =
        dom.viewContainer.parentElement;

      if (
        parent &&
        (
          parent.id === "app-content" ||
          parent.hasAttribute?.("data-app-content")
        )
      ) {
        safeSet(
          dom,
          "appContent",
          parent
        );
      }
    } catch {}
  }

  if (!dom.layout && dom.appShell) {
    safeSet(
      dom,
      "layout",
      dom.appShell
    );
  }

  if (!dom.tableHead && dom.tablehead) {
    setAlias(
      dom,
      "tableHead",
      "tablehead"
    );
  }

  if (!dom.tablehead && dom.tableHead) {
    safeSet(
      dom,
      "tablehead",
      dom.tableHead
    );
  }

  if (!dom.tableHeadContainer && dom.tableheadContainer) {
    setAlias(
      dom,
      "tableHeadContainer",
      "tableheadContainer"
    );
  }

  if (!dom.tableheadContainer && dom.tableHeadContainer) {
    safeSet(
      dom,
      "tableheadContainer",
      dom.tableHeadContainer
    );
  }

  return true;
}

export function cacheDom({
  dom,
  utils,
  events,
  root = null,
  force = false,
} = {}) {
  if (!dom) {
    return dom;
  }

  if (!isBrowser()) {
    return dom;
  }

  const startedAt =
    Date.now();

  safeSet(
    dom,
    "html",
    document.documentElement || null
  );

  safeSet(
    dom,
    "body",
    document.body || null
  );

  for (const [key, selectors] of Object.entries(DOM_SELECTORS)) {
    safeSet(
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

  const cachedAtMs =
    Date.now();

  try {
    dom.cachedAtMs =
      cachedAtMs;

    dom.cachedAt =
      safeIsoDate(cachedAtMs);

    dom.cacheCount =
      safeNumber(
        dom.cacheCount,
        0
      ) + 1;
  } catch {}

  safeEmit(
    events,
    DOM_EVENTS.cached,
    {
      durationMs:
        cachedAtMs - startedAt,

      snapshot:
        getDomSnapshot(dom),
    }
  );

  return dom;
}

/* =========================================================
   VALIDATION
========================================================= */

function buildNodeList({
  required = REQUIRED_KEYS,
  recommended = RECOMMENDED_KEYS,
  deferred = DEFERRED_UI_KEYS,
  optional = OPTIONAL_KEYS,
} = {}) {
  return {
    required:
      uniqueList(required),

    recommended:
      uniqueList(recommended),

    deferred:
      uniqueList(deferred),

    optional:
      uniqueList(optional),
  };
}

function missingKeys(dom, keys = []) {
  return safeArray(keys)
    .filter((key) => !dom?.[key])
    .map((key) => safeText(key, ""))
    .filter(Boolean);
}

function buildValidationWarnings({
  dom,
  missing = [],
  recommendedMissing = [],
  deferredMissing = [],
  includeDeferred = false,
  warnDeferred = false,
} = {}) {
  const warnings = [];

  if (missing.includes("body")) {
    warnings.push({
      code:
        "BODY_MISSING",

      level:
        "error",

      message:
        "Falta document.body. El Core se ha ejecutado antes de que el DOM esté listo.",
    });
  }

  if (missing.includes("viewContainer")) {
    warnings.push({
      code:
        "VIEW_CONTAINER_MISSING",

      level:
        "error",

      message:
        "Falta #view-container o equivalente. El Router no tendrá un destino claro para pintar vistas.",
    });
  }

  if (missing.includes("mainContent")) {
    warnings.push({
      code:
        "MAIN_CONTENT_MISSING",

      level:
        "error",

      message:
        "Falta #main-content o equivalente. El layout principal puede quedar incompleto.",
    });
  }

  if (recommendedMissing.includes("loader")) {
    warnings.push({
      code:
        "LOADER_MISSING",

      level:
        "warning",

      message:
        "No se encontró #app-loader. loader.js deberá crear fallback si aplica.",
    });
  }

  if (recommendedMissing.includes("appShell")) {
    warnings.push({
      code:
        "APP_SHELL_MISSING",

      level:
        "warning",

      message:
        "No se encontró #app-shell. El shell puede funcionar, pero shell.js tendrá menos control visual.",
    });
  }

  if (recommendedMissing.includes("sidebarMount")) {
    warnings.push({
      code:
        "SIDEBAR_MOUNT_MISSING",

      level:
        "warning",

      message:
        "No se encontró #sidebar-mount. SidebarUI puede necesitar crear o localizar un mount alternativo.",
    });
  }

  if (recommendedMissing.includes("topbarMount")) {
    warnings.push({
      code:
        "TOPBAR_MOUNT_MISSING",

      level:
        "warning",

      message:
        "No se encontró #topbar-mount. TopbarUI puede necesitar crear o localizar un mount alternativo.",
    });
  }

  if (
    dom?.mainContent &&
    dom?.viewContainer &&
    dom.mainContent === dom.viewContainer
  ) {
    warnings.push({
      code:
        "MAIN_AND_VIEW_SAME_NODE",

      level:
        "warning",

      message:
        "mainContent y viewContainer apuntan al mismo nodo. Es válido, pero el Router podría reemplazar demasiado layout si no hay contenedor interno.",
    });
  }

  if (
    includeDeferred &&
    warnDeferred &&
    deferredMissing.includes("sidebar")
  ) {
    warnings.push({
      code:
        "SIDEBAR_DEFERRED_MISSING",

      level:
        "info",

      message:
        "No se encontró sidebar real. Es correcto durante el boot inicial si SidebarUI lo monta dinámicamente.",
    });
  }

  if (
    includeDeferred &&
    warnDeferred &&
    deferredMissing.includes("topbar")
  ) {
    warnings.push({
      code:
        "TOPBAR_DEFERRED_MISSING",

      level:
        "info",

      message:
        "No se encontró topbar real. Es correcto durante el boot inicial si TopbarUI lo monta dinámicamente.",
    });
  }

  if (
    dom?.sidebar &&
    !dom?.sidebarMenu &&
    includeDeferred &&
    warnDeferred
  ) {
    warnings.push({
      code:
        "SIDEBAR_MENU_DEFERRED_MISSING",

      level:
        "info",

      message:
        "Existe sidebar pero no sidebarMenu. Puede ser correcto si el menú se monta en una fase posterior.",
    });
  }

  if (
    dom?.topbar &&
    !dom?.topbarTitle &&
    includeDeferred &&
    warnDeferred
  ) {
    warnings.push({
      code:
        "TOPBAR_TITLE_DEFERRED_MISSING",

      level:
        "info",

      message:
        "Existe topbar pero no topbarTitle. Puede ser correcto si el título se monta en una fase posterior.",
    });
  }

  return warnings;
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
  const lists =
    buildNodeList({
      required,
      recommended,
      deferred,
      optional,
    });

  const missing =
    missingKeys(
      dom,
      lists.required
    );

  const recommendedMissing =
    missingKeys(
      dom,
      lists.recommended
    );

  const deferredMissing =
    includeDeferred
      ? missingKeys(
          dom,
          lists.deferred
        )
      : [];

  const optionalMissing =
    missingKeys(
      dom,
      lists.optional
    );

  const warnings =
    buildValidationWarnings({
      dom,
      missing,
      recommendedMissing,
      deferredMissing,
      includeDeferred,
      warnDeferred,
    });

  return {
    ok:
      missing.length === 0,

    missing,

    recommendedMissing,

    deferredMissing,

    optionalMissing,

    warnings,

    meta: {
      requiredKeys:
        lists.required,

      recommendedKeys:
        lists.recommended,

      deferredUiKeys:
        lists.deferred,

      optionalKeys:
        lists.optional,

      includeDeferred:
        Boolean(includeDeferred),

      warnDeferred:
        Boolean(warnDeferred),
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
  emit = true,
  log = true,
} = {}) {
  const validation =
    buildValidation({
      dom,
      required,
      recommended,
      deferred,
      optional,
      includeDeferred,
      warnDeferred,
    });

  try {
    if (dom) {
      dom.validation =
        validation;
    }
  } catch {}

  if (
    log &&
    validation.missing.length > 0
  ) {
    safeWarn(
      utils,
      "Faltan nodos requeridos del layout:",
      validation.missing
    );
  }

  if (
    log &&
    validation.recommendedMissing.length > 0
  ) {
    safeWarn(
      utils,
      "Faltan nodos recomendados del layout:",
      validation.recommendedMissing
    );
  }

  if (
    log &&
    includeDeferred &&
    warnDeferred &&
    validation.deferredMissing.length > 0
  ) {
    safeLog(
      utils,
      "Nodos UI diferidos aún no montados:",
      validation.deferredMissing
    );
  }

  if (emit) {
    safeEmit(
      events,
      validation.ok
        ? DOM_EVENTS.valid
        : DOM_EVENTS.invalid,
      {
        validation,
        snapshot:
          getDomSnapshot(dom),
      }
    );
  }

  /*
    Compatibilidad legacy:
    AppCore.safeValidateRequiredDom() espera que esta función
    no lance y puede ignorar el retorno. La versión histórica
    devolvía un array de missing.
  */
  return validation.missing;
}

/* =========================================================
   RESOLVERS
========================================================= */

export function getDomNode(dom, key = "", fallback = null) {
  const cleanKey =
    safeText(key, "");

  if (!cleanKey) {
    return fallback;
  }

  const node =
    dom?.[cleanKey] || null;

  if (
    node &&
    isNodeConnected(node)
  ) {
    return node;
  }

  return fallback;
}

export function setDomNode(dom, key = "", node = null) {
  const cleanKey =
    safeText(key, "");

  if (!cleanKey) {
    return false;
  }

  return safeSet(
    dom,
    cleanKey,
    node
  );
}

export function refreshDomNode({
  dom,
  utils,
  key,
  root = null,
  force = true,
} = {}) {
  const cleanKey =
    safeText(key, "");

  if (
    !dom ||
    !cleanKey ||
    !DOM_SELECTORS[cleanKey]
  ) {
    return null;
  }

  const node =
    resolveNode({
      dom,
      key:
        cleanKey,
      utils,
      selectors:
        DOM_SELECTORS[cleanKey],
      root,
      force,
    });

  safeSet(
    dom,
    cleanKey,
    node
  );

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
  const result = {};

  for (const key of safeArray(keys)) {
    result[key] =
      refreshDomNode({
        dom,
        utils,
        key,
        root,
        force,
      });
  }

  return result;
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
    keys:
      DEFERRED_UI_KEYS,
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
      "sidebarName",
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
  if (!dom) {
    return dom;
  }

  const finalKeys =
    safeArray(keys).length
      ? safeArray(keys)
      : uniqueList([
          ...REQUIRED_KEYS,
          ...RECOMMENDED_KEYS,
          ...DEFERRED_UI_KEYS,
          ...OPTIONAL_KEYS,
        ]);

  const staleKeys =
    finalKeys.filter((key) => {
      const node =
        dom?.[key];

      return (
        node &&
        !isNodeConnected(node)
      );
    });

  if (!staleKeys.length) {
    return dom;
  }

  refreshDomNodes({
    dom,
    utils,
    keys:
      staleKeys,
    root,
    force:
      true,
  });

  safeEmit(
    events,
    DOM_EVENTS.refreshedStale,
    {
      keys:
        staleKeys,
      snapshot:
        getDomSnapshot(dom),
    }
  );

  return dom;
}

export function clearDomCache(dom, events = null) {
  if (!dom) {
    return false;
  }

  for (const key of Object.keys(dom)) {
    if (
      key === "version" ||
      key === "cacheCount"
    ) {
      continue;
    }

    if (key === "validation") {
      dom.validation =
        {
          ok:
            false,

          missing:
            [],

          recommendedMissing:
            [],

          deferredMissing:
            [],

          optionalMissing:
            [],

          warnings:
            [],
        };

      continue;
    }

    if (
      key === "cachedAt" ||
      key === "cachedAtMs"
    ) {
      dom[key] =
        key === "cachedAt"
          ? ""
          : 0;

      continue;
    }

    dom[key] =
      null;
  }

  safeEmit(
    events,
    DOM_EVENTS.cleared,
    {
      at:
        safeIsoDate(),
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
      exists:
        false,
    };
  }

  let className = "";

  try {
    className =
      typeof el.className === "string"
        ? el.className
        : safeText(
            el.className?.baseVal,
            ""
          );
  } catch {}

  let dataset = {};

  try {
    dataset =
      {
        ...el.dataset,
      };
  } catch {
    dataset =
      {};
  }

  let text = "";

  try {
    text =
      safeText(
        el.textContent,
        ""
      );
  } catch {}

  return {
    exists:
      true,

    tag:
      safeText(
        el.tagName,
        ""
      ).toLowerCase(),

    id:
      safeText(
        el.id,
        ""
      ),

    className,

    role:
      safeText(
        el.getAttribute?.("role"),
        ""
      ),

    hidden:
      Boolean(el.hidden),

    connected:
      isNodeConnected(el),

    ariaHidden:
      safeText(
        el.getAttribute?.("aria-hidden"),
        ""
      ),

    ariaBusy:
      safeText(
        el.getAttribute?.("aria-busy"),
        ""
      ),

    ariaExpanded:
      safeText(
        el.getAttribute?.("aria-expanded"),
        ""
      ),

    dataRouteMode:
      safeText(
        el.getAttribute?.("data-route-mode"),
        ""
      ),

    dataShell:
      safeText(
        el.getAttribute?.("data-shell"),
        ""
      ),

    dataShellState:
      safeText(
        el.getAttribute?.("data-shell-state"),
        ""
      ),

    dataLoaderState:
      safeText(
        el.getAttribute?.("data-loader-state"),
        ""
      ),

    dataLoaderVisible:
      safeText(
        el.getAttribute?.("data-loader-visible"),
        ""
      ),

    childCount:
      safeNumber(
        el.children?.length,
        0
      ),

    hasText:
      Boolean(text),

    textPreview:
      text
        ? text.slice(0, 80)
        : "",

    datasetKeys:
      Object.keys(dataset),
  };
}

function buildExistsMap(dom = {}) {
  const keys =
    uniqueList([
      ...REQUIRED_KEYS,
      ...RECOMMENDED_KEYS,
      ...DEFERRED_UI_KEYS,
      ...OPTIONAL_KEYS,
      "shell",
      "appLoader",
      "viewRoot",
      "routerView",
    ]);

  const output = {};

  for (const key of keys) {
    output[key] =
      Boolean(dom?.[key]);
  }

  return output;
}

function buildNodeSnapshots(dom = {}) {
  const keys =
    uniqueList([
      "html",
      "body",
      "skipLink",
      "themeColorMeta",
      "colorSchemeMeta",
      "tileColorMeta",
      "appRoot",
      "layout",
      "shell",
      "appShell",
      "loader",
      "appLoader",
      "sidebarMount",
      "topbarMount",
      "sidebar",
      "sidebarMenu",
      "sidebarRecents",
      "main",
      "mainContent",
      "appContent",
      "viewContainer",
      "viewRoot",
      "routerView",
      "topbar",
      "topbarTitle",
      "topbarViewContainer",
      "tablehead",
      "tableHead",
      "tableheadContainer",
      "tableHeadContainer",
      "searchInput",
      "searchResults",
      "userToggle",
      "userDropdown",
      "logoutBtn",
      "sidebarToggle",
      "sidebarMobileToggle",
      "sidebarAvatar",
      "sidebarName",
      "toastRoot",
      "modalRoot",
      "overlayRoot",
      "tooltipRoot",
      "drawerRoot",
      "portalRoot",
    ]);

  const output = {};

  for (const key of keys) {
    output[key] =
      getElementSnapshot(
        dom?.[key]
      );
  }

  return output;
}

export function getDomSnapshot(dom = {}) {
  return {
    version:
      dom?.version || DOM_VERSION,

    cachedAt:
      dom?.cachedAt || "",

    cachedAtMs:
      dom?.cachedAtMs || 0,

    cacheCount:
      safeNumber(
        dom?.cacheCount,
        0
      ),

    browser:
      isBrowser(),

    validation:
      dom?.validation || null,

    groups: {
      required:
        REQUIRED_KEYS.map((key) => ({
          key,
          exists:
            Boolean(dom?.[key]),
        })),

      recommended:
        RECOMMENDED_KEYS.map((key) => ({
          key,
          exists:
            Boolean(dom?.[key]),
        })),

      deferred:
        DEFERRED_UI_KEYS.map((key) => ({
          key,
          exists:
            Boolean(dom?.[key]),
        })),

      optional:
        OPTIONAL_KEYS.map((key) => ({
          key,
          exists:
            Boolean(dom?.[key]),
        })),
    },

    nodes:
      buildNodeSnapshots(dom),

    exists:
      buildExistsMap(dom),
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
  const cleanKey =
    safeText(key, "");

  const selectors =
    DOM_SELECTORS[cleanKey] || [];

  return selectors.map((selector) => {
    const nodes =
      safeQsa(
        utils,
        selector,
        root
      );

    return {
      selector,

      count:
        nodes.length,

      first:
        getElementSnapshot(
          nodes[0] || null
        ),

      candidates:
        nodes.slice(0, 8).map((node) =>
          getElementSnapshot(node)
        ),
    };
  });
}

export function findAllDomCandidates({
  utils,
  root = null,
} = {}) {
  const output = {};

  for (const key of Object.keys(DOM_SELECTORS)) {
    output[key] =
      findDomCandidates({
        utils,
        key,
        root,
      });
  }

  return output;
}

export function getDomValidationSnapshot(dom = {}) {
  const validation =
    buildValidation({
      dom,
      includeDeferred:
        true,
      warnDeferred:
        false,
    });

  return {
    ok:
      validation.ok,

    missing:
      validation.missing,

    recommendedMissing:
      validation.recommendedMissing,

    deferredMissing:
      validation.deferredMissing,

    optionalMissing:
      validation.optionalMissing,

    warnings:
      validation.warnings,

    exists:
      getDomSnapshot(dom).exists,
  };
}

/* =========================================================
   EXPORT
========================================================= */

export {
  DOM_VERSION,
  DOM_EVENTS,
  DOM_SELECTORS,
  REQUIRED_KEYS,
  RECOMMENDED_KEYS,
  DEFERRED_UI_KEYS,
  OPTIONAL_KEYS,
};

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

  getDomNode,
  setDomNode,
  refreshDomNode,
  refreshDomNodes,
  refreshMountDomNodes,
  refreshDeferredDomNodes,
  refreshUserDomNodes,
  ensureFreshDom,
  clearDomCache,

  getDomSnapshot,
  getDomValidationSnapshot,
  findDomCandidates,
  findAllDomCandidates,
};
