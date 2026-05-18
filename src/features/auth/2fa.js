/* =========================================================
   Onion Support - Auth 2FA
   Archivo: /src/features/auth/2fa.js

   Responsabilidad:
   - Módulo futuro de 2FA/MFA/OTP.
   - Actualmente desactivado.
   - Sólo compat para no romper imports.
   - Sin llamadas HTTP.
   - Sin endpoints.
   - Sin tempToken real.
   - Sin sesión.
   - Sin storage.
   - Sin Router.
   - Sin Toast.
   - Sin CoreHttp.
   - Sin AppCore.
   - Sin efectos.
   - Sin magia negra.
========================================================= */

export const TWO_FACTOR_MODULE_VERSION = "future-disabled";

const DISABLED_CODE = "TWO_FACTOR_DISABLED";
const DISABLED_MESSAGE = "2FA/MFA/OTP no está activo en el SPA mínimo actual.";

/* =========================================================
   RESULT
========================================================= */

function disabledResult(action = "2fa") {
  return {
    ok: false,
    success: false,

    enabled: false,
    disabled: true,

    action,
    code: DISABLED_CODE,
    message: DISABLED_MESSAGE,

    authenticated: false,
    verified: false,
    requires2FA: false,

    token: null,
    accessToken: null,
    access_token: null,

    refreshToken: null,
    refresh_token: null,

    tempToken: null,
    temp_token: null,

    user: null,
    session: null,
    sessionData: null,
  };
}

/* =========================================================
   PAYLOAD COMPAT
========================================================= */

export function resolveTwoFactorTempToken() {
  return "";
}

export function normalizeTwoFactorPayload() {
  return {
    tempToken: "",
    temp_token: "",

    code: "",
    otp: "",
    totp: "",

    identifier: "",
    method: "",

    remember: false,
    trustDevice: false,
  };
}

export const normalizeVerifyTwoFactorPayload = normalizeTwoFactorPayload;

export function normalizeRequestTwoFactorPayload() {
  return {
    tempToken: "",
    temp_token: "",
    identifier: "",
    method: "",
  };
}

/* =========================================================
   BODY BUILDERS
   Compat: no construyen datos reales porque el módulo está apagado.
========================================================= */

export function buildTwoFactorVerifyBody() {
  return {};
}

export const buildVerifyTwoFactorBody = buildTwoFactorVerifyBody;

export function buildTwoFactorRequestBody() {
  return {};
}

export const buildRequestTwoFactorBody = buildTwoFactorRequestBody;

export function buildResendTwoFactorBody() {
  return {};
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

export function normalizeTwoFactorResponse() {
  return disabledResult("verify");
}

export const normalizeVerifyTwoFactorResponse = normalizeTwoFactorResponse;

export function normalizeRequestTwoFactorResponse() {
  return disabledResult("request");
}

export function normalizeResendTwoFactorResponse() {
  return disabledResult("resend");
}

/* =========================================================
   ACTIONS
========================================================= */

export async function verifyTwoFactor() {
  return disabledResult("verify");
}

export async function requestTwoFactorCode() {
  return disabledResult("request");
}

export async function resendTwoFactorCode() {
  return disabledResult("resend");
}

export function clearTwoFactorCooldown() {
  return true;
}

/* =========================================================
   ALIASES COMPAT
========================================================= */

export const verify2FA = verifyTwoFactor;
export const login2fa = verifyTwoFactor;
export const verifyMfa = verifyTwoFactor;
export const mfaLogin = verifyTwoFactor;
export const verifyOtp = verifyTwoFactor;
export const otpLogin = verifyTwoFactor;
export const twoFactorLogin = verifyTwoFactor;
export const twoFactorVerify = verifyTwoFactor;
export const submitTwoFactorCode = verifyTwoFactor;

export const request2FA = requestTwoFactorCode;
export const requestMfa = requestTwoFactorCode;
export const requestOtp = requestTwoFactorCode;
export const sendTwoFactorCode = requestTwoFactorCode;

export const resend2FA = resendTwoFactorCode;
export const resendMfa = resendTwoFactorCode;
export const resendOtp = resendTwoFactorCode;

/* =========================================================
   ROUTE / ENDPOINT HELPERS
========================================================= */

export function isTwoFactorRoute() {
  return false;
}

export function getTwoFactorRedirectPath() {
  return "";
}

export function getTwoFactorLoginEndpoint() {
  return "";
}

export function getTwoFactorVerifyEndpoint() {
  return "";
}

export function getMfaVerifyEndpoint() {
  return "";
}

export function getOtpVerifyEndpoint() {
  return "";
}

export function getTwoFactorRequestEndpoint() {
  return "";
}

export function getTwoFactorResendEndpoint() {
  return "";
}

/* =========================================================
   SNAPSHOT / DEBUG
========================================================= */

export function getTwoFactorSnapshot() {
  return {
    version: TWO_FACTOR_MODULE_VERSION,

    enabled: false,
    disabled: true,

    inFlight: false,

    hasStoredTempToken: false,
    hasTempTokenInCurrentUrl: false,

    endpoints: {
      verify: "",
      request: "",
      resend: "",
    },

    routes: {
      active: false,
      path: "",
    },

    transport: {
      hasCoreHttp: false,
      ownFetch: false,
      ownApiClient: false,
      ownRouter: false,
      ownToast: false,
      ownStorage: false,
    },

    policy: {
      futureModule: true,
      currentlyNoop: true,
      noSessionMutation: true,
      noStorage: true,
      noHttp: true,
      noEndpoints: true,
      noTempToken: true,
      noOtpHandling: true,
    },

    message: DISABLED_MESSAGE,
  };
}

export function getTwoFactorDebugPayload() {
  return {
    verify: {},
    request: {},
    resend: {},
    enabled: false,
    disabled: true,
    code: DISABLED_CODE,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

const TwoFactor = Object.assign(verifyTwoFactor, {
  version: TWO_FACTOR_MODULE_VERSION,

  verifyTwoFactor,
  verify2FA,
  login2fa,
  verifyMfa,
  mfaLogin,
  verifyOtp,
  otpLogin,
  twoFactorLogin,
  twoFactorVerify,
  submitTwoFactorCode,

  requestTwoFactorCode,
  request2FA,
  requestMfa,
  requestOtp,
  sendTwoFactorCode,

  resendTwoFactorCode,
  resend2FA,
  resendMfa,
  resendOtp,

  clearTwoFactorCooldown,

  resolveTwoFactorTempToken,

  normalizeTwoFactorPayload,
  normalizeVerifyTwoFactorPayload,
  normalizeRequestTwoFactorPayload,

  buildTwoFactorVerifyBody,
  buildVerifyTwoFactorBody,
  buildTwoFactorRequestBody,
  buildRequestTwoFactorBody,
  buildResendTwoFactorBody,

  normalizeTwoFactorResponse,
  normalizeVerifyTwoFactorResponse,
  normalizeRequestTwoFactorResponse,
  normalizeResendTwoFactorResponse,

  getTwoFactorLoginEndpoint,
  getTwoFactorVerifyEndpoint,
  getMfaVerifyEndpoint,
  getOtpVerifyEndpoint,
  getTwoFactorRequestEndpoint,
  getTwoFactorResendEndpoint,

  isTwoFactorRoute,
  getTwoFactorRedirectPath,

  getTwoFactorSnapshot,
  getTwoFactorDebugPayload,
});

export default TwoFactor;
