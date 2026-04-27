/* =========================================================
   Onion SPA - Early Theme Boot
   Archivo: src/preboot/theme.js

   RESPONSABILIDADES:
   - aplicar tema antes del primer paint
   - resolver modo system desde navegador / sistema operativo
   - soportar storage namespaced y legacy
   - soportar valores raw, JSON y objetos serializados
   - soportar dark / light / system
   - sincronizar data-theme real: dark | light
   - sincronizar data-theme-mode: dark | light | system
   - sincronizar clases theme-dark / theme-light
   - sincronizar color-scheme y theme-color
   - no romper si localStorage está bloqueado
   - CSP clean: este archivo NO debe incluir etiqueta <script>
========================================================= */

(() => {
  "use strict";

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const VALID_RESOLVED_THEMES = Object.freeze([
    "dark",
    "light",
  ]);

  const VALID_THEME_MODES = Object.freeze([
    "dark",
    "light",
    "system",
  ]);

  const DEFAULT_MODE = "system";
  const FALLBACK_THEME = "dark";

  const THEME_COLORS = Object.freeze({
    dark: "#0a0c11",
    light: "#f4f7fb",
  });

  const STORAGE_LEGACY_KEYS = Object.freeze([
    "onion:theme",
    "onion_theme",
    "theme",
    "onion:settings",
    "settings",
    "onion:user",
    "user",
  ]);

  /* =========================================================
     SAFE HELPERS
  ========================================================= */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

  function safeText(value, fallback = "") {
    if (
      value === null ||
      value === undefined
    ) {
      return fallback;
    }

    const text = String(value).trim();

    return text || fallback;
  }

  function safeLower(value, fallback = "") {
    return safeText(value, fallback)
      .toLowerCase();
  }

  function isObject(value) {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    );
  }

  function isValidResolvedTheme(value) {
    return VALID_RESOLVED_THEMES.includes(value);
  }

  function isValidThemeMode(value) {
    return VALID_THEME_MODES.includes(value);
  }

  function getRuntimeConfig() {
    try {
      const config = window.__ONION_CONFIG__;

      return isObject(config)
        ? config
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

  function getStorage() {
    try {
      return window.localStorage || null;
    } catch {
      return null;
    }
  }

  function readStorageRaw(key = "") {
    const storage = getStorage();
    const finalKey = safeText(key, "");

    if (!storage || !finalKey) {
      return "";
    }

    try {
      return storage.getItem(finalKey) || "";
    } catch {
      return "";
    }
  }

  function writeStorageRaw(key = "", value = "") {
    const storage = getStorage();
    const finalKey = safeText(key, "");

    if (!storage || !finalKey) {
      return false;
    }

    try {
      storage.setItem(finalKey, String(value));
      return true;
    } catch {
      return false;
    }
  }

  /* =========================================================
     SYSTEM THEME
  ========================================================= */

  function getSystemTheme() {
    try {
      if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: light)").matches
      ) {
        return "light";
      }
    } catch {}

    return FALLBACK_THEME;
  }

  function resolveThemeFromMode(mode = DEFAULT_MODE) {
    const finalMode =
      isValidThemeMode(mode)
        ? mode
        : DEFAULT_MODE;

    if (finalMode === "dark") {
      return "dark";
    }

    if (finalMode === "light") {
      return "light";
    }

    return getSystemTheme();
  }

  /* =========================================================
     VALUE PARSING
  ========================================================= */

  function normalizeThemeMode(value = "") {
    const key =
      safeLower(value, "")
        .replace(/^["']+|["']+$/g, "")
        .trim();

    if (key === "auto") {
      return "system";
    }

    if (key === "browser") {
      return "system";
    }

    if (key === "os") {
      return "system";
    }

    if (isValidThemeMode(key)) {
      return key;
    }

    return "";
  }

  function extractThemeModeFromObject(value = null) {
    if (!isObject(value)) {
      return "";
    }

    const candidates = [
      value.themeMode,
      value.mode,
      value.colorMode,
      value.appearance,

      value.theme,
      value.defaultTheme,

      value.ui?.themeMode,
      value.ui?.mode,
      value.ui?.colorMode,
      value.ui?.appearance,
      value.ui?.theme,
      value.ui?.defaultTheme,

      value.preferences?.themeMode,
      value.preferences?.mode,
      value.preferences?.colorMode,
      value.preferences?.appearance,
      value.preferences?.theme,

      value.settings?.themeMode,
      value.settings?.mode,
      value.settings?.colorMode,
      value.settings?.appearance,
      value.settings?.theme,
    ];

    for (const candidate of candidates) {
      const mode =
        normalizeThemeMode(candidate);

      if (isValidThemeMode(mode)) {
        return mode;
      }
    }

    return "";
  }

  function parseThemeModeValue(raw = "") {
    const value =
      safeText(raw, "");

    if (!value) {
      return "";
    }

    const direct =
      normalizeThemeMode(value);

    if (isValidThemeMode(direct)) {
      return direct;
    }

    const lower =
      safeLower(value, "");

    if (
      lower === "undefined" ||
      lower === "null" ||
      lower === "[object object]"
    ) {
      return "";
    }

    try {
      const parsed =
        JSON.parse(value);

      if (typeof parsed === "string") {
        const parsedMode =
          normalizeThemeMode(parsed);

        return isValidThemeMode(parsedMode)
          ? parsedMode
          : "";
      }

      const objectMode =
        extractThemeModeFromObject(parsed);

      return isValidThemeMode(objectMode)
        ? objectMode
        : "";
    } catch {}

    return "";
  }

  function getStorageKeys() {
    const prefix =
      getStoragePrefix();

    return Array.from(
      new Set([
        `${prefix}:theme`,
        `${prefix}:themeMode`,
        `${prefix}:settings`,
        `${prefix}:user`,
        ...STORAGE_LEGACY_KEYS,
      ])
    );
  }

  function resolveStoredThemeMode() {
    const keys =
      getStorageKeys();

    for (const key of keys) {
      const mode =
        parseThemeModeValue(
          readStorageRaw(key)
        );

      if (isValidThemeMode(mode)) {
        return {
          mode,
          source: key,
        };
      }
    }

    return {
      mode: "",
      source: "",
    };
  }

  /* =========================================================
     META / DOM
  ========================================================= */

  function getThemeColor(theme = FALLBACK_THEME) {
    const runtimeConfig =
      getRuntimeConfig();

    const ui =
      isObject(runtimeConfig.ui)
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

  function getHead() {
    try {
      return (
        document.head ||
        document.getElementsByTagName("head")[0] ||
        null
      );
    } catch {
      return null;
    }
  }

  function setMetaThemeColor(theme = FALLBACK_THEME) {
    try {
      const head =
        getHead();

      if (!head) {
        return false;
      }

      const color =
        getThemeColor(theme);

      let meta =
        document.querySelector(
          'meta[name="theme-color"][data-onion-theme-color="true"]'
        );

      if (!meta) {
        meta =
          document.querySelector(
            'meta[name="theme-color"]:not([media])'
          );
      }

      if (!meta) {
        meta =
          document.createElement("meta");

        meta.setAttribute(
          "name",
          "theme-color"
        );

        meta.setAttribute(
          "data-onion-theme-color",
          "true"
        );

        head.appendChild(meta);
      }

      meta.setAttribute(
        "content",
        color
      );

      meta.setAttribute(
        "data-onion-theme-color",
        "true"
      );

      return true;
    } catch {
      return false;
    }
  }

  function applyThemeToElement(element, {
    theme,
    mode,
    source,
  }) {
    if (!element) {
      return false;
    }

    try {
      element.setAttribute(
        "data-theme",
        theme
      );

      element.setAttribute(
        "data-theme-mode",
        mode
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

      return true;
    } catch {
      return false;
    }
  }

  function emitThemeEvent(payload = {}) {
    try {
      window.dispatchEvent(
        new CustomEvent("onion:theme:change", {
          detail: payload,
        })
      );

      return true;
    } catch {
      return false;
    }
  }

  function applyTheme({
    mode = DEFAULT_MODE,
    source = "system",
    persist = false,
    emit = false,
  } = {}) {
    if (!isBrowser()) {
      return FALLBACK_THEME;
    }

    const finalMode =
      isValidThemeMode(mode)
        ? mode
        : DEFAULT_MODE;

    const resolvedTheme =
      resolveThemeFromMode(finalMode);

    const finalTheme =
      isValidResolvedTheme(resolvedTheme)
        ? resolvedTheme
        : FALLBACK_THEME;

    const finalSource =
      safeText(source, "unknown");

    const payload = {
      theme: finalTheme,
      mode: finalMode,
      source: finalSource,
      systemTheme: getSystemTheme(),
      at: new Date().toISOString(),
    };

    try {
      const html =
        document.documentElement;

      applyThemeToElement(html, payload);

      html.style.colorScheme =
        finalTheme;
    } catch {}

    try {
      if (document.body) {
        applyThemeToElement(
          document.body,
          payload
        );

        document.body.style.colorScheme =
          finalTheme;
      } else {
        document.addEventListener(
          "DOMContentLoaded",
          () => {
            try {
              applyThemeToElement(
                document.body,
                payload
              );

              document.body.style.colorScheme =
                finalTheme;
            } catch {}
          },
          {
            once: true,
          }
        );
      }
    } catch {}

    setMetaThemeColor(finalTheme);

    try {
      window.__ONION_BOOT_THEME__ = payload;
    } catch {}

    if (persist) {
      try {
        writeStorageRaw(
          `${getStoragePrefix()}:theme`,
          finalMode
        );
      } catch {}
    }

    if (emit) {
      emitThemeEvent(payload);
    }

    return finalTheme;
  }

  /* =========================================================
     PUBLIC BRIDGE
  ========================================================= */

  function exposePublicApi() {
    try {
      window.__ONION_SET_THEME__ = function setOnionTheme(mode = DEFAULT_MODE) {
        const finalMode =
          normalizeThemeMode(mode) || DEFAULT_MODE;

        return applyTheme({
          mode: finalMode,
          source: "manual",
          persist: true,
          emit: true,
        });
      };

      window.__ONION_GET_THEME__ = function getOnionTheme() {
        return {
          ...(window.__ONION_BOOT_THEME__ || {}),
        };
      };
    } catch {}
  }

  /* =========================================================
     SYSTEM CHANGE LISTENER
  ========================================================= */

  function bindSystemThemeListener() {
    try {
      if (
        !window.matchMedia ||
        typeof window.matchMedia !== "function"
      ) {
        return false;
      }

      const media =
        window.matchMedia("(prefers-color-scheme: light)");

      const handler = () => {
        const current =
          window.__ONION_BOOT_THEME__ || {};

        if (current.mode !== "system") {
          return;
        }

        applyTheme({
          mode: "system",
          source: current.source || "system-change",
          persist: false,
          emit: true,
        });
      };

      if (typeof media.addEventListener === "function") {
        media.addEventListener(
          "change",
          handler
        );

        return true;
      }

      if (typeof media.addListener === "function") {
        media.addListener(handler);
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /* =========================================================
     BOOT
  ========================================================= */

  function bootTheme() {
    const stored =
      resolveStoredThemeMode();

    if (isValidThemeMode(stored.mode)) {
      applyTheme({
        mode: stored.mode,
        source: stored.source || "storage",
        persist: false,
        emit: false,
      });

      return;
    }

    applyTheme({
      mode: DEFAULT_MODE,
      source: "system",
      persist: false,
      emit: false,
    });
  }

  try {
    bootTheme();
    exposePublicApi();
    bindSystemThemeListener();
  } catch {
    try {
      applyTheme({
        mode: FALLBACK_THEME,
        source: "fallback",
        persist: false,
        emit: false,
      });
    } catch {
      try {
        document.documentElement.setAttribute(
          "data-theme",
          FALLBACK_THEME
        );

        document.documentElement.classList.add(
          `theme-${FALLBACK_THEME}`
        );
      } catch {}
    }
  }
})();
