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
   - exponer snapshots de diagnóstico

   HARDENING EXTREMO:
   - cache idempotente
   - aliases legacy/fallbacks robustos
   - validación estructural clara
   - cero throws accidentales
   - no lanzar errores por DOM parcial
   - recache seguro si un nodo quedó desconectado
   - compatible con index.html estático y mounts dinámicos
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const DOM_VERSION =
  "10.0.0";

const REQUIRED_KEYS =
  Object.freeze([
    "body",
    "mainContent",
    "viewContainer",
  ]);

const RECOMMENDED_KEYS =
  Object.freeze([
    "html",
    "appShell",
    "loader",
    "sidebar",
    "topbar",
  ]);

const DOM_SELECTORS =
  Object.freeze({
    themeColorMeta: [
      'meta[name="theme-color"]',
      "meta[data-theme-color]",
    ],

    appRoot: [
      "#app",
      "#root",
      "#app-root",
      "[data-app-root]",
    ],

    layout: [
      "#app-layout",
      ".layout",
      "[data-app-layout='true']",
      "[data-app-layout]",
      "#app",
    ],

    appShell: [
      "#app-shell",
      "[data-app-shell='true']",
      "[data-app-shell]",
      ".app-shell",
    ],

    mainContent: [
      "#main-content",
      "#app-main",
      "main.main-content",
      ".main-content",
      "[data-main-content]",
      "main",
    ],

    appContent: [
      "#app-content",
      "[data-app-content]",
      ".app-content",
      "#main-content",
      "main.main-content",
    ],

    viewContainer: [
      "#view-container",
      "[data-view-root]",
      "[data-view-container='true']",
      "[data-view-container]",
      "[data-router-view]",
      ".view-container",
    ],

    loader: [
      "#app-loader",
      "[data-app-loader='true']",
      "[data-app-loader]",
      ".app-loader",
      ".loader-root",
    ],

    sidebar: [
      "#app-sidebar",
      "#sidebar",
      ".sidebar",
      "[data-sidebar-root]",
      "[data-sidebar='true']",
      "[data-sidebar]",
    ],

    sidebarMenu: [
      "#sidebar-menu",
      ".sidebar-menu",
      "[data-sidebar-menu='true']",
      "[data-sidebar-menu]",
    ],

    sidebarRecents: [
      "#sidebar-recents",
      "[data-sidebar-recents]",
      ".sidebar-recents",
    ],

    topbar: [
      "#app-topbar",
      "#topbar",
      ".topbar",
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
      "[data-tablehead]",
    ],

    tableheadContainer: [
      "#tablehead-container",
      "#table-head-container",
      "[data-tablehead-container='true']",
      "[data-tablehead-container]",
      ".tablehead-container",
    ],

    searchInput: [
      "#topbar-search",
      "#search-input",
      "[data-topbar-search='true']",
      "[data-topbar-search]",
      "[data-search-input]",
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
    ],

    userDropdown: [
      "#userDropdown",
      "#user-dropdown",
      "[data-user-dropdown='true']",
      "[data-user-dropdown]",
    ],

    logoutBtn: [
      "#logoutBtn",
      "#logout-button",
      "#logout-btn",
      "[data-logout-button='true']",
      "[data-logout-button]",
      "[data-logout]",
    ],

    sidebarToggle: [
      "#toggleSidebar",
      "#sidebar-toggle",
      "[data-sidebar-toggle='true']",
      "[data-sidebar-toggle]",
    ],

    sidebarMobileToggle: [
      "#toggleSidebarMobile",
      "#sidebar-mobile-toggle",
      "[data-sidebar-mobile-toggle='true']",
      "[data-sidebar-mobile-toggle]",
    ],

    sidebarAvatar: [
      "#sidebar-avatar",
      "#sidebarAvatar",
      "[data-sidebar-avatar='true']",
      "[data-sidebar-avatar]",
    ],

    sidebarName: [
      "#sidebar-name",
      "#sidebarName",
      "[data-sidebar-name='true']",
      "[data-sidebar-name]",
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

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeWarn(utils, ...args) {
  try {
    utils?.warn?.(
      "[CoreDOM]",
      ...args
    );
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
  try {
    events?.emit?.(
      name,
      payload
    );

    return true;
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

function isNodeConnected(node) {
  if (!node) {
    return false;
  }

  if (
    node === document ||
    node === document.documentElement ||
    node === document.body
  ) {
    return true;
  }

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

    themeColorMeta:
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

    sidebar:
      null,

    sidebarMenu:
      null,

    sidebarRecents:
      null,

    mainContent:
      null,

    appContent:
      null,

    viewContainer:
      null,

    topbar:
      null,

    topbarTitle:
      null,

    topbarViewContainer:
      null,

    tablehead:
      null,

    tableheadContainer:
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

    validation:
      {
        ok:
          false,

        missing:
          [],

        recommendedMissing:
          [],

        warnings:
          [],
      },
  };
}

/* =========================================================
   CACHE DOM
========================================================= */

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

  /*
    Aliases críticos:
    - shell y appShell deben apuntar al mismo nodo si existe.
    - mainContent/appContent pueden variar según index.html.
  */
  if (!dom.appShell && dom.shell) {
    safeSet(
      dom,
      "appShell",
      dom.shell
    );
  }

  if (!dom.shell && dom.appShell) {
    setAlias(
      dom,
      "shell",
      "appShell"
    );
  }

  if (!dom.mainContent && dom.appContent) {
    safeSet(
      dom,
      "mainContent",
      dom.appContent
    );
  }

  if (!dom.appContent && dom.mainContent) {
    safeSet(
      dom,
      "appContent",
      dom.mainContent
    );
  }

  /*
    Fallback final:
    Si no hay layout/appShell, el appRoot puede servir como layout lógico.
  */
  if (!dom.layout && dom.appRoot) {
    safeSet(
      dom,
      "layout",
      dom.appRoot
    );
  }

  if (!dom.appShell && dom.layout) {
    safeSet(
      dom,
      "appShell",
      dom.layout
    );

    setAlias(
      dom,
      "shell",
      "appShell"
    );
  }

  const cachedAtMs =
    Date.now();

  try {
    dom.cachedAtMs =
      cachedAtMs;

    dom.cachedAt =
      safeIsoDate(cachedAtMs);

    dom.cacheCount =
      Number(dom.cacheCount || 0) + 1;
  } catch {}

  safeEmit(
    events,
    "core:dom:cached",
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

function buildValidation({
  dom,
  required = REQUIRED_KEYS,
  recommended = RECOMMENDED_KEYS,
} = {}) {
  const missing =
    safeArray(required)
      .filter((key) => !dom?.[key])
      .map((key) => safeText(key, ""));

  const recommendedMissing =
    safeArray(recommended)
      .filter((key) => !dom?.[key])
      .map((key) => safeText(key, ""));

  const warnings = [];

  if (missing.includes("viewContainer")) {
    warnings.push({
      code:
        "VIEW_CONTAINER_MISSING",

      message:
        "Falta #view-container o equivalente. El Router no tendrá un destino claro para pintar vistas.",
    });
  }

  if (missing.includes("mainContent")) {
    warnings.push({
      code:
        "MAIN_CONTENT_MISSING",

      message:
        "Falta mainContent/appContent. El layout principal puede quedar incompleto.",
    });
  }

  if (!dom?.loader) {
    warnings.push({
      code:
        "LOADER_MISSING",

      message:
        "No se encontró #app-loader. loader.js deberá crear fallback si aplica.",
    });
  }

  if (!dom?.sidebar) {
    warnings.push({
      code:
        "SIDEBAR_MISSING",

      message:
        "No se encontró sidebar inicial. Puede ser correcto si SidebarUI monta dinámicamente.",
    });
  }

  if (!dom?.topbar) {
    warnings.push({
      code:
        "TOPBAR_MISSING",

      message:
        "No se encontró topbar inicial. Puede ser correcto si TopbarUI monta dinámicamente.",
    });
  }

  return {
    ok:
      missing.length === 0,

    missing,

    recommendedMissing,

    warnings,
  };
}

export function validateRequiredDom({
  dom,
  utils,
  events,
  required = REQUIRED_KEYS,
  recommended = RECOMMENDED_KEYS,
  emit = true,
  log = true,
} = {}) {
  const validation =
    buildValidation({
      dom,
      required,
      recommended,
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
      "Faltan nodos importantes del layout:",
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

  if (emit) {
    safeEmit(
      events,
      validation.ok
        ? "core:dom:valid"
        : "core:dom:invalid",
      {
        validation,
        snapshot:
          getDomSnapshot(dom),
      }
    );
  }

  /*
    Compatibilidad legacy:
    La versión anterior devolvía solo el array de missing.
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

  return dom?.[cleanKey] || fallback;
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

  if (
    cleanKey === "appShell"
  ) {
    setAlias(
      dom,
      "shell",
      "appShell"
    );
  }

  return node;
}

export function clearDomCache(dom) {
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

    if (
      key === "validation"
    ) {
      dom.validation =
        {
          ok:
            false,

          missing:
            [],

          recommendedMissing:
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

  let className =
    "";

  try {
    className =
      safeText(
        el.className,
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

    childCount:
      Number(el.children?.length || 0),

    hasText:
      Boolean(
        safeText(
          el.textContent,
          ""
        )
      ),
  };
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
      Number(dom?.cacheCount || 0),

    browser:
      isBrowser(),

    validation:
      dom?.validation || null,

    nodes: {
      html:
        getElementSnapshot(dom?.html),

      body:
        getElementSnapshot(dom?.body),

      appRoot:
        getElementSnapshot(dom?.appRoot),

      layout:
        getElementSnapshot(dom?.layout),

      shell:
        getElementSnapshot(dom?.shell),

      appShell:
        getElementSnapshot(dom?.appShell),

      loader:
        getElementSnapshot(dom?.loader),

      sidebar:
        getElementSnapshot(dom?.sidebar),

      sidebarMenu:
        getElementSnapshot(dom?.sidebarMenu),

      sidebarRecents:
        getElementSnapshot(dom?.sidebarRecents),

      mainContent:
        getElementSnapshot(dom?.mainContent),

      appContent:
        getElementSnapshot(dom?.appContent),

      viewContainer:
        getElementSnapshot(dom?.viewContainer),

      topbar:
        getElementSnapshot(dom?.topbar),

      topbarTitle:
        getElementSnapshot(dom?.topbarTitle),

      topbarViewContainer:
        getElementSnapshot(dom?.topbarViewContainer),

      tablehead:
        getElementSnapshot(dom?.tablehead),

      tableheadContainer:
        getElementSnapshot(dom?.tableheadContainer),

      searchInput:
        getElementSnapshot(dom?.searchInput),

      searchResults:
        getElementSnapshot(dom?.searchResults),

      userToggle:
        getElementSnapshot(dom?.userToggle),

      userDropdown:
        getElementSnapshot(dom?.userDropdown),

      logoutBtn:
        getElementSnapshot(dom?.logoutBtn),

      sidebarToggle:
        getElementSnapshot(dom?.sidebarToggle),

      sidebarMobileToggle:
        getElementSnapshot(dom?.sidebarMobileToggle),

      sidebarAvatar:
        getElementSnapshot(dom?.sidebarAvatar),

      sidebarName:
        getElementSnapshot(dom?.sidebarName),

      toastRoot:
        getElementSnapshot(dom?.toastRoot),

      modalRoot:
        getElementSnapshot(dom?.modalRoot),

      overlayRoot:
        getElementSnapshot(dom?.overlayRoot),
    },

    exists: {
      html:
        Boolean(dom?.html),

      body:
        Boolean(dom?.body),

      appRoot:
        Boolean(dom?.appRoot),

      layout:
        Boolean(dom?.layout),

      shell:
        Boolean(dom?.shell),

      appShell:
        Boolean(dom?.appShell),

      loader:
        Boolean(dom?.loader),

      sidebar:
        Boolean(dom?.sidebar),

      topbar:
        Boolean(dom?.topbar),

      mainContent:
        Boolean(dom?.mainContent),

      appContent:
        Boolean(dom?.appContent),

      viewContainer:
        Boolean(dom?.viewContainer),

      tablehead:
        Boolean(dom?.tablehead),

      tableheadContainer:
        Boolean(dom?.tableheadContainer),
    },
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

  return selectors.map((selector) => ({
    selector,

    count:
      safeQsa(
        utils,
        selector,
        root
      ).length,

    first:
      getElementSnapshot(
        safeQs(
          utils,
          selector,
          root
        )
      ),
  }));
}

/* =========================================================
   EXPORT
========================================================= */

export default {
  DOM_VERSION,
  DOM_SELECTORS,

  createDomCache,
  cacheDom,
  validateRequiredDom,

  getDomNode,
  setDomNode,
  refreshDomNode,
  clearDomCache,

  getDomSnapshot,
  findDomCandidates,
};
