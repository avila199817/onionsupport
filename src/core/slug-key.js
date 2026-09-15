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
