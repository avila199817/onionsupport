/* =========================================================
   Onion SPA - Core DOM
   Archivo: src/core/dom.js

   Responsabilidades:
   - centralizar cache de nodos del shell SPA
   - validar nodos mínimos del layout
   - resolver referencias DOM reutilizables
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

export function cacheDom({
  dom,
  utils,
}) {
  if (!dom || !utils || typeof document === "undefined") return dom;

  dom.html = document.documentElement || null;
  dom.body = document.body || null;
  dom.themeColorMeta = utils.qs('meta[name="theme-color"]');

  dom.layout = utils.qs(".layout");
  dom.loader = utils.qs("#app-loader");
  dom.sidebar = utils.qs(".sidebar");
  dom.sidebarMenu = utils.qs("#sidebar-menu") || utils.qs(".sidebar-menu");
  dom.mainContent = utils.qs("#app-content");
  dom.viewContainer = utils.qs("#view-container");

  dom.topbar = utils.qs(".topbar");
  dom.topbarTitle = utils.qs("#topbar-title");
  dom.topbarViewContainer = utils.qs("#topbarview-container");
  dom.tableheadContainer = utils.qs("#tablehead-container");

  dom.searchInput = utils.qs("#topbar-search");
  dom.searchResults = utils.qs("#topbar-search-results");

  dom.userToggle = utils.qs("#userToggle");
  dom.userDropdown = utils.qs("#userDropdown");
  dom.logoutBtn = utils.qs("#logoutBtn");
  dom.sidebarToggle = utils.qs("#toggleSidebar");
  dom.sidebarMobileToggle = utils.qs("#toggleSidebarMobile");
  dom.sidebarAvatar = utils.qs("#sidebar-avatar");
  dom.sidebarName = utils.qs("#sidebar-name");

  return dom;
}

export function validateRequiredDom({
  dom,
  utils,
}) {
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
    utils?.warn?.("Faltan nodos importantes del layout:", missing);
  }

  return missing;
}
