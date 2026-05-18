/* =========================================================
   Onion Support - Topbar Events
   Archivo: /src/ui/topbar/topbar.events.js

   Responsabilidad:
   - Compat mínima de eventos Topbar.
   - Botón sidebar.
   - Logout/search legacy no-op seguro.
   - Sync visual básico.
   - Sin imports.
   - Sin search runtime.
   - Sin overlays.
   - Sin app event storms.
   - Sin hard rebind.
   - Sin CustomEvent.
   - Sin magia negra.
   - El topbar real vive en src/ui/topbar/index.js.
========================================================= */

export const TOPBAR_EVENTS_VERSION = "simple";

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

function isPrimaryPointer(event = null) {
  return !event || !("button" in event) || event.button === 0;
}

function bind(target = null, eventName = "", handler = null, options = false, scope = DEFAULT_SCOPE) {
  if (!target || !eventName || !isFunction(handler) || !isFunction(target.addEventListener)) {
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
  try {
    return isFunction(getDom) ? getDom() || {} : {};
  } catch {
    return {};
  }
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
    return normalizePath(`${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`);
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
    // noop
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

function hideSearch(runtime = null, getDom = null, options = {}) {
  clearSearchDebounce(runtime);
  abortSearch(runtime);

  const { searchInput, searchResults } = getDomSafe(getDom);

  if (searchResults) {
    try {
      searchResults.hidden = true;
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
    const path = detail.publicPath || detail.path || detail.route || detail.canonicalPath || currentBrowserPath();

    safeCall(syncDomCache);
    safeCall(syncTitle, path);
    safeCall(setMobileToggleState);
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

    safeCall(toggleSidebarMobile);
    safeCall(setMobileToggleState);
    safeCall(syncFixedTopbarOffset);

    return true;
  }

  function handleOutsideSidebarClick(event = null) {
    if (!isPrimaryPointer(event)) return false;

    const target = targetOf(event);

    if (
      target?.closest?.("[data-topbar-sidebar-toggle]") ||
      target?.closest?.("[data-sidebar-root]") ||
      target?.closest?.("#app-sidebar") ||
      target?.closest?.("#sidebar")
    ) {
      return false;
    }

    try {
      if (document.body?.classList?.contains?.("sidebar-open")) {
        safeCall(closeSidebarMobile);
      }
    } catch {
      // noop
    }

    return true;
  }

  function handleViewportResize() {
    safeCall(syncDomCache);
    safeCall(setMobileToggleState);
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

  const { mobileToggle, topbar } = getDomSafe(getDom);
  const root = topbar || query("#app-topbar") || query("#topbar") || query("[data-topbar-root]");

  if (mobileToggle) {
    bind(mobileToggle, "click", handlers.handleMobileToggleClick, false, localScope);

    try {
      mobileToggle.setAttribute("aria-expanded", "false");
    } catch {
      // noop
    }
  }

  if (root) {
    bind(root, "click", (event) => {
      const target = targetOf(event);

      if (target?.closest?.("[data-topbar-sidebar-toggle]")) {
        handlers.handleMobileToggleClick?.(event);
      }
    }, false, localScope);
  }

  bind(document, "click", handlers.handleOutsideSidebarClick, false, localScope);
  bind(window, "resize", handlers.handleViewportResize, { passive: true }, localScope);
  bind(window, "orientationchange", handlers.handleViewportResize, { passive: true }, localScope);

  emit(AppCore, "topbar:dom-events:bound", {
    scope: localScope,
  });

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

  const { searchInput, searchResults } = getDomSafe(getDom);

  if (!searchInput || !searchResults) return false;

  bind(searchInput, "keydown", handlers.handleSearchKeydown, false, localScope);
  bind(searchInput, "compositionstart", handlers.handleSearchCompositionStart, false, localScope);
  bind(searchInput, "compositionend", handlers.handleSearchCompositionEnd, false, localScope);
  bind(searchInput, "input", handlers.handleSearchInput, false, localScope);
  bind(searchInput, "focus", handlers.handleSearchFocus, false, localScope);
  bind(searchResults, "click", handlers.handleSearchResultsClick, false, localScope);

  return true;
}

/* =========================================================
   APP EVENTS
========================================================= */

function bindAppEvent(AppCore = null, scope = DEFAULT_SCOPE, eventName = "", handler = null, localScope = scope) {
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
    const path = detail.publicPath || detail.path || detail.route || detail.canonicalPath || currentBrowserPath();

    safeCall(syncDomCache);
    safeCall(syncTitle, path);
    safeCall(setMobileToggleState);
    safeCall(syncFixedTopbarOffset);

    return true;
  };

  bindAppEvent(AppCore, scope, "router:rendered", sync, localScope);
  bindAppEvent(AppCore, scope, "app:route:change", sync, localScope);
  bindAppEvent(AppCore, scope, "router:before-render", () => {
    safeCall(hideResults);
  }, localScope);

  bindAppEvent(AppCore, scope, "topbar:search:close", handlers.handleSearchCloseEvent, localScope);
  bindAppEvent(AppCore, scope, "topbar:search:focus", handlers.handleSearchFocusEvent, localScope);
  bindAppEvent(AppCore, scope, "topbar:search:clear", handlers.handleSearchClearEvent, localScope);

  void getDom;
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
