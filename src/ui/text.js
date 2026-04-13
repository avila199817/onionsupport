/* =========================================================
   Onion SPA - Toast Text
   Archivo: src/ui/toast/text.js

   Responsabilidades:
   - textos del sistema toast
   - integración con i18n
   - títulos por tipo
   - mensajes genéricos
   - labels accesibles
========================================================= */

import { I18n } from "../../i18n/index.js";

import {
  TOAST_TYPE_SUCCESS,
  TOAST_TYPE_ERROR,
  TOAST_TYPE_WARNING,
  TOAST_TYPE_INFO,
  TOAST_TYPE_LOADING,
} from "./constants.js";

/* =========================================================
   I18N
========================================================= */

export function t(
  key,
  fallback,
  params = {}
) {
  try {
    return I18n.t(
      key,
      params,
      fallback
    );
  } catch {
    return fallback;
  }
}

/* =========================================================
   TITLES
========================================================= */

export function getToastTitle(
  type = TOAST_TYPE_INFO
) {
  switch (type) {
    case TOAST_TYPE_SUCCESS:
      return t(
        "toast.types.success",
        "Éxito"
      );

    case TOAST_TYPE_ERROR:
      return t(
        "toast.types.error",
        "Error"
      );

    case TOAST_TYPE_WARNING:
      return t(
        "toast.types.warning",
        "Aviso"
      );

    case TOAST_TYPE_LOADING:
      return t(
        "toast.types.loading",
        "Cargando"
      );

    case TOAST_TYPE_INFO:
    default:
      return t(
        "toast.types.info",
        "Información"
      );
  }
}

/* =========================================================
   GENERIC MESSAGE
========================================================= */

export function getToastMessage(
  type = TOAST_TYPE_INFO
) {
  switch (type) {
    case TOAST_TYPE_SUCCESS:
      return t(
        "toast.generic.success",
        "Acción completada correctamente"
      );

    case TOAST_TYPE_ERROR:
      return t(
        "toast.generic.error",
        "Ha ocurrido un error inesperado"
      );

    case TOAST_TYPE_WARNING:
      return t(
        "toast.generic.warning",
        "Revisa la información antes de continuar"
      );

    case TOAST_TYPE_LOADING:
      return t(
        "toast.generic.loading",
        "Procesando solicitud..."
      );

    case TOAST_TYPE_INFO:
    default:
      return t(
        "toast.generic.info",
        "Hay información nueva disponible"
      );
  }
}

/* =========================================================
   CLOSE LABEL
========================================================= */

export function getToastCloseLabel() {
  return t(
    "toast.close",
    "Cerrar notificación"
  );
}

/* =========================================================
   RESOLVERS
========================================================= */

export function resolveToastTitle(
  type,
  title,
  useDefaultTitle = false
) {
  const value = String(
    title ?? ""
  ).trim();

  if (value) {
    return value;
  }

  if (useDefaultTitle) {
    return getToastTitle(type);
  }

  return "";
}

export function resolveToastMessage(
  type,
  message,
  text,
  useDefaultMessage = false
) {
  const value = String(
    message ??
      text ??
      ""
  ).trim();

  if (value) {
    return value;
  }

  if (useDefaultMessage) {
    return getToastMessage(type);
  }

  if (type === TOAST_TYPE_LOADING) {
    return getToastMessage(
      TOAST_TYPE_LOADING
    );
  }

  return "";
}
