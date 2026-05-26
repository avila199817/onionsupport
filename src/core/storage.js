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
   - Bloqueo defensivo de claves sensibles.
   - Sin legacy masivo.
   - Sin migraciones reales.
   - Sin repair complejo.
   - Sin imports.
   - Sin Auth.
   - Sin Router.
   - Sin Store.
   - Sin fetch.
========================================================= */

export const STORAGE_VERSION = "core.storage.v2";

export const STORAGE_EVENTS = Object.freeze({
  ready: "app:core:storage:ready",
  error: "app:core:storage:error",
  blocked: "app:core:storage:blocked",
  cleared: "app:core:storage:cleared",
});

const PREFIX = "onion:";
const PREFIX_RAW = "onion";

const memory = new Map();

const SENSITIVE_KEY_PARTS = Object.freeze([
  "token",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "id_token",
  "idtoken",
  "jwt",

  "authorization",
  "authheader",
  "cookie",
  "session_secret",

  "password",
  "passwordhash",
  "password_hash",
  "secret",
  "secrets",

  "otp",
  "totp",
  "mfa",
  "twofa_secret",
  "twofasecret",
  "backupcodes",
  "backup_codes",

  "apikey",
  "api_key",
  "sas",
  "connectionstring",
  "connection_string",
]);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function normalizeKeyText(value = "") {
  return text(value, "")
    .replace(/^onion:/i, "")
    .replace(/^:+/g, "")
    .trim();
}

function key(name = "") {
  const clean = text(name, "");

  if (!clean) return PREFIX.replace(/:$/g, "");
  if (clean.startsWith(PREFIX)) return clean;

  return `${PREFIX}${clean.replace(/^:+/g, "")}`;
}

function rawKey(name = "") {
  return String(name || "").replace(/^onion:/i, "");
}

function keyIsSensitive(name = "") {
  const clean = normalizeKeyText(name).toLowerCase();

  if (!clean) return false;

  return SENSITIVE_KEY_PARTS.some((part) => {
    return clean === part || clean.includes(part);
  });
}

function safeKeyPayload(finalKey = "") {
  return {
    key: rawKey(finalKey),
  };
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

/* =========================================================
   STORAGE ACCESS
========================================================= */

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

function storageFor(options = {}) {
  if (options.memory === true || options.kind === "memory") return null;
  if (options.session === true || options.kind === "session") return session();
  if (options.local === true || options.kind === "local") return local();

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

  if (!storage) return output;

  try {
    for (let index = 0; index < storage.length; index += 1) {
      const current = storage.key(index);

      if (current) {
        output.push(current);
      }
    }
  } catch {
    // noop
  }

  return output;
}

/* =========================================================
   JSON
========================================================= */

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
  function blocked(finalKey = "", operation = "storage") {
    emit(events, STORAGE_EVENTS.blocked, {
      operation,
      ...safeKeyPayload(finalKey),
    });

    return true;
  }

  function getRaw(name = "", fallback = null, options = {}) {
    const finalKey = key(name);

    if (keyIsSensitive(finalKey)) {
      blocked(finalKey, "getRaw");
      return fallback;
    }

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

    if (keyIsSensitive(finalKey)) {
      blocked(finalKey, "setRaw");
      return false;
    }

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
        ...safeKeyPayload(finalKey),
      });
    }

    /*
      Devuelve true porque memory queda como fallback operativo aunque
      local/sessionStorage fallen por privacidad, cuota o bloqueo del navegador.
    */
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

    if (keyIsSensitive(finalKey)) {
      blocked(finalKey, "has");
      return false;
    }

    if (memory.has(finalKey)) return true;

    const primary = storageFor(options);

    if (readRaw(primary, finalKey) !== null) return true;

    if (options.session !== true && options.kind !== "session") {
      return readRaw(session(), finalKey) !== null;
    }

    return false;
  }

  function keys(options = {}) {
    const wantedPrefix = options.prefix ? key(options.prefix) : PREFIX;
    const output = new Set();

    for (const current of memory.keys()) {
      if (current.startsWith(wantedPrefix) && !keyIsSensitive(current)) {
        output.add(current);
      }
    }

    for (const current of storageKeys(local())) {
      if (current.startsWith(wantedPrefix) && !keyIsSensitive(current)) {
        output.add(current);
      }
    }

    for (const current of storageKeys(session())) {
      if (current.startsWith(wantedPrefix) && !keyIsSensitive(current)) {
        output.add(current);
      }
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
      prefixRaw: PREFIX_RAW,

      browser: isBrowser(),

      memorySize: memory.size,
      keys: keys().map(rawKey),

      policy: {
        namespacedOnly: true,
        prefix: PREFIX,

        memoryFallback: true,
        localStorageWhenAvailable: true,
        sessionStorageWhenRequested: true,

        neverCallsLocalStorageClear: true,
        neverCallsSessionStorageClear: true,

        blocksSensitiveKeys: true,
        noTokens: true,
        noSecrets: true,
        noAuthRuntime: true,

        noLegacyMigration: true,
        noRepairComplexity: true,

        snapshotRedacted: true,
      },
    };
  }

  emit(events, STORAGE_EVENTS.ready, {
    version: STORAGE_VERSION,
    prefix: PREFIX,
  });

  return {
    version: STORAGE_VERSION,

    prefix: PREFIX,
    prefixRaw: PREFIX_RAW,

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
