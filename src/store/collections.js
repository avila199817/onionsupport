/* =========================================================
   Onion SPA - Store Collections
   Archivo: src/store/collections.js

   Store Collections limpio:
   - Claves estrictas.
   - Aliases seguros.
   - Matchers simples por id, campo, objeto parcial y lógica.
   - Sin path injection.
   - Sin prototype pollution.
========================================================= */

import { isFunction } from "./helpers.js";

/* =========================================================
   VERSION
========================================================= */

export const COLLECTIONS_VERSION = "15.0.0-clean";

/* =========================================================
   CONSTANTS
========================================================= */

const COLLECTION_KEY_RE = /^[a-zA-Z0-9_-]{1,80}$/;

const UNSAFE_PATH_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

const COLLECTION_ALIASES = Object.freeze({
  ticket: "tickets",
  tickets: "tickets",
  incidencia: "incidencias",
  incidencias: "incidencias",
  incident: "incidencias",
  incidents: "incidencias",

  factura: "facturas",
  facturas: "facturas",
  invoice: "facturas",
  invoices: "facturas",
  billing: "facturas",

  cliente: "clientes",
  clientes: "clientes",
  client: "clientes",
  clients: "clientes",
  customer: "clientes",
  customers: "clientes",

  usuario: "usuarios",
  usuarios: "usuarios",
  user: "usuarios",
  users: "usuarios",

  hardware: "hardware",
  device: "hardware",
  devices: "hardware",
  equipo: "hardware",
  equipos: "hardware",

  reciente: "recientes",
  recientes: "recientes",
  recent: "recientes",
  recents: "recientes",

  search: "search",
  busqueda: "search",
  búsquedas: "search",
});

export const IDENTITY_FIELDS = Object.freeze([
  "id",
  "_id",
  "uuid",
  "uid",
  "sub",

  "ticketId",
  "ticket_id",
  "incidenciaId",
  "incidencia_id",
  "caseId",
  "case_id",

  "clienteId",
  "cliente_id",
  "clientId",
  "client_id",
  "customerId",
  "customer_id",

  "facturaId",
  "factura_id",
  "invoiceId",
  "invoice_id",
  "numeroFacturaLegal",
  "numero_factura_legal",
  "invoiceNumber",
  "invoice_number",

  "userId",
  "user_id",
  "usuarioId",
  "usuario_id",
  "accountId",
  "account_id",

  "hardwareId",
  "hardware_id",
  "deviceId",
  "device_id",
  "serial",
  "serialNumber",
  "serial_number",

  "sessionId",
  "session_id",

  "phone",
  "telefono",
  "mobile",
  "email",
  "mail",
  "slug",
  "username",
  "usernameLower",
  "username_lower",
]);

const FIELD_KEYS = Object.freeze([
  "field",
  "key",
  "path",
]);

const VALUE_KEYS = Object.freeze([
  "value",
  "equals",
  "eq",
  "is",
]);

const CONTROL_KEYS = new Set([
  "field",
  "key",
  "path",
  "value",
  "equals",
  "eq",
  "is",
  "where",
  "any",
  "or",
  "all",
  "and",
  "not",
  "identity",
  "id",
]);

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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function hasOwn(object, key) {
  try {
    return Boolean(
      object &&
        typeof object === "object" &&
        Object.prototype.hasOwnProperty.call(object, key)
    );
  } catch {
    return false;
  }
}

function isPrimitive(value) {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  );
}

function isEmpty(value) {
  return value === null || value === undefined || value === "";
}

function unique(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .flat(Infinity)
        .filter((value) => value !== undefined && value !== null && value !== "")
        .map((value) => (typeof value === "string" ? value.trim() : value))
    )
  );
}

/* =========================================================
   COLLECTION KEYS
========================================================= */

export function normalizeCollectionKey(key = "") {
  return safeText(key, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "");
}

export function isValidCollectionKey(key = "") {
  const normalized = normalizeCollectionKey(key);
  return Boolean(normalized && COLLECTION_KEY_RE.test(normalized));
}

export function resolveCollectionKey(state, key) {
  const normalized = normalizeCollectionKey(key);

  if (!normalized) return "";

  const entities = safeObject(state?.entities);
  const alias = COLLECTION_ALIASES[normalized] || normalized;

  if (hasOwn(entities, normalized)) return normalized;
  if (hasOwn(entities, alias)) return alias;

  return alias;
}

export function ensureCollectionKey(state, key) {
  const normalized = normalizeCollectionKey(key);

  if (!normalized) {
    throw new Error("Clave de colección requerida.");
  }

  if (!isValidCollectionKey(normalized)) {
    throw new Error(`Clave de colección inválida: ${normalized}`);
  }

  if (!state || !isObject(state.entities)) {
    throw new Error("state.entities no disponible.");
  }

  const resolved = resolveCollectionKey(state, normalized);

  if (!hasOwn(state.entities, resolved)) {
    throw new Error(`Colección no registrada en store.entities: ${normalized}`);
  }

  return resolved;
}

export function hasCollection(state, key) {
  if (!isValidCollectionKey(key)) return false;
  if (!isObject(state?.entities)) return false;

  const resolved = resolveCollectionKey(state, key);
  return hasOwn(state.entities, resolved);
}

export function getCollection(state, key, fallback = []) {
  const resolved = ensureCollectionKey(state, key);
  const value = state.entities[resolved];

  return Array.isArray(value) ? value : fallback;
}

/* =========================================================
   SAFE PATHS
========================================================= */

function isUnsafePathKey(key = "") {
  return UNSAFE_PATH_KEYS.has(safeText(key, ""));
}

function normalizeObjectPath(path = "") {
  return safeText(path, "")
    .replace(/\[(\w+)\]/g, ".$1")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !isUnsafePathKey(part));
}

function getByPath(object, path = "") {
  const parts = normalizeObjectPath(path);

  if (!parts.length) return undefined;

  let current = object;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }

    if (!hasOwn(current, part)) {
      return undefined;
    }

    current = current[part];
  }

  return current;
}

/* =========================================================
   VALUE COMPARE
========================================================= */

function comparableText(value) {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function comparableNumber(value) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function comparableDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function stableStringify(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return String(value);

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return `${typeof value}:${String(value)}`;
  }

  if (value instanceof Date) {
    return `date:${comparableDate(value)}`;
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item, seen)).join(",")}]`;
  }

  if (typeof value === "object") {
    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    const keys = Object.keys(value)
      .filter((key) => !isUnsafePathKey(key))
      .sort();

    return `{${keys.map((key) => `${key}:${stableStringify(value[key], seen)}`).join("|")}}`;
  }

  return String(value);
}

function valuesEqual(a, b) {
  if (Object.is(a, b)) return true;

  if (a === null || a === undefined || b === null || b === undefined) {
    return false;
  }

  const numberA = comparableNumber(a);
  const numberB = comparableNumber(b);

  if (numberA !== null && numberB !== null && numberA === numberB) {
    return true;
  }

  const dateA = comparableDate(a);
  const dateB = comparableDate(b);

  if (dateA !== null && dateB !== null && dateA === dateB) {
    return true;
  }

  const textA = safeText(a, "");
  const textB = safeText(b, "");

  if (textA && textB && textA === textB) return true;
  if (textA && textB && comparableText(textA) === comparableText(textB)) return true;

  if (typeof a === "object" || typeof b === "object") {
    try {
      return stableStringify(a) === stableStringify(b);
    } catch {
      return false;
    }
  }

  return false;
}

/* =========================================================
   IDENTITY
========================================================= */

function identityEntries(item = null) {
  if (!isObject(item)) return [];

  const entries = [];

  for (const field of IDENTITY_FIELDS) {
    const value = item[field];

    if (value !== null && value !== undefined && safeText(value, "")) {
      entries.push({ field, value });
    }
  }

  return entries;
}

function identityValues(item = null) {
  return unique(identityEntries(item).map((entry) => entry.value));
}

export function getEntityIdentity(item = null) {
  const values = identityValues(item);
  return values.length ? values[0] : null;
}

function matcherIdentityValues(matcher = null) {
  if (isPrimitive(matcher)) return [matcher];

  if (!isObject(matcher)) return [];

  if (hasOwn(matcher, "identity") && !isEmpty(matcher.identity)) {
    return [matcher.identity];
  }

  return identityValues(matcher);
}

function matchByIdentity(item, matcher) {
  const itemValues = identityValues(item);
  const matcherValues = matcherIdentityValues(matcher);

  if (!itemValues.length || !matcherValues.length) return false;

  return itemValues.some((itemValue) =>
    matcherValues.some((matcherValue) => valuesEqual(itemValue, matcherValue))
  );
}

/* =========================================================
   FIELD MATCHER
========================================================= */

function firstMatcherValue(matcher = {}, keys = []) {
  for (const key of keys) {
    if (hasOwn(matcher, key) && !isEmpty(matcher[key])) {
      return matcher[key];
    }
  }

  return "";
}

function hasFieldMatcher(matcher = {}) {
  const field = firstMatcherValue(matcher, FIELD_KEYS);
  return Boolean(field && VALUE_KEYS.some((key) => hasOwn(matcher, key)));
}

function fieldMatcher(matcher = {}) {
  if (!hasFieldMatcher(matcher)) return null;

  const field = safeText(firstMatcherValue(matcher, FIELD_KEYS), "");
  if (!field) return null;

  let value;

  for (const key of VALUE_KEYS) {
    if (hasOwn(matcher, key)) {
      value = matcher[key];
      break;
    }
  }

  return { field, value };
}

function matchByField(item, matcher = {}) {
  const normalized = fieldMatcher(matcher);

  if (!normalized) return false;

  return valuesEqual(getByPath(item, normalized.field), normalized.value);
}

/* =========================================================
   PARTIAL OBJECT MATCHER
========================================================= */

function partialEntries(matcher = {}) {
  return Object.entries(safeObject(matcher)).filter(([key, value]) => {
    if (isUnsafePathKey(key)) return false;

    if (hasFieldMatcher(matcher) && CONTROL_KEYS.has(key)) {
      return false;
    }

    if (["where", "any", "or", "all", "and", "not"].includes(key)) {
      return false;
    }

    return value !== undefined;
  });
}

function matchPartialObject(item, matcher = {}) {
  if (!isObject(item) || !isObject(matcher)) return false;

  const source = hasOwn(matcher, "where") && isObject(matcher.where)
    ? matcher.where
    : matcher;

  const entries = partialEntries(source);

  if (!entries.length) return false;

  return entries.every(([key, expected]) => {
    const actual = key.includes(".")
      ? getByPath(item, key)
      : item[key];

    return valuesEqual(actual, expected);
  });
}

/* =========================================================
   LOGICAL MATCHERS
========================================================= */

function matchAny(item, matchers = []) {
  if (!Array.isArray(matchers) || !matchers.length) return false;
  return matchers.some((matcher) => normalizeMatcher(matcher)(item));
}

function matchAll(item, matchers = []) {
  if (!Array.isArray(matchers) || !matchers.length) return false;
  return matchers.every((matcher) => normalizeMatcher(matcher)(item));
}

function matchNot(item, matcher = null) {
  if (matcher === null || matcher === undefined) return false;
  return !normalizeMatcher(matcher)(item);
}

/* =========================================================
   NORMALIZE MATCHER
========================================================= */

export function normalizeMatcher(matcher) {
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

  if (isPrimitive(matcher)) {
    return (item) => matchByIdentity(item, matcher);
  }

  if (Array.isArray(matcher)) {
    return (item) => matchAny(item, matcher);
  }

  if (isObject(matcher)) {
    return (item) => {
      if (Array.isArray(matcher.any)) return matchAny(item, matcher.any);
      if (Array.isArray(matcher.or)) return matchAny(item, matcher.or);
      if (Array.isArray(matcher.all)) return matchAll(item, matcher.all);
      if (Array.isArray(matcher.and)) return matchAll(item, matcher.and);
      if (hasOwn(matcher, "not")) return matchNot(item, matcher.not);

      return (
        matchByIdentity(item, matcher) ||
        matchByField(item, matcher) ||
        matchPartialObject(item, matcher)
      );
    };
  }

  return () => false;
}

/* =========================================================
   ENTITY HELPERS
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
  const source = Array.isArray(list) ? [...list] : [];
  const match = normalizeMatcher(matcher || item);
  const index = source.findIndex((entry, entryIndex) => match(entry, entryIndex, source));

  if (index >= 0) source[index] = item;
  else source.push(item);

  return source;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getCollectionsSnapshot(state = {}) {
  const entities = safeObject(state?.entities);

  return {
    version: COLLECTIONS_VERSION,

    keys: Object.keys(entities),

    aliases: {
      ...COLLECTION_ALIASES,
    },

    counts: Object.fromEntries(
      Object.entries(entities).map(([key, value]) => [
        key,
        Array.isArray(value)
          ? value.length
          : value
            ? 1
            : 0,
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
