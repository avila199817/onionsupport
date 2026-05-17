/* =========================================================
   Onion Support - Store
   Archivo: /src/store/index.js

   Responsabilidad:
   - Store mínimo de compat.
   - Estado simple en memoria.
   - Suscripciones simples.
   - No duplica Auth.
   - No duplica Core.
   - No duplica Router.
   - No duplica HTTP.
   - Sin helpers externos.
   - Sin acciones complejas.
   - Sin core-sync paralelo.
========================================================= */

import { AppCore } from "../core/index.js";

export const STORE_VERSION = "simple";

const DEFAULT_STATE = {
  app: {
    route: "/",
    publicPath: "/",
    ready: false,
  },

  session: {
    authenticated: false,
    hasToken: false,
    user: null,
    role: null,
  },

  ui: {
    theme: "system",
    lang: "en",
    sidebarOpen: true,
  },

  entities: {},
  flags: {},

  meta: {
    version: STORE_VERSION,
    createdAt: "",
    updatedAt: "",
    changeCount: 0,
  },
};

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }
}

function pathParts(path = "") {
  if (Array.isArray(path)) return path.filter(Boolean);

  return String(path || "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
}

function getByPath(root, path, fallback = undefined) {
  const parts = pathParts(path);

  if (!parts.length) return root;

  let current = root;

  for (const part of parts) {
    if (current === null || current === undefined) return fallback;
    current = current[part];
  }

  return current === undefined ? fallback : current;
}

function setByPath(root, path, value) {
  const parts = pathParts(path);

  if (!parts.length) return false;

  let current = root;

  for (const part of parts.slice(0, -1)) {
    if (!isObject(current[part])) {
      current[part] = {};
    }

    current = current[part];
  }

  current[parts.at(-1)] = value;

  return true;
}

function deleteByPath(root, path) {
  const parts = pathParts(path);

  if (!parts.length) return false;

  let current = root;

  for (const part of parts.slice(0, -1)) {
    if (!isObject(current[part])) return false;
    current = current[part];
  }

  const key = parts.at(-1);

  if (!(key in current)) return false;

  delete current[key];

  return true;
}

function mergeDeep(target, source) {
  const output = clone(target) || {};

  for (const [key, value] of Object.entries(source || {})) {
    if (isObject(value) && isObject(output[key])) {
      output[key] = mergeDeep(output[key], value);
    } else {
      output[key] = clone(value);
    }
  }

  return output;
}

function equal(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return Object.is(a, b);
  }
}

function touch(state) {
  state.meta = isObject(state.meta) ? state.meta : {};
  state.meta.version = STORE_VERSION;
  state.meta.updatedAt = nowIso();
  state.meta.changeCount = Number(state.meta.changeCount || 0) + 1;
}

function createInitialState() {
  const state = clone(DEFAULT_STATE);

  const now = nowIso();

  state.meta.createdAt = now;
  state.meta.updatedAt = now;

  try {
    state.app.route = AppCore?.state?.route || "/";
    state.app.publicPath = AppCore?.state?.publicPath || state.app.route;
    state.app.ready = Boolean(AppCore?.state?.ready || AppCore?.state?.appReady);

    state.session.authenticated = Boolean(AppCore?.state?.authenticated);
    state.session.hasToken = Boolean(AppCore?.state?.hasToken);
    state.session.user = AppCore?.state?.user || null;
    state.session.role = AppCore?.state?.role || null;

    state.ui.theme = AppCore?.state?.theme || state.ui.theme;
    state.ui.lang = AppCore?.state?.lang || AppCore?.state?.language || state.ui.lang;
  } catch {
    // Core no disponible: estado base.
  }

  return state;
}

function normalizeChanged(paths = []) {
  return [...new Set(paths.filter(Boolean))];
}

function makePayload(store, changedPaths = [], previousState = null) {
  return {
    version: STORE_VERSION,
    changedPaths: normalizeChanged(changedPaths),
    state: store.get(),
    previousState: previousState ? clone(previousState) : null,
  };
}

export const Store = (() => {
  let initialized = false;
  let initializing = false;
  let destroyed = false;

  let mutationSeq = 0;

  const state = createInitialState();

  const listeners = new Set();
  const keyListeners = new Map();
  const selectorListeners = new Set();

  let batchDepth = 0;
  let batchPreviousState = null;
  const batchChangedPaths = new Set();

  /* =======================================================
     NOTIFY
  ======================================================= */

  function notify(changedPaths = [], previousState = null) {
    const paths = normalizeChanged(changedPaths);

    if (!paths.length) return false;

    if (batchDepth > 0) {
      for (const path of paths) {
        batchChangedPaths.add(path);
      }

      return true;
    }

    mutationSeq += 1;

    const payload = makePayload(api, paths, previousState);

    for (const listener of [...listeners]) {
      try {
        listener(payload);
      } catch {
        // Un listener no rompe Store.
      }
    }

    for (const path of paths) {
      for (const [watchedPath, set] of keyListeners.entries()) {
        if (path === watchedPath || path.startsWith(`${watchedPath}.`)) {
          for (const listener of [...set]) {
            try {
              listener(get(watchedPath), payload);
            } catch {
              // noop
            }
          }
        }
      }
    }

    for (const item of [...selectorListeners]) {
      try {
        const next = item.selector(get());
        const changed = !equal(next, item.last);

        if (changed) {
          const previous = item.last;
          item.last = clone(next);
          item.listener(next, previous, payload);
        }
      } catch {
        // noop
      }
    }

    try {
      AppCore?.events?.emit?.("store:change", {
        seq: mutationSeq,
        changedPaths: paths,
      });
    } catch {
      // noop
    }

    return true;
  }

  function commit(changedPaths = [], previousState = null) {
    touch(state);
    notify(changedPaths, previousState);
  }

  /* =======================================================
     READ
  ======================================================= */

  function get(path = null, fallback = undefined) {
    if (!path) return clone(state);

    const value = getByPath(state, path, undefined);

    return value === undefined ? fallback : clone(value);
  }

  function getRaw(path = null, fallback = undefined) {
    if (!path) return state;

    const value = getByPath(state, path, undefined);

    return value === undefined ? fallback : value;
  }

  function select(selector, fallback = undefined) {
    if (!isFunction(selector)) return fallback;

    try {
      const value = selector(get());
      return value === undefined ? fallback : clone(value);
    } catch {
      return fallback;
    }
  }

  /* =======================================================
     WRITE
  ======================================================= */

  function set(path, value) {
    const current = getRaw(path);

    if (equal(current, value)) {
      return get(path);
    }

    const previous = batchPreviousState || get();

    setByPath(state, path, clone(value));
    commit([path], previous);

    return get(path);
  }

  function patch(partial = {}) {
    if (!isObject(partial)) return get();

    const previous = batchPreviousState || get();
    const next = mergeDeep(state, partial);

    if (equal(state, next)) return get();

    for (const key of Object.keys(state)) {
      delete state[key];
    }

    Object.assign(state, next);

    commit(Object.keys(partial), previous);

    return get();
  }

  function replace(nextState = {}) {
    if (!isObject(nextState)) return get();

    const previous = batchPreviousState || get();

    if (equal(state, nextState)) return get();

    for (const key of Object.keys(state)) {
      delete state[key];
    }

    Object.assign(state, clone(nextState));

    commit(Object.keys(state), previous);

    return get();
  }

  function update(path, updater) {
    if (!isFunction(updater)) return get(path);

    const current = get(path);
    return set(path, updater(current));
  }

  function remove(path) {
    if (getRaw(path) === undefined) return false;

    const previous = batchPreviousState || get();
    const ok = deleteByPath(state, path);

    if (ok) {
      commit([path], previous);
    }

    return ok;
  }

  function reset() {
    return replace(createInitialState());
  }

  /* =======================================================
     BATCH
  ======================================================= */

  function beginBatch() {
    if (batchDepth === 0) {
      batchPreviousState = get();
      batchChangedPaths.clear();
    }

    batchDepth += 1;

    return batchDepth;
  }

  function endBatch() {
    if (batchDepth <= 0) return false;

    batchDepth -= 1;

    if (batchDepth > 0) return false;

    const paths = [...batchChangedPaths];
    const previous = batchPreviousState;

    batchPreviousState = null;
    batchChangedPaths.clear();

    if (paths.length) {
      notify(paths, previous);
    }

    return true;
  }

  function rollbackBatch() {
    if (batchPreviousState) {
      for (const key of Object.keys(state)) {
        delete state[key];
      }

      Object.assign(state, clone(batchPreviousState));
    }

    batchDepth = 0;
    batchPreviousState = null;
    batchChangedPaths.clear();

    return true;
  }

  function withBatch(fn) {
    if (!isFunction(fn)) return null;

    beginBatch();

    try {
      const result = fn(api);

      if (result && isFunction(result.then)) {
        return result
          .then((value) => {
            endBatch();
            return value;
          })
          .catch((error) => {
            rollbackBatch();
            throw error;
          });
      }

      endBatch();
      return result;
    } catch (error) {
      rollbackBatch();
      throw error;
    }
  }

  /* =======================================================
     COLLECTION HELPERS
  ======================================================= */

  function push(path, item) {
    return update(path, (current = []) => {
      const list = Array.isArray(current) ? current : [];
      return [...list, clone(item)];
    });
  }

  function upsertById(path, item, idKey = "id") {
    return update(path, (current = []) => {
      const list = Array.isArray(current) ? current : [];
      const id = item?.[idKey];

      if (id === undefined || id === null || id === "") {
        return [...list, clone(item)];
      }

      const index = list.findIndex((entry) => entry?.[idKey] === id);

      if (index < 0) {
        return [...list, clone(item)];
      }

      return list.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...entry,
              ...clone(item),
            }
          : entry
      );
    });
  }

  function removeById(path, id, idKey = "id") {
    return update(path, (current = []) => {
      const list = Array.isArray(current) ? current : [];
      return list.filter((entry) => entry?.[idKey] !== id);
    });
  }

  function clearCollection(path) {
    return set(path, []);
  }

  /* =======================================================
     SUBSCRIPTIONS
  ======================================================= */

  function subscribe(listener) {
    if (!isFunction(listener)) return () => false;

    listeners.add(listener);

    return () => {
      listeners.delete(listener);
      return true;
    };
  }

  function subscribeKey(path, listener) {
    if (!path || !isFunction(listener)) return () => false;

    if (!keyListeners.has(path)) {
      keyListeners.set(path, new Set());
    }

    keyListeners.get(path).add(listener);

    return () => {
      keyListeners.get(path)?.delete(listener);
      return true;
    };
  }

  function subscribeSelector(selector, listener) {
    if (!isFunction(selector) || !isFunction(listener)) {
      return () => false;
    }

    const item = {
      selector,
      listener,
      last: clone(selector(get())),
    };

    selectorListeners.add(item);

    return () => {
      selectorListeners.delete(item);
      return true;
    };
  }

  /* =======================================================
     LIFECYCLE
  ======================================================= */

  function attachToCore() {
    try {
      AppCore.Store = api;
      AppCore.store = api;
      AppCore.modules?.register?.("Store", api);
      AppCore.modules?.register?.("store", api);
    } catch {
      // noop
    }

    return true;
  }

  function init(options = {}) {
    if (initialized && options.force !== true) {
      attachToCore();
      return api;
    }

    initializing = true;
    destroyed = false;

    attachToCore();

    initialized = true;
    initializing = false;

    return api;
  }

  function destroy(options = {}) {
    listeners.clear();
    keyListeners.clear();
    selectorListeners.clear();

    batchDepth = 0;
    batchPreviousState = null;
    batchChangedPaths.clear();

    if (options.clearState === true) {
      replace(createInitialState());
    }

    initialized = false;
    initializing = false;
    destroyed = true;

    return true;
  }

  function isInitialized() {
    return initialized;
  }

  function isInitializing() {
    return initializing;
  }

  /* =======================================================
     SNAPSHOT / DIAGNOSTICS
  ======================================================= */

  function getDiagnostics() {
    return {
      version: STORE_VERSION,
      initialized,
      initializing,
      destroyed,
      mutationSeq,
      listeners: listeners.size,
      keyListeners: keyListeners.size,
      selectorListeners: selectorListeners.size,
      batchDepth,
      stateChangeCount: state.meta?.changeCount || 0,
    };
  }

  function getSnapshot(options = {}) {
    return {
      version: STORE_VERSION,
      initialized,
      initializing,
      destroyed,
      mutationSeq,
      diagnostics: getDiagnostics(),
      state: options.includeState === true ? get() : null,
    };
  }

  function snapshot() {
    return get();
  }

  /* =======================================================
     COMPAT SELECTORS / ACTIONS
  ======================================================= */

  const selectors = {
    state: () => get(),
    app: () => get("app"),
    session: () => get("session"),
    ui: () => get("ui"),
    entities: () => get("entities"),
    flags: () => get("flags"),
    meta: () => get("meta"),
  };

  const actions = {
    set,
    patch,
    replace,
    update,
    remove,
    reset,
    push,
    upsertById,
    removeById,
    clearCollection,
  };

  const api = {
    version: STORE_VERSION,
    state,

    init,
    destroy,

    isInitialized,
    isInitializing,

    get,
    getRaw,
    select,

    set,
    patch,
    replace,
    update,
    remove,
    delete: remove,
    del: remove,
    reset,

    beginBatch,
    endBatch,
    withBatch,
    rollbackBatch,

    push,
    upsertById,
    removeById,
    clearCollection,

    subscribe,
    subscribeKey,
    subscribePath: subscribeKey,
    subscribeSelector,

    snapshot,
    getSnapshot,
    getDebugSnapshot: getSnapshot,
    getDiagnostics,

    selectors,
    actions,
  };

  attachToCore();

  return api;
})();

export default Store;
