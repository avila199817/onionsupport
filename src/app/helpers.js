/* =========================================================
   Onion SPA - App Helpers
   Archivo: /src/app/helpers.js

   ONION SUPPORT · APP HELPERS
   PATH CORE · TOKEN ROUTES SAFE · CLEANUP SAFE · 10/10

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
   - Compatibilidad de firmas:
       normalizePublicPath(AppCore, path)
       normalizePublicPath(path)
       normalizeCanonicalPath(AppCore, path)
       normalizeCanonicalPath(path)
   - Hash router compatible:
       /#/activate-account?token=...
       /#!/reset-password/confirm?token=...
   - Token por query/path/hash-query compatible.
   - Alias legacy reset initial URL compatible.
   - Scrub detection por history.state.
   - No open-redirect.
   - Debug snapshot sin tokens reales.

   EXTREME MODE:
   - Canonicalización fuerte de aliases:
       /activate, /activation, /account/activate, /activate/first-user
         -> /activate-account
       /password-reset/confirm, /reset-password-confirm, /password-reset-confirm
         -> /reset-password/confirm
   - publicPath conserva la URL real.
   - canonicalPath usa path interno estable.
   - Soporta /@usuario/activate-account?token=...
   - Soporta /@usuario/reset-password/confirm/<token>
   - Registro de módulos con aliases sin duplicados destructivos.
========================================================= */

import {
  APP_SCOPE,
  APP_RUNTIME_KEYS,
  APP_STATE_KEYS,
  PROTECTED_PUBLIC_TOKEN_ROUTES as CONSTANT_PUBLIC_TOKEN_ROUTES,
  GENERIC_SENSITIVE_PARAM_NAMES,
} from "./constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const HELPERS_VERSION = "15.0.0-extreme-pro";

const DEFAULT_ROUTE = "/";
const DEFAULT_SCOPE = APP_SCOPE || "app";

const INITIAL_URL_KEY =
  APP_RUNTIME_KEYS?.initialUrl ||
  "__ONION_INITIAL_URL__";

const BOOT_CONTEXT_KEY =
  APP_RUNTIME_KEYS?.bootContext ||
  "__ONION_BOOT_CONTEXT__";

const ACTIVATION_PATH = "/activate-account";
const RESET_CONFIRM_PATH = "/reset-password/confirm";

const ACTIVATION_ALIASES = Object.freeze([
  "/activate",
  "/activation",
  "/account/activate",
  "/activate/first-user",
]);

const RESET_CONFIRM_ALIASES = Object.freeze([
  "/reset-password-confirm",
  "/password-reset/confirm",
  "/password-reset-confirm",
]);

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

const GENERIC_TOKEN_PARAM_NAMES = Object.freeze(
  Array.isArray(GENERIC_SENSITIVE_PARAM_NAMES) &&
    GENERIC_SENSITIVE_PARAM_NAMES.length
    ? GENERIC_SENSITIVE_PARAM_NAMES
    : [
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
        "authorization",
        "jwt",
        "session",
        "sid",
      ]
);

const FALLBACK_PUBLIC_TOKEN_ROUTES = Object.freeze([
  Object.freeze({
    key: "activation",
    path: ACTIVATION_PATH,
    aliases: ACTIVATION_ALIASES,

    windowKey:
      APP_RUNTIME_KEYS?.activateAccountInitialUrl ||
      APP_RUNTIME_KEYS?.activationInitialUrl ||
      "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",

    windowKeys: Object.freeze([
      APP_RUNTIME_KEYS?.activateAccountInitialUrl ||
        "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
      APP_RUNTIME_KEYS?.activationInitialUrl ||
        "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
    ]),

    stateUrlKey:
      APP_STATE_KEYS?.bootActivationInitialUrl ||
      "bootActivationInitialUrl",

    statePathKey:
      APP_STATE_KEYS?.bootActivationInitialPath ||
      "bootActivationInitialPath",

    statePublicPathKey:
      APP_STATE_KEYS?.bootActivationInitialPublicPath ||
      "bootActivationInitialPublicPath",

    stateIsRouteKey:
      APP_STATE_KEYS?.bootIsActivation ||
      "bootIsActivation",

    stateHasTokenKey:
      APP_STATE_KEYS?.bootHasActivationToken ||
      "bootHasActivationToken",

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

    tokenParamNames: ACTIVATION_TOKEN_PARAM_NAMES,
  }),

  Object.freeze({
    key: "resetConfirm",
    path: RESET_CONFIRM_PATH,
    aliases: RESET_CONFIRM_ALIASES,

    windowKey:
      APP_RUNTIME_KEYS?.resetConfirmInitialUrl ||
      "__ONION_RESET_CONFIRM_INITIAL_URL__",

    windowKeys: Object.freeze([
      APP_RUNTIME_KEYS?.resetPasswordConfirmInitialUrl ||
        "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
      APP_RUNTIME_KEYS?.resetConfirmInitialUrl ||
        "__ONION_RESET_CONFIRM_INITIAL_URL__",
    ]),

    stateUrlKey:
      APP_STATE_KEYS?.bootResetConfirmInitialUrl ||
      "bootResetConfirmInitialUrl",

    statePathKey:
      APP_STATE_KEYS?.bootResetConfirmInitialPath ||
      "bootResetConfirmInitialPath",

    statePublicPathKey:
      APP_STATE_KEYS?.bootResetConfirmInitialPublicPath ||
      "bootResetConfirmInitialPublicPath",

    stateIsRouteKey:
      APP_STATE_KEYS?.bootIsResetConfirm ||
      "bootIsResetConfirm",

    stateHasTokenKey:
      APP_STATE_KEYS?.bootHasResetToken ||
      "bootHasResetToken",

    scrubbedStateKeys: Object.freeze([
      "scrubbedResetToken",
      "resetTokenScrubbed",
      "scrubbedResetConfirmToken",
      "scrubbedPasswordResetToken",
      "scrubbedResetPasswordToken",
    ]),

    scrubbedHistoryKeys: Object.freeze([
      "scrubbedResetToken",
      "resetTokenScrubbed",
      "scrubbedResetConfirmToken",
      "scrubbedPasswordResetToken",
      "scrubbedResetPasswordToken",
      "scrubbedPublicTokenRoute",
      "scrubbedTokenRoute",
    ]),

    tokenParamNames: RESET_TOKEN_PARAM_NAMES,
  }),
]);

const PUBLIC_USERNAME_RE = /^@[A-Za-z0-9._-]{1,80}$/;
const ABSOLUTE_URL_RE = /^[a-z][a-z\d+.-]*:\/\//i;
const UNSAFE_PROTOCOL_RE = /^[a-z][a-z0-9+.-]*:/i;

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
  return isObject(value) ? value : {};
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
    String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return text || fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
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
        enumerable: false,
        configurable: true,
        writable: true,
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

function unique(values = []) {
  const seen = new Set();
  const output = [];

  for (const value of safeArray(values)) {
    const text = safeText(value, "");

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

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

function looksLikeAppCore(value) {
  if (!isObjectLike(value)) {
    return false;
  }

  return Boolean(
    value.state ||
      value.utils ||
      value.events ||
      value.modules ||
      value.cleanup ||
      value.dom ||
      isFunction(value.setState) ||
      isFunction(value.setRoute) ||
      isFunction(value.setPublicPath)
  );
}

function resolvePathArgs(first, second, fallback = DEFAULT_ROUTE) {
  if (looksLikeAppCore(first)) {
    return {
      AppCore: first,
      path:
        second === undefined
          ? fallback
          : second,
    };
  }

  return {
    AppCore: null,
    path:
      first === undefined
        ? fallback
        : first,
  };
}

/* =========================================================
   HASH ROUTER
========================================================= */

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return DEFAULT_ROUTE;
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  }

  return raw.replace(/^#\/?/, "/") || DEFAULT_ROUTE;
}

/* =========================================================
   PATH NORMALIZATION
========================================================= */

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

  const rawSegments =
    value
      .split("/")
      .filter(Boolean);

  const segments = [];

  for (const segment of rawSegments) {
    if (segment === ".") {
      continue;
    }

    if (segment === "..") {
      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  value = `/${segments.join("/")}`;

  if (!value) {
    value = DEFAULT_ROUTE;
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value = value.replace(/\/+$/g, "") || DEFAULT_ROUTE;
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

function fallbackNormalizePath(path = DEFAULT_ROUTE) {
  const raw =
    safeText(path, DEFAULT_ROUTE) || DEFAULT_ROUTE;

  if (isHashRouterPath(raw)) {
    return fallbackNormalizePath(
      normalizeHashRouterPath(raw)
    );
  }

  if (
    UNSAFE_PROTOCOL_RE.test(raw) &&
    !ABSOLUTE_URL_RE.test(raw)
  ) {
    return DEFAULT_ROUTE;
  }

  try {
    if (ABSOLUTE_URL_RE.test(raw)) {
      const parsed =
        new URL(
          raw,
          getBaseOrigin()
        );

      if (parsed.origin !== getBaseOrigin()) {
        return DEFAULT_ROUTE;
      }

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
  } catch {
    return DEFAULT_ROUTE;
  }

  const {
    pathname,
    search,
    hash,
  } = splitRawPath(raw);

  return `${normalizePathnameOnly(pathname)}${normalizeSearch(search)}${normalizeHash(hash)}`;
}

export function normalizePublicPath(first = DEFAULT_ROUTE, second = undefined) {
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
    safeText(path, DEFAULT_ROUTE) || DEFAULT_ROUTE;

  const fallback =
    fallbackNormalizePath(raw);

  /*
    publicPath conserva query/hash.
    No delegamos a normalizadores globales si hay query/hash:
    algunos normalizadores legacy devuelven sólo pathname y destruyen token.
  */
  const hasSuffix =
    raw.includes("?") ||
    raw.includes("#");

  if (hasSuffix) {
    return fallback;
  }

  try {
    if (isFunction(AppCore?.utils?.normalizePublicPath)) {
      const delegated =
        AppCore.utils.normalizePublicPath(raw);

      if (delegated) {
        const clean =
          fallbackNormalizePath(delegated);

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

  try {
    if (isFunction(AppCore?.utils?.normalizePath)) {
      const delegated =
        AppCore.utils.normalizePath(raw);

      if (delegated) {
        const clean =
          fallbackNormalizePath(delegated);

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
  return PUBLIC_USERNAME_RE.test(
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

/* =========================================================
   PROTECTED ROUTE CONFIG
========================================================= */

function getFallbackRouteByPath(path = "") {
  const cleanPath =
    normalizePathnameOnly(path || DEFAULT_ROUTE);

  return (
    FALLBACK_PUBLIC_TOKEN_ROUTES.find((item) => {
      const paths = [
        item.path,
        ...safeArray(item.aliases),
      ];

      return paths.includes(cleanPath);
    }) || null
  );
}

function getFallbackRouteByKey(key = "") {
  const cleanKey =
    safeText(key, "");

  return (
    FALLBACK_PUBLIC_TOKEN_ROUTES.find((item) =>
      item.key === cleanKey
    ) || null
  );
}

function normalizeRouteAliasList(path = "", aliases = []) {
  return unique([
    path,
    ...safeArray(aliases),
  ])
    .map((item) =>
      normalizePathnameOnly(item || DEFAULT_ROUTE)
    )
    .filter((item) =>
      item &&
      item !== DEFAULT_ROUTE
    );
}

function normalizeProtectedRouteConfig(config = {}) {
  const item =
    safeObject(config);

  const rawPath =
    item.path ||
    item.route ||
    item.canonicalPath ||
    DEFAULT_ROUTE;

  const path =
    normalizePathnameOnly(rawPath);

  const key =
    safeText(
      item.key ||
        item.name ||
        path
          .replace(/^\/+/, "")
          .replace(/[/-]/g, "_"),
      ""
    );

  const fallback =
    getFallbackRouteByKey(key) ||
    getFallbackRouteByPath(path) ||
    {};

  const defaultAliases =
    key === "activation" || path === ACTIVATION_PATH
      ? ACTIVATION_ALIASES
      : key === "resetConfirm" || path === RESET_CONFIRM_PATH
        ? RESET_CONFIRM_ALIASES
        : [];

  const aliases =
    normalizeRouteAliasList(
      path,
      [
        ...safeArray(fallback.aliases),
        ...safeArray(item.aliases),
        ...defaultAliases,
      ]
    ).filter((itemPath) =>
      itemPath !== path
    );

  const windowKeys =
    unique([
      ...safeArray(fallback.windowKeys),
      fallback.windowKey,
      ...safeArray(item.windowKeys),
      item.windowKey,
      item.initialWindowKey,
      item.runtimeKey,
    ]);

  const defaultTokenNames =
    path === ACTIVATION_PATH || key === "activation"
      ? ACTIVATION_TOKEN_PARAM_NAMES
      : path === RESET_CONFIRM_PATH || key === "resetConfirm"
        ? RESET_TOKEN_PARAM_NAMES
        : [];

  const tokenParamNames =
    unique([
      ...safeArray(fallback.tokenParamNames),
      ...safeArray(item.tokenParamNames),
      ...defaultTokenNames,
    ]);

  const scrubbedStateKeys =
    unique([
      ...safeArray(fallback.scrubbedStateKeys),
      ...safeArray(item.scrubbedStateKeys),
    ]);

  const scrubbedHistoryKeys =
    unique([
      ...safeArray(fallback.scrubbedHistoryKeys),
      ...safeArray(item.scrubbedHistoryKeys),
    ]);

  return Object.freeze({
    ...fallback,
    ...item,

    key,
    path,

    aliases:
      Object.freeze(aliases),

    allPaths:
      Object.freeze(
        normalizeRouteAliasList(
          path,
          aliases
        )
      ),

    windowKey:
      windowKeys[0] || "",

    windowKeys:
      Object.freeze(windowKeys),

    stateUrlKey:
      item.stateUrlKey ||
      fallback.stateUrlKey ||
      "",

    statePathKey:
      item.statePathKey ||
      fallback.statePathKey ||
      "",

    statePublicPathKey:
      item.statePublicPathKey ||
      fallback.statePublicPathKey ||
      "",

    stateIsRouteKey:
      item.stateIsRouteKey ||
      fallback.stateIsRouteKey ||
      "",

    stateHasTokenKey:
      item.stateHasTokenKey ||
      fallback.stateHasTokenKey ||
      "",

    scrubbedStateKeys:
      Object.freeze(scrubbedStateKeys),

    scrubbedHistoryKeys:
      Object.freeze(scrubbedHistoryKeys),

    tokenParamNames:
      Object.freeze(tokenParamNames),
  });
}

export const PROTECTED_PUBLIC_TOKEN_ROUTES =
  Object.freeze(
    (
      Array.isArray(CONSTANT_PUBLIC_TOKEN_ROUTES) &&
      CONSTANT_PUBLIC_TOKEN_ROUTES.length
        ? CONSTANT_PUBLIC_TOKEN_ROUTES
        : FALLBACK_PUBLIC_TOKEN_ROUTES
    )
      .map((config) =>
        normalizeProtectedRouteConfig(config)
      )
      .filter((config) =>
        config.path &&
        config.path !== DEFAULT_ROUTE
      )
  );

function getRoutePaths(config = null) {
  return safeArray(config?.allPaths).length
    ? safeArray(config.allPaths)
    : normalizeRouteAliasList(
        config?.path || "",
        config?.aliases || []
      );
}

function getCanonicalPathForProtectedConfig(config = null) {
  return normalizePathnameOnly(
    config?.path || DEFAULT_ROUTE
  );
}

function getMatchedProtectedRoutePath(config = null, canonicalPath = "") {
  const clean =
    normalizePathnameOnly(canonicalPath || DEFAULT_ROUTE);

  for (const routePath of getRoutePaths(config)) {
    if (
      clean === routePath ||
      clean.startsWith(`${routePath}/`)
    ) {
      return routePath;
    }
  }

  return "";
}

function canonicalizeProtectedAliasPath(path = DEFAULT_ROUTE) {
  const publicPath =
    fallbackNormalizePath(path);

  const pathname =
    stripSearchAndHash(publicPath);

  const suffix =
    getSearchAndHash(publicPath);

  const stripped =
    stripUsernamePrefix(pathname);

  const cleanCanonical =
    stripSearchAndHash(stripped);

  for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
    const matchedPath =
      getMatchedProtectedRoutePath(
        config,
        cleanCanonical
      );

    if (!matchedPath) {
      continue;
    }

    const targetPath =
      getCanonicalPathForProtectedConfig(config);

    if (matchedPath === targetPath) {
      return fallbackNormalizePath(
        `${cleanCanonical}${suffix}`
      );
    }

    const rest =
      cleanCanonical.slice(matchedPath.length);

    return fallbackNormalizePath(
      `${targetPath}${rest}${suffix}`
    );
  }

  return fallbackNormalizePath(
    `${cleanCanonical}${suffix}`
  );
}

function fallbackNormalizeCanonicalPath(path = DEFAULT_ROUTE) {
  const canonicalized =
    canonicalizeProtectedAliasPath(path);

  const pathname =
    stripSearchAndHash(canonicalized);

  return normalizePathnameOnly(pathname);
}

export function normalizeCanonicalPath(first = DEFAULT_ROUTE, second = undefined) {
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

  if (
    UNSAFE_PROTOCOL_RE.test(raw) &&
    !ABSOLUTE_URL_RE.test(raw)
  ) {
    return DEFAULT_ROUTE;
  }

  try {
    if (ABSOLUTE_URL_RE.test(raw)) {
      const parsed =
        new URL(
          raw,
          getBaseOrigin()
        );

      if (parsed.origin !== getBaseOrigin()) {
        return DEFAULT_ROUTE;
      }

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
  } catch {
    return DEFAULT_ROUTE;
  }

  return fallbackNormalizePath(raw);
}

/* =========================================================
   SAFE INTERNAL TARGETS
========================================================= */

export function isSafeInternalPath(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return false;
  }

  if (!raw.startsWith("/")) {
    return false;
  }

  if (raw.startsWith("//")) {
    return false;
  }

  if (UNSAFE_PROTOCOL_RE.test(raw)) {
    return false;
  }

  if (/[\r\n\t\\]/.test(raw)) {
    return false;
  }

  return true;
}

export function normalizeInternalPathTarget(value = DEFAULT_ROUTE, fallback = DEFAULT_ROUTE) {
  const raw =
    safeText(value, fallback) || fallback;

  if (!isSafeInternalPath(raw)) {
    return fallbackNormalizePath(fallback);
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    if (parsed.origin !== getBaseOrigin()) {
      return fallbackNormalizePath(fallback);
    }

    const path =
      fallbackNormalizePath(
        `${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`
      );

    return isSafeInternalPath(path)
      ? path
      : fallbackNormalizePath(fallback);
  } catch {
    const path =
      fallbackNormalizePath(raw);

    return isSafeInternalPath(path)
      ? path
      : fallbackNormalizePath(fallback);
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
    for (const routePath of getRoutePaths(config)) {
      try {
        const escapedPath =
          String(routePath || "").replace(/\//g, "\\/");

        if (!escapedPath) {
          continue;
        }

        output =
          output.replace(
            new RegExp(`(${escapedPath})\\/([^/?#\\s]+)`, "gi"),
            "$1/***"
          );
      } catch {}
    }
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
   PROTECTED PUBLIC TOKEN ROUTES
========================================================= */

function matchesProtectedRoute(config, pathOrUrl = "") {
  if (!config?.path) {
    return false;
  }

  const path =
    pathFromUrlLike(pathOrUrl);

  const canonical =
    stripSearchAndHash(
      stripUsernamePrefix(path)
    );

  return Boolean(
    getMatchedProtectedRoutePath(
      config,
      canonical
    )
  );
}

function getProtectedRouteConfig(value = "") {
  return (
    PROTECTED_PUBLIC_TOKEN_ROUTES.find((config) =>
      matchesProtectedRoute(
        config,
        value
      )
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
    stripSearchAndHash(
      stripUsernamePrefix(path)
    );

  const matchedPath =
    getMatchedProtectedRoutePath(
      config,
      canonical
    );

  if (!matchedPath) {
    return "";
  }

  if (!canonical.startsWith(`${matchedPath}/`)) {
    return "";
  }

  const token =
    canonical
      .slice(`${matchedPath}/`.length)
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

  if (
    extractPathToken(
      config,
      raw
    )
  ) {
    return true;
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    if (
      parsed.origin !== getBaseOrigin()
    ) {
      return false;
    }

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

      if (
        extractPathToken(
          config,
          hashPath
        )
      ) {
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
  const config =
    PROTECTED_PUBLIC_TOKEN_ROUTES.find((item) =>
      item.key === "activation" ||
      item.path === ACTIVATION_PATH
    );

  return matchesProtectedRoute(
    config,
    path
  );
}

export function isResetConfirmPath(path = "") {
  const config =
    PROTECTED_PUBLIC_TOKEN_ROUTES.find((item) =>
      item.key === "resetConfirm" ||
      item.path === RESET_CONFIRM_PATH
    );

  return matchesProtectedRoute(
    config,
    path
  );
}

/* =========================================================
   WINDOW / BOOT CONTEXT
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

  let wrote = false;

  for (const key of keys) {
    if (
      setWindowValue(
        key,
        value,
        true
      )
    ) {
      wrote = true;
    }
  }

  return wrote;
}

function applyBootContextToCore(AppCore, patch = {}) {
  const cleanPatch =
    safeObject(patch);

  if (!Object.keys(cleanPatch).length) {
    return false;
  }

  try {
    AppCore?.setState?.(
      cleanPatch,
      {
        source:
          "app:helpers:boot-context",
        emit:
          false,
        emitState:
          false,
        silent:
          true,
      }
    );
  } catch {}

  try {
    AppCore?.patchState?.(
      cleanPatch,
      {
        source:
          "app:helpers:boot-context",
        emit:
          false,
        emitState:
          false,
        silent:
          true,
      }
    );
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        cleanPatch
      );
    }
  } catch {}

  return true;
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

    for (const key of safeArray(config.scrubbedHistoryKeys)) {
      if (historyState[key]) {
        if (
          key === "scrubbedPublicTokenRoute" ||
          key === "scrubbedTokenRoute"
        ) {
          if (
            historyState[key] === true ||
            historyState[key] === config.key
          ) {
            return true;
          }

          continue;
        }

        return true;
      }
    }

    if (
      historyState.scrubbedPublicTokenRoute === true ||
      historyState.scrubbedTokenRoute === true ||
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
   INITIAL URL CAPTURE
========================================================= */

export function captureInitialUrl(AppCore = null) {
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
      if (isProtectedTokenScrubbed(config)) {
        continue;
      }

      if (
        matchesProtectedRoute(config, href) &&
        hasProtectedRouteToken(config, href) &&
        !getStoredInitialUrl(config)
      ) {
        const publicPath =
          pathFromUrlLike(href);

        const canonicalPath =
          fallbackNormalizeCanonicalPath(publicPath);

        const patch = {
          [APP_STATE_KEYS?.bootProtectedInitialUrl || "bootProtectedInitialUrl"]:
            href,

          [APP_STATE_KEYS?.bootProtectedInitialPath || "bootProtectedInitialPath"]:
            canonicalPath,

          [APP_STATE_KEYS?.bootProtectedInitialPublicPath || "bootProtectedInitialPublicPath"]:
            publicPath,

          [APP_STATE_KEYS?.bootProtectedRouteKey || "bootProtectedRouteKey"]:
            config.key,

          [APP_STATE_KEYS?.bootIsPublicTokenRoute || "bootIsPublicTokenRoute"]:
            true,

          [APP_STATE_KEYS?.bootHasPublicToken || "bootHasPublicToken"]:
            true,

          [APP_STATE_KEYS?.bootHasProtectedToken || "bootHasProtectedToken"]:
            true,
        };

        if (config.stateUrlKey) {
          patch[config.stateUrlKey] =
            href;
        }

        if (config.statePathKey) {
          patch[config.statePathKey] =
            canonicalPath;
        }

        if (config.statePublicPathKey) {
          patch[config.statePublicPathKey] =
            publicPath;
        }

        if (config.stateIsRouteKey) {
          patch[config.stateIsRouteKey] =
            true;
        }

        if (config.stateHasTokenKey) {
          patch[config.stateHasTokenKey] =
            true;
        }

        setStoredInitialUrl(
          config,
          href
        );

        setBootContextPatch(patch);

        applyBootContextToCore(
          AppCore,
          patch
        );
      }
    }

    return true;
  } catch {
    return false;
  }
}

function getProtectedStoredUrlCandidates() {
  return PROTECTED_PUBLIC_TOKEN_ROUTES
    .filter((config) =>
      !isProtectedTokenScrubbed(config)
    )
    .map((config) =>
      getStoredInitialUrl(config)
    )
    .filter(Boolean);
}

function getStateProtectedUrlCandidates(AppCore) {
  const state =
    safeObject(AppCore?.state);

  const values = [];

  for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
    values.push(
      state[config.stateUrlKey],
      state[config.statePathKey],
      state[config.statePublicPathKey]
    );
  }

  values.push(
    state[APP_STATE_KEYS?.bootProtectedInitialUrl || "bootProtectedInitialUrl"],
    state[APP_STATE_KEYS?.bootProtectedInitialPath || "bootProtectedInitialPath"],
    state[APP_STATE_KEYS?.bootProtectedInitialPublicPath || "bootProtectedInitialPublicPath"]
  );

  const bootContext =
    getBootContext();

  values.push(
    bootContext.bootProtectedInitialUrl,
    bootContext.bootProtectedInitialPath,
    bootContext.bootProtectedInitialPublicPath,
    bootContext.bootActivationInitialUrl,
    bootContext.bootActivationInitialPath,
    bootContext.bootActivationInitialPublicPath,
    bootContext.bootResetConfirmInitialUrl,
    bootContext.bootResetConfirmInitialPath,
    bootContext.bootResetConfirmInitialPublicPath,
    bootContext.bootResetPasswordConfirmInitialUrl,
    bootContext.bootResetPasswordConfirmInitialPath,
    bootContext.bootResetPasswordConfirmInitialPublicPath
  );

  return values
    .map((value) =>
      safeText(value, "")
    )
    .filter(Boolean);
}

/* =========================================================
   PROTECTED INITIAL CONTEXT
========================================================= */

export function resolveProtectedInitialContext(AppCore = null) {
  captureInitialUrl(AppCore);

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
      no resucitamos el token desde initialUrl/window/state.
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

    const publicPath =
      fallbackNormalizePath(
        pathFromUrlLike(candidate)
      );

    const canonicalPath =
      fallbackNormalizeCanonicalPath(publicPath);

    const token =
      extractPathToken(
        config,
        candidate
      );

    return {
      config,

      key:
        config.key || "",

      path:
        canonicalPath,

      canonicalPath,

      publicPath,

      url:
        candidate,

      hasToken:
        true,

      tokenInPath:
        Boolean(token),

      scrubbed:
        false,

      redactedPath:
        redactTokenInText(canonicalPath),

      redactedPublicPath:
        redactTokenInText(publicPath),

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

    redactedPublicPath:
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
   CURRENT PATHS
========================================================= */

export function getCurrentPath(AppCore, Router = null) {
  captureInitialUrl(AppCore);

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

  try {
    if (isFunction(Router?.getCurrentPath)) {
      const routerPath =
        Router.getCurrentPath();

      if (routerPath) {
        return normalizePublicPath(
          AppCore,
          routerPath
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
  captureInitialUrl(AppCore);

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
  captureInitialUrl(AppCore);

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

  try {
    if (isFunction(Router?.getCurrentPath)) {
      const value =
        Router.getCurrentPath();

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
    ) ||
    safeText(
      AppCore?.state?.canonicalPath,
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
  let core = AppCore;
  let input = value;

  if (
    arguments.length === 1 &&
    !looksLikeAppCore(AppCore)
  ) {
    core = null;
    input = AppCore;
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

  try {
    if (
      AppCore?.cleanup &&
      canExtend(AppCore.cleanup)
    ) {
      if (!AppCore.cleanup.scopes) {
        AppCore.cleanup.scopes = new Map();
      }

      if (
        AppCore.cleanup.scopes instanceof Map &&
        !AppCore.cleanup.scopes.has(finalScope)
      ) {
        AppCore.cleanup.scopes.set(
          finalScope,
          {
            name:
              finalScope,
            disposers:
              [],
          }
        );
      }

      return AppCore.cleanup.scopes instanceof Map
        ? AppCore.cleanup.scopes.get(finalScope)
        : {
            name:
              finalScope,
          };
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

  try {
    const scopes =
      AppCore?.cleanup?.scopes;

    if (
      scopes instanceof Map &&
      scopes.has(finalScope)
    ) {
      const scopeRef =
        scopes.get(finalScope);

      const disposers =
        safeArray(scopeRef?.disposers);

      for (const dispose of disposers.splice(0)) {
        try {
          dispose();
        } catch {}
      }

      scopes.delete(finalScope);
    }
  } catch {}

  return true;
}

/* =========================================================
   MODULES
========================================================= */

function getRegisteredModule(AppCore, name = "") {
  const cleanName =
    safeText(name, "");

  if (!cleanName) {
    return null;
  }

  try {
    if (isFunction(AppCore?.modules?.get)) {
      const value =
        AppCore.modules.get(cleanName);

      if (value) {
        return value;
      }
    }
  } catch {}

  try {
    if (AppCore?.modules?.[cleanName]) {
      return AppCore.modules[cleanName];
    }
  } catch {}

  try {
    if (AppCore?.registry?.modules?.get) {
      const value =
        AppCore.registry.modules.get(cleanName);

      if (value) {
        return value;
      }
    }
  } catch {}

  try {
    if (AppCore?.[cleanName]) {
      return AppCore[cleanName];
    }
  } catch {}

  return null;
}

export function registerModule(AppCore, name, moduleRef, aliases = []) {
  const moduleName =
    safeText(name, "");

  if (
    !AppCore ||
    !moduleName ||
    !moduleRef
  ) {
    return false;
  }

  const names =
    Array.from(
      new Set([
        moduleName,
        ...safeArray(aliases)
          .map((alias) =>
            safeText(alias, "")
          )
          .filter(Boolean),
      ])
    );

  let anyRegistered = false;

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

  for (const currentName of names) {
    const already =
      getRegisteredModule(
        AppCore,
        currentName
      );

    if (
      already &&
      Object.is(already, moduleRef)
    ) {
      anyRegistered = true;
      continue;
    }

    let registered = false;

    try {
      if (isFunction(modules.register)) {
        modules.register(
          currentName,
          moduleRef,
          {
            replace:
              false,
            overwrite:
              false,
            idempotent:
              true,
            source:
              "app:helpers",
          }
        );

        registered = true;
      }
    } catch {}

    if (!registered) {
      try {
        if (isFunction(modules.set)) {
          modules.set(
            currentName,
            moduleRef,
            {
              replace:
                false,
              overwrite:
                false,
              idempotent:
                true,
              source:
                "app:helpers",
            }
          );

          registered = true;
        }
      } catch {}
    }

    if (!registered) {
      try {
        if (
          canExtend(modules) &&
          !modules[currentName]
        ) {
          modules[currentName] =
            moduleRef;

          registered = true;
        }
      } catch {}
    }

    if (!registered) {
      try {
        if (
          AppCore?.registry?.modules &&
          isFunction(AppCore.registry.modules.set) &&
          !AppCore.registry.modules.get?.(currentName)
        ) {
          AppCore.registry.modules.set(
            currentName,
            moduleRef
          );

          registered = true;
        }
      } catch {}
    }

    try {
      if (
        canExtend(AppCore) &&
        !AppCore[currentName]
      ) {
        defineHiddenValue(
          AppCore,
          currentName,
          moduleRef
        );
      }
    } catch {}

    anyRegistered =
      anyRegistered ||
      registered;
  }

  if (anyRegistered) {
    try {
      AppCore?.events?.emit?.(
        "app:module:registered",
        {
          name:
            moduleName,

          aliases:
            names.filter((item) =>
              item !== moduleName
            ),
        }
      );
    } catch {}
  }

  return anyRegistered;
}

/* =========================================================
   DEBUG SNAPSHOT
========================================================= */

function sanitizeBootContextForSnapshot(context = {}) {
  const source =
    safeObject(context);

  const output = {};

  for (const [key, value] of Object.entries(source)) {
    if (
      /token|url|path|href/i.test(key) &&
      typeof value === "string"
    ) {
      output[key] =
        redactTokenInText(value);

      continue;
    }

    output[key] = value;
  }

  return output;
}

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

        aliases:
          [...safeArray(config.aliases)],

        allPaths:
          [...getRoutePaths(config)],

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

    browserPath:
      redactTokenInText(
        buildBrowserPath()
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

export function getHelpersSnapshot(AppCore, Router = null) {
  const protectedContext =
    resolveProtectedInitialContext(AppCore);

  return {
    version:
      HELPERS_VERSION,

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

      publicPath:
        protectedContext.redactedPublicPath,

      canonicalPath:
        redactTokenInText(
          protectedContext.canonicalPath
        ),

      url:
        protectedContext.redactedUrl,
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
  HELPERS_VERSION,

  getCurrentPath,
  getCurrentPublicPath,
  getCurrentCanonicalPath,

  normalizePublicPath,
  normalizeCanonicalPath,
  stripUsernamePrefix,

  isSafeInternalPath,
  normalizeInternalPathTarget,

  isActivationPath,
  isResetConfirmPath,
  isProtectedPublicTokenPath,
  getProtectedInitialPublicPath,
  resolveProtectedInitialContext,
  captureInitialUrl,

  redactTokenInText,
  escapeHtml,

  ensureScope,
  clearScope,
  registerModule,

  getHelpersSnapshot,

  PROTECTED_PUBLIC_TOKEN_ROUTES,
};
