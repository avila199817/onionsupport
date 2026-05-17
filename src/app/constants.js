/* =========================================================
   Onion SPA - App Constants
   Archivo: src/app/constants.js

   APP CONSTANTS · SIMPLE
   - contrato estático del módulo app
   - scopes/rutas/eventos/ids/boot config
   - rutas técnicas con token preservadas
   - helpers puros de ruta/redacción/compat
   - sin DOM, storage, fetch, Auth, Router, Toast, render ni navegación
========================================================= */

export const APP_CONSTANTS_VERSION = "21.0.0-simple";

/* =========================================================
   PURE HELPERS
========================================================= */

const DEFAULT_ROUTE_VALUE = "/";
const LOCAL_ORIGIN = "http://localhost";
const PUBLIC_USERNAME_RE = /^@[A-Za-z0-9._-]{1,80}$/;
const ABSOLUTE_URL_RE = /^[a-z][a-z\d+.-]*:\/\//i;

function freeze(value) {
  try {
    return Object.freeze(value);
  } catch {
    return value;
  }
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function array(value) {
  if (Array.isArray(value)) return [...value];
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function unique(values = []) {
  return [...new Set(array(values).flat(Infinity).map((item) => safeText(item, "")).filter(Boolean))];
}

function cloneObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function hasOwn(object, key) {
  try {
    return Object.prototype.hasOwnProperty.call(object, key);
  } catch {
    return false;
  }
}

function readConstant(object, key = "", fallback = null) {
  const cleanKey = safeText(key, "");
  return cleanKey && hasOwn(object, cleanKey) ? object[cleanKey] : fallback;
}

/* =========================================================
   PATH HELPERS · PURE
========================================================= */

function normalizePathname(pathname = DEFAULT_ROUTE_VALUE) {
  let value = safeText(pathname, DEFAULT_ROUTE_VALUE)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) value = DEFAULT_ROUTE_VALUE;
  if (!value.startsWith("/")) value = `/${value}`;

  const parts = [];

  for (const part of value.split("/").filter(Boolean)) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }

  value = `/${parts.join("/")}`;
  return value.length > 1 ? value.replace(/\/+$/g, "") || DEFAULT_ROUTE_VALUE : value || DEFAULT_ROUTE_VALUE;
}

function normalizeSearch(search = "") {
  const raw = safeText(search, "");
  if (!raw) return "";
  return raw.startsWith("?") ? raw : `?${raw.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const raw = safeText(hash, "");
  if (!raw) return "";
  return raw.startsWith("#") ? raw : `#${raw.replace(/^#+/, "")}`;
}

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");
  if (!raw) return DEFAULT_ROUTE_VALUE;
  return raw.startsWith("#!") ? normalizeLocalPath(raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE_VALUE) : normalizeLocalPath(raw.replace(/^#\/?/, "/") || DEFAULT_ROUTE_VALUE);
}

function splitPath(path = DEFAULT_ROUTE_VALUE) {
  let raw = safeText(path, DEFAULT_ROUTE_VALUE) || DEFAULT_ROUTE_VALUE;
  if (isHashRouterPath(raw)) raw = normalizeHashRouterPath(raw);

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");
  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || DEFAULT_ROUTE_VALUE;
  }

  const searchIndex = pathname.indexOf("?");
  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || DEFAULT_ROUTE_VALUE;
  }

  return {
    pathname: normalizePathname(pathname),
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
  };
}

function normalizeLocalPath(path = DEFAULT_ROUTE_VALUE) {
  const raw = safeText(path, DEFAULT_ROUTE_VALUE) || DEFAULT_ROUTE_VALUE;

  if (isHashRouterPath(raw)) return normalizeHashRouterPath(raw);

  try {
    if (ABSOLUTE_URL_RE.test(raw)) {
      const url = new URL(raw, LOCAL_ORIGIN);
      if (url.hash && isHashRouterPath(url.hash)) return normalizeHashRouterPath(url.hash);
      return normalizeLocalPath(`${url.pathname || DEFAULT_ROUTE_VALUE}${url.search || ""}${url.hash || ""}`);
    }
  } catch {
    return DEFAULT_ROUTE_VALUE;
  }

  const { pathname, search, hash } = splitPath(raw);
  return `${pathname}${search}${hash}`;
}

function stripSearchAndHash(path = DEFAULT_ROUTE_VALUE) {
  return splitPath(normalizeLocalPath(path)).pathname || DEFAULT_ROUTE_VALUE;
}

function stripPublicUsername(path = DEFAULT_ROUTE_VALUE) {
  const { pathname, search, hash } = splitPath(normalizeLocalPath(path));
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length && PUBLIC_USERNAME_RE.test(segments[0])) {
    const rest = segments.slice(1).join("/");
    return `${rest ? normalizePathname(`/${rest}`) : DEFAULT_ROUTE_VALUE}${search}${hash}`;
  }

  return `${pathname}${search}${hash}`;
}

function normalizePublicRoutePathValue(path = DEFAULT_ROUTE_VALUE) {
  return normalizeLocalPath(path);
}

function normalizeCanonicalRoutePathValue(path = DEFAULT_ROUTE_VALUE) {
  return stripSearchAndHash(stripPublicUsername(path));
}

function pathMatches(path = "", candidate = "") {
  const current = normalizeCanonicalRoutePathValue(path);
  const target = normalizeCanonicalRoutePathValue(candidate);

  if (!target) return false;
  if (target === DEFAULT_ROUTE_VALUE) return current === DEFAULT_ROUTE_VALUE;

  return current === target || current.startsWith(`${target}/`);
}

function cloneRouteConfig(config = null) {
  return config
    ? freeze({
        ...config,
        aliases: array(config.aliases),
        paths: array(config.paths),
        windowKeys: array(config.windowKeys),
        tokenParamNames: array(config.tokenParamNames),
        scrubbedStateKeys: array(config.scrubbedStateKeys),
        scrubbedHistoryKeys: array(config.scrubbedHistoryKeys),
      })
    : null;
}

/* =========================================================
   SCOPES
========================================================= */

export const APP_SCOPE = "app:global";

export const APP_SCOPES = freeze({
  global: APP_SCOPE,
  boot: "app:boot",
  constants: "app:constants",
  events: "app:events",
  errors: "app:errors",
  i18n: "app:i18n",
  loader: "app:loader",
  router: "app:router",
  session: "app:session",
  shell: "app:shell",
  ui: "app:ui",
  sidebar: "app:ui:sidebar",
  topbar: "app:ui:topbar",
  toast: "app:ui:toast",
  warmup: "app:warmup",
});

/* =========================================================
   BOOT
========================================================= */

export const BOOT_FAILSAFE_LOADER_MS = 12000;
export const BOOT_MIN_LOADER_VISIBLE_MS = 300;
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

export const BOOT_CONSTANTS = freeze({
  failsafeLoaderMs: BOOT_FAILSAFE_LOADER_MS,
  minLoaderVisibleMs: BOOT_MIN_LOADER_VISIBLE_MS,
  hideTransitionMs: BOOT_HIDE_TRANSITION_MS,
  renderTimeoutMs: BOOT_RENDER_TIMEOUT_MS,
  restoreTimeoutMs: BOOT_RESTORE_TIMEOUT_MS,
  readyEventDelayMs: BOOT_READY_EVENT_DELAY_MS,
  mainTimeoutMs: BOOT_MAIN_TIMEOUT_MS,
  sessionReadyDedupeMs: BOOT_SESSION_READY_DEDUPE_MS,
  uiRepairThrottleMs: BOOT_UI_REPAIR_THROTTLE_MS,
  uiSyncThrottleMs: BOOT_UI_SYNC_THROTTLE_MS,
  eventDedupeMs: BOOT_EVENT_DEDUPE_MS,
  routeSyncDedupeMs: BOOT_ROUTE_SYNC_DEDUPE_MS,
  langRerenderDedupeMs: BOOT_LANG_RERENDER_DEDUPE_MS,
  maxBootRetries: 1,
});

export const BOOT_PHASES = freeze({
  idle: "idle",
  booting: "booting",
  services: "services",
  store: "store",
  i18n: "i18n",
  ui: "ui",
  restoring: "restoring",
  rendering: "rendering",
  finalizing: "finalizing",
  ready: "ready",
  error: "error",
  fatal: "fatal",
});

export const BOOT_FLAGS = freeze({
  booted: "booted",
  booting: "booting",
  ready: "ready",
  appReady: "appReady",
  appBooting: "appBooting",
  appBooted: "appBooted",
  appFatal: "appFatal",
  loading: "loading",
  restoring: "restoring",
  authRestoring: "authRestoring",
  sessionRestoring: "sessionRestoring",
  servicesReady: "servicesReady",
  storeReady: "storeReady",
  routerReady: "routerReady",
  routerBound: "routerBound",
  uiReady: "uiReady",
  uiInitialized: "uiInitialized",
  i18nInitialized: "i18nInitialized",
  bootNavigationHandled: "bootNavigationHandled",
  initialRouteRendered: "initialRouteRendered",
  loginInProgress: "loginInProgress",
});

/* =========================================================
   RUNTIME / STATE KEYS
========================================================= */

export const APP_RUNTIME_KEYS = freeze({
  initialUrl: "__ONION_INITIAL_URL__",
  bootContext: "__ONION_BOOT_CONTEXT__",
  mainBootContext: "__ONION_MAIN_BOOT_CONTEXT__",
  bootSnapshot: "__ONION_BOOT_SNAPSHOT__",

  activateAccountInitialUrl: "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
  activationInitialUrl: "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
  resetConfirmInitialUrl: "__ONION_RESET_CONFIRM_INITIAL_URL__",
  resetPasswordConfirmInitialUrl: "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",

  coreApi: "__ONION_CORE__",
  appApi: "__ONION_APP__",
  routerApi: "__ONION_ROUTER__",
  loader: "__ONION_APP_LOADER__",
  shell: "__ONION_APP_SHELL__",
  appUi: "__ONION_APP_UI__",
  appEvents: "__ONION_APP_EVENTS__",
  warmup: "__ONION_WARMUP__",
  errors: "__ONION_APP_ERRORS__",

  bootTheme: "__ONION_BOOT_THEME__",
  debug: "__ONION_DEBUG__",
  disableAutoBoot: "__ONION_DISABLE_AUTO_BOOT__",
  allowAutoBoot: "__ONION_ALLOW_APP_AUTO_BOOT__",
});

export const APP_STATE_KEYS = freeze({
  bootInitialUrl: "bootInitialUrl",
  bootInitialPath: "bootInitialPath",
  bootCanonicalPath: "bootCanonicalPath",

  bootProtectedInitialUrl: "bootProtectedInitialUrl",
  bootProtectedInitialPath: "bootProtectedInitialPath",
  bootProtectedInitialPublicPath: "bootProtectedInitialPublicPath",
  bootProtectedRouteKey: "bootProtectedRouteKey",
  bootIsPublicTokenRoute: "bootIsPublicTokenRoute",
  bootHasPublicToken: "bootHasPublicToken",
  bootHasProtectedToken: "bootHasProtectedToken",

  bootActivationInitialUrl: "bootActivationInitialUrl",
  bootActivationInitialPath: "bootActivationInitialPath",
  bootActivationInitialPublicPath: "bootActivationInitialPublicPath",
  bootIsActivation: "bootIsActivation",
  bootHasActivationToken: "bootHasActivationToken",

  bootResetConfirmInitialUrl: "bootResetConfirmInitialUrl",
  bootResetPasswordConfirmInitialUrl: "bootResetPasswordConfirmInitialUrl",
  bootResetConfirmInitialPath: "bootResetConfirmInitialPath",
  bootResetPasswordConfirmInitialPath: "bootResetPasswordConfirmInitialPath",
  bootResetConfirmInitialPublicPath: "bootResetConfirmInitialPublicPath",
  bootResetPasswordConfirmInitialPublicPath: "bootResetPasswordConfirmInitialPublicPath",
  bootIsResetConfirm: "bootIsResetConfirm",
  bootHasResetToken: "bootHasResetToken",

  route: "route",
  canonicalPath: "canonicalPath",
  publicPath: "publicPath",

  authenticated: "authenticated",
  user: "user",
  role: "role",
  rol: "rol",

  theme: "theme",
  mode: "mode",
  appearance: "appearance",
  lang: "lang",
  language: "language",
  locale: "locale",
});

/* =========================================================
   ROUTES
========================================================= */

export const APP_ROUTES = freeze({
  home: "/",
  login: "/login",
  signin: "/signin",
  signIn: "/sign-in",
  auth: "/auth",
  authLogin: "/auth/login",

  forbidden: "/403",
  notFound: "/404",

  activate: "/activate",
  activation: "/activation",
  activateAccount: "/activate-account",
  accountActivate: "/account/activate",
  activateFirstUser: "/activate/first-user",

  resetPassword: "/reset-password",
  resetPasswordConfirm: "/reset-password/confirm",
  resetPasswordConfirmLegacy: "/reset-password-confirm",
  forgotPassword: "/forgot-password",
  recoverPassword: "/recover-password",
  recover: "/recover",
  passwordReset: "/password-reset",
  passwordResetConfirm: "/password-reset/confirm",
  passwordResetConfirmLegacy: "/password-reset-confirm",
  confirmResetPassword: "/confirm-reset-password",

  twoFA: "/2fa",
  mfa: "/mfa",
  otp: "/otp",
});

export const DEFAULT_ROUTE = APP_ROUTES.home;
export const LOGIN_PATH = APP_ROUTES.login;
export const ACTIVATION_PATH = APP_ROUTES.activateAccount;
export const RESET_CONFIRM_PATH = APP_ROUTES.resetPasswordConfirm;

export const AUTH_LIKE_ROUTES = freeze([
  APP_ROUTES.login,
  APP_ROUTES.signin,
  APP_ROUTES.signIn,
  APP_ROUTES.auth,
  APP_ROUTES.authLogin,
  APP_ROUTES.forbidden,
  APP_ROUTES.notFound,
  APP_ROUTES.activate,
  APP_ROUTES.activation,
  APP_ROUTES.activateAccount,
  APP_ROUTES.accountActivate,
  APP_ROUTES.activateFirstUser,
  APP_ROUTES.resetPassword,
  APP_ROUTES.resetPasswordConfirm,
  APP_ROUTES.resetPasswordConfirmLegacy,
  APP_ROUTES.forgotPassword,
  APP_ROUTES.recoverPassword,
  APP_ROUTES.recover,
  APP_ROUTES.passwordReset,
  APP_ROUTES.passwordResetConfirm,
  APP_ROUTES.passwordResetConfirmLegacy,
  APP_ROUTES.confirmResetPassword,
  APP_ROUTES.twoFA,
  APP_ROUTES.mfa,
  APP_ROUTES.otp,
]);

export const PUBLIC_TECHNICAL_ROUTES = freeze([
  APP_ROUTES.activate,
  APP_ROUTES.activation,
  APP_ROUTES.activateAccount,
  APP_ROUTES.accountActivate,
  APP_ROUTES.activateFirstUser,
  APP_ROUTES.resetPassword,
  APP_ROUTES.resetPasswordConfirm,
  APP_ROUTES.resetPasswordConfirmLegacy,
  APP_ROUTES.forgotPassword,
  APP_ROUTES.recoverPassword,
  APP_ROUTES.recover,
  APP_ROUTES.passwordReset,
  APP_ROUTES.passwordResetConfirm,
  APP_ROUTES.passwordResetConfirmLegacy,
  APP_ROUTES.confirmResetPassword,
  APP_ROUTES.twoFA,
  APP_ROUTES.mfa,
  APP_ROUTES.otp,
]);

export const PUBLIC_TECHNICAL_PREFIXES = freeze([
  `${APP_ROUTES.activate}/`,
  `${APP_ROUTES.activation}/`,
  `${APP_ROUTES.activateAccount}/`,
  `${APP_ROUTES.accountActivate}/`,
  `${APP_ROUTES.activateFirstUser}/`,
  `${APP_ROUTES.resetPasswordConfirm}/`,
  `${APP_ROUTES.resetPasswordConfirmLegacy}/`,
  `${APP_ROUTES.passwordResetConfirm}/`,
  `${APP_ROUTES.passwordResetConfirmLegacy}/`,
  `${APP_ROUTES.twoFA}/`,
  `${APP_ROUTES.mfa}/`,
  `${APP_ROUTES.otp}/`,
]);

/* =========================================================
   TOKEN ROUTES / SENSITIVE PARAMS
========================================================= */

export const ACTIVATION_TOKEN_PARAM_NAMES = freeze(["token", "activationToken", "activateToken", "activation_token", "activate_token", "code", "t"]);
export const RESET_TOKEN_PARAM_NAMES = freeze(["token", "resetToken", "passwordResetToken", "reset_token", "password_reset_token", "confirmToken", "confirm_token", "code", "t"]);
export const TWO_FACTOR_TOKEN_PARAM_NAMES = freeze(["tempToken", "temp_token", "temporaryToken", "temporary_token", "twoFactorToken", "two_factor_token", "mfaToken", "mfa_token", "otpToken", "otp_token", "token", "code", "otp", "totp", "t"]);

export const GENERIC_SENSITIVE_PARAM_NAMES = freeze(unique([
  ...ACTIVATION_TOKEN_PARAM_NAMES,
  ...RESET_TOKEN_PARAM_NAMES,
  ...TWO_FACTOR_TOKEN_PARAM_NAMES,
  "access_token",
  "refresh_token",
  "id_token",
  "authorization",
  "auth",
  "jwt",
  "bearer",
  "session",
  "sid",
]));

export const PUBLIC_TOKEN_ROUTE_KEYS = freeze({
  activation: "activation",
  resetConfirm: "resetConfirm",
});

function makeTokenRoute(config) {
  const path = normalizePathname(config.path);
  const aliases = unique(config.aliases || []).map(normalizePathname);
  const paths = unique([path, ...aliases, ...(config.paths || [])]).map(normalizePathname);

  return freeze({
    key: config.key,
    path,
    aliases,
    paths,
    windowKey: config.windowKey || "",
    windowKeys: unique(config.windowKeys || []),
    statePrefix: config.statePrefix || "",
    stateUrlKey: config.stateUrlKey || "",
    statePathKey: config.statePathKey || "",
    statePublicPathKey: config.statePublicPathKey || "",
    stateIsRouteKey: config.stateIsRouteKey || "",
    stateHasTokenKey: config.stateHasTokenKey || "",
    scrubbedStateKeys: unique(config.scrubbedStateKeys || []),
    scrubbedHistoryKeys: unique(config.scrubbedHistoryKeys || []),
    tokenParamNames: unique(config.tokenParamNames || []),
  });
}

export const PROTECTED_PUBLIC_TOKEN_ROUTES = freeze([
  makeTokenRoute({
    key: PUBLIC_TOKEN_ROUTE_KEYS.activation,
    path: ACTIVATION_PATH,
    aliases: [APP_ROUTES.activate, APP_ROUTES.activation, APP_ROUTES.accountActivate, APP_ROUTES.activateFirstUser],
    windowKey: APP_RUNTIME_KEYS.activateAccountInitialUrl,
    windowKeys: [APP_RUNTIME_KEYS.activateAccountInitialUrl, APP_RUNTIME_KEYS.activationInitialUrl],
    statePrefix: "Activation",
    stateUrlKey: APP_STATE_KEYS.bootActivationInitialUrl,
    statePathKey: APP_STATE_KEYS.bootActivationInitialPath,
    statePublicPathKey: APP_STATE_KEYS.bootActivationInitialPublicPath,
    stateIsRouteKey: APP_STATE_KEYS.bootIsActivation,
    stateHasTokenKey: APP_STATE_KEYS.bootHasActivationToken,
    scrubbedStateKeys: ["scrubbedActivationToken", "activationTokenScrubbed", "scrubbedActivateAccountToken"],
    scrubbedHistoryKeys: ["scrubbedActivationToken", "activationTokenScrubbed", "scrubbedActivateAccountToken", "scrubbedPublicTokenRoute", "scrubbedTokenRoute"],
    tokenParamNames: ACTIVATION_TOKEN_PARAM_NAMES,
  }),
  makeTokenRoute({
    key: PUBLIC_TOKEN_ROUTE_KEYS.resetConfirm,
    path: RESET_CONFIRM_PATH,
    aliases: [APP_ROUTES.resetPasswordConfirmLegacy, APP_ROUTES.passwordResetConfirm, APP_ROUTES.passwordResetConfirmLegacy, APP_ROUTES.confirmResetPassword],
    windowKey: APP_RUNTIME_KEYS.resetPasswordConfirmInitialUrl,
    windowKeys: [APP_RUNTIME_KEYS.resetPasswordConfirmInitialUrl, APP_RUNTIME_KEYS.resetConfirmInitialUrl],
    statePrefix: "ResetConfirm",
    stateUrlKey: APP_STATE_KEYS.bootResetConfirmInitialUrl,
    statePathKey: APP_STATE_KEYS.bootResetConfirmInitialPath,
    statePublicPathKey: APP_STATE_KEYS.bootResetConfirmInitialPublicPath,
    stateIsRouteKey: APP_STATE_KEYS.bootIsResetConfirm,
    stateHasTokenKey: APP_STATE_KEYS.bootHasResetToken,
    scrubbedStateKeys: ["scrubbedResetToken", "resetTokenScrubbed", "scrubbedResetConfirmToken", "scrubbedPasswordResetToken", "scrubbedResetPasswordToken"],
    scrubbedHistoryKeys: ["scrubbedResetToken", "resetTokenScrubbed", "scrubbedResetConfirmToken", "scrubbedPasswordResetToken", "scrubbedResetPasswordToken", "scrubbedPublicTokenRoute", "scrubbedTokenRoute"],
    tokenParamNames: RESET_TOKEN_PARAM_NAMES,
  }),
]);

/* =========================================================
   EVENTS
========================================================= */

export const APP_EVENTS = freeze({
  ready: "app:ready",
  destroy: "app:destroy",
  reboot: "app:reboot",

  bootStart: "app:boot:start",
  bootComplete: "app:boot:complete",
  bootReady: "app:boot:ready",
  bootError: "app:boot:error",
  bootFatal: "app:boot:fatal",

  bootLoaderShow: "app:boot:loader:show",
  bootLoaderHide: "app:boot:loader:hide",
  bootLoaderForceHide: "app:boot:loader:force-hide",

  routeChange: "app:route:change",
  routeSynced: "app:events:route-synced",
  publicPathChange: "app:public-path:change",

  userChange: "app:user:change",
  langChange: "app:lang:change",
  themeChange: "app:theme:change",

  sessionRestored: "app:session:restored",
  sessionCleared: "app:session:cleared",
  sessionRestoreStart: "app:session:restore:start",
  sessionRestoreDone: "app:session:restore:done",
  sessionRestoreError: "app:session:restore:error",

  uiReady: "app:ui:ready",
  uiRepair: "app:ui:repair",
  uiRepairRequest: "app:ui:repair-request",
  userUiSync: "app:user-ui:sync",

  shellState: "app:shell:state",
  shellReady: "app:shell:ready",
  shellBusy: "app:shell:busy",
  shellPostRender: "app:shell:post-render",

  error: "app:error",
  errorTelemetry: "app:error:telemetry",
});

export const ROUTER_EVENTS = freeze({
  beforeRender: "router:before-render",
  rendered: "router:rendered",
  asyncComplete: "router:render:async-complete",
  shellState: "router:shell:state",
  shellChange: "router:shell:change",
  navigationHandled: "router:navigation:handled",
  navigationError: "router:navigation:error",
  routeChange: "router:route:change",
  notFound: "router:not-found",
  forbidden: "router:forbidden",
  initialRenderStart: "app:router:initial-render:start",
  initialRenderDone: "app:router:initial-render:done",
  initialRenderError: "app:router:initial-render:error",
});

export const AUTH_EVENTS = freeze({
  loginSuccess: "auth:login:success",
  logout: "auth:logout",
  logoutSuccess: "auth:logout:success",
  sessionRestored: "auth:session:restored",
  sessionCleared: "auth:session:cleared",
  userChange: "auth:user:change",
  tokenRefreshed: "auth:token:refreshed",
  restoreError: "auth:restore:error",
  twoFARequired: "auth:2fa:required",
  mfaRequired: "auth:mfa:required",
});

export const STORE_EVENTS = freeze({
  change: "store:change",
  ready: "store:ready",
  error: "store:error",
});

export const DOM_EVENTS = freeze({
  domContentLoaded: "DOMContentLoaded",
  load: "load",
  error: "error",
  unhandledRejection: "unhandledrejection",
  popstate: "popstate",
  hashchange: "hashchange",
  visibilityChange: "visibilitychange",
  storage: "storage",
  online: "online",
  offline: "offline",
});

/* =========================================================
   UI / DOM / MODULES
========================================================= */

export const UI_CONSTANTS = freeze({
  appName: "Onion Support",
  defaultTheme: "dark",
  fallbackTheme: "dark",
  defaultThemeMode: "system",
  themeStorageKey: "theme",
  defaultLang: "es",
  fallbackLang: "es",
  langStorageKey: "lang",
  supportedLangs: ["es", "en", "ca"],
  defaultRoute: DEFAULT_ROUTE,
  defaultPublicPath: DEFAULT_ROUTE,
  bootingClass: "app-booting",
  loadingClass: "app-loading",
  readyClass: "app-ready",
  fatalClass: "app-fatal",
  errorClass: "app-error",
  authScreenClass: "auth-screen",
  routeAuthClass: "route-auth",
  routeAppClass: "route-app",
  chromeHiddenClass: "route-chrome-hidden",
  chromeVisibleClass: "route-chrome-visible",
});

export const APP_DOM_IDS = freeze({
  app: "app",
  root: "app-root",
  shell: "app-shell",
  appShell: "app-shell",
  loader: "app-loader",
  appLoader: "app-loader",
  main: "main-content",
  mainContent: "main-content",
  appContent: "app-content",
  view: "view-container",
  viewContainer: "view-container",
  sidebar: "app-sidebar",
  sidebarMount: "sidebar-mount",
  topbar: "app-topbar",
  topbarMount: "topbar-mount",
  tablehead: "table-head",
  tableHead: "table-head",
  tableheadContainer: "tablehead-container",
  tableHeadContainer: "tablehead-container",
  mobileSidebarToggle: "toggleSidebarMobile",
});

export const APP_SELECTORS = freeze({
  app: "#app",
  root: "#app-root",
  shell: "#app-shell",
  appShell: "#app-shell, [data-app-shell='true'], [data-app-shell]",
  loader: "#app-loader",
  appLoader: "#app-loader, [data-app-loader='true'], [data-app-loader]",
  main: "#main-content",
  mainContent: "#main-content, [data-main-content='true'], [data-main-content], main",
  appContent: "#app-content, [data-app-content='true'], [data-app-content]",
  view: "#view-container",
  viewContainer: "#view-container, [data-view-root='true'], [data-router-view='true'], [data-router-view]",
  sidebar: "#app-sidebar, #sidebar, [data-sidebar-root], .sidebar",
  sidebarMount: "#sidebar-mount, [data-sidebar-mount]",
  topbar: "#app-topbar, #topbar, [data-topbar='root'], [data-topbar-root], .topbar",
  topbarMount: "#topbar-mount, [data-topbar-mount]",
  tablehead: "#table-head, [data-tablehead], .table-head",
  tableHead: "#table-head, [data-tablehead], .table-head",
  tableheadContainer: "#tablehead-container, [data-tablehead-container]",
  tableHeadContainer: "#tablehead-container, [data-tablehead-container]",
  mobileSidebarToggle: "#toggleSidebarMobile, [data-sidebar-mobile-toggle]",
  spaLink: "a[data-spa]",
});

export const APP_MODULES = freeze({
  core: "AppCore",
  store: "Store",
  auth: "Auth",
  router: "Router",
  http: "Http",
  sidebar: "SidebarUI",
  topbar: "TopbarUI",
  toast: "Toast",
  i18n: "I18n",
  loader: "Loader",
  shell: "Shell",
  warmup: "Warmup",
  errors: "Errors",
  appEvents: "AppEvents",
  appUi: "UI",
});

/* =========================================================
   UI REPAIR COMPAT
========================================================= */

export const UI_REPAIR_REASONS = freeze({
  init: "init-ui",
  restore: "restore-session",
  renderInitial: "render-initial-route",
  finalize: "finalize-boot",
  bootError: "boot-error",
  routeChange: "app:route:change",
  routerRendered: "router:rendered",
  langChange: "app:lang:change",
  themeChange: "app:theme:change",
});

export const UI_LIGHT_USER_METHODS = freeze(["renderUser", "refreshUser", "updateUser", "syncUser"]);
export const UI_LIGHT_VISUAL_METHODS = freeze(["applyRoleVisibility", "syncRouteAndIndicator", "syncIndicator", "updateToggleLabel", "syncRoute", "updateRoute", "syncBreadcrumb", "updateBreadcrumb"]);
export const UI_LIGHT_FALLBACK_METHODS = freeze(["refresh", "sync"]);
export const UI_HARD_REPAIR_METHODS = freeze(["repair", "refresh", "sync"]);
export const UI_REBIND_METHODS = freeze(["rebind", "rebindEvents", "bindEvents", "bind"]);
export const UI_REPAIR_METHODS = freeze([...UI_LIGHT_USER_METHODS, ...UI_LIGHT_VISUAL_METHODS, ...UI_LIGHT_FALLBACK_METHODS]);
export const UI_AFTER_PAINT_REPAIR_METHODS = freeze(["sync", "syncUser", "refreshUser", "updateUser", "syncRouteAndIndicator", "syncIndicator"]);

/* =========================================================
   LOGGING
========================================================= */

export const APP_LOG_PREFIX = "[App]";
export const APP_LOG_LEVELS = freeze({ debug: "debug", info: "info", warn: "warn", error: "error", fatal: "fatal" });

/* =========================================================
   GETTERS
========================================================= */

export function getAppScope(key = "global") { return readConstant(APP_SCOPES, key, APP_SCOPE); }
export function getAppScopes() { return cloneObject(APP_SCOPES); }
export function getBootFailsafeMs() { return BOOT_CONSTANTS.failsafeLoaderMs; }
export function getBootMinLoaderVisibleMs() { return BOOT_CONSTANTS.minLoaderVisibleMs; }
export function getBootHideTransitionMs() { return BOOT_CONSTANTS.hideTransitionMs; }
export function getBootRenderTimeoutMs() { return BOOT_CONSTANTS.renderTimeoutMs; }
export function getBootRestoreTimeoutMs() { return BOOT_CONSTANTS.restoreTimeoutMs; }
export function getBootMainTimeoutMs() { return BOOT_CONSTANTS.mainTimeoutMs; }
export function getBootConstant(key = "", fallback = null) { return readConstant(BOOT_CONSTANTS, key, fallback); }
export function getBootPhase(key = "", fallback = BOOT_PHASES.idle) { return readConstant(BOOT_PHASES, key, fallback); }
export function getBootFlag(key = "", fallback = "") { return readConstant(BOOT_FLAGS, key, fallback); }
export function getAppEvent(key = "", fallback = "") { return readConstant(APP_EVENTS, key, fallback); }
export function getRouterEvent(key = "", fallback = "") { return readConstant(ROUTER_EVENTS, key, fallback); }
export function getAuthEvent(key = "", fallback = "") { return readConstant(AUTH_EVENTS, key, fallback); }
export function getStoreEvent(key = "", fallback = "") { return readConstant(STORE_EVENTS, key, fallback); }
export function getDomEvent(key = "", fallback = "") { return readConstant(DOM_EVENTS, key, fallback); }
export function getUiConstant(key = "", fallback = null) { return readConstant(UI_CONSTANTS, key, fallback); }
export function getDomId(key = "", fallback = "") { return readConstant(APP_DOM_IDS, key, fallback); }
export function getSelector(key = "", fallback = "") { return readConstant(APP_SELECTORS, key, fallback); }
export function getRuntimeKey(key = "", fallback = "") { return readConstant(APP_RUNTIME_KEYS, key, fallback); }
export function getAppStateKey(key = "", fallback = "") { return readConstant(APP_STATE_KEYS, key, fallback); }
export function getAppRoute(key = "", fallback = DEFAULT_ROUTE) { return readConstant(APP_ROUTES, key, fallback); }
export function getAppModuleName(key = "", fallback = "") { return readConstant(APP_MODULES, key, fallback); }
export function getUiRepairReason(key = "", fallback = "unknown") { return readConstant(UI_REPAIR_REASONS, key, fallback); }

/* =========================================================
   ROUTE HELPERS
========================================================= */

export function getPublicTokenRouteConfigRaw(key = "") {
  const cleanKey = safeText(key, "");
  return PROTECTED_PUBLIC_TOKEN_ROUTES.find((item) => item.key === cleanKey) || null;
}

export function getPublicTokenRouteConfig(key = "") {
  return cloneRouteConfig(getPublicTokenRouteConfigRaw(key));
}

export function getPublicTokenRouteConfigByPath(path = "") {
  const cleanPath = normalizeCanonicalRoutePathValue(path);
  const config = PROTECTED_PUBLIC_TOKEN_ROUTES.find((item) => unique([item.path, ...(item.paths || []), ...(item.aliases || [])]).some((candidate) => pathMatches(cleanPath, candidate))) || null;
  return cloneRouteConfig(config);
}

export function getPublicTokenRouteConfigs() { return PROTECTED_PUBLIC_TOKEN_ROUTES.map((item) => cloneRouteConfig(item)); }
export function getPublicTokenRoutePaths() { return unique(PROTECTED_PUBLIC_TOKEN_ROUTES.flatMap((item) => [item.path, ...(item.paths || []), ...(item.aliases || [])])); }
export function getPublicTokenRouteKeys() { return PROTECTED_PUBLIC_TOKEN_ROUTES.map((item) => item.key); }
export function getPublicTechnicalRoutes() { return array(PUBLIC_TECHNICAL_ROUTES); }
export function getPublicTechnicalPrefixes() { return array(PUBLIC_TECHNICAL_PREFIXES); }
export function isKnownPublicTokenRouteKey(key = "") { return Boolean(getPublicTokenRouteConfigRaw(key)); }
export function isPublicTechnicalRoute(path = "") { return PUBLIC_TECHNICAL_ROUTES.some((route) => pathMatches(path, route)) || PUBLIC_TECHNICAL_PREFIXES.some((prefix) => normalizeCanonicalRoutePathValue(path).startsWith(prefix.replace(/\/+$/g, ""))); }
export function isAuthLikeRoute(path = "") { return AUTH_LIKE_ROUTES.some((route) => pathMatches(path, route)) || PUBLIC_TECHNICAL_PREFIXES.some((prefix) => normalizeCanonicalRoutePathValue(path).startsWith(prefix.replace(/\/+$/g, ""))); }
export function isProtectedPublicTokenRoute(path = "") { return Boolean(getPublicTokenRouteConfigByPath(path)); }
export function normalizePublicRoutePath(path = DEFAULT_ROUTE) { return normalizePublicRoutePathValue(path); }
export function normalizeCanonicalRoutePath(path = DEFAULT_ROUTE) { return normalizeCanonicalRoutePathValue(path); }

/* =========================================================
   REPAIR / SENSITIVE HELPERS
========================================================= */

export function getUiRepairMethods() { return array(UI_REPAIR_METHODS); }
export function getUiLightUserMethods() { return array(UI_LIGHT_USER_METHODS); }
export function getUiLightVisualMethods() { return array(UI_LIGHT_VISUAL_METHODS); }
export function getUiLightFallbackMethods() { return array(UI_LIGHT_FALLBACK_METHODS); }
export function getUiHardRepairMethods() { return array(UI_HARD_REPAIR_METHODS); }
export function getUiRebindMethods() { return array(UI_REBIND_METHODS); }
export function getUiAfterPaintRepairMethods() { return array(UI_AFTER_PAINT_REPAIR_METHODS); }

export function clampBootTimeoutMs(value, fallback = BOOT_MAIN_TIMEOUT_MS) {
  const ms = safeNumber(value, fallback);
  return Math.max(1000, Math.min(ms > 0 ? ms : fallback, 120000));
}

export function isSensitiveParamName(name = "") {
  const clean = safeText(name, "").toLowerCase();
  return GENERIC_SENSITIVE_PARAM_NAMES.some((item) => item.toLowerCase() === clean);
}

export function getSensitiveParamNames() {
  return array(GENERIC_SENSITIVE_PARAM_NAMES);
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactSensitiveText(value = "") {
  let output = safeText(value, "");
  if (!output) return "";

  for (const name of GENERIC_SENSITIVE_PARAM_NAMES) {
    try {
      output = output.replace(new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"), "$1***");
    } catch {}
  }

  for (const route of PROTECTED_PUBLIC_TOKEN_ROUTES) {
    const paths = unique([route.path, ...(route.paths || []), ...(route.aliases || [])]);

    for (const path of paths) {
      try {
        output = output.replace(new RegExp(`(${escapeRegExp(path)})\\/([^/?#\\s]+)`, "gi"), "$1/***");
      } catch {}
    }
  }

  try {
    output = output
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/(authorization["'\s:=]+)(Bearer\s+)?([A-Za-z0-9._~+/=-]+)/gi, "$1$2***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  } catch {}

  return output;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getAppConstantsSnapshot() {
  return freeze({
    version: APP_CONSTANTS_VERSION,
    scope: APP_SCOPE,
    scopes: APP_SCOPES,
    boot: { constants: BOOT_CONSTANTS, phases: BOOT_PHASES, flags: BOOT_FLAGS },
    runtimeKeys: APP_RUNTIME_KEYS,
    stateKeys: APP_STATE_KEYS,
    routes: {
      app: APP_ROUTES,
      authLike: AUTH_LIKE_ROUTES,
      publicTechnical: PUBLIC_TECHNICAL_ROUTES,
      publicTechnicalPrefixes: PUBLIC_TECHNICAL_PREFIXES,
    },
    publicTokenRoutes: PROTECTED_PUBLIC_TOKEN_ROUTES,
    sensitiveParams: GENERIC_SENSITIVE_PARAM_NAMES,
    events: { app: APP_EVENTS, router: ROUTER_EVENTS, auth: AUTH_EVENTS, store: STORE_EVENTS, dom: DOM_EVENTS },
    ui: UI_CONSTANTS,
    dom: { ids: APP_DOM_IDS, selectors: APP_SELECTORS },
    modules: APP_MODULES,
    repair: {
      reasons: UI_REPAIR_REASONS,
      methods: UI_REPAIR_METHODS,
      hardRepairMethods: UI_HARD_REPAIR_METHODS,
      rebindMethods: UI_REBIND_METHODS,
      afterPaintMethods: UI_AFTER_PAINT_REPAIR_METHODS,
    },
    log: { prefix: APP_LOG_PREFIX, levels: APP_LOG_LEVELS },
    policy: {
      constantsOnly: true,
      ownDom: false,
      ownStorage: false,
      ownAuth: false,
      ownRouter: false,
      ownFetch: false,
      ownToast: false,
      ownRender: false,
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
  DEFAULT_ROUTE,
  LOGIN_PATH,
  ACTIVATION_PATH,
  RESET_CONFIRM_PATH,

  AUTH_LIKE_ROUTES,
  PUBLIC_TECHNICAL_ROUTES,
  PUBLIC_TECHNICAL_PREFIXES,

  ACTIVATION_TOKEN_PARAM_NAMES,
  RESET_TOKEN_PARAM_NAMES,
  TWO_FACTOR_TOKEN_PARAM_NAMES,
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
  getAppModuleName,
  getUiRepairReason,

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

  getUiRepairMethods,
  getUiLightUserMethods,
  getUiLightVisualMethods,
  getUiLightFallbackMethods,
  getUiHardRepairMethods,
  getUiRebindMethods,
  getUiAfterPaintRepairMethods,

  clampBootTimeoutMs,
  isSensitiveParamName,
  getSensitiveParamNames,
  redactSensitiveText,
  getAppConstantsSnapshot,
});
