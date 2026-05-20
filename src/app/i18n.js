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

export const I18N_VERSION = "app.i18n.v2";

const SUPPORTED_LANGS = Object.freeze(
  Array.isArray(UI_CONSTANTS.supportedLangs)
    ? [...UI_CONSTANTS.supportedLangs]
    : ["es", "ca", "en"]
);

const FALLBACK_LANG = UI_CONSTANTS.fallbackLang || "es";

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
  const output = String(value ?? "").trim();
  return output || fallback;
}

function normalizeLang(value = "", fallback = FALLBACK_LANG) {
  const raw = cleanText(value, "")
    .toLowerCase()
    .replace("_", "-");

  const short = raw.split("-")[0];

  if (SUPPORTED_LANGS.includes(raw)) return raw;
  if (SUPPORTED_LANGS.includes(short)) return short;

  return fallback;
}

function interpolate(value = "", params = {}) {
  const source = String(value ?? "");
  const data = isObject(params) ? params : {};

  return source.replace(
    /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}|\{\s*([a-zA-Z0-9_.-]+)\s*\}/g,
    (match, keyA, keyB) => {
      const key = keyA || keyB;
      const replacement = data[key];

      return replacement === undefined || replacement === null
        ? match
        : String(replacement);
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

  document.documentElement.lang = clean;
  document.documentElement.dir = "ltr";
  document.documentElement.dataset.locale = clean;
  document.documentElement.dataset.localeSource = "app";

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
    AppCore.setState(
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
  if (isFunction(I18n?.getLang)) {
    return normalizeLang(I18n.getLang(), "");
  }

  if (isFunction(I18n?.getLocale)) {
    return normalizeLang(I18n.getLocale(), "");
  }

  if (isFunction(I18n?.getLanguage)) {
    return normalizeLang(I18n.getLanguage(), "");
  }

  return "";
}

function setI18nLang(I18n = null, lang = FALLBACK_LANG, options = {}) {
  const clean = normalizeLang(lang);

  if (!I18n || I18n === api) return clean;

  if (isFunction(I18n.setLang)) {
    I18n.setLang(clean, options);
    return clean;
  }

  if (isFunction(I18n.setLocale)) {
    I18n.setLocale(clean, options);
    return clean;
  }

  if (isFunction(I18n.setLanguage)) {
    I18n.setLanguage(clean, options);
    return clean;
  }

  if (isFunction(I18n.changeLanguage)) {
    I18n.changeLanguage(clean, options);
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
  const AppCore = options.AppCore || options.core || null;
  const I18n = options.I18n || null;
  const clean = resolveLang(options);

  currentLang = clean;

  setDocumentLang(clean);
  setCoreLang(AppCore, clean);
  setI18nLang(I18n, clean, {
    updateDOM: options.updateDOM === true,
    updateUi: options.updateUi === true,
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
  const I18n = options.I18n || null;
  const lang = applyLang(options);

  if (I18n && I18n !== api && isFunction(I18n.bindCore)) {
    I18n.bindCore(options.AppCore || options.core || null);
  }

  if (I18n && I18n !== api && isFunction(I18n.init)) {
    await I18n.init({
      ...options,
      lang,
      locale: lang,
      language: lang,
      updateDOM: options.updateDOM === true,
      updateUi: options.updateUi === true,
    });
  }

  applyLang({
    ...options,
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
        ...options,
        lang: options.lang || options.locale || options.language || second,
      };

  return applyLang(payload);
}

export function t(input = "", fallback = "", params = {}) {
  if (isObject(input)) {
    const payload = input;
    const I18n = payload.I18n || null;

    if (I18n && I18n !== api && isFunction(I18n.t)) {
      const value = I18n.t(
        payload.key,
        payload.params || {},
        payload.fallback || ""
      );

      if (value && value !== payload.key) {
        return String(value);
      }
    }

    return interpolate(
      payload.fallback || payload.key || "",
      payload.params || {}
    );
  }

  return interpolate(fallback || input || "", params);
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getI18nSnapshot(options = {}) {
  const lang = resolveLang({
    ...options,
    lang: currentLang || options.lang || options.locale || options.language || "",
  });

  return {
    version: I18N_VERSION,
    lang,
    language: lang,
    locale: lang,
    fallbackLang: FALLBACK_LANG,
    supportedLangs: [...SUPPORTED_LANGS],
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
