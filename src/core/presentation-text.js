// One-line text normalization only: collapse whitespace, trim, fallback. HTML
// escaping lives in ./escape-html.js so the kernel loads this helper alone.
export function cleanText(value = "", fallback = "") {
  return String(value ?? "").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim() || fallback;
}
