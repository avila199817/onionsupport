/* =========================================================
   Onion Support - Router History
   Archivo: /src/router/history.js

   Responsabilidad:
   - Historial SPA mínimo.
   - pushState / replaceState / back.
   - Estado inicial seguro.
   - publicPath conserva query/hash.
   - canonicalPath limpio.
   - /@{user.slug} conserva URL pública pero canonicaliza a /.
   - Scrub explícito sólo del parámetro token.
   - Sin imports.
   - Sin Auth.
   - Sin guards.
   - Sin render.
   - Sin storage.
   - Sin Toast.
   - Sin eventos propios.
   - Sin alias /home.
   - Sin rutas legacy.
========================================================= */

export const ROUTER_HISTORY_VERSION = "router.history.v2";

const HISTORY_STATE_VERSION = 1;
const DEFAULT_ROUTE = "/";
const USER_HOME_PREFIX = "/@";
const TOKEN_PARAM = "token";

const TOKEN_ROUTES = new Set([
  "/activate-account",
  "/password-reset",
]);

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

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function nowMs() {
  return Date.now();
}

function nowIso() {
  return new Date().toISOString();
}

function nextHistoryId() {
  sequence += 1;
  return `hist_${nowMs()}_${sequence}`;
}

function redact(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/([?&#]access_token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

/* =========================================================
   PATHS
========================================================= */

function isHashRouterPath(value = "") {
  const raw = text(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = text(value, DEFAULT_ROUTE);

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  }

  if (raw.startsWith("#/")) {
    return raw.slice(1) || DEFAULT_ROUTE;
  }

  return raw || DEFAULT_ROUTE;
}

function pathFromInput(path = DEFAULT_ROUTE) {
  const raw = text(path, DEFAULT_ROUTE);

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  if (raw.startsWith("//")) {
    return DEFAULT_ROUTE;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return DEFAULT_ROUTE;
  }

  return raw;
}

function normalizePathname(pathname = DEFAULT_ROUTE) {
  let value = text(pathname, DEFAULT_ROUTE).replace(/\\/g, "/");

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value = value.replace(/\/{2,}/g, "/");

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || DEFAULT_ROUTE;
  }

  return value || DEFAULT_ROUTE;
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

function joinPath(parts = {}) {
  return [
    normalizePathname(parts.pathname || DEFAULT_ROUTE),
    normalizeSearch(parts.search || ""),
    normalizeHash(parts.hash || ""),
  ].join("");
}

function normalizePublicPath(path = DEFAULT_ROUTE) {
  return joinPath(splitPath(path));
}

function normalizeUserSlug(value = "") {
  const slug = text(value, "")
    .replace(/^\/+/, "")
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]
    .trim()
    .toLowerCase();

  if (!slug) return "";

  return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
}

function extractSlugFromPath(path = DEFAULT_ROUTE) {
  const pathname = splitPath(path).pathname;

  if (!pathname.startsWith(USER_HOME_PREFIX)) return "";

  const slug = pathname.slice(USER_HOME_PREFIX.length);

  if (!slug || slug.includes("/")) return "";

  return normalizeUserSlug(slug);
}

function isUserHomePath(path = DEFAULT_ROUTE) {
  return Boolean(extractSlugFromPath(path));
}

function normalizeCanonicalPath(path = DEFAULT_ROUTE) {
  const pathname = splitPath(path).pathname || DEFAULT_ROUTE;

  return isUserHomePath(pathname)
    ? DEFAULT_ROUTE
    : pathname;
}

function browserPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  try {
    const hash = window.location.hash || "";

    if (isHashRouterPath(hash)) {
      return normalizePublicPath(hash);
    }

    return normalizePublicPath(
      `${window.location.pathname || DEFAULT_ROUTE}${window.location.search || ""}${hash}`
    );
  } catch {
    return DEFAULT_ROUTE;
  }
}

/* =========================================================
   STATE
========================================================= */

export function createHistoryState({
  AppCore = null,
  pathname = DEFAULT_ROUTE,
  extras = {},
} = {}) {
  void AppCore;

  const extra = isObject(extras) ? extras : {};
  const publicPath = normalizePublicPath(extra.publicPath || pathname || DEFAULT_ROUTE);
  const canonicalPath = normalizeCanonicalPath(extra.canonicalPath || publicPath);
  const slug = extractSlugFromPath(publicPath);

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
      ...(isObject(extra.routeParams) ? extra.routeParams : {}),
      ...(slug ? { slug } : {}),
    },

    publicSlug: slug || null,
    isUserHomePath: Boolean(slug),

    source: extra.source || null,
    mode: extra.mode || null,

    title: extra.title || null,
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
  if (!canUseHistory()) return false;
  if (method !== "pushState" && method !== "replaceState") return false;

  const finalUrl = normalizePublicPath(url || DEFAULT_ROUTE);

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
      mode,
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

    params.delete(TOKEN_PARAM);

    const output = params.toString();

    return output ? `?${output}` : "";
  } catch {
    return "";
  }
}

function removeTokenFromHash(hash = "") {
  const normalized = normalizeHash(hash);

  if (!normalized || !normalized.includes("?")) {
    return normalized;
  }

  const index = normalized.indexOf("?");
  const hashPath = normalized.slice(0, index);
  const query = normalized.slice(index + 1);
  const cleanQuery = removeTokenFromSearch(`?${query}`);

  return cleanQuery ? `${hashPath}${cleanQuery}` : hashPath;
}

export function buildScrubbedProtectedUrl(_AppCore = null, url = "") {
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

export function back(_AppCore = null) {
  if (!canUseHistory()) return false;

  try {
    window.history.back();
    return true;
  } catch {
    return false;
  }
}

export function getPopStatePath(_AppCore = null, eventOrState = null) {
  const state = eventOrState?.state || eventOrState || currentHistoryState() || {};
  const fromState = text(state.publicPath || state.path || "", "");

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

    routeParams: isObject(state.routeParams)
      ? { ...state.routeParams }
      : {},

    publicSlug: state.publicSlug || null,
    isUserHomePath: state.isUserHomePath === true,

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

  return {
    version: ROUTER_HISTORY_VERSION,

    canUseHistory: canUseHistory(),
    historyStateVersion: HISTORY_STATE_VERSION,

    browserPublicUrl: redact(currentUrl),
    currentCanonicalPath: redact(canonicalPath),
    currentPublicPath: redact(publicPath),

    isUserHomePath: isUserHomePath(publicPath),
    publicSlug: extractSlugFromPath(publicPath) || null,

    state: serializeState(currentHistoryState()),

    sequence,

    policy: {
      historyOnly: true,
      ownAuth: false,
      ownGuards: false,
      ownRender: false,
      ownStorage: false,
      ownToast: false,

      userSlugHome: true,
      canonicalizesUserHome: true,

      noHomeAlias: true,
      noLegacyRoutes: true,

      tokenParam: TOKEN_PARAM,
      tokenRoutes: [...TOKEN_ROUTES],
      tokenScrubExplicit: true,
    },

    app: {
      route: AppCore?.state?.route || null,
      publicPath: AppCore?.state?.publicPath || null,
      canonicalPath: AppCore?.state?.canonicalPath || null,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  ROUTER_HISTORY_VERSION,

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
