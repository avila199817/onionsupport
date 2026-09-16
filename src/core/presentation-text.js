// One-line text normalization only: collapse whitespace, trim, fallback, and
// the compact matching key the kernel compares headers, routes and config
// names with. HTML escaping lives in ./escape-html.js and the accent-free
// slug key of the views in ./slug-key.js, so the startup closures load only
// what the kernel needs.
export function cleanText(value = "", fallback = "") {
  return String(value ?? "").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim() || fallback;
}

// Compact key: separators and case removed. "Content-Type", "content_type"
// and "content type" compare equal; accents are kept.
export function normalizeKey(value = "") {
  return cleanText(value, "").replace(/[-_\s]/g, "").toLowerCase();
}

// Code key: separators joined with "_" and upper-cased, the shape of the
// backend's error and status codes ("not-found" → "NOT_FOUND").
export function codeKey(value = "") {
  return cleanText(value, "").replace(/[\s-]+/g, "_").toUpperCase();
}
