/* =========================================================
   Onion SPA - Toast Helpers
   Archivo: src/ui/toast/helpers.js

   Responsabilidades:
   - utilidades puras del módulo toast
   - ids incrementales
   - sanitizado html
   - normalización de tipo
   - normalización de duración
   - reduced motion
========================================================= */

import {
  TOAST_DEFAULT_DURATION,
  TOAST_TYPES,
  TOAST_TYPE_INFO,
  TOAST_TYPE_LOADING,
} from "./constants.js";

/* =========================================================
   ID SEED
========================================================= */

let seed = 0;

/* =========================================================
   IDS
========================================================= */

export function nextToastId() {
  seed += 1;

  return `toast-${Date.now()}-${seed}`;
}

/* =========================================================
   HTML
========================================================= */

export function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================================================
   MOTION
========================================================= */

export function prefersReducedMotion() {
  try {
    return window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  } catch {
    return false;
  }
}

/* =========================================================
   TYPE
========================================================= */

export function normalizeToastType(
  value = TOAST_TYPE_INFO
) {
  const type = String(value || "")
    .trim()
    .toLowerCase();

  if (TOAST_TYPES.includes(type)) {
    return type;
  }

  return TOAST_TYPE_INFO;
}

/* =========================================================
   DURATION
========================================================= */

export function normalizeToastDuration(
  type,
  duration
) {
  if (type === TOAST_TYPE_LOADING) {
    return 0;
  }

  if (
    duration === false ||
    duration === null
  ) {
    return 0;
  }

  if (
    typeof duration === "number" &&
    Number.isFinite(duration)
  ) {
    return Math.max(0, duration);
  }

  return TOAST_DEFAULT_DURATION;
}

/* =========================================================
   TEXT
========================================================= */

export function safeText(
  value,
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}
