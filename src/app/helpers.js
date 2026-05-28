/* =========================================================
   Onion Support - App Helpers
   Archivo: /src/app/helpers.js

   Responsabilidad:
   - Helpers mínimos de path.
   - Compat básica.
   - Delegar rutas, user-scope, bloqueos y token routes en core/config.js.
   - Preservar query/hash cuando toca, especialmente rutas públicas con token.
   - Sin Auth, Router real, fetch, storage, history complejo,
     rutas inventadas ni navegación paralela.
========================================================= */

import {
  ROUTES,
  TOKEN_PARAM,
  PROTECTED_PUBLIC_TOKEN_ROUTES,
  USER_HOME_PREFIX as CONFIG_USER_HOME_PREFIX,
  canonicalRoutePath as configCanonicalRoutePath,
  getUserScopedRouteInfo as getConfigUserScopedRouteInfo,
  isBlockedRoutePath as configIsBlockedRoutePath,
  isUserHomeRoute as configIsUserHomeRoute,
  isUserScopedRoute as configIsUserScopedRoute,
  normalizeRoutePath as configNormalizeRoutePath,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../core/config.js";

export const HELPERS_VERSION = "app.helpers.v6";

const DEFAULT_ROUTE = "/";
const CORE_ROUTES = ROUTES && typeof ROUTES === "object" ? ROUTES : {};
const USER_HOME_PREFIX = cleanText(CONFIG_USER_HOME_PREFIX, "/@");
const TOKEN_PARAM_NAME = cleanText(TOKEN_PARAM, "token");

const SENSITIVE_PARAM_NAMES = Object.freeze(
  uniqueText([
    TOKEN_PARAM_NAME,
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
  ])
);

const ACTIVATION_ROUTE = readConfigRoute(CORE_ROUTES.activateAccount);
const PASSWORD_RESET_ROUTE = readConfigRoute(CORE_ROUTES.passwordReset);

const PUBLIC_TOKEN_ROUTE_CONFIGS = Object.freeze(
  (Array.isArray(PROTECTED_PUBLIC_TOKEN_ROUTES) ? PROTECTED_PUBLIC_TOKEN_ROUTES : [])
    .map(normalizeProtectedTokenRouteConfig)
    .filter(Boolean)
);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

function currentBrowserPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  try {
    const { pathname = DEFAULT_ROUTE, search = "", hash = "" } = window.location;
    return normalizePublicPath(`${pathname || DEFAULT_ROUTE}${search || ""}${hash || ""}`);
  } catch {
    return DEFAULT_ROUTE;
  }
}

/* =========================================================
   PATH PARSING
========================================================= */

function safePathInput(value = DEFAULT_ROUTE) {
  const raw = cleanText(value, DEFAULT_ROUTE);

  if (!raw || raw.startsWith("//")) return DEFAULT_ROUTE;

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  }

  if (raw.startsWith("#/")) {
    return raw.slice(1) || DEFAULT_ROUTE;
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const base = isBrowser() ? window.location.origin : "http://localhost";
      const url = new URL(raw, base);

      return url.origin === base
        ? `${url.pathname || DEFAULT_ROUTE}${url.search || ""}${url.hash || ""}`
        : DEFAULT_ROUTE;
    } catch {
      return DEFAULT_ROUTE;
    }
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return DEFAULT_ROUTE;
  if (/[\r\n\t\\]/.test(raw)) return DEFAULT_ROUTE;

  return raw;
}

function pathFromInput(value = DEFAULT_ROUTE) {
  const fallback = safePathInput(value);

  try {
    const configured = configRoutePathFromUrlLike(value) || DEFAULT_ROUTE;

    if (fallback.includes("?") && !configured.includes("?")) return fallback;
    if (fallback.includes("#") && !configured.includes("#")) return fallback;

    return configured;
  } catch {
    return fallback;
  }
}

function normalizePathname(value = DEFAULT_ROUTE) {
  try {
    return configNormalizeRoutePath(value) || DEFAULT_ROUTE;
  } catch {
    let path = cleanText(value, DEFAULT_ROUTE)
      .split("#")[0]
      .split("?")[0]
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

    if (!path.startsWith("/")) path = `/${path}`;
    if (path.length > 1) path = path.replace(/\/+$/g, "") || DEFAULT_ROUTE;

    return path || DEFAULT_ROUTE;
  }
}

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

function splitPath(value = DEFAULT_ROUTE) {
  let pathname = pathFromInput(value);
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || DEFAULT_ROUTE;
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || DEFAULT_ROUTE;
  }

  const normalizedSearch = normalizeSearch(search);
  const normalizedHash = normalizeHash(hash);

  return {
    pathname: normalizePathname(pathname),
    search: normalizedSearch,
    hash: normalizedHash,
    suffix: `${normalizedSearch}${normalizedHash}`,
  };
}

function joinPath({ pathname = DEFAULT_ROUTE, search = "", hash = "" } = {}) {
  return `${normalizePathname(pathname)}${normalizeSearch(search)}${normalizeHash(hash)}`;
}

function isBlockedPath(path = DEFAULT_ROUTE) {
  try {
    return configIsBlockedRoutePath(path) === true;
  } catch {
    return false;
  }
}

function readConfigRoute(path = "") {
  const clean = normalizePathname(path || "");
  return clean && clean !== DEFAULT_ROUTE && !isBlockedPath(clean) ? clean : "";
}

/* =========================================================
   USER SCOPE
========================================================= */

function normalizeUserSlug(value = "") {
  const slug = cleanText(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^\/+/, "")
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();

  return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
}

function emptyScopeInfo(path = DEFAULT_ROUTE) {
  const pathname = splitPath(path).pathname;

  return {
    scoped: false,
    home: false,
    slug: "",
    restPath: pathname,
    lookupPath: pathname,
  };
}

export function getUserScopedRouteInfo(path = DEFAULT_ROUTE) {
  try {
    const info = getConfigUserScopedRouteInfo(path);

    if (!isPlainObject(info)) return emptyScopeInfo(path);

    const restPath = normalizePathname(
      info.restPath || info.canonicalPath || splitPath(path).pathname
    );

    const lookupPath = normalizePathname(
      info.canonicalPath || info.lookupPath || restPath
    );

    return {
      scoped: info.scoped === true,
      home: info.home === true,
      slug: normalizeUserSlug(info.slug || ""),
      restPath,
      lookupPath,
    };
  } catch {
    return emptyScopeInfo(path);
  }
}

/* =========================================================
   NORMALIZE
========================================================= */

export function normalizePublicPath(path = DEFAULT_ROUTE) {
  const parts = splitPath(path);
  return isBlockedPath(parts.pathname) ? DEFAULT_ROUTE : joinPath(parts);
}

export function stripSearchAndHash(path = DEFAULT_ROUTE) {
  return splitPath(normalizePublicPath(path)).pathname || DEFAULT_ROUTE;
}

export function getSearchAndHash(path = DEFAULT_ROUTE) {
  const { search, hash } = splitPath(normalizePublicPath(path));
  return `${search}${hash}`;
}

export function stripUsernamePrefix(path = DEFAULT_ROUTE) {
  const publicPath = normalizePublicPath(path);
  const parts = splitPath(publicPath);
  const scope = getUserScopedRouteInfo(publicPath);

  return scope.scoped && scope.restPath
    ? normalizePublicPath(`${scope.restPath}${parts.suffix}`)
    : publicPath;
}

export function normalizeCanonicalPath(path = DEFAULT_ROUTE) {
  const publicPath = normalizePublicPath(path);

  if (isBlockedPath(publicPath)) return DEFAULT_ROUTE;

  try {
    const canonical = configCanonicalRoutePath(publicPath) || DEFAULT_ROUTE;
    return isBlockedPath(canonical) ? DEFAULT_ROUTE : normalizePathname(canonical);
  } catch {
    const scope = getUserScopedRouteInfo(publicPath);
    const canonical = scope.scoped ? scope.lookupPath : stripSearchAndHash(publicPath);

    return isBlockedPath(canonical)
      ? DEFAULT_ROUTE
      : normalizePathname(canonical || DEFAULT_ROUTE);
  }
}

/* =========================================================
   CURRENT PATH
========================================================= */

export function getCurrentPath(_AppCore = null, Router = null) {
  if (isFunction(Router?.getCurrentPublicPath)) {
    return normalizePublicPath(Router.getCurrentPublicPath());
  }

  if (isFunction(Router?.getCurrentPath)) {
    return normalizePublicPath(Router.getCurrentPath());
  }

  return currentBrowserPath();
}

export function getCurrentPublicPath(AppCore = null, Router = null) {
  return getCurrentPath(AppCore, Router);
}

export function getCurrentCanonicalPath(AppCore = null, Router = null) {
  if (isFunction(Router?.getCurrentCanonicalPath)) {
    return normalizeCanonicalPath(Router.getCurrentCanonicalPath());
  }

  return normalizeCanonicalPath(getCurrentPublicPath(AppCore, Router));
}

/* =========================================================
   SAFE INTERNAL PATH
========================================================= */

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i.test(
    String(value || "")
  );
}

export function isSafeInternalPath(value = "") {
  const path = cleanText(value, "");

  return Boolean(
    path &&
      path.startsWith("/") &&
      !path.startsWith("//") &&
      !/^[a-z][a-z0-9+.-]*:/i.test(path) &&
      !/[\r\n\t\\]/.test(path) &&
      !hasSensitiveQuery(path) &&
      !isBlockedPath(path)
  );
}

export function normalizeInternalPathTarget(
  value = DEFAULT_ROUTE,
  fallback = DEFAULT_ROUTE
) {
  const path = normalizePublicPath(value);
  return isSafeInternalPath(path) ? path : normalizePublicPath(fallback);
}

/* =========================================================
   TOKEN ROUTES
========================================================= */

function normalizeProtectedRoutePath(value = "") {
  const path = normalizeCanonicalPath(value || DEFAULT_ROUTE);
  return path && !isBlockedPath(path) ? path : "";
}

function getTokenParamNames() {
  return [TOKEN_PARAM_NAME];
}

function normalizeProtectedTokenRouteConfig(config = null, index = 0) {
  const rawPaths = Array.isArray(config?.paths)
    ? config.paths
    : [config?.path || config];

  const paths = rawPaths
    .map(normalizeProtectedRoutePath)
    .filter(Boolean);

  if (!paths.length) return null;

  const path = normalizeProtectedRoutePath(config?.path || paths[0]) || paths[0];

  return {
    key: cleanText(config?.key, `token-route-${index}`),
    path,
    paths,
    tokenParamNames: getTokenParamNames(),
  };
}

function getPublicTokenRouteConfigByPath(path = DEFAULT_ROUTE) {
  const canonical = normalizeCanonicalPath(path);
  return PUBLIC_TOKEN_ROUTE_CONFIGS.find((config) => config.paths.includes(canonical)) || null;
}

function readParamsFromSearch(search = "") {
  const normalized = normalizeSearch(search);
  return normalized ? new URLSearchParams(normalized) : new URLSearchParams();
}

function readParamsFromHash(hash = "") {
  const normalized = normalizeHash(hash);
  if (!normalized) return new URLSearchParams();

  const body = normalized.slice(1);
  const queryIndex = body.indexOf("?");

  if (queryIndex >= 0) {
    return readParamsFromSearch(`?${body.slice(queryIndex + 1)}`);
  }

  return /^[^/?#=&]+=/i.test(body)
    ? readParamsFromSearch(`?${body}`)
    : new URLSearchParams();
}

function hasTokenParam(path = "", config = null) {
  const parts = splitPath(path);
  const searchParams = readParamsFromSearch(parts.search);
  const hashParams = readParamsFromHash(parts.hash);

  return getTokenParamNames(config).some((name) => (
    Boolean(
      cleanText(searchParams.get(name), "") ||
        cleanText(hashParams.get(name), "")
    )
  ));
}

function normalizeParamName(name = "") {
  return cleanText(name, "").toLowerCase().replace(/[_\-. \s]/g, "");
}

export function isSensitiveParamName(name = "") {
  const clean = normalizeParamName(name);
  return SENSITIVE_PARAM_NAMES.some((item) => normalizeParamName(item) === clean);
}

export function getSensitiveParamNames() {
  return [...SENSITIVE_PARAM_NAMES];
}

export function redactTokenInText(value = "") {
  let output = String(value || "");

  for (const name of SENSITIVE_PARAM_NAMES) {
    const param = escapeRegExp(name);
    output = output.replace(new RegExp(`([?&#]${param}=)([^&#\\s]+)`, "gi"), "$1***");
  }

  return output
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

export function isProtectedPublicTokenPath(path = currentBrowserPath()) {
  const publicPath = normalizePublicPath(path);
  const config = getPublicTokenRouteConfigByPath(publicPath);

  return Boolean(config && hasTokenParam(publicPath, config));
}

export function resolveProtectedInitialContext(path = currentBrowserPath()) {
  const publicPath = normalizePublicPath(path);
  const config = getPublicTokenRouteConfigByPath(publicPath);
  const hasToken = Boolean(config && hasTokenParam(publicPath, config));

  return {
    key: hasToken ? config.key : "",
    path: hasToken ? publicPath : "",
    publicPath: hasToken ? publicPath : "",
    canonicalPath: hasToken ? normalizeCanonicalPath(config.path || publicPath) : "",
    hasToken,
    redactedPath: hasToken ? redactTokenInText(publicPath) : "",
  };
}

export function getProtectedInitialPublicPath(path = currentBrowserPath()) {
  const context = resolveProtectedInitialContext(path);
  return context.hasToken ? context.publicPath : "";
}

/* =========================================================
   PUBLIC ROUTE HELPERS
========================================================= */

export function isActivationPath(path = currentBrowserPath()) {
  return Boolean(ACTIVATION_ROUTE && normalizeCanonicalPath(path) === ACTIVATION_ROUTE);
}

export function isPasswordResetPath(path = currentBrowserPath()) {
  return Boolean(PASSWORD_RESET_ROUTE && normalizeCanonicalPath(path) === PASSWORD_RESET_ROUTE);
}

export function isUserHomePath(path = currentBrowserPath()) {
  try {
    return configIsUserHomeRoute(path) === true;
  } catch {
    return getUserScopedRouteInfo(path).home === true;
  }
}

export function isUserScopedPath(path = currentBrowserPath()) {
  try {
    return configIsUserScopedRoute(path) === true;
  } catch {
    return getUserScopedRouteInfo(path).scoped === true;
  }
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHelpersSnapshot(AppCore = null, Router = null) {
  const publicPath = getCurrentPublicPath(AppCore, Router);
  const protectedInitial = resolveProtectedInitialContext(publicPath);
  const userScope = getUserScopedRouteInfo(publicPath);

  return {
    version: HELPERS_VERSION,

    publicPath: redactTokenInText(publicPath),
    canonicalPath: redactTokenInText(getCurrentCanonicalPath(AppCore, Router)),

    protectedInitial: {
      key: protectedInitial.key,
      canonicalPath: protectedInitial.canonicalPath,
      hasToken: protectedInitial.hasToken,
      redactedPath: protectedInitial.redactedPath,
    },

    userScope: {
      userHomePrefix: USER_HOME_PREFIX,
      userHomePath: isUserHomePath(publicPath),
      userScopedPath: isUserScopedPath(publicPath),
      publicSlug: userScope.slug || null,
    },

    tokens: {
      tokenParam: TOKEN_PARAM_NAME,
      sensitiveParamNames: getSensitiveParamNames(),
      protectedPublicTokenRoutes: PUBLIC_TOKEN_ROUTE_CONFIGS.map((config) => ({
        key: config.key,
        path: config.path,
        paths: [...config.paths],
        tokenParamNames: [...config.tokenParamNames],
      })),
    },

    policy: {
      helpersOnly: true,
      configOwnsRoutes: true,
      configOwnsUserScope: true,
      configOwnsBlockedRoutes: true,
      configOwnsProtectedTokenRoutes: true,
      preservesQueryAndHash: true,
      tokenFlowDetectionOnly: true,
      noAuth: true,
      noRouterReal: true,
      noFetch: true,
      noStorage: true,
      noHistoryComplex: true,
      noNavigation: true,
      noInventedRoutes: true,
      snapshotRedacted: true,
    },
  };
}

export default {
  HELPERS_VERSION,

  getCurrentPath,
  getCurrentPublicPath,
  getCurrentCanonicalPath,

  normalizePublicPath,
  normalizeCanonicalPath,
  stripUsernamePrefix,
  stripSearchAndHash,
  getSearchAndHash,

  isSafeInternalPath,
  normalizeInternalPathTarget,

  isActivationPath,
  isPasswordResetPath,
  isUserHomePath,
  isUserScopedPath,

  isProtectedPublicTokenPath,
  getProtectedInitialPublicPath,
  resolveProtectedInitialContext,

  isSensitiveParamName,
  getSensitiveParamNames,
  redactTokenInText,

  getHelpersSnapshot,
};
