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

export const I18N_VERSION = "app-bridge-1";

const SUPPORTED_LANGS = Object.freeze(["ca", "es", "en"]);
const FALLBACK_LANG = "en";

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

function isFn(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function normalizeLang(value = "", fallback = FALLBACK_LANG) {
  const raw = text(value, "")
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
   LANG SOURCES
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
  if (!isBrowser()) return normalizeLang(lang);

  const clean = normalizeLang(lang);

  try {
    document.documentElement.lang = clean;
    document.documentElement.dir = "ltr";
    document.documentElement.dataset.locale = clean;

    if (!document.documentElement.dataset.localeSource) {
      document.documentElement.dataset.localeSource = "app";
    }
  } catch {
    // noop
  }

  return clean;
}

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

  try {
    if (AppCore?.state && typeof AppCore.state === "object") {
      AppCore.state.lang = clean;
      AppCore.state.language = clean;
      AppCore.state.locale = clean;
    }
  } catch {
    // noop
  }

  try {
    if (isFn(AppCore?.setState)) {
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
  } catch {
    // noop
  }

  return clean;
}

function getI18nLang(I18n = null) {
  if (isFn(I18n?.getLang)) {
    return normalizeLang(I18n.getLang(), "");
  }

  if (isFn(I18n?.getLocale)) {
    return normalizeLang(I18n.getLocale(), "");
  }

  if (isFn(I18n?.getLanguage)) {
    return normalizeLang(I18n.getLanguage(), "");
  }

  return normalizeLang(I18n?.lang || I18n?.language || I18n?.locale || "", "");
}

function setI18nLang(I18n = null, lang = FALLBACK_LANG, options = {}) {
  const clean = normalizeLang(lang);

  if (!I18n || I18n === api) return clean;

  try {
    if (isFn(I18n.setLang)) {
      I18n.setLang(clean, options);
      return clean;
    }

    if (isFn(I18n.setLocale)) {
      I18n.setLocale(clean, options);
      return clean;
    }

    if (isFn(I18n.setLanguage)) {
      I18n.setLanguage(clean, options);
      return clean;
    }

    if (isFn(I18n.changeLanguage)) {
      I18n.changeLanguage(clean, options);
      return clean;
    }

    if (typeof I18n === "object") {
      I18n.lang = clean;
      I18n.language = clean;
      I18n.locale = clean;
    }
  } catch {
    // noop
  }

  return clean;
}

function resolveLang({ AppCore = null, I18n = null, lang = "" } = {}) {
  return normalizeLang(
    lang ||
      getCoreLang(AppCore) ||
      getI18nLang(I18n) ||
      getDocumentLang()
  );
}

function applyLang(options = {}) {
  const clean = resolveLang(options);

  currentLang = clean;

  setDocumentLang(clean);
  setCoreLang(options.AppCore || options.core || null, clean);
  setI18nLang(options.I18n || null, clean, {
    root: options.root || null,
    updateDOM: options.updateDOM,
    updateUi: options.updateUi,
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

  if (I18n && I18n !== api) {
    try {
      if (isFn(I18n.init)) {
        await I18n.init({
          ...options,
          lang,
        });
      } else if (isFn(I18n.boot)) {
        await I18n.boot({
          ...options,
          lang,
        });
      } else if (isFn(I18n.start)) {
        await I18n.start({
          ...options,
          lang,
        });
      }
    } catch {
      // noop
    }
  }

  applyLang({
    ...options,
    lang,
  });

  return true;
}

export async function changeLanguage(options = {}, second = "") {
  const payload = typeof options === "string"
    ? {
        lang: options,
      }
    : {
        ...options,
        lang: options.lang || options.locale || second,
      };

  return applyLang(payload);
}

export function rerenderCurrentRoute() {
  return false;
}

export function t(input = "", fallback = "", params = {}) {
  if (isObject(input)) {
    const payload = input;
    const I18n = payload.I18n || null;

    if (I18n && I18n !== api) {
      try {
        const value = isFn(I18n.t)
          ? I18n.t(payload.key, payload.params || {}, payload.fallback || "")
          : isFn(I18n.translate)
            ? I18n.translate(payload.key, payload.params || {}, payload.fallback || "")
            : "";

        if (value && value !== payload.key) {
          return String(value);
        }
      } catch {
        // fallback abajo
      }
    }

    return interpolate(payload.fallback || payload.key || "", payload.params || {});
  }

  return interpolate(fallback || input || "", params);
}

export function getI18nSnapshot(options = {}) {
  const lang = resolveLang({
    ...options,
    lang: currentLang || options.lang || options.locale || "",
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

export function resetI18nRuntimeState() {
  currentLang = "";
  return getI18nSnapshot();
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
  rerenderCurrentRoute,

  t,

  getI18nSnapshot,
  resetI18nRuntimeState,
};

export default api;
