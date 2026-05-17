/* =========================================================
   Onion Support - Preboot
   Archivo: /src/preboot/theme.js

   Responsabilidad:
   - Tema inicial según navegador/sistema.
   - Idioma inicial según navegador.
   - Idiomas soportados: ca, es, en.
   - Fallback idioma: en.
   - Sin storage.
   - Sin API.
   - Sin auth.
   - Sin router.
   - Sin HTTP.
========================================================= */

(() => {
  "use strict";

  const LOCALES = ["ca", "es", "en"];
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

  function getTheme() {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
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

  function getLocale() {
    const languages =
      navigator.languages && navigator.languages.length
        ? navigator.languages
        : [navigator.language];

    for (const language of languages) {
      const locale = normalizeLocale(language);

      if (LOCALES.includes(locale)) {
        return {
          value: locale,
          source: "browser",
        };
      }
    }

    return {
      value: FALLBACK_LOCALE,
      source: "fallback",
    };
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);

    if (element) {
      element.textContent = value;
    }
  }

  function setMeta(name, value) {
    const meta = document.querySelector(`meta[name="${name}"]:not([media])`);

    if (meta) {
      meta.setAttribute("content", value);
    }
  }

  function applyTheme(element, theme) {
    if (!element) return;

    element.classList.remove("no-js", "theme-dark", "theme-light");
    element.classList.add("js", `theme-${theme}`);

    element.dataset.theme = theme;
    element.dataset.themeMode = "system";
    element.dataset.themeSource = "browser";
    element.dataset.systemTheme = theme;
    element.dataset.themeReady = "true";
  }

  function applyLocale(element, locale) {
    if (!element) return;

    element.lang = locale.value;
    element.dir = "ltr";

    element.dataset.locale = locale.value;
    element.dataset.localeSource = locale.source;
    element.dataset.localeFallback = FALLBACK_LOCALE;
    element.dataset.localeSupported = LOCALES.join(" ");
  }

  function applyTexts(locale) {
    const text = TEXTS[locale.value] || TEXTS[FALLBACK_LOCALE];

    setText("[data-skip-link]", text.skip);
    setText("[data-loader-text]", text.loader);
    setText("[data-loader-subtext]", text.subtext);
  }

  const root = document.documentElement;
  const locale = getLocale();

  function apply() {
    const theme = getTheme();

    applyTheme(root, theme);
    applyLocale(root, locale);

    if (document.body) {
      applyTheme(document.body, theme);
      applyLocale(document.body, locale);
      applyTexts(locale);
    }

    setMeta("theme-color", THEME_COLORS[theme]);
    setMeta("msapplication-TileColor", THEME_COLORS[theme]);

    window.__ONION_PREBOOT__ = {
      theme,
      themeMode: "system",
      themeSource: "browser",
      locale: locale.value,
      localeSource: locale.source,
      fallbackLocale: FALLBACK_LOCALE,
      supportedLocales: LOCALES,
    };
  }

  apply();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply, { once: true });
  }

  try {
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", apply);
  } catch {
    // Sin soporte matchMedia moderno: no hace falta hacer nada.
  }
})();
