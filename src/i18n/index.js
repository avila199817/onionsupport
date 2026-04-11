/* =========================================================
   Onion SPA - i18n Core
   Archivo: src/i18n/index.js

   Responsabilidades:
   - registro de idiomas
   - traducción por key path
   - fallback robusto a español
   - cambio live de idioma
   - persistencia local
   - sincronización opcional con AppCore
   - evento global app:lang:change
   - helpers para refresco de UI
   - evitar dependencia circular con Core
========================================================= */

import es from "./es.js";
import en from "./en.js";
import ca from "./ca.js";

export const I18n = (() => {
  "use strict";

  /* =========================================================
     CONFIG
  ========================================================= */
  const STORAGE_KEY = "lang";
  const FALLBACK_LANG = "es";

  const dictionaries = {
    es,
    en,
    ca,
  };

  let coreRef = null;
  let currentLang = FALLBACK_LANG;

  /* =========================================================
     CORE REF
  ========================================================= */
  function getCore() {
    return coreRef;
  }

  function bindCore(AppCore) {
    coreRef = AppCore || null;
    return api;
  }

  function getDefaultLang() {
    return (
      getCore()?.config?.defaultLang ||
      FALLBACK_LANG
    );
  }

  function getStoragePrefix() {
    return (
      getCore()?.config?.storagePrefix ||
      "onion"
    );
  }

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

    const defaultLang = getDefaultLang();

    if (!raw) return defaultLang;

    if (hasLang(raw)) return raw;

    const short = raw.split("-")[0];

    if (hasLang(short)) return short;

    return defaultLang;
  }

  function getNested(obj, path = "") {
    if (!obj || !path) return undefined;

    return String(path)
      .split(".")
      .reduce((acc, key) => {
        if (
          acc &&
          Object.prototype.hasOwnProperty.call(
            acc,
            key
          )
        ) {
          return acc[key];
        }

        return undefined;
      }, obj);
  }

  function interpolate(
    text = "",
    params = {}
  ) {
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
      const core = getCore();

      if (core?.storage?.get) {
        return core.storage.get(
          STORAGE_KEY
        );
      }

      if (
        typeof localStorage !==
        "undefined"
      ) {
        return localStorage.getItem(
          `${getStoragePrefix()}:${STORAGE_KEY}`
        );
      }

      return null;
    } catch {
      return null;
    }
  }

  function safeStorageSet(lang) {
    try {
      const core = getCore();

      if (core?.storage?.set) {
        core.storage.set(
          STORAGE_KEY,
          lang
        );
        return;
      }

      if (
        typeof localStorage !==
        "undefined"
      ) {
        localStorage.setItem(
          `${getStoragePrefix()}:${STORAGE_KEY}`,
          lang
        );
      }
    } catch {
      /* noop */
    }
  }

  function syncLangToDocument(lang) {
    try {
      if (
        typeof document ===
        "undefined"
      ) {
        return;
      }

      document.documentElement.setAttribute(
        "lang",
        lang
      );
    } catch {
      /* noop */
    }
  }

  function syncLangToState(lang) {
    try {
      const core = getCore();

      if (
        typeof core?.setState ===
        "function"
      ) {
        core.setState({ lang });
        return;
      }

      if (core?.state) {
        core.state.lang = lang;
      }
    } catch {
      /* noop */
    }
  }

  function emitLangChange(lang) {
    try {
      const core = getCore();

      core?.events?.emit?.(
        "app:lang:change",
        {
          lang,
          dictionary:
            getDictionary(lang),
        }
      );
    } catch {
      /* noop */
    }
  }

  function updateDOM(root = document) {
    try {
      if (
        typeof document ===
        "undefined"
      ) {
        return;
      }

      const scope =
        root instanceof Element ||
        root instanceof Document
          ? root
          : document;

      scope
        .querySelectorAll(
          "[data-i18n]"
        )
        .forEach((node) => {
          const key =
            node.getAttribute(
              "data-i18n"
            );

          if (!key) return;

          node.textContent = t(key);
        });

      scope
        .querySelectorAll(
          "[data-i18n-html]"
        )
        .forEach((node) => {
          const key =
            node.getAttribute(
              "data-i18n-html"
            );

          if (!key) return;

          node.innerHTML = t(key);
        });

      scope
        .querySelectorAll(
          "[data-i18n-placeholder]"
        )
        .forEach((node) => {
          const key =
            node.getAttribute(
              "data-i18n-placeholder"
            );

          if (!key) return;

          node.setAttribute(
            "placeholder",
            t(key)
          );
        });

      scope
        .querySelectorAll(
          "[data-i18n-title]"
        )
        .forEach((node) => {
          const key =
            node.getAttribute(
              "data-i18n-title"
            );

          if (!key) return;

          node.setAttribute(
            "title",
            t(key)
          );
        });

      scope
        .querySelectorAll(
          "[data-i18n-aria-label]"
        )
        .forEach((node) => {
          const key =
            node.getAttribute(
              "data-i18n-aria-label"
            );

          if (!key) return;

          node.setAttribute(
            "aria-label",
            t(key)
          );
        });
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
          getDefaultLang()
      );
    } catch {
      return getDefaultLang();
    }
  }

  function detectInitialLang() {
    const saved =
      safeStorageGet();

    if (saved) {
      return normalizeLang(saved);
    }

    return getBrowserLang();
  }

  function getLang() {
    return currentLang;
  }

  function setLang(
    lang = getDefaultLang(),
    options = {}
  ) {
    const {
      force = false,
      silent = false,
      updateUi = true,
    } = options || {};

    const nextLang =
      normalizeLang(lang);

    const changed =
      nextLang !== currentLang;

    currentLang = nextLang;

    safeStorageSet(nextLang);
    syncLangToDocument(nextLang);
    syncLangToState(nextLang);

    if (
      updateUi &&
      typeof document !==
        "undefined"
    ) {
      updateDOM(document);
    }

    if (
      !silent &&
      (changed || force)
    ) {
      emitLangChange(nextLang);
    }

    return currentLang;
  }

  function t(
    key = "",
    params = {},
    fallback = ""
  ) {
    const defaultLang =
      getDefaultLang();

    const active = getNested(
      dictionaries[currentLang],
      key
    );

    const base = getNested(
      dictionaries[defaultLang],
      key
    );

    const fallbackBase =
      getNested(
        dictionaries[FALLBACK_LANG],
        key
      );

    const resolved =
      active ??
      base ??
      fallbackBase ??
      fallback ??
      key;

    return interpolate(
      resolved,
      params
    );
  }

  function exists(key = "") {
    const defaultLang =
      getDefaultLang();

    return (
      getNested(
        dictionaries[currentLang],
        key
      ) !== undefined ||
      getNested(
        dictionaries[defaultLang],
        key
      ) !== undefined ||
      getNested(
        dictionaries[FALLBACK_LANG],
        key
      ) !== undefined
    );
  }

  function register(
    lang,
    data = {}
  ) {
    const rawCode = String(
      lang || ""
    )
      .trim()
      .toLowerCase();

    if (
      !rawCode ||
      typeof data !== "object" ||
      data === null
    ) {
      return false;
    }

    dictionaries[rawCode] = data;
    return true;
  }

  function getAvailable() {
    return Object.keys(
      dictionaries
    );
  }

  function getDictionary(
    lang = currentLang
  ) {
    const code =
      normalizeLang(lang);

    const defaultLang =
      getDefaultLang();

    return (
      dictionaries[code] ||
      dictionaries[defaultLang] ||
      dictionaries[FALLBACK_LANG] ||
      {}
    );
  }

  function boot(options = {}) {
    const {
      updateUi = true,
      emit = false,
    } = options || {};

    const initial =
      detectInitialLang();

    currentLang =
      normalizeLang(initial);

    syncLangToDocument(
      currentLang
    );

    syncLangToState(
      currentLang
    );

    if (
      updateUi &&
      typeof document !==
        "undefined"
    ) {
      updateDOM(document);
    }

    if (emit) {
      emitLangChange(
        currentLang
      );
    }

    return currentLang;
  }

  /* =========================================================
     INIT
  ========================================================= */
  if (
    typeof document !==
    "undefined"
  ) {
    boot({
      updateUi: true,
      emit: false,
    });
  }

  const api = {
    bindCore,
    boot,
    t,
    setLang,
    getLang,
    exists,
    register,
    getAvailable,
    getDictionary,
    updateDOM,
  };

  return api;
})();
