/* =========================================================
   Onion SPA - Core Events
   Archivo: src/core/events.js

   Responsabilidades:
   - centralizar el event bus del core
   - emitir eventos CustomEvent sobre document
   - registrar listeners persistentes o once
   - desacoplar módulos a través de eventos
   - funcionar con fallback in-memory si no hay DOM
   - exponer snapshot debug del bus

   HARDENING EXTREMO:
   - cero throws accidentales
   - compatible browser/server
   - listeners idempotentes
   - off seguro
   - once robusto
   - normalización de options
   - soporte document/window/custom target
   - métricas internas de emit/on/off/error
   - payload estable: event.detail
========================================================= */

import {
  isBrowser,
  normalizeListenerOptions,
} from "./helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_TARGET =
  "document";

const MAX_RECENT_EVENTS =
  40;

const EVENTS_VERSION =
  "10.0.0";

/* =========================================================
   BASICS
========================================================= */

function localIsBrowser() {
  try {
    if (typeof isBrowser === "function") {
      return Boolean(isBrowser());
    }
  } catch {}

  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object"
  );
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeNow() {
  return Date.now();
}

function safeIsoDate(ms = safeNow()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeWarn(...args) {
  try {
    console.warn(
      "[CoreEvents]",
      ...args
    );
  } catch {}
}

function normalizeOptions(options = false) {
  try {
    if (typeof normalizeListenerOptions === "function") {
      return normalizeListenerOptions(options);
    }
  } catch {}

  if (options === true) {
    return {
      capture:
        true,
    };
  }

  if (
    options === false ||
    options === null ||
    options === undefined
  ) {
    return false;
  }

  if (isObject(options)) {
    return {
      ...options,
    };
  }

  return false;
}

function normalizeEventName(name = "") {
  return safeText(name, "");
}

function createNoopOff() {
  return () => false;
}

function isEventTargetLike(target) {
  return Boolean(
    target &&
    isFunction(target.addEventListener) &&
    isFunction(target.removeEventListener) &&
    isFunction(target.dispatchEvent)
  );
}

function getDefaultTarget() {
  if (!localIsBrowser()) {
    return null;
  }

  try {
    return document || null;
  } catch {
    return null;
  }
}

function getWindowTarget() {
  if (!localIsBrowser()) {
    return null;
  }

  try {
    return window || null;
  } catch {
    return null;
  }
}

function resolveTarget(target = DEFAULT_TARGET) {
  if (isEventTargetLike(target)) {
    return target;
  }

  const key =
    safeText(target, DEFAULT_TARGET)
      .toLowerCase();

  if (key === "window") {
    return getWindowTarget();
  }

  return getDefaultTarget();
}

function createCustomEvent(name, detail = {}) {
  try {
    return new CustomEvent(name, {
      detail,
      bubbles:
        false,
      cancelable:
        false,
      composed:
        false,
    });
  } catch {
    /*
      Fallback para navegadores antiguos.
    */
    try {
      const event =
        document.createEvent("CustomEvent");

      event.initCustomEvent(
        name,
        false,
        false,
        detail
      );

      return event;
    } catch {
      return null;
    }
  }
}

/* =========================================================
   IDS / DEDUPE
========================================================= */

const handlerIds =
  new WeakMap();

let nextHandlerId =
  1;

function getHandlerId(handler) {
  if (!isFunction(handler)) {
    return "handler:none";
  }

  try {
    if (!handlerIds.has(handler)) {
      handlerIds.set(
        handler,
        nextHandlerId++
      );
    }

    return `handler:${handlerIds.get(handler)}`;
  } catch {
    return "handler:unknown";
  }
}

function normalizeOptionsForKey(options = false) {
  if (options === true) {
    return "capture:true";
  }

  if (
    options === false ||
    options === null ||
    options === undefined
  ) {
    return "capture:false";
  }

  if (isObject(options)) {
    return [
      `capture:${Boolean(options.capture)}`,
      `once:${Boolean(options.once)}`,
      `passive:${Boolean(options.passive)}`,
    ].join("|");
  }

  return String(options);
}

function makeListenerKey(name, handler, options, targetKey = DEFAULT_TARGET) {
  return [
    safeText(targetKey, DEFAULT_TARGET),
    normalizeEventName(name),
    getHandlerId(handler),
    normalizeOptionsForKey(options),
  ].join("::");
}

/* =========================================================
   FACTORY
========================================================= */

export function createEvents({
  target = DEFAULT_TARGET,
  mirrorToWindow = false,
  maxRecentEvents = MAX_RECENT_EVENTS,
} = {}) {
  const memoryListeners =
    new Map();

  const activeListeners =
    new Map();

  const recentEvents =
    [];

  const state = {
    version:
      EVENTS_VERSION,

    target:
      safeText(target, DEFAULT_TARGET),

    browser:
      localIsBrowser(),

    emitCount:
      0,

    onCount:
      0,

    offCount:
      0,

    onceCount:
      0,

    errorCount:
      0,

    lastEvent:
      "",

    lastEventAt:
      0,

    lastError:
      null,
  };

  function pushRecentEvent(type = "event", name = "", detail = {}) {
    const atMs =
      safeNow();

    recentEvents.unshift({
      type:
        safeText(type, "event"),

      name:
        safeText(name, ""),

      detail:
        isObject(detail)
          ? {
              ...detail,
            }
          : detail,

      at:
        safeIsoDate(atMs),

      atMs,
    });

    const limit =
      Number.isFinite(Number(maxRecentEvents))
        ? Number(maxRecentEvents)
        : MAX_RECENT_EVENTS;

    if (recentEvents.length > limit) {
      recentEvents.splice(limit);
    }
  }

  function recordError(source = "events", error = null, name = "") {
    state.errorCount += 1;

    state.lastError = {
      source:
        safeText(source, "events"),

      name:
        safeText(name, ""),

      message:
        safeText(
          error?.message || error,
          "Event bus error."
        ),

      at:
        safeIsoDate(),
    };

    safeWarn(
      state.lastError.message,
      {
        source,
        name,
        error,
      }
    );
  }

  function getMemorySet(name = "") {
    const eventName =
      normalizeEventName(name);

    if (!eventName) {
      return null;
    }

    if (!memoryListeners.has(eventName)) {
      memoryListeners.set(
        eventName,
        new Set()
      );
    }

    return memoryListeners.get(eventName);
  }

  function emitMemory(name = "", detail = {}) {
    const eventName =
      normalizeEventName(name);

    const set =
      memoryListeners.get(eventName);

    if (!set || !set.size) {
      return false;
    }

    const eventLike = {
      type:
        eventName,

      detail,

      payload:
        detail,

      target:
        null,

      currentTarget:
        null,
    };

    for (const handler of Array.from(set)) {
      try {
        handler(eventLike);
      } catch (error) {
        recordError(
          "memory-handler",
          error,
          eventName
        );
      }
    }

    return true;
  }

  function emit(name, detail = {}, options = {}) {
    const eventName =
      normalizeEventName(name);

    if (!eventName) {
      return false;
    }

    const payload =
      detail === undefined
        ? {}
        : detail;

    state.emitCount += 1;
    state.lastEvent =
      eventName;
    state.lastEventAt =
      safeNow();

    pushRecentEvent(
      "emit",
      eventName,
      payload
    );

    const domTarget =
      resolveTarget(
        options?.target || target
      );

    let emitted =
      false;

    if (
      localIsBrowser() &&
      isEventTargetLike(domTarget)
    ) {
      try {
        const event =
          createCustomEvent(
            eventName,
            payload
          );

        if (event) {
          emitted =
            Boolean(
              domTarget.dispatchEvent(event)
            );
        }
      } catch (error) {
        recordError(
          "dom-dispatch",
          error,
          eventName
        );
      }

      if (
        mirrorToWindow &&
        domTarget !== getWindowTarget()
      ) {
        try {
          const win =
            getWindowTarget();

          const event =
            createCustomEvent(
              eventName,
              payload
            );

          if (
            win &&
            event
          ) {
            win.dispatchEvent(event);
          }
        } catch (error) {
          recordError(
            "window-mirror",
            error,
            eventName
          );
        }
      }
    } else {
      emitted =
        emitMemory(
          eventName,
          payload
        );
    }

    return emitted;
  }

  function on(name, handler, options = false) {
    const eventName =
      normalizeEventName(name);

    if (
      !eventName ||
      !isFunction(handler)
    ) {
      return createNoopOff();
    }

    const finalOptions =
      normalizeOptions(options);

    const key =
      makeListenerKey(
        eventName,
        handler,
        finalOptions,
        state.target
      );

    if (activeListeners.has(key)) {
      return activeListeners.get(key)?.off || createNoopOff();
    }

    state.onCount += 1;

    const domTarget =
      resolveTarget(target);

    let off =
      createNoopOff();

    if (
      localIsBrowser() &&
      isEventTargetLike(domTarget)
    ) {
      try {
        domTarget.addEventListener(
          eventName,
          handler,
          finalOptions
        );

        off = () => {
          if (!activeListeners.has(key)) {
            return false;
          }

          try {
            domTarget.removeEventListener(
              eventName,
              handler,
              finalOptions
            );
          } catch (error) {
            recordError(
              "dom-remove",
              error,
              eventName
            );
          }

          activeListeners.delete(key);

          state.offCount += 1;

          pushRecentEvent(
            "off",
            eventName,
            {
              key,
            }
          );

          return true;
        };
      } catch (error) {
        recordError(
          "dom-add",
          error,
          eventName
        );

        return createNoopOff();
      }
    } else {
      const set =
        getMemorySet(eventName);

      if (!set) {
        return createNoopOff();
      }

      set.add(handler);

      off = () => {
        if (!activeListeners.has(key)) {
          return false;
        }

        try {
          set.delete(handler);
        } catch {}

        activeListeners.delete(key);

        state.offCount += 1;

        pushRecentEvent(
          "off",
          eventName,
          {
            key,
          }
        );

        return true;
      };
    }

    activeListeners.set(
      key,
      {
        key,
        name:
          eventName,
        handler,
        options:
          finalOptions,
        once:
          false,
        target:
          state.target,
        off,
        createdAt:
          safeIsoDate(),
      }
    );

    pushRecentEvent(
      "on",
      eventName,
      {
        key,
      }
    );

    return off;
  }

  function off(name, handler, options = false) {
    const eventName =
      normalizeEventName(name);

    if (
      !eventName ||
      !isFunction(handler)
    ) {
      return false;
    }

    const finalOptions =
      normalizeOptions(options);

    const key =
      makeListenerKey(
        eventName,
        handler,
        finalOptions,
        state.target
      );

    const record =
      activeListeners.get(key);

    if (
      record &&
      isFunction(record.off)
    ) {
      return record.off();
    }

    /*
      Fallback directo por si el listener fue registrado fuera
      del mapa interno.
    */
    const domTarget =
      resolveTarget(target);

    try {
      if (
        localIsBrowser() &&
        isEventTargetLike(domTarget)
      ) {
        domTarget.removeEventListener(
          eventName,
          handler,
          finalOptions
        );
      } else {
        memoryListeners
          .get(eventName)
          ?.delete(handler);
      }

      state.offCount += 1;

      return true;
    } catch (error) {
      recordError(
        "off",
        error,
        eventName
      );

      return false;
    }
  }

  function once(name, handler, options = false) {
    const eventName =
      normalizeEventName(name);

    if (
      !eventName ||
      !isFunction(handler)
    ) {
      return createNoopOff();
    }

    state.onceCount += 1;

    const baseOptions =
      normalizeOptions(options);

    const finalOptions =
      isObject(baseOptions)
        ? {
            ...baseOptions,
            once:
              true,
          }
        : {
            once:
              true,
          };

    /*
      Aunque el DOM soporte { once: true }, usamos wrapper para
      mantener control del mapa interno y del fallback memory.
    */
    let dispose =
      null;

    const wrapped = (event) => {
      try {
        dispose?.();
      } catch {}

      try {
        handler(event);
      } catch (error) {
        recordError(
          "once-handler",
          error,
          eventName
        );
      }
    };

    dispose =
      on(
        eventName,
        wrapped,
        finalOptions
      );

    pushRecentEvent(
      "once",
      eventName,
      {}
    );

    return dispose;
  }

  function clear(name = "") {
    const eventName =
      normalizeEventName(name);

    let count =
      0;

    for (const record of Array.from(activeListeners.values())) {
      if (
        eventName &&
        record.name !== eventName
      ) {
        continue;
      }

      try {
        record.off?.();
        count += 1;
      } catch (error) {
        recordError(
          "clear",
          error,
          record.name
        );
      }
    }

    if (eventName) {
      memoryListeners.delete(eventName);
    } else {
      memoryListeners.clear();
    }

    pushRecentEvent(
      "clear",
      eventName || "*",
      {
        count,
      }
    );

    return count;
  }

  function listenerCount(name = "") {
    const eventName =
      normalizeEventName(name);

    if (!eventName) {
      return activeListeners.size;
    }

    let count =
      0;

    for (const record of activeListeners.values()) {
      if (record.name === eventName) {
        count += 1;
      }
    }

    return count;
  }

  function names() {
    const set =
      new Set();

    for (const record of activeListeners.values()) {
      if (record.name) {
        set.add(record.name);
      }
    }

    for (const key of memoryListeners.keys()) {
      set.add(key);
    }

    return Array.from(set);
  }

  function getSnapshot() {
    return {
      version:
        state.version,

      target:
        state.target,

      browser:
        localIsBrowser(),

      emitCount:
        state.emitCount,

      onCount:
        state.onCount,

      offCount:
        state.offCount,

      onceCount:
        state.onceCount,

      errorCount:
        state.errorCount,

      lastEvent:
        state.lastEvent,

      lastEventAt:
        state.lastEventAt,

      lastEventAtIso:
        state.lastEventAt
          ? safeIsoDate(state.lastEventAt)
          : "",

      lastError:
        state.lastError,

      listenerCount:
        listenerCount(),

      eventNames:
        names(),

      listeners:
        Array.from(activeListeners.values()).map((record) => ({
          key:
            record.key,

          name:
            record.name,

          once:
            Boolean(record.once),

          target:
            record.target,

          createdAt:
            record.createdAt,
        })),

      recent:
        recentEvents.map((item) => ({
          ...item,
        })),
    };
  }

  function reset() {
    clear();

    state.emitCount =
      0;

    state.onCount =
      0;

    state.offCount =
      0;

    state.onceCount =
      0;

    state.errorCount =
      0;

    state.lastEvent =
      "";

    state.lastEventAt =
      0;

    state.lastError =
      null;

    recentEvents.splice(0);

    return getSnapshot();
  }

  return {
    emit,

    on,
    off,
    once,

    clear,

    listenerCount,
    names,

    getSnapshot,
    getDebugSnapshot:
      getSnapshot,

    reset,
  };
}

export default {
  createEvents,
};
