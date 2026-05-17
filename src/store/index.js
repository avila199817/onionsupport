/* =========================================================
   Onion Support - Store
   Archivo: /src/store/index.js

   Responsabilidad:
   - Store mínimo de compat.
   - Estado simple en memoria.
   - get / set / patch / update / remove.
   - Suscripciones simples.
   - No duplica Auth.
   - No duplica Core.
   - No duplica Router.
   - No duplica HTTP.
   - No sincroniza Core en paralelo.
   - No guarda tokens reales.
   - Sin helpers externos.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../core/index.js";

export const STORE_VERSION = "simple";

const BLOCKED_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

function nowIso() {
  return new Date().toISOString();
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function clone(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

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

function same(a, b) {
  if (Object.is(a, b)) return true;

  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function pathParts(path = "") {
  const parts = Array.isArray(path)
    ? path
    : String(path || "").split(".");

  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .filter((part) => !BLOCKED_KEYS.has(part));
}

function getByPath(root, path, fallback = undefined) {
  const parts = pathParts(path);

  if (!parts.length) return fallback;

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

function merge(target = {}, source = {}) {
  const output = isObject(target) ? clone(target) : {};

  if (!isObject(source)) return output;

  for (const [key, value] of Object.entries(source)) {
    if (BLOCKED_KEYS.has(key)) continue;

    output[key] =
      isObject(value) && isObject(output[key])
        ? merge(output[key], value)
        : clone(value);
  }

  return output;
}

function createInitialState() {
  const now = nowIso();

  return {
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
      createdAt: now,
      updatedAt: now,
      changeCount: 0,
    },
  };
}

function touch(state) {
  state.meta = isObject(state.meta) ? state.meta : {};
  state.meta.version = STORE_VERSION;
  state.meta.updatedAt = nowIso();
  state.meta.changeCount = Number(state.meta.changeCount || 0) + 1;
}

function matchPath(watched = "", changed = "") {
  return (
    watched === changed ||
    watched.startsWith(`${changed}.`) ||
    changed.startsWith(`${watched}.`)
  );
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

  /* =======================================================
     NOTIFY
  ======================================================= */

  function notify(paths = [], previousState = null) {
    const changedPaths = [...new Set(paths.filter(Boolean))];

    if (!changedPaths.length) return false;

    mutationSeq += 1;

    const payload = {
      version: STORE_VERSION,
      seq: mutationSeq,
      changedPaths,
      state: get(),
      previousState: previousState ? clone(previousState) : null,
    };

    for (const listener of [...listeners]) {
      try {
        listener(payload);
      } catch {
        // Un listener no rompe Store.
      }
    }

    for (const [watchedPath, bucket] of keyListeners.entries()) {
      if (!changedPaths.some((path) => matchPath(watchedPath, path))) continue;

      for (const listener of [...bucket]) {
        try {
          listener(get(watchedPath), payload);
        } catch {
          // Un key listener no rompe Store.
        }
      }
    }

    for (const entry of [...selectorListeners]) {
      try {
        const nextValue = entry.selector(get());

        if (!same(nextValue, entry.lastValue)) {
          const previousValue = entry.lastValue;
          entry.lastValue = clone(nextValue);
          entry.listener(nextValue, previousValue, payload);
        }
      } catch {
        // Un selector listener no rompe Store.
      }
    }

    return true;
  }

  function commit(paths = [], previousState = null) {
    touch(state);
    return notify(paths, previousState);
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
    if (!path) return get();

    const current = getRaw(path);

    if (same(current, value)) return get(path);

    const previous = get();

    setByPath(state, path, clone(value));
    commit([path], previous);

    return get(path);
  }

  function patch(partial = {}) {
    if (!isObject(partial)) return get();

    const previous = get();
    const next = merge(state, partial);

    if (same(state, next)) return get();

    for (const key of Object.keys(state)) {
      delete state[key];
    }

    Object.assign(state, next);

    commit(Object.keys(partial), previous);

    return get();
  }

  function replace(nextState = {}) {
    if (!isObject(nextState)) return get();

    if (same(state, nextState)) return get();

    const previous = get();

    for (const key of Object.keys(state)) {
      delete state[key];
    }

    Object.assign(state, clone(nextState));
    commit(Object.keys(state), previous);

    return get();
  }

  function update(path, updater) {
    if (!isFunction(updater)) return get(path);

    return set(path, updater(get(path)));
  }

  function remove(path) {
    if (getRaw(path) === undefined) return false;

    const previous = get();
    const ok = deleteByPath(state, path);

    if (ok) commit([path], previous);

    return ok;
  }

  function reset() {
    return replace(createInitialState());
  }

  /* =======================================================
     BATCH COMPAT
     No batch real. Mantiene API sin meter sistema paralelo.
  ======================================================= */

  function beginBatch() {
    return 0;
  }

  function endBatch() {
    return true;
  }

  function rollbackBatch() {
    return false;
  }

  function withBatch(fn) {
    return isFunction(fn) ? fn(api) : null;
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

  function subscribe(listener, options = {}) {
    if (!isFunction(listener)) return () => false;

    listeners.add(listener);

    if (options.immediate === true) {
      try {
        listener({
          version: STORE_VERSION,
          seq: mutationSeq,
          changedPaths: [],
          state: get(),
          previousState: null,
        });
      } catch {
        // noop
      }
    }

    return () => {
      listeners.delete(listener);
      return true;
    };
  }

  function subscribeKey(path, listener, options = {}) {
    if (!path || !isFunction(listener)) return () => false;

    if (!keyListeners.has(path)) {
      keyListeners.set(path, new Set());
    }

    keyListeners.get(path).add(listener);

    if (options.immediate === true) {
      try {
        listener(get(path), {
          version: STORE_VERSION,
          seq: mutationSeq,
          changedPaths: [],
          state: get(),
          previousState: null,
        });
      } catch {
        // noop
      }
    }

    return () => {
      keyListeners.get(path)?.delete(listener);

      if (keyListeners.get(path)?.size === 0) {
        keyListeners.delete(path);
      }

      return true;
    };
  }

  function subscribeSelector(selector, listener, options = {}) {
    if (!isFunction(selector) || !isFunction(listener)) {
      return () => false;
    }

    let initialValue;

    try {
      initialValue = selector(get());
    } catch {
      initialValue = undefined;
    }

    const entry = {
      selector,
      listener,
      lastValue: clone(initialValue),
    };

    selectorListeners.add(entry);

    if (options.immediate === true) {
      try {
        listener(clone(initialValue), undefined, {
          version: STORE_VERSION,
          seq: mutationSeq,
          changedPaths: [],
          state: get(),
          previousState: null,
        });
      } catch {
        // noop
      }
    }

    return () => {
      selectorListeners.delete(entry);
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
     SNAPSHOT
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
