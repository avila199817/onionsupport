/* =========================================================
   Onion SPA - App Bootstrap (FIXED)
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

import { ensureScope, clearScope } from "./helpers.js";

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

    uiMounted: false,
    readyEmitted: false,

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

  /* ================= SAFE ================= */

  function safeEmit(name, payload = {}) {
    try {
      AppCore?.events?.emit?.(name, payload);
    } catch {}
  }

  function wait(ms = 0) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function getSidebarSnapshot() {
    try {
      return SidebarUI?.getState?.() || {};
    } catch {
      return {};
    }
  }

  function getTopbarSnapshot() {
    try {
      return TopbarUI?.getState?.() || {};
    } catch {
      return {};
    }
  }

  function safeEmitUIReady() {
    safeEmit("app:ui:ready", {
      sidebarSnapshot: getSidebarSnapshot(),
      topbarSnapshot: getTopbarSnapshot(),
    });
  }

  /* ================= BOOT ================= */

  function nextCycle() {
    state.bootCycleId += 1;
    return state.bootCycleId;
  }

  function isStale(id) {
    return id !== state.bootCycleId;
  }

  function showBootLoader() {
    if (state.loaderVisible) return;
    state.loaderVisible = true;
    state.loaderShownAt = Date.now();
    showLoader(AppCore);
  }

  function hideBootLoader() {
    if (!state.loaderVisible) return;
    state.loaderVisible = false;
    hideLoader(AppCore);
  }

  function initServices() {
    if (!state.servicesReady) {
      Http?.init?.();
      state.servicesReady = true;
    }
  }

  function initStoreBlock() {
    if (!state.storeReady) {
      Store?.init?.();
      state.storeReady = true;
    }
  }

  function initRouterBlock() {
    if (state.routerReady) return;
    configureRouter();
    bindRouter();
    state.routerReady = true;
  }

  function initUIBlock() {
    if (state.uiReady) return;

    initUISystems({
      AppCore,
      Toast,
      SidebarUI,
      TopbarUI,
      state,
    });

    state.uiReady = true;
    state.uiMounted = true;

    safeEmitUIReady();
  }

  async function finalizeBoot(cycleId) {
    if (isStale(cycleId)) return;
    if (state.finalizedCycleId === cycleId) return;

    state.finalizedCycleId = cycleId;

    clearBootFailsafeTimer(state);

    markStoreBootState(Store, {
      ready: true,
      booted: true,
    });

    state.booted = true;
    state.booting = false;

    updateShellVisibilityByRoute(AppCore, Router);

    const remaining = Math.max(
      0,
      MIN_BOOT_LOADER_MS - (Date.now() - state.loaderShownAt)
    );

    if (remaining > 0) await wait(remaining);

    hideBootLoader();

    if (!state.readyEmitted) {
      state.readyEmitted = true;

      safeEmit("app:ready", {
        sidebarSnapshot: getSidebarSnapshot(),
        topbarSnapshot: getTopbarSnapshot(),
      });
    }
  }

  async function doBoot(cycleId) {
    try {
      state.booting = true;

      await AppCore.init();

      initServices();
      initStoreBlock();
      initRouterBlock();
      initUIBlock();

      showBootLoader();

      await restoreSessionInBackground({
        AppCore,
        Auth,
        Router,
        state,
        syncUserUI,
        warmup,
      });

      await renderInitialRoute();

      await finalizeBoot(cycleId);

      return api;
    } catch (e) {
      hideBootLoader();
      renderBootError({ AppCore, error: e });
      return api;
    }
  }

  function boot() {
    if (state.booted) return Promise.resolve(api);
    if (state.bootPromise) return state.bootPromise;

    const cycleId = nextCycle();
    state.bootPromise = doBoot(cycleId);

    return state.bootPromise;
  }

  async function reboot() {
    nextCycle();

    state.booted = false;
    state.booting = false;
    state.uiMounted = false;
    state.readyEmitted = false;

    hideBootLoader();

    return boot();
  }

  const api = { boot, reboot };

  return api;
})();

export default App;
