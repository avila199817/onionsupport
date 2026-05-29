/* =========================================================
   Onion Support - Core Events
   Archivo: /src/core/events.js

   Responsabilidad:
   - Event bus mínimo canónico.
   - Sin imports.
   - Sin DOM obligatorio.
   - Sin storage.
   - Sin rate limits.
   - Sin snapshots grandes.
   - Sin lógica de dominio.
   - Sin window.dispatchEvent.
   - Un listener no rompe el bus.
========================================================= */

export const EVENTS_VERSION = "core.events.v3";
export const WILDCARD_EVENT = "*";

const RESERVED_EVENT_FIELDS = new Set([
  "type",
  "name",
  "detail",
  "payload",

  "defaultPrevented",
  "propagationStopped",
  "immediatePropagationStopped",

  "preventDefault",
  "stopPropagation",
  "stopImmediatePropagation",
]);

const BLOCKED_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

const SENSITIVE_KEY_RE =
  /(^auth$|^session$|^sessionData$|^currentUser$|^authUser$|^sessionUser$|token|authorization|cookie|password|passwd|pwd|secret|credential|jwt|bearer|refresh|accessToken|access_token|idToken|id_token|apiKey|api_key|privateKey|private_key|connectionString|connection_string|sas|otp|totp|mfa|twofa|2fa|backupCode|backup_code|backupCodes|backup_codes|^_rid$|^_self$|^_etag$|^_attachments$|^_ts$)/i;

/* =========================================================
   BASICS
========================================================= */

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPlainObject(value) {
  if (!isObject(value)) return false;

  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function noop() {
  return false;
}

function isBlockedKey(key = "") {
  return BLOCKED_KEYS.has(text(key, ""));
}

function isSensitiveKey(key = "") {
  return SENSITIVE_KEY_RE.test(text(key, ""));
}

function redact(value = "") {
  return text(value, "")
    .replace(
      /([?&#](?:token|access_token|accessToken|refresh_token|refreshToken|id_token|idToken|code|session|sessionId|authorization|secret)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
}

function sanitizePayload(value, keyHint = "", depth = 0) {
  if (isBlockedKey(keyHint)) return undefined;

  if (isSensitiveKey(keyHint)) {
    return value ? "***" : null;
  }

  if (depth > 8) return null;

  if (value === undefined) return undefined;
  if (value === null) return null;

  const valueType = typeof value;

  if (valueType === "string") {
    return redact(value);
  }

  if (
    valueType === "number" ||
    valueType === "boolean" ||
    valueType === "function"
  ) {
    return value;
  }

  if (
    valueType === "symbol" ||
    valueType === "bigint"
  ) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 500)
      .map((item) => sanitizePayload(item, "", depth + 1))
      .filter((item) => item !== undefined);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const output = {};

  for (const [key, child] of Object.entries(value)) {
    if (isBlockedKey(key)) continue;
    if (isSensitiveKey(key)) continue;

    const clean = sanitizePayload(child, key, depth + 1);

    if (clean !== undefined) {
      output[key] = clean;
    }
  }

  return output;
}

function normalizePayload(payload = {}) {
  const clean = sanitizePayload(payload);

  return clean === undefined ? {} : clean;
}

/* =========================================================
   EVENT OBJECT
========================================================= */

function exposePayloadFields(event, payload = {}) {
  if (!isPlainObject(payload)) return event;

  for (const [key, value] of Object.entries(payload)) {
    if (!key) continue;
    if (RESERVED_EVENT_FIELDS.has(key)) continue;
    if (isBlockedKey(key)) continue;

    try {
      event[key] = value;
    } catch {
      // noop
    }
  }

  return event;
}

function createEventObject(name = "", payload = {}) {
  let propagationStopped = false;
  let immediatePropagationStopped = false;
  let defaultPrevented = false;

  const safePayload = normalizePayload(payload);

  const event = {
    type: name,
    name,
    detail: safePayload,
    payload: safePayload,

    get defaultPrevented() {
      return defaultPrevented;
    },

    get propagationStopped() {
      return propagationStopped;
    },

    get immediatePropagationStopped() {
      return immediatePropagationStopped;
    },

    preventDefault() {
      defaultPrevented = true;
    },

    stopPropagation() {
      propagationStopped = true;
    },

    stopImmediatePropagation() {
      propagationStopped = true;
      immediatePropagationStopped = true;
    },
  };

  return exposePayloadFields(event, safePayload);
}

/* =========================================================
   FACTORY
========================================================= */

export function createEvents() {
  const listeners = new Map();

  let emitCount = 0;

  function normalizeName(name = "") {
    const eventName = text(name, "");

    if (!eventName) return "";
    if (eventName.length > 160) return "";
    if (/[\r\n\t]/.test(eventName)) return "";

    return eventName;
  }

  function getBucket(name = "", create = false) {
    const eventName = normalizeName(name);

    if (!eventName) return null;

    if (!listeners.has(eventName) && create) {
      listeners.set(eventName, new Set());
    }

    return listeners.get(eventName) || null;
  }

  function cleanupBucket(name = "") {
    const eventName = normalizeName(name);
    const set = getBucket(eventName);

    if (set && set.size === 0) {
      listeners.delete(eventName);
      return true;
    }

    return false;
  }

  function on(name = "", handler = null) {
    const eventName = normalizeName(name);

    if (!eventName || !isFunction(handler)) {
      return noop;
    }

    const set = getBucket(eventName, true);

    if (!set) return noop;

    set.add(handler);

    let disposed = false;

    return function dispose() {
      if (disposed) return false;

      disposed = true;
      return off(eventName, handler);
    };
  }

  function once(name = "", handler = null) {
    const eventName = normalizeName(name);

    if (!eventName || !isFunction(handler)) {
      return noop;
    }

    let disposed = false;
    let dispose = noop;

    dispose = on(eventName, (...args) => {
      if (disposed) return;

      disposed = true;
      dispose();

      handler(...args);
    });

    return dispose;
  }

  function off(name = "", handler = null) {
    const eventName = normalizeName(name);

    if (!eventName) return false;

    if (!handler) {
      return listeners.delete(eventName);
    }

    const set = getBucket(eventName);

    if (!set) return false;

    const removed = set.delete(handler);

    cleanupBucket(eventName);

    return removed;
  }

  function emit(name = "", payload = {}) {
    const eventName = normalizeName(name);

    if (!eventName) return false;

    emitCount += 1;

    const event = createEventObject(eventName, payload);
    const directHandlers = [...(getBucket(eventName) || [])];

    for (const handler of directHandlers) {
      try {
        handler(event);
      } catch {
        // Un listener no debe romper el bus.
      }

      if (event.immediatePropagationStopped) {
        break;
      }
    }

    if (
      eventName !== WILDCARD_EVENT &&
      !event.propagationStopped
    ) {
      const wildcardHandlers = [...(getBucket(WILDCARD_EVENT) || [])];

      for (const handler of wildcardHandlers) {
        try {
          handler(eventName, event.payload, event);
        } catch {
          // Un wildcard listener no debe romper el bus.
        }

        if (event.immediatePropagationStopped) {
          break;
        }
      }
    }

    return !event.defaultPrevented;
  }

  function clear(name = "") {
    const eventName = normalizeName(name);

    if (eventName) {
      listeners.delete(eventName);
    } else {
      listeners.clear();
    }

    return true;
  }

  function listenerCount(name = "") {
    const eventName = normalizeName(name);

    if (eventName) {
      return getBucket(eventName)?.size || 0;
    }

    let count = 0;

    for (const set of listeners.values()) {
      count += set.size;
    }

    return count;
  }

  function has(name = "") {
    const eventName = normalizeName(name);

    return Boolean(eventName && listenerCount(eventName) > 0);
  }

  function names() {
    return [...listeners.entries()]
      .filter(([, set]) => set.size > 0)
      .map(([name]) => name)
      .sort();
  }

  function getSnapshot() {
    return {
      version: EVENTS_VERSION,
      emitCount,
      listenerCount: listenerCount(),
      eventNames: names(),

      policy: {
        memoryOnly: true,
        noDomRequired: true,
        noStorage: true,
        noWindowDispatch: true,
        noPayloadSnapshots: true,
        listenersIsolated: true,
        wildcardSupported: true,
        eventPayloadFieldsExposed: true,
      },
    };
  }

  function reset() {
    emitCount = 0;
    listeners.clear();

    return getSnapshot();
  }

  return {
    version: EVENTS_VERSION,

    emit,
    dispatch: emit,
    trigger: emit,

    on,
    addEventListener: on,

    off,
    removeEventListener: off,

    once,

    clear,
    removeAllListeners: clear,

    has,

    listenerCount,
    names,
    eventNames: names,

    getSnapshot,
    getDebugSnapshot: getSnapshot,
    snapshot: getSnapshot,

    reset,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  EVENTS_VERSION,
  WILDCARD_EVENT,
  createEvents,
};
