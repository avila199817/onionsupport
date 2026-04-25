/* =========================================================
   Onion SPA - App Bootstrap
   Archivo: src/app/index.js

   RESPONSABILIDADES:
   - arrancar la SPA de forma ordenada
   - capturar URL inicial antes de Router/History
   - preservar /activate-account?token=... durante el boot
   - configurar servicios, store, i18n, UI y router
   - restaurar sesión sin romper rutas públicas técnicas
   - render inicial robusto
   - loader boot controlado
   - emitir app:ready una sola vez

   FIX CRÍTICO:
   - NO hacer bindRouter() antes de renderInitialRoute()
   - renderizar /activate-account antes de restoreSession si hay token
   - no permitir que restore/auth/history limpien el token antes de la vista
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
} from "./loader.js";

import {
  getViewContainer,
  setShellVisibility,
  updateShellVisibilityByRoute,
} from "./shell.js";

import {
  markAppBootState,
  markStoreBootState,
} from "./boot-state.js";

import {
  syncLangState,
  initI18n,
} from "./i18n.js";

import {
  syncUserUI,
  initUISystems,
} from "./ui.js";

import {
  configureRouter,
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

/* =========================================================
   EARLY URL CAPTURE
========================================================= */

const ACTIVATION_PATH = "/activate-account";

const ACTIVATION_TOKEN_PARAM_NAMES = [
  "token",
  "activationToken",
  "activateToken",
  "code",
  "t",
];

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

function isHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function normalizePathnameOnly(pathname = "/") {
  let value = String(pathname || "/")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") ||
      "/";
  }

  return value;
}

function pathFromUrlLike(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    const parsed =
      new URL(raw, getBaseOrigin());

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      return normalizeHashRouterPath(
        parsed.hash
      );
    }

    return `${normalizePathnameOnly(
      parsed.pathname || "/"
    )}${parsed.search || ""}${parsed.hash || ""}`;
  } catch {
    const hashIndex =
      raw.indexOf("#");

    if (hashIndex >= 0) {
      const hash =
        raw.slice(hashIndex);

      if (isHashRouterPath(hash)) {
        return normalizeHashRouterPath(hash);
      }
    }

    return raw.startsWith("/")
      ? raw
      : `/${raw}`;
  }
}

function isActivationPath(pathOrUrl = "") {
  const path =
    pathFromUrlLike(pathOrUrl);

  const cleanPath =
    path.split("?")[0].split("#")[0];

  return (
    cleanPath === ACTIVATION_PATH ||
    cleanPath.startsWith(`${ACTIVATION_PATH}/`)
  );
}

function hasTokenInSearch(search = "") {
  try {
    const params =
      new URLSearchParams(search || "");

    return ACTIVATION_TOKEN_PARAM_NAMES.some(
      (name) =>
        Boolean(
          safeText(
            params.get(name),
            ""
          )
        )
    );
  } catch {
    return false;
  }
}

function hasActivationToken(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return false;
  }

  try {
    const parsed =
      new URL(raw, getBaseOrigin());

    if (
      hasTokenInSearch(parsed.search)
    ) {
      return true;
    }

    if (
      parsed.hash &&
      parsed.hash.includes("?")
    ) {
      const query =
        parsed.hash.split("?").slice(1).join("?");

      return hasTokenInSearch(
        query ? `?${query}` : ""
      );
    }
  } catch {
    if (raw.includes("?")) {
      const query =
        raw.split("?").slice(1).join("?").split("#")[0];

      if (
        hasTokenInSearch(
          query ? `?${query}` : ""
        )
      ) {
        return true;
      }
    }

    if (
      raw.includes("#") &&
      raw.includes("?")
    ) {
      const query =
        raw.split("?").slice(1).join("?");

      if (
        hasTokenInSearch(
          query ? `?${query}` : ""
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function captureInitialUrl() {
  if (!isBrowser()) {
    return {
      initialUrl: "",
      activationInitialUrl: "",
      activationInitialPath: "",
      isActivation: false,
      hasActivationToken: false,
    };
  }

  let href = "";

  try {
    href = window.location.href;
  } catch {
    href = "";
  }

  if (href) {
    try {
      if (!window.__ONION_INITIAL_URL__) {
        window.__ONION_INITIAL_URL__ = href;
      }
    } catch {}

    try {
      if (
        isActivationPath(href) &&
        !window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__
      ) {
        window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__ = href;
      }
    } catch {}
  }

  const initialUrl =
    safeText(
      window.__ONION_INITIAL_URL__,
      href
    );

  const activationInitialUrl =
    safeText(
      window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__,
      ""
    );

  const activationInitialPath =
    activationInitialUrl
      ? pathFromUrlLike(activationInitialUrl)
      : "";

  return {
    initialUrl,
    activationInitialUrl,
    activationInitialPath,
    isActivation:
      isActivationPath(
        activationInitialUrl || initialUrl || href
      ),
    hasActivationToken:
      hasActivationToken(
        activationInitialUrl || initialUrl || href
      ),
  };
}

let BOOT_URL_CONTEXT =
  captureInitialUrl();

/* =========================================================
   APP
========================================================= */

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

  /* =======================================================
     SAFE
  ======================================================= */

  function safeEmit(name, payload = {}) {
    try {
      AppCore?.events?.emit?.(
        name,
        payload
      );
    } catch {}
  }

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.(
        "[App]",
        ...args
      );
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.(
        "[App]",
        ...args
      );
    } catch {}

    try {
      console.warn("[App]", ...args);
    } catch {}
  }

  function safeError(...args) {
    try {
      AppCore?.utils?.error?.(
        "[App]",
        ...args
      );
    } catch {}

    try {
      console.error("[App]", ...args);
    } catch {}
  }

  function wait(ms = 0) {
    return new Promise((resolve) =>
      setTimeout(resolve, ms)
    );
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
      sidebarSnapshot:
        getSidebarSnapshot(),
      topbarSnapshot:
        getTopbarSnapshot(),
    });
  }

  function refreshBootUrlContext() {
    BOOT_URL_CONTEXT =
      captureInitialUrl();

    return BOOT_URL_CONTEXT;
  }

  function isActivationBoot() {
    const context =
      refreshBootUrlContext();

    return Boolean(
      context.isActivation &&
      context.hasActivationToken
    );
  }

  function exposeBootUrlContextToCore() {
    const context =
      refreshBootUrlContext();

    try {
      AppCore?.setState?.({
        bootInitialUrl:
          context.initialUrl,
        bootActivationInitialUrl:
          context.activationInitialUrl,
        bootActivationInitialPath:
          context.activationInitialPath,
        bootIsActivation:
          context.isActivation,
        bootHasActivationToken:
          context.hasActivationToken,
      });
    } catch {}

    return context;
  }

  /* =======================================================
     BOOT STATE
  ======================================================= */

  function nextCycle() {
    state.bootCycleId += 1;
    return state.bootCycleId;
  }

  function isStale(id) {
    return id !== state.bootCycleId;
  }

  function markBooting(cycleId) {
    try {
      markAppBootState?.(AppCore, {
        booting: true,
        booted: false,
        ready: false,
        cycleId,
      });
    } catch {}
  }

  function markBooted(cycleId) {
    try {
      markAppBootState?.(AppCore, {
        booting: false,
        booted: true,
        ready: true,
        cycleId,
      });
    } catch {}
  }

  /* =======================================================
     LOADER
  ======================================================= */

  function showBootLoader() {
    if (state.loaderVisible) {
      return;
    }

    state.loaderVisible = true;
    state.loaderShownAt = Date.now();

    try {
      showLoader(AppCore);
    } catch {}
  }

  function hideBootLoader() {
    if (!state.loaderVisible) {
      return;
    }

    state.loaderVisible = false;

    try {
      hideLoader(AppCore);
    } catch {}
  }

  /* =======================================================
     INIT BLOCKS
  ======================================================= */

  function bindGlobalHandlersBlock() {
    if (state.handlersBound) {
      return;
    }

    try {
      bindGlobalErrorHandlers?.({
        AppCore,
        Auth,
        Toast,
      });
    } catch {}

    state.handlersBound = true;
  }

  function bindAppEventsBlock() {
    if (state.appEventsBound) {
      return;
    }

    try {
      bindAppEvents?.({
        AppCore,
        Auth,
        Router,
        Store,
        SidebarUI,
        TopbarUI,
        Toast,
        I18n,
      });
    } catch {}

    state.appEventsBound = true;
  }

  function initServices() {
    if (state.servicesReady) {
      return;
    }

    try {
      Http?.init?.();
    } catch (error) {
      safeWarn(
        "No se pudo inicializar Http.",
        error
      );
    }

    state.servicesReady = true;
  }

  function initStoreBlock() {
    if (state.storeReady) {
      return;
    }

    try {
      Store?.init?.();
    } catch (error) {
      safeWarn(
        "No se pudo inicializar Store.",
        error
      );
    }

    state.storeReady = true;
  }

  function initI18nBlock() {
    try {
      initI18n?.({
        AppCore,
        I18n,
      });
    } catch {}

    try {
      syncLangState?.({
        AppCore,
        I18n,
      });
    } catch {}
  }

  function initRouterBlock() {
    if (state.routerReady) {
      return;
    }

    /*
      CRÍTICO:
      Aquí SOLO se configura.
      NO llamar bindRouter() aquí.

      renderInitialRoute() ya se encarga de hacer bind después
      de capturar el path inicial protegido.
    */
    try {
      configureRouter();
    } catch (error) {
      safeWarn(
        "No se pudo configurar Router.",
        error
      );
    }

    state.routerReady = true;
  }

  function initUIBlock() {
    if (state.uiReady) {
      return;
    }

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

  async function restoreSessionBlock({
    cycleId,
    nonBlocking = false,
  } = {}) {
    if (isStale(cycleId)) {
      return null;
    }

    if (state.restorePromise) {
      return state.restorePromise;
    }

    state.restorePromise =
      restoreSessionInBackground({
        AppCore,
        Auth,
        Router,
        state,
        syncUserUI,
        warmup,
      });

    try {
      return await state.restorePromise;
    } catch (error) {
      if (nonBlocking) {
        safeWarn(
          "Restore session no bloqueante falló.",
          error
        );
        return null;
      }

      throw error;
    } finally {
      if (!isStale(cycleId)) {
        state.restorePromise = null;
      }
    }
  }

  /* =======================================================
     FINALIZE
  ======================================================= */

  async function finalizeBoot(cycleId) {
    if (isStale(cycleId)) {
      return;
    }

    if (state.finalizedCycleId === cycleId) {
      return;
    }

    state.finalizedCycleId = cycleId;

    clearBootFailsafeTimer(state);

    try {
      markStoreBootState(Store, {
        ready: true,
        booted: true,
      });
    } catch {}

    state.booted = true;
    state.booting = false;

    markBooted(cycleId);

    try {
      updateShellVisibilityByRoute(
        AppCore,
        Router
      );
    } catch {}

    const remaining =
      Math.max(
        0,
        MIN_BOOT_LOADER_MS -
          (Date.now() - state.loaderShownAt)
      );

    if (remaining > 0) {
      await wait(remaining);
    }

    hideBootLoader();

    if (!state.readyEmitted) {
      state.readyEmitted = true;

      safeEmit("app:ready", {
        sidebarSnapshot:
          getSidebarSnapshot(),
        topbarSnapshot:
          getTopbarSnapshot(),
      });
    }
  }

  /* =======================================================
     BOOT
  ======================================================= */

  async function doBoot(cycleId) {
    try {
      state.booting = true;

      markBooting(cycleId);

      /*
        Captura temprana antes de cualquier init real.
      */
      refreshBootUrlContext();

      bindGlobalHandlersBlock();

      await AppCore.init();

      ensureScope(AppCore);

      const bootContext =
        exposeBootUrlContextToCore();

      bindAppEventsBlock();

      initServices();
      initStoreBlock();
      initI18nBlock();

      /*
        Solo configureRouter().
        El bind real queda delegado a renderInitialRoute().
      */
      initRouterBlock();

      initUIBlock();

      showBootLoader();

      /*
        CASO CRÍTICO:
        Si entramos desde /activate-account?token=...
        renderizamos primero para que ActivateAccountView capture el token
        antes de que restore/session/auth puedan tocar navegación o history.
      */
      if (
        bootContext.isActivation &&
        bootContext.hasActivationToken
      ) {
        safeLog(
          "Boot activation-first.",
          bootContext
        );

        await renderInitialRoute();

        await restoreSessionBlock({
          cycleId,
          nonBlocking: true,
        });
      } else {
        await restoreSessionBlock({
          cycleId,
          nonBlocking: false,
        });

        await renderInitialRoute();
      }

      await finalizeBoot(cycleId);

      return api;
    } catch (error) {
      state.booting = false;

      hideBootLoader();

      safeError(
        "Boot error.",
        error
      );

      try {
        renderBootError({
          AppCore,
          Auth,
          Toast,
          error,
          getViewContainer,
          setShellVisibility,
          hideLoader,
        });
      } catch {}

      return api;
    }
  }

  function boot() {
    if (state.booted) {
      return Promise.resolve(api);
    }

    if (state.bootPromise) {
      return state.bootPromise;
    }

    const cycleId =
      nextCycle();

    state.bootPromise =
      doBoot(cycleId);

    return state.bootPromise;
  }

  async function reboot() {
    nextCycle();

    state.booted = false;
    state.booting = false;
    state.uiMounted = false;
    state.readyEmitted = false;
    state.finalizedCycleId = 0;
    state.restorePromise = null;
    state.bootPromise = null;

    try {
      clearScope(AppCore);
    } catch {}

    hideBootLoader();

    return boot();
  }

  function getState() {
    const context =
      refreshBootUrlContext();

    return {
      ...state,
      bootUrlContext:
        context,
      route:
        AppCore?.state?.route || "/",
      publicPath:
        AppCore?.state?.publicPath || "/",
    };
  }

  const api = {
    boot,
    reboot,
    getState,
  };

  return api;
})();

export default App;
