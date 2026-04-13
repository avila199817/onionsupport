/* =========================================================
   Onion SPA - Toast Constants
   Archivo: src/ui/toast/constants.js

   Responsabilidades:
   - centralizar constantes del sistema toast
   - definir ids globales del módulo
   - definir límites y defaults
   - definir tipos válidos
========================================================= */

/* =========================================================
   SCOPE / IDS
========================================================= */

export const TOAST_SCOPE = "ui:toast";
export const TOAST_CONTAINER_ID = "toast-stack";
export const TOAST_KEYFRAMES_ID = "toast-progress-keyframes";

/* =========================================================
   LIMITS / DEFAULTS
========================================================= */

export const TOAST_DEFAULT_DURATION = 4200;
export const TOAST_MAX_ITEMS = 5;

/* =========================================================
   TYPES
========================================================= */

export const TOAST_TYPES = Object.freeze([
  "success",
  "error",
  "warning",
  "info",
  "loading",
]);

export const TOAST_TYPE_SUCCESS = "success";
export const TOAST_TYPE_ERROR = "error";
export const TOAST_TYPE_WARNING = "warning";
export const TOAST_TYPE_INFO = "info";
export const TOAST_TYPE_LOADING = "loading";

/* =========================================================
   A11Y
========================================================= */

export const TOAST_ROLE_ALERT = "alert";
export const TOAST_ROLE_STATUS = "status";

export const TOAST_LIVE_ASSERTIVE = "assertive";
export const TOAST_LIVE_POLITE = "polite";
