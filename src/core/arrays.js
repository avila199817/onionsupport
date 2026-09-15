// Array coercion only. safeArray keeps arrays and rejects everything else;
// arrayFrom also accepts array-likes (NodeList, FileList, arguments) and
// never strings or scalars. Plain-object guards live in ./objects.js.
export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function arrayFrom(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && typeof value.length === "number") {
    try { return Array.from(value); } catch { return []; }
  }
  return [];
}
