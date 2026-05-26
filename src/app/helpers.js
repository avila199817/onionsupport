/* =========================================================
   Onion Support - App Helpers
   Archivo: /src/app/helpers.js

   Responsabilidad:
   - Helpers mínimos de path.
   - Compat básica.
   - Delegar rutas, user-scope, bloqueos y token routes en core/config.js.
   - Sólo token param canónico desde core/config.js.
   - Sólo rutas públicas técnicas definidas en core/config.js.
   - Preservar query/hash cuando toca, especialmente rutas públicas con token.
   - Sin Auth.
   - Sin Router real.
   - Sin fetch.
   - Sin storage.
   - Sin history complejo.
   - Sin rutas inventadas.
   - Sin navegación paralela.
========================================================= */

import {
  ROUTES,
  TOKEN_PARAM,
  PROTECTED_PUBLIC_TOKEN_ROUTES,
  BLOCKED_FRONTEND_ROUTES,
  USER_HOME_PREFIX as CONFIG_USER_HOME_PREFIX,
  canonicalRoutePath as configCanonicalRoutePath,
  getUserScopedRouteInfo as getConfigUserScopedRouteInfo,
  isBlockedRoutePath as configIsBlockedRoutePath,
  isUserHomeRoute as configIsUserHomeRoute,
  isUserScopedRoute as configIsUserScopedRoute,
  normalizeRoutePath as configNormalizeRoutePath,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../core/config.js";

export const HELPERS_VERSION = "app.helpers.v5";

const CORE_ROUTES = ROUTES && typeof ROUTES === "object" ? ROUTES : {};

const DEFAULT_ROUTE = "/";
const USER_HOME_PREFIX = cleanText(CONFIG_USER_HOME_PREFIX, "/@");
const TOKEN_PARAM_NAME = cleanText(TOKEN_PARAM, "token");

const BLOCKED_ROUTE_PATHS = new Set(
  (
    Array.isArray(BLOCKED_FRONTEND_ROUTES) && BLOCKED_FRONTEND_ROUTES.length
      ? BLOCKED_FRONTEND_ROUTES
      : [
          "/home",
          "/403",
          "/404",
          "/2fa",
          "/mfa",
          "/otp",
        ]
  )
    .map(normalizePathForSet)
    .filter(Boolean)
);

const ACTIVATION_ROUTE = safeConfigRoute(
  CORE_ROUTES.activateAccount || "/activate-account",
  "/activate-account"
);

const PASSWORD_RESET_ROUTE = safeConfigRoute(
  CORE_ROUTES.passwordReset || "/password-reset",
  "/password-reset"
);

const SENSITIVE_PARAM_NAMES = Object.freeze(
  unique([
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
  ]).map((name) => name.toLowerCase())
);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
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

function escapeRegExp(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function normalizePathForSet(path = DEFAULT_ROUTE) {
  let value = cleanText(path, DEFAULT_ROUTE)
    .split("#")[0]
    .split("?")[0]
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || DEFAULT_ROUTE;
  }

  return value || DEFAULT_ROUTE;
}

/* =========================================================
   PATH PARSING
========================================================= */

function fallbackPathFromInput(value = DEFAULT_ROUTE) {
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

      if (url.origin !== base) return DEFAULT_ROUTE;

      return `${url.pathname || DEFAULT_ROUTE}${url.search || ""}${url.hash || ""}`;
    } catch {
      return DEFAULT_ROUTE;
    }
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return DEFAULT_ROUTE;
  }

  if (/[\r\n\t\\]/.test(raw)) {
    return DEFAULT_ROUTE;
  }

  return raw;
}

function pathFromInput(value = DEFAULT_ROUTE) {
  try {
    return configRoutePathFromUrlLike(value) || DEFAULT_ROUTE;
  } catch {
    return fallbackPathFromInput(value);
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

  const normalizedSearch = normalizeSearch(search);
  const normalizedHash = normalizeHash(hash);

  return {
    pathname: normalizePathname(pathname),
    search: normalizedSearch,
    hash: normalizedHash,
    suffix: `${normalizedSearch}${normalizedHash}`,
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
    if (configIsBlockedRoutePath(path) === true) return true;
  } catch {
    // fallback local
  }

  const clean = normalizePathname(path).toLowerCase();

  if (BLOCKED_ROUTE_PATHS.has(clean)) return true;

  return (
    clean.startsWith("/2fa/") ||
    clean.startsWith("/mfa/") ||
    clean.startsWith("/otp/")
  );
}

function safeConfigRoute(path = "", fallback = DEFAULT_ROUTE) {
  const clean = normalizePathname(path || fallback || DEFAULT_ROUTE);

  return isBlockedPath(clean)
    ? normalizePathname(fallback || DEFAULT_ROUTE)
    : clean;
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

  if (!slug) return "";

  return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
}

export function getUserScopedRouteInfo(path = DEFAULT_ROUTE) {
  try {
    const info = getConfigUserScopedRouteInfo(path);

    if (isObject(info)) {
      const restPath = normalizePathname(
        info.restPath || info.canonicalPath || splitPath(path).pathname
      );

      const lookupPath = normalizePathname(
        info.canonicalPath || info.lookupPath || restPath
      );

      return {
        scoped: Boolean(info.scoped),
        home: Boolean(info.home),
        slug: normalizeUserSlug(info.slug || ""),
        restPath,
        lookupPath,
      };
    }
  } catch {
    // fallback local
  }

  const pathname = splitPath(path).pathname;

  if (!pathname.startsWith(USER_HOME_PREFIX)) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: pathname,
      lookupPath: pathname,
    };
  }

  const rest = pathname.slice(USER_HOME_PREFIX.length);
  const [slugSegment = "", ...restSegments] = rest.split("/");
  const slug = normalizeUserSlug(slugSegment);

  if (!slug) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: pathname,
      lookupPath: pathname,
    };
  }

  const restPath = restSegments.length
    ? normalizePathname(`/${restSegments.join("/")}`)
    : DEFAULT_ROUTE;

  return {
    scoped: true,
    home: restPath === DEFAULT_ROUTE,
    slug,
    restPath,
    lookupPath: restPath,
  };
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
  const scoped = getUserScopedRouteInfo(publicPath);

  if (scoped.scoped && scoped.restPath) {
    return normalizePublicPath(`${scoped.restPath}${parts.suffix}`);
  }

  return publicPath;
}

export function normalizeCanonicalPath(path = DEFAULT_ROUTE) {
  const publicPath = normalizePublicPath(path);

  if (isBlockedPath(publicPath)) return DEFAULT_ROUTE;

  try {
    const canonical = configCanonicalRoutePath(publicPath) || DEFAULT_ROUTE;
    return isBlockedPath(canonical) ? DEFAULT_ROUTE : normalizePathname(canonical);
  } catch {
    const scoped = getUserScopedRouteInfo(publicPath);
    const canonical = scoped.scoped
      ? scoped.lookupPath
      : stripSearchAndHash(publicPath);

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

  return browserPath();
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

function getTokenParamNames(_config = null) {
  return [TOKEN_PARAM_NAME];
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

function readParamsFromSearch(search = "") {
  const normalized = normalizeSearch(search);

  if (!normalized) return new URLSearchParams();

  try {
    return new URLSearchParams(normalized);
  } catch {
    return new URLSearchParams();
  }
}

function readParamsFromHash(hash = "") {
  const normalized = normalizeHash(hash);

  if (!normalized) return new URLSearchParams();

  const body = normalized.slice(1);
  const queryIndex = body.indexOf("?");

  if (queryIndex >= 0) {
    return readParamsFromSearch(`?${body.slice(queryIndex + 1)}`);
  }

  if (/^[^/?#=&]+=/i.test(body)) {
    return readParamsFromSearch(`?${body}`);
  }

  return new URLSearchParams();
}

function hasTokenParam(path = "", config = null) {
  const parts = splitPath(path);
  const names = getTokenParamNames(config);
  const searchParams = readParamsFromSearch(parts.search);
  const hashParams = readParamsFromHash(parts.hash);

  return names.some((name) => {
    return Boolean(
      cleanText(searchParams.get(name), "") ||
        cleanText(hashParams.get(name), "")
    );
  });
}

export function isSensitiveParamName(name = "") {
  return SENSITIVE_PARAM_NAMES.includes(
    cleanText(name, "").toLowerCase()
  );
}

export function getSensitiveParamNames() {
  return [...SENSITIVE_PARAM_NAMES];
}

export function redactTokenInText(value = "") {
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

  output = output.replace(
    /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    "***"
  );

  return output;
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
    return Boolean(getUserScopedRouteInfo(path).home);
  }
}

export function isUserScopedPath(path = browserPath()) {
  try {
    return configIsUserScopedRoute(path) === true;
  } catch {
    return Boolean(getUserScopedRouteInfo(path).scoped);
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
      publicSlug: getUserScopedRouteInfo(publicPath).slug || null,
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

      internalHomeIsRoot: true,
      visibleHomeOwnedByRouter: true,
      visibleHomePattern: `${USER_HOME_PREFIX}{slug}`,

      preservesQueryAndHash: true,
      tokenFlowDetectionOnly: true,

      noAuth: true,
      noRouterReal: true,
      noFetch: true,
      noStorage: true,
      noHistoryComplex: true,
      noNavigation: true,
      noInventedRoutes: true,
      noHomeRoute: true,

      tokenParam: TOKEN_PARAM_NAME,
      protectedPublicTokenRoutesFromConfig: true,
      canonicalTokenParamOnly: true,
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
