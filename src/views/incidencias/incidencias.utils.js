/* =========================================================
   Onion SPA - Incidencias Utils
   Archivo: src/views/incidencias/incidencias.utils.js

   EXTREME MODE · UTILS CORE · 12/10

   Responsabilidades:
   - helpers puros reutilizables
   - sanitización robusta
   - fechas seguras
   - números tolerantes a formatos ES/EU
   - texto / normalización / slug
   - arrays / objetos / dedupe
   - money / bytes / formatters cacheados
   - toast bridge multi-entorno
   - event bridge AppCore + window
   - helpers de URL/query/path
   - cero dependencias frágiles
   - compatibilidad total con template / actions / api / model / store / modal
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   ENV
========================================================= */

export const BrowserWindow = typeof window !== "undefined" ? window : null;
export const BrowserDocument = typeof document !== "undefined" ? document : null;
export const BrowserNavigator = typeof navigator !== "undefined" ? navigator : null;

/* =========================================================
   BASE
========================================================= */

export function isNil(value) {
  return value === null || value === undefined;
}

export function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isPlainObject(value) {
  if (!isObject(value)) return false;

  const proto = Object.getPrototypeOf(value);

  return proto === Object.prototype || proto === null;
}

export function safeString(value, fallback = "") {
  if (isNil(value)) {
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

export function safeUpper(value, fallback = "") {
  return safeText(value, fallback).toUpperCase();
}

export function safeArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  return Array.isArray(fallback) ? fallback : [];
}

export function safeObject(value, fallback = {}) {
  if (isObject(value)) {
    return value;
  }

  return isObject(fallback) ? fallback : {};
}

export function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    return value;
  }

  return null;
}

export function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return null;
}

export function hasOwn(object = {}, key = "") {
  return Object.prototype.hasOwnProperty.call(safeObject(object), key);
}

export function noop() {}

export function identity(value) {
  return value;
}

/* =========================================================
   BOOLEAN / NUMBER
========================================================= */

export function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (["true", "1", "yes", "y", "si", "sí", "on", "enabled"].includes(key)) {
      return true;
    }

    if (["false", "0", "no", "n", "off", "disabled"].includes(key)) {
      return false;
    }
  }

  return fallback;
}

export function parseLocaleNumber(value, fallback = NaN) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  let normalized = String(value)
    .trim()
    .replace(/€/g, "")
    .replace(/\$/g, "")
    .replace(/£/g, "")
    .replace(/%/g, "")
    .replace(/[^\d.,+\-\s]/g, "")
    .replace(/\s/g, "");

  if (!normalized) {
    return fallback;
  }

  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");

  if (hasComma && hasDot) {
    const lastComma = normalized.lastIndexOf(",");
    const lastDot = normalized.lastIndexOf(".");

    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (hasComma) {
    normalized = normalized.replace(/,/g, ".");
  }

  const n = Number(normalized);

  return Number.isFinite(n) ? n : fallback;
}

export function safeNumber(value, fallback = 0) {
  const n = parseLocaleNumber(value, NaN);

  return Number.isFinite(n) ? n : fallback;
}

export function safeInteger(value, fallback = 0) {
  const n = safeNumber(value, NaN);

  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function clamp(value, min = 0, max = 1) {
  const n = safeNumber(value, min);
  const lower = safeNumber(min, 0);
  const upper = safeNumber(max, lower);

  return Math.min(Math.max(n, lower), upper);
}

export function round(value = 0, decimals = 2) {
  const n = safeNumber(value, 0);
  const places = clamp(safeInteger(decimals, 2), 0, 12);
  const factor = 10 ** places;

  return Math.round((n + Number.EPSILON) * factor) / factor;
}

/* =========================================================
   JSON / CLONE
========================================================= */

export function safeJsonParse(value = "", fallback = null) {
  if (value === null || value === undefined) return fallback;

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

export function safeJsonStringify(value = null, fallback = "") {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

export function safeClone(value) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

/* =========================================================
   HTML / CSV
========================================================= */

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

export function escapeAttribute(value = "") {
  return escapeHtml(value);
}

export function stripHtml(value = "") {
  return String(value ?? "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export function escapeCsvCell(value = "") {
  const text = value === null || value === undefined ? "" : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

/* =========================================================
   TEXT
========================================================= */

export function normalizeText(value = "") {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeWhitespace(value = "") {
  return safeText(value, "").replace(/\s+/g, " ").trim();
}

export function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

export function capitalize(value = "") {
  const text = safeText(value, "");

  if (!text) return "";

  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
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

export function hashString(value = "") {
  const text = safeText(value, "onion");

  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }

  return Math.abs(hash >>> 0);
}

/* =========================================================
   ARRAYS / COLLECTIONS
========================================================= */

export function compact(values = []) {
  return safeArray(values).filter((value) => {
    if (value === undefined || value === null) return false;
    if (typeof value === "string" && value.trim() === "") return false;
    return true;
  });
}

export function uniqueStrings(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    ),
  ];
}

export function dedupeBy(items = [], keyGetter = identity) {
  const list = safeArray(items);

  if (typeof keyGetter !== "function") {
    return [...list];
  }

  const map = new Map();
  const anonymous = [];

  list.forEach((item, index) => {
    const key = safeText(keyGetter(item, index), "");

    if (!key) {
      anonymous.push(item);
      return;
    }

    if (!map.has(key)) {
      map.set(key, item);
    }
  });

  return [...map.values(), ...anonymous];
}

export function sortByText(items = [], getter = identity, locale = "es") {
  return [...safeArray(items)].sort((a, b) => {
    return safeText(getter(a), "").localeCompare(safeText(getter(b), ""), locale, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

/* =========================================================
   DATE
========================================================= */

function parseSpanishDate(value = "") {
  const text = safeText(value, "");
  if (!text) return null;

  const match = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*|\s+)?(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (!match) return null;

  const [, dd, mm, yyyy, hh = "0", min = "0", ss = "0"] = match;

  const date = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
    Number(ss)
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDate(value = null) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 9999999999 ? value : value * 1000;
    const date = new Date(ms);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const raw = safeText(value, "");
  if (!raw) return null;

  const numeric = Number(raw);

  if (Number.isFinite(numeric) && numeric > 0) {
    return toDate(numeric);
  }

  const spanishDate = parseSpanishDate(raw);

  if (spanishDate) {
    return spanishDate;
  }

  const date = new Date(raw.includes("T") ? raw : raw);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function toMs(value = null) {
  const date = toDate(value);
  return date ? date.getTime() : 0;
}

export function toTimestamp(value = null) {
  return toMs(value);
}

const dateFormatterCache = new Map();

function getDateFormatter(locale = "es-ES", options = {}) {
  const key = `${locale}:${safeJsonStringify(options, "{}")}`;

  if (dateFormatterCache.has(key)) {
    return dateFormatterCache.get(key);
  }

  const formatter = new Intl.DateTimeFormat(locale, options);
  dateFormatterCache.set(key, formatter);

  return formatter;
}

export function formatDate(value = null) {
  const date = toDate(value);

  if (!date) {
    return "—";
  }

  try {
    return getDateFormatter("es-ES", {
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
    return getDateFormatter("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  } catch {
    return "—";
  }
}

export function formatTimeOnly(value = null) {
  const date = toDate(value);

  if (!date) {
    return "—";
  }

  try {
    return getDateFormatter("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
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

export function isExpired(value = null) {
  const ms = toMs(value);
  return Boolean(ms && ms < Date.now());
}

/* =========================================================
   NUMBERS / MONEY / FILES
========================================================= */

const numberFormatterCache = new Map();
const moneyFormatterCache = new Map();

function getNumberFormatter(locale = "es-ES", options = {}) {
  const key = `${locale}:${safeJsonStringify(options, "{}")}`;

  if (numberFormatterCache.has(key)) {
    return numberFormatterCache.get(key);
  }

  const formatter = new Intl.NumberFormat(locale, options);
  numberFormatterCache.set(key, formatter);

  return formatter;
}

export function formatNumber(value = 0, options = {}) {
  const number = safeNumber(value, 0);

  try {
    return getNumberFormatter("es-ES", safeObject(options)).format(number);
  } catch {
    return String(number);
  }
}

function getMoneyFormatter(currency = "EUR") {
  const code = safeText(currency, "EUR").toUpperCase();

  if (moneyFormatterCache.has(code)) {
    return moneyFormatterCache.get(code);
  }

  const formatter = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  moneyFormatterCache.set(code, formatter);

  return formatter;
}

export function formatMoney(value = 0, currency = "EUR") {
  const amount = safeNumber(value, NaN);

  if (!Number.isFinite(amount)) {
    return "—";
  }

  const code = safeText(currency, "EUR").toUpperCase();

  try {
    return getMoneyFormatter(code).format(amount);
  } catch {
    return `${amount.toFixed(2).replace(".", ",")} ${code}`;
  }
}

export function formatPercent(value = 0, options = {}) {
  const amount = safeNumber(value, 0);

  try {
    return getNumberFormatter("es-ES", {
      style: "percent",
      maximumFractionDigits: 2,
      ...safeObject(options),
    }).format(amount);
  } catch {
    return `${round(amount * 100, 2)}%`;
  }
}

export function formatBytes(bytes = 0, fallback = "") {
  const size = Number(bytes);

  if (!Number.isFinite(size) || size <= 0) return fallback;

  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;

  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/* =========================================================
   URL / PATH / QUERY
========================================================= */

export function isAbsoluteUrl(value = "") {
  return /^https?:\/\//i.test(safeText(value, ""));
}

export function normalizePathPart(value = "") {
  return safeText(value, "").replace(/^\/+|\/+$/g, "");
}

export function joinPath(...parts) {
  const joined = parts
    .map((part) => normalizePathPart(part))
    .filter(Boolean)
    .join("/");

  return joined ? `/${joined}` : "/";
}

export function joinApiPath(...parts) {
  return parts
    .map((part) => normalizePathPart(part))
    .filter(Boolean)
    .join("/");
}

export function encodePathSegment(value = "") {
  return encodeURIComponent(safeText(value, ""));
}

export function buildQueryString(params = {}) {
  const obj = safeObject(params);
  const pairs = [];

  Object.entries(obj).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === "string" && value.trim() === "") return;

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item === undefined || item === null) return;
        if (typeof item === "string" && item.trim() === "") return;

        pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
      });

      return;
    }

    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  });

  return pairs.length ? `?${pairs.join("&")}` : "";
}

export function appendQueryParams(url = "", params = {}) {
  const cleanUrl = safeText(url, "");
  const query = buildQueryString(params);

  if (!query) return cleanUrl;

  return `${cleanUrl}${cleanUrl.includes("?") ? "&" : "?"}${query.slice(1)}`;
}

/* =========================================================
   EVENTS
========================================================= */

export function safeEmit(event = "", payload = {}) {
  const eventName = safeText(event, "");
  if (!eventName) return false;

  let emitted = false;

  try {
    AppCore?.events?.emit?.(eventName, payload);
    emitted = true;
  } catch {}

  try {
    BrowserWindow?.dispatchEvent?.(
      new CustomEvent(eventName, {
        detail: payload,
      })
    );
    emitted = true;
  } catch {}

  return emitted;
}

export function safeOn(event = "", handler = null) {
  const eventName = safeText(event, "");
  if (!eventName || typeof handler !== "function") return false;

  let attached = false;

  try {
    AppCore?.events?.on?.(eventName, handler);
    attached = true;
  } catch {}

  try {
    BrowserWindow?.addEventListener?.(eventName, handler);
    attached = true;
  } catch {}

  return attached;
}

export function safeOff(event = "", handler = null) {
  const eventName = safeText(event, "");
  if (!eventName || typeof handler !== "function") return false;

  let detached = false;

  try {
    AppCore?.events?.off?.(eventName, handler);
    detached = true;
  } catch {}

  try {
    BrowserWindow?.removeEventListener?.(eventName, handler);
    detached = true;
  } catch {}

  return detached;
}

/* =========================================================
   ASYNC / TIMEOUT
========================================================= */

export function sleep(ms = 0) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, safeNumber(ms, 0)));
  });
}

export function createTimeoutController(timeoutMs = 15000) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, Math.max(1, safeNumber(timeoutMs, 15000)));

  return {
    controller,
    signal: controller.signal,
    clear() {
      clearTimeout(timer);
    },
  };
}

/* =========================================================
   UI / TOAST
========================================================= */

export function normalizeToastType(type = "info") {
  const key = normalizeKey(type || "info");

  if (key === "warn") return "warning";
  if (key === "danger") return "error";
  if (key === "ok") return "success";
  if (key === "success") return "success";
  if (key === "error") return "error";
  if (key === "warning") return "warning";
  if (key === "info") return "info";

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
  const finalOptions = safeObject(options);
  const methodNames = getToastMethodNames(finalType);

  for (const methodName of methodNames) {
    try {
      if (typeof candidate?.[methodName] === "function") {
        candidate[methodName](text, finalOptions);
        return true;
      }
    } catch {}
  }

  try {
    if (typeof candidate?.show === "function") {
      candidate.show({
        message: text,
        type: finalType,
        ...finalOptions,
      });
      return true;
    }
  } catch {}

  try {
    if (typeof candidate?.show === "function") {
      candidate.show(text, finalType, finalOptions);
      return true;
    }
  } catch {}

  try {
    if (typeof candidate === "function") {
      candidate(text, finalType, finalOptions);
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
      const toastModule =
        AppCore.modules.get("toast") ||
        AppCore.modules.get("Toast") ||
        AppCore.modules.get("ui.toast");

      if (callToastCandidate(toastModule, text, finalType, finalOptions)) {
        return true;
      }
    }
  } catch {}

  const candidates = [
    AppCore?.toast,
    AppCore?.Toast,
    AppCore?.ui?.toast,
    AppCore?.ui?.Toast,
    AppCore?.modules?.Toast,
    AppCore?.modules?.toast,
    BrowserWindow?.Toast,
    BrowserWindow?.toast,
    BrowserWindow?.AppToast,
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
   ERROR
========================================================= */

export function getErrorMessage(error = null, fallback = "No se pudo completar la acción.") {
  return safeText(
    first(
      error?.message,
      error?.response?.message,
      error?.response?.data?.message,
      error?.data?.message,
      error?.data?.error,
      error?.response?.error,
      error?.error,
      error?.detail,
      fallback
    ),
    fallback
  );
}

export function getErrorStatus(error = null) {
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

export function cloneError(error = null) {
  if (!error) return null;

  return {
    name: safeText(error?.name, "Error"),
    message: getErrorMessage(error),
    status: getErrorStatus(error),
    stack: safeText(error?.stack, ""),
    raw: error,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  BrowserWindow,
  BrowserDocument,
  BrowserNavigator,

  isNil,
  isObject,
  isPlainObject,

  safeString,
  safeText,
  safeLower,
  safeUpper,
  safeNumber,
  safeInteger,
  safeBoolean,
  safeArray,
  safeObject,
  first,
  firstDefined,
  hasOwn,
  noop,
  identity,

  parseLocaleNumber,
  clamp,
  round,

  safeJsonParse,
  safeJsonStringify,
  safeClone,

  escapeHtml,
  escapeAttribute,
  stripHtml,
  escapeCsvCell,

  normalizeText,
  normalizeWhitespace,
  normalizeKey,
  truncate,
  capitalize,
  getInitials,
  slugify,
  hashString,

  compact,
  uniqueStrings,
  dedupeBy,
  sortByText,

  toDate,
  toMs,
  toTimestamp,
  formatDate,
  formatDateOnly,
  formatTimeOnly,
  formatRelativeDate,
  isExpired,

  formatNumber,
  formatMoney,
  formatPercent,
  formatBytes,

  isAbsoluteUrl,
  normalizePathPart,
  joinPath,
  joinApiPath,
  encodePathSegment,
  buildQueryString,
  appendQueryParams,

  safeEmit,
  safeOn,
  safeOff,

  sleep,
  createTimeoutController,

  normalizeToastType,
  showToast,

  getErrorMessage,
  getErrorStatus,
  cloneError,
};
