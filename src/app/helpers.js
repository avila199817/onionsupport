/* =========================================================
   Onion SPA - App Helpers
   Archivo: src/app/helpers.js

   App helpers:
   - publicPath conserva /@usuario, query y hash.
   - canonicalPath elimina /@usuario, query/hash y colapsa token routes.
   - preserva activation/reset token routes hasta scrub oficial.
   - cleanup/module helpers sin duplicados.
   - cero event storm / cero side effects raros.
========================================================= */

import {
  APP_SCOPE,
  APP_RUNTIME_KEYS,
  APP_STATE_KEYS,
  PROTECTED_PUBLIC_TOKEN_ROUTES as CONSTANT_PUBLIC_TOKEN_ROUTES,
  GENERIC_SENSITIVE_PARAM_NAMES,
} from "./constants.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

export const HELPERS_VERSION = "18.0.0-clean";

const DEFAULT_ROUTE = "/";
const DEFAULT_SCOPE = APP_SCOPE || "app";

const INITIAL_URL_KEY =
  APP_RUNTIME_KEYS?.initialUrl ||
  "__ONION_INITIAL_URL__";

const BOOT_CONTEXT_KEY =
  APP_RUNTIME_KEYS?.bootContext ||
  "__ONION_BOOT_CONTEXT__";

const MAIN_BOOT_CONTEXT_KEY =
  APP_RUNTIME_KEYS?.mainBootContext ||
  "__ONION_MAIN_BOOT_CONTEXT__";

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

const ACTIVATION_TOKEN_PARAMS = Object.freeze([
  "token",
  "activationToken",
  "activateToken",
  "activation_token",
  "activate_token",
  "code",
  "t",
]);

const RESET_TOKEN_PARAMS = Object.freeze([
  "token",
  "resetToken",
  "passwordResetToken",
  "confirmToken",
  "reset_token",
  "password_reset_token",
  "confirm_token",
  "code",
  "t",
]);

const SENSITIVE_PARAMS = Object.freeze(
  Array.isArray(GENERIC_SENSITIVE_PARAM_NAMES) &&
    GENERIC_SENSITIVE_PARAM_NAMES.length
    ? GENERIC_SENSITIVE_PARAM_NAMES
    : [
        "token",
        "activationToken",
        "activateToken",
        "activation_token",
        "activate_token",
        "resetToken",
        "reset_token",
        "passwordResetToken",
        "password_reset_token",
        "confirmToken",
        "confirm_token",
        "code",
        "t",
        "otp",
        "totp",
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
        "auth",
        "jwt",
        "session",
        "sid",
      ]
);

const USERNAME_RE = /^@[A-Za-z0-9._-]{1,80}$/;
const ABSOLUTE_URL_RE = /^[a-z][a-z\d+.-]*:\/\//i;
const PROTOCOL_RE = /^[a-z][a-z0-9+.-]*:/i;

const FALLBACK_PUBLIC_TOKEN_ROUTES = Object.freeze([
  Object.freeze({
    key: "activation",
    path: ACTIVATION_PATH,
    aliases: ACTIVATION_ALIASES,
    paths: Object.freeze([ACTIVATION_PATH, ...ACTIVATION_ALIASES]),
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
    tokenParamNames: ACTIVATION_TOKEN_PARAMS,
  }),

  Object.freeze({
    key: "resetConfirm",
    path: RESET_CONFIRM_PATH,
    aliases: RESET_CONFIRM_ALIASES,
    paths: Object.freeze([RESET_CONFIRM_PATH, ...RESET_CONFIRM_ALIASES]),
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
    tokenParamNames: RESET_TOKEN_PARAMS,
  }),
]);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isObjectLike(value) {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function isFn(value) {
  return typeof value === "function";
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function now() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function iso(ms = now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function unique(values = []) {
  const output = [];
  const seen = new Set();

  for (const value of safeArray(values).flat(Infinity)) {
    const clean = safeText(value, "");

    if (!clean || seen.has(clean)) continue;

    seen.add(clean);
    output.push(clean);
  }

  return output;
}

function canExtend(value) {
  try {
    return isObjectLike(value) && Object.isExtensible(value);
  } catch {
    return false;
  }
}

function defineHiddenValue(target, key, value) {
  if (!target || !key || !canExtend(target)) return false;

  try {
    Object.defineProperty(target, key, {
      value,
      enumerable: false,
      configurable: true,
      writable: true,
    });

    return true;
  } catch {}

  try {
    target[key] = value;
    return true;
  } catch {
    return false;
  }
}

function safeClone(value, fallback = null) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function getBaseOrigin() {
  if (isBrowser() && window.location?.origin) {
    return window.location.origin;
  }

  return "http://localhost";
}

function looksLikeAppCore(value) {
  if (!isObjectLike(value)) return false;

  return Boolean(
    value.state ||
      value.utils ||
      value.events ||
      value.modules ||
      value.cleanup ||
      value.dom ||
      isFn(value.setState) ||
      isFn(value.setRoute) ||
      isFn(value.setPublicPath)
  );
}

function resolvePathArgs(first, second, fallback = DEFAULT_ROUTE) {
  if (looksLikeAppCore(first)) {
    return {
      AppCore: first,
      path: second === undefined ? fallback : second,
    };
  }

  return {
    AppCore: null,
    path: first === undefined ? fallback : first,
  };
}

/* =========================================================
   PATH CORE
========================================================= */

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");

  if (!raw) return DEFAULT_ROUTE;
  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;

  return raw.replace(/^#\/?/, "/") || DEFAULT_ROUTE;
}

function normalizeSearch(search = "") {
  const raw = safeText(search, "");
  if (!raw) return "";
  return raw.startsWith("?") ? raw : `?${raw.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const raw = safeText(hash, "");
  if (!raw) return "";
  return raw.startsWith("#") ? raw : `#${raw.replace(/^#+/, "")}`;
}

function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
  let value = safeText(pathname, DEFAULT_ROUTE)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  const stack = [];

  for (const segment of value.split("/").filter(Boolean)) {
    if (segment === ".") continue;

    if (segment === "..") {
      stack.pop();
      continue;
    }

    stack.push(segment);
  }

  value = `/${stack.join("/")}`;

  return value.length > 1
    ? value.replace(/\/+$/g, "") || DEFAULT_ROUTE
    : value || DEFAULT_ROUTE;
}

function splitPath(path = DEFAULT_ROUTE) {
  let raw = safeText(path, DEFAULT_ROUTE) || DEFAULT_ROUTE;

  if (isHashRouterPath(raw)) {
    raw = normalizeHashRouterPath(raw);
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
    pathname: normalizePathnameOnly(pathname),
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
  };
}

function pathFromUrlLike(value = DEFAULT_ROUTE) {
  const raw = safeText(value, DEFAULT_ROUTE) || DEFAULT_ROUTE;

  if (isHashRouterPath(raw)) {
    return normalizePath(normalizeHashRouterPath(raw));
  }

  if (PROTOCOL_RE.test(raw) && !ABSOLUTE_URL_RE.test(raw)) {
    return DEFAULT_ROUTE;
  }

  try {
    if (ABSOLUTE_URL_RE.test(raw)) {
      const parsed = new URL(raw, getBaseOrigin());

      if (parsed.origin !== getBaseOrigin()) {
        return DEFAULT_ROUTE;
      }

      if (parsed.hash && isHashRouterPath(parsed.hash)) {
        return normalizePath(normalizeHashRouterPath(parsed.hash));
      }

      return normalizePath(
        `${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {
    return DEFAULT_ROUTE;
  }

  return normalizePath(raw);
}

function normalizePath(path = DEFAULT_ROUTE) {
  const { pathname, search, hash } = splitPath(path || DEFAULT_ROUTE);
  return `${pathname}${search}${hash}`;
}

export function stripSearchAndHash(path = DEFAULT_ROUTE) {
  return splitPath(normalizePath(path)).pathname;
}

export function getSearchAndHash(path = DEFAULT_ROUTE) {
  const { search, hash } = splitPath(normalizePath(path));
  return `${search}${hash}`;
}

function isUsernameSegment(segment = "") {
  return USERNAME_RE.test(safeText(segment, ""));
}

export function stripUsernamePrefix(path = DEFAULT_ROUTE) {
  const normalized = normalizePath(path);
  const { pathname, search, hash } = splitPath(normalized);
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length && isUsernameSegment(segments[0])) {
    const rest = segments.slice(1).join("/");
    return normalizePath(`${rest ? `/${rest}` : DEFAULT_ROUTE}${search}${hash}`);
  }

  return normalizePath(`${pathname}${search}${hash}`);
}

/* =========================================================
   PROTECTED TOKEN ROUTES
========================================================= */

function routeConfigFallbackByKey(key = "") {
  return FALLBACK_PUBLIC_TOKEN_ROUTES.find((item) => item.key === key) || null;
}

function routeConfigFallbackByPath(path = "") {
  const clean = normalizePathnameOnly(path);

  return (
    FALLBACK_PUBLIC_TOKEN_ROUTES.find((item) =>
      unique([item.path, ...(item.paths || []), ...(item.aliases || [])])
        .map(normalizePathnameOnly)
        .includes(clean)
    ) || null
  );
}

function routeList(path = "", aliases = [], paths = []) {
  return unique([path, ...safeArray(paths), ...safeArray(aliases)])
    .map(normalizePathnameOnly)
    .filter((item) => item && item !== DEFAULT_ROUTE);
}

function normalizeProtectedRouteConfig(config = {}) {
  const source = safeObject(config);

  const rawPath =
    source.path ||
    source.route ||
    source.canonicalPath ||
    DEFAULT_ROUTE;

  const path = normalizePathnameOnly(rawPath);

  const key = safeText(
    source.key ||
      source.name ||
      path.replace(/^\/+/, "").replace(/[/-]/g, "_"),
    ""
  );

  const fallback =
    routeConfigFallbackByKey(key) ||
    routeConfigFallbackByPath(path) ||
    {};

  const defaultAliases =
    key === "activation" || path === ACTIVATION_PATH
      ? ACTIVATION_ALIASES
      : key === "resetConfirm" || path === RESET_CONFIRM_PATH
        ? RESET_CONFIRM_ALIASES
        : [];

  const aliases = routeList(path, [
    ...(fallback.aliases || []),
    ...(source.aliases || []),
    ...defaultAliases,
  ]).filter((item) => item !== path);

  const paths = routeList(path, aliases, [
    ...(fallback.paths || []),
    ...(source.paths || []),
  ]);

  const windowKeys = unique([
    ...(fallback.windowKeys || []),
    fallback.windowKey,
    ...(source.windowKeys || []),
    source.windowKey,
    source.initialWindowKey,
    source.runtimeKey,
  ]);

  const defaultTokenParams =
    key === "activation" || path === ACTIVATION_PATH
      ? ACTIVATION_TOKEN_PARAMS
      : key === "resetConfirm" || path === RESET_CONFIRM_PATH
        ? RESET_TOKEN_PARAMS
        : [];

  return Object.freeze({
    ...fallback,
    ...source,

    key,
    path,

    aliases: Object.freeze(aliases),
    paths: Object.freeze(paths),
    allPaths: Object.freeze(paths),

    windowKey: windowKeys[0] || "",
    windowKeys: Object.freeze(windowKeys),

    stateUrlKey: source.stateUrlKey || fallback.stateUrlKey || "",
    statePathKey: source.statePathKey || fallback.statePathKey || "",
    statePublicPathKey: source.statePublicPathKey || fallback.statePublicPathKey || "",
    stateIsRouteKey: source.stateIsRouteKey || fallback.stateIsRouteKey || "",
    stateHasTokenKey: source.stateHasTokenKey || fallback.stateHasTokenKey || "",

    scrubbedStateKeys: Object.freeze(unique([
      ...(fallback.scrubbedStateKeys || []),
      ...(source.scrubbedStateKeys || []),
    ])),

    scrubbedHistoryKeys: Object.freeze(unique([
      ...(fallback.scrubbedHistoryKeys || []),
      ...(source.scrubbedHistoryKeys || []),
    ])),

    tokenParamNames: Object.freeze(unique([
      ...(fallback.tokenParamNames || []),
      ...(source.tokenParamNames || []),
      ...defaultTokenParams,
    ])),
  });
}

export const PROTECTED_PUBLIC_TOKEN_ROUTES = Object.freeze(
  (
    Array.isArray(CONSTANT_PUBLIC_TOKEN_ROUTES) &&
    CONSTANT_PUBLIC_TOKEN_ROUTES.length
      ? CONSTANT_PUBLIC_TOKEN_ROUTES
      : FALLBACK_PUBLIC_TOKEN_ROUTES
  )
    .map(normalizeProtectedRouteConfig)
    .filter((item) => item.path && item.path !== DEFAULT_ROUTE)
);

function getRoutePaths(config = null) {
  return safeArray(config?.allPaths).length
    ? safeArray(config.allPaths)
    : routeList(config?.path || "", config?.aliases || [], config?.paths || []);
}

function matchProtectedPath(config = null, path = DEFAULT_ROUTE) {
  if (!config?.path) return "";

  const clean = normalizePathnameOnly(path);

  for (const routePath of getRoutePaths(config)) {
    const base = normalizePathnameOnly(routePath);

    if (clean === base || clean.startsWith(`${base}/`)) {
      return base;
    }
  }

  return "";
}

function getProtectedRouteConfig(pathOrUrl = "") {
  const publicPath = pathFromUrlLike(pathOrUrl);
  const clean = stripSearchAndHash(stripUsernamePrefix(publicPath));

  return (
    PROTECTED_PUBLIC_TOKEN_ROUTES.find((config) =>
      Boolean(matchProtectedPath(config, clean))
    ) || null
  );
}

function canonicalizeProtectedPath(path = DEFAULT_ROUTE) {
  const publicPath = normalizePath(path);
  const clean = stripSearchAndHash(stripUsernamePrefix(publicPath));

  for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
    if (matchProtectedPath(config, clean)) {
      return normalizePathnameOnly(config.path);
    }
  }

  return normalizePathnameOnly(clean);
}

export function normalizePublicPath(first = DEFAULT_ROUTE, second = undefined) {
  const { AppCore, path } = resolvePathArgs(first, second, DEFAULT_ROUTE);
  const raw = safeText(path, DEFAULT_ROUTE) || DEFAULT_ROUTE;
  const fallback = pathFromUrlLike(raw);

  /*
    publicPath preserva query/hash/token.
    No delegamos con suffix porque normalizadores legacy pueden truncarlo.
  */
  if (raw.includes("?") || raw.includes("#")) {
    return fallback;
  }

  try {
    const delegated =
      AppCore?.utils?.normalizePublicPath?.(raw) ||
      AppCore?.utils?.normalizePath?.(raw);

    if (delegated) {
      const clean = pathFromUrlLike(delegated);

      if (fallback !== DEFAULT_ROUTE && clean === DEFAULT_ROUTE) {
        return fallback;
      }

      return clean;
    }
  } catch {}

  return fallback;
}

export function normalizeCanonicalPath(first = DEFAULT_ROUTE, second = undefined) {
  const { AppCore, path } = resolvePathArgs(first, second, DEFAULT_ROUTE);
  const raw = safeText(path, DEFAULT_ROUTE) || DEFAULT_ROUTE;
  const fallback = canonicalizeProtectedPath(raw);

  if (raw.includes("?") || raw.includes("#")) {
    return fallback;
  }

  try {
    const delegated = AppCore?.utils?.normalizeCanonicalPath?.(raw);

    if (delegated) {
      const clean = canonicalizeProtectedPath(delegated);

      if (fallback !== DEFAULT_ROUTE && clean === DEFAULT_ROUTE) {
        return fallback;
      }

      return clean;
    }
  } catch {}

  return fallback;
}

/* =========================================================
   TOKEN DETECTION / SCRUB
========================================================= */

function extractPathToken(config, pathOrUrl = "") {
  if (!config?.path) return "";

  const path = pathFromUrlLike(pathOrUrl);
  const clean = stripSearchAndHash(stripUsernamePrefix(path));
  const matched = matchProtectedPath(config, clean);

  if (!matched || !clean.startsWith(`${matched}/`)) {
    return "";
  }

  const token = clean.slice(`${matched}/`.length).split("/")[0];

  try {
    return safeText(decodeURIComponent(token || ""), "");
  } catch {
    return safeText(token, "");
  }
}

function hasTokenInSearch(search = "", names = []) {
  try {
    const params = new URLSearchParams(search || "");

    return safeArray(names).some((name) =>
      Boolean(safeText(params.get(name), ""))
    );
  } catch {
    return false;
  }
}

function hasProtectedToken(config, pathOrUrl = "") {
  if (!config) return false;

  const raw = safeText(pathOrUrl, "");

  if (!raw) return false;

  if (extractPathToken(config, raw)) return true;

  try {
    const parsed = new URL(raw, getBaseOrigin());

    if (parsed.origin !== getBaseOrigin()) return false;

    if (hasTokenInSearch(parsed.search, config.tokenParamNames)) {
      return true;
    }

    if (parsed.hash && isHashRouterPath(parsed.hash)) {
      const hashPath = normalizeHashRouterPath(parsed.hash);
      const hashParts = splitPath(hashPath);

      return Boolean(
        extractPathToken(config, hashPath) ||
          hasTokenInSearch(hashParts.search, config.tokenParamNames)
      );
    }

    if (parsed.hash && parsed.hash.includes("?")) {
      const query = parsed.hash.split("?").slice(1).join("?");
      return hasTokenInSearch(query ? `?${query}` : "", config.tokenParamNames);
    }

    return false;
  } catch {
    const normalized = normalizePath(raw);
    const parts = splitPath(normalized);

    if (hasTokenInSearch(parts.search, config.tokenParamNames)) {
      return true;
    }

    if (parts.hash && parts.hash.includes("?")) {
      const query = parts.hash.split("?").slice(1).join("?");
      return hasTokenInSearch(query ? `?${query}` : "", config.tokenParamNames);
    }

    return false;
  }
}

function getHistoryState() {
  if (!isBrowser()) return {};

  try {
    return safeObject(window.history?.state);
  } catch {
    return {};
  }
}

function isProtectedTokenScrubbed(config = null) {
  if (!config) return false;

  const state = getHistoryState();

  for (const key of safeArray(config.scrubbedStateKeys)) {
    if (state[key]) return true;
  }

  for (const key of safeArray(config.scrubbedHistoryKeys)) {
    if (!state[key]) continue;

    if (
      key === "scrubbedPublicTokenRoute" ||
      key === "scrubbedTokenRoute"
    ) {
      return state[key] === true || state[key] === config.key;
    }

    return true;
  }

  return Boolean(
    state.scrubbedPublicTokenRoute === true ||
      state.scrubbedTokenRoute === true ||
      state.scrubbedPublicTokenRoute === config.key ||
      state.scrubbedTokenRoute === config.key
  );
}

function isAnyProtectedTokenScrubbed() {
  return PROTECTED_PUBLIC_TOKEN_ROUTES.some(isProtectedTokenScrubbed);
}

export function isProtectedPublicTokenPath(pathOrUrl = "") {
  const config = getProtectedRouteConfig(pathOrUrl);

  return Boolean(
    config &&
      !isProtectedTokenScrubbed(config) &&
      hasProtectedToken(config, pathOrUrl)
  );
}

export function isActivationPath(path = "") {
  const config = PROTECTED_PUBLIC_TOKEN_ROUTES.find((item) =>
    item.key === "activation" || item.path === ACTIVATION_PATH
  );

  return Boolean(config && matchProtectedPath(config, stripSearchAndHash(stripUsernamePrefix(pathFromUrlLike(path)))));
}

export function isResetConfirmPath(path = "") {
  const config = PROTECTED_PUBLIC_TOKEN_ROUTES.find((item) =>
    item.key === "resetConfirm" || item.path === RESET_CONFIRM_PATH
  );

  return Boolean(config && matchProtectedPath(config, stripSearchAndHash(stripUsernamePrefix(pathFromUrlLike(path)))));
}

/* =========================================================
   WINDOW / BOOT CONTEXT
========================================================= */

function getWindowValue(key = "") {
  if (!isBrowser() || !key) return "";

  try {
    return safeText(window[key], "");
  } catch {
    return "";
  }
}

function getWindowObject(key = "") {
  if (!isBrowser() || !key) return {};

  try {
    return safeObject(window[key]);
  } catch {
    return {};
  }
}

function setWindowValue(key = "", value = "", onlyIfMissing = true) {
  if (!isBrowser() || !key || !value) return false;

  try {
    if (onlyIfMissing && window[key]) return true;

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
  return setWindowValue(INITIAL_URL_KEY, value, true);
}

function getBootContext() {
  return getWindowObject(BOOT_CONTEXT_KEY);
}

function getMainBootContext() {
  return getWindowObject(MAIN_BOOT_CONTEXT_KEY);
}

function patchBootContext(patch = {}) {
  if (!isBrowser()) return false;

  try {
    window[BOOT_CONTEXT_KEY] = {
      ...safeObject(window[BOOT_CONTEXT_KEY]),
      ...safeObject(patch),
    };

    return true;
  } catch {
    return false;
  }
}

function applyStatePatch(AppCore, patch = {}) {
  const cleanPatch = safeObject(patch);

  if (!Object.keys(cleanPatch).length) return false;

  const options = {
    source: "app:helpers:boot-context",
    emit: false,
    emitState: false,
    silent: true,
  };

  try {
    AppCore?.setState?.(cleanPatch, options);
  } catch {}

  try {
    AppCore?.patchState?.(cleanPatch, options);
  } catch {}

  try {
    if (AppCore?.state && typeof AppCore.state === "object") {
      Object.assign(AppCore.state, cleanPatch);
    }
  } catch {}

  return true;
}

function getStoredInitialUrl(config) {
  const keys = safeArray(config?.windowKeys).length
    ? safeArray(config.windowKeys)
    : [config?.windowKey].filter(Boolean);

  for (const key of keys) {
    const value = getWindowValue(key);
    if (value) return value;
  }

  return "";
}

function setStoredInitialUrl(config, value = "") {
  const keys = safeArray(config?.windowKeys).length
    ? safeArray(config.windowKeys)
    : [config?.windowKey].filter(Boolean);

  let wrote = false;

  for (const key of keys) {
    wrote = setWindowValue(key, value, true) || wrote;
  }

  return wrote;
}

function getBrowserHref() {
  if (!isBrowser()) return "";

  try {
    return safeText(window.location?.href, "");
  } catch {
    return "";
  }
}

function buildBrowserPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  try {
    const hash = window.location.hash || "";

    if (hash && isHashRouterPath(hash)) {
      return normalizePath(normalizeHashRouterPath(hash));
    }

    return normalizePath(
      `${window.location.pathname || DEFAULT_ROUTE}${window.location.search || ""}${hash}`
    );
  } catch {
    return DEFAULT_ROUTE;
  }
}

function getMainBootCandidateUrl() {
  const context = getMainBootContext();

  return safeText(
    context.initialUrl ||
      context.href ||
      context.url ||
      context.mainInitialUrl ||
      context.mainInitialPublicPath ||
      context.protectedInitialUrl ||
      context.protectedInitialPublicPath ||
      context.publicPath ||
      "",
    ""
  );
}

/* =========================================================
   INITIAL URL CAPTURE
========================================================= */

export function captureInitialUrl(AppCore = null) {
  if (!isBrowser()) return false;

  try {
    const href = getBrowserHref();
    const mainCandidate = getMainBootCandidateUrl();
    const initialCandidate = mainCandidate || href;

    if (!initialCandidate) return false;

    setInitialUrl(initialCandidate);

    const bootPublicPath = pathFromUrlLike(initialCandidate);
    const bootCanonicalPath = normalizeCanonicalPath(bootPublicPath);

    const basePatch = {
      [APP_STATE_KEYS?.bootInitialUrl || "bootInitialUrl"]: initialCandidate,
      [APP_STATE_KEYS?.bootInitialPath || "bootInitialPath"]: bootPublicPath,
      [APP_STATE_KEYS?.bootCanonicalPath || "bootCanonicalPath"]: bootCanonicalPath,
    };

    patchBootContext(basePatch);
    applyStatePatch(AppCore, basePatch);

    for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
      if (isProtectedTokenScrubbed(config)) continue;

      const candidates = unique([
        initialCandidate,
        href,
        mainCandidate,
        getStoredInitialUrl(config),
      ]).filter(Boolean);

      for (const candidate of candidates) {
        if (!getProtectedRouteConfig(candidate)) continue;
        if (!matchProtectedPath(config, stripSearchAndHash(stripUsernamePrefix(pathFromUrlLike(candidate))))) continue;
        if (!hasProtectedToken(config, candidate)) continue;

        const publicPath = pathFromUrlLike(candidate);
        const canonicalPath = normalizeCanonicalPath(publicPath);

        const patch = {
          [APP_STATE_KEYS?.bootProtectedInitialUrl || "bootProtectedInitialUrl"]: candidate,
          [APP_STATE_KEYS?.bootProtectedInitialPath || "bootProtectedInitialPath"]: publicPath,
          [APP_STATE_KEYS?.bootProtectedInitialPublicPath || "bootProtectedInitialPublicPath"]: publicPath,
          [APP_STATE_KEYS?.bootCanonicalPath || "bootCanonicalPath"]: canonicalPath,
          [APP_STATE_KEYS?.bootProtectedRouteKey || "bootProtectedRouteKey"]: config.key,
          [APP_STATE_KEYS?.bootIsPublicTokenRoute || "bootIsPublicTokenRoute"]: true,
          [APP_STATE_KEYS?.bootHasPublicToken || "bootHasPublicToken"]: true,
          [APP_STATE_KEYS?.bootHasProtectedToken || "bootHasProtectedToken"]: true,
        };

        if (config.stateUrlKey) patch[config.stateUrlKey] = candidate;
        if (config.statePathKey) patch[config.statePathKey] = publicPath;
        if (config.statePublicPathKey) patch[config.statePublicPathKey] = publicPath;
        if (config.stateIsRouteKey) patch[config.stateIsRouteKey] = true;
        if (config.stateHasTokenKey) patch[config.stateHasTokenKey] = true;

        setStoredInitialUrl(config, candidate);
        patchBootContext(patch);
        applyStatePatch(AppCore, patch);

        break;
      }
    }

    return true;
  } catch {
    return false;
  }
}

function getProtectedStoredUrlCandidates() {
  return PROTECTED_PUBLIC_TOKEN_ROUTES
    .filter((config) => !isProtectedTokenScrubbed(config))
    .map((config) => getStoredInitialUrl(config))
    .filter(Boolean);
}

function getStateProtectedUrlCandidates(AppCore = null) {
  const state = safeObject(AppCore?.state);
  const boot = getBootContext();
  const main = getMainBootContext();

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
    state[APP_STATE_KEYS?.bootProtectedInitialPublicPath || "bootProtectedInitialPublicPath"],

    boot.bootProtectedInitialUrl,
    boot.bootProtectedInitialPath,
    boot.bootProtectedInitialPublicPath,
    boot.bootActivationInitialUrl,
    boot.bootActivationInitialPath,
    boot.bootActivationInitialPublicPath,
    boot.bootResetConfirmInitialUrl,
    boot.bootResetConfirmInitialPath,
    boot.bootResetConfirmInitialPublicPath,
    boot.bootResetPasswordConfirmInitialUrl,
    boot.bootResetPasswordConfirmInitialPath,
    boot.bootResetPasswordConfirmInitialPublicPath,

    main.initialUrl,
    main.href,
    main.url,
    main.mainInitialUrl,
    main.mainInitialPublicPath,
    main.protectedInitialUrl,
    main.protectedInitialPublicPath,
    main.publicPath
  );

  return values.map((item) => safeText(item, "")).filter(Boolean);
}

export function resolveProtectedInitialContext(AppCore = null) {
  captureInitialUrl(AppCore);

  const candidates = unique([
    ...getProtectedStoredUrlCandidates(),
    ...getStateProtectedUrlCandidates(AppCore),
    getInitialUrl(),
    getBrowserHref(),
    buildBrowserPath(),
  ]).filter(Boolean);

  for (const candidate of candidates) {
    const config = getProtectedRouteConfig(candidate);

    if (!config) continue;
    if (isProtectedTokenScrubbed(config)) continue;
    if (!hasProtectedToken(config, candidate)) continue;

    const publicPath = pathFromUrlLike(candidate);
    const canonicalPath = normalizeCanonicalPath(publicPath);
    const tokenInPath = Boolean(extractPathToken(config, candidate));

    return {
      config,
      key: config.key || "",
      path: publicPath,
      publicPath,
      canonicalPath,
      url: candidate,
      hasToken: true,
      tokenInPath,
      scrubbed: false,
      redactedPath: redactTokenInText(publicPath),
      redactedPublicPath: redactTokenInText(publicPath),
      redactedCanonicalPath: redactTokenInText(canonicalPath),
      redactedUrl: redactTokenInText(candidate),
    };
  }

  return {
    config: null,
    key: "",
    path: "",
    publicPath: "",
    canonicalPath: "",
    url: "",
    hasToken: false,
    tokenInPath: false,
    scrubbed: isAnyProtectedTokenScrubbed(),
    redactedPath: "",
    redactedPublicPath: "",
    redactedCanonicalPath: "",
    redactedUrl: "",
  };
}

export function getProtectedInitialPublicPath(AppCore = null) {
  const context = resolveProtectedInitialContext(AppCore);
  return context.hasToken ? context.publicPath : "";
}

/* =========================================================
   CURRENT PATHS
========================================================= */

function shouldPreferBrowserPathOverState(AppCore = null) {
  const protectedPath = getProtectedInitialPublicPath(AppCore);

  if (protectedPath) return true;

  const browserPath = buildBrowserPath();
  const statePublicPath = safeText(AppCore?.state?.publicPath, "");
  const stateRoute = safeText(AppCore?.state?.route, "");

  if (!isAnyProtectedTokenScrubbed() && isProtectedPublicTokenPath(browserPath)) {
    return true;
  }

  if (!statePublicPath && !stateRoute) {
    return true;
  }

  if (
    browserPath &&
    browserPath !== DEFAULT_ROUTE &&
    (statePublicPath === DEFAULT_ROUTE || stateRoute === DEFAULT_ROUTE)
  ) {
    return true;
  }

  return false;
}

export function getCurrentPath(AppCore, Router = null) {
  captureInitialUrl(AppCore);

  const protectedPath = getProtectedInitialPublicPath(AppCore);

  if (protectedPath) {
    return normalizePublicPath(AppCore, protectedPath);
  }

  if (shouldPreferBrowserPathOverState(AppCore)) {
    return normalizePublicPath(AppCore, buildBrowserPath());
  }

  try {
    const routerPublicPath =
      Router?.getCurrentPublicPath?.() ||
      Router?.getCurrentPath?.();

    if (routerPublicPath) {
      return normalizePublicPath(AppCore, routerPublicPath);
    }
  } catch {}

  const statePath =
    safeText(AppCore?.state?.publicPath, "") ||
    safeText(AppCore?.state?.route, "");

  return normalizePublicPath(AppCore, statePath || buildBrowserPath());
}

export function getCurrentPublicPath(AppCore, Router = null) {
  captureInitialUrl(AppCore);

  const protectedPath = getProtectedInitialPublicPath(AppCore);

  if (protectedPath) {
    return normalizePublicPath(AppCore, protectedPath);
  }

  if (shouldPreferBrowserPathOverState(AppCore)) {
    return normalizePublicPath(AppCore, buildBrowserPath());
  }

  try {
    const routerPublicPath = Router?.getCurrentPublicPath?.();

    if (routerPublicPath) {
      return normalizePublicPath(AppCore, routerPublicPath);
    }
  } catch {}

  const statePublicPath = safeText(AppCore?.state?.publicPath, "");

  return normalizePublicPath(AppCore, statePublicPath || buildBrowserPath());
}

export function getCurrentCanonicalPath(AppCore, Router = null) {
  captureInitialUrl(AppCore);

  const protectedContext = resolveProtectedInitialContext(AppCore);

  if (protectedContext.hasToken) {
    return normalizeCanonicalPath(AppCore, protectedContext.publicPath);
  }

  if (shouldPreferBrowserPathOverState(AppCore)) {
    return normalizeCanonicalPath(AppCore, buildBrowserPath());
  }

  try {
    const routerCanonicalPath =
      Router?.getCurrentCanonicalPath?.() ||
      Router?.getCurrentPath?.();

    if (routerCanonicalPath) {
      return normalizeCanonicalPath(AppCore, routerCanonicalPath);
    }
  } catch {}

  const stateCanonical =
    safeText(AppCore?.state?.route, "") ||
    safeText(AppCore?.state?.canonicalPath, "");

  return normalizeCanonicalPath(
    AppCore,
    stateCanonical || getCurrentPublicPath(AppCore, Router)
  );
}

/* =========================================================
   SAFE INTERNAL TARGETS
========================================================= */

export function isSafeInternalPath(value = "") {
  const raw = safeText(value, "");

  if (!raw) return false;
  if (!raw.startsWith("/")) return false;
  if (raw.startsWith("//")) return false;
  if (PROTOCOL_RE.test(raw)) return false;
  if (/[\r\n\t\\]/.test(raw)) return false;

  return true;
}

export function normalizeInternalPathTarget(value = DEFAULT_ROUTE, fallback = DEFAULT_ROUTE) {
  const raw = safeText(value, fallback) || fallback;

  if (!isSafeInternalPath(raw)) {
    return normalizePath(fallback);
  }

  try {
    const parsed = new URL(raw, getBaseOrigin());

    if (parsed.origin !== getBaseOrigin()) {
      return normalizePath(fallback);
    }

    const path = normalizePath(
      `${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`
    );

    return isSafeInternalPath(path) ? path : normalizePath(fallback);
  } catch {
    const path = normalizePath(raw);
    return isSafeInternalPath(path) ? path : normalizePath(fallback);
  }
}

/* =========================================================
   REDACTION / HTML
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactTokenInText(value = "") {
  let output = safeText(value, "");

  if (!output) return "";

  for (const name of SENSITIVE_PARAMS) {
    try {
      output = output.replace(
        new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
    for (const routePath of getRoutePaths(config)) {
      try {
        output = output.replace(
          new RegExp(`(${escapeRegExp(routePath)})\\/([^/?#\\s]+)`, "gi"),
          "$1/***"
        );
      } catch {}
    }
  }

  try {
    output = output
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/(authorization["'\s:=]+)(Bearer\s+)?([A-Za-z0-9._~+/=-]+)/gi, "$1$2***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  } catch {}

  return output;
}

export function escapeHtml(AppCore, value = "") {
  let core = AppCore;
  let input = value;

  if (arguments.length === 1 && !looksLikeAppCore(AppCore)) {
    core = null;
    input = AppCore;
  }

  try {
    if (isFn(core?.utils?.escapeHtml)) {
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
   CLEANUP
========================================================= */

export function ensureScope(AppCore, scope = DEFAULT_SCOPE) {
  const finalScope = safeText(scope, DEFAULT_SCOPE) || DEFAULT_SCOPE;

  try {
    if (isFn(AppCore?.cleanup?.scope)) {
      return AppCore.cleanup.scope(finalScope);
    }
  } catch {}

  try {
    if (isFn(AppCore?.cleanup?.ensureScope)) {
      return AppCore.cleanup.ensureScope(finalScope);
    }
  } catch {}

  try {
    if (AppCore?.cleanup && canExtend(AppCore.cleanup)) {
      if (!AppCore.cleanup.scopes) {
        AppCore.cleanup.scopes = new Map();
      }

      if (
        AppCore.cleanup.scopes instanceof Map &&
        !AppCore.cleanup.scopes.has(finalScope)
      ) {
        AppCore.cleanup.scopes.set(finalScope, {
          name: finalScope,
          disposers: [],
        });
      }

      return AppCore.cleanup.scopes instanceof Map
        ? AppCore.cleanup.scopes.get(finalScope)
        : { name: finalScope };
    }
  } catch {}

  return { name: finalScope };
}

export function clearScope(AppCore, scope = DEFAULT_SCOPE) {
  const finalScope = safeText(scope, DEFAULT_SCOPE) || DEFAULT_SCOPE;

  for (const method of ["run", "clear", "dispose"]) {
    try {
      if (isFn(AppCore?.cleanup?.[method])) {
        AppCore.cleanup[method](finalScope);
        return true;
      }
    } catch {}
  }

  try {
    const scopes = AppCore?.cleanup?.scopes;

    if (scopes instanceof Map && scopes.has(finalScope)) {
      const scopeRef = scopes.get(finalScope);
      const disposers = safeArray(scopeRef?.disposers);

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
  const cleanName = safeText(name, "");

  if (!cleanName) return null;

  try {
    const value = AppCore?.modules?.get?.(cleanName);
    if (value) return value;
  } catch {}

  try {
    if (AppCore?.modules?.[cleanName]) return AppCore.modules[cleanName];
  } catch {}

  try {
    const value = AppCore?.registry?.modules?.get?.(cleanName);
    if (value) return value;
  } catch {}

  try {
    if (AppCore?.[cleanName]) return AppCore[cleanName];
  } catch {}

  return null;
}

export function registerModule(AppCore, name, moduleRef, aliases = []) {
  const moduleName = safeText(name, "");

  if (!AppCore || !moduleName || !moduleRef) return false;

  const names = unique([moduleName, ...safeArray(aliases)]);
  let registered = false;

  try {
    if (!AppCore.modules && canExtend(AppCore)) {
      AppCore.modules = {};
    }
  } catch {}

  const modules = AppCore?.modules;

  if (!modules) return false;

  for (const currentName of names) {
    const current = getRegisteredModule(AppCore, currentName);

    if (current && Object.is(current, moduleRef)) {
      registered = true;
      continue;
    }

    /*
      No pisamos módulos distintos: evita bridges stale y duplicate storms.
    */
    if (current && !Object.is(current, moduleRef)) {
      continue;
    }

    let ok = false;

    try {
      if (isFn(modules.register)) {
        ok = modules.register(currentName, moduleRef, {
          replace: false,
          overwrite: false,
          idempotent: true,
          source: "app:helpers",
        }) !== false;
      }
    } catch {}

    if (!ok) {
      try {
        if (isFn(modules.set) && !getRegisteredModule(AppCore, currentName)) {
          ok = modules.set(currentName, moduleRef, {
            replace: false,
            overwrite: false,
            idempotent: true,
            source: "app:helpers",
          }) !== false;
        }
      } catch {}
    }

    if (!ok) {
      try {
        if (canExtend(modules) && !modules[currentName]) {
          modules[currentName] = moduleRef;
          ok = true;
        }
      } catch {}
    }

    if (!ok) {
      try {
        if (
          AppCore?.registry?.modules &&
          isFn(AppCore.registry.modules.set) &&
          !AppCore.registry.modules.get?.(currentName)
        ) {
          AppCore.registry.modules.set(currentName, moduleRef);
          ok = true;
        }
      } catch {}
    }

    try {
      if (canExtend(AppCore) && !AppCore[currentName]) {
        defineHiddenValue(AppCore, currentName, moduleRef);
      }
    } catch {}

    registered = registered || ok;
  }

  return registered;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function sanitizeBootContext(context = {}) {
  const output = {};

  for (const [key, value] of Object.entries(safeObject(context))) {
    output[key] =
      /token|url|path|href/i.test(key) && typeof value === "string"
        ? redactTokenInText(value)
        : value;
  }

  return output;
}

function getInitialUrlSnapshot() {
  return {
    initialUrl: redactTokenInText(getInitialUrl()),
    browserHref: redactTokenInText(getBrowserHref()),
    browserPath: redactTokenInText(buildBrowserPath()),

    bootContext: safeClone(sanitizeBootContext(getBootContext()), {}),
    mainBootContext: safeClone(sanitizeBootContext(getMainBootContext()), {}),

    protectedRoutes: PROTECTED_PUBLIC_TOKEN_ROUTES.map((config) => {
      const stored = getStoredInitialUrl(config);

      return {
        key: config.key,
        path: config.path,
        aliases: [...safeArray(config.aliases)],
        paths: [...getRoutePaths(config)],
        windowKeys: [...safeArray(config.windowKeys)],
        hasStoredInitialUrl: Boolean(stored),
        storedInitialUrl: redactTokenInText(stored),
        scrubbed: isProtectedTokenScrubbed(config),
      };
    }),
  };
}

export function getHelpersSnapshot(AppCore, Router = null) {
  const protectedContext = resolveProtectedInitialContext(AppCore);

  return {
    version: HELPERS_VERSION,

    path: redactTokenInText(getCurrentPath(AppCore, Router)),
    publicPath: redactTokenInText(getCurrentPublicPath(AppCore, Router)),
    canonicalPath: redactTokenInText(getCurrentCanonicalPath(AppCore, Router)),

    browserPath: redactTokenInText(buildBrowserPath()),
    browserHref: redactTokenInText(getBrowserHref()),

    initial: getInitialUrlSnapshot(),

    protectedInitial: {
      key: protectedContext.key,
      hasToken: Boolean(protectedContext.hasToken),
      tokenInPath: Boolean(protectedContext.tokenInPath),
      scrubbed: Boolean(protectedContext.scrubbed),
      path: protectedContext.redactedPath,
      publicPath: protectedContext.redactedPublicPath,
      canonicalPath:
        protectedContext.redactedCanonicalPath ||
        redactTokenInText(protectedContext.canonicalPath),
      url: protectedContext.redactedUrl,
    },

    hasCleanup: Boolean(AppCore?.cleanup),
    hasModules: Boolean(AppCore?.modules),
    hasRouter: Boolean(Router),
    routerHasCanonicalGetter: Boolean(Router?.getCurrentCanonicalPath),
    routerHasPublicGetter: Boolean(Router?.getCurrentPublicPath),

    at: iso(),
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
  stripSearchAndHash,
  getSearchAndHash,

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
