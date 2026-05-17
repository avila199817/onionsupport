/* =========================================================
   Onion Support - Auth Constants
   Archivo: /src/features/auth/constants.js

   Responsabilidad:
   - Contrato estático mínimo de Auth.
   - Backend real bajo /api/auth.
   - /api/auth/me siempre privado.
   - Token param único: token.
   - Rutas públicas reales actuales:
     /login
     /password-reset
     /password-request
     /activate-account
   - Roles únicos: admin / user.
   - Sin AppCore.
   - Sin CoreHttp.
   - Sin Router.
   - Sin Toast.
   - Sin storage runtime.
   - Sin 2FA/MFA/OTP.
   - Sin aliases legacy masivos.
========================================================= */

export const AUTH_CONSTANTS_VERSION = "simple";
export const AUTH_MODULE_VERSION = AUTH_CONSTANTS_VERSION;

const DEFAULT_ROUTE = "/";
const LOCAL_ORIGIN = "http://localhost";
const TOKEN_PARAM = "token";

function freeze(value) {
  return Object.freeze(value);
}

/* =========================================================
   BASIC HELPERS
========================================================= */

export function safeText(value, fallback = "") {
  const output = String(value ?? "").trim();
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

function stripUsernamePrefix(path = "") {
  const clean = safeText(path, "");

  if (!clean.startsWith("/@")) return clean;

  const parts = clean.split("/").filter(Boolean);

  if (parts[0]?.startsWith("@")) {
    return `/${parts.slice(1).join("/")}` || DEFAULT_ROUTE;
  }

  return clean;
}

function normalizePathname(pathname = DEFAULT_ROUTE) {
  let value = safeText(pathname, DEFAULT_ROUTE).replace(/\\/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/+/g, "/");
  value = stripUsernamePrefix(value);

  if (value.length > 1) value = value.replace(/\/+$/g, "");

  return value || DEFAULT_ROUTE;
}

function splitPath(path = DEFAULT_ROUTE) {
  let raw = safeText(path, DEFAULT_ROUTE);

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
    pathname: normalizePathname(pathname),
    search,
    hash,
  };
}

export function pathFromUrlLike(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";
  if (isHashRouterPath(raw)) return normalizeHashRouterPath(raw);

  try {
    const url = new URL(raw, LOCAL_ORIGIN);

    if (url.hash && isHashRouterPath(url.hash)) {
      return normalizeHashRouterPath(url.hash);
    }

    return `${url.pathname || DEFAULT_ROUTE}${url.search || ""}${url.hash || ""}`;
  } catch {
    return raw;
  }
}

export function normalizeEndpointPath(path = "") {
  const raw = pathFromUrlLike(path);

  if (!raw) return "";

  return splitPath(raw).pathname;
}

export function normalizeRoutePath(path = "") {
  return normalizeEndpointPath(path);
}

function endpointInList(path = "", list = []) {
  const clean = normalizeEndpointPath(path);

  if (!clean) return false;

  return list.some((item) => {
    const endpoint = normalizeEndpointPath(item);
    return clean === endpoint || clean.startsWith(`${endpoint}/`);
  });
}

/* =========================================================
   API ENDPOINTS
========================================================= */

export const LOGIN_ENDPOINT = "/api/auth/login";
export const LOGOUT_ENDPOINT = "/api/auth/logout";
export const ME_ENDPOINT = "/api/auth/me";
export const REFRESH_ENDPOINT = "/api/auth/refresh";

export const ACTIVATE_ACCOUNT_ENDPOINT = "/api/auth/activate";
export const REQUEST_RESET_ENDPOINT = "/api/auth/reset-password-request";
export const CONFIRM_RESET_ENDPOINT = "/api/auth/reset-password-confirm";

export const AUTH_ENDPOINTS = freeze({
  login: LOGIN_ENDPOINT,
  logout: LOGOUT_ENDPOINT,
  me: ME_ENDPOINT,
  refresh: REFRESH_ENDPOINT,

  activateAccount: ACTIVATE_ACCOUNT_ENDPOINT,
  activate: ACTIVATE_ACCOUNT_ENDPOINT,

  requestPasswordReset: REQUEST_RESET_ENDPOINT,
  confirmPasswordReset: CONFIRM_RESET_ENDPOINT,
});

/* Compat mínima: un endpoint por acción. Sin legacy. */
export const AUTH_ENDPOINT_CANDIDATES = freeze({
  login: freeze([LOGIN_ENDPOINT]),
  logout: freeze([LOGOUT_ENDPOINT]),
  me: freeze([ME_ENDPOINT]),
  refresh: freeze([REFRESH_ENDPOINT]),
  activateAccount: freeze([ACTIVATE_ACCOUNT_ENDPOINT]),
  requestPasswordReset: freeze([REQUEST_RESET_ENDPOINT]),
  confirmPasswordReset: freeze([CONFIRM_RESET_ENDPOINT]),
});

export const AUTH_ENDPOINT_GROUPS = freeze({
  public: freeze([
    LOGIN_ENDPOINT,
    REFRESH_ENDPOINT,
    ACTIVATE_ACCOUNT_ENDPOINT,
    REQUEST_RESET_ENDPOINT,
    CONFIRM_RESET_ENDPOINT,
  ]),

  private: freeze([
    LOGOUT_ENDPOINT,
    ME_ENDPOINT,
  ]),

  session: freeze([
    LOGIN_ENDPOINT,
    LOGOUT_ENDPOINT,
    ME_ENDPOINT,
    REFRESH_ENDPOINT,
  ]),

  activation: freeze([
    ACTIVATE_ACCOUNT_ENDPOINT,
  ]),

  passwordReset: freeze([
    REQUEST_RESET_ENDPOINT,
    CONFIRM_RESET_ENDPOINT,
  ]),
});

export const AUTH_PUBLIC_API_PATHS = freeze([...AUTH_ENDPOINT_GROUPS.public]);
export const AUTH_PRIVATE_API_PATHS = freeze([...AUTH_ENDPOINT_GROUPS.private]);
export const AUTH_CONTROL_SKIP_REFRESH_PATHS = freeze([...AUTH_ENDPOINT_GROUPS.public]);

/* =========================================================
   SPA ROUTES
========================================================= */

export const LOGIN_ROUTE = "/login";
export const PASSWORD_RESET_ROUTE = "/password-reset";
export const PASSWORD_REQUEST_ROUTE = "/password-request";
export const ACTIVATE_ACCOUNT_ROUTE = "/activate-account";

export const AUTH_PUBLIC_TECHNICAL_ROUTES = freeze([
  LOGIN_ROUTE,
  PASSWORD_RESET_ROUTE,
  PASSWORD_REQUEST_ROUTE,
  ACTIVATE_ACCOUNT_ROUTE,
]);

export const AUTH_TECHNICAL_ROUTE_ALIASES = freeze({});

/* =========================================================
   TOKEN PARAMS
========================================================= */

export const AUTH_TOKEN_PARAM_NAMES = freeze({
  generic: freeze([TOKEN_PARAM]),
  auth: freeze([TOKEN_PARAM]),
  activation: freeze([TOKEN_PARAM]),
  reset: freeze([TOKEN_PARAM]),
  refresh: freeze([TOKEN_PARAM]),

  /* Compat vacía: no hay 2FA/MFA/OTP en el SPA mínimo actual. */
  twoFactor: freeze([]),
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
  user: "user",
  role: "role",
});

export const AUTH_LEGACY_STORAGE_KEYS = freeze({});

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
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
  "SESSION_NOT_FOUND",
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

export const AUTH_2FA_STATUSES = freeze([]);
export const AUTH_ROLES = freeze(["admin", "user"]);

/* =========================================================
   RESOLVE HELPERS
========================================================= */

function resolveEndpointKey(key = "") {
  const clean = safeText(key, "");

  if (clean === "activate") return "activateAccount";
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
  const clean = resolveEndpointKey(key);
  const candidates = AUTH_ENDPOINT_CANDIDATES[clean];

  if (Array.isArray(candidates) && candidates.length) {
    return [...candidates];
  }

  const endpoint = getAuthEndpoint(clean, fallback);
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

export function getAuthLegacyStorageKey(_key = "", fallback = "") {
  return safeText(fallback, "");
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
export const getMeEndpoint = () => ME_ENDPOINT;
export const getRefreshEndpoint = () => REFRESH_ENDPOINT;
export const getRefreshEndpointCandidates = () => [REFRESH_ENDPOINT];

export const getActivateAccountEndpoint = () => ACTIVATE_ACCOUNT_ENDPOINT;
export const getActivationEndpoint = getActivateAccountEndpoint;
export const getAccountActivationEndpoint = getActivateAccountEndpoint;
export const getActivateAccountEndpointCandidates = () => [ACTIVATE_ACCOUNT_ENDPOINT];

export const getRequestPasswordResetEndpoint = () => REQUEST_RESET_ENDPOINT;
export const getForgotPasswordEndpoint = getRequestPasswordResetEndpoint;
export const getRecoverPasswordEndpoint = getRequestPasswordResetEndpoint;
export const getRequestPasswordResetEndpointCandidates = () => [REQUEST_RESET_ENDPOINT];

export const getConfirmPasswordResetEndpoint = () => CONFIRM_RESET_ENDPOINT;
export const getConfirmResetPasswordEndpoint = getConfirmPasswordResetEndpoint;
export const getConfirmPasswordResetEndpointCandidates = () => [CONFIRM_RESET_ENDPOINT];

/* Compat mínima: no hay validate endpoints reales ahora. */
export const getValidateActivationTokenEndpoint = () => "";
export const getValidateActivateAccountTokenEndpoint = () => "";
export const getValidateActivationTokenEndpointCandidates = () => [];
export const getValidateResetTokenEndpoint = () => "";
export const getValidateResetPasswordTokenEndpoint = () => "";
export const getValidateResetTokenEndpointCandidates = () => [];

/* Compat vacía: no hay 2FA/MFA/OTP en constants mínimo. */
export const getTwoFactorLoginEndpoint = () => "";
export const getTwoFactorRequestEndpoint = () => "";
export const getTwoFactorResendEndpoint = () => "";
export const getTwoFactorLoginEndpointCandidates = () => [];
export const getTwoFactorRequestEndpointCandidates = () => [];
export const getTwoFactorResendEndpointCandidates = () => [];

export const getAuthHealthEndpoint = () => "";

/* =========================================================
   LIMIT GETTERS
========================================================= */

export const getIdentifierMaxLength = () => clampNumber(getAuthConstant("identifierMaxLength", 160), 1, 1024);
export const getPasswordMinLength = () => clampNumber(getAuthConstant("passwordMinLength", 8), 1, 1024);
export const getPasswordMaxLength = () => clampNumber(getAuthConstant("passwordMaxLength", 1024), getPasswordMinLength(), 8192);

export const getActivationPasswordMinLength = getPasswordMinLength;
export const getActivationPasswordMaxLength = getPasswordMaxLength;

export const getResetPasswordMinLength = getPasswordMinLength;
export const getResetPasswordMaxLength = getPasswordMaxLength;

export const getTokenMinLength = () => clampNumber(getAuthConstant("tokenMinLength", 8), 1, 4096);
export const getTokenMaxLength = () => clampNumber(getAuthConstant("tokenMaxLength", 8192), getTokenMinLength(), 32768);

export const getActivationTokenMinLength = getTokenMinLength;
export const getActivationTokenMaxLength = getTokenMaxLength;

export const getResetTokenMinLength = getTokenMinLength;
export const getResetTokenMaxLength = getTokenMaxLength;

export const getTempTokenMinLength = getTokenMinLength;
export const getTempTokenMaxLength = getTokenMaxLength;

export const getSessionValueMaxLength = () => 200;
export const getRequestTimeout = () => clampNumber(getAuthConstant("requestTimeout", 30000), 1000, 120000);
export const getLoginTimeoutMs = () => clampNumber(getAuthConstant("loginTimeoutMs", 30000), 1000, 120000);
export const getAuthPublicTimeoutMs = () => clampNumber(getAuthConstant("authPublicTimeoutMs", 30000), 1000, 120000);

export const getRefreshRetryCooldownMs = () => 30000;
export const getMaxSequentialRefreshFailures = () => 3;
export const getLoginCooldownMs = () => 30000;
export const getLoginMaxAttemptsBeforeCooldown = () => 5;

/* Compat vacía. */
export const getTwoFactorCodeMinLength = () => 0;
export const getTwoFactorCodeMaxLength = () => 0;

/* =========================================================
   MATCH HELPERS
========================================================= */

export function isPublicTechnicalRoute(path = "") {
  const clean = normalizeRoutePath(path);
  return AUTH_PUBLIC_TECHNICAL_ROUTES.includes(clean);
}

export function isActivationRoute(path = "") {
  return normalizeRoutePath(path) === ACTIVATE_ACCOUNT_ROUTE;
}

export function isResetPasswordRoute(path = "") {
  const clean = normalizeRoutePath(path);
  return clean === PASSWORD_RESET_ROUTE || clean === PASSWORD_REQUEST_ROUTE;
}

export function isResetPasswordConfirmRoute(path = "") {
  return normalizeRoutePath(path) === PASSWORD_RESET_ROUTE;
}

export function isTwoFactorRoute() {
  return false;
}

export const isMeEndpoint = (path = "") => normalizeEndpointPath(path) === ME_ENDPOINT;
export const isEndpointInGroup = (path = "", group = []) => endpointInList(path, group);
export const isPublicAuthEndpoint = (path = "") => !isMeEndpoint(path) && endpointInList(path, AUTH_PUBLIC_API_PATHS);
export const isPrivateAuthEndpoint = (path = "") => isMeEndpoint(path) || endpointInList(path, AUTH_PRIVATE_API_PATHS);
export const isAuthControlSkipRefreshEndpoint = (path = "") => !isMeEndpoint(path) && endpointInList(path, AUTH_CONTROL_SKIP_REFRESH_PATHS);
export const isPasswordResetEndpoint = (path = "") => endpointInList(path, AUTH_ENDPOINT_GROUPS.passwordReset);
export const isActivationEndpoint = (path = "") => endpointInList(path, AUTH_ENDPOINT_GROUPS.activation);

export function isTwoFactorEndpoint() {
  return false;
}

export function isAuthEndpoint(path = "") {
  return (
    isMeEndpoint(path) ||
    endpointInList(path, Object.values(AUTH_ENDPOINTS)) ||
    endpointInList(path, AUTH_PUBLIC_API_PATHS) ||
    endpointInList(path, AUTH_PRIVATE_API_PATHS)
  );
}

export const isAuthFailureCode = (code = "") => AUTH_FAILURE_CODES.includes(safeText(code, "").toUpperCase());
export const isAuth2FAStatus = () => false;
export const isAuthSuccessStatus = (status = "") => AUTH_SUCCESS_STATUSES.includes(safeText(status, "").toLowerCase());

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

export function getTechnicalRouteAlias(_key = "", fallback = "") {
  return safeText(fallback, "");
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

export function hasTokenInUrl(value = "") {
  const raw = safeText(value, "");

  if (!raw) return false;

  const path = pathFromUrlLike(raw) || raw;
  const { search, hash } = splitPath(path);

  if (search && hasTokenParam(search)) return true;

  if (hash && hash.includes("?")) {
    const query = hash.split("?").slice(1).join("?");
    return hasTokenParam(query);
  }

  return false;
}

export function hasActivationToken(value = "") {
  return isActivationRoute(value) && hasTokenInUrl(value);
}

export function hasResetToken(value = "") {
  return isResetPasswordRoute(value) && hasTokenInUrl(value);
}

export function hasTwoFactorToken() {
  return false;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getAuthConstantsSnapshot() {
  return {
    version: AUTH_CONSTANTS_VERSION,
    endpoints: AUTH_ENDPOINTS,
    endpointCandidates: AUTH_ENDPOINT_CANDIDATES,
    endpointGroups: AUTH_ENDPOINT_GROUPS,
    publicApiPaths: AUTH_PUBLIC_API_PATHS,
    privateApiPaths: AUTH_PRIVATE_API_PATHS,
    controlSkipRefreshPaths: AUTH_CONTROL_SKIP_REFRESH_PATHS,
    storageKeys: AUTH_STORAGE_KEYS,
    legacyStorageKeys: AUTH_LEGACY_STORAGE_KEYS,
    constants: AUTH_CONSTANTS,
    roles: AUTH_ROLES,
    publicTechnicalRoutes: AUTH_PUBLIC_TECHNICAL_ROUTES,
    technicalRouteAliases: AUTH_TECHNICAL_ROUTE_ALIASES,
    tokenParamNames: AUTH_TOKEN_PARAM_NAMES,
    requestOptions: {
      public: AUTH_PUBLIC_REQUEST_OPTIONS,
      private: AUTH_PRIVATE_REQUEST_OPTIONS,
      refresh: AUTH_REFRESH_REQUEST_OPTIONS,
    },
    failureCodes: AUTH_FAILURE_CODES,
    successStatuses: AUTH_SUCCESS_STATUSES,
    twoFactorStatuses: AUTH_2FA_STATUSES,
    policy: {
      tokenParam: TOKEN_PARAM,
      roles: ["admin", "user"],
      meAlwaysPrivate: true,
      staticContractOnly: true,
      noRouter: true,
      noToast: true,
      noRuntimeStorage: true,
      no2fa: true,
      noLegacyAliases: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default freeze({
  AUTH_CONSTANTS_VERSION,
  AUTH_MODULE_VERSION,

  LOGIN_ENDPOINT,
  LOGOUT_ENDPOINT,
  ME_ENDPOINT,
  REFRESH_ENDPOINT,

  ACTIVATE_ACCOUNT_ENDPOINT,
  REQUEST_RESET_ENDPOINT,
  CONFIRM_RESET_ENDPOINT,

  LOGIN_ROUTE,
  PASSWORD_RESET_ROUTE,
  PASSWORD_REQUEST_ROUTE,
  ACTIVATE_ACCOUNT_ROUTE,

  AUTH_ENDPOINTS,
  AUTH_ENDPOINT_CANDIDATES,
  AUTH_ENDPOINT_GROUPS,
  AUTH_PUBLIC_API_PATHS,
  AUTH_PRIVATE_API_PATHS,
  AUTH_CONTROL_SKIP_REFRESH_PATHS,

  AUTH_STORAGE_KEYS,
  AUTH_LEGACY_STORAGE_KEYS,
  AUTH_CONSTANTS,
  AUTH_FAILURE_CODES,
  AUTH_SUCCESS_STATUSES,
  AUTH_2FA_STATUSES,
  AUTH_ROLES,

  AUTH_PUBLIC_TECHNICAL_ROUTES,
  AUTH_TECHNICAL_ROUTE_ALIASES,
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

  getPublicAuthRequestOptions,
  getPrivateAuthRequestOptions,
  getRefreshRequestOptions,

  getAuthEndpoint,
  getAuthEndpointCandidates,
  getAuthEndpointGroup,
  getAuthStorageKey,
  getAuthLegacyStorageKey,
  getAuthConstant,

  getLoginEndpoint,
  getLogoutEndpoint,
  getMeEndpoint,
  getRefreshEndpoint,
  getRefreshEndpointCandidates,

  getActivateAccountEndpoint,
  getActivationEndpoint,
  getAccountActivationEndpoint,
  getActivateAccountEndpointCandidates,

  getRequestPasswordResetEndpoint,
  getForgotPasswordEndpoint,
  getRecoverPasswordEndpoint,
  getRequestPasswordResetEndpointCandidates,

  getConfirmPasswordResetEndpoint,
  getConfirmResetPasswordEndpoint,
  getConfirmPasswordResetEndpointCandidates,

  getValidateActivationTokenEndpoint,
  getValidateActivateAccountTokenEndpoint,
  getValidateActivationTokenEndpointCandidates,

  getValidateResetTokenEndpoint,
  getValidateResetPasswordTokenEndpoint,
  getValidateResetTokenEndpointCandidates,

  getTwoFactorLoginEndpoint,
  getTwoFactorRequestEndpoint,
  getTwoFactorResendEndpoint,
  getTwoFactorLoginEndpointCandidates,
  getTwoFactorRequestEndpointCandidates,
  getTwoFactorResendEndpointCandidates,

  getAuthHealthEndpoint,

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
  getTempTokenMinLength,
  getTempTokenMaxLength,
  getSessionValueMaxLength,
  getRequestTimeout,
  getLoginTimeoutMs,
  getAuthPublicTimeoutMs,
  getRefreshRetryCooldownMs,
  getMaxSequentialRefreshFailures,
  getLoginCooldownMs,
  getLoginMaxAttemptsBeforeCooldown,
  getTwoFactorCodeMinLength,
  getTwoFactorCodeMaxLength,

  isPublicTechnicalRoute,
  isActivationRoute,
  isResetPasswordRoute,
  isResetPasswordConfirmRoute,
  isTwoFactorRoute,

  isAuthEndpoint,
  isEndpointInGroup,
  isMeEndpoint,
  isPublicAuthEndpoint,
  isPrivateAuthEndpoint,
  isAuthControlSkipRefreshEndpoint,
  isPasswordResetEndpoint,
  isActivationEndpoint,
  isTwoFactorEndpoint,

  isAuthFailureCode,
  isAuth2FAStatus,
  isAuthSuccessStatus,

  getAuthTokenParamNames,
  getAllAuthTokenParamNames,
  getTechnicalRouteAlias,

  hasTokenParam,
  hasTokenInUrl,
  hasActivationToken,
  hasResetToken,
  hasTwoFactorToken,

  getAuthConstantsSnapshot,
});
