/* =========================================================
   Onion SPA - Facturas Utils
   Archivo: src/views/facturas/facturas.utils.js

   Responsabilidades:
   - centralizar helpers base del módulo de facturas
   - normalizar texto, números y arrays
   - escapar html de forma segura
   - exponer showToast con fallback robusto
========================================================= */

import { AppCore } from "../../core/index.js";

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

export function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function escapeHtml(value = "") {
  try {
    if (typeof AppCore?.utils?.escapeHtml === "function") {
      return AppCore.utils.escapeHtml(String(value ?? ""));
    }
  } catch {
    /* noop */
  }

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function showToast(message = "", type = "info") {
  const text = safeText(message, "Acción completada");

  try {
    if (typeof AppCore?.showToast === "function") {
      AppCore.showToast(text, type);
      return;
    }
  } catch {
    /* noop */
  }

  try {
    if (typeof window !== "undefined" && typeof window.showToast === "function") {
      window.showToast(text, type);
      return;
    }
  } catch {
    /* noop */
  }

  console.log(`[${type.toUpperCase()}] ${text}`);
}
