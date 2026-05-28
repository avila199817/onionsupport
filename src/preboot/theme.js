/* =========================================================
   Onion Support - Preboot Theme
   Archivo: /src/preboot/theme.js

   Responsabilidad:
   - Tema inicial y vivo según sistema.
   - Idioma base inicial: castellano.
   - Sin imports, storage, API, Auth, Router, HTTP ni i18n propio.
========================================================= */

(() => {
  "use strict";

  const BASE_LOCALE = "es";
  const SUPPORTED_LOCALES = Object.freeze(["es", "ca", "en"]);

  const DARK_QUERY = "(prefers-color-scheme: dark)";
  const THEMES = Object.freeze(["light", "dark"]);
  const FALLBACK_THEME = "light";

  const THEME_COLORS = Object.freeze({
    light: "#ffffff",
    dark: "#0a0c11",
  });

  let systemThemeQuery = null;
  let systemThemeListenerBound = false;

  function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  function cleanText(value = "", fallback = "") {
    const output = String(value ?? "").trim();
    return output || fallback;
  }

  function normalizeTheme(value = "", fallback = FALLBACK_THEME) {
    const theme = cleanText(value, "").toLowerCase();
    return THEMES.includes(theme) ? theme : fallback;
  }

  function getSystemThemeQuery() {
    if (systemThemeQuery) return systemThemeQuery;

    try {
      systemThemeQuery = window.matchMedia(DARK_QUERY);
    } catch {
      systemThemeQuery = null;
    }

    return systemThemeQuery;
  }

  function resolveSystemTheme() {
    return getSystemThemeQuery()?.matches ? "dark" : "light";
  }

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

  function applyLocaleToElement(element = null) {
    if (!element) return false;

    try {
      element.lang = BASE_LOCALE;
      element.dir = "ltr";

      element.dataset.locale = BASE_LOCALE;
      element.dataset.localeSource = "base";
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

  function writePrebootSnapshot(theme = FALLBACK_THEME) {
    const cleanTheme = normalizeTheme(theme);

    try {
      window.__ONION_PREBOOT__ = {
        theme: cleanTheme,
        themeMode: "system",
        themeSource: "system",
        systemTheme: cleanTheme,

        locale: BASE_LOCALE,
        localeSource: "base",
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

    applyThemeToElement(document.documentElement, theme);
    applyLocaleToElement(document.documentElement);

    if (document.body) {
      applyThemeToElement(document.body, theme);
      applyLocaleToElement(document.body);
    }

    applyThemeColor(theme);
    writePrebootSnapshot(theme);

    return true;
  }

  function bindSystemThemeListener() {
    if (systemThemeListenerBound) return true;

    const query = getSystemThemeQuery();

    if (!query) return false;

    const onSystemThemeChange = () => {
      applyPreboot();
    };

    try {
      if (typeof query.addEventListener === "function") {
        query.addEventListener("change", onSystemThemeChange);
      } else if (typeof query.addListener === "function") {
        query.addListener(onSystemThemeChange);
      } else {
        return false;
      }

      systemThemeListenerBound = true;
      return true;
    } catch {
      return false;
    }
  }

  if (!isBrowser()) return;

  applyPreboot();
  bindSystemThemeListener();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyPreboot, {
      once: true,
    });
  }
})();
