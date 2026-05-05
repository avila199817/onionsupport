/* =========================================================
   Onion SPA - Auth Helpers
   Archivo: src/features/auth/helpers.js

   AUTH HELPERS · FINAL EXTREME PRO SYSTEM · 10/10

   RESPONSABILIDADES:
   - helpers base auth
   - normalización de paths públicos/canónicos
   - saneado username / slug / tokens / session values
   - extracción segura de mensajes de error
   - detección rutas auth
   - detección rutas públicas técnicas
   - validación de redirects internos
   - soporte hash-router /#/...
   - soporte hashbang #!/...
   - canonical sin query/hash
   - publicPath con query/hash
   - strip seguro de /@username
   - redacción de tokens en logs/eventos
   - payloads públicos sin secretos

   HARDENING:
   - tolerancia total a AppCore parcial
   - unicode safe
   - anti open redirect
   - no localStorage.clear
   - no rompe /activate-account?token=...
   - no rompe /activate-account/<token>
   - no rompe /reset-password/confirm?token=...
   - no rompe /reset-password/confirm/<token>
   - tokens no se truncan: se invalidan si exceden límite
   - session values se limitan de forma controlada
   - cero throws accidentales
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  AUTH_CONSTANTS,
  AUTH_PUBLIC_TECHNICAL_ROUTES,
  AUTH_TOKEN_PARAM_NAMES,
} from "./constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

const AUTH_HELPERS_VERSION =
  "10.2.0";

const DEFAULT_ROUTE =
  "/";

const LOCAL_ORIGIN =
  "http://localhost";

const SAFE_USERNAME_FALLBACK_MAX =
  80;

const SAFE_SLUG_MAX =
  160;

const SAFE_TOKEN_FALLBACK_MAX =
  8192;

const SAFE_SESSION_VALUE_FALLBACK_MAX =
  200;

const SAFE_SESSION_VALUE_ABSOLUTE_MAX =
  2048;

const SAFE_URL_MAX =
  4096;

const AUTH_ROUTE_CANDIDATES =
  Object.freeze([
    "/login",
    "/signin",
    "/sign-in",
    "/auth",
    "/auth/login",
    "/forgot-password",
    "/reset-password",
    "/reset-password/confirm",
    "/recover",
    "/recover-password",
    "/password-reset",
    "/activate-account",
    "/2fa",
    "/otp",
    "/mfa",
  ]);

const DEFAULT_PUBLIC_TECHNICAL_ROUTES =
  Object.freeze([
    "/activate-account",
    "/reset-password",
    "/reset-password/confirm",
    "/forgot-password",
    "/recover-password",
    "/password-reset",
  ]);

const CORRUPTED_TEXT_VALUES =
  new Set([
    "",
    "undefined",
    "null",
    "false",
    "none",
    "nan",
    "[object object]",
    "{}",
    "[]",
    "\"undefined\"",
    "\"null\"",
    "\"false\"",
  ]);

const TECHNICAL_TOKEN_PATHS =
  Object.freeze([
    "/activate-account",
    "/reset-password/confirm",
  ]);

const FALLBACK_TOKEN_PARAM_NAMES =
  Object.freeze({
    generic: [
      "token",
      "code",
      "t",
    ],

    activation: [
      "token",
      "activationToken",
      "activateToken",
      "code",
      "t",
    ],

    reset: [
      "token",
      "resetToken",
      "passwordResetToken",
      "code",
      "t",
    ],

    auth: [
      "token",
      "access_token",
      "refresh_token",
      "id_token",
      "authToken",
      "auth_token",
    ],
  });

/* =========================================================
   BASE
========================================================= */

export function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

export function safeText(value, fallback = "") {
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

export function safeNumber(value, fallback = 0) {
  const numeric =
    Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : fallback;
}

export function safeInt(value, fallback = 0) {
  return Math.trunc(
    safeNumber(value, fallback)
  );
}

export function clampNumber(
  value,
  min = 0,
  max = Number.MAX_SAFE_INTEGER
) {
  const numeric =
    safeNumber(value, min);

  return Math.min(
    Math.max(numeric, min),
    max
  );
}

export function safeBool(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const text =
    safeText(value, "")
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
    ].includes(text)
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
      "off",
    ].includes(text)
  ) {
    return false;
  }

  return Boolean(fallback);
}

export function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

export function isPlainObject(value) {
  return isObject(value);
}

export function isFn(value) {
  return typeof value === "function";
}

export function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

export function safeClone(value, fallback = null) {
  try {
    if (typeof AppCore?.utils?.safeClone === "function") {
      return AppCore.utils.safeClone(
        value,
        fallback
      );
    }
  } catch {}

  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {
    return fallback === undefined
      ? value
      : fallback;
  }
}

function safeObject(value) {
  return isObject(value)
    ? value
    : {};
}

function hasOwn(obj, key) {
  return Boolean(
    obj &&
      typeof obj === "object" &&
      Object.prototype.hasOwnProperty.call(
        obj,
        key
      )
  );
}

function safeLower(value = "") {
  return safeText(value, "")
    .toLowerCase();
}

function isCorruptedTextValue(value = "") {
  const text =
    safeLower(value);

  return CORRUPTED_TEXT_VALUES.has(text);
}

function unique(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .flat(Infinity)
        .map((value) =>
          safeText(value, "")
        )
        .filter(Boolean)
    )
  );
}

function escapeRegExp(value = "") {
  return safeText(value, "")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* =========================================================
   APPCORE DELEGATES
========================================================= */

function coreNormalizePath(value) {
  try {
    if (typeof AppCore?.utils?.normalizePath === "function") {
      return AppCore.utils.normalizePath(value);
    }
  } catch {}

  return null;
}

function coreNormalizeCanonicalPath(value) {
  try {
    if (typeof AppCore?.utils?.normalizeCanonicalPath === "function") {
      return AppCore.utils.normalizeCanonicalPath(value);
    }
  } catch {}

  return null;
}

function coreNormalizePublicPath(value) {
  try {
    if (typeof AppCore?.utils?.normalizePublicPath === "function") {
      return AppCore.utils.normalizePublicPath(value);
    }
  } catch {}

  return null;
}

function coreSanitizeUsername(value) {
  try {
    if (typeof AppCore?.utils?.sanitizeUsername === "function") {
      return AppCore.utils.sanitizeUsername(value);
    }
  } catch {}

  return null;
}

function coreSlugify(value) {
  try {
    if (typeof AppCore?.utils?.slugify === "function") {
      return AppCore.utils.slugify(value);
    }
  } catch {}

  return null;
}

/* =========================================================
   URL / PATH BASICS
========================================================= */

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return LOCAL_ORIGIN;
}

function limitUrlLike(value = "") {
  return safeText(value, "")
    .slice(0, SAFE_URL_MAX);
}

export function isHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

export function normalizeHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return DEFAULT_ROUTE;
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  }

  return raw.replace(/^#\/?/, "/") || DEFAULT_ROUTE;
}

function normalizeSearch(search = "") {
  const value =
    safeText(search, "");

  if (!value) {
    return "";
  }

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value =
    safeText(hash, "");

  if (!value) {
    return "";
  }

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

export function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
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

  const normalizedSegments = [];

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
    `/${normalizedSegments.join("/")}` || DEFAULT_ROUTE;

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") || DEFAULT_ROUTE;
  }

  return value;
}

export function splitPath(path = DEFAULT_ROUTE) {
  const raw =
    limitUrlLike(path) || DEFAULT_ROUTE;

  if (isHashRouterPath(raw)) {
    return splitPath(
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
    pathname:
      normalizePathnameOnly(pathname),

    search:
      normalizeSearch(search),

    hash:
      normalizeHash(hash),

    suffix:
      `${normalizeSearch(search)}${normalizeHash(hash)}`,
  };
}

export function fallbackNormalizePath(value = DEFAULT_ROUTE) {
  const raw =
    limitUrlLike(value) || DEFAULT_ROUTE;

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
    splitPath(raw);

  return `${pathname}${search}${hash}`;
}

export function stripSearchAndHash(path = DEFAULT_ROUTE) {
  const { pathname } =
    splitPath(
      fallbackNormalizePath(path)
    );

  return pathname || DEFAULT_ROUTE;
}

export function getSearchAndHash(path = DEFAULT_ROUTE) {
  const {
    search,
    hash,
  } =
    splitPath(
      fallbackNormalizePath(path)
    );

  return `${search || ""}${hash || ""}`;
}

export function stripUsernamePrefix(path = DEFAULT_ROUTE) {
  const normalized =
    fallbackNormalizePath(path);

  const {
    pathname,
    search,
    hash,
  } =
    splitPath(normalized);

  const stripped =
    pathname.replace(
      /^\/@[^/]+(?=\/|$)/i,
      ""
    ) || DEFAULT_ROUTE;

  return fallbackNormalizePath(
    `${normalizePathnameOnly(stripped)}${search}${hash}`
  );
}

export function normalizePath(path = DEFAULT_ROUTE) {
  const raw =
    limitUrlLike(path) || DEFAULT_ROUTE;

  const fallback =
    fallbackNormalizePath(raw);

  /*
    Si trae query/hash, no delegamos a AppCore.
    Algunos normalizadores globales pueden perder ?token=...
  */
  if (
    raw.includes("?") ||
    raw.includes("#")
  ) {
    return fallback;
  }

  const delegated =
    coreNormalizePath(raw);

  return delegated
    ? fallbackNormalizePath(delegated)
    : fallback;
}

export function normalizePublicPath(path = DEFAULT_ROUTE) {
  const raw =
    limitUrlLike(path) || DEFAULT_ROUTE;

  const fallback =
    stripUsernamePrefix(
      fallbackNormalizePath(raw)
    );

  if (
    raw.includes("?") ||
    raw.includes("#")
  ) {
    return fallback;
  }

  const delegated =
    coreNormalizePublicPath(raw);

  return delegated
    ? stripUsernamePrefix(
        fallbackNormalizePath(delegated)
      )
    : fallback;
}

export function normalizeCanonicalPath(path = DEFAULT_ROUTE) {
  const raw =
    limitUrlLike(path) || DEFAULT_ROUTE;

  const fallback =
    stripSearchAndHash(
      normalizePublicPath(raw)
    );

  if (
    raw.includes("?") ||
    raw.includes("#")
  ) {
    return fallback;
  }

  const delegated =
    coreNormalizeCanonicalPath(raw) ||
    coreNormalizePath(raw);

  return delegated
    ? stripSearchAndHash(
        normalizePublicPath(delegated)
      )
    : fallback;
}

export function pathFromUrlLike(value = "") {
  const raw =
    limitUrlLike(value);

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
   CURRENT PATHS
========================================================= */

export function getCurrentPublicPath() {
  if (!isBrowser()) {
    return normalizePublicPath(
      AppCore?.state?.publicPath ||
        AppCore?.state?.route ||
        DEFAULT_ROUTE
    );
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
      return normalizePublicPath(
        normalizeHashRouterPath(hash)
      );
    }

    return normalizePublicPath(
      `${pathname}${search}${hash}`
    );
  } catch {
    return normalizePublicPath(
      AppCore?.state?.publicPath ||
        AppCore?.state?.route ||
        DEFAULT_ROUTE
    );
  }
}

export function getCurrentCanonicalPath() {
  return normalizeCanonicalPath(
    getCurrentPublicPath()
  );
}

export function configLikeRoute(path = DEFAULT_ROUTE) {
  return normalizePath(path || DEFAULT_ROUTE);
}

/* =========================================================
   ROUTE DETECTION
========================================================= */

function routeStartsWith(path = DEFAULT_ROUTE, candidate = DEFAULT_ROUTE) {
  const cleanPath =
    normalizeCanonicalPath(path)
      .toLowerCase();

  const cleanCandidate =
    normalizeCanonicalPath(candidate)
      .toLowerCase();

  return (
    cleanPath === cleanCandidate ||
    cleanPath.startsWith(`${cleanCandidate}/`)
  );
}

export function isAuthRoute(
  pathname = isBrowser()
    ? window.location.pathname
    : DEFAULT_ROUTE
) {
  return AUTH_ROUTE_CANDIDATES.some((candidate) =>
    routeStartsWith(
      pathname,
      candidate
    )
  );
}

export function isPublicTechnicalRoute(path = getCurrentPublicPath()) {
  const routes =
    Array.isArray(AUTH_PUBLIC_TECHNICAL_ROUTES)
      ? AUTH_PUBLIC_TECHNICAL_ROUTES
      : DEFAULT_PUBLIC_TECHNICAL_ROUTES;

  return routes.some((route) =>
    routeStartsWith(
      path,
      route
    )
  );
}

export function isActivationRoute(path = getCurrentPublicPath()) {
  return routeStartsWith(
    path,
    "/activate-account"
  );
}

export function isResetPasswordRoute(path = getCurrentPublicPath()) {
  return routeStartsWith(
    path,
    "/reset-password"
  );
}

export function isResetPasswordConfirmRoute(path = getCurrentPublicPath()) {
  return routeStartsWith(
    path,
    "/reset-password/confirm"
  );
}

export function isForgotPasswordRoute(path = getCurrentPublicPath()) {
  return (
    routeStartsWith(path, "/forgot-password") ||
    routeStartsWith(path, "/recover-password") ||
    routeStartsWith(path, "/password-reset")
  );
}

export function isTwoFactorRoute(path = getCurrentPublicPath()) {
  return (
    routeStartsWith(path, "/2fa") ||
    routeStartsWith(path, "/otp") ||
    routeStartsWith(path, "/mfa")
  );
}

/* =========================================================
   REDIRECT SAFETY
========================================================= */

function hasEncodedOpenRedirectRisk(path = "") {
  const raw =
    safeText(path, "");

  if (!raw) {
    return true;
  }

  const lower =
    raw.toLowerCase();

  if (
    lower.includes("%0d") ||
    lower.includes("%0a") ||
    lower.includes("%09") ||
    lower.includes("\\") ||
    lower.includes("%5c")
  ) {
    return true;
  }

  try {
    const decoded =
      decodeURIComponent(raw)
        .trim()
        .replace(/\\/g, "/");

    if (
      decoded.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:/i.test(decoded) ||
      /[\r\n\t]/.test(decoded)
    ) {
      return true;
    }
  } catch {
    return true;
  }

  return false;
}

export function isSafeRelativePath(path = "") {
  const raw =
    limitUrlLike(path);

  if (!raw) {
    return false;
  }

  if (!raw.startsWith("/")) {
    return false;
  }

  if (raw.startsWith("//")) {
    return false;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return false;
  }

  if (/[\r\n\t]/.test(raw)) {
    return false;
  }

  if (hasEncodedOpenRedirectRisk(raw)) {
    return false;
  }

  return true;
}

export function sanitizeRedirectPath(
  path = DEFAULT_ROUTE,
  fallback = DEFAULT_ROUTE
) {
  const raw =
    limitUrlLike(path);

  const fallbackPath =
    isSafeRelativePath(fallback)
      ? normalizePublicPath(fallback)
      : DEFAULT_ROUTE;

  if (!isSafeRelativePath(raw)) {
    return fallbackPath;
  }

  const candidate =
    normalizePublicPath(raw);

  if (!isSafeRelativePath(candidate)) {
    return fallbackPath;
  }

  return candidate;
}

export function buildSafeRedirectParam(path = DEFAULT_ROUTE) {
  return encodeURIComponent(
    sanitizeRedirectPath(
      path,
      DEFAULT_ROUTE
    )
  );
}

/* =========================================================
   USER / SLUG
========================================================= */

export function sanitizeUsername(value = "") {
  const delegated =
    coreSanitizeUsername(value);

  if (delegated) {
    return delegated;
  }

  const max =
    clampNumber(
      AUTH_CONSTANTS?.usernameMaxLength ??
        AUTH_CONSTANTS?.identifierMaxLength ??
        SAFE_USERNAME_FALLBACK_MAX,
      1,
      160
    );

  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .toLowerCase()
    .slice(0, max);
}

export function slugify(value = "") {
  const delegated =
    coreSlugify(value);

  if (delegated) {
    return delegated;
  }

  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, SAFE_SLUG_MAX);
}

/* =========================================================
   TOKENS / SESSION VALUES
========================================================= */

function getTokenMaxLength(maxLength = AUTH_CONSTANTS?.tokenMaxLength) {
  return clampNumber(
    maxLength ?? SAFE_TOKEN_FALLBACK_MAX,
    1,
    32768
  ) || SAFE_TOKEN_FALLBACK_MAX;
}

function getSessionMaxLength(maxLength = AUTH_CONSTANTS?.sessionValueMaxLength) {
  return clampNumber(
    maxLength ?? SAFE_SESSION_VALUE_FALLBACK_MAX,
    1,
    SAFE_SESSION_VALUE_ABSOLUTE_MAX
  ) || SAFE_SESSION_VALUE_FALLBACK_MAX;
}

export function normalizeTokenValue(
  token = null,
  maxLength = AUTH_CONSTANTS?.tokenMaxLength
) {
  if (
    token === null ||
    token === undefined
  ) {
    return null;
  }

  let normalized =
    String(token)
      .normalize("NFKC")
      .trim()
      .replace(/[\r\n\t]/g, "");

  if (/^bearer\s+/i.test(normalized)) {
    normalized =
      normalized.replace(/^bearer\s+/i, "")
        .trim();
  }

  if (
    !normalized ||
    isCorruptedTextValue(normalized)
  ) {
    return null;
  }

  /*
    Regla dura:
    no truncamos tokens. Si excede, es corrupto.
  */
  if (normalized.length > getTokenMaxLength(maxLength)) {
    return null;
  }

  return normalized;
}

export function normalizeSessionValue(
  value = null,
  maxLength = AUTH_CONSTANTS?.sessionValueMaxLength
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const normalized =
    String(value)
      .normalize("NFKC")
      .trim()
      .replace(/[\r\n\t]/g, "");

  if (
    !normalized ||
    isCorruptedTextValue(normalized)
  ) {
    return null;
  }

  return normalized.slice(
    0,
    getSessionMaxLength(maxLength)
  );
}

export function hasValidToken(token = AppCore?.state?.token) {
  return Boolean(
    normalizeTokenValue(token)
  );
}

function getTokenParamNames(type = "generic") {
  const cleanType =
    safeText(type, "generic");

  const fromConstants =
    AUTH_TOKEN_PARAM_NAMES?.[cleanType];

  if (
    Array.isArray(fromConstants) &&
    fromConstants.length
  ) {
    return fromConstants;
  }

  return FALLBACK_TOKEN_PARAM_NAMES[cleanType] ||
    FALLBACK_TOKEN_PARAM_NAMES.generic;
}

function getAllTokenParamNames() {
  try {
    return unique([
      ...Object.values(FALLBACK_TOKEN_PARAM_NAMES).flat(),
      ...Object.values(AUTH_TOKEN_PARAM_NAMES || {}).flat(),
    ]);
  } catch {
    return unique(
      Object.values(FALLBACK_TOKEN_PARAM_NAMES).flat()
    );
  }
}

export function hasTokenInSearch(search = "", names = []) {
  const finalNames =
    Array.isArray(names) && names.length
      ? names
      : getTokenParamNames("generic");

  try {
    const params =
      new URLSearchParams(search || "");

    return finalNames.some((name) =>
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

export function extractTokenFromSearch(search = "", names = []) {
  const finalNames =
    Array.isArray(names) && names.length
      ? names
      : getTokenParamNames("generic");

  try {
    const params =
      new URLSearchParams(search || "");

    for (const name of finalNames) {
      const value =
        normalizeTokenValue(
          params.get(name)
        );

      if (value) {
        return value;
      }
    }
  } catch {}

  return null;
}

export function extractPathToken(path = "", basePath = "") {
  const normalized =
    normalizePublicPath(path);

  const clean =
    normalizeCanonicalPath(normalized);

  const base =
    normalizeCanonicalPath(basePath);

  if (
    !base ||
    !clean.startsWith(`${base}/`)
  ) {
    return null;
  }

  const token =
    clean
      .slice(`${base}/`.length)
      .split("/")[0];

  try {
    return normalizeTokenValue(
      decodeURIComponent(token || "")
    );
  } catch {
    return normalizeTokenValue(token);
  }
}

function extractTokenFromHashQuery(hash = "", names = []) {
  const cleanHash =
    safeText(hash, "");

  if (
    !cleanHash ||
    !cleanHash.includes("?")
  ) {
    return null;
  }

  const query =
    cleanHash
      .split("?")
      .slice(1)
      .join("?");

  return extractTokenFromSearch(
    query ? `?${query}` : "",
    names
  );
}

export function extractActivationToken(pathOrUrl = getCurrentPublicPath()) {
  const path =
    pathFromUrlLike(pathOrUrl);

  const pathToken =
    extractPathToken(
      path,
      "/activate-account"
    );

  if (pathToken) {
    return pathToken;
  }

  const {
    search,
    hash,
  } =
    splitPath(path);

  const fromSearch =
    extractTokenFromSearch(
      search,
      getTokenParamNames("activation")
    );

  if (fromSearch) {
    return fromSearch;
  }

  return extractTokenFromHashQuery(
    hash,
    getTokenParamNames("activation")
  );
}

export function extractResetToken(pathOrUrl = getCurrentPublicPath()) {
  const path =
    pathFromUrlLike(pathOrUrl);

  const pathToken =
    extractPathToken(
      path,
      "/reset-password/confirm"
    );

  if (pathToken) {
    return pathToken;
  }

  const {
    search,
    hash,
  } =
    splitPath(path);

  const fromSearch =
    extractTokenFromSearch(
      search,
      getTokenParamNames("reset")
    );

  if (fromSearch) {
    return fromSearch;
  }

  return extractTokenFromHashQuery(
    hash,
    getTokenParamNames("reset")
  );
}

export function hasActivationToken(pathOrUrl = getCurrentPublicPath()) {
  return Boolean(
    extractActivationToken(pathOrUrl)
  );
}

export function hasResetToken(pathOrUrl = getCurrentPublicPath()) {
  return Boolean(
    extractResetToken(pathOrUrl)
  );
}

/* =========================================================
   REDACTION
========================================================= */

function redactQueryTokens(value = "") {
  let output =
    safeText(value, "");

  const names =
    getAllTokenParamNames();

  for (const name of names) {
    const escapedName =
      escapeRegExp(name);

    try {
      output = output.replace(
        new RegExp(`([?&#]${escapedName}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  return output;
}

function redactJsonTokenFields(value = "") {
  let output =
    safeText(value, "");

  const names =
    unique([
      ...getAllTokenParamNames(),
      "authorization",
      "password",
      "secret",
      "otp",
      "totp",
    ]);

  for (const name of names) {
    const escapedName =
      escapeRegExp(name);

    try {
      output = output.replace(
        new RegExp(`("${escapedName}"\\s*:\\s*")([^"]+)(")`, "gi"),
        "$1***$3"
      );
    } catch {}

    try {
      output = output.replace(
        new RegExp(`('${escapedName}'\\s*:\\s*')([^']+)(')`, "gi"),
        "$1***$3"
      );
    } catch {}
  }

  return output;
}

function redactTechnicalPathTokens(value = "") {
  let output =
    safeText(value, "");

  for (const path of TECHNICAL_TOKEN_PATHS) {
    const escapedPath =
      escapeRegExp(path);

    try {
      output = output.replace(
        new RegExp(`(${escapedPath}/)([^/?#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  return output;
}

export function redactTokenInText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  output =
    redactQueryTokens(output);

  output =
    redactTechnicalPathTokens(output);

  output =
    redactJsonTokenFields(output);

  try {
    output = output.replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    );
  } catch {}

  return output;
}

/* =========================================================
   ERROR HELPERS
========================================================= */

export function extractMessage(error) {
  if (!error) {
    return "Error de autenticación";
  }

  if (typeof error === "string") {
    return safeText(
      redactTokenInText(error),
      "Error de autenticación"
    );
  }

  const candidates = [
    error?.data?.message,
    error?.data?.mensaje,
    error?.data?.detail,
    error?.data?.error,
    error?.data?.title,
    error?.data?.description,

    error?.response?.data?.message,
    error?.response?.data?.mensaje,
    error?.response?.data?.detail,
    error?.response?.data?.error,
    error?.response?.data?.title,
    error?.response?.data?.description,

    error?.body?.message,
    error?.body?.mensaje,
    error?.body?.detail,
    error?.body?.error,

    error?.payload?.message,
    error?.payload?.mensaje,
    error?.payload?.error,

    error?.result?.message,
    error?.result?.mensaje,
    error?.result?.error,

    error?.message,
    error?.statusText,
    error?.reason?.message,
    error?.reason,
  ];

  for (const item of candidates) {
    const text =
      safeText(item, "");

    if (text) {
      return redactTokenInText(text);
    }
  }

  return "Error de autenticación";
}

export function buildErrorPayload(error) {
  return {
    error,
    message:
      extractMessage(error),
  };
}

export function buildSafeErrorPayload(error) {
  return {
    message:
      extractMessage(error),

    name:
      error?.name || "Error",

    status:
      error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      error?.data?.status ||
      0,

    code:
      error?.code ||
      error?.data?.code ||
      error?.response?.data?.code ||
      null,
  };
}

/* =========================================================
   PAYLOAD HELPERS
========================================================= */

export function compactPayload(payload = {}) {
  if (!isObject(payload)) {
    return {};
  }

  return Object.entries(payload).reduce(
    (acc, [key, value]) => {
      if (
        value === undefined ||
        value === null ||
        value === ""
      ) {
        return acc;
      }

      acc[key] = value;
      return acc;
    },
    {}
  );
}

export function sanitizeAuthPayload(payload = {}, depth = 0) {
  if (depth > 5) {
    return "[MaxDepth]";
  }

  if (Array.isArray(payload)) {
    return payload.map((item) =>
      sanitizeAuthPayload(
        item,
        depth + 1
      )
    );
  }

  if (!isObject(payload)) {
    return typeof payload === "string"
      ? redactTokenInText(payload)
      : payload;
  }

  const output = {};

  for (const [key, value] of Object.entries(payload)) {
    const lower =
      safeLower(key);

    if (
      lower.includes("token") ||
      lower.includes("authorization") ||
      lower.includes("password") ||
      lower.includes("secret") ||
      lower === "code" ||
      lower === "otp" ||
      lower === "totp"
    ) {
      output[key] =
        value ? "***" : value;

      continue;
    }

    output[key] =
      sanitizeAuthPayload(
        value,
        depth + 1
      );
  }

  return output;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getAuthHelpersSnapshot() {
  const publicPath =
    getCurrentPublicPath();

  return {
    version:
      AUTH_HELPERS_VERSION,

    publicPath:
      redactTokenInText(publicPath),

    canonicalPath:
      normalizeCanonicalPath(publicPath),

    isAuthRoute:
      isAuthRoute(publicPath),

    isPublicTechnicalRoute:
      isPublicTechnicalRoute(publicPath),

    isActivationRoute:
      isActivationRoute(publicPath),

    isResetPasswordRoute:
      isResetPasswordRoute(publicPath),

    isResetPasswordConfirmRoute:
      isResetPasswordConfirmRoute(publicPath),

    isForgotPasswordRoute:
      isForgotPasswordRoute(publicPath),

    isTwoFactorRoute:
      isTwoFactorRoute(publicPath),

    hasActivationToken:
      hasActivationToken(publicPath),

    hasResetToken:
      hasResetToken(publicPath),

    hasAppCore:
      Boolean(AppCore),

    hasCoreUtils:
      Boolean(AppCore?.utils),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  isBrowser,

  safeText,
  safeNumber,
  safeInt,
  clampNumber,
  safeBool,
  isObject,
  isPlainObject,
  isFn,
  safeArray,
  safeClone,

  isHashRouterPath,
  normalizeHashRouterPath,
  normalizePathnameOnly,
  splitPath,
  fallbackNormalizePath,
  stripSearchAndHash,
  getSearchAndHash,
  stripUsernamePrefix,

  normalizePath,
  normalizePublicPath,
  normalizeCanonicalPath,
  pathFromUrlLike,

  getCurrentPublicPath,
  getCurrentCanonicalPath,
  configLikeRoute,

  isAuthRoute,
  isPublicTechnicalRoute,
  isActivationRoute,
  isResetPasswordRoute,
  isResetPasswordConfirmRoute,
  isForgotPasswordRoute,
  isTwoFactorRoute,

  isSafeRelativePath,
  sanitizeRedirectPath,
  buildSafeRedirectParam,

  sanitizeUsername,
  slugify,

  normalizeTokenValue,
  normalizeSessionValue,
  hasValidToken,

  hasTokenInSearch,
  extractTokenFromSearch,
  extractPathToken,
  extractActivationToken,
  extractResetToken,
  hasActivationToken,
  hasResetToken,

  redactTokenInText,

  extractMessage,
  buildErrorPayload,
  buildSafeErrorPayload,

  compactPayload,
  sanitizeAuthPayload,
  getAuthHelpersSnapshot,
};
