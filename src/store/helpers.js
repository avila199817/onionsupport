/* =========================================================
   Onion SPA - Store Helpers
   Archivo: src/store/helpers.js

   Responsabilidades:
   - helpers base puros del store
   - clones robustos / igualdad profunda
   - acceso seguro por path
   - escritura / borrado por path
   - merge profundo inmutable
   - detección de paths cambiados
   - normalización de colecciones
   - helpers internos reutilizables
   - hardening contra prototype pollution
   - tolerancia a arrays / objetos / fechas / regex / map / set
========================================================= */

/* =========================================================
   RUNTIME
========================================================= */

export function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

export function isFunction(value) {
  return typeof value === "function";
}

export function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

export function isPlainObject(value) {
  if (!isObject(value)) {
    return false;
  }

  const prototype =
    Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

export function isPrimitive(value) {
  return (
    value === null ||
    (
      typeof value !== "object" &&
      typeof value !== "function"
    )
  );
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

/* =========================================================
   SAFE TEXT / NUMBERS
========================================================= */

export function safeText(
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

export function safeNumber(
  value,
  fallback = 0
) {
  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

export function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

/* =========================================================
   CLONE
========================================================= */

export function deepClone(value) {
  if (value === undefined) {
    return undefined;
  }

  if (isPrimitive(value) || isFunction(value)) {
    return value;
  }

  try {
    if (
      typeof structuredClone === "function"
    ) {
      return structuredClone(value);
    }
  } catch {
    /* fallback */
  }

  if (isDate(value)) {
    return new Date(value.getTime());
  }

  if (isRegExp(value)) {
    return new RegExp(
      value.source,
      value.flags
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      deepClone(item)
    );
  }

  if (isMap(value)) {
    const next =
      new Map();

    value.forEach((mapValue, mapKey) => {
      next.set(
        deepClone(mapKey),
        deepClone(mapValue)
      );
    });

    return next;
  }

  if (isSet(value)) {
    const next =
      new Set();

    value.forEach((item) => {
      next.add(
        deepClone(item)
      );
    });

    return next;
  }

  if (isObject(value)) {
    const output = {};

    Object.keys(value).forEach((key) => {
      output[key] =
        deepClone(value[key]);
    });

    return output;
  }

  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {
    return value;
  }
}

/* =========================================================
   EQUALITY
========================================================= */

function deepEqualMap(a, b) {
  if (a.size !== b.size) {
    return false;
  }

  for (const [key, value] of a.entries()) {
    if (!b.has(key)) {
      return false;
    }

    if (
      !deepEqual(
        value,
        b.get(key)
      )
    ) {
      return false;
    }
  }

  return true;
}

function deepEqualSet(a, b) {
  if (a.size !== b.size) {
    return false;
  }

  for (const value of a.values()) {
    if (!b.has(value)) {
      return false;
    }
  }

  return true;
}

export function deepEqual(a, b) {
  if (Object.is(a, b)) {
    return true;
  }

  if (
    typeof a !== typeof b
  ) {
    return false;
  }

  if (
    isPrimitive(a) ||
    isPrimitive(b)
  ) {
    return false;
  }

  if (
    isDate(a) ||
    isDate(b)
  ) {
    return (
      isDate(a) &&
      isDate(b) &&
      a.getTime() === b.getTime()
    );
  }

  if (
    isRegExp(a) ||
    isRegExp(b)
  ) {
    return (
      isRegExp(a) &&
      isRegExp(b) &&
      a.source === b.source &&
      a.flags === b.flags
    );
  }

  if (
    isMap(a) ||
    isMap(b)
  ) {
    return (
      isMap(a) &&
      isMap(b) &&
      deepEqualMap(a, b)
    );
  }

  if (
    isSet(a) ||
    isSet(b)
  ) {
    return (
      isSet(a) &&
      isSet(b) &&
      deepEqualSet(a, b)
    );
  }

  if (
    Array.isArray(a) ||
    Array.isArray(b)
  ) {
    if (
      !Array.isArray(a) ||
      !Array.isArray(b)
    ) {
      return false;
    }

    if (a.length !== b.length) {
      return false;
    }

    for (
      let i = 0;
      i < a.length;
      i += 1
    ) {
      if (
        !deepEqual(
          a[i],
          b[i]
        )
      ) {
        return false;
      }
    }

    return true;
  }

  if (
    isObject(a) &&
    isObject(b)
  ) {
    const aKeys =
      Object.keys(a);

    const bKeys =
      Object.keys(b);

    if (
      aKeys.length !== bKeys.length
    ) {
      return false;
    }

    for (const key of aKeys) {
      if (
        !Object.prototype.hasOwnProperty.call(
          b,
          key
        )
      ) {
        return false;
      }

      if (
        !deepEqual(
          a[key],
          b[key]
        )
      ) {
        return false;
      }
    }

    return true;
  }

  return false;
}

/* =========================================================
   PATH SAFETY
========================================================= */

const UNSAFE_PATH_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

function isUnsafePathKey(key = "") {
  return UNSAFE_PATH_KEYS.has(
    String(key || "").trim()
  );
}

function normalizePath(path) {
  if (Array.isArray(path)) {
    return path
      .map((part) =>
        String(part ?? "").trim()
      )
      .filter(Boolean)
      .filter((part) =>
        !isUnsafePathKey(part)
      );
  }

  return String(path || "")
    .replace(
      /\[(\w+)\]/g,
      ".$1"
    )
    .split(".")
    .map((part) =>
      part.trim()
    )
    .filter(Boolean)
    .filter((part) =>
      !isUnsafePathKey(part)
    );
}

function isNumericKey(key = "") {
  return /^\d+$/.test(
    String(key)
  );
}

function createNextContainer(nextKey = "") {
  return isNumericKey(nextKey)
    ? []
    : {};
}

/* =========================================================
   PATH HELPERS
========================================================= */

export function getByPath(
  obj,
  path,
  fallback = undefined
) {
  if (!path) {
    return obj;
  }

  const keys =
    normalizePath(path);

  if (!keys.length) {
    return fallback;
  }

  let current = obj;

  for (const key of keys) {
    if (
      current === null ||
      current === undefined
    ) {
      return fallback;
    }

    current =
      current[key];
  }

  return current === undefined
    ? fallback
    : current;
}

export function hasByPath(
  obj,
  path
) {
  if (!path) {
    return obj !== undefined;
  }

  const keys =
    normalizePath(path);

  if (!keys.length) {
    return false;
  }

  let current = obj;

  for (const key of keys) {
    if (
      current === null ||
      current === undefined
    ) {
      return false;
    }

    if (
      !Object.prototype.hasOwnProperty.call(
        Object(current),
        key
      )
    ) {
      return false;
    }

    current =
      current[key];
  }

  return true;
}

export function setByPath(
  obj,
  path,
  value
) {
  const keys =
    normalizePath(path);

  const lastKey =
    keys.pop();

  if (!obj || !lastKey) {
    return obj;
  }

  let current = obj;

  keys.forEach((key, index) => {
    const nextKey =
      keys[index + 1] || lastKey;

    const next =
      current[key];

    if (
      !isObject(next) &&
      !Array.isArray(next)
    ) {
      current[key] =
        createNextContainer(nextKey);
    }

    current =
      current[key];
  });

  current[lastKey] = value;

  return obj;
}

export function deleteByPath(
  obj,
  path
) {
  const keys =
    normalizePath(path);

  const lastKey =
    keys.pop();

  if (!obj || !lastKey) {
    return obj;
  }

  let current = obj;

  for (const key of keys) {
    if (
      current === null ||
      current === undefined ||
      (
        !isObject(current[key]) &&
        !Array.isArray(current[key])
      )
    ) {
      return obj;
    }

    current =
      current[key];
  }

  if (
    isObject(current) ||
    Array.isArray(current)
  ) {
    delete current[lastKey];
  }

  return obj;
}

/* =========================================================
   MERGE
========================================================= */

function canMergeDeep(value) {
  return (
    isPlainObject(value) ||
    Array.isArray(value)
  );
}

export function mergeDeep(
  target,
  source
) {
  if (source === undefined) {
    return deepClone(target);
  }

  if (Array.isArray(source)) {
    return source.map((item) =>
      deepClone(item)
    );
  }

  if (!isPlainObject(source)) {
    return deepClone(source);
  }

  const output =
    isPlainObject(target)
      ? { ...target }
      : {};

  Object.keys(source).forEach((key) => {
    if (isUnsafePathKey(key)) {
      return;
    }

    const sourceValue =
      source[key];

    const targetValue =
      output[key];

    if (Array.isArray(sourceValue)) {
      output[key] =
        sourceValue.map((item) =>
          deepClone(item)
        );

      return;
    }

    if (
      canMergeDeep(sourceValue) &&
      isPlainObject(sourceValue)
    ) {
      output[key] =
        mergeDeep(
          targetValue,
          sourceValue
        );

      return;
    }

    output[key] =
      deepClone(sourceValue);
  });

  return output;
}

/* =========================================================
   CHANGED PATHS
========================================================= */

export function collectChangedPaths(
  input,
  prefix = ""
) {
  if (
    !isObject(input) &&
    !Array.isArray(input)
  ) {
    return prefix
      ? [prefix]
      : [];
  }

  const paths = [];

  Object.entries(input).forEach(
    ([key, value]) => {
      if (isUnsafePathKey(key)) {
        return;
      }

      const nextPath =
        prefix
          ? `${prefix}.${key}`
          : key;

      paths.push(nextPath);

      /*
        Recursión sólo para objetos planos.
        Arrays se notifican como colección completa.
      */
      if (isPlainObject(value)) {
        paths.push(
          ...collectChangedPaths(
            value,
            nextPath
          )
        );
      }
    }
  );

  return Array.from(
    new Set(paths)
  );
}

/* =========================================================
   COLLECTIONS
========================================================= */

export function normalizeCollection(
  items,
  fallback = []
) {
  if (!Array.isArray(items)) {
    return Array.isArray(fallback)
      ? fallback.map((item) =>
          deepClone(item)
        )
      : [];
  }

  return items.map((item) =>
    deepClone(item)
  );
}

export function collectionToMap(
  items = [],
  key = "id"
) {
  const map =
    new Map();

  normalizeCollection(items).forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }

    const id =
      item[key];

    if (
      id === null ||
      id === undefined ||
      id === ""
    ) {
      return;
    }

    map.set(
      String(id),
      item
    );
  });

  return map;
}

export function upsertCollection(
  items = [],
  nextItem = null,
  matcher = null
) {
  const list =
    normalizeCollection(items);

  if (!nextItem) {
    return list;
  }

  const match =
    isFunction(matcher)
      ? matcher
      : (item) =>
          item?.id === nextItem?.id;

  const index =
    list.findIndex((item) =>
      match(item)
    );

  const cloned =
    deepClone(nextItem);

  if (index >= 0) {
    list[index] = cloned;
  } else {
    list.push(cloned);
  }

  return list;
}

export function removeFromCollection(
  items = [],
  matcher
) {
  const list =
    normalizeCollection(items);

  const match =
    isFunction(matcher)
      ? matcher
      : (item) =>
          item?.id === matcher;

  return list.filter((item) =>
    !match(item)
  );
}

/* =========================================================
   OBJECT HELPERS
========================================================= */

export function shallowCloneRoot(state = {}) {
  if (!isObject(state)) {
    return {};
  }

  return {
    ...state,
  };
}

export function freezeDev(value) {
  try {
    return Object.freeze(value);
  } catch {
    return value;
  }
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  isBrowser,
  isFunction,
  isObject,
  isPlainObject,
  isPrimitive,
  isDate,
  isRegExp,
  isMap,
  isSet,

  safeText,
  safeNumber,
  safeArray,

  deepClone,
  deepEqual,

  getByPath,
  hasByPath,
  setByPath,
  deleteByPath,

  mergeDeep,
  collectChangedPaths,

  normalizeCollection,
  collectionToMap,
  upsertCollection,
  removeFromCollection,

  shallowCloneRoot,
  freezeDev,
};
