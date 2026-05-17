/* =========================================================
   Onion Support - Core Storage
   Archivo: /src/core/storage.js

   Responsabilidad:
   - Storage mínimo namespaced.
   - Prefijo único: onion:
   - localStorage/sessionStorage si existen.
   - fallback memory.
   - Nunca localStorage.clear().
   - Nunca sessionStorage.clear().
   - Sin legacy masivo.
   - Sin migraciones.
   - Sin repair complejo.
   - Sin imports.
========================================================= */

export const STORAGE_VERSION = "simple";

export const STORAGE_EVENTS = Object.freeze({
  ready: "app:core:storage:ready",
  error: "app:core:storage:error",
  cleared: "app:core:storage:cleared",
});

const PREFIX = "onion:";
const memory = new Map();

function isBrowser() {
  return typeof window !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function key(name = "") {
  const clean = text(name, "");

  if (!clean) return PREFIX.replace(/:$/g, "");
  if (clean.startsWith(PREFIX)) return clean;

  return `${PREFIX}${clean.replace(/^:+/g, "")}`;
}

function rawKey(name = "") {
  return String(name || "").replace(/^onion:/, "");
}

function local() {
  try {
    return isBrowser() ? window.localStorage : null;
  } catch {
    return null;
  }
}

function session() {
  try {
    return isBrowser() ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function parse(raw, fallback = null) {
  if (raw === null || raw === undefined || raw === "") return fallback;

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function stringify(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
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

function storageFor(options = {}) {
  if (options.memory === true || options.kind === "memory") return null;
  if (options.session === true || options.kind === "session") return session();

  return local();
}

function readRaw(storage, finalKey) {
  try {
    return storage?.getItem?.(finalKey);
  } catch {
    return null;
  }
}

function writeRaw(storage, finalKey, raw) {
  try {
    storage?.setItem?.(finalKey, raw);
    return true;
  } catch {
    return false;
  }
}

function removeRaw(storage, finalKey) {
  try {
    storage?.removeItem?.(finalKey);
    return true;
  } catch {
    return false;
  }
}

function storageKeys(storage) {
  const output = [];

  try {
    for (let index = 0; index < storage.length; index += 1) {
      const current = storage.key(index);
      if (current) output.push(current);
    }
  } catch {
    // noop
  }

  return output;
}

/* =========================================================
   LEGACY COMPAT
========================================================= */

export function removeLegacySessionKeys() {
  return 0;
}

export function resetStorageAvailabilityCache() {
  return true;
}

/* =========================================================
   FACTORY
========================================================= */

export function createStorage({ events = null } = {}) {
  function getRaw(name = "", fallback = null, options = {}) {
    const finalKey = key(name);

    if (memory.has(finalKey)) {
      return memory.get(finalKey);
    }

    if (options.memory === true || options.kind === "memory") {
      return fallback;
    }

    const primary = storageFor(options);
    const primaryRaw = readRaw(primary, finalKey);

    if (primaryRaw !== null && primaryRaw !== undefined) {
      memory.set(finalKey, primaryRaw);
      return primaryRaw;
    }

    if (options.session !== true && options.kind !== "session") {
      const sessionRaw = readRaw(session(), finalKey);

      if (sessionRaw !== null && sessionRaw !== undefined) {
        memory.set(finalKey, sessionRaw);
        return sessionRaw;
      }
    }

    return fallback;
  }

  function get(name = "", fallback = null, options = {}) {
    return parse(getRaw(name, null, options), fallback);
  }

  function getJson(name = "", fallback = null, options = {}) {
    return get(name, fallback, options);
  }

  function setRaw(name = "", value = "", options = {}) {
    const finalKey = key(name);

    if (value === null || value === undefined) {
      return remove(name, options);
    }

    const raw = String(value);

    memory.set(finalKey, raw);

    if (options.memory === true || options.kind === "memory") {
      return true;
    }

    const target = storageFor(options);
    const ok = target ? writeRaw(target, finalKey, raw) : true;

    if (!ok) {
      emit(events, STORAGE_EVENTS.error, {
        operation: "setRaw",
        key: rawKey(finalKey),
      });
    }

    return true;
  }

  function set(name = "", value = null, options = {}) {
    const raw = stringify(value);

    if (raw === null) {
      return remove(name, options);
    }

    return setRaw(name, raw, options);
  }

  function setJson(name = "", value = null, options = {}) {
    return set(name, value, options);
  }

  function remove(name = "", options = {}) {
    const finalKey = key(name);

    memory.delete(finalKey);

    if (options.all === true) {
      removeRaw(local(), finalKey);
      removeRaw(session(), finalKey);
      return true;
    }

    const target = storageFor(options);

    if (target) {
      removeRaw(target, finalKey);
    } else {
      removeRaw(local(), finalKey);
      removeRaw(session(), finalKey);
    }

    return true;
  }

  function has(name = "", options = {}) {
    const finalKey = key(name);

    if (memory.has(finalKey)) return true;
    if (readRaw(storageFor(options), finalKey) !== null) return true;

    return false;
  }

  function keys(options = {}) {
    const wantedPrefix = options.prefix ? key(options.prefix) : PREFIX;
    const output = new Set();

    for (const current of memory.keys()) {
      if (current.startsWith(wantedPrefix)) output.add(current);
    }

    for (const current of storageKeys(local())) {
      if (current.startsWith(wantedPrefix)) output.add(current);
    }

    for (const current of storageKeys(session())) {
      if (current.startsWith(wantedPrefix)) output.add(current);
    }

    return [...output];
  }

  function entries(options = {}) {
    return keys(options).map((current) => ({
      key: current,
      value: getRaw(current, null),
    }));
  }

  function clearNamespace(namespace = "", options = {}) {
    const wantedPrefix = namespace ? key(namespace) : PREFIX;
    let removed = 0;

    for (const current of keys({ prefix: wantedPrefix })) {
      memory.delete(current);

      if (options.all === true || options.session !== true) {
        if (removeRaw(local(), current)) removed += 1;
      }

      if (options.all === true || options.local !== true) {
        if (removeRaw(session(), current)) removed += 1;
      }
    }

    emit(events, STORAGE_EVENTS.cleared, {
      prefix: wantedPrefix,
      removed,
    });

    return {
      ok: true,
      removed,
      prefix: wantedPrefix,
    };
  }

  function clearAll(options = {}) {
    return clearNamespace("", {
      ...options,
      all: true,
    });
  }

  function repairCorrupted() {
    return {
      ok: true,
      repaired: 0,
    };
  }

  function migrateLegacyKey() {
    return false;
  }

  function getSnapshot() {
    return {
      version: STORAGE_VERSION,
      prefix: PREFIX,
      memorySize: memory.size,
      keys: keys().map(rawKey),
    };
  }

  emit(events, STORAGE_EVENTS.ready, {
    version: STORAGE_VERSION,
    prefix: PREFIX,
  });

  return {
    version: STORAGE_VERSION,

    prefix: PREFIX,
    prefixRaw: "onion",

    key,
    getNamespacedKey: key,
    normalizeKey: key,

    get,
    getRaw,
    getJson,

    set,
    setRaw,
    setJson,

    remove,
    delete: remove,
    del: remove,

    has,
    keys,
    entries,

    clearAll,
    clear: clearAll,
    clearNamespace,

    repairCorrupted,
    migrateLegacyKey,

    removeLegacySessionKeys,
    resetStorageAvailabilityCache,

    getSnapshot,
    getDebugSnapshot: getSnapshot,
    snapshot: getSnapshot,
  };
}

export default {
  STORAGE_VERSION,
  STORAGE_EVENTS,
  createStorage,
  removeLegacySessionKeys,
  resetStorageAvailabilityCache,
};
