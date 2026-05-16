/* =========================================================
   Onion SPA - Toast Helpers
   Archivo: src/ui/toast/helpers.js

   Toast helpers limpio:
   - utilidades puras
   - ids seguros
   - tipos normalizados
   - duración normalizada por tipo
   - texto limitado
   - reduced motion safe
   - cero dependencia AppCore
   - cero lógica DOM/store/timers
========================================================= */

import {
  TOAST_DEFAULT_DURATION,
  TOAST_MIN_DURATION,
  TOAST_MAX_DURATION,
  TOAST_MAX_TEXT_LENGTH,
  TOAST_MAX_TITLE_LENGTH,

  TOAST_DEFAULT_TYPE,
  TOAST_TYPES,
  TOAST_TYPE_SET,
  TOAST_TYPE_ALIASES,

  TOAST_TYPE_INFO,
  TOAST_TYPE_LOADING,

  TOAST_DURATIONS_BY_TYPE,
} from "./constants.js";

/* =========================================================
   VERSION
========================================================= */

export const TOAST_HELPERS_VERSION = "17.0.0-clean";

/* =========================================================
   RUNTIME
========================================================= */

let seed = 0;

/* =========================================================
   BASICS
========================================================= */

export function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function isFunction(value) {
  return typeof value === "function";
}

export function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

export function safeObject(value, fallback = {}) {
  return isPlainObject(value) ? value : fallback;
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

export function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function safeBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === 1) return true;
  if (value === 0) return false;

  const text = safeText(value, "").toLowerCase();

  if (["true", "1", "yes", "si", "sí", "on", "ok"].includes(text)) return true;
  if (["false", "0", "no", "off"].includes(text)) return false;

  return Boolean(fallback);
}

export function clampNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = safeNumber(value, min);

  return Math.min(
    Math.max(number, min),
    max
  );
}

export function now() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

export function nowIso(ms = now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

export function noop() {}

export function unique(values = []) {
  const out = [];
  const seen = new Set();

  for (const value of safeArray(values).flat(Infinity)) {
    const text = safeText(value, "");
    if (!text || seen.has(text)) continue;

    seen.add(text);
    out.push(text);
  }

  return out;
}

/* =========================================================
   CLONE / STRING
========================================================= */

export function safeClone(value, fallback = null) {
  if (value === undefined) return fallback;
  if (value === null) return null;

  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

export function normalizeWhitespace(value = "") {
  return safeText(value, "").replace(/\s+/g, " ");
}

export function limitText(value = "", max = 240) {
  const clean = normalizeWhitespace(value);
  const limit = Math.max(0, safeNumber(max, 240));

  return clean.slice(0, limit);
}

/* =========================================================
   IDS
========================================================= */

function randomPart() {
  try {
    if (isBrowser() && window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
  } catch {}

  try {
    if (isBrowser() && window.crypto?.getRandomValues) {
      const buffer = new Uint32Array(2);
      window.crypto.getRandomValues(buffer);

      return Array
        .from(buffer)
        .map((item) => item.toString(36))
        .join("-");
    }
  } catch {}

  return Math.random().toString(36).slice(2);
}

export function normalizeToastId(value = "") {
  return safeText(value, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._:-]/g, "")
    .replace(/[-:._]{2,}/g, "-")
    .replace(/^[-:._]+|[-:._]+$/g, "")
    .slice(0, 120);
}

export function nextToastId(prefix = "toast") {
  seed = (seed + 1) % Number.MAX_SAFE_INTEGER;

  return normalizeToastId(
    `${safeText(prefix, "toast")}-${now()}-${seed}-${randomPart()}`
  );
}

/* =========================================================
   HTML / SAFE TEXT
========================================================= */

export function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

export function normalizeToastText(value, fallback = "", max = TOAST_MAX_TEXT_LENGTH) {
  return limitText(
    value === null || value === undefined ? fallback : value,
    max
  );
}

export function normalizeToastTitle(value, fallback = "", max = TOAST_MAX_TITLE_LENGTH) {
  return limitText(
    value === null || value === undefined ? fallback : value,
    max
  );
}

export function hasToastText(value) {
  return Boolean(normalizeToastText(value, ""));
}

/* =========================================================
   MOTION
========================================================= */

export function prefersReducedMotion() {
  if (!isBrowser()) return false;

  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  } catch {
    return false;
  }
}

/* =========================================================
   TYPE
========================================================= */

export function normalizeToastType(value = TOAST_DEFAULT_TYPE) {
  const raw = safeText(value, TOAST_DEFAULT_TYPE)
    .toLowerCase()
    .replace(/\s+/g, "-");

  const aliased = TOAST_TYPE_ALIASES?.[raw] || raw;

  try {
    if (TOAST_TYPE_SET?.has?.(aliased)) {
      return aliased;
    }
  } catch {}

  if (Array.isArray(TOAST_TYPES) && TOAST_TYPES.includes(aliased)) {
    return aliased;
  }

  return TOAST_DEFAULT_TYPE || TOAST_TYPE_INFO;
}

export function isValidToastType(value = "") {
  const raw = safeText(value, "").toLowerCase().replace(/\s+/g, "-");

  if (!raw) return false;

  try {
    return TOAST_TYPE_SET?.has?.(raw) === true;
  } catch {}

  return Array.isArray(TOAST_TYPES) && TOAST_TYPES.includes(raw);
}

export function isToastLoading(type = "") {
  return normalizeToastType(type) === TOAST_TYPE_LOADING;
}

/* =========================================================
   DURATION
========================================================= */

function parseDurationString(value = "") {
  const raw = safeText(value, "").toLowerCase();

  if (!raw) return null;

  if (
    [
      "persist",
      "persistent",
      "manual",
      "infinite",
      "infinity",
      "none",
      "off",
      "false",
    ].includes(raw)
  ) {
    return 0;
  }

  const match = raw.match(/^(\d+(?:\.\d+)?)(ms|s)?$/);

  if (!match) return null;

  const amount = Number(match[1]);

  if (!Number.isFinite(amount)) return null;

  return match[2] === "s"
    ? amount * 1000
    : amount;
}

function defaultDurationForType(type = TOAST_DEFAULT_TYPE) {
  const normalizedType = normalizeToastType(type);

  return safeNumber(
    TOAST_DURATIONS_BY_TYPE?.[normalizedType],
    TOAST_DEFAULT_DURATION
  );
}

export function normalizeToastDuration(type = TOAST_DEFAULT_TYPE, duration = undefined) {
  const normalizedType = normalizeToastType(type);

  if (normalizedType === TOAST_TYPE_LOADING) return 0;

  let value = duration;

  if (value === undefined || value === true) {
    value = defaultDurationForType(normalizedType);
  } else if (value === false || value === null || value === 0) {
    return 0;
  } else if (typeof value === "string") {
    const parsed = parseDurationString(value);
    value = parsed === null ? defaultDurationForType(normalizedType) : parsed;
  }

  const number = safeNumber(value, defaultDurationForType(normalizedType));

  if (number <= 0) return 0;

  return clampNumber(
    number,
    TOAST_MIN_DURATION,
    TOAST_MAX_DURATION
  );
}

export function isPersistentToastDuration(duration = 0) {
  return safeNumber(duration, 0) <= 0;
}

/* =========================================================
   OPTIONS NORMALIZATION
========================================================= */

export function normalizeToastOptions(options = {}) {
  const source = safeObject(options);

  const type = normalizeToastType(source.type);

  const message = normalizeToastText(
    source.message ?? source.text ?? "",
    "",
    source.maxTextLength || TOAST_MAX_TEXT_LENGTH
  );

  const title = normalizeToastTitle(
    source.title ?? source.heading ?? "",
    "",
    source.maxTitleLength || TOAST_MAX_TITLE_LENGTH
  );

  const duration = source.persist === true || source.persistent === true
    ? 0
    : normalizeToastDuration(type, source.duration);

  return {
    ...source,

    id: normalizeToastId(source.id || source.toastId || source.key || ""),
    toastId: normalizeToastId(source.toastId || source.id || source.key || ""),

    type,
    title,
    message,
    text: message,

    duration,

    persist: duration <= 0,
    persistent: duration <= 0,

    closable: source.closable !== undefined
      ? source.closable !== false
      : type !== TOAST_TYPE_LOADING,
  };
}

/* =========================================================
   DEBUG
========================================================= */

export function getToastHelpersSnapshot() {
  return {
    version: TOAST_HELPERS_VERSION,

    seed,

    browser: isBrowser(),
    reducedMotion: prefersReducedMotion(),

    defaultType: TOAST_DEFAULT_TYPE,
    types: Array.isArray(TOAST_TYPES) ? [...TOAST_TYPES] : [],

    defaultDuration: TOAST_DEFAULT_DURATION,
    minDuration: TOAST_MIN_DURATION,
    maxDuration: TOAST_MAX_DURATION,

    maxTextLength: TOAST_MAX_TEXT_LENGTH,
    maxTitleLength: TOAST_MAX_TITLE_LENGTH,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  TOAST_HELPERS_VERSION,

  isBrowser,
  isFunction,
  isObject,
  isPlainObject,

  safeObject,
  safeArray,
  safeText,
  safeNumber,
  safeBool,
  clampNumber,

  now,
  nowIso,
  noop,
  unique,

  safeClone,
  normalizeWhitespace,
  limitText,

  normalizeToastId,
  nextToastId,

  escapeHtml,

  normalizeToastText,
  normalizeToastTitle,
  hasToastText,

  prefersReducedMotion,

  normalizeToastType,
  isValidToastType,
  isToastLoading,

  normalizeToastDuration,
  isPersistentToastDuration,

  normalizeToastOptions,

  getToastHelpersSnapshot,
};
