/* =========================================================
   Onion SPA - Auth Helpers
   Archivo: src/features/auth/helpers.js

   Responsabilidades:
   - helpers base auth
   - normalización paths
   - saneado username / slug / tokens
   - extracción segura mensajes error
   - detección rutas auth
   - detección rutas públicas técnicas
   - validación redirects internos
   - endurecer strings / urls / payloads backend

   HARDENING EXTREMO:
   - tolerancia total a AppCore parcial
   - unicode safe
   - anti open redirect
   - helpers reutilizables SPA
   - soporte hash-router /#/...
   - soporte hashbang #!/...
   - canonical sin query/hash
   - publicPath con query/hash
   - redacción de tokens en logs/eventos
   - token/session values limitados
   - cero throws accidentales
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  AUTH_CONSTANTS,
  AUTH_PUBLIC_TECHNICAL_ROUTES,
  AUTH_TOKEN_PARAM_NAMES,
} from "./constants.js";

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

export function clampNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
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
    return value === 1;
  }

  const text =
    safeText(value, "").toLowerCase();

  if (
    [
      "true",
      "1",
      "yes",
      "si",
      "sí",
      "ok",
    ].includes(text)
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
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

export function isFn(value) {
  return typeof value === "function";
}

export function safeClone(value, fallback = null) {
  try {
    if (
      typeof AppCore?.utils?.safeClone === "function"
    ) {
      return AppCore.utils.safeClone(
        value,
        fallback
      );
    }
  } catch {}

  try {
    if (
      typeof structuredClone === "function"
    ) {
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

/* =========================================================
   APPCORE DELEGATES
========================================================= */

function coreNormalizePath(value) {
  try {
    if (
      typeof AppCore?.utils?.normalizePath === "function"
    ) {
      return AppCore.utils.normalizePath(value);
    }
  } catch {}

  return null;
}

function coreNormalizeCanonicalPath(value) {
  try {
    if (
      typeof AppCore?.utils?.normalizeCanonicalPath === "function"
    ) {
      return AppCore.utils.normalizeCanonicalPath(value);
    }
  } catch {}

  return null;
}

function coreSanitizeUsername(value) {
  try {
    if (
      typeof AppCore?.utils?.sanitizeUsername === "function"
    ) {
      return AppCore.utils.sanitizeUsername(value);
    }
  } catch {}

  return null;
}

function coreSlugify(value) {
  try {
    if (
      typeof AppCore?.utils?.slugify === "function"
    ) {
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

  return "http://localhost";
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
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || "/";
  }

  return raw.replace(/^#\/?/, "/") || "/";
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

export function normalizePathnameOnly(pathname = "/") {
  let value =
    String(pathname || "/")
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  const segments =
    value.split("/");

  const normalizedSegments = [];

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
    `/${normalizedSegments.join("/")}` || "/";

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

export function splitPath(path = "/") {
  const raw =
    safeText(path, "/") || "/";

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
      pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search =
      pathname.slice(searchIndex);

    pathname =
      pathname.slice(0, searchIndex) || "/";
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

export function fallbackNormalizePath(value = "/") {
  const raw =
    safeText(value, "/") || "/";

  if (isHashRouterPath(raw)) {
    return fallbackNormalizePath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed =
        new URL(raw, getBaseOrigin());

      if (
        parsed.hash &&
        isHashRouterPath(parsed.hash)
      ) {
        return fallbackNormalizePath(
          normalizeHashRouterPath(parsed.hash)
        );
      }

      return fallbackNormalizePath(
        `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {}

  const {
    pathname,
    search,
    hash,
  } = splitPath(raw);

  return `${pathname}${search}${hash}`;
}

export function stripSearchAndHash(path = "/") {
  const {
    pathname,
  } = splitPath(
    fallbackNormalizePath(path)
  );

  return pathname || "/";
}

export function getSearchAndHash(path = "/") {
  const {
    search,
    hash,
  } = splitPath(
    fallbackNormalizePath(path)
  );

  return `${search || ""}${hash || ""}`;
}

export function normalizePath(path = "/") {
  const raw =
    safeText(path, "/") || "/";

  const fallback =
    fallbackNormalizePath(raw);

  /*
    Si el path trae query/hash, no delegamos a AppCore:
    algunos normalizadores internos pueden comerse ?token=...
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

export function normalizeCanonicalPath(path = "/") {
  const raw =
    safeText(path, "/") || "/";

  const fallback =
    stripSearchAndHash(
      fallbackNormalizePath(raw)
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
        fallbackNormalizePath(delegated)
      )
    : fallback;
}

export function pathFromUrlLike(value = "") {
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
      new URL(raw, getBaseOrigin());

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      return fallbackNormalizePath(
        normalizeHashRouterPath(parsed.hash)
      );
    }

    return fallbackNormalizePath(
      `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
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
    return normalizePath(
      AppCore?.state?.publicPath ||
      AppCore?.state?.route ||
      "/"
    );
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
        normalizeHashRouterPath(hash)
      );
    }

    return normalizePath(
      `${pathname}${search}${hash}`
    );
  } catch {
    return normalizePath(
      AppCore?.state?.publicPath ||
      AppCore?.state?.route ||
      "/"
    );
  }
}

export function getCurrentCanonicalPath() {
  return normalizeCanonicalPath(
    getCurrentPublicPath()
  );
}

export function configLikeRoute(path = "/") {
  return normalizePath(path || "/");
}

/* =========================================================
   ROUTE DETECTION
========================================================= */

export function isAuthRoute(
  pathname = isBrowser()
    ? window.location.pathname
    : "/"
) {
  const path =
    normalizeCanonicalPath(pathname)
      .toLowerCase();

  return [
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
    "/2fa",
    "/otp",
  ].some((candidate) =>
    path === candidate ||
    path.startsWith(`${candidate}/`)
  );
}

export function isPublicTechnicalRoute(path = getCurrentPublicPath()) {
  const normalized =
    normalizeCanonicalPath(path)
      .toLowerCase();

  const routes =
    Array.isArray(AUTH_PUBLIC_TECHNICAL_ROUTES)
      ? AUTH_PUBLIC_TECHNICAL_ROUTES
      : [
          "/activate-account",
          "/reset-password",
          "/reset-password/confirm",
          "/forgot-password",
          "/recover-password",
          "/password-reset",
        ];

  return routes.some((route) => {
    const cleanRoute =
      normalizeCanonicalPath(route)
        .toLowerCase();

    return (
      normalized === cleanRoute ||
      normalized.startsWith(`${cleanRoute}/`)
    );
  });
}

export function isActivationRoute(path = getCurrentPublicPath()) {
  const normalized =
    normalizeCanonicalPath(path)
      .toLowerCase();

  return (
    normalized === "/activate-account" ||
    normalized.startsWith("/activate-account/")
  );
}

export function isResetPasswordConfirmRoute(path = getCurrentPublicPath()) {
  const normalized =
    normalizeCanonicalPath(path)
      .toLowerCase();

  return (
    normalized === "/reset-password/confirm" ||
    normalized.startsWith("/reset-password/confirm/")
  );
}

/* =========================================================
   REDIRECT SAFETY
========================================================= */

export function isSafeRelativePath(path = "") {
  const raw =
    safeText(path, "");

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

  return true;
}

export function sanitizeRedirectPath(path = "/", fallback = "/") {
  const candidate =
    normalizePath(path || fallback);

  if (isSafeRelativePath(candidate)) {
    return candidate;
  }

  return normalizePath(fallback || "/");
}

export function buildSafeRedirectParam(path = "/") {
  return encodeURIComponent(
    sanitizeRedirectPath(path, "/")
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

  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase()
    .slice(
      0,
      clampNumber(
        AUTH_CONSTANTS?.identifierMaxLength,
        1,
        160
      )
    );
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
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

/* =========================================================
   TOKENS / SESSION VALUES
========================================================= */

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

  const normalized =
    String(token)
      .trim()
      .replace(/[\r\n\t]/g, "")
      .slice(
        0,
        clampNumber(
          maxLength,
          1,
          32768
        )
      );

  return normalized || null;
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
      .replace(/[\r\n\t]/g, "")
      .slice(
        0,
        clampNumber(
          maxLength,
          1,
          1024
        )
      );

  return normalized || null;
}

export function hasValidToken(token = AppCore?.state?.token) {
  return Boolean(
    normalizeTokenValue(token)
  );
}

export function hasTokenInSearch(search = "", names = []) {
  const finalNames =
    Array.isArray(names) && names.length
      ? names
      : AUTH_TOKEN_PARAM_NAMES?.generic || [
          "token",
          "code",
          "t",
        ];

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
      : AUTH_TOKEN_PARAM_NAMES?.generic || [
          "token",
          "code",
          "t",
        ];

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
    normalizePath(path);

  const clean =
    normalizeCanonicalPath(normalized);

  const base =
    normalizeCanonicalPath(basePath);

  if (!base || !clean.startsWith(`${base}/`)) {
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
  } = splitPath(path);

  const fromSearch =
    extractTokenFromSearch(
      search,
      AUTH_TOKEN_PARAM_NAMES?.activation
    );

  if (fromSearch) {
    return fromSearch;
  }

  if (hash && hash.includes("?")) {
    const query =
      hash
        .split("?")
        .slice(1)
        .join("?");

    return extractTokenFromSearch(
      query ? `?${query}` : "",
      AUTH_TOKEN_PARAM_NAMES?.activation
    );
  }

  return null;
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
  } = splitPath(path);

  const fromSearch =
    extractTokenFromSearch(
      search,
      AUTH_TOKEN_PARAM_NAMES?.reset
    );

  if (fromSearch) {
    return fromSearch;
  }

  if (hash && hash.includes("?")) {
    const query =
      hash
        .split("?")
        .slice(1)
        .join("?");

    return extractTokenFromSearch(
      query ? `?${query}` : "",
      AUTH_TOKEN_PARAM_NAMES?.reset
    );
  }

  return null;
}

/* =========================================================
   REDACTION
========================================================= */

export function redactTokenInText(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  let output =
    raw;

  try {
    output = output.replace(
      /([?&](?:token|activationToken|activateToken|resetToken|passwordResetToken|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(\/activate-account\/)([^/?#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
      "$1***"
    );

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
      error,
      "Error de autenticación"
    );
  }

  const candidates = [
    error?.data?.message,
    error?.data?.mensaje,
    error?.data?.detail,
    error?.data?.error,
    error?.data?.title,

    error?.response?.data?.message,
    error?.response?.data?.mensaje,
    error?.response?.data?.detail,
    error?.response?.data?.error,
    error?.response?.data?.title,

    error?.body?.message,
    error?.body?.error,

    error?.message,
    error?.statusText,
    error?.reason?.message,
    error?.reason,
  ];

  for (const item of candidates) {
    const text =
      safeText(item, "");

    if (text) {
      return text;
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
      error?.status || 0,

    code:
      error?.code ||
      error?.data?.code ||
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

export function getAuthHelpersSnapshot() {
  const publicPath =
    getCurrentPublicPath();

  return {
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

    isResetPasswordConfirmRoute:
      isResetPasswordConfirmRoute(publicPath),

    hasActivationToken:
      Boolean(extractActivationToken(publicPath)),

    hasResetToken:
      Boolean(extractResetToken(publicPath)),

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
  isFn,
  safeClone,

  isHashRouterPath,
  normalizeHashRouterPath,
  normalizePathnameOnly,
  splitPath,
  fallbackNormalizePath,
  stripSearchAndHash,
  getSearchAndHash,

  normalizePath,
  normalizeCanonicalPath,
  pathFromUrlLike,

  getCurrentPublicPath,
  getCurrentCanonicalPath,
  configLikeRoute,

  isAuthRoute,
  isPublicTechnicalRoute,
  isActivationRoute,
  isResetPasswordConfirmRoute,

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

  redactTokenInText,

  extractMessage,
  buildErrorPayload,
  buildSafeErrorPayload,

  compactPayload,
  getAuthHelpersSnapshot,
};
