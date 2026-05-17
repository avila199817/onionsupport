/* =========================================================
   Onion Support - App Constants
   Archivo: /src/app/constants.js

   Responsabilidad:
   - Constantes mínimas del módulo app.
   - Sólo rutas reales actuales.
   - Sólo token param: token.
   - Sin rutas inventadas.
   - Sin helpers complejos.
   - Sin lógica de boot pesada.
========================================================= */

export const APP_CONSTANTS_VERSION = "simple";

function freeze(value) {
  return Object.freeze(value);
}

function read(source, key, fallback = null) {
  return Object.prototype.hasOwnProperty.call(source, key)
    ? source[key]
    : fallback;
}

function copy(value) {
  return Array.isArray(value) ? [...value] : { ...value };
}

/* =========================================================
   SCOPES
========================================================= */

export const APP_SCOPE = "app";

export const APP_SCOPES = freeze({
  global: "app",
  boot: "app:boot",
  loader: "app:loader",
  shell: "app:shell",
  router: "app:router",
  session: "app:session",
  errors: "app:errors",
  ui: "app:ui",
});

/* =========================================================
   BOOT
========================================================= */

export const BOOT_FAILSAFE_LOADER_MS = 12000;
export const BOOT_MIN_LOADER_VISIBLE_MS = 0;
export const BOOT_HIDE_TRANSITION_MS = 0;
export const BOOT_RENDER_TIMEOUT_MS = 10000;
export const BOOT_RESTORE_TIMEOUT_MS = 10000;
export const BOOT_READY_EVENT_DELAY_MS = 0;
export const BOOT_MAIN_TIMEOUT_MS = 30000;
export const BOOT_SESSION_READY_DEDUPE_MS = 0;
export const BOOT_UI_REPAIR_THROTTLE_MS = 0;
export const BOOT_UI_SYNC_THROTTLE_MS = 0;
export const BOOT_EVENT_DEDUPE_MS = 0;
export const BOOT_ROUTE_SYNC_DEDUPE_MS = 0;
export const BOOT_LANG_RERENDER_DEDUPE_MS = 0;

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
});

export const BOOT_PHASES = freeze({
  idle: "idle",
  booting: "booting",
  ready: "ready",
  fatal: "fatal",
});

export const BOOT_FLAGS = freeze({
  booting: "booting",
  ready: "ready",
  appBooting: "appBooting",
  appReady: "appReady",
  appFatal: "appFatal",
});

/* =========================================================
   RUNTIME / STATE
========================================================= */

export const APP_RUNTIME_KEYS = freeze({
  initialUrl: "__ONION_INITIAL_URL__",
  bootContext: "__ONION_BOOT_CONTEXT__",
  mainBootContext: "__ONION_MAIN_BOOT_CONTEXT__",
  disableAutoBoot: "__ONION_DISABLE_AUTO_BOOT__",
});

export const APP_STATE_KEYS = freeze({
  route: "route",
  canonicalPath: "canonicalPath",
  publicPath: "publicPath",
  authenticated: "authenticated",
  user: "user",
  role: "role",
  theme: "theme",
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
  passwordReset: "/password-reset",
  passwordRequest: "/password-request",
  activateAccount: "/activate-account",
});

export const DEFAULT_ROUTE = APP_ROUTES.home;
export const LOGIN_PATH = APP_ROUTES.login;
export const ACTIVATION_PATH = APP_ROUTES.activateAccount;

/* Compat de nombre antiguo. No declara ruta nueva. */
export const RESET_CONFIRM_PATH = APP_ROUTES.passwordReset;

export const AUTH_LIKE_ROUTES = freeze([
  APP_ROUTES.login,
  APP_ROUTES.passwordReset,
  APP_ROUTES.passwordRequest,
  APP_ROUTES.activateAccount,
]);

export const PUBLIC_TECHNICAL_ROUTES = freeze([
  APP_ROUTES.passwordReset,
  APP_ROUTES.passwordRequest,
  APP_ROUTES.activateAccount,
]);

export const PUBLIC_TECHNICAL_PREFIXES = freeze([]);

/* =========================================================
   TOKENS
========================================================= */

export const TOKEN_PARAM = "token";

export const ACTIVATION_TOKEN_PARAM_NAMES = freeze([TOKEN_PARAM]);
export const RESET_TOKEN_PARAM_NAMES = freeze([TOKEN_PARAM]);
export const TWO_FACTOR_TOKEN_PARAM_NAMES = freeze([]);
export const GENERIC_SENSITIVE_PARAM_NAMES = freeze([TOKEN_PARAM]);

export const PUBLIC_TOKEN_ROUTE_KEYS = freeze({
  activation: "activation",
  passwordReset: "passwordReset",
});

export const PROTECTED_PUBLIC_TOKEN_ROUTES = freeze([
  freeze({
    key: PUBLIC_TOKEN_ROUTE_KEYS.activation,
    path: APP_ROUTES.activateAccount,
    paths: freeze([APP_ROUTES.activateAccount]),
    aliases: freeze([]),
    tokenParamNames: ACTIVATION_TOKEN_PARAM_NAMES,
  }),
  freeze({
    key: PUBLIC_TOKEN_ROUTE_KEYS.passwordReset,
    path: APP_ROUTES.passwordReset,
    paths: freeze([APP_ROUTES.passwordReset]),
    aliases: freeze([]),
    tokenParamNames: RESET_TOKEN_PARAM_NAMES,
  }),
]);

/* =========================================================
   EVENTS
========================================================= */

export const APP_EVENTS = freeze({
  ready: "app:ready",
  bootStart: "app:boot:start",
  bootComplete: "app:boot:complete",
  bootError: "app:boot:error",
  error: "app:error",
});

export const ROUTER_EVENTS = freeze({
  rendered: "router:rendered",
});

export const AUTH_EVENTS = freeze({
  loginSuccess: "auth:login:success",
  logoutSuccess: "auth:logout:success",
  sessionRestored: "auth:session:restored",
  sessionCleared: "auth:session:cleared",
});

export const STORE_EVENTS = freeze({
  change: "store:change",
});

export const DOM_EVENTS = freeze({
  domContentLoaded: "DOMContentLoaded",
  load: "load",
  error: "error",
  unhandledRejection: "unhandledrejection",
});

/* =========================================================
   UI / DOM / MODULES
========================================================= */

export const UI_CONSTANTS = freeze({
  appName: "Onion Support",
  defaultThemeMode: "system",
  defaultLang: "en",
  fallbackLang: "en",
  supportedLangs: freeze(["ca", "es", "en"]),
  defaultRoute: DEFAULT_ROUTE,
  bootingClass: "app-booting",
  loadingClass: "app-loading",
  readyClass: "app-ready",
  fatalClass: "app-fatal",
});

export const APP_DOM_IDS = freeze({
  shell: "app-shell",
  loader: "app-loader",
  main: "main-content",
  mainContent: "main-content",
  appContent: "app-content",
  view: "view-container",
  viewContainer: "view-container",
  sidebarMount: "sidebar-mount",
  topbarMount: "topbar-mount",
  tablehead: "table-head",
  tableHead: "table-head",
  tableheadContainer: "tablehead-container",
  tableHeadContainer: "tablehead-container",
});

export const APP_SELECTORS = freeze({
  shell: "#app-shell",
  loader: "#app-loader",
  main: "#main-content",
  mainContent: "#main-content",
  appContent: "#app-content",
  view: "#view-container",
  viewContainer: "#view-container",
  sidebarMount: "#sidebar-mount",
  topbarMount: "#topbar-mount",
  tablehead: "#table-head",
  tableHead: "#table-head",
  tableheadContainer: "#tablehead-container",
  tableHeadContainer: "#tablehead-container",
});

export const APP_MODULES = freeze({
  core: "AppCore",
  auth: "Auth",
  router: "Router",
  loader: "Loader",
  shell: "Shell",
  errors: "Errors",
});

/* Compat vacía: no usamos reparación UI en app simple. */
export const UI_REPAIR_REASONS = freeze({});
export const UI_LIGHT_USER_METHODS = freeze([]);
export const UI_LIGHT_VISUAL_METHODS = freeze([]);
export const UI_LIGHT_FALLBACK_METHODS = freeze([]);
export const UI_HARD_REPAIR_METHODS = freeze([]);
export const UI_REBIND_METHODS = freeze([]);
export const UI_REPAIR_METHODS = freeze([]);
export const UI_AFTER_PAINT_REPAIR_METHODS = freeze([]);

export const APP_LOG_PREFIX = "[App]";
export const APP_LOG_LEVELS = freeze({
  info: "info",
  warn: "warn",
  error: "error",
});

/* =========================================================
   GETTERS
========================================================= */

export function getAppScope(key = "global") {
  return read(APP_SCOPES, key, APP_SCOPE);
}

export function getAppScopes() {
  return copy(APP_SCOPES);
}

export function getBootFailsafeMs() {
  return BOOT_FAILSAFE_LOADER_MS;
}

export function getBootMinLoaderVisibleMs() {
  return BOOT_MIN_LOADER_VISIBLE_MS;
}

export function getBootHideTransitionMs() {
  return BOOT_HIDE_TRANSITION_MS;
}

export function getBootRenderTimeoutMs() {
  return BOOT_RENDER_TIMEOUT_MS;
}

export function getBootRestoreTimeoutMs() {
  return BOOT_RESTORE_TIMEOUT_MS;
}

export function getBootMainTimeoutMs() {
  return BOOT_MAIN_TIMEOUT_MS;
}

export function getBootConstant(key = "", fallback = null) {
  return read(BOOT_CONSTANTS, key, fallback);
}

export function getBootPhase(key = "", fallback = BOOT_PHASES.idle) {
  return read(BOOT_PHASES, key, fallback);
}

export function getBootFlag(key = "", fallback = "") {
  return read(BOOT_FLAGS, key, fallback);
}

export function getAppEvent(key = "", fallback = "") {
  return read(APP_EVENTS, key, fallback);
}

export function getRouterEvent(key = "", fallback = "") {
  return read(ROUTER_EVENTS, key, fallback);
}

export function getAuthEvent(key = "", fallback = "") {
  return read(AUTH_EVENTS, key, fallback);
}

export function getStoreEvent(key = "", fallback = "") {
  return read(STORE_EVENTS, key, fallback);
}

export function getDomEvent(key = "", fallback = "") {
  return read(DOM_EVENTS, key, fallback);
}

export function getUiConstant(key = "", fallback = null) {
  return read(UI_CONSTANTS, key, fallback);
}

export function getDomId(key = "", fallback = "") {
  return read(APP_DOM_IDS, key, fallback);
}

export function getSelector(key = "", fallback = "") {
  return read(APP_SELECTORS, key, fallback);
}

export function getRuntimeKey(key = "", fallback = "") {
  return read(APP_RUNTIME_KEYS, key, fallback);
}

export function getAppStateKey(key = "", fallback = "") {
  return read(APP_STATE_KEYS, key, fallback);
}

export function getAppRoute(key = "", fallback = DEFAULT_ROUTE) {
  return read(APP_ROUTES, key, fallback);
}

export function getAppModuleName(key = "", fallback = "") {
  return read(APP_MODULES, key, fallback);
}

export function getUiRepairReason(key = "", fallback = "") {
  return read(UI_REPAIR_REASONS, key, fallback);
}

/* =========================================================
   ROUTE HELPERS
========================================================= */

function cleanPath(value = DEFAULT_ROUTE) {
  let path = String(value || DEFAULT_ROUTE).split("?")[0].split("#")[0];

  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/g, "");

  return path || DEFAULT_ROUTE;
}

function matches(path = "", route = "") {
  const current = cleanPath(path);
  const target = cleanPath(route);

  return current === target || current.startsWith(`${target}/`);
}

export function normalizePublicRoutePath(path = DEFAULT_ROUTE) {
  return String(path || DEFAULT_ROUTE);
}

export function normalizeCanonicalRoutePath(path = DEFAULT_ROUTE) {
  return cleanPath(path);
}

export function isPublicTechnicalRoute(path = "") {
  return PUBLIC_TECHNICAL_ROUTES.some((route) => matches(path, route));
}

export function isAuthLikeRoute(path = "") {
  return AUTH_LIKE_ROUTES.some((route) => matches(path, route));
}

export function isProtectedPublicTokenRoute(path = "") {
  return Boolean(getPublicTokenRouteConfigByPath(path));
}

export function getPublicTokenRouteConfigRaw(key = "") {
  return PROTECTED_PUBLIC_TOKEN_ROUTES.find((item) => item.key === key) || null;
}

export function getPublicTokenRouteConfig(key = "") {
  const config = getPublicTokenRouteConfigRaw(key);
  return config ? { ...config, paths: [...config.paths], aliases: [...config.aliases] } : null;
}

export function getPublicTokenRouteConfigByPath(path = "") {
  const current = cleanPath(path);

  const config =
    PROTECTED_PUBLIC_TOKEN_ROUTES.find((item) => {
      return item.paths.some((route) => current === route);
    }) || null;

  return config ? { ...config, paths: [...config.paths], aliases: [...config.aliases] } : null;
}

export function getPublicTokenRouteConfigs() {
  return PROTECTED_PUBLIC_TOKEN_ROUTES.map((item) => getPublicTokenRouteConfig(item.key));
}

export function getPublicTokenRoutePaths() {
  return PROTECTED_PUBLIC_TOKEN_ROUTES.flatMap((item) => item.paths);
}

export function getPublicTokenRouteKeys() {
  return PROTECTED_PUBLIC_TOKEN_ROUTES.map((item) => item.key);
}

export function getPublicTechnicalRoutes() {
  return [...PUBLIC_TECHNICAL_ROUTES];
}

export function getPublicTechnicalPrefixes() {
  return [...PUBLIC_TECHNICAL_PREFIXES];
}

export function isKnownPublicTokenRouteKey(key = "") {
  return Boolean(getPublicTokenRouteConfigRaw(key));
}

/* =========================================================
   UI COMPAT
========================================================= */

export function getUiRepairMethods() {
  return [];
}

export function getUiLightUserMethods() {
  return [];
}

export function getUiLightVisualMethods() {
  return [];
}

export function getUiLightFallbackMethods() {
  return [];
}

export function getUiHardRepairMethods() {
  return [];
}

export function getUiRebindMethods() {
  return [];
}

export function getUiAfterPaintRepairMethods() {
  return [];
}

/* =========================================================
   SENSITIVE
========================================================= */

export function clampBootTimeoutMs(value, fallback = BOOT_MAIN_TIMEOUT_MS) {
  const ms = Number(value);

  if (!Number.isFinite(ms) || ms <= 0) return fallback;

  return Math.max(1000, Math.min(ms, 120000));
}

export function isSensitiveParamName(name = "") {
  return String(name).toLowerCase() === TOKEN_PARAM;
}

export function getSensitiveParamNames() {
  return [TOKEN_PARAM];
}

export function redactSensitiveText(value = "") {
  return String(value || "").replace(/([?&#]token=)([^&#\s]+)/gi, "$1***");
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getAppConstantsSnapshot() {
  return {
    version: APP_CONSTANTS_VERSION,
    routes: APP_ROUTES,
    authLikeRoutes: AUTH_LIKE_ROUTES,
    publicTechnicalRoutes: PUBLIC_TECHNICAL_ROUTES,
    tokenParam: TOKEN_PARAM,
    domIds: APP_DOM_IDS,
  };
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

  TOKEN_PARAM,
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
