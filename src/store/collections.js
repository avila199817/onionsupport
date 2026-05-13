/* =========================================================
   Onion SPA - Store Collections
   Archivo: src/store/collections.js

   ONION SUPPORT · STORE COLLECTIONS
   STRICT ENTITY COLLECTIONS · MATCHERS · IDENTITY SAFE · 14/10

   Responsabilidades:
   - validar claves de colecciones registradas
   - normalizar matchers de colección
   - helpers reutilizables para entidades
   - evitar path injection en Store actions/selectors
   - resolver ids heterogéneos de backend
   - soportar matcher por función / id / objeto / campos
   - soportar aliases seguros de colecciones
   - cero throws accidentales salvo uso incorrecto real

   HARDENING EXTREMO:
   - claves estrictas sin puntos ni brackets
   - state.entities obligatorio
   - matcher robusto por id, uuid, ticketId, clienteId, facturaId, userId
   - matcher por objeto con comparación parcial
   - soporte field/path/value
   - soporte any/all/not
   - comparación segura string/number/boolean/date/null
   - paths internos blindados contra prototype pollution
========================================================= */

import { isFunction } from "./helpers.js";

/* =========================================================
   VERSION
========================================================= */

export const COLLECTIONS_VERSION =
  "14.0.0";

/* =========================================================
   CONSTANTS
========================================================= */

const COLLECTION_KEY_PATTERN =
  /^[a-zA-Z0-9_-]{1,80}$/;

const UNSAFE_PATH_KEYS =
  new Set([
    "__proto__",
    "prototype",
    "constructor",
  ]);

const COLLECTION_ALIASES =
  Object.freeze({
    tickets:
      "incidencias",

    ticket:
      "incidencias",

    incidents:
      "incidencias",

    incident:
      "incidencias",

    invoices:
      "facturas",

    invoice:
      "facturas",

    billing:
      "facturas",

    users:
      "usuarios",

    user:
      "usuarios",

    clients:
      "clientes",

    client:
      "clientes",

    customers:
      "clientes",

    customer:
      "clientes",
  });

export const IDENTITY_FIELDS =
  Object.freeze([
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

const FIELD_MATCHER_KEYS =
  Object.freeze([
    "field",
    "key",
    "path",
  ]);

const VALUE_MATCHER_KEYS =
  Object.freeze([
    "value",
    "equals",
    "eq",
    "is",
  ]);

const CONTROL_MATCHER_KEYS =
  new Set([
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
  return safeText(value, fallback)
    .toLowerCase();
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value) {
  return isObject(value)
    ? value
    : {};
}

function hasOwn(object, key) {
  try {
    return Boolean(
      object &&
        typeof object === "object" &&
        Object.prototype.hasOwnProperty.call(
          object,
          key
        )
    );
  } catch {
    return false;
  }
}

function isPrimitiveMatcher(value) {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  );
}

function isEmptyMatcher(value) {
  return (
    value === null ||
    value === undefined ||
    value === ""
  );
}

function unique(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .flat(Infinity)
        .filter((value) =>
          value !== undefined &&
          value !== null &&
          value !== ""
        )
        .map((value) =>
          typeof value === "string"
            ? value.trim()
            : value
        )
    )
  );
}

/* =========================================================
   COLLECTION KEY
========================================================= */

export function normalizeCollectionKey(key = "") {
  return safeText(key, "");
}

export function isValidCollectionKey(key = "") {
  const normalizedKey =
    normalizeCollectionKey(key);

  return Boolean(
    normalizedKey &&
      COLLECTION_KEY_PATTERN.test(normalizedKey)
  );
}

export function resolveCollectionKey(state, key) {
  const normalizedKey =
    normalizeCollectionKey(key);

  if (!normalizedKey) {
    return "";
  }

  if (
    isObject(state?.entities) &&
    hasOwn(state.entities, normalizedKey)
  ) {
    return normalizedKey;
  }

  const alias =
    COLLECTION_ALIASES[normalizedKey];

  if (
    alias &&
    isObject(state?.entities) &&
    hasOwn(state.entities, alias)
  ) {
    return alias;
  }

  return normalizedKey;
}

/* =========================================================
   VALIDATE COLLECTION KEY
========================================================= */

export function ensureCollectionKey(state, key) {
  const normalizedKey =
    normalizeCollectionKey(key);

  if (!normalizedKey) {
    throw new Error(
      "Clave de colección requerida."
    );
  }

  if (!isValidCollectionKey(normalizedKey)) {
    throw new Error(
      `Clave de colección inválida: ${normalizedKey}`
    );
  }

  if (
    !state ||
    !isObject(state.entities)
  ) {
    throw new Error(
      "state.entities no disponible."
    );
  }

  const resolvedKey =
    resolveCollectionKey(
      state,
      normalizedKey
    );

  if (
    !hasOwn(
      state.entities,
      resolvedKey
    )
  ) {
    throw new Error(
      `Colección no registrada en store.entities: ${normalizedKey}`
    );
  }

  return resolvedKey;
}

/* =========================================================
   COLLECTION HELPERS
========================================================= */

export function hasCollection(state, key) {
  const normalizedKey =
    normalizeCollectionKey(key);

  if (!isValidCollectionKey(normalizedKey)) {
    return false;
  }

  if (!isObject(state?.entities)) {
    return false;
  }

  const resolvedKey =
    resolveCollectionKey(
      state,
      normalizedKey
    );

  return hasOwn(
    state.entities,
    resolvedKey
  );
}

export function getCollection(state, key, fallback = []) {
  const normalizedKey =
    ensureCollectionKey(
      state,
      key
    );

  const value =
    state.entities[normalizedKey];

  return Array.isArray(value)
    ? value
    : fallback;
}

/* =========================================================
   OBJECT PATH · SAFE
========================================================= */

function isUnsafePathKey(key = "") {
  return UNSAFE_PATH_KEYS.has(
    safeText(key, "")
  );
}

function normalizeObjectPath(path = "") {
  return safeText(path, "")
    .replace(/\[(\w+)\]/g, ".$1")
    .split(".")
    .map((part) =>
      part.trim()
    )
    .filter(Boolean)
    .filter((part) =>
      !isUnsafePathKey(part)
    );
}

function getByPath(object, path = "") {
  const cleanPath =
    normalizeObjectPath(path);

  if (!cleanPath.length) {
    return undefined;
  }

  let current =
    object;

  for (const part of cleanPath) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      return undefined;
    }

    if (!hasOwn(current, part)) {
      return undefined;
    }

    current =
      current[part];
  }

  return current;
}

/* =========================================================
   VALUE COMPARE
========================================================= */

function normalizeComparableText(value) {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeComparableNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function normalizeDateTime(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    const time =
      value.getTime();

    return Number.isFinite(time)
      ? time
      : null;
  }

  if (typeof value === "string") {
    const parsed =
      Date.parse(value);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function stableStringify(value, seen = new WeakSet()) {
  if (
    value === null ||
    value === undefined
  ) {
    return String(value);
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return `${typeof value}:${String(value)}`;
  }

  if (value instanceof Date) {
    return `date:${normalizeDateTime(value)}`;
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) =>
      stableStringify(item, seen)
    ).join(",")}]`;
  }

  if (typeof value === "object") {
    try {
      if (seen.has(value)) {
        return "[circular]";
      }

      seen.add(value);
    } catch {}

    const keys =
      Object.keys(value)
        .filter((key) =>
          !isUnsafePathKey(key)
        )
        .sort();

    return `{${keys.map((key) =>
      `${key}:${stableStringify(value[key], seen)}`
    ).join("|")}}`;
  }

  return String(value);
}

function valuesEqual(a, b) {
  if (Object.is(a, b)) {
    return true;
  }

  if (
    a === null ||
    a === undefined ||
    b === null ||
    b === undefined
  ) {
    return false;
  }

  const numberA =
    normalizeComparableNumber(a);

  const numberB =
    normalizeComparableNumber(b);

  if (
    numberA !== null &&
    numberB !== null &&
    numberA === numberB
  ) {
    return true;
  }

  const dateA =
    normalizeDateTime(a);

  const dateB =
    normalizeDateTime(b);

  if (
    dateA !== null &&
    dateB !== null &&
    dateA === dateB
  ) {
    return true;
  }

  const textA =
    safeText(a, "");

  const textB =
    safeText(b, "");

  if (
    textA &&
    textB &&
    textA === textB
  ) {
    return true;
  }

  if (
    textA &&
    textB &&
    normalizeComparableText(textA) ===
      normalizeComparableText(textB)
  ) {
    return true;
  }

  if (
    typeof a === "boolean" ||
    typeof b === "boolean"
  ) {
    const boolA =
      safeLower(a, "");

    const boolB =
      safeLower(b, "");

    if (
      boolA &&
      boolB &&
      boolA === boolB
    ) {
      return true;
    }
  }

  if (
    typeof a === "object" ||
    typeof b === "object"
  ) {
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

function getIdentityEntries(item = null) {
  if (!isObject(item)) {
    return [];
  }

  const entries = [];

  for (const field of IDENTITY_FIELDS) {
    if (
      hasOwn(item, field) &&
      item[field] !== null &&
      item[field] !== undefined &&
      safeText(item[field], "")
    ) {
      entries.push({
        field,
        value:
          item[field],
      });
    }
  }

  return entries;
}

function getIdentityValues(item = null) {
  return unique(
    getIdentityEntries(item)
      .map((entry) =>
        entry.value
      )
  );
}

export function getEntityIdentity(item = null) {
  const values =
    getIdentityValues(item);

  return values.length
    ? values[0]
    : null;
}

function getMatcherIdentityValues(matcher = null) {
  if (isPrimitiveMatcher(matcher)) {
    return [matcher];
  }

  if (!isObject(matcher)) {
    return [];
  }

  if (
    hasOwn(matcher, "identity") &&
    !isEmptyMatcher(matcher.identity)
  ) {
    return [matcher.identity];
  }

  return getIdentityValues(matcher);
}

function matchByIdentity(item, matcher) {
  const itemValues =
    getIdentityValues(item);

  const matcherValues =
    getMatcherIdentityValues(matcher);

  if (
    !itemValues.length ||
    !matcherValues.length
  ) {
    return false;
  }

  return itemValues.some((itemValue) =>
    matcherValues.some((matcherValue) =>
      valuesEqual(
        itemValue,
        matcherValue
      )
    )
  );
}

/* =========================================================
   FIELD MATCHER
========================================================= */

function getFirstMatcherKey(matcher = {}, keys = []) {
  for (const key of keys) {
    if (
      hasOwn(matcher, key) &&
      !isEmptyMatcher(matcher[key])
    ) {
      return matcher[key];
    }
  }

  return "";
}

function hasFieldMatcherShape(matcher = {}) {
  const field =
    getFirstMatcherKey(
      matcher,
      FIELD_MATCHER_KEYS
    );

  if (!field) {
    return false;
  }

  return VALUE_MATCHER_KEYS.some((key) =>
    hasOwn(matcher, key)
  );
}

function normalizeFieldMatcher(matcher = {}) {
  if (!hasFieldMatcherShape(matcher)) {
    return null;
  }

  const field =
    safeText(
      getFirstMatcherKey(
        matcher,
        FIELD_MATCHER_KEYS
      ),
      ""
    );

  if (!field) {
    return null;
  }

  let value =
    undefined;

  for (const key of VALUE_MATCHER_KEYS) {
    if (hasOwn(matcher, key)) {
      value =
        matcher[key];
      break;
    }
  }

  return {
    field,
    value,
  };
}

function matchByField(item, matcher = {}) {
  const normalized =
    normalizeFieldMatcher(matcher);

  if (!normalized) {
    return false;
  }

  const actual =
    getByPath(
      item,
      normalized.field
    );

  return valuesEqual(
    actual,
    normalized.value
  );
}

/* =========================================================
   PARTIAL OBJECT MATCHER
========================================================= */

function getComparableMatcherEntries(matcher = {}) {
  return Object
    .entries(
      safeObject(matcher)
    )
    .filter(([key, value]) => {
      if (isUnsafePathKey(key)) {
        return false;
      }

      if (
        hasFieldMatcherShape(matcher) &&
        CONTROL_MATCHER_KEYS.has(key)
      ) {
        return false;
      }

      if (
        [
          "where",
          "any",
          "or",
          "all",
          "and",
          "not",
        ].includes(key)
      ) {
        return false;
      }

      return value !== undefined;
    });
}

function matchByPartialObject(item, matcher = {}) {
  if (
    !isObject(item) ||
    !isObject(matcher)
  ) {
    return false;
  }

  const source =
    hasOwn(matcher, "where") &&
    isObject(matcher.where)
      ? matcher.where
      : matcher;

  const entries =
    getComparableMatcherEntries(source);

  if (!entries.length) {
    return false;
  }

  return entries.every(([key, expected]) => {
    const actual =
      key.includes(".")
        ? getByPath(item, key)
        : item[key];

    return valuesEqual(
      actual,
      expected
    );
  });
}

/* =========================================================
   LOGICAL MATCHERS
========================================================= */

function normalizeMatcherList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value;
}

function matchAny(item, matchers = []) {
  const list =
    normalizeMatcherList(matchers);

  if (!list.length) {
    return false;
  }

  return list.some((matcher) =>
    normalizeMatcher(matcher)(item)
  );
}

function matchAll(item, matchers = []) {
  const list =
    normalizeMatcherList(matchers);

  if (!list.length) {
    return false;
  }

  return list.every((matcher) =>
    normalizeMatcher(matcher)(item)
  );
}

function matchNot(item, matcher = null) {
  if (
    matcher === null ||
    matcher === undefined
  ) {
    return false;
  }

  return !normalizeMatcher(matcher)(item);
}

/* =========================================================
   NORMALIZE MATCHER
========================================================= */

export function normalizeMatcher(matcher) {
  if (isFunction(matcher)) {
    return (item, index, list) => {
      try {
        return Boolean(
          matcher(
            item,
            index,
            list
          )
        );
      } catch {
        return false;
      }
    };
  }

  if (
    matcher === null ||
    matcher === undefined ||
    matcher === ""
  ) {
    return () => false;
  }

  if (isPrimitiveMatcher(matcher)) {
    return (item) =>
      matchByIdentity(
        item,
        matcher
      );
  }

  if (Array.isArray(matcher)) {
    return (item) =>
      matchAny(
        item,
        matcher
      );
  }

  if (isObject(matcher)) {
    return (item) => {
      if (Array.isArray(matcher.any)) {
        return matchAny(
          item,
          matcher.any
        );
      }

      if (Array.isArray(matcher.or)) {
        return matchAny(
          item,
          matcher.or
        );
      }

      if (Array.isArray(matcher.all)) {
        return matchAll(
          item,
          matcher.all
        );
      }

      if (Array.isArray(matcher.and)) {
        return matchAll(
          item,
          matcher.and
        );
      }

      if (hasOwn(matcher, "not")) {
        return matchNot(
          item,
          matcher.not
        );
      }

      if (
        matchByIdentity(
          item,
          matcher
        )
      ) {
        return true;
      }

      if (
        matchByField(
          item,
          matcher
        )
      ) {
        return true;
      }

      return matchByPartialObject(
        item,
        matcher
      );
    };
  }

  return () => false;
}

/* =========================================================
   ENTITY HELPERS
========================================================= */

export function findCollectionItem(list = [], matcher = null) {
  if (!Array.isArray(list)) {
    return null;
  }

  const match =
    normalizeMatcher(matcher);

  return (
    list.find((item, index) =>
      match(item, index, list)
    ) || null
  );
}

export function findCollectionIndex(list = [], matcher = null) {
  if (!Array.isArray(list)) {
    return -1;
  }

  const match =
    normalizeMatcher(matcher);

  return list.findIndex((item, index) =>
    match(item, index, list)
  );
}

export function collectionIncludes(list = [], matcher = null) {
  return findCollectionIndex(
    list,
    matcher
  ) >= 0;
}

export function filterCollection(list = [], matcher = null) {
  if (!Array.isArray(list)) {
    return [];
  }

  const match =
    normalizeMatcher(matcher);

  return list.filter((item, index) =>
    match(item, index, list)
  );
}

export function removeCollectionItems(list = [], matcher = null) {
  if (!Array.isArray(list)) {
    return [];
  }

  const match =
    normalizeMatcher(matcher);

  return list.filter((item, index) =>
    !match(item, index, list)
  );
}

export function upsertCollectionItem(list = [], item = null, matcher = null) {
  const source =
    Array.isArray(list)
      ? [...list]
      : [];

  const match =
    normalizeMatcher(
      matcher || item
    );

  const index =
    source.findIndex((entry, entryIndex) =>
      match(entry, entryIndex, source)
    );

  if (index >= 0) {
    source[index] =
      item;
  } else {
    source.push(item);
  }

  return source;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getCollectionsSnapshot(state = {}) {
  const entities =
    safeObject(state?.entities);

  return {
    version:
      COLLECTIONS_VERSION,

    keys:
      Object.keys(entities),

    aliases:
      {
        ...COLLECTION_ALIASES,
      },

    counts:
      Object.fromEntries(
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
