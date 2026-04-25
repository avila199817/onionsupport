/* =========================================================
   Onion SPA - Incidencias Utils
   Archivo: src/views/incidencias/incidencias.utils.js

   EXTREME MODE · 10/10

   Responsabilidades:
   - helpers puros reutilizables
   - sanitización robusta
   - fechas seguras
   - números
   - texto
   - normalización
   - toast bridge multi-entorno
   - cero dependencias frágiles
   - compatibilidad total con template / actions / api
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   BASE
========================================================= */

export function safeString(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

export function safeText(value, fallback = "") {
  return safeString(value, fallback);
}

export function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

export function safeNumber(value, fallback = 0) {
  const n = Number(value);

  return Number.isFinite(n) ? n : fallback;
}

export function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí"].includes(key)) return true;
    if (["false", "0", "no"].includes(key)) return false;
  }

  return fallback;
}

export function safeArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  return Array.isArray(fallback) ? fallback : [];
}

export function safeObject(value, fallback = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  return fallback && typeof fallback === "object" && !Array.isArray(fallback)
    ? fallback
    : {};
}

export function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    return value;
  }

  return null;
}

/**
 * Sanitización HTML segura.
 *
 * Importante:
 * - No depende ciegamente de AppCore.utils.escapeHtml.
 * - Si el core devuelve "" para un texto no vacío, usa fallback local.
 * - Evita textos invisibles en templates.
 */
export function escapeHtml(value = "") {
  const text = String(value ?? "");

  try {
    const coreEscape = AppCore?.utils?.escapeHtml;

    if (typeof coreEscape === "function") {
      const result = coreEscape(text);

      if (result !== undefined && result !== null) {
        const output = String(result);

        if (!text || output) {
          return output;
        }
      }
    }
  } catch {}

  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* =========================================================
   UI
========================================================= */

function normalizeToastType(type = "info") {
  const key = safeLower(type, "info");

  if (key === "warn") return "warning";
  if (key === "danger") return "error";
  if (key === "ok") return "success";

  return key || "info";
}

function getToastMethodNames(type = "info") {
  const normalized = normalizeToastType(type);

  if (normalized === "warning") {
    return ["warning", "warn"];
  }

  return [normalized];
}

function callToastCandidate(candidate = null, message = "", type = "info", options = {}) {
  if (!candidate) return false;

  const text = safeText(message, "");
  const finalType = normalizeToastType(type);
  const methodNames = getToastMethodNames(finalType);

  for (const methodName of methodNames) {
    try {
      if (typeof candidate?.[methodName] === "function") {
        candidate[methodName](text, options);
        return true;
      }
    } catch {}
  }

  try {
    if (typeof candidate?.show === "function") {
      candidate.show({
        message: text,
        type: finalType,
        ...safeObject(options),
      });
      return true;
    }
  } catch {}

  try {
    if (typeof candidate?.show === "function") {
      candidate.show(text, finalType, safeObject(options));
      return true;
    }
  } catch {}

  return false;
}

export function showToast(message = "", type = "info", options = {}) {
  const text = safeText(message, "");

  if (!text) {
    return false;
  }

  const finalType = normalizeToastType(type);
  const finalOptions = safeObject(options);

  try {
    if (typeof AppCore?.modules?.get === "function") {
      const toastModule = AppCore.modules.get("toast");

      if (callToastCandidate(toastModule, text, finalType, finalOptions)) {
        return true;
      }
    }
  } catch {}

  const candidates = [
    AppCore?.toast,
    AppCore?.ui?.toast,
    AppCore?.modules?.Toast,
    AppCore?.modules?.toast,
    window?.Toast,
    window?.toast,
  ];

  for (const candidate of candidates) {
    if (callToastCandidate(candidate, text, finalType, finalOptions)) {
      return true;
    }
  }

  try {
    const logger =
      finalType === "error"
        ? console.error
        : finalType === "warning"
          ? console.warn
          : console.log;

    logger(`[IncidenciasToast:${finalType}]`, text);
  } catch {}

  return false;
}

/* =========================================================
   TEXT
========================================================= */

export function normalizeText(value = "") {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function normalizeWhitespace(value = "") {
  return safeText(value, "").replace(/\s+/g, " ").trim();
}

export function truncate(value = "", max = 160) {
  const text = safeString(value, "");
  const limit = Math.max(0, safeNumber(max, 160));

  if (!text || limit <= 0) {
    return "";
  }

  if (text.length <= limit) {
    return text;
  }

  if (limit <= 1) {
    return "…";
  }

  return `${text.slice(0, limit - 1).trim()}…`;
}

export function getInitials(value = "") {
  const text = normalizeWhitespace(value);

  if (!text) {
    return "ON";
  }

  const parts = text.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase() || "ON";
  }

  const initials = parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
    .slice(0, 2);

  return initials || "ON";
}

export function slugify(value = "") {
  const text = normalizeText(value);

  return (
    text
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-") || ""
  );
}

/* =========================================================
   DATE
========================================================= */

export function toDate(value = null) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function toMs(value = null) {
  const date = toDate(value);
  return date ? date.getTime() : 0;
}

export function formatDate(value = null) {
  const date = toDate(value);

  if (!date) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "—";
  }
}

export function formatDateOnly(value = null) {
  const date = toDate(value);

  if (!date) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  } catch {
    return "—";
  }
}

export function formatRelativeDate(value = null) {
  const date = toDate(value);

  if (!date) {
    return "—";
  }

  const diffMs = Date.now() - date.getTime();
  const future = diffMs < 0;
  const absMs = Math.abs(diffMs);

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (absMs < minute) {
    return future ? "En un momento" : "Hace un momento";
  }

  if (absMs < hour) {
    const minutes = Math.max(1, Math.floor(absMs / minute));
    return future ? `En ${minutes} min` : `Hace ${minutes} min`;
  }

  if (absMs < day) {
    const hours = Math.max(1, Math.floor(absMs / hour));
    return future ? `En ${hours} h` : `Hace ${hours} h`;
  }

  if (absMs < day * 7) {
    const days = Math.max(1, Math.floor(absMs / day));
    return future ? `En ${days} d` : `Hace ${days} d`;
  }

  return formatDate(value);
}

/* =========================================================
   NUMBERS / MONEY / FILES
========================================================= */

export function formatNumber(value = 0) {
  const number = safeNumber(value, 0);

  try {
    return new Intl.NumberFormat("es-ES").format(number);
  } catch {
    return String(number);
  }
}

export function formatMoney(value = 0, currency = "EUR") {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "—";
  }

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: safeText(currency, "EUR"),
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${safeText(currency, "EUR")}`;
  }
}

export function formatBytes(bytes = 0) {
  const size = Number(bytes);

  if (!Number.isFinite(size) || size <= 0) return "";

  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  safeString,
  safeText,
  safeLower,
  safeNumber,
  safeBoolean,
  safeArray,
  safeObject,
  first,

  escapeHtml,

  showToast,

  normalizeText,
  normalizeWhitespace,
  truncate,
  getInitials,
  slugify,

  toDate,
  toMs,
  formatDate,
  formatDateOnly,
  formatRelativeDate,

  formatNumber,
  formatMoney,
  formatBytes,
};
