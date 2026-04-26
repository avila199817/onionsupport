/* =========================================================
   Onion SPA - Login Helpers
   Archivo: src/views/login/login.helpers.js

   Responsabilidades:
   - helpers puros del login
   - validación de credenciales
   - persistencia del identificador recordado
   - normalización de respuesta auth
   - sincronización idempotente de sesión con AppCore real
   - resolución segura de redirect post-login
   - evitar redirect automático por rol hacia /usuarios
   - evitar redirect automático por slug hacia /@usuario
   - compatibilidad con login por usuario o correo
   - tolerancia a 2FA
   - evitar doble emisión / doble sync innecesario
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   CONST
========================================================= */

export const LOGIN_REMEMBER_KEY = "auth:last-identifier";

const DEFAULT_HOME_PATH = "/";
const DEFAULT_2FA_PATH = "/2fa";

const AUTH_BLOCKED_REDIRECTS = new Set([
  "/login",
  "/reset-password",
  "/reset-password/confirm",
  "/forgot-password",
  "/recover-password",
  "/password-reset",
  "/activate-account",
]);

const ROLE_DEFAULT_REDIRECTS = new Set([
  "/usuarios",
  "/clientes",
  "/facturas",
  "/incidencias",
  "/servidor",
]);

/* =========================================================
   BASICS
========================================================= */

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

export function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function normalizeIdentifier(value = "") {
  return safeText(value, "");
}

export function isValidEmail(value = "") {
  const email = safeText(value, "").toLowerCase();

  if (!email) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function looksLikeEmail(value = "") {
  return safeText(value, "").includes("@");
}

export function slugify(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function getBaseOrigin() {
  if (isBrowser() && window.location?.origin) {
    return window.location.origin;
  }

  return "http://localhost";
}

function normalizePathnameOnly(pathname = "/") {
  let value = String(pathname || "/")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (value.length > 1 && value.endsWith("/")) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function splitPath(path = "/") {
  const raw = safeText(path, "/");

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || "/";
  }

  return {
    pathname: normalizePathnameOnly(pathname),
    search,
    hash,
  };
}

export function normalizePath(path = "/") {
  const raw = safeText(path, "/") || "/";

  try {
    if (typeof AppCore?.utils?.normalizePath === "function") {
      const normalized = AppCore.utils.normalizePath(raw);

      if (normalized) {
        return normalized;
      }
    }
  } catch {}

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw, getBaseOrigin());

      return normalizePath(
        `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`
      );
    }
  } catch {}

  if (raw === "/") {
    return "/";
  }

  const { pathname, search, hash } = splitPath(raw);

  return `${pathname}${search}${hash}`;
}

export function getCurrentBrowserPath() {
  if (!isBrowser()) {
    return "/";
  }

  try {
    return normalizePath(
      `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
    );
  } catch {
    return "/";
  }
}

export function isAuthPath(path = "") {
  const normalized = normalizePath(path);
  const clean = splitPath(normalized).pathname;

  if (AUTH_BLOCKED_REDIRECTS.has(clean)) {
    return true;
  }

  return (
    clean.startsWith("/login/") ||
    clean.startsWith("/reset-password/") ||
    clean.startsWith("/forgot-password/") ||
    clean.startsWith("/recover-password/") ||
    clean.startsWith("/password-reset/") ||
    clean.startsWith("/activate-account/")
  );
}

export function isSafeInternalRedirect(path = "") {
  const value = safeText(path, "").trim();

  if (!value) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (/^(javascript:|data:|vbscript:)/i.test(value)) return false;

  const normalized = normalizePath(value);

  if (isAuthPath(normalized)) {
    return false;
  }

  return true;
}

export function ensureSafeRedirect(path = "", fallback = DEFAULT_HOME_PATH) {
  const normalizedFallback = normalizePath(fallback || DEFAULT_HOME_PATH);
  const normalizedPath = normalizePath(path || "");

  if (!isSafeInternalRedirect(normalizedPath)) {
    return normalizedFallback;
  }

  return normalizedPath;
}

function getConfiguredHomePath() {
  return normalizePath(
    AppCore?.config?.routes?.home ||
      AppCore?.config?.homePath ||
      DEFAULT_HOME_PATH
  );
}

function isRoleDefaultRedirect(path = "") {
  const normalized = normalizePath(path);
  const clean = splitPath(normalized).pathname;

  if (ROLE_DEFAULT_REDIRECTS.has(clean)) {
    return true;
  }

  /*
    Evita que el login mande por defecto a /@slug.
    El home puede construir contexto público si el router lo necesita.
  */
  if (/^\/@[^/]+(?:\/)?$/i.test(clean)) {
    return true;
  }

  return false;
}

/* =========================================================
   STORAGE
========================================================= */

export function getStorage() {
  try {
    if (AppCore?.storage) {
      return AppCore.storage;
    }
  } catch {}

  return null;
}

export function getNamespacedKey(key = "") {
  const prefix = safeText(
    AppCore?.config?.storagePrefix,
    "onion"
  );

  return `${prefix}:${safeText(key, "")}`;
}

export function readStorage(key, fallback = "") {
  try {
    const storage = getStorage();

    if (typeof storage?.get === "function") {
      return safeText(storage.get(key), fallback);
    }

    if (!isBrowser()) {
      return fallback;
    }

    return safeText(
      window.localStorage.getItem(getNamespacedKey(key)),
      fallback
    );
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value = "") {
  try {
    const storage = getStorage();
    const finalValue = safeText(value, "");

    if (typeof storage?.set === "function") {
      storage.set(key, finalValue);
      return true;
    }

    if (!isBrowser()) {
      return false;
    }

    window.localStorage.setItem(
      getNamespacedKey(key),
      finalValue
    );

    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key) {
  try {
    const storage = getStorage();

    if (typeof storage?.remove === "function") {
      storage.remove(key);
      return true;
    }

    if (!isBrowser()) {
      return false;
    }

    window.localStorage.removeItem(
      getNamespacedKey(key)
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   REMEMBER IDENTIFIER
========================================================= */

export function loadRememberedIdentifier() {
  return readStorage(
    LOGIN_REMEMBER_KEY,
    ""
  );
}

/*
  Compat legacy:
  mantenemos loadRememberedEmail para no romper imports existentes,
  aunque ya trabajamos con identifier.
*/
export function loadRememberedEmail() {
  return loadRememberedIdentifier();
}

export function saveRememberedIdentifier(identifier = "") {
  return writeStorage(
    LOGIN_REMEMBER_KEY,
    normalizeIdentifier(identifier)
  );
}

export function saveRememberedEmail(email = "") {
  return saveRememberedIdentifier(email);
}

export function clearRememberedIdentifier() {
  return removeStorage(
    LOGIN_REMEMBER_KEY
  );
}

export function clearRememberedEmail() {
  return clearRememberedIdentifier();
}

/* =========================================================
   LOGIN PAYLOAD
========================================================= */

export function createLoginPayload({
  identifier = "",
  email = "",
  username = "",
  user = "",
  password = "",
  remember = false,
  redirect = "",
} = {}) {
  const normalizedIdentifier =
    normalizeIdentifier(identifier) ||
    normalizeIdentifier(email) ||
    normalizeIdentifier(username) ||
    normalizeIdentifier(user);

  const normalizedPassword = String(password || "");

  return {
    identifier: normalizedIdentifier,

    email: looksLikeEmail(normalizedIdentifier)
      ? normalizedIdentifier.toLowerCase()
      : "",

    username: !looksLikeEmail(normalizedIdentifier)
      ? normalizedIdentifier
      : "",

    user: !looksLikeEmail(normalizedIdentifier)
      ? normalizedIdentifier
      : "",

    password: normalizedPassword,
    remember: Boolean(remember),
    redirect: safeText(redirect, ""),
  };
}

/* =========================================================
   VALIDATION
========================================================= */

export function validateLoginPayload(payload = {}) {
  const identifier = normalizeIdentifier(
    payload.identifier ||
      payload.email ||
      payload.username ||
      payload.user ||
      ""
  );

  const password = String(payload.password || "");

  const errors = {};

  if (!identifier) {
    errors.identifier =
      "Introduce tu email o nombre de usuario.";
  } else if (
    looksLikeEmail(identifier) &&
    !isValidEmail(identifier)
  ) {
    errors.identifier =
      "El formato del email no es válido.";
  }

  if (!password.trim()) {
    errors.password =
      "Introduce tu contraseña.";
  } else if (password.length < 6) {
    errors.password =
      "La contraseña debe tener al menos 6 caracteres.";
  }

  return errors;
}

export function getFirstLoginError(errors = {}) {
  return (
    safeText(errors.identifier, "") ||
    safeText(errors.email, "") ||
    safeText(errors.password, "") ||
    ""
  );
}

/* =========================================================
   AUTH RESPONSE
========================================================= */

export function normalizeAuthResult(result = {}) {
  const raw = safeObject(result);

  const data = safeObject(raw.data);

  const token =
    raw.token ||
    raw.accessToken ||
    raw.authToken ||
    raw.jwt ||
    data.token ||
    data.accessToken ||
    data.authToken ||
    data.jwt ||
    "";

  const refreshToken =
    raw.refreshToken ||
    raw.refresh_token ||
    data.refreshToken ||
    data.refresh_token ||
    "";

  const sessionData =
    raw.session ||
    raw.sessionData ||
    data.session ||
    data.sessionData ||
    null;

  const user =
    raw.user ||
    raw.usuario ||
    data.user ||
    data.usuario ||
    null;

  const role =
    raw.role ||
    raw.rol ||
    user?.role ||
    user?.rol ||
    data.role ||
    data.rol ||
    "";

  const message =
    raw.message ||
    raw.mensaje ||
    data.message ||
    data.mensaje ||
    "";

  const redirectTo =
    raw.redirectTo ||
    raw.redirect ||
    data.redirectTo ||
    data.redirect ||
    "";

  const tempToken =
    raw.tempToken ||
    raw.temporaryToken ||
    data.tempToken ||
    data.temporaryToken ||
    "";

  const status =
    raw.status ||
    data.status ||
    "";

  const requires2FA = Boolean(
    raw.requires2FA ||
      raw.require2FA ||
      raw.twoFactorRequired ||
      raw.mfaRequired ||
      data.requires2FA ||
      data.require2FA ||
      data.twoFactorRequired ||
      data.mfaRequired ||
      tempToken ||
      status === "2fa_required"
  );

  const ok =
    typeof raw.ok === "boolean"
      ? raw.ok
      : typeof raw.success === "boolean"
        ? raw.success
        : typeof data.ok === "boolean"
          ? data.ok
          : typeof data.success === "boolean"
            ? data.success
            : Boolean(token || requires2FA);

  const navigationHandled = Boolean(
    raw.navigationHandled ||
      raw.navigated ||
      raw.didNavigate ||
      data.navigationHandled ||
      data.navigated ||
      data.didNavigate
  );

  return {
    raw: result,

    ok,
    success: ok,

    status: safeText(
      status,
      requires2FA ? "2fa_required" : token ? "authenticated" : ""
    ),

    token: safeText(token, ""),
    refreshToken: safeText(refreshToken, ""),
    sessionData,

    user,
    role: safeText(role, ""),

    message: safeText(message, ""),
    redirectTo: safeText(redirectTo, ""),

    tempToken: safeText(tempToken, ""),
    requires2FA,

    navigationHandled,
  };
}

export function resolveAuthErrorMessage(error) {
  const code =
    safeText(error?.data?.code, "") ||
    safeText(error?.data?.error, "") ||
    safeText(error?.response?.data?.code, "") ||
    safeText(error?.response?.data?.error, "");

  const backendMessage =
    safeText(error?.data?.message, "") ||
    safeText(error?.data?.mensaje, "") ||
    safeText(error?.response?.data?.message, "") ||
    safeText(error?.response?.data?.mensaje, "") ||
    safeText(error?.message, "") ||
    safeText(error?.statusText, "");

  if (backendMessage) {
    return backendMessage;
  }

  switch (code) {
    case "INVALID_CREDENTIALS":
      return "Credenciales incorrectas.";

    case "ACCOUNT_TEMPORARILY_LOCKED":
      return "La cuenta está bloqueada temporalmente. Inténtalo de nuevo más tarde.";

    case "ACCOUNT_DISABLED":
    case "USER_DISABLED":
      return "La cuenta no está disponible.";

    case "MISSING_CREDENTIALS":
      return "Introduce usuario/email y contraseña.";

    default:
      return "No se ha podido iniciar sesión.";
  }
}

/* =========================================================
   SESSION
========================================================= */

function getCurrentToken() {
  return (
    safeText(AppCore?.state?.token, "") ||
    safeText(AppCore?.state?.accessToken, "") ||
    safeText(AppCore?.state?.session?.token, "") ||
    safeText(AppCore?.state?.session?.accessToken, "")
  );
}

function getUserIdentity(user = {}) {
  return (
    safeText(user?.userId, "") ||
    safeText(user?.id, "") ||
    safeText(user?.email, "") ||
    safeText(user?.username, "")
  );
}

function isAlreadySyncedSession(token = "", user = null) {
  const currentToken = getCurrentToken();

  if (!token || !currentToken || token !== currentToken) {
    return false;
  }

  const currentUser =
    AppCore?.state?.user ||
    AppCore?.state?.session?.user ||
    null;

  const currentIdentity = getUserIdentity(currentUser || {});
  const nextIdentity = getUserIdentity(user || {});

  if (!nextIdentity) {
    return Boolean(AppCore?.state?.authenticated);
  }

  return (
    Boolean(AppCore?.state?.authenticated) &&
    currentIdentity === nextIdentity
  );
}

function emitSessionSynced({
  user,
  token,
  role,
  authenticated,
  source = "login.helpers",
} = {}) {
  try {
    AppCore?.events?.emit?.("app:user:change", {
      user,
      token,
      role,
      authenticated,
      source,
    });
  } catch {}
}

export function syncSession(auth = {}) {
  const normalized =
    normalizeAuthResult(auth);

  if (
    normalized.requires2FA &&
    !normalized.token
  ) {
    return {
      token: "",
      user: null,
      role: "",
      authenticated: false,
      requires2FA: true,
      tempToken: normalized.tempToken,
    };
  }

  const token = safeText(
    normalized.token,
    ""
  );

  const user = normalized.user || null;

  const role = safeText(
    normalized.role ||
      normalized.user?.role ||
      normalized.user?.rol ||
      "",
    ""
  );

  if (!token) {
    throw new Error(
      "No se recibió token de autenticación."
    );
  }

  const alreadySynced =
    isAlreadySyncedSession(token, user);

  if (!alreadySynced) {
    if (typeof AppCore?.applySession === "function") {
      AppCore.applySession({
        token,
        user,
        refreshToken: normalized.refreshToken || undefined,
        sessionData: normalized.sessionData || undefined,
      });
    } else {
      AppCore.state = AppCore.state || {};
      AppCore.state.token = token;
      AppCore.state.user = user;
      AppCore.state.role = role;
      AppCore.state.authenticated = true;
    }

    try {
      if (typeof AppCore?.setToken === "function") {
        AppCore.setToken(token);
      }
    } catch {}

    try {
      if (typeof AppCore?.setUser === "function") {
        AppCore.setUser(user);
      }
    } catch {}

    try {
      if (typeof AppCore?.setState === "function") {
        AppCore.setState({
          role,
          authenticated: true,
        });
      } else {
        AppCore.state = AppCore.state || {};
        AppCore.state.role = role;
        AppCore.state.authenticated = true;
      }
    } catch {}

    emitSessionSynced({
      user,
      token,
      role,
      authenticated: true,
      source: "login.helpers:syncSession",
    });
  }

  try {
    AppCore?.syncUserUI?.();
  } catch {}

  return {
    token,
    user,
    role,
    authenticated: true,
    alreadySynced,
  };
}

/* =========================================================
   REDIRECT
========================================================= */

export function getUrlRedirectParam() {
  if (!isBrowser()) {
    return "";
  }

  try {
    const redirect =
      new URLSearchParams(window.location.search).get("redirect");

    return safeText(redirect, "");
  } catch {
    return "";
  }
}

function resolveExplicitRedirect(options = {}) {
  return (
    safeText(options.redirectTo, "") ||
    safeText(options.successRedirect, "") ||
    safeText(options.redirect, "") ||
    ""
  );
}

function resolveResponseRedirect(auth = {}) {
  return (
    safeText(auth?.redirectTo, "") ||
    safeText(auth?.raw?.redirectTo, "") ||
    safeText(auth?.raw?.redirect, "") ||
    safeText(auth?.raw?.data?.redirectTo, "") ||
    safeText(auth?.raw?.data?.redirect, "") ||
    ""
  );
}

export function resolveLoginRedirect(
  auth = {},
  options = {}
) {
  const home = getConfiguredHomePath();

  /*
    1. Redirect explícito del caller.
  */
  const explicitRedirect =
    resolveExplicitRedirect(options);

  if (explicitRedirect) {
    return ensureSafeRedirect(explicitRedirect, home);
  }

  /*
    2. Redirect de URL: /login?redirect=/facturas
  */
  const queryRedirect =
    getUrlRedirectParam();

  if (queryRedirect) {
    return ensureSafeRedirect(queryRedirect, home);
  }

  /*
    3. 2FA.
  */
  if (auth?.requires2FA) {
    return ensureSafeRedirect(
      auth.redirectTo || DEFAULT_2FA_PATH,
      DEFAULT_2FA_PATH
    );
  }

  /*
    4. Redirect de respuesta:
       Por defecto NO aceptamos targets generados por rol/slug.
       Esto corrige el salto automático a /usuarios.
  */
  const responseRedirect =
    resolveResponseRedirect(auth);

  if (
    responseRedirect &&
    options.trustAuthRedirect === true &&
    !isRoleDefaultRedirect(responseRedirect)
  ) {
    return ensureSafeRedirect(responseRedirect, home);
  }

  /*
    5. Default real: Inicio.
  */
  return home;
}

export function shouldRedirectAfterLogin(auth = {}, options = {}) {
  if (options.redirectAfterSuccess === false) {
    return false;
  }

  if (auth?.navigationHandled === true) {
    return false;
  }

  const target =
    resolveLoginRedirect(auth, options);

  const current =
    getCurrentBrowserPath();

  if (
    normalizePath(current) === normalizePath(target)
  ) {
    return false;
  }

  return true;
}

/* =========================================================
   REMEMBER FLOW
========================================================= */

export function persistRememberedIdentifier({
  identifier = "",
  email = "",
  remember = false,
} = {}) {
  const finalIdentifier =
    normalizeIdentifier(identifier) ||
    normalizeIdentifier(email);

  if (remember) {
    saveRememberedIdentifier(finalIdentifier);
    return;
  }

  clearRememberedIdentifier();
}

/*
  Compat legacy:
  mantenemos el nombre antiguo para index.js y otros módulos
  que todavía llamen persistRememberedEmail().
*/
export function persistRememberedEmail({
  identifier = "",
  email = "",
  remember = false,
} = {}) {
  persistRememberedIdentifier({
    identifier,
    email,
    remember,
  });
}
