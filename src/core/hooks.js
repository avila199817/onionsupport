/* =========================================================
   Onion Support - Core Hooks
   Archivo: /src/core/hooks.js

   Responsabilidad:
   - Registry mínimo de hooks.
   - add / remove / clear.
   - run en serie.
   - runParallel básico.
   - Compat básica: on/use/register/off/unregister.
   - Sin imports.
   - Sin priority real.
   - Sin timeouts.
   - Sin snapshots grandes.
   - Sin lógica de dominio.
   - Un hook no rompe la ejecución.
========================================================= */

export const HOOKS_VERSION = "core.hooks.v3";

export const DEFAULT_HOOK_TYPES = Object.freeze([
  "beforeInit",
  "afterInit",
]);

export const HOOK_EVENTS = Object.freeze({
  ready: "core:hooks:ready",
  add: "core:hook:add",
  remove: "core:hook:remove",
  clear: "core:hook:clear",
  error: "core:hook:error",
  runStart: "core:hook:run:start",
  runDone: "core:hook:run:done",
});

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

function redact(value = "") {
  return text(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
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

function ensureHooksRegistry(registry = {}) {
  if (!isObject(registry.hooks)) {
    registry.hooks = Object.create(null);
  }

  return registry.hooks;
}

function normalizeHookList(value) {
  return Array.isArray(value) ? value.filter(isFunction) : [];
}

function hookName(handler = null) {
  return isFunction(handler) ? text(handler.name, "") : "";
}

function safeErrorMessage(error = null) {
  return redact(error?.message || String(error || "Error"));
}

/* =========================================================
   FACTORY
========================================================= */

export function createHooks({ registry = {}, events = null } = {}) {
  const finalRegistry = isObject(registry) ? registry : {};
  const hooksRegistry = ensureHooksRegistry(finalRegistry);

  function normalizeType(type = "") {
    return text(type, "");
  }

  function defineType(type = "") {
    const name = normalizeType(type);

    if (!name) return false;

    if (!Array.isArray(hooksRegistry[name])) {
      hooksRegistry[name] = [];
    }

    return true;
  }

  for (const type of DEFAULT_HOOK_TYPES) {
    defineType(type);
  }

  function hasType(type = "") {
    const name = normalizeType(type);
    return Boolean(name && Array.isArray(hooksRegistry[name]));
  }

  function types() {
    return Object.keys(hooksRegistry)
      .filter((type) => Array.isArray(hooksRegistry[type]));
  }

  function add(type = "", handler = null) {
    const name = normalizeType(type);

    if (!name || !isFunction(handler)) {
      return () => false;
    }

    defineType(name);

    hooksRegistry[name].push(handler);

    emit(events, HOOK_EVENTS.add, {
      type: name,
      count: hooksRegistry[name].length,
      name: hookName(handler),
    });

    let disposed = false;

    return function disposeHook() {
      if (disposed) return false;

      disposed = true;
      return remove(name, handler);
    };
  }

  function once(type = "", handler = null) {
    const name = normalizeType(type);

    if (!name || !isFunction(handler)) {
      return () => false;
    }

    let disposed = false;
    let dispose = () => false;

    dispose = add(name, async (payload, context) => {
      if (disposed) return payload;

      disposed = true;
      dispose();

      return handler(payload, context);
    });

    return dispose;
  }

  function remove(type = "", handler = null) {
    const name = normalizeType(type);

    if (!name || !Array.isArray(hooksRegistry[name])) {
      return false;
    }

    if (!handler) {
      const count = hooksRegistry[name].length;
      hooksRegistry[name] = [];

      if (count > 0) {
        emit(events, HOOK_EVENTS.remove, {
          type: name,
          removed: count,
        });
      }

      return count > 0;
    }

    const before = hooksRegistry[name].length;

    hooksRegistry[name] = hooksRegistry[name].filter((item) => item !== handler);

    const removed = before - hooksRegistry[name].length;

    if (removed > 0) {
      emit(events, HOOK_EVENTS.remove, {
        type: name,
        removed,
        name: hookName(handler),
      });
    }

    return removed > 0;
  }

  function clear(type = "") {
    const name = normalizeType(type);

    if (name) {
      const count = hooksRegistry[name]?.length || 0;
      hooksRegistry[name] = [];

      emit(events, HOOK_EVENTS.clear, {
        type: name,
        count,
      });

      return count;
    }

    let count = 0;

    for (const hookType of types()) {
      count += hooksRegistry[hookType]?.length || 0;
      hooksRegistry[hookType] = [];
    }

    emit(events, HOOK_EVENTS.clear, {
      type: "*",
      count,
    });

    return count;
  }

  async function runSeries(type = "", payload = {}, context = {}) {
    const name = normalizeType(type);

    if (!name) return payload;

    const hooks = [...normalizeHookList(hooksRegistry[name])];

    emit(events, HOOK_EVENTS.runStart, {
      type: name,
      count: hooks.length,
      mode: "series",
    });

    let current = payload;

    for (const hook of hooks) {
      try {
        const result = await hook(current, {
          ...context,
          type: name,
          hooks: api,
        });

        if (result !== undefined) {
          current = result;
        }
      } catch (error) {
        emit(events, HOOK_EVENTS.error, {
          type: name,
          mode: "series",
          name: hookName(hook),
          message: safeErrorMessage(error),
        });
      }
    }

    emit(events, HOOK_EVENTS.runDone, {
      type: name,
      count: hooks.length,
      mode: "series",
    });

    return current;
  }

  async function runParallel(type = "", payload = {}, context = {}) {
    const name = normalizeType(type);

    if (!name) return [];

    const hooks = [...normalizeHookList(hooksRegistry[name])];

    emit(events, HOOK_EVENTS.runStart, {
      type: name,
      count: hooks.length,
      mode: "parallel",
    });

    const results = await Promise.all(
      hooks.map(async (hook) => {
        try {
          return await hook(payload, {
            ...context,
            type: name,
            hooks: api,
          });
        } catch (error) {
          emit(events, HOOK_EVENTS.error, {
            type: name,
            mode: "parallel",
            name: hookName(hook),
            message: safeErrorMessage(error),
          });

          return undefined;
        }
      })
    );

    emit(events, HOOK_EVENTS.runDone, {
      type: name,
      count: hooks.length,
      mode: "parallel",
    });

    return results;
  }

  function run(type = "", payload = {}, options = {}) {
    return options?.mode === "parallel"
      ? runParallel(type, payload, options?.context || {})
      : runSeries(type, payload, options?.context || {});
  }

  function get(type = "") {
    return [...normalizeHookList(hooksRegistry[normalizeType(type)])];
  }

  function getEntries(type = "") {
    const name = normalizeType(type);

    return get(name).map((handler, index) => ({
      index,
      type: name,
      name: hookName(handler),
    }));
  }

  function getEntry(type = "", handler = null) {
    const name = normalizeType(type);
    const hooks = get(name);
    const index = hooks.indexOf(handler);

    return index >= 0
      ? {
          index,
          type: name,
          name: hookName(handler),
        }
      : null;
  }

  function count(type = "") {
    const name = normalizeType(type);

    if (name) {
      return normalizeHookList(hooksRegistry[name]).length;
    }

    return types().reduce((total, hookType) => {
      return total + normalizeHookList(hooksRegistry[hookType]).length;
    }, 0);
  }

  function getSnapshot() {
    const hookTypes = types();

    return {
      version: HOOKS_VERSION,
      types: hookTypes,
      total: count(),
      counts: Object.fromEntries(
        hookTypes.map((type) => [type, count(type)])
      ),

      policy: {
        minimalHooksRegistry: true,
        noImports: true,
        noPriorityRuntime: true,
        noTimeouts: true,
        runSeriesSupported: true,
        runParallelSupported: true,
        hooksDoNotBreakExecution: true,
        stableRunCopies: true,
        snapshotMinimal: true,
      },
    };
  }

  function reset() {
    clear();

    for (const type of DEFAULT_HOOK_TYPES) {
      defineType(type);
    }

    return getSnapshot();
  }

  const api = {
    version: HOOKS_VERSION,
    events: HOOK_EVENTS,

    add,
    on: add,
    use: add,
    register: add,

    once,

    remove,
    off: remove,
    delete: remove,
    unregister: remove,

    clear,

    enable() {
      return true;
    },

    disable() {
      return true;
    },

    setPriority() {
      return true;
    },

    priority() {
      return true;
    },

    run,
    execute: run,

    runSeries,
    runHookSeries: runSeries,
    pipe: runSeries,

    runParallel,
    runHookParallel: runParallel,

    defineType,
    hasType,
    types,

    get,
    list: getEntries,
    getEntries,
    getEntry,
    count,

    getSnapshot,
    getDebugSnapshot: getSnapshot,
    snapshot: getSnapshot,

    reset,
  };

  emit(events, HOOK_EVENTS.ready, {
    version: HOOKS_VERSION,
    total: count(),
  });

  return api;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  HOOKS_VERSION,
  DEFAULT_HOOK_TYPES,
  HOOK_EVENTS,
  createHooks,
};
