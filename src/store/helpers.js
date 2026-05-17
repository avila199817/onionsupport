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

const UNSAFE_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

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
  return value instanceof WeakMap;
}

export function isWeakSet(value) {
  return value instanceof WeakSet;
}

export function isArrayBuffer(value) {
  return typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer;
}

export function isDataView(value) {
  return typeof DataView !== "undefined" && value instanceof DataView;
}

export function isTypedArray(value) {
  try {
    return typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(value) && !isDataView(value);
  } catch {
    return false;
  }
}

export function getType(value) {
  return Object.prototype.toString.call(value).slice(8, -1).toLowerCase();
}

export function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/* =========================================================
   SAFE VALUES
========================================================= */

export function safeText(value, fallback = "") {
  const output = String(value ?? "").trim();
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
  return asArray(values).filter((item) => item !== null && item !== undefined && item !== "");
}

/* =========================================================
   PATH SAFETY
========================================================= */

export function isUnsafePathKey(key = "") {
  return UNSAFE_KEYS.has(String(key || "").trim());
}

export function normalizePath(path) {
  if (Array.isArray(path)) {
    return path.map((part) => safeText(part, "")).filter(Boolean).filter((part) => !isUnsafePathKey(part));
  }

  return safeText(path, "")
    .replace(/\[(["'`]?)(.*?)\1\]/g, ".$2")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !isUnsafePathKey(part));
}

export function hasUnsafePathSegment(path) {
  const parts = Array.isArray(path)
    ? path
    : safeText(path, "")
        .replace(/\[(["'`]?)(.*?)\1\]/g, ".$2")
        .split(".");

  return parts.some((part) => isUnsafePathKey(part));
}

/* =========================================================
   CLONE / EQUAL
========================================================= */

export function deepClone(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
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
    if (!hasOwn(Object(current), part)) return false;
    current = current[part];
  }

  return true;
}

export function setByPath(object, path, value) {
  const parts = normalizePath(path);

  if (!object || !parts.length) return object;

  let current = object;

  for (const part of parts.slice(0, -1)) {
    if (!isObject(current[part]) && !Array.isArray(current[part])) {
      current[part] = {};
    }

    current = current[part];
  }

  current[parts.at(-1)] = value;

  return object;
}

export function deleteByPath(object, path) {
  const parts = normalizePath(path);

  if (!object || !parts.length) return object;

  let current = object;

  for (const part of parts.slice(0, -1)) {
    if (!current?.[part]) return object;
    current = current[part];
  }

  const key = parts.at(-1);

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
  const output = isPlainObject(target) ? deepClone(target) : {};

  if (!isPlainObject(source)) return output;

  for (const [key, value] of Object.entries(source)) {
    if (isUnsafePathKey(key)) continue;

    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = mergeDeep(output[key], value);
    } else {
      output[key] = deepClone(value);
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
  if (!isPlainObject(input)) return prefix ? [prefix] : [];

  const paths = [];

  for (const key of Object.keys(input)) {
    if (isUnsafePathKey(key)) continue;

    const path = prefix ? `${prefix}.${key}` : key;
    paths.push(path);
  }

  return paths;
}

export function collectDiffPaths(previous = {}, next = {}, prefix = "") {
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
  return Array.isArray(items)
    ? items.map((item) => deepClone(item))
    : Array.isArray(fallback)
      ? fallback.map((item) => deepClone(item))
      : [];
}

export function collectionToMap(items = [], key = "id") {
  const map = new Map();

  for (const item of normalizeCollection(items)) {
    const id = isFunction(key) ? key(item) : item?.[key];

    if (id !== null && id !== undefined && id !== "") {
      map.set(String(id), item);
    }
  }

  return map;
}

export function upsertCollection(items = [], nextItem = null, matcher = null) {
  const list = normalizeCollection(items);

  if (!nextItem) return list;

  const item = deepClone(nextItem);
  const match = isFunction(matcher)
    ? matcher
    : (entry) => entry?.id === item?.id;

  const index = list.findIndex(match);

  if (index >= 0) {
    list[index] = item;
  } else {
    list.push(item);
  }

  return list;
}

export function removeFromCollection(items = [], matcher) {
  const list = normalizeCollection(items);
  const match = isFunction(matcher)
    ? matcher
    : (entry) => entry?.id === matcher;

  return list.filter((item) => !match(item));
}

export function sortCollection(items = [], compareFn = null) {
  const list = normalizeCollection(items);

  return isFunction(compareFn) ? list.sort(compareFn) : list;
}

export function groupCollectionBy(items = [], keyOrFn = "id") {
  const groups = new Map();

  for (const item of normalizeCollection(items)) {
    const value = isFunction(keyOrFn) ? keyOrFn(item) : item?.[keyOrFn];
    const key = value === null || value === undefined || value === "" ? "__empty__" : String(value);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(item);
  }

  return groups;
}

/* =========================================================
   OBJECT HELPERS
========================================================= */

export function shallowCloneRoot(state = {}) {
  return isObject(state) ? { ...state } : {};
}

export function pick(object = {}, keys = []) {
  const source = safeObject(object);
  const output = {};

  for (const key of asArray(keys)) {
    if (hasOwn(source, key)) {
      output[key] = source[key];
    }
  }

  return output;
}

export function omit(object = {}, keys = []) {
  const source = safeObject(object);
  const blocked = new Set(asArray(keys));
  const output = {};

  for (const [key, value] of Object.entries(source)) {
    if (!blocked.has(key) && !isUnsafePathKey(key)) {
      output[key] = value;
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

export function deepFreeze(value) {
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
