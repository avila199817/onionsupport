/* =========================================================
   Onion Support - Preboot Theme
   Archivo: /src/preboot/theme.js

   Responsabilidad:
   - Aplicar tema inicial según sistema.
   - Aplicar idioma base inicial: castellano.
   - Preparar html/body antes del arranque SPA.
   - Base primaria: es.
   - Sin imports.
   - Sin storage.
   - Sin API.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin eventos custom.
   - Sin i18n propio.
   - Sin detección de idioma por ahora.
   - Sin magia negra.
========================================================= */

(() => {
  "use strict";

  const SUPPORTED_LOCALES = Object.freeze(["es", "ca", "en"]);
  const BASE_LOCALE = "es";

  const THEMES = Object.freeze(["light", "dark"]);
  const FALLBACK_THEME = "light";

  const THEME_COLORS = Object.freeze({
    light: "#ffffff",
    dark: "#0a0c11",
  });

  /* =========================================================
     BASICS
  ========================================================= */

  function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  function text(value = "", fallback = "") {
    const output = String(value ?? "").trim();
    return output || fallback;
  }

  function normalizeTheme(value = "", fallback = FALLBACK_THEME) {
    const theme = text(value, "").toLowerCase();
    return THEMES.includes(theme) ? theme : fallback;
  }

  function resolveLocale() {
    return {
      value: BASE_LOCALE,
      source: "base",
    };
  }

  function resolveSystemTheme() {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } catch {
      return FALLBACK_THEME;
    }
  }

  /* =========================================================
     APPLY
  ========================================================= */

  function applyThemeToElement(element = null, theme = FALLBACK_THEME) {
    if (!element) return false;

    const cleanTheme = normalizeTheme(theme);

    try {
      element.classList.remove("no-js", "theme-light", "theme-dark");
      element.classList.add("js", `theme-${cleanTheme}`);

      element.dataset.theme = cleanTheme;
      element.dataset.themeMode = "system";
      element.dataset.themeSource = "system";
      element.dataset.systemTheme = cleanTheme;
      element.dataset.themeReady = "true";

      return true;
    } catch {
      return false;
    }
  }

  function applyLocaleToElement(element = null, locale = null) {
    if (!element || !locale) return false;

    try {
      element.lang = BASE_LOCALE;
      element.dir = "ltr";

      element.dataset.locale = BASE_LOCALE;
      element.dataset.localeSource = text(locale.source, "base");
      element.dataset.localeFallback = BASE_LOCALE;
      element.dataset.localeSupported = SUPPORTED_LOCALES.join(" ");

      return true;
    } catch {
      return false;
    }
  }

  function applyThemeColor(theme = FALLBACK_THEME) {
    const cleanTheme = normalizeTheme(theme);
    const activeColor = THEME_COLORS[cleanTheme] || THEME_COLORS[FALLBACK_THEME];

    try {
      document
        .querySelectorAll("meta[name='theme-color']")
        .forEach((meta) => {
          if (meta.hasAttribute("data-onion-theme-color-light")) {
            meta.setAttribute("content", THEME_COLORS.light);
            return;
          }

          if (meta.hasAttribute("data-onion-theme-color-dark")) {
            meta.setAttribute("content", THEME_COLORS.dark);
            return;
          }

          meta.setAttribute("content", activeColor);
        });

      return true;
    } catch {
      return false;
    }
  }

  function writePrebootSnapshot(theme = FALLBACK_THEME, locale = null) {
    const cleanTheme = normalizeTheme(theme);

    try {
      window.__ONION_PREBOOT__ = {
        theme: cleanTheme,
        themeMode: "system",
        themeSource: "system",
        systemTheme: cleanTheme,

        locale: BASE_LOCALE,
        localeSource: text(locale?.source, "base"),
        fallbackLocale: BASE_LOCALE,
        supportedLocales: [...SUPPORTED_LOCALES],
      };

      return true;
    } catch {
      return false;
    }
  }

  function applyPreboot() {
    if (!isBrowser()) return false;

    const theme = resolveSystemTheme();
    const locale = resolveLocale();

    applyThemeToElement(document.documentElement, theme);
    applyLocaleToElement(document.documentElement, locale);

    if (document.body) {
      applyThemeToElement(document.body, theme);
      applyLocaleToElement(document.body, locale);
    }

    applyThemeColor(theme);
    writePrebootSnapshot(theme, locale);

    return true;
  }

  /* =========================================================
     RUN
  ========================================================= */

  if (!isBrowser()) return;

  applyPreboot();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyPreboot, {
      once: true,
    });
  }
})();
