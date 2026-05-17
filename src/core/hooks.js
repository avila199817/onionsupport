/* =========================================================
   Onion SPA - Core Hooks
   Archivo: src/core/hooks.js

   CORE HOOKS · SIMPLE
   - registry simple de hooks
   - series / parallel
   - priority / once / enable / disable
   - registry.hooks[type] mantiene runners ejecutables
   - snapshots sin tokens/secrets
   - sin Auth, Router, Storage, fetch ni UI
========================================================= */

export const HOOKS_VERSION = "21.0.0-simple";

export const DEFAULT_HOOK_TYPES = Object.freeze([
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

export const HOOK_EVENTS = Object.freeze({
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

const MAX_RECENT = 40;
const DEFAULT_TIMEOUT_MS = 0;
const CONTROL_RE = /[\u0000-\u001f\u007f]/g;
const SENSITIVE_KEY_RE = /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;
const TOKENISH_RE = /(bearer\s+)[a-z0-9._~+/=-]+|[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}|([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|code|t)=)[^&#\s]+/gi;

/* =========================================================
   BASICS
========================================================= */

function isFn(value) {
  return typeof value === "function";
}

function isObjectLike(value) {
  return value !== null && typeof value === "object";
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

function text(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const output = String(value).replace(CONTROL_RE, "").trim();
  return output || fallback;
}

function number(value, fallback = 0) {
  const output = Number(value);
  return Number.isFinite(output) ? output : fallback;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function now() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function iso(ms = now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function noopDisposer() {
  return false;
}

function clonePlain(value, fallback = null) {
  if (value === undefined) return fallback;
  if (value === null) return null;

  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function defineHidden(target, key, value) {
  try {
    Object.defineProperty(target, key, { value, configurable: true, enumerable: false, writable: true });
    return true;
  } catch {}

  try {
    target[key] = value;
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SANITIZE / EVENTS
========================================================= */

function redactText(value = "") {
  const raw = text(value, "");
  if (!raw) return "";

  try {
    return raw.replace(TOKENISH_RE, (match, bearerPrefix, queryPrefix) => {
      if (bearerPrefix) return `${bearerPrefix}***`;
      if (queryPrefix) return `${queryPrefix}***`;
      return "***";
    });
  } catch {
    return "***";
  }
}

function sanitize(value, depth = 0, keyHint = "", seen = new WeakSet()) {
  if (depth > 5) return "[depth-limit]";
  if (SENSITIVE_KEY_RE.test(text(keyHint, ""))) return value ? "***" : value;
  if (typeof value === "string") return redactText(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redactText(value.message || ""),
      stack: value.stack ? "[stack]" : "",
      timeout: Boolean(value.timeout),
    };
  }

  if (Array.isArray(value)) return value.slice(0, 80).map((item) => sanitize(item, depth + 1, keyHint, seen));

  if (isObjectLike(value)) {
    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    const output = {};
    for (const [key, item] of Object.entries(value).slice(0, 120)) output[key] = sanitize(item, depth + 1, key, seen);
    return output;
  }

  try {
    return redactText(String(value));
  } catch {
    return "[unserializable]";
  }
}

function emit(events, name, payload = {}) {
  const eventName = text(name, "");
  if (!eventName) return false;

  const detail = sanitize(payload);

  for (const method of ["emit", "dispatch", "trigger"]) {
    try {
      if (isFn(events?.[method])) {
        events[method](eventName, detail);
        return true;
      }
    } catch {}
  }

  return false;
}

function warn(utils, ...args) {
  const clean = args.map((item) => sanitize(item));

  try {
    if (isFn(utils?.warn)) {
      utils.warn("[Hooks]", ...clean);
      return;
    }
  } catch {}

  try {
    console.warn("[Hooks]", ...clean);
  } catch {}
}

function log(utils, ...args) {
  try {
    utils?.log?.("[Hooks]", ...args.map((item) => sanitize(item)));
  } catch {}
}

/* =========================================================
   IDS / REGISTRY
========================================================= */

const handlerIds = new WeakMap();
let nextHandlerId = 1;

function handlerId(handler) {
  if (!isFn(handler)) return "handler:none";

  try {
    if (!handlerIds.has(handler)) handlerIds.set(handler, nextHandlerId++);
    return `handler:${handlerIds.get(handler)}`;
  } catch {
    return "handler:unknown";
  }
}

function makeHookKey(type, handler, name = "") {
  return [text(type, ""), handlerId(handler), text(name, "")].join("::");
}

function normalizeHookMap(hooks) {
  if (hooks instanceof Map) {
    const output = {};
    for (const [key, value] of hooks.entries()) output[text(key, "")] = value;
    return output;
  }

  return isPlainObject(hooks) ? hooks : {};
}

function getRunnerEntry(runner) {
  try {
    return runner?.__hookEntry || null;
  } catch {
    return null;
  }
}

function isHookRunner(value) {
  return Boolean(isFn(value) && getRunnerEntry(value));
}

function normalizeHookValue(value) {
  if (Array.isArray(value)) return value;
  if (isFn(value)) return [value];
  if (isPlainObject(value) && isFn(value.handler)) return [value];
  return [];
}

function ensureRegistry(registry) {
  const finalRegistry = isObjectLike(registry) ? registry : {};

  try {
    finalRegistry.hooks = normalizeHookMap(finalRegistry.hooks);
  } catch {
    finalRegistry.hooks = {};
  }

  try {
    finalRegistry.hookMeta = isPlainObject(finalRegistry.hookMeta) ? finalRegistry.hookMeta : {};
  } catch {
    finalRegistry.hookMeta = {};
  }

  for (const type of DEFAULT_HOOK_TYPES) {
    if (!Array.isArray(finalRegistry.hooks[type])) finalRegistry.hooks[type] = normalizeHookValue(finalRegistry.hooks[type]);
    if (!Array.isArray(finalRegistry.hookMeta[type])) finalRegistry.hookMeta[type] = [];
  }

  return finalRegistry;
}

/* =========================================================
   OPTIONS / ENTRIES
========================================================= */

function normalizeType(type = "") {
  return text(type, "");
}

function normalizeName(name = "") {
  return text(name, "");
}

function normalizeOptions(options = {}) {
  if (typeof options === "number") {
    return {
      key: "",
      name: "",
      priority: number(options, 0),
      once: false,
      enabled: true,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      tags: [],
      meta: null,
      replace: false,
      overwrite: false,
      strict: false,
      allowDynamicType: false,
    };
  }

  const opts = isPlainObject(options) ? options : {};

  return {
    key: text(opts.key, ""),
    name: normalizeName(opts.name),
    priority: number(opts.priority, 0),
    once: opts.once === true,
    enabled: opts.enabled !== false,
    timeoutMs: Math.max(0, number(opts.timeoutMs ?? opts.timeout, DEFAULT_TIMEOUT_MS)),
    tags: toArray(opts.tags).flat(Infinity).map((tag) => text(tag, "")).filter(Boolean),
    meta: isPlainObject(opts.meta) ? clonePlain(opts.meta, {}) : null,
    replace: opts.replace === true,
    overwrite: opts.overwrite === true,
    strict: opts.strict === true,
    allowDynamicType: opts.allowDynamicType === true,
  };
}

function publicEntry(entry = {}) {
  return {
    type: entry.type || "",
    key: entry.key || "",
    name: entry.name || "",
    priority: number(entry.priority, 0),
    once: Boolean(entry.once),
    enabled: entry.enabled !== false,
    consumed: Boolean(entry.consumed),
    timeoutMs: number(entry.timeoutMs, 0),
    tags: Array.isArray(entry.tags) ? [...entry.tags] : [],
    meta: entry.meta ? sanitize(entry.meta) : null,
    createdAt: entry.createdAt || "",
    createdAtMs: number(entry.createdAtMs, 0),
    runCount: number(entry.runCount, 0),
    errorCount: number(entry.errorCount, 0),
    lastRunAt: entry.lastRunAt || "",
    lastRunAtMs: number(entry.lastRunAtMs, 0),
    lastDurationMs: number(entry.lastDurationMs, 0),
    lastError: entry.lastError ? sanitize(entry.lastError) : null,
    removed: Boolean(entry.removed),
    removedAt: entry.removedAt || "",
    index: number(entry.index, 0),
  };
}

function sortEntries(entries = []) {
  return entries.slice().sort((a, b) => {
    const priorityDiff = number(b.priority, 0) - number(a.priority, 0);
    if (priorityDiff) return priorityDiff;

    const createdDiff = number(a.createdAtMs, 0) - number(b.createdAtMs, 0);
    if (createdDiff) return createdDiff;

    return number(a.index, 0) - number(b.index, 0);
  });
}

function createTimeout(ms, label = "hook") {
  const timeoutMs = Math.max(0, number(ms, 0));
  if (!timeoutMs) return null;

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

export function createHooks({ registry, events, utils, strict = false, allowDynamicTypes = false } = {}) {
  const finalRegistry = ensureRegistry(registry);

  const state = {
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
    state.recent.unshift({ ...sanitize(event), at: iso(), atMs: now() });
    if (state.recent.length > MAX_RECENT) state.recent.splice(MAX_RECENT);
  }

  function isStrict(options = {}) {
    return Boolean(strict || options?.strict === true);
  }

  function recordError(type, error, entry = null, options = {}) {
    const payload = {
      type: text(type, ""),
      key: entry?.key || "",
      hook: entry?.name || entry?.key || "",
      name: text(error?.name, "Error"),
      message: redactText(text(error?.message || error, "Hook error.")),
      timeout: Boolean(error?.timeout),
      at: iso(),
    };

    state.errorCount += 1;
    state.lastError = payload;

    if (entry) {
      entry.errorCount = number(entry.errorCount, 0) + 1;
      entry.lastError = payload;
    }

    pushRecent({ event: "error", ...payload });
    warn(utils, `Hook error en "${type}".`, error);
    emit(events, HOOK_EVENTS.error, payload);

    if (isStrict(options)) throw error instanceof Error ? error : new Error(payload.message);

    return payload;
  }

  function hasType(type = "") {
    const cleanType = normalizeType(type);
    return Boolean(cleanType && Array.isArray(finalRegistry.hooks?.[cleanType]));
  }

  function defineType(type = "") {
    const cleanType = normalizeType(type);
    if (!cleanType) return false;

    if (!Array.isArray(finalRegistry.hooks[cleanType])) {
      finalRegistry.hooks[cleanType] = [];
      finalRegistry.hookMeta[cleanType] = [];
      state.typeDefineCount += 1;

      pushRecent({ event: "type-defined", type: cleanType });
      emit(events, HOOK_EVENTS.typeDefined, { type: cleanType, at: iso() });
    }

    return true;
  }

  function ensureType(type = "", options = {}) {
    const cleanType = normalizeType(type);
    if (!cleanType) return "";
    if (hasType(cleanType)) return cleanType;

    if (allowDynamicTypes || options?.allowDynamicType === true) {
      defineType(cleanType);
      return cleanType;
    }

    const message = `Hook desconocido: ${cleanType}`;
    if (isStrict(options)) throw new Error(message);
    warn(utils, message);
    return "";
  }

  function createRunner(entry) {
    const runner = async function onionHookRunner(payload, context = {}) {
      const result = await invokeEntry(entry, payload, context, { invokedBy: "direct" });
      return result.value;
    };

    defineHidden(runner, "__hookEntry", entry);
    defineHidden(runner, "__hookType", entry.type);
    defineHidden(runner, "__hookKey", entry.key);
    defineHidden(runner, "__hookOriginal", entry.handler);
    defineHidden(runner, "__isOnionHook", true);

    return runner;
  }

  function createEntry(type, handler, options = {}, index = 0) {
    const cleanType = normalizeType(type);
    const opts = normalizeOptions(options);
    const createdAtMs = now();
    const name = opts.name || normalizeName(handler?.name || "");
    const key = opts.key || makeHookKey(cleanType, handler, name);

    const entry = {
      type: cleanType,
      handler,
      originalHandler: handler,
      runner: null,
      key,
      name,
      priority: opts.priority,
      once: opts.once,
      enabled: opts.enabled,
      consumed: false,
      timeoutMs: opts.timeoutMs,
      tags: opts.tags,
      meta: opts.meta,
      createdAt: iso(createdAtMs),
      createdAtMs,
      runCount: 0,
      errorCount: 0,
      lastRunAt: "",
      lastRunAtMs: 0,
      lastDurationMs: 0,
      lastError: null,
      removed: false,
      removedAt: "",
      index: number(index, 0),
    };

    entry.runner = createRunner(entry);
    return entry;
  }

  function normalizeExistingEntry(type, item, index = 0) {
    const cleanType = normalizeType(type);

    if (isHookRunner(item)) {
      const entry = getRunnerEntry(item);
      entry.type = entry.type || cleanType;
      entry.index = number(entry.index, index);
      entry.runner = item;
      return entry;
    }

    if (isFn(item)) return createEntry(cleanType, item, { name: item.name || "" }, index);

    if (isPlainObject(item) && isFn(item.handler)) {
      return createEntry(cleanType, item.handler, {
        key: item.key,
        name: item.name || item.handler.name || "",
        priority: item.priority,
        once: item.once,
        enabled: item.enabled,
        timeoutMs: item.timeoutMs ?? item.timeout,
        tags: item.tags,
        meta: item.meta,
      }, index);
    }

    return null;
  }

  function normalizeList(type) {
    const cleanType = normalizeType(type);
    if (!hasType(cleanType)) return [];

    const source = normalizeHookValue(finalRegistry.hooks[cleanType]);
    const seen = new Set();
    const entries = [];

    source.forEach((item, index) => {
      const entry = normalizeExistingEntry(cleanType, item, index);
      if (!entry || !entry.key || entry.removed === true) return;
      if (seen.has(entry.key)) return;

      seen.add(entry.key);
      if (!entry.runner) entry.runner = createRunner(entry);
      entries.push(entry);
    });

    const sorted = sortEntries(entries).map((entry, index) => {
      entry.index = index;
      return entry;
    });

    finalRegistry.hooks[cleanType] = sorted.map((entry) => entry.runner);
    finalRegistry.hookMeta[cleanType] = sorted.map(publicEntry);

    return sorted;
  }

  async function invokeEntry(entry, payload, context = {}, options = {}) {
    if (!entry || !isFn(entry.handler)) return { ok: true, skipped: true, value: undefined };

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

    const startedAt = now();
    const type = normalizeType(entry.type);
    const hookContext = {
      ...(isPlainObject(context) ? context : {}),
      type,
      key: entry.key,
      name: entry.name,
      hook: publicEntry(entry),
      registry: finalRegistry,
      hooks: apiRef,
      invokedBy: options.invokedBy || context?.invokedBy || "hooks",
    };

    let timeout = null;
    let ok = true;
    let value = undefined;
    let capturedError = null;

    try {
      timeout = createTimeout(entry.timeoutMs, entry.name || entry.key);
      const execution = Promise.resolve().then(() => entry.handler(payload, hookContext));
      execution.catch(() => {});
      value = timeout ? await Promise.race([execution, timeout.promise]) : await execution;
    } catch (error) {
      ok = false;
      capturedError = error;
      recordError(type, error, entry, { strict: options.throwOnError === true });
      if (options.throwOnError === true) throw error;
    } finally {
      try { timeout?.clear?.(); } catch {}

      const endedAt = now();
      entry.runCount = number(entry.runCount, 0) + 1;
      entry.lastRunAtMs = endedAt;
      entry.lastRunAt = iso(endedAt);
      entry.lastDurationMs = Math.max(0, endedAt - startedAt);
      state.runHookCount += 1;

      if (entry.once) {
        entry.consumed = true;
        entry.enabled = false;
        remove(entry.type, entry.key, { reason: "once", silent: true });
      }
    }

    return { ok, failed: !ok, value, error: capturedError, entry: publicEntry(entry) };
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

    if (isPlainObject(handler) && isFn(handler.handler)) {
      const { handler: realHandler, ...entryOptions } = handler;
      return { handler: realHandler, options: { ...entryOptions, ...(isPlainObject(options) ? options : {}) } };
    }

    return { handler, options };
  }

  function add(type, handler, options = {}) {
    const normalized = normalizeAddInput(handler, options);
    const opts = normalizeOptions(normalized.options);
    const cleanType = ensureType(type, opts);

    if (!cleanType) return noopDisposer;

    const finalHandler = normalized.handler;

    if (!isFn(finalHandler)) {
      const message = "El hook debe ser una función.";
      if (isStrict(opts)) throw new Error(message);
      warn(utils, message, { type: cleanType });
      return noopDisposer;
    }

    const list = normalizeList(cleanType);
    const name = opts.name || finalHandler.name || "";
    const key = opts.key || makeHookKey(cleanType, finalHandler, name);
    const existing = list.find((entry) => entry.key === key);

    if (existing) {
      if (opts.replace || opts.overwrite) {
        remove(cleanType, key, { reason: "replace", silent: true });
        state.replaceCount += 1;
        pushRecent({ event: "replace", type: cleanType, key, name: existing.name });
        emit(events, HOOK_EVENTS.replace, { type: cleanType, key, name: existing.name, at: iso() });
      } else {
        state.duplicateCount += 1;
        pushRecent({ event: "duplicate", type: cleanType, key, name: existing.name });
        emit(events, HOOK_EVENTS.duplicate, { type: cleanType, key, name: existing.name, at: iso() });
        return () => remove(cleanType, key);
      }
    }

    const entry = createEntry(cleanType, finalHandler, { ...normalized.options, key }, list.length);
    finalRegistry.hooks[cleanType].push(entry.runner);
    normalizeList(cleanType);

    state.addCount += 1;
    pushRecent({ event: "add", type: cleanType, key: entry.key, name: entry.name, priority: entry.priority, once: entry.once, timeoutMs: entry.timeoutMs });
    emit(events, HOOK_EVENTS.add, { type: cleanType, key: entry.key, name: entry.name, priority: entry.priority, once: entry.once, timeoutMs: entry.timeoutMs, at: iso() });

    let disposed = false;
    return () => {
      if (disposed) return false;
      disposed = true;
      return remove(cleanType, entry.key);
    };
  }

  function once(type, handler, options = {}) {
    return add(type, handler, { ...(isPlainObject(options) ? options : {}), once: true });
  }

  function findEntries(type, handlerOrKey) {
    const cleanType = normalizeType(type);
    if (!hasType(cleanType)) return [];

    const list = normalizeList(cleanType);

    if (isFn(handlerOrKey)) {
      return list.filter((entry) => entry.handler === handlerOrKey || entry.originalHandler === handlerOrKey || entry.runner === handlerOrKey);
    }

    const key = text(handlerOrKey, "");
    if (!key) return [];

    return list.filter((entry) => entry.key === key || entry.name === key);
  }

  function remove(type, handlerOrKey, options = {}) {
    const cleanType = normalizeType(type);
    if (!hasType(cleanType)) return false;

    const list = normalizeList(cleanType);
    const matches = findEntries(cleanType, handlerOrKey);
    if (!matches.length) return false;

    const keys = new Set(matches.map((entry) => entry.key));

    for (const entry of matches) {
      entry.removed = true;
      entry.removedAt = iso();
      entry.enabled = false;
    }

    finalRegistry.hooks[cleanType] = list.filter((entry) => !keys.has(entry.key)).map((entry) => entry.runner);
    normalizeList(cleanType);

    state.removeCount += keys.size;

    const payload = { type: cleanType, removed: keys.size, keys: [...keys], reason: options?.reason || "remove", at: iso() };
    pushRecent({ event: "remove", ...payload });

    if (options?.silent !== true) emit(events, HOOK_EVENTS.remove, payload);

    return true;
  }

  function clear(type = "") {
    const cleanType = normalizeType(type);

    if (cleanType) {
      if (!hasType(cleanType)) return 0;

      const removed = normalizeList(cleanType).length;
      finalRegistry.hooks[cleanType] = [];
      finalRegistry.hookMeta[cleanType] = [];
      state.clearCount += 1;

      pushRecent({ event: "clear", type: cleanType, count: removed });
      emit(events, HOOK_EVENTS.clear, { type: cleanType, count: removed, at: iso() });
      return removed;
    }

    let total = 0;
    for (const hookType of types()) total += clear(hookType);
    return total;
  }

  function enable(type, handlerOrKey, value = true) {
    const cleanType = normalizeType(type);
    if (!hasType(cleanType)) return false;

    const matches = findEntries(cleanType, handlerOrKey);

    for (const entry of matches) {
      entry.enabled = Boolean(value);
      if (Boolean(value) && entry.once && entry.consumed) entry.consumed = false;
    }

    normalizeList(cleanType);

    if (matches.length) {
      const payload = { type: cleanType, enabled: Boolean(value), count: matches.length, keys: matches.map((entry) => entry.key), at: iso() };
      pushRecent({ event: value ? "enable" : "disable", ...payload });
      emit(events, HOOK_EVENTS.enabled, payload);
    }

    return matches.length > 0;
  }

  function setPriority(type, handlerOrKey, priority = 0) {
    const cleanType = normalizeType(type);
    if (!hasType(cleanType)) return false;

    const matches = findEntries(cleanType, handlerOrKey);
    const nextPriority = number(priority, 0);

    for (const entry of matches) entry.priority = nextPriority;
    normalizeList(cleanType);

    if (matches.length) {
      const payload = { type: cleanType, priority: nextPriority, count: matches.length, keys: matches.map((entry) => entry.key), at: iso() };
      pushRecent({ event: "priority", ...payload });
      emit(events, HOOK_EVENTS.priority, payload);
    }

    return matches.length > 0;
  }

  async function run(type, payload = {}, options = {}) {
    const opts = isPlainObject(options) ? options : {};
    const mode = text(opts.mode, "series").toLowerCase();
    return mode === "parallel" || mode === "all" ? runParallel(type, payload, opts) : runSeries(type, payload, opts);
  }

  async function runSeries(type, payload = {}, options = {}) {
    const cleanType = ensureType(type, options);
    if (!cleanType) return payload;

    const opts = isPlainObject(options) ? options : {};
    let current = payload;
    const list = normalizeList(cleanType).filter((entry) => entry.enabled !== false && entry.consumed !== true);

    state.runCount += 1;
    state.lastType = cleanType;
    state.lastRunAt = now();
    state.lastRunAtIso = iso(state.lastRunAt);

    emit(events, HOOK_EVENTS.runStart, { type: cleanType, count: list.length, mode: "series", at: state.lastRunAtIso });

    let executed = 0;
    let failed = 0;

    for (const entry of list) {
      let result = null;

      try {
        result = await invokeEntry(entry, current, { ...(isPlainObject(opts.context) ? opts.context : {}), mode: "series" }, { invokedBy: "runSeries", throwOnError: opts.throwOnError === true });
      } catch (error) {
        result = { ok: false, failed: true, error };
        if (opts.throwOnError === true) throw error;
      }

      executed += 1;

      if (result?.failed) {
        failed += 1;
        if (opts.stopOnError === true) break;
        continue;
      }

      if (result?.value !== undefined) current = result.value;
    }

    const done = { type: cleanType, count: list.length, executed, failed, mode: "series", at: iso() };
    pushRecent({ event: "run", ...done });
    emit(events, HOOK_EVENTS.runDone, done);

    return current;
  }

  async function runParallel(type, payload = {}, options = {}) {
    const cleanType = ensureType(type, options);
    if (!cleanType) return [];

    const opts = isPlainObject(options) ? options : {};
    const list = normalizeList(cleanType).filter((entry) => entry.enabled !== false && entry.consumed !== true);

    state.runCount += 1;
    state.lastType = cleanType;
    state.lastRunAt = now();
    state.lastRunAtIso = iso(state.lastRunAt);

    emit(events, HOOK_EVENTS.runStart, { type: cleanType, count: list.length, mode: "parallel", at: state.lastRunAtIso });

    const settled = await Promise.all(list.map(async (entry) => {
      try {
        const result = await invokeEntry(entry, payload, { ...(isPlainObject(opts.context) ? opts.context : {}), mode: "parallel" }, { invokedBy: "runParallel", throwOnError: opts.throwOnError === true });
        return { status: result?.failed ? "rejected" : "fulfilled", value: result?.value, reason: result?.error || null, hook: publicEntry(entry) };
      } catch (error) {
        if (opts.throwOnError === true) throw error;
        return { status: "rejected", value: undefined, reason: sanitize(error), hook: publicEntry(entry) };
      }
    }));

    const failed = settled.filter((item) => item.status === "rejected").length;
    const fulfilled = settled.length - failed;
    const done = { type: cleanType, count: list.length, fulfilled, failed, mode: "parallel", at: iso() };

    pushRecent({ event: "run", ...done });
    emit(events, HOOK_EVENTS.runParallelDone, done);
    emit(events, HOOK_EVENTS.runDone, done);

    return opts.settled === false ? settled.map((item) => item.status === "fulfilled" ? item.value : undefined) : settled;
  }

  function get(type = "") {
    const cleanType = normalizeType(type);
    if (!cleanType || !hasType(cleanType)) return [];
    return normalizeList(cleanType).map((entry) => entry.runner);
  }

  function getEntries(type = "") {
    const cleanType = normalizeType(type);
    if (!cleanType || !hasType(cleanType)) return [];
    return normalizeList(cleanType).map(publicEntry);
  }

  function getEntry(type = "", handlerOrKey = "") {
    const matches = findEntries(type, handlerOrKey);
    return matches[0] ? publicEntry(matches[0]) : null;
  }

  function types() {
    return Object.keys(finalRegistry.hooks || {});
  }

  function count(type = "") {
    const cleanType = normalizeType(type);
    if (cleanType) return normalizeList(cleanType).length;
    return types().reduce((total, hookType) => total + normalizeList(hookType).length, 0);
  }

  function getSnapshot(options = {}) {
    const opts = isPlainObject(options) ? options : {};
    const hookTypes = types();

    return {
      version: HOOKS_VERSION,
      types: hookTypes,
      total: count(),
      counts: Object.fromEntries(hookTypes.map((hookType) => [hookType, normalizeList(hookType).length])),
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
        lastError: state.lastError ? sanitize(state.lastError) : null,
      },
      hooks: Object.fromEntries(hookTypes.map((hookType) => [hookType, normalizeList(hookType).map(publicEntry)])),
      recent: opts.includeRecent === false ? [] : sanitize(state.recent),
      at: iso(),
      policy: {
        registryOnly: true,
        executableRunnersInRegistry: true,
        noAuth: true,
        noRouter: true,
        noStorage: true,
        noFetch: true,
        redactedSnapshots: true,
      },
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
      for (const hookType of DEFAULT_HOOK_TYPES) defineType(hookType);
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

  for (const hookType of types()) normalizeList(hookType);

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
    disable(type, handlerOrKey) { return enable(type, handlerOrKey, false); },

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

  emit(events, HOOK_EVENTS.ready, { version: HOOKS_VERSION, total: count(), types: types(), at: iso() });
  log(utils, "Hooks ready.", { version: HOOKS_VERSION, total: count() });

  return api;
}

export default {
  HOOKS_VERSION,
  DEFAULT_HOOK_TYPES,
  HOOK_EVENTS,
  createHooks,
};
