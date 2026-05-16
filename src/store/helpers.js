/* =========================================================
   Onion SPA - Store Helpers
   Archivo: src/store/helpers.js

   STORE HELPERS · SIMPLE
   - clone/equality/path/merge/collections
   - prototype pollution hardening
   - browser/server safe
   - zero deps
========================================================= */

export const STORE_HELPERS_VERSION = "16.0.0-simple";

const MAX_CLONE_DEPTH = 64;
const MAX_EQUAL_DEPTH = 64;
const MAX_CHANGED_PATH_DEPTH = 32;

const UNSAFE_PATH_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

const TO_STRING = Object.prototype.toString;

/* =========================================================
   RUNTIME / TYPE
========================================================= */

export function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function isFunction(value) {
  return typeof value === "function";
}

export function isAnyObject(value) {
  return value !== null && typeof value === "object";
}

export function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
  return TO_STRING.call(value).slice(8, -1).toLowerCase();
}

export function hasOwn(obj, key) {
  try {
    return Object.prototype.hasOwnProperty.call(obj, key);
  } catch {
    return false;
  }
}

/* =========================================================
   SAFE VALUES
========================================================= */

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const output = String(value).trim();
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

  if (["true", "yes", "si", "sí", "on", "ok", "enabled", "active"].includes(clean)) return true;
  if (["false", "no", "off", "disabled", "inactive"].includes(clean)) return false;

  return Boolean(fallback);
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function safeObject(value, fallback = {}) {
  return isPlainObject(value) ? value : fallback;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value === null || value === undefined) return [];
  return [value];
}

export function unique(values = []) {
  return [
    ...new Set(
      toArray(values)
        .flat(Infinity)
        .map((item) => safeText(item, ""))
        .filter(Boolean)
    ),
  ];
}

export function compact(values = []) {
  return toArray(values).filter((item) => item !== null && item !== undefined && item !== "");
}

/* =========================================================
   PROTOTYPE POLLUTION SAFETY
========================================================= */

function normalizeUnsafeKey(key = "") {
  return String(key ?? "").trim().toLowerCase();
}

export function isUnsafePathKey(key = "") {
  return UNSAFE_PATH_KEYS.has(normalizeUnsafeKey(key));
}

function shouldSkipKey(key = "") {
  return isUnsafePathKey(key);
}

export function hasUnsafePathSegment(path) {
  return normalizePath(path, { allowUnsafeCheckOnly: true }).some((key) => isUnsafePathKey(key));
}

/* =========================================================
   CLONE
========================================================= */

function cloneArrayBuffer(buffer) {
  try {
    return buffer.slice(0);
  } catch {}

  try {
    const copy = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(copy).set(new Uint8Array(buffer));
    return copy;
  } catch {
    return buffer;
  }
}

function cloneTypedArray(value) {
  try {
    return new value.constructor(value);
  } catch {
    return value;
  }
}

function cloneDataView(value) {
  try {
    return new DataView(
      cloneArrayBuffer(value.buffer),
      value.byteOffset,
      value.byteLength
    );
  } catch {
    return value;
  }
}

function cloneError(value, seen, depth) {
  const output = {
    name: value.name || "Error",
    message: value.message || "",
    stack: value.stack || "",
    code: value.code || null,
    status: value.status || value.statusCode || null,
  };

  seen.set(value, output);

  for (const key of Object.keys(value)) {
    if (shouldSkipKey(key) || hasOwn(output, key)) continue;
    output[key] = cloneInternal(value[key], seen, depth + 1);
  }

  return output;
}

function cloneObject(value, seen, depth) {
  const output = Object.create(null);
  seen.set(value, output);

  for (const key of Object.keys(value)) {
    if (shouldSkipKey(key)) continue;
    output[key] = cloneInternal(value[key], seen, depth + 1);
  }

  return output;
}

function cloneInternal(value, seen, depth) {
  if (value === undefined) return undefined;
  if (isPrimitive(value) || isFunction(value)) return value;
  if (depth > MAX_CLONE_DEPTH) return "[depth-limit]";
  if (seen.has(value)) return seen.get(value);

  if (isDate(value)) {
    const output = new Date(value.getTime());
    seen.set(value, output);
    return output;
  }

  if (isRegExp(value)) {
    const output = new RegExp(value.source, value.flags);
    output.lastIndex = value.lastIndex;
    seen.set(value, output);
    return output;
  }

  if (value instanceof Error) return cloneError(value, seen, depth);

  if (isArrayBuffer(value)) {
    const output = cloneArrayBuffer(value);
    seen.set(value, output);
    return output;
  }

  if (isDataView(value)) {
    const output = cloneDataView(value);
    seen.set(value, output);
    return output;
  }

  if (isTypedArray(value)) {
    const output = cloneTypedArray(value);
    seen.set(value, output);
    return output;
  }

  if (Array.isArray(value)) {
    const output = [];
    seen.set(value, output);

    value.forEach((item, index) => {
      output[index] = cloneInternal(item, seen, depth + 1);
    });

    return output;
  }

  if (isMap(value)) {
    const output = new Map();
    seen.set(value, output);

    value.forEach((mapValue, mapKey) => {
      output.set(
        cloneInternal(mapKey, seen, depth + 1),
        cloneInternal(mapValue, seen, depth + 1)
      );
    });

    return output;
  }

  if (isSet(value)) {
    const output = new Set();
    seen.set(value, output);

    value.forEach((item) => {
      output.add(cloneInternal(item, seen, depth + 1));
    });

    return output;
  }

  if (isWeakMap(value) || isWeakSet(value)) return value;
  if (isAnyObject(value)) return cloneObject(value, seen, depth);

  return value;
}

export function deepClone(value) {
  return cloneInternal(value, new WeakMap(), 0);
}

/* =========================================================
   DEEP EQUAL
========================================================= */

function markCompared(seen, a, b) {
  let inner = seen.get(a);

  if (!inner) {
    inner = new WeakSet();
    seen.set(a, inner);
  }

  if (inner.has(b)) return true;

  inner.add(b);
  return false;
}

function equalArrayBuffers(a, b) {
  if (a.byteLength !== b.byteLength) return false;

  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);

  for (let i = 0; i < aa.length; i += 1) {
    if (aa[i] !== bb[i]) return false;
  }

  return true;
}

function equalTypedArrays(a, b) {
  if (a.constructor !== b.constructor || a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(a[i], b[i])) return false;
  }

  return true;
}

function equalArrays(a, b, seen, depth) {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    if (!equalInternal(a[i], b[i], seen, depth + 1)) return false;
  }

  return true;
}

function equalMaps(a, b, seen, depth) {
  if (a.size !== b.size) return false;

  const used = new Set();
  const bEntries = [...b.entries()];

  for (const [aKey, aValue] of a.entries()) {
    let matched = false;

    for (let i = 0; i < bEntries.length; i += 1) {
      if (used.has(i)) continue;

      const [bKey, bValue] = bEntries[i];

      if (
        equalInternal(aKey, bKey, seen, depth + 1) &&
        equalInternal(aValue, bValue, seen, depth + 1)
      ) {
        used.add(i);
        matched = true;
        break;
      }
    }

    if (!matched) return false;
  }

  return true;
}

function equalSets(a, b, seen, depth) {
  if (a.size !== b.size) return false;

  const used = new Set();
  const bValues = [...b.values()];

  for (const aValue of a.values()) {
    let matched = false;

    for (let i = 0; i < bValues.length; i += 1) {
      if (used.has(i)) continue;

      if (equalInternal(aValue, bValues[i], seen, depth + 1)) {
        used.add(i);
        matched = true;
        break;
      }
    }

    if (!matched) return false;
  }

  return true;
}

function equalObjects(a, b, seen, depth) {
  const aKeys = Object.keys(a).filter((key) => !shouldSkipKey(key));
  const bKeys = Object.keys(b).filter((key) => !shouldSkipKey(key));

  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!hasOwn(b, key)) return false;
    if (!equalInternal(a[key], b[key], seen, depth + 1)) return false;
  }

  return true;
}

function equalInternal(a, b, seen, depth) {
  if (Object.is(a, b)) return true;
  if (depth > MAX_EQUAL_DEPTH) return false;
  if (typeof a !== typeof b) return false;
  if (isPrimitive(a) || isPrimitive(b)) return false;
  if (!isAnyObject(a) || !isAnyObject(b)) return false;
  if (markCompared(seen, a, b)) return true;

  if (isDate(a) || isDate(b)) return isDate(a) && isDate(b) && a.getTime() === b.getTime();

  if (isRegExp(a) || isRegExp(b)) {
    return (
      isRegExp(a) &&
      isRegExp(b) &&
      a.source === b.source &&
      a.flags === b.flags &&
      a.lastIndex === b.lastIndex
    );
  }

  if (isArrayBuffer(a) || isArrayBuffer(b)) return isArrayBuffer(a) && isArrayBuffer(b) && equalArrayBuffers(a, b);
  if (isTypedArray(a) || isTypedArray(b)) return isTypedArray(a) && isTypedArray(b) && equalTypedArrays(a, b);

  if (isDataView(a) || isDataView(b)) {
    return (
      isDataView(a) &&
      isDataView(b) &&
      equalArrayBuffers(a.buffer, b.buffer) &&
      a.byteOffset === b.byteOffset &&
      a.byteLength === b.byteLength
    );
  }

  if (isMap(a) || isMap(b)) return isMap(a) && isMap(b) && equalMaps(a, b, seen, depth);
  if (isSet(a) || isSet(b)) return isSet(a) && isSet(b) && equalSets(a, b, seen, depth);
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && equalArrays(a, b, seen, depth);

  return equalObjects(a, b, seen, depth);
}

export function deepEqual(a, b) {
  return equalInternal(a, b, new WeakMap(), 0);
}

/* =========================================================
   PATH PARSER
========================================================= */

function parseBracketSegment(segment = "") {
  const raw = safeText(segment, "");
  if (!raw) return "";

  if (
    (raw.startsWith("\"") && raw.endsWith("\"")) ||
    (raw.startsWith("'") && raw.endsWith("'")) ||
    (raw.startsWith("`") && raw.endsWith("`"))
  ) {
    return raw.slice(1, -1);
  }

  return raw;
}

export function normalizePath(path, options = {}) {
  const opts = isPlainObject(options) ? options : {};

  if (Array.isArray(path)) {
    const parts = path.map((part) => safeText(part, "")).filter(Boolean);

    if (opts.allowUnsafeCheckOnly === true) return parts;

    return parts.some((part) => isUnsafePathKey(part)) ? [] : parts;
  }

  const raw = safeText(path, "");
  if (!raw) return [];

  const parts = [];
  let buffer = "";
  let inBracket = false;
  let quote = "";

  function push() {
    const value = safeText(buffer, "");
    buffer = "";
    if (value) parts.push(value);
  }

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];

    if (inBracket) {
      if (quote) {
        buffer += char;
        if (char === quote) quote = "";
        continue;
      }

      if (char === "\"" || char === "'" || char === "`") {
        quote = char;
        buffer += char;
        continue;
      }

      if (char === "]") {
        const value = parseBracketSegment(buffer);
        if (value) parts.push(value);
        buffer = "";
        inBracket = false;
        continue;
      }

      buffer += char;
      continue;
    }

    if (char === ".") {
      push();
      continue;
    }

    if (char === "[") {
      push();
      inBracket = true;
      continue;
    }

    buffer += char;
  }

  push();

  const normalized = parts.map((part) => safeText(part, "")).filter(Boolean);

  if (opts.allowUnsafeCheckOnly === true) return normalized;

  return normalized.some((part) => isUnsafePathKey(part)) ? [] : normalized;
}

function isNumericKey(key = "") {
  return /^\d+$/.test(String(key));
}

function canTraverse(value) {
  return isPlainObject(value) || Array.isArray(value);
}

function createContainer(nextKey = "") {
  return isNumericKey(nextKey) ? [] : {};
}

/* =========================================================
   PATH READ / WRITE
========================================================= */

export function getByPath(obj, path, fallback = undefined) {
  if (path === null || path === undefined || path === "") return obj;

  const keys = normalizePath(path);
  if (!keys.length) return fallback;

  let current = obj;

  for (const key of keys) {
    if (current === null || current === undefined) return fallback;

    try {
      current = current[key];
    } catch {
      return fallback;
    }
  }

  return current === undefined ? fallback : current;
}

export function hasByPath(obj, path) {
  if (path === null || path === undefined || path === "") return obj !== undefined;

  const keys = normalizePath(path);
  if (!keys.length) return false;

  let current = obj;

  for (const key of keys) {
    if (current === null || current === undefined) return false;
    if (!hasOwn(Object(current), key)) return false;
    current = current[key];
  }

  return true;
}

export function setByPath(obj, path, value) {
  const keys = normalizePath(path);
  const lastKey = keys.pop();

  if (!canTraverse(obj) || !lastKey) return obj;

  let current = obj;

  keys.forEach((key, index) => {
    const nextKey = keys[index + 1] || lastKey;

    if (!canTraverse(current[key])) {
      current[key] = createContainer(nextKey);
    }

    current = current[key];
  });

  try {
    current[lastKey] = value;
  } catch {}

  return obj;
}

export function deleteByPath(obj, path) {
  const keys = normalizePath(path);
  const lastKey = keys.pop();

  if (!canTraverse(obj) || !lastKey) return obj;

  let current = obj;

  for (const key of keys) {
    if (!canTraverse(current?.[key])) return obj;
    current = current[key];
  }

  try {
    if (Array.isArray(current) && isNumericKey(lastKey)) current.splice(Number(lastKey), 1);
    else if (canTraverse(current)) delete current[lastKey];
  } catch {}

  return obj;
}

export function setImmutableByPath(obj, path, value) {
  const output = deepClone(obj);
  return setByPath(output, path, value);
}

export function deleteImmutableByPath(obj, path) {
  const output = deepClone(obj);
  return deleteByPath(output, path);
}

/* =========================================================
   MERGE
========================================================= */

function isMergeable(value) {
  return isPlainObject(value);
}

export function mergeDeep(target, source) {
  if (source === undefined) return deepClone(target);
  if (source === null) return null;

  if (Array.isArray(source)) return source.map((item) => deepClone(item));
  if (!isMergeable(source)) return deepClone(source);

  const output = isMergeable(target) ? deepClone(target) : {};

  for (const key of Object.keys(source)) {
    if (shouldSkipKey(key)) continue;

    const sourceValue = source[key];
    const targetValue = output[key];

    output[key] = isMergeable(sourceValue) && isMergeable(targetValue)
      ? mergeDeep(targetValue, sourceValue)
      : deepClone(sourceValue);
  }

  return output;
}

export function mergeMany(...objects) {
  return objects.reduce((acc, item) => mergeDeep(acc, item), {});
}

/* =========================================================
   CHANGE PATHS
========================================================= */

export function collectChangedPaths(input, prefix = "", options = {}) {
  const maxDepth = safeNumber(options?.maxDepth, MAX_CHANGED_PATH_DEPTH);

  function walk(value, currentPrefix, depth) {
    if (depth > maxDepth) return currentPrefix ? [currentPrefix] : [];

    if (!isPlainObject(value)) return currentPrefix ? [currentPrefix] : [];
    if (Array.isArray(value)) return currentPrefix ? [currentPrefix] : [];

    const paths = [];

    for (const [key, item] of Object.entries(value)) {
      if (shouldSkipKey(key)) continue;

      const nextPath = currentPrefix ? `${currentPrefix}.${key}` : key;

      paths.push(nextPath);

      if (isPlainObject(item)) {
        paths.push(...walk(item, nextPath, depth + 1));
      }
    }

    return paths;
  }

  return [...new Set(walk(input, safeText(prefix, ""), 0))];
}

export function collectDiffPaths(previous, next, prefix = "", options = {}) {
  const maxDepth = safeNumber(options?.maxDepth, MAX_CHANGED_PATH_DEPTH);

  function walk(a, b, currentPrefix, depth) {
    if (deepEqual(a, b)) return [];
    if (depth > maxDepth) return currentPrefix ? [currentPrefix] : [];

    if (!isPlainObject(a) || !isPlainObject(b)) return currentPrefix ? [currentPrefix] : [];

    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => !shouldSkipKey(key));
    const paths = [];

    for (const key of keys) {
      const nextPath = currentPrefix ? `${currentPrefix}.${key}` : key;

      if (!deepEqual(a[key], b[key])) {
        paths.push(nextPath);

        if (isPlainObject(a[key]) && isPlainObject(b[key])) {
          paths.push(...walk(a[key], b[key], nextPath, depth + 1));
        }
      }
    }

    return paths;
  }

  return [...new Set(walk(previous, next, safeText(prefix, ""), 0))];
}

/* =========================================================
   COLLECTIONS
========================================================= */

export function normalizeCollection(items, fallback = []) {
  if (!Array.isArray(items)) {
    return Array.isArray(fallback) ? fallback.map((item) => deepClone(item)) : [];
  }

  return items.map((item) => deepClone(item));
}

function resolveCollectionKey(item, keyOrFn = "id") {
  if (isFunction(keyOrFn)) return keyOrFn(item);
  return item?.[keyOrFn];
}

export function collectionToMap(items = [], key = "id") {
  const map = new Map();

  normalizeCollection(items).forEach((item) => {
    if (!item || typeof item !== "object") return;

    const id = resolveCollectionKey(item, key);
    if (id === null || id === undefined || id === "") return;

    map.set(String(id), item);
  });

  return map;
}

export function upsertCollection(items = [], nextItem = null, matcher = null) {
  const list = normalizeCollection(items);
  if (!nextItem) return list;

  const cloned = deepClone(nextItem);
  const match = isFunction(matcher)
    ? matcher
    : (item) => item?.id === cloned?.id;

  const index = list.findIndex((item) => match(item));

  if (index >= 0) list[index] = cloned;
  else list.push(cloned);

  return list;
}

export function removeFromCollection(items = [], matcher) {
  const list = normalizeCollection(items);
  const match = isFunction(matcher) ? matcher : (item) => item?.id === matcher;

  return list.filter((item) => !match(item));
}

export function sortCollection(items = [], compareFn = null) {
  const list = normalizeCollection(items);
  return isFunction(compareFn) ? list.sort(compareFn) : list;
}

export function groupCollectionBy(items = [], keyOrFn = "id") {
  const groups = new Map();

  for (const item of normalizeCollection(items)) {
    const key = resolveCollectionKey(item, keyOrFn);
    const groupKey = key === null || key === undefined || key === "" ? "__empty__" : String(key);

    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(item);
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
  const output = {};
  const source = safeObject(object);

  for (const key of toArray(keys)) {
    const cleanKey = safeText(key, "");
    if (cleanKey && hasOwn(source, cleanKey)) output[cleanKey] = source[cleanKey];
  }

  return output;
}

export function omit(object = {}, keys = []) {
  const blocked = new Set(toArray(keys).map((key) => safeText(key, "")).filter(Boolean));
  const output = {};

  for (const [key, value] of Object.entries(safeObject(object))) {
    if (blocked.has(key) || shouldSkipKey(key)) continue;
    output[key] = value;
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
  if (!value || typeof value !== "object") return value;

  try {
    if (seen.has(value)) return value;
    seen.add(value);

    for (const key of Object.keys(value)) {
      if (shouldSkipKey(key)) continue;
      deepFreeze(value[key], seen);
    }

    return Object.freeze(value);
  } catch {
    return value;
  }
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
