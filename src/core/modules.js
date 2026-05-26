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
   - Sin lógica rara.
========================================================= */

export const MODULES_VERSION = "core.modules.v2";

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

function normalizeName(name = "") {
  return text(name, "");
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
    try {
      if (isFunction(instance?.[method])) {
        instance[method]();
        return true;
      }
    } catch {
      return false;
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

  function register(name = "", instance = null, options = {}) {
    const key = normalizeName(name);

    if (!key || !hasValue(instance)) return false;

    const exists = registry.modules.has(key);
    const previous = exists ? registry.modules.get(key) : null;

    if (exists && options.overwrite !== true && options.replace !== true) {
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
      overwritten: exists,
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
    return registry.modules.get(normalizeName(name)) || null;
  }

  function requireModule(name = "") {
    return get(name);
  }

  function has(name = "") {
    const key = normalizeName(name);
    return Boolean(key && registry.modules.has(key));
  }

  function remove(name = "", options = {}) {
    const key = normalizeName(name);

    if (!key || !registry.modules.has(key)) return false;

    const instance = registry.modules.get(key);
    let disposed = false;

    if (options.dispose === true) {
      disposed = callDispose(instance);
    }

    registry.modules.delete(key);

    emit(events, MODULE_EVENTS.removed, {
      name: key,
      disposed,
    });

    return true;
  }

  function clear(options = {}) {
    const names = list();
    let disposed = 0;

    if (options.dispose === true) {
      for (const name of names) {
        if (callDispose(get(name))) {
          disposed += 1;
        }
      }
    }

    registry.modules.clear();

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
    const instance = get(name);
    return callDispose(instance);
  }

  function disposeModule(name = "") {
    return dispose(name);
  }

  function list() {
    return [...registry.modules.keys()];
  }

  function names() {
    return list();
  }

  function entries() {
    return [...registry.modules.entries()];
  }

  function values() {
    return [...registry.modules.values()];
  }

  function count() {
    return registry.modules.size;
  }

  function forEach(callback) {
    if (!isFunction(callback)) return false;

    for (const [name, instance] of registry.modules.entries()) {
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

    for (const [name, instance] of registry.modules.entries()) {
      if (callback(instance, name)) return instance;
    }

    return null;
  }

  function toObject() {
    return Object.fromEntries(registry.modules.entries());
  }

  function getMeta(name = "") {
    const key = normalizeName(name);

    if (!has(key)) return null;

    const instance = get(key);

    return {
      name: key,
      registered: true,
      type: typeof instance,
      disposable: isDisposable(instance),
    };
  }

  function getModuleSnapshot(name = "") {
    const key = normalizeName(name);
    const instance = get(key);

    if (!instance) return null;

    return {
      name: key,
      type: typeof instance,
      disposable: isDisposable(instance),
    };
  }

  function getSnapshot() {
    return {
      version: MODULES_VERSION,
      count: count(),
      names: list(),

      policy: {
        minimalModuleRegistry: true,
        noImports: true,
        noMetadataHeavy: true,
        noDisposeAdvanced: true,
        aliasesSimpleOnly: true,
        snapshotMinimal: true,
      },
    };
  }

  function alias(name = "", aliases = []) {
    const sourceName = normalizeName(name);
    const instance = get(sourceName);

    if (!sourceName || !instance) return false;

    const aliasList = Array.isArray(aliases) ? aliases : [aliases];
    let added = 0;

    for (const aliasName of aliasList) {
      const key = normalizeName(aliasName);

      if (!key || key === sourceName) continue;

      const result = register(key, instance);

      if (result) {
        added += 1;
      }
    }

    return added > 0;
  }

  function aliases() {
    return [];
  }

  function aliasEntries() {
    return [];
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
