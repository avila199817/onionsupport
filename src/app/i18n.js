/* =========================================================
   Onion Support - App I18n Bridge
   Archivo: /src/app/i18n.js

   Responsabilidad:
   - Bridge mínimo de idioma para la app.
   - Sin diccionarios propios.
   - Sin duplicar src/i18n/index.js.
   - Sin storage.
   - Sin eventos.
   - Sin Router.
   - Sin Toast.
   - Sin fetch.
   - Sin rerender propio.
   - Sin innerHTML.
========================================================= */

import {
  UI_CONSTANTS,
} from "./constants.js";

export const I18N_VERSION = "app.i18n.v3";

const DEFAULT_SUPPORTED_LANGS = Object.freeze(["es", "ca", "en"]);
const BASE_FALLBACK_LANG = "es";

const SUPPORTED_LANGS = Object.freeze(
  normalizeSupportedLangs(UI_CONSTANTS?.supportedLangs)
);

const FALLBACK_LANG = normalizeLang(
  UI_CONSTANTS?.fallbackLang || UI_CONSTANTS?.defaultLang || BASE_FALLBACK_LANG,
  BASE_FALLBACK_LANG
);

let currentLang = "";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function safeCall(fn = null, context = null, ...args) {
  try {
    return isFunction(fn) ? fn.apply(context, args) : null;
  } catch {
    return null;
  }
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

/* =========================================================
   LANG NORMALIZATION
========================================================= */

function normalizeLangToken(value = "") {
  const raw = cleanText(value, "")
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  if (!raw) return "";

  return raw.split("-").filter(Boolean).join("-");
}

function normalizeSupportedLangs(values = []) {
  const input = Array.isArray(values) && values.length
    ? values
    : DEFAULT_SUPPORTED_LANGS;

  const langs = [
    ...new Set(
      input
        .map(normalizeLangToken)
        .map((lang) => lang.split("-")[0] || lang)
        .filter(Boolean)
    ),
  ];

  if (!langs.includes(BASE_FALLBACK_LANG)) {
    langs.unshift(BASE_FALLBACK_LANG);
  }

  return langs.length ? langs : [...DEFAULT_SUPPORTED_LANGS];
}

function normalizeLang(value = "", fallback = FALLBACK_LANG || BASE_FALLBACK_LANG) {
  const raw = normalizeLangToken(value);
  const cleanFallback = normalizeLangToken(fallback) || BASE_FALLBACK_LANG;
  const short = raw.split("-")[0];

  if (SUPPORTED_LANGS.includes(raw)) return raw;
  if (SUPPORTED_LANGS.includes(short)) return short;

  if (SUPPORTED_LANGS.includes(cleanFallback)) return cleanFallback;

  const fallbackShort = cleanFallback.split("-")[0];

  if (SUPPORTED_LANGS.includes(fallbackShort)) return fallbackShort;

  return BASE_FALLBACK_LANG;
}

function interpolate(value = "", params = {}) {
  const source = redact(value);
  const data = isObject(params) ? params : {};

  return source.replace(
    /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}|\{\s*([a-zA-Z0-9_.-]+)\s*\}/g,
    (match, keyA, keyB) => {
      const key = keyA || keyB;
      const replacement = data[key];

      return replacement === undefined || replacement === null
        ? match
        : redact(replacement);
    }
  );
}

/* =========================================================
   DOCUMENT LANG
========================================================= */

function getDocumentLang() {
  if (!isBrowser()) return FALLBACK_LANG;

  return normalizeLang(
    document.documentElement?.dataset?.locale ||
      document.documentElement?.lang ||
      FALLBACK_LANG
  );
}

function setDocumentLang(lang = FALLBACK_LANG) {
  const clean = normalizeLang(lang);

  if (!isBrowser()) return clean;

  try {
    document.documentElement.lang = clean;
    document.documentElement.dir = "ltr";
    document.documentElement.dataset.locale = clean;
    document.documentElement.dataset.localeSource = "app";
    document.documentElement.dataset.localeFallback = FALLBACK_LANG;
  } catch {
    // noop
  }

  return clean;
}

/* =========================================================
   CORE LANG
========================================================= */

function getCoreLang(AppCore = null) {
  return normalizeLang(
    AppCore?.state?.lang ||
      AppCore?.state?.language ||
      AppCore?.state?.locale ||
      "",
    ""
  );
}

function setCoreLang(AppCore = null, lang = FALLBACK_LANG) {
  const clean = normalizeLang(lang);

  if (AppCore?.state && typeof AppCore.state === "object") {
    AppCore.state.lang = clean;
    AppCore.state.language = clean;
    AppCore.state.locale = clean;
  }

  if (isFunction(AppCore?.setState)) {
    safeCall(
      AppCore.setState,
      AppCore,
      {
        lang: clean,
        language: clean,
        locale: clean,
      },
      {
        source: "app.i18n",
        silent: true,
        emit: false,
      }
    );
  }

  return clean;
}

/* =========================================================
   I18N MODULE LANG
========================================================= */

function getI18nLang(I18n = null) {
  if (!I18n || I18n === api) return "";

  return normalizeLang(
    safeCall(I18n.getLang, I18n) ||
      safeCall(I18n.getLocale, I18n) ||
      safeCall(I18n.getLanguage, I18n) ||
      "",
    ""
  );
}

function setI18nLang(I18n = null, lang = FALLBACK_LANG, options = {}) {
  const clean = normalizeLang(lang);

  if (!I18n || I18n === api) return clean;

  const payload = isObject(options) ? options : {};

  if (isFunction(I18n.setLang)) {
    safeCall(I18n.setLang, I18n, clean, payload);
    return clean;
  }

  if (isFunction(I18n.setLocale)) {
    safeCall(I18n.setLocale, I18n, clean, payload);
    return clean;
  }

  if (isFunction(I18n.setLanguage)) {
    safeCall(I18n.setLanguage, I18n, clean, payload);
    return clean;
  }

  if (isFunction(I18n.changeLanguage)) {
    safeCall(I18n.changeLanguage, I18n, clean, payload);
    return clean;
  }

  return clean;
}

/* =========================================================
   RESOLVE / APPLY
========================================================= */

function resolveLang({
  AppCore = null,
  core = null,
  I18n = null,
  lang = "",
  locale = "",
  language = "",
} = {}) {
  return normalizeLang(
    lang ||
      locale ||
      language ||
      getCoreLang(AppCore || core) ||
      getI18nLang(I18n) ||
      getDocumentLang(),
    FALLBACK_LANG
  );
}

function applyLang(options = {}) {
  const payload = isObject(options) ? options : {};
  const AppCore = payload.AppCore || payload.core || null;
  const I18n = payload.I18n || null;
  const clean = resolveLang(payload);

  currentLang = clean;

  setDocumentLang(clean);
  setCoreLang(AppCore, clean);
  setI18nLang(I18n, clean, {
    updateDOM: payload.updateDOM === true,
    updateUi: payload.updateUi === true,
  });

  return clean;
}

/* =========================================================
   PUBLIC API
========================================================= */

export function syncLangState(options = {}) {
  return applyLang(options);
}

export async function initI18n(options = {}) {
  const payload = isObject(options) ? options : {};
  const I18n = payload.I18n || null;
  const AppCore = payload.AppCore || payload.core || null;
  const lang = applyLang(payload);

  if (I18n && I18n !== api && isFunction(I18n.bindCore)) {
    safeCall(I18n.bindCore, I18n, AppCore);
  }

  if (I18n && I18n !== api && isFunction(I18n.init)) {
    await I18n.init({
      ...payload,
      lang,
      locale: lang,
      language: lang,
      updateDOM: payload.updateDOM === true,
      updateUi: payload.updateUi === true,
    });
  }

  applyLang({
    ...payload,
    lang,
  });

  return lang;
}

export function changeLanguage(options = {}, second = "") {
  const payload = typeof options === "string"
    ? {
        lang: options,
      }
    : {
        ...(isObject(options) ? options : {}),
        lang: options.lang || options.locale || options.language || second,
      };

  return applyLang(payload);
}

export function t(input = "", fallback = "", params = {}) {
  if (isObject(input)) {
    const payload = input;
    const I18n = payload.I18n || null;
    const key = cleanText(payload.key, "");
    const finalFallback = payload.fallback || key || "";

    if (I18n && I18n !== api && isFunction(I18n.t)) {
      const value = safeCall(
        I18n.t,
        I18n,
        key,
        payload.params || {},
        finalFallback
      );

      if (value && value !== key) {
        return redact(value);
      }
    }

    return interpolate(finalFallback, payload.params || {});
  }

  return interpolate(fallback || input || "", params);
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getI18nSnapshot(options = {}) {
  const payload = isObject(options) ? options : {};
  const lang = resolveLang({
    ...payload,
    lang: currentLang || payload.lang || payload.locale || payload.language || "",
  });

  return {
    version: I18N_VERSION,

    lang,
    language: lang,
    locale: lang,

    fallbackLang: FALLBACK_LANG,
    supportedLangs: [...SUPPORTED_LANGS],

    documentLang: getDocumentLang(),
    coreLang: getCoreLang(payload.AppCore || payload.core || null) || null,
    i18nLang: getI18nLang(payload.I18n || null) || null,

    policy: {
      bridgeOnly: true,
      noOwnDictionaries: true,
      doesNotDuplicateSrcI18n: true,
      noStorage: true,
      noEvents: true,
      noRouter: true,
      noToast: true,
      noFetch: true,
      noOwnRerender: true,
      noInnerHTML: true,
      baseFallbackEs: true,
      redactedSnapshot: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export const api = {
  I18N_VERSION,
  version: I18N_VERSION,

  initI18n,
  syncLangState,
  changeLanguage,

  t,

  getI18nSnapshot,
};

export default api;
