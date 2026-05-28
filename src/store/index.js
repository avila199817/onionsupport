/* =========================================================
   Onion Support - Store
   Archivo: /src/store/index.js

   Responsabilidad:
   - Store mínimo de compat.
   - Estado UI/app/entities/flags en memoria.
   - get / set / patch / replace / update / remove.
   - Suscripciones simples.
   - No duplica Auth.
   - No duplica sesión.
   - No duplica Core State.
   - No duplica Router.
   - No duplica HTTP.
   - No sincroniza Core en paralelo.
   - No guarda tokens reales.
   - No guarda usuarios Auth.
   - Sin fetch.
   - Sin storage.
   - Sin batch fake.
   - Sin sesión fake.
========================================================= */

import { AppCore } from "../core/index.js";

export const STORE_VERSION = "store.index.v3";

const ROOT_KEYS = Object.freeze([
  "ui",
  "app",
  "entities",
  "flags",
  "meta",
]);

const BLOCKED_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

const SENSITIVE_KEY_RE =
  /(^auth$|^session$|^sessionData$|^currentUser$|^authUser$|^sessionUser$|^user$|token|authorization|cookie|password|passwd|pwd|secret|credential|jwt|bearer|refresh|accessToken|access_token|idToken|id_token|apiKey|api_key|privateKey|private_key|connectionString|connection_string|sas|otp|totp|mfa|twofa|2fa|backupCode|backup_code|backupCodes|backup_codes|sessionId|session_id)/i;

/* =========================================================
   BASICS
========================================================= */

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
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
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {
    // fallback abajo
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function same(left, right) {
  if (Object.is(left, right)) return true;

  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function normalizeKey(key = "") {
  return String(key || "").trim();
}

function isBlockedKey(key = "") {
  return BLOCKED_KEYS.has(normalizeKey(key));
}

function isSensitiveKey(key = "") {
  return SENSITIVE_KEY_RE.test(normalizeKey(key));
}

function isAllowedRootKey(key = "") {
  return ROOT_KEYS.includes(normalizeKey(key));
}

function sanitizeForStore(value, keyHint = "") {
  if (isBlockedKey(keyHint) || isSensitiveKey(keyHint)) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeForStore(item))
      .filter((item) => item !== undefined);
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (isBlockedKey(key)) continue;
      if (isSensitiveKey(key)) continue;

      const clean = sanitizeForStore(item, key);

      if (clean !== undefined) {
        output[key] = clean;
      }
    }

    return output;
  }

  return clone(value);
}

/* =========================================================
   PATH HELPERS
========================================================= */

function pathParts(path = "") {
  const parts = Array.isArray(path)
    ? path
    : String(path || "").split(".");

  return parts
    .map((part) => normalizeKey(part))
    .filter(Boolean)
    .filter((part) => !isBlockedKey(part));
}

function pathAllowed(path = "") {
  const parts = pathParts(path);

  if (!parts.length) return false;
  if (!isAllowedRootKey(parts[0])) return false;

  return !parts.some(isSensitiveKey);
}

function pathKey(path = "") {
  return pathParts(path).join(".");
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

  if (!parts.length || !pathAllowed(parts)) return false;

  let current = root;

  for (const part of parts.slice(0, -1)) {
    if (!isObject(current[part])) {
      current[part] = {};
    }

    current = current[part];
  }

  const key = parts.at(-1);
  const clean = sanitizeForStore(value, key);

  if (clean === undefined) return false;

  current[key] = clean;

  return true;
}

function deleteByPath(root, path) {
  const parts = pathParts(path);

  if (!parts.length || !pathAllowed(parts)) return false;

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
    if (!isAllowedRootKey(key) && !isObject(target)) continue;
    if (isBlockedKey(key)) continue;
    if (isSensitiveKey(key)) continue;

    const clean = sanitizeForStore(value, key);

    if (clean === undefined) continue;

    output[key] =
      isObject(clean) && isObject(output[key])
        ? merge(output[key], clean)
        : clean;
  }

  return output;
}

function sanitizeRootPatch(partial = {}) {
  if (!isObject(partial)) return {};

  const output = {};

  for (const [key, value] of Object.entries(partial)) {
    if (!isAllowedRootKey(key)) continue;
    if (isBlockedKey(key)) continue;
    if (isSensitiveKey(key)) continue;

    const clean = sanitizeForStore(value, key);

    if (clean !== undefined) {
      output[key] = clean;
    }
  }

  return output;
}

/* =========================================================
   STATE
========================================================= */

function createInitialState() {
  const now = nowIso();

  return {
    ui: {
      theme: "system",
      lang: "es",
      sidebarOpen: true,
    },

    app: {},

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
  if (!watched || !changed) return false;

  return (
    watched === changed ||
    watched.startsWith(`${changed}.`) ||
    changed.startsWith(`${watched}.`)
  );
}

/* =========================================================
   STORE
========================================================= */

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
    const changedPaths = [
      ...new Set(
        paths
          .map((path) => pathKey(path))
          .filter(Boolean)
      ),
    ];

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
          entry.listener(clone(nextValue), previousValue, payload);
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
    if (!pathAllowed(path)) return fallback;

    const value = getByPath(state, path, undefined);

    return value === undefined ? fallback : clone(value);
  }

  function getInternal(path = null, fallback = undefined) {
    if (!path) return state;
    if (!pathAllowed(path)) return fallback;

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
    if (!path || !pathAllowed(path)) return get(path);

    const key = pathParts(path).at(-1);
    const sanitized = sanitizeForStore(value, key);

    if (sanitized === undefined) return get(path);

    const current = getInternal(path);

    if (same(current, sanitized)) return get(path);

    const previous = get();

    setByPath(state, path, sanitized);
    commit([path], previous);

    return get(path);
  }

  function patch(partial = {}) {
    const sanitized = sanitizeRootPatch(partial);

    if (!isObject(sanitized) || !Object.keys(sanitized).length) return get();

    const previous = get();
    const next = merge(state, sanitized);

    if (same(state, next)) return get();

    for (const key of Object.keys(state)) {
      delete state[key];
    }

    Object.assign(state, next);

    commit(Object.keys(sanitized), previous);

    return get();
  }

  function replace(nextState = {}) {
    if (!isObject(nextState)) return get();

    const sanitized = merge(
      createInitialState(),
      sanitizeRootPatch(nextState)
    );

    if (same(state, sanitized)) return get();

    const previous = get();

    for (const key of Object.keys(state)) {
      delete state[key];
    }

    Object.assign(state, sanitized);

    commit(ROOT_KEYS, previous);

    return get();
  }

  function update(path, updater) {
    if (!isFunction(updater)) return get(path);
    if (!pathAllowed(path)) return get(path);

    return set(path, updater(get(path)));
  }

  function remove(path) {
    if (!pathAllowed(path)) return false;
    if (getInternal(path) === undefined) return false;

    const previous = get();
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
     COLLECTION HELPERS
  ======================================================= */

  function push(path, item) {
    return update(path, (current = []) => {
      const list = Array.isArray(current) ? current : [];
      const clean = sanitizeForStore(item);

      if (clean === undefined) return list;

      return [...list, clean];
    });
  }

  function upsertById(path, item, idKey = "id") {
    return update(path, (current = []) => {
      const list = Array.isArray(current) ? current : [];
      const cleanItem = sanitizeForStore(item);
      const key = normalizeKey(idKey || "id");

      if (!isObject(cleanItem) || isBlockedKey(key) || isSensitiveKey(key)) {
        return list;
      }

      const id = cleanItem[key];

      if (id === undefined || id === null || id === "") {
        return [...list, cleanItem];
      }

      const index = list.findIndex((entry) => entry?.[key] === id);

      if (index < 0) {
        return [...list, cleanItem];
      }

      return list.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...entry,
              ...cleanItem,
            }
          : entry
      );
    });
  }

  function removeById(path, id, idKey = "id") {
    return update(path, (current = []) => {
      const list = Array.isArray(current) ? current : [];
      const key = normalizeKey(idKey || "id");

      if (isBlockedKey(key) || isSensitiveKey(key)) return list;

      return list.filter((entry) => entry?.[key] !== id);
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
    const cleanPath = pathKey(path);

    if (!cleanPath || !pathAllowed(cleanPath) || !isFunction(listener)) {
      return () => false;
    }

    if (!keyListeners.has(cleanPath)) {
      keyListeners.set(cleanPath, new Set());
    }

    keyListeners.get(cleanPath).add(listener);

    if (options.immediate === true) {
      try {
        listener(get(cleanPath), {
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
      keyListeners.get(cleanPath)?.delete(listener);

      if (keyListeners.get(cleanPath)?.size === 0) {
        keyListeners.delete(cleanPath);
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
     CORE REGISTRATION
  ======================================================= */

  function attachToCore() {
    try {
      AppCore.store = api;
      AppCore.modules?.register?.("store", api, {
        overwrite: true,
      });
      return true;
    } catch {
      return false;
    }
  }

  function detachFromCore() {
    try {
      if (AppCore.store === api) {
        delete AppCore.store;
      }

      AppCore.modules?.remove?.("store");

      return true;
    } catch {
      return false;
    }
  }

  /* =======================================================
     LIFECYCLE
  ======================================================= */

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

    detachFromCore();

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

      rootKeys: ROOT_KEYS,

      policy: {
        memoryOnly: true,

        uiAppEntitiesFlagsOnly: true,

        noAuth: true,
        noSession: true,
        noRouter: true,
        noHttp: true,
        noCoreSync: true,
        noStorage: true,

        noRealTokens: true,
        noSensitiveKeys: true,
        noUserAuthObjects: true,

        noImportSideEffectRegistration: true,
        noFakeSessionSelector: true,
        noBatchFake: true,
      },
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
     SELECTORS / ACTIONS
  ======================================================= */

  const selectors = {
    state: () => get(),

    ui: () => get("ui"),
    app: () => get("app"),
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

    init,
    destroy,

    isInitialized,
    isInitializing,

    get,
    select,

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

    get state() {
      return get();
    },
  };

  return api;
})();

export default Store;
