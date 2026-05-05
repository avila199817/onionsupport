/* =========================================================
   Onion SPA - Facturas Utils
   Archivo: src/views/facturas/facturas.utils.js

   FINAL PRO SYSTEM · FACTURAS UTILS · 10/10 EXTREME
   PATCH · ONE UTILS ONLY · EU MONEY SAFE · TOAST BRIDGE PRO
   PATCH · COMPAT ALIASES · NO DOMAIN LOGIC · NO CSS

   RESPONSABILIDADES:
   - centralizar helpers base reutilizables del módulo Facturas
   - normalizar texto, números, fechas, arrays y objetos
   - parsear importes europeos y mixtos:
     "57,00 €", "1.234,56", "1234.56", "1,234.56"
   - escapar HTML de forma segura
   - exponer eventos/toast/logs con fallback robusto
   - evitar duplicidades en model/store/loaders/actions/templates
   - mantener compatibilidad hacia atrás con imports existentes

   IMPORTANTE:
   - Este archivo NO contiene CSS.
   - Este archivo NO contiene lógica de dominio de factura.
   - Este archivo NO normaliza facturas.
   - La lógica factura vive en facturas.model.js.
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const DEFAULT_LOCALE = "es-ES";
export const DEFAULT_CURRENCY = "EUR";

/* =========================================================
   TYPE CHECKS
========================================================= */

export function isNil(value) {
  return value === null || value === undefined;
}

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

export function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function isPromiseLike(value) {
  return Boolean(value && typeof value.then === "function");
}

export function noop() {}

/* =========================================================
   SAFE PRIMITIVES
========================================================= */

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

export const safeString = safeText;

export function safeMultilineText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
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

/* =========================================================
   NUMBER / MONEY PARSING
========================================================= */

function normalizeNumericString(value = "") {
  let raw = String(value ?? "")
    .trim()
    .replace(/[−–—]/g, "-")
    .replace(/€/g, "")
    .replace(/%/g, "")
    .replace(/[^\d,.\-+]/g, "");

  if (!raw) return "";

  const isNegativeByParentheses = /^\(.*\)$/.test(String(value ?? "").trim());

  raw = raw
    .replace(/(?!^)[+-]/g, "")
    .replace(/^([-+])?(.+)$/, (_, sign = "", rest = "") => `${sign}${rest}`);

  const sign = raw.startsWith("-") || isNegativeByParentheses ? "-" : "";
  raw = raw.replace(/^[+-]/, "");

  if (!raw) return "";

  const commaCount = (raw.match(/,/g) || []).length;
  const dotCount = (raw.match(/\./g) || []).length;
  const hasComma = commaCount > 0;
  const hasDot = dotCount > 0;

  let normalized = raw;

  if (hasComma && hasDot) {
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");

    if (lastComma > lastDot) {
      normalized = raw.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = raw.replace(/,/g, "");
    }

    return `${sign}${normalized}`;
  }

  if (hasComma) {
    const parts = raw.split(",");
    const last = parts[parts.length - 1] || "";
    const before = parts.slice(0, -1).join("");

    if (commaCount > 1) {
      normalized = last.length > 0 && last.length <= 2
        ? `${before}.${last}`
        : parts.join("");
    } else {
      const [left = "", right = ""] = parts;

      normalized = right.length === 3 && left.length >= 1 && left.length <= 3
        ? `${left}${right}`
        : `${left}.${right}`;
    }

    return `${sign}${normalized}`;
  }

  if (hasDot) {
    const parts = raw.split(".");
    const last = parts[parts.length - 1] || "";
    const before = parts.slice(0, -1).join("");

    if (dotCount > 1) {
      normalized = last.length > 0 && last.length <= 2
        ? `${before}.${last}`
        : parts.join("");
    } else {
      const [left = "", right = ""] = parts;

      normalized = right.length === 3 && left.length >= 1 && left.length <= 3
        ? `${left}${right}`
        : `${left}.${right}`;
    }

    return `${sign}${normalized}`;
  }

  return `${sign}${raw}`;
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

  const normalized = normalizeNumericString(value);

  if (!normalized) {
    return fallback;
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

export const round2 = roundMoney;

export function clampNumber(
  value,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  fallback = min
) {
  const n = safeNumber(value, fallback);

  return Math.min(Math.max(n, min), max);
}

export function compareNumber(a, b) {
  return safeNumber(a, 0) - safeNumber(b, 0);
}

/* =========================================================
   FIRST / PICKERS
========================================================= */

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

export const pickFirst = first;

export function readPath(source = {}, path = "") {
  const obj = safeObject(source, {});
  const parts = safeText(path, "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) return undefined;

  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    current = current?.[part];
  }

  return current;
}

export function firstFromSources(sources = [], paths = []) {
  for (const source of safeArray(sources)) {
    for (const path of safeArray(paths)) {
      const value = readPath(source, path);

      if (value === undefined || value === null) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      if (Array.isArray(value) && value.length === 0) continue;
      if (isPlainObject(value) && Object.keys(value).length === 0) continue;

      return value;
    }
  }

  return null;
}

/* =========================================================
   ARRAYS / UNIQUES
========================================================= */

export function uniqueStrings(values = []) {
  const seen = new Set();
  const out = [];

  safeArray(values)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .forEach((value) => {
      const text = safeText(value, "");
      const key = normalizeText(text);

      if (!text || !key || seen.has(key)) return;

      seen.add(key);
      out.push(text);
    });

  return out;
}

export const uniqueList = uniqueStrings;

export function uniqueObjects(items = []) {
  const output = [];
  const seen = new Set();

  safeArray(items).forEach((item) => {
    if (!isPlainObject(item)) return;
    if (!hasOwnKeys(item)) return;
    if (seen.has(item)) return;

    seen.add(item);
    output.push(item);
  });

  return output;
}

export function uniqueBy(items = [], getKey = null) {
  const output = [];
  const seen = new Set();

  safeArray(items).forEach((item, index) => {
    const key = typeof getKey === "function"
      ? safeText(getKey(item, index), "")
      : safeText(item, "");

    const normalized = normalizeIdentity(key);

    if (!normalized || seen.has(normalized)) return;

    seen.add(normalized);
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
    .replace(/\s+/g, " ")
    .trim();
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

export function compareText(a, b, locale = DEFAULT_LOCALE) {
  return safeText(a, "").localeCompare(
    safeText(b, ""),
    locale,
    {
      sensitivity: "base",
      numeric: true,
    }
  );
}

export function truncate(value = "", max = 140) {
  const text = safeText(value, "");
  const limit = Math.max(1, safeNumber(max, 140));

  if (!text) return "";
  if (text.length <= limit) return text;

  return `${text.slice(0, limit).trim()}…`;
}

export function getInitials(value = "", fallback = "ON") {
  const text = normalizeWhitespace(value);

  if (!text) {
    return fallback;
  }

  const parts = text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  const initials = parts
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 2);

  return initials || fallback;
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

export const escapeAttr = escapeHtml;

/* =========================================================
   DATE / TIME
========================================================= */

export function normalizeDateInput(value = null) {
  if (!value) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9999999999
      ? new Date(value)
      : new Date(value * 1000);
  }

  const raw = safeText(value, "");

  if (!raw) return null;

  return new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);
}

export function safeDateMs(value, fallback = 0) {
  const date = normalizeDateInput(value);

  if (!date || Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.getTime();
}

export const toMs = safeDateMs;

export function compareDate(a, b) {
  return safeDateMs(a, 0) - safeDateMs(b, 0);
}

export function formatDate(value, fallback = "—", locale = DEFAULT_LOCALE) {
  const date = normalizeDateInput(value);

  if (!date || Number.isNaN(date.getTime())) {
    return fallback;
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return fallback;
  }
}

export function formatDateTime(value, fallback = "—", locale = DEFAULT_LOCALE) {
  const date = normalizeDateInput(value);

  if (!date || Number.isNaN(date.getTime())) {
    return fallback;
  }

  try {
    return new Intl.DateTimeFormat(locale, {
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

export function formatRelativeDate(value, fallback = "Sin fecha") {
  const date = normalizeDateInput(value);

  if (!date || Number.isNaN(date.getTime())) {
    return fallback;
  }

  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const absMin = Math.abs(diffMin);

  if (absMin < 1) return "Ahora mismo";

  if (absMin < 60) {
    return diffMin > 0 ? `En ${absMin} min` : `Hace ${absMin} min`;
  }

  const diffHours = Math.round(absMin / 60);

  if (diffHours < 24) {
    return diffMin > 0 ? `En ${diffHours} h` : `Hace ${diffHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);

  if (diffDays <= 7) {
    return diffMin > 0
      ? `En ${diffDays} día${diffDays === 1 ? "" : "s"}`
      : `Hace ${diffDays} día${diffDays === 1 ? "" : "s"}`;
  }

  return formatDate(value);
}

/* =========================================================
   MONEY / DISPLAY
========================================================= */

export function formatMoney(
  value,
  currency = DEFAULT_CURRENCY,
  locale = DEFAULT_LOCALE
) {
  const amount = safeNumber(value, 0);
  const code = safeText(currency, DEFAULT_CURRENCY).toUpperCase();

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2).replace(".", ",")} ${code}`;
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
   ERRORS / HTTP
========================================================= */

export function safeErrorMessage(
  error = null,
  fallback = "No se pudo completar la operación."
) {
  return safeText(
    first(
      error?.data?.message,
      error?.response?.data?.message,
      error?.response?.message,
      error?.payload?.message,
      error?.result?.message,
      error?.message,
      error?.data?.error,
      error?.response?.error,
      error?.error,
      fallback
    ),
    fallback
  );
}

export function getHttpStatus(error = null) {
  return safeNumber(
    first(
      error?.status,
      error?.statusCode,
      error?.response?.status,
      error?.data?.status
    ),
    0
  );
}

export function shouldTryNextHttpError(error = null) {
  const status = getHttpStatus(error);

  if (!status) return true;

  return [404, 405, 409, 415, 422, 500, 502, 503, 504].includes(status);
}

/* =========================================================
   APP CORE / EVENTS
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

export function safeOff(eventName = "", handler = null) {
  const name = safeText(eventName, "");

  if (!name || typeof handler !== "function") {
    return false;
  }

  try {
    AppCore?.events?.off?.(name, handler);
  } catch {}

  try {
    if (typeof window !== "undefined") {
      window.removeEventListener(name, handler);
    }
  } catch {}

  return true;
}

export function safeLog(...args) {
  try {
    AppCore?.utils?.log?.("[Facturas]", ...args);
    return true;
  } catch {}

  try {
    console.log("[Facturas]", ...args);
    return true;
  } catch {}

  return false;
}

export function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[Facturas]", ...args);
    return true;
  } catch {}

  try {
    console.warn("[Facturas]", ...args);
    return true;
  } catch {}

  return false;
}

export function safeError(...args) {
  try {
    AppCore?.utils?.error?.("[Facturas]", ...args);
    return true;
  } catch {}

  try {
    console.error("[Facturas]", ...args);
    return true;
  } catch {}

  return false;
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

  const emitted = safeEmit("toast:show", {
    message: text,
    type: tone,
    tone,
    source: "facturas",
  });

  if (emitted) {
    return true;
  }

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
   BROWSER / ASYNC
========================================================= */

export function wait(ms = 0) {
  return new Promise((resolve) => {
    try {
      setTimeout(resolve, Math.max(0, safeNumber(ms, 0)));
    } catch {
      resolve();
    }
  });
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

export function createTimeoutController(timeoutMs = 15000) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, Math.max(0, safeNumber(timeoutMs, 15000)));

  return {
    controller,
    signal: controller.signal,
    clear() {
      clearTimeout(timer);
    },
  };
}

/* =========================================================
   STORAGE / API BASE HELPERS
========================================================= */

export function getStorageValue(key = "") {
  const cleanKey = safeText(key, "");
  if (!cleanKey) return "";

  try {
    const value = localStorage.getItem(cleanKey);
    if (value) return value;
  } catch {}

  try {
    const value = sessionStorage.getItem(cleanKey);
    if (value) return value;
  } catch {}

  return "";
}

export function getApiBase() {
  return safeText(
    first(
      AppCore?.config?.apiBase,
      AppCore?.config?.api?.baseUrl,
      AppCore?.state?.apiBase,
      typeof window !== "undefined" ? window.ONION_API_BASE : "",
      typeof window !== "undefined" ? window.API_BASE : ""
    ),
    ""
  ).replace(/\/+$/, "");
}

export function isAbsoluteUrl(value = "") {
  return /^https?:\/\//i.test(safeText(value, ""));
}

export function buildApiUrl(endpoint = "") {
  const path = safeText(endpoint, "");

  if (!path) return "";
  if (isAbsoluteUrl(path)) return path;

  const apiBase = getApiBase();

  if (!apiBase) {
    return path.startsWith("/") ? path : `/${path}`;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (apiBase.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${apiBase}${normalizedPath.slice(4)}`;
  }

  return `${apiBase}${normalizedPath}`;
}

export const resolveApiUrl = buildApiUrl;

export function getAuthToken() {
  return safeText(
    first(
      AppCore?.state?.token,
      AppCore?.state?.accessToken,
      AppCore?.auth?.getToken?.(),
      AppCore?.Auth?.getToken?.(),
      typeof window !== "undefined" ? window.Auth?.getToken?.() : "",

      getStorageValue("token"),
      getStorageValue("accessToken"),
      getStorageValue("authToken"),
      getStorageValue("onion.token")
    ),
    ""
  );
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  DEFAULT_LOCALE,
  DEFAULT_CURRENCY,

  isNil,
  isPlainObject,
  hasOwnKeys,
  isBrowser,
  isPromiseLike,
  noop,

  safeText,
  safeString,
  safeMultilineText,
  safeLower,
  safeUpper,
  safeBoolean,
  safeArray,
  safeObject,
  safeNumber,

  normalizeMoney,
  roundMoney,
  round2,
  clampNumber,
  compareNumber,

  first,
  pickFirst,
  readPath,
  firstFromSources,

  uniqueStrings,
  uniqueList,
  uniqueObjects,
  uniqueBy,

  normalizeWhitespace,
  normalizeText,
  normalizeKey,
  normalizeIdentity,
  sameIdentity,
  compareText,
  truncate,
  getInitials,

  escapeHtml,
  escapeAttr,

  normalizeDateInput,
  safeDateMs,
  toMs,
  compareDate,
  formatDate,
  formatDateTime,
  formatRelativeDate,

  formatMoney,
  formatPercent,

  safeErrorMessage,
  getHttpStatus,
  shouldTryNextHttpError,

  safeEmit,
  safeOn,
  safeOff,
  safeLog,
  safeWarn,
  safeError,

  showToast,

  wait,
  waitForPaint,
  createTimeoutController,

  getStorageValue,
  getApiBase,
  isAbsoluteUrl,
  buildApiUrl,
  resolveApiUrl,
  getAuthToken,
};
