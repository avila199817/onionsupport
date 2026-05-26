/* =========================================================
   Onion Support - Core Events
   Archivo: /src/core/events.js

   Responsabilidad:
   - Event bus mínimo canónico.
   - Sin imports.
   - Sin DOM obligatorio.
   - Sin firebreak.
   - Sin rate limits.
   - Sin snapshots grandes.
   - Sin lógica rara.
   - Un listener no rompe el bus.
========================================================= */

export const EVENTS_VERSION = "core.events.v2";
export const WILDCARD_EVENT = "*";

/* =========================================================
   BASICS
========================================================= */

function isFunction(value) {
  return typeof value === "function";
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

/* =========================================================
   EVENT OBJECT
========================================================= */

function eventObject(name = "", payload = {}) {
  let propagationStopped = false;
  let immediatePropagationStopped = false;

  return {
    type: name,
    detail: payload,
    payload,

    defaultPrevented: false,

    get propagationStopped() {
      return propagationStopped;
    },

    get immediatePropagationStopped() {
      return immediatePropagationStopped;
    },

    preventDefault() {
      this.defaultPrevented = true;
    },

    stopPropagation() {
      propagationStopped = true;
    },

    stopImmediatePropagation() {
      propagationStopped = true;
      immediatePropagationStopped = true;
    },
  };
}

/* =========================================================
   FACTORY
========================================================= */

export function createEvents() {
  const listeners = new Map();

  let emitCount = 0;

  function normalizeName(name = "") {
    return text(name, "");
  }

  function bucket(name = "") {
    const eventName = normalizeName(name);

    if (!eventName) return null;

    if (!listeners.has(eventName)) {
      listeners.set(eventName, new Set());
    }

    return listeners.get(eventName);
  }

  function cleanupBucket(name = "") {
    const eventName = normalizeName(name);

    if (!eventName) return false;

    const set = listeners.get(eventName);

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

    const set = bucket(eventName);

    if (!set) return noop;

    set.add(handler);

    let disposed = false;

    return () => {
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

    const dispose = on(eventName, (...args) => {
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

    const set = listeners.get(eventName);

    if (!set) return false;

    const removed = set.delete(handler);

    cleanupBucket(eventName);

    return removed;
  }

  function emit(name = "", payload = {}) {
    const eventName = normalizeName(name);

    if (!eventName) return false;

    emitCount += 1;

    const event = eventObject(eventName, payload);

    const directHandlers = [...(listeners.get(eventName) || [])];

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
      const wildcardHandlers = [...(listeners.get(WILDCARD_EVENT) || [])];

      for (const handler of wildcardHandlers) {
        try {
          handler(eventName, payload, event);
        } catch {
          // Un wildcard listener no debe romper el bus.
        }

        if (event.immediatePropagationStopped) {
          break;
        }
      }
    }

    return true;
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
      return listeners.get(eventName)?.size || 0;
    }

    let count = 0;

    for (const set of listeners.values()) {
      count += set.size;
    }

    return count;
  }

  function has(name = "") {
    const eventName = normalizeName(name);
    return Boolean(eventName && listeners.has(eventName));
  }

  function names() {
    return [...listeners.entries()]
      .filter(([, set]) => set.size > 0)
      .map(([name]) => name);
  }

  function getSnapshot() {
    return {
      version: EVENTS_VERSION,
      emitCount,
      listenerCount: listenerCount(),
      eventNames: names(),
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
