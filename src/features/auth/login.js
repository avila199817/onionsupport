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
   - Sin magia negra.
   - Sesión real aplicada por session.js.
   - Auth estricta: token + user usable.
========================================================= */

import { AppCore } from "../../core/index.js";
import CoreHttp from "../../core/http.js";

import {
  isBrowser,
  sanitizeUsername,
  sanitizeRedirectPath,
  isAuthRoute,
  extractMessage,
  redactTokenInText,
} from "./helpers.js";

import {
  AUTH_ENDPOINTS,
  AUTH_CONSTANTS,
} from "./constants.js";

import {
  normalizeAuthResponse,
} from "./normalize.js";

import {
  applySession,
  clearSessionLocal,
} from "./session.js";

export const LOGIN_VERSION = "simple";

const SOURCE = "auth.login";
const DEFAULT_LOGIN_PATH = "/login";
const DEFAULT_HOME_PATH = "/";

let loginPromise = null;

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

function bool(value, fallback = false) {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;

  const clean = text(value, "").toLowerCase();

  if (["true", "yes", "si", "sí", "on"].includes(clean)) return true;
  if (["false", "no", "off"].includes(clean)) return false;

  return Boolean(fallback);
}

function number(value, fallback = 0) {
  const output = Number(value);
  return Number.isFinite(output) ? output : fallback;
}

function redact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return text(value, "").replace(/([?&#]token=)([^&#\s]+)/gi, "$1***");
  }
}

function currentState() {
  return isObject(AppCore?.state) ? AppCore.state : {};
}

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
  try {
    AppCore?.setError?.(error);
  } catch {
    // noop
  }

  try {
    AppCore?.setState?.(
      error
        ? {
            error,
            lastError: error,
            hasError: true,
          }
        : {
            error: null,
            lastError: null,
            hasError: false,
          },
      {
        source: SOURCE,
        silent: true,
        emit: false,
      }
    );
  } catch {
    // noop
  }

  return true;
}

function emit(eventName = "", payload = {}, options = {}) {
  if (options.emit === false || options.silent === true) return false;

  try {
    AppCore?.events?.emit?.(eventName, {
      source: SOURCE,
      version: LOGIN_VERSION,
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
   ERRORS
========================================================= */

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

  const status = number(error?.status || error?.statusCode || error?.response?.status, 0);
  const message = extractMessage(error) || "No se pudo iniciar sesión.";

  return createLoginError(message, {
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

function maxIdentifierLength() {
  return Math.max(1, number(AUTH_CONSTANTS?.identifierMaxLength, 160));
}

function maxPasswordLength() {
  return Math.max(1, number(AUTH_CONSTANTS?.passwordMaxLength, 1024));
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
  const identifier = text(resolveLoginIdentifier(credentials), "").normalize("NFKC");
  const password = rawText(credentials.password ?? credentials.pass ?? "");

  return {
    identifier: identifier.length <= maxIdentifierLength() ? identifier : "",
    password: password.length <= maxPasswordLength() ? password : "",
    remember: bool(credentials.remember, false),
  };
}

export function buildLoginRequestBody(credentials = {}) {
  const payload = normalizeLoginPayload(credentials);
  const email = looksLikeEmail(payload.identifier) ? payload.identifier.toLowerCase() : "";
  const username = email ? "" : sanitizeUsername(payload.identifier);
  const slug = username || sanitizeUsername(payload.identifier);

  return {
    identifier: payload.identifier,
    login: payload.identifier,

    email: email || undefined,
    emailLower: email || undefined,
    email_lower: email || undefined,

    username: username || undefined,
    usernameLower: username || undefined,
    username_lower: username || undefined,

    slug: slug || undefined,

    password: payload.password,

    remember: payload.remember,
    rememberMe: payload.remember,
    remember_me: payload.remember,
  };
}

/* =========================================================
   ROUTES
========================================================= */

function safeRedirect(value = "") {
  const raw = text(value, "");

  if (!raw) return "";

  try {
    const clean = sanitizeRedirectPath(raw, "");

    if (!clean || isAuthRoute(clean)) return "";

    return clean;
  } catch {
    return "";
  }
}

function getHomeRoute() {
  const route = text(AppCore?.config?.routes?.home || AppCore?.config?.homePath || DEFAULT_HOME_PATH, DEFAULT_HOME_PATH);
  const clean = safeRedirect(route);

  return clean || DEFAULT_HOME_PATH;
}

function getLoginRoute() {
  const route = text(AppCore?.config?.routes?.login || DEFAULT_LOGIN_PATH, DEFAULT_LOGIN_PATH);
  return route.startsWith("/") ? route : DEFAULT_LOGIN_PATH;
}

function getRedirectFromUrl() {
  if (!isBrowser()) return "";

  try {
    const params = new URLSearchParams(window.location.search);
    return safeRedirect(params.get("redirect") || params.get("next") || params.get("returnTo") || "");
  } catch {
    return "";
  }
}

function getRedirectFromOptions(options = {}) {
  return safeRedirect(options.redirectTo || options.redirect || options.next || options.returnTo || "");
}

export function buildLoginRedirectPath(targetPath = "") {
  const loginPath = getLoginRoute();
  const target = safeRedirect(targetPath);

  if (!target) return loginPath;

  return `${loginPath}?redirect=${encodeURIComponent(target)}`;
}

export function getPostLoginTarget(user = null, options = {}) {
  return (
    getRedirectFromOptions(options) ||
    getRedirectFromUrl() ||
    safeRedirect(user?.homePath || user?.routing?.homePath || "") ||
    getHomeRoute()
  );
}

/* =========================================================
   REQUEST
========================================================= */

function loginEndpoint() {
  return AUTH_ENDPOINTS?.login || "/api/auth/login";
}

function loginOptions(options = {}) {
  return {
    ...options,
    auth: false,
    public: true,
    skipAuth: true,
    noAuthHeader: true,
    retries: 0,
    captureAuth: false,
    storeError: false,
  };
}

async function requestLogin(body = {}, options = {}) {
  if (isFunction(CoreHttp?.login)) {
    return CoreHttp.login(body, loginOptions(options));
  }

  return CoreHttp.post(loginEndpoint(), body, loginOptions(options));
}

/* =========================================================
   SESSION
========================================================= */

function clearBeforeLogin() {
  try {
    clearSessionLocal({
      source: SOURCE,
      silent: true,
    });
  } catch {
    // noop
  }

  return true;
}

function applyLoginSession(normalized, options = {}) {
  const result = applySession(
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
    }
  );

  return result;
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

      const normalized = normalizeAuthResponse(response, {
        mode: "login",
        requireAuthenticated: true,
      });

      if (!normalized.authenticated || !normalized.token || !normalized.user) {
        throw createLoginError(normalized.message || "El login no devolvió una sesión válida.", {
          status: 401,
          code: normalized.code || "INVALID_LOGIN_SESSION",
        });
      }

      applyLoginSession(normalized, options);

      const redirectTo = getPostLoginTarget(normalized.user, options);

      const result = {
        ok: true,
        success: true,
        authenticated: true,

        user: normalized.user,
        role: normalized.user.role || normalized.role || "user",
        roles: normalized.user.roles || normalized.roles || [normalized.user.role || "user"],

        redirectTo,

        token: normalized.token,
        accessToken: normalized.token,
        refreshToken: normalized.refreshToken || "",
      };

      emit("auth:login:success", {
        authenticated: true,
        user: normalized.user,
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
    endpoint: loginEndpoint(),

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
      no2fa: true,
      roles: ["admin", "user"],
      authenticatedRequiresTokenAndUser: true,
      publicLoginNoAuthHeader: true,
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
