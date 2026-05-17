/* =========================================================
   Onion Support - Preboot
   Archivo: /src/preboot/theme.js

   Responsabilidad única:
   - Aplicar tema inicial según navegador/sistema.
   - Aplicar idioma inicial según navegador.
   - Soportar solo: ca, es, en.
   - Fallback de idioma: en.
   - Sin storage.
   - Sin API.
   - Sin auth.
   - Sin router.
   - Sin llamadas HTTP.
========================================================= */

(() => {
  "use strict";

  const SUPPORTED_LOCALES = ["ca", "es", "en"];
  const FALLBACK_LOCALE = "en";

  const THEME_COLORS = {
    dark: "#0a0c11",
    light: "#ffffff",
  };

  const TEXTS = {
    ca: {
      skip: "Saltar al contingut principal",
      loader: "Carregant sessió...",
      subtext: "Preparant el panell",
    },
    es: {
      skip: "Saltar al contenido principal",
      loader: "Cargando sesión...",
      subtext: "Preparando el panel",
    },
    en: {
      skip: "Skip to main content",
      loader: "Loading session...",
      subtext: "Preparing panel",
    },
  };

  function getSystemTheme() {
    try {
      return window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } catch {
      return "dark";
    }
  }

  function normalizeLocale(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace("_", "-")
      .split("-")[0];
  }

  function getBrowserLocale() {
    const languages =
      navigator.languages && navigator.languages.length
        ? navigator.languages
        : [navigator.language];

    for (const language of languages) {
      const locale = normalizeLocale(language);

      if (SUPPORTED_LOCALES.includes(locale)) {
        return {
          locale,
          source: "browser",
        };
      }
    }

    return {
      locale: FALLBACK_LOCALE,
      source: "fallback",
    };
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);

    if (element) {
      element.textContent = value;
    }
  }

  function applyLoaderText(locale) {
    const text = TEXTS[locale] || TEXTS[FALLBACK_LOCALE];

    setText("[data-skip-link]", text.skip);
    setText("[data-loader-text]", text.loader);
    setText("[data-loader-subtext]", text.subtext);
  }

  function setMeta(name, value) {
    const meta = document.querySelector(`meta[name="${name}"]:not([media])`);

    if (meta) {
      meta.setAttribute("content", value);
    }
  }

  function applyThemeTo(element, theme) {
    if (!element) return;

    element.classList.remove("no-js", "theme-dark", "theme-light");
    element.classList.add("js", `theme-${theme}`);

    element.dataset.theme = theme;
    element.dataset.themeMode = "system";
    element.dataset.themeSource = "browser";
    element.dataset.systemTheme = theme;
    element.dataset.themeReady = "true";
  }

  function applyLocaleTo(element, locale, source) {
    if (!element) return;

    element.lang = locale;
    element.dir = "ltr";

    element.dataset.locale = locale;
    element.dataset.localeSource = source;
    element.dataset.localeFallback = FALLBACK_LOCALE;
    element.dataset.localeSupported = SUPPORTED_LOCALES.join(" ");
  }

  function applyPreboot() {
    const theme = getSystemTheme();
    const { locale, source } = getBrowserLocale();

    applyThemeTo(document.documentElement, theme);
    applyLocaleTo(document.documentElement, locale, source);

    if (document.body) {
      applyThemeTo(document.body, theme);
      applyLocaleTo(document.body, locale, source);
      applyLoaderText(locale);
    }

    setMeta("theme-color", THEME_COLORS[theme]);
    setMeta("msapplication-TileColor", THEME_COLORS[theme]);

    window.__ONION_PREBOOT__ = Object.freeze({
      theme,
      themeMode: "system",
      themeSource: "browser",
      locale,
      localeSource: source,
      fallbackLocale: FALLBACK_LOCALE,
      supportedLocales: SUPPORTED_LOCALES,
    });
  }

  function applyWhenBodyExists() {
    if (document.body) {
      applyPreboot();
      return;
    }

    document.addEventListener("DOMContentLoaded", applyPreboot, {
      once: true,
    });
  }

  function watchSystemTheme() {
    try {
      const media = window.matchMedia("(prefers-color-scheme: dark)");

      media.addEventListener("change", applyPreboot);
    } catch {
      // Navegador antiguo: no pasa nada.
    }
  }

  applyPreboot();
  applyWhenBodyExists();
  watchSystemTheme();
})();
