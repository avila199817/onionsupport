/* =========================================================
   Onion Support - Core Cleanup
   Archivo: /src/core/cleanup.js

   Responsabilidad:
   - Cleanup mínimo por scopes.
   - Registrar disposers.
   - Registrar eventos DOM.
   - Registrar eventos de bus si existe.
   - Registrar timers simples.
   - Registrar raf/idle.
   - Registrar observers.
   - Registrar AbortController.
   - Ejecutar limpieza por scope o global.
   - Sin imports.
   - Sin snapshots grandes.
   - Sin dedupe complejo.
   - Sin lógica de dominio.
========================================================= */

export const CLEANUP_VERSION = "core.cleanup.v3";
export const DEFAULT_SCOPE = "global";

export const CLEANUP_EVENTS = Object.freeze({
  ready: "cleanup:ready",
  added: "cleanup:record:added",
  disposed: "cleanup:disposed",
  scopeRun: "cleanup:scope:run",
  allRun: "cleanup:all:run",
  error: "cleanup:error",
});

const MAX_DELAY = 2147483647;

const BLOCKED_NAMES = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

let nextId = 1;

/* =========================================================
   BASICS
========================================================= */

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
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

function safeName(value = "", fallback = DEFAULT_SCOPE) {
  const clean = text(value, fallback).toLowerCase();

  if (!clean) return fallback;
  if (BLOCKED_NAMES.has(clean)) return fallback;

  return clean.slice(0, 160);
}

function safeLabel(value = "", fallback = "cleanup") {
  const clean = redact(text(value, fallback));

  return clean.slice(0, 180) || fallback;
}

function safeType(value = "manual") {
  const clean = text(value, "manual")
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!clean) return "manual";
  if (BLOCKED_NAMES.has(clean)) return "manual";

  return clean.slice(0, 40);
}

function safeDelay(value = 0) {
  const delay = Number(value);

  if (!Number.isFinite(delay)) return 0;
  if (delay <= 0) return 0;

  return Math.min(Math.floor(delay), MAX_DELAY);
}

function normalizeScope(value = DEFAULT_SCOPE) {
  return safeName(value, DEFAULT_SCOPE);
}

function emit(events, name, payload = {}) {
  if (!name) return false;

  try {
    if (isFunction(events?.emit)) {
      events.emit(name, payload);
      return true;
    }

    if (isFunction(events?.dispatch)) {
      events.dispatch(name, payload);
      return true;
    }

    if (isFunction(events?.trigger)) {
      events.trigger(name, payload);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function emitError(events, payload = {}) {
  return emit(events, CLEANUP_EVENTS.error, {
    scope: safeName(payload.scope, DEFAULT_SCOPE),
    id: text(payload.id, ""),
    type: safeType(payload.type || "cleanup"),
    label: safeLabel(payload.label, "cleanup"),
    reason: safeLabel(payload.reason, "cleanup-error"),
  });
}

/* =========================================================
   TARGETS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isEventTarget(value) {
  return Boolean(
    value &&
      isFunction(value.addEventListener) &&
      isFunction(value.removeEventListener)
  );
}

function browserTarget(name = "") {
  if (!isBrowser()) return null;

  const key = text(name, "").toLowerCase();

  if (key === "window") return window;
  if (key === "document") return document;
  if (key === "body") return document.body;
  if (key === "html") return document.documentElement;

  try {
    return document.querySelector(name);
  } catch {
    return null;
  }
}

function resolveTarget(target) {
  if (isEventTarget(target)) return target;
  if (typeof target === "string") return browserTarget(target);

  return null;
}

/* =========================================================
   RECORDS
========================================================= */

function createRecord(type = "manual", label = "", dispose = noop) {
  const cleanType = safeType(type);
  const cleanLabel = safeLabel(label, cleanType);

  let disposed = false;

  return {
    id: `${cleanType}:${nextId++}`,
    type: cleanType,
    label: cleanLabel,
    createdAt: nowIso(),

    dispose() {
      if (disposed) return false;

      disposed = true;

      try {
        return dispose() !== false;
      } catch {
        throw new Error(`Cleanup dispose failed: ${cleanLabel}`);
      }
    },
  };
}

function recordSnapshot(record = {}) {
  return {
    id: text(record.id, ""),
    type: safeType(record.type || "manual"),
    label: safeLabel(record.label, record.type || "manual"),
    createdAt: text(record.createdAt, ""),
  };
}

/* =========================================================
   ARG PARSERS
========================================================= */

function parseTimerArgs(args = [], fallbackLabel = "timer") {
  if (isFunction(args[0])) {
    return {
      scope: DEFAULT_SCOPE,
      fn: args[0],
      delay: safeDelay(args[1]),
      label: safeLabel(args[2], fallbackLabel),
    };
  }

  if (typeof args[0] === "number" && isFunction(args[1])) {
    return {
      scope: DEFAULT_SCOPE,
      fn: args[1],
      delay: safeDelay(args[0]),
      label: safeLabel(args[2], fallbackLabel),
    };
  }

  if (typeof args[0] === "string" && isFunction(args[1])) {
    return {
      scope: normalizeScope(args[0]),
      fn: args[1],
      delay: safeDelay(args[2]),
      label: safeLabel(args[3], fallbackLabel),
    };
  }

  if (
    typeof args[0] === "string" &&
    typeof args[1] === "number" &&
    isFunction(args[2])
  ) {
    return {
      scope: normalizeScope(args[0]),
      fn: args[2],
      delay: safeDelay(args[1]),
      label: safeLabel(args[3], fallbackLabel),
    };
  }

  return {
    scope: DEFAULT_SCOPE,
    fn: null,
    delay: 0,
    label: fallbackLabel,
  };
}

function parseEventArgs(args = []) {
  if (isEventTarget(args[0])) {
    return {
      scope: DEFAULT_SCOPE,
      target: args[0],
      eventName: args[1],
      handler: args[2],
      options: args[3] || false,
    };
  }

  if (
    typeof args[0] === "string" &&
    typeof args[1] === "string" &&
    isFunction(args[2])
  ) {
    return {
      scope: DEFAULT_SCOPE,
      target: args[0],
      eventName: args[1],
      handler: args[2],
      options: args[3] || false,
    };
  }

  return {
    scope: normalizeScope(args[0]),
    target: args[1],
    eventName: args[2],
    handler: args[3],
    options: args[4] || false,
  };
}

function parseBusArgs(args = []) {
  if (typeof args[0] === "string" && isFunction(args[1])) {
    return {
      scope: DEFAULT_SCOPE,
      eventName: args[0],
      handler: args[1],
      options: args[2],
    };
  }

  return {
    scope: normalizeScope(args[0]),
    eventName: args[1],
    handler: args[2],
    options: args[3],
  };
}

/* =========================================================
   FACTORY
========================================================= */

export function createCleanup(input = {}) {
  const registry = isObject(input.registry) ? input.registry : {};
  const events = input.events || input.bus || null;

  if (!(registry.scopes instanceof Map)) {
    registry.scopes = new Map();
  }

  function ensureScope(name = DEFAULT_SCOPE) {
    const scopeName = normalizeScope(name);

    if (!registry.scopes.has(scopeName)) {
      registry.scopes.set(scopeName, new Map());
    }

    return {
      name: scopeName,
      records: registry.scopes.get(scopeName),
    };
  }

  function scope(name = DEFAULT_SCOPE) {
    return ensureScope(name);
  }

  function getScope(name = DEFAULT_SCOPE) {
    return ensureScope(name);
  }

  function hasScope(name = DEFAULT_SCOPE) {
    return registry.scopes.has(normalizeScope(name));
  }

  function addRecord(scopeName = DEFAULT_SCOPE, type = "manual", label = "", disposer = noop) {
    if (!isFunction(disposer)) return noop;

    const currentScope = ensureScope(scopeName);
    const record = createRecord(type, label, disposer);

    currentScope.records.set(record.id, record);

    emit(events, CLEANUP_EVENTS.added, {
      scope: currentScope.name,
      id: record.id,
      type: record.type,
      label: record.label,
    });

    let disposed = false;

    return function disposeRecord() {
      if (disposed) return false;

      disposed = true;
      return off(currentScope.name, record.id);
    };
  }

  function add(scopeOrDisposer = DEFAULT_SCOPE, disposerOrLabel = null, label = "manual") {
    if (isFunction(scopeOrDisposer)) {
      return addRecord(
        DEFAULT_SCOPE,
        "manual",
        safeLabel(disposerOrLabel, "manual"),
        scopeOrDisposer
      );
    }

    return addRecord(
      normalizeScope(scopeOrDisposer),
      "manual",
      safeLabel(label, "manual"),
      disposerOrLabel
    );
  }

  function event(...args) {
    const parsed = parseEventArgs(args);
    const resolvedTarget = resolveTarget(parsed.target);
    const eventName = text(parsed.eventName, "");

    if (!resolvedTarget || !eventName || !isFunction(parsed.handler)) {
      return noop;
    }

    try {
      resolvedTarget.addEventListener(eventName, parsed.handler, parsed.options);
    } catch {
      return noop;
    }

    return addRecord(
      parsed.scope,
      "event",
      `event:${eventName}`,
      () => {
        resolvedTarget.removeEventListener(eventName, parsed.handler, parsed.options);
        return true;
      }
    );
  }

  function bus(...args) {
    const parsed = parseBusArgs(args);
    const eventName = text(parsed.eventName, "");

    if (!eventName || !isFunction(parsed.handler) || !isFunction(events?.on)) {
      return noop;
    }

    let dispose = null;

    try {
      dispose = events.on(eventName, parsed.handler, parsed.options);
    } catch {
      return noop;
    }

    if (!isFunction(dispose)) {
      dispose = () => {
        try {
          events?.off?.(eventName, parsed.handler);
          return true;
        } catch {
          return false;
        }
      };
    }

    return addRecord(
      parsed.scope,
      "bus",
      `bus:${eventName}`,
      dispose
    );
  }

  function on(...args) {
    if (isEventTarget(args[0])) {
      return event(...args);
    }

    if (typeof args[0] === "string" && isFunction(args[1])) {
      return bus(...args);
    }

    if (
      typeof args[0] === "string" &&
      typeof args[1] === "string" &&
      isFunction(args[2])
    ) {
      return resolveTarget(args[0]) ? event(...args) : bus(...args);
    }

    if (
      typeof args[0] === "string" &&
      (isEventTarget(args[1]) || typeof args[1] === "string") &&
      typeof args[2] === "string" &&
      isFunction(args[3])
    ) {
      return event(...args);
    }

    return bus(...args);
  }

  function windowEvent(scopeName = DEFAULT_SCOPE, eventName = "", handler = null, options = false) {
    return event(scopeName, "window", eventName, handler, options);
  }

  function documentEvent(scopeName = DEFAULT_SCOPE, eventName = "", handler = null, options = false) {
    return event(scopeName, "document", eventName, handler, options);
  }

  function timeout(...args) {
    const parsed = parseTimerArgs(args, "timeout");

    if (!isFunction(parsed.fn)) return noop;

    let dispose = noop;

    const id = setTimeout(() => {
      try {
        parsed.fn();
      } catch {
        emitError(events, {
          scope: parsed.scope,
          type: "timeout",
          label: parsed.label,
          reason: "callback-error",
        });
      } finally {
        dispose();
      }
    }, parsed.delay);

    dispose = addRecord(
      parsed.scope,
      "timeout",
      parsed.label,
      () => {
        clearTimeout(id);
        return true;
      }
    );

    return dispose;
  }

  function interval(...args) {
    const parsed = parseTimerArgs(args, "interval");

    if (!isFunction(parsed.fn)) return noop;

    const id = setInterval(() => {
      try {
        parsed.fn();
      } catch {
        emitError(events, {
          scope: parsed.scope,
          type: "interval",
          label: parsed.label,
          reason: "callback-error",
        });
      }
    }, parsed.delay);

    return addRecord(
      parsed.scope,
      "interval",
      parsed.label,
      () => {
        clearInterval(id);
        return true;
      }
    );
  }

  function raf(scopeName = DEFAULT_SCOPE, fn = null, label = "raf") {
    if (isFunction(scopeName)) {
      return raf(DEFAULT_SCOPE, scopeName, fn || "raf");
    }

    if (!isFunction(fn)) return noop;

    if (typeof requestAnimationFrame !== "function") {
      return timeout(scopeName, fn, 0, label);
    }

    let dispose = noop;

    const id = requestAnimationFrame((timestamp) => {
      try {
        fn(timestamp);
      } catch {
        emitError(events, {
          scope: scopeName,
          type: "raf",
          label,
          reason: "callback-error",
        });
      } finally {
        dispose();
      }
    });

    dispose = addRecord(
      normalizeScope(scopeName),
      "raf",
      safeLabel(label, "raf"),
      () => {
        cancelAnimationFrame(id);
        return true;
      }
    );

    return dispose;
  }

  function idle(scopeName = DEFAULT_SCOPE, fn = null, options = {}) {
    if (isFunction(scopeName)) {
      return idle(DEFAULT_SCOPE, scopeName, fn || {});
    }

    if (!isFunction(fn)) return noop;

    if (typeof requestIdleCallback !== "function") {
      return timeout(scopeName, fn, 0, "idle");
    }

    let dispose = noop;

    const id = requestIdleCallback((deadline) => {
      try {
        fn(deadline);
      } catch {
        emitError(events, {
          scope: scopeName,
          type: "idle",
          label: "idle",
          reason: "callback-error",
        });
      } finally {
        dispose();
      }
    }, isObject(options) ? options : {});

    dispose = addRecord(
      normalizeScope(scopeName),
      "idle",
      "idle",
      () => {
        cancelIdleCallback(id);
        return true;
      }
    );

    return dispose;
  }

  function observer(scopeName = DEFAULT_SCOPE, observerRef = null, label = "observer") {
    if (observerRef === null && isObject(scopeName) && isFunction(scopeName.disconnect)) {
      return observer(DEFAULT_SCOPE, scopeName, "observer");
    }

    if (!observerRef || !isFunction(observerRef.disconnect)) {
      return noop;
    }

    return addRecord(
      normalizeScope(scopeName),
      "observer",
      safeLabel(label, "observer"),
      () => {
        observerRef.disconnect();
        return true;
      }
    );
  }

  function abortController(scopeName = DEFAULT_SCOPE, controller = null, label = "abort") {
    if (controller === null && isObject(scopeName) && isFunction(scopeName.abort)) {
      return abortController(DEFAULT_SCOPE, scopeName, "abort");
    }

    if (!controller || !isFunction(controller.abort)) {
      return noop;
    }

    return addRecord(
      normalizeScope(scopeName),
      "abort",
      safeLabel(label, "abort"),
      () => {
        try {
          controller.abort("cleanup");
        } catch {
          controller.abort();
        }

        return true;
      }
    );
  }

  function off(scopeName = DEFAULT_SCOPE, idOrDisposer = "") {
    if (isFunction(scopeName)) {
      try {
        return scopeName() !== false;
      } catch {
        return false;
      }
    }

    if (isFunction(idOrDisposer)) {
      try {
        return idOrDisposer() !== false;
      } catch {
        return false;
      }
    }

    const name = normalizeScope(scopeName);
    const id = text(idOrDisposer, "");

    if (!id) return false;

    const records = registry.scopes.get(name);

    if (!records || !records.has(id)) {
      return false;
    }

    const record = records.get(id);

    records.delete(id);

    try {
      const ok = record.dispose() !== false;

      emit(events, CLEANUP_EVENTS.disposed, {
        scope: name,
        id,
        type: record.type,
        label: record.label,
      });

      return ok;
    } catch {
      emitError(events, {
        scope: name,
        id,
        type: record.type,
        label: record.label,
        reason: "dispose-error",
      });

      return false;
    }
  }

  function run(scopeName = DEFAULT_SCOPE, options = {}) {
    const name = normalizeScope(scopeName);
    const records = registry.scopes.get(name);

    if (!records) {
      return {
        scope: name,
        disposed: 0,
        failed: 0,
        missing: true,
      };
    }

    let disposed = 0;
    let failed = 0;

    for (const id of [...records.keys()]) {
      const ok = off(name, id);

      if (ok) disposed += 1;
      else failed += 1;
    }

    if (options.deleteScope !== false) {
      registry.scopes.delete(name);
    }

    const result = {
      scope: name,
      disposed,
      failed,
    };

    emit(events, CLEANUP_EVENTS.scopeRun, result);

    return result;
  }

  function runAll(options = {}) {
    const names = [...registry.scopes.keys()].sort();
    const results = [];

    for (const name of names) {
      if (!registry.scopes.has(name)) continue;
      results.push(run(name, options));
    }

    emit(events, CLEANUP_EVENTS.allRun, {
      count: results.length,
    });

    return results;
  }

  function clear(scopeName = DEFAULT_SCOPE) {
    return run(scopeName);
  }

  function dispose(scopeName = DEFAULT_SCOPE) {
    return run(scopeName);
  }

  function reset(scopeName = DEFAULT_SCOPE) {
    return run(scopeName, {
      deleteScope: false,
    });
  }

  function clearAll() {
    return runAll();
  }

  function disposeAll() {
    return runAll();
  }

  function resetAll() {
    return runAll({
      deleteScope: false,
    });
  }

  function size(scopeName = "") {
    const name = text(scopeName, "");

    if (name) {
      return registry.scopes.get(normalizeScope(name))?.size || 0;
    }

    let total = 0;

    for (const records of registry.scopes.values()) {
      total += records.size;
    }

    return total;
  }

  function getScopeSnapshot(scopeName = DEFAULT_SCOPE) {
    const name = normalizeScope(scopeName);
    const records = registry.scopes.get(name);

    return {
      exists: Boolean(records),
      name,
      recordCount: records?.size || 0,
      records: records
        ? [...records.values()]
            .map(recordSnapshot)
            .sort((left, right) => left.id.localeCompare(right.id))
        : [],
    };
  }

  function getSnapshot() {
    const scopes = [...registry.scopes.keys()]
      .sort()
      .map(getScopeSnapshot);

    return {
      version: CLEANUP_VERSION,
      scopeCount: scopes.length,
      totalRecords: size(),
      scopes,

      policy: {
        scopedCleanup: true,
        scopesNormalized: true,

        noImports: true,
        noDomRequired: true,

        domEventsSupported: true,
        busEventsSupported: true,
        timersSupported: true,
        rafSupported: true,
        idleSupported: true,
        observerSupported: true,
        abortControllerSupported: true,

        idempotentDisposers: true,
        callbacksIsolated: true,
        snapshotMinimal: true,
      },
    };
  }

  emit(events, CLEANUP_EVENTS.ready, {
    version: CLEANUP_VERSION,
  });

  return {
    version: CLEANUP_VERSION,
    events: CLEANUP_EVENTS,

    scope,
    ensureScope,
    getScope,
    hasScope,

    add,
    off,

    on,
    event,
    bus,

    windowEvent,
    documentEvent,

    timeout,
    interval,

    raf,
    animationFrame: raf,

    idle,
    idleCallback: idle,

    observer,

    abortController,
    abort: abortController,

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
    getDebugSnapshot: getSnapshot,
    snapshot: getSnapshot,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  CLEANUP_VERSION,
  DEFAULT_SCOPE,
  CLEANUP_EVENTS,
  createCleanup,
};
