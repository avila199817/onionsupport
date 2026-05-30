/* =========================================================
   Onion Support - Preboot Theme
   Archivo: /src/preboot/theme.js

   Responsabilidad:
   - Aplicar tema inicial según sistema.
   - Mantener tema vivo si cambia prefers-color-scheme.
   - Fijar idioma base inicial: es.
   - Eliminar no-js lo antes posible.
   - Sin imports, storage, API, Auth, Router, HTTP ni i18n.
========================================================= */

(() => {
  "use strict";

  const BASE_LOCALE = "es";
  const DARK_QUERY = "(prefers-color-scheme: dark)";

  const THEME_LIGHT = "light";
  const THEME_DARK = "dark";
  const THEME_MODE = "system";

  const THEME_COLORS = Object.freeze({
    light: "#ffffff",
    dark: "#0a0c11",
  });

  let mediaQuery = null;
  let listenerBound = false;

  function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  function getMediaQuery() {
    if (mediaQuery) return mediaQuery;

    try {
      mediaQuery = window.matchMedia(DARK_QUERY);
    } catch {
      mediaQuery = null;
    }

    return mediaQuery;
  }

  function getSystemTheme() {
    return getMediaQuery()?.matches ? THEME_DARK : THEME_LIGHT;
  }

  function normalizeTheme(value = "") {
    return value === THEME_DARK ? THEME_DARK : THEME_LIGHT;
  }

  function applyRootClasses(element = null, theme = THEME_LIGHT) {
    if (!element) return false;

    const value = normalizeTheme(theme);

    try {
      element.classList.remove(
        "no-js",
        "theme-light",
        "theme-dark"
      );

      element.classList.add(
        "js",
        `theme-${value}`
      );

      return true;
    } catch {
      return false;
    }
  }

  function applyThemeDataset(element = null, theme = THEME_LIGHT) {
    if (!element) return false;

    const value = normalizeTheme(theme);

    try {
      element.dataset.theme = value;
      element.dataset.themeMode = THEME_MODE;
      element.dataset.themeSource = "system";
      element.dataset.systemTheme = value;
      element.dataset.themeReady = "true";

      return true;
    } catch {
      return false;
    }
  }

  function applyLocale(element = null) {
    if (!element) return false;

    try {
      element.lang = BASE_LOCALE;
      element.dir = "ltr";

      element.dataset.locale = BASE_LOCALE;
      element.dataset.localeSource = "base";
      element.dataset.localeFallback = BASE_LOCALE;
      element.dataset.localeSupported = BASE_LOCALE;

      return true;
    } catch {
      return false;
    }
  }

  function applyThemeColor(theme = THEME_LIGHT) {
    if (!isBrowser()) return false;

    const value = normalizeTheme(theme);
    const activeColor = THEME_COLORS[value];

    try {
      const metas = document.querySelectorAll("meta[name='theme-color']");

      if (!metas.length) return false;

      metas.forEach((meta) => {
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

  function writeSnapshot(theme = THEME_LIGHT) {
    if (!isBrowser()) return false;

    const value = normalizeTheme(theme);

    try {
      window.__ONION_PREBOOT__ = Object.freeze({
        theme: value,
        themeMode: THEME_MODE,
        themeSource: "system",
        systemTheme: value,

        locale: BASE_LOCALE,
        localeSource: "base",
        fallbackLocale: BASE_LOCALE,
        supportedLocales: Object.freeze([BASE_LOCALE]),
      });

      return true;
    } catch {
      return false;
    }
  }

  function applyPreboot() {
    if (!isBrowser()) return false;

    const theme = getSystemTheme();
    const html = document.documentElement;
    const body = document.body;

    applyRootClasses(html, theme);
    applyThemeDataset(html, theme);
    applyLocale(html);

    if (body) {
      applyRootClasses(body, theme);
      applyThemeDataset(body, theme);
      applyLocale(body);
    }

    applyThemeColor(theme);
    writeSnapshot(theme);

    return true;
  }

  function bindSystemThemeListener() {
    if (listenerBound) return true;

    const query = getMediaQuery();

    if (!query) return false;

    const onChange = () => {
      applyPreboot();
    };

    try {
      if (typeof query.addEventListener === "function") {
        query.addEventListener("change", onChange);
        listenerBound = true;
        return true;
      }

      if (typeof query.addListener === "function") {
        query.addListener(onChange);
        listenerBound = true;
        return true;
      }
    } catch {
      return false;
    }

    return false;
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
