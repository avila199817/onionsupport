/* =========================================================
   Onion Support - Toast Text
   Archivo: /src/ui/toast/text.js

   Responsabilidad:
   - Textos fallback mínimos para Toast.
   - Sin imports.
   - Sin I18n.
   - Sin constants.js.
   - Sin helpers.js.
   - Sin DOM.
   - Sin store.
   - Sin timers.
   - Sin api.
   - Sin magia negra.
   - El Toast real vive en src/ui/toast/index.js.
========================================================= */

export const TOAST_TEXT_VERSION = "simple";

/* =========================================================
   CONTRACT
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

const TITLE_KEYS = Object.freeze({
  success: "toast.success.title",
  error: "toast.error.title",
  warning: "toast.warning.title",
  info: "toast.info.title",
  loading: "toast.loading.title",
});

const MESSAGE_KEYS = Object.freeze({
  success: "toast.success.message",
  error: "toast.error.message",
  warning: "toast.warning.message",
  info: "toast.info.message",
  loading: "toast.loading.message",
});

const FALLBACK_TITLES = Object.freeze({
  success: "Correcto",
  error: "Error",
  warning: "Atención",
  info: "Información",
  loading: "Cargando",
});

const FALLBACK_MESSAGES = Object.freeze({
  success: "Operación completada correctamente.",
  error: "No se pudo completar la operación.",
  warning: "Revisa esta acción antes de continuar.",
  info: "Información disponible.",
  loading: "Cargando...",
});

const CLOSE_LABEL = "Cerrar notificación";
const DISMISS_LABEL = "Descartar notificación";

const MAX_TITLE_LENGTH = 80;
const MAX_MESSAGE_LENGTH = 240;
const MAX_LABEL_LENGTH = 120;

/* =========================================================
   BASICS
========================================================= */

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function limit(value = "", max = MAX_MESSAGE_LENGTH) {
  const size = Math.max(0, Number(max) || MAX_MESSAGE_LENGTH);

  return text(value, "")
    .replace(/\s+/g, " ")
    .slice(0, size);
}

function normalizeType(value = DEFAULT_TYPE) {
  const raw = text(value, DEFAULT_TYPE)
    .toLowerCase()
    .replace(/\s+/g, "-");

  const alias = TYPE_ALIASES[raw] || raw;

  return TYPES.includes(alias) ? alias : DEFAULT_TYPE;
}

function interpolate(template = "", params = {}) {
  let output = text(template, "");

  if (!output || !params || typeof params !== "object") return output;

  for (const [key, value] of Object.entries(params)) {
    const token = `{${key}}`;

    output = output.split(token).join(text(value, ""));
  }

  return output;
}

/* =========================================================
   I18N COMPAT
========================================================= */

export function t(_key = "", fallback = "", params = {}) {
  return interpolate(fallback || _key, params);
}

/* =========================================================
   KEYS / FALLBACKS
========================================================= */

export function getToastTitleKey(type = DEFAULT_TYPE) {
  const normalized = normalizeType(type);
  return TITLE_KEYS[normalized] || TITLE_KEYS.info;
}

export function getToastMessageKey(type = DEFAULT_TYPE) {
  const normalized = normalizeType(type);
  return MESSAGE_KEYS[normalized] || MESSAGE_KEYS.info;
}

export function getToastFallbackTitle(type = DEFAULT_TYPE) {
  const normalized = normalizeType(type);
  return limit(FALLBACK_TITLES[normalized] || FALLBACK_TITLES.info, MAX_TITLE_LENGTH);
}

export function getToastFallbackMessage(type = DEFAULT_TYPE) {
  const normalized = normalizeType(type);
  return limit(FALLBACK_MESSAGES[normalized] || FALLBACK_MESSAGES.info, MAX_MESSAGE_LENGTH);
}

/* =========================================================
   PUBLIC TEXT GETTERS
========================================================= */

export function getToastTitle(type = DEFAULT_TYPE, params = {}) {
  const fallback = getToastFallbackTitle(type);
  return limit(t(getToastTitleKey(type), fallback, params), MAX_TITLE_LENGTH);
}

export function getToastMessage(type = DEFAULT_TYPE, params = {}) {
  const fallback = getToastFallbackMessage(type);
  return limit(t(getToastMessageKey(type), fallback, params), MAX_MESSAGE_LENGTH);
}

export function getToastCloseLabel(params = {}) {
  return limit(t("toast.close", CLOSE_LABEL, params), MAX_LABEL_LENGTH);
}

export function getToastDismissLabel(params = {}) {
  return limit(t("toast.dismiss", DISMISS_LABEL, params), MAX_LABEL_LENGTH);
}

/* =========================================================
   RESOLVERS
========================================================= */

export function resolveToastTitle(type = DEFAULT_TYPE, title = "", useDefaultTitle = false, params = {}) {
  const explicit = limit(title, MAX_TITLE_LENGTH);

  if (explicit) return explicit;

  return useDefaultTitle === true ? getToastTitle(type, params) : "";
}

export function resolveToastMessage(type = DEFAULT_TYPE, message = "", fallbackText = "", useDefaultMessage = false, params = {}) {
  const explicit = limit(
    text(message, "") || text(fallbackText, ""),
    MAX_MESSAGE_LENGTH
  );

  if (explicit) return explicit;

  const normalized = normalizeType(type);

  if (useDefaultMessage === true || normalized === "loading") {
    return getToastMessage(normalized, params);
  }

  return "";
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getToastTextSnapshot() {
  return {
    version: TOAST_TEXT_VERSION,

    i18nReady: false,

    types: [...TYPES],

    titleKeys: Object.fromEntries(
      TYPES.map((type) => [type, getToastTitleKey(type)])
    ),

    messageKeys: Object.fromEntries(
      TYPES.map((type) => [type, getToastMessageKey(type)])
    ),

    titles: Object.fromEntries(
      TYPES.map((type) => [type, getToastTitle(type)])
    ),

    messages: Object.fromEntries(
      TYPES.map((type) => [type, getToastMessage(type)])
    ),

    closeLabel: getToastCloseLabel(),
    dismissLabel: getToastDismissLabel(),

    policy: {
      compatOnly: true,
      noImports: true,
      noI18nRuntime: true,
      noDom: true,
      noStore: true,
      noTimers: true,
      noApi: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  TOAST_TEXT_VERSION,

  t,

  getToastTitleKey,
  getToastMessageKey,

  getToastFallbackTitle,
  getToastFallbackMessage,

  getToastTitle,
  getToastMessage,

  getToastCloseLabel,
  getToastDismissLabel,

  resolveToastTitle,
  resolveToastMessage,

  getToastTextSnapshot,
};
