/* =========================================================
   Onion Support - Preboot Theme
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
   - Sin eventos custom.
   - Sin magia negra.
========================================================= */

(() => {
  "use strict";

  const SUPPORTED_LOCALES = ["ca", "es", "en"];
  const FALLBACK_LOCALE = "en";

  const THEME_COLORS = {
    light: "#ffffff",
    dark: "#0a0c11",
  };

  function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  function normalizeLocale(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace("_", "-")
      .split("-")[0];
  }

  function resolveLocale() {
    const languages = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language];

    for (const language of languages) {
      const locale = normalizeLocale(language);

      if (SUPPORTED_LOCALES.includes(locale)) {
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

  function resolveSystemTheme() {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } catch {
      return "light";
    }
  }

  function setThemeMeta(theme) {
    const color = THEME_COLORS[theme] || THEME_COLORS.light;

    try {
      document
        .querySelectorAll("meta[name='theme-color']")
        .forEach((meta) => {
          const media = meta.getAttribute("media") || "";

          if (!media) {
            meta.setAttribute("content", color);
          }
        });
    } catch {
      // noop
    }
  }

  function applyTheme(element, theme) {
    if (!element) return false;

    try {
      element.classList.remove("no-js", "theme-light", "theme-dark");
      element.classList.add("js", `theme-${theme}`);

      element.dataset.theme = theme;
      element.dataset.themeMode = "system";
      element.dataset.themeSource = "browser";
      element.dataset.systemTheme = theme;
      element.dataset.themeReady = "true";

      return true;
    } catch {
      return false;
    }
  }

  function applyLocale(element, locale) {
    if (!element) return false;

    try {
      element.lang = locale.value;
      element.dir = "ltr";

      element.dataset.locale = locale.value;
      element.dataset.localeSource = locale.source;
      element.dataset.localeFallback = FALLBACK_LOCALE;
      element.dataset.localeSupported = SUPPORTED_LOCALES.join(" ");

      return true;
    } catch {
      return false;
    }
  }

  function apply() {
    if (!isBrowser()) return false;

    const theme = resolveSystemTheme();
    const locale = resolveLocale();

    applyTheme(document.documentElement, theme);
    applyLocale(document.documentElement, locale);

    if (document.body) {
      applyTheme(document.body, theme);
      applyLocale(document.body, locale);
    }

    setThemeMeta(theme);

    window.__ONION_PREBOOT__ = Object.freeze({
      theme,
      themeMode: "system",
      themeSource: "browser",

      locale: locale.value,
      localeSource: locale.source,
      fallbackLocale: FALLBACK_LOCALE,
      supportedLocales: [...SUPPORTED_LOCALES],
    });

    return true;
  }

  if (!isBrowser()) return;

  apply();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply, {
      once: true,
    });
  }

  try {
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", apply);
  } catch {
    // Navegador sin listener moderno. No pasa nada.
  }
})();
