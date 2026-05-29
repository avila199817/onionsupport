/* =========================================================
   Onion Support - Store Helpers
   Archivo: /src/store/helpers.js

   Responsabilidad:
   - Helpers puros mínimos.
   - Sin imports.
   - Sin eventos.
   - Sin snapshots.
   - Sin lógica avanzada.
   - Sin duplicar Store/Core/Auth.
   - Compat básica para imports antiguos.
========================================================= */

export const STORE_HELPERS_VERSION = "simple";

const ROOT_KEYS = Object.freeze([
  "ui",
  "app",
  "entities",
  "flags",
  "meta",
]);

const ROOT_KEY_SET = new Set(ROOT_KEYS);

const UNSAFE_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

const SENSITIVE_KEY_RE =
  /(^auth$|^session$|^sessionData$|^currentUser$|^authUser$|^sessionUser$|^user$|token|authorization|cookie|password|passwd|pwd|secret|credential|jwt|bearer|refresh|accessToken|access_token|idToken|id_token|apiKey|api_key|privateKey|private_key|connectionString|connection_string|sas|otp|totp|mfa|twofa|2fa|backupCode|backup_code|backupCodes|backup_codes|sessionId|session_id|^role$|^roles$|^permissions$|^_rid$|^_self$|^_etag$|^_attachments$|^_ts$)/i;

/* =========================================================
   TYPES
========================================================= */

export function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function isFunction(value) {
  return typeof value === "function";
}

export function isAnyObject(value) {
  return Boolean(value && typeof value === "object");
}

export function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isPlainObject(value) {
  if (!isObject(value)) return false;

  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

export function isPrimitive(value) {
  return value === null || (typeof value !== "object" && typeof value !== "function");
}

export function isDate(value) {
  return value instanceof Date;
}

export function isRegExp(value) {
  return value instanceof RegExp;
}

export function isMap(value) {
  return value instanceof Map;
}

export function isSet(value) {
  return value instanceof Set;
}

export function isWeakMap(value) {
  return typeof WeakMap !== "undefined" && value instanceof WeakMap;
}

export function isWeakSet(value) {
  return typeof WeakSet !== "undefined" && value instanceof WeakSet;
}

export function isArrayBuffer(value) {
  return typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer;
}

export function isDataView(value) {
  return typeof DataView !== "undefined" && value instanceof DataView;
}

export function isTypedArray(value) {
  try {
    return (
      typeof ArrayBuffer !== "undefined" &&
      ArrayBuffer.isView(value) &&
      !isDataView(value)
    );
  } catch {
    return false;
  }
}

export function getType(value) {
  return Object.prototype.toString.call(value).slice(8, -1).toLowerCase();
}

export function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(Object(object), key);
}

/* =========================================================
   SAFE VALUES
========================================================= */

export function safeText(value, fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

export function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

export function safeNumber(value, fallback = 0) {
  const output = Number(value);
  return Number.isFinite(output) ? output : fallback;
}

export function safeBool(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;

  const clean = safeLower(value, "");

  if (["true", "yes", "si", "sí", "on"].includes(clean)) return true;
  if (["false", "no", "off"].includes(clean)) return false;

  return Boolean(fallback);
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function safeObject(value, fallback = {}) {
  return isPlainObject(value) ? value : fallback;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value === null || value === undefined) return [];
  return [value];
}

export function unique(values = []) {
  return [...new Set(asArray(values).flat().filter(Boolean))];
}

export function compact(values = []) {
  return asArray(values).filter((item) => {
    return item !== null && item !== undefined && item !== "";
  });
}

/* =========================================================
   PATH SAFETY
========================================================= */

function normalizedKey(key = "") {
  return String(key ?? "").trim();
}

function isSensitivePathKey(key = "") {
  return SENSITIVE_KEY_RE.test(normalizedKey(key));
}

export function isUnsafePathKey(key = "") {
  const clean = normalizedKey(key);

  return UNSAFE_KEYS.has(clean) || isSensitivePathKey(clean);
}

export function normalizePath(path) {
  const source = Array.isArray(path)
    ? path
    : safeText(path, "")
        .replace(/\[(["'`]?)(.*?)\1\]/g, ".$2")
        .split(".");

  const parts = source
    .map((part) => normalizedKey(part))
    .filter(Boolean);

  if (!parts.length) return [];
  if (parts.some(isUnsafePathKey)) return [];

  return parts;
}

export function hasUnsafePathSegment(path) {
  const source = Array.isArray(path)
    ? path
    : safeText(path, "")
        .replace(/\[(["'`]?)(.*?)\1\]/g, ".$2")
        .split(".");

  return source
    .map((part) => normalizedKey(part))
    .filter(Boolean)
    .some(isUnsafePathKey);
}

/* =========================================================
   CLONE / EQUAL
========================================================= */

export function deepClone(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const valueType = typeof value;

  if (
    valueType === "function" ||
    valueType === "symbol" ||
    valueType === "bigint"
  ) {
    return undefined;
  }

  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {
    // fallback abajo
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? undefined : JSON.parse(serialized);
  } catch {
    return undefined;
  }
}

export function deepEqual(left, right) {
  if (Object.is(left, right)) return true;

  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function sanitizeValue(value, keyHint = "") {
  if (isUnsafePathKey(keyHint)) {
    return undefined;
  }

  if (value === undefined) return undefined;
  if (value === null) return null;

  const valueType = typeof value;

  if (
    valueType === "function" ||
    valueType === "symbol" ||
    valueType === "bigint"
  ) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeValue(item))
      .filter((item) => item !== undefined);
  }

  if (isPlainObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (isUnsafePathKey(key)) continue;

      const clean = sanitizeValue(item, key);

      if (clean !== undefined) {
        output[key] = clean;
      }
    }

    return output;
  }

  if (
    valueType === "string" ||
    valueType === "number" ||
    valueType === "boolean"
  ) {
    return deepClone(value);
  }

  return undefined;
}

/* =========================================================
   PATH READ / WRITE
========================================================= */

export function getByPath(object, path, fallback = undefined) {
  const parts = normalizePath(path);

  if (!parts.length) return path ? fallback : object;

  let current = object;

  for (const part of parts) {
    if (current === null || current === undefined) return fallback;
    current = current[part];
  }

  return current === undefined ? fallback : current;
}

export function hasByPath(object, path) {
  const parts = normalizePath(path);

  if (!parts.length) return false;

  let current = object;

  for (const part of parts) {
    if (current === null || current === undefined) return false;
    if (!hasOwn(current, part)) return false;
    current = current[part];
  }

  return true;
}

export function setByPath(object, path, value) {
  const parts = normalizePath(path);

  if (!isAnyObject(object) || !parts.length) return object;

  const key = parts.at(-1);
  const clean = sanitizeValue(value, key);

  if (clean === undefined) return object;

  let current = object;

  for (const part of parts.slice(0, -1)) {
    if (!isPlainObject(current[part]) && !Array.isArray(current[part])) {
      current[part] = {};
    }

    current = current[part];
  }

  current[key] = clean;

  return object;
}

export function deleteByPath(object, path) {
  const parts = normalizePath(path);

  if (!isAnyObject(object) || !parts.length) return object;

  let current = object;

  for (const part of parts.slice(0, -1)) {
    if (!isAnyObject(current?.[part])) return object;
    current = current[part];
  }

  const key = parts.at(-1);

  if (!hasOwn(current, key)) return object;

  if (Array.isArray(current) && /^\d+$/.test(key)) {
    current.splice(Number(key), 1);
  } else {
    delete current[key];
  }

  return object;
}

export function setImmutableByPath(object, path, value) {
  const output = deepClone(object);

  return setByPath(output, path, value);
}

export function deleteImmutableByPath(object, path) {
  const output = deepClone(object);

  return deleteByPath(output, path);
}

/* =========================================================
   MERGE
========================================================= */

export function mergeDeep(target = {}, source = {}) {
  const output = isPlainObject(target) ? deepClone(target) || {} : {};

  if (!isPlainObject(source)) return output;

  for (const [key, value] of Object.entries(source)) {
    if (isUnsafePathKey(key)) continue;

    const clean = sanitizeValue(value, key);

    if (clean === undefined) continue;

    if (isPlainObject(clean) && isPlainObject(output[key])) {
      output[key] = mergeDeep(output[key], clean);
    } else {
      output[key] = clean;
    }
  }

  return output;
}

export function mergeMany(...objects) {
  return objects.reduce((acc, item) => mergeDeep(acc, item), {});
}

/* =========================================================
   CHANGE PATHS
========================================================= */

export function collectChangedPaths(input = {}, prefix = "") {
  if (prefix && hasUnsafePathSegment(prefix)) return [];

  if (!isPlainObject(input)) {
    return prefix ? [prefix] : [];
  }

  const paths = [];

  for (const key of Object.keys(input)) {
    if (isUnsafePathKey(key)) continue;

    const path = prefix ? `${prefix}.${key}` : key;
    paths.push(path);
  }

  return paths;
}

export function collectDiffPaths(previous = {}, next = {}, prefix = "") {
  if (prefix && hasUnsafePathSegment(prefix)) return [];
  if (deepEqual(previous, next)) return [];

  if (!isPlainObject(previous) || !isPlainObject(next)) {
    return prefix ? [prefix] : [];
  }

  const keys = new Set([
    ...Object.keys(previous),
    ...Object.keys(next),
  ]);

  const paths = [];

  for (const key of keys) {
    if (isUnsafePathKey(key)) continue;

    const path = prefix ? `${prefix}.${key}` : key;

    if (!deepEqual(previous[key], next[key])) {
      paths.push(path);
    }
  }

  return paths;
}

/* =========================================================
   COLLECTIONS
========================================================= */

export function normalizeCollection(items, fallback = []) {
  const source = Array.isArray(items)
    ? items
    : Array.isArray(fallback)
      ? fallback
      : [];

  return source
    .map((item) => sanitizeValue(item))
    .filter((item) => item !== undefined);
}

function safeCollectionKey(key = "id") {
  const clean = safeText(key, "id");

  return clean && !isUnsafePathKey(clean) ? clean : "id";
}

export function collectionToMap(items = [], key = "id") {
  const map = new Map();
  const list = normalizeCollection(items);

  for (const item of list) {
    let id;

    try {
      id = isFunction(key)
        ? key(deepClone(item))
        : item?.[safeCollectionKey(key)];
    } catch {
      id = null;
    }

    if (id !== null && id !== undefined && id !== "") {
      map.set(String(id), deepClone(item));
    }
  }

  return map;
}

function buildCollectionMatcher(matcher, item = null, list = []) {
  if (isFunction(matcher)) {
    return (entry, index) => {
      try {
        return Boolean(matcher(deepClone(entry), index, deepClone(list)));
      } catch {
        return false;
      }
    };
  }

  if (matcher !== null && matcher !== undefined && matcher !== "") {
    return (entry) => entry?.id === matcher;
  }

  const id = item?.id;

  if (id !== null && id !== undefined && id !== "") {
    return (entry) => entry?.id === id;
  }

  return () => false;
}

export function upsertCollection(items = [], nextItem = null, matcher = null) {
  const list = normalizeCollection(items);
  const item = sanitizeValue(nextItem);

  if (item === undefined || item === null) return list;

  const match = buildCollectionMatcher(matcher, item, list);
  const index = list.findIndex((entry, entryIndex) => {
    return match(entry, entryIndex);
  });

  if (index >= 0) {
    list[index] = item;
  } else {
    list.push(item);
  }

  return list;
}

export function removeFromCollection(items = [], matcher) {
  const list = normalizeCollection(items);
  const match = buildCollectionMatcher(matcher, null, list);

  return list.filter((item, index) => !match(item, index));
}

export function sortCollection(items = [], compareFn = null) {
  const list = normalizeCollection(items);

  return isFunction(compareFn) ? list.sort(compareFn) : list;
}

export function groupCollectionBy(items = [], keyOrFn = "id") {
  const groups = new Map();
  const list = normalizeCollection(items);

  for (const item of list) {
    let value;

    try {
      value = isFunction(keyOrFn)
        ? keyOrFn(deepClone(item))
        : item?.[safeCollectionKey(keyOrFn)];
    } catch {
      value = null;
    }

    const key =
      value === null || value === undefined || value === ""
        ? "__empty__"
        : String(value);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(deepClone(item));
  }

  return groups;
}

/* =========================================================
   OBJECT HELPERS
========================================================= */

export function shallowCloneRoot(state = {}) {
  if (!isPlainObject(state)) return {};

  const output = {};

  for (const key of ROOT_KEYS) {
    if (hasOwn(state, key)) {
      const clean = sanitizeValue(state[key], key);

      if (clean !== undefined) {
        output[key] = clean;
      }
    }
  }

  return output;
}

export function pick(object = {}, keys = []) {
  const source = safeObject(object);
  const output = {};

  for (const key of asArray(keys)) {
    const cleanKey = safeText(key, "");

    if (!cleanKey || isUnsafePathKey(cleanKey)) continue;

    if (hasOwn(source, cleanKey)) {
      const cleanValue = sanitizeValue(source[cleanKey], cleanKey);

      if (cleanValue !== undefined) {
        output[cleanKey] = cleanValue;
      }
    }
  }

  return output;
}

export function omit(object = {}, keys = []) {
  const source = safeObject(object);
  const blocked = new Set(
    asArray(keys)
      .map((key) => safeText(key, ""))
      .filter(Boolean)
  );
  const output = {};

  for (const [key, value] of Object.entries(source)) {
    if (blocked.has(key)) continue;
    if (isUnsafePathKey(key)) continue;

    const clean = sanitizeValue(value, key);

    if (clean !== undefined) {
      output[key] = clean;
    }
  }

  return output;
}

export function freezeDev(value) {
  try {
    return Object.freeze(value);
  } catch {
    return value;
  }
}

export function deepFreeze(value, seen = new WeakSet()) {
  if (!isAnyObject(value)) return value;
  if (seen.has(value)) return value;

  seen.add(value);

  if (Array.isArray(value) || isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      deepFreeze(value[key], seen);
    }
  }

  return freezeDev(value);
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  STORE_HELPERS_VERSION,

  isBrowser,
  isFunction,
  isAnyObject,
  isObject,
  isPlainObject,
  isPrimitive,
  isDate,
  isRegExp,
  isMap,
  isSet,
  isWeakMap,
  isWeakSet,
  isArrayBuffer,
  isTypedArray,
  isDataView,
  getType,
  hasOwn,

  safeText,
  safeLower,
  safeNumber,
  safeBool,
  safeArray,
  safeObject,
  unique,
  compact,

  isUnsafePathKey,
  hasUnsafePathSegment,
  normalizePath,

  deepClone,
  deepEqual,

  getByPath,
  hasByPath,
  setByPath,
  deleteByPath,
  setImmutableByPath,
  deleteImmutableByPath,

  mergeDeep,
  mergeMany,

  collectChangedPaths,
  collectDiffPaths,

  normalizeCollection,
  collectionToMap,
  upsertCollection,
  removeFromCollection,
  sortCollection,
  groupCollectionBy,

  shallowCloneRoot,
  pick,
  omit,
  freezeDev,
  deepFreeze,
};
