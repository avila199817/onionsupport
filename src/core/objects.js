// Value guards and first-candidate selection: is it a non-array object (and
// coerce it with a caller-chosen fallback), is it a function, and which of a
// fallback chain's candidates is usable. Array coercion lives in ./arrays.js
// so the startup closures (auth, app, public Home) load this module alone;
// the same split keeps text normalization in ./presentation-text.js and HTML
// escaping in ./escape-html.js. The selectors live here rather than in a
// module of their own because a new shared module becomes a chunk that every
// closure imports (measured: +529 bytes on the public Home). main.js and
// analytics/google-tag.js never import these modules: rolldown would fold
// them into the entry or the consent-gated leaf chunk and drag it into every
// closure.
export function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

export function isFunction(value) {
  return typeof value === "function";
}

// First usable candidate of a fallback chain. Two policies, named by what
// they skip. Neither flattens its arguments: an array is a value, never a
// list of candidates (repo_integrity keeps that invariant).

// Skips null, undefined and blank strings. Empty arrays and objects are
// values: firstNonBlank([], "x") is [].
export function firstNonBlank(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }
  return null;
}

// Also skips empty arrays and plain objects without own enumerable keys, so
// firstNonEmpty({}, [], "x") is "x". Numbers and booleans are always values.
export function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;
    return value;
  }
  return null;
}
