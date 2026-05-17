/* =========================================================
   Onion Support - Store Collections
   Archivo: /src/store/collections.js

   Responsabilidad:
   - Helpers genéricos de colecciones.
   - Sin imports.
   - Sin aliases.
   - Sin recursos inventados.
   - Sin matchers complejos.
   - Sin path injection.
   - Sin prototype pollution.
   - Simplicidad extrema.
========================================================= */

export const COLLECTIONS_VERSION = "simple";

const COLLECTION_KEY_RE = /^[a-zA-Z0-9_-]{1,80}$/;

const UNSAFE_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

export const IDENTITY_FIELDS = Object.freeze([
  "id",
  "uuid",
  "userId",
  "ticketId",
  "clienteId",
  "facturaId",
  "invoiceId",
  "email",
  "slug",
  "username",
]);

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(Object(object), key);
}

function clone(value) {
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

function isUnsafeKey(key = "") {
  return UNSAFE_KEYS.has(String(key || ""));
}

/* =========================================================
   COLLECTION KEYS
========================================================= */

export function normalizeCollectionKey(key = "") {
  return text(key, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "");
}

export function isValidCollectionKey(key = "") {
  const normalized = normalizeCollectionKey(key);
  return Boolean(normalized && COLLECTION_KEY_RE.test(normalized));
}

export function resolveCollectionKey(_state, key = "") {
  return normalizeCollectionKey(key);
}

export function ensureCollectionKey(state, key = "") {
  const resolved = resolveCollectionKey(state, key);

  if (!resolved) {
    throw new Error("Clave de colección requerida.");
  }

  if (!isValidCollectionKey(resolved)) {
    throw new Error(`Clave de colección inválida: ${resolved}`);
  }

  if (!state || typeof state !== "object") {
    throw new Error("State inválido.");
  }

  if (!isObject(state.entities)) {
    state.entities = {};
  }

  if (!hasOwn(state.entities, resolved)) {
    state.entities[resolved] = [];
  }

  if (!Array.isArray(state.entities[resolved])) {
    state.entities[resolved] = [];
  }

  return resolved;
}

export function hasCollection(state, key = "") {
  const resolved = resolveCollectionKey(state, key);

  return Boolean(
    resolved &&
      isObject(state?.entities) &&
      hasOwn(state.entities, resolved) &&
      Array.isArray(state.entities[resolved])
  );
}

export function getCollection(state, key = "", fallback = []) {
  const resolved = ensureCollectionKey(state, key);
  const value = state.entities[resolved];

  return Array.isArray(value) ? value : fallback;
}

/* =========================================================
   OBJECT PATH
========================================================= */

function normalizePath(path = "") {
  return text(path, "")
    .replace(/\[(["'`]?)(.*?)\1\]/g, ".$2")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !isUnsafeKey(part));
}

function getByPath(object, path = "") {
  const parts = normalizePath(path);

  if (!parts.length) return undefined;

  let current = object;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }

  return current;
}

/* =========================================================
   IDENTITY
========================================================= */

export function getEntityIdentity(item = null) {
  if (!isObject(item)) return null;

  for (const field of IDENTITY_FIELDS) {
    const value = text(item[field], "");

    if (value) return value;
  }

  return null;
}

function sameValue(left, right) {
  if (Object.is(left, right)) return true;

  const a = text(left, "");
  const b = text(right, "");

  if (!a || !b) return false;

  return a === b;
}

function partialMatch(item = null, matcher = {}) {
  if (!isObject(item) || !isObject(matcher)) return false;

  for (const [key, expected] of Object.entries(matcher)) {
    if (isUnsafeKey(key)) return false;
    if (["field", "key", "path", "value", "equals", "eq", "id"].includes(key)) continue;

    const actual = key.includes(".") ? getByPath(item, key) : item[key];

    if (!sameValue(actual, expected)) return false;
  }

  return true;
}

/* =========================================================
   MATCHERS
========================================================= */

export function normalizeMatcher(matcher = null) {
  if (isFunction(matcher)) {
    return (item, index, list) => {
      try {
        return Boolean(matcher(item, index, list));
      } catch {
        return false;
      }
    };
  }

  if (matcher === null || matcher === undefined || matcher === "") {
    return () => false;
  }

  if (typeof matcher === "string" || typeof matcher === "number" || typeof matcher === "boolean") {
    return (item) => sameValue(getEntityIdentity(item), matcher);
  }

  if (isObject(matcher)) {
    if (matcher.id !== undefined) {
      return (item) => sameValue(getEntityIdentity(item), matcher.id);
    }

    const field = matcher.field || matcher.key || matcher.path;
    const value = matcher.value ?? matcher.equals ?? matcher.eq;

    if (field && value !== undefined) {
      return (item) => sameValue(getByPath(item, field), value);
    }

    return (item) => partialMatch(item, matcher);
  }

  return () => false;
}

/* =========================================================
   COLLECTION HELPERS
========================================================= */

export function findCollectionItem(list = [], matcher = null) {
  if (!Array.isArray(list)) return null;

  const match = normalizeMatcher(matcher);

  return list.find((item, index) => match(item, index, list)) || null;
}

export function findCollectionIndex(list = [], matcher = null) {
  if (!Array.isArray(list)) return -1;

  const match = normalizeMatcher(matcher);

  return list.findIndex((item, index) => match(item, index, list));
}

export function collectionIncludes(list = [], matcher = null) {
  return findCollectionIndex(list, matcher) >= 0;
}

export function filterCollection(list = [], matcher = null) {
  if (!Array.isArray(list)) return [];

  const match = normalizeMatcher(matcher);

  return list.filter((item, index) => match(item, index, list));
}

export function removeCollectionItems(list = [], matcher = null) {
  if (!Array.isArray(list)) return [];

  const match = normalizeMatcher(matcher);

  return list.filter((item, index) => !match(item, index, list));
}

export function upsertCollectionItem(list = [], item = null, matcher = null) {
  const output = Array.isArray(list) ? [...list] : [];
  const match = normalizeMatcher(matcher || item);
  const index = output.findIndex((entry, entryIndex) => match(entry, entryIndex, output));

  if (index >= 0) {
    output[index] = clone(item);
  } else {
    output.push(clone(item));
  }

  return output;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getCollectionsSnapshot(state = {}) {
  const entities = isObject(state?.entities) ? state.entities : {};

  return {
    version: COLLECTIONS_VERSION,
    keys: Object.keys(entities),
    counts: Object.fromEntries(
      Object.entries(entities).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.length : value ? 1 : 0,
      ])
    ),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  COLLECTIONS_VERSION,
  IDENTITY_FIELDS,

  normalizeCollectionKey,
  isValidCollectionKey,
  resolveCollectionKey,
  ensureCollectionKey,

  hasCollection,
  getCollection,

  getEntityIdentity,
  normalizeMatcher,

  findCollectionItem,
  findCollectionIndex,
  collectionIncludes,
  filterCollection,
  removeCollectionItems,
  upsertCollectionItem,

  getCollectionsSnapshot,
};
