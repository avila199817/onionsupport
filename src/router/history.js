/* =========================================================
   Onion SPA - Router History
   Archivo: src/router/history.js

   FINAL EXTREME SYSTEM · HISTORY / URL STATE · 10/10

   RESPONSABILIDADES:
   - centralizar pushState / replaceState
   - construir state payload consistente
   - init state inicial idempotente
   - navegación back segura
   - helpers reutilizables para router
   - preservar rutas públicas con token antes de captura/scrub
   - preservar contexto público /@username cuando procede
   - evitar escrituras duplicadas inútiles
   - soportar hash-router técnico
   - diagnosticar carreras de navegación/history

   HARDENING EXTREMO:
   - guards browser robustos
   - fallback silencioso si History API falla
   - normalización estricta URL/state
   - no duplicar estados innecesarios
   - preservar publicPath/canonicalPath/requestedPath/username
   - no degradar URL contextualizada /@username
   - preservar query/hash públicos cuando procede
   - no destruir /activate-account?token=... antes de capturarlo
   - no destruir /activate-account/<token> antes de capturarlo
   - no destruir /reset-password/confirm?token=... antes de capturarlo
   - no destruir /reset-password/confirm/<token> antes de capturarlo
   - respetar skipHistory / preservePath / protectedInitialUrl
   - soporte hash-router /#/activate-account?token=...
   - soporte hash-router /#/reset-password/confirm?token=...
   - soporte aliases legacy de reset initial url
   - canonicalPath real vía normalizeCanonicalPath()
   - timestamps/navId estables
   - eventos router:history:* para debug
========================================================= */

import {
  isBrowser,
  normalizePath,
  normalizeCanonicalPath,
  getCurrentPath,
  getCurrentCanonicalPath,
  getCurrentPublicPath,
  getCurrentResolvedUsername,
  buildHistoryUrl,
  buildStatePayload,
} from "./helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const HISTORY_STATE_VERSION = 3;

const ACTIVATION_PATH = "/activate-account";
const RESET_CONFIRM_PATH = "/reset-password/confirm";

const ACTIVATION_TOKEN_PARAM_NAMES = Object.freeze([
  "token",
  "activationToken",
  "activateToken",
  "code",
  "t",
]);

const RESET_TOKEN_PARAM_NAMES = Object.freeze([
  "token",
  "resetToken",
  "passwordResetToken",
  "confirmToken",
  "code",
  "t",
]);

const PROTECTED_TOKEN_ROUTES = Object.freeze([
  Object.freeze({
    kind: "activation",
    canonicalPath: ACTIVATION_PATH,
    tokenNames: ACTIVATION_TOKEN_PARAM_NAMES,
    scrubFlags: Object.freeze([
      "scrubbedActivationToken",
    ]),
    windowKeys: Object.freeze([
      "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
    ]),
  }),

  Object.freeze({
    kind: "reset-confirm",
    canonicalPath: RESET_CONFIRM_PATH,
    tokenNames: RESET_TOKEN_PARAM_NAMES,
    scrubFlags: Object.freeze([
      "scrubbedResetToken",
      "scrubbedResetPasswordToken",
    ]),
    windowKeys: Object.freeze([
      "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
      "__ONION_RESET_CONFIRM_INITIAL_URL__",
    ]),
  }),
]);

/* =========================================================
   INTERNAL COUNTERS
========================================================= */

let historySeq = 0;

/* =========================================================
   BASICS
========================================================= */

function canUseHistory() {
  return (
    isBrowser() &&
    typeof window !== "undefined" &&
    typeof window.history !== "undefined" &&
    typeof window.history.pushState === "function" &&
    typeof window.history.replaceState === "function"
  );
}

function nowTs() {
  return Date.now();
}

function nextHistoryId() {
  historySeq += 1;

  return `hist_${nowTs()}_${historySeq}`;
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function isFunction(value) {
  return typeof value === "function";
}

function getBaseOrigin() {
  if (isBrowser() && window.location?.origin) {
    return window.location.origin;
  }

  return "http://localhost";
}

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  let emitted = false;

  try {
    AppCore?.events?.emit?.(name, payload);
    emitted = true;
  } catch {}

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );

      emitted = true;
    }
  } catch {}

  return emitted;
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[RouterHistory]", ...args);
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.warn("[RouterHistory]", ...args);
    }
  } catch {}
}

function safeHistoryCall(AppCore, method, state, url) {
  if (!canUseHistory()) {
    return false;
  }

  if (
    method !== "pushState" &&
    method !== "replaceState"
  ) {
    return false;
  }

  const cleanUrl = safeText(url, "/") || "/";

  try {
    window.history[method](state, "", cleanUrl);

    safeEmit(
      AppCore,
      "router:history:write",
      {
        method,
        url: cleanUrl,
        state,
      }
    );

    return true;
  } catch (error) {
    safeWarn(
      AppCore,
      `History API ${method} falló.`,
      {
        url: cleanUrl,
        error,
      }
    );

    safeEmit(
      AppCore,
      "router:history:error",
      {
        method,
        url: cleanUrl,
        error,
        message: error?.message || String(error),
      }
    );

    return false;
  }
}

/* =========================================================
   PATH / URL NORMALIZATION
========================================================= */

function normalizePathname(AppCore, pathname = "/") {
  try {
    return normalizePath(AppCore, pathname || "/");
  } catch {
    return "/";
  }
}

function normalizePathnameOnly(pathname = "/") {
  let value = String(pathname || "/")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function stripPublicUsernamePrefix(pathname = "/") {
  return (
    normalizePathnameOnly(pathname).replace(/^\/@[^/]+(?=\/|$)/i, "") ||
    "/"
  );
}

function normalizeSearch(search = "") {
  const value = String(search || "").trim();

  if (!value) {
    return "";
  }

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value = String(hash || "").trim();

  if (!value) {
    return "";
  }

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function isHashRouterPath(value = "") {
  const raw = String(value || "").trim();

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw = String(value || "").trim();

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function buildUrlFromParts({
  pathname = "/",
  search = "",
  hash = "",
} = {}) {
  const path = normalizePathnameOnly(pathname || "/");

  return `${path}${search || ""}${hash || ""}`;
}

function parseUrlParts(value = "/") {
  const raw = safeText(value, "/") || "/";

  if (isHashRouterPath(raw)) {
    return parseUrlParts(normalizeHashRouterPath(raw));
  }

  try {
    const parsed = new URL(raw, getBaseOrigin());

    if (parsed.hash && isHashRouterPath(parsed.hash)) {
      return parseUrlParts(normalizeHashRouterPath(parsed.hash));
    }

    return {
      pathname: parsed.pathname || "/",
      search: normalizeSearch(parsed.search || ""),
      hash: normalizeHash(parsed.hash || ""),
    };
  } catch {
    let pathname = raw;
    let search = "";
    let hash = "";

    const hashIndex = pathname.indexOf("#");

    if (hashIndex >= 0) {
      hash = pathname.slice(hashIndex);
      pathname = pathname.slice(0, hashIndex) || "/";
    }

    const searchIndex = pathname.indexOf("?");

    if (searchIndex >= 0) {
      search = pathname.slice(searchIndex);
      pathname = pathname.slice(0, searchIndex) || "/";
    }

    return {
      pathname: pathname || "/",
      search: normalizeSearch(search),
      hash: normalizeHash(hash),
    };
  }
}

function pathFromUrlLike(AppCore, value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isHashRouterPath(raw)) {
    return normalizePath(
      AppCore,
      normalizeHashRouterPath(raw)
    );
  }

  try {
    const parsed = new URL(raw, getBaseOrigin());

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      return normalizePath(
        AppCore,
        normalizeHashRouterPath(parsed.hash)
      );
    }

    return normalizePath(
      AppCore,
      `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
    );
  } catch {
    return normalizePath(
      AppCore,
      raw.startsWith("/") ? raw : `/${raw}`
    );
  }
}

function getBrowserPublicUrl() {
  if (!isBrowser() || !window.location) {
    return "";
  }

  try {
    const pathname = window.location.pathname || "/";
    const search = window.location.search || "";
    const hash = window.location.hash || "";

    if (hash && isHashRouterPath(hash)) {
      return normalizePath(
        null,
        normalizeHashRouterPath(hash)
      );
    }

    return `${pathname}${search}${hash}`;
  } catch {
    return "";
  }
}

function normalizeCanonicalUrl(AppCore, url = "/") {
  try {
    return normalizeCanonicalPath(
      AppCore,
      url || "/"
    );
  } catch {
    const parts = parseUrlParts(url);

    const pathname = stripPublicUsernamePrefix(
      parts.pathname || "/"
    );

    if (
      pathname === ACTIVATION_PATH ||
      pathname.startsWith(`${ACTIVATION_PATH}/`)
    ) {
      return ACTIVATION_PATH;
    }

    if (
      pathname === RESET_CONFIRM_PATH ||
      pathname.startsWith(`${RESET_CONFIRM_PATH}/`)
    ) {
      return RESET_CONFIRM_PATH;
    }

    return normalizePathnameOnly(pathname);
  }
}

function sameUrl(a = "", b = "") {
  return safeText(a, "") === safeText(b, "");
}

/* =========================================================
   TOKEN ROUTE RESOLUTION
========================================================= */

function getProtectedRouteConfigByCanonical(canonicalPath = "") {
  const canonical = normalizePathnameOnly(canonicalPath || "/");

  return (
    PROTECTED_TOKEN_ROUTES.find((config) => {
      return canonical === config.canonicalPath;
    }) || null
  );
}

function getProtectedRouteConfigFromUrl(AppCore, url = "") {
  const canonical = normalizeCanonicalUrl(
    AppCore,
    url || "/"
  );

  return getProtectedRouteConfigByCanonical(canonical);
}

function getProtectedKind(AppCore, url = "") {
  return getProtectedRouteConfigFromUrl(AppCore, url)?.kind || "";
}

function isProtectedTokenPath(AppCore, url = "") {
  return Boolean(
    getProtectedRouteConfigFromUrl(AppCore, url)
  );
}

function isActivationPath(AppCore, url = "") {
  return getProtectedKind(AppCore, url) === "activation";
}

function isResetConfirmPath(AppCore, url = "") {
  return getProtectedKind(AppCore, url) === "reset-confirm";
}

function getTokenNamesForUrl(AppCore, url = "") {
  const config = getProtectedRouteConfigFromUrl(
    AppCore,
    url
  );

  return config?.tokenNames || ACTIVATION_TOKEN_PARAM_NAMES;
}

function hasTokenInSearch(search = "", tokenNames = []) {
  try {
    const params = new URLSearchParams(search || "");

    return tokenNames.some((name) =>
      Boolean(safeText(params.get(name), ""))
    );
  } catch {
    return false;
  }
}

function getProtectedPathToken(AppCore, url = "") {
  const raw = safeText(url, "");

  if (!raw) {
    return "";
  }

  const parts = parseUrlParts(raw);

  const pathname = stripPublicUsernamePrefix(
    parts.pathname || "/"
  );

  const config = getProtectedRouteConfigFromUrl(
    AppCore,
    raw
  );

  if (!config) {
    return "";
  }

  const basePath = config.canonicalPath;

  if (!pathname.startsWith(`${basePath}/`)) {
    return "";
  }

  const token = pathname
    .slice(`${basePath}/`.length)
    .split("/")[0];

  try {
    return safeText(
      decodeURIComponent(token || ""),
      ""
    );
  } catch {
    return safeText(token, "");
  }
}

function hasProtectedToken(AppCore, url = "") {
  const raw = safeText(url, "");

  if (!raw) {
    return false;
  }

  if (
    isProtectedTokenPath(AppCore, raw) &&
    getProtectedPathToken(AppCore, raw)
  ) {
    return true;
  }

  const parts = parseUrlParts(raw);
  const tokenNames = getTokenNamesForUrl(AppCore, raw);

  if (hasTokenInSearch(parts.search, tokenNames)) {
    return true;
  }

  if (parts.hash && isHashRouterPath(parts.hash)) {
    const hashPath = normalizeHashRouterPath(parts.hash);
    const hashParts = parseUrlParts(hashPath);

    if (hasTokenInSearch(hashParts.search, tokenNames)) {
      return true;
    }

    if (getProtectedPathToken(AppCore, hashPath)) {
      return true;
    }
  }

  if (parts.hash && parts.hash.includes("?")) {
    const query = parts.hash.split("?").slice(1).join("?");

    return hasTokenInSearch(
      query ? `?${query}` : "",
      tokenNames
    );
  }

  return false;
}

function getCurrentHistoryState() {
  if (!canUseHistory()) {
    return null;
  }

  try {
    return window.history.state || null;
  } catch {
    return null;
  }
}

function hasScrubFlag(flag = "") {
  if (!canUseHistory() || !flag) {
    return false;
  }

  try {
    return Boolean(window.history?.state?.[flag]);
  } catch {
    return false;
  }
}

function isProtectedTokenScrubbed(AppCore, url = "") {
  const config = getProtectedRouteConfigFromUrl(
    AppCore,
    url
  );

  if (!config) {
    return false;
  }

  return config.scrubFlags.some((flag) =>
    hasScrubFlag(flag)
  );
}

function isProtectedTokenUrl(AppCore, url = "") {
  if (isProtectedTokenScrubbed(AppCore, url)) {
    return false;
  }

  return (
    isProtectedTokenPath(AppCore, url) &&
    hasProtectedToken(AppCore, url)
  );
}

/* =========================================================
   INITIAL URL CAPTURE
========================================================= */

function getWindowValue(key = "") {
  if (!isBrowser() || !key) {
    return "";
  }

  try {
    return safeText(window[key], "");
  } catch {
    return "";
  }
}

function setWindowValueIfEmpty(key = "", value = "") {
  if (!isBrowser() || !key || !value) {
    return false;
  }

  try {
    if (!window[key]) {
      window[key] = value;
    }

    return true;
  } catch {
    return false;
  }
}

function getInitialUrl() {
  return getWindowValue("__ONION_INITIAL_URL__");
}

function getActivationInitialUrl() {
  return getWindowValue("__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__");
}

function getResetConfirmInitialUrl() {
  return (
    getWindowValue("__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__") ||
    getWindowValue("__ONION_RESET_CONFIRM_INITIAL_URL__")
  );
}

function getStoredInitialUrlsByConfig(config = null) {
  if (!config) {
    return [];
  }

  return config.windowKeys
    .map((key) => getWindowValue(key))
    .filter(Boolean);
}

function setStoredInitialUrlByConfig(config = null, value = "") {
  if (!config || !value) {
    return false;
  }

  let wrote = false;

  config.windowKeys.forEach((key) => {
    if (setWindowValueIfEmpty(key, value)) {
      wrote = true;
    }
  });

  return wrote;
}

function captureInitialUrl(AppCore = null) {
  if (!isBrowser()) {
    return false;
  }

  try {
    const href = window.location.href;
    const browserPath = getBrowserPublicUrl();

    setWindowValueIfEmpty(
      "__ONION_INITIAL_URL__",
      href
    );

    const candidates = [
      href,
      browserPath,
    ].filter(Boolean);

    for (const candidate of candidates) {
      const config = getProtectedRouteConfigFromUrl(
        AppCore,
        candidate
      );

      if (
        config &&
        hasProtectedToken(AppCore, candidate) &&
        !isProtectedTokenScrubbed(AppCore, candidate) &&
        getStoredInitialUrlsByConfig(config).length === 0
      ) {
        setStoredInitialUrlByConfig(config, href);
      }
    }

    return true;
  } catch {
    return false;
  }
}

function buildCleanPublicUrl(AppCore, value = "") {
  const path = pathFromUrlLike(AppCore, value);

  if (!path) {
    return "/";
  }

  const parts = parseUrlParts(path);

  const pathname = normalizePathnameOnly(
    stripPublicUsernamePrefix(parts.pathname || "/")
  );

  return buildUrlFromParts({
    pathname,
    search: parts.search,
    hash: parts.hash,
  });
}

function getProtectedInitialUrl(AppCore = null) {
  captureInitialUrl(AppCore);

  const candidates = [];

  for (const config of PROTECTED_TOKEN_ROUTES) {
    if (
      config.scrubFlags.some((flag) => hasScrubFlag(flag))
    ) {
      continue;
    }

    candidates.push(
      ...getStoredInitialUrlsByConfig(config)
    );
  }

  candidates.push(
    getInitialUrl(),
    getBrowserPublicUrl()
  );

  for (const candidate of candidates.filter(Boolean)) {
    if (isProtectedTokenUrl(AppCore, candidate)) {
      return buildCleanPublicUrl(AppCore, candidate);
    }
  }

  return "";
}

function shouldNeverWriteHistory(options = {}) {
  return (
    options.skipHistory === true ||
    options.protectedInitialUrl === true
  );
}

/* =========================================================
   PUBLIC URL NORMALIZATION
========================================================= */

function normalizePublicUrl(
  AppCore,
  url = "/",
  {
    preserveCurrentContext = false,
    preservePath = false,
  } = {}
) {
  const protectedUrl = getProtectedInitialUrl(AppCore);
  const targetKind = getProtectedKind(AppCore, url);
  const protectedKind = getProtectedKind(AppCore, protectedUrl);

  if (
    protectedUrl &&
    targetKind &&
    protectedKind &&
    targetKind === protectedKind
  ) {
    return normalizePath(AppCore, protectedUrl);
  }

  if (preservePath) {
    const currentUrl =
      getBrowserPublicUrl() ||
      getCurrentPublicPath(AppCore) ||
      getCurrentPath(AppCore) ||
      "/";

    return normalizePublicUrl(
      AppCore,
      currentUrl,
      {
        preserveCurrentContext: false,
        preservePath: false,
      }
    );
  }

  const target = parseUrlParts(url);
  const current = parseUrlParts(getBrowserPublicUrl() || "/");

  const normalizedTargetPathname = normalizePathname(
    AppCore,
    target.pathname || "/"
  );

  const normalizedCurrentPathname = normalizePathname(
    AppCore,
    current.pathname || "/"
  );

  const sameRoute =
    normalizedTargetPathname === normalizedCurrentPathname;

  const shouldPreserveSearch =
    preserveCurrentContext &&
    sameRoute &&
    !target.search &&
    Boolean(current.search);

  const shouldPreserveHash =
    preserveCurrentContext &&
    sameRoute &&
    !target.hash &&
    Boolean(current.hash);

  return buildUrlFromParts({
    pathname: normalizedTargetPathname,
    search: shouldPreserveSearch
      ? current.search
      : target.search,
    hash: shouldPreserveHash
      ? current.hash
      : target.hash,
  });
}

function getComparableCurrentUrl(AppCore) {
  const protectedUrl = getProtectedInitialUrl(AppCore);

  if (protectedUrl) {
    return normalizePublicUrl(
      AppCore,
      protectedUrl,
      {
        preserveCurrentContext: false,
      }
    );
  }

  const browserUrl = getBrowserPublicUrl();

  if (browserUrl) {
    return normalizePublicUrl(
      AppCore,
      browserUrl,
      {
        preserveCurrentContext: false,
      }
    );
  }

  return normalizePublicUrl(
    AppCore,
    getCurrentPublicPath(AppCore) ||
      getCurrentPath(AppCore) ||
      "/",
    {
      preserveCurrentContext: false,
    }
  );
}

/* =========================================================
   CONTEXT RESOLUTION
========================================================= */

function getResolvedHistoryContext(
  AppCore,
  pathname = "/",
  options = {}
) {
  const rawPublicPath =
    buildHistoryUrl(
      AppCore,
      options.getRoute,
      pathname,
      options
    ) ||
    pathname ||
    "/";

  const publicPath = normalizePublicUrl(
    AppCore,
    rawPublicPath,
    {
      preserveCurrentContext:
        options.preserveCurrentContext === true,
      preservePath:
        options.preservePath === true,
    }
  );

  const payload =
    buildStatePayload(
      AppCore,
      publicPath
    ) || {};

  const canonicalPath = normalizeCanonicalUrl(
    AppCore,
    options.canonicalPath ||
      payload.canonicalPath ||
      pathname ||
      publicPath ||
      "/"
  );

  const rawCanonicalPath = normalizeCanonicalUrl(
    AppCore,
    options.rawCanonicalPath ||
      options.requestedCanonicalPath ||
      pathname ||
      publicPath ||
      canonicalPath ||
      "/"
  );

  const requestedPath = normalizePublicUrl(
    AppCore,
    options.requestedPath ||
      options.fromPath ||
      pathname ||
      publicPath,
    {
      preserveCurrentContext:
        options.preserveCurrentContext === true,
      preservePath: false,
    }
  );

  const username =
    options.username ||
    options.resolvedUsername ||
    payload.username ||
    getCurrentResolvedUsername(AppCore) ||
    null;

  return {
    publicPath,
    canonicalPath,
    rawCanonicalPath,
    requestedPath,
    username,
  };
}

/* =========================================================
   STATE COMPARISON
========================================================= */

function normalizeStateForCompare(state = null) {
  const value = safeObject(state);

  if (!Object.keys(value).length) {
    return null;
  }

  return {
    publicPath:
      safeText(value.publicPath || value.path, ""),

    canonicalPath:
      safeText(value.canonicalPath, ""),

    rawCanonicalPath:
      safeText(value.rawCanonicalPath, ""),

    requestedPath:
      safeText(value.requestedPath, ""),

    username:
      safeText(value.username, ""),

    source:
      safeText(value.source, ""),

    redirectedFrom:
      safeText(value.redirectedFrom, ""),
  };
}

function isSameHistoryState(currentState = null, nextState = null) {
  const current = normalizeStateForCompare(currentState);
  const next = normalizeStateForCompare(nextState);

  if (!current || !next) {
    return false;
  }

  return (
    current.publicPath === next.publicPath &&
    current.canonicalPath === next.canonicalPath &&
    current.rawCanonicalPath === next.rawCanonicalPath &&
    current.requestedPath === next.requestedPath &&
    current.username === next.username &&
    current.redirectedFrom === next.redirectedFrom
  );
}

/* =========================================================
   BUILDERS
========================================================= */

export function createHistoryState({
  AppCore,
  pathname = "/",
  extras = {},
} = {}) {
  const cleanExtras = safeObject(extras);

  const base =
    buildStatePayload(
      AppCore,
      pathname,
      {
        ts: nowTs(),
        ...cleanExtras,
      }
    ) || {};

  const publicPath =
    cleanExtras.publicPath ||
    base.publicPath ||
    base.path ||
    pathname ||
    "/";

  const canonicalPath =
    cleanExtras.canonicalPath ||
    base.canonicalPath ||
    normalizeCanonicalUrl(AppCore, publicPath);

  const rawCanonicalPath =
    cleanExtras.rawCanonicalPath ||
    base.rawCanonicalPath ||
    canonicalPath;

  const requestedPath =
    cleanExtras.requestedPath ||
    base.requestedPath ||
    publicPath;

  const username =
    cleanExtras.username ||
    base.username ||
    getCurrentResolvedUsername(AppCore) ||
    null;

  return {
    ...base,
    ...cleanExtras,

    __onionRouterHistory: true,
    version: HISTORY_STATE_VERSION,

    id:
      cleanExtras.id ||
      base.id ||
      nextHistoryId(),

    ts:
      cleanExtras.ts ||
      base.ts ||
      nowTs(),

    path: publicPath,
    publicPath,
    canonicalPath,
    rawCanonicalPath,
    requestedPath,
    username,

    source:
      cleanExtras.source ||
      base.source ||
      null,

    redirectedFrom:
      cleanExtras.redirectedFrom ||
      base.redirectedFrom ||
      null,
  };
}

function createResolvedState({
  AppCore,
  pathname = "/",
  options = {},
  mode = "push",
} = {}) {
  const context = getResolvedHistoryContext(
    AppCore,
    pathname,
    options
  );

  const state = createHistoryState({
    AppCore,
    pathname: context.publicPath,
    extras: {
      mode,
      canonicalPath:
        context.canonicalPath,
      rawCanonicalPath:
        context.rawCanonicalPath,
      publicPath:
        context.publicPath,
      requestedPath:
        context.requestedPath,
      username:
        context.username,

      redirectedFrom:
        options.redirectedFrom ||
        null,

      source:
        options.source ||
        null,

      preservePath:
        options.preservePath === true,

      preserveCurrentContext:
        options.preserveCurrentContext === true,
    },
  });

  return {
    ...context,
    state,
  };
}

/* =========================================================
   WRITE
========================================================= */

export function pushState({
  AppCore,
  pathname = "/",
  options = {},
} = {}) {
  if (shouldNeverWriteHistory(options)) {
    safeEmit(
      AppCore,
      "router:history:skip",
      {
        method: "pushState",
        reason: "skip-history",
        pathname,
        options,
      }
    );

    return false;
  }

  const {
    publicPath,
    state,
  } = createResolvedState({
    AppCore,
    pathname,
    options,
    mode: "push",
  });

  const currentState = getCurrentHistoryState();

  if (
    isSameHistoryState(currentState, state) &&
    options.forceHistory !== true
  ) {
    safeEmit(
      AppCore,
      "router:history:skip",
      {
        method: "pushState",
        reason: "same-state",
        publicPath,
        state,
      }
    );

    return false;
  }

  return safeHistoryCall(
    AppCore,
    "pushState",
    state,
    publicPath
  );
}

export function replaceState({
  AppCore,
  pathname = "/",
  options = {},
} = {}) {
  if (shouldNeverWriteHistory(options)) {
    safeEmit(
      AppCore,
      "router:history:skip",
      {
        method: "replaceState",
        reason: "skip-history",
        pathname,
        options,
      }
    );

    return false;
  }

  const {
    publicPath,
    state,
  } = createResolvedState({
    AppCore,
    pathname,
    options,
    mode: "replace",
  });

  const currentState = getCurrentHistoryState();

  if (
    isSameHistoryState(currentState, state) &&
    options.forceHistory !== true
  ) {
    safeEmit(
      AppCore,
      "router:history:skip",
      {
        method: "replaceState",
        reason: "same-state",
        publicPath,
        state,
      }
    );

    return false;
  }

  return safeHistoryCall(
    AppCore,
    "replaceState",
    state,
    publicPath
  );
}

/* =========================================================
   MAIN UPDATE
========================================================= */

export function updateHistory({
  AppCore,
  getRoute,
  pathname = "/",
  options = {},
} = {}) {
  if (!canUseHistory()) {
    return false;
  }

  if (shouldNeverWriteHistory(options)) {
    safeEmit(
      AppCore,
      "router:history:skip",
      {
        method: "updateHistory",
        reason: "skip-history",
        pathname,
        options,
      }
    );

    return false;
  }

  const finalOptions = {
    ...safeObject(options),
    getRoute,
  };

  const {
    publicPath: nextUrl,
    canonicalPath,
    rawCanonicalPath,
    requestedPath,
    username,
  } = getResolvedHistoryContext(
    AppCore,
    pathname,
    finalOptions
  );

  const currentUrl = getComparableCurrentUrl(AppCore);
  const sameCurrentUrl = sameUrl(nextUrl, currentUrl);

  /*
    Anti doble escritura:
    - force render NO implica force history.
    - query/hash forman parte de publicPath.
    - misma URL sin replaceState ni forceHistory no escribe.
  */
  if (
    sameCurrentUrl &&
    finalOptions.replaceState !== true &&
    finalOptions.forceHistory !== true
  ) {
    safeEmit(
      AppCore,
      "router:history:skip",
      {
        method: "updateHistory",
        reason: "same-url",
        nextUrl,
        currentUrl,
        canonicalPath,
        rawCanonicalPath,
        requestedPath,
        username,
      }
    );

    return false;
  }

  const writeOptions = {
    ...finalOptions,
    canonicalPath,
    rawCanonicalPath,
    requestedPath,
    username,
    resolvedUsername:
      username,
  };

  if (
    sameCurrentUrl ||
    finalOptions.replaceState === true
  ) {
    return replaceState({
      AppCore,
      pathname: nextUrl,
      options: writeOptions,
    });
  }

  return pushState({
    AppCore,
    pathname: nextUrl,
    options: writeOptions,
  });
}

/* =========================================================
   INITIAL STATE
========================================================= */

export function ensureInitialHistoryState({
  AppCore,
} = {}) {
  if (!canUseHistory()) {
    return false;
  }

  try {
    captureInitialUrl(AppCore);

    const protectedUrl = getProtectedInitialUrl(AppCore);

    const currentUrl =
      protectedUrl ||
      getComparableCurrentUrl(AppCore) ||
      "/";

    const currentCanonicalPath = normalizeCanonicalUrl(
      AppCore,
      currentUrl ||
        getCurrentCanonicalPath(AppCore) ||
        getBrowserPublicUrl() ||
        "/"
    );

    const currentUsername =
      getCurrentResolvedUsername(AppCore) ||
      null;

    const currentState = getCurrentHistoryState();

    if (currentState && typeof currentState === "object") {
      const statePublicPath = normalizePublicUrl(
        AppCore,
        currentState.publicPath ||
          currentState.path ||
          "/",
        {
          preserveCurrentContext: false,
        }
      );

      const stateCanonicalPath = normalizeCanonicalUrl(
        AppCore,
        currentState.canonicalPath ||
          "/"
      );

      const stateVersion =
        Number(currentState.version || 0);

      if (
        stateVersion >= HISTORY_STATE_VERSION &&
        statePublicPath === currentUrl &&
        stateCanonicalPath === currentCanonicalPath
      ) {
        return true;
      }
    }

    const state = createHistoryState({
      AppCore,
      pathname: currentUrl,
      extras: {
        mode: "initial",
        canonicalPath:
          currentCanonicalPath,
        rawCanonicalPath:
          currentCanonicalPath,
        publicPath:
          currentUrl,
        requestedPath:
          currentUrl,
        username:
          currentUsername,
        source:
          "initial",

        protectedActivationToken:
          Boolean(
            protectedUrl &&
              isActivationPath(AppCore, protectedUrl)
          ),

        protectedResetToken:
          Boolean(
            protectedUrl &&
              isResetConfirmPath(AppCore, protectedUrl)
          ),
      },
    });

    return safeHistoryCall(
      AppCore,
      "replaceState",
      state,
      currentUrl
    );
  } catch (error) {
    safeWarn(
      AppCore,
      "ensureInitialHistoryState falló.",
      error
    );

    return false;
  }
}

/* =========================================================
   NAVIGATION
========================================================= */

export function back() {
  if (!canUseHistory()) {
    return false;
  }

  try {
    window.history.back();
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   POPSTATE HELPERS
========================================================= */

export function getPopStatePath(AppCore, eventOrState = null) {
  const state =
    eventOrState?.state ||
    eventOrState ||
    getCurrentHistoryState() ||
    {};

  const fromState =
    safeText(
      state.publicPath ||
        state.path ||
        state.requestedPath ||
        "",
      ""
    );

  if (fromState) {
    return normalizePublicUrl(
      AppCore,
      fromState,
      {
        preserveCurrentContext: false,
      }
    );
  }

  return getComparableCurrentUrl(AppCore) || "/";
}

/* =========================================================
   DEBUG
========================================================= */

export function getHistorySnapshot(AppCore) {
  const comparableUrl =
    getComparableCurrentUrl(AppCore);

  const protectedInitialUrl =
    getProtectedInitialUrl(AppCore);

  return {
    canUseHistory:
      canUseHistory(),

    historyStateVersion:
      HISTORY_STATE_VERSION,

    browserPublicUrl:
      getBrowserPublicUrl(),

    currentComparableUrl:
      comparableUrl,

    protectedInitialUrl,

    activationInitialUrl:
      getActivationInitialUrl(),

    resetConfirmInitialUrl:
      getResetConfirmInitialUrl(),

    initialUrl:
      getInitialUrl(),

    activationTokenScrubbed:
      isProtectedTokenScrubbed(
        AppCore,
        ACTIVATION_PATH
      ),

    resetTokenScrubbed:
      isProtectedTokenScrubbed(
        AppCore,
        RESET_CONFIRM_PATH
      ),

    currentCanonicalPath:
      normalizeCanonicalUrl(
        AppCore,
        comparableUrl || "/"
      ),

    currentPublicPath:
      comparableUrl,

    currentAppPublicPath:
      getCurrentPublicPath(AppCore) || null,

    currentAppCanonicalPath:
      getCurrentCanonicalPath(AppCore) || null,

    currentAppPath:
      getCurrentPath(AppCore) || null,

    currentResolvedUsername:
      getCurrentResolvedUsername(AppCore) || null,

    seq:
      historySeq,

    state:
      canUseHistory()
        ? window.history.state
        : null,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  createHistoryState,

  pushState,
  replaceState,
  updateHistory,

  ensureInitialHistoryState,

  back,

  getPopStatePath,
  getHistorySnapshot,
};
