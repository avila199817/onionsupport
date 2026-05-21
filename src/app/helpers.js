/* =========================================================
   Onion Support - App Helpers
   Archivo: /src/app/helpers.js

   Responsabilidad:
   - Helpers mínimos de path.
   - Compat básica.
   - Delegar rutas, user-scope, bloqueos y token routes en core/config.js.
   - Sólo token param canónico desde core/config.js.
   - Sólo rutas públicas técnicas definidas en core/config.js.
   - Sin Auth.
   - Sin Router real.
   - Sin fetch.
   - Sin storage.
   - Sin history complejo.
   - Sin rutas inventadas.
========================================================= */

import {
  ROUTES,
  TOKEN_PARAM,
  PROTECTED_PUBLIC_TOKEN_ROUTES,
  canonicalRoutePath as configCanonicalRoutePath,
  getUserScopedRouteInfo as getConfigUserScopedRouteInfo,
  isBlockedRoutePath as configIsBlockedRoutePath,
  isUserHomeRoute as configIsUserHomeRoute,
  isUserScopedRoute as configIsUserScopedRoute,
  normalizeRoutePath as configNormalizeRoutePath,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../core/config.js";

export const HELPERS_VERSION = "app.helpers.v3";

const DEFAULT_ROUTE = ROUTES?.home || ROUTES?.root || "/";
const TOKEN_PARAM_NAME = TOKEN_PARAM || "token";

const ACTIVATION_ROUTE = ROUTES?.activateAccount || "/activate-account";
const PASSWORD_RESET_ROUTE = ROUTES?.passwordReset || "/password-reset";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function browserPath() {
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

function pathFromInput(value = DEFAULT_ROUTE) {
  try {
    return configRoutePathFromUrlLike(value) || DEFAULT_ROUTE;
  } catch {
    return DEFAULT_ROUTE;
  }
}

function normalizePathname(value = DEFAULT_ROUTE) {
  try {
    return configNormalizeRoutePath(value) || DEFAULT_ROUTE;
  } catch {
    let path = cleanText(value, DEFAULT_ROUTE)
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

    if (!path.startsWith("/")) {
      path = `/${path}`;
    }

    if (path.length > 1) {
      path = path.replace(/\/+$/g, "") || DEFAULT_ROUTE;
    }

    return path || DEFAULT_ROUTE;
  }
}

function normalizeSearch(search = "") {
  const value = cleanText(search, "");

  if (!value || value === "?") return "";

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value = cleanText(hash, "");

  if (!value || value === "#") return "";

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function splitPath(value = DEFAULT_ROUTE) {
  let raw = pathFromInput(value);
  let pathname = raw;
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

  return {
    pathname: normalizePathname(pathname),
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
    suffix: `${normalizeSearch(search)}${normalizeHash(hash)}`,
  };
}

function joinPath(parts = {}) {
  return [
    normalizePathname(parts.pathname || DEFAULT_ROUTE),
    normalizeSearch(parts.search || ""),
    normalizeHash(parts.hash || ""),
  ].join("");
}

function isBlockedPath(path = DEFAULT_ROUTE) {
  try {
    return configIsBlockedRoutePath(path) === true;
  } catch {
    return false;
  }
}

/* =========================================================
   NORMALIZE
========================================================= */

export function normalizePublicPath(path = DEFAULT_ROUTE) {
  const parts = splitPath(path);

  if (isBlockedPath(parts.pathname)) {
    return DEFAULT_ROUTE;
  }

  return joinPath(parts);
}

export function stripSearchAndHash(path = DEFAULT_ROUTE) {
  return splitPath(normalizePublicPath(path)).pathname || DEFAULT_ROUTE;
}

export function getSearchAndHash(path = DEFAULT_ROUTE) {
  const parts = splitPath(normalizePublicPath(path));
  return `${parts.search}${parts.hash}`;
}

export function stripUsernamePrefix(path = DEFAULT_ROUTE) {
  const publicPath = normalizePublicPath(path);
  const parts = splitPath(publicPath);

  try {
    const scoped = getConfigUserScopedRouteInfo(publicPath);

    if (scoped?.scoped === true && scoped.restPath) {
      return normalizePublicPath(`${scoped.restPath}${parts.suffix}`);
    }
  } catch {
    // fallback abajo
  }

  return publicPath;
}

export function normalizeCanonicalPath(path = DEFAULT_ROUTE) {
  if (isBlockedPath(path)) return DEFAULT_ROUTE;

  try {
    return configCanonicalRoutePath(path) || DEFAULT_ROUTE;
  } catch {
    return stripSearchAndHash(stripUsernamePrefix(path)) || DEFAULT_ROUTE;
  }
}

/* =========================================================
   CURRENT PATH
========================================================= */

export function getCurrentPath(_AppCore = null, Router = null) {
  if (typeof Router?.getCurrentPublicPath === "function") {
    return normalizePublicPath(Router.getCurrentPublicPath());
  }

  if (typeof Router?.getCurrentPath === "function") {
    return normalizePublicPath(Router.getCurrentPath());
  }

  return browserPath();
}

export function getCurrentPublicPath(AppCore = null, Router = null) {
  return getCurrentPath(AppCore, Router);
}

export function getCurrentCanonicalPath(AppCore = null, Router = null) {
  if (typeof Router?.getCurrentCanonicalPath === "function") {
    return normalizeCanonicalPath(Router.getCurrentCanonicalPath());
  }

  return normalizeCanonicalPath(getCurrentPublicPath(AppCore, Router));
}

/* =========================================================
   SAFE INTERNAL PATH
========================================================= */

export function isSafeInternalPath(value = "") {
  const path = cleanText(value, "");

  return Boolean(
    path &&
      path.startsWith("/") &&
      !path.startsWith("//") &&
      !/^[a-z][a-z0-9+.-]*:/i.test(path) &&
      !/[\r\n\t\\]/.test(path) &&
      !isBlockedPath(path)
  );
}

export function normalizeInternalPathTarget(
  value = DEFAULT_ROUTE,
  fallback = DEFAULT_ROUTE
) {
  const path = normalizePublicPath(value);

  return isSafeInternalPath(path)
    ? path
    : normalizePublicPath(fallback);
}

/* =========================================================
   TOKEN ROUTES
========================================================= */

function normalizeProtectedRoutePath(value = "") {
  const path = normalizeCanonicalPath(value || DEFAULT_ROUTE);

  if (!path || isBlockedPath(path)) return "";

  return path;
}

function getTokenParamNames(config = null) {
  const names = Array.isArray(config?.tokenParamNames)
    ? config.tokenParamNames
    : [TOKEN_PARAM_NAME];

  return names
    .map((name) => cleanText(name, ""))
    .filter(Boolean);
}

function getProtectedTokenRoutePaths(config = null) {
  const rawPaths = Array.isArray(config?.paths)
    ? config.paths
    : [config?.path || config];

  return rawPaths
    .map(normalizeProtectedRoutePath)
    .filter(Boolean);
}

function normalizeProtectedTokenRouteConfig(config = null, index = 0) {
  const paths = getProtectedTokenRoutePaths(config);

  if (!paths.length) return null;

  const path = normalizeProtectedRoutePath(config?.path || paths[0]);

  return {
    key: cleanText(config?.key, `token-route-${index}`),
    path: path || paths[0],
    paths,
    tokenParamNames: getTokenParamNames(config),
  };
}

const PUBLIC_TOKEN_ROUTE_CONFIGS = Object.freeze(
  (Array.isArray(PROTECTED_PUBLIC_TOKEN_ROUTES) ? PROTECTED_PUBLIC_TOKEN_ROUTES : [])
    .map(normalizeProtectedTokenRouteConfig)
    .filter(Boolean)
);

function getPublicTokenRouteConfigByPath(path = DEFAULT_ROUTE) {
  const canonical = normalizeCanonicalPath(path);

  return PUBLIC_TOKEN_ROUTE_CONFIGS.find((config) => {
    return config.paths.includes(canonical);
  }) || null;
}

function hasTokenParam(path = "", config = null) {
  try {
    const search = splitPath(path).search;
    const params = new URLSearchParams(search);
    const names = getTokenParamNames(config);

    return names.some((name) => {
      return Boolean(cleanText(params.get(name), ""));
    });
  } catch {
    return false;
  }
}

export function isSensitiveParamName(name = "") {
  return String(name || "").toLowerCase() === TOKEN_PARAM_NAME.toLowerCase();
}

export function getSensitiveParamNames() {
  return [TOKEN_PARAM_NAME];
}

export function redactTokenInText(value = "") {
  const token = TOKEN_PARAM_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`([?&#]${token}=)([^&#\\s]+)`, "gi");

  return String(value || "").replace(pattern, "$1***");
}

export function isProtectedPublicTokenPath(path = browserPath()) {
  const publicPath = normalizePublicPath(path);
  const config = getPublicTokenRouteConfigByPath(publicPath);

  return Boolean(config && hasTokenParam(publicPath, config));
}

export function resolveProtectedInitialContext(path = browserPath()) {
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

export function getProtectedInitialPublicPath(path = browserPath()) {
  const context = resolveProtectedInitialContext(path);
  return context.hasToken ? context.publicPath : "";
}

/* =========================================================
   PUBLIC ROUTE HELPERS
========================================================= */

export function isActivationPath(path = browserPath()) {
  return normalizeCanonicalPath(path) === ACTIVATION_ROUTE;
}

export function isPasswordResetPath(path = browserPath()) {
  return normalizeCanonicalPath(path) === PASSWORD_RESET_ROUTE;
}

export function isUserHomePath(path = browserPath()) {
  try {
    return configIsUserHomeRoute(path) === true;
  } catch {
    return false;
  }
}

export function isUserScopedPath(path = browserPath()) {
  try {
    return configIsUserScopedRoute(path) === true;
  } catch {
    return false;
  }
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHelpersSnapshot(AppCore = null, Router = null) {
  const publicPath = getCurrentPublicPath(AppCore, Router);
  const protectedInitial = resolveProtectedInitialContext(publicPath);

  return {
    version: HELPERS_VERSION,

    publicPath: redactTokenInText(publicPath),
    canonicalPath: getCurrentCanonicalPath(AppCore, Router),

    protectedInitial: {
      key: protectedInitial.key,
      canonicalPath: protectedInitial.canonicalPath,
      hasToken: protectedInitial.hasToken,
      redactedPath: protectedInitial.redactedPath,
    },

    policy: {
      helpersOnly: true,
      configOwnsRoutes: true,
      configOwnsUserScope: true,
      configOwnsBlockedRoutes: true,

      noAuth: true,
      noRouterReal: true,
      noFetch: true,
      noStorage: true,
      noHistoryComplex: true,
      noInventedRoutes: true,

      tokenParam: TOKEN_PARAM_NAME,
      protectedPublicTokenRoutesFromConfig: true,
      snapshotRedacted: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

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
