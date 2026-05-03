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
   - limpiar timers, raf, idle callbacks, observers y abort controllers
   - exponer snapshots de diagnóstico

   HARDENING EXTREMO:
   - cleanup idempotente
   - tolerancia total si faltan registry/events/utils
   - soporte DOM: cleanup.on(scope, target, event, handler, options)
   - soporte DOM: cleanup.event(scope, target, event, handler, options)
   - soporte bus: cleanup.event(scope, eventName, handler, options)
   - soporte manual: cleanup.add(scope, disposer, label)
   - soporte timers: timeout / interval
   - soporte frame callbacks: raf / animationFrame / idle
   - soporte observer.disconnect()
   - soporte AbortController.abort()
   - dedupe DOM por target/event/handler/options
   - dedupe bus por event/handler/options
   - aliases: clear/dispose/run/runAll/off
   - snapshots de scope y global
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

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
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
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = safeNow()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeWarn(utils, ...args) {
  try {
    utils?.warn?.(
      "[Cleanup]",
      ...args
    );

    return;
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

function createNoopDisposer() {
  const noop = () => false;

  noop.__cleanupNoop =
    true;

  return noop;
}

/* =========================================================
   ENV HELPERS
========================================================= */

function getWindow() {
  try {
    if (typeof window !== "undefined") {
      return window;
    }
  } catch {}

  return null;
}

function getDocument() {
  try {
    if (typeof document !== "undefined") {
      return document;
    }
  } catch {}

  return null;
}

function getDefaultEventTarget() {
  return (
    getWindow() ||
    getDocument() ||
    null
  );
}

function isEventTargetLike(target) {
  return Boolean(
    target &&
    isFunction(target.addEventListener) &&
    isFunction(target.removeEventListener)
  );
}

function isAbortControllerLike(value) {
  return Boolean(
    value &&
    isFunction(value.abort) &&
    value.signal
  );
}

function isObserverLike(value) {
  return Boolean(
    value &&
    isFunction(value.disconnect)
  );
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
    return "capture:true|once:false|passive:false|target:default";
  }

  if (
    options === false ||
    options === undefined ||
    options === null
  ) {
    return "capture:false|once:false|passive:false|target:default";
  }

  if (isPlainObject(options)) {
    const target =
      options.target
        ? (
            typeof options.target === "string"
              ? `target:${safeText(options.target, "custom")}`
              : getTargetId(options.target)
          )
        : "target:default";

    return [
      `capture:${Boolean(options.capture)}`,
      `once:${Boolean(options.once)}`,
      `passive:${Boolean(options.passive)}`,
      target,
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

function makeBusKey(eventName, handler, options = false) {
  return [
    "bus",
    safeText(eventName, ""),
    getHandlerId(handler),
    normalizeOptionsForKey(options),
  ].join("::");
}

function makeManualKey(disposer, label = "manual") {
  return [
    "manual",
    getHandlerId(disposer),
    safeText(label, "manual"),
  ].join("::");
}

function makeResourceKey(type = "resource", id = "", label = "") {
  return [
    safeText(type, "resource"),
    safeText(id, ""),
    safeText(label, ""),
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

    disposedCount:
      0,

    failedCount:
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

    if (typeof scope.running !== "boolean") {
      scope.running =
        false;
    }

    if (typeof scope.disposed !== "boolean") {
      scope.disposed =
        false;
    }

    if (!scope.createdAt) {
      scope.createdAt =
        safeIsoDate();
    }

    if (!Number.isFinite(Number(scope.createdAtMs))) {
      scope.createdAtMs =
        safeNow();
    }

    if (!Number.isFinite(Number(scope.runCount))) {
      scope.runCount =
        0;
    }

    if (!Number.isFinite(Number(scope.disposedCount))) {
      scope.disposedCount =
        0;
    }

    if (!Number.isFinite(Number(scope.failedCount))) {
      scope.failedCount =
        0;
    }

    return scope;
  }

  if (scope instanceof Set) {
    const record =
      createScopeRecord(name);

    for (const disposer of Array.from(scope)) {
      if (isFunction(disposer)) {
        record.cleaners.push(disposer);
        record.disposers.push(disposer);
      }
    }

    return record;
  }

  return createScopeRecord(name);
}

/* =========================================================
   DISPOSER WRAP
========================================================= */

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

  wrapped.__cleanupScope =
    scope?.name || "";

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

    createdAtMs:
      safeNow(),

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

  scope.disposed =
    false;

  return disposer;
}

function removeRecordFromScope(scope, key = "") {
  if (
    !scope ||
    !key
  ) {
    return false;
  }

  const record =
    scope.records?.get?.(key);

  if (!record) {
    return false;
  }

  const disposer =
    record.disposer;

  scope.records.delete(key);
  scope.keys?.delete?.(key);

  scope.listeners =
    safeArray(scope.listeners).filter((item) =>
      item !== disposer
    );

  scope.cleaners =
    safeArray(scope.cleaners).filter((item) =>
      item !== disposer
    );

  scope.disposers =
    safeArray(scope.disposers).filter((item) =>
      item !== disposer
    );

  return true;
}

/* =========================================================
   NORMALIZE SIGNATURES
========================================================= */

function normalizeAddArgs(scopeName, disposer, label) {
  /*
    Soporta:
      add(scope, disposer, label)
      add(scope, label, disposer)
      add(scope, { disposer, label })
  */

  let finalDisposer =
    disposer;

  let finalLabel =
    label;

  if (
    typeof disposer === "string" &&
    isFunction(label)
  ) {
    finalDisposer =
      label;

    finalLabel =
      disposer;
  }

  if (
    isPlainObject(disposer) &&
    isFunction(disposer.disposer)
  ) {
    finalDisposer =
      disposer.disposer;

    finalLabel =
      disposer.label ||
      label ||
      "manual";
  }

  return {
    scopeName:
      safeText(scopeName, "global"),

    disposer:
      finalDisposer,

    label:
      safeText(finalLabel, "manual"),
  };
}

function normalizeTimerDelay(delay = 0) {
  return Math.max(
    0,
    safeNumber(delay, 0)
  );
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
              handler,
              options
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
    const args =
      normalizeAddArgs(
        scopeName,
        disposer,
        label
      );

    const scope =
      ensureScope(args.scopeName);

    if (!isFunction(args.disposer)) {
      return createNoopDisposer();
    }

    const key =
      makeManualKey(
        args.disposer,
        args.label
      );

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
          args.label,

        dispose:
          args.disposer,

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
          args.label,

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

  function documentEvent(scopeName = "global", eventName, handler, options = false) {
    const target =
      getDocument();

    return registerDomListener(
      scopeName,
      target,
      eventName,
      handler,
      options
    );
  }

  function timeout(scopeName = "global", fn, delay = 0, label = "timeout") {
    if (!isFunction(fn)) {
      return createNoopDisposer();
    }

    const scope =
      ensureScope(scopeName);

    const timerId =
      setTimeout(
        fn,
        normalizeTimerDelay(delay)
      );

    const key =
      makeResourceKey(
        "timeout",
        String(timerId),
        label
      );

    const disposer =
      wrapDisposer({
        scope,
        key,
        type:
          "timeout",

        label,

        dispose:
          () => {
            clearTimeout(timerId);
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
          "timeout",

        label,

        targetType:
          "timer",
      }
    );
  }

  function interval(scopeName = "global", fn, delay = 0, label = "interval") {
    if (!isFunction(fn)) {
      return createNoopDisposer();
    }

    const scope =
      ensureScope(scopeName);

    const timerId =
      setInterval(
        fn,
        normalizeTimerDelay(delay)
      );

    const key =
      makeResourceKey(
        "interval",
        String(timerId),
        label
      );

    const disposer =
      wrapDisposer({
        scope,
        key,
        type:
          "interval",

        label,

        dispose:
          () => {
            clearInterval(timerId);
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
          "interval",

        label,

        targetType:
          "timer",
      }
    );
  }

  function raf(scopeName = "global", fn, label = "raf") {
    const win =
      getWindow();

    if (
      !win ||
      !isFunction(win.requestAnimationFrame) ||
      !isFunction(fn)
    ) {
      return timeout(
        scopeName,
        fn,
        0,
        label
      );
    }

    const scope =
      ensureScope(scopeName);

    const frameId =
      win.requestAnimationFrame(fn);

    const key =
      makeResourceKey(
        "raf",
        String(frameId),
        label
      );

    const disposer =
      wrapDisposer({
        scope,
        key,
        type:
          "raf",

        label,

        dispose:
          () => {
            try {
              win.cancelAnimationFrame(frameId);
            } catch {}
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
          "raf",

        label,

        targetType:
          "animation-frame",
      }
    );
  }

  function idle(scopeName = "global", fn, options = {}, label = "idle") {
    const win =
      getWindow();

    if (
      !win ||
      !isFunction(win.requestIdleCallback) ||
      !isFunction(fn)
    ) {
      return timeout(
        scopeName,
        fn,
        0,
        label
      );
    }

    const scope =
      ensureScope(scopeName);

    const idleId =
      win.requestIdleCallback(
        fn,
        isPlainObject(options)
          ? options
          : {}
      );

    const key =
      makeResourceKey(
        "idle",
        String(idleId),
        label
      );

    const disposer =
      wrapDisposer({
        scope,
        key,
        type:
          "idle",

        label,

        dispose:
          () => {
            try {
              win.cancelIdleCallback(idleId);
            } catch {}
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
          "idle",

        label,

        targetType:
          "idle-callback",
      }
    );
  }

  function observer(scopeName = "global", observerRef, label = "observer") {
    const scope =
      ensureScope(scopeName);

    if (!isObserverLike(observerRef)) {
      return createNoopDisposer();
    }

    const key =
      makeResourceKey(
        "observer",
        getTargetId(observerRef),
        label
      );

    if (scope.keys.has(key)) {
      const existing =
        scope.records.get(key);

      return isFunction(existing?.disposer)
        ? existing.disposer
        : createNoopDisposer();
    }

    const disposer =
      wrapDisposer({
        scope,
        key,
        type:
          "observer",

        label,

        dispose:
          () => {
            observerRef.disconnect();
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
          "observer",

        label,

        targetType:
          observerRef?.constructor?.name || "observer",
      }
    );
  }

  function abortController(scopeName = "global", controller, label = "abort-controller") {
    const scope =
      ensureScope(scopeName);

    if (!isAbortControllerLike(controller)) {
      return createNoopDisposer();
    }

    const key =
      makeResourceKey(
        "abort",
        getTargetId(controller),
        label
      );

    if (scope.keys.has(key)) {
      const existing =
        scope.records.get(key);

      return isFunction(existing?.disposer)
        ? existing.disposer
        : createNoopDisposer();
    }

    const disposer =
      wrapDisposer({
        scope,
        key,
        type:
          "abort",

        label,

        dispose:
          () => {
            try {
              controller.abort();
            } catch {}
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
          "abort",

        label,

        targetType:
          "AbortController",
      }
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
        const result =
          keyOrDisposer();

        return result !== false;
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

    let ok =
      false;

    try {
      ok =
        record.disposer?.() !== false;
    } catch {
      ok =
        false;
    }

    removeRecordFromScope(
      scope,
      key
    );

    return ok;
  }

  function run(scopeName = "global", options = {}) {
    const cleanScopeName =
      safeText(scopeName, "global");

    const scope =
      finalRegistry.scopes.get(cleanScopeName);

    if (!scope) {
      return {
        scope:
          cleanScopeName,

        disposed:
          0,

        failed:
          0,

        durationMs:
          0,

        deleted:
          false,

        missing:
          true,

        at:
          safeIsoDate(),
      };
    }

    if (scope.running) {
      return {
        scope:
          cleanScopeName,

        disposed:
          0,

        failed:
          0,

        durationMs:
          0,

        deleted:
          false,

        running:
          true,

        at:
          safeIsoDate(),
      };
    }

    scope.running =
      true;

    const startedAtMs =
      safeNow();

    let disposed =
      0;

    let failed =
      0;

    try {
      const disposers =
        Array.from(
          new Set([
            ...safeArray(scope.listeners),
            ...safeArray(scope.cleaners),
            ...safeArray(scope.disposers),
          ])
        );

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
    } finally {
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
        safeNumber(
          scope.runCount,
          0
        ) + 1;

      scope.disposedCount =
        safeNumber(
          scope.disposedCount,
          0
        ) + disposed;

      scope.failedCount =
        safeNumber(
          scope.failedCount,
          0
        ) + failed;
    }

    const payload = {
      scope:
        cleanScopeName,

      disposed,

      failed,

      durationMs:
        safeNumber(
          scope.lastRunAtMs - startedAtMs,
          0
        ),

      deleted:
        options?.deleteScope !== false,

      missing:
        false,

      at:
        scope.lastRunAt,
    };

    safeEmit(
      events,
      "cleanup:scope:run",
      payload
    );

    if (options?.deleteScope !== false) {
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

        disposed:
          results.reduce(
            (total, item) =>
              total + safeNumber(item?.disposed, 0),
            0
          ),

        failed:
          results.reduce(
            (total, item) =>
              total + safeNumber(item?.failed, 0),
            0
          ),

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

  function resetAll() {
    return runAll({
      deleteScope:
        false,
    });
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

      createdAtMs:
        safeNumber(
          scope.createdAtMs,
          0
        ),

      lastRunAt:
        scope.lastRunAt || "",

      lastRunAtMs:
        safeNumber(
          scope.lastRunAtMs,
          0
        ),

      runCount:
        safeNumber(
          scope.runCount,
          0
        ),

      disposedCount:
        safeNumber(
          scope.disposedCount,
          0
        ),

      failedCount:
        safeNumber(
          scope.failedCount,
          0
        ),

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

    const scopes =
      names.map((name) =>
        getScopeSnapshot(name)
      );

    return {
      scopeCount:
        names.length,

      totalListeners:
        scopes.reduce(
          (total, item) =>
            total + safeNumber(item.listenerCount, 0),
          0
        ),

      totalCleaners:
        scopes.reduce(
          (total, item) =>
            total + safeNumber(item.cleanerCount, 0),
          0
        ),

      totalDisposers:
        scopes.reduce(
          (total, item) =>
            total + safeNumber(item.disposerCount, 0),
          0
        ),

      totalRecords:
        scopes.reduce(
          (total, item) =>
            total + safeNumber(item.recordCount, 0),
          0
        ),

      scopes,

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
        safeArray(scope.cleaners).length +
        safeArray(scope.disposers).length
      );
    }

    let total =
      0;

    for (const scope of finalRegistry.scopes.values()) {
      total +=
        safeArray(scope.listeners).length +
        safeArray(scope.cleaners).length +
        safeArray(scope.disposers).length;
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
    documentEvent,

    add,
    off,

    timeout,
    interval,

    raf,
    animationFrame:
      raf,

    idle,
    idleCallback:
      idle,

    observer,
    abortController,

    run,
    clear,
    dispose,
    reset,

    runAll,
    clearAll,
    disposeAll,
    resetAll,

    size,

    getScopeSnapshot,
    getSnapshot,
    getDebugSnapshot:
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
