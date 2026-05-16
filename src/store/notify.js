/* =========================================================
   Onion SPA - Store Notify
   Archivo: src/store/notify.js

   Store notify limpio:
   - payload estable
   - global/key/selector listeners
   - errores aislados
   - clones por subscriber
   - sin event storm diagnóstico por defecto
========================================================= */

import {
  deepClone,
  deepEqual,
  getByPath,
  isAnyObject,
  isFunction,
  isPlainObject,
  normalizePath,
  safeArray,
  safeNumber,
  safeObject,
  safeText,
} from "./helpers.js";

/* =========================================================
   VERSION
========================================================= */

export const STORE_NOTIFY_VERSION = "15.0.0-clean";

/* =========================================================
   CONSTANTS
========================================================= */

const STORE_NOTIFY_EVENT = "store:notify";
const STORE_NOTIFY_ERROR_EVENT = "store:notify:error";
const STORE_LISTENER_ERROR_EVENT = "store:listener:error";
const STORE_SELECTOR_ERROR_EVENT = "store:selector:error";
const STORE_KEY_ERROR_EVENT = "store:key-listener:error";

const DEFAULT_MAX_CHANGED_PATHS = 500;
const MAX_ARRAY_PREVIEW = 200;
const MAX_OBJECT_KEYS = 80;
const MAX_SANITIZE_DEPTH = 5;

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

const TOKENISH_TEXT_RE =
  /(bearer\s+[a-z0-9._~+/=-]+)|([a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)|([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|tempToken|temp_token|code|t)=)[^&#\s]+/gi;

/* =========================================================
   BASICS
========================================================= */

function now() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function iso(ms = now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function toSet(value) {
  if (value instanceof Set) return value;

  try {
    if (Array.isArray(value)) return new Set(value);
    if (value && typeof value[Symbol.iterator] === "function") return new Set(value);
  } catch {}

  return new Set();
}

function toMap(value) {
  if (value instanceof Map) return value;

  try {
    if (Array.isArray(value)) return new Map(value);
    if (isPlainObject(value)) return new Map(Object.entries(value));
  } catch {}

  return new Map();
}

function clone(value, fallback = null) {
  if (value === undefined) return fallback;

  try {
    return deepClone(value);
  } catch {}

  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function freezePayload(payload = {}) {
  try {
    if (Array.isArray(payload.changedPaths)) Object.freeze(payload.changedPaths);
  } catch {}

  try {
    return Object.freeze(payload);
  } catch {
    return payload;
  }
}

/* =========================================================
   PATHS
========================================================= */

function pathParts(path = "") {
  try {
    return normalizePath(path);
  } catch {
    return [];
  }
}

function pathString(path = "") {
  return pathParts(path).join(".");
}

function uniquePaths(paths = [], limit = DEFAULT_MAX_CHANGED_PATHS) {
  const out = [];
  const seen = new Set();

  for (const item of safeArray(paths).flat(Infinity)) {
    const path = pathString(item);

    if (!path || seen.has(path)) continue;

    seen.add(path);
    out.push(path);

    if (out.length >= limit) break;
  }

  return out;
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
  const watched = pathString(watchedPath);

  if (!watched) return false;

  return uniquePaths(changedPaths).some((changedPath) =>
    pathMatches(watched, changedPath)
  );
}

function pathDepth(path = "") {
  const normalized = pathString(path);
  return normalized ? normalized.split(".").length : 0;
}

/* =========================================================
   REDACTION / ERROR
========================================================= */

function redactText(value = "") {
  const text = safeText(value, "");

  if (!text) return "";

  try {
    return text.replace(TOKENISH_TEXT_RE, (match) => {
      if (/^bearer\s+/i.test(match)) return "Bearer ***";
      if (/^[?&#]/.test(match)) return match.replace(/=.+$/g, "=***");
      return "***";
    });
  } catch {
    return text;
  }
}

function sanitizeError(error = null) {
  if (!error) return null;

  return {
    name: safeText(error?.name, "Error"),
    message: redactText(safeText(error?.message || error, "Store notify error.")),
    code: safeText(error?.code || error?.statusCode || "", "") || null,
    status: safeNumber(error?.status, 0) || null,
    stack: error?.stack ? "[stack]" : null,
  };
}

function sanitizeValue(value, depth = 0, keyHint = "", seen = new WeakSet()) {
  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) {
    return value ? "***" : null;
  }

  if (depth > MAX_SANITIZE_DEPTH) return "[depth-limit]";

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") return redactText(value);
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";
  if (value instanceof Error) return sanitizeError(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_PREVIEW)
      .map((item) => sanitizeValue(item, depth + 1, keyHint, seen));
  }

  if (isAnyObject(value)) {
    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
      output[key] = sanitizeValue(item, depth + 1, key, seen);
    }

    return output;
  }

  try {
    return redactText(String(value));
  } catch {
    return "[unserializable]";
  }
}

function safeEmit(AppCore, eventName, payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  try {
    AppCore?.events?.emit?.(name, sanitizeValue(payload));
    return true;
  } catch {
    return false;
  }
}

function safeLogError(AppCore, label, error, payload = {}) {
  try {
    AppCore?.utils?.error?.(label, error, sanitizeValue(payload));
    return true;
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.error(label, error, sanitizeValue(payload));
    }

    return true;
  } catch {
    return false;
  }
}

function reportError(AppCore, label, error, extra = {}) {
  const payload = {
    ok: false,
    label: safeText(label, "Store notify error"),
    error: sanitizeError(error),
    scope: safeText(extra.scope, "store:notify"),
    listenerType: safeText(extra.listenerType, ""),
    path: pathString(extra.path || ""),
    async: Boolean(extra.async),
    at: iso(),
  };

  safeLogError(AppCore, payload.label, error, payload);
  safeEmit(AppCore, extra.eventName || STORE_NOTIFY_ERROR_EVENT, payload);

  return payload;
}

function runSafely(AppCore, label, fn, eventName = STORE_NOTIFY_ERROR_EVENT, extra = {}) {
  try {
    if (!isFunction(fn)) return undefined;

    const result = fn();

    if (result && typeof result === "object" && isFunction(result.catch)) {
      result.catch((error) => {
        reportError(AppCore, label, error, {
          ...extra,
          async: true,
          eventName,
        });
      });
    }

    return result;
  } catch (error) {
    reportError(AppCore, label, error, {
      ...extra,
      async: false,
      eventName,
    });

    return undefined;
  }
}

/* =========================================================
   PAYLOAD
========================================================= */

function snapshotValue(snapshot) {
  if (!isFunction(snapshot)) return snapshot;

  return runSafely(
    null,
    "Store snapshot builder error",
    () => snapshot()
  );
}

export function buildPayload(snapshot, changedPaths = [], previousState = null) {
  const timestamp = now();
  const state = snapshotValue(snapshot);

  return freezePayload({
    version: STORE_NOTIFY_VERSION,
    state: clone(state, {}),
    previousState: previousState ? clone(previousState, null) : null,
    changedPaths: uniquePaths(changedPaths),
    timestamp,
    timestampIso: iso(timestamp),
  });
}

function clonePayload(payload = {}, extra = {}) {
  const source = safeObject(payload);

  return freezePayload({
    ...clone(source, {}),
    ...clone(extra, {}),

    state: clone(source.state, {}),
    previousState: source.previousState ? clone(source.previousState, null) : null,
    changedPaths: uniquePaths(source.changedPaths),
  });
}

function normalizeFinalPayload({ payload, snapshot } = {}) {
  const source = safeObject(payload);
  const timestamp = safeNumber(source.timestamp, now());
  const state = source.state ?? snapshotValue(snapshot);

  return freezePayload({
    version: source.version || STORE_NOTIFY_VERSION,
    ...clone(source, {}),

    state: clone(state, {}),
    previousState: source.previousState ? clone(source.previousState, null) : null,
    changedPaths: uniquePaths(source.changedPaths),
    timestamp,
    timestampIso: source.timestampIso || iso(timestamp),
  });
}

/* =========================================================
   GLOBAL LISTENERS
========================================================= */

function shouldCleanupInvalid(options = {}) {
  return options?.cleanupInvalid === true;
}

export function notifyGlobalListeners({
  AppCore,
  listeners,
  payload,
  options = {},
} = {}) {
  const bucket = toSet(listeners);
  if (!bucket.size) return 0;

  let notified = 0;

  for (const listener of Array.from(bucket)) {
    if (!isFunction(listener)) {
      if (shouldCleanupInvalid(options)) bucket.delete(listener);
      continue;
    }

    runSafely(
      AppCore,
      "Store global listener error",
      () => {
        listener(
          clonePayload(payload, {
            listenerType: "global",
          })
        );

        notified += 1;
      },
      STORE_LISTENER_ERROR_EVENT,
      {
        listenerType: "global",
      }
    );
  }

  return notified;
}

/* =========================================================
   KEY LISTENERS
========================================================= */

function normalizeKeyEntry(entry, path = "") {
  if (isFunction(entry)) {
    return {
      listener: entry,
      path,
      once: false,
    };
  }

  if (isPlainObject(entry) && isFunction(entry.listener)) {
    return {
      ...entry,
      path: pathString(entry.path || path),
      once: entry.once === true,
    };
  }

  return null;
}

function resolveCurrentValue({ get, state, path }) {
  if (isFunction(get)) {
    try {
      return get(path);
    } catch {}
  }

  return getByPath(state, path, undefined);
}

function notifyKeyEntry({
  AppCore,
  get,
  payload,
  path,
  entry,
  bucket,
} = {}) {
  const item = normalizeKeyEntry(entry, path);
  if (!item || !isFunction(item.listener)) return false;

  const matchedPaths = payload.changedPaths.filter((changedPath) =>
    pathMatches(path, changedPath)
  );

  const value = resolveCurrentValue({
    get,
    state: payload.state,
    path,
  });

  const previousValue = payload.previousState
    ? getByPath(payload.previousState, path, undefined)
    : undefined;

  runSafely(
    AppCore,
    `Store key listener error (${path})`,
    () => {
      item.listener(
        clonePayload(payload, {
          listenerType: "key",
          path,
          value: clone(value, value),
          previousValue: clone(previousValue, previousValue),
          matchedPaths,
        })
      );
    },
    STORE_KEY_ERROR_EVENT,
    {
      listenerType: "key",
      path,
    }
  );

  if (item.once === true) {
    try {
      bucket?.delete?.(entry);
    } catch {}
  }

  return true;
}

export function notifyKeyListeners({
  AppCore,
  keyListeners,
  get,
  payload,
  options = {},
} = {}) {
  const map = toMap(keyListeners);
  if (!map.size) return 0;

  const changedPaths = uniquePaths(payload?.changedPaths);
  if (!changedPaths.length) return 0;

  let notified = 0;

  const entries = Array
    .from(map.entries())
    .sort(([a], [b]) => pathDepth(a) - pathDepth(b));

  for (const [rawPath, rawBucket] of entries) {
    const path = pathString(rawPath);
    if (!path || !anyPathMatches(path, changedPaths)) continue;

    const bucket = toSet(rawBucket);

    for (const entry of Array.from(bucket)) {
      const ok = notifyKeyEntry({
        AppCore,
        get,
        payload,
        path,
        entry,
        bucket,
      });

      if (ok) {
        notified += 1;
      } else if (shouldCleanupInvalid(options)) {
        try {
          bucket.delete(entry);
        } catch {}
      }
    }
  }

  return notified;
}

/* =========================================================
   SELECTOR LISTENERS
========================================================= */

function getSelectorListener(entry = {}) {
  if (isFunction(entry.listener)) return entry.listener;
  if (isFunction(entry.callback)) return entry.callback;
  if (isFunction(entry.handler)) return entry.handler;
  return null;
}

function getSelectorEquality(entry = {}) {
  if (isFunction(entry.equalityFn)) return entry.equalityFn;
  if (isFunction(entry.compare)) return entry.compare;
  return deepEqual;
}

function selectorState({ shallowCloneRoot, state }) {
  try {
    if (isFunction(shallowCloneRoot)) return shallowCloneRoot(state);
  } catch {}

  return clone(state, {}) || {};
}

function runSelector(entry, state) {
  try {
    return {
      ok: true,
      value: entry.selector(state),
    };
  } catch (error) {
    return {
      ok: false,
      error,
    };
  }
}

function valuesEqual(entry, nextValue, previousValue) {
  try {
    return Boolean(getSelectorEquality(entry)(nextValue, previousValue));
  } catch {
    try {
      return deepEqual(nextValue, previousValue);
    } catch {
      return false;
    }
  }
}

export function notifySelectorListeners({
  AppCore,
  selectorListeners,
  shallowCloneRoot,
  state,
  payload,
  options = {},
} = {}) {
  const bucket = toSet(selectorListeners);
  if (!bucket.size) return 0;

  let notified = 0;
  const currentState = selectorState({ shallowCloneRoot, state });

  for (const entry of Array.from(bucket)) {
    if (!entry || !isFunction(entry.selector)) {
      if (shouldCleanupInvalid(options)) bucket.delete(entry);
      continue;
    }

    const listener = getSelectorListener(entry);

    if (!isFunction(listener)) {
      if (shouldCleanupInvalid(options)) bucket.delete(entry);
      continue;
    }

    const result = runSelector(entry, currentState);

    if (!result.ok) {
      reportError(AppCore, "Store selector execution error", result.error, {
        listenerType: "selector",
        eventName: STORE_SELECTOR_ERROR_EVENT,
      });

      if (entry.removeOnError === true) {
        try {
          bucket.delete(entry);
        } catch {}
      }

      continue;
    }

    const nextValue = result.value;
    const previousValue = clone(entry.lastValue, entry.lastValue);

    if (valuesEqual(entry, nextValue, entry.lastValue)) continue;

    try {
      entry.lastValue = clone(nextValue, nextValue);
    } catch {
      entry.lastValue = nextValue;
    }

    runSafely(
      AppCore,
      "Store selector listener error",
      () => {
        listener(
          clonePayload(payload, {
            listenerType: "selector",
            value: clone(nextValue, nextValue),
            previousValue,
            selectorName: safeText(entry.name || entry.selector?.name || "", ""),
          })
        );

        notified += 1;
      },
      STORE_SELECTOR_ERROR_EVENT,
      {
        listenerType: "selector",
      }
    );

    if (entry.once === true) {
      try {
        bucket.delete(entry);
      } catch {}
    }
  }

  return notified;
}

/* =========================================================
   DIAGNOSTICS
========================================================= */

function shouldEmitDiagnostics(AppCore, options = {}) {
  if (options.emitDiagnostics === true) return true;
  if (options.emitStoreNotify === true) return true;

  try {
    return Boolean(
      AppCore?.config?.diagnostics?.storeNotify ||
        AppCore?.config?.diagnostics?.storeEvents
    );
  } catch {
    return false;
  }
}

function emitNotifyDiagnostics(AppCore, result, options = {}) {
  if (!shouldEmitDiagnostics(AppCore, options)) return false;

  return safeEmit(AppCore, STORE_NOTIFY_EVENT, {
    ...result,
    state: undefined,
    previousState: undefined,
  });
}

/* =========================================================
   MAIN NOTIFY
========================================================= */

export function notify({
  AppCore,
  listeners,
  keyListeners,
  selectorListeners,
  get,
  snapshot,
  shallowCloneRoot,
  state,
  payload,
  options = {},
} = {}) {
  const startedAt = now();

  const finalPayload = normalizeFinalPayload({
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

  let globalCount = 0;
  let keyCount = 0;
  let selectorCount = 0;

  try {
    globalCount = notifyGlobalListeners({
      AppCore,
      listeners,
      payload: finalPayload,
      options,
    });
  } catch (error) {
    reportError(AppCore, "Store global notify phase error", error, {
      listenerType: "global",
      eventName: STORE_NOTIFY_ERROR_EVENT,
    });
  }

  try {
    keyCount = notifyKeyListeners({
      AppCore,
      keyListeners,
      get,
      payload: finalPayload,
      options,
    });
  } catch (error) {
    reportError(AppCore, "Store key notify phase error", error, {
      listenerType: "key",
      eventName: STORE_NOTIFY_ERROR_EVENT,
    });
  }

  try {
    selectorCount = notifySelectorListeners({
      AppCore,
      selectorListeners,
      shallowCloneRoot,
      state,
      payload: finalPayload,
      options,
    });
  } catch (error) {
    reportError(AppCore, "Store selector notify phase error", error, {
      listenerType: "selector",
      eventName: STORE_NOTIFY_ERROR_EVENT,
    });
  }

  const result = {
    ok: true,
    version: STORE_NOTIFY_VERSION,

    globalListeners: globalCount,
    keyListeners: keyCount,
    selectorListeners: selectorCount,
    totalListeners: globalCount + keyCount + selectorCount,

    changedPaths: finalPayload.changedPaths,
    timestamp: finalPayload.timestamp,
    durationMs: Math.max(0, now() - startedAt),
  };

  emitNotifyDiagnostics(AppCore, result, options);

  return result;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function buildNotifySnapshot({
  listeners,
  keyListeners,
  selectorListeners,
} = {}) {
  const keyMap = toMap(keyListeners);

  return {
    version: STORE_NOTIFY_VERSION,

    globalListeners: toSet(listeners).size,

    keyListenerPaths: Array
      .from(keyMap.keys())
      .map(pathString)
      .filter(Boolean),

    keyListenerCount: Array
      .from(keyMap.values())
      .reduce((total, bucket) => total + toSet(bucket).size, 0),

    selectorListeners: toSet(selectorListeners).size,

    at: iso(),
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
