/* =========================================================
   Onion SPA - Reactive Store
   Archivo: src/store/store.js

   Responsabilidades:
   - estado global reactivo
   - subscripciones por clave o globales
   - acciones centralizadas
   - sync con AppCore
   - utilidades para actualizar slices sin spaghetti
========================================================= */

import { AppCore } from "../core/core.js";

export const Store = (() => {
  "use strict";

  /* =========================================================
     ESTADO INTERNO
  ========================================================= */
  const state = {
    app: {
      ready: false,
      booted: false,
      route: AppCore.state.route || "/",
      loading: AppCore.state.loading || false,
      initialized: AppCore.state.initialized || false,
      lastError: AppCore.state.lastError || null,
    },

    session: {
      authenticated: AppCore.state.authenticated || false,
      token: AppCore.state.token || null,
      user: AppCore.state.user || null,
      role: AppCore.state.role || null,
    },

    ui: {
      theme: AppCore.state.theme || "dark",
      lang: AppCore.state.lang || "es",
      sidebarOpen: AppCore.state.sidebarOpen ?? true,
      pageTitle: document.title || AppCore.config.appName,
      topbarTitle:
        AppCore.dom.topbarTitle?.textContent ||
        AppCore.config.appName,
    },

    entities: {
      incidencias: [],
      facturas: [],
      usuarios: [],
      clientes: [],
    },

    meta: {
      hydrated: false,
      updatedAt: Date.now(),
    },
  };

  /* =========================================================
     LISTENERS
  ========================================================= */
  const listeners = new Set();
  const keyListeners = new Map();

  /* =========================================================
     HELPERS
  ========================================================= */
  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function deepClone(value) {
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch {
        return JSON.parse(JSON.stringify(value));
      }
    }

    return JSON.parse(JSON.stringify(value));
  }

  function shallowCloneRoot() {
    return {
      ...state,
      app: { ...state.app },
      session: { ...state.session },
      ui: { ...state.ui },
      entities: { ...state.entities },
      meta: { ...state.meta },
    };
  }

  function getByPath(obj, path) {
    if (!path) return obj;
    return String(path)
      .split(".")
      .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
  }

  function setByPath(obj, path, value) {
    const keys = String(path).split(".");
    const lastKey = keys.pop();

    let current = obj;

    for (const key of keys) {
      if (!isObject(current[key])) {
        current[key] = {};
      }
      current = current[key];
    }

    current[lastKey] = value;
    return obj;
  }

  function mergeDeep(target, source) {
    const output = Array.isArray(target) ? [...target] : { ...target };

    if (!isObject(source)) {
      return source;
    }

    Object.keys(source).forEach((key) => {
      const targetValue = output[key];
      const sourceValue = source[key];

      if (Array.isArray(sourceValue)) {
        output[key] = [...sourceValue];
        return;
      }

      if (isObject(sourceValue) && isObject(targetValue)) {
        output[key] = mergeDeep(targetValue, sourceValue);
        return;
      }

      if (isObject(sourceValue)) {
        output[key] = mergeDeep({}, sourceValue);
        return;
      }

      output[key] = sourceValue;
    });

    return output;
  }

  function touchMeta() {
    state.meta.updatedAt = Date.now();
  }

  function notify(payload) {
    listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        AppCore.utils.error("Store listener error", error);
      }
    });

    if (payload?.changedPaths?.length) {
      payload.changedPaths.forEach((path) => {
        const bucket = keyListeners.get(path);
        if (!bucket) return;

        bucket.forEach((listener) => {
          try {
            listener({
              ...payload,
              value: get(path),
            });
          } catch (error) {
            AppCore.utils.error(`Store key listener error (${path})`, error);
          }
        });
      });
    }
  }

  function buildPayload(changedPaths = [], previousState = null) {
    return {
      state: snapshot(),
      previousState,
      changedPaths,
      timestamp: Date.now(),
    };
  }

  /* =========================================================
     LECTURA
  ========================================================= */
  function get(path = null) {
    if (!path) return shallowCloneRoot();
    return getByPath(state, path);
  }

  function snapshot() {
    return deepClone(state);
  }

  /* =========================================================
     ESCRITURA
  ========================================================= */
  function set(path, value) {
    const previousState = snapshot();
    setByPath(state, path, value);
    touchMeta();

    notify(buildPayload([path], previousState));
    return get(path);
  }

  function patch(partialState = {}) {
    const previousState = snapshot();
    const nextState = mergeDeep(state, partialState);

    Object.keys(nextState).forEach((key) => {
      state[key] = nextState[key];
    });

    touchMeta();

    const changedPaths = Object.keys(partialState);
    notify(buildPayload(changedPaths, previousState));

    return shallowCloneRoot();
  }

  function update(path, updater) {
    if (typeof updater !== "function") {
      throw new Error("update(path, updater) requiere una función updater");
    }

    const currentValue = get(path);
    const nextValue = updater(deepClone(currentValue));

    return set(path, nextValue);
  }

  function reset() {
    const previousState = snapshot();

    state.app = {
      ready: false,
      booted: false,
      route: "/",
      loading: false,
      initialized: false,
      lastError: null,
    };

    state.session = {
      authenticated: false,
      token: null,
      user: null,
      role: null,
    };

    state.ui = {
      theme: "dark",
      lang: "es",
      sidebarOpen: true,
      pageTitle: AppCore.config.appName,
      topbarTitle: AppCore.config.appName,
    };

    state.entities = {
      incidencias: [],
      facturas: [],
      usuarios: [],
      clientes: [],
    };

    state.meta = {
      hydrated: false,
      updatedAt: Date.now(),
    };

    notify(buildPayload(["app", "session", "ui", "entities", "meta"], previousState));
    return shallowCloneRoot();
  }

  /* =========================================================
     SUBSCRIPCIONES
  ========================================================= */
  function subscribe(listener) {
    if (typeof listener !== "function") {
      throw new Error("subscribe(listener) requiere una función");
    }

    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }

  function subscribeKey(path, listener) {
    if (!path || typeof listener !== "function") {
      throw new Error("subscribeKey(path, listener) requiere path y función");
    }

    if (!keyListeners.has(path)) {
      keyListeners.set(path, new Set());
    }

    keyListeners.get(path).add(listener);

    return () => {
      const bucket = keyListeners.get(path);
      if (!bucket) return;

      bucket.delete(listener);

      if (bucket.size === 0) {
        keyListeners.delete(path);
      }
    };
  }

  /* =========================================================
     ACCIONES
  ========================================================= */
  const actions = {
    markReady(value = true) {
      set("app.ready", Boolean(value));
    },

    markBooted(value = true) {
      set("app.booted", Boolean(value));
    },

    setRoute(route = "/") {
      set("app.route", route);
    },

    setLoading(value) {
      set("app.loading", Boolean(value));
    },

    setError(error = null) {
      set("app.lastError", error);
    },

    clearError() {
      set("app.lastError", null);
    },

    setSession({ authenticated, token, user, role } = {}) {
      patch({
        session: {
          authenticated: Boolean(authenticated),
          token: token ?? null,
          user: user ?? null,
          role: role ?? user?.role ?? null,
        },
      });
    },

    clearSession() {
      patch({
        session: {
          authenticated: false,
          token: null,
          user: null,
          role: null,
        },
      });
    },

    setTheme(theme = "dark") {
      set("ui.theme", theme);
    },

    setLang(lang = "es") {
      set("ui.lang", lang);
    },

    setSidebarOpen(value) {
      set("ui.sidebarOpen", Boolean(value));
    },

    setPageTitle(title = AppCore.config.appName) {
      patch({
        ui: {
          pageTitle: title,
          topbarTitle: title,
        },
      });
    },

    setCollection(key, items = []) {
      if (!(key in state.entities)) {
        throw new Error(`Colección no registrada en store.entities: ${key}`);
      }

      set(`entities.${key}`, Array.isArray(items) ? items : []);
    },

    appendToCollection(key, item) {
      if (!(key in state.entities)) {
        throw new Error(`Colección no registrada en store.entities: ${key}`);
      }

      update(`entities.${key}`, (list = []) => {
        const next = Array.isArray(list) ? [...list] : [];
        next.push(item);
        return next;
      });
    },

    updateCollectionItem(key, matcher, updater) {
      if (!(key in state.entities)) {
        throw new Error(`Colección no registrada en store.entities: ${key}`);
      }

      if (typeof updater !== "function") {
        throw new Error("updateCollectionItem requiere updater function");
      }

      update(`entities.${key}`, (list = []) => {
        if (!Array.isArray(list)) return [];

        return list.map((item) => {
          const matched =
            typeof matcher === "function"
              ? matcher(item)
              : item?.id === matcher;

          return matched ? updater({ ...item }) : item;
        });
      });
    },

    removeCollectionItem(key, matcher) {
      if (!(key in state.entities)) {
        throw new Error(`Colección no registrada en store.entities: ${key}`);
      }

      update(`entities.${key}`, (list = []) => {
        if (!Array.isArray(list)) return [];

        return list.filter((item) => {
          if (typeof matcher === "function") {
            return !matcher(item);
          }

          return item?.id !== matcher;
        });
      });
    },

    hydrateFromCore() {
      patch({
        app: {
          ready: state.app.ready,
          booted: state.app.booted,
          route: AppCore.state.route,
          loading: AppCore.state.loading,
          initialized: AppCore.state.initialized,
          lastError: AppCore.state.lastError,
        },
        session: {
          authenticated: AppCore.state.authenticated,
          token: AppCore.state.token,
          user: AppCore.state.user,
          role: AppCore.state.role,
        },
        ui: {
          theme: AppCore.state.theme,
          lang: AppCore.state.lang,
          sidebarOpen: AppCore.state.sidebarOpen,
          pageTitle: document.title || AppCore.config.appName,
          topbarTitle:
            AppCore.dom.topbarTitle?.textContent ||
            document.title ||
            AppCore.config.appName,
        },
        meta: {
          hydrated: true,
          updatedAt: Date.now(),
        },
      });
    },
  };

  /* =========================================================
     SYNC CON AppCore
  ========================================================= */
  function bindCoreEvents() {
    AppCore.events.on("app:state:change", ({ detail }) => {
      patch({
        app: {
          route: detail?.state?.route ?? state.app.route,
          loading: detail?.state?.loading ?? state.app.loading,
          initialized: detail?.state?.initialized ?? state.app.initialized,
          lastError: detail?.state?.lastError ?? state.app.lastError,
        },
        session: {
          authenticated: detail?.state?.authenticated ?? state.session.authenticated,
          token: detail?.state?.token ?? state.session.token,
          user: detail?.state?.user ?? state.session.user,
          role: detail?.state?.role ?? state.session.role,
        },
        ui: {
          theme: detail?.state?.theme ?? state.ui.theme,
          lang: detail?.state?.lang ?? state.ui.lang,
          sidebarOpen: detail?.state?.sidebarOpen ?? state.ui.sidebarOpen,
          pageTitle: document.title || state.ui.pageTitle,
          topbarTitle:
            AppCore.dom.topbarTitle?.textContent || state.ui.topbarTitle,
        },
      });
    });

    AppCore.events.on("app:core:ready", () => {
      actions.hydrateFromCore();
      actions.markReady(true);
    });

    AppCore.events.on("app:theme:change", ({ detail }) => {
      actions.setTheme(detail?.theme || "dark");
    });

    AppCore.events.on("app:lang:change", ({ detail }) => {
      actions.setLang(detail?.lang || "es");
    });

    AppCore.events.on("app:sidebar:change", ({ detail }) => {
      actions.setSidebarOpen(Boolean(detail?.open));
    });

    AppCore.events.on("app:error", ({ detail }) => {
      actions.setError(detail?.error || null);
    });

    AppCore.events.on("auth:session:cleared", () => {
      actions.clearSession();
    });

    AppCore.events.on("auth:session:applied", () => {
      actions.setSession({
        authenticated: AppCore.state.authenticated,
        token: AppCore.state.token,
        user: AppCore.state.user,
        role: AppCore.state.role,
      });
    });

    AppCore.events.on("router:rendered", ({ detail }) => {
      actions.setRoute(detail?.path || window.location.pathname || "/");
      actions.setPageTitle(document.title || AppCore.config.appName);
    });
  }

  /* =========================================================
     INIT
  ========================================================= */
  function init() {
    actions.hydrateFromCore();
    bindCoreEvents();
    AppCore.utils.log("Store inicializado correctamente.");
    return api;
  }

  /* =========================================================
     API PÚBLICA
  ========================================================= */
  const api = {
    state,

    init,
    get,
    set,
    patch,
    update,
    reset,
    snapshot,

    subscribe,
    subscribeKey,

    actions,
  };

  return api;
})();