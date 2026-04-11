/* =========================================================
   Onion SPA - Store Helpers
   Archivo: src/store/helpers.js

   Responsabilidades:
   - helpers base puros del store
   - clones / igualdad profunda
   - acceso por path
   - mutación por path
   - merge profundo
   - detección de paths cambiados
   - normalización de colecciones
========================================================= */

export function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isFunction(value) {
  return typeof value === "function";
}

export function deepClone(value) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {
    /* no-op */
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

export function deepEqual(a, b) {
  if (a === b) return true;

  if (typeof a !== typeof b) return false;

  if (a === null || b === null) return a === b;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }

    return true;
  }

  if (isObject(a) && isObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);

    if (aKeys.length !== bKeys.length) return false;

    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }

    return true;
  }

  return false;
}

export function getByPath(obj, path) {
  if (!path) return obj;

  return String(path)
    .split(".")
    .filter(Boolean)
    .reduce((acc, key) => {
      if (acc == null) return undefined;
      return acc[key];
    }, obj);
}

export function setByPath(obj, path, value) {
  const keys = String(path).split(".").filter(Boolean);
  const lastKey = keys.pop();

  if (!lastKey) return obj;

  let current = obj;

  for (const key of keys) {
    if (!isObject(current[key]) && !Array.isArray(current[key])) {
      current[key] = {};
    }

    current = current[key];
  }

  current[lastKey] = value;
  return obj;
}

export function deleteByPath(obj, path) {
  const keys = String(path).split(".").filter(Boolean);
  const lastKey = keys.pop();

  if (!lastKey) return obj;

  let current = obj;

  for (const key of keys) {
    if (!isObject(current[key])) {
      return obj;
    }

    current = current[key];
  }

  if (isObject(current) || Array.isArray(current)) {
    delete current[lastKey];
  }

  return obj;
}

export function mergeDeep(target, source) {
  if (Array.isArray(source)) {
    return [...source];
  }

  if (!isObject(source)) {
    return source;
  }

  const output = isObject(target) ? { ...target } : {};

  Object.keys(source).forEach((key) => {
    const sourceValue = source[key];
    const targetValue = output[key];

    if (Array.isArray(sourceValue)) {
      output[key] = [...sourceValue];
      return;
    }

    if (isObject(sourceValue)) {
      output[key] = mergeDeep(targetValue, sourceValue);
      return;
    }

    output[key] = sourceValue;
  });

  return output;
}

export function collectChangedPaths(input, prefix = "") {
  if (!isObject(input) && !Array.isArray(input)) {
    return prefix ? [prefix] : [];
  }

  const paths = [];

  Object.entries(input).forEach(([key, value]) => {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    paths.push(nextPath);

    if (isObject(value) && !Array.isArray(value)) {
      paths.push(...collectChangedPaths(value, nextPath));
    }
  });

  return Array.from(new Set(paths));
}

export function normalizeCollection(items, fallback = []) {
  return Array.isArray(items) ? [...items] : fallback;
}
