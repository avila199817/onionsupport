/* =========================================================
   Onion SPA - Topbar Events
   Archivo: src/ui/topbar/topbar.events.js

   FINAL PRO SYSTEM · TOPBAR EVENTS / NO STORM / NO HARD REBIND · 10/10

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

   FIX CRÍTICO:
   - router:rendered NO fuerza rebind duro
   - app:route:rendered NO fuerza rebind duro
   - app:user-ui:sync NO dispara rebind
   - router:shell:state/change NO dispara rebind
   - app:lang:change NO dispara rebind
   - eventos de app hacen sync visual ligero
   - rebind recibido desde TopbarUI se llama solo como soft-rebind si falta DOM
   - listeners app usan cleanup/event bus con fallback sin duplicar intencionadamente
   - sin cleanup.run() desde este archivo
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
   CONSTANTS
========================================================= */

const VISUAL_SYNC_DELAY_MS =
  0;

const VISUAL_SYNC_SETTLED_MS =
  48;

const RESIZE_SYNC_DELAY_MS =
  80;

const SIDEBAR_SYNC_DELAY_MS =
  32;

const SOFT_REBIND_IF_DOM_MISSING_MS =
  24;

/* =========================================================
   HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function safeCall(fn, ...args) {
  if (!isFunction(fn)) {
    return undefined;
  }

  try {
    return fn(...args);
  } catch {
    return undefined;
  }
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

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function isElement(value) {
  return Boolean(
    value &&
    value.nodeType === 1
  );
}

function isConnected(node) {
  if (!node) {
    return false;
  }

  try {
    return Boolean(node.isConnected);
  } catch {}

  try {
    return document.contains(node);
  } catch {}

  return false;
}

function safeSetTimeout(callback, ms = 0) {
  if (!isFunction(callback)) {
    return null;
  }

  if (!isBrowser()) {
    try {
      callback();
    } catch {}

    return null;
  }

  try {
    return window.setTimeout(
      () => {
        try {
          callback();
        } catch {}
      },
      Math.max(0, Number(ms) || 0)
    );
  } catch {
    try {
      callback();
    } catch {}

    return null;
  }
}

function safeClearTimeout(timer) {
  if (!timer || !isBrowser()) {
    return false;
  }

  try {
    window.clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

function isEditableTarget(target) {
  if (!target) {
    return false;
  }

  const tag =
    safeText(target.tagName, "")
      .toLowerCase();

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

  return Boolean(
    target.closest?.("[contenteditable='true']")
  );
}

function isPrimaryPointerEvent(event) {
  if (!event) {
    return true;
  }

  if (
    "button" in event &&
    event.button !== 0
  ) {
    return false;
  }

  return true;
}

function getEventDetail(payload) {
  if (
    payload?.detail &&
    typeof payload.detail === "object"
  ) {
    return payload.detail;
  }

  if (
    payload?.payload &&
    typeof payload.payload === "object"
  ) {
    return payload.payload;
  }

  return safeObject(payload);
}

function ensureId(node, fallback = "") {
  if (!node) {
    return "";
  }

  const existing =
    safeText(node.id, "");

  if (existing) {
    return existing;
  }

  const id =
    fallback ||
    `topbar-${Math.random().toString(36).slice(2)}`;

  try {
    node.id = id;
  } catch {
    return "";
  }

  return id;
}

function getSearchValue(getDom) {
  const {
    searchInput,
  } = getDom();

  return normalizeQuery(
    searchInput?.value || ""
  );
}

function getSearchItems(getDom) {
  const {
    searchResults,
  } = getDom();

  if (!searchResults) {
    return [];
  }

  try {
    return Array.from(
      searchResults.querySelectorAll(".search-result")
    );
  } catch {
    return [];
  }
}

function isResultsOpen(getDom) {
  const {
    searchResults,
  } = getDom();

  if (!searchResults) {
    return false;
  }

  return (
    searchResults.classList.contains("active") ||
    searchResults.hidden === false ||
    searchResults.getAttribute("aria-hidden") === "false"
  );
}

function isInsideSearch(event, getDom) {
  const target =
    event?.target;

  if (!target) {
    return false;
  }

  const {
    searchWrap,
    searchInput,
    searchResults,
  } = getDom();

  return Boolean(
    searchWrap?.contains?.(target) ||
    searchInput?.contains?.(target) ||
    searchResults?.contains?.(target) ||
    target.closest?.(".topbar-search-wrap") ||
    target.closest?.(".topbar-search-results")
  );
}

function isSearchInteractionActive(getDom) {
  if (!isBrowser()) {
    return false;
  }

  const {
    searchInput,
    searchResults,
    searchWrap,
  } = getDom();

  const active =
    document.activeElement;

  if (!active) {
    return false;
  }

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
  const items =
    getSearchItems(getDom);

  if (!items.length) {
    runtime.activeIndex = -1;

    updateActiveVisuals(
      runtime,
      getDom
    );

    return -1;
  }

  const max =
    items.length - 1;

  runtime.activeIndex =
    Math.max(
      0,
      Math.min(nextIndex, max)
    );

  updateActiveItem(
    runtime,
    items
  );

  updateActiveVisuals(
    runtime,
    getDom
  );

  return runtime.activeIndex;
}

function moveActiveIndex(runtime, getDom, direction = 1) {
  const items =
    getSearchItems(getDom);

  if (!items.length) {
    runtime.activeIndex = -1;
    return -1;
  }

  const max =
    items.length - 1;

  if (runtime.activeIndex < 0) {
    runtime.activeIndex =
      direction > 0
        ? 0
        : max;
  } else {
    runtime.activeIndex += direction;

    if (runtime.activeIndex > max) {
      runtime.activeIndex = 0;
    }

    if (runtime.activeIndex < 0) {
      runtime.activeIndex = max;
    }
  }

  updateActiveItem(
    runtime,
    items
  );

  updateActiveVisuals(
    runtime,
    getDom
  );

  return runtime.activeIndex;
}

function clearSearchInput(getDom) {
  const {
    searchInput,
  } = getDom();

  if (!searchInput) {
    return false;
  }

  try {
    searchInput.value = "";
    return true;
  } catch {
    return false;
  }
}

function blurSearchInput(getDom) {
  const {
    searchInput,
  } = getDom();

  try {
    searchInput?.blur?.();
  } catch {}
}

function focusSearchInput(getDom, options = {}) {
  const {
    searchInput,
  } = getDom();

  if (!searchInput) {
    return false;
  }

  try {
    searchInput.focus({
      preventScroll:
        options.preventScroll !== false,
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

  hideResultsContainer(
    runtime,
    getDom
  );

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
  const value =
    normalizeQuery(query);

  clearSearchDebounce(runtime);

  if (
    !value ||
    value.length < TOPBAR_SEARCH_CONFIG.minQueryLength
  ) {
    hideResultsContainer(
      runtime,
      getDom
    );

    return false;
  }

  const execute = () => {
    if (runtime.isComposingSearch) {
      return;
    }

    runSearch({
      AppCore,
      Router,
      runtime,
      getDom,
      closeSidebarMobile,
      query:
        value,
    });
  };

  if (immediate) {
    execute();
    return true;
  }

  runtime.searchDebounceTimer =
    safeSetTimeout(
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
  if (
    !item ||
    runtime.openingSearchResult
  ) {
    return false;
  }

  runtime.openingSearchResult =
    true;

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
    runtime.openingSearchResult =
      false;
  }
}

function setSearchAria(getDom) {
  const {
    searchInput,
    searchResults,
  } = getDom();

  if (
    !searchInput ||
    !searchResults
  ) {
    return false;
  }

  const inputId =
    ensureId(
      searchInput,
      "topbar-search-input"
    );

  const resultsId =
    ensureId(
      searchResults,
      "topbar-search-results"
    );

  try {
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

    searchInput.setAttribute("autocomplete", "off");
    searchInput.setAttribute("autocapitalize", "off");
    searchInput.setAttribute("spellcheck", "false");
  } catch {}

  return true;
}

function closeSidebarIfOpen(closeSidebarMobile) {
  if (!isBrowser()) {
    return false;
  }

  const body =
    document.body;

  if (
    !body?.classList?.contains?.("sidebar-open")
  ) {
    return false;
  }

  safeCall(closeSidebarMobile);

  return true;
}

function isInsideSidebarOrToggle(event) {
  const target =
    event?.target;

  if (!target) {
    return false;
  }

  return Boolean(
    target.closest?.(".sidebar") ||
    target.closest?.("[data-sidebar]") ||
    target.closest?.(".topbar-mobile-toggle") ||
    target.closest?.("[data-sidebar-toggle]") ||
    target.closest?.("[data-sidebar-mobile-toggle]")
  );
}

function safeLog(AppCore, ...args) {
  try {
    AppCore?.utils?.log?.(
      "[TopbarEvents]",
      ...args
    );
  } catch {}
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(
      "[TopbarEvents]",
      ...args
    );
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.warn(
        "[TopbarEvents]",
        ...args
      );
    }
  } catch {}
}

/* =========================================================
   BIND HELPERS
========================================================= */

function bindCleanupDomEvent(
  AppCore,
  scope,
  target,
  eventName,
  handler,
  options = false
) {
  if (
    !target ||
    !eventName ||
    !isFunction(handler)
  ) {
    return false;
  }

  try {
    if (isFunction(AppCore?.cleanup?.on)) {
      AppCore.cleanup.on(
        scope,
        target,
        eventName,
        handler,
        options
      );

      return true;
    }
  } catch {
    try {
      AppCore?.cleanup?.on?.(
        scope,
        target,
        eventName,
        handler
      );

      return true;
    } catch {}
  }

  try {
    target.addEventListener(
      eventName,
      handler,
      options
    );

    return true;
  } catch {
    return false;
  }
}

function bindCleanupAppEvent(
  AppCore,
  scope,
  eventName,
  handler
) {
  if (
    !eventName ||
    !isFunction(handler)
  ) {
    return false;
  }

  /*
    Usamos cleanup.event si existe para que TopbarUI.unbind()/destroy()
    pueda limpiar. Como TopbarUI ya no llama cleanup.run() en cada render,
    esto no debe disparar tormenta.
  */
  try {
    if (isFunction(AppCore?.cleanup?.event)) {
      AppCore.cleanup.event(
        scope,
        eventName,
        handler
      );

      return true;
    }
  } catch {}

  try {
    if (isFunction(AppCore?.events?.on)) {
      AppCore.events.on(
        eventName,
        handler
      );

      return true;
    }
  } catch {}

  try {
    if (isBrowser()) {
      window.addEventListener(
        eventName,
        handler
      );

      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   VISUAL SYNC PIPELINE
========================================================= */

function createVisualScheduler({
  AppCore,
  getDom,
  hideResults,
  syncTitle,
  setMobileToggleState,
  syncFixedTopbarOffset,
  closeSidebarMobile,
  syncDomCache,
  rebind,
} = {}) {
  let timer = null;
  let settledTimer = null;

  function hasTopbarDom() {
    try {
      const {
        topbar,
      } = getDom();

      return Boolean(
        topbar &&
        isConnected(topbar)
      );
    } catch {
      return false;
    }
  }

  function softRebindIfMissing(reason = "dom-missing") {
    if (hasTopbarDom()) {
      return false;
    }

    /*
      rebind viene de TopbarUI.queueRebind.
      Con el index corregido es soft-refresh por defecto.
    */
    safeCall(
      rebind,
      SOFT_REBIND_IF_DOM_MISSING_MS,
      {
        reason:
          `topbar-events:${reason}`,
        force:
          false,
        hard:
          false,
        explicit:
          false,
      }
    );

    return true;
  }

  function syncNow(options = {}) {
    const detail =
      safeObject(options);

    softRebindIfMissing(
      detail.reason || "sync-now"
    );

    safeCall(syncDomCache);

    if (detail.hideResults === true) {
      safeCall(hideResults);
    }

    if (detail.closeSidebarMobile === true) {
      safeCall(closeSidebarMobile);
    }

    safeCall(
      syncTitle,
      detail.path ||
        detail.publicPath ||
        getCurrentPublicPath(AppCore)
    );

    safeCall(setMobileToggleState);
    safeCall(syncFixedTopbarOffset);

    return true;
  }

  function schedule(options = {}) {
    const detail =
      safeObject(options);

    safeClearTimeout(timer);

    timer =
      safeSetTimeout(
        () => {
          timer = null;
          syncNow(detail);
        },
        Number.isFinite(Number(detail.delayMs))
          ? Number(detail.delayMs)
          : VISUAL_SYNC_DELAY_MS
      );

    if (detail.settled !== false) {
      safeClearTimeout(settledTimer);

      settledTimer =
        safeSetTimeout(
          () => {
            settledTimer = null;

            syncNow({
              ...detail,
              reason:
                `${safeText(detail.reason, "visual-sync")}:settled`,
            });
          },
          Number.isFinite(Number(detail.settledMs))
            ? Number(detail.settledMs)
            : VISUAL_SYNC_SETTLED_MS
        );
    }

    return true;
  }

  function cancel() {
    safeClearTimeout(timer);
    safeClearTimeout(settledTimer);

    timer = null;
    settledTimer = null;

    return true;
  }

  return {
    syncNow,
    schedule,
    cancel,
    softRebindIfMissing,
  };
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
    try {
      event?.preventDefault?.();
      event?.stopPropagation?.();
    } catch {}

    safeCall(toggleSidebarMobile);
    safeCall(setMobileToggleState);
    safeCall(syncFixedTopbarOffset);
  }

  function handleOutsideSidebarClick(event) {
    if (!isPrimaryPointerEvent(event)) {
      return;
    }

    if (isInsideSidebarOrToggle(event)) {
      return;
    }

    closeSidebarIfOpen(
      closeSidebarMobile
    );
  }

  function handleViewportResize() {
    safeCall(syncDomCache);
    safeCall(setMobileToggleState);
    safeCall(syncFixedTopbarOffset);

    if (isResultsOpen(getDom)) {
      updateActiveVisuals(
        runtime,
        getDom
      );
    }
  }

  function handleSearchCompositionStart() {
    runtime.isComposingSearch =
      true;
  }

  function handleSearchCompositionEnd() {
    runtime.isComposingSearch =
      false;

    handleSearchInput();
  }

  function handleSearchInput() {
    if (runtime.isComposingSearch) {
      return;
    }

    const value =
      getSearchValue(getDom);

    scheduleSearch({
      AppCore,
      Router,
      runtime,
      getDom,
      closeSidebarMobile,
      query:
        value,
      immediate:
        false,
    });
  }

  function handleSearchFocus() {
    const value =
      getSearchValue(getDom);

    if (
      value.length >=
      TOPBAR_SEARCH_CONFIG.minQueryLength
    ) {
      scheduleSearch({
        AppCore,
        Router,
        runtime,
        getDom,
        closeSidebarMobile,
        query:
          value,
        immediate:
          true,
      });

      return;
    }

    hideResultsContainer(
      runtime,
      getDom
    );
  }

  function handleSearchPointerDown(event) {
    if (!isPrimaryPointerEvent(event)) {
      return;
    }

    /*
      Evita que el input pierda foco antes de que el click del resultado
      pueda ejecutar goToResult correctamente.
    */
    const result =
      event.target?.closest?.(".search-result");

    if (result) {
      try {
        event.preventDefault();
      } catch {}
    }
  }

  async function handleSearchKeydown(event) {
    const {
      searchInput,
    } = getDom();

    if (!searchInput) {
      return;
    }

    const key =
      event.key;

    const active =
      isSearchInteractionActive(getDom);

    /*
      Atajos globales:
      - Ctrl/Cmd + K: foco en search
      - "/" fuera de inputs: foco en search
    */
    if (
      (event.ctrlKey || event.metaKey) &&
      key.toLowerCase() === "k"
    ) {
      event.preventDefault();

      focusSearchInput(
        getDom,
        {
          select:
            true,
        }
      );

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

    if (!active) {
      return;
    }

    const items =
      getSearchItems(getDom);

    if (key === "ArrowDown") {
      event.preventDefault();

      if (!items.length) {
        const value =
          getSearchValue(getDom);

        scheduleSearch({
          AppCore,
          Router,
          runtime,
          getDom,
          closeSidebarMobile,
          query:
            value,
          immediate:
            true,
        });

        return;
      }

      moveActiveIndex(
        runtime,
        getDom,
        1
      );

      return;
    }

    if (key === "ArrowUp") {
      event.preventDefault();

      if (!items.length) {
        return;
      }

      moveActiveIndex(
        runtime,
        getDom,
        -1
      );

      return;
    }

    if (
      key === "Home" &&
      items.length
    ) {
      event.preventDefault();

      setActiveIndex(
        runtime,
        getDom,
        0
      );

      return;
    }

    if (
      key === "End" &&
      items.length
    ) {
      event.preventDefault();

      setActiveIndex(
        runtime,
        getDom,
        items.length - 1
      );

      return;
    }

    if (key === "Enter") {
      const hasResult =
        items.length &&
        safeArray(runtime.currentItems).length;

      if (!hasResult) {
        return;
      }

      event.preventDefault();

      const index =
        runtime.activeIndex >= 0
          ? runtime.activeIndex
          : clampActiveIndex(
              runtime,
              items
            );

      const item =
        runtime.currentItems[index];

      if (!item) {
        return;
      }

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

      hideSearch(
        runtime,
        getDom,
        {
          blur:
            true,
        }
      );

      return;
    }

    if (key === "Tab") {
      safeSetTimeout(
        () => {
          if (!isSearchInteractionActive(getDom)) {
            hideResultsContainer(
              runtime,
              getDom
            );
          }
        },
        0
      );
    }
  }

  function handleSearchOutsideClick(event) {
    if (!isPrimaryPointerEvent(event)) {
      return;
    }

    if (isInsideSearch(event, getDom)) {
      return;
    }

    hideResultsContainer(
      runtime,
      getDom
    );
  }

  function handleSearchResultsMouseMove(event) {
    const result =
      event.target?.closest?.(".search-result");

    if (!result) {
      return;
    }

    const idx =
      Number(result.dataset.index);

    if (!Number.isFinite(idx)) {
      return;
    }

    if (runtime.activeIndex === idx) {
      return;
    }

    runtime.activeIndex =
      idx;

    updateActiveVisuals(
      runtime,
      getDom
    );
  }

  function handleSearchResultsClick(event) {
    /*
      El click principal del resultado ya lo registra renderResults().
      Este handler solo evita propagaciones raras hacia document/click.
    */
    const result =
      event.target?.closest?.(".search-result");

    if (!result) {
      return;
    }

    try {
      event.stopPropagation();
    } catch {}
  }

  function handleRouteVisualSync(payload = {}) {
    const detail =
      getEventDetail(payload);

    safeCall(syncDomCache);

    safeCall(
      syncTitle,
      detail.path ||
        detail.publicPath ||
        detail.route ||
        getCurrentPublicPath(AppCore)
    );

    safeCall(setMobileToggleState);
    safeCall(syncFixedTopbarOffset);
  }

  function handleSearchCloseEvent() {
    hideSearch(
      runtime,
      getDom,
      {
        blur:
          true,
      }
    );
  }

  function handleSearchFocusEvent() {
    focusSearchInput(
      getDom,
      {
        select:
          true,
      }
    );
  }

  function handleSearchClearEvent() {
    hideSearch(
      runtime,
      getDom,
      {
        blur:
          true,
        clearInput:
          true,
      }
    );
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
  const {
    mobileToggle,
  } = getDom();

  if (mobileToggle) {
    bindCleanupDomEvent(
      AppCore,
      scope,
      mobileToggle,
      "click",
      handlers.handleMobileToggleClick
    );

    try {
      mobileToggle.setAttribute(
        "aria-controls",
        "sidebar"
      );

      mobileToggle.setAttribute(
        "aria-expanded",
        String(
          document.body?.classList?.contains?.("sidebar-open") ||
          false
        )
      );
    } catch {}
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
    handlers.handleViewportResize,
    {
      passive:
        true,
    }
  );

  bindCleanupDomEvent(
    AppCore,
    scope,
    window,
    "orientationchange",
    handlers.handleViewportResize,
    {
      passive:
        true,
    }
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
  const {
    searchInput,
    searchResults,
  } = getDom();

  if (
    !searchInput ||
    !searchResults
  ) {
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
  const visual =
    createVisualScheduler({
      AppCore,
      getDom,
      hideResults,
      syncTitle,
      setMobileToggleState,
      syncFixedTopbarOffset,
      closeSidebarMobile,
      syncDomCache,
      rebind,
    });

  bindCleanupAppEvent(
    AppCore,
    scope,
    "router:before-render",
    (payload) => {
      const detail =
        getEventDetail(payload);

      const nextPath =
        detail?.path ||
        detail?.publicPath ||
        detail?.canonicalPath ||
        getCurrentPublicPath(AppCore);

      visual.schedule({
        reason:
          "router:before-render",
        path:
          nextPath,
        hideResults:
          false,
        closeSidebarMobile:
          false,
        settled:
          false,
        delayMs:
          0,
      });
    }
  );

  bindCleanupAppEvent(
    AppCore,
    scope,
    "router:rendered",
    (payload) => {
      const detail =
        getEventDetail(payload);

      /*
        NO rebind aquí.
        Solo sync visual ligero.
      */
      visual.schedule({
        reason:
          "router:rendered",
        path:
          detail?.publicPath ||
          detail?.path ||
          detail?.canonicalPath ||
          getCurrentPublicPath(AppCore),
        hideResults:
          true,
        closeSidebarMobile:
          false,
        delayMs:
          VISUAL_SYNC_DELAY_MS,
        settledMs:
          VISUAL_SYNC_SETTLED_MS,
      });
    }
  );

  bindCleanupAppEvent(
    AppCore,
    scope,
    "app:route:rendered",
    (payload) => {
      const detail =
        getEventDetail(payload);

      /*
        NO rebind aquí.
      */
      visual.schedule({
        reason:
          "app:route:rendered",
        path:
          detail?.publicPath ||
          detail?.path ||
          detail?.route ||
          getCurrentPublicPath(AppCore),
        hideResults:
          true,
        closeSidebarMobile:
          false,
        delayMs:
          VISUAL_SYNC_DELAY_MS,
        settledMs:
          VISUAL_SYNC_SETTLED_MS,
      });
    }
  );

  bindCleanupAppEvent(
    AppCore,
    scope,
    "app:route:change",
    (payload) => {
      const detail =
        getEventDetail(payload);

      visual.schedule({
        reason:
          "app:route:change",
        path:
          detail?.publicPath ||
          detail?.path ||
          detail?.route ||
          getCurrentPublicPath(AppCore),
        hideResults:
          true,
        closeSidebarMobile:
          true,
        delayMs:
          VISUAL_SYNC_DELAY_MS,
        settledMs:
          VISUAL_SYNC_SETTLED_MS,
      });
    }
  );

  bindCleanupAppEvent(
    AppCore,
    scope,
    "app:public-path:change",
    (payload) => {
      const detail =
        getEventDetail(payload);

      visual.schedule({
        reason:
          "app:public-path:change",
        path:
          detail?.publicPath ||
          detail?.path ||
          getCurrentPublicPath(AppCore),
        hideResults:
          true,
        closeSidebarMobile:
          false,
        delayMs:
          VISUAL_SYNC_DELAY_MS,
        settledMs:
          VISUAL_SYNC_SETTLED_MS,
      });
    }
  );

  bindCleanupAppEvent(
    AppCore,
    scope,
    "router:shell:change",
    (payload) => {
      const detail =
        getEventDetail(payload);

      visual.schedule({
        reason:
          "router:shell:change",
        path:
          detail?.publicPath ||
          detail?.path ||
          getCurrentPublicPath(AppCore),
        hideResults:
          false,
        closeSidebarMobile:
          false,
        delayMs:
          VISUAL_SYNC_DELAY_MS,
        settledMs:
          VISUAL_SYNC_SETTLED_MS,
      });
    }
  );

  bindCleanupAppEvent(
    AppCore,
    scope,
    "router:shell:state",
    (payload) => {
      const detail =
        getEventDetail(payload);

      visual.schedule({
        reason:
          "router:shell:state",
        path:
          detail?.publicPath ||
          detail?.path ||
          getCurrentPublicPath(AppCore),
        hideResults:
          false,
        closeSidebarMobile:
          false,
        delayMs:
          VISUAL_SYNC_DELAY_MS,
        settledMs:
          VISUAL_SYNC_SETTLED_MS,
      });
    }
  );

  bindCleanupAppEvent(
    AppCore,
    scope,
    "router:shell:repair",
    (payload) => {
      const detail =
        getEventDetail(payload);

      visual.schedule({
        reason:
          "router:shell:repair",
        path:
          detail?.publicPath ||
          detail?.path ||
          getCurrentPublicPath(AppCore),
        hideResults:
          false,
        closeSidebarMobile:
          false,
        delayMs:
          VISUAL_SYNC_DELAY_MS,
        settledMs:
          VISUAL_SYNC_SETTLED_MS,
      });
    }
  );

  bindCleanupAppEvent(
    AppCore,
    scope,
    "router:render:async-complete",
    (payload) => {
      const detail =
        getEventDetail(payload);

      visual.schedule({
        reason:
          "router:render:async-complete",
        path:
          detail?.publicPath ||
          detail?.path ||
          detail?.canonicalPath ||
          getCurrentPublicPath(AppCore),
        hideResults:
          false,
        closeSidebarMobile:
          false,
        delayMs:
          VISUAL_SYNC_DELAY_MS,
        settledMs:
          VISUAL_SYNC_SETTLED_MS,
      });
    }
  );

  bindCleanupAppEvent(
    AppCore,
    scope,
    "app:user-ui:sync",
    () => {
      /*
        NO rebind aquí.
        El avatar/usuario es del sidebar. El topbar solo reajusta estado visual.
      */
      visual.schedule({
        reason:
          "app:user-ui:sync",
        hideResults:
          false,
        closeSidebarMobile:
          false,
        delayMs:
          VISUAL_SYNC_DELAY_MS,
        settled:
          false,
      });
    }
  );

  bindCleanupAppEvent(
    AppCore,
    scope,
    "sidebar:state:synced",
    () => {
      visual.schedule({
        reason:
          "sidebar:state:synced",
        hideResults:
          false,
        closeSidebarMobile:
          false,
        delayMs:
          SIDEBAR_SYNC_DELAY_MS,
        settledMs:
          VISUAL_SYNC_SETTLED_MS,
      });

      safeSetTimeout(
        () => {
          const {
            mobileToggle,
          } = getDom();

          try {
            mobileToggle?.setAttribute(
              "aria-expanded",
              String(
                document.body?.classList?.contains?.("sidebar-open") ||
                false
              )
            );
          } catch {}
        },
        SIDEBAR_SYNC_DELAY_MS
      );
    }
  );

  bindCleanupAppEvent(
    AppCore,
    scope,
    "sidebar:ui:open:set",
    () => {
      visual.schedule({
        reason:
          "sidebar:ui:open:set",
        hideResults:
          false,
        closeSidebarMobile:
          false,
        delayMs:
          SIDEBAR_SYNC_DELAY_MS,
        settledMs:
          VISUAL_SYNC_SETTLED_MS,
      });
    }
  );

  bindCleanupAppEvent(
    AppCore,
    scope,
    "app:theme:change",
    () => {
      visual.schedule({
        reason:
          "app:theme:change",
        hideResults:
          false,
        closeSidebarMobile:
          false,
        delayMs:
          VISUAL_SYNC_DELAY_MS,
        settledMs:
          VISUAL_SYNC_SETTLED_MS,
      });
    }
  );

  bindCleanupAppEvent(
    AppCore,
    scope,
    "theme:change",
    () => {
      visual.schedule({
        reason:
          "theme:change",
        hideResults:
          false,
        closeSidebarMobile:
          false,
        delayMs:
          VISUAL_SYNC_DELAY_MS,
        settledMs:
          VISUAL_SYNC_SETTLED_MS,
      });
    }
  );

  bindCleanupAppEvent(
    AppCore,
    scope,
    "app:lang:change",
    () => {
      /*
        NO rebind aquí.
        i18n live y syncTitle bastan.
      */
      visual.schedule({
        reason:
          "app:lang:change",
        path:
          getCurrentPublicPath(AppCore),
        hideResults:
          false,
        closeSidebarMobile:
          false,
        delayMs:
          VISUAL_SYNC_DELAY_MS,
        settledMs:
          VISUAL_SYNC_SETTLED_MS,
      });
    }
  );

  bindCleanupAppEvent(
    AppCore,
    scope,
    "i18n:change",
    () => {
      visual.schedule({
        reason:
          "i18n:change",
        path:
          getCurrentPublicPath(AppCore),
        hideResults:
          false,
        closeSidebarMobile:
          false,
        delayMs:
          VISUAL_SYNC_DELAY_MS,
        settledMs:
          VISUAL_SYNC_SETTLED_MS,
      });
    }
  );

  bindCleanupAppEvent(
    AppCore,
    scope,
    "topbar:visual:sync",
    (payload) => {
      const detail =
        getEventDetail(payload);

      visual.schedule({
        reason:
          detail.reason ||
          "topbar:visual:sync",
        path:
          detail.publicPath ||
          detail.path ||
          getCurrentPublicPath(AppCore),
        hideResults:
          detail.hideResults === true,
        closeSidebarMobile:
          detail.closeSidebarMobile === true,
        delayMs:
          Number.isFinite(Number(detail.delayMs))
            ? Number(detail.delayMs)
            : VISUAL_SYNC_DELAY_MS,
        settledMs:
          Number.isFinite(Number(detail.settledMs))
            ? Number(detail.settledMs)
            : VISUAL_SYNC_SETTLED_MS,
      });
    }
  );

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

  bindCleanupDomEvent(
    AppCore,
    scope,
    window,
    "resize",
    () => {
      visual.schedule({
        reason:
          "window:resize",
        hideResults:
          false,
        closeSidebarMobile:
          false,
        delayMs:
          RESIZE_SYNC_DELAY_MS,
        settledMs:
          VISUAL_SYNC_SETTLED_MS,
      });
    },
    {
      passive:
        true,
    }
  );

  safeLog(
    AppCore,
    "app events bound",
    {
      scope,
    }
  );

  return true;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  createTopbarEventHandlers,

  bindTopbarDomEvents,
  bindSearchDomEvents,
  bindTopbarAppEvents,
};
