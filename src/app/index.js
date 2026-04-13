/* =========================================================
   Onion SPA - App Bootstrap
   Archivo: src/app/index.js

   Responsabilidades:
   - punto de entrada del bootstrap de la aplicación
   - composición de módulos principales
   - inicialización ordenada del runtime
   - controlar boot / reboot
   - mantener la API pública App

   FIX CRÍTICO:
   - restaurar sesión ANTES del primer render
   - no cargar dark por defecto en loader
   - aplicar theme real ANTES de mostrar loader
   - evitar pintar rutas protegidas sin auth resuelta
   - no marcar app ready antes de tiempo
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
  navigateAfterSessionRestore,
  restoreSessionInBackground,
} from "./session.js";

import {
  renderBootError,
  bindGlobalErrorHandlers,
} from "./errors.js";

import { bindAppEvents } from "./events.js";

export const App = (() => {
  "use strict";

  /* =========================================================
     INTERNAL STATE
  ========================================================= */
  const state = {
    booted: false,
    booting: false,

    servicesInitialized: false,
    storeInitialized: false,

    routerConfigured: false,
    routerBound: false,

    uiInitialized: false,
    i18nInitialized: false,

    bootFailsafeTimer: null,
    sessionRestorePromise: null,
  };

  /* =========================================================
     PREBOOT THEME FIX
     - evita flash dark inicial
     - aplica tema real antes loader
  ========================================================= */
  function applyThemeBeforeLoader() {
    try {
      const storageKeys = [
        "onion_theme",
        "onion:theme",
        "theme",
      ];

      let savedTheme = null;

      for (const key of storageKeys) {
        const value =
          localStorage.getItem(key);

        if (
          value === "dark" ||
          value === "light"
        ) {
          savedTheme = value;
          break;
        }
      }

      if (!savedTheme) {
        savedTheme =
          window.matchMedia &&
          window.matchMedia(
            "(prefers-color-scheme: light)"
          ).matches
            ? "light"
            : "dark";
      }

      document.documentElement.setAttribute(
        "data-theme",
        savedTheme
      );

      document.body?.setAttribute(
        "data-theme",
        savedTheme
      );

      if (
        typeof AppCore?.setTheme ===
        "function"
      ) {
        AppCore.setTheme(
          savedTheme
        );
      } else {
        AppCore?.setState?.({
          theme: savedTheme,
        });
      }
    } catch (error) {
      console.warn(
        "Theme preboot fallback error:",
        error
      );
    }
  }

  /* =========================================================
     CORE
  ========================================================= */
  async function initCore() {
    await AppCore.init();
  }

  /* =========================================================
     SERVICES
  ========================================================= */
  function initServices() {
    if (!state.servicesInitialized) {
      if (
        typeof Http?.init ===
        "function"
      ) {
        Http.init();
      }

      state.servicesInitialized =
        true;
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
  }

  /* =========================================================
     STORE / AUTH / ROUTER REGISTRY
  ========================================================= */
  function initStore() {
    if (!state.storeInitialized) {
      if (
        typeof Store?.init ===
        "function"
      ) {
        Store.init();
      }

      state.storeInitialized =
        true;
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
  }

  /* =========================================================
     ROUTER
  ========================================================= */
  function initRouter() {
    configureRouter({
      Router,
      AppCore,
      Auth,
      state,
    });

    bindRouter({
      Router,
      state,
    });
  }

  /* =========================================================
     SESSION RESTORE
  ========================================================= */
  async function restoreSessionBeforeRender() {
    try {
      state.sessionRestorePromise =
        Promise.resolve(
          restoreSessionInBackground(
            {
              AppCore,
              Auth,
              Router,
              Toast,
              state,
              syncUserUI,
              warmup,
              navigateAfterSessionRestore,

              applyPostRenderLoaderPolicy:
                () =>
                  applyPostRenderLoaderPolicy(
                    {
                      AppCore,
                      Router,
                      hideLoader,
                    }
                  ),
            }
          )
        );

      await state.sessionRestorePromise;
    } catch (error) {
      AppCore.utils.warn(
        "restoreSession falló durante boot.",
        error
      );
    } finally {
      state.sessionRestorePromise =
        null;
    }
  }

  /* =========================================================
     FINALIZE
  ========================================================= */
  function finalizeBoot() {
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

    state.booted = true;
    state.booting = false;

    markAppBootState(
      AppCore,
      {
        booted: true,
        booting: false,
      }
    );

    updateShellVisibilityByRoute(
      AppCore,
      Router
    );

    hideLoader(AppCore);

    AppCore.events.emit(
      "app:ready",
      {
        route:
          AppCore.state.route,
        publicPath:
          AppCore.state
            .publicPath,
        user:
          AppCore.state.user,
        authenticated:
          AppCore.state
            .authenticated,
        lang:
          AppCore.state.lang,
      }
    );
  }

  /* =========================================================
     BOOT
  ========================================================= */
  async function boot() {
    if (state.booted) {
      return api;
    }

    if (state.booting) {
      return api;
    }

    state.booting = true;

    markAppBootState(
      AppCore,
      {
        booted: false,
        booting: true,
      }
    );

    clearBootFailsafeTimer(
      state
    );

    try {
      /* ======================
         FIX CRÍTICO
      ====================== */
      applyThemeBeforeLoader();

      clearScope(AppCore);

      await initCore();

      initServices();
      initStore();

      initI18n({
        AppCore,
        I18n,
        state,
      });

      AppCore.setError(null);

      /* ======================
         LOADER YA CON TEMA REAL
      ====================== */
      showLoader(AppCore);

      armBootFailsafeLoader({
        AppCore,
        state,
        hideLoader,
      });

      const scope =
        ensureScope(AppCore);

      bindGlobalErrorHandlers(
        {
          AppCore,
          Toast,
          scope,
        }
      );

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

                applyPostRenderLoaderPolicy:
                  () =>
                    applyPostRenderLoaderPolicy(
                      {
                        AppCore,
                        Router,
                        hideLoader,
                      }
                    ),

                syncUserUI,
              }
            ),

        applyPostRenderLoaderPolicy:
          () =>
            applyPostRenderLoaderPolicy(
              {
                AppCore,
                Router,
                hideLoader,
              }
            ),
      });

      syncLangState(
        AppCore,
        I18n
      );

      initRouter();

      initUISystems({
        AppCore,
        Toast,
        SidebarUI,
        TopbarUI,
        state,
      });

      await restoreSessionBeforeRender();

      renderInitialRoute({
        AppCore,
        Router,

        applyPostRenderLoaderPolicy:
          () =>
            applyPostRenderLoaderPolicy(
              {
                AppCore,
                Router,
                hideLoader,
              }
            ),
      });

      finalizeBoot();

      return api;
    } catch (error) {
      clearBootFailsafeTimer(
        state
      );

      state.booted = false;
      state.booting = false;

      markStoreBootState(
        Store,
        {
          ready: false,
          booted: false,
        }
      );

      markAppBootState(
        AppCore,
        {
          booted: false,
          booting: false,
        }
      );

      AppCore.setError(
        error
      );

      hideLoader(AppCore);

      renderBootError({
        AppCore,
        Auth,
        Toast,
        error,
        getViewContainer,
        setShellVisibility,
        hideLoader,
      });

      return api;
    } finally {
      clearBootFailsafeTimer(
        state
      );

      state.booting = false;

      AppCore.setState({
        booting: false,
      });

      applyPostRenderLoaderPolicy(
        {
          AppCore,
          Router,
          hideLoader,
        }
      );
    }
  }

  /* =========================================================
     REBOOT
  ========================================================= */
  async function reboot(
    options = {}
  ) {
    const {
      preserveError = false,
    } = options;

    state.booted = false;
    state.booting = false;

    state.servicesInitialized =
      false;

    state.storeInitialized =
      false;

    state.routerConfigured =
      false;

    state.routerBound =
      false;

    state.uiInitialized =
      false;

    state.i18nInitialized =
      false;

    state.sessionRestorePromise =
      null;

    clearBootFailsafeTimer(
      state
    );

    clearScope(AppCore);

    if (!preserveError) {
      AppCore.setError(null);
    }

    markStoreBootState(
      Store,
      {
        ready: false,
        booted: false,
      }
    );

    hideLoader(AppCore);

    return boot();
  }

  /* =========================================================
     API
  ========================================================= */
  const api = {
    boot,
    reboot,
  };

  return api;
})();
