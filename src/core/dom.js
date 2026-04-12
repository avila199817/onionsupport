/* =========================================================
   Onion SPA - Core DOM
   Archivo: src/core/dom.js

   Responsabilidades:
   - centralizar cache nodos shell SPA
   - validar nodos mínimos layout
   - resolver referencias reutilizables
========================================================= */

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
}) {
  if (
    !dom ||
    !utils ||
    typeof document ===
      "undefined"
  ) {
    return dom;
  }

  const qs = (
    selector
  ) =>
    utils.qs(
      selector
    );

  dom.html =
    document.documentElement ??
    null;

  dom.body =
    document.body ??
    null;

  dom.themeColorMeta =
    qs(
      'meta[name="theme-color"]'
    );

  /* layout */
  dom.layout =
    qs(".layout");

  dom.loader =
    qs("#app-loader");

  dom.sidebar =
    qs(".sidebar");

  dom.sidebarMenu =
    qs(
      "#sidebar-menu"
    ) ||
    qs(
      ".sidebar-menu"
    );

  dom.mainContent =
    qs(
      "#app-content"
    );

  dom.viewContainer =
    qs(
      "#view-container"
    );

  /* topbar */
  dom.topbar =
    qs(".topbar");

  dom.topbarTitle =
    qs(
      "#topbar-title"
    );

  dom.topbarViewContainer =
    qs(
      "#topbarview-container"
    );

  dom.tableheadContainer =
    qs(
      "#tablehead-container"
    );

  /* search */
  dom.searchInput =
    qs(
      "#topbar-search"
    );

  dom.searchResults =
    qs(
      "#topbar-search-results"
    );

  /* user */
  dom.userToggle =
    qs("#userToggle");

  dom.userDropdown =
    qs("#userDropdown");

  dom.logoutBtn =
    qs("#logoutBtn");

  /* sidebar actions */
  dom.sidebarToggle =
    qs(
      "#toggleSidebar"
    );

  dom.sidebarMobileToggle =
    qs(
      "#toggleSidebarMobile"
    );

  dom.sidebarAvatar =
    qs(
      "#sidebar-avatar"
    );

  dom.sidebarName =
    qs(
      "#sidebar-name"
    );

  return dom;
}

/* =========================================================
   VALIDATION
========================================================= */
export function validateRequiredDom({
  dom,
  utils,
}) {
  const required = [
    [
      "body",
      dom?.body,
    ],
    [
      "layout",
      dom?.layout,
    ],
    [
      "mainContent",
      dom?.mainContent,
    ],
    [
      "viewContainer",
      dom?.viewContainer,
    ],
  ];

  const missing =
    required
      .filter(
        ([, value]) =>
          !value
      )
      .map(
        ([key]) =>
          key
      );

  if (
    missing.length >
    0
  ) {
    utils?.warn?.(
      "Faltan nodos importantes del layout:",
      missing
    );
  }

  return missing;
}
