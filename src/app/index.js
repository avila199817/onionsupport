/* =========================================================
   Onion SPA - App Bootstrap
   Archivo: src/app/index.js

   RESPONSABILIDADES:
   - entrypoint real del runtime
   - composición total módulos principales
   - boot / reboot serializado
   - restore session antes del primer render
   - ready real sólo cuando todo terminó
   - API pública estable

   NIVEL EXTREMO / HARDENING:
   - boot race-safe por ciclo
   - finalize único
   - stale cycles cancelados
   - reboot limpio real
   - anti double ready
   - anti double hide loader
   - tolerancia fallos parciales
   - loader mínimo garantizado
   - no login flash
========================================================= */

import { AppCore } from "../core/index.js";
import { Store } from "../store/index.js";
import { Auth } from "../features/auth/index.js";
import { Router } from "../router/index.js";
import { Http } from "../services/index.js";

import { SidebarUI } from "../ui/sidebar/index.js";
import { TopbarUI } from "../ui/topbar/index.js";
import { Toast } from "../ui/toast/index.js";
import { I18n } from "../i18n/index.js";

import {
  ensureScope,
  clearScope,
} from "./helpers.js";

import {
  showLoader,
  hideLoader,
  clearBootFailsafeTimer,
  armBootFailsafeLoader,
} from "./loader.js";

import {
  getViewContainer,
  setShellVisibility,
  applyPostRenderLoaderPolicy,
  updateShellVisibilityByRoute,
} from "./shell.js";

import {
  markAppBootState,
  markStoreBootState,
} from "./boot-state.js";

import {
  syncLangState,
  initI18n,
  rerenderCurrentRoute,
} from "./i18n.js";

import {
  syncUserUI,
  initUISystems,
} from "./ui.js";

import {
  configureRouter,
  bindRouter,
  renderInitialRoute,
} from "./router.js";

import { warmup } from "./warmup.js";

import {
  restoreSessionInBackground,
} from "./session.js";

import {
  renderBootError,
  bindGlobalErrorHandlers,
} from "./errors.js";

import {
  bindAppEvents,
} from "./events.js";

export const App = (() => {
  "use strict";

  const MIN_BOOT_LOADER_MS = 1000;

  const state = {
    booted: false,
    booting: false,

    servicesReady: false,
    storeReady: false,
    routerReady: false,
    uiReady: false,

    handlersBound: false,
    appEventsBound: false,

    bootPromise: null,
    restorePromise: null,

    bootCycleId: 0,
    finalizedCycleId: 0,

    loaderVisible: false,
    loaderShownAt: 0,

    bootFailsafeTimer: null,
  };

  /* =====================================================
     SAFE HELPERS
  ===================================================== */

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.(...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.(...args);
    } catch {}
  }

  function safeError(...args) {
    try {
      AppCore?.utils?.error?.(...args);
    } catch {
      console.error(...args);
    }
  }

  function safeEmit(
    name,
    payload = {}
  ) {
    try {
      AppCore?.events?.emit?.(
        name,
        payload
      );
    } catch {}
  }

  function safeSetError(
    error = null
  ) {
    try {
      AppCore?.setError?.(
        error
      );
    } catch {}
  }

  function wait(ms = 0) {
    return new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          Math.max(
            0,
            Number(ms) || 0
          )
        )
    );
  }

  /* =====================================================
     CYCLE HELPERS
  ===================================================== */

  function nextCycle() {
    state.bootCycleId += 1;
    return state.bootCycleId;
  }

  function isStale(
    cycleId
  ) {
    return (
      Number(cycleId) !==
      Number(
        state.bootCycleId
      )
    );
  }

  /* =====================================================
     LOADER
  ===================================================== */

  function markLoaderShown() {
    state.loaderShownAt =
      Date.now();
  }

  function getRemainingLoaderMs() {
    const at =
      Number(
        state.loaderShownAt
      ) || 0;

    if (!at) {
      return 0;
    }

    const elapsed =
      Date.now() - at;

    return Math.max(
      0,
      MIN_BOOT_LOADER_MS -
        elapsed
    );
  }

  function showBootLoader() {
    if (
      state.loaderVisible
    ) {
      return;
    }

    markLoaderShown();

    state.loaderVisible =
      true;

    showLoader(
      AppCore
    );
  }

  function hideBootLoader() {
    if (
      !state.loaderVisible
    ) {
      return;
    }

    state.loaderVisible =
      false;

    hideLoader(
      AppCore
    );
  }

  function resetBootMarkers() {
    state.finalizedCycleId = 0;
    state.loaderShownAt = 0;
    state.loaderVisible = false;
  }

  /* =====================================================
     FLAGS
  ===================================================== */

  function setBootFlags({
    booted = state.booted,
    booting = state.booting,
  } = {}) {
    state.booted =
      Boolean(booted);

    state.booting =
      Boolean(booting);

    markAppBootState(
      AppCore,
      {
        booted:
          state.booted,
        booting:
          state.booting,
      }
    );

    AppCore?.setState?.({
      booted:
        state.booted,
      booting:
        state.booting,
    });
  }

  /* =====================================================
     THEME
  ===================================================== */

  function applyThemeBeforeLoader() {
    try {
      const html =
        document.documentElement;

      const saved =
        localStorage.getItem(
          "onion:theme"
        ) ||
        localStorage.getItem(
          "theme"
        );

      let theme =
        "dark";

      if (
        saved ===
        "light"
      ) {
        theme =
          "light";
      } else if (
        saved ===
        "dark"
      ) {
        theme =
          "dark";
      } else if (
        window.matchMedia &&
        window.matchMedia(
          "(prefers-color-scheme: light)"
        ).matches
      ) {
        theme =
          "light";
      }

      html.setAttribute(
        "data-theme",
        theme
      );

      AppCore?.setTheme?.(
        theme
      );
    } catch {}
  }

  /* =====================================================
     MODULE REGISTRY
  ===================================================== */

  function registerModules() {
    try {
      if (
        !AppCore?.modules
      ) {
        return;
      }

      if (
        !AppCore.modules.has(
          "http"
        )
      ) {
        AppCore.modules.register(
          "http",
          Http
        );
      }

      if (
        !AppCore.modules.has(
          "store"
        )
      ) {
        AppCore.modules.register(
          "store",
          Store
        );
      }

      if (
        !AppCore.modules.has(
          "auth"
        )
      ) {
        AppCore.modules.register(
          "auth",
          Auth
        );
      }

      if (
        !AppCore.modules.has(
          "router"
        )
      ) {
        AppCore.modules.register(
          "router",
          Router
        );
      }
    } catch {}
  }

  /* =====================================================
     INIT BLOCKS
  ===================================================== */

  async function initCore() {
    await AppCore.init();
  }

  function initServices() {
    if (
      !state.servicesReady
    ) {
      Http?.init?.();
      state.servicesReady =
        true;
    }

    registerModules();
  }

  function initStoreBlock() {
    if (
      !state.storeReady
    ) {
      Store?.init?.();
      state.storeReady =
        true;
    }

    registerModules();
  }

  function initRouterBlock() {
    if (
      state.routerReady
    ) {
      return;
    }

    configureRouter();
    bindRouter();

    state.routerReady =
      true;
  }

  function initUIBlock() {
    if (
      state.uiReady
    ) {
      return;
    }

    initUISystems({
      AppCore,
      Toast,
      SidebarUI,
      TopbarUI,
      state,
    });

    state.uiReady =
      true;
  }

  function bindHandlersOnce(
    scope
  ) {
    if (
      !state.handlersBound
    ) {
      bindGlobalErrorHandlers({
        AppCore,
        Toast,
        scope,
      });

      state.handlersBound =
        true;
    }

    if (
      !state.appEventsBound
    ) {
      bindAppEvents({
        AppCore,
        I18n,
        Toast,
        scope,
        syncUserUI,

        rerenderCurrentRoute:
          () =>
            rerenderCurrentRoute(
              {
                AppCore,
                Router,
                I18n,
                syncUserUI,
                applyPostRenderLoaderPolicy:
                  () =>
                    applyPostRenderLoaderPolicy(
                      {
                        AppCore,
                        Router,
                        hideLoader:
                          hideBootLoader,
                      }
                    ),
              }
            ),

        applyPostRenderLoaderPolicy:
          () =>
            applyPostRenderLoaderPolicy(
              {
                AppCore,
                Router,
                hideLoader:
                  hideBootLoader,
              }
            ),
      });

      state.appEventsBound =
        true;
    }
  }

  /* =====================================================
     SESSION RESTORE
  ===================================================== */

  async function restoreBeforeRender(
    cycleId
  ) {
    if (
      state.restorePromise
    ) {
      return state.restorePromise;
    }

    state.restorePromise =
      restoreSessionInBackground(
        {
          AppCore,
          Auth,
          Router,
          state,
          syncUserUI,
          warmup,
        }
      );

    try {
      const result =
        await state.restorePromise;

      if (
        isStale(
          cycleId
        )
      ) {
        return result;
      }

      return result;
    } finally {
      if (
        !isStale(
          cycleId
        )
      ) {
        state.restorePromise =
          null;
      }
    }
  }

  /* =====================================================
     FINALIZE
  ===================================================== */

  async function finalizeBoot(
    cycleId
  ) {
    if (
      isStale(
        cycleId
      )
    ) {
      return;
    }

    if (
      state.finalizedCycleId ===
      cycleId
    ) {
      return;
    }

    state.finalizedCycleId =
      cycleId;

    clearBootFailsafeTimer(
      state
    );

    markStoreBootState(
      Store,
      {
        ready: true,
        booted: true,
      }
    );

    setBootFlags({
      booted: true,
      booting: false,
    });

    updateShellVisibilityByRoute(
      AppCore,
      Router
    );

    const waitMs =
      getRemainingLoaderMs();

    if (waitMs > 0) {
      await wait(
        waitMs
      );
    }

    if (
      isStale(
        cycleId
      )
    ) {
      return;
    }

    hideBootLoader();

    safeEmit(
      "app:ready",
      {
        route:
          AppCore?.state
            ?.route,
        publicPath:
          AppCore?.state
            ?.publicPath,
        authenticated:
          AppCore?.state
            ?.authenticated,
        lang:
          AppCore?.state
            ?.lang,
      }
    );

    safeLog(
      "App ready."
    );
  }

  /* =====================================================
     BOOT CORE
  ===================================================== */

  async function doBoot(
    cycleId
  ) {
    try {
      if (
        isStale(
          cycleId
        )
      ) {
        return api;
      }

      resetBootMarkers();

      setBootFlags({
        booted: false,
        booting: true,
      });

      markStoreBootState(
        Store,
        {
          ready: false,
          booted: false,
        }
      );

      clearScope(
        AppCore
      );

      clearBootFailsafeTimer(
        state
      );

      applyThemeBeforeLoader();

      await initCore();

      if (
        isStale(
          cycleId
        )
      ) {
        return api;
      }

      initServices();
      initStoreBlock();

      initI18n({
        AppCore,
        I18n,
        state,
      });

      syncLangState(
        AppCore,
        I18n
      );

      safeSetError(
        null
      );

      showBootLoader();

      armBootFailsafeLoader({
        AppCore,
        state,
        hideLoader:
          hideBootLoader,
      });

      const scope =
        ensureScope(
          AppCore
        );

      bindHandlersOnce(
        scope
      );

      initRouterBlock();
      initUIBlock();

      /* FIX CRÍTICO */
      await restoreBeforeRender(
        cycleId
      );

      if (
        isStale(
          cycleId
        )
      ) {
        return api;
      }

      await renderInitialRoute();

      if (
        isStale(
          cycleId
        )
      ) {
        return api;
      }

      await finalizeBoot(
        cycleId
      );

      return api;
    } catch (error) {
      safeError(
        "Boot error:",
        error
      );

      try {
        const waitMs =
          getRemainingLoaderMs();

        if (
          waitMs > 0
        ) {
          await wait(
            waitMs
          );
        }
      } catch {}

      hideBootLoader();

      setBootFlags({
        booted: false,
        booting: false,
      });

      markStoreBootState(
        Store,
        {
          ready: false,
          booted: false,
        }
      );

      safeSetError(
        error
      );

      renderBootError({
        AppCore,
        Auth,
        Toast,
        error,
        getViewContainer,
        setShellVisibility,
        hideLoader:
          hideBootLoader,
      });

      return api;
    } finally {
      if (
        !isStale(
          cycleId
        )
      ) {
        clearBootFailsafeTimer(
          state
        );

        state.bootPromise =
          null;

        applyPostRenderLoaderPolicy(
          {
            AppCore,
            Router,
            hideLoader:
              hideBootLoader,
          }
        );
      }
    }
  }

  function boot() {
    if (
      state.booted
    ) {
      return Promise.resolve(
        api
      );
    }

    if (
      state.bootPromise
    ) {
      return state.bootPromise;
    }

    const cycleId =
      nextCycle();

    state.bootPromise =
      doBoot(
        cycleId
      );

    return state.bootPromise;
  }

  /* =====================================================
     REBOOT
  ===================================================== */

  async function reboot() {
    nextCycle();

    clearScope(
      AppCore
    );

    clearBootFailsafeTimer(
      state
    );

    state.bootPromise =
      null;

    state.restorePromise =
      null;

    state.booted =
      false;
    state.booting =
      false;

    state.servicesReady =
      false;
    state.storeReady =
      false;
    state.routerReady =
      false;
    state.uiReady =
      false;

    resetBootMarkers();

    markStoreBootState(
      Store,
      {
        ready: false,
        booted: false,
      }
    );

    setBootFlags({
      booted: false,
      booting: false,
    });

    hideBootLoader();

    return boot();
  }

  const api = {
    boot,
    reboot,
  };

  return api;
})();

export default App;
