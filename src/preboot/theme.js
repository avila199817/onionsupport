/* =========================================================
   Onion SPA - Early Theme Boot
   Archivo: src/preboot/theme.js

   RESPONSABILIDADES:
   - aplicar tema antes del primer paint
   - resolver modo system desde navegador / sistema operativo
   - soportar storage namespaced y legacy
   - soportar valores raw, JSON, objetos serializados y strings JSON
   - soportar dark / light / system
   - soportar aliases auto / browser / os / device
   - sincronizar data-theme real: dark | light
   - sincronizar data-theme-mode: dark | light | system
   - sincronizar data-theme-source
   - sincronizar clases theme-dark / theme-light
   - sincronizar meta color-scheme y theme-color
   - no romper si localStorage/sessionStorage está bloqueado
   - exponer bridge público seguro para cambios tempranos
   - reaccionar a cambios de sistema si el modo es system
   - CSP clean: este archivo NO debe incluir etiqueta <script>

   HARDENING EXTREMO:
   - sin dependencias de AppCore
   - sin innerHTML
   - sin localStorage.clear()
   - sin throws accidentales
   - lectura multi-key con prefijos onion:, onion_, legacy y runtime config
   - tolerancia a valores corruptos: undefined/null/[object Object]/{} / []
   - soporte settings/user/preferences/ui anidados
   - soporte darkMode boolean sólo si existe explícitamente
   - prioridad runtime > storage > system
   - snapshot debug seguro en window.__ONION_BOOT_THEME__
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

  const THEME_COLORS =
    Object.freeze({
      dark:
        "#0a0c11",

      light:
        "#f4f7fb",
    });

  const STORAGE_LEGACY_KEYS =
    Object.freeze([
      "onion:theme",
      "onion:themeMode",
      "onion:theme_mode",
      "onion:appearance",
      "onion:settings",
      "onion:user",

      "onion_theme",
      "onion_theme_mode",
      "onion_appearance",
      "onion_settings",
      "onion_user",

      "theme",
      "themeMode",
      "theme_mode",
      "colorMode",
      "color_mode",
      "appearance",
      "settings",
      "user",
    ]);

  const THEME_CLASS_NAMES =
    Object.freeze([
      "theme-dark",
      "theme-light",
    ]);

  const SOURCE_PRIORITY =
    Object.freeze({
      runtime:
        100,

      storage:
        80,

      system:
        50,

      fallback:
        1,
    });

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
        ].includes(key)
      ) {
        return false;
      }
    }

    return Boolean(fallback);
  }

  function safeArray(value) {
    return Array.isArray(value)
      ? value
      : [];
  }

  function unique(values = []) {
    return Array.from(
      new Set(
        safeArray(values)
          .map((item) => safeText(item, ""))
          .filter(Boolean)
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

  /* =========================================================
     RUNTIME CONFIG
  ========================================================= */

  function getRuntimeConfig() {
    if (!isBrowser()) {
      return {};
    }

    try {
      const config =
        window.__ONION_CONFIG__;

      return isObject(config)
        ? config
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

    return {
      storagePrefix:
        safeText(
          config.storagePrefix,
          "onion"
        ),

      defaultTheme:
        config.defaultTheme ??
        config.themeMode ??
        config.appearance ??
        ui.defaultTheme ??
        ui.themeMode ??
        ui.appearance ??
        theme.defaultTheme ??
        theme.mode ??
        theme.appearance ??
        "",

      forcedTheme:
        config.forcedTheme ??
        ui.forcedTheme ??
        theme.forcedTheme ??
        "",

      themeColorDark:
        ui.themeColorDark ??
        theme.themeColorDark ??
        THEME_COLORS.dark,

      themeColorLight:
        ui.themeColorLight ??
        theme.themeColorLight ??
        THEME_COLORS.light,
    };
  }

  function getStoragePrefix() {
    return safeText(
      getRuntimeThemeConfig().storagePrefix,
      "onion"
    );
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
    return getStorage("localStorage");
  }

  function getSessionStorage() {
    return getStorage("sessionStorage");
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
      return storage.getItem(finalKey) || "";
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

  function writeStorageRaw(key = "", value = "") {
    const localOk =
      writeStorageRawTo(
        getLocalStorage(),
        key,
        value
      );

    const sessionOk =
      writeStorageRawTo(
        getSessionStorage(),
        key,
        value
      );

    return Boolean(
      localOk ||
      sessionOk
    );
  }

  function buildKeyCandidates(key = "") {
    const cleanKey =
      safeText(key, "");

    if (!cleanKey) {
      return [];
    }

    const prefix =
      getStoragePrefix();

    const snakeKey =
      cleanKey
        .replace(/[:.]/g, "_");

    const colonKey =
      cleanKey
        .replace(/[_.]/g, ":");

    const dotKey =
      cleanKey
        .replace(/[:_]/g, ".");

    return unique([
      cleanKey,

      `${prefix}:${cleanKey}`,
      `${prefix}_${snakeKey}`,
      `${prefix}.${dotKey}`,

      snakeKey,
      colonKey,
      dotKey,

      cleanKey.startsWith(`${prefix}:`)
        ? cleanKey.slice(prefix.length + 1)
        : "",

      cleanKey.startsWith(`${prefix}_`)
        ? cleanKey.slice(prefix.length + 1)
        : "",
    ]);
  }

  function getStorageKeys() {
    const prefix =
      getStoragePrefix();

    return unique([
      `${prefix}:theme`,
      `${prefix}:themeMode`,
      `${prefix}:theme_mode`,
      `${prefix}:appearance`,
      `${prefix}:settings`,
      `${prefix}:user`,

      `${prefix}_theme`,
      `${prefix}_theme_mode`,
      `${prefix}_appearance`,
      `${prefix}_settings`,
      `${prefix}_user`,

      ...STORAGE_LEGACY_KEYS,
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
        window.matchMedia("(prefers-color-scheme: light)").matches
      ) {
        return "light";
      }
    } catch {}

    try {
      if (
        isFunction(window.matchMedia) &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      ) {
        return "dark";
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
      key === "[]"
    );
  }

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
        "auto",
        "browser",
        "os",
        "device",
        "system-preference",
        "prefers-color-scheme",
      ].includes(key)
    ) {
      return "system";
    }

    if (
      [
        "black",
        "night",
        "oscuro",
        "dark-mode",
        "dark_mode",
      ].includes(key)
    ) {
      return "dark";
    }

    if (
      [
        "white",
        "day",
        "claro",
        "light-mode",
        "light_mode",
      ].includes(key)
    ) {
      return "light";
    }

    if (isValidThemeMode(key)) {
      return key;
    }

    return "";
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

    const candidates = [
      value.themeMode,
      value.theme_mode,
      value.mode,
      value.colorMode,
      value.color_mode,
      value.appearance,

      value.theme,
      value.defaultTheme,
      value.default_theme,

      ui.themeMode,
      ui.theme_mode,
      ui.mode,
      ui.colorMode,
      ui.color_mode,
      ui.appearance,
      ui.theme,
      ui.defaultTheme,
      ui.default_theme,

      preferences.themeMode,
      preferences.theme_mode,
      preferences.mode,
      preferences.colorMode,
      preferences.color_mode,
      preferences.appearance,
      preferences.theme,

      settings.themeMode,
      settings.theme_mode,
      settings.mode,
      settings.colorMode,
      settings.color_mode,
      settings.appearance,
      settings.theme,

      profile.themeMode,
      profile.theme_mode,
      profile.mode,
      profile.colorMode,
      profile.color_mode,
      profile.appearance,
      profile.theme,

      raw.themeMode,
      raw.theme_mode,
      raw.mode,
      raw.colorMode,
      raw.color_mode,
      raw.appearance,
      raw.theme,
      raw.defaultTheme,
      raw.default_theme,

      raw.ui?.themeMode,
      raw.ui?.theme_mode,
      raw.ui?.mode,
      raw.ui?.appearance,
      raw.ui?.theme,

      raw.preferences?.themeMode,
      raw.preferences?.theme_mode,
      raw.preferences?.mode,
      raw.preferences?.appearance,
      raw.preferences?.theme,

      raw.settings?.themeMode,
      raw.settings?.theme_mode,
      raw.settings?.mode,
      raw.settings?.appearance,
      raw.settings?.theme,
    ];

    for (const candidate of candidates) {
      const mode =
        normalizeThemeMode(candidate);

      if (isValidThemeMode(mode)) {
        return mode;
      }
    }

    /*
      Fallback boolean explícito:
      Sólo se usa si existe la propiedad.
      No se infiere por falsy genérico.
    */
    const darkModeCandidates = [
      [value, "darkMode"],
      [value, "dark_mode"],

      [ui, "darkMode"],
      [ui, "dark_mode"],

      [preferences, "darkMode"],
      [preferences, "dark_mode"],

      [settings, "darkMode"],
      [settings, "dark_mode"],

      [profile, "darkMode"],
      [profile, "dark_mode"],

      [raw, "darkMode"],
      [raw, "dark_mode"],

      [safeObject(raw.preferences), "darkMode"],
      [safeObject(raw.preferences), "dark_mode"],

      [safeObject(raw.settings), "darkMode"],
      [safeObject(raw.settings), "dark_mode"],
    ];

    for (const [node, key] of darkModeCandidates) {
      if (hasOwn(node, key)) {
        return safeBool(node[key], false)
          ? "dark"
          : "light";
      }
    }

    return "";
  }

  function parseJsonRecursive(raw = "", depth = 0) {
    if (depth > 4) {
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

    if (
      !(
        value.startsWith("{") ||
        value.startsWith("[") ||
        value.startsWith("\"") ||
        value.startsWith("'")
      )
    ) {
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

  function parseThemeModeValue(raw = "") {
    if (
      raw === null ||
      raw === undefined
    ) {
      return "";
    }

    if (isObject(raw)) {
      const objectMode =
        extractThemeModeFromObject(raw);

      return isValidThemeMode(objectMode)
        ? objectMode
        : "";
    }

    const value =
      safeText(raw, "");

    if (
      !value ||
      isCorruptedString(value)
    ) {
      return "";
    }

    const direct =
      normalizeThemeMode(value);

    if (isValidThemeMode(direct)) {
      return direct;
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

    const objectMode =
      extractThemeModeFromObject(parsed);

    return isValidThemeMode(objectMode)
      ? objectMode
      : "";
  }

  /* =========================================================
     THEME RESOLUTION
  ========================================================= */

  function resolveRuntimeThemeMode() {
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
        priority:
          SOURCE_PRIORITY.runtime,
      };
    }

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
        priority:
          SOURCE_PRIORITY.runtime,
      };
    }

    return {
      mode:
        "",
      source:
        "",
      priority:
        0,
    };
  }

  function resolveStoredThemeMode() {
    const keys =
      getStorageKeys();

    for (const key of keys) {
      const candidates =
        buildKeyCandidates(key);

      for (const candidate of candidates) {
        const raw =
          readStorageRaw(candidate);

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
    };
  }

  function resolveInitialThemeMode() {
    const runtime =
      resolveRuntimeThemeMode();

    if (isValidThemeMode(runtime.mode)) {
      return runtime;
    }

    const stored =
      resolveStoredThemeMode();

    if (isValidThemeMode(stored.mode)) {
      return stored;
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
    };
  }

  /* =========================================================
     META / DOM
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

      Object.entries(
        safeObject(extraAttrs)
      ).forEach(([key, value]) => {
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
      });

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

    try {
      for (const className of THEME_CLASS_NAMES) {
        element.classList.remove(className);
      }

      element.classList.add(
        `theme-${theme}`
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
        payload.systemTheme || getSystemTheme()
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
            applyThemeToElement(
              document.body,
              payload
            );
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

  function buildPayload({
    mode = DEFAULT_MODE,
    source = "system",
    persistedKey = "",
  } = {}) {
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

      systemTheme:
        getSystemTheme(),

      fallbackTheme:
        FALLBACK_THEME,

      at:
        nowIso(),
    };
  }

  function applyTheme({
    mode = DEFAULT_MODE,
    source = "system",
    persistedKey = "",
    persist = false,
    emit = false,
  } = {}) {
    if (!isBrowser()) {
      return FALLBACK_THEME;
    }

    const payload =
      buildPayload({
        mode,
        source,
        persistedKey,
      });

    try {
      applyThemeToElement(
        document.documentElement,
        payload
      );
    } catch {}

    applyThemeToBodyWhenReady(payload);

    syncMeta(payload.theme);

    try {
      window.__ONION_BOOT_THEME__ =
        Object.freeze({
          ...payload,
        });
    } catch {
      try {
        window.__ONION_BOOT_THEME__ =
          payload;
      } catch {}
    }

    if (persist) {
      try {
        writeStorageRaw(
          `${getStoragePrefix()}:theme`,
          payload.mode
        );

        writeStorageRaw(
          `${getStoragePrefix()}:themeMode`,
          payload.mode
        );
      } catch {}
    }

    if (emit) {
      emitThemeEvent(payload);
    }

    return payload.theme;
  }

  /* =========================================================
     PUBLIC BRIDGE
  ========================================================= */

  function exposePublicApi() {
    if (!isBrowser()) {
      return false;
    }

    try {
      window.__ONION_SET_THEME__ =
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
              `${getStoragePrefix()}:theme`,
            persist:
              true,
            emit:
              true,
          });
        };

      window.__ONION_GET_THEME__ =
        function getOnionTheme() {
          try {
            return {
              ...(window.__ONION_BOOT_THEME__ || {}),
            };
          } catch {
            return {};
          }
        };

      window.__ONION_RESOLVE_THEME__ =
        function resolveOnionTheme(mode = DEFAULT_MODE) {
          const finalMode =
            normalizeThemeMode(mode) ||
            DEFAULT_MODE;

          return buildPayload({
            mode:
              finalMode,
            source:
              "resolve",
          });
        };

      return true;
    } catch {
      return false;
    }
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
        "(prefers-color-scheme: light)"
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

    const handler = () => {
      try {
        const current =
          window.__ONION_BOOT_THEME__ || {};

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
     BOOT
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

  try {
    bootTheme();
    exposePublicApi();
    bindSystemThemeListener();
  } catch {
    applyFallbackTheme();
  }
})();
