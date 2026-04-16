/* =========================================================
   Onion SPA - App Bootstrap
   Archivo: src/app/index.js

   RESPONSABILIDADES:
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
   - finalize único por ciclo
   - reboot limpio
   - tolerancia total a fallos parciales
   - no contaminar ciclos viejos
   - evitar doble hide/doble ready

   UX PRO:
   - loader global con visibilidad mínima garantizada
   - anti-flicker real en primer boot
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

  const MIN_BOOT_LOADER_MS = 1000;

  const state = {
    booted: false,
    booting: false,

    servicesInitialized: false,
    storeInitialized: false,
    routerInitialized: false,
    uiInitialized: false,
    globalHandlersBound: false,
    appEventsBound: false,

    bootFailsafeTimer: null,
    sessionRestorePromise: null,
    bootPromise: null,
    bootCycleId: 0,

    loaderShownAt: 0,
    loaderVisible: false,
    finalizedCycleId: 0,
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
      AppCore?.events?.emit?.(name, payload);
    } catch {}
  }

  function safeSetError(error = null) {
    try {
      AppCore?.setError?.(error);
    } catch {}
  }

  function delay(ms = 0) {
    return new Promise((resolve) => {
      setTimeout(resolve, Math.max(0, Number(ms) || 0));
    });
  }

  function nextBootCycleId() {
    state.bootCycleId += 1;
    return state.bootCycleId;
  }

  function isStaleBootCycle(cycleId) {
    return Number(cycleId) !== Number(state.bootCycleId);
  }

  function markLoaderShownNow() {
    state.loaderShownAt = Date.now();
  }

  function getRemainingBootLoaderMs() {
    const shownAt = Number(state.loaderShownAt) || 0;

    if (!shownAt) {
      return 0;
    }

    const elapsed = Date.now() - shownAt;

    return Math.max(
      0,
      MIN_BOOT_LOADER_MS - elapsed
    );
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
      const html = document.documentElement;

      const saved =
        localStorage.getItem("onion:theme") ||
        localStorage.getItem("theme");

      const theme =
        saved === "light"
          ? "light"
          : saved === "dark"
            ? "dark"
            : (
                window.matchMedia &&
                window.matchMedia("(prefers-color-scheme: light)").matches
              )
              ? "light"
              : "dark";

      html.setAttribute("data-theme", theme);
      AppCore?.setTheme?.(theme);
    } catch {}
  }

  function showBootLoader() {
    markLoaderShownNow();
    state.loaderVisible = true;
    showLoader(AppCore);
  }

  function hideBootLoader() {
    if (!state.loaderVisible) {
      return;
    }

    state.loaderVisible = false;
    hideLoader(AppCore);
  }

  function resetPerBootMarkers() {
    state.finalizedCycleId = 0;
    state.loaderShownAt = 0;
    state.loaderVisible = false;
  }

  function registerCoreModules() {
    if (!AppCore?.modules?.has?.("http")) {
      AppCore.modules.register("http", Http);
    }

    if (!AppCore?.modules?.has?.("store")) {
      AppCore.modules.register("store", Store);
    }

    if (!AppCore?.modules?.has?.("auth")) {
      AppCore.modules.register("auth", Auth);
    }

    if (!AppCore?.modules?.has?.("router")) {
      AppCore.modules.register("router", Router);
    }
  }

  function bindGlobalHandlersOnce(scope) {
    if (state.globalHandlersBound) {
      return;
    }

    bindGlobalErrorHandlers({
      AppCore,
      Toast,
      scope,
    });

    state.globalHandlersBound = true;
  }

  function bindAppEventsOnce(scope) {
    if (state.appEventsBound) {
      return;
    }

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
          syncUserUI,
          applyPostRenderLoaderPolicy: () =>
            applyPostRenderLoaderPolicy({
              AppCore,
              Router,
              hideLoader,
            }),
        }),

      applyPostRenderLoaderPolicy: () =>
        applyPostRenderLoaderPolicy({
          AppCore,
          Router,
          hideLoader,
        }),
    });

    state.appEventsBound = true;
  }

  /* =========================================================
     INIT BLOCKS
  ========================================================= */

  async function initCore() {
    await AppCore.init();
  }

  function initServices() {
    if (!state.servicesInitialized) {
      Http?.init?.();
      state.servicesInitialized = true;
    }

    registerCoreModules();
  }

  function initStore() {
    if (!state.storeInitialized) {
      Store?.init?.();
      state.storeInitialized = true;
    }

    registerCoreModules();
  }

  function initRouter() {
    if (state.routerInitialized) {
      return;
    }

    configureRouter();
    bindRouter();

    state.routerInitialized = true;
  }

  function initUI() {
    if (state.uiInitialized) {
      return;
    }

    initUISystems({
      AppCore,
      Toast,
      SidebarUI,
      TopbarUI,
      state,
    });

    state.uiInitialized = true;
  }

  async function restoreSessionBeforeRender(cycleId) {
    if (state.sessionRestorePromise) {
      return state.sessionRestorePromise;
    }

    state.sessionRestorePromise = restoreSessionInBackground({
      AppCore,
      Auth,
      Router,
      state,
      syncUserUI,
      warmup,
    });

    try {
      const result = await state.sessionRestorePromise;

      if (isStaleBootCycle(cycleId)) {
        return result;
      }

      return result;
    } finally {
      if (!isStaleBootCycle(cycleId)) {
        state.sessionRestorePromise = null;
      }
    }
  }

  async function finalizeBoot(cycleId) {
    if (isStaleBootCycle(cycleId)) {
      return;
    }

    if (state.finalizedCycleId === cycleId) {
      return;
    }

    state.finalizedCycleId = cycleId;

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

    const remainingMs = getRemainingBootLoaderMs();

    if (remainingMs > 0) {
      await delay(remainingMs);
    }

    if (isStaleBootCycle(cycleId)) {
      return;
    }

    hideBootLoader();

    safeEmit("app:ready", {
      route: AppCore?.state?.route,
      publicPath: AppCore?.state?.publicPath,
      authenticated: AppCore?.state?.authenticated,
      lang: AppCore?.state?.lang,
    });

    safeLog("App ready.");
  }

  /* =========================================================
     BOOT
  ========================================================= */

  async function doBoot(cycleId) {
    try {
      if (isStaleBootCycle(cycleId)) {
        return api;
      }

      resetPerBootMarkers();

      setBootFlags({
        booted: false,
        booting: true,
      });

      markStoreBootState(Store, {
        ready: false,
        booted: false,
      });

      clearScope(AppCore);
      clearBootFailsafeTimer(state);

      applyThemeBeforeLoader();

      await initCore();

      if (isStaleBootCycle(cycleId)) {
        return api;
      }

      initServices();
      initStore();

      initI18n({
        AppCore,
        I18n,
        state,
      });

      syncLangState(AppCore, I18n);
      safeSetError(null);

      showBootLoader();

      armBootFailsafeLoader({
        AppCore,
        state,
        hideLoader: hideBootLoader,
      });

      const scope = ensureScope(AppCore);

      bindGlobalHandlersOnce(scope);
      bindAppEventsOnce(scope);

      initRouter();
      initUI();

      /* FIX CRÍTICO:
         restaurar sesión ANTES del primer render */
      await restoreSessionBeforeRender(cycleId);

      if (isStaleBootCycle(cycleId)) {
        return api;
      }

      /* único render inicial del ciclo */
      await renderInitialRoute();

      if (isStaleBootCycle(cycleId)) {
        return api;
      }

      await finalizeBoot(cycleId);

      return api;
    } catch (error) {
      safeError("Boot error:", error);

      try {
        const remainingMs = getRemainingBootLoaderMs();

        if (remainingMs > 0) {
          await delay(remainingMs);
        }
      } catch {}

      hideBootLoader();

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
        hideLoader: hideBootLoader,
      });

      return api;
    } finally {
      if (!isStaleBootCycle(cycleId)) {
        clearBootFailsafeTimer(state);
        state.bootPromise = null;

        applyPostRenderLoaderPolicy({
          AppCore,
          Router,
          hideLoader: hideBootLoader,
        });
      }
    }
  }

  async function boot() {
    if (state.booted) {
      return api;
    }

    if (state.bootPromise) {
      return state.bootPromise;
    }

    const cycleId = nextBootCycleId();

    state.bootPromise = doBoot(cycleId);

    return state.bootPromise;
  }

  /* =========================================================
     REBOOT
  ========================================================= */

  async function reboot() {
    nextBootCycleId();

    clearScope(AppCore);
    clearBootFailsafeTimer(state);

    state.booted = false;
    state.booting = false;

    state.servicesInitialized = false;
    state.storeInitialized = false;
    state.routerInitialized = false;
    state.uiInitialized = false;

    state.sessionRestorePromise = null;
    state.bootPromise = null;

    resetPerBootMarkers();

    markStoreBootState(Store, {
      ready: false,
      booted: false,
    });

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
