/* =========================================================
   Onion SPA - Router History
   Archivo: src/router/history.js

   RESPONSABILIDADES:
   - centralizar pushState / replaceState
   - construir state payload consistente
   - init state inicial idempotente
   - navegación back segura
   - helpers reutilizables para router

   HARDENING EXTREMO:
   - guards browser robustos
   - fallback silencioso si History API falla
   - normalización estricta URL/state
   - no duplicar estados innecesarios
   - preservar publicPath/canonicalPath/username
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
   - timestamps estables
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

const PROTECTED_TOKEN_PATHS = Object.freeze([
  ACTIVATION_PATH,
  RESET_CONFIRM_PATH,
]);

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

function getBaseOrigin() {
  if (isBrowser() && window.location?.origin) {
    return window.location.origin;
  }

  return "http://localhost";
}

function safeHistoryCall(method, state, url) {
  if (!canUseHistory()) {
    return false;
  }

  if (
    method !== "pushState" &&
    method !== "replaceState"
  ) {
    return false;
  }

  try {
    window.history[method](state, "", url);
    return true;
  } catch {
    return false;
  }
}

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

function parseUrlParts(value = "/") {
  const raw = safeText(value, "/");

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

function buildUrlFromParts({
  pathname = "/",
  search = "",
  hash = "",
} = {}) {
  return `${pathname || "/"}${search || ""}${hash || ""}`;
}

function normalizeCanonicalUrl(AppCore, url = "/") {
  try {
    return normalizeCanonicalPath(AppCore, url || "/");
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
   TOKEN PROTECTION
========================================================= */

function getProtectedKind(url = "") {
  const canonical = normalizeCanonicalUrl(null, url || "/");

  if (canonical === ACTIVATION_PATH) {
    return "activation";
  }

  if (canonical === RESET_CONFIRM_PATH) {
    return "reset-confirm";
  }

  return "";
}

function isProtectedTokenPath(url = "") {
  return Boolean(getProtectedKind(url));
}

function isActivationPath(url = "") {
  return getProtectedKind(url) === "activation";
}

function isResetConfirmPath(url = "") {
  return getProtectedKind(url) === "reset-confirm";
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

function getTokenNamesForUrl(url = "") {
  if (isResetConfirmPath(url)) {
    return RESET_TOKEN_PARAM_NAMES;
  }

  return ACTIVATION_TOKEN_PARAM_NAMES;
}

function getProtectedPathToken(url = "") {
  const raw = safeText(url, "");

  if (!raw) {
    return "";
  }

  const parts = parseUrlParts(raw);

  const pathname = stripPublicUsernamePrefix(
    parts.pathname || "/"
  );

  for (const basePath of PROTECTED_TOKEN_PATHS) {
    if (!pathname.startsWith(`${basePath}/`)) {
      continue;
    }

    const token = pathname.slice(`${basePath}/`.length).split("/")[0];

    try {
      return safeText(
        decodeURIComponent(token || ""),
        ""
      );
    } catch {
      return safeText(token, "");
    }
  }

  return "";
}

function hasProtectedToken(url = "") {
  const raw = safeText(url, "");

  if (!raw) {
    return false;
  }

  if (
    isProtectedTokenPath(raw) &&
    getProtectedPathToken(raw)
  ) {
    return true;
  }

  const parts = parseUrlParts(raw);
  const tokenNames = getTokenNamesForUrl(raw);

  if (hasTokenInSearch(parts.search, tokenNames)) {
    return true;
  }

  if (parts.hash && isHashRouterPath(parts.hash)) {
    const hashParts = parseUrlParts(
      normalizeHashRouterPath(parts.hash)
    );

    if (hasTokenInSearch(hashParts.search, tokenNames)) {
      return true;
    }

    if (getProtectedPathToken(normalizeHashRouterPath(parts.hash))) {
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

function isActivationTokenScrubbed() {
  if (!canUseHistory()) {
    return false;
  }

  try {
    return Boolean(window.history?.state?.scrubbedActivationToken);
  } catch {
    return false;
  }
}

function isResetTokenScrubbed() {
  if (!canUseHistory()) {
    return false;
  }

  try {
    return Boolean(
      window.history?.state?.scrubbedResetToken ||
        window.history?.state?.scrubbedResetPasswordToken
    );
  } catch {
    return false;
  }
}

function isProtectedTokenScrubbed(url = "") {
  if (isActivationPath(url)) {
    return isActivationTokenScrubbed();
  }

  if (isResetConfirmPath(url)) {
    return isResetTokenScrubbed();
  }

  return false;
}

function isProtectedTokenUrl(url = "") {
  if (isProtectedTokenScrubbed(url)) {
    return false;
  }

  return (
    isProtectedTokenPath(url) &&
    hasProtectedToken(url)
  );
}

/* =========================================================
   INITIAL URL CAPTURE
========================================================= */

function getInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(window.__ONION_INITIAL_URL__, "");
}

function getActivationInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__, "");
}

function getResetConfirmInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(
    window.__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__ ||
      window.__ONION_RESET_CONFIRM_INITIAL_URL__,
    ""
  );
}

function captureInitialUrl() {
  if (!isBrowser()) {
    return false;
  }

  try {
    const href = window.location.href;

    if (!window.__ONION_INITIAL_URL__) {
      window.__ONION_INITIAL_URL__ = href;
    }

    if (
      isActivationPath(href) &&
      hasProtectedToken(href) &&
      !window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__
    ) {
      window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__ = href;
    }

    if (
      isResetConfirmPath(href) &&
      hasProtectedToken(href)
    ) {
      if (!window.__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__) {
        window.__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__ = href;
      }

      if (!window.__ONION_RESET_CONFIRM_INITIAL_URL__) {
        window.__ONION_RESET_CONFIRM_INITIAL_URL__ = href;
      }
    }

    return true;
  } catch {
    return false;
  }
}

function buildCleanPublicUrl(value = "") {
  const parts = parseUrlParts(value);

  const pathname = normalizePathnameOnly(
    stripPublicUsernamePrefix(parts.pathname || "/")
  );

  return buildUrlFromParts({
    pathname,
    search: parts.search,
    hash: parts.hash,
  });
}

function getProtectedInitialUrl() {
  captureInitialUrl();

  const candidates = [
    getActivationInitialUrl(),
    getResetConfirmInitialUrl(),
    getInitialUrl(),
    getBrowserPublicUrl(),
  ]
    .map((value) => safeText(value, ""))
    .filter(Boolean);

  for (const candidate of candidates) {
    if (isProtectedTokenUrl(candidate)) {
      return buildCleanPublicUrl(candidate);
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

/**
 * URL pública para History API.
 *
 * IMPORTANTE:
 * - normaliza SOLO pathname
 * - conserva search/hash del target
 * - solo conserva search/hash actuales si se solicita expresamente
 * - nunca limpia rutas públicas con token antes de que la vista capture el token
 */
function normalizePublicUrl(
  AppCore,
  url = "/",
  {
    preserveCurrentContext = false,
  } = {}
) {
  const protectedUrl = getProtectedInitialUrl();

  if (
    protectedUrl &&
    isProtectedTokenPath(url) &&
    getProtectedKind(protectedUrl) === getProtectedKind(url)
  ) {
    return normalizePath(AppCore, protectedUrl);
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
  const protectedUrl = getProtectedInitialUrl();

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

  const username =
    options.username ||
    options.resolvedUsername ||
    payload.username ||
    getCurrentResolvedUsername(AppCore) ||
    null;

  return {
    publicPath,
    canonicalPath,
    username,
  };
}

/* =========================================================
   STATE COMPARISON
========================================================= */

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

function isSameHistoryState(currentState = null, nextState = null) {
  const current = safeObject(currentState);
  const next = safeObject(nextState);

  if (!Object.keys(current).length || !Object.keys(next).length) {
    return false;
  }

  return (
    safeText(current.publicPath || current.path, "") ===
      safeText(next.publicPath || next.path, "") &&
    safeText(current.canonicalPath, "") ===
      safeText(next.canonicalPath, "") &&
    safeText(current.username, "") ===
      safeText(next.username, "")
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
  return buildStatePayload(
    AppCore,
    pathname,
    {
      ts: nowTs(),
      ...extras,
    }
  );
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
    return false;
  }

  const {
    publicPath,
    canonicalPath,
    username,
  } = getResolvedHistoryContext(
    AppCore,
    pathname,
    options
  );

  const state = createHistoryState({
    AppCore,
    pathname: publicPath,
    extras: {
      mode: "push",
      canonicalPath,
      publicPath,
      username,
      redirectedFrom:
        options.redirectedFrom ||
        null,
      source:
        options.source ||
        null,
    },
  });

  const currentState = getCurrentHistoryState();

  if (
    isSameHistoryState(currentState, state) &&
    options.forceHistory !== true
  ) {
    return false;
  }

  return safeHistoryCall(
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
    return false;
  }

  const {
    publicPath,
    canonicalPath,
    username,
  } = getResolvedHistoryContext(
    AppCore,
    pathname,
    options
  );

  const state = createHistoryState({
    AppCore,
    pathname: publicPath,
    extras: {
      mode: "replace",
      canonicalPath,
      publicPath,
      username,
      redirectedFrom:
        options.redirectedFrom ||
        null,
      source:
        options.source ||
        null,
    },
  });

  const currentState = getCurrentHistoryState();

  if (
    isSameHistoryState(currentState, state) &&
    options.forceHistory !== true
  ) {
    return false;
  }

  return safeHistoryCall(
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
  if (
    !canUseHistory() ||
    shouldNeverWriteHistory(options)
  ) {
    return false;
  }

  const finalOptions = {
    ...options,
    getRoute,
  };

  const {
    publicPath: nextUrl,
    canonicalPath,
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
    - Solo escribimos misma URL si se pide replaceState o forceHistory.
  */
  if (
    sameCurrentUrl &&
    options.replaceState !== true &&
    options.forceHistory !== true
  ) {
    return false;
  }

  const writeOptions = {
    ...finalOptions,
    canonicalPath,
    username,
    resolvedUsername:
      username,
  };

  if (
    sameCurrentUrl ||
    options.replaceState === true
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
    captureInitialUrl();

    const protectedUrl = getProtectedInitialUrl();

    const currentUrl =
      protectedUrl ||
      getComparableCurrentUrl(AppCore);

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

      if (
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
        canonicalPath: currentCanonicalPath,
        publicPath: currentUrl,
        username: currentUsername,
        protectedActivationToken:
          Boolean(
            protectedUrl &&
              isActivationPath(protectedUrl)
          ),
        protectedResetToken:
          Boolean(
            protectedUrl &&
              isResetConfirmPath(protectedUrl)
          ),
      },
    });

    return safeHistoryCall(
      "replaceState",
      state,
      currentUrl
    );
  } catch {
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
   DEBUG
========================================================= */

export function getHistorySnapshot(AppCore) {
  return {
    canUseHistory:
      canUseHistory(),

    browserPublicUrl:
      getBrowserPublicUrl(),

    currentComparableUrl:
      getComparableCurrentUrl(AppCore),

    protectedInitialUrl:
      getProtectedInitialUrl(),

    activationInitialUrl:
      getActivationInitialUrl(),

    resetConfirmInitialUrl:
      getResetConfirmInitialUrl(),

    initialUrl:
      getInitialUrl(),

    activationTokenScrubbed:
      isActivationTokenScrubbed(),

    resetTokenScrubbed:
      isResetTokenScrubbed(),

    currentCanonicalPath:
      normalizeCanonicalUrl(
        AppCore,
        getComparableCurrentUrl(AppCore) || "/"
      ),

    currentPublicPath:
      getComparableCurrentUrl(AppCore),

    state:
      canUseHistory()
        ? window.history.state
        : null,
  };
}

export default {
  createHistoryState,
  pushState,
  replaceState,
  updateHistory,
  ensureInitialHistoryState,
  back,
  getHistorySnapshot,
};
