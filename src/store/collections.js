/* =========================================================
   Onion SPA - Store Collections
   Archivo: src/store/collections.js

   Responsabilidades:
   - validar claves de colecciones registradas
   - normalizar matchers de colección
   - helpers reutilizables para entidades
   - evitar path injection en Store actions
   - resolver ids heterogéneos de backend
   - soportar matcher por función / id / objeto / campos
   - cero throws accidentales salvo uso incorrecto real

   HARDENING EXTREMO:
   - claves estrictas sin puntos ni brackets
   - state.entities obligatorio
   - matcher robusto por id, uuid, ticketId, clienteId, facturaId, userId
   - matcher por objeto con comparación parcial
   - soporte field/path/value
   - comparación segura string/number/null
========================================================= */

import { isFunction } from "./helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const COLLECTION_KEY_PATTERN =
  /^[a-zA-Z0-9_-]{1,80}$/;

const IDENTITY_FIELDS = Object.freeze([
  "id",
  "_id",
  "uuid",
  "uid",

  "ticketId",
  "ticket_id",

  "clienteId",
  "cliente_id",
  "clientId",
  "client_id",

  "facturaId",
  "factura_id",
  "invoiceId",
  "invoice_id",

  "userId",
  "user_id",
  "usuarioId",
  "usuario_id",

  "sessionId",
  "session_id",

  "phone",
  "telefono",
  "email",
  "mail",
]);

/* =========================================================
   BASICS
========================================================= */

function safeText(
  value,
  fallback = ""
) {
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

function isObject(
  value
) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(
  value
) {
  return isObject(value)
    ? value
    : {};
}

function hasOwn(
  object,
  key
) {
  return Boolean(
    object &&
      typeof object === "object" &&
      Object.prototype.hasOwnProperty.call(
        object,
        key
      )
  );
}

function isPrimitiveMatcher(
  value
) {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

/* =========================================================
   COLLECTION KEY
========================================================= */

export function normalizeCollectionKey(
  key = ""
) {
  return safeText(
    key,
    ""
  );
}

export function isValidCollectionKey(
  key = ""
) {
  const normalizedKey =
    normalizeCollectionKey(key);

  return Boolean(
    normalizedKey &&
      COLLECTION_KEY_PATTERN.test(
        normalizedKey
      )
  );
}

/* =========================================================
   VALIDATE COLLECTION KEY
========================================================= */

export function ensureCollectionKey(
  state,
  key
) {
  const normalizedKey =
    normalizeCollectionKey(key);

  if (!normalizedKey) {
    throw new Error(
      "Clave de colección requerida"
    );
  }

  if (
    !isValidCollectionKey(
      normalizedKey
    )
  ) {
    throw new Error(
      `Clave de colección inválida: ${normalizedKey}`
    );
  }

  if (
    !state ||
    !isObject(state.entities)
  ) {
    throw new Error(
      "state.entities no disponible"
    );
  }

  if (
    !hasOwn(
      state.entities,
      normalizedKey
    )
  ) {
    throw new Error(
      `Colección no registrada en store.entities: ${normalizedKey}`
    );
  }

  return normalizedKey;
}

/* =========================================================
   COLLECTION HELPERS
========================================================= */

export function hasCollection(
  state,
  key
) {
  const normalizedKey =
    normalizeCollectionKey(key);

  return Boolean(
    isValidCollectionKey(normalizedKey) &&
      isObject(state?.entities) &&
      hasOwn(state.entities, normalizedKey)
  );
}

export function getCollection(
  state,
  key,
  fallback = []
) {
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
   OBJECT PATH
========================================================= */

function getByPath(
  object,
  path = ""
) {
  const source =
    safeObject(object);

  const cleanPath =
    safeText(path, "");

  if (!cleanPath) {
    return undefined;
  }

  return cleanPath
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      if (
        acc &&
        typeof acc === "object" &&
        hasOwn(acc, part)
      ) {
        return acc[part];
      }

      return undefined;
    }, source);
}

/* =========================================================
   VALUE COMPARE
========================================================= */

function normalizeComparableText(
  value
) {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function valuesEqual(
  a,
  b
) {
  if (a === b) {
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

  const aText =
    safeText(a, "");

  const bText =
    safeText(b, "");

  if (
    aText &&
    bText &&
    aText === bText
  ) {
    return true;
  }

  if (
    aText &&
    bText &&
    normalizeComparableText(aText) ===
      normalizeComparableText(bText)
  ) {
    return true;
  }

  return false;
}

/* =========================================================
   IDENTITY
========================================================= */

export function getEntityIdentity(
  item = null
) {
  if (!isObject(item)) {
    return null;
  }

  for (const field of IDENTITY_FIELDS) {
    const value =
      item[field];

    if (
      value !== null &&
      value !== undefined &&
      safeText(value, "")
    ) {
      return value;
    }
  }

  return null;
}

function getMatcherIdentity(
  matcher = null
) {
  if (isPrimitiveMatcher(matcher)) {
    return matcher;
  }

  if (!isObject(matcher)) {
    return null;
  }

  for (const field of IDENTITY_FIELDS) {
    if (
      hasOwn(matcher, field) &&
      matcher[field] !== null &&
      matcher[field] !== undefined &&
      safeText(matcher[field], "")
    ) {
      return matcher[field];
    }
  }

  return null;
}

function matchByIdentity(
  item,
  matcher
) {
  const itemIdentity =
    getEntityIdentity(item);

  const matcherIdentity =
    getMatcherIdentity(matcher);

  if (
    itemIdentity === null ||
    itemIdentity === undefined ||
    matcherIdentity === null ||
    matcherIdentity === undefined
  ) {
    return false;
  }

  return valuesEqual(
    itemIdentity,
    matcherIdentity
  );
}

/* =========================================================
   FIELD MATCHER
========================================================= */

function normalizeFieldMatcher(
  matcher = {}
) {
  const field =
    safeText(
      matcher.field ??
        matcher.key ??
        matcher.path ??
        "",
      ""
    );

  if (!field) {
    return null;
  }

  if (
    !hasOwn(matcher, "value") &&
    !hasOwn(matcher, "equals")
  ) {
    return null;
  }

  return {
    field,
    value:
      hasOwn(matcher, "value")
        ? matcher.value
        : matcher.equals,
  };
}

function matchByField(
  item,
  matcher = {}
) {
  const normalized =
    normalizeFieldMatcher(matcher);

  if (!normalized) {
    return false;
  }

  return valuesEqual(
    getByPath(
      item,
      normalized.field
    ),
    normalized.value
  );
}

/* =========================================================
   PARTIAL OBJECT MATCHER
========================================================= */

function getComparableMatcherEntries(
  matcher = {}
) {
  return Object
    .entries(
      safeObject(matcher)
    )
    .filter(([key, value]) => {
      if (
        key === "field" ||
        key === "key" ||
        key === "path" ||
        key === "value" ||
        key === "equals"
      ) {
        return false;
      }

      return (
        value !== undefined
      );
    });
}

function matchByPartialObject(
  item,
  matcher = {}
) {
  if (!isObject(item) || !isObject(matcher)) {
    return false;
  }

  const entries =
    getComparableMatcherEntries(
      matcher
    );

  if (!entries.length) {
    return false;
  }

  return entries.every(
    ([key, expected]) => {
      const actual =
        key.includes(".")
          ? getByPath(item, key)
          : item[key];

      return valuesEqual(
        actual,
        expected
      );
    }
  );
}

/* =========================================================
   NORMALIZE MATCHER
========================================================= */

export function normalizeMatcher(
  matcher
) {
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

  if (isObject(matcher)) {
    return (item) => {
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

export function findCollectionItem(
  list = [],
  matcher = null
) {
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

export function findCollectionIndex(
  list = [],
  matcher = null
) {
  if (!Array.isArray(list)) {
    return -1;
  }

  const match =
    normalizeMatcher(matcher);

  return list.findIndex(
    (item, index) =>
      match(item, index, list)
  );
}

export function collectionIncludes(
  list = [],
  matcher = null
) {
  return findCollectionIndex(
    list,
    matcher
  ) >= 0;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  normalizeCollectionKey,
  isValidCollectionKey,
  ensureCollectionKey,

  hasCollection,
  getCollection,

  getEntityIdentity,
  normalizeMatcher,

  findCollectionItem,
  findCollectionIndex,
  collectionIncludes,
};
