/* =========================================================
   Onion SPA - Core
   Archivo: src/core/index.js

   Qué centraliza:
   - configuración global
   - estado global
   - helpers
   - cache DOM
   - storage namespaced
   - event bus
   - cleanup scopes
   - registro módulos
   - request/api client
   - init idempotente

   HARDENING PRO:
   - init serializado
   - auth derivada robusta
   - ready seguro
   - helpers enterprise
========================================================= */

import { config } from "./config.js";

import {
  isDocumentReady,
  safeClone,
  cloneError,
  joinUrl,
  buildUrl,
  normalizePath,
  normalizeCanonicalPath,
  stripUsernamePrefix,
  sanitizeUsername,
  slugify,
  normalizeUser,
  getUserUsername,
  getUserDisplayName,
  getUserAvatarUrl,
  hasValidToken,
  getInitials,
  isPublicApiPath,
} from "./helpers.js";

import {
  createInitialState,
  cloneState,
  setState as setStateBase,
  getState as getStateBase,
} from "./state.js";

import {
  createDomCache,
  cacheDom,
  validateRequiredDom,
} from "./dom.js";

import { createStorage } from "./storage.js";
import { createEvents } from "./events.js";
import { createCleanup } from "./cleanup.js";
import { createModules } from "./modules.js";
import { createHooks } from "./hooks.js";

import {
  setRoute as setRouteBase,
  setPublicPath as setPublicPathBase,
  setUser as setUserBase,
  setToken as setTokenBase,
  applySession as applySessionBase,
  clearSession as clearSessionBase,
  loadPreferences,
  loadSession,
  setTheme as setThemeBase,
  setLang as setLangBase,
  setSidebarOpen as setSidebarOpenBase,
  setLoading as setLoadingBase,
  setError as setErrorBase,
  syncBaseUI,
} from "./session.js";

import {
  setDocumentTitle as setDocumentTitleBase,
  clearDynamicContainers as clearDynamicContainersBase,
  syncUserUI as syncUserUIBase,
} from "./ui.js";

import {
  createRequest,
  createApiClient,
} from "./request.js";

import {
  bindNetworkEvents,
} from "./network.js";

export const AppCore = (() => {
  "use strict";

  let initPromise = null;
  let initialized = false;

  const state =
    createInitialState({
      config,
    });

  const dom =
    createDomCache();

  const registry = {
    modules: new Map(),
    scopes: new Map(),
    hooks: {
      beforeInit: [],
      afterInit: [],
      beforeRequest: [],
      afterResponse: [],
      onRequestError: [],
    },
  };

  const events =
    createEvents();

  const modules =
    createModules({
      registry,
      events,
    });

  const hooks =
    createHooks({
      registry,
    });

  /* =========================================================
     HELPERS
  ========================================================= */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

  function safeLog(...args) {
    if (!config.debug) return;
    console.log(
      `[${config.appName}]`,
      ...args
    );
  }

  function safeWarn(...args) {
    if (!config.debug) return;
    console.warn(
      `[${config.appName}]`,
      ...args
    );
  }

  function safeError(...args) {
    console.error(
      `[${config.appName}]`,
      ...args
    );
  }

  function syncDerivedAuthState() {
    state.authenticated =
      Boolean(
        state.token &&
        String(state.token).trim()
      );

    state.role =
      state.authenticated
        ? (
            state.user?.role ||
            state.user?.rol ||
            ""
          )
        : "";

    return state;
  }

  /* =========================================================
     UTILS
  ========================================================= */

  const utils = {
    qs(selector, scope = document) {
      if (!isBrowser()) return null;
      return scope?.querySelector?.(
        selector
      ) || null;
    },

    qsa(selector, scope = document) {
      if (!isBrowser()) return [];
      return Array.from(
        scope?.querySelectorAll?.(
          selector
        ) || []
      );
    },

    on(target, ev, fn, opts = false) {
      if (!target || !ev || !fn) {
        return () => {};
      }

      target.addEventListener(
        ev,
        fn,
        opts
      );

      return () =>
        target.removeEventListener(
          ev,
          fn,
          opts
        );
    },

    off(target, ev, fn, opts = false) {
      target?.removeEventListener?.(
        ev,
        fn,
        opts
      );
    },

    log: safeLog,
    warn: safeWarn,
    error: safeError,

    sleep(ms = 0) {
      return new Promise(
        (r) =>
          setTimeout(
            r,
            ms
          )
      );
    },

    safeClone,
    cloneError,
    joinUrl,
    buildUrl,
    normalizePath,
    normalizeCanonicalPath,
    stripUsernamePrefix,
    sanitizeUsername,
    slugify,
    normalizeUser,
    getUserUsername,
    getUserDisplayName,
    getUserAvatarUrl,
    hasValidToken,
    getInitials,
    isPublicApiPath,
  };

  const cleanup =
    createCleanup({
      registry,
      events,
      utils,
    });

  const storage =
    createStorage(utils);

  /* =========================================================
     STATE API
  ========================================================= */

  function setState(
    patch = {}
  ) {
    const next =
      setStateBase({
        state,
        events,
        patch,
      });

    syncDerivedAuthState();

    return next;
  }

  function getState() {
    syncDerivedAuthState();
    return getStateBase(
      state
    );
  }

  /* =========================================================
     UI
  ========================================================= */

  function setDocumentTitle(
    title = config.appName
  ) {
    return setDocumentTitleBase({
      dom,
      events,
      title,
    });
  }

  function clearDynamicContainers() {
    return clearDynamicContainersBase({
      dom,
      events,
    });
  }

  function syncUserUI() {
    return syncUserUIBase({
      state,
      dom,
      events,
    });
  }

  /* =========================================================
     SESSION
  ========================================================= */

  function setRoute(route = "/") {
    return setRouteBase({
      state,
      setState,
      events,
      route,
    });
  }

  function setPublicPath(
    path = "/"
  ) {
    return setPublicPathBase({
      storage,
      setState,
      events,
      path,
    });
  }

  function setUser(
    user = null
  ) {
    const result =
      setUserBase({
        state,
        storage,
        events,
        setState,
        syncUserUI,
        user,
      });

    syncDerivedAuthState();

    return result;
  }

  function setToken(
    token = null
  ) {
    const result =
      setTokenBase({
        state,
        storage,
        events,
        setState,
        token,
      });

    syncDerivedAuthState();

    return result;
  }

  function applySession({
    token = undefined,
    user = undefined,
  } = {}) {
    const result =
      applySessionBase({
        state,
        events,
        setUser:
          ({ user }) =>
            setUser(user),
        setToken:
          ({ token }) =>
            setToken(token),
        token,
        user,
      });

    syncDerivedAuthState();

    return result;
  }

  function clearSession() {
    const result =
      clearSessionBase({
        state,
        storage,
        events,
        setState,
        syncUserUI,
        utils,
      });

    syncDerivedAuthState();

    return result;
  }

  function setTheme(theme) {
    return setThemeBase({
      dom,
      storage,
      events,
      setState,
      theme,
    });
  }

  function setLang(lang) {
    return setLangBase({
      dom,
      storage,
      events,
      setState,
      lang,
    });
  }

  function setSidebarOpen(
    value
  ) {
    return setSidebarOpenBase({
      dom,
      storage,
      events,
      setState,
      value,
    });
  }

  function setLoading(
    value
  ) {
    return setLoadingBase({
      dom,
      events,
      setState,
      value,
    });
  }

  function setError(
    error = null
  ) {
    return setErrorBase({
      events,
      setState,
      cloneError,
      error,
    });
  }

  /* =========================================================
     REQUEST
  ========================================================= */

  const request =
    createRequest({
      state,
      events,
      setError,
      utils,
      registry,
    });

  const apiClient =
    createApiClient(
      request
    );

  /* =========================================================
     READY
  ========================================================= */

  function ready(fn) {
    if (
      typeof fn !== "function" ||
      !isBrowser()
    ) {
      return;
    }

    if (
      !isDocumentReady()
    ) {
      document.addEventListener(
        "DOMContentLoaded",
        fn,
        { once: true }
      );
      return;
    }

    fn();
  }

  /* =========================================================
     INIT
  ========================================================= */

  async function doInit() {
    try {
      state.booting = true;
      state.ready = false;

      cacheDom({
        dom,
        utils,
      });

      validateRequiredDom({
        dom,
        utils,
      });

      loadPreferences({
        state,
        storage,
        dom,
      });

      loadSession({
        state,
        storage,
      });

      syncDerivedAuthState();

      syncBaseUI({
        setDocumentTitle,
        syncUserUI,
      });

      bindNetworkEvents({
        state,
        events,
        cleanup,
        utils,
      });

      state.initialized = true;
      state.booting = false;
      state.ready = true;

      initialized = true;

      events.emit(
        "app:core:ready",
        {
          state:
            cloneState(state),
        }
      );

      safeLog(
        "Core ready."
      );

      return api;
    } catch (error) {
      state.initialized = false;
      state.ready = false;
      state.booting = false;

      setError(error);

      throw error;
    } finally {
      initPromise = null;
    }
  }

  async function init() {
    if (
      initialized ||
      state.initialized
    ) {
      return api;
    }

    if (initPromise) {
      return initPromise;
    }

    initPromise =
      doInit();

    return initPromise;
  }

  /* =========================================================
     API
  ========================================================= */

  const api = {
    config,
    state,
    dom,
    utils,
    storage,
    events,
    cleanup,
    modules,
    hooks,

    request,
    apiClient,

    init,
    ready,

    getState,
    setState,

    setRoute,
    setPublicPath,
    setUser,
    setToken,
    applySession,
    clearSession,

    setTheme,
    setLang,
    setSidebarOpen,
    setLoading,
    setError,

    setDocumentTitle,
    clearDynamicContainers,
    syncUserUI,

    getUserDisplayName,
    getUserUsername,
    getUserAvatarUrl,
    normalizeUser,
  };

  return api;
})();

export default AppCore;
