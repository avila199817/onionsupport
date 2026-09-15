// HTML text-node and attribute escaping only: not URL, JavaScript, CSS or
// rich-HTML sanitizing. It never trims or collapses user content.
export function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
