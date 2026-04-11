/* =========================================================
   Onion SPA - Topbar DOM
   Archivo: src/ui/topbar.dom.js

   Responsabilidades:
   - construir el template HTML del topbar
   - resolver el shell root del layout
   - montar el topbar en el DOM
   - resolver referencias DOM del topbar
   - sincronizar cache DOM en AppCore
========================================================= */

export function getTopbarTemplate() {
  return `
    <header class="topbar" id="topbar">
      <div class="topbar-left">
        <button
          type="button"
          class="topbar-mobile-toggle"
          id="toggleSidebarMobile"
          aria-label="Abrir navegación"
          aria-controls="sidebar-menu"
          aria-expanded="false"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 7h16"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <path
              d="M4 12h16"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <path
              d="M4 17h16"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
        </button>

        <h1 class="topbar-title" id="topbar-title">
          Onion Support
        </h1>
      </div>

      <div class="topbar-right">
        <div class="topbar-search-wrap">
          <svg
            class="topbar-search-icon"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="11"
              cy="11"
              r="7"
              stroke="currentColor"
              stroke-width="2"
            />
            <path
              d="M20 20l-3-3"
              stroke="currentColor"
              stroke-width="2"
            />
          </svg>

          <input
            type="search"
            id="topbar-search"
            class="topbar-search"
            placeholder="Buscar..."
            autocomplete="off"
            inputmode="search"
            aria-label="Buscar en la aplicación"
            aria-controls="topbar-search-results"
            aria-expanded="false"
            aria-autocomplete="list"
          >

          <div
            id="topbar-search-results"
            class="topbar-search-results"
            hidden
            aria-live="polite"
          ></div>
        </div>
      </div>
    </header>
  `;
}

export function getShellRootEl(AppCore) {
  return (
    AppCore.dom.appShell ||
    document.getElementById("app-shell") ||
    document.querySelector(".layout") ||
    document.body
  );
}

export function getMainContentEl(AppCore) {
  return (
    AppCore.dom.mainContent ||
    document.getElementById("main-content") ||
    document.querySelector(".main-content")
  );
}

export function mountTopbar(AppCore) {
  let topbar = document.getElementById("topbar");
  if (topbar) return topbar;

  const shellRoot = getShellRootEl(AppCore);
  if (!shellRoot) return null;

  const sidebar =
    AppCore.dom.sidebar ||
    document.getElementById("sidebar") ||
    document.querySelector(".sidebar");

  if (sidebar && sidebar.parentNode === shellRoot) {
    sidebar.insertAdjacentHTML("afterend", getTopbarTemplate());
  } else {
    shellRoot.insertAdjacentHTML("afterbegin", getTopbarTemplate());
  }

  return document.getElementById("topbar");
}

export function getTopbarDom(AppCore) {
  const topbar =
    AppCore.dom.topbar ||
    document.getElementById("topbar") ||
    document.querySelector(".topbar");

  const title =
    AppCore.dom.topbarTitle ||
    document.getElementById("topbar-title") ||
    document.querySelector("#topbar-title");

  const mobileToggle =
    AppCore.dom.mobileSidebarToggle ||
    AppCore.dom.toggleSidebarMobile ||
    document.getElementById("toggleSidebarMobile") ||
    document.querySelector("#toggleSidebarMobile");

  const sidebar =
    AppCore.dom.sidebar ||
    document.getElementById("sidebar") ||
    document.querySelector(".sidebar");

  const searchInput =
    AppCore.dom.searchInput ||
    document.getElementById("topbar-search") ||
    document.querySelector("#topbar-search");

  const searchResults =
    AppCore.dom.searchResults ||
    document.getElementById("topbar-search-results") ||
    document.querySelector("#topbar-search-results");

  const searchWrap =
    searchInput?.closest(".topbar-search-wrap") ||
    searchResults?.closest(".topbar-search-wrap") ||
    document.querySelector(".topbar-search-wrap");

  return {
    topbar,
    title,
    mobileToggle,
    sidebar,
    searchInput,
    searchResults,
    searchWrap,
  };
}

export function syncTopbarDomCache(AppCore) {
  const dom = getTopbarDom(AppCore);

  AppCore.dom.topbar = dom.topbar || null;
  AppCore.dom.topbarTitle = dom.title || null;
  AppCore.dom.mobileSidebarToggle = dom.mobileToggle || null;
  AppCore.dom.toggleSidebarMobile = dom.mobileToggle || null;
  AppCore.dom.searchInput = dom.searchInput || null;
  AppCore.dom.searchResults = dom.searchResults || null;

  return dom;
}
