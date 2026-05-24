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
  USER_HOME_PREFIX as CORE_USER_HOME_PREFIX,
  BLOCKED_FRONTEND_ROUTES as CORE_BLOCKED_FRONTEND_ROUTES,
  normalizeRoutePath as coreNormalizeRoutePath,
  isPublicRoute as coreIsPublicRoute,
  routePathFromUrlLike as coreRoutePathFromUrlLike,
} from "../core/config.js";

export const APP_CONSTANTS_VERSION = "app.constants.v4";

const FALLBACK_APP_NAME = "Onion Support";
const FALLBACK_ROOT_PATH = "/";
const FALLBACK_LANG = "es";
const DEFAULT_SUPPORTED_LANGS = Object.freeze(["es", "ca", "en"]);

const CORE_CONFIG = copyObject(config);
const CORE_ROUTE_MAP = copyObject(CORE_ROUTES);

const BLOCKED_FRONTEND_ROUTE_SET = new Set(
  (
    Array.isArray(CORE_BLOCKED_FRONTEND_ROUTES) &&
    CORE_BLOCKED_FRONTEND_ROUTES.length
      ? CORE_BLOCKED_FRONTEND_ROUTES
      : [
          "/home",
          "/403",
          "/404",
          "/2fa",
          "/mfa",
          "/otp",
        ]
  )
    .map((path) => normalizeCanonicalRoutePath(path))
    .filter(Boolean)
);

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

function unique(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [values])
        .flat(Infinity)
        .map((item) => cleanText(item, ""))
        .filter(Boolean)
    ),
  ];
}

function normalizeLangToken(value = "") {
  const raw = cleanText(value, "")
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  if (!raw) return "";

  return raw.split("-").filter(Boolean).join("-");
}

function normalizeSupportedLangs(values = []) {
  const input = Array.isArray(values) && values.length
    ? values
    : DEFAULT_SUPPORTED_LANGS;

  const langs = unique(
    input
      .map(normalizeLangToken)
      .map((lang) => lang.split("-")[0] || lang)
      .filter(Boolean)
  );

  if (!langs.includes(FALLBACK_LANG)) {
    langs.unshift(FALLBACK_LANG);
  }

  return langs.length ? langs : [...DEFAULT_SUPPORTED_LANGS];
}

function normalizeLang(value = "", fallback = FALLBACK_LANG) {
  const supported = normalizeSupportedLangs(
    CORE_CONFIG.supportedLangs ||
      CORE_CONFIG.i18n?.supported ||
      DEFAULT_SUPPORTED_LANGS
  );

  const raw = normalizeLangToken(value);
  const short = raw.split("-")[0];
  const cleanFallback = normalizeLangToken(fallback) || FALLBACK_LANG;
  const fallbackShort = cleanFallback.split("-")[0];

  if (supported.includes(raw)) return raw;
  if (supported.includes(short)) return short;
  if (supported.includes(cleanFallback)) return cleanFallback;
  if (supported.includes(fallbackShort)) return fallbackShort;

  return FALLBACK_LANG;
}

function escapeRegExp(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* =========================================================
   ROUTE NORMALIZATION
========================================================= */

function fallbackPublicRoutePath(path = FALLBACK_ROOT_PATH) {
  const raw = cleanText(path, FALLBACK_ROOT_PATH);

  if (!raw || raw.startsWith("//")) return FALLBACK_ROOT_PATH;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return FALLBACK_ROOT_PATH;
  if (/[\r\n\t\\]/.test(raw)) return FALLBACK_ROOT_PATH;

  return raw.startsWith("/") ? raw : `/${raw}`;
}

export function normalizePublicRoutePath(path = FALLBACK_ROOT_PATH) {
  try {
    const raw = coreRoutePathFromUrlLike(path) || FALLBACK_ROOT_PATH;
    return fallbackPublicRoutePath(raw);
  } catch {
    return fallbackPublicRoutePath(path);
  }
}

export function normalizeCanonicalRoutePath(path = FALLBACK_ROOT_PATH) {
  try {
    const normalized = coreNormalizeRoutePath(path) || FALLBACK_ROOT_PATH;
    return fallbackPublicRoutePath(normalized)
      .split("?")[0]
      .split("#")[0];
  } catch {
    let value = normalizePublicRoutePath(path)
      .split("?")[0]
      .split("#")[0]
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

    if (value.length > 1) {
      value = value.replace(/\/+$/g, "") || FALLBACK_ROOT_PATH;
    }

    return value || FALLBACK_ROOT_PATH;
  }
}

function isBlockedFrontendRoute(path = "") {
  const clean = normalizeCanonicalRoutePath(path).toLowerCase();

  if (BLOCKED_FRONTEND_ROUTE_SET.has(clean)) return true;

  return (
    clean.startsWith("/2fa/") ||
    clean.startsWith("/mfa/") ||
    clean.startsWith("/otp/")
  );
}

function safeConfigRoute(path = "", fallback = FALLBACK_ROOT_PATH) {
  const clean = normalizeCanonicalRoutePath(path || fallback || FALLBACK_ROOT_PATH);

  return isBlockedFrontendRoute(clean)
    ? normalizeCanonicalRoutePath(fallback || FALLBACK_ROOT_PATH)
    : clean;
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

  /*
    Compat:
    home interno de app nunca debe convertirse en /home.
    La home visible autenticada pertenece al Router/Auth: /@{slug}.
  */
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

/* Compat de nombre antiguo. No declara ruta nueva. */
export const RESET_CONFIRM_PATH = APP_ROUTES.passwordReset;

export const PUBLIC_AUTH_ROUTES = freeze(
  unique(
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

/* Compat de nombre antiguo. No declara rutas nuevas. */
export const AUTH_LIKE_ROUTES = PUBLIC_AUTH_ROUTES;

export const PUBLIC_TOKEN_ROUTE_KEYS = freeze({
  activation: "activation",
  passwordReset: "passwordReset",
});

/* =========================================================
   TOKENS
========================================================= */

export const TOKEN_PARAM = cleanText(CORE_TOKEN_PARAM, "token");

const SENSITIVE_PARAM_NAMES = freeze(
  unique([
    TOKEN_PARAM,
    "token",
    "access_token",
    "refresh_token",
    "id_token",
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
    "activation_token",
  ]).map((name) => name.toLowerCase())
);

export const ACTIVATION_TOKEN_PARAM_NAMES = freeze([TOKEN_PARAM]);
export const RESET_TOKEN_PARAM_NAMES = freeze([TOKEN_PARAM]);
export const GENERIC_SENSITIVE_PARAM_NAMES = SENSITIVE_PARAM_NAMES;

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

  const cleanPaths = unique(paths)
    .map((path) => safeConfigRoute(path, ""))
    .filter(Boolean);

  if (!cleanPaths.length) return null;

  const tokenParamNames = Array.isArray(item.tokenParamNames)
    ? item.tokenParamNames
    : [TOKEN_PARAM];

  return freeze({
    key: cleanText(item.key, `token-route-${index}`),
    path: safeConfigRoute(item.path || cleanPaths[0], cleanPaths[0]),
    paths: freeze(cleanPaths),
    tokenParamNames: freeze(
      unique(tokenParamNames)
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

const SUPPORTED_LANGS = freeze(
  normalizeSupportedLangs(
    CORE_CONFIG.supportedLangs ||
      CORE_CONFIG.i18n?.supported ||
      DEFAULT_SUPPORTED_LANGS
  )
);

export const UI_CONSTANTS = freeze({
  appName: APP_NAME,

  defaultThemeMode: CORE_CONFIG.defaultTheme || CORE_CONFIG.ui?.defaultTheme || "system",

  defaultLang: normalizeLang(CORE_CONFIG.defaultLang || CORE_CONFIG.i18n?.defaultLang || FALLBACK_LANG),
  fallbackLang: normalizeLang(CORE_CONFIG.fallbackLang || CORE_CONFIG.i18n?.fallbackLang || FALLBACK_LANG),
  supportedLangs: SUPPORTED_LANGS,

  bootingClass: CORE_CONFIG.loader?.bootClass || "app-booting",
  loadingClass: CORE_CONFIG.loader?.loadingClass || "app-loading",
  readyClass: CORE_CONFIG.loader?.readyClass || "app-ready",
  fatalClass: CORE_CONFIG.loader?.fatalClass || "app-fatal",
});

export const APP_DOM_IDS = freeze({
  shell: CORE_CONFIG.ui?.shellId || "app-shell",
  loader: CORE_CONFIG.ui?.loaderId || "app-loader",

  main: CORE_CONFIG.ui?.mainContentId || "main-content",
  mainContent: CORE_CONFIG.ui?.mainContentId || "main-content",

  appContent: CORE_CONFIG.ui?.appContentId || "app-content",

  view: CORE_CONFIG.ui?.viewContainerId || "view-container",
  viewContainer: CORE_CONFIG.ui?.viewContainerId || "view-container",

  sidebarMount: CORE_CONFIG.ui?.sidebarMountId || "sidebar-mount",
  topbarMount: CORE_CONFIG.ui?.topbarMountId || "topbar-mount",

  tablehead: CORE_CONFIG.ui?.tableheadId || "table-head",
  tableHead: CORE_CONFIG.ui?.tableheadId || "table-head",

  tableheadContainer: CORE_CONFIG.ui?.tableheadContainerId || "tablehead-container",
  tableHeadContainer: CORE_CONFIG.ui?.tableheadContainerId || "tablehead-container",
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
  return SENSITIVE_PARAM_NAMES.includes(
    cleanText(name, "").toLowerCase()
  );
}

export function getSensitiveParamNames() {
  return copyArray(SENSITIVE_PARAM_NAMES);
}

export function redactSensitiveText(value = "") {
  let output = String(value || "");

  for (const name of SENSITIVE_PARAM_NAMES) {
    const token = escapeRegExp(name);
    const pattern = new RegExp(`([?&#]${token}=)([^&#\\s]+)`, "gi");
    output = output.replace(pattern, "$1***");
  }

  output = output.replace(
    /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
    "$1***"
  );

  return output;
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

      doesNotOwnRouter: true,
      doesNotOwnAuth: true,
      doesNotOwnBoot: true,

      noInventedRoutes: true,
      noHomeRoute: true,
      internalHomeIsRoot: true,
      visibleHomeOwnedByRouter: true,
      visibleHomePattern: `${USER_HOME_PREFIX}{slug}`,

      baseFallbackEs: true,
      noBootLogic: true,
      redactedSnapshot: true,
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
