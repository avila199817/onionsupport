 /* =========================================================
   Onion Support - App I18n
   Archivo: /src/app/i18n.js

   Responsabilidad:
   - Compat mínima de idioma.
   - El idioma inicial lo decide /src/preboot/theme.js.
   - Soporta ca, es, en.
   - Fallback: en.
   - Sin imports.
   - Sin storage.
   - Sin eventos.
   - Sin Router.
   - Sin Toast.
   - Sin fetch.
   - Sin rerender.
========================================================= */

export const I18N_VERSION = "simple";

const LANGS = ["ca", "es", "en"];
const FALLBACK_LANG = "en";

let currentLang = "";

function normalizeLang(value, fallback = FALLBACK_LANG) {
  const lang = String(value || "")
    .trim()
    .toLowerCase()
    .replace("_", "-")
    .split("-")[0];

  return LANGS.includes(lang) ? lang : fallback;
}

function getDocumentLang() {
  return normalizeLang(
    document.documentElement?.lang ||
      document.documentElement?.dataset?.locale ||
      FALLBACK_LANG
  );
}

function setDocumentLang(lang) {
  const clean = normalizeLang(lang);

  document.documentElement.lang = clean;
  document.documentElement.dir = "ltr";
  document.documentElement.dataset.locale = clean;
  document.documentElement.dataset.localeSource =
    document.documentElement.dataset.localeSource || "app";

  return clean;
}

function getI18nLang(I18n = null) {
  if (typeof I18n?.getLang === "function") {
    return normalizeLang(I18n.getLang());
  }

  if (typeof I18n?.getLanguage === "function") {
    return normalizeLang(I18n.getLanguage());
  }

  return normalizeLang(I18n?.lang || I18n?.language || "", "");
}

function setI18nLang(I18n = null, lang = FALLBACK_LANG) {
  const clean = normalizeLang(lang);

  if (typeof I18n?.setLang === "function") {
    I18n.setLang(clean);
    return clean;
  }

  if (typeof I18n?.setLanguage === "function") {
    I18n.setLanguage(clean);
    return clean;
  }

  if (typeof I18n?.changeLanguage === "function") {
    I18n.changeLanguage(clean);
    return clean;
  }

  if (I18n && typeof I18n === "object") {
    I18n.lang = clean;
    I18n.language = clean;
  }

  return clean;
}

function setCoreLang(AppCore = null, lang = FALLBACK_LANG) {
  const clean = normalizeLang(lang);

  if (AppCore?.state && typeof AppCore.state === "object") {
    AppCore.state.lang = clean;
    AppCore.state.language = clean;
    AppCore.state.locale = clean;
  }

  if (typeof AppCore?.setState === "function") {
    try {
      AppCore.setState(
        {
          lang: clean,
          language: clean,
          locale: clean,
        },
        {
          silent: true,
          emit: false,
        }
      );
    } catch {
      // Compat: si AppCore no acepta options, no pasa nada.
    }
  }

  return clean;
}

function resolveLang({ AppCore = null, I18n = null, lang = "" } = {}) {
  return normalizeLang(
    lang ||
      AppCore?.state?.lang ||
      AppCore?.state?.language ||
      AppCore?.state?.locale ||
      getI18nLang(I18n) ||
      getDocumentLang()
  );
}

function applyLang({ AppCore = null, I18n = null, lang = "" } = {}) {
  const clean = resolveLang({ AppCore, I18n, lang });

  currentLang = clean;

  setDocumentLang(clean);
  setI18nLang(I18n, clean);
  setCoreLang(AppCore, clean);

  return clean;
}

export function syncLangState(options = {}) {
  return applyLang(options);
}

export async function initI18n(options = {}) {
  const { I18n = null } = options;

  const lang = applyLang(options);

  if (typeof I18n?.init === "function") {
    await I18n.init({ lang });
  } else if (typeof I18n?.boot === "function") {
    await I18n.boot({ lang });
  } else if (typeof I18n?.start === "function") {
    await I18n.start({ lang });
  }

  applyLang({ ...options, lang });

  return true;
}

export async function changeLanguage(options = {}, second = "") {
  const payload =
    typeof options === "string"
      ? { lang: options }
      : {
          ...options,
          lang: options.lang || second,
        };

  return applyLang(payload);
}

export function rerenderCurrentRoute() {
  return false;
}

export function t(key = "", fallback = "", params = {}) {
  const I18n = arguments[0]?.I18n || null;

  if (I18n && typeof arguments[0] === "object") {
    const payload = arguments[0];
    return t(payload.key, payload.fallback, payload.params);
  }

  const text = String(fallback || key || "");

  return text.replace(/\{([^}]+)\}/g, (_match, name) => {
    return params?.[name.trim()] ?? "";
  });
}

export function getI18nSnapshot(options = {}) {
  const lang = resolveLang(options);

  return {
    version: I18N_VERSION,
    lang,
    language: lang,
    locale: lang,
    fallbackLang: FALLBACK_LANG,
    supportedLangs: LANGS,
  };
}

export function resetI18nRuntimeState() {
  currentLang = "";
  return getI18nSnapshot();
}

export default {
  I18N_VERSION,

  initI18n,
  syncLangState,
  changeLanguage,
  rerenderCurrentRoute,

  t,

  getI18nSnapshot,
  resetI18nRuntimeState,
};
