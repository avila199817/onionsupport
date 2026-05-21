/* =========================================================
   Onion Support - App Constants
   Archivo: /src/app/constants.js

   Responsabilidad:
   - Constantes mínimas del módulo app.
   - Compat básica para imports antiguos.
   - Delegar rutas, token param, token routes, idioma y DOM ids en core/config.js.
   - No ser fuente paralela de configuración.
   - Sin rutas inventadas.
   - Sin helpers complejos.
   - Sin lógica de boot pesada.
========================================================= */

import {
  config,
  ROUTES as CORE_ROUTES,
  PUBLIC_ROUTES as CORE_PUBLIC_ROUTES,
  PROTECTED_PUBLIC_TOKEN_ROUTES as CORE_PROTECTED_PUBLIC_TOKEN_ROUTES,
  TOKEN_PARAM as CORE_TOKEN_PARAM,
  normalizeRoutePath as coreNormalizeRoutePath,
  isPublicRoute as coreIsPublicRoute,
  routePathFromUrlLike as coreRoutePathFromUrlLike,
} from "../core/config.js";

export const APP_CONSTANTS_VERSION = "app.constants.v3";

/* =========================================================
   BASICS
========================================================= */

function freeze(value) {
  try {
    return Object.freeze(value);
  } catch {
    return value;
  }
}

function read(source = {}, key = "", fallback = null) {
  return Object.prototype.hasOwnProperty.call(Object(source), key)
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

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

/* =========================================================
   APP
========================================================= */

export const APP_NAME = config.appName || config.name || "Onion Support";
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
  root: CORE_ROUTES.root || "/",
  home: CORE_ROUTES.home || CORE_ROUTES.root || "/",

  login: CORE_ROUTES.login || "/login",
  passwordRequest: CORE_ROUTES.passwordRequest || "/password-request",
  passwordReset: CORE_ROUTES.passwordReset || "/password-reset",
  activateAccount: CORE_ROUTES.activateAccount || "/activate-account",
});

export const ROOT_PATH = APP_ROUTES.root;
export const DEFAULT_ROUTE = APP_ROUTES.home || APP_ROUTES.root;

export const LOGIN_PATH = APP_ROUTES.login;
export const PASSWORD_REQUEST_PATH = APP_ROUTES.passwordRequest;
export const PASSWORD_RESET_PATH = APP_ROUTES.passwordReset;
export const ACTIVATION_PATH = APP_ROUTES.activateAccount;

/* Compat de nombre antiguo. No declara ruta nueva. */
export const RESET_CONFIRM_PATH = APP_ROUTES.passwordReset;

export const PUBLIC_AUTH_ROUTES = freeze(
  Array.isArray(CORE_PUBLIC_ROUTES) && CORE_PUBLIC_ROUTES.length
    ? [...CORE_PUBLIC_ROUTES]
    : [
        APP_ROUTES.login,
        APP_ROUTES.passwordRequest,
        APP_ROUTES.passwordReset,
        APP_ROUTES.activateAccount,
      ]
);

/* Compat de nombre antiguo. No declara rutas nuevas. */
export const AUTH_LIKE_ROUTES = PUBLIC_AUTH_ROUTES;

export const PUBLIC_TOKEN_ROUTE_KEYS = freeze({
  activation: "activation",
  passwordReset: "passwordReset",
});

/* =========================================================
   TOKENS
========================================================= */

export const TOKEN_PARAM = CORE_TOKEN_PARAM || "token";

export const ACTIVATION_TOKEN_PARAM_NAMES = freeze([TOKEN_PARAM]);
export const RESET_TOKEN_PARAM_NAMES = freeze([TOKEN_PARAM]);
export const GENERIC_SENSITIVE_PARAM_NAMES = freeze([TOKEN_PARAM]);

function normalizeTokenRouteConfig(configItem = null, index = 0) {
  const item = configItem && typeof configItem === "object"
    ? configItem
    : {
        key: `token-route-${index}`,
        path: configItem,
        paths: [configItem],
        tokenParamNames: [TOKEN_PARAM],
      };

  const paths = Array.isArray(item.paths)
    ? item.paths
    : [item.path];

  const cleanPaths = paths
    .map((path) => normalizeCanonicalRoutePath(path))
    .filter(Boolean);

  if (!cleanPaths.length) return null;

  const tokenParamNames = Array.isArray(item.tokenParamNames)
    ? item.tokenParamNames
    : [TOKEN_PARAM];

  return freeze({
    key: cleanText(item.key, `token-route-${index}`),
    path: normalizeCanonicalRoutePath(item.path || cleanPaths[0]),
    paths: freeze(cleanPaths),
    tokenParamNames: freeze(
      tokenParamNames
        .map((name) => cleanText(name, ""))
        .filter(Boolean)
    ),
  });
}

export const PROTECTED_PUBLIC_TOKEN_ROUTES = freeze(
  (Array.isArray(CORE_PROTECTED_PUBLIC_TOKEN_ROUTES)
    ? CORE_PROTECTED_PUBLIC_TOKEN_ROUTES
    : []
  )
    .map(normalizeTokenRouteConfig)
    .filter(Boolean)
);

/* =========================================================
   UI / DOM
========================================================= */

export const UI_CONSTANTS = freeze({
  appName: APP_NAME,

  defaultThemeMode: config.defaultTheme || config.ui?.defaultTheme || "system",

  defaultLang: config.defaultLang || config.i18n?.defaultLang || "es",
  fallbackLang: config.fallbackLang || config.i18n?.fallbackLang || "es",
  supportedLangs: freeze(copyArray(config.supportedLangs || config.i18n?.supported || ["es", "ca", "en"])),

  bootingClass: config.loader?.bootClass || "app-booting",
  loadingClass: config.loader?.loadingClass || "app-loading",
  readyClass: config.loader?.readyClass || "app-ready",
  fatalClass: config.loader?.fatalClass || "app-fatal",
});

export const APP_DOM_IDS = freeze({
  shell: config.ui?.shellId || "app-shell",
  loader: config.ui?.loaderId || "app-loader",

  main: config.ui?.mainContentId || "main-content",
  mainContent: config.ui?.mainContentId || "main-content",

  appContent: config.ui?.appContentId || "app-content",

  view: config.ui?.viewContainerId || "view-container",
  viewContainer: config.ui?.viewContainerId || "view-container",

  sidebarMount: config.ui?.sidebarMountId || "sidebar-mount",
  topbarMount: config.ui?.topbarMountId || "topbar-mount",

  tablehead: config.ui?.tableheadId || "table-head",
  tableHead: config.ui?.tableheadId || "table-head",

  tableheadContainer: config.ui?.tableheadContainerId || "tablehead-container",
  tableHeadContainer: config.ui?.tableheadContainerId || "tablehead-container",
});

export const APP_SELECTORS = freeze({
  shell: `#${APP_DOM_IDS.shell}`,
  loader: `#${APP_DOM_IDS.loader}`,

  main: `#${APP_DOM_IDS.main}`,
  mainContent: `#${APP_DOM_IDS.mainContent}`,

  appContent: `#${APP_DOM_IDS.appContent}`,

  view: `#${APP_DOM_IDS.view}`,
  viewContainer: `#${APP_DOM_IDS.viewContainer}`,

  sidebarMount: `#${APP_DOM_IDS.sidebarMount}`,
  topbarMount: `#${APP_DOM_IDS.topbarMount}`,

  tablehead: `#${APP_DOM_IDS.tablehead}`,
  tableHead: `#${APP_DOM_IDS.tableHead}`,

  tableheadContainer: `#${APP_DOM_IDS.tableheadContainer}`,
  tableHeadContainer: `#${APP_DOM_IDS.tableHeadContainer}`,
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
  try {
    const raw = coreRoutePathFromUrlLike(path) || DEFAULT_ROUTE;
    return raw.startsWith("/") ? raw : `/${raw}`;
  } catch {
    const value = cleanText(path, DEFAULT_ROUTE);
    return value.startsWith("/") ? value : `/${value}`;
  }
}

export function normalizeCanonicalRoutePath(path = DEFAULT_ROUTE) {
  try {
    return coreNormalizeRoutePath(path) || DEFAULT_ROUTE;
  } catch {
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
}

function sameRoute(path = "", route = "") {
  return normalizeCanonicalRoutePath(path) === normalizeCanonicalRoutePath(route);
}

export function isPublicAuthRoute(path = "") {
  try {
    return coreIsPublicRoute(path) === true;
  } catch {
    return PUBLIC_AUTH_ROUTES.some((route) => sameRoute(path, route));
  }
}

/* Compat de nombre antiguo. */
export function isAuthLikeRoute(path = "") {
  return isPublicAuthRoute(path);
}

export function getPublicTokenRouteConfigRaw(key = "") {
  return PROTECTED_PUBLIC_TOKEN_ROUTES.find((item) => item.key === key) || null;
}

export function getPublicTokenRouteConfig(key = "") {
  const item = getPublicTokenRouteConfigRaw(key);

  if (!item) return null;

  return {
    key: item.key,
    path: item.path,
    paths: copyArray(item.paths),
    tokenParamNames: copyArray(item.tokenParamNames),
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
  return String(name || "").toLowerCase() === TOKEN_PARAM.toLowerCase();
}

export function getSensitiveParamNames() {
  return [TOKEN_PARAM];
}

export function redactSensitiveText(value = "") {
  const token = TOKEN_PARAM.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`([?&#]${token}=)([^&#\\s]+)`, "gi");

  return String(value || "").replace(pattern, "$1***");
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

    policy: {
      constantsOnly: true,
      compatibilityLayer: true,
      coreConfigOwnsRoutes: true,
      coreConfigOwnsTokenRoutes: true,
      coreConfigOwnsUiDefaults: true,
      noInventedRoutes: true,
      noBootLogic: true,
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
