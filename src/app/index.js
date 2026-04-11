/* =========================================================
   Onion SPA - App Bootstrap
   Archivo: src/app/index.js

   Responsabilidades:
   - punto de entrada del bootstrap de la aplicación
   - composición de submódulos del app
   - controlar boot / reboot
   - mantener la API pública App
========================================================= */

import { AppCore } from "../core/core.js";
import { Store } from "../store/store.js";
import { Auth } from "../features/auth.js";
import { Router } from "../router/router.js";
import { SidebarUI } from "../ui/sidebar/index.js";
import { TopbarUI } from "../ui/topbar.js";
import { Toast } from "../ui/toast.js";
import { I18n } from "../i18n/index.js";

import { ensureScope, clearScope } from "./helpers.js";
import { showLoader, hideLoader, clearBootFailsafeTimer, armBootFailsafeLoader } from "./loader.js";
import { getViewContainer, setShellVisibility, applyPostRenderLoaderPolicy, updateShellVisibilityByRoute } from "./shell.js";
import { markAppBootState, markStoreBootState } from "./boot-state.js";
import { syncLangState, initI18n, rerenderCurrentRoute } from "./i18n.js";
import { syncUserUI, initUISystems } from "./ui.js";
import { bindRouter, renderInitialRoute } from "./router.js";
import { warmup } from "./warmup.js";
import { navigateAfterSessionRestore, restoreSessionInBackground } from "./session.js";
import { renderBootError, bindGlobalErrorHandlers } from "./errors.js";
import { bindAppEvents } from "./events.js";

export const App = (() => {
  "use strict";

  /* =========================================================
     INTERNAL STATE
  ========================================================= */
  const state = {
    booted: false,
    booting: false,
    storeInitialized: false,
    routerBound: false,
    uiInitialized: false,
    i18nInitialized: false,
    bootFailsafeTimer: null,
    sessionRestorePromise: null,
  };

  /* =========================================================
     CORE / STORE
  ========================================================= */
  async function initCore() {
    await AppCore.init();
  }

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
     FINALIZACIÓN DE BOOT
  ========================================================= */
  function finalizeBoot() {
    clearBootFailsafeTimer(state);

    markStoreBootState(Store, {
      ready: true,
      booted: true,
    });

    state.booted = true;
    state.booting = false;

    markAppBootState(AppCore, {
      booted: true,
      booting: false,
    });

    hideLoader(AppCore);
    updateShellVisibilityByRoute(AppCore, Router);

    AppCore.events.emit("app:ready", {
      route: AppCore.state.route,
      publicPath: AppCore.state.publicPath,
      user: AppCore.state.user,
      authenticated: AppCore.state.authenticated,
      lang: AppCore.state.lang,
    });

    AppCore.utils.log("🔥 Aplicación arrancada correctamente.", {
      route: AppCore.state.route,
      publicPath: AppCore.state.publicPath,
      username: AppCore.state.user?.username || null,
      authenticated: AppCore.state.authenticated,
      lang: AppCore.state.lang,
    });
  }

  /* =========================================================
     BOOT
  ========================================================= */
  async function boot() {
    if (state.booted) {
      AppCore.utils.warn("App ya arrancada.");
      return api;
    }

    if (state.booting) {
      AppCore.utils.warn("App ya está arrancando.");
      return api;
    }

    state.booting = true;

    markAppBootState(AppCore, {
      booted: false,
      booting: true,
    });

    clearBootFailsafeTimer(state);

    try {
      clearScope(AppCore);

      await initCore();

      initI18n({
        AppCore,
        I18n,
        state,
      });

      AppCore.setError(null);
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

      initStore();

      bindRouter({
        Router,
        state,
      });

      renderInitialRoute({
        AppCore,
        Router,
        applyPostRenderLoaderPolicy: () =>
          applyPostRenderLoaderPolicy({
            AppCore,
            Router,
            hideLoader,
          }),
      });

      initUISystems({
        AppCore,
        Toast,
        SidebarUI,
        TopbarUI,
        state,
      });

      syncUserUI(AppCore);
      syncLangState(AppCore, I18n);

      finalizeBoot();

      void restoreSessionInBackground({
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
      });

      return api;
    } catch (error) {
      clearBootFailsafeTimer(state);

      state.booted = false;
      state.booting = false;

      markStoreBootState(Store, {
        ready: false,
        booted: false,
      });

      markAppBootState(AppCore, {
        booted: false,
        booting: false,
      });

      AppCore.setError(error);
      AppCore.utils.error("💥 Fallo en boot()", error);

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
      clearBootFailsafeTimer(state);
      state.booting = false;
      AppCore.setState({ booting: false });

      applyPostRenderLoaderPolicy({
        AppCore,
        Router,
        hideLoader,
      });
    }
  }

  /* =========================================================
     REBOOT
  ========================================================= */
  async function reboot(options = {}) {
    const { preserveError = false } = options;

    state.booted = false;
    state.booting = false;
    state.storeInitialized = false;
    state.routerBound = false;
    state.uiInitialized = false;
    state.i18nInitialized = false;
    state.sessionRestorePromise = null;

    clearBootFailsafeTimer(state);
    clearScope(AppCore);

    if (!preserveError) {
      AppCore.setError(null);
    }

    markStoreBootState(Store, {
      ready: false,
      booted: false,
    });

    hideLoader(AppCore);

    return boot();
  }

  /* =========================================================
     API PÚBLICA
  ========================================================= */
  const api = {
    boot,
    reboot,
  };

  return api;
})();
