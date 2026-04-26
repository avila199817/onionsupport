/* =========================================================
   Onion SPA - Core Storage
   Archivo: src/core/storage.js

   RESPONSABILIDADES:
   - encapsular acceso localStorage namespaced
   - leer / escribir valores serializados y raw
   - borrar claves legacy de sesión
   - limpiar namespace completo app
   - fallback en memoria si localStorage no está disponible
   - proteger contra valores corruptos
   - exponer snapshot de diagnóstico

   HARDENING EXTREMO:
   - guard browser robusto
   - JSON seguro
   - fallback silencioso ante quota/private mode
   - protección contra "undefined"/"null" corruptos
   - namespace estable
   - aliases remove/delete/del
   - limpieza legacy ampliada
   - cero throws accidentales
========================================================= */

import { config } from "./config.js";

import {
  isBrowser,
  buildStorageKey,
  safeParse,
  redactTokenInText,
} from "./helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const STORAGE_VERSION =
  "10.0.0";

const CORRUPTED_RAW_VALUES =
  Object.freeze([
    "undefined",
    "null",
    "[object Object]",
  ]);

const SENSITIVE_KEY_RE =
  /(token|authorization|password|secret|session|otp|code)/i;

/* =========================================================
   MODULE MEMORY FALLBACK
========================================================= */

const memoryStorage =
  new Map();

let storageAvailableCache =
  null;

let lastStorageError =
  null;

/* =========================================================
   HELPERS
========================================================= */

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

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeWarn(utils, ...args) {
  try {
    utils?.warn?.(
      "[Storage]",
      ...args
    );
  } catch {}

  try {
    if (config?.debug) {
      console.warn(
        "[Storage]",
        ...args
      );
    }
  } catch {}
}

function safeLog(utils, ...args) {
  try {
    utils?.log?.(
      "[Storage]",
      ...args
    );
  } catch {}
}

function safeString(value) {
  return String(value ?? "");
}

function safeJsonStringify(value, fallback = "") {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function isCorruptedRawValue(raw) {
  const value =
    String(raw ?? "").trim();

  return CORRUPTED_RAW_VALUES.includes(value);
}

function getPrefix() {
  return `${safeText(config?.storagePrefix, "onion")}:`;
}

function normalizeStorageKey(key = "") {
  return safeText(key, "");
}

function isNamespacedKey(key = "") {
  const cleanKey =
    safeText(key, "");

  return cleanKey.startsWith(
    getPrefix()
  );
}

function getNamespacedKey(key = "") {
  const cleanKey =
    normalizeStorageKey(key);

  if (!cleanKey) {
    return getPrefix().replace(/:$/g, "");
  }

  if (isNamespacedKey(cleanKey)) {
    return cleanKey;
  }

  try {
    return buildStorageKey(cleanKey);
  } catch {
    return `${getPrefix()}${cleanKey}`;
  }
}

function getStorage() {
  if (!isBrowser()) {
    return null;
  }

  try {
    return window.localStorage || null;
  } catch (error) {
    lastStorageError =
      error;

    return null;
  }
}

function testStorageAvailability(storage) {
  if (!storage) {
    return false;
  }

  if (storageAvailableCache !== null) {
    return storageAvailableCache;
  }

  const testKey =
    `${getPrefix()}__storage_test__`;

  try {
    storage.setItem(
      testKey,
      "1"
    );

    storage.removeItem(
      testKey
    );

    storageAvailableCache =
      true;

    return true;
  } catch (error) {
    lastStorageError =
      error;

    storageAvailableCache =
      false;

    return false;
  }
}

function getUsableStorage() {
  const storage =
    getStorage();

  if (!testStorageAvailability(storage)) {
    return null;
  }

  return storage;
}

function shouldRemoveOnSet(value) {
  return (
    value === undefined ||
    value === null
  );
}

function sanitizeSnapshotValue(key = "", value = "") {
  if (SENSITIVE_KEY_RE.test(key)) {
    return "***";
  }

  try {
    return redactTokenInText(value);
  } catch {
    return value;
  }
}

function readRawFromMemory(namespacedKey, fallback = null) {
  if (!memoryStorage.has(namespacedKey)) {
    return fallback;
  }

  const raw =
    memoryStorage.get(namespacedKey);

  if (
    raw === null ||
    raw === undefined ||
    isCorruptedRawValue(raw)
  ) {
    return fallback;
  }

  return raw;
}

function writeRawToMemory(namespacedKey, raw) {
  if (!namespacedKey) {
    return false;
  }

  if (
    raw === null ||
    raw === undefined
  ) {
    memoryStorage.delete(namespacedKey);
    return true;
  }

  memoryStorage.set(
    namespacedKey,
    String(raw)
  );

  return true;
}

function removeFromMemory(namespacedKey) {
  memoryStorage.delete(
    namespacedKey
  );

  return true;
}

function getLegacyKeys() {
  const fromConfig =
    Object.values(
      config?.legacyStorageKeys || {}
    ).filter(Boolean);

  const extra =
    [
      "onion_token",
      "onion_refresh_token",
      "onion_temp_token",
      "onion_user",
      "onion_user_id",
      "onion_user_slug",
      "onion_user_name",
      "onion_role",
      "onion_session_id",
      "onion_session_user_id",
      "onion_theme",
      "onion_lang",
      "token",
      "user",
      "refreshToken",
      "tempToken",
      "sessionId",
      "sessionUserId",
    ];

  return Array.from(
    new Set([
      ...fromConfig,
      ...extra,
    ])
  );
}

/* =========================================================
   LEGACY CLEANUP
========================================================= */

export function removeLegacySessionKeys(utils) {
  const storage =
    getStorage();

  const keys =
    getLegacyKeys();

  let removed =
    0;

  try {
    if (storage) {
      for (const key of keys) {
        if (!key) {
          continue;
        }

        try {
          storage.removeItem(key);
          removed += 1;
        } catch {}
      }
    }

    for (const key of keys) {
      memoryStorage.delete(key);
    }

    return removed;
  } catch (error) {
    lastStorageError =
      error;

    safeWarn(
      utils,
      "No se pudieron borrar claves legacy.",
      error
    );

    return removed;
  }
}

/* =========================================================
   STORAGE FACTORY
========================================================= */

export function createStorage(utils) {
  const stats = {
    get:
      0,

    set:
      0,

    remove:
      0,

    errors:
      0,

    memoryFallbackWrites:
      0,

    memoryFallbackReads:
      0,

    lastOperation:
      "",

    lastKey:
      "",

    lastAt:
      "",
  };

  function touch(operation = "", key = "") {
    stats.lastOperation =
      operation;

    stats.lastKey =
      safeText(key, "");

    stats.lastAt =
      safeIsoDate();
  }

  function recordError(error, operation = "", key = "") {
    stats.errors += 1;

    lastStorageError =
      error;

    touch(
      operation,
      key
    );

    safeWarn(
      utils,
      `Storage error en ${operation}: ${key}`,
      error
    );
  }

  function key(name = "") {
    return getNamespacedKey(name);
  }

  function getRaw(name, fallback = null) {
    const namespacedKey =
      key(name);

    stats.get += 1;
    touch("getRaw", namespacedKey);

    const storage =
      getUsableStorage();

    if (storage) {
      try {
        const raw =
          storage.getItem(namespacedKey);

        if (
          raw === null ||
          isCorruptedRawValue(raw)
        ) {
          return fallback;
        }

        return raw;
      } catch (error) {
        recordError(
          error,
          "getRaw",
          namespacedKey
        );
      }
    }

    stats.memoryFallbackReads += 1;

    return readRawFromMemory(
      namespacedKey,
      fallback
    );
  }

  function get(name, fallback = null) {
    const raw =
      getRaw(
        name,
        null
      );

    if (
      raw === null ||
      raw === undefined ||
      isCorruptedRawValue(raw)
    ) {
      return fallback;
    }

    return safeParse(
      raw,
      fallback
    );
  }

  function setRaw(name, value) {
    const namespacedKey =
      key(name);

    stats.set += 1;
    touch("setRaw", namespacedKey);

    if (shouldRemoveOnSet(value)) {
      return remove(name);
    }

    const raw =
      safeString(value);

    if (isCorruptedRawValue(raw)) {
      return remove(name);
    }

    const storage =
      getUsableStorage();

    if (storage) {
      try {
        storage.setItem(
          namespacedKey,
          raw
        );

        writeRawToMemory(
          namespacedKey,
          raw
        );

        return true;
      } catch (error) {
        recordError(
          error,
          "setRaw",
          namespacedKey
        );
      }
    }

    stats.memoryFallbackWrites += 1;

    return writeRawToMemory(
      namespacedKey,
      raw
    );
  }

  function set(name, value) {
    const namespacedKey =
      key(name);

    stats.set += 1;
    touch("set", namespacedKey);

    if (shouldRemoveOnSet(value)) {
      return remove(name);
    }

    const raw =
      safeJsonStringify(
        value,
        ""
      );

    if (!raw || isCorruptedRawValue(raw)) {
      return false;
    }

    const storage =
      getUsableStorage();

    if (storage) {
      try {
        storage.setItem(
          namespacedKey,
          raw
        );

        writeRawToMemory(
          namespacedKey,
          raw
        );

        return true;
      } catch (error) {
        recordError(
          error,
          "set",
          namespacedKey
        );
      }
    }

    stats.memoryFallbackWrites += 1;

    return writeRawToMemory(
      namespacedKey,
      raw
    );
  }

  function remove(name) {
    const namespacedKey =
      key(name);

    stats.remove += 1;
    touch("remove", namespacedKey);

    const storage =
      getStorage();

    try {
      storage?.removeItem?.(
        namespacedKey
      );
    } catch (error) {
      recordError(
        error,
        "remove",
        namespacedKey
      );
    }

    removeFromMemory(
      namespacedKey
    );

    return true;
  }

  function has(name) {
    const namespacedKey =
      key(name);

    touch("has", namespacedKey);

    const storage =
      getUsableStorage();

    if (storage) {
      try {
        const raw =
          storage.getItem(namespacedKey);

        return (
          raw !== null &&
          !isCorruptedRawValue(raw)
        );
      } catch (error) {
        recordError(
          error,
          "has",
          namespacedKey
        );
      }
    }

    return memoryStorage.has(
      namespacedKey
    );
  }

  function keys(options = {}) {
    const opts =
      isObject(options)
        ? options
        : {};

    const prefix =
      opts.prefix
        ? getNamespacedKey(opts.prefix)
        : getPrefix();

    const includeValues =
      Boolean(opts.includeValues);

    const output =
      [];

    const storage =
      getStorage();

    try {
      if (storage) {
        for (
          let i = 0;
          i < storage.length;
          i += 1
        ) {
          const currentKey =
            storage.key(i);

          if (
            currentKey &&
            currentKey.startsWith(prefix)
          ) {
            if (includeValues) {
              output.push({
                key:
                  currentKey,

                value:
                  sanitizeSnapshotValue(
                    currentKey,
                    storage.getItem(currentKey)
                  ),
              });
            } else {
              output.push(currentKey);
            }
          }
        }
      }
    } catch (error) {
      recordError(
        error,
        "keys",
        prefix
      );
    }

    for (const currentKey of memoryStorage.keys()) {
      if (
        currentKey.startsWith(prefix) &&
        !output.some((item) =>
          typeof item === "string"
            ? item === currentKey
            : item.key === currentKey
        )
      ) {
        if (includeValues) {
          output.push({
            key:
              currentKey,

            value:
              sanitizeSnapshotValue(
                currentKey,
                memoryStorage.get(currentKey)
              ),
          });
        } else {
          output.push(currentKey);
        }
      }
    }

    return output;
  }

  function clearAll() {
    const storage =
      getStorage();

    const prefix =
      getPrefix();

    let removed =
      0;

    try {
      if (storage) {
        const keysToRemove =
          [];

        for (
          let i = 0;
          i < storage.length;
          i += 1
        ) {
          const currentKey =
            storage.key(i);

          if (
            currentKey &&
            currentKey.startsWith(prefix)
          ) {
            keysToRemove.push(
              currentKey
            );
          }
        }

        for (const currentKey of keysToRemove) {
          storage.removeItem(
            currentKey
          );

          removed += 1;
        }
      }
    } catch (error) {
      recordError(
        error,
        "clearAll",
        prefix
      );
    }

    for (const currentKey of Array.from(memoryStorage.keys())) {
      if (currentKey.startsWith(prefix)) {
        memoryStorage.delete(currentKey);
        removed += 1;
      }
    }

    removeLegacySessionKeys(
      utils
    );

    touch(
      "clearAll",
      prefix
    );

    return true;
  }

  function clearNamespace(namespace = "") {
    const cleanNamespace =
      safeText(namespace, "");

    if (!cleanNamespace) {
      return clearAll();
    }

    const prefix =
      getNamespacedKey(cleanNamespace);

    const storage =
      getStorage();

    try {
      if (storage) {
        const keysToRemove =
          [];

        for (
          let i = 0;
          i < storage.length;
          i += 1
        ) {
          const currentKey =
            storage.key(i);

          if (
            currentKey &&
            currentKey.startsWith(prefix)
          ) {
            keysToRemove.push(
              currentKey
            );
          }
        }

        for (const currentKey of keysToRemove) {
          storage.removeItem(
            currentKey
          );
        }
      }
    } catch (error) {
      recordError(
        error,
        "clearNamespace",
        prefix
      );
    }

    for (const currentKey of Array.from(memoryStorage.keys())) {
      if (currentKey.startsWith(prefix)) {
        memoryStorage.delete(currentKey);
      }
    }

    touch(
      "clearNamespace",
      prefix
    );

    return true;
  }

  function getSnapshot(options = {}) {
    const opts =
      isObject(options)
        ? options
        : {};

    const includeKeys =
      opts.includeKeys !== false;

    const includeValues =
      opts.includeValues === true;

    const storage =
      getStorage();

    return {
      version:
        STORAGE_VERSION,

      browser:
        isBrowser(),

      localStorageAvailable:
        testStorageAvailability(storage),

      prefix:
        getPrefix(),

      memoryFallbackSize:
        memoryStorage.size,

      keys:
        includeKeys
          ? keys({
              includeValues,
            })
          : [],

      stats: {
        ...stats,
      },

      lastError:
        lastStorageError
          ? {
              name:
                lastStorageError.name || "StorageError",

              message:
                lastStorageError.message || String(lastStorageError),
            }
          : null,

      at:
        safeIsoDate(),
    };
  }

  safeLog(
    utils,
    "Storage ready.",
    {
      prefix:
        getPrefix(),
    }
  );

  return {
    key,
    getNamespacedKey:
      key,

    get,
    getRaw,

    set,
    setRaw,

    remove,
    delete:
      remove,
    del:
      remove,

    has,

    keys,

    clearAll,
    clear:
      clearAll,

    clearNamespace,

    removeLegacySessionKeys() {
      return removeLegacySessionKeys(
        utils
      );
    },

    getSnapshot,
    getDebugSnapshot:
      getSnapshot,
  };
}

export default {
  createStorage,
  removeLegacySessionKeys,
};
