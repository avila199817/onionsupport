/* =========================================================
   Onion SPA - Toast Constants
   Archivo: src/ui/toast/constants.js

   TOAST CONSTANTS · SIMPLE
   - sin dependencias
   - sin lógica runtime
   - contrato único para api/dom/store/timers/events/text
   - compatible hacia atrás
========================================================= */

export const TOAST_VERSION = "18.0.0-simple";
export const TOAST_SOURCE = "ui.toast";
export const TOAST_SCOPE = "ui:toast";

export const TOAST_CONTAINER_ID = "toast-stack";
export const TOAST_KEYFRAMES_ID = "toast-progress-keyframes";

export const TOAST_CONTAINER_SELECTOR = `#${TOAST_CONTAINER_ID}, [data-toast-root]`;
export const TOAST_ITEM_SELECTOR = "[data-toast-id]";

export const TOAST_DATA_ROOT = "data-toast-root";
export const TOAST_DATA_ID = "data-toast-id";
export const TOAST_DATA_TYPE = "data-toast-type";
export const TOAST_DATA_DISMISSING = "data-toast-dismissing";
export const TOAST_DATA_PAUSED = "data-toast-paused";
export const TOAST_DATA_PERSISTENT = "data-toast-persistent";
export const TOAST_DATA_CREATED_AT = "data-toast-created-at";

export const TOAST_TYPE_SUCCESS = "success";
export const TOAST_TYPE_ERROR = "error";
export const TOAST_TYPE_WARNING = "warning";
export const TOAST_TYPE_INFO = "info";
export const TOAST_TYPE_LOADING = "loading";

export const TOAST_DEFAULT_TYPE = TOAST_TYPE_INFO;

export const TOAST_TYPES = Object.freeze([
  TOAST_TYPE_SUCCESS,
  TOAST_TYPE_ERROR,
  TOAST_TYPE_WARNING,
  TOAST_TYPE_INFO,
  TOAST_TYPE_LOADING,
]);

export const TOAST_TYPE_SET = new Set(TOAST_TYPES);

export const TOAST_TYPE_ALIASES = Object.freeze({
  danger: TOAST_TYPE_ERROR,
  fail: TOAST_TYPE_ERROR,
  failed: TOAST_TYPE_ERROR,
  failure: TOAST_TYPE_ERROR,

  warn: TOAST_TYPE_WARNING,
  alert: TOAST_TYPE_WARNING,
  caution: TOAST_TYPE_WARNING,

  ok: TOAST_TYPE_SUCCESS,
  done: TOAST_TYPE_SUCCESS,
  saved: TOAST_TYPE_SUCCESS,

  pending: TOAST_TYPE_LOADING,
  progress: TOAST_TYPE_LOADING,
  processing: TOAST_TYPE_LOADING,
  spinner: TOAST_TYPE_LOADING,
});

export const TOAST_DEFAULT_DURATION = 4200;
export const TOAST_SUCCESS_DURATION = 3600;
export const TOAST_ERROR_DURATION = 6200;
export const TOAST_WARNING_DURATION = 5200;
export const TOAST_INFO_DURATION = 4200;
export const TOAST_LOADING_DURATION = 0;

export const TOAST_MIN_DURATION = 1200;
export const TOAST_MAX_DURATION = 30000;

export const TOAST_MAX_ITEMS = 5;
export const TOAST_MAX_TEXT_LENGTH = 240;
export const TOAST_MAX_TITLE_LENGTH = 80;

export const TOAST_DEDUPE_MS = 1200;

export const TOAST_DURATIONS_BY_TYPE = Object.freeze({
  [TOAST_TYPE_SUCCESS]: TOAST_SUCCESS_DURATION,
  [TOAST_TYPE_ERROR]: TOAST_ERROR_DURATION,
  [TOAST_TYPE_WARNING]: TOAST_WARNING_DURATION,
  [TOAST_TYPE_INFO]: TOAST_INFO_DURATION,
  [TOAST_TYPE_LOADING]: TOAST_LOADING_DURATION,
});

export const TOAST_CLOSABLE_BY_TYPE = Object.freeze({
  [TOAST_TYPE_SUCCESS]: true,
  [TOAST_TYPE_ERROR]: true,
  [TOAST_TYPE_WARNING]: true,
  [TOAST_TYPE_INFO]: true,
  [TOAST_TYPE_LOADING]: false,
});

export const TOAST_PERSISTENT_BY_TYPE = Object.freeze({
  [TOAST_TYPE_SUCCESS]: false,
  [TOAST_TYPE_ERROR]: false,
  [TOAST_TYPE_WARNING]: false,
  [TOAST_TYPE_INFO]: false,
  [TOAST_TYPE_LOADING]: true,
});

export const TOAST_ENTER_DELAY = 0;
export const TOAST_EXIT_DURATION = 220;
export const TOAST_REDUCED_MOTION_EXIT_DURATION = 0;
export const TOAST_PROGRESS_ANIMATION_NAME = "toast-progress-shrink";

export const TOAST_TIMER_TICK_MS = 100;
export const TOAST_HOVER_PAUSE = true;
export const TOAST_FOCUS_PAUSE = true;

export const TOAST_ROLE_ALERT = "alert";
export const TOAST_ROLE_STATUS = "status";

export const TOAST_LIVE_ASSERTIVE = "assertive";
export const TOAST_LIVE_POLITE = "polite";

export const TOAST_ROLES_BY_TYPE = Object.freeze({
  [TOAST_TYPE_SUCCESS]: TOAST_ROLE_STATUS,
  [TOAST_TYPE_ERROR]: TOAST_ROLE_ALERT,
  [TOAST_TYPE_WARNING]: TOAST_ROLE_ALERT,
  [TOAST_TYPE_INFO]: TOAST_ROLE_STATUS,
  [TOAST_TYPE_LOADING]: TOAST_ROLE_STATUS,
});

export const TOAST_LIVE_BY_TYPE = Object.freeze({
  [TOAST_TYPE_SUCCESS]: TOAST_LIVE_POLITE,
  [TOAST_TYPE_ERROR]: TOAST_LIVE_ASSERTIVE,
  [TOAST_TYPE_WARNING]: TOAST_LIVE_ASSERTIVE,
  [TOAST_TYPE_INFO]: TOAST_LIVE_POLITE,
  [TOAST_TYPE_LOADING]: TOAST_LIVE_POLITE,
});

export const TOAST_CLOSE_LABEL = "Cerrar notificación";

export const TOAST_CLASS_CONTAINER = "toast-stack";
export const TOAST_CLASS_ITEM = "toast";
export const TOAST_CLASS_VISIBLE = "show";
export const TOAST_CLASS_DISMISSING = "is-dismissing";
export const TOAST_CLASS_PAUSED = "is-paused";
export const TOAST_CLASS_PERSISTENT = "is-persistent";

export const TOAST_CLASS_ICON = "toast-icon";
export const TOAST_CLASS_BODY = "toast-body";
export const TOAST_CLASS_TITLE = "toast-title";
export const TOAST_CLASS_MESSAGE = "toast-message";
export const TOAST_CLASS_CLOSE = "toast-close";
export const TOAST_CLASS_PROGRESS = "toast-progress";

export const TOAST_CLASS_BY_TYPE = Object.freeze({
  [TOAST_TYPE_SUCCESS]: "toast--success",
  [TOAST_TYPE_ERROR]: "toast--error",
  [TOAST_TYPE_WARNING]: "toast--warning",
  [TOAST_TYPE_INFO]: "toast--info",
  [TOAST_TYPE_LOADING]: "toast--loading",
});

export const TOAST_I18N_PREFIX = "toast";

export const TOAST_TITLE_KEYS = Object.freeze({
  [TOAST_TYPE_SUCCESS]: `${TOAST_I18N_PREFIX}.success.title`,
  [TOAST_TYPE_ERROR]: `${TOAST_I18N_PREFIX}.error.title`,
  [TOAST_TYPE_WARNING]: `${TOAST_I18N_PREFIX}.warning.title`,
  [TOAST_TYPE_INFO]: `${TOAST_I18N_PREFIX}.info.title`,
  [TOAST_TYPE_LOADING]: `${TOAST_I18N_PREFIX}.loading.title`,
});

export const TOAST_MESSAGE_KEYS = Object.freeze({
  [TOAST_TYPE_SUCCESS]: `${TOAST_I18N_PREFIX}.success.message`,
  [TOAST_TYPE_ERROR]: `${TOAST_I18N_PREFIX}.error.message`,
  [TOAST_TYPE_WARNING]: `${TOAST_I18N_PREFIX}.warning.message`,
  [TOAST_TYPE_INFO]: `${TOAST_I18N_PREFIX}.info.message`,
  [TOAST_TYPE_LOADING]: `${TOAST_I18N_PREFIX}.loading.message`,
});

export const TOAST_FALLBACK_TITLES = Object.freeze({
  [TOAST_TYPE_SUCCESS]: "Correcto",
  [TOAST_TYPE_ERROR]: "Error",
  [TOAST_TYPE_WARNING]: "Atención",
  [TOAST_TYPE_INFO]: "Información",
  [TOAST_TYPE_LOADING]: "Cargando",
});

export const TOAST_FALLBACK_MESSAGES = Object.freeze({
  [TOAST_TYPE_SUCCESS]: "Operación completada correctamente.",
  [TOAST_TYPE_ERROR]: "No se pudo completar la operación.",
  [TOAST_TYPE_WARNING]: "Revisa esta acción antes de continuar.",
  [TOAST_TYPE_INFO]: "Información disponible.",
  [TOAST_TYPE_LOADING]: "Procesando...",
});

export const TOAST_EVENT_SHOW = "toast:show";
export const TOAST_EVENT_UPDATE = "toast:update";
export const TOAST_EVENT_DISMISS = "toast:dismiss";
export const TOAST_EVENT_CLEAR = "toast:clear";

export const TOAST_EVENT_SUCCESS = "toast:success";
export const TOAST_EVENT_ERROR = "toast:error";
export const TOAST_EVENT_WARNING = "toast:warning";
export const TOAST_EVENT_INFO = "toast:info";
export const TOAST_EVENT_LOADING = "toast:loading";

export const TOAST_EVENT_SHOWN = "toast:shown";
export const TOAST_EVENT_UPDATED = "toast:updated";
export const TOAST_EVENT_DISMISSED = "toast:dismissed";
export const TOAST_EVENT_CLEARED = "toast:cleared";

export const TOAST_EVENT_PAUSE = "toast:pause";
export const TOAST_EVENT_RESUME = "toast:resume";

export const TOAST_EVENT_LANGUAGE_REFRESH = "toast:language:refresh";
export const TOAST_EVENT_RESET = "toast:reset";
export const TOAST_EVENT_ERROR_INTERNAL = "toast:internal-error";

export const TOAST_EVENTS = Object.freeze({
  show: TOAST_EVENT_SHOW,
  update: TOAST_EVENT_UPDATE,
  dismiss: TOAST_EVENT_DISMISS,
  clear: TOAST_EVENT_CLEAR,

  success: TOAST_EVENT_SUCCESS,
  error: TOAST_EVENT_ERROR,
  warning: TOAST_EVENT_WARNING,
  info: TOAST_EVENT_INFO,
  loading: TOAST_EVENT_LOADING,

  shown: TOAST_EVENT_SHOWN,
  updated: TOAST_EVENT_UPDATED,
  dismissed: TOAST_EVENT_DISMISSED,
  cleared: TOAST_EVENT_CLEARED,

  pause: TOAST_EVENT_PAUSE,
  resume: TOAST_EVENT_RESUME,

  languageRefresh: TOAST_EVENT_LANGUAGE_REFRESH,
  reset: TOAST_EVENT_RESET,
  internalError: TOAST_EVENT_ERROR_INTERNAL,
});

export default {
  TOAST_VERSION,
  TOAST_SOURCE,
  TOAST_SCOPE,

  TOAST_CONTAINER_ID,
  TOAST_KEYFRAMES_ID,
  TOAST_CONTAINER_SELECTOR,
  TOAST_ITEM_SELECTOR,

  TOAST_DATA_ROOT,
  TOAST_DATA_ID,
  TOAST_DATA_TYPE,
  TOAST_DATA_DISMISSING,
  TOAST_DATA_PAUSED,
  TOAST_DATA_PERSISTENT,
  TOAST_DATA_CREATED_AT,

  TOAST_TYPE_SUCCESS,
  TOAST_TYPE_ERROR,
  TOAST_TYPE_WARNING,
  TOAST_TYPE_INFO,
  TOAST_TYPE_LOADING,
  TOAST_DEFAULT_TYPE,
  TOAST_TYPES,
  TOAST_TYPE_SET,
  TOAST_TYPE_ALIASES,

  TOAST_DEFAULT_DURATION,
  TOAST_SUCCESS_DURATION,
  TOAST_ERROR_DURATION,
  TOAST_WARNING_DURATION,
  TOAST_INFO_DURATION,
  TOAST_LOADING_DURATION,
  TOAST_MIN_DURATION,
  TOAST_MAX_DURATION,
  TOAST_MAX_ITEMS,
  TOAST_MAX_TEXT_LENGTH,
  TOAST_MAX_TITLE_LENGTH,
  TOAST_DEDUPE_MS,

  TOAST_DURATIONS_BY_TYPE,
  TOAST_CLOSABLE_BY_TYPE,
  TOAST_PERSISTENT_BY_TYPE,

  TOAST_ENTER_DELAY,
  TOAST_EXIT_DURATION,
  TOAST_REDUCED_MOTION_EXIT_DURATION,
  TOAST_PROGRESS_ANIMATION_NAME,
  TOAST_TIMER_TICK_MS,
  TOAST_HOVER_PAUSE,
  TOAST_FOCUS_PAUSE,

  TOAST_ROLE_ALERT,
  TOAST_ROLE_STATUS,
  TOAST_LIVE_ASSERTIVE,
  TOAST_LIVE_POLITE,
  TOAST_ROLES_BY_TYPE,
  TOAST_LIVE_BY_TYPE,
  TOAST_CLOSE_LABEL,

  TOAST_CLASS_CONTAINER,
  TOAST_CLASS_ITEM,
  TOAST_CLASS_VISIBLE,
  TOAST_CLASS_DISMISSING,
  TOAST_CLASS_PAUSED,
  TOAST_CLASS_PERSISTENT,
  TOAST_CLASS_ICON,
  TOAST_CLASS_BODY,
  TOAST_CLASS_TITLE,
  TOAST_CLASS_MESSAGE,
  TOAST_CLASS_CLOSE,
  TOAST_CLASS_PROGRESS,
  TOAST_CLASS_BY_TYPE,

  TOAST_I18N_PREFIX,
  TOAST_TITLE_KEYS,
  TOAST_MESSAGE_KEYS,
  TOAST_FALLBACK_TITLES,
  TOAST_FALLBACK_MESSAGES,

  TOAST_EVENT_SHOW,
  TOAST_EVENT_UPDATE,
  TOAST_EVENT_DISMISS,
  TOAST_EVENT_CLEAR,
  TOAST_EVENT_SUCCESS,
  TOAST_EVENT_ERROR,
  TOAST_EVENT_WARNING,
  TOAST_EVENT_INFO,
  TOAST_EVENT_LOADING,
  TOAST_EVENT_SHOWN,
  TOAST_EVENT_UPDATED,
  TOAST_EVENT_DISMISSED,
  TOAST_EVENT_CLEARED,
  TOAST_EVENT_PAUSE,
  TOAST_EVENT_RESUME,
  TOAST_EVENT_LANGUAGE_REFRESH,
  TOAST_EVENT_RESET,
  TOAST_EVENT_ERROR_INTERNAL,
  TOAST_EVENTS,
};
