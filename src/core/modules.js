/* =========================================================
   Onion SPA - Core Modules
   Archivo: src/core/modules.js

   CORE MODULES · CLEAN
   - Registry único de módulos
   - Aliases case-insensitive
   - Register idempotente
   - set/upsert con overwrite explícito
   - dispose seguro
   - snapshots sin instancias ni secretos
========================================================= */

export const MODULES_VERSION = "18.0.0-clean";

export const DEFAULT_DISPOSE_METHODS = Object.freeze([
  "destroy",
  "dispose",
  "unmount",
  "stop",
  "teardown",
  "cleanup",
]);

export const MODULE_EVENTS = Object.freeze({
  ready: "app:modules:ready",
  registered: "app:module:registered",
  duplicate: "app:module:duplicate",
  overwritten: "app:module:overwritten",
  alias: "app:module:alias",
  aliasConflict: "app:module:alias-conflict",
  unregistered: "app:module:unregistered",
  disposed: "app:module:disposed",
  disposeError: "app:module:dispose-error",
  cleared: "app:modules:cleared",
  error: "app:modules:error",
});

const MAX_RECENT = 40;
const CONTROL_RE = /[\u0000-\u001f\u007f]/g;
const SENSITIVE_KEY_RE = /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;
const TOKENISH_RE = /(bearer\s+[a-z0-9._~+/=-]+)|([a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)|([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|code|t)=)[^&#\s]+/gi;

const META_RESERVED = new Set([
  "name",
  "moduleName",
  "key",
  "id",
  "instance",
  "module",
  "value",
  "ref",
  "options",
  "alias",
  "aliases",
  "overwrite",
  "replace",
  "strict",
  "silent",
  "emit",
  "emitDuplicate",
  "emitDuplicates",
  "dispose",
  "disposePrevious",
  "disposeMethod",
  "disposeMethods",
  "overwriteAliases",
  "source",
  "label",
  "version",
  "description",
  "tags",
  "meta",
]);

/* =========================================================
   BASICS
========================================================= */

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object";
}

function isFunction(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).replace(CONTROL_RE, "").trim();
  return text || fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  if (value === null || value === undefined) return [];
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

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function uniqueText(values = []) {
  return [
    ...new Set(
      toArray(values)
        .flat(Infinity)
        .map((item) => safeText(item, ""))
        .filter(Boolean)
    ),
  ];
}

function ensureMap(value) {
  if (value instanceof Map) return value;

  const map = new Map();

  if (isPlainObject(value)) {
    try {
      for (const [key, item] of Object.entries(value)) {
        map.set(key, item);
      }
    } catch {}
  }

  return map;
}

/* =========================================================
   REDACTION
========================================================= */

function redactText(value = "") {
  const text = safeText(value, "");
  if (!text) return "";

  try {
    return text
      .replace(TOKENISH_RE, (_match, bearer, jwt, queryPrefix) => {
        if (bearer) return bearer.replace(/(bearer\s+).+/i, "$1***");
        if (queryPrefix) return `${queryPrefix}***`;
        if (jwt) return "***";
        return "***";
      })
      .replace(/(bearer\s+)([a-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/([a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)/gi, "***");
  } catch {
    return text;
  }
}

function sanitize(value, depth = 0, keyHint = "", seen = new WeakSet()) {
  if (depth > 5) return "[depth-limit]";

  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) {
    return value ? "***" : value;
  }

  if (typeof value === "string") return redactText(value);

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redactText(value.message || ""),
      stack: value.stack ? "[stack]" : "",
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) => sanitize(item, depth + 1, keyHint, seen));
  }

  if (isObject(value)) {
    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      output[key] = sanitize(item, depth + 1, key, seen);
    }

    return output;
  }

  return redactText(String(value));
}

function emit(events, name, payload = {}, options = {}) {
  const eventName = safeText(name, "");
  if (!eventName || options.silent === true || options.emit === false) return false;

  const cleanPayload = sanitize({
    version: MODULES_VERSION,
    source: "core.modules",
    at: iso(),
    ...payload,
  });

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

function warn(utils, ...args) {
  const clean = args.map((item) => sanitize(item));

  try {
    if (isFunction(utils?.warn)) {
      utils.warn("[Modules]", ...clean);
      return;
    }
  } catch {}

  try {
    if (utils?.debug === true) console.warn("[Modules]", ...clean);
  } catch {}
}

function log(utils, ...args) {
  try {
    utils?.log?.("[Modules]", ...args.map((item) => sanitize(item)));
  } catch {}
}

/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeName(name = "") {
  return safeText(name, "");
}

function lookupKey(value = "") {
  return safeText(value, "").toLowerCase();
}

function normalizeAlias(value = "") {
  return lookupKey(value);
}

function flattenValues(value, output = []) {
  if (Array.isArray(value) || value instanceof Set) {
    for (const item of Array.from(value)) flattenValues(item, output);
    return output;
  }

  if (value !== null && value !== undefined && value !== "") {
    output.push(value);
  }

  return output;
}

function uniqueAliases(values = []) {
  return [
    ...new Set(
      flattenValues(values)
        .map(normalizeAlias)
        .filter(Boolean)
    ),
  ];
}

function uniqueDisposeMethods(values = []) {
  const output = [];
  const seen = new Set();

  for (const value of flattenValues(values)) {
    if (typeof value === "symbol") {
      if (!seen.has(value)) {
        seen.add(value);
        output.push(value);
      }

      continue;
    }

    const method = safeText(value, "");

    if (method && !seen.has(method)) {
      seen.add(method);
      output.push(method);
    }
  }

  return output;
}

function normalizeTags(values = []) {
  return uniqueText(values);
}

function getInstanceValue(instance, key, fallback = "") {
  try {
    const value = instance?.[key];
    return value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

function hasMethod(instance, method) {
  try {
    return isFunction(instance?.[method]);
  } catch {
    return false;
  }
}

function symbolDispose(instance, async = false) {
  try {
    const key = async ? Symbol.asyncDispose : Symbol.dispose;
    return key && isFunction(instance?.[key]) ? key : null;
  } catch {
    return null;
  }
}

function isDisposable(instance) {
  if (!instance) return false;
  if (symbolDispose(instance, true) || symbolDispose(instance, false)) return true;

  return DEFAULT_DISPOSE_METHODS.some((method) => hasMethod(instance, method));
}

function capabilities(instance) {
  return {
    hasInit: hasMethod(instance, "init"),
    hasBoot: hasMethod(instance, "boot"),
    hasStart: hasMethod(instance, "start"),
    hasStop: hasMethod(instance, "stop"),
    hasMount: hasMethod(instance, "mount"),
    hasUnmount: hasMethod(instance, "unmount"),
    hasRender: hasMethod(instance, "render"),
    hasDestroy: hasMethod(instance, "destroy"),
    hasDispose: hasMethod(instance, "dispose"),
    hasTeardown: hasMethod(instance, "teardown"),
    hasCleanup: hasMethod(instance, "cleanup"),
    disposable: isDisposable(instance),
  };
}

function instanceType(instance) {
  if (instance === null) return "null";
  if (instance === undefined) return "undefined";
  if (Array.isArray(instance)) return "array";
  if (isFunction(instance)) return "function";
  return typeof instance;
}

function normalizeRegisterArgs(name, instance, options = {}) {
  if (isPlainObject(name) && instance === undefined) {
    const source = name;

    return {
      name: source.name || source.moduleName || source.key || source.id || "",
      instance: source.instance ?? source.module ?? source.value ?? source.ref ?? null,
      options: {
        ...source,
        ...(isPlainObject(source.options) ? source.options : {}),
      },
    };
  }

  return {
    name,
    instance,
    options: isPlainObject(options) ? options : {},
  };
}

function customMeta(options = {}) {
  const opts = isPlainObject(options) ? options : {};

  if (isPlainObject(opts.meta)) return sanitize(opts.meta);

  const output = {};

  for (const [key, value] of Object.entries(opts)) {
    if (META_RESERVED.has(key)) continue;
    output[key] = sanitize(value, 0, key);
  }

  return Object.keys(output).length ? output : null;
}

/* =========================================================
   FACTORY
========================================================= */

export function createModules(input = {}) {
  const registry = isObject(input.registry) ? input.registry : {};
  const events = input.events || input.bus || registry.events || registry.bus || null;
  const utils = input.utils || input.logger || registry.utils || registry.logger || null;
  const strict = input.strict === true;

  registry.modules = ensureMap(registry.modules);
  registry.moduleAliases = ensureMap(registry.moduleAliases);
  registry.moduleMeta = ensureMap(registry.moduleMeta);
  registry.moduleNameIndex = ensureMap(registry.moduleNameIndex);

  const recent = [];

  const state = {
    registerCount: 0,
    duplicateCount: 0,
    overwriteCount: 0,
    unregisterCount: 0,
    aliasCount: 0,
    aliasConflictCount: 0,
    disposeCount: 0,
    disposeErrorCount: 0,
    clearCount: 0,
    errorCount: 0,
    lastRegistered: "",
    lastDuplicate: "",
    lastOverwritten: "",
    lastUnregistered: "",
    lastDisposed: "",
    lastError: null,
  };

  function pushRecent(type, payload = {}) {
    recent.unshift({
      type,
      ...sanitize(payload),
      at: iso(),
    });

    if (recent.length > MAX_RECENT) recent.splice(MAX_RECENT);
  }

  function fail(message, extra = {}, options = {}) {
    const payload = {
      message: safeText(message, "Modules error."),
      ...sanitize(extra),
      at: iso(),
    };

    state.errorCount += 1;
    state.lastError = payload;

    pushRecent("error", payload);
    emit(events, MODULE_EVENTS.error, payload, options);

    if (strict || options.strict === true) {
      const error = new Error(payload.message);

      try {
        error.code = extra?.code || "MODULES_ERROR";
        error.details = payload;
      } catch {}

      throw error;
    }

    warn(utils, payload.message, extra);
    return false;
  }

  function rebuildNameIndex() {
    registry.moduleNameIndex.clear();

    for (const name of registry.modules.keys()) {
      const clean = normalizeName(name);
      if (clean) registry.moduleNameIndex.set(lookupKey(clean), clean);
    }

    return registry.moduleNameIndex;
  }

  function normalizeAliasMap() {
    const next = new Map();

    for (const [rawAlias, rawTarget] of registry.moduleAliases.entries()) {
      const alias = normalizeAlias(rawAlias);
      const target = normalizeName(rawTarget);

      if (alias && target) next.set(alias, target);
    }

    registry.moduleAliases = next;
    return registry.moduleAliases;
  }

  normalizeAliasMap();
  rebuildNameIndex();

  function resolveName(nameOrAlias = "") {
    const clean = normalizeName(nameOrAlias);
    if (!clean) return "";

    if (registry.modules.has(clean)) return clean;

    const lower = lookupKey(clean);
    const byName = registry.moduleNameIndex.get(lower);

    if (byName && registry.modules.has(byName)) return byName;

    const byAlias = registry.moduleAliases.get(lower);

    if (byAlias && registry.modules.has(byAlias)) return byAlias;

    return clean;
  }

  function getExistingMeta(name) {
    return registry.moduleMeta.get(name) || null;
  }

  function removeAliasesFor(name = "") {
    const clean = normalizeName(name);
    let removed = 0;

    for (const [aliasName, target] of Array.from(registry.moduleAliases.entries())) {
      if (target === clean) {
        registry.moduleAliases.delete(aliasName);
        removed += 1;
      }
    }

    return removed;
  }

  function buildMeta(name, instance, options = {}, previous = null) {
    const cleanName = normalizeName(name);
    const opts = isPlainObject(options) ? options : {};
    const stamp = now();
    const createdAtMs = safeNumber(previous?.createdAtMs, 0) || stamp;

    const aliases = uniqueAliases([
      cleanName,
      opts.alias,
      opts.aliases,
      getInstanceValue(instance, "name", ""),
      getInstanceValue(instance, "moduleName", ""),
      getInstanceValue(instance, "id", ""),
    ]);

    const caps = capabilities(instance);

    return {
      name: cleanName,
      aliases,
      label: safeText(
        opts.label ||
          getInstanceValue(instance, "label", "") ||
          getInstanceValue(instance, "displayName", ""),
        cleanName
      ),
      version: safeText(opts.version || getInstanceValue(instance, "version", ""), ""),
      description: safeText(opts.description || getInstanceValue(instance, "description", ""), ""),
      tags: normalizeTags(opts.tags),
      source: safeText(opts.source, "core"),
      type: instanceType(instance),
      capabilities: caps,
      disposable: Boolean(caps.disposable),
      createdAt: previous?.createdAt || iso(createdAtMs),
      createdAtMs,
      updatedAt: iso(stamp),
      updatedAtMs: stamp,
      registerCount: safeNumber(previous?.registerCount, 0) + 1,
      overwritten: Boolean(opts.overwritten),
      custom: customMeta(opts),
    };
  }

  function wouldAliasCollide(aliasName, targetName) {
    const moduleName = registry.moduleNameIndex.get(aliasName);
    return Boolean(moduleName && moduleName !== targetName);
  }

  function setAliases(name, aliases = [], options = {}) {
    const cleanName = normalizeName(name);
    const accepted = [];
    const opts = isPlainObject(options) ? options : {};

    if (!cleanName) return accepted;

    for (const aliasName of uniqueAliases(aliases)) {
      const currentTarget = registry.moduleAliases.get(aliasName);
      const collision = (currentTarget && currentTarget !== cleanName) || wouldAliasCollide(aliasName, cleanName);

      if (collision && opts.overwriteAliases !== true) {
        state.aliasConflictCount += 1;

        const payload = {
          alias: aliasName,
          target: currentTarget || registry.moduleNameIndex.get(aliasName) || "",
          attemptedTarget: cleanName,
          reason: currentTarget ? "alias-target-collision" : "module-name-collision",
        };

        pushRecent("alias-conflict", payload);
        emit(events, MODULE_EVENTS.aliasConflict, payload, opts);

        continue;
      }

      if (registry.moduleAliases.get(aliasName) !== cleanName) {
        registry.moduleAliases.set(aliasName, cleanName);
      }

      accepted.push(aliasName);
    }

    return accepted;
  }

  function get(nameOrAlias = "") {
    const resolved = resolveName(nameOrAlias);
    return resolved ? registry.modules.get(resolved) || null : null;
  }

  function has(nameOrAlias = "") {
    const resolved = resolveName(nameOrAlias);
    return Boolean(resolved && registry.modules.has(resolved));
  }

  function getMeta(nameOrAlias = "") {
    const resolved = resolveName(nameOrAlias);
    const meta = resolved ? registry.moduleMeta.get(resolved) : null;

    return meta ? sanitize(meta) : null;
  }

  function register(rawName, rawInstance, rawOptions = {}) {
    const args = normalizeRegisterArgs(rawName, rawInstance, rawOptions);
    const cleanName = normalizeName(args.name);
    const instance = args.instance;
    const options = isPlainObject(args.options) ? args.options : {};

    if (!cleanName) {
      return fail("modules.register(name, instance) requiere un nombre.", {
        code: "MODULE_NAME_REQUIRED",
      }, options);
    }

    if (instance === null || instance === undefined) {
      return fail("modules.register(name, instance) requiere una instancia.", {
        code: "MODULE_INSTANCE_REQUIRED",
        name: cleanName,
      }, options);
    }

    const resolvedExisting = resolveName(cleanName);
    const exists = registry.modules.has(resolvedExisting);
    const targetName = exists ? resolvedExisting : cleanName;
    const previous = exists ? registry.modules.get(targetName) : null;
    const sameInstance = previous === instance;
    const overwrite = options.overwrite === true || options.replace === true;

    if (exists && sameInstance) {
      const previousMeta = getExistingMeta(targetName) || buildMeta(targetName, instance);
      const aliases = setAliases(targetName, [previousMeta.aliases, targetName, cleanName, options.alias, options.aliases], options);
      const stamp = now();

      const meta = {
        ...previousMeta,
        aliases: aliases.length ? aliases : previousMeta.aliases || [],
        updatedAt: iso(stamp),
        updatedAtMs: stamp,
      };

      registry.moduleMeta.set(targetName, meta);

      state.duplicateCount += 1;
      state.lastDuplicate = targetName;

      if (options.emitDuplicate === true || options.emitDuplicates === true) {
        const payload = {
          name: targetName,
          requestedName: cleanName,
          sameInstance: true,
          aliases: meta.aliases,
          meta,
        };

        pushRecent("duplicate", payload);
        emit(events, MODULE_EVENTS.duplicate, payload, options);
      }

      return previous;
    }

    if (exists && !overwrite) {
      state.duplicateCount += 1;
      state.lastDuplicate = targetName;

      if (options.emitDuplicate === true || options.emitDuplicates === true) {
        const payload = {
          name: targetName,
          requestedName: cleanName,
          sameInstance: false,
          meta: getExistingMeta(targetName),
        };

        pushRecent("duplicate-blocked", payload);
        emit(events, MODULE_EVENTS.duplicate, payload, options);
      }

      return previous;
    }

    if (exists && overwrite && options.disposePrevious === true) {
      callDispose(previous, {
        name: targetName,
        reason: "overwrite",
        next: cleanName,
      }, options);
    }

    registry.modules.set(targetName, instance);
    registry.moduleNameIndex.set(lookupKey(targetName), targetName);
    removeAliasesFor(targetName);

    const meta = buildMeta(targetName, instance, {
      ...options,
      overwritten: exists,
    }, getExistingMeta(targetName));

    meta.aliases = setAliases(targetName, meta.aliases, options);
    registry.moduleMeta.set(targetName, meta);

    state.registerCount += 1;
    state.lastRegistered = targetName;

    if (exists) {
      state.overwriteCount += 1;
      state.lastOverwritten = targetName;
    }

    const payload = {
      name: targetName,
      requestedName: cleanName,
      aliases: meta.aliases,
      overwritten: exists,
      type: instanceType(instance),
      previousType: instanceType(previous),
      meta,
    };

    pushRecent(exists ? "overwritten" : "registered", payload);

    emit(
      events,
      exists ? MODULE_EVENTS.overwritten : MODULE_EVENTS.registered,
      payload,
      options
    );

    return instance;
  }

  function set(name, instance, options = {}) {
    return register(name, instance, {
      ...(isPlainObject(options) ? options : {}),
      overwrite: true,
    });
  }

  function upsert(name, instance, options = {}) {
    return set(name, instance, options);
  }

  function alias(nameOrAlias = "", aliases = [], options = {}) {
    const resolved = resolveName(nameOrAlias);
    const opts = isPlainObject(options) ? options : {};

    if (!resolved || !registry.modules.has(resolved)) {
      return fail("No se pueden añadir aliases a un módulo inexistente.", {
        code: "MODULE_ALIAS_TARGET_MISSING",
        name: nameOrAlias,
      }, opts);
    }

    const instance = registry.modules.get(resolved);
    const previousMeta = getExistingMeta(resolved) || buildMeta(resolved, instance);
    const accepted = setAliases(resolved, [previousMeta.aliases, aliases], opts);
    const stamp = now();

    const meta = {
      ...previousMeta,
      aliases: accepted.length ? accepted : previousMeta.aliases || [],
      updatedAt: iso(stamp),
      updatedAtMs: stamp,
    };

    registry.moduleMeta.set(resolved, meta);
    state.aliasCount += 1;

    const payload = {
      name: resolved,
      aliases: meta.aliases,
    };

    pushRecent("alias", payload);
    emit(events, MODULE_EVENTS.alias, payload, opts);

    return true;
  }

  function callDispose(instance, context = {}, options = {}) {
    if (!instance) {
      return {
        ok: false,
        method: "",
        missing: true,
      };
    }

    const methods = uniqueDisposeMethods([
      symbolDispose(instance, true),
      symbolDispose(instance, false),
      options.disposeMethod,
      options.disposeMethods,
      DEFAULT_DISPOSE_METHODS,
    ]).filter(Boolean);

    for (const method of methods) {
      let fn = null;

      try {
        fn = instance?.[method];
      } catch {
        fn = null;
      }

      if (!isFunction(fn)) continue;

      const methodName = typeof method === "symbol" ? String(method) : method;

      try {
        const result = fn.call(instance, context);
        const async = Boolean(result && typeof result === "object" && isFunction(result.then));

        state.disposeCount += 1;
        state.lastDisposed = context?.name || state.lastDisposed;

        const payload = {
          name: context?.name || "",
          reason: context?.reason || "",
          method: methodName,
          async,
        };

        pushRecent("disposed", payload);
        emit(events, MODULE_EVENTS.disposed, payload, options);

        if (async) {
          result.catch((error) => {
            state.errorCount += 1;
            state.disposeErrorCount += 1;
            state.lastError = {
              message: safeText(error?.message || error, "Module async dispose error."),
              name: context?.name || "",
              method: methodName,
              at: iso(),
            };

            warn(utils, `Error async ejecutando ${methodName}() del módulo "${context?.name || ""}".`, error);
            emit(events, MODULE_EVENTS.disposeError, state.lastError, options);
          });
        }

        return {
          ok: true,
          method: methodName,
          async,
        };
      } catch (error) {
        state.errorCount += 1;
        state.disposeErrorCount += 1;
        state.lastError = {
          message: safeText(error?.message || error, "Module dispose error."),
          name: context?.name || "",
          method: methodName,
          at: iso(),
        };

        pushRecent("dispose-error", state.lastError);
        warn(utils, `Error ejecutando ${methodName}() del módulo "${context?.name || ""}".`, error);
        emit(events, MODULE_EVENTS.disposeError, state.lastError, options);

        return {
          ok: false,
          method: methodName,
          error: state.lastError,
        };
      }
    }

    return {
      ok: false,
      method: "",
      missing: false,
    };
  }

  function disposeModule(nameOrAlias = "", options = {}) {
    const resolved = resolveName(nameOrAlias);

    if (!resolved || !registry.modules.has(resolved)) return false;

    const result = callDispose(registry.modules.get(resolved), {
      name: resolved,
      reason: options.reason || "disposeModule",
    }, options);

    return result.ok === true;
  }

  function unregister(nameOrAlias = "", options = {}) {
    const resolved = resolveName(nameOrAlias);
    const opts = isPlainObject(options) ? options : {};

    if (!resolved || !registry.modules.has(resolved)) return false;

    const instance = registry.modules.get(resolved);
    const meta = getExistingMeta(resolved);
    let disposeResult = null;

    if (opts.dispose === true) {
      disposeResult = callDispose(instance, {
        name: resolved,
        reason: opts.reason || "unregister",
      }, opts);
    }

    registry.modules.delete(resolved);
    registry.moduleMeta.delete(resolved);
    registry.moduleNameIndex.delete(lookupKey(resolved));
    removeAliasesFor(resolved);

    state.unregisterCount += 1;
    state.lastUnregistered = resolved;

    const payload = {
      name: resolved,
      type: instanceType(instance),
      disposed: Boolean(opts.dispose),
      disposeResult,
      meta,
    };

    pushRecent("unregistered", payload);
    emit(events, MODULE_EVENTS.unregistered, payload, opts);

    return true;
  }

  function clear(options = {}) {
    const names = Array.from(registry.modules.keys());
    let removed = 0;

    for (const name of names) {
      if (unregister(name, options)) removed += 1;
    }

    registry.moduleAliases.clear();
    registry.moduleMeta.clear();
    registry.moduleNameIndex.clear();

    state.clearCount += 1;

    const payload = {
      removed,
      dispose: Boolean(options.dispose),
    };

    pushRecent("cleared", payload);
    emit(events, MODULE_EVENTS.cleared, payload, options);

    return removed;
  }

  function list() {
    return Array.from(registry.modules.keys());
  }

  function aliases() {
    return Array.from(registry.moduleAliases.keys());
  }

  function aliasEntries() {
    return Array.from(registry.moduleAliases.entries()).map(([aliasName, target]) => ({
      alias: aliasName,
      target,
    }));
  }

  function entries() {
    return Array.from(registry.modules.entries());
  }

  function values() {
    return Array.from(registry.modules.values());
  }

  function count() {
    return registry.modules.size;
  }

  function forEach(callback) {
    if (!isFunction(callback)) return false;

    for (const [name, instance] of registry.modules.entries()) {
      try {
        callback(instance, name, getMeta(name));
      } catch (error) {
        state.errorCount += 1;
        state.lastError = {
          message: safeText(error?.message || error, "modules.forEach error."),
          name,
          at: iso(),
        };
        warn(utils, `Error en modules.forEach("${name}")`, error);
      }
    }

    return true;
  }

  function map(callback) {
    if (!isFunction(callback)) return [];

    const output = [];

    forEach((instance, name, meta) => {
      output.push(callback(instance, name, meta));
    });

    return output;
  }

  function filter(callback) {
    if (!isFunction(callback)) return [];

    const output = [];

    forEach((instance, name, meta) => {
      if (callback(instance, name, meta)) output.push(instance);
    });

    return output;
  }

  function find(callback) {
    if (!isFunction(callback)) return null;

    for (const [name, instance] of registry.modules.entries()) {
      try {
        if (callback(instance, name, getMeta(name))) return instance;
      } catch (error) {
        state.errorCount += 1;
        warn(utils, `Error en modules.find("${name}")`, error);
      }
    }

    return null;
  }

  function toObject() {
    return Object.fromEntries(registry.modules.entries());
  }

  function getModuleSnapshot(nameOrAlias = "") {
    const resolved = resolveName(nameOrAlias);

    if (!resolved || !registry.modules.has(resolved)) return null;

    const instance = registry.modules.get(resolved);
    const meta = registry.moduleMeta.get(resolved) || buildMeta(resolved, instance);
    const caps = capabilities(instance);

    return sanitize({
      name: resolved,
      label: meta.label || resolved,
      aliases: meta.aliases || [],
      version: meta.version || "",
      description: meta.description || "",
      tags: meta.tags || [],
      source: meta.source || "",
      type: instanceType(instance),
      disposable: Boolean(caps.disposable),
      capabilities: caps,
      custom: meta.custom || null,
      createdAt: meta.createdAt || "",
      updatedAt: meta.updatedAt || "",
      registerCount: safeNumber(meta.registerCount, 0),
      overwritten: Boolean(meta.overwritten),
    });
  }

  function getSnapshot(options = {}) {
    const names = list();
    const opts = isPlainObject(options) ? options : {};

    return sanitize({
      version: MODULES_VERSION,
      count: count(),
      names,
      aliases: aliasEntries(),
      modules: names.map((name) => getModuleSnapshot(name)),
      stats: {
        ...state,
      },
      recent: opts.includeRecent === false ? [] : recent.map((item) => ({ ...item })),
      at: iso(),
    });
  }

  function reset(options = {}) {
    const removed = clear(options);

    for (const key of Object.keys(state)) {
      if (typeof state[key] === "number") state[key] = 0;
      else if (key === "lastError") state[key] = null;
      else state[key] = "";
    }

    recent.splice(0);

    return {
      removed,
      snapshot: getSnapshot(),
    };
  }

  const api = {
    version: MODULES_VERSION,
    events: MODULE_EVENTS,

    register,
    set,
    upsert,
    alias,

    get,
    require(nameOrAlias = "") {
      const instance = get(nameOrAlias);

      if (!instance && strict) {
        throw new Error(`Módulo no registrado: ${nameOrAlias}`);
      }

      return instance;
    },
    has,

    resolve: resolveName,
    resolveName,

    getMeta,
    meta: getMeta,
    getModuleSnapshot,

    unregister,
    delete: unregister,
    remove: unregister,

    dispose: disposeModule,
    disposeModule,

    clear,
    reset,

    list,
    names: list,
    aliases,
    aliasEntries,
    entries,
    values,
    count,

    forEach,
    map,
    filter,
    find,
    toObject,

    getSnapshot,
    getDebugSnapshot: getSnapshot,
    snapshot: getSnapshot,
  };

  emit(events, MODULE_EVENTS.ready, {
    count: count(),
  }, input);

  log(utils, "Modules ready.", {
    version: MODULES_VERSION,
    count: count(),
  });

  return api;
}

export default {
  MODULES_VERSION,
  DEFAULT_DISPOSE_METHODS,
  MODULE_EVENTS,
  createModules,
};
