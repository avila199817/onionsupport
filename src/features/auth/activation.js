/* =========================================================
   Onion Support - Auth Activation
   Archivo: /src/features/auth/activation.js

   Responsabilidad:
   - Activación pública mínima.
   - Endpoint real desde core/config.js.
   - Token param único: token.
   - Transporte único vía CoreHttp.
   - Validar token/password/confirmPassword.
   - Aplica sesión sólo si backend devuelve token + user usable.
   - Delegar normalización de usuario/sesión en session.js.
   - Delegar slug/home/rutas en core/config.js/session.js.
   - No inventar slug.
   - Sin fetch propio.
   - Sin apiClient propio.
   - Sin Router.
   - Sin Toast.
   - Sin refresh.
   - Sin storage directo.
   - Sin first-user.
   - Sin validate endpoint inventado.
   - Sin aliases legacy pesados.
   - Sin 2FA/MFA/OTP.
   - Sin magia negra.
========================================================= */

import * as CoreHttpModule from "../../core/http.js";

import {
  AUTH_ENDPOINTS,
  ROUTES,
  TOKEN_PARAM,
  buildUserHomeRoute as configBuildUserHomeRoute,
  isBlockedRoutePath as configIsBlockedRoutePath,
  isUserHomeRoute as configIsUserHomeRoute,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
} from "../../core/config.js";

import {
  applySession,
  buildSessionUserHomePath,
  extractSessionUserSlug,
  normalizeSessionContext,
  normalizeUser as normalizeSessionUser,
} from "./session.js";

export const ACTIVATION_MODULE_VERSION = "auth.activation.v5";

const SOURCE = "auth.activation";

const ENDPOINT = AUTH_ENDPOINTS.activate || AUTH_ENDPOINTS.activateAccount;
const DEFAULT_LOGIN_REDIRECT = ROUTES.login || "/login";
const HOME_ROUTE = ROUTES.home || "/";

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
    if (typeof value === "string && value.trim() === "") continue;

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
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
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

/* =========================================================
   TOKEN
========================================================= */

function normalizeTokenValue(value = "") {
  const token = cleanText(value, "").replace(/^Bearer\s+/i, "");

  if (!token) return "";
  if (/\s/.test(token)) return "";
  if (token.length < TOKEN_MIN_LENGTH) return "";
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
    const fromSearch = normalizeTokenValue(search.get(TOKEN_PARAM) || "");

    if (fromSearch) return fromSearch;
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

export function extractActivationToken() {
  return readTokenFromLocation();
}

export function resolveActivationToken(payload = {}) {
  if (!isObject(payload) && !isFormData(payload)) {
    return normalizeTokenValue(payload || extractActivationToken() || "");
  }

  return normalizeTokenValue(
    payloadValue(payload, [
      "token",
      "activationToken",
      "activation_token",
    ]) ||
      payload?.data?.token ||
      payload?.payload?.token ||
      payload?.result?.token ||
      extractActivationToken() ||
      ""
  );
}

export function extractActivationTokenFromPayload(payload = {}) {
  return resolveActivationToken(payload);
}

/* =========================================================
   PAYLOAD
========================================================= */

function normalizePassword(value = "") {
  return rawText(value, "").slice(0, PASSWORD_MAX_LENGTH);
}

export function normalizeActivationPayload(payload = {}) {
  return {
    token: resolveActivationToken(payload),

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

export function buildActivateAccountBody(payload = {}) {
  const normalized = normalizeActivationPayload(payload);

  return {
    token: normalized.token,
    password: normalized.password,
    confirmPassword: normalized.confirmPassword,
  };
}

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
   USER / SESSION DELEGATES
========================================================= */

function normalizeUser(user = null) {
  if (!isObject(user)) return null;

  try {
    return normalizeSessionUser(user) || null;
  } catch {
    return null;
  }
}

function normalizeSession(value = null, user = null) {
  if (!isObject(value)) return null;

  try {
    return normalizeSessionContext(value, user) || null;
  } catch {
    return null;
  }
}

function extractUserSlug(user = null) {
  if (!isObject(user)) return "";

  try {
    const slug = extractSessionUserSlug(user);
    if (slug) return slug;
  } catch {
    // fallback abajo
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

function isBlockedSpaPath(path = "") {
  try {
    if (configIsBlockedRoutePath(path) === true) return true;
  } catch {
    // fallback local
  }

  const clean = cleanText(path, "")
    .split("?")[0]
    .split("#")[0]
    .replace(/\/+$/g, "")
    .toLowerCase() || "/";

  return Boolean(
    clean === "/home" ||
      clean.startsWith("/home/") ||
      clean === "/403" ||
      clean.startsWith("/403/") ||
      clean === "/404" ||
      clean.startsWith("/404/") ||
      clean === "/2fa" ||
      clean.startsWith("/2fa/") ||
      clean === "/mfa" ||
      clean.startsWith("/mfa/") ||
      clean === "/otp" ||
      clean.startsWith("/otp/")
  );
}

function normalizeSpaPath(value = "") {
  const raw = cleanText(value, "");

  if (!raw) return "";

  try {
    const path = configNormalizeRoutePath(raw);

    if (!path || isBlockedSpaPath(path)) return "";

    return path;
  } catch {
    if (!raw.startsWith("/")) return "";
    if (raw.startsWith("//")) return "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "";
    if (/[\r\n\t\\]/.test(raw)) return "";

    const clean = raw
      .split("?")[0]
      .split("#")[0]
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/g, "") || "/";

    if (isBlockedSpaPath(clean)) return "";

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
  try {
    const path = normalizeSpaPath(buildSessionUserHomePath(user));
    if (isUserHomePath(path)) return path;
  } catch {
    // fallback abajo
  }

  const slug = extractUserSlug(user);

  try {
    const configured = normalizeSpaPath(configBuildUserHomeRoute(slug));

    if (isUserHomePath(configured)) return configured;
  } catch {
    // fallback abajo
  }

  return slug ? `/@${slug}` : HOME_ROUTE;
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
    picture: clean.picture || avatar || null,
    photoUrl: clean.photoUrl || avatar || null,
    avatarUpdatedAt: clean.avatarUpdatedAt || null,
  };
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

function hasAuthEnvelopeSignals(value = null) {
  if (!isObject(value)) return false;

  return Boolean(
    value.token ||
      value.accessToken ||
      value.access_token ||
      value.refreshToken ||
      value.refresh_token ||
      value.session ||
      value.sessionData ||
      value.sessionId ||
      value.session_id ||
      value.sid ||
      value.sessionUserId ||
      value.session_user_id ||
      value.expiresAt ||
      value.expires_at ||
      value.auth ||
      value.payload ||
      value.result
  );
}

function looksLikeExplicitActivationUserObject(value = null) {
  if (!isObject(value)) return false;

  if (cleanText(value.userId || value.uid || value.sub, "")) return true;
  if (cleanText(value.username || value.userName || value.user_name, "")) return true;
  if (cleanText(value.slug || value.lookup?.slug || value.profile?.slug, "")) return true;

  if (
    cleanText(value.id, "") &&
    (
      cleanText(value.email, "") ||
      cleanText(value.displayName || value.fullName || value.name || value.nombre, "") ||
      cleanText(value.role || value.rol || value.roles, "")
    )
  ) {
    return true;
  }

  return false;
}

function looksLikeStandaloneActivationUserObject(value = null) {
  return Boolean(
    looksLikeExplicitActivationUserObject(value) &&
      !hasAuthEnvelopeSignals(value)
  );
}

function looksLikeFlatActivationUserObject(value = null) {
  if (!looksLikeExplicitActivationUserObject(value)) return false;

  return Boolean(
    cleanText(value.userId || value.id || value.uid || value.sub, "") &&
      (
        cleanText(value.username || value.userName || value.user_name, "") ||
        cleanText(value.slug || value.lookup?.slug || value.profile?.slug, "") ||
        cleanText(value.displayName || value.fullName || value.name || value.nombre, "") ||
        cleanText(value.role || value.rol || value.roles, "")
      )
  );
}

function readUser(payload = {}) {
  for (const node of nested(payload)) {
    const explicit =
      node.user ||
      node.usuario ||
      node.me ||
      node.account ||
      node.profile ||
      null;

    const user = looksLikeExplicitActivationUserObject(explicit)
      ? normalizeUser(explicit)
      : null;

    if (user) return user;
  }

  for (const node of nested(payload)) {
    if (
      !looksLikeStandaloneActivationUserObject(node) &&
      !looksLikeFlatActivationUserObject(node)
    ) {
      continue;
    }

    const user = normalizeUser(node);

    if (user) return user;
  }

  return looksLikeStandaloneActivationUserObject(payload)
    ? normalizeUser(payload)
    : null;
}

function readSession(payload = {}, user = null) {
  for (const node of nested(payload)) {
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

function responseNode(input = {}) {
  const source = isObject(input) ? input : {};

  if (isObject(source.data)) return source.data;
  if (isObject(source.payload)) return source.payload;
  if (isObject(source.result)) return source.result;

  return source;
}

function responseOk(input = {}) {
  const source = responseNode(input);

  if (typeof source.ok === "boolean") return source.ok;
  if (typeof source.success === "boolean") return source.success;

  const status = Number(source.status || source.statusCode || 0);

  if (Number.isFinite(status) && status >= 400) return false;
  if (Number.isFinite(status) && status >= 200 && status < 300) return true;

  if (readToken(input) && readUser(input)) return true;

  return Boolean(source.activated || source.active);
}

function responseMessage(input = {}, fallback = "") {
  const source = responseNode(input);

  return redact(
    cleanText(
      source.message ||
        source.mensaje ||
        source.detail ||
        source.description ||
        source.error ||
        fallback,
      fallback
    )
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
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i.test(
    String(value || "")
  );
}

function normalizeRedirectPath(value = "", fallback = DEFAULT_LOGIN_REDIRECT) {
  const fallbackPath = normalizeSpaPath(fallback) || DEFAULT_LOGIN_REDIRECT;
  const target = cleanText(value, fallbackPath);

  if (!target.startsWith("/") || target.startsWith("//")) return fallbackPath;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return fallbackPath;
  if (/[\r\n\t\\]/.test(target)) return fallbackPath;
  if (hasSensitiveQuery(target)) return fallbackPath;

  const normalized = normalizeSpaPath(target);

  return normalized || fallbackPath;
}

export function normalizeActivationResponse(input = {}) {
  const ok = responseOk(input);

  const token = readToken(input);
  const refreshToken = readRefreshToken(input);
  const user = readUser(input);
  const session = readSession(input, user);

  const authenticated = Boolean(ok && token && user);
  const homePath = authenticated ? buildUserHomePath(user) : HOME_ROUTE;

  const redirectTo = authenticated
    ? homePath
    : normalizeRedirectPath(
        responseNode(input).redirectTo ||
          responseNode(input).redirect ||
          responseNode(input).returnTo ||
          DEFAULT_LOGIN_REDIRECT,
        DEFAULT_LOGIN_REDIRECT
      );

  return {
    ok,
    success: ok,
    activated: ok,
    error: !ok,

    authenticated,

    message: responseMessage(
      input,
      ok ? "La cuenta se ha activado correctamente." : "No se pudo activar la cuenta."
    ),

    code: responseCode(input),
    status: responseStatus(input),

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
  const homePath = normalizeRedirectPath(result.homePath || HOME_ROUTE, HOME_ROUTE);
  const redirectTo = normalizeRedirectPath(result.redirectTo || DEFAULT_LOGIN_REDIRECT);

  return {
    ok: result.ok === true,
    success: result.success === true,
    activated: result.activated === true,
    error: result.error === true,

    authenticated: result.authenticated === true,
    sessionApplied: result.sessionApplied === true,

    message: redact(result.message || ""),
    code: result.code || "",
    status: result.status || 0,

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

    user: publicUser(result.user),
    usuario: publicUser(result.user),
    me: publicUser(result.user),

    session: null,
    sessionData: null,

    at: result.at || nowIso(),
  };
}

/* =========================================================
   ERRORS
========================================================= */

function errorPayload(error = null) {
  if (!error) return {};

  if (isObject(error.data)) return error.data;
  if (isObject(error.body)) return error.body;
  if (isObject(error.payload)) return error.payload;
  if (isObject(error.responseData)) return error.responseData;
  if (isObject(error.response?.data)) return error.response.data;
  if (isObject(error.response) && !isFunction(error.response.blob)) return error.response;

  return {};
}

function errorStatus(error = null) {
  const payload = errorPayload(error);

  return Number(
    error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      payload.status ||
      payload.statusCode ||
      0
  ) || 0;
}

function errorCode(error = null) {
  const payload = errorPayload(error);

  return (
    error?.code ||
    payload.code ||
    payload.errorCode ||
    payload.error_code ||
    payload.error ||
    null
  );
}

function errorMessage(error = null) {
  const payload = errorPayload(error);

  return redact(
    payload.message ||
      payload.error_description ||
      payload.error ||
      payload.detail ||
      error?.message ||
      "No se pudo activar la cuenta."
  );
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

              refreshToken: result.refreshToken || undefined,
              refresh_token: result.refresh_token || undefined,

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
          result.authenticated = result.sessionApplied;
        } catch {
          result.sessionApplied = false;
          result.authenticated = false;
        }
      }

      return sanitizeActivationResult(result);
    } catch (error) {
      return sanitizeActivationResult(
        normalizeActivationResponse({
          ok: false,
          status: errorStatus(error),
          code: errorCode(error),
          message: errorMessage(error),
          error: true,
        })
      );
    } finally {
      activatePromise = null;
    }
  })();

  return activatePromise;
}

/* =========================================================
   SNAPSHOT
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
      endpointFromConfig: true,
      tokenParamFromConfig: true,

      publicEndpoint: true,
      noFirstUser: true,
      noValidateEndpoint: true,

      sessionOwnsUserNormalization: true,
      sessionOwnsSessionNormalization: true,
      configOwnsSlugAndHomeRoute: true,

      noStorageDirect: true,
      noRouter: true,
      noToast: true,
      noRefresh: true,

      noSlugFabrication: true,
      noEmailIdentity: true,
      avoidsSessionEnvelopeAsUser: true,

      applySessionOnlyWithTokenAndUser: true,
      sanitizedResult: true,

      no2fa: true,
      noMfa: true,
      noOtp: true,

      snapshotRedacted: true,
    },
  };
}

export function getActivationDebugPayload(payload = {}) {
  const normalized = normalizeActivationPayload(payload);

  return {
    token: normalized.token ? "***" : "",
    password: normalized.password ? "***" : "",
    confirmPassword: normalized.confirmPassword ? "***" : "",
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  ACTIVATION_MODULE_VERSION,

  activateAccount,

  resolveActivationToken,
  extractActivationToken,
  extractActivationTokenFromPayload,

  normalizeActivationPayload,
  buildActivateAccountBody,
  normalizeActivationResponse,

  getActivationSnapshot,
  getActivationDebugPayload,
};
