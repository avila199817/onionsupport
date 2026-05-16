/* =========================================================
   Onion SPA - Core Storage
   Archivo: src/core/storage.js

   CORE STORAGE · CLEAN
   - localStorage/sessionStorage namespaced
   - fallback memory
   - nunca usa localStorage.clear()
   - nunca usa sessionStorage.clear()
   - removeLegacySessionKeys no borra preferencias/UI
   - keys/snapshots/eventos sin tokens reales
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

export const STORAGE_VERSION = "18.0.0-clean";

export const STORAGE_EVENTS = Object.freeze({
  ready: "app:core:storage:ready",
  unavailable: "app:core:storage:unavailable",
  error: "app:core:storage:error",
  repaired: "app:core:storage:repaired",
  cleared: "app:core:storage:cleared",
  legacyCleared: "app:core:storage:legacy-cleared",
  migrated: "app:core:storage:migrated",
});

const DEFAULT_PREFIX = "onion";
const DEFAULT_KIND = "local";
const TEST_KEY = "__storage_test__";

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
]);

/* =========================================================
   MODULE MEMORY
========================================================= */

const memoryStorage = new Map();

const availability = {
  local: null,
  session: null,
};

let lastStorageError = null;

/* =========================================================
   BASICS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

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

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  if (value === null || value === undefined) return [];
  return [value];
}

function unique(values = []) {
  const output = [];
  const seen = new Set();

  for (const value of toArray(values).flat(Infinity)) {
    const text = safeText(value, "");

    if (!text || seen.has(text)) continue;

    seen.add(text);
    output.push(text);
  }

  return output;
}

function normalizeKind(kind = DEFAULT_KIND) {
  const clean = safeLower(kind, DEFAULT_KIND);
  return VALID_KINDS.includes(clean) ? clean : DEFAULT_KIND;
}

function isCorruptedRaw(raw) {
  return CORRUPTED_RAW_VALUES.includes(String(raw ?? "").trim());
}

function shouldRemoveOnSet(value) {
  return value === undefined || value === null;
}

/* =========================================================
   REDACTION / EVENTS
========================================================= */

function redact(value = "") {
  try {
    return redactTokenInText(String(value ?? ""));
  } catch {
    return String(value ?? "");
  }
}

function sanitizeValue(key = "", value = "") {
  if (SENSITIVE_KEY_RE.test(key)) {
    return value ? "***" : null;
  }

  return redact(value);
}

function sanitizePayload(value, depth = 0, keyHint = "") {
  if (depth > 4) return "[depth-limit]";

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

  if (typeof value === "string") return redact(value);
  if (typeof value === "function") return "[function]";

  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) => sanitizePayload(item, depth + 1, keyHint));
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      output[key] = sanitizePayload(item, depth + 1, key);
    }

    return output;
  }

  try {
    return redact(String(value));
  } catch {
    return "[unserializable]";
  }
}

function sanitizeError(error = null) {
  if (!error) return null;

  return {
    name: safeText(error?.name, "StorageError"),
    message: redact(error?.message || error || "Storage error"),
  };
}

function safeWarn(utils, ...args) {
  try {
    utils?.warn?.("[Storage]", ...args.map((item) => sanitizePayload(item)));
  } catch {}

  try {
    if (config?.debug) {
      console.warn("[Storage]", ...args.map((item) => sanitizePayload(item)));
    }
  } catch {}
}

function safeLog(utils, ...args) {
  try {
    utils?.log?.("[Storage]", ...args.map((item) => sanitizePayload(item)));
  } catch {}

  try {
    if (config?.debug) {
      console.log("[Storage]", ...args.map((item) => sanitizePayload(item)));
    }
  } catch {}
}

function safeEmit(events, eventName, payload = {}) {
  const name = safeText(eventName, "");

  if (!name) return false;

  const cleanPayload = sanitizePayload(payload);

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

/* =========================================================
   KEYS
========================================================= */

function prefixRaw() {
  return (
    safeText(
      config?.storagePrefix ||
        config?.appKey ||
        config?.appId ||
        DEFAULT_PREFIX,
      DEFAULT_PREFIX
    )
      .replace(/^:+|:+$/g, "") ||
    DEFAULT_PREFIX
  );
}

function prefix() {
  return `${prefixRaw()}:`;
}

function cleanKey(key = "") {
  return safeText(key, "").replace(/^:+/g, "").trim();
}

function isNamespacedKey(key = "") {
  return safeText(key, "").startsWith(prefix());
}

function namespacedKey(key = "") {
  const clean = cleanKey(key);

  if (!clean) {
    return prefix().replace(/:$/g, "");
  }

  if (isNamespacedKey(clean)) {
    return clean;
  }

  try {
    const built = buildStorageKey(clean);

    if (safeText(built, "") && isNamespacedKey(built)) {
      return built;
    }
  } catch {}

  return `${prefix()}${clean}`;
}

function stripPrefix(key = "") {
  const text = safeText(key, "");
  return text.startsWith(prefix()) ? text.slice(prefix().length) : text;
}

function namespacePrefix(namespace = "") {
  if (!namespace) return prefix();

  const key = namespacedKey(namespace);
  return key.endsWith(":") ? key : `${key}:`;
}

/* =========================================================
   STORAGE BACKENDS
========================================================= */

function backend(kind = DEFAULT_KIND) {
  if (!isBrowser()) return null;

  const finalKind = normalizeKind(kind);

  try {
    if (finalKind === "local") return window.localStorage || null;
    if (finalKind === "session") return window.sessionStorage || null;
  } catch (error) {
    lastStorageError = error;
  }

  return null;
}

function storageAvailable(kind = DEFAULT_KIND) {
  const finalKind = normalizeKind(kind);

  if (finalKind === "memory") return true;

  if (availability[finalKind] !== null) {
    return availability[finalKind];
  }

  const storage = backend(finalKind);

  if (!storage) {
    availability[finalKind] = false;
    return false;
  }

  const testKey = `${prefix()}${TEST_KEY}:${finalKind}`;

  try {
    storage.setItem(testKey, "1");
    storage.removeItem(testKey);

    availability[finalKind] = true;
    return true;
  } catch (error) {
    lastStorageError = error;
    availability[finalKind] = false;
    return false;
  }
}

function resetStorageAvailabilityCache() {
  availability.local = null;
  availability.session = null;
  return true;
}

function usableBackend(kind = DEFAULT_KIND) {
  const finalKind = normalizeKind(kind);

  if (finalKind === "memory") return null;
  if (!storageAvailable(finalKind)) return null;

  return backend(finalKind);
}

function rawRead(kind, key, fallback = undefined) {
  if (kind === "memory") {
    if (!memoryStorage.has(key)) return fallback;

    const raw = memoryStorage.get(key);
    return raw === undefined || raw === null || isCorruptedRaw(raw) ? fallback : raw;
  }

  const storage = usableBackend(kind);

  if (!storage) return fallback;

  try {
    const raw = storage.getItem(key);
    return raw === null || raw === undefined || isCorruptedRaw(raw) ? fallback : raw;
  } catch (error) {
    lastStorageError = error;
    return fallback;
  }
}

function rawWrite(kind, key, raw) {
  if (kind === "memory") {
    if (raw === null || raw === undefined) {
      memoryStorage.delete(key);
      return true;
    }

    memoryStorage.set(key, String(raw));
    return true;
  }

  const storage = usableBackend(kind);

  if (!storage) return false;

  try {
    storage.setItem(key, String(raw));
    return true;
  } catch (error) {
    lastStorageError = error;
    return false;
  }
}

function rawRemove(kind, key) {
  if (kind === "memory") {
    memoryStorage.delete(key);
    return true;
  }

  const storage = backend(kind);

  if (!storage) return false;

  try {
    storage.removeItem(key);
    return true;
  } catch (error) {
    lastStorageError = error;
    return false;
  }
}

function storageHasRawKey(kind, key) {
  if (kind === "memory") {
    if (!memoryStorage.has(key)) return false;

    const raw = memoryStorage.get(key);
    return raw !== undefined && raw !== null && !isCorruptedRaw(raw);
  }

  const storage = usableBackend(kind);

  if (!storage) return false;

  try {
    const raw = storage.getItem(key);
    return raw !== null && raw !== undefined && !isCorruptedRaw(raw);
  } catch {
    return false;
  }
}

/* =========================================================
   OPTIONS
========================================================= */

function kindFromOptions(options = {}) {
  const opts = isObject(options) ? options : {};

  if (opts.memory === true || opts.memoryOnly === true) return "memory";
  if (opts.session === true || opts.sessionOnly === true) return "session";
  if (opts.local === true || opts.localOnly === true) return "local";

  return normalizeKind(opts.kind || opts.storage || DEFAULT_KIND);
}

function readTargets(options = {}) {
  const opts = isObject(options) ? options : {};
  const kind = kindFromOptions(opts);

  if (opts.all === true) return ["local", "session", "memory"];
  if (kind === "memory") return ["memory"];

  if (kind === "session") {
    return unique([
      "session",
      opts.fallbackLocal === true ? "local" : "",
      opts.memoryAlso === false ? "" : "memory",
    ]);
  }

  return unique([
    "local",
    opts.fallbackSession === false || opts.localOnly === true ? "" : "session",
    opts.memoryAlso === false ? "" : "memory",
  ]);
}

function writeTargets(options = {}) {
  const opts = isObject(options) ? options : {};
  const kind = kindFromOptions(opts);

  if (opts.all === true) return ["local", "session", "memory"];
  if (kind === "memory") return ["memory"];

  if (kind === "session") {
    return unique([
      "session",
      opts.localAlso === true ? "local" : "",
      opts.memoryAlso === false ? "" : "memory",
    ]);
  }

  return unique([
    "local",
    opts.sessionAlso === true ? "session" : "",
    opts.memoryAlso === false ? "" : "memory",
  ]);
}

function removeTargets(options = {}) {
  const opts = isObject(options) ? options : {};
  const kind = kindFromOptions(opts);

  if (opts.all === true) return ["local", "session", "memory"];
  if (kind === "memory") return ["memory"];

  if (opts.localOnly === true) {
    return unique(["local", opts.memoryAlso === false ? "" : "memory"]);
  }

  if (opts.sessionOnly === true) {
    return unique(["session", opts.memoryAlso === false ? "" : "memory"]);
  }

  return unique(["local", "session", "memory"]);
}

/* =========================================================
   JSON
========================================================= */

function stringify(value, fallback = "") {
  try {
    return safeStringify(value, fallback);
  } catch {}

  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function parseJson(raw, fallback = null) {
  if (raw === null || raw === undefined || isCorruptedRaw(raw)) {
    return fallback;
  }

  try {
    return safeParse(raw, fallback);
  } catch {}

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function parseValue(raw, fallback = null) {
  if (raw === null || raw === undefined || isCorruptedRaw(raw)) {
    return fallback;
  }

  const parsed = parseJson(raw, undefined);
  return parsed === undefined ? raw : parsed;
}

/* =========================================================
   KEY COLLECTION
========================================================= */

function storageLength(storage) {
  try {
    return safeNumber(storage?.length, 0);
  } catch {
    return 0;
  }
}

function collectKeysFromStorage(storage, predicate = () => true) {
  const output = [];

  if (!storage) return output;

  const length = storageLength(storage);

  try {
    for (let index = 0; index < length; index += 1) {
      const key = storage.key(index);

      if (key && predicate(key)) {
        output.push(key);
      }
    }
  } catch {}

  return output;
}

/* =========================================================
   LEGACY CLEANUP
========================================================= */

function configuredLegacyKeys() {
  const legacy = config?.legacyStorageKeys;

  if (!legacy) return [];

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

function isPreferenceKey(key = "") {
  return PREFERENCE_KEY_RE.test(safeText(key, ""));
}

function legacyKeys() {
  return unique([
    ...configuredLegacyKeys(),
    ...LEGACY_EXTRA_KEYS,
  ]).filter((key) => {
    if (!key) return false;
    if (isNamespacedKey(key)) return false;
    if (isPreferenceKey(key)) return false;
    return true;
  });
}

function shouldRemoveLegacyKey(key = "") {
  const clean = safeText(key, "");

  if (!clean) return false;
  if (isNamespacedKey(clean)) return false;
  if (isPreferenceKey(clean)) return false;

  return (
    legacyKeys().includes(clean) ||
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
  const explicitKeys = legacyKeys();
  let removed = 0;

  for (const kind of ["local", "session"]) {
    const storage = backend(kind);

    if (!storage) continue;

    const scannedKeys = collectKeysFromStorage(storage, shouldRemoveLegacyKey);
    const keys = unique([...explicitKeys, ...scannedKeys]);

    for (const key of keys) {
      if (!key || isNamespacedKey(key) || isPreferenceKey(key)) continue;

      try {
        if (storage.getItem(key) === null) continue;

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
   FACTORY
========================================================= */

export function createStorage(input = {}) {
  const deps = isObject(input) ? input : { utils: input };

  const utils =
    deps.utils ||
    deps.logger ||
    null;

  const events =
    deps.events ||
    deps.bus ||
    deps.eventBus ||
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

    memoryReads: 0,
    memoryWrites: 0,
    localReads: 0,
    localWrites: 0,
    sessionReads: 0,
    sessionWrites: 0,

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
    if (!error) return;

    stats.errors += 1;
    lastStorageError = error;

    touch(operation, key, kind);

    safeWarn(utils, `Storage error en ${operation}: ${key}`, {
      kind,
      error: sanitizeError(error),
    });

    safeEmit(events, STORAGE_EVENTS.error, {
      operation,
      key: sanitizeValue(key, key),
      kind,
      error: sanitizeError(error),
      at: safeIsoDate(),
    });
  }

  function countRead(kind) {
    if (kind === "local") stats.localReads += 1;
    else if (kind === "session") stats.sessionReads += 1;
    else stats.memoryReads += 1;
  }

  function countWrite(kind) {
    if (kind === "local") stats.localWrites += 1;
    else if (kind === "session") stats.sessionWrites += 1;
    else stats.memoryWrites += 1;
  }

  function key(name = "") {
    return namespacedKey(name);
  }

  function getRaw(name, fallback = null, options = {}) {
    const finalKey = key(name);
    const kind = kindFromOptions(options);

    stats.get += 1;
    touch("getRaw", finalKey, kind);

    for (const target of readTargets(options)) {
      countRead(target);

      const raw = rawRead(target, finalKey, undefined);

      if (raw !== undefined) {
        if (target !== "memory" && options?.memoryAlso !== false) {
          rawWrite("memory", finalKey, raw);
        }

        return raw;
      }
    }

    return fallback;
  }

  function get(name, fallback = null, options = {}) {
    const raw = getRaw(name, undefined, options);
    return raw === undefined ? fallback : parseValue(raw, fallback);
  }

  function getJson(name, fallback = null, options = {}) {
    const raw = getRaw(name, undefined, options);
    return raw === undefined ? fallback : parseJson(raw, fallback);
  }

  function writeRaw(name, raw, options = {}) {
    const finalKey = key(name);
    let written = false;

    for (const target of writeTargets(options)) {
      const ok = rawWrite(target, finalKey, raw);

      if (ok) {
        countWrite(target);
        written = true;
      } else {
        recordError(lastStorageError, "setRaw", finalKey, target);
      }
    }

    return written;
  }

  function setRaw(name, value, options = {}) {
    const finalKey = key(name);
    const kind = kindFromOptions(options);

    stats.set += 1;
    touch("setRaw", finalKey, kind);

    if (shouldRemoveOnSet(value)) {
      return remove(name, options);
    }

    const raw = String(value ?? "");

    if (!raw || isCorruptedRaw(raw)) {
      return remove(name, options);
    }

    return writeRaw(name, raw, options);
  }

  function set(name, value, options = {}) {
    const finalKey = key(name);
    const kind = kindFromOptions(options);

    stats.set += 1;
    touch("set", finalKey, kind);

    if (shouldRemoveOnSet(value)) {
      return remove(name, options);
    }

    const raw = stringify(value, "");

    if (!raw || isCorruptedRaw(raw)) {
      return false;
    }

    return writeRaw(name, raw, options);
  }

  function setJson(name, value, options = {}) {
    return set(name, value, options);
  }

  function remove(name, options = {}) {
    const finalKey = key(name);
    const kind = kindFromOptions(options);

    stats.remove += 1;
    touch("remove", finalKey, kind);

    for (const target of removeTargets(options)) {
      rawRemove(target, finalKey);
    }

    return true;
  }

  function has(name, options = {}) {
    const finalKey = key(name);
    const kind = kindFromOptions(options);

    stats.has += 1;
    touch("has", finalKey, kind);

    for (const target of readTargets(options)) {
      countRead(target);

      if (storageHasRawKey(target, finalKey)) {
        return true;
      }
    }

    return false;
  }

  function keys(options = {}) {
    const opts = isObject(options) ? options : {};
    const kind = kindFromOptions(opts);
    const includeValues = opts.includeValues === true;
    const strip = opts.stripPrefix === true;
    const targetPrefix = opts.prefix ? namespacePrefix(opts.prefix) : prefix();

    stats.keys += 1;
    touch("keys", targetPrefix, kind);

    const result = [];
    const seen = new Set();

    function push(currentKey, rawGetter = null) {
      if (!currentKey || !currentKey.startsWith(targetPrefix)) return;

      const visibleKey = strip ? stripPrefix(currentKey) : currentKey;

      if (seen.has(visibleKey)) return;

      seen.add(visibleKey);

      if (!includeValues) {
        result.push(visibleKey);
        return;
      }

      let raw = "";

      try {
        raw = isFunction(rawGetter) ? rawGetter() : "";
      } catch {
        raw = "";
      }

      result.push({
        key: visibleKey,
        namespacedKey: currentKey,
        value: sanitizeValue(currentKey, raw),
      });
    }

    const targets =
      opts.all === true
        ? ["local", "session", "memory"]
        : kind === "memory"
          ? ["memory"]
          : unique([
              kind,
              opts.sessionAlso === true ? "session" : "",
              opts.localAlso === true ? "local" : "",
              opts.memoryAlso === false ? "" : "memory",
            ]);

    for (const target of targets) {
      if (target === "memory") {
        for (const currentKey of memoryStorage.keys()) {
          push(currentKey, () => memoryStorage.get(currentKey));
        }

        continue;
      }

      const storage = backend(target);
      const collected = collectKeysFromStorage(storage, (currentKey) =>
        currentKey.startsWith(targetPrefix)
      );

      for (const currentKey of collected) {
        push(currentKey, () => storage.getItem(currentKey));
      }
    }

    return result;
  }

  function entries(options = {}) {
    return keys({
      ...options,
      includeValues: true,
    });
  }

  function clearNamespace(namespace = "", options = {}) {
    const opts = isObject(options) ? options : {};
    const targetPrefix = namespace ? namespacePrefix(namespace) : prefix();
    const kind = kindFromOptions(opts);

    stats.clear += 1;
    touch("clearNamespace", targetPrefix, kind);

    const targets =
      opts.all === true
        ? ["local", "session", "memory"]
        : kind === "memory"
          ? ["memory"]
          : unique([
              kind,
              opts.sessionAlso === true ? "session" : "",
              opts.localAlso === true ? "local" : "",
              opts.memoryAlso === false ? "" : "memory",
            ]);

    let removed = 0;

    for (const target of targets) {
      if (target === "memory") {
        for (const currentKey of Array.from(memoryStorage.keys())) {
          if (currentKey.startsWith(targetPrefix)) {
            memoryStorage.delete(currentKey);
            removed += 1;
          }
        }

        continue;
      }

      const storage = backend(target);
      const toRemove = collectKeysFromStorage(storage, (currentKey) =>
        currentKey.startsWith(targetPrefix)
      );

      for (const currentKey of toRemove) {
        try {
          storage.removeItem(currentKey);
          removed += 1;
        } catch (error) {
          recordError(error, "clearNamespace", currentKey, target);
        }
      }
    }

    const result = {
      ok: true,
      removed,
      prefix: targetPrefix,
      kind,
    };

    safeEmit(events, STORAGE_EVENTS.cleared, {
      ...result,
      at: safeIsoDate(),
    });

    return result;
  }

  function clearAll(options = {}) {
    const opts = isObject(options) ? options : {};

    const result = clearNamespace("", {
      ...opts,
      all: opts.all !== false,
    });

    let removed = result.removed || 0;

    if (opts.includeLegacy === true) {
      removed += removeLegacySessionKeys(utils, events);
    }

    return {
      ...result,
      removed,
      includeLegacy: opts.includeLegacy === true,
    };
  }

  function repairCorrupted(options = {}) {
    const opts = isObject(options) ? options : {};
    const kind = kindFromOptions(opts);
    const targetPrefix = opts.prefix ? namespacePrefix(opts.prefix) : prefix();

    stats.repair += 1;
    touch("repairCorrupted", targetPrefix, kind);

    const targets =
      opts.all === true
        ? ["local", "session", "memory"]
        : kind === "memory"
          ? ["memory"]
          : unique([
              kind,
              opts.sessionAlso === true ? "session" : "",
              opts.localAlso === true ? "local" : "",
              opts.memoryAlso === false ? "" : "memory",
            ]);

    let repaired = 0;

    for (const target of targets) {
      if (target === "memory") {
        for (const [currentKey, raw] of Array.from(memoryStorage.entries())) {
          if (currentKey.startsWith(targetPrefix) && isCorruptedRaw(raw)) {
            memoryStorage.delete(currentKey);
            repaired += 1;
          }
        }

        continue;
      }

      const storage = backend(target);
      const toCheck = collectKeysFromStorage(storage, (currentKey) =>
        currentKey.startsWith(targetPrefix)
      );

      for (const currentKey of toCheck) {
        try {
          const raw = storage.getItem(currentKey);

          if (isCorruptedRaw(raw)) {
            storage.removeItem(currentKey);
            repaired += 1;
          }
        } catch (error) {
          recordError(error, "repairCorrupted", currentKey, target);
        }
      }
    }

    const result = {
      ok: true,
      repaired,
      prefix: targetPrefix,
      kind,
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
      isNamespacedKey(fromKey) ||
      isPreferenceKey(fromKey)
    ) {
      return false;
    }

    const kind = kindFromOptions(opts);

    const targets =
      opts.all === true
        ? ["local", "session", "memory"]
        : kind === "memory"
          ? ["memory"]
          : unique([
              kind,
              opts.fallbackSession === false ? "" : "session",
              opts.fallbackLocal === true ? "local" : "",
              opts.memoryAlso === false ? "" : "memory",
            ]);

    let raw;
    let sourceKind = "";

    for (const target of targets) {
      if (target === "memory") {
        if (memoryStorage.has(fromKey)) {
          raw = memoryStorage.get(fromKey);
          sourceKind = "memory";
          break;
        }

        continue;
      }

      const storage = backend(target);

      try {
        const candidate = storage?.getItem?.(fromKey);

        if (candidate !== null && candidate !== undefined) {
          raw = candidate;
          sourceKind = target;
          break;
        }
      } catch (error) {
        recordError(error, "migrateLegacyKey:read", fromKey, target);
      }
    }

    if (raw === null || raw === undefined || isCorruptedRaw(raw)) {
      return false;
    }

    const ok = setRaw(toKey, raw, opts);

    if (ok && opts.removeLegacy !== false) {
      try {
        if (sourceKind === "memory") {
          memoryStorage.delete(fromKey);
        } else {
          backend(sourceKind)?.removeItem?.(fromKey);
        }
      } catch {}
    }

    if (ok) {
      stats.migrate += 1;

      safeEmit(events, STORAGE_EVENTS.migrated, {
        from: sanitizeValue(fromKey, fromKey),
        to: sanitizeValue(key(toKey), key(toKey)),
        sourceKind,
        kind,
        removedLegacy: opts.removeLegacy !== false,
        at: safeIsoDate(),
      });
    }

    return ok;
  }

  function getSnapshot(options = {}) {
    const opts = isObject(options) ? options : {};

    return {
      version: STORAGE_VERSION,
      browser: isBrowser(),

      prefix: prefix(),
      prefixRaw: prefixRaw(),

      localStorageAvailable: storageAvailable("local"),
      sessionStorageAvailable: storageAvailable("session"),
      memoryFallbackSize: memoryStorage.size,

      knownLegacyKeys: opts.includeLegacyKeys === true ? legacyKeys() : [],

      keys: opts.includeKeys === false
        ? []
        : keys({
            all: true,
            includeValues: opts.includeValues === true,
          }),

      stats: {
        ...stats,
        lastKey: sanitizeValue(stats.lastKey, stats.lastKey),
      },

      lastError: sanitizeError(lastStorageError),

      events: STORAGE_EVENTS,
      at: safeIsoDate(),
    };
  }

  safeLog(utils, "Storage ready.", {
    version: STORAGE_VERSION,
    prefix: prefix(),
    local: storageAvailable("local"),
    session: storageAvailable("session"),
  });

  safeEmit(events, STORAGE_EVENTS.ready, {
    version: STORAGE_VERSION,
    prefix: prefix(),
    localStorageAvailable: storageAvailable("local"),
    sessionStorageAvailable: storageAvailable("session"),
    at: safeIsoDate(),
  });

  if (!storageAvailable("local") && !storageAvailable("session")) {
    safeEmit(events, STORAGE_EVENTS.unavailable, {
      memoryFallback: true,
      error: sanitizeError(lastStorageError),
      at: safeIsoDate(),
    });
  }

  return {
    version: STORAGE_VERSION,

    prefix: prefix(),
    prefixRaw: prefixRaw(),

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
   DEFAULT EXPORT
========================================================= */

export default {
  STORAGE_VERSION,
  STORAGE_EVENTS,

  createStorage,
  removeLegacySessionKeys,
};
