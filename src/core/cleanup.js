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
   - cleanup idempotente real
   - tolerancia total si faltan registry/events/utils
   - soporte DOM: cleanup.on(scope, target, event, handler, options)
   - soporte DOM: cleanup.event(scope, target, event, handler, options)
   - soporte DOM target string: "window" / "document" / "body" / "html"
   - soporte bus: cleanup.event(scope, eventName, handler, options)
   - soporte manual: cleanup.add(scope, disposer, label)
   - soporte timers: timeout / interval
   - soporte frame callbacks: raf / animationFrame / idle
   - soporte observer.disconnect()
   - soporte AbortController.abort(reason)
   - dedupe DOM por target/event/handler/options
   - dedupe bus por event/handler/options
   - once manual robusto para DOM y bus
   - wrappers defensivos contra errores sync/async de handlers
   - auto-unregister de recursos one-shot ejecutados
   - aliases: clear/dispose/run/runAll/off
   - snapshots de scope y global
   - cero throws accidentales
========================================================= */

const CLEANUP_VERSION =
  "11.0.0";

const DEFAULT_SCOPE =
  "global";

const CLEANUP_EVENTS =
  Object.freeze({
    ready:
      "cleanup:ready",

    disposed:
      "cleanup:disposed",

    error:
      "cleanup:error",

    scopeRun:
      "cleanup:scope:run",

    allRun:
      "cleanup:all:run",

    recordAdded:
      "cleanup:record:added",
  });

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

function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === 1) return true;
  if (value === 0) return false;

  return Boolean(fallback);
}

function safeWarn(utils, ...args) {
  let done =
    false;

  try {
    if (isFunction(utils?.warn)) {
      utils.warn(
        "[Cleanup]",
        ...args
      );

      done =
        true;
    }
  } catch {
    done =
      false;
  }

  if (done) {
    return;
  }

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
  const eventName =
    safeText(name, "");

  if (!eventName) {
    return false;
  }

  try {
    events?.emit?.(
      eventName,
      payload
    );

    return true;
  } catch {}

  return false;
}

function ensureMap(value) {
  return value instanceof Map
    ? value
    : new Map();
}

function createNoopDisposer() {
  const noop = () => false;

  try {
    noop.__cleanupNoop =
      true;
  } catch {}

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

function getBody() {
  try {
    return getDocument()?.body || null;
  } catch {}

  return null;
}

function getHtml() {
  try {
    return getDocument()?.documentElement || null;
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

function resolveSpecialTarget(value) {
  const key =
    safeText(value, "")
      .toLowerCase();

  if (key === "window") {
    return getWindow();
  }

  if (key === "document") {
    return getDocument();
  }

  if (key === "body") {
    return getBody();
  }

  if (
    key === "html" ||
    key === "documentelement" ||
    key === "document-element"
  ) {
    return getHtml();
  }

  return null;
}

function resolveEventTarget(target) {
  if (isEventTargetLike(target)) {
    return target;
  }

  if (typeof target === "string") {
    return resolveSpecialTarget(target);
  }

  return null;
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
  if (typeof target === "string") {
    return `target:${safeText(target, "string").toLowerCase()}`;
  }

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

/* =========================================================
   OPTIONS NORMALIZATION
========================================================= */

function wantsOnce(options = false) {
  return Boolean(
    isPlainObject(options) &&
    options.once === true
  );
}

function normalizeDomOptions(options = false) {
  if (options === true) {
    return {
      capture:
        true,
    };
  }

  if (
    options === false ||
    options === undefined ||
    options === null
  ) {
    return false;
  }

  if (isPlainObject(options)) {
    return {
      capture:
        Boolean(options.capture),

      passive:
        Boolean(options.passive),
    };
  }

  return false;
}

function normalizeBusOptions(options = false) {
  if (!isPlainObject(options)) {
    return options;
  }

  const {
    once,
    ...rest
  } = options;

  return rest;
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
              ? `target:${safeText(options.target, "custom").toLowerCase()}`
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

function createScopeRecord(name = DEFAULT_SCOPE) {
  const createdAtMs =
    safeNow();

  return {
    name:
      safeText(name, DEFAULT_SCOPE),

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

    addedCount:
      0,

    manualDisposeCount:
      0,
  };
}

function normalizeScopeRecord(scope, name = DEFAULT_SCOPE) {
  if (
    scope &&
    isObject(scope) &&
    Array.isArray(scope.listeners) &&
    Array.isArray(scope.cleaners)
  ) {
    if (!Array.isArray(scope.disposers)) {
      scope.disposers =
        [];
    }

    if (!(scope.keys instanceof Set)) {
      scope.keys =
        new Set();
    }

    if (!(scope.records instanceof Map)) {
      scope.records =
        new Map();
    }

    scope.name =
      safeText(
        scope.name,
        name || DEFAULT_SCOPE
      );

    scope.running =
      Boolean(scope.running);

    scope.disposed =
      Boolean(scope.disposed);

    scope.createdAt =
      safeText(
        scope.createdAt,
        safeIsoDate()
      );

    scope.createdAtMs =
      safeNumber(
        scope.createdAtMs,
        safeNow()
      );

    scope.lastRunAt =
      safeText(
        scope.lastRunAt,
        ""
      );

    scope.lastRunAtMs =
      safeNumber(
        scope.lastRunAtMs,
        0
      );

    scope.runCount =
      safeNumber(
        scope.runCount,
        0
      );

    scope.disposedCount =
      safeNumber(
        scope.disposedCount,
        0
      );

    scope.failedCount =
      safeNumber(
        scope.failedCount,
        0
      );

    scope.addedCount =
      safeNumber(
        scope.addedCount,
        scope.records.size
      );

    scope.manualDisposeCount =
      safeNumber(
        scope.manualDisposeCount,
        0
      );

    return scope;
  }

  if (scope instanceof Set) {
    const record =
      createScopeRecord(name);

    for (const disposer of Array.from(scope)) {
      if (isFunction(disposer)) {
        const key =
          makeManualKey(
            disposer,
            "legacy-set"
          );

        const wrapped =
          () => {
            try {
              disposer();
              return true;
            } catch {
              return false;
            }
          };

        record.keys.add(key);

        record.records.set(
          key,
          {
            key,
            type:
              "manual",
            label:
              "legacy-set",
            disposer:
              wrapped,
            dispose:
              disposer,
            createdAt:
              safeIsoDate(),
            createdAtMs:
              safeNow(),
          }
        );

        record.cleaners.push(wrapped);
        record.disposers.push(wrapped);
      }
    }

    record.addedCount =
      record.records.size;

    return record;
  }

  return createScopeRecord(name);
}

/* =========================================================
   SIGNATURE HELPERS
========================================================= */

function normalizeAddArgs(scopeName, disposer, label) {
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
      safeText(scopeName, DEFAULT_SCOPE),

    disposer:
      finalDisposer,

    label:
      safeText(finalLabel, "manual"),
  };
}

function normalizeTimerArgs(fnOrDelay, delayOrFn, label = "") {
  let fn =
    fnOrDelay;

  let delay =
    delayOrFn;

  if (
    typeof fnOrDelay === "number" &&
    isFunction(delayOrFn)
  ) {
    fn =
      delayOrFn;

    delay =
      fnOrDelay;
  }

  return {
    fn,
    delay:
      Math.max(
        0,
        safeNumber(delay, 0)
      ),

    label:
      safeText(label, "timer"),
  };
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

  function reportError({
    scope,
    key = "",
    type = "cleanup",
    label = "",
    error,
    source = "cleanup",
  } = {}) {
    const payload = {
      scope:
        scope?.name || "",

      key:
        key || "",

      type:
        safeText(type, "cleanup"),

      label:
        safeText(label, ""),

      source:
        safeText(source, "cleanup"),

      message:
        safeText(
          error?.message || error,
          "Cleanup error."
        ),

      name:
        safeText(
          error?.name,
          "Error"
        ),

      at:
        safeIsoDate(),
    };

    safeWarn(
      utils,
      `Error limpiando "${payload.label || payload.type}" en scope "${payload.scope || DEFAULT_SCOPE}".`,
      error
    );

    safeEmit(
      events,
      CLEANUP_EVENTS.error,
      payload
    );

    return payload;
  }

  function ensureScope(name = DEFAULT_SCOPE) {
    const scopeName =
      safeText(name, DEFAULT_SCOPE);

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

  function hasScope(name = DEFAULT_SCOPE) {
    return finalRegistry.scopes.has(
      safeText(name, DEFAULT_SCOPE)
    );
  }

  function getScope(name = DEFAULT_SCOPE) {
    return ensureScope(name);
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

    try {
      scope.records.delete(key);
    } catch {}

    try {
      scope.keys?.delete?.(key);
    } catch {}

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

  function disposeRecordInternal(scope, key = "", reason = "manual") {
    if (
      !scope ||
      !key
    ) {
      return {
        ran:
          false,
        ok:
          false,
        failed:
          false,
        missing:
          true,
      };
    }

    const record =
      scope.records?.get?.(key);

    if (!record) {
      return {
        ran:
          false,
        ok:
          false,
        failed:
          false,
        missing:
          true,
      };
    }

    if (record.disposed === true) {
      removeRecordFromScope(
        scope,
        key
      );

      return {
        ran:
          false,
        ok:
          false,
        failed:
          false,
        disposed:
          true,
      };
    }

    record.disposed =
      true;

    record.disposedAt =
      safeIsoDate();

    record.disposedReason =
      safeText(reason, "manual");

    try {
      const result =
        isFunction(record.dispose)
          ? record.dispose()
          : undefined;

      if (
        result &&
        typeof result === "object" &&
        isFunction(result.catch)
      ) {
        result.catch((error) => {
          reportError({
            scope,
            key,
            type:
              record.type,
            label:
              record.label,
            error,
            source:
              `${record.type}:async`,
          });
        });
      }

      safeEmit(
        events,
        CLEANUP_EVENTS.disposed,
        {
          scope:
            scope?.name || "",

          key,

          type:
            record.type || "manual",

          label:
            record.label || "",

          reason:
            record.disposedReason,

          at:
            record.disposedAt,
        }
      );

      removeRecordFromScope(
        scope,
        key
      );

      return {
        ran:
          true,
        ok:
          true,
        failed:
          false,
      };
    } catch (error) {
      reportError({
        scope,
        key,
        type:
          record.type,
        label:
          record.label,
        error,
        source:
          record.type || "cleanup",
      });

      removeRecordFromScope(
        scope,
        key
      );

      return {
        ran:
          true,
        ok:
          false,
        failed:
          true,
      };
    }
  }

  function pushRecord(scope, key, recordInput = {}) {
    if (
      !scope ||
      !key ||
      !isFunction(recordInput.dispose)
    ) {
      return createNoopDisposer();
    }

    if (scope.keys.has(key)) {
      const existing =
        scope.records.get(key);

      return isFunction(existing?.disposer)
        ? existing.disposer
        : createNoopDisposer();
    }

    const publicDisposer = () => {
      const result =
        disposeRecordInternal(
          scope,
          key,
          "manual"
        );

      if (result.ran) {
        scope.manualDisposeCount =
          safeNumber(
            scope.manualDisposeCount,
            0
          ) + 1;
      }

      return result.ok === true;
    };

    try {
      publicDisposer.__cleanupWrapped =
        true;

      publicDisposer.__cleanupType =
        safeText(recordInput.type, "manual");

      publicDisposer.__cleanupKey =
        key;

      publicDisposer.__cleanupLabel =
        safeText(recordInput.label, "");

      publicDisposer.__cleanupScope =
        scope?.name || "";
    } catch {}

    const record = {
      key,

      type:
        safeText(recordInput.type, "manual"),

      label:
        safeText(recordInput.label, ""),

      eventName:
        safeText(recordInput.eventName, ""),

      targetType:
        safeText(recordInput.targetType, ""),

      createdAt:
        safeIsoDate(),

      createdAtMs:
        safeNow(),

      disposed:
        false,

      disposedAt:
        "",

      disposedReason:
        "",

      dispose:
        recordInput.dispose,

      disposer:
        publicDisposer,
    };

    scope.keys.add(key);

    scope.records.set(
      key,
      record
    );

    if (record.type === "dom") {
      scope.listeners.push(
        publicDisposer
      );
    } else {
      scope.cleaners.push(
        publicDisposer
      );
    }

    scope.disposers.push(
      publicDisposer
    );

    scope.disposed =
      false;

    scope.addedCount =
      safeNumber(
        scope.addedCount,
        0
      ) + 1;

    safeEmit(
      events,
      CLEANUP_EVENTS.recordAdded,
      {
        scope:
          scope.name,

        key,

        type:
          record.type,

        label:
          record.label,

        eventName:
          record.eventName,

        targetType:
          record.targetType,

        at:
          record.createdAt,
      }
    );

    return publicDisposer;
  }

  function callHandlerSafely({
    scope,
    key = "",
    type = "handler",
    label = "",
    handler,
    thisArg = null,
    args = [],
  } = {}) {
    if (!isFunction(handler)) {
      return false;
    }

    try {
      const result =
        handler.apply(
          thisArg,
          safeArray(args)
        );

      if (
        result &&
        typeof result === "object" &&
        isFunction(result.catch)
      ) {
        result.catch((error) => {
          reportError({
            scope,
            key,
            type,
            label,
            error,
            source:
              `${type}:async-handler`,
          });
        });
      }

      return true;
    } catch (error) {
      reportError({
        scope,
        key,
        type,
        label,
        error,
        source:
          `${type}:handler`,
      });

      return false;
    }
  }

  function registerDomListener(
    scopeName = DEFAULT_SCOPE,
    target,
    eventName,
    handler,
    options = false
  ) {
    const scope =
      ensureScope(scopeName);

    const finalTarget =
      resolveEventTarget(target);

    const cleanEvent =
      safeText(eventName, "");

    if (
      !isEventTargetLike(finalTarget) ||
      !cleanEvent ||
      !isFunction(handler)
    ) {
      return createNoopDisposer();
    }

    const key =
      makeDomKey(
        finalTarget,
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

    const once =
      wantsOnce(options);

    const domOptions =
      normalizeDomOptions(options);

    let publicDisposer =
      null;

    const wrappedHandler = function cleanupDomHandler(event) {
      if (once) {
        try {
          publicDisposer?.();
        } catch {}
      }

      return callHandlerSafely({
        scope,
        key,
        type:
          "dom",
        label:
          cleanEvent,
        handler,
        thisArg:
          this,
        args:
          [event],
      });
    };

    try {
      finalTarget.addEventListener(
        cleanEvent,
        wrappedHandler,
        domOptions
      );
    } catch (error) {
      reportError({
        scope,
        key,
        type:
          "dom",
        label:
          cleanEvent,
        error,
        source:
          "dom:addEventListener",
      });

      return createNoopDisposer();
    }

    publicDisposer =
      pushRecord(
        scope,
        key,
        {
          type:
            "dom",

          label:
            cleanEvent,

          eventName:
            cleanEvent,

          targetType:
            finalTarget?.constructor?.name || typeof finalTarget,

          dispose:
            () => {
              finalTarget.removeEventListener(
                cleanEvent,
                wrappedHandler,
                domOptions
              );
            },
        }
      );

    return publicDisposer;
  }

  function registerBusListener(
    scopeName = DEFAULT_SCOPE,
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

    const once =
      wantsOnce(options);

    let publicDisposer =
      null;

    const wrappedHandler = function cleanupBusHandler(event) {
      if (once) {
        try {
          publicDisposer?.();
        } catch {}
      }

      return callHandlerSafely({
        scope,
        key,
        type:
          "bus",
        label:
          cleanEvent,
        handler,
        thisArg:
          this,
        args:
          [event],
      });
    };

    const busOptions =
      normalizeBusOptions(options);

    let off =
      null;

    try {
      if (isFunction(events?.on)) {
        off =
          events.on(
            cleanEvent,
            wrappedHandler,
            busOptions
          );
      }
    } catch (error) {
      reportError({
        scope,
        key,
        type:
          "bus",
        label:
          cleanEvent,
        error,
        source:
          "bus:on",
      });
    }

    if (!isFunction(off)) {
      off =
        () => {
          try {
            events?.off?.(
              cleanEvent,
              wrappedHandler,
              busOptions
            );
          } catch {}
        };
    }

    publicDisposer =
      pushRecord(
        scope,
        key,
        {
          type:
            "bus",

          label:
            cleanEvent,

          eventName:
            cleanEvent,

          targetType:
            "event-bus",

          dispose:
            off,
        }
      );

    return publicDisposer;
  }

  function add(scopeName = DEFAULT_SCOPE, disposer, label = "manual") {
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

    return pushRecord(
      scope,
      key,
      {
        type:
          "manual",

        label:
          args.label,

        targetType:
          "manual",

        dispose:
          args.disposer,
      }
    );
  }

  function on(scopeName = DEFAULT_SCOPE, target, eventName, handler, options = false) {
    return registerDomListener(
      scopeName,
      target,
      eventName,
      handler,
      options
    );
  }

  function event(scopeName = DEFAULT_SCOPE, targetOrName, eventNameOrHandler, handlerOrOptions, maybeOptions) {
    /*
      Firmas soportadas:

      DOM:
        cleanup.event(scope, window, "resize", handler, options)
        cleanup.event(scope, "window", "resize", handler, options)
        cleanup.event(scope, "document", "click", handler, options)

      Bus:
        cleanup.event(scope, "app:ready", handler, options)
    */

    const specialTarget =
      typeof targetOrName === "string" &&
      typeof eventNameOrHandler === "string" &&
      isFunction(handlerOrOptions)
        ? resolveSpecialTarget(targetOrName)
        : null;

    if (
      isEventTargetLike(targetOrName) ||
      specialTarget
    ) {
      return registerDomListener(
        scopeName,
        specialTarget || targetOrName,
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

  function bus(scopeName = DEFAULT_SCOPE, eventName, handler, options = false) {
    return registerBusListener(
      scopeName,
      eventName,
      handler,
      options
    );
  }

  function windowEvent(scopeName = DEFAULT_SCOPE, eventName, handler, options = false) {
    return registerDomListener(
      scopeName,
      getWindow(),
      eventName,
      handler,
      options
    );
  }

  function documentEvent(scopeName = DEFAULT_SCOPE, eventName, handler, options = false) {
    return registerDomListener(
      scopeName,
      getDocument(),
      eventName,
      handler,
      options
    );
  }

  function timeout(scopeName = DEFAULT_SCOPE, fnOrDelay, delayOrFn = 0, label = "timeout") {
    const args =
      normalizeTimerArgs(
        fnOrDelay,
        delayOrFn,
        label
      );

    if (!isFunction(args.fn)) {
      return createNoopDisposer();
    }

    const scope =
      ensureScope(scopeName);

    let key =
      "";

    const timerId =
      setTimeout(() => {
        callHandlerSafely({
          scope,
          key,
          type:
            "timeout",
          label:
            args.label,
          handler:
            args.fn,
          thisArg:
            null,
          args:
            [],
        });

        if (key) {
          disposeRecordInternal(
            scope,
            key,
            "timeout-fired"
          );
        }
      }, args.delay);

    key =
      makeResourceKey(
        "timeout",
        String(timerId),
        args.label
      );

    return pushRecord(
      scope,
      key,
      {
        type:
          "timeout",

        label:
          args.label,

        targetType:
          "timer",

        dispose:
          () => {
            clearTimeout(timerId);
          },
      }
    );
  }

  function interval(scopeName = DEFAULT_SCOPE, fnOrDelay, delayOrFn = 0, label = "interval") {
    const args =
      normalizeTimerArgs(
        fnOrDelay,
        delayOrFn,
        label
      );

    if (!isFunction(args.fn)) {
      return createNoopDisposer();
    }

    const scope =
      ensureScope(scopeName);

    const timerId =
      setInterval(() => {
        callHandlerSafely({
          scope,
          key:
            makeResourceKey(
              "interval",
              String(timerId),
              args.label
            ),
          type:
            "interval",
          label:
            args.label,
          handler:
            args.fn,
          thisArg:
            null,
          args:
            [],
        });
      }, args.delay);

    const key =
      makeResourceKey(
        "interval",
        String(timerId),
        args.label
      );

    return pushRecord(
      scope,
      key,
      {
        type:
          "interval",

        label:
          args.label,

        targetType:
          "timer",

        dispose:
          () => {
            clearInterval(timerId);
          },
      }
    );
  }

  function raf(scopeName = DEFAULT_SCOPE, fn, label = "raf") {
    const win =
      getWindow();

    if (
      !win ||
      !isFunction(win.requestAnimationFrame)
    ) {
      return timeout(
        scopeName,
        fn,
        0,
        label
      );
    }

    if (!isFunction(fn)) {
      return createNoopDisposer();
    }

    const scope =
      ensureScope(scopeName);

    let key =
      "";

    const frameId =
      win.requestAnimationFrame((time) => {
        callHandlerSafely({
          scope,
          key,
          type:
            "raf",
          label,
          handler:
            fn,
          thisArg:
            null,
          args:
            [time],
        });

        if (key) {
          disposeRecordInternal(
            scope,
            key,
            "raf-fired"
          );
        }
      });

    key =
      makeResourceKey(
        "raf",
        String(frameId),
        label
      );

    return pushRecord(
      scope,
      key,
      {
        type:
          "raf",

        label,

        targetType:
          "animation-frame",

        dispose:
          () => {
            try {
              win.cancelAnimationFrame(frameId);
            } catch {}
          },
      }
    );
  }

  function idle(scopeName = DEFAULT_SCOPE, fn, options = {}, label = "idle") {
    const win =
      getWindow();

    if (
      !win ||
      !isFunction(win.requestIdleCallback)
    ) {
      return timeout(
        scopeName,
        fn,
        0,
        label
      );
    }

    if (!isFunction(fn)) {
      return createNoopDisposer();
    }

    const scope =
      ensureScope(scopeName);

    let key =
      "";

    const idleId =
      win.requestIdleCallback((deadline) => {
        callHandlerSafely({
          scope,
          key,
          type:
            "idle",
          label,
          handler:
            fn,
          thisArg:
            null,
          args:
            [deadline],
        });

        if (key) {
          disposeRecordInternal(
            scope,
            key,
            "idle-fired"
          );
        }
      }, isPlainObject(options) ? options : {});

    key =
      makeResourceKey(
        "idle",
        String(idleId),
        label
      );

    return pushRecord(
      scope,
      key,
      {
        type:
          "idle",

        label,

        targetType:
          "idle-callback",

        dispose:
          () => {
            try {
              win.cancelIdleCallback(idleId);
            } catch {}
          },
      }
    );
  }

  function observer(scopeName = DEFAULT_SCOPE, observerRef, label = "observer") {
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

    return pushRecord(
      scope,
      key,
      {
        type:
          "observer",

        label,

        targetType:
          observerRef?.constructor?.name || "observer",

        dispose:
          () => {
            observerRef.disconnect();
          },
      }
    );
  }

  function abortController(scopeName = DEFAULT_SCOPE, controller, label = "abort-controller", reason = "cleanup") {
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

    return pushRecord(
      scope,
      key,
      {
        type:
          "abort",

        label,

        targetType:
          "AbortController",

        dispose:
          () => {
            try {
              controller.abort(reason);
            } catch {
              try {
                controller.abort();
              } catch {}
            }
          },
      }
    );
  }

  function off(scopeName = DEFAULT_SCOPE, keyOrDisposer = "") {
    const scopeNameFinal =
      safeText(scopeName, DEFAULT_SCOPE);

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
        reportError({
          scope,
          key:
            "",
          type:
            "manual",
          label:
            "direct-disposer",
          error,
          source:
            "off:function",
        });

        return false;
      }
    }

    const key =
      safeText(keyOrDisposer, "");

    if (!key) {
      return false;
    }

    const result =
      disposeRecordInternal(
        scope,
        key,
        "off"
      );

    return result.ok === true;
  }

  function run(scopeName = DEFAULT_SCOPE, options = {}) {
    const cleanScopeName =
      safeText(scopeName, DEFAULT_SCOPE);

    const scope =
      finalRegistry.scopes.get(cleanScopeName);

    const opts =
      isPlainObject(options)
        ? options
        : {};

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

        running:
          false,

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

        missing:
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
      const keys =
        Array.from(
          scope.records instanceof Map
            ? scope.records.keys()
            : []
        );

      for (const key of keys) {
        const result =
          disposeRecordInternal(
            scope,
            key,
            "scope-run"
          );

        if (result.ran && result.ok) {
          disposed += 1;
        } else if (result.ran && result.failed) {
          failed += 1;
        }
      }
    } finally {
      scope.listeners =
        [];

      scope.cleaners =
        [];

      scope.disposers =
        [];

      try {
        scope.keys?.clear?.();
      } catch {}

      try {
        scope.records?.clear?.();
      } catch {}

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
        Math.max(
          0,
          safeNumber(
            scope.lastRunAtMs - startedAtMs,
            0
          )
        ),

      deleted:
        opts.deleteScope !== false,

      missing:
        false,

      running:
        false,

      at:
        scope.lastRunAt,
    };

    safeEmit(
      events,
      CLEANUP_EVENTS.scopeRun,
      payload
    );

    if (opts.deleteScope !== false) {
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

  function clear(scopeName = DEFAULT_SCOPE) {
    return run(scopeName);
  }

  function dispose(scopeName = DEFAULT_SCOPE) {
    return run(scopeName);
  }

  function reset(scopeName = DEFAULT_SCOPE) {
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

    const payload = {
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
    };

    safeEmit(
      events,
      CLEANUP_EVENTS.allRun,
      payload
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

  function getScopeSnapshot(scopeName = DEFAULT_SCOPE) {
    const cleanScopeName =
      safeText(scopeName, DEFAULT_SCOPE);

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

      addedCount:
        safeNumber(
          scope.addedCount,
          0
        ),

      manualDisposeCount:
        safeNumber(
          scope.manualDisposeCount,
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

          disposed:
            Boolean(record.disposed),

          createdAt:
            record.createdAt,

          disposedAt:
            record.disposedAt || "",
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
      version:
        CLEANUP_VERSION,

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
    const cleanScope =
      safeText(scopeName, "");

    if (cleanScope) {
      const scope =
        finalRegistry.scopes.get(cleanScope);

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
    version:
      CLEANUP_VERSION,

    events:
      CLEANUP_EVENTS,

    /*
      Compat:
      scope() devuelve string como API legacy.
      ensureScope()/getScope() devuelven el objeto completo.
    */
    scope(name = DEFAULT_SCOPE) {
      const scopeName =
        safeText(name, DEFAULT_SCOPE);

      ensureScope(scopeName);

      return scopeName;
    },

    ensureScope,
    getScope,
    hasScope,

    on,
    event,
    bus,
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

  safeEmit(
    events,
    CLEANUP_EVENTS.ready,
    {
      version:
        CLEANUP_VERSION,

      at:
        safeIsoDate(),
    }
  );

  safeLog(
    utils,
    "Cleanup ready.",
    {
      version:
        CLEANUP_VERSION,
    }
  );

  return api;
}

export {
  CLEANUP_VERSION,
  DEFAULT_SCOPE,
  CLEANUP_EVENTS,
};

export default {
  CLEANUP_VERSION,
  DEFAULT_SCOPE,
  CLEANUP_EVENTS,
  createCleanup,
};
