/* =========================================================
   Onion SPA - App Constants
   Archivo: src/app/constants.js

   Responsabilidades:
   - centralizar constantes del bootstrap de la app
   - definir scope global de cleanup
   - definir timeouts de failsafe del boot
   - centralizar claves internas del runtime
   - endurecer configuración global app

   HARDENING PRO:
   - Object.freeze total
   - aliases públicos estables
   - escalable para futuros módulos
========================================================= */

/* =========================================================
   CLEANUP / SCOPES
========================================================= */

export const APP_SCOPE =
  "app:global";

export const APP_SCOPES =
  Object.freeze({
    global:
      APP_SCOPE,

    ui:
      "app:ui",

    events:
      "app:events",

    router:
      "app:router",

    boot:
      "app:boot",
  });

/* =========================================================
   BOOT
========================================================= */

export const BOOT_FAILSAFE_LOADER_MS =
  2500;

export const BOOT_CONSTANTS =
  Object.freeze({
    failsafeLoaderMs:
      BOOT_FAILSAFE_LOADER_MS,

    minLoaderVisibleMs:
      250,

    maxBootRetries:
      1,

    renderTimeoutMs:
      10000,
  });

/* =========================================================
   EVENTS
========================================================= */

export const APP_EVENTS =
  Object.freeze({
    ready:
      "app:ready",

    bootStart:
      "app:boot:start",

    bootError:
      "app:boot:error",

    reboot:
      "app:reboot",

    routeChange:
      "app:route:change",

    langChange:
      "app:lang:change",
  });

/* =========================================================
   UI
========================================================= */

export const UI_CONSTANTS =
  Object.freeze({
    defaultTheme:
      "dark",

    fallbackLang:
      "es",

    defaultRoute:
      "/",
  });

/* =========================================================
   HELPERS
========================================================= */

export function getBootFailsafeMs() {
  return BOOT_CONSTANTS
    .failsafeLoaderMs;
}

export function getAppScope(
  key = "global"
) {
  return (
    APP_SCOPES?.[key] ||
    APP_SCOPE
  );
}

export function getAppEvent(
  key = ""
) {
  return (
    APP_EVENTS?.[key] ||
    ""
  );
}

export function getUiConstant(
  key = "",
  fallback = null
) {
  if (
    Object.prototype.hasOwnProperty.call(
      UI_CONSTANTS,
      key
    )
  ) {
    return UI_CONSTANTS[key];
  }

  return fallback;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getAppConstantsSnapshot() {
  return {
    scope:
      APP_SCOPE,
    failsafeLoaderMs:
      BOOT_FAILSAFE_LOADER_MS,
    events:
      APP_EVENTS,
    ui:
      UI_CONSTANTS,
  };
}

export default Object.freeze({
  APP_SCOPE,
  APP_SCOPES,
  BOOT_FAILSAFE_LOADER_MS,
  BOOT_CONSTANTS,
  APP_EVENTS,
  UI_CONSTANTS,
  getBootFailsafeMs,
  getAppScope,
  getAppEvent,
  getUiConstant,
  getAppConstantsSnapshot,
});
