/* =========================================================
   Onion SPA - Core Cleanup
   Archivo: src/core/cleanup.js

   Responsabilidades:
   - gestionar scopes de cleanup del core
   - registrar listeners DOM por scope
   - registrar listeners de event bus por scope
   - registrar cleaners/disposers manuales por scope
   - limpiar recursos de forma segura
   - soportar firmas legacy y modernas
   - evitar duplicados dentro del mismo scope
   - exponer snapshots de diagnóstico

   HARDENING EXTREMO:
   - cleanup idempotente
   - tolerancia total si faltan registry/events/utils
   - soporte DOM: cleanup.on(scope, target, event, handler, options)
   - soporte DOM: cleanup.event(scope, target, event, handler, options)
   - soporte bus: cleanup.event(scope, eventName, handler, options)
   - soporte manual: cleanup.add(scope, disposer)
   - aliases: clear/dispose/run/runAll/off
   - cero throws accidentales
========================================================= */

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object"
  );
}

function isFunction(value) {
  return typeof value === "function";
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

function safeWarn(utils, ...args) {
  try {
    utils?.warn?.(
      "[Cleanup]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[Cleanup]",
      ...args
    );
  } catch {}
}

function safeLog(utils, ...args) {
  try {
    utils?.log?.(
      "[Cleanup]",
      ...args
    );
  } catch {}
}

function safeEmit(events, name, payload = {}) {
  try {
    events?.emit?.(
      name,
      payload
    );

    return true;
  } catch {}

  return false;
}

function ensureMap(value) {
  if (value instanceof Map) {
    return value;
  }

  return new Map();
}

/* =========================================================
   IDS FOR DEDUPE
========================================================= */

const targetIds =
  new WeakMap();

const handlerIds =
  new WeakMap();

let nextTargetId =
  1;

let nextHandlerId =
  1;

function getTargetId(target) {
  if (
    !target ||
    (
      typeof target !== "object" &&
      typeof target !== "function"
    )
  ) {
    return "target:none";
  }

  try {
    if (!targetIds.has(target)) {
      targetIds.set(
        target,
        nextTargetId++
      );
    }

    return `target:${targetIds.get(target)}`;
  } catch {
    return "target:unknown";
  }
}

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

  if (options === false || options === undefined || options === null) {
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

function makeDomKey(target, eventName, handler, options) {
  return [
    "dom",
    getTargetId(target),
    safeText(eventName, ""),
    getHandlerId(handler),
    normalizeOptionsForKey(options),
  ].join("::");
}

function makeBusKey(eventName, handler) {
  return [
    "bus",
    safeText(eventName, ""),
    getHandlerId(handler),
  ].join("::");
}

function makeManualKey(disposer) {
  return [
    "manual",
    getHandlerId(disposer),
  ].join("::");
}

/* =========================================================
   SCOPE NORMALIZATION
========================================================= */

function createScopeRecord(name = "global") {
  const createdAtMs =
    safeNow();

  return {
    name:
      safeText(name, "global"),

    listeners:
      [],

    cleaners:
      [],

    disposers:
      [],

    keys:
      new Set(),

    records:
      new Map(),

    running:
      false,

    disposed:
      false,

    createdAt:
      safeIsoDate(createdAtMs),

    createdAtMs,

    lastRunAt:
      "",

    lastRunAtMs:
      0,

    runCount:
      0,
  };
}

function normalizeScopeRecord(scope, name = "global") {
  if (
    scope &&
    isObject(scope) &&
    Array.isArray(scope.listeners) &&
    Array.isArray(scope.cleaners)
  ) {
    if (!Array.isArray(scope.disposers)) {
      scope.disposers = [];
    }

    if (!(scope.keys instanceof Set)) {
      scope.keys = new Set();
    }

    if (!(scope.records instanceof Map)) {
      scope.records = new Map();
    }

    if (!scope.name) {
      scope.name =
        safeText(name, "global");
    }

    return scope;
  }

  if (scope instanceof Set) {
    const record =
      createScopeRecord(name);

    for (const disposer of Array.from(scope)) {
      if (isFunction(disposer)) {
        record.cleaners.push(disposer);
      }
    }

    return record;
  }

  return createScopeRecord(name);
}

/* =========================================================
   DISPOSER WRAP
========================================================= */

function createNoopDisposer() {
  const noop = () => false;

  noop.__cleanupNoop =
    true;

  return noop;
}

function wrapDisposer({
  scope,
  key,
  type = "manual",
  label = "",
  dispose,
  utils,
  events,
}) {
  if (!isFunction(dispose)) {
    return createNoopDisposer();
  }

  let called =
    false;

  const wrapped = () => {
    if (called) {
      return false;
    }

    called =
      true;

    try {
      dispose();

      safeEmit(
        events,
        "cleanup:disposed",
        {
          scope:
            scope?.name || "",

          key:
            key || "",

          type,

          label:
            label || "",

          at:
            safeIsoDate(),
        }
      );

      return true;
    } catch (error) {
      safeWarn(
        utils,
        `Error limpiando "${label || type}" en scope "${scope?.name || "global"}".`,
        error
      );

      safeEmit(
        events,
        "cleanup:error",
        {
          scope:
            scope?.name || "",

          key:
            key || "",

          type,

          label:
            label || "",

          message:
            safeText(
              error?.message || error,
              "Cleanup error."
            ),

          at:
            safeIsoDate(),
        }
      );

      return false;
    }
  };

  wrapped.__cleanupWrapped =
    true;

  wrapped.__cleanupType =
    type;

  wrapped.__cleanupKey =
    key;

  wrapped.__cleanupLabel =
    label;

  return wrapped;
}

function pushDisposer(scope, key, disposer, meta = {}) {
  if (
    !scope ||
    !key ||
    !isFunction(disposer)
  ) {
    return createNoopDisposer();
  }

  if (scope.keys.has(key)) {
    const existing =
      scope.records.get(key);

    if (isFunction(existing?.disposer)) {
      return existing.disposer;
    }

    return createNoopDisposer();
  }

  scope.keys.add(key);

  const record = {
    key,
    type:
      safeText(meta.type, "manual"),

    label:
      safeText(meta.label, ""),

    eventName:
      safeText(meta.eventName, ""),

    targetType:
      safeText(meta.targetType, ""),

    createdAt:
      safeIsoDate(),

    disposer,
  };

  scope.records.set(
    key,
    record
  );

  if (record.type === "dom") {
    scope.listeners.push(disposer);
  } else {
    scope.cleaners.push(disposer);
  }

  scope.disposers.push(disposer);

  return disposer;
}

/* =========================================================
   TARGET DETECTION
========================================================= */

function isEventTargetLike(target) {
  return Boolean(
    target &&
    isFunction(target.addEventListener) &&
    isFunction(target.removeEventListener)
  );
}

function getDefaultEventTarget() {
  try {
    if (typeof window !== "undefined") {
      return window;
    }
  } catch {}

  return null;
}

/* =========================================================
   FACTORY
========================================================= */

export function createCleanup({
  registry,
  events,
  utils,
} = {}) {
  const finalRegistry =
    isObject(registry)
      ? registry
      : {};

  finalRegistry.scopes =
    ensureMap(
      finalRegistry.scopes
    );

  function ensureScope(name = "global") {
    const scopeName =
      safeText(name, "global");

    const existing =
      finalRegistry.scopes.get(scopeName);

    const normalized =
      normalizeScopeRecord(
        existing,
        scopeName
      );

    if (existing !== normalized) {
      finalRegistry.scopes.set(
        scopeName,
        normalized
      );
    }

    return normalized;
  }

  function hasScope(name = "global") {
    return finalRegistry.scopes.has(
      safeText(name, "global")
    );
  }

  function getScope(name = "global") {
    return ensureScope(name);
  }

  function registerDomListener(
    scopeName = "global",
    target,
    eventName,
    handler,
    options = false
  ) {
    const scope =
      ensureScope(scopeName);

    const cleanEvent =
      safeText(eventName, "");

    if (
      !isEventTargetLike(target) ||
      !cleanEvent ||
      !isFunction(handler)
    ) {
      return createNoopDisposer();
    }

    const key =
      makeDomKey(
        target,
        cleanEvent,
        handler,
        options
      );

    if (scope.keys.has(key)) {
      const existing =
        scope.records.get(key);

      return isFunction(existing?.disposer)
        ? existing.disposer
        : createNoopDisposer();
    }

    try {
      target.addEventListener(
        cleanEvent,
        handler,
        options
      );
    } catch (error) {
      safeWarn(
        utils,
        `No se pudo registrar listener DOM "${cleanEvent}" en scope "${scope.name}".`,
        error
      );

      return createNoopDisposer();
    }

    const disposer =
      wrapDisposer({
        scope,
        key,
        type:
          "dom",

        label:
          cleanEvent,

        dispose:
          () => {
            target.removeEventListener(
              cleanEvent,
              handler,
              options
            );
          },

        utils,
        events,
      });

    return pushDisposer(
      scope,
      key,
      disposer,
      {
        type:
          "dom",

        label:
          cleanEvent,

        eventName:
          cleanEvent,

        targetType:
          target?.constructor?.name || typeof target,
      }
    );
  }

  function registerBusListener(
    scopeName = "global",
    eventName,
    handler,
    options = false
  ) {
    const scope =
      ensureScope(scopeName);

    const cleanEvent =
      safeText(eventName, "");

    if (
      !cleanEvent ||
      !isFunction(handler)
    ) {
      return createNoopDisposer();
    }

    const key =
      makeBusKey(
        cleanEvent,
        handler
      );

    if (scope.keys.has(key)) {
      const existing =
        scope.records.get(key);

      return isFunction(existing?.disposer)
        ? existing.disposer
        : createNoopDisposer();
    }

    let off =
      null;

    try {
      if (isFunction(events?.on)) {
        off =
          events.on(
            cleanEvent,
            handler,
            options
          );
      }
    } catch (error) {
      safeWarn(
        utils,
        `No se pudo registrar evento bus "${cleanEvent}" en scope "${scope.name}".`,
        error
      );
    }

    if (!isFunction(off)) {
      off =
        () => {
          try {
            events?.off?.(
              cleanEvent,
              handler
            );
          } catch {}
        };
    }

    const disposer =
      wrapDisposer({
        scope,
        key,
        type:
          "bus",

        label:
          cleanEvent,

        dispose:
          off,

        utils,
        events,
      });

    return pushDisposer(
      scope,
      key,
      disposer,
      {
        type:
          "bus",

        label:
          cleanEvent,

        eventName:
          cleanEvent,

        targetType:
          "event-bus",
      }
    );
  }

  function add(scopeName = "global", disposer, label = "manual") {
    const scope =
      ensureScope(scopeName);

    if (!isFunction(disposer)) {
      return createNoopDisposer();
    }

    const key =
      makeManualKey(disposer);

    if (scope.keys.has(key)) {
      const existing =
        scope.records.get(key);

      return isFunction(existing?.disposer)
        ? existing.disposer
        : createNoopDisposer();
    }

    const wrapped =
      wrapDisposer({
        scope,
        key,
        type:
          "manual",

        label:
          safeText(label, "manual"),

        dispose:
          disposer,

        utils,
        events,
      });

    return pushDisposer(
      scope,
      key,
      wrapped,
      {
        type:
          "manual",

        label:
          safeText(label, "manual"),

        targetType:
          "manual",
      }
    );
  }

  function on(scopeName = "global", target, eventName, handler, options = false) {
    return registerDomListener(
      scopeName,
      target,
      eventName,
      handler,
      options
    );
  }

  function event(scopeName = "global", targetOrName, eventNameOrHandler, handlerOrOptions, maybeOptions) {
    /*
      Firmas soportadas:

      Bus:
        cleanup.event(scope, "app:ready", handler, options)

      DOM:
        cleanup.event(scope, window, "error", handler, options)
        cleanup.event(scope, element, "click", handler, options)
    */

    if (isEventTargetLike(targetOrName)) {
      return registerDomListener(
        scopeName,
        targetOrName,
        eventNameOrHandler,
        handlerOrOptions,
        maybeOptions || false
      );
    }

    return registerBusListener(
      scopeName,
      targetOrName,
      eventNameOrHandler,
      handlerOrOptions || false
    );
  }

  function windowEvent(scopeName = "global", eventName, handler, options = false) {
    const target =
      getDefaultEventTarget();

    return registerDomListener(
      scopeName,
      target,
      eventName,
      handler,
      options
    );
  }

  function off(scopeName = "global", keyOrDisposer = "") {
    const scopeNameFinal =
      safeText(scopeName, "global");

    const scope =
      finalRegistry.scopes.get(scopeNameFinal);

    if (!scope) {
      return false;
    }

    if (isFunction(keyOrDisposer)) {
      try {
        keyOrDisposer();
        return true;
      } catch (error) {
        safeWarn(
          utils,
          `Error ejecutando disposer manual en scope "${scopeNameFinal}".`,
          error
        );

        return false;
      }
    }

    const key =
      safeText(keyOrDisposer, "");

    if (!key) {
      return false;
    }

    const record =
      scope.records?.get(key);

    if (!record) {
      return false;
    }

    try {
      record.disposer?.();
    } catch {}

    scope.records.delete(key);
    scope.keys.delete(key);

    return true;
  }

  function run(scopeName = "global", options = {}) {
    const cleanScopeName =
      safeText(scopeName, "global");

    const scope =
      finalRegistry.scopes.get(cleanScopeName);

    if (!scope) {
      return true;
    }

    if (scope.running) {
      return false;
    }

    scope.running =
      true;

    const startedAtMs =
      safeNow();

    const disposers =
      [
        ...safeArray(scope.listeners),
        ...safeArray(scope.cleaners),
      ];

    let disposed =
      0;

    let failed =
      0;

    for (const dispose of disposers) {
      try {
        const ok =
          dispose();

        if (ok !== false) {
          disposed += 1;
        }
      } catch (error) {
        failed += 1;

        safeWarn(
          utils,
          `Error limpiando scope "${cleanScopeName}".`,
          error
        );
      }
    }

    scope.listeners =
      [];

    scope.cleaners =
      [];

    scope.disposers =
      [];

    scope.keys?.clear?.();
    scope.records?.clear?.();

    scope.running =
      false;

    scope.disposed =
      true;

    scope.lastRunAtMs =
      safeNow();

    scope.lastRunAt =
      safeIsoDate(scope.lastRunAtMs);

    scope.runCount =
      Number(scope.runCount || 0) + 1;

    const payload = {
      scope:
        cleanScopeName,

      disposed,

      failed,

      durationMs:
        scope.lastRunAtMs - startedAtMs,

      deleted:
        options.deleteScope !== false,

      at:
        scope.lastRunAt,
    };

    safeEmit(
      events,
      "cleanup:scope:run",
      payload
    );

    if (options.deleteScope !== false) {
      finalRegistry.scopes.delete(
        cleanScopeName
      );
    } else {
      finalRegistry.scopes.set(
        cleanScopeName,
        scope
      );
    }

    return payload;
  }

  function clear(scopeName = "global") {
    return run(
      scopeName
    );
  }

  function dispose(scopeName = "global") {
    return run(
      scopeName
    );
  }

  function reset(scopeName = "global") {
    return run(
      scopeName,
      {
        deleteScope:
          false,
      }
    );
  }

  function runAll(options = {}) {
    const names =
      Array.from(
        finalRegistry.scopes.keys()
      );

    const results =
      [];

    for (const scopeName of names) {
      results.push(
        run(
          scopeName,
          options
        )
      );
    }

    safeEmit(
      events,
      "cleanup:all:run",
      {
        count:
          results.length,

        at:
          safeIsoDate(),
      }
    );

    return results;
  }

  function clearAll() {
    return runAll();
  }

  function disposeAll() {
    return runAll();
  }

  function getScopeSnapshot(scopeName = "global") {
    const cleanScopeName =
      safeText(scopeName, "global");

    const scope =
      finalRegistry.scopes.get(cleanScopeName);

    if (!scope) {
      return {
        exists:
          false,

        name:
          cleanScopeName,
      };
    }

    const records =
      scope.records instanceof Map
        ? Array.from(scope.records.values())
        : [];

    return {
      exists:
        true,

      name:
        scope.name || cleanScopeName,

      listenerCount:
        safeArray(scope.listeners).length,

      cleanerCount:
        safeArray(scope.cleaners).length,

      disposerCount:
        safeArray(scope.disposers).length,

      keyCount:
        scope.keys?.size || 0,

      recordCount:
        records.length,

      running:
        Boolean(scope.running),

      disposed:
        Boolean(scope.disposed),

      createdAt:
        scope.createdAt || "",

      lastRunAt:
        scope.lastRunAt || "",

      runCount:
        Number(scope.runCount || 0),

      records:
        records.map((record) => ({
          key:
            record.key,

          type:
            record.type,

          label:
            record.label,

          eventName:
            record.eventName,

          targetType:
            record.targetType,

          createdAt:
            record.createdAt,
        })),
    };
  }

  function getSnapshot() {
    const names =
      Array.from(
        finalRegistry.scopes.keys()
      );

    return {
      scopeCount:
        names.length,

      scopes:
        names.map((name) =>
          getScopeSnapshot(name)
        ),

      at:
        safeIsoDate(),
    };
  }

  function size(scopeName = "") {
    if (scopeName) {
      const scope =
        finalRegistry.scopes.get(scopeName);

      if (!scope) {
        return 0;
      }

      return (
        safeArray(scope.listeners).length +
        safeArray(scope.cleaners).length
      );
    }

    let total =
      0;

    for (const scope of finalRegistry.scopes.values()) {
      total +=
        safeArray(scope.listeners).length +
        safeArray(scope.cleaners).length;
    }

    return total;
  }

  const api = {
    /*
      Compat:
      scope() devuelve el nombre como antes.
      ensureScope()/getScope() devuelven el objeto completo.
    */
    scope(name = "global") {
      const scopeName =
        safeText(name, "global");

      ensureScope(scopeName);

      return scopeName;
    },

    ensureScope,
    getScope,
    hasScope,

    on,
    event,
    windowEvent,

    add,
    off,

    run,
    clear,
    dispose,
    reset,

    runAll,
    clearAll,
    disposeAll,

    size,

    getScopeSnapshot,
    getSnapshot,
  };

  safeLog(
    utils,
    "Cleanup ready."
  );

  return api;
}

export default {
  createCleanup,
};
