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
   - protección contra "undefined"/"null"/"[object Object]" corruptos
   - namespace estable
   - aliases remove/delete/del
   - limpieza legacy ampliada pero segura
   - no borra claves namespaced actuales al limpiar legacy
   - snapshots con redacción de tokens/secrets
   - cero throws accidentales
========================================================= */

import { config } from "./config.js";

import {
  isBrowser,
  buildStorageKey,
  safeParse,
  safeStringify,
  redactTokenInText,
} from "./helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const STORAGE_VERSION =
  "10.1.0";

const CORRUPTED_RAW_VALUES =
  Object.freeze([
    "undefined",
    "null",
    "[object Object]",
  ]);

const SENSITIVE_KEY_RE =
  /(token|authorization|password|secret|session|otp|code|jwt|bearer|credential)/i;

const STORAGE_TEST_KEY =
  "__storage_test__";

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

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
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
    if (typeof safeStringify === "function") {
      return safeStringify(
        value,
        fallback
      );
    }
  } catch {}

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
  const prefix =
    safeText(
      config?.storagePrefix,
      "onion"
    )
      .replace(/:+$/g, "");

  return `${prefix || "onion"}:`;
}

function normalizeStorageKey(key = "") {
  return safeText(key, "")
    .replace(/^:+/g, "")
    .trim();
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
    `${getPrefix()}${STORAGE_TEST_KEY}`;

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

function resetStorageAvailabilityCache() {
  storageAvailableCache =
    null;

  return true;
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

function getRawLocalStorageKey(key = "") {
  return safeText(key, "");
}

function isCurrentNamespacedKey(key = "") {
  return isNamespacedKey(
    safeText(key, "")
  );
}

function getLegacyKeys() {
  const fromConfig =
    Object.values(
      config?.legacyStorageKeys || {}
    )
      .map((item) =>
        safeText(item, "")
      )
      .filter(Boolean);

  /*
    Importante:
    Estas claves son legacy NO namespaced.
    No se añaden onion:token / onion:user porque esas son claves actuales.
  */
  const extra =
    [
      "onion_token",
      "onion_access_token",
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
      "onion_post_login_target",

      "token",
      "accessToken",
      "refreshToken",
      "tempToken",
      "user",
      "role",
      "sessionId",
      "sessionUserId",
      "postLoginTarget",
    ];

  return Array.from(
    new Set([
      ...fromConfig,
      ...extra,
    ])
  ).filter((key) =>
    key &&
    !isCurrentNamespacedKey(key)
  );
}

function getStorageLength(storage) {
  try {
    return safeNumber(
      storage?.length,
      0
    );
  } catch {
    return 0;
  }
}

function collectStorageKeys(storage, predicate) {
  const output =
    [];

  if (!storage) {
    return output;
  }

  const length =
    getStorageLength(storage);

  try {
    for (
      let i = 0;
      i < length;
      i += 1
    ) {
      const currentKey =
        storage.key(i);

      if (
        currentKey &&
        predicate(currentKey)
      ) {
        output.push(currentKey);
      }
    }
  } catch {}

  return output;
}

function parseStoredRaw(raw, fallback = null) {
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
      for (const legacyKey of keys) {
        const key =
          getRawLocalStorageKey(legacyKey);

        if (!key) {
          continue;
        }

        /*
          No tocar las claves actuales namespaced.
        */
        if (isCurrentNamespacedKey(key)) {
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

    has:
      0,

    keys:
      0,

    clear:
      0,

    errors:
      0,

    memoryFallbackWrites:
      0,

    memoryFallbackReads:
      0,

    localStorageWrites:
      0,

    localStorageReads:
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

        stats.localStorageReads += 1;

        if (
          raw === null ||
          raw === undefined ||
          isCorruptedRawValue(raw)
        ) {
          return fallback;
        }

        /*
          Mantener memoria sincronizada con localStorage válido.
        */
        writeRawToMemory(
          namespacedKey,
          raw
        );

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

    return parseStoredRaw(
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

    if (
      !raw ||
      isCorruptedRawValue(raw)
    ) {
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

        stats.localStorageWrites += 1;

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

    if (
      !raw ||
      isCorruptedRawValue(raw)
    ) {
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

        stats.localStorageWrites += 1;

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

    stats.has += 1;
    touch("has", namespacedKey);

    const storage =
      getUsableStorage();

    if (storage) {
      try {
        const raw =
          storage.getItem(namespacedKey);

        stats.localStorageReads += 1;

        return (
          raw !== null &&
          raw !== undefined &&
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

    stats.keys += 1;

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
        const storageKeys =
          collectStorageKeys(
            storage,
            (currentKey) =>
              currentKey.startsWith(prefix)
          );

        for (const currentKey of storageKeys) {
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

    touch(
      "keys",
      prefix
    );

    return output;
  }

  function clearAll(options = {}) {
    const opts =
      isObject(options)
        ? options
        : {};

    const includeLegacy =
      opts.includeLegacy !== false;

    const storage =
      getStorage();

    const prefix =
      getPrefix();

    let removed =
      0;

    stats.clear += 1;

    try {
      if (storage) {
        const keysToRemove =
          collectStorageKeys(
            storage,
            (currentKey) =>
              currentKey.startsWith(prefix)
          );

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

    if (includeLegacy) {
      removed += removeLegacySessionKeys(
        utils
      );
    }

    touch(
      "clearAll",
      prefix
    );

    return {
      ok:
        true,

      removed,

      prefix,

      includeLegacy,
    };
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

    let removed =
      0;

    stats.clear += 1;

    try {
      if (storage) {
        const keysToRemove =
          collectStorageKeys(
            storage,
            (currentKey) =>
              currentKey.startsWith(prefix)
          );

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
        "clearNamespace",
        prefix
      );
    }

    for (const currentKey of Array.from(memoryStorage.keys())) {
      if (currentKey.startsWith(prefix)) {
        memoryStorage.delete(currentKey);
        removed += 1;
      }
    }

    touch(
      "clearNamespace",
      prefix
    );

    return {
      ok:
        true,

      removed,

      prefix,
    };
  }

  function repairCorrupted(options = {}) {
    const opts =
      isObject(options)
        ? options
        : {};

    const prefix =
      opts.prefix
        ? getNamespacedKey(opts.prefix)
        : getPrefix();

    const storage =
      getStorage();

    let repaired =
      0;

    try {
      if (storage) {
        const keysToCheck =
          collectStorageKeys(
            storage,
            (currentKey) =>
              currentKey.startsWith(prefix)
          );

        for (const currentKey of keysToCheck) {
          const raw =
            storage.getItem(currentKey);

          if (isCorruptedRawValue(raw)) {
            storage.removeItem(currentKey);
            repaired += 1;
          }
        }
      }
    } catch (error) {
      recordError(
        error,
        "repairCorrupted",
        prefix
      );
    }

    for (const [currentKey, raw] of Array.from(memoryStorage.entries())) {
      if (
        currentKey.startsWith(prefix) &&
        isCorruptedRawValue(raw)
      ) {
        memoryStorage.delete(currentKey);
        repaired += 1;
      }
    }

    touch(
      "repairCorrupted",
      prefix
    );

    return {
      ok:
        true,

      repaired,

      prefix,
    };
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

    repairCorrupted,

    removeLegacySessionKeys() {
      return removeLegacySessionKeys(
        utils
      );
    },

    resetStorageAvailabilityCache,

    getSnapshot,
    getDebugSnapshot:
      getSnapshot,
  };
}

export default {
  createStorage,
  removeLegacySessionKeys,
};
