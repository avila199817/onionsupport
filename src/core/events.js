/* =========================================================
   Onion Support - Core Events
   Archivo: /src/core/events.js

   Responsabilidad:
   - Event bus mínimo.
   - Sin imports.
   - Sin DOM obligatorio.
   - Sin firebreak.
   - Sin rate limits.
   - Sin snapshots grandes.
   - Sin lógica rara.
========================================================= */

export const EVENTS_VERSION = "simple";
export const WILDCARD_EVENT = "*";

function isFunction(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function noop() {
  return false;
}

function eventObject(name = "", payload = {}) {
  return {
    type: name,
    detail: payload,
    payload,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {},
    stopImmediatePropagation() {},
  };
}

export function createEvents() {
  const listeners = new Map();
  let emitCount = 0;

  function bucket(name = "") {
    const eventName = text(name, "");

    if (!eventName) return null;

    if (!listeners.has(eventName)) {
      listeners.set(eventName, new Set());
    }

    return listeners.get(eventName);
  }

  function on(name = "", handler = null) {
    const eventName = text(name, "");

    if (!eventName || !isFunction(handler)) {
      return noop;
    }

    const set = bucket(eventName);
    set.add(handler);

    return () => off(eventName, handler);
  }

  function once(name = "", handler = null) {
    const eventName = text(name, "");

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
    const eventName = text(name, "");

    if (!eventName) return false;

    if (!handler) {
      return listeners.delete(eventName);
    }

    return Boolean(listeners.get(eventName)?.delete(handler));
  }

  function emit(name = "", payload = {}) {
    const eventName = text(name, "");

    if (!eventName) return false;

    emitCount += 1;

    const event = eventObject(eventName, payload);

    for (const handler of [...(listeners.get(eventName) || [])]) {
      try {
        handler(event);
      } catch {
        // Un listener no debe romper el bus.
      }
    }

    if (eventName !== WILDCARD_EVENT) {
      for (const handler of [...(listeners.get(WILDCARD_EVENT) || [])]) {
        try {
          handler(eventName, payload, event);
        } catch {
          // Un wildcard listener no debe romper el bus.
        }
      }
    }

    return true;
  }

  function clear(name = "") {
    const eventName = text(name, "");

    if (eventName) {
      listeners.delete(eventName);
    } else {
      listeners.clear();
    }

    return true;
  }

  function listenerCount(name = "") {
    const eventName = text(name, "");

    if (eventName) {
      return listeners.get(eventName)?.size || 0;
    }

    let count = 0;

    for (const set of listeners.values()) {
      count += set.size;
    }

    return count;
  }

  function names() {
    return [...listeners.keys()];
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

    listenerCount,
    names,
    eventNames: names,

    getSnapshot,
    getDebugSnapshot: getSnapshot,
    snapshot: getSnapshot,

    reset,
  };
}

export default {
  EVENTS_VERSION,
  WILDCARD_EVENT,
  createEvents,
};
