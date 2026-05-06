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
   - compatibilidad crítica con AppCore.runInitHooks()
   - registry.hooks[type] mantiene funciones ejecutables
   - metadatos internos sin romper request.js
   - once funcional incluso si lo ejecuta otro módulo directamente
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const HOOKS_VERSION =
  "11.0.0";

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

const HOOK_EVENTS =
  Object.freeze({
    ready:
      "core:hooks:ready",

    add:
      "core:hook:add",

    remove:
      "core:hook:remove",

    clear:
      "core:hook:clear",

    error:
      "core:hook:error",

    runStart:
      "core:hook:run:start",

    runDone:
      "core:hook:run:done",

    runParallelDone:
      "core:hook:parallel:done",

    typeDefined:
      "core:hook:type-defined",
  });

const MAX_RECENT_EVENTS =
  60;

const DEFAULT_TIMEOUT_MS =
  0;

const HOOK_NAME_CONTROL_RE =
  /[\u0000-\u001f\u007f]/g;

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
    String(value)
      .replace(HOOK_NAME_CONTROL_RE, "")
      .trim();

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

function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === 1) return true;
  if (value === 0) return false;

  return Boolean(fallback);
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

function safeClone(value, fallback = null) {
  if (value === undefined) {
    return fallback;
  }

  if (value === null) {
    return null;
  }

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
  let done =
    false;

  try {
    if (isFunction(utils?.warn)) {
      utils.warn(
        "[Hooks]",
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

function createNoopDisposer() {
  const noop = () => false;

  noop.__hookNoop =
    true;

  return noop;
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

function normalizeTypeName(type = "") {
  return safeText(type, "");
}

function normalizeHookName(name = "") {
  return safeText(name, "");
}

function getRunnerEntry(runner) {
  try {
    return runner?.__hookEntry || null;
  } catch {
    return null;
  }
}

function isHookRunner(value) {
  return Boolean(
    isFunction(value) &&
    getRunnerEntry(value)
  );
}

function buildPublicHookEntry(entry = {}) {
  return {
    type:
      entry.type || "",

    key:
      entry.key || "",

    name:
      entry.name || "",

    priority:
      safeNumber(entry.priority, 0),

    once:
      Boolean(entry.once),

    enabled:
      entry.enabled !== false,

    createdAt:
      entry.createdAt || "",

    createdAtMs:
      safeNumber(entry.createdAtMs, 0),

    runCount:
      safeNumber(entry.runCount, 0),

    errorCount:
      safeNumber(entry.errorCount, 0),

    lastRunAt:
      entry.lastRunAt || "",

    lastDurationMs:
      safeNumber(entry.lastDurationMs, 0),

    lastError:
      entry.lastError
        ? safeClone(entry.lastError, null)
        : null,

    index:
      safeNumber(entry.index, 0),
  };
}

function normalizeHookOptions(options = {}) {
  const opts =
    isPlainObject(options)
      ? options
      : {};

  return {
    name:
      normalizeHookName(opts.name),

    priority:
      safeNumber(opts.priority, 0),

    once:
      Boolean(opts.once),

    enabled:
      opts.enabled !== false,

    timeoutMs:
      Math.max(
        0,
        safeNumber(
          opts.timeoutMs ??
            opts.timeout,
          DEFAULT_TIMEOUT_MS
        )
      ),

    tags:
      safeArray(opts.tags)
        .map((tag) => safeText(tag, ""))
        .filter(Boolean),

    meta:
      isPlainObject(opts.meta)
        ? safeClone(opts.meta, {})
        : null,
  };
}

function sortHookEntries(entries = []) {
  return safeArray(entries)
    .slice()
    .sort((a, b) => {
      const priorityA =
        safeNumber(a.priority, 0);

      const priorityB =
        safeNumber(b.priority, 0);

      if (priorityB !== priorityA) {
        return priorityB - priorityA;
      }

      const createdA =
        safeNumber(a.createdAtMs, 0);

      const createdB =
        safeNumber(b.createdAtMs, 0);

      if (createdA !== createdB) {
        return createdA - createdB;
      }

      return (
        safeNumber(a.index, 0) -
        safeNumber(b.index, 0)
      );
    });
}

function createTimeoutPromise(ms, label = "hook") {
  const timeoutMs =
    Math.max(
      0,
      safeNumber(ms, 0)
    );

  if (!timeoutMs) {
    return null;
  }

  let timeoutId =
    null;

  const promise =
    new Promise((_, reject) => {
      timeoutId =
        setTimeout(() => {
          const error =
            new Error(
              `Timeout ejecutando hook "${label}" tras ${timeoutMs}ms.`
            );

          error.name =
            "HookTimeoutError";

          error.timeout =
            true;

          reject(error);
        }, timeoutMs);
    });

  return {
    promise,

    clear() {
      try {
        clearTimeout(timeoutId);
      } catch {}
    },
  };
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

    duplicateCount:
      0,

    removeCount:
      0,

    clearCount:
      0,

    runCount:
      0,

    runHookCount:
      0,

    errorCount:
      0,

    typeDefineCount:
      0,

    lastType:
      "",

    lastRunAt:
      0,

    lastRunAtIso:
      "",

    lastError:
      null,

    recent:
      [],
  };

  let apiRef =
    null;

  function pushRecent(event = {}) {
    const atMs =
      safeNow();

    state.recent.unshift({
      ...safeClone(event, {}),

      at:
        safeIsoDate(atMs),

      atMs,
    });

    if (state.recent.length > MAX_RECENT_EVENTS) {
      state.recent.splice(MAX_RECENT_EVENTS);
    }
  }

  function isStrict(options = {}) {
    return Boolean(
      strict ||
      options?.strict === true
    );
  }

  function recordError(type, error, entry = null, options = {}) {
    const hookName =
      entry?.name ||
      entry?.key ||
      "";

    const payload = {
      type:
        safeText(type, ""),

      hook:
        hookName,

      key:
        entry?.key || "",

      message:
        safeText(
          error?.message || error,
          "Hook error."
        ),

      name:
        safeText(
          error?.name,
          "Error"
        ),

      timeout:
        Boolean(error?.timeout),

      at:
        safeIsoDate(),
    };

    state.errorCount += 1;

    state.lastError =
      payload;

    if (entry) {
      entry.errorCount =
        safeNumber(entry.errorCount, 0) + 1;

      entry.lastError =
        payload;
    }

    pushRecent({
      event:
        "error",

      ...payload,
    });

    safeWarn(
      utils,
      `Hook error en "${type}".`,
      error
    );

    safeEmit(
      events,
      HOOK_EVENTS.error,
      payload
    );

    if (isStrict(options)) {
      throw error instanceof Error
        ? error
        : new Error(payload.message);
    }

    return payload;
  }

  function hasType(type = "") {
    const cleanType =
      normalizeTypeName(type);

    return Boolean(
      cleanType &&
      Array.isArray(finalRegistry.hooks?.[cleanType])
    );
  }

  function defineType(type = "") {
    const cleanType =
      normalizeTypeName(type);

    if (!cleanType) {
      return false;
    }

    if (!Array.isArray(finalRegistry.hooks[cleanType])) {
      finalRegistry.hooks[cleanType] =
        [];

      state.typeDefineCount += 1;

      pushRecent({
        event:
          "type-defined",

        type:
          cleanType,
      });

      safeEmit(
        events,
        HOOK_EVENTS.typeDefined,
        {
          type:
            cleanType,

          at:
            safeIsoDate(),
        }
      );
    }

    return true;
  }

  function ensureType(type = "", options = {}) {
    const cleanType =
      normalizeTypeName(type);

    if (!cleanType) {
      return "";
    }

    if (hasType(cleanType)) {
      return cleanType;
    }

    if (
      allowDynamicTypes ||
      options?.allowDynamicType === true
    ) {
      defineType(cleanType);
      return cleanType;
    }

    const message =
      `Hook desconocido: ${cleanType}`;

    if (isStrict(options)) {
      throw new Error(message);
    }

    safeWarn(
      utils,
      message
    );

    return "";
  }

  function createHookEntry(type, handler, options = {}, index = 0) {
    const cleanType =
      normalizeTypeName(type);

    const opts =
      normalizeHookOptions(options);

    const createdAtMs =
      safeNow();

    const name =
      opts.name ||
      normalizeHookName(handler?.name || "");

    const key =
      safeText(
        options?.key,
        makeHookKey(
          cleanType,
          handler,
          name
        )
      );

    const entry = {
      type:
        cleanType,

      handler,

      runner:
        null,

      name,

      priority:
        opts.priority,

      once:
        opts.once,

      enabled:
        opts.enabled,

      timeoutMs:
        opts.timeoutMs,

      tags:
        opts.tags,

      meta:
        opts.meta,

      key,

      createdAt:
        safeIsoDate(createdAtMs),

      createdAtMs,

      runCount:
        0,

      errorCount:
        0,

      lastRunAt:
        "",

      lastRunAtMs:
        0,

      lastDurationMs:
        0,

      lastError:
        null,

      index:
        safeNumber(index, 0),
    };

    entry.runner =
      createHookRunner(entry);

    return entry;
  }

  function normalizeExistingHookEntry(type, item, index = 0) {
    const cleanType =
      normalizeTypeName(type);

    if (isHookRunner(item)) {
      const existing =
        getRunnerEntry(item);

      existing.type =
        existing.type || cleanType;

      existing.index =
        safeNumber(
          existing.index,
          index
        );

      existing.runner =
        item;

      return existing;
    }

    if (isFunction(item)) {
      return createHookEntry(
        cleanType,
        item,
        {
          name:
            item.name || "",
        },
        index
      );
    }

    if (
      isObject(item) &&
      isFunction(item.handler)
    ) {
      return createHookEntry(
        cleanType,
        item.handler,
        {
          key:
            item.key,

          name:
            item.name ||
            item.handler.name ||
            "",

          priority:
            item.priority,

          once:
            item.once,

          enabled:
            item.enabled,

          timeoutMs:
            item.timeoutMs ??
            item.timeout,

          tags:
            item.tags,

          meta:
            item.meta,
        },
        index
      );
    }

    return null;
  }

  function normalizeHookList(type) {
    const cleanType =
      normalizeTypeName(type);

    if (!hasType(cleanType)) {
      return [];
    }

    const source =
      safeArray(
        finalRegistry.hooks[cleanType]
      );

    const seen =
      new Set();

    const entries =
      [];

    source.forEach((item, index) => {
      const entry =
        normalizeExistingHookEntry(
          cleanType,
          item,
          index
        );

      if (!entry || !entry.key) {
        return;
      }

      if (seen.has(entry.key)) {
        return;
      }

      seen.add(entry.key);

      if (!entry.runner) {
        entry.runner =
          createHookRunner(entry);
      }

      entries.push(entry);
    });

    const sorted =
      sortHookEntries(entries)
        .map((entry, index) => {
          entry.index =
            index;

          return entry;
        });

    finalRegistry.hooks[cleanType] =
      sorted.map((entry) =>
        entry.runner
      );

    finalRegistry.hookMeta[cleanType] =
      sorted.map((entry) =>
        buildPublicHookEntry(entry)
      );

    return sorted;
  }

  function createHookRunner(entry) {
    const runner =
      async function onionHookRunner(payload, context = {}) {
        return invokeHookEntry(
          entry,
          payload,
          context,
          {
            invokedBy:
              "direct",
          }
        );
      };

    try {
      Object.defineProperty(
        runner,
        "name",
        {
          value:
            entry.name
              ? `hook_${entry.name}`
              : "onionHookRunner",
          configurable:
            true,
        }
      );
    } catch {}

    runner.__hookEntry =
      entry;

    runner.__hookType =
      entry.type;

    runner.__hookKey =
      entry.key;

    runner.__hookOriginal =
      entry.handler;

    runner.__isOnionHook =
      true;

    return runner;
  }

  async function invokeHookEntry(entry, payload, context = {}, options = {}) {
    if (
      !entry ||
      !isFunction(entry.handler)
    ) {
      return undefined;
    }

    if (entry.enabled === false) {
      return undefined;
    }

    const startedAt =
      safeNow();

    const type =
      normalizeTypeName(
        entry.type
      );

    const publicEntry =
      buildPublicHookEntry(entry);

    const hookContext = {
      ...(isPlainObject(context) ? context : {}),

      type,

      hook:
        publicEntry,

      key:
        entry.key,

      name:
        entry.name,

      registry:
        finalRegistry,

      hooks:
        apiRef,

      invokedBy:
        options.invokedBy || context?.invokedBy || "hooks",
    };

    let timeout =
      null;

    try {
      timeout =
        createTimeoutPromise(
          entry.timeoutMs,
          entry.name || entry.key
        );

      const execution =
        Promise.resolve(
          entry.handler(
            payload,
            hookContext
          )
        );

      const result =
        timeout
          ? await Promise.race([
              execution,
              timeout.promise,
            ])
          : await execution;

      return result;
    } catch (error) {
      recordError(
        type,
        error,
        entry,
        {
          strict:
            options.throwOnError === true,
        }
      );

      if (options.throwOnError === true) {
        throw error;
      }

      return undefined;
    } finally {
      try {
        timeout?.clear?.();
      } catch {}

      const endedAt =
        safeNow();

      entry.runCount =
        safeNumber(entry.runCount, 0) + 1;

      entry.lastRunAtMs =
        endedAt;

      entry.lastRunAt =
        safeIsoDate(endedAt);

      entry.lastDurationMs =
        Math.max(
          0,
          endedAt - startedAt
        );

      state.runHookCount += 1;

      if (entry.once) {
        remove(
          entry.type,
          entry.key,
          {
            reason:
              "once",
          }
        );
      }
    }
  }

  function add(type, handler, options = {}) {
    const cleanType =
      ensureType(type, options);

    if (!cleanType) {
      return createNoopDisposer();
    }

    if (!isFunction(handler)) {
      const message =
        "El hook debe ser una función.";

      if (isStrict(options)) {
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
      isPlainObject(options)
        ? options
        : {};

    const list =
      normalizeHookList(
        cleanType
      );

    const normalizedOptions =
      normalizeHookOptions(opts);

    const hookName =
      normalizedOptions.name ||
      handler.name ||
      "";

    const key =
      safeText(
        opts.key,
        makeHookKey(
          cleanType,
          handler,
          hookName
        )
      );

    const existing =
      list.find((entry) =>
        entry.key === key
      );

    if (existing) {
      state.duplicateCount += 1;

      pushRecent({
        event:
          "duplicate",

        type:
          cleanType,

        key,

        name:
          existing.name,
      });

      return () =>
        remove(
          cleanType,
          key
        );
    }

    const entry =
      createHookEntry(
        cleanType,
        handler,
        {
          ...opts,
          key,
        },
        list.length
      );

    finalRegistry.hooks[cleanType].push(
      entry.runner
    );

    normalizeHookList(
      cleanType
    );

    state.addCount += 1;

    pushRecent({
      event:
        "add",

      type:
        cleanType,

      key:
        entry.key,

      name:
        entry.name,

      priority:
        entry.priority,

      once:
        entry.once,

      timeoutMs:
        entry.timeoutMs,
    });

    safeEmit(
      events,
      HOOK_EVENTS.add,
      {
        type:
          cleanType,

        key:
          entry.key,

        name:
          entry.name,

        priority:
          entry.priority,

        once:
          entry.once,

        timeoutMs:
          entry.timeoutMs,

        at:
          safeIsoDate(),
      }
    );

    return () =>
      remove(
        cleanType,
        entry.key
      );
  }

  function once(type, handler, options = {}) {
    return add(
      type,
      handler,
      {
        ...(isPlainObject(options) ? options : {}),

        once:
          true,
      }
    );
  }

  function findMatchingEntries(type, handlerOrKey) {
    const cleanType =
      normalizeTypeName(type);

    if (!hasType(cleanType)) {
      return [];
    }

    const list =
      normalizeHookList(cleanType);

    if (isFunction(handlerOrKey)) {
      return list.filter((entry) =>
        entry.handler === handlerOrKey ||
        entry.runner === handlerOrKey
      );
    }

    const key =
      safeText(handlerOrKey, "");

    if (!key) {
      return [];
    }

    return list.filter((entry) =>
      entry.key === key ||
      entry.name === key
    );
  }

  function remove(type, handlerOrKey, options = {}) {
    const cleanType =
      normalizeTypeName(type);

    if (!hasType(cleanType)) {
      return false;
    }

    const list =
      normalizeHookList(cleanType);

    const matches =
      findMatchingEntries(
        cleanType,
        handlerOrKey
      );

    if (!matches.length) {
      return false;
    }

    const keys =
      new Set(
        matches.map((entry) =>
          entry.key
        )
      );

    finalRegistry.hooks[cleanType] =
      list
        .filter((entry) =>
          !keys.has(entry.key)
        )
        .map((entry) =>
          entry.runner
        );

    normalizeHookList(cleanType);

    state.removeCount +=
      keys.size;

    const payload = {
      type:
        cleanType,

      removed:
        keys.size,

      keys:
        Array.from(keys),

      reason:
        options?.reason || "remove",

      at:
        safeIsoDate(),
    };

    pushRecent({
      event:
        "remove",

      ...payload,
    });

    safeEmit(
      events,
      HOOK_EVENTS.remove,
      payload
    );

    return true;
  }

  function clear(type = "") {
    const cleanType =
      normalizeTypeName(type);

    if (cleanType) {
      if (!hasType(cleanType)) {
        return 0;
      }

      const count =
        normalizeHookList(cleanType).length;

      finalRegistry.hooks[cleanType] =
        [];

      finalRegistry.hookMeta[cleanType] =
        [];

      state.clearCount += 1;

      pushRecent({
        event:
          "clear",

        type:
          cleanType,

        count,
      });

      safeEmit(
        events,
        HOOK_EVENTS.clear,
        {
          type:
            cleanType,

          count,

          at:
            safeIsoDate(),
        }
      );

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
      normalizeTypeName(type);

    if (!hasType(cleanType)) {
      return false;
    }

    const matches =
      findMatchingEntries(
        cleanType,
        handlerOrKey
      );

    for (const entry of matches) {
      entry.enabled =
        Boolean(value);
    }

    normalizeHookList(cleanType);

    if (matches.length) {
      pushRecent({
        event:
          value ? "enable" : "disable",

        type:
          cleanType,

        count:
          matches.length,
      });
    }

    return matches.length > 0;
  }

  function setPriority(type, handlerOrKey, priority = 0) {
    const cleanType =
      normalizeTypeName(type);

    if (!hasType(cleanType)) {
      return false;
    }

    const matches =
      findMatchingEntries(
        cleanType,
        handlerOrKey
      );

    for (const entry of matches) {
      entry.priority =
        safeNumber(priority, 0);
    }

    normalizeHookList(cleanType);

    return matches.length > 0;
  }

  async function run(type, payload = {}, options = {}) {
    const opts =
      isPlainObject(options)
        ? options
        : {};

    const mode =
      safeText(
        opts.mode,
        "series"
      ).toLowerCase();

    if (
      mode === "parallel" ||
      mode === "all"
    ) {
      return runParallel(
        type,
        payload,
        opts
      );
    }

    return runSeries(
      type,
      payload,
      opts
    );
  }

  async function runSeries(type, payload = {}, options = {}) {
    const cleanType =
      ensureType(type, options);

    if (!cleanType) {
      return payload;
    }

    const opts =
      isPlainObject(options)
        ? options
        : {};

    let current =
      payload;

    const list =
      normalizeHookList(cleanType)
        .filter((entry) =>
          entry.enabled !== false
        );

    state.runCount += 1;
    state.lastType =
      cleanType;
    state.lastRunAt =
      safeNow();
    state.lastRunAtIso =
      safeIsoDate(state.lastRunAt);

    safeEmit(
      events,
      HOOK_EVENTS.runStart,
      {
        type:
          cleanType,

        count:
          list.length,

        mode:
          "series",

        at:
          state.lastRunAtIso,
      }
    );

    let executed =
      0;

    let failed =
      0;

    for (const entry of list) {
      try {
        const result =
          await invokeHookEntry(
            entry,
            current,
            {
              ...(isPlainObject(opts.context) ? opts.context : {}),

              mode:
                "series",
            },
            {
              invokedBy:
                "runSeries",

              throwOnError:
                opts.throwOnError === true,
            }
          );

        executed += 1;

        if (result !== undefined) {
          current =
            result;
        }
      } catch (error) {
        failed += 1;

        if (opts.throwOnError === true) {
          throw error;
        }

        if (opts.stopOnError === true) {
          break;
        }
      }
    }

    const payloadDone = {
      type:
        cleanType,

      count:
        list.length,

      executed,

      failed,

      mode:
        "series",

      at:
        safeIsoDate(),
    };

    pushRecent({
      event:
        "run",

      ...payloadDone,
    });

    safeEmit(
      events,
      HOOK_EVENTS.runDone,
      payloadDone
    );

    return current;
  }

  async function runParallel(type, payload = {}, options = {}) {
    const cleanType =
      ensureType(type, options);

    if (!cleanType) {
      return [];
    }

    const opts =
      isPlainObject(options)
        ? options
        : {};

    const list =
      normalizeHookList(cleanType)
        .filter((entry) =>
          entry.enabled !== false
        );

    state.runCount += 1;
    state.lastType =
      cleanType;
    state.lastRunAt =
      safeNow();
    state.lastRunAtIso =
      safeIsoDate(state.lastRunAt);

    safeEmit(
      events,
      HOOK_EVENTS.runStart,
      {
        type:
          cleanType,

        count:
          list.length,

        mode:
          "parallel",

        at:
          state.lastRunAtIso,
      }
    );

    const settled =
      await Promise.allSettled(
        list.map(async (entry) => {
          return invokeHookEntry(
            entry,
            payload,
            {
              ...(isPlainObject(opts.context) ? opts.context : {}),

              mode:
                "parallel",
            },
            {
              invokedBy:
                "runParallel",

              throwOnError:
                opts.throwOnError === true,
            }
          );
        })
      );

    const failed =
      settled.filter((item) =>
        item.status === "rejected"
      ).length;

    const fulfilled =
      settled.length - failed;

    const result =
      opts.settled === false
        ? settled.map((item) =>
            item.status === "fulfilled"
              ? item.value
              : undefined
          )
        : settled;

    const payloadDone = {
      type:
        cleanType,

      count:
        list.length,

      fulfilled,

      failed,

      mode:
        "parallel",

      at:
        safeIsoDate(),
    };

    pushRecent({
      event:
        "run",

      ...payloadDone,
    });

    safeEmit(
      events,
      HOOK_EVENTS.runParallelDone,
      payloadDone
    );

    safeEmit(
      events,
      HOOK_EVENTS.runDone,
      payloadDone
    );

    return result;
  }

  function get(type = "") {
    const cleanType =
      normalizeTypeName(type);

    if (!cleanType || !hasType(cleanType)) {
      return [];
    }

    return normalizeHookList(cleanType)
      .map((entry) =>
        entry.runner
      );
  }

  function getEntries(type = "") {
    const cleanType =
      normalizeTypeName(type);

    if (!cleanType || !hasType(cleanType)) {
      return [];
    }

    return normalizeHookList(cleanType)
      .map((entry) =>
        buildPublicHookEntry(entry)
      );
  }

  function getEntry(type = "", handlerOrKey = "") {
    const matches =
      findMatchingEntries(
        type,
        handlerOrKey
      );

    return matches[0]
      ? buildPublicHookEntry(matches[0])
      : null;
  }

  function types() {
    return Object.keys(
      finalRegistry.hooks || {}
    );
  }

  function count(type = "") {
    const cleanType =
      normalizeTypeName(type);

    if (cleanType) {
      return normalizeHookList(cleanType).length;
    }

    return types().reduce((total, hookType) =>
      total + normalizeHookList(hookType).length,
      0
    );
  }

  function getSnapshot(options = {}) {
    const opts =
      isPlainObject(options)
        ? options
        : {};

    const hookTypes =
      types();

    const hooksByType =
      Object.fromEntries(
        hookTypes.map((hookType) => [
          hookType,
          normalizeHookList(hookType).map((entry) =>
            buildPublicHookEntry(entry)
          ),
        ])
      );

    return {
      version:
        HOOKS_VERSION,

      types:
        hookTypes,

      total:
        count(),

      counts:
        Object.fromEntries(
          hookTypes.map((hookType) => [
            hookType,
            normalizeHookList(hookType).length,
          ])
        ),

      stats: {
        addCount:
          state.addCount,

        duplicateCount:
          state.duplicateCount,

        removeCount:
          state.removeCount,

        clearCount:
          state.clearCount,

        runCount:
          state.runCount,

        runHookCount:
          state.runHookCount,

        errorCount:
          state.errorCount,

        typeDefineCount:
          state.typeDefineCount,

        lastType:
          state.lastType,

        lastRunAt:
          state.lastRunAt,

        lastRunAtIso:
          state.lastRunAtIso,

        lastError:
          safeClone(
            state.lastError,
            null
          ),
      },

      hooks:
        hooksByType,

      recent:
        opts.includeRecent === false
          ? []
          : safeClone(
              state.recent,
              []
            ),

      at:
        safeIsoDate(),
    };
  }

  function reset(options = {}) {
    const opts =
      isPlainObject(options)
        ? options
        : {};

    for (const hookType of types()) {
      finalRegistry.hooks[hookType] =
        [];

      finalRegistry.hookMeta[hookType] =
        [];
    }

    if (opts.keepDefaultTypes !== false) {
      for (const hookType of DEFAULT_HOOK_TYPES) {
        defineType(hookType);
      }
    }

    state.addCount =
      0;

    state.duplicateCount =
      0;

    state.removeCount =
      0;

    state.clearCount =
      0;

    state.runCount =
      0;

    state.runHookCount =
      0;

    state.errorCount =
      0;

    state.typeDefineCount =
      0;

    state.lastType =
      "";

    state.lastRunAt =
      0;

    state.lastRunAtIso =
      "";

    state.lastError =
      null;

    state.recent =
      [];

    return getSnapshot();
  }

  /*
    Normalización inicial crítica:
    - convierte hooks legacy en runners ejecutables
    - mantiene registry.hooks[type] como array de funciones
    - evita romper AppCore.runInitHooks(), request.js y código legacy
  */
  for (const hookType of types()) {
    normalizeHookList(hookType);
  }

  const api = {
    version:
      HOOKS_VERSION,

    events:
      HOOK_EVENTS,

    add,
    on:
      add,
    use:
      add,

    once,

    remove,
    off:
      remove,
    delete:
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

    setPriority,

    run,
    execute:
      run,

    runSeries,
    runHookSeries:
      runSeries,

    runParallel,
    runHookParallel:
      runParallel,

    defineType,
    hasType,

    types,
    get,

    getEntries,
    getEntry,

    count,

    getSnapshot,
    getDebugSnapshot:
      getSnapshot,

    reset,
  };

  apiRef =
    api;

  safeEmit(
    events,
    HOOK_EVENTS.ready,
    {
      version:
        HOOKS_VERSION,

      total:
        count(),

      types:
        types(),

      at:
        safeIsoDate(),
    }
  );

  safeLog(
    utils,
    "Hooks ready.",
    {
      version:
        HOOKS_VERSION,

      total:
        count(),
    }
  );

  return api;
}

export {
  HOOKS_VERSION,
  DEFAULT_HOOK_TYPES,
  HOOK_EVENTS,
};

export default {
  HOOKS_VERSION,
  DEFAULT_HOOK_TYPES,
  HOOK_EVENTS,
  createHooks,
};
