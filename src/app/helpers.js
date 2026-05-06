/* =========================================================
   Onion SPA - App Helpers
   Archivo: src/app/helpers.js

   ONION SUPPORT · APP HELPERS
   PATH CORE · TOKEN ROUTES SAFE · CLEANUP SAFE · EXTREME 10/10

   RESPONSABILIDADES:
   - Resolver paths actuales de la app.
   - Normalizar publicPath y canonicalPath.
   - Preservar query/hash en rutas públicas sensibles.
   - Preservar token de activación antes del primer render.
   - Preservar token de reset antes del primer render.
   - NO resucitar token tras scrub oficial.
   - Escapar HTML seguro para render inline.
   - Gestionar scope global de cleanup.
   - Registrar módulos en AppCore sin duplicados.
   - Mantener coherencia:
       publicPath    = URL pública real, puede llevar @usuario/query/hash.
       canonicalPath = ruta interna limpia, sin @usuario/query/hash.

   HARDENING:
   - Browser/server safe.
   - Cero throws accidentales.
   - Idempotente.
   - Hash router compatible:
       /#/activate-account?token=...
       /#!/reset-password/confirm?token=...
   - Token por query/path/hash-query compatible.
   - Scrub detection por history.state.
   - Debug snapshot sin tokens reales.
========================================================= */

import { APP_SCOPE } from "./constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_ROUTE = "/";
const INITIAL_URL_KEY = "__ONION_INITIAL_URL__";

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
  "code",
  "t",
]);

const GENERIC_TOKEN_PARAM_NAMES = Object.freeze([
  "token",
  "activationToken",
  "activateToken",
  "resetToken",
  "passwordResetToken",
  "code",
  "t",
  "access_token",
  "refresh_token",
  "id_token",
]);

const PROTECTED_PUBLIC_TOKEN_ROUTES = Object.freeze([
  Object.freeze({
    key: "activation",
    path: ACTIVATION_PATH,
    windowKey: "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
    stateUrlKey: "bootActivationInitialUrl",
    statePathKey: "bootActivationInitialPath",
    stateIsRouteKey: "bootIsActivation",
    stateHasTokenKey: "bootHasActivationToken",
    scrubbedStateKeys: Object.freeze([
      "scrubbedActivationToken",
      "activationTokenScrubbed",
      "scrubbedActivateAccountToken",
    ]),
    tokenParamNames: ACTIVATION_TOKEN_PARAM_NAMES,
  }),

  Object.freeze({
    key: "resetConfirm",
    path: RESET_CONFIRM_PATH,
    windowKey: "__ONION_RESET_CONFIRM_INITIAL_URL__",
    stateUrlKey: "bootResetConfirmInitialUrl",
    statePathKey: "bootResetConfirmInitialPath",
    stateIsRouteKey: "bootIsResetConfirm",
    stateHasTokenKey: "bootHasResetToken",
    scrubbedStateKeys: Object.freeze([
      "scrubbedResetToken",
      "resetTokenScrubbed",
      "scrubbedResetConfirmToken",
      "scrubbedPasswordResetToken",
    ]),
    tokenParamNames: RESET_TOKEN_PARAM_NAMES,
  }),
]);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value) {
  return isObject(value)
    ? value
    : {};
}

function isFunction(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

/* =========================================================
   HASH ROUTER
========================================================= */

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
    return DEFAULT_ROUTE;
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

/* =========================================================
   PATH NORMALIZATION
========================================================= */

function splitRawPath(path = DEFAULT_ROUTE) {
  const raw = safeText(path, DEFAULT_ROUTE) || DEFAULT_ROUTE;

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
    pathname,
    search,
    hash,
  };
}

function normalizeSearch(search = "") {
  const raw = safeText(search, "");

  if (!raw) {
    return "";
  }

  return raw.startsWith("?")
    ? raw
    : `?${raw.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const raw = safeText(hash, "");

  if (!raw) {
    return "";
  }

  return raw.startsWith("#")
    ? raw
    : `#${raw.replace(/^#+/, "")}`;
}

function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
  let value = String(pathname || DEFAULT_ROUTE)
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) {
    value = DEFAULT_ROUTE;
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value = value.replace(/\/+$/g, "") || DEFAULT_ROUTE;
  }

  return value;
}

function fallbackNormalizePath(path = DEFAULT_ROUTE) {
  const raw = safeText(path, DEFAULT_ROUTE) || DEFAULT_ROUTE;

  if (isHashRouterPath(raw)) {
    return fallbackNormalizePath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed = new URL(raw, getBaseOrigin());

      if (
        parsed.hash &&
        isHashRouterPath(parsed.hash)
      ) {
        return fallbackNormalizePath(
          normalizeHashRouterPath(parsed.hash)
        );
      }

      return fallbackNormalizePath(
        `${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {}

  const {
    pathname,
    search,
    hash,
  } = splitRawPath(raw);

  return `${normalizePathnameOnly(pathname)}${normalizeSearch(search)}${normalizeHash(hash)}`;
}

export function normalizePublicPath(AppCore, path = DEFAULT_ROUTE) {
  const raw = safeText(path, DEFAULT_ROUTE) || DEFAULT_ROUTE;
  const fallback = fallbackNormalizePath(raw);

  /*
    No delegamos a AppCore.utils.normalizePath si hay query/hash.
    Algunos normalizadores internos devuelven solo pathname y se comen tokens.
  */
  const hasSuffix =
    raw.includes("?") ||
    raw.includes("#");

  if (hasSuffix) {
    return fallback;
  }

  try {
    if (isFunction(AppCore?.utils?.normalizePath)) {
      const delegated = AppCore.utils.normalizePath(raw);

      if (delegated) {
        return fallbackNormalizePath(delegated);
      }
    }
  } catch {}

  return fallback;
}

function stripSearchAndHash(path = DEFAULT_ROUTE) {
  return splitRawPath(
    fallbackNormalizePath(path)
  ).pathname;
}

function getSearchAndHash(path = DEFAULT_ROUTE) {
  const parts = splitRawPath(
    fallbackNormalizePath(path)
  );

  return `${parts.search}${parts.hash}`;
}

function isUsernameSegment(segment = "") {
  return /^@[A-Za-z0-9._-]{1,80}$/.test(
    safeText(segment, "")
  );
}

export function stripUsernamePrefix(path = DEFAULT_ROUTE) {
  const normalized = fallbackNormalizePath(path);
  const pathname = stripSearchAndHash(normalized);
  const suffix = getSearchAndHash(normalized);

  const segments = pathname
    .split("/")
    .filter(Boolean);

  if (
    segments.length > 0 &&
    isUsernameSegment(segments[0])
  ) {
    const rest = segments.slice(1).join("/");

    return fallbackNormalizePath(
      `${rest ? `/${rest}` : DEFAULT_ROUTE}${suffix}`
    );
  }

  return fallbackNormalizePath(`${pathname}${suffix}`);
}

function fallbackNormalizeCanonicalPath(path = DEFAULT_ROUTE) {
  const stripped = stripUsernamePrefix(path);
  const pathname = stripSearchAndHash(stripped);

  return normalizePathnameOnly(pathname);
}

export function normalizeCanonicalPath(AppCore, path = DEFAULT_ROUTE) {
  const raw = safeText(path, DEFAULT_ROUTE) || DEFAULT_ROUTE;
  const fallback = fallbackNormalizeCanonicalPath(raw);

  const hasSuffix =
    raw.includes("?") ||
    raw.includes("#");

  if (hasSuffix) {
    return fallback;
  }

  try {
    if (isFunction(AppCore?.utils?.normalizeCanonicalPath)) {
      const delegated = AppCore.utils.normalizeCanonicalPath(raw);

      if (delegated) {
        return fallbackNormalizeCanonicalPath(delegated);
      }
    }
  } catch {}

  return fallback;
}

/* =========================================================
   URL CONVERSION
========================================================= */

function buildBrowserPath() {
  if (!isBrowser()) {
    return DEFAULT_ROUTE;
  }

  try {
    const pathname = window.location.pathname || DEFAULT_ROUTE;
    const search = window.location.search || "";
    const hash = window.location.hash || "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
      return fallbackNormalizePath(
        normalizeHashRouterPath(hash)
      );
    }

    return fallbackNormalizePath(
      `${pathname}${search}${hash}`
    );
  } catch {
    return DEFAULT_ROUTE;
  }
}

function pathFromUrlLike(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isHashRouterPath(raw)) {
    return fallbackNormalizePath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    const parsed = new URL(raw, getBaseOrigin());

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      return fallbackNormalizePath(
        normalizeHashRouterPath(parsed.hash)
      );
    }

    return fallbackNormalizePath(
      `${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`
    );
  } catch {
    return fallbackNormalizePath(raw);
  }
}

/* =========================================================
   TOKEN REDACTION
========================================================= */

export function redactTokenInText(value = "") {
  let output = safeText(value, "");

  if (!output) {
    return "";
  }

  for (const name of GENERIC_TOKEN_PARAM_NAMES) {
    try {
      output = output.replace(
        new RegExp(`([?&#]${name}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
    try {
      const escapedPath = config.path.replace(/\//g, "\\/");

      output = output.replace(
        new RegExp(`(${escapedPath})\\/([^/?#\\s]+)`, "gi"),
        "$1/***"
      );
    } catch {}
  }

  try {
    output = output.replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    );
  } catch {}

  return output;
}

/* =========================================================
   PROTECTED PUBLIC TOKEN ROUTES
========================================================= */

function matchesProtectedRoute(config, pathOrUrl = "") {
  if (!config?.path) {
    return false;
  }

  const path = pathFromUrlLike(pathOrUrl);
  const pathname = stripSearchAndHash(path);

  return (
    pathname === config.path ||
    pathname.startsWith(`${config.path}/`)
  );
}

function getProtectedRouteConfig(value = "") {
  return (
    PROTECTED_PUBLIC_TOKEN_ROUTES.find((config) =>
      matchesProtectedRoute(config, value)
    ) || null
  );
}

function extractPathToken(config, pathOrUrl = "") {
  if (!config?.path) {
    return "";
  }

  const path = pathFromUrlLike(pathOrUrl);
  const pathname = stripSearchAndHash(path);

  if (!pathname.startsWith(`${config.path}/`)) {
    return "";
  }

  const token = pathname
    .slice(`${config.path}/`.length)
    .split("/")[0];

  try {
    return safeText(decodeURIComponent(token || ""), "");
  } catch {
    return safeText(token, "");
  }
}

function hasTokenInSearch(search = "", names = []) {
  try {
    const params = new URLSearchParams(search || "");

    return names.some((name) =>
      Boolean(safeText(params.get(name), ""))
    );
  } catch {
    return false;
  }
}

function hasProtectedRouteToken(config, pathOrUrl = "") {
  if (!config) {
    return false;
  }

  const raw = safeText(pathOrUrl, "");

  if (!raw) {
    return false;
  }

  if (extractPathToken(config, raw)) {
    return true;
  }

  try {
    const parsed = new URL(raw, getBaseOrigin());

    if (
      hasTokenInSearch(
        parsed.search,
        config.tokenParamNames || []
      )
    ) {
      return true;
    }

    if (
      parsed.hash &&
      parsed.hash.includes("?")
    ) {
      const query = parsed.hash
        .split("?")
        .slice(1)
        .join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        config.tokenParamNames || []
      );
    }

    return false;
  } catch {
    const normalized = fallbackNormalizePath(raw);

    if (extractPathToken(config, normalized)) {
      return true;
    }

    const parts = splitRawPath(normalized);

    if (
      hasTokenInSearch(
        parts.search,
        config.tokenParamNames || []
      )
    ) {
      return true;
    }

    if (
      parts.hash &&
      parts.hash.includes("?")
    ) {
      const query = parts.hash
        .split("?")
        .slice(1)
        .join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        config.tokenParamNames || []
      );
    }

    return false;
  }
}

export function isProtectedPublicTokenPath(pathOrUrl = "") {
  const config = getProtectedRouteConfig(pathOrUrl);

  return Boolean(
    config &&
    hasProtectedRouteToken(config, pathOrUrl)
  );
}

export function isActivationPath(path = "") {
  return matchesProtectedRoute(
    PROTECTED_PUBLIC_TOKEN_ROUTES[0],
    path
  );
}

export function isResetConfirmPath(path = "") {
  return matchesProtectedRoute(
    PROTECTED_PUBLIC_TOKEN_ROUTES[1],
    path
  );
}

/* =========================================================
   INITIAL URL STORAGE
========================================================= */

function getWindowValue(key = "") {
  if (
    !isBrowser() ||
    !key
  ) {
    return "";
  }

  try {
    return safeText(window[key], "");
  } catch {
    return "";
  }
}

function setWindowValue(key = "", value = "", onlyIfMissing = true) {
  if (
    !isBrowser() ||
    !key
  ) {
    return false;
  }

  try {
    if (
      onlyIfMissing &&
      window[key]
    ) {
      return true;
    }

    window[key] = value;

    return true;
  } catch {
    return false;
  }
}

function getInitialUrl() {
  return getWindowValue(INITIAL_URL_KEY);
}

function setInitialUrl(value = "") {
  return setWindowValue(
    INITIAL_URL_KEY,
    value,
    true
  );
}

function getStoredInitialUrl(config) {
  return getWindowValue(config?.windowKey || "");
}

function setStoredInitialUrl(config, value = "") {
  return setWindowValue(
    config?.windowKey || "",
    value,
    true
  );
}

function captureInitialUrl() {
  if (!isBrowser()) {
    return false;
  }

  try {
    const href = safeText(window.location?.href, "");

    if (!href) {
      return false;
    }

    setInitialUrl(href);

    for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
      if (
        matchesProtectedRoute(config, href) &&
        hasProtectedRouteToken(config, href) &&
        !getStoredInitialUrl(config)
      ) {
        setStoredInitialUrl(config, href);
      }
    }

    return true;
  } catch {
    return false;
  }
}

function getProtectedStoredUrlCandidates() {
  return PROTECTED_PUBLIC_TOKEN_ROUTES
    .map((config) => getStoredInitialUrl(config))
    .filter(Boolean);
}

function getStateProtectedUrlCandidates(AppCore) {
  const state = safeObject(AppCore?.state);
  const values = [];

  for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
    values.push(
      state[config.stateUrlKey],
      state[config.statePathKey]
    );
  }

  values.push(
    state.bootProtectedInitialUrl,
    state.bootProtectedInitialPath
  );

  return values
    .map((value) => safeText(value, ""))
    .filter(Boolean);
}

/* =========================================================
   SCRUB DETECTION
========================================================= */

function isProtectedTokenScrubbed(config = null) {
  if (
    !isBrowser() ||
    !config
  ) {
    return false;
  }

  try {
    const historyState = safeObject(window.history?.state);

    for (const key of safeArray(config.scrubbedStateKeys)) {
      if (historyState[key]) {
        return true;
      }
    }

    if (
      historyState.scrubbedPublicTokenRoute === config.key ||
      historyState.scrubbedTokenRoute === config.key
    ) {
      return true;
    }
  } catch {}

  return false;
}

function isAnyProtectedTokenScrubbed() {
  return PROTECTED_PUBLIC_TOKEN_ROUTES.some((config) =>
    isProtectedTokenScrubbed(config)
  );
}

/* =========================================================
   PROTECTED INITIAL CONTEXT
========================================================= */

function resolveProtectedInitialContext(AppCore = null) {
  captureInitialUrl();

  const candidates = [
    ...getProtectedStoredUrlCandidates(),
    ...getStateProtectedUrlCandidates(AppCore),
    getInitialUrl(),
    isBrowser()
      ? safeText(window.location?.href, "")
      : "",
    buildBrowserPath(),
  ]
    .map((value) => safeText(value, ""))
    .filter(Boolean);

  for (const candidate of candidates) {
    const config = getProtectedRouteConfig(candidate);

    if (!config) {
      continue;
    }

    /*
      CRÍTICO:
      Si la vista ya capturó el token y marcó scrub oficial,
      no resucitamos el token desde initialUrl/window.
    */
    if (isProtectedTokenScrubbed(config)) {
      continue;
    }

    if (!hasProtectedRouteToken(config, candidate)) {
      continue;
    }

    const path = pathFromUrlLike(candidate);

    return {
      config,
      key: config.key || "",

      path,
      canonicalPath: fallbackNormalizeCanonicalPath(path),
      publicPath: fallbackNormalizePath(path),

      url: candidate,
      hasToken: true,

      tokenInPath: Boolean(
        extractPathToken(config, candidate)
      ),

      redactedPath: redactTokenInText(path),
      redactedUrl: redactTokenInText(candidate),
    };
  }

  return {
    config: null,
    key: "",

    path: "",
    canonicalPath: "",
    publicPath: "",

    url: "",
    hasToken: false,
    tokenInPath: false,

    redactedPath: "",
    redactedUrl: "",
  };
}

export function getProtectedInitialPublicPath(AppCore = null) {
  const context = resolveProtectedInitialContext(AppCore);

  return context.hasToken
    ? context.publicPath
    : "";
}

function shouldPreferBrowserPathOverState(AppCore) {
  const protectedPath = getProtectedInitialPublicPath(AppCore);

  if (protectedPath) {
    return true;
  }

  const browserPath = buildBrowserPath();

  const statePublicPath = safeText(
    AppCore?.state?.publicPath,
    ""
  );

  const stateRoute = safeText(
    AppCore?.state?.route,
    ""
  );

  if (
    !isAnyProtectedTokenScrubbed() &&
    isProtectedPublicTokenPath(browserPath)
  ) {
    return true;
  }

  if (
    !statePublicPath &&
    !stateRoute
  ) {
    return true;
  }

  /*
    Boot típico:
      browser: /activate-account?token=XXX
      state:   /
  */
  if (
    browserPath &&
    browserPath !== DEFAULT_ROUTE &&
    (
      statePublicPath === DEFAULT_ROUTE ||
      stateRoute === DEFAULT_ROUTE
    )
  ) {
    return true;
  }

  return false;
}

/* =========================================================
   PATHS
========================================================= */

export function getCurrentPath(AppCore) {
  captureInitialUrl();

  const protectedPath = getProtectedInitialPublicPath(AppCore);

  if (protectedPath) {
    return normalizePublicPath(AppCore, protectedPath);
  }

  if (shouldPreferBrowserPathOverState(AppCore)) {
    return normalizePublicPath(AppCore, buildBrowserPath());
  }

  const statePath =
    safeText(AppCore?.state?.publicPath, "") ||
    safeText(AppCore?.state?.route, "");

  if (statePath) {
    return normalizePublicPath(AppCore, statePath);
  }

  return normalizePublicPath(AppCore, buildBrowserPath());
}

export function getCurrentPublicPath(AppCore, Router = null) {
  captureInitialUrl();

  const protectedPath = getProtectedInitialPublicPath(AppCore);

  if (protectedPath) {
    return normalizePublicPath(AppCore, protectedPath);
  }

  if (shouldPreferBrowserPathOverState(AppCore)) {
    return normalizePublicPath(AppCore, buildBrowserPath());
  }

  try {
    if (isFunction(Router?.getCurrentPublicPath)) {
      const routerPublicPath = Router.getCurrentPublicPath();

      if (routerPublicPath) {
        return normalizePublicPath(AppCore, routerPublicPath);
      }
    }
  } catch {}

  const statePublicPath = safeText(
    AppCore?.state?.publicPath,
    ""
  );

  if (statePublicPath) {
    return normalizePublicPath(AppCore, statePublicPath);
  }

  return normalizePublicPath(AppCore, buildBrowserPath());
}

export function getCurrentCanonicalPath(AppCore, Router = null) {
  captureInitialUrl();

  const protectedContext = resolveProtectedInitialContext(AppCore);

  if (protectedContext.hasToken) {
    return normalizeCanonicalPath(
      AppCore,
      protectedContext.publicPath
    );
  }

  if (shouldPreferBrowserPathOverState(AppCore)) {
    return normalizeCanonicalPath(AppCore, buildBrowserPath());
  }

  try {
    if (isFunction(Router?.getCurrentCanonicalPath)) {
      const value = Router.getCurrentCanonicalPath();

      if (value) {
        return normalizeCanonicalPath(AppCore, value);
      }
    }
  } catch {}

  const stateCanonical = safeText(
    AppCore?.state?.route,
    ""
  );

  if (stateCanonical) {
    return normalizeCanonicalPath(AppCore, stateCanonical);
  }

  return normalizeCanonicalPath(
    AppCore,
    getCurrentPublicPath(AppCore, Router)
  );
}

/* =========================================================
   HTML
========================================================= */

export function escapeHtml(AppCore, value = "") {
  /*
    Compat:
    - escapeHtml(AppCore, value)
    - escapeHtml(value)
  */
  let core = AppCore;
  let input = value;

  if (
    arguments.length === 1 &&
    !isObject(AppCore)
  ) {
    core = null;
    input = AppCore;
  }

  try {
    if (isFunction(core?.utils?.escapeHtml)) {
      return core.utils.escapeHtml(String(input ?? ""));
    }
  } catch {}

  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* =========================================================
   CLEANUP SCOPE
========================================================= */

export function ensureScope(AppCore, scope = APP_SCOPE) {
  const finalScope = safeText(scope, APP_SCOPE);

  try {
    if (isFunction(AppCore?.cleanup?.scope)) {
      return AppCore.cleanup.scope(finalScope);
    }
  } catch {}

  try {
    if (isFunction(AppCore?.cleanup?.ensureScope)) {
      return AppCore.cleanup.ensureScope(finalScope);
    }
  } catch {}

  return {
    name: finalScope,
  };
}

export function clearScope(AppCore, scope = APP_SCOPE) {
  const finalScope = safeText(scope, APP_SCOPE);

  try {
    if (isFunction(AppCore?.cleanup?.run)) {
      AppCore.cleanup.run(finalScope);
      return true;
    }
  } catch {}

  try {
    if (isFunction(AppCore?.cleanup?.clear)) {
      AppCore.cleanup.clear(finalScope);
      return true;
    }
  } catch {}

  try {
    if (isFunction(AppCore?.cleanup?.dispose)) {
      AppCore.cleanup.dispose(finalScope);
      return true;
    }
  } catch {}

  return true;
}

/* =========================================================
   MODULES
========================================================= */

export function registerModule(AppCore, name, moduleRef) {
  const moduleName = safeText(name, "");

  if (
    !AppCore ||
    !moduleName ||
    !moduleRef
  ) {
    return false;
  }

  let registered = false;

  try {
    if (!AppCore.modules && Object.isExtensible?.(AppCore)) {
      AppCore.modules = {};
    }
  } catch {}

  const modules = AppCore?.modules;

  if (!modules) {
    return false;
  }

  try {
    if (
      isFunction(modules.has) &&
      modules.has(moduleName)
    ) {
      return true;
    }
  } catch {}

  try {
    if (isFunction(modules.register)) {
      modules.register(moduleName, moduleRef);
      registered = true;
    }
  } catch {}

  if (!registered) {
    try {
      if (isFunction(modules.set)) {
        modules.set(moduleName, moduleRef);
        registered = true;
      }
    } catch {}
  }

  if (!registered) {
    try {
      if (
        isObject(modules) &&
        Object.isExtensible(modules)
      ) {
        modules[moduleName] = moduleRef;
        registered = true;
      }
    } catch {}
  }

  try {
    AppCore?.events?.emit?.(
      "app:module:registered",
      {
        name: moduleName,
      }
    );
  } catch {}

  return registered;
}

/* =========================================================
   EXTRA DEBUG HELPERS
========================================================= */

function getInitialUrlSnapshot() {
  const protectedRoutes = PROTECTED_PUBLIC_TOKEN_ROUTES.map((config) => {
    const stored = getStoredInitialUrl(config);

    return {
      key: config.key,
      path: config.path,
      windowKey: config.windowKey,

      hasStoredInitialUrl: Boolean(stored),
      storedInitialUrl: redactTokenInText(stored),

      scrubbed: isProtectedTokenScrubbed(config),
    };
  });

  return {
    initialUrl: redactTokenInText(getInitialUrl()),
    protectedRoutes,
  };
}

export function getHelpersSnapshot(AppCore, Router = null) {
  const protectedContext = resolveProtectedInitialContext(AppCore);

  return {
    path: redactTokenInText(
      getCurrentPath(AppCore)
    ),

    publicPath: redactTokenInText(
      getCurrentPublicPath(AppCore, Router)
    ),

    canonicalPath: redactTokenInText(
      getCurrentCanonicalPath(AppCore, Router)
    ),

    browserPath: redactTokenInText(
      buildBrowserPath()
    ),

    initial: getInitialUrlSnapshot(),

    protectedInitial: {
      key: protectedContext.key,
      hasToken: Boolean(protectedContext.hasToken),
      tokenInPath: Boolean(protectedContext.tokenInPath),

      path: protectedContext.redactedPath,
      url: protectedContext.redactedUrl,

      canonicalPath: redactTokenInText(
        protectedContext.canonicalPath
      ),

      publicPath: redactTokenInText(
        protectedContext.publicPath
      ),
    },

    hasCleanup: Boolean(AppCore?.cleanup),
    hasModules: Boolean(AppCore?.modules),
    hasRouter: Boolean(Router),

    routerHasCanonicalGetter: Boolean(
      Router?.getCurrentCanonicalPath
    ),

    routerHasPublicGetter: Boolean(
      Router?.getCurrentPublicPath
    ),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  getCurrentPath,
  getCurrentPublicPath,
  getCurrentCanonicalPath,

  normalizePublicPath,
  normalizeCanonicalPath,
  stripUsernamePrefix,

  isActivationPath,
  isResetConfirmPath,
  isProtectedPublicTokenPath,
  getProtectedInitialPublicPath,

  redactTokenInText,
  escapeHtml,

  ensureScope,
  clearScope,
  registerModule,

  getHelpersSnapshot,
};
