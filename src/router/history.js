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
   - respetar skipHistory / preservePath / protectedInitialUrl
   - soporte hash-router /#/activate-account?token=...
   - timestamps estables
========================================================= */

import {
  isBrowser,
  normalizePath,
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

const ACTIVATION_TOKEN_PARAM_NAMES = [
  "token",
  "activationToken",
  "activateToken",
  "code",
  "t",
];

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

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://onion.local";
}

function safeHistoryCall(
  method,
  state,
  url
) {
  if (!canUseHistory()) {
    return false;
  }

  try {
    window.history[method](
      state,
      "",
      url
    );

    return true;
  } catch {
    return false;
  }
}

function normalizePathname(
  AppCore,
  pathname = "/"
) {
  try {
    return normalizePath(
      AppCore,
      pathname || "/"
    );
  } catch {
    return "/";
  }
}

function isHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function getBrowserPublicUrl() {
  if (
    !isBrowser() ||
    typeof window === "undefined" ||
    !window.location
  ) {
    return "";
  }

  try {
    const pathname =
      window.location.pathname || "/";

    const search =
      window.location.search || "";

    const hash =
      window.location.hash || "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
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
    return parseUrlParts(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    const parsed = new URL(
      raw,
      getBaseOrigin()
    );

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      return parseUrlParts(
        normalizeHashRouterPath(parsed.hash)
      );
    }

    return {
      pathname: parsed.pathname || "/",
      search: parsed.search || "",
      hash: parsed.hash || "",
    };
  } catch {
    const [pathAndSearch = "/", hashPart = ""] = raw.split("#");
    const [pathname = "/", searchPart = ""] = pathAndSearch.split("?");

    return {
      pathname: pathname || "/",
      search: searchPart ? `?${searchPart}` : "",
      hash: hashPart ? `#${hashPart}` : "",
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

function normalizeCanonicalUrl(
  AppCore,
  url = "/"
) {
  const parts = parseUrlParts(url);

  return normalizePathname(
    AppCore,
    parts.pathname || "/"
  );
}

/* =========================================================
   ACTIVATION TOKEN PROTECTION
========================================================= */

function isActivationPath(url = "") {
  const canonical =
    normalizeCanonicalUrl(
      null,
      url || "/"
    );

  return (
    canonical === ACTIVATION_PATH ||
    canonical.startsWith(`${ACTIVATION_PATH}/`)
  );
}

function hasTokenInSearch(search = "") {
  try {
    const params =
      new URLSearchParams(search || "");

    return ACTIVATION_TOKEN_PARAM_NAMES.some(
      (name) =>
        Boolean(
          safeText(
            params.get(name),
            ""
          )
        )
    );
  } catch {
    return false;
  }
}

function hasActivationToken(url = "") {
  const raw =
    safeText(url, "");

  if (!raw) {
    return false;
  }

  const parts =
    parseUrlParts(raw);

  if (
    hasTokenInSearch(parts.search)
  ) {
    return true;
  }

  if (
    parts.hash &&
    parts.hash.includes("?")
  ) {
    const query =
      parts.hash.split("?").slice(1).join("?");

    return hasTokenInSearch(
      query ? `?${query}` : ""
    );
  }

  return false;
}

function isActivationTokenScrubbed() {
  if (!canUseHistory()) {
    return false;
  }

  try {
    return Boolean(
      window.history?.state?.scrubbedActivationToken
    );
  } catch {
    return false;
  }
}

function isProtectedActivationUrl(url = "") {
  if (isActivationTokenScrubbed()) {
    return false;
  }

  return (
    isActivationPath(url) &&
    hasActivationToken(url)
  );
}

function getInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(
    window.__ONION_INITIAL_URL__,
    ""
  );
}

function getActivationInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(
    window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__,
    ""
  );
}

function captureInitialUrl() {
  if (!isBrowser()) {
    return false;
  }

  try {
    const href =
      window.location.href;

    if (!window.__ONION_INITIAL_URL__) {
      window.__ONION_INITIAL_URL__ = href;
    }

    if (
      isActivationPath(href) &&
      !window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__
    ) {
      window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__ = href;
    }

    return true;
  } catch {
    return false;
  }
}

function getProtectedActivationUrl() {
  if (isActivationTokenScrubbed()) {
    return "";
  }

  captureInitialUrl();

  const activationInitialUrl =
    getActivationInitialUrl();

  if (
    activationInitialUrl &&
    isProtectedActivationUrl(activationInitialUrl)
  ) {
    const parts =
      parseUrlParts(activationInitialUrl);

    return buildUrlFromParts(parts);
  }

  const initialUrl =
    getInitialUrl();

  if (
    initialUrl &&
    isProtectedActivationUrl(initialUrl)
  ) {
    const parts =
      parseUrlParts(initialUrl);

    return buildUrlFromParts(parts);
  }

  const browserUrl =
    getBrowserPublicUrl();

  if (
    browserUrl &&
    isProtectedActivationUrl(browserUrl)
  ) {
    const parts =
      parseUrlParts(browserUrl);

    return buildUrlFromParts(parts);
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
 * - nunca limpia /activate-account?token=... antes de que la vista lo capture
 */
function normalizePublicUrl(
  AppCore,
  url = "/",
  {
    preserveCurrentContext = false,
  } = {}
) {
  const protectedUrl =
    getProtectedActivationUrl();

  if (
    protectedUrl &&
    isActivationPath(url)
  ) {
    return normalizePath(
      AppCore,
      protectedUrl
    );
  }

  const target =
    parseUrlParts(url);

  const current =
    parseUrlParts(
      getBrowserPublicUrl() || "/"
    );

  const normalizedTargetPathname =
    normalizePathname(
      AppCore,
      target.pathname || "/"
    );

  const normalizedCurrentPathname =
    normalizePathname(
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

function getComparableCurrentUrl(
  AppCore
) {
  const protectedUrl =
    getProtectedActivationUrl();

  if (protectedUrl) {
    return normalizePublicUrl(
      AppCore,
      protectedUrl,
      {
        preserveCurrentContext: false,
      }
    );
  }

  const browserUrl =
    getBrowserPublicUrl();

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
    ) || pathname || "/";

  const publicPath =
    normalizePublicUrl(
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

  const canonicalPath =
    normalizeCanonicalUrl(
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
    getCurrentResolvedUsername(
      AppCore
    ) ||
    null;

  return {
    publicPath,
    canonicalPath,
    username,
  };
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
  if (
    shouldNeverWriteHistory(options)
  ) {
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

  const state =
    createHistoryState({
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
      },
    });

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
  if (
    shouldNeverWriteHistory(options)
  ) {
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

  const state =
    createHistoryState({
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
      },
    });

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

  const currentUrl =
    getComparableCurrentUrl(
      AppCore
    );

  const sameUrl =
    nextUrl === currentUrl;

  if (
    sameUrl &&
    !options.force &&
    !options.replaceState
  ) {
    return false;
  }

  const writeOptions = {
    ...finalOptions,
    canonicalPath,
    username,
    resolvedUsername: username,
  };

  if (
    sameUrl ||
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

    const protectedUrl =
      getProtectedActivationUrl();

    const currentUrl =
      protectedUrl ||
      getComparableCurrentUrl(
        AppCore
      );

    const currentCanonicalPath =
      normalizeCanonicalUrl(
        AppCore,
        currentUrl ||
          getCurrentCanonicalPath(AppCore) ||
          getBrowserPublicUrl() ||
          "/"
      );

    const currentUsername =
      getCurrentResolvedUsername(
        AppCore
      ) || null;

    const currentState =
      window.history.state;

    if (
      currentState &&
      typeof currentState === "object"
    ) {
      const statePublicPath =
        normalizePublicUrl(
          AppCore,
          currentState.publicPath ||
            currentState.path ||
            "/",
          {
            preserveCurrentContext: false,
          }
        );

      const stateCanonicalPath =
        normalizeCanonicalUrl(
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

    const state =
      createHistoryState({
        AppCore,
        pathname: currentUrl,
        extras: {
          mode: "initial",
          canonicalPath: currentCanonicalPath,
          publicPath: currentUrl,
          username: currentUsername,
          protectedActivationToken:
            Boolean(protectedUrl),
        },
      });

    window.history.replaceState(
      state,
      "",
      currentUrl
    );

    return true;
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

    protectedActivationUrl:
      getProtectedActivationUrl(),

    activationInitialUrl:
      getActivationInitialUrl(),

    initialUrl:
      getInitialUrl(),

    activationTokenScrubbed:
      isActivationTokenScrubbed(),

    state:
      canUseHistory()
        ? window.history.state
        : null,
  };
}
