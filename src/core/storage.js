/* =========================================================
   Onion SPA - Core Storage
   Archivo: src/core/storage.js

   ONION SUPPORT · CORE STORAGE
   NAMESPACED STORAGE · LOCAL/SESSION/MEMORY · SAFE LEGACY CLEANUP · 13/10

   RESPONSABILIDADES:
   - encapsular acceso localStorage/sessionStorage namespaced
   - leer / escribir valores serializados y raw
   - borrar claves legacy de sesión
   - limpiar namespace completo app
   - fallback en memoria si Web Storage no está disponible
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
   - soporte local/session/memory
   - soporte getJson/setJson/getRaw/setRaw
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
  "13.0.1";

const DEFAULT_PREFIX =
  "onion";

const STORAGE_TEST_KEY =
  "__storage_test__";

const DEFAULT_KIND =
  "local";

const VALID_KINDS =
  Object.freeze([
    "local",
    "session",
    "memory",
  ]);

const CORRUPTED_RAW_VALUES =
  Object.freeze([
    "",
    "undefined",
    "null",
    "nan",
    "[object Object]",
    "\"\"",
    "''",
  ]);

const SENSITIVE_KEY_RE =
  /(token|authorization|password|secret|session|otp|code|jwt|bearer|credential|cookie|csrf|xsrf|mfa|2fa)/i;

const SESSIONISH_KEY_RE =
  /(session|token|auth|user|role|login|otp|mfa|2fa|post_login|postLogin)/i;

const LEGACY_EXTRA_KEYS =
  Object.freeze([
    "onion_token",
    "onion_access_token",
    "onion_refresh_token",
    "onion_temp_token",
    "onion_temporary_token",
    "onion_two_factor_token",
    "onion_mfa_token",
    "onion_user",
    "onion_user_id",
    "onion_user_slug",
    "onion_user_name",
    "onion_role",
    "onion_session_id",
    "onion_session_user_id",
    "onion_post_login_target",

    "onion.token",
    "onion.accessToken",
    "onion.refreshToken",
    "onion.tempToken",
    "onion.temporaryToken",
    "onion.twoFactorToken",
    "onion.mfaToken",
    "onion.user",
    "onion.role",
    "onion.sessionId",
    "onion.sessionUserId",
    "onion.postLoginTarget",

    "onion:token",
    "onion:accessToken",
    "onion:access_token",
    "onion:refreshToken",
    "onion:refresh_token",
    "onion:tempToken",
    "onion:temp_token",
    "onion:temporaryToken",
    "onion:temporary_token",
    "onion:twoFactorToken",
    "onion:two_factor_token",
    "onion:mfaToken",
    "onion:mfa_token",
    "onion:user",
    "onion:userId",
    "onion:user_id",
    "onion:userName",
    "onion:user_name",
    "onion:userSlug",
    "onion:user_slug",
    "onion:role",
    "onion:session",
    "onion:sessionData",
    "onion:sessionId",
    "onion:session_id",
    "onion:sessionUserId",
    "onion:session_user_id",
    "onion:postLoginTarget",
    "onion:post_login_target",

    "token",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "twoFactorToken",
    "two_factor_token",
    "mfaToken",
    "mfa_token",
    "user",
    "currentUser",
    "sessionUser",
    "authUser",
    "role",
    "rol",
    "roles",
    "session",
    "sessionData",
    "auth",
    "sessionId",
    "session_id",
    "sessionUserId",
    "session_user_id",
    "postLoginTarget",
    "post_login_target",
    "redirectAfterLogin",
    "redirect_after_login",
  ]);

const STORAGE_EVENTS =
  Object.freeze({
    ready:
      "app:core:storage:ready",

    unavailable:
      "app:core:storage:unavailable",

    error:
      "app:core:storage:error",

    repaired:
      "app:core:storage:repaired",

    cleared:
      "app:core:storage:cleared",

    legacyCleared:
      "app:core:storage:legacy-cleared",
  });

/* =========================================================
   MODULE MEMORY FALLBACK
========================================================= */

const memoryStorage =
  new Map();

const storageAvailabilityCache = {
  local:
    null,

  session:
    null,
};

let lastStorageError =
  null;

/* =========================================================
   BASIC HELPERS
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

function safeLower(value, fallback = "") {
  return safeText(
    value,
    fallback
  ).toLowerCase();
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

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function unique(values = []) {
  const result =
    [];

  const seen =
    new Set();

  for (const value of safeArray(values).flat(Infinity)) {
    const clean =
      safeText(value, "");

    if (
      clean &&
      !seen.has(clean)
    ) {
      seen.add(clean);
      result.push(clean);
    }
  }

  return result;
}

function safeEmit(events, eventName, payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  try {
    if (isFunction(events?.emit)) {
      events.emit(
        name,
        payload
      );

      return true;
    }
  } catch {}

  return false;
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

  try {
    if (config?.debug) {
      console.log(
        "[Storage]",
        ...args
      );
    }
  } catch {}
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

function safeJsonParse(raw, fallback = null) {
  if (
    raw === null ||
    raw === undefined
  ) {
    return fallback;
  }

  try {
    if (typeof safeParse === "function") {
      return safeParse(
        raw,
        fallback
      );
    }
  } catch {}

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function isCorruptedRawValue(raw) {
  const value =
    String(raw ?? "").trim();

  return CORRUPTED_RAW_VALUES.includes(value);
}

function shouldRemoveOnSet(value) {
  return (
    value === undefined ||
    value === null
  );
}

function normalizeKind(kind = DEFAULT_KIND) {
  const clean =
    safeLower(
      kind,
      DEFAULT_KIND
    );

  return VALID_KINDS.includes(clean)
    ? clean
    : DEFAULT_KIND;
}

/* =========================================================
   PREFIX / KEYS
========================================================= */

function getPrefixRaw() {
  const prefix =
    safeText(
      config?.storagePrefix ||
        config?.appKey ||
        config?.appId ||
        DEFAULT_PREFIX,
      DEFAULT_PREFIX
    )
      .replace(/:+$/g, "")
      .replace(/^:+/g, "");

  return prefix || DEFAULT_PREFIX;
}

function getPrefix() {
  return `${getPrefixRaw()}:`;
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
    const built =
      buildStorageKey(cleanKey);

    if (safeText(built, "")) {
      return built;
    }
  } catch {}

  return `${getPrefix()}${cleanKey}`;
}

function getRawStorageKey(key = "") {
  return safeText(key, "");
}

function isCurrentNamespacedKey(key = "") {
  return isNamespacedKey(
    safeText(key, "")
  );
}

/* =========================================================
   STORAGE BACKENDS
========================================================= */

function getStorageObject(kind = DEFAULT_KIND) {
  if (!isBrowser()) {
    return null;
  }

  const finalKind =
    normalizeKind(kind);

  try {
    if (finalKind === "local") {
      return window.localStorage || null;
    }

    if (finalKind === "session") {
      return window.sessionStorage || null;
    }
  } catch (error) {
    lastStorageError =
      error;

    return null;
  }

  return null;
}

function testStorageAvailability(kind = DEFAULT_KIND) {
  const finalKind =
    normalizeKind(kind);

  if (finalKind === "memory") {
    return true;
  }

  if (storageAvailabilityCache[finalKind] !== null) {
    return storageAvailabilityCache[finalKind];
  }

  const storage =
    getStorageObject(finalKind);

  if (!storage) {
    storageAvailabilityCache[finalKind] =
      false;

    return false;
  }

  const testKey =
    `${getPrefix()}${STORAGE_TEST_KEY}:${finalKind}`;

  try {
    storage.setItem(
      testKey,
      "1"
    );

    storage.removeItem(
      testKey
    );

    storageAvailabilityCache[finalKind] =
      true;

    return true;
  } catch (error) {
    lastStorageError =
      error;

    storageAvailabilityCache[finalKind] =
      false;

    return false;
  }
}

function resetStorageAvailabilityCache() {
  storageAvailabilityCache.local =
    null;

  storageAvailabilityCache.session =
    null;

  return true;
}

function getUsableStorage(kind = DEFAULT_KIND) {
  const finalKind =
    normalizeKind(kind);

  if (finalKind === "memory") {
    return null;
  }

  if (!testStorageAvailability(finalKind)) {
    return null;
  }

  return getStorageObject(finalKind);
}

function readRawFromStorage(kind, namespacedKey, fallback = null) {
  const storage =
    getUsableStorage(kind);

  if (!storage) {
    return fallback;
  }

  try {
    const raw =
      storage.getItem(namespacedKey);

    if (
      raw === null ||
      raw === undefined ||
      isCorruptedRawValue(raw)
    ) {
      return fallback;
    }

    return raw;
  } catch (error) {
    lastStorageError =
      error;

    return fallback;
  }
}

function writeRawToStorage(kind, namespacedKey, raw) {
  const storage =
    getUsableStorage(kind);

  if (!storage) {
    return false;
  }

  try {
    storage.setItem(
      namespacedKey,
      raw
    );

    return true;
  } catch (error) {
    lastStorageError =
      error;

    return false;
  }
}

function removeFromStorage(kind, namespacedKey) {
  const storage =
    getStorageObject(kind);

  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(
      namespacedKey
    );

    return true;
  } catch (error) {
    lastStorageError =
      error;

    return false;
  }
}

/* =========================================================
   MEMORY FALLBACK
========================================================= */

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

/* =========================================================
   PARSE / SNAPSHOT
========================================================= */

function sanitizeSnapshotValue(key = "", value = "") {
  if (SENSITIVE_KEY_RE.test(key)) {
    return value
      ? "***"
      : null;
  }

  try {
    return redactTokenInText(
      String(value ?? "")
    );
  } catch {
    return value;
  }
}

function sanitizeError(error = null) {
  if (!error) {
    return null;
  }

  return {
    name:
      safeText(
        error?.name,
        "StorageError"
      ),

    message:
      safeText(
        error?.message ||
          error,
        "Storage error"
      ),
  };
}

function parseStoredJson(raw, fallback = null) {
  if (
    raw === null ||
    raw === undefined ||
    isCorruptedRawValue(raw)
  ) {
    return fallback;
  }

  const parsed =
    safeJsonParse(
      raw,
      undefined
    );

  return parsed === undefined
    ? fallback
    : parsed;
}

function parseStoredValue(raw, fallback = null) {
  if (
    raw === null ||
    raw === undefined ||
    isCorruptedRawValue(raw)
  ) {
    return fallback;
  }

  const parsed =
    safeJsonParse(
      raw,
      undefined
    );

  return parsed === undefined
    ? raw
    : parsed;
}

/* =========================================================
   KEY COLLECTION
========================================================= */

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

function collectStorageKeys(storage, predicate = () => true) {
  const output = [];

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

function getAllBackendKeys(kind = DEFAULT_KIND, predicate = () => true) {
  const finalKind =
    normalizeKind(kind);

  if (finalKind === "memory") {
    return Array.from(memoryStorage.keys())
      .filter(predicate);
  }

  const storage =
    getStorageObject(finalKind);

  return collectStorageKeys(
    storage,
    predicate
  );
}

/* =========================================================
   LEGACY CLEANUP
========================================================= */

function getConfiguredLegacyKeys() {
  const legacy =
    config?.legacyStorageKeys;

  if (!legacy) {
    return [];
  }

  if (Array.isArray(legacy)) {
    return legacy
      .map((item) =>
        safeText(item, "")
      )
      .filter(Boolean);
  }

  if (isObject(legacy)) {
    return Object.values(legacy)
      .flat()
      .map((item) =>
        safeText(item, "")
      )
      .filter(Boolean);
  }

  return [];
}

function getLegacyKeys() {
  return unique([
    ...getConfiguredLegacyKeys(),
    ...LEGACY_EXTRA_KEYS,
  ]).filter((legacyKey) => (
    legacyKey &&
    !isCurrentNamespacedKey(legacyKey)
  ));
}

function shouldRemoveLegacyKey(key = "") {
  const clean =
    safeText(key, "");

  if (!clean) {
    return false;
  }

  if (isCurrentNamespacedKey(clean)) {
    return false;
  }

  return (
    getLegacyKeys().includes(clean) ||
    (
      SESSIONISH_KEY_RE.test(clean) &&
      (
        clean.startsWith("onion_") ||
        clean.startsWith("onion.") ||
        !clean.includes(":")
      )
    )
  );
}

export function removeLegacySessionKeys(utils = null, events = null) {
  const explicitKeys =
    getLegacyKeys();

  let removed =
    0;

  for (const kind of [
    "local",
    "session",
  ]) {
    const storage =
      getStorageObject(kind);

    if (!storage) {
      continue;
    }

    const scannedKeys =
      collectStorageKeys(
        storage,
        shouldRemoveLegacyKey
      );

    const keys =
      unique([
        ...explicitKeys,
        ...scannedKeys,
      ]);

    for (const legacyKey of keys) {
      const key =
        getRawStorageKey(legacyKey);

      if (
        !key ||
        isCurrentNamespacedKey(key)
      ) {
        continue;
      }

      try {
        storage.removeItem(key);
        removed += 1;
      } catch (error) {
        lastStorageError =
          error;

        safeWarn(
          utils,
          "No se pudo borrar clave legacy.",
          key,
          error
        );
      }
    }
  }

  for (const key of Array.from(memoryStorage.keys())) {
    if (shouldRemoveLegacyKey(key)) {
      memoryStorage.delete(key);
      removed += 1;
    }
  }

  safeEmit(
    events,
    STORAGE_EVENTS.legacyCleared,
    {
      removed,
      at:
        safeIsoDate(),
    }
  );

  return removed;
}

/* =========================================================
   STORAGE FACTORY
========================================================= */

export function createStorage(input = {}) {
  const deps =
    isObject(input)
      ? input
      : {
          utils:
            input,
        };

  const utils =
    deps.utils || input || null;

  const events =
    deps.events || null;

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

    repair:
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

    sessionStorageWrites:
      0,

    sessionStorageReads:
      0,

    lastOperation:
      "",

    lastKey:
      "",

    lastKind:
      "",

    lastAt:
      "",
  };

  function touch(operation = "", key = "", kind = "") {
    stats.lastOperation =
      operation;

    stats.lastKey =
      safeText(key, "");

    stats.lastKind =
      safeText(kind, "");

    stats.lastAt =
      safeIsoDate();
  }

  function recordError(error, operation = "", key = "", kind = "") {
    stats.errors += 1;

    lastStorageError =
      error;

    touch(
      operation,
      key,
      kind
    );

    safeWarn(
      utils,
      `Storage error en ${operation}: ${key}`,
      {
        kind,
        error:
          sanitizeError(error),
      }
    );

    safeEmit(
      events,
      STORAGE_EVENTS.error,
      {
        operation,

        key:
          sanitizeSnapshotValue(
            key,
            key
          ),

        kind,

        error:
          sanitizeError(error),

        at:
          safeIsoDate(),
      }
    );
  }

  function key(name = "") {
    return getNamespacedKey(name);
  }

  function resolveKindFromOptions(options = {}) {
    const opts =
      isObject(options)
        ? options
        : {};

    if (opts.memory === true) {
      return "memory";
    }

    if (opts.session === true) {
      return "session";
    }

    return normalizeKind(
      opts.kind ||
        opts.storage ||
        DEFAULT_KIND
    );
  }

  function incrementReadCounter(kind) {
    if (kind === "local") {
      stats.localStorageReads += 1;
    } else if (kind === "session") {
      stats.sessionStorageReads += 1;
    } else {
      stats.memoryFallbackReads += 1;
    }
  }

  function incrementWriteCounter(kind) {
    if (kind === "local") {
      stats.localStorageWrites += 1;
    } else if (kind === "session") {
      stats.sessionStorageWrites += 1;
    } else {
      stats.memoryFallbackWrites += 1;
    }
  }

  function getRaw(name, fallback = null, options = {}) {
    const namespacedKey =
      key(name);

    const opts =
      isObject(options)
        ? options
        : {};

    const requestedKind =
      resolveKindFromOptions(opts);

    stats.get += 1;

    touch(
      "getRaw",
      namespacedKey,
      requestedKind
    );

    if (requestedKind === "memory") {
      incrementReadCounter("memory");

      return readRawFromMemory(
        namespacedKey,
        fallback
      );
    }

    const raw =
      readRawFromStorage(
        requestedKind,
        namespacedKey,
        undefined
      );

    incrementReadCounter(requestedKind);

    if (raw !== undefined) {
      writeRawToMemory(
        namespacedKey,
        raw
      );

      return raw;
    }

    if (
      requestedKind === "local" &&
      opts.fallbackSession !== false
    ) {
      const sessionRaw =
        readRawFromStorage(
          "session",
          namespacedKey,
          undefined
        );

      incrementReadCounter("session");

      if (sessionRaw !== undefined) {
        writeRawToMemory(
          namespacedKey,
          sessionRaw
        );

        return sessionRaw;
      }
    }

    incrementReadCounter("memory");

    return readRawFromMemory(
      namespacedKey,
      fallback
    );
  }

  function get(name, fallback = null, options = {}) {
    const raw =
      getRaw(
        name,
        null,
        options
      );

    return parseStoredValue(
      raw,
      fallback
    );
  }

  function getJson(name, fallback = null, options = {}) {
    const raw =
      getRaw(
        name,
        null,
        options
      );

    return parseStoredJson(
      raw,
      fallback
    );
  }

  function setRaw(name, value, options = {}) {
    const namespacedKey =
      key(name);

    const opts =
      isObject(options)
        ? options
        : {};

    const requestedKind =
      resolveKindFromOptions(opts);

    stats.set += 1;

    touch(
      "setRaw",
      namespacedKey,
      requestedKind
    );

    if (shouldRemoveOnSet(value)) {
      return remove(
        name,
        opts
      );
    }

    const raw =
      String(value ?? "");

    if (
      !raw ||
      isCorruptedRawValue(raw)
    ) {
      return remove(
        name,
        opts
      );
    }

    if (requestedKind !== "memory") {
      const ok =
        writeRawToStorage(
          requestedKind,
          namespacedKey,
          raw
        );

      if (ok) {
        incrementWriteCounter(requestedKind);

        writeRawToMemory(
          namespacedKey,
          raw
        );

        return true;
      }

      recordError(
        lastStorageError,
        "setRaw",
        namespacedKey,
        requestedKind
      );
    }

    incrementWriteCounter("memory");

    return writeRawToMemory(
      namespacedKey,
      raw
    );
  }

  function set(name, value, options = {}) {
    const namespacedKey =
      key(name);

    const opts =
      isObject(options)
        ? options
        : {};

    touch(
      "set",
      namespacedKey,
      resolveKindFromOptions(opts)
    );

    if (shouldRemoveOnSet(value)) {
      return remove(
        name,
        opts
      );
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

    return setRaw(
      name,
      raw,
      opts
    );
  }

  function setJson(name, value, options = {}) {
    return set(
      name,
      value,
      options
    );
  }

  function remove(name, options = {}) {
    const namespacedKey =
      key(name);

    const opts =
      isObject(options)
        ? options
        : {};

    const requestedKind =
      resolveKindFromOptions(opts);

    stats.remove += 1;

    touch(
      "remove",
      namespacedKey,
      requestedKind
    );

    if (
      requestedKind === "local" ||
      opts.all === true
    ) {
      removeFromStorage(
        "local",
        namespacedKey
      );
    }

    if (
      requestedKind === "session" ||
      opts.all === true ||
      opts.sessionAlso === true
    ) {
      removeFromStorage(
        "session",
        namespacedKey
      );
    }

    if (
      requestedKind === "memory" ||
      opts.all === true ||
      opts.memoryAlso !== false
    ) {
      removeFromMemory(
        namespacedKey
      );
    }

    return true;
  }

  function has(name, options = {}) {
    const namespacedKey =
      key(name);

    const opts =
      isObject(options)
        ? options
        : {};

    const requestedKind =
      resolveKindFromOptions(opts);

    stats.has += 1;

    touch(
      "has",
      namespacedKey,
      requestedKind
    );

    if (requestedKind === "memory") {
      return memoryStorage.has(
        namespacedKey
      );
    }

    const storage =
      getUsableStorage(requestedKind);

    if (storage) {
      try {
        const raw =
          storage.getItem(namespacedKey);

        incrementReadCounter(requestedKind);

        return (
          raw !== null &&
          raw !== undefined &&
          !isCorruptedRawValue(raw)
        );
      } catch (error) {
        recordError(
          error,
          "has",
          namespacedKey,
          requestedKind
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

    const requestedKind =
      resolveKindFromOptions(opts);

    const includeValues =
      Boolean(opts.includeValues);

    const prefix =
      opts.prefix
        ? getNamespacedKey(opts.prefix)
        : getPrefix();

    stats.keys += 1;

    touch(
      "keys",
      prefix,
      requestedKind
    );

    const output = [];

    function pushKey(currentKey, valueGetter = null) {
      const exists =
        output.some((item) =>
          typeof item === "string"
            ? item === currentKey
            : item.key === currentKey
        );

      if (exists) {
        return;
      }

      if (includeValues) {
        let raw = "";

        try {
          raw = isFunction(valueGetter)
            ? valueGetter()
            : "";
        } catch {
          raw = "";
        }

        output.push({
          key:
            currentKey,

          value:
            sanitizeSnapshotValue(
              currentKey,
              raw
            ),
        });
      } else {
        output.push(currentKey);
      }
    }

    const kindsToRead =
      requestedKind === "memory"
        ? ["memory"]
        : opts.all === true
          ? ["local", "session", "memory"]
          : [requestedKind, "memory"];

    for (const kind of unique(kindsToRead)) {
      if (kind === "memory") {
        for (const currentKey of memoryStorage.keys()) {
          if (currentKey.startsWith(prefix)) {
            pushKey(
              currentKey,
              () =>
                memoryStorage.get(currentKey)
            );
          }
        }

        continue;
      }

      const storage =
        getStorageObject(kind);

      const backendKeys =
        collectStorageKeys(
          storage,
          (currentKey) =>
            currentKey.startsWith(prefix)
        );

      for (const currentKey of backendKeys) {
        pushKey(
          currentKey,
          () =>
            storage.getItem(currentKey)
        );
      }
    }

    return output;
  }

  function entries(options = {}) {
    return keys({
      ...options,
      includeValues:
        true,
    });
  }

  function clearNamespace(namespace = "", options = {}) {
    const opts =
      isObject(options)
        ? options
        : {};

    const prefix =
      namespace
        ? getNamespacedKey(namespace)
        : getPrefix();

    const requestedKind =
      resolveKindFromOptions(opts);

    const kindsToClear =
      opts.all === true
        ? ["local", "session", "memory"]
        : requestedKind === "memory"
          ? ["memory"]
          : [requestedKind, "memory"];

    let removed = 0;

    stats.clear += 1;

    touch(
      "clearNamespace",
      prefix,
      requestedKind
    );

    for (const kind of unique(kindsToClear)) {
      if (kind === "memory") {
        for (const currentKey of Array.from(memoryStorage.keys())) {
          if (currentKey.startsWith(prefix)) {
            memoryStorage.delete(currentKey);
            removed += 1;
          }
        }

        continue;
      }

      const storage =
        getStorageObject(kind);

      const keysToRemove =
        collectStorageKeys(
          storage,
          (currentKey) =>
            currentKey.startsWith(prefix)
        );

      for (const currentKey of keysToRemove) {
        try {
          storage.removeItem(currentKey);
          removed += 1;
        } catch (error) {
          recordError(
            error,
            "clearNamespace",
            currentKey,
            kind
          );
        }
      }
    }

    const result = {
      ok:
        true,

      removed,

      prefix,

      kind:
        requestedKind,
    };

    safeEmit(
      events,
      STORAGE_EVENTS.cleared,
      {
        ...result,
        at:
          safeIsoDate(),
      }
    );

    return result;
  }

  function clearAll(options = {}) {
    const opts =
      isObject(options)
        ? options
        : {};

    const includeLegacy =
      opts.includeLegacy === true;

    const result =
      clearNamespace(
        "",
        {
          ...opts,
          all:
            opts.all !== false,
        }
      );

    let removed =
      result.removed || 0;

    if (includeLegacy) {
      removed += removeLegacySessionKeys(
        utils,
        events
      );
    }

    return {
      ...result,
      removed,
      includeLegacy,
    };
  }

  function repairCorrupted(options = {}) {
    const opts =
      isObject(options)
        ? options
        : {};

    const requestedKind =
      resolveKindFromOptions(opts);

    const prefix =
      opts.prefix
        ? getNamespacedKey(opts.prefix)
        : getPrefix();

    const kindsToRepair =
      opts.all === true
        ? ["local", "session", "memory"]
        : requestedKind === "memory"
          ? ["memory"]
          : [requestedKind, "memory"];

    let repaired = 0;

    stats.repair += 1;

    touch(
      "repairCorrupted",
      prefix,
      requestedKind
    );

    for (const kind of unique(kindsToRepair)) {
      if (kind === "memory") {
        for (const [currentKey, raw] of Array.from(memoryStorage.entries())) {
          if (
            currentKey.startsWith(prefix) &&
            isCorruptedRawValue(raw)
          ) {
            memoryStorage.delete(currentKey);
            repaired += 1;
          }
        }

        continue;
      }

      const storage =
        getStorageObject(kind);

      const keysToCheck =
        collectStorageKeys(
          storage,
          (currentKey) =>
            currentKey.startsWith(prefix)
        );

      for (const currentKey of keysToCheck) {
        try {
          const raw =
            storage.getItem(currentKey);

          if (isCorruptedRawValue(raw)) {
            storage.removeItem(currentKey);
            repaired += 1;
          }
        } catch (error) {
          recordError(
            error,
            "repairCorrupted",
            currentKey,
            kind
          );
        }
      }
    }

    const result = {
      ok:
        true,

      repaired,

      prefix,

      kind:
        requestedKind,
    };

    safeEmit(
      events,
      STORAGE_EVENTS.repaired,
      {
        ...result,
        at:
          safeIsoDate(),
      }
    );

    return result;
  }

  function migrateLegacyKey(legacyKey = "", currentKey = "", options = {}) {
    const fromKey =
      safeText(legacyKey, "");

    const toKey =
      safeText(currentKey, "");

    const opts =
      isObject(options)
        ? options
        : {};

    if (
      !fromKey ||
      !toKey ||
      isCurrentNamespacedKey(fromKey)
    ) {
      return false;
    }

    const requestedKind =
      resolveKindFromOptions(opts);

    const storage =
      getStorageObject(requestedKind);

    let raw = null;

    try {
      raw =
        storage?.getItem?.(fromKey) ?? null;
    } catch (error) {
      recordError(
        error,
        "migrateLegacyKey:read",
        fromKey,
        requestedKind
      );
    }

    if (
      raw === null ||
      raw === undefined ||
      isCorruptedRawValue(raw)
    ) {
      return false;
    }

    const ok =
      setRaw(
        toKey,
        raw,
        opts
      );

    if (
      ok &&
      opts.removeLegacy !== false
    ) {
      try {
        storage?.removeItem?.(fromKey);
      } catch {}
    }

    return ok;
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

    return {
      version:
        STORAGE_VERSION,

      browser:
        isBrowser(),

      prefix:
        getPrefix(),

      prefixRaw:
        getPrefixRaw(),

      localStorageAvailable:
        testStorageAvailability("local"),

      sessionStorageAvailable:
        testStorageAvailability("session"),

      memoryFallbackSize:
        memoryStorage.size,

      keys:
        includeKeys
          ? keys({
              all:
                true,
              includeValues,
            })
          : [],

      stats: {
        ...stats,
      },

      lastError:
        sanitizeError(
          lastStorageError
        ),

      events:
        STORAGE_EVENTS,

      at:
        safeIsoDate(),
    };
  }

  safeLog(
    utils,
    "Storage ready.",
    {
      version:
        STORAGE_VERSION,

      prefix:
        getPrefix(),

      local:
        testStorageAvailability("local"),

      session:
        testStorageAvailability("session"),
    }
  );

  safeEmit(
    events,
    STORAGE_EVENTS.ready,
    {
      version:
        STORAGE_VERSION,

      prefix:
        getPrefix(),

      localStorageAvailable:
        testStorageAvailability("local"),

      sessionStorageAvailable:
        testStorageAvailability("session"),

      at:
        safeIsoDate(),
    }
  );

  if (
    !testStorageAvailability("local") &&
    !testStorageAvailability("session")
  ) {
    safeEmit(
      events,
      STORAGE_EVENTS.unavailable,
      {
        memoryFallback:
          true,

        error:
          sanitizeError(
            lastStorageError
          ),

        at:
          safeIsoDate(),
      }
    );
  }

  return {
    version:
      STORAGE_VERSION,

    prefix:
      getPrefix(),

    prefixRaw:
      getPrefixRaw(),

    key,
    getNamespacedKey:
      key,
    normalizeKey:
      key,

    get,
    getRaw,
    getJson,

    set,
    setRaw,
    setJson,

    remove,
    delete:
      remove,
    del:
      remove,

    has,

    keys,
    entries,

    clearAll,
    clear:
      clearAll,

    clearNamespace,

    repairCorrupted,

    migrateLegacyKey,

    removeLegacySessionKeys() {
      return removeLegacySessionKeys(
        utils,
        events
      );
    },

    resetStorageAvailabilityCache,

    getSnapshot,
    getDebugSnapshot:
      getSnapshot,

    snapshot:
      getSnapshot,
  };
}

/* =========================================================
   EXPORTS
========================================================= */

export {
  STORAGE_VERSION,
  STORAGE_EVENTS,
};

export default {
  STORAGE_VERSION,
  STORAGE_EVENTS,

  createStorage,
  removeLegacySessionKeys,
};
