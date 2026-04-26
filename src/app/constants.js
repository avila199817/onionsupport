/* =========================================================
   Onion SPA - App Constants
   Archivo: src/app/constants.js

   Responsabilidades:
   - centralizar constantes del bootstrap de la app
   - definir scope global de cleanup
   - definir timeouts de failsafe del boot
   - centralizar claves internas del runtime
   - centralizar eventos públicos internos
   - centralizar rutas técnicas públicas con token
   - endurecer configuración global app
   - exponer helpers seguros y snapshots de diagnóstico

   HARDENING PRO:
   - Object.freeze profundo
   - aliases públicos estables
   - configuración sin mutaciones accidentales
   - tolerancia total a claves desconocidas
   - escalable para futuros módulos
========================================================= */

/* =========================================================
   FREEZE
========================================================= */

function deepFreeze(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  try {
    const keys =
      Object.getOwnPropertyNames(value);

    for (const key of keys) {
      const child =
        value[key];

      if (
        child &&
        typeof child === "object" &&
        !Object.isFrozen(child)
      ) {
        deepFreeze(child);
      }
    }

    return Object.freeze(value);
  } catch {
    return value;
  }
}

function freeze(value) {
  return deepFreeze(value);
}

/* =========================================================
   BASIC HELPERS
========================================================= */

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

function hasOwn(object, key) {
  try {
    return Object.prototype.hasOwnProperty.call(
      object,
      key
    );
  } catch {
    return false;
  }
}

function cloneArray(value) {
  return Array.isArray(value)
    ? [...value]
    : [];
}

function cloneObject(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return {
    ...value,
  };
}

/* =========================================================
   CLEANUP / SCOPES
========================================================= */

export const APP_SCOPE =
  "app:global";

export const APP_SCOPES =
  freeze({
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

    loader:
      "app:loader",

    shell:
      "app:shell",

    session:
      "app:session",

    i18n:
      "app:i18n",

    errors:
      "app:errors",

    warmup:
      "app:warmup",
  });

/* =========================================================
   BOOT / TIMEOUTS
========================================================= */

export const BOOT_FAILSAFE_LOADER_MS =
  2500;

export const BOOT_MIN_LOADER_VISIBLE_MS =
  500;

export const BOOT_RENDER_TIMEOUT_MS =
  10000;

export const BOOT_RESTORE_TIMEOUT_MS =
  12000;

export const BOOT_READY_EVENT_DELAY_MS =
  0;

export const BOOT_CONSTANTS =
  freeze({
    failsafeLoaderMs:
      BOOT_FAILSAFE_LOADER_MS,

    minLoaderVisibleMs:
      BOOT_MIN_LOADER_VISIBLE_MS,

    legacyMinLoaderVisibleMs:
      250,

    renderTimeoutMs:
      BOOT_RENDER_TIMEOUT_MS,

    restoreTimeoutMs:
      BOOT_RESTORE_TIMEOUT_MS,

    readyEventDelayMs:
      BOOT_READY_EVENT_DELAY_MS,

    maxBootRetries:
      1,

    maxRebootRetries:
      1,

    bootCycleInitial:
      0,

    bootFinalizedInitial:
      0,
  });

/* =========================================================
   BOOT PHASES / FLAGS
========================================================= */

export const BOOT_PHASES =
  freeze({
    idle:
      "idle",

    preparing:
      "preparing",

    booting:
      "booting",

    restoring:
      "restoring",

    rendering:
      "rendering",

    finalizing:
      "finalizing",

    ready:
      "ready",

    error:
      "error",

    rebooting:
      "rebooting",
  });

export const BOOT_FLAGS =
  freeze({
    booted:
      "booted",

    booting:
      "booting",

    ready:
      "ready",

    loading:
      "loading",

    servicesReady:
      "servicesReady",

    storeReady:
      "storeReady",

    routerConfigured:
      "routerConfigured",

    routerBound:
      "routerBound",

    uiReady:
      "uiReady",

    uiMounted:
      "uiMounted",

    readyEmitted:
      "readyEmitted",

    handlersBound:
      "handlersBound",

    appEventsBound:
      "appEventsBound",

    uiRepairEventsBound:
      "uiRepairEventsBound",

    bootNavigationHandled:
      "bootNavigationHandled",

    initialRouteRendered:
      "initialRouteRendered",
  });

/* =========================================================
   INTERNAL RUNTIME KEYS
========================================================= */

export const APP_RUNTIME_KEYS =
  freeze({
    initialUrl:
      "__ONION_INITIAL_URL__",

    activateAccountInitialUrl:
      "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",

    resetConfirmInitialUrl:
      "__ONION_RESET_CONFIRM_INITIAL_URL__",

    bootContext:
      "__ONION_BOOT_CONTEXT__",

    appApi:
      "__ONION_APP__",

    routerApi:
      "__ONION_ROUTER__",

    debug:
      "__ONION_DEBUG__",

    loader:
      "__ONION_LOADER__",
  });

export const APP_STATE_KEYS =
  freeze({
    bootInitialUrl:
      "bootInitialUrl",

    bootProtectedInitialUrl:
      "bootProtectedInitialUrl",

    bootProtectedInitialPath:
      "bootProtectedInitialPath",

    bootIsPublicTokenRoute:
      "bootIsPublicTokenRoute",

    bootHasPublicToken:
      "bootHasPublicToken",

    bootProtectedRouteKey:
      "bootProtectedRouteKey",

    bootActivationInitialUrl:
      "bootActivationInitialUrl",

    bootActivationInitialPath:
      "bootActivationInitialPath",

    bootIsActivation:
      "bootIsActivation",

    bootHasActivationToken:
      "bootHasActivationToken",

    bootResetConfirmInitialUrl:
      "bootResetConfirmInitialUrl",

    bootResetConfirmInitialPath:
      "bootResetConfirmInitialPath",

    bootIsResetConfirm:
      "bootIsResetConfirm",

    bootHasResetToken:
      "bootHasResetToken",
  });

/* =========================================================
   ROUTES
========================================================= */

export const APP_ROUTES =
  freeze({
    home:
      "/",

    login:
      "/login",

    forbidden:
      "/403",

    notFound:
      "/404",

    activateAccount:
      "/activate-account",

    resetPasswordConfirm:
      "/reset-password/confirm",
  });

export const ACTIVATION_PATH =
  APP_ROUTES.activateAccount;

export const RESET_CONFIRM_PATH =
  APP_ROUTES.resetPasswordConfirm;

export const ACTIVATION_TOKEN_PARAM_NAMES =
  freeze([
    "token",
    "activationToken",
    "activateToken",
    "code",
    "t",
  ]);

export const RESET_TOKEN_PARAM_NAMES =
  freeze([
    "token",
    "resetToken",
    "passwordResetToken",
    "code",
    "t",
  ]);

export const PUBLIC_TOKEN_ROUTE_KEYS =
  freeze({
    activation:
      "activation",

    resetConfirm:
      "resetConfirm",
  });

export const PROTECTED_PUBLIC_TOKEN_ROUTES =
  freeze([
    freeze({
      key:
        PUBLIC_TOKEN_ROUTE_KEYS.activation,

      path:
        ACTIVATION_PATH,

      windowKey:
        APP_RUNTIME_KEYS.activateAccountInitialUrl,

      statePrefix:
        "Activation",

      stateUrlKey:
        APP_STATE_KEYS.bootActivationInitialUrl,

      statePathKey:
        APP_STATE_KEYS.bootActivationInitialPath,

      stateIsRouteKey:
        APP_STATE_KEYS.bootIsActivation,

      stateHasTokenKey:
        APP_STATE_KEYS.bootHasActivationToken,

      tokenParamNames:
        ACTIVATION_TOKEN_PARAM_NAMES,
    }),

    freeze({
      key:
        PUBLIC_TOKEN_ROUTE_KEYS.resetConfirm,

      path:
        RESET_CONFIRM_PATH,

      windowKey:
        APP_RUNTIME_KEYS.resetConfirmInitialUrl,

      statePrefix:
        "ResetConfirm",

      stateUrlKey:
        APP_STATE_KEYS.bootResetConfirmInitialUrl,

      statePathKey:
        APP_STATE_KEYS.bootResetConfirmInitialPath,

      stateIsRouteKey:
        APP_STATE_KEYS.bootIsResetConfirm,

      stateHasTokenKey:
        APP_STATE_KEYS.bootHasResetToken,

      tokenParamNames:
        RESET_TOKEN_PARAM_NAMES,
    }),
  ]);

/* =========================================================
   EVENTS
========================================================= */

export const APP_EVENTS =
  freeze({
    ready:
      "app:ready",

    uiReady:
      "app:ui:ready",

    uiRepair:
      "app:ui:repair",

    uiRepairRequest:
      "app:ui:repair-request",

    bootState:
      "app:boot:state",

    bootStart:
      "app:boot:start",

    bootReady:
      "app:boot:ready",

    bootError:
      "app:boot:error",

    bootLoaderShow:
      "app:boot:loader:show",

    bootLoaderHide:
      "app:boot:loader:hide",

    bootLoaderForceHide:
      "app:boot:loader:force-hide",

    reboot:
      "app:reboot",

    routeChange:
      "app:route:change",

    userChange:
      "app:user:change",

    langChange:
      "app:lang:change",

    sessionRestored:
      "app:session:restored",

    sessionRestoreError:
      "app:session:restore:error",
  });

export const ROUTER_EVENTS =
  freeze({
    beforeRender:
      "router:before-render",

    rendered:
      "router:rendered",

    asyncComplete:
      "router:render:async-complete",

    shellState:
      "router:shell:state",

    navigationHandled:
      "router:navigation:handled",

    navigationError:
      "router:navigation:error",
  });

export const AUTH_EVENTS =
  freeze({
    sessionRestored:
      "auth:session:restored",

    loginSuccess:
      "auth:login:success",

    logout:
      "auth:logout",

    userChange:
      "auth:user:change",
  });

export const STORE_EVENTS =
  freeze({
    bootState:
      "store:boot:state",

    bootReady:
      "store:boot:ready",

    bootError:
      "store:boot:error",
  });

export const DOM_EVENTS =
  freeze({
    domContentLoaded:
      "DOMContentLoaded",

    load:
      "load",

    error:
      "error",

    unhandledRejection:
      "unhandledrejection",

    popstate:
      "popstate",

    hashchange:
      "hashchange",

    visibilityChange:
      "visibilitychange",
  });

/* =========================================================
   UI
========================================================= */

export const UI_CONSTANTS =
  freeze({
    defaultTheme:
      "dark",

    fallbackTheme:
      "dark",

    fallbackLang:
      "es",

    defaultLang:
      "es",

    defaultRoute:
      APP_ROUTES.home,

    defaultPublicPath:
      APP_ROUTES.home,

    shellHiddenClass:
      "app-shell--hidden",

    shellReadyClass:
      "app-shell--ready",

    bootingClass:
      "app-booting",

    readyClass:
      "app-ready",

    loadingClass:
      "app-loading",

    errorClass:
      "app-error",
  });

/* =========================================================
   DOM IDS / SELECTORS
========================================================= */

export const APP_DOM_IDS =
  freeze({
    app:
      "app",

    root:
      "app-root",

    shell:
      "app-shell",

    loader:
      "app-loader",

    viewContainer:
      "view-container",

    sidebar:
      "app-sidebar",

    topbar:
      "app-topbar",
  });

export const APP_SELECTORS =
  freeze({
    app:
      "#app",

    root:
      "#app-root",

    shell:
      "#app-shell",

    loader:
      "#app-loader",

    viewContainer:
      "#view-container",

    sidebar:
      "#app-sidebar",

    topbar:
      "#app-topbar",

    spaLink:
      "[data-spa]",

    tooltip:
      "[data-tooltip]",
  });

/* =========================================================
   MODULE NAMES
========================================================= */

export const APP_MODULES =
  freeze({
    core:
      "AppCore",

    store:
      "Store",

    auth:
      "Auth",

    router:
      "Router",

    http:
      "Http",

    sidebar:
      "SidebarUI",

    topbar:
      "TopbarUI",

    toast:
      "Toast",

    i18n:
      "I18n",
  });

/* =========================================================
   REPAIR / LIFECYCLE
========================================================= */

export const UI_REPAIR_REASONS =
  freeze({
    init:
      "init-ui",

    alreadyReady:
      "init-ui-already-ready",

    restore:
      "restore-session",

    restoreErrorNonBlocking:
      "restore-session-error-non-blocking",

    renderInitial:
      "render-initial-route",

    restoreNavigationHandled:
      "restore-navigation-handled",

    beforeFinalize:
      "before-finalize",

    finalize:
      "finalize-boot",

    finalizeAfterPaint:
      "finalize-boot:after-paint",

    bootError:
      "boot-error",

    bootAlreadyBooted:
      "boot-already-booted",
  });

export const UI_REPAIR_METHODS =
  freeze([
    "repair",
    "refresh",
    "sync",
    "syncUser",
    "refreshUser",
    "updateUser",
    "render",
    "rebind",
    "bindEvents",
    "bind",
  ]);

export const UI_AFTER_PAINT_REPAIR_METHODS =
  freeze([
    "sync",
    "syncUser",
    "refreshUser",
    "updateUser",
    "rebind",
    "bindEvents",
  ]);

/* =========================================================
   LOGGING
========================================================= */

export const APP_LOG_PREFIX =
  "[App]";

export const APP_LOG_LEVELS =
  freeze({
    debug:
      "debug",

    info:
      "info",

    warn:
      "warn",

    error:
      "error",
  });

/* =========================================================
   HELPERS - SCOPES
========================================================= */

export function getAppScope(key = "global") {
  const cleanKey =
    safeText(key, "global");

  if (
    hasOwn(
      APP_SCOPES,
      cleanKey
    )
  ) {
    return APP_SCOPES[cleanKey];
  }

  return APP_SCOPE;
}

export function getAppScopes() {
  return cloneObject(APP_SCOPES);
}

/* =========================================================
   HELPERS - BOOT
========================================================= */

export function getBootFailsafeMs() {
  return BOOT_CONSTANTS.failsafeLoaderMs;
}

export function getBootMinLoaderVisibleMs() {
  return BOOT_CONSTANTS.minLoaderVisibleMs;
}

export function getBootRenderTimeoutMs() {
  return BOOT_CONSTANTS.renderTimeoutMs;
}

export function getBootRestoreTimeoutMs() {
  return BOOT_CONSTANTS.restoreTimeoutMs;
}

export function getBootConstant(key = "", fallback = null) {
  const cleanKey =
    safeText(key, "");

  if (
    hasOwn(
      BOOT_CONSTANTS,
      cleanKey
    )
  ) {
    return BOOT_CONSTANTS[cleanKey];
  }

  return fallback;
}

export function getBootPhase(key = "", fallback = BOOT_PHASES.idle) {
  const cleanKey =
    safeText(key, "");

  if (
    hasOwn(
      BOOT_PHASES,
      cleanKey
    )
  ) {
    return BOOT_PHASES[cleanKey];
  }

  return fallback;
}

/* =========================================================
   HELPERS - EVENTS
========================================================= */

export function getAppEvent(key = "") {
  const cleanKey =
    safeText(key, "");

  if (
    hasOwn(
      APP_EVENTS,
      cleanKey
    )
  ) {
    return APP_EVENTS[cleanKey];
  }

  return "";
}

export function getRouterEvent(key = "") {
  const cleanKey =
    safeText(key, "");

  if (
    hasOwn(
      ROUTER_EVENTS,
      cleanKey
    )
  ) {
    return ROUTER_EVENTS[cleanKey];
  }

  return "";
}

export function getAuthEvent(key = "") {
  const cleanKey =
    safeText(key, "");

  if (
    hasOwn(
      AUTH_EVENTS,
      cleanKey
    )
  ) {
    return AUTH_EVENTS[cleanKey];
  }

  return "";
}

export function getStoreEvent(key = "") {
  const cleanKey =
    safeText(key, "");

  if (
    hasOwn(
      STORE_EVENTS,
      cleanKey
    )
  ) {
    return STORE_EVENTS[cleanKey];
  }

  return "";
}

export function getDomEvent(key = "") {
  const cleanKey =
    safeText(key, "");

  if (
    hasOwn(
      DOM_EVENTS,
      cleanKey
    )
  ) {
    return DOM_EVENTS[cleanKey];
  }

  return "";
}

/* =========================================================
   HELPERS - UI / DOM
========================================================= */

export function getUiConstant(key = "", fallback = null) {
  const cleanKey =
    safeText(key, "");

  if (
    hasOwn(
      UI_CONSTANTS,
      cleanKey
    )
  ) {
    return UI_CONSTANTS[cleanKey];
  }

  return fallback;
}

export function getDomId(key = "", fallback = "") {
  const cleanKey =
    safeText(key, "");

  if (
    hasOwn(
      APP_DOM_IDS,
      cleanKey
    )
  ) {
    return APP_DOM_IDS[cleanKey];
  }

  return fallback;
}

export function getSelector(key = "", fallback = "") {
  const cleanKey =
    safeText(key, "");

  if (
    hasOwn(
      APP_SELECTORS,
      cleanKey
    )
  ) {
    return APP_SELECTORS[cleanKey];
  }

  return fallback;
}

/* =========================================================
   HELPERS - RUNTIME KEYS
========================================================= */

export function getRuntimeKey(key = "", fallback = "") {
  const cleanKey =
    safeText(key, "");

  if (
    hasOwn(
      APP_RUNTIME_KEYS,
      cleanKey
    )
  ) {
    return APP_RUNTIME_KEYS[cleanKey];
  }

  return fallback;
}

export function getAppStateKey(key = "", fallback = "") {
  const cleanKey =
    safeText(key, "");

  if (
    hasOwn(
      APP_STATE_KEYS,
      cleanKey
    )
  ) {
    return APP_STATE_KEYS[cleanKey];
  }

  return fallback;
}

/* =========================================================
   HELPERS - ROUTES
========================================================= */

export function getAppRoute(key = "", fallback = "/") {
  const cleanKey =
    safeText(key, "");

  if (
    hasOwn(
      APP_ROUTES,
      cleanKey
    )
  ) {
    return APP_ROUTES[cleanKey];
  }

  return fallback;
}

export function getPublicTokenRouteConfig(key = "") {
  const cleanKey =
    safeText(key, "");

  return (
    PROTECTED_PUBLIC_TOKEN_ROUTES.find((config) =>
      config.key === cleanKey
    ) || null
  );
}

export function getPublicTokenRouteConfigs() {
  return PROTECTED_PUBLIC_TOKEN_ROUTES.map((config) =>
    freeze({
      ...config,
      tokenParamNames:
        cloneArray(config.tokenParamNames),
    })
  );
}

export function getPublicTokenRoutePaths() {
  return PROTECTED_PUBLIC_TOKEN_ROUTES.map((config) =>
    config.path
  );
}

export function getPublicTokenRouteKeys() {
  return PROTECTED_PUBLIC_TOKEN_ROUTES.map((config) =>
    config.key
  );
}

export function isKnownPublicTokenRouteKey(key = "") {
  const cleanKey =
    safeText(key, "");

  return PROTECTED_PUBLIC_TOKEN_ROUTES.some((config) =>
    config.key === cleanKey
  );
}

/* =========================================================
   HELPERS - MODULES / REPAIR
========================================================= */

export function getAppModuleName(key = "", fallback = "") {
  const cleanKey =
    safeText(key, "");

  if (
    hasOwn(
      APP_MODULES,
      cleanKey
    )
  ) {
    return APP_MODULES[cleanKey];
  }

  return fallback;
}

export function getUiRepairReason(key = "", fallback = "unknown") {
  const cleanKey =
    safeText(key, "");

  if (
    hasOwn(
      UI_REPAIR_REASONS,
      cleanKey
    )
  ) {
    return UI_REPAIR_REASONS[cleanKey];
  }

  return fallback;
}

export function getUiRepairMethods() {
  return cloneArray(UI_REPAIR_METHODS);
}

export function getUiAfterPaintRepairMethods() {
  return cloneArray(UI_AFTER_PAINT_REPAIR_METHODS);
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getAppConstantsSnapshot() {
  return freeze({
    scope:
      APP_SCOPE,

    scopes:
      APP_SCOPES,

    boot: {
      failsafeLoaderMs:
        BOOT_FAILSAFE_LOADER_MS,

      minLoaderVisibleMs:
        BOOT_MIN_LOADER_VISIBLE_MS,

      renderTimeoutMs:
        BOOT_RENDER_TIMEOUT_MS,

      restoreTimeoutMs:
        BOOT_RESTORE_TIMEOUT_MS,

      constants:
        BOOT_CONSTANTS,

      phases:
        BOOT_PHASES,

      flags:
        BOOT_FLAGS,
    },

    runtimeKeys:
      APP_RUNTIME_KEYS,

    stateKeys:
      APP_STATE_KEYS,

    routes:
      APP_ROUTES,

    publicTokenRoutes:
      PROTECTED_PUBLIC_TOKEN_ROUTES,

    events: {
      app:
        APP_EVENTS,

      router:
        ROUTER_EVENTS,

      auth:
        AUTH_EVENTS,

      store:
        STORE_EVENTS,

      dom:
        DOM_EVENTS,
    },

    ui:
      UI_CONSTANTS,

    dom: {
      ids:
        APP_DOM_IDS,

      selectors:
        APP_SELECTORS,
    },

    modules:
      APP_MODULES,

    repair: {
      reasons:
        UI_REPAIR_REASONS,

      methods:
        UI_REPAIR_METHODS,

      afterPaintMethods:
        UI_AFTER_PAINT_REPAIR_METHODS,
    },

    log: {
      prefix:
        APP_LOG_PREFIX,

      levels:
        APP_LOG_LEVELS,
    },
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default freeze({
  APP_SCOPE,
  APP_SCOPES,

  BOOT_FAILSAFE_LOADER_MS,
  BOOT_MIN_LOADER_VISIBLE_MS,
  BOOT_RENDER_TIMEOUT_MS,
  BOOT_RESTORE_TIMEOUT_MS,
  BOOT_READY_EVENT_DELAY_MS,
  BOOT_CONSTANTS,
  BOOT_PHASES,
  BOOT_FLAGS,

  APP_RUNTIME_KEYS,
  APP_STATE_KEYS,

  APP_ROUTES,
  ACTIVATION_PATH,
  RESET_CONFIRM_PATH,
  ACTIVATION_TOKEN_PARAM_NAMES,
  RESET_TOKEN_PARAM_NAMES,
  PUBLIC_TOKEN_ROUTE_KEYS,
  PROTECTED_PUBLIC_TOKEN_ROUTES,

  APP_EVENTS,
  ROUTER_EVENTS,
  AUTH_EVENTS,
  STORE_EVENTS,
  DOM_EVENTS,

  UI_CONSTANTS,
  APP_DOM_IDS,
  APP_SELECTORS,

  APP_MODULES,

  UI_REPAIR_REASONS,
  UI_REPAIR_METHODS,
  UI_AFTER_PAINT_REPAIR_METHODS,

  APP_LOG_PREFIX,
  APP_LOG_LEVELS,

  getAppScope,
  getAppScopes,

  getBootFailsafeMs,
  getBootMinLoaderVisibleMs,
  getBootRenderTimeoutMs,
  getBootRestoreTimeoutMs,
  getBootConstant,
  getBootPhase,

  getAppEvent,
  getRouterEvent,
  getAuthEvent,
  getStoreEvent,
  getDomEvent,

  getUiConstant,
  getDomId,
  getSelector,

  getRuntimeKey,
  getAppStateKey,

  getAppRoute,
  getPublicTokenRouteConfig,
  getPublicTokenRouteConfigs,
  getPublicTokenRoutePaths,
  getPublicTokenRouteKeys,
  isKnownPublicTokenRouteKey,

  getAppModuleName,
  getUiRepairReason,
  getUiRepairMethods,
  getUiAfterPaintRepairMethods,

  getAppConstantsSnapshot,
});
