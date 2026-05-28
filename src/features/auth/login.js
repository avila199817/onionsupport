/* =========================================================
   Onion Support - Auth Login
   Archivo: src/features/auth/login.js

   Responsabilidad:
   - Login público vía CoreHttp.
   - Normalizar credenciales.
   - Validar respuesta mínima.
   - Exigir access token + user usable.
   - Refresh token visible opcional: puede ir en cookie httpOnly.
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
   - Sin opción "Recordarme".
   - Sin rutas inventadas.
   - Sin rutas legacy.
   - Sin 2FA/MFA/OTP.
========================================================= */

import * as CoreHttpModule from "../../core/http.js";

import {
  ALLOWED_ROLES,
  AUTH_ENDPOINTS,
  ROUTES,
  USER_HOME_PREFIX,
  SENSITIVE_QUERY_PARAMS,
  TOKEN_PARAM,
  buildUserHomeRoute as configBuildUserHomeRoute,
  isBlockedRoutePath as configIsBlockedRoutePath,
  isUserHomeRoute as configIsUserHomeRoute,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
} from "../../core/config.js";

import * as SessionApi from "./session.js";

export const LOGIN_VERSION = "auth.login.v12";

const LOGIN_ROUTE = ROUTES.login || "/login";
const HOME_ROUTE = "/";
const LOGIN_ENDPOINT = AUTH_ENDPOINTS.login;

const MAX_IDENTIFIER_LENGTH = 160;
const MAX_PASSWORD_LENGTH = 1024;
const MAX_TOKEN_LENGTH = 8192;

const VALID_ROLES = Object.freeze(
  (Array.isArray(ALLOWED_ROLES) && ALLOWED_ROLES.length
    ? ALLOWED_ROLES
    : ["admin", "user"]
  ).map((role) => String(role).toLowerCase())
);

const SENSITIVE_QUERY_KEYS = Object.freeze(
  (Array.isArray(SENSITIVE_QUERY_PARAMS) && SENSITIVE_QUERY_PARAMS.length
    ? SENSITIVE_QUERY_PARAMS
    : [TOKEN_PARAM]
  ).map((key) => String(key).toLowerCase())
);

const SENSITIVE_QUERY_PATTERN = buildSensitiveQueryPattern();

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
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;

    return value;
  }

  return null;
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSensitiveQueryPattern() {
  const keys = SENSITIVE_QUERY_KEYS
    .map(escapeRegExp)
    .filter(Boolean)
    .join("|");

  return keys
    ? new RegExp(`([?&#](?:${keys})=)([^&#\\s]+)`, "gi")
    : null;
}

function redact(value = "") {
  const raw = cleanText(value, "");
  const redactedQuery = SENSITIVE_QUERY_PATTERN
    ? raw.replace(SENSITIVE_QUERY_PATTERN, "$1***")
    : raw;

  return redactedQuery
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function normalizeCode(value = "") {
  return cleanText(value, "")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
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

  const role = cleanText(value, "").toLowerCase();

  return VALID_ROLES.includes(role) ? role : "";
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

function pathOnlyForBlock(path = "") {
  const raw = cleanText(path, "");

  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";

  try {
    return configNormalizeRoutePath(raw) || "";
  } catch {
    if (!raw.startsWith("/")) return "";
    if (raw.startsWith("//")) return "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "";
    if (/[\r\n\t\\]/.test(raw)) return "";

    return raw
      .split("?")[0]
      .split("#")[0]
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/g, "") || "/";
  }
}

function isBlockedSpaPath(path = "") {
  const clean = pathOnlyForBlock(path);

  if (!clean) return true;

  try {
    return configIsBlockedRoutePath(clean) === true;
  } catch {
    return true;
  }
}

function normalizeSpaPath(path = "") {
  const raw = cleanText(path, "");

  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";

  const clean = pathOnlyForBlock(raw);

  if (!clean || isBlockedSpaPath(clean)) return "";

  return clean;
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

function isUserHomePath(path = "") {
  try {
    return configIsUserHomeRoute(path) === true;
  } catch {
    return /^\/@[a-z0-9][a-z0-9._-]{0,95}$/i.test(normalizeSpaPath(path));
  }
}

export function buildUserHomePath(user = null) {
  const build = sessionMethod("buildSessionUserHomePath");

  if (isFunction(build)) {
    const path = normalizeSpaPath(build(user));

    if (isUserHomePath(path)) return path;
  }

  const slug = extractLoginUserSlug(user);

  try {
    const configured = normalizeSpaPath(configBuildUserHomeRoute(slug));

    if (isUserHomePath(configured)) return configured;
  } catch {
    // fallback abajo
  }

  return slug ? `${USER_HOME_PREFIX || "/@"}${slug}` : HOME_ROUTE;
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

function looksLikeExplicitLoginUserObject(value = null) {
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

function looksLikeStandaloneLoginUserObject(value = null) {
  return Boolean(
    looksLikeExplicitLoginUserObject(value) &&
      !hasAuthEnvelopeSignals(value)
  );
}

function looksLikeFlatLoginUserObject(value = null) {
  if (!looksLikeExplicitLoginUserObject(value)) return false;

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

    const explicitUser = looksLikeExplicitLoginUserObject(explicit)
      ? normalizeUser(explicit)
      : null;

    if (explicitUser) return explicitUser;
  }

  for (const node of nested(payload)) {
    if (
      !looksLikeStandaloneLoginUserObject(node) &&
      !looksLikeFlatLoginUserObject(node)
    ) {
      continue;
    }

    const flatUser = normalizeUser(node);

    if (flatUser) return flatUser;
  }

  return looksLikeStandaloneLoginUserObject(payload)
    ? normalizeUser(payload)
    : null;
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

  return redact(
    cleanText(
      pick(nested(payload), [
        "message",
        "error",
        "detail",
        "reason",
      ]) || "",
      ""
    )
  );
}

function readCode(payload = {}) {
  if (!isObject(payload)) return "";

  return normalizeCode(
    pick(nested(payload), [
      "code",
      "errorCode",
      "error_code",
      "reason",
    ]) || ""
  );
}

function normalizeLoginResponse(response = {}) {
  const token = readToken(response);
  const refreshToken = readRefreshToken(response);
  const user = readUser(response);
  const session = readSession(response, user);

  /*
    Login válido:
    - access token usable
    - user usable
    El refresh token visible es opcional porque puede ir en cookie httpOnly.
  */
  const authenticated = Boolean(token && user);
  const hasVisibleRefreshToken = Boolean(refreshToken);
  const persistentReady = authenticated;

  const role = authenticated ? user.role || null : null;
  const slug = authenticated ? extractLoginUserSlug(user) : "";
  const homePath = authenticated ? readBackendHomePath(response, user) : HOME_ROUTE;

  return {
    ok: authenticated,
    success: authenticated,
    authenticated,

    persistentReady,
    hasVisibleRefreshToken,
    hasRefreshToken: hasVisibleRefreshToken,
    supportsHttpOnlyRefresh: true,
    hasCookieRefreshCandidate: true,

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

function extractErrorPayload(error = null) {
  if (!error) return {};

  if (isObject(error.data)) return error.data;
  if (isObject(error.body)) return error.body;
  if (isObject(error.payload)) return error.payload;
  if (isObject(error.responseData)) return error.responseData;
  if (isObject(error.response?.data)) return error.response.data;
  if (isObject(error.response) && !isFunction(error.response.blob)) return error.response;

  return {};
}

function extractMessage(error = null) {
  const payload = extractErrorPayload(error);

  return (
    cleanText(payload.message, "") ||
    cleanText(payload.error_description, "") ||
    cleanText(payload.error, "") ||
    cleanText(payload.detail, "") ||
    cleanText(error?.message, "") ||
    String(error || "")
  );
}

function extractCode(error = null) {
  const payload = extractErrorPayload(error);

  return normalizeCode(
    error?.code ||
      payload.code ||
      payload.errorCode ||
      payload.error_code ||
      payload.error ||
      ""
  );
}

function extractStatus(error = null) {
  const payload = extractErrorPayload(error);

  return (
    Number(
      error?.status ||
        error?.statusCode ||
        error?.response?.status ||
        payload.status ||
        payload.statusCode ||
        0
    ) || 0
  );
}

function createLoginError(message = "No se pudo iniciar sesión.", options = {}) {
  const error = new Error(redact(message));

  error.name = "AuthLoginError";
  error.status = options.status || 401;
  error.statusCode = error.status;
  error.code = normalizeCode(options.code || "LOGIN_FAILED");

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
  const input = isFormData(credentials)
    ? {
        identifier:
          credentials.get("identifier") ||
          credentials.get("email") ||
          credentials.get("username") ||
          credentials.get("user") ||
          credentials.get("login") ||
          "",
      }
    : isObject(credentials)
      ? credentials
      : {};

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
  const input = isFormData(credentials)
    ? {
        identifier:
          credentials.get("identifier") ||
          credentials.get("email") ||
          credentials.get("username") ||
          credentials.get("user") ||
          credentials.get("login") ||
          "",
        password: credentials.get("password") || "",
      }
    : isObject(credentials)
      ? credentials
      : {};

  return {
    identifier: normalizeIdentifier(resolveLoginIdentifier(input)),
    password: normalizePassword(input.password ?? input.pass ?? ""),
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

    credentials: options.credentials || "include",

    retries: 0,
    storeError: false,
    cache: "no-store",
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
      const response = await requestLogin(
        buildLoginRequestBody(payload),
        options
      );

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

  const result = await login(formData, options);

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

    limits: {
      identifierMaxLength: MAX_IDENTIFIER_LENGTH,
      passwordMaxLength: MAX_PASSWORD_LENGTH,
      tokenMaxLength: MAX_TOKEN_LENGTH,
    },

    transport: {
      hasCoreHttp: Boolean(
        CoreHttp?.login ||
          CoreHttp?.post ||
          CoreHttp?.request
      ),
      ownFetch: false,
      ownApiClient: false,
      ownRouter: false,
      ownToast: false,
      ownStorage: false,
      credentialsInclude: true,
    },

    policy: {
      configDrivenEndpoint: true,

      sessionOwnsUserNormalization: true,
      sessionOwnsSessionContextNormalization: true,
      configOwnsRoles: true,
      configOwnsSensitiveQueryParams: true,
      configOwnsSlugAndHomeRoute: true,
      configOwnsBlockedRoutes: true,
      noLocalBlockedRouteFallback: true,

      requiresAccessToken: true,
      requiresVisibleRefreshToken: false,
      supportsHttpOnlyRefreshCookie: true,
      validatesUser: true,
      invalidUserOnlyDisabledOrDesactivado: true,
      returnsRefreshAndSessionContextWhenBackendProvidesThem: true,
      persistentSessionCanUseCookie: true,

      avoidsSessionEnvelopeAsUser: true,

      noRouter: true,
      noToast: true,
      noStorage: true,
      noFetchOwn: true,
      noAppCoreState: true,
      noEvents: true,
      noRememberOption: true,

      noSlugFabrication: true,
      noUserFabricationFromTokenEnvelope: true,
      noEmailIdentity: true,
      noLegacyHomeRoute: true,

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
