/* =========================================================
   Onion Support - Core Modules
   Archivo: /src/core/modules.js

   Responsabilidad:
   - Registry mínimo de módulos.
   - register / get / remove / list.
   - Compat básica.
   - Sin imports.
   - Sin aliases complejos.
   - Sin metadata pesada.
   - Sin snapshots grandes.
   - Sin dispose avanzado.
   - Sin lógica rara.
========================================================= */

export const MODULES_VERSION = "simple";

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

function isObject(value) {
  return Boolean(value && typeof value === "object");
}

function isFunction(value) {
  return typeof value === "function";
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

function normalizeName(name = "") {
  return text(name, "");
}

function ensureMap(value) {
  return value instanceof Map ? value : new Map();
}

function callDispose(instance = null) {
  if (!instance) return false;

  for (const method of DEFAULT_DISPOSE_METHODS) {
    try {
      if (isFunction(instance[method])) {
        instance[method]();
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

export function createModules(input = {}) {
  const registry = isObject(input.registry) ? input.registry : {};
  const events = input.events || input.bus || null;

  registry.modules = ensureMap(registry.modules);

  function register(name = "", instance = null, options = {}) {
    const key = normalizeName(name);

    if (!key || !instance) return false;

    const exists = registry.modules.has(key);

    if (exists && options.overwrite !== true && options.replace !== true) {
      return registry.modules.get(key);
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

  function has(name = "") {
    return registry.modules.has(normalizeName(name));
  }

  function remove(name = "", options = {}) {
    const key = normalizeName(name);

    if (!key || !registry.modules.has(key)) return false;

    const instance = registry.modules.get(key);

    if (options.dispose === true) {
      callDispose(instance);
    }

    registry.modules.delete(key);

    emit(events, MODULE_EVENTS.removed, {
      name: key,
    });

    return true;
  }

  function clear(options = {}) {
    const names = list();

    if (options.dispose === true) {
      for (const name of names) {
        callDispose(get(name));
      }
    }

    registry.modules.clear();

    emit(events, MODULE_EVENTS.cleared, {
      removed: names.length,
    });

    return names.length;
  }

  function dispose(name = "") {
    const instance = get(name);
    return callDispose(instance);
  }

  function list() {
    return [...registry.modules.keys()];
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

    return {
      name: key,
      registered: true,
    };
  }

  function getModuleSnapshot(name = "") {
    const key = normalizeName(name);
    const instance = get(key);

    if (!instance) return null;

    return {
      name: key,
      type: typeof instance,
      disposable: DEFAULT_DISPOSE_METHODS.some((method) =>
        isFunction(instance?.[method])
      ),
    };
  }

  function getSnapshot() {
    return {
      version: MODULES_VERSION,
      count: count(),
      names: list(),
    };
  }

  function reset(options = {}) {
    const removed = clear(options);

    return {
      removed,
      snapshot: getSnapshot(),
    };
  }

  function alias(name = "", aliases = []) {
    const instance = get(name);

    if (!instance) return false;

    for (const aliasName of Array.isArray(aliases) ? aliases : [aliases]) {
      const key = normalizeName(aliasName);

      if (key) {
        register(key, instance);
      }
    }

    return true;
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
    require: get,
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
    disposeModule: dispose,

    clear,
    reset,

    list,
    names: list,
    entries,
    values,
    count,

    aliases: () => [],
    aliasEntries: () => [],

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

export default {
  MODULES_VERSION,
  DEFAULT_DISPOSE_METHODS,
  MODULE_EVENTS,
  createModules,
};
