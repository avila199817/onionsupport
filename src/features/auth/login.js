/* =========================================================
   Onion Support - Auth Login
   Archivo: /src/features/auth/login.js

   Responsabilidad:
   - Login público vía CoreHttp.
   - Normalizar credenciales.
   - Validar respuesta mínima.
   - Devolver token + user para que Auth/index.js aplique sesión.
   - Exponer homePath/postLoginTarget si el user trae slug real.
   - Sin fetch propio.
   - Sin apiClient propio.
   - Sin Router.
   - Sin Toast.
   - Sin AppCore state.
   - Sin eventos.
   - Sin refresh automático.
   - Sin storage paralelo.
   - Sin rutas inventadas.
   - Sin /home.
   - Sin 2FA/MFA/OTP.
========================================================= */

import * as CoreHttpModule from "../../core/http.js";

export const LOGIN_VERSION = "auth.login.v1";

export const AUTH_ENDPOINTS = Object.freeze({
  login: "/api/auth/login",
});

const LOGIN_ROUTE = "/login";
const HOME_ROUTE = "/";
const USER_HOME_PREFIX = "/@";

const MAX_IDENTIFIER_LENGTH = 160;
const MAX_PASSWORD_LENGTH = 1024;

const CoreHttp =
  CoreHttpModule.default ||
  CoreHttpModule.Http ||
  CoreHttpModule.http ||
  CoreHttpModule;

let loginPromise = null;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function rawText(value = "", fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function bool(value, fallback = false) {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;

  const clean = text(value, "").toLowerCase();

  if (["true", "yes", "si", "sí", "on"].includes(clean)) return true;
  if (["false", "no", "off"].includes(clean)) return false;

  return Boolean(fallback);
}

function cleanRole(value = "") {
  return String(value || "").toLowerCase() === "admin" ? "admin" : "user";
}

/* =========================================================
   SLUG / HOME
========================================================= */

export function normalizeLoginSlug(value = "") {
  const slug = text(value, "").replace(/^@+/, "").trim();

  if (!slug) return "";

  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(slug) ? slug : "";
}

export function extractLoginUserSlug(user = null) {
  if (!isObject(user)) return "";

  return normalizeLoginSlug(
    user.slug ||
      user.lookup?.slug ||
      user.profile?.slug ||
      ""
  );
}

export function buildUserHomePath(user = null) {
  const slug = extractLoginUserSlug(user);

  return slug ? `${USER_HOME_PREFIX}${slug}` : HOME_ROUTE;
}

export function getPostLoginTarget(user = null) {
  return buildUserHomePath(user);
}

/* =========================================================
   TOKEN / USER
========================================================= */

function stripBearer(value = "") {
  return text(value, "").replace(/^Bearer\s+/i, "");
}

function tokenOk(value = "") {
  const token = stripBearer(value);

  if (!token) return false;
  if (/\s/.test(token)) return false;

  return ![
    "null",
    "undefined",
    "false",
    "true",
    "[object object]",
    "{}",
    "[]",
  ].includes(token.toLowerCase());
}

function cleanToken(value = "") {
  return tokenOk(value) ? stripBearer(value) : "";
}

function getHttpToken() {
  try {
    return cleanToken(CoreHttp?.getAccessToken?.() || CoreHttp?.token || "");
  } catch {
    return "";
  }
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

  const status = String(user.status || user.estado || "").toLowerCase();

  return (
    user.disabled === true ||
    user.deleted === true ||
    status === "disabled" ||
    status === "deleted"
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

  const safeUser = removeSensitiveUserFields(user);

  const id = safeUser.userId || safeUser.id || null;
  const email = safeUser.email || null;
  const slug = extractLoginUserSlug(safeUser);

  const username =
    safeUser.username ||
    safeUser.userName ||
    safeUser.user_name ||
    slug ||
    email ||
    id ||
    null;

  const displayName =
    safeUser.displayName ||
    safeUser.fullName ||
    safeUser.name ||
    safeUser.nombre ||
    username ||
    email ||
    id ||
    "Usuario";

  const role = cleanRole(safeUser.role || safeUser.rol);

  return {
    ...safeUser,

    id,
    userId: safeUser.userId || id,

    username,
    slug: slug || null,

    name: safeUser.name || displayName,
    fullName: safeUser.fullName || displayName,
    displayName,

    email,

    role,
    rol: role,
    roles: [role],

    active: true,
    disabled: false,
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

function readToken(payload = {}) {
  return (
    cleanToken(
      pick(nested(payload), [
        "token",
        "accessToken",
        "access_token",
      ])
    ) || getHttpToken()
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

function readMessage(payload = {}) {
  if (!isObject(payload)) return "";

  return text(
    payload.message ||
      payload.error ||
      payload.data?.message ||
      payload.data?.error ||
      payload.auth?.message ||
      payload.session?.message ||
      "",
    ""
  );
}

function readCode(payload = {}) {
  if (!isObject(payload)) return "";

  return text(
    payload.code ||
      payload.errorCode ||
      payload.data?.code ||
      payload.auth?.code ||
      payload.session?.code ||
      "",
    ""
  );
}

function normalizeLoginResponse(response = {}) {
  const token = readToken(response);
  const user = readUser(response);
  const role = user?.role || null;
  const slug = extractLoginUserSlug(user);
  const homePath = buildUserHomePath(user);
  const authenticated = Boolean(token && user);

  return {
    ok: authenticated,
    success: authenticated,
    authenticated,

    token,
    accessToken: token,
    access_token: token,

    user,

    userSlug: slug || null,
    homePath,
    defaultHome: homePath,
    postLoginTarget: homePath,

    role,
    roles: role ? [role] : [],

    message: readMessage(response),
    code: readCode(response),

    raw: response,
  };
}

/* =========================================================
   ERRORS
========================================================= */

function safeErrorMessage(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function extractMessage(error = null) {
  return (
    text(error?.data?.message, "") ||
    text(error?.response?.data?.message, "") ||
    text(error?.message, "") ||
    String(error || "")
  );
}

function createLoginError(message = "No se pudo iniciar sesión.", options = {}) {
  const error = new Error(safeErrorMessage(message));

  error.name = "AuthLoginError";
  error.status = options.status || 401;
  error.statusCode = error.status;
  error.code = options.code || "LOGIN_FAILED";

  return error;
}

function normalizeLoginError(error = null) {
  if (error?.name === "AuthLoginError") return error;

  const status =
    Number(error?.status || error?.statusCode || error?.response?.status || 0) || 0;

  return createLoginError(extractMessage(error) || "No se pudo iniciar sesión.", {
    status: status || 500,
    code:
      error?.code ||
      error?.data?.code ||
      error?.response?.data?.code ||
      (status === 401 ? "UNAUTHORIZED" : "LOGIN_FAILED"),
  });
}

/* =========================================================
   CREDENTIALS
========================================================= */

function normalizeIdentifier(value = "") {
  return text(value, "")
    .normalize("NFKC")
    .slice(0, MAX_IDENTIFIER_LENGTH);
}

function normalizePassword(value = "") {
  return rawText(value, "").slice(0, MAX_PASSWORD_LENGTH);
}

function looksLikeEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

function sanitizeUsername(value = "") {
  return text(value, "")
    .normalize("NFKC")
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, MAX_IDENTIFIER_LENGTH);
}

export function resolveLoginIdentifier(credentials = {}) {
  return text(
    credentials.identifier ??
      credentials.email ??
      credentials.username ??
      credentials.user ??
      credentials.login ??
      ""
  );
}

export function normalizeLoginPayload(credentials = {}) {
  return {
    identifier: normalizeIdentifier(resolveLoginIdentifier(credentials)),
    password: normalizePassword(credentials.password ?? credentials.pass ?? ""),
    remember: bool(credentials.remember, false),
  };
}

export function buildLoginRequestBody(credentials = {}) {
  const payload = normalizeLoginPayload(credentials);
  const email = looksLikeEmail(payload.identifier)
    ? payload.identifier.toLowerCase()
    : "";

  const username = email ? "" : sanitizeUsername(payload.identifier);

  return {
    identifier: payload.identifier,
    login: payload.identifier,

    email: email || undefined,
    emailLower: email || undefined,

    username: username || undefined,
    usernameLower: username || undefined,

    password: payload.password,

    remember: payload.remember,
    rememberMe: payload.remember,
  };
}

/* =========================================================
   REQUEST
========================================================= */

function loginOptions(options = {}) {
  return {
    ...options,
    auth: false,
    public: true,
    skipAuth: true,
    noAuthHeader: true,
    retries: 0,
    storeError: false,
  };
}

async function requestLogin(body = {}, options = {}) {
  const finalOptions = loginOptions(options);

  if (isFn(CoreHttp?.login)) {
    return CoreHttp.login(body, finalOptions);
  }

  if (isFn(CoreHttp?.post)) {
    return CoreHttp.post(AUTH_ENDPOINTS.login, body, finalOptions);
  }

  if (isFn(CoreHttp?.request)) {
    return CoreHttp.request(AUTH_ENDPOINTS.login, {
      ...finalOptions,
      method: "POST",
      body,
    });
  }

  throw createLoginError("Cliente HTTP no disponible.", {
    status: 500,
    code: "HTTP_CLIENT_MISSING",
  });
}

/* =========================================================
   ROUTE HELPERS
   Compatibilidad pura: login no navega.
========================================================= */

export function buildLoginRedirectPath() {
  return LOGIN_ROUTE;
}

/* =========================================================
   PUBLIC API
========================================================= */

export async function login(credentials = {}, options = {}) {
  if (loginPromise) return loginPromise;

  const payload = normalizeLoginPayload(credentials);

  if (!payload.identifier || !payload.password) {
    throw createLoginError("Usuario/email y contraseña son obligatorios.", {
      status: 400,
      code: "MISSING_CREDENTIALS",
    });
  }

  loginPromise = (async () => {
    try {
      const response = await requestLogin(buildLoginRequestBody(payload), options);
      const result = normalizeLoginResponse(response);

      if (!result.authenticated) {
        throw createLoginError(
          result.message || "El login no devolvió una sesión válida.",
          {
            status: 401,
            code: result.code || "INVALID_LOGIN_SESSION",
          }
        );
      }

      return result;
    } catch (error) {
      throw normalizeLoginError(error);
    } finally {
      loginPromise = null;
    }
  })();

  return loginPromise;
}

export async function handleLoginFormSubmit(formElement, options = {}) {
  const HTMLForm = isBrowser() ? window.HTMLFormElement : null;

  if (!HTMLForm || !(formElement instanceof HTMLForm)) {
    throw new Error("Se esperaba un formulario HTML válido.");
  }

  try {
    options.event?.preventDefault?.();
  } catch {
    // noop
  }

  const formData = new FormData(formElement);

  const result = await login(
    {
      identifier:
        formData.get("identifier") ||
        formData.get("email") ||
        formData.get("username") ||
        formData.get("user") ||
        formData.get("login") ||
        "",
      password: formData.get("password") || "",
      remember: formData.get("remember") || false,
    },
    options
  );

  if (options.resetOnSuccess === true && result.authenticated) {
    try {
      formElement.reset();
    } catch {
      // noop
    }
  }

  return result;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getLoginSnapshot() {
  return {
    version: LOGIN_VERSION,
    loginInFlight: Boolean(loginPromise),
    endpoint: AUTH_ENDPOINTS.login,
    loginRoute: LOGIN_ROUTE,
    homeRoute: HOME_ROUTE,
    userHomePrefix: USER_HOME_PREFIX,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  LOGIN_VERSION,

  AUTH_ENDPOINTS,

  resolveLoginIdentifier,
  normalizeLoginPayload,
  buildLoginRequestBody,

  normalizeLoginSlug,
  extractLoginUserSlug,
  buildUserHomePath,

  buildLoginRedirectPath,
  getPostLoginTarget,

  login,
  handleLoginFormSubmit,

  getLoginSnapshot,
};
