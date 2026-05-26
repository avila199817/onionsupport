/* =========================================================
   Onion Support - Router History
   Archivo: /src/router/history.js

   Responsabilidad:
   - Historial SPA mínimo.
   - pushState / replaceState / back.
   - Estado inicial seguro.
   - publicPath conserva query/hash seguros.
   - canonicalPath limpio.
   - /@{user.slug} conserva URL pública pero canonicaliza a /.
   - /@{user.slug}/{ruta} conserva URL pública pero canonicaliza a /{ruta}.
   - Delegar normalización de rutas/user-scope/bloqueos en core/config.js.
   - No escribir /home, /403, /404, /2fa, /mfa, /otp en history.
   - Scrub explícito del TOKEN_PARAM en rutas públicas protegidas.
   - No guardar access_token/refresh_token/id_token/secret/session en URL normalizada.
   - Constantes base desde core/config.js.
   - Snapshots redacted.
   - Sin Auth.
   - Sin guards.
   - Sin render.
   - Sin storage.
   - Sin Toast.
   - Sin eventos propios.
   - Sin alias /home.
   - Sin rutas legacy.
   - Sin 2FA/MFA/OTP.
========================================================= */

import {
  PROTECTED_PUBLIC_TOKEN_ROUTES,
  TOKEN_PARAM,
  USER_HOME_PREFIX as CONFIG_USER_HOME_PREFIX,
  canonicalRoutePath as configCanonicalRoutePath,
  getUserScopedRouteInfo as getConfigUserScopedRouteInfo,
  isBlockedRoutePath as configIsBlockedRoutePath,
  isUserHomeRoute as configIsUserHomeRoute,
  isUserScopedRoute as configIsUserScopedRoute,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../core/config.js";

export const ROUTER_HISTORY_VERSION = "router.history.v9";

const HISTORY_STATE_VERSION = 1;
const DEFAULT_ROUTE = "/";
const USER_HOME_PREFIX = CONFIG_USER_HOME_PREFIX || "/@";
const TOKEN_PARAM_NAME = TOKEN_PARAM || "token";

const SENSITIVE_QUERY_KEYS = new Set([
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
]);

const TOKEN_ROUTES = new Set(
  (Array.isArray(PROTECTED_PUBLIC_TOKEN_ROUTES) ? PROTECTED_PUBLIC_TOKEN_ROUTES : [])
    .flatMap((item) => Array.isArray(item?.paths) ? item.paths : [item?.path || item])
    .map(normalizeTokenRoutePath)
    .filter(Boolean)
);

let sequence = 0;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function canUseHistory() {
  return Boolean(
    isBrowser() &&
      window.history &&
      typeof window.history.pushState === "function" &&
      typeof window.history.replaceState === "function"
  );
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

function nowMs() {
  return Date.now();
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function nextHistoryId() {
  sequence += 1;
  return `hist_${nowMs()}_${sequence}`;
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

/* =========================================================
   PATHS
========================================================= */

function pathFromInput(path = DEFAULT_ROUTE) {
  try {
    return configRoutePathFromUrlLike(path) || DEFAULT_ROUTE;
  } catch {
    return DEFAULT_ROUTE;
  }
}

function normalizePathname(pathname = DEFAULT_ROUTE) {
  try {
    return configNormalizeRoutePath(pathname) || DEFAULT_ROUTE;
  } catch {
    let value = cleanText(pathname, DEFAULT_ROUTE).replace(/\\/g, "/");

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    value = value.replace(/\/{2,}/g, "/");

    if (value.length > 1) {
      value = value.replace(/\/+$/g, "") || DEFAULT_ROUTE;
    }

    return value || DEFAULT_ROUTE;
  }
}

function isBlockedPathname(pathname = DEFAULT_ROUTE) {
  try {
    return configIsBlockedRoutePath(pathname) === true;
  } catch {
    return false;
  }
}

function normalizeTokenRoutePath(value = "") {
  const clean = normalizePathname(
    cleanText(value, DEFAULT_ROUTE)
      .split("#")[0]
      .split("?")[0]
  );

  if (isBlockedPathname(clean)) return "";

  return clean || DEFAULT_ROUTE;
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

function splitPath(path = DEFAULT_ROUTE) {
  let raw = pathFromInput(path);
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
  };
}

function pathnameIsTokenRoute(pathname = DEFAULT_ROUTE) {
  return TOKEN_ROUTES.has(normalizeTokenRoutePath(pathname));
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i.test(
    String(value || "")
  );
}

function shouldKeepQueryKey(key = "", pathname = DEFAULT_ROUTE) {
  const lower = cleanText(key, "").toLowerCase();

  if (!lower) return false;

  if (lower === TOKEN_PARAM_NAME.toLowerCase()) {
    return pathnameIsTokenRoute(pathname);
  }

  if (SENSITIVE_QUERY_KEYS.has(lower)) {
    return false;
  }

  return true;
}

function sanitizeSearchForPath(pathname = DEFAULT_ROUTE, search = "") {
  const normalized = normalizeSearch(search);

  if (!normalized) return "";

  try {
    const params = new URLSearchParams(normalized);

    for (const key of [...params.keys()]) {
      if (!shouldKeepQueryKey(key, pathname)) {
        params.delete(key);
      }
    }

    const output = params.toString();

    return output ? `?${output}` : "";
  } catch {
    return "";
  }
}

function sanitizeHashForPath(pathname = DEFAULT_ROUTE, hash = "") {
  const normalized = normalizeHash(hash);

  if (!normalized) return "";

  const body = normalized.slice(1);

  if (!body || /[\r\n\t\\]/.test(body)) return "";

  const queryIndex = body.indexOf("?");

  if (queryIndex >= 0) {
    const hashPath = body.slice(0, queryIndex);
    const hashQuery = body.slice(queryIndex + 1);
    const cleanQuery = sanitizeSearchForPath(pathname, `?${hashQuery}`);

    return cleanQuery ? `#${hashPath}${cleanQuery}` : `#${hashPath}`;
  }

  if (/^[^/?#=&]+=/i.test(body)) {
    const cleanQuery = sanitizeSearchForPath(pathname, `?${body}`);
    return cleanQuery ? `#${cleanQuery.slice(1)}` : "";
  }

  if (hasSensitiveQuery(normalized)) return "";

  return normalized;
}

function joinPath(parts = {}) {
  return [
    normalizePathname(parts.pathname || DEFAULT_ROUTE),
    normalizeSearch(parts.search || ""),
    normalizeHash(parts.hash || ""),
  ].join("");
}

export function normalizePublicPath(path = DEFAULT_ROUTE) {
  const parts = splitPath(path);
  const canonical = normalizeCanonicalPath(parts.pathname);

  if (isBlockedPathname(parts.pathname) || isBlockedPathname(canonical)) {
    return DEFAULT_ROUTE;
  }

  return joinPath({
    pathname: parts.pathname,
    search: sanitizeSearchForPath(parts.pathname, parts.search),
    hash: sanitizeHashForPath(parts.pathname, parts.hash),
  });
}

function normalizeUserSlug(value = "") {
  try {
    return configNormalizeUserSlug(value) || "";
  } catch {
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
    // fallback abajo
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

export function extractSlugFromPath(path = DEFAULT_ROUTE) {
  return getUserScopedRouteInfo(path).slug;
}

export function isUserHomePath(path = DEFAULT_ROUTE) {
  try {
    return configIsUserHomeRoute(path) === true;
  } catch {
    return Boolean(getUserScopedRouteInfo(path).home);
  }
}

export function isUserScopedPath(path = DEFAULT_ROUTE) {
  try {
    return configIsUserScopedRoute(path) === true;
  } catch {
    return Boolean(getUserScopedRouteInfo(path).scoped);
  }
}

export function normalizeCanonicalPath(path = DEFAULT_ROUTE) {
  const pathname = splitPath(path).pathname;

  if (isBlockedPathname(pathname)) {
    return DEFAULT_ROUTE;
  }

  try {
    const fromConfig = normalizePathname(
      configCanonicalRoutePath(path) || DEFAULT_ROUTE
    );

    return isBlockedPathname(fromConfig) ? DEFAULT_ROUTE : fromConfig;
  } catch {
    const scoped = getUserScopedRouteInfo(pathname);
    const canonical = scoped.scoped ? scoped.lookupPath : pathname;

    return isBlockedPathname(canonical) ? DEFAULT_ROUTE : canonical;
  }
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
   STATE
========================================================= */

function cleanRouteParams(params = {}) {
  if (!isObject(params)) return {};

  const output = {};

  for (const [key, value] of Object.entries(params)) {
    const cleanKey = cleanText(key, "");

    if (!cleanKey) continue;

    const lowerKey = cleanKey.toLowerCase();

    if (
      lowerKey === TOKEN_PARAM_NAME.toLowerCase() ||
      SENSITIVE_QUERY_KEYS.has(lowerKey)
    ) {
      output[cleanKey] = "***";
      continue;
    }

    output[cleanKey] = typeof value === "string" ? redact(value) : value;
  }

  return output;
}

export function createHistoryState({
  AppCore = null,
  pathname = DEFAULT_ROUTE,
  extras = {},
} = {}) {
  void AppCore;

  const extra = isObject(extras) ? extras : {};
  const publicPath = normalizePublicPath(extra.publicPath || pathname || DEFAULT_ROUTE);
  const canonicalPath = normalizeCanonicalPath(extra.canonicalPath || publicPath);
  const scoped = getUserScopedRouteInfo(publicPath);

  return {
    __onionRouterHistory: true,
    version: HISTORY_STATE_VERSION,

    id: extra.id || nextHistoryId(),
    ts: extra.ts || nowMs(),
    at: extra.at || nowIso(),

    path: publicPath,
    publicPath,

    canonicalPath,
    route: canonicalPath,

    routeParams: {
      ...cleanRouteParams(extra.routeParams),
      ...(scoped.slug ? { slug: scoped.slug } : {}),
    },

    publicSlug: scoped.slug || null,
    isUserHomePath: Boolean(scoped.home),
    isUserScopedPath: Boolean(scoped.scoped),
    userScopedRestPath: scoped.scoped ? scoped.restPath : null,

    source: cleanText(extra.source, null),
    mode: cleanText(extra.mode, null),

    title: cleanText(extra.title, null),
    stateSource: "router.history",
  };
}

function currentHistoryState() {
  if (!canUseHistory()) return null;

  try {
    return window.history.state || null;
  } catch {
    return null;
  }
}

function sameLocation(left = null, right = null) {
  if (!left || !right) return false;

  return (
    left.publicPath === right.publicPath &&
    left.canonicalPath === right.canonicalPath
  );
}

function writeHistory(_AppCore, method = "replaceState", state = null, url = DEFAULT_ROUTE) {
  void _AppCore;

  if (!canUseHistory()) return false;
  if (method !== "pushState" && method !== "replaceState") return false;

  const finalUrl = normalizePublicPath(url || DEFAULT_ROUTE);
  const finalCanonical = normalizeCanonicalPath(finalUrl);

  if (
    isBlockedPathname(splitPath(finalUrl).pathname) ||
    isBlockedPathname(finalCanonical)
  ) {
    return false;
  }

  try {
    window.history[method](state, "", finalUrl);
    return true;
  } catch {
    return false;
  }
}

function buildHistoryWrite({
  pathname = DEFAULT_ROUTE,
  options = {},
  mode = "replace",
} = {}) {
  const opts = isObject(options) ? options : {};
  const publicPath = normalizePublicPath(opts.publicPath || pathname);

  const state = createHistoryState({
    pathname: publicPath,
    extras: {
      ...opts,
      mode: opts.mode || mode,
      publicPath,
      canonicalPath: opts.canonicalPath || normalizeCanonicalPath(publicPath),
      source: opts.source || null,
    },
  });

  return {
    opts,
    publicPath,
    state,
  };
}

function commitHistory({
  AppCore = null,
  method = "replaceState",
  pathname = DEFAULT_ROUTE,
  options = {},
} = {}) {
  if (!canUseHistory()) return false;

  const mode = method === "pushState" ? "push" : "replace";
  const { opts, publicPath, state } = buildHistoryWrite({
    pathname,
    options,
    mode,
  });

  if (opts.skipHistory === true) return false;

  if (
    isBlockedPathname(splitPath(publicPath).pathname) ||
    isBlockedPathname(state.canonicalPath)
  ) {
    return false;
  }

  if (sameLocation(currentHistoryState(), state) && opts.forceHistory !== true) {
    return false;
  }

  return writeHistory(AppCore, method, state, publicPath);
}

/* =========================================================
   WRITE API
========================================================= */

export function pushState({
  AppCore = null,
  pathname = DEFAULT_ROUTE,
  options = {},
} = {}) {
  return commitHistory({
    AppCore,
    method: "pushState",
    pathname,
    options,
  });
}

export function replaceState({
  AppCore = null,
  pathname = DEFAULT_ROUTE,
  options = {},
} = {}) {
  return commitHistory({
    AppCore,
    method: "replaceState",
    pathname,
    options,
  });
}

export function updateHistory({
  AppCore = null,
  pathname = DEFAULT_ROUTE,
  options = {},
} = {}) {
  if (!canUseHistory()) return false;

  const opts = isObject(options) ? options : {};

  if (opts.skipHistory === true) return false;

  const publicPath = normalizePublicPath(opts.publicPath || pathname);
  const currentUrl = normalizePublicPath(browserPath());

  const method =
    opts.replaceState === true || publicPath === currentUrl
      ? "replaceState"
      : "pushState";

  return commitHistory({
    AppCore,
    method,
    pathname: publicPath,
    options: opts,
  });
}

/* =========================================================
   INITIAL STATE
========================================================= */

export function ensureInitialHistoryState({ AppCore = null } = {}) {
  if (!canUseHistory()) return false;

  const current = currentHistoryState();

  if (current?.__onionRouterHistory === true) {
    return true;
  }

  const publicPath = browserPath();

  return commitHistory({
    AppCore,
    method: "replaceState",
    pathname: publicPath,
    options: {
      mode: "initial",
      publicPath,
      canonicalPath: normalizeCanonicalPath(publicPath),
      source: "initial",
      forceHistory: true,
    },
  });
}

/* =========================================================
   TOKEN SCRUB
========================================================= */

function isTokenRoute(path = "") {
  return TOKEN_ROUTES.has(normalizeCanonicalPath(path));
}

function removeTokenFromSearch(search = "") {
  const normalized = normalizeSearch(search);

  if (!normalized) return "";

  try {
    const params = new URLSearchParams(normalized);
    const target = TOKEN_PARAM_NAME.toLowerCase();

    for (const key of [...params.keys()]) {
      if (key.toLowerCase() === target) {
        params.delete(key);
      }
    }

    const output = params.toString();

    return output ? `?${output}` : "";
  } catch {
    return "";
  }
}

function removeTokenFromHash(hash = "") {
  const normalized = normalizeHash(hash);

  if (!normalized) return "";

  const body = normalized.slice(1);
  const queryIndex = body.indexOf("?");

  if (queryIndex >= 0) {
    const hashPath = body.slice(0, queryIndex);
    const query = body.slice(queryIndex + 1);
    const cleanQuery = removeTokenFromSearch(`?${query}`);

    return cleanQuery ? `#${hashPath}${cleanQuery}` : `#${hashPath}`;
  }

  if (/^[^/?#=&]+=/i.test(body)) {
    const cleanQuery = removeTokenFromSearch(`?${body}`);
    return cleanQuery ? `#${cleanQuery.slice(1)}` : "";
  }

  return normalized;
}

export function buildScrubbedProtectedUrl(_AppCore = null, url = "") {
  void _AppCore;

  const original = normalizePublicPath(url || browserPath());
  const parts = splitPath(original);

  if (!isTokenRoute(parts.pathname)) {
    return original;
  }

  return normalizePublicPath(
    joinPath({
      pathname: parts.pathname,
      search: removeTokenFromSearch(parts.search),
      hash: removeTokenFromHash(parts.hash),
    })
  );
}

export function scrubProtectedTokenFromHistory({
  AppCore = null,
  url = "",
  reason = "token-scrub",
  replace = true,
  extraState = {},
} = {}) {
  if (!canUseHistory()) return false;

  const original = normalizePublicPath(url || browserPath());
  const parts = splitPath(original);

  if (!isTokenRoute(parts.pathname)) return false;

  const scrubbed = buildScrubbedProtectedUrl(AppCore, original);

  if (scrubbed === original) return false;

  return commitHistory({
    AppCore,
    method: replace ? "replaceState" : "pushState",
    pathname: scrubbed,
    options: {
      ...(isObject(extraState) ? extraState : {}),
      mode: "scrub",
      source: reason,
      publicPath: scrubbed,
      canonicalPath: normalizeCanonicalPath(scrubbed),
      tokenScrubbed: true,
      tokenScrubbedAt: nowIso(),
      forceHistory: true,
    },
  });
}

/* =========================================================
   NAVIGATION
========================================================= */

export function back() {
  if (!canUseHistory()) return false;

  try {
    window.history.back();
    return true;
  } catch {
    return false;
  }
}

export function getPopStatePath(_AppCore = null, eventOrState = null) {
  void _AppCore;

  const state = eventOrState?.state || eventOrState || currentHistoryState() || {};
  const fromState = cleanText(state.publicPath || state.path || "", "");

  return normalizePublicPath(fromState || browserPath());
}

/* =========================================================
   SNAPSHOT
========================================================= */

function serializeState(state = null) {
  if (!isObject(state)) return null;

  return {
    __onionRouterHistory: state.__onionRouterHistory === true,
    version: state.version || null,

    id: state.id || null,
    ts: state.ts || null,
    at: state.at || null,

    path: redact(state.path || ""),
    publicPath: redact(state.publicPath || ""),

    canonicalPath: redact(state.canonicalPath || ""),
    route: redact(state.route || ""),

    routeParams: cleanRouteParams(state.routeParams),

    publicSlug: state.publicSlug || null,
    isUserHomePath: state.isUserHomePath === true,
    isUserScopedPath: state.isUserScopedPath === true,
    userScopedRestPath: state.userScopedRestPath || null,

    source: state.source || null,
    mode: state.mode || null,

    title: state.title || null,
    stateSource: state.stateSource || null,
  };
}

export function getHistorySnapshot(AppCore = null) {
  const currentUrl = browserPath();
  const publicPath = normalizePublicPath(currentUrl);
  const canonicalPath = normalizeCanonicalPath(publicPath);
  const scoped = getUserScopedRouteInfo(publicPath);

  return {
    version: ROUTER_HISTORY_VERSION,

    canUseHistory: canUseHistory(),
    historyStateVersion: HISTORY_STATE_VERSION,

    browserPublicUrl: redact(currentUrl),
    currentCanonicalPath: redact(canonicalPath),
    currentPublicPath: redact(publicPath),

    isUserHomePath: isUserHomePath(publicPath),
    isUserScopedPath: isUserScopedPath(publicPath),
    publicSlug: extractSlugFromPath(publicPath) || null,
    userScopedRestPath: scoped.scoped ? scoped.restPath : null,

    state: serializeState(currentHistoryState()),

    sequence,

    policy: {
      historyOnly: true,
      configOwnsPathNormalization: true,
      configOwnsUserScopeParsing: true,
      configOwnsBlockedRoutes: true,

      ownAuth: false,
      ownGuards: false,
      ownRender: false,
      ownStorage: false,
      ownToast: false,
      ownEvents: false,

      userSlugHome: true,
      userScopedPrivateRoutes: true,
      preservesUserSlugPublicUrl: true,
      canonicalizesUserHome: true,
      canonicalizesUserScopedPrivateRoutes: true,

      defaultRoute: DEFAULT_ROUTE,
      noHomeAlias: true,
      noHomeRoute: true,
      noLegacyRoutes: true,
      blocksHomeAlias: true,
      blocks403Route: true,
      blocks404Route: true,

      no2fa: true,
      noMfa: true,
      noOtp: true,

      tokenParam: TOKEN_PARAM_NAME,
      tokenRoutes: [...TOKEN_ROUTES],
      tokenScrubExplicit: true,
      preservesTokenParamOnlyOnProtectedRoutes: true,
      stripsSensitiveAuthQueryKeys: true,
      stripsSensitiveAuthHashKeys: true,

      blockedRoutesDelegatedToCoreConfig: true,
      noLocalBlockedRouteList: true,

      snapshotRedacted: true,
    },

    app: {
      route: redact(AppCore?.state?.route || ""),
      publicPath: redact(AppCore?.state?.publicPath || ""),
      canonicalPath: redact(AppCore?.state?.canonicalPath || ""),
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  ROUTER_HISTORY_VERSION,

  normalizePublicPath,
  normalizeCanonicalPath,

  getUserScopedRouteInfo,
  extractSlugFromPath,
  isUserHomePath,
  isUserScopedPath,

  createHistoryState,

  pushState,
  replaceState,
  updateHistory,

  ensureInitialHistoryState,

  back,
  getPopStatePath,

  buildScrubbedProtectedUrl,
  scrubProtectedTokenFromHistory,

  getHistorySnapshot,
};
