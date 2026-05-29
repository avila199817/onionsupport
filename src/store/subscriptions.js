/* =========================================================
   Onion Support - Store Subscriptions
   Archivo: /src/store/subscriptions.js

   Responsabilidad:
   - Compat mínima de suscripciones.
   - Global / key / selector.
   - immediate / once básicos.
   - Sin imports.
   - Sin metadata pesada.
   - Sin eventos AppCore.
   - Sin Router.
   - Sin HTTP.
   - Sin Auth/session.
   - Sin magia negra.
========================================================= */

export const STORE_SUBSCRIPTIONS_VERSION = "simple";

const ROOT_KEYS = Object.freeze([
  "ui",
  "app",
  "entities",
  "flags",
  "meta",
]);

const ROOT_KEY_SET = new Set(ROOT_KEYS);

const BLOCKED_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

const SENSITIVE_KEY_RE =
  /(^auth$|^session$|^sessionData$|^currentUser$|^authUser$|^sessionUser$|^user$|token|authorization|cookie|password|passwd|pwd|secret|credential|jwt|bearer|refresh|accessToken|access_token|idToken|id_token|apiKey|api_key|privateKey|private_key|connectionString|connection_string|sas|otp|totp|mfa|twofa|2fa|backupCode|backup_code|backupCodes|backup_codes|sessionId|session_id|^role$|^roles$|^permissions$|^_rid$|^_self$|^_etag$|^_attachments$|^_ts$)/i;

/* =========================================================
   BASICS
========================================================= */

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
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

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function normalizeKey(value = "") {
  return String(value ?? "").trim();
}

function isBlockedKey(key = "") {
  return BLOCKED_KEYS.has(normalizeKey(key));
}

function isSensitiveKey(key = "") {
  return SENSITIVE_KEY_RE.test(normalizeKey(key));
}

function isRootKey(key = "") {
  return ROOT_KEY_SET.has(normalizeKey(key));
}

function safeClone(value, key = "", rootLevel = false) {
  if (isBlockedKey(key)) return undefined;

  if (isSensitiveKey(key)) {
    return value ? "***" : null;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => safeClone(item))
      .filter((item) => item !== undefined);
  }

  if (isObject(value)) {
    const output = {};

    for (const [childKey, childValue] of Object.entries(value)) {
      if (isBlockedKey(childKey)) continue;
      if (rootLevel && !isRootKey(childKey)) continue;

      const clean = safeClone(childValue, childKey, false);

      if (clean !== undefined) {
        output[childKey] = clean;
      }
    }

    return output;
  }

  if (typeof value === "string") {
    return text(value, "")
      .replace(/([?&#](?:token|access_token|accessToken|refresh_token|refreshToken|id_token|idToken|code|session|sessionId)=)([^&#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(
        /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        "***"
      );
  }

  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return clone(value);
  }

  return undefined;
}

function normalizePath(path = "") {
  const source = Array.isArray(path)
    ? path
    : text(path, "")
        .replace(/\[(["'`]?)(.*?)\1\]/g, ".$2")
        .split(".");

  const parts = source
    .map((part) => normalizeKey(part))
    .filter(Boolean);

  if (!parts.length) return [];
  if (!isRootKey(parts[0])) return [];
  if (parts.some(isBlockedKey)) return [];
  if (parts.some(isSensitiveKey)) return [];

  return parts;
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
    const value = snapshot();
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

function buildPayload({
  snapshot,
  path = "",
  value = undefined,
  previousValue = undefined,
} = {}) {
  return {
    version: STORE_SUBSCRIPTIONS_VERSION,
    state: safeClone(snapshotValue(snapshot), "", true) || {},
    path: pathString(path) || "",
    value: safeClone(value),
    previousValue: safeClone(previousValue),
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
  if (
    !listeners ||
    !isFunction(listeners.add) ||
    !isFunction(listeners.delete)
  ) {
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

  if (
    !keyListeners ||
    !isFunction(keyListeners.has) ||
    !isFunction(keyListeners.set) ||
    !isFunction(keyListeners.get) ||
    !isFunction(keyListeners.delete)
  ) {
    return noop;
  }

  if (!keyListeners.has(watchedPath)) {
    keyListeners.set(watchedPath, new Set());
  }

  const bucket = keyListeners.get(watchedPath);

  if (!(bucket instanceof Set)) {
    return noop;
  }

  const once = options?.once === true;
  const immediate = options?.immediate === true;

  let active = true;

  const entry = {
    path: watchedPath,
    listener,
    once,
  };

  bucket.add(entry);

  function unsubscribe() {
    if (!active) return false;

    active = false;
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
      listener(
        buildPayload({
          snapshot,
          path: watchedPath,
          value,
          previousValue: undefined,
        })
      );
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
  if (
    !selectorListeners ||
    !isFunction(selectorListeners.add) ||
    !isFunction(selectorListeners.delete)
  ) {
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
    initialValue = selector(safeClone(sourceState, "", true) || {});
  } catch {
    initialValue = undefined;
  }

  let active = true;

  const entry = {
    selector,
    listener,
    once: options?.once === true,
    lastValue: safeClone(initialValue),
  };

  selectorListeners.add(entry);

  function unsubscribe() {
    if (!active) return false;

    active = false;
    selectorListeners.delete(entry);

    return true;
  }

  if (options?.immediate === true) {
    try {
      listener(
        buildPayload({
          snapshot,
          value: initialValue,
          previousValue: undefined,
        })
      );
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
    ? [...keyListeners.keys()]
        .map(pathString)
        .filter(Boolean)
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
