/* =========================================================
   Onion SPA - Core Storage
   Archivo: src/core/storage.js

   ONION SUPPORT · CORE STORAGE
   NAMESPACED STORAGE · LOCAL/SESSION/MEMORY · SAFE LEGACY CLEANUP · 17/10

   Responsabilidades:
   - encapsular acceso localStorage/sessionStorage namespaced
   - leer / escribir valores serializados y raw
   - fallback en memoria si Web Storage no está disponible
   - borrar claves legacy de sesión/auth sin tocar preferencias
   - limpiar namespace actual sin localStorage.clear() ni sessionStorage.clear()
   - reparar valores corruptos controlados
   - migrar claves legacy puntuales
   - exponer snapshot de diagnóstico redacted

   Candados:
   - nunca usa localStorage.clear()
   - nunca usa sessionStorage.clear()
   - namespace estable: config.storagePrefix/appKey/appId || "onion"
   - claves canónicas: prefix:key
   - corruptos: "", undefined, null, NaN, [object Object]
   - NO trata false, {}, [] como corruptos genéricos
   - removeLegacySessionKeys no borra theme/lang/appearance/sidebar/settings/ui/preferences
   - no borra claves namespaced actuales en limpieza legacy
   - eventos app:core:storage:* sin tokens/secrets
   - soporte local/session/memory/all/sessionAlso/localAlso/memoryAlso
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

const STORAGE_VERSION = "17.0.0";

const DEFAULT_PREFIX = "onion";
const STORAGE_TEST_KEY = "__storage_test__";
const DEFAULT_KIND = "local";

const VALID_KINDS = Object.freeze([
  "local",
  "session",
  "memory",
]);

const CORRUPTED_RAW_VALUES = Object.freeze([
  "",
  "undefined",
  "null",
  "nan",
  "[object Object]",
  "[object object]",
  "\"\"",
  "''",
  "\"undefined\"",
  "\"null\"",
]);

const SENSITIVE_KEY_RE =
  /(token|authorization|password|secret|session|otp|code|jwt|bearer|credential|cookie|csrf|xsrf|mfa|2fa)/i;

const SESSIONISH_KEY_RE =
  /(session|token|auth|user|role|rol|login|otp|mfa|2fa|post_login|postLogin|redirectAfterLogin|redirect_after_login)/i;

const PREFERENCE_KEY_RE =
  /(^|[:._-])(theme|themeMode|theme_mode|appearance|lang|language|locale|sidebar|sidebarOpen|sidebar_open|sidebarCollapsed|sidebar_collapsed|density|preferences|preferencias|settings|ui)([:._-]|$)/i;

const LEGACY_EXTRA_KEYS = Object.freeze([
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
  "onion_username",
  "onion_role",
  "onion_roles",
  "onion_session",
  "onion_session_data",
  "onion_session_id",
  "onion_session_user_id",
  "onion_post_login_target",
  "onion_redirect_after_login",

  "onion.token",
  "onion.accessToken",
  "onion.access_token",
  "onion.refreshToken",
  "onion.refresh_token",
  "onion.tempToken",
  "onion.temp_token",
  "onion.temporaryToken",
  "onion.temporary_token",
  "onion.twoFactorToken",
  "onion.two_factor_token",
  "onion.mfaToken",
  "onion.mfa_token",
  "onion.user",
  "onion.currentUser",
  "onion.authUser",
  "onion.sessionUser",
  "onion.role",
  "onion.roles",
  "onion.session",
  "onion.sessionData",
  "onion.sessionId",
  "onion.session_id",
  "onion.sessionUserId",
  "onion.session_user_id",
  "onion.postLoginTarget",
  "onion.post_login_target",
  "onion.redirectAfterLogin",
  "onion.redirect_after_login",

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
  "onion:currentUser",
  "onion:authUser",
  "onion:sessionUser",
  "onion:userId",
  "onion:user_id",
  "onion:userName",
  "onion:user_name",
  "onion:username",
  "onion:userSlug",
  "onion:user_slug",
  "onion:role",
  "onion:roles",
  "onion:session",
  "onion:sessionData",
  "onion:session_id",
  "onion:sessionId",
  "onion:sessionUserId",
  "onion:session_user_id",
  "onion:postLoginTarget",
  "onion:post_login_target",
  "onion:redirectAfterLogin",
  "onion:redirect_after_login",

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

const STORAGE_EVENTS = Object.freeze({
  ready: "app:core:storage:ready",
  unavailable: "app:core:storage:unavailable",
  error: "app:core:storage:error",
  repaired: "app:core:storage:repaired",
  cleared: "app:core:storage:cleared",
  legacyCleared: "app:core:storage:legacy-cleared",
  migrated: "app:core:storage:migrated",
});

/* =========================================================
   MODULE MEMORY FALLBACK
========================================================= */

const memoryStorage = new Map();

const storageAvailabilityCache = {
  local: null,
  session: null,
};

let lastStorageError = null;

/* =========================================================
   BASIC HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function isObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
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
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value instanceof Set) {
    return Array.from(value);
  }

  if (value === null || value === undefined) {
    return [];
  }

  return [value];
}

function unique(values = []) {
  const result = [];
  const seen = new Set();

  for (const value of toArray(values).flat(Infinity)) {
    const clean = safeText(value, "");

    if (!clean || seen.has(clean)) {
      continue;
    }

    seen.add(clean);
    result.push(clean);
  }

  return result;
}

function safeWarn(utils, ...args) {
  try {
    utils?.warn?.("[Storage]", ...args);
  } catch {}

  try {
    if (config?.debug) {
      console.warn("[Storage]", ...args);
    }
  } catch {}
}

function safeLog(utils, ...args) {
  try {
    utils?.log?.("[Storage]", ...args);
  } catch {}

  try {
    if (config?.debug) {
      console.log("[Storage]", ...args);
    }
  } catch {}
}

function safeJsonStringify(value, fallback = "") {
  try {
    if (typeof safeStringify === "function") {
      return safeStringify(value, fallback);
    }
  } catch {}

  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function safeJsonParse(raw, fallback = null) {
  if (raw === null || raw === undefined) {
    return fallback;
  }

  try {
    if (typeof safeParse === "function") {
      return safeParse(raw, fallback);
    }
  } catch {}

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function isCorruptedRawValue(raw) {
  const value = String(raw ?? "").trim();
  return CORRUPTED_RAW_VALUES.includes(value);
}

function shouldRemoveOnSet(value) {
  return value === undefined || value === null;
}

function normalizeKind(kind = DEFAULT_KIND) {
  const clean = safeLower(kind, DEFAULT_KIND);
  return VALID_KINDS.includes(clean) ? clean : DEFAULT_KIND;
}

/* =========================================================
   REDACTION / EVENTS
========================================================= */

function sanitizeSnapshotValue(key = "", value = "") {
  if (SENSITIVE_KEY_RE.test(key)) {
    return value ? "***" : null;
  }

  try {
    return redactTokenInText(String(value ?? ""));
  } catch {
    return value;
  }
}

function sanitizeStoragePayload(value, depth = 0, keyHint = "") {
  if (depth > 4) {
    return "[depth-limit]";
  }

  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) {
    return value ? "***" : null;
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeSnapshotValue(keyHint, value);
  }

  if (typeof value === "function") {
    return "[function]";
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 80)
      .map((item) => sanitizeStoragePayload(item, depth + 1, keyHint));
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      output[key] = sanitizeStoragePayload(item, depth + 1, key);
    }

    return output;
  }

  try {
    return sanitizeSnapshotValue(keyHint, String(value));
  } catch {
    return "[unserializable]";
  }
}

function sanitizeError(error = null) {
  if (!error) {
    return null;
  }

  return {
    name: safeText(error?.name, "StorageError"),
    message: safeText(error?.message || error, "Storage error"),
  };
}

function safeEmit(events, eventName, payload = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  const cleanPayload = sanitizeStoragePayload(payload);

  try {
    if (isFunction(events?.emit)) {
      events.emit(name, cleanPayload);
      return true;
    }
  } catch {}

  try {
    if (isFunction(events?.dispatch)) {
      events.dispatch(name, cleanPayload);
      return true;
    }
  } catch {}

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      document.dispatchEvent(
        new CustomEvent(name, {
          detail: cleanPayload,
        })
      );

      return true;
    }
  } catch {}

  return false;
}

function sanitizeStats(stats = {}) {
  return {
    ...stats,
    lastKey: sanitizeSnapshotValue(stats.lastKey, stats.lastKey),
  };
}

/* =========================================================
   PREFIX / KEYS
========================================================= */

function getPrefixRaw() {
  const prefix = safeText(
    config?.storagePrefix || config?.appKey || config?.appId || DEFAULT_PREFIX,
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
  return safeText(key, "").startsWith(getPrefix());
}

function getNamespacedKey(key = "") {
  const cleanKey = normalizeStorageKey(key);

  if (!cleanKey) {
    return getPrefix().replace(/:$/g, "");
  }

  if (isNamespacedKey(cleanKey)) {
    return cleanKey;
  }

  try {
    const built = buildStorageKey(cleanKey);

    if (safeText(built, "") && isNamespacedKey(built)) {
      return built;
    }
  } catch {}

  return `${getPrefix()}${cleanKey}`;
}

function getRawStorageKey(key = "") {
  return safeText(key, "");
}

function isCurrentNamespacedKey(key = "") {
  return isNamespacedKey(safeText(key, ""));
}

function namespacePrefix(namespace = "") {
  const clean = safeText(namespace, "");

  if (!clean) {
    return getPrefix();
  }

  const namespaced = getNamespacedKey(clean);

  return namespaced.endsWith(":") ? namespaced : `${namespaced}:`;
}

function stripCurrentPrefix(key = "") {
  const clean = safeText(key, "");
  const prefix = getPrefix();

  if (!clean.startsWith(prefix)) {
    return clean;
  }

  return clean.slice(prefix.length);
}

/* =========================================================
   STORAGE BACKENDS
========================================================= */

function getStorageObject(kind = DEFAULT_KIND) {
  if (!isBrowser()) {
    return null;
  }

  const finalKind = normalizeKind(kind);

  try {
    if (finalKind === "local") {
      return window.localStorage || null;
    }

    if (finalKind === "session") {
      return window.sessionStorage || null;
    }
  } catch (error) {
    lastStorageError = error;
    return null;
  }

  return null;
}

function testStorageAvailability(kind = DEFAULT_KIND) {
  const finalKind = normalizeKind(kind);

  if (finalKind === "memory") {
    return true;
  }

  if (storageAvailabilityCache[finalKind] !== null) {
    return storageAvailabilityCache[finalKind];
  }

  const storage = getStorageObject(finalKind);

  if (!storage) {
    storageAvailabilityCache[finalKind] = false;
    return false;
  }

  const testKey = `${getPrefix()}${STORAGE_TEST_KEY}:${finalKind}`;

  try {
    storage.setItem(testKey, "1");
    storage.removeItem(testKey);

    storageAvailabilityCache[finalKind] = true;
    return true;
  } catch (error) {
    lastStorageError = error;
    storageAvailabilityCache[finalKind] = false;
    return false;
  }
}

function resetStorageAvailabilityCache() {
  storageAvailabilityCache.local = null;
  storageAvailabilityCache.session = null;
  return true;
}

function getUsableStorage(kind = DEFAULT_KIND) {
  const finalKind = normalizeKind(kind);

  if (finalKind === "memory") {
    return null;
  }

  if (!testStorageAvailability(finalKind)) {
    return null;
  }

  return getStorageObject(finalKind);
}

function storageHasKey(storage, key) {
  if (!storage || !key) {
    return false;
  }

  try {
    return storage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function readRawFromStorage(kind, namespacedKey, fallback = undefined) {
  const storage = getUsableStorage(kind);

  if (!storage) {
    return fallback;
  }

  try {
    const raw = storage.getItem(namespacedKey);

    if (raw === null || raw === undefined || isCorruptedRawValue(raw)) {
      return fallback;
    }

    return raw;
  } catch (error) {
    lastStorageError = error;
    return fallback;
  }
}

function writeRawToStorage(kind, namespacedKey, raw) {
  const storage = getUsableStorage(kind);

  if (!storage) {
    return false;
  }

  try {
    storage.setItem(namespacedKey, raw);
    return true;
  } catch (error) {
    lastStorageError = error;
    return false;
  }
}

function removeFromStorage(kind, namespacedKey) {
  const storage = getStorageObject(kind);

  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(namespacedKey);
    return true;
  } catch (error) {
    lastStorageError = error;
    return false;
  }
}

/* =========================================================
   MEMORY FALLBACK
========================================================= */

function readRawFromMemory(namespacedKey, fallback = undefined) {
  if (!memoryStorage.has(namespacedKey)) {
    return fallback;
  }

  const raw = memoryStorage.get(namespacedKey);

  if (raw === null || raw === undefined || isCorruptedRawValue(raw)) {
    return fallback;
  }

  return raw;
}

function writeRawToMemory(namespacedKey, raw) {
  if (!namespacedKey) {
    return false;
  }

  if (raw === null || raw === undefined) {
    memoryStorage.delete(namespacedKey);
    return true;
  }

  memoryStorage.set(namespacedKey, String(raw));
  return true;
}

function removeFromMemory(namespacedKey) {
  memoryStorage.delete(namespacedKey);
  return true;
}

/* =========================================================
   PARSE
========================================================= */

function parseStoredJson(raw, fallback = null) {
  if (raw === null || raw === undefined || isCorruptedRawValue(raw)) {
    return fallback;
  }

  const parsed = safeJsonParse(raw, undefined);
  return parsed === undefined ? fallback : parsed;
}

function parseStoredValue(raw, fallback = null) {
  if (raw === null || raw === undefined || isCorruptedRawValue(raw)) {
    return fallback;
  }

  const parsed = safeJsonParse(raw, undefined);
  return parsed === undefined ? raw : parsed;
}

/* =========================================================
   KEY COLLECTION
========================================================= */

function getStorageLength(storage) {
  try {
    return safeNumber(storage?.length, 0);
  } catch {
    return 0;
  }
}

function collectStorageKeys(storage, predicate = () => true) {
  const output = [];

  if (!storage) {
    return output;
  }

  const length = getStorageLength(storage);

  try {
    for (let i = 0; i < length; i += 1) {
      const currentKey = storage.key(i);

      if (currentKey && predicate(currentKey)) {
        output.push(currentKey);
      }
    }
  } catch {}

  return output;
}

/* =========================================================
   LEGACY CLEANUP
========================================================= */

function getConfiguredLegacyKeys() {
  const legacy = config?.legacyStorageKeys;

  if (!legacy) {
    return [];
  }

  if (Array.isArray(legacy)) {
    return legacy.map((item) => safeText(item, "")).filter(Boolean);
  }

  if (isObject(legacy)) {
    return Object.values(legacy)
      .flat()
      .map((item) => safeText(item, ""))
      .filter(Boolean);
  }

  return [];
}

function isPreferenceLikeKey(key = "") {
  return PREFERENCE_KEY_RE.test(safeText(key, ""));
}

function getLegacyKeys() {
  return unique([
    ...getConfiguredLegacyKeys(),
    ...LEGACY_EXTRA_KEYS,
  ]).filter((legacyKey) => {
    if (!legacyKey) {
      return false;
    }

    if (isCurrentNamespacedKey(legacyKey)) {
      return false;
    }

    if (isPreferenceLikeKey(legacyKey)) {
      return false;
    }

    return true;
  });
}

function shouldRemoveLegacyKey(key = "") {
  const clean = safeText(key, "");

  if (!clean) {
    return false;
  }

  if (isCurrentNamespacedKey(clean)) {
    return false;
  }

  if (isPreferenceLikeKey(clean)) {
    return false;
  }

  return (
    getLegacyKeys().includes(clean) ||
    (
      SESSIONISH_KEY_RE.test(clean) &&
      (
        clean.startsWith("onion_") ||
        clean.startsWith("onion.") ||
        clean.startsWith("onion:") ||
        !clean.includes(":")
      )
    )
  );
}

export function removeLegacySessionKeys(utils = null, events = null) {
  const explicitKeys = getLegacyKeys();
  let removed = 0;

  for (const kind of ["local", "session"]) {
    const storage = getStorageObject(kind);

    if (!storage) {
      continue;
    }

    const scannedKeys = collectStorageKeys(storage, shouldRemoveLegacyKey);
    const keys = unique([...explicitKeys, ...scannedKeys]);

    for (const legacyKey of keys) {
      const key = getRawStorageKey(legacyKey);

      if (!key || isCurrentNamespacedKey(key) || isPreferenceLikeKey(key)) {
        continue;
      }

      try {
        if (!storageHasKey(storage, key)) {
          continue;
        }

        storage.removeItem(key);
        removed += 1;
      } catch (error) {
        lastStorageError = error;
        safeWarn(utils, "No se pudo borrar clave legacy.", key, sanitizeError(error));
      }
    }
  }

  for (const key of Array.from(memoryStorage.keys())) {
    if (shouldRemoveLegacyKey(key)) {
      memoryStorage.delete(key);
      removed += 1;
    }
  }

  safeEmit(events, STORAGE_EVENTS.legacyCleared, {
    removed,
    at: safeIsoDate(),
  });

  return removed;
}

/* =========================================================
   STORAGE FACTORY
========================================================= */

export function createStorage(input = {}) {
  const deps = isObject(input) ? input : { utils: input };

  const utils =
    deps.utils ||
    deps.logger ||
    input?.utils ||
    input ||
    null;

  const events =
    deps.events ||
    deps.bus ||
    deps.eventBus ||
    input?.events ||
    input?.bus ||
    null;

  const stats = {
    get: 0,
    set: 0,
    remove: 0,
    has: 0,
    keys: 0,
    clear: 0,
    repair: 0,
    migrate: 0,
    errors: 0,

    memoryFallbackWrites: 0,
    memoryFallbackReads: 0,
    localStorageWrites: 0,
    localStorageReads: 0,
    sessionStorageWrites: 0,
    sessionStorageReads: 0,

    lastOperation: "",
    lastKey: "",
    lastKind: "",
    lastAt: "",
  };

  function touch(operation = "", key = "", kind = "") {
    stats.lastOperation = safeText(operation, "");
    stats.lastKey = safeText(key, "");
    stats.lastKind = safeText(kind, "");
    stats.lastAt = safeIsoDate();
  }

  function recordError(error, operation = "", key = "", kind = "") {
    if (!error) {
      return;
    }

    stats.errors += 1;
    lastStorageError = error;

    touch(operation, key, kind);

    safeWarn(utils, `Storage error en ${operation}: ${key}`, {
      kind,
      error: sanitizeError(error),
    });

    safeEmit(events, STORAGE_EVENTS.error, {
      operation,
      key: sanitizeSnapshotValue(key, key),
      kind,
      error: sanitizeError(error),
      at: safeIsoDate(),
    });
  }

  function key(name = "") {
    return getNamespacedKey(name);
  }

  function resolveKindFromOptions(options = {}) {
    const opts = isObject(options) ? options : {};

    if (opts.memory === true || opts.memoryOnly === true) {
      return "memory";
    }

    if (opts.session === true || opts.sessionOnly === true) {
      return "session";
    }

    if (opts.local === true || opts.localOnly === true) {
      return "local";
    }

    return normalizeKind(opts.kind || opts.storage || DEFAULT_KIND);
  }

  function resolveReadTargets(options = {}) {
    const opts = isObject(options) ? options : {};
    const requestedKind = resolveKindFromOptions(opts);

    if (opts.all === true) {
      return unique([requestedKind, "local", "session", "memory"]);
    }

    if (requestedKind === "memory") {
      return ["memory"];
    }

    if (requestedKind === "session") {
      return unique([
        "session",
        opts.sessionOnly === true ? "" : opts.fallbackLocal === true ? "local" : "",
        opts.memoryAlso === false ? "" : "memory",
      ]);
    }

    return unique([
      "local",
      opts.localOnly === true ? "" : opts.fallbackSession === false ? "" : "session",
      opts.memoryAlso === false ? "" : "memory",
    ]);
  }

  function resolveWriteTargets(options = {}) {
    const opts = isObject(options) ? options : {};
    const requestedKind = resolveKindFromOptions(opts);

    if (opts.all === true) {
      return ["local", "session", "memory"];
    }

    if (requestedKind === "memory") {
      return ["memory"];
    }

    if (requestedKind === "session") {
      return unique([
        "session",
        opts.sessionOnly === true ? "" : opts.localAlso === true ? "local" : "",
        opts.memoryAlso === false ? "" : "memory",
      ]);
    }

    return unique([
      "local",
      opts.localOnly === true ? "" : opts.sessionAlso === true ? "session" : "",
      opts.memoryAlso === false ? "" : "memory",
    ]);
  }

  function resolveRemoveTargets(options = {}) {
    const opts = isObject(options) ? options : {};
    const requestedKind = resolveKindFromOptions(opts);

    if (opts.all === true) {
      return ["local", "session", "memory"];
    }

    if (requestedKind === "memory") {
      return ["memory"];
    }

    if (requestedKind === "session") {
      return unique([
        "session",
        opts.sessionOnly === true ? "" : opts.localAlso === true ? "local" : "",
        opts.memoryAlso === false ? "" : "memory",
      ]);
    }

    return unique([
      "local",
      opts.localOnly === true ? "" : opts.sessionAlso === true ? "session" : "",
      opts.memoryAlso === false ? "" : "memory",
    ]);
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
    const namespacedKey = key(name);
    const opts = isObject(options) ? options : {};
    const requestedKind = resolveKindFromOptions(opts);

    stats.get += 1;
    touch("getRaw", namespacedKey, requestedKind);

    const targets = resolveReadTargets(opts);

    for (const target of targets) {
      if (target === "memory") {
        incrementReadCounter("memory");

        const memoryRaw = readRawFromMemory(namespacedKey, undefined);

        if (memoryRaw !== undefined) {
          return memoryRaw;
        }

        continue;
      }

      const raw = readRawFromStorage(target, namespacedKey, undefined);
      incrementReadCounter(target);

      if (raw !== undefined) {
        if (opts.memoryAlso !== false) {
          writeRawToMemory(namespacedKey, raw);
        }

        return raw;
      }
    }

    return fallback;
  }

  function get(name, fallback = null, options = {}) {
    const raw = getRaw(name, undefined, options);
    return raw === undefined ? fallback : parseStoredValue(raw, fallback);
  }

  function getJson(name, fallback = null, options = {}) {
    const raw = getRaw(name, undefined, options);
    return raw === undefined ? fallback : parseStoredJson(raw, fallback);
  }

  function writeRawToRequestedTargets(name, raw, opts = {}) {
    const namespacedKey = key(name);
    const targets = resolveWriteTargets(opts);

    let written = false;

    for (const target of targets) {
      if (target === "memory") {
        incrementWriteCounter("memory");
        written = writeRawToMemory(namespacedKey, raw) || written;
        continue;
      }

      const ok = writeRawToStorage(target, namespacedKey, raw);

      if (ok) {
        incrementWriteCounter(target);
        written = true;
      } else {
        recordError(lastStorageError, "setRaw", namespacedKey, target);
      }
    }

    return written;
  }

  function setRaw(name, value, options = {}) {
    const namespacedKey = key(name);
    const opts = isObject(options) ? options : {};
    const requestedKind = resolveKindFromOptions(opts);

    stats.set += 1;
    touch("setRaw", namespacedKey, requestedKind);

    if (shouldRemoveOnSet(value)) {
      return remove(name, opts);
    }

    const raw = String(value ?? "");

    if (!raw || isCorruptedRawValue(raw)) {
      return remove(name, opts);
    }

    return writeRawToRequestedTargets(name, raw, opts);
  }

  function set(name, value, options = {}) {
    const namespacedKey = key(name);
    const opts = isObject(options) ? options : {};
    const requestedKind = resolveKindFromOptions(opts);

    stats.set += 1;
    touch("set", namespacedKey, requestedKind);

    if (shouldRemoveOnSet(value)) {
      return remove(name, opts);
    }

    const raw = safeJsonStringify(value, "");

    if (!raw || isCorruptedRawValue(raw)) {
      return false;
    }

    return writeRawToRequestedTargets(name, raw, opts);
  }

  function setJson(name, value, options = {}) {
    return set(name, value, options);
  }

  function remove(name, options = {}) {
    const namespacedKey = key(name);
    const opts = isObject(options) ? options : {};
    const requestedKind = resolveKindFromOptions(opts);

    stats.remove += 1;
    touch("remove", namespacedKey, requestedKind);

    const targets = resolveRemoveTargets(opts);

    for (const target of targets) {
      if (target === "memory") {
        removeFromMemory(namespacedKey);
        continue;
      }

      removeFromStorage(target, namespacedKey);
    }

    return true;
  }

  function has(name, options = {}) {
    const namespacedKey = key(name);
    const opts = isObject(options) ? options : {};
    const requestedKind = resolveKindFromOptions(opts);

    stats.has += 1;
    touch("has", namespacedKey, requestedKind);

    const targets = resolveReadTargets(opts);

    for (const target of targets) {
      if (target === "memory") {
        if (memoryStorage.has(namespacedKey)) {
          const raw = memoryStorage.get(namespacedKey);

          if (!isCorruptedRawValue(raw)) {
            return true;
          }
        }

        continue;
      }

      const storage = getUsableStorage(target);

      if (!storage) {
        continue;
      }

      try {
        const raw = storage.getItem(namespacedKey);
        incrementReadCounter(target);

        if (raw !== null && raw !== undefined && !isCorruptedRawValue(raw)) {
          return true;
        }
      } catch (error) {
        recordError(error, "has", namespacedKey, target);
      }
    }

    return false;
  }

  function keys(options = {}) {
    const opts = isObject(options) ? options : {};
    const requestedKind = resolveKindFromOptions(opts);
    const includeValues = Boolean(opts.includeValues);
    const stripPrefix = Boolean(opts.stripPrefix);

    const rawPrefix = opts.prefix ? namespacePrefix(opts.prefix) : getPrefix();

    stats.keys += 1;
    touch("keys", rawPrefix, requestedKind);

    const output = [];

    function pushKey(currentKey, valueGetter = null) {
      const visibleKey = stripPrefix ? stripCurrentPrefix(currentKey) : currentKey;

      const exists = output.some((item) =>
        typeof item === "string"
          ? item === visibleKey
          : item.key === visibleKey || item.namespacedKey === currentKey
      );

      if (exists) {
        return;
      }

      if (includeValues) {
        let raw = "";

        try {
          raw = isFunction(valueGetter) ? valueGetter() : "";
        } catch {
          raw = "";
        }

        output.push({
          key: visibleKey,
          namespacedKey: currentKey,
          value: sanitizeSnapshotValue(currentKey, raw),
        });
      } else {
        output.push(visibleKey);
      }
    }

    const kindsToRead =
      requestedKind === "memory"
        ? ["memory"]
        : opts.all === true
          ? ["local", "session", "memory"]
          : unique([
              requestedKind,
              opts.sessionAlso === true ? "session" : "",
              opts.localAlso === true ? "local" : "",
              opts.memoryAlso === false ? "" : "memory",
            ]);

    for (const kind of kindsToRead) {
      if (kind === "memory") {
        for (const currentKey of memoryStorage.keys()) {
          if (currentKey.startsWith(rawPrefix)) {
            pushKey(currentKey, () => memoryStorage.get(currentKey));
          }
        }

        continue;
      }

      const storage = getStorageObject(kind);
      const backendKeys = collectStorageKeys(storage, (currentKey) =>
        currentKey.startsWith(rawPrefix)
      );

      for (const currentKey of backendKeys) {
        pushKey(currentKey, () => storage.getItem(currentKey));
      }
    }

    return output;
  }

  function entries(options = {}) {
    return keys({
      ...options,
      includeValues: true,
    });
  }

  function clearNamespace(namespace = "", options = {}) {
    const opts = isObject(options) ? options : {};
    const prefix = namespace ? namespacePrefix(namespace) : getPrefix();
    const requestedKind = resolveKindFromOptions(opts);

    const kindsToClear =
      opts.all === true
        ? ["local", "session", "memory"]
        : requestedKind === "memory"
          ? ["memory"]
          : unique([
              requestedKind,
              opts.sessionAlso === true ? "session" : "",
              opts.localAlso === true ? "local" : "",
              opts.memoryAlso === false ? "" : "memory",
            ]);

    let removed = 0;

    stats.clear += 1;
    touch("clearNamespace", prefix, requestedKind);

    for (const kind of kindsToClear) {
      if (kind === "memory") {
        for (const currentKey of Array.from(memoryStorage.keys())) {
          if (currentKey.startsWith(prefix)) {
            memoryStorage.delete(currentKey);
            removed += 1;
          }
        }

        continue;
      }

      const storage = getStorageObject(kind);
      const keysToRemove = collectStorageKeys(storage, (currentKey) =>
        currentKey.startsWith(prefix)
      );

      for (const currentKey of keysToRemove) {
        try {
          storage.removeItem(currentKey);
          removed += 1;
        } catch (error) {
          recordError(error, "clearNamespace", currentKey, kind);
        }
      }
    }

    const result = {
      ok: true,
      removed,
      prefix,
      kind: requestedKind,
    };

    safeEmit(events, STORAGE_EVENTS.cleared, {
      ...result,
      at: safeIsoDate(),
    });

    return result;
  }

  function clearAll(options = {}) {
    const opts = isObject(options) ? options : {};
    const includeLegacy = opts.includeLegacy === true;

    const result = clearNamespace("", {
      ...opts,
      all: opts.all !== false,
    });

    let removed = result.removed || 0;

    if (includeLegacy) {
      removed += removeLegacySessionKeys(utils, events);
    }

    return {
      ...result,
      removed,
      includeLegacy,
    };
  }

  function repairCorrupted(options = {}) {
    const opts = isObject(options) ? options : {};
    const requestedKind = resolveKindFromOptions(opts);
    const prefix = opts.prefix ? namespacePrefix(opts.prefix) : getPrefix();

    const kindsToRepair =
      opts.all === true
        ? ["local", "session", "memory"]
        : requestedKind === "memory"
          ? ["memory"]
          : unique([
              requestedKind,
              opts.sessionAlso === true ? "session" : "",
              opts.localAlso === true ? "local" : "",
              opts.memoryAlso === false ? "" : "memory",
            ]);

    let repaired = 0;

    stats.repair += 1;
    touch("repairCorrupted", prefix, requestedKind);

    for (const kind of kindsToRepair) {
      if (kind === "memory") {
        for (const [currentKey, raw] of Array.from(memoryStorage.entries())) {
          if (currentKey.startsWith(prefix) && isCorruptedRawValue(raw)) {
            memoryStorage.delete(currentKey);
            repaired += 1;
          }
        }

        continue;
      }

      const storage = getStorageObject(kind);
      const keysToCheck = collectStorageKeys(storage, (currentKey) =>
        currentKey.startsWith(prefix)
      );

      for (const currentKey of keysToCheck) {
        try {
          const raw = storage.getItem(currentKey);

          if (isCorruptedRawValue(raw)) {
            storage.removeItem(currentKey);
            repaired += 1;
          }
        } catch (error) {
          recordError(error, "repairCorrupted", currentKey, kind);
        }
      }
    }

    const result = {
      ok: true,
      repaired,
      prefix,
      kind: requestedKind,
    };

    safeEmit(events, STORAGE_EVENTS.repaired, {
      ...result,
      at: safeIsoDate(),
    });

    return result;
  }

  function migrateLegacyKey(legacyKey = "", currentKey = "", options = {}) {
    const fromKey = safeText(legacyKey, "");
    const toKey = safeText(currentKey, "");
    const opts = isObject(options) ? options : {};

    if (
      !fromKey ||
      !toKey ||
      isCurrentNamespacedKey(fromKey) ||
      isPreferenceLikeKey(fromKey)
    ) {
      return false;
    }

    const requestedKind = resolveKindFromOptions(opts);

    const readKinds =
      opts.all === true
        ? ["local", "session", "memory"]
        : requestedKind === "memory"
          ? ["memory"]
          : unique([
              requestedKind,
              opts.fallbackSession === false ? "" : "session",
              opts.fallbackLocal === true ? "local" : "",
              opts.memoryAlso === false ? "" : "memory",
            ]);

    let raw;
    let sourceKind = "";

    for (const kind of readKinds) {
      if (kind === "memory") {
        if (memoryStorage.has(fromKey)) {
          raw = memoryStorage.get(fromKey);
          sourceKind = "memory";
          break;
        }

        continue;
      }

      const storage = getStorageObject(kind);

      try {
        const candidate = storage?.getItem?.(fromKey);

        if (candidate !== null && candidate !== undefined) {
          raw = candidate;
          sourceKind = kind;
          break;
        }
      } catch (error) {
        recordError(error, "migrateLegacyKey:read", fromKey, kind);
      }
    }

    if (raw === null || raw === undefined || isCorruptedRawValue(raw)) {
      return false;
    }

    const ok = setRaw(toKey, raw, opts);

    if (ok && opts.removeLegacy !== false) {
      try {
        if (sourceKind === "memory") {
          memoryStorage.delete(fromKey);
        } else {
          getStorageObject(sourceKind)?.removeItem?.(fromKey);
        }
      } catch {}
    }

    if (ok) {
      stats.migrate += 1;

      safeEmit(events, STORAGE_EVENTS.migrated, {
        from: sanitizeSnapshotValue(fromKey, fromKey),
        to: sanitizeSnapshotValue(key(toKey), key(toKey)),
        sourceKind,
        kind: requestedKind,
        removedLegacy: opts.removeLegacy !== false,
        at: safeIsoDate(),
      });
    }

    return ok;
  }

  function getSnapshot(options = {}) {
    const opts = isObject(options) ? options : {};
    const includeKeys = opts.includeKeys !== false;
    const includeValues = opts.includeValues === true;

    return {
      version: STORAGE_VERSION,
      browser: isBrowser(),

      prefix: getPrefix(),
      prefixRaw: getPrefixRaw(),

      localStorageAvailable: testStorageAvailability("local"),
      sessionStorageAvailable: testStorageAvailability("session"),
      memoryFallbackSize: memoryStorage.size,

      knownLegacyKeys: opts.includeLegacyKeys === true ? getLegacyKeys() : [],

      keys: includeKeys
        ? keys({
            all: true,
            includeValues,
          })
        : [],

      stats: sanitizeStats(stats),

      lastError: sanitizeError(lastStorageError),

      events: STORAGE_EVENTS,

      at: safeIsoDate(),
    };
  }

  safeLog(utils, "Storage ready.", {
    version: STORAGE_VERSION,
    prefix: getPrefix(),
    local: testStorageAvailability("local"),
    session: testStorageAvailability("session"),
  });

  safeEmit(events, STORAGE_EVENTS.ready, {
    version: STORAGE_VERSION,
    prefix: getPrefix(),
    localStorageAvailable: testStorageAvailability("local"),
    sessionStorageAvailable: testStorageAvailability("session"),
    at: safeIsoDate(),
  });

  if (!testStorageAvailability("local") && !testStorageAvailability("session")) {
    safeEmit(events, STORAGE_EVENTS.unavailable, {
      memoryFallback: true,
      error: sanitizeError(lastStorageError),
      at: safeIsoDate(),
    });
  }

  return {
    version: STORAGE_VERSION,

    prefix: getPrefix(),
    prefixRaw: getPrefixRaw(),

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

    removeLegacySessionKeys() {
      return removeLegacySessionKeys(utils, events);
    },

    resetStorageAvailabilityCache,

    getSnapshot,
    getDebugSnapshot: getSnapshot,
    snapshot: getSnapshot,
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
