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
   - Sin magia negra.
========================================================= */

import CoreHttp from "../../core/http.js";

import {
  applySession,
} from "./session.js";

export const PASSWORD_RESET_MODULE_VERSION = "simple";

const SOURCE = "auth.password-reset";

const REQUEST_ENDPOINT = "/api/auth/reset-password-request";
const CONFIRM_ENDPOINT = "/api/auth/reset-password-confirm";

const TOKEN_PARAM = "token";
const DEFAULT_LOGIN_REDIRECT = "/login";

const IDENTIFIER_MAX_LENGTH = 160;
const TOKEN_MIN_LENGTH = 8;
const TOKEN_MAX_LENGTH = 8192;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 1024;

let requestPromise = null;
let confirmPromise = null;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

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

function nowIso() {
  return new Date().toISOString();
}

function redact(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function stripEmpty(object = {}) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

/* =========================================================
   TOKEN / IDENTIFIER / PASSWORD
========================================================= */

function normalizeTokenValue(value = "") {
  const token = text(value, "");

  if (!token) return "";
  if (/\s/.test(token)) return "";

  if (
    ["null", "undefined", "false", "true", "[object object]", "{}", "[]"].includes(
      token.toLowerCase()
    )
  ) {
    return "";
  }

  return token.slice(0, TOKEN_MAX_LENGTH);
}

function readTokenFromLocation() {
  if (!isBrowser()) return "";

  try {
    const search = new URLSearchParams(window.location.search);
    const token = normalizeTokenValue(search.get(TOKEN_PARAM) || "");

    if (token) return token;
  } catch {
    // noop
  }

  try {
    const hash = String(window.location.hash || "").replace(/^#/, "");
    const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : hash;
    const params = new URLSearchParams(query);

    return normalizeTokenValue(params.get(TOKEN_PARAM) || "");
  } catch {
    return "";
  }
}

function normalizeIdentifier(value = "") {
  return text(value, "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .slice(0, IDENTIFIER_MAX_LENGTH);
}

function normalizePassword(value = "") {
  return rawText(value, "").slice(0, PASSWORD_MAX_LENGTH);
}

export function resolveResetPasswordIdentifier(payload = {}) {
  return normalizeIdentifier(
    payload?.identifier ??
      payload?.email ??
      payload?.username ??
      payload?.user ??
      payload?.login ??
      ""
  );
}

export function resolveResetPasswordToken(payload = {}) {
  return normalizeTokenValue(
    payload?.token ||
      readTokenFromLocation() ||
      ""
  );
}

/* =========================================================
   PAYLOADS
========================================================= */

export function normalizeResetPasswordPayload(payload = {}) {
  return {
    identifier: resolveResetPasswordIdentifier(payload),
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
  };
}

export function normalizeValidateResetTokenPayload(payload = {}) {
  return {
    token: resolveResetPasswordToken(payload),
  };
}

export const normalizeValidateResetPasswordTokenPayload = normalizeValidateResetTokenPayload;

export function buildResetPasswordRequestBody(payload = {}) {
  const normalized = normalizeResetPasswordPayload(payload);

  return stripEmpty({
    identifier: normalized.identifier,
  });
}

export function buildConfirmResetPasswordBody(payload = {}) {
  const normalized = normalizeConfirmResetPasswordPayload(payload);

  return stripEmpty({
    token: normalized.token,
    password: normalized.password,
    confirmPassword: normalized.confirmPassword || undefined,
  });
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

  if (!normalized.identifier) {
    return "No se recibió identificador para recuperar acceso.";
  }

  if (normalized.identifier.length > IDENTIFIER_MAX_LENGTH) {
    return "El identificador es demasiado largo.";
  }

  return "";
}

function validateConfirmPayload(payload = {}) {
  const normalized = normalizeConfirmResetPasswordPayload(payload);

  if (!normalized.token) return "No se recibió token de recuperación.";
  if (normalized.token.length < TOKEN_MIN_LENGTH) return "El token de recuperación no es válido.";
  if (normalized.token.length > TOKEN_MAX_LENGTH) return "El token de recuperación no es válido.";

  if (!normalized.password) return "La nueva contraseña es obligatoria.";
  if (normalized.password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (normalized.password.length > PASSWORD_MAX_LENGTH) {
    return "La contraseña es demasiado larga.";
  }

  if (normalized.confirmPassword && normalized.password !== normalized.confirmPassword) {
    return "Las contraseñas no coinciden.";
  }

  return "";
}

function validateTokenPayload(payload = {}) {
  const token = resolveResetPasswordToken(payload);

  if (!token) return "No se recibió token de recuperación.";
  if (token.length < TOKEN_MIN_LENGTH) return "El token de recuperación no es válido.";
  if (token.length > TOKEN_MAX_LENGTH) return "El token de recuperación no es válido.";

  return "";
}

/* =========================================================
   USER / RESPONSE
========================================================= */

function cleanRole(value = "") {
  return String(value || "").toLowerCase() === "admin" ? "admin" : "user";
}

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  return (
    user.disabled === true ||
    String(user.status || "").toLowerCase() === "disabled"
  );
}

function userOk(user = null) {
  if (!isObject(user)) return false;
  if (userDisabled(user)) return false;

  return Boolean(
    user.id ||
      user.userId ||
      user.username ||
      user.slug ||
      user.email
  );
}

function normalizeUser(user = null) {
  if (!userOk(user)) return null;

  const id = user.userId || user.id || null;
  const username = user.username || user.slug || user.email || id || null;

  const displayName =
    user.name ||
    user.fullName ||
    user.displayName ||
    user.nombre ||
    username ||
    user.email ||
    id ||
    "Usuario";

  const role = cleanRole(user.role || user.rol);

  return {
    ...user,

    id,
    userId: user.userId || id,

    username,
    slug: user.slug || username,

    name: user.name || displayName,
    fullName: user.fullName || displayName,
    displayName,

    email: user.email || null,

    role,
    rol: role,
    roles: [role],

    isAdmin: role === "admin",
    isSupport: false,
    isManager: false,
    isClient: false,

    avatar: user.avatar || user.avatarUrl || user.picture || null,
    avatarUrl: user.avatarUrl || user.avatar || user.picture || null,
    picture: user.picture || user.avatarUrl || user.avatar || null,
    hasAvatar: Boolean(user.avatar || user.avatarUrl || user.picture),

    active: true,
    disabled: false,
  };
}

function publicUser(user = null) {
  const clean = normalizeUser(user);

  if (!clean) return null;

  return {
    id: clean.id || clean.userId || null,
    userId: clean.userId || clean.id || null,
    username: clean.username || clean.slug || null,
    displayName: clean.displayName || clean.name || clean.username || null,
    role: clean.role || clean.rol || null,
    hasAvatar: Boolean(clean.avatar || clean.avatarUrl || clean.picture),
  };
}

function nested(payload = {}) {
  const source = isObject(payload) ? payload : {};

  return [
    source,
    isObject(source.data) ? source.data : null,
    isObject(source.payload) ? source.payload : null,
    isObject(source.result) ? source.result : null,
    isObject(source.auth) ? source.auth : null,
    isObject(source.session) ? source.session : null,
    isObject(source.sessionData) ? source.sessionData : null,
  ].filter(Boolean);
}

function pick(nodes = [], keys = []) {
  for (const node of nodes) {
    for (const key of keys) {
      const value = node?.[key];

      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  }

  return undefined;
}

function responseNode(input = {}) {
  const source = isObject(input) ? input : {};

  return isObject(source.data)
    ? source.data
    : isObject(source.payload)
      ? source.payload
      : isObject(source.result)
        ? source.result
        : source;
}

function readToken(input = {}) {
  return normalizeTokenValue(
    pick(nested(input), [
      "token",
      "accessToken",
      "access_token",
    ]) || ""
  );
}

function readUser(input = {}) {
  for (const node of nested(input)) {
    const user = normalizeUser(
      node.user ||
        node.usuario ||
        node.me ||
        node.account ||
        node.profile
    );

    if (user) return user;
  }

  return normalizeUser(input);
}

function readSession(input = {}) {
  for (const node of nested(input)) {
    const session =
      node.session ||
      node.sessionData ||
      null;

    if (isObject(session)) return session;
  }

  return null;
}

function responseOk(input = {}) {
  const source = responseNode(input);

  if (typeof source.ok === "boolean") return source.ok;
  if (typeof source.success === "boolean") return source.success;

  const status = Number(source.status || source.statusCode || 0);

  if (Number.isFinite(status) && status >= 400) return false;
  if (Number.isFinite(status) && status >= 200 && status < 300) return true;

  if (readToken(input) && readUser(input)) return true;

  return Boolean(source.sent || source.valid || source.completed || source.passwordUpdated);
}

function responseMessage(input = {}, fallback = "") {
  const source = responseNode(input);

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

function responseCode(input = {}) {
  const source = responseNode(input);
  return text(source.code || source.errorCode || "", "");
}

function responseStatus(input = {}) {
  const source = responseNode(input);
  const status = Number(source.status || source.statusCode || 0);
  return Number.isFinite(status) ? status : 0;
}

function responseRedirect(input = {}, fallback = DEFAULT_LOGIN_REDIRECT) {
  const source = responseNode(input);
  const target = text(source.redirectTo || source.redirect || source.returnTo || fallback, fallback);

  if (!target.startsWith("/") || target.startsWith("//")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return fallback;
  if (/[\r\n\t\\]/.test(target)) return fallback;

  return target;
}

function normalizeBaseResponse(input = {}, fallbackSuccess = "", fallbackError = "") {
  const ok = responseOk(input);
  const token = readToken(input);
  const user = readUser(input);
  const session = readSession(input);

  const authenticated = Boolean(token && user);

  return {
    raw: input,

    ok,
    success: ok,
    error: !ok,

    authenticated,

    status: responseStatus(input),
    code: responseCode(input),

    message: responseMessage(input, ok ? fallbackSuccess : fallbackError),
    redirectTo: responseRedirect(input, DEFAULT_LOGIN_REDIRECT),

    token: authenticated ? token : null,
    accessToken: authenticated ? token : null,
    access_token: authenticated ? token : null,

    user: authenticated ? user : null,
    usuario: authenticated ? user : null,
    me: authenticated ? user : null,

    session: authenticated ? session : null,
    sessionData: authenticated ? session : null,

    sessionApplied: false,
    at: nowIso(),
  };
}

function sanitizeResult(result = {}) {
  return {
    ...result,

    token: null,
    accessToken: null,
    access_token: null,

    refreshToken: null,
    refresh_token: null,

    user: publicUser(result.user),
    usuario: publicUser(result.user),
    me: publicUser(result.user),

    raw: undefined,
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
  return {
    ...normalizeBaseResponse(
      input,
      "La contraseña se ha actualizado correctamente.",
      "No se pudo restablecer la contraseña."
    ),
    redirectTo: responseRedirect(input, DEFAULT_LOGIN_REDIRECT),
  };
}

export function normalizeValidateResetTokenResponse(input = {}) {
  return sanitizeResult({
    ...normalizeBaseResponse(
      input,
      "Token de recuperación válido.",
      "Token de recuperación no válido."
    ),
    authenticated: false,
    token: null,
    accessToken: null,
    refreshToken: null,
  });
}

export const normalizeValidateResetPasswordTokenResponse = normalizeValidateResetTokenResponse;

/* =========================================================
   HTTP
========================================================= */

function publicOptions(options = {}) {
  return {
    ...options,
    public: true,
    auth: false,
    skipAuth: true,
    noAuthHeader: true,
    storeError: false,
  };
}

async function post(endpoint, body, options = {}) {
  if (isFunction(CoreHttp?.post)) {
    return CoreHttp.post(endpoint, body, publicOptions(options));
  }

  if (isFunction(CoreHttp?.request)) {
    return CoreHttp.request(endpoint, {
      ...publicOptions(options),
      method: "POST",
      body,
    });
  }

  throw new Error("Cliente HTTP no disponible.");
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

        user: result.user,
        usuario: result.user,
        me: result.user,

        session: result.sessionData || result.session || null,
        sessionData: result.sessionData || result.session || null,
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
    return sanitizeResult(
      normalizeResetPasswordResponse({
        ok: false,
        status: 400,
        message: validationError,
      })
    );
  }

  requestPromise = (async () => {
    try {
      const raw = await post(REQUEST_ENDPOINT, buildResetPasswordRequestBody(normalized), options);
      return sanitizeResult(normalizeResetPasswordResponse(raw));
    } catch (error) {
      return sanitizeResult(
        normalizeResetPasswordResponse({
          ok: false,
          status: error?.status || error?.statusCode || error?.response?.status || 0,
          code: error?.code || error?.data?.code || error?.response?.data?.code || null,
          message:
            error?.data?.message ||
            error?.response?.data?.message ||
            error?.message ||
            "No se pudo iniciar la recuperación de acceso.",
          error: true,
        })
      );
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
    return sanitizeResult(
      normalizeConfirmResetPasswordResponse({
        ok: false,
        status: 400,
        message: validationError,
      })
    );
  }

  confirmPromise = (async () => {
    try {
      const raw = await post(CONFIRM_ENDPOINT, buildConfirmResetPasswordBody(normalized), options);
      const result = normalizeConfirmResetPasswordResponse(raw);
      const snapshot = maybeApplyReturnedSession(result, "password-reset:confirm");

      result.sessionApplied = Boolean(snapshot?.authenticated);

      return sanitizeResult(result);
    } catch (error) {
      return sanitizeResult(
        normalizeConfirmResetPasswordResponse({
          ok: false,
          status: error?.status || error?.statusCode || error?.response?.status || 0,
          code: error?.code || error?.data?.code || error?.response?.data?.code || null,
          message:
            error?.data?.message ||
            error?.response?.data?.message ||
            error?.message ||
            "No se pudo restablecer la contraseña.",
          error: true,
        })
      );
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
  const validationError = validateTokenPayload(payload);
  const valid = !validationError;

  return {
    ok: valid,
    success: valid,
    valid,
    authenticated: false,
    token: null,
    message: valid ? "Token de recuperación válido." : validationError,
  };
}

/* =========================================================
   ALIASES COMPAT MÍNIMOS
========================================================= */

export const resetPasswordRequest = requestPasswordReset;
export const requestResetPassword = requestPasswordReset;

export const resetPasswordConfirm = confirmResetPassword;
export const confirmPasswordReset = confirmResetPassword;

export const validateResetToken = validateResetPasswordToken;
export const validatePasswordReset = validateResetPasswordToken;

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
  return REQUEST_ENDPOINT;
}

export const getResetPasswordRequestEndpoint = getRequestPasswordResetEndpoint;

export function getConfirmResetPasswordEndpoint() {
  return CONFIRM_ENDPOINT;
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

    requestEndpoint: REQUEST_ENDPOINT,
    confirmEndpoint: CONFIRM_ENDPOINT,
    validateEndpoint: "",

    inFlight: {
      request: Boolean(requestPromise),
      confirm: Boolean(confirmPromise),
    },

    limits: {
      identifierMaxLength: IDENTIFIER_MAX_LENGTH,
      tokenMinLength: TOKEN_MIN_LENGTH,
      tokenMaxLength: TOKEN_MAX_LENGTH,
      passwordMinLength: PASSWORD_MIN_LENGTH,
      passwordMaxLength: PASSWORD_MAX_LENGTH,
    },

    transport: {
      hasCoreHttp: Boolean(CoreHttp?.post || CoreHttp?.request),
      ownFetch: false,
      ownApiClient: false,
      ownRouter: false,
      ownToast: false,
    },

    policy: {
      tokenParam: TOKEN_PARAM,
      noValidateEndpoint: true,
      noRouter: true,
      noToast: true,
      noStorage: true,
      sessionOnlyIfBackendReturnsTokenAndUser: true,
      noLegacyRoutes: true,
    },
  };
}

export function getPasswordResetDebugPayload(payload = {}) {
  const confirm = buildConfirmResetPasswordBody(payload);

  return {
    request: buildResetPasswordRequestBody(payload),
    confirm: {
      ...confirm,
      token: confirm.token ? "***" : "",
      password: confirm.password ? "***" : "",
      confirmPassword: confirm.confirmPassword ? "***" : "",
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

  confirmResetPassword,
  resetPasswordConfirm,
  confirmPasswordReset,

  validateResetPasswordToken,
  validateResetToken,
  validatePasswordReset,

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
