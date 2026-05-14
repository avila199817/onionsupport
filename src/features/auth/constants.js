/* =========================================================
   Onion SPA - Auth Constants
   Archivo: src/features/auth/constants.js

   AUTH CONTRACT · ENTERPRISE HARDENED · NO APPCORE DEP
   FINAL EXTREME SYSTEM · 15/10

   RESPONSABILIDADES:
   - centralizar endpoints auth
   - centralizar endpoints de activación de cuenta
   - centralizar endpoints password-reset request / confirm / validate
   - centralizar endpoints 2FA/MFA
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
   - soporte hash-router #/ruta y #!/ruta
   - soporte tokens por query/path
   - token param names centralizados
   - límites numéricos normalizados
   - helpers tolerantes y sin throws accidentales
   - /api/auth/me, /auth/me y /me SIEMPRE privados
   - snapshot debug seguro
   - sin dependencia circular con AppCore
========================================================= */

/* =========================================================
   VERSION
========================================================= */

export const AUTH_CONSTANTS_VERSION =
  "15.0.0";

/* =========================================================
   BASE HELPERS
========================================================= */

function isObjectLike(value) {
  return (
    value !== null &&
    (
      typeof value === "object" ||
      typeof value === "function"
    )
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
      "enabled",
      "active",
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
      "disabled",
      "inactive",
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
  try {
    return Boolean(
      obj &&
        typeof obj === "object" &&
        Object.prototype.hasOwnProperty.call(
          obj,
          key
        )
    );
  } catch {
    return false;
  }
}

function normalizeKey(key = "") {
  return safeText(key, "");
}

function unique(values = []) {
  const input =
    Array.isArray(values)
      ? values
      : [values];

  return Array.from(
    new Set(
      input
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
    !isObjectLike(value) ||
    Object.isFrozen(value)
  ) {
    return value;
  }

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

function getBaseOrigin() {
  return "http://localhost";
}

function isAbsoluteUrl(value = "") {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(
    safeText(value, "")
  );
}

function isHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
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

function normalizePathnameOnly(pathname = "/") {
  let value =
    safeText(pathname, "/")
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

function splitSearchAndHash(path = "") {
  let raw =
    safeText(path, "");

  if (!raw) {
    return {
      pathname:
        "",
      search:
        "",
      hash:
        "",
    };
  }

  if (isHashRouterPath(raw)) {
    raw =
      normalizeHashRouterPath(raw);
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
    pathname,
    search,
    hash,
  };
}

export function pathFromUrlLike(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    if (isAbsoluteUrl(raw)) {
      const parsed =
        new URL(
          raw,
          getBaseOrigin()
        );

      if (
        parsed.hash &&
        isHashRouterPath(parsed.hash)
      ) {
        return normalizeHashRouterPath(parsed.hash);
      }

      return `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;
    }
  } catch {
    return "";
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
      return normalizeHashRouterPath(parsed.hash);
    }

    return `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;
  } catch {
    return raw;
  }
}

export function normalizeEndpointPath(path = "") {
  const raw =
    pathFromUrlLike(path);

  if (!raw) {
    return "";
  }

  const {
    pathname,
  } =
    splitSearchAndHash(raw);

  const normalized =
    normalizePathnameOnly(pathname);

  return normalized === "/"
    ? "/"
    : normalized.replace(/\/+$/g, "") || "/";
}

export function normalizeRoutePath(path = "") {
  return normalizeEndpointPath(path);
}

function normalizeEndpointList(list = []) {
  return unique(list)
    .map((item) =>
      normalizeEndpointPath(item)
    )
    .filter(Boolean);
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

export const ME_LEGACY_ENDPOINT =
  "/me";

export const ME_AUTH_LEGACY_ENDPOINT =
  "/auth/me";

export const REFRESH_ENDPOINT =
  "/api/auth/refresh";

export const TWO_FACTOR_LOGIN_ENDPOINT =
  "/api/auth/2fa/login";

export const TWO_FACTOR_REQUEST_ENDPOINT =
  "/api/auth/2fa/request";

export const TWO_FACTOR_RESEND_ENDPOINT =
  "/api/auth/2fa/resend";

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

export const VALIDATE_ACTIVATION_TOKEN_ENDPOINT =
  "/api/auth/activate/validate";

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

    requestTwoFactor:
      TWO_FACTOR_REQUEST_ENDPOINT,

    requestTwoFactorCode:
      TWO_FACTOR_REQUEST_ENDPOINT,

    twoFactorRequest:
      TWO_FACTOR_REQUEST_ENDPOINT,

    request2FA:
      TWO_FACTOR_REQUEST_ENDPOINT,

    requestMfa:
      TWO_FACTOR_REQUEST_ENDPOINT,

    resendTwoFactor:
      TWO_FACTOR_RESEND_ENDPOINT,

    resendTwoFactorCode:
      TWO_FACTOR_RESEND_ENDPOINT,

    twoFactorResend:
      TWO_FACTOR_RESEND_ENDPOINT,

    resend2FA:
      TWO_FACTOR_RESEND_ENDPOINT,

    resendMfa:
      TWO_FACTOR_RESEND_ENDPOINT,

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

    validateActivationToken:
      VALIDATE_ACTIVATION_TOKEN_ENDPOINT,

    validateActivateAccountToken:
      VALIDATE_ACTIVATION_TOKEN_ENDPOINT,

    validateActivateToken:
      VALIDATE_ACTIVATION_TOKEN_ENDPOINT,

    activationValidate:
      VALIDATE_ACTIVATION_TOKEN_ENDPOINT,

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

    validateResetPasswordToken:
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
        ME_AUTH_LEGACY_ENDPOINT,
        ME_LEGACY_ENDPOINT,
      ]),

    refresh:
      unique([
        REFRESH_ENDPOINT,
      ]),

    twoFactorLogin:
      unique([
        TWO_FACTOR_LOGIN_ENDPOINT,
        "/api/auth/mfa/login",
        "/api/auth/otp/login",
        "/api/auth/2fa/verify",
        "/api/auth/mfa/verify",
        "/api/auth/otp/verify",
      ]),

    twoFactorRequest:
      unique([
        TWO_FACTOR_REQUEST_ENDPOINT,
        "/api/auth/mfa/request",
        "/api/auth/otp/request",
        "/api/auth/2fa/send",
        "/api/auth/mfa/send",
        "/api/auth/otp/send",
      ]),

    twoFactorResend:
      unique([
        TWO_FACTOR_RESEND_ENDPOINT,
        "/api/auth/mfa/resend",
        "/api/auth/otp/resend",
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

    validateActivationToken:
      unique([
        VALIDATE_ACTIVATION_TOKEN_ENDPOINT,
        "/api/auth/activation/validate",
        "/api/auth/activate-account/validate",
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
        "/api/auth/reset-password/validate",
        "/api/auth/password-reset/validate",
      ]),
  });

/* =========================================================
   ENDPOINT GROUPS
========================================================= */

const PRIVATE_ME_ENDPOINTS =
  normalizeEndpointList([
    ME_ENDPOINT,
    ME_AUTH_LEGACY_ENDPOINT,
    ME_LEGACY_ENDPOINT,
  ]);

function removePrivateMeEndpoints(list = []) {
  const privateSet =
    new Set(PRIVATE_ME_ENDPOINTS);

  return normalizeEndpointList(list)
    .filter((endpoint) =>
      !privateSet.has(endpoint)
    );
}

export const AUTH_ENDPOINT_GROUPS =
  deepFreeze({
    public:
      removePrivateMeEndpoints([
        AUTH_ENDPOINTS.login,
        AUTH_ENDPOINTS.refresh,
        AUTH_ENDPOINTS.twoFactorLogin,
        AUTH_ENDPOINTS.twoFactorRequest,
        AUTH_ENDPOINTS.twoFactorResend,
        AUTH_ENDPOINTS.health,

        ...AUTH_ENDPOINT_CANDIDATES.health,
        ...AUTH_ENDPOINT_CANDIDATES.activateAccount,
        ...AUTH_ENDPOINT_CANDIDATES.activateFirstUser,
        ...AUTH_ENDPOINT_CANDIDATES.validateActivationToken,
        ...AUTH_ENDPOINT_CANDIDATES.requestPasswordReset,
        ...AUTH_ENDPOINT_CANDIDATES.confirmPasswordReset,
        ...AUTH_ENDPOINT_CANDIDATES.validateResetToken,
        ...AUTH_ENDPOINT_CANDIDATES.twoFactorLogin,
        ...AUTH_ENDPOINT_CANDIDATES.twoFactorRequest,
        ...AUTH_ENDPOINT_CANDIDATES.twoFactorResend,
      ]),

    private:
      normalizeEndpointList([
        AUTH_ENDPOINTS.logout,
        AUTH_ENDPOINTS.me,
        ...AUTH_ENDPOINT_CANDIDATES.me,
      ]),

    controlSkipRefresh:
      removePrivateMeEndpoints([
        AUTH_ENDPOINTS.login,
        AUTH_ENDPOINTS.refresh,
        AUTH_ENDPOINTS.logout,
        AUTH_ENDPOINTS.twoFactorLogin,
        AUTH_ENDPOINTS.twoFactorRequest,
        AUTH_ENDPOINTS.twoFactorResend,

        ...AUTH_ENDPOINT_CANDIDATES.twoFactorLogin,
        ...AUTH_ENDPOINT_CANDIDATES.twoFactorRequest,
        ...AUTH_ENDPOINT_CANDIDATES.twoFactorResend,
        ...AUTH_ENDPOINT_CANDIDATES.activateAccount,
        ...AUTH_ENDPOINT_CANDIDATES.activateFirstUser,
        ...AUTH_ENDPOINT_CANDIDATES.validateActivationToken,
        ...AUTH_ENDPOINT_CANDIDATES.requestPasswordReset,
        ...AUTH_ENDPOINT_CANDIDATES.confirmPasswordReset,
        ...AUTH_ENDPOINT_CANDIDATES.validateResetToken,
        ...AUTH_ENDPOINT_CANDIDATES.health,
      ]),

    session:
      normalizeEndpointList([
        AUTH_ENDPOINTS.login,
        AUTH_ENDPOINTS.logout,
        AUTH_ENDPOINTS.me,
        AUTH_ENDPOINTS.refresh,
      ]),

    activation:
      normalizeEndpointList([
        ...AUTH_ENDPOINT_CANDIDATES.activateAccount,
        ...AUTH_ENDPOINT_CANDIDATES.activateFirstUser,
        ...AUTH_ENDPOINT_CANDIDATES.validateActivationToken,
      ]),

    passwordReset:
      normalizeEndpointList([
        ...AUTH_ENDPOINT_CANDIDATES.requestPasswordReset,
        ...AUTH_ENDPOINT_CANDIDATES.confirmPasswordReset,
        ...AUTH_ENDPOINT_CANDIDATES.validateResetToken,
      ]),

    twoFactor:
      normalizeEndpointList([
        ...AUTH_ENDPOINT_CANDIDATES.twoFactorLogin,
        ...AUTH_ENDPOINT_CANDIDATES.twoFactorRequest,
        ...AUTH_ENDPOINT_CANDIDATES.twoFactorResend,
      ]),
  });

export const AUTH_PUBLIC_API_PATHS =
  deepFreeze([
    ...AUTH_ENDPOINT_GROUPS.public,
  ]);

export const AUTH_PRIVATE_API_PATHS =
  deepFreeze([
    ...AUTH_ENDPOINT_GROUPS.private,
  ]);

export const AUTH_CONTROL_SKIP_REFRESH_PATHS =
  deepFreeze([
    ...AUTH_ENDPOINT_GROUPS.controlSkipRefresh,
  ]);

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

    textValueMaxLength:
      2048,

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

    loginTimeoutMs:
      30000,

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
    "SESSION_EXPIRED",
    "SESSION_REVOKED",
    "SESSION_NOT_FOUND",
    "INVALID_LOGIN_SESSION",
    "LOGIN_FAILED",
    "AUTH_FAILED",
    "AUTH_RESTORE_FAILED",
    "BAD_CREDENTIALS",
    "CREDENTIALS_INVALID",
    "TOKEN_VERSION_MISMATCH",
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
    "token-only",
    "user_only",
    "user-only",
    "session",
    "refreshed",
  ]);

export const AUTH_2FA_STATUSES =
  deepFreeze([
    "2fa_required",
    "mfa_required",
    "totp_required",
    "otp_required",
    "two_factor_required",
    "verification_required",
  ]);

/* =========================================================
   GENERIC GETTERS
========================================================= */

function resolveCandidateKey(key = "") {
  const cleanKey =
    normalizeKey(key);

  const aliases = {
    signIn:
      "login",

    signin:
      "login",

    authenticate:
      "login",

    signOut:
      "logout",

    signout:
      "logout",

    profile:
      "me",

    currentUser:
      "me",

    current:
      "me",

    session:
      "me",

    refreshSession:
      "refresh",

    tokenRefresh:
      "refresh",

    renew:
      "refresh",

    login2fa:
      "twoFactorLogin",

    mfaLogin:
      "twoFactorLogin",

    verify2FA:
      "twoFactorLogin",

    verifyMfa:
      "twoFactorLogin",

    twoFactorVerify:
      "twoFactorLogin",

    requestTwoFactor:
      "twoFactorRequest",

    requestTwoFactorCode:
      "twoFactorRequest",

    request2FA:
      "twoFactorRequest",

    requestMfa:
      "twoFactorRequest",

    resendTwoFactor:
      "twoFactorResend",

    resendTwoFactorCode:
      "twoFactorResend",

    resend2FA:
      "twoFactorResend",

    resendMfa:
      "twoFactorResend",

    activation:
      "activateAccount",

    accountActivation:
      "activateAccount",

    createUserActivation:
      "activateAccount",

    confirmActivation:
      "activateAccount",

    activate:
      "activateAccount",

    firstUserActivation:
      "activateFirstUser",

    validateActivateAccountToken:
      "validateActivationToken",

    validateActivateToken:
      "validateActivationToken",

    activationValidate:
      "validateActivationToken",

    resetPasswordRequest:
      "requestPasswordReset",

    forgotPassword:
      "requestPasswordReset",

    recoverPassword:
      "requestPasswordReset",

    recover:
      "requestPasswordReset",

    forgot:
      "requestPasswordReset",

    passwordResetRequest:
      "requestPasswordReset",

    confirmResetPassword:
      "confirmPasswordReset",

    resetPasswordConfirm:
      "confirmPasswordReset",

    passwordResetConfirm:
      "confirmPasswordReset",

    resetPasswordUpdate:
      "confirmPasswordReset",

    resetPasswordFinalize:
      "confirmPasswordReset",

    changeForgottenPassword:
      "confirmPasswordReset",

    validateResetPasswordToken:
      "validateResetToken",

    resetPasswordValidate:
      "validateResetToken",

    validatePasswordReset:
      "validateResetToken",

    passwordResetValidate:
      "validateResetToken",
  };

  return aliases[cleanKey] || cleanKey;
}

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

  const candidateKey =
    resolveCandidateKey(cleanKey);

  const canonicalEndpoint =
    AUTH_ENDPOINTS[candidateKey];

  if (
    typeof canonicalEndpoint === "string" &&
    canonicalEndpoint.trim()
  ) {
    return canonicalEndpoint.trim();
  }

  return safeText(
    fallback,
    ""
  );
}

export function getAuthEndpointCandidates(key = "", fallback = "") {
  const cleanKey =
    resolveCandidateKey(key);

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

export function getTwoFactorRequestEndpoint() {
  return getAuthEndpoint(
    "twoFactorRequest",
    TWO_FACTOR_REQUEST_ENDPOINT
  );
}

export function getTwoFactorResendEndpoint() {
  return getAuthEndpoint(
    "twoFactorResend",
    TWO_FACTOR_RESEND_ENDPOINT
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

export function getValidateActivationTokenEndpoint() {
  return getAuthEndpoint(
    "validateActivationToken",
    VALIDATE_ACTIVATION_TOKEN_ENDPOINT
  );
}

export function getValidateActivateAccountTokenEndpoint() {
  return getValidateActivationTokenEndpoint();
}

export function getActivateAccountEndpointCandidates() {
  return getAuthEndpointCandidates(
    "activateAccount",
    ACTIVATE_ACCOUNT_ENDPOINT
  );
}

export function getValidateActivationTokenEndpointCandidates() {
  return getAuthEndpointCandidates(
    "validateActivationToken",
    VALIDATE_ACTIVATION_TOKEN_ENDPOINT
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

export function getConfirmResetPasswordEndpoint() {
  return getConfirmPasswordResetEndpoint();
}

export function getValidateResetTokenEndpoint() {
  return getAuthEndpoint(
    "validateResetToken",
    VALIDATE_RESET_ENDPOINT
  );
}

export function getValidateResetPasswordTokenEndpoint() {
  return getValidateResetTokenEndpoint();
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

export function getLoginTimeoutMs() {
  return clampNumber(
    getAuthConstant("loginTimeoutMs", 30000),
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

export function isMeEndpoint(path = "") {
  const normalized =
    normalizeEndpointPath(path);

  if (!normalized) {
    return false;
  }

  return PRIVATE_ME_ENDPOINTS.includes(normalized);
}

export function isPublicAuthEndpoint(path = "") {
  /*
    Candado crítico:
    /api/auth/me, /auth/me y /me nunca son públicos.
  */
  if (isMeEndpoint(path)) {
    return false;
  }

  return isEndpointInGroup(
    path,
    AUTH_ENDPOINT_GROUPS.public
  );
}

export function isPrivateAuthEndpoint(path = "") {
  return (
    isMeEndpoint(path) ||
    isEndpointInGroup(
      path,
      AUTH_ENDPOINT_GROUPS.private
    )
  );
}

export function isAuthControlSkipRefreshEndpoint(path = "") {
  if (isMeEndpoint(path)) {
    return false;
  }

  return isEndpointInGroup(
    path,
    AUTH_CONTROL_SKIP_REFRESH_PATHS
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
   TOKEN MATCH HELPERS
========================================================= */

export function hasTokenParam(search = "", type = "generic") {
  const raw =
    safeText(search, "");

  if (!raw) {
    return false;
  }

  const names =
    getAuthTokenParamNames(type);

  try {
    const params =
      new URLSearchParams(
        raw.startsWith("?")
          ? raw
          : `?${raw}`
      );

    return names.some((name) =>
      Boolean(
        safeText(
          params.get(name),
          ""
        )
      )
    );
  } catch {
    return names.some((name) => {
      const escaped =
        String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      try {
        return new RegExp(`(?:^|[?&#])${escaped}=([^&#\\s]+)`, "i")
          .test(raw);
      } catch {
        return false;
      }
    });
  }
}

export function hasTokenInUrl(value = "", type = "generic") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return false;
  }

  const path =
    pathFromUrlLike(raw) ||
    raw;

  const {
    search,
    hash,
  } =
    splitSearchAndHash(path);

  if (
    search &&
    hasTokenParam(search, type)
  ) {
    return true;
  }

  if (
    hash &&
    hash.includes("?")
  ) {
    const query =
      hash
        .split("?")
        .slice(1)
        .join("?");

    if (
      query &&
      hasTokenParam(query, type)
    ) {
      return true;
    }
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    if (
      parsed.search &&
      hasTokenParam(parsed.search, type)
    ) {
      return true;
    }

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      const hashPath =
        normalizeHashRouterPath(parsed.hash);

      const hashParts =
        splitSearchAndHash(hashPath);

      if (
        hashParts.search &&
        hasTokenParam(hashParts.search, type)
      ) {
        return true;
      }
    }

    if (
      parsed.hash &&
      parsed.hash.includes("?")
    ) {
      const hashQuery =
        parsed.hash
          .split("?")
          .slice(1)
          .join("?");

      if (
        hashQuery &&
        hasTokenParam(hashQuery, type)
      ) {
        return true;
      }
    }
  } catch {}

  return false;
}

export function hasActivationToken(value = "") {
  const path =
    pathFromUrlLike(value) ||
    value;

  const normalized =
    normalizeRoutePath(path);

  if (normalized.startsWith("/activate-account/")) {
    return true;
  }

  return hasTokenInUrl(
    value,
    "activation"
  );
}

export function hasResetToken(value = "") {
  const path =
    pathFromUrlLike(value) ||
    value;

  const normalized =
    normalizeRoutePath(path);

  if (normalized.startsWith("/reset-password/confirm/")) {
    return true;
  }

  return hasTokenInUrl(
    value,
    "reset"
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

    publicApiPaths:
      AUTH_PUBLIC_API_PATHS,

    privateApiPaths:
      AUTH_PRIVATE_API_PATHS,

    controlSkipRefreshPaths:
      AUTH_CONTROL_SKIP_REFRESH_PATHS,

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
  ME_LEGACY_ENDPOINT,
  ME_AUTH_LEGACY_ENDPOINT,
  REFRESH_ENDPOINT,

  TWO_FACTOR_LOGIN_ENDPOINT,
  TWO_FACTOR_REQUEST_ENDPOINT,
  TWO_FACTOR_RESEND_ENDPOINT,

  HEALTH_ENDPOINT,

  ACTIVATE_ACCOUNT_ENDPOINT,
  ACTIVATE_ACCOUNT_LEGACY_ENDPOINT,
  ACTIVATE_FIRST_USER_ENDPOINT,
  VALIDATE_ACTIVATION_TOKEN_ENDPOINT,

  REQUEST_RESET_ENDPOINT,
  CONFIRM_RESET_ENDPOINT,
  VALIDATE_RESET_ENDPOINT,

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

  safeText,
  safeNumber,
  safeInt,
  safeBool,
  clampNumber,

  pathFromUrlLike,
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
  getTwoFactorRequestEndpoint,
  getTwoFactorResendEndpoint,
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

  getAuthConstantsSnapshot,
});
