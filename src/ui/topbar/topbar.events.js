/* =========================================================
   Onion SPA - Topbar Events
   Archivo: src/ui/topbar/topbar.events.js

   Responsabilidades:
   - gestionar handlers DOM del topbar
   - gestionar handlers del buscador
   - sincronizar topbar ante eventos de app / router
   - bindear eventos DOM y AppCore cleanup-safe
========================================================= */

import {
  TOPBAR_SEARCH_CONFIG,
  normalizeQuery,
  getCurrentPublicPath,
} from "./topbar.helpers.js";

import {
  clearSearchDebounce,
  hideResultsContainer,
  updateActiveItem,
  updateActiveVisuals,
  goToResult,
  runSearch,
} from "./topbar.search.js";

export function createTopbarEventHandlers({
  AppCore,
  Router,
  runtime,
  getDom,
  syncTitle,
  setMobileToggleState,
  syncFixedTopbarOffset,
  closeSidebarMobile,
  toggleSidebarMobile,
}) {
  function handleMobileToggleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    toggleSidebarMobile();
  }

  function handleOutsideSidebarClick(event) {
    const { sidebar, mobileToggle } = getDom();
    if (!sidebar || !mobileToggle) return;

    const isMobile = window.matchMedia(
      `(max-width: ${TOPBAR_SEARCH_CONFIG.mobileBreakpoint}px)`
    ).matches;

    if (!isMobile) return;

    const isOpen =
      sidebar.classList.contains("open") ||
      sidebar.classList.contains("is-open");

    if (!isOpen) return;

    const clickedSidebar = event.target?.closest?.("#sidebar, .sidebar");
    const clickedToggle = event.target?.closest?.("#toggleSidebarMobile");

    if (clickedSidebar || clickedToggle) {
      return;
    }

    closeSidebarMobile();
  }

  function handleViewportResize() {
    const isMobile = window.matchMedia(
      `(max-width: ${TOPBAR_SEARCH_CONFIG.mobileBreakpoint}px)`
    ).matches;

    if (!isMobile) {
      closeSidebarMobile();
    } else {
      setMobileToggleState();
    }

    syncFixedTopbarOffset();
  }

  function handleSearchInput() {
    const { searchInput } = getDom();
    const value = normalizeQuery(searchInput?.value || "");

    clearSearchDebounce(runtime);

    if (!value) {
      hideResultsContainer(runtime, getDom);
      return;
    }

    runtime.searchDebounceTimer = window.setTimeout(() => {
      runSearch({
        AppCore,
        Router,
        runtime,
        getDom,
        closeSidebarMobile,
        query: value,
      });
    }, TOPBAR_SEARCH_CONFIG.debounceMs);
  }

  function handleSearchFocus() {
    const { searchInput } = getDom();
    const value = normalizeQuery(searchInput?.value || "");

    if (value.length >= TOPBAR_SEARCH_CONFIG.minQueryLength) {
      runSearch({
        AppCore,
        Router,
        runtime,
        getDom,
        closeSidebarMobile,
        query: value,
      });
      return;
    }

    hideResultsContainer(runtime, getDom);
  }

  function handleSearchKeydown(event) {
    const { searchResults, searchInput } = getDom();
    if (!searchInput || !searchResults) return;
    if (document.activeElement !== searchInput) return;

    const items = Array.from(searchResults.querySelectorAll(".search-result"));

    if (!items.length) {
      if (event.key === "Escape") {
        hideResultsContainer(runtime, getDom);
        searchInput.blur();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      runtime.activeIndex = Math.min(runtime.activeIndex + 1, items.length - 1);
      updateActiveItem(runtime, items);
      updateActiveVisuals(runtime, getDom);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      runtime.activeIndex = Math.max(runtime.activeIndex - 1, 0);
      updateActiveItem(runtime, items);
      updateActiveVisuals(runtime, getDom);
      return;
    }

    if (event.key === "Enter") {
      if (runtime.activeIndex >= 0 && runtime.currentItems[runtime.activeIndex]) {
        event.preventDefault();
        goToResult({
          AppCore,
          Router,
          runtime,
          getDom,
          closeSidebarMobile,
          item: runtime.currentItems[runtime.activeIndex],
        });
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      hideResultsContainer(runtime, getDom);
      searchInput.blur();
    }
  }

  function handleSearchOutsideClick(event) {
    const { searchWrap } = getDom();
    if (!searchWrap) return;

    if (event.target?.closest?.(".topbar-search-wrap")) {
      return;
    }

    hideResultsContainer(runtime, getDom);
  }

  function handleRouteVisualSync() {
    syncTitle(getCurrentPublicPath(AppCore));
    setMobileToggleState();
    syncFixedTopbarOffset();
    closeSidebarMobile();
  }

  return {
    handleMobileToggleClick,
    handleOutsideSidebarClick,
    handleViewportResize,
    handleSearchInput,
    handleSearchFocus,
    handleSearchKeydown,
    handleSearchOutsideClick,
    handleRouteVisualSync,
  };
}

export function bindTopbarDomEvents({
  AppCore,
  scope,
  getDom,
  handlers,
}) {
  const { mobileToggle } = getDom();

  if (mobileToggle) {
    AppCore.cleanup.on(
      scope,
      mobileToggle,
      "click",
      handlers.handleMobileToggleClick
    );
  }

  AppCore.cleanup.on(
    scope,
    document,
    "click",
    handlers.handleOutsideSidebarClick
  );

  AppCore.cleanup.on(
    scope,
    window,
    "resize",
    handlers.handleViewportResize
  );

  return true;
}

export function bindSearchDomEvents({
  AppCore,
  scope,
  getDom,
  handlers,
}) {
  const { searchInput, searchResults } = getDom();

  if (!searchInput || !searchResults) {
    return false;
  }

  searchResults.setAttribute("role", "listbox");
  searchResults.setAttribute("aria-hidden", "true");
  searchInput.setAttribute("aria-expanded", "false");

  AppCore.cleanup.on(scope, searchInput, "input", handlers.handleSearchInput);
  AppCore.cleanup.on(scope, searchInput, "focus", handlers.handleSearchFocus);
  AppCore.cleanup.on(scope, document, "keydown", handlers.handleSearchKeydown);
  AppCore.cleanup.on(
    scope,
    document,
    "click",
    handlers.handleSearchOutsideClick
  );

  return true;
}

export function bindTopbarAppEvents({
  AppCore,
  scope,
  searchScope,
  getDom,
  handlers,
  hideResults,
  syncTitle,
  setMobileToggleState,
  syncFixedTopbarOffset,
  closeSidebarMobile,
}) {
  AppCore.cleanup.event(scope, "router:before-render", ({ detail }) => {
    const nextPath =
      detail?.path ||
      detail?.publicPath ||
      detail?.canonicalPath ||
      getCurrentPublicPath(AppCore);

    syncTitle(nextPath);
  });

  AppCore.cleanup.event(scope, "router:rendered", () => {
    handlers.handleRouteVisualSync();
  });

  AppCore.cleanup.event(scope, "app:route:rendered", () => {
    handlers.handleRouteVisualSync();
  });

  AppCore.cleanup.event(scope, "app:route:change", () => {
    hideResults();
    syncTitle(getCurrentPublicPath(AppCore));
    closeSidebarMobile();
    setMobileToggleState();
    syncFixedTopbarOffset();
  });

  AppCore.cleanup.event(scope, "app:public-path:change", () => {
    hideResults();
    syncTitle(getCurrentPublicPath(AppCore));
    syncFixedTopbarOffset();
  });

  AppCore.cleanup.event(scope, "router:shell:change", () => {
    setMobileToggleState();
    syncFixedTopbarOffset();
  });

  AppCore.cleanup.event(scope, "app:user-ui:sync", () => {
    syncFixedTopbarOffset();
  });

  AppCore.cleanup.event(scope, "sidebar:state:synced", () => {
    window.setTimeout(() => {
      setMobileToggleState();
      syncFixedTopbarOffset();
    }, 0);
  });

  AppCore.cleanup.event(scope, "app:theme:change", () => {
    window.setTimeout(syncFixedTopbarOffset, 0);
  });

  return { scope, searchScope, getDom };
}
