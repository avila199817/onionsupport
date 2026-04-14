/* =========================================================
   Onion SPA - Core
   Archivo: src/core/index.js

   Qué centraliza:
   - composición del núcleo de aplicación
   - configuración global
   - estado global
   - helpers
   - cache de DOM
   - storage namespaced
   - event bus
   - cleanup scopes
   - registro de módulos
   - sesión base
   - preferencias base
   - request/api client robusto
   - helpers UI / lifecycle
   - init idempotente

   HARDENING:
   - sync derivada de sesión más robusta
   - guards de browser
   - init serializado
   - request/api expuesto también en api pública
   - helpers seguros y consistentes
   - estado ready/booting/initialized blindado
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

  /* =========================================================
     FLAGS
  ========================================================= */
  let initPromise = null;
  let initDone = false;

  /* =========================================================
     STATE
  ========================================================= */
  const state =
    createInitialState({
      config,
    });

  /* =========================================================
     DOM CACHE
  ========================================================= */
  const dom =
    createDomCache();

  /* =========================================================
     REGISTRY
  ========================================================= */
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

  /* =========================================================
     BUS / MODULES / HOOKS
  ========================================================= */
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
     INTERNAL HELPERS
  ========================================================= */
  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) {
      return fallback;
    }

    const text = String(value).trim();
    return text || fallback;
  }

  function safeBoolean(value) {
    return value === true;
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
    const hasTokenNow = Boolean(
      state.token &&
      String(state.token).trim()
    );

    state.authenticated = hasTokenNow;
    state.role =
      state.user?.role ||
      state.user?.rol ||
      state.role ||
      "";

    return state;
  }

  /* =========================================================
     UTILS
  ========================================================= */
  const utils = {
    qs(
      selector,
      scope = document
    ) {
      if (!isBrowser()) return null;
      if (!selector || !scope?.querySelector) return null;

      return scope.querySelector(selector);
    },

    qsa(
      selector,
      scope = document
    ) {
      if (!isBrowser()) return [];
      if (!selector || !scope?.querySelectorAll) return [];

      return Array.from(
        scope.querySelectorAll(selector)
      );
    },

    create(
      tag,
      options = {}
    ) {
      if (!isBrowser()) return null;

      const el =
        document.createElement(tag);

      if (options.className) {
        el.className = options.className;
      }

      if (options.id) {
        el.id = options.id;
      }

      if (options.text !== undefined) {
        el.textContent = options.text;
      }

      if (options.html !== undefined) {
        el.innerHTML = options.html;
      }

      if (
        options.attrs &&
        typeof options.attrs === "object" &&
        !Array.isArray(options.attrs)
      ) {
        Object.entries(options.attrs).forEach(
          ([key, value]) => {
            if (value !== undefined && value !== null) {
              el.setAttribute(
                key,
                String(value)
              );
            }
          }
        );
      }

      return el;
    },

    on(
      target,
      event,
      handler,
      options = false
    ) {
      if (
        !target ||
        !event ||
        typeof handler !== "function"
      ) {
        return () => {};
      }

      target.addEventListener(
        event,
        handler,
        options
      );

      return () => {
        target.removeEventListener(
          event,
          handler,
          options
        );
      };
    },

    off(
      target,
      event,
      handler,
      options = false
    ) {
      if (
        !target ||
        !event ||
        typeof handler !== "function"
      ) {
        return;
      }

      target.removeEventListener(
        event,
        handler,
        options
      );
    },

    once(
      target,
      event,
      handler,
      options = false
    ) {
      if (
        !target ||
        !event ||
        typeof handler !== "function"
      ) {
        return () => {};
      }

      const finalOptions =
        typeof options === "boolean"
          ? {
              capture: options,
              once: true,
            }
          : {
              ...(options || {}),
              once: true,
            };

      target.addEventListener(
        event,
        handler,
        finalOptions
      );

      return () => {
        target.removeEventListener(
          event,
          handler,
          finalOptions
        );
      };
    },

    log: safeLog,
    warn: safeWarn,
    error: safeError,

    sleep(ms = 0) {
      return new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            ms
          )
      );
    },

    clamp(
      value,
      min,
      max
    ) {
      return Math.min(
        Math.max(value, min),
        max
      );
    },

    capitalize(value = "") {
      if (!value) return "";

      return (
        value.charAt(0).toUpperCase() +
        value.slice(1)
      );
    },

    debounce(
      fn,
      delay = 250
    ) {
      let timeoutId = null;

      return (...args) => {
        clearTimeout(timeoutId);

        timeoutId = setTimeout(
          () => fn(...args),
          delay
        );
      };
    },

    throttle(
      fn,
      limit = 250
    ) {
      let inThrottle = false;
      let lastArgs = null;

      return (...args) => {
        if (inThrottle) {
          lastArgs = args;
          return;
        }

        inThrottle = true;
        fn(...args);

        setTimeout(() => {
          inThrottle = false;

          if (lastArgs) {
            const queued = lastArgs;
            lastArgs = null;

            fn(...queued);
            inThrottle = true;

            setTimeout(() => {
              inThrottle = false;
            }, limit);
          }
        }, limit);
      };
    },

    escapeHtml(value = "") {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
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

  /* =========================================================
     STORAGE
  ========================================================= */
  const storage =
    createStorage(utils);

  /* =========================================================
     STATE API
  ========================================================= */
  function setState(patch = {}) {
    const nextState = setStateBase({
      state,
      events,
      patch,
    });

    syncDerivedAuthState();

    return nextState;
  }

  function getState() {
    syncDerivedAuthState();
    return getStateBase(state);
  }

  /* =========================================================
     UI HELPERS
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
     SESSION / PREFS
  ========================================================= */
  function setRoute(route = "/") {
    return setRouteBase({
      state,
      setState,
      events,
      route,
    });
  }

  function setPublicPath(path = "/") {
    return setPublicPathBase({
      storage,
      setState,
      events,
      path,
    });
  }

  function setUser(user = null) {
    const result = setUserBase({
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

  function setToken(token = null) {
    const result = setTokenBase({
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
    const result = applySessionBase({
      state,
      events,
      setUser: ({ user: nextUser }) =>
        setUser(nextUser),

      setToken: ({ token: nextToken }) =>
        setToken(nextToken),

      token,
      user,
    });

    syncDerivedAuthState();

    return result;
  }

  function clearSession() {
    const result = clearSessionBase({
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
    theme = config.defaultTheme
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
    lang = config.defaultLang
  ) {
    return setLangBase({
      dom,
      storage,
      events,
      setState,
      lang,
    });
  }

  function setSidebarOpen(value) {
    return setSidebarOpenBase({
      dom,
      storage,
      events,
      setState,
      value,
    });
  }

  function setLoading(value) {
    return setLoadingBase({
      dom,
      events,
      setState,
      value,
    });
  }

  function setError(error = null) {
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
    createApiClient(request);

  /* =========================================================
     READY
  ========================================================= */
  function ready(callback) {
    if (typeof callback !== "function") {
      return;
    }

    if (!isBrowser()) {
      return;
    }

    if (!isDocumentReady()) {
      document.addEventListener(
        "DOMContentLoaded",
        callback,
        { once: true }
      );

      return;
    }

    callback();
  }

  /* =========================================================
     INIT
  ========================================================= */
  async function doInit() {
    state.booting = true;
    state.ready = false;

    try {
      for (const hook of registry.hooks.beforeInit) {
        try {
          await hook(api);
        } catch (error) {
          utils.error(
            "Error hook beforeInit",
            error
          );
        }
      }

      config.apiBase = safeText(
        config.apiBase,
        ""
      ).replace(/\/+$/, "");

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

      initDone = true;

      utils.log(
        "Core inicializado correctamente.",
        {
          version: config.version,
          apiBase: config.apiBase,
          route: state.route,
          publicPath: state.publicPath,
          lang: state.lang,
          theme: state.theme,
          authenticated: state.authenticated,
          username:
            getUserUsername(state.user) || null,
          online: state.online,
        }
      );

      events.emit("app:core:ready", {
        state: cloneState(state),
        config: {
          ...config,
        },
      });

      for (const hook of registry.hooks.afterInit) {
        try {
          await hook(api);
        } catch (error) {
          utils.error(
            "Error hook afterInit",
            error
          );
        }
      }

      return api;
    } catch (error) {
      state.booting = false;
      state.ready = false;
      state.initialized = false;

      setError(error);

      throw error;
    } finally {
      initPromise = null;
    }
  }

  async function init() {
    if (initDone || safeBoolean(state.initialized)) {
      utils.warn(
        "AppCore ya fue inicializado."
      );

      return api;
    }

    if (initPromise) {
      utils.warn(
        "AppCore ya está arrancando."
      );

      return initPromise;
    }

    initPromise = doInit();

    return initPromise;
  }

  /* =========================================================
     PUBLIC API
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
