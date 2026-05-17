/* =========================================================
   Onion Support - Router History
   Archivo: /src/router/history.js

   Responsabilidad:
   - Historial SPA mínimo.
   - pushState / replaceState / back.
   - Estado inicial seguro.
   - publicPath conserva query/hash.
   - canonicalPath limpio.
   - Scrub explícito sólo del parámetro token.
   - Sin imports.
   - Sin Auth.
   - Sin guards.
   - Sin render.
   - Sin storage.
   - Sin Toast.
   - Sin username public slug.
   - Sin rutas legacy.
   - Sin magia negra.
========================================================= */

export const ROUTER_HISTORY_VERSION = "simple";

const SOURCE = "router.history";
const HISTORY_STATE_VERSION = 1;
const DEFAULT_ROUTE = "/";

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

function emit(AppCore = null, eventName = "", payload = {}, options = {}) {
  if (options.emit === false || options.emitEvents === false) return false;

  try {
    AppCore?.events?.emit?.(eventName, {
      source: SOURCE,
      version: ROUTER_HISTORY_VERSION,
      ...payload,
      token: null,
    });

    return true;
  } catch {
    return false;
  }
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

  return raw.replace(/^#\/?/, "/") || DEFAULT_ROUTE;
}

function normalizePathname(pathname = DEFAULT_ROUTE) {
  let value = text(pathname, DEFAULT_ROUTE).replace(/\\/g, "/");

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value = value.replace(/\/{2,}/g, "/");

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "");
  }

  return value || DEFAULT_ROUTE;
}

function normalizeSearch(search = "") {
  const value = text(search, "");

  if (!value) return "";

  return value.startsWith("?") ? value : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value = text(hash, "");

  if (!value) return "";

  return value.startsWith("#") ? value : `#${value.replace(/^#+/, "")}`;
}

function splitPath(path = DEFAULT_ROUTE) {
  let raw = text(path, DEFAULT_ROUTE);

  if (isHashRouterPath(raw)) {
    raw = normalizeHashRouterPath(raw);
  }

  try {
    if (/^https?:\/\//i.test(raw)) {
      const parsed = new URL(raw);
      raw = `${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`;
    }
  } catch {
    // noop
  }

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
  return `${normalizePathname(parts.pathname || DEFAULT_ROUTE)}${normalizeSearch(parts.search || "")}${normalizeHash(parts.hash || "")}`;
}

function normalizePublicPath(path = DEFAULT_ROUTE) {
  return joinPath(splitPath(path));
}

function normalizeCanonicalPath(path = DEFAULT_ROUTE) {
  return splitPath(path).pathname || DEFAULT_ROUTE;
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
  const extra = isObject(extras) ? extras : {};
  const publicPath = normalizePublicPath(extra.publicPath || pathname || DEFAULT_ROUTE);
  const canonicalPath = normalizeCanonicalPath(extra.canonicalPath || publicPath);

  return {
    __onionRouterHistory: true,
    version: HISTORY_STATE_VERSION,

    id: extra.id || nextHistoryId(),
    ts: extra.ts || nowMs(),
    at: extra.at || nowIso(),

    path: publicPath,
    publicPath,
    canonicalPath,

    source: extra.source || null,
    mode: extra.mode || null,

    route: canonicalPath,

    title: extra.title || null,
    stateSource: SOURCE,
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

function sameState(left = null, right = null) {
  if (!left || !right) return false;

  return (
    left.publicPath === right.publicPath &&
    left.canonicalPath === right.canonicalPath &&
    left.mode === right.mode
  );
}

function writeHistory(AppCore, method, state, url, options = {}) {
  if (!canUseHistory()) return false;

  if (method !== "pushState" && method !== "replaceState") {
    return false;
  }

  const finalUrl = normalizePublicPath(url || DEFAULT_ROUTE);

  try {
    window.history[method](state, "", finalUrl);

    emit(AppCore, "router:history:write", {
      method,
      url: finalUrl,
      canonicalPath: state.canonicalPath,
    }, options);

    return true;
  } catch (error) {
    emit(AppCore, "router:history:error", {
      method,
      url: finalUrl,
      message: error?.message || String(error),
    }, options);

    return false;
  }
}

/* =========================================================
   WRITE API
========================================================= */

export function pushState({
  AppCore = null,
  pathname = DEFAULT_ROUTE,
  options = {},
} = {}) {
  if (!canUseHistory()) return false;

  const opts = isObject(options) ? options : {};

  if (opts.skipHistory === true) return false;

  const publicPath = normalizePublicPath(opts.publicPath || pathname);
  const state = createHistoryState({
    AppCore,
    pathname: publicPath,
    extras: {
      ...opts,
      mode: "push",
      publicPath,
      canonicalPath: opts.canonicalPath || normalizeCanonicalPath(publicPath),
      source: opts.source || null,
    },
  });

  if (sameState(currentHistoryState(), state) && opts.forceHistory !== true) {
    return false;
  }

  return writeHistory(AppCore, "pushState", state, publicPath, opts);
}

export function replaceState({
  AppCore = null,
  pathname = DEFAULT_ROUTE,
  options = {},
} = {}) {
  if (!canUseHistory()) return false;

  const opts = isObject(options) ? options : {};

  if (opts.skipHistory === true) return false;

  const publicPath = normalizePublicPath(opts.publicPath || pathname);
  const state = createHistoryState({
    AppCore,
    pathname: publicPath,
    extras: {
      ...opts,
      mode: "replace",
      publicPath,
      canonicalPath: opts.canonicalPath || normalizeCanonicalPath(publicPath),
      source: opts.source || null,
    },
  });

  if (sameState(currentHistoryState(), state) && opts.forceHistory !== true) {
    return false;
  }

  return writeHistory(AppCore, "replaceState", state, publicPath, opts);
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
  const method = opts.replaceState === true || publicPath === currentUrl
    ? "replaceState"
    : "pushState";

  const state = createHistoryState({
    AppCore,
    pathname: publicPath,
    extras: {
      ...opts,
      mode: method === "replaceState" ? "replace" : "push",
      publicPath,
      canonicalPath: opts.canonicalPath || normalizeCanonicalPath(publicPath),
      source: opts.source || null,
    },
  });

  if (sameState(currentHistoryState(), state) && opts.forceHistory !== true) {
    return false;
  }

  return writeHistory(AppCore, method, state, publicPath, opts);
}

/* =========================================================
   INITIAL STATE
========================================================= */

export function ensureInitialHistoryState({ AppCore = null } = {}) {
  if (!canUseHistory()) return false;

  const publicPath = browserPath();
  const state = createHistoryState({
    AppCore,
    pathname: publicPath,
    extras: {
      mode: "initial",
      publicPath,
      canonicalPath: normalizeCanonicalPath(publicPath),
      source: "initial",
    },
  });

  const current = currentHistoryState();

  if (current?.__onionRouterHistory === true) {
    return true;
  }

  return writeHistory(AppCore, "replaceState", state, publicPath, {
    source: "initial",
  });
}

/* =========================================================
   TOKEN SCRUB
   Actual:
   - /activate-account?token=...
   - /password-reset?token=...
========================================================= */

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

  if (!normalized || !normalized.includes("?")) return normalized;

  const [hashPath, query = ""] = normalized.split("?");
  const cleanQuery = removeTokenFromSearch(`?${query}`);

  return cleanQuery ? `${hashPath}${cleanQuery}` : hashPath;
}

function isTokenRoute(path = "") {
  return TOKEN_ROUTES.has(normalizeCanonicalPath(path));
}

export function buildScrubbedProtectedUrl(_AppCore = null, url = "") {
  const original = normalizePublicPath(url || browserPath());
  const parts = splitPath(original);

  const clean = {
    pathname: parts.pathname,
    search: isTokenRoute(parts.pathname) ? removeTokenFromSearch(parts.search) : parts.search,
    hash: isTokenRoute(parts.pathname) ? removeTokenFromHash(parts.hash) : parts.hash,
  };

  return normalizePublicPath(joinPath(clean));
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

  if (!isTokenRoute(original)) return false;

  const scrubbed = buildScrubbedProtectedUrl(AppCore, original);

  if (scrubbed === original) return false;

  const state = createHistoryState({
    AppCore,
    pathname: scrubbed,
    extras: {
      ...(isObject(extraState) ? extraState : {}),
      mode: "scrub",
      source: reason,
      publicPath: scrubbed,
      canonicalPath: normalizeCanonicalPath(scrubbed),
      tokenScrubbed: true,
      tokenScrubbedAt: nowIso(),
    },
  });

  return writeHistory(
    AppCore,
    replace ? "replaceState" : "pushState",
    state,
    scrubbed,
    {
      source: reason,
    }
  );
}

/* =========================================================
   NAVIGATION
========================================================= */

export function back(AppCore = null) {
  if (!canUseHistory()) return false;

  try {
    window.history.back();

    emit(AppCore, "router:history:back", {
      at: nowIso(),
    });

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

export function getHistorySnapshot(AppCore = null) {
  const currentUrl = browserPath();

  return {
    version: ROUTER_HISTORY_VERSION,

    canUseHistory: canUseHistory(),
    historyStateVersion: HISTORY_STATE_VERSION,

    browserPublicUrl: currentUrl,
    currentCanonicalPath: normalizeCanonicalPath(currentUrl),
    currentPublicPath: normalizePublicPath(currentUrl),

    state: canUseHistory() ? currentHistoryState() : null,

    sequence,

    policy: {
      historyOnly: true,
      ownAuth: false,
      ownGuards: false,
      ownRender: false,
      ownStorage: false,
      ownToast: false,
      noUsernamePublicSlug: true,
      tokenParam: TOKEN_PARAM,
      tokenRoutes: [...TOKEN_ROUTES],
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
