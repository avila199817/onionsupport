/* =========================================================
   Onion SPA - App Helpers
   Archivo: src/app/helpers.js

   ONION SUPPORT · APP HELPERS
   PATH CORE · TOKEN ROUTES SAFE · CLEANUP SAFE · EXTREME 13/10

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

   HARDENING 13/10:
   - Browser/server safe.
   - Cero throws accidentales.
   - Idempotente.
   - Hash router compatible:
       /#/activate-account?token=...
       /#!/reset-password/confirm?token=...
   - Token por query/path/hash-query compatible.
   - Alias legacy reset initial URL compatible.
   - Scrub detection por history.state.
   - No open-redirect helpers.
   - Debug snapshot sin tokens reales.
========================================================= */

import { APP_SCOPE } from "./constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_ROUTE =
  "/";

const DEFAULT_SCOPE =
  APP_SCOPE ||
  "app";

const INITIAL_URL_KEY =
  "__ONION_INITIAL_URL__";

const BOOT_CONTEXT_KEY =
  "__ONION_BOOT_CONTEXT__";

const ACTIVATION_PATH =
  "/activate-account";

const RESET_CONFIRM_PATH =
  "/reset-password/confirm";

const ACTIVATION_TOKEN_PARAM_NAMES =
  Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "code",
    "t",
  ]);

const RESET_TOKEN_PARAM_NAMES =
  Object.freeze([
    "token",
    "resetToken",
    "passwordResetToken",
    "confirmToken",
    "code",
    "t",
  ]);

const GENERIC_TOKEN_PARAM_NAMES =
  Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "resetToken",
    "passwordResetToken",
    "confirmToken",
    "code",
    "t",
    "access_token",
    "refresh_token",
    "id_token",
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "twoFactorToken",
    "two_factor_token",
    "mfaToken",
    "mfa_token",
  ]);

const PROTECTED_PUBLIC_TOKEN_ROUTES =
  Object.freeze([
    Object.freeze({
      key:
        "activation",

      path:
        ACTIVATION_PATH,

      windowKey:
        "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",

      windowKeys:
        Object.freeze([
          "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
        ]),

      stateUrlKey:
        "bootActivationInitialUrl",

      statePathKey:
        "bootActivationInitialPath",

      stateIsRouteKey:
        "bootIsActivation",

      stateHasTokenKey:
        "bootHasActivationToken",

      scrubbedStateKeys:
        Object.freeze([
          "scrubbedActivationToken",
          "activationTokenScrubbed",
          "scrubbedActivateAccountToken",
        ]),

      tokenParamNames:
        ACTIVATION_TOKEN_PARAM_NAMES,
    }),

    Object.freeze({
      key:
        "resetConfirm",

      path:
        RESET_CONFIRM_PATH,

      windowKey:
        "__ONION_RESET_CONFIRM_INITIAL_URL__",

      windowKeys:
        Object.freeze([
          "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
          "__ONION_RESET_CONFIRM_INITIAL_URL__",
        ]),

      stateUrlKey:
        "bootResetConfirmInitialUrl",

      statePathKey:
        "bootResetConfirmInitialPath",

      stateIsRouteKey:
        "bootIsResetConfirm",

      stateHasTokenKey:
        "bootHasResetToken",

      scrubbedStateKeys:
        Object.freeze([
          "scrubbedResetToken",
          "resetTokenScrubbed",
          "scrubbedResetConfirmToken",
          "scrubbedPasswordResetToken",
          "scrubbedResetPasswordToken",
        ]),

      tokenParamNames:
        RESET_TOKEN_PARAM_NAMES,
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

function isObjectLike(value) {
  return (
    value !== null &&
    (
      typeof value === "object" ||
      typeof value === "function"
    )
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

  const text =
    String(value).trim();

  return text || fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = safeNow()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function canExtend(value) {
  try {
    return (
      isObjectLike(value) &&
      Object.isExtensible(value)
    );
  } catch {}

  return false;
}

function defineHiddenValue(target, key, value) {
  if (
    !target ||
    !key ||
    !canExtend(target)
  ) {
    return false;
  }

  try {
    Object.defineProperty(
      target,
      key,
      {
        value,
        enumerable:
          false,
        configurable:
          true,
        writable:
          true,
      }
    );

    return true;
  } catch {}

  try {
    target[key] = value;
    return true;
  } catch {}

  return false;
}

function safeClone(value, fallback = null) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {}

  return fallback;
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
  const raw =
    safeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

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

function normalizeSearch(search = "") {
  const raw =
    safeText(search, "");

  if (!raw) {
    return "";
  }

  return raw.startsWith("?")
    ? raw
    : `?${raw.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const raw =
    safeText(hash, "");

  if (!raw) {
    return "";
  }

  return raw.startsWith("#")
    ? raw
    : `#${raw.replace(/^#+/, "")}`;
}

function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
  let value =
    String(pathname || DEFAULT_ROUTE)
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
    value =
      value.replace(/\/+$/g, "") || DEFAULT_ROUTE;
  }

  return value;
}

function splitRawPath(path = DEFAULT_ROUTE) {
  const raw =
    safeText(path, DEFAULT_ROUTE) || DEFAULT_ROUTE;

  if (isHashRouterPath(raw)) {
    return splitRawPath(
      normalizeHashRouterPath(raw)
    );
  }

  let pathname =
    raw;

  let search =
    "";

  let hash =
    "";

  const hashIndex =
    pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash =
      pathname.slice(hashIndex);

    pathname =
      pathname.slice(0, hashIndex) || DEFAULT_ROUTE;
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search =
      pathname.slice(searchIndex);

    pathname =
      pathname.slice(0, searchIndex) || DEFAULT_ROUTE;
  }

  return {
    pathname,
    search,
    hash,
  };
}

function fallbackNormalizePath(path = DEFAULT_ROUTE) {
  const raw =
    safeText(path, DEFAULT_ROUTE) || DEFAULT_ROUTE;

  if (isHashRouterPath(raw)) {
    return fallbackNormalizePath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed =
        new URL(
          raw,
          getBaseOrigin()
        );

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
  } =
    splitRawPath(raw);

  return `${normalizePathnameOnly(pathname)}${normalizeSearch(search)}${normalizeHash(hash)}`;
}

export function normalizePublicPath(AppCore, path = DEFAULT_ROUTE) {
  const raw =
    safeText(path, DEFAULT_ROUTE) || DEFAULT_ROUTE;

  const fallback =
    fallbackNormalizePath(raw);

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
      const delegated =
        AppCore.utils.normalizePath(raw);

      if (delegated) {
        const clean =
          fallbackNormalizePath(delegated);

        /*
          Evita degradar /foo a /.
        */
        if (
          fallback !== DEFAULT_ROUTE &&
          clean === DEFAULT_ROUTE
        ) {
          return fallback;
        }

        return clean;
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
  const parts =
    splitRawPath(
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
  const normalized =
    fallbackNormalizePath(path);

  const pathname =
    stripSearchAndHash(normalized);

  const suffix =
    getSearchAndHash(normalized);

  const segments =
    pathname
      .split("/")
      .filter(Boolean);

  if (
    segments.length > 0 &&
    isUsernameSegment(segments[0])
  ) {
    const rest =
      segments.slice(1).join("/");

    return fallbackNormalizePath(
      `${rest ? `/${rest}` : DEFAULT_ROUTE}${suffix}`
    );
  }

  return fallbackNormalizePath(
    `${pathname}${suffix}`
  );
}

function fallbackNormalizeCanonicalPath(path = DEFAULT_ROUTE) {
  const stripped =
    stripUsernamePrefix(path);

  const pathname =
    stripSearchAndHash(stripped);

  return normalizePathnameOnly(pathname);
}

export function normalizeCanonicalPath(AppCore, path = DEFAULT_ROUTE) {
  const raw =
    safeText(path, DEFAULT_ROUTE) || DEFAULT_ROUTE;

  const fallback =
    fallbackNormalizeCanonicalPath(raw);

  /*
    canonicalPath nunca conserva query/hash.
  */
  const hasSuffix =
    raw.includes("?") ||
    raw.includes("#");

  if (hasSuffix) {
    return fallback;
  }

  try {
    if (isFunction(AppCore?.utils?.normalizeCanonicalPath)) {
      const delegated =
        AppCore.utils.normalizeCanonicalPath(raw);

      if (delegated) {
        const clean =
          fallbackNormalizeCanonicalPath(delegated);

        if (
          fallback !== DEFAULT_ROUTE &&
          clean === DEFAULT_ROUTE
        ) {
          return fallback;
        }

        return clean;
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
    const pathname =
      window.location.pathname || DEFAULT_ROUTE;

    const search =
      window.location.search || "";

    const hash =
      window.location.hash || "";

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

function getBrowserHref() {
  if (!isBrowser()) {
    return "";
  }

  try {
    return safeText(
      window.location.href,
      ""
    );
  } catch {
    return "";
  }
}

function pathFromUrlLike(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isHashRouterPath(raw)) {
    return fallbackNormalizePath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

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
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  for (const name of GENERIC_TOKEN_PARAM_NAMES) {
    try {
      const escaped =
        String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      output =
        output.replace(
          new RegExp(`([?&#]${escaped}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
    } catch {}
  }

  for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
    try {
      const escapedPath =
        config.path.replace(/\//g, "\\/");

      output =
        output.replace(
          new RegExp(`(${escapedPath})\\/([^/?#\\s]+)`, "gi"),
          "$1/***"
        );
    } catch {}
  }

  try {
    output =
      output.replace(
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

  const path =
    pathFromUrlLike(pathOrUrl);

  const canonical =
    fallbackNormalizeCanonicalPath(path);

  return (
    canonical === config.path ||
    canonical.startsWith(`${config.path}/`)
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

  const path =
    pathFromUrlLike(pathOrUrl);

  const canonical =
    fallbackNormalizeCanonicalPath(path);

  if (!canonical.startsWith(`${config.path}/`)) {
    return "";
  }

  const token =
    canonical
      .slice(`${config.path}/`.length)
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

function hasTokenInSearch(search = "", names = []) {
  try {
    const params =
      new URLSearchParams(search || "");

    return safeArray(names).some((name) =>
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

function hasProtectedRouteToken(config, pathOrUrl = "") {
  if (!config) {
    return false;
  }

  const raw =
    safeText(pathOrUrl, "");

  if (!raw) {
    return false;
  }

  if (extractPathToken(config, raw)) {
    return true;
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

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
      isHashRouterPath(parsed.hash)
    ) {
      const hashPath =
        normalizeHashRouterPath(parsed.hash);

      if (extractPathToken(config, hashPath)) {
        return true;
      }

      const hashParts =
        splitRawPath(hashPath);

      if (
        hasTokenInSearch(
          hashParts.search,
          config.tokenParamNames || []
        )
      ) {
        return true;
      }
    }

    if (
      parsed.hash &&
      parsed.hash.includes("?")
    ) {
      const query =
        parsed.hash
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
    const normalized =
      fallbackNormalizePath(raw);

    if (
      extractPathToken(
        config,
        normalized
      )
    ) {
      return true;
    }

    const parts =
      splitRawPath(normalized);

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
      const query =
        parts.hash
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
  const config =
    getProtectedRouteConfig(pathOrUrl);

  return Boolean(
    config &&
      hasProtectedRouteToken(
        config,
        pathOrUrl
      )
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
    return safeText(
      window[key],
      ""
    );
  } catch {
    return "";
  }
}

function setWindowValue(key = "", value = "", onlyIfMissing = true) {
  if (
    !isBrowser() ||
    !key ||
    !value
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

function getBootContext() {
  if (!isBrowser()) {
    return {};
  }

  try {
    return safeObject(
      window[BOOT_CONTEXT_KEY]
    );
  } catch {
    return {};
  }
}

function setBootContextPatch(patch = {}) {
  if (!isBrowser()) {
    return false;
  }

  try {
    const current =
      safeObject(window[BOOT_CONTEXT_KEY]);

    window[BOOT_CONTEXT_KEY] = {
      ...current,
      ...safeObject(patch),
    };

    return true;
  } catch {
    return false;
  }
}

function getStoredInitialUrl(config) {
  const keys =
    config?.windowKeys?.length
      ? config.windowKeys
      : [config?.windowKey].filter(Boolean);

  for (const key of keys) {
    const value =
      getWindowValue(key);

    if (value) {
      return value;
    }
  }

  return "";
}

function setStoredInitialUrl(config, value = "") {
  const keys =
    config?.windowKeys?.length
      ? config.windowKeys
      : [config?.windowKey].filter(Boolean);

  let wrote =
    false;

  for (const key of keys) {
    if (
      setWindowValue(
        key,
        value,
        true
      )
    ) {
      wrote =
        true;
    }
  }

  return wrote;
}

function captureInitialUrl() {
  if (!isBrowser()) {
    return false;
  }

  try {
    const href =
      safeText(
        window.location?.href,
        ""
      );

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
        setStoredInitialUrl(
          config,
          href
        );

        setBootContextPatch({
          bootProtectedInitialUrl:
            href,

          bootProtectedInitialPath:
            pathFromUrlLike(href),

          bootProtectedRouteKey:
            config.key,

          bootIsPublicTokenRoute:
            true,

          bootHasPublicToken:
            true,

          [config.stateUrlKey]:
            href,

          [config.statePathKey]:
            pathFromUrlLike(href),

          [config.stateIsRouteKey]:
            true,

          [config.stateHasTokenKey]:
            true,
        });
      }
    }

    return true;
  } catch {
    return false;
  }
}

function getProtectedStoredUrlCandidates() {
  return PROTECTED_PUBLIC_TOKEN_ROUTES
    .map((config) =>
      getStoredInitialUrl(config)
    )
    .filter(Boolean);
}

function getStateProtectedUrlCandidates(AppCore) {
  const state =
    safeObject(AppCore?.state);

  const values =
    [];

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

  const bootContext =
    getBootContext();

  values.push(
    bootContext.bootProtectedInitialUrl,
    bootContext.bootProtectedInitialPath,
    bootContext.bootActivationInitialUrl,
    bootContext.bootActivationInitialPath,
    bootContext.bootResetConfirmInitialUrl,
    bootContext.bootResetConfirmInitialPath
  );

  return values
    .map((value) =>
      safeText(value, "")
    )
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
    const historyState =
      safeObject(window.history?.state);

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

export function resolveProtectedInitialContext(AppCore = null) {
  captureInitialUrl();

  const candidates =
    [
      ...getProtectedStoredUrlCandidates(),
      ...getStateProtectedUrlCandidates(AppCore),
      getInitialUrl(),
      getBrowserHref(),
      buildBrowserPath(),
    ]
      .map((value) =>
        safeText(value, "")
      )
      .filter(Boolean);

  for (const candidate of candidates) {
    const config =
      getProtectedRouteConfig(candidate);

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

    if (
      !hasProtectedRouteToken(
        config,
        candidate
      )
    ) {
      continue;
    }

    const path =
      pathFromUrlLike(candidate);

    const publicPath =
      fallbackNormalizePath(path);

    const canonicalPath =
      fallbackNormalizeCanonicalPath(path);

    return {
      config,
      key:
        config.key || "",

      path,
      canonicalPath,
      publicPath,

      url:
        candidate,

      hasToken:
        true,

      tokenInPath:
        Boolean(
          extractPathToken(
            config,
            candidate
          )
        ),

      scrubbed:
        false,

      redactedPath:
        redactTokenInText(path),

      redactedUrl:
        redactTokenInText(candidate),
    };
  }

  return {
    config:
      null,

    key:
      "",

    path:
      "",

    canonicalPath:
      "",

    publicPath:
      "",

    url:
      "",

    hasToken:
      false,

    tokenInPath:
      false,

    scrubbed:
      isAnyProtectedTokenScrubbed(),

    redactedPath:
      "",

    redactedUrl:
      "",
  };
}

export function getProtectedInitialPublicPath(AppCore = null) {
  const context =
    resolveProtectedInitialContext(AppCore);

  return context.hasToken
    ? context.publicPath
    : "";
}

function shouldPreferBrowserPathOverState(AppCore) {
  const protectedPath =
    getProtectedInitialPublicPath(AppCore);

  if (protectedPath) {
    return true;
  }

  const browserPath =
    buildBrowserPath();

  const statePublicPath =
    safeText(
      AppCore?.state?.publicPath,
      ""
    );

  const stateRoute =
    safeText(
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

export function getCurrentPath(AppCore, Router = null) {
  captureInitialUrl();

  const protectedPath =
    getProtectedInitialPublicPath(AppCore);

  if (protectedPath) {
    return normalizePublicPath(
      AppCore,
      protectedPath
    );
  }

  if (shouldPreferBrowserPathOverState(AppCore)) {
    return normalizePublicPath(
      AppCore,
      buildBrowserPath()
    );
  }

  try {
    if (isFunction(Router?.getCurrentPublicPath)) {
      const routerPublicPath =
        Router.getCurrentPublicPath();

      if (routerPublicPath) {
        return normalizePublicPath(
          AppCore,
          routerPublicPath
        );
      }
    }
  } catch {}

  const statePath =
    safeText(AppCore?.state?.publicPath, "") ||
    safeText(AppCore?.state?.route, "");

  if (statePath) {
    return normalizePublicPath(
      AppCore,
      statePath
    );
  }

  return normalizePublicPath(
    AppCore,
    buildBrowserPath()
  );
}

export function getCurrentPublicPath(AppCore, Router = null) {
  captureInitialUrl();

  const protectedPath =
    getProtectedInitialPublicPath(AppCore);

  if (protectedPath) {
    return normalizePublicPath(
      AppCore,
      protectedPath
    );
  }

  if (shouldPreferBrowserPathOverState(AppCore)) {
    return normalizePublicPath(
      AppCore,
      buildBrowserPath()
    );
  }

  try {
    if (isFunction(Router?.getCurrentPublicPath)) {
      const routerPublicPath =
        Router.getCurrentPublicPath();

      if (routerPublicPath) {
        return normalizePublicPath(
          AppCore,
          routerPublicPath
        );
      }
    }
  } catch {}

  const statePublicPath =
    safeText(
      AppCore?.state?.publicPath,
      ""
    );

  if (statePublicPath) {
    return normalizePublicPath(
      AppCore,
      statePublicPath
    );
  }

  return normalizePublicPath(
    AppCore,
    buildBrowserPath()
  );
}

export function getCurrentCanonicalPath(AppCore, Router = null) {
  captureInitialUrl();

  const protectedContext =
    resolveProtectedInitialContext(AppCore);

  if (protectedContext.hasToken) {
    return normalizeCanonicalPath(
      AppCore,
      protectedContext.publicPath
    );
  }

  if (shouldPreferBrowserPathOverState(AppCore)) {
    return normalizeCanonicalPath(
      AppCore,
      buildBrowserPath()
    );
  }

  try {
    if (isFunction(Router?.getCurrentCanonicalPath)) {
      const value =
        Router.getCurrentCanonicalPath();

      if (value) {
        return normalizeCanonicalPath(
          AppCore,
          value
        );
      }
    }
  } catch {}

  const stateCanonical =
    safeText(
      AppCore?.state?.route,
      ""
    );

  if (stateCanonical) {
    return normalizeCanonicalPath(
      AppCore,
      stateCanonical
    );
  }

  return normalizeCanonicalPath(
    AppCore,
    getCurrentPublicPath(
      AppCore,
      Router
    )
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
  let core =
    AppCore;

  let input =
    value;

  if (
    arguments.length === 1 &&
    !isObject(AppCore)
  ) {
    core =
      null;

    input =
      AppCore;
  }

  try {
    if (isFunction(core?.utils?.escapeHtml)) {
      return core.utils.escapeHtml(
        String(input ?? "")
      );
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

export function ensureScope(AppCore, scope = DEFAULT_SCOPE) {
  const finalScope =
    safeText(scope, DEFAULT_SCOPE) || DEFAULT_SCOPE;

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
    name:
      finalScope,
  };
}

export function clearScope(AppCore, scope = DEFAULT_SCOPE) {
  const finalScope =
    safeText(scope, DEFAULT_SCOPE) || DEFAULT_SCOPE;

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
  const moduleName =
    safeText(name, "");

  if (
    !AppCore ||
    !moduleName ||
    !moduleRef
  ) {
    return false;
  }

  let registered =
    false;

  try {
    if (
      !AppCore.modules &&
      canExtend(AppCore)
    ) {
      AppCore.modules = {};
    }
  } catch {}

  const modules =
    AppCore?.modules;

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
      modules.register(
        moduleName,
        moduleRef,
        {
          replace:
            true,
          overwrite:
            true,
          source:
            "app:helpers",
        }
      );

      registered =
        true;
    }
  } catch {}

  if (!registered) {
    try {
      if (isFunction(modules.set)) {
        modules.set(
          moduleName,
          moduleRef,
          {
            replace:
              true,
            overwrite:
              true,
            source:
              "app:helpers",
          }
        );

        registered =
          true;
      }
    } catch {}
  }

  if (!registered) {
    try {
      if (canExtend(modules)) {
        modules[moduleName] =
          moduleRef;

        registered =
          true;
      }
    } catch {}
  }

  try {
    AppCore?.events?.emit?.(
      "app:module:registered",
      {
        name:
          moduleName,
      }
    );
  } catch {}

  return registered;
}

/* =========================================================
   EXTRA DEBUG HELPERS
========================================================= */

function getInitialUrlSnapshot() {
  const protectedRoutes =
    PROTECTED_PUBLIC_TOKEN_ROUTES.map((config) => {
      const stored =
        getStoredInitialUrl(config);

      return {
        key:
          config.key,

        path:
          config.path,

        windowKeys:
          [...safeArray(config.windowKeys)],

        hasStoredInitialUrl:
          Boolean(stored),

        storedInitialUrl:
          redactTokenInText(stored),

        scrubbed:
          isProtectedTokenScrubbed(config),
      };
    });

  return {
    initialUrl:
      redactTokenInText(
        getInitialUrl()
      ),

    browserHref:
      redactTokenInText(
        getBrowserHref()
      ),

    bootContext:
      safeClone(
        sanitizeBootContextForSnapshot(
          getBootContext()
        ),
        {}
      ),

    protectedRoutes,
  };
}

function sanitizeBootContextForSnapshot(context = {}) {
  const source =
    safeObject(context);

  const output =
    {};

  for (const [key, value] of Object.entries(source)) {
    if (
      /token|url|path|href/i.test(key) &&
      typeof value === "string"
    ) {
      output[key] =
        redactTokenInText(value);
      continue;
    }

    output[key] =
      value;
  }

  return output;
}

export function getHelpersSnapshot(AppCore, Router = null) {
  const protectedContext =
    resolveProtectedInitialContext(AppCore);

  return {
    path:
      redactTokenInText(
        getCurrentPath(
          AppCore,
          Router
        )
      ),

    publicPath:
      redactTokenInText(
        getCurrentPublicPath(
          AppCore,
          Router
        )
      ),

    canonicalPath:
      redactTokenInText(
        getCurrentCanonicalPath(
          AppCore,
          Router
        )
      ),

    browserPath:
      redactTokenInText(
        buildBrowserPath()
      ),

    browserHref:
      redactTokenInText(
        getBrowserHref()
      ),

    initial:
      getInitialUrlSnapshot(),

    protectedInitial: {
      key:
        protectedContext.key,

      hasToken:
        Boolean(protectedContext.hasToken),

      tokenInPath:
        Boolean(protectedContext.tokenInPath),

      scrubbed:
        Boolean(protectedContext.scrubbed),

      path:
        protectedContext.redactedPath,

      url:
        protectedContext.redactedUrl,

      canonicalPath:
        redactTokenInText(
          protectedContext.canonicalPath
        ),

      publicPath:
        redactTokenInText(
          protectedContext.publicPath
        ),
    },

    hasCleanup:
      Boolean(AppCore?.cleanup),

    hasModules:
      Boolean(AppCore?.modules),

    hasRouter:
      Boolean(Router),

    routerHasCanonicalGetter:
      Boolean(
        Router?.getCurrentCanonicalPath
      ),

    routerHasPublicGetter:
      Boolean(
        Router?.getCurrentPublicPath
      ),

    at:
      safeIsoDate(),
  };
}

/* =========================================================
   EARLY CAPTURE
========================================================= */

try {
  captureInitialUrl();
} catch {}

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
  resolveProtectedInitialContext,

  redactTokenInText,
  escapeHtml,

  ensureScope,
  clearScope,
  registerModule,

  getHelpersSnapshot,
};
