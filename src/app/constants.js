/* =========================================================
   Onion SPA - App Constants
   Archivo: src/app/constants.js

   ONION SUPPORT · APP CONSTANTS
   EXTREME PRO SYSTEM · BOOT CONTRACT · ROUTER/AUTH SAFE
   FINAL EXTREME 10/10

   RESPONSABILIDADES:
   - centralizar constantes del bootstrap de la app
   - definir scope global de cleanup
   - definir timeouts de boot / restore / render / loader
   - centralizar claves internas del runtime
   - centralizar eventos públicos internos
   - centralizar rutas técnicas públicas con token
   - centralizar IDs/selectores DOM críticos
   - mantener contrato estable entre:
     · src/main.js
     · src/app/index.js
     · src/app/router.js
     · src/app/session.js
     · src/app/helpers.js
     · src/app/loader.js
     · src/app/shell.js
     · src/app/ui.js
     · src/app/events.js
     · src/app/errors.js
   - exponer helpers seguros y snapshots de diagnóstico

   REGLAS:
   - sin dependencias externas
   - sin DOM access
   - sin localStorage/sessionStorage
   - sin mutaciones accidentales
   - Object.freeze profundo con protección de ciclos
   - aliases estables para compatibilidad
   - tolerancia total a claves desconocidas
========================================================= */

/* =========================================================
   FREEZE
========================================================= */

function deepFreeze(value, seen = new WeakSet()) {
  if (
    !value ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  try {
    if (seen.has(value)) {
      return value;
    }

    seen.add(value);

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
        deepFreeze(child, seen);
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

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
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

function clonePublicTokenRoute(config = {}) {
  return freeze({
    ...config,

    tokenParamNames:
      cloneArray(config.tokenParamNames),

    windowKeys:
      cloneArray(config.windowKeys),

    scrubbedStateKeys:
      cloneArray(config.scrubbedStateKeys),

    scrubbedHistoryKeys:
      cloneArray(config.scrubbedHistoryKeys),
  });
}

function findByKey(collection, key = "") {
  const cleanKey =
    safeText(key, "");

  if (!cleanKey) {
    return null;
  }

  return (
    collection.find((item) =>
      item?.key === cleanKey
    ) || null
  );
}

/* =========================================================
   VERSION
========================================================= */

export const APP_CONSTANTS_VERSION =
  "10.0.0";

/* =========================================================
   CLEANUP / SCOPES
========================================================= */

export const APP_SCOPE =
  "app:global";

export const APP_SCOPES =
  freeze({
    global:
      APP_SCOPE,

    boot:
      "app:boot",

    loader:
      "app:loader",

    shell:
      "app:shell",

    router:
      "app:router",

    session:
      "app:session",

    auth:
      "app:auth",

    store:
      "app:store",

    ui:
      "app:ui",

    sidebar:
      "app:ui:sidebar",

    topbar:
      "app:ui:topbar",

    toast:
      "app:ui:toast",

    i18n:
      "app:i18n",

    events:
      "app:events",

    errors:
      "app:errors",

    warmup:
      "app:warmup",

    diagnostics:
      "app:diagnostics",
  });

/* =========================================================
   BOOT / TIMEOUTS

   IMPORTANTE:
   - src/app/loader.js ya impone mínimo interno de 8000ms.
   - aquí dejamos 12000ms para evitar falsos positivos.
========================================================= */

export const BOOT_FAILSAFE_LOADER_MS =
  12000;

export const BOOT_MIN_LOADER_VISIBLE_MS =
  500;

export const BOOT_HIDE_TRANSITION_MS =
  220;

export const BOOT_RENDER_TIMEOUT_MS =
  10000;

export const BOOT_RESTORE_TIMEOUT_MS =
  12000;

export const BOOT_READY_EVENT_DELAY_MS =
  0;

export const BOOT_MAIN_TIMEOUT_MS =
  45000;

export const BOOT_SESSION_READY_DEDUPE_MS =
  160;

export const BOOT_UI_REPAIR_THROTTLE_MS =
  140;

export const BOOT_UI_SYNC_THROTTLE_MS =
  100;

export const BOOT_CONSTANTS =
  freeze({
    failsafeLoaderMs:
      BOOT_FAILSAFE_LOADER_MS,

    minLoaderVisibleMs:
      BOOT_MIN_LOADER_VISIBLE_MS,

    hideTransitionMs:
      BOOT_HIDE_TRANSITION_MS,

    legacyMinLoaderVisibleMs:
      250,

    renderTimeoutMs:
      BOOT_RENDER_TIMEOUT_MS,

    restoreTimeoutMs:
      BOOT_RESTORE_TIMEOUT_MS,

    readyEventDelayMs:
      BOOT_READY_EVENT_DELAY_MS,

    mainTimeoutMs:
      BOOT_MAIN_TIMEOUT_MS,

    sessionReadyDedupeMs:
      BOOT_SESSION_READY_DEDUPE_MS,

    uiRepairThrottleMs:
      BOOT_UI_REPAIR_THROTTLE_MS,

    uiSyncThrottleMs:
      BOOT_UI_SYNC_THROTTLE_MS,

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

    services:
      "services",

    store:
      "store",

    i18n:
      "i18n",

    ui:
      "ui",

    restoring:
      "restoring",

    rendering:
      "rendering",

    binding:
      "binding",

    finalizing:
      "finalizing",

    ready:
      "ready",

    error:
      "error",

    fatal:
      "fatal",

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

    appReady:
      "appReady",

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

    uiInitialized:
      "uiInitialized",

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

    loginNavigationHandled:
      "loginNavigationHandled",

    loginInProgress:
      "loginInProgress",

    initialRouteRendered:
      "initialRouteRendered",

    postRestoreNavigationSkipped:
      "postRestoreNavigationSkipped",

    sessionRestorePromise:
      "sessionRestorePromise",
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

    resetPasswordConfirmInitialUrl:
      "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",

    bootContext:
      "__ONION_BOOT_CONTEXT__",

    bootTheme:
      "__ONION_BOOT_THEME__",

    appApi:
      "__ONION_APP__",

    routerApi:
      "__ONION_ROUTER__",

    coreApi:
      "__ONION_CORE__",

    debug:
      "__ONION_DEBUG__",

    loader:
      "__ONION_LOADER__",

    setTheme:
      "__ONION_SET_THEME__",

    getTheme:
      "__ONION_GET_THEME__",

    clearTheme:
      "__ONION_CLEAR_THEME__",
  });

export const APP_STATE_KEYS =
  freeze({
    bootInitialUrl:
      "bootInitialUrl",

    bootInitialPath:
      "bootInitialPath",

    bootCanonicalPath:
      "bootCanonicalPath",

    bootProtectedInitialUrl:
      "bootProtectedInitialUrl",

    bootProtectedInitialPath:
      "bootProtectedInitialPath",

    bootProtectedInitialPublicPath:
      "bootProtectedInitialPublicPath",

    bootIsPublicTokenRoute:
      "bootIsPublicTokenRoute",

    bootHasPublicToken:
      "bootHasPublicToken",

    bootHasProtectedToken:
      "bootHasProtectedToken",

    bootProtectedRouteKey:
      "bootProtectedRouteKey",

    bootActivationInitialUrl:
      "bootActivationInitialUrl",

    bootActivationInitialPath:
      "bootActivationInitialPath",

    bootActivationInitialPublicPath:
      "bootActivationInitialPublicPath",

    bootIsActivation:
      "bootIsActivation",

    bootHasActivationToken:
      "bootHasActivationToken",

    bootResetConfirmInitialUrl:
      "bootResetConfirmInitialUrl",

    bootResetConfirmInitialPath:
      "bootResetConfirmInitialPath",

    bootResetConfirmInitialPublicPath:
      "bootResetConfirmInitialPublicPath",

    bootIsResetConfirm:
      "bootIsResetConfirm",

    bootHasResetToken:
      "bootHasResetToken",

    route:
      "route",

    publicPath:
      "publicPath",

    authenticated:
      "authenticated",

    user:
      "user",

    role:
      "role",

    lang:
      "lang",

    theme:
      "theme",
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

    signin:
      "/signin",

    forbidden:
      "/403",

    notFound:
      "/404",

    activateAccount:
      "/activate-account",

    resetPassword:
      "/reset-password",

    resetPasswordConfirm:
      "/reset-password/confirm",

    forgotPassword:
      "/forgot-password",

    recoverPassword:
      "/recover-password",

    passwordReset:
      "/password-reset",
  });

export const ACTIVATION_PATH =
  APP_ROUTES.activateAccount;

export const RESET_CONFIRM_PATH =
  APP_ROUTES.resetPasswordConfirm;

export const LOGIN_PATH =
  APP_ROUTES.login;

export const DEFAULT_ROUTE =
  APP_ROUTES.home;

export const AUTH_LIKE_ROUTES =
  freeze([
    APP_ROUTES.login,
    APP_ROUTES.signin,
    APP_ROUTES.resetPassword,
    APP_ROUTES.resetPasswordConfirm,
    APP_ROUTES.forgotPassword,
    APP_ROUTES.recoverPassword,
    APP_ROUTES.passwordReset,
    APP_ROUTES.activateAccount,
  ]);

export const PUBLIC_TECHNICAL_ROUTES =
  freeze([
    APP_ROUTES.activateAccount,
    APP_ROUTES.resetPassword,
    APP_ROUTES.resetPasswordConfirm,
    APP_ROUTES.forgotPassword,
    APP_ROUTES.recoverPassword,
    APP_ROUTES.passwordReset,
  ]);

export const PUBLIC_TECHNICAL_PREFIXES =
  freeze([
    `${APP_ROUTES.activateAccount}/`,
    `${APP_ROUTES.resetPasswordConfirm}/`,
  ]);

/* =========================================================
   TOKEN ROUTES
========================================================= */

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
    "confirmToken",
    "code",
    "t",
  ]);

export const GENERIC_SENSITIVE_PARAM_NAMES =
  freeze([
    "token",
    "activationToken",
    "activateToken",
    "resetToken",
    "passwordResetToken",
    "confirmToken",
    "code",
    "t",
    "access_token",
    "refresh_token",
    "id_token",
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "twoFactorToken",
    "two_factor_token",
    "mfaToken",
    "mfa_token",
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

      windowKeys:
        freeze([
          APP_RUNTIME_KEYS.activateAccountInitialUrl,
        ]),

      statePrefix:
        "Activation",

      stateUrlKey:
        APP_STATE_KEYS.bootActivationInitialUrl,

      statePathKey:
        APP_STATE_KEYS.bootActivationInitialPath,

      statePublicPathKey:
        APP_STATE_KEYS.bootActivationInitialPublicPath,

      stateIsRouteKey:
        APP_STATE_KEYS.bootIsActivation,

      stateHasTokenKey:
        APP_STATE_KEYS.bootHasActivationToken,

      scrubbedStateKeys:
        freeze([
          "scrubbedActivationToken",
          "activationTokenScrubbed",
          "scrubbedActivateAccountToken",
        ]),

      scrubbedHistoryKeys:
        freeze([
          "scrubbedActivationToken",
          "activationTokenScrubbed",
          "scrubbedActivateAccountToken",
          "scrubbedPublicTokenRoute",
          "scrubbedTokenRoute",
        ]),

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

      windowKeys:
        freeze([
          APP_RUNTIME_KEYS.resetConfirmInitialUrl,
          APP_RUNTIME_KEYS.resetPasswordConfirmInitialUrl,
        ]),

      statePrefix:
        "ResetConfirm",

      stateUrlKey:
        APP_STATE_KEYS.bootResetConfirmInitialUrl,

      statePathKey:
        APP_STATE_KEYS.bootResetConfirmInitialPath,

      statePublicPathKey:
        APP_STATE_KEYS.bootResetConfirmInitialPublicPath,

      stateIsRouteKey:
        APP_STATE_KEYS.bootIsResetConfirm,

      stateHasTokenKey:
        APP_STATE_KEYS.bootHasResetToken,

      scrubbedStateKeys:
        freeze([
          "scrubbedResetToken",
          "resetTokenScrubbed",
          "scrubbedResetConfirmToken",
          "scrubbedPasswordResetToken",
        ]),

      scrubbedHistoryKeys:
        freeze([
          "scrubbedResetToken",
          "resetTokenScrubbed",
          "scrubbedResetConfirmToken",
          "scrubbedPasswordResetToken",
          "scrubbedPublicTokenRoute",
          "scrubbedTokenRoute",
        ]),

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

    userUiSync:
      "app:user-ui:sync",

    userUiSyncStart:
      "app:user-ui:sync:start",

    userUiSyncDone:
      "app:user-ui:sync:done",

    userUiSyncError:
      "app:user-ui:sync:error",

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

    routeSynced:
      "app:events:route-synced",

    userChange:
      "app:user:change",

    langChange:
      "app:lang:change",

    themeChange:
      "app:theme:change",

    sessionRestored:
      "app:session:restored",

    sessionCleared:
      "app:session:cleared",

    sessionRestoreError:
      "app:session:restore:error",

    authNavigation:
      "app:auth:navigation",

    shellState:
      "app:shell:state",

    shellReady:
      "app:shell:ready",

    shellBusy:
      "app:shell:busy",

    error:
      "app:error",

    errorTelemetry:
      "app:error:telemetry",
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

    shellChange:
      "router:shell:change",

    navigationHandled:
      "router:navigation:handled",

    navigationError:
      "router:navigation:error",

    routeChange:
      "router:route:change",

    notFound:
      "router:not-found",

    forbidden:
      "router:forbidden",
  });

export const AUTH_EVENTS =
  freeze({
    sessionRestored:
      "auth:session:restored",

    loginSuccess:
      "auth:login:success",

    logout:
      "auth:logout",

    logoutSuccess:
      "auth:logout:success",

    userChange:
      "auth:user:change",

    tokenRefreshed:
      "auth:token:refreshed",

    sessionCleared:
      "auth:session:cleared",

    restoreError:
      "auth:restore:error",
  });

export const STORE_EVENTS =
  freeze({
    bootState:
      "store:boot:state",

    bootReady:
      "store:boot:ready",

    bootError:
      "store:boot:error",

    change:
      "store:change",

    ready:
      "store:ready",
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

    storage:
      "storage",

    online:
      "online",

    offline:
      "offline",
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

    defaultThemeMode:
      "system",

    fallbackLang:
      "es",

    defaultLang:
      "es",

    defaultDensity:
      "default",

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

    fatalClass:
      "app-fatal",

    errorClass:
      "app-error",

    authScreenClass:
      "auth-screen",

    routeAuthClass:
      "route-auth",

    routeAppClass:
      "route-app",

    chromeHiddenClass:
      "route-chrome-hidden",

    chromeVisibleClass:
      "route-chrome-visible",

    shellHiddenRouteClass:
      "route-shell-hidden",

    shellVisibleRouteClass:
      "route-shell-visible",
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

    mainContent:
      "main-content",

    appContent:
      "app-content",

    loader:
      "app-loader",

    viewContainer:
      "view-container",

    sidebar:
      "app-sidebar",

    sidebarMount:
      "sidebar-mount",

    topbar:
      "app-topbar",

    topbarMount:
      "topbar-mount",

    tablehead:
      "table-head",

    tableheadContainer:
      "tablehead-container",
  });

export const APP_SELECTORS =
  freeze({
    app:
      "#app",

    root:
      "#app-root",

    shell:
      "#app-shell",

    mainContent:
      "#main-content",

    appContent:
      "#app-content",

    loader:
      "#app-loader",

    viewContainer:
      "#view-container",

    sidebar:
      "#app-sidebar",

    sidebarMount:
      "#sidebar-mount",

    topbar:
      "#app-topbar",

    topbarMount:
      "#topbar-mount",

    tablehead:
      "#table-head",

    tableheadContainer:
      "#tablehead-container",

    appShell:
      "[data-app-shell='true']",

    main:
      "[data-main-content='true']",

    viewRoot:
      "[data-view-root='true']",

    routerView:
      "[data-router-view='true']",

    appLoader:
      "[data-app-loader='true']",

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

    loader:
      "Loader",

    shell:
      "Shell",
  });

/* =========================================================
   UI LIFECYCLE / REPAIR

   Importante:
   - UI_LIGHT_* no debe incluir repair/rebind/bindEvents.
   - UI_REBIND_METHODS queda separado y solo para petición explícita.
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

    routeChange:
      "app:route:change",

    routerRendered:
      "router:rendered",

    langChange:
      "app:lang:change",

    themeChange:
      "app:theme:change",
  });

export const UI_LIGHT_USER_METHODS =
  freeze([
    "renderUser",
    "refreshUser",
    "updateUser",
    "syncUser",
  ]);

export const UI_LIGHT_VISUAL_METHODS =
  freeze([
    "applyRoleVisibility",
    "syncRouteAndIndicator",
    "syncIndicator",
    "updateToggleLabel",
    "syncRoute",
    "updateRoute",
  ]);

export const UI_LIGHT_FALLBACK_METHODS =
  freeze([
    "refresh",
    "sync",
  ]);

export const UI_HARD_REPAIR_METHODS =
  freeze([
    "repair",
    "refresh",
    "sync",
  ]);

export const UI_REBIND_METHODS =
  freeze([
    "rebind",
    "rebindEvents",
    "bindEvents",
    "bind",
  ]);

export const UI_REPAIR_METHODS =
  freeze([
    ...UI_LIGHT_USER_METHODS,
    ...UI_LIGHT_VISUAL_METHODS,
    ...UI_LIGHT_FALLBACK_METHODS,
  ]);

export const UI_AFTER_PAINT_REPAIR_METHODS =
  freeze([
    "sync",
    "syncUser",
    "refreshUser",
    "updateUser",
    "syncRouteAndIndicator",
    "syncIndicator",
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

    fatal:
      "fatal",
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

export function getBootHideTransitionMs() {
  return BOOT_CONSTANTS.hideTransitionMs;
}

export function getBootRenderTimeoutMs() {
  return BOOT_CONSTANTS.renderTimeoutMs;
}

export function getBootRestoreTimeoutMs() {
  return BOOT_CONSTANTS.restoreTimeoutMs;
}

export function getBootMainTimeoutMs() {
  return BOOT_CONSTANTS.mainTimeoutMs;
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

export function getBootFlag(key = "", fallback = "") {
  const cleanKey =
    safeText(key, "");

  if (
    hasOwn(
      BOOT_FLAGS,
      cleanKey
    )
  ) {
    return BOOT_FLAGS[cleanKey];
  }

  return fallback;
}

/* =========================================================
   HELPERS - EVENTS
========================================================= */

export function getAppEvent(key = "", fallback = "") {
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

  return fallback;
}

export function getRouterEvent(key = "", fallback = "") {
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

  return fallback;
}

export function getAuthEvent(key = "", fallback = "") {
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

  return fallback;
}

export function getStoreEvent(key = "", fallback = "") {
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

  return fallback;
}

export function getDomEvent(key = "", fallback = "") {
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

  return fallback;
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
   HELPERS - RUNTIME / STATE KEYS
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
  const config =
    findByKey(
      PROTECTED_PUBLIC_TOKEN_ROUTES,
      key
    );

  return config
    ? clonePublicTokenRoute(config)
    : null;
}

export function getPublicTokenRouteConfigRaw(key = "") {
  return findByKey(
    PROTECTED_PUBLIC_TOKEN_ROUTES,
    key
  );
}

export function getPublicTokenRouteConfigByPath(path = "") {
  const cleanPath =
    safeText(path, "");

  if (!cleanPath) {
    return null;
  }

  const config =
    PROTECTED_PUBLIC_TOKEN_ROUTES.find((item) => {
      return (
        cleanPath === item.path ||
        cleanPath.startsWith(`${item.path}/`)
      );
    }) || null;

  return config
    ? clonePublicTokenRoute(config)
    : null;
}

export function getPublicTokenRouteConfigs() {
  return PROTECTED_PUBLIC_TOKEN_ROUTES.map((config) =>
    clonePublicTokenRoute(config)
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

export function getPublicTechnicalRoutes() {
  return cloneArray(PUBLIC_TECHNICAL_ROUTES);
}

export function getPublicTechnicalPrefixes() {
  return cloneArray(PUBLIC_TECHNICAL_PREFIXES);
}

export function isKnownPublicTokenRouteKey(key = "") {
  const cleanKey =
    safeText(key, "");

  return PROTECTED_PUBLIC_TOKEN_ROUTES.some((config) =>
    config.key === cleanKey
  );
}

export function isPublicTechnicalRoute(path = "") {
  const cleanPath =
    safeText(path, "/")
      .split("?")[0]
      .split("#")[0]
      .replace(/\/+$/g, "") || "/";

  if (
    PUBLIC_TECHNICAL_ROUTES.includes(cleanPath)
  ) {
    return true;
  }

  return PUBLIC_TECHNICAL_PREFIXES.some((prefix) =>
    cleanPath.startsWith(prefix)
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

export function getUiLightUserMethods() {
  return cloneArray(UI_LIGHT_USER_METHODS);
}

export function getUiLightVisualMethods() {
  return cloneArray(UI_LIGHT_VISUAL_METHODS);
}

export function getUiLightFallbackMethods() {
  return cloneArray(UI_LIGHT_FALLBACK_METHODS);
}

export function getUiHardRepairMethods() {
  return cloneArray(UI_HARD_REPAIR_METHODS);
}

export function getUiRebindMethods() {
  return cloneArray(UI_REBIND_METHODS);
}

export function getUiAfterPaintRepairMethods() {
  return cloneArray(UI_AFTER_PAINT_REPAIR_METHODS);
}

/* =========================================================
   HELPERS - SAFE VALUES
========================================================= */

export function clampBootTimeoutMs(value, fallback = BOOT_MAIN_TIMEOUT_MS) {
  const ms =
    safeNumber(value, fallback);

  if (ms <= 0) {
    return fallback;
  }

  return Math.max(
    1000,
    Math.min(
      ms,
      120000
    )
  );
}

export function redactSensitiveText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  for (const name of GENERIC_SENSITIVE_PARAM_NAMES) {
    try {
      const escapedName =
        String(name).replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

      output =
        output.replace(
          new RegExp(`([?&#]${escapedName}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
    } catch {}
  }

  for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
    try {
      const escapedPath =
        config.path.replace(/\//g, "\\/");

      output =
        output.replace(
          new RegExp(`(${escapedPath})\\/([^/?#\\s]+)`, "gi"),
          "$1/***"
        );
    } catch {}
  }

  try {
    output =
      output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  } catch {}

  return output;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getAppConstantsSnapshot() {
  return freeze({
    version:
      APP_CONSTANTS_VERSION,

    scope:
      APP_SCOPE,

    scopes:
      APP_SCOPES,

    boot: {
      failsafeLoaderMs:
        BOOT_FAILSAFE_LOADER_MS,

      minLoaderVisibleMs:
        BOOT_MIN_LOADER_VISIBLE_MS,

      hideTransitionMs:
        BOOT_HIDE_TRANSITION_MS,

      renderTimeoutMs:
        BOOT_RENDER_TIMEOUT_MS,

      restoreTimeoutMs:
        BOOT_RESTORE_TIMEOUT_MS,

      readyEventDelayMs:
        BOOT_READY_EVENT_DELAY_MS,

      mainTimeoutMs:
        BOOT_MAIN_TIMEOUT_MS,

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

    routes: {
      app:
        APP_ROUTES,

      authLike:
        AUTH_LIKE_ROUTES,

      publicTechnical:
        PUBLIC_TECHNICAL_ROUTES,

      publicTechnicalPrefixes:
        PUBLIC_TECHNICAL_PREFIXES,
    },

    publicTokenRoutes:
      PROTECTED_PUBLIC_TOKEN_ROUTES,

    sensitiveParams:
      GENERIC_SENSITIVE_PARAM_NAMES,

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

      lightUserMethods:
        UI_LIGHT_USER_METHODS,

      lightVisualMethods:
        UI_LIGHT_VISUAL_METHODS,

      lightFallbackMethods:
        UI_LIGHT_FALLBACK_METHODS,

      hardRepairMethods:
        UI_HARD_REPAIR_METHODS,

      rebindMethods:
        UI_REBIND_METHODS,

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
  APP_CONSTANTS_VERSION,

  APP_SCOPE,
  APP_SCOPES,

  BOOT_FAILSAFE_LOADER_MS,
  BOOT_MIN_LOADER_VISIBLE_MS,
  BOOT_HIDE_TRANSITION_MS,
  BOOT_RENDER_TIMEOUT_MS,
  BOOT_RESTORE_TIMEOUT_MS,
  BOOT_READY_EVENT_DELAY_MS,
  BOOT_MAIN_TIMEOUT_MS,
  BOOT_SESSION_READY_DEDUPE_MS,
  BOOT_UI_REPAIR_THROTTLE_MS,
  BOOT_UI_SYNC_THROTTLE_MS,
  BOOT_CONSTANTS,
  BOOT_PHASES,
  BOOT_FLAGS,

  APP_RUNTIME_KEYS,
  APP_STATE_KEYS,

  APP_ROUTES,
  ACTIVATION_PATH,
  RESET_CONFIRM_PATH,
  LOGIN_PATH,
  DEFAULT_ROUTE,
  AUTH_LIKE_ROUTES,
  PUBLIC_TECHNICAL_ROUTES,
  PUBLIC_TECHNICAL_PREFIXES,

  ACTIVATION_TOKEN_PARAM_NAMES,
  RESET_TOKEN_PARAM_NAMES,
  GENERIC_SENSITIVE_PARAM_NAMES,
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
  UI_LIGHT_USER_METHODS,
  UI_LIGHT_VISUAL_METHODS,
  UI_LIGHT_FALLBACK_METHODS,
  UI_HARD_REPAIR_METHODS,
  UI_REBIND_METHODS,
  UI_AFTER_PAINT_REPAIR_METHODS,

  APP_LOG_PREFIX,
  APP_LOG_LEVELS,

  getAppScope,
  getAppScopes,

  getBootFailsafeMs,
  getBootMinLoaderVisibleMs,
  getBootHideTransitionMs,
  getBootRenderTimeoutMs,
  getBootRestoreTimeoutMs,
  getBootMainTimeoutMs,
  getBootConstant,
  getBootPhase,
  getBootFlag,

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
  getPublicTokenRouteConfigRaw,
  getPublicTokenRouteConfigByPath,
  getPublicTokenRouteConfigs,
  getPublicTokenRoutePaths,
  getPublicTokenRouteKeys,
  getPublicTechnicalRoutes,
  getPublicTechnicalPrefixes,
  isKnownPublicTokenRouteKey,
  isPublicTechnicalRoute,

  getAppModuleName,
  getUiRepairReason,
  getUiRepairMethods,
  getUiLightUserMethods,
  getUiLightVisualMethods,
  getUiLightFallbackMethods,
  getUiHardRepairMethods,
  getUiRebindMethods,
  getUiAfterPaintRepairMethods,

  clampBootTimeoutMs,
  redactSensitiveText,

  getAppConstantsSnapshot,
});
