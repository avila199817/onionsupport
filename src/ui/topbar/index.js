/* =========================================================
   Onion SPA - Topbar UI
   Archivo: src/ui/topbar/index.js

   FULL PRO SAAS PANEL · EXTREME MODE · 10/10

   Responsabilidades:
   - montar el HTML del topbar desde JS
   - controlar la UI global del topbar
   - sincronizar título de la vista actual
   - gestionar toggle mobile de sidebar
   - bind seguro y rebind tras render SPA
   - integrar buscador global del topbar
   - debounce + abort de peticiones
   - renderizar resultados agrupados
   - soportar navegación por teclado
   - soportar click outside
   - mezclar resultados remotos + fallback local
   - tolerar distintos formatos del backend search
   - cleanup sólido anti duplicados
   - integrarse de forma robusta con SidebarUI
   - alinearse con layout controlado por CSS
   - NO pisar offsets del shell con inline styles
   - registrar API pública en AppCore.modules y window
========================================================= */

import { AppCore } from "../../core/index.js";
import { Router } from "../../router/index.js";

import {
  TOPBAR_SCOPE,
  TOPBAR_SEARCH_SCOPE,
  safeNormalizePath,
  safeNormalizeCanonicalPath,
  getCurrentPublicPath,
} from "./topbar.helpers.js";

import {
  mountTopbar,
  getTopbarDom,
  syncTopbarDomCache,
  prepareTopbarDom,
  isTopbarMounted,
  unmountTopbar,
} from "./topbar.dom.js";

import {
  clearSearchState,
  hideResultsContainer,
} from "./topbar.search.js";

import {
  syncFixedTopbarOffset,
  setMobileToggleState,
  openSidebarMobile,
  closeSidebarMobile,
  toggleSidebarMobile,
  handleViewportResize,
} from "./topbar.sidebar.js";

import {
  createTopbarEventHandlers,
  bindTopbarDomEvents,
  bindSearchDomEvents,
  bindTopbarAppEvents,
} from "./topbar.events.js";

export const TopbarUI = (() => {
  "use strict";

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const SCOPE = TOPBAR_SCOPE;
  const SEARCH_SCOPE = TOPBAR_SEARCH_SCOPE;

  const MODULE_NAME = "TopbarUI";
  const GLOBAL_NAME = "OnionTopbarUI";

  /* =========================================================
     LOCAL STATE
  ========================================================= */

  let initialized = false;
  let handlers = null;

  const runtime = {
    searchController: null,
    searchDebounceTimer: null,

    activeIndex: -1,
    currentItems: [],
    currentQuery: "",

    cache: new Map(),

    openingSearchResult: false,
    isComposingSearch: false,

    bound: false,
    binding: false,
    rebinding: false,

    rebindTimer: null,
    retryTimer: null,

    mountedAt: 0,
    lastTitle: "",
    lastPublicPath: "",
  };

  /* =========================================================
     SAFE HELPERS
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

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function stripQueryAndHash(path = "/") {
    return safeText(path, "/").split("?")[0].split("#")[0] || "/";
  }

  function decodeRouteSegment(segment = "") {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }

  function clearTimer(key = "") {
    const timer = runtime[key];

    if (!timer) return false;

    try {
      window.clearTimeout(timer);
    } catch {
      /* noop */
    }

    runtime[key] = null;
    return true;
  }

  function runCleanup(scope = "") {
    if (!scope) return false;

    try {
      AppCore?.cleanup?.run?.(scope);
      return true;
    } catch {
      return false;
    }
  }

  function getDebugEnabled() {
    return Boolean(AppCore?.config?.debug || AppCore?.state?.debug);
  }

  function debugLog(...args) {
    if (!getDebugEnabled()) return;

    try {
      AppCore?.utils?.log?.(...args);
      return;
    } catch {
      /* noop */
    }

    try {
      console.log(...args);
    } catch {
      /* noop */
    }
  }

  function debugWarn(...args) {
    if (!getDebugEnabled()) return;

    try {
      AppCore?.utils?.warn?.(...args);
      return;
    } catch {
      /* noop */
    }

    try {
      console.warn(...args);
    } catch {
      /* noop */
    }
  }

  /* =========================================================
     DOM HELPERS
  ========================================================= */

  function getDom() {
    return getTopbarDom(AppCore);
  }

  function syncDomCache() {
    return syncTopbarDomCache(AppCore);
  }

  function mount() {
    const topbar = mountTopbar(AppCore);

    if (topbar) {
      runtime.mountedAt = Date.now();
      prepareTopbarDom(topbar);
      syncDomCache();
    }

    return topbar;
  }

  function ensureMounted() {
    if (isTopbarMounted(AppCore)) {
      const dom = syncDomCache();

      if (dom?.topbar) {
        prepareTopbarDom(dom.topbar);
        return dom.topbar;
      }
    }

    return mount();
  }

  /* =========================================================
     SIDEBAR BRIDGE WRAPPERS
  ========================================================= */

  function syncFixedTopbarOffsetSafe() {
    return syncFixedTopbarOffset(getDom);
  }

  function setMobileToggleStateSafe() {
    return setMobileToggleState(getDom);
  }

  function openSidebarMobileSafe() {
    return openSidebarMobile({
      AppCore,
      getDom,
    });
  }

  function closeSidebarMobileSafe() {
    return closeSidebarMobile({
      AppCore,
      getDom,
    });
  }

  function toggleSidebarMobileSafe() {
    return toggleSidebarMobile({
      AppCore,
      getDom,
    });
  }

  function handleViewportResizeSafe() {
    return handleViewportResize(getDom, closeSidebarMobileSafe);
  }

  /* =========================================================
     TOPBAR TITLE
  ========================================================= */

  function getRouteTable() {
    return (
      Router?.routes ||
      Router?.table ||
      Router?.routeTable ||
      Router?.config?.routes ||
      AppCore?.routes ||
      AppCore?.config?.routes ||
      null
    );
  }

  function getRouteTitleFromTable(canonicalPath = "", publicPath = "") {
    const routes = getRouteTable();

    if (!routes || typeof routes !== "object") return "";

    const candidates = [
      canonicalPath,
      publicPath,
      stripQueryAndHash(publicPath),
      stripQueryAndHash(canonicalPath),
    ].filter(Boolean);

    for (const key of candidates) {
      const route = routes[key];

      if (!route) continue;

      const title =
        route.title ||
        route.label ||
        route.name ||
        route.meta?.title ||
        route.meta?.label ||
        "";

      if (title) {
        return String(title);
      }
    }

    return "";
  }

  function resolveRouteTitle(path = "") {
    const publicPath = safeNormalizePath(
      AppCore,
      path || getCurrentPublicPath(AppCore)
    );

    const canonicalPath = safeNormalizeCanonicalPath(
      AppCore,
      stripQueryAndHash(publicPath) || "/"
    );

    const cleanCanonicalPath = stripQueryAndHash(canonicalPath);

    const staticMap = {
      "/": "Onion Support",
      "/home": "Inicio",
      "/dashboard": "Inicio",
      "/incidencias": "Incidencias",
      "/tickets": "Incidencias",
      "/facturas": "Facturas",
      "/usuarios": "Usuarios",
      "/clientes": "Clientes",
      "/cuenta": "Cuenta",
      "/ajustes": "Ajustes",
      "/settings": "Ajustes",
      "/login": "Acceso",
      "/servidor": "Servidor",
    };

    if (staticMap[cleanCanonicalPath]) {
      return staticMap[cleanCanonicalPath];
    }

    const routeTitle = getRouteTitleFromTable(cleanCanonicalPath, publicPath);

    if (routeTitle) {
      return routeTitle;
    }

    if (cleanCanonicalPath === "/") {
      return "Onion Support";
    }

    const pretty = cleanCanonicalPath
      .replace(/^\/+/, "")
      .split("/")
      .filter(Boolean)
      .map((segment) => {
        const clean = decodeRouteSegment(segment)
          .replace(/[-_]+/g, " ")
          .trim();

        if (!clean) return "";

        return clean.charAt(0).toUpperCase() + clean.slice(1);
      })
      .filter(Boolean)
      .join(" · ");

    return pretty || "Onion Support";
  }

  function syncTitle(path = "") {
    const { title } = getDom();

    if (!title) return false;

    const publicPath = safeNormalizePath(
      AppCore,
      path || getCurrentPublicPath(AppCore)
    );

    const nextTitle = resolveRouteTitle(publicPath);

    if (runtime.lastTitle === nextTitle && title.textContent === nextTitle) {
      runtime.lastPublicPath = publicPath;
      return true;
    }

    title.textContent = nextTitle;

    try {
      title.setAttribute("data-route-title", nextTitle);
    } catch {
      /* noop */
    }

    runtime.lastTitle = nextTitle;
    runtime.lastPublicPath = publicPath;

    return true;
  }

  /* =========================================================
     SEARCH HELPERS
  ========================================================= */

  function hideSearchResults() {
    return hideResultsContainer(runtime, getDom);
  }

  function clearSearch(options = {}) {
    const { searchInput } = getDom();

    if (options.clearInput && searchInput) {
      searchInput.value = "";
    }

    if (options.blur && searchInput) {
      try {
        searchInput.blur();
      } catch {
        /* noop */
      }
    }

    clearSearchState(runtime, getDom);

    if (options.clearCache) {
      runtime.cache.clear();
    }

    return true;
  }

  function focusSearch(options = {}) {
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

  /* =========================================================
     HANDLERS
  ========================================================= */

  function getHandlers() {
    if (handlers) return handlers;

    handlers = createTopbarEventHandlers({
      AppCore,
      Router,
      runtime,
      getDom,
      syncTitle,
      setMobileToggleState: setMobileToggleStateSafe,
      syncFixedTopbarOffset: syncFixedTopbarOffsetSafe,
      closeSidebarMobile: closeSidebarMobileSafe,
      toggleSidebarMobile: toggleSidebarMobileSafe,
      syncDomCache,
    });

    return handlers;
  }

  function resetHandlers() {
    handlers = null;
    return true;
  }

  /* =========================================================
     PUBLIC REGISTRATION
  ========================================================= */

  function registerPublicApi() {
    try {
      if (!AppCore.modules || typeof AppCore.modules !== "object") {
        AppCore.modules = {};
      }

      if (typeof AppCore.modules.register === "function") {
        AppCore.modules.register(MODULE_NAME, api);
      } else {
        AppCore.modules[MODULE_NAME] = api;
        AppCore.modules.Topbar = api;
      }
    } catch {
      /* noop */
    }

    try {
      window[GLOBAL_NAME] = api;
      window.TopbarUI = api;
    } catch {
      /* noop */
    }

    return true;
  }

  /* =========================================================
     LIFECYCLE INTERNAL
  ========================================================= */

  function unbind(options = {}) {
    clearTimer("rebindTimer");
    clearTimer("retryTimer");

    runCleanup(SCOPE);
    runCleanup(SEARCH_SCOPE);

    clearSearchState(runtime, getDom);

    runtime.bound = false;
    runtime.binding = false;
    runtime.rebinding = false;
    runtime.openingSearchResult = false;
    runtime.isComposingSearch = false;

    if (options.clearCache) {
      runtime.cache.clear();
    }

    return true;
  }

  function syncVisualState() {
    syncDomCache();

    syncTitle(getCurrentPublicPath(AppCore));
    setMobileToggleStateSafe();
    syncFixedTopbarOffsetSafe();

    return true;
  }

  function bind(options = {}) {
    if (runtime.binding) {
      return runtime.bound;
    }

    runtime.binding = true;

    try {
      const topbar = ensureMounted();

      if (!topbar) {
        runtime.bound = false;
        debugWarn("TopbarUI: no se pudo montar el topbar.");
        return false;
      }

      /*
        Importante:
        - cleanup antes de bind para evitar duplicados
        - no se desmonta DOM
        - no se borra cache salvo petición explícita
      */
      runCleanup(SCOPE);
      runCleanup(SEARCH_SCOPE);

      if (options.resetSearch !== false) {
        clearSearchState(runtime, getDom);
      }

      syncDomCache();
      prepareTopbarDom(topbar);

      const boundHandlers = getHandlers();

      const domOk = bindTopbarDomEvents({
        AppCore,
        scope: SCOPE,
        getDom,
        handlers: {
          ...boundHandlers,
          handleViewportResize: handleViewportResizeSafe,
        },
      });

      const searchOk = bindSearchDomEvents({
        AppCore,
        scope: SEARCH_SCOPE,
        getDom,
        handlers: boundHandlers,
      });

      const appOk = bindTopbarAppEvents({
        AppCore,
        scope: SCOPE,
        getDom,
        handlers: boundHandlers,
        hideResults: hideSearchResults,
        syncTitle,
        setMobileToggleState: setMobileToggleStateSafe,
        syncFixedTopbarOffset: syncFixedTopbarOffsetSafe,
        closeSidebarMobile: closeSidebarMobileSafe,
        syncDomCache,
        rebind: queueRebind,
      });

      syncVisualState();

      runtime.bound = Boolean(domOk && appOk);
      runtime.binding = false;

      if (!searchOk) {
        debugWarn("TopbarUI: buscador no enlazado; faltan nodos search.");
      }

      return runtime.bound;
    } catch (error) {
      runtime.bound = false;
      runtime.binding = false;

      debugWarn("TopbarUI: error en bind.", error);
      return false;
    }
  }

  function queueRebind(delay = 0) {
    clearTimer("rebindTimer");

    runtime.rebindTimer = window.setTimeout(() => {
      runtime.rebindTimer = null;
      rebind();
    }, Math.max(0, Number(delay) || 0));

    return true;
  }

  function rebind(options = {}) {
    if (runtime.rebinding) {
      return runtime.bound;
    }

    runtime.rebinding = true;

    try {
      syncDomCache();

      const { topbar } = getDom();

      if (!topbar?.isConnected) {
        mount();
      }

      resetHandlers();

      const result = bind({
        resetSearch: options.resetSearch !== false,
      });

      runtime.rebinding = false;

      return result;
    } catch (error) {
      runtime.rebinding = false;
      debugWarn("TopbarUI: error en rebind.", error);
      return false;
    }
  }

  function retryBind() {
    clearTimer("retryTimer");

    runtime.retryTimer = window.setTimeout(() => {
      runtime.retryTimer = null;

      mount();
      syncDomCache();

      const done = bind();

      if (!done) {
        debugWarn("TopbarUI: retry bind fallido.");
      }
    }, 120);

    return true;
  }

  /* =========================================================
     PUBLIC LIFECYCLE
  ========================================================= */

  function init() {
    registerPublicApi();

    if (initialized) {
      const mounted = ensureMounted();

      if (!mounted) {
        retryBind();
        return true;
      }

      if (!runtime.bound) {
        bind();
      } else {
        syncVisualState();
      }

      return true;
    }

    initialized = true;

    const mounted = ensureMounted();

    if (!mounted) {
      retryBind();
      return true;
    }

    const done = bind();

    if (!done) {
      retryBind();
    }

    debugLog("TopbarUI inicializado correctamente.");

    return true;
  }

  function render(options = {}) {
    const topbar = ensureMounted();

    if (!topbar) {
      retryBind();
      return false;
    }

    syncDomCache();
    prepareTopbarDom(topbar);
    syncVisualState();

    if (options.rebind !== false) {
      bind({
        resetSearch: options.resetSearch !== false,
      });
    }

    return true;
  }

  function refresh(options = {}) {
    syncDomCache();
    syncVisualState();

    if (options.rebind) {
      return rebind({
        resetSearch: options.resetSearch !== false,
      });
    }

    return true;
  }

  function destroy(options = {}) {
    unbind({
      clearCache: options.clearCache === true,
    });

    resetHandlers();

    if (options.unmount === true) {
      unmountTopbar(AppCore);
    }

    if (options.keepInitialized !== true) {
      initialized = false;
    }

    try {
      if (window[GLOBAL_NAME] === api) {
        delete window[GLOBAL_NAME];
      }

      if (window.TopbarUI === api) {
        delete window.TopbarUI;
      }
    } catch {
      /* noop */
    }

    return true;
  }

  /* =========================================================
     DEBUG / STATE API
  ========================================================= */

  function getState() {
    const dom = getDom();

    return {
      initialized,
      bound: runtime.bound,
      binding: runtime.binding,
      rebinding: runtime.rebinding,

      mounted: Boolean(dom.topbar?.isConnected),

      search: {
        activeIndex: runtime.activeIndex,
        currentQuery: runtime.currentQuery,
        currentItems: [...runtime.currentItems],
        cacheSize: runtime.cache.size,
        hasController: Boolean(runtime.searchController),
        hasDebounceTimer: Boolean(runtime.searchDebounceTimer),
        openingSearchResult: runtime.openingSearchResult,
        isComposingSearch: runtime.isComposingSearch,
      },

      title: runtime.lastTitle,
      publicPath: runtime.lastPublicPath,

      dom: {
        topbar: Boolean(dom.topbar),
        title: Boolean(dom.title),
        mobileToggle: Boolean(dom.mobileToggle),
        searchWrap: Boolean(dom.searchWrap),
        searchInput: Boolean(dom.searchInput),
        searchResults: Boolean(dom.searchResults),
        sidebar: Boolean(dom.sidebar),
        mainContent: Boolean(dom.mainContent),
        appContent: Boolean(dom.appContent),
      },
    };
  }

  function clearSearchCache() {
    runtime.cache.clear();
    return true;
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */

  const api = {
    init,
    render,
    refresh,

    bind,
    rebind,
    queueRebind,
    destroy,

    mountTopbar: mount,
    unmountTopbar: (options = {}) => {
      unbind({
        clearCache: options.clearCache === true,
      });

      resetHandlers();
      initialized = false;

      return unmountTopbar(AppCore);
    },

    syncDomCache,
    getDom,

    syncTitle,
    resolveRouteTitle,

    openSidebarMobile: openSidebarMobileSafe,
    closeSidebarMobile: closeSidebarMobileSafe,
    toggleSidebarMobile: toggleSidebarMobileSafe,
    syncFixedTopbarOffset: syncFixedTopbarOffsetSafe,
    setMobileToggleState: setMobileToggleStateSafe,
    handleViewportResize: handleViewportResizeSafe,

    hideSearchResults,
    clearSearch,
    focusSearch,
    clearSearchCache,

    getState,

    get runtime() {
      return runtime;
    },

    get initialized() {
      return initialized;
    },

    get bound() {
      return runtime.bound;
    },
  };

  registerPublicApi();

  return api;
})();

export default TopbarUI;
