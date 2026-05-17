/* =========================================================
   Onion Support - Store Notify
   Archivo: /src/store/notify.js

   Responsabilidad:
   - Compat mínima de notificación.
   - Sin imports.
   - Sin diagnósticos.
   - Sin event storm.
   - Sin sanitizado profundo.
   - Sin duplicar Store.
   - Sin lógica rara.
========================================================= */

export const STORE_NOTIFY_VERSION = "simple";

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
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

function nowIso() {
  return new Date().toISOString();
}

function toSet(value) {
  if (value instanceof Set) return value;
  if (Array.isArray(value)) return new Set(value);
  if (value === null || value === undefined) return new Set();
  return new Set([value]);
}

function toMap(value) {
  if (value instanceof Map) return value;
  if (isObject(value)) return new Map(Object.entries(value));
  return new Map();
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

function uniquePaths(paths = []) {
  const output = [];
  const seen = new Set();

  for (const item of Array.isArray(paths) ? paths : [paths]) {
    const path = pathString(item);

    if (!path || seen.has(path)) continue;

    seen.add(path);
    output.push(path);
  }

  return output;
}

/**
 * Matching bidireccional:
 * - watched: session      + changed: session.user => true
 * - watched: session.user + changed: session      => true
 */
export function pathMatches(watchedPath = "", changedPath = "") {
  const watched = pathString(watchedPath);
  const changed = pathString(changedPath);

  if (!watched || !changed) return false;

  return (
    watched === changed ||
    watched.startsWith(`${changed}.`) ||
    changed.startsWith(`${watched}.`)
  );
}

function anyPathMatches(watchedPath = "", changedPaths = []) {
  return uniquePaths(changedPaths).some((changedPath) => {
    return pathMatches(watchedPath, changedPath);
  });
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

function snapshotValue(snapshot) {
  if (isFunction(snapshot)) {
    try {
      return snapshot();
    } catch {
      return {};
    }
  }

  return snapshot || {};
}

/* =========================================================
   PAYLOAD
========================================================= */

export function buildPayload(snapshot, changedPaths = [], previousState = null) {
  const timestamp = Date.now();

  return {
    version: STORE_NOTIFY_VERSION,
    state: clone(snapshotValue(snapshot)) || {},
    previousState: previousState ? clone(previousState) : null,
    changedPaths: uniquePaths(changedPaths),
    timestamp,
    timestampIso: nowIso(),
  };
}

function normalizePayload({ payload, snapshot } = {}) {
  const source = isObject(payload)
    ? payload
    : buildPayload(snapshot, []);

  return {
    version: source.version || STORE_NOTIFY_VERSION,
    state: clone(source.state ?? snapshotValue(snapshot)) || {},
    previousState: source.previousState ? clone(source.previousState) : null,
    changedPaths: uniquePaths(source.changedPaths),
    timestamp: source.timestamp || Date.now(),
    timestampIso: source.timestampIso || nowIso(),
  };
}

/* =========================================================
   GLOBAL LISTENERS
========================================================= */

export function notifyGlobalListeners({ listeners, payload } = {}) {
  const bucket = toSet(listeners);

  let notified = 0;

  for (const listener of [...bucket]) {
    if (!isFunction(listener)) continue;

    try {
      listener(clone(payload));
      notified += 1;
    } catch {
      // Un listener no rompe Store.
    }
  }

  return notified;
}

/* =========================================================
   KEY LISTENERS
========================================================= */

export function notifyKeyListeners({ keyListeners, get, payload } = {}) {
  const map = toMap(keyListeners);
  const changedPaths = uniquePaths(payload?.changedPaths);

  if (!map.size || !changedPaths.length) return 0;

  let notified = 0;

  for (const [rawPath, rawBucket] of map.entries()) {
    const path = pathString(rawPath);

    if (!path || !anyPathMatches(path, changedPaths)) continue;

    const bucket = toSet(rawBucket);
    const value = isFunction(get)
      ? get(path)
      : getByPath(payload.state, path, undefined);

    const previousValue = payload.previousState
      ? getByPath(payload.previousState, path, undefined)
      : undefined;

    const matchedPaths = changedPaths.filter((changedPath) => {
      return pathMatches(path, changedPath);
    });

    for (const entry of [...bucket]) {
      const listener = isFunction(entry)
        ? entry
        : isFunction(entry?.listener)
          ? entry.listener
          : null;

      if (!listener) continue;

      try {
        listener({
          ...clone(payload),
          listenerType: "key",
          path,
          value: clone(value),
          previousValue: clone(previousValue),
          matchedPaths,
        });

        notified += 1;
      } catch {
        // Un key listener no rompe Store.
      }

      if (entry?.once === true) {
        try {
          bucket.delete(entry);
        } catch {
          // noop
        }
      }
    }
  }

  return notified;
}

/* =========================================================
   SELECTOR LISTENERS
========================================================= */

export function notifySelectorListeners({ selectorListeners, state, payload } = {}) {
  const bucket = toSet(selectorListeners);

  if (!bucket.size) return 0;

  let notified = 0;
  const currentState = clone(state || payload?.state || {}) || {};

  for (const entry of [...bucket]) {
    if (!entry || !isFunction(entry.selector)) continue;

    const listener =
      entry.listener ||
      entry.callback ||
      entry.handler;

    if (!isFunction(listener)) continue;

    let nextValue;

    try {
      nextValue = entry.selector(currentState);
    } catch {
      continue;
    }

    const previousValue = clone(entry.lastValue ?? entry.last);

    let changed = true;

    try {
      changed = JSON.stringify(nextValue) !== JSON.stringify(previousValue);
    } catch {
      changed = nextValue !== previousValue;
    }

    if (!changed) continue;

    try {
      entry.lastValue = clone(nextValue);
      entry.last = clone(nextValue);
    } catch {
      entry.lastValue = nextValue;
      entry.last = nextValue;
    }

    try {
      listener({
        ...clone(payload),
        listenerType: "selector",
        value: clone(nextValue),
        previousValue,
        selectorName: text(entry.name || entry.selector.name, ""),
      });

      notified += 1;
    } catch {
      // Un selector listener no rompe Store.
    }

    if (entry.once === true) {
      try {
        bucket.delete(entry);
      } catch {
        // noop
      }
    }
  }

  return notified;
}

/* =========================================================
   MAIN NOTIFY
========================================================= */

export function notify({
  listeners,
  keyListeners,
  selectorListeners,
  get,
  snapshot,
  state,
  payload,
} = {}) {
  const finalPayload = normalizePayload({
    payload,
    snapshot,
  });

  if (!finalPayload.changedPaths.length) {
    return {
      ok: true,
      skipped: true,
      reason: "no-changed-paths",
      globalListeners: 0,
      keyListeners: 0,
      selectorListeners: 0,
      totalListeners: 0,
      changedPaths: [],
    };
  }

  const globalCount = notifyGlobalListeners({
    listeners,
    payload: finalPayload,
  });

  const keyCount = notifyKeyListeners({
    keyListeners,
    get,
    payload: finalPayload,
  });

  const selectorCount = notifySelectorListeners({
    selectorListeners,
    state,
    payload: finalPayload,
  });

  return {
    ok: true,
    version: STORE_NOTIFY_VERSION,
    globalListeners: globalCount,
    keyListeners: keyCount,
    selectorListeners: selectorCount,
    totalListeners: globalCount + keyCount + selectorCount,
    changedPaths: finalPayload.changedPaths,
    timestamp: finalPayload.timestamp,
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function buildNotifySnapshot({ listeners, keyListeners, selectorListeners } = {}) {
  const keyMap = toMap(keyListeners);

  let keyListenerCount = 0;

  for (const bucket of keyMap.values()) {
    keyListenerCount += toSet(bucket).size;
  }

  return {
    version: STORE_NOTIFY_VERSION,
    globalListeners: toSet(listeners).size,
    keyListenerPaths: [...keyMap.keys()].map(pathString).filter(Boolean),
    keyListenerCount,
    selectorListeners: toSet(selectorListeners).size,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  STORE_NOTIFY_VERSION,

  buildPayload,

  pathMatches,

  notifyGlobalListeners,
  notifyKeyListeners,
  notifySelectorListeners,

  notify,

  buildNotifySnapshot,
};
