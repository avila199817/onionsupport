/* =========================================================
   Onion Support - Preboot Preferences
   Archivo: /src/preboot/theme.js

   PRODUCTIVO · THEME + ACCENT + LOCALE · V4

   Responsabilidad:
   - Aplicar el tema efectivo antes del boot de la SPA.
   - Persistir themeMode, color de acento e idioma de interfaz.
   - Mantener themeMode="system" vivo ante cambios del SO.
   - Exponer un bridge mínimo window.OnionPreferences para Cuenta.
   - Evitar flashes y escrituras DOM redundantes.
   - Sin imports, API, Auth, Router ni HTTP.
========================================================= */

(() => {
  "use strict";

  const PREBOOT_VERSION = "preboot.preferences.v4-theme-accent-locale";
  const DARK_QUERY = "(prefers-color-scheme: dark)";

  const STORAGE_KEYS = Object.freeze({
    themeMode: "onion.ui.themeMode",
    accent: "onion.ui.accent",
    locale: "onion.ui.locale",
  });

  const THEME_MODES = Object.freeze(["system", "light", "dark"]);
  const LOCALES = Object.freeze(["es", "ca", "en"]);
  const ACCENTS = Object.freeze(["graphite", "blue", "violet", "emerald", "rose"]);

  const ACCENT_PALETTES = Object.freeze({
    graphite: null,
    blue: Object.freeze({
      accent: "#3b82f6",
      hover: "#60a5fa",
      active: "#2563eb",
      rgb: "59, 130, 246",
    }),
    violet: Object.freeze({
      accent: "#8b5cf6",
      hover: "#a78bfa",
      active: "#7c3aed",
      rgb: "139, 92, 246",
    }),
    emerald: Object.freeze({
      accent: "#10b981",
      hover: "#34d399",
      active: "#059669",
      rgb: "16, 185, 129",
    }),
    rose: Object.freeze({
      accent: "#f43f5e",
      hover: "#fb7185",
      active: "#e11d48",
      rgb: "244, 63, 94",
    }),
  });

  const THEME_COLORS = Object.freeze({
    light: "#ffffff",
    dark: "#0a0c11",
  });

  const DEFAULTS = Object.freeze({
    themeMode: "system",
    accent: "graphite",
    locale: "es",
  });

  const ACCENT_STYLE_KEYS = Object.freeze([
    "--accent",
    "--accent-hover",
    "--accent-active",
    "--accent-2",
    "--accent-3",
    "--accent-4",
    "--accent-5",
    "--accent-soft",
    "--accent-soft-2",
    "--accent-ghost",
    "--accent-subtle",
    "--accent-ring",
    "--accent-border",
    "--accent-border-strong",
    "--accent-glow",
    "--accent-glow-strong",
    "--accent-contrast",
    "--brand",
    "--brand-hover",
    "--brand-active",
    "--brand-soft",
    "--brand-ring",
    "--brand-border",
    "--border-accent",
    "--border-accent-strong",
    "--focus-ring",
    "--focus-ring-strong",
    "--selection-bg",
    "--btn-primary-bg",
    "--btn-primary-bg-hover",
    "--btn-primary-bg-active",
    "--btn-primary-border",
    "--btn-primary-border-hover",
  ]);

  let mediaQuery = null;
  let listenerBound = false;
  let current = { ...DEFAULTS, theme: "light" };

  function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  function normalizeThemeMode(value = "") {
    const key = String(value || "").trim().toLowerCase();
    return THEME_MODES.includes(key) ? key : DEFAULTS.themeMode;
  }

  function normalizeAccent(value = "") {
    const key = String(value || "").trim().toLowerCase();
    return ACCENTS.includes(key) ? key : DEFAULTS.accent;
  }

  function normalizeLocale(value = "") {
    const key = String(value || "").trim().toLowerCase().replace("_", "-");
    if (key.startsWith("ca")) return "ca";
    if (key.startsWith("en")) return "en";
    return "es";
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
    return getMediaQuery()?.matches ? "dark" : "light";
  }

  function getEffectiveTheme(themeMode = DEFAULTS.themeMode) {
    const mode = normalizeThemeMode(themeMode);
    return mode === "system" ? getSystemTheme() : mode;
  }

  function readStorage(key = "", fallback = "") {
    if (!isBrowser()) return fallback;
    try {
      return window.localStorage?.getItem(key) || fallback;
    } catch {
      return fallback;
    }
  }

  function writeStorage(key = "", value = "") {
    if (!isBrowser()) return false;
    try {
      window.localStorage?.setItem(key, String(value));
      return true;
    } catch {
      return false;
    }
  }

  function readPreferences() {
    return {
      themeMode: normalizeThemeMode(readStorage(STORAGE_KEYS.themeMode, DEFAULTS.themeMode)),
      accent: normalizeAccent(readStorage(STORAGE_KEYS.accent, DEFAULTS.accent)),
      locale: normalizeLocale(readStorage(STORAGE_KEYS.locale, DEFAULTS.locale)),
    };
  }

  function setAttr(node, name, value) {
    if (!node) return false;
    const next = String(value);
    if (node.getAttribute(name) === next) return false;
    node.setAttribute(name, next);
    return true;
  }

  function setData(node, name, value) {
    if (!node?.dataset) return false;
    const next = String(value);
    if (node.dataset[name] === next) return false;
    node.dataset[name] = next;
    return true;
  }

  function setClass(node, name, enabled) {
    if (!node?.classList) return false;
    const next = enabled === true;
    if (node.classList.contains(name) === next) return false;
    node.classList.toggle(name, next);
    return true;
  }

  function clearAccentOverrides(node) {
    if (!node?.style) return false;
    let changed = false;
    for (const key of ACCENT_STYLE_KEYS) {
      if (node.style.getPropertyValue(key)) {
        node.style.removeProperty(key);
        changed = true;
      }
    }
    return changed;
  }

  function setStyle(node, key, value) {
    if (!node?.style) return false;
    const next = String(value);
    if (node.style.getPropertyValue(key).trim() === next) return false;
    node.style.setProperty(key, next);
    return true;
  }

  function applyAccent(node, accent = DEFAULTS.accent) {
    if (!node) return false;
    const key = normalizeAccent(accent);
    const palette = ACCENT_PALETTES[key];
    setData(node, "accent", key);

    if (!palette) return clearAccentOverrides(node);

    const rgb = palette.rgb;
    let changed = false;
    const assignments = {
      "--accent": palette.accent,
      "--accent-hover": palette.hover,
      "--accent-active": palette.active,
      "--accent-2": palette.active,
      "--accent-3": palette.hover,
      "--accent-4": palette.accent,
      "--accent-5": palette.active,
      "--accent-soft": `rgba(${rgb}, .14)`,
      "--accent-soft-2": `rgba(${rgb}, .11)`,
      "--accent-ghost": `rgba(${rgb}, .08)`,
      "--accent-subtle": `rgba(${rgb}, .055)`,
      "--accent-ring": `rgba(${rgb}, .30)`,
      "--accent-border": `rgba(${rgb}, .32)`,
      "--accent-border-strong": `rgba(${rgb}, .48)`,
      "--accent-glow": `rgba(${rgb}, .14)`,
      "--accent-glow-strong": `rgba(${rgb}, .22)`,
      "--accent-contrast": "#ffffff",
      "--brand": palette.accent,
      "--brand-hover": palette.hover,
      "--brand-active": palette.active,
      "--brand-soft": `rgba(${rgb}, .14)`,
      "--brand-ring": `rgba(${rgb}, .30)`,
      "--brand-border": `rgba(${rgb}, .32)`,
      "--border-accent": `rgba(${rgb}, .32)`,
      "--border-accent-strong": `rgba(${rgb}, .48)`,
      "--focus-ring": `0 0 0 3px rgba(${rgb}, .24)`,
      "--focus-ring-strong": `0 0 0 3px rgba(${rgb}, .38)`,
      "--selection-bg": `rgba(${rgb}, .30)`,
      "--btn-primary-bg": palette.accent,
      "--btn-primary-bg-hover": palette.hover,
      "--btn-primary-bg-active": palette.active,
      "--btn-primary-border": palette.accent,
      "--btn-primary-border-hover": palette.hover,
    };

    for (const [name, value] of Object.entries(assignments)) {
      changed = setStyle(node, name, value) || changed;
    }
    return changed;
  }

  function applyTheme(node, theme = "light", themeMode = DEFAULTS.themeMode) {
    if (!node) return false;
    const effective = theme === "dark" ? "dark" : "light";
    const mode = normalizeThemeMode(themeMode);
    let changed = false;
    changed = setClass(node, "no-js", false) || changed;
    changed = setClass(node, "js", true) || changed;
    changed = setClass(node, "theme-light", effective === "light") || changed;
    changed = setClass(node, "theme-dark", effective === "dark") || changed;
    changed = setData(node, "theme", effective) || changed;
    changed = setData(node, "themeMode", mode) || changed;
    changed = setData(node, "themeSource", mode === "system" ? "system" : "preference") || changed;
    changed = setData(node, "systemTheme", getSystemTheme()) || changed;
    changed = setData(node, "themeReady", "true") || changed;
    return changed;
  }

  function applyLocale(node, locale = DEFAULTS.locale) {
    if (!node) return false;
    const value = normalizeLocale(locale);
    let changed = false;
    changed = setAttr(node, "lang", value) || changed;
    changed = setAttr(node, "dir", "ltr") || changed;
    changed = setData(node, "locale", value) || changed;
    changed = setData(node, "localeSource", "preference") || changed;
    changed = setData(node, "localeFallback", "es") || changed;
    changed = setData(node, "localeSupported", LOCALES.join(",")) || changed;
    return changed;
  }

  function applyThemeColor(theme = "light") {
    if (!isBrowser()) return false;
    const color = THEME_COLORS[theme === "dark" ? "dark" : "light"];
    let changed = false;
    try {
      document.querySelectorAll("meta[name='theme-color']").forEach((meta) => {
        let next = color;
        if (meta.hasAttribute("data-onion-theme-color-light")) next = THEME_COLORS.light;
        if (meta.hasAttribute("data-onion-theme-color-dark")) next = THEME_COLORS.dark;
        changed = setAttr(meta, "content", next) || changed;
      });
    } catch {
      return false;
    }
    return changed;
  }

  function emitChanged(previous, next) {
    if (!isBrowser()) return false;
    if (
      previous.themeMode === next.themeMode &&
      previous.theme === next.theme &&
      previous.accent === next.accent &&
      previous.locale === next.locale
    ) return false;

    try {
      window.dispatchEvent(new CustomEvent("onion:preferences:changed", {
        detail: { ...next, previous: { ...previous } },
      }));
      return true;
    } catch {
      return false;
    }
  }

  function writeSnapshot(next) {
    if (!isBrowser()) return false;
    try {
      window.__ONION_PREBOOT__ = Object.freeze({
        version: PREBOOT_VERSION,
        theme: next.theme,
        themeMode: next.themeMode,
        themeSource: next.themeMode === "system" ? "system" : "preference",
        systemTheme: getSystemTheme(),
        accent: next.accent,
        locale: next.locale,
        localeSource: "preference",
        fallbackLocale: "es",
        supportedLocales: Object.freeze([...LOCALES]),
        supportedAccents: Object.freeze([...ACCENTS]),
        ready: true,
        updatedAt: new Date().toISOString(),
      });
      return true;
    } catch {
      return false;
    }
  }

  function applyPreferences(preferences = null, { emit = false } = {}) {
    if (!isBrowser()) return false;
    const source = preferences && typeof preferences === "object" ? preferences : readPreferences();
    const next = {
      themeMode: normalizeThemeMode(source.themeMode),
      accent: normalizeAccent(source.accent),
      locale: normalizeLocale(source.locale),
    };
    next.theme = getEffectiveTheme(next.themeMode);

    const previous = { ...current };
    let changed = false;
    const html = document.documentElement;
    const body = document.body;

    for (const node of [html, body]) {
      if (!node) continue;
      changed = applyTheme(node, next.theme, next.themeMode) || changed;
      changed = applyLocale(node, next.locale) || changed;
      changed = applyAccent(node, next.accent) || changed;
      changed = setData(node, "prebootThemeVersion", PREBOOT_VERSION) || changed;
    }

    changed = applyThemeColor(next.theme) || changed;
    current = next;
    writeSnapshot(next);
    if (emit) emitChanged(previous, next);
    return changed;
  }

  function setThemeMode(value) {
    const themeMode = normalizeThemeMode(value);
    writeStorage(STORAGE_KEYS.themeMode, themeMode);
    applyPreferences({ ...current, themeMode }, { emit: true });
    return { ...current };
  }

  function setAccent(value) {
    const accent = normalizeAccent(value);
    writeStorage(STORAGE_KEYS.accent, accent);
    applyPreferences({ ...current, accent }, { emit: true });
    return { ...current };
  }

  function setLocale(value) {
    const locale = normalizeLocale(value);
    writeStorage(STORAGE_KEYS.locale, locale);
    applyPreferences({ ...current, locale }, { emit: true });
    return { ...current };
  }

  function getSnapshot() {
    return {
      version: PREBOOT_VERSION,
      ...current,
      supportedThemeModes: [...THEME_MODES],
      supportedAccents: [...ACCENTS],
      supportedLocales: [...LOCALES],
    };
  }

  function onSystemThemeChange() {
    if (current.themeMode !== "system") return false;
    return applyPreferences(current, { emit: true });
  }

  function bindSystemThemeListener() {
    if (listenerBound) return true;
    const query = getMediaQuery();
    if (!query) return false;
    try {
      if (typeof query.addEventListener === "function") {
        query.addEventListener("change", onSystemThemeChange);
      } else if (typeof query.addListener === "function") {
        query.addListener(onSystemThemeChange);
      } else {
        return false;
      }
      listenerBound = true;
      return true;
    } catch {
      return false;
    }
  }

  if (!isBrowser()) return;

  current = { ...readPreferences(), theme: getSystemTheme() };
  applyPreferences(current);
  bindSystemThemeListener();

  window.OnionPreferences = Object.freeze({
    version: PREBOOT_VERSION,
    get: getSnapshot,
    getSnapshot,
    apply: () => applyPreferences(readPreferences(), { emit: true }),
    setThemeMode,
    setAccent,
    setLocale,
  });

  if (!document.body && document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      applyPreferences(current);
    }, { once: true });
  } else if (document.body) {
    applyPreferences(current);
  }
})();
