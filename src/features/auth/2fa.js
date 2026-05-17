/* =========================================================
   Onion Support - Auth 2FA
   Archivo: /src/features/auth/2fa.js

   Responsabilidad:
   - Módulo futuro de 2FA/MFA/OTP.
   - Actualmente desactivado.
   - No hace llamadas HTTP.
   - No toca sesión.
   - No toca storage.
   - No toca Router.
   - No toca Toast.
   - No importa nada.
   - Sin CoreHttp.
   - Sin AppCore.
   - Sin tempToken real.
   - Sin endpoints reales.
   - Sólo compat para no romper imports.
========================================================= */

export const TWO_FACTOR_MODULE_VERSION = "future-disabled";

const DISABLED_CODE = "TWO_FACTOR_DISABLED";
const DISABLED_MESSAGE = "2FA/MFA/OTP no está activo en el SPA mínimo actual.";

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function bool(value, fallback = false) {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;

  return Boolean(fallback);
}

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
   PAYLOAD NORMALIZATION
========================================================= */

export function resolveTwoFactorTempToken() {
  return "";
}

function resolveTwoFactorCode(payload = {}) {
  return text(
    payload?.code ??
      payload?.otp ??
      payload?.totp ??
      payload?.mfaCode ??
      payload?.mfa_code ??
      payload?.twoFactorCode ??
      payload?.two_factor_code ??
      "",
    ""
  );
}

function resolveIdentifier(payload = {}) {
  return text(
    payload?.identifier ??
      payload?.email ??
      payload?.username ??
      payload?.user ??
      payload?.login ??
      "",
    ""
  );
}

export function normalizeTwoFactorPayload(payload = {}) {
  return {
    tempToken: "",
    temp_token: "",

    code: resolveTwoFactorCode(payload),
    otp: resolveTwoFactorCode(payload),
    totp: resolveTwoFactorCode(payload),

    identifier: resolveIdentifier(payload),
    method: text(payload?.method ?? payload?.channel ?? payload?.type ?? "", ""),

    remember: bool(payload?.remember, false),
    trustDevice: bool(payload?.trustDevice ?? payload?.trust_device, false),
  };
}

export const normalizeVerifyTwoFactorPayload = normalizeTwoFactorPayload;

export function normalizeRequestTwoFactorPayload(payload = {}) {
  return {
    tempToken: "",
    temp_token: "",
    identifier: resolveIdentifier(payload),
    method: text(payload?.method ?? payload?.channel ?? payload?.type ?? "", ""),
  };
}

/* =========================================================
   BODY BUILDERS
   Compat: construyen cuerpo mínimo, pero no se envía a ningún sitio.
========================================================= */

function stripEmpty(object = {}) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => {
      return value !== undefined && value !== null && value !== "";
    })
  );
}

export function buildTwoFactorVerifyBody(payload = {}) {
  const normalized = normalizeTwoFactorPayload(payload);

  return stripEmpty({
    code: normalized.code,
    identifier: normalized.identifier,
    method: normalized.method,
    remember: normalized.remember,
    trustDevice: normalized.trustDevice,
  });
}

export const buildVerifyTwoFactorBody = buildTwoFactorVerifyBody;

export function buildTwoFactorRequestBody(payload = {}) {
  const normalized = normalizeRequestTwoFactorPayload(payload);

  return stripEmpty({
    identifier: normalized.identifier,
    method: normalized.method,
  });
}

export const buildRequestTwoFactorBody = buildTwoFactorRequestBody;

export function buildResendTwoFactorBody(payload = {}) {
  return buildTwoFactorRequestBody(payload);
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

export function normalizeTwoFactorResponse(input = {}) {
  return {
    ...disabledResult("verify"),
    raw: input,
  };
}

export const normalizeVerifyTwoFactorResponse = normalizeTwoFactorResponse;

export function normalizeRequestTwoFactorResponse(input = {}) {
  return {
    ...disabledResult("request"),
    raw: input,
  };
}

export function normalizeResendTwoFactorResponse(input = {}) {
  return {
    ...disabledResult("resend"),
    raw: input,
  };
}

/* =========================================================
   ACTIONS
   No hacen nada.
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
   No hay rutas ni endpoints activos.
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
    },

    message: DISABLED_MESSAGE,
  };
}

export function getTwoFactorDebugPayload(payload = {}) {
  return {
    verify: buildTwoFactorVerifyBody(payload),
    request: buildTwoFactorRequestBody(payload),
    resend: buildResendTwoFactorBody(payload),
    enabled: false,
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
