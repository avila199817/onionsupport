/* =========================================================
   Onion SPA - Router History
   Archivo: src/router/history.js

   FINAL EXTREME SYSTEM · HISTORY / URL STATE · 11/10
   PUBLIC PATH SAFE · TOKEN ROUTES SAFE · SCRUB OFFICIAL SAFE

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
   - exponer scrub oficial de tokens públicos técnicos

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
   - eventos router:history:* para debug sin tokens reales
   - firma anti doble escritura coherente
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

import {
  APP_RUNTIME_KEYS,
  PROTECTED_PUBLIC_TOKEN_ROUTES,
  PUBLIC_TOKEN_ROUTE_KEYS,
  GENERIC_SENSITIVE_PARAM_NAMES,
} from "../app/constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const ROUTER_HISTORY_VERSION =
  "11.0.0";

const HISTORY_STATE_VERSION =
  5;

const DEFAULT_ROUTE =
  "/";

const ACTIVATION_PATH =
  "/activate-account";

const RESET_CONFIRM_PATH =
  "/reset-password/confirm";

const ACTIVATION_KIND =
  PUBLIC_TOKEN_ROUTE_KEYS?.activation ||
  "activation";

const RESET_CONFIRM_KIND =
  PUBLIC_TOKEN_ROUTE_KEYS?.resetConfirm ||
  "resetConfirm";

const RESET_CONFIRM_INTERNAL_KIND =
  "reset-confirm";

const DEFAULT_ACTIVATION_TOKEN_PARAM_NAMES =
  Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "code",
    "t",
  ]);

const DEFAULT_RESET_TOKEN_PARAM_NAMES =
  Object.freeze([
    "token",
    "resetToken",
    "passwordResetToken",
    "confirmToken",
    "code",
    "t",
  ]);

const DEFAULT_SENSITIVE_PARAM_NAMES =
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

const HISTORY_EVENTS =
  Object.freeze({
    write:
      "router:history:write",

    skip:
      "router:history:skip",

    error:
      "router:history:error",

    initial:
      "router:history:initial",

    capture:
      "router:history:initial-url:captured",

    scrub:
      "router:history:token:scrubbed",

    back:
      "router:history:back",
  });

const WRITE_DEDUPE_MS =
  24;

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
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function nowIso(ms = nowTs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
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

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function isFunction(value) {
  return typeof value === "function";
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
   INTERNAL COUNTERS
========================================================= */

let historySeq =
  0;

let lastWriteSignature =
  "";

let lastWriteAt =
  0;

function nextHistoryId() {
  historySeq += 1;

  return `hist_${nowTs()}_${historySeq}`;
}

/* =========================================================
   PROTECTED ROUTES
========================================================= */

function normalizeProtectedRouteConfig(config = {}) {
  const key =
    safeText(
      config.key,
      ""
    );

  const isReset =
    key === RESET_CONFIRM_KIND ||
    key === RESET_CONFIRM_INTERNAL_KIND ||
    config.path === RESET_CONFIRM_PATH;

  const kind =
    isReset
      ? RESET_CONFIRM_INTERNAL_KIND
      : ACTIVATION_KIND;

  const path =
    safeText(
      config.path,
      isReset
        ? RESET_CONFIRM_PATH
        : ACTIVATION_PATH
    );

  const tokenParamNames =
    Array.isArray(config.tokenParamNames)
      ? config.tokenParamNames
      : isReset
        ? DEFAULT_RESET_TOKEN_PARAM_NAMES
        : DEFAULT_ACTIVATION_TOKEN_PARAM_NAMES;

  const windowKeys =
    [
      ...(Array.isArray(config.windowKeys)
        ? config.windowKeys
        : []),

      config.windowKey,

      isReset
        ? APP_RUNTIME_KEYS?.resetPasswordConfirmInitialUrl
        : APP_RUNTIME_KEYS?.activateAccountInitialUrl,

      isReset
        ? APP_RUNTIME_KEYS?.resetConfirmInitialUrl
        : "",

      isReset
        ? "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__"
        : "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",

      isReset
        ? "__ONION_RESET_CONFIRM_INITIAL_URL__"
        : "",
    ]
      .map((value) =>
        safeText(value, "")
      )
      .filter(Boolean);

  const scrubFlags =
    [
      ...(Array.isArray(config.scrubbedHistoryKeys)
        ? config.scrubbedHistoryKeys
        : []),

      ...(Array.isArray(config.scrubbedStateKeys)
        ? config.scrubbedStateKeys
        : []),

      isReset
        ? "scrubbedResetToken"
        : "scrubbedActivationToken",

      isReset
        ? "resetTokenScrubbed"
        : "activationTokenScrubbed",

      isReset
        ? "scrubbedResetPasswordToken"
        : "scrubbedActivateAccountToken",

      isReset
        ? "scrubbedResetConfirmToken"
        : "scrubbedActivateAccountToken",
    ]
      .map((value) =>
        safeText(value, "")
      )
      .filter(Boolean);

  return Object.freeze({
    key,
    kind,

    canonicalPath:
      normalizePathnameOnly(path),

    path:
      normalizePathnameOnly(path),

    tokenNames:
      Object.freeze([
        ...new Set(tokenParamNames),
      ]),

    windowKeys:
      Object.freeze([
        ...new Set(windowKeys),
      ]),

    scrubFlags:
      Object.freeze([
        ...new Set(scrubFlags),
      ]),
  });
}

const PROTECTED_TOKEN_ROUTES =
  Object.freeze(
    (
      Array.isArray(PROTECTED_PUBLIC_TOKEN_ROUTES) &&
      PROTECTED_PUBLIC_TOKEN_ROUTES.length
        ? PROTECTED_PUBLIC_TOKEN_ROUTES
        : [
            {
              key:
                ACTIVATION_KIND,
              path:
                ACTIVATION_PATH,
              windowKey:
                "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
              tokenParamNames:
                DEFAULT_ACTIVATION_TOKEN_PARAM_NAMES,
            },
            {
              key:
                RESET_CONFIRM_KIND,
              path:
                RESET_CONFIRM_PATH,
              windowKey:
                "__ONION_RESET_CONFIRM_INITIAL_URL__",
              tokenParamNames:
                DEFAULT_RESET_TOKEN_PARAM_NAMES,
            },
          ]
    ).map(normalizeProtectedRouteConfig)
  );

const SENSITIVE_PARAM_NAMES =
  Object.freeze(
    [
      ...(Array.isArray(GENERIC_SENSITIVE_PARAM_NAMES)
        ? GENERIC_SENSITIVE_PARAM_NAMES
        : DEFAULT_SENSITIVE_PARAM_NAMES),
    ]
      .map((value) =>
        safeText(value, "")
      )
      .filter(Boolean)
  );

/* =========================================================
   TOKEN REDACTION / SANITIZE
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function redactTokenInText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  for (const name of SENSITIVE_PARAM_NAMES) {
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

  for (const config of PROTECTED_TOKEN_ROUTES) {
    try {
      const escapedPath =
        config.canonicalPath.replace(/\//g, "\\/");

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

function sanitizeForDebug(value, seen = new WeakSet()) {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (typeof value === "string") {
    return redactTokenInText(value);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (value instanceof Error) {
    return {
      name:
        safeText(value.name, "Error"),

      message:
        redactTokenInText(
          safeText(value.message, "")
        ),

      code:
        value.code || null,

      status:
        value.status || value.statusCode || null,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeForDebug(item, seen)
    );
  }

  if (typeof value === "object") {
    try {
      if (seen.has(value)) {
        return "[Circular]";
      }

      seen.add(value);

      const output = {};

      for (const [key, item] of Object.entries(value)) {
        if (
          /token|authorization|password|secret/i.test(key)
        ) {
          output[key] = "***";
          continue;
        }

        output[key] =
          sanitizeForDebug(item, seen);
      }

      return output;
    } catch {
      return "[Object]";
    }
  }

  return String(value);
}

/* =========================================================
   LOG / EMIT
========================================================= */

function safeEmit(AppCore, eventName = "", payload = {}, options = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const opts =
    safeObject(options);

  const cleanPayload =
    sanitizeForDebug(payload);

  let busAvailable =
    false;

  let busEmitted =
    false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable = true;

      AppCore.events.emit(
        name,
        cleanPayload
      );

      busEmitted = true;
    }
  } catch {}

  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail:
            cleanPayload,
        })
      );

      return true;
    } catch {}
  }

  return busEmitted;
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(
      "[RouterHistory]",
      ...args.map((item) =>
        sanitizeForDebug(item)
      )
    );
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.warn(
        "[RouterHistory]",
        ...args.map((item) =>
          sanitizeForDebug(item)
        )
      );
    }
  } catch {}
}

/* =========================================================
   PATH / URL NORMALIZATION
========================================================= */

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

function buildUrlFromParts({
  pathname = DEFAULT_ROUTE,
  search = "",
  hash = "",
} = {}) {
  return `${normalizePathnameOnly(pathname)}${normalizeSearch(search)}${normalizeHash(hash)}`;
}

function parseRawPath(value = DEFAULT_ROUTE) {
  const raw =
    safeText(value, DEFAULT_ROUTE) ||
    DEFAULT_ROUTE;

  if (isHashRouterPath(raw)) {
    return parseRawPath(
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
      normalizePathnameOnly(pathname),

    search:
      normalizeSearch(search),

    hash:
      normalizeHash(hash),
  };
}

function parseUrlParts(value = DEFAULT_ROUTE) {
  const raw =
    safeText(value, DEFAULT_ROUTE) ||
    DEFAULT_ROUTE;

  if (isHashRouterPath(raw)) {
    return parseUrlParts(
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
      return parseUrlParts(
        normalizeHashRouterPath(parsed.hash)
      );
    }

    return {
      pathname:
        normalizePathnameOnly(
          parsed.pathname || DEFAULT_ROUTE
        ),

      search:
        normalizeSearch(
          parsed.search || ""
        ),

      hash:
        normalizeHash(
          parsed.hash || ""
        ),
    };
  } catch {
    return parseRawPath(raw);
  }
}

function normalizePublicPathLocal(path = DEFAULT_ROUTE) {
  const parts =
    parseUrlParts(path);

  return buildUrlFromParts(parts);
}

function normalizePublicPath(AppCore, path = DEFAULT_ROUTE) {
  const raw =
    safeText(path, DEFAULT_ROUTE) ||
    DEFAULT_ROUTE;

  const local =
    normalizePublicPathLocal(raw);

  if (
    raw.includes("?") ||
    raw.includes("#")
  ) {
    return local;
  }

  try {
    if (isFunction(normalizePath)) {
      const delegated =
        normalizePath(
          AppCore,
          raw
        );

      if (delegated) {
        return normalizePublicPathLocal(
          delegated
        );
      }
    }
  } catch {}

  return local;
}

function stripPublicUsernamePrefix(pathname = DEFAULT_ROUTE) {
  return (
    normalizePathnameOnly(pathname)
      .replace(/^\/@[^/]+(?=\/|$)/i, "") ||
    DEFAULT_ROUTE
  );
}

function getPublicUsernameFromPath(pathname = "") {
  const clean =
    normalizePathnameOnly(pathname);

  const first =
    clean
      .split("/")
      .filter(Boolean)[0] ||
    "";

  return /^@[A-Za-z0-9._-]{1,80}$/.test(first)
    ? first.slice(1)
    : "";
}

function getCanonicalCandidateFromPath(path = DEFAULT_ROUTE) {
  const parts =
    parseUrlParts(path);

  return stripPublicUsernamePrefix(
    parts.pathname || DEFAULT_ROUTE
  );
}

function matchesProtectedConfigPath(config, path = DEFAULT_ROUTE) {
  const clean =
    normalizePathnameOnly(path);

  return (
    clean === config.canonicalPath ||
    clean.startsWith(`${config.canonicalPath}/`)
  );
}

function getProtectedRouteConfigFromPath(path = DEFAULT_ROUTE) {
  const clean =
    getCanonicalCandidateFromPath(path);

  return (
    PROTECTED_TOKEN_ROUTES.find((config) =>
      matchesProtectedConfigPath(
        config,
        clean
      )
    ) || null
  );
}

function pathFromUrlLike(AppCore, value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  return normalizePublicPath(
    AppCore,
    raw
  );
}

function getBrowserPublicUrl() {
  if (
    !isBrowser() ||
    !window.location
  ) {
    return "";
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
      return normalizePublicPathLocal(
        normalizeHashRouterPath(hash)
      );
    }

    return normalizePublicPathLocal(
      `${pathname}${search}${hash}`
    );
  } catch {
    return "";
  }
}

function normalizeCanonicalUrl(AppCore, url = DEFAULT_ROUTE) {
  const raw =
    safeText(url, DEFAULT_ROUTE) ||
    DEFAULT_ROUTE;

  const candidate =
    getCanonicalCandidateFromPath(raw);

  const protectedConfig =
    getProtectedRouteConfigFromPath(raw);

  if (protectedConfig) {
    return protectedConfig.canonicalPath;
  }

  try {
    if (isFunction(normalizeCanonicalPath)) {
      const delegated =
        normalizeCanonicalPath(
          AppCore,
          candidate
        );

      if (delegated) {
        return normalizePathnameOnly(
          stripPublicUsernamePrefix(
            parseUrlParts(delegated).pathname ||
            delegated
          )
        );
      }
    }
  } catch {}

  return normalizePathnameOnly(candidate);
}

function sameUrl(a = "", b = "") {
  return (
    safeText(a, "") ===
    safeText(b, "")
  );
}

/* =========================================================
   PROTECTED TOKEN ROUTE RESOLUTION
========================================================= */

function getProtectedRouteConfigFromUrl(AppCore, url = "") {
  const publicPath =
    pathFromUrlLike(
      AppCore,
      url || DEFAULT_ROUTE
    );

  return getProtectedRouteConfigFromPath(
    publicPath
  );
}

function getProtectedKind(AppCore, url = "") {
  return (
    getProtectedRouteConfigFromUrl(
      AppCore,
      url
    )?.kind || ""
  );
}

function isProtectedTokenPath(AppCore, url = "") {
  return Boolean(
    getProtectedRouteConfigFromUrl(
      AppCore,
      url
    )
  );
}

function isActivationPath(AppCore, url = "") {
  return (
    getProtectedKind(AppCore, url) ===
    ACTIVATION_KIND
  );
}

function isResetConfirmPath(AppCore, url = "") {
  return (
    getProtectedKind(AppCore, url) ===
    RESET_CONFIRM_INTERNAL_KIND
  );
}

function getTokenNamesForUrl(AppCore, url = "") {
  const config =
    getProtectedRouteConfigFromUrl(
      AppCore,
      url
    );

  return config?.tokenNames ||
    DEFAULT_ACTIVATION_TOKEN_PARAM_NAMES;
}

function hasTokenInSearch(search = "", tokenNames = []) {
  try {
    const params =
      new URLSearchParams(search || "");

    return tokenNames.some((name) =>
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

function getProtectedPathToken(AppCore, url = "") {
  const raw =
    safeText(url, "");

  if (!raw) {
    return "";
  }

  const publicPath =
    pathFromUrlLike(
      AppCore,
      raw
    );

  const parts =
    parseUrlParts(publicPath);

  const pathname =
    stripPublicUsernamePrefix(
      parts.pathname || DEFAULT_ROUTE
    );

  const config =
    getProtectedRouteConfigFromUrl(
      AppCore,
      raw
    );

  if (!config) {
    return "";
  }

  if (
    !pathname.startsWith(`${config.canonicalPath}/`)
  ) {
    return "";
  }

  const token =
    pathname
      .slice(`${config.canonicalPath}/`.length)
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

function hasProtectedToken(AppCore, url = "") {
  const raw =
    safeText(url, "");

  if (!raw) {
    return false;
  }

  if (
    isProtectedTokenPath(AppCore, raw) &&
    getProtectedPathToken(AppCore, raw)
  ) {
    return true;
  }

  const parts =
    parseUrlParts(raw);

  const tokenNames =
    getTokenNamesForUrl(
      AppCore,
      raw
    );

  if (
    hasTokenInSearch(
      parts.search,
      tokenNames
    )
  ) {
    return true;
  }

  if (
    parts.hash &&
    isHashRouterPath(parts.hash)
  ) {
    const hashPath =
      normalizeHashRouterPath(
        parts.hash
      );

    const hashParts =
      parseUrlParts(hashPath);

    if (
      hasTokenInSearch(
        hashParts.search,
        tokenNames
      )
    ) {
      return true;
    }

    if (
      getProtectedPathToken(
        AppCore,
        hashPath
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
      tokenNames
    )
  ) {
    return true;
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
  if (
    !canUseHistory() ||
    !flag
  ) {
    return false;
  }

  try {
    return Boolean(
      window.history?.state?.[flag]
    );
  } catch {
    return false;
  }
}

function getScrubFlagsForUrl(AppCore, url = "") {
  const config =
    getProtectedRouteConfigFromUrl(
      AppCore,
      url
    );

  if (!config) {
    return [];
  }

  return unique([
    ...config.scrubFlags,
    "scrubbedPublicTokenRoute",
    "scrubbedTokenRoute",
  ]);
}

function isProtectedTokenScrubbed(AppCore, url = "") {
  const flags =
    getScrubFlagsForUrl(
      AppCore,
      url
    );

  if (!flags.length) {
    return false;
  }

  return flags.some((flag) =>
    hasScrubFlag(flag)
  );
}

function isProtectedTokenUrl(AppCore, url = "") {
  if (
    isProtectedTokenScrubbed(
      AppCore,
      url
    )
  ) {
    return false;
  }

  return (
    isProtectedTokenPath(
      AppCore,
      url
    ) &&
    hasProtectedToken(
      AppCore,
      url
    )
  );
}

/* =========================================================
   INITIAL URL CAPTURE
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

function setWindowValueIfEmpty(key = "", value = "") {
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

function getInitialUrl() {
  return getWindowValue(
    APP_RUNTIME_KEYS?.initialUrl ||
    "__ONION_INITIAL_URL__"
  );
}

function getActivationInitialUrl() {
  return getWindowValue(
    APP_RUNTIME_KEYS?.activateAccountInitialUrl ||
    "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__"
  );
}

function getResetConfirmInitialUrl() {
  return (
    getWindowValue(
      APP_RUNTIME_KEYS?.resetPasswordConfirmInitialUrl ||
      "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__"
    ) ||
    getWindowValue(
      APP_RUNTIME_KEYS?.resetConfirmInitialUrl ||
      "__ONION_RESET_CONFIRM_INITIAL_URL__"
    )
  );
}

function getStoredInitialUrlsByConfig(config = null) {
  if (!config) {
    return [];
  }

  return config.windowKeys
    .map((key) =>
      getWindowValue(key)
    )
    .filter(Boolean);
}

function setStoredInitialUrlByConfig(config = null, value = "") {
  if (
    !config ||
    !value
  ) {
    return false;
  }

  let wrote =
    false;

  for (const key of config.windowKeys) {
    wrote =
      setWindowValueIfEmpty(
        key,
        value
      ) || wrote;
  }

  return wrote;
}

function captureInitialUrl(AppCore = null) {
  if (!isBrowser()) {
    return false;
  }

  try {
    const href =
      window.location.href;

    const browserPath =
      getBrowserPublicUrl();

    setWindowValueIfEmpty(
      APP_RUNTIME_KEYS?.initialUrl ||
      "__ONION_INITIAL_URL__",
      href
    );

    const candidates =
      [
        href,
        browserPath,
      ].filter(Boolean);

    let protectedCaptured =
      false;

    for (const candidate of candidates) {
      const config =
        getProtectedRouteConfigFromUrl(
          AppCore,
          candidate
        );

      if (
        config &&
        hasProtectedToken(AppCore, candidate) &&
        !isProtectedTokenScrubbed(AppCore, candidate) &&
        getStoredInitialUrlsByConfig(config).length === 0
      ) {
        protectedCaptured =
          setStoredInitialUrlByConfig(
            config,
            href
          ) || protectedCaptured;
      }
    }

    safeEmit(
      AppCore,
      HISTORY_EVENTS.capture,
      {
        href,
        browserPath,
        protectedCaptured,
        at:
          nowIso(),
      }
    );

    return true;
  } catch {
    return false;
  }
}

function buildCleanPublicUrl(AppCore, value = "") {
  const path =
    pathFromUrlLike(
      AppCore,
      value
    );

  if (!path) {
    return DEFAULT_ROUTE;
  }

  return normalizePublicPath(
    AppCore,
    path
  );
}

function getProtectedInitialUrl(AppCore = null) {
  captureInitialUrl(AppCore);

  const candidates =
    [];

  for (const config of PROTECTED_TOKEN_ROUTES) {
    const scrubbed =
      config.scrubFlags.some((flag) =>
        hasScrubFlag(flag)
      ) ||
      hasScrubFlag("scrubbedPublicTokenRoute") ||
      hasScrubFlag("scrubbedTokenRoute");

    if (scrubbed) {
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
    if (
      isProtectedTokenUrl(
        AppCore,
        candidate
      )
    ) {
      return buildCleanPublicUrl(
        AppCore,
        candidate
      );
    }
  }

  return "";
}

function shouldNeverWriteHistory(options = {}) {
  if (options.scrubProtectedToken === true) {
    return false;
  }

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
  url = DEFAULT_ROUTE,
  {
    preserveCurrentContext = false,
    preservePath = false,
    ignoreProtectedInitialUrl = false,
  } = {}
) {
  const protectedUrl =
    ignoreProtectedInitialUrl
      ? ""
      : getProtectedInitialUrl(AppCore);

  const targetKind =
    getProtectedKind(
      AppCore,
      url
    );

  const protectedKind =
    getProtectedKind(
      AppCore,
      protectedUrl
    );

  if (
    protectedUrl &&
    targetKind &&
    protectedKind &&
    targetKind === protectedKind
  ) {
    return normalizePublicPath(
      AppCore,
      protectedUrl
    );
  }

  if (preservePath) {
    const currentUrl =
      getBrowserPublicUrl() ||
      getCurrentPublicPath(AppCore) ||
      getCurrentPath(AppCore) ||
      DEFAULT_ROUTE;

    return normalizePublicUrl(
      AppCore,
      currentUrl,
      {
        preserveCurrentContext: false,
        preservePath: false,
        ignoreProtectedInitialUrl,
      }
    );
  }

  const target =
    parseUrlParts(url);

  const current =
    parseUrlParts(
      getBrowserPublicUrl() ||
      DEFAULT_ROUTE
    );

  const normalizedTargetPathname =
    normalizePathnameOnly(
      target.pathname ||
      DEFAULT_ROUTE
    );

  const normalizedCurrentPathname =
    normalizePathnameOnly(
      current.pathname ||
      DEFAULT_ROUTE
    );

  const sameRoute =
    normalizedTargetPathname ===
    normalizedCurrentPathname;

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
    pathname:
      normalizedTargetPathname,

    search:
      shouldPreserveSearch
        ? current.search
        : target.search,

    hash:
      shouldPreserveHash
        ? current.hash
        : target.hash,
  });
}

function getComparableCurrentUrl(AppCore) {
  const protectedUrl =
    getProtectedInitialUrl(AppCore);

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
      DEFAULT_ROUTE,
    {
      preserveCurrentContext: false,
    }
  );
}

/* =========================================================
   SCRUB TOKEN URL
========================================================= */

function removeSensitiveSearchParams(search = "") {
  const normalized =
    normalizeSearch(search);

  if (!normalized) {
    return "";
  }

  try {
    const params =
      new URLSearchParams(normalized);

    for (const name of SENSITIVE_PARAM_NAMES) {
      params.delete(name);
    }

    const output =
      params.toString();

    return output
      ? `?${output}`
      : "";
  } catch {
    let output =
      normalized;

    for (const name of SENSITIVE_PARAM_NAMES) {
      try {
        const escaped =
          escapeRegExp(name);

        output =
          output
            .replace(
              new RegExp(`([?&])${escaped}=[^&#]*&?`, "gi"),
              "$1"
            )
            .replace(/[?&]$/g, "");
      } catch {}
    }

    return output === "?"
      ? ""
      : output;
  }
}

function removeProtectedPathTokenFromPathname(pathname = DEFAULT_ROUTE) {
  const clean =
    normalizePathnameOnly(pathname);

  const segments =
    clean
      .split("/")
      .filter(Boolean);

  if (!segments.length) {
    return DEFAULT_ROUTE;
  }

  const hasUsername =
    /^@[A-Za-z0-9._-]{1,80}$/.test(
      segments[0] || ""
    );

  const rest =
    hasUsername
      ? segments.slice(1)
      : segments;

  for (const config of PROTECTED_TOKEN_ROUTES) {
    const baseSegments =
      config.canonicalPath
        .split("/")
        .filter(Boolean);

    const matches =
      baseSegments.every((part, index) =>
        rest[index] === part
      );

    if (!matches) {
      continue;
    }

    if (rest.length <= baseSegments.length) {
      return normalizePathnameOnly(
        `/${baseSegments.join("/")}`
      );
    }

    const nextRest =
      [
        ...baseSegments,
        ...rest.slice(baseSegments.length + 1),
      ];

    /*
      Rutas auth técnicas:
      tras scrub oficial no conservamos /@usuario.
    */
    return normalizePathnameOnly(
      `/${nextRest.join("/")}`
    );
  }

  return clean;
}

export function buildScrubbedProtectedUrl(AppCore, url = "") {
  const original =
    safeText(
      url,
      ""
    ) ||
    getBrowserPublicUrl() ||
    DEFAULT_ROUTE;

  const parts =
    parseUrlParts(original);

  const pathname =
    removeProtectedPathTokenFromPathname(
      parts.pathname || DEFAULT_ROUTE
    );

  const search =
    removeSensitiveSearchParams(
      parts.search
    );

  let hash =
    parts.hash;

  if (
    hash &&
    hash.includes("?") &&
    !isHashRouterPath(hash)
  ) {
    try {
      const [hashPath, ...queryParts] =
        hash.split("?");

      const query =
        queryParts.join("?");

      const cleanQuery =
        removeSensitiveSearchParams(
          query ? `?${query}` : ""
        );

      hash =
        cleanQuery
          ? `${hashPath}${cleanQuery}`
          : hashPath;
    } catch {}
  }

  return buildUrlFromParts({
    pathname,
    search,
    hash:
      isHashRouterPath(hash)
        ? ""
        : hash,
  });
}

export function scrubProtectedTokenFromHistory({
  AppCore,
  url = "",
  reason = "protected-token-scrub",
  replace = true,
  extraState = {},
} = {}) {
  if (!canUseHistory()) {
    return false;
  }

  const currentUrl =
    safeText(url, "") ||
    getBrowserPublicUrl() ||
    getComparableCurrentUrl(AppCore) ||
    DEFAULT_ROUTE;

  const config =
    getProtectedRouteConfigFromUrl(
      AppCore,
      currentUrl
    );

  if (!config) {
    return false;
  }

  const scrubbedUrl =
    buildScrubbedProtectedUrl(
      AppCore,
      currentUrl
    );

  const flags =
    getScrubFlagsForUrl(
      AppCore,
      currentUrl
    );

  const flagPayload =
    {};

  for (const flag of flags) {
    flagPayload[flag] =
      config.kind === RESET_CONFIRM_INTERNAL_KIND
        ? RESET_CONFIRM_KIND
        : config.kind;
  }

  const state =
    createHistoryState({
      AppCore,
      pathname:
        scrubbedUrl,

      extras: {
        ...safeObject(extraState),
        ...flagPayload,

        mode:
          "scrub",

        publicPath:
          scrubbedUrl,

        requestedPath:
          scrubbedUrl,

        canonicalPath:
          normalizeCanonicalUrl(
            AppCore,
            scrubbedUrl
          ),

        rawCanonicalPath:
          normalizeCanonicalUrl(
            AppCore,
            scrubbedUrl
          ),

        source:
          reason,

        scrubbedProtectedToken:
          true,

        scrubbedProtectedTokenKind:
          config.kind,

        scrubbedProtectedTokenAt:
          nowIso(),
      },
    });

  const ok =
    safeHistoryCall(
      AppCore,
      replace ? "replaceState" : "pushState",
      state,
      scrubbedUrl,
      {
        reason,
        scrubbed:
          true,
        writeSignature:
          createWriteSignature({
            method:
              replace ? "replaceState" : "pushState",
            url:
              scrubbedUrl,
            state,
          }),
      }
    );

  if (ok) {
    safeEmit(
      AppCore,
      HISTORY_EVENTS.scrub,
      {
        reason,
        from:
          currentUrl,
        to:
          scrubbedUrl,
        kind:
          config.kind,
        flags,
        state,
      }
    );
  }

  return ok;
}

/* =========================================================
   CONTEXT RESOLUTION
========================================================= */

function getResolvedHistoryContext(
  AppCore,
  pathname = DEFAULT_ROUTE,
  options = {}
) {
  const opts =
    safeObject(options);

  let rawPublicPath =
    "";

  try {
    rawPublicPath =
      opts.publicPath ||
      buildHistoryUrl(
        AppCore,
        opts.getRoute,
        pathname,
        opts
      ) ||
      pathname ||
      DEFAULT_ROUTE;
  } catch {
    rawPublicPath =
      opts.publicPath ||
      pathname ||
      DEFAULT_ROUTE;
  }

  const publicPath =
    normalizePublicUrl(
      AppCore,
      rawPublicPath,
      {
        preserveCurrentContext:
          opts.preserveCurrentContext === true ||
          opts.preservePublicPath === true ||
          opts.preserveUrl === true,

        preservePath:
          opts.preservePath === true,

        ignoreProtectedInitialUrl:
          opts.ignoreProtectedInitialUrl === true ||
          opts.scrubProtectedToken === true,
      }
    );

  let payload =
    {};

  try {
    payload =
      buildStatePayload(
        AppCore,
        publicPath
      ) || {};
  } catch {
    payload =
      {};
  }

  const canonicalPath =
    normalizeCanonicalUrl(
      AppCore,
      opts.canonicalPath ||
        payload.canonicalPath ||
        pathname ||
        publicPath ||
        DEFAULT_ROUTE
    );

  const rawCanonicalPath =
    normalizeCanonicalUrl(
      AppCore,
      opts.rawCanonicalPath ||
        opts.requestedCanonicalPath ||
        pathname ||
        publicPath ||
        canonicalPath ||
        DEFAULT_ROUTE
    );

  const requestedPath =
    normalizePublicUrl(
      AppCore,
      opts.requestedPath ||
        opts.fromPath ||
        pathname ||
        publicPath,
      {
        preserveCurrentContext:
          opts.preserveCurrentContext === true,

        preservePath:
          false,

        ignoreProtectedInitialUrl:
          opts.ignoreProtectedInitialUrl === true ||
          opts.scrubProtectedToken === true,
      }
    );

  const username =
    opts.username ||
    opts.resolvedUsername ||
    payload.username ||
    getPublicUsernameFromPath(
      parseUrlParts(publicPath).pathname
    ) ||
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
   STATE / WRITE SIGNATURES
========================================================= */

function normalizeStateForCompare(state = null) {
  const value =
    safeObject(state);

  if (!Object.keys(value).length) {
    return null;
  }

  return {
    publicPath:
      safeText(
        value.publicPath ||
          value.path,
        ""
      ),

    canonicalPath:
      safeText(
        value.canonicalPath,
        ""
      ),

    rawCanonicalPath:
      safeText(
        value.rawCanonicalPath,
        ""
      ),

    requestedPath:
      safeText(
        value.requestedPath,
        ""
      ),

    username:
      safeText(
        value.username,
        ""
      ),

    source:
      safeText(
        value.source,
        ""
      ),

    redirectedFrom:
      safeText(
        value.redirectedFrom,
        ""
      ),

    mode:
      safeText(
        value.mode,
        ""
      ),
  };
}

function isSameHistoryState(currentState = null, nextState = null) {
  const current =
    normalizeStateForCompare(
      currentState
    );

  const next =
    normalizeStateForCompare(
      nextState
    );

  if (
    !current ||
    !next
  ) {
    return false;
  }

  return (
    current.publicPath === next.publicPath &&
    current.canonicalPath === next.canonicalPath &&
    current.rawCanonicalPath === next.rawCanonicalPath &&
    current.requestedPath === next.requestedPath &&
    current.username === next.username &&
    current.redirectedFrom === next.redirectedFrom &&
    current.mode === next.mode
  );
}

function createWriteSignature({
  method = "",
  url = "",
  state = {},
} = {}) {
  return [
    safeText(method, ""),
    safeText(url, ""),
    safeText(state?.canonicalPath, ""),
    safeText(state?.rawCanonicalPath, ""),
    safeText(state?.publicPath || state?.path, ""),
    safeText(state?.requestedPath, ""),
    safeText(state?.username, ""),
    safeText(state?.mode, ""),
    safeText(state?.redirectedFrom, ""),
  ].join("|");
}

function safeHistoryCall(AppCore, method, state, url, meta = {}) {
  if (!canUseHistory()) {
    return false;
  }

  if (
    method !== "pushState" &&
    method !== "replaceState"
  ) {
    return false;
  }

  const cleanUrl =
    safeText(url, DEFAULT_ROUTE) ||
    DEFAULT_ROUTE;

  try {
    window.history[method](
      state,
      "",
      cleanUrl
    );

    lastWriteSignature =
      meta.writeSignature ||
      createWriteSignature({
        method,
        url:
          cleanUrl,
        state,
      });

    lastWriteAt =
      nowTs();

    safeEmit(
      AppCore,
      HISTORY_EVENTS.write,
      {
        method,
        url:
          cleanUrl,
        state,
        meta,
        at:
          nowIso(lastWriteAt),
      }
    );

    return true;
  } catch (error) {
    safeWarn(
      AppCore,
      `History API ${method} falló.`,
      {
        url:
          cleanUrl,
        error,
      }
    );

    safeEmit(
      AppCore,
      HISTORY_EVENTS.error,
      {
        method,
        url:
          cleanUrl,
        error,
        message:
          error?.message ||
          String(error),
        meta,
      }
    );

    return false;
  }
}

/* =========================================================
   BUILDERS
========================================================= */

export function createHistoryState({
  AppCore,
  pathname = DEFAULT_ROUTE,
  extras = {},
} = {}) {
  const cleanExtras =
    safeObject(extras);

  let base =
    {};

  try {
    base =
      buildStatePayload(
        AppCore,
        pathname,
        {
          ts:
            nowTs(),
          ...cleanExtras,
        }
      ) || {};
  } catch {
    base =
      {};
  }

  const id =
    cleanExtras.id ||
    base.id ||
    nextHistoryId();

  const publicPath =
    cleanExtras.publicPath ||
    base.publicPath ||
    base.path ||
    pathname ||
    DEFAULT_ROUTE;

  const canonicalPath =
    cleanExtras.canonicalPath ||
    base.canonicalPath ||
    normalizeCanonicalUrl(
      AppCore,
      publicPath
    );

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
    getPublicUsernameFromPath(
      parseUrlParts(publicPath).pathname
    ) ||
    getCurrentResolvedUsername(AppCore) ||
    null;

  return {
    ...base,
    ...cleanExtras,

    __onionRouterHistory:
      true,

    version:
      HISTORY_STATE_VERSION,

    id,

    navId:
      cleanExtras.navId ||
      base.navId ||
      id,

    ts:
      cleanExtras.ts ||
      base.ts ||
      nowTs(),

    at:
      cleanExtras.at ||
      base.at ||
      nowIso(),

    path:
      publicPath,

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
  pathname = DEFAULT_ROUTE,
  options = {},
  mode = "push",
} = {}) {
  const opts =
    safeObject(options);

  const context =
    getResolvedHistoryContext(
      AppCore,
      pathname,
      opts
    );

  const scrubFlags =
    opts.scrubProtectedToken === true
      ? getScrubFlagsForUrl(
          AppCore,
          context.publicPath
        )
      : [];

  const scrubPayload =
    {};

  for (const flag of scrubFlags) {
    scrubPayload[flag] =
      true;
  }

  const state =
    createHistoryState({
      AppCore,
      pathname:
        context.publicPath,

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
          opts.redirectedFrom ||
          null,

        source:
          opts.source ||
          null,

        preservePath:
          opts.preservePath === true,

        preserveCurrentContext:
          opts.preserveCurrentContext === true,

        protectedInitialUrl:
          opts.protectedInitialUrl === true,

        scrubProtectedToken:
          opts.scrubProtectedToken === true,

        ...scrubPayload,
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
  pathname = DEFAULT_ROUTE,
  options = {},
} = {}) {
  captureInitialUrl(AppCore);

  const opts =
    safeObject(options);

  if (shouldNeverWriteHistory(opts)) {
    safeEmit(
      AppCore,
      HISTORY_EVENTS.skip,
      {
        method:
          "pushState",
        reason:
          "skip-history",
        pathname,
        options:
          opts,
      }
    );

    return false;
  }

  const {
    publicPath,
    state,
  } =
    createResolvedState({
      AppCore,
      pathname,
      options:
        opts,
      mode:
        "push",
    });

  const writeSignature =
    createWriteSignature({
      method:
        "pushState",
      url:
        publicPath,
      state,
    });

  const currentState =
    getCurrentHistoryState();

  if (
    isSameHistoryState(
      currentState,
      state
    ) &&
    opts.forceHistory !== true
  ) {
    safeEmit(
      AppCore,
      HISTORY_EVENTS.skip,
      {
        method:
          "pushState",
        reason:
          "same-state",
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
    publicPath,
    {
      pathname,
      options:
        opts,
      writeSignature,
    }
  );
}

export function replaceState({
  AppCore,
  pathname = DEFAULT_ROUTE,
  options = {},
} = {}) {
  captureInitialUrl(AppCore);

  const opts =
    safeObject(options);

  if (shouldNeverWriteHistory(opts)) {
    safeEmit(
      AppCore,
      HISTORY_EVENTS.skip,
      {
        method:
          "replaceState",
        reason:
          "skip-history",
        pathname,
        options:
          opts,
      }
    );

    return false;
  }

  const {
    publicPath,
    state,
  } =
    createResolvedState({
      AppCore,
      pathname,
      options:
        opts,
      mode:
        "replace",
    });

  const writeSignature =
    createWriteSignature({
      method:
        "replaceState",
      url:
        publicPath,
      state,
    });

  const currentState =
    getCurrentHistoryState();

  if (
    isSameHistoryState(
      currentState,
      state
    ) &&
    opts.forceHistory !== true
  ) {
    safeEmit(
      AppCore,
      HISTORY_EVENTS.skip,
      {
        method:
          "replaceState",
        reason:
          "same-state",
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
    publicPath,
    {
      pathname,
      options:
        opts,
      writeSignature,
    }
  );
}

/* =========================================================
   MAIN UPDATE
========================================================= */

export function updateHistory({
  AppCore,
  getRoute,
  pathname = DEFAULT_ROUTE,
  options = {},
} = {}) {
  if (!canUseHistory()) {
    return false;
  }

  captureInitialUrl(AppCore);

  const opts =
    safeObject(options);

  if (shouldNeverWriteHistory(opts)) {
    safeEmit(
      AppCore,
      HISTORY_EVENTS.skip,
      {
        method:
          "updateHistory",
        reason:
          "skip-history",
        pathname,
        options:
          opts,
      }
    );

    return false;
  }

  const finalOptions = {
    ...opts,
    getRoute,
  };

  const resolved =
    getResolvedHistoryContext(
      AppCore,
      pathname,
      finalOptions
    );

  const method =
    finalOptions.replaceState === true
      ? "replaceState"
      : "pushState";

  const nextState =
    createHistoryState({
      AppCore,
      pathname:
        resolved.publicPath,

      extras: {
        mode:
          method === "replaceState"
            ? "replace"
            : "push",

        canonicalPath:
          resolved.canonicalPath,

        rawCanonicalPath:
          resolved.rawCanonicalPath,

        publicPath:
          resolved.publicPath,

        requestedPath:
          resolved.requestedPath,

        username:
          resolved.username,

        redirectedFrom:
          finalOptions.redirectedFrom ||
          null,

        source:
          finalOptions.source ||
          null,
      },
    });

  const nextSignature =
    createWriteSignature({
      method,
      url:
        resolved.publicPath,
      state:
        nextState,
    });

  const currentUrl =
    getComparableCurrentUrl(AppCore);

  const sameCurrentUrl =
    sameUrl(
      resolved.publicPath,
      currentUrl
    );

  const sameAsLastWrite =
    nextSignature === lastWriteSignature &&
    nowTs() - lastWriteAt < WRITE_DEDUPE_MS;

  if (
    (
      sameCurrentUrl ||
      sameAsLastWrite
    ) &&
    finalOptions.replaceState !== true &&
    finalOptions.forceHistory !== true
  ) {
    safeEmit(
      AppCore,
      HISTORY_EVENTS.skip,
      {
        method:
          "updateHistory",
        reason:
          sameAsLastWrite
            ? "same-last-write"
            : "same-url",
        nextUrl:
          resolved.publicPath,
        currentUrl,
        canonicalPath:
          resolved.canonicalPath,
        rawCanonicalPath:
          resolved.rawCanonicalPath,
        requestedPath:
          resolved.requestedPath,
        username:
          resolved.username,
      }
    );

    return false;
  }

  const writeOptions = {
    ...finalOptions,

    canonicalPath:
      resolved.canonicalPath,

    rawCanonicalPath:
      resolved.rawCanonicalPath,

    requestedPath:
      resolved.requestedPath,

    username:
      resolved.username,

    resolvedUsername:
      resolved.username,
  };

  if (
    sameCurrentUrl ||
    finalOptions.replaceState === true
  ) {
    return replaceState({
      AppCore,
      pathname:
        resolved.publicPath,
      options:
        writeOptions,
    });
  }

  return pushState({
    AppCore,
    pathname:
      resolved.publicPath,
    options:
      writeOptions,
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

    const protectedUrl =
      getProtectedInitialUrl(AppCore);

    const currentUrl =
      protectedUrl ||
      getComparableCurrentUrl(AppCore) ||
      DEFAULT_ROUTE;

    const currentCanonicalPath =
      normalizeCanonicalUrl(
        AppCore,
        currentUrl ||
          getCurrentCanonicalPath(AppCore) ||
          getBrowserPublicUrl() ||
          DEFAULT_ROUTE
      );

    const currentUsername =
      getPublicUsernameFromPath(
        parseUrlParts(currentUrl).pathname
      ) ||
      getCurrentResolvedUsername(AppCore) ||
      null;

    const currentState =
      getCurrentHistoryState();

    if (
      currentState &&
      typeof currentState === "object"
    ) {
      const statePublicPath =
        normalizePublicUrl(
          AppCore,
          currentState.publicPath ||
            currentState.path ||
            DEFAULT_ROUTE,
          {
            preserveCurrentContext:
              false,
          }
        );

      const stateCanonicalPath =
        normalizeCanonicalUrl(
          AppCore,
          currentState.canonicalPath ||
            DEFAULT_ROUTE
        );

      const stateVersion =
        Number(
          currentState.version ||
          0
        );

      if (
        stateVersion >= HISTORY_STATE_VERSION &&
        statePublicPath === currentUrl &&
        stateCanonicalPath === currentCanonicalPath
      ) {
        safeEmit(
          AppCore,
          HISTORY_EVENTS.initial,
          {
            reason:
              "existing-valid-state",
            currentUrl,
            currentCanonicalPath,
            currentState,
          }
        );

        return true;
      }
    }

    const state =
      createHistoryState({
        AppCore,
        pathname:
          currentUrl,

        extras: {
          mode:
            "initial",

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
              isActivationPath(
                AppCore,
                protectedUrl
              )
            ),

          protectedResetToken:
            Boolean(
              protectedUrl &&
              isResetConfirmPath(
                AppCore,
                protectedUrl
              )
            ),
        },
      });

    const writeSignature =
      createWriteSignature({
        method:
          "replaceState",
        url:
          currentUrl,
        state,
      });

    const ok =
      safeHistoryCall(
        AppCore,
        "replaceState",
        state,
        currentUrl,
        {
          reason:
            "ensure-initial-history-state",
          writeSignature,
        }
      );

    safeEmit(
      AppCore,
      HISTORY_EVENTS.initial,
      {
        ok,
        currentUrl,
        currentCanonicalPath,
        state,
      }
    );

    return ok;
  } catch (error) {
    safeWarn(
      AppCore,
      "ensureInitialHistoryState falló.",
      error
    );

    safeEmit(
      AppCore,
      HISTORY_EVENTS.error,
      {
        method:
          "ensureInitialHistoryState",
        error,
      }
    );

    return false;
  }
}

/* =========================================================
   NAVIGATION
========================================================= */

export function back(AppCore = null) {
  if (!canUseHistory()) {
    return false;
  }

  try {
    window.history.back();

    safeEmit(
      AppCore,
      HISTORY_EVENTS.back,
      {
        at:
          nowIso(),
      }
    );

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
        preserveCurrentContext:
          false,
      }
    );
  }

  return (
    getComparableCurrentUrl(AppCore) ||
    DEFAULT_ROUTE
  );
}

/* =========================================================
   DEBUG
========================================================= */

export function getHistorySnapshot(AppCore) {
  const comparableUrl =
    getComparableCurrentUrl(AppCore);

  const protectedInitialUrl =
    getProtectedInitialUrl(AppCore);

  const state =
    canUseHistory()
      ? window.history.state
      : null;

  return sanitizeForDebug({
    version:
      ROUTER_HISTORY_VERSION,

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
        comparableUrl || DEFAULT_ROUTE
      ),

    currentPublicPath:
      comparableUrl,

    currentAppPublicPath:
      getCurrentPublicPath(AppCore) ||
      null,

    currentAppCanonicalPath:
      getCurrentCanonicalPath(AppCore) ||
      null,

    currentAppPath:
      getCurrentPath(AppCore) ||
      null,

    currentResolvedUsername:
      getCurrentResolvedUsername(AppCore) ||
      null,

    lastWriteSignature,
    lastWriteAt,
    lastWriteAtIso:
      lastWriteAt
        ? nowIso(lastWriteAt)
        : "",

    seq:
      historySeq,

    state,
  });
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
