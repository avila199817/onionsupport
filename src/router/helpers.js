/* =========================================================
   Onion Support - Router Helpers
   Archivo: /src/router/helpers.js

   Responsabilidad:
   - Helpers puros mínimos del Router.
   - Normalizar rutas públicas y canónicas.
   - Mantener /@{user.slug} como Home pública visible.
   - Canonicalizar /@{user.slug} internamente como /.
   - Token param único: token.
   - Rutas públicas actuales:
     /login
     /password-request
     /password-reset
     /activate-account
   - Sin imports.
   - Sin Auth.
   - Sin fetch.
   - Sin storage.
   - Sin Toast.
   - Sin render.
   - Sin history real.
   - Sin username public slug.
   - Sin aliases legacy.
   - Sin 2FA/MFA/OTP.
========================================================= */

export const ROUTER_HELPERS_VERSION = "router.helpers.v2";

export const ROUTER_CONFIG = Object.freeze({
  maxRouteLength: 2048,
  maxSlugLength: 96,
  maxUsernameLength: 96,
  maxRedirectLength: 1600,
});

const HOME = "/";
const USER_HOME_PREFIX = "/@";

const LOGIN = "/login";
const PASSWORD_REQUEST = "/password-request";
const PASSWORD_RESET = "/password-reset";
const ACTIVATE_ACCOUNT = "/activate-account";

const TOKEN_PARAM = "token";

const UNSAFE_PROTOCOL_RE = /^(javascript:|data:|vbscript:|file:)/i;
const ANY_PROTOCOL_RE = /^[a-z][a-z\d+.-]*:/i;

const PUBLIC_AUTH_PATHS = new Set([
  LOGIN,
  PASSWORD_REQUEST,
  PASSWORD_RESET,
  ACTIVATE_ACCOUNT,
]);

const TOKEN_PATHS = new Set([
  PASSWORD_RESET,
  ACTIVATE_ACCOUNT,
]);

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
  const output = String(value ?? "").trim();
  return output || fallback;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];

  return [value];
}

function unique(values = []) {
  return [
    ...new Set(
      asArray(values)
        .flat(Infinity)
        .map((item) => text(item, ""))
        .filter(Boolean)
    ),
  ];
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
    HOME: routes.home || HOME,

    LOGIN: routes.login || LOGIN,
    PASSWORD_REQUEST: routes.passwordRequest || PASSWORD_REQUEST,
    PASSWORD_RESET: routes.passwordReset || PASSWORD_RESET,
    ACTIVATE_ACCOUNT: routes.activateAccount || ACTIVATE_ACCOUNT,

    INCIDENCIAS: routes.incidencias || "/incidencias",
    FACTURAS: routes.facturas || "/facturas",
    CLIENTES: routes.clientes || "/clientes",
    CUENTA: routes.cuenta || "/cuenta",
    AJUSTES: routes.ajustes || "/ajustes",

    USUARIOS: routes.usuarios || "/usuarios",
    SERVER: routes.server || routes.servidor || "/servidor",
    SERVIDOR: routes.servidor || routes.server || "/servidor",
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

  try {
    output = output.replace(
      new RegExp(`([?&#]${escapeRegExp(TOKEN_PARAM)}=)([^&#\\s]+)`, "gi"),
      "$1***"
    );
  } catch {
    // noop
  }

  try {
    output = output.replace(
      /([?&#]access_token=)([^&#\s]+)/gi,
      "$1***"
    );
  } catch {
    // noop
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

export function normalizePath(first = null, second = undefined) {
  const { path } = resolvePathArgs(first, second, HOME);
  const raw = normalizeRouteInput(path);

  if (raw.startsWith("#") && !isHashRouterPath(raw)) {
    return normalizeHash(raw);
  }

  return joinParts(splitRawPath(raw));
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

export function extractUserHomeSlugFromPath(path = HOME) {
  const pathname = stripSearchAndHash(path);

  if (!pathname.startsWith(USER_HOME_PREFIX)) return "";

  const slug = pathname.slice(USER_HOME_PREFIX.length);

  if (!slug || slug.includes("/")) return "";

  return sanitizeUserSlug(slug);
}

export function isUserHomePath(path = HOME) {
  return Boolean(extractUserHomeSlugFromPath(path));
}

export function buildUserHomePath(slug = "") {
  const clean = sanitizeUserSlug(slug);
  return clean ? `${USER_HOME_PREFIX}${clean}` : HOME;
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
  return normalizePath(path);
}

/* =========================================================
   CANONICAL / CURRENT PATHS
========================================================= */

export function normalizeCanonicalPath(first = null, second = undefined) {
  const { path } = resolvePathArgs(first, second, HOME);
  const pathname = stripSearchAndHash(path);

  if (isUserHomePath(pathname)) return HOME;

  if (pathname === ACTIVATE_ACCOUNT) return ACTIVATE_ACCOUNT;
  if (pathname === PASSWORD_RESET) return PASSWORD_RESET;

  return pathname;
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

  return UNSAFE_PROTOCOL_RE.test(raw);
}

export function isHashOnlyHref(href = "") {
  const raw = text(href, "");
  return raw.startsWith("#") && !isHashRouterPath(raw);
}

export function isSlugCandidatePath(path = "") {
  return isUserHomePath(path);
}

export function canUsePublicSlugForRoute(path = HOME) {
  const canonical = normalizeCanonicalPath(path);
  return canonical === HOME || isUserHomePath(path);
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

  if (!normalized || !normalized.includes("?")) return "";

  const query = normalized.split("?").slice(1).join("?");

  return tokenFromSearch(query ? `?${query}` : "");
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
  return PUBLIC_AUTH_PATHS.has(normalizeCanonicalPath(path));
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

  if (
    canonical === HOME &&
    opts.keepCanonicalHome !== true &&
    opts.useSlugHome !== false
  ) {
    const slug =
      sanitizeUserSlug(opts.slug) ||
      sanitizeUserSlug(opts.userSlug) ||
      getCurrentUserSlug(AppCore);

    return normalizePath(AppCore, `${buildUserHomePath(slug)}${suffix}`);
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

    policy: {
      ownAuth: false,
      ownStorage: false,
      ownTransport: false,
      ownRender: false,
      ownNavigation: false,
      importsAuth: false,

      tokenParam: TOKEN_PARAM,

      userSlugHome: true,
      canonicalizesUserHome: true,
      usernamePublicSlug: false,

      noLegacyRoutes: true,
      no2fa: true,
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
