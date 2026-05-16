/* =========================================================
   Onion SPA - HTTP Auth
   Archivo: src/services/http.auth.js

   HTTP Auth fino:
   - Auto-refresh sólo en 401 privado.
   - Single-flight para refresh concurrente.
   - /api/auth/me, /auth/me, /api/me y /me siempre privados.
   - No usa restoreSession.
   - No hace logout.
   - Fallback fetch directo sólo con refresh context real/cookie explícita.
   - Eventos internos opt-in.
========================================================= */

import {
  isFn as importedIsFn,
  redactHttpValue,
  sanitizeData,
} from "./http.helpers.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

export const HTTP_AUTH_VERSION = "18.0.0-clean";

const DEFAULT_API_ORIGIN = "https://api.onionit.net";
const DEFAULT_REFRESH_ENDPOINT = "/api/auth/refresh";
const DEFAULT_DIRECT_REFRESH_TIMEOUT_MS = 8000;
const DEFAULT_REFRESH_REASON = "http-auto-refresh";

const EVENTS = Object.freeze({
  skipped: "http:auto-refresh:skipped",
  join: "http:auto-refresh:join",
  joinSuccess: "http:auto-refresh:join-success",
  joinFailed: "http:auto-refresh:join-failed",
  joinError: "http:auto-refresh:join-error",
  start: "http:auto-refresh:start",
  success: "http:auto-refresh:success",
  rejected: "http:auto-refresh:rejected",
  error: "http:auto-refresh:error",
  applied: "http:auto-refresh:applied",
  directStart: "http:auto-refresh:direct:start",
  directSuccess: "http:auto-refresh:direct:success",
  directError: "http:auto-refresh:direct:error",
  directSkipped: "http:auto-refresh:direct:skipped",
});

const BAD_TOKEN_VALUES = Object.freeze([
  "",
  "null",
  "undefined",
  "false",
  "true",
  "nan",
  "none",
  "empty",
  "[object object]",
  "{}",
  "[]",
  "\"\"",
  "''",
]);

/*
  No meter restoreSession aquí:
  restore puede llamar /me, tocar Router, reparar UI o navegar.
  Auto-refresh sólo refresca token/sesión.
*/
const REFRESH_METHODS = Object.freeze([
  "refreshSession",
  "refresh",
  "refreshToken",
]);

const AUTH_ME_ENDPOINTS = Object.freeze([
  "/me",
  "/api/me",
  "/auth/me",
  "/api/auth/me",
]);

const AUTH_CONTROL_MARKERS = Object.freeze([
  "/auth/login",
  "/auth/register",
  "/auth/signup",

  "/auth/refresh",
  "/auth/token/refresh",
  "/auth/renew",

  "/auth/logout",
  "/auth/logout-all",

  "/auth/2fa",
  "/auth/2fa/login",
  "/auth/2fa/verify",

  "/auth/mfa",
  "/auth/mfa/login",
  "/auth/mfa/verify",

  "/auth/otp",
  "/auth/otp/login",
  "/auth/otp/verify",

  "/auth/activate",
  "/auth/activate-account",
  "/auth/account/activate",
  "/auth/activation",
  "/auth/activate/first-user",
  "/auth/activate/validate",

  "/auth/reset-password",
  "/auth/reset-password-request",
  "/auth/reset-password-confirm",
  "/auth/reset-password/confirm",
  "/auth/reset-password/validate",

  "/auth/password-reset",
  "/auth/password-reset/request",
  "/auth/password-reset/confirm",
  "/auth/password-reset/validate",

  "/auth/forgot-password",
  "/auth/recover-password",

  "/auth/_health",
  "/auth/health",
]);

const PUBLIC_AUTH_MARKERS = Object.freeze([
  "/auth/login",
  "/auth/register",
  "/auth/signup",

  "/auth/refresh",
  "/auth/token/refresh",
  "/auth/renew",

  "/auth/2fa",
  "/auth/2fa/login",
  "/auth/2fa/verify",

  "/auth/mfa",
  "/auth/mfa/login",
  "/auth/mfa/verify",

  "/auth/otp",
  "/auth/otp/login",
  "/auth/otp/verify",

  "/auth/activate",
  "/auth/activate-account",
  "/auth/account/activate",
  "/auth/activation",
  "/auth/activate/first-user",
  "/auth/activate/validate",

  "/auth/reset-password",
  "/auth/reset-password-request",
  "/auth/reset-password-confirm",
  "/auth/reset-password/confirm",
  "/auth/reset-password/validate",

  "/auth/password-reset",
  "/auth/password-reset/request",
  "/auth/password-reset/confirm",
  "/auth/password-reset/validate",

  "/auth/forgot-password",
  "/auth/recover-password",

  "/auth/_health",
  "/auth/health",
]);

const TECHNICAL_PUBLIC_ROUTES = Object.freeze([
  "/login",
  "/activate-account",
  "/reset-password",
  "/reset-password/confirm",
  "/forgot-password",
  "/recover-password",
  "/password-reset",
  "/password-reset/confirm",
  "/2fa",
  "/otp",
  "/mfa",
]);

const TOKEN_KEYS = Object.freeze([
  "token",
  "accessToken",
  "access_token",
  "authToken",
  "auth_token",
  "jwt",
  "bearer",
  "idToken",
  "id_token",
]);

const REFRESH_TOKEN_KEYS = Object.freeze([
  "refreshToken",
  "refresh_token",
]);

const USER_KEYS = Object.freeze([
  "user",
  "usuario",
  "me",
  "account",
  "profile",
  "currentUser",
  "current_user",
  "authUser",
  "auth_user",
  "sessionUser",
  "session_user",
]);

const SESSION_KEYS = Object.freeze([
  "session",
  "sessionData",
  "session_data",
  "authSession",
  "auth_session",
]);

const WALK_KEYS = Object.freeze([
  "data",
  "payload",
  "result",
  "body",
  "response",
  "auth",
  "authData",
  "auth_data",
  "session",
  "sessionData",
  "session_data",
]);

const fallbackState = {
  refreshPromise: null,
  refreshStats: createRefreshStats(),
};

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  try {
    return importedIsFn(value);
  } catch {
    return typeof value === "function";
  }
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function isoNow(ms = nowMs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function hasOwn(obj, key) {
  try {
    return Object.prototype.hasOwnProperty.call(obj, key);
  } catch {
    return false;
  }
}

function firstText(...values) {
  for (const value of values) {
    const text = safeText(value, "");
    if (text) return text;
  }

  return "";
}

function unique(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flat(Infinity)
        .map((item) => safeText(item, ""))
        .filter(Boolean)
    ),
  ];
}

function redact(value = "") {
  try {
    return redactHttpValue(value);
  } catch {
    return safeText(value, "");
  }
}

function sanitize(value) {
  try {
    return sanitizeData(value);
  } catch {
    return value;
  }
}

/* =========================================================
   REQUEST PATH / ENDPOINT POLICY
========================================================= */

function getRequestPath(requestConfig = {}) {
  const cfg = safeObject(requestConfig);

  return firstText(
    cfg.path,
    cfg.url,
    cfg.endpoint,
    cfg.href,
    cfg.input,
    cfg.resource,
    cfg.finalUrl,
    cfg.originalUrl,
    cfg.requestUrl,
    cfg.redactedUrl,
    cfg.route,
    cfg.pathname
  );
}

function getBaseOrigin() {
  try {
    if (window.location?.origin) return window.location.origin;
  } catch {}

  return "http://localhost";
}

export function normalizeEndpointPath(path = "") {
  const raw = safeText(path, "");

  if (!raw) return "";

  try {
    const parsed = new URL(raw, getBaseOrigin());

    return (parsed.pathname || "/")
      .toLowerCase()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/g, "") || "/";
  } catch {
    return raw
      .split("?")[0]
      .split("#")[0]
      .toLowerCase()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/g, "") || "/";
  }
}

function stripApiPrefix(path = "") {
  const clean = normalizeEndpointPath(path);

  if (clean === "/api") return "/";
  if (clean.startsWith("/api/")) return clean.slice(4) || "/";

  return clean;
}

function comparablePaths(path = "") {
  const clean = normalizeEndpointPath(path);

  return unique([
    clean,
    stripApiPrefix(clean),
  ]);
}

function endpointMatches(path = "", markers = []) {
  const paths = comparablePaths(path);

  if (!paths.length) return false;

  return safeArray(markers).some((marker) => {
    const cleanMarker = normalizeEndpointPath(marker);

    if (!cleanMarker) return false;

    return paths.some((candidate) => (
      candidate === cleanMarker ||
      candidate.startsWith(`${cleanMarker}/`)
    ));
  });
}

export function isAuthMeEndpoint(path = "") {
  const paths = comparablePaths(path);

  return paths.some((candidate) => (
    AUTH_ME_ENDPOINTS.includes(candidate) ||
    candidate === "/me" ||
    candidate === "/auth/me"
  ));
}

export function isPublicAuthEndpoint(path = "") {
  if (isAuthMeEndpoint(path)) return false;
  return endpointMatches(path, PUBLIC_AUTH_MARKERS);
}

export function isAuthRefreshControlEndpoint(path = "") {
  if (isAuthMeEndpoint(path)) return false;
  return endpointMatches(path, AUTH_CONTROL_MARKERS);
}

export function isTechnicalPublicRoute(path = "") {
  return endpointMatches(path, TECHNICAL_PUBLIC_ROUTES);
}

export function isPublicEndpoint(path = "", AppCore = null) {
  if (isAuthMeEndpoint(path)) return false;

  if (isPublicAuthEndpoint(path) || isTechnicalPublicRoute(path)) {
    return true;
  }

  try {
    if (isFn(AppCore?.utils?.isPublicApiPath)) {
      return Boolean(AppCore.utils.isPublicApiPath(path));
    }
  } catch {}

  try {
    if (isFn(AppCore?.isPublicApiPath)) {
      return Boolean(AppCore.isPublicApiPath(path));
    }
  } catch {}

  return false;
}

export function isAuthEndpoint(path = "") {
  const clean = normalizeEndpointPath(path);
  return clean.includes("/auth/") || clean.endsWith("/auth") || isAuthMeEndpoint(clean);
}

/* =========================================================
   EVENT POLICY
========================================================= */

function shouldEmit(AppCore = null, config = {}, requestConfig = {}) {
  const cfg = safeObject(config);
  const req = safeObject(requestConfig);

  if (req.emitEvents === false) return false;

  if (
    req.emitAuthRefreshEvents === true ||
    req.emitAutoRefreshEvents === true ||
    req.debugAuthRefreshEvents === true ||
    cfg.emitAuthRefreshEvents === true ||
    cfg.emitAutoRefreshEvents === true ||
    cfg.debugAuthRefreshEvents === true
  ) {
    return true;
  }

  try {
    const diagnostics = AppCore?.config?.diagnostics || {};

    return Boolean(
      diagnostics.httpAuthEvents === true ||
        diagnostics.httpAutoRefreshEvents === true ||
        diagnostics.httpLifecycleEvents === true ||
        AppCore?.config?.debugHttpAuth === true
    );
  } catch {
    return false;
  }
}

function emit(AppCore, config, requestConfig, eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name || !shouldEmit(AppCore, config, requestConfig)) {
    return false;
  }

  try {
    AppCore?.events?.emit?.(
      name,
      sanitize({
        version: HTTP_AUTH_VERSION,
        at: isoNow(),
        ...safeObject(payload),
      })
    );

    return true;
  } catch {
    return false;
  }
}

function warn(AppCore, ...args) {
  const clean = args.map((item) => sanitize(item));

  try {
    AppCore?.utils?.warn?.("[HTTP Auth]", ...clean);
    return;
  } catch {}

  try {
    if (AppCore?.config?.debug === true || AppCore?.config?.debugHttpAuth === true) {
      console.warn("[HTTP Auth]", ...clean);
    }
  } catch {}
}

/* =========================================================
   TOKEN / USER / CORE STATE
========================================================= */

function stripBearer(token = "") {
  return safeText(token, "").replace(/^Bearer\s+/i, "").trim();
}

function hasUsableToken(token = "") {
  const value = stripBearer(token);

  if (!value) return false;

  const lower = value.toLowerCase();

  if (BAD_TOKEN_VALUES.includes(lower)) return false;
  if (/[\s\r\n\t]/.test(value)) return false;

  return true;
}

function hasUsableUser(user = null) {
  const source = safeObject(user);

  if (!Object.keys(source).length) return false;

  if (
    source.active === false ||
    source.disabled === true ||
    source.isDisabled === true ||
    source.deleted === true ||
    source.isDeleted === true ||
    source.blocked === true ||
    source.isBlocked === true
  ) {
    return false;
  }

  const status = safeLower(
    source.status ||
      source.estado ||
      source.state ||
      source.accountStatus ||
      "",
    ""
  );

  if (
    [
      "disabled",
      "inactive",
      "deleted",
      "blocked",
      "suspended",
      "banned",
      "desactivado",
      "inactivo",
      "eliminado",
      "bloqueado",
      "suspendido",
    ].includes(status)
  ) {
    return false;
  }

  return Boolean(
    safeText(source.id, "") ||
      safeText(source.userId, "") ||
      safeText(source.user_id, "") ||
      safeText(source._id, "") ||
      safeText(source.uid, "") ||
      safeText(source.sub, "") ||
      safeText(source.username, "") ||
      safeText(source.userName, "") ||
      safeText(source.user_name, "") ||
      safeText(source.email, "") ||
      safeText(source.mail, "") ||
      safeText(source.phone, "") ||
      safeText(source.telefono, "")
  );
}

function getCoreState(AppCore) {
  try {
    if (isFn(AppCore?.getState)) {
      return AppCore.getState({ includeToken: true }) || {};
    }
  } catch {}

  try {
    return AppCore?.state || {};
  } catch {
    return {};
  }
}

function getHeaderToken(source) {
  try {
    if (!isFn(source?.getAuthHeader)) return "";

    const header = source.getAuthHeader();

    if (!header || typeof header !== "object") return "";

    return Object.values(header)
      .map((value) => stripBearer(value))
      .find(hasUsableToken) || "";
  } catch {
    return "";
  }
}

function getStateToken(AppCore) {
  const state = getCoreState(AppCore);

  return firstText(
    state.token,
    state.accessToken,
    state.access_token,
    state.session?.token,
    state.session?.accessToken,
    state.session?.access_token,
    state.sessionData?.token,
    state.sessionData?.accessToken,
    state.sessionData?.access_token
  );
}

function hasUsableAccessToken(AppCore, Auth) {
  return Boolean(
    hasUsableToken(getHeaderToken(Auth)) ||
      hasUsableToken(getHeaderToken(AppCore)) ||
      hasUsableToken(getStateToken(AppCore))
  );
}

function isAuthenticatedEnough(AppCore, Auth) {
  try {
    if (isFn(Auth?.isAuthenticated)) {
      return Boolean(Auth.isAuthenticated());
    }
  } catch {}

  return Boolean(getCoreState(AppCore)?.authenticated);
}

function getRefreshTokenCandidate(AppCore, Auth) {
  try {
    if (isFn(Auth?.getStoredRefreshToken)) {
      const token = Auth.getStoredRefreshToken();
      if (hasUsableToken(token)) return token;
    }
  } catch {}

  try {
    if (isFn(Auth?.getRefreshToken)) {
      const token = Auth.getRefreshToken();
      if (hasUsableToken(token)) return token;
    }
  } catch {}

  const state = getCoreState(AppCore);

  return firstText(
    state.refreshToken,
    state.refresh_token,
    state.session?.refreshToken,
    state.session?.refresh_token,
    state.sessionData?.refreshToken,
    state.sessionData?.refresh_token
  );
}

function getSessionIdCandidate(AppCore, Auth) {
  try {
    if (isFn(Auth?.getStoredSessionId)) {
      const value = Auth.getStoredSessionId();
      if (safeText(value, "")) return value;
    }
  } catch {}

  const state = getCoreState(AppCore);

  return firstText(
    state.sessionId,
    state.session_id,
    state.session?.sessionId,
    state.session?.session_id,
    state.sessionData?.sessionId,
    state.sessionData?.session_id
  );
}

function getSessionUserIdCandidate(AppCore, Auth) {
  try {
    if (isFn(Auth?.getStoredSessionUserId)) {
      const value = Auth.getStoredSessionUserId();
      if (safeText(value, "")) return value;
    }
  } catch {}

  const state = getCoreState(AppCore);

  return firstText(
    state.sessionUserId,
    state.session_user_id,
    state.session?.sessionUserId,
    state.session?.session_user_id,
    state.sessionData?.sessionUserId,
    state.sessionData?.session_user_id,
    state.user?.userId,
    state.user?.id
  );
}

function hasRefreshContext(AppCore, Auth) {
  try {
    if (isFn(Auth?.hasRefreshContext)) {
      return Boolean(Auth.hasRefreshContext());
    }
  } catch {}

  try {
    if (isFn(Auth?.hasRefreshToken)) {
      return Boolean(Auth.hasRefreshToken());
    }
  } catch {}

  if (hasUsableToken(getRefreshTokenCandidate(AppCore, Auth))) {
    return true;
  }

  return Boolean(
    safeText(getSessionIdCandidate(AppCore, Auth), "") &&
      safeText(getSessionUserIdCandidate(AppCore, Auth), "")
  );
}

function allowsCookieRefresh(config = {}) {
  const cfg = safeObject(config);

  return Boolean(
    cfg.enableHttpOnlyRefreshCookie === true ||
      cfg.enableCookieRefreshFallback === true ||
      cfg.auth?.enableHttpOnlyRefreshCookie === true ||
      cfg.auth?.enableCookieRefreshFallback === true
  );
}

function hasRefreshCapability(AppCore, Auth, config = {}) {
  if (hasRefreshContext(AppCore, Auth)) return true;
  return allowsCookieRefresh(config) && isBrowser();
}

function hasRefreshMethod(Auth) {
  return REFRESH_METHODS.some((name) => isFn(Auth?.[name]));
}

/* =========================================================
   STATS
========================================================= */

function createRefreshStats() {
  return {
    version: HTTP_AUTH_VERSION,

    attempts: 0,
    failures: 0,
    skipped: 0,
    joined: 0,
    successes: 0,
    applied: 0,

    directAttempts: 0,
    directSuccesses: 0,
    directFailures: 0,
    directSkipped: 0,

    lastAttemptAt: 0,
    lastSuccessAt: 0,
    lastFailureAt: 0,
    lastSkipAt: 0,
    lastJoinAt: 0,
    lastAppliedAt: 0,

    lastDirectAttemptAt: 0,
    lastDirectSuccessAt: 0,
    lastDirectFailureAt: 0,
    lastDirectSkipAt: 0,

    lastSkipReason: "",
    lastDirectSkipReason: "",

    lastError: null,
  };
}

function normalizeStats(stats = {}) {
  const target = isObject(stats) ? stats : {};
  const defaults = createRefreshStats();

  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in target)) target[key] = value;
  }

  target.version = HTTP_AUTH_VERSION;

  return target;
}

function getRoot(stateRef) {
  const root = stateRef && typeof stateRef === "object"
    ? stateRef
    : fallbackState;

  root.refreshStats = normalizeStats(root.refreshStats);

  if (!hasOwn(root, "refreshPromise")) {
    root.refreshPromise = null;
  }

  return root;
}

function normalizeError(error = null) {
  if (!error) return null;

  return sanitize({
    name: safeText(error?.name, "Error"),
    message: safeText(error?.message || error?.reason || error, "Error"),
    status: safeNumber(error?.status || error?.statusCode, 0),
    statusText: safeText(error?.statusText, ""),
    code: error?.code || null,
    aborted: error?.aborted === true || error?.name === "AbortError",
    timeout: error?.timeout === true || error?.code === "TIMEOUT",
    url: redact(error?.url || ""),
    redactedUrl: redact(error?.redactedUrl || error?.url || ""),
  });
}

function sanitizeRequestContext(requestConfig = {}) {
  const cfg = safeObject(requestConfig);

  return {
    requestId: safeText(cfg.requestId, ""),
    method: safeText(cfg.method, ""),
    path: redact(getRequestPath(cfg)),

    public: cfg.public === true,
    auth: cfg.auth !== false,
    skipAuth: cfg.skipAuth === true,

    skipAuthRefresh: cfg._skipAuthRefresh === true || cfg.skipAuthRefresh === true,
    noAutoRefresh: cfg.noAutoRefresh === true || cfg.autoRefresh === false,

    authRefreshAttempted: cfg._authRefreshAttempted === true,
    authRefreshSucceeded: cfg._authRefreshSucceeded === true,
    authRefreshFailed: cfg._authRefreshFailed === true,
  };
}

function markSkipped(root, AppCore, config, requestConfig, context, reason) {
  const stats = root.refreshStats;

  stats.skipped += 1;
  stats.lastSkipAt = nowMs();
  stats.lastSkipReason = safeText(reason, "unknown");

  emit(AppCore, config, requestConfig, EVENTS.skipped, {
    ...context,
    reason: stats.lastSkipReason,
  });

  return false;
}

function markFailure(root, AppCore, config, requestConfig, context, error, eventName = EVENTS.error, extra = {}) {
  const stats = root.refreshStats;

  stats.failures += 1;
  stats.lastFailureAt = nowMs();
  stats.lastError = normalizeError(error);

  emit(AppCore, config, requestConfig, eventName, {
    ...context,
    ...safeObject(extra),
    error: stats.lastError,
  });

  return false;
}

function markSuccess(root, AppCore, config, requestConfig, context, extra = {}) {
  const stats = root.refreshStats;

  stats.successes += 1;
  stats.lastSuccessAt = nowMs();
  stats.lastError = null;

  emit(AppCore, config, requestConfig, EVENTS.success, {
    ...context,
    refreshed: true,
    ...safeObject(extra),
  });

  return true;
}

function markApplied(root, AppCore, config, requestConfig, context, extra = {}) {
  const stats = root.refreshStats;

  stats.applied += 1;
  stats.lastAppliedAt = nowMs();

  emit(AppCore, config, requestConfig, EVENTS.applied, {
    ...context,
    ...safeObject(extra),
  });

  return true;
}

function markDirectSkipped(root, AppCore, config, requestConfig, context, reason) {
  const stats = root.refreshStats;

  stats.directSkipped += 1;
  stats.lastDirectSkipAt = nowMs();
  stats.lastDirectSkipReason = safeText(reason, "unknown");

  emit(AppCore, config, requestConfig, EVENTS.directSkipped, {
    ...context,
    reason: stats.lastDirectSkipReason,
  });

  return false;
}

/* =========================================================
   REFRESH PAYLOAD
========================================================= */

function collectObjects(value = null) {
  const output = [];
  const seen = new WeakSet();
  const queue = [value];

  let guard = 0;

  while (queue.length && guard < 140) {
    guard += 1;

    const current = queue.shift();

    if (!current || typeof current !== "object") continue;

    try {
      if (seen.has(current)) continue;
      seen.add(current);
    } catch {}

    output.push(current);

    for (const key of WALK_KEYS) {
      const child = current[key];

      if (child && typeof child === "object") {
        queue.push(child);
      }
    }

    try {
      if (current.response?.data && typeof current.response.data === "object") {
        queue.push(current.response.data);
      }
    } catch {}
  }

  return output;
}

function pickText(objects = [], keys = []) {
  for (const obj of safeArray(objects)) {
    for (const key of safeArray(keys)) {
      const value = safeText(obj?.[key], "");
      if (value) return value;
    }
  }

  return "";
}

function pickObject(objects = [], keys = []) {
  for (const obj of safeArray(objects)) {
    for (const key of safeArray(keys)) {
      if (isObject(obj?.[key])) return obj[key];
    }
  }

  return null;
}

function extractRefreshPayload(result = null) {
  if (!result) return {};

  const root = safeObject(result);
  const objects = collectObjects(root);
  const session = pickObject(objects, SESSION_KEYS);

  return {
    token: pickText(objects, TOKEN_KEYS),
    refreshToken: pickText(objects, REFRESH_TOKEN_KEYS),

    sessionId: firstText(
      pickText(objects, ["sessionId", "session_id", "sid"]),
      session?.sessionId,
      session?.session_id,
      session?.sid,
      session?.id
    ),

    sessionUserId: firstText(
      pickText(objects, ["sessionUserId", "session_user_id", "userId", "user_id", "uid", "sub"]),
      session?.sessionUserId,
      session?.session_user_id,
      session?.userId,
      session?.user_id
    ),

    user: pickObject(objects, USER_KEYS),
    session,

    mode: safeText(
      root.mode ||
        root.type ||
        root.status ||
        root.data?.mode ||
        root.data?.type ||
        root.payload?.mode ||
        root.payload?.type ||
        root.result?.mode ||
        root.result?.type ||
        "",
      ""
    ),
  };
}

function isRefreshPositive(result) {
  if (result === true) return true;
  if (!result) return false;

  if (typeof result === "string") {
    return [
      "ok",
      "success",
      "true",
      "refreshed",
      "token_only",
      "token-only",
      "session",
    ].includes(result.trim().toLowerCase());
  }

  const root = safeObject(result);

  if (
    root.ok === true ||
    root.success === true ||
    root.refreshed === true ||
    root.authenticated === true
  ) {
    return true;
  }

  if (root.ok === false || root.success === false || root.error) {
    return false;
  }

  const payload = extractRefreshPayload(root);
  const mode = safeLower(payload.mode, "");

  if (["token_only", "token-only", "session", "refreshed", "success"].includes(mode)) {
    return true;
  }

  return Boolean(
    payload.token ||
      payload.refreshToken ||
      payload.user ||
      payload.sessionId
  );
}

/* =========================================================
   APPLY REFRESH PAYLOAD
========================================================= */

async function callApplySession({ AppCore, Auth, payload, options }) {
  const attempts = [
    () => Auth?.applySession?.(payload, options),
    () => Auth?.applySession?.({ ...payload, ...options }),
    () => AppCore?.applySession?.(payload, options),
    () => AppCore?.applySession?.({ ...payload, ...options }),
  ];

  for (const attempt of attempts) {
    try {
      const result = await attempt();

      if (result !== false && result !== undefined) {
        return true;
      }
    } catch {}
  }

  return false;
}

async function applyRefreshPayloadIfNeeded({
  AppCore,
  Auth,
  config,
  requestConfig,
  result,
  context,
  root,
}) {
  const payload = extractRefreshPayload(result);

  const hasPayload = Boolean(
    payload.token ||
      payload.refreshToken ||
      payload.user ||
      payload.sessionId ||
      payload.sessionUserId ||
      payload.session
  );

  if (!hasPayload) return false;

  const sessionPayload = {
    token: payload.token || undefined,
    accessToken: payload.token || undefined,
    access_token: payload.token || undefined,

    refreshToken: payload.refreshToken || undefined,
    refresh_token: payload.refreshToken || undefined,

    sessionId: payload.sessionId || undefined,
    session_id: payload.sessionId || undefined,

    sessionUserId: payload.sessionUserId || undefined,
    session_user_id: payload.sessionUserId || undefined,

    session: payload.session || undefined,
    sessionData: payload.session || undefined,

    user: payload.user || undefined,
    usuario: payload.user || undefined,
  };

  const options = {
    source: "http.auth",
    reason: DEFAULT_REFRESH_REASON,

    preserveExistingUser: !payload.user,
    allowTokenOnly: true,

    silent: true,
    emit: false,
    emitRepair: false,

    skipNavigation: true,
    skipRedirect: true,
    skipPostRestoreNavigation: true,
  };

  let applied = await callApplySession({
    AppCore,
    Auth,
    payload: sessionPayload,
    options,
  });

  if (!applied && payload.token) {
    try {
      if (isFn(Auth?.setToken)) {
        applied = Auth.setToken(payload.token, { source: "http.auth", silent: true }) !== false;
      }
    } catch {}
  }

  if (!applied && payload.token) {
    try {
      if (isFn(AppCore?.setToken)) {
        applied = AppCore.setToken(payload.token, { source: "http.auth", silent: true }) !== false;
      }
    } catch {}
  }

  if (!applied && payload.user) {
    try {
      if (isFn(AppCore?.setUser)) {
        applied = AppCore.setUser(payload.user, { source: "http.auth", silent: true }) !== false;
      }
    } catch {}
  }

  if (applied) {
    markApplied(root, AppCore, config, requestConfig, context, {
      hasToken: Boolean(payload.token),
      hasUser: Boolean(payload.user),
      hasUsableUser: hasUsableUser(payload.user),
      hasRefreshToken: Boolean(payload.refreshToken),
      hasSessionId: Boolean(payload.sessionId),
      hasSessionUserId: Boolean(payload.sessionUserId),
    });
  }

  return applied;
}

/* =========================================================
   DIRECT REFRESH FALLBACK
========================================================= */

function normalizeApiOrigin(value = "") {
  const raw = safeText(value, "");

  if (!raw) return DEFAULT_API_ORIGIN;

  try {
    const parsed = new URL(raw);
    const origin = parsed.origin.replace(/\/+$/g, "");
    const pathname = (parsed.pathname || "/").replace(/\/+$/g, "") || "/";

    if (pathname === "/" || pathname === "/api") return origin;

    return `${origin}${pathname}`;
  } catch {
    return DEFAULT_API_ORIGIN;
  }
}

function resolveApiOrigin(AppCore = null, config = {}) {
  return normalizeApiOrigin(
    config?.apiBase ||
      config?.apiOrigin ||
      config?.apiUrl ||
      AppCore?.config?.apiBase ||
      AppCore?.config?.apiOrigin ||
      AppCore?.config?.apiUrl ||
      AppCore?.config?.api?.base ||
      AppCore?.config?.api?.baseUrl ||
      DEFAULT_API_ORIGIN
  );
}

function resolveRefreshEndpoint(AppCore = null, Auth = null) {
  const endpoint = safeText(
    Auth?.AUTH_ENDPOINTS?.refresh ||
      Auth?.AUTH_CONSTANTS?.endpoints?.refresh ||
      AppCore?.config?.auth?.endpoints?.refresh ||
      AppCore?.config?.auth?.refreshEndpoint ||
      DEFAULT_REFRESH_ENDPOINT,
    DEFAULT_REFRESH_ENDPOINT
  );

  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  if (endpoint.startsWith("/api/")) return endpoint;
  if (endpoint.startsWith("/auth/")) return `/api${endpoint}`;
  if (endpoint.startsWith("/")) return `/api/auth${endpoint}`;

  return `/api/auth/${endpoint}`;
}

function buildDirectRefreshUrl(AppCore = null, Auth = null, config = {}) {
  const endpoint = resolveRefreshEndpoint(AppCore, Auth);

  if (/^https?:\/\//i.test(endpoint)) return endpoint;

  const origin = resolveApiOrigin(AppCore, config);

  return `${origin}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
}

function buildDirectRefreshBody(AppCore = null, Auth = null) {
  const refreshToken = getRefreshTokenCandidate(AppCore, Auth);
  const sessionId = getSessionIdCandidate(AppCore, Auth);
  const sessionUserId = getSessionUserIdCandidate(AppCore, Auth);

  const body = {};

  if (hasUsableToken(refreshToken)) {
    body.refreshToken = refreshToken;
    body.refresh_token = refreshToken;
  }

  if (sessionId) {
    body.sessionId = sessionId;
    body.session_id = sessionId;
  }

  if (sessionUserId) {
    body.sessionUserId = sessionUserId;
    body.session_user_id = sessionUserId;
    body.userId = sessionUserId;
    body.user_id = sessionUserId;
  }

  return body;
}

function canUseDirectRefreshFallback(AppCore, Auth, config = {}) {
  const cfg = safeObject(config);

  if (cfg.disableDirectRefreshFallback === true) return false;
  if (hasRefreshContext(AppCore, Auth)) return true;

  return allowsCookieRefresh(cfg) && isBrowser();
}

async function directRefreshFetch({
  AppCore,
  Auth,
  config,
  requestConfig,
  root,
  context,
}) {
  const cfg = safeObject(config);

  if (!isBrowser() || typeof fetch !== "function") {
    return markDirectSkipped(root, AppCore, cfg, requestConfig, context, "fetch-unavailable");
  }

  if (!canUseDirectRefreshFallback(AppCore, Auth, cfg)) {
    return markDirectSkipped(root, AppCore, cfg, requestConfig, context, "missing-direct-refresh-context");
  }

  const stats = root.refreshStats;

  stats.directAttempts += 1;
  stats.lastDirectAttemptAt = nowMs();

  const url = buildDirectRefreshUrl(AppCore, Auth, cfg);
  const body = buildDirectRefreshBody(AppCore, Auth);

  const timeoutMs = Math.max(
    1000,
    safeNumber(
      cfg.directRefreshTimeoutMs ||
        cfg.auth?.directRefreshTimeoutMs,
      DEFAULT_DIRECT_REFRESH_TIMEOUT_MS
    )
  );

  const controller = typeof AbortController !== "undefined"
    ? new AbortController()
    : null;

  const timeoutId = controller
    ? setTimeout(() => {
        try {
          controller.abort();
        } catch {}
      }, timeoutMs)
    : null;

  emit(AppCore, cfg, requestConfig, EVENTS.directStart, {
    ...context,
    url: redact(url),
    timeoutMs,
    hasRefreshToken: Boolean(body.refreshToken),
    hasSessionId: Boolean(body.sessionId),
    hasSessionUserId: Boolean(body.sessionUserId),
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      mode: "cors",
      signal: controller?.signal,

      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Onion-Client": "onion-spa",
        "X-Onion-HTTP-Auth-Version": HTTP_AUTH_VERSION,
        "X-Request-Id": requestConfig?.requestId || `refresh_${nowMs()}`,
      },

      body: Object.keys(body).length
        ? JSON.stringify(body)
        : undefined,
    });

    const text = await response.text().catch(() => "");
    let payload = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = {
          ok: response.ok,
          text,
        };
      }
    }

    if (!response.ok) {
      const err = new Error(
        safeText(
          payload?.message ||
            payload?.error?.message ||
            payload?.error ||
            response.statusText,
          `HTTP ${response.status}`
        )
      );

      err.name = "DirectRefreshError";
      err.status = response.status;
      err.code =
        payload?.code ||
        payload?.error?.code ||
        payload?.error ||
        "DIRECT_REFRESH_ERROR";
      err.data = payload;

      throw err;
    }

    stats.directSuccesses += 1;
    stats.lastDirectSuccessAt = nowMs();

    emit(AppCore, cfg, requestConfig, EVENTS.directSuccess, {
      ...context,
      hasPayload: Boolean(payload),
      status: response.status,
    });

    return payload || true;
  } catch (error) {
    stats.directFailures += 1;
    stats.lastDirectFailureAt = nowMs();

    emit(AppCore, cfg, requestConfig, EVENTS.directError, {
      ...context,
      error: normalizeError({
        ...safeObject(error),
        name: error?.name,
        message: error?.name === "AbortError"
          ? `Direct refresh timeout tras ${timeoutMs}ms.`
          : error?.message,
        status: error?.status,
        code: error?.name === "AbortError"
          ? "DIRECT_REFRESH_TIMEOUT"
          : error?.code,
        timeout: error?.name === "AbortError",
        aborted: error?.name === "AbortError",
        url,
      }),
    });

    return false;
  } finally {
    if (timeoutId) {
      try {
        clearTimeout(timeoutId);
      } catch {}
    }
  }
}

/* =========================================================
   REFRESH METHOD CALL
========================================================= */

function buildRefreshArgs({ AppCore, requestConfig, error, methodName = "" }) {
  return {
    silent: true,
    notify: false,
    notifyServer: false,

    reason: DEFAULT_REFRESH_REASON,
    requestId: requestConfig?.requestId || null,
    source: "http.auth",
    method: methodName,

    error,
    requestConfig: sanitizeRequestContext(requestConfig),
    AppCore,

    auth: false,
    public: true,
    skipAuth: true,
    noAuthHeader: true,

    _skipAuthRefresh: true,
    skipAuthRefresh: true,
    noAutoRefresh: true,
    autoRefresh: false,
    autoLogout: false,

    _skipRetry: true,
    skipRetry: true,
    retry: false,
    retries: 0,

    useLoader: false,
    noLoader: true,
    background: true,

    emitEvents: false,
    emitFinalEvents: false,
    emitLifecycleEvents: false,

    skipNavigation: true,
    skipRedirect: true,
    skipPostRestoreNavigation: true,
    preserveRoute: true,
    preserveCurrentRoute: true,

    directRefreshFallback: false,
  };
}

async function callRefreshSession({ Auth, AppCore, requestConfig, error }) {
  if (!Auth) return false;

  const methodName = REFRESH_METHODS.find((name) => isFn(Auth?.[name]));

  if (!methodName) return false;

  return Auth[methodName].call(
    Auth,
    buildRefreshArgs({
      AppCore,
      requestConfig,
      error,
      methodName,
    })
  );
}

/* =========================================================
   SKIP RULES
========================================================= */

function isRequestSignalAborted(requestConfig = {}) {
  try {
    return Boolean(requestConfig?.signal?.aborted);
  } catch {
    return false;
  }
}

function shouldSkipRefresh({
  AppCore,
  Auth,
  config,
  error,
  requestConfig,
  context,
  root,
}) {
  const cfg = safeObject(config);
  const req = safeObject(requestConfig);

  const status = safeNumber(error?.status || error?.statusCode, 0);

  if (cfg.autoRefreshOn401 === false) {
    return markSkipped(root, AppCore, cfg, req, context, "auto-refresh-disabled");
  }

  if (status !== 401) {
    return markSkipped(root, AppCore, cfg, req, context, "status-not-401");
  }

  if (error?.aborted === true || error?.name === "AbortError" || isRequestSignalAborted(req)) {
    return markSkipped(root, AppCore, cfg, req, context, "request-aborted");
  }

  if (error?.timeout === true || error?.code === "TIMEOUT") {
    return markSkipped(root, AppCore, cfg, req, context, "request-timeout");
  }

  if (req.public === true) {
    return markSkipped(root, AppCore, cfg, req, context, "public-request");
  }

  if (req.auth === false) {
    return markSkipped(root, AppCore, cfg, req, context, "auth-disabled-request");
  }

  if (req.skipAuth === true) {
    return markSkipped(root, AppCore, cfg, req, context, "skip-auth-request");
  }

  if (req._skipAuthRefresh === true || req.skipAuthRefresh === true) {
    return markSkipped(root, AppCore, cfg, req, context, "skip-auth-refresh-flag");
  }

  if (req.noAutoRefresh === true || req.autoRefresh === false) {
    return markSkipped(root, AppCore, cfg, req, context, "auto-refresh-disabled-request");
  }

  if (req._authRefreshAttempted === true) {
    return markSkipped(root, AppCore, cfg, req, context, "auth-refresh-already-attempted");
  }

  const path = getRequestPath(req);

  if (!isAuthMeEndpoint(path)) {
    if (isAuthRefreshControlEndpoint(path)) {
      return markSkipped(root, AppCore, cfg, req, context, "auth-control-endpoint");
    }

    if (isPublicAuthEndpoint(path)) {
      return markSkipped(root, AppCore, cfg, req, context, "public-auth-endpoint");
    }
  }

  if (isTechnicalPublicRoute(path)) {
    return markSkipped(root, AppCore, cfg, req, context, "technical-public-route");
  }

  if (isPublicEndpoint(path, AppCore)) {
    return markSkipped(root, AppCore, cfg, req, context, "public-endpoint");
  }

  if (!hasRefreshMethod(Auth) && cfg.disableDirectRefreshFallback === true) {
    return markSkipped(root, AppCore, cfg, req, context, "refresh-method-missing");
  }

  if (!hasRefreshCapability(AppCore, Auth, cfg)) {
    return markSkipped(root, AppCore, cfg, req, context, "missing-refresh-capability");
  }

  return null;
}

/* =========================================================
   EXECUTION
========================================================= */

async function executeRefresh({
  AppCore,
  Auth,
  config,
  requestConfig,
  error,
  root,
  context,
}) {
  const cfg = safeObject(config);

  let authError = null;
  let result = false;

  if (hasRefreshMethod(Auth)) {
    try {
      result = await callRefreshSession({
        Auth,
        AppCore,
        requestConfig,
        error,
      });
    } catch (err) {
      authError = err;
      result = false;
    }
  }

  if (isRefreshPositive(result)) {
    return result;
  }

  if (canUseDirectRefreshFallback(AppCore, Auth, cfg)) {
    const direct = await directRefreshFetch({
      AppCore,
      Auth,
      config: cfg,
      requestConfig,
      root,
      context,
    });

    if (isRefreshPositive(direct)) {
      return direct;
    }
  } else {
    markDirectSkipped(
      root,
      AppCore,
      cfg,
      requestConfig,
      context,
      "direct-refresh-not-allowed"
    );
  }

  if (authError) throw authError;

  return false;
}

/* =========================================================
   MAIN API
========================================================= */

export async function runAutoRefreshIfNeeded({
  AppCore,
  Auth,
  config,
  state,
  error,
  requestConfig,
} = {}) {
  const root = getRoot(state);
  const stats = root.refreshStats;

  const cfg = safeObject(config);
  const req = safeObject(requestConfig);
  const context = sanitizeRequestContext(req);

  const startedAt = nowMs();

  try {
    const skipped = shouldSkipRefresh({
      AppCore,
      Auth,
      config: cfg,
      error,
      requestConfig: req,
      context,
      root,
    });

    if (skipped === false) {
      return false;
    }

    if (root.refreshPromise) {
      stats.joined += 1;
      stats.lastJoinAt = nowMs();

      emit(AppCore, cfg, req, EVENTS.join, {
        ...context,
        reason: "refresh-in-flight",
      });

      try {
        const joinedResult = await root.refreshPromise;

        await applyRefreshPayloadIfNeeded({
          AppCore,
          Auth,
          config: cfg,
          requestConfig: req,
          result: joinedResult,
          context,
          root,
        });

        const refreshed = isRefreshPositive(joinedResult);
        const authenticated = isAuthenticatedEnough(AppCore, Auth);
        const hasAccessToken = hasUsableAccessToken(AppCore, Auth);
        const hasRefresh = hasRefreshContext(AppCore, Auth);
        const ok = Boolean(refreshed && hasAccessToken);

        emit(AppCore, cfg, req, ok ? EVENTS.joinSuccess : EVENTS.joinFailed, {
          ...context,
          refreshed,
          authenticated,
          hasAccessToken,
          hasRefreshContext: hasRefresh,
          durationMs: nowMs() - startedAt,
        });

        return ok;
      } catch (joinError) {
        markFailure(
          root,
          AppCore,
          cfg,
          req,
          context,
          joinError,
          EVENTS.joinError,
          {
            durationMs: nowMs() - startedAt,
          }
        );

        return false;
      }
    }

    const minIntervalMs = safeNumber(cfg.refreshMinIntervalMs, 0);

    if (
      minIntervalMs > 0 &&
      stats.lastAttemptAt > 0 &&
      startedAt - stats.lastAttemptAt < minIntervalMs
    ) {
      return markSkipped(root, AppCore, cfg, req, context, "refresh-rate-limited");
    }

    stats.attempts += 1;
    stats.lastAttemptAt = startedAt;
    stats.lastError = null;

    emit(AppCore, cfg, req, EVENTS.start, {
      ...context,
      attempt: stats.attempts,
      authenticatedBefore: isAuthenticatedEnough(AppCore, Auth),
      hasAccessTokenBefore: hasUsableAccessToken(AppCore, Auth),
      hasRefreshContextBefore: hasRefreshContext(AppCore, Auth),
    });

    root.refreshPromise = Promise.resolve()
      .then(() =>
        executeRefresh({
          AppCore,
          Auth,
          config: cfg,
          requestConfig: req,
          error,
          root,
          context,
        })
      )
      .finally(() => {
        root.refreshPromise = null;
      });

    const refreshResult = await root.refreshPromise;

    await applyRefreshPayloadIfNeeded({
      AppCore,
      Auth,
      config: cfg,
      requestConfig: req,
      result: refreshResult,
      context,
      root,
    });

    const refreshed = isRefreshPositive(refreshResult);
    const authenticated = isAuthenticatedEnough(AppCore, Auth);
    const hasAccessToken = hasUsableAccessToken(AppCore, Auth);
    const hasRefresh = hasRefreshContext(AppCore, Auth);

    const ok = Boolean(refreshed && hasAccessToken);

    if (!ok) {
      markFailure(
        root,
        AppCore,
        cfg,
        req,
        context,
        {
          name: "RefreshRejected",
          message: "Refresh finalizado sin access token usable.",
          status: 401,
          refreshed,
          authenticated,
          hasAccessToken,
          hasRefreshContext: hasRefresh,
        },
        EVENTS.rejected,
        {
          refreshed,
          authenticated,
          hasAccessToken,
          hasRefreshContext: hasRefresh,
          durationMs: nowMs() - startedAt,
        }
      );

      return false;
    }

    markSuccess(root, AppCore, cfg, req, context, {
      refreshed,
      authenticated,
      hasAccessToken,
      hasRefreshContext: hasRefresh,
      durationMs: nowMs() - startedAt,
    });

    return true;
  } catch (refreshError) {
    warn(AppCore, "HTTP auto-refresh falló.", refreshError);

    markFailure(
      root,
      AppCore,
      cfg,
      req,
      context,
      refreshError,
      EVENTS.error,
      {
        durationMs: nowMs() - startedAt,
      }
    );

    return false;
  }
}

/* =========================================================
   DEBUG
========================================================= */

export function getHttpAuthSnapshot(stateRef) {
  const root = getRoot(stateRef);
  const stats = root.refreshStats;

  return sanitize({
    version: HTTP_AUTH_VERSION,

    refreshInFlight: Boolean(root.refreshPromise),

    endpointPolicy: {
      authMePrivate: true,
      authMeEndpoints: AUTH_ME_ENDPOINTS,

      publicAuthMarkers: PUBLIC_AUTH_MARKERS.length,
      authRefreshControlMarkers: AUTH_CONTROL_MARKERS.length,

      technicalPublicRoutes: TECHNICAL_PUBLIC_ROUTES,

      refreshMethods: REFRESH_METHODS,
      restoreSessionExcluded: true,
      browserDoesNotImplyRefreshCapability: true,
    },

    refreshStats: {
      ...stats,

      lastAttemptAtIso: stats.lastAttemptAt ? isoNow(stats.lastAttemptAt) : "",
      lastSuccessAtIso: stats.lastSuccessAt ? isoNow(stats.lastSuccessAt) : "",
      lastFailureAtIso: stats.lastFailureAt ? isoNow(stats.lastFailureAt) : "",
      lastSkipAtIso: stats.lastSkipAt ? isoNow(stats.lastSkipAt) : "",
      lastJoinAtIso: stats.lastJoinAt ? isoNow(stats.lastJoinAt) : "",
      lastAppliedAtIso: stats.lastAppliedAt ? isoNow(stats.lastAppliedAt) : "",

      lastDirectAttemptAtIso: stats.lastDirectAttemptAt ? isoNow(stats.lastDirectAttemptAt) : "",
      lastDirectSuccessAtIso: stats.lastDirectSuccessAt ? isoNow(stats.lastDirectSuccessAt) : "",
      lastDirectFailureAtIso: stats.lastDirectFailureAt ? isoNow(stats.lastDirectFailureAt) : "",
      lastDirectSkipAtIso: stats.lastDirectSkipAt ? isoNow(stats.lastDirectSkipAt) : "",

      lastError: stats.lastError || null,
    },
  });
}

export function resetHttpAuthRuntime(stateRef) {
  const root = getRoot(stateRef);

  root.refreshPromise = null;
  root.refreshStats = createRefreshStats();

  return true;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  HTTP_AUTH_VERSION,

  runAutoRefreshIfNeeded,

  getHttpAuthSnapshot,
  resetHttpAuthRuntime,

  normalizeEndpointPath,
  isAuthEndpoint,
  isAuthMeEndpoint,
  isPublicAuthEndpoint,
  isAuthRefreshControlEndpoint,
  isTechnicalPublicRoute,
  isPublicEndpoint,
};
