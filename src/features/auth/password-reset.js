/* =========================================================
   Onion Support - Password Reset
   Archivo: /src/features/auth/password-reset.js

   Responsabilidad:
   - Password reset público mínimo.
   - Request endpoint desde core/config.js.
   - Confirm endpoint desde core/config.js.
   - Token param único desde core/config.js.
   - Transporte único vía CoreHttp.
   - Validar identifier/token/password/confirmPassword.
   - No toca sesión salvo token + user explícitos del backend.
   - Delegar normalización de usuario/sesión en session.js.
   - Delegar slug/home/rutas en core/config.js/session.js.
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

import * as CoreHttpModule from "../../core/http.js";

import {
  AUTH_ENDPOINTS,
  ROUTES,
  TOKEN_PARAM,
  USER_HOME_PREFIX,
  buildUserHomeRoute as configBuildUserHomeRoute,
  isBlockedRoutePath as configIsBlockedRoutePath,
  isUserHomeRoute as configIsUserHomeRoute,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
} from "../../core/config.js";

import * as SessionApi from "./session.js";

export const PASSWORD_RESET_MODULE_VERSION = "auth.password-reset.v4";

const SOURCE = "auth.password-reset";

const REQUEST_ENDPOINT = AUTH_ENDPOINTS.requestPasswordReset;
const CONFIRM_ENDPOINT = AUTH_ENDPOINTS.confirmPasswordReset;

const DEFAULT_LOGIN_REDIRECT = ROUTES.login || "/login";
const HOME_ROUTE = ROUTES.home || "/";
const USER_HOME_PREFIX_VALUE = USER_HOME_PREFIX || "/@";

const IDENTIFIER_MAX_LENGTH = 160;
const TOKEN_MIN_LENGTH = 8;
const TOKEN_MAX_LENGTH = 8192;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 1024;

const CoreHttp =
  CoreHttpModule.default ||
  CoreHttpModule.Http ||
  CoreHttpModule.http ||
  CoreHttpModule;

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

function isFormData(value) {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function rawText(value = "", fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;

    return value;
  }

  return null;
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function stripEmpty(object = {}) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => {
      return value !== undefined && value !== null && value !== "";
    })
  );
}

function payloadValue(payload = {}, names = []) {
  if (isFormData(payload)) {
    for (const name of names) {
      const value = payload.get(name);

      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }

    return undefined;
  }

  if (!isObject(payload)) return undefined;

  for (const name of names) {
    const value = payload[name];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function sessionMethod(name = "") {
  const direct = SessionApi?.[name];

  if (isFunction(direct)) return direct;

  const fromDefault = SessionApi?.default?.[name];

  if (isFunction(fromDefault)) {
    return fromDefault.bind(SessionApi.default);
  }

  return null;
}

/* =========================================================
   TOKEN / IDENTIFIER / PASSWORD
========================================================= */

function normalizeTokenValue(value = "") {
  const token = cleanText(value, "").replace(/^Bearer\s+/i, "");

  if (!token) return "";
  if (/\s/.test(token)) return "";
  if (token.length > TOKEN_MAX_LENGTH) return "";

  if (
    [
      "null",
      "undefined",
      "false",
      "true",
      "[object object]",
      "{}",
      "[]",
    ].includes(token.toLowerCase())
  ) {
    return "";
  }

  return token;
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
    const query = hash.includes("?")
      ? hash.slice(hash.indexOf("?") + 1)
      : hash;

    const params = new URLSearchParams(query);

    return normalizeTokenValue(params.get(TOKEN_PARAM) || "");
  } catch {
    return "";
  }
}

function normalizeIdentifier(value = "") {
  return cleanText(value, "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .slice(0, IDENTIFIER_MAX_LENGTH);
}

function normalizePassword(value = "") {
  return rawText(value, "").slice(0, PASSWORD_MAX_LENGTH);
}

export function resolveResetPasswordIdentifier(payload = {}) {
  return normalizeIdentifier(
    payloadValue(payload, [
      "identifier",
      "email",
      "username",
      "user",
      "login",
    ]) || ""
  );
}

export function resolveResetPasswordToken(payload = {}) {
  if (!isObject(payload) && !isFormData(payload)) {
    return normalizeTokenValue(payload || readTokenFromLocation() || "");
  }

  return normalizeTokenValue(
    payloadValue(payload, [
      "token",
      "resetToken",
      "reset_token",
    ]) ||
      payload?.data?.token ||
      payload?.payload?.token ||
      payload?.result?.token ||
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
  return {
    token: resolveResetPasswordToken(payload),

    password: normalizePassword(
      payloadValue(payload, [
        "password",
        "newPassword",
        "new_password",
      ]) || ""
    ),

    confirmPassword: normalizePassword(
      payloadValue(payload, [
        "confirmPassword",
        "passwordConfirmation",
        "password_confirmation",
      ]) || ""
    ),
  };
}

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

  if (!normalized.confirmPassword) {
    return "Confirma la contraseña.";
  }

  if (normalized.password !== normalized.confirmPassword) {
    return "Las contraseñas no coinciden.";
  }

  return "";
}

/* =========================================================
   USER / SESSION DELEGATES
========================================================= */

function normalizeUser(user = null) {
  if (!isObject(user)) return null;

  const normalize = sessionMethod("normalizeUser");

  if (isFunction(normalize)) {
    return normalize(user) || null;
  }

  return null;
}

function normalizeSession(value = null, user = null) {
  if (!isObject(value)) return null;

  const normalize = sessionMethod("normalizeSessionContext");

  if (isFunction(normalize)) {
    return normalize(value, user) || null;
  }

  return null;
}

function extractUserSlug(user = null) {
  if (!isObject(user)) return "";

  const extract = sessionMethod("extractSessionUserSlug");

  if (isFunction(extract)) {
    const slug = cleanText(extract(user), "");

    if (slug) return slug;
  }

  try {
    return configNormalizeUserSlug(
      user.slug ||
        user.lookup?.slug ||
        user.profile?.slug ||
        user.routing?.slug ||
        ""
    ) || "";
  } catch {
    return "";
  }
}

function normalizeSpaPath(value = "") {
  const raw = cleanText(value, "");

  if (!raw) return "";

  try {
    const path = configNormalizeRoutePath(raw);

    if (!path || configIsBlockedRoutePath(path)) return "";

    return path;
  } catch {
    if (!raw.startsWith("/")) return "";
    if (raw.startsWith("//")) return "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "";
    if (/[\r\n\t\\]/.test(raw)) return "";

    const clean = raw
      .split("?")[0]
      .split("#")[0]
      .replace(/\/+$/g, "") || "/";

    if (clean === "/home") return "";
    if (clean.startsWith("/2fa")) return "";
    if (clean.startsWith("/mfa")) return "";
    if (clean.startsWith("/otp")) return "";

    return clean;
  }
}

function isUserHomePath(path = "") {
  try {
    return configIsUserHomeRoute(path) === true;
  } catch {
    return /^\/@[a-z0-9][a-z0-9._-]{0,95}$/i.test(normalizeSpaPath(path));
  }
}

function buildUserHomePath(user = null) {
  const build = sessionMethod("buildSessionUserHomePath");

  if (isFunction(build)) {
    const path = normalizeSpaPath(build(user));

    if (isUserHomePath(path)) return path;
  }

  const slug = extractUserSlug(user);

  try {
    return configBuildUserHomeRoute(slug) || HOME_ROUTE;
  } catch {
    return slug ? `${USER_HOME_PREFIX_VALUE}${slug}` : HOME_ROUTE;
  }
}

function publicUser(user = null) {
  const clean = normalizeUser(user);

  if (!clean) return null;

  const avatar = clean.avatarUrl || clean.avatar || clean.picture || clean.photoUrl || "";

  return {
    id: clean.id || clean.userId || null,
    userId: clean.userId || clean.id || null,
    username: clean.username || null,
    slug: clean.slug || null,
    displayName: clean.displayName || clean.name || clean.username || null,
    role: clean.role || clean.rol || null,

    hasAvatar: Boolean(clean.hasAvatar || avatar),
    avatar: avatar || null,
    avatarUrl: avatar || null,
  };
}

/* =========================================================
   RESPONSE
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

function responseNode(input = {}) {
  const source = isObject(input) ? input : {};

  if (isObject(source.data)) return source.data;
  if (isObject(source.payload)) return source.payload;
  if (isObject(source.result)) return source.result;

  return source;
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

function readRefreshToken(input = {}) {
  return normalizeTokenValue(
    pick(nested(input), [
      "refreshToken",
      "refresh_token",
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

function readSession(input = {}, user = null) {
  for (const node of nested(input)) {
    const session = normalizeSession(
      node.session ||
        node.sessionData ||
        null,
      user
    );

    if (session) return session;
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

  return Boolean(source.sent || source.completed || source.passwordUpdated);
}

function responseMessage(input = {}, fallback = "") {
  const source = responseNode(input);

  return cleanText(
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
  return cleanText(source.code || source.errorCode || "", "");
}

function responseStatus(input = {}) {
  const source = responseNode(input);
  const status = Number(source.status || source.statusCode || 0);
  return Number.isFinite(status) ? status : 0;
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature)=/i.test(
    String(value || "")
  );
}

function normalizeRedirectPath(value = "", fallback = DEFAULT_LOGIN_REDIRECT) {
  const target = cleanText(value, fallback);

  if (!target.startsWith("/") || target.startsWith("//")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return fallback;
  if (/[\r\n\t\\]/.test(target)) return fallback;
  if (hasSensitiveQuery(target)) return fallback;

  try {
    if (configIsBlockedRoutePath(target)) return fallback;
  } catch {
    // noop
  }

  return target;
}

function responseRedirect(input = {}, fallback = DEFAULT_LOGIN_REDIRECT) {
  const source = responseNode(input);

  return normalizeRedirectPath(
    source.redirectTo ||
      source.redirect ||
      source.returnTo ||
      fallback,
    fallback
  );
}

function normalizeBaseResponse(input = {}, fallbackSuccess = "", fallbackError = "") {
  const ok = responseOk(input);

  const token = readToken(input);
  const refreshToken = readRefreshToken(input);
  const user = readUser(input);
  const session = readSession(input, user);

  const authenticated = Boolean(token && user);
  const homePath = authenticated ? buildUserHomePath(user) : HOME_ROUTE;

  const redirectTo = responseRedirect(
    input,
    authenticated ? homePath : DEFAULT_LOGIN_REDIRECT
  );

  return {
    ok,
    success: ok,
    error: !ok,

    authenticated,

    status: responseStatus(input),
    code: responseCode(input),

    message: responseMessage(input, ok ? fallbackSuccess : fallbackError),

    redirectTo,

    homePath,
    defaultHome: homePath,
    postLoginTarget: authenticated ? homePath : redirectTo,

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

function sanitizeResult(result = {}) {
  const authenticated = result.authenticated === true;

  const homePath = normalizeRedirectPath(result.homePath || HOME_ROUTE, HOME_ROUTE);
  const redirectTo = normalizeRedirectPath(result.redirectTo || DEFAULT_LOGIN_REDIRECT);

  return {
    ok: result.ok === true,
    success: result.success === true,
    error: result.error === true,

    authenticated,
    sessionApplied: result.sessionApplied === true,

    status: result.status || 0,
    code: result.code || "",

    message: result.message || "",

    redirectTo,

    homePath,
    defaultHome: normalizeRedirectPath(result.defaultHome || homePath, HOME_ROUTE),
    postLoginTarget: normalizeRedirectPath(
      result.postLoginTarget || redirectTo,
      redirectTo
    ),

    token: null,
    accessToken: null,
    access_token: null,

    refreshToken: null,
    refresh_token: null,

    user: authenticated ? publicUser(result.user) : null,
    usuario: authenticated ? publicUser(result.user) : null,
    me: authenticated ? publicUser(result.user) : null,

    session: null,
    sessionData: null,

    at: result.at || nowIso(),
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
  return normalizeBaseResponse(
    input,
    "La contraseña se ha actualizado correctamente.",
    "No se pudo restablecer la contraseña."
  );
}

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

async function postResetRequest(body = {}, options = {}) {
  const requestOptions = publicOptions(options);

  if (isFunction(CoreHttp?.requestPasswordReset)) {
    return CoreHttp.requestPasswordReset(body, requestOptions);
  }

  if (isFunction(CoreHttp?.post)) {
    return CoreHttp.post(REQUEST_ENDPOINT, body, requestOptions);
  }

  if (isFunction(CoreHttp?.request)) {
    return CoreHttp.request(REQUEST_ENDPOINT, {
      ...requestOptions,
      method: "POST",
      body,
    });
  }

  throw new Error("Cliente HTTP no disponible.");
}

async function postResetConfirm(body = {}, options = {}) {
  const requestOptions = publicOptions(options);

  if (isFunction(CoreHttp?.confirmPasswordReset)) {
    return CoreHttp.confirmPasswordReset(body, requestOptions);
  }

  if (isFunction(CoreHttp?.post)) {
    return CoreHttp.post(CONFIRM_ENDPOINT, body, requestOptions);
  }

  if (isFunction(CoreHttp?.request)) {
    return CoreHttp.request(CONFIRM_ENDPOINT, {
      ...requestOptions,
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

  const apply = sessionMethod("applySession");

  if (!isFunction(apply)) return null;

  try {
    return apply(
      {
        token: result.token,
        accessToken: result.token,
        access_token: result.token,

        refreshToken: result.refreshToken || undefined,
        refresh_token: result.refresh_token || undefined,

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
      const raw = await postResetRequest(
        buildResetPasswordRequestBody(normalized),
        options
      );

      return sanitizeResult(normalizeResetPasswordResponse(raw));
    } catch (error) {
      return sanitizeResult(
        normalizeResetPasswordResponse({
          ok: false,
          status: error?.status || error?.statusCode || error?.response?.status || 0,
          code: error?.code || error?.data?.code || error?.response?.data?.code || null,
          message: redact(
            error?.data?.message ||
              error?.response?.data?.message ||
              error?.message ||
              "No se pudo iniciar la recuperación de acceso."
          ),
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
      const raw = await postResetConfirm(
        buildConfirmResetPasswordBody(normalized),
        options
      );

      const result = normalizeConfirmResetPasswordResponse(raw);
      const snapshot = maybeApplyReturnedSession(result, "password-reset:confirm");

      result.sessionApplied = Boolean(snapshot?.authenticated);
      result.authenticated = Boolean(result.authenticated && result.sessionApplied);

      return sanitizeResult(result);
    } catch (error) {
      return sanitizeResult(
        normalizeConfirmResetPasswordResponse({
          ok: false,
          status: error?.status || error?.statusCode || error?.response?.status || 0,
          code: error?.code || error?.data?.code || error?.response?.data?.code || null,
          message: redact(
            error?.data?.message ||
              error?.response?.data?.message ||
              error?.message ||
              "No se pudo restablecer la contraseña."
          ),
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
   SNAPSHOT
========================================================= */

export function getPasswordResetSnapshot() {
  return {
    version: PASSWORD_RESET_MODULE_VERSION,

    requestEndpoint: REQUEST_ENDPOINT,
    confirmEndpoint: CONFIRM_ENDPOINT,
    validateEndpoint: "",

    tokenParam: TOKEN_PARAM,

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
      hasCoreHttp: Boolean(
        CoreHttp?.requestPasswordReset ||
          CoreHttp?.confirmPasswordReset ||
          CoreHttp?.post ||
          CoreHttp?.request
      ),
      ownFetch: false,
      ownApiClient: false,
      ownRouter: false,
      ownToast: false,
      ownStorage: false,
    },

    policy: {
      endpointsFromConfig: true,
      tokenParamFromConfig: true,

      noValidateEndpoint: true,
      noRouter: true,
      noToast: true,
      noStorage: true,
      noRefresh: true,

      sessionOwnsUserNormalization: true,
      sessionOwnsSessionNormalization: true,
      configOwnsSlugAndHomeRoute: true,

      sessionOnlyIfBackendReturnsTokenAndUser: true,

      noLegacyRoutes: true,
      noAliasesMassive: true,
      noSlugFabrication: true,
      noEmailIdentity: true,

      snapshotRedacted: true,
    },
  };
}

export function getPasswordResetDebugPayload(payload = {}) {
  const request = buildResetPasswordRequestBody(payload);
  const confirm = buildConfirmResetPasswordBody(payload);

  return {
    request: {
      identifier: request.identifier ? "***" : "",
    },
    confirm: {
      token: confirm.token ? "***" : "",
      password: confirm.password ? "***" : "",
      confirmPassword: confirm.confirmPassword ? "***" : "",
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  PASSWORD_RESET_MODULE_VERSION,

  requestPasswordReset,
  confirmResetPassword,

  resolveResetPasswordIdentifier,
  resolveResetPasswordToken,

  normalizeResetPasswordPayload,
  normalizeConfirmResetPasswordPayload,

  buildResetPasswordRequestBody,
  buildConfirmResetPasswordBody,

  normalizeResetPasswordResponse,
  normalizeConfirmResetPasswordResponse,

  getPasswordResetSnapshot,
  getPasswordResetDebugPayload,
};
