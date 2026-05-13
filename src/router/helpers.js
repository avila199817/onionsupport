/* =========================================================
   Onion SPA - Router Helpers
   Archivo: src/router/helpers.js

   ONION SUPPORT · ROUTER HELPERS
   PUBLIC/CANONICAL PATH · USERNAME SCOPE · TOKEN ROUTES SAFE
   FINAL EXTREME SYSTEM · 14/10

   RESPONSABILIDADES:
   - Centralizar helpers base del Router real.
   - Normalizar rutas públicas conservando query/hash.
   - Normalizar rutas canónicas sin query/hash ni /@usuario.
   - Resolver hrefs SPA same-origin, relativos y hash-router.
   - Blindar rutas públicas con token:
     · /activate-account?token=...
     · /activate-account/<token>
     · /reset-password/confirm?token=...
     · /reset-password/confirm/<token>
     · /#/activate-account?token=...
     · /#/reset-password/confirm?token=...
   - Preservar URL inicial capturada antes de Router/Auth/History.
   - No resucitar tokens tras scrub oficial en history.state.
   - Soportar alias legacy __ONION_RESET_CONFIRM_INITIAL_URL__.
   - Manejar /@usuario/ruta sin degradar a /.
   - Construir publicPath contextual con /@usuario cuando procede.
   - Construir login URL y redirect seguro anti open-redirect.
   - Generar payload de state/history estable.
   - Redactar tokens en logs/snapshots.
   - Browser/server safe.
   - Cero throws accidentales.

   CONTRATO:
   - publicPath conserva /@usuario + query/hash.
   - canonicalPath nunca conserva /@usuario/query/hash.
   - canonicalPath de rutas técnicas con token:
       /activate-account/<token>          -> /activate-account
       /reset-password/confirm/<token>    -> /reset-password/confirm
   - publicPath de rutas técnicas con token conserva el token hasta
     que la vista lo capture y marque scrub oficial.
========================================================= */

/* =========================================================
   CONFIG
========================================================= */

export const ROUTER_HELPERS_VERSION = "14.0.0";

export const ROUTER_CONFIG = Object.freeze({
  maxRouteLength: 2048,
  maxUsernameLength: 64,
  maxRedirectLength: 1600,
});

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_ROUTE = "/";

const ACTIVATION_PATH = "/activate-account";
const RESET_CONFIRM_PATH = "/reset-password/confirm";

const INITIAL_URL_KEY = "__ONION_INITIAL_URL__";
const BOOT_CONTEXT_KEY = "__ONION_BOOT_CONTEXT__";

const ACTIVATION_INITIAL_URL_KEY = "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__";

const RESET_CONFIRM_INITIAL_URL_KEY = "__ONION_RESET_CONFIRM_INITIAL_URL__";
const RESET_PASSWORD_CONFIRM_INITIAL_URL_KEY =
  "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__";

const PUBLIC_USERNAME_RE = /^@[A-Za-z0-9._-]{1,80}$/;
const UNSAFE_PROTOCOL_RE = /^(javascript:|data:|vbscript:)/i;
const ABSOLUTE_URL_RE = /^[a-z][a-z\d+.-]*:\/\//i;
const ABSOLUTE_PROTOCOL_RE = /^[a-z][a-z\d+.-]*:/i;

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

const GENERIC_SENSITIVE_PARAM_NAMES = Object.freeze([
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

const PUBLIC_AUTH_PATHS = new Set([
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

const PUBLIC_AUTH_PREFIXES = Object.freeze([
  "/activate-account/",
  "/reset-password/confirm/",
]);

const PROTECTED_PUBLIC_TOKEN_ROUTES = Object.freeze([
  Object.freeze({
    key: "activation",
    path: ACTIVATION_PATH,

    initialUrlKeys: Object.freeze([
      ACTIVATION_INITIAL_URL_KEY,
    ]),

    tokenParamNames: ACTIVATION_TOKEN_PARAM_NAMES,

    scrubbedStateKeys: Object.freeze([
      "scrubbedActivationToken",
      "activationTokenScrubbed",
      "scrubbedActivateAccountToken",
    ]),

    scrubbedHistoryKeys: Object.freeze([
      "scrubbedActivationToken",
      "activationTokenScrubbed",
      "scrubbedActivateAccountToken",
      "scrubbedPublicTokenRoute",
      "scrubbedTokenRoute",
    ]),
  }),

  Object.freeze({
    key: "resetConfirm",
    path: RESET_CONFIRM_PATH,

    initialUrlKeys: Object.freeze([
      RESET_PASSWORD_CONFIRM_INITIAL_URL_KEY,
      RESET_CONFIRM_INITIAL_URL_KEY,
    ]),

    tokenParamNames: RESET_TOKEN_PARAM_NAMES,

    scrubbedStateKeys: Object.freeze([
      "scrubbedResetToken",
      "resetTokenScrubbed",
      "scrubbedResetPasswordToken",
      "scrubbedResetConfirmToken",
      "scrubbedPasswordResetToken",
    ]),

    scrubbedHistoryKeys: Object.freeze([
      "scrubbedResetToken",
      "resetTokenScrubbed",
      "scrubbedResetPasswordToken",
      "scrubbedResetConfirmToken",
      "scrubbedPasswordResetToken",
      "scrubbedPublicTokenRoute",
      "scrubbedTokenRoute",
    ]),
  }),
]);

/* =========================================================
   ROUTE NAMES
========================================================= */

export function getRouteNames(AppCore) {
  const routes =
    AppCore?.config?.routes || {};

  return {
    HOME:
      routes.home ||
      DEFAULT_ROUTE,

    LOGIN:
      routes.login ||
      "/login",

    SERVER:
      routes.server ||
      "/servidor",

    USERS:
      routes.users ||
      "/usuarios",

    CLIENTES:
      routes.clientes ||
      routes.clients ||
      "/clientes",

    FACTURAS:
      routes.facturas ||
      routes.invoices ||
      "/facturas",

    INCIDENCIAS:
      routes.incidencias ||
      routes.tickets ||
      "/incidencias",

    CUENTA:
      routes.cuenta ||
      routes.account ||
      "/cuenta",

    AJUSTES:
      routes.ajustes ||
      routes.settings ||
      "/ajustes",
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

function isObjectLike(value) {
  return (
    value !== null &&
    (
      typeof value === "object" ||
      typeof value === "function"
    )
  );
}

function isFunction(value) {
  return typeof value === "function";
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

function unique(values = []) {
  const seen =
    new Set();

  const output =
    [];

  for (const value of safeArray(values)) {
    const text =
      safeText(value, "");

    if (
      text &&
      !seen.has(text)
    ) {
      seen.add(text);
      output.push(text);
    }
  }

  return output;
}

function escapeRegExp(value = "") {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function looksLikeAppCore(value) {
  if (!isObjectLike(value)) {
    return false;
  }

  return Boolean(
    value.state ||
      value.config ||
      value.utils ||
      value.events ||
      value.modules ||
      value.dom ||
      value.cleanup ||
      isFunction(value.setState) ||
      isFunction(value.setRoute) ||
      isFunction(value.setPublicPath)
  );
}

function resolvePathArgs(first, second, fallback = DEFAULT_ROUTE) {
  if (looksLikeAppCore(first)) {
    return {
      AppCore:
        first,

      path:
        second === undefined
          ? fallback
          : second,
    };
  }

  return {
    AppCore:
      null,

    path:
      first === undefined
        ? fallback
        : first,
  };
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

export function escapeHtml(first = "", second = undefined) {
  let AppCore =
    null;

  let value =
    first;

  if (looksLikeAppCore(first)) {
    AppCore =
      first;

    value =
      second;
  }

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
        escapeRegExp(config.path);

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

  try {
    output =
      output.replace(
        /(authorization["'\s:=]+)(Bearer\s+)?([A-Za-z0-9._~+/=-]+)/gi,
        "$1$2***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        "***"
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

  const normalizedSegments =
    [];

  for (const segment of value.split("/")) {
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
    if (ABSOLUTE_URL_RE.test(raw)) {
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
        AppCore.utils.normalizePath(normalized);

      if (delegated) {
        const parts =
          splitRawPath(delegated);

        const clean =
          normalizePathnameOnly(
            parts.pathname || DEFAULT_ROUTE
          );

        if (
          normalized !== DEFAULT_ROUTE &&
          clean === DEFAULT_ROUTE
        ) {
          return normalized;
        }

        normalized =
          clean;
      }
    }
  } catch {}

  return normalized;
}

/**
 * Normaliza una ruta interna conservando query/hash.
 *
 * Compat:
 * - normalizePath(AppCore, path)
 * - normalizePath(path)
 */
export function normalizePath(first = null, second = undefined) {
  const {
    AppCore,
    path,
  } =
    resolvePathArgs(
      first,
      second,
      DEFAULT_ROUTE
    );

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
      normalizePath(path)
    );

  return normalizePathnameOnly(
    parts.pathname || DEFAULT_ROUTE
  );
}

export function getSearchAndHash(path = DEFAULT_ROUTE) {
  const parts =
    splitRawPath(
      normalizePath(path)
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
        normalizeHashRouterPath(parsed.hash)
      );
    }

    return normalizePath(
      `${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`
    );
  } catch {
    return normalizePath(raw);
  }
}

/* =========================================================
   USERNAME PATH HELPERS
========================================================= */

function isUsernameSegment(segment = "") {
  return PUBLIC_USERNAME_RE.test(
    safeText(segment, "")
  );
}

function getPathSegments(pathname = DEFAULT_ROUTE) {
  return normalizePathnameOnly(pathname)
    .split("/")
    .filter(Boolean);
}

function stripPublicUsernamePrefixFromPathname(pathname = DEFAULT_ROUTE) {
  const segments =
    getPathSegments(pathname);

  if (
    segments.length > 0 &&
    isUsernameSegment(segments[0])
  ) {
    const rest =
      segments.slice(1).join("/");

    return rest
      ? normalizePathnameOnly(`/${rest}`)
      : DEFAULT_ROUTE;
  }

  return normalizePathnameOnly(pathname);
}

function getPublicUsernameFromPathname(pathname = DEFAULT_ROUTE) {
  const first =
    getPathSegments(pathname)[0] ||
    "";

  if (!isUsernameSegment(first)) {
    return "";
  }

  return first.slice(1);
}

/* =========================================================
   PUBLIC TOKEN HELPERS
========================================================= */

function getHistoryState() {
  if (!isBrowser()) {
    return {};
  }

  try {
    return safeObject(window.history?.state);
  } catch {
    return {};
  }
}

function isProtectedTokenScrubbedByConfig(config = null) {
  if (
    !isBrowser() ||
    !config
  ) {
    return false;
  }

  const state =
    getHistoryState();

  try {
    if (
      state.scrubbedPublicTokenRoute === true ||
      state.scrubbedTokenRoute === true
    ) {
      return true;
    }

    if (
      state.scrubbedPublicTokenRoute === config.key ||
      state.scrubbedTokenRoute === config.key
    ) {
      return true;
    }

    const keys =
      unique([
        ...safeArray(config.scrubbedStateKeys),
        ...safeArray(config.scrubbedHistoryKeys),
      ]);

    return keys.some((key) =>
      Boolean(state?.[key])
    );
  } catch {
    return false;
  }
}

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
  const pathname =
    stripPublicUsernamePrefixFromPathname(
      stripSearchAndHash(
        normalizePath(path)
      )
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

    if (!pathname.startsWith(`${base}/`)) {
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

    return safeArray(tokenParamNames).some((name) =>
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
      .join("?")
      .split("#")[0];

  return query
    ? `?${query}`
    : "";
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
      getHashRouterCandidate(parsed.hash);

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
      getHashRouterCandidate(parts.hash);

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

  if (isProtectedTokenScrubbedByConfig(config)) {
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
   ACTIVATION / RESET TOKEN HELPERS
========================================================= */

export function isActivationPath(path = "") {
  return isPathOrChild(
    path,
    ACTIVATION_PATH
  );
}

export function getActivationTokenFromPath(pathOrUrl = "") {
  return getTokenFromPathByBase(
    pathOrUrl,
    ACTIVATION_PATH
  );
}

export function hasTokenInActivationPath(pathOrUrl = "") {
  return Boolean(
    getActivationTokenFromPath(pathOrUrl)
  );
}

export function hasActivationToken(pathOrUrl = "") {
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

export function isResetConfirmPath(path = "") {
  return isPathOrChild(
    path,
    RESET_CONFIRM_PATH
  );
}

export function getResetConfirmTokenFromPath(pathOrUrl = "") {
  return getTokenFromPathByBase(
    pathOrUrl,
    RESET_CONFIRM_PATH
  );
}

export function hasTokenInResetConfirmPath(pathOrUrl = "") {
  return Boolean(
    getResetConfirmTokenFromPath(pathOrUrl)
  );
}

export function hasResetConfirmToken(pathOrUrl = "") {
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
        normalizeHashRouterPath(hash)
      );
    }

    return normalizePath(
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
    }

    return true;
  } catch {
    return false;
  }
}

function setWindowValue(key = "", value = "") {
  if (
    !isBrowser() ||
    !key
  ) {
    return false;
  }

  try {
    window[key] =
      value;

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

function patchBootContext(patch = {}) {
  if (!isBrowser()) {
    return false;
  }

  try {
    const current =
      getBootContext();

    window[BOOT_CONTEXT_KEY] = {
      ...current,
      ...safeObject(patch),
    };

    return true;
  } catch {
    return false;
  }
}

export function captureInitialUrl() {
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

    let protectedKey =
      "";

    if (
      isActivationPath(path) &&
      hasActivationToken(href) &&
      !isActivationTokenScrubbed()
    ) {
      setWindowValueOnce(
        ACTIVATION_INITIAL_URL_KEY,
        href
      );

      protectedKey =
        "activation";
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

      setWindowValueOnce(
        RESET_CONFIRM_INITIAL_URL_KEY,
        href
      );

      protectedKey =
        "resetConfirm";
    }

    if (protectedKey) {
      patchBootContext({
        bootProtectedInitialUrl:
          href,

        bootProtectedInitialPublicPath:
          path,

        bootProtectedInitialPath:
          normalizeCanonicalPath(path),

        bootProtectedRouteKey:
          protectedKey,

        bootIsPublicTokenRoute:
          true,

        bootHasPublicToken:
          true,
      });
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

function getStateInitialCandidates(AppCore, config = null) {
  const state =
    safeObject(AppCore?.state);

  const boot =
    getBootContext();

  const candidates = [
    state.bootProtectedInitialUrl,
    state.bootProtectedInitialPublicPath,
    state.bootProtectedInitialPath,

    boot.bootProtectedInitialUrl,
    boot.bootProtectedInitialPublicPath,
    boot.bootProtectedInitialPath,
  ];

  if (config?.key === "activation") {
    candidates.push(
      state.bootActivationInitialUrl,
      state.bootActivationInitialPublicPath,
      state.bootActivationInitialPath,

      boot.bootActivationInitialUrl,
      boot.bootActivationInitialPublicPath,
      boot.bootActivationInitialPath
    );
  }

  if (config?.key === "resetConfirm") {
    candidates.push(
      state.bootResetConfirmInitialUrl,
      state.bootResetConfirmInitialPublicPath,
      state.bootResetConfirmInitialPath,

      state.bootResetPasswordConfirmInitialUrl,
      state.bootResetPasswordConfirmInitialPublicPath,
      state.bootResetPasswordConfirmInitialPath,

      boot.bootResetConfirmInitialUrl,
      boot.bootResetConfirmInitialPublicPath,
      boot.bootResetConfirmInitialPath,

      boot.bootResetPasswordConfirmInitialUrl,
      boot.bootResetPasswordConfirmInitialPublicPath,
      boot.bootResetPasswordConfirmInitialPath
    );
  }

  return candidates
    .map((value) =>
      safeText(value, "")
    )
    .filter(Boolean);
}

function resolveProtectedInitialPath(AppCore = null, config = null) {
  if (!config) {
    return "";
  }

  if (isProtectedTokenScrubbedByConfig(config)) {
    return "";
  }

  captureInitialUrl();

  const candidates =
    unique([
      ...safeArray(config.initialUrlKeys).map((key) =>
        getWindowValue(key)
      ),

      ...getStateInitialCandidates(
        AppCore,
        config
      ),

      getInitialUrl(),

      isBrowser()
        ? safeText(window.location.href, "")
        : "",

      getBrowserPath(),
    ])
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

function getProtectedActivationPath(AppCore = null) {
  return resolveProtectedInitialPath(
    AppCore,
    PROTECTED_PUBLIC_TOKEN_ROUTES[0]
  );
}

function getProtectedResetConfirmPath(AppCore = null) {
  return resolveProtectedInitialPath(
    AppCore,
    PROTECTED_PUBLIC_TOKEN_ROUTES[1]
  );
}

export function getProtectedInitialPublicPath(AppCore = null) {
  return (
    getProtectedActivationPath(AppCore) ||
    getProtectedResetConfirmPath(AppCore) ||
    ""
  );
}

/* =========================================================
   USERNAME
========================================================= */

export function sanitizeUsername(first = null, second = undefined) {
  let AppCore =
    null;

  let value =
    first;

  if (looksLikeAppCore(first)) {
    AppCore =
      first;
    value =
      second;
  }

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

export function extractUsernameFromPath(first = null, second = undefined) {
  const {
    AppCore,
    path,
  } =
    resolvePathArgs(
      first,
      second,
      DEFAULT_ROUTE
    );

  const parts =
    splitRawPath(
      normalizePath(
        AppCore,
        path
      )
    );

  const raw =
    getPublicUsernameFromPathname(
      parts.pathname
    );

  const username =
    sanitizeUsername(
      AppCore,
      raw
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
    const fromBrowser =
      extractUsernameFromPath(
        AppCore,
        getBrowserPath()
      );

    if (fromBrowser) {
      return fromBrowser;
    }
  }

  return (
    getCurrentUsername(AppCore) ||
    null
  );
}

/* =========================================================
   CANONICAL / PUBLIC
========================================================= */

export function stripUsernamePrefix(first = null, second = undefined) {
  const {
    AppCore,
    path,
  } =
    resolvePathArgs(
      first,
      second,
      DEFAULT_ROUTE
    );

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

export function normalizeCanonicalPath(first = null, second = undefined) {
  const {
    AppCore,
    path,
  } =
    resolvePathArgs(
      first,
      second,
      DEFAULT_ROUTE
    );

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

function shouldPreferStatePath(AppCore) {
  const state =
    safeObject(AppCore?.state);

  const statePublic =
    safeText(state.publicPath, "");

  const stateRoute =
    safeText(state.route, "");

  if (state.initialRouteRendered === true) {
    return Boolean(
      statePublic ||
        stateRoute
    );
  }

  if (state.bootNavigationHandled === true) {
    return Boolean(
      statePublic ||
        stateRoute
    );
  }

  if (
    statePublic &&
    statePublic !== DEFAULT_ROUTE
  ) {
    return true;
  }

  return false;
}

export function getCurrentPath(AppCore) {
  const protectedInitial =
    getProtectedInitialPublicPath(AppCore);

  if (protectedInitial) {
    return normalizePath(
      AppCore,
      protectedInitial
    );
  }

  if (shouldPreferStatePath(AppCore)) {
    return normalizePath(
      AppCore,
      AppCore?.state?.publicPath ||
        AppCore?.state?.route ||
        DEFAULT_ROUTE
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

export function getCurrentCanonicalPath(AppCore) {
  return normalizeCanonicalPath(
    AppCore,
    getCurrentPath(AppCore)
  );
}

export function getCurrentPublicPath(AppCore) {
  const protectedInitial =
    getProtectedInitialPublicPath(AppCore);

  if (protectedInitial) {
    return normalizePath(
      AppCore,
      protectedInitial
    );
  }

  if (shouldPreferStatePath(AppCore)) {
    return normalizePath(
      AppCore,
      AppCore?.state?.publicPath ||
        AppCore?.state?.route ||
        DEFAULT_ROUTE
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

  return UNSAFE_PROTOCOL_RE.test(raw);
}

export function isHashOnlyHref(href = "") {
  const value =
    String(href || "").trim();

  if (!value.startsWith("#")) {
    return false;
  }

  return !isHashRouterPath(value);
}

export function isSlugCandidatePath(first = null, second = undefined) {
  const {
    AppCore,
    path,
  } =
    resolvePathArgs(
      first,
      second,
      DEFAULT_ROUTE
    );

  return /^\/@[^/]+(?:\/|$)/i.test(
    stripSearchAndHash(
      normalizePath(
        AppCore,
        path
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
      path
    );

  if (PUBLIC_AUTH_PATHS.has(canonical)) {
    return true;
  }

  return PUBLIC_AUTH_PREFIXES.some((prefix) =>
    canonical.startsWith(prefix)
  );
}

export function canUsePublicSlugForRoute(route, routeNames = null) {
  if (!route) {
    return false;
  }

  const names =
    routeNames ||
    {
      LOGIN:
        "/login",
    };

  const routePath =
    stripSearchAndHash(
      normalizePath(
        route.path || DEFAULT_ROUTE
      )
    );

  if (routePath === names.LOGIN) {
    return false;
  }

  if (isAuthLikeCanonicalPath(routePath)) {
    return false;
  }

  if (
    route.hideShell === true ||
    route.shell === false ||
    route.showShell === false ||
    route.layout === "auth" ||
    route.layout === "public" ||
    route.meta?.hideShell === true ||
    route.meta?.shell === false ||
    route.meta?.showShell === false ||
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

  if (ABSOLUTE_PROTOCOL_RE.test(raw)) {
    return routeNames.HOME;
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

function shouldPreserveTechnicalTokenPublicPath(source = "") {
  const sourceWithoutSlug =
    stripUsernamePrefix(source);

  if (
    isActivationPath(sourceWithoutSlug) &&
    hasActivationToken(sourceWithoutSlug) &&
    !isActivationTokenScrubbed()
  ) {
    return true;
  }

  if (
    isResetConfirmPath(sourceWithoutSlug) &&
    hasResetConfirmToken(sourceWithoutSlug) &&
    !isResetConfirmTokenScrubbed()
  ) {
    return true;
  }

  return false;
}

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
        opts.requestedPath ||
        canonicalPath ||
        DEFAULT_ROUTE
    );

  const sourceWithoutSlug =
    stripUsernamePrefix(
      AppCore,
      source
    );

  if (shouldPreserveTechnicalTokenPublicPath(source)) {
    return normalizePath(
      AppCore,
      sourceWithoutSlug
    );
  }

  const clean =
    normalizeCanonicalPath(
      AppCore,
      canonicalPath || source
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

  return normalizePath(
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
    normalizePath(
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
    opts.preservePath === true ||
    opts.preservePublicPath === true ||
    opts.preserveUrl === true ||
    opts.protectedInitialUrl === true ||
    opts.skipHistory === true
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
    version:
      ROUTER_HELPERS_VERSION,

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
        getProtectedActivationPath(AppCore)
      ),

    protectedResetConfirmPath:
      redactTokenInText(
        getProtectedResetConfirmPath(AppCore)
      ),

    protectedInitialPublicPath:
      redactTokenInText(
        getProtectedInitialPublicPath(AppCore)
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

    routeNames:
      getRouteNames(AppCore),
  };
}

/* =========================================================
   OPTIONAL PUBLIC DEBUG EXPORTS
========================================================= */

export const RouterTokenRoutes = Object.freeze({
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

  isActivationPath,
  isResetConfirmPath,

  isProtectedPublicTokenPath,
  getProtectedInitialPublicPath,

  redactTokenInText,
});

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

  canUsePublicSlugForRoute,
  resolveSpaHref,

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
