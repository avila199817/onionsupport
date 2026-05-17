/* =========================================================
   Onion SPA - Topbar Events
   Archivo: src/ui/topbar/topbar.events.js

   TOPBAR EVENTS · SIMPLE
   - DOM: mobile toggle, outside click, resize
   - Search: input, keyboard, focus, outside close
   - App/router: sync visual ligero
   - sin hard rebind implícito
   - sin cleanup.run desde este archivo
   - sin overlays ni CSS inline
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

export const TOPBAR_EVENTS_VERSION = "topbar-events-v16-simple";

const DEFAULT_SCOPE = "ui:topbar";
const DEFAULT_SEARCH_SCOPE = "ui:topbar:search";

const VISUAL_SYNC_DELAY_MS = 0;
const VISUAL_SYNC_SETTLED_MS = 48;
const RESIZE_SYNC_DELAY_MS = 80;
const SIDEBAR_SYNC_DELAY_MS = 32;
const SOFT_REBIND_IF_DOM_MISSING_MS = 24;
const OUTSIDE_CLOSE_DELAY_MS = 0;

const LOCAL_SCOPE_DOM = "dom";
const LOCAL_SCOPE_SEARCH = "search";
const LOCAL_SCOPE_APP = "app";

const localCleanups = new Map();

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value === null || value === undefined) return [];
  return [value];
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeCall(fn, ...args) {
  if (!isFn(fn)) return undefined;

  try {
    return fn(...args);
  } catch {
    return undefined;
  }
}

function safeSetTimeout(callback, ms = 0) {
  if (!isFn(callback)) return null;

  const delay = Math.max(0, safeNumber(ms, 0));

  if (!isBrowser()) {
    try { callback(); } catch {}
    return null;
  }

  try {
    return window.setTimeout(() => {
      try { callback(); } catch {}
    }, delay);
  } catch {
    try { callback(); } catch {}
    return null;
  }
}

function safeClearTimeout(timer) {
  if (!timer || !isBrowser()) return false;

  try {
    window.clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

function scopeKey(scope = DEFAULT_SCOPE, type = "local") {
  return `${safeText(scope, DEFAULT_SCOPE)}:${safeText(type, "local")}`;
}

function pushLocalCleanup(scope = DEFAULT_SCOPE, cleanup = null) {
  if (!isFn(cleanup)) return false;

  const key = safeText(scope, DEFAULT_SCOPE);
  const list = localCleanups.get(key) || [];

  list.push(cleanup);
  localCleanups.set(key, list);

  return true;
}

function runLocalCleanups(scope = DEFAULT_SCOPE) {
  const key = safeText(scope, "");
  if (!key) return false;

  const list = localCleanups.get(key) || [];

  list.forEach((cleanup) => {
    try { cleanup?.(); } catch {}
  });

  localCleanups.delete(key);
  return true;
}

function eventDetail(payload = {}) {
  if (payload?.detail && typeof payload.detail === "object") return payload.detail;
  if (payload?.payload && typeof payload.payload === "object") return payload.payload;
  return safeObject(payload);
}

function isConnected(node = null) {
  if (!node) return false;

  try { return Boolean(node.isConnected); } catch {}
  try { return document.contains(node); } catch {}

  return false;
}

function isEditableTarget(target = null) {
  if (!target) return false;

  const tag = safeText(target.tagName, "").toLowerCase();
  if (["input", "textarea", "select"].includes(tag)) return true;
  if (target.isContentEditable) return true;

  return Boolean(target.closest?.("[contenteditable='true']"));
}

function isPrimaryPointer(event = null) {
  if (!event) return true;
  return !("button" in event) || event.button === 0;
}

function minQueryLength() {
  return safeNumber(TOPBAR_SEARCH_CONFIG?.minQueryLength, 2);
}

function debounceMs() {
  return safeNumber(TOPBAR_SEARCH_CONFIG?.debounceMs, 180);
}

function getSearchValue(getDom) {
  const { searchInput } = getDom();
  return normalizeQuery(searchInput?.value || "");
}

function getSearchItems(getDom) {
  const { searchResults } = getDom();
  if (!searchResults) return [];

  try {
    return [...searchResults.querySelectorAll(".search-result")];
  } catch {
    return [];
  }
}

function isResultsOpen(getDom) {
  const { searchResults } = getDom();
  if (!searchResults) return false;

  return Boolean(
    searchResults.classList?.contains?.("active") ||
      searchResults.classList?.contains?.("is-open") ||
      searchResults.classList?.contains?.("is-search-open") ||
      searchResults.dataset?.searchOpen === "true" ||
      searchResults.hidden === false ||
      searchResults.getAttribute?.("aria-hidden") === "false"
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
      target.closest?.(".topbar-search-results") ||
      target.closest?.("[data-topbar-search]") ||
      target.closest?.("[data-search-open]")
  );
}

function isSearchInteractionActive(getDom) {
  if (!isBrowser()) return false;

  const { searchInput, searchResults, searchWrap } = getDom();
  const active = document.activeElement;

  return Boolean(
    active &&
      (active === searchInput || searchResults?.contains?.(active) || searchWrap?.contains?.(active))
  );
}

function focusSearchInput(getDom, options = {}) {
  const { searchInput } = getDom();
  if (!searchInput) return false;

  try {
    searchInput.focus({ preventScroll: options.preventScroll !== false });
    if (options.select) searchInput.select?.();
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

function clearSearchInput(getDom) {
  const { searchInput } = getDom();
  if (!searchInput) return false;

  try {
    searchInput.value = "";
    return true;
  } catch {
    return false;
  }
}

function blurSearchInput(getDom) {
  try { getDom().searchInput?.blur?.(); } catch {}
}

function hideSearch(runtime, getDom, options = {}) {
  clearSearchDebounce(runtime);
  abortSearch(runtime);
  hideResultsContainer(runtime, getDom);

  if (options.clearInput) clearSearchInput(getDom);
  if (options.blur) blurSearchInput(getDom);

  return true;
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

  if (runtime.activeIndex >= items.length) runtime.activeIndex = items.length - 1;
  return runtime.activeIndex;
}

function setActiveIndex(runtime, getDom, index = -1) {
  const items = getSearchItems(getDom);

  if (!items.length) {
    runtime.activeIndex = -1;
    updateActiveVisuals(runtime, getDom);
    return -1;
  }

  runtime.activeIndex = Math.max(0, Math.min(index, items.length - 1));
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

  if (runtime.activeIndex < 0) runtime.activeIndex = direction > 0 ? 0 : max;
  else runtime.activeIndex += direction;

  if (runtime.activeIndex > max) runtime.activeIndex = 0;
  if (runtime.activeIndex < 0) runtime.activeIndex = max;

  updateActiveItem(runtime, items);
  updateActiveVisuals(runtime, getDom);

  return runtime.activeIndex;
}

function scheduleSearch({ AppCore, Router, runtime, getDom, closeSidebarMobile, query = "", immediate = false }) {
  const value = normalizeQuery(query);

  clearSearchDebounce(runtime);

  if (!value || value.length < minQueryLength()) {
    hideResultsContainer(runtime, getDom);
    return false;
  }

  const execute = () => {
    if (runtime.isComposingSearch) return;
    runSearch({ AppCore, Router, runtime, getDom, closeSidebarMobile, query: value });
  };

  if (immediate) {
    execute();
    return true;
  }

  runtime.searchDebounceTimer = safeSetTimeout(execute, debounceMs());
  return true;
}

async function openSearchItem({ AppCore, Router, runtime, getDom, closeSidebarMobile, item }) {
  if (!item || runtime.openingSearchResult) return false;

  runtime.openingSearchResult = true;

  try {
    await goToResult({ AppCore, Router, runtime, getDom, closeSidebarMobile, item });
    return true;
  } finally {
    runtime.openingSearchResult = false;
  }
}

function ensureId(node = null, fallback = "") {
  if (!node) return "";

  const current = safeText(node.id, "");
  if (current) return current;

  const next = safeText(fallback, `topbar-${Math.random().toString(36).slice(2)}`);

  try {
    node.id = next;
    return next;
  } catch {
    return "";
  }
}

function setSearchAria(getDom) {
  const { searchInput, searchResults, searchLabel } = getDom();
  if (!searchInput || !searchResults) return false;

  const inputId = ensureId(searchInput, "topbar-search");
  const resultsId = ensureId(searchResults, "topbar-search-results");
  const labelId = searchLabel ? ensureId(searchLabel, "topbar-search-label") : "";

  try {
    searchResults.setAttribute("role", "listbox");
    searchResults.setAttribute("aria-hidden", "true");

    if (labelId) searchResults.setAttribute("aria-labelledby", labelId);
    else if (inputId) searchResults.setAttribute("aria-labelledby", inputId);

    searchInput.setAttribute("role", "combobox");
    searchInput.setAttribute("aria-autocomplete", "list");
    searchInput.setAttribute("aria-haspopup", "listbox");
    searchInput.setAttribute("aria-expanded", "false");
    searchInput.setAttribute("aria-controls", resultsId);

    if (labelId) searchInput.setAttribute("aria-labelledby", labelId);
    else searchInput.setAttribute("aria-label", "Buscar en la aplicación");

    searchInput.setAttribute("autocomplete", "off");
    searchInput.setAttribute("autocapitalize", "off");
    searchInput.setAttribute("spellcheck", "false");
    searchInput.setAttribute("data-topbar-search", "true");
    searchResults.setAttribute("data-topbar-search-results", "true");

    return true;
  } catch {
    return false;
  }
}

function closeSidebarIfOpen(closeSidebarMobile) {
  if (!isBrowser()) return false;

  if (!document.body?.classList?.contains?.("sidebar-open")) return false;

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
      target.closest?.("[data-sidebar-toggle]") ||
      target.closest?.("[data-sidebar-mobile-toggle]")
  );
}

function safeLog(AppCore, ...args) {
  try {
    if (AppCore?.config?.debug) AppCore?.utils?.log?.("[TopbarEvents]", ...args);
  } catch {}
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[TopbarEvents]", ...args);
    return;
  } catch {}

  try {
    if (AppCore?.config?.debug) console.warn("[TopbarEvents]", ...args);
  } catch {}
}

/* =========================================================
   BIND HELPERS
========================================================= */

function bindDomEvent(AppCore, scope, target, eventName, handler, options = false, localScope = scope) {
  if (!target || !eventName || !isFn(handler)) return false;

  try {
    if (isFn(AppCore?.cleanup?.on)) {
      const off = AppCore.cleanup.on(scope, target, eventName, handler, options);
      if (isFn(off)) pushLocalCleanup(localScope, off);
      return true;
    }
  } catch {
    try {
      AppCore?.cleanup?.on?.(scope, target, eventName, handler);
      return true;
    } catch {}
  }

  try {
    target.addEventListener(eventName, handler, options);
    pushLocalCleanup(localScope, () => {
      try { target.removeEventListener(eventName, handler, options); } catch {}
    });
    return true;
  } catch {
    return false;
  }
}

function bindAppEvent(AppCore, scope, eventName, handler, localScope = scope) {
  if (!eventName || !isFn(handler)) return false;

  try {
    if (isFn(AppCore?.cleanup?.event)) {
      const off = AppCore.cleanup.event(scope, eventName, handler);
      if (isFn(off)) pushLocalCleanup(localScope, off);
      return true;
    }
  } catch {}

  try {
    if (isFn(AppCore?.events?.on)) {
      const off = AppCore.events.on(eventName, handler);

      if (isFn(off)) pushLocalCleanup(localScope, off);
      else if (isFn(AppCore?.events?.off)) {
        pushLocalCleanup(localScope, () => {
          try { AppCore.events.off(eventName, handler); } catch {}
        });
      }

      return true;
    }
  } catch {}

  try {
    if (isBrowser()) {
      window.addEventListener(eventName, handler);
      pushLocalCleanup(localScope, () => {
        try { window.removeEventListener(eventName, handler); } catch {}
      });
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   VISUAL SYNC
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
      const { topbar } = getDom();
      return Boolean(topbar && isConnected(topbar));
    } catch {
      return false;
    }
  }

  function softRebindIfMissing(reason = "dom-missing") {
    if (hasTopbarDom()) return false;

    safeWarn(AppCore, "Topbar DOM ausente. Solicitando refresh/rebind suave.", { reason });
    safeCall(rebind, SOFT_REBIND_IF_DOM_MISSING_MS, { reason: `topbar-events:${reason}` });

    return true;
  }

  function syncNow(options = {}) {
    const detail = safeObject(options);

    softRebindIfMissing(detail.reason || "sync-now");
    safeCall(syncDomCache);

    if (detail.hideResults === true) safeCall(hideResults);
    if (detail.closeSidebarMobile === true) safeCall(closeSidebarMobile);

    safeCall(syncTitle, detail.path || detail.publicPath || getCurrentPublicPath(AppCore));
    safeCall(setMobileToggleState);
    safeCall(syncFixedTopbarOffset);

    return true;
  }

  function schedule(options = {}) {
    const detail = safeObject(options);

    if (detail.hideResults === true) safeCall(hideResults);
    if (detail.closeSidebarMobile === true) safeCall(closeSidebarMobile);

    safeClearTimeout(timer);
    timer = safeSetTimeout(() => {
      timer = null;
      syncNow(detail);
    }, Number.isFinite(Number(detail.delayMs)) ? Number(detail.delayMs) : VISUAL_SYNC_DELAY_MS);

    if (detail.settled !== false) {
      safeClearTimeout(settledTimer);
      settledTimer = safeSetTimeout(() => {
        settledTimer = null;
        syncNow({ ...detail, reason: `${safeText(detail.reason, "visual-sync")}:settled` });
      }, Number.isFinite(Number(detail.settledMs)) ? Number(detail.settledMs) : VISUAL_SYNC_SETTLED_MS);
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

  return { syncNow, schedule, cancel, softRebindIfMissing };
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
  let resizeTimer = null;

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
    if (!isPrimaryPointer(event)) return;
    if (isInsideSidebarOrToggle(event)) return;
    closeSidebarIfOpen(closeSidebarMobile);
  }

  function handleViewportResize() {
    safeClearTimeout(resizeTimer);

    resizeTimer = safeSetTimeout(() => {
      resizeTimer = null;
      safeCall(syncDomCache);
      safeCall(setMobileToggleState);
      safeCall(syncFixedTopbarOffset);

      if (isResultsOpen(getDom)) updateActiveVisuals(runtime, getDom);
    }, RESIZE_SYNC_DELAY_MS);
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

    scheduleSearch({
      AppCore,
      Router,
      runtime,
      getDom,
      closeSidebarMobile,
      query: getSearchValue(getDom),
      immediate: false,
    });
  }

  function handleSearchFocus() {
    const value = getSearchValue(getDom);

    if (value.length >= minQueryLength()) {
      scheduleSearch({ AppCore, Router, runtime, getDom, closeSidebarMobile, query: value, immediate: true });
      return;
    }

    hideResultsContainer(runtime, getDom);
  }

  function handleSearchPointerDown(event) {
    if (!isPrimaryPointer(event)) return;

    if (event.target?.closest?.(".search-result")) {
      try { event.preventDefault(); } catch {}
    }
  }

  async function handleSearchKeydown(event) {
    const key = safeText(event.key, "");
    const normalizedKey = key.toLowerCase();
    const active = isSearchInteractionActive(getDom);

    if ((event.ctrlKey || event.metaKey) && normalizedKey === "k") {
      try { event.preventDefault(); } catch {}
      focusSearchInput(getDom, { select: true });
      return;
    }

    if (key === "/" && !active && !isEditableTarget(event.target)) {
      try { event.preventDefault(); } catch {}
      focusSearchInput(getDom);
      return;
    }

    if (!active) return;

    const items = getSearchItems(getDom);

    if (key === "ArrowDown") {
      try { event.preventDefault(); } catch {}

      if (!items.length) {
        scheduleSearch({ AppCore, Router, runtime, getDom, closeSidebarMobile, query: getSearchValue(getDom), immediate: true });
        return;
      }

      moveActiveIndex(runtime, getDom, 1);
      return;
    }

    if (key === "ArrowUp") {
      try { event.preventDefault(); } catch {}
      if (items.length) moveActiveIndex(runtime, getDom, -1);
      return;
    }

    if (key === "Home" && items.length) {
      try { event.preventDefault(); } catch {}
      setActiveIndex(runtime, getDom, 0);
      return;
    }

    if (key === "End" && items.length) {
      try { event.preventDefault(); } catch {}
      setActiveIndex(runtime, getDom, items.length - 1);
      return;
    }

    if (key === "Enter") {
      const hasResult = items.length && safeArray(runtime.currentItems).length;
      if (!hasResult) return;

      try { event.preventDefault(); } catch {}

      const index = runtime.activeIndex >= 0 ? runtime.activeIndex : clampActiveIndex(runtime, items);
      const item = runtime.currentItems[index];

      if (item) await openSearchItem({ AppCore, Router, runtime, getDom, closeSidebarMobile, item });
      return;
    }

    if (key === "Escape") {
      try { event.preventDefault(); } catch {}
      hideSearch(runtime, getDom, { blur: true });
      return;
    }

    if (key === "Tab") {
      safeSetTimeout(() => {
        if (!isSearchInteractionActive(getDom)) hideResultsContainer(runtime, getDom);
      }, 0);
    }
  }

  function handleSearchOutsidePointer(event) {
    if (!isPrimaryPointer(event)) return;
    if (isInsideSearch(event, getDom)) return;
    if (!isResultsOpen(getDom)) return;

    safeSetTimeout(() => {
      if (!isSearchInteractionActive(getDom)) hideSearch(runtime, getDom, { blur: true });
    }, OUTSIDE_CLOSE_DELAY_MS);
  }

  function handleSearchOutsideClick(event) {
    if (!isPrimaryPointer(event)) return;
    if (isInsideSearch(event, getDom)) return;
    if (!isResultsOpen(getDom)) return;

    hideSearch(runtime, getDom, { blur: true });
  }

  function handleSearchResultsMouseMove(event) {
    const result = event.target?.closest?.(".search-result");
    if (!result) return;

    const index = Number(result.dataset.index);
    if (!Number.isFinite(index) || runtime.activeIndex === index) return;

    runtime.activeIndex = index;
    updateActiveVisuals(runtime, getDom);
  }

  function handleSearchResultsClick(event) {
    const result = event.target?.closest?.(".search-result");
    if (!result) return;

    try { event.stopPropagation(); } catch {}
  }

  function handleRouteVisualSync(payload = {}) {
    const detail = eventDetail(payload);

    safeCall(syncDomCache);
    safeCall(syncTitle, detail.path || detail.publicPath || detail.route || getCurrentPublicPath(AppCore));
    safeCall(setMobileToggleState);
    safeCall(syncFixedTopbarOffset);
  }

  function handleSearchCloseEvent() {
    hideSearch(runtime, getDom, { blur: true });
  }

  function handleSearchFocusEvent() {
    focusSearchInput(getDom, { select: true });
  }

  function handleSearchClearEvent() {
    hideSearch(runtime, getDom, { blur: true, clearInput: true });
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
    handleSearchOutsidePointer,
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

export function bindTopbarDomEvents({ AppCore, scope = DEFAULT_SCOPE, getDom, handlers }) {
  if (!isBrowser()) return false;

  const localScope = scopeKey(scope, LOCAL_SCOPE_DOM);
  runLocalCleanups(localScope);

  const { mobileToggle } = getDom();

  if (mobileToggle) {
    bindDomEvent(AppCore, scope, mobileToggle, "click", handlers.handleMobileToggleClick, false, localScope);

    try {
      mobileToggle.setAttribute("aria-controls", "sidebar");
      mobileToggle.setAttribute("aria-expanded", String(document.body?.classList?.contains?.("sidebar-open") || false));
    } catch {}
  }

  bindDomEvent(AppCore, scope, document, "click", handlers.handleOutsideSidebarClick, false, localScope);
  bindDomEvent(AppCore, scope, window, "resize", handlers.handleViewportResize, { passive: true }, localScope);
  bindDomEvent(AppCore, scope, window, "orientationchange", handlers.handleViewportResize, { passive: true }, localScope);

  return true;
}

export function bindSearchDomEvents({ AppCore, scope = DEFAULT_SEARCH_SCOPE, getDom, handlers }) {
  if (!isBrowser()) return false;

  const localScope = scopeKey(scope, LOCAL_SCOPE_SEARCH);
  runLocalCleanups(localScope);

  const { searchInput, searchResults } = getDom();
  if (!searchInput || !searchResults) return false;

  setSearchAria(getDom);

  bindDomEvent(AppCore, scope, searchInput, "compositionstart", handlers.handleSearchCompositionStart, false, localScope);
  bindDomEvent(AppCore, scope, searchInput, "compositionend", handlers.handleSearchCompositionEnd, false, localScope);
  bindDomEvent(AppCore, scope, searchInput, "input", handlers.handleSearchInput, false, localScope);
  bindDomEvent(AppCore, scope, searchInput, "focus", handlers.handleSearchFocus, false, localScope);

  bindDomEvent(AppCore, scope, searchResults, "pointerdown", handlers.handleSearchPointerDown, false, localScope);
  bindDomEvent(AppCore, scope, searchResults, "mousedown", handlers.handleSearchPointerDown, false, localScope);
  bindDomEvent(AppCore, scope, searchResults, "mousemove", handlers.handleSearchResultsMouseMove, false, localScope);
  bindDomEvent(AppCore, scope, searchResults, "click", handlers.handleSearchResultsClick, false, localScope);

  bindDomEvent(AppCore, scope, document, "keydown", handlers.handleSearchKeydown, false, localScope);
  bindDomEvent(AppCore, scope, document, "pointerdown", handlers.handleSearchOutsidePointer, { capture: true }, localScope);
  bindDomEvent(AppCore, scope, document, "click", handlers.handleSearchOutsideClick, false, localScope);

  return true;
}

/* =========================================================
   APP / ROUTER EVENTS
========================================================= */

export function bindTopbarAppEvents({
  AppCore,
  scope = DEFAULT_SCOPE,
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
  const localScope = scopeKey(scope, LOCAL_SCOPE_APP);
  runLocalCleanups(localScope);

  const visual = createVisualScheduler({
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

  pushLocalCleanup(localScope, () => visual.cancel());

  const routeSync = (eventName, payload, options = {}) => {
    const detail = eventDetail(payload);

    visual.schedule({
      reason: eventName,
      path: detail.publicPath || detail.path || detail.route || detail.canonicalPath || getCurrentPublicPath(AppCore),
      hideResults: options.hideResults === true,
      closeSidebarMobile: options.closeSidebarMobile === true,
      delayMs: options.delayMs ?? VISUAL_SYNC_DELAY_MS,
      settledMs: options.settledMs ?? VISUAL_SYNC_SETTLED_MS,
      settled: options.settled,
    });
  };

  bindAppEvent(AppCore, scope, "router:before-render", (payload) => {
    routeSync("router:before-render", payload, { hideResults: true, closeSidebarMobile: false, delayMs: 0, settled: false });
  }, localScope);

  ["router:rendered", "app:route:rendered", "app:public-path:change", "router:render:async-complete", "router:rendered:complete"].forEach((eventName) => {
    bindAppEvent(AppCore, scope, eventName, (payload) => {
      routeSync(eventName, payload, { hideResults: true, closeSidebarMobile: false });
    }, localScope);
  });

  bindAppEvent(AppCore, scope, "app:route:change", (payload) => {
    routeSync("app:route:change", payload, { hideResults: true, closeSidebarMobile: true });
  }, localScope);

  ["router:shell:change", "router:shell:state", "router:shell:repair"].forEach((eventName) => {
    bindAppEvent(AppCore, scope, eventName, (payload) => {
      routeSync(eventName, payload, { hideResults: false, closeSidebarMobile: false });
    }, localScope);
  });

  ["app:user-ui:sync", "app:theme:change", "theme:change", "app:lang:change", "i18n:change"].forEach((eventName) => {
    bindAppEvent(AppCore, scope, eventName, (payload) => {
      routeSync(eventName, payload, { hideResults: false, closeSidebarMobile: false, settled: eventName !== "app:user-ui:sync" });
    }, localScope);
  });

  ["sidebar:state:synced", "sidebar:ui:open:set"].forEach((eventName) => {
    bindAppEvent(AppCore, scope, eventName, () => {
      visual.schedule({
        reason: eventName,
        hideResults: false,
        closeSidebarMobile: false,
        delayMs: SIDEBAR_SYNC_DELAY_MS,
        settledMs: VISUAL_SYNC_SETTLED_MS,
      });

      safeSetTimeout(() => {
        const { mobileToggle } = getDom();
        try {
          mobileToggle?.setAttribute("aria-expanded", String(document.body?.classList?.contains?.("sidebar-open") || false));
        } catch {}
      }, SIDEBAR_SYNC_DELAY_MS);
    }, localScope);
  });

  bindAppEvent(AppCore, scope, "topbar:visual:sync", (payload) => {
    const detail = eventDetail(payload);

    visual.schedule({
      reason: detail.reason || "topbar:visual:sync",
      path: detail.publicPath || detail.path || getCurrentPublicPath(AppCore),
      hideResults: detail.hideResults === true,
      closeSidebarMobile: detail.closeSidebarMobile === true,
      delayMs: Number.isFinite(Number(detail.delayMs)) ? Number(detail.delayMs) : VISUAL_SYNC_DELAY_MS,
      settledMs: Number.isFinite(Number(detail.settledMs)) ? Number(detail.settledMs) : VISUAL_SYNC_SETTLED_MS,
    });
  }, localScope);

  bindAppEvent(AppCore, scope, "topbar:search:close", handlers.handleSearchCloseEvent, localScope);
  bindAppEvent(AppCore, scope, "topbar:search:focus", handlers.handleSearchFocusEvent, localScope);
  bindAppEvent(AppCore, scope, "topbar:search:clear", handlers.handleSearchClearEvent, localScope);

  safeLog(AppCore, "app events bound", { scope });
  return true;
}

export default {
  TOPBAR_EVENTS_VERSION,

  createTopbarEventHandlers,
  bindTopbarDomEvents,
  bindSearchDomEvents,
  bindTopbarAppEvents,
};
