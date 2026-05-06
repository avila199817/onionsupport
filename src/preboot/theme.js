/* =========================================================
   Onion SPA - Early Theme Boot
   Archivo: src/preboot/theme.js

   ONION SUPPORT · PREBOOT THEME ENGINE
   EXTREME PRO SYSTEM · CSP CLEAN · ZERO DEPENDENCIES
   FINAL EXTREME 10/10

   RESPONSABILIDADES:
   - Aplicar tema antes del primer paint.
   - Ejecutarse en <head> antes de /src/css/app.css.
   - Resolver modo system desde navegador / sistema operativo.
   - Soportar dark / light / system.
   - Soportar aliases auto / browser / os / device.
   - Soportar storage namespaced y legacy.
   - Soportar valores raw, JSON, objetos serializados y strings JSON.
   - Soportar settings/user/preferences/ui anidados.
   - Sincronizar data-theme real: dark | light.
   - Sincronizar data-theme-mode: dark | light | system.
   - Sincronizar data-theme-source.
   - Sincronizar data-system-theme.
   - Sincronizar clases theme-dark / theme-light.
   - Sincronizar meta color-scheme y theme-color.
   - No romper si localStorage/sessionStorage está bloqueado.
   - Exponer bridge público seguro para cambios tempranos.
   - Reaccionar a cambios de sistema si el modo es system.
   - Reaccionar a cambios cross-tab de storage.
   - Dejar snapshot debug seguro en window.__ONION_BOOT_THEME__.

   PRIORIDAD REAL:
   1) runtime forcedTheme
   2) storage themeMode / appearance / theme
   3) runtime defaultTheme
   4) system
   5) fallback dark

   HARDENING:
   - Sin dependencias de AppCore.
   - Sin innerHTML.
   - Sin localStorage.clear().
   - Sin throws accidentales.
   - Sin CSS inline.
   - Sin <script> dentro de este archivo.
   - Storage cacheado.
   - Lectura directa primero, objetos grandes al final.
   - Tolerancia a valores corruptos: undefined/null/[object Object]/{} / [].
========================================================= */

(() => {
  "use strict";

  /* =========================================================
     VERSION
  ========================================================= */

  const PREBOOT_THEME_VERSION = "10.1.0";

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
  const DEFAULT_STORAGE_PREFIX = "onion";

  const MAX_JSON_DEPTH = 4;
  const MAX_OBJECT_DEPTH = 4;
  const MAX_OBJECT_NODES = 96;
  const MAX_ARRAY_ITEMS = 24;
  const MAX_STORAGE_READS = 160;
  const MAX_RAW_VALUE_LENGTH = 20000;

  const THEME_COLORS = Object.freeze({
    dark: "#0a0c11",
    light: "#f4f7fb",
  });

  const THEME_CLASS_NAMES = Object.freeze([
    "theme-dark",
    "theme-light",
  ]);

  const SOURCE_PRIORITY = Object.freeze({
    runtimeForced: 100,
    storage: 80,
    runtimeDefault: 40,
    system: 20,
    fallback: 1,
  });

  const DIRECT_THEME_KEYS = Object.freeze([
    /*
      Orden intencional:
      themeMode va antes que theme.

      Motivo:
      - themeMode puede ser "system".
      - theme puede guardar el resultado visual "dark/light".
      - si leemos theme antes, perderíamos la preferencia system.
    */
    "themeMode",
    "theme_mode",
    "appearance",
    "colorMode",
    "color_mode",
    "mode",
    "theme",
  ]);

  const OBJECT_THEME_KEYS = Object.freeze([
    /*
      Objetos potencialmente grandes.
      Se leen al final para no penalizar el preboot.
    */
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

  const MODE_FIELD_NAMES = Object.freeze([
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

  const BOOL_DARK_FIELD_NAMES = Object.freeze([
    /*
      Boolean explícito.
      Sólo se usa si existe la propiedad.
    */
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
  ]);

  /* =========================================================
     INTERNAL CACHE
  ========================================================= */

  let cachedLocalStorage = undefined;
  let cachedSessionStorage = undefined;
  let cachedStoragePrefix = "";
  let bodySyncBound = false;
  let systemListenerBound = false;
  let storageListenerBound = false;

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

    const text = String(value).trim();

    return text || fallback;
  }

  function safeLower(value, fallback = "") {
    return safeText(value, fallback).toLowerCase();
  }

  function hasOwn(obj, key) {
    return Boolean(
      obj &&
      typeof obj === "object" &&
      Object.prototype.hasOwnProperty.call(obj, key)
    );
  }

  function unique(values = []) {
    const result = [];
    const seen = new Set();

    for (const item of safeArray(values)) {
      const text = safeText(item, "");

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

  function nowIso() {
    try {
      return new Date().toISOString();
    } catch {
      return "";
    }
  }

  function clampRawValue(raw = "") {
    const text = safeText(raw, "");

    if (!text) {
      return "";
    }

    if (text.length > MAX_RAW_VALUE_LENGTH) {
      return text.slice(0, MAX_RAW_VALUE_LENGTH);
    }

    return text;
  }

  function isValidResolvedTheme(value) {
    return VALID_RESOLVED_THEMES.includes(value);
  }

  function isValidThemeMode(value) {
    return VALID_THEME_MODES.includes(value);
  }

  function isCorruptedString(value = "") {
    const key = safeLower(value, "");

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

  function safeBoolean(value, fallback = false) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
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

  /* =========================================================
     RUNTIME CONFIG
  ========================================================= */

  function getRuntimeConfig() {
    if (!isBrowser()) {
      return {};
    }

    try {
      const config = isObject(window.__ONION_CONFIG__)
        ? window.__ONION_CONFIG__
        : {};

      const themeConfig = isObject(window.__ONION_THEME_CONFIG__)
        ? window.__ONION_THEME_CONFIG__
        : {};

      return {
        ...config,
        theme: {
          ...safeObject(config.theme),
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
        safeText(
          config.storagePrefix ??
          config.storage_prefix ??
          ui.storagePrefix ??
          ui.storage_prefix ??
          theme.storagePrefix ??
          theme.storage_prefix ??
          settings.storagePrefix ??
          settings.storage_prefix ??
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
        settings.forcedTheme ??
        settings.forced_theme ??
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
      safeText(
        getRuntimeThemeConfig().storagePrefix,
        DEFAULT_STORAGE_PREFIX
      ) || DEFAULT_STORAGE_PREFIX;

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

      /*
        No se hace setItem de prueba aquí.
        Motivo:
        - en algunos navegadores la lectura funciona y la escritura no;
        - para preboot nos interesa leer sin penalizar primer paint.
      */
      const length = storage.length;

      if (
        typeof length !== "number" &&
        length !== undefined
      ) {
        return null;
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
      return clampRawValue(storage.getItem(finalKey) || "");
    } catch {
      return "";
    }
  }

  function readStorageRaw(key = "") {
    const finalKey = safeText(key, "");

    if (!finalKey) {
      return "";
    }

    const localValue = readStorageRawFrom(
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

  function writePersistentStorageRaw(key = "", value = "") {
    const localOk = writeStorageRawTo(
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

    const snakeKey = cleanKey.replace(/[.:]/g, "_");
    const colonKey = cleanKey.replace(/[_.]/g, ":");
    const dotKey = cleanKey.replace(/[:_]/g, ".");

    return unique([
      cleanKey,
      snakeKey,
      colonKey,
      dotKey,
    ]);
  }

  function buildNamespacedKeyCandidates(key = "") {
    const cleanKey = safeText(key, "");

    if (!cleanKey) {
      return [];
    }

    const prefix = getStoragePrefix();
    const baseVariants = normalizeKeyVariants(cleanKey);
    const candidates = [];

    for (const variant of baseVariants) {
      const normalizedForSnake = variant.replace(/[.:]/g, "_");
      const normalizedForDot = variant.replace(/[:_]/g, ".");

      candidates.push(variant);
      candidates.push(`${prefix}:${variant}`);
      candidates.push(`${prefix}_${normalizedForSnake}`);
      candidates.push(`${prefix}.${normalizedForDot}`);
    }

    if (cleanKey.startsWith(`${prefix}:`)) {
      candidates.push(cleanKey.slice(prefix.length + 1));
    }

    if (cleanKey.startsWith(`${prefix}_`)) {
      candidates.push(cleanKey.slice(prefix.length + 1));
    }

    if (cleanKey.startsWith(`${prefix}.`)) {
      candidates.push(cleanKey.slice(prefix.length + 1));
    }

    return unique(candidates);
  }

  function buildStorageKeyPlan(names = []) {
    const candidates = [];

    for (const name of safeArray(names)) {
      candidates.push(...buildNamespacedKeyCandidates(name));
    }

    return unique(candidates);
  }

  function getDirectStorageKeys() {
    return unique([
      ...buildStorageKeyPlan(DIRECT_THEME_KEYS),
      ...LEGACY_THEME_KEYS,
    ]);
  }

  function getObjectStorageKeys() {
    return buildStorageKeyPlan(OBJECT_THEME_KEYS);
  }

  function isThemeStorageKey(key = "") {
    const cleanKey = safeText(key, "");

    if (!cleanKey) {
      return false;
    }

    const normalized = cleanKey
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
      normalized.endsWith("_profile")
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
    const media = getSystemMediaQuery();

    try {
      if (
        media &&
        media.matches
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
    const finalMode = isValidThemeMode(mode)
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
    const key = safeLower(value, "")
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

    const value = raw.trim();

    if (
      !value ||
      isCorruptedString(value)
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
        return parseJsonRecursive(parsed, depth + 1);
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
      return allowBoolean
        ? value
          ? "dark"
          : "light"
        : "";
    }

    if (typeof value === "number") {
      return allowBoolean
        ? value === 1
          ? "dark"
          : value === 0
            ? "light"
            : ""
        : "";
    }

    if (typeof value === "string") {
      const raw = clampRawValue(value);

      if (
        !raw ||
        isCorruptedString(raw)
      ) {
        return "";
      }

      const directMode = normalizeThemeMode(raw);

      if (isValidThemeMode(directMode)) {
        return directMode;
      }

      const parsed = parseJsonRecursive(raw, depth + 1);

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
      const items = value.slice(0, MAX_ARRAY_ITEMS);

      for (const item of items) {
        const mode = extractThemeModeFromAny(
          item,
          depth + 1,
          allowBoolean
        );

        if (isValidThemeMode(mode)) {
          return mode;
        }
      }

      return "";
    }

    if (isObject(value)) {
      return extractThemeModeFromObject(value, depth + 1);
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

    /*
      Nodos preferentes primero.
    */
    for (const key of PREFERRED_OBJECT_NODES) {
      if (hasOwn(objectValue, key)) {
        enqueue(objectValue[key], depth + 1);
      }
    }

    while (queue.length) {
      const item = queue.shift();
      const node = item.node;
      const nodeDepth = item.depth;

      visitedCount += 1;

      for (const field of MODE_FIELD_NAMES) {
        if (!hasOwn(node, field)) {
          continue;
        }

        const mode = extractThemeModeFromAny(
          node[field],
          nodeDepth + 1,
          false
        );

        if (isValidThemeMode(mode)) {
          return mode;
        }
      }

      for (const field of BOOL_DARK_FIELD_NAMES) {
        if (!hasOwn(node, field)) {
          continue;
        }

        const mode = safeBoolean(node[field], false)
          ? "dark"
          : "light";

        if (isValidThemeMode(mode)) {
          return mode;
        }
      }

      if (nodeDepth >= MAX_OBJECT_DEPTH) {
        continue;
      }

      for (const key of PREFERRED_OBJECT_NODES) {
        if (hasOwn(node, key)) {
          enqueue(node[key], nodeDepth + 1);
        }
      }

      /*
        Recorrido limitado de otros nodos.
        Esto permite leer estructuras tipo:
        { data: { user: { preferences: { themeMode: "system" } } } }
      */
      try {
        for (const key of Object.keys(node)) {
          const child = node[key];

          if (isObject(child)) {
            enqueue(child, nodeDepth + 1);
          }

          if (Array.isArray(child)) {
            for (const entry of child.slice(0, MAX_ARRAY_ITEMS)) {
              enqueue(entry, nodeDepth + 1);
            }
          }
        }
      } catch {}
    }

    return "";
  }

  function parseThemeModeValue(raw = "") {
    return extractThemeModeFromAny(raw, 0, true);
  }

  /* =========================================================
     THEME RESOLUTION
  ========================================================= */

  function resolveRuntimeForcedThemeMode() {
    const config = getRuntimeThemeConfig();

    const forcedMode = parseThemeModeValue(config.forcedTheme);

    if (isValidThemeMode(forcedMode)) {
      return {
        mode: forcedMode,
        source: "runtime:forcedTheme",
        key: "",
        priority: SOURCE_PRIORITY.runtimeForced,
        exhausted: false,
      };
    }

    return {
      mode: "",
      source: "",
      key: "",
      priority: 0,
      exhausted: false,
    };
  }

  function resolveRuntimeDefaultThemeMode() {
    const config = getRuntimeThemeConfig();

    const defaultMode = parseThemeModeValue(config.defaultTheme);

    if (isValidThemeMode(defaultMode)) {
      return {
        mode: defaultMode,
        source: "runtime:defaultTheme",
        key: "",
        priority: SOURCE_PRIORITY.runtimeDefault,
        exhausted: false,
      };
    }

    return {
      mode: "",
      source: "",
      key: "",
      priority: 0,
      exhausted: false,
    };
  }

  function resolveStoredThemeMode() {
    const directKeys = getDirectStorageKeys();
    const objectKeys = getObjectStorageKeys();

    let reads = 0;

    function readKeys(keys, phase = "direct") {
      for (const key of keys) {
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

        if (isValidThemeMode(mode)) {
          return {
            mode,
            source: `storage:${phase}:${key}`,
            key,
            priority: SOURCE_PRIORITY.storage,
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
        isValidThemeMode(directResult.mode) ||
        directResult.exhausted
      )
    ) {
      return directResult;
    }

    const objectResult = readKeys(objectKeys, "object");

    if (
      objectResult &&
      (
        isValidThemeMode(objectResult.mode) ||
        objectResult.exhausted
      )
    ) {
      return objectResult;
    }

    return {
      mode: "",
      source: "",
      key: "",
      priority: 0,
      exhausted: false,
    };
  }

  function resolveInitialThemeMode() {
    /*
      Orden correcto:
      forcedTheme > storage > defaultTheme > system.
    */

    const forced = resolveRuntimeForcedThemeMode();

    if (isValidThemeMode(forced.mode)) {
      return forced;
    }

    const stored = resolveStoredThemeMode();

    if (isValidThemeMode(stored.mode)) {
      return stored;
    }

    const runtimeDefault = resolveRuntimeDefaultThemeMode();

    if (isValidThemeMode(runtimeDefault.mode)) {
      return runtimeDefault;
    }

    return {
      mode: DEFAULT_MODE,
      source: "system",
      key: "",
      priority: SOURCE_PRIORITY.system,
      exhausted: Boolean(stored.exhausted),
    };
  }

  /* =========================================================
     DOM / META HELPERS
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

    if (!finalName || !isBrowser()) {
      return null;
    }

    try {
      const metas = Array.from(
        document.getElementsByTagName("meta")
      );

      const managed = metas.find((meta) => (
        meta.getAttribute("name") === finalName &&
        meta.getAttribute("data-onion-managed") === "theme"
      ));

      if (managed) {
        return managed;
      }

      return metas.find((meta) => (
        meta.getAttribute("name") === finalName &&
        !meta.hasAttribute("media")
      )) || null;
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

      const attrs = safeObject(extraAttrs);

      for (const [key, value] of Object.entries(attrs)) {
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
    const finalTheme = isValidResolvedTheme(theme)
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

    const finalTheme = isValidResolvedTheme(theme)
      ? theme
      : FALLBACK_THEME;

    try {
      for (const className of THEME_CLASS_NAMES) {
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

    const theme = isValidResolvedTheme(payload.theme)
      ? payload.theme
      : FALLBACK_THEME;

    const mode = isValidThemeMode(payload.mode)
      ? payload.mode
      : DEFAULT_MODE;

    const source = safeText(payload.source, "unknown");

    const systemTheme = isValidResolvedTheme(payload.systemTheme)
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

  function syncBodyFromCurrentSnapshot() {
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
        syncBodyFromCurrentSnapshot();
        return true;
      }

      document.addEventListener(
        "DOMContentLoaded",
        () => {
          syncBodyFromCurrentSnapshot();
        },
        {
          once: true,
        }
      );

      document.addEventListener(
        "readystatechange",
        () => {
          syncBodyFromCurrentSnapshot();
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
    const finalMode = isValidThemeMode(mode)
      ? mode
      : DEFAULT_MODE;

    const systemTheme = getSystemTheme();

    const resolvedTheme = resolveThemeFromMode(finalMode);

    const finalTheme = isValidResolvedTheme(resolvedTheme)
      ? resolvedTheme
      : FALLBACK_THEME;

    return {
      version: PREBOOT_THEME_VERSION,
      theme: finalTheme,
      mode: finalMode,
      source: safeText(source, "unknown"),
      persistedKey: safeText(persistedKey, ""),
      systemTheme,
      fallbackTheme: FALLBACK_THEME,
      priority: Number.isFinite(Number(priority))
        ? Number(priority)
        : 0,
      storageExhausted: Boolean(exhausted),
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
      window.__ONION_BOOT_THEME__ = freezePayload(payload);
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
      window.dispatchEvent(
        new CustomEvent(
          "onion:theme:change",
          {
            detail: payload,
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
    const prefix = getStoragePrefix();

    const theme = isValidResolvedTheme(payload.theme)
      ? payload.theme
      : FALLBACK_THEME;

    const mode = isValidThemeMode(payload.mode)
      ? payload.mode
      : DEFAULT_MODE;

    try {
      /*
        Semántica correcta:
        - theme = resultado visual real: dark | light.
        - themeMode = preferencia: dark | light | system.
        - appearance = alias de preferencia para compatibilidad UI.
      */
      const okTheme = writePersistentStorageRaw(
        `${prefix}:theme`,
        theme
      );

      const okThemeMode = writePersistentStorageRaw(
        `${prefix}:themeMode`,
        mode
      );

      const okAppearance = writePersistentStorageRaw(
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

    const payload = buildPayload({
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

    setBootSnapshot(payload);
    bindBodySyncWhenReady();
    syncBodyFromCurrentSnapshot();
    syncMeta(payload.theme);

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

  function clearKnownThemeKeys() {
    const prefix = getStoragePrefix();

    const keys = unique([
      ...buildStorageKeyPlan(DIRECT_THEME_KEYS),
      `${prefix}:theme`,
      `${prefix}:themeMode`,
      `${prefix}:theme_mode`,
      `${prefix}:appearance`,
      `${prefix}_theme`,
      `${prefix}_themeMode`,
      `${prefix}_theme_mode`,
      `${prefix}_appearance`,
      `${prefix}.theme`,
      `${prefix}.themeMode`,
      `${prefix}.theme_mode`,
      `${prefix}.appearance`,
      "theme",
      "themeMode",
      "theme_mode",
      "appearance",
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

  function exposePublicApi() {
    if (!isBrowser()) {
      return false;
    }

    const api = Object.freeze({
      version: PREBOOT_THEME_VERSION,

      get() {
        return getBootSnapshot();
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
          persistedKey: `${getStoragePrefix()}:themeMode`,
          persist: opts.persist !== false,
          emit: opts.emit !== false,
          priority: SOURCE_PRIORITY.storage,
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
          priority: SOURCE_PRIORITY.system,
        });
      },

      reapply(options = {}) {
        const opts = safeObject(options);
        const resolved = resolveInitialThemeMode();

        return applyTheme({
          mode: resolved.mode || DEFAULT_MODE,
          source: safeText(opts.source, resolved.source || "reapply"),
          persistedKey: resolved.key || "",
          persist: false,
          emit: opts.emit === true,
          priority: resolved.priority || 0,
          exhausted: Boolean(resolved.exhausted),
        });
      },
    });

    definePublicProperty("__ONION_THEME__", api);

    definePublicProperty(
      "__ONION_SET_THEME__",
      api.set
    );

    definePublicProperty(
      "__ONION_GET_THEME__",
      api.get
    );

    definePublicProperty(
      "__ONION_RESOLVE_THEME__",
      api.resolve
    );

    definePublicProperty(
      "__ONION_CLEAR_THEME__",
      api.clear
    );

    return true;
  }

  /* =========================================================
     SYSTEM CHANGE LISTENER
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
          priority: SOURCE_PRIORITY.system,
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

  /* =========================================================
     STORAGE CHANGE LISTENER
  ========================================================= */

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
            if (!event || !isThemeStorageKey(event.key || "")) {
              return;
            }

            /*
              Si hay forcedTheme runtime, siempre gana.
            */
            const forced = resolveRuntimeForcedThemeMode();

            if (isValidThemeMode(forced.mode)) {
              applyTheme({
                mode: forced.mode,
                source: "storage-event:runtime-forced",
                persistedKey: forced.key || "",
                persist: false,
                emit: true,
                priority: forced.priority,
              });

              return;
            }

            const stored = resolveStoredThemeMode();

            if (isValidThemeMode(stored.mode)) {
              applyTheme({
                mode: stored.mode,
                source: "storage-event",
                persistedKey: stored.key || "",
                persist: false,
                emit: true,
                priority: stored.priority,
                exhausted: Boolean(stored.exhausted),
              });

              return;
            }

            const runtimeDefault = resolveRuntimeDefaultThemeMode();

            applyTheme({
              mode: runtimeDefault.mode || DEFAULT_MODE,
              source: runtimeDefault.mode
                ? "storage-event:runtime-default"
                : "storage-event:system",
              persistedKey: "",
              persist: false,
              emit: true,
              priority: runtimeDefault.priority || SOURCE_PRIORITY.system,
            });
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
        priority: SOURCE_PRIORITY.fallback,
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
