/* =========================================================
   Onion Support - Store Notify
   Archivo: /src/store/notify.js

   Responsabilidad:
   - Compat mínima de notificación.
   - Sin imports.
   - Sin diagnósticos pesados.
   - Sin event storm.
   - Sin duplicar Store.
   - Sin duplicar Toast.
   - Sin eventos AppCore.
   - Sin Router.
   - Sin HTTP.
   - Sin Auth/session.
   - Sin lógica rara.
========================================================= */

export const STORE_NOTIFY_VERSION = "simple";

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

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
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

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
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

function redact(value = "") {
  return text(value, "")
    .replace(
      /([?&#](?:token|access_token|accessToken|refresh_token|refreshToken|id_token|idToken|code|session|sessionId)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
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
    return redact(value);
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

function toArray(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];

  return [value];
}

function toSet(value) {
  if (value instanceof Set) return value;
  return new Set(toArray(value));
}

function toMap(value) {
  if (value instanceof Map) return value;
  if (isObject(value)) return new Map(Object.entries(value));

  return new Map();
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

function uniquePaths(paths = []) {
  const output = [];
  const seen = new Set();

  for (const item of toArray(paths)) {
    const path = pathString(item);

    if (!path || seen.has(path)) continue;

    seen.add(path);
    output.push(path);
  }

  return output;
}

/**
 * Matching bidireccional:
 * - watched: ui          + changed: ui.theme => true
 * - watched: ui.theme    + changed: ui       => true
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

function equal(left, right) {
  if (Object.is(left, right)) return true;

  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function snapshotValue(snapshot) {
  if (isFunction(snapshot)) {
    try {
      const value = snapshot();
      return isObject(value) ? value : {};
    } catch {
      return {};
    }
  }

  return isObject(snapshot) ? snapshot : {};
}

/* =========================================================
   PAYLOAD
========================================================= */

export function buildPayload(snapshot, changedPaths = [], previousState = null) {
  const timestamp = Date.now();

  return {
    version: STORE_NOTIFY_VERSION,
    state: safeClone(snapshotValue(snapshot), "", true) || {},
    previousState: previousState
      ? safeClone(previousState, "", true) || null
      : null,
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
    version: text(source.version, STORE_NOTIFY_VERSION),
    state: safeClone(source.state ?? snapshotValue(snapshot), "", true) || {},
    previousState: source.previousState
      ? safeClone(source.previousState, "", true) || null
      : null,
    changedPaths: uniquePaths(source.changedPaths),
    timestamp: Number(source.timestamp || Date.now()),
    timestampIso: text(source.timestampIso, nowIso()),
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
          value: safeClone(value),
          previousValue: safeClone(previousValue),
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

    if (bucket.size === 0 && map === keyListeners) {
      try {
        map.delete(rawPath);
      } catch {
        // noop
      }
    }
  }

  return notified;
}

/* =========================================================
   SELECTOR LISTENERS
========================================================= */

export function notifySelectorListeners({
  selectorListeners,
  state,
  payload,
} = {}) {
  const bucket = toSet(selectorListeners);

  if (!bucket.size) return 0;

  let notified = 0;
  const currentState = safeClone(state || payload?.state || {}, "", true) || {};

  for (const entry of [...bucket]) {
    if (!entry || !isFunction(entry.selector)) continue;

    const listener =
      entry.listener ||
      entry.callback ||
      entry.handler;

    if (!isFunction(listener)) continue;

    let nextValue;

    try {
      nextValue = safeClone(entry.selector(currentState));
    } catch {
      continue;
    }

    const previousValue = safeClone(entry.lastValue ?? entry.last);
    const changed = !equal(nextValue, previousValue);

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
        value: safeClone(nextValue),
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

export function buildNotifySnapshot({
  listeners,
  keyListeners,
  selectorListeners,
} = {}) {
  const keyMap = toMap(keyListeners);

  let keyListenerCount = 0;

  for (const bucket of keyMap.values()) {
    keyListenerCount += toSet(bucket).size;
  }

  return {
    version: STORE_NOTIFY_VERSION,
    globalListeners: toSet(listeners).size,
    keyListenerPaths: [...keyMap.keys()]
      .map(pathString)
      .filter(Boolean),
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
