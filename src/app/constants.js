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

export const APP_CONSTANTS_VERSION = "app.constants.v2";

/* =========================================================
   BASICS
========================================================= */

function freeze(value) {
  return Object.freeze(value);
}

function read(source = {}, key = "", fallback = null) {
  return Object.prototype.hasOwnProperty.call(source, key)
    ? source[key]
    : fallback;
}

function copyArray(value = []) {
  return Array.isArray(value) ? [...value] : [];
}

function copyObject(value = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...value }
    : {};
}

/* =========================================================
   APP
========================================================= */

export const APP_NAME = "Onion Support";
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
   ROUTES
========================================================= */

export const APP_ROUTES = freeze({
  root: "/",
  login: "/login",
  passwordRequest: "/password-request",
  passwordReset: "/password-reset",
  activateAccount: "/activate-account",
});

export const ROOT_PATH = APP_ROUTES.root;
export const DEFAULT_ROUTE = ROOT_PATH;

export const LOGIN_PATH = APP_ROUTES.login;
export const PASSWORD_REQUEST_PATH = APP_ROUTES.passwordRequest;
export const PASSWORD_RESET_PATH = APP_ROUTES.passwordReset;
export const ACTIVATION_PATH = APP_ROUTES.activateAccount;

/* Compat de nombre antiguo. No declara ruta nueva. */
export const RESET_CONFIRM_PATH = APP_ROUTES.passwordReset;

export const PUBLIC_AUTH_ROUTES = freeze([
  APP_ROUTES.login,
  APP_ROUTES.passwordRequest,
  APP_ROUTES.passwordReset,
  APP_ROUTES.activateAccount,
]);

/* Compat de nombre antiguo. No declara rutas nuevas. */
export const AUTH_LIKE_ROUTES = PUBLIC_AUTH_ROUTES;

export const PUBLIC_TOKEN_ROUTE_KEYS = freeze({
  activation: "activation",
  passwordReset: "passwordReset",
});

/* =========================================================
   TOKENS
========================================================= */

export const TOKEN_PARAM = "token";

export const ACTIVATION_TOKEN_PARAM_NAMES = freeze([TOKEN_PARAM]);
export const RESET_TOKEN_PARAM_NAMES = freeze([TOKEN_PARAM]);
export const GENERIC_SENSITIVE_PARAM_NAMES = freeze([TOKEN_PARAM]);

export const PROTECTED_PUBLIC_TOKEN_ROUTES = freeze([
  freeze({
    key: PUBLIC_TOKEN_ROUTE_KEYS.activation,
    path: APP_ROUTES.activateAccount,
    paths: freeze([APP_ROUTES.activateAccount]),
    tokenParamNames: ACTIVATION_TOKEN_PARAM_NAMES,
  }),
  freeze({
    key: PUBLIC_TOKEN_ROUTE_KEYS.passwordReset,
    path: APP_ROUTES.passwordReset,
    paths: freeze([APP_ROUTES.passwordReset]),
    tokenParamNames: RESET_TOKEN_PARAM_NAMES,
  }),
]);

/* =========================================================
   UI / DOM
========================================================= */

export const UI_CONSTANTS = freeze({
  appName: APP_NAME,
  defaultThemeMode: "system",
  defaultLang: "es",
  fallbackLang: "es",
  supportedLangs: freeze(["es", "ca", "en"]),

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
  i18n: "I18n",
  toast: "Toast",
  loader: "Loader",
  shell: "Shell",
  errors: "Errors",
});

/* =========================================================
   GETTERS
========================================================= */

export function getAppScope(key = "global") {
  return read(APP_SCOPES, key, APP_SCOPE);
}

export function getAppScopes() {
  return copyObject(APP_SCOPES);
}

export function getAppRoute(key = "", fallback = DEFAULT_ROUTE) {
  return read(APP_ROUTES, key, fallback);
}

export function getPublicAuthRoutes() {
  return copyArray(PUBLIC_AUTH_ROUTES);
}

export function getDomId(key = "", fallback = "") {
  return read(APP_DOM_IDS, key, fallback);
}

export function getSelector(key = "", fallback = "") {
  return read(APP_SELECTORS, key, fallback);
}

export function getUiConstant(key = "", fallback = null) {
  return read(UI_CONSTANTS, key, fallback);
}

export function getAppModuleName(key = "", fallback = "") {
  return read(APP_MODULES, key, fallback);
}

/* =========================================================
   ROUTE HELPERS
========================================================= */

export function normalizePublicRoutePath(path = DEFAULT_ROUTE) {
  const value = String(path || DEFAULT_ROUTE).trim();

  if (!value) return DEFAULT_ROUTE;
  if (value.startsWith("/")) return value;

  return `/${value}`;
}

export function normalizeCanonicalRoutePath(path = DEFAULT_ROUTE) {
  let value = normalizePublicRoutePath(path)
    .split("?")[0]
    .split("#")[0]
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || DEFAULT_ROUTE;
  }

  return value || DEFAULT_ROUTE;
}

function sameRoute(path = "", route = "") {
  return normalizeCanonicalRoutePath(path) === normalizeCanonicalRoutePath(route);
}

export function isPublicAuthRoute(path = "") {
  return PUBLIC_AUTH_ROUTES.some((route) => sameRoute(path, route));
}

/* Compat de nombre antiguo. */
export function isAuthLikeRoute(path = "") {
  return isPublicAuthRoute(path);
}

export function getPublicTokenRouteConfigRaw(key = "") {
  return PROTECTED_PUBLIC_TOKEN_ROUTES.find((item) => item.key === key) || null;
}

export function getPublicTokenRouteConfig(key = "") {
  const config = getPublicTokenRouteConfigRaw(key);

  if (!config) return null;

  return {
    ...config,
    paths: copyArray(config.paths),
    tokenParamNames: copyArray(config.tokenParamNames),
  };
}

export function getPublicTokenRouteConfigByPath(path = "") {
  const current = normalizeCanonicalRoutePath(path);

  const config =
    PROTECTED_PUBLIC_TOKEN_ROUTES.find((item) => {
      return item.paths.some((route) => sameRoute(current, route));
    }) || null;

  return config ? getPublicTokenRouteConfig(config.key) : null;
}

export function getPublicTokenRouteConfigs() {
  return PROTECTED_PUBLIC_TOKEN_ROUTES
    .map((item) => getPublicTokenRouteConfig(item.key))
    .filter(Boolean);
}

export function getPublicTokenRoutePaths() {
  return PROTECTED_PUBLIC_TOKEN_ROUTES.flatMap((item) => copyArray(item.paths));
}

export function getPublicTokenRouteKeys() {
  return PROTECTED_PUBLIC_TOKEN_ROUTES.map((item) => item.key);
}

export function isKnownPublicTokenRouteKey(key = "") {
  return Boolean(getPublicTokenRouteConfigRaw(key));
}

export function isProtectedPublicTokenRoute(path = "") {
  return Boolean(getPublicTokenRouteConfigByPath(path));
}

/* =========================================================
   SENSITIVE
========================================================= */

export function isSensitiveParamName(name = "") {
  return String(name || "").toLowerCase() === TOKEN_PARAM;
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
    routes: copyObject(APP_ROUTES),
    publicAuthRoutes: getPublicAuthRoutes(),
    publicTokenRoutePaths: getPublicTokenRoutePaths(),
    tokenParam: TOKEN_PARAM,
    domIds: copyObject(APP_DOM_IDS),
    ui: {
      defaultLang: UI_CONSTANTS.defaultLang,
      fallbackLang: UI_CONSTANTS.fallbackLang,
      supportedLangs: copyArray(UI_CONSTANTS.supportedLangs),
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default freeze({
  APP_CONSTANTS_VERSION,

  APP_NAME,
  APP_SCOPE,
  APP_SCOPES,

  APP_ROUTES,
  ROOT_PATH,
  DEFAULT_ROUTE,
  LOGIN_PATH,
  PASSWORD_REQUEST_PATH,
  PASSWORD_RESET_PATH,
  ACTIVATION_PATH,
  RESET_CONFIRM_PATH,

  PUBLIC_AUTH_ROUTES,
  AUTH_LIKE_ROUTES,

  TOKEN_PARAM,
  ACTIVATION_TOKEN_PARAM_NAMES,
  RESET_TOKEN_PARAM_NAMES,
  GENERIC_SENSITIVE_PARAM_NAMES,

  PUBLIC_TOKEN_ROUTE_KEYS,
  PROTECTED_PUBLIC_TOKEN_ROUTES,

  UI_CONSTANTS,
  APP_DOM_IDS,
  APP_SELECTORS,
  APP_MODULES,

  getAppScope,
  getAppScopes,
  getAppRoute,
  getPublicAuthRoutes,
  getDomId,
  getSelector,
  getUiConstant,
  getAppModuleName,

  normalizePublicRoutePath,
  normalizeCanonicalRoutePath,
  isPublicAuthRoute,
  isAuthLikeRoute,

  getPublicTokenRouteConfigRaw,
  getPublicTokenRouteConfig,
  getPublicTokenRouteConfigByPath,
  getPublicTokenRouteConfigs,
  getPublicTokenRoutePaths,
  getPublicTokenRouteKeys,
  isKnownPublicTokenRouteKey,
  isProtectedPublicTokenRoute,

  isSensitiveParamName,
  getSensitiveParamNames,
  redactSensitiveText,

  getAppConstantsSnapshot,
});
