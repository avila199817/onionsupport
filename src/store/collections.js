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

const SENSITIVE_KEY_RE =
  /(^auth$|^session$|^sessionData$|^currentUser$|^authUser$|^sessionUser$|^user$|token|authorization|cookie|password|passwd|pwd|secret|credential|jwt|bearer|refresh|accessToken|access_token|idToken|id_token|apiKey|api_key|privateKey|private_key|connectionString|connection_string|sas|otp|totp|mfa|twofa|2fa|backupCode|backup_code|backupCodes|backup_codes|sessionId|session_id|^role$|^roles$|^permissions$|^_rid$|^_self$|^_etag$|^_attachments$|^_ts$)/i;

export const IDENTITY_FIELDS = Object.freeze([
  "id",
  "uuid",
  "userId",
  "ticketId",
  "clienteId",
  "facturaId",
  "invoiceId",
]);

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(Object(object), key);
}

function clone(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {
    // fallback abajo
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function isUnsafeKey(key = "") {
  return UNSAFE_KEYS.has(String(key || "").trim());
}

function isSensitiveKey(key = "") {
  return SENSITIVE_KEY_RE.test(String(key || "").trim());
}

function sanitizeValue(value, keyHint = "") {
  if (isUnsafeKey(keyHint) || isSensitiveKey(keyHint)) {
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

  if (isObject(value)) {
    const output = {};

    for (const [key, child] of Object.entries(value)) {
      if (isUnsafeKey(key)) continue;
      if (isSensitiveKey(key)) continue;

      const clean = sanitizeValue(child, key);

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
    return clone(value);
  }

  return undefined;
}

function listFrom(value = []) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => sanitizeValue(item))
    .filter((item) => item !== undefined);
}

/* =========================================================
   COLLECTION KEYS
========================================================= */

export function normalizeCollectionKey(key = "") {
  const normalized = text(key, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized) return "";
  if (!COLLECTION_KEY_RE.test(normalized)) return "";
  if (isUnsafeKey(normalized)) return "";
  if (isSensitiveKey(normalized)) return "";

  return normalized;
}

export function isValidCollectionKey(key = "") {
  return Boolean(normalizeCollectionKey(key));
}

export function resolveCollectionKey(_state, key = "") {
  return normalizeCollectionKey(key);
}

export function ensureCollectionKey(state, key = "") {
  const resolved = resolveCollectionKey(state, key);

  if (!resolved) {
    throw new Error("Clave de colección requerida.");
  }

  if (!isObject(state)) {
    throw new Error("State inválido.");
  }

  if (!isObject(state.entities)) {
    state.entities = {};
  }

  if (!hasOwn(state.entities, resolved)) {
    state.entities[resolved] = [];
  }

  if (!Array.isArray(state.entities[resolved])) {
    throw new Error(`La colección no es una lista: ${resolved}`);
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
  const resolved = resolveCollectionKey(state, key);

  if (
    !resolved ||
    !isObject(state?.entities) ||
    !hasOwn(state.entities, resolved) ||
    !Array.isArray(state.entities[resolved])
  ) {
    return clone(fallback);
  }

  return clone(state.entities[resolved]);
}

/* =========================================================
   OBJECT PATH
========================================================= */

function normalizePath(path = "") {
  const source = String(path ?? "")
    .replace(/\[(["'`]?)(.*?)\1\]/g, ".$2")
    .split(".");

  const parts = source
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) return [];
  if (parts.some(isUnsafeKey)) return [];
  if (parts.some(isSensitiveKey)) return [];

  return parts;
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
    if (isSensitiveKey(key)) return false;

    if (
      ["field", "key", "path", "value", "equals", "eq", "id"].includes(key)
    ) {
      continue;
    }

    const actual = key.includes(".")
      ? getByPath(item, key)
      : item[key];

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
        return Boolean(matcher(clone(item), index, clone(list)));
      } catch {
        return false;
      }
    };
  }

  if (matcher === null || matcher === undefined || matcher === "") {
    return () => false;
  }

  if (
    typeof matcher === "string" ||
    typeof matcher === "number" ||
    typeof matcher === "boolean"
  ) {
    return (item) => sameValue(getEntityIdentity(item), matcher);
  }

  if (isObject(matcher)) {
    if (matcher.id !== undefined) {
      return (item) => sameValue(getEntityIdentity(item), matcher.id);
    }

    const field = matcher.field || matcher.key || matcher.path;
    const value = matcher.value ?? matcher.equals ?? matcher.eq;

    if (field && value !== undefined) {
      const path = normalizePath(field);

      if (!path.length) return () => false;

      return (item) => sameValue(getByPath(item, path.join(".")), value);
    }

    return (item) => partialMatch(item, matcher);
  }

  return () => false;
}

/* =========================================================
   COLLECTION HELPERS
========================================================= */

export function findCollectionItem(list = [], matcher = null) {
  const current = listFrom(list);

  if (!current.length) return null;

  const match = normalizeMatcher(matcher);

  return current.find((item, index) => match(item, index, current)) || null;
}

export function findCollectionIndex(list = [], matcher = null) {
  const current = listFrom(list);

  if (!current.length) return -1;

  const match = normalizeMatcher(matcher);

  return current.findIndex((item, index) => match(item, index, current));
}

export function collectionIncludes(list = [], matcher = null) {
  return findCollectionIndex(list, matcher) >= 0;
}

export function filterCollection(list = [], matcher = null) {
  const current = listFrom(list);

  if (!current.length) return [];

  const match = normalizeMatcher(matcher);

  return current.filter((item, index) => match(item, index, current));
}

export function removeCollectionItems(list = [], matcher = null) {
  const current = listFrom(list);

  if (!current.length) return [];

  const match = normalizeMatcher(matcher);

  return current.filter((item, index) => !match(item, index, current));
}

export function upsertCollectionItem(list = [], item = null, matcher = null) {
  const output = listFrom(list);
  const cleanItem = sanitizeValue(item);

  if (cleanItem === undefined) {
    return output;
  }

  const match = normalizeMatcher(matcher || cleanItem);
  const index = output.findIndex((entry, entryIndex) => {
    return match(entry, entryIndex, output);
  });

  if (index >= 0) {
    output[index] = cleanItem;
  } else {
    output.push(cleanItem);
  }

  return output;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getCollectionsSnapshot(state = {}) {
  const entities = isObject(state?.entities) ? state.entities : {};
  const entries = Object.entries(entities).filter(([key]) => {
    return isValidCollectionKey(key);
  });

  return {
    version: COLLECTIONS_VERSION,
    keys: entries.map(([key]) => key),
    counts: Object.fromEntries(
      entries.map(([key, value]) => [
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
