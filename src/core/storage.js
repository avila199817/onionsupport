/* =========================================================
   Onion SPA - Core Storage
   Archivo: src/core/storage.js

   CORE STORAGE · SIMPLE
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

export const STORAGE_VERSION = "21.0.0-simple";

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

const VALID_KINDS = Object.freeze(["local", "session", "memory"]);

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

const SENSITIVE_KEY_RE = /(token|authorization|password|secret|session|otp|code|jwt|bearer|credential|cookie|csrf|xsrf|mfa|2fa)/i;
const SESSIONISH_KEY_RE = /(session|token|auth|user|role|rol|login|otp|mfa|2fa|post_login|postLogin|redirectAfterLogin|redirect_after_login)/i;
const PREFERENCE_KEY_RE = /(^|[:._-])(theme|themeMode|theme_mode|appearance|lang|language|locale|sidebar|sidebarOpen|sidebar_open|sidebarCollapsed|sidebar_collapsed|density|preferences|preferencias|settings|ui)([:._-]|$)/i;

const LEGACY_AUTH_KEYS = Object.freeze([
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
  "userId",
  "user_id",
  "userName",
  "user_name",
  "username",
  "userSlug",
  "user_slug",
  "role",
  "rol",
  "roles",
  "session",
  "sessionData",
  "sessionId",
  "session_id",
  "sessionUserId",
  "session_user_id",
  "auth",
  "postLoginTarget",
  "post_login_target",
  "redirectAfterLogin",
  "redirect_after_login",
]);

const LEGACY_PREFIXES = Object.freeze(["onion_", "onion.", "onion:"]);

const memoryStorage = new Map();
const availability = { local: null, session: null };
let lastStorageError = null;

/* =========================================================
   BASICS
========================================================= */

function text(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const output = String(value).trim();
  return output || fallback;
}

function lower(value, fallback = "") {
  return text(value, fallback).toLowerCase();
}

function object(value, fallback = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;

  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null ? value : fallback;
  } catch {
    return fallback;
  }
}

function isFn(value) {
  return typeof value === "function";
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function unique(values = []) {
  const output = [];
  const seen = new Set();

  for (const item of toArray(values).flat(Infinity)) {
    const clean = text(item, "");
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    output.push(clean);
  }

  return output;
}

function number(value, fallback = 0) {
  const output = Number(value);
  return Number.isFinite(output) ? output : fallback;
}

function nowIso(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function normalizeKind(kind = DEFAULT_KIND) {
  const clean = lower(kind, DEFAULT_KIND);
  return VALID_KINDS.includes(clean) ? clean : DEFAULT_KIND;
}

function corrupted(raw) {
  return CORRUPTED_RAW_VALUES.includes(String(raw ?? "").trim());
}

function shouldRemove(value) {
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

function safeKey(key = "") {
  const clean = text(key, "");
  return SENSITIVE_KEY_RE.test(clean) ? "***" : redact(clean);
}

function sanitizeValue(key = "", value = "") {
  if (SENSITIVE_KEY_RE.test(text(key, ""))) return value ? "***" : null;
  return redact(value);
}

function sanitizePayload(value, depth = 0, keyHint = "", seen = new WeakSet()) {
  if (depth > 4) return "[depth-limit]";
  if (SENSITIVE_KEY_RE.test(text(keyHint, ""))) return value ? "***" : null;
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return redact(value);
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return { name: value.name || "StorageError", message: redact(value.message || "Storage error") };
  }

  if (Array.isArray(value)) return value.slice(0, 80).map((item) => sanitizePayload(item, depth + 1, keyHint, seen));

  if (value && typeof value === "object") {
    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    const output = {};
    for (const [key, item] of Object.entries(value).slice(0, 120)) output[key] = sanitizePayload(item, depth + 1, key, seen);
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
  return { name: text(error?.name, "StorageError"), message: redact(error?.message || error || "Storage error") };
}

function emit(events, eventName, payload = {}) {
  const name = text(eventName, "");
  if (!name) return false;

  const cleanPayload = sanitizePayload(payload);

  for (const method of ["emit", "dispatch", "trigger"]) {
    try {
      if (isFn(events?.[method])) {
        events[method](name, cleanPayload);
        return true;
      }
    } catch {}
  }

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      document.dispatchEvent(new CustomEvent(name, { detail: cleanPayload }));
      return true;
    }
  } catch {}

  return false;
}

function warn(utils, ...args) {
  try {
    utils?.warn?.("[Storage]", ...args.map((item) => sanitizePayload(item)));
  } catch {}

  try {
    if (config?.debug) console.warn("[Storage]", ...args.map((item) => sanitizePayload(item)));
  } catch {}
}

function log(utils, ...args) {
  try {
    utils?.log?.("[Storage]", ...args.map((item) => sanitizePayload(item)));
  } catch {}

  try {
    if (config?.debug) console.log("[Storage]", ...args.map((item) => sanitizePayload(item)));
  } catch {}
}

/* =========================================================
   KEYS
========================================================= */

function prefixRaw() {
  return text(config?.storagePrefix || config?.appKey || config?.appId || DEFAULT_PREFIX, DEFAULT_PREFIX).replace(/^:+|:+$/g, "") || DEFAULT_PREFIX;
}

function prefix() {
  return `${prefixRaw()}:`;
}

function cleanKey(key = "") {
  return text(key, "").replace(/^:+/g, "").trim();
}

function isNamespacedKey(key = "") {
  return text(key, "").startsWith(prefix());
}

function namespacedKey(key = "") {
  const clean = cleanKey(key);
  if (!clean) return prefix().replace(/:$/g, "");
  if (isNamespacedKey(clean)) return clean;

  try {
    const built = buildStorageKey(clean);
    if (text(built, "") && isNamespacedKey(built)) return built;
  } catch {}

  return `${prefix()}${clean}`;
}

function stripPrefix(key = "") {
  const clean = text(key, "");
  return clean.startsWith(prefix()) ? clean.slice(prefix().length) : clean;
}

function namespacePrefix(namespace = "") {
  if (!namespace) return prefix();
  const key = namespacedKey(namespace);
  return key.endsWith(":") ? key : `${key}:`;
}

/* =========================================================
   BACKENDS
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
  if (availability[finalKind] !== null) return availability[finalKind];

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

export function resetStorageAvailabilityCache() {
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
    return raw === undefined || raw === null || corrupted(raw) ? fallback : raw;
  }

  const storage = usableBackend(kind);
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(key);
    return raw === null || raw === undefined || corrupted(raw) ? fallback : raw;
  } catch (error) {
    lastStorageError = error;
    return fallback;
  }
}

function rawWrite(kind, key, raw) {
  if (kind === "memory") {
    if (raw === null || raw === undefined) memoryStorage.delete(key);
    else memoryStorage.set(key, String(raw));
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

function hasRaw(kind, key) {
  if (kind === "memory") {
    if (!memoryStorage.has(key)) return false;
    const raw = memoryStorage.get(key);
    return raw !== undefined && raw !== null && !corrupted(raw);
  }

  const storage = usableBackend(kind);
  if (!storage) return false;

  try {
    const raw = storage.getItem(key);
    return raw !== null && raw !== undefined && !corrupted(raw);
  } catch {
    return false;
  }
}

/* =========================================================
   OPTIONS
========================================================= */

function kindFromOptions(options = {}) {
  const opts = object(options);
  if (opts.memory === true || opts.memoryOnly === true) return "memory";
  if (opts.session === true || opts.sessionOnly === true) return "session";
  if (opts.local === true || opts.localOnly === true) return "local";
  return normalizeKind(opts.kind || opts.storage || DEFAULT_KIND);
}

function readTargets(options = {}) {
  const opts = object(options);
  const kind = kindFromOptions(opts);

  if (opts.all === true) return ["local", "session", "memory"];
  if (kind === "memory") return ["memory"];
  if (kind === "session") return unique(["session", opts.fallbackLocal === true ? "local" : "", opts.memoryAlso === false ? "" : "memory"]);

  return unique(["local", opts.fallbackSession === false || opts.localOnly === true ? "" : "session", opts.memoryAlso === false ? "" : "memory"]);
}

function writeTargets(options = {}) {
  const opts = object(options);
  const kind = kindFromOptions(opts);

  if (opts.all === true) return ["local", "session", "memory"];
  if (kind === "memory") return ["memory"];
  if (kind === "session") return unique(["session", opts.localAlso === true ? "local" : "", opts.memoryAlso === false ? "" : "memory"]);

  return unique(["local", opts.sessionAlso === true ? "session" : "", opts.memoryAlso === false ? "" : "memory"]);
}

function removeTargets(options = {}) {
  const opts = object(options);
  const kind = kindFromOptions(opts);

  if (opts.all === true) return ["local", "session", "memory"];
  if (kind === "memory") return ["memory"];
  if (opts.localOnly === true) return unique(["local", opts.memoryAlso === false ? "" : "memory"]);
  if (opts.sessionOnly === true) return unique(["session", opts.memoryAlso === false ? "" : "memory"]);

  return ["local", "session", "memory"];
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
  if (raw === null || raw === undefined || corrupted(raw)) return fallback;

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
  if (raw === null || raw === undefined || corrupted(raw)) return fallback;
  const parsed = parseJson(raw, undefined);
  return parsed === undefined ? raw : parsed;
}

/* =========================================================
   KEY COLLECTION
========================================================= */

function storageLength(storage) {
  try {
    return number(storage?.length, 0);
  } catch {
    return 0;
  }
}

function collectKeysFromStorage(storage, predicate = () => true) {
  const output = [];
  if (!storage) return output;

  try {
    for (let index = 0; index < storageLength(storage); index += 1) {
      const key = storage.key(index);
      if (key && predicate(key)) output.push(key);
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

  if (Array.isArray(legacy)) return legacy.map((item) => text(item, "")).filter(Boolean);
  if (object(legacy, null)) return Object.values(legacy).flat().map((item) => text(item, "")).filter(Boolean);

  return [];
}

function isPreferenceKey(key = "") {
  return PREFERENCE_KEY_RE.test(text(key, ""));
}

function legacyKeys() {
  const prefixed = [];

  for (const item of LEGACY_AUTH_KEYS) {
    prefixed.push(item);
    for (const prefix of LEGACY_PREFIXES) prefixed.push(`${prefix}${item}`);
  }

  return unique([...configuredLegacyKeys(), ...prefixed]).filter((key) => key && !isNamespacedKey(key) && !isPreferenceKey(key));
}

function shouldRemoveLegacyKey(key = "") {
  const clean = text(key, "");
  if (!clean || isNamespacedKey(clean) || isPreferenceKey(clean)) return false;

  return legacyKeys().includes(clean) || (SESSIONISH_KEY_RE.test(clean) && (LEGACY_PREFIXES.some((prefix) => clean.startsWith(prefix)) || !clean.includes(":")));
}

export function removeLegacySessionKeys(utils = null, events = null) {
  const explicitKeys = legacyKeys();
  let removed = 0;

  for (const kind of ["local", "session"]) {
    const storage = backend(kind);
    if (!storage) continue;

    const keys = unique([...explicitKeys, ...collectKeysFromStorage(storage, shouldRemoveLegacyKey)]);

    for (const key of keys) {
      if (!key || isNamespacedKey(key) || isPreferenceKey(key)) continue;

      try {
        if (storage.getItem(key) === null) continue;
        storage.removeItem(key);
        removed += 1;
      } catch (error) {
        lastStorageError = error;
        warn(utils, "No se pudo borrar clave legacy.", key, sanitizeError(error));
      }
    }
  }

  for (const key of Array.from(memoryStorage.keys())) {
    if (shouldRemoveLegacyKey(key)) {
      memoryStorage.delete(key);
      removed += 1;
    }
  }

  emit(events, STORAGE_EVENTS.legacyCleared, { removed, at: nowIso() });
  return removed;
}

/* =========================================================
   FACTORY
========================================================= */

export function createStorage(input = {}) {
  const deps = object(input, { utils: input });
  const utils = deps.utils || deps.logger || null;
  const events = deps.events || deps.bus || deps.eventBus || null;

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
    stats.lastOperation = text(operation, "");
    stats.lastKey = text(key, "");
    stats.lastKind = text(kind, "");
    stats.lastAt = nowIso();
  }

  function recordError(error, operation = "", key = "", kind = "") {
    if (!error) return;

    stats.errors += 1;
    lastStorageError = error;
    touch(operation, key, kind);

    warn(utils, `Storage error en ${operation}: ${safeKey(key)}`, { kind, error: sanitizeError(error) });
    emit(events, STORAGE_EVENTS.error, { operation, key: safeKey(key), kind, error: sanitizeError(error), at: nowIso() });
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
        if (target !== "memory" && options?.memoryAlso !== false) rawWrite("memory", finalKey, raw);
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

    if (shouldRemove(value)) return remove(name, options);

    const raw = String(value ?? "");
    if (!raw || corrupted(raw)) return remove(name, options);

    return writeRaw(name, raw, options);
  }

  function set(name, value, options = {}) {
    const finalKey = key(name);
    const kind = kindFromOptions(options);

    stats.set += 1;
    touch("set", finalKey, kind);

    if (shouldRemove(value)) return remove(name, options);

    const raw = stringify(value, "");
    if (!raw || corrupted(raw)) return false;

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

    for (const target of removeTargets(options)) rawRemove(target, finalKey);
    return true;
  }

  function has(name, options = {}) {
    const finalKey = key(name);
    const kind = kindFromOptions(options);

    stats.has += 1;
    touch("has", finalKey, kind);

    for (const target of readTargets(options)) {
      countRead(target);
      if (hasRaw(target, finalKey)) return true;
    }

    return false;
  }

  function keys(options = {}) {
    const opts = object(options);
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
        raw = isFn(rawGetter) ? rawGetter() : "";
      } catch {}

      result.push({ key: visibleKey, namespacedKey: currentKey, value: sanitizeValue(currentKey, raw) });
    }

    const targets = opts.all === true ? ["local", "session", "memory"] : kind === "memory" ? ["memory"] : unique([kind, opts.sessionAlso === true ? "session" : "", opts.localAlso === true ? "local" : "", opts.memoryAlso === false ? "" : "memory"]);

    for (const target of targets) {
      if (target === "memory") {
        for (const currentKey of memoryStorage.keys()) push(currentKey, () => memoryStorage.get(currentKey));
        continue;
      }

      const storage = backend(target);
      for (const currentKey of collectKeysFromStorage(storage, (candidate) => candidate.startsWith(targetPrefix))) push(currentKey, () => storage.getItem(currentKey));
    }

    return result;
  }

  function entries(options = {}) {
    return keys({ ...options, includeValues: true });
  }

  function clearNamespace(namespace = "", options = {}) {
    const opts = object(options);
    const targetPrefix = namespace ? namespacePrefix(namespace) : prefix();
    const kind = kindFromOptions(opts);

    stats.clear += 1;
    touch("clearNamespace", targetPrefix, kind);

    const targets = opts.all === true ? ["local", "session", "memory"] : kind === "memory" ? ["memory"] : unique([kind, opts.sessionAlso === true ? "session" : "", opts.localAlso === true ? "local" : "", opts.memoryAlso === false ? "" : "memory"]);
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
      const toRemove = collectKeysFromStorage(storage, (currentKey) => currentKey.startsWith(targetPrefix));

      for (const currentKey of toRemove) {
        try {
          storage.removeItem(currentKey);
          removed += 1;
        } catch (error) {
          recordError(error, "clearNamespace", currentKey, target);
        }
      }
    }

    const result = { ok: true, removed, prefix: targetPrefix, kind };
    emit(events, STORAGE_EVENTS.cleared, { ...result, at: nowIso() });
    return result;
  }

  function clearAll(options = {}) {
    const opts = object(options);
    const result = clearNamespace("", { ...opts, all: opts.all !== false });
    let removed = result.removed || 0;

    if (opts.includeLegacy === true) removed += removeLegacySessionKeys(utils, events);

    return { ...result, removed, includeLegacy: opts.includeLegacy === true };
  }

  function repairCorrupted(options = {}) {
    const opts = object(options);
    const kind = kindFromOptions(opts);
    const targetPrefix = opts.prefix ? namespacePrefix(opts.prefix) : prefix();

    stats.repair += 1;
    touch("repairCorrupted", targetPrefix, kind);

    const targets = opts.all === true ? ["local", "session", "memory"] : kind === "memory" ? ["memory"] : unique([kind, opts.sessionAlso === true ? "session" : "", opts.localAlso === true ? "local" : "", opts.memoryAlso === false ? "" : "memory"]);
    let repaired = 0;

    for (const target of targets) {
      if (target === "memory") {
        for (const [currentKey, raw] of Array.from(memoryStorage.entries())) {
          if (currentKey.startsWith(targetPrefix) && corrupted(raw)) {
            memoryStorage.delete(currentKey);
            repaired += 1;
          }
        }
        continue;
      }

      const storage = backend(target);
      const toCheck = collectKeysFromStorage(storage, (currentKey) => currentKey.startsWith(targetPrefix));

      for (const currentKey of toCheck) {
        try {
          const raw = storage.getItem(currentKey);
          if (corrupted(raw)) {
            storage.removeItem(currentKey);
            repaired += 1;
          }
        } catch (error) {
          recordError(error, "repairCorrupted", currentKey, target);
        }
      }
    }

    const result = { ok: true, repaired, prefix: targetPrefix, kind };
    emit(events, STORAGE_EVENTS.repaired, { ...result, at: nowIso() });
    return result;
  }

  function migrateLegacyKey(legacyKey = "", currentKey = "", options = {}) {
    const fromKey = text(legacyKey, "");
    const toKey = text(currentKey, "");
    const opts = object(options);

    if (!fromKey || !toKey || isNamespacedKey(fromKey) || isPreferenceKey(fromKey)) return false;

    const kind = kindFromOptions(opts);
    const targets = opts.all === true ? ["local", "session", "memory"] : kind === "memory" ? ["memory"] : unique([kind, opts.fallbackSession === false ? "" : "session", opts.fallbackLocal === true ? "local" : "", opts.memoryAlso === false ? "" : "memory"]);
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

    if (raw === null || raw === undefined || corrupted(raw)) return false;

    const ok = setRaw(toKey, raw, opts);

    if (ok && opts.removeLegacy !== false) {
      try {
        if (sourceKind === "memory") memoryStorage.delete(fromKey);
        else backend(sourceKind)?.removeItem?.(fromKey);
      } catch {}
    }

    if (ok) {
      stats.migrate += 1;
      emit(events, STORAGE_EVENTS.migrated, { from: safeKey(fromKey), to: safeKey(key(toKey)), sourceKind, kind, removedLegacy: opts.removeLegacy !== false, at: nowIso() });
    }

    return ok;
  }

  function getSnapshot(options = {}) {
    const opts = object(options);

    return {
      version: STORAGE_VERSION,
      browser: isBrowser(),
      prefix: prefix(),
      prefixRaw: prefixRaw(),
      localStorageAvailable: storageAvailable("local"),
      sessionStorageAvailable: storageAvailable("session"),
      memoryFallbackSize: memoryStorage.size,
      knownLegacyKeys: opts.includeLegacyKeys === true ? legacyKeys() : [],
      keys: opts.includeKeys === false ? [] : keys({ all: true, includeValues: opts.includeValues === true }),
      stats: { ...stats, lastKey: safeKey(stats.lastKey) },
      lastError: sanitizeError(lastStorageError),
      events: STORAGE_EVENTS,
      at: nowIso(),
      policy: {
        namespacedOnly: true,
        noGlobalClear: true,
        legacyCleanupKeepsPreferences: true,
        redactedSnapshots: true,
      },
    };
  }

  log(utils, "Storage ready.", { version: STORAGE_VERSION, prefix: prefix(), local: storageAvailable("local"), session: storageAvailable("session") });

  emit(events, STORAGE_EVENTS.ready, { version: STORAGE_VERSION, prefix: prefix(), localStorageAvailable: storageAvailable("local"), sessionStorageAvailable: storageAvailable("session"), at: nowIso() });

  if (!storageAvailable("local") && !storageAvailable("session")) {
    emit(events, STORAGE_EVENTS.unavailable, { memoryFallback: true, error: sanitizeError(lastStorageError), at: nowIso() });
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

export default {
  STORAGE_VERSION,
  STORAGE_EVENTS,
  createStorage,
  removeLegacySessionKeys,
  resetStorageAvailabilityCache,
};
