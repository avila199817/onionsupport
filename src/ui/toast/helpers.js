/* =========================================================
   Onion Support - Toast Helpers
   Archivo: /src/ui/toast/helpers.js

   Responsabilidad:
   - Helpers puros mínimos de compat para Toast.
   - Sin imports.
   - Sin DOM mutation.
   - Sin store.
   - Sin timers.
   - Sin events.
   - Sin AppCore.
   - Sin magia negra.
   - El Toast real vive en src/ui/toast/index.js.
========================================================= */

export const TOAST_HELPERS_VERSION = "simple";

/* =========================================================
   LOCAL CONTRACT
========================================================= */

const TYPES = Object.freeze([
  "success",
  "error",
  "warning",
  "info",
  "loading",
]);

const DEFAULT_TYPE = "info";

const TYPE_ALIASES = Object.freeze({
  ok: "success",
  done: "success",
  saved: "success",

  danger: "error",
  fail: "error",
  failed: "error",
  failure: "error",

  warn: "warning",
  alert: "warning",
  caution: "warning",

  pending: "loading",
  progress: "loading",
  processing: "loading",
  spinner: "loading",
});

const DURATIONS = Object.freeze({
  success: 3500,
  error: 6000,
  warning: 5000,
  info: 4000,
  loading: 0,
});

const MAX_TEXT = 240;
const MAX_TITLE = 80;
const MIN_DURATION = 1000;
const MAX_DURATION = 30000;

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
  if (!isObject(value)) return false;

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
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

export function safeText(value, fallback = "") {
  const output = String(value ?? "").trim();
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
  return Date.now();
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
    const clean = safeText(value, "");

    if (!clean || seen.has(clean)) continue;

    seen.add(clean);
    output.push(clean);
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
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {
    // fallback abajo
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

export function normalizeWhitespace(value = "") {
  return safeText(value, "").replace(/\s+/g, " ");
}

export function limitText(value = "", max = MAX_TEXT) {
  const clean = normalizeWhitespace(value);
  const limit = Math.max(0, safeNumber(max, MAX_TEXT));

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
  } catch {
    // fallback abajo
  }

  try {
    if (isBrowser() && window.crypto?.getRandomValues) {
      const buffer = new Uint32Array(2);
      window.crypto.getRandomValues(buffer);
      return [...buffer].map((item) => item.toString(36)).join("-");
    }
  } catch {
    // fallback abajo
  }

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

export function normalizeToastText(value, fallback = "", max = MAX_TEXT) {
  return limitText(value === null || value === undefined ? fallback : value, max);
}

export function normalizeToastTitle(value, fallback = "", max = MAX_TITLE) {
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

export function normalizeToastType(value = DEFAULT_TYPE) {
  const raw = safeText(value, DEFAULT_TYPE)
    .toLowerCase()
    .replace(/\s+/g, "-");

  const alias = TYPE_ALIASES[raw] || raw;

  return TYPES.includes(alias) ? alias : DEFAULT_TYPE;
}

export function isValidToastType(value = "") {
  const raw = safeText(value, "")
    .toLowerCase()
    .replace(/\s+/g, "-");

  if (!raw) return false;

  const alias = TYPE_ALIASES[raw] || raw;

  return TYPES.includes(alias);
}

export function isToastLoading(type = "") {
  return normalizeToastType(type) === "loading";
}

/* =========================================================
   DURATION
========================================================= */

function parseDurationString(value = "") {
  const raw = safeText(value, "").toLowerCase();

  if (!raw) return null;

  if (["persist", "persistent", "manual", "infinite", "infinity", "none", "off", "false"].includes(raw)) {
    return 0;
  }

  const match = raw.match(/^(\d+(?:\.\d+)?)(ms|s)?$/);

  if (!match) return null;

  const amount = Number(match[1]);

  if (!Number.isFinite(amount)) return null;

  return match[2] === "s" ? amount * 1000 : amount;
}

function defaultDurationForType(type = DEFAULT_TYPE) {
  return DURATIONS[normalizeToastType(type)] ?? DURATIONS.info;
}

export function normalizeToastDuration(type = DEFAULT_TYPE, duration = undefined) {
  const normalizedType = normalizeToastType(type);

  if (normalizedType === "loading") return 0;

  let value = duration;

  if (value === undefined || value === true) {
    value = defaultDurationForType(normalizedType);
  } else if (value === false || value === null || value === 0) {
    return 0;
  } else if (typeof value === "string") {
    value = parseDurationString(value) ?? defaultDurationForType(normalizedType);
  }

  const output = safeNumber(value, defaultDurationForType(normalizedType));

  if (output <= 0) return 0;

  return clampNumber(output, MIN_DURATION, MAX_DURATION);
}

export function isPersistentToastDuration(duration = 0) {
  return safeNumber(duration, 0) <= 0;
}

/* =========================================================
   OPTIONS
========================================================= */

export function normalizeToastOptions(options = {}) {
  const source = safeObject(options);
  const type = normalizeToastType(source.type);

  const message = normalizeToastText(
    source.message ?? source.text ?? "",
    "",
    source.maxTextLength || MAX_TEXT
  );

  const title = normalizeToastTitle(
    source.title ?? source.heading ?? "",
    "",
    source.maxTitleLength || MAX_TITLE
  );

  const duration =
    source.persist === true || source.persistent === true
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

    closable:
      source.closable !== undefined
        ? source.closable !== false
        : type !== "loading",
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getToastHelpersSnapshot() {
  return {
    version: TOAST_HELPERS_VERSION,

    seed,
    browser: isBrowser(),
    reducedMotion: prefersReducedMotion(),

    defaultType: DEFAULT_TYPE,
    types: [...TYPES],

    defaultDuration: DURATIONS.info,
    minDuration: MIN_DURATION,
    maxDuration: MAX_DURATION,
    maxTextLength: MAX_TEXT,
    maxTitleLength: MAX_TITLE,

    policy: {
      noImports: true,
      pureHelpers: true,
      noDomMutation: true,
      noStore: true,
      noTimers: true,
      noEvents: true,
    },
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
