/* =========================================================
   Onion Support - Auth Login
   Archivo: /src/features/auth/login.js

   Responsabilidad:
   - Login público vía CoreHttp.
   - Normalizar credenciales.
   - Validar respuesta mínima.
   - Exigir access token + refresh token + user usable.
   - Devolver token + user para que Auth/index.js aplique sesión.
   - Devolver refresh/session si el backend lo entrega.
   - Delegar normalización de usuario/sesión en session.js.
   - Delegar slug/home/rutas en core/config.js/session.js.
   - Exponer homePath/postLoginTarget si el user trae slug real.
   - No inventar slug.
   - No navegar.
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

import {
  AUTH_ENDPOINTS,
  ROUTES,
  USER_HOME_PREFIX,
  buildUserHomeRoute as configBuildUserHomeRoute,
  isBlockedRoutePath as configIsBlockedRoutePath,
  isUserHomeRoute as configIsUserHomeRoute,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
} from "../../core/config.js";

import * as SessionApi from "./session.js";

export const LOGIN_VERSION = "auth.login.v6";

const LOGIN_ROUTE = ROUTES.login || "/login";
const HOME_ROUTE = "/";
const LOGIN_ENDPOINT = AUTH_ENDPOINTS.login;

const MAX_IDENTIFIER_LENGTH = 160;
const MAX_PASSWORD_LENGTH = 1024;
const MAX_TOKEN_LENGTH = 8192;

const VALID_ROLES = Object.freeze(["admin", "user"]);

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

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function rawText(value = "", fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function bool(value, fallback = false) {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;

  const clean = cleanText(value, "").toLowerCase();

  if (["true", "yes", "si", "sí", "on"].includes(clean)) return true;
  if (["false", "no", "off"].includes(clean)) return false;

  return Boolean(fallback);
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;

    return value;
  }

  return null;
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
   ROLES
========================================================= */

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = String(value || "").trim().toLowerCase();

  return VALID_ROLES.includes(role) ? role : "";
}

function cleanRole(value = "") {
  return normalizeRole(value) || "user";
}

/* =========================================================
   SLUG / HOME
========================================================= */

export function normalizeLoginSlug(value = "") {
  try {
    return configNormalizeUserSlug(value) || "";
  } catch {
    const slug = cleanText(value, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^\/+/, "")
      .replace(/^@+/, "")
      .split(/[/?#]/)[0]
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .toLowerCase();

    if (!slug) return "";

    return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
  }
}

function normalizeSpaPath(path = "") {
  const raw = cleanText(path, "");

  if (!raw) return "";

  try {
    const clean = configNormalizeRoutePath(raw) || "";

    if (!clean || configIsBlockedRoutePath(clean)) return "";

    return clean;
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

export function extractLoginUserSlug(user = null) {
  if (!isObject(user)) return "";

  const extract = sessionMethod("extractSessionUserSlug");

  if (isFunction(extract)) {
    const slug = normalizeLoginSlug(extract(user));
    if (slug) return slug;
  }

  return normalizeLoginSlug(
    user.slug ||
      user.lookup?.slug ||
      user.profile?.slug ||
      user.routing?.slug ||
      ""
  );
}

export function buildUserHomePath(user = null) {
  const build = sessionMethod("buildSessionUserHomePath");

  if (isFunction(build)) {
    const path = normalizeSpaPath(build(user));

    if (isUserHomePath(path)) return path;
  }

  const slug = extractLoginUserSlug(user);

  try {
    return configBuildUserHomeRoute(slug) || HOME_ROUTE;
  } catch {
    return slug ? `${USER_HOME_PREFIX || "/@"}${slug}` : HOME_ROUTE;
  }
}

function isUserHomePath(path = "") {
  try {
    return configIsUserHomeRoute(path) === true;
  } catch {
    return /^\/@[a-z0-9][a-z0-9._-]{0,95}$/i.test(normalizeSpaPath(path));
  }
}

function extractRouting(payload = {}) {
  if (!isObject(payload)) return null;

  const routing =
    payload.routing ||
    payload.data?.routing ||
    payload.auth?.routing ||
    null;

  return isObject(routing) ? routing : null;
}

function readBackendHomePath(payload = {}, user = null) {
  const routing = extractRouting(payload);

  const candidate = normalizeSpaPath(
    first(
      payload.homePath,
      payload.canonicalPath,
      payload.publicPath,
      payload.redirectTo,

      payload.data?.homePath,
      payload.data?.canonicalPath,
      payload.data?.publicPath,
      payload.data?.redirectTo,

      payload.auth?.homePath,
      payload.auth?.canonicalPath,
      payload.auth?.publicPath,
      payload.auth?.redirectTo,

      routing?.homePath,
      routing?.canonicalPath,
      routing?.publicPath,
      routing?.profilePath,
      ""
    )
  );

  if (isUserHomePath(candidate)) return candidate;

  return buildUserHomePath(user);
}

export function getPostLoginTarget(user = null, payload = {}) {
  return readBackendHomePath(payload, user);
}

/* =========================================================
   TOKEN / USER / SESSION
========================================================= */

function stripBearer(value = "") {
  return cleanText(value, "").replace(/^Bearer\s+/i, "");
}

function tokenOk(value = "") {
  const token = stripBearer(value);

  if (!token) return false;
  if (/\s/.test(token)) return false;
  if (token.length > MAX_TOKEN_LENGTH) return false;

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
  const token = stripBearer(value);
  return tokenOk(token) ? token : "";
}

function normalizeUser(user = null) {
  if (!isObject(user)) return null;

  const normalize = sessionMethod("normalizeUser");

  if (isFunction(normalize)) {
    return normalize(user) || null;
  }

  return null;
}

function normalizeSessionContext(sessionData = null, user = null) {
  if (!isObject(sessionData)) return null;

  const normalize = sessionMethod("normalizeSessionContext");

  if (isFunction(normalize)) {
    return normalize(sessionData, user) || null;
  }

  return null;
}

function looksLikeLoginUserObject(value = null) {
  if (!isObject(value)) return false;

  if (cleanText(value.userId || value.uid || value.sub, "")) return true;
  if (cleanText(value.username || value.userName || value.user_name, "")) return true;
  if (cleanText(value.slug || value.lookup?.slug || value.profile?.slug, "")) return true;

  /*
    Evita tomar un envelope técnico como usuario por tener sólo "id".
    Si sólo existe "id", pedimos al menos otra señal de usuario.
  */
  if (
    cleanText(value.id, "") &&
    (
      cleanText(value.email, "") ||
      cleanText(value.displayName || value.fullName || value.name || value.nombre, "") ||
      normalizeRole(value.role || value.rol || value.roles)
    )
  ) {
    return true;
  }

  return false;
}

/* =========================================================
   RESPONSE READERS
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
  return cleanToken(
    pick(nested(payload), [
      "token",
      "accessToken",
      "access_token",
    ])
  );
}

function readRefreshToken(payload = {}) {
  return cleanToken(
    pick(nested(payload), [
      "refreshToken",
      "refresh_token",
    ])
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

    const explicitUser = normalizeUser(explicit);

    if (explicitUser) return explicitUser;

    if (looksLikeLoginUserObject(node)) {
      const flatUser = normalizeUser(node);

      if (flatUser) return flatUser;
    }
  }

  return looksLikeLoginUserObject(payload) ? normalizeUser(payload) : null;
}

function readSession(payload = {}, user = null) {
  const nodes = nested(payload);

  for (const node of nodes) {
    const session = normalizeSessionContext(
      node.session ||
        node.sessionData ||
        null,
      user
    );

    if (session) return session;
  }

  for (const node of nodes) {
    const hasTopLevelSessionFields = Boolean(
      node.sessionId ||
        node.session_id ||
        node.sid ||
        node.sessionUserId ||
        node.session_user_id ||
        node.expiresAt ||
        node.expires_at ||
        node.refreshExpiresAt ||
        node.refresh_expires_at
    );

    if (!hasTopLevelSessionFields) continue;

    const session = normalizeSessionContext(
      {
        sessionId: node.sessionId || node.session_id || node.sid || "",
        sessionUserId: node.sessionUserId || node.session_user_id || node.userId || node.user_id || "",
        expiresAt: node.expiresAt || node.expires_at || node.refreshExpiresAt || node.refresh_expires_at || null,
        refreshExpiresAt: node.refreshExpiresAt || node.refresh_expires_at || node.expiresAt || node.expires_at || null,
        persistent: node.persistent === true,
        restoreOnBoot: node.restoreOnBoot === true,
        rollingRefresh: node.rollingRefresh === true,
        expiryEnforced: node.expiryEnforced === true,
      },
      user
    );

    if (session) return session;
  }

  return null;
}

function readMessage(payload = {}) {
  if (!isObject(payload)) return "";

  return cleanText(
    pick(nested(payload), [
      "message",
      "error",
      "detail",
      "reason",
    ]) || "",
    ""
  );
}

function readCode(payload = {}) {
  if (!isObject(payload)) return "";

  return cleanText(
    pick(nested(payload), [
      "code",
      "errorCode",
      "error_code",
      "reason",
    ]) || "",
    ""
  );
}

function normalizeLoginResponse(response = {}) {
  const token = readToken(response);
  const refreshToken = readRefreshToken(response);
  const user = readUser(response);
  const session = readSession(response, user);

  const authenticated = Boolean(token && refreshToken && user);
  const persistentReady = Boolean(refreshToken);

  const role = authenticated ? user.role || null : null;
  const slug = authenticated ? extractLoginUserSlug(user) : "";
  const homePath = authenticated ? readBackendHomePath(response, user) : HOME_ROUTE;

  return {
    ok: authenticated,
    success: authenticated,
    authenticated,

    persistentReady,

    token,
    accessToken: token,
    access_token: token,

    refreshToken: refreshToken || null,
    refresh_token: refreshToken || null,

    user: authenticated ? user : null,
    currentUser: authenticated ? user : null,

    session: authenticated ? session : null,
    sessionData: authenticated ? session : null,

    routing: extractRouting(response),

    userSlug: slug || null,
    homePath,
    defaultHome: homePath,
    postLoginTarget: authenticated ? homePath : null,
    redirectTo: authenticated ? homePath : null,

    role,
    rol: role,
    roles: role ? [role] : [],

    message: readMessage(response),
    code: readCode(response),
  };
}

/* =========================================================
   ERRORS
========================================================= */

function redactErrorText(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function extractMessage(error = null) {
  return (
    cleanText(error?.data?.message, "") ||
    cleanText(error?.response?.data?.message, "") ||
    cleanText(error?.message, "") ||
    String(error || "")
  );
}

function extractCode(error = null) {
  return (
    error?.code ||
    error?.data?.code ||
    error?.response?.data?.code ||
    ""
  );
}

function extractStatus(error = null) {
  return (
    Number(
      error?.status ||
        error?.statusCode ||
        error?.response?.status ||
        error?.data?.status ||
        0
    ) || 0
  );
}

function createLoginError(message = "No se pudo iniciar sesión.", options = {}) {
  const error = new Error(redactErrorText(message));

  error.name = "AuthLoginError";
  error.status = options.status || 401;
  error.statusCode = error.status;
  error.code = options.code || "LOGIN_FAILED";

  return error;
}

function normalizeLoginError(error = null) {
  if (error?.name === "AuthLoginError") return error;

  const status = extractStatus(error);

  return createLoginError(
    extractMessage(error) || "No se pudo iniciar sesión.",
    {
      status: status || 500,
      code: extractCode(error) || (status === 401 ? "UNAUTHORIZED" : "LOGIN_FAILED"),
    }
  );
}

/* =========================================================
   CREDENTIALS
========================================================= */

function normalizeIdentifier(value = "") {
  return cleanText(value, "")
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
  return cleanText(value, "")
    .normalize("NFKC")
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, MAX_IDENTIFIER_LENGTH);
}

export function resolveLoginIdentifier(credentials = {}) {
  const input = isObject(credentials) ? credentials : {};

  return cleanText(
    input.identifier ??
      input.email ??
      input.username ??
      input.user ??
      input.login ??
      "",
    ""
  );
}

export function normalizeLoginPayload(credentials = {}) {
  const input = isObject(credentials) ? credentials : {};

  return {
    identifier: normalizeIdentifier(resolveLoginIdentifier(input)),
    password: normalizePassword(input.password ?? input.pass ?? ""),
    remember: bool(input.remember, false),
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
    usernameLower: username ? username.toLowerCase() : undefined,

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

  if (isFunction(CoreHttp?.login)) {
    return CoreHttp.login(body, finalOptions);
  }

  if (isFunction(CoreHttp?.post)) {
    return CoreHttp.post(LOGIN_ENDPOINT, body, finalOptions);
  }

  if (isFunction(CoreHttp?.request)) {
    return CoreHttp.request(LOGIN_ENDPOINT, {
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

      if (!result.token) {
        throw createLoginError(
          result.message || "El login no devolvió access token.",
          {
            status: 401,
            code: result.code || "LOGIN_ACCESS_TOKEN_MISSING",
          }
        );
      }

      if (!result.refreshToken) {
        throw createLoginError(
          result.message || "El login no devolvió refresh token persistente.",
          {
            status: 401,
            code: result.code || "LOGIN_REFRESH_TOKEN_MISSING",
          }
        );
      }

      if (!result.user) {
        throw createLoginError(
          result.message || "El login no devolvió un usuario válido.",
          {
            status: 401,
            code: result.code || "LOGIN_USER_MISSING",
          }
        );
      }

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
    throw createLoginError("Se esperaba un formulario HTML válido.", {
      status: 400,
      code: "INVALID_LOGIN_FORM",
    });
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

    endpoint: LOGIN_ENDPOINT,
    loginRoute: LOGIN_ROUTE,
    homeRoute: HOME_ROUTE,
    userHomePrefix: USER_HOME_PREFIX,

    policy: {
      configDrivenEndpoint: true,
      sessionOwnsUserNormalization: true,
      sessionOwnsSessionContextNormalization: true,
      configOwnsSlugAndHomeRoute: true,

      requiresAccessToken: true,
      requiresRefreshToken: true,
      validatesUser: true,
      returnsRefreshAndSessionContext: true,
      persistentSessionRequired: true,

      noRouter: true,
      noToast: true,
      noStorage: true,
      noFetchOwn: true,

      noSlugFabrication: true,
      noUserFabricationFromTokenEnvelope: true,
      noEmailIdentity: true,
      noHomeRoute: true,

      no2fa: true,
      noMfa: true,
      noOtp: true,

      snapshotRedacted: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  LOGIN_VERSION,

  resolveLoginIdentifier,
  normalizeLoginPayload,
  buildLoginRequestBody,

  normalizeLoginSlug,
  extractLoginUserSlug,
  buildUserHomePath,
  getPostLoginTarget,

  login,
  handleLoginFormSubmit,

  getLoginSnapshot,
};
