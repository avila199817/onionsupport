/* =========================================================
   Onion SPA - Auth Constants
   Archivo: src/features/auth/constants.js

   AUTH CONTRACT · SIMPLE CLEAN · NO APPCORE DEP

   Objetivo:
   - Un único contrato auth para frontend.
   - Sin lógica de negocio.
   - Sin dependencias circulares.
   - Solo roles reales del sistema: admin / user.
   - /me siempre privado.
   - login/refresh/reset/activation/2FA públicos y sin auto-refresh.
========================================================= */

/* =========================================================
   VERSION
========================================================= */

export const AUTH_CONSTANTS_VERSION = "17.0.0-simple-clean";

/* =========================================================
   HELPERS BASE
========================================================= */

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isObjectLike(value) {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

export function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function safeInt(value, fallback = 0) {
  return Math.trunc(safeNumber(value, fallback));
}

export function safeBool(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const text = safeText(value).toLowerCase();

  if (["true", "1", "yes", "si", "sí", "ok", "on", "enabled", "active"].includes(text)) {
    return true;
  }

  if (["false", "0", "no", "off", "disabled", "inactive"].includes(text)) {
    return false;
  }

  return Boolean(fallback);
}

export function clampNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = safeNumber(value, min);
  return Math.min(Math.max(number, min), max);
}

function hasOwn(object, key) {
  try {
    return Boolean(
      object &&
        typeof object === "object" &&
        Object.prototype.hasOwnProperty.call(object, key)
    );
  } catch {
    return false;
  }
}

function unique(values = []) {
  const input = Array.isArray(values) ? values : [values];

  return [
    ...new Set(
      input
        .flat(Infinity)
        .map((value) => safeText(value))
        .filter(Boolean)
    ),
  ];
}

function deepFreeze(value) {
  if (!isObjectLike(value) || Object.isFrozen(value)) return value;

  try {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze(value[key]);
    }

    return Object.freeze(value);
  } catch {
    return value;
  }
}

/* =========================================================
   PATH NORMALIZATION
========================================================= */

function isAbsoluteUrl(value = "") {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(safeText(value));
}

function isHashRouterPath(value = "") {
  const raw = safeText(value);
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value);

  if (!raw) return "/";

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || "/";
  }

  return raw.replace(/^#\/?/, "/") || "/";
}

function stripScopedUserPrefix(path = "") {
  const value = safeText(path);

  if (!value.startsWith("/@")) return value;

  const parts = value.split("/");

  if (parts.length >= 3 && /^@[A-Za-z0-9._-]{1,80}$/.test(parts[1])) {
    return `/${parts.slice(2).join("/")}` || "/";
  }

  return value;
}

function normalizePathnameOnly(pathname = "/") {
  let value = safeText(pathname, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) value = "/";
  if (!value.startsWith("/")) value = `/${value}`;

  value = stripScopedUserPrefix(value);

  const parts = [];

  for (const segment of value.split("/")) {
    if (!segment || segment === ".") continue;

    if (segment === "..") {
      parts.pop();
      continue;
    }

    parts.push(segment);
  }

  value = `/${parts.join("/")}` || "/";

  if (value.length > 1 && value.endsWith("/")) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function splitSearchAndHash(path = "") {
  let raw = safeText(path);

  if (!raw) {
    return {
      pathname: "",
      search: "",
      hash: "",
    };
  }

  if (isHashRouterPath(raw)) {
    raw = normalizeHashRouterPath(raw);
  }

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || "/";
  }

  return {
    pathname,
    search,
    hash,
  };
}

export function pathFromUrlLike(value = "") {
  const raw = safeText(value);

  if (!raw) return "";

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    const parsed = new URL(raw, "http://localhost");

    if (parsed.hash && isHashRouterPath(parsed.hash)) {
      return normalizeHashRouterPath(parsed.hash);
    }

    if (isAbsoluteUrl(raw) || raw.startsWith("/") || raw.startsWith("?") || raw.startsWith("#")) {
      return `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;
    }
  } catch {
    return raw;
  }

  return raw;
}

export function normalizeEndpointPath(path = "") {
  const raw = pathFromUrlLike(path);

  if (!raw) return "";

  const { pathname } = splitSearchAndHash(raw);

  return normalizePathnameOnly(pathname);
}

export function normalizeRoutePath(path = "") {
  return normalizeEndpointPath(path);
}

function normalizeEndpointList(list = []) {
  return unique(list)
    .map((item) => normalizeEndpointPath(item))
    .filter(Boolean);
}

function endpointInList(path = "", list = []) {
  const normalized = normalizeEndpointPath(path);

  if (!normalized) return false;

  return normalizeEndpointList(list).some((endpoint) => (
    normalized === endpoint ||
    normalized.startsWith(`${endpoint}/`)
  ));
}

/* =========================================================
   API ENDPOINTS
========================================================= */

export const LOGIN_ENDPOINT = "/api/auth/login";
export const LOGOUT_ENDPOINT = "/api/auth/logout";

export const ME_ENDPOINT = "/api/auth/me";
export const ME_AUTH_LEGACY_ENDPOINT = "/auth/me";
export const ME_API_LEGACY_ENDPOINT = "/api/me";
export const ME_LEGACY_ENDPOINT = "/me";

export const REFRESH_ENDPOINT = "/api/auth/refresh";
export const TOKEN_REFRESH_ENDPOINT = "/api/auth/token/refresh";
export const RENEW_ENDPOINT = "/api/auth/renew";

export const TWO_FACTOR_LOGIN_ENDPOINT = "/api/auth/2fa/login";
export const TWO_FACTOR_VERIFY_ENDPOINT = "/api/auth/2fa/verify";
export const TWO_FACTOR_REQUEST_ENDPOINT = "/api/auth/2fa/request";
export const TWO_FACTOR_RESEND_ENDPOINT = "/api/auth/2fa/resend";

export const MFA_LOGIN_ENDPOINT = "/api/auth/mfa/login";
export const MFA_VERIFY_ENDPOINT = "/api/auth/mfa/verify";
export const MFA_REQUEST_ENDPOINT = "/api/auth/mfa/request";
export const MFA_RESEND_ENDPOINT = "/api/auth/mfa/resend";

export const OTP_LOGIN_ENDPOINT = "/api/auth/otp/login";
export const OTP_VERIFY_ENDPOINT = "/api/auth/otp/verify";
export const OTP_REQUEST_ENDPOINT = "/api/auth/otp/request";
export const OTP_RESEND_ENDPOINT = "/api/auth/otp/resend";

export const HEALTH_ENDPOINT = "/api/auth/_health";
export const HEALTH_LEGACY_ENDPOINT = "/api/auth/health";

export const ACTIVATE_ACCOUNT_ENDPOINT = "/api/auth/activate";
export const ACTIVATE_ACCOUNT_LEGACY_ENDPOINT = "/api/auth/activate-account";
export const ACTIVATE_FIRST_USER_ENDPOINT = "/api/auth/activate/first-user";
export const VALIDATE_ACTIVATION_TOKEN_ENDPOINT = "/api/auth/activate/validate";

export const REQUEST_RESET_ENDPOINT = "/api/auth/reset-password-request";
export const FORGOT_PASSWORD_ENDPOINT = "/api/auth/forgot-password";
export const PASSWORD_RESET_REQUEST_ENDPOINT = "/api/auth/password-reset/request";
export const RESET_PASSWORD_REQUEST_ENDPOINT = "/api/auth/reset-password/request";

export const CONFIRM_RESET_ENDPOINT = "/api/auth/reset-password-confirm";
export const RESET_PASSWORD_CONFIRM_ENDPOINT = "/api/auth/reset-password/confirm";
export const PASSWORD_RESET_CONFIRM_ENDPOINT = "/api/auth/password-reset/confirm";

export const VALIDATE_RESET_ENDPOINT = "/api/auth/reset-password/validate";
export const PASSWORD_RESET_VALIDATE_ENDPOINT = "/api/auth/password-reset/validate";

/* =========================================================
   SPA PUBLIC TECHNICAL ROUTES
========================================================= */

export const AUTH_PUBLIC_TECHNICAL_ROUTES = deepFreeze([
  "/login",

  "/activate-account",
  "/activate",
  "/activation",
  "/account/activate",
  "/activate/first-user",

  "/reset-password",
  "/reset-password/confirm",
  "/reset-password-confirm",

  "/password-reset",
  "/password-reset/confirm",
  "/password-reset-confirm",

  "/confirm-reset-password",
  "/forgot-password",
  "/recover-password",

  "/2fa",
  "/otp",
  "/mfa",
]);

export const AUTH_TECHNICAL_ROUTE_ALIASES = deepFreeze({
  login: "/login",
  signin: "/login",
  signIn: "/login",

  activate: "/activate-account",
  activation: "/activate-account",
  activateAccount: "/activate-account",
  accountActivation: "/activate-account",

  resetPassword: "/reset-password",
  forgotPassword: "/forgot-password",
  recoverPassword: "/recover-password",
  passwordReset: "/password-reset",

  resetPasswordConfirm: "/reset-password/confirm",
  confirmResetPassword: "/reset-password/confirm",
  passwordResetConfirm: "/reset-password/confirm",

  twoFactor: "/2fa",
  twoFactorLogin: "/2fa",
  twoFactorVerify: "/2fa",

  mfa: "/mfa",
  otp: "/otp",
});

/* =========================================================
   TOKEN PARAMS
========================================================= */

export const AUTH_TOKEN_PARAM_NAMES = deepFreeze({
  generic: [
    "token",
    "code",
    "t",
  ],

  auth: [
    "token",
    "accessToken",
    "access_token",
    "authToken",
    "auth_token",
    "jwt",
    "idToken",
    "id_token",
    "code",
    "t",
  ],

  refresh: [
    "refreshToken",
    "refresh_token",
    "token",
    "code",
    "t",
  ],

  activation: [
    "token",
    "activationToken",
    "activateToken",
    "activation_token",
    "activate_token",
    "code",
    "t",
  ],

  reset: [
    "token",
    "resetToken",
    "passwordResetToken",
    "confirmToken",
    "reset_token",
    "password_reset_token",
    "confirm_token",
    "code",
    "t",
  ],

  twoFactor: [
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "challengeToken",
    "challenge_token",
    "twoFactorToken",
    "two_factor_token",
    "mfaToken",
    "mfa_token",
    "otpToken",
    "otp_token",
    "code",
    "otp",
    "totp",
    "t",
  ],
});

/* =========================================================
   HTTP REQUEST POLICIES
========================================================= */

export const AUTH_PUBLIC_REQUEST_OPTIONS = deepFreeze({
  public: true,
  auth: false,
  skipAuth: true,
  noAuthHeader: true,

  _skipAuthRefresh: true,
  skipAuthRefresh: true,
  noAutoRefresh: true,
  autoRefresh: false,

  noAutoLogout: true,
  autoLogout: false,

  retry: false,
  retries: 0,
  _skipRetry: true,
  skipRetry: true,
});

export const AUTH_PRIVATE_REQUEST_OPTIONS = deepFreeze({
  public: false,
  auth: true,
  skipAuth: false,
  noAuthHeader: false,
});

export const AUTH_REFRESH_REQUEST_OPTIONS = deepFreeze({
  ...AUTH_PUBLIC_REQUEST_OPTIONS,

  background: true,
  silent: true,
  useLoader: false,
  noLoader: true,

  emitEvents: false,
  emitLifecycleEvents: false,
  emitFinalEvents: false,
});

export function getPublicAuthRequestOptions(extra = {}) {
  return {
    ...AUTH_PUBLIC_REQUEST_OPTIONS,
    ...(isObjectLike(extra) ? extra : {}),
  };
}

export function getPrivateAuthRequestOptions(extra = {}) {
  return {
    ...AUTH_PRIVATE_REQUEST_OPTIONS,
    ...(isObjectLike(extra) ? extra : {}),
  };
}

export function getRefreshRequestOptions(extra = {}) {
  return {
    ...AUTH_REFRESH_REQUEST_OPTIONS,
    ...(isObjectLike(extra) ? extra : {}),
  };
}

/* =========================================================
   ENDPOINT MAP
========================================================= */

export const AUTH_ENDPOINTS = deepFreeze({
  login: LOGIN_ENDPOINT,
  signIn: LOGIN_ENDPOINT,
  signin: LOGIN_ENDPOINT,
  authenticate: LOGIN_ENDPOINT,

  logout: LOGOUT_ENDPOINT,
  signOut: LOGOUT_ENDPOINT,
  signout: LOGOUT_ENDPOINT,

  me: ME_ENDPOINT,
  profile: ME_ENDPOINT,
  currentUser: ME_ENDPOINT,
  current: ME_ENDPOINT,
  session: ME_ENDPOINT,

  refresh: REFRESH_ENDPOINT,
  refreshSession: REFRESH_ENDPOINT,
  tokenRefresh: TOKEN_REFRESH_ENDPOINT,
  renew: RENEW_ENDPOINT,

  twoFactorLogin: TWO_FACTOR_LOGIN_ENDPOINT,
  login2fa: TWO_FACTOR_LOGIN_ENDPOINT,
  twoFactorVerify: TWO_FACTOR_VERIFY_ENDPOINT,
  verify2FA: TWO_FACTOR_VERIFY_ENDPOINT,
  requestTwoFactor: TWO_FACTOR_REQUEST_ENDPOINT,
  requestTwoFactorCode: TWO_FACTOR_REQUEST_ENDPOINT,
  request2FA: TWO_FACTOR_REQUEST_ENDPOINT,
  resendTwoFactor: TWO_FACTOR_RESEND_ENDPOINT,
  resendTwoFactorCode: TWO_FACTOR_RESEND_ENDPOINT,
  resend2FA: TWO_FACTOR_RESEND_ENDPOINT,

  mfaLogin: MFA_LOGIN_ENDPOINT,
  verifyMfa: MFA_VERIFY_ENDPOINT,
  requestMfa: MFA_REQUEST_ENDPOINT,
  resendMfa: MFA_RESEND_ENDPOINT,

  otpLogin: OTP_LOGIN_ENDPOINT,
  verifyOtp: OTP_VERIFY_ENDPOINT,
  requestOtp: OTP_REQUEST_ENDPOINT,
  resendOtp: OTP_RESEND_ENDPOINT,

  health: HEALTH_ENDPOINT,
  authHealth: HEALTH_ENDPOINT,

  activateAccount: ACTIVATE_ACCOUNT_ENDPOINT,
  activate: ACTIVATE_ACCOUNT_ENDPOINT,
  activation: ACTIVATE_ACCOUNT_ENDPOINT,
  accountActivation: ACTIVATE_ACCOUNT_ENDPOINT,
  createUserActivation: ACTIVATE_ACCOUNT_ENDPOINT,
  confirmActivation: ACTIVATE_ACCOUNT_ENDPOINT,

  activateAccountLegacy: ACTIVATE_ACCOUNT_LEGACY_ENDPOINT,
  activationLegacy: ACTIVATE_ACCOUNT_LEGACY_ENDPOINT,

  activateFirstUser: ACTIVATE_FIRST_USER_ENDPOINT,
  firstUserActivation: ACTIVATE_FIRST_USER_ENDPOINT,

  validateActivationToken: VALIDATE_ACTIVATION_TOKEN_ENDPOINT,
  validateActivateAccountToken: VALIDATE_ACTIVATION_TOKEN_ENDPOINT,
  validateActivateToken: VALIDATE_ACTIVATION_TOKEN_ENDPOINT,
  activationValidate: VALIDATE_ACTIVATION_TOKEN_ENDPOINT,

  requestPasswordReset: REQUEST_RESET_ENDPOINT,
  resetPasswordRequest: REQUEST_RESET_ENDPOINT,
  forgotPassword: REQUEST_RESET_ENDPOINT,
  recoverPassword: REQUEST_RESET_ENDPOINT,
  recover: REQUEST_RESET_ENDPOINT,
  forgot: REQUEST_RESET_ENDPOINT,

  passwordResetRequest: PASSWORD_RESET_REQUEST_ENDPOINT,

  confirmPasswordReset: CONFIRM_RESET_ENDPOINT,
  confirmResetPassword: CONFIRM_RESET_ENDPOINT,
  resetPasswordConfirm: CONFIRM_RESET_ENDPOINT,
  resetPasswordUpdate: CONFIRM_RESET_ENDPOINT,
  resetPasswordFinalize: CONFIRM_RESET_ENDPOINT,
  changeForgottenPassword: CONFIRM_RESET_ENDPOINT,

  passwordResetConfirm: PASSWORD_RESET_CONFIRM_ENDPOINT,

  validateResetToken: VALIDATE_RESET_ENDPOINT,
  validateResetPasswordToken: VALIDATE_RESET_ENDPOINT,
  resetPasswordValidate: VALIDATE_RESET_ENDPOINT,
  validatePasswordReset: VALIDATE_RESET_ENDPOINT,

  passwordResetValidate: PASSWORD_RESET_VALIDATE_ENDPOINT,
});

export const AUTH_ENDPOINT_CANDIDATES = deepFreeze({
  login: unique([
    LOGIN_ENDPOINT,
  ]),

  logout: unique([
    LOGOUT_ENDPOINT,
  ]),

  me: unique([
    ME_ENDPOINT,
    ME_AUTH_LEGACY_ENDPOINT,
    ME_API_LEGACY_ENDPOINT,
    ME_LEGACY_ENDPOINT,
  ]),

  refresh: unique([
    REFRESH_ENDPOINT,
    TOKEN_REFRESH_ENDPOINT,
    RENEW_ENDPOINT,
  ]),

  twoFactorLogin: unique([
    TWO_FACTOR_LOGIN_ENDPOINT,
    MFA_LOGIN_ENDPOINT,
    OTP_LOGIN_ENDPOINT,
    TWO_FACTOR_VERIFY_ENDPOINT,
    MFA_VERIFY_ENDPOINT,
    OTP_VERIFY_ENDPOINT,
  ]),

  twoFactorRequest: unique([
    TWO_FACTOR_REQUEST_ENDPOINT,
    MFA_REQUEST_ENDPOINT,
    OTP_REQUEST_ENDPOINT,
    "/api/auth/2fa/send",
    "/api/auth/mfa/send",
    "/api/auth/otp/send",
  ]),

  twoFactorResend: unique([
    TWO_FACTOR_RESEND_ENDPOINT,
    MFA_RESEND_ENDPOINT,
    OTP_RESEND_ENDPOINT,
  ]),

  health: unique([
    HEALTH_ENDPOINT,
    HEALTH_LEGACY_ENDPOINT,
    "/api/_health",
    "/health",
  ]),

  activateAccount: unique([
    ACTIVATE_ACCOUNT_ENDPOINT,
    ACTIVATE_ACCOUNT_LEGACY_ENDPOINT,
  ]),

  activateFirstUser: unique([
    ACTIVATE_FIRST_USER_ENDPOINT,
  ]),

  validateActivationToken: unique([
    VALIDATE_ACTIVATION_TOKEN_ENDPOINT,
    "/api/auth/activation/validate",
    "/api/auth/activate-account/validate",
  ]),

  requestPasswordReset: unique([
    REQUEST_RESET_ENDPOINT,
    FORGOT_PASSWORD_ENDPOINT,
    PASSWORD_RESET_REQUEST_ENDPOINT,
    RESET_PASSWORD_REQUEST_ENDPOINT,
  ]),

  confirmPasswordReset: unique([
    CONFIRM_RESET_ENDPOINT,
    RESET_PASSWORD_CONFIRM_ENDPOINT,
    PASSWORD_RESET_CONFIRM_ENDPOINT,
  ]),

  validateResetToken: unique([
    VALIDATE_RESET_ENDPOINT,
    "/api/auth/reset-password-validate",
    PASSWORD_RESET_VALIDATE_ENDPOINT,
  ]),
});

/* =========================================================
   ENDPOINT GROUPS
========================================================= */

const PRIVATE_ME_ENDPOINTS = normalizeEndpointList([
  ME_ENDPOINT,
  ME_AUTH_LEGACY_ENDPOINT,
  ME_API_LEGACY_ENDPOINT,
  ME_LEGACY_ENDPOINT,
]);

function withoutMe(list = []) {
  const privateSet = new Set(PRIVATE_ME_ENDPOINTS);

  return normalizeEndpointList(list).filter((item) => !privateSet.has(item));
}

export const AUTH_ENDPOINT_GROUPS = deepFreeze({
  public: withoutMe([
    AUTH_ENDPOINTS.login,

    AUTH_ENDPOINTS.refresh,
    AUTH_ENDPOINTS.tokenRefresh,
    AUTH_ENDPOINTS.renew,

    ...AUTH_ENDPOINT_CANDIDATES.twoFactorLogin,
    ...AUTH_ENDPOINT_CANDIDATES.twoFactorRequest,
    ...AUTH_ENDPOINT_CANDIDATES.twoFactorResend,

    ...AUTH_ENDPOINT_CANDIDATES.health,

    ...AUTH_ENDPOINT_CANDIDATES.activateAccount,
    ...AUTH_ENDPOINT_CANDIDATES.activateFirstUser,
    ...AUTH_ENDPOINT_CANDIDATES.validateActivationToken,

    ...AUTH_ENDPOINT_CANDIDATES.requestPasswordReset,
    ...AUTH_ENDPOINT_CANDIDATES.confirmPasswordReset,
    ...AUTH_ENDPOINT_CANDIDATES.validateResetToken,
  ]),

  private: normalizeEndpointList([
    AUTH_ENDPOINTS.logout,
    AUTH_ENDPOINTS.me,
    ...AUTH_ENDPOINT_CANDIDATES.me,
  ]),

  controlSkipRefresh: withoutMe([
    AUTH_ENDPOINTS.login,
    AUTH_ENDPOINTS.logout,

    ...AUTH_ENDPOINT_CANDIDATES.refresh,
    ...AUTH_ENDPOINT_CANDIDATES.twoFactorLogin,
    ...AUTH_ENDPOINT_CANDIDATES.twoFactorRequest,
    ...AUTH_ENDPOINT_CANDIDATES.twoFactorResend,
    ...AUTH_ENDPOINT_CANDIDATES.health,
    ...AUTH_ENDPOINT_CANDIDATES.activateAccount,
    ...AUTH_ENDPOINT_CANDIDATES.activateFirstUser,
    ...AUTH_ENDPOINT_CANDIDATES.validateActivationToken,
    ...AUTH_ENDPOINT_CANDIDATES.requestPasswordReset,
    ...AUTH_ENDPOINT_CANDIDATES.confirmPasswordReset,
    ...AUTH_ENDPOINT_CANDIDATES.validateResetToken,
  ]),

  session: normalizeEndpointList([
    AUTH_ENDPOINTS.login,
    AUTH_ENDPOINTS.logout,
    AUTH_ENDPOINTS.me,
    AUTH_ENDPOINTS.refresh,
  ]),

  activation: normalizeEndpointList([
    ...AUTH_ENDPOINT_CANDIDATES.activateAccount,
    ...AUTH_ENDPOINT_CANDIDATES.activateFirstUser,
    ...AUTH_ENDPOINT_CANDIDATES.validateActivationToken,
  ]),

  passwordReset: normalizeEndpointList([
    ...AUTH_ENDPOINT_CANDIDATES.requestPasswordReset,
    ...AUTH_ENDPOINT_CANDIDATES.confirmPasswordReset,
    ...AUTH_ENDPOINT_CANDIDATES.validateResetToken,
  ]),

  twoFactor: normalizeEndpointList([
    ...AUTH_ENDPOINT_CANDIDATES.twoFactorLogin,
    ...AUTH_ENDPOINT_CANDIDATES.twoFactorRequest,
    ...AUTH_ENDPOINT_CANDIDATES.twoFactorResend,
  ]),
});

export const AUTH_PUBLIC_API_PATHS = deepFreeze([...AUTH_ENDPOINT_GROUPS.public]);
export const AUTH_PRIVATE_API_PATHS = deepFreeze([...AUTH_ENDPOINT_GROUPS.private]);
export const AUTH_CONTROL_SKIP_REFRESH_PATHS = deepFreeze([...AUTH_ENDPOINT_GROUPS.controlSkipRefresh]);

/* =========================================================
   STORAGE KEYS
========================================================= */

export const AUTH_STORAGE_KEYS = deepFreeze({
  token: "token",
  accessToken: "access_token",
  refreshToken: "refresh_token",

  tempToken: "temp_token",
  temporaryToken: "temporary_token",
  challengeToken: "challenge_token",
  twoFactorToken: "two_factor_token",
  mfaToken: "mfa_token",
  otpToken: "otp_token",

  sessionId: "session_id",
  sessionUserId: "session_user_id",

  userId: "user_id",
  userSlug: "user_slug",
  userName: "user_name",
  username: "username",

  role: "role",
  roles: "roles",

  lastUsername: "last_username",
  lastLoginIdentifier: "last_login_identifier",
  lastResetIdentifier: "last_reset_identifier",

  redirectAfterLogin: "redirect_after_login",
  postLoginTarget: "post_login_target",

  resetCooldownUntil: "reset_cooldown_until",
  activationPending: "activation_pending",
  twoFactorPending: "two_factor_pending",
  loginCooldownUntil: "login_cooldown_until",
});

export const AUTH_LEGACY_STORAGE_KEYS = deepFreeze({
  token: "onion_token",
  accessToken: "onion_access_token",
  refreshToken: "onion_refresh_token",

  tempToken: "onion_temp_token",
  temporaryToken: "onion_temporary_token",
  challengeToken: "onion_challenge_token",
  twoFactorToken: "onion_two_factor_token",
  mfaToken: "onion_mfa_token",
  otpToken: "onion_otp_token",

  sessionId: "onion_session_id",
  sessionUserId: "onion_session_user_id",

  userId: "onion_user_id",
  userSlug: "onion_user_slug",
  userName: "onion_user_name",
  username: "onion_username",

  role: "onion_role",
  roles: "onion_roles",
});

/* =========================================================
   LIMITS / CONSTANTS
========================================================= */

export const AUTH_CONSTANTS = deepFreeze({
  identifierMaxLength: 160,
  usernameMaxLength: 80,
  emailMaxLength: 254,
  phoneMaxLength: 32,

  passwordMinLength: 8,
  passwordMaxLength: 1024,

  tokenMinLength: 8,
  tokenMaxLength: 8192,

  activationTokenMinLength: 8,
  activationTokenMaxLength: 8192,

  resetTokenMinLength: 8,
  resetTokenMaxLength: 8192,

  tempTokenMinLength: 8,
  tempTokenMaxLength: 8192,

  sessionValueMaxLength: 200,
  textValueMaxLength: 2048,

  requestTimeout: 30000,
  loginTimeoutMs: 30000,
  authPublicTimeoutMs: 30000,

  refreshRetryCooldownMs: 30000,
  refreshMinIntervalMs: 0,
  maxSequentialRefreshFailures: 3,

  activationPasswordMinLength: 8,
  activationPasswordMaxLength: 1024,
  activationRedirectDelayMs: 0,
  activationSuccessRedirectDelayMs: 0,

  resetIdentifierMaxLength: 160,
  resetCooldownDefaultSeconds: 60,
  resetPasswordMinLength: 8,
  resetPasswordMaxLength: 1024,
  resetRedirectDelayMs: 2200,

  loginRedirectDelayMs: 0,
  loginMaxAttemptsBeforeCooldown: 5,
  loginCooldownMs: 30000,
  loginMinIntervalMs: 0,

  twoFactorCodeMinLength: 4,
  twoFactorCodeMaxLength: 12,
  twoFactorMaxAttempts: 5,
  twoFactorCooldownMs: 30000,
});

/* =========================================================
   STATUS / CODES
========================================================= */

export const AUTH_FAILURE_CODES = deepFreeze([
  "INVALID_CREDENTIALS",
  "MISSING_CREDENTIALS",
  "ACCOUNT_TEMPORARILY_LOCKED",
  "ACCOUNT_LOCKED",
  "ACCOUNT_DISABLED",
  "USER_DISABLED",
  "USER_NOT_AVAILABLE",
  "USER_NOT_FOUND",

  "UNAUTHORIZED",
  "FORBIDDEN",

  "TOKEN_INVALID",
  "INVALID_TOKEN",
  "TOKEN_EXPIRED",
  "TOKEN_VERSION_MISMATCH",

  "SESSION_EXPIRED",
  "SESSION_REVOKED",
  "SESSION_NOT_FOUND",
  "INVALID_LOGIN_SESSION",

  "LOGIN_FAILED",
  "AUTH_FAILED",
  "AUTH_RESTORE_FAILED",

  "BAD_CREDENTIALS",
  "CREDENTIALS_INVALID",

  "REFRESH_CONTEXT_MISSING",
  "REFRESH_INVALID_SESSION",
  "REFRESH_EMPTY_RESPONSE",
  "REFRESH_USER_WITHOUT_TOKEN",
  "REFRESH_UNUSABLE_RESPONSE",

  "ME_INVALID_SESSION",
  "ME_USER_MISSING",

  "MISSING_2FA_TEMP_TOKEN",

  "API_CLIENT_MISSING",
  "API_CLIENT_GET_MISSING",
  "API_CLIENT_POST_MISSING",
]);

export const AUTH_SUCCESS_STATUSES = deepFreeze([
  "ok",
  "success",
  "successful",
  "authenticated",
  "active",
  "valid",
  "token_only",
  "token-only",
  "user_only",
  "user-only",
  "session",
  "refreshed",
]);

export const AUTH_2FA_STATUSES = deepFreeze([
  "2fa_required",
  "mfa_required",
  "totp_required",
  "otp_required",
  "two_factor_required",
  "verification_required",
  "challenge_required",
]);

/* =========================================================
   RESOLVE HELPERS
========================================================= */

const ENDPOINT_ALIASES = deepFreeze({
  signIn: "login",
  signin: "login",
  authenticate: "login",

  signOut: "logout",
  signout: "logout",

  profile: "me",
  currentUser: "me",
  current: "me",
  session: "me",

  refreshSession: "refresh",
  tokenRefresh: "refresh",
  renew: "refresh",

  login2fa: "twoFactorLogin",
  mfaLogin: "twoFactorLogin",
  otpLogin: "twoFactorLogin",
  verify2FA: "twoFactorLogin",
  verifyMfa: "twoFactorLogin",
  verifyOtp: "twoFactorLogin",
  twoFactorVerify: "twoFactorLogin",

  requestTwoFactor: "twoFactorRequest",
  requestTwoFactorCode: "twoFactorRequest",
  request2FA: "twoFactorRequest",
  requestMfa: "twoFactorRequest",
  requestOtp: "twoFactorRequest",

  resendTwoFactor: "twoFactorResend",
  resendTwoFactorCode: "twoFactorResend",
  resend2FA: "twoFactorResend",
  resendMfa: "twoFactorResend",
  resendOtp: "twoFactorResend",

  activation: "activateAccount",
  accountActivation: "activateAccount",
  createUserActivation: "activateAccount",
  confirmActivation: "activateAccount",
  activate: "activateAccount",

  firstUserActivation: "activateFirstUser",

  validateActivateAccountToken: "validateActivationToken",
  validateActivateToken: "validateActivationToken",
  activationValidate: "validateActivationToken",

  resetPasswordRequest: "requestPasswordReset",
  forgotPassword: "requestPasswordReset",
  recoverPassword: "requestPasswordReset",
  recover: "requestPasswordReset",
  forgot: "requestPasswordReset",
  passwordResetRequest: "requestPasswordReset",

  confirmResetPassword: "confirmPasswordReset",
  resetPasswordConfirm: "confirmPasswordReset",
  passwordResetConfirm: "confirmPasswordReset",
  resetPasswordUpdate: "confirmPasswordReset",
  resetPasswordFinalize: "confirmPasswordReset",
  changeForgottenPassword: "confirmPasswordReset",

  validateResetPasswordToken: "validateResetToken",
  resetPasswordValidate: "validateResetToken",
  validatePasswordReset: "validateResetToken",
  passwordResetValidate: "validateResetToken",
});

function resolveEndpointKey(key = "") {
  const cleanKey = safeText(key);
  return ENDPOINT_ALIASES[cleanKey] || cleanKey;
}

export function getAuthEndpoint(key = "", fallback = "") {
  const cleanKey = safeText(key);
  const direct = AUTH_ENDPOINTS[cleanKey];

  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  const canonical = AUTH_ENDPOINTS[resolveEndpointKey(cleanKey)];

  if (typeof canonical === "string" && canonical.trim()) {
    return canonical.trim();
  }

  return safeText(fallback);
}

export function getAuthEndpointCandidates(key = "", fallback = "") {
  const candidateKey = resolveEndpointKey(key);
  const candidates = AUTH_ENDPOINT_CANDIDATES[candidateKey];

  if (Array.isArray(candidates) && candidates.length) {
    return [...candidates];
  }

  const endpoint = getAuthEndpoint(candidateKey, fallback);

  return endpoint ? [endpoint] : [];
}

export function getAuthEndpointGroup(key = "") {
  const group = AUTH_ENDPOINT_GROUPS[safeText(key)];
  return Array.isArray(group) ? [...group] : [];
}

export function getAuthStorageKey(key = "", fallback = "") {
  const value = AUTH_STORAGE_KEYS[safeText(key)];
  return typeof value === "string" && value.trim() ? value.trim() : safeText(fallback);
}

export function getAuthLegacyStorageKey(key = "", fallback = "") {
  const value = AUTH_LEGACY_STORAGE_KEYS[safeText(key)];
  return typeof value === "string" && value.trim() ? value.trim() : safeText(fallback);
}

export function getAuthConstant(key = "", fallback = null) {
  const cleanKey = safeText(key);
  return hasOwn(AUTH_CONSTANTS, cleanKey) ? AUTH_CONSTANTS[cleanKey] : fallback;
}

/* =========================================================
   SPECIALIZED GETTERS
========================================================= */

export function getLoginEndpoint() {
  return getAuthEndpoint("login", LOGIN_ENDPOINT);
}

export function getLogoutEndpoint() {
  return getAuthEndpoint("logout", LOGOUT_ENDPOINT);
}

export function getMeEndpoint() {
  return getAuthEndpoint("me", ME_ENDPOINT);
}

export function getRefreshEndpoint() {
  return getAuthEndpoint("refresh", REFRESH_ENDPOINT);
}

export function getRefreshEndpointCandidates() {
  return getAuthEndpointCandidates("refresh", REFRESH_ENDPOINT);
}

export function getTwoFactorLoginEndpoint() {
  return getAuthEndpoint("twoFactorLogin", TWO_FACTOR_LOGIN_ENDPOINT);
}

export function getTwoFactorRequestEndpoint() {
  return getAuthEndpoint("twoFactorRequest", TWO_FACTOR_REQUEST_ENDPOINT);
}

export function getTwoFactorResendEndpoint() {
  return getAuthEndpoint("twoFactorResend", TWO_FACTOR_RESEND_ENDPOINT);
}

export function getTwoFactorLoginEndpointCandidates() {
  return getAuthEndpointCandidates("twoFactorLogin", TWO_FACTOR_LOGIN_ENDPOINT);
}

export function getTwoFactorRequestEndpointCandidates() {
  return getAuthEndpointCandidates("twoFactorRequest", TWO_FACTOR_REQUEST_ENDPOINT);
}

export function getTwoFactorResendEndpointCandidates() {
  return getAuthEndpointCandidates("twoFactorResend", TWO_FACTOR_RESEND_ENDPOINT);
}

export function getAuthHealthEndpoint() {
  return getAuthEndpoint("health", HEALTH_ENDPOINT);
}

export function getActivateAccountEndpoint() {
  return getAuthEndpoint("activateAccount", ACTIVATE_ACCOUNT_ENDPOINT);
}

export function getActivationEndpoint() {
  return getActivateAccountEndpoint();
}

export function getAccountActivationEndpoint() {
  return getActivateAccountEndpoint();
}

export function getActivateFirstUserEndpoint() {
  return getAuthEndpoint("activateFirstUser", ACTIVATE_FIRST_USER_ENDPOINT);
}

export function getValidateActivationTokenEndpoint() {
  return getAuthEndpoint("validateActivationToken", VALIDATE_ACTIVATION_TOKEN_ENDPOINT);
}

export function getValidateActivateAccountTokenEndpoint() {
  return getValidateActivationTokenEndpoint();
}

export function getActivateAccountEndpointCandidates() {
  return getAuthEndpointCandidates("activateAccount", ACTIVATE_ACCOUNT_ENDPOINT);
}

export function getValidateActivationTokenEndpointCandidates() {
  return getAuthEndpointCandidates("validateActivationToken", VALIDATE_ACTIVATION_TOKEN_ENDPOINT);
}

export function getRequestPasswordResetEndpoint() {
  return getAuthEndpoint("requestPasswordReset", REQUEST_RESET_ENDPOINT);
}

export function getForgotPasswordEndpoint() {
  return getRequestPasswordResetEndpoint();
}

export function getRecoverPasswordEndpoint() {
  return getRequestPasswordResetEndpoint();
}

export function getConfirmPasswordResetEndpoint() {
  return getAuthEndpoint("confirmPasswordReset", CONFIRM_RESET_ENDPOINT);
}

export function getConfirmResetPasswordEndpoint() {
  return getConfirmPasswordResetEndpoint();
}

export function getValidateResetTokenEndpoint() {
  return getAuthEndpoint("validateResetToken", VALIDATE_RESET_ENDPOINT);
}

export function getValidateResetPasswordTokenEndpoint() {
  return getValidateResetTokenEndpoint();
}

export function getRequestPasswordResetEndpointCandidates() {
  return getAuthEndpointCandidates("requestPasswordReset", REQUEST_RESET_ENDPOINT);
}

export function getConfirmPasswordResetEndpointCandidates() {
  return getAuthEndpointCandidates("confirmPasswordReset", CONFIRM_RESET_ENDPOINT);
}

export function getValidateResetTokenEndpointCandidates() {
  return getAuthEndpointCandidates("validateResetToken", VALIDATE_RESET_ENDPOINT);
}

/* =========================================================
   LIMIT GETTERS
========================================================= */

export function getIdentifierMaxLength() {
  return clampNumber(getAuthConstant("identifierMaxLength", 160), 1, 1024);
}

export function getPasswordMinLength() {
  return clampNumber(getAuthConstant("passwordMinLength", 8), 1, 1024);
}

export function getPasswordMaxLength() {
  return clampNumber(getAuthConstant("passwordMaxLength", 1024), getPasswordMinLength(), 8192);
}

export function getActivationPasswordMinLength() {
  return clampNumber(getAuthConstant("activationPasswordMinLength", getPasswordMinLength()), 1, getPasswordMaxLength());
}

export function getActivationPasswordMaxLength() {
  return clampNumber(getAuthConstant("activationPasswordMaxLength", getPasswordMaxLength()), getActivationPasswordMinLength(), 8192);
}

export function getResetPasswordMinLength() {
  return clampNumber(getAuthConstant("resetPasswordMinLength", getPasswordMinLength()), 1, getPasswordMaxLength());
}

export function getResetPasswordMaxLength() {
  return clampNumber(getAuthConstant("resetPasswordMaxLength", getPasswordMaxLength()), getResetPasswordMinLength(), 8192);
}

export function getTokenMinLength() {
  return clampNumber(getAuthConstant("tokenMinLength", 8), 1, 4096);
}

export function getTokenMaxLength() {
  return clampNumber(getAuthConstant("tokenMaxLength", 8192), getTokenMinLength(), 32768);
}

export function getActivationTokenMinLength() {
  return clampNumber(getAuthConstant("activationTokenMinLength", getTokenMinLength()), 1, getTokenMaxLength());
}

export function getActivationTokenMaxLength() {
  return clampNumber(getAuthConstant("activationTokenMaxLength", getTokenMaxLength()), getActivationTokenMinLength(), 32768);
}

export function getResetTokenMinLength() {
  return clampNumber(getAuthConstant("resetTokenMinLength", getTokenMinLength()), 1, getTokenMaxLength());
}

export function getResetTokenMaxLength() {
  return clampNumber(getAuthConstant("resetTokenMaxLength", getTokenMaxLength()), getResetTokenMinLength(), 32768);
}

export function getTempTokenMinLength() {
  return clampNumber(getAuthConstant("tempTokenMinLength", 8), 1, getTokenMaxLength());
}

export function getTempTokenMaxLength() {
  return clampNumber(getAuthConstant("tempTokenMaxLength", getTokenMaxLength()), getTempTokenMinLength(), 32768);
}

export function getSessionValueMaxLength() {
  return clampNumber(getAuthConstant("sessionValueMaxLength", 200), 16, 2048);
}

export function getRequestTimeout() {
  return clampNumber(getAuthConstant("requestTimeout", 30000), 1000, 120000);
}

export function getLoginTimeoutMs() {
  return clampNumber(getAuthConstant("loginTimeoutMs", 30000), 1000, 120000);
}

export function getAuthPublicTimeoutMs() {
  return clampNumber(getAuthConstant("authPublicTimeoutMs", 30000), 1000, 120000);
}

export function getRefreshRetryCooldownMs() {
  return clampNumber(getAuthConstant("refreshRetryCooldownMs", 30000), 0, 600000);
}

export function getMaxSequentialRefreshFailures() {
  return clampNumber(getAuthConstant("maxSequentialRefreshFailures", 3), 0, 100);
}

export function getLoginCooldownMs() {
  return clampNumber(getAuthConstant("loginCooldownMs", 30000), 0, 600000);
}

export function getLoginMaxAttemptsBeforeCooldown() {
  return clampNumber(getAuthConstant("loginMaxAttemptsBeforeCooldown", 5), 1, 100);
}

export function getTwoFactorCodeMinLength() {
  return clampNumber(getAuthConstant("twoFactorCodeMinLength", 4), 1, 32);
}

export function getTwoFactorCodeMaxLength() {
  return clampNumber(getAuthConstant("twoFactorCodeMaxLength", 12), getTwoFactorCodeMinLength(), 64);
}

/* =========================================================
   MATCH HELPERS
========================================================= */

export function isPublicTechnicalRoute(path = "") {
  const normalized = normalizeRoutePath(path);

  if (!normalized) return false;

  return AUTH_PUBLIC_TECHNICAL_ROUTES.some((route) => {
    const cleanRoute = normalizeRoutePath(route);
    return normalized === cleanRoute || normalized.startsWith(`${cleanRoute}/`);
  });
}

export function isActivationRoute(path = "") {
  const normalized = normalizeRoutePath(path);

  return (
    normalized === "/activate-account" ||
    normalized.startsWith("/activate-account/") ||
    normalized === "/activate" ||
    normalized.startsWith("/activate/")
  );
}

export function isResetPasswordRoute(path = "") {
  const normalized = normalizeRoutePath(path);

  return (
    normalized === "/reset-password" ||
    normalized.startsWith("/reset-password/") ||
    normalized === "/password-reset" ||
    normalized.startsWith("/password-reset/") ||
    normalized === "/forgot-password" ||
    normalized.startsWith("/forgot-password/") ||
    normalized === "/recover-password" ||
    normalized.startsWith("/recover-password/")
  );
}

export function isResetPasswordConfirmRoute(path = "") {
  const normalized = normalizeRoutePath(path);

  return (
    normalized === "/reset-password/confirm" ||
    normalized.startsWith("/reset-password/confirm/") ||
    normalized === "/password-reset/confirm" ||
    normalized.startsWith("/password-reset/confirm/")
  );
}

export function isTwoFactorRoute(path = "") {
  const normalized = normalizeRoutePath(path);

  return (
    normalized === "/2fa" ||
    normalized.startsWith("/2fa/") ||
    normalized === "/otp" ||
    normalized.startsWith("/otp/") ||
    normalized === "/mfa" ||
    normalized.startsWith("/mfa/")
  );
}

export function isMeEndpoint(path = "") {
  return endpointInList(path, PRIVATE_ME_ENDPOINTS);
}

export function isAuthEndpoint(path = "") {
  return (
    isMeEndpoint(path) ||
    endpointInList(path, Object.values(AUTH_ENDPOINTS)) ||
    endpointInList(path, AUTH_ENDPOINT_GROUPS.public) ||
    endpointInList(path, AUTH_ENDPOINT_GROUPS.private) ||
    endpointInList(path, AUTH_ENDPOINT_GROUPS.controlSkipRefresh)
  );
}

export function isEndpointInGroup(path = "", group = []) {
  return endpointInList(path, group);
}

export function isPublicAuthEndpoint(path = "") {
  if (isMeEndpoint(path)) return false;
  return endpointInList(path, AUTH_ENDPOINT_GROUPS.public);
}

export function isPrivateAuthEndpoint(path = "") {
  return isMeEndpoint(path) || endpointInList(path, AUTH_ENDPOINT_GROUPS.private);
}

export function isAuthControlSkipRefreshEndpoint(path = "") {
  if (isMeEndpoint(path)) return false;
  return endpointInList(path, AUTH_CONTROL_SKIP_REFRESH_PATHS);
}

export function isPasswordResetEndpoint(path = "") {
  return endpointInList(path, AUTH_ENDPOINT_GROUPS.passwordReset);
}

export function isActivationEndpoint(path = "") {
  return endpointInList(path, AUTH_ENDPOINT_GROUPS.activation);
}

export function isTwoFactorEndpoint(path = "") {
  return endpointInList(path, AUTH_ENDPOINT_GROUPS.twoFactor);
}

export function isAuthFailureCode(code = "") {
  return AUTH_FAILURE_CODES.includes(safeText(code).toUpperCase());
}

export function isAuth2FAStatus(status = "") {
  return AUTH_2FA_STATUSES.includes(safeText(status).toLowerCase());
}

export function isAuthSuccessStatus(status = "") {
  return AUTH_SUCCESS_STATUSES.includes(safeText(status).toLowerCase());
}

/* =========================================================
   TOKEN URL HELPERS
========================================================= */

export function getAuthTokenParamNames(type = "generic") {
  const names = AUTH_TOKEN_PARAM_NAMES[safeText(type, "generic")];

  return Array.isArray(names)
    ? [...names]
    : [...AUTH_TOKEN_PARAM_NAMES.generic];
}

export function getAllAuthTokenParamNames() {
  return unique(Object.values(AUTH_TOKEN_PARAM_NAMES).flat());
}

export function getTechnicalRouteAlias(key = "", fallback = "") {
  return safeText(AUTH_TECHNICAL_ROUTE_ALIASES[safeText(key)], fallback);
}

export function hasTokenParam(search = "", type = "generic") {
  const raw = safeText(search);

  if (!raw) return false;

  const names = getAuthTokenParamNames(type);

  try {
    const params = new URLSearchParams(raw.startsWith("?") ? raw : `?${raw}`);
    return names.some((name) => Boolean(safeText(params.get(name))));
  } catch {
    return false;
  }
}

export function hasTokenInUrl(value = "", type = "generic") {
  const raw = safeText(value);

  if (!raw) return false;

  const path = pathFromUrlLike(raw) || raw;
  const { search, hash } = splitSearchAndHash(path);

  if (search && hasTokenParam(search, type)) return true;

  if (hash && hash.includes("?")) {
    const query = hash.split("?").slice(1).join("?");
    if (query && hasTokenParam(query, type)) return true;
  }

  return false;
}

export function hasActivationToken(value = "") {
  const normalized = normalizeRoutePath(pathFromUrlLike(value) || value);

  if (
    normalized.startsWith("/activate-account/") ||
    normalized.startsWith("/activate/")
  ) {
    return true;
  }

  return hasTokenInUrl(value, "activation");
}

export function hasResetToken(value = "") {
  const normalized = normalizeRoutePath(pathFromUrlLike(value) || value);

  if (
    normalized.startsWith("/reset-password/confirm/") ||
    normalized.startsWith("/password-reset/confirm/")
  ) {
    return true;
  }

  return hasTokenInUrl(value, "reset");
}

export function hasTwoFactorToken(value = "") {
  return hasTokenInUrl(value, "twoFactor");
}

/* =========================================================
   SNAPSHOT
========================================================= */

function sanitizeSnapshot(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeSnapshot);
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      output[key] = /token|password|secret|authorization/i.test(key)
        ? item
          ? "***"
          : item
        : sanitizeSnapshot(item);
    }

    return output;
  }

  return value;
}

export function getAuthConstantsSnapshot() {
  return sanitizeSnapshot({
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
      roles: ["admin", "user"],
      meAlwaysPrivate: true,
      publicAuthNoRefresh: true,
      publicAuthNoLogout: true,
      publicAuthNoRetry: true,
      supportsHashRouter: true,
      supportsScopedUserPrefix: true,
    },
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default deepFreeze({
  AUTH_CONSTANTS_VERSION,

  LOGIN_ENDPOINT,
  LOGOUT_ENDPOINT,
  ME_ENDPOINT,
  ME_API_LEGACY_ENDPOINT,
  ME_LEGACY_ENDPOINT,
  ME_AUTH_LEGACY_ENDPOINT,
  REFRESH_ENDPOINT,
  TOKEN_REFRESH_ENDPOINT,
  RENEW_ENDPOINT,

  TWO_FACTOR_LOGIN_ENDPOINT,
  TWO_FACTOR_VERIFY_ENDPOINT,
  TWO_FACTOR_REQUEST_ENDPOINT,
  TWO_FACTOR_RESEND_ENDPOINT,
  MFA_LOGIN_ENDPOINT,
  MFA_VERIFY_ENDPOINT,
  MFA_REQUEST_ENDPOINT,
  MFA_RESEND_ENDPOINT,
  OTP_LOGIN_ENDPOINT,
  OTP_VERIFY_ENDPOINT,
  OTP_REQUEST_ENDPOINT,
  OTP_RESEND_ENDPOINT,

  HEALTH_ENDPOINT,
  HEALTH_LEGACY_ENDPOINT,

  ACTIVATE_ACCOUNT_ENDPOINT,
  ACTIVATE_ACCOUNT_LEGACY_ENDPOINT,
  ACTIVATE_FIRST_USER_ENDPOINT,
  VALIDATE_ACTIVATION_TOKEN_ENDPOINT,

  REQUEST_RESET_ENDPOINT,
  FORGOT_PASSWORD_ENDPOINT,
  PASSWORD_RESET_REQUEST_ENDPOINT,
  RESET_PASSWORD_REQUEST_ENDPOINT,
  CONFIRM_RESET_ENDPOINT,
  RESET_PASSWORD_CONFIRM_ENDPOINT,
  PASSWORD_RESET_CONFIRM_ENDPOINT,
  VALIDATE_RESET_ENDPOINT,
  PASSWORD_RESET_VALIDATE_ENDPOINT,

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

  getTwoFactorLoginEndpoint,
  getTwoFactorRequestEndpoint,
  getTwoFactorResendEndpoint,
  getTwoFactorLoginEndpointCandidates,
  getTwoFactorRequestEndpointCandidates,
  getTwoFactorResendEndpointCandidates,

  getAuthHealthEndpoint,

  getActivateAccountEndpoint,
  getActivationEndpoint,
  getAccountActivationEndpoint,
  getActivateFirstUserEndpoint,
  getValidateActivationTokenEndpoint,
  getValidateActivateAccountTokenEndpoint,
  getActivateAccountEndpointCandidates,
  getValidateActivationTokenEndpointCandidates,

  getRequestPasswordResetEndpoint,
  getForgotPasswordEndpoint,
  getRecoverPasswordEndpoint,
  getConfirmPasswordResetEndpoint,
  getConfirmResetPasswordEndpoint,
  getValidateResetTokenEndpoint,
  getValidateResetPasswordTokenEndpoint,
  getRequestPasswordResetEndpointCandidates,
  getConfirmPasswordResetEndpointCandidates,
  getValidateResetTokenEndpointCandidates,

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
