/* =========================================================
   Onion Support - Home Utils
   Archivo: /src/views/home/home.utils.js

   Responsabilidad:
   - Helpers mínimos y puros para Home.
   - Texto / número / boolean / arrays / objetos.
   - Fechas y formateo básico.
   - Sanitización segura para snapshots.
   - Escape HTML.
   - Helpers async mínimos.
   - Compat toast sólo con instancia explícita inyectada.
   - Sin AppCore.
   - Sin Router.
   - Sin Auth.
   - Sin HTTP.
   - Sin storage.
   - Sin eventos globales.
   - Sin DOM helpers de binding.
   - Sin CSV.
   - Sin clipboard.
   - Sin collection model.
   - Sin import directo de Toast.
   - Sin globals propios.
========================================================= */

export const HOME_UTILS_VERSION = "home.utils.v4.clean-core";

export const DEFAULT_LOCALE = "es-ES";
export const DEFAULT_CURRENCY = "EUR";

export const DEFAULT_DATE_FALLBACK = "—";
export const DEFAULT_EMPTY_TEXT = "—";

const NUMBER_FORMATTER_CACHE = new Map();
const MONEY_FORMATTER_CACHE = new Map();
const DATE_FORMATTER_CACHE = new Map();

const RAW_KEYS = new Set([
  "raw",
  "data",
  "payload",
  "response",
  "body",
  "request",
  "headers",
  "config",
]);

const COSMOS_META_KEYS = new Set([
  "_id",
  "_rid",
  "_self",
  "_etag",
  "_attachments",
  "_ts",
  "_lsn",
  "_metadata",
]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|passwd|pwd|secret|credential|jwt|bearer|refresh|access_token|accessToken|id_token|idToken|apiKey|api_key|privateKey|private_key|connectionString|connection_string|sas|otp|totp|mfa|twofa|2fa|backupCode|backup_code|backupCodes|backup_codes|session|sessionId|session_id|email|mail|phone|telefono|teléfono|address|direccion|dirección|nif|dni|iban|bank|cuenta|account|ipRaw|userAgent/i;

const SENSITIVE_QUERY_RE =
  /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|tempToken|temp_token|sas|sig|signature|key)=/i;

const EMAIL_RE = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/gi;

const EMAIL_EXACT_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/i;

const JWT_RE =
  /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

/* =========================================================
   RUNTIME
========================================================= */

export function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
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
   SAFE HELPERS
========================================================= */

export function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isAnyObject(value) {
  return Boolean(value && typeof value === "object");
}

export function isFunction(value) {
  return typeof value === "function";
}

export function isNil(value) {
  return value === null || value === undefined;
}

export function hasOwnKeys(value = {}) {
  return Boolean(isObject(value) && Object.keys(value).length > 0);
}

export function safeString(value, fallback = "") {
  if (isNil(value)) return fallback;

  const output = String(value).trim();

  return output || fallback;
}

export function safeText(value, fallback = "") {
  if (isNil(value)) return fallback;

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

export function safeArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  return Array.isArray(fallback) ? fallback : [];
}

export function safeObject(value, fallback = {}) {
  if (isObject(value)) return value;
  return isObject(fallback) ? fallback : {};
}

export function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string") {
    let clean = value
      .trim()
      .replace(/[€$£¥%]/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s/g, "");

    if (!clean || clean === "-" || clean === "+") return fallback;

    const hasComma = clean.includes(",");
    const hasDot = clean.includes(".");

    if (hasComma && hasDot) {
      const lastComma = clean.lastIndexOf(",");
      const lastDot = clean.lastIndexOf(".");

      clean =
        lastComma > lastDot
          ? clean.replace(/\./g, "").replace(/,/g, ".")
          : clean.replace(/,/g, "");
    } else if (hasComma) {
      clean = clean.replace(/,/g, ".");
    }

    const number = Number(clean);

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
  if (typeof value === "boolean") return value;

  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;

  if (typeof value === "string") {
    const clean = value.trim().toLowerCase();

    if (["true", "yes", "y", "si", "sí", "ok", "on", "enabled", "active"].includes(clean)) {
      return true;
    }

    if (["false", "no", "n", "off", "disabled", "inactive"].includes(clean)) {
      return false;
    }
  }

  return Boolean(fallback);
}

export function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

export function clamp(value, min = 0, max = 100) {
  const number = safeNumber(value, min);
  const safeMin = safeNumber(min, 0);
  const safeMax = safeNumber(max, safeMin);

  return Math.min(Math.max(number, safeMin), safeMax);
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
   OBJECT / JSON
========================================================= */

export function getPath(object = {}, path = "") {
  const root = safeObject(object, null);
  const cleanPath = safeText(path, "");

  if (!root || !cleanPath) return undefined;

  return cleanPath.split(".").reduce((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return acc?.[key];
  }, root);
}

export function firstPath(object = {}, paths = []) {
  return first(...safeArray(paths).map((path) => getPath(object, path)));
}

export function deepClone(value, fallback = null) {
  if (value === undefined) return undefined;

  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {
    // fallback abajo
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback === null ? value : fallback;
  }
}

export function parseJson(value, fallback = null) {
  if (isObject(value) || Array.isArray(value)) return value;

  const raw = safeText(value, "");

  if (!raw) return fallback;

  try {
    return JSON.parse(raw);
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

/* =========================================================
   SANITIZE
========================================================= */

function isRawKey(key = "") {
  return RAW_KEYS.has(String(key || ""));
}

function isCosmosMetaKey(key = "") {
  return COSMOS_META_KEYS.has(String(key || ""));
}

function isSensitiveKey(key = "") {
  return SENSITIVE_KEY_RE.test(String(key || ""));
}

function isEmailLike(value = "") {
  const output = safeText(value, "");
  return Boolean(output && EMAIL_EXACT_RE.test(output));
}

export function redactTokenInText(value = "") {
  let output = safeText(value, "");

  if (!output) return "";

  try {
    output = output.replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|tempToken|temp_token|sas|sig|signature|key)=)([^&#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    );

    output = output.replace(JWT_RE, "***");
    output = output.replace(EMAIL_RE, "");
  } catch {
    // noop
  }

  return output;
}

export function sanitizeError(error = null) {
  if (!error) return null;

  const candidate = error?.reason || error?.error || error;

  return {
    name: safeText(candidate?.name, "Error"),
    message: redactTokenInText(
      safeText(
        first(
          candidate?.response?.data?.message,
          candidate?.data?.message,
          candidate?.message,
          candidate?.reason,
          "Error"
        ),
        "Error"
      )
    ),
    code: safeText(
      first(
        candidate?.code,
        candidate?.data?.code,
        candidate?.response?.data?.code,
        ""
      ),
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

export function sanitizePayload(value, depth = 0, keyHint = "") {
  if (depth > 8) return "[MaxDepth]";

  if (isRawKey(keyHint)) return undefined;
  if (isCosmosMetaKey(keyHint)) return undefined;
  if (isSensitiveKey(keyHint)) return undefined;

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
      .map((item) => sanitizePayload(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (isAnyObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (isRawKey(key)) continue;
      if (isCosmosMetaKey(key)) continue;
      if (isSensitiveKey(key)) continue;

      const clean = sanitizePayload(item, depth + 1, key);

      if (clean !== undefined) {
        output[key] = clean;
      }
    }

    return output;
  }

  return redactTokenInText(String(value));
}

export function safePublicText(value = "", fallback = "") {
  const output = redactTokenInText(safeText(value, ""));

  if (!output) return fallback;
  if (isEmailLike(output)) return fallback;
  if (SENSITIVE_QUERY_RE.test(output)) return fallback;
  if (/Bearer\s+/i.test(output)) return fallback;

  return output;
}

/* =========================================================
   TEXT / HTML
========================================================= */

export function escapeHtml(value = "") {
  return String(value ?? "")
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
  return safeText(value, "").replace(/\s+/g, " ").trim();
}

export function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

export function truncate(value = "", max = 160, suffix = "…") {
  const output = safeString(value, "");
  const limit = Math.max(1, safeInteger(max, 160));

  if (!output) return "";
  if (output.length <= limit) return output;

  const finalSuffix = safeText(suffix, "…");

  return `${output.slice(0, Math.max(1, limit - finalSuffix.length)).trim()}${finalSuffix}`;
}

export function getInitials(value = "", fallback = "ON") {
  const output = normalizeWhitespace(safePublicText(value, ""));

  if (!output) return fallback;

  const parts = output.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase() || fallback;
  }

  return `${parts[0]?.[0] || ""}${parts[parts.length - 1]?.[0] || ""}`.toUpperCase() || fallback;
}

export function includesNormalized(haystack = "", needle = "") {
  const left = normalizeText(haystack);
  const right = normalizeText(needle);

  return Boolean(left && right && left.includes(right));
}

/* =========================================================
   FORMATTERS
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
    return getNumberFormatter(locale, options).format(number);
  } catch {
    return String(number);
  }
}

export function getMoneyFormatter(currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE, options = {}) {
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

export function formatMoney(value, currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE, options = {}) {
  const amount = safeNumber(value, NaN);
  const code = safeText(currency, DEFAULT_CURRENCY).toUpperCase();

  if (!Number.isFinite(amount)) return DEFAULT_EMPTY_TEXT;

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

/* =========================================================
   DATE
========================================================= */

export function toTimestamp(value) {
  if (!value) return 0;

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9999999999 ? value : value * 1000;
  }

  const raw = safeText(value, "");

  if (!raw) return 0;

  const numeric = Number(raw);

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 9999999999 ? numeric : numeric * 1000;
  }

  const esDate = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*|\s+-\s+|\s+)?(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (esDate) {
    const [, dd, mm, yyyy, hh = "0", min = "0", ss = "0"] = esDate;
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

  const date = new Date(raw.includes("T") || raw.includes("Z") ? raw : `${raw}T00:00:00`);
  const time = date.getTime();

  return Number.isNaN(time) ? 0 : time;
}

export function toMs(value) {
  return toTimestamp(value);
}

export function toDate(value, fallback = null) {
  const timestamp = toTimestamp(value);

  if (!timestamp) return fallback;

  const date = new Date(timestamp);

  return Number.isNaN(date.getTime()) ? fallback : date;
}

export function getDateFormatter(locale = DEFAULT_LOCALE, options = {}) {
  const cleanLocale = safeText(locale, DEFAULT_LOCALE);
  const opts = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...safeObject(options),
  };

  const key = `${cleanLocale}:${stringifyJson(opts, "{}")}`;

  if (DATE_FORMATTER_CACHE.has(key)) {
    return DATE_FORMATTER_CACHE.get(key);
  }

  const formatter = new Intl.DateTimeFormat(cleanLocale, opts);

  DATE_FORMATTER_CACHE.set(key, formatter);

  return formatter;
}

export function formatDate(value = null, locale = DEFAULT_LOCALE, options = {}) {
  const date = toDate(value);

  if (!date) return DEFAULT_DATE_FALLBACK;

  try {
    return getDateFormatter(locale, options).format(date);
  } catch {
    return DEFAULT_DATE_FALLBACK;
  }
}

export function formatDateOnly(value = null, locale = DEFAULT_LOCALE) {
  return formatDate(value, locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(value = null, locale = DEFAULT_LOCALE) {
  return formatDate(value, locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeDate(value = null) {
  const timestamp = toTimestamp(value);

  if (!timestamp) return "Sin fecha";

  const diffMin = Math.round((timestamp - Date.now()) / 60000);
  const absMin = Math.abs(diffMin);

  if (absMin < 1) return "Ahora mismo";

  if (absMin < 60) {
    return diffMin > 0 ? `En ${absMin} min` : `Hace ${absMin} min`;
  }

  const hours = Math.round(absMin / 60);

  if (hours < 24) {
    return diffMin > 0 ? `En ${hours} h` : `Hace ${hours} h`;
  }

  const days = Math.round(hours / 24);

  if (days <= 7) {
    return diffMin > 0
      ? `En ${days} día${days === 1 ? "" : "s"}`
      : `Hace ${days} día${days === 1 ? "" : "s"}`;
  }

  return formatDateOnly(value);
}

export function formatLastUpdate(value = null) {
  const timestamp = toTimestamp(value);

  if (!timestamp) return "Sin fecha";

  const diffHours = Math.abs(Date.now() - timestamp) / 3600000;

  return diffHours <= 72 ? formatRelativeDate(value) : formatDateTime(value);
}

/* =========================================================
   TOAST COMPAT - EXPLICIT INSTANCE ONLY
========================================================= */

export function normalizeToastType(type = "info") {
  const clean = normalizeKey(type || "info");

  if (["success", "ok", "done"].includes(clean)) return "success";
  if (["error", "danger", "fail", "failed"].includes(clean)) return "error";
  if (["warning", "warn", "alert"].includes(clean)) return "warning";
  if (["info", "default", "neutral"].includes(clean)) return "info";

  return "info";
}

export function normalizeToastInput(input = "", type = "info", options = {}) {
  if (isObject(input)) {
    return {
      message: safePublicText(
        first(
          input.message,
          input.text,
          input.title,
          ""
        ),
        ""
      ),
      type: normalizeToastType(first(input.type, input.level, type)),
      options: safeObject(first(input.options, input.meta, options), {}),
    };
  }

  return {
    message: safePublicText(input, ""),
    type: normalizeToastType(type),
    options: safeObject(options),
  };
}

export function showToast(toast = null, input = "", type = "info", options = {}) {
  const normalized = normalizeToastInput(input, type, options);

  if (!normalized.message) return false;
  if (!toast) return false;

  try {
    if (isFunction(toast.show)) {
      return toast.show(normalized.message, normalized.type, normalized.options) !== false;
    }

    if (isFunction(toast.notify)) {
      return toast.notify(normalized.message, normalized.type, normalized.options) !== false;
    }

    if (isFunction(toast)) {
      return toast(normalized.message, normalized.type, normalized.options) !== false;
    }
  } catch {
    return false;
  }

  return false;
}

/* =========================================================
   ASYNC
========================================================= */

export function sleep(ms = 0) {
  const delay = Math.max(0, safeInteger(ms, 0));

  return new Promise((resolve) => {
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
    } catch {
      // fallback abajo
    }

    sleep(0).then(resolve);
  });
}

export async function afterPaint() {
  await nextFrame();
  await nextFrame();
}

export function withTimeout(promise, ms = 15000, reason = "Operación agotada.") {
  const timeoutMs = Math.max(1, safeInteger(ms, 15000));
  let timer = null;

  const timeout = new Promise((_, reject) => {
    try {
      timer = setTimeout(() => {
        reject(new Error(safeText(reason, "Operación agotada.")));
      }, timeoutMs);
    } catch {
      reject(new Error(safeText(reason, "Operación agotada.")));
    }
  });

  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    try {
      if (timer) clearTimeout(timer);
    } catch {
      // noop
    }
  });
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHomeUtilsSnapshot() {
  return sanitizePayload({
    version: HOME_UTILS_VERSION,
    source: "views.home.utils",

    browser: isBrowser(),

    formatterCache: {
      number: NUMBER_FORMATTER_CACHE.size,
      money: MONEY_FORMATTER_CACHE.size,
      date: DATE_FORMATTER_CACHE.size,
    },

    toast: {
      directImport: false,
      requiresExplicitInstance: true,
      appCoreBridge: false,
      windowBridge: false,
    },

    sanitize: {
      removesRawPayloads: true,
      stripsCosmosMetadata: true,
      redactsSensitiveText: true,
      stripsSensitiveKeys: true,
      removesEmailsFromText: true,
    },

    policy: {
      pureHelpers: true,

      noAppCore: true,
      noRouter: true,
      noAuth: true,
      noHttp: true,
      noStorage: true,
      noEvents: true,
      noDomBinding: true,

      noCsv: true,
      noClipboard: true,
      noCollectionModel: true,

      noToastImport: true,
      noToastAutoInit: true,
      noWindowGlobals: true,

      snapshotRedacted: true,
    },

    at: nowIso(),
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  HOME_UTILS_VERSION,

  DEFAULT_LOCALE,
  DEFAULT_CURRENCY,
  DEFAULT_DATE_FALLBACK,
  DEFAULT_EMPTY_TEXT,

  isBrowser,
  now,
  nowIso,
  noop,

  isObject,
  isAnyObject,
  isFunction,
  isNil,
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

  deepClone,
  parseJson,
  stringifyJson,

  redactTokenInText,
  sanitizeError,
  sanitizePayload,
  safePublicText,

  escapeHtml,
  normalizeText,
  normalizeWhitespace,
  normalizeKey,
  truncate,
  getInitials,
  includesNormalized,

  getNumberFormatter,
  formatNumber,
  getMoneyFormatter,
  formatMoney,
  percent,

  toTimestamp,
  toDate,
  toMs,
  getDateFormatter,
  formatDate,
  formatDateTime,
  formatDateOnly,
  formatRelativeDate,
  formatLastUpdate,

  normalizeToastType,
  normalizeToastInput,
  showToast,

  sleep,
  nextFrame,
  afterPaint,
  withTimeout,

  getHomeUtilsSnapshot,
  getDebugSnapshot: getHomeUtilsSnapshot,
};
