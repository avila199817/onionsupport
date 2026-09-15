// Plain-object guards only: is it a non-array object, and coerce with a
// caller-chosen fallback. Array coercion lives in ./arrays.js so the startup
// closures (auth, app, public Home) load the object guards alone; the same
// split keeps text normalization in ./presentation-text.js and HTML escaping
// in ./escape-html.js. main.js and analytics/google-tag.js never import
// these modules: rolldown would fold them into the entry or the
// consent-gated leaf chunk and drag it into every closure.
export function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}
