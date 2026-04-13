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

export function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

export function isFunction(value) {
  return typeof value === "function";
}

export function isPrimitive(value) {
  return (
    value === null ||
    (typeof value !== "object" &&
      typeof value !== "function")
  );
}

/* =========================================================
   CLONE
========================================================= */
export function deepClone(value) {
  if (value === undefined) {
    return undefined;
  }

  try {
    if (
      typeof structuredClone ===
      "function"
    ) {
      return structuredClone(value);
    }
  } catch {
    /* fallback */
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

  /* arrays */
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

  /* objects */
  if (
    isObject(a) &&
    isObject(b)
  ) {
    const aKeys =
      Object.keys(a);
    const bKeys =
      Object.keys(b);

    if (
      aKeys.length !==
      bKeys.length
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
   PATH HELPERS
========================================================= */
function normalizePath(path) {
  return String(path || "")
    .split(".")
    .map((part) =>
      part.trim()
    )
    .filter(Boolean);
}

export function getByPath(
  obj,
  path
) {
  if (!path) {
    return obj;
  }

  const keys =
    normalizePath(path);

  let current = obj;

  for (const key of keys) {
    if (current == null) {
      return undefined;
    }

    current =
      current[key];
  }

  return current;
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

  if (!lastKey) {
    return obj;
  }

  let current = obj;

  for (const key of keys) {
    const next =
      current[key];

    if (
      !isObject(next) &&
      !Array.isArray(next)
    ) {
      current[key] = {};
    }

    current =
      current[key];
  }

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

  if (!lastKey) {
    return obj;
  }

  let current = obj;

  for (const key of keys) {
    if (
      current == null ||
      (!isObject(
        current[key]
      ) &&
        !Array.isArray(
          current[key]
        ))
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
export function mergeDeep(
  target,
  source
) {
  if (
    Array.isArray(source)
  ) {
    return source.map(
      (item) =>
        deepClone(item)
    );
  }

  if (!isObject(source)) {
    return source;
  }

  const output =
    isObject(target)
      ? { ...target }
      : {};

  Object.keys(source).forEach(
    (key) => {
      const sourceValue =
        source[key];

      const targetValue =
        output[key];

      if (
        Array.isArray(
          sourceValue
        )
      ) {
        output[key] =
          sourceValue.map(
            (item) =>
              deepClone(item)
          );
        return;
      }

      if (
        isObject(
          sourceValue
        )
      ) {
        output[key] =
          mergeDeep(
            targetValue,
            sourceValue
          );
        return;
      }

      output[key] =
        sourceValue;
    }
  );

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
      const nextPath =
        prefix
          ? `${prefix}.${key}`
          : key;

      paths.push(nextPath);

      if (
        isObject(value)
      ) {
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
  if (
    !Array.isArray(items)
  ) {
    return Array.isArray(
      fallback
    )
      ? [...fallback]
      : [];
  }

  return [...items];
}
