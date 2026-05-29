/* =========================================================
   Onion Support - Core Modules
   Archivo: /src/core/modules.js

   Responsabilidad:
   - Registry mínimo de módulos.
   - register / get / remove / list.
   - Compat básica.
   - Aliases simples opcionales.
   - Dispose básico opcional.
   - Sin imports.
   - Sin aliases complejos.
   - Sin metadata pesada.
   - Sin snapshots grandes.
   - Sin dispose avanzado.
   - Sin lógica de dominio.
========================================================= */

export const MODULES_VERSION = "core.modules.v3";

export const DEFAULT_DISPOSE_METHODS = Object.freeze([
  "destroy",
  "dispose",
]);

export const MODULE_EVENTS = Object.freeze({
  ready: "app:modules:ready",
  registered: "app:module:registered",
  removed: "app:module:removed",
  cleared: "app:modules:cleared",
});

const MODULE_NAME_RE = /^[a-z][a-z0-9_-]{0,63}$/;

const BLOCKED_MODULE_NAMES = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function normalizeName(name = "") {
  const value = text(name, "").toLowerCase();

  if (!value) return "";
  if (BLOCKED_MODULE_NAMES.has(value)) return "";
  if (!MODULE_NAME_RE.test(value)) return "";

  return value;
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

function ensureMap(value) {
  return value instanceof Map ? value : new Map();
}

function hasValue(value) {
  return value !== null && value !== undefined;
}

/* =========================================================
   DISPOSE
========================================================= */

function callDispose(instance = null) {
  if (!instance) return false;

  for (const method of DEFAULT_DISPOSE_METHODS) {
    if (!isFunction(instance?.[method])) continue;

    try {
      instance[method]();
      return true;
    } catch {
      // Se prueba el siguiente método si existe.
    }
  }

  return false;
}

function isDisposable(instance = null) {
  return DEFAULT_DISPOSE_METHODS.some((method) =>
    isFunction(instance?.[method])
  );
}

/* =========================================================
   FACTORY
========================================================= */

export function createModules(input = {}) {
  const registry = isObject(input.registry) ? input.registry : {};
  const events = input.events || input.bus || null;

  registry.modules = ensureMap(registry.modules);
  registry.moduleAliases = ensureMap(registry.moduleAliases);

  function resolveKey(name = "") {
    const key = normalizeName(name);

    if (!key) return "";

    if (registry.modules.has(key)) {
      return key;
    }

    const target = registry.moduleAliases.get(key);

    return target && registry.modules.has(target) ? target : "";
  }

  function register(name = "", instance = null, options = {}) {
    const key = normalizeName(name);

    if (!key || !hasValue(instance)) return false;

    const overwrite = options.overwrite === true || options.replace === true;
    const aliasTarget = registry.moduleAliases.get(key);

    if (aliasTarget && !overwrite) {
      return get(key);
    }

    if (aliasTarget) {
      registry.moduleAliases.delete(key);
    }

    const exists = registry.modules.has(key);
    const previous = exists ? registry.modules.get(key) : null;

    if (exists && !overwrite) {
      return previous;
    }

    if (
      exists &&
      previous !== instance &&
      options.disposePrevious === true
    ) {
      callDispose(previous);
    }

    registry.modules.set(key, instance);

    emit(events, MODULE_EVENTS.registered, {
      name: key,
      overwritten: exists || Boolean(aliasTarget),
      aliasReplaced: Boolean(aliasTarget),
    });

    return instance;
  }

  function set(name = "", instance = null, options = {}) {
    return register(name, instance, {
      ...options,
      overwrite: true,
    });
  }

  function upsert(name = "", instance = null, options = {}) {
    return set(name, instance, options);
  }

  function get(name = "") {
    const key = resolveKey(name);

    if (!key) return null;

    return registry.modules.get(key) || null;
  }

  function requireModule(name = "") {
    return get(name);
  }

  function has(name = "") {
    return Boolean(resolveKey(name));
  }

  function removeAliasesForSource(sourceName = "") {
    const source = normalizeName(sourceName);
    let removed = 0;

    if (!source) return removed;

    for (const [aliasName, targetName] of [...registry.moduleAliases.entries()]) {
      if (targetName !== source) continue;

      registry.moduleAliases.delete(aliasName);
      removed += 1;
    }

    return removed;
  }

  function remove(name = "", options = {}) {
    const key = normalizeName(name);

    if (!key) return false;

    const aliasTarget = registry.moduleAliases.get(key);

    if (aliasTarget && !registry.modules.has(key)) {
      registry.moduleAliases.delete(key);

      emit(events, MODULE_EVENTS.removed, {
        name: key,
        alias: true,
        aliasOf: aliasTarget,
        disposed: false,
        aliasesRemoved: 1,
      });

      return true;
    }

    if (!registry.modules.has(key)) return false;

    const instance = registry.modules.get(key);
    let disposed = false;

    if (options.dispose === true) {
      disposed = callDispose(instance);
    }

    registry.modules.delete(key);

    const aliasesRemoved = options.removeAliases === false
      ? 0
      : removeAliasesForSource(key);

    emit(events, MODULE_EVENTS.removed, {
      name: key,
      alias: false,
      disposed,
      aliasesRemoved,
    });

    return true;
  }

  function clear(options = {}) {
    const names = list();
    let disposed = 0;

    if (options.dispose === true) {
      const uniqueInstances = new Set(registry.modules.values());

      for (const instance of uniqueInstances) {
        if (callDispose(instance)) {
          disposed += 1;
        }
      }
    }

    registry.modules.clear();
    registry.moduleAliases.clear();

    emit(events, MODULE_EVENTS.cleared, {
      removed: names.length,
      disposed,
    });

    return names.length;
  }

  function reset(options = {}) {
    const removed = clear(options);

    return {
      removed,
      snapshot: getSnapshot(),
    };
  }

  function dispose(name = "") {
    return callDispose(get(name));
  }

  function disposeModule(name = "") {
    return dispose(name);
  }

  function list() {
    return [...registry.modules.keys()].sort();
  }

  function names() {
    return list();
  }

  function entries() {
    return list().map((name) => [
      name,
      registry.modules.get(name),
    ]);
  }

  function values() {
    return entries().map(([, instance]) => instance);
  }

  function count() {
    return registry.modules.size;
  }

  function forEach(callback) {
    if (!isFunction(callback)) return false;

    for (const [name, instance] of entries()) {
      callback(instance, name);
    }

    return true;
  }

  function map(callback) {
    if (!isFunction(callback)) return [];

    return entries().map(([name, instance]) => callback(instance, name));
  }

  function filter(callback) {
    if (!isFunction(callback)) return [];

    return entries()
      .filter(([name, instance]) => callback(instance, name))
      .map(([, instance]) => instance);
  }

  function find(callback) {
    if (!isFunction(callback)) return null;

    for (const [name, instance] of entries()) {
      if (callback(instance, name)) return instance;
    }

    return null;
  }

  function toObject() {
    const output = {};

    for (const [name, instance] of entries()) {
      output[name] = instance;
    }

    return output;
  }

  function getMeta(name = "") {
    const key = normalizeName(name);

    if (!key) return null;

    const aliasOf = registry.moduleAliases.get(key) || null;
    const target = resolveKey(key);

    if (!target) return null;

    const instance = registry.modules.get(target);

    return {
      name: key,
      target,
      registered: true,
      alias: Boolean(aliasOf),
      aliasOf,
      type: typeof instance,
      disposable: isDisposable(instance),
    };
  }

  function getModuleSnapshot(name = "") {
    const meta = getMeta(name);

    if (!meta) return null;

    return {
      name: meta.name,
      target: meta.target,
      alias: meta.alias,
      aliasOf: meta.aliasOf,
      type: meta.type,
      disposable: meta.disposable,
    };
  }

  function alias(name = "", aliases = [], options = {}) {
    const sourceName = resolveKey(name);

    if (!sourceName) return false;

    const aliasList = Array.isArray(aliases) ? aliases : [aliases];
    const overwrite = options.overwrite === true || options.replace === true;

    let added = 0;

    for (const aliasName of aliasList) {
      const key = normalizeName(aliasName);

      if (!key || key === sourceName) continue;

      if (registry.modules.has(key)) {
        if (!overwrite) continue;

        remove(key, {
          dispose: false,
          removeAliases: true,
        });
      }

      const currentTarget = registry.moduleAliases.get(key);

      if (currentTarget && currentTarget !== sourceName && !overwrite) {
        continue;
      }

      registry.moduleAliases.set(key, sourceName);
      added += 1;

      emit(events, MODULE_EVENTS.registered, {
        name: key,
        alias: true,
        aliasOf: sourceName,
        overwritten: Boolean(currentTarget),
      });
    }

    return added > 0;
  }

  function aliases(name = "") {
    const sourceName = name
      ? resolveKey(name) || normalizeName(name)
      : "";

    if (!sourceName) {
      return [...registry.moduleAliases.keys()].sort();
    }

    return [...registry.moduleAliases.entries()]
      .filter(([, source]) => source === sourceName)
      .map(([aliasName]) => aliasName)
      .sort();
  }

  function aliasEntries() {
    return [...registry.moduleAliases.entries()]
      .sort(([left], [right]) => left.localeCompare(right));
  }

  function getSnapshot() {
    return {
      version: MODULES_VERSION,

      count: count(),
      names: list(),

      aliasCount: registry.moduleAliases.size,
      aliases: aliasEntries(),

      policy: {
        minimalModuleRegistry: true,
        noImports: true,
        noMetadataHeavy: true,
        noDisposeAdvanced: true,
        aliasesSimpleOnly: true,
        aliasesDoNotDuplicateModules: true,
        namesNormalized: true,
        snapshotMinimal: true,
      },
    };
  }

  emit(events, MODULE_EVENTS.ready, {
    version: MODULES_VERSION,
  });

  return {
    version: MODULES_VERSION,
    events: MODULE_EVENTS,

    register,
    set,
    upsert,

    alias,

    get,
    require: requireModule,
    has,

    resolve: normalizeName,
    resolveName: normalizeName,

    getMeta,
    meta: getMeta,
    getModuleSnapshot,

    unregister: remove,
    remove,
    delete: remove,

    dispose,
    disposeModule,

    clear,
    reset,

    list,
    names,
    entries,
    values,
    count,

    aliases,
    aliasEntries,

    forEach,
    map,
    filter,
    find,
    toObject,

    getSnapshot,
    getDebugSnapshot: getSnapshot,
    snapshot: getSnapshot,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  MODULES_VERSION,
  DEFAULT_DISPOSE_METHODS,
  MODULE_EVENTS,
  createModules,
};
