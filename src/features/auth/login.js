/* =========================================================
   Onion Support - Auth Login
   Archivo: /src/features/auth/login.js

   Responsabilidad:
   - Login público vía CoreHttp.
   - Sin fetch propio.
   - Sin apiClient propio.
   - Sin Router.
   - Sin Toast.
   - Sin refresh automático.
   - Sin 2FA/MFA/OTP.
   - Sin tempToken.
   - Sin storage paralelo.
   - Sin magia negra.
   - Sesión real aplicada por session.js.
   - Auth estricta: token + user usable.
   - User inválido sólo si disabled.
========================================================= */

import { AppCore } from "../../core/index.js";
import CoreHttp from "../../core/http.js";

import {
  applySession,
  clearSessionLocal,
} from "./session.js";

export const LOGIN_VERSION = "simple";

const SOURCE = "auth.login";

const AUTH_ENDPOINTS = Object.freeze({
  login: "/api/auth/login",
});

const ROUTES = Object.freeze({
  home: "/",
  login: "/login",
  passwordRequest: "/password-request",
  passwordReset: "/password-reset",
  activateAccount: "/activate-account",
});

const MAX_IDENTIFIER_LENGTH = 160;
const MAX_PASSWORD_LENGTH = 1024;

let loginPromise = null;

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

function bool(value, fallback = false) {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;

  const clean = text(value, "").toLowerCase();

  if (["true", "yes", "si", "sí", "on"].includes(clean)) return true;
  if (["false", "no", "off"].includes(clean)) return false;

  return Boolean(fallback);
}

function nowIso() {
  return new Date().toISOString();
}

function redact(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function currentState() {
  return isObject(AppCore?.state) ? AppCore.state : {};
}

function emit(eventName = "", payload = {}, options = {}) {
  if (options.emit === false || options.silent === true) return false;

  try {
    AppCore?.events?.emit?.(eventName, {
      source: SOURCE,
      version: LOGIN_VERSION,
      at: nowIso(),
      ...payload,
      token: null,
      accessToken: null,
      refreshToken: null,
    });

    return true;
  } catch {
    return false;
  }
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
  return cleanToken(
    pick(nested(payload), [
      "token",
      "accessToken",
      "access_token",
    ])
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
      payload.code ||
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

  return {
    ok: Boolean(token && user),
    success: Boolean(token && user),
    authenticated: Boolean(token && user),

    token,
    accessToken: token,
    access_token: token,

    user,

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

function extractMessage(error = null) {
  return (
    error?.data?.message ||
    error?.response?.data?.message ||
    error?.message ||
    String(error || "")
  );
}

function createLoginError(message = "No se pudo iniciar sesión.", options = {}) {
  const error = new Error(redact(message));

  error.name = "AuthLoginError";
  error.status = options.status || 401;
  error.statusCode = error.status;
  error.code = options.code || "LOGIN_FAILED";

  return error;
}

function normalizeLoginError(error) {
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
   APP STATE
========================================================= */

function setLoginState(value = false) {
  try {
    AppCore?.setState?.(
      {
        loginInProgress: Boolean(value),
      },
      {
        source: SOURCE,
        silent: true,
        emit: false,
      }
    );
  } catch {
    try {
      currentState().loginInProgress = Boolean(value);
    } catch {
      // noop
    }
  }

  return Boolean(value);
}

function setLoginError(error = null) {
  const patch = error
    ? {
        error,
        lastError: error,
        hasError: true,
      }
    : {
        error: null,
        lastError: null,
        hasError: false,
      };

  try {
    AppCore?.setError?.(error);
  } catch {
    // noop
  }

  try {
    AppCore?.setState?.(patch, {
      source: SOURCE,
      silent: true,
      emit: false,
    });
  } catch {
    try {
      Object.assign(currentState(), patch);
    } catch {
      // noop
    }
  }

  return true;
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

function sanitizeUsername(value = "") {
  return text(value, "")
    .normalize("NFKC")
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, MAX_IDENTIFIER_LENGTH);
}

function looksLikeEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
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
    email_lower: email || undefined,

    username: username || undefined,
    usernameLower: username || undefined,
    username_lower: username || undefined,

    password: payload.password,

    remember: payload.remember,
    rememberMe: payload.remember,
    remember_me: payload.remember,
  };
}

/* =========================================================
   ROUTES
========================================================= */

function normalizePath(path = "/") {
  let value = text(path, "/");

  if (!value.startsWith("/")) return "";

  if (value.startsWith("//")) return "";

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return "";

  if (/[\r\n\t\\]/.test(value)) return "";

  value = value.replace(/\/{2,}/g, "/");

  return value || "/";
}

function canonicalPath(path = "/") {
  let value = normalizePath(path).split("?")[0].split("#")[0] || "/";

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function isPublicAuthRoute(path = "") {
  const clean = canonicalPath(path);

  return [
    ROUTES.login,
    ROUTES.passwordRequest,
    ROUTES.passwordReset,
    ROUTES.activateAccount,
  ].includes(clean);
}

function safeRedirect(value = "") {
  const raw = text(value, "");

  if (!raw) return "";

  const clean = normalizePath(raw);

  if (!clean || isPublicAuthRoute(clean)) return "";

  return clean;
}

function getHomeRoute() {
  const route = text(AppCore?.config?.routes?.home || "/", "/");
  return safeRedirect(route) || ROUTES.home;
}

function getLoginRoute() {
  const route = text(AppCore?.config?.routes?.login || ROUTES.login, ROUTES.login);
  return canonicalPath(route) === ROUTES.login ? ROUTES.login : ROUTES.login;
}

function getRedirectFromUrl() {
  if (!isBrowser()) return "";

  try {
    const params = new URLSearchParams(window.location.search);
    return safeRedirect(params.get("redirect") || "");
  } catch {
    return "";
  }
}

function getRedirectFromOptions(options = {}) {
  return safeRedirect(options.redirectTo || options.redirect || "");
}

export function buildLoginRedirectPath(targetPath = "") {
  const target = safeRedirect(targetPath);

  if (!target) return ROUTES.login;

  return `${ROUTES.login}?redirect=${encodeURIComponent(target)}`;
}

export function getPostLoginTarget(user = null, options = {}) {
  return (
    getRedirectFromOptions(options) ||
    getRedirectFromUrl() ||
    safeRedirect(user?.homePath || "") ||
    getHomeRoute()
  );
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
  if (isFunction(CoreHttp?.login)) {
    return CoreHttp.login(body, loginOptions(options));
  }

  if (isFunction(CoreHttp?.post)) {
    return CoreHttp.post(AUTH_ENDPOINTS.login, body, loginOptions(options));
  }

  throw createLoginError("Cliente HTTP no disponible.", {
    status: 500,
    code: "HTTP_CLIENT_MISSING",
  });
}

/* =========================================================
   SESSION
========================================================= */

function clearBeforeLogin() {
  try {
    clearSessionLocal({
      source: SOURCE,
      silent: true,
      emit: false,
    });
  } catch {
    // noop
  }

  return true;
}

function applyLoginSession(normalized, options = {}) {
  return applySession(
    {
      ...normalized,
      source: SOURCE,
      eventMode: "login",
    },
    {
      ...options,
      source: SOURCE,
      eventMode: "login",
      silent: options.silent !== false,
      emit: options.emit === true,
    }
  );
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
      setLoginError(null);
      setLoginState(true);
      clearBeforeLogin();

      emit("auth:login:start", {
        identifier: payload.identifier.includes("@") ? "***@***" : "***",
      }, options);

      const response = await requestLogin(buildLoginRequestBody(payload), options);
      const normalized = normalizeLoginResponse(response);

      if (!normalized.authenticated || !normalized.token || !normalized.user) {
        throw createLoginError(
          normalized.message || "El login no devolvió una sesión válida.",
          {
            status: 401,
            code: normalized.code || "INVALID_LOGIN_SESSION",
          }
        );
      }

      const snapshot = applyLoginSession(normalized, options);
      const redirectTo = getPostLoginTarget(normalized.user, options);

      const result = {
        ok: true,
        success: true,
        authenticated: true,

        user: normalized.user,
        role: normalized.role || normalized.user.role || "user",
        roles: normalized.roles?.length ? normalized.roles : [normalized.user.role || "user"],

        redirectTo,
        snapshot,
      };

      emit("auth:login:success", {
        authenticated: true,
        user: {
          id: normalized.user.id || normalized.user.userId || null,
          userId: normalized.user.userId || normalized.user.id || null,
          username: normalized.user.username || null,
          displayName: normalized.user.displayName || normalized.user.name || null,
          role: normalized.user.role || null,
        },
        role: result.role,
        redirectTo,
      }, options);

      return result;
    } catch (error) {
      const finalError = normalizeLoginError(error);

      setLoginError(finalError);

      emit("auth:login:error", {
        message: finalError.message,
        status: finalError.status || 0,
        code: finalError.code || "LOGIN_FAILED",
      }, options);

      throw finalError;
    } finally {
      setLoginState(false);
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
      remember: ["on", "true", "1"].includes(String(formData.get("remember") || "").toLowerCase()),
    },
    options
  );

  if (options.resetOnSuccess === true && result?.authenticated) {
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
  const state = currentState();

  return {
    version: LOGIN_VERSION,

    loginInFlight: Boolean(loginPromise),
    endpoint: AUTH_ENDPOINTS.login,

    authenticated: Boolean(state.authenticated),
    hasToken: Boolean(state.hasToken),
    hasUser: Boolean(state.user || state.currentUser),

    token: null,
    accessToken: null,
    refreshToken: null,

    role: state.role || null,

    loginRoute: getLoginRoute(),
    homeRoute: getHomeRoute(),

    policy: {
      ownFetch: false,
      ownRouter: false,
      ownToast: false,
      ownRefresh: false,
      ownStorage: false,
      no2fa: true,
      roles: ["admin", "user"],
      authenticatedRequiresTokenAndUser: true,
      publicLoginNoAuthHeader: true,
      noRawTokenReturn: true,
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

  buildLoginRedirectPath,
  getPostLoginTarget,

  login,
  handleLoginFormSubmit,

  getLoginSnapshot,
};
