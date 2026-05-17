/* =========================================================
   Onion Support - Password Reset
   Archivo: /src/features/auth/password-reset.js

   Responsabilidad:
   - Password reset público mínimo.
   - Request endpoint: /api/auth/reset-password-request.
   - Confirm endpoint: /api/auth/reset-password-confirm.
   - Token param único: token.
   - Transporte único vía CoreHttp.
   - No toca sesión salvo token + user explícitos del backend.
   - Sin fetch propio.
   - Sin apiClient propio.
   - Sin Router.
   - Sin Toast.
   - Sin storage paralelo.
   - Sin refresh.
   - Sin validate endpoint real.
   - Sin aliases legacy masivos.
========================================================= */

import CoreHttp from "../../core/http.js";

import {
  AUTH_ENDPOINTS,
  AUTH_CONSTANTS,
} from "./constants.js";

import {
  extractResetToken,
  normalizeTokenValue,
  sanitizeRedirectPath,
  redactTokenInText,
  extractMessage,
} from "./helpers.js";

import {
  normalizeAuthResponse,
} from "./normalize.js";

import {
  applySession,
} from "./session.js";

export const PASSWORD_RESET_MODULE_VERSION = "simple";

const SOURCE = "auth.password-reset";
const DEFAULT_LOGIN_REDIRECT = "/login";

let requestPromise = null;
let confirmPromise = null;

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function rawText(value = "", fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function number(value, fallback = 0) {
  const output = Number(value);
  return Number.isFinite(output) ? output : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function redact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return text(value, "").replace(/([?&#]token=)([^&#\s]+)/gi, "$1***");
  }
}

function safeRedirect(value = "", fallback = DEFAULT_LOGIN_REDIRECT) {
  try {
    return sanitizeRedirectPath(value || fallback, fallback);
  } catch {
    return fallback;
  }
}

/* =========================================================
   LIMITS
========================================================= */

function identifierMaxLength() {
  return Math.max(1, number(AUTH_CONSTANTS?.identifierMaxLength, 160));
}

function tokenMinLength() {
  return Math.max(1, number(AUTH_CONSTANTS?.tokenMinLength, 8));
}

function tokenMaxLength() {
  return Math.max(tokenMinLength(), number(AUTH_CONSTANTS?.tokenMaxLength, 8192));
}

function passwordMinLength() {
  return Math.max(1, number(AUTH_CONSTANTS?.passwordMinLength, 8));
}

function passwordMaxLength() {
  return Math.max(passwordMinLength(), number(AUTH_CONSTANTS?.passwordMaxLength, 1024));
}

/* =========================================================
   IDENTIFIER / TOKEN / PASSWORD
========================================================= */

function looksLikeEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

function normalizeIdentifier(value = "") {
  return text(value, "").normalize("NFKC").replace(/\s+/g, " ").slice(0, identifierMaxLength() + 1);
}

function normalizeEmail(value = "") {
  return text(value, "").toLowerCase().slice(0, 254);
}

function normalizeUsername(value = "") {
  return text(value, "")
    .normalize("NFKC")
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .toLowerCase()
    .slice(0, 80);
}

function normalizePassword(value = "") {
  return rawText(value, "");
}

export function resolveResetPasswordIdentifier(payload = {}) {
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

export function resolveResetPasswordToken(payload = {}) {
  return normalizeTokenValue(
    payload?.token ||
      extractResetToken() ||
      ""
  ) || "";
}

/* =========================================================
   PAYLOADS
========================================================= */

export function normalizeResetPasswordPayload(payload = {}) {
  const source = isObject(payload) ? payload : {};
  const identifier = normalizeIdentifier(resolveResetPasswordIdentifier(source));
  const email = looksLikeEmail(identifier) ? normalizeEmail(identifier) : "";
  const username = email ? "" : normalizeUsername(identifier);

  return {
    identifier,
    email,
    username,

    redirect: safeRedirect(
      source.redirect ||
        source.redirectTo ||
        source.returnTo ||
        "",
      ""
    ),

    lang: text(source.lang || source.language || "", "").slice(0, 8),
  };
}

export function normalizeConfirmResetPasswordPayload(payload = {}) {
  const source = isObject(payload) ? payload : {};

  return {
    token: resolveResetPasswordToken(source),

    password: normalizePassword(
      source.password ||
        source.newPassword ||
        source.new_password ||
        ""
    ),

    confirmPassword: normalizePassword(
      source.confirmPassword ||
        source.passwordConfirmation ||
        source.password_confirmation ||
        ""
    ),

    redirectTo: safeRedirect(
      source.redirectTo ||
        source.redirect ||
        source.returnTo ||
        DEFAULT_LOGIN_REDIRECT,
      DEFAULT_LOGIN_REDIRECT
    ),
  };
}

export function normalizeValidateResetTokenPayload(payload = {}) {
  return {
    token: resolveResetPasswordToken(payload),
  };
}

export const normalizeValidateResetPasswordTokenPayload = normalizeValidateResetTokenPayload;

function stripEmpty(object = {}) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

export function buildResetPasswordRequestBody(payload = {}) {
  const normalized = normalizeResetPasswordPayload(payload);

  return stripEmpty({
    identifier: normalized.identifier,
    email: normalized.email,
    username: normalized.username,
    redirect: normalized.redirect,
    redirectTo: normalized.redirect,
    lang: normalized.lang,
  });
}

export function buildConfirmResetPasswordBody(payload = {}) {
  const normalized = normalizeConfirmResetPasswordPayload(payload);

  const body = {
    token: normalized.token,
    password: normalized.password,
    redirectTo: normalized.redirectTo,
  };

  if (normalized.confirmPassword) {
    body.confirmPassword = normalized.confirmPassword;
  }

  return stripEmpty(body);
}

export function buildValidateResetTokenBody(payload = {}) {
  const token = resolveResetPasswordToken(payload);

  return token ? { token } : {};
}

export const buildValidateResetPasswordTokenBody = buildValidateResetTokenBody;

/* =========================================================
   VALIDATION
========================================================= */

function validateRequestPayload(payload = {}) {
  const normalized = normalizeResetPasswordPayload(payload);

  if (!normalized.identifier) return "No se recibió identificador para recuperar acceso.";
  if (normalized.identifier.length > identifierMaxLength()) return "El identificador es demasiado largo.";

  return "";
}

function validateConfirmPayload(payload = {}) {
  const normalized = normalizeConfirmResetPasswordPayload(payload);

  if (!normalized.token) return "No se recibió token de recuperación.";
  if (normalized.token.length < tokenMinLength()) return "El token de recuperación no es válido.";
  if (normalized.token.length > tokenMaxLength()) return "El token de recuperación no es válido.";

  if (!normalized.password) return "La nueva contraseña es obligatoria.";
  if (normalized.password.length < passwordMinLength()) {
    return `La contraseña debe tener al menos ${passwordMinLength()} caracteres.`;
  }
  if (normalized.password.length > passwordMaxLength()) return "La contraseña es demasiado larga.";

  if (normalized.confirmPassword && normalized.password !== normalized.confirmPassword) {
    return "Las contraseñas no coinciden.";
  }

  return "";
}

function validateTokenPayload(payload = {}) {
  const token = resolveResetPasswordToken(payload);

  if (!token) return "No se recibió token de recuperación.";
  if (token.length < tokenMinLength()) return "El token de recuperación no es válido.";
  if (token.length > tokenMaxLength()) return "El token de recuperación no es válido.";

  return "";
}

/* =========================================================
   RESPONSE
========================================================= */

function node(input = {}) {
  const source = isObject(input) ? input : {};

  return isObject(source.data)
    ? source.data
    : isObject(source.payload)
      ? source.payload
      : isObject(source.result)
        ? source.result
        : source;
}

function responseOk(input = {}) {
  const source = node(input);

  if (typeof source.ok === "boolean") return source.ok;
  if (typeof source.success === "boolean") return source.success;

  const status = Number(source.status || source.statusCode || 0);

  if (Number.isFinite(status) && status >= 400) return false;
  if (Number.isFinite(status) && status >= 200 && status < 300) return true;

  return Boolean(source.sent || source.valid || source.completed || source.passwordUpdated);
}

function responseMessage(input = {}, fallback = "") {
  const source = node(input);

  return text(
    source.message ||
      source.mensaje ||
      source.detail ||
      source.description ||
      source.error ||
      fallback,
    fallback
  );
}

function responseRedirect(input = {}, fallback = "") {
  const source = node(input);
  return safeRedirect(source.redirectTo || source.redirect || source.returnTo || fallback, fallback);
}

function publicUser(user = null) {
  if (!isObject(user)) return null;

  return {
    id: user.id || user.userId || null,
    userId: user.userId || user.id || null,
    username: user.username || user.slug || null,
    displayName: user.displayName || user.name || user.username || null,
    role: user.role || user.rol || null,
    hasAvatar: Boolean(user.avatar || user.avatarUrl || user.picture),
  };
}

function normalizeBaseResponse(input = {}, fallbackSuccess = "", fallbackError = "") {
  const ok = responseOk(input);

  let auth = null;

  try {
    auth = normalizeAuthResponse(input, {
      mode: "password-reset",
      allowEmptySuccess: true,
    });
  } catch {
    auth = null;
  }

  const authenticated = Boolean(auth?.authenticated && auth?.token && auth?.user);
  const user = authenticated ? auth.user : auth?.user || null;

  return {
    raw: input,

    ok,
    success: ok,
    error: !ok,

    authenticated,

    status: node(input).status || node(input).statusCode || 0,
    code: node(input).code || node(input).errorCode || null,

    message: responseMessage(input, ok ? fallbackSuccess : fallbackError),
    redirectTo: responseRedirect(input, authenticated ? DEFAULT_LOGIN_REDIRECT : ""),

    token: authenticated ? auth.token : null,
    accessToken: authenticated ? auth.token : null,
    access_token: authenticated ? auth.token : null,

    refreshToken: authenticated ? auth.refreshToken || null : null,
    refresh_token: authenticated ? auth.refreshToken || null : null,

    user,
    usuario: user,
    me: user,

    session: authenticated ? auth.session || auth.sessionData || null : null,
    sessionData: authenticated ? auth.sessionData || auth.session || null : null,

    sessionApplied: false,
    at: nowIso(),
  };
}

export function normalizeResetPasswordResponse(input = {}) {
  return normalizeBaseResponse(
    input,
    "Si el identificador existe, recibirás instrucciones para restablecer la contraseña.",
    "No se pudo iniciar la recuperación de acceso."
  );
}

export function normalizeConfirmResetPasswordResponse(input = {}) {
  const result = normalizeBaseResponse(
    input,
    "La contraseña se ha actualizado correctamente.",
    "No se pudo restablecer la contraseña."
  );

  return {
    ...result,
    redirectTo: result.redirectTo || DEFAULT_LOGIN_REDIRECT,
  };
}

export function normalizeValidateResetTokenResponse(input = {}) {
  return {
    ...normalizeBaseResponse(
      input,
      "Token de recuperación válido.",
      "Token de recuperación no válido."
    ),
    authenticated: false,
    token: null,
    accessToken: null,
    refreshToken: null,
  };
}

export const normalizeValidateResetPasswordTokenResponse = normalizeValidateResetTokenResponse;

/* =========================================================
   HTTP
========================================================= */

function requestEndpoint() {
  return AUTH_ENDPOINTS?.requestPasswordReset || "/api/auth/reset-password-request";
}

function confirmEndpoint() {
  return AUTH_ENDPOINTS?.confirmPasswordReset || "/api/auth/reset-password-confirm";
}

function publicOptions(options = {}) {
  return {
    ...options,
    public: true,
    auth: false,
    skipAuth: true,
    noAuthHeader: true,
    retries: 0,
    captureAuth: false,
    storeError: false,
  };
}

async function post(endpoint, body, options = {}) {
  if (isFunction(CoreHttp?.post)) {
    return CoreHttp.post(endpoint, body, publicOptions(options));
  }

  return CoreHttp.request(endpoint, {
    ...publicOptions(options),
    method: "POST",
    body,
  });
}

/* =========================================================
   SESSION
========================================================= */

function maybeApplyReturnedSession(result = {}, source = "password-reset") {
  if (!result?.authenticated || !result?.token || !result?.user) return null;

  try {
    return applySession(
      {
        token: result.token,
        accessToken: result.token,
        access_token: result.token,

        refreshToken: result.refreshToken || null,
        refresh_token: result.refreshToken || null,

        user: result.user,
        usuario: result.user,
        me: result.user,

        session: result.sessionData || result.session || null,
        sessionData: result.sessionData || result.session || null,

        authenticated: true,
        source,
        eventMode: "password-reset",
      },
      {
        source,
        eventMode: "password-reset",
        silent: true,
        emit: false,
      }
    );
  } catch {
    return null;
  }
}

/* =========================================================
   ACTIONS
========================================================= */

export async function requestPasswordReset(payload = {}, options = {}) {
  if (requestPromise) return requestPromise;

  const normalized = normalizeResetPasswordPayload(payload);
  const validationError = validateRequestPayload(normalized);

  if (validationError) {
    return normalizeResetPasswordResponse({
      ok: false,
      status: 400,
      message: validationError,
    });
  }

  requestPromise = (async () => {
    try {
      const raw = await post(requestEndpoint(), buildResetPasswordRequestBody(normalized), options);
      return normalizeResetPasswordResponse(raw);
    } catch (error) {
      return normalizeResetPasswordResponse({
        ok: false,
        status: error?.status || error?.statusCode || error?.response?.status || 0,
        code: error?.code || error?.data?.code || error?.response?.data?.code || null,
        message: extractMessage(error) || "No se pudo iniciar la recuperación de acceso.",
        error: true,
      });
    } finally {
      requestPromise = null;
    }
  })();

  return requestPromise;
}

export async function confirmResetPassword(payload = {}, options = {}) {
  if (confirmPromise) return confirmPromise;

  const normalized = normalizeConfirmResetPasswordPayload(payload);
  const validationError = validateConfirmPayload(normalized);

  if (validationError) {
    return normalizeConfirmResetPasswordResponse({
      ok: false,
      status: 400,
      message: validationError,
    });
  }

  confirmPromise = (async () => {
    try {
      const raw = await post(confirmEndpoint(), buildConfirmResetPasswordBody(normalized), options);
      const result = normalizeConfirmResetPasswordResponse(raw);

      const sessionSnapshot = maybeApplyReturnedSession(result, "password-reset:confirm");

      return {
        ...result,
        token: null,
        accessToken: null,
        access_token: null,
        refreshToken: null,
        refresh_token: null,
        user: publicUser(result.user),
        sessionApplied: Boolean(sessionSnapshot?.authenticated),
      };
    } catch (error) {
      return normalizeConfirmResetPasswordResponse({
        ok: false,
        status: error?.status || error?.statusCode || error?.response?.status || 0,
        code: error?.code || error?.data?.code || error?.response?.data?.code || null,
        message: extractMessage(error) || "No se pudo restablecer la contraseña.",
        error: true,
      });
    } finally {
      confirmPromise = null;
    }
  })();

  return confirmPromise;
}

/* =========================================================
   VALIDATE TOKEN
   No endpoint real. Validación local simple.
========================================================= */

export async function validateResetPasswordToken(payload = {}) {
  const token = resolveResetPasswordToken(payload);
  const valid = Boolean(token && token.length >= tokenMinLength() && token.length <= tokenMaxLength());

  return {
    ok: valid,
    success: valid,
    valid,
    authenticated: false,
    token: null,
    message: valid ? "Token de recuperación válido." : "Token de recuperación no válido.",
  };
}

/* =========================================================
   ALIASES COMPAT BÁSICOS
========================================================= */

export const resetPasswordRequest = requestPasswordReset;
export const requestResetPassword = requestPasswordReset;
export const passwordResetRequest = requestPasswordReset;
export const forgotPassword = requestPasswordReset;
export const recoverPassword = requestPasswordReset;

export const resetPasswordConfirm = confirmResetPassword;
export const confirmPasswordReset = confirmResetPassword;
export const passwordResetConfirm = confirmResetPassword;

export const validateResetToken = validateResetPasswordToken;
export const resetPasswordValidate = validateResetPasswordToken;
export const validatePasswordReset = validateResetPasswordToken;
export const passwordResetValidate = validateResetPasswordToken;

/* =========================================================
   COOLDOWN COMPAT
========================================================= */

export function clearPasswordResetCooldown() {
  return true;
}

/* =========================================================
   ENDPOINT GETTERS
========================================================= */

export function getRequestPasswordResetEndpoint() {
  return requestEndpoint();
}

export const getResetPasswordRequestEndpoint = getRequestPasswordResetEndpoint;

export function getConfirmResetPasswordEndpoint() {
  return confirmEndpoint();
}

export const getConfirmPasswordResetEndpoint = getConfirmResetPasswordEndpoint;

export function getValidateResetPasswordTokenEndpoint() {
  return "";
}

export const getValidateResetTokenEndpoint = getValidateResetPasswordTokenEndpoint;

/* =========================================================
   SNAPSHOT
========================================================= */

export function getPasswordResetSnapshot() {
  return {
    version: PASSWORD_RESET_MODULE_VERSION,

    requestEndpoint: requestEndpoint(),
    confirmEndpoint: confirmEndpoint(),
    validateEndpoint: "",

    inFlight: {
      request: Boolean(requestPromise),
      confirm: Boolean(confirmPromise),
    },

    limits: {
      identifierMaxLength: identifierMaxLength(),
      tokenMinLength: tokenMinLength(),
      tokenMaxLength: tokenMaxLength(),
      passwordMinLength: passwordMinLength(),
      passwordMaxLength: passwordMaxLength(),
    },

    transport: {
      hasCoreHttp: Boolean(CoreHttp?.post || CoreHttp?.request),
      ownFetch: false,
      ownApiClient: false,
      ownRouter: false,
      ownToast: false,
    },

    policy: {
      tokenParam: "token",
      noValidateEndpoint: true,
      noRouter: true,
      noToast: true,
      sessionOnlyIfBackendReturnsTokenAndUser: true,
    },
  };
}

export function getPasswordResetDebugPayload(payload = {}) {
  return {
    request: buildResetPasswordRequestBody(payload),
    confirm: {
      ...buildConfirmResetPasswordBody(payload),
      token: resolveResetPasswordToken(payload) ? "***" : "",
      password: normalizeConfirmResetPasswordPayload(payload).password ? "***" : "",
      confirmPassword: normalizeConfirmResetPasswordPayload(payload).confirmPassword ? "***" : "",
    },
    validate: {
      token: resolveResetPasswordToken(payload) ? "***" : "",
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

const PasswordReset = Object.assign(requestPasswordReset, {
  version: PASSWORD_RESET_MODULE_VERSION,

  requestPasswordReset,
  resetPasswordRequest,
  requestResetPassword,
  passwordResetRequest,
  forgotPassword,
  recoverPassword,

  confirmResetPassword,
  resetPasswordConfirm,
  confirmPasswordReset,
  passwordResetConfirm,

  validateResetPasswordToken,
  validateResetToken,
  resetPasswordValidate,
  validatePasswordReset,
  passwordResetValidate,

  resolveResetPasswordIdentifier,
  resolveResetPasswordToken,

  normalizeResetPasswordPayload,
  normalizeConfirmResetPasswordPayload,
  normalizeValidateResetTokenPayload,
  normalizeValidateResetPasswordTokenPayload,

  buildResetPasswordRequestBody,
  buildConfirmResetPasswordBody,
  buildValidateResetTokenBody,
  buildValidateResetPasswordTokenBody,

  normalizeResetPasswordResponse,
  normalizeConfirmResetPasswordResponse,
  normalizeValidateResetTokenResponse,
  normalizeValidateResetPasswordTokenResponse,

  getRequestPasswordResetEndpoint,
  getResetPasswordRequestEndpoint,
  getConfirmResetPasswordEndpoint,
  getConfirmPasswordResetEndpoint,
  getValidateResetPasswordTokenEndpoint,
  getValidateResetTokenEndpoint,

  clearPasswordResetCooldown,

  getPasswordResetSnapshot,
  getPasswordResetDebugPayload,
});

export default PasswordReset;
