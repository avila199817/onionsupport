/* =========================================================
   Onion SPA - Core Hooks
   Archivo: src/core/hooks.js

   ONION SUPPORT · CORE HOOKS
   HOOK REGISTRY · SERIES/PARALLEL · PRIORITY · ONCE SAFE · 17/10

   Responsabilidades:
   - registrar hooks internos del core
   - validar tipos de hook soportados
   - eliminar hooks registrados
   - ejecutar hooks en serie/paralelo de forma segura
   - exponer tipos disponibles
   - soportar prioridad, once, timeout y enable/disable
   - exponer snapshots de diagnóstico

   Candados:
   - cero throws accidentales por defecto
   - registry parcial tolerado
   - hooks idempotentes
   - disposer seguro
   - orden estable por prioridad
   - errores aislados por hook
   - compatibilidad add/on/use/register/remove/clear
   - compatibilidad crítica con AppCore.runInitHooks()
   - registry.hooks[type] mantiene funciones ejecutables
   - runner.__hookEntry mantiene metadatos internos
   - once funcional aunque otro módulo ejecute el runner directamente
   - runSeries/runParallel contabilizan errores capturados
   - snapshots y eventos sin tokens/secrets
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const HOOKS_VERSION = "17.0.0";

const DEFAULT_HOOK_TYPES = Object.freeze([
  "beforeInit",
  "afterInit",

  "beforeBoot",
  "afterBoot",

  "beforeAppReady",
  "afterAppReady",

  "beforeRequest",
  "afterRequest",
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

  "beforeModuleInit",
  "afterModuleInit",

  "onError",
]);

const HOOK_EVENTS = Object.freeze({
  ready: "core:hooks:ready",

  add: "core:hook:add",
  duplicate: "core:hook:duplicate",
  replace: "core:hook:replace",
  remove: "core:hook:remove",
  clear: "core:hook:clear",

  error: "core:hook:error",

  runStart: "core:hook:run:start",
  runDone: "core:hook:run:done",
  runParallelDone: "core:hook:parallel:done",

  typeDefined: "core:hook:type-defined",

  enabled: "core:hook:enabled",
  priority: "core:hook:priority",
});

const MAX_RECENT_EVENTS = 60;
const DEFAULT_TIMEOUT_MS = 0;

const HOOK_NAME_CONTROL_RE = /[\u0000-\u001f\u007f]/g;

const RESERVED_OPTION_KEYS = Object.freeze([
  "key",
  "name",
  "priority",
  "once",
  "enabled",
  "timeout",
  "timeoutMs",
  "tags",
  "meta",
  "strict",
  "allowDynamicType",
  "throwOnError",
  "stopOnError",
  "context",
  "mode",
  "settled",
  "replace",
  "overwrite",
]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

const TOKENISH_TEXT_RE =
  /(bearer\s+[a-z0-9._~+/=-]+)|([a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)|([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|code|t)=)[^&#\s]+/i;

/* =========================================================
   BASICS
========================================================= */

function isAnyObject(value) {
  return value !== null && typeof value === "object";
}

function isObject(value) {
  return value !== null && typeof value === "object";
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

function isFunction(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value)
    .replace(HOOK_NAME_CONTROL_RE, "")
    .trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value instanceof Set) {
    return Array.from(value);
  }

  if (value === null || value === undefined) {
    return [];
  }

  return [value];
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
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
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function redactText(value = "") {
  const text = safeText(value, "");

  if (!text) {
    return "";
  }

  try {
    return text
      .replace(/(bearer\s+)([a-z0-9._~+/=-]+)/gi, "$1***")
      .replace(
        /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|code|t)=)([^&#\s]+)/gi,
        "$1***"
      )
      .replace(/([a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)/gi, "***");
  } catch {
    return TOKENISH_TEXT_RE.test(text) ? "***" : text;
  }
}

function sanitizeForSnapshot(value, depth = 0, keyHint = "") {
  if (depth > 5) {
    return "[depth-limit]";
  }

  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) {
    return value ? "***" : null;
  }

  if (typeof value === "string") {
    return redactText(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "function") {
    return "[function]";
  }

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redactText(value.message || ""),
      stack: value.stack ? "[stack]" : "",
      timeout: Boolean(value.timeout),
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 80)
      .map((item) => sanitizeForSnapshot(item, depth + 1, keyHint));
  }

  if (isAnyObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      output[key] = sanitizeForSnapshot(item, depth + 1, key);
    }

    return output;
  }

  try {
    return redactText(String(value));
  } catch {
    return "[unserializable]";
  }
}

function safeWarn(utils, ...args) {
  const cleanArgs = args.map((item) => sanitizeForSnapshot(item));

  try {
    if (isFunction(utils?.warn)) {
      utils.warn("[Hooks]", ...cleanArgs);
      return;
    }
  } catch {}

  try {
    console.warn("[Hooks]", ...cleanArgs);
  } catch {}
}

function safeLog(utils, ...args) {
  try {
    utils?.log?.("[Hooks]", ...args.map((item) => sanitizeForSnapshot(item)));
  } catch {}
}

function safeEmit(events, name, payload = {}) {
  const eventName = safeText(name, "");

  if (!eventName) {
    return false;
  }

  const cleanPayload = sanitizeForSnapshot(payload);

  try {
    if (isFunction(events?.emit)) {
      events.emit(eventName, cleanPayload);
      return true;
    }
  } catch {}

  try {
    if (isFunction(events?.dispatch)) {
      events.dispatch(eventName, cleanPayload);
      return true;
    }
  } catch {}

  try {
    if (isFunction(events?.trigger)) {
      events.trigger(eventName, cleanPayload);
      return true;
    }
  } catch {}

  return false;
}

function createNoopDisposer() {
  const noop = () => false;

  try {
    noop.__hookNoop = true;
  } catch {}

  return noop;
}

/* =========================================================
   IDS
========================================================= */

const handlerIds = new WeakMap();

let nextHandlerId = 1;

function getHandlerId(handler) {
  if (!isFunction(handler)) {
    return "handler:none";
  }

  try {
    if (!handlerIds.has(handler)) {
      handlerIds.set(handler, nextHandlerId++);
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
   REGISTRY NORMALIZATION
========================================================= */

function normalizeRegistryHooksMap(hooks) {
  if (hooks instanceof Map) {
    const object = {};

    try {
      for (const [key, value] of hooks.entries()) {
        object[safeText(key, "")] = value;
      }
    } catch {}

    return object;
  }

  return isPlainObject(hooks) ? hooks : {};
}

function normalizeRegistryHookValue(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (isFunction(value)) {
    return [value];
  }

  if (isPlainObject(value) && isFunction(value.handler)) {
    return [value];
  }

  return [];
}

function ensureRegistry(registry) {
  let finalRegistry = isAnyObject(registry) ? registry : {};

  try {
    finalRegistry.hooks = normalizeRegistryHooksMap(finalRegistry.hooks);
  } catch {
    finalRegistry = {};
    finalRegistry.hooks = {};
  }

  try {
    finalRegistry.hookMeta = isPlainObject(finalRegistry.hookMeta)
      ? finalRegistry.hookMeta
      : {};
  } catch {
    finalRegistry.hookMeta = {};
  }

  for (const type of DEFAULT_HOOK_TYPES) {
    if (!Array.isArray(finalRegistry.hooks[type])) {
      finalRegistry.hooks[type] = normalizeRegistryHookValue(finalRegistry.hooks[type]);
    }

    if (!Array.isArray(finalRegistry.hookMeta[type])) {
      finalRegistry.hookMeta[type] = [];
    }
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
  return Boolean(isFunction(value) && getRunnerEntry(value));
}

function defineHiddenValue(target, key, value) {
  try {
    Object.defineProperty(target, key, {
      value,
      configurable: true,
      enumerable: false,
      writable: true,
    });

    return true;
  } catch {}

  try {
    target[key] = value;
    return true;
  } catch {
    return false;
  }
}

function pickCustomMeta(options = {}) {
  const opts = isPlainObject(options) ? options : {};

  if (isPlainObject(opts.meta)) {
    return safeClone(opts.meta, {});
  }

  const custom = {};

  for (const [key, value] of Object.entries(opts)) {
    if (RESERVED_OPTION_KEYS.includes(key)) {
      continue;
    }

    custom[key] = safeClone(value, value);
  }

  return Object.keys(custom).length ? custom : null;
}

function buildPublicHookEntry(entry = {}) {
  return {
    type: entry.type || "",
    key: entry.key || "",
    name: entry.name || "",

    priority: safeNumber(entry.priority, 0),
    once: Boolean(entry.once),
    enabled: entry.enabled !== false,
    consumed: Boolean(entry.consumed),

    timeoutMs: safeNumber(entry.timeoutMs, 0),

    tags: safeArray(entry.tags),

    meta: entry.meta
      ? sanitizeForSnapshot(entry.meta)
      : null,

    createdAt: entry.createdAt || "",
    createdAtMs: safeNumber(entry.createdAtMs, 0),

    runCount: safeNumber(entry.runCount, 0),
    errorCount: safeNumber(entry.errorCount, 0),

    lastRunAt: entry.lastRunAt || "",
    lastRunAtMs: safeNumber(entry.lastRunAtMs, 0),
    lastDurationMs: safeNumber(entry.lastDurationMs, 0),

    lastError: entry.lastError
      ? sanitizeForSnapshot(entry.lastError)
      : null,

    removed: Boolean(entry.removed),
    removedAt: entry.removedAt || "",

    index: safeNumber(entry.index, 0),
  };
}

function normalizeHookOptions(options = {}) {
  if (typeof options === "number") {
    return {
      name: "",
      priority: safeNumber(options, 0),
      once: false,
      enabled: true,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      tags: [],
      meta: null,
    };
  }

  const opts = isPlainObject(options) ? options : {};

  return {
    name: normalizeHookName(opts.name),

    priority: safeNumber(opts.priority, 0),

    once: Boolean(opts.once),

    enabled: opts.enabled !== false,

    timeoutMs: Math.max(
      0,
      safeNumber(opts.timeoutMs ?? opts.timeout, DEFAULT_TIMEOUT_MS)
    ),

    tags: toArray(opts.tags)
      .flat(Infinity)
      .map((tag) => safeText(tag, ""))
      .filter(Boolean),

    meta: pickCustomMeta(opts),
  };
}

function sortHookEntries(entries = []) {
  return safeArray(entries)
    .slice()
    .sort((a, b) => {
      const priorityA = safeNumber(a.priority, 0);
      const priorityB = safeNumber(b.priority, 0);

      if (priorityB !== priorityA) {
        return priorityB - priorityA;
      }

      const createdA = safeNumber(a.createdAtMs, 0);
      const createdB = safeNumber(b.createdAtMs, 0);

      if (createdA !== createdB) {
        return createdA - createdB;
      }

      return safeNumber(a.index, 0) - safeNumber(b.index, 0);
    });
}

function createTimeoutPromise(ms, label = "hook") {
  const timeoutMs = Math.max(0, safeNumber(ms, 0));

  if (!timeoutMs) {
    return null;
  }

  let timeoutId = null;

  const promise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`Timeout ejecutando hook "${label}" tras ${timeoutMs}ms.`);

      error.name = "HookTimeoutError";
      error.timeout = true;

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
  const finalRegistry = ensureRegistry(registry);

  const state = {
    version: HOOKS_VERSION,

    addCount: 0,
    duplicateCount: 0,
    replaceCount: 0,
    removeCount: 0,
    clearCount: 0,

    runCount: 0,
    runHookCount: 0,
    errorCount: 0,
    typeDefineCount: 0,

    lastType: "",
    lastRunAt: 0,
    lastRunAtIso: "",
    lastError: null,

    recent: [],
  };

  let apiRef = null;

  function pushRecent(event = {}) {
    const atMs = safeNow();

    state.recent.unshift({
      ...sanitizeForSnapshot(event),
      at: safeIsoDate(atMs),
      atMs,
    });

    if (state.recent.length > MAX_RECENT_EVENTS) {
      state.recent.splice(MAX_RECENT_EVENTS);
    }
  }

  function isStrict(options = {}) {
    return Boolean(strict || options?.strict === true);
  }

  function recordError(type, error, entry = null, options = {}) {
    const hookName = entry?.name || entry?.key || "";

    const payload = {
      type: safeText(type, ""),
      hook: hookName,
      key: entry?.key || "",

      message: redactText(safeText(error?.message || error, "Hook error.")),
      name: safeText(error?.name, "Error"),
      timeout: Boolean(error?.timeout),

      at: safeIsoDate(),
    };

    state.errorCount += 1;
    state.lastError = payload;

    if (entry) {
      entry.errorCount = safeNumber(entry.errorCount, 0) + 1;
      entry.lastError = payload;
    }

    pushRecent({
      event: "error",
      ...payload,
    });

    safeWarn(utils, `Hook error en "${type}".`, error);

    safeEmit(events, HOOK_EVENTS.error, payload);

    if (isStrict(options)) {
      throw error instanceof Error ? error : new Error(payload.message);
    }

    return payload;
  }

  function hasType(type = "") {
    const cleanType = normalizeTypeName(type);

    return Boolean(
      cleanType &&
      Array.isArray(finalRegistry.hooks?.[cleanType])
    );
  }

  function defineType(type = "") {
    const cleanType = normalizeTypeName(type);

    if (!cleanType) {
      return false;
    }

    if (!Array.isArray(finalRegistry.hooks[cleanType])) {
      finalRegistry.hooks[cleanType] = [];
      finalRegistry.hookMeta[cleanType] = [];

      state.typeDefineCount += 1;

      pushRecent({
        event: "type-defined",
        type: cleanType,
      });

      safeEmit(events, HOOK_EVENTS.typeDefined, {
        type: cleanType,
        at: safeIsoDate(),
      });
    }

    return true;
  }

  function ensureType(type = "", options = {}) {
    const cleanType = normalizeTypeName(type);

    if (!cleanType) {
      return "";
    }

    if (hasType(cleanType)) {
      return cleanType;
    }

    if (allowDynamicTypes || options?.allowDynamicType === true) {
      defineType(cleanType);
      return cleanType;
    }

    const message = `Hook desconocido: ${cleanType}`;

    if (isStrict(options)) {
      throw new Error(message);
    }

    safeWarn(utils, message);

    return "";
  }

  function createHookRunner(entry) {
    const runner = async function onionHookRunner(payload, context = {}) {
      const result = await invokeHookEntry(entry, payload, context, {
        invokedBy: "direct",
      });

      return result.value;
    };

    try {
      Object.defineProperty(runner, "name", {
        value: entry.name
          ? `hook_${entry.name}`
          : "onionHookRunner",
        configurable: true,
      });
    } catch {}

    defineHiddenValue(runner, "__hookEntry", entry);
    defineHiddenValue(runner, "__hookType", entry.type);
    defineHiddenValue(runner, "__hookKey", entry.key);
    defineHiddenValue(runner, "__hookOriginal", entry.handler);
    defineHiddenValue(runner, "__isOnionHook", true);

    return runner;
  }

  function createHookEntry(type, handler, options = {}, index = 0) {
    const cleanType = normalizeTypeName(type);
    const opts = normalizeHookOptions(options);
    const createdAtMs = safeNow();

    const name = opts.name || normalizeHookName(handler?.name || "");

    const key = safeText(
      options?.key,
      makeHookKey(cleanType, handler, name)
    );

    const entry = {
      type: cleanType,

      handler,
      originalHandler: handler,
      runner: null,

      name,

      priority: opts.priority,
      once: opts.once,
      enabled: opts.enabled,
      consumed: false,

      timeoutMs: opts.timeoutMs,

      tags: opts.tags,
      meta: opts.meta,

      key,

      createdAt: safeIsoDate(createdAtMs),
      createdAtMs,

      runCount: 0,
      errorCount: 0,

      lastRunAt: "",
      lastRunAtMs: 0,
      lastDurationMs: 0,
      lastError: null,

      removed: false,
      removedAt: "",

      index: safeNumber(index, 0),
    };

    entry.runner = createHookRunner(entry);

    return entry;
  }

  function normalizeExistingHookEntry(type, item, index = 0) {
    const cleanType = normalizeTypeName(type);

    if (isHookRunner(item)) {
      const existing = getRunnerEntry(item);

      existing.type = existing.type || cleanType;
      existing.index = safeNumber(existing.index, index);
      existing.runner = item;

      return existing;
    }

    if (isFunction(item)) {
      return createHookEntry(
        cleanType,
        item,
        {
          name: item.name || "",
        },
        index
      );
    }

    if (isObject(item) && isFunction(item.handler)) {
      return createHookEntry(
        cleanType,
        item.handler,
        {
          key: item.key,
          name: item.name || item.handler.name || "",
          priority: item.priority,
          once: item.once,
          enabled: item.enabled,
          timeoutMs: item.timeoutMs ?? item.timeout,
          tags: item.tags,
          meta: item.meta,
        },
        index
      );
    }

    return null;
  }

  function normalizeHookList(type) {
    const cleanType = normalizeTypeName(type);

    if (!hasType(cleanType)) {
      return [];
    }

    const source = normalizeRegistryHookValue(finalRegistry.hooks[cleanType]);
    const seen = new Set();
    const entries = [];

    source.forEach((item, index) => {
      const entry = normalizeExistingHookEntry(cleanType, item, index);

      if (!entry || !entry.key || entry.removed === true) {
        return;
      }

      if (seen.has(entry.key)) {
        return;
      }

      seen.add(entry.key);

      if (!entry.runner) {
        entry.runner = createHookRunner(entry);
      }

      entries.push(entry);
    });

    const sorted = sortHookEntries(entries).map((entry, index) => {
      entry.index = index;
      return entry;
    });

    finalRegistry.hooks[cleanType] = sorted.map((entry) => entry.runner);
    finalRegistry.hookMeta[cleanType] = sorted.map((entry) => buildPublicHookEntry(entry));

    return sorted;
  }

  async function invokeHookEntry(entry, payload, context = {}, options = {}) {
    if (!entry || !isFunction(entry.handler)) {
      return {
        ok: true,
        skipped: true,
        value: undefined,
      };
    }

    if (entry.enabled === false || entry.consumed === true || entry.removed === true) {
      return {
        ok: true,
        skipped: true,
        disabled: entry.enabled === false,
        consumed: entry.consumed === true,
        removed: entry.removed === true,
        value: undefined,
      };
    }

    const startedAt = safeNow();
    const type = normalizeTypeName(entry.type);
    const publicEntry = buildPublicHookEntry(entry);

    const hookContext = {
      ...(isPlainObject(context) ? context : {}),

      type,
      hook: publicEntry,
      key: entry.key,
      name: entry.name,

      registry: finalRegistry,
      hooks: apiRef,

      invokedBy: options.invokedBy || context?.invokedBy || "hooks",
    };

    let timeout = null;
    let ok = true;
    let value = undefined;
    let capturedError = null;

    try {
      timeout = createTimeoutPromise(entry.timeoutMs, entry.name || entry.key);

      const execution = Promise.resolve().then(() =>
        entry.handler(payload, hookContext)
      );

      /*
        Evita unhandled rejection si el timeout gana la carrera
        y el handler rechaza más tarde.
      */
      execution.catch(() => {});

      value = timeout
        ? await Promise.race([execution, timeout.promise])
        : await execution;
    } catch (error) {
      ok = false;
      capturedError = error;

      recordError(type, error, entry, {
        strict: options.throwOnError === true,
      });

      if (options.throwOnError === true) {
        throw error;
      }
    } finally {
      try {
        timeout?.clear?.();
      } catch {}

      const endedAt = safeNow();

      entry.runCount = safeNumber(entry.runCount, 0) + 1;
      entry.lastRunAtMs = endedAt;
      entry.lastRunAt = safeIsoDate(endedAt);
      entry.lastDurationMs = Math.max(0, endedAt - startedAt);

      state.runHookCount += 1;

      if (entry.once) {
        entry.consumed = true;
        entry.enabled = false;

        remove(entry.type, entry.key, {
          reason: "once",
          silent: true,
        });
      }
    }

    return {
      ok,
      failed: !ok,
      value,
      error: capturedError,
      entry: buildPublicHookEntry(entry),
    };
  }

  function normalizeAddInput(handler, options = {}) {
    if (isHookRunner(handler)) {
      const entry = getRunnerEntry(handler);

      return {
        handler: entry?.handler || handler,
        options: {
          key: entry?.key,
          name: entry?.name,
          priority: entry?.priority,
          once: entry?.once,
          enabled: entry?.enabled,
          timeoutMs: entry?.timeoutMs,
          tags: entry?.tags,
          meta: entry?.meta,
          ...(isPlainObject(options) ? options : {}),
        },
      };
    }

    if (isPlainObject(handler) && isFunction(handler.handler)) {
      const {
        handler: realHandler,
        ...entryOptions
      } = handler;

      return {
        handler: realHandler,
        options: {
          ...entryOptions,
          ...(isPlainObject(options) ? options : {}),
        },
      };
    }

    return {
      handler,
      options,
    };
  }

  function add(type, handler, options = {}) {
    const normalizedInput = normalizeAddInput(handler, options);

    const cleanType = ensureType(type, normalizedInput.options);

    if (!cleanType) {
      return createNoopDisposer();
    }

    const finalHandler = normalizedInput.handler;
    const opts = isPlainObject(normalizedInput.options)
      ? normalizedInput.options
      : {};

    if (!isFunction(finalHandler)) {
      const message = "El hook debe ser una función.";

      if (isStrict(opts)) {
        throw new Error(message);
      }

      safeWarn(utils, message, {
        type: cleanType,
      });

      return createNoopDisposer();
    }

    const list = normalizeHookList(cleanType);
    const normalizedOptions = normalizeHookOptions(opts);

    const hookName = normalizedOptions.name || finalHandler.name || "";

    const key = safeText(
      opts.key,
      makeHookKey(cleanType, finalHandler, hookName)
    );

    const existing = list.find((entry) => entry.key === key);

    if (existing) {
      if (opts.replace === true || opts.overwrite === true) {
        remove(cleanType, key, {
          reason: "replace",
          silent: true,
        });

        state.replaceCount += 1;

        pushRecent({
          event: "replace",
          type: cleanType,
          key,
          name: existing.name,
        });

        safeEmit(events, HOOK_EVENTS.replace, {
          type: cleanType,
          key,
          name: existing.name,
          at: safeIsoDate(),
        });
      } else {
        state.duplicateCount += 1;

        pushRecent({
          event: "duplicate",
          type: cleanType,
          key,
          name: existing.name,
        });

        safeEmit(events, HOOK_EVENTS.duplicate, {
          type: cleanType,
          key,
          name: existing.name,
          at: safeIsoDate(),
        });

        return () => remove(cleanType, key);
      }
    }

    const entry = createHookEntry(
      cleanType,
      finalHandler,
      {
        ...opts,
        key,
      },
      list.length
    );

    finalRegistry.hooks[cleanType].push(entry.runner);

    normalizeHookList(cleanType);

    state.addCount += 1;

    pushRecent({
      event: "add",
      type: cleanType,
      key: entry.key,
      name: entry.name,
      priority: entry.priority,
      once: entry.once,
      timeoutMs: entry.timeoutMs,
    });

    safeEmit(events, HOOK_EVENTS.add, {
      type: cleanType,
      key: entry.key,
      name: entry.name,
      priority: entry.priority,
      once: entry.once,
      timeoutMs: entry.timeoutMs,
      at: safeIsoDate(),
    });

    let disposed = false;

    return () => {
      if (disposed) {
        return false;
      }

      disposed = true;

      return remove(cleanType, entry.key);
    };
  }

  function once(type, handler, options = {}) {
    return add(type, handler, {
      ...(isPlainObject(options) ? options : {}),
      once: true,
    });
  }

  function findMatchingEntries(type, handlerOrKey) {
    const cleanType = normalizeTypeName(type);

    if (!hasType(cleanType)) {
      return [];
    }

    const list = normalizeHookList(cleanType);

    if (isFunction(handlerOrKey)) {
      return list.filter((entry) =>
        entry.handler === handlerOrKey ||
        entry.originalHandler === handlerOrKey ||
        entry.runner === handlerOrKey
      );
    }

    const key = safeText(handlerOrKey, "");

    if (!key) {
      return [];
    }

    return list.filter((entry) =>
      entry.key === key ||
      entry.name === key
    );
  }

  function remove(type, handlerOrKey, options = {}) {
    const cleanType = normalizeTypeName(type);

    if (!hasType(cleanType)) {
      return false;
    }

    const list = normalizeHookList(cleanType);
    const matches = findMatchingEntries(cleanType, handlerOrKey);

    if (!matches.length) {
      return false;
    }

    const keys = new Set(matches.map((entry) => entry.key));

    for (const entry of matches) {
      entry.removed = true;
      entry.removedAt = safeIsoDate();
      entry.enabled = false;
    }

    finalRegistry.hooks[cleanType] = list
      .filter((entry) => !keys.has(entry.key))
      .map((entry) => entry.runner);

    normalizeHookList(cleanType);

    state.removeCount += keys.size;

    const payload = {
      type: cleanType,
      removed: keys.size,
      keys: Array.from(keys),
      reason: options?.reason || "remove",
      at: safeIsoDate(),
    };

    pushRecent({
      event: "remove",
      ...payload,
    });

    if (options?.silent !== true) {
      safeEmit(events, HOOK_EVENTS.remove, payload);
    }

    return true;
  }

  function clear(type = "") {
    const cleanType = normalizeTypeName(type);

    if (cleanType) {
      if (!hasType(cleanType)) {
        return 0;
      }

      const removed = normalizeHookList(cleanType).length;

      finalRegistry.hooks[cleanType] = [];
      finalRegistry.hookMeta[cleanType] = [];

      state.clearCount += 1;

      pushRecent({
        event: "clear",
        type: cleanType,
        count: removed,
      });

      safeEmit(events, HOOK_EVENTS.clear, {
        type: cleanType,
        count: removed,
        at: safeIsoDate(),
      });

      return removed;
    }

    let total = 0;

    for (const hookType of types()) {
      total += clear(hookType);
    }

    return total;
  }

  function enable(type, handlerOrKey, value = true) {
    const cleanType = normalizeTypeName(type);

    if (!hasType(cleanType)) {
      return false;
    }

    const matches = findMatchingEntries(cleanType, handlerOrKey);

    for (const entry of matches) {
      entry.enabled = Boolean(value);

      if (Boolean(value) && entry.once && entry.consumed) {
        entry.consumed = false;
      }
    }

    normalizeHookList(cleanType);

    if (matches.length) {
      const payload = {
        type: cleanType,
        enabled: Boolean(value),
        count: matches.length,
        keys: matches.map((entry) => entry.key),
        at: safeIsoDate(),
      };

      pushRecent({
        event: value ? "enable" : "disable",
        ...payload,
      });

      safeEmit(events, HOOK_EVENTS.enabled, payload);
    }

    return matches.length > 0;
  }

  function setPriority(type, handlerOrKey, priority = 0) {
    const cleanType = normalizeTypeName(type);

    if (!hasType(cleanType)) {
      return false;
    }

    const matches = findMatchingEntries(cleanType, handlerOrKey);
    const nextPriority = safeNumber(priority, 0);

    for (const entry of matches) {
      entry.priority = nextPriority;
    }

    normalizeHookList(cleanType);

    if (matches.length) {
      const payload = {
        type: cleanType,
        priority: nextPriority,
        count: matches.length,
        keys: matches.map((entry) => entry.key),
        at: safeIsoDate(),
      };

      pushRecent({
        event: "priority",
        ...payload,
      });

      safeEmit(events, HOOK_EVENTS.priority, payload);
    }

    return matches.length > 0;
  }

  async function run(type, payload = {}, options = {}) {
    const opts = isPlainObject(options) ? options : {};
    const mode = safeText(opts.mode, "series").toLowerCase();

    if (mode === "parallel" || mode === "all") {
      return runParallel(type, payload, opts);
    }

    return runSeries(type, payload, opts);
  }

  async function runSeries(type, payload = {}, options = {}) {
    const cleanType = ensureType(type, options);

    if (!cleanType) {
      return payload;
    }

    const opts = isPlainObject(options) ? options : {};
    let current = payload;

    const list = normalizeHookList(cleanType)
      .filter((entry) => entry.enabled !== false && entry.consumed !== true);

    state.runCount += 1;
    state.lastType = cleanType;
    state.lastRunAt = safeNow();
    state.lastRunAtIso = safeIsoDate(state.lastRunAt);

    safeEmit(events, HOOK_EVENTS.runStart, {
      type: cleanType,
      count: list.length,
      mode: "series",
      at: state.lastRunAtIso,
    });

    let executed = 0;
    let failed = 0;

    for (const entry of list) {
      let result = null;

      try {
        result = await invokeHookEntry(
          entry,
          current,
          {
            ...(isPlainObject(opts.context) ? opts.context : {}),
            mode: "series",
          },
          {
            invokedBy: "runSeries",
            throwOnError: opts.throwOnError === true,
          }
        );
      } catch (error) {
        result = {
          ok: false,
          failed: true,
          error,
        };

        if (opts.throwOnError === true) {
          throw error;
        }
      }

      executed += 1;

      if (result?.failed) {
        failed += 1;

        if (opts.stopOnError === true) {
          break;
        }

        continue;
      }

      if (result?.value !== undefined) {
        current = result.value;
      }
    }

    const payloadDone = {
      type: cleanType,
      count: list.length,
      executed,
      failed,
      mode: "series",
      at: safeIsoDate(),
    };

    pushRecent({
      event: "run",
      ...payloadDone,
    });

    safeEmit(events, HOOK_EVENTS.runDone, payloadDone);

    return current;
  }

  async function runParallel(type, payload = {}, options = {}) {
    const cleanType = ensureType(type, options);

    if (!cleanType) {
      return [];
    }

    const opts = isPlainObject(options) ? options : {};

    const list = normalizeHookList(cleanType)
      .filter((entry) => entry.enabled !== false && entry.consumed !== true);

    state.runCount += 1;
    state.lastType = cleanType;
    state.lastRunAt = safeNow();
    state.lastRunAtIso = safeIsoDate(state.lastRunAt);

    safeEmit(events, HOOK_EVENTS.runStart, {
      type: cleanType,
      count: list.length,
      mode: "parallel",
      at: state.lastRunAtIso,
    });

    const settled = await Promise.all(
      list.map(async (entry) => {
        try {
          const result = await invokeHookEntry(
            entry,
            payload,
            {
              ...(isPlainObject(opts.context) ? opts.context : {}),
              mode: "parallel",
            },
            {
              invokedBy: "runParallel",
              throwOnError: opts.throwOnError === true,
            }
          );

          return {
            status: result?.failed ? "rejected" : "fulfilled",
            value: result?.value,
            reason: result?.error || null,
            hook: buildPublicHookEntry(entry),
          };
        } catch (error) {
          if (opts.throwOnError === true) {
            throw error;
          }

          return {
            status: "rejected",
            value: undefined,
            reason: error,
            hook: buildPublicHookEntry(entry),
          };
        }
      })
    );

    const failed = settled.filter((item) => item.status === "rejected").length;
    const fulfilled = settled.length - failed;

    const result = opts.settled === false
      ? settled.map((item) => item.status === "fulfilled" ? item.value : undefined)
      : settled;

    const payloadDone = {
      type: cleanType,
      count: list.length,
      fulfilled,
      failed,
      mode: "parallel",
      at: safeIsoDate(),
    };

    pushRecent({
      event: "run",
      ...payloadDone,
    });

    safeEmit(events, HOOK_EVENTS.runParallelDone, payloadDone);
    safeEmit(events, HOOK_EVENTS.runDone, payloadDone);

    return result;
  }

  function get(type = "") {
    const cleanType = normalizeTypeName(type);

    if (!cleanType || !hasType(cleanType)) {
      return [];
    }

    return normalizeHookList(cleanType).map((entry) => entry.runner);
  }

  function getEntries(type = "") {
    const cleanType = normalizeTypeName(type);

    if (!cleanType || !hasType(cleanType)) {
      return [];
    }

    return normalizeHookList(cleanType).map((entry) => buildPublicHookEntry(entry));
  }

  function getEntry(type = "", handlerOrKey = "") {
    const matches = findMatchingEntries(type, handlerOrKey);

    return matches[0]
      ? buildPublicHookEntry(matches[0])
      : null;
  }

  function types() {
    return Object.keys(finalRegistry.hooks || {});
  }

  function count(type = "") {
    const cleanType = normalizeTypeName(type);

    if (cleanType) {
      return normalizeHookList(cleanType).length;
    }

    return types().reduce(
      (total, hookType) => total + normalizeHookList(hookType).length,
      0
    );
  }

  function getSnapshot(options = {}) {
    const opts = isPlainObject(options) ? options : {};
    const hookTypes = types();

    const hooksByType = Object.fromEntries(
      hookTypes.map((hookType) => [
        hookType,
        normalizeHookList(hookType).map((entry) => buildPublicHookEntry(entry)),
      ])
    );

    return {
      version: HOOKS_VERSION,

      types: hookTypes,
      total: count(),

      counts: Object.fromEntries(
        hookTypes.map((hookType) => [
          hookType,
          normalizeHookList(hookType).length,
        ])
      ),

      stats: {
        addCount: state.addCount,
        duplicateCount: state.duplicateCount,
        replaceCount: state.replaceCount,
        removeCount: state.removeCount,
        clearCount: state.clearCount,
        runCount: state.runCount,
        runHookCount: state.runHookCount,
        errorCount: state.errorCount,
        typeDefineCount: state.typeDefineCount,
        lastType: state.lastType,
        lastRunAt: state.lastRunAt,
        lastRunAtIso: state.lastRunAtIso,
        lastError: state.lastError ? sanitizeForSnapshot(state.lastError) : null,
      },

      hooks: hooksByType,

      recent: opts.includeRecent === false
        ? []
        : sanitizeForSnapshot(state.recent),

      at: safeIsoDate(),
    };
  }

  function reset(options = {}) {
    const opts = isPlainObject(options) ? options : {};

    if (opts.keepTypes === false) {
      for (const hookType of types()) {
        delete finalRegistry.hooks[hookType];
        delete finalRegistry.hookMeta[hookType];
      }
    } else {
      for (const hookType of types()) {
        finalRegistry.hooks[hookType] = [];
        finalRegistry.hookMeta[hookType] = [];
      }
    }

    if (opts.keepDefaultTypes !== false) {
      for (const hookType of DEFAULT_HOOK_TYPES) {
        defineType(hookType);
      }
    }

    state.addCount = 0;
    state.duplicateCount = 0;
    state.replaceCount = 0;
    state.removeCount = 0;
    state.clearCount = 0;
    state.runCount = 0;
    state.runHookCount = 0;
    state.errorCount = 0;
    state.typeDefineCount = 0;
    state.lastType = "";
    state.lastRunAt = 0;
    state.lastRunAtIso = "";
    state.lastError = null;
    state.recent = [];

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

    enable,

    disable(type, handlerOrKey) {
      return enable(type, handlerOrKey, false);
    },

    setPriority,
    priority: setPriority,

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

  apiRef = api;

  safeEmit(events, HOOK_EVENTS.ready, {
    version: HOOKS_VERSION,
    total: count(),
    types: types(),
    at: safeIsoDate(),
  });

  safeLog(utils, "Hooks ready.", {
    version: HOOKS_VERSION,
    total: count(),
  });

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
