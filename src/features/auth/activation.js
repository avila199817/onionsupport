/* =========================================================
   Onion Support - Auth Activation
   Archivo: /src/features/auth/activation.js

   Responsabilidad:
   - Activación pública mínima.
   - Endpoint real: /api/auth/activate.
   - Token param único: token.
   - Transporte único vía CoreHttp.
   - Aplica sesión sólo si backend devuelve token + user usable.
   - No inventar slug.
   - Sin fetch propio.
   - Sin apiClient propio.
   - Sin Router.
   - Sin Toast.
   - Sin refresh.
   - Sin storage.
   - Sin first-user real.
   - Sin validate endpoint inventado.
   - Sin aliases legacy pesados.
   - Sin 2FA/MFA/OTP.
   - Sin magia negra.
========================================================= */

import * as CoreHttpModule from "../../core/http.js";

import {
  applySession,
} from "./session.js";

export const ACTIVATION_MODULE_VERSION = "auth.activation.v2";

const SOURCE = "auth.activation";
const ENDPOINT = "/api/auth/activate";
const TOKEN_PARAM = "token";
const DEFAULT_LOGIN_REDIRECT = "/login";

const TOKEN_MIN_LENGTH = 8;
const TOKEN_MAX_LENGTH = 8192;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 1024;

const CoreHttp =
  CoreHttpModule.default ||
  CoreHttpModule.Http ||
  CoreHttpModule.http ||
  CoreHttpModule;

let activatePromise = null;

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
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function redact(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/([?&#]access_token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

/* =========================================================
   TOKEN
========================================================= */

function normalizeTokenValue(value = "") {
  const token = text(value, "").replace(/^Bearer\s+/i, "");

  if (!token) return "";
  if (/\s/.test(token)) return "";
  if (token.length > TOKEN_MAX_LENGTH) return "";

  if (
    ["null", "undefined", "false", "true", "[object object]", "{}", "[]"].includes(
      token.toLowerCase()
    )
  ) {
    return "";
  }

  return token;
}

function readTokenFromLocation() {
  if (!isBrowser()) return "";

  try {
    const search = new URLSearchParams(window.location.search);
    const fromSearch = normalizeTokenValue(search.get(TOKEN_PARAM) || "");

    if (fromSearch) return fromSearch;
  } catch {
    // noop
  }

  try {
    const hash = String(window.location.hash || "").replace(/^#/, "");
    const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
    const params = new URLSearchParams(query);

    return normalizeTokenValue(params.get(TOKEN_PARAM) || "");
  } catch {
    return "";
  }
}

export function extractActivationToken() {
  return readTokenFromLocation();
}

export function resolveActivationToken(payload = {}) {
  if (!isObject(payload)) {
    return normalizeTokenValue(payload || extractActivationToken() || "");
  }

  return normalizeTokenValue(
    payload.token ||
      payload.data?.token ||
      payload.payload?.token ||
      payload.result?.token ||
      payload.activationToken ||
      payload.activation_token ||
      extractActivationToken() ||
      ""
  );
}

export function extractActivationTokenFromPayload(payload = {}) {
  return resolveActivationToken(payload);
}

export const extractActivationTokenValue = extractActivationTokenFromPayload;

/* =========================================================
   PAYLOAD
========================================================= */

function normalizePassword(value = "") {
  return rawText(value, "").slice(0, PASSWORD_MAX_LENGTH);
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
  };
}

export const normalizeActivateAccountPayload = normalizeActivationPayload;

export function buildActivateAccountBody(payload = {}) {
  const normalized = normalizeActivationPayload(payload);

  return {
    token: normalized.token,
    password: normalized.password,
    confirmPassword: normalized.confirmPassword,
  };
}

export const buildActivationRequestBody = buildActivateAccountBody;

function validateActivationPayload(payload = {}) {
  const normalized = normalizeActivationPayload(payload);

  if (!normalized.token) return "No se recibió token de activación.";
  if (normalized.token.length < TOKEN_MIN_LENGTH) return "El enlace de activación no es válido.";
  if (normalized.token.length > TOKEN_MAX_LENGTH) return "El enlace de activación no es válido.";

  if (!normalized.password) return "La contraseña es obligatoria.";
  if (normalized.password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (normalized.password.length > PASSWORD_MAX_LENGTH) {
    return "La contraseña es demasiado larga.";
  }

  if (!normalized.confirmPassword) {
    return "Confirma la contraseña.";
  }

  if (normalized.password !== normalized.confirmPassword) {
    return "Las contraseñas no coinciden.";
  }

  return "";
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

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

function cleanRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(cleanRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "user";
  }

  return String(value || "").toLowerCase() === "admin" ? "admin" : "user";
}

function normalizeSlug(value = "") {
  const slug = text(value, "")
    .replace(/^\/+/, "")
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();

  if (!slug) return "";

  return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
}

function extractUserSlug(user = null) {
  if (!isObject(user)) return "";

  return normalizeSlug(
    user.slug ||
      user.lookup?.slug ||
      user.profile?.slug ||
      ""
  );
}

function removeSensitiveUserFields(user = {}) {
  const output = { ...user };

  for (const key of [
    "password",
    "passwordHash",
    "hash",
    "salt",

    "token",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",

    "resetToken",
    "activationToken",

    "otp",
    "otpCode",
    "mfa",
    "twofa_secret",
    "twofaSecret",
    "totpSecret",
    "backupCodes",
  ]) {
    try {
      delete output[key];
    } catch {
      // noop
    }
  }

  return output;
}

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  const status = text(user.status || user.estado, "").toLowerCase();

  return Boolean(
    user.disabled === true ||
      user.deleted === true ||
      user.archived === true ||
      user.active === false ||
      status === "disabled" ||
      status === "deleted" ||
      status === "archived"
  );
}

function hasUserIdentity(user = null) {
  if (!isObject(user)) return false;

  return Boolean(
    text(user.id, "") ||
      text(user.userId, "") ||
      text(user.username, "") ||
      text(user.slug, "") ||
      text(user.lookup?.slug, "")
  );
}

function userOk(user = null) {
  return Boolean(
    isObject(user) &&
      !userDisabled(user) &&
      hasUserIdentity(user)
  );
}

function normalizeUser(user = null) {
  if (!userOk(user)) return null;

  const safeUser = removeSensitiveUserFields(user);

  const id = text(safeUser.userId || safeUser.id, "");
  const slug = extractUserSlug(safeUser);
  const profile = isObject(safeUser.profile) ? safeUser.profile : {};

  const username = text(
    safeUser.username ||
      safeUser.userName ||
      safeUser.user_name ||
      slug ||
      id,
    ""
  );

  const displayName = text(
    safeUser.displayName ||
      safeUser.fullName ||
      safeUser.name ||
      safeUser.nombre ||
      profile.displayName ||
      profile.fullName ||
      profile.name ||
      profile.nombre ||
      username ||
      id,
    "Usuario"
  );

  const role = cleanRole(safeUser.role || safeUser.rol || safeUser.roles);

  return {
    ...safeUser,

    id: id || null,
    userId: safeUser.userId || id || null,

    username: username || null,
    slug: slug || null,

    name: safeUser.name || displayName,
    fullName: safeUser.fullName || displayName,
    displayName,

    email: safeUser.email || null,

    role,
    rol: role,
    roles: [role],

    isAdmin: role === "admin",
    isSupport: false,
    isManager: false,
    isClient: false,

    avatar: safeUser.avatar || safeUser.avatarUrl || safeUser.picture || null,
    avatarUrl: safeUser.avatarUrl || safeUser.avatar || safeUser.picture || null,
    picture: safeUser.picture || safeUser.avatarUrl || safeUser.avatar || null,
    hasAvatar: Boolean(safeUser.avatar || safeUser.avatarUrl || safeUser.picture),

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
    username: clean.username || null,
    slug: clean.slug || null,
    displayName: clean.displayName || clean.name || clean.username || null,
    role: clean.role || clean.rol || null,
    hasAvatar: Boolean(clean.avatar || clean.avatarUrl || clean.picture),
  };
}

function readToken(payload = {}) {
  return normalizeTokenValue(
    pick(nested(payload), [
      "token",
      "accessToken",
      "access_token",
    ]) || ""
  );
}

function readRefreshToken(payload = {}) {
  return normalizeTokenValue(
    pick(nested(payload), [
      "refreshToken",
      "refresh_token",
    ]) || ""
  );
}

function readUser(payload = {}) {
  for (const node of nested(payload)) {
    const user = normalizeUser(
      node.user ||
        node.usuario ||
        node.me ||
        node.account ||
        node.profile
    );

    if (user) return user;
  }

  return normalizeUser(payload);
}

function readSession(payload = {}) {
  for (const node of nested(payload)) {
    const session =
      node.session ||
      node.sessionData ||
      null;

    if (isObject(session)) return session;
  }

  return null;
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

function responseOk(input = {}) {
  const source = responseNode(input);

  if (typeof source.ok === "boolean") return source.ok;
  if (typeof source.success === "boolean") return source.success;

  const status = Number(source.status || source.statusCode || 0);

  if (Number.isFinite(status) && status >= 400) return false;
  if (Number.isFinite(status) && status >= 200 && status < 300) return true;

  if (readToken(input) && readUser(input)) return true;

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

export function normalizeActivationResponse(input = {}) {
  const ok = responseOk(input);

  const token = readToken(input);
  const refreshToken = readRefreshToken(input);
  const user = readUser(input);
  const session = readSession(input);

  const authenticated = Boolean(token && user);

  return {
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

    code: responseCode(input),
    status: responseStatus(input),

    redirectTo: responseRedirect(input),

    token: authenticated ? token : null,
    accessToken: authenticated ? token : null,
    access_token: authenticated ? token : null,

    refreshToken: authenticated && refreshToken ? refreshToken : null,
    refresh_token: authenticated && refreshToken ? refreshToken : null,

    user: authenticated ? user : null,
    usuario: authenticated ? user : null,
    me: authenticated ? user : null,

    session: authenticated ? session : null,
    sessionData: authenticated ? session : null,

    sessionApplied: false,
    at: nowIso(),
  };
}

export const normalizeActivateAccountResponse = normalizeActivationResponse;

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

async function postActivation(body = {}, options = {}) {
  const requestOptions = publicOptions(options);

  if (isFunction(CoreHttp?.activate)) {
    return CoreHttp.activate(body, requestOptions);
  }

  if (isFunction(CoreHttp?.post)) {
    return CoreHttp.post(ENDPOINT, body, requestOptions);
  }

  if (isFunction(CoreHttp?.request)) {
    return CoreHttp.request(ENDPOINT, {
      ...requestOptions,
      method: "POST",
      body,
    });
  }

  throw new Error("Cliente HTTP no disponible.");
}

/* =========================================================
   RESULT SANITIZE
========================================================= */

function sanitizeActivationResult(result = {}) {
  return {
    ok: result.ok === true,
    success: result.success === true,
    activated: result.activated === true,
    valid: result.valid === true,
    error: result.error === true,

    authenticated: result.authenticated === true,
    sessionApplied: result.sessionApplied === true,

    message: result.message || "",
    code: result.code || "",
    status: result.status || 0,

    redirectTo: responseRedirect(result),

    token: null,
    accessToken: null,
    access_token: null,

    refreshToken: null,
    refresh_token: null,

    user: publicUser(result.user),
    usuario: publicUser(result.user),
    me: publicUser(result.user),

    session: null,
    sessionData: null,

    at: result.at || nowIso(),
  };
}

/* =========================================================
   ACTIONS
========================================================= */

export async function activateAccount(payload = {}, options = {}) {
  if (activatePromise) return activatePromise;

  const normalized = normalizeActivationPayload(payload);
  const validationError = validateActivationPayload(normalized);

  if (validationError) {
    return sanitizeActivationResult(
      normalizeActivationResponse({
        ok: false,
        status: 400,
        message: validationError,
      })
    );
  }

  activatePromise = (async () => {
    try {
      const raw = await postActivation(
        buildActivateAccountBody(normalized),
        options
      );

      const result = normalizeActivationResponse(raw);

      if (result.authenticated && result.token && result.user) {
        try {
          const snapshot = applySession(
            {
              token: result.token,
              accessToken: result.token,
              access_token: result.token,

              refreshToken: result.refreshToken,
              refresh_token: result.refresh_token,

              user: result.user,
              usuario: result.user,
              me: result.user,

              session: result.sessionData || result.session || null,
              sessionData: result.sessionData || result.session || null,
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

      return sanitizeActivationResult(result);
    } catch (error) {
      return sanitizeActivationResult(
        normalizeActivationResponse({
          ok: false,
          status: error?.status || error?.statusCode || error?.response?.status || 0,
          code: error?.code || error?.data?.code || error?.response?.data?.code || null,
          message: redact(
            error?.data?.message ||
              error?.response?.data?.message ||
              error?.message ||
              "No se pudo activar la cuenta."
          ),
          error: true,
        })
      );
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

  const valid = Boolean(
    token &&
      token.length >= TOKEN_MIN_LENGTH &&
      token.length <= TOKEN_MAX_LENGTH
  );

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
    ...sanitizeActivationResult(normalizeActivationResponse(input)),
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

  return token ? { token } : {};
}

export function normalizeValidateActivationTokenResponse(input = {}) {
  return {
    ...sanitizeActivationResult(normalizeActivationResponse(input)),
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
  return ENDPOINT;
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
   SNAPSHOT / DEBUG
========================================================= */

export function getActivationSnapshot() {
  return {
    version: ACTIVATION_MODULE_VERSION,

    endpoint: ENDPOINT,
    tokenParam: TOKEN_PARAM,

    currentPath: redact(
      isBrowser()
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : ""
    ),

    hasTokenInCurrentUrl: Boolean(resolveActivationToken()),

    inFlight: Boolean(activatePromise),

    limits: {
      tokenMinLength: TOKEN_MIN_LENGTH,
      tokenMaxLength: TOKEN_MAX_LENGTH,
      passwordMinLength: PASSWORD_MIN_LENGTH,
      passwordMaxLength: PASSWORD_MAX_LENGTH,
    },

    transport: {
      hasCoreHttp: Boolean(CoreHttp?.activate || CoreHttp?.post || CoreHttp?.request),
      ownFetch: false,
      ownApiClient: false,
      ownRouter: false,
      ownToast: false,
      ownStorage: false,
    },

    policy: {
      endpoint: ENDPOINT,
      tokenParam: TOKEN_PARAM,

      publicEndpoint: true,
      noFirstUser: true,
      noValidateEndpoint: true,

      noStorage: true,
      noRouter: true,
      noToast: true,
      noRefresh: true,

      noSlugFabrication: true,
      noEmailIdentity: true,

      applySessionOnlyWithTokenAndUser: true,
      sanitizedResult: true,
      no2fa: true,
    },
  };
}

export function getActivationDebugPayload(payload = {}) {
  const normalized = normalizeActivationPayload(payload);

  return {
    activate: {
      token: normalized.token ? "***" : "",
      password: normalized.password ? "***" : "",
      confirmPassword: normalized.confirmPassword ? "***" : "",
    },
    validate: {
      token: normalized.token ? "***" : "",
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
  extractActivationTokenFromPayload,
  extractActivationTokenValue,

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
