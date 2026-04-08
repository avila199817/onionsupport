/* =========================================================
   Onion SPA - Reactive Store (FULL PRO SAAS PANEL)
   Archivo: src/store/store.js

   Responsabilidades:
   - estado global reactivo
   - subscripciones globales y por clave
   - acciones centralizadas
   - sync fino con AppCore
   - selectores seguros
   - actualización inmutable por slices
   - helpers de colecciones
   - prevención de notificaciones inútiles
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

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isFunction(value) {
    return typeof value === "function";
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

  function deepClone(value) {
    try {
      if (typeof structuredClone === "function") {
        return structuredClone(value);
      }
    } catch {
      /* no-op */
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }

  function deepEqual(a, b) {
    if (a === b) return true;

    if (typeof a !== typeof b) return false;

    if (a === null || b === null) return a === b;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;

      for (let i = 0; i < a.length; i += 1) {
        if (!deepEqual(a[i], b[i])) return false;
      }

      return true;
    }

    if (isObject(a) && isObject(b)) {
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);

      if (aKeys.length !== bKeys.length) return false;

      for (const key of aKeys) {
        if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
        if (!deepEqual(a[key], b[key])) return false;
      }

      return true;
    }

    return false;
  }

  function getByPath(obj, path) {
    if (!path) return obj;

    return String(path)
      .split(".")
      .filter(Boolean)
      .reduce((acc, key) => {
        if (acc == null) return undefined;
        return acc[key];
      }, obj);
  }

  function setByPath(obj, path, value) {
    const keys = String(path).split(".").filter(Boolean);
    const lastKey = keys.pop();

    if (!lastKey) return obj;

    let current = obj;

    for (const key of keys) {
      if (!isObject(current[key]) && !Array.isArray(current[key])) {
        current[key] = {};
      }
      current = current[key];
    }

    current[lastKey] = value;
    return obj;
  }

  function deleteByPath(obj, path) {
    const keys = String(path).split(".").filter(Boolean);
    const lastKey = keys.pop();

    if (!lastKey) return obj;

    let current = obj;

    for (const key of keys) {
      if (!isObject(current[key])) {
        return obj;
      }
      current = current[key];
    }

    if (isObject(current) || Array.isArray(current)) {
      delete current[lastKey];
    }

    return obj;
  }

  function mergeDeep(target, source) {
    if (Array.isArray(source)) {
      return [...source];
    }

    if (!isObject(source)) {
      return source;
    }

    const output = isObject(target) ? { ...target } : {};

    Object.keys(source).forEach((key) => {
      const sourceValue = source[key];
      const targetValue = output[key];

      if (Array.isArray(sourceValue)) {
        output[key] = [...sourceValue];
        return;
      }

      if (isObject(sourceValue)) {
        output[key] = mergeDeep(targetValue, sourceValue);
        return;
      }

      output[key] = sourceValue;
    });

    return output;
  }

  function collectChangedPaths(input, prefix = "") {
    if (!isObject(input) && !Array.isArray(input)) {
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

  function normalizeCollection(items, fallback = []) {
    return Array.isArray(items) ? [...items] : fallback;
  }

  function touchMeta() {
    state.meta.updatedAt = Date.now();
  }

  function buildInitialState() {
    return {
      app: {
        ready: false,
        booted: false,
        route: AppCore.state.route || "/",
        publicPath: AppCore.state.publicPath || "/",
        loading: Boolean(AppCore.state.loading),
        initialized: Boolean(AppCore.state.initialized),
        booting: Boolean(AppCore.state.booting),
        lastError: AppCore.state.lastError || null,
      },

      session: {
        authenticated: Boolean(AppCore.state.authenticated),
        token: AppCore.state.token || null,
        user: AppCore.state.user ? deepClone(AppCore.state.user) : null,
        role: AppCore.state.role || null,
      },

      ui: {
        theme: AppCore.state.theme || AppCore.config.defaultTheme || "dark",
        lang: AppCore.state.lang || AppCore.config.defaultLang || "es",
        sidebarOpen: AppCore.state.sidebarOpen ?? true,
        pageTitle: safeTitle(),
        topbarTitle: safeTopbarTitle(),
      },

      entities: {
        incidencias: [],
        facturas: [],
        usuarios: [],
        clientes: [],
        dashboard: null,
        recientes: [],
      },

      flags: {
        hydrating: false,
        fetchingDashboard: false,
        fetchingIncidencias: false,
        fetchingFacturas: false,
        fetchingUsuarios: false,
        fetchingClientes: false,
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
  const state = buildInitialState();

  /* =========================================================
     LISTENERS
  ========================================================= */
  const listeners = new Set();
  const keyListeners = new Map();
  const coreUnsubscribers = [];
  const selectorListeners = new Set();

  /* =========================================================
     SNAPSHOTS / LECTURA
  ========================================================= */
  function shallowCloneRoot() {
    return {
      ...state,
      app: { ...state.app },
      session: {
        ...state.session,
        user: state.session.user ? deepClone(state.session.user) : null,
      },
      ui: { ...state.ui },
      entities: {
        incidencias: normalizeCollection(state.entities.incidencias),
        facturas: normalizeCollection(state.entities.facturas),
        usuarios: normalizeCollection(state.entities.usuarios),
        clientes: normalizeCollection(state.entities.clientes),
        recientes: normalizeCollection(state.entities.recientes),
        dashboard: state.entities.dashboard
          ? deepClone(state.entities.dashboard)
          : null,
      },
      flags: { ...state.flags },
      meta: { ...state.meta },
    };
  }

  function snapshot() {
    return deepClone(state);
  }

  function get(path = null, fallback = undefined) {
    if (!path) return shallowCloneRoot();

    const value = getByPath(state, path);
    return value === undefined ? fallback : value;
  }

  function select(selector, fallback = undefined) {
    if (!isFunction(selector)) {
      throw new Error("select(selector) requiere una función");
    }

    try {
      const result = selector(shallowCloneRoot());
      return result === undefined ? fallback : result;
    } catch (error) {
      AppCore.utils.error("Store select error", error);
      return fallback;
    }
  }

  /* =========================================================
     NOTIFY
  ========================================================= */
  function buildPayload(changedPaths = [], previousState = null) {
    return {
      state: snapshot(),
      previousState,
      changedPaths: Array.from(new Set(changedPaths)).filter(Boolean),
      timestamp: Date.now(),
    };
  }

  function notifySelectorListeners(payload) {
    selectorListeners.forEach((entry) => {
      try {
        const nextValue = entry.selector(shallowCloneRoot());

        if (deepEqual(nextValue, entry.lastValue)) {
          return;
        }

        const previousValue = deepClone(entry.lastValue);
        entry.lastValue = deepClone(nextValue);

        entry.listener({
          ...payload,
          value: nextValue,
          previousValue,
        });
      } catch (error) {
        AppCore.utils.error("Store selector listener error", error);
      }
    });
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
      Array.from(keyListeners.entries()).forEach(([watchedPath, bucket]) => {
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

    notifySelectorListeners(payload);
  }

  /* =========================================================
     ESCRITURA
  ========================================================= */
  function set(path, value) {
    if (!path) {
      throw new Error("Store.set(path, value) requiere path");
    }

    const currentValue = get(path);

    if (deepEqual(currentValue, value)) {
      return currentValue;
    }

    const previousState = snapshot();
    setByPath(state, path, deepClone(value));
    touchMeta();

    notify(buildPayload([path], previousState));
    return get(path);
  }

  function patch(partialState = {}) {
    if (!isObject(partialState)) {
      throw new Error("Store.patch(partialState) requiere un objeto");
    }

    const previousState = snapshot();
    const nextState = mergeDeep(state, partialState);

    if (deepEqual(state, nextState)) {
      return shallowCloneRoot();
    }

    Object.keys(nextState).forEach((key) => {
      state[key] = nextState[key];
    });

    touchMeta();

    const changedPaths = collectChangedPaths(partialState);
    notify(buildPayload(changedPaths, previousState));

    return shallowCloneRoot();
  }

  function update(path, updater) {
    if (!path || !isFunction(updater)) {
      throw new Error("update(path, updater) requiere path y función");
    }

    const currentValue = get(path);
    const nextValue = updater(deepClone(currentValue));

    return set(path, nextValue);
  }

  function remove(path) {
    if (!path) {
      throw new Error("Store.remove(path) requiere path");
    }

    const currentValue = get(path);

    if (currentValue === undefined) {
      return undefined;
    }

    const previousState = snapshot();
    deleteByPath(state, path);
    touchMeta();

    notify(buildPayload([path], previousState));
    return true;
  }

  function reset() {
    const previousState = snapshot();
    const next = buildInitialState();

    Object.keys(state).forEach((key) => {
      delete state[key];
    });

    Object.keys(next).forEach((key) => {
      state[key] = next[key];
    });

    touchMeta();

    notify(
      buildPayload(
        ["app", "session", "ui", "entities", "flags", "meta"],
        previousState
      )
    );

    return shallowCloneRoot();
  }

  /* =========================================================
     SUBSCRIPCIONES
  ========================================================= */
  function subscribe(listener) {
    if (!isFunction(listener)) {
      throw new Error("subscribe(listener) requiere una función");
    }

    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }

  function subscribeKey(path, listener, options = {}) {
    if (!path || !isFunction(listener)) {
      throw new Error("subscribeKey(path, listener) requiere path y función");
    }

    if (!keyListeners.has(path)) {
      keyListeners.set(path, new Set());
    }

    keyListeners.get(path).add(listener);

    if (options.immediate === true) {
      try {
        listener({
          state: snapshot(),
          previousState: null,
          changedPaths: [path],
          timestamp: Date.now(),
          value: get(path),
          path,
        });
      } catch (error) {
        AppCore.utils.error(`Store key listener immediate error (${path})`, error);
      }
    }

    return () => {
      const bucket = keyListeners.get(path);
      if (!bucket) return;

      bucket.delete(listener);

      if (bucket.size === 0) {
        keyListeners.delete(path);
      }
    };
  }

  function subscribeSelector(selector, listener, options = {}) {
    if (!isFunction(selector) || !isFunction(listener)) {
      throw new Error(
        "subscribeSelector(selector, listener) requiere dos funciones"
      );
    }

    const entry = {
      selector,
      listener,
      lastValue: deepClone(selector(shallowCloneRoot())),
    };

    selectorListeners.add(entry);

    if (options.immediate === true) {
      try {
        listener({
          state: snapshot(),
          previousState: null,
          changedPaths: [],
          timestamp: Date.now(),
          value: deepClone(entry.lastValue),
          previousValue: undefined,
        });
      } catch (error) {
        AppCore.utils.error("Store selector immediate error", error);
      }
    }

    return () => {
      selectorListeners.delete(entry);
    };
  }

  /* =========================================================
     COLECCIONES
  ========================================================= */
  function ensureCollectionKey(key) {
    if (!(key in state.entities)) {
      throw new Error(`Colección no registrada en store.entities: ${key}`);
    }
  }

  function normalizeMatcher(matcher) {
    if (isFunction(matcher)) return matcher;
    return (item) => item?.id === matcher;
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

    setInitialized(value = true) {
      set("app.initialized", Boolean(value));
    },

    setBooting(value = false) {
      set("app.booting", Boolean(value));
    },

    setRoute(route = "/") {
      set("app.route", route || "/");
    },

    setPublicPath(publicPath = "/") {
      set("app.publicPath", publicPath || "/");
    },

    setLoading(value) {
      set("app.loading", Boolean(value));
    },

    setError(error = null) {
      set("app.lastError", error || null);
    },

    clearError() {
      set("app.lastError", null);
    },

    setSession({ authenticated, token, user, role } = {}) {
      patch({
        session: {
          authenticated: Boolean(authenticated),
          token: token ?? null,
          user: user ? deepClone(user) : null,
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

    setAuthenticated(value = false) {
      set("session.authenticated", Boolean(value));
    },

    setToken(token = null) {
      set("session.token", token ?? null);
    },

    setUser(user = null) {
      patch({
        session: {
          user: user ? deepClone(user) : null,
          role: user?.role ?? state.session.role ?? null,
        },
      });
    },

    setRole(role = null) {
      set("session.role", role ?? null);
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
          pageTitle: title || AppCore.config.appName,
          topbarTitle: title || AppCore.config.appName,
        },
      });
    },

    setTopbarTitle(title = AppCore.config.appName) {
      set("ui.topbarTitle", title || AppCore.config.appName);
    },

    setFlag(flag, value) {
      if (!flag) {
        throw new Error("actions.setFlag(flag, value) requiere flag");
      }

      set(`flags.${flag}`, Boolean(value));
    },

    setCollection(key, items = []) {
      ensureCollectionKey(key);
      set(`entities.${key}`, normalizeCollection(items));
    },

    appendToCollection(key, item) {
      ensureCollectionKey(key);

      update(`entities.${key}`, (list = []) => {
        const next = Array.isArray(list) ? [...list] : [];
        next.push(item);
        return next;
      });
    },

    prependToCollection(key, item) {
      ensureCollectionKey(key);

      update(`entities.${key}`, (list = []) => {
        const next = Array.isArray(list) ? [...list] : [];
        next.unshift(item);
        return next;
      });
    },

    replaceCollectionItem(key, matcher, nextItem) {
      ensureCollectionKey(key);
      const match = normalizeMatcher(matcher);

      update(`entities.${key}`, (list = []) => {
        if (!Array.isArray(list)) return [];

        return list.map((item) => (match(item) ? nextItem : item));
      });
    },

    updateCollectionItem(key, matcher, updater) {
      ensureCollectionKey(key);

      if (!isFunction(updater)) {
        throw new Error("updateCollectionItem requiere updater function");
      }

      const match = normalizeMatcher(matcher);

      update(`entities.${key}`, (list = []) => {
        if (!Array.isArray(list)) return [];

        return list.map((item) => {
          if (!match(item)) return item;
          return updater(deepClone(item));
        });
      });
    },

    upsertCollectionItem(key, item, matcher = null) {
      ensureCollectionKey(key);

      update(`entities.${key}`, (list = []) => {
        const next = Array.isArray(list) ? [...list] : [];
        const match = matcher
          ? normalizeMatcher(matcher)
          : (current) => current?.id === item?.id;

        const index = next.findIndex((current) => match(current));

        if (index >= 0) {
          next[index] = item;
        } else {
          next.push(item);
        }

        return next;
      });
    },

    removeCollectionItem(key, matcher) {
      ensureCollectionKey(key);
      const match = normalizeMatcher(matcher);

      update(`entities.${key}`, (list = []) => {
        if (!Array.isArray(list)) return [];
        return list.filter((item) => !match(item));
      });
    },

    clearCollection(key) {
      ensureCollectionKey(key);
      set(`entities.${key}`, []);
    },

    hydrateFromCore() {
      patch({
        app: {
          ready: state.app.ready,
          booted: state.app.booted,
          route: AppCore.state.route,
          publicPath: AppCore.state.publicPath,
          loading: AppCore.state.loading,
          initialized: AppCore.state.initialized,
          booting: AppCore.state.booting,
          lastError: AppCore.state.lastError,
        },
        session: {
          authenticated: AppCore.state.authenticated,
          token: AppCore.state.token,
          user: AppCore.state.user ? deepClone(AppCore.state.user) : null,
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
     SELECTORES
  ========================================================= */
  const selectors = {
    isReady() {
      return Boolean(state.app.ready && state.app.booted);
    },

    isAuthenticated() {
      return Boolean(state.session.authenticated);
    },

    currentUser() {
      return state.session.user ? deepClone(state.session.user) : null;
    },

    currentRole() {
      return state.session.role || null;
    },

    currentRoute() {
      return state.app.route || "/";
    },

    currentPublicPath() {
      return state.app.publicPath || "/";
    },

    currentTheme() {
      return state.ui.theme || AppCore.config.defaultTheme || "dark";
    },

    currentLang() {
      return state.ui.lang || AppCore.config.defaultLang || "es";
    },

    collection(key) {
      ensureCollectionKey(key);
      const value = state.entities[key];
      return Array.isArray(value) ? [...value] : deepClone(value);
    },

    count(key) {
      ensureCollectionKey(key);
      const value = state.entities[key];
      return Array.isArray(value) ? value.length : value ? 1 : 0;
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

  function unbindCoreEvents() {
    while (coreUnsubscribers.length) {
      const off = coreUnsubscribers.pop();

      try {
        off?.();
      } catch (error) {
        AppCore.utils.warn("No se pudo limpiar listener del Store", error);
      }
    }
  }

  function bindCoreEvents() {
    if (coreUnsubscribers.length) return;

    addCoreEvent("app:state:change", ({ detail }) => {
      patch({
        app: {
          route: detail?.state?.route ?? state.app.route,
          publicPath: detail?.state?.publicPath ?? state.app.publicPath,
          loading: detail?.state?.loading ?? state.app.loading,
          initialized: detail?.state?.initialized ?? state.app.initialized,
          booting: detail?.state?.booting ?? state.app.booting,
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
      actions.setInitialized(true);
      actions.markReady(true);
    });

    addCoreEvent("app:theme:change", ({ detail }) => {
      actions.setTheme(detail?.theme || AppCore.state.theme || "dark");
    });

    addCoreEvent("app:lang:change", ({ detail }) => {
      actions.setLang(detail?.lang || AppCore.state.lang || "es");
    });

    addCoreEvent("app:sidebar:change", ({ detail }) => {
      actions.setSidebarOpen(Boolean(detail?.open));
    });

    addCoreEvent("app:error", ({ detail }) => {
      actions.setError(detail?.error || null);
    });

    addCoreEvent("app:title:change", ({ detail }) => {
      actions.setPageTitle(detail?.title || safeTitle());
    });

    addCoreEvent("app:loading:change", ({ detail }) => {
      actions.setLoading(Boolean(detail?.loading));
    });

    addCoreEvent("app:session:cleared", () => {
      actions.clearSession();
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
          AppCore.state.route ||
          window.location.pathname ||
          "/"
      );

      actions.setPublicPath(
        detail?.publicPath ||
          AppCore.state.publicPath ||
          (isBrowser()
            ? `${window.location.pathname || "/"}${window.location.search || ""}`
            : "/")
      );

      actions.setPageTitle(safeTitle());
    });
  }

  /* =========================================================
     INIT / DESTROY
  ========================================================= */
  function init() {
    if (initialized) {
      AppCore.utils.warn("Store ya estaba inicializado.");
      return api;
    }

    actions.hydrateFromCore();
    bindCoreEvents();

    initialized = true;

    AppCore.utils.log("Store inicializado correctamente.", {
      route: state.app.route,
      publicPath: state.app.publicPath,
      authenticated: state.session.authenticated,
      theme: state.ui.theme,
      lang: state.ui.lang,
    });

    return api;
  }

  function destroy() {
    unbindCoreEvents();
    listeners.clear();
    keyListeners.clear();
    selectorListeners.clear();
    initialized = false;
    return true;
  }

  /* =========================================================
     API PÚBLICA
  ========================================================= */
  const api = {
    state,

    init,
    destroy,

    get,
    set,
    patch,
    update,
    remove,
    reset,
    snapshot,
    select,

    subscribe,
    subscribeKey,
    subscribeSelector,

    selectors,
    actions,
  };

  return api;
})();
