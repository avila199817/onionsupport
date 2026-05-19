/* =========================================================
   Onion Support - Topbar Events
   Archivo: /src/ui/topbar/topbar.events.js

   Responsabilidad:
   - Compat mínima de eventos Topbar.
   - Sin botón sidebar.
   - Sin logout.
   - Sin search runtime propio.
   - Sin overlays.
   - Sin app event storms.
   - Sin hard rebind.
   - Sin CustomEvent.
   - Sin imports.
   - Sin magia negra.
   - El topbar real vive en src/ui/topbar/index.js.
========================================================= */

export const TOPBAR_EVENTS_VERSION = "topbar.events.v3";

const DEFAULT_SCOPE = "ui:topbar";
const DEFAULT_SEARCH_SCOPE = "ui:topbar:search";

const cleanups = new Map();

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function safeCall(fn, ...args) {
  if (!isFunction(fn)) return undefined;

  try {
    return fn(...args);
  } catch {
    return undefined;
  }
}

function scopeKey(scope = DEFAULT_SCOPE, type = "local") {
  return `${text(scope, DEFAULT_SCOPE)}:${text(type, "local")}`;
}

function addCleanup(scope = DEFAULT_SCOPE, cleanup = null) {
  if (!isFunction(cleanup)) return false;

  const key = text(scope, DEFAULT_SCOPE);
  const list = cleanups.get(key) || [];

  list.push(cleanup);
  cleanups.set(key, list);

  return true;
}

function runCleanups(scope = DEFAULT_SCOPE) {
  const key = text(scope, DEFAULT_SCOPE);
  const list = cleanups.get(key) || [];

  while (list.length) {
    try {
      list.pop()?.();
    } catch {
      // noop
    }
  }

  cleanups.delete(key);

  return true;
}

function eventDetail(payload = {}) {
  if (isObject(payload?.detail)) return payload.detail;
  if (isObject(payload?.payload)) return payload.payload;
  return isObject(payload) ? payload : {};
}

function emit(AppCore = null, eventName = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(eventName, {
      source: "topbar.events",
      version: TOPBAR_EVENTS_VERSION,
      ...payload,
      token: null,
      accessToken: null,
      refreshToken: null,
    });

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   DOM
========================================================= */

function query(selector = "", root = null) {
  if (!isBrowser() || !selector) return null;

  try {
    return (root || document).querySelector(selector);
  } catch {
    return null;
  }
}

function targetOf(event = null) {
  const target = event?.target;

  try {
    if (target?.nodeType === 3) return target.parentElement;
  } catch {
    // noop
  }

  return target || null;
}

function bind(
  target = null,
  eventName = "",
  handler = null,
  options = false,
  scope = DEFAULT_SCOPE
) {
  if (
    !target ||
    !eventName ||
    !isFunction(handler) ||
    !isFunction(target.addEventListener)
  ) {
    return false;
  }

  try {
    target.addEventListener(eventName, handler, options);
    addCleanup(scope, () => target.removeEventListener(eventName, handler, options));
    return true;
  } catch {
    return false;
  }
}

function getDomSafe(getDom = null) {
  let dom = {};

  try {
    dom = isFunction(getDom) ? getDom() || {} : {};
  } catch {
    dom = {};
  }

  if (!isBrowser()) return dom;

  const topbar =
    dom.topbar ||
    query("[data-topbar-root]") ||
    query("#app-topbar") ||
    query("#topbar") ||
    null;

  const search =
    dom.search ||
    topbar?.querySelector?.("[data-topbar-search]") ||
    query("[data-topbar-search]") ||
    null;

  const searchInput =
    dom.searchInput ||
    search?.querySelector?.("[data-topbar-search-input]") ||
    query("[data-topbar-search-input]") ||
    null;

  const searchResults =
    dom.searchResults ||
    query("#topbar-search-results") ||
    query("[data-topbar-search-results]") ||
    query(".topbar-search-results") ||
    null;

  return {
    ...dom,
    topbar,
    search,
    searchInput,
    searchResults,
  };
}

/* =========================================================
   PATHS
========================================================= */

function normalizePath(path = "/") {
  let value = text(path, "/");

  if (value.startsWith("#/")) value = value.slice(1);
  if (value.startsWith("#!")) value = value.replace(/^#!\/?/, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/{2,}/g, "/");

  return value || "/";
}

function currentBrowserPath() {
  if (!isBrowser()) return "/";

  try {
    return normalizePath(
      `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
    );
  } catch {
    return "/";
  }
}

/* =========================================================
   SEARCH COMPAT
========================================================= */

function clearSearchDebounce(runtime = null) {
  if (!runtime?.searchDebounceTimer) return false;

  try {
    window.clearTimeout(runtime.searchDebounceTimer);
  } catch {
    try {
      clearTimeout(runtime.searchDebounceTimer);
    } catch {
      // noop
    }
  }

  runtime.searchDebounceTimer = null;
  return true;
}

function abortSearch(runtime = null) {
  if (!runtime?.searchController) return false;

  try {
    runtime.searchController.abort();
  } catch {
    // noop
  }

  runtime.searchController = null;
  return true;
}

function setSearchVisualState(getDom = null, active = false) {
  const { topbar, search, searchResults } = getDomSafe(getDom);

  try {
    topbar?.classList?.toggle?.("is-search-focused", Boolean(active));
    topbar?.toggleAttribute?.("data-search-focus", Boolean(active));
  } catch {
    // noop
  }

  try {
    search?.classList?.toggle?.("is-search-open", Boolean(active));
    search?.toggleAttribute?.("data-search-open", Boolean(active));
  } catch {
    // noop
  }

  try {
    searchResults?.classList?.toggle?.("active", Boolean(active));
    searchResults?.toggleAttribute?.("data-search-open", Boolean(active));
  } catch {
    // noop
  }

  return true;
}

function hideSearch(runtime = null, getDom = null, options = {}) {
  clearSearchDebounce(runtime);
  abortSearch(runtime);

  const { searchInput, searchResults } = getDomSafe(getDom);

  if (searchResults) {
    try {
      searchResults.hidden = true;
      searchResults.classList.remove("active");
      searchResults.removeAttribute("data-search-open");
      searchResults.setAttribute("aria-hidden", "true");
      searchResults.replaceChildren();
    } catch {
      // noop
    }
  }

  if (searchInput) {
    try {
      searchInput.setAttribute("aria-expanded", "false");
      searchInput.removeAttribute("aria-activedescendant");

      if (options.clearInput === true) searchInput.value = "";
      if (options.blur === true) searchInput.blur();
    } catch {
      // noop
    }
  }

  if (runtime) {
    runtime.activeIndex = -1;
    runtime.currentItems = [];
    runtime.currentQuery = "";
  }

  setSearchVisualState(getDom, false);

  return true;
}

function focusSearchInput(getDom = null, options = {}) {
  const { searchInput } = getDomSafe(getDom);

  if (!searchInput) return false;

  try {
    searchInput.focus({ preventScroll: true });
    if (options.select === true) searchInput.select?.();
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   HANDLERS
========================================================= */

export function createTopbarEventHandlers({
  AppCore = null,
  Router = null,
  runtime = {},
  getDom = null,
  syncTitle = null,
  setMobileToggleState = null,
  syncFixedTopbarOffset = null,
  closeSidebarMobile = null,
  toggleSidebarMobile = null,
  syncDomCache = null,
} = {}) {
  function syncVisual(payload = {}) {
    const detail = eventDetail(payload);
    const path =
      detail.publicPath ||
      detail.path ||
      detail.route ||
      detail.canonicalPath ||
      currentBrowserPath();

    safeCall(syncDomCache);
    safeCall(syncTitle, path);
    safeCall(syncFixedTopbarOffset);

    return true;
  }

  function handleMobileToggleClick(event = null) {
    try {
      event?.preventDefault?.();
      event?.stopPropagation?.();
    } catch {
      // noop
    }

    return false;
  }

  function handleOutsideSidebarClick() {
    return false;
  }

  function handleViewportResize() {
    safeCall(syncDomCache);
    safeCall(syncTitle, currentBrowserPath());
    safeCall(syncFixedTopbarOffset);

    return true;
  }

  function handleSearchCompositionStart() {
    runtime.isComposingSearch = true;
    return true;
  }

  function handleSearchCompositionEnd() {
    runtime.isComposingSearch = false;
    return true;
  }

  function handleSearchInput() {
    return false;
  }

  function handleSearchFocus() {
    return false;
  }

  function handleSearchPointerDown() {
    return false;
  }

  function handleSearchKeydown(event = null) {
    const key = event?.key || "";

    if ((event?.ctrlKey || event?.metaKey) && key.toLowerCase() === "k") {
      try {
        event.preventDefault();
      } catch {
        // noop
      }

      return focusSearchInput(getDom, { select: true });
    }

    if (key === "Escape") {
      try {
        event.preventDefault();
      } catch {
        // noop
      }

      hideSearch(runtime, getDom, { blur: true });
      return true;
    }

    return false;
  }

  function handleSearchOutsidePointer() {
    return false;
  }

  function handleSearchOutsideClick() {
    return false;
  }

  function handleSearchResultsMouseMove() {
    return false;
  }

  function handleSearchResultsClick() {
    return false;
  }

  function handleRouteVisualSync(payload = {}) {
    return syncVisual(payload);
  }

  function handleSearchCloseEvent() {
    return hideSearch(runtime, getDom, { blur: true });
  }

  function handleSearchFocusEvent() {
    return focusSearchInput(getDom, { select: true });
  }

  function handleSearchClearEvent() {
    return hideSearch(runtime, getDom, {
      blur: true,
      clearInput: true,
    });
  }

  void AppCore;
  void Router;
  void setMobileToggleState;
  void closeSidebarMobile;
  void toggleSidebarMobile;

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

export function bindTopbarDomEvents({
  AppCore = null,
  scope = DEFAULT_SCOPE,
  getDom = null,
  handlers = {},
} = {}) {
  if (!isBrowser()) return false;

  const localScope = scopeKey(scope, "dom");
  runCleanups(localScope);

  bind(window, "resize", handlers.handleViewportResize, { passive: true }, localScope);
  bind(window, "orientationchange", handlers.handleViewportResize, { passive: true }, localScope);

  bind(
    document,
    "keydown",
    (event) => {
      const key = event?.key || "";

      if (!((event?.ctrlKey || event?.metaKey) && key.toLowerCase() === "k")) {
        return;
      }

      handlers.handleSearchKeydown?.(event);
    },
    false,
    localScope
  );

  emit(AppCore, "topbar:dom-events:bound", {
    scope: localScope,
    sidebarToggle: false,
    logout: false,
  });

  void getDom;

  return true;
}

export function bindSearchDomEvents({
  scope = DEFAULT_SEARCH_SCOPE,
  getDom = null,
  handlers = {},
} = {}) {
  if (!isBrowser()) return false;

  const localScope = scopeKey(scope, "search");
  runCleanups(localScope);

  const { searchInput } = getDomSafe(getDom);

  if (!searchInput) return false;

  bind(searchInput, "keydown", handlers.handleSearchKeydown, false, localScope);
  bind(searchInput, "compositionstart", handlers.handleSearchCompositionStart, false, localScope);
  bind(searchInput, "compositionend", handlers.handleSearchCompositionEnd, false, localScope);

  return true;
}

/* =========================================================
   APP EVENTS
========================================================= */

function bindAppEvent(
  AppCore = null,
  scope = DEFAULT_SCOPE,
  eventName = "",
  handler = null,
  localScope = scope
) {
  if (!eventName || !isFunction(handler)) return false;

  try {
    if (isFunction(AppCore?.events?.on)) {
      const off = AppCore.events.on(eventName, handler);

      if (isFunction(off)) {
        addCleanup(localScope, off);
      } else if (isFunction(AppCore?.events?.off)) {
        addCleanup(localScope, () => AppCore.events.off(eventName, handler));
      }

      return true;
    }
  } catch {
    // noop
  }

  return false;
}

export function bindTopbarAppEvents({
  AppCore = null,
  scope = DEFAULT_SCOPE,
  getDom = null,
  handlers = {},
  hideResults = null,
  syncTitle = null,
  setMobileToggleState = null,
  syncFixedTopbarOffset = null,
  closeSidebarMobile = null,
  syncDomCache = null,
} = {}) {
  const localScope = scopeKey(scope, "app");
  runCleanups(localScope);

  const sync = (payload = {}) => {
    const detail = eventDetail(payload);
    const path =
      detail.publicPath ||
      detail.path ||
      detail.route ||
      detail.canonicalPath ||
      currentBrowserPath();

    safeCall(syncDomCache);
    safeCall(syncTitle, path);
    safeCall(syncFixedTopbarOffset);

    return true;
  };

  bindAppEvent(AppCore, scope, "router:rendered", sync, localScope);
  bindAppEvent(AppCore, scope, "app:route:change", sync, localScope);

  bindAppEvent(
    AppCore,
    scope,
    "router:before-render",
    () => {
      safeCall(hideResults);
    },
    localScope
  );

  bindAppEvent(AppCore, scope, "topbar:search:close", handlers.handleSearchCloseEvent, localScope);
  bindAppEvent(AppCore, scope, "topbar:search:focus", handlers.handleSearchFocusEvent, localScope);
  bindAppEvent(AppCore, scope, "topbar:search:clear", handlers.handleSearchClearEvent, localScope);

  void getDom;
  void setMobileToggleState;
  void closeSidebarMobile;

  emit(AppCore, "topbar:app-events:bound", {
    scope: localScope,
  });

  return true;
}

/* =========================================================
   CLEANUP / SNAPSHOT
========================================================= */

export function disposeTopbarEvents(scope = DEFAULT_SCOPE) {
  runCleanups(scopeKey(scope, "dom"));
  runCleanups(scopeKey(scope, "search"));
  runCleanups(scopeKey(scope, "app"));
  runCleanups(scope);

  return true;
}

export function getTopbarEventsSnapshot(scope = DEFAULT_SCOPE) {
  return {
    version: TOPBAR_EVENTS_VERSION,

    scope: text(scope, DEFAULT_SCOPE),

    cleanups: {
      dom: cleanups.get(scopeKey(scope, "dom"))?.length || 0,
      search: cleanups.get(scopeKey(scope, "search"))?.length || 0,
      app: cleanups.get(scopeKey(scope, "app"))?.length || 0,
      root: cleanups.get(scope)?.length || 0,
    },

    hasBrowser: isBrowser(),

    policy: {
      compatOnly: true,
      noImports: true,
      noSearchRuntime: true,
      noOverlays: true,
      noHardRebind: true,
      noCustomEvent: true,
      noSidebarToggle: true,
      noLogout: true,
      topbarOwnedByIndex: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  TOPBAR_EVENTS_VERSION,

  createTopbarEventHandlers,
  bindTopbarDomEvents,
  bindSearchDomEvents,
  bindTopbarAppEvents,

  disposeTopbarEvents,
  getTopbarEventsSnapshot,
};
