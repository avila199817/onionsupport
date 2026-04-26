/* =========================================================
   Onion SPA - Auth Constants
   Archivo: src/features/auth/constants.js

   Responsabilidades:
   - centralizar endpoints auth
   - centralizar endpoint de activación de cuenta
   - centralizar claves storage auxiliar
   - centralizar límites y constantes sesión
   - exponer endpoints password-reset request / confirm
   - soportar aliases legacy sin romper compatibilidad
   - endurecer límites comunes del módulo auth
   - helpers públicos estables del módulo
   - blindaje enterprise

   HARDENING EXTREMO:
   - Object.freeze total
   - aliases estables
   - helpers tolerantes
   - endpoints agrupados por intención
   - rutas SPA técnicas públicas
   - token param names centralizados
   - límites numéricos normalizados
   - snapshot debug seguro
========================================================= */

/* =========================================================
   VERSION
========================================================= */

export const AUTH_CONSTANTS_VERSION =
  "10.0.0";

/* =========================================================
   ENDPOINTS BASE
========================================================= */

export const LOGIN_ENDPOINT =
  "/api/auth/login";

export const LOGOUT_ENDPOINT =
  "/api/auth/logout";

export const ME_ENDPOINT =
  "/api/auth/me";

export const REFRESH_ENDPOINT =
  "/api/auth/refresh";

export const TWO_FACTOR_LOGIN_ENDPOINT =
  "/api/auth/2fa/login";

export const HEALTH_ENDPOINT =
  "/api/auth/_health";

export const ACTIVATE_ACCOUNT_ENDPOINT =
  "/api/auth/activate-account";

export const ACTIVATE_FIRST_USER_ENDPOINT =
  "/api/auth/activate/first-user";

export const REQUEST_RESET_ENDPOINT =
  "/api/auth/reset-password-request";

export const CONFIRM_RESET_ENDPOINT =
  "/api/auth/reset-password-confirm";

export const VALIDATE_RESET_ENDPOINT =
  "/api/auth/reset-password/validate";

/* =========================================================
   SPA PUBLIC TECHNICAL ROUTES
========================================================= */

export const AUTH_PUBLIC_TECHNICAL_ROUTES =
  Object.freeze([
    "/activate-account",
    "/reset-password",
    "/reset-password/confirm",
    "/forgot-password",
    "/recover-password",
    "/password-reset",
  ]);

export const AUTH_TECHNICAL_ROUTE_ALIASES =
  Object.freeze({
    activateAccount:
      "/activate-account",

    activation:
      "/activate-account",

    resetPassword:
      "/reset-password",

    forgotPassword:
      "/forgot-password",

    recoverPassword:
      "/recover-password",

    passwordReset:
      "/password-reset",

    resetPasswordConfirm:
      "/reset-password/confirm",

    confirmResetPassword:
      "/reset-password/confirm",
  });

/* =========================================================
   TOKEN PARAMS
========================================================= */

export const AUTH_TOKEN_PARAM_NAMES =
  Object.freeze({
    generic:
      Object.freeze([
        "token",
        "code",
        "t",
      ]),

    activation:
      Object.freeze([
        "token",
        "activationToken",
        "activateToken",
        "code",
        "t",
      ]),

    reset:
      Object.freeze([
        "token",
        "resetToken",
        "passwordResetToken",
        "code",
        "t",
      ]),

    twoFactor:
      Object.freeze([
        "tempToken",
        "temp_token",
        "temporaryToken",
        "temporary_token",
        "twoFactorToken",
        "two_factor_token",
        "mfaToken",
        "mfa_token",
      ]),
  });

/* =========================================================
   ENDPOINTS
========================================================= */

export const AUTH_ENDPOINTS =
  Object.freeze({
    /* =====================================================
       SESIÓN
    ===================================================== */
    login:
      LOGIN_ENDPOINT,

    signIn:
      LOGIN_ENDPOINT,

    signin:
      LOGIN_ENDPOINT,

    logout:
      LOGOUT_ENDPOINT,

    signOut:
      LOGOUT_ENDPOINT,

    me:
      ME_ENDPOINT,

    profile:
      ME_ENDPOINT,

    currentUser:
      ME_ENDPOINT,

    session:
      ME_ENDPOINT,

    refresh:
      REFRESH_ENDPOINT,

    refreshSession:
      REFRESH_ENDPOINT,

    tokenRefresh:
      REFRESH_ENDPOINT,

    /* =====================================================
       2FA / MFA
    ===================================================== */
    twoFactorLogin:
      TWO_FACTOR_LOGIN_ENDPOINT,

    login2fa:
      TWO_FACTOR_LOGIN_ENDPOINT,

    mfaLogin:
      TWO_FACTOR_LOGIN_ENDPOINT,

    verify2FA:
      TWO_FACTOR_LOGIN_ENDPOINT,

    verifyMfa:
      TWO_FACTOR_LOGIN_ENDPOINT,

    /* =====================================================
       HEALTH
    ===================================================== */
    health:
      HEALTH_ENDPOINT,

    authHealth:
      HEALTH_ENDPOINT,

    /* =====================================================
       ACTIVACIÓN DE CUENTA
    ===================================================== */
    activateAccount:
      ACTIVATE_ACCOUNT_ENDPOINT,

    activation:
      ACTIVATE_ACCOUNT_ENDPOINT,

    accountActivation:
      ACTIVATE_ACCOUNT_ENDPOINT,

    createUserActivation:
      ACTIVATE_ACCOUNT_ENDPOINT,

    confirmActivation:
      ACTIVATE_ACCOUNT_ENDPOINT,

    activate:
      ACTIVATE_ACCOUNT_ENDPOINT,

    activateFirstUser:
      ACTIVATE_FIRST_USER_ENDPOINT,

    firstUserActivation:
      ACTIVATE_FIRST_USER_ENDPOINT,

    /* =====================================================
       PASSWORD RESET REQUEST
    ===================================================== */
    requestPasswordReset:
      REQUEST_RESET_ENDPOINT,

    resetPasswordRequest:
      REQUEST_RESET_ENDPOINT,

    forgotPassword:
      REQUEST_RESET_ENDPOINT,

    recoverPassword:
      REQUEST_RESET_ENDPOINT,

    recover:
      REQUEST_RESET_ENDPOINT,

    forgot:
      REQUEST_RESET_ENDPOINT,

    passwordResetRequest:
      REQUEST_RESET_ENDPOINT,

    /* =====================================================
       PASSWORD RESET CONFIRM
    ===================================================== */
    confirmPasswordReset:
      CONFIRM_RESET_ENDPOINT,

    confirmResetPassword:
      CONFIRM_RESET_ENDPOINT,

    resetPasswordConfirm:
      CONFIRM_RESET_ENDPOINT,

    passwordResetConfirm:
      CONFIRM_RESET_ENDPOINT,

    resetPasswordUpdate:
      CONFIRM_RESET_ENDPOINT,

    resetPasswordFinalize:
      CONFIRM_RESET_ENDPOINT,

    changeForgottenPassword:
      CONFIRM_RESET_ENDPOINT,

    /* =====================================================
       VALIDATE TOKEN
    ===================================================== */
    validateResetToken:
      VALIDATE_RESET_ENDPOINT,

    resetPasswordValidate:
      VALIDATE_RESET_ENDPOINT,

    validatePasswordReset:
      VALIDATE_RESET_ENDPOINT,

    passwordResetValidate:
      VALIDATE_RESET_ENDPOINT,
  });

/* =========================================================
   ENDPOINT GROUPS
========================================================= */

export const AUTH_ENDPOINT_GROUPS =
  Object.freeze({
    public:
      Object.freeze([
        AUTH_ENDPOINTS.login,
        AUTH_ENDPOINTS.refresh,
        AUTH_ENDPOINTS.twoFactorLogin,
        AUTH_ENDPOINTS.health,
        AUTH_ENDPOINTS.activateAccount,
        AUTH_ENDPOINTS.activateFirstUser,
        AUTH_ENDPOINTS.requestPasswordReset,
        AUTH_ENDPOINTS.confirmPasswordReset,
        AUTH_ENDPOINTS.validateResetToken,
      ]),

    private:
      Object.freeze([
        AUTH_ENDPOINTS.logout,
        AUTH_ENDPOINTS.me,
      ]),

    session:
      Object.freeze([
        AUTH_ENDPOINTS.login,
        AUTH_ENDPOINTS.logout,
        AUTH_ENDPOINTS.me,
        AUTH_ENDPOINTS.refresh,
      ]),

    activation:
      Object.freeze([
        AUTH_ENDPOINTS.activateAccount,
        AUTH_ENDPOINTS.activateFirstUser,
      ]),

    passwordReset:
      Object.freeze([
        AUTH_ENDPOINTS.requestPasswordReset,
        AUTH_ENDPOINTS.confirmPasswordReset,
        AUTH_ENDPOINTS.validateResetToken,
      ]),
  });

/* =========================================================
   STORAGE KEYS
========================================================= */

export const AUTH_STORAGE_KEYS =
  Object.freeze({
    /* TOKENS */
    refreshToken:
      "refresh_token",

    tempToken:
      "temp_token",

    accessToken:
      "access_token",

    /* SESSION */
    sessionId:
      "session_id",

    sessionUserId:
      "session_user_id",

    /* USER */
    userSlug:
      "user_slug",

    userName:
      "user_name",

    userId:
      "user_id",

    role:
      "role",

    /* UX */
    lastUsername:
      "last_username",

    lastLoginIdentifier:
      "last_login_identifier",

    lastResetIdentifier:
      "last_reset_identifier",

    redirectAfterLogin:
      "redirect_after_login",

    postLoginTarget:
      "post_login_target",

    /* FLOW */
    resetCooldownUntil:
      "reset_cooldown_until",

    activationPending:
      "activation_pending",

    twoFactorPending:
      "two_factor_pending",
  });

export const AUTH_LEGACY_STORAGE_KEYS =
  Object.freeze({
    token:
      "onion_token",

    accessToken:
      "onion_access_token",

    refreshToken:
      "onion_refresh_token",

    tempToken:
      "onion_temp_token",

    sessionId:
      "onion_session_id",

    sessionUserId:
      "onion_session_user_id",

    userId:
      "onion_user_id",

    userSlug:
      "onion_user_slug",

    userName:
      "onion_user_name",

    role:
      "onion_role",
  });

/* =========================================================
   CONSTANTS
========================================================= */

export const AUTH_CONSTANTS =
  Object.freeze({
    /* INPUTS */
    identifierMaxLength:
      160,

    usernameMaxLength:
      80,

    emailMaxLength:
      254,

    phoneMaxLength:
      32,

    passwordMinLength:
      8,

    passwordMaxLength:
      1024,

    /* TOKENS */
    tokenMinLength:
      16,

    tokenMaxLength:
      4096,

    activationTokenMinLength:
      16,

    activationTokenMaxLength:
      4096,

    resetTokenMinLength:
      16,

    resetTokenMaxLength:
      4096,

    tempTokenMinLength:
      8,

    tempTokenMaxLength:
      4096,

    sessionValueMaxLength:
      128,

    /* REFRESH */
    refreshRetryCooldownMs:
      30000,

    refreshMinIntervalMs:
      0,

    maxSequentialRefreshFailures:
      3,

    /* REQUEST */
    requestTimeout:
      15000,

    /* ACTIVATION */
    activationPasswordMinLength:
      8,

    activationPasswordMaxLength:
      1024,

    activationRedirectDelayMs:
      0,

    activationSuccessRedirectDelayMs:
      0,

    /* RESET PASSWORD */
    resetIdentifierMaxLength:
      160,

    resetCooldownDefaultSeconds:
      60,

    resetPasswordMinLength:
      8,

    resetPasswordMaxLength:
      1024,

    resetRedirectDelayMs:
      2200,

    /* LOGIN */
    loginRedirectDelayMs:
      0,

    loginMaxAttemptsBeforeCooldown:
      5,

    loginCooldownMs:
      30000,

    /* 2FA */
    twoFactorCodeMinLength:
      4,

    twoFactorCodeMaxLength:
      12,

    twoFactorMaxAttempts:
      5,
  });

/* =========================================================
   AUTH FAILURE CODES
========================================================= */

export const AUTH_FAILURE_CODES =
  Object.freeze([
    "INVALID_CREDENTIALS",
    "MISSING_CREDENTIALS",
    "ACCOUNT_TEMPORARILY_LOCKED",
    "ACCOUNT_DISABLED",
    "USER_DISABLED",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "TOKEN_INVALID",
    "INVALID_TOKEN",
    "SESSION_EXPIRED",
    "INVALID_LOGIN_SESSION",
    "LOGIN_FAILED",
    "AUTH_FAILED",
  ]);

/* =========================================================
   HELPERS BASE
========================================================= */

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

export function normalizeEndpointPath(path = "") {
  const raw =
    safeText(path, "");

  if (!raw) {
    return "";
  }

  try {
    const parsed =
      new URL(
        raw,
        "http://localhost"
      );

    return safeText(
      parsed.pathname,
      raw
    ).toLowerCase();
  } catch {
    return raw
      .split("?")[0]
      .split("#")[0]
      .trim()
      .toLowerCase();
  }
}

/* =========================================================
   GENERIC GETTERS
========================================================= */

export function getAuthEndpoint(key = "", fallback = "") {
  const endpoint =
    AUTH_ENDPOINTS[key];

  if (
    typeof endpoint === "string" &&
    endpoint.trim()
  ) {
    return endpoint.trim();
  }

  return safeText(
    fallback,
    ""
  );
}

export function getAuthStorageKey(key = "", fallback = "") {
  const storageKey =
    AUTH_STORAGE_KEYS[key];

  if (
    typeof storageKey === "string" &&
    storageKey.trim()
  ) {
    return storageKey.trim();
  }

  return safeText(
    fallback,
    ""
  );
}

export function getAuthLegacyStorageKey(key = "", fallback = "") {
  const storageKey =
    AUTH_LEGACY_STORAGE_KEYS[key];

  if (
    typeof storageKey === "string" &&
    storageKey.trim()
  ) {
    return storageKey.trim();
  }

  return safeText(
    fallback,
    ""
  );
}

export function getAuthConstant(key = "", fallback = null) {
  if (
    Object.prototype.hasOwnProperty.call(
      AUTH_CONSTANTS,
      key
    )
  ) {
    return AUTH_CONSTANTS[key];
  }

  return fallback;
}

/* =========================================================
   SPECIALIZED HELPERS · SESSION
========================================================= */

export function getLoginEndpoint() {
  return getAuthEndpoint(
    "login",
    LOGIN_ENDPOINT
  );
}

export function getLogoutEndpoint() {
  return getAuthEndpoint(
    "logout",
    LOGOUT_ENDPOINT
  );
}

export function getMeEndpoint() {
  return getAuthEndpoint(
    "me",
    ME_ENDPOINT
  );
}

export function getRefreshEndpoint() {
  return getAuthEndpoint(
    "refresh",
    REFRESH_ENDPOINT
  );
}

export function getTwoFactorLoginEndpoint() {
  return getAuthEndpoint(
    "twoFactorLogin",
    TWO_FACTOR_LOGIN_ENDPOINT
  );
}

export function getAuthHealthEndpoint() {
  return getAuthEndpoint(
    "health",
    HEALTH_ENDPOINT
  );
}

/* =========================================================
   SPECIALIZED HELPERS · ACTIVATION
========================================================= */

export function getActivateAccountEndpoint() {
  return getAuthEndpoint(
    "activateAccount",
    ACTIVATE_ACCOUNT_ENDPOINT
  );
}

export function getActivationEndpoint() {
  return getActivateAccountEndpoint();
}

export function getAccountActivationEndpoint() {
  return getActivateAccountEndpoint();
}

export function getActivateFirstUserEndpoint() {
  return getAuthEndpoint(
    "activateFirstUser",
    ACTIVATE_FIRST_USER_ENDPOINT
  );
}

/* =========================================================
   SPECIALIZED HELPERS · PASSWORD RESET
========================================================= */

export function getRequestPasswordResetEndpoint() {
  return getAuthEndpoint(
    "requestPasswordReset",
    REQUEST_RESET_ENDPOINT
  );
}

export function getConfirmPasswordResetEndpoint() {
  return getAuthEndpoint(
    "confirmPasswordReset",
    CONFIRM_RESET_ENDPOINT
  );
}

export function getValidateResetTokenEndpoint() {
  return getAuthEndpoint(
    "validateResetToken",
    VALIDATE_RESET_ENDPOINT
  );
}

/* =========================================================
   SPECIALIZED HELPERS · LIMITS
========================================================= */

export function getPasswordMinLength() {
  return clampNumber(
    getAuthConstant("passwordMinLength", 8),
    1,
    1024
  );
}

export function getPasswordMaxLength() {
  return clampNumber(
    getAuthConstant("passwordMaxLength", 1024),
    getPasswordMinLength(),
    8192
  );
}

export function getActivationPasswordMinLength() {
  return clampNumber(
    getAuthConstant(
      "activationPasswordMinLength",
      getPasswordMinLength()
    ),
    1,
    getPasswordMaxLength()
  );
}

export function getActivationPasswordMaxLength() {
  return clampNumber(
    getAuthConstant(
      "activationPasswordMaxLength",
      getPasswordMaxLength()
    ),
    getActivationPasswordMinLength(),
    8192
  );
}

export function getResetPasswordMinLength() {
  return clampNumber(
    getAuthConstant(
      "resetPasswordMinLength",
      getPasswordMinLength()
    ),
    1,
    getPasswordMaxLength()
  );
}

export function getResetPasswordMaxLength() {
  return clampNumber(
    getAuthConstant(
      "resetPasswordMaxLength",
      getPasswordMaxLength()
    ),
    getResetPasswordMinLength(),
    8192
  );
}

export function getTokenMinLength() {
  return clampNumber(
    getAuthConstant("tokenMinLength", 16),
    1,
    4096
  );
}

export function getTokenMaxLength() {
  return clampNumber(
    getAuthConstant("tokenMaxLength", 4096),
    getTokenMinLength(),
    32768
  );
}

export function getActivationTokenMinLength() {
  return clampNumber(
    getAuthConstant(
      "activationTokenMinLength",
      getTokenMinLength()
    ),
    1,
    getTokenMaxLength()
  );
}

export function getActivationTokenMaxLength() {
  return clampNumber(
    getAuthConstant(
      "activationTokenMaxLength",
      getTokenMaxLength()
    ),
    getActivationTokenMinLength(),
    32768
  );
}

export function getResetTokenMinLength() {
  return clampNumber(
    getAuthConstant(
      "resetTokenMinLength",
      getTokenMinLength()
    ),
    1,
    getTokenMaxLength()
  );
}

export function getResetTokenMaxLength() {
  return clampNumber(
    getAuthConstant(
      "resetTokenMaxLength",
      getTokenMaxLength()
    ),
    getResetTokenMinLength(),
    32768
  );
}

export function getRequestTimeout() {
  return clampNumber(
    getAuthConstant("requestTimeout", 15000),
    1000,
    120000
  );
}

export function getRefreshRetryCooldownMs() {
  return clampNumber(
    getAuthConstant("refreshRetryCooldownMs", 30000),
    0,
    600000
  );
}

export function getMaxSequentialRefreshFailures() {
  return clampNumber(
    getAuthConstant("maxSequentialRefreshFailures", 3),
    0,
    100
  );
}

/* =========================================================
   ROUTE / ENDPOINT MATCH HELPERS
========================================================= */

export function isPublicTechnicalRoute(path = "") {
  const normalized =
    normalizeEndpointPath(path);

  if (!normalized) {
    return false;
  }

  return AUTH_PUBLIC_TECHNICAL_ROUTES.some((route) => {
    const cleanRoute =
      normalizeEndpointPath(route);

    return (
      normalized === cleanRoute ||
      normalized.startsWith(`${cleanRoute}/`)
    );
  });
}

export function isActivationRoute(path = "") {
  const normalized =
    normalizeEndpointPath(path);

  return (
    normalized === "/activate-account" ||
    normalized.startsWith("/activate-account/")
  );
}

export function isResetPasswordConfirmRoute(path = "") {
  const normalized =
    normalizeEndpointPath(path);

  return (
    normalized === "/reset-password/confirm" ||
    normalized.startsWith("/reset-password/confirm/")
  );
}

export function isAuthEndpoint(path = "") {
  const normalized =
    normalizeEndpointPath(path);

  if (!normalized) {
    return false;
  }

  return Object.values(AUTH_ENDPOINTS).some((endpoint) => {
    const cleanEndpoint =
      normalizeEndpointPath(endpoint);

    return normalized === cleanEndpoint;
  });
}

export function isPublicAuthEndpoint(path = "") {
  const normalized =
    normalizeEndpointPath(path);

  if (!normalized) {
    return false;
  }

  return AUTH_ENDPOINT_GROUPS.public.some((endpoint) => {
    const cleanEndpoint =
      normalizeEndpointPath(endpoint);

    return normalized === cleanEndpoint;
  });
}

export function isPasswordResetEndpoint(path = "") {
  const normalized =
    normalizeEndpointPath(path);

  return AUTH_ENDPOINT_GROUPS.passwordReset.some((endpoint) => {
    const cleanEndpoint =
      normalizeEndpointPath(endpoint);

    return normalized === cleanEndpoint;
  });
}

export function isActivationEndpoint(path = "") {
  const normalized =
    normalizeEndpointPath(path);

  return AUTH_ENDPOINT_GROUPS.activation.some((endpoint) => {
    const cleanEndpoint =
      normalizeEndpointPath(endpoint);

    return normalized === cleanEndpoint;
  });
}

export function getAuthTokenParamNames(type = "generic") {
  const names =
    AUTH_TOKEN_PARAM_NAMES[type];

  return Array.isArray(names)
    ? [...names]
    : [...AUTH_TOKEN_PARAM_NAMES.generic];
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getAuthConstantsSnapshot() {
  return {
    version:
      AUTH_CONSTANTS_VERSION,

    endpoints:
      AUTH_ENDPOINTS,

    endpointGroups:
      AUTH_ENDPOINT_GROUPS,

    storageKeys:
      AUTH_STORAGE_KEYS,

    legacyStorageKeys:
      AUTH_LEGACY_STORAGE_KEYS,

    constants:
      AUTH_CONSTANTS,

    publicTechnicalRoutes:
      AUTH_PUBLIC_TECHNICAL_ROUTES,

    technicalRouteAliases:
      AUTH_TECHNICAL_ROUTE_ALIASES,

    tokenParamNames:
      AUTH_TOKEN_PARAM_NAMES,

    failureCodes:
      AUTH_FAILURE_CODES,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default Object.freeze({
  AUTH_CONSTANTS_VERSION,

  LOGIN_ENDPOINT,
  LOGOUT_ENDPOINT,
  ME_ENDPOINT,
  REFRESH_ENDPOINT,
  TWO_FACTOR_LOGIN_ENDPOINT,
  HEALTH_ENDPOINT,

  ACTIVATE_ACCOUNT_ENDPOINT,
  ACTIVATE_FIRST_USER_ENDPOINT,

  REQUEST_RESET_ENDPOINT,
  CONFIRM_RESET_ENDPOINT,
  VALIDATE_RESET_ENDPOINT,

  AUTH_ENDPOINTS,
  AUTH_ENDPOINT_GROUPS,

  AUTH_STORAGE_KEYS,
  AUTH_LEGACY_STORAGE_KEYS,

  AUTH_CONSTANTS,
  AUTH_FAILURE_CODES,

  AUTH_PUBLIC_TECHNICAL_ROUTES,
  AUTH_TECHNICAL_ROUTE_ALIASES,
  AUTH_TOKEN_PARAM_NAMES,

  safeText,
  safeNumber,
  safeInt,
  clampNumber,

  normalizeEndpointPath,

  getAuthEndpoint,
  getAuthStorageKey,
  getAuthLegacyStorageKey,
  getAuthConstant,

  getLoginEndpoint,
  getLogoutEndpoint,
  getMeEndpoint,
  getRefreshEndpoint,
  getTwoFactorLoginEndpoint,
  getAuthHealthEndpoint,

  getActivateAccountEndpoint,
  getActivationEndpoint,
  getAccountActivationEndpoint,
  getActivateFirstUserEndpoint,

  getRequestPasswordResetEndpoint,
  getConfirmPasswordResetEndpoint,
  getValidateResetTokenEndpoint,

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

  getRequestTimeout,
  getRefreshRetryCooldownMs,
  getMaxSequentialRefreshFailures,

  isPublicTechnicalRoute,
  isActivationRoute,
  isResetPasswordConfirmRoute,

  isAuthEndpoint,
  isPublicAuthEndpoint,
  isPasswordResetEndpoint,
  isActivationEndpoint,

  getAuthTokenParamNames,

  getAuthConstantsSnapshot,
});
