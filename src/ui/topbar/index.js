/* =========================================================
   Onion SPA - Topbar UI (FULL PRO SAAS PANEL · FINAL PRO)
   Archivo: src/ui/topbar/index.js

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
========================================================= */

import { AppCore } from "../core/index.js";
import { Router } from "../router/index.js";

import {
  TOPBAR_SCOPE,
  TOPBAR_SEARCH_SCOPE,
  TOPBAR_SEARCH_CONFIG,
  safeNormalizePath,
  safeNormalizeCanonicalPath,
  getCurrentPublicPath,
} from "./topbar.helpers.js";

import {
  mountTopbar,
  getTopbarDom,
  syncTopbarDomCache,
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

  const SCOPE = TOPBAR_SCOPE;
  const SEARCH_SCOPE = TOPBAR_SEARCH_SCOPE;

  let initialized = false;

  const runtime = {
    searchController: null,
    searchDebounceTimer: null,
    activeIndex: -1,
    currentItems: [],
    currentQuery: "",
    cache: new Map(),
  };

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
    return mountTopbar(AppCore);
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
  function resolveRouteTitle(path = "") {
    const canonicalPath = safeNormalizeCanonicalPath(AppCore, path || "/");

    const staticMap = {
      "/": "Onion Support",
      "/incidencias": "Incidencias",
      "/facturas": "Facturas",
      "/usuarios": "Usuarios",
      "/clientes": "Clientes",
      "/cuenta": "Cuenta",
      "/ajustes": "Ajustes",
      "/login": "Acceso",
      "/servidor": "Servidor",
    };

    if (staticMap[canonicalPath]) {
      return staticMap[canonicalPath];
    }

    const routes =
      Router?.routes ||
      Router?.table ||
      Router?.routeTable ||
      AppCore?.routes ||
      null;

    if (routes && typeof routes === "object") {
      const exact =
        routes[canonicalPath] ||
        routes[safeNormalizePath(AppCore, path || "/")] ||
        null;

      if (exact?.title) {
        return String(exact.title);
      }
    }

    if (canonicalPath === "/") {
      return "Onion Support";
    }

    const pretty = canonicalPath
      .replace(/^\/+/, "")
      .split("/")
      .filter(Boolean)
      .map((segment) => {
        const clean = decodeURIComponent(segment)
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
    if (!title) return;

    const nextTitle = resolveRouteTitle(path || getCurrentPublicPath(AppCore));
    title.textContent = nextTitle;
  }

  /* =========================================================
     EVENT HANDLERS FACTORY
  ========================================================= */
  const handlers = createTopbarEventHandlers({
    AppCore,
    Router,
    runtime,
    getDom,
    syncTitle,
    setMobileToggleState: setMobileToggleStateSafe,
    syncFixedTopbarOffset: syncFixedTopbarOffsetSafe,
    closeSidebarMobile: closeSidebarMobileSafe,
    toggleSidebarMobile: toggleSidebarMobileSafe,
  });

  /* =========================================================
     LIFECYCLE
  ========================================================= */
  function destroy() {
    AppCore.cleanup.run(SCOPE);
    AppCore.cleanup.run(SEARCH_SCOPE);
    clearSearchState(runtime);
  }

  function bind() {
    destroy();
    syncDomCache();

    const { topbar } = getDom();
    if (!topbar) {
      return false;
    }

    bindTopbarDomEvents({
      AppCore,
      scope: SCOPE,
      getDom,
      handlers: {
        ...handlers,
        handleViewportResize: handleViewportResizeSafe,
      },
    });

    bindSearchDomEvents({
      AppCore,
      scope: SEARCH_SCOPE,
      getDom,
      handlers,
    });

    bindTopbarAppEvents({
      AppCore,
      scope: SCOPE,
      searchScope: SEARCH_SCOPE,
      getDom,
      handlers,
      hideResults: () => hideResultsContainer(runtime, getDom),
      syncTitle,
      setMobileToggleState: setMobileToggleStateSafe,
      syncFixedTopbarOffset: syncFixedTopbarOffsetSafe,
      closeSidebarMobile: closeSidebarMobileSafe,
    });

    syncTitle(getCurrentPublicPath(AppCore));
    setMobileToggleStateSafe();
    syncFixedTopbarOffsetSafe();

    return true;
  }

  function rebind() {
    syncDomCache();

    const { topbar } = getDom();
    if (!topbar) {
      return false;
    }

    return bind();
  }

  function init() {
    if (initialized) {
      syncDomCache();
      syncTitle(getCurrentPublicPath(AppCore));
      setMobileToggleStateSafe();
      syncFixedTopbarOffsetSafe();
      return true;
    }

    mount();
    syncDomCache();

    const done = bind();

    if (!done) {
      window.setTimeout(() => {
        mount();
        syncDomCache();
        bind();
      }, 120);
    }

    initialized = true;

    if (AppCore.config?.debug) {
      AppCore.utils.log?.("TopbarUI inicializado correctamente.");
    }

    return true;
  }

  /* =========================================================
     API PÚBLICA
  ========================================================= */
  return {
    init,
    bind,
    rebind,
    destroy,
    mountTopbar: mount,
    syncTitle,
    openSidebarMobile: openSidebarMobileSafe,
    closeSidebarMobile: closeSidebarMobileSafe,
    toggleSidebarMobile: toggleSidebarMobileSafe,
    syncFixedTopbarOffset: syncFixedTopbarOffsetSafe,

    get initialized() {
      return initialized;
    },
  };
})();
