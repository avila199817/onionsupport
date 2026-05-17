/* =========================================================
   Onion SPA - Topbar UI
   Archivo: src/ui/topbar/index.js

   TOPBAR UI · SIMPLE ORCHESTRATOR
   - monta topbar
   - bind idempotente
   - título por ruta
   - search runtime básico
   - bridge mobile con SidebarUI
   - registro público en AppCore/window
   - sin rebinds implícitos ni event storms
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
  isSearchFocusActive,
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

export const TOPBAR_UI_VERSION = "topbar-ui-v16-simple";

export const TopbarUI = (() => {
  "use strict";

  const SOURCE = "TopbarUI";
  const OWNER = "index.js";
  const LOG_PREFIX = "[TopbarUI]";

  const SCOPE = TOPBAR_SCOPE;
  const SEARCH_SCOPE = TOPBAR_SEARCH_SCOPE;
  const TITLE_DEFAULT = "Onion Support";
  const RETRY_BIND_DELAY_MS = 120;

  const MODULE_NAMES = Object.freeze(["topbar", "Topbar", "topbarUI", "TopbarUI"]);
  const GLOBAL_NAMES = Object.freeze(["TopbarUI", "OnionTopbarUI"]);

  let initialized = false;
  let handlers = null;
  let publicApiRegistered = false;

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
    lastBindAt: 0,
    lastBindReason: "",
    bindGeneration: 0,
    refreshCount: 0,
    hardRebindCount: 0,
    cleanupCount: 0,
    lastError: null,
  };

  /* =======================================================
     BASICS
  ======================================================= */

  function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  function hasWindow() {
    return typeof window !== "undefined";
  }

  function isFn(value) {
    return typeof value === "function";
  }

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) return fallback;

    const text = String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return text || fallback;
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function nowMs() {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  }

  function iso(ms = nowMs()) {
    try {
      return new Date(ms).toISOString();
    } catch {
      return "";
    }
  }

  function optionsOf(value = {}, fallbackReason = "topbar") {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return { ...value, reason: safeText(value.reason, fallbackReason) };
    }

    return { reason: safeText(value, fallbackReason) };
  }

  function stripQueryAndHash(path = "/") {
    return safeText(path, "/").split("?")[0].split("#")[0] || "/";
  }

  function decodeSegment(segment = "") {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }

  function connected(node = null) {
    if (!node) return false;

    try {
      if (typeof node.isConnected === "boolean") return node.isConnected;
    } catch {}

    try {
      return document.contains(node);
    } catch {
      return false;
    }
  }

  function safeSetTimeout(callback, ms = 0) {
    if (!isFn(callback)) return null;

    const delay = Math.max(0, Number(ms) || 0);

    if (!isBrowser()) {
      try {
        callback();
      } catch (error) {
        runtime.lastError = error;
      }
      return null;
    }

    try {
      return window.setTimeout(() => {
        try {
          callback();
        } catch (error) {
          runtime.lastError = error;
        }
      }, delay);
    } catch (error) {
      runtime.lastError = error;
      return null;
    }
  }

  function clearTimer(key = "") {
    const timer = runtime[key];
    if (!timer) return false;

    try {
      if (hasWindow()) window.clearTimeout(timer);
    } catch {}

    runtime[key] = null;
    return true;
  }

  function abortController(controller = null) {
    if (!controller) return false;

    try {
      controller.abort();
      return true;
    } catch (error) {
      runtime.lastError = error;
      return false;
    }
  }

  function cancelSearchRuntime() {
    clearTimer("searchDebounceTimer");
    abortController(runtime.searchController);

    runtime.searchController = null;
    runtime.openingSearchResult = false;
    runtime.isComposingSearch = false;

    return true;
  }

  function runCleanup(scope = "") {
    const cleanScope = safeText(scope, "");
    if (!cleanScope) return false;

    try {
      AppCore?.cleanup?.run?.(cleanScope);
      runtime.cleanupCount += 1;
      return true;
    } catch (error) {
      runtime.lastError = error;
      return false;
    }
  }

  function debugEnabled() {
    return Boolean(AppCore?.config?.debug || AppCore?.state?.debug);
  }

  function debugWarn(...args) {
    if (!debugEnabled()) return;

    try {
      AppCore?.utils?.warn?.(LOG_PREFIX, ...args);
      return;
    } catch {}

    try {
      console.warn(LOG_PREFIX, ...args);
    } catch {}
  }

  function safeEmit(eventName = "", payload = {}) {
    const name = safeText(eventName, "");
    if (!name) return false;

    const data = safeObject(payload);
    const detail = {
      ...data,
      source: safeText(data.source, SOURCE),
      owner: OWNER,
      version: TOPBAR_UI_VERSION,
      at: safeText(data.at, iso()),
      ts: data.ts || nowMs(),
    };

    try {
      if (isFn(AppCore?.events?.emit)) {
        AppCore.events.emit(name, detail);
        return true;
      }
    } catch (error) {
      runtime.lastError = error;
    }

    try {
      if (isBrowser() && typeof CustomEvent !== "undefined") {
        window.dispatchEvent(new CustomEvent(name, { detail }));
        return true;
      }
    } catch (error) {
      runtime.lastError = error;
    }

    return false;
  }

  /* =======================================================
     DOM
  ======================================================= */

  function getDom() {
    return getTopbarDom(AppCore);
  }

  function syncDomCache() {
    return syncTopbarDomCache(AppCore);
  }

  function mount() {
    const topbar = mountTopbar(AppCore);

    if (topbar) {
      runtime.mountedAt = nowMs();
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

  function ensureMountedConnected() {
    const topbar = ensureMounted();
    return topbar && connected(topbar) ? topbar : null;
  }

  /* =======================================================
     SIDEBAR BRIDGE
  ======================================================= */

  function syncFixedTopbarOffsetSafe() {
    return syncFixedTopbarOffset(getDom);
  }

  function setMobileToggleStateSafe() {
    return setMobileToggleState(getDom);
  }

  function openSidebarMobileSafe() {
    return openSidebarMobile({ AppCore, getDom });
  }

  function closeSidebarMobileSafe() {
    return closeSidebarMobile({ AppCore, getDom });
  }

  function toggleSidebarMobileSafe() {
    return toggleSidebarMobile({ AppCore, getDom });
  }

  function handleViewportResizeSafe() {
    return handleViewportResize(getDom, closeSidebarMobileSafe);
  }

  /* =======================================================
     TITLE
  ======================================================= */

  function routeTable() {
    return Router?.routes || Router?.table || Router?.routeTable || Router?.config?.routes || AppCore?.routes || AppCore?.config?.routes || null;
  }

  function routeTitle(route = null) {
    if (!route) return "";
    return safeText(route.title || route.label || route.name || route.meta?.title || route.meta?.label || "", "");
  }

  function titleFromRouteTable(canonicalPath = "", publicPath = "") {
    const routes = routeTable();
    if (!routes) return "";

    const candidates = [canonicalPath, publicPath, stripQueryAndHash(publicPath), stripQueryAndHash(canonicalPath)].filter(Boolean);

    if (Array.isArray(routes)) {
      for (const candidate of candidates) {
        const clean = stripQueryAndHash(candidate);
        const title = routeTitle(routes.find((item) => stripQueryAndHash(item?.path || "") === clean));
        if (title) return title;
      }
      return "";
    }

    if (typeof routes !== "object") return "";

    for (const candidate of candidates) {
      const clean = stripQueryAndHash(candidate);
      const title = routeTitle(routes[candidate] || routes[clean]);
      if (title) return title;
    }

    return "";
  }

  function resolveRouteTitle(path = "") {
    const publicPath = safeNormalizePath(AppCore, path || getCurrentPublicPath(AppCore));
    const canonicalPath = safeNormalizeCanonicalPath(AppCore, stripQueryAndHash(publicPath) || "/");
    const clean = stripQueryAndHash(canonicalPath);

    const staticTitles = {
      "/": TITLE_DEFAULT,
      "/home": "Inicio",
      "/dashboard": "Inicio",
      "/inicio": "Inicio",
      "/incidencias": "Incidencias",
      "/tickets": "Incidencias",
      "/facturas": "Facturas",
      "/usuarios": "Usuarios",
      "/users": "Usuarios",
      "/clientes": "Clientes",
      "/clients": "Clientes",
      "/cuenta": "Cuenta",
      "/account": "Cuenta",
      "/ajustes": "Ajustes",
      "/settings": "Ajustes",
      "/login": "Acceso",
      "/activate-account": "Activar cuenta",
      "/reset-password": "Restablecer contraseña",
      "/reset-password/confirm": "Confirmar contraseña",
      "/forgot-password": "Recuperar contraseña",
      "/recover-password": "Recuperar contraseña",
      "/password-reset": "Recuperar contraseña",
      "/servidor": "Servidor",
      "/server": "Servidor",
    };

    if (staticTitles[clean]) return staticTitles[clean];

    const configured = titleFromRouteTable(clean, publicPath);
    if (configured) return configured;

    const pretty = clean
      .replace(/^\/+/, "")
      .split("/")
      .filter(Boolean)
      .map((segment) => {
        const decoded = decodeSegment(segment).replace(/[-_]+/g, " ").trim();
        return decoded ? decoded.charAt(0).toUpperCase() + decoded.slice(1) : "";
      })
      .filter(Boolean)
      .join(" · ");

    return pretty || TITLE_DEFAULT;
  }

  function syncTitle(path = "") {
    const { title } = getDom();
    if (!title) return false;

    const publicPath = safeNormalizePath(AppCore, path || getCurrentPublicPath(AppCore));
    const nextTitle = resolveRouteTitle(publicPath);

    if (runtime.lastTitle === nextTitle && title.textContent === nextTitle) {
      runtime.lastPublicPath = publicPath;
      return true;
    }

    try {
      title.textContent = nextTitle;
      title.setAttribute("data-route-title", nextTitle);
    } catch (error) {
      runtime.lastError = error;
      return false;
    }

    runtime.lastTitle = nextTitle;
    runtime.lastPublicPath = publicPath;

    return true;
  }

  /* =======================================================
     SEARCH
  ======================================================= */

  function hideSearchResults() {
    return hideResultsContainer(runtime, getDom);
  }

  function clearSearch(options = {}) {
    const opts = optionsOf(options, "clear-search");
    const { searchInput } = getDom();

    if (opts.clearInput && searchInput) {
      try {
        searchInput.value = "";
      } catch (error) {
        runtime.lastError = error;
      }
    }

    if (opts.blur && searchInput) {
      try {
        searchInput.blur();
      } catch (error) {
        runtime.lastError = error;
      }
    }

    cancelSearchRuntime();
    clearSearchState(runtime, getDom);

    if (opts.clearCache) runtime.cache.clear();

    return true;
  }

  function focusSearch(options = {}) {
    const opts = optionsOf(options, "focus-search");
    const { searchInput } = getDom();
    if (!searchInput) return false;

    try {
      searchInput.focus({ preventScroll: opts.preventScroll !== false });
      if (opts.select) searchInput.select?.();
      return true;
    } catch {
      try {
        searchInput.focus();
        return true;
      } catch (error) {
        runtime.lastError = error;
        return false;
      }
    }
  }

  function clearSearchCache() {
    runtime.cache.clear();
    return true;
  }

  /* =======================================================
     HANDLERS
  ======================================================= */

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

  /* =======================================================
     REGISTRATION
  ======================================================= */

  function registeredModule(name = "") {
    const clean = safeText(name, "");
    if (!clean) return null;

    try {
      const value = AppCore?.modules?.get?.(clean);
      if (value) return value;
    } catch {}

    try {
      const value = AppCore?.registry?.modules?.get?.(clean);
      if (value) return value;
    } catch {}

    try {
      return AppCore?.modules?.[clean] || null;
    } catch {
      return null;
    }
  }

  function registerModule(name = "") {
    const clean = safeText(name, "");
    if (!clean || registeredModule(clean) === api) return false;

    let changed = false;

    try {
      if (isFn(AppCore?.modules?.register)) {
        const result = AppCore.modules.register(clean, api, {
          replace: true,
          overwrite: true,
          silentDuplicate: true,
          source: SOURCE,
        });
        changed = result !== false;
      }
    } catch (error) {
      runtime.lastError = error;
    }

    if (!changed) {
      try {
        if (isFn(AppCore?.modules?.set)) {
          const result = AppCore.modules.set(clean, api, {
            replace: true,
            overwrite: true,
            silentDuplicate: true,
            source: SOURCE,
          });
          changed = result !== false;
        }
      } catch (error) {
        runtime.lastError = error;
      }
    }

    if (!changed) {
      try {
        if (!AppCore.modules || typeof AppCore.modules !== "object") AppCore.modules = {};
        AppCore.modules[clean] = api;
        changed = true;
      } catch (error) {
        runtime.lastError = error;
      }
    }

    try {
      AppCore?.registry?.modules?.set?.(clean, api);
      changed = true;
    } catch {}

    return changed;
  }

  function registerPublicApi() {
    let changed = false;

    for (const name of MODULE_NAMES) {
      if (registerModule(name)) changed = true;
    }

    try {
      if (isBrowser()) {
        for (const name of GLOBAL_NAMES) {
          if (window[name] !== api) {
            window[name] = api;
            changed = true;
          }
        }
      }
    } catch (error) {
      runtime.lastError = error;
    }

    publicApiRegistered = true;
    return changed;
  }

  function unregisterWindowApi() {
    try {
      if (!isBrowser()) return false;

      for (const name of GLOBAL_NAMES) {
        if (window[name] === api) delete window[name];
      }

      return true;
    } catch (error) {
      runtime.lastError = error;
      return false;
    }
  }

  /* =======================================================
     LIFECYCLE INTERNAL
  ======================================================= */

  function unbind(options = {}) {
    const opts = optionsOf(options, "unbind");

    clearTimer("rebindTimer");
    clearTimer("retryTimer");
    cancelSearchRuntime();
    runCleanup(SCOPE);
    runCleanup(SEARCH_SCOPE);
    clearSearchState(runtime, getDom);

    runtime.bound = false;
    runtime.binding = false;
    runtime.openingSearchResult = false;
    runtime.isComposingSearch = false;

    if (opts.clearCache) runtime.cache.clear();

    safeEmit("topbar:unbound", {
      reason: opts.reason || "unbind",
      cleanupCount: runtime.cleanupCount,
    });

    return true;
  }

  function syncVisualState(options = {}) {
    const opts = optionsOf(options, "sync-visual-state");
    const topbar = ensureMounted();

    if (!topbar) return false;

    syncDomCache();
    prepareTopbarDom(topbar);
    syncTitle(opts.path || opts.publicPath || getCurrentPublicPath(AppCore));
    setMobileToggleStateSafe();
    syncFixedTopbarOffsetSafe();

    runtime.refreshCount += 1;
    return true;
  }

  function bind(options = {}) {
    const opts = optionsOf(options, "bind");
    const reason = opts.reason || "bind";

    if (runtime.binding) return runtime.bound;

    if (runtime.bound && opts.force !== true) {
      syncVisualState({ ...opts, reason: `bind-skip:${reason}` });
      return true;
    }

    runtime.binding = true;

    try {
      const topbar = ensureMountedConnected();

      if (!topbar) {
        runtime.bound = false;
        debugWarn("Topbar no montado.", { reason });
        return false;
      }

      if (opts.cleanupBeforeBind === true) {
        runCleanup(SCOPE);
        runCleanup(SEARCH_SCOPE);
      }

      if (opts.resetSearch !== false) clearSearchState(runtime, getDom);

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

      syncVisualState({ ...opts, reason: `bind:${reason}` });

      runtime.bound = Boolean(domOk && appOk);
      runtime.lastBindAt = nowMs();
      runtime.lastBindReason = reason;
      runtime.bindGeneration += 1;

      if (!searchOk) debugWarn("Search no enlazado; nodos opcionales ausentes.", { reason });

      safeEmit("topbar:events:bound", {
        reason,
        bound: runtime.bound,
        domOk: Boolean(domOk),
        searchOk: Boolean(searchOk),
        appOk: Boolean(appOk),
        generation: runtime.bindGeneration,
      });

      return runtime.bound;
    } catch (error) {
      runtime.bound = false;
      runtime.lastError = error;
      debugWarn("Error en bind.", error);
      return false;
    } finally {
      runtime.binding = false;
    }
  }

  function refreshInternal(options = {}) {
    const opts = optionsOf(options, "refresh");
    const topbar = ensureMounted();

    if (!topbar) {
      retryBind({ reason: `refresh-missing-topbar:${opts.reason || ""}` });
      return false;
    }

    return syncVisualState(opts);
  }

  function hardRebind(options = {}) {
    const opts = optionsOf(options, "hard-rebind");

    if (runtime.rebinding) return runtime.bound;

    runtime.rebinding = true;

    try {
      runtime.hardRebindCount += 1;
      unbind({ clearCache: opts.clearCache === true, reason: opts.reason || "hard-rebind" });
      resetHandlers();

      if (!ensureMounted()) {
        retryBind({ reason: "hard-rebind-missing-topbar" });
        return false;
      }

      return bind({
        ...opts,
        reason: opts.reason || "hard-rebind",
        force: true,
        cleanupBeforeBind: false,
        resetSearch: opts.resetSearch !== false,
      });
    } catch (error) {
      runtime.lastError = error;
      debugWarn("Error en hardRebind.", error);
      return false;
    } finally {
      runtime.rebinding = false;
    }
  }

  function rebind(options = {}) {
    const opts = optionsOf(options, "rebind");

    if (opts.force === true || opts.hard === true || opts.explicit === true) return hardRebind(opts);
    return refreshInternal({ ...opts, reason: opts.reason || "rebind-soft" });
  }

  function queueRebind(delayOrOptions = 0, maybeOptions = {}) {
    const delay = delayOrOptions && typeof delayOrOptions === "object" ? 0 : Math.max(0, Number(delayOrOptions) || 0);
    const opts = delayOrOptions && typeof delayOrOptions === "object" ? optionsOf(delayOrOptions, "queue-rebind") : optionsOf(maybeOptions, "queue-rebind");

    clearTimer("rebindTimer");

    runtime.rebindTimer = safeSetTimeout(() => {
      runtime.rebindTimer = null;

      if (opts.force === true || opts.hard === true || opts.explicit === true) {
        hardRebind({ ...opts, reason: opts.reason || "queue-hard-rebind" });
        return;
      }

      refreshInternal({ ...opts, reason: opts.reason || "queue-refresh" });
    }, delay);

    return true;
  }

  function retryBind(options = {}) {
    const opts = optionsOf(options, "retry-bind");

    clearTimer("retryTimer");

    runtime.retryTimer = safeSetTimeout(() => {
      runtime.retryTimer = null;
      mount();
      syncDomCache();

      const ok = bind({ reason: opts.reason || "retry-bind", force: false });
      if (!ok) debugWarn("Retry bind fallido.", { reason: opts.reason || "retry-bind" });
    }, opts.delayMs || RETRY_BIND_DELAY_MS);

    return true;
  }

  /* =======================================================
     PUBLIC LIFECYCLE
  ======================================================= */

  function init(options = {}) {
    const opts = optionsOf(options, "init");

    registerPublicApi();

    if (initialized) {
      const topbar = ensureMounted();

      if (!topbar) {
        retryBind({ reason: "init-already-missing-topbar" });
        return true;
      }

      if (!runtime.bound) bind({ reason: "init-already-not-bound" });
      else syncVisualState({ reason: "init-already-bound" });

      return true;
    }

    initialized = true;

    if (!ensureMounted()) {
      retryBind({ reason: "init-missing-topbar" });
      return true;
    }

    const ok = bind({ ...opts, reason: opts.reason || "init" });
    if (!ok) retryBind({ reason: "init-bind-failed" });

    safeEmit("topbar:ready", {
      initialized: true,
      bound: Boolean(runtime.bound),
      snapshot: getState(),
    });

    return true;
  }

  function render(options = {}) {
    const opts = optionsOf(options, "render");

    if (!ensureMounted()) {
      retryBind({ reason: "render-missing-topbar" });
      return false;
    }

    syncDomCache();
    syncVisualState({ ...opts, reason: opts.reason || "render" });

    return opts.rebind === true ? rebind({ ...opts, reason: opts.reason || "render:explicit-rebind" }) : true;
  }

  function refresh(options = {}) {
    const opts = optionsOf(options, "refresh");
    const ok = refreshInternal({ ...opts, reason: opts.reason || "refresh" });

    if (opts.rebind === true) return rebind({ ...opts, reason: opts.reason || "refresh:explicit-rebind" });
    return ok;
  }

  function sync(options = {}) {
    const opts = optionsOf(options, "sync");
    return refresh({ ...opts, rebind: false, reason: opts.reason || "sync" });
  }

  function renderUser(options = {}) {
    const opts = optionsOf(options, "render-user");
    return sync({ ...opts, reason: opts.reason || "render-user" });
  }

  function refreshUser(options = {}) {
    const opts = optionsOf(options, "refresh-user");
    return sync({ ...opts, reason: opts.reason || "refresh-user" });
  }

  function updateUser(options = {}) {
    const opts = optionsOf(options, "update-user");
    return sync({ ...opts, reason: opts.reason || "update-user" });
  }

  function syncUser(options = {}) {
    const opts = optionsOf(options, "sync-user");
    return sync({ ...opts, reason: opts.reason || "sync-user" });
  }

  function destroy(options = {}) {
    const opts = optionsOf(options, "destroy");

    unbind({ clearCache: opts.clearCache === true, reason: opts.reason || "destroy" });
    resetHandlers();

    if (opts.unmount === true) unmountTopbar(AppCore);
    if (opts.keepInitialized !== true) initialized = false;

    publicApiRegistered = false;
    unregisterWindowApi();

    safeEmit("topbar:destroyed", { reason: opts.reason || "destroy" });
    return true;
  }

  /* =======================================================
     STATE / DEBUG
  ======================================================= */

  function getState() {
    const dom = getDom();

    return {
      version: TOPBAR_UI_VERSION,
      initialized: Boolean(initialized),
      publicApiRegistered: Boolean(publicApiRegistered),
      bound: Boolean(runtime.bound),
      binding: Boolean(runtime.binding),
      rebinding: Boolean(runtime.rebinding),
      mounted: Boolean(dom.topbar?.isConnected),
      mountedAt: runtime.mountedAt,
      lastBindAt: runtime.lastBindAt,
      lastBindReason: runtime.lastBindReason,
      bindGeneration: runtime.bindGeneration,
      refreshCount: runtime.refreshCount,
      hardRebindCount: runtime.hardRebindCount,
      cleanupCount: runtime.cleanupCount,
      lastError: runtime.lastError,
      title: runtime.lastTitle,
      publicPath: runtime.lastPublicPath,
      search: {
        focusActive: isSearchFocusActive(),
        activeIndex: runtime.activeIndex,
        currentQuery: runtime.currentQuery,
        currentItems: [...runtime.currentItems],
        cacheSize: runtime.cache.size,
        hasController: Boolean(runtime.searchController),
        hasDebounceTimer: Boolean(runtime.searchDebounceTimer),
        openingSearchResult: runtime.openingSearchResult,
        isComposingSearch: runtime.isComposingSearch,
      },
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
        viewContainer: Boolean(dom.viewContainer),
      },
      modules: Object.fromEntries(MODULE_NAMES.map((name) => [name, registeredModule(name) === api])),
    };
  }

  function getSnapshot() {
    return getState();
  }

  /* =======================================================
     PUBLIC API
  ======================================================= */

  const api = {
    version: TOPBAR_UI_VERSION,

    init,
    render,
    refresh,
    sync,

    renderUser,
    refreshUser,
    updateUser,
    syncUser,

    bind,
    rebind,
    hardRebind,
    queueRebind,
    destroy,

    mountTopbar: mount,

    unmountTopbar: (options = {}) => {
      const opts = optionsOf(options, "unmount-topbar");

      unbind({ clearCache: opts.clearCache === true, reason: opts.reason || "unmount-topbar" });
      resetHandlers();
      initialized = false;
      publicApiRegistered = false;
      unregisterWindowApi();

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
    getSnapshot,

    get runtime() {
      return runtime;
    },

    get initialized() {
      return initialized;
    },

    get bound() {
      return runtime.bound;
    },

    get binding() {
      return runtime.binding;
    },

    get rebinding() {
      return runtime.rebinding;
    },
  };

  registerPublicApi();

  return api;
})();

export default TopbarUI;
