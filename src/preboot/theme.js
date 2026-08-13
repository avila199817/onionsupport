/* =========================================================
   Onion Support - Preboot Theme
   Archivo: /src/preboot/theme.js

   Responsabilidad:
   - Aplicar el tema efectivo inicial según el sistema.
   - Mantener themeMode="system" separado de theme="light|dark".
   - Mantener el tema vivo si cambia prefers-color-scheme.
   - Fijar idioma base inicial: es.
   - Eliminar no-js lo antes posible.
   - Evitar escrituras DOM redundantes.
   - Sin imports, storage, API, Auth, Router, HTTP ni i18n.
========================================================= */

(() => {
  "use strict";

  const PREBOOT_VERSION =
    "preboot.theme.v3-hardened";

  const BASE_LOCALE = "es";
  const BASE_LANG = "es";
  const BASE_DIR = "ltr";

  const DARK_QUERY =
    "(prefers-color-scheme: dark)";

  const THEME_LIGHT = "light";
  const THEME_DARK = "dark";
  const THEME_MODE = "system";
  const THEME_SOURCE = "system";

  const THEME_COLORS =
    Object.freeze({
      light: "#ffffff",
      dark: "#0a0c11",
    });

  let mediaQuery = null;
  let listenerBound = false;

  let lastTheme = "";
  let htmlInitialized = false;
  let bodyInitialized = false;
  let snapshotInitialized = false;

  /* =========================================================
     BASICS
  ========================================================= */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

  function normalizeTheme(
    value = ""
  ) {
    return value === THEME_DARK
      ? THEME_DARK
      : THEME_LIGHT;
  }

  function getMediaQuery() {
    if (mediaQuery) {
      return mediaQuery;
    }

    try {
      mediaQuery =
        window.matchMedia(
          DARK_QUERY
        );
    } catch {
      mediaQuery = null;
    }

    return mediaQuery;
  }

  function getSystemTheme() {
    return getMediaQuery()?.matches
      ? THEME_DARK
      : THEME_LIGHT;
  }

  /* =========================================================
     IDEMPOTENT DOM WRITES
  ========================================================= */

  function setAttributeIfChanged(
    element,
    name,
    value
  ) {
    if (!element) {
      return false;
    }

    const next =
      String(value);

    if (
      element.getAttribute(name) ===
      next
    ) {
      return false;
    }

    element.setAttribute(
      name,
      next
    );

    return true;
  }

  function setDatasetIfChanged(
    element,
    key,
    value
  ) {
    if (!element?.dataset) {
      return false;
    }

    const next =
      String(value);

    if (
      element.dataset[key] === next
    ) {
      return false;
    }

    element.dataset[key] =
      next;

    return true;
  }

  function setClassState(
    element,
    className,
    enabled
  ) {
    if (!element?.classList) {
      return false;
    }

    const shouldHave =
      enabled === true;

    const has =
      element.classList.contains(
        className
      );

    if (has === shouldHave) {
      return false;
    }

    element.classList.toggle(
      className,
      shouldHave
    );

    return true;
  }

  /* =========================================================
     ROOT THEME / LOCALE
  ========================================================= */

  function applyRootClasses(
    element = null,
    theme = THEME_LIGHT
  ) {
    if (!element) {
      return false;
    }

    const value =
      normalizeTheme(theme);

    let changed = false;

    try {
      changed =
        setClassState(
          element,
          "no-js",
          false
        ) || changed;

      changed =
        setClassState(
          element,
          "js",
          true
        ) || changed;

      changed =
        setClassState(
          element,
          "theme-light",
          value === THEME_LIGHT
        ) || changed;

      changed =
        setClassState(
          element,
          "theme-dark",
          value === THEME_DARK
        ) || changed;

      return changed;
    } catch {
      return false;
    }
  }

  function applyThemeDataset(
    element = null,
    theme = THEME_LIGHT
  ) {
    if (!element) {
      return false;
    }

    const value =
      normalizeTheme(theme);

    let changed = false;

    try {
      /*
        Contrato:
        - data-theme-mode = preferencia/configuración.
        - data-theme = tema efectivo que consume CSS.
      */
      changed =
        setDatasetIfChanged(
          element,
          "theme",
          value
        ) || changed;

      changed =
        setDatasetIfChanged(
          element,
          "themeMode",
          THEME_MODE
        ) || changed;

      changed =
        setDatasetIfChanged(
          element,
          "themeSource",
          THEME_SOURCE
        ) || changed;

      changed =
        setDatasetIfChanged(
          element,
          "systemTheme",
          value
        ) || changed;

      changed =
        setDatasetIfChanged(
          element,
          "themeReady",
          "true"
        ) || changed;

      changed =
        setDatasetIfChanged(
          element,
          "prebootThemeVersion",
          PREBOOT_VERSION
        ) || changed;

      return changed;
    } catch {
      return false;
    }
  }

  function applyLocale(
    element = null
  ) {
    if (!element) {
      return false;
    }

    let changed = false;

    try {
      changed =
        setAttributeIfChanged(
          element,
          "lang",
          BASE_LANG
        ) || changed;

      changed =
        setAttributeIfChanged(
          element,
          "dir",
          BASE_DIR
        ) || changed;

      changed =
        setDatasetIfChanged(
          element,
          "locale",
          BASE_LOCALE
        ) || changed;

      changed =
        setDatasetIfChanged(
          element,
          "localeSource",
          "base"
        ) || changed;

      changed =
        setDatasetIfChanged(
          element,
          "localeFallback",
          BASE_LOCALE
        ) || changed;

      changed =
        setDatasetIfChanged(
          element,
          "localeSupported",
          BASE_LOCALE
        ) || changed;

      return changed;
    } catch {
      return false;
    }
  }

  function applyRoot(
    element = null,
    theme = THEME_LIGHT
  ) {
    if (!element) {
      return false;
    }

    let changed = false;

    changed =
      applyRootClasses(
        element,
        theme
      ) || changed;

    changed =
      applyThemeDataset(
        element,
        theme
      ) || changed;

    changed =
      applyLocale(
        element
      ) || changed;

    return changed;
  }

  /* =========================================================
     THEME-COLOR
  ========================================================= */

  function applyThemeColor(
    theme = THEME_LIGHT
  ) {
    if (!isBrowser()) {
      return false;
    }

    const value =
      normalizeTheme(theme);

    const activeColor =
      THEME_COLORS[value];

    let changed = false;

    try {
      const metas =
        document.querySelectorAll(
          "meta[name='theme-color']"
        );

      if (!metas.length) {
        return false;
      }

      metas.forEach(
        (meta) => {
          let color =
            activeColor;

          if (
            meta.hasAttribute(
              "data-onion-theme-color-light"
            )
          ) {
            color =
              THEME_COLORS.light;
          } else if (
            meta.hasAttribute(
              "data-onion-theme-color-dark"
            )
          ) {
            color =
              THEME_COLORS.dark;
          }

          changed =
            setAttributeIfChanged(
              meta,
              "content",
              color
            ) || changed;
        }
      );

      return changed;
    } catch {
      return false;
    }
  }

  /* =========================================================
     SNAPSHOT
  ========================================================= */

  function snapshotMatches(
    theme = THEME_LIGHT
  ) {
    const value =
      normalizeTheme(theme);

    const snapshot =
      window.__ONION_PREBOOT__;

    return Boolean(
      snapshot &&
      snapshot.version ===
        PREBOOT_VERSION &&
      snapshot.theme === value &&
      snapshot.themeMode ===
        THEME_MODE &&
      snapshot.themeSource ===
        THEME_SOURCE &&
      snapshot.systemTheme ===
        value &&
      snapshot.locale ===
        BASE_LOCALE &&
      snapshot.ready === true
    );
  }

  function writeSnapshot(
    theme = THEME_LIGHT,
    force = false
  ) {
    if (!isBrowser()) {
      return false;
    }

    const value =
      normalizeTheme(theme);

    if (
      force !== true &&
      snapshotInitialized &&
      snapshotMatches(value)
    ) {
      return false;
    }

    try {
      window.__ONION_PREBOOT__ =
        Object.freeze({
          version:
            PREBOOT_VERSION,

          /*
            theme = efectivo.
            themeMode = preferencia.
          */
          theme:
            value,

          themeMode:
            THEME_MODE,

          themeSource:
            THEME_SOURCE,

          systemTheme:
            value,

          locale:
            BASE_LOCALE,

          localeSource:
            "base",

          fallbackLocale:
            BASE_LOCALE,

          supportedLocales:
            Object.freeze([
              BASE_LOCALE,
            ]),

          ready: true,

          updatedAt:
            new Date()
              .toISOString(),
        });

      snapshotInitialized =
        true;

      return true;
    } catch {
      return false;
    }
  }

  /* =========================================================
     APPLY
  ========================================================= */

  function applyPreboot(
    options = {}
  ) {
    if (!isBrowser()) {
      return false;
    }

    const theme =
      normalizeTheme(
        options.theme ||
        getSystemTheme()
      );

    const html =
      document.documentElement;

    const body =
      document.body;

    const themeChanged =
      theme !== lastTheme;

    let changed = false;

    /*
      HTML existe ya cuando el script se ejecuta en <head>.
      Se aplica inmediatamente para evitar flash de tema.
    */
    if (
      html &&
      (
        !htmlInitialized ||
        themeChanged ||
        options.force === true
      )
    ) {
      changed =
        applyRoot(
          html,
          theme
        ) || changed;

      htmlInitialized =
        true;
    }

    /*
      En la primera ejecución desde <head>, body aún puede no existir.
      Sólo se inicializa cuando aparece y luego únicamente si cambia tema.
    */
    if (
      body &&
      (
        !bodyInitialized ||
        themeChanged ||
        options.force === true
      )
    ) {
      changed =
        applyRoot(
          body,
          theme
        ) || changed;

      bodyInitialized =
        true;
    }

    if (
      themeChanged ||
      !snapshotInitialized ||
      options.force === true
    ) {
      changed =
        applyThemeColor(
          theme
        ) || changed;

      changed =
        writeSnapshot(
          theme,
          options.force === true
        ) || changed;
    }

    lastTheme =
      theme;

    return changed;
  }

  /* =========================================================
     SYSTEM LISTENER
  ========================================================= */

  function onSystemThemeChange(
    event = null
  ) {
    const nextTheme =
      event?.matches === true
        ? THEME_DARK
        : (
            event?.matches === false
              ? THEME_LIGHT
              : getSystemTheme()
          );

    if (
      nextTheme === lastTheme
    ) {
      return false;
    }

    return applyPreboot({
      theme:
        nextTheme,
    });
  }

  function bindSystemThemeListener() {
    if (listenerBound) {
      return true;
    }

    const query =
      getMediaQuery();

    if (!query) {
      return false;
    }

    try {
      if (
        typeof query.addEventListener ===
        "function"
      ) {
        query.addEventListener(
          "change",
          onSystemThemeChange
        );

        listenerBound =
          true;

        return true;
      }

      if (
        typeof query.addListener ===
        "function"
      ) {
        query.addListener(
          onSystemThemeChange
        );

        listenerBound =
          true;

        return true;
      }
    } catch {
      return false;
    }

    return false;
  }

  /* =========================================================
     BOOT
  ========================================================= */

  if (!isBrowser()) {
    return;
  }

  /*
    Primera pasada síncrona:
    html + meta theme-color + snapshot.
    No esperamos DOMContentLoaded para fijar el tema.
  */
  applyPreboot();

  bindSystemThemeListener();

  /*
    El script vive en <head>, así que body normalmente aún no existe.
    Hacemos una única segunda pasada sólo para inicializar body.
    Si body ya existe, no registramos trabajo redundante.
  */
  if (
    !document.body &&
    document.readyState ===
      "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        applyPreboot();
      },
      {
        once: true,
      }
    );
  } else if (
    document.body &&
    !bodyInitialized
  ) {
    applyPreboot();
  }
})();
