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

  let initialized = false;

  /* =========================================================
     HELPERS BASE
  ========================================================= */
  function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  function safeTitle() {
    if (!isBrowser()) return AppCore.config.appName;
    return document.title || AppCore.config.appName;
  }

  function safeTopbarTitle() {
    return (
      AppCore.dom.topbarTitle?.textContent ||
      safeTitle() ||
      AppCore.config.appName
    );
  }

  function initialState() {
    return {
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
        pageTitle: safeTitle(),
        topbarTitle: safeTopbarTitle(),
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
  }

  /* =========================================================
     ESTADO INTERNO
  ========================================================= */
  const state = initialState();

  /* =========================================================
     LISTENERS
  ========================================================= */
  const listeners = new Set();
  const keyListeners = new Map();
  const coreUnsubscribers = [];

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
        /* no-op */
      }
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }

  function shallowCloneRoot() {
    return {
      ...state,
      app: { ...state.app },
      session: {
        ...state.session,
        user: state.session.user ? { ...state.session.user } : null,
      },
      ui: { ...state.ui },
      entities: {
        incidencias: Array.isArray(state.entities.incidencias)
          ? [...state.entities.incidencias]
          : [],
        facturas: Array.isArray(state.entities.facturas)
          ? [...state.entities.facturas]
          : [],
        usuarios: Array.isArray(state.entities.usuarios)
          ? [...state.entities.usuarios]
          : [],
        clientes: Array.isArray(state.entities.clientes)
          ? [...state.entities.clientes]
          : [],
      },
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

  function collectChangedPaths(input, prefix = "") {
    if (!isObject(input)) {
      return prefix ? [prefix] : [];
    }

    const paths = [];

    Object.entries(input).forEach(([key, value]) => {
      const nextPath = prefix ? `${prefix}.${key}` : key;

      paths.push(nextPath);

      if (isObject(value) && !Array.isArray(value)) {
        paths.push(...collectChangedPaths(value, nextPath));
      }
    });

    return Array.from(new Set(paths));
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

    if (!payload?.changedPaths?.length) return;

    const allEntries = Array.from(keyListeners.entries());

    allEntries.forEach(([watchedPath, bucket]) => {
      const matched = payload.changedPaths.some((changedPath) => {
        return (
          changedPath === watchedPath ||
          changedPath.startsWith(`${watchedPath}.`) ||
          watchedPath.startsWith(`${changedPath}.`)
        );
      });

      if (!matched) return;

      bucket.forEach((listener) => {
        try {
          listener({
            ...payload,
            value: get(watchedPath),
            path: watchedPath,
          });
        } catch (error) {
          AppCore.utils.error(
            `Store key listener error (${watchedPath})`,
            error
          );
        }
      });
    });
  }

  function buildPayload(changedPaths = [], previousState = null) {
    return {
      state: snapshot(),
      previousState,
      changedPaths: Array.from(new Set(changedPaths)),
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

    const changedPaths = collectChangedPaths(partialState);
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
    const next = initialState();

    Object.keys(next).forEach((key) => {
      state[key] = next[key];
    });

    touchMeta();

    notify(
      buildPayload(
        ["app", "session", "ui", "entities", "meta"],
        previousState
      )
    );

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
            typeof matcher === "function" ? matcher(item) : item?.id === matcher;

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
          pageTitle: safeTitle(),
          topbarTitle: safeTopbarTitle(),
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
  function addCoreEvent(eventName, handler) {
    const off = AppCore.events.on(eventName, handler);
    coreUnsubscribers.push(off);
    return off;
  }

  function bindCoreEvents() {
    if (coreUnsubscribers.length) return;

    addCoreEvent("app:state:change", ({ detail }) => {
      patch({
        app: {
          route: detail?.state?.route ?? state.app.route,
          loading: detail?.state?.loading ?? state.app.loading,
          initialized: detail?.state?.initialized ?? state.app.initialized,
          lastError: detail?.state?.lastError ?? state.app.lastError,
        },
        session: {
          authenticated:
            detail?.state?.authenticated ?? state.session.authenticated,
          token: detail?.state?.token ?? state.session.token,
          user: detail?.state?.user ?? state.session.user,
          role: detail?.state?.role ?? state.session.role,
        },
        ui: {
          theme: detail?.state?.theme ?? state.ui.theme,
          lang: detail?.state?.lang ?? state.ui.lang,
          sidebarOpen: detail?.state?.sidebarOpen ?? state.ui.sidebarOpen,
          pageTitle: safeTitle(),
          topbarTitle: safeTopbarTitle(),
        },
      });
    });

    addCoreEvent("app:core:ready", () => {
      actions.hydrateFromCore();
      actions.markReady(true);
    });

    addCoreEvent("app:theme:change", ({ detail }) => {
      actions.setTheme(detail?.theme || "dark");
    });

    addCoreEvent("app:lang:change", ({ detail }) => {
      actions.setLang(detail?.lang || "es");
    });

    addCoreEvent("app:sidebar:change", ({ detail }) => {
      actions.setSidebarOpen(Boolean(detail?.open));
    });

    addCoreEvent("app:error", ({ detail }) => {
      actions.setError(detail?.error || null);
    });

    addCoreEvent("auth:session:cleared", () => {
      actions.clearSession();
    });

    addCoreEvent("auth:session:applied", () => {
      actions.setSession({
        authenticated: AppCore.state.authenticated,
        token: AppCore.state.token,
        user: AppCore.state.user,
        role: AppCore.state.role,
      });
    });

    addCoreEvent("router:rendered", ({ detail }) => {
      actions.setRoute(
        detail?.canonicalPath ||
          detail?.path ||
          window.location.pathname ||
          "/"
      );
      actions.setPageTitle(safeTitle());
    });
  }

  /* =========================================================
     INIT
  ========================================================= */
  function init() {
    if (initialized) {
      AppCore.utils.warn("Store ya estaba inicializado.");
      return api;
    }

    actions.hydrateFromCore();
    bindCoreEvents();

    initialized = true;

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
