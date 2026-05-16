/* =========================================================
   Onion SPA - Store Subscriptions
   Archivo: src/store/subscriptions.js

   STORE SUBSCRIPTIONS · SIMPLE
   - global / key / selector subscriptions
   - unsubscribe idempotente
   - immediate / once
   - selector equality custom
   - dedupe simple
   - errores aislados
   - diagnóstico opcional
========================================================= */

import {
  deepClone,
  deepEqual,
  getByPath,
  isFunction,
  normalizePath,
  safeBool,
  safeObject,
  safeText,
} from "./helpers.js";

export const STORE_SUBSCRIPTIONS_VERSION = "16.0.0-simple";

const EVENTS = Object.freeze({
  add: "store:subscription:add",
  remove: "store:subscription:remove",
  duplicate: "store:subscription:duplicate",
  immediate: "store:subscription:immediate",
  error: "store:subscription:error",
});

const DEFAULT_SCOPE = "store:subscriptions";

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

const TOKENISH_TEXT_RE =
  /(bearer\s+[a-z0-9._~+/=-]+)|([a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)|([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|tempToken|temp_token|code|t)=)[^&#\s]+/gi;

const functionIds = new WeakMap();

let nextFunctionId = 1;
let nextSubscriptionId = 1;

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

function getFunctionId(fn) {
  if (!isFunction(fn)) return "fn:none";

  try {
    if (!functionIds.has(fn)) functionIds.set(fn, nextFunctionId++);
    return `fn:${functionIds.get(fn)}`;
  } catch {
    return "fn:unknown";
  }
}

function createSubscriptionId(prefix = "sub") {
  const id = `${prefix}_${nextSubscriptionId}`;
  nextSubscriptionId += 1;
  return id;
}

function clone(value, fallback = null) {
  if (value === undefined) return fallback;
  if (value === null) return null;

  try {
    return deepClone(value);
  } catch {}

  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback === null ? value : fallback;
  }
}

function freeze(value) {
  try {
    return Object.freeze(value);
  } catch {
    return value;
  }
}

function noopUnsubscribe() {
  const fn = () => false;

  try {
    fn.__storeUnsubscribeNoop = true;
  } catch {}

  return fn;
}

function pathString(path = "") {
  try {
    const parts = normalizePath(path);
    return Array.isArray(parts) ? parts.join(".") : safeText(parts, "");
  } catch {
    return "";
  }
}

function snapshotValue(snapshot) {
  if (!isFunction(snapshot)) return null;

  try {
    return snapshot();
  } catch {
    return null;
  }
}

function shallowState({ shallowCloneRoot, state }) {
  try {
    if (isFunction(shallowCloneRoot)) return shallowCloneRoot(state);
  } catch {}

  return clone(state, {}) || {};
}

/* =========================================================
   REDACTION / DIAGNOSTICS
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
    message: redactText(safeText(error?.message || error, "Store subscription error.")),
    code: safeText(error?.code || error?.statusCode || "", "") || null,
    status: error?.status || null,
    stack: error?.stack ? "[stack]" : null,
  };
}

function sanitizePayload(value, depth = 0, keyHint = "", seen = new WeakSet()) {
  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) return value ? "***" : null;
  if (depth > 4) return "[depth-limit]";
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return redactText(value);
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";
  if (value instanceof Error) return sanitizeError(value);

  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) => sanitizePayload(item, depth + 1, keyHint, seen));
  }

  if (value && typeof value === "object") {
    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      output[key] = sanitizePayload(item, depth + 1, key, seen);
    }

    return output;
  }

  try {
    return redactText(String(value));
  } catch {
    return "[unserializable]";
  }
}

function shouldEmitDiagnostics(AppCore, options = {}) {
  if (options.emitDiagnostics === true || options.emitSubscriptionEvents === true) return true;

  try {
    return Boolean(AppCore?.config?.diagnostics?.storeSubscriptions || AppCore?.config?.diagnostics?.storeEvents);
  } catch {
    return false;
  }
}

function emit(AppCore, eventName, payload = {}, options = {}) {
  if (!shouldEmitDiagnostics(AppCore, options)) return false;

  const name = safeText(eventName, "");
  if (!name) return false;

  try {
    AppCore?.events?.emit?.(name, sanitizePayload(payload));
    return true;
  } catch {
    return false;
  }
}

function reportError(AppCore, label, error, extra = {}, options = {}) {
  const payload = {
    ok: false,
    scope: DEFAULT_SCOPE,
    label: safeText(label, "Store subscription error"),
    type: safeText(extra.type, ""),
    path: pathString(extra.path || ""),
    id: safeText(extra.id, ""),
    async: Boolean(extra.async),
    error: sanitizeError(error),
    at: iso(),
  };

  try {
    AppCore?.utils?.error?.(payload.label, error, payload);
  } catch {}

  try {
    if (AppCore?.config?.debug) console.error(payload.label, error, payload);
  } catch {}

  emit(AppCore, EVENTS.error, payload, {
    ...options,
    emitDiagnostics: true,
  });

  return payload;
}

function runSafely(AppCore, label, fn, fallback = undefined, extra = {}, options = {}) {
  try {
    if (!isFunction(fn)) return fallback;

    const result = fn();

    if (result && typeof result === "object" && isFunction(result.catch)) {
      result.catch((error) => {
        reportError(
          AppCore,
          label,
          error,
          {
            ...extra,
            async: true,
          },
          options
        );
      });
    }

    return result;
  } catch (error) {
    reportError(
      AppCore,
      label,
      error,
      {
        ...extra,
        async: false,
      },
      options
    );

    return fallback;
  }
}

/* =========================================================
   OPTIONS / META
========================================================= */

function normalizeOptions(options = {}) {
  const opts = safeObject(options);

  return {
    immediate: Boolean(opts.immediate === true || opts.fireImmediately === true || opts.emitCurrent === true),
    once: Boolean(opts.once),

    label: safeText(opts.label, ""),
    name: safeText(opts.name, ""),

    equalityFn: isFunction(opts.equalityFn)
      ? opts.equalityFn
      : isFunction(opts.compare)
        ? opts.compare
        : null,

    AppCore: opts.AppCore || null,
    snapshot: isFunction(opts.snapshot) ? opts.snapshot : null,
    get: isFunction(opts.get) ? opts.get : null,

    emitDiagnostics: Boolean(opts.emitDiagnostics === true || opts.emitSubscriptionEvents === true),
    cleanupInvalid: safeBool(opts.cleanupInvalid, false),
    meta: safeObject(opts.meta, null),
  };
}

function createMeta({
  id,
  type,
  path = "",
  label = "",
  name = "",
  listener = null,
  selector = null,
  once = false,
  immediate = false,
  meta = null,
} = {}) {
  const createdAtMs = now();

  return {
    id: safeText(id, ""),
    type: safeText(type, ""),
    path: pathString(path),
    label: safeText(label, ""),
    name: safeText(name, ""),
    once: Boolean(once),
    immediate: Boolean(immediate),

    listenerId: getFunctionId(listener),
    selectorId: selector ? getFunctionId(selector) : "",

    active: true,
    meta: meta ? clone(meta, null) : null,

    createdAt: iso(createdAtMs),
    createdAtMs,

    unsubscribedAt: "",
    unsubscribedAtMs: 0,
  };
}

function markInactive(meta, reason = "unsubscribe") {
  const stamp = now();

  meta.active = false;
  meta.unsubscribedAtMs = stamp;
  meta.unsubscribedAt = iso(stamp);
  meta.unsubscribeReason = safeText(reason, "unsubscribe");

  return meta;
}

function emitAdd(AppCore, meta, options) {
  emit(AppCore, EVENTS.add, { subscription: meta }, options);
}

function emitRemove(AppCore, meta, reason, options) {
  emit(
    AppCore,
    EVENTS.remove,
    {
      subscription: {
        ...meta,
        active: false,
      },
      reason: safeText(reason, "unsubscribe"),
    },
    options
  );
}

function emitDuplicate(AppCore, meta, options) {
  emit(AppCore, EVENTS.duplicate, { subscription: meta }, options);
}

function emitImmediate(AppCore, meta, options) {
  emit(AppCore, EVENTS.immediate, { subscription: meta }, options);
}

/* =========================================================
   PAYLOAD
========================================================= */

function buildBasePayload({ snapshot, changedPaths = [], previousState = null } = {}) {
  const timestamp = now();

  return freeze({
    state: clone(snapshotValue(snapshot), {}),
    previousState: previousState ? clone(previousState, null) : null,
    changedPaths: [...new Set((Array.isArray(changedPaths) ? changedPaths : []).map(pathString).filter(Boolean))],
    timestamp,
    timestampIso: iso(timestamp),
  });
}

function buildListenerPayload(payload = {}, extra = {}) {
  const source = safeObject(payload);

  return freeze({
    ...clone(source, {}),
    ...clone(extra, {}),
    state: clone(source.state, {}),
    previousState: source.previousState ? clone(source.previousState, null) : null,
    changedPaths: Array.isArray(source.changedPaths) ? [...source.changedPaths] : [],
  });
}

function callListener({
  AppCore,
  listener,
  payload,
  label = "Store listener error",
  once = false,
  unsubscribe = null,
  type = "",
  id = "",
  path = "",
  options = {},
} = {}) {
  const result = runSafely(
    AppCore,
    label,
    () => listener(payload),
    undefined,
    {
      type,
      id,
      path,
    },
    options
  );

  if (once && isFunction(unsubscribe)) {
    try {
      unsubscribe("once");
    } catch {}
  }

  return result;
}

/* =========================================================
   DEDUPE
========================================================= */

function findExistingGlobal(listeners, listener, options = {}) {
  const listenerId = getFunctionId(listener);
  const label = safeText(options.label, "");
  const once = Boolean(options.once);

  for (const item of Array.from(listeners || [])) {
    if (
      item?.__storeSubscriptionType === "global" &&
      item?.__storeListenerId === listenerId &&
      item?.__storeLabel === label &&
      item?.__storeOnce === once
    ) {
      return item;
    }
  }

  return null;
}

function findExistingKey(bucket, listener, options = {}) {
  const listenerId = getFunctionId(listener);
  const label = safeText(options.label, "");
  const once = Boolean(options.once);

  for (const item of Array.from(bucket || [])) {
    if (
      item?.__storeSubscriptionType === "key" &&
      item?.listenerId === listenerId &&
      item?.label === label &&
      item?.once === once
    ) {
      return item;
    }
  }

  return null;
}

function findExistingSelector(bucket, selector, listener, options = {}) {
  const selectorId = getFunctionId(selector);
  const listenerId = getFunctionId(listener);
  const label = safeText(options.label, "");
  const once = Boolean(options.once);

  for (const item of Array.from(bucket || [])) {
    if (
      item?.__storeSubscriptionType === "selector" &&
      item?.selectorId === selectorId &&
      item?.listenerId === listenerId &&
      item?.label === label &&
      item?.once === once
    ) {
      return item;
    }
  }

  return null;
}

/* =========================================================
   GLOBAL
========================================================= */

export function subscribe(listeners, listener, options = {}) {
  const opts = normalizeOptions(options);
  const AppCore = opts.AppCore || null;

  if (!listeners || !isFunction(listeners.add) || !isFunction(listeners.delete)) {
    reportError(
      AppCore,
      "Store subscribe requiere un Set válido.",
      new Error("INVALID_LISTENERS_SET"),
      { type: "global" },
      opts
    );

    return noopUnsubscribe();
  }

  if (!isFunction(listener)) {
    reportError(
      AppCore,
      "Store subscribe requiere listener function.",
      new Error("INVALID_LISTENER"),
      { type: "global" },
      opts
    );

    return noopUnsubscribe();
  }

  const existing = findExistingGlobal(listeners, listener, opts);

  if (existing?.__storeUnsubscribe) {
    emitDuplicate(AppCore, existing.__storeSubscriptionMeta || {}, opts);
    return existing.__storeUnsubscribe;
  }

  const id = createSubscriptionId("global");
  const meta = createMeta({
    id,
    type: "global",
    label: opts.label,
    name: opts.name,
    once: opts.once,
    immediate: opts.immediate,
    listener,
    meta: opts.meta,
  });

  let active = true;

  function unsubscribe(reason = "unsubscribe") {
    if (!active) return false;

    active = false;
    markInactive(meta, reason);

    try {
      listeners.delete(wrappedListener);
    } catch {}

    emitRemove(AppCore, meta, reason, opts);
    return true;
  }

  function wrappedListener(payload = {}) {
    if (!active) return undefined;

    return callListener({
      AppCore,
      listener,
      once: opts.once,
      unsubscribe,
      type: "global",
      id,
      label: opts.label || "Store global listener error",
      options: opts,
      payload: buildListenerPayload(payload, {
        listenerType: "global",
        subscription: meta,
      }),
    });
  }

  try {
    wrappedListener.__storeSubscriptionType = "global";
    wrappedListener.__storeListenerId = getFunctionId(listener);
    wrappedListener.__storeOriginal = listener;
    wrappedListener.__storeLabel = opts.label;
    wrappedListener.__storeOnce = opts.once;
    wrappedListener.__storeSubscriptionMeta = meta;
    wrappedListener.__storeUnsubscribe = unsubscribe;
  } catch {}

  try {
    listeners.add(wrappedListener);
  } catch {
    return noopUnsubscribe();
  }

  emitAdd(AppCore, meta, opts);

  if (opts.immediate && opts.snapshot) {
    emitImmediate(AppCore, meta, opts);

    callListener({
      AppCore,
      listener,
      once: opts.once,
      unsubscribe,
      type: "global",
      id,
      label: opts.label || "Store global immediate listener error",
      options: opts,
      payload: buildListenerPayload(
        buildBasePayload({
          snapshot: opts.snapshot,
          changedPaths: [],
          previousState: null,
        }),
        {
          listenerType: "global",
          immediate: true,
          subscription: meta,
        }
      ),
    });
  }

  return unsubscribe;
}

/* =========================================================
   KEY / PATH
========================================================= */

export function subscribeKey({ AppCore, keyListeners, path, listener, get, snapshot, options = {} } = {}) {
  const opts = normalizeOptions(options);
  const watchedPath = pathString(path);

  if (!watchedPath || !isFunction(listener)) {
    reportError(
      AppCore,
      "subscribeKey requiere path y listener.",
      new Error("INVALID_KEY_SUBSCRIPTION"),
      { type: "key", path: watchedPath },
      opts
    );

    return noopUnsubscribe();
  }

  if (!keyListeners || !isFunction(keyListeners.has) || !isFunction(keyListeners.set) || !isFunction(keyListeners.get) || !isFunction(keyListeners.delete)) {
    reportError(
      AppCore,
      "subscribeKey requiere keyListeners Map válido.",
      new Error("INVALID_KEY_LISTENERS_MAP"),
      { type: "key", path: watchedPath },
      opts
    );

    return noopUnsubscribe();
  }

  if (!isFunction(get) || !isFunction(snapshot)) {
    reportError(
      AppCore,
      "subscribeKey requiere get() y snapshot().",
      new Error("INVALID_KEY_DEPS"),
      { type: "key", path: watchedPath },
      opts
    );

    return noopUnsubscribe();
  }

  if (!keyListeners.has(watchedPath)) keyListeners.set(watchedPath, new Set());

  const bucket = keyListeners.get(watchedPath);
  const existing = findExistingKey(bucket, listener, opts);

  if (existing?.unsubscribe) {
    emitDuplicate(AppCore, existing.meta || {}, opts);
    return existing.unsubscribe;
  }

  const id = createSubscriptionId("key");
  const meta = createMeta({
    id,
    type: "key",
    path: watchedPath,
    label: opts.label,
    name: opts.name,
    once: opts.once,
    immediate: opts.immediate,
    listener,
    meta: opts.meta,
  });

  let active = true;

  function unsubscribe(reason = "unsubscribe") {
    if (!active) return false;

    active = false;
    markInactive(meta, reason);

    try {
      entry.active = false;
    } catch {}

    const currentBucket = keyListeners.get(watchedPath);

    if (currentBucket) {
      try {
        currentBucket.delete(entry);
      } catch {}

      if (currentBucket.size === 0) {
        try {
          keyListeners.delete(watchedPath);
        } catch {}
      }
    }

    emitRemove(AppCore, meta, reason, opts);
    return true;
  }

  const entry = {
    __storeSubscriptionType: "key",
    id,
    type: "key",
    path: watchedPath,
    listener,
    listenerId: getFunctionId(listener),
    label: opts.label,
    name: opts.name,
    once: opts.once,
    active: true,
    meta,
    unsubscribe,
    createdAt: meta.createdAt,
    createdAtMs: meta.createdAtMs,
  };

  try {
    bucket.add(entry);
  } catch {
    return noopUnsubscribe();
  }

  emitAdd(AppCore, meta, opts);

  if (opts.immediate) {
    emitImmediate(AppCore, meta, opts);

    callListener({
      AppCore,
      listener,
      once: opts.once,
      unsubscribe,
      type: "key",
      id,
      path: watchedPath,
      label: opts.label || `Store key immediate listener error (${watchedPath})`,
      options: opts,
      payload: buildListenerPayload(
        buildBasePayload({
          snapshot,
          changedPaths: [watchedPath],
          previousState: null,
        }),
        {
          listenerType: "key",
          immediate: true,
          path: watchedPath,
          value: clone(get(watchedPath), undefined),
          previousValue: undefined,
          matchedPaths: [watchedPath],
          subscription: meta,
        }
      ),
    });
  }

  return unsubscribe;
}

/* =========================================================
   SELECTOR
========================================================= */

function computeSelectorValue({ AppCore, selector, shallowCloneRoot, state, label = "Store selector error", options = {} } = {}) {
  return runSafely(
    AppCore,
    label,
    () => selector(shallowState({ shallowCloneRoot, state })),
    undefined,
    { type: "selector" },
    options
  );
}

function valuesEqual(previousValue, nextValue, equalityFn = null) {
  if (isFunction(equalityFn)) {
    try {
      return Boolean(equalityFn(previousValue, nextValue));
    } catch {
      return false;
    }
  }

  try {
    return deepEqual(previousValue, nextValue);
  } catch {
    return Object.is(previousValue, nextValue);
  }
}

export function subscribeSelector({
  AppCore,
  selectorListeners,
  selector,
  listener,
  snapshot,
  shallowCloneRoot,
  state,
  options = {},
} = {}) {
  const opts = normalizeOptions(options);

  if (!isFunction(selector) || !isFunction(listener)) {
    reportError(
      AppCore,
      "subscribeSelector requiere selector y listener.",
      new Error("INVALID_SELECTOR_SUBSCRIPTION"),
      { type: "selector" },
      opts
    );

    return noopUnsubscribe();
  }

  if (!selectorListeners || !isFunction(selectorListeners.add) || !isFunction(selectorListeners.delete)) {
    reportError(
      AppCore,
      "subscribeSelector requiere selectorListeners Set válido.",
      new Error("INVALID_SELECTOR_LISTENERS_SET"),
      { type: "selector" },
      opts
    );

    return noopUnsubscribe();
  }

  if (!isFunction(snapshot) || !isFunction(shallowCloneRoot)) {
    reportError(
      AppCore,
      "subscribeSelector requiere snapshot() y shallowCloneRoot().",
      new Error("INVALID_SELECTOR_DEPS"),
      { type: "selector" },
      opts
    );

    return noopUnsubscribe();
  }

  const existing = findExistingSelector(selectorListeners, selector, listener, opts);

  if (existing?.unsubscribe) {
    emitDuplicate(AppCore, existing.meta || {}, opts);
    return existing.unsubscribe;
  }

  const id = createSubscriptionId("selector");

  const meta = createMeta({
    id,
    type: "selector",
    label: opts.label,
    name: opts.name || selector.name || "",
    once: opts.once,
    immediate: opts.immediate,
    listener,
    selector,
    meta: opts.meta,
  });

  const initialValue = computeSelectorValue({
    AppCore,
    selector,
    shallowCloneRoot,
    state,
    label: opts.label || "Store selector initial error",
    options: opts,
  });

  let active = true;

  function unsubscribe(reason = "unsubscribe") {
    if (!active) return false;

    active = false;
    markInactive(meta, reason);

    try {
      entry.active = false;
      selectorListeners.delete(entry);
    } catch {}

    emitRemove(AppCore, meta, reason, opts);
    return true;
  }

  const entry = {
    __storeSubscriptionType: "selector",
    id,
    type: "selector",

    selector,
    listener,

    selectorId: getFunctionId(selector),
    listenerId: getFunctionId(listener),

    equalityFn: opts.equalityFn,
    compare: opts.equalityFn,

    label: opts.label,
    name: opts.name || selector.name || "",

    once: opts.once,
    active: true,

    lastValue: clone(initialValue, initialValue),

    meta,
    unsubscribe,

    createdAt: meta.createdAt,
    createdAtMs: meta.createdAtMs,
  };

  try {
    selectorListeners.add(entry);
  } catch {
    return noopUnsubscribe();
  }

  emitAdd(AppCore, meta, opts);

  if (opts.immediate) {
    emitImmediate(AppCore, meta, opts);

    callListener({
      AppCore,
      listener,
      once: opts.once,
      unsubscribe,
      type: "selector",
      id,
      label: opts.label || "Store selector immediate listener error",
      options: opts,
      payload: buildListenerPayload(
        buildBasePayload({
          snapshot,
          changedPaths: [],
          previousState: null,
        }),
        {
          listenerType: "selector",
          immediate: true,
          value: clone(entry.lastValue, entry.lastValue),
          previousValue: undefined,
          selectorName: meta.name || null,
          subscription: meta,
        }
      ),
    });
  }

  return unsubscribe;
}

/* =========================================================
   NOTIFY HELPER
========================================================= */

export function shouldNotifySelectorEntry(entry, nextValue) {
  if (!entry || entry.active === false) return false;

  return !valuesEqual(
    entry.lastValue,
    nextValue,
    entry.equalityFn || entry.compare || null
  );
}

/* =========================================================
   SNAPSHOT
========================================================= */

function globalEntries(listeners) {
  return Array
    .from(listeners || [])
    .filter((item) => item?.__storeSubscriptionType === "global")
    .map((item) => ({
      ...(item.__storeSubscriptionMeta || {}),
      active: true,
    }));
}

function keyEntries(keyListeners) {
  const output = [];

  try {
    for (const [path, bucket] of keyListeners.entries()) {
      for (const entry of Array.from(bucket || [])) {
        output.push({
          id: entry.id || "",
          type: "key",
          path: pathString(path),
          label: entry.label || "",
          name: entry.name || "",
          once: Boolean(entry.once),
          active: entry.active !== false,
          createdAt: entry.createdAt || "",
          createdAtMs: entry.createdAtMs || 0,
        });
      }
    }
  } catch {}

  return output;
}

function selectorEntries(selectorListeners) {
  return Array
    .from(selectorListeners || [])
    .map((entry) => ({
      id: entry.id || "",
      type: "selector",
      label: entry.label || "",
      name: entry.name || "",
      selectorName: safeText(entry.selector?.name, ""),
      once: Boolean(entry.once),
      active: entry.active !== false,
      hasLastValue: entry.lastValue !== undefined,
      createdAt: entry.createdAt || "",
      createdAtMs: entry.createdAtMs || 0,
    }));
}

export function getSubscriptionsSnapshot({ listeners, keyListeners, selectorListeners } = {}) {
  const global = globalEntries(listeners);
  const key = keyEntries(keyListeners || new Map());
  const selector = selectorEntries(selectorListeners || new Set());

  return {
    version: STORE_SUBSCRIPTIONS_VERSION,

    counts: {
      global: global.length,
      key: key.length,
      selector: selector.length,
      total: global.length + key.length + selector.length,
    },

    global,
    key,
    selector,

    at: iso(),
  };
}

export default {
  STORE_SUBSCRIPTIONS_VERSION,
  subscribe,
  subscribeKey,
  subscribeSelector,
  shouldNotifySelectorEntry,
  getSubscriptionsSnapshot,
};
