/* =========================================================
   Onion SPA - Toast Helpers
   Archivo: src/ui/toast/helpers.js

   Responsabilidades:
   - utilidades puras del módulo toast
   - ids incrementales robustos
   - sanitizado HTML
   - normalización de tipo
   - normalización de duración
   - reduced motion safe
   - helpers defensivos reutilizables
========================================================= */

import {
  TOAST_DEFAULT_DURATION,
  TOAST_TYPES,
  TOAST_TYPE_SUCCESS,
  TOAST_TYPE_ERROR,
  TOAST_TYPE_WARNING,
  TOAST_TYPE_INFO,
  TOAST_TYPE_LOADING,
} from "./constants.js";

/* =========================================================
   ID SEED
========================================================= */

let seed = 0;

/* =========================================================
   BASICS
========================================================= */

export function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

export function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

export function isFunction(value) {
  return typeof value === "function";
}

export function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

export function safeNumber(value, fallback = 0) {
  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

export function clampNumber(
  value,
  min = 0,
  max = Number.MAX_SAFE_INTEGER
) {
  const n =
    safeNumber(value, min);

  return Math.min(
    Math.max(n, min),
    max
  );
}

/* =========================================================
   IDS
========================================================= */

function getRandomIdPart() {
  try {
    if (
      isBrowser() &&
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      return window.crypto.randomUUID();
    }
  } catch {}

  try {
    if (
      isBrowser() &&
      window.crypto &&
      typeof window.crypto.getRandomValues === "function"
    ) {
      const buffer =
        new Uint32Array(2);

      window.crypto.getRandomValues(buffer);

      return Array.from(buffer)
        .map((value) => value.toString(36))
        .join("-");
    }
  } catch {}

  return Math.random()
    .toString(36)
    .slice(2);
}

export function normalizeToastId(value = "") {
  return safeText(value, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._:-]/g, "")
    .slice(0, 120);
}

export function nextToastId() {
  seed =
    (seed + 1) % Number.MAX_SAFE_INTEGER;

  return normalizeToastId(
    `toast-${Date.now()}-${seed}-${getRandomIdPart()}`
  );
}

/* =========================================================
   HTML
========================================================= */

export function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================================================
   MOTION
========================================================= */

export function prefersReducedMotion() {
  if (!isBrowser()) {
    return false;
  }

  try {
    return Boolean(
      window.matchMedia?.(
        "(prefers-reduced-motion: reduce)"
      )?.matches
    );
  } catch {
    return false;
  }
}

/* =========================================================
   TYPE
========================================================= */

const TOAST_TYPE_ALIASES = Object.freeze({
  ok: TOAST_TYPE_SUCCESS,
  done: TOAST_TYPE_SUCCESS,
  saved: TOAST_TYPE_SUCCESS,
  success: TOAST_TYPE_SUCCESS,

  danger: TOAST_TYPE_ERROR,
  fail: TOAST_TYPE_ERROR,
  failed: TOAST_TYPE_ERROR,
  failure: TOAST_TYPE_ERROR,
  error: TOAST_TYPE_ERROR,

  warn: TOAST_TYPE_WARNING,
  warning: TOAST_TYPE_WARNING,
  alert: TOAST_TYPE_WARNING,

  info: TOAST_TYPE_INFO,
  default: TOAST_TYPE_INFO,
  neutral: TOAST_TYPE_INFO,

  load: TOAST_TYPE_LOADING,
  loading: TOAST_TYPE_LOADING,
  pending: TOAST_TYPE_LOADING,
  progress: TOAST_TYPE_LOADING,
});

export function normalizeToastType(value = TOAST_TYPE_INFO) {
  const raw =
    safeText(value, TOAST_TYPE_INFO)
      .toLowerCase()
      .replace(/\s+/g, "-");

  const aliased =
    TOAST_TYPE_ALIASES[raw] ||
    raw;

  if (
    Array.isArray(TOAST_TYPES) &&
    TOAST_TYPES.includes(aliased)
  ) {
    return aliased;
  }

  return TOAST_TYPE_INFO;
}

export function isValidToastType(value = "") {
  return (
    normalizeToastType(value) ===
    safeText(value, "").toLowerCase()
  );
}

/* =========================================================
   DURATION
========================================================= */

function parseDurationString(value = "") {
  const raw =
    safeText(value, "")
      .toLowerCase();

  if (!raw) {
    return null;
  }

  if (
    raw === "persist" ||
    raw === "persistent" ||
    raw === "manual" ||
    raw === "infinite" ||
    raw === "none" ||
    raw === "off"
  ) {
    return 0;
  }

  const match =
    raw.match(/^(\d+(?:\.\d+)?)(ms|s)?$/);

  if (!match) {
    return null;
  }

  const amount =
    Number(match[1]);

  if (!Number.isFinite(amount)) {
    return null;
  }

  const unit =
    match[2] || "ms";

  if (unit === "s") {
    return amount * 1000;
  }

  return amount;
}

export function normalizeToastDuration(
  type,
  duration
) {
  const normalizedType =
    normalizeToastType(type);

  if (normalizedType === TOAST_TYPE_LOADING) {
    return 0;
  }

  if (
    duration === false ||
    duration === null ||
    duration === 0
  ) {
    return 0;
  }

  if (duration === true || duration === undefined) {
    return TOAST_DEFAULT_DURATION;
  }

  if (typeof duration === "string") {
    const parsed =
      parseDurationString(duration);

    if (parsed !== null) {
      return clampNumber(parsed, 0);
    }

    return TOAST_DEFAULT_DURATION;
  }

  if (
    typeof duration === "number" &&
    Number.isFinite(duration)
  ) {
    return clampNumber(duration, 0);
  }

  return TOAST_DEFAULT_DURATION;
}

/* =========================================================
   TEXT / MESSAGE
========================================================= */

export function normalizeToastText(
  value,
  fallback = ""
) {
  return safeText(value, fallback)
    .replace(/\s+/g, " ")
    .slice(0, 1000);
}

export function hasToastText(value) {
  return Boolean(
    normalizeToastText(value, "")
  );
}

/* =========================================================
   DEBUG
========================================================= */

export function getToastHelpersSnapshot() {
  return {
    seed,

    browser:
      isBrowser(),

    reducedMotion:
      prefersReducedMotion(),

    defaultDuration:
      TOAST_DEFAULT_DURATION,

    types:
      Array.isArray(TOAST_TYPES)
        ? [...TOAST_TYPES]
        : [],
  };
}

export default {
  isBrowser,
  isObject,
  isFunction,

  safeText,
  safeNumber,
  clampNumber,

  nextToastId,
  normalizeToastId,

  escapeHtml,

  prefersReducedMotion,

  normalizeToastType,
  isValidToastType,

  normalizeToastDuration,

  normalizeToastText,
  hasToastText,

  getToastHelpersSnapshot,
};
