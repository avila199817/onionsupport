/* =========================================================
   Onion SPA - Early Theme Boot
   Archivo: src/preboot/theme.js

   ONION SUPPORT · PREBOOT THEME ENGINE
   EXTREME PRO SYSTEM · CSP CLEAN · ZERO DEPENDENCIES
   FINAL EXTREME 10/10

   RESPONSABILIDADES:
   - aplicar tema antes del primer paint
   - ejecutarse en <head> antes de /src/css/app.css
   - resolver modo system desde navegador / sistema operativo
   - soportar dark / light / system
   - soportar aliases auto / browser / os / device
   - soportar storage namespaced y legacy
   - soportar valores raw, JSON, objetos serializados y strings JSON
   - soportar settings/user/preferences/ui anidados
   - soportar darkMode boolean sólo si existe explícitamente
   - sincronizar data-theme real: dark | light
   - sincronizar data-theme-mode: dark | light | system
   - sincronizar data-theme-source
   - sincronizar data-system-theme
   - sincronizar clases theme-dark / theme-light
   - sincronizar meta color-scheme y theme-color
   - no romper si localStorage/sessionStorage está bloqueado
   - exponer bridge público seguro para cambios tempranos
   - reaccionar a cambios de sistema si el modo es system
   - dejar snapshot debug seguro en window.__ONION_BOOT_THEME__

   PRIORIDAD REAL:
   1) runtime forcedTheme
   2) storage themeMode / appearance / theme
   3) runtime defaultTheme
   4) system
   5) fallback dark

   HARDENING:
   - sin dependencias de AppCore
   - sin innerHTML
   - sin localStorage.clear()
   - sin throws accidentales
   - sin CSS inline
   - sin <script> dentro de este archivo
   - storage cacheado para no bloquear primer paint
   - lectura directa primero, objetos grandes al final
   - tolerancia a valores corruptos: undefined/null/[object Object]/{} / []
========================================================= */

(() => {
  "use strict";

  /* =========================================================
     VERSION
  ========================================================= */

  const PREBOOT_THEME_VERSION =
    "10.0.0";

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const VALID_RESOLVED_THEMES =
    Object.freeze([
      "dark",
      "light",
    ]);

  const VALID_THEME_MODES =
    Object.freeze([
      "dark",
      "light",
      "system",
    ]);

  const DEFAULT_MODE =
    "system";

  const FALLBACK_THEME =
    "dark";

  const DEFAULT_STORAGE_PREFIX =
    "onion";

  const MAX_JSON_DEPTH =
    4;

  const MAX_STORAGE_READS =
    96;

  const MAX_RAW_VALUE_LENGTH =
    20000;

  const THEME_COLORS =
    Object.freeze({
      dark:
        "#0a0c11",

      light:
        "#f4f7fb",
    });

  const THEME_CLASS_NAMES =
    Object.freeze([
      "theme-dark",
      "theme-light",
    ]);

  const SOURCE_PRIORITY =
    Object.freeze({
      runtimeForced:
        100,

      storage:
        80,

      runtimeDefault:
        40,

      system:
        20,

      fallback:
        1,
    });

  const DIRECT_THEME_KEYS =
    Object.freeze([
      /*
        Orden intencional:
        themeMode va antes que theme.

        Motivo:
        - themeMode puede ser "system"
        - theme puede guardar el resultado visual "dark/light"
        - si leemos theme antes, perderíamos el modo system guardado
      */
      "themeMode",
      "theme_mode",
      "appearance",
      "colorMode",
      "color_mode",
      "mode",
      "theme",
    ]);

  const OBJECT_THEME_KEYS =
    Object.freeze([
      /*
        Objetos potencialmente grandes.
        Se leen al final para no penalizar el preboot.
      */
      "settings",
      "user",
      "preferences",
      "profile",
      "ui",
    ]);

  const LEGACY_THEME_KEYS =
    Object.freeze([
      "onion:themeMode",
      "onion:theme_mode",
      "onion:appearance",
      "onion:colorMode",
      "onion:color_mode",
      "onion:mode",
      "onion:theme",

      "onion_themeMode",
      "onion_theme_mode",
      "onion_appearance",
      "onion_colorMode",
      "onion_color_mode",
      "onion_mode",
      "onion_theme",

      "themeMode",
      "theme_mode",
      "appearance",
      "colorMode",
      "color_mode",
      "mode",
      "theme",

      "onion:settings",
      "onion:user",
      "onion:preferences",
      "onion:profile",
      "onion:ui",

      "onion_settings",
      "onion_user",
      "onion_preferences",
      "onion_profile",
      "onion_ui",

      "settings",
      "user",
      "preferences",
      "profile",
      "ui",
    ]);

  /* =========================================================
     STORAGE CACHE
  ========================================================= */

  let cachedLocalStorage =
    undefined;

  let cachedSessionStorage =
    undefined;

  let cachedStoragePrefix =
    "";

  /* =========================================================
     SAFE HELPERS
  ========================================================= */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

  function isFunction(value) {
    return typeof value === "function";
  }

  function isObject(value) {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    );
  }

  function safeObject(value, fallback = {}) {
    return isObject(value)
      ? value
      : fallback;
  }

  function safeArray(value) {
    return Array.isArray(value)
      ? value
      : [];
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

  function safeBool(value, fallback = false) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }

    if (typeof value === "string") {
      const key =
        value.trim().toLowerCase();

      if (
        [
          "true",
          "1",
          "yes",
          "si",
          "sí",
          "ok",
          "on",
          "enabled",
          "active",
        ].includes(key)
      ) {
        return true;
      }

      if (
        [
          "false",
          "0",
          "no",
          "off",
          "disabled",
          "inactive",
        ].includes(key)
      ) {
        return false;
      }
    }

    return Boolean(fallback);
  }

  function unique(values = []) {
    const result =
      [];

    const seen =
      new Set();

    for (const item of safeArray(values)) {
      const text =
        safeText(item, "");

      if (
        text &&
        !seen.has(text)
      ) {
        seen.add(text);
        result.push(text);
      }
    }

    return result;
  }

  function hasOwn(obj, key) {
    return Boolean(
      obj &&
      typeof obj === "object" &&
      Object.prototype.hasOwnProperty.call(
        obj,
        key
      )
    );
  }

  function nowIso() {
    try {
      return new Date().toISOString();
    } catch {
      return "";
    }
  }

  function clampRawValue(raw = "") {
    const text =
      safeText(raw, "");

    if (!text) {
      return "";
    }

    if (text.length > MAX_RAW_VALUE_LENGTH) {
      return text.slice(
        0,
        MAX_RAW_VALUE_LENGTH
      );
    }

    return text;
  }

  function isValidResolvedTheme(value) {
    return VALID_RESOLVED_THEMES.includes(
      value
    );
  }

  function isValidThemeMode(value) {
    return VALID_THEME_MODES.includes(
      value
    );
  }

  function isCorruptedString(value = "") {
    const key =
      safeLower(value, "");

    return Boolean(
      !key ||
      key === "undefined" ||
      key === "null" ||
      key === "nan" ||
      key === "[object object]" ||
      key === "{}" ||
      key === "[]" ||
      key === "\"\"" ||
      key === "''"
    );
  }

  /* =========================================================
     RUNTIME CONFIG
  ========================================================= */

  function getRuntimeConfig() {
    if (!isBrowser()) {
      return {};
    }

    try {
      return isObject(window.__ONION_CONFIG__)
        ? window.__ONION_CONFIG__
        : {};
    } catch {
      return {};
    }
  }

  function getRuntimeThemeConfig() {
    const config =
      getRuntimeConfig();

    const ui =
      safeObject(config.ui);

    const theme =
      safeObject(config.theme);

    const preferences =
      safeObject(config.preferences);

    return {
      storagePrefix:
        safeText(
          config.storagePrefix ??
          config.storage_prefix ??
          ui.storagePrefix ??
          ui.storage_prefix ??
          theme.storagePrefix ??
          theme.storage_prefix ??
          DEFAULT_STORAGE_PREFIX,
          DEFAULT_STORAGE_PREFIX
        ),

      forcedTheme:
        config.forcedTheme ??
        config.forced_theme ??
        ui.forcedTheme ??
        ui.forced_theme ??
        theme.forcedTheme ??
        theme.forced_theme ??
        "",

      defaultTheme:
        config.defaultTheme ??
        config.default_theme ??
        config.themeMode ??
        config.theme_mode ??
        config.appearance ??
        ui.defaultTheme ??
        ui.default_theme ??
        ui.themeMode ??
        ui.theme_mode ??
        ui.appearance ??
        theme.defaultTheme ??
        theme.default_theme ??
        theme.mode ??
        theme.appearance ??
        preferences.defaultTheme ??
        preferences.default_theme ??
        preferences.themeMode ??
        preferences.theme_mode ??
        preferences.appearance ??
        "",

      themeColorDark:
        ui.themeColorDark ??
        ui.theme_color_dark ??
        theme.themeColorDark ??
        theme.theme_color_dark ??
        THEME_COLORS.dark,

      themeColorLight:
        ui.themeColorLight ??
        ui.theme_color_light ??
        theme.themeColorLight ??
        theme.theme_color_light ??
        THEME_COLORS.light,
    };
  }

  function getStoragePrefix() {
    if (cachedStoragePrefix) {
      return cachedStoragePrefix;
    }

    cachedStoragePrefix =
      safeText(
        getRuntimeThemeConfig().storagePrefix,
        DEFAULT_STORAGE_PREFIX
      );

    return cachedStoragePrefix;
  }

  /* =========================================================
     STORAGE
  ========================================================= */

  function getStorage(kind = "localStorage") {
    if (!isBrowser()) {
      return null;
    }

    try {
      const storage =
        window[kind];

      if (!storage) {
        return null;
      }

      const probe =
        `__onion_theme_probe_${kind}__`;

      storage.setItem(probe, "1");
      storage.removeItem(probe);

      return storage;
    } catch {
      return null;
    }
  }

  function getLocalStorage() {
    if (cachedLocalStorage !== undefined) {
      return cachedLocalStorage;
    }

    cachedLocalStorage =
      getStorage("localStorage");

    return cachedLocalStorage;
  }

  function getSessionStorage() {
    if (cachedSessionStorage !== undefined) {
      return cachedSessionStorage;
    }

    cachedSessionStorage =
      getStorage("sessionStorage");

    return cachedSessionStorage;
  }

  function readStorageRawFrom(storage, key = "") {
    const finalKey =
      safeText(key, "");

    if (
      !storage ||
      !finalKey
    ) {
      return "";
    }

    try {
      return clampRawValue(
        storage.getItem(finalKey) || ""
      );
    } catch {
      return "";
    }
  }

  function writeStorageRawTo(storage, key = "", value = "") {
    const finalKey =
      safeText(key, "");

    const finalValue =
      safeText(value, "");

    if (
      !storage ||
      !finalKey ||
      !finalValue
    ) {
      return false;
    }

    try {
      storage.setItem(
        finalKey,
        finalValue
      );

      return true;
    } catch {
      return false;
    }
  }

  function readStorageRaw(key = "") {
    const finalKey =
      safeText(key, "");

    if (!finalKey) {
      return "";
    }

    const localValue =
      readStorageRawFrom(
        getLocalStorage(),
        finalKey
      );

    if (localValue) {
      return localValue;
    }

    return readStorageRawFrom(
      getSessionStorage(),
      finalKey
    );
  }

  function writePersistentStorageRaw(key = "", value = "") {
    const localOk =
      writeStorageRawTo(
        getLocalStorage(),
        key,
        value
      );

    if (localOk) {
      return true;
    }

    return writeStorageRawTo(
      getSessionStorage(),
      key,
      value
    );
  }

  function normalizeKeyVariants(key = "") {
    const cleanKey =
      safeText(key, "");

    if (!cleanKey) {
      return [];
    }

    const snakeKey =
      cleanKey
        .replace(/[.:]/g, "_");

    const colonKey =
      cleanKey
        .replace(/[_.]/g, ":");

    const dotKey =
      cleanKey
        .replace(/[:_]/g, ".");

    return unique([
      cleanKey,
      snakeKey,
      colonKey,
      dotKey,
    ]);
  }

  function buildNamespacedKeyCandidates(key = "") {
    const cleanKey =
      safeText(key, "");

    if (!cleanKey) {
      return [];
    }

    const prefix =
      getStoragePrefix();

    const baseVariants =
      normalizeKeyVariants(cleanKey);

    const candidates =
      [];

    for (const variant of baseVariants) {
      candidates.push(variant);
      candidates.push(`${prefix}:${variant}`);
      candidates.push(`${prefix}_${variant.replace(/[.:]/g, "_")}`);
      candidates.push(`${prefix}.${variant.replace(/[:_]/g, ".")}`);
    }

    if (cleanKey.startsWith(`${prefix}:`)) {
      candidates.push(
        cleanKey.slice(prefix.length + 1)
      );
    }

    if (cleanKey.startsWith(`${prefix}_`)) {
      candidates.push(
        cleanKey.slice(prefix.length + 1)
      );
    }

    if (cleanKey.startsWith(`${prefix}.`)) {
      candidates.push(
        cleanKey.slice(prefix.length + 1)
      );
    }

    return unique(candidates);
  }

  function getStorageKeys() {
    const prefix =
      getStoragePrefix();

    const direct =
      [];

    for (const key of DIRECT_THEME_KEYS) {
      direct.push(`${prefix}:${key}`);
      direct.push(`${prefix}_${key}`);
      direct.push(`${prefix}.${key}`);
      direct.push(key);
    }

    const objectKeys =
      [];

    for (const key of OBJECT_THEME_KEYS) {
      objectKeys.push(`${prefix}:${key}`);
      objectKeys.push(`${prefix}_${key}`);
      objectKeys.push(`${prefix}.${key}`);
      objectKeys.push(key);
    }

    return unique([
      ...direct,
      ...LEGACY_THEME_KEYS,
      ...objectKeys,
    ]);
  }

  /* =========================================================
     SYSTEM THEME
  ========================================================= */

  function getSystemTheme() {
    if (!isBrowser()) {
      return FALLBACK_THEME;
    }

    try {
      if (
        isFunction(window.matchMedia) &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      ) {
        return "dark";
      }
    } catch {}

    try {
      if (
        isFunction(window.matchMedia) &&
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
     VALUE NORMALIZATION
  ========================================================= */

  function normalizeThemeMode(value = "") {
    const key =
      safeLower(value, "")
        .replace(/^["']+|["']+$/g, "")
        .trim();

    if (!key) {
      return "";
    }

    if (
      [
        "system",
        "auto",
        "automatic",
        "browser",
        "os",
        "device",
        "system-preference",
        "system_preference",
        "prefers-color-scheme",
        "prefers_color_scheme",
        "match",
        "match-system",
        "match_system",
      ].includes(key)
    ) {
      return "system";
    }

    if (
      [
        "dark",
        "black",
        "night",
        "nocturno",
        "oscuro",
        "dark-mode",
        "dark_mode",
        "theme-dark",
        "theme_dark",
      ].includes(key)
    ) {
      return "dark";
    }

    if (
      [
        "light",
        "white",
        "day",
        "diurno",
        "claro",
        "light-mode",
        "light_mode",
        "theme-light",
        "theme_light",
      ].includes(key)
    ) {
      return "light";
    }

    return "";
  }

  function parseJsonRecursive(raw = "", depth = 0) {
    if (depth > MAX_JSON_DEPTH) {
      return raw;
    }

    if (typeof raw !== "string") {
      return raw;
    }

    const value =
      raw.trim();

    if (
      !value ||
      isCorruptedString(value)
    ) {
      return "";
    }

    const looksLikeJson =
      value.startsWith("{") ||
      value.startsWith("[") ||
      value.startsWith("\"") ||
      value.startsWith("'");

    if (!looksLikeJson) {
      return value;
    }

    try {
      const parsed =
        JSON.parse(value);

      if (typeof parsed === "string") {
        return parseJsonRecursive(
          parsed,
          depth + 1
        );
      }

      return parsed;
    } catch {
      return value;
    }
  }

  function extractThemeModeFromObject(value = null) {
    if (!isObject(value)) {
      return "";
    }

    const ui =
      safeObject(value.ui);

    const preferences =
      safeObject(value.preferences);

    const settings =
      safeObject(value.settings);

    const profile =
      safeObject(value.profile);

    const raw =
      safeObject(value.raw);

    const account =
      safeObject(value.account);

    const user =
      safeObject(value.user);

    const nodes =
      [
        value,
        ui,
        preferences,
        settings,
        profile,
        raw,
        account,
        user,
        safeObject(raw.ui),
        safeObject(raw.preferences),
        safeObject(raw.settings),
        safeObject(raw.profile),
        safeObject(raw.account),
        safeObject(raw.user),
      ];

    const fields =
      [
        "themeMode",
        "theme_mode",
        "mode",
        "colorMode",
        "color_mode",
        "appearance",
        "theme",
        "defaultTheme",
        "default_theme",
        "preferredTheme",
        "preferred_theme",
      ];

    for (const node of nodes) {
      for (const field of fields) {
        const mode =
          normalizeThemeMode(node[field]);

        if (isValidThemeMode(mode)) {
          return mode;
        }
      }
    }

    /*
      darkMode boolean explícito.
      Sólo se usa si la propiedad existe.
      No se infiere por falsy genérico.
    */
    const boolFields =
      [
        "darkMode",
        "dark_mode",
        "isDark",
        "is_dark",
        "useDarkMode",
        "use_dark_mode",
      ];

    for (const node of nodes) {
      for (const field of boolFields) {
        if (hasOwn(node, field)) {
          return safeBool(node[field], false)
            ? "dark"
            : "light";
        }
      }
    }

    return "";
  }

  function parseThemeModeValue(raw = "") {
    if (
      raw === null ||
      raw === undefined
    ) {
      return "";
    }

    if (typeof raw === "boolean") {
      return raw
        ? "dark"
        : "light";
    }

    if (isObject(raw)) {
      const objectMode =
        extractThemeModeFromObject(raw);

      return isValidThemeMode(objectMode)
        ? objectMode
        : "";
    }

    const value =
      clampRawValue(raw);

    if (
      !value ||
      isCorruptedString(value)
    ) {
      return "";
    }

    const directMode =
      normalizeThemeMode(value);

    if (isValidThemeMode(directMode)) {
      return directMode;
    }

    const parsed =
      parseJsonRecursive(value);

    if (typeof parsed === "string") {
      const parsedMode =
        normalizeThemeMode(parsed);

      return isValidThemeMode(parsedMode)
        ? parsedMode
        : "";
    }

    if (isObject(parsed)) {
      const objectMode =
        extractThemeModeFromObject(parsed);

      return isValidThemeMode(objectMode)
        ? objectMode
        : "";
    }

    return "";
  }

  /* =========================================================
     THEME RESOLUTION
  ========================================================= */

  function resolveRuntimeForcedThemeMode() {
    const config =
      getRuntimeThemeConfig();

    const forcedMode =
      parseThemeModeValue(
        config.forcedTheme
      );

    if (isValidThemeMode(forcedMode)) {
      return {
        mode:
          forcedMode,
        source:
          "runtime:forcedTheme",
        key:
          "",
        priority:
          SOURCE_PRIORITY.runtimeForced,
      };
    }

    return {
      mode:
        "",
      source:
        "",
      key:
        "",
      priority:
        0,
    };
  }

  function resolveRuntimeDefaultThemeMode() {
    const config =
      getRuntimeThemeConfig();

    const defaultMode =
      parseThemeModeValue(
        config.defaultTheme
      );

    if (isValidThemeMode(defaultMode)) {
      return {
        mode:
          defaultMode,
        source:
          "runtime:defaultTheme",
        key:
          "",
        priority:
          SOURCE_PRIORITY.runtimeDefault,
      };
    }

    return {
      mode:
        "",
      source:
        "",
      key:
        "",
      priority:
        0,
    };
  }

  function resolveStoredThemeMode() {
    const keys =
      getStorageKeys();

    let reads =
      0;

    for (const key of keys) {
      const candidates =
        buildNamespacedKeyCandidates(key);

      for (const candidate of candidates) {
        if (reads >= MAX_STORAGE_READS) {
          return {
            mode:
              "",
            source:
              "",
            key:
              "",
            priority:
              0,
            exhausted:
              true,
          };
        }

        reads += 1;

        const raw =
          readStorageRaw(candidate);

        if (!raw) {
          continue;
        }

        const mode =
          parseThemeModeValue(raw);

        if (isValidThemeMode(mode)) {
          return {
            mode,
            source:
              `storage:${candidate}`,
            key:
              candidate,
            priority:
              SOURCE_PRIORITY.storage,
            exhausted:
              false,
          };
        }
      }
    }

    return {
      mode:
        "",
      source:
        "",
      key:
        "",
      priority:
        0,
      exhausted:
        false,
    };
  }

  function resolveInitialThemeMode() {
    /*
      Orden correcto:
      forcedTheme > storage > defaultTheme > system
    */

    const forced =
      resolveRuntimeForcedThemeMode();

    if (isValidThemeMode(forced.mode)) {
      return forced;
    }

    const stored =
      resolveStoredThemeMode();

    if (isValidThemeMode(stored.mode)) {
      return stored;
    }

    const runtimeDefault =
      resolveRuntimeDefaultThemeMode();

    if (isValidThemeMode(runtimeDefault.mode)) {
      return runtimeDefault;
    }

    return {
      mode:
        DEFAULT_MODE,
      source:
        "system",
      key:
        "",
      priority:
        SOURCE_PRIORITY.system,
      exhausted:
        Boolean(stored.exhausted),
    };
  }

  /* =========================================================
     META / DOM HELPERS
  ========================================================= */

  function getThemeColor(theme = FALLBACK_THEME) {
    const config =
      getRuntimeThemeConfig();

    if (theme === "light") {
      return safeText(
        config.themeColorLight,
        THEME_COLORS.light
      );
    }

    return safeText(
      config.themeColorDark,
      THEME_COLORS.dark
    );
  }

  function getHead() {
    if (!isBrowser()) {
      return null;
    }

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

  function querySelector(selector = "") {
    if (
      !isBrowser() ||
      !selector
    ) {
      return null;
    }

    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  }

  function setMeta(name = "", content = "", extraAttrs = {}) {
    const finalName =
      safeText(name, "");

    const finalContent =
      safeText(content, "");

    const head =
      getHead();

    if (
      !head ||
      !finalName ||
      !finalContent
    ) {
      return false;
    }

    try {
      let meta =
        querySelector(
          `meta[name="${finalName}"][data-onion-managed="theme"]`
        );

      if (!meta) {
        meta =
          querySelector(
            `meta[name="${finalName}"]:not([media])`
          );
      }

      if (!meta) {
        meta =
          document.createElement("meta");

        meta.setAttribute(
          "name",
          finalName
        );

        head.appendChild(meta);
      }

      meta.setAttribute(
        "content",
        finalContent
      );

      meta.setAttribute(
        "data-onion-managed",
        "theme"
      );

      const attrs =
        safeObject(extraAttrs);

      for (const [key, value] of Object.entries(attrs)) {
        if (
          value !== null &&
          value !== undefined &&
          value !== ""
        ) {
          meta.setAttribute(
            key,
            String(value)
          );
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  function syncMeta(theme = FALLBACK_THEME) {
    const finalTheme =
      isValidResolvedTheme(theme)
        ? theme
        : FALLBACK_THEME;

    setMeta(
      "theme-color",
      getThemeColor(finalTheme),
      {
        "data-onion-theme-color":
          "true",
      }
    );

    setMeta(
      "color-scheme",
      finalTheme === "dark"
        ? "dark light"
        : "light dark",
      {
        "data-onion-color-scheme":
          "true",
      }
    );

    return true;
  }

  function applyThemeClassList(element, theme = FALLBACK_THEME) {
    if (!element) {
      return false;
    }

    const finalTheme =
      isValidResolvedTheme(theme)
        ? theme
        : FALLBACK_THEME;

    try {
      for (const className of THEME_CLASS_NAMES) {
        element.classList.remove(className);
      }

      element.classList.add(
        `theme-${finalTheme}`
      );

      return true;
    } catch {
      return false;
    }
  }

  function applyThemeToElement(element, payload = {}) {
    if (!element) {
      return false;
    }

    const theme =
      isValidResolvedTheme(payload.theme)
        ? payload.theme
        : FALLBACK_THEME;

    const mode =
      isValidThemeMode(payload.mode)
        ? payload.mode
        : DEFAULT_MODE;

    const source =
      safeText(payload.source, "unknown");

    const systemTheme =
      isValidResolvedTheme(payload.systemTheme)
        ? payload.systemTheme
        : getSystemTheme();

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

      element.setAttribute(
        "data-system-theme",
        systemTheme
      );

      element.setAttribute(
        "data-theme-ready",
        "true"
      );

      applyThemeClassList(
        element,
        theme
      );

      return true;
    } catch {
      return false;
    }
  }

  function applyThemeToBodyWhenReady(payload = {}) {
    if (!isBrowser()) {
      return false;
    }

    try {
      if (document.body) {
        applyThemeToElement(
          document.body,
          payload
        );

        return true;
      }

      document.addEventListener(
        "DOMContentLoaded",
        () => {
          try {
            if (document.body) {
              applyThemeToElement(
                document.body,
                payload
              );
            }
          } catch {}
        },
        {
          once:
            true,
        }
      );

      return true;
    } catch {
      return false;
    }
  }

  /* =========================================================
     PAYLOAD / SNAPSHOT
  ========================================================= */

  function buildPayload({
    mode = DEFAULT_MODE,
    source = "system",
    persistedKey = "",
    priority = 0,
    exhausted = false,
  } = {}) {
    const finalMode =
      isValidThemeMode(mode)
        ? mode
        : DEFAULT_MODE;

    const systemTheme =
      getSystemTheme();

    const resolvedTheme =
      resolveThemeFromMode(finalMode);

    const finalTheme =
      isValidResolvedTheme(resolvedTheme)
        ? resolvedTheme
        : FALLBACK_THEME;

    return {
      version:
        PREBOOT_THEME_VERSION,

      theme:
        finalTheme,

      mode:
        finalMode,

      source:
        safeText(source, "unknown"),

      persistedKey:
        safeText(persistedKey, ""),

      systemTheme,

      fallbackTheme:
        FALLBACK_THEME,

      priority:
        Number.isFinite(Number(priority))
          ? Number(priority)
          : 0,

      storageExhausted:
        Boolean(exhausted),

      at:
        nowIso(),
    };
  }

  function freezePayload(payload = {}) {
    try {
      return Object.freeze({
        ...payload,
      });
    } catch {
      return payload;
    }
  }

  function setBootSnapshot(payload = {}) {
    if (!isBrowser()) {
      return false;
    }

    try {
      window.__ONION_BOOT_THEME__ =
        freezePayload(payload);

      return true;
    } catch {
      try {
        window.__ONION_BOOT_THEME__ =
          payload;

        return true;
      } catch {
        return false;
      }
    }
  }

  function getBootSnapshot() {
    if (!isBrowser()) {
      return {};
    }

    try {
      return {
        ...(window.__ONION_BOOT_THEME__ || {}),
      };
    } catch {
      return {};
    }
  }

  /* =========================================================
     EVENTS
  ========================================================= */

  function emitThemeEvent(payload = {}) {
    if (!isBrowser()) {
      return false;
    }

    try {
      window.dispatchEvent(
        new CustomEvent(
          "onion:theme:change",
          {
            detail:
              payload,
          }
        )
      );

      return true;
    } catch {
      return false;
    }
  }

  /* =========================================================
     PERSISTENCE
  ========================================================= */

  function persistThemePayload(payload = {}) {
    const prefix =
      getStoragePrefix();

    const theme =
      isValidResolvedTheme(payload.theme)
        ? payload.theme
        : FALLBACK_THEME;

    const mode =
      isValidThemeMode(payload.mode)
        ? payload.mode
        : DEFAULT_MODE;

    try {
      /*
        Semántica correcta:
        - theme = resultado visual real: dark | light
        - themeMode = preferencia: dark | light | system
      */
      const okTheme =
        writePersistentStorageRaw(
          `${prefix}:theme`,
          theme
        );

      const okThemeMode =
        writePersistentStorageRaw(
          `${prefix}:themeMode`,
          mode
        );

      const okAppearance =
        writePersistentStorageRaw(
          `${prefix}:appearance`,
          mode
        );

      return Boolean(
        okTheme ||
        okThemeMode ||
        okAppearance
      );
    } catch {
      return false;
    }
  }

  /* =========================================================
     APPLY THEME
  ========================================================= */

  function applyTheme({
    mode = DEFAULT_MODE,
    source = "system",
    persistedKey = "",
    persist = false,
    emit = false,
    priority = 0,
    exhausted = false,
  } = {}) {
    if (!isBrowser()) {
      return FALLBACK_THEME;
    }

    const payload =
      buildPayload({
        mode,
        source,
        persistedKey,
        priority,
        exhausted,
      });

    try {
      applyThemeToElement(
        document.documentElement,
        payload
      );
    } catch {}

    applyThemeToBodyWhenReady(payload);

    syncMeta(payload.theme);

    setBootSnapshot(payload);

    if (persist) {
      persistThemePayload(payload);
    }

    if (emit) {
      emitThemeEvent(payload);
    }

    return payload.theme;
  }

  /* =========================================================
     PUBLIC BRIDGE
  ========================================================= */

  function definePublicProperty(name = "", value = null) {
    if (!isBrowser()) {
      return false;
    }

    const finalName =
      safeText(name, "");

    if (!finalName) {
      return false;
    }

    try {
      Object.defineProperty(
        window,
        finalName,
        {
          value,
          configurable:
            true,
          enumerable:
            false,
          writable:
            false,
        }
      );

      return true;
    } catch {
      try {
        window[finalName] =
          value;

        return true;
      } catch {
        return false;
      }
    }
  }

  function exposePublicApi() {
    if (!isBrowser()) {
      return false;
    }

    const setTheme =
      function setOnionTheme(mode = DEFAULT_MODE) {
        const finalMode =
          normalizeThemeMode(mode) ||
          DEFAULT_MODE;

        return applyTheme({
          mode:
            finalMode,
          source:
            "manual",
          persistedKey:
            `${getStoragePrefix()}:themeMode`,
          persist:
            true,
          emit:
            true,
          priority:
            SOURCE_PRIORITY.storage,
        });
      };

    const getTheme =
      function getOnionTheme() {
        return getBootSnapshot();
      };

    const resolveTheme =
      function resolveOnionTheme(mode = DEFAULT_MODE) {
        const finalMode =
          normalizeThemeMode(mode) ||
          DEFAULT_MODE;

        return buildPayload({
          mode:
            finalMode,
          source:
            "resolve",
          persistedKey:
            "",
          priority:
            0,
        });
      };

    const clearTheme =
      function clearOnionTheme() {
        /*
          No se borra todo el storage.
          Sólo claves conocidas del tema.
        */
        const prefix =
          getStoragePrefix();

        const keys =
          unique([
            `${prefix}:theme`,
            `${prefix}:themeMode`,
            `${prefix}:theme_mode`,
            `${prefix}:appearance`,
            `${prefix}_theme`,
            `${prefix}_themeMode`,
            `${prefix}_theme_mode`,
            `${prefix}_appearance`,
            "theme",
            "themeMode",
            "theme_mode",
            "appearance",
          ]);

        const local =
          getLocalStorage();

        const session =
          getSessionStorage();

        for (const key of keys) {
          try {
            if (local) {
              local.removeItem(key);
            }
          } catch {}

          try {
            if (session) {
              session.removeItem(key);
            }
          } catch {}
        }

        return applyTheme({
          mode:
            DEFAULT_MODE,
          source:
            "manual:clear",
          persistedKey:
            "",
          persist:
            false,
          emit:
            true,
          priority:
            SOURCE_PRIORITY.system,
        });
      };

    definePublicProperty(
      "__ONION_SET_THEME__",
      setTheme
    );

    definePublicProperty(
      "__ONION_GET_THEME__",
      getTheme
    );

    definePublicProperty(
      "__ONION_RESOLVE_THEME__",
      resolveTheme
    );

    definePublicProperty(
      "__ONION_CLEAR_THEME__",
      clearTheme
    );

    return true;
  }

  /* =========================================================
     SYSTEM CHANGE LISTENER
  ========================================================= */

  function getSystemMediaQuery() {
    if (!isBrowser()) {
      return null;
    }

    try {
      if (!isFunction(window.matchMedia)) {
        return null;
      }

      return window.matchMedia(
        "(prefers-color-scheme: dark)"
      );
    } catch {
      return null;
    }
  }

  function bindSystemThemeListener() {
    const media =
      getSystemMediaQuery();

    if (!media) {
      return false;
    }

    const handler =
      () => {
        try {
          const current =
            getBootSnapshot();

          if (current.mode !== "system") {
            return;
          }

          applyTheme({
            mode:
              "system",
            source:
              "system-change",
            persistedKey:
              current.persistedKey || "",
            persist:
              false,
            emit:
              true,
            priority:
              SOURCE_PRIORITY.system,
          });
        } catch {}
      };

    try {
      if (isFunction(media.addEventListener)) {
        media.addEventListener(
          "change",
          handler
        );

        return true;
      }
    } catch {}

    try {
      if (isFunction(media.addListener)) {
        media.addListener(handler);
        return true;
      }
    } catch {}

    return false;
  }

  /* =========================================================
     BOOT / FALLBACK
  ========================================================= */

  function bootTheme() {
    const resolved =
      resolveInitialThemeMode();

    applyTheme({
      mode:
        resolved.mode || DEFAULT_MODE,
      source:
        resolved.source || "system",
      persistedKey:
        resolved.key || "",
      persist:
        false,
      emit:
        false,
      priority:
        resolved.priority || 0,
      exhausted:
        Boolean(resolved.exhausted),
    });

    return resolved;
  }

  function applyFallbackTheme() {
    try {
      applyTheme({
        mode:
          FALLBACK_THEME,
        source:
          "fallback",
        persistedKey:
          "",
        persist:
          false,
        emit:
          false,
        priority:
          SOURCE_PRIORITY.fallback,
      });

      return true;
    } catch {}

    try {
      const html =
        document.documentElement;

      html.setAttribute(
        "data-theme",
        FALLBACK_THEME
      );

      html.setAttribute(
        "data-theme-mode",
        FALLBACK_THEME
      );

      html.setAttribute(
        "data-theme-source",
        "fallback-hard"
      );

      html.setAttribute(
        "data-system-theme",
        FALLBACK_THEME
      );

      html.setAttribute(
        "data-theme-ready",
        "true"
      );

      applyThemeClassList(
        html,
        FALLBACK_THEME
      );

      syncMeta(FALLBACK_THEME);

      return true;
    } catch {
      return false;
    }
  }

  /* =========================================================
     START
  ========================================================= */

  try {
    bootTheme();
    exposePublicApi();
    bindSystemThemeListener();
  } catch {
    applyFallbackTheme();
  }
})();
