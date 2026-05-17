/* =========================================================
   Onion Support - Core Cleanup
   Archivo: /src/core/cleanup.js

   Responsabilidad:
   - Cleanup mínimo por scopes.
   - Registrar disposers.
   - Registrar eventos DOM.
   - Registrar eventos de bus si existe.
   - Registrar timers simples.
   - Ejecutar limpieza.
   - Sin imports.
   - Sin snapshots grandes.
   - Sin dedupe complejo.
   - Sin lógica rara.
========================================================= */

export const CLEANUP_VERSION = "simple";
export const DEFAULT_SCOPE = "global";

export const CLEANUP_EVENTS = Object.freeze({
  ready: "cleanup:ready",
  added: "cleanup:record:added",
  disposed: "cleanup:disposed",
  scopeRun: "cleanup:scope:run",
  allRun: "cleanup:all:run",
  error: "cleanup:error",
});

let nextId = 1;

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object");
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function noop() {
  return false;
}

function nowIso() {
  return new Date().toISOString();
}

function isEventTarget(value) {
  return Boolean(
    value &&
      isFunction(value.addEventListener) &&
      isFunction(value.removeEventListener)
  );
}

function browserTarget(name = "") {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

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

function emit(events, name, payload = {}) {
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

function createRecord(type = "manual", label = "", dispose = noop) {
  return {
    id: `${type}:${nextId++}`,
    type,
    label,
    dispose,
    createdAt: nowIso(),
  };
}

function parseTimerArgs(args, fallbackLabel) {
  if (isFunction(args[0])) {
    return {
      scope: DEFAULT_SCOPE,
      fn: args[0],
      delay: Number(args[1] || 0),
      label: text(args[2], fallbackLabel),
    };
  }

  if (typeof args[0] === "number" && isFunction(args[1])) {
    return {
      scope: DEFAULT_SCOPE,
      fn: args[1],
      delay: Number(args[0] || 0),
      label: text(args[2], fallbackLabel),
    };
  }

  if (isFunction(args[1])) {
    return {
      scope: text(args[0], DEFAULT_SCOPE),
      fn: args[1],
      delay: Number(args[2] || 0),
      label: text(args[3], fallbackLabel),
    };
  }

  if (typeof args[1] === "number" && isFunction(args[2])) {
    return {
      scope: text(args[0], DEFAULT_SCOPE),
      fn: args[2],
      delay: Number(args[1] || 0),
      label: text(args[3], fallbackLabel),
    };
  }

  return {
    scope: DEFAULT_SCOPE,
    fn: null,
    delay: 0,
    label: fallbackLabel,
  };
}

export function createCleanup(input = {}) {
  const registry = isObject(input.registry) ? input.registry : {};
  const events = input.events || input.bus || null;

  if (!(registry.scopes instanceof Map)) {
    registry.scopes = new Map();
  }

  function ensureScope(name = DEFAULT_SCOPE) {
    const scope = text(name, DEFAULT_SCOPE);

    if (!registry.scopes.has(scope)) {
      registry.scopes.set(scope, new Map());
    }

    return {
      name: scope,
      records: registry.scopes.get(scope),
    };
  }

  function scope(name = DEFAULT_SCOPE) {
    return ensureScope(name);
  }

  function getScope(name = DEFAULT_SCOPE) {
    return ensureScope(name);
  }

  function hasScope(name = DEFAULT_SCOPE) {
    return registry.scopes.has(text(name, DEFAULT_SCOPE));
  }

  function add(scopeOrDisposer = DEFAULT_SCOPE, disposerOrLabel = null, label = "manual") {
    let scopeName = DEFAULT_SCOPE;
    let disposer = null;
    let finalLabel = label;

    if (isFunction(scopeOrDisposer)) {
      disposer = scopeOrDisposer;
      finalLabel = text(disposerOrLabel, "manual");
    } else {
      scopeName = text(scopeOrDisposer, DEFAULT_SCOPE);
      disposer = disposerOrLabel;
      finalLabel = text(label, "manual");
    }

    if (!isFunction(disposer)) return noop;

    const currentScope = ensureScope(scopeName);
    const record = createRecord("manual", finalLabel, disposer);

    currentScope.records.set(record.id, record);

    emit(events, CLEANUP_EVENTS.added, {
      scope: currentScope.name,
      id: record.id,
      type: record.type,
      label: record.label,
    });

    return () => off(currentScope.name, record.id);
  }

  function event(...args) {
    let scopeName = DEFAULT_SCOPE;
    let target = null;
    let eventName = "";
    let handler = null;
    let options = false;

    if (isEventTarget(args[0]) || typeof args[0] === "string") {
      if (typeof args[1] === "string" && isFunction(args[2])) {
        target = args[0];
        eventName = args[1];
        handler = args[2];
        options = args[3] || false;
      } else {
        scopeName = text(args[0], DEFAULT_SCOPE);
        target = args[1];
        eventName = args[2];
        handler = args[3];
        options = args[4] || false;
      }
    }

    const resolvedTarget = resolveTarget(target);

    if (!resolvedTarget || !eventName || !isFunction(handler)) {
      return noop;
    }

    try {
      resolvedTarget.addEventListener(eventName, handler, options);
    } catch {
      return noop;
    }

    return add(scopeName, () => {
      resolvedTarget.removeEventListener(eventName, handler, options);
    }, `event:${eventName}`);
  }

  function on(...args) {
    if (isEventTarget(args[0]) || (typeof args[0] === "string" && typeof args[1] === "string" && isFunction(args[2]))) {
      return event(...args);
    }

    return bus(...args);
  }

  function bus(...args) {
    let scopeName = DEFAULT_SCOPE;
    let eventName = "";
    let handler = null;
    let options = undefined;

    if (typeof args[0] === "string" && isFunction(args[1])) {
      eventName = args[0];
      handler = args[1];
      options = args[2];
    } else {
      scopeName = text(args[0], DEFAULT_SCOPE);
      eventName = args[1];
      handler = args[2];
      options = args[3];
    }

    if (!eventName || !isFunction(handler) || !isFunction(events?.on)) {
      return noop;
    }

    let dispose = null;

    try {
      dispose = events.on(eventName, handler, options);
    } catch {
      return noop;
    }

    if (!isFunction(dispose)) {
      dispose = () => {
        try {
          events?.off?.(eventName, handler);
        } catch {
          // noop
        }
      };
    }

    return add(scopeName, dispose, `bus:${eventName}`);
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

    const id = setTimeout(parsed.fn, Math.max(0, parsed.delay));

    return add(parsed.scope, () => clearTimeout(id), parsed.label);
  }

  function interval(...args) {
    const parsed = parseTimerArgs(args, "interval");

    if (!isFunction(parsed.fn)) return noop;

    const id = setInterval(parsed.fn, Math.max(0, parsed.delay));

    return add(parsed.scope, () => clearInterval(id), parsed.label);
  }

  function raf(scopeName = DEFAULT_SCOPE, fn = null, label = "raf") {
    if (isFunction(scopeName)) {
      return raf(DEFAULT_SCOPE, scopeName, fn || "raf");
    }

    if (!isFunction(fn)) return noop;

    if (typeof requestAnimationFrame !== "function") {
      return timeout(scopeName, fn, 0, label);
    }

    const id = requestAnimationFrame(fn);

    return add(scopeName, () => cancelAnimationFrame(id), text(label, "raf"));
  }

  function idle(scopeName = DEFAULT_SCOPE, fn = null, options = {}) {
    if (isFunction(scopeName)) {
      return idle(DEFAULT_SCOPE, scopeName, fn || {});
    }

    if (!isFunction(fn)) return noop;

    if (typeof requestIdleCallback !== "function") {
      return timeout(scopeName, fn, 0, "idle");
    }

    const id = requestIdleCallback(fn, isObject(options) ? options : {});

    return add(scopeName, () => cancelIdleCallback(id), "idle");
  }

  function observer(scopeName = DEFAULT_SCOPE, observerRef = null, label = "observer") {
    if (observerRef === null && isObject(scopeName) && isFunction(scopeName.disconnect)) {
      return observer(DEFAULT_SCOPE, scopeName, "observer");
    }

    if (!observerRef || !isFunction(observerRef.disconnect)) {
      return noop;
    }

    return add(scopeName, () => observerRef.disconnect(), text(label, "observer"));
  }

  function abortController(scopeName = DEFAULT_SCOPE, controller = null, label = "abort") {
    if (controller === null && isObject(scopeName) && isFunction(scopeName.abort)) {
      return abortController(DEFAULT_SCOPE, scopeName, "abort");
    }

    if (!controller || !isFunction(controller.abort)) {
      return noop;
    }

    return add(scopeName, () => {
      try {
        controller.abort("cleanup");
      } catch {
        controller.abort();
      }
    }, text(label, "abort"));
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

    const currentScope = registry.scopes.get(text(scopeName, DEFAULT_SCOPE));
    const id = text(idOrDisposer, "");

    if (!currentScope || !id || !currentScope.has(id)) {
      return false;
    }

    const record = currentScope.get(id);
    currentScope.delete(id);

    try {
      record.dispose();
      emit(events, CLEANUP_EVENTS.disposed, {
        scope: text(scopeName, DEFAULT_SCOPE),
        id,
        type: record.type,
        label: record.label,
      });
      return true;
    } catch {
      emit(events, CLEANUP_EVENTS.error, {
        scope: text(scopeName, DEFAULT_SCOPE),
        id,
      });
      return false;
    }
  }

  function run(scopeName = DEFAULT_SCOPE, options = {}) {
    const name = text(scopeName, DEFAULT_SCOPE);
    const records = registry.scopes.get(name);

    if (!records) {
      return {
        scope: name,
        disposed: 0,
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
    const names = [...registry.scopes.keys()];
    const results = names.map((name) => run(name, options));

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
    if (scopeName) {
      return registry.scopes.get(scopeName)?.size || 0;
    }

    let total = 0;

    for (const records of registry.scopes.values()) {
      total += records.size;
    }

    return total;
  }

  function getScopeSnapshot(scopeName = DEFAULT_SCOPE) {
    const name = text(scopeName, DEFAULT_SCOPE);
    const records = registry.scopes.get(name);

    return {
      exists: Boolean(records),
      name,
      recordCount: records?.size || 0,
      records: records
        ? [...records.values()].map((record) => ({
            id: record.id,
            type: record.type,
            label: record.label,
            createdAt: record.createdAt,
          }))
        : [],
    };
  }

  function getSnapshot() {
    const scopes = [...registry.scopes.keys()].map(getScopeSnapshot);

    return {
      version: CLEANUP_VERSION,
      scopeCount: scopes.length,
      totalRecords: size(),
      scopes,
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

export default {
  CLEANUP_VERSION,
  DEFAULT_SCOPE,
  CLEANUP_EVENTS,
  createCleanup,
};
