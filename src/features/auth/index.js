/* =========================================================
   Onion Support - Auth
   Archivo: /src/features/auth/index.js

   Auth mínimo de la SPA:
   - login/logout/restore/refresh/me;
   - sesión canónica delegada en AppCore;
   - selectores hot-path de una sola lectura Core;
   - fallbacks lazy, sin lecturas HTTP/Core redundantes;
   - refresh token sólo HttpOnly;
   - single-flight + generation/abort guards;
   - sin Router, Toast, Store, Storage ni fetch propio.
========================================================= */

import { AppCore } from "../../core/index.js";
import Http from "../../core/http.js";
import {
  AUTH_ENDPOINTS,
  ROUTES,
  USER_HOME_PREFIX,
  buildUserHomeRoute,
  normalizeUserSlug,
} from "../../core/config.js";

export const AUTH_VERSION = "auth.minimal.v10-logout-fail-closed";
const ROOT_PATH = "/";
const LEGACY_RESET_TOKEN_PATH = /(\/(?:reset-password|password-reset)\/confirm\/)([^/?#\s]+)/gi;
const AUTH_ROUTES = Object.freeze({
  login: ROUTES.login || "/login",
  passwordRequest: ROUTES.passwordRequest || "/password-request",
  passwordReset: ROUTES.passwordReset || "/password-reset",
  activateAccount: ROUTES.activateAccount || "/activate-account",
});
const AUTH_HOME = Object.freeze({ canonical: ROOT_PATH, userPrefix: USER_HOME_PREFIX || "/@" });

const sessionState = {
  loggingIn: false, loggingOut: false, restoring: false, refreshing: false, checking: false,
  loginPromise: null, logoutPromise: null, restorePromise: null, refreshPromise: null, mePromise: null,
  generation: 0, activeFlows: 0,
  lastLoginAt: null, lastRestoreAt: null, lastRefreshAt: null, lastMeAt: null, lastLogoutAt: null,
  lastError: null,
};
const activeFlowControllers = new Set();
const selectorMetrics = { coreReads: 0, httpTokenFallbacks: 0, contexts: 0 };

function isObject(value) { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function isFunction(value) { return typeof value === "function"; }
function cleanText(value = "", fallback = "") {
  const output = String(value ?? "").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
  return output || fallback;
}
function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }
  return null;
}
function redact(value = "") {
  return cleanText(value, "")
    .replace(LEGACY_RESET_TOKEN_PATH, "$1***")
    .replace(/([?&#](?:access_token|accessToken|refresh_token|refreshToken|id_token|idToken|token|code|secret|session|sessionId|session_id|password|pwd|key|sig|signature|jwt|authorization|reset_token|resetToken|activation_token|activationToken)=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}
function safeError(error = null, type = "auth") {
  if (!error) return null;
  return {
    type,
    name: cleanText(error?.name, "Error"),
    message: redact(error?.message || String(error)),
    status: error?.status || error?.statusCode || error?.response?.status || null,
    code: cleanText(error?.code || error?.error || "", "") || null,
    canRefresh: isRefreshableAuthError(error),
    shouldClearSession: shouldClearSessionForAuthError(error),
  };
}
function safePayload(value, depth = 0) {
  if (depth > 5) return null;
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redact(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (["function", "symbol", "bigint"].includes(typeof value)) return undefined;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safePayload(item, depth + 1));
  if (!isObject(value)) return null;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (/(token|refresh|password|secret|authorization|jwt|cookie|sessionid|session_id|code|sig|signature)/i.test(key)) {
      output[key] = child ? "***" : null;
      continue;
    }
    const clean = safePayload(child, depth + 1);
    if (clean !== undefined) output[key] = clean;
  }
  return output;
}

function currentGeneration() { return Number(sessionState.generation || 0); }
function invalidateFlows() { sessionState.generation = currentGeneration() + 1; return sessionState.generation; }
function flowIsCurrent(generation) { return generation === currentGeneration(); }
function syncActiveFlowCount() { sessionState.activeFlows = activeFlowControllers.size; }
function createFlowAbort(externalSignal = null) {
  if (typeof AbortController === "undefined") return { signal: externalSignal || undefined, cleanup: () => {}, abort: () => false };
  const controller = new AbortController();
  let externalListener = null;
  const abort = (reason = undefined) => {
    if (controller.signal.aborted) return false;
    try { controller.abort(reason); } catch { try { controller.abort(); } catch { return false; } }
    return true;
  };
  if (externalSignal) {
    if (externalSignal.aborted) abort(externalSignal.reason);
    else if (isFunction(externalSignal.addEventListener)) {
      externalListener = () => abort(externalSignal.reason);
      externalSignal.addEventListener("abort", externalListener, { once: true });
    }
  }
  activeFlowControllers.add(controller);
  syncActiveFlowCount();
  const cleanup = () => {
    activeFlowControllers.delete(controller);
    syncActiveFlowCount();
    if (externalSignal && externalListener && isFunction(externalSignal.removeEventListener)) {
      try { externalSignal.removeEventListener("abort", externalListener); } catch {}
    }
    externalListener = null;
  };
  return { signal: controller.signal, cleanup, abort };
}
function abortActiveFlows() {
  for (const controller of [...activeFlowControllers]) {
    try { if (!controller.signal.aborted) controller.abort("auth-session-invalidated"); }
    catch { try { controller.abort(); } catch {} }
  }
  return true;
}
function withFlowSignal(options = {}, signal = undefined) { return { ...options, signal }; }

function runtimeStatePort() {
  const port = AppCore?.runtimeState;
  return isObject(port) && isFunction(port.read) && isFunction(port.write) ? port : null;
}
function coreState() {
  selectorMetrics.coreReads += 1;
  try {
    const port = runtimeStatePort();
    if (port) return port.read();
    if (isFunction(AppCore?.getRuntimeState)) return AppCore.getRuntimeState();
    if (isFunction(AppCore?.getState)) return AppCore.getState({ raw: true, includeToken: true });
  } catch {}
  return isObject(AppCore?.state) ? AppCore.state : {};
}
function writeCoreState(patch = {}) {
  if (!isObject(patch)) return false;
  try {
    const port = runtimeStatePort();
    if (port) { port.write(patch); return true; }
    if (isFunction(AppCore?.setRuntimeState)) { AppCore.setRuntimeState(patch); return true; }
    if (isFunction(AppCore?.setState)) { AppCore.setState(patch, { raw: true, source: "auth" }); return true; }
  } catch {}
  return false;
}
function installHttp() { try { Http.install?.(AppCore); } catch {} return Http; }
function isRefreshableAuthError(error = null) { try { return Http.isRefreshableAuthError?.(error) === true; } catch { return false; } }
function shouldClearSessionForAuthError(error = null) { try { return Http.shouldClearSessionForAuthError?.(error) === true; } catch { return false; } }
function isHttpAuthError(error = null) {
  try { return Http.isAuthError?.(error) === true; }
  catch { const status = Number(error?.status || error?.statusCode || 0); return status === 401 || status === 403; }
}

function stripBearer(value = "") { return cleanText(value, "").replace(/^Bearer\s+/i, ""); }
function tokenOk(value = "") {
  const token = stripBearer(value);
  if (!token || /\s/.test(token) || token.length > 8192) return false;
  return !["null", "undefined", "false", "true", "[object object]", "{}", "[]"].includes(token.toLowerCase());
}
function cleanToken(value = "") { const token = stripBearer(value); return tokenOk(token) ? token : ""; }
function roleOrUser(value = "") { return AppCore.normalizeRole(value) || "user"; }
function normalizeUser(user = null) {
  if (!isObject(user)) return null;
  try {
    if (isFunction(AppCore?.normalizeUser)) {
      const normalized = AppCore.normalizeUser(user);
      if (!normalized || normalized.usable === false) return null;
      return normalized;
    }
  } catch {}
  return null;
}
function publicUser(user = null) {
  const normalized = normalizeUser(user);
  if (!normalized) return null;
  try { if (isFunction(AppCore?.publicUser)) return AppCore.publicUser(normalized); } catch {}
  return {
    id: normalized.id || normalized.userId || null,
    userId: normalized.userId || normalized.id || null,
    username: normalized.username || null,
    slug: normalized.slug || null,
    displayName: normalized.displayName || normalized.username || "Usuario",
    role: normalized.role || "user",
    rol: normalized.role || "user",
    roles: Array.isArray(normalized.roles) ? [...normalized.roles] : [normalized.role || "user"],
    avatarUrl: normalized.avatarUrl || "",
  };
}
function getUserSlugFromUser(user = null) {
  if (!isObject(user)) return "";
  return normalizeUserSlug(user.slug || user.lookup?.slug || user.profile?.slug || user.routing?.slug || user.username || user.userId || user.id || "");
}
function buildUserHomePath(user = null) {
  const target = user === null ? runtimeUser() : user;
  const slug = isObject(target) ? getUserSlugFromUser(target) : normalizeUserSlug(target);
  try { return buildUserHomeRoute(slug) || ROOT_PATH; }
  catch { return slug ? `${AUTH_HOME.userPrefix}${slug}` : ROOT_PATH; }
}
function isCanonicalRuntimeUser(user = null) {
  return Boolean(isObject(user) && typeof user.usable === "boolean" && Array.isArray(user.roles) && Array.isArray(user.permissions));
}

function runtimeToken(state = coreState()) {
  return cleanToken(first(state?.token, state?.accessToken, state?.access_token, ""));
}
function runtimeUser(state = coreState()) {
  const candidate = first(state?.user, state?.currentUser, state?.session?.user, null);
  if (!isObject(candidate)) return null;
  if (isCanonicalRuntimeUser(candidate)) return candidate.usable === false ? null : candidate;
  return normalizeUser(candidate);
}
function runtimeSession(state = coreState()) {
  if (isObject(state?.session)) return state.session;
  if (isObject(state?.sessionData)) return state.sessionData;
  return null;
}
function runtimeRole(state = coreState(), user = runtimeUser(state)) {
  if (!user) return "";
  return roleOrUser(first(state?.role, state?.rol, user.role, user.rol, user.roles, ""));
}
function runtimeRoles(state, user, token, role) {
  if (!token || !user || !role) return [];
  if (Array.isArray(state?.roles) && state.roles.length) return state.roles;
  return [role];
}
function runtimeUserSlug(state, user) {
  if (!user) return "";
  const direct = normalizeUserSlug(state?.userSlug || "");
  return direct || getUserSlugFromUser(user);
}
function runtimeHomePath(state, user) {
  if (!user) return ROOT_PATH;
  const direct = cleanText(state?.homePath || state?.defaultHome || "", "");
  return direct || buildUserHomePath(user) || ROOT_PATH;
}
function runtimePermissions(user) {
  if (!user) return [];
  if (Array.isArray(user.permissions)) return user.permissions;
  if (Array.isArray(user.permisos)) return user.permisos;
  return [];
}
function runtimeHasRefreshToken(state, session) {
  return Boolean(state?.hasRefreshToken === true || session?.persistent === true || session?.restoreOnBoot === true);
}
function cloneRuntimeUser(user) {
  if (!user) return null;
  return {
    ...user,
    roles: Array.isArray(user.roles) ? [...user.roles] : [],
    permissions: Array.isArray(user.permissions) ? [...user.permissions] : [],
    permisos: Array.isArray(user.permisos) ? [...user.permisos] : [],
  };
}
function cloneRuntimeSession(session) { return session ? { ...session } : null; }
function clonePublicUser(user = null) {
  if (!user) return null;
  return { ...user, roles: Array.isArray(user.roles) ? [...user.roles] : [] };
}

function readAuthContext() {
  selectorMetrics.contexts += 1;
  const state = coreState();
  const token = runtimeToken(state);
  const user = runtimeUser(state);
  const session = runtimeSession(state);
  const role = runtimeRole(state, user);
  const roles = runtimeRoles(state, user, token, role);
  const userSlug = runtimeUserSlug(state, user);
  const homePath = runtimeHomePath(state, user);
  const permissions = runtimePermissions(user);
  const hasRefreshToken = runtimeHasRefreshToken(state, session);
  return {
    token, user, session,
    authenticated: Boolean(token && user),
    role, roles, userSlug, homePath, permissions,
    hasToken: Boolean(token), hasUser: Boolean(user), hasSession: Boolean(session), hasRefreshToken,
  };
}

function getToken() { const state = coreState(); return runtimeToken(state); }
function getAccessToken() { return getToken(); }
function hasValidToken() { const state = coreState(); return Boolean(runtimeToken(state)); }
function getRefreshToken() { return ""; }
function getCurrentUser() { const state = coreState(); return cloneRuntimeUser(runtimeUser(state)); }
function getUser() { return getCurrentUser(); }
function getProfile() { return getCurrentUser(); }
function getCurrentSession() { const state = coreState(); return cloneRuntimeSession(runtimeSession(state)); }
function getSession() { return getCurrentSession(); }
function getUserSlug() { const state = coreState(); const user = runtimeUser(state); return runtimeUserSlug(state, user); }
function buildUserHomePathFromSlug(slug = "") { return buildUserHomePath(slug); }
function getDefaultHome() { const state = coreState(); const user = runtimeUser(state); return runtimeHomePath(state, user); }
function getPostLoginTarget() {
  const state = coreState(); const token = runtimeToken(state); const user = runtimeUser(state);
  return token && user ? runtimeHomePath(state, user) : ROOT_PATH;
}
function getRole() { const state = coreState(); const user = runtimeUser(state); return runtimeRole(state, user) || null; }
function getRoles() {
  const state = coreState(); const token = runtimeToken(state); const user = runtimeUser(state); const role = runtimeRole(state, user);
  return [...runtimeRoles(state, user, token, role)];
}
function isAuthenticated() { const state = coreState(); return Boolean(runtimeToken(state) && runtimeUser(state)); }
function isAdmin() {
  const state = coreState(); const token = runtimeToken(state); const user = runtimeUser(state);
  return Boolean(token && user && runtimeRole(state, user) === "admin");
}
function hasRole(role = "") {
  const required = AppCore.normalizeRole(role); if (!required) return false;
  const state = coreState(); const token = runtimeToken(state); const user = runtimeUser(state);
  if (!token || !user) return false;
  const current = runtimeRole(state, user); return current === "admin" || current === required;
}
function requireRole(role = "") {
  if (hasRole(role)) return true;
  const error = new Error("No tienes permisos para acceder a este recurso."); error.code = "AUTH_FORBIDDEN"; error.status = 403; throw error;
}
function getPermissions() { const state = coreState(); return [...runtimePermissions(runtimeUser(state))]; }
function getAuthHeader() { const state = coreState(); const token = runtimeToken(state); return token ? { Authorization: `Bearer ${token}` } : {}; }
function hasRefreshToken() { const state = coreState(); return runtimeHasRefreshToken(state, runtimeSession(state)); }

function payloadSources(payload = {}) {
  if (!isObject(payload)) return [];
  return [payload, isObject(payload.data) ? payload.data : null, isObject(payload.payload) ? payload.payload : null, isObject(payload.result) ? payload.result : null, isObject(payload.auth) ? payload.auth : null, isObject(payload.session) ? payload.session : null, isObject(payload.sessionData) ? payload.sessionData : null].filter(Boolean);
}
function looksLikeUser(value = null) {
  if (!isObject(value)) return false;
  if (isObject(value.user) || isObject(value.currentUser) || isObject(value.usuario) || isObject(value.me) || isObject(value.account)) return false;
  const strongIdentity = cleanText(first(value.id, value.userId, value.uid, value.sub, value.username, value.userName, value.user_name, value.email, value.emailLower, value.email_lower, value.lookup?.emailLower, value.lookup?.email_lower, ""), "");
  if (strongIdentity) return true;
  const slug = cleanText(first(value.slug, value.lookup?.slug, value.profile?.slug, value.routing?.slug, ""), "");
  const displayName = cleanText(first(value.displayName, value.fullName, value.name, value.nombre, value.profile?.displayName, value.profile?.publicName, value.profile?.name, ""), "");
  const role = AppCore.normalizeRole(first(value.role, value.rol, value.roles, ""));
  const hasAccountSignals = value.active !== undefined || value.enabled !== undefined || value.disabled !== undefined || value.status !== undefined || value.estado !== undefined || value.permissions !== undefined || value.permisos !== undefined || value.clienteId !== undefined || value.tenantId !== undefined;
  return Boolean((slug && (role || displayName || hasAccountSignals)) || (displayName && (role || hasAccountSignals)));
}
function pick(payload = {}, names = []) {
  for (const source of payloadSources(payload)) for (const name of names) {
    const value = source?.[name]; if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}
function extractToken(payload = {}) { return cleanToken(pick(payload, ["token", "accessToken", "access_token"]) || ""); }
function extractUser(payload = {}) {
  if (!isObject(payload)) return null;
  const explicitUser = pick(payload, ["user", "currentUser", "usuario", "me", "account"]); if (looksLikeUser(explicitUser)) return explicitUser;
  const profileUser = pick(payload, ["profile"]); if (looksLikeUser(profileUser)) return profileUser;
  return looksLikeUser(payload) ? payload : null;
}
function extractSession(payload = {}) { const session = pick(payload, ["session", "sessionData", "currentSession"]); return isObject(session) ? session : null; }
function normalizeAuthPayload(payload = {}, options = {}) {
  const source = isObject(payload) ? payload : {};
  let currentToken = ""; let currentUser = null;
  if (options.allowCurrentToken === true || options.allowCurrentUser === true) {
    const state = coreState();
    if (options.allowCurrentToken === true) currentToken = runtimeToken(state);
    if (options.allowCurrentUser === true) currentUser = runtimeUser(state);
  }
  const token = extractToken(source) || currentToken;
  const user = normalizeUser(extractUser(source) || currentUser);
  const session = extractSession(source);
  const role = user ? roleOrUser(first(user.role, user.rol, user.roles, "")) : "";
  const homePath = user ? buildUserHomePath(user) : ROOT_PATH;
  return {
    token, accessToken: token, access_token: token,
    user, currentUser: user, session, sessionData: session,
    authenticated: Boolean(token && user), hasToken: Boolean(token), hasUser: Boolean(user), hasSession: Boolean(session),
    hasRefreshToken: source.hasRefreshToken === true,
    role: role || null, rol: role || null, roles: role ? [role] : [],
    userSlug: user ? getUserSlugFromUser(user) || null : null,
    homePath, defaultHome: homePath, postLoginTarget: token && user ? homePath : null,
  };
}
function applySession(payload = {}, options = {}) {
  const normalized = normalizeAuthPayload(payload, options);
  if (normalized.token || normalized.user || normalized.session || normalized.hasRefreshToken) {
    const patch = { hasRefreshToken: normalized.hasRefreshToken === true };
    if (normalized.token) patch.token = normalized.token;
    if (normalized.user) patch.user = normalized.user;
    if (normalized.session) patch.session = normalized.session;
    writeCoreState(patch);
  }
  return getPublicAuthResult();
}
function clearSession(options = {}) {
  if (options.invalidate !== false) { invalidateFlows(); abortActiveFlows(); }
  if (writeCoreState({ token: null, user: null, session: null, hasRefreshToken: false })) return true;
  try { if (isFunction(AppCore?.clearSession)) { AppCore.clearSession(); return true; } } catch {}
  try { Http.clearAuthTokens?.(); } catch {}
  return true;
}
function syncAuthState() {
  const context = readAuthContext();
  if (!context.token || !context.user) return false;
  return writeCoreState({ token: context.token, user: context.user, session: context.session, hasRefreshToken: context.hasRefreshToken });
}
function getPublicAuthResult(payload = {}) {
  const context = readAuthContext();
  const publicIdentity = context.authenticated ? publicUser(context.user) : null;
  const publicCurrentUser = clonePublicUser(publicIdentity);
  const session = context.authenticated ? cloneRuntimeSession(context.session) : null;
  return {
    ok: payload.ok !== false,
    authenticated: context.authenticated,
    skippedRefresh: payload.skippedRefresh === true,
    reason: cleanText(payload.reason, "") || null,
    user: publicIdentity,
    currentUser: publicCurrentUser,
    session, sessionData: session ? { ...session } : null,
    hasToken: context.hasToken, hasUser: context.hasUser, hasSession: context.hasSession, hasRefreshToken: context.hasRefreshToken,
    userSlug: context.user ? context.userSlug || null : null,
    homePath: context.homePath, defaultHome: context.homePath,
    postLoginTarget: context.authenticated ? context.homePath : null,
    role: context.authenticated ? context.role || null : null,
    roles: context.authenticated ? [...context.roles] : [],
    token: null, accessToken: null, access_token: null, refreshToken: null, refresh_token: null,
  };
}
function getSelectorStats() { return Object.freeze({ ...selectorMetrics }); }

function getAuthModuleSnapshot() {
  const result = getPublicAuthResult();
  return Object.freeze({
    version: AUTH_VERSION, ...result, isAdmin: result.authenticated && result.role === "admin",
    routes: AUTH_ROUTES, home: AUTH_HOME,
    endpoints: Object.freeze({ login: AUTH_ENDPOINTS.login, me: AUTH_ENDPOINTS.me, refresh: AUTH_ENDPOINTS.refresh, logout: AUTH_ENDPOINTS.logout }),
    session: Object.freeze({
      loggingIn: sessionState.loggingIn, loggingOut: sessionState.loggingOut, restoring: sessionState.restoring, refreshing: sessionState.refreshing, checking: sessionState.checking,
      activeFlows: sessionState.activeFlows, generation: sessionState.generation,
      lastLoginAt: sessionState.lastLoginAt, lastRestoreAt: sessionState.lastRestoreAt, lastRefreshAt: sessionState.lastRefreshAt,
      lastMeAt: sessionState.lastMeAt, lastLogoutAt: sessionState.lastLogoutAt, lastError: sessionState.lastError,
    }),
    selectors: Object.freeze({ ...selectorMetrics }),
    policy: Object.freeze({ runtimeStateZeroCopyRead: true, singleReadSelectors: true, lazyHttpTokenFallback: false, runtimeStateSingleWrite: true, publicUserIsolation: true, publicSessionIsolation: true, httpOnlyRefreshToken: true, remoteLogoutFailClosed: true, expiredAccessTokenLogoutRefreshRetry: true }),
  });
}
function shouldAttemptRefresh(options = {}) {
  if (options.skipRefresh === true || options.noRefresh === true) return false;
  if (options.forceRefresh === true || options.forceRestore === true) return true;
  if (options.restoreOnBoot === true || options.persistent === true || options.silent === true) return true;
  if (cleanText(options.credentials, "").toLowerCase() === "include") return true;
  return hasValidToken();
}
function cleanLoginCredentials(credentials = {}) {
  const output = isObject(credentials) ? { ...credentials } : {};
  delete output.remember; delete output.rememberMe; delete output.remember_me; delete output.persist; delete output.persistent;
  return output;
}

async function login(credentials = {}, options = {}) {
  if (sessionState.loginPromise) return sessionState.loginPromise;
  const generation = currentGeneration(); sessionState.loggingIn = true; const flow = createFlowAbort(options.signal || null);
  sessionState.loginPromise = (async () => {
    try {
      const raw = await Http.login(cleanLoginCredentials(credentials), withFlowSignal(options, flow.signal));
      if (!flowIsCurrent(generation)) return getPublicAuthResult({ ok: false, reason: "stale-login" });
      let result = applySession(raw || {}, { allowCurrentToken: false, allowCurrentUser: false });
      if (!result.authenticated && result.hasToken) {
        try { result = await fetchMe({ ...options, noAutoRefresh: true, source: "Auth.login.me" }); }
        catch (error) { if (isHttpAuthError(error)) clearSession(); throw error; }
      }
      sessionState.lastError = null; sessionState.lastLoginAt = Date.now();
      return getPublicAuthResult({ ok: result.ok !== false });
    } catch (error) { sessionState.lastError = safeError(error, "login"); throw error; }
    finally { sessionState.loggingIn = false; sessionState.loginPromise = null; flow.cleanup(); }
  })();
  return sessionState.loginPromise;
}
async function fetchMe(options = {}) {
  if (sessionState.mePromise) return sessionState.mePromise;
  const generation = currentGeneration(); sessionState.checking = true; const flow = createFlowAbort(options.signal || null);
  sessionState.mePromise = (async () => {
    try {
      const raw = await Http.me(withFlowSignal(options, flow.signal));
      if (!flowIsCurrent(generation)) return getPublicAuthResult({ ok: false, reason: "stale-me" });
      const result = applySession(raw || {}, { allowCurrentToken: true, allowCurrentUser: false });
      sessionState.lastError = null; sessionState.lastMeAt = Date.now(); return result;
    } catch (error) {
      sessionState.lastError = safeError(error, "me");
      if (flowIsCurrent(generation) && shouldClearSessionForAuthError(error)) clearSession();
      throw error;
    } finally { sessionState.checking = false; sessionState.mePromise = null; flow.cleanup(); }
  })();
  return sessionState.mePromise;
}
async function refreshSession(options = {}) {
  if (sessionState.refreshPromise) return sessionState.refreshPromise;
  const generation = currentGeneration(); sessionState.refreshing = true; const flow = createFlowAbort(options.signal || null);
  sessionState.refreshPromise = (async () => {
    try {
      await Http.refreshSession(isObject(options.body) ? options.body : {}, withFlowSignal(options, flow.signal));
      if (!flowIsCurrent(generation)) return getPublicAuthResult({ ok: false, reason: "stale-refresh" });
      let result = getPublicAuthResult();
      if (!result.authenticated && result.hasToken) {
        try { result = await fetchMe({ ...options, noAutoRefresh: true, source: "Auth.refreshSession.me" }); }
        catch (error) { if (isHttpAuthError(error)) clearSession(); throw error; }
      }
      sessionState.lastError = null; sessionState.lastRefreshAt = Date.now(); return result;
    } catch (error) {
      sessionState.lastError = safeError(error, "refresh");
      if (flowIsCurrent(generation) && shouldClearSessionForAuthError(error)) clearSession();
      throw error;
    } finally { sessionState.refreshing = false; sessionState.refreshPromise = null; flow.cleanup(); }
  })();
  return sessionState.refreshPromise;
}
async function restoreSession(options = {}) {
  if (sessionState.restorePromise) return sessionState.restorePromise;
  const generation = currentGeneration(); sessionState.restoring = true;
  sessionState.restorePromise = (async () => {
    try {
      if (isAuthenticated()) { sessionState.lastError = null; return getPublicAuthResult(); }
      if (hasValidToken()) {
        try { return await fetchMe({ ...options, noAutoRefresh: true, source: "Auth.restoreSession.me" }); }
        catch (error) {
          if (!flowIsCurrent(generation)) return getPublicAuthResult({ ok: false, reason: "stale-restore" });
          if (!isRefreshableAuthError(error)) {
            if (shouldClearSessionForAuthError(error)) clearSession();
            return getPublicAuthResult({ ok: false, reason: "me-failed" });
          }
        }
      }
      if (!shouldAttemptRefresh(options)) {
        sessionState.lastError = null;
        return getPublicAuthResult({ ok: false, skippedRefresh: true, reason: "refresh-not-requested" });
      }
      try {
        const result = await refreshSession({ ...options, source: "Auth.restoreSession.refresh" });
        if (!flowIsCurrent(generation)) return getPublicAuthResult({ ok: false, reason: "stale-restore" });
        sessionState.lastError = null; return result;
      } catch (error) {
        if (!flowIsCurrent(generation)) return getPublicAuthResult({ ok: false, reason: "stale-restore" });
        sessionState.lastError = safeError(error, "restore");
        if (shouldClearSessionForAuthError(error)) clearSession();
        return getPublicAuthResult({ ok: false, reason: "refresh-failed" });
      }
    } finally { sessionState.restoring = false; sessionState.restorePromise = null; sessionState.lastRestoreAt = Date.now(); }
  })();
  return sessionState.restorePromise;
}
async function logout(options = {}) {
  if (sessionState.logoutPromise) return sessionState.logoutPromise;

  invalidateFlows();
  abortActiveFlows();
  sessionState.loggingOut = true;

  sessionState.logoutPromise = (async () => {
    try {
      const result = await Http.logout(options);

      if (
        result?.ok !== true ||
        result?.loggedOut !== true ||
        result?.serverRevocationConfirmed !== true
      ) {
        const error = new Error(
          "El servidor no confirmó la revocación de la sesión."
        );
        error.name = "AuthLogoutError";
        error.code = "LOGOUT_REVOCATION_UNCONFIRMED";
        error.status = 503;
        throw error;
      }

      clearSession({ invalidate: false });
      sessionState.lastError = null;
      sessionState.lastLogoutAt = Date.now();

      return true;
    } catch (error) {
      /*
        Si refresh/requireAuth demuestra que la sesión ya no es válida,
        limpiar el cliente es seguro e idempotente. Red/5xx o una
        revocación no confirmada conservan el estado para permitir retry.
      */
      if (shouldClearSessionForAuthError(error)) {
        clearSession({ invalidate: false });
        sessionState.lastError = null;
        sessionState.lastLogoutAt = Date.now();
        return true;
      }

      sessionState.lastError = safeError(error, "logout");
      throw error;
    } finally {
      sessionState.loggingOut = false;
      sessionState.logoutPromise = null;
    }
  })();

  return sessionState.logoutPromise;
}

function tokenFromPayload(payload = {}) {
  if (typeof payload === "string") return cleanText(payload, "");
  if (!isObject(payload)) return "";
  return cleanText(payload.token || payload.resetToken || payload.activationToken || payload.activation_token || payload.reset_token || "", "");
}
function validateActivationToken(payload = {}) { const token = tokenFromPayload(payload); return Promise.resolve({ ok: Boolean(token), valid: Boolean(token) }); }
function validateResetPasswordToken(payload = {}) { const token = tokenFromPayload(payload); return Promise.resolve({ ok: Boolean(token), valid: Boolean(token) }); }
async function activateAccount(payload = {}, options = {}) { return Http.activateAccount(payload, options); }
async function requestPasswordReset(payload = {}, options = {}) { return Http.requestPasswordReset(payload, options); }
async function confirmResetPassword(payload = {}, options = {}) {
  const raw = await Http.confirmPasswordReset(payload, options);
  const normalized = normalizeAuthPayload(raw || {}, { allowCurrentToken: false, allowCurrentUser: false });
  if (normalized.authenticated) return applySession(normalized, { allowCurrentToken: false, allowCurrentUser: false });
  return safePayload(raw);
}
function init() {
  installHttp();
  try { if (isFunction(AppCore?.registerModule)) AppCore.registerModule("auth", Auth, { overwrite: true }); else AppCore.Auth = Auth; } catch {}
  return Auth;
}

export const Auth = {
  version: AUTH_VERSION,
  AUTH_ENDPOINTS, AUTH_ROUTES, AUTH_HOME, session: sessionState,
  init, login, logout, restoreSession, refreshSession, fetchMe, me: fetchMe,
  getUser, getCurrentUser, getProfile, getSession, getCurrentSession,
  getToken, getAccessToken, getRefreshToken, hasValidToken, hasRefreshToken, isAuthenticated,
  getRole, getRoles, getCurrentRole: getRole, getCurrentRoles: getRoles, getPermissions,
  isAdmin, isCurrentUserAdmin: isAdmin, hasRole, requireRole,
  normalizeUser, normalizeAuthPayload,
  getUserSlug, buildUserHomePath, buildUserHomePathFromSlug, getDefaultHome, getPostLoginTarget,
  applySession, clearSession, syncAuthState, getAuthHeader,
  activateAccount, validateActivationToken, requestPasswordReset, confirmResetPassword, validateResetPasswordToken,
  getSelectorStats,
  getAuthModuleSnapshot, getSnapshot: getAuthModuleSnapshot, getDebugSnapshot: getAuthModuleSnapshot, snapshot: getAuthModuleSnapshot,
};

export default Auth;
