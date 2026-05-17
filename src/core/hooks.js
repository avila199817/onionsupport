/* =========================================================
   Onion Support - Core Hooks
   Archivo: /src/core/hooks.js

   Responsabilidad:
   - Registry mínimo de hooks.
   - add / remove / clear.
   - run en serie.
   - runParallel básico.
   - Sin imports.
   - Sin priority.
   - Sin timeouts.
   - Sin snapshots grandes.
   - Sin lógica rara.
========================================================= */

export const HOOKS_VERSION = "simple";

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

function ensureObject(value) {
  return isObject(value) ? value : {};
}

function normalizeHookList(value) {
  return Array.isArray(value) ? value.filter(isFunction) : [];
}

export function createHooks({ registry = {}, events = null } = {}) {
  const finalRegistry = ensureObject(registry);

  if (!isObject(finalRegistry.hooks)) {
    finalRegistry.hooks = {};
  }

  for (const type of DEFAULT_HOOK_TYPES) {
    if (!Array.isArray(finalRegistry.hooks[type])) {
      finalRegistry.hooks[type] = [];
    }
  }

  function defineType(type = "") {
    const name = text(type, "");

    if (!name) return false;

    if (!Array.isArray(finalRegistry.hooks[name])) {
      finalRegistry.hooks[name] = [];
    }

    return true;
  }

  function hasType(type = "") {
    return Array.isArray(finalRegistry.hooks[text(type, "")]);
  }

  function types() {
    return Object.keys(finalRegistry.hooks);
  }

  function add(type = "", handler = null) {
    const name = text(type, "");

    if (!name || !isFunction(handler)) {
      return () => false;
    }

    defineType(name);

    finalRegistry.hooks[name].push(handler);

    emit(events, HOOK_EVENTS.add, {
      type: name,
      count: finalRegistry.hooks[name].length,
    });

    return () => remove(name, handler);
  }

  function once(type = "", handler = null) {
    if (!isFunction(handler)) return () => false;

    let disposed = false;

    const dispose = add(type, async (payload, context) => {
      if (disposed) return payload;

      disposed = true;
      dispose();

      return handler(payload, context);
    });

    return dispose;
  }

  function remove(type = "", handler = null) {
    const name = text(type, "");

    if (!name || !Array.isArray(finalRegistry.hooks[name])) {
      return false;
    }

    const before = finalRegistry.hooks[name].length;

    finalRegistry.hooks[name] = finalRegistry.hooks[name].filter((item) => item !== handler);

    const removed = before - finalRegistry.hooks[name].length;

    if (removed > 0) {
      emit(events, HOOK_EVENTS.remove, {
        type: name,
        removed,
      });
    }

    return removed > 0;
  }

  function clear(type = "") {
    const name = text(type, "");

    if (name) {
      const count = finalRegistry.hooks[name]?.length || 0;
      finalRegistry.hooks[name] = [];

      emit(events, HOOK_EVENTS.clear, {
        type: name,
        count,
      });

      return count;
    }

    let count = 0;

    for (const hookType of types()) {
      count += finalRegistry.hooks[hookType]?.length || 0;
      finalRegistry.hooks[hookType] = [];
    }

    emit(events, HOOK_EVENTS.clear, {
      type: "*",
      count,
    });

    return count;
  }

  async function runSeries(type = "", payload = {}, context = {}) {
    const name = text(type, "");

    if (!name) return payload;

    const hooks = normalizeHookList(finalRegistry.hooks[name]);

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
          message: error?.message || String(error),
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
    const name = text(type, "");

    if (!name) return [];

    const hooks = normalizeHookList(finalRegistry.hooks[name]);

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
            message: error?.message || String(error),
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
    return [...normalizeHookList(finalRegistry.hooks[text(type, "")])];
  }

  function getEntries(type = "") {
    return get(type).map((handler, index) => ({
      index,
      type,
      name: handler.name || "",
    }));
  }

  function getEntry(type = "", handler = null) {
    const hooks = get(type);
    const index = hooks.indexOf(handler);

    return index >= 0
      ? {
          index,
          type,
          name: handler?.name || "",
        }
      : null;
  }

  function count(type = "") {
    const name = text(type, "");

    if (name) {
      return normalizeHookList(finalRegistry.hooks[name]).length;
    }

    return types().reduce((total, hookType) => {
      return total + normalizeHookList(finalRegistry.hooks[hookType]).length;
    }, 0);
  }

  function getSnapshot() {
    return {
      version: HOOKS_VERSION,
      types: types(),
      total: count(),
      counts: Object.fromEntries(
        types().map((type) => [type, count(type)])
      ),
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

export default {
  HOOKS_VERSION,
  DEFAULT_HOOK_TYPES,
  HOOK_EVENTS,
  createHooks,
};
