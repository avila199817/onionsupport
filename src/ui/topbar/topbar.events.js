/* =========================================================
   Onion SPA - Topbar Events
   Archivo: src/ui/topbar/topbar.events.js

   Responsabilidades:
   - gestionar handlers DOM del topbar
   - gestionar handlers del buscador
   - navegación por teclado del search
   - apertura async de resultados search
   - evitar doble apertura / doble bind
   - sincronizar topbar ante eventos de app / router
   - bindear eventos DOM y AppCore cleanup-safe
   - cerrar sidebar mobile de forma segura
   - mantener ARIA del buscador
========================================================= */

import {
  TOPBAR_SEARCH_CONFIG,
  normalizeQuery,
  getCurrentPublicPath,
} from "./topbar.helpers.js";

import {
  clearSearchDebounce,
  abortSearch,
  hideResultsContainer,
  updateActiveItem,
  updateActiveVisuals,
  goToResult,
  runSearch,
} from "./topbar.search.js";

/* =========================================================
   HELPERS
========================================================= */

function safeCall(fn, ...args) {
  if (typeof fn !== "function") return undefined;

  try {
    return fn(...args);
  } catch {
    return undefined;
  }
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isElement(value) {
  return Boolean(value && value.nodeType === 1);
}

function isEditableTarget(target) {
  if (!target) return false;

  const tag = safeText(target.tagName, "").toLowerCase();

  if (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select"
  ) {
    return true;
  }

  if (target.isContentEditable) {
    return true;
  }

  return Boolean(target.closest?.("[contenteditable='true']"));
}

function isPrimaryPointerEvent(event) {
  if (!event) return true;

  if ("button" in event && event.button !== 0) {
    return false;
  }

  return true;
}

function getEventDetail(payload) {
  return payload?.detail || payload || {};
}

function ensureId(node, fallback = "") {
  if (!node) return "";

  const existing = safeText(node.id, "");

  if (existing) return existing;

  const id = fallback || `topbar-${Math.random().toString(36).slice(2)}`;

  try {
    node.id = id;
  } catch {
    return "";
  }

  return id;
}

function getSearchValue(getDom) {
  const { searchInput } = getDom();

  return normalizeQuery(searchInput?.value || "");
}

function getSearchItems(getDom) {
  const { searchResults } = getDom();

  if (!searchResults) return [];

  return Array.from(searchResults.querySelectorAll(".search-result"));
}

function isResultsOpen(getDom) {
  const { searchResults } = getDom();

  if (!searchResults) return false;

  return (
    searchResults.classList.contains("active") ||
    searchResults.hidden === false ||
    searchResults.getAttribute("aria-hidden") === "false"
  );
}

function isInsideSearch(event, getDom) {
  const target = event?.target;
  if (!target) return false;

  const { searchWrap, searchInput, searchResults } = getDom();

  return Boolean(
    searchWrap?.contains?.(target) ||
      searchInput?.contains?.(target) ||
      searchResults?.contains?.(target) ||
      target.closest?.(".topbar-search-wrap") ||
      target.closest?.(".topbar-search-results")
  );
}

function isSearchInteractionActive(getDom) {
  const { searchInput, searchResults, searchWrap } = getDom();
  const active = document.activeElement;

  if (!active) return false;

  return Boolean(
    active === searchInput ||
      searchResults?.contains?.(active) ||
      searchWrap?.contains?.(active)
  );
}

function clampActiveIndex(runtime, items = []) {
  if (!items.length) {
    runtime.activeIndex = -1;
    return -1;
  }

  if (runtime.activeIndex < 0) {
    runtime.activeIndex = 0;
    return runtime.activeIndex;
  }

  if (runtime.activeIndex >= items.length) {
    runtime.activeIndex = items.length - 1;
  }

  return runtime.activeIndex;
}

function setActiveIndex(runtime, getDom, nextIndex = -1) {
  const items = getSearchItems(getDom);

  if (!items.length) {
    runtime.activeIndex = -1;
    updateActiveVisuals(runtime, getDom);
    return -1;
  }

  const max = items.length - 1;

  runtime.activeIndex = Math.max(0, Math.min(nextIndex, max));

  updateActiveItem(runtime, items);
  updateActiveVisuals(runtime, getDom);

  return runtime.activeIndex;
}

function moveActiveIndex(runtime, getDom, direction = 1) {
  const items = getSearchItems(getDom);

  if (!items.length) {
    runtime.activeIndex = -1;
    return -1;
  }

  const max = items.length - 1;

  if (runtime.activeIndex < 0) {
    runtime.activeIndex = direction > 0 ? 0 : max;
  } else {
    runtime.activeIndex += direction;

    if (runtime.activeIndex > max) runtime.activeIndex = 0;
    if (runtime.activeIndex < 0) runtime.activeIndex = max;
  }

  updateActiveItem(runtime, items);
  updateActiveVisuals(runtime, getDom);

  return runtime.activeIndex;
}

function clearSearchInput(getDom) {
  const { searchInput } = getDom();

  if (!searchInput) return false;

  searchInput.value = "";
  return true;
}

function blurSearchInput(getDom) {
  const { searchInput } = getDom();

  try {
    searchInput?.blur?.();
  } catch {
    /* noop */
  }
}

function focusSearchInput(getDom, options = {}) {
  const { searchInput } = getDom();

  if (!searchInput) return false;

  try {
    searchInput.focus({
      preventScroll: options.preventScroll !== false,
    });

    if (options.select) {
      searchInput.select?.();
    }

    return true;
  } catch {
    try {
      searchInput.focus();
      return true;
    } catch {
      return false;
    }
  }
}

function hideSearch(runtime, getDom, options = {}) {
  clearSearchDebounce(runtime);
  abortSearch(runtime);

  hideResultsContainer(runtime, getDom);

  if (options.blur) {
    blurSearchInput(getDom);
  }

  if (options.clearInput) {
    clearSearchInput(getDom);
  }

  return true;
}

function scheduleSearch({
  AppCore,
  Router,
  runtime,
  getDom,
  closeSidebarMobile,
  query = "",
  immediate = false,
}) {
  const value = normalizeQuery(query);

  clearSearchDebounce(runtime);

  if (!value || value.length < TOPBAR_SEARCH_CONFIG.minQueryLength) {
    hideResultsContainer(runtime, getDom);
    return false;
  }

  const execute = () => {
    if (runtime.isComposingSearch) return;

    runSearch({
      AppCore,
      Router,
      runtime,
      getDom,
      closeSidebarMobile,
      query: value,
    });
  };

  if (immediate) {
    execute();
    return true;
  }

  runtime.searchDebounceTimer = window.setTimeout(
    execute,
    TOPBAR_SEARCH_CONFIG.debounceMs
  );

  return true;
}

async function openSearchItem({
  AppCore,
  Router,
  runtime,
  getDom,
  closeSidebarMobile,
  item,
}) {
  if (!item || runtime.openingSearchResult) {
    return false;
  }

  runtime.openingSearchResult = true;

  try {
    await goToResult({
      AppCore,
      Router,
      runtime,
      getDom,
      closeSidebarMobile,
      item,
    });

    return true;
  } finally {
    runtime.openingSearchResult = false;
  }
}

function setSearchAria(getDom) {
  const { searchInput, searchResults } = getDom();

  if (!searchInput || !searchResults) return false;

  const inputId = ensureId(searchInput, "topbar-search-input");
  const resultsId = ensureId(searchResults, "topbar-search-results");

  searchResults.setAttribute("role", "listbox");
  searchResults.setAttribute("aria-hidden", "true");

  searchInput.setAttribute("role", "combobox");
  searchInput.setAttribute("aria-autocomplete", "list");
  searchInput.setAttribute("aria-haspopup", "listbox");
  searchInput.setAttribute("aria-expanded", "false");
  searchInput.setAttribute("aria-controls", resultsId);

  if (inputId) {
    searchResults.setAttribute("aria-labelledby", inputId);
  }

  try {
    searchInput.setAttribute("autocomplete", "off");
    searchInput.setAttribute("autocapitalize", "off");
    searchInput.setAttribute("spellcheck", "false");
  } catch {
    /* noop */
  }

  return true;
}

function closeSidebarIfOpen(closeSidebarMobile) {
  const body = document.body;

  if (!body?.classList?.contains?.("sidebar-open")) {
    return false;
  }

  safeCall(closeSidebarMobile);
  return true;
}

function isInsideSidebarOrToggle(event) {
  const target = event?.target;

  if (!target) return false;

  return Boolean(
    target.closest?.(".sidebar") ||
      target.closest?.("[data-sidebar]") ||
      target.closest?.(".topbar-mobile-toggle") ||
      target.closest?.("[data-sidebar-toggle]")
  );
}

function bindCleanupDomEvent(AppCore, scope, target, eventName, handler) {
  if (!target || typeof handler !== "function") return false;

  try {
    AppCore?.cleanup?.on?.(scope, target, eventName, handler);
    return true;
  } catch {
    /* noop */
  }

  try {
    target.addEventListener(eventName, handler);
    return true;
  } catch {
    return false;
  }
}

function bindCleanupAppEvent(AppCore, scope, eventName, handler) {
  if (!eventName || typeof handler !== "function") return false;

  try {
    AppCore?.cleanup?.event?.(scope, eventName, handler);
    return true;
  } catch {
    /* noop */
  }

  try {
    AppCore?.events?.on?.(eventName, handler);
    return true;
  } catch {
    /* noop */
  }

  try {
    window.addEventListener(eventName, handler);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   HANDLERS FACTORY
========================================================= */

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
  syncDomCache,
}) {
  function handleMobileToggleClick(event) {
    event.preventDefault();
    event.stopPropagation();

    safeCall(toggleSidebarMobile);
    safeCall(setMobileToggleState);
    safeCall(syncFixedTopbarOffset);
  }

  function handleOutsideSidebarClick(event) {
    if (!isPrimaryPointerEvent(event)) return;

    if (isInsideSidebarOrToggle(event)) {
      return;
    }

    closeSidebarIfOpen(closeSidebarMobile);
  }

  function handleViewportResize() {
    safeCall(syncDomCache);
    safeCall(setMobileToggleState);
    safeCall(syncFixedTopbarOffset);

    if (isResultsOpen(getDom)) {
      updateActiveVisuals(runtime, getDom);
    }
  }

  function handleSearchCompositionStart() {
    runtime.isComposingSearch = true;
  }

  function handleSearchCompositionEnd() {
    runtime.isComposingSearch = false;
    handleSearchInput();
  }

  function handleSearchInput() {
    if (runtime.isComposingSearch) return;

    const value = getSearchValue(getDom);

    scheduleSearch({
      AppCore,
      Router,
      runtime,
      getDom,
      closeSidebarMobile,
      query: value,
      immediate: false,
    });
  }

  function handleSearchFocus() {
    const value = getSearchValue(getDom);

    if (value.length >= TOPBAR_SEARCH_CONFIG.minQueryLength) {
      scheduleSearch({
        AppCore,
        Router,
        runtime,
        getDom,
        closeSidebarMobile,
        query: value,
        immediate: true,
      });

      return;
    }

    hideResultsContainer(runtime, getDom);
  }

  function handleSearchPointerDown(event) {
    if (!isPrimaryPointerEvent(event)) return;

    /*
      Evita que el input pierda foco antes de que el click del resultado
      pueda ejecutar goToResult correctamente.
    */
    const result = event.target?.closest?.(".search-result");

    if (result) {
      event.preventDefault();
    }
  }

  async function handleSearchKeydown(event) {
    const { searchInput } = getDom();

    if (!searchInput) return;

    const key = event.key;
    const active = isSearchInteractionActive(getDom);

    /*
      Atajos globales:
      - Ctrl/Cmd + K: foco en search
      - "/" fuera de inputs: foco en search
    */
    if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === "k") {
      event.preventDefault();
      focusSearchInput(getDom, {
        select: true,
      });
      return;
    }

    if (
      key === "/" &&
      !active &&
      !isEditableTarget(event.target)
    ) {
      event.preventDefault();
      focusSearchInput(getDom);
      return;
    }

    if (!active) return;

    const items = getSearchItems(getDom);

    if (key === "ArrowDown") {
      event.preventDefault();

      if (!items.length) {
        const value = getSearchValue(getDom);

        scheduleSearch({
          AppCore,
          Router,
          runtime,
          getDom,
          closeSidebarMobile,
          query: value,
          immediate: true,
        });

        return;
      }

      moveActiveIndex(runtime, getDom, 1);
      return;
    }

    if (key === "ArrowUp") {
      event.preventDefault();

      if (!items.length) return;

      moveActiveIndex(runtime, getDom, -1);
      return;
    }

    if (key === "Home" && items.length) {
      event.preventDefault();
      setActiveIndex(runtime, getDom, 0);
      return;
    }

    if (key === "End" && items.length) {
      event.preventDefault();
      setActiveIndex(runtime, getDom, items.length - 1);
      return;
    }

    if (key === "Enter") {
      const hasResult =
        items.length &&
        safeArray(runtime.currentItems).length;

      if (!hasResult) return;

      event.preventDefault();

      const index = runtime.activeIndex >= 0
        ? runtime.activeIndex
        : clampActiveIndex(runtime, items);

      const item = runtime.currentItems[index];

      if (!item) return;

      await openSearchItem({
        AppCore,
        Router,
        runtime,
        getDom,
        closeSidebarMobile,
        item,
      });

      return;
    }

    if (key === "Escape") {
      event.preventDefault();

      hideSearch(runtime, getDom, {
        blur: true,
      });

      return;
    }

    if (key === "Tab") {
      window.setTimeout(() => {
        if (!isSearchInteractionActive(getDom)) {
          hideResultsContainer(runtime, getDom);
        }
      }, 0);
    }
  }

  function handleSearchOutsideClick(event) {
    if (!isPrimaryPointerEvent(event)) return;

    if (isInsideSearch(event, getDom)) {
      return;
    }

    hideResultsContainer(runtime, getDom);
  }

  function handleSearchResultsMouseMove(event) {
    const result = event.target?.closest?.(".search-result");

    if (!result) return;

    const idx = Number(result.dataset.index);

    if (!Number.isFinite(idx)) return;

    if (runtime.activeIndex === idx) return;

    runtime.activeIndex = idx;
    updateActiveVisuals(runtime, getDom);
  }

  function handleSearchResultsClick(event) {
    /*
      El click principal del resultado ya lo registra renderResults().
      Este handler solo evita propagaciones raras hacia document/click.
    */
    const result = event.target?.closest?.(".search-result");

    if (!result) return;

    event.stopPropagation();
  }

  function handleRouteVisualSync() {
    safeCall(syncDomCache);
    safeCall(syncTitle, getCurrentPublicPath(AppCore));
    safeCall(setMobileToggleState);
    safeCall(syncFixedTopbarOffset);
  }

  function handleSearchCloseEvent() {
    hideSearch(runtime, getDom, {
      blur: true,
    });
  }

  function handleSearchFocusEvent() {
    focusSearchInput(getDom, {
      select: true,
    });
  }

  function handleSearchClearEvent() {
    hideSearch(runtime, getDom, {
      blur: true,
      clearInput: true,
    });
  }

  return {
    handleMobileToggleClick,
    handleOutsideSidebarClick,
    handleViewportResize,

    handleSearchCompositionStart,
    handleSearchCompositionEnd,
    handleSearchInput,
    handleSearchFocus,
    handleSearchPointerDown,
    handleSearchKeydown,
    handleSearchOutsideClick,
    handleSearchResultsMouseMove,
    handleSearchResultsClick,

    handleRouteVisualSync,

    handleSearchCloseEvent,
    handleSearchFocusEvent,
    handleSearchClearEvent,
  };
}

/* =========================================================
   DOM EVENTS
========================================================= */

export function bindTopbarDomEvents({
  AppCore,
  scope,
  getDom,
  handlers,
}) {
  const { mobileToggle } = getDom();

  if (mobileToggle) {
    bindCleanupDomEvent(
      AppCore,
      scope,
      mobileToggle,
      "click",
      handlers.handleMobileToggleClick
    );

    try {
      mobileToggle.setAttribute("aria-controls", "sidebar");
      mobileToggle.setAttribute(
        "aria-expanded",
        String(document.body?.classList?.contains?.("sidebar-open") || false)
      );
    } catch {
      /* noop */
    }
  }

  bindCleanupDomEvent(
    AppCore,
    scope,
    document,
    "click",
    handlers.handleOutsideSidebarClick
  );

  bindCleanupDomEvent(
    AppCore,
    scope,
    window,
    "resize",
    handlers.handleViewportResize
  );

  bindCleanupDomEvent(
    AppCore,
    scope,
    window,
    "orientationchange",
    handlers.handleViewportResize
  );

  return true;
}

/* =========================================================
   SEARCH DOM EVENTS
========================================================= */

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

  setSearchAria(getDom);

  bindCleanupDomEvent(
    AppCore,
    scope,
    searchInput,
    "compositionstart",
    handlers.handleSearchCompositionStart
  );

  bindCleanupDomEvent(
    AppCore,
    scope,
    searchInput,
    "compositionend",
    handlers.handleSearchCompositionEnd
  );

  bindCleanupDomEvent(
    AppCore,
    scope,
    searchInput,
    "input",
    handlers.handleSearchInput
  );

  bindCleanupDomEvent(
    AppCore,
    scope,
    searchInput,
    "focus",
    handlers.handleSearchFocus
  );

  bindCleanupDomEvent(
    AppCore,
    scope,
    searchResults,
    "pointerdown",
    handlers.handleSearchPointerDown
  );

  bindCleanupDomEvent(
    AppCore,
    scope,
    searchResults,
    "mousedown",
    handlers.handleSearchPointerDown
  );

  bindCleanupDomEvent(
    AppCore,
    scope,
    searchResults,
    "mousemove",
    handlers.handleSearchResultsMouseMove
  );

  bindCleanupDomEvent(
    AppCore,
    scope,
    searchResults,
    "click",
    handlers.handleSearchResultsClick
  );

  bindCleanupDomEvent(
    AppCore,
    scope,
    document,
    "keydown",
    handlers.handleSearchKeydown
  );

  bindCleanupDomEvent(
    AppCore,
    scope,
    document,
    "click",
    handlers.handleSearchOutsideClick
  );

  return true;
}

/* =========================================================
   APP / ROUTER EVENTS
========================================================= */

export function bindTopbarAppEvents({
  AppCore,
  scope,
  getDom,
  handlers,
  hideResults,
  syncTitle,
  setMobileToggleState,
  syncFixedTopbarOffset,
  closeSidebarMobile,
  syncDomCache,
  rebind,
}) {
  bindCleanupAppEvent(AppCore, scope, "router:before-render", (payload) => {
    const detail = getEventDetail(payload);

    const nextPath =
      detail?.path ||
      detail?.publicPath ||
      detail?.canonicalPath ||
      getCurrentPublicPath(AppCore);

    safeCall(syncTitle, nextPath);
  });

  bindCleanupAppEvent(AppCore, scope, "router:rendered", () => {
    handlers.handleRouteVisualSync();
    safeCall(rebind);
  });

  bindCleanupAppEvent(AppCore, scope, "app:route:rendered", () => {
    handlers.handleRouteVisualSync();
    safeCall(rebind);
  });

  bindCleanupAppEvent(AppCore, scope, "app:route:change", () => {
    safeCall(syncDomCache);
    safeCall(hideResults);
    safeCall(syncTitle, getCurrentPublicPath(AppCore));
    safeCall(closeSidebarMobile);
    safeCall(setMobileToggleState);
    safeCall(syncFixedTopbarOffset);
  });

  bindCleanupAppEvent(AppCore, scope, "app:public-path:change", () => {
    safeCall(syncDomCache);
    safeCall(hideResults);
    safeCall(syncTitle, getCurrentPublicPath(AppCore));
    safeCall(syncFixedTopbarOffset);
  });

  bindCleanupAppEvent(AppCore, scope, "router:shell:change", () => {
    safeCall(syncDomCache);
    safeCall(setMobileToggleState);
    safeCall(syncFixedTopbarOffset);
  });

  bindCleanupAppEvent(AppCore, scope, "app:user-ui:sync", () => {
    safeCall(syncDomCache);
    safeCall(syncFixedTopbarOffset);
  });

  bindCleanupAppEvent(AppCore, scope, "sidebar:state:synced", () => {
    window.setTimeout(() => {
      safeCall(syncDomCache);
      safeCall(setMobileToggleState);
      safeCall(syncFixedTopbarOffset);

      const { mobileToggle } = getDom();

      try {
        mobileToggle?.setAttribute(
          "aria-expanded",
          String(document.body?.classList?.contains?.("sidebar-open") || false)
        );
      } catch {
        /* noop */
      }
    }, 0);
  });

  bindCleanupAppEvent(AppCore, scope, "app:theme:change", () => {
    window.setTimeout(() => {
      safeCall(syncDomCache);
      safeCall(syncFixedTopbarOffset);
    }, 0);
  });

  bindCleanupAppEvent(AppCore, scope, "app:lang:change", () => {
    window.setTimeout(() => {
      safeCall(syncDomCache);
      safeCall(syncTitle, getCurrentPublicPath(AppCore));
      safeCall(syncFixedTopbarOffset);
    }, 0);
  });

  /*
    Eventos públicos para controlar el buscador desde otros módulos.
  */
  bindCleanupAppEvent(
    AppCore,
    scope,
    "topbar:search:close",
    handlers.handleSearchCloseEvent
  );

  bindCleanupAppEvent(
    AppCore,
    scope,
    "topbar:search:focus",
    handlers.handleSearchFocusEvent
  );

  bindCleanupAppEvent(
    AppCore,
    scope,
    "topbar:search:clear",
    handlers.handleSearchClearEvent
  );

  return true;
}
