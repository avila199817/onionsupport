/* =========================================================
   Onion SPA - Core DOM
   Archivo: src/core/dom.js

   RESPONSABILIDADES:
   - centralizar cache nodos shell SPA
   - validar nodos mínimos layout
   - resolver referencias reutilizables
   - tolerar variantes de IDs/clases legacy
   - no romper boot si falta un nodo opcional

   HARDENING EXTREMO:
   - cache idempotente
   - aliases legacy/fallbacks robustos
   - validación estructural clara
   - no lanzar errores por DOM parcial
========================================================= */

/* =========================================================
   HELPERS
========================================================= */

function safeQs(utils, selector) {
  try {
    return utils?.qs?.(selector) || null;
  } catch {
    return null;
  }
}

function firstMatch(...values) {
  for (const value of values) {
    if (value) {
      return value;
    }
  }

  return null;
}

/* =========================================================
   FACTORY
========================================================= */

export function createDomCache() {
  return {
    html: null,
    body: null,
    themeColorMeta: null,

    layout: null,
    loader: null,
    sidebar: null,
    sidebarMenu: null,
    mainContent: null,
    viewContainer: null,

    topbar: null,
    topbarTitle: null,
    topbarViewContainer: null,
    tableheadContainer: null,

    searchInput: null,
    searchResults: null,

    userToggle: null,
    userDropdown: null,
    logoutBtn: null,

    sidebarToggle: null,
    sidebarMobileToggle: null,

    sidebarAvatar: null,
    sidebarName: null,
  };
}

/* =========================================================
   CACHE DOM
========================================================= */

export function cacheDom({
  dom,
  utils,
} = {}) {
  if (
    !dom ||
    !utils ||
    typeof document === "undefined"
  ) {
    return dom;
  }

  dom.html =
    document.documentElement || null;

  dom.body =
    document.body || null;

  dom.themeColorMeta =
    safeQs(
      utils,
      'meta[name="theme-color"]'
    );

  /* layout */
  dom.layout = firstMatch(
    safeQs(utils, ".layout"),
    safeQs(utils, "#app-layout"),
    safeQs(utils, "[data-app-layout='true']")
  );

  dom.loader = firstMatch(
    safeQs(utils, "#app-loader"),
    safeQs(utils, "[data-app-loader='true']")
  );

  dom.sidebar = firstMatch(
    safeQs(utils, ".sidebar"),
    safeQs(utils, "#sidebar"),
    safeQs(utils, "[data-sidebar='true']")
  );

  dom.sidebarMenu = firstMatch(
    safeQs(utils, "#sidebar-menu"),
    safeQs(utils, ".sidebar-menu"),
    safeQs(utils, "[data-sidebar-menu='true']")
  );

  dom.mainContent = firstMatch(
    safeQs(utils, "#app-content"),
    safeQs(utils, ".app-content"),
    safeQs(utils, "main")
  );

  dom.viewContainer = firstMatch(
    safeQs(utils, "#view-container"),
    safeQs(utils, "[data-view-container='true']")
  );

  /* topbar */
  dom.topbar = firstMatch(
    safeQs(utils, ".topbar"),
    safeQs(utils, "#topbar"),
    safeQs(utils, "[data-topbar='true']")
  );

  dom.topbarTitle = firstMatch(
    safeQs(utils, "#topbar-title"),
    safeQs(utils, "[data-topbar-title='true']")
  );

  dom.topbarViewContainer = firstMatch(
    safeQs(utils, "#topbarview-container"),
    safeQs(utils, "#topbar-view-container"),
    safeQs(utils, "[data-topbar-view-container='true']")
  );

  dom.tableheadContainer = firstMatch(
    safeQs(utils, "#tablehead-container"),
    safeQs(utils, "[data-tablehead-container='true']")
  );

  /* search */
  dom.searchInput = firstMatch(
    safeQs(utils, "#topbar-search"),
    safeQs(utils, "[data-topbar-search='true']")
  );

  dom.searchResults = firstMatch(
    safeQs(utils, "#topbar-search-results"),
    safeQs(utils, "[data-topbar-search-results='true']")
  );

  /* user */
  dom.userToggle = firstMatch(
    safeQs(utils, "#userToggle"),
    safeQs(utils, "#user-toggle"),
    safeQs(utils, "[data-user-toggle='true']")
  );

  dom.userDropdown = firstMatch(
    safeQs(utils, "#userDropdown"),
    safeQs(utils, "#user-dropdown"),
    safeQs(utils, "[data-user-dropdown='true']")
  );

  dom.logoutBtn = firstMatch(
    safeQs(utils, "#logoutBtn"),
    safeQs(utils, "#logout-button"),
    safeQs(utils, "[data-logout-button='true']")
  );

  /* sidebar actions */
  dom.sidebarToggle = firstMatch(
    safeQs(utils, "#toggleSidebar"),
    safeQs(utils, "#sidebar-toggle"),
    safeQs(utils, "[data-sidebar-toggle='true']")
  );

  dom.sidebarMobileToggle = firstMatch(
    safeQs(utils, "#toggleSidebarMobile"),
    safeQs(utils, "#sidebar-mobile-toggle"),
    safeQs(utils, "[data-sidebar-mobile-toggle='true']")
  );

  dom.sidebarAvatar = firstMatch(
    safeQs(utils, "#sidebar-avatar"),
    safeQs(utils, "#sidebarAvatar"),
    safeQs(utils, "[data-sidebar-avatar='true']")
  );

  dom.sidebarName = firstMatch(
    safeQs(utils, "#sidebar-name"),
    safeQs(utils, "#sidebarName"),
    safeQs(utils, "[data-sidebar-name='true']")
  );

  return dom;
}

/* =========================================================
   VALIDATION
========================================================= */

export function validateRequiredDom({
  dom,
  utils,
} = {}) {
  const required = [
    ["body", dom?.body],
    ["layout", dom?.layout],
    ["mainContent", dom?.mainContent],
    ["viewContainer", dom?.viewContainer],
  ];

  const missing = required
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    utils?.warn?.(
      "Faltan nodos importantes del layout:",
      missing
    );
  }

  return missing;
}
