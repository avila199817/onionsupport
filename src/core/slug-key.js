import { cleanText } from "./presentation-text.js";

// Slug key for domain values (status, priority, role, plan names): lower
// case, accents stripped, spaces and hyphens joined with "_", anything else
// but word characters, ":" and "." removed. Views only: the kernel compares
// with the compact normalizeKey of ./presentation-text.js instead.
export function slugKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

// Record key of the Facturas API and modal: like slugKey, but "." joins as
// a separator, any other symbol run becomes "_" instead of vanishing and
// ":" is kept ("meta:foo.bar" → "meta:foo_bar", "x@y" → "x_y").
export function recordKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s.-]+/g, "_")
    .replace(/[^\w:]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Label key of the Facturas templates: every non-word run becomes "_",
// ":" and "." included ("a.b:c" → "a_b_c").
export function labelKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
