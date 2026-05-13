/* =========================================================
   Onion SPA - Topbar UI
   Archivo: src/ui/topbar/index.js

   ONION SUPPORT · TOPBAR UI ORCHESTRATOR · 15/10
   NO-STORM · NO REBIND DEFAULT · COMMAND PALETTE SAFE

   Responsabilidades:
   - Montar el HTML del topbar desde JS.
   - Controlar la UI global del topbar.
   - Sincronizar título de la vista actual.
   - Gestionar toggle mobile de sidebar.
   - Integrar buscador global del topbar.
   - Debounce + abort de peticiones.
   - Renderizar resultados agrupados vía topbar.search.js/topbar.events.js.
   - Soportar navegación por teclado.
   - Soportar click outside.
   - Tolerar distintos formatos del backend search.
   - Cleanup sólido anti duplicados.
   - Integrarse de forma robusta con SidebarUI.
   - Alinearse con layout controlado por CSS.
   - NO pisar offsets del shell con inline styles desde index.js.
   - Registrar API pública en AppCore.modules y window.

   CONTRATO SEARCH:
   - index.js NO crea overlays.
   - index.js NO pinta glass.
   - index.js NO toca style="".
   - topbar.search.js sólo activa clases/data attrs.
   - topbar.css pinta el command palette y el glass sobre .main-content.

   FIX CRÍTICO EVENT STORM:
   - init() repetido NO rebindea si ya está bound.
   - render() NO rebindea por defecto.
   - refresh() NO rebindea por defecto.
   - sync() es alias ligero de refresh().
   - renderUser/refreshUser/updateUser/syncUser son ligeros.
   - queueRebind() por defecto hace refresh ligero, no cleanup+bind.
   - rebind() sólo hace hard rebind con { force/hard/explicit: true }.
   - hardRebind() es la vía explícita para cleanup + bind.
   - AppCore.cleanup.run() sólo se usa en unbind/hardRebind/destroy.
   - Evita cleanup:disposed/firebreak en router/auth/lang/render.

   ARQUITECTURA:
   - topbar.dom.js     = DOM/mount/cache.
   - topbar.search.js  = estado visual search/results.
   - topbar.sidebar.js = puente con SidebarUI.
   - topbar.events.js  = listeners DOM/app/search.
   - index.js          = orquestador público.
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

export const TOPBAR_UI_VERSION =
  "topbar-ui-v15-no-storm-orchestrator";

export const TopbarUI = (() => {
  "use strict";

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const SOURCE =
    "TopbarUI";

  const OWNER =
    "index.js";

  const LOG_PREFIX =
    "[TopbarUI]";

  const SCOPE =
    TOPBAR_SCOPE;

  const SEARCH_SCOPE =
    TOPBAR_SEARCH_SCOPE;

  const MODULE_NAMES =
    Object.freeze([
      "topbar",
      "Topbar",
      "topbarUI",
      "TopbarUI",
    ]);

  const GLOBAL_NAMES =
    Object.freeze([
      "TopbarUI",
      "OnionTopbarUI",
    ]);

  const BIND_DEDUP_WINDOW_MS =
    180;

  const SOFT_REBIND_DELAY_MS =
    0;

  const RETRY_BIND_DELAY_MS =
    120;

  const TITLE_DEFAULT =
    "Onion Support";

  /* =========================================================
     LOCAL STATE
  ========================================================= */

  let initialized =
    false;

  let handlers =
    null;

  let publicApiRegistered =
    false;

  const runtime =
    {
      searchController:
        null,

      searchDebounceTimer:
        null,

      activeIndex:
        -1,

      currentItems:
        [],

      currentQuery:
        "",

      cache:
        new Map(),

      openingSearchResult:
        false,

      isComposingSearch:
        false,

      bound:
        false,

      binding:
        false,

      rebinding:
        false,

      rebindTimer:
        null,

      retryTimer:
        null,

      mountedAt:
        0,

      lastTitle:
        "",

      lastPublicPath:
        "",

      lastBindAt:
        0,

      lastBindReason:
        "",

      bindGeneration:
        0,

      softRefreshCount:
        0,

      hardRebindCount:
        0,

      cleanupCount:
        0,

      lastError:
        null,
    };

  /* =========================================================
     SAFE HELPERS
  ========================================================= */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

  function hasWindow() {
    return typeof window !== "undefined";
  }

  function isFunction(value) {
    return typeof value === "function";
  }

  function safeText(value, fallback = "") {
    if (
      value === null ||
      value === undefined
    ) {
      return fallback;
    }

    const text =
      String(value)
        .replace(/[\r\n\t]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    return text || fallback;
  }

  function safeObject(value) {
    return (
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    )
      ? value
      : {};
  }

  function safeArray(value) {
    return Array.isArray(value)
      ? value
      : [];
  }

  function nowMs() {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  }

  function safeIsoDate(ms = nowMs()) {
    try {
      return new Date(ms).toISOString();
    } catch {
      return "";
    }
  }

  function normalizeOptions(value = {}, fallbackReason = "") {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      return {
        ...value,

        reason:
          safeText(
            value.reason,
            fallbackReason
          ),
      };
    }

    return {
      reason:
        safeText(
          value,
          fallbackReason
        ),
    };
  }

  function normalizeQueueArgs(delayOrOptions = SOFT_REBIND_DELAY_MS, options = {}) {
    if (
      delayOrOptions &&
      typeof delayOrOptions === "object" &&
      !Array.isArray(delayOrOptions)
    ) {
      return {
        delay:
          SOFT_REBIND_DELAY_MS,

        options:
          normalizeOptions(
            delayOrOptions,
            "queue-rebind"
          ),
      };
    }

    return {
      delay:
        Math.max(
          0,
          Number(delayOrOptions) || 0
        ),

      options:
        normalizeOptions(
          options,
          "queue-rebind"
        ),
    };
  }

  function stripQueryAndHash(path = "/") {
    return (
      safeText(path, "/")
        .split("?")[0]
        .split("#")[0] ||
      "/"
    );
  }

  function decodeRouteSegment(segment = "") {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
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
          } catch (error) {
            runtime.lastError =
              error;
          }
        },
        Math.max(
          0,
          Number(ms) || 0
        )
      );
    } catch (error) {
      runtime.lastError =
        error;

      try {
        callback();
      } catch {}

      return null;
    }
  }

  function clearTimer(key = "") {
    const timer =
      runtime[key];

    if (!timer) {
      return false;
    }

    try {
      if (hasWindow()) {
        window.clearTimeout(timer);
      }
    } catch {}

    runtime[key] =
      null;

    return true;
  }

  function safeAbortController(controller) {
    if (!controller) {
      return false;
    }

    try {
      controller.abort();
      return true;
    } catch (error) {
      runtime.lastError =
        error;

      return false;
    }
  }

  function cancelSearchRuntime() {
    clearTimer("searchDebounceTimer");

    safeAbortController(
      runtime.searchController
    );

    runtime.searchController =
      null;

    runtime.openingSearchResult =
      false;

    runtime.isComposingSearch =
      false;

    return true;
  }

  function runCleanup(scope = "") {
    const cleanScope =
      safeText(scope, "");

    if (!cleanScope) {
      return false;
    }

    try {
      AppCore?.cleanup?.run?.(cleanScope);

      runtime.cleanupCount += 1;

      return true;
    } catch (error) {
      runtime.lastError =
        error;

      return false;
    }
  }

  function getDebugEnabled() {
    return Boolean(
      AppCore?.config?.debug ||
      AppCore?.state?.debug
    );
  }

  function debugLog(...args) {
    if (!getDebugEnabled()) {
      return;
    }

    try {
      AppCore?.utils?.log?.(
        LOG_PREFIX,
        ...args
      );

      return;
    } catch {}

    try {
      console.log(
        LOG_PREFIX,
        ...args
      );
    } catch {}
  }

  function debugWarn(...args) {
    if (!getDebugEnabled()) {
      return;
    }

    try {
      AppCore?.utils?.warn?.(
        LOG_PREFIX,
        ...args
      );

      return;
    } catch {}

    try {
      console.warn(
        LOG_PREFIX,
        ...args
      );
    } catch {}
  }

  function safeEmit(eventName = "", payload = {}) {
    const name =
      safeText(eventName, "");

    if (!name) {
      return false;
    }

    const data =
      safeObject(payload);

    const detail =
      {
        ...data,

        source:
          safeText(data.source, SOURCE),

        owner:
          OWNER,

        version:
          TOPBAR_UI_VERSION,

        at:
          safeText(data.at, safeIsoDate()),

        ts:
          data.ts || nowMs(),
      };

    try {
      if (isFunction(AppCore?.events?.emit)) {
        AppCore.events.emit(
          name,
          detail
        );

        return true;
      }
    } catch (error) {
      runtime.lastError =
        error;
    }

    try {
      if (
        isBrowser() &&
        typeof CustomEvent !== "undefined"
      ) {
        window.dispatchEvent(
          new CustomEvent(
            name,
            {
              detail,
            }
          )
        );

        return true;
      }
    } catch (error) {
      runtime.lastError =
        error;
    }

    return false;
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
    const topbar =
      mountTopbar(AppCore);

    if (topbar) {
      runtime.mountedAt =
        nowMs();

      prepareTopbarDom(topbar);
      syncDomCache();
    }

    return topbar;
  }

  function ensureMounted() {
    if (isTopbarMounted(AppCore)) {
      const dom =
        syncDomCache();

      if (dom?.topbar) {
        prepareTopbarDom(dom.topbar);

        return dom.topbar;
      }
    }

    return mount();
  }

  function ensureMountedConnected() {
    const mounted =
      ensureMounted();

    return (
      mounted &&
      isConnected(mounted)
    )
      ? mounted
      : null;
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
    return openSidebarMobile(
      {
        AppCore,
        getDom,
      }
    );
  }

  function closeSidebarMobileSafe() {
    return closeSidebarMobile(
      {
        AppCore,
        getDom,
      }
    );
  }

  function toggleSidebarMobileSafe() {
    return toggleSidebarMobile(
      {
        AppCore,
        getDom,
      }
    );
  }

  function handleViewportResizeSafe() {
    return handleViewportResize(
      getDom,
      closeSidebarMobileSafe
    );
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

  function getRouteTitle(route = null) {
    if (!route) {
      return "";
    }

    return safeText(
      route.title ||
        route.label ||
        route.name ||
        route.meta?.title ||
        route.meta?.label ||
        "",
      ""
    );
  }

  function getRouteTitleFromTable(canonicalPath = "", publicPath = "") {
    const routes =
      getRouteTable();

    if (!routes) {
      return "";
    }

    const candidates =
      [
        canonicalPath,
        publicPath,
        stripQueryAndHash(publicPath),
        stripQueryAndHash(canonicalPath),
      ].filter(Boolean);

    if (Array.isArray(routes)) {
      for (const candidate of candidates) {
        const cleanCandidate =
          stripQueryAndHash(candidate);

        const route =
          routes.find((item) => {
            const path =
              stripQueryAndHash(item?.path || "");

            return path === cleanCandidate;
          });

        const title =
          getRouteTitle(route);

        if (title) {
          return title;
        }
      }

      return "";
    }

    if (typeof routes !== "object") {
      return "";
    }

    for (const key of candidates) {
      const cleanKey =
        stripQueryAndHash(key);

      const route =
        routes[key] ||
        routes[cleanKey] ||
        null;

      const title =
        getRouteTitle(route);

      if (title) {
        return title;
      }
    }

    return "";
  }

  function resolveRouteTitle(path = "") {
    const publicPath =
      safeNormalizePath(
        AppCore,
        path || getCurrentPublicPath(AppCore)
      );

    const canonicalPath =
      safeNormalizeCanonicalPath(
        AppCore,
        stripQueryAndHash(publicPath) || "/"
      );

    const cleanCanonicalPath =
      stripQueryAndHash(canonicalPath);

    const staticMap =
      {
        "/":
          TITLE_DEFAULT,

        "/home":
          "Inicio",

        "/dashboard":
          "Inicio",

        "/inicio":
          "Inicio",

        "/incidencias":
          "Incidencias",

        "/tickets":
          "Incidencias",

        "/facturas":
          "Facturas",

        "/usuarios":
          "Usuarios",

        "/users":
          "Usuarios",

        "/clientes":
          "Clientes",

        "/clients":
          "Clientes",

        "/cuenta":
          "Cuenta",

        "/account":
          "Cuenta",

        "/ajustes":
          "Ajustes",

        "/settings":
          "Ajustes",

        "/login":
          "Acceso",

        "/activate-account":
          "Activar cuenta",

        "/reset-password":
          "Restablecer contraseña",

        "/reset-password/confirm":
          "Confirmar contraseña",

        "/forgot-password":
          "Recuperar contraseña",

        "/recover-password":
          "Recuperar contraseña",

        "/password-reset":
          "Recuperar contraseña",

        "/servidor":
          "Servidor",

        "/server":
          "Servidor",
      };

    if (staticMap[cleanCanonicalPath]) {
      return staticMap[cleanCanonicalPath];
    }

    const routeTitle =
      getRouteTitleFromTable(
        cleanCanonicalPath,
        publicPath
      );

    if (routeTitle) {
      return routeTitle;
    }

    if (cleanCanonicalPath === "/") {
      return TITLE_DEFAULT;
    }

    const pretty =
      cleanCanonicalPath
        .replace(/^\/+/, "")
        .split("/")
        .filter(Boolean)
        .map((segment) => {
          const clean =
            decodeRouteSegment(segment)
              .replace(/[-_]+/g, " ")
              .trim();

          if (!clean) {
            return "";
          }

          return (
            clean.charAt(0).toUpperCase() +
            clean.slice(1)
          );
        })
        .filter(Boolean)
        .join(" · ");

    return pretty || TITLE_DEFAULT;
  }

  function syncTitle(path = "") {
    const {
      title,
    } =
      getDom();

    if (!title) {
      return false;
    }

    const publicPath =
      safeNormalizePath(
        AppCore,
        path || getCurrentPublicPath(AppCore)
      );

    const nextTitle =
      resolveRouteTitle(publicPath);

    if (
      runtime.lastTitle === nextTitle &&
      title.textContent === nextTitle
    ) {
      runtime.lastPublicPath =
        publicPath;

      return true;
    }

    try {
      title.textContent =
        nextTitle;

      title.setAttribute(
        "data-route-title",
        nextTitle
      );
    } catch (error) {
      runtime.lastError =
        error;
    }

    runtime.lastTitle =
      nextTitle;

    runtime.lastPublicPath =
      publicPath;

    return true;
  }

  /* =========================================================
     SEARCH HELPERS
  ========================================================= */

  function hideSearchResults() {
    return hideResultsContainer(
      runtime,
      getDom
    );
  }

  function clearSearch(options = {}) {
    const opts =
      normalizeOptions(
        options,
        "clear-search"
      );

    const {
      searchInput,
    } =
      getDom();

    if (
      opts.clearInput &&
      searchInput
    ) {
      try {
        searchInput.value =
          "";
      } catch (error) {
        runtime.lastError =
          error;
      }
    }

    if (
      opts.blur &&
      searchInput
    ) {
      try {
        searchInput.blur();
      } catch (error) {
        runtime.lastError =
          error;
      }
    }

    cancelSearchRuntime();

    clearSearchState(
      runtime,
      getDom
    );

    if (opts.clearCache) {
      runtime.cache.clear();
    }

    return true;
  }

  function focusSearch(options = {}) {
    const opts =
      normalizeOptions(
        options,
        "focus-search"
      );

    const {
      searchInput,
    } =
      getDom();

    if (!searchInput) {
      return false;
    }

    try {
      searchInput.focus(
        {
          preventScroll:
            opts.preventScroll !== false,
        }
      );

      if (opts.select) {
        searchInput.select?.();
      }

      return true;
    } catch {
      try {
        searchInput.focus();
        return true;
      } catch (error) {
        runtime.lastError =
          error;

        return false;
      }
    }
  }

  /* =========================================================
     HANDLERS
  ========================================================= */

  function getHandlers() {
    if (handlers) {
      return handlers;
    }

    handlers =
      createTopbarEventHandlers(
        {
          AppCore,
          Router,
          runtime,
          getDom,
          syncTitle,

          setMobileToggleState:
            setMobileToggleStateSafe,

          syncFixedTopbarOffset:
            syncFixedTopbarOffsetSafe,

          closeSidebarMobile:
            closeSidebarMobileSafe,

          toggleSidebarMobile:
            toggleSidebarMobileSafe,

          syncDomCache,
        }
      );

    return handlers;
  }

  function resetHandlers() {
    handlers =
      null;

    return true;
  }

  /* =========================================================
     PUBLIC REGISTRATION
  ========================================================= */

  function getRegisteredModule(name = "") {
    const cleanName =
      safeText(name, "");

    if (!cleanName) {
      return null;
    }

    try {
      const value =
        AppCore?.modules?.get?.(cleanName);

      if (value) {
        return value;
      }
    } catch {}

    try {
      const value =
        AppCore?.registry?.modules?.get?.(cleanName);

      if (value) {
        return value;
      }
    } catch {}

    try {
      const value =
        AppCore?.modules?.[cleanName];

      if (value) {
        return value;
      }
    } catch {}

    return null;
  }

  function registerSingleModule(name = "") {
    const cleanName =
      safeText(name, "");

    if (!cleanName) {
      return false;
    }

    const current =
      getRegisteredModule(cleanName);

    if (current === api) {
      return false;
    }

    let changed =
      false;

    try {
      if (isFunction(AppCore?.modules?.register)) {
        const result =
          AppCore.modules.register(
            cleanName,
            api,
            {
              replace:
                true,

              overwrite:
                true,

              silentDuplicate:
                true,

              source:
                SOURCE,
            }
          );

        if (result !== false) {
          changed =
            true;
        }
      }
    } catch (error) {
      runtime.lastError =
        error;
    }

    if (!changed) {
      try {
        if (isFunction(AppCore?.modules?.set)) {
          const result =
            AppCore.modules.set(
              cleanName,
              api,
              {
                replace:
                  true,

                overwrite:
                  true,

                silentDuplicate:
                  true,

                source:
                  SOURCE,
              }
            );

          if (result !== false) {
            changed =
              true;
          }
        }
      } catch (error) {
        runtime.lastError =
          error;
      }
    }

    if (!changed) {
      try {
        if (
          !AppCore.modules ||
          typeof AppCore.modules !== "object"
        ) {
          AppCore.modules =
            {};
        }

        AppCore.modules[cleanName] =
          api;

        changed =
          true;
      } catch (error) {
        runtime.lastError =
          error;
      }
    }

    try {
      AppCore?.registry?.modules?.set?.(
        cleanName,
        api
      );

      changed =
        true;
    } catch {}

    return changed;
  }

  function registerPublicApi() {
    let changed =
      false;

    for (const name of MODULE_NAMES) {
      if (registerSingleModule(name)) {
        changed =
          true;
      }
    }

    try {
      if (isBrowser()) {
        for (const name of GLOBAL_NAMES) {
          if (window[name] !== api) {
            window[name] =
              api;

            changed =
              true;
          }
        }
      }
    } catch (error) {
      runtime.lastError =
        error;
    }

    publicApiRegistered =
      true;

    return changed;
  }

  /* =========================================================
     LIFECYCLE INTERNAL
  ========================================================= */

  function unbind(options = {}) {
    const opts =
      normalizeOptions(
        options,
        "unbind"
      );

    clearTimer("rebindTimer");
    clearTimer("retryTimer");

    cancelSearchRuntime();

    /*
      Sólo aquí se ejecuta cleanup.run().
      Nunca desde refresh/render/sync.
    */
    runCleanup(SCOPE);
    runCleanup(SEARCH_SCOPE);

    clearSearchState(
      runtime,
      getDom
    );

    runtime.bound =
      false;

    runtime.binding =
      false;

    runtime.openingSearchResult =
      false;

    runtime.isComposingSearch =
      false;

    if (opts.clearCache) {
      runtime.cache.clear();
    }

    safeEmit(
      "topbar:unbound",
      {
        reason:
          opts.reason || "unbind",

        cleanupCount:
          runtime.cleanupCount,
      }
    );

    return true;
  }

  function syncVisualState(options = {}) {
    const opts =
      normalizeOptions(
        options,
        "sync-visual-state"
      );

    const topbar =
      ensureMounted();

    if (!topbar) {
      return false;
    }

    syncDomCache();

    prepareTopbarDom(topbar);

    syncTitle(
      opts.path ||
        opts.publicPath ||
        getCurrentPublicPath(AppCore)
    );

    setMobileToggleStateSafe();
    syncFixedTopbarOffsetSafe();

    runtime.softRefreshCount += 1;

    return true;
  }

  function shouldSkipBind(reason = "bind") {
    if (!runtime.bound) {
      return false;
    }

    const current =
      nowMs();

    if (
      current - runtime.lastBindAt <
      BIND_DEDUP_WINDOW_MS
    ) {
      debugLog(
        "bind omitido por dedupe.",
        {
          reason,

          sinceLastBindMs:
            current - runtime.lastBindAt,
        }
      );

      return true;
    }

    return false;
  }

  function bind(options = {}) {
    const opts =
      normalizeOptions(
        options,
        "bind"
      );

    const reason =
      opts.reason || "bind";

    if (runtime.binding) {
      return runtime.bound;
    }

    /*
      Clave:
      bind() normal NO hace cleanup ni rebindea si ya está bound.
    */
    if (
      runtime.bound &&
      opts.force !== true
    ) {
      syncVisualState(
        {
          ...opts,

          reason:
            `bind-skip:${reason}`,
        }
      );

      return true;
    }

    if (
      opts.force !== true &&
      shouldSkipBind(reason)
    ) {
      syncVisualState(
        {
          ...opts,

          reason:
            `bind-dedupe:${reason}`,
        }
      );

      return true;
    }

    runtime.binding =
      true;

    try {
      const topbar =
        ensureMountedConnected();

      if (!topbar) {
        runtime.bound =
          false;

        debugWarn(
          "No se pudo montar el topbar.",
          {
            reason,
          }
        );

        return false;
      }

      if (opts.cleanupBeforeBind === true) {
        runCleanup(SCOPE);
        runCleanup(SEARCH_SCOPE);
      }

      if (opts.resetSearch !== false) {
        clearSearchState(
          runtime,
          getDom
        );
      }

      syncDomCache();

      prepareTopbarDom(topbar);

      const boundHandlers =
        getHandlers();

      const domOk =
        bindTopbarDomEvents(
          {
            AppCore,
            scope:
              SCOPE,
            getDom,
            handlers:
              {
                ...boundHandlers,

                handleViewportResize:
                  handleViewportResizeSafe,
              },
          }
        );

      const searchOk =
        bindSearchDomEvents(
          {
            AppCore,
            scope:
              SEARCH_SCOPE,
            getDom,
            handlers:
              boundHandlers,
          }
        );

      const appOk =
        bindTopbarAppEvents(
          {
            AppCore,
            scope:
              SCOPE,
            getDom,
            handlers:
              boundHandlers,

            hideResults:
              hideSearchResults,

            syncTitle,

            setMobileToggleState:
              setMobileToggleStateSafe,

            syncFixedTopbarOffset:
              syncFixedTopbarOffsetSafe,

            closeSidebarMobile:
              closeSidebarMobileSafe,

            syncDomCache,

            /*
              Este callback puede ser llamado por eventos app/router/auth/lang.
              Por defecto queda convertido en refresh ligero.
            */
            rebind:
              queueRebind,
          }
        );

      syncVisualState(
        {
          ...opts,

          reason:
            `bind:${reason}`,
        }
      );

      /*
        Search puede ser opcional si el DOM no tiene buscador.
        Topbar base queda bound con DOM + App events.
      */
      runtime.bound =
        Boolean(domOk && appOk);

      runtime.lastBindAt =
        nowMs();

      runtime.lastBindReason =
        reason;

      runtime.bindGeneration += 1;

      if (!searchOk) {
        debugWarn(
          "Buscador no enlazado; faltan nodos search.",
          {
            reason,
          }
        );
      }

      safeEmit(
        "topbar:events:bound",
        {
          reason,

          bound:
            runtime.bound,

          domOk:
            Boolean(domOk),

          searchOk:
            Boolean(searchOk),

          appOk:
            Boolean(appOk),

          generation:
            runtime.bindGeneration,
        }
      );

      return runtime.bound;
    } catch (error) {
      runtime.bound =
        false;

      runtime.lastError =
        error;

      debugWarn(
        "Error en bind.",
        error
      );

      return false;
    } finally {
      runtime.binding =
        false;
    }
  }

  function softRefresh(options = {}) {
    const opts =
      normalizeOptions(
        options,
        "soft-refresh"
      );

    const topbar =
      ensureMounted();

    if (!topbar) {
      retryBind(
        {
          reason:
            `soft-refresh-missing-topbar:${opts.reason || ""}`,
        }
      );

      return false;
    }

    return syncVisualState(
      {
        ...opts,

        reason:
          opts.reason || "soft-refresh",
      }
    );
  }

  function hardRebind(options = {}) {
    const opts =
      normalizeOptions(
        options,
        "hard-rebind"
      );

    if (runtime.rebinding) {
      return runtime.bound;
    }

    runtime.rebinding =
      true;

    try {
      runtime.hardRebindCount += 1;

      unbind(
        {
          clearCache:
            opts.clearCache === true,

          reason:
            opts.reason || "hard-rebind",
        }
      );

      resetHandlers();

      const topbar =
        ensureMounted();

      if (!topbar) {
        retryBind(
          {
            reason:
              "hard-rebind-missing-topbar",
          }
        );

        return false;
      }

      return bind(
        {
          ...opts,

          reason:
            opts.reason || "hard-rebind",

          force:
            true,

          cleanupBeforeBind:
            false,

          resetSearch:
            opts.resetSearch !== false,
        }
      );
    } catch (error) {
      runtime.lastError =
        error;

      debugWarn(
        "Error en hardRebind.",
        error
      );

      return false;
    } finally {
      runtime.rebinding =
        false;
    }
  }

  function rebind(options = {}) {
    const opts =
      normalizeOptions(
        options,
        "rebind"
      );

    /*
      Protección anti-storm:
      rebind() llamado sin force/hard/explicit es soft refresh.
      Para rebind real usar:
        TopbarUI.rebind({ force: true })
        TopbarUI.hardRebind()
    */
    if (
      opts.force === true ||
      opts.hard === true ||
      opts.explicit === true
    ) {
      return hardRebind(opts);
    }

    return softRefresh(
      {
        ...opts,

        reason:
          opts.reason || "rebind-soft",
      }
    );
  }

  function queueRebind(delayOrOptions = SOFT_REBIND_DELAY_MS, maybeOptions = {}) {
    const {
      delay,
      options,
    } =
      normalizeQueueArgs(
        delayOrOptions,
        maybeOptions
      );

    clearTimer("rebindTimer");

    runtime.rebindTimer =
      safeSetTimeout(
        () => {
          runtime.rebindTimer =
            null;

          if (
            options.force === true ||
            options.hard === true ||
            options.explicit === true
          ) {
            hardRebind(
              {
                ...options,

                reason:
                  options.reason || "queue-hard-rebind",
              }
            );

            return;
          }

          softRefresh(
            {
              ...options,

              reason:
                options.reason || "queue-soft-refresh",
            }
          );
        },
        delay
      );

    return true;
  }

  function retryBind(options = {}) {
    const opts =
      normalizeOptions(
        options,
        "retry-bind"
      );

    clearTimer("retryTimer");

    runtime.retryTimer =
      safeSetTimeout(
        () => {
          runtime.retryTimer =
            null;

          mount();
          syncDomCache();

          const done =
            bind(
              {
                reason:
                  opts.reason || "retry-bind",

                force:
                  false,
              }
            );

          if (!done) {
            debugWarn(
              "Retry bind fallido.",
              {
                reason:
                  opts.reason || "retry-bind",
              }
            );
          }
        },
        opts.delayMs || RETRY_BIND_DELAY_MS
      );

    return true;
  }

  /* =========================================================
     PUBLIC LIFECYCLE
  ========================================================= */

  function init(options = {}) {
    const opts =
      normalizeOptions(
        options,
        "init"
      );

    registerPublicApi();

    if (initialized) {
      const mounted =
        ensureMounted();

      if (!mounted) {
        retryBind(
          {
            reason:
              "init-already-missing-topbar",
          }
        );

        return true;
      }

      if (!runtime.bound) {
        bind(
          {
            reason:
              "init-already-not-bound",
          }
        );
      } else {
        syncVisualState(
          {
            reason:
              "init-already-bound",
          }
        );
      }

      return true;
    }

    initialized =
      true;

    const mounted =
      ensureMounted();

    if (!mounted) {
      retryBind(
        {
          reason:
            "init-missing-topbar",
          }
        );

      return true;
    }

    const done =
      bind(
        {
          ...opts,

          reason:
            opts.reason || "init",
        }
      );

    if (!done) {
      retryBind(
        {
          reason:
            "init-bind-failed",
        }
      );
    }

    debugLog(
      "Inicializado correctamente.",
      getState()
    );

    safeEmit(
      "topbar:ready",
      {
        initialized:
          true,

        bound:
          Boolean(runtime.bound),

        snapshot:
          getState(),
      }
    );

    return true;
  }

  function render(options = {}) {
    const opts =
      normalizeOptions(
        options,
        "render"
      );

    const topbar =
      ensureMounted();

    if (!topbar) {
      retryBind(
        {
          reason:
            "render-missing-topbar",
        }
      );

      return false;
    }

    syncDomCache();

    prepareTopbarDom(topbar);

    syncVisualState(
      {
        ...opts,

        reason:
          opts.reason || "render",
      }
    );

    /*
      Cambio clave:
      render() NO rebindea por defecto.
    */
    if (opts.rebind === true) {
      return rebind(
        {
          ...opts,

          reason:
            opts.reason || "render:explicit-rebind",
        }
      );
    }

    return true;
  }

  function refresh(options = {}) {
    const opts =
      normalizeOptions(
        options,
        "refresh"
      );

    const ok =
      softRefresh(
        {
          ...opts,

          reason:
            opts.reason || "refresh",
        }
      );

    /*
      Cambio clave:
      refresh() NO rebindea salvo petición explícita.
    */
    if (opts.rebind === true) {
      return rebind(
        {
          ...opts,

          reason:
            opts.reason || "refresh:explicit-rebind",
        }
      );
    }

    return ok;
  }

  function sync(options = {}) {
    const opts =
      normalizeOptions(
        options,
        "sync"
      );

    return refresh(
      {
        ...opts,

        rebind:
          false,

        reason:
          opts.reason || "sync",
      }
    );
  }

  function renderUser(options = {}) {
    const opts =
      normalizeOptions(
        options,
        "render-user"
      );

    return sync(
      {
        ...opts,

        reason:
          opts.reason || "render-user",
      }
    );
  }

  function refreshUser(options = {}) {
    const opts =
      normalizeOptions(
        options,
        "refresh-user"
      );

    return sync(
      {
        ...opts,

        reason:
          opts.reason || "refresh-user",
      }
    );
  }

  function updateUser(options = {}) {
    const opts =
      normalizeOptions(
        options,
        "update-user"
      );

    return sync(
      {
        ...opts,

        reason:
          opts.reason || "update-user",
      }
    );
  }

  function syncUser(options = {}) {
    const opts =
      normalizeOptions(
        options,
        "sync-user"
      );

    return sync(
      {
        ...opts,

        reason:
          opts.reason || "sync-user",
      }
    );
  }

  function destroy(options = {}) {
    const opts =
      normalizeOptions(
        options,
        "destroy"
      );

    unbind(
      {
        clearCache:
          opts.clearCache === true,

        reason:
          opts.reason || "destroy",
      }
    );

    resetHandlers();

    if (opts.unmount === true) {
      unmountTopbar(AppCore);
    }

    if (opts.keepInitialized !== true) {
      initialized =
        false;
    }

    publicApiRegistered =
      false;

    try {
      if (isBrowser()) {
        for (const name of GLOBAL_NAMES) {
          if (window[name] === api) {
            delete window[name];
          }
        }
      }
    } catch (error) {
      runtime.lastError =
        error;
    }

    safeEmit(
      "topbar:destroyed",
      {
        reason:
          opts.reason || "destroy",
      }
    );

    return true;
  }

  /* =========================================================
     DEBUG / STATE API
  ========================================================= */

  function getState() {
    const dom =
      getDom();

    return {
      version:
        TOPBAR_UI_VERSION,

      initialized:
        Boolean(initialized),

      publicApiRegistered:
        Boolean(publicApiRegistered),

      bound:
        Boolean(runtime.bound),

      binding:
        Boolean(runtime.binding),

      rebinding:
        Boolean(runtime.rebinding),

      mounted:
        Boolean(dom.topbar?.isConnected),

      mountedAt:
        runtime.mountedAt,

      lastBindAt:
        runtime.lastBindAt,

      lastBindReason:
        runtime.lastBindReason,

      bindGeneration:
        runtime.bindGeneration,

      softRefreshCount:
        runtime.softRefreshCount,

      hardRebindCount:
        runtime.hardRebindCount,

      cleanupCount:
        runtime.cleanupCount,

      lastError:
        runtime.lastError,

      search: {
        focusActive:
          isSearchFocusActive(),

        activeIndex:
          runtime.activeIndex,

        currentQuery:
          runtime.currentQuery,

        currentItems:
          [...runtime.currentItems],

        cacheSize:
          runtime.cache.size,

        hasController:
          Boolean(runtime.searchController),

        hasDebounceTimer:
          Boolean(runtime.searchDebounceTimer),

        openingSearchResult:
          runtime.openingSearchResult,

        isComposingSearch:
          runtime.isComposingSearch,
      },

      title:
        runtime.lastTitle,

      publicPath:
        runtime.lastPublicPath,

      dom: {
        topbar:
          Boolean(dom.topbar),

        title:
          Boolean(dom.title),

        mobileToggle:
          Boolean(dom.mobileToggle),

        searchWrap:
          Boolean(dom.searchWrap),

        searchInput:
          Boolean(dom.searchInput),

        searchResults:
          Boolean(dom.searchResults),

        sidebar:
          Boolean(dom.sidebar),

        mainContent:
          Boolean(dom.mainContent),

        appContent:
          Boolean(dom.appContent),

        viewContainer:
          Boolean(dom.viewContainer),
      },

      modules: Object.fromEntries(
        MODULE_NAMES.map((name) => [
          name,
          getRegisteredModule(name) === api,
        ])
      ),
    };
  }

  function getSnapshot() {
    return getState();
  }

  function clearSearchCache() {
    runtime.cache.clear();
    return true;
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */

  const api =
    {
      version:
        TOPBAR_UI_VERSION,

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

      mountTopbar:
        mount,

      unmountTopbar:
        (options = {}) => {
          const opts =
            normalizeOptions(
              options,
              "unmount-topbar"
            );

          unbind(
            {
              clearCache:
                opts.clearCache === true,

              reason:
                opts.reason || "unmount-topbar",
            }
          );

          resetHandlers();

          initialized =
            false;

          publicApiRegistered =
            false;

          return unmountTopbar(AppCore);
        },

      syncDomCache,
      getDom,

      syncTitle,
      resolveRouteTitle,

      openSidebarMobile:
        openSidebarMobileSafe,

      closeSidebarMobile:
        closeSidebarMobileSafe,

      toggleSidebarMobile:
        toggleSidebarMobileSafe,

      syncFixedTopbarOffset:
        syncFixedTopbarOffsetSafe,

      setMobileToggleState:
        setMobileToggleStateSafe,

      handleViewportResize:
        handleViewportResizeSafe,

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
