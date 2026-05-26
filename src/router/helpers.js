/* =========================================================
   Onion Support - Router Helpers
   Archivo: /src/router/helpers.js

   Responsabilidad:
   - Helpers puros mínimos del Router.
   - Normalizar rutas públicas y canónicas.
   - Mantener /@{user.slug} como Home pública visible.
   - Mantener /@{user.slug}/{ruta} como ruta privada visible.
   - Canonicalizar /@{user.slug} internamente como /.
   - Canonicalizar /@{user.slug}/{ruta} internamente como /{ruta} sólo si la ruta es real.
   - Delegar rutas, token param, token routes, user-scope y bloqueos en core/config.js.
   - Rutas públicas actuales:
     /login
     /password-request
     /password-reset
     /activate-account
   - Sin Auth.
   - Sin fetch.
   - Sin storage.
   - Sin Toast.
   - Sin render.
   - Sin history real.
   - Sin username public slug.
   - Sin aliases legacy.
   - Sin rutas opcionales inventadas.
   - Sin 2FA/MFA/OTP.
========================================================= */

import {
  ROUTES,
  PUBLIC_ROUTES,
  PROTECTED_PUBLIC_TOKEN_ROUTES,
  TOKEN_PARAM as CONFIG_TOKEN_PARAM,
  USER_HOME_PREFIX as CONFIG_USER_HOME_PREFIX,
  buildUserHomeRoute as configBuildUserHomeRoute,
  canonicalRoutePath as configCanonicalRoutePath,
  getUserScopedRouteInfo as getConfigUserScopedRouteInfo,
  isBlockedRoutePath as configIsBlockedRoutePath,
  isPublicRoute as configIsPublicRoute,
  isUserHomeRoute as configIsUserHomeRoute,
  isUserScopedRoute as configIsUserScopedRoute,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../core/config.js";

export const ROUTER_HELPERS_VERSION = "router.helpers.v4.aligned-user-scope";

export const ROUTER_CONFIG = Object.freeze({
  maxRouteLength: 2048,
  maxSlugLength: 96,
  maxUsernameLength: 96,
  maxRedirectLength: 1600,
});

const CORE_ROUTES = ROUTES && typeof ROUTES === "object" ? ROUTES : {};

const HOME = "/";
const USER_HOME_PREFIX = CONFIG_USER_HOME_PREFIX || "/@";

const LOGIN = CORE_ROUTES.login || "/login";
const PASSWORD_REQUEST = CORE_ROUTES.passwordRequest || "/password-request";
const PASSWORD_RESET = CORE_ROUTES.passwordReset || "/password-reset";
const ACTIVATE_ACCOUNT = CORE_ROUTES.activateAccount || "/activate-account";

const TOKEN_PARAM = CONFIG_TOKEN_PARAM || "token";

const UNSAFE_PROTOCOL_RE = /^(javascript:|data:|vbscript:|file:)/i;
const ANY_PROTOCOL_RE = /^[a-z][a-z\d+.-]*:/i;

const FALLBACK_PUBLIC_AUTH_PATHS = Object.freeze([
  LOGIN,
  PASSWORD_REQUEST,
  PASSWORD_RESET,
  ACTIVATE_ACCOUNT,
].filter(Boolean));

const PUBLIC_AUTH_PATHS = new Set(
  (
    Array.isArray(PUBLIC_ROUTES) && PUBLIC_ROUTES.length
      ? PUBLIC_ROUTES
      : FALLBACK_PUBLIC_AUTH_PATHS
  )
    .map((path) => normalizeCanonicalPath(path))
    .filter(Boolean)
);

const TOKEN_PATHS = new Set(
  (
    Array.isArray(PROTECTED_PUBLIC_TOKEN_ROUTES) &&
    PROTECTED_PUBLIC_TOKEN_ROUTES.length
      ? PROTECTED_PUBLIC_TOKEN_ROUTES
          .flatMap((item) => Array.isArray(item?.paths) ? item.paths : [item?.path || item])
      : [PASSWORD_RESET, ACTIVATE_ACCOUNT]
  )
    .map((path) => normalizeCanonicalPath(path))
    .filter(Boolean)
);

const USER_SCOPED_CANONICAL_PATHS = new Set(
  [
    HOME,
    CORE_ROUTES.incidencias || "/incidencias",
    CORE_ROUTES.facturas || "/facturas",
    CORE_ROUTES.clientes || "/clientes",
    CORE_ROUTES.cuenta || "/cuenta",
    CORE_ROUTES.ajustes || "/ajustes",

    /*
      Opcionales reales:
      sólo entran si core/config.js las define.
    */
    CORE_ROUTES.usuarios || "",
    CORE_ROUTES.servidor || CORE_ROUTES.server || "",
  ]
    .filter(Boolean)
    .map((path) => normalizePath(path))
);

/* =========================================================
   BASICS
========================================================= */

export function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function looksLikeAppCore(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      (
        value.state ||
        value.config ||
        value.events ||
        value.modules ||
        value.dom ||
        typeof value.setState === "function"
      )
  );
}

function resolvePathArgs(first = null, second = undefined, fallback = HOME) {
  if (looksLikeAppCore(first)) {
    return {
      AppCore: first,
      path: second === undefined ? fallback : second,
    };
  }

  return {
    AppCore: null,
    path: first === undefined ? fallback : first,
  };
}

function baseOrigin() {
  return isBrowser() && window.location?.origin
    ? window.location.origin
    : "http://localhost";
}

export function normalizeRouteInput(value = HOME) {
  return text(value, HOME).slice(0, ROUTER_CONFIG.maxRouteLength) || HOME;
}

export function escapeHtml(first = "", second = undefined) {
  const value = looksLikeAppCore(first) ? second : first;

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* =========================================================
   ROUTE NAMES
========================================================= */

export function getRouteNames(AppCore = null) {
  const routes = isObject(AppCore?.config?.routes) ? AppCore.config.routes : {};

  return {
    HOME: routes.home || CORE_ROUTES.root || CORE_ROUTES.home || HOME,

    LOGIN: routes.login || LOGIN,
    PASSWORD_REQUEST: routes.passwordRequest || PASSWORD_REQUEST,
    PASSWORD_RESET: routes.passwordReset || PASSWORD_RESET,
    ACTIVATE_ACCOUNT: routes.activateAccount || ACTIVATE_ACCOUNT,

    INCIDENCIAS: routes.incidencias || CORE_ROUTES.incidencias || "/incidencias",
    FACTURAS: routes.facturas || CORE_ROUTES.facturas || "/facturas",
    CLIENTES: routes.clientes || CORE_ROUTES.clientes || "/clientes",
    CUENTA: routes.cuenta || CORE_ROUTES.cuenta || "/cuenta",
    AJUSTES: routes.ajustes || CORE_ROUTES.ajustes || "/ajustes",

    /*
      Admin opcionales:
      no se inventan. Si config no los define, quedan vacíos.
    */
    USUARIOS: routes.usuarios || CORE_ROUTES.usuarios || "",
    SERVER: routes.server || routes.servidor || CORE_ROUTES.server || CORE_ROUTES.servidor || "",
    SERVIDOR: routes.servidor || routes.server || CORE_ROUTES.servidor || CORE_ROUTES.server || "",
  };
}

/* =========================================================
   REDACTION
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactTokenInText(value = "") {
  let output = text(value, "");

  if (!output) return "";

  const sensitiveParams = [
    TOKEN_PARAM,
    "token",
    "access_token",
    "refresh_token",
    "id_token",
    "code",
    "secret",
    "session",
    "password",
    "pwd",
    "key",
    "sig",
    "signature",
    "jwt",
    "authorization",
    "reset_token",
    "activation_token",
  ];

  for (const param of sensitiveParams) {
    try {
      output = output.replace(
        new RegExp(`([?&#]${escapeRegExp(param)}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {
      // noop
    }
  }

  try {
    output = output.replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    );
  } catch {
    // noop
  }

  try {
    output = output.replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
  } catch {
    // noop
  }

  return output;
}

/* =========================================================
   PATH CORE
========================================================= */

function isHashRouterPath(value = "") {
  const raw = text(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = text(value, HOME);

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || HOME;
  }

  if (raw.startsWith("#/")) {
    return raw.slice(1) || HOME;
  }

  return raw || HOME;
}

function normalizeSearch(search = "") {
  const value = text(search, "");

  if (!value || value === "?") return "";

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value = text(hash, "");

  if (!value || value === "#") return "";

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function normalizePathname(pathname = HOME) {
  try {
    return configNormalizeRoutePath(pathname) || HOME;
  } catch {
    let value = text(pathname, HOME).replace(/\\/g, "/");

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    value = value.replace(/\/{2,}/g, "/");

    const parts = [];

    for (const part of value.split("/")) {
      if (!part || part === ".") continue;

      if (part === "..") {
        parts.pop();
      } else {
        parts.push(part);
      }
    }

    value = `/${parts.join("/")}`;

    if (value.length > 1) {
      value = value.replace(/\/+$/g, "") || HOME;
    }

    return value || HOME;
  }
}

function sameOriginUrlToPath(raw = "") {
  try {
    const url = new URL(raw, baseOrigin());

    if (url.origin !== baseOrigin()) {
      return "";
    }

    if (url.hash && isHashRouterPath(url.hash)) {
      return normalizeHashRouterPath(url.hash);
    }

    return `${url.pathname || HOME}${url.search || ""}${url.hash || ""}`;
  } catch {
    return "";
  }
}

function pathFromInput(path = HOME) {
  try {
    return configRoutePathFromUrlLike(path) || HOME;
  } catch {
    let raw = normalizeRouteInput(path);

    if (isHashRouterPath(raw)) {
      return normalizeHashRouterPath(raw);
    }

    if (raw.startsWith("//")) {
      return HOME;
    }

    if (/^https?:\/\//i.test(raw)) {
      return sameOriginUrlToPath(raw) || HOME;
    }

    if (UNSAFE_PROTOCOL_RE.test(raw)) {
      return HOME;
    }

    if (ANY_PROTOCOL_RE.test(raw)) {
      return HOME;
    }

    return raw || HOME;
  }
}

function splitRawPath(path = HOME) {
  let raw = pathFromInput(path);
  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || HOME;
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || HOME;
  }

  return {
    pathname: normalizePathname(pathname),
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
  };
}

function joinParts(parts = {}) {
  return [
    normalizePathname(parts.pathname || HOME),
    normalizeSearch(parts.search || ""),
    normalizeHash(parts.hash || ""),
  ].join("");
}

function isBlockedPath(path = HOME) {
  const raw = text(path, HOME);

  try {
    if (configIsBlockedRoutePath(raw) === true) return true;
  } catch {
    // noop
  }

  const pathname = splitRawPath(raw).pathname;

  try {
    if (configIsBlockedRoutePath(pathname) === true) return true;
  } catch {
    // noop
  }

  try {
    const scoped = getConfigUserScopedRouteInfo(pathname);

    if (scoped?.scoped && scoped?.restPath) {
      return configIsBlockedRoutePath(scoped.restPath) === true;
    }
  } catch {
    // noop
  }

  return false;
}

export function normalizePath(first = null, second = undefined) {
  const { path } = resolvePathArgs(first, second, HOME);
  const raw = normalizeRouteInput(path);

  if (raw.startsWith("#") && !isHashRouterPath(raw)) {
    return normalizeHash(raw);
  }

  const parts = splitRawPath(raw);

  if (isBlockedPath(parts.pathname)) return HOME;

  return joinParts(parts);
}

export function stripSearchAndHash(path = HOME) {
  return normalizePathname(splitRawPath(normalizePath(path)).pathname || HOME);
}

export function getSearchAndHash(path = HOME) {
  const parts = splitRawPath(normalizePath(path));
  return `${parts.search}${parts.hash}`;
}

export function pathFromUrlLike(value = "") {
  const raw = text(value, "");

  if (!raw) return "";

  if (isHashRouterPath(raw)) {
    return normalizePath(normalizeHashRouterPath(raw));
  }

  return normalizePath(raw);
}

/* =========================================================
   USER SLUG HOME
========================================================= */

export function sanitizeUserSlug(value = "") {
  try {
    return configNormalizeUserSlug(value) || "";
  } catch {
    const slug = String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/^\/+/, "")
      .replace(/^@+/, "")
      .split(/[/?#]/)[0]
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .toLowerCase()
      .slice(0, ROUTER_CONFIG.maxSlugLength);

    return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
  }
}

function userScopedInfo(path = HOME) {
  try {
    const info = getConfigUserScopedRouteInfo(path);

    if (isObject(info)) {
      const pathname = stripSearchAndHash(path);
      const restPath = normalizePathname(info.restPath || info.canonicalPath || HOME);
      const lookupPath = normalizePathname(info.lookupPath || info.canonicalPath || info.restPath || HOME);

      const routable = Object.prototype.hasOwnProperty.call(info, "routable")
        ? Boolean(info.routable)
        : USER_SCOPED_CANONICAL_PATHS.has(restPath);

      return {
        scoped: Boolean(info.scoped),
        routable,
        home: Boolean(info.home && routable),
        slug: sanitizeUserSlug(info.slug || ""),
        restPath,
        lookupPath: routable ? lookupPath : pathname,
      };
    }
  } catch {
    // fallback local abajo
  }

  const pathname = stripSearchAndHash(path);

  if (!pathname.startsWith(USER_HOME_PREFIX)) {
    return {
      scoped: false,
      routable: false,
      home: false,
      slug: "",
      restPath: pathname,
      lookupPath: pathname,
    };
  }

  const rest = pathname.slice(USER_HOME_PREFIX.length);
  const [slugSegment = "", ...segments] = rest.split("/");
  const slug = sanitizeUserSlug(slugSegment);
  const restPath = segments.length
    ? normalizePathname(`/${segments.join("/")}`)
    : HOME;

  const routable = Boolean(slug && USER_SCOPED_CANONICAL_PATHS.has(restPath));

  return {
    scoped: Boolean(slug),
    routable,
    home: Boolean(slug && routable && restPath === HOME),
    slug,
    restPath,
    lookupPath: routable ? restPath : pathname,
  };
}

export function extractUserHomeSlugFromPath(path = HOME) {
  const info = userScopedInfo(path);
  return info.home ? info.slug : "";
}

export function isUserHomePath(path = HOME) {
  try {
    return configIsUserHomeRoute(path) === true;
  } catch {
    return Boolean(extractUserHomeSlugFromPath(path));
  }
}

export function isUserScopedPath(path = HOME) {
  try {
    return configIsUserScopedRoute(path) === true;
  } catch {
    const info = userScopedInfo(path);
    return Boolean(info.scoped && info.routable);
  }
}

export function buildUserHomePath(slug = "") {
  const clean = sanitizeUserSlug(slug);

  try {
    return configBuildUserHomeRoute(clean) || HOME;
  } catch {
    return clean ? `${USER_HOME_PREFIX}${clean}` : HOME;
  }
}

function buildUserScopedPath(slug = "", canonicalPath = HOME) {
  const cleanSlug = sanitizeUserSlug(slug);
  const canonical = normalizeCanonicalPath(canonicalPath);

  if (!cleanSlug) return canonical;
  if (canonical === HOME) return buildUserHomePath(cleanSlug);

  return `${USER_HOME_PREFIX}${cleanSlug}${canonical}`;
}

function userFromState(AppCore = null) {
  const state = isObject(AppCore?.state) ? AppCore.state : {};

  return (
    state.user ||
    state.currentUser ||
    state.authUser ||
    state.sessionUser ||
    state.session?.user ||
    state.auth?.user ||
    AppCore?.user ||
    AppCore?.currentUser ||
    null
  );
}

export function getCurrentUserSlug(AppCore = null) {
  const state = isObject(AppCore?.state) ? AppCore.state : {};
  const user = userFromState(AppCore);

  return sanitizeUserSlug(
    user?.slug ||
      user?.lookup?.slug ||
      user?.profile?.slug ||
      state.userSlug ||
      state.slug ||
      ""
  );
}

/* =========================================================
   USERNAME COMPAT DISABLED
========================================================= */

export function sanitizeUsername(first = null, second = undefined) {
  const value = looksLikeAppCore(first) ? second : first;
  return sanitizeUserSlug(value);
}

export function extractUsernameFromPath(first = null, second = undefined) {
  const { path } = resolvePathArgs(first, second, HOME);
  return extractUserHomeSlugFromPath(path) || null;
}

export function getCurrentUsername(AppCore = null) {
  return getCurrentUserSlug(AppCore) || null;
}

export function getCurrentResolvedUsername(AppCore = null) {
  return getCurrentUserSlug(AppCore) || null;
}

export function stripUsernamePrefix(first = null, second = undefined) {
  const { path } = resolvePathArgs(first, second, HOME);
  return normalizeCanonicalPath(path);
}

/* =========================================================
   CANONICAL / CURRENT PATHS
========================================================= */

export function normalizeCanonicalPath(first = null, second = undefined) {
  const { path } = resolvePathArgs(first, second, HOME);

  if (isBlockedPath(path)) return HOME;

  try {
    const canonical = configCanonicalRoutePath(path) || HOME;
    return isBlockedPath(canonical) ? HOME : normalizePathname(canonical);
  } catch {
    const pathname = stripSearchAndHash(path);

    if (isBlockedPath(pathname)) return HOME;

    const scoped = userScopedInfo(pathname);

    if (scoped.scoped && scoped.routable) {
      return isBlockedPath(scoped.lookupPath) ? HOME : scoped.lookupPath;
    }

    if (scoped.scoped && !scoped.routable) {
      return pathname;
    }

    return pathname;
  }
}

function isUserScopedCanonicalPath(path = HOME) {
  const canonical = normalizeCanonicalPath(path);
  return USER_SCOPED_CANONICAL_PATHS.has(canonical);
}

export function isSameCanonicalPath(AppCore, a = HOME, b = HOME) {
  return normalizeCanonicalPath(AppCore, a) === normalizeCanonicalPath(AppCore, b);
}

export function getCurrentUrl() {
  if (!isBrowser()) return new URL("http://localhost/");

  try {
    return new URL(window.location.href);
  } catch {
    return new URL("http://localhost/");
  }
}

function browserPath() {
  if (!isBrowser()) return HOME;

  try {
    const hash = window.location.hash || "";

    if (isHashRouterPath(hash)) {
      return normalizePath(normalizeHashRouterPath(hash));
    }

    return normalizePath(
      `${window.location.pathname || HOME}${window.location.search || ""}${hash}`
    );
  } catch {
    return HOME;
  }
}

export function getCurrentPath(AppCore = null) {
  const state = isObject(AppCore?.state) ? AppCore.state : {};

  if (state.publicPath) return normalizePath(state.publicPath);
  if (state.route) return normalizePath(state.route);

  return browserPath();
}

export function getCurrentCanonicalPath(AppCore = null) {
  return normalizeCanonicalPath(AppCore, getCurrentPath(AppCore));
}

export function getCurrentPublicPath(AppCore = null) {
  return getCurrentPath(AppCore);
}

export function getResolvedPublicPath(fallback = HOME) {
  return isBrowser() ? browserPath() : normalizePath(fallback);
}

/* =========================================================
   HREF SAFETY
========================================================= */

export function isExternalHref(href = "") {
  const raw = text(href, "");

  if (!raw) return false;
  if (/^(mailto:|tel:)/i.test(raw)) return true;
  if (raw.startsWith("//")) return true;

  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw, baseOrigin()).origin !== baseOrigin();
    } catch {
      return true;
    }
  }

  return false;
}

export function isUnsafeHref(href = "") {
  const raw = text(href, "");

  if (!raw) return false;
  if (/[\r\n\t\\]/.test(raw)) return true;
  if (isBlockedPath(raw)) return true;

  return UNSAFE_PROTOCOL_RE.test(raw);
}

export function isHashOnlyHref(href = "") {
  const raw = text(href, "");
  return raw.startsWith("#") && !isHashRouterPath(raw);
}

export function isSlugCandidatePath(path = "") {
  return isUserScopedPath(path) || isUserHomePath(path);
}

export function canUsePublicSlugForRoute(path = HOME) {
  const canonical = normalizeCanonicalPath(path);

  return Boolean(
    isUserScopedCanonicalPath(canonical) &&
      !isPublicAuthCanonical(canonical)
  );
}

export function resolveSpaHref(AppCore = null, href = HOME) {
  const raw = normalizeRouteInput(href);

  if (!raw || isUnsafeHref(raw)) return HOME;
  if (isHashOnlyHref(raw)) return raw;
  if (isHashRouterPath(raw)) return normalizePath(AppCore, normalizeHashRouterPath(raw));

  if (isExternalHref(raw)) return raw;
  if (ANY_PROTOCOL_RE.test(raw) && !/^https?:\/\//i.test(raw)) return HOME;

  if (/^https?:\/\//i.test(raw)) {
    const sameOriginPath = sameOriginUrlToPath(raw);
    return sameOriginPath ? normalizePath(AppCore, sameOriginPath) : raw;
  }

  return normalizePath(AppCore, raw);
}

/* =========================================================
   TOKEN ROUTES
========================================================= */

function tokenFromSearch(search = "") {
  const normalized = normalizeSearch(search);

  if (!normalized) return "";

  try {
    const params = new URLSearchParams(normalized);
    return text(params.get(TOKEN_PARAM), "");
  } catch {
    return "";
  }
}

function tokenFromHash(hash = "") {
  const normalized = normalizeHash(hash);

  if (!normalized) return "";

  const body = normalized.slice(1);

  if (body.includes("?")) {
    const query = body.slice(body.indexOf("?") + 1);
    return tokenFromSearch(query ? `?${query}` : "");
  }

  if (/^[^/?#=&]+=/i.test(body)) {
    return tokenFromSearch(`?${body}`);
  }

  return "";
}

function tokenFromUrl(pathOrUrl = "") {
  const parts = splitRawPath(pathFromUrlLike(pathOrUrl));
  return tokenFromSearch(parts.search) || tokenFromHash(parts.hash);
}

function tokenRoute(pathOrUrl = "") {
  const canonical = normalizeCanonicalPath(pathOrUrl);
  return TOKEN_PATHS.has(canonical) ? canonical : "";
}

export function isActivationPath(path = "") {
  return normalizeCanonicalPath(path) === ACTIVATE_ACCOUNT;
}

export function isResetConfirmPath(path = "") {
  return normalizeCanonicalPath(path) === PASSWORD_RESET;
}

export function getActivationTokenFromPath(pathOrUrl = "") {
  return isActivationPath(pathOrUrl) ? tokenFromUrl(pathOrUrl) : "";
}

export function getResetConfirmTokenFromPath(pathOrUrl = "") {
  return isResetConfirmPath(pathOrUrl) ? tokenFromUrl(pathOrUrl) : "";
}

export function hasTokenInActivationPath(pathOrUrl = "") {
  return Boolean(getActivationTokenFromPath(pathOrUrl));
}

export function hasTokenInResetConfirmPath(pathOrUrl = "") {
  return Boolean(getResetConfirmTokenFromPath(pathOrUrl));
}

export function hasActivationToken(pathOrUrl = "") {
  return hasTokenInActivationPath(pathOrUrl);
}

export function hasResetConfirmToken(pathOrUrl = "") {
  return hasTokenInResetConfirmPath(pathOrUrl);
}

export function isProtectedPublicTokenPath(pathOrUrl = "") {
  return Boolean(tokenRoute(pathOrUrl) && tokenFromUrl(pathOrUrl));
}

/* =========================================================
   INITIAL TOKEN PATH
========================================================= */

export function captureInitialUrl() {
  return isBrowser();
}

export function getProtectedInitialPublicPath() {
  const current = browserPath();
  return isProtectedPublicTokenPath(current) ? normalizePath(current) : "";
}

/* =========================================================
   BUILDERS
========================================================= */

function isPublicAuthCanonical(path = HOME) {
  const canonical = normalizeCanonicalPath(path);

  try {
    if (configIsPublicRoute(canonical) === true) return true;
  } catch {
    // fallback abajo
  }

  return PUBLIC_AUTH_PATHS.has(canonical);
}

export function buildPublicPath(
  AppCore = null,
  _getRoute = null,
  canonicalPath = HOME,
  options = {}
) {
  const opts = isObject(options) ? options : {};
  const source = normalizePath(
    AppCore,
    opts.fromPath ||
      opts.publicPath ||
      opts.requestedPath ||
      canonicalPath ||
      HOME
  );

  const canonical = normalizeCanonicalPath(AppCore, canonicalPath || source);
  const suffix = getSearchAndHash(source);

  const slug =
    sanitizeUserSlug(opts.slug) ||
    sanitizeUserSlug(opts.userSlug) ||
    getCurrentUserSlug(AppCore);

  if (
    canonical === HOME &&
    opts.keepCanonicalHome !== true &&
    opts.useSlugHome !== false
  ) {
    return normalizePath(AppCore, `${buildUserHomePath(slug)}${suffix}`);
  }

  if (
    canonical !== HOME &&
    opts.useSlugPrivate !== false &&
    slug &&
    isUserScopedCanonicalPath(canonical) &&
    !isPublicAuthCanonical(canonical)
  ) {
    return normalizePath(AppCore, `${buildUserScopedPath(slug, canonical)}${suffix}`);
  }

  return normalizePath(AppCore, `${canonical}${suffix}`);
}

export function getRedirectPath(AppCore = null) {
  if (!isBrowser()) return null;

  let redirect = "";

  try {
    redirect = getCurrentUrl().searchParams.get("redirect") || "";
  } catch {
    redirect = "";
  }

  if (!redirect || redirect.length > ROUTER_CONFIG.maxRedirectLength) return null;

  const resolved = resolveSpaHref(AppCore, redirect);

  if (isUnsafeHref(resolved) || isExternalHref(resolved)) return null;
  if (isPublicAuthCanonical(resolved)) return null;

  return normalizePath(AppCore, resolved);
}

export function buildLoginUrl(AppCore = null, redirectPath = null) {
  const names = getRouteNames(AppCore);
  const login = normalizePath(AppCore, names.LOGIN || LOGIN);

  if (!redirectPath) return login;

  const redirect = resolveSpaHref(AppCore, redirectPath);

  if (!redirect || isUnsafeHref(redirect) || isExternalHref(redirect)) return login;
  if (isPublicAuthCanonical(redirect)) return login;

  try {
    const url = new URL(`http://localhost${login}`);
    url.searchParams.set("redirect", normalizePath(AppCore, redirect));
    return `${url.pathname}${url.search}`;
  } catch {
    return login;
  }
}

export function buildHistoryUrl(AppCore = null, _getRoute = null, pathname = HOME, options = {}) {
  const opts = isObject(options) ? options : {};

  if (opts.publicPath) return normalizePath(AppCore, opts.publicPath);

  return normalizePath(AppCore, resolveSpaHref(AppCore, pathname));
}

export function buildStatePayload(AppCore = null, pathname = HOME, extras = {}) {
  const publicPath = normalizePath(AppCore, pathname);
  const canonicalPath = normalizeCanonicalPath(AppCore, publicPath);
  const slug = extractUserHomeSlugFromPath(publicPath);

  return {
    path: publicPath,
    publicPath,
    canonicalPath,
    rawCanonicalPath: canonicalPath,
    requestedPath: publicPath,
    searchAndHash: getSearchAndHash(publicPath),

    routeParams: {
      ...(slug ? { slug } : {}),
    },

    publicSlug: slug || null,
    isUserHomePath: Boolean(slug),

    isActivationRoute: canonicalPath === ACTIVATE_ACCOUNT,
    isResetConfirmRoute: canonicalPath === PASSWORD_RESET,
    isProtectedPublicTokenRoute: isProtectedPublicTokenPath(publicPath),

    hasActivationToken: hasActivationToken(publicPath),
    hasResetConfirmToken: hasResetConfirmToken(publicPath),

    username: null,

    ...(isObject(extras) ? extras : {}),
  };
}

export function getDefaultHomeTarget(AppCore = null) {
  return buildUserHomePath(getCurrentUserSlug(AppCore));
}

/* =========================================================
   DEBUG
========================================================= */

export function getRouterHelpersSnapshot(AppCore = null) {
  const currentPublicPath = getCurrentPublicPath(AppCore);
  const currentCanonicalPath = getCurrentCanonicalPath(AppCore);
  const currentSlug = extractUserHomeSlugFromPath(currentPublicPath);

  return {
    version: ROUTER_HELPERS_VERSION,

    currentPath: redactTokenInText(getCurrentPath(AppCore)),
    currentPublicPath: redactTokenInText(currentPublicPath),
    currentCanonicalPath: redactTokenInText(currentCanonicalPath),
    browserPath: redactTokenInText(isBrowser() ? browserPath() : HOME),

    userSlug: getCurrentUserSlug(AppCore) || null,
    publicSlug: currentSlug || null,
    defaultHomeTarget: getDefaultHomeTarget(AppCore),

    protectedInitialPublicPath: redactTokenInText(getProtectedInitialPublicPath()),

    hasActivationTokenInCurrentPath: hasActivationToken(currentPublicPath),
    hasResetConfirmTokenInCurrentPath: hasResetConfirmToken(currentPublicPath),

    activationPathToken: getActivationTokenFromPath(currentPublicPath) ? "***" : null,
    resetConfirmPathToken: getResetConfirmTokenFromPath(currentPublicPath) ? "***" : null,

    routeNames: getRouteNames(AppCore),
    userScopedCanonicalPaths: [...USER_SCOPED_CANONICAL_PATHS],

    policy: {
      helpersOnly: true,

      configOwnsRoutes: true,
      configOwnsTokenParam: true,
      configOwnsTokenRoutes: true,
      configOwnsUserScope: true,
      configOwnsBlockedRoutes: true,

      ownAuth: false,
      ownStorage: false,
      ownTransport: false,
      ownRender: false,
      ownNavigation: false,
      importsAuth: false,

      tokenParam: TOKEN_PARAM,

      userSlugHome: true,
      userSlugPrivateRoutes: true,
      canonicalizesUserHome: true,
      canonicalizesOnlyKnownUserScopedRoutes: true,
      publicAuthRoutesCannotLiveUnderUserScope: true,
      usernamePublicSlug: false,

      optionalAdminRoutesNotInvented: true,

      noLegacyRoutes: true,
      noHomeRoute: true,
      no2fa: true,
      noMfa: true,
      noOtp: true,

      snapshotRedacted: true,
    },
  };
}

/* =========================================================
   TOKEN ROUTE COMPAT
========================================================= */

export const RouterTokenRoutes = Object.freeze({
  ACTIVATION_PATH: ACTIVATE_ACCOUNT,
  RESET_CONFIRM_PATH: PASSWORD_RESET,
  PASSWORD_RESET_CONFIRM_PATH: PASSWORD_RESET,

  ACTIVATION_TOKEN_PARAM_NAMES: Object.freeze([TOKEN_PARAM]),
  RESET_TOKEN_PARAM_NAMES: Object.freeze([TOKEN_PARAM]),

  hasActivationToken,
  hasResetConfirmToken,

  hasTokenInActivationPath,
  hasTokenInResetConfirmPath,

  getActivationTokenFromPath,
  getResetConfirmTokenFromPath,

  isActivationPath,
  isResetConfirmPath,

  isProtectedPublicTokenPath,
  getProtectedInitialPublicPath,

  redactTokenInText,
});

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  ROUTER_HELPERS_VERSION,
  ROUTER_CONFIG,

  getRouteNames,

  isBrowser,
  normalizeRouteInput,
  escapeHtml,

  redactTokenInText,

  normalizePath,
  stripSearchAndHash,
  getSearchAndHash,
  pathFromUrlLike,

  sanitizeUserSlug,
  extractUserHomeSlugFromPath,
  isUserHomePath,
  isUserScopedPath,
  buildUserHomePath,
  getCurrentUserSlug,

  sanitizeUsername,
  extractUsernameFromPath,
  getCurrentUsername,
  getCurrentResolvedUsername,
  stripUsernamePrefix,

  normalizeCanonicalPath,
  isSameCanonicalPath,

  getCurrentUrl,
  getCurrentPath,
  getCurrentCanonicalPath,
  getCurrentPublicPath,
  getResolvedPublicPath,

  isExternalHref,
  isUnsafeHref,
  isHashOnlyHref,
  isSlugCandidatePath,
  canUsePublicSlugForRoute,

  resolveSpaHref,

  isActivationPath,
  isResetConfirmPath,
  isProtectedPublicTokenPath,
  getProtectedInitialPublicPath,

  hasActivationToken,
  hasResetConfirmToken,
  hasTokenInActivationPath,
  hasTokenInResetConfirmPath,
  getActivationTokenFromPath,
  getResetConfirmTokenFromPath,

  buildPublicPath,
  getRedirectPath,
  buildLoginUrl,
  buildHistoryUrl,
  buildStatePayload,
  getDefaultHomeTarget,

  captureInitialUrl,
  getRouterHelpersSnapshot,

  RouterTokenRoutes,
};
