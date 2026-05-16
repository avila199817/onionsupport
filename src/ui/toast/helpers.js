/* =========================================================
   Onion SPA - Toast Helpers
   Archivo: src/ui/toast/helpers.js

   TOAST HELPERS · SIMPLE
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

export const TOAST_HELPERS_VERSION = "18.0.0-simple";

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
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

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
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value === null || value === undefined) return [];
  return [value];
}

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const output = String(value).trim();
  return output || fallback;
}

export function safeNumber(value, fallback = 0) {
  const output = Number(value);
  return Number.isFinite(output) ? output : fallback;
}

export function safeBool(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;

  const output = safeText(value, "").toLowerCase();
  if (["true", "yes", "si", "sí", "on", "ok"].includes(output)) return true;
  if (["false", "no", "off"].includes(output)) return false;

  return Boolean(fallback);
}

export function clampNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const output = safeNumber(value, min);
  return Math.min(Math.max(output, min), max);
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
  const output = [];
  const seen = new Set();

  for (const value of safeArray(values).flat(Infinity)) {
    const text = safeText(value, "");
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
  }

  return output;
}

/* =========================================================
   CLONE / STRING
========================================================= */

export function safeClone(value, fallback = null) {
  if (value === undefined) return fallback;
  if (value === null) return null;

  try {
    if (typeof structuredClone === "function") return structuredClone(value);
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
    if (isBrowser() && window.crypto?.randomUUID) return window.crypto.randomUUID();
  } catch {}

  try {
    if (isBrowser() && window.crypto?.getRandomValues) {
      const buffer = new Uint32Array(2);
      window.crypto.getRandomValues(buffer);
      return [...buffer].map((item) => item.toString(36)).join("-");
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
  return normalizeToastId(`${safeText(prefix, "toast")}-${now()}-${seed}-${randomPart()}`);
}

/* =========================================================
   SAFE TEXT
========================================================= */

export function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function normalizeToastText(value, fallback = "", max = TOAST_MAX_TEXT_LENGTH) {
  return limitText(value === null || value === undefined ? fallback : value, max);
}

export function normalizeToastTitle(value, fallback = "", max = TOAST_MAX_TITLE_LENGTH) {
  return limitText(value === null || value === undefined ? fallback : value, max);
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
  const raw = safeText(value, TOAST_DEFAULT_TYPE).toLowerCase().replace(/\s+/g, "-");
  const alias = TOAST_TYPE_ALIASES?.[raw] || raw;

  try {
    if (TOAST_TYPE_SET?.has?.(alias)) return alias;
  } catch {}

  if (Array.isArray(TOAST_TYPES) && TOAST_TYPES.includes(alias)) return alias;

  return TOAST_DEFAULT_TYPE || TOAST_TYPE_INFO;
}

export function isValidToastType(value = "") {
  const raw = safeText(value, "").toLowerCase().replace(/\s+/g, "-");
  if (!raw) return false;

  const alias = TOAST_TYPE_ALIASES?.[raw] || raw;

  try {
    if (TOAST_TYPE_SET?.has?.(alias)) return true;
  } catch {}

  return Array.isArray(TOAST_TYPES) && TOAST_TYPES.includes(alias);
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

  if (["persist", "persistent", "manual", "infinite", "infinity", "none", "off", "false"].includes(raw)) return 0;

  const match = raw.match(/^(\d+(?:\.\d+)?)(ms|s)?$/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;

  return match[2] === "s" ? amount * 1000 : amount;
}

function defaultDurationForType(type = TOAST_DEFAULT_TYPE) {
  const normalizedType = normalizeToastType(type);
  return safeNumber(TOAST_DURATIONS_BY_TYPE?.[normalizedType], TOAST_DEFAULT_DURATION);
}

export function normalizeToastDuration(type = TOAST_DEFAULT_TYPE, duration = undefined) {
  const normalizedType = normalizeToastType(type);
  if (normalizedType === TOAST_TYPE_LOADING) return 0;

  let value = duration;

  if (value === undefined || value === true) value = defaultDurationForType(normalizedType);
  else if (value === false || value === null || value === 0) return 0;
  else if (typeof value === "string") value = parseDurationString(value) ?? defaultDurationForType(normalizedType);

  const output = safeNumber(value, defaultDurationForType(normalizedType));
  if (output <= 0) return 0;

  return clampNumber(output, TOAST_MIN_DURATION, TOAST_MAX_DURATION);
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

  const id = normalizeToastId(source.id || source.toastId || source.key || "");

  return {
    ...source,
    id,
    toastId: normalizeToastId(source.toastId || source.id || source.key || ""),
    type,
    title,
    message,
    text: message,
    duration,
    persist: duration <= 0,
    persistent: duration <= 0,
    closable: source.closable !== undefined ? source.closable !== false : type !== TOAST_TYPE_LOADING,
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
