/* =========================================================
   Onion Support - Auth Constants
   Archivo: /src/features/auth/constants.js

   Responsabilidad:
   - Contrato estático mínimo de Auth.
   - Backend real bajo /api/auth desde core/config.js.
   - /api/auth/me siempre privado.
   - Token param único desde core/config.js.
   - Rutas públicas reales actuales desde core/config.js.
   - Home visible de usuario: /@{user.slug}.
   - Roles únicos: admin / user.
   - Delegar rutas, user-scope, bloqueos y slug en core/config.js.
   - Sin AppCore.
   - Sin CoreHttp.
   - Sin Router.
   - Sin Toast.
   - Sin storage runtime.
   - Sin 2FA/MFA/OTP.
   - Sin aliases legacy masivos.
========================================================= */

import {
  AUTH_ENDPOINTS as CORE_AUTH_ENDPOINTS,
  PUBLIC_API_PATHS,
  PRIVATE_API_PATHS,
  PUBLIC_ROUTES,
  ROUTES,
  TOKEN_PARAM,
  USER_HOME_PREFIX,

  buildUserHomeRoute as coreBuildUserHomeRoute,
  canonicalRoutePath as coreCanonicalRoutePath,
  getUserScopedRouteInfo as coreGetUserScopedRouteInfo,
  isBlockedRoutePath as coreIsBlockedRoutePath,
  isUserHomeRoute as coreIsUserHomeRoute,
  normalizeRoutePath as coreNormalizeRoutePath,
  normalizeUserSlug as coreNormalizeUserSlug,
  routePathFromUrlLike as coreRoutePathFromUrlLike,
} from "../../core/config.js";

export const AUTH_CONSTANTS_VERSION = "auth.constants.v5";
export const AUTH_MODULE_VERSION = AUTH_CONSTANTS_VERSION;

const DEFAULT_ROUTE = ROUTES.home || ROUTES.root || "/";
const USER_PREFIX = USER_HOME_PREFIX || "/@";

function freeze(value) {
  try {
    return Object.freeze(value);
  } catch {
    return value;
  }
}

/* =========================================================
   BASIC HELPERS
========================================================= */

export function safeText(value, fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

export function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function safeInt(value, fallback = 0) {
  return Math.trunc(safeNumber(value, fallback));
}

export function safeBool(value, fallback = false) {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;

  const clean = safeText(value, "").toLowerCase();

  if (["true", "yes", "si", "sí", "on"].includes(clean)) return true;
  if (["false", "no", "off"].includes(clean)) return false;

  return Boolean(fallback);
}

export function clampNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = safeNumber(value, min);
  return Math.min(Math.max(number, min), max);
}

/* =========================================================
   PATH HELPERS
========================================================= */

function fallbackPathFromUrlLike(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";

  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  if (raw.startsWith("#/")) return raw.slice(1) || DEFAULT_ROUTE;

  if (raw.startsWith("//")) return DEFAULT_ROUTE;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw, "http://localhost");
      return `${url.pathname || DEFAULT_ROUTE}${url.search || ""}${url.hash || ""}`;
    } catch {
      return DEFAULT_ROUTE;
    }
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return DEFAULT_ROUTE;

  return raw;
}

function fallbackNormalizeRoutePath(path = "") {
  let value = safeText(path, "");

  if (!value) return "";

  if (value.startsWith("#!")) {
    value = value.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  } else if (value.startsWith("#/")) {
    value = value.slice(1) || DEFAULT_ROUTE;
  }

  if (value.startsWith("//")) return DEFAULT_ROUTE;

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value, "http://localhost");
      value = `${url.pathname || DEFAULT_ROUTE}${url.search || ""}${url.hash || ""}`;
    } catch {
      return DEFAULT_ROUTE;
    }
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return DEFAULT_ROUTE;
  }

  value = value
    .split("?")[0]
    .split("#")[0]
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  const parts = [];

  for (const part of value.split("/")) {
    if (!part || part === ".") continue;

    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  value = `/${parts.join("/")}`;

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || DEFAULT_ROUTE;
  }

  return value || DEFAULT_ROUTE;
}

export function pathFromUrlLike(value = "") {
  try {
    return coreRoutePathFromUrlLike(value) || "";
  } catch {
    return fallbackPathFromUrlLike(value);
  }
}

export function normalizeEndpointPath(path = "") {
  const raw = pathFromUrlLike(path);

  if (!raw) return "";

  try {
    return coreNormalizeRoutePath(raw) || "";
  } catch {
    return fallbackNormalizeRoutePath(raw);
  }
}

export function normalizeRoutePath(path = "") {
  return normalizeEndpointPath(path);
}

function isBlockedAuthRoute(path = "") {
  try {
    if (coreIsBlockedRoutePath(path) === true) return true;
  } catch {
    // fallback abajo
  }

  const clean = normalizeRoutePath(path).toLowerCase();

  if (
    clean === "/home" ||
    clean.startsWith("/home/") ||
    clean === "/403" ||
    clean.startsWith("/403/") ||
    clean === "/404" ||
    clean.startsWith("/404/") ||
    clean === "/2fa" ||
    clean.startsWith("/2fa/") ||
    clean === "/mfa" ||
    clean.startsWith("/mfa/") ||
    clean === "/otp" ||
    clean.startsWith("/otp/")
  ) {
    return true;
  }

  const scoped = getUserScopedRouteInfo(clean);

  return Boolean(scoped.scoped && isBlockedAuthRoute(scoped.restPath));
}

function endpointInList(path = "", list = []) {
  const clean = normalizeEndpointPath(path);

  if (!clean) return false;

  return list.some((item) => {
    const endpoint = normalizeEndpointPath(item);
    return clean === endpoint;
  });
}

/* =========================================================
   USER HOME / USER SCOPE
========================================================= */

export function normalizeUserSlug(value = "") {
  try {
    return coreNormalizeUserSlug(value) || "";
  } catch {
    const slug = safeText(value, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^\/+/, "")
      .replace(/^@+/, "")
      .split(/[/?#]/)[0]
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .toLowerCase();

    if (!slug) return "";

    return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
  }
}

export function getUserScopedRouteInfo(path = "") {
  try {
    const info = coreGetUserScopedRouteInfo(path);

    if (info && typeof info === "object") {
      const restPath = normalizeRoutePath(
        info.restPath ||
          info.canonicalPath ||
          path ||
          DEFAULT_ROUTE
      );

      const canonicalPath = normalizeRoutePath(
        info.canonicalPath ||
          info.lookupPath ||
          restPath ||
          DEFAULT_ROUTE
      );

      return {
        scoped: Boolean(info.scoped),
        home: Boolean(info.home),
        slug: normalizeUserSlug(info.slug || ""),
        restPath,
        canonicalPath,
        lookupPath: canonicalPath,
      };
    }
  } catch {
    // fallback abajo
  }

  const route = normalizeRoutePath(path);

  if (!route.startsWith(USER_PREFIX)) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: route || DEFAULT_ROUTE,
      canonicalPath: route || DEFAULT_ROUTE,
      lookupPath: route || DEFAULT_ROUTE,
    };
  }

  const rest = route.slice(USER_PREFIX.length);
  const [slugSegment = "", ...segments] = rest.split("/");
  const slug = normalizeUserSlug(slugSegment);

  if (!slug) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: route,
      canonicalPath: route,
      lookupPath: route,
    };
  }

  const restPath = segments.length
    ? normalizeRoutePath(`/${segments.join("/")}`)
    : DEFAULT_ROUTE;

  return {
    scoped: true,
    home: restPath === DEFAULT_ROUTE,
    slug,
    restPath,
    canonicalPath: restPath,
    lookupPath: restPath,
  };
}

export function extractUserHomeSlugFromRoute(path = "") {
  const info = getUserScopedRouteInfo(path);
  return info.home ? normalizeUserSlug(info.slug) : "";
}

export function isUserHomeRoute(path = "") {
  try {
    return coreIsUserHomeRoute(path) === true;
  } catch {
    return Boolean(extractUserHomeSlugFromRoute(path));
  }
}

export function buildUserHomeRoute(slug = "") {
  try {
    return coreBuildUserHomeRoute(slug) || DEFAULT_ROUTE;
  } catch {
    const clean = normalizeUserSlug(slug);
    return clean ? `${USER_PREFIX}${clean}` : DEFAULT_ROUTE;
  }
}

export function canonicalAuthRoutePath(path = "") {
  if (isBlockedAuthRoute(path)) return "";

  try {
    return coreCanonicalRoutePath(path) || DEFAULT_ROUTE;
  } catch {
    const info = getUserScopedRouteInfo(path);
    return info.scoped ? info.canonicalPath : normalizeRoutePath(path);
  }
}

/* =========================================================
   API ENDPOINTS
========================================================= */

export const LOGIN_ENDPOINT = CORE_AUTH_ENDPOINTS.login;
export const LOGOUT_ENDPOINT = CORE_AUTH_ENDPOINTS.logout;
export const LOGOUT_ALL_ENDPOINT = CORE_AUTH_ENDPOINTS.logoutAll;
export const ME_ENDPOINT = CORE_AUTH_ENDPOINTS.me;
export const REFRESH_ENDPOINT = CORE_AUTH_ENDPOINTS.refresh;

export const ACTIVATE_ACCOUNT_ENDPOINT =
  CORE_AUTH_ENDPOINTS.activateAccount ||
  CORE_AUTH_ENDPOINTS.activate;

export const REQUEST_RESET_ENDPOINT = CORE_AUTH_ENDPOINTS.requestPasswordReset;
export const CONFIRM_RESET_ENDPOINT = CORE_AUTH_ENDPOINTS.confirmPasswordReset;

export const AUTH_ENDPOINTS = freeze({
  login: LOGIN_ENDPOINT,

  logout: LOGOUT_ENDPOINT,
  logoutAll: LOGOUT_ALL_ENDPOINT,

  me: ME_ENDPOINT,
  refresh: REFRESH_ENDPOINT,

  activate: ACTIVATE_ACCOUNT_ENDPOINT,
  activateAccount: ACTIVATE_ACCOUNT_ENDPOINT,

  requestPasswordReset: REQUEST_RESET_ENDPOINT,
  confirmPasswordReset: CONFIRM_RESET_ENDPOINT,
});

export const AUTH_ENDPOINT_GROUPS = freeze({
  public: freeze([...PUBLIC_API_PATHS]),
  private: freeze([...PRIVATE_API_PATHS]),

  session: freeze([
    LOGIN_ENDPOINT,
    LOGOUT_ENDPOINT,
    LOGOUT_ALL_ENDPOINT,
    ME_ENDPOINT,
    REFRESH_ENDPOINT,
  ].filter(Boolean)),

  activation: freeze([
    ACTIVATE_ACCOUNT_ENDPOINT,
  ].filter(Boolean)),

  passwordReset: freeze([
    REQUEST_RESET_ENDPOINT,
    CONFIRM_RESET_ENDPOINT,
  ].filter(Boolean)),
});

export const AUTH_PUBLIC_API_PATHS = freeze([...PUBLIC_API_PATHS]);
export const AUTH_PRIVATE_API_PATHS = freeze([...PRIVATE_API_PATHS]);

/* =========================================================
   SPA ROUTES
========================================================= */

export const LOGIN_ROUTE = ROUTES.login;
export const PASSWORD_REQUEST_ROUTE = ROUTES.passwordRequest;
export const PASSWORD_RESET_ROUTE = ROUTES.passwordReset;
export const ACTIVATE_ACCOUNT_ROUTE = ROUTES.activateAccount;

export const AUTH_PUBLIC_TECHNICAL_ROUTES = freeze([...PUBLIC_ROUTES]);

/* =========================================================
   TOKEN PARAMS
========================================================= */

export const AUTH_TOKEN_PARAM_NAMES = freeze({
  generic: freeze([TOKEN_PARAM]),
  auth: freeze([TOKEN_PARAM]),
  activation: freeze([TOKEN_PARAM]),
  reset: freeze([TOKEN_PARAM]),
});

/* =========================================================
   REQUEST OPTIONS
========================================================= */

export const AUTH_PUBLIC_REQUEST_OPTIONS = freeze({
  public: true,
  auth: false,
  skipAuth: true,
  noAuthHeader: true,
  retries: 0,
});

export const AUTH_PRIVATE_REQUEST_OPTIONS = freeze({
  public: false,
  auth: true,
  skipAuth: false,
  noAuthHeader: false,
});

export const AUTH_REFRESH_REQUEST_OPTIONS = freeze({
  ...AUTH_PUBLIC_REQUEST_OPTIONS,
  silent: true,
});

export function getPublicAuthRequestOptions(extra = {}) {
  return {
    ...AUTH_PUBLIC_REQUEST_OPTIONS,
    ...(extra && typeof extra === "object" ? extra : {}),
  };
}

export function getPrivateAuthRequestOptions(extra = {}) {
  return {
    ...AUTH_PRIVATE_REQUEST_OPTIONS,
    ...(extra && typeof extra === "object" ? extra : {}),
  };
}

export function getRefreshRequestOptions(extra = {}) {
  return {
    ...AUTH_REFRESH_REQUEST_OPTIONS,
    ...(extra && typeof extra === "object" ? extra : {}),
  };
}

/* =========================================================
   STORAGE KEYS
   Constantes mínimas. No storage runtime aquí.
========================================================= */

export const AUTH_STORAGE_KEYS = freeze({
  token: "token",
  accessToken: "access_token",
  refreshToken: "refresh_token",
  role: "role",
});

/* =========================================================
   LIMITS / ROLES / STATUS
========================================================= */

export const AUTH_CONSTANTS = freeze({
  identifierMaxLength: 160,
  usernameMaxLength: 80,
  emailMaxLength: 254,

  passwordMinLength: 8,
  passwordMaxLength: 1024,

  tokenMinLength: 8,
  tokenMaxLength: 8192,

  textValueMaxLength: 300,
  sessionValueMaxLength: 200,

  requestTimeout: 30000,
  loginTimeoutMs: 30000,
  authPublicTimeoutMs: 30000,
});

export const AUTH_FAILURE_CODES = freeze([
  "INVALID_CREDENTIALS",
  "MISSING_CREDENTIALS",
  "ACCOUNT_DISABLED",
  "USER_DISABLED",
  "UNAUTHORIZED",
  "FORBIDDEN",

  "TOKEN_INVALID",
  "INVALID_TOKEN",
  "TOKEN_EXPIRED",
  "TOKEN_MISSING",
  "MISSING_TOKEN",

  "SESSION_REQUIRED",
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
  "SESSION_INVALID",
  "SESSION_NOT_FOUND",
  "SESSION_USER_MISMATCH",

  "LOGIN_FAILED",
  "AUTH_FAILED",
  "AUTH_RESTORE_FAILED",
]);

export const AUTH_SUCCESS_STATUSES = freeze([
  "ok",
  "success",
  "authenticated",
  "active",
  "valid",
  "session",
  "refreshed",
]);

export const AUTH_ROLES = freeze(["admin", "user"]);

/* =========================================================
   RESOLVE HELPERS
========================================================= */

function resolveEndpointKey(key = "") {
  const clean = safeText(key, "");

  if (clean === "activateAccount") return "activate";
  if (clean === "accountActivation") return "activate";
  if (clean === "resetPasswordRequest") return "requestPasswordReset";
  if (clean === "confirmResetPassword") return "confirmPasswordReset";
  if (clean === "resetPasswordConfirm") return "confirmPasswordReset";

  return clean;
}

export function getAuthEndpoint(key = "", fallback = "") {
  const clean = resolveEndpointKey(key);
  const endpoint = AUTH_ENDPOINTS[clean];

  return typeof endpoint === "string" && endpoint ? endpoint : safeText(fallback, "");
}

export function getAuthEndpointCandidates(key = "", fallback = "") {
  const endpoint = getAuthEndpoint(key, fallback);
  return endpoint ? [endpoint] : [];
}

export function getAuthEndpointGroup(key = "") {
  const group = AUTH_ENDPOINT_GROUPS[safeText(key, "")];
  return Array.isArray(group) ? [...group] : [];
}

export function getAuthStorageKey(key = "", fallback = "") {
  const value = AUTH_STORAGE_KEYS[safeText(key, "")];
  return typeof value === "string" && value ? value : safeText(fallback, "");
}

export function getAuthConstant(key = "", fallback = null) {
  return Object.prototype.hasOwnProperty.call(AUTH_CONSTANTS, key)
    ? AUTH_CONSTANTS[key]
    : fallback;
}

/* =========================================================
   SPECIALIZED GETTERS
========================================================= */

export const getLoginEndpoint = () => LOGIN_ENDPOINT;
export const getLogoutEndpoint = () => LOGOUT_ENDPOINT;
export const getLogoutAllEndpoint = () => LOGOUT_ALL_ENDPOINT;
export const getMeEndpoint = () => ME_ENDPOINT;
export const getRefreshEndpoint = () => REFRESH_ENDPOINT;
export const getRefreshEndpointCandidates = () => [REFRESH_ENDPOINT];

export const getActivateAccountEndpoint = () => ACTIVATE_ACCOUNT_ENDPOINT;
export const getActivationEndpoint = getActivateAccountEndpoint;
export const getAccountActivationEndpoint = getActivateAccountEndpoint;
export const getActivateAccountEndpointCandidates = () => [ACTIVATE_ACCOUNT_ENDPOINT];

export const getRequestPasswordResetEndpoint = () => REQUEST_RESET_ENDPOINT;
export const getRequestPasswordResetEndpointCandidates = () => [REQUEST_RESET_ENDPOINT];

export const getConfirmPasswordResetEndpoint = () => CONFIRM_RESET_ENDPOINT;
export const getConfirmResetPasswordEndpoint = getConfirmPasswordResetEndpoint;
export const getConfirmPasswordResetEndpointCandidates = () => [CONFIRM_RESET_ENDPOINT];

/* =========================================================
   LIMIT GETTERS
========================================================= */

export const getIdentifierMaxLength = () =>
  clampNumber(getAuthConstant("identifierMaxLength", 160), 1, 1024);

export const getPasswordMinLength = () =>
  clampNumber(getAuthConstant("passwordMinLength", 8), 1, 1024);

export const getPasswordMaxLength = () =>
  clampNumber(getAuthConstant("passwordMaxLength", 1024), getPasswordMinLength(), 8192);

export const getActivationPasswordMinLength = getPasswordMinLength;
export const getActivationPasswordMaxLength = getPasswordMaxLength;

export const getResetPasswordMinLength = getPasswordMinLength;
export const getResetPasswordMaxLength = getPasswordMaxLength;

export const getTokenMinLength = () =>
  clampNumber(getAuthConstant("tokenMinLength", 8), 1, 4096);

export const getTokenMaxLength = () =>
  clampNumber(getAuthConstant("tokenMaxLength", 8192), getTokenMinLength(), 32768);

export const getActivationTokenMinLength = getTokenMinLength;
export const getActivationTokenMaxLength = getTokenMaxLength;

export const getResetTokenMinLength = getTokenMinLength;
export const getResetTokenMaxLength = getTokenMaxLength;

export const getSessionValueMaxLength = () =>
  clampNumber(getAuthConstant("sessionValueMaxLength", 200), 1, 1000);

export const getTextValueMaxLength = () =>
  clampNumber(getAuthConstant("textValueMaxLength", 300), 1, 2000);

export const getRequestTimeout = () =>
  clampNumber(getAuthConstant("requestTimeout", 30000), 1000, 120000);

export const getLoginTimeoutMs = () =>
  clampNumber(getAuthConstant("loginTimeoutMs", 30000), 1000, 120000);

export const getAuthPublicTimeoutMs = () =>
  clampNumber(getAuthConstant("authPublicTimeoutMs", 30000), 1000, 120000);

/* =========================================================
   MATCH HELPERS
========================================================= */

export function isPublicTechnicalRoute(path = "") {
  if (isBlockedAuthRoute(path)) return false;

  const info = getUserScopedRouteInfo(path);

  /*
    Rutas públicas/auth no viven bajo /@{slug}.
  */
  if (info.scoped) return false;

  const clean = canonicalAuthRoutePath(path);

  if (!clean) return false;

  return AUTH_PUBLIC_TECHNICAL_ROUTES.some((route) => {
    return canonicalAuthRoutePath(route) === clean;
  });
}

export function isActivationRoute(path = "") {
  return canonicalAuthRoutePath(path) === ACTIVATE_ACCOUNT_ROUTE;
}

export function isPasswordRequestRoute(path = "") {
  return canonicalAuthRoutePath(path) === PASSWORD_REQUEST_ROUTE;
}

export function isPasswordResetRoute(path = "") {
  return canonicalAuthRoutePath(path) === PASSWORD_RESET_ROUTE;
}

/* Compat de nombre antiguo, sin declarar ruta nueva. */
export const isResetPasswordRoute = isPasswordResetRoute;
export const isResetPasswordConfirmRoute = isPasswordResetRoute;

export const isMeEndpoint = (path = "") =>
  normalizeEndpointPath(path) === ME_ENDPOINT;

export const isEndpointInGroup = (path = "", group = []) =>
  endpointInList(path, group);

export const isPublicAuthEndpoint = (path = "") =>
  !isMeEndpoint(path) && endpointInList(path, AUTH_PUBLIC_API_PATHS);

export const isPrivateAuthEndpoint = (path = "") =>
  isMeEndpoint(path) || endpointInList(path, AUTH_PRIVATE_API_PATHS);

export const isPasswordResetEndpoint = (path = "") =>
  endpointInList(path, AUTH_ENDPOINT_GROUPS.passwordReset);

export const isActivationEndpoint = (path = "") =>
  endpointInList(path, AUTH_ENDPOINT_GROUPS.activation);

export function isAuthEndpoint(path = "") {
  return (
    isMeEndpoint(path) ||
    endpointInList(path, Object.values(AUTH_ENDPOINTS)) ||
    endpointInList(path, AUTH_PUBLIC_API_PATHS) ||
    endpointInList(path, AUTH_PRIVATE_API_PATHS)
  );
}

export const isAuthFailureCode = (code = "") =>
  AUTH_FAILURE_CODES.includes(safeText(code, "").toUpperCase());

export const isAuthSuccessStatus = (status = "") =>
  AUTH_SUCCESS_STATUSES.includes(safeText(status, "").toLowerCase());

/* =========================================================
   TOKEN URL HELPERS
========================================================= */

export function getAuthTokenParamNames(type = "generic") {
  const names = AUTH_TOKEN_PARAM_NAMES[safeText(type, "generic")];
  return Array.isArray(names) ? [...names] : [TOKEN_PARAM];
}

export function getAllAuthTokenParamNames() {
  return [TOKEN_PARAM];
}

export function hasTokenParam(search = "") {
  const raw = safeText(search, "");

  if (!raw) return false;

  try {
    const params = new URLSearchParams(raw.startsWith("?") ? raw : `?${raw}`);
    return Boolean(safeText(params.get(TOKEN_PARAM), ""));
  } catch {
    return false;
  }
}

function splitUrlForToken(value = "") {
  const raw = pathFromUrlLike(value) || safeText(value, "");

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex);
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex);
  }

  return {
    pathname: normalizeRoutePath(pathname),
    search,
    hash,
  };
}

function hashTokenQuery(hash = "") {
  const clean = safeText(hash, "").replace(/^#/, "");

  if (!clean) return "";

  if (clean.includes("?")) {
    return clean.slice(clean.indexOf("?") + 1);
  }

  if (/^[^/?#=&]+=/i.test(clean)) {
    return clean;
  }

  return "";
}

export function hasTokenInUrl(value = "") {
  const raw = safeText(value, "");

  if (!raw) return false;

  const { search, hash } = splitUrlForToken(raw);

  if (search && hasTokenParam(search)) return true;

  const hashQuery = hashTokenQuery(hash);

  return hashQuery ? hasTokenParam(hashQuery) : false;
}

export function hasActivationToken(value = "") {
  return isActivationRoute(value) && hasTokenInUrl(value);
}

export function hasResetToken(value = "") {
  return isPasswordResetRoute(value) && hasTokenInUrl(value);
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getAuthConstantsSnapshot() {
  return {
    version: AUTH_CONSTANTS_VERSION,

    endpoints: AUTH_ENDPOINTS,
    endpointGroups: AUTH_ENDPOINT_GROUPS,

    publicApiPaths: AUTH_PUBLIC_API_PATHS,
    privateApiPaths: AUTH_PRIVATE_API_PATHS,

    storageKeys: AUTH_STORAGE_KEYS,

    constants: AUTH_CONSTANTS,
    roles: AUTH_ROLES,

    publicTechnicalRoutes: AUTH_PUBLIC_TECHNICAL_ROUTES,

    userHome: {
      prefix: USER_PREFIX,
      canonical: DEFAULT_ROUTE,
      visiblePattern: `${USER_PREFIX}{user.slug}`,
    },

    tokenParam: TOKEN_PARAM,
    tokenParamNames: AUTH_TOKEN_PARAM_NAMES,

    requestOptions: {
      public: AUTH_PUBLIC_REQUEST_OPTIONS,
      private: AUTH_PRIVATE_REQUEST_OPTIONS,
      refresh: AUTH_REFRESH_REQUEST_OPTIONS,
    },

    failureCodes: AUTH_FAILURE_CODES,
    successStatuses: AUTH_SUCCESS_STATUSES,

    policy: {
      sourceOfTruth: "core/config.js",

      tokenParam: TOKEN_PARAM,
      roles: ["admin", "user"],

      meAlwaysPrivate: true,
      refreshPublicNoAuthHeader: true,
      staticContractOnly: true,

      noAppCore: true,
      noCoreHttp: true,
      noRouter: true,
      noToast: true,
      noRuntimeStorage: true,

      userSlugHome: true,
      preservesAtSlug: true,
      configOwnsRouteParsing: true,
      configOwnsUserSlug: true,
      configOwnsBlockedRoutes: true,

      publicRoutesCannotLiveUnderUserScope: true,

      noHomeAlias: true,
      no2fa: true,
      noMfa: true,
      noOtp: true,

      noLegacyAliasesMassive: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default freeze({
  AUTH_CONSTANTS_VERSION,
  AUTH_MODULE_VERSION,

  TOKEN_PARAM,

  LOGIN_ENDPOINT,
  LOGOUT_ENDPOINT,
  LOGOUT_ALL_ENDPOINT,
  ME_ENDPOINT,
  REFRESH_ENDPOINT,

  ACTIVATE_ACCOUNT_ENDPOINT,
  REQUEST_RESET_ENDPOINT,
  CONFIRM_RESET_ENDPOINT,

  LOGIN_ROUTE,
  PASSWORD_REQUEST_ROUTE,
  PASSWORD_RESET_ROUTE,
  ACTIVATE_ACCOUNT_ROUTE,

  USER_HOME_PREFIX,

  AUTH_ENDPOINTS,
  AUTH_ENDPOINT_GROUPS,
  AUTH_PUBLIC_API_PATHS,
  AUTH_PRIVATE_API_PATHS,

  AUTH_STORAGE_KEYS,
  AUTH_CONSTANTS,
  AUTH_FAILURE_CODES,
  AUTH_SUCCESS_STATUSES,
  AUTH_ROLES,

  AUTH_PUBLIC_TECHNICAL_ROUTES,
  AUTH_TOKEN_PARAM_NAMES,

  AUTH_PUBLIC_REQUEST_OPTIONS,
  AUTH_PRIVATE_REQUEST_OPTIONS,
  AUTH_REFRESH_REQUEST_OPTIONS,

  safeText,
  safeNumber,
  safeInt,
  safeBool,
  clampNumber,

  pathFromUrlLike,
  normalizeEndpointPath,
  normalizeRoutePath,

  normalizeUserSlug,
  getUserScopedRouteInfo,
  extractUserHomeSlugFromRoute,
  isUserHomeRoute,
  buildUserHomeRoute,
  canonicalAuthRoutePath,

  getPublicAuthRequestOptions,
  getPrivateAuthRequestOptions,
  getRefreshRequestOptions,

  getAuthEndpoint,
  getAuthEndpointCandidates,
  getAuthEndpointGroup,
  getAuthStorageKey,
  getAuthConstant,

  getLoginEndpoint,
  getLogoutEndpoint,
  getLogoutAllEndpoint,
  getMeEndpoint,
  getRefreshEndpoint,
  getRefreshEndpointCandidates,

  getActivateAccountEndpoint,
  getActivationEndpoint,
  getAccountActivationEndpoint,
  getActivateAccountEndpointCandidates,

  getRequestPasswordResetEndpoint,
  getRequestPasswordResetEndpointCandidates,

  getConfirmPasswordResetEndpoint,
  getConfirmResetPasswordEndpoint,
  getConfirmPasswordResetEndpointCandidates,

  getIdentifierMaxLength,
  getPasswordMinLength,
  getPasswordMaxLength,
  getActivationPasswordMinLength,
  getActivationPasswordMaxLength,
  getResetPasswordMinLength,
  getResetPasswordMaxLength,
  getTokenMinLength,
  getTokenMaxLength,
  getActivationTokenMinLength,
  getActivationTokenMaxLength,
  getResetTokenMinLength,
  getResetTokenMaxLength,
  getSessionValueMaxLength,
  getTextValueMaxLength,
  getRequestTimeout,
  getLoginTimeoutMs,
  getAuthPublicTimeoutMs,

  isPublicTechnicalRoute,
  isActivationRoute,
  isPasswordRequestRoute,
  isPasswordResetRoute,
  isResetPasswordRoute,
  isResetPasswordConfirmRoute,

  isAuthEndpoint,
  isEndpointInGroup,
  isMeEndpoint,
  isPublicAuthEndpoint,
  isPrivateAuthEndpoint,
  isPasswordResetEndpoint,
  isActivationEndpoint,

  isAuthFailureCode,
  isAuthSuccessStatus,

  getAuthTokenParamNames,
  getAllAuthTokenParamNames,

  hasTokenParam,
  hasTokenInUrl,
  hasActivationToken,
  hasResetToken,

  getAuthConstantsSnapshot,
});
