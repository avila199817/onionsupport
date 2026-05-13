/* =========================================================
   Onion SPA - Home Utils
   Archivo: src/views/home/home.utils.js

   ONION SUPPORT · HOME UTILS
   EXTREME MODE · FINAL PRO · MODULAR HOME · 12/10

   Responsabilidades:
   - Helpers puros reutilizables del módulo Home.
   - Sanitización robusta.
   - Fechas seguras.
   - Números / dinero / porcentajes.
   - Texto / slug / normalización.
   - Colecciones / dedupe / ordenación.
   - Clipboard / descarga CSV.
   - Toast bridge tolerante.
   - Event bridge tolerante.
   - Helpers DOM seguros.
   - Helpers async/timing.
   - Cero dependencias frágiles.
   - Compatibilidad total con template / actions / api / view.

   Hardening:
   - Tolera AppCore incompleto.
   - Tolera Toast global / módulo registrado / ui.toast / AppCore.toast.
   - Soporta fechas futuras en relative date.
   - Evita fallos con objetos en first().
   - Parseo numérico compatible es-ES / importes.
   - CSV seguro.
   - Redacción de tokens en logs/eventos.
   - CSP clean.
   - Sin HTML/eventos inline.
   - Sin CSS inline.
   - Sin Object.assign(style).
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const HOME_UTILS_VERSION = "12.0.0";

export const HOME_UTILS_SOURCE = "views:home:utils";

export const DEFAULT_LOCALE = "es-ES";
export const DEFAULT_CURRENCY = "EUR";

export const DEFAULT_DATE_FALLBACK = "—";
export const DEFAULT_EMPTY_TEXT = "—";

export const CSV_MIME_TYPE = "text/csv;charset=utf-8;";
export const TEXT_MIME_TYPE = "text/plain;charset=utf-8;";

const COLLECTION_ITEM_KEYS = Object.freeze([
  "items",
  "rows",
  "data",
  "results",
  "records",
  "value",
  "docs",
  "documents",
  "collection",
  "list",
]);

const DIRECT_COLLECTION_KEYS = Object.freeze([
  "tickets",
  "incidencias",
  "incidents",
  "issues",
  "supportTickets",

  "facturas",
  "invoices",
  "bills",
  "billing",

  "users",
  "usuarios",
  "members",

  "clients",
  "clientes",
  "customers",

  "activity",
  "activities",
  "recent",
  "recentActivity",
  "timeline",
  "logs",
  "events",
]);

const NUMBER_FORMATTER_CACHE = new Map();
const MONEY_FORMATTER_CACHE = new Map();
const DATE_FORMATTER_CACHE = new Map();

/* =========================================================
   RUNTIME
========================================================= */

export function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function isDocumentReady() {
  if (!isBrowser()) {
    return false;
  }

  try {
    return document.readyState === "interactive" || document.readyState === "complete";
  } catch {
    return false;
  }
}

export function now() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

export function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

export function noop() {}

/* =========================================================
   BASE SAFE HELPERS
========================================================= */

export function isObject(value) {
  return Boolean(value !== null && typeof value === "object" && !Array.isArray(value));
}

export function isAnyObject(value) {
  return Boolean(value !== null && typeof value === "object");
}

export function isFunction(value) {
  return typeof value === "function";
}

export function isNil(value) {
  return value === null || value === undefined;
}

export function isEmptyString(value) {
  return typeof value === "string" && value.trim() === "";
}

export function hasOwn(object, key) {
  try {
    return Object.prototype.hasOwnProperty.call(object, key);
  } catch {
    return false;
  }
}

export function hasOwnKeys(value = {}) {
  return Boolean(isObject(value) && Object.keys(value).length > 0);
}

export function safeString(value, fallback = "") {
  if (isNil(value)) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

export function safeText(value, fallback = "") {
  if (isNil(value)) {
    return fallback;
  }

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

export function safeArray(value, fallback = []) {
  if (Array.isArray(value)) {
    return value;
  }

  return Array.isArray(fallback) ? fallback : [];
}

export function safeObject(value, fallback = {}) {
  if (isObject(value)) {
    return value;
  }

  return isObject(fallback) ? fallback : {};
}

export function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string") {
    let normalized = value
      .trim()
      .replace(/[€$£¥%]/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s/g, "");

    if (!normalized || normalized === "-" || normalized === "+") {
      return fallback;
    }

    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
      const lastComma = normalized.lastIndexOf(",");
      const lastDot = normalized.lastIndexOf(".");

      normalized =
        lastComma > lastDot
          ? normalized.replace(/\./g, "").replace(/,/g, ".")
          : normalized.replace(/,/g, "");
    } else if (hasComma) {
      normalized = normalized.replace(/,/g, ".");
    }

    const number = Number(normalized);

    return Number.isFinite(number) ? number : fallback;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

export function safeInteger(value, fallback = 0) {
  const number = safeNumber(value, NaN);

  return Number.isFinite(number) ? Math.trunc(number) : fallback;
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
    const key = value.trim().toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "y",
        "si",
        "sí",
        "ok",
        "on",
        "enabled",
        "active",
      ].includes(key)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "n",
        "off",
        "disabled",
        "inactive",
      ].includes(key)
    ) {
      return false;
    }
  }

  return Boolean(fallback);
}

export function first(...values) {
  for (const value of values) {
    if (isNil(value)) {
      continue;
    }

    if (typeof value === "string") {
      if (value.trim() === "") {
        continue;
      }

      return value;
    }

    if (Array.isArray(value)) {
      if (!value.length) {
        continue;
      }

      return value;
    }

    if (isObject(value)) {
      if (!Object.keys(value).length) {
        continue;
      }

      return value;
    }

    return value;
  }

  return null;
}

export function clamp(value, min = 0, max = 100) {
  const number = safeNumber(value, min);

  return Math.min(Math.max(number, min), max);
}

export function round(value = 0, digits = 0) {
  const number = safeNumber(value, 0);
  const precision = clamp(safeInteger(digits, 0), 0, 12);
  const factor = 10 ** precision;

  return Math.round((number + Number.EPSILON) * factor) / factor;
}

export function roundMoney(value = 0) {
  return round(value, 2);
}

/* =========================================================
   PATH / OBJECT HELPERS
========================================================= */

export function getPath(object = {}, path = "") {
  const root = safeObject(object, null);
  const cleanPath = safeText(path, "");

  if (!root || !cleanPath) {
    return undefined;
  }

  return cleanPath.split(".").reduce((acc, segment) => {
    if (acc === null || acc === undefined) {
      return undefined;
    }

    return acc?.[segment];
  }, root);
}

export function firstPath(object = {}, paths = []) {
  return first(...safeArray(paths).map((path) => getPath(object, path)));
}

export function pick(object = {}, keys = []) {
  const root = safeObject(object);
  const output = {};

  safeArray(keys).forEach((key) => {
    if (hasOwn(root, key)) {
      output[key] = root[key];
    }
  });

  return output;
}

export function omit(object = {}, keys = []) {
  const root = safeObject(object);
  const blocked = new Set(safeArray(keys));
  const output = {};

  Object.entries(root).forEach(([key, value]) => {
    if (!blocked.has(key)) {
      output[key] = value;
    }
  });

  return output;
}

/* =========================================================
   CLONE / JSON
========================================================= */

export function deepClone(value) {
  if (value === undefined) {
    return undefined;
  }

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

export function parseJson(value, fallback = null) {
  if (isObject(value) || Array.isArray(value)) {
    return value;
  }

  const text = safeText(value, "");

  if (!text) {
    return fallback;
  }

  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function stringifyJson(value, fallback = "{}") {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

export function prettyJson(value, fallback = "{}") {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
}

/* =========================================================
   REDACTION / SANITIZE
========================================================= */

export function redactTokenInText(value = "") {
  let output = safeText(value, "");

  if (!output) {
    return "";
  }

  try {
    output = output.replace(
      /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|tempToken|temp_token|code|t)=)([^&#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(\/activate-account\/)([^/?#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    );

    output = output.replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
  } catch {}

  return output;
}

export function sanitizeError(error = null) {
  if (!error) {
    return null;
  }

  const candidate = error?.reason || error?.error || error;

  return {
    name: safeText(candidate?.name, "Error"),
    message: redactTokenInText(
      safeText(
        candidate?.message ||
          candidate?.reason ||
          candidate,
        "Error"
      )
    ),
    code: safeText(
      candidate?.code ||
        candidate?.data?.code ||
        candidate?.response?.data?.code ||
        "",
      ""
    ),
    status:
      candidate?.status ||
      candidate?.statusCode ||
      candidate?.response?.status ||
      candidate?.data?.status ||
      null,
    at: nowIso(),
  };
}

export function sanitizePayload(value, depth = 0) {
  if (depth > 8) {
    return "[MaxDepth]";
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return redactTokenInText(value);
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (value instanceof Error) {
    return sanitizeError(value);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((item) => sanitizePayload(item, depth + 1));
  }

  if (isAnyObject(value)) {
    const output = {};

    Object.entries(value).forEach(([key, item]) => {
      if (/token|secret|password|authorization|credential|otp|code/i.test(key)) {
        output[key] = item ? "***" : null;
        return;
      }

      output[key] = sanitizePayload(item, depth + 1);
    });

    return output;
  }

  return String(value);
}

/* =========================================================
   HTML / TEXT
========================================================= */

export function escapeHtml(value = "") {
  const text = String(value ?? "");

  try {
    const coreEscape = AppCore?.utils?.escapeHtml;

    if (isFunction(coreEscape)) {
      const result = coreEscape(text);

      if (!isNil(result)) {
        return String(result);
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

export function normalizeText(value = "") {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function normalizeWhitespace(value = "") {
  return safeText(value, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

export function truncate(value = "", max = 160, suffix = "…") {
  const text = safeString(value, "");
  const limit = Math.max(1, safeInteger(max, 160));

  if (!text) {
    return "";
  }

  if (text.length <= limit) {
    return text;
  }

  const finalSuffix = safeText(suffix, "…");

  return `${text.slice(0, Math.max(1, limit - finalSuffix.length)).trim()}${finalSuffix}`;
}

export function getInitials(value = "", fallback = "ON") {
  const text = normalizeWhitespace(value);

  if (!text) {
    return fallback;
  }

  const parts = text.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase() || fallback;
  }

  const initials = parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
    .slice(0, 2);

  return initials || fallback;
}

export function slugify(value = "") {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function includesNormalized(haystack = "", needle = "") {
  const left = normalizeText(haystack);
  const right = normalizeText(needle);

  return Boolean(left && right && left.includes(right));
}

/* =========================================================
   NUMBER / MONEY
========================================================= */

export function getNumberFormatter(locale = DEFAULT_LOCALE, options = {}) {
  const cleanLocale = safeText(locale, DEFAULT_LOCALE);
  const opts = safeObject(options);
  const key = `${cleanLocale}:${stringifyJson(opts, "{}")}`;

  if (NUMBER_FORMATTER_CACHE.has(key)) {
    return NUMBER_FORMATTER_CACHE.get(key);
  }

  const formatter = new Intl.NumberFormat(cleanLocale, opts);

  NUMBER_FORMATTER_CACHE.set(key, formatter);

  return formatter;
}

export function formatNumber(value, locale = DEFAULT_LOCALE, options = {}) {
  const number = safeNumber(value, 0);

  try {
    return getNumberFormatter(
      safeText(locale, DEFAULT_LOCALE),
      safeObject(options)
    ).format(number);
  } catch {
    return String(number);
  }
}

export function getMoneyFormatter(
  currency = DEFAULT_CURRENCY,
  locale = DEFAULT_LOCALE,
  options = {}
) {
  const code = safeText(currency, DEFAULT_CURRENCY).toUpperCase();
  const cleanLocale = safeText(locale, DEFAULT_LOCALE);

  const opts = {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...safeObject(options),
  };

  const key = `${cleanLocale}:${code}:${stringifyJson(opts, "{}")}`;

  if (MONEY_FORMATTER_CACHE.has(key)) {
    return MONEY_FORMATTER_CACHE.get(key);
  }

  const formatter = new Intl.NumberFormat(cleanLocale, opts);

  MONEY_FORMATTER_CACHE.set(key, formatter);

  return formatter;
}

export function formatMoney(
  value,
  currency = DEFAULT_CURRENCY,
  locale = DEFAULT_LOCALE,
  options = {}
) {
  const amount = safeNumber(value, NaN);
  const code = safeText(currency, DEFAULT_CURRENCY).toUpperCase();

  if (!Number.isFinite(amount)) {
    return DEFAULT_EMPTY_TEXT;
  }

  try {
    return getMoneyFormatter(code, locale, options).format(amount);
  } catch {
    return `${amount.toFixed(2).replace(".", ",")} ${code}`;
  }
}

export function percent(value, digits = 0) {
  const number = safeNumber(value, 0);
  const precision = clamp(safeInteger(digits, 0), 0, 6);

  return `${number.toFixed(precision)}%`;
}

export function formatPercent(value, locale = DEFAULT_LOCALE, options = {}) {
  const number = safeNumber(value, 0);
  const opts = safeObject(options);

  try {
    return new Intl.NumberFormat(
      safeText(locale, DEFAULT_LOCALE),
      {
        style: "percent",
        maximumFractionDigits: clamp(opts.maximumFractionDigits ?? 0, 0, 6),
        ...opts,
      }
    ).format(number);
  } catch {
    return percent(number * 100, opts.maximumFractionDigits ?? 0);
  }
}

export function isPositiveTrend(value) {
  return safeNumber(value, 0) > 0;
}

export function isNegativeTrend(value) {
  return safeNumber(value, 0) < 0;
}

/* =========================================================
   DATE
========================================================= */

export function toTimestamp(value) {
  if (!value) {
    return 0;
  }

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9999999999 ? value : value * 1000;
  }

  const raw = safeText(value, "");

  if (!raw) {
    return 0;
  }

  const numeric = Number(raw);

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 9999999999 ? numeric : numeric * 1000;
  }

  const esMatch = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*|\s+)?(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (esMatch) {
    const [, dd, mm, yyyy, hh = "0", min = "0", ss = "0"] = esMatch;

    const date = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(min),
      Number(ss)
    );

    const time = date.getTime();

    return Number.isNaN(time) ? 0 : time;
  }

  const date = new Date(
    raw.includes("T") || raw.includes("Z")
      ? raw
      : `${raw}T00:00:00`
  );

  const time = date.getTime();

  return Number.isNaN(time) ? 0 : time;
}

export function toDate(value) {
  const timestamp = toTimestamp(value);

  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function toMs(value) {
  return toTimestamp(value);
}

export function getDateFormatter(locale = DEFAULT_LOCALE, withTime = true, options = {}) {
  const cleanLocale = safeText(locale, DEFAULT_LOCALE);

  const opts = withTime
    ? {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        ...safeObject(options),
      }
    : {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        ...safeObject(options),
      };

  const key = `${cleanLocale}:${withTime ? "date-time" : "date"}:${stringifyJson(opts, "{}")}`;

  if (DATE_FORMATTER_CACHE.has(key)) {
    return DATE_FORMATTER_CACHE.get(key);
  }

  const formatter = new Intl.DateTimeFormat(cleanLocale, opts);

  DATE_FORMATTER_CACHE.set(key, formatter);

  return formatter;
}

export function formatDate(
  value,
  {
    locale = DEFAULT_LOCALE,
    fallback = DEFAULT_DATE_FALLBACK,
    withTime = true,
    options = {},
  } = {}
) {
  const date = toDate(value);

  if (!date) {
    return fallback;
  }

  try {
    return getDateFormatter(locale, withTime, options).format(date);
  } catch {
    return fallback;
  }
}

export function formatDateTime(value, options = {}) {
  return formatDate(value, {
    ...safeObject(options),
    withTime: true,
  });
}

export function formatDateOnly(value, options = {}) {
  return formatDate(value, {
    ...safeObject(options),
    withTime: false,
  });
}

export function formatRelativeDate(
  value,
  {
    fallback = "Sin fecha",
    nowMs = now(),
  } = {}
) {
  const timestamp = toTimestamp(value);

  if (!timestamp) {
    return fallback;
  }

  const diff = timestamp - safeNumber(nowMs, now());
  const abs = Math.abs(diff);

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  const future = diff > 0;

  if (abs < minute) {
    return future ? "En un momento" : "Hace un momento";
  }

  if (abs < hour) {
    const minutes = Math.max(1, Math.floor(abs / minute));

    return future
      ? `En ${minutes} min`
      : `Hace ${minutes} min`;
  }

  if (abs < day) {
    const hours = Math.max(1, Math.floor(abs / hour));

    return future
      ? `En ${hours} h`
      : `Hace ${hours} h`;
  }

  if (abs < day * 7) {
    const days = Math.max(1, Math.floor(abs / day));

    return future
      ? `En ${days} día${days === 1 ? "" : "s"}`
      : `Hace ${days} día${days === 1 ? "" : "s"}`;
  }

  return formatDateOnly(value);
}

export function formatLastUpdate(value, options = {}) {
  const timestamp = toTimestamp(value);

  if (!timestamp) {
    return "Sin fecha";
  }

  const diffHours = Math.abs(now() - timestamp) / 3600000;

  if (diffHours <= 72) {
    return formatRelativeDate(value, options);
  }

  return formatDateTime(value, options);
}

/* =========================================================
   COLLECTION
========================================================= */

export function unwrapCollectionPayload(value, depth = 0) {
  if (value === null || value === undefined) {
    return {};
  }

  if (depth > 12) {
    return value;
  }

  if (Array.isArray(value)) {
    return {
      items: value,
      total: value.length,
      count: value.length,
    };
  }

  const object = safeObject(value, null);

  if (!object) {
    return {};
  }

  if (COLLECTION_ITEM_KEYS.some((key) => Array.isArray(object[key]))) {
    return object;
  }

  const directArray = first(...DIRECT_COLLECTION_KEYS.map((key) => object[key]));

  if (Array.isArray(directArray)) {
    return {
      ...object,
      items: directArray,
      total: first(
        object.total,
        object.count,
        object.totalCount,
        object.remoteCount,
        directArray.length
      ),
    };
  }

  const nested = first(
    object.payload,
    object.result,
    object.response,
    object.body,
    object.content,
    object.data
  );

  if (isObject(nested) || Array.isArray(nested)) {
    return unwrapCollectionPayload(nested, depth + 1);
  }

  return object;
}

export function normalizeCollection(value, fallback = []) {
  if (Array.isArray(value)) {
    return value;
  }

  const object = safeObject(unwrapCollectionPayload(value), null);

  if (!object) {
    return safeArray(fallback);
  }

  return safeArray(
    first(...COLLECTION_ITEM_KEYS.map((key) => object[key]), fallback)
  );
}

export function getRemoteCountFromCollection(value, fallback = 0) {
  const object = safeObject(unwrapCollectionPayload(value));

  return Math.max(
    safeNumber(fallback, 0),
    safeNumber(
      first(
        object.totalCount,
        object.remoteCount,
        object.total,
        object.count,
        object.length,

        object.meta?.totalCount,
        object.meta?.remoteCount,
        object.meta?.total,
        object.meta?.count,

        object.pagination?.totalCount,
        object.pagination?.remoteCount,
        object.pagination?.total,
        object.pagination?.count,

        object.page?.total,
        object.page?.count,
        object.pageInfo?.total,
        object.pageInfo?.totalCount,

        fallback
      ),
      fallback
    )
  );
}

export function sortByUpdatedDesc(items = []) {
  return safeArray(items)
    .slice()
    .sort((a, b) => {
      const left = toMs(
        b?.updatedAt ||
          b?.lastUpdateAt ||
          b?.lastUpdate ||
          b?.modifiedAt ||
          b?.createdAt ||
          b?.raw?.updatedAt ||
          b?.raw?.lastUpdateAt ||
          b?.raw?.modifiedAt ||
          b?.raw?.createdAt
      );

      const right = toMs(
        a?.updatedAt ||
          a?.lastUpdateAt ||
          a?.lastUpdate ||
          a?.modifiedAt ||
          a?.createdAt ||
          a?.raw?.updatedAt ||
          a?.raw?.lastUpdateAt ||
          a?.raw?.modifiedAt ||
          a?.raw?.createdAt
      );

      return left - right;
    });
}

export function sortByCreatedDesc(items = []) {
  return safeArray(items)
    .slice()
    .sort((a, b) => {
      const left = toMs(
        b?.createdAt ||
          b?.date ||
          b?.timestamp ||
          b?.raw?.createdAt ||
          b?.raw?.date ||
          b?.raw?.timestamp
      );

      const right = toMs(
        a?.createdAt ||
          a?.date ||
          a?.timestamp ||
          a?.raw?.createdAt ||
          a?.raw?.date ||
          a?.raw?.timestamp
      );

      return left - right;
    });
}

export function uniqueBy(items = [], key = "id", options = {}) {
  const rows = safeArray(items);
  const opts = safeObject(options);
  const keepWithoutKey = opts.keepWithoutKey !== false;

  const seen = new Set();
  const output = [];

  rows.forEach((item, index) => {
    const rawId = isFunction(key)
      ? key(item, index)
      : getPath(item, key) ?? item?.[key];

    const id = safeText(rawId, "");

    if (!id) {
      if (keepWithoutKey) {
        output.push(item);
      }

      return;
    }

    const normalized = normalizeKey(id);

    if (seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    output.push(item);
  });

  return output;
}

export function uniqueById(items = []) {
  return uniqueBy(
    items,
    (item) =>
      first(
        item?.id,
        item?._id,
        item?.widgetId,
        item?.ticketId,
        item?.incidenciaId,
        item?.invoiceId,
        item?.facturaId,
        item?.userId,
        item?.clienteId,
        item?.clientId,
        item?.code,
        item?.slug,

        item?.raw?.id,
        item?.raw?._id,
        item?.raw?.widgetId,
        item?.raw?.ticketId,
        item?.raw?.incidenciaId,
        item?.raw?.invoiceId,
        item?.raw?.facturaId,
        item?.raw?.userId,
        item?.raw?.clienteId,
        item?.raw?.clientId,
        item?.raw?.code,
        item?.raw?.slug
      )
  );
}

export function paginate(items = [], page = 1, pageSize = 10, totalOverride = null) {
  const list = safeArray(items);

  const size = Math.max(1, safeInteger(pageSize, 10));

  const visibleTotal = list.length;

  const total = Math.max(
    visibleTotal,
    safeNumber(totalOverride, visibleTotal)
  );

  const totalPages = Math.max(
    1,
    Math.ceil((total || 1) / size)
  );

  const currentPage = clamp(
    safeInteger(page, 1),
    1,
    totalPages
  );

  const start = (currentPage - 1) * size;
  const end = start + size;

  const pageItems = list.slice(start, end);

  return {
    page: currentPage,
    currentPage,
    pageSize: size,
    total,
    count: visibleTotal,
    totalPages,
    items: pageItems,
    pageItems,
    from: total && pageItems.length ? start + 1 : 0,
    to: total ? Math.min(start + pageItems.length, total) : 0,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
}

/* =========================================================
   ROUTE / URL
========================================================= */

export function isUnsafeRoute(route = "") {
  const value = safeText(route, "");

  return (
    !value ||
    value === "#" ||
    /^(javascript:|data:|vbscript:)/i.test(value)
  );
}

export function isExternalRoute(route = "") {
  const value = safeText(route, "");

  if (!/^https?:\/\//i.test(value)) {
    return false;
  }

  try {
    if (!isBrowser()) {
      return true;
    }

    return new URL(value).origin !== window.location.origin;
  } catch {
    return true;
  }
}

export function normalizeInternalRoute(route = "") {
  const value = safeText(route, "");

  if (isUnsafeRoute(value) || isExternalRoute(value)) {
    return "";
  }

  if (value.startsWith("/") || value.startsWith("?") || value.startsWith("#")) {
    return value;
  }

  return `/${value}`;
}

/* =========================================================
   DOM / FILE HELPERS
========================================================= */

export function getDocument() {
  return isBrowser() ? document : null;
}

export function getWindow() {
  return isBrowser() ? window : null;
}

export function qs(selector = "", root = null) {
  if (!isBrowser()) {
    return null;
  }

  const cleanSelector = safeText(selector, "");

  if (!cleanSelector) {
    return null;
  }

  try {
    return (root || document).querySelector(cleanSelector);
  } catch {
    return null;
  }
}

export function qsa(selector = "", root = null) {
  if (!isBrowser()) {
    return [];
  }

  const cleanSelector = safeText(selector, "");

  if (!cleanSelector) {
    return [];
  }

  try {
    return Array.from((root || document).querySelectorAll(cleanSelector));
  } catch {
    return [];
  }
}

export function byId(id = "") {
  if (!isBrowser()) {
    return null;
  }

  const cleanId = safeText(id, "");

  if (!cleanId) {
    return null;
  }

  try {
    return document.getElementById(cleanId);
  } catch {
    return null;
  }
}

export function isElement(value) {
  try {
    return typeof Element !== "undefined" && value instanceof Element;
  } catch {
    return Boolean(
      value &&
        typeof value === "object" &&
        typeof value.closest === "function"
    );
  }
}

export function closest(target = null, selector = "") {
  if (!target || !selector) {
    return null;
  }

  try {
    return target.closest(selector);
  } catch {
    return null;
  }
}

export async function copyTextToClipboard(value = "") {
  const text = safeText(value, "");

  if (!text || !isBrowser()) {
    return false;
  }

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  let textarea = null;

  try {
    textarea = document.createElement("textarea");

    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.setAttribute("aria-hidden", "true");
    textarea.setAttribute("tabindex", "-1");
    textarea.className = "sr-only home-clipboard-fallback";

    document.body.appendChild(textarea);

    textarea.focus();
    textarea.select();
    textarea.setSelectionRange?.(0, textarea.value.length);

    const ok = document.execCommand("copy");

    textarea.remove();

    return Boolean(ok);
  } catch {
    try {
      textarea?.remove?.();
    } catch {}

    return false;
  }
}

export function normalizeFilename(value = "", fallback = "download.txt") {
  const fallbackName = safeText(fallback, "download.txt");

  const name = safeText(value, fallbackName)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/g, "")
    .trim();

  return name || fallbackName;
}

export function downloadTextFile({
  filename = "download.txt",
  content = "",
  mimeType = TEXT_MIME_TYPE,
} = {}) {
  if (!isBrowser()) {
    return false;
  }

  let url = "";

  try {
    const blob = new Blob(
      [String(content ?? "")],
      {
        type: safeText(mimeType, TEXT_MIME_TYPE),
      }
    );

    url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = normalizeFilename(filename, "download.txt");
    anchor.rel = "noopener";
    anchor.className = "sr-only home-download-link";
    anchor.setAttribute("aria-hidden", "true");
    anchor.setAttribute("tabindex", "-1");

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }, 0);

    return true;
  } catch {
    try {
      if (url) {
        URL.revokeObjectURL(url);
      }
    } catch {}

    return false;
  }
}

/* =========================================================
   CSV
========================================================= */

export function escapeCsvCell(value = "") {
  const text = isNil(value) ? "" : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCsv(rows = []) {
  return safeArray(rows)
    .map((row) =>
      safeArray(row)
        .map(escapeCsvCell)
        .join(",")
    )
    .join("\n");
}

export function buildCsvFromObjects(items = [], columns = []) {
  const rows = safeArray(items);
  const cols = safeArray(columns);

  if (!cols.length) {
    const keys = Array.from(
      rows.reduce((set, item) => {
        Object.keys(safeObject(item)).forEach((key) => set.add(key));
        return set;
      }, new Set())
    );

    return buildCsv([
      keys,
      ...rows.map((item) => keys.map((key) => item?.[key] ?? "")),
    ]);
  }

  return buildCsv([
    cols.map((column) => safeText(column.label || column.key || column, "")),
    ...rows.map((item) =>
      cols.map((column) => {
        if (typeof column === "string") {
          return getPath(item, column) ?? "";
        }

        if (isFunction(column.value)) {
          return column.value(item);
        }

        return getPath(item, column.key) ?? "";
      })
    ),
  ]);
}

export function downloadCsv({
  filename = "export.csv",
  rows = null,
  items = null,
  columns = [],
  content = "",
} = {}) {
  const finalFilename = normalizeFilename(filename, "export.csv");

  const name = finalFilename.toLowerCase().endsWith(".csv")
    ? finalFilename
    : `${finalFilename}.csv`;

  const csv = safeText(content, "") ||
    (Array.isArray(rows)
      ? buildCsv(rows)
      : buildCsvFromObjects(items, columns));

  if (!csv) {
    return false;
  }

  return downloadTextFile({
    filename: name,
    content: `\uFEFF${csv}`,
    mimeType: CSV_MIME_TYPE,
  });
}

/* =========================================================
   EVENT / LOG BRIDGE
========================================================= */

export function safeEmit(eventName = "", payload = {}, options = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  const cleanPayload = sanitizePayload({
    source: HOME_UTILS_SOURCE,
    version: HOME_UTILS_VERSION,
    ...safeObject(payload),
  });

  const opts = safeObject(options);

  let emitted = false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      AppCore.events.emit(name, cleanPayload);
      emitted = true;
    }
  } catch {}

  if (opts.window === true || (!emitted && isBrowser())) {
    try {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: cleanPayload,
        })
      );

      emitted = true;
    } catch {}
  }

  return emitted;
}

export function safeOn(eventName = "", handler = null, options = {}) {
  const name = safeText(eventName, "");

  if (!name || !isFunction(handler)) {
    return () => {};
  }

  const wrapped = (eventOrPayload = {}) => {
    try {
      handler(eventOrPayload);
    } catch (error) {
      safeWarn(`Handler de evento falló: ${name}`, error);
    }
  };

  try {
    if (isFunction(AppCore?.events?.on)) {
      const cleanup = AppCore.events.on(name, wrapped);

      if (isFunction(cleanup)) {
        return cleanup;
      }

      return () => {
        try {
          AppCore?.events?.off?.(name, wrapped);
        } catch {}
      };
    }
  } catch {}

  if (!isBrowser()) {
    return () => {};
  }

  try {
    window.addEventListener(name, wrapped, options);

    return () => {
      try {
        window.removeEventListener(name, wrapped, options);
      } catch {}
    };
  } catch {}

  return () => {};
}

export function safeLog(...args) {
  const clean = args.map((arg) => sanitizePayload(arg));

  try {
    AppCore?.utils?.log?.("[HomeUtils]", ...clean);
    return true;
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.log("[HomeUtils]", ...clean);
      return true;
    }
  } catch {}

  return false;
}

export function safeWarn(...args) {
  const clean = args.map((arg) => sanitizePayload(arg));

  try {
    AppCore?.utils?.warn?.("[HomeUtils]", ...clean);
    return true;
  } catch {}

  try {
    console.warn("[HomeUtils]", ...clean);
    return true;
  } catch {}

  return false;
}

export function safeError(...args) {
  const clean = args.map((arg) => sanitizePayload(arg));

  try {
    AppCore?.utils?.error?.("[HomeUtils]", ...clean);
    return true;
  } catch {}

  try {
    console.error("[HomeUtils]", ...clean);
    return true;
  } catch {}

  return false;
}

/* =========================================================
   TOAST BRIDGE
========================================================= */

export function normalizeToastType(type = "info") {
  const key = normalizeKey(type);

  if (
    [
      "success",
      "error",
      "warning",
      "warn",
      "info",
      "loading",
      "load",
    ].includes(key)
  ) {
    if (key === "warn") return "warning";
    if (key === "load") return "loading";
    return key;
  }

  return "info";
}

function pushToastCandidate(candidates, value) {
  if (value && !candidates.includes(value)) {
    candidates.push(value);
  }
}

export function getToastCandidates() {
  const candidates = [];

  try {
    if (isFunction(AppCore?.modules?.get)) {
      pushToastCandidate(candidates, AppCore.modules.get("toast"));
      pushToastCandidate(candidates, AppCore.modules.get("Toast"));
      pushToastCandidate(candidates, AppCore.modules.get("OnionToast"));
    }
  } catch {}

  try {
    pushToastCandidate(candidates, AppCore?.toast);
    pushToastCandidate(candidates, AppCore?.Toast);
    pushToastCandidate(candidates, AppCore?.toastModule);
    pushToastCandidate(candidates, AppCore?.ui?.toast);
    pushToastCandidate(candidates, AppCore?.ui?.Toast);
  } catch {}

  try {
    if (isBrowser()) {
      pushToastCandidate(candidates, window.Toast);
      pushToastCandidate(candidates, window.OnionToast);
      pushToastCandidate(candidates, window.AppToast);
    }
  } catch {}

  return candidates.filter(Boolean);
}

export function normalizeToastInput(message = "", type = "info", options = {}) {
  if (isObject(message)) {
    const payload = safeObject(message);

    return {
      message: safeText(
        first(
          payload.message,
          payload.text,
          payload.title,
          ""
        ),
        ""
      ),
      type: normalizeToastType(
        first(
          payload.type,
          payload.variant,
          payload.level,
          type
        )
      ),
      options: {
        ...safeObject(options),
        ...payload,
      },
    };
  }

  return {
    message: safeText(message, ""),
    type: normalizeToastType(type),
    options: safeObject(options),
  };
}

export function showToast(message = "", type = "info", options = {}) {
  const normalized = normalizeToastInput(message, type, options);
  const text = normalized.message;

  if (!text) {
    return false;
  }

  const toastType = normalized.type;
  const opts = safeObject(normalized.options);

  const payload = {
    ...opts,
    type: toastType,
    message: text,
  };

  const candidates = getToastCandidates();

  for (const toast of candidates) {
    try {
      const directMethod =
        toastType === "warning"
          ? toast.warning || toast.warn
          : toast?.[toastType];

      if (isFunction(directMethod)) {
        const result = directMethod.call(toast, text, payload);
        return result || true;
      }
    } catch {}

    try {
      if (isFunction(toast?.show)) {
        const result = toast.show(payload);
        return result || true;
      }
    } catch {}

    try {
      if (isFunction(toast?.notify)) {
        const result = toast.notify(payload);
        return result || true;
      }
    } catch {}

    try {
      if (isFunction(toast)) {
        const result = toast(payload);
        return result || true;
      }
    } catch {}
  }

  try {
    if (isFunction(AppCore?.showToast)) {
      const result = AppCore.showToast(text, toastType, payload);
      return result || true;
    }
  } catch {}

  safeEmit(`toast:${toastType}`, payload);

  try {
    const logger =
      toastType === "error"
        ? console.error
        : toastType === "warning"
          ? console.warn
          : console.log;

    if (AppCore?.config?.debug) {
      logger(`[HomeToast:${toastType}]`, text);
    }
  } catch {}

  return true;
}

/* =========================================================
   ASYNC / TIMING
========================================================= */

export function sleep(ms = 0) {
  return new Promise((resolve) => {
    const delay = Math.max(0, safeNumber(ms, 0));

    try {
      setTimeout(resolve, delay);
    } catch {
      resolve();
    }
  });
}

export function nextFrame() {
  return new Promise((resolve) => {
    try {
      if (isBrowser() && isFunction(window.requestAnimationFrame)) {
        window.requestAnimationFrame(() => resolve());
        return;
      }
    } catch {}

    try {
      setTimeout(resolve, 0);
    } catch {
      resolve();
    }
  });
}

export function afterPaint(callback = null) {
  if (!isFunction(callback)) {
    return;
  }

  if (!isBrowser()) {
    try {
      callback();
    } catch {}
    return;
  }

  try {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        try {
          callback();
        } catch {}
      });
    });

    return;
  } catch {}

  try {
    setTimeout(() => {
      try {
        callback();
      } catch {}
    }, 0);
  } catch {}
}

export function debounce(fn, wait = 120) {
  let timer = null;

  const debounced = (...args) => {
    const delay = Math.max(0, safeNumber(wait, 120));

    try {
      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(() => {
        timer = null;
        fn?.(...args);
      }, delay);
    } catch {
      fn?.(...args);
    }
  };

  debounced.cancel = () => {
    try {
      if (timer) {
        clearTimeout(timer);
      }
    } catch {}

    timer = null;
  };

  return debounced;
}

export function throttle(fn, wait = 120) {
  let last = 0;
  let timer = null;
  let trailingArgs = null;

  const throttled = (...args) => {
    const current = now();
    const delay = Math.max(0, safeNumber(wait, 120));
    const remaining = delay - (current - last);

    trailingArgs = args;

    if (remaining <= 0) {
      try {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      } catch {}

      last = current;
      trailingArgs = null;
      fn?.(...args);
      return;
    }

    if (timer) {
      return;
    }

    timer = setTimeout(() => {
      timer = null;
      last = now();

      const finalArgs = trailingArgs || [];
      trailingArgs = null;

      fn?.(...finalArgs);
    }, remaining);
  };

  throttled.cancel = () => {
    try {
      if (timer) {
        clearTimeout(timer);
      }
    } catch {}

    timer = null;
    trailingArgs = null;
  };

  return throttled;
}

export async function withTimeout(promise, ms = 8000, label = "TIMEOUT") {
  const timeoutMs = Math.max(0, safeNumber(ms, 8000));

  let timer = null;

  const timeout = new Promise((_, reject) => {
    try {
      timer = setTimeout(() => {
        reject(new Error(label));
      }, timeoutMs);
    } catch {
      reject(new Error(label));
    }
  });

  try {
    return await Promise.race([
      Promise.resolve(promise),
      timeout,
    ]);
  } finally {
    try {
      if (timer) {
        clearTimeout(timer);
      }
    } catch {}
  }
}

/* =========================================================
   DEBUG
========================================================= */

export function getHomeUtilsSnapshot() {
  return {
    version: HOME_UTILS_VERSION,
    source: HOME_UTILS_SOURCE,
    browser: isBrowser(),
    documentReady: isDocumentReady(),
    hasAppCore: Boolean(AppCore),
    hasEventBus: isFunction(AppCore?.events?.emit),
    hasToastCandidates: getToastCandidates().length,
    formatterCache: {
      number: NUMBER_FORMATTER_CACHE.size,
      money: MONEY_FORMATTER_CACHE.size,
      date: DATE_FORMATTER_CACHE.size,
    },
    at: nowIso(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  HOME_UTILS_VERSION,
  HOME_UTILS_SOURCE,

  DEFAULT_LOCALE,
  DEFAULT_CURRENCY,
  DEFAULT_DATE_FALLBACK,
  DEFAULT_EMPTY_TEXT,
  CSV_MIME_TYPE,
  TEXT_MIME_TYPE,

  isBrowser,
  isDocumentReady,
  now,
  nowIso,
  noop,

  isObject,
  isAnyObject,
  isFunction,
  isNil,
  isEmptyString,
  hasOwn,
  hasOwnKeys,

  safeString,
  safeText,
  safeArray,
  safeObject,
  safeNumber,
  safeInteger,
  safeBoolean,
  first,
  clamp,
  round,
  roundMoney,

  getPath,
  firstPath,
  pick,
  omit,

  deepClone,
  parseJson,
  stringifyJson,
  prettyJson,

  redactTokenInText,
  sanitizeError,
  sanitizePayload,

  escapeHtml,
  normalizeText,
  normalizeWhitespace,
  normalizeKey,
  truncate,
  getInitials,
  slugify,
  includesNormalized,

  getNumberFormatter,
  formatNumber,
  getMoneyFormatter,
  formatMoney,
  percent,
  formatPercent,
  isPositiveTrend,
  isNegativeTrend,

  toTimestamp,
  toDate,
  toMs,
  getDateFormatter,
  formatDate,
  formatDateTime,
  formatDateOnly,
  formatRelativeDate,
  formatLastUpdate,

  unwrapCollectionPayload,
  normalizeCollection,
  getRemoteCountFromCollection,
  sortByUpdatedDesc,
  sortByCreatedDesc,
  uniqueBy,
  uniqueById,
  paginate,

  isUnsafeRoute,
  isExternalRoute,
  normalizeInternalRoute,

  getDocument,
  getWindow,
  qs,
  qsa,
  byId,
  isElement,
  closest,
  copyTextToClipboard,
  normalizeFilename,
  downloadTextFile,

  escapeCsvCell,
  buildCsv,
  buildCsvFromObjects,
  downloadCsv,

  safeEmit,
  safeOn,
  safeLog,
  safeWarn,
  safeError,

  normalizeToastType,
  getToastCandidates,
  normalizeToastInput,
  showToast,

  sleep,
  nextFrame,
  afterPaint,
  debounce,
  throttle,
  withTimeout,

  getHomeUtilsSnapshot,
  getDebugSnapshot: getHomeUtilsSnapshot,
};
