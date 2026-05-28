/* =========================================================
   Onion Support - App I18n Bridge
   Archivo: /src/app/i18n.js

   Responsabilidad:
   - Bridge mínimo de idioma para la app.
   - Idioma activo/base forzado: es.
   - Sin detección de navegador, usuario, backend ni storage.
   - Sin diccionarios propios ni duplicar src/i18n/index.js.
   - Sin eventos, Router, Toast, fetch, rerender propio ni innerHTML.
========================================================= */

export const I18N_VERSION = "app.i18n.v5";

const BASE_LANG = "es";
const SUPPORTED_LANGS = Object.freeze(["es", "ca", "en"]);

let currentLang = BASE_LANG;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function safeCall(fn = null, context = null, ...args) {
  try {
    return isFunction(fn) ? fn.apply(context, args) : null;
  } catch {
    return null;
  }
}

function normalizeLang() {
  return BASE_LANG;
}

/* =========================================================
   INTERPOLATION
========================================================= */

function interpolate(value = "", params = {}) {
  const source = redact(value);
  const data = isPlainObject(params) ? params : {};

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
   LANG APPLY
========================================================= */

function setLocaleDataset(element = null) {
  if (!element) return false;

  try {
    element.dataset.locale = BASE_LANG;
    element.dataset.localeSource = "base";
    element.dataset.localeFallback = BASE_LANG;
    element.dataset.localeSupported = SUPPORTED_LANGS.join(" ");
    return true;
  } catch {
    return false;
  }
}

function setDocumentLang() {
  currentLang = BASE_LANG;

  if (!isBrowser()) return BASE_LANG;

  try {
    document.documentElement.lang = BASE_LANG;
    document.documentElement.dir = "ltr";

    setLocaleDataset(document.documentElement);
    setLocaleDataset(document.body);
  } catch {
    // noop
  }

  return BASE_LANG;
}

function setCoreLang(AppCore = null) {
  const patch = {
    lang: BASE_LANG,
    language: BASE_LANG,
    locale: BASE_LANG,
  };

  if (isFunction(AppCore?.setState)) {
    safeCall(AppCore.setState, AppCore, patch, {
      source: "app.i18n",
      silent: true,
      emit: false,
    });

    return BASE_LANG;
  }

  if (isPlainObject(AppCore?.state)) {
    try {
      Object.assign(AppCore.state, patch);
    } catch {
      // noop
    }
  }

  return BASE_LANG;
}

function setI18nLang(I18n = null, options = {}) {
  if (!I18n || I18n === api) return BASE_LANG;

  const payload = isPlainObject(options) ? options : {};

  for (const method of ["setLang", "setLocale", "setLanguage", "changeLanguage"]) {
    if (isFunction(I18n[method])) {
      safeCall(I18n[method], I18n, BASE_LANG, payload);
      return BASE_LANG;
    }
  }

  return BASE_LANG;
}

function applyBaseLang(options = {}) {
  const payload = isPlainObject(options) ? options : {};
  const AppCore = payload.AppCore || payload.core || null;
  const I18n = payload.I18n || null;

  setDocumentLang();
  setCoreLang(AppCore);
  setI18nLang(I18n, {
    updateDOM: payload.updateDOM === true,
    updateUi: payload.updateUi === true,
  });

  return BASE_LANG;
}

/* =========================================================
   PUBLIC API
========================================================= */

export function syncLangState(options = {}) {
  return applyBaseLang(options);
}

export async function initI18n(options = {}) {
  const payload = isPlainObject(options) ? options : {};
  const AppCore = payload.AppCore || payload.core || null;
  const I18n = payload.I18n || null;

  applyBaseLang(payload);

  if (I18n && I18n !== api && isFunction(I18n.bindCore)) {
    safeCall(I18n.bindCore, I18n, AppCore);
  }

  if (I18n && I18n !== api && isFunction(I18n.init)) {
    await I18n.init({
      ...payload,
      lang: BASE_LANG,
      locale: BASE_LANG,
      language: BASE_LANG,
      updateDOM: payload.updateDOM === true,
      updateUi: payload.updateUi === true,
    });
  }

  /*
    Segunda pasada intencionada:
    garantiza que ningún init interno pise el contrato base es.
  */
  applyBaseLang(payload);

  return BASE_LANG;
}

export function changeLanguage(options = {}) {
  void options;
  return applyBaseLang();
}

export function t(input = "", fallback = "", params = {}) {
  if (isPlainObject(input)) {
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

function getDocumentLang() {
  if (!isBrowser()) return BASE_LANG;
  return cleanText(document.documentElement?.lang, BASE_LANG);
}

function getCoreLang(AppCore = null) {
  return cleanText(
    AppCore?.state?.lang ||
      AppCore?.state?.language ||
      AppCore?.state?.locale,
    ""
  );
}

function getI18nLang(I18n = null) {
  if (!I18n || I18n === api) return "";

  return cleanText(
    safeCall(I18n.getLang, I18n) ||
      safeCall(I18n.getLocale, I18n) ||
      safeCall(I18n.getLanguage, I18n),
    ""
  );
}

export function getI18nSnapshot(options = {}) {
  const payload = isPlainObject(options) ? options : {};
  const AppCore = payload.AppCore || payload.core || null;
  const I18n = payload.I18n || null;

  return {
    version: I18N_VERSION,

    lang: currentLang,
    language: currentLang,
    locale: currentLang,

    fallbackLang: BASE_LANG,
    supportedLangs: [...SUPPORTED_LANGS],

    documentLang: getDocumentLang(),
    coreLang: getCoreLang(AppCore) || null,
    i18nLang: getI18nLang(I18n) || null,

    policy: {
      bridgeOnly: true,
      forcedBaseEs: true,
      noBrowserDetection: true,
      noUserPreferenceLanguage: true,
      noBackendLanguageOverride: true,
      noOwnDictionaries: true,
      doesNotDuplicateSrcI18n: true,
      noStorage: true,
      noEvents: true,
      noRouter: true,
      noToast: true,
      noFetch: true,
      noOwnRerender: true,
      noInnerHTML: true,
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
