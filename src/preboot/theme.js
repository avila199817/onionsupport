/* =========================================================
   Onion Support - Preboot Preferences
   Archivo: /src/preboot/theme.js

   Responsabilidad:
   - Aplicar tema e idioma antes del boot de la SPA.
   - Persistir únicamente themeMode e idioma de interfaz.
   - Mantener themeMode="system" vivo ante cambios del SO.
   - Exponer window.OnionPreferences para Cuenta.
   - Evitar flashes y escrituras DOM redundantes.
   - Sin compatibilidad de acento, imports, API, Auth, Router ni HTTP.
========================================================= */

(() => {
  "use strict";

  const PREBOOT_VERSION = "preboot.preferences.v6-theme-locale-only";
  const DARK_QUERY = "(prefers-color-scheme: dark)";

  const STORAGE_KEYS = Object.freeze({
    themeMode: "onion.ui.themeMode",
    locale: "onion.ui.locale",
  });

  const THEME_MODES = Object.freeze(["system", "light", "dark"]);
  const LOCALES = Object.freeze(["es", "ca", "en"]);
  const THEME_COLORS = Object.freeze({ light: "#ffffff", dark: "#0a0c11" });
  const DEFAULTS = Object.freeze({ themeMode: "system", locale: "es" });

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
      themeMode: normalizeThemeMode(
        readStorage(STORAGE_KEYS.themeMode, DEFAULTS.themeMode)
      ),
      locale: normalizeLocale(
        readStorage(STORAGE_KEYS.locale, DEFAULTS.locale)
      ),
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
    changed = setData(
      node,
      "themeSource",
      mode === "system" ? "system" : "preference"
    ) || changed;
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
      previous.locale === next.locale
    ) {
      return false;
    }

    try {
      window.dispatchEvent(
        new CustomEvent("onion:preferences:changed", {
          detail: { ...next, previous: { ...previous } },
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  function getSnapshot() {
    return {
      version: PREBOOT_VERSION,
      ...current,
      supportedThemeModes: [...THEME_MODES],
      supportedLocales: [...LOCALES],
    };
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
        locale: next.locale,
        localeSource: "preference",
        fallbackLocale: "es",
        supportedLocales: Object.freeze([...LOCALES]),
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

    const source =
      preferences && typeof preferences === "object"
        ? preferences
        : readPreferences();
    const next = {
      themeMode: normalizeThemeMode(source.themeMode),
      locale: normalizeLocale(source.locale),
    };
    next.theme = getEffectiveTheme(next.themeMode);

    const previous = { ...current };
    let changed = false;

    for (const node of [document.documentElement, document.body]) {
      if (!node) continue;
      changed = applyTheme(node, next.theme, next.themeMode) || changed;
      changed = applyLocale(node, next.locale) || changed;
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

  function setLocale(value) {
    const locale = normalizeLocale(value);
    writeStorage(STORAGE_KEYS.locale, locale);
    applyPreferences({ ...current, locale }, { emit: true });
    return { ...current };
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
    setLocale,
  });

  if (!document.body && document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => applyPreferences(current),
      { once: true }
    );
  } else if (document.body) {
    applyPreferences(current);
  }
})();
