/* =========================================================
   Onion Support - Store Subscriptions
   Archivo: /src/store/subscriptions.js

   Responsabilidad:
   - Compat mínima de suscripciones.
   - Global / key / selector.
   - immediate / once básicos.
   - Sin imports.
   - Sin diagnósticos.
   - Sin metadata pesada.
   - Sin eventos AppCore.
   - Sin magia negra.
========================================================= */

export const STORE_SUBSCRIPTIONS_VERSION = "simple";

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function normalizePath(path = "") {
  if (Array.isArray(path)) {
    return path.map((part) => text(part, "")).filter(Boolean);
  }

  return text(path, "")
    .replace(/\[(["'`]?)(.*?)\1\]/g, ".$2")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !["__proto__", "prototype", "constructor"].includes(part));
}

function pathString(path = "") {
  return normalizePath(path).join(".");
}

function getByPath(object, path, fallback = undefined) {
  const parts = normalizePath(path);

  if (!parts.length) return fallback;

  let current = object;

  for (const part of parts) {
    if (current === null || current === undefined) return fallback;
    current = current[part];
  }

  return current === undefined ? fallback : current;
}

function equal(left, right) {
  if (Object.is(left, right)) return true;

  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function snapshotValue(snapshot) {
  if (!isFunction(snapshot)) return {};

  try {
    return snapshot();
  } catch {
    return {};
  }
}

function buildPayload({ snapshot, path = "", value = undefined, previousValue = undefined } = {}) {
  return {
    version: STORE_SUBSCRIPTIONS_VERSION,
    state: clone(snapshotValue(snapshot)) || {},
    path: path || "",
    value: clone(value),
    previousValue: clone(previousValue),
    timestamp: Date.now(),
  };
}

function noop() {
  return false;
}

/* =========================================================
   GLOBAL
========================================================= */

export function subscribe(listeners, listener, options = {}) {
  if (!listeners || !isFunction(listeners.add) || !isFunction(listeners.delete)) {
    return noop;
  }

  if (!isFunction(listener)) {
    return noop;
  }

  const once = options?.once === true;
  const immediate = options?.immediate === true;

  let active = true;

  function unsubscribe() {
    if (!active) return false;

    active = false;
    listeners.delete(wrapped);

    return true;
  }

  function wrapped(payload = {}) {
    if (!active) return;

    try {
      listener(payload);
    } catch {
      // Un listener no rompe Store.
    }

    if (once) {
      unsubscribe();
    }
  }

  listeners.add(wrapped);

  if (immediate) {
    wrapped(buildPayload({ snapshot: options.snapshot }));
  }

  return unsubscribe;
}

/* =========================================================
   KEY / PATH
========================================================= */

export function subscribeKey({
  keyListeners,
  path,
  listener,
  get,
  snapshot,
  options = {},
} = {}) {
  const watchedPath = pathString(path);

  if (!watchedPath || !isFunction(listener)) {
    return noop;
  }

  if (!keyListeners || !isFunction(keyListeners.has) || !isFunction(keyListeners.set) || !isFunction(keyListeners.get)) {
    return noop;
  }

  if (!keyListeners.has(watchedPath)) {
    keyListeners.set(watchedPath, new Set());
  }

  const bucket = keyListeners.get(watchedPath);
  const once = options?.once === true;
  const immediate = options?.immediate === true;

  const entry = {
    path: watchedPath,
    listener,
    once,
  };

  bucket.add(entry);

  function unsubscribe() {
    bucket.delete(entry);

    if (bucket.size === 0) {
      keyListeners.delete(watchedPath);
    }

    return true;
  }

  if (immediate) {
    const value = isFunction(get)
      ? get(watchedPath)
      : getByPath(snapshotValue(snapshot), watchedPath);

    try {
      listener(buildPayload({
        snapshot,
        path: watchedPath,
        value,
        previousValue: undefined,
      }));
    } catch {
      // noop
    }

    if (once) {
      unsubscribe();
    }
  }

  return unsubscribe;
}

/* =========================================================
   SELECTOR
========================================================= */

export function subscribeSelector({
  selectorListeners,
  selector,
  listener,
  snapshot,
  shallowCloneRoot,
  state,
  options = {},
} = {}) {
  if (!selectorListeners || !isFunction(selectorListeners.add) || !isFunction(selectorListeners.delete)) {
    return noop;
  }

  if (!isFunction(selector) || !isFunction(listener)) {
    return noop;
  }

  const sourceState = isFunction(shallowCloneRoot)
    ? shallowCloneRoot(state)
    : snapshotValue(snapshot);

  let initialValue;

  try {
    initialValue = selector(sourceState);
  } catch {
    initialValue = undefined;
  }

  const entry = {
    selector,
    listener,
    once: options?.once === true,
    lastValue: clone(initialValue),
  };

  selectorListeners.add(entry);

  function unsubscribe() {
    selectorListeners.delete(entry);
    return true;
  }

  if (options?.immediate === true) {
    try {
      listener(buildPayload({
        snapshot,
        value: initialValue,
        previousValue: undefined,
      }));
    } catch {
      // noop
    }

    if (entry.once) {
      unsubscribe();
    }
  }

  return unsubscribe;
}

/* =========================================================
   SELECTOR HELPER
========================================================= */

export function shouldNotifySelectorEntry(entry, nextValue) {
  if (!entry) return false;

  const previous = entry.lastValue ?? entry.last;

  if (isFunction(entry.equalityFn)) {
    try {
      return !entry.equalityFn(previous, nextValue);
    } catch {
      return true;
    }
  }

  if (isFunction(entry.compare)) {
    try {
      return !entry.compare(previous, nextValue);
    } catch {
      return true;
    }
  }

  return !equal(previous, nextValue);
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSubscriptionsSnapshot({
  listeners,
  keyListeners,
  selectorListeners,
} = {}) {
  const keyPaths = keyListeners instanceof Map
    ? [...keyListeners.keys()].map(pathString)
    : [];

  let keyCount = 0;

  if (keyListeners instanceof Map) {
    for (const bucket of keyListeners.values()) {
      keyCount += bucket?.size || 0;
    }
  }

  return {
    version: STORE_SUBSCRIPTIONS_VERSION,
    counts: {
      global: listeners?.size || 0,
      key: keyCount,
      selector: selectorListeners?.size || 0,
      total: (listeners?.size || 0) + keyCount + (selectorListeners?.size || 0),
    },
    keyPaths,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  STORE_SUBSCRIPTIONS_VERSION,

  subscribe,
  subscribeKey,
  subscribeSelector,

  shouldNotifySelectorEntry,

  getSubscriptionsSnapshot,
};
