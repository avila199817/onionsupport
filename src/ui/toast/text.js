/* =========================================================
   Onion SPA - Toast Text
   Archivo: src/ui/toast/text.js

   Responsabilidades:
   - textos del sistema toast
   - integración con i18n
   - títulos por tipo
   - mensajes genéricos por tipo
   - labels accesibles
   - resolución segura de title/message
   - compatibilidad con mensajes dinámicos
   - fallback robusto sin romper UI

   HARDENING:
   - tolera I18n no inicializado
   - normaliza tipo de toast
   - no devuelve strings vacíos salvo que proceda
   - soporta params en traducciones
   - mantiene API estable para api.js / dom.js
========================================================= */

import { I18n } from "../../i18n/index.js";

import {
  TOAST_TYPES,
  TOAST_TYPE_SUCCESS,
  TOAST_TYPE_ERROR,
  TOAST_TYPE_WARNING,
  TOAST_TYPE_INFO,
  TOAST_TYPE_LOADING,
} from "./constants.js";

/* =========================================================
   BASICS
========================================================= */

function safeText(value, fallback = "") {
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

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function normalizeToastType(type = TOAST_TYPE_INFO) {
  const value =
    safeText(type, TOAST_TYPE_INFO)
      .toLowerCase();

  if (TOAST_TYPES.includes(value)) {
    return value;
  }

  return TOAST_TYPE_INFO;
}

/* =========================================================
   I18N
========================================================= */

export function t(
  key,
  fallback = "",
  params = {}
) {
  const finalKey =
    safeText(key, "");

  const finalFallback =
    safeText(fallback, finalKey);

  if (!finalKey) {
    return finalFallback;
  }

  try {
    const translated =
      I18n?.t?.(
        finalKey,
        safeObject(params),
        finalFallback
      );

    return safeText(
      translated,
      finalFallback
    );
  } catch {
    return finalFallback;
  }
}

/* =========================================================
   KEYS
========================================================= */

const TOAST_TITLE_KEYS = Object.freeze({
  [TOAST_TYPE_SUCCESS]: {
    key: "toast.types.success",
    fallback: "Éxito",
  },

  [TOAST_TYPE_ERROR]: {
    key: "toast.types.error",
    fallback: "Error",
  },

  [TOAST_TYPE_WARNING]: {
    key: "toast.types.warning",
    fallback: "Aviso",
  },

  [TOAST_TYPE_INFO]: {
    key: "toast.types.info",
    fallback: "Información",
  },

  [TOAST_TYPE_LOADING]: {
    key: "toast.types.loading",
    fallback: "Cargando",
  },
});

const TOAST_MESSAGE_KEYS = Object.freeze({
  [TOAST_TYPE_SUCCESS]: {
    key: "toast.generic.success",
    fallback: "Acción completada correctamente",
  },

  [TOAST_TYPE_ERROR]: {
    key: "toast.generic.error",
    fallback: "Ha ocurrido un error inesperado",
  },

  [TOAST_TYPE_WARNING]: {
    key: "toast.generic.warning",
    fallback: "Revisa la información antes de continuar",
  },

  [TOAST_TYPE_INFO]: {
    key: "toast.generic.info",
    fallback: "Hay información nueva disponible",
  },

  [TOAST_TYPE_LOADING]: {
    key: "toast.generic.loading",
    fallback: "Procesando solicitud...",
  },
});

/* =========================================================
   TITLES
========================================================= */

export function getToastTitle(
  type = TOAST_TYPE_INFO,
  params = {}
) {
  const normalizedType =
    normalizeToastType(type);

  const config =
    TOAST_TITLE_KEYS[normalizedType] ||
    TOAST_TITLE_KEYS[TOAST_TYPE_INFO];

  return t(
    config.key,
    config.fallback,
    params
  );
}

/* =========================================================
   GENERIC MESSAGE
========================================================= */

export function getToastMessage(
  type = TOAST_TYPE_INFO,
  params = {}
) {
  const normalizedType =
    normalizeToastType(type);

  const config =
    TOAST_MESSAGE_KEYS[normalizedType] ||
    TOAST_MESSAGE_KEYS[TOAST_TYPE_INFO];

  return t(
    config.key,
    config.fallback,
    params
  );
}

/* =========================================================
   ACCESSIBLE LABELS
========================================================= */

export function getToastCloseLabel(
  params = {}
) {
  return t(
    "toast.close",
    "Cerrar notificación",
    params
  );
}

export function getToastDismissLabel(
  params = {}
) {
  return t(
    "toast.dismiss",
    "Descartar notificación",
    params
  );
}

/* =========================================================
   RESOLVERS
========================================================= */

export function resolveToastTitle(
  type = TOAST_TYPE_INFO,
  title = "",
  useDefaultTitle = false,
  params = {}
) {
  const value =
    safeText(title, "");

  if (value) {
    return value;
  }

  if (useDefaultTitle === true) {
    return getToastTitle(
      type,
      params
    );
  }

  return "";
}

export function resolveToastMessage(
  type = TOAST_TYPE_INFO,
  message = "",
  text = "",
  useDefaultMessage = false,
  params = {}
) {
  const value =
    safeText(
      message ?? text,
      ""
    );

  if (value) {
    return value;
  }

  /*
    Loading siempre debe tener mensaje.
    Si no, el toast queda visualmente vacío.
  */
  if (
    useDefaultMessage === true ||
    normalizeToastType(type) === TOAST_TYPE_LOADING
  ) {
    return getToastMessage(
      type,
      params
    );
  }

  return "";
}

/* =========================================================
   DEBUG / SNAPSHOT
========================================================= */

export function getToastTextSnapshot() {
  return {
    types: [...TOAST_TYPES],

    titles: {
      success: getToastTitle(TOAST_TYPE_SUCCESS),
      error: getToastTitle(TOAST_TYPE_ERROR),
      warning: getToastTitle(TOAST_TYPE_WARNING),
      info: getToastTitle(TOAST_TYPE_INFO),
      loading: getToastTitle(TOAST_TYPE_LOADING),
    },

    messages: {
      success: getToastMessage(TOAST_TYPE_SUCCESS),
      error: getToastMessage(TOAST_TYPE_ERROR),
      warning: getToastMessage(TOAST_TYPE_WARNING),
      info: getToastMessage(TOAST_TYPE_INFO),
      loading: getToastMessage(TOAST_TYPE_LOADING),
    },

    closeLabel: getToastCloseLabel(),
    dismissLabel: getToastDismissLabel(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  t,

  getToastTitle,
  getToastMessage,

  getToastCloseLabel,
  getToastDismissLabel,

  resolveToastTitle,
  resolveToastMessage,

  getToastTextSnapshot,
};
