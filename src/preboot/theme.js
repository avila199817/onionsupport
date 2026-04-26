<script>
(() => {
  "use strict";

  /* =========================================================
     Onion SPA - Early Theme Boot
     Ubicación recomendada: index.html <head>, antes de CSS

     Responsabilidades:
     - aplicar tema antes del primer paint
     - leer storage namespaced y legacy
     - soportar valores raw y JSON serializados
     - soportar fallback por prefers-color-scheme
     - sincronizar data-theme, clases y color-scheme
     - no romper si localStorage está bloqueado
  ========================================================= */

  const VALID_THEMES = Object.freeze([
    "dark",
    "light",
  ]);

  const DEFAULT_THEME = "dark";

  const THEME_COLORS = Object.freeze({
    dark: "#0a0c11",
    light: "#f4f7fb",
  });

  function isValidTheme(value) {
    return VALID_THEMES.includes(value);
  }

  function safeText(value, fallback = "") {
    if (
      value === null ||
      value === undefined
    ) {
      return fallback;
    }

    const text =
      String(value).trim();

    return text || fallback;
  }

  function safeLower(value, fallback = "") {
    return safeText(value, fallback)
      .toLowerCase();
  }

  function getRuntimeConfig() {
    try {
      return (
        window.__ONION_CONFIG__ &&
        typeof window.__ONION_CONFIG__ === "object"
      )
        ? window.__ONION_CONFIG__
        : {};
    } catch {
      return {};
    }
  }

  function getStoragePrefix() {
    const runtimeConfig =
      getRuntimeConfig();

    return safeText(
      runtimeConfig.storagePrefix,
      "onion"
    );
  }

  function getThemeColor(theme) {
    const runtimeConfig =
      getRuntimeConfig();

    const ui =
      runtimeConfig.ui &&
      typeof runtimeConfig.ui === "object"
        ? runtimeConfig.ui
        : {};

    if (theme === "light") {
      return safeText(
        ui.themeColorLight,
        THEME_COLORS.light
      );
    }

    return safeText(
      ui.themeColorDark,
      THEME_COLORS.dark
    );
  }

  function getStorage() {
    try {
      return window.localStorage || null;
    } catch {
      return null;
    }
  }

  function readStorageRaw(key) {
    const storage =
      getStorage();

    if (!storage || !key) {
      return "";
    }

    try {
      return storage.getItem(key) || "";
    } catch {
      return "";
    }
  }

  function extractThemeFromParsed(value) {
    if (!value) {
      return "";
    }

    if (typeof value === "string") {
      const theme =
        safeLower(value);

      return isValidTheme(theme)
        ? theme
        : "";
    }

    if (
      value &&
      typeof value === "object"
    ) {
      const theme =
        safeLower(
          value.theme ||
            value.defaultTheme ||
            value.ui?.theme ||
            value.ui?.defaultTheme ||
            value.preferences?.theme ||
            value.settings?.theme ||
            ""
        );

      return isValidTheme(theme)
        ? theme
        : "";
    }

    return "";
  }

  function parseThemeValue(raw) {
    const value =
      safeText(raw, "");

    if (!value) {
      return "";
    }

    const direct =
      safeLower(value);

    if (isValidTheme(direct)) {
      return direct;
    }

    if (
      direct === "undefined" ||
      direct === "null" ||
      direct === "[object object]"
    ) {
      return "";
    }

    try {
      const parsed =
        JSON.parse(value);

      return extractThemeFromParsed(parsed);
    } catch {}

    /*
      Fallback para valores con comillas mal serializadas:
        "\"dark\""
        "'dark'"
    */
    const unquoted =
      safeLower(
        value.replace(/^["']+|["']+$/g, "")
      );

    return isValidTheme(unquoted)
      ? unquoted
      : "";
  }

  function resolveStoredTheme() {
    const prefix =
      getStoragePrefix();

    const keys = [
      `${prefix}:theme`,
      "onion:theme",
      "onion_theme",
      "theme",

      `${prefix}:settings`,
      "onion:settings",
      "settings",

      `${prefix}:user`,
      "onion:user",
      "user",
    ];

    for (const key of keys) {
      const theme =
        parseThemeValue(
          readStorageRaw(key)
        );

      if (isValidTheme(theme)) {
        return {
          theme,
          source: key,
        };
      }
    }

    return {
      theme: "",
      source: "",
    };
  }

  function resolveSystemTheme() {
    try {
      if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: light)").matches
      ) {
        return "light";
      }
    } catch {}

    return DEFAULT_THEME;
  }

  function setMetaThemeColor(theme) {
    try {
      const color =
        getThemeColor(theme);

      let meta =
        document.querySelector('meta[name="theme-color"]');

      if (!meta) {
        meta =
          document.createElement("meta");

        meta.setAttribute(
          "name",
          "theme-color"
        );

        document.head?.appendChild(meta);
      }

      meta.setAttribute(
        "content",
        color
      );
    } catch {}
  }

  function applyThemeToElement(element, theme, source) {
    if (!element) {
      return;
    }

    try {
      element.setAttribute(
        "data-theme",
        theme
      );

      element.setAttribute(
        "data-theme-source",
        source
      );

      element.classList.remove(
        "theme-dark",
        "theme-light"
      );

      element.classList.add(
        `theme-${theme}`
      );
    } catch {}
  }

  function applyTheme(theme, source = "unknown") {
    const finalTheme =
      isValidTheme(theme)
        ? theme
        : DEFAULT_THEME;

    const finalSource =
      safeText(source, "unknown");

    try {
      const html =
        document.documentElement;

      applyThemeToElement(
        html,
        finalTheme,
        finalSource
      );

      html.style.colorScheme =
        finalTheme;
    } catch {}

    try {
      if (document.body) {
        applyThemeToElement(
          document.body,
          finalTheme,
          finalSource
        );
      } else {
        document.addEventListener(
          "DOMContentLoaded",
          () => {
            applyThemeToElement(
              document.body,
              finalTheme,
              finalSource
            );
          },
          {
            once: true,
          }
        );
      }
    } catch {}

    setMetaThemeColor(finalTheme);

    try {
      window.__ONION_BOOT_THEME__ = {
        theme: finalTheme,
        source: finalSource,
        at: new Date().toISOString(),
      };
    } catch {}

    return finalTheme;
  }

  try {
    const stored =
      resolveStoredTheme();

    if (isValidTheme(stored.theme)) {
      applyTheme(
        stored.theme,
        stored.source || "storage"
      );

      return;
    }

    applyTheme(
      resolveSystemTheme(),
      "system"
    );
  } catch {
    try {
      applyTheme(
        DEFAULT_THEME,
        "fallback"
      );
    } catch {
      try {
        document.documentElement.setAttribute(
          "data-theme",
          DEFAULT_THEME
        );
      } catch {}
    }
  }
})();
</script>
