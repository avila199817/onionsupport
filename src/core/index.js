/* =========================================================
   Onion SPA - Core
   Archivo: src/core/index.js

   QUÉ CENTRALIZA:
   - configuración global
   - estado global robusto
   - helpers enterprise
   - cache DOM
   - storage namespaced
   - event bus
   - cleanup scopes
   - módulos
   - request/api client
   - init idempotente real
   - wrappers seguros de session/ui

   HARDENING EXTREMO:
   - cero undefined setters
   - estado siempre vivo
   - boot serializado
   - compat total con router/auth
   - sync auth derivada robusta
   - API congelada estable
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

/* =========================================================
   SINGLETON
========================================================= */

export const AppCore = (() => {
  "use strict";

  let initPromise = null;
  let initialized = false;

  /* =========================================================
     ROOT STATE
  ========================================================= */

  const state =
    createInitialState({
      config,
    }) || {};

  const dom =
    createDomCache() || {};

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
     BASICS
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

  function ensureState() {
    if (
      !state ||
      typeof state !== "object"
    ) {
      return {};
    }

    return state;
  }

  function syncDerivedAuthState() {
    const root =
      ensureState();

    root.authenticated =
      Boolean(
        root.token &&
        String(root.token).trim()
      );

    root.role =
      root.authenticated
        ? String(
            root.user?.role ||
              root.user?.rol ||
              ""
          )
            .trim()
            .toLowerCase()
        : "";

    return root;
  }

  async function runInitHooks(
    type,
    payload = {}
  ) {
    const list =
      registry?.hooks?.[type];

    if (
      !Array.isArray(list) ||
      !list.length
    ) {
      return payload;
    }

    let current = payload;

    for (const hook of list) {
      if (
        typeof hook !==
        "function"
      ) {
        continue;
      }

      try {
        const next =
          await hook(current);

        if (
          next &&
          typeof next ===
            "object"
        ) {
          current = next;
        }
      } catch (error) {
        safeWarn(
          "Hook error:",
          type,
          error
        );
      }
    }

    return current;
  }

  /* =========================================================
     UTILS
  ========================================================= */

  const utils = {
    qs(selector, scope = document) {
      if (!isBrowser()) {
        return null;
      }

      return (
        scope?.querySelector?.(
          selector
        ) || null
      );
    },

    qsa(selector, scope = document) {
      if (!isBrowser()) {
        return [];
      }

      return Array.from(
        scope?.querySelectorAll?.(
          selector
        ) || []
      );
    },

    on(
      target,
      ev,
      fn,
      opts = false
    ) {
      if (
        !target ||
        !ev ||
        !fn
      ) {
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

    off(
      target,
      ev,
      fn,
      opts = false
    ) {
      target?.removeEventListener?.(
        ev,
        fn,
        opts
      );
    },

    sleep(ms = 0) {
      return new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            ms
          )
      );
    },

    log: safeLog,
    warn: safeWarn,
    error: safeError,

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
    const root =
      ensureState();

    const next =
      setStateBase({
        state: root,
        events,
        patch:
          patch &&
          typeof patch ===
            "object"
            ? patch
            : {},
      });

    syncDerivedAuthState();

    return next;
  }

  function getState() {
    syncDerivedAuthState();

    return getStateBase(
      ensureState()
    );
  }

  /* =========================================================
     UI API
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
     SESSION API
  ========================================================= */

  function setRoute(
    route = "/"
  ) {
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
    /* FIX CRÍTICO:
       siempre pasar state */
    return setPublicPathBase({
      state,
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

  function setTheme(
    theme
  ) {
    return setThemeBase({
      dom,
      storage,
      events,
      setState,
      theme,
    });
  }

  function setLang(
    lang
  ) {
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
      typeof fn !==
        "function" ||
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

      events.emit(
        "app:core:init:start",
        {
          state:
            cloneState(state),
        }
      );

      await runInitHooks(
        "beforeInit",
        {
          state,
          dom,
          config,
          events,
          utils,
        }
      );

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
        dom,
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

      await runInitHooks(
        "afterInit",
        {
          state,
          dom,
          config,
          events,
          utils,
        }
      );

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

      events.emit(
        "app:core:init:error",
        {
          error:
            cloneError(error),
        }
      );

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
     PUBLIC API
  ========================================================= */

  const api = Object.freeze({
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
  });

  return api;
})();

export default AppCore;
