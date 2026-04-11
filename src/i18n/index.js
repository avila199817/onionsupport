/* =========================================================
   Onion SPA - i18n Core
   Archivo: src/i18n/index.js

   Responsabilidades:
   - registro de idiomas
   - traducción por key path
   - fallback robusto a español
   - cambio live de idioma
   - persistencia local
   - sincronización con AppCore
   - evento global app:lang:change
========================================================= */

import es from "./es.js";
import en from "./en.js";
import ca from "./ca.js";

import { AppCore } from "../core/index.js";

export const I18n = (() => {
  "use strict";

  /* =========================================================
     CONFIG
  ========================================================= */
  const STORAGE_KEY = "lang";

  const DEFAULT_LANG =
    AppCore?.config?.defaultLang ||
    "es";

  const dictionaries = {
    es,
    en,
    ca,
  };

  let currentLang = DEFAULT_LANG;

  /* =========================================================
     HELPERS
  ========================================================= */
  function hasLang(lang = "") {
    return Object.prototype.hasOwnProperty.call(
      dictionaries,
      lang
    );
  }

  function normalizeLang(lang = "") {
    const raw = String(lang || "")
      .trim()
      .toLowerCase();

    if (!raw) return DEFAULT_LANG;

    if (hasLang(raw)) return raw;

    const short = raw.split("-")[0];

    if (hasLang(short)) return short;

    return DEFAULT_LANG;
  }

  function getNested(obj, path = "") {
    if (!obj || !path) return undefined;

    return String(path)
      .split(".")
      .reduce((acc, key) => {
        if (
          acc &&
          Object.prototype.hasOwnProperty.call(acc, key)
        ) {
          return acc[key];
        }

        return undefined;
      }, obj);
  }

  function interpolate(text = "", params = {}) {
    return String(text).replace(
      /\{([a-zA-Z0-9_]+)\}/g,
      (_, key) =>
        params[key] !== undefined
          ? String(params[key])
          : `{${key}}`
    );
  }

  function safeStorageGet() {
    try {
      if (AppCore?.storage?.get) {
        return AppCore.storage.get(STORAGE_KEY);
      }

      return localStorage.getItem(
        `${AppCore?.config?.storagePrefix || "onion"}:${STORAGE_KEY}`
      );
    } catch {
      return null;
    }
  }

  function safeStorageSet(lang) {
    try {
      if (AppCore?.storage?.set) {
        AppCore.storage.set(STORAGE_KEY, lang);
        return;
      }

      localStorage.setItem(
        `${AppCore?.config?.storagePrefix || "onion"}:${STORAGE_KEY}`,
        lang
      );
    } catch {
      /* noop */
    }
  }

  function syncLangToDocument(lang) {
    try {
      document.documentElement.setAttribute("lang", lang);
    } catch {
      /* noop */
    }
  }

  function syncLangToState(lang) {
    try {
      if (typeof AppCore?.setState === "function") {
        AppCore.setState({ lang });
        return;
      }

      if (AppCore?.state) {
        AppCore.state.lang = lang;
      }
    } catch {
      /* noop */
    }
  }

  function emitLangChange(lang) {
    try {
      AppCore?.events?.emit?.(
        "app:lang:change",
        {
          lang,
        }
      );
    } catch {
      /* noop */
    }
  }

  /* =========================================================
     CORE
  ========================================================= */
  function getBrowserLang() {
    try {
      return normalizeLang(
        navigator.language ||
        navigator.userLanguage ||
        DEFAULT_LANG
      );
    } catch {
      return DEFAULT_LANG;
    }
  }

  function detectInitialLang() {
    const saved = safeStorageGet();

    if (saved) {
      return normalizeLang(saved);
    }

    return getBrowserLang();
  }

  function getLang() {
    return currentLang;
  }

  function setLang(lang = DEFAULT_LANG) {
    const nextLang = normalizeLang(lang);

    if (nextLang === currentLang) {
      syncLangToDocument(nextLang);
      syncLangToState(nextLang);
      return currentLang;
    }

    currentLang = nextLang;

    safeStorageSet(nextLang);
    syncLangToDocument(nextLang);
    syncLangToState(nextLang);
    emitLangChange(nextLang);

    return currentLang;
  }

  function t(key = "", params = {}, fallback = "") {
    const active =
      getNested(
        dictionaries[currentLang],
        key
      );

    const base =
      getNested(
        dictionaries[DEFAULT_LANG],
        key
      );

    const resolved =
      active ??
      base ??
      fallback ??
      key;

    return interpolate(resolved, params);
  }

  function exists(key = "") {
    return (
      getNested(
        dictionaries[currentLang],
        key
      ) !== undefined ||
      getNested(
        dictionaries[DEFAULT_LANG],
        key
      ) !== undefined
    );
  }

  function register(lang, data = {}) {
    const code = normalizeLang(lang);

    if (!code || typeof data !== "object" || data === null) {
      return false;
    }

    dictionaries[code] = data;
    return true;
  }

  function getAvailable() {
    return Object.keys(dictionaries);
  }

  function getDictionary(lang = currentLang) {
    const code = normalizeLang(lang);
    return dictionaries[code] || dictionaries[DEFAULT_LANG] || {};
  }

  function boot() {
    const initial = detectInitialLang();

    currentLang = normalizeLang(initial);

    syncLangToDocument(currentLang);
    syncLangToState(currentLang);

    return currentLang;
  }

  /* =========================================================
     INIT
  ========================================================= */
  boot();

  return {
    boot,
    t,
    setLang,
    getLang,
    exists,
    register,
    getAvailable,
    getDictionary,
  };
})();
