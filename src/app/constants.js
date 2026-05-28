/* =========================================================
   Onion Support - App Constants
   Archivo: /src/app/constants.js

   Responsabilidad:
   - Constantes mínimas del módulo app.
   - Compat básica para imports antiguos.
   - Delegar rutas, token param, token routes y DOM ids en core/config.js.
   - No ser fuente paralela de configuración.
   - Sin rutas inventadas, /home, Auth, Router real, fetch ni storage.
========================================================= */

import {
  config,
  ROUTES as CORE_ROUTES,
  PUBLIC_ROUTES as CORE_PUBLIC_ROUTES,
  PROTECTED_PUBLIC_TOKEN_ROUTES as CORE_PROTECTED_PUBLIC_TOKEN_ROUTES,
  TOKEN_PARAM as CORE_TOKEN_PARAM,
  USER_HOME_PREFIX as CORE_USER_HOME_PREFIX,
  normalizeRoutePath as coreNormalizeRoutePath,
  isPublicRoute as coreIsPublicRoute,
  isBlockedRoutePath as coreIsBlockedRoutePath,
  routePathFromUrlLike as coreRoutePathFromUrlLike,
} from "../core/config.js";

export const APP_CONSTANTS_VERSION = "app.constants.v6";

const FALLBACK_APP_NAME = "Onion Support";
const FALLBACK_ROOT_PATH = "/";
const FALLBACK_LANG = "es";
const SUPPORTED_LANGS = Object.freeze(["es", "ca", "en"]);

const CORE_CONFIG = toObject(config);
const CORE_ROUTE_MAP = toObject(CORE_ROUTES);

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

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function toObject(value = {}) {
  return isPlainObject(value) ? value : {};
}

function copyArray(value = []) {
  return Array.isArray(value) ? [...value] : [];
}

function copyObject(value = {}) {
  return isPlainObject(value) ? { ...value } : {};
}

function read(source = {}, key = "", fallback = null) {
  return Object.prototype.hasOwnProperty.call(Object(source), key)
    ? source[key]
    : fallback;
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function uniqueText(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [values])
        .flat(Infinity)
        .map((item) => cleanText(item, ""))
        .filter(Boolean)
    ),
  ];
}

function escapeRegExp(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* =========================================================
   ROUTE NORMALIZATION
========================================================= */

function normalizeSearch(value = "") {
  const search = cleanText(value, "");
  if (!search || search === "?") return "";
  return search.startsWith("?") ? search : `?${search.replace(/^\?+/, "")}`;
}

function normalizeHash(value = "") {
  const hash = cleanText(value, "");
  if (!hash || hash === "#") return "";
  return hash.startsWith("#") ? hash : `#${hash.replace(/^#+/, "")}`;
}

function normalizePathnameLocal(path = FALLBACK_ROOT_PATH) {
  let output = cleanText(path, FALLBACK_ROOT_PATH)
    .split("?")[0]
    .split("#")[0]
    .replace(/\/{2,}/g, "/");

  if (!output.startsWith("/")) output = `/${output}`;
  if (output.length > 1) output = output.replace(/\/+$/g, "") || FALLBACK_ROOT_PATH;

  return output || FALLBACK_ROOT_PATH;
}

function splitRoute(value = FALLBACK_ROOT_PATH) {
  let raw = cleanText(value, FALLBACK_ROOT_PATH);
  let search = "";
  let hash = "";

  const hashIndex = raw.indexOf("#");

  if (hashIndex >= 0) {
    hash = raw.slice(hashIndex);
    raw = raw.slice(0, hashIndex) || FALLBACK_ROOT_PATH;
  }

  const searchIndex = raw.indexOf("?");

  if (searchIndex >= 0) {
    search = raw.slice(searchIndex);
    raw = raw.slice(0, searchIndex) || FALLBACK_ROOT_PATH;
  }

  return {
    pathname: normalizePathnameLocal(raw),
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
  };
}

function joinRoute({ pathname = FALLBACK_ROOT_PATH, search = "", hash = "" } = {}) {
  return `${normalizePathnameLocal(pathname)}${normalizeSearch(search)}${normalizeHash(hash)}`;
}

function routeSuffix(path = "") {
  const parts = splitRoute(path);
  return `${parts.search}${parts.hash}`;
}

function safePathInput(value = FALLBACK_ROOT_PATH) {
  const raw = cleanText(value, FALLBACK_ROOT_PATH);

  if (!raw || raw.startsWith("//")) return FALLBACK_ROOT_PATH;

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || FALLBACK_ROOT_PATH;
  }

  if (raw.startsWith("#/")) {
    return raw.slice(1) || FALLBACK_ROOT_PATH;
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const base = typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost";

      const url = new URL(raw, base);

      return url.origin === base
        ? `${url.pathname || FALLBACK_ROOT_PATH}${url.search || ""}${url.hash || ""}`
        : FALLBACK_ROOT_PATH;
    } catch {
      return FALLBACK_ROOT_PATH;
    }
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return FALLBACK_ROOT_PATH;
  if (/[\r\n\t\\]/.test(raw)) return FALLBACK_ROOT_PATH;

  return raw;
}

export function normalizePublicRoutePath(path = FALLBACK_ROOT_PATH) {
  const fallback = joinRoute(splitRoute(safePathInput(path)));

  try {
    const configured = joinRoute(
      splitRoute(coreRoutePathFromUrlLike(path) || fallback)
    );

    return routeSuffix(fallback) && !routeSuffix(configured)
      ? fallback
      : configured;
  } catch {
    return fallback;
  }
}

export function normalizeCanonicalRoutePath(path = FALLBACK_ROOT_PATH) {
  try {
    return normalizePathnameLocal(coreNormalizeRoutePath(path) || FALLBACK_ROOT_PATH);
  } catch {
    return splitRoute(normalizePublicRoutePath(path)).pathname;
  }
}

function isBlockedFrontendRoute(path = "") {
  try {
    return coreIsBlockedRoutePath(path) === true;
  } catch {
    return false;
  }
}

function safeConfigRoute(path = "", fallback = FALLBACK_ROOT_PATH) {
  const fallbackRoute = fallback === ""
    ? ""
    : normalizeCanonicalRoutePath(fallback || FALLBACK_ROOT_PATH);

  const clean = normalizeCanonicalRoutePath(path || fallbackRoute || FALLBACK_ROOT_PATH);

  if (clean && !isBlockedFrontendRoute(clean)) return clean;
  if (fallbackRoute && !isBlockedFrontendRoute(fallbackRoute)) return fallbackRoute;

  return fallback === "" ? "" : FALLBACK_ROOT_PATH;
}

function sameRoute(path = "", route = "") {
  return normalizeCanonicalRoutePath(path) === normalizeCanonicalRoutePath(route);
}

/* =========================================================
   APP
========================================================= */

export const APP_NAME = cleanText(
  CORE_CONFIG.appName || CORE_CONFIG.name,
  FALLBACK_APP_NAME
);

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
  root: safeConfigRoute(CORE_ROUTE_MAP.root || FALLBACK_ROOT_PATH, FALLBACK_ROOT_PATH),
  home: safeConfigRoute(CORE_ROUTE_MAP.root || FALLBACK_ROOT_PATH, FALLBACK_ROOT_PATH),

  login: safeConfigRoute(CORE_ROUTE_MAP.login || "/login", "/login"),
  passwordRequest: safeConfigRoute(CORE_ROUTE_MAP.passwordRequest || "/password-request", "/password-request"),
  passwordReset: safeConfigRoute(CORE_ROUTE_MAP.passwordReset || "/password-reset", "/password-reset"),
  activateAccount: safeConfigRoute(CORE_ROUTE_MAP.activateAccount || "/activate-account", "/activate-account"),
});

export const ROOT_PATH = APP_ROUTES.root;
export const DEFAULT_ROUTE = APP_ROUTES.home || APP_ROUTES.root;

export const LOGIN_PATH = APP_ROUTES.login;
export const PASSWORD_REQUEST_PATH = APP_ROUTES.passwordRequest;
export const PASSWORD_RESET_PATH = APP_ROUTES.passwordReset;
export const ACTIVATION_PATH = APP_ROUTES.activateAccount;
export const RESET_CONFIRM_PATH = APP_ROUTES.passwordReset;

export const PUBLIC_AUTH_ROUTES = freeze(
  uniqueText(
    Array.isArray(CORE_PUBLIC_ROUTES) && CORE_PUBLIC_ROUTES.length
      ? CORE_PUBLIC_ROUTES
      : [
          APP_ROUTES.login,
          APP_ROUTES.passwordRequest,
          APP_ROUTES.passwordReset,
          APP_ROUTES.activateAccount,
        ]
  )
    .map((path) => safeConfigRoute(path, ""))
    .filter(Boolean)
);

export const AUTH_LIKE_ROUTES = PUBLIC_AUTH_ROUTES;

/* =========================================================
   TOKENS
========================================================= */

export const TOKEN_PARAM = cleanText(CORE_TOKEN_PARAM, "token");

export const PUBLIC_TOKEN_ROUTE_KEYS = freeze({
  activation: "activation",
  passwordReset: "passwordReset",
});

const SENSITIVE_PARAM_NAMES = freeze(
  uniqueText([
    TOKEN_PARAM,
    "token",
    "access_token",
    "accessToken",
    "refresh_token",
    "refreshToken",
    "id_token",
    "idToken",
    "secret",
    "session",
    "code",
    "password",
    "pwd",
    "key",
    "sig",
    "signature",
    "jwt",
    "authorization",
    "reset_token",
    "resetToken",
    "activation_token",
    "activationToken",
  ])
);

export const ACTIVATION_TOKEN_PARAM_NAMES = freeze([TOKEN_PARAM]);
export const RESET_TOKEN_PARAM_NAMES = freeze([TOKEN_PARAM]);
export const GENERIC_SENSITIVE_PARAM_NAMES = SENSITIVE_PARAM_NAMES;

function normalizeTokenRouteConfig(configItem = null, index = 0) {
  const item = isPlainObject(configItem)
    ? configItem
    : {
        key: `token-route-${index}`,
        path: configItem,
        paths: [configItem],
      };

  const rawPaths = Array.isArray(item.paths) ? item.paths : [item.path];
  const paths = uniqueText(rawPaths)
    .map((path) => safeConfigRoute(path, ""))
    .filter(Boolean);

  if (!paths.length) return null;

  return freeze({
    key: cleanText(item.key, `token-route-${index}`),
    path: safeConfigRoute(item.path || paths[0], paths[0]),
    paths: freeze(paths),
    tokenParamNames: freeze([TOKEN_PARAM]),
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

  defaultThemeMode: "system",
  defaultLang: FALLBACK_LANG,
  fallbackLang: FALLBACK_LANG,
  supportedLangs: SUPPORTED_LANGS,

  bootingClass: cleanText(CORE_CONFIG.loader?.bootClass, "app-booting"),
  loadingClass: cleanText(CORE_CONFIG.loader?.loadingClass, "app-loading"),
  readyClass: cleanText(CORE_CONFIG.loader?.readyClass, "app-ready"),
  fatalClass: cleanText(CORE_CONFIG.loader?.fatalClass, "app-fatal"),
});

export const APP_DOM_IDS = freeze({
  shell: cleanText(CORE_CONFIG.ui?.shellId, "app-shell"),
  loader: cleanText(CORE_CONFIG.ui?.loaderId, "app-loader"),

  main: cleanText(CORE_CONFIG.ui?.mainContentId, "main-content"),
  mainContent: cleanText(CORE_CONFIG.ui?.mainContentId, "main-content"),

  appContent: cleanText(CORE_CONFIG.ui?.appContentId, "app-content"),

  view: cleanText(CORE_CONFIG.ui?.viewContainerId, "view-container"),
  viewContainer: cleanText(CORE_CONFIG.ui?.viewContainerId, "view-container"),

  sidebarMount: cleanText(CORE_CONFIG.ui?.sidebarMountId, "sidebar-mount"),
  topbarMount: cleanText(CORE_CONFIG.ui?.topbarMountId, "topbar-mount"),

  tablehead: cleanText(CORE_CONFIG.ui?.tableheadId, "table-head"),
  tableHead: cleanText(CORE_CONFIG.ui?.tableheadId, "table-head"),

  tableheadContainer: cleanText(CORE_CONFIG.ui?.tableheadContainerId, "tablehead-container"),
  tableHeadContainer: cleanText(CORE_CONFIG.ui?.tableheadContainerId, "tablehead-container"),
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

export const USER_HOME_PREFIX = cleanText(CORE_USER_HOME_PREFIX, "/@");

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

export function isPublicAuthRoute(path = "") {
  try {
    return coreIsPublicRoute(path) === true;
  } catch {
    return PUBLIC_AUTH_ROUTES.some((route) => sameRoute(path, route));
  }
}

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

  const config = PROTECTED_PUBLIC_TOKEN_ROUTES.find((item) => (
    item.paths.some((route) => sameRoute(current, route))
  ));

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

function normalizeParamName(name = "") {
  return cleanText(name, "").toLowerCase().replace(/[_\-. \s]/g, "");
}

export function isSensitiveParamName(name = "") {
  const clean = normalizeParamName(name);
  return SENSITIVE_PARAM_NAMES.some((item) => normalizeParamName(item) === clean);
}

export function getSensitiveParamNames() {
  return copyArray(SENSITIVE_PARAM_NAMES);
}

export function redactSensitiveText(value = "") {
  let output = String(value || "");

  for (const name of SENSITIVE_PARAM_NAMES) {
    const token = escapeRegExp(name);
    output = output.replace(new RegExp(`([?&#]${token}=)([^&#\\s]+)`, "gi"), "$1***");
  }

  return output
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getAppConstantsSnapshot() {
  return {
    version: APP_CONSTANTS_VERSION,

    appName: APP_NAME,

    routes: copyObject(APP_ROUTES),
    publicAuthRoutes: getPublicAuthRoutes(),
    publicTokenRoutePaths: getPublicTokenRoutePaths(),

    tokenParam: TOKEN_PARAM,
    sensitiveParamNames: getSensitiveParamNames(),

    userHomePrefix: USER_HOME_PREFIX,
    domIds: copyObject(APP_DOM_IDS),

    ui: {
      defaultLang: UI_CONSTANTS.defaultLang,
      fallbackLang: UI_CONSTANTS.fallbackLang,
      supportedLangs: copyArray(UI_CONSTANTS.supportedLangs),
      defaultThemeMode: UI_CONSTANTS.defaultThemeMode,
    },

    policy: {
      constantsOnly: true,
      compatibilityLayer: true,
      coreConfigOwnsRoutes: true,
      coreConfigOwnsTokenRoutes: true,
      coreConfigOwnsUiDefaults: true,
      forcedBaseEs: true,
      themeModeSystem: true,
      noInventedRoutes: true,
      noHomeRoute: true,
      internalHomeIsRoot: true,
      visibleHomeOwnedByRouter: true,
      visibleHomePattern: `${USER_HOME_PREFIX}{slug}`,
      noBootLogic: true,
      noFetch: true,
      noStorage: true,
      redactedSnapshot: true,
    },
  };
}

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

  USER_HOME_PREFIX,

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
