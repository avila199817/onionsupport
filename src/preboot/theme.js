/* =========================================================
   Onion SPA - Early Theme Boot
   Archivo: /src/preboot/theme.js

   Responsabilidad única:
   - Aplicar dark/light/system antes de cargar el CSS.
   - Sin imports.
   - Sin CSS inline.
   - Sin innerHTML.
   - Sin lógica auth.
   - Sin router.
   - Sin API.
========================================================= */

(() => {
  "use strict";

  const VERSION = "v1-simple-preboot-theme";

  const STORAGE_KEYS = [
    "onion:themeMode",
    "onion:theme",
    "onion:appearance",
    "onion_themeMode",
    "onion_theme",
    "onion_appearance",
    "themeMode",
    "theme",
    "appearance",
  ];

  const OBJECT_KEYS = [
    "onion:preferences",
    "onion:settings",
    "onion:user",
    "preferences",
    "settings",
    "user",
  ];

  const THEME_COLOR = {
    dark: "#0a0c11",
    light: "#f4f7fb",
  };

  const DEFAULT_MODE = "system";
  const FALLBACK_THEME = "dark";

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) return fallback;

    const text = String(value).trim();

    return text || fallback;
  }

  function getStorage() {
    try {
      return window.localStorage || null;
    } catch {
      return null;
    }
  }

  function readStorage(key) {
    const storage = getStorage();

    if (!storage || !key) return "";

    try {
      return safeText(storage.getItem(key), "");
    } catch {
      return "";
    }
  }

  function writeStorage(key, value) {
    const storage = getStorage();

    if (!storage || !key) return false;

    try {
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function removeStorage(key) {
    const storage = getStorage();

    if (!storage || !key) return false;

    try {
      storage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  function normalizeMode(value) {
    const text = safeText(value, "")
      .toLowerCase()
      .replace(/^["']|["']$/g, "");

    if (
      text === "dark" ||
      text === "oscuro" ||
      text === "night" ||
      text === "black"
    ) {
      return "dark";
    }

    if (
      text === "light" ||
      text === "claro" ||
      text === "day" ||
      text === "white"
    ) {
      return "light";
    }

    if (
      text === "system" ||
      text === "auto" ||
      text === "browser" ||
      text === "device" ||
      text === "os"
    ) {
      return "system";
    }

    if (text === "true" || text === "1") return "dark";
    if (text === "false" || text === "0") return "light";

    return "";
  }

  function parseJson(raw) {
    const text = safeText(raw, "");

    if (!text) return null;

    if (!text.startsWith("{") && !text.startsWith("[")) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function findModeInObject(value, depth = 0) {
    if (!value || typeof value !== "object" || depth > 3) {
      return "";
    }

    const directKeys = [
      "themeMode",
      "theme_mode",
      "appearance",
      "mode",
      "theme",
      "colorMode",
      "color_mode",
    ];

    for (const key of directKeys) {
      const mode = normalizeMode(value[key]);

      if (mode) return mode;
    }

    if (value.darkMode === true || value.dark_mode === true) return "dark";
    if (value.darkMode === false || value.dark_mode === false) return "light";

    const nestedKeys = [
      "preferences",
      "settings",
      "ui",
      "profile",
      "account",
      "user",
      "data",
    ];

    for (const key of nestedKeys) {
      const mode = findModeInObject(value[key], depth + 1);

      if (mode) return mode;
    }

    return "";
  }

  function getSystemTheme() {
    try {
      if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: light)").matches
      ) {
        return "light";
      }
    } catch {}

    try {
      if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      ) {
        return "dark";
      }
    } catch {}

    return FALLBACK_THEME;
  }

  function resolveTheme(mode) {
    if (mode === "dark") return "dark";
    if (mode === "light") return "light";

    return getSystemTheme();
  }

  function readModeFromRuntime() {
    try {
      const config = window.__ONION_CONFIG__ || window.__ONION_THEME_CONFIG__;

      if (!config || typeof config !== "object") return "";

      return (
        normalizeMode(config.forcedTheme) ||
        normalizeMode(config.themeMode) ||
        normalizeMode(config.appearance) ||
        normalizeMode(config.theme) ||
        findModeInObject(config)
      );
    } catch {
      return "";
    }
  }

  function readModeFromStorage() {
    for (const key of STORAGE_KEYS) {
      const mode = normalizeMode(readStorage(key));

      if (mode) return mode;
    }

    for (const key of OBJECT_KEYS) {
      const raw = readStorage(key);
      const parsed = parseJson(raw);
      const mode = findModeInObject(parsed);

      if (mode) return mode;
    }

    return "";
  }

  function setMeta(name, content) {
    if (!name || !content) return;

    try {
      let meta = document.querySelector(`meta[name="${name}"]`);

      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", name);
        document.head.appendChild(meta);
      }

      meta.setAttribute("content", content);
    } catch {}
  }

  function applyToElement(element, payload) {
    if (!element) return;

    const { theme, mode, source } = payload;

    try {
      element.classList.remove("theme-dark", "theme-light");
      element.classList.add(`theme-${theme}`);

      element.setAttribute("data-theme", theme);
      element.setAttribute("data-theme-mode", mode);
      element.setAttribute("data-theme-source", source);
      element.setAttribute("data-system-theme", getSystemTheme());
      element.setAttribute("data-theme-ready", "true");
    } catch {}
  }

  function buildSnapshot(mode, source) {
    const finalMode = normalizeMode(mode) || DEFAULT_MODE;
    const theme = resolveTheme(finalMode);

    return {
      version: VERSION,
      mode: finalMode,
      theme,
      source,
      systemTheme: getSystemTheme(),
      at: new Date().toISOString(),
    };
  }

  function applyTheme(mode, source = "manual", persist = false) {
    const snapshot = buildSnapshot(mode, source);

    applyToElement(document.documentElement, snapshot);

    if (document.body) {
      applyToElement(document.body, snapshot);
    }

    setMeta("theme-color", THEME_COLOR[snapshot.theme] || THEME_COLOR.dark);
    setMeta(
      "color-scheme",
      snapshot.theme === "dark" ? "dark light" : "light dark"
    );
    setMeta("msapplication-TileColor", THEME_COLOR[snapshot.theme] || THEME_COLOR.dark);

    try {
      window.__ONION_BOOT_THEME__ = Object.freeze({ ...snapshot });
    } catch {
      window.__ONION_BOOT_THEME__ = snapshot;
    }

    if (persist) {
      writeStorage("onion:themeMode", snapshot.mode);
      writeStorage("onion:theme", snapshot.theme);
      writeStorage("onion:appearance", snapshot.mode);
    }

    try {
      window.dispatchEvent(
        new CustomEvent("onion:theme:change", {
          detail: snapshot,
        })
      );
    } catch {}

    return snapshot;
  }

  function boot() {
    const mode =
      readModeFromRuntime() ||
      readModeFromStorage() ||
      DEFAULT_MODE;

    const snapshot = applyTheme(mode, "preboot", false);

    if (!document.body) {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          applyToElement(document.body, snapshot);
        },
        { once: true }
      );
    }

    return snapshot;
  }

  function exposeApi() {
    const api = {
      version: VERSION,

      get() {
        return window.__ONION_BOOT_THEME__ || null;
      },

      set(mode) {
        return applyTheme(mode, "manual", true);
      },

      system() {
        return applyTheme("system", "manual", true);
      },

      clear() {
        for (const key of STORAGE_KEYS) {
          removeStorage(key);
        }

        return applyTheme(DEFAULT_MODE, "manual-clear", false);
      },

      reapply() {
        return boot();
      },
    };

    try {
      Object.defineProperty(window, "__ONION_THEME__", {
        value: Object.freeze(api),
        configurable: true,
      });
    } catch {
      window.__ONION_THEME__ = api;
    }
  }

  try {
    boot();
    exposeApi();

    try {
      const media = window.matchMedia("(prefers-color-scheme: dark)");

      media.addEventListener("change", () => {
        const current = window.__ONION_BOOT_THEME__;

        if (current && current.mode === "system") {
          applyTheme("system", "system-change", false);
        }
      });
    } catch {}
  } catch {
    try {
      applyTheme(FALLBACK_THEME, "fallback", false);
    } catch {}
  }
})();
