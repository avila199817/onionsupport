/* =========================================================
   Onion SPA - Early Theme Boot
   Archivo: /src/preboot/theme.js

   ONION SUPPORT · PREBOOT THEME ENGINE
   CSP CLEAN · ZERO DEPENDENCIES · TOKEN SYSTEM READY

   Responsabilidades:
   - Aplicar tema antes del primer paint.
   - Ejecutarse en <head> antes de /src/css/app.css.
   - Resolver dark / light / system.
   - Soportar aliases: auto / browser / os / device.
   - Priorizar runtime forcedTheme.
   - Leer storage namespaced Onion antes que claves genéricas.
   - Soportar localStorage y sessionStorage bloqueados.
   - Soportar valores raw, JSON, strings JSON y objetos anidados.
   - Sincronizar html[data-theme] y body cuando exista.
   - Sincronizar meta theme-color / color-scheme / TileColor.
   - Reaccionar a cambios de sistema si themeMode === system.
   - Reaccionar a cambios cross-tab de storage.
   - Exponer bridge seguro: window.__ONION_THEME__.
   - Dejar snapshot seguro: window.__ONION_BOOT_THEME__.

   Reglas:
   - Sin AppCore.
   - Sin imports.
   - Sin CSS inline.
   - Sin innerHTML.
   - Sin estilos inyectados.
   - Sin localStorage.clear().
   - Sin sessionStorage.clear().
   - Sin throws accidentales.
========================================================= */

(() => {
  "use strict";

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const VERSION = "12.0.0";

  const DEFAULT_STORAGE_PREFIX = "onion";
  const DEFAULT_MODE = "system";
  const FALLBACK_THEME = "dark";

  const VALID_MODES = Object.freeze([
    "dark",
    "light",
    "system",
  ]);

  const VALID_THEMES = Object.freeze([
    "dark",
    "light",
  ]);

  const THEME_COLORS = Object.freeze({
    dark: "#0a0c11",
    light: "#f4f7fb",
  });

  const PRIORITY = Object.freeze({
    forced: 100,
    storage: 80,
    runtime: 40,
    system: 20,
    fallback: 1,
  });

  const THEME_CLASSES = Object.freeze([
    "theme-dark",
    "theme-light",
  ]);

  const DIRECT_THEME_KEYS = Object.freeze([
    "themeMode",
    "theme_mode",
    "appearance",
    "colorMode",
    "color_mode",
    "mode",
    "theme",
  ]);

  const OBJECT_THEME_KEYS = Object.freeze([
    "settings",
    "preferences",
    "profile",
    "ui",
    "user",
    "account",
  ]);

  const LEGACY_THEME_KEYS = Object.freeze([
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

    "onion.themeMode",
    "onion.theme_mode",
    "onion.appearance",
    "onion.colorMode",
    "onion.color_mode",
    "onion.mode",
    "onion.theme",

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
    "onion:account",

    "onion_settings",
    "onion_user",
    "onion_preferences",
    "onion_profile",
    "onion_ui",
    "onion_account",

    "onion.settings",
    "onion.user",
    "onion.preferences",
    "onion.profile",
    "onion.ui",
    "onion.account",

    "settings",
    "user",
    "preferences",
    "profile",
    "ui",
    "account",
  ]);

  const MODE_FIELDS = Object.freeze([
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
    "uiTheme",
    "ui_theme",
  ]);

  const BOOLEAN_DARK_FIELDS = Object.freeze([
    "darkMode",
    "dark_mode",
    "isDark",
    "is_dark",
    "useDarkMode",
    "use_dark_mode",
  ]);

  const PREFERRED_OBJECT_NODES = Object.freeze([
    "ui",
    "preferences",
    "settings",
    "profile",
    "raw",
    "account",
    "user",
    "theme",
    "appearance",
    "data",
  ]);

  const MAX_JSON_DEPTH = 4;
  const MAX_OBJECT_DEPTH = 4;
  const MAX_OBJECT_NODES = 96;
  const MAX_ARRAY_ITEMS = 24;
  const MAX_STORAGE_READS = 180;
  const MAX_RAW_LENGTH = 20000;
  const MAX_PREFIX_LENGTH = 64;

  /* =========================================================
     RUNTIME STATE
  ========================================================= */

  let cachedLocalStorage = undefined;
  let cachedSessionStorage = undefined;
  let cachedStoragePrefix = "";
  let bodySyncBound = false;
  let systemListenerBound = false;
  let storageListenerBound = false;
  let lastAppliedSignature = "";

  /* =========================================================
     BASIC HELPERS
  ========================================================= */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined" &&
      Boolean(document.documentElement)
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

    const text = String(value).trim();

    return text || fallback;
  }

  function safeLower(value, fallback = "") {
    return safeText(value, fallback).toLowerCase();
  }

  function safeNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number)
      ? number
      : fallback;
  }

  function hasOwn(objectValue, key = "") {
    return Boolean(
      objectValue &&
      typeof objectValue === "object" &&
      Object.prototype.hasOwnProperty.call(objectValue, key)
    );
  }

  function unique(values = []) {
    const output = [];
    const seen = new Set();

    for (const value of safeArray(values)) {
      const text = safeText(value, "");

      if (
        text &&
        !seen.has(text)
      ) {
        seen.add(text);
        output.push(text);
      }
    }

    return output;
  }

  function nowIso() {
    try {
      return new Date().toISOString();
    } catch {
      return "";
    }
  }

  function clampRaw(raw = "") {
    const text = safeText(raw, "");

    if (!text) {
      return "";
    }

    return text.length > MAX_RAW_LENGTH
      ? text.slice(0, MAX_RAW_LENGTH)
      : text;
  }

  function normalizeStoragePrefix(value = DEFAULT_STORAGE_PREFIX) {
    const raw =
      safeText(value, DEFAULT_STORAGE_PREFIX)
        .slice(0, MAX_PREFIX_LENGTH);

    const clean =
      raw
        .replace(/[^\w.-]/g, "")
        .replace(/^[._-]+|[._-]+$/g, "");

    return clean || DEFAULT_STORAGE_PREFIX;
  }

  function isValidMode(value) {
    return VALID_MODES.includes(value);
  }

  function isValidTheme(value) {
    return VALID_THEMES.includes(value);
  }

  function isEmptyOrCorruptScalar(value = "") {
    const key = safeLower(value, "");

    return Boolean(
      !key ||
      key === "undefined" ||
      key === "null" ||
      key === "nan" ||
      key === "[object object]" ||
      key === "\"\"" ||
      key === "''"
    );
  }

  function parseStrictBoolean(value) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
      return null;
    }

    if (typeof value === "string") {
      const key = value.trim().toLowerCase();

      if (
        [
          "true",
          "1",
          "yes",
          "si",
          "sí",
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

    return null;
  }

  /* =========================================================
     RUNTIME CONFIG
  ========================================================= */

  function getRuntimeConfig() {
    if (!isBrowser()) {
      return {};
    }

    try {
      const base =
        isObject(window.__ONION_CONFIG__)
          ? window.__ONION_CONFIG__
          : {};

      const themeConfig =
        isObject(window.__ONION_THEME_CONFIG__)
          ? window.__ONION_THEME_CONFIG__
          : {};

      const rawThemeValue =
        !isObject(base.theme)
          ? base.theme
          : "";

      return {
        ...base,

        rawThemeValue,

        theme: {
          ...safeObject(base.theme),
          ...safeObject(themeConfig),
        },
      };
    } catch {
      return {};
    }
  }

  function getRuntimeThemeConfig() {
    const config = getRuntimeConfig();

    const ui = safeObject(config.ui);
    const theme = safeObject(config.theme);
    const preferences = safeObject(config.preferences);
    const settings = safeObject(config.settings);

    return {
      storagePrefix:
        normalizeStoragePrefix(
          config.storagePrefix ??
            config.storage_prefix ??
            config.appKey ??
            config.app_key ??
            config.appId ??
            config.app_id ??
            ui.storagePrefix ??
            ui.storage_prefix ??
            theme.storagePrefix ??
            theme.storage_prefix ??
            settings.storagePrefix ??
            settings.storage_prefix ??
            DEFAULT_STORAGE_PREFIX
        ),

      forcedTheme:
        config.forcedTheme ??
        config.forced_theme ??
        config.themeForced ??
        config.theme_forced ??
        ui.forcedTheme ??
        ui.forced_theme ??
        theme.forcedTheme ??
        theme.forced_theme ??
        settings.forcedTheme ??
        settings.forced_theme ??
        "",

      defaultTheme:
        config.defaultTheme ??
        config.default_theme ??
        config.themeMode ??
        config.theme_mode ??
        config.appearance ??
        config.rawThemeValue ??
        ui.defaultTheme ??
        ui.default_theme ??
        ui.themeMode ??
        ui.theme_mode ??
        ui.appearance ??
        theme.defaultTheme ??
        theme.default_theme ??
        theme.mode ??
        theme.themeMode ??
        theme.theme_mode ??
        theme.appearance ??
        preferences.defaultTheme ??
        preferences.default_theme ??
        preferences.themeMode ??
        preferences.theme_mode ??
        preferences.appearance ??
        settings.defaultTheme ??
        settings.default_theme ??
        settings.themeMode ??
        settings.theme_mode ??
        settings.appearance ??
        "",

      themeColorDark:
        ui.themeColorDark ??
        ui.theme_color_dark ??
        theme.themeColorDark ??
        theme.theme_color_dark ??
        settings.themeColorDark ??
        settings.theme_color_dark ??
        THEME_COLORS.dark,

      themeColorLight:
        ui.themeColorLight ??
        ui.theme_color_light ??
        theme.themeColorLight ??
        theme.theme_color_light ??
        settings.themeColorLight ??
        settings.theme_color_light ??
        THEME_COLORS.light,
    };
  }

  function getStoragePrefix() {
    if (cachedStoragePrefix) {
      return cachedStoragePrefix;
    }

    cachedStoragePrefix =
      normalizeStoragePrefix(
        getRuntimeThemeConfig().storagePrefix ||
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
      const storage = window[kind];

      if (!storage) {
        return null;
      }

      const testKey =
        `__onion_theme_probe_${Date.now()}_${Math.random()}`;

      try {
        storage.setItem(testKey, "1");
        storage.removeItem(testKey);
      } catch {
        /*
          Algunos navegadores permiten getItem pero bloquean setItem.
          Para preboot nos sirve lectura parcial.
        */
      }

      return storage;
    } catch {
      return null;
    }
  }

  function getLocalStorage() {
    if (cachedLocalStorage !== undefined) {
      return cachedLocalStorage;
    }

    cachedLocalStorage = getStorage("localStorage");

    return cachedLocalStorage;
  }

  function getSessionStorage() {
    if (cachedSessionStorage !== undefined) {
      return cachedSessionStorage;
    }

    cachedSessionStorage = getStorage("sessionStorage");

    return cachedSessionStorage;
  }

  function readStorageRawFrom(storage, key = "") {
    const finalKey = safeText(key, "");

    if (
      !storage ||
      !finalKey
    ) {
      return "";
    }

    try {
      const raw = storage.getItem(finalKey);

      if (
        raw === null ||
        raw === undefined
      ) {
        return "";
      }

      return clampRaw(raw);
    } catch {
      return "";
    }
  }

  function readStorageRaw(key = "") {
    const finalKey = safeText(key, "");

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

  function writeStorageRawTo(storage, key = "", value = "") {
    const finalKey = safeText(key, "");
    const finalValue = safeText(value, "");

    if (
      !storage ||
      !finalKey ||
      !finalValue
    ) {
      return false;
    }

    try {
      storage.setItem(finalKey, finalValue);
      return true;
    } catch {
      return false;
    }
  }

  function writeStorageRaw(key = "", value = "") {
    return (
      writeStorageRawTo(
        getLocalStorage(),
        key,
        value
      ) ||
      writeStorageRawTo(
        getSessionStorage(),
        key,
        value
      )
    );
  }

  function removeStorageKeyFrom(storage, key = "") {
    const finalKey = safeText(key, "");

    if (
      !storage ||
      !finalKey
    ) {
      return false;
    }

    try {
      storage.removeItem(finalKey);
      return true;
    } catch {
      return false;
    }
  }

  function normalizeKeyVariants(key = "") {
    const cleanKey = safeText(key, "");

    if (!cleanKey) {
      return [];
    }

    return unique([
      cleanKey,
      cleanKey.replace(/[.:]/g, "_"),
      cleanKey.replace(/[_.]/g, ":"),
      cleanKey.replace(/[:_]/g, "."),
    ]);
  }

  function buildNamespacedKeyCandidates(key = "") {
    const cleanKey = safeText(key, "");

    if (!cleanKey) {
      return [];
    }

    const prefix = getStoragePrefix();
    const variants = normalizeKeyVariants(cleanKey);

    const namespaced = [];
    const bare = [];

    for (const variant of variants) {
      const snake = variant.replace(/[.:]/g, "_");
      const dot = variant.replace(/[:_]/g, ".");

      namespaced.push(`${prefix}:${variant}`);
      namespaced.push(`${prefix}_${snake}`);
      namespaced.push(`${prefix}.${dot}`);

      bare.push(variant);
    }

    if (cleanKey.startsWith(`${prefix}:`)) {
      bare.push(cleanKey.slice(prefix.length + 1));
    }

    if (cleanKey.startsWith(`${prefix}_`)) {
      bare.push(cleanKey.slice(prefix.length + 1));
    }

    if (cleanKey.startsWith(`${prefix}.`)) {
      bare.push(cleanKey.slice(prefix.length + 1));
    }

    return unique([
      ...namespaced,
      ...bare,
    ]);
  }

  function buildStoragePlan(keys = []) {
    const output = [];

    for (const key of safeArray(keys)) {
      output.push(...buildNamespacedKeyCandidates(key));
    }

    return unique(output);
  }

  function getDirectStorageKeys() {
    return unique([
      ...buildStoragePlan(DIRECT_THEME_KEYS),
      ...LEGACY_THEME_KEYS,
    ]);
  }

  function getObjectStorageKeys() {
    return unique([
      ...buildStoragePlan(OBJECT_THEME_KEYS),
      ...OBJECT_THEME_KEYS,
    ]);
  }

  function isThemeStorageKey(key = "") {
    const cleanKey = safeText(key, "");

    if (!cleanKey) {
      return false;
    }

    const normalized =
      cleanKey
        .toLowerCase()
        .replace(/[.:]/g, "_");

    return Boolean(
      normalized.includes("theme") ||
        normalized.includes("appearance") ||
        normalized.includes("colormode") ||
        normalized.includes("color_mode") ||
        normalized.endsWith("_mode") ||
        normalized.endsWith("_settings") ||
        normalized.endsWith("_preferences") ||
        normalized.endsWith("_ui") ||
        normalized.endsWith("_user") ||
        normalized.endsWith("_profile") ||
        normalized.endsWith("_account")
    );
  }

  /* =========================================================
     SYSTEM THEME
  ========================================================= */

  function getSystemMediaQuery() {
    if (!isBrowser()) {
      return null;
    }

    try {
      if (!isFunction(window.matchMedia)) {
        return null;
      }

      return window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return null;
    }
  }

  function getSystemTheme() {
    const darkMedia = getSystemMediaQuery();

    try {
      if (
        darkMedia &&
        darkMedia.matches
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
      isValidMode(mode)
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
        "default",
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
        "nightly",
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
        "daily",
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

    const value = raw.trim();

    if (
      !value ||
      isEmptyOrCorruptScalar(value)
    ) {
      return "";
    }

    const looksLikeJson =
      value.startsWith("{") ||
      value.startsWith("[") ||
      value.startsWith("\"");

    if (!looksLikeJson) {
      return value;
    }

    try {
      const parsed = JSON.parse(value);

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

  function extractThemeModeFromAny(value, depth = 0, allowBoolean = false) {
    if (depth > MAX_JSON_DEPTH) {
      return "";
    }

    if (
      value === null ||
      value === undefined
    ) {
      return "";
    }

    if (typeof value === "boolean") {
      if (!allowBoolean) {
        return "";
      }

      return value
        ? "dark"
        : "light";
    }

    if (typeof value === "number") {
      if (!allowBoolean) {
        return "";
      }

      if (value === 1) return "dark";
      if (value === 0) return "light";

      return "";
    }

    if (typeof value === "string") {
      const raw = clampRaw(value);

      if (
        !raw ||
        isEmptyOrCorruptScalar(raw)
      ) {
        return "";
      }

      const direct = normalizeThemeMode(raw);

      if (isValidMode(direct)) {
        return direct;
      }

      if (allowBoolean) {
        const boolValue = parseStrictBoolean(raw);

        if (boolValue === true) return "dark";
        if (boolValue === false) return "light";
      }

      const parsed =
        parseJsonRecursive(
          raw,
          depth + 1
        );

      if (parsed !== raw) {
        return extractThemeModeFromAny(
          parsed,
          depth + 1,
          allowBoolean
        );
      }

      return "";
    }

    if (Array.isArray(value)) {
      for (const item of value.slice(0, MAX_ARRAY_ITEMS)) {
        const mode =
          extractThemeModeFromAny(
            item,
            depth + 1,
            allowBoolean
          );

        if (isValidMode(mode)) {
          return mode;
        }
      }

      return "";
    }

    if (isObject(value)) {
      return extractThemeModeFromObject(
        value,
        depth + 1
      );
    }

    return "";
  }

  function extractThemeModeFromObject(objectValue = {}, depth = 0) {
    if (
      !isObject(objectValue) ||
      depth > MAX_OBJECT_DEPTH
    ) {
      return "";
    }

    const visited = new Set();
    const queue = [];
    let visitedCount = 0;

    function enqueue(node, nodeDepth) {
      if (
        !isObject(node) ||
        nodeDepth > MAX_OBJECT_DEPTH ||
        visited.has(node) ||
        visitedCount >= MAX_OBJECT_NODES
      ) {
        return;
      }

      visited.add(node);

      queue.push({
        node,
        depth: nodeDepth,
      });
    }

    enqueue(objectValue, depth);

    for (const key of PREFERRED_OBJECT_NODES) {
      if (hasOwn(objectValue, key)) {
        enqueue(
          objectValue[key],
          depth + 1
        );
      }
    }

    while (queue.length) {
      const item = queue.shift();
      const node = item.node;
      const nodeDepth = item.depth;

      visitedCount += 1;

      for (const field of MODE_FIELDS) {
        if (!hasOwn(node, field)) {
          continue;
        }

        const mode =
          extractThemeModeFromAny(
            node[field],
            nodeDepth + 1,
            false
          );

        if (isValidMode(mode)) {
          return mode;
        }
      }

      for (const field of BOOLEAN_DARK_FIELDS) {
        if (!hasOwn(node, field)) {
          continue;
        }

        const boolValue =
          parseStrictBoolean(node[field]);

        if (boolValue === true) {
          return "dark";
        }

        if (boolValue === false) {
          return "light";
        }
      }

      if (nodeDepth >= MAX_OBJECT_DEPTH) {
        continue;
      }

      for (const key of PREFERRED_OBJECT_NODES) {
        if (hasOwn(node, key)) {
          enqueue(
            node[key],
            nodeDepth + 1
          );
        }
      }

      try {
        for (const key of Object.keys(node)) {
          const child = node[key];

          if (isObject(child)) {
            enqueue(
              child,
              nodeDepth + 1
            );
          }

          if (Array.isArray(child)) {
            for (const entry of child.slice(0, MAX_ARRAY_ITEMS)) {
              enqueue(
                entry,
                nodeDepth + 1
              );
            }
          }
        }
      } catch {}
    }

    return "";
  }

  function parseThemeModeValue(value = "") {
    return extractThemeModeFromAny(
      value,
      0,
      true
    );
  }

  /* =========================================================
     THEME RESOLUTION
  ========================================================= */

  function emptyResolution() {
    return {
      mode: "",
      source: "",
      key: "",
      priority: 0,
      exhausted: false,
    };
  }

  function resolveRuntimeForcedThemeMode() {
    const config = getRuntimeThemeConfig();

    const mode =
      parseThemeModeValue(config.forcedTheme);

    if (isValidMode(mode)) {
      return {
        mode,
        source: "runtime:forcedTheme",
        key: "",
        priority: PRIORITY.forced,
        exhausted: false,
      };
    }

    return emptyResolution();
  }

  function resolveRuntimeDefaultThemeMode() {
    const config = getRuntimeThemeConfig();

    const mode =
      parseThemeModeValue(config.defaultTheme);

    if (isValidMode(mode)) {
      return {
        mode,
        source: "runtime:defaultTheme",
        key: "",
        priority: PRIORITY.runtime,
        exhausted: false,
      };
    }

    return emptyResolution();
  }

  function resolveStoredThemeMode() {
    const directKeys = getDirectStorageKeys();
    const objectKeys = getObjectStorageKeys();

    let reads = 0;

    function readKeys(keys = [], phase = "direct") {
      for (const key of safeArray(keys)) {
        if (reads >= MAX_STORAGE_READS) {
          return {
            mode: "",
            source: "",
            key: "",
            priority: 0,
            exhausted: true,
          };
        }

        reads += 1;

        const raw = readStorageRaw(key);

        if (!raw) {
          continue;
        }

        const mode = parseThemeModeValue(raw);

        if (isValidMode(mode)) {
          return {
            mode,
            source: `storage:${phase}:${key}`,
            key,
            priority: PRIORITY.storage,
            exhausted: false,
          };
        }
      }

      return null;
    }

    const directResult = readKeys(directKeys, "direct");

    if (
      directResult &&
      (
        isValidMode(directResult.mode) ||
        directResult.exhausted
      )
    ) {
      return directResult;
    }

    const objectResult = readKeys(objectKeys, "object");

    if (
      objectResult &&
      (
        isValidMode(objectResult.mode) ||
        objectResult.exhausted
      )
    ) {
      return objectResult;
    }

    return emptyResolution();
  }

  function resolveInitialThemeMode() {
    const forced = resolveRuntimeForcedThemeMode();

    if (isValidMode(forced.mode)) {
      return forced;
    }

    const stored = resolveStoredThemeMode();

    if (isValidMode(stored.mode)) {
      return stored;
    }

    const runtime = resolveRuntimeDefaultThemeMode();

    if (isValidMode(runtime.mode)) {
      return runtime;
    }

    return {
      mode: DEFAULT_MODE,
      source: "system",
      key: "",
      priority: PRIORITY.system,
      exhausted: Boolean(stored.exhausted),
    };
  }

  /* =========================================================
     META / DOM
  ========================================================= */

  function getThemeColor(theme = FALLBACK_THEME) {
    const config = getRuntimeThemeConfig();

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

  function findMetaByName(name = "") {
    const finalName = safeText(name, "");

    if (
      !isBrowser() ||
      !finalName
    ) {
      return null;
    }

    try {
      const metas =
        Array.from(
          document.getElementsByTagName("meta")
        );

      const managed =
        metas.find((meta) => (
          meta.getAttribute("name") === finalName &&
          meta.getAttribute("data-onion-managed") === "theme"
        ));

      if (managed) {
        return managed;
      }

      return (
        metas.find((meta) => (
          meta.getAttribute("name") === finalName &&
          !meta.hasAttribute("media")
        )) ||
        null
      );
    } catch {
      return null;
    }
  }

  function setMeta(name = "", content = "", extraAttrs = {}) {
    const finalName = safeText(name, "");
    const finalContent = safeText(content, "");

    const head = getHead();

    if (
      !head ||
      !finalName ||
      !finalContent
    ) {
      return false;
    }

    try {
      let meta = findMetaByName(finalName);

      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", finalName);
        head.appendChild(meta);
      }

      meta.setAttribute("content", finalContent);
      meta.setAttribute("data-onion-managed", "theme");

      for (const [key, value] of Object.entries(safeObject(extraAttrs))) {
        if (
          value !== null &&
          value !== undefined &&
          value !== ""
        ) {
          meta.setAttribute(key, String(value));
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  function syncMeta(theme = FALLBACK_THEME) {
    const finalTheme =
      isValidTheme(theme)
        ? theme
        : FALLBACK_THEME;

    const themeColor = getThemeColor(finalTheme);

    setMeta(
      "theme-color",
      themeColor,
      {
        "data-onion-theme-color": "true",
      }
    );

    setMeta(
      "color-scheme",
      finalTheme === "dark"
        ? "dark light"
        : "light dark",
      {
        "data-onion-color-scheme": "true",
      }
    );

    setMeta(
      "msapplication-TileColor",
      themeColor,
      {
        "data-onion-tile-color": "true",
      }
    );

    return true;
  }

  function applyThemeClassList(element, theme = FALLBACK_THEME) {
    if (!element) {
      return false;
    }

    const finalTheme =
      isValidTheme(theme)
        ? theme
        : FALLBACK_THEME;

    try {
      for (const className of THEME_CLASSES) {
        element.classList.remove(className);
      }

      element.classList.add(`theme-${finalTheme}`);

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
      isValidTheme(payload.theme)
        ? payload.theme
        : FALLBACK_THEME;

    const mode =
      isValidMode(payload.mode)
        ? payload.mode
        : DEFAULT_MODE;

    const source =
      safeText(payload.source, "unknown");

    const systemTheme =
      isValidTheme(payload.systemTheme)
        ? payload.systemTheme
        : getSystemTheme();

    try {
      element.setAttribute("data-theme", theme);
      element.setAttribute("data-theme-mode", mode);
      element.setAttribute("data-theme-source", source);
      element.setAttribute("data-system-theme", systemTheme);
      element.setAttribute("data-theme-ready", "true");

      applyThemeClassList(element, theme);

      return true;
    } catch {
      return false;
    }
  }

  function syncBodyFromSnapshot() {
    if (!isBrowser()) {
      return false;
    }

    try {
      if (!document.body) {
        return false;
      }

      const current = getBootSnapshot();

      if (!current.theme) {
        return false;
      }

      return applyThemeToElement(
        document.body,
        current
      );
    } catch {
      return false;
    }
  }

  function bindBodySyncWhenReady() {
    if (
      !isBrowser() ||
      bodySyncBound
    ) {
      return false;
    }

    bodySyncBound = true;

    try {
      if (document.body) {
        syncBodyFromSnapshot();
        return true;
      }

      document.addEventListener(
        "DOMContentLoaded",
        () => {
          syncBodyFromSnapshot();
        },
        {
          once: true,
        }
      );

      return true;
    } catch {
      return false;
    }
  }

  /* =========================================================
     SNAPSHOT
  ========================================================= */

  function buildSignature(payload = {}) {
    return [
      payload.theme || "",
      payload.mode || "",
      payload.systemTheme || "",
      payload.source || "",
      payload.persistedKey || "",
    ].join("|");
  }

  function buildPayload({
    mode = DEFAULT_MODE,
    source = "system",
    persistedKey = "",
    priority = 0,
    exhausted = false,
  } = {}) {
    const finalMode =
      isValidMode(mode)
        ? mode
        : DEFAULT_MODE;

    const systemTheme = getSystemTheme();

    const resolvedTheme =
      resolveThemeFromMode(finalMode);

    const finalTheme =
      isValidTheme(resolvedTheme)
        ? resolvedTheme
        : FALLBACK_THEME;

    return {
      version: VERSION,

      theme: finalTheme,
      mode: finalMode,
      systemTheme,

      source: safeText(source, "unknown"),
      persistedKey: safeText(persistedKey, ""),

      fallbackTheme: FALLBACK_THEME,
      priority: safeNumber(priority, 0),
      storageExhausted: Boolean(exhausted),
      storagePrefix: getStoragePrefix(),

      at: nowIso(),
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
        window.__ONION_BOOT_THEME__ = payload;
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
      if (typeof CustomEvent === "function") {
        window.dispatchEvent(
          new CustomEvent(
            "onion:theme:change",
            {
              detail: payload,
            }
          )
        );

        return true;
      }

      const event =
        document.createEvent("CustomEvent");

      event.initCustomEvent(
        "onion:theme:change",
        false,
        false,
        payload
      );

      window.dispatchEvent(event);

      return true;
    } catch {
      return false;
    }
  }

  /* =========================================================
     PERSISTENCE
  ========================================================= */

  function persistThemePayload(payload = {}) {
    const prefix = getStoragePrefix();

    const theme =
      isValidTheme(payload.theme)
        ? payload.theme
        : FALLBACK_THEME;

    const mode =
      isValidMode(payload.mode)
        ? payload.mode
        : DEFAULT_MODE;

    try {
      const okTheme =
        writeStorageRaw(
          `${prefix}:theme`,
          theme
        );

      const okMode =
        writeStorageRaw(
          `${prefix}:themeMode`,
          mode
        );

      const okAppearance =
        writeStorageRaw(
          `${prefix}:appearance`,
          mode
        );

      return Boolean(
        okTheme ||
        okMode ||
        okAppearance
      );
    } catch {
      return false;
    }
  }

  function clearKnownThemeKeys() {
    const prefix = getStoragePrefix();

    const keys = unique([
      ...buildStoragePlan(DIRECT_THEME_KEYS),
      ...LEGACY_THEME_KEYS,

      `${prefix}:theme`,
      `${prefix}:themeMode`,
      `${prefix}:theme_mode`,
      `${prefix}:appearance`,
      `${prefix}:colorMode`,
      `${prefix}:color_mode`,
      `${prefix}:mode`,

      `${prefix}_theme`,
      `${prefix}_themeMode`,
      `${prefix}_theme_mode`,
      `${prefix}_appearance`,
      `${prefix}_colorMode`,
      `${prefix}_color_mode`,
      `${prefix}_mode`,

      `${prefix}.theme`,
      `${prefix}.themeMode`,
      `${prefix}.theme_mode`,
      `${prefix}.appearance`,
      `${prefix}.colorMode`,
      `${prefix}.color_mode`,
      `${prefix}.mode`,

      "theme",
      "themeMode",
      "theme_mode",
      "appearance",
      "colorMode",
      "color_mode",
      "mode",
    ]);

    const local = getLocalStorage();
    const session = getSessionStorage();

    let removed = false;

    for (const key of keys) {
      removed =
        removeStorageKeyFrom(local, key) ||
        removeStorageKeyFrom(session, key) ||
        removed;
    }

    return removed;
  }

  /* =========================================================
     APPLY
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

    const signature = buildSignature(payload);
    const changed = signature !== lastAppliedSignature;

    lastAppliedSignature = signature;

    try {
      applyThemeToElement(
        document.documentElement,
        payload
      );
    } catch {}

    setBootSnapshot(payload);
    bindBodySyncWhenReady();
    syncBodyFromSnapshot();
    syncMeta(payload.theme);

    if (persist) {
      persistThemePayload(payload);
    }

    if (
      emit &&
      changed
    ) {
      emitThemeEvent(payload);
    }

    return payload.theme;
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */

  function definePublicProperty(name = "", value = null) {
    if (!isBrowser()) {
      return false;
    }

    const finalName = safeText(name, "");

    if (!finalName) {
      return false;
    }

    try {
      Object.defineProperty(
        window,
        finalName,
        {
          value,
          configurable: true,
          enumerable: false,
          writable: false,
        }
      );

      return true;
    } catch {
      try {
        window[finalName] = value;
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

    const api = Object.freeze({
      version: VERSION,

      get() {
        return getBootSnapshot();
      },

      normalize(value = "") {
        return normalizeThemeMode(value);
      },

      resolve(mode = DEFAULT_MODE) {
        const finalMode =
          normalizeThemeMode(mode) ||
          DEFAULT_MODE;

        return buildPayload({
          mode: finalMode,
          source: "resolve",
          persistedKey: "",
          priority: 0,
        });
      },

      set(mode = DEFAULT_MODE, options = {}) {
        const finalMode =
          normalizeThemeMode(mode) ||
          DEFAULT_MODE;

        const opts = safeObject(options);

        return applyTheme({
          mode: finalMode,
          source: safeText(opts.source, "manual"),
          persistedKey: safeText(
            opts.persistedKey,
            `${getStoragePrefix()}:themeMode`
          ),
          persist: opts.persist !== false,
          emit: opts.emit !== false,
          priority: PRIORITY.storage,
        });
      },

      clear(options = {}) {
        const opts = safeObject(options);

        clearKnownThemeKeys();

        return applyTheme({
          mode: DEFAULT_MODE,
          source: safeText(opts.source, "manual:clear"),
          persistedKey: "",
          persist: false,
          emit: opts.emit !== false,
          priority: PRIORITY.system,
        });
      },

      reapply(options = {}) {
        const opts = safeObject(options);
        const resolved = resolveInitialThemeMode();

        return applyTheme({
          mode: resolved.mode || DEFAULT_MODE,
          source: safeText(
            opts.source,
            resolved.source || "reapply"
          ),
          persistedKey: resolved.key || "",
          persist: opts.persist === true,
          emit: opts.emit === true,
          priority: resolved.priority || 0,
          exhausted: Boolean(resolved.exhausted),
        });
      },

      persist() {
        return persistThemePayload(
          getBootSnapshot()
        );
      },
    });

    definePublicProperty("__ONION_THEME__", api);
    definePublicProperty("__ONION_SET_THEME__", api.set);
    definePublicProperty("__ONION_GET_THEME__", api.get);
    definePublicProperty("__ONION_RESOLVE_THEME__", api.resolve);
    definePublicProperty("__ONION_CLEAR_THEME__", api.clear);
    definePublicProperty("__ONION_REAPPLY_THEME__", api.reapply);

    return true;
  }

  /* =========================================================
     LISTENERS
  ========================================================= */

  function bindSystemThemeListener() {
    if (
      !isBrowser() ||
      systemListenerBound
    ) {
      return false;
    }

    const media = getSystemMediaQuery();

    if (!media) {
      return false;
    }

    systemListenerBound = true;

    const handler = () => {
      try {
        const current = getBootSnapshot();

        if (current.mode !== "system") {
          return;
        }

        applyTheme({
          mode: "system",
          source: "system-change",
          persistedKey: current.persistedKey || "",
          persist: false,
          emit: true,
          priority: PRIORITY.system,
        });
      } catch {}
    };

    try {
      if (isFunction(media.addEventListener)) {
        media.addEventListener("change", handler);
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

  function reapplyThemeFromCurrentSources(source = "storage-event") {
    const forced = resolveRuntimeForcedThemeMode();

    if (isValidMode(forced.mode)) {
      applyTheme({
        mode: forced.mode,
        source: `${source}:runtime-forced`,
        persistedKey: forced.key || "",
        persist: false,
        emit: true,
        priority: forced.priority,
      });

      return true;
    }

    const stored = resolveStoredThemeMode();

    if (isValidMode(stored.mode)) {
      applyTheme({
        mode: stored.mode,
        source,
        persistedKey: stored.key || "",
        persist: false,
        emit: true,
        priority: stored.priority,
        exhausted: Boolean(stored.exhausted),
      });

      return true;
    }

    const runtime = resolveRuntimeDefaultThemeMode();

    applyTheme({
      mode: runtime.mode || DEFAULT_MODE,
      source: runtime.mode
        ? `${source}:runtime-default`
        : `${source}:system`,
      persistedKey: "",
      persist: false,
      emit: true,
      priority:
        runtime.priority ||
        PRIORITY.system,
    });

    return true;
  }

  function bindStorageThemeListener() {
    if (
      !isBrowser() ||
      storageListenerBound
    ) {
      return false;
    }

    storageListenerBound = true;

    try {
      window.addEventListener(
        "storage",
        (event) => {
          try {
            if (!event) {
              return;
            }

            /*
              event.key === null puede venir de clear() externo.
              No usamos clear(), pero sí reaccionamos de forma segura.
            */
            if (
              event.key !== null &&
              !isThemeStorageKey(event.key || "")
            ) {
              return;
            }

            reapplyThemeFromCurrentSources("storage-event");
          } catch {}
        }
      );

      return true;
    } catch {
      return false;
    }
  }

  /* =========================================================
     BOOT / FALLBACK
  ========================================================= */

  function bootTheme() {
    const resolved = resolveInitialThemeMode();

    applyTheme({
      mode: resolved.mode || DEFAULT_MODE,
      source: resolved.source || "system",
      persistedKey: resolved.key || "",
      persist: false,
      emit: false,
      priority: resolved.priority || 0,
      exhausted: Boolean(resolved.exhausted),
    });

    return resolved;
  }

  function applyFallbackTheme() {
    try {
      applyTheme({
        mode: FALLBACK_THEME,
        source: "fallback",
        persistedKey: "",
        persist: false,
        emit: false,
        priority: PRIORITY.fallback,
      });

      return true;
    } catch {}

    try {
      const html = document.documentElement;

      html.setAttribute("data-theme", FALLBACK_THEME);
      html.setAttribute("data-theme-mode", FALLBACK_THEME);
      html.setAttribute("data-theme-source", "fallback-hard");
      html.setAttribute("data-system-theme", FALLBACK_THEME);
      html.setAttribute("data-theme-ready", "true");

      applyThemeClassList(html, FALLBACK_THEME);
      syncMeta(FALLBACK_THEME);

      setBootSnapshot({
        version: VERSION,
        theme: FALLBACK_THEME,
        mode: FALLBACK_THEME,
        systemTheme: FALLBACK_THEME,
        source: "fallback-hard",
        persistedKey: "",
        fallbackTheme: FALLBACK_THEME,
        priority: PRIORITY.fallback,
        storageExhausted: false,
        storagePrefix: DEFAULT_STORAGE_PREFIX,
        at: nowIso(),
      });

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
    bindStorageThemeListener();
    bindBodySyncWhenReady();
  } catch {
    applyFallbackTheme();
  }
})();
