/* =========================================================
   Onion Support - Auth Activation
   Archivo: /src/features/auth/activation.js

   Responsabilidad:
   - Activación pública mínima.
   - Endpoint real: /api/auth/activate.
   - Token param único: token.
   - Transporte único vía CoreHttp.
   - Aplica sesión sólo si backend devuelve token + user.
   - Sin fetch propio.
   - Sin apiClient propio.
   - Sin Router.
   - Sin Toast.
   - Sin refresh.
   - Sin first-user real.
   - Sin validate endpoint inventado.
   - Sin aliases legacy masivos.
========================================================= */

import CoreHttp from "../../core/http.js";

import {
  AUTH_ENDPOINTS,
  AUTH_CONSTANTS,
} from "./constants.js";

import {
  extractActivationToken,
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

export const ACTIVATION_MODULE_VERSION = "simple";

const SOURCE = "auth.activation";
const DEFAULT_LOGIN_REDIRECT = "/login";

let activatePromise = null;

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
   TOKEN / PAYLOAD
========================================================= */

export function resolveActivationToken(payload = {}) {
  return normalizeTokenValue(
    payload?.token ||
      extractActivationToken() ||
      ""
  ) || "";
}

export function extractActivationTokenFromPayload(payload = {}) {
  return resolveActivationToken(payload);
}

export const extractActivationTokenValue = extractActivationTokenFromPayload;

function normalizePassword(value = "") {
  return rawText(value, "");
}

function normalizeName(value = "") {
  return text(value, "").normalize("NFKC").replace(/\s+/g, " ").slice(0, 160);
}

function normalizeIdentifier(value = "") {
  return text(value, "").normalize("NFKC").replace(/\s+/g, " ").slice(0, 160);
}

export function normalizeActivationPayload(payload = {}) {
  const source = isObject(payload) ? payload : {};

  return {
    token: resolveActivationToken(source),

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

    identifier: normalizeIdentifier(
      source.identifier ||
        source.email ||
        source.username ||
        source.user ||
        source.login ||
        ""
    ),

    name: normalizeName(
      source.name ||
        source.nombre ||
        source.displayName ||
        source.display_name ||
        ""
    ),

    redirectTo: safeRedirect(
      source.redirectTo ||
        source.redirect ||
        source.returnTo ||
        DEFAULT_LOGIN_REDIRECT,
      DEFAULT_LOGIN_REDIRECT
    ),

    lang: text(source.lang || source.language || "", "").slice(0, 8),
  };
}

export const normalizeActivateAccountPayload = normalizeActivationPayload;

export function buildActivateAccountBody(payload = {}) {
  const normalized = normalizeActivationPayload(payload);

  const body = {
    token: normalized.token,
    password: normalized.password,
    identifier: normalized.identifier || undefined,
    name: normalized.name || undefined,
    redirectTo: normalized.redirectTo || undefined,
    lang: normalized.lang || undefined,
  };

  if (normalized.confirmPassword) {
    body.confirmPassword = normalized.confirmPassword;
  }

  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

export const buildActivationRequestBody = buildActivateAccountBody;

function validateActivationPayload(payload = {}) {
  const normalized = normalizeActivationPayload(payload);

  if (!normalized.token) return "No se recibió token de activación.";
  if (normalized.token.length < tokenMinLength()) return "El token de activación no es válido.";
  if (normalized.token.length > tokenMaxLength()) return "El token de activación no es válido.";

  if (!normalized.password) return "La contraseña es obligatoria.";
  if (normalized.password.length < passwordMinLength()) {
    return `La contraseña debe tener al menos ${passwordMinLength()} caracteres.`;
  }
  if (normalized.password.length > passwordMaxLength()) return "La contraseña es demasiado larga.";

  if (normalized.confirmPassword && normalized.password !== normalized.confirmPassword) {
    return "Las contraseñas no coinciden.";
  }

  return "";
}

/* =========================================================
   RESPONSE
========================================================= */

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

function responseOk(input = {}) {
  const source = responseNode(input);

  if (typeof source.ok === "boolean") return source.ok;
  if (typeof source.success === "boolean") return source.success;

  const status = Number(source.status || source.statusCode || 0);

  if (Number.isFinite(status) && status >= 400) return false;
  if (Number.isFinite(status) && status >= 200 && status < 300) return true;

  return Boolean(source.activated || source.valid || source.active);
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

function responseRedirect(input = {}, fallback = DEFAULT_LOGIN_REDIRECT) {
  const source = responseNode(input);
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

export function normalizeActivationResponse(input = {}) {
  const ok = responseOk(input);

  let auth = null;

  try {
    auth = normalizeAuthResponse(input, {
      mode: "activation",
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
    activated: ok,
    valid: ok,
    error: !ok,

    authenticated,

    message: responseMessage(
      input,
      ok ? "La cuenta se ha activado correctamente." : "No se pudo activar la cuenta."
    ),

    code: responseNode(input).code || responseNode(input).errorCode || null,
    status: responseNode(input).status || responseNode(input).statusCode || 0,

    redirectTo: responseRedirect(input),

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

export const normalizeActivateAccountResponse = normalizeActivationResponse;

/* =========================================================
   HTTP
========================================================= */

function endpoint() {
  return AUTH_ENDPOINTS?.activateAccount || AUTH_ENDPOINTS?.activate || "/api/auth/activate";
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

async function postActivation(body = {}, options = {}) {
  if (isFunction(CoreHttp?.post)) {
    return CoreHttp.post(endpoint(), body, publicOptions(options));
  }

  return CoreHttp.request(endpoint(), {
    ...publicOptions(options),
    method: "POST",
    body,
  });
}

/* =========================================================
   ACTIONS
========================================================= */

export async function activateAccount(payload = {}, options = {}) {
  if (activatePromise) return activatePromise;

  const normalized = normalizeActivationPayload(payload);
  const validationError = validateActivationPayload(normalized);

  if (validationError) {
    return normalizeActivationResponse({
      ok: false,
      status: 400,
      message: validationError,
    });
  }

  activatePromise = (async () => {
    try {
      const raw = await postActivation(buildActivateAccountBody(normalized), options);
      const result = normalizeActivationResponse(raw);

      if (result.authenticated && result.token && result.user) {
        try {
          const snapshot = applySession(
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
              source: SOURCE,
              eventMode: "activation",
            },
            {
              source: SOURCE,
              eventMode: "activation",
              silent: true,
              emit: false,
            }
          );

          result.sessionApplied = Boolean(snapshot?.authenticated);
        } catch {
          result.sessionApplied = false;
        }
      }

      return {
        ...result,
        token: null,
        accessToken: null,
        access_token: null,
        refreshToken: null,
        refresh_token: null,
        user: publicUser(result.user),
      };
    } catch (error) {
      return normalizeActivationResponse({
        ok: false,
        status: error?.status || error?.statusCode || error?.response?.status || 0,
        code: error?.code || error?.data?.code || error?.response?.data?.code || null,
        message: extractMessage(error) || "No se pudo activar la cuenta.",
        error: true,
      });
    } finally {
      activatePromise = null;
    }
  })();

  return activatePromise;
}

export const activate = activateAccount;
export const activation = activateAccount;
export const confirmActivation = activateAccount;

/* =========================================================
   VALIDATE TOKEN
   No endpoint real. Validación local simple.
========================================================= */

export async function validateActivationToken(payload = {}) {
  const token = resolveActivationToken(payload);
  const valid = Boolean(token && token.length >= tokenMinLength() && token.length <= tokenMaxLength());

  return {
    ok: valid,
    success: valid,
    valid,
    activated: false,
    authenticated: false,
    token: null,
    message: valid ? "Token de activación válido." : "Token de activación no válido.",
  };
}

export const validateActivateAccountToken = validateActivationToken;
export const validateActivateToken = validateActivationToken;
export const validateAccountActivationToken = validateActivationToken;
export const activationValidate = validateActivationToken;

/* =========================================================
   UNSUPPORTED COMPAT
========================================================= */

export async function activateFirstUser() {
  return {
    ok: false,
    success: false,
    activated: false,
    authenticated: false,
    code: "UNSUPPORTED_FLOW",
    message: "La activación de primer usuario no está disponible en el SPA mínimo.",
  };
}

export const firstUserActivation = activateFirstUser;
export const activateInitialUser = activateFirstUser;

export function normalizeFirstUserActivationPayload(payload = {}) {
  return normalizeActivationPayload(payload);
}

export function buildActivateFirstUserBody(payload = {}) {
  return buildActivateAccountBody(payload);
}

export const buildFirstUserActivationBody = buildActivateFirstUserBody;

export function normalizeFirstUserActivationResponse(input = {}) {
  return {
    ...normalizeActivationResponse(input),
    code: "UNSUPPORTED_FLOW",
  };
}

/* =========================================================
   COMPAT BUILDERS
========================================================= */

export function normalizeValidateActivationTokenPayload(payload = {}) {
  return {
    token: resolveActivationToken(payload),
  };
}

export function buildValidateActivationTokenBody(payload = {}) {
  const token = resolveActivationToken(payload);

  return token
    ? {
        token,
      }
    : {};
}

export function normalizeValidateActivationTokenResponse(input = {}) {
  return {
    ...normalizeActivationResponse(input),
    authenticated: false,
    token: null,
    accessToken: null,
    refreshToken: null,
  };
}

/* =========================================================
   ENDPOINT GETTERS
========================================================= */

export function getActivateAccountEndpoint() {
  return endpoint();
}

export const getActivationEndpoint = getActivateAccountEndpoint;
export const getAccountActivationEndpoint = getActivateAccountEndpoint;

export function getActivateFirstUserEndpoint() {
  return "";
}

export const getFirstUserActivationEndpoint = getActivateFirstUserEndpoint;

export function getValidateActivationTokenEndpoint() {
  return "";
}

export const getValidateActivateAccountTokenEndpoint = getValidateActivationTokenEndpoint;
export const getValidateActivateTokenEndpoint = getValidateActivationTokenEndpoint;
export const getValidateAccountActivationTokenEndpoint = getValidateActivationTokenEndpoint;

/* =========================================================
   SNAPSHOT
========================================================= */

export function getActivationSnapshot() {
  return {
    version: ACTIVATION_MODULE_VERSION,

    endpoint: endpoint(),

    currentPath: redact(
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : ""
    ),

    hasTokenInCurrentUrl: Boolean(resolveActivationToken()),

    inFlight: Boolean(activatePromise),

    limits: {
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
      endpoint: "/api/auth/activate",
      tokenParam: "token",
      noFirstUser: true,
      noValidateEndpoint: true,
      applySessionOnlyWithTokenAndUser: true,
    },
  };
}

export function getActivationDebugPayload(payload = {}) {
  return {
    activate: {
      ...buildActivateAccountBody(payload),
      token: resolveActivationToken(payload) ? "***" : "",
      password: normalizeActivationPayload(payload).password ? "***" : "",
      confirmPassword: normalizeActivationPayload(payload).confirmPassword ? "***" : "",
    },
    validate: {
      token: resolveActivationToken(payload) ? "***" : "",
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

const Activation = Object.assign(activateAccount, {
  version: ACTIVATION_MODULE_VERSION,

  activateAccount,
  activate,
  activation,
  confirmActivation,

  activateFirstUser,
  firstUserActivation,
  activateInitialUser,

  validateActivationToken,
  validateActivateAccountToken,
  validateActivateToken,
  validateAccountActivationToken,
  activationValidate,

  resolveActivationToken,
  extractActivationToken,

  normalizeActivationPayload,
  normalizeActivateAccountPayload,

  normalizeFirstUserActivationPayload,
  normalizeValidateActivationTokenPayload,

  buildActivateAccountBody,
  buildActivationRequestBody,

  buildActivateFirstUserBody,
  buildFirstUserActivationBody,
  buildValidateActivationTokenBody,

  normalizeActivationResponse,
  normalizeActivateAccountResponse,
  normalizeFirstUserActivationResponse,
  normalizeValidateActivationTokenResponse,

  getActivateAccountEndpoint,
  getActivationEndpoint,
  getAccountActivationEndpoint,
  getActivateFirstUserEndpoint,
  getFirstUserActivationEndpoint,
  getValidateActivationTokenEndpoint,
  getValidateActivateAccountTokenEndpoint,
  getValidateActivateTokenEndpoint,
  getValidateAccountActivationTokenEndpoint,

  getActivationSnapshot,
  getActivationDebugPayload,
});

export default Activation;
