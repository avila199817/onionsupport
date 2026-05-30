/* =========================================================
   Onion Support - Auth
   Archivo: /src/features/auth/index.js

   Responsabilidad:
   - Auth mínimo de la SPA.
   - Login/logout/restore/refresh/me.
   - Sesión actual delegada en AppCore.
   - HTTP delegado en core/http.js.
   - No llamar refresh automáticamente sin access token visible.
   - Sesión persistente por cookie httpOnly sólo bajo refresh explícito
     o cuando existe token visible que necesita renovación.
   - Home visible autenticada: /@{user.slug}.
   - Guards mínimos por auth/rol/admin.
   - Sin Router, sin Toast, sin Store, sin Storage, sin fetch propio,
     sin eventos internos, sin 2FA/MFA/OTP.
========================================================= */

import { AppCore } from "../../core/index.js";
import Http from "../../core/http.js";

import {
  AUTH_ENDPOINTS,
  ROUTES,
  USER_HOME_PREFIX,
  ALLOWED_ROLES,
  buildUserHomeRoute,
  normalizeUserSlug,
} from "../../core/config.js";

export const AUTH_VERSION = "auth.minimal.v3";

const ROOT_PATH = "/";

const VALID_ROLES = new Set(
  (Array.isArray(ALLOWED_ROLES) && ALLOWED_ROLES.length
    ? ALLOWED_ROLES
    : ["admin", "user"]
  ).map((role) => String(role).toLowerCase())
);

const AUTH_ROUTES = Object.freeze({
  login: ROUTES.login || "/login",
  passwordRequest: ROUTES.passwordRequest || "/password-request",
  passwordReset: ROUTES.passwordReset || "/password-reset",
  activateAccount: ROUTES.activateAccount || "/activate-account",
});

const AUTH_HOME = Object.freeze({
  canonical: ROOT_PATH,
  userPrefix: USER_HOME_PREFIX || "/@",
});

const sessionState = {
  loggingIn: false,
  restoring: false,
  refreshing: false,
  checking: false,

  loginPromise: null,
  restorePromise: null,
  refreshPromise: null,
  mePromise: null,

  /*
    No se presupone cookie httpOnly.
    Sin access token visible no se intenta refresh automático.
  */
  hasCookieRefreshCandidate: false,

  lastLoginAt: null,
  lastRestoreAt: null,
  lastRefreshAt: null,
  lastMeAt: null,
  lastLogoutAt: null,

  lastError: null,
};

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

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function safeError(error = null, type = "auth") {
  if (!error) return null;

  return {
    type,
    name: cleanText(error.name, "Error"),
    message: redact(error.message || String(error)),
    status: error.status || error.statusCode || error.response?.status || null,
    code: error.code || error.error || null,
    canRefresh: isRefreshableAuthError(error),
    shouldClearSession: shouldClearSessionForAuthError(error),
  };
}

function stripBearer(value = "") {
  return cleanText(value, "").replace(/^Bearer\s+/i, "");
}

function tokenOk(value = "") {
  const token = stripBearer(value);

  if (!token) return false;
  if (/\s/.test(token)) return false;
  if (token.length > 8192) return false;

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

function cleanRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(cleanRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = cleanText(value, "").toLowerCase();

  return VALID_ROLES.has(role) ? role : "";
}

function defaultRole(value = "") {
  return cleanRole(value) || "user";
}

function safePayload(value, depth = 0) {
  if (depth > 5) return null;

  if (value === null || value === undefined) return value;

  if (typeof value === "string") return redact(value);
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => safePayload(item, depth + 1));
  }

  if (!isObject(value)) return null;

  const output = {};

  for (const [key, child] of Object.entries(value)) {
    if (
      /(token|refresh|password|secret|authorization|jwt|cookie|sessionid|session_id|code|sig|signature|otp|totp|mfa|twofa)/i.test(
        key
      )
    ) {
      output[key] = child ? "***" : null;
      continue;
    }

    output[key] = safePayload(child, depth + 1);
  }

  return output;
}

/* =========================================================
   CORE / HTTP
========================================================= */

function coreState(options = {}) {
  try {
    if (isFunction(AppCore?.getState)) {
      return AppCore.getState(options);
    }
  } catch {
    // fallback abajo
  }

  return isObject(AppCore?.state) ? AppCore.state : {};
}

function installHttp() {
  try {
    Http.install?.(AppCore);
  } catch {
    // noop
  }

  return Http;
}

function isRefreshableAuthError(error = null) {
  try {
    return Http.isRefreshableAuthError?.(error) === true;
  } catch {
    return false;
  }
}

function shouldClearSessionForAuthError(error = null) {
  try {
    return Http.shouldClearSessionForAuthError?.(error) === true;
  } catch {
    return false;
  }
}

function httpPublicOptions(options = {}) {
  return {
    ...options,
    auth: false,
    public: true,
    skipAuth: true,
    noAuthHeader: true,
    credentials: options.credentials || "include",
    cache: options.cache || "no-store",
  };
}

function httpPrivateOptions(options = {}) {
  return {
    ...options,
    auth: true,
    public: false,
    skipAuth: false,
    noAuthHeader: false,
    credentials: options.credentials || "include",
    cache: options.cache || "no-store",
  };
}

/* =========================================================
   USER / SESSION READ
========================================================= */

function normalizeUser(user = null) {
  if (!isObject(user)) return null;

  try {
    if (isFunction(AppCore?.normalizeUser)) {
      const normalized = AppCore.normalizeUser(user);

      if (!normalized || normalized.usable === false) return null;

      return normalized;
    }
  } catch {
    // fallback abajo
  }

  return null;
}

function publicUser(user = null) {
  const normalized = normalizeUser(user);

  if (!normalized) return null;

  try {
    if (isFunction(AppCore?.publicUser)) {
      return AppCore.publicUser(normalized);
    }
  } catch {
    // fallback abajo
  }

  return {
    id: normalized.id || normalized.userId || null,
    userId: normalized.userId || normalized.id || null,
    username: normalized.username || null,
    slug: normalized.slug || null,
    displayName: normalized.displayName || normalized.name || normalized.username || "Usuario",
    role: normalized.role || "user",
    roles: Array.isArray(normalized.roles) ? normalized.roles : [normalized.role || "user"],
    avatarUrl: normalized.avatarUrl || normalized.avatar || normalized.picture || normalized.photoUrl || null,
    hasAvatar: Boolean(normalized.hasAvatar || normalized.avatarUrl || normalized.avatar),
  };
}

function getToken() {
  const state = coreState({
    includeToken: true,
  });

  return (
    cleanToken(state.token || state.accessToken || state.access_token || "") ||
    cleanToken(Http.getAccessToken?.() || "")
  );
}

function getAccessToken() {
  return getToken();
}

function hasValidToken() {
  return Boolean(getToken());
}

function getRefreshToken() {
  return "";
}

function getCurrentUser() {
  const state = coreState();

  return normalizeUser(
    state.user ||
      state.currentUser ||
      state.sessionUser ||
      state.authUser ||
      state.session?.user ||
      null
  );
}

function getUser() {
  return getCurrentUser();
}

function getProfile() {
  return getCurrentUser();
}

function getCurrentSession() {
  const state = coreState();

  return state.session || state.sessionData || null;
}

function getSession() {
  return getCurrentSession();
}

function getUserSlugFromUser(user = null) {
  if (!isObject(user)) return "";

  return normalizeUserSlug(
    user.slug ||
      user.lookup?.slug ||
      user.profile?.slug ||
      user.routing?.slug ||
      user.username ||
      user.userId ||
      user.id ||
      ""
  );
}

function getUserSlug() {
  const user = getCurrentUser();

  return (
    user?.slug ||
    normalizeUserSlug(
      user?.lookup?.slug ||
        user?.profile?.slug ||
        user?.username ||
        user?.userId ||
        user?.id ||
        ""
    )
  );
}

function buildUserHomePath(user = getCurrentUser()) {
  const slug = isObject(user)
    ? getUserSlugFromUser(user)
    : normalizeUserSlug(user);

  try {
    return buildUserHomeRoute(slug) || ROOT_PATH;
  } catch {
    return slug ? `${AUTH_HOME.userPrefix}${slug}` : ROOT_PATH;
  }
}

function buildUserHomePathFromSlug(slug = "") {
  const clean = normalizeUserSlug(slug);

  try {
    return buildUserHomeRoute(clean) || ROOT_PATH;
  } catch {
    return clean ? `${AUTH_HOME.userPrefix}${clean}` : ROOT_PATH;
  }
}

function getDefaultHome() {
  return buildUserHomePath(getCurrentUser());
}

function getPostLoginTarget() {
  return getDefaultHome();
}

function getRole() {
  const user = getCurrentUser();

  if (!user) return "";

  return defaultRole(user.role || user.rol || user.roles);
}

function getRoles() {
  if (!isAuthenticated()) return [];

  const role = getRole();

  return role === "admin" ? ["admin"] : ["user"];
}

function isAuthenticated() {
  return Boolean(getToken() && getCurrentUser());
}

function isAdmin() {
  return isAuthenticated() && getRole() === "admin";
}

function hasRole(role = "") {
  const required = cleanRole(role);

  if (!required || !isAuthenticated()) return false;
  if (isAdmin()) return true;

  return getRoles().includes(required);
}

function requireRole(role = "") {
  if (hasRole(role)) return true;

  const error = new Error("No tienes permisos para acceder a este recurso.");
  error.code = "AUTH_FORBIDDEN";
  error.status = 403;

  throw error;
}

function getPermissions() {
  const user = getCurrentUser();
  const permissions = user?.permissions || user?.permisos;

  return Array.isArray(permissions) ? permissions : [];
}

function getAuthHeader() {
  const token = getToken();

  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

/* =========================================================
   PAYLOAD
========================================================= */

function nestedPayloads(payload = {}) {
  if (!isObject(payload)) return [];

  return [
    payload,
    isObject(payload.data) ? payload.data : null,
    isObject(payload.payload) ? payload.payload : null,
    isObject(payload.result) ? payload.result : null,
    isObject(payload.auth) ? payload.auth : null,
    isObject(payload.session) ? payload.session : null,
    isObject(payload.sessionData) ? payload.sessionData : null,
  ].filter(Boolean);
}

function looksLikeUser(value = null) {
  if (!isObject(value)) return false;

  return Boolean(
    value.id ||
      value.userId ||
      value.uid ||
      value.sub ||
      value.username ||
      value.slug ||
      value.lookup?.slug ||
      value.profile?.slug ||
      value.role ||
      value.rol ||
      Array.isArray(value.roles)
  );
}

function pick(payload = {}, names = []) {
  for (const node of nestedPayloads(payload)) {
    for (const name of names) {
      const value = node?.[name];

      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  }

  return null;
}

function extractToken(payload = {}) {
  return cleanToken(
    pick(payload, [
      "token",
      "accessToken",
      "access_token",
    ]) || ""
  );
}

function extractUser(payload = {}) {
  if (looksLikeUser(payload)) return payload;

  const user = pick(payload, [
    "user",
    "currentUser",
    "usuario",
    "me",
    "account",
    "profile",
  ]);

  return looksLikeUser(user) ? user : null;
}

function extractSession(payload = {}) {
  const session = pick(payload, [
    "session",
    "sessionData",
    "currentSession",
  ]);

  return isObject(session) ? session : null;
}

function hasRefreshCandidate(payload = {}) {
  return Boolean(
    pick(payload, [
      "hasRefreshToken",
      "refreshAvailable",
      "canRefresh",
      "persistent",
      "restoreOnBoot",
    ]) ||
      sessionState.hasCookieRefreshCandidate === true
  );
}

function normalizeAuthPayload(payload = {}, options = {}) {
  const source = isObject(payload) ? payload : {};

  const token =
    extractToken(source) ||
    (options.allowCurrentToken === true ? getToken() : "");

  const user = normalizeUser(
    extractUser(source) ||
      (options.allowCurrentUser !== false ? getCurrentUser() : null)
  );

  const session = extractSession(source);
  const role = user ? defaultRole(user.role || user.rol || user.roles) : "";
  const userSlug = user ? getUserSlugFromUser(user) : "";
  const homePath = user ? buildUserHomePath(user) : ROOT_PATH;

  return {
    token,
    accessToken: token,
    access_token: token,

    user,
    currentUser: user,

    session,
    sessionData: session,

    authenticated: Boolean(token && user),
    hasToken: Boolean(token),
    hasUser: Boolean(user),
    hasSession: Boolean(session),
    hasRefreshToken: hasRefreshCandidate(source),

    role: role || null,
    rol: role || null,
    roles: role ? [role] : [],

    userSlug: userSlug || null,
    homePath,
    defaultHome: homePath,
    postLoginTarget: token && user ? homePath : null,
  };
}

/* =========================================================
   STATE WRITE
========================================================= */

function writeCoreState(patch = {}, source = "Auth.writeState") {
  try {
    if (isFunction(AppCore?.setState)) {
      AppCore.setState(patch, {
        source,
        silent: true,
        emit: false,
      });

      return true;
    }
  } catch {
    // fallback abajo
  }

  try {
    Object.assign(AppCore.state || {}, patch);
    return true;
  } catch {
    return false;
  }
}

function applySession(payload = {}, options = {}) {
  const normalized = normalizeAuthPayload(payload, options);

  /*
    No llamamos Http.setAccessToken() aquí.
    El cliente HTTP lee el token desde AppCore.getState({ includeToken: true }).
    Así evitamos bucles Core <-> HTTP.
  */
  if (normalized.token || normalized.user || normalized.session) {
    writeCoreState(normalized, options.source || "Auth.applySession");
  }

  return getPublicAuthResult({
    ...normalized,
    useState: true,
  });
}

function clearSession() {
  sessionState.hasCookieRefreshCandidate = false;

  try {
    if (isFunction(AppCore?.clearSession)) {
      AppCore.clearSession({
        source: "Auth.clearSession",
      });
    } else {
      writeCoreState(
        {
          token: null,
          accessToken: null,
          access_token: null,

          user: null,
          currentUser: null,
          session: null,
          sessionData: null,

          authenticated: false,
          hasToken: false,
          hasUser: false,
          hasSession: false,
          hasRefreshToken: false,

          role: null,
          rol: null,
          roles: [],

          userSlug: null,
          homePath: ROOT_PATH,
          defaultHome: ROOT_PATH,
          postLoginTarget: null,
        },
        "Auth.clearSession"
      );
    }
  } catch {
    // noop
  }

  try {
    Http.clearAuthTokens?.();
  } catch {
    // noop
  }

  return true;
}

function syncAuthState() {
  const token = getToken();
  const user = getCurrentUser();

  if (!token || !user) return false;

  applySession(
    {
      token,
      user,
      session: getCurrentSession(),
      hasRefreshToken: hasRefreshToken(),
    },
    {
      source: "Auth.syncAuthState",
      allowCurrentToken: true,
      allowCurrentUser: true,
    }
  );

  return true;
}

/* =========================================================
   PUBLIC RESULT / SNAPSHOT
========================================================= */

function hasRefreshToken() {
  return Boolean(
    coreState().hasRefreshToken === true ||
      getCurrentSession()?.persistent === true ||
      getCurrentSession()?.restoreOnBoot === true ||
      sessionState.hasCookieRefreshCandidate === true
  );
}

function getPublicAuthResult(payload = {}) {
  const authenticated = isAuthenticated();
  const user = getCurrentUser();
  const homePath = user ? buildUserHomePath(user) : ROOT_PATH;
  const role = authenticated ? getRole() : "";

  return {
    ok: payload.ok !== false,
    authenticated,

    skippedRefresh: payload.skippedRefresh === true,
    reason: payload.reason || null,

    user: authenticated ? publicUser(user) : null,
    currentUser: authenticated ? publicUser(user) : null,

    session: authenticated ? getCurrentSession() : null,
    sessionData: authenticated ? getCurrentSession() : null,

    hasToken: hasValidToken(),
    hasUser: Boolean(user),
    hasSession: Boolean(getCurrentSession()),
    hasRefreshToken: hasRefreshToken(),
    supportsHttpOnlyRefresh: true,
    hasCookieRefreshCandidate: sessionState.hasCookieRefreshCandidate === true,

    userSlug: user ? getUserSlug() || null : null,
    homePath,
    defaultHome: homePath,
    postLoginTarget: authenticated ? homePath : null,

    role: role || null,
    roles: role ? getRoles() : [],

    token: null,
    accessToken: null,
    access_token: null,
    refreshToken: null,
    refresh_token: null,
  };
}

function buildSessionSnapshot() {
  return getPublicAuthResult();
}

function getSessionDebugSnapshot() {
  return getPublicAuthResult();
}

function getAuthModuleSnapshot() {
  const result = getPublicAuthResult();

  return {
    version: AUTH_VERSION,

    ...result,

    isAdmin: isAdmin(),

    routes: AUTH_ROUTES,
    home: AUTH_HOME,

    endpoints: {
      me: AUTH_ENDPOINTS.me,
      login: AUTH_ENDPOINTS.login,
      refresh: AUTH_ENDPOINTS.refresh,
      logout: AUTH_ENDPOINTS.logout,
    },

    session: {
      loggingIn: sessionState.loggingIn,
      restoring: sessionState.restoring,
      refreshing: sessionState.refreshing,
      checking: sessionState.checking,

      lastLoginAt: sessionState.lastLoginAt,
      lastRestoreAt: sessionState.lastRestoreAt,
      lastRefreshAt: sessionState.lastRefreshAt,
      lastMeAt: sessionState.lastMeAt,
      lastLogoutAt: sessionState.lastLogoutAt,

      lastError: sessionState.lastError,
    },

    policy: {
      minimal: true,
      strictAuth: true,
      requiresTokenAndUser: true,

      noAutomaticRefreshWithoutVisibleToken: true,
      persistentSessionRefreshRequiresTokenOrForce: true,

      noStorage: true,
      noStore: true,
      noRouter: true,
      noToast: true,
      noFetchOwn: true,
      noMfaOtp: true,
      snapshotRedacted: true,
    },
  };
}

/* =========================================================
   RESTORE POLICY
========================================================= */

function shouldAttemptCookieRefresh(options = {}) {
  /*
    Política final:
    - Sin access token visible: no refresh automático.
    - Evita 401 en boot cuando no hay sesión.
    - Router decidirá si una ruta privada manda a /login.
    - Sólo se fuerza refresh con forceRefresh/forceRestore.
  */
  if (options.forceRefresh === true || options.forceRestore === true) {
    return true;
  }

  if (options.allowCookieRefresh === false) {
    return false;
  }

  return hasValidToken();
}

/* =========================================================
   FLOWS
========================================================= */

function cleanLoginCredentials(credentials = {}) {
  const output = isObject(credentials) ? { ...credentials } : {};

  delete output.remember;
  delete output.rememberMe;
  delete output.remember_me;
  delete output.persist;
  delete output.persistent;

  return output;
}

async function login(credentials = {}, options = {}) {
  if (sessionState.loginPromise) return sessionState.loginPromise;

  sessionState.loggingIn = true;

  sessionState.loginPromise = (async () => {
    try {
      const raw = await Http.post(
        AUTH_ENDPOINTS.login,
        cleanLoginCredentials(credentials),
        httpPublicOptions(options)
      );

      let result = applySession(raw || {}, {
        source: "Auth.login",
        allowCurrentToken: false,
        allowCurrentUser: false,
      });

      if (!result.authenticated && hasValidToken()) {
        result = await fetchMe({
          source: "Auth.login.me",
        });
      }

      if (result.authenticated) {
        sessionState.hasCookieRefreshCandidate = true;
      }

      sessionState.lastError = null;
      sessionState.lastLoginAt = Date.now();

      return getPublicAuthResult({
        ok: result.ok !== false,
      });
    } catch (error) {
      sessionState.lastError = safeError(error, "login");
      throw error;
    } finally {
      sessionState.loggingIn = false;
      sessionState.loginPromise = null;
    }
  })();

  return sessionState.loginPromise;
}

async function handleLoginFormSubmit(form, options = {}) {
  const FormCtor = globalThis?.HTMLFormElement;

  if (!FormCtor || !(form instanceof FormCtor)) {
    throw new Error("Formulario de login inválido.");
  }

  options.event?.preventDefault?.();

  const data = new FormData(form);

  return login(
    {
      identifier: data.get("identifier") || data.get("email") || data.get("username") || "",
      email: data.get("email") || "",
      username: data.get("username") || "",
      password: data.get("password") || "",
    },
    options
  );
}

async function fetchMe(options = {}) {
  if (sessionState.mePromise) return sessionState.mePromise;

  sessionState.checking = true;

  sessionState.mePromise = (async () => {
    try {
      const raw = await Http.get(
        AUTH_ENDPOINTS.me,
        httpPrivateOptions(options)
      );

      const result = applySession(raw || {}, {
        source: options.source || "Auth.me",
        allowCurrentToken: true,
        allowCurrentUser: false,
      });

      sessionState.lastError = null;
      sessionState.lastMeAt = Date.now();

      return result;
    } catch (error) {
      sessionState.lastError = safeError(error, "me");

      if (shouldClearSessionForAuthError(error)) {
        clearSession();
      }

      throw error;
    } finally {
      sessionState.checking = false;
      sessionState.mePromise = null;
    }
  })();

  return sessionState.mePromise;
}

async function refreshSession(options = {}) {
  if (sessionState.refreshPromise) return sessionState.refreshPromise;

  sessionState.refreshing = true;

  sessionState.refreshPromise = (async () => {
    try {
      const raw = await Http.post(
        AUTH_ENDPOINTS.refresh,
        isObject(options.body) ? options.body : {},
        httpPublicOptions(options)
      );

      let result = applySession(raw || {}, {
        source: "Auth.refreshSession",
        allowCurrentToken: false,
        allowCurrentUser: true,
      });

      if (!result.authenticated && hasValidToken()) {
        result = await fetchMe({
          source: "Auth.refreshSession.me",
        });
      }

      if (result.authenticated || hasValidToken()) {
        sessionState.hasCookieRefreshCandidate = true;
      }

      sessionState.lastError = null;
      sessionState.lastRefreshAt = Date.now();

      return result;
    } catch (error) {
      sessionState.lastError = safeError(error, "refresh");

      if (shouldClearSessionForAuthError(error) || !hasValidToken()) {
        sessionState.hasCookieRefreshCandidate = false;
      }

      if (shouldClearSessionForAuthError(error)) {
        clearSession();
      }

      throw error;
    } finally {
      sessionState.refreshing = false;
      sessionState.refreshPromise = null;
    }
  })();

  return sessionState.refreshPromise;
}

async function restoreSession(options = {}) {
  if (sessionState.restorePromise) return sessionState.restorePromise;

  sessionState.restoring = true;

  sessionState.restorePromise = (async () => {
    try {
      if (isAuthenticated()) {
        return getPublicAuthResult();
      }

      /*
        Caso 1:
        Hay access token visible. Validamos con /me.
      */
      if (hasValidToken()) {
        try {
          return await fetchMe({
            ...options,
            source: "Auth.restoreSession.me",
          });
        } catch (error) {
          if (!isRefreshableAuthError(error) && shouldClearSessionForAuthError(error)) {
            clearSession();

            return getPublicAuthResult({
              ok: false,
              reason: "me-terminal-auth-error",
            });
          }

          /*
            Si es refreshable, podrá pasar al refresh.
          */
        }
      }

      /*
        Caso 2:
        Sin token visible => no refresh automático.
        Evita POST /api/auth/refresh 401 en boot sin sesión.
      */
      if (!shouldAttemptCookieRefresh(options)) {
        sessionState.hasCookieRefreshCandidate = false;
        sessionState.lastError = null;

        return getPublicAuthResult({
          ok: false,
          skippedRefresh: true,
          reason: "no-token-no-refresh",
        });
      }

      /*
        Caso 3:
        Sólo se intenta refresh si hay token visible o se fuerza explícitamente.
      */
      sessionState.hasCookieRefreshCandidate = true;

      try {
        return await refreshSession({
          ...options,
          source: "Auth.restoreSession.refresh",
          credentials: options.credentials || "include",
        });
      } catch (error) {
        sessionState.lastError = safeError(error, "restore");

        if (shouldClearSessionForAuthError(error) || !hasValidToken()) {
          clearSession();
        }

        return getPublicAuthResult({
          ok: false,
          reason: "refresh-failed",
        });
      }
    } finally {
      sessionState.restoring = false;
      sessionState.restorePromise = null;
      sessionState.lastRestoreAt = Date.now();
    }
  })();

  return sessionState.restorePromise;
}

async function logout(options = {}) {
  try {
    await Http.post(
      AUTH_ENDPOINTS.logout,
      {},
      httpPrivateOptions(options)
    );
  } catch {
    /*
      Logout remoto best-effort.
      La limpieza local siempre se ejecuta.
    */
  }

  clearSession();

  sessionState.lastLogoutAt = Date.now();

  return true;
}

/* =========================================================
   PUBLIC FLOWS
========================================================= */

function tokenFromPayload(payload = {}) {
  if (typeof payload === "string") return cleanText(payload, "");

  if (!isObject(payload)) return "";

  return cleanText(
    payload.token ||
      payload.resetToken ||
      payload.activationToken ||
      payload.activation_token ||
      payload.reset_token ||
      "",
    ""
  );
}

function validateActivationToken(payload = {}) {
  const token = tokenFromPayload(payload);

  return Promise.resolve({
    ok: Boolean(token),
    valid: Boolean(token),
  });
}

async function activateAccount(payload = {}, options = {}) {
  return Http.post(
    AUTH_ENDPOINTS.activateAccount,
    payload,
    httpPublicOptions(options)
  );
}

function validateResetPasswordToken(payload = {}) {
  const token = tokenFromPayload(payload);

  return Promise.resolve({
    ok: Boolean(token),
    valid: Boolean(token),
  });
}

async function requestPasswordReset(payload = {}, options = {}) {
  return Http.post(
    AUTH_ENDPOINTS.requestPasswordReset,
    payload,
    httpPublicOptions(options)
  );
}

async function confirmResetPassword(payload = {}, options = {}) {
  const raw = await Http.post(
    AUTH_ENDPOINTS.confirmPasswordReset,
    payload,
    httpPublicOptions(options)
  );

  const normalized = normalizeAuthPayload(raw || {}, {
    allowCurrentToken: false,
    allowCurrentUser: false,
  });

  if (normalized.authenticated) {
    return applySession(normalized, {
      source: "Auth.confirmResetPassword",
      allowCurrentToken: false,
      allowCurrentUser: false,
    });
  }

  return safePayload(raw);
}

function authApiRequest(method = "GET", path = "", body = undefined, options = {}) {
  return Http.request(path, {
    ...options,
    method,
    ...(body !== undefined ? { body } : {}),
  });
}

/* =========================================================
   GUARDS
========================================================= */

function guardAuthenticated() {
  return isAuthenticated();
}

function guardGuest() {
  return !isAuthenticated();
}

function guardRole(roleOrRoles = []) {
  const roles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];

  if (!roles.length) return isAuthenticated();

  return roles.some((role) => hasRole(role));
}

function guardAdmin() {
  return isAdmin();
}

function canAccessRoute(route = {}) {
  if (route.public === true || route.guestOnly === true) {
    return true;
  }

  if (route.adminOnly === true || route.requiresAdmin === true) {
    return isAdmin();
  }

  if (Array.isArray(route.roles) && route.roles.length) {
    return guardRole(route.roles);
  }

  return isAuthenticated();
}

function buildGuardErrorPayload(error = null) {
  return {
    name: error?.name || "Error",
    message: redact(error?.message || String(error || "Error")),
    status: error?.status || error?.statusCode || 0,
    code: error?.code || null,
  };
}

function getAuthGuardsSnapshot() {
  return {
    authenticated: isAuthenticated(),
    role: getRole() || null,
    roles: getRoles(),
    userSlug: getUserSlug() || null,
    homePath: getDefaultHome(),
    isAdmin: isAdmin(),
  };
}

/* =========================================================
   INIT
========================================================= */

function init() {
  installHttp();

  try {
    AppCore.Auth = Auth;
    AppCore.auth = Auth;

    AppCore.registerModule?.("auth", Auth, {
      overwrite: true,
    });

    AppCore.modules?.register?.("auth", Auth, {
      overwrite: true,
    });
  } catch {
    // noop
  }

  return Auth;
}

/* =========================================================
   API
========================================================= */

export const Auth = {
  version: AUTH_VERSION,

  AUTH_ENDPOINTS,
  AUTH_ROUTES,
  AUTH_HOME,

  session: sessionState,

  init,

  login,
  logout,
  handleLoginFormSubmit,

  restoreSession,
  refreshSession,

  fetchMe,
  me: fetchMe,

  getUser,
  getCurrentUser,
  getProfile,

  getSession,
  getCurrentSession,

  getToken,
  getAccessToken,
  getRefreshToken,
  hasValidToken,

  isAuthenticated,

  getRole,
  getRoles,
  getCurrentRole: getRole,
  getCurrentRoles: getRoles,
  getPermissions,

  isAdmin,
  isCurrentUserAdmin: isAdmin,

  hasRole,
  requireRole,

  normalizeUser,
  normalizeAuthPayload,

  getUserSlug,
  buildUserHomePath,
  buildUserHomePathFromSlug,
  getDefaultHome,
  getPostLoginTarget,

  applySession,
  clearSession,
  syncAuthState,

  getAuthHeader,

  buildSessionSnapshot,
  getSessionDebugSnapshot,

  guardAuthenticated,
  guardGuest,
  guardRole,
  guardAdmin,

  requireAuth: guardAuthenticated,
  ensureAuthenticated: guardAuthenticated,
  requireGuest: guardGuest,
  requireAdmin: guardAdmin,

  canAccessRoute,
  buildGuardErrorPayload,
  getAuthGuardsSnapshot,

  activateAccount,
  validateActivationToken,

  requestPasswordReset,
  confirmResetPassword,
  validateResetPasswordToken,

  authApiRequest,

  getAuthModuleSnapshot,
  getSnapshot: getAuthModuleSnapshot,
  getDebugSnapshot: getAuthModuleSnapshot,
  snapshot: getAuthModuleSnapshot,
};

export default Auth;
