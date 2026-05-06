/* =========================================================
   Onion SPA - Router Helpers
   Archivo: src/router/helpers.js

   FINAL EXTREME SYSTEM · ROUTER HELPERS · 10/10

   RESPONSABILIDADES:
   - constantes base del router
   - normalización robusta de rutas / hrefs
   - manejo sólido de slug público /@username
   - helpers path actual / canonical / public
   - builders login / history / state
   - hardening total contra inputs corruptos
   - preservar query/hash correctamente en publicPath
   - canonical determinista sin query/hash
   - cero degradación username/context path
   - no destruir tokens públicos en rutas tipo /activate-account?token=...
   - soporte hash-router /#/activate-account?token=...
   - soporte URL inicial capturada antes del boot SPA
   - soporte directo para /activate-account/<token>
   - soporte directo para /reset-password/confirm/<token>
   - snapshots debug sin tokens reales

   HARDENING EXTREMO 10/10:
   - canonical determinista sin query/hash
   - publicPath preserva query/hash
   - publicPath preserva /activate-account/<token>
   - publicPath preserva /reset-password/confirm/<token>
   - slug estricto enterprise
   - redirect interno seguro
   - soporte href relativo real
   - evita loops login
   - no rompe SSR/no-browser
   - outputs siempre normalizados
   - soporte alias legacy __ONION_RESET_CONFIRM_INITIAL_URL__
   - same-origin absolute URLs compatibles con SPA
   - no resucita tokens tras scrub oficial history.state
========================================================= */

/* =========================================================
   CONFIG
========================================================= */

export const ROUTER_CONFIG = Object.freeze({
  maxRouteLength:
    2048,

  maxUsernameLength:
    64,

  maxRedirectLength:
    1600,
});

/* =========================================================
   PUBLIC TOKEN ROUTES
========================================================= */

const DEFAULT_ROUTE =
  "/";

const ACTIVATION_PATH =
  "/activate-account";

const RESET_CONFIRM_PATH =
  "/reset-password/confirm";

const INITIAL_URL_KEY =
  "__ONION_INITIAL_URL__";

const ACTIVATION_INITIAL_URL_KEY =
  "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__";

const RESET_CONFIRM_INITIAL_URL_KEY =
  "__ONION_RESET_CONFIRM_INITIAL_URL__";

const RESET_PASSWORD_CONFIRM_INITIAL_URL_KEY =
  "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__";

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

const GENERIC_SENSITIVE_PARAM_NAMES =
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

const PUBLIC_AUTH_PATHS =
  new Set([
    "/login",
    "/signin",
    "/sign-in",
    "/auth",
    "/auth/login",
    "/2fa",
    "/otp",
    "/activate-account",
    "/reset-password",
    "/reset-password/confirm",
    "/forgot-password",
    "/recover-password",
    "/recover",
    "/password-reset",
  ]);

const PUBLIC_AUTH_PREFIXES =
  Object.freeze([
    "/activate-account/",
    "/reset-password/confirm/",
  ]);

const PROTECTED_PUBLIC_TOKEN_ROUTES =
  Object.freeze([
    Object.freeze({
      key:
        "activation",

      path:
        ACTIVATION_PATH,

      initialUrlKeys:
        Object.freeze([
          ACTIVATION_INITIAL_URL_KEY,
        ]),

      tokenParamNames:
        ACTIVATION_TOKEN_PARAM_NAMES,

      scrubbedStateKeys:
        Object.freeze([
          "scrubbedActivationToken",
          "activationTokenScrubbed",
          "scrubbedActivateAccountToken",
        ]),
    }),

    Object.freeze({
      key:
        "resetConfirm",

      path:
        RESET_CONFIRM_PATH,

      initialUrlKeys:
        Object.freeze([
          RESET_PASSWORD_CONFIRM_INITIAL_URL_KEY,
          RESET_CONFIRM_INITIAL_URL_KEY,
        ]),

      tokenParamNames:
        RESET_TOKEN_PARAM_NAMES,

      scrubbedStateKeys:
        Object.freeze([
          "scrubbedResetToken",
          "resetTokenScrubbed",
          "scrubbedResetPasswordToken",
          "scrubbedResetConfirmToken",
          "scrubbedPasswordResetToken",
        ]),
    }),
  ]);

/* =========================================================
   ROUTE NAMES
========================================================= */

export function getRouteNames(AppCore) {
  return {
    HOME:
      AppCore?.config?.routes?.home ||
      DEFAULT_ROUTE,

    LOGIN:
      AppCore?.config?.routes?.login ||
      "/login",

    SERVER:
      AppCore?.config?.routes?.server ||
      "/servidor",

    USERS:
      AppCore?.config?.routes?.users ||
      "/usuarios",
  };
}

/* =========================================================
   BASICS
========================================================= */

export function isBrowser() {
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

function isFunction(value) {
  return typeof value === "function";
}

function safeText(value = "", fallback = "") {
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

function safeBool(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key =
      value
        .trim()
        .toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "ok",
        "on",
      ].includes(key)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
      ].includes(key)
    ) {
      return false;
    }
  }

  return Boolean(fallback);
}

function safeObject(value) {
  return isObject(value)
    ? value
    : {};
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function unique(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .map((value) =>
          safeText(value, "")
        )
        .filter(Boolean)
    ),
  ];
}

function escapeRegExp(value = "") {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

export function normalizeRouteInput(value = DEFAULT_ROUTE) {
  const text =
    String(value ?? "")
      .trim();

  if (!text) {
    return DEFAULT_ROUTE;
  }

  return text.slice(
    0,
    ROUTER_CONFIG.maxRouteLength
  );
}

export function escapeHtml(AppCore, value = "") {
  try {
    if (isFunction(AppCore?.utils?.escapeHtml)) {
      return AppCore.utils.escapeHtml(
        String(value ?? "")
      );
    }
  } catch {}

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

  for (const name of GENERIC_SENSITIVE_PARAM_NAMES) {
    try {
      const escaped =
        escapeRegExp(name);

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
   PATH CORE
========================================================= */

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

function normalizeSearch(search = "") {
  const value =
    String(search || "").trim();

  if (!value) {
    return "";
  }

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value =
    String(hash || "").trim();

  if (!value) {
    return "";
  }

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
  let value =
    String(pathname || DEFAULT_ROUTE)
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value =
      DEFAULT_ROUTE;
  }

  if (!value.startsWith("/")) {
    value =
      `/${value}`;
  }

  const segments =
    value.split("/");

  const normalizedSegments =
    [];

  for (const segment of segments) {
    if (
      !segment ||
      segment === "."
    ) {
      continue;
    }

    if (segment === "..") {
      normalizedSegments.pop();
      continue;
    }

    normalizedSegments.push(segment);
  }

  value =
    `/${normalizedSegments.join("/")}` ||
    DEFAULT_ROUTE;

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") ||
      DEFAULT_ROUTE;
  }

  return value;
}

function stripPublicUsernamePrefixFromPathname(pathname = DEFAULT_ROUTE) {
  return (
    normalizePathnameOnly(pathname)
      .replace(/^\/@[^/]+(?=\/|$)/i, "") ||
    DEFAULT_ROUTE
  );
}

function getPublicUsernameFromPathname(pathname = DEFAULT_ROUTE) {
  const first =
    normalizePathnameOnly(pathname)
      .split("/")
      .filter(Boolean)[0] ||
    "";

  if (!/^@[A-Za-z0-9._-]{1,80}$/.test(first)) {
    return "";
  }

  return first.slice(1);
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
    return DEFAULT_ROUTE;
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") ||
      DEFAULT_ROUTE;
  }

  return raw.replace(/^#\/?/, "/") ||
    DEFAULT_ROUTE;
}

function splitRawPath(path = DEFAULT_ROUTE) {
  const raw =
    normalizeRouteInput(path);

  if (!raw) {
    return {
      pathname:
        DEFAULT_ROUTE,
      search:
        "",
      hash:
        "",
    };
  }

  if (isHashRouterPath(raw)) {
    return splitRawPath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const url =
        new URL(
          raw,
          getBaseOrigin()
        );

      if (
        url.hash &&
        isHashRouterPath(url.hash)
      ) {
        return splitRawPath(
          normalizeHashRouterPath(url.hash)
        );
      }

      return {
        pathname:
          url.pathname || DEFAULT_ROUTE,
        search:
          normalizeSearch(url.search || ""),
        hash:
          normalizeHash(url.hash || ""),
      };
    }
  } catch {}

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
      pathname.slice(0, hashIndex) ||
      DEFAULT_ROUTE;
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search =
      pathname.slice(searchIndex);

    pathname =
      pathname.slice(0, searchIndex) ||
      DEFAULT_ROUTE;
  }

  return {
    pathname:
      pathname || DEFAULT_ROUTE,
    search:
      normalizeSearch(search),
    hash:
      normalizeHash(hash),
  };
}

function normalizePathnameWithCore(AppCore, pathname = DEFAULT_ROUTE) {
  let normalized =
    normalizePathnameOnly(pathname);

  try {
    if (isFunction(AppCore?.utils?.normalizePath)) {
      const delegated =
        AppCore.utils.normalizePath(
          normalized
        );

      if (delegated) {
        const parts =
          splitRawPath(delegated);

        normalized =
          normalizePathnameOnly(
            parts.pathname || DEFAULT_ROUTE
          );
      }
    }
  } catch {}

  return normalized;
}

/**
 * Normaliza una URL interna conservando query/hash.
 *
 * IMPORTANTE:
 * - NO delega la URL completa a AppCore.utils.normalizePath
 * - delega solo el pathname
 * - así evita que helpers externos borren ?token=...
 */
export function normalizePath(AppCore, path = DEFAULT_ROUTE) {
  const raw =
    normalizeRouteInput(path);

  if (isHashRouterPath(raw)) {
    return normalizePath(
      AppCore,
      normalizeHashRouterPath(raw)
    );
  }

  if (
    raw.startsWith("#") &&
    !isHashRouterPath(raw)
  ) {
    return normalizeHash(raw);
  }

  const {
    pathname,
    search,
    hash,
  } =
    splitRawPath(raw);

  const cleanPathname =
    normalizePathnameWithCore(
      AppCore,
      pathname
    );

  return `${cleanPathname}${search}${hash}`;
}

export function stripSearchAndHash(path = DEFAULT_ROUTE) {
  const parts =
    splitRawPath(
      normalizePath(null, path)
    );

  return normalizePathnameOnly(
    parts.pathname || DEFAULT_ROUTE
  );
}

export function getSearchAndHash(path = DEFAULT_ROUTE) {
  const parts =
    splitRawPath(
      normalizePath(null, path)
    );

  return `${parts.search}${parts.hash}`;
}

export function pathFromUrlLike(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isHashRouterPath(raw)) {
    return normalizePath(
      null,
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
      return normalizePath(
        null,
        normalizeHashRouterPath(parsed.hash)
      );
    }

    return normalizePath(
      null,
      `${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`
    );
  } catch {
    return normalizePath(
      null,
      raw
    );
  }
}

/* =========================================================
   PUBLIC TOKEN HELPERS
========================================================= */

function getProtectedRouteConfig(pathOrUrl = "") {
  const path =
    pathFromUrlLike(pathOrUrl);

  const pathname =
    stripPublicUsernamePrefixFromPathname(
      stripSearchAndHash(path)
    );

  return (
    PROTECTED_PUBLIC_TOKEN_ROUTES.find((config) => {
      return (
        pathname === config.path ||
        pathname.startsWith(`${config.path}/`)
      );
    }) || null
  );
}

function isPathOrChild(path = "", basePath = DEFAULT_ROUTE) {
  const normalized =
    normalizePath(null, path);

  const pathname =
    stripPublicUsernamePrefixFromPathname(
      stripSearchAndHash(normalized)
    );

  return (
    pathname === basePath ||
    pathname.startsWith(`${basePath}/`)
  );
}

function getTokenFromPathByBase(pathOrUrl = "", basePath = "") {
  const raw =
    safeText(pathOrUrl, "");

  const base =
    normalizePathnameOnly(basePath);

  if (
    !raw ||
    !base
  ) {
    return "";
  }

  try {
    const path =
      pathFromUrlLike(raw) ||
      raw;

    const parts =
      splitRawPath(path);

    const pathname =
      stripPublicUsernamePrefixFromPathname(
        parts.pathname || DEFAULT_ROUTE
      );

    if (
      !pathname.startsWith(`${base}/`)
    ) {
      return "";
    }

    const token =
      pathname
        .slice(`${base}/`.length)
        .split("/")[0];

    if (!token) {
      return "";
    }

    return safeText(
      decodeURIComponent(token),
      ""
    );
  } catch {
    return "";
  }
}

function hasTokenInSearch(search = "", tokenParamNames = []) {
  try {
    const params =
      new URLSearchParams(search || "");

    return tokenParamNames.some((name) =>
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

function getHashRouterCandidate(hash = "") {
  const raw =
    safeText(hash, "");

  if (
    !raw ||
    !isHashRouterPath(raw)
  ) {
    return "";
  }

  return normalizePath(
    null,
    normalizeHashRouterPath(raw)
  );
}

function getHashQuery(hash = "") {
  const raw =
    safeText(hash, "");

  if (
    !raw ||
    !raw.includes("?")
  ) {
    return "";
  }

  const query =
    raw
      .split("?")
      .slice(1)
      .join("?");

  return query
    ? `?${query}`
    : "";
}

function isProtectedTokenScrubbedByConfig(config = null) {
  if (
    !isBrowser() ||
    !config
  ) {
    return false;
  }

  try {
    const state =
      window.history?.state || {};

    if (
      state.scrubbedPublicTokenRoute === config.key ||
      state.scrubbedTokenRoute === config.key
    ) {
      return true;
    }

    return config.scrubbedStateKeys.some((key) =>
      Boolean(state?.[key])
    );
  } catch {
    return false;
  }
}

function hasPublicToken({
  pathOrUrl = "",
  basePath = "",
  tokenParamNames = [],
} = {}) {
  const raw =
    safeText(pathOrUrl, "");

  if (!raw) {
    return false;
  }

  /*
    Formato path-token:
    /base/path/<token>
  */
  if (
    getTokenFromPathByBase(
      raw,
      basePath
    )
  ) {
    return true;
  }

  if (isHashRouterPath(raw)) {
    const hashCandidate =
      normalizeHashRouterPath(raw);

    if (
      getTokenFromPathByBase(
        hashCandidate,
        basePath
      )
    ) {
      return true;
    }

    const hashParts =
      splitRawPath(hashCandidate);

    return hasTokenInSearch(
      hashParts.search,
      tokenParamNames
    );
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    const parsedPath =
      `${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`;

    if (
      getTokenFromPathByBase(
        parsedPath,
        basePath
      )
    ) {
      return true;
    }

    if (
      hasTokenInSearch(
        parsed.search,
        tokenParamNames
      )
    ) {
      return true;
    }

    const hashCandidate =
      getHashRouterCandidate(
        parsed.hash
      );

    if (hashCandidate) {
      if (
        getTokenFromPathByBase(
          hashCandidate,
          basePath
        )
      ) {
        return true;
      }

      const hashParts =
        splitRawPath(hashCandidate);

      if (
        hasTokenInSearch(
          hashParts.search,
          tokenParamNames
        )
      ) {
        return true;
      }
    }

    const hashQuery =
      getHashQuery(parsed.hash);

    if (
      hashQuery &&
      hasTokenInSearch(
        hashQuery,
        tokenParamNames
      )
    ) {
      return true;
    }

    return false;
  } catch {
    const parts =
      splitRawPath(raw);

    const localPath =
      `${parts.pathname || DEFAULT_ROUTE}${parts.search || ""}${parts.hash || ""}`;

    if (
      getTokenFromPathByBase(
        localPath,
        basePath
      )
    ) {
      return true;
    }

    if (
      hasTokenInSearch(
        parts.search,
        tokenParamNames
      )
    ) {
      return true;
    }

    const hashCandidate =
      getHashRouterCandidate(
        parts.hash
      );

    if (hashCandidate) {
      if (
        getTokenFromPathByBase(
          hashCandidate,
          basePath
        )
      ) {
        return true;
      }

      const hashParts =
        splitRawPath(hashCandidate);

      if (
        hasTokenInSearch(
          hashParts.search,
          tokenParamNames
        )
      ) {
        return true;
      }
    }

    const hashQuery =
      getHashQuery(parts.hash);

    if (
      hashQuery &&
      hasTokenInSearch(
        hashQuery,
        tokenParamNames
      )
    ) {
      return true;
    }

    return false;
  }
}

export function isProtectedPublicTokenPath(pathOrUrl = "") {
  const config =
    getProtectedRouteConfig(pathOrUrl);

  if (!config) {
    return false;
  }

  if (
    isProtectedTokenScrubbedByConfig(config)
  ) {
    return false;
  }

  return hasPublicToken({
    pathOrUrl,
    basePath:
      config.path,
    tokenParamNames:
      config.tokenParamNames,
  });
}

/* =========================================================
   ACTIVATION TOKEN PROTECTION
========================================================= */

function isActivationPath(path = "") {
  return isPathOrChild(
    path,
    ACTIVATION_PATH
  );
}

function getActivationTokenFromPath(pathOrUrl = "") {
  return getTokenFromPathByBase(
    pathOrUrl,
    ACTIVATION_PATH
  );
}

function hasTokenInActivationPath(pathOrUrl = "") {
  return Boolean(
    getActivationTokenFromPath(pathOrUrl)
  );
}

function hasActivationToken(pathOrUrl = "") {
  return hasPublicToken({
    pathOrUrl,
    basePath:
      ACTIVATION_PATH,
    tokenParamNames:
      ACTIVATION_TOKEN_PARAM_NAMES,
  });
}

function isActivationTokenScrubbed() {
  return isProtectedTokenScrubbedByConfig(
    PROTECTED_PUBLIC_TOKEN_ROUTES[0]
  );
}

/* =========================================================
   RESET TOKEN PROTECTION
========================================================= */

function isResetConfirmPath(path = "") {
  return isPathOrChild(
    path,
    RESET_CONFIRM_PATH
  );
}

function getResetConfirmTokenFromPath(pathOrUrl = "") {
  return getTokenFromPathByBase(
    pathOrUrl,
    RESET_CONFIRM_PATH
  );
}

function hasTokenInResetConfirmPath(pathOrUrl = "") {
  return Boolean(
    getResetConfirmTokenFromPath(pathOrUrl)
  );
}

function hasResetConfirmToken(pathOrUrl = "") {
  return hasPublicToken({
    pathOrUrl,
    basePath:
      RESET_CONFIRM_PATH,
    tokenParamNames:
      RESET_TOKEN_PARAM_NAMES,
  });
}

function isResetConfirmTokenScrubbed() {
  return isProtectedTokenScrubbedByConfig(
    PROTECTED_PUBLIC_TOKEN_ROUTES[1]
  );
}

/* =========================================================
   CURRENT BROWSER PATH
========================================================= */

function getBrowserPath() {
  if (!isBrowser()) {
    return DEFAULT_ROUTE;
  }

  try {
    const pathname =
      window.location.pathname ||
      DEFAULT_ROUTE;

    const search =
      window.location.search ||
      "";

    const hash =
      window.location.hash ||
      "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
      return normalizePath(
        null,
        normalizeHashRouterPath(hash)
      );
    }

    return normalizePath(
      null,
      `${pathname}${search}${hash}`
    );
  } catch {
    return DEFAULT_ROUTE;
  }
}

/* =========================================================
   INITIAL URL CAPTURE
========================================================= */

function setWindowValueOnce(key = "", value = "") {
  if (
    !isBrowser() ||
    !key ||
    !value
  ) {
    return false;
  }

  try {
    if (!window[key]) {
      window[key] =
        value;
      return true;
    }

    return true;
  } catch {
    return false;
  }
}

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

function captureInitialUrl() {
  if (!isBrowser()) {
    return false;
  }

  try {
    const href =
      safeText(
        window.location.href,
        ""
      );

    if (!href) {
      return false;
    }

    setWindowValueOnce(
      INITIAL_URL_KEY,
      href
    );

    const path =
      pathFromUrlLike(href);

    if (
      isActivationPath(path) &&
      hasActivationToken(href) &&
      !isActivationTokenScrubbed()
    ) {
      setWindowValueOnce(
        ACTIVATION_INITIAL_URL_KEY,
        href
      );
    }

    if (
      isResetConfirmPath(path) &&
      hasResetConfirmToken(href) &&
      !isResetConfirmTokenScrubbed()
    ) {
      setWindowValueOnce(
        RESET_PASSWORD_CONFIRM_INITIAL_URL_KEY,
        href
      );

      /*
        Alias legacy usado por otros módulos auth.
      */
      setWindowValueOnce(
        RESET_CONFIRM_INITIAL_URL_KEY,
        href
      );
    }

    return true;
  } catch {
    return false;
  }
}

function getInitialUrl() {
  return getWindowValue(
    INITIAL_URL_KEY
  );
}

function getActivationInitialUrl() {
  return getWindowValue(
    ACTIVATION_INITIAL_URL_KEY
  );
}

function getResetConfirmInitialUrl() {
  return (
    getWindowValue(
      RESET_PASSWORD_CONFIRM_INITIAL_URL_KEY
    ) ||
    getWindowValue(
      RESET_CONFIRM_INITIAL_URL_KEY
    )
  );
}

function resolveProtectedInitialPath(config) {
  if (!config) {
    return "";
  }

  if (
    isProtectedTokenScrubbedByConfig(config)
  ) {
    return "";
  }

  captureInitialUrl();

  const candidates =
    [
      ...config.initialUrlKeys.map((key) =>
        getWindowValue(key)
      ),
      getInitialUrl(),
      isBrowser()
        ? safeText(window.location.href, "")
        : "",
      getBrowserPath(),
    ]
      .map((value) =>
        safeText(value, "")
      )
      .filter(Boolean);

  for (const candidate of candidates) {
    const path =
      pathFromUrlLike(candidate);

    if (
      isPathOrChild(path, config.path) &&
      hasPublicToken({
        pathOrUrl:
          candidate,
        basePath:
          config.path,
        tokenParamNames:
          config.tokenParamNames,
      })
    ) {
      return path;
    }
  }

  return "";
}

function getProtectedActivationPath() {
  return resolveProtectedInitialPath(
    PROTECTED_PUBLIC_TOKEN_ROUTES[0]
  );
}

function getProtectedResetConfirmPath() {
  return resolveProtectedInitialPath(
    PROTECTED_PUBLIC_TOKEN_ROUTES[1]
  );
}

function getProtectedInitialPublicPath() {
  return (
    getProtectedActivationPath() ||
    getProtectedResetConfirmPath() ||
    ""
  );
}

/* =========================================================
   USERNAME
========================================================= */

export function sanitizeUsername(AppCore, value = "") {
  let normalized =
    String(value || "")
      .trim()
      .replace(/^@+/, "")
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .toLowerCase();

  try {
    if (isFunction(AppCore?.utils?.sanitizeUsername)) {
      normalized =
        AppCore.utils.sanitizeUsername(normalized) ||
        normalized;
    }
  } catch {}

  return String(normalized)
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(
      0,
      ROUTER_CONFIG.maxUsernameLength
    )
    .trim();
}

export function extractUsernameFromPath(AppCore, path = DEFAULT_ROUTE) {
  const pathname =
    stripSearchAndHash(
      normalizePath(AppCore, path)
    );

  const match =
    pathname.match(
      /^\/@([^/]+)(?:\/|$)/i
    );

  if (!match) {
    return null;
  }

  const username =
    sanitizeUsername(
      AppCore,
      match[1]
    );

  return username || null;
}

export function getCurrentUsername(AppCore) {
  return (
    sanitizeUsername(
      AppCore,
      AppCore?.state?.user?.username ||
        AppCore?.state?.user?.userName ||
        AppCore?.state?.user?.nick ||
        AppCore?.state?.user?.alias ||
        AppCore?.state?.user?.slug ||
        ""
    ) || null
  );
}

export function getCurrentResolvedUsername(AppCore) {
  const fromState =
    sanitizeUsername(
      AppCore,
      AppCore?.state?.currentResolvedUsername ||
        AppCore?.state?.resolvedUsername ||
        ""
    );

  if (fromState) {
    return fromState;
  }

  const statePublic =
    safeText(
      AppCore?.state?.publicPath,
      ""
    );

  if (statePublic) {
    const fromPublic =
      extractUsernameFromPath(
        AppCore,
        statePublic
      );

    if (fromPublic) {
      return fromPublic;
    }
  }

  if (isBrowser()) {
    const fromUrl =
      extractUsernameFromPath(
        AppCore,
        getBrowserPath()
      );

    if (fromUrl) {
      return fromUrl;
    }
  }

  return (
    getCurrentUsername(AppCore) ||
    null
  );
}

/* =========================================================
   CANONICAL
========================================================= */

/**
 * Quita /@username conservando query/hash.
 *
 * Ejemplo:
 *   /@pepe/facturas?page=2
 *   -> /facturas?page=2
 */
export function stripUsernamePrefix(AppCore, path = DEFAULT_ROUTE) {
  const normalized =
    normalizePath(
      AppCore,
      path
    );

  const parts =
    splitRawPath(normalized);

  const clean =
    stripPublicUsernamePrefixFromPathname(
      parts.pathname || DEFAULT_ROUTE
    );

  return normalizePath(
    AppCore,
    `${clean}${parts.search}${parts.hash}`
  );
}

/**
 * Ruta canónica interna.
 *
 * IMPORTANTE:
 * - NO devuelve query
 * - NO devuelve hash
 * - NO devuelve /@username
 * - /activate-account/<token> resuelve a /activate-account
 * - /reset-password/confirm/<token> resuelve a /reset-password/confirm
 */
export function normalizeCanonicalPath(AppCore, path = DEFAULT_ROUTE) {
  const stripped =
    stripUsernamePrefix(
      AppCore,
      path
    );

  const pathname =
    stripSearchAndHash(stripped);

  const cleanPathname =
    normalizePathnameOnly(pathname);

  if (
    cleanPathname === ACTIVATION_PATH ||
    cleanPathname.startsWith(`${ACTIVATION_PATH}/`)
  ) {
    return ACTIVATION_PATH;
  }

  if (
    cleanPathname === RESET_CONFIRM_PATH ||
    cleanPathname.startsWith(`${RESET_CONFIRM_PATH}/`)
  ) {
    return RESET_CONFIRM_PATH;
  }

  return cleanPathname;
}

export function isSameCanonicalPath(AppCore, a = DEFAULT_ROUTE, b = DEFAULT_ROUTE) {
  return (
    normalizeCanonicalPath(AppCore, a) ===
    normalizeCanonicalPath(AppCore, b)
  );
}

/* =========================================================
   CURRENT PATHS
========================================================= */

export function getCurrentUrl() {
  if (!isBrowser()) {
    return new URL("http://localhost/");
  }

  try {
    return new URL(
      window.location.href
    );
  } catch {
    return new URL("http://localhost/");
  }
}

/**
 * URL pública real actual.
 *
 * Prioridad:
 * 1. token protegido de activation/reset inicial
 * 2. navegador real
 * 3. estado
 */
export function getCurrentPath(AppCore) {
  const protectedInitial =
    getProtectedInitialPublicPath();

  if (protectedInitial) {
    return normalizePath(
      AppCore,
      protectedInitial
    );
  }

  if (isBrowser()) {
    return normalizePath(
      AppCore,
      getBrowserPath()
    );
  }

  return normalizePath(
    AppCore,
    AppCore?.state?.publicPath ||
      AppCore?.state?.route ||
      DEFAULT_ROUTE
  );
}

/**
 * Ruta canónica actual.
 */
export function getCurrentCanonicalPath(AppCore) {
  return normalizeCanonicalPath(
    AppCore,
    getCurrentPath(AppCore)
  );
}

/**
 * Public path actual.
 */
export function getCurrentPublicPath(AppCore) {
  const protectedInitial =
    getProtectedInitialPublicPath();

  if (protectedInitial) {
    return normalizePath(
      AppCore,
      protectedInitial
    );
  }

  if (isBrowser()) {
    return getCurrentPath(AppCore);
  }

  return normalizePath(
    AppCore,
    AppCore?.state?.publicPath ||
      AppCore?.state?.route ||
      DEFAULT_ROUTE
  );
}

export function getResolvedPublicPath(fallback = DEFAULT_ROUTE) {
  const protectedInitial =
    getProtectedInitialPublicPath();

  if (protectedInitial) {
    return protectedInitial;
  }

  if (!isBrowser()) {
    return fallback;
  }

  return getBrowserPath();
}

/* =========================================================
   HREF RULES
========================================================= */

export function isExternalHref(href = "") {
  const raw =
    String(href || "").trim();

  if (!raw) {
    return false;
  }

  if (/^(mailto:|tel:)/i.test(raw)) {
    return true;
  }

  if (raw.startsWith("//")) {
    return true;
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url =
        new URL(
          raw,
          getBaseOrigin()
        );

      return url.origin !== getBaseOrigin();
    } catch {
      return true;
    }
  }

  return false;
}

export function isUnsafeHref(href = "") {
  const raw =
    String(href || "").trim();

  if (!raw) {
    return false;
  }

  if (/[\r\n\t]/.test(raw)) {
    return true;
  }

  return /^(javascript:|data:|vbscript:)/i.test(raw);
}

export function isHashOnlyHref(href = "") {
  const value =
    String(href || "").trim();

  if (!value.startsWith("#")) {
    return false;
  }

  return !isHashRouterPath(value);
}

export function isSlugCandidatePath(AppCore, pathname = DEFAULT_ROUTE) {
  return /^\/@[^/]+(?:\/|$)/i.test(
    stripSearchAndHash(
      normalizePath(
        AppCore,
        pathname
      )
    )
  );
}

/* =========================================================
   ROUTE VISIBILITY
========================================================= */

function isAuthLikeCanonicalPath(path = DEFAULT_ROUTE) {
  const canonical =
    normalizeCanonicalPath(
      null,
      path
    );

  if (PUBLIC_AUTH_PATHS.has(canonical)) {
    return true;
  }

  return PUBLIC_AUTH_PREFIXES.some((prefix) =>
    canonical.startsWith(prefix)
  );
}

export function canUsePublicSlugForRoute(route, routeNames) {
  if (!route) {
    return false;
  }

  const routePath =
    stripSearchAndHash(
      normalizePath(
        null,
        route.path || DEFAULT_ROUTE
      )
    );

  if (routePath === routeNames.LOGIN) {
    return false;
  }

  if (isAuthLikeCanonicalPath(routePath)) {
    return false;
  }

  if (
    route.hideShell ||
    route.shell === false ||
    route.showShell === false ||
    route.layout === "auth" ||
    route.layout === "public" ||
    route.meta?.hideShell === true ||
    route.meta?.shell === false ||
    route.meta?.layout === "auth" ||
    route.meta?.layout === "public"
  ) {
    return false;
  }

  return true;
}

/* =========================================================
   RESOLVE HREF
========================================================= */

export function resolveSpaHref(AppCore, href = DEFAULT_ROUTE) {
  const routeNames =
    getRouteNames(AppCore);

  const raw =
    normalizeRouteInput(href);

  if (!raw) {
    return routeNames.HOME;
  }

  if (isUnsafeHref(raw)) {
    return routeNames.HOME;
  }

  if (raw.startsWith("//")) {
    return raw;
  }

  if (isHashRouterPath(raw)) {
    return normalizePath(
      AppCore,
      normalizeHashRouterPath(raw)
    );
  }

  if (isHashOnlyHref(raw)) {
    return raw;
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url =
        new URL(
          raw,
          getBaseOrigin()
        );

      if (url.origin === getBaseOrigin()) {
        if (
          url.hash &&
          isHashRouterPath(url.hash)
        ) {
          return normalizePath(
            AppCore,
            normalizeHashRouterPath(url.hash)
          );
        }

        return normalizePath(
          AppCore,
          `${url.pathname}${url.search}${url.hash}`
        );
      }

      return raw;
    } catch {
      return routeNames.HOME;
    }
  }

  if (isExternalHref(raw)) {
    return raw;
  }

  if (raw.startsWith("/")) {
    return normalizePath(
      AppCore,
      raw
    );
  }

  try {
    const base =
      isBrowser()
        ? window.location.href
        : "http://localhost/";

    const url =
      new URL(
        raw,
        base
      );

    if (
      url.hash &&
      isHashRouterPath(url.hash)
    ) {
      return normalizePath(
        AppCore,
        normalizeHashRouterPath(url.hash)
      );
    }

    return normalizePath(
      AppCore,
      `${url.pathname}${url.search}${url.hash}`
    );
  } catch {
    return routeNames.HOME;
  }
}

/* =========================================================
   BUILDERS
========================================================= */

/**
 * Construye URL pública visible.
 */
export function buildPublicPath(
  AppCore,
  getRoute,
  canonicalPath = DEFAULT_ROUTE,
  options = {}
) {
  const routeNames =
    getRouteNames(AppCore);

  const opts =
    safeObject(options);

  const source =
    normalizePath(
      AppCore,
      opts.fromPath ||
        opts.publicPath ||
        canonicalPath ||
        DEFAULT_ROUTE
    );

  const sourceWithoutSlug =
    stripUsernamePrefix(
      AppCore,
      source
    );

  /*
    Activación con token:
    preservamos query/hash o path-token.
    Si venía con /@slug, lo quitamos por ser ruta auth técnica.
  */
  if (
    isActivationPath(sourceWithoutSlug) &&
    hasActivationToken(sourceWithoutSlug)
  ) {
    return normalizePath(
      AppCore,
      sourceWithoutSlug
    );
  }

  /*
    Reset password confirm con token:
    preservamos query/hash o path-token.
    Si venía con /@slug, lo quitamos por ser ruta auth técnica.
  */
  if (
    isResetConfirmPath(sourceWithoutSlug) &&
    hasResetConfirmToken(sourceWithoutSlug)
  ) {
    return normalizePath(
      AppCore,
      sourceWithoutSlug
    );
  }

  const clean =
    normalizeCanonicalPath(
      AppCore,
      source
    );

  const sourceSuffix =
    getSearchAndHash(source);

  const canonicalSuffix =
    getSearchAndHash(canonicalPath);

  const suffix =
    sourceSuffix ||
    canonicalSuffix ||
    "";

  let route =
    null;

  try {
    route =
      getRoute?.(clean) ||
      null;
  } catch {
    route =
      null;
  }

  const publicWithoutSlug =
    normalizePath(
      AppCore,
      `${clean}${suffix}`
    );

  const sourceHadSlug =
    isSlugCandidatePath(
      AppCore,
      source
    );

  /*
    No degradar /@usuario/ruta si getRoute no está disponible durante
    boot parcial. Se preserva el contexto público si la ruta no es auth.
  */
  if (
    !route &&
    sourceHadSlug &&
    !isAuthLikeCanonicalPath(clean)
  ) {
    return normalizePath(
      AppCore,
      source
    );
  }

  if (!route) {
    return publicWithoutSlug;
  }

  if (
    !canUsePublicSlugForRoute(
      route,
      routeNames
    )
  ) {
    return publicWithoutSlug;
  }

  const username =
    sanitizeUsername(
      AppCore,
      opts.username ||
        opts.resolvedUsername ||
        extractUsernameFromPath(
          AppCore,
          opts.fromPath ||
            opts.publicPath ||
            source ||
            ""
        ) ||
        getCurrentResolvedUsername(AppCore) ||
        getCurrentUsername(AppCore)
    );

  if (!username) {
    return publicWithoutSlug;
  }

  if (clean === routeNames.HOME) {
    return normalizePath(
      AppCore,
      `/@${username}${suffix}`
    );
  }

  return normalizePath(
    AppCore,
    `/@${username}${clean}${suffix}`
  );
}

export function getRedirectPath(AppCore) {
  const routeNames =
    getRouteNames(AppCore);

  let redirect =
    null;

  try {
    redirect =
      getCurrentUrl()
        .searchParams
        .get("redirect");
  } catch {
    redirect =
      null;
  }

  if (!redirect) {
    return null;
  }

  if (
    redirect.length >
    ROUTER_CONFIG.maxRedirectLength
  ) {
    return null;
  }

  const resolved =
    resolveSpaHref(
      AppCore,
      redirect
    );

  if (
    isUnsafeHref(resolved) ||
    isExternalHref(resolved)
  ) {
    return null;
  }

  const canonical =
    normalizeCanonicalPath(
      AppCore,
      resolved
    );

  const loginCanonical =
    normalizeCanonicalPath(
      AppCore,
      routeNames.LOGIN
    );

  if (canonical === loginCanonical) {
    return null;
  }

  if (isAuthLikeCanonicalPath(canonical)) {
    return null;
  }

  return stripUsernamePrefix(
    AppCore,
    resolved
  );
}

export function buildLoginUrl(AppCore, redirectPath = null) {
  const routeNames =
    getRouteNames(AppCore);

  const login =
    normalizePath(
      AppCore,
      routeNames.LOGIN
    );

  if (!redirectPath) {
    return login;
  }

  const resolvedRedirect =
    stripUsernamePrefix(
      AppCore,
      resolveSpaHref(
        AppCore,
        redirectPath
      )
    );

  if (
    isUnsafeHref(resolvedRedirect) ||
    isExternalHref(resolvedRedirect)
  ) {
    return login;
  }

  const redirectCanonical =
    normalizeCanonicalPath(
      AppCore,
      resolvedRedirect
    );

  if (
    redirectCanonical === normalizeCanonicalPath(AppCore, login) ||
    isAuthLikeCanonicalPath(redirectCanonical)
  ) {
    return login;
  }

  try {
    const url =
      new URL(
        `http://localhost${login}`
      );

    url.searchParams.set(
      "redirect",
      resolvedRedirect
    );

    return `${url.pathname}${url.search}`;
  } catch {
    return login;
  }
}

/**
 * URL que debe escribirse en history.
 *
 * Esta función es crítica:
 * NO debe convertir:
 *   /activate-account?token=abc
 * en:
 *   /activate-account
 *
 * Tampoco debe convertir:
 *   /activate-account/abc
 * en:
 *   /activate-account
 *
 * Tampoco debe convertir:
 *   /reset-password/confirm/abc
 * en:
 *   /reset-password/confirm
 *
 * antes de que la vista haya capturado el token.
 */
export function buildHistoryUrl(
  AppCore,
  getRoute,
  pathname = DEFAULT_ROUTE,
  options = {}
) {
  const routeNames =
    getRouteNames(AppCore);

  const opts =
    safeObject(options);

  const resolved =
    resolveSpaHref(
      AppCore,
      pathname
    );

  if (
    isUnsafeHref(resolved) ||
    isExternalHref(resolved)
  ) {
    return routeNames.HOME;
  }

  if (
    opts.preservePath ||
    opts.protectedInitialUrl ||
    opts.skipHistory
  ) {
    return normalizePath(
      AppCore,
      resolved
    );
  }

  return buildPublicPath(
    AppCore,
    getRoute,
    resolved,
    {
      username:
        opts.username,

      resolvedUsername:
        opts.resolvedUsername,

      fromPath:
        opts.fromPath ||
        opts.publicPath ||
        resolved,

      publicPath:
        opts.publicPath,
    }
  );
}

export function buildStatePayload(
  AppCore,
  pathname = DEFAULT_ROUTE,
  extras = {}
) {
  const publicPath =
    normalizePath(
      AppCore,
      pathname
    );

  const canonical =
    normalizeCanonicalPath(
      AppCore,
      publicPath
    );

  const username =
    extractUsernameFromPath(
      AppCore,
      publicPath
    ) ||
    getCurrentResolvedUsername(AppCore) ||
    null;

  return {
    path:
      publicPath,

    publicPath,

    canonicalPath:
      canonical,

    rawCanonicalPath:
      canonical,

    requestedPath:
      publicPath,

    searchAndHash:
      getSearchAndHash(publicPath),

    username,

    isActivationRoute:
      canonical === ACTIVATION_PATH,

    isResetConfirmRoute:
      canonical === RESET_CONFIRM_PATH,

    hasActivationToken:
      hasActivationToken(publicPath),

    hasResetConfirmToken:
      hasResetConfirmToken(publicPath),

    isProtectedPublicTokenRoute:
      isProtectedPublicTokenPath(publicPath),

    ...safeObject(extras),
  };
}

export function getDefaultHomeTarget(AppCore, getRoute) {
  const routeNames =
    getRouteNames(AppCore);

  return (
    buildPublicPath(
      AppCore,
      getRoute,
      routeNames.HOME,
      {
        username:
          getCurrentResolvedUsername(AppCore) ||
          getCurrentUsername(AppCore),
      }
    ) ||
    routeNames.HOME
  );
}

/* =========================================================
   DEBUG
========================================================= */

export function getRouterHelpersSnapshot(AppCore) {
  const currentPublicPath =
    getCurrentPublicPath(AppCore);

  return {
    currentPath:
      redactTokenInText(
        getCurrentPath(AppCore)
      ),

    currentPublicPath:
      redactTokenInText(
        currentPublicPath
      ),

    currentCanonicalPath:
      redactTokenInText(
        getCurrentCanonicalPath(AppCore)
      ),

    browserPath:
      redactTokenInText(
        isBrowser()
          ? getBrowserPath()
          : DEFAULT_ROUTE
      ),

    initialUrl:
      redactTokenInText(
        getInitialUrl()
      ),

    activationInitialUrl:
      redactTokenInText(
        getActivationInitialUrl()
      ),

    resetConfirmInitialUrl:
      redactTokenInText(
        getResetConfirmInitialUrl()
      ),

    protectedActivationPath:
      redactTokenInText(
        getProtectedActivationPath()
      ),

    protectedResetConfirmPath:
      redactTokenInText(
        getProtectedResetConfirmPath()
      ),

    activationTokenScrubbed:
      isActivationTokenScrubbed(),

    resetConfirmTokenScrubbed:
      isResetConfirmTokenScrubbed(),

    hasActivationTokenInCurrentPath:
      hasActivationToken(
        currentPublicPath
      ),

    hasResetConfirmTokenInCurrentPath:
      hasResetConfirmToken(
        currentPublicPath
      ),

    activationPathToken:
      getActivationTokenFromPath(
        currentPublicPath
      )
        ? "***"
        : null,

    resetConfirmPathToken:
      getResetConfirmTokenFromPath(
        currentPublicPath
      )
        ? "***"
        : null,

    username:
      getCurrentResolvedUsername(AppCore),
  };
}

/* =========================================================
   OPTIONAL PUBLIC DEBUG EXPORTS
========================================================= */

export const RouterTokenRoutes =
  Object.freeze({
    ACTIVATION_PATH,
    RESET_CONFIRM_PATH,

    ACTIVATION_TOKEN_PARAM_NAMES,
    RESET_TOKEN_PARAM_NAMES,

    hasActivationToken,
    hasResetConfirmToken,

    hasTokenInActivationPath,
    hasTokenInResetConfirmPath,

    getActivationTokenFromPath,
    getResetConfirmTokenFromPath,

    isProtectedPublicTokenPath,
    redactTokenInText,
  });

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
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

  isProtectedPublicTokenPath,

  canUsePublicSlugForRoute,
  resolveSpaHref,

  buildPublicPath,
  getRedirectPath,
  buildLoginUrl,
  buildHistoryUrl,
  buildStatePayload,
  getDefaultHomeTarget,

  getRouterHelpersSnapshot,
  RouterTokenRoutes,
};
