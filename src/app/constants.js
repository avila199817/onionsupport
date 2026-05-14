/* =========================================================
   Onion SPA - App Constants
   Archivo: /src/app/constants.js

   ONION SUPPORT · APP CONSTANTS
   BOOT CONTRACT · ROUTER/AUTH SAFE · ZERO SIDE EFFECTS · 10/10

   RESPONSABILIDADES:
   - Centralizar constantes del bootstrap de la app.
   - Definir scopes globales de cleanup.
   - Definir timeouts de boot / restore / render / loader.
   - Centralizar claves internas del runtime.
   - Centralizar eventos públicos internos.
   - Centralizar rutas técnicas públicas con token.
   - Centralizar IDs/selectores DOM críticos.
   - Mantener contrato estable entre:
     · src/main.js
     · src/app/index.js
     · src/app/router.js
     · src/app/session.js
     · src/app/helpers.js
     · src/app/loader.js
     · src/app/shell.js
     · src/app/ui.js
     · src/app/i18n.js
     · src/app/events.js
     · src/app/errors.js
     · src/app/warmup.js
     · src/app/boot-state.js

   REGLAS:
   - Sin dependencias externas.
   - Sin DOM access.
   - Sin localStorage/sessionStorage.
   - Sin mutaciones accidentales.
   - Object.freeze profundo con protección de ciclos.
   - Aliases estables para compatibilidad.
   - Tolerancia total a claves desconocidas.

   EXTREME MODE:
   - Contrato único para token routes activation/reset.
   - Aliases ampliados para rutas auth públicas.
   - Helpers puros de path sin tocar window/document.
   - Redacción fuerte de query/path/Bearer/JWT.
   - Compatibilidad con hash-router y /@usuario.
   - Snapshots congelados, sin efectos secundarios.
========================================================= */

/* =========================================================
   VERSION
========================================================= */

export const APP_CONSTANTS_VERSION = "15.0.0-extreme-pro";

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

    for (const key of Object.getOwnPropertyNames(value)) {
      try {
        const child = value[key];

        if (
          child &&
          typeof child === "object" &&
          !Object.isFrozen(child)
        ) {
          deepFreeze(child, seen);
        }
      } catch {}
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
    String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

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
   PATH HELPERS · NO DOM
========================================================= */

const FALLBACK_ORIGIN =
  "http://localhost";

const PUBLIC_USERNAME_RE =
  /^@[A-Za-z0-9._-]{1,80}$/;

function normalizeSlashPath(path = "/") {
  let value =
    safeText(path, "/")
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  const segments = [];

  for (const segment of value.split("/").filter(Boolean)) {
    if (segment === ".") {
      continue;
    }

    if (segment === "..") {
      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  value =
    `/${segments.join("/")}`;

  if (!value) {
    value = "/";
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function normalizeSearch(search = "") {
  const raw =
    safeText(search, "");

  if (!raw) {
    return "";
  }

  return raw.startsWith("?")
    ? raw
    : `?${raw.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const raw =
    safeText(hash, "");

  if (!raw) {
    return "";
  }

  return raw.startsWith("#")
    ? raw
    : `#${raw.replace(/^#+/, "")}`;
}

function isHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return normalizeLocalFullPath(
      raw.replace(/^#!\/?/, "/")
    );
  }

  return normalizeLocalFullPath(
    raw.replace(/^#\/?/, "/")
  );
}

function splitFullPath(path = "/") {
  const raw =
    safeText(path, "/");

  if (isHashRouterPath(raw)) {
    return splitFullPath(
      normalizeHashRouterPath(raw)
    );
  }

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex =
    pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash =
      pathname.slice(hashIndex);

    pathname =
      pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search =
      pathname.slice(searchIndex);

    pathname =
      pathname.slice(0, searchIndex) || "/";
  }

  return {
    pathname:
      normalizeSlashPath(pathname),

    search:
      normalizeSearch(search),

    hash:
      normalizeHash(hash),
  };
}

function normalizeLocalFullPath(path = "/") {
  const raw =
    safeText(path, "/");

  if (!raw) {
    return "/";
  }

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed =
        new URL(
          raw,
          FALLBACK_ORIGIN
        );

      if (
        parsed.hash &&
        isHashRouterPath(parsed.hash)
      ) {
        return normalizeHashRouterPath(parsed.hash);
      }

      return normalizeLocalFullPath(
        `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {}

  const {
    pathname,
    search,
    hash,
  } =
    splitFullPath(raw);

  return `${pathname}${search}${hash}`;
}

function stripSearchAndHash(path = "/") {
  const normalized =
    normalizeLocalFullPath(path || "/");

  return (
    normalized
      .split("?")[0]
      .split("#")[0] ||
    "/"
  );
}

function stripUsernamePrefixFromPathname(pathname = "/") {
  const clean =
    normalizeSlashPath(pathname || "/");

  const segments =
    clean
      .split("/")
      .filter(Boolean);

  if (
    segments.length > 0 &&
    PUBLIC_USERNAME_RE.test(segments[0])
  ) {
    const rest =
      segments.slice(1).join("/");

    return rest
      ? normalizeSlashPath(`/${rest}`)
      : "/";
  }

  return clean;
}

function normalizeRouteLikePath(path = "/") {
  const normalized =
    normalizeLocalFullPath(path || "/");

  return stripUsernamePrefixFromPathname(
    stripSearchAndHash(normalized)
  );
}

function normalizePublicLikePath(path = "/") {
  return normalizeLocalFullPath(path || "/");
}

function normalizeCanonicalLikePath(path = "/") {
  return normalizeRouteLikePath(path || "/");
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

    aliases:
      cloneArray(config.aliases),
  });
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

    bootState:
      "app:boot-state",

    constants:
      "app:constants",
  });

/* =========================================================
   BOOT / TIMEOUTS
========================================================= */

export const BOOT_FAILSAFE_LOADER_MS = 12000;
export const BOOT_MIN_LOADER_VISIBLE_MS = 500;
export const BOOT_HIDE_TRANSITION_MS = 220;
export const BOOT_RENDER_TIMEOUT_MS = 10000;
export const BOOT_RESTORE_TIMEOUT_MS = 12000;
export const BOOT_READY_EVENT_DELAY_MS = 0;
export const BOOT_MAIN_TIMEOUT_MS = 45000;
export const BOOT_SESSION_READY_DEDUPE_MS = 160;
export const BOOT_UI_REPAIR_THROTTLE_MS = 140;
export const BOOT_UI_SYNC_THROTTLE_MS = 100;
export const BOOT_EVENT_DEDUPE_MS = 80;
export const BOOT_ROUTE_SYNC_DEDUPE_MS = 40;
export const BOOT_LANG_RERENDER_DEDUPE_MS = 250;

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

    eventDedupeMs:
      BOOT_EVENT_DEDUPE_MS,

    routeSyncDedupeMs:
      BOOT_ROUTE_SYNC_DEDUPE_MS,

    langRerenderDedupeMs:
      BOOT_LANG_RERENDER_DEDUPE_MS,

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

    IDLE:
      "idle",

    PREPARING:
      "preparing",

    BOOTING:
      "booting",

    SERVICES:
      "services",

    STORE:
      "store",

    I18N:
      "i18n",

    UI:
      "ui",

    RESTORING:
      "restoring",

    RENDERING:
      "rendering",

    BINDING:
      "binding",

    FINALIZING:
      "finalizing",

    READY:
      "ready",

    ERROR:
      "error",

    FATAL:
      "fatal",

    REBOOTING:
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

    appBooting:
      "appBooting",

    appFatal:
      "appFatal",

    fatal:
      "fatal",

    loading:
      "loading",

    restoring:
      "restoring",

    authRestoring:
      "authRestoring",

    sessionRestoring:
      "sessionRestoring",

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

    i18nInitialized:
      "i18nInitialized",

    readyEmitted:
      "readyEmitted",

    handlersBound:
      "handlersBound",

    appEventsBound:
      "appEventsBound",

    uiRepairEventsBound:
      "uiRepairEventsBound",

    runtimeModulesExposed:
      "runtimeModulesExposed",

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

    activationInitialUrl:
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
      "__ONION_APP_LOADER__",

    shell:
      "__ONION_APP_SHELL__",

    warmup:
      "__ONION_WARMUP__",

    errors:
      "__ONION_APP_ERRORS__",

    appEvents:
      "__ONION_APP_EVENTS__",

    bootState:
      "__ONION_BOOT_STATE__",

    appUi:
      "__ONION_APP_UI__",

    themeApi:
      "__ONION_THEME__",

    setTheme:
      "__ONION_SET_THEME__",

    getTheme:
      "__ONION_GET_THEME__",

    clearTheme:
      "__ONION_CLEAR_THEME__",

    reapplyTheme:
      "__ONION_REAPPLY_THEME__",
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

    bootResetPasswordConfirmInitialUrl:
      "bootResetPasswordConfirmInitialUrl",

    bootResetConfirmInitialPath:
      "bootResetConfirmInitialPath",

    bootResetPasswordConfirmInitialPath:
      "bootResetPasswordConfirmInitialPath",

    bootResetConfirmInitialPublicPath:
      "bootResetConfirmInitialPublicPath",

    bootResetPasswordConfirmInitialPublicPath:
      "bootResetPasswordConfirmInitialPublicPath",

    bootIsResetConfirm:
      "bootIsResetConfirm",

    bootHasResetToken:
      "bootHasResetToken",

    route:
      "route",

    canonicalPath:
      "canonicalPath",

    publicPath:
      "publicPath",

    authenticated:
      "authenticated",

    user:
      "user",

    role:
      "role",

    rol:
      "rol",

    lang:
      "lang",

    language:
      "language",

    locale:
      "locale",

    theme:
      "theme",

    mode:
      "mode",

    appearance:
      "appearance",
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

    signIn:
      "/sign-in",

    register:
      "/register",

    signup:
      "/signup",

    signUp:
      "/sign-up",

    forbidden:
      "/403",

    notFound:
      "/404",

    activate:
      "/activate",

    activation:
      "/activation",

    activateAccount:
      "/activate-account",

    accountActivate:
      "/account/activate",

    activateFirstUser:
      "/activate/first-user",

    resetPassword:
      "/reset-password",

    resetPasswordRequest:
      "/reset-password/request",

    resetPasswordConfirm:
      "/reset-password/confirm",

    resetPasswordConfirmLegacy:
      "/reset-password-confirm",

    forgotPassword:
      "/forgot-password",

    recoverPassword:
      "/recover-password",

    passwordReset:
      "/password-reset",

    passwordResetRequest:
      "/password-reset/request",

    passwordResetConfirm:
      "/password-reset/confirm",

    passwordResetConfirmLegacy:
      "/password-reset-confirm",

    twoFALogin:
      "/2fa/login",

    mfaLogin:
      "/mfa/login",

    otpLogin:
      "/otp/login",
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
    APP_ROUTES.signIn,
    APP_ROUTES.register,
    APP_ROUTES.signup,
    APP_ROUTES.signUp,

    APP_ROUTES.forgotPassword,
    APP_ROUTES.recoverPassword,

    APP_ROUTES.passwordReset,
    APP_ROUTES.passwordResetRequest,
    APP_ROUTES.passwordResetConfirm,
    APP_ROUTES.passwordResetConfirmLegacy,

    APP_ROUTES.resetPassword,
    APP_ROUTES.resetPasswordRequest,
    APP_ROUTES.resetPasswordConfirm,
    APP_ROUTES.resetPasswordConfirmLegacy,

    APP_ROUTES.activate,
    APP_ROUTES.activation,
    APP_ROUTES.activateAccount,
    APP_ROUTES.accountActivate,
    APP_ROUTES.activateFirstUser,

    APP_ROUTES.twoFALogin,
    APP_ROUTES.mfaLogin,
    APP_ROUTES.otpLogin,
  ]);

export const PUBLIC_TECHNICAL_ROUTES =
  freeze([
    APP_ROUTES.activate,
    APP_ROUTES.activation,
    APP_ROUTES.activateAccount,
    APP_ROUTES.accountActivate,
    APP_ROUTES.activateFirstUser,

    APP_ROUTES.resetPassword,
    APP_ROUTES.resetPasswordRequest,
    APP_ROUTES.resetPasswordConfirm,
    APP_ROUTES.resetPasswordConfirmLegacy,

    APP_ROUTES.forgotPassword,
    APP_ROUTES.recoverPassword,

    APP_ROUTES.passwordReset,
    APP_ROUTES.passwordResetRequest,
    APP_ROUTES.passwordResetConfirm,
    APP_ROUTES.passwordResetConfirmLegacy,
  ]);

export const PUBLIC_TECHNICAL_PREFIXES =
  freeze([
    `${APP_ROUTES.activate}/`,
    `${APP_ROUTES.activation}/`,
    `${APP_ROUTES.activateAccount}/`,
    `${APP_ROUTES.accountActivate}/`,
    `${APP_ROUTES.activateFirstUser}/`,

    `${APP_ROUTES.resetPasswordConfirm}/`,
    `${APP_ROUTES.resetPasswordConfirmLegacy}/`,
    `${APP_ROUTES.passwordResetConfirm}/`,
    `${APP_ROUTES.passwordResetConfirmLegacy}/`,
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
    "authorization",
    "jwt",
    "session",
    "sid",
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

      aliases:
        freeze([
          APP_ROUTES.activate,
          APP_ROUTES.activation,
          APP_ROUTES.accountActivate,
          APP_ROUTES.activateFirstUser,
        ]),

      windowKey:
        APP_RUNTIME_KEYS.activateAccountInitialUrl,

      windowKeys:
        freeze([
          APP_RUNTIME_KEYS.activateAccountInitialUrl,
          APP_RUNTIME_KEYS.activationInitialUrl,
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

      aliases:
        freeze([
          APP_ROUTES.resetPasswordConfirmLegacy,
          APP_ROUTES.passwordResetConfirm,
          APP_ROUTES.passwordResetConfirmLegacy,
        ]),

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
          "scrubbedResetPasswordToken",
        ]),

      scrubbedHistoryKeys:
        freeze([
          "scrubbedResetToken",
          "resetTokenScrubbed",
          "scrubbedResetConfirmToken",
          "scrubbedPasswordResetToken",
          "scrubbedResetPasswordToken",
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

    bootFatal:
      "app:boot:fatal",

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

    sessionRestoreStart:
      "app:session:restore:start",

    sessionRestoreDone:
      "app:session:restore:done",

    sessionRestoreError:
      "app:session:restore:error",

    authNavigation:
      "app:auth:navigation",

    ghostAuthBlocked:
      "app:auth:ghost-blocked",

    shellState:
      "app:shell:state",

    shellReady:
      "app:shell:ready",

    shellBusy:
      "app:shell:busy",

    shellPostRender:
      "app:shell:post-render",

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

    initialRenderStart:
      "app:router:initial-render:start",

    initialRenderDone:
      "app:router:initial-render:done",

    initialRenderError:
      "app:router:initial-render:error",
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

    twoFARequired:
      "auth:2fa:required",

    mfaRequired:
      "auth:mfa:required",
  });

export const STORE_EVENTS =
  freeze({
    bootState:
      "store:boot:state",

    bootStart:
      "store:boot:start",

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
    appName:
      "Onion Support",

    defaultTheme:
      "dark",

    fallbackTheme:
      "dark",

    defaultThemeMode:
      "system",

    themeStorageKey:
      "theme",

    fallbackLang:
      "es",

    defaultLang:
      "es",

    langStorageKey:
      "lang",

    supportedLangs:
      freeze([
        "es",
        "en",
        "ca",
      ]),

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

    loginNoScrollClass:
      "login-no-scroll",

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

    appShell:
      "app-shell",

    main:
      "main-content",

    mainContent:
      "main-content",

    appContent:
      "app-content",

    loader:
      "app-loader",

    appLoader:
      "app-loader",

    view:
      "view-container",

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

    tableHead:
      "table-head",

    tableheadContainer:
      "tablehead-container",

    tableHeadContainer:
      "tablehead-container",

    mobileSidebarToggle:
      "toggleSidebarMobile",
  });

export const APP_SELECTORS =
  freeze({
    app:
      "#app",

    root:
      "#app-root",

    shell:
      "#app-shell",

    appShell:
      "#app-shell",

    main:
      "#main-content",

    mainContent:
      "#main-content",

    appContent:
      "#app-content",

    loader:
      "#app-loader",

    appLoader:
      "[data-app-loader='true']",

    view:
      "#view-container",

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

    tableHead:
      "#table-head",

    tableheadContainer:
      "#tablehead-container",

    tableHeadContainer:
      "#tablehead-container",

    mobileSidebarToggle:
      "#toggleSidebarMobile",

    appShellData:
      "[data-app-shell='true']",

    mainData:
      "[data-main-content='true']",

    viewRoot:
      "[data-view-root='true']",

    routerView:
      "[data-router-view='true']",

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

    warmup:
      "Warmup",

    errors:
      "Errors",

    bootState:
      "BootState",

    appEvents:
      "AppEvents",

    appUi:
      "UI",
  });

/* =========================================================
   UI LIFECYCLE / REPAIR
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
    "syncBreadcrumb",
    "updateBreadcrumb",
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
    normalizeRouteLikePath(path);

  if (!cleanPath) {
    return null;
  }

  const config =
    PROTECTED_PUBLIC_TOKEN_ROUTES.find((item) => {
      const paths = [
        item.path,
        ...cloneArray(item.aliases),
      ];

      return paths.some((candidatePath) => {
        return (
          cleanPath === candidatePath ||
          cleanPath.startsWith(`${candidatePath}/`)
        );
      });
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
  return PROTECTED_PUBLIC_TOKEN_ROUTES.flatMap((config) =>
    [
      config.path,
      ...cloneArray(config.aliases),
    ]
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
    normalizeRouteLikePath(path);

  if (
    PUBLIC_TECHNICAL_ROUTES.includes(cleanPath)
  ) {
    return true;
  }

  return PUBLIC_TECHNICAL_PREFIXES.some((prefix) =>
    cleanPath.startsWith(prefix)
  );
}

export function isAuthLikeRoute(path = "") {
  const cleanPath =
    normalizeRouteLikePath(path);

  if (
    AUTH_LIKE_ROUTES.includes(cleanPath)
  ) {
    return true;
  }

  return PUBLIC_TECHNICAL_PREFIXES.some((prefix) =>
    cleanPath.startsWith(prefix)
  );
}

export function isProtectedPublicTokenRoute(path = "") {
  const cleanPath =
    normalizeRouteLikePath(path);

  return PROTECTED_PUBLIC_TOKEN_ROUTES.some((config) => {
    const paths = [
      config.path,
      ...cloneArray(config.aliases),
    ];

    return paths.some((candidatePath) => {
      return (
        cleanPath === candidatePath ||
        cleanPath.startsWith(`${candidatePath}/`)
      );
    });
  });
}

export function normalizePublicRoutePath(path = "/") {
  return normalizePublicLikePath(path);
}

export function normalizeCanonicalRoutePath(path = "/") {
  return normalizeCanonicalLikePath(path);
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

export function isSensitiveParamName(name = "") {
  const cleanName =
    safeText(name, "");

  return GENERIC_SENSITIVE_PARAM_NAMES.includes(cleanName);
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
    const paths = [
      config.path,
      ...cloneArray(config.aliases),
    ];

    for (const path of paths) {
      try {
        const escapedPath =
          path.replace(/\//g, "\\/");

        output =
          output.replace(
            new RegExp(`(${escapedPath})\\/([^/?#\\s]+)`, "gi"),
            "$1/***"
          );
      } catch {}
    }
  }

  try {
    output =
      output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /(authorization["'\s:=]+)(Bearer\s+)?([A-Za-z0-9._~+/=-]+)/gi,
        "$1$2***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        "***"
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

      sessionReadyDedupeMs:
        BOOT_SESSION_READY_DEDUPE_MS,

      uiRepairThrottleMs:
        BOOT_UI_REPAIR_THROTTLE_MS,

      uiSyncThrottleMs:
        BOOT_UI_SYNC_THROTTLE_MS,

      eventDedupeMs:
        BOOT_EVENT_DEDUPE_MS,

      routeSyncDedupeMs:
        BOOT_ROUTE_SYNC_DEDUPE_MS,

      langRerenderDedupeMs:
        BOOT_LANG_RERENDER_DEDUPE_MS,

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
  BOOT_EVENT_DEDUPE_MS,
  BOOT_ROUTE_SYNC_DEDUPE_MS,
  BOOT_LANG_RERENDER_DEDUPE_MS,
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
  isAuthLikeRoute,
  isProtectedPublicTokenRoute,
  normalizePublicRoutePath,
  normalizeCanonicalRoutePath,

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
  isSensitiveParamName,
  redactSensitiveText,

  getAppConstantsSnapshot,
});
