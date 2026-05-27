/* =========================================================
   Onion Support - Incidencias Utils
   Archivo: /src/views/incidencias/incidencias.utils.js

   Responsabilidad:
   - Helpers comunes y reutilizables del módulo Incidencias.
   - Sanitización, texto, números, fechas, arrays, objetos, formato y errores.
   - URLs seguras para avatares, adjuntos y enlaces externos.
   - Toast y eventos mínimos a través de AppCore.
   - No llamar APIs.
   - No leer Router/Auth/Store.
   - No registrar globals.
   - No emitir por window.
   - No duplicar lógica de modelo, vista, bindings ni modales.
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   VERSION
========================================================= */

export const INCIDENCIAS_UTILS_VERSION = "incidencias.utils.v3.solid";

/* =========================================================
   ENV
========================================================= */

export const BrowserWindow = typeof window !== "undefined" ? window : null;
export const BrowserDocument = typeof document !== "undefined" ? document : null;
export const BrowserNavigator = typeof navigator !== "undefined" ? navigator : null;

export function isBrowser() {
  return Boolean(BrowserWindow && BrowserDocument);
}

export function isFile(value) {
  return typeof File !== "undefined" && value instanceof File;
}

export function isBlob(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

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

export function isFunction(value) {
  return typeof value === "function";
}

export function isPromiseLike(value) {
  return Boolean(value && typeof value.then === "function");
}

export function safeString(value, fallback = "") {
  if (isNil(value)) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

export function safeText(value, fallback = "") {
  if (isNil(value)) return fallback;

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

export function safeArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  return Array.isArray(fallback) ? fallback : [];
}

export function safeObject(value, fallback = {}) {
  if (isObject(value)) return value;
  return isObject(fallback) ? fallback : {};
}

export function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

export function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }

  return null;
}

export function hasOwn(object = {}, key = "") {
  return Object.prototype.hasOwnProperty.call(safeObject(object), key);
}

export function hasOwnKeys(value = {}) {
  return Boolean(isObject(value) && Object.keys(value).length > 0);
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
    .replace(/¥/g, "")
    .replace(/%/g, "")
    .replace(/[^\d.,+\-\s]/g, "")
    .replace(/\s+/g, "");

  if (!normalized || normalized === "-" || normalized === "+") return fallback;

  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");

  if (hasComma && hasDot) {
    const lastComma = normalized.lastIndexOf(",");
    const lastDot = normalized.lastIndexOf(".");

    normalized = lastComma > lastDot
      ? normalized.replace(/\./g, "").replace(/,/g, ".")
      : normalized.replace(/,/g, "");
  } else if (hasComma) {
    normalized = normalized.replace(/,/g, ".");
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

export function safeNumber(value, fallback = 0) {
  const number = parseLocaleNumber(value, NaN);
  return Number.isFinite(number) ? number : fallback;
}

export function safeInteger(value, fallback = 0) {
  const number = safeNumber(value, NaN);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

export function clamp(value, min = 0, max = 1) {
  const lower = safeNumber(min, 0);
  const upper = safeNumber(max, lower);
  const number = safeNumber(value, lower);

  return Math.min(Math.max(number, lower), upper);
}

export function round(value = 0, decimals = 2) {
  const number = safeNumber(value, 0);
  const places = clamp(safeInteger(decimals, 2), 0, 12);
  const factor = 10 ** places;

  return Math.round((number + Number.EPSILON) * factor) / factor;
}

/* =========================================================
   JSON / CLONE
========================================================= */

export function safeJsonParse(value = "", fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;

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
    if (typeof structuredClone === "function") return structuredClone(value);
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
  return String(value ?? "")
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
    .replace(/[^\w:.]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function truncate(value = "", max = 160) {
  const text = safeString(value, "");
  const limit = Math.max(0, safeInteger(max, 160));

  if (!text || limit <= 0) return "";
  if (text.length <= limit) return text;
  if (limit <= 1) return "…";

  return `${text.slice(0, limit - 1).trim()}…`;
}

export function capitalize(value = "") {
  const text = safeText(value, "");
  if (!text) return "";

  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

export function getInitials(value = "") {
  const text = normalizeWhitespace(value);
  if (!text) return "ON";

  const parts = text.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase() || "ON";
  }

  return `${parts[0]?.[0] || ""}${parts[parts.length - 1]?.[0] || ""}`
    .toUpperCase()
    .slice(0, 2) || "ON";
}

export function slugify(value = "") {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "");
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
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  });
}

export function uniqueStrings(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flatMap((value) => Array.isArray(value) ? value : [value])
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    ),
  ];
}

export function dedupeBy(items = [], keyGetter = identity) {
  const list = safeArray(items);

  if (typeof keyGetter !== "function") return [...list];

  const map = new Map();
  const anonymous = [];

  list.forEach((item, index) => {
    const key = safeText(keyGetter(item, index), "");

    if (!key) {
      anonymous.push(item);
      return;
    }

    if (!map.has(key)) map.set(key, item);
  });

  return [...map.values(), ...anonymous];
}

export function sortByText(items = [], getter = identity, locale = "es") {
  return [...safeArray(items)].sort((a, b) => {
    return safeText(getter(a), "").localeCompare(
      safeText(getter(b), ""),
      locale,
      {
        numeric: true,
        sensitivity: "base",
      }
    );
  });
}

/* =========================================================
   DATE
========================================================= */

function parseSpanishDate(value = "") {
  const text = safeText(value, "");
  if (!text) return null;

  const match = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
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
    const milliseconds = value > 9999999999 ? value : value * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const raw = safeText(value, "");
  if (!raw) return null;

  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    return toDate(numeric);
  }

  const spanishDate = parseSpanishDate(raw);
  if (spanishDate) return spanishDate;

  const date = new Date(raw.includes("T") || raw.includes("Z") ? raw : `${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
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

  if (dateFormatterCache.has(key)) return dateFormatterCache.get(key);

  const formatter = new Intl.DateTimeFormat(locale, options);
  dateFormatterCache.set(key, formatter);

  return formatter;
}

export function formatDate(value = null) {
  const date = toDate(value);
  if (!date) return "—";

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
  if (!date) return "—";

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
  if (!date) return "—";

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
  if (!date) return "—";

  const diffMs = Date.now() - date.getTime();
  const future = diffMs < 0;
  const absMs = Math.abs(diffMs);

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (absMs < minute) return future ? "En un momento" : "Hace un momento";

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
  const milliseconds = toMs(value);
  return Boolean(milliseconds && milliseconds < Date.now());
}

/* =========================================================
   NUMBERS / MONEY / FILES
========================================================= */

const numberFormatterCache = new Map();
const moneyFormatterCache = new Map();

function getNumberFormatter(locale = "es-ES", options = {}) {
  const key = `${locale}:${safeJsonStringify(options, "{}")}`;

  if (numberFormatterCache.has(key)) return numberFormatterCache.get(key);

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

  if (moneyFormatterCache.has(code)) return moneyFormatterCache.get(code);

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

  if (!Number.isFinite(amount)) return "—";

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
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;

  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function safeFilename(value = "", fallback = "archivo") {
  const name = safeText(value, fallback)
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  return name || fallback;
}

/* =========================================================
   URL / PATH / QUERY
========================================================= */

const STRICT_SENSITIVE_QUERY_RE =
  /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key)=/i;

const SIGNED_RESOURCE_QUERY_RE =
  /[?&#](?:sig|signature)=/i;

export function hasSensitiveQuery(value = "", options = {}) {
  const raw = String(value || "");
  const opts = safeObject(options);

  if (!raw) return false;
  if (STRICT_SENSITIVE_QUERY_RE.test(raw)) return true;

  if (opts.allowSignedResource === true) {
    return false;
  }

  return SIGNED_RESOURCE_QUERY_RE.test(raw);
}

export function isAbsoluteUrl(value = "") {
  return /^https?:\/\//i.test(safeText(value, ""));
}

export function isBlobUrl(value = "") {
  return /^blob:/i.test(safeText(value, ""));
}

export function isSafeUrl(value = "", options = {}) {
  const raw = safeText(value, "");
  const opts = safeObject(options);

  if (!raw) return false;
  if (hasSensitiveQuery(raw, { allowSignedResource: Boolean(opts.allowSignedResource) })) return false;
  if (/[\r\n\t\\]/.test(raw)) return false;
  if (/^(?:javascript|vbscript|file):/i.test(raw)) return false;
  if (raw.startsWith("//")) return false;

  if (isBlobUrl(raw)) {
    return Boolean(opts.allowBlob);
  }

  if (raw.startsWith("/")) {
    return opts.allowRelative !== false;
  }

  if (/^https:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      return url.protocol === "https:";
    } catch {
      return false;
    }
  }

  if (/^http:\/\//i.test(raw)) {
    return Boolean(opts.allowHttp);
  }

  return false;
}

export function safeExternalUrl(value = "") {
  const raw = safeText(value, "");

  if (!isSafeUrl(raw, {
    allowBlob: false,
    allowRelative: true,
    allowHttp: false,
    allowSignedResource: false,
  })) {
    return "";
  }

  if (raw.startsWith("/")) {
    return raw.replace(/\/{2,}/g, "/");
  }

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

export function safeResourceUrl(value = "", options = {}) {
  const raw = safeText(value, "");
  const opts = {
    allowBlob: true,
    allowRelative: true,
    allowHttp: false,
    allowSignedResource: true,
    ...safeObject(options),
  };

  if (!isSafeUrl(raw, opts)) return "";

  if (isBlobUrl(raw)) return raw;

  if (raw.startsWith("/")) {
    return raw.replace(/\/{2,}/g, "/");
  }

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  if (opts.allowHttp && /^http:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

export function safeImageSrc(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";
  if (hasSensitiveQuery(raw)) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(?:data|blob|javascript|vbscript|file):/i.test(raw)) return "";
  if (raw.startsWith("//")) return "";

  if (raw.startsWith("/")) {
    return raw.replace(/\/{2,}/g, "/");
  }

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  if (
    raw.includes("/") ||
    /\.(?:png|jpe?g|gif|webp|svg|avif|bmp)(?:[?#].*)?$/i.test(raw)
  ) {
    const clean = raw
      .replace(/^\.\//, "")
      .replace(/^\/+/, "")
      .replace(/\/{2,}/g, "/");

    return clean ? `/${clean}` : "";
  }

  return "";
}

export function safeAvatarSrc(value = "") {
  return safeImageSrc(value);
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

  if (!cleanUrl || !query) return cleanUrl;

  const [baseWithQuery, hash = ""] = cleanUrl.split("#");
  const separator = baseWithQuery.includes("?") ? "&" : "?";
  const nextUrl = `${baseWithQuery}${separator}${query.slice(1)}`;

  return hash ? `${nextUrl}#${hash}` : nextUrl;
}

/* =========================================================
   EVENTS
========================================================= */

export function safeEmit(event = "", payload = {}) {
  const eventName = safeText(event, "");
  if (!eventName) return false;

  try {
    AppCore?.events?.emit?.(eventName, payload);
    return true;
  } catch {
    return false;
  }
}

export function safeOn(event = "", handler = null) {
  const eventName = safeText(event, "");
  if (!eventName || typeof handler !== "function") return false;

  try {
    if (typeof AppCore?.events?.on === "function") {
      const off = AppCore.events.on(eventName, handler);
      return typeof off === "function" ? off : true;
    }
  } catch {}

  return false;
}

export function safeOff(event = "", handler = null) {
  const eventName = safeText(event, "");
  if (!eventName || typeof handler !== "function") return false;

  try {
    AppCore?.events?.off?.(eventName, handler);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ASYNC / TIMEOUT
========================================================= */

export function sleep(ms = 0) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, safeNumber(ms, 0)));
  });
}

export function debounce(fn = null, wait = 0) {
  let timer = 0;

  const debounced = (...args) => {
    if (timer) clearTimeout(timer);

    timer = setTimeout(() => {
      timer = 0;
      if (typeof fn === "function") fn(...args);
    }, Math.max(0, safeNumber(wait, 0)));
  };

  debounced.cancel = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = 0;
  };

  return debounced;
}

export function createTimeoutController(timeoutMs = 15000) {
  if (typeof AbortController === "undefined") {
    return {
      controller: null,
      signal: undefined,
      clear: noop,
    };
  }

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
  if (["success", "error", "warning", "info"].includes(key)) return key;

  return key || "info";
}

function callToastCandidate(candidate = null, message = "", type = "info", options = {}) {
  if (!candidate) return false;

  const text = safeText(message, "");
  const finalType = normalizeToastType(type);
  const finalOptions = safeObject(options);

  const methodNames = finalType === "warning"
    ? ["warning", "warn"]
    : [finalType];

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
  if (!text) return false;

  const finalType = normalizeToastType(type);
  const finalOptions = safeObject(options);

  const candidates = [
    AppCore?.toast,
    AppCore?.ui?.toast,
  ];

  for (const candidate of candidates) {
    if (callToastCandidate(candidate, text, finalType, finalOptions)) return true;
  }

  try {
    const logger = finalType === "error"
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
      error?.cause?.message,
      error?.response?.message,
      error?.response?.data?.message,
      error?.response?.data?.error,
      error?.response?.data?.detail,
      error?.data?.message,
      error?.data?.error,
      error?.data?.detail,
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
      error?.code,
      error?.response?.status,
      error?.response?.statusCode,
      error?.response?.data?.status,
      error?.response?.data?.statusCode,
      error?.data?.status,
      error?.data?.statusCode
    ),
    0
  );
}

export function isAbortError(error = null) {
  const name = safeText(error?.name, "");
  const message = safeText(error?.message, "");

  return name === "AbortError" || /aborted|abortado/i.test(message);
}

export function cloneError(error = null) {
  if (!error) return null;

  return {
    name: safeText(error?.name, "Error"),
    message: getErrorMessage(error),
    status: getErrorStatus(error),
    aborted: isAbortError(error),
    stack: safeText(error?.stack, ""),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  INCIDENCIAS_UTILS_VERSION,

  BrowserWindow,
  BrowserDocument,
  BrowserNavigator,

  isBrowser,
  isFile,
  isBlob,

  isNil,
  isObject,
  isPlainObject,
  isFunction,
  isPromiseLike,

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
  hasOwnKeys,
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
  safeFilename,

  hasSensitiveQuery,
  isAbsoluteUrl,
  isBlobUrl,
  isSafeUrl,
  safeExternalUrl,
  safeResourceUrl,
  safeImageSrc,
  safeAvatarSrc,
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
  debounce,
  createTimeoutController,

  normalizeToastType,
  showToast,

  getErrorMessage,
  getErrorStatus,
  isAbortError,
  cloneError,
};
