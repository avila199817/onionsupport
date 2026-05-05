/* =========================================================
   Onion SPA - Auth Constants
   Archivo: src/features/auth/constants.js

   AUTH CONTRACT · ENTERPRISE HARDENED · NO APPCORE DEP
   FINAL EXTREME SYSTEM · 10/10

   RESPONSABILIDADES:
   - centralizar endpoints auth
   - centralizar endpoints de activación de cuenta
   - centralizar endpoints password-reset request / confirm / validate
   - centralizar claves storage auxiliar
   - centralizar límites y constantes sesión
   - centralizar rutas SPA públicas técnicas
   - centralizar nombres de query params de tokens
   - exponer aliases legacy sin romper compatibilidad
   - exponer helpers públicos estables del módulo
   - blindaje enterprise sin dependencia circular con AppCore

   HARDENING EXTREMO:
   - deepFreeze real para objetos/arrays
   - endpoints agrupados por intención
   - endpoint candidates para fallback robusto
   - rutas SPA técnicas públicas normalizadas
   - token param names centralizados
   - límites numéricos normalizados
   - helpers tolerantes y sin throws accidentales
   - snapshot debug seguro
   - sin dependencia circular con AppCore
========================================================= */

/* =========================================================
   VERSION
========================================================= */

export const AUTH_CONSTANTS_VERSION =
  "10.2.0";

/* =========================================================
   BASE HELPERS
========================================================= */

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
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
    String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

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

function normalizeKey(key = "") {
  return safeText(key, "");
}

function unique(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .flat(Infinity)
        .map((value) =>
          safeText(value, "")
        )
        .filter(Boolean)
    )
  );
}

function deepFreeze(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  try {
    if (Array.isArray(value)) {
      for (const item of value) {
        deepFreeze(item);
      }

      return Object.freeze(value);
    }

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

    const pathname =
      safeText(
        parsed.pathname,
        ""
      )
        .replace(/\\/g, "/")
        .replace(/\/{2,}/g, "/");

    if (!pathname) {
      return "";
    }

    const normalized =
      pathname.startsWith("/")
        ? pathname
        : `/${pathname}`;

    return (
      normalized.replace(/\/+$/g, "") ||
      "/"
    );
  } catch {
    const clean =
      raw
        .split("?")[0]
        .split("#")[0]
        .trim()
        .replace(/\\/g, "/")
        .replace(/\/{2,}/g, "/");

    if (!clean) {
      return "";
    }

    const withSlash =
      clean.startsWith("/")
        ? clean
        : `/${clean}`;

    return (
      withSlash.replace(/\/+$/g, "") ||
      "/"
    );
  }
}

export function normalizeRoutePath(path = "") {
  return normalizeEndpointPath(path);
}

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

/*
  Canonical actual alineado con Core config.publicApiPaths.
  Se mantiene /api/auth/activate-account como legacy candidate.
*/
export const ACTIVATE_ACCOUNT_ENDPOINT =
  "/api/auth/activate";

export const ACTIVATE_ACCOUNT_LEGACY_ENDPOINT =
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
  deepFreeze([
    "/activate-account",
    "/reset-password",
    "/reset-password/confirm",
    "/forgot-password",
    "/recover-password",
    "/password-reset",
    "/2fa",
    "/otp",
    "/mfa",
  ]);

export const AUTH_TECHNICAL_ROUTE_ALIASES =
  deepFreeze({
    activate:
      "/activate-account",

    activateAccount:
      "/activate-account",

    activation:
      "/activate-account",

    accountActivation:
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

    passwordResetConfirm:
      "/reset-password/confirm",

    twoFactor:
      "/2fa",

    twoFactorLogin:
      "/2fa",

    twoFactorVerify:
      "/2fa",

    mfa:
      "/mfa",

    otp:
      "/otp",
  });

/* =========================================================
   TOKEN PARAMS
========================================================= */

export const AUTH_TOKEN_PARAM_NAMES =
  deepFreeze({
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
      "reset_token",
      "password_reset_token",
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
      "code",
      "otp",
      "totp",
    ],
  });

/* =========================================================
   ENDPOINTS · ALIASES ESTABLES
========================================================= */

export const AUTH_ENDPOINTS =
  deepFreeze({
    /* SESSION */
    login:
      LOGIN_ENDPOINT,

    signIn:
      LOGIN_ENDPOINT,

    signin:
      LOGIN_ENDPOINT,

    authenticate:
      LOGIN_ENDPOINT,

    logout:
      LOGOUT_ENDPOINT,

    signOut:
      LOGOUT_ENDPOINT,

    signout:
      LOGOUT_ENDPOINT,

    me:
      ME_ENDPOINT,

    profile:
      ME_ENDPOINT,

    currentUser:
      ME_ENDPOINT,

    current:
      ME_ENDPOINT,

    session:
      ME_ENDPOINT,

    refresh:
      REFRESH_ENDPOINT,

    refreshSession:
      REFRESH_ENDPOINT,

    tokenRefresh:
      REFRESH_ENDPOINT,

    renew:
      REFRESH_ENDPOINT,

    /* 2FA / MFA */
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

    twoFactorVerify:
      TWO_FACTOR_LOGIN_ENDPOINT,

    /* HEALTH */
    health:
      HEALTH_ENDPOINT,

    authHealth:
      HEALTH_ENDPOINT,

    /* ACTIVATION */
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

    activateAccountLegacy:
      ACTIVATE_ACCOUNT_LEGACY_ENDPOINT,

    activationLegacy:
      ACTIVATE_ACCOUNT_LEGACY_ENDPOINT,

    activateFirstUser:
      ACTIVATE_FIRST_USER_ENDPOINT,

    firstUserActivation:
      ACTIVATE_FIRST_USER_ENDPOINT,

    /* PASSWORD RESET REQUEST */
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

    /* PASSWORD RESET CONFIRM */
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

    /* PASSWORD RESET VALIDATE */
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
   ENDPOINT CANDIDATES
========================================================= */

export const AUTH_ENDPOINT_CANDIDATES =
  deepFreeze({
    login:
      unique([
        LOGIN_ENDPOINT,
      ]),

    logout:
      unique([
        LOGOUT_ENDPOINT,
      ]),

    me:
      unique([
        ME_ENDPOINT,
      ]),

    refresh:
      unique([
        REFRESH_ENDPOINT,
      ]),

    twoFactorLogin:
      unique([
        TWO_FACTOR_LOGIN_ENDPOINT,
        "/api/auth/mfa/login",
        "/api/auth/2fa/verify",
        "/api/auth/mfa/verify",
      ]),

    health:
      unique([
        HEALTH_ENDPOINT,
        "/api/auth/health",
        "/api/_health",
        "/health",
      ]),

    activateAccount:
      unique([
        ACTIVATE_ACCOUNT_ENDPOINT,
        ACTIVATE_ACCOUNT_LEGACY_ENDPOINT,
      ]),

    activateFirstUser:
      unique([
        ACTIVATE_FIRST_USER_ENDPOINT,
      ]),

    requestPasswordReset:
      unique([
        REQUEST_RESET_ENDPOINT,
        "/api/auth/forgot-password",
        "/api/auth/password-reset/request",
        "/api/auth/reset-password/request",
      ]),

    confirmPasswordReset:
      unique([
        CONFIRM_RESET_ENDPOINT,
        "/api/auth/reset-password/confirm",
        "/api/auth/password-reset/confirm",
      ]),

    validateResetToken:
      unique([
        VALIDATE_RESET_ENDPOINT,
        "/api/auth/reset-password-validate",
        "/api/auth/password-reset/validate",
      ]),
  });

/* =========================================================
   ENDPOINT GROUPS
========================================================= */

export const AUTH_ENDPOINT_GROUPS =
  deepFreeze({
    public:
      unique([
        AUTH_ENDPOINTS.login,
        AUTH_ENDPOINTS.refresh,
        AUTH_ENDPOINTS.twoFactorLogin,
        AUTH_ENDPOINTS.health,

        ...AUTH_ENDPOINT_CANDIDATES.health,
        ...AUTH_ENDPOINT_CANDIDATES.activateAccount,
        ...AUTH_ENDPOINT_CANDIDATES.activateFirstUser,
        ...AUTH_ENDPOINT_CANDIDATES.requestPasswordReset,
        ...AUTH_ENDPOINT_CANDIDATES.confirmPasswordReset,
        ...AUTH_ENDPOINT_CANDIDATES.validateResetToken,
        ...AUTH_ENDPOINT_CANDIDATES.twoFactorLogin,
      ]),

    private:
      unique([
        AUTH_ENDPOINTS.logout,
        AUTH_ENDPOINTS.me,
      ]),

    session:
      unique([
        AUTH_ENDPOINTS.login,
        AUTH_ENDPOINTS.logout,
        AUTH_ENDPOINTS.me,
        AUTH_ENDPOINTS.refresh,
      ]),

    activation:
      unique([
        ...AUTH_ENDPOINT_CANDIDATES.activateAccount,
        ...AUTH_ENDPOINT_CANDIDATES.activateFirstUser,
      ]),

    passwordReset:
      unique([
        ...AUTH_ENDPOINT_CANDIDATES.requestPasswordReset,
        ...AUTH_ENDPOINT_CANDIDATES.confirmPasswordReset,
        ...AUTH_ENDPOINT_CANDIDATES.validateResetToken,
      ]),

    twoFactor:
      unique([
        ...AUTH_ENDPOINT_CANDIDATES.twoFactorLogin,
      ]),
  });

/* =========================================================
   STORAGE KEYS
========================================================= */

export const AUTH_STORAGE_KEYS =
  deepFreeze({
    /* TOKENS */
    token:
      "token",

    accessToken:
      "access_token",

    refreshToken:
      "refresh_token",

    tempToken:
      "temp_token",

    temporaryToken:
      "temporary_token",

    challengeToken:
      "challenge_token",

    twoFactorToken:
      "two_factor_token",

    mfaToken:
      "mfa_token",

    /* SESSION */
    sessionId:
      "session_id",

    sessionUserId:
      "session_user_id",

    /* USER */
    userId:
      "user_id",

    userSlug:
      "user_slug",

    userName:
      "user_name",

    username:
      "username",

    role:
      "role",

    roles:
      "roles",

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

    loginCooldownUntil:
      "login_cooldown_until",
  });

export const AUTH_LEGACY_STORAGE_KEYS =
  deepFreeze({
    token:
      "onion_token",

    accessToken:
      "onion_access_token",

    refreshToken:
      "onion_refresh_token",

    tempToken:
      "onion_temp_token",

    temporaryToken:
      "onion_temporary_token",

    challengeToken:
      "onion_challenge_token",

    twoFactorToken:
      "onion_two_factor_token",

    mfaToken:
      "onion_mfa_token",

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

    username:
      "onion_username",

    role:
      "onion_role",

    roles:
      "onion_roles",
  });

/* =========================================================
   NUMERIC CONSTANTS
========================================================= */

export const AUTH_CONSTANTS =
  deepFreeze({
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
      8,

    tokenMaxLength:
      8192,

    activationTokenMinLength:
      8,

    activationTokenMaxLength:
      8192,

    resetTokenMinLength:
      8,

    resetTokenMaxLength:
      8192,

    tempTokenMinLength:
      8,

    tempTokenMaxLength:
      8192,

    sessionValueMaxLength:
      200,

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

    loginMinIntervalMs:
      0,

    /* 2FA */
    twoFactorCodeMinLength:
      4,

    twoFactorCodeMaxLength:
      12,

    twoFactorMaxAttempts:
      5,

    twoFactorCooldownMs:
      30000,
  });

/* =========================================================
   AUTH CODES / STATUSES
========================================================= */

export const AUTH_FAILURE_CODES =
  deepFreeze([
    "INVALID_CREDENTIALS",
    "MISSING_CREDENTIALS",
    "ACCOUNT_TEMPORARILY_LOCKED",
    "ACCOUNT_DISABLED",
    "USER_DISABLED",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "TOKEN_INVALID",
    "INVALID_TOKEN",
    "TOKEN_EXPIRED",
    "SESSION_EXPIRED",
    "INVALID_LOGIN_SESSION",
    "LOGIN_FAILED",
    "AUTH_FAILED",
    "AUTH_RESTORE_FAILED",
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

export const AUTH_SUCCESS_STATUSES =
  deepFreeze([
    "ok",
    "success",
    "successful",
    "authenticated",
    "active",
    "valid",
    "token_only",
    "user_only",
  ]);

export const AUTH_2FA_STATUSES =
  deepFreeze([
    "2fa_required",
    "mfa_required",
    "totp_required",
    "two_factor_required",
    "verification_required",
  ]);

/* =========================================================
   GENERIC GETTERS
========================================================= */

export function getAuthEndpoint(key = "", fallback = "") {
  const cleanKey =
    normalizeKey(key);

  const endpoint =
    AUTH_ENDPOINTS[cleanKey];

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

export function getAuthEndpointCandidates(key = "", fallback = "") {
  const cleanKey =
    normalizeKey(key);

  const candidates =
    AUTH_ENDPOINT_CANDIDATES[cleanKey];

  if (Array.isArray(candidates)) {
    return [...candidates];
  }

  const endpoint =
    getAuthEndpoint(
      cleanKey,
      fallback
    );

  return endpoint
    ? [endpoint]
    : [];
}

export function getAuthEndpointGroup(key = "") {
  const cleanKey =
    normalizeKey(key);

  const group =
    AUTH_ENDPOINT_GROUPS[cleanKey];

  return Array.isArray(group)
    ? [...group]
    : [];
}

export function getAuthStorageKey(key = "", fallback = "") {
  const cleanKey =
    normalizeKey(key);

  const storageKey =
    AUTH_STORAGE_KEYS[cleanKey];

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
  const cleanKey =
    normalizeKey(key);

  const storageKey =
    AUTH_LEGACY_STORAGE_KEYS[cleanKey];

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
  const cleanKey =
    normalizeKey(key);

  if (
    hasOwn(
      AUTH_CONSTANTS,
      cleanKey
    )
  ) {
    return AUTH_CONSTANTS[cleanKey];
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

export function getActivateAccountEndpointCandidates() {
  return getAuthEndpointCandidates(
    "activateAccount",
    ACTIVATE_ACCOUNT_ENDPOINT
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

export function getRequestPasswordResetEndpointCandidates() {
  return getAuthEndpointCandidates(
    "requestPasswordReset",
    REQUEST_RESET_ENDPOINT
  );
}

export function getConfirmPasswordResetEndpointCandidates() {
  return getAuthEndpointCandidates(
    "confirmPasswordReset",
    CONFIRM_RESET_ENDPOINT
  );
}

export function getValidateResetTokenEndpointCandidates() {
  return getAuthEndpointCandidates(
    "validateResetToken",
    VALIDATE_RESET_ENDPOINT
  );
}

/* =========================================================
   SPECIALIZED HELPERS · LIMITS
========================================================= */

export function getIdentifierMaxLength() {
  return clampNumber(
    getAuthConstant("identifierMaxLength", 160),
    1,
    1024
  );
}

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
    getAuthConstant("tokenMinLength", 8),
    1,
    4096
  );
}

export function getTokenMaxLength() {
  return clampNumber(
    getAuthConstant("tokenMaxLength", 8192),
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

export function getTempTokenMinLength() {
  return clampNumber(
    getAuthConstant(
      "tempTokenMinLength",
      8
    ),
    1,
    getTokenMaxLength()
  );
}

export function getTempTokenMaxLength() {
  return clampNumber(
    getAuthConstant(
      "tempTokenMaxLength",
      getTokenMaxLength()
    ),
    getTempTokenMinLength(),
    32768
  );
}

export function getSessionValueMaxLength() {
  return clampNumber(
    getAuthConstant("sessionValueMaxLength", 200),
    16,
    2048
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

export function getLoginCooldownMs() {
  return clampNumber(
    getAuthConstant("loginCooldownMs", 30000),
    0,
    600000
  );
}

export function getLoginMaxAttemptsBeforeCooldown() {
  return clampNumber(
    getAuthConstant("loginMaxAttemptsBeforeCooldown", 5),
    1,
    100
  );
}

export function getTwoFactorCodeMinLength() {
  return clampNumber(
    getAuthConstant("twoFactorCodeMinLength", 4),
    1,
    32
  );
}

export function getTwoFactorCodeMaxLength() {
  return clampNumber(
    getAuthConstant("twoFactorCodeMaxLength", 12),
    getTwoFactorCodeMinLength(),
    64
  );
}

/* =========================================================
   ROUTE / ENDPOINT MATCH HELPERS
========================================================= */

export function isPublicTechnicalRoute(path = "") {
  const normalized =
    normalizeRoutePath(path);

  if (!normalized) {
    return false;
  }

  return AUTH_PUBLIC_TECHNICAL_ROUTES.some((route) => {
    const cleanRoute =
      normalizeRoutePath(route);

    return (
      normalized === cleanRoute ||
      normalized.startsWith(`${cleanRoute}/`)
    );
  });
}

export function isActivationRoute(path = "") {
  const normalized =
    normalizeRoutePath(path);

  return (
    normalized === "/activate-account" ||
    normalized.startsWith("/activate-account/")
  );
}

export function isResetPasswordRoute(path = "") {
  const normalized =
    normalizeRoutePath(path);

  return (
    normalized === "/reset-password" ||
    normalized.startsWith("/reset-password/")
  );
}

export function isResetPasswordConfirmRoute(path = "") {
  const normalized =
    normalizeRoutePath(path);

  return (
    normalized === "/reset-password/confirm" ||
    normalized.startsWith("/reset-password/confirm/")
  );
}

export function isTwoFactorRoute(path = "") {
  const normalized =
    normalizeRoutePath(path);

  return (
    normalized === "/2fa" ||
    normalized.startsWith("/2fa/") ||
    normalized === "/otp" ||
    normalized.startsWith("/otp/") ||
    normalized === "/mfa" ||
    normalized.startsWith("/mfa/")
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

export function isEndpointInGroup(path = "", group = []) {
  const normalized =
    normalizeEndpointPath(path);

  if (!normalized) {
    return false;
  }

  const rows =
    Array.isArray(group)
      ? group
      : [];

  return rows.some((endpoint) => {
    const cleanEndpoint =
      normalizeEndpointPath(endpoint);

    return normalized === cleanEndpoint;
  });
}

export function isPublicAuthEndpoint(path = "") {
  return isEndpointInGroup(
    path,
    AUTH_ENDPOINT_GROUPS.public
  );
}

export function isPrivateAuthEndpoint(path = "") {
  return isEndpointInGroup(
    path,
    AUTH_ENDPOINT_GROUPS.private
  );
}

export function isPasswordResetEndpoint(path = "") {
  return isEndpointInGroup(
    path,
    AUTH_ENDPOINT_GROUPS.passwordReset
  );
}

export function isActivationEndpoint(path = "") {
  return isEndpointInGroup(
    path,
    AUTH_ENDPOINT_GROUPS.activation
  );
}

export function isTwoFactorEndpoint(path = "") {
  return isEndpointInGroup(
    path,
    AUTH_ENDPOINT_GROUPS.twoFactor
  );
}

export function isAuthFailureCode(code = "") {
  const normalized =
    safeText(code, "")
      .toUpperCase();

  return AUTH_FAILURE_CODES.includes(
    normalized
  );
}

export function isAuth2FAStatus(status = "") {
  const normalized =
    safeText(status, "")
      .toLowerCase();

  return AUTH_2FA_STATUSES.includes(
    normalized
  );
}

export function isAuthSuccessStatus(status = "") {
  const normalized =
    safeText(status, "")
      .toLowerCase();

  return AUTH_SUCCESS_STATUSES.includes(
    normalized
  );
}

export function getAuthTokenParamNames(type = "generic") {
  const cleanType =
    normalizeKey(type) || "generic";

  const names =
    AUTH_TOKEN_PARAM_NAMES[cleanType];

  return Array.isArray(names)
    ? [...names]
    : [...AUTH_TOKEN_PARAM_NAMES.generic];
}

export function getAllAuthTokenParamNames() {
  return unique(
    Object.values(AUTH_TOKEN_PARAM_NAMES)
      .flat()
  );
}

export function getTechnicalRouteAlias(key = "", fallback = "") {
  const cleanKey =
    normalizeKey(key);

  const route =
    AUTH_TECHNICAL_ROUTE_ALIASES[cleanKey];

  return safeText(
    route,
    fallback
  );
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

    endpointCandidates:
      AUTH_ENDPOINT_CANDIDATES,

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

    successStatuses:
      AUTH_SUCCESS_STATUSES,

    twoFactorStatuses:
      AUTH_2FA_STATUSES,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default deepFreeze({
  AUTH_CONSTANTS_VERSION,

  LOGIN_ENDPOINT,
  LOGOUT_ENDPOINT,
  ME_ENDPOINT,
  REFRESH_ENDPOINT,
  TWO_FACTOR_LOGIN_ENDPOINT,
  HEALTH_ENDPOINT,

  ACTIVATE_ACCOUNT_ENDPOINT,
  ACTIVATE_ACCOUNT_LEGACY_ENDPOINT,
  ACTIVATE_FIRST_USER_ENDPOINT,

  REQUEST_RESET_ENDPOINT,
  CONFIRM_RESET_ENDPOINT,
  VALIDATE_RESET_ENDPOINT,

  AUTH_ENDPOINTS,
  AUTH_ENDPOINT_CANDIDATES,
  AUTH_ENDPOINT_GROUPS,

  AUTH_STORAGE_KEYS,
  AUTH_LEGACY_STORAGE_KEYS,

  AUTH_CONSTANTS,
  AUTH_FAILURE_CODES,
  AUTH_SUCCESS_STATUSES,
  AUTH_2FA_STATUSES,

  AUTH_PUBLIC_TECHNICAL_ROUTES,
  AUTH_TECHNICAL_ROUTE_ALIASES,
  AUTH_TOKEN_PARAM_NAMES,

  safeText,
  safeNumber,
  safeInt,
  safeBool,
  clampNumber,

  normalizeEndpointPath,
  normalizeRoutePath,

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
  getTwoFactorLoginEndpoint,
  getAuthHealthEndpoint,

  getActivateAccountEndpoint,
  getActivationEndpoint,
  getAccountActivationEndpoint,
  getActivateFirstUserEndpoint,
  getActivateAccountEndpointCandidates,

  getRequestPasswordResetEndpoint,
  getConfirmPasswordResetEndpoint,
  getValidateResetTokenEndpoint,
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
  isPublicAuthEndpoint,
  isPrivateAuthEndpoint,
  isPasswordResetEndpoint,
  isActivationEndpoint,
  isTwoFactorEndpoint,

  isAuthFailureCode,
  isAuth2FAStatus,
  isAuthSuccessStatus,

  getAuthTokenParamNames,
  getAllAuthTokenParamNames,
  getTechnicalRouteAlias,

  getAuthConstantsSnapshot,
});
