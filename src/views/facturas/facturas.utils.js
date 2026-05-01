/* =========================================================
   Onion SPA - Facturas Utils
   Archivo: src/views/facturas/facturas.utils.js

   FINAL PRO SYSTEM · UTILS REAL · 10/10
   PATCH · EU MONEY SAFE · OBJECT SAFE · TOAST BRIDGE PRO

   RESPONSABILIDADES:
   - centralizar helpers base del módulo de facturas
   - normalizar texto, números, arrays y objetos
   - escapar html de forma segura
   - exponer showToast con fallback robusto
   - mantener paridad con módulos tipo incidencias/server
   - parsear importes europeos: "57,00 €", "1.234,56", "1234.56"
   - evitar que first() elija arrays/objetos vacíos
   - exponer helpers de identidad y texto para vistas/loaders/templates

   HARDENING PRO:
   - helpers defensivos reutilizables
   - fallback de toast por capas
   - escapeHtml estable sin dependencia obligatoria de AppCore
   - utilidades puras y seguras
   - compatibilidad hacia atrás con imports existentes
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   TYPE CHECKS
========================================================= */

export function isPlainObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

export function hasOwnKeys(value = {}) {
  return Boolean(
    isPlainObject(value) &&
      Object.keys(value).length > 0
  );
}

export function isNil(value) {
  return value === null || value === undefined;
}

/* =========================================================
   SAFE PRIMITIVES
========================================================= */

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

export function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

export function safeUpper(value, fallback = "") {
  return safeText(value, fallback).toUpperCase();
}

export function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const normalized = normalizeText(value);

    if (["true", "1", "yes", "y", "si", "sí", "on", "enabled"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "n", "off", "disabled"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

export function safeArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

export function safeObject(value, fallback = {}) {
  return isPlainObject(value) ? value : fallback;
}

export function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  const raw = String(value)
    .trim()
    .replace(/€/g, "")
    .replace(/%/g, "")
    .replace(/[^\d,.\-+]/g, "")
    .replace(/\s+/g, "");

  if (!raw) {
    return fallback;
  }

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");

  let normalized = raw;

  /*
    Casos:
    - "1.234,56" -> "1234.56"
    - "57,00"    -> "57.00"
    - "1234.56"  -> "1234.56"
    - "1,234.56" -> "1234.56"
  */
  if (hasComma && hasDot) {
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");

    if (lastComma > lastDot) {
      normalized = raw.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = raw.replace(/,/g, "");
    }
  } else if (hasComma) {
    normalized = raw.replace(",", ".");
  }

  const n = Number(normalized);

  return Number.isFinite(n) ? n : fallback;
}

export function normalizeMoney(value, fallback = 0) {
  return safeNumber(value, fallback);
}

export function roundMoney(value, fallback = 0) {
  const amount = safeNumber(value, fallback);

  if (!Number.isFinite(amount)) {
    return fallback;
  }

  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function clampNumber(
  value,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  fallback = min
) {
  const n = safeNumber(value, fallback);

  return Math.min(Math.max(n, min), max);
}

export function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    if (isPlainObject(value) && Object.keys(value).length === 0) {
      continue;
    }

    return value;
  }

  return null;
}

/* =========================================================
   ARRAYS / UNIQUES
========================================================= */

export function uniqueStrings(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    ),
  ];
}

export function uniqueObjects(items = []) {
  const output = [];
  const seen = new Set();

  safeArray(items).forEach((item) => {
    if (!isPlainObject(item)) return;

    if (seen.has(item)) return;

    seen.add(item);
    output.push(item);
  });

  return output;
}

/* =========================================================
   TEXT / NORMALIZATION
========================================================= */

export function normalizeWhitespace(value = "") {
  return safeText(value, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeIdentity(value = "") {
  return normalizeText(value)
    .replace(/\s+/g, "")
    .replace(/[_-]+/g, "-");
}

export function sameIdentity(a = "", b = "") {
  const left = normalizeIdentity(a);
  const right = normalizeIdentity(b);

  return Boolean(left && right && left === right);
}

export function truncate(value = "", max = 140) {
  const text = safeText(value, "");

  const limit = safeNumber(max, 140);

  if (!text) return "";
  if (!Number.isFinite(limit) || limit <= 0) return text;
  if (text.length <= limit) return text;

  return `${text.slice(0, limit).trim()}…`;
}

/* =========================================================
   HTML
========================================================= */

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

/* =========================================================
   DATE / TIME
========================================================= */

export function safeDateMs(value, fallback = 0) {
  if (!value) {
    return fallback;
  }

  const ms = new Date(value).getTime();

  return Number.isFinite(ms) ? ms : fallback;
}

export function formatDate(value, fallback = "—") {
  if (!value) return fallback;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  try {
    return new Intl.DateTimeFormat("es-ES", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return fallback;
  }
}

export function formatDateTime(value, fallback = "—") {
  if (!value) return fallback;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  try {
    return new Intl.DateTimeFormat("es-ES", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return fallback;
  }
}

/* =========================================================
   MONEY / DISPLAY
========================================================= */

export function formatMoney(value, currency = "EUR") {
  const amount = safeNumber(value, 0);
  const code = safeText(currency, "EUR").toUpperCase();

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

export function formatPercent(value = 0) {
  const n = safeNumber(value, 0);

  if (!n) return "";

  const clean = Number.isInteger(n)
    ? String(n)
    : String(n).replace(".", ",");

  return `${clean}%`;
}

/* =========================================================
   APP / EVENTS
========================================================= */

export function safeEmit(eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) return false;

  let emitted = false;

  try {
    AppCore?.events?.emit?.(name, payload);
    emitted = true;
  } catch {}

  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );

      emitted = true;
    }
  } catch {}

  return emitted;
}

export function safeOn(eventName = "", handler = null) {
  const name = safeText(eventName, "");

  if (!name || typeof handler !== "function") {
    return () => {};
  }

  let busCleanup = null;
  let busAttached = false;
  let windowAttached = false;

  const windowHandler = (event) => handler(event);

  try {
    const maybeCleanup = AppCore?.events?.on?.(name, handler);

    if (typeof maybeCleanup === "function") {
      busCleanup = maybeCleanup;
    }

    busAttached = true;
  } catch {}

  try {
    if (typeof window !== "undefined") {
      window.addEventListener(name, windowHandler);
      windowAttached = true;
    }
  } catch {}

  return () => {
    if (busCleanup) {
      try {
        busCleanup();
      } catch {}
    } else if (busAttached) {
      try {
        AppCore?.events?.off?.(name, handler);
      } catch {}
    }

    if (windowAttached) {
      try {
        window.removeEventListener(name, windowHandler);
      } catch {}
    }
  };
}

export function waitForPaint() {
  return new Promise((resolve) => {
    try {
      if (typeof window === "undefined") {
        resolve();
        return;
      }

      if (typeof window.requestAnimationFrame !== "function") {
        window.setTimeout(resolve, 0);
        return;
      }

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(resolve);
      });
    } catch {
      resolve();
    }
  });
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
    if (typeof AppCore?.ui?.toast?.show === "function") {
      AppCore.ui.toast.show(text, tone);
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
    safeEmit("toast:show", {
      message: text,
      type: tone,
      tone,
      source: "facturas",
    });
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
  isPlainObject,
  hasOwnKeys,
  isNil,

  safeText,
  safeLower,
  safeUpper,
  safeBoolean,
  safeArray,
  safeObject,
  safeNumber,

  normalizeMoney,
  roundMoney,
  clampNumber,
  first,

  uniqueStrings,
  uniqueObjects,

  normalizeWhitespace,
  normalizeText,
  normalizeKey,
  normalizeIdentity,
  sameIdentity,
  truncate,

  escapeHtml,

  safeDateMs,
  formatDate,
  formatDateTime,

  formatMoney,
  formatPercent,

  safeEmit,
  safeOn,
  waitForPaint,

  showToast,
};
