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
   - aplicar theme real antes loader
   - evitar paint login/protected incorrecto
   - no marcar ready antes de tiempo

   HARDENING PRO:
   - boot serializado
   - finalize único
   - reboot limpio
   - tolerancia total a fallos parciales
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

import { bindAppEvents } from "./events.js";

export const App = (() => {
  "use strict";

  const state = {
    booted: false,
    booting: false,

    servicesInitialized: false,
    storeInitialized: false,

    bootFailsafeTimer: null,
    sessionRestorePromise: null,
    bootPromise: null,
  };

  /* =========================================================
     HELPERS
  ========================================================= */

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

  function safeEmit(name, payload = {}) {
    try {
      AppCore?.events?.emit?.(
        name,
        payload
      );
    } catch {}
  }

  function safeSetError(error = null) {
    try {
      AppCore?.setError?.(error);
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

    AppCore?.setState?.({
      booted: state.booted,
      booting: state.booting,
    });
  }

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

      const theme =
        saved === "light"
          ? "light"
          : saved === "dark"
            ? "dark"
            : (
                window.matchMedia &&
                window.matchMedia(
                  "(prefers-color-scheme: light)"
                ).matches
              )
              ? "light"
              : "dark";

      html.setAttribute(
        "data-theme",
        theme
      );

      AppCore?.setTheme?.(
        theme
      );
    } catch {}
  }

  /* =========================================================
     INIT BLOCKS
  ========================================================= */

  async function initCore() {
    await AppCore.init();
  }

  function initServices() {
    if (
      !state.servicesInitialized
    ) {
      Http?.init?.();

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

  function initStore() {
    if (
      !state.storeInitialized
    ) {
      Store?.init?.();

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

  function initRouter() {
    configureRouter();
    bindRouter();
  }

  async function restoreSessionBeforeRender() {
    state.sessionRestorePromise =
      restoreSessionInBackground({
        AppCore,
        Auth,
        Router,
        state,
        syncUserUI,
        warmup,
      });

    try {
      await state.sessionRestorePromise;
    } finally {
      state.sessionRestorePromise =
        null;
    }
  }

  function finalizeBoot() {
    clearBootFailsafeTimer(
      state
    );

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

    safeEmit(
      "app:ready",
      {
        route:
          AppCore.state.route,
        authenticated:
          AppCore.state.authenticated,
        lang:
          AppCore.state.lang,
      }
    );

    safeLog(
      "App ready."
    );
  }

  /* =========================================================
     BOOT
  ========================================================= */

  async function doBoot() {
    try {
      setBootFlags({
        booted: false,
        booting: true,
      });

      clearScope(AppCore);
      clearBootFailsafeTimer(
        state
      );

      applyThemeBeforeLoader();

      await initCore();

      initServices();
      initStore();

      initI18n({
        AppCore,
        I18n,
        state,
      });

      syncLangState(
        AppCore,
        I18n
      );

      safeSetError(null);

      showLoader(AppCore);

      armBootFailsafeLoader({
        AppCore,
        state,
        hideLoader,
      });

      const scope =
        ensureScope(AppCore);

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
        rerenderCurrentRoute:
          () =>
            rerenderCurrentRoute({
              AppCore,
              Router,
              I18n,
              syncUserUI,
              applyPostRenderLoaderPolicy:
                () =>
                  applyPostRenderLoaderPolicy({
                    AppCore,
                    Router,
                    hideLoader,
                  }),
            }),
        applyPostRenderLoaderPolicy:
          () =>
            applyPostRenderLoaderPolicy({
              AppCore,
              Router,
              hideLoader,
            }),
      });

      initRouter();

      initUISystems({
        AppCore,
        Toast,
        SidebarUI,
        TopbarUI,
        state,
      });

      /* CRÍTICO */
      await restoreSessionBeforeRender();

      await renderInitialRoute();

      finalizeBoot();

      return api;
    } catch (error) {
      safeError(
        "Boot error:",
        error
      );

      hideLoader(AppCore);

      setBootFlags({
        booted: false,
        booting: false,
      });

      markStoreBootState(Store, {
        ready: false,
        booted: false,
      });

      safeSetError(error);

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

      state.bootPromise = null;

      applyPostRenderLoaderPolicy({
        AppCore,
        Router,
        hideLoader,
      });
    }
  }

  async function boot() {
    if (state.booted) {
      return api;
    }

    if (state.bootPromise) {
      return state.bootPromise;
    }

    state.bootPromise =
      doBoot();

    return state.bootPromise;
  }

  /* =========================================================
     REBOOT
  ========================================================= */

  async function reboot() {
    clearScope(AppCore);

    clearBootFailsafeTimer(
      state
    );

    state.booted = false;
    state.booting = false;
    state.servicesInitialized = false;
    state.storeInitialized = false;
    state.sessionRestorePromise = null;
    state.bootPromise = null;

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

  const api = {
    boot,
    reboot,
  };

  return api;
})();

export default App;
