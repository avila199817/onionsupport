/* =========================================================
   Onion Support - Mail Templates Utils
   Archivo: src/mail/templates/utils.js

   Responsabilidades:
   - escapar HTML de forma segura
   - normalizar texto
   - construir atributos/valores robustos
   - evitar inyecciones accidentales en templates
========================================================= */

export function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

export function normalizeUrl(value, fallback = "#") {
  const url = safeText(value, "");
  if (!url) return fallback;
  return url;
}

export function joinHtml(parts = []) {
  return parts.filter(Boolean).join("");
}
