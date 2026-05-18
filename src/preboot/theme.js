/* =========================================================
   Onion Support - Preboot Theme
   Archivo: /src/preboot/theme.js

   Responsabilidad:
   - Aplicar tema inicial según sistema.
   - Aplicar idioma inicial según navegador.
   - Preparar html/body antes del arranque SPA.
   - Sin imports.
   - Sin storage.
   - Sin API.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin eventos custom.
   - Sin i18n propio.
   - Sin magia negra.
========================================================= */

(() => {
  "use strict";

  const SUPPORTED_LOCALES = Object.freeze(["ca", "es", "en"]);
  const FALLBACK_LOCALE = "en";

  const THEMES = Object.freeze(["light", "dark"]);
  const FALLBACK_THEME = "light";

  const THEME_COLORS = Object.freeze({
    light: "#ffffff",
    dark: "#0a0c11",
  });

  function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  function text(value = "", fallback = "") {
    const output = String(value ?? "").trim();
    return output || fallback;
  }

  function normalizeLocale(value = "", fallback = FALLBACK_LOCALE) {
    const locale = text(value, "")
      .toLowerCase()
      .replace("_", "-")
      .split("-")[0];

    return SUPPORTED_LOCALES.includes(locale) ? locale : fallback;
  }

  function normalizeTheme(value = "", fallback = FALLBACK_THEME) {
    const theme = text(value, "").toLowerCase();

    return THEMES.includes(theme) ? theme : fallback;
  }

  function resolveLocale() {
    const browserLanguages = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language];

    for (const language of browserLanguages) {
      const locale = normalizeLocale(language, "");

      if (locale) {
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
      return FALLBACK_THEME;
    }
  }

  function applyThemeToElement(element, theme = FALLBACK_THEME) {
    if (!element) return false;

    const cleanTheme = normalizeTheme(theme);

    try {
      element.classList.remove("no-js", "theme-light", "theme-dark");
      element.classList.add("js", `theme-${cleanTheme}`);

      element.dataset.theme = cleanTheme;
      element.dataset.themeMode = "system";
      element.dataset.themeSource = "browser";
      element.dataset.systemTheme = cleanTheme;
      element.dataset.themeReady = "true";

      return true;
    } catch {
      return false;
    }
  }

  function applyLocaleToElement(element, locale = null) {
    if (!element || !locale) return false;

    const cleanLocale = normalizeLocale(locale.value);
    const source = text(locale.source, "browser");

    try {
      element.lang = cleanLocale;
      element.dir = "ltr";

      element.dataset.locale = cleanLocale;
      element.dataset.localeSource = source;
      element.dataset.localeFallback = FALLBACK_LOCALE;
      element.dataset.localeSupported = SUPPORTED_LOCALES.join(" ");

      return true;
    } catch {
      return false;
    }
  }

  function applyThemeColor(theme = FALLBACK_THEME) {
    const cleanTheme = normalizeTheme(theme);
    const color = THEME_COLORS[cleanTheme] || THEME_COLORS[FALLBACK_THEME];

    try {
      document
        .querySelectorAll("meta[name='theme-color']")
        .forEach((meta) => {
          const media = meta.getAttribute("media") || "";

          if (!media) {
            meta.setAttribute("content", color);
          }
        });

      return true;
    } catch {
      return false;
    }
  }

  function writePrebootSnapshot(theme = FALLBACK_THEME, locale = null) {
    try {
      window.__ONION_PREBOOT__ = {
        theme: normalizeTheme(theme),
        themeMode: "system",
        themeSource: "browser",

        locale: normalizeLocale(locale?.value),
        localeSource: text(locale?.source, "browser"),
        fallbackLocale: FALLBACK_LOCALE,
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

  function bindSystemThemeListener() {
    try {
      const media = window.matchMedia("(prefers-color-scheme: dark)");

      if (typeof media.addEventListener === "function") {
        media.addEventListener("change", applyPreboot);
        return true;
      }

      if (typeof media.addListener === "function") {
        media.addListener(applyPreboot);
        return true;
      }
    } catch {
      return false;
    }

    return false;
  }

  if (!isBrowser()) return;

  applyPreboot();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyPreboot, {
      once: true,
    });
  }

  bindSystemThemeListener();
})();
