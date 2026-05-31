/* =========================================================
   Onion Support - Auth
   Archivo: /src/features/auth/index.js

   Responsabilidad:
   - Auth mínimo de la SPA.
   - Login/logout/restore/refresh/me.
   - Sesión actual delegada en AppCore.
   - HTTP delegado en core/http.js.
   - Home visible autenticada: /@{user.slug}.
   - Restaurar sesión tras refresh del navegador usando cookie httpOnly.
   - Sin Router.
   - Sin Toast.
   - Sin Store.
   - Sin Storage.
   - Sin fetch propio.
   - Sin eventos internos.
   - Sin 2FA/MFA/OTP.
   - Sin lógica de vistas.
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

export const AUTH_VERSION = "auth.minimal.v5";

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
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
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

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = cleanText(value, "").toLowerCase();

  return VALID_ROLES.has(role) ? role : "";
}

function roleOrUser(value = "") {
  return normalizeRole(value) || "user";
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
      /(token|refresh|password|secret|authorization|jwt|cookie|sessionid|session_id|code|sig|signature)/i.test(
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
    // noop
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
    // noop
  }

  return {
    id: normalized.id || normalized.userId || null,
    userId: normalized.userId || normalized.id || null,
    username: normalized.username || null,
    slug: normalized.slug || null,
    displayName: normalized.displayName || normalized.username || "Usuario",
    role: normalized.role || "user",
    rol: normalized.role || "user",
    roles: Array.isArray(normalized.roles)
      ? normalized.roles
      : [normalized.role || "user"],
    avatarUrl: normalized.avatarUrl || "",
  };
}

function getToken() {
  const state = coreState({
    includeToken: true,
  });

  return cleanToken(
    state.token ||
      state.accessToken ||
      state.access_token ||
      Http.getAccessToken?.() ||
      ""
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

  return getUserSlugFromUser(user);
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
  return buildUserHomePath(slug);
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

  return roleOrUser(user.role || user.rol || user.roles);
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
  const required = normalizeRole(role);

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

function payloadSources(payload = {}) {
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
  for (const source of payloadSources(payload)) {
    for (const name of names) {
      const value = source?.[name];

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

function normalizeAuthPayload(payload = {}, options = {}) {
  const source = isObject(payload) ? payload : {};

  const token =
    extractToken(source) ||
    (options.allowCurrentToken === true ? getToken() : "");

  const user = normalizeUser(
    extractUser(source) ||
      (options.allowCurrentUser === true ? getCurrentUser() : null)
  );

  const session = extractSession(source);
  const role = user ? roleOrUser(user.role || user.rol || user.roles) : "";
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
    hasRefreshToken: source.hasRefreshToken === true,

    role: role || null,
    rol: role || null,
    roles: role ? [role] : [],

    userSlug: user ? getUserSlugFromUser(user) || null : null,
    homePath,
    defaultHome: homePath,
    postLoginTarget: token && user ? homePath : null,
  };
}

/* =========================================================
   STATE WRITE
========================================================= */

function writeCoreState(patch = {}) {
  try {
    if (isFunction(AppCore?.setState)) {
      AppCore.setState(patch, {
        source: "auth",
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

  if (normalized.token || normalized.user || normalized.session) {
    writeCoreState(normalized);
  }

  return getPublicAuthResult();
}

function clearSession() {
  try {
    if (isFunction(AppCore?.clearSession)) {
      AppCore.clearSession();
    } else {
      writeCoreState({
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
      });
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
      allowCurrentToken: true,
      allowCurrentUser: true,
    }
  );

  return true;
}

/* =========================================================
   RESULT / SNAPSHOT
========================================================= */

function hasRefreshToken() {
  const state = coreState();

  return Boolean(
    state.hasRefreshToken === true ||
      getCurrentSession()?.persistent === true ||
      getCurrentSession()?.restoreOnBoot === true
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

function getAuthModuleSnapshot() {
  const result = getPublicAuthResult();

  return {
    version: AUTH_VERSION,

    ...result,

    isAdmin: isAdmin(),

    routes: AUTH_ROUTES,
    home: AUTH_HOME,

    endpoints: {
      login: AUTH_ENDPOINTS.login,
      me: AUTH_ENDPOINTS.me,
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
  };
}

/* =========================================================
   RESTORE POLICY
========================================================= */

function shouldAttemptRefresh(options = {}) {
  if (options.skipRefresh === true || options.noRefresh === true) {
    return false;
  }

  if (options.forceRefresh === true || options.forceRestore === true) {
    return true;
  }

  if (
    options.restoreOnBoot === true ||
    options.persistent === true ||
    options.silent === true
  ) {
    return true;
  }

  if (cleanText(options.credentials, "").toLowerCase() === "include") {
    return true;
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
      const raw = await Http.login(
        cleanLoginCredentials(credentials),
        options
      );

      let result = applySession(raw || {}, {
        allowCurrentToken: false,
        allowCurrentUser: false,
      });

      if (!result.authenticated && hasValidToken()) {
        result = await fetchMe({
          source: "Auth.login.me",
        });
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

async function fetchMe(options = {}) {
  if (sessionState.mePromise) return sessionState.mePromise;

  sessionState.checking = true;

  sessionState.mePromise = (async () => {
    try {
      const raw = await Http.me(options);

      const result = applySession(raw || {}, {
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
      const raw = await Http.refreshSession(
        isObject(options.body) ? options.body : {},
        options
      );

      let result = applySession(raw || {}, {
        allowCurrentToken: false,
        allowCurrentUser: true,
      });

      if (!result.authenticated && hasValidToken()) {
        result = await fetchMe({
          source: "Auth.refreshSession.me",
        });
      }

      sessionState.lastError = null;
      sessionState.lastRefreshAt = Date.now();

      return result;
    } catch (error) {
      sessionState.lastError = safeError(error, "refresh");

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

      if (hasValidToken()) {
        try {
          return await fetchMe({
            ...options,
            source: "Auth.restoreSession.me",
          });
        } catch (error) {
          if (!isRefreshableAuthError(error)) {
            if (shouldClearSessionForAuthError(error)) {
              clearSession();
            }

            return getPublicAuthResult({
              ok: false,
              reason: "me-failed",
            });
          }
        }
      }

      if (!shouldAttemptRefresh(options)) {
        sessionState.lastError = null;

        return getPublicAuthResult({
          ok: false,
          skippedRefresh: true,
          reason: "refresh-not-requested",
        });
      }

      try {
        return await refreshSession({
          ...options,
          source: "Auth.restoreSession.refresh",
        });
      } catch (error) {
        sessionState.lastError = safeError(error, "restore");

        if (shouldClearSessionForAuthError(error)) {
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
    await Http.logout(options);
  } catch {
    // logout remoto best-effort
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

function validateResetPasswordToken(payload = {}) {
  const token = tokenFromPayload(payload);

  return Promise.resolve({
    ok: Boolean(token),
    valid: Boolean(token),
  });
}

async function activateAccount(payload = {}, options = {}) {
  return Http.activateAccount(payload, options);
}

async function requestPasswordReset(payload = {}, options = {}) {
  return Http.requestPasswordReset(payload, options);
}

async function confirmResetPassword(payload = {}, options = {}) {
  const raw = await Http.confirmPasswordReset(payload, options);

  const normalized = normalizeAuthPayload(raw || {}, {
    allowCurrentToken: false,
    allowCurrentUser: false,
  });

  if (normalized.authenticated) {
    return applySession(normalized, {
      allowCurrentToken: false,
      allowCurrentUser: false,
    });
  }

  return safePayload(raw);
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

  activateAccount,
  validateActivationToken,

  requestPasswordReset,
  confirmResetPassword,
  validateResetPasswordToken,

  getAuthModuleSnapshot,
  getSnapshot: getAuthModuleSnapshot,
  getDebugSnapshot: getAuthModuleSnapshot,
  snapshot: getAuthModuleSnapshot,
};

export default Auth;
