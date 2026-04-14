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

   HARDENING:
   - boot serializado
   - finalize único
   - render inicial await real
   - limpieza robusta en reboot
   - guards de módulos idempotentes
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

    bootPromise: null,
  };

  /* =========================================================
     HELPERS
  ========================================================= */
  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.(...args);
    } catch {
      console.warn(...args);
    }
  }

  function safeError(...args) {
    try {
      AppCore?.utils?.error?.(...args);
    } catch {
      console.error(...args);
    }
  }

  function safeSetState(patch = {}) {
    try {
      AppCore?.setState?.(patch);
    } catch {}
  }

  function safeSetError(error = null) {
    try {
      AppCore?.setError?.(error);
    } catch {}
  }

  function safeEmit(eventName, payload = {}) {
    try {
      AppCore?.events?.emit?.(eventName, payload);
    } catch {}
  }

  function setBootFlags({
    booted = state.booted,
    booting = state.booting,
  } = {}) {
    state.booted = Boolean(booted);
    state.booting = Boolean(booting);

    markAppBootState(AppCore, {
      booted: state.booted,
      booting: state.booting,
    });

    safeSetState({
      booted: state.booted,
      booting: state.booting,
    });
  }

  function clearTransientBootState() {
    state.sessionRestorePromise = null;
    clearBootFailsafeTimer(state);
  }

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
        const value = localStorage.getItem(key);

        if (value === "dark" || value === "light") {
          savedTheme = value;
          break;
        }
      }

      if (!savedTheme) {
        savedTheme =
          window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: light)").matches
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

      if (typeof AppCore?.setTheme === "function") {
        AppCore.setTheme(savedTheme);
      } else {
        safeSetState({
          theme: savedTheme,
        });
      }
    } catch (error) {
      safeWarn("Theme preboot fallback error:", error);
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
      if (typeof Http?.init === "function") {
        Http.init();
      }

      state.servicesInitialized = true;
    }

    if (!AppCore.modules.has("http")) {
      AppCore.modules.register("http", Http);
    }
  }

  /* =========================================================
     STORE / AUTH / ROUTER REGISTRY
  ========================================================= */
  function initStore() {
    if (!state.storeInitialized) {
      if (typeof Store?.init === "function") {
        Store.init();
      }

      state.storeInitialized = true;
    }

    if (!AppCore.modules.has("store")) {
      AppCore.modules.register("store", Store);
    }

    if (!AppCore.modules.has("auth")) {
      AppCore.modules.register("auth", Auth);
    }

    if (!AppCore.modules.has("router")) {
      AppCore.modules.register("router", Router);
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
      state.sessionRestorePromise = Promise.resolve(
        restoreSessionInBackground({
          AppCore,
          Auth,
          Router,
          Toast,
          state,
          syncUserUI,
          warmup,
          navigateAfterSessionRestore,

          applyPostRenderLoaderPolicy: () =>
            applyPostRenderLoaderPolicy({
              AppCore,
              Router,
              hideLoader,
            }),
        })
      );

      await state.sessionRestorePromise;
    } catch (error) {
      safeWarn("restoreSession falló durante boot.", error);
    } finally {
      state.sessionRestorePromise = null;
    }
  }

  /* =========================================================
     FINALIZE
  ========================================================= */
  function finalizeBoot() {
    clearBootFailsafeTimer(state);

    markStoreBootState(Store, {
      ready: true,
      booted: true,
    });

    setBootFlags({
      booted: true,
      booting: false,
    });

    updateShellVisibilityByRoute(
      AppCore,
      Router
    );

    hideLoader(AppCore);

    safeEmit("app:ready", {
      route: AppCore.state.route,
      publicPath: AppCore.state.publicPath,
      user: AppCore.state.user,
      authenticated: AppCore.state.authenticated,
      lang: AppCore.state.lang,
    });
  }

  /* =========================================================
     BOOT
  ========================================================= */
  async function doBoot() {
    setBootFlags({
      booted: false,
      booting: true,
    });

    clearBootFailsafeTimer(state);

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

      safeSetError(null);

      /* ======================
         LOADER YA CON TEMA REAL
      ====================== */
      showLoader(AppCore);

      armBootFailsafeLoader({
        AppCore,
        state,
        hideLoader,
      });

      const scope = ensureScope(AppCore);

      bindGlobalErrorHandlers({
        AppCore,
        Toast,
        scope,
      });

      bindAppEvents({
        AppCore,
        I18n,
        Toast,
        scope,
        syncUserUI,

        rerenderCurrentRoute: () =>
          rerenderCurrentRoute({
            AppCore,
            Router,
            I18n,

            applyPostRenderLoaderPolicy: () =>
              applyPostRenderLoaderPolicy({
                AppCore,
                Router,
                hideLoader,
              }),

            syncUserUI,
          }),

        applyPostRenderLoaderPolicy: () =>
          applyPostRenderLoaderPolicy({
            AppCore,
            Router,
            hideLoader,
          }),
      });

      syncLangState(AppCore, I18n);

      initRouter();

      initUISystems({
        AppCore,
        Toast,
        SidebarUI,
        TopbarUI,
        state,
      });

      await restoreSessionBeforeRender();

      await Promise.resolve(
        renderInitialRoute({
          AppCore,
          Router,

          applyPostRenderLoaderPolicy: () =>
            applyPostRenderLoaderPolicy({
              AppCore,
              Router,
              hideLoader,
            }),
        })
      );

      finalizeBoot();

      return api;
    } catch (error) {
      clearBootFailsafeTimer(state);

      markStoreBootState(Store, {
        ready: false,
        booted: false,
      });

      setBootFlags({
        booted: false,
        booting: false,
      });

      safeSetError(error);

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

      safeError("Boot error:", error);

      return api;
    } finally {
      clearTransientBootState();

      if (!state.booted) {
        setBootFlags({
          booted: false,
          booting: false,
        });
      }

      applyPostRenderLoaderPolicy({
        AppCore,
        Router,
        hideLoader,
      });

      state.bootPromise = null;
    }
  }

  async function boot() {
    if (state.booted) {
      return api;
    }

    if (state.bootPromise) {
      return state.bootPromise;
    }

    state.bootPromise = doBoot();

    return state.bootPromise;
  }

  /* =========================================================
     REBOOT
  ========================================================= */
  async function reboot(options = {}) {
    const {
      preserveError = false,
    } = options;

    state.booted = false;
    state.booting = false;

    state.servicesInitialized = false;
    state.storeInitialized = false;
    state.routerConfigured = false;
    state.routerBound = false;
    state.uiInitialized = false;
    state.i18nInitialized = false;
    state.sessionRestorePromise = null;
    state.bootPromise = null;

    clearBootFailsafeTimer(state);

    clearScope(AppCore);

    if (!preserveError) {
      safeSetError(null);
    }

    markStoreBootState(Store, {
      ready: false,
      booted: false,
    });

    setBootFlags({
      booted: false,
      booting: false,
    });

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

export default App;
