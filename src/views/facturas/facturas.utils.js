/* =========================================================
   Onion SPA - Facturas Utils
   Archivo: src/views/facturas/facturas.utils.js

   RESPONSABILIDADES:
   - centralizar helpers base del módulo de facturas
   - normalizar texto, números, arrays y objetos
   - escapar html de forma segura
   - exponer showToast con fallback robusto
   - mantener paridad con módulos tipo incidencias/server

   HARDENING PRO:
   - helpers defensivos reutilizables
   - fallback de toast por capas
   - escapeHtml estable sin dependencia obligatoria de AppCore
   - utilidades puras y seguras
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   SAFE PRIMITIVES
========================================================= */

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

export function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function safeArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

export function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

export function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

export function first(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return null;
}

/* =========================================================
   TEXT / HTML
========================================================= */

export function normalizeWhitespace(value = "") {
  return safeText(value, "").replace(/\s+/g, " ").trim();
}

export function escapeHtml(value = "") {
  const input = String(value ?? "");

  try {
    if (typeof AppCore?.utils?.escapeHtml === "function") {
      return AppCore.utils.escapeHtml(input);
    }
  } catch {}

  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function truncate(value = "", max = 140) {
  const text = safeText(value, "");

  if (!text) return "";
  if (!Number.isFinite(Number(max)) || Number(max) <= 0) return text;
  if (text.length <= Number(max)) return text;

  return `${text.slice(0, Number(max)).trim()}…`;
}

/* =========================================================
   TOAST
========================================================= */

export function showToast(message = "", type = "info") {
  const text = safeText(message, "Acción completada");
  const tone = safeText(type, "info");

  try {
    if (typeof AppCore?.toast?.[tone] === "function") {
      AppCore.toast[tone](text);
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.toast?.show === "function") {
      AppCore.toast.show(text, tone);
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.ui?.toast?.[tone] === "function") {
      AppCore.ui.toast[tone](text);
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.showToast === "function") {
      AppCore.showToast(text, tone);
      return true;
    }
  } catch {}

  try {
    if (typeof window !== "undefined" && typeof window.showToast === "function") {
      window.showToast(text, tone);
      return true;
    }
  } catch {}

  try {
    const logger =
      tone === "error"
        ? console.error
        : tone === "warning"
          ? console.warn
          : console.log;

    logger(`[Facturas:${tone}]`, text);
  } catch {}

  return false;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  safeText,
  safeNumber,
  safeArray,
  safeObject,
  safeBoolean,
  first,
  normalizeWhitespace,
  escapeHtml,
  truncate,
  showToast,
};
