/* =========================================================
   Onion SPA - Toast Text
   Archivo: src/ui/toast/text.js

   Toast Text limpio:
   - textos y labels del módulo toast
   - integración i18n tolerante
   - fallback robusto
   - resolución title/message
   - loading siempre tiene mensaje
   - sin DOM/store/timers/api
========================================================= */

import { I18n } from "../../i18n/index.js";

import {
  TOAST_TYPES,
  TOAST_TYPE_INFO,
  TOAST_TYPE_LOADING,

  TOAST_TITLE_KEYS,
  TOAST_MESSAGE_KEYS,
  TOAST_FALLBACK_TITLES,
  TOAST_FALLBACK_MESSAGES,
  TOAST_CLOSE_LABEL,
  TOAST_MAX_TITLE_LENGTH,
  TOAST_MAX_TEXT_LENGTH,
} from "./constants.js";

import {
  normalizeToastType,
  normalizeToastTitle,
  normalizeToastText,
  safeObject,
  safeText,
} from "./helpers.js";

/* =========================================================
   VERSION
========================================================= */

export const TOAST_TEXT_VERSION = "17.0.0-clean";

/* =========================================================
   I18N
========================================================= */

function canTranslate() {
  return Boolean(I18n && (typeof I18n.t === "function" || typeof I18n.translate === "function"));
}

function callTranslator(key = "", fallback = "", params = {}) {
  const finalKey = safeText(key, "");
  const finalFallback = safeText(fallback, finalKey);
  const finalParams = safeObject(params);

  if (!finalKey) return finalFallback;

  if (!canTranslate()) return finalFallback;

  const attempts = [
    () => I18n.t(finalKey, finalParams, finalFallback),
    () => I18n.t(finalKey, finalFallback, finalParams),
    () => I18n.t(finalKey),
    () => I18n.translate(finalKey, finalParams, finalFallback),
    () => I18n.translate(finalKey, finalFallback, finalParams),
    () => I18n.translate(finalKey),
  ];

  for (const attempt of attempts) {
    try {
      const value = attempt();

      if (
        value !== null &&
        value !== undefined &&
        String(value).trim() &&
        String(value).trim() !== finalKey
      ) {
        return safeText(value, finalFallback);
      }
    } catch {}
  }

  return finalFallback;
}

export function t(key = "", fallback = "", params = {}) {
  return callTranslator(key, fallback, params);
}

/* =========================================================
   KEYS / FALLBACKS
========================================================= */

export function getToastTitleKey(type = TOAST_TYPE_INFO) {
  const normalized = normalizeToastType(type);
  return safeText(TOAST_TITLE_KEYS?.[normalized], TOAST_TITLE_KEYS?.[TOAST_TYPE_INFO] || "");
}

export function getToastMessageKey(type = TOAST_TYPE_INFO) {
  const normalized = normalizeToastType(type);
  return safeText(TOAST_MESSAGE_KEYS?.[normalized], TOAST_MESSAGE_KEYS?.[TOAST_TYPE_INFO] || "");
}

export function getToastFallbackTitle(type = TOAST_TYPE_INFO) {
  const normalized = normalizeToastType(type);

  return normalizeToastTitle(
    TOAST_FALLBACK_TITLES?.[normalized] ||
      TOAST_FALLBACK_TITLES?.[TOAST_TYPE_INFO] ||
      "Información",
    "Información",
    TOAST_MAX_TITLE_LENGTH
  );
}

export function getToastFallbackMessage(type = TOAST_TYPE_INFO) {
  const normalized = normalizeToastType(type);

  return normalizeToastText(
    TOAST_FALLBACK_MESSAGES?.[normalized] ||
      TOAST_FALLBACK_MESSAGES?.[TOAST_TYPE_INFO] ||
      "Información disponible.",
    "Información disponible.",
    TOAST_MAX_TEXT_LENGTH
  );
}

/* =========================================================
   PUBLIC TEXT GETTERS
========================================================= */

export function getToastTitle(type = TOAST_TYPE_INFO, params = {}) {
  const normalized = normalizeToastType(type);
  const key = getToastTitleKey(normalized);
  const fallback = getToastFallbackTitle(normalized);

  return normalizeToastTitle(
    t(key, fallback, params),
    fallback,
    TOAST_MAX_TITLE_LENGTH
  );
}

export function getToastMessage(type = TOAST_TYPE_INFO, params = {}) {
  const normalized = normalizeToastType(type);
  const key = getToastMessageKey(normalized);
  const fallback = getToastFallbackMessage(normalized);

  return normalizeToastText(
    t(key, fallback, params),
    fallback,
    TOAST_MAX_TEXT_LENGTH
  );
}

export function getToastCloseLabel(params = {}) {
  return normalizeToastText(
    t("toast.close", TOAST_CLOSE_LABEL || "Cerrar notificación", params),
    TOAST_CLOSE_LABEL || "Cerrar notificación",
    120
  );
}

export function getToastDismissLabel(params = {}) {
  return normalizeToastText(
    t("toast.dismiss", "Descartar notificación", params),
    "Descartar notificación",
    120
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
  const explicit = normalizeToastTitle(title, "", TOAST_MAX_TITLE_LENGTH);

  if (explicit) return explicit;

  return useDefaultTitle === true
    ? getToastTitle(type, params)
    : "";
}

export function resolveToastMessage(
  type = TOAST_TYPE_INFO,
  message = "",
  text = "",
  useDefaultMessage = false,
  params = {}
) {
  const explicit = normalizeToastText(
    message !== undefined && message !== null && String(message).trim()
      ? message
      : text,
    "",
    TOAST_MAX_TEXT_LENGTH
  );

  if (explicit) return explicit;

  const normalized = normalizeToastType(type);

  if (useDefaultMessage === true || normalized === TOAST_TYPE_LOADING) {
    return getToastMessage(normalized, params);
  }

  return "";
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getToastTextSnapshot() {
  const types = Array.isArray(TOAST_TYPES) ? [...TOAST_TYPES] : [];

  return {
    version: TOAST_TEXT_VERSION,

    i18nReady: canTranslate(),

    types,

    titleKeys: Object.fromEntries(
      types.map((type) => [type, getToastTitleKey(type)])
    ),

    messageKeys: Object.fromEntries(
      types.map((type) => [type, getToastMessageKey(type)])
    ),

    titles: Object.fromEntries(
      types.map((type) => [type, getToastTitle(type)])
    ),

    messages: Object.fromEntries(
      types.map((type) => [type, getToastMessage(type)])
    ),

    closeLabel: getToastCloseLabel(),
    dismissLabel: getToastDismissLabel(),
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
