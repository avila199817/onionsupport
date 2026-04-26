/* =========================================================
   Onion SPA - Core Hooks
   Archivo: src/core/hooks.js

   Responsabilidades:
   - registrar hooks internos del core
   - validar tipos de hook soportados
   - eliminar hooks registrados
   - ejecutar hooks en serie/paralelo de forma segura
   - exponer tipos disponibles
   - soportar prioridad y once
   - exponer snapshots de diagnóstico

   HARDENING EXTREMO:
   - cero throws accidentales por defecto
   - registry parcial tolerado
   - hooks idempotentes
   - disposer seguro
   - orden estable por prioridad
   - errores aislados por hook
   - compatibilidad con add/on/use/remove/clear
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const HOOKS_VERSION =
  "10.0.0";

const DEFAULT_HOOK_TYPES =
  Object.freeze([
    "beforeInit",
    "afterInit",

    "beforeRequest",
    "afterResponse",
    "onRequestError",

    "beforeRoute",
    "afterRoute",

    "beforeRender",
    "afterRender",
    "onRenderError",

    "beforeSessionRestore",
    "afterSessionRestore",
    "onSessionError",

    "beforeLogout",
    "afterLogout",

    "onError",
  ]);

const MAX_RECENT_EVENTS =
  40;

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

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
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

function safeClone(value, fallback = null) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {
    return fallback;
  }
}

function safeWarn(utils, ...args) {
  try {
    utils?.warn?.(
      "[Hooks]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[Hooks]",
      ...args
    );
  } catch {}
}

function safeLog(utils, ...args) {
  try {
    utils?.log?.(
      "[Hooks]",
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

function createNoopDisposer() {
  return () => false;
}

/* =========================================================
   IDS
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

function makeHookKey(type, handler, name = "") {
  return [
    safeText(type, ""),
    getHandlerId(handler),
    safeText(name, ""),
  ].join("::");
}

/* =========================================================
   REGISTRY
========================================================= */

function ensureRegistry(registry) {
  const finalRegistry =
    isObject(registry)
      ? registry
      : {};

  if (!isObject(finalRegistry.hooks)) {
    finalRegistry.hooks = {};
  }

  for (const type of DEFAULT_HOOK_TYPES) {
    if (!Array.isArray(finalRegistry.hooks[type])) {
      finalRegistry.hooks[type] = [];
    }
  }

  if (!isObject(finalRegistry.hookMeta)) {
    finalRegistry.hookMeta = {};
  }

  return finalRegistry;
}

function normalizeHookEntry(type, item, index = 0) {
  if (isFunction(item)) {
    return {
      type,
      handler:
        item,

      name:
        item.name || "",

      priority:
        0,

      once:
        false,

      enabled:
        true,

      key:
        makeHookKey(
          type,
          item,
          item.name || ""
        ),

      createdAt:
        "",

      createdAtMs:
        0,

      runCount:
        0,

      lastRunAt:
        "",

      lastDurationMs:
        0,

      index,
    };
  }

  if (
    isObject(item) &&
    isFunction(item.handler)
  ) {
    return {
      type,

      handler:
        item.handler,

      name:
        safeText(
          item.name,
          item.handler.name || ""
        ),

      priority:
        safeNumber(
          item.priority,
          0
        ),

      once:
        Boolean(item.once),

      enabled:
        item.enabled !== false,

      key:
        safeText(
          item.key,
          makeHookKey(
            type,
            item.handler,
            item.name || item.handler.name || ""
          )
        ),

      createdAt:
        item.createdAt || "",

      createdAtMs:
        item.createdAtMs || 0,

      runCount:
        safeNumber(
          item.runCount,
          0
        ),

      lastRunAt:
        item.lastRunAt || "",

      lastDurationMs:
        safeNumber(
          item.lastDurationMs,
          0
        ),

      index,
    };
  }

  return null;
}

function normalizeHookList(registry, type) {
  const list =
    safeArray(
      registry.hooks?.[type]
    );

  const normalized =
    list
      .map((item, index) =>
        normalizeHookEntry(
          type,
          item,
          index
        )
      )
      .filter(Boolean);

  normalized.sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }

    return a.index - b.index;
  });

  registry.hooks[type] =
    normalized;

  return normalized;
}

/* =========================================================
   FACTORY
========================================================= */

export function createHooks({
  registry,
  events,
  utils,
  strict = false,
  allowDynamicTypes = false,
} = {}) {
  const finalRegistry =
    ensureRegistry(registry);

  const state = {
    version:
      HOOKS_VERSION,

    addCount:
      0,

    removeCount:
      0,

    runCount:
      0,

    errorCount:
      0,

    lastType:
      "",

    lastRunAt:
      0,

    lastError:
      null,

    recent:
      [],
  };

  function pushRecent(event = {}) {
    const atMs =
      safeNow();

    state.recent.unshift({
      ...event,
      at:
        safeIsoDate(atMs),
      atMs,
    });

    if (state.recent.length > MAX_RECENT_EVENTS) {
      state.recent.splice(MAX_RECENT_EVENTS);
    }
  }

  function recordError(type, error, hook = null) {
    state.errorCount += 1;

    state.lastError = {
      type:
        safeText(type, ""),

      hook:
        hook?.name || hook?.key || "",

      message:
        safeText(
          error?.message || error,
          "Hook error."
        ),

      at:
        safeIsoDate(),
    };

    pushRecent({
      event:
        "error",

      type:
        safeText(type, ""),

      hook:
        state.lastError.hook,

      message:
        state.lastError.message,
    });

    safeWarn(
      utils,
      `Hook error en "${type}".`,
      error
    );

    safeEmit(
      events,
      "core:hook:error",
      state.lastError
    );
  }

  function hasType(type = "") {
    const cleanType =
      safeText(type, "");

    return Boolean(
      cleanType &&
      Array.isArray(finalRegistry.hooks?.[cleanType])
    );
  }

  function defineType(type = "") {
    const cleanType =
      safeText(type, "");

    if (!cleanType) {
      return false;
    }

    if (!Array.isArray(finalRegistry.hooks[cleanType])) {
      finalRegistry.hooks[cleanType] = [];
    }

    return true;
  }

  function ensureType(type = "") {
    const cleanType =
      safeText(type, "");

    if (!cleanType) {
      return "";
    }

    if (hasType(cleanType)) {
      return cleanType;
    }

    if (allowDynamicTypes) {
      defineType(cleanType);
      return cleanType;
    }

    const message =
      `Hook desconocido: ${cleanType}`;

    if (strict) {
      throw new Error(message);
    }

    safeWarn(
      utils,
      message
    );

    return "";
  }

  function add(type, handler, options = {}) {
    const cleanType =
      ensureType(type);

    if (!cleanType) {
      return createNoopDisposer();
    }

    if (!isFunction(handler)) {
      const message =
        "El hook debe ser una función.";

      if (strict) {
        throw new Error(message);
      }

      safeWarn(
        utils,
        message,
        {
          type:
            cleanType,
        }
      );

      return createNoopDisposer();
    }

    const opts =
      isObject(options)
        ? options
        : {};

    const createdAtMs =
      safeNow();

    const name =
      safeText(
        opts.name,
        handler.name || ""
      );

    const key =
      makeHookKey(
        cleanType,
        handler,
        name
      );

    const list =
      normalizeHookList(
        finalRegistry,
        cleanType
      );

    const existing =
      list.find((item) =>
        item.key === key
      );

    if (existing) {
      return () =>
        remove(
          cleanType,
          existing.key
        );
    }

    const entry = {
      type:
        cleanType,

      handler,

      name,

      priority:
        safeNumber(
          opts.priority,
          0
        ),

      once:
        Boolean(opts.once),

      enabled:
        opts.enabled !== false,

      key,

      createdAt:
        safeIsoDate(createdAtMs),

      createdAtMs,

      runCount:
        0,

      lastRunAt:
        "",

      lastDurationMs:
        0,

      index:
        list.length,
    };

    finalRegistry.hooks[cleanType].push(entry);

    normalizeHookList(
      finalRegistry,
      cleanType
    );

    state.addCount += 1;

    pushRecent({
      event:
        "add",

      type:
        cleanType,

      key,

      name:
        entry.name,

      priority:
        entry.priority,

      once:
        entry.once,
    });

    safeEmit(
      events,
      "core:hook:add",
      {
        type:
          cleanType,

        key,

        name:
          entry.name,

        priority:
          entry.priority,

        once:
          entry.once,
      }
    );

    return () =>
      remove(
        cleanType,
        key
      );
  }

  function once(type, handler, options = {}) {
    return add(
      type,
      handler,
      {
        ...(isObject(options) ? options : {}),
        once:
          true,
      }
    );
  }

  function remove(type, handlerOrKey) {
    const cleanType =
      safeText(type, "");

    if (!hasType(cleanType)) {
      return false;
    }

    const list =
      normalizeHookList(
        finalRegistry,
        cleanType
      );

    const before =
      list.length;

    const key =
      isFunction(handlerOrKey)
        ? getHandlerId(handlerOrKey)
        : safeText(handlerOrKey, "");

    finalRegistry.hooks[cleanType] =
      list.filter((entry) => {
        if (isFunction(handlerOrKey)) {
          return entry.handler !== handlerOrKey;
        }

        return (
          entry.key !== key &&
          entry.name !== key
        );
      });

    const removed =
      before - finalRegistry.hooks[cleanType].length;

    if (removed > 0) {
      state.removeCount += removed;

      pushRecent({
        event:
          "remove",

        type:
          cleanType,

        key,
        removed,
      });

      safeEmit(
        events,
        "core:hook:remove",
        {
          type:
            cleanType,

          key,
          removed,
        }
      );
    }

    return removed > 0;
  }

  function clear(type = "") {
    const cleanType =
      safeText(type, "");

    if (cleanType) {
      if (!hasType(cleanType)) {
        return 0;
      }

      const count =
        finalRegistry.hooks[cleanType].length;

      finalRegistry.hooks[cleanType] =
        [];

      pushRecent({
        event:
          "clear",

        type:
          cleanType,

        count,
      });

      return count;
    }

    let total =
      0;

    for (const hookType of types()) {
      total += clear(hookType);
    }

    return total;
  }

  function enable(type, handlerOrKey, value = true) {
    const cleanType =
      safeText(type, "");

    if (!hasType(cleanType)) {
      return false;
    }

    const key =
      isFunction(handlerOrKey)
        ? getHandlerId(handlerOrKey)
        : safeText(handlerOrKey, "");

    const list =
      normalizeHookList(
        finalRegistry,
        cleanType
      );

    let changed =
      false;

    for (const entry of list) {
      const match =
        isFunction(handlerOrKey)
          ? entry.handler === handlerOrKey
          : entry.key === key || entry.name === key;

      if (match) {
        entry.enabled =
          Boolean(value);

        changed =
          true;
      }
    }

    return changed;
  }

  async function run(type, payload = {}, options = {}) {
    const cleanType =
      ensureType(type);

    if (!cleanType) {
      return payload;
    }

    const opts =
      isObject(options)
        ? options
        : {};

    const mode =
      safeText(
        opts.mode,
        "series"
      );

    if (mode === "parallel") {
      return runParallel(
        cleanType,
        payload,
        opts
      );
    }

    return runSeries(
      cleanType,
      payload,
      opts
    );
  }

  async function runSeries(type, payload = {}, options = {}) {
    const cleanType =
      ensureType(type);

    if (!cleanType) {
      return payload;
    }

    const opts =
      isObject(options)
        ? options
        : {};

    let current =
      payload;

    const list =
      normalizeHookList(
        finalRegistry,
        cleanType
      ).filter((entry) =>
        entry.enabled !== false
      );

    state.runCount += 1;
    state.lastType =
      cleanType;
    state.lastRunAt =
      safeNow();

    safeEmit(
      events,
      "core:hook:run:start",
      {
        type:
          cleanType,

        count:
          list.length,

        mode:
          "series",
      }
    );

    for (const entry of list) {
      const startedAt =
        safeNow();

      try {
        const result =
          await entry.handler(
            current,
            {
              type:
                cleanType,

              hook:
                entry,

              registry:
                finalRegistry,
            }
          );

        entry.runCount += 1;
        entry.lastRunAt =
          safeIsoDate();
        entry.lastDurationMs =
          safeNow() - startedAt;

        if (result !== undefined) {
          current =
            result;
        }

        if (entry.once) {
          remove(
            cleanType,
            entry.key
          );
        }
      } catch (error) {
        recordError(
          cleanType,
          error,
          entry
        );

        if (opts.stopOnError === true) {
          break;
        }
      }
    }

    pushRecent({
      event:
        "run",

      type:
        cleanType,

      mode:
        "series",

      count:
        list.length,
    });

    safeEmit(
      events,
      "core:hook:run:done",
      {
        type:
          cleanType,

        count:
          list.length,

        mode:
          "series",
      }
    );

    return current;
  }

  async function runParallel(type, payload = {}, options = {}) {
    const cleanType =
      ensureType(type);

    if (!cleanType) {
      return [];
    }

    const list =
      normalizeHookList(
        finalRegistry,
        cleanType
      ).filter((entry) =>
        entry.enabled !== false
      );

    state.runCount += 1;
    state.lastType =
      cleanType;
    state.lastRunAt =
      safeNow();

    const results =
      await Promise.allSettled(
        list.map(async (entry) => {
          const startedAt =
            safeNow();

          try {
            const result =
              await entry.handler(
                payload,
                {
                  type:
                    cleanType,

                  hook:
                    entry,

                  registry:
                    finalRegistry,
                }
              );

            entry.runCount += 1;
            entry.lastRunAt =
              safeIsoDate();
            entry.lastDurationMs =
              safeNow() - startedAt;

            if (entry.once) {
              remove(
                cleanType,
                entry.key
              );
            }

            return result;
          } catch (error) {
            recordError(
              cleanType,
              error,
              entry
            );

            if (options.throwOnError === true) {
              throw error;
            }

            return undefined;
          }
        })
      );

    pushRecent({
      event:
        "run",

      type:
        cleanType,

      mode:
        "parallel",

      count:
        list.length,
    });

    return results;
  }

  function get(type = "") {
    const cleanType =
      safeText(type, "");

    if (!cleanType) {
      return [];
    }

    if (!hasType(cleanType)) {
      return [];
    }

    return normalizeHookList(
      finalRegistry,
      cleanType
    ).slice();
  }

  function types() {
    return Object.keys(
      finalRegistry.hooks || {}
    );
  }

  function count(type = "") {
    const cleanType =
      safeText(type, "");

    if (cleanType) {
      return get(cleanType).length;
    }

    return types().reduce((total, hookType) =>
      total + get(hookType).length,
      0
    );
  }

  function getSnapshot() {
    const hookTypes =
      types();

    return {
      version:
        state.version,

      types:
        hookTypes,

      total:
        count(),

      addCount:
        state.addCount,

      removeCount:
        state.removeCount,

      runCount:
        state.runCount,

      errorCount:
        state.errorCount,

      lastType:
        state.lastType,

      lastRunAt:
        state.lastRunAt,

      lastRunAtIso:
        state.lastRunAt
          ? safeIsoDate(state.lastRunAt)
          : "",

      lastError:
        state.lastError,

      counts:
        Object.fromEntries(
          hookTypes.map((hookType) => [
            hookType,
            get(hookType).length,
          ])
        ),

      hooks:
        Object.fromEntries(
          hookTypes.map((hookType) => [
            hookType,
            get(hookType).map((entry) => ({
              key:
                entry.key,

              name:
                entry.name,

              priority:
                entry.priority,

              once:
                entry.once,

              enabled:
                entry.enabled,

              createdAt:
                entry.createdAt,

              runCount:
                entry.runCount,

              lastRunAt:
                entry.lastRunAt,

              lastDurationMs:
                entry.lastDurationMs,
            })),
          ])
        ),

      recent:
        safeClone(
          state.recent,
          []
        ),
    };
  }

  function reset() {
    for (const hookType of types()) {
      finalRegistry.hooks[hookType] =
        [];
    }

    state.addCount =
      0;

    state.removeCount =
      0;

    state.runCount =
      0;

    state.errorCount =
      0;

    state.lastType =
      "";

    state.lastRunAt =
      0;

    state.lastError =
      null;

    state.recent =
      [];

    return getSnapshot();
  }

  safeLog(
    utils,
    "Hooks ready."
  );

  return {
    add,
    on:
      add,
    use:
      add,

    once,

    remove,
    off:
      remove,

    clear,

    enable,
    disable(type, handlerOrKey) {
      return enable(
        type,
        handlerOrKey,
        false
      );
    },

    run,
    runSeries,
    runParallel,

    defineType,
    hasType,
    types,
    get,
    count,

    getSnapshot,
    getDebugSnapshot:
      getSnapshot,

    reset,
  };
}

export default {
  createHooks,
};
