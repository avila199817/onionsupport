/* =========================================================
   Onion SPA - HTTP Auth
   Archivo: src/services/http.auth.js

   ONION SUPPORT · HTTP AUTH
   AUTO REFRESH 401 · SINGLE FLIGHT · PUBLIC ENDPOINT SAFE · 15/10

   Responsabilidades:
   - Resolver auto refresh ante respuestas 401 privadas.
   - Evitar refresh duplicados concurrentes.
   - Excluir endpoints auth de control del auto refresh.
   - Excluir endpoints públicos técnicos del auto refresh.
   - Excluir requests public/auth:false.
   - Mantener /api/auth/me, /auth/me, /api/me y /me como endpoints privados.
   - No hacer logout aquí.
   - Devolver true/false limpio al HTTP Service.
   - Mantener stats de refresh para diagnóstico.

   Contrato:
   runAutoRefreshIfNeeded({
     AppCore,
     Auth,
     config,
     state,
     error,
     requestConfig,
   }) => Promise<boolean>

   HARDENING EXTREMO:
   - No refrescar requests abortadas.
   - No refrescar timeouts.
   - No refrescar si status !== 401.
   - No refrescar si ya se intentó refresh.
   - No refrescar login/refresh/logout/activation/reset/2FA/health.
   - /api/auth/me, /auth/me, /api/me y /me NO son públicos.
   - No refrescar endpoints públicos técnicos.
   - No refrescar requests public/auth:false.
   - Serializar refresh concurrente.
   - Rate-limit opcional.
   - Soporte Auth.refreshSession / refresh / refreshToken / restoreSession.
   - Soporte refresh que devuelve boolean, token_only o payload completo.
   - Aplica payload de sesión si el refresh devuelve token/user/session.
   - Valida access token usable tras refresh antes de replay.
   - Eventos internos opt-in para evitar storms.
   - Eventos sin tokens reales.
   - Stats consistentes.
   - Fallback si state no existe.
   - Cero throws accidentales.
========================================================= */

import {
  isFn,
  redactHttpValue,
  sanitizeData,
} from "./http.helpers.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

export const HTTP_AUTH_VERSION =
  "15.0.0";

const LOG_PREFIX =
  "[HTTP Auth]";

const DEFAULT_REFRESH_REASON =
  "http-auto-refresh";

const EVENTS =
  Object.freeze({
    skipped:
      "http:auto-refresh:skipped",

    join:
      "http:auto-refresh:join",

    joinSuccess:
      "http:auto-refresh:join-success",

    joinFailed:
      "http:auto-refresh:join-failed",

    joinError:
      "http:auto-refresh:join-error",

    start:
      "http:auto-refresh:start",

    success:
      "http:auto-refresh:success",

    rejected:
      "http:auto-refresh:rejected",

    error:
      "http:auto-refresh:error",

    applied:
      "http:auto-refresh:applied",
  });

const BAD_TOKEN_VALUES =
  Object.freeze([
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

const REFRESH_METHOD_CANDIDATES =
  Object.freeze([
    "refreshSession",
    "refresh",
    "refreshToken",
    "restoreSession",
  ]);

const AUTH_ME_ENDPOINTS =
  Object.freeze([
    "/me",
    "/api/me",
    "/auth/me",
    "/api/auth/me",
  ]);

const AUTH_REFRESH_CONTROL_MARKERS =
  Object.freeze([
    "/auth/login",
    "/auth/refresh",
    "/auth/logout",
    "/auth/logout-all",

    "/auth/2fa/login",
    "/auth/mfa/login",
    "/auth/otp/login",

    "/auth/activate",
    "/auth/activate-account",
    "/auth/account/activate",
    "/auth/activation",
    "/auth/activate/first-user",

    "/auth/reset-password",
    "/auth/reset-password-request",
    "/auth/reset-password-confirm",
    "/auth/password-reset",
    "/auth/forgot-password",
    "/auth/recover-password",

    "/auth/_health",
  ]);

const PUBLIC_AUTH_ENDPOINT_MARKERS =
  Object.freeze([
    "/auth/login",
    "/auth/refresh",

    "/auth/2fa/login",
    "/auth/mfa/login",
    "/auth/otp/login",

    "/auth/activate",
    "/auth/activate-account",
    "/auth/account/activate",
    "/auth/activation",
    "/auth/activate/first-user",

    "/auth/reset-password",
    "/auth/reset-password-request",
    "/auth/reset-password-confirm",
    "/auth/password-reset",
    "/auth/forgot-password",
    "/auth/recover-password",

    "/auth/_health",
  ]);

const TECHNICAL_PUBLIC_ROUTES =
  Object.freeze([
    "/activate-account",
    "/reset-password",
    "/forgot-password",
    "/recover-password",
    "/password-reset",
    "/reset-password/confirm",
  ]);

/* =========================================================
   MODULE FALLBACK STATE
========================================================= */

const fallbackRefreshState = {
  refreshPromise:
    null,

  refreshStats:
    createRefreshStats(),
};

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isAnyObject(value) {
  return (
    value !== null &&
    typeof value === "object"
  );
}

function safeObject(value, fallback = {}) {
  return isObject(value)
    ? value
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
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
    return Object.prototype.hasOwnProperty.call(
      obj,
      key
    );
  } catch {
    return false;
  }
}

function safeRedact(value = "") {
  try {
    return redactHttpValue(value);
  } catch {
    return safeText(value, "");
  }
}

/* =========================================================
   EVENT POLICY
========================================================= */

function getDiagnostics(AppCore = null) {
  try {
    return AppCore?.config?.diagnostics || {};
  } catch {
    return {};
  }
}

function shouldEmitAuthEvent(AppCore = null, config = {}, requestConfig = {}, eventName = "") {
  const cfg =
    safeObject(config);

  const req =
    safeObject(requestConfig);

  if (req.emitEvents === false) {
    return false;
  }

  if (
    req.emitAuthRefreshEvents === true ||
    req.emitAutoRefreshEvents === true ||
    req.debugAuthRefreshEvents === true
  ) {
    return true;
  }

  if (
    cfg.emitAuthRefreshEvents === true ||
    cfg.emitAutoRefreshEvents === true ||
    cfg.debugAuthRefreshEvents === true
  ) {
    return true;
  }

  const diagnostics =
    getDiagnostics(AppCore);

  return Boolean(
    diagnostics.httpAuthEvents === true ||
      diagnostics.httpAutoRefreshEvents === true ||
      diagnostics.httpLifecycleEvents === true ||
      AppCore?.config?.debugHttpAuth === true
  );
}

/* =========================================================
   ENDPOINT POLICY
========================================================= */

function getBaseOrigin() {
  try {
    if (
      typeof window !== "undefined" &&
      window.location?.origin
    ) {
      return window.location.origin;
    }
  } catch {}

  return "http://localhost";
}

export function normalizeEndpointPath(path = "") {
  const raw =
    safeText(path, "");

  if (!raw) {
    return "";
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    const clean =
      safeLower(
        parsed.pathname || raw
      )
        .replace(/\/{2,}/g, "/")
        .replace(/\/$/, "");

    return clean || "/";
  } catch {}

  const fallback =
    safeLower(
      raw
        .split("?")[0]
        .split("#")[0] ||
        raw
    )
      .replace(/\/{2,}/g, "/")
      .replace(/\/$/, "");

  return fallback || "/";
}

function stripApiPrefix(path = "") {
  const normalized =
    normalizeEndpointPath(path);

  if (normalized === "/api") {
    return "/";
  }

  if (normalized.startsWith("/api/")) {
    return normalized.slice(4) || "/";
  }

  return normalized;
}

function getComparableEndpointPaths(path = "") {
  const normalized =
    normalizeEndpointPath(path);

  const withoutApi =
    stripApiPrefix(normalized);

  return Array.from(
    new Set([
      normalized,
      withoutApi,
    ].filter(Boolean))
  );
}

function endpointMatches(path = "", markers = []) {
  const candidates =
    getComparableEndpointPaths(path);

  if (!candidates.length) {
    return false;
  }

  return safeArray(markers).some((marker) => {
    const cleanMarker =
      normalizeEndpointPath(marker);

    if (!cleanMarker) {
      return false;
    }

    return candidates.some((candidate) => (
      candidate === cleanMarker ||
      candidate.endsWith(cleanMarker) ||
      candidate.includes(cleanMarker)
    ));
  });
}

export function isAuthMeEndpoint(path = "") {
  const candidates =
    getComparableEndpointPaths(path);

  return candidates.some((candidate) =>
    AUTH_ME_ENDPOINTS.includes(candidate) ||
    candidate.endsWith("/auth/me")
  );
}

export function isPublicAuthEndpoint(path = "") {
  if (isAuthMeEndpoint(path)) {
    return false;
  }

  return endpointMatches(
    path,
    PUBLIC_AUTH_ENDPOINT_MARKERS
  );
}

export function isAuthRefreshControlEndpoint(path = "") {
  if (isAuthMeEndpoint(path)) {
    return false;
  }

  return endpointMatches(
    path,
    AUTH_REFRESH_CONTROL_MARKERS
  );
}

export function isTechnicalPublicRoute(path = "") {
  const candidates =
    getComparableEndpointPaths(path);

  if (!candidates.length) {
    return false;
  }

  return TECHNICAL_PUBLIC_ROUTES.some((route) => {
    const clean =
      normalizeEndpointPath(route);

    return candidates.some((candidate) => (
      candidate === clean ||
      candidate.startsWith(`${clean}/`)
    ));
  });
}

export function isPublicEndpoint(path = "", AppCore = null) {
  if (isAuthMeEndpoint(path)) {
    return false;
  }

  if (
    isPublicAuthEndpoint(path) ||
    isTechnicalPublicRoute(path)
  ) {
    return true;
  }

  try {
    if (isFn(AppCore?.utils?.isPublicApiPath)) {
      return Boolean(
        AppCore.utils.isPublicApiPath(path)
      );
    }
  } catch {}

  try {
    if (isFn(AppCore?.isPublicApiPath)) {
      return Boolean(
        AppCore.isPublicApiPath(path)
      );
    }
  } catch {}

  return false;
}

export function isAuthEndpoint(path = "") {
  const normalized =
    normalizeEndpointPath(path);

  return (
    normalized.includes("/auth/") ||
    normalized.endsWith("/auth") ||
    isAuthMeEndpoint(path)
  );
}

/* =========================================================
   TOKEN / SESSION HELPERS
========================================================= */

function stripBearer(token = "") {
  return safeText(token, "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function hasUsableToken(token = "") {
  const value =
    stripBearer(token);

  if (!value) {
    return false;
  }

  const lower =
    value.toLowerCase();

  if (BAD_TOKEN_VALUES.includes(lower)) {
    return false;
  }

  if (/[\s\r\n\t]/.test(value)) {
    return false;
  }

  return true;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text =
      safeText(value, "");

    if (text) {
      return text;
    }
  }

  return "";
}

function firstObject(...values) {
  for (const value of values) {
    if (isObject(value)) {
      return value;
    }
  }

  return null;
}

function hasUsableUser(user = null) {
  const source =
    safeObject(user, null);

  if (!source) {
    return false;
  }

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

  const status =
    safeLower(
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

/* =========================================================
   EVENTS / LOGS
========================================================= */

function safeEmit(AppCore, config, requestConfig, eventName = "", payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  if (!shouldEmitAuthEvent(AppCore, config, requestConfig, name)) {
    return false;
  }

  try {
    AppCore?.events?.emit?.(
      name,
      sanitizeData({
        version:
          HTTP_AUTH_VERSION,

        at:
          isoNow(),

        ...safeObject(payload),
      })
    );

    return true;
  } catch {}

  return false;
}

function safeWarn(AppCore, ...args) {
  const safeArgs =
    args.map((item) =>
      sanitizeData(item)
    );

  try {
    AppCore?.utils?.warn?.(
      LOG_PREFIX,
      ...safeArgs
    );

    return;
  } catch {}

  try {
    if (
      AppCore?.config?.debug === true ||
      AppCore?.config?.debugHttpAuth === true
    ) {
      console.warn(
        LOG_PREFIX,
        ...safeArgs
      );
    }
  } catch {}
}

/* =========================================================
   SNAPSHOT SANITIZE
========================================================= */

function normalizeErrorForEvent(error = null) {
  if (!error) {
    return null;
  }

  return sanitizeData({
    name:
      safeText(error?.name, "Error"),

    message:
      safeText(
        error?.message ||
          error?.reason ||
          error,
        "Error"
      ),

    status:
      safeNumber(
        error?.status ||
          error?.statusCode,
        0
      ),

    statusText:
      safeText(error?.statusText, ""),

    code:
      error?.code || null,

    aborted:
      error?.aborted === true,

    timeout:
      error?.timeout === true,

    url:
      safeRedact(error?.url || ""),

    redactedUrl:
      safeRedact(
        error?.redactedUrl ||
          error?.url ||
          ""
      ),
  });
}

function sanitizeRequestContext(requestConfig = {}) {
  const cfg =
    safeObject(requestConfig);

  return {
    requestId:
      safeText(cfg.requestId, ""),

    method:
      safeText(cfg.method, ""),

    path:
      safeRedact(
        cfg.path ||
          cfg.url ||
          ""
      ),

    public:
      cfg.public === true,

    auth:
      cfg.auth !== false,

    skipAuthRefresh:
      cfg._skipAuthRefresh === true,

    authRefreshAttempted:
      cfg._authRefreshAttempted === true,

    authRefreshSucceeded:
      cfg._authRefreshSucceeded === true,

    authRefreshFailed:
      cfg._authRefreshFailed === true,
  };
}

/* =========================================================
   STATE
========================================================= */

function createRefreshStats() {
  return {
    version:
      HTTP_AUTH_VERSION,

    attempts:
      0,

    failures:
      0,

    skipped:
      0,

    joined:
      0,

    successes:
      0,

    applied:
      0,

    lastAttemptAt:
      0,

    lastSuccessAt:
      0,

    lastFailureAt:
      0,

    lastSkipAt:
      0,

    lastJoinAt:
      0,

    lastAppliedAt:
      0,

    lastSkipReason:
      "",

    lastError:
      null,
  };
}

function normalizeStats(stats = {}) {
  const target =
    isObject(stats)
      ? stats
      : {};

  const defaults =
    createRefreshStats();

  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in target)) {
      target[key] = value;
    }
  }

  target.version =
    HTTP_AUTH_VERSION;

  return target;
}

function getRootRefreshState(state) {
  const root =
    state &&
    typeof state === "object"
      ? state
      : fallbackRefreshState;

  root.refreshStats =
    normalizeStats(root.refreshStats);

  if (!hasOwn(root, "refreshPromise")) {
    root.refreshPromise =
      null;
  }

  return root;
}

function markSkipped(root, AppCore, config, requestConfig, context, reason) {
  const stats =
    root.refreshStats;

  stats.skipped =
    safeNumber(stats.skipped, 0) + 1;

  stats.lastSkipAt =
    nowMs();

  stats.lastSkipReason =
    safeText(reason, "unknown");

  safeEmit(
    AppCore,
    config,
    requestConfig,
    EVENTS.skipped,
    {
      ...context,

      reason:
        stats.lastSkipReason,
    }
  );

  return false;
}

function markFailure(root, AppCore, config, requestConfig, context, error, eventName = EVENTS.error, extra = {}) {
  const stats =
    root.refreshStats;

  stats.failures =
    safeNumber(stats.failures, 0) + 1;

  stats.lastFailureAt =
    nowMs();

  stats.lastError =
    normalizeErrorForEvent(error);

  safeEmit(
    AppCore,
    config,
    requestConfig,
    eventName,
    {
      ...context,

      ...safeObject(extra),

      error:
        stats.lastError,
    }
  );

  return false;
}

function markSuccess(root, AppCore, config, requestConfig, context, extra = {}) {
  const stats =
    root.refreshStats;

  stats.successes =
    safeNumber(stats.successes, 0) + 1;

  stats.lastSuccessAt =
    nowMs();

  stats.lastError =
    null;

  safeEmit(
    AppCore,
    config,
    requestConfig,
    EVENTS.success,
    {
      ...context,

      refreshed:
        true,

      authenticated:
        extra.authenticated === true,

      hasAccessToken:
        extra.hasAccessToken === true,

      hasRefreshContext:
        extra.hasRefreshContext === true,

      ...safeObject(extra),
    }
  );

  return true;
}

function markApplied(root, AppCore, config, requestConfig, context, extra = {}) {
  const stats =
    root.refreshStats;

  stats.applied =
    safeNumber(stats.applied, 0) + 1;

  stats.lastAppliedAt =
    nowMs();

  safeEmit(
    AppCore,
    config,
    requestConfig,
    EVENTS.applied,
    {
      ...context,

      ...safeObject(extra),
    }
  );

  return true;
}

/* =========================================================
   APPCORE / AUTH HELPERS
========================================================= */

function getCoreState(AppCore) {
  try {
    if (isFn(AppCore?.getState)) {
      return AppCore.getState({
        includeToken:
          true,
      });
    }
  } catch {}

  try {
    return AppCore?.state || {};
  } catch {
    return {};
  }
}

function getAuthHeaderFrom(source) {
  try {
    if (isFn(source?.getAuthHeader)) {
      const header =
        source.getAuthHeader();

      if (
        header &&
        typeof header === "object"
      ) {
        return header;
      }
    }
  } catch {}

  return {};
}

function hasTokenInHeader(header = {}) {
  if (!header || typeof header !== "object") {
    return false;
  }

  return Object.values(header).some((value) =>
    hasUsableToken(
      String(value || "")
        .replace(/^Bearer\s+/i, "")
    )
  );
}

function getStateToken(AppCore) {
  const state =
    getCoreState(AppCore);

  return firstNonEmpty(
    state.token,
    state.accessToken,
    state.access_token,
    state.session?.token,
    state.session?.accessToken,
    state.session?.access_token
  );
}

function hasUsableAccessToken(AppCore, Auth) {
  if (
    hasTokenInHeader(
      getAuthHeaderFrom(Auth)
    )
  ) {
    return true;
  }

  if (
    hasTokenInHeader(
      getAuthHeaderFrom(AppCore)
    )
  ) {
    return true;
  }

  return hasUsableToken(
    getStateToken(AppCore)
  );
}

function isAuthenticatedEnough(AppCore, Auth) {
  try {
    if (isFn(Auth?.isAuthenticated)) {
      return Boolean(Auth.isAuthenticated());
    }
  } catch {}

  const state =
    getCoreState(AppCore);

  return Boolean(
    state?.authenticated
  );
}

function getRefreshTokenCandidate(AppCore, Auth) {
  try {
    if (isFn(Auth?.getStoredRefreshToken)) {
      const token =
        Auth.getStoredRefreshToken();

      if (hasUsableToken(token)) {
        return token;
      }
    }
  } catch {}

  try {
    if (isFn(Auth?.getRefreshToken)) {
      const token =
        Auth.getRefreshToken();

      if (hasUsableToken(token)) {
        return token;
      }
    }
  } catch {}

  const state =
    getCoreState(AppCore);

  return firstNonEmpty(
    state.refreshToken,
    state.refresh_token,
    state.session?.refreshToken,
    state.session?.refresh_token
  );
}

function getSessionIdCandidate(AppCore, Auth) {
  try {
    if (isFn(Auth?.getStoredSessionId)) {
      const sessionId =
        Auth.getStoredSessionId();

      if (safeText(sessionId, "")) {
        return sessionId;
      }
    }
  } catch {}

  const state =
    getCoreState(AppCore);

  return firstNonEmpty(
    state.sessionId,
    state.session_id,
    state.session?.sessionId,
    state.session?.session_id
  );
}

function getSessionUserIdCandidate(AppCore, Auth) {
  try {
    if (isFn(Auth?.getStoredSessionUserId)) {
      const sessionUserId =
        Auth.getStoredSessionUserId();

      if (safeText(sessionUserId, "")) {
        return sessionUserId;
      }
    }
  } catch {}

  const state =
    getCoreState(AppCore);

  return firstNonEmpty(
    state.sessionUserId,
    state.session_user_id,
    state.session?.sessionUserId,
    state.session?.session_user_id,
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

  const refreshToken =
    getRefreshTokenCandidate(
      AppCore,
      Auth
    );

  if (hasUsableToken(refreshToken)) {
    return true;
  }

  const sessionId =
    getSessionIdCandidate(
      AppCore,
      Auth
    );

  const sessionUserId =
    getSessionUserIdCandidate(
      AppCore,
      Auth
    );

  return Boolean(
    safeText(sessionId, "") &&
      safeText(sessionUserId, "")
  );
}

function hasRefreshCapability(AppCore, Auth) {
  return Boolean(
    hasRefreshContext(AppCore, Auth) ||
      hasUsableAccessToken(AppCore, Auth)
  );
}

/* =========================================================
   REFRESH PAYLOAD EXTRACTION
========================================================= */

function extractSessionPayload(value = null) {
  if (!value) {
    return {};
  }

  const root =
    safeObject(value);

  const data =
    safeObject(root.data);

  const payload =
    safeObject(root.payload);

  const result =
    safeObject(root.result);

  const session =
    safeObject(root.session);

  const sessionData =
    safeObject(root.sessionData);

  const dataSession =
    safeObject(data.session);

  const dataSessionData =
    safeObject(data.sessionData);

  const payloadSession =
    safeObject(payload.session);

  const payloadSessionData =
    safeObject(payload.sessionData);

  const auth =
    safeObject(root.auth);

  const dataAuth =
    safeObject(data.auth);

  const user =
    firstObject(
      root.user,
      root.usuario,
      root.me,
      root.account,
      root.profile,

      session.user,
      session.usuario,
      session.me,
      session.account,
      session.profile,

      sessionData.user,
      sessionData.usuario,
      sessionData.me,
      sessionData.account,
      sessionData.profile,

      data.user,
      data.usuario,
      data.me,
      data.account,
      data.profile,

      dataSession.user,
      dataSession.usuario,
      dataSession.me,
      dataSession.account,
      dataSession.profile,

      dataSessionData.user,
      dataSessionData.usuario,
      dataSessionData.me,
      dataSessionData.account,
      dataSessionData.profile,

      payload.user,
      payload.usuario,
      payload.me,
      payload.account,
      payload.profile,

      payloadSession.user,
      payloadSession.usuario,
      payloadSession.me,
      payloadSession.account,
      payloadSession.profile,

      payloadSessionData.user,
      payloadSessionData.usuario,
      payloadSessionData.me,
      payloadSessionData.account,
      payloadSessionData.profile,

      result.user,
      result.usuario,
      result.me,
      result.account,
      result.profile,

      auth.user,
      auth.usuario,
      auth.me,
      dataAuth.user,
      dataAuth.usuario,
      dataAuth.me
    );

  return {
    token:
      firstNonEmpty(
        root.token,
        root.accessToken,
        root.access_token,
        root.jwt,
        root.bearer,

        session.token,
        session.accessToken,
        session.access_token,
        session.jwt,
        session.bearer,

        sessionData.token,
        sessionData.accessToken,
        sessionData.access_token,

        data.token,
        data.accessToken,
        data.access_token,
        data.jwt,
        data.bearer,

        dataSession.token,
        dataSession.accessToken,
        dataSession.access_token,
        dataSession.jwt,
        dataSession.bearer,

        dataSessionData.token,
        dataSessionData.accessToken,
        dataSessionData.access_token,

        payload.token,
        payload.accessToken,
        payload.access_token,
        payload.jwt,
        payload.bearer,

        payloadSession.token,
        payloadSession.accessToken,
        payloadSession.access_token,
        payloadSession.jwt,
        payloadSession.bearer,

        payloadSessionData.token,
        payloadSessionData.accessToken,
        payloadSessionData.access_token,

        result.token,
        result.accessToken,
        result.access_token,

        auth.token,
        auth.accessToken,
        auth.access_token,
        dataAuth.token,
        dataAuth.accessToken,
        dataAuth.access_token
      ),

    refreshToken:
      firstNonEmpty(
        root.refreshToken,
        root.refresh_token,
        session.refreshToken,
        session.refresh_token,
        sessionData.refreshToken,
        sessionData.refresh_token,
        data.refreshToken,
        data.refresh_token,
        dataSession.refreshToken,
        dataSession.refresh_token,
        payload.refreshToken,
        payload.refresh_token,
        payloadSession.refreshToken,
        payloadSession.refresh_token,
        result.refreshToken,
        result.refresh_token,
        auth.refreshToken,
        auth.refresh_token,
        dataAuth.refreshToken,
        dataAuth.refresh_token
      ),

    sessionId:
      firstNonEmpty(
        root.sessionId,
        root.session_id,
        session.sessionId,
        session.session_id,
        session.id,
        sessionData.sessionId,
        sessionData.session_id,
        sessionData.id,
        data.sessionId,
        data.session_id,
        dataSession.sessionId,
        dataSession.session_id,
        dataSession.id,
        payload.sessionId,
        payload.session_id,
        payloadSession.sessionId,
        payloadSession.session_id
      ),

    sessionUserId:
      firstNonEmpty(
        root.sessionUserId,
        root.session_user_id,
        root.userId,
        root.user_id,
        session.sessionUserId,
        session.session_user_id,
        session.userId,
        session.user_id,
        sessionData.sessionUserId,
        sessionData.session_user_id,
        sessionData.userId,
        sessionData.user_id,
        data.sessionUserId,
        data.session_user_id,
        data.userId,
        data.user_id,
        dataSession.sessionUserId,
        dataSession.session_user_id,
        payload.sessionUserId,
        payload.session_user_id,
        payload.userId,
        payload.user_id,
        payloadSession.sessionUserId,
        payloadSession.session_user_id
      ),

    user:
      user || null,

    mode:
      safeText(
        root.mode ||
          root.type ||
          root.status ||
          data.mode ||
          data.type ||
          payload.mode ||
          payload.type ||
          result.mode ||
          result.type ||
          "",
        ""
      ),
  };
}

function isRefreshResultPositive(result) {
  if (result === true) {
    return true;
  }

  if (!result) {
    return false;
  }

  if (typeof result === "string") {
    return Boolean(
      [
        "ok",
        "success",
        "true",
        "refreshed",
        "token_only",
        "token-only",
        "session",
      ].includes(
        result.trim().toLowerCase()
      )
    );
  }

  const root =
    safeObject(result);

  if (
    root.ok === true ||
    root.success === true ||
    root.refreshed === true ||
    root.authenticated === true
  ) {
    return true;
  }

  const payload =
    extractSessionPayload(root);

  if (
    [
      "token_only",
      "token-only",
      "session",
      "refreshed",
      "success",
    ].includes(
      safeLower(payload.mode, "")
    )
  ) {
    return true;
  }

  return Boolean(
    payload.token ||
      payload.user ||
      payload.refreshToken ||
      payload.sessionId
  );
}

/* =========================================================
   APPLY SESSION
========================================================= */

async function callApplySessionFlexible({
  Auth,
  AppCore,
  sessionPayload,
  options,
}) {
  let applied =
    false;

  try {
    if (isFn(Auth?.applySession)) {
      const applyResult =
        await Auth.applySession(
          sessionPayload,
          options
        );

      applied =
        applyResult !== false;
    }
  } catch {}

  if (!applied) {
    try {
      if (isFn(Auth?.applySession)) {
        const applyResult =
          await Auth.applySession({
            ...sessionPayload,
            ...options,
          });

        applied =
          applyResult !== false;
      }
    } catch {}
  }

  if (!applied) {
    try {
      if (isFn(AppCore?.applySession)) {
        const applyResult =
          AppCore.applySession(
            sessionPayload,
            options
          );

        applied =
          applyResult !== false;
      }
    } catch {}
  }

  if (!applied) {
    try {
      if (isFn(AppCore?.applySession)) {
        const applyResult =
          AppCore.applySession({
            ...sessionPayload,
            ...options,
          });

        applied =
          applyResult !== false;
      }
    } catch {}
  }

  return applied;
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
  const payload =
    extractSessionPayload(result);

  const hasSessionData =
    Boolean(
      payload.token ||
        payload.user ||
        payload.refreshToken ||
        payload.sessionId ||
        payload.sessionUserId
    );

  if (!hasSessionData) {
    return false;
  }

  let applied =
    false;

  const sessionPayload = {
    token:
      payload.token || undefined,

    accessToken:
      payload.token || undefined,

    refreshToken:
      payload.refreshToken || undefined,

    sessionId:
      payload.sessionId || undefined,

    sessionUserId:
      payload.sessionUserId || undefined,

    user:
      payload.user || undefined,
  };

  const options = {
    source:
      "http.auth",

    reason:
      DEFAULT_REFRESH_REASON,

    preserveExistingUser:
      !payload.user,

    skipNavigation:
      true,

    skipPostRestoreNavigation:
      true,
  };

  applied =
    await callApplySessionFlexible({
      Auth,
      AppCore,
      sessionPayload,
      options,
    });

  if (!applied && payload.token) {
    try {
      if (isFn(Auth?.setToken)) {
        const tokenResult =
          Auth.setToken(
            payload.token,
            {
              source:
                "http.auth",
            }
          );

        applied =
          tokenResult !== false;
      }
    } catch {}
  }

  if (!applied && payload.token) {
    try {
      if (isFn(AppCore?.setToken)) {
        const tokenResult =
          AppCore.setToken(
            payload.token,
            {
              source:
                "http.auth",
            }
          );

        applied =
          tokenResult !== false;
      }
    } catch {}
  }

  if (!applied && payload.user) {
    try {
      if (isFn(AppCore?.setUser)) {
        const userResult =
          AppCore.setUser(
            payload.user,
            {
              source:
                "http.auth",
            }
          );

        applied =
          userResult !== false;
      }
    } catch {}
  }

  if (applied) {
    markApplied(
      root,
      AppCore,
      config,
      requestConfig,
      context,
      {
        hasToken:
          Boolean(payload.token),

        hasUser:
          Boolean(payload.user),

        hasUsableUser:
          hasUsableUser(payload.user),

        hasRefreshToken:
          Boolean(payload.refreshToken),

        hasSessionId:
          Boolean(payload.sessionId),

        hasSessionUserId:
          Boolean(payload.sessionUserId),
      }
    );
  }

  return applied;
}

/* =========================================================
   REFRESH CALL
========================================================= */

function buildRefreshArgs({
  AppCore,
  requestConfig,
  error,
  methodName = "",
}) {
  return {
    silent:
      true,

    notify:
      false,

    notifyServer:
      false,

    reason:
      DEFAULT_REFRESH_REASON,

    requestId:
      requestConfig?.requestId || null,

    source:
      "http.auth",

    method:
      methodName,

    error,

    requestConfig:
      sanitizeRequestContext(requestConfig),

    AppCore,

    skipNavigation:
      true,

    skipPostRestoreNavigation:
      true,

    preserveRoute:
      true,
  };
}

async function callRefreshSession({
  Auth,
  AppCore,
  requestConfig,
  error,
}) {
  if (!Auth) {
    return false;
  }

  let lastError =
    null;

  for (const methodName of REFRESH_METHOD_CANDIDATES) {
    const fn =
      Auth?.[methodName];

    if (!isFn(fn)) {
      continue;
    }

    try {
      return await fn.call(
        Auth,
        buildRefreshArgs({
          AppCore,
          requestConfig,
          error,
          methodName,
        })
      );
    } catch (refreshError) {
      lastError =
        refreshError;

      /*
        Si refreshSession existe y falla, no probamos métodos legacy
        para evitar dobles peticiones contra /refresh.
      */
      if (methodName === "refreshSession") {
        throw refreshError;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  return false;
}

function hasRefreshMethod(Auth) {
  return REFRESH_METHOD_CANDIDATES.some((methodName) =>
    isFn(Auth?.[methodName])
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
  const status =
    safeNumber(
      error?.status ||
        error?.statusCode,
      0
    );

  if (config?.autoRefreshOn401 === false) {
    return markSkipped(
      root,
      AppCore,
      config,
      requestConfig,
      context,
      "auto-refresh-disabled"
    );
  }

  if (status !== 401) {
    return markSkipped(
      root,
      AppCore,
      config,
      requestConfig,
      context,
      "status-not-401"
    );
  }

  if (
    error?.aborted === true ||
    isRequestSignalAborted(requestConfig)
  ) {
    return markSkipped(
      root,
      AppCore,
      config,
      requestConfig,
      context,
      "request-aborted"
    );
  }

  if (error?.timeout === true) {
    return markSkipped(
      root,
      AppCore,
      config,
      requestConfig,
      context,
      "request-timeout"
    );
  }

  if (requestConfig?.public === true) {
    return markSkipped(
      root,
      AppCore,
      config,
      requestConfig,
      context,
      "public-request"
    );
  }

  if (requestConfig?.auth === false) {
    return markSkipped(
      root,
      AppCore,
      config,
      requestConfig,
      context,
      "auth-disabled-request"
    );
  }

  if (requestConfig?._skipAuthRefresh === true) {
    return markSkipped(
      root,
      AppCore,
      config,
      requestConfig,
      context,
      "skip-auth-refresh-flag"
    );
  }

  if (requestConfig?._authRefreshAttempted === true) {
    return markSkipped(
      root,
      AppCore,
      config,
      requestConfig,
      context,
      "auth-refresh-already-attempted"
    );
  }

  const path =
    requestConfig?.path ||
    requestConfig?.url ||
    "";

  if (!isAuthMeEndpoint(path)) {
    if (isAuthRefreshControlEndpoint(path)) {
      return markSkipped(
        root,
        AppCore,
        config,
        requestConfig,
        context,
        "auth-control-endpoint"
      );
    }

    if (isPublicAuthEndpoint(path)) {
      return markSkipped(
        root,
        AppCore,
        config,
        requestConfig,
        context,
        "public-auth-endpoint"
      );
    }
  }

  if (isTechnicalPublicRoute(path)) {
    return markSkipped(
      root,
      AppCore,
      config,
      requestConfig,
      context,
      "technical-public-route"
    );
  }

  if (isPublicEndpoint(path, AppCore)) {
    return markSkipped(
      root,
      AppCore,
      config,
      requestConfig,
      context,
      "public-endpoint"
    );
  }

  if (!hasRefreshMethod(Auth)) {
    return markSkipped(
      root,
      AppCore,
      config,
      requestConfig,
      context,
      "refresh-method-missing"
    );
  }

  if (!hasRefreshCapability(AppCore, Auth)) {
    return markSkipped(
      root,
      AppCore,
      config,
      requestConfig,
      context,
      "missing-refresh-capability"
    );
  }

  return null;
}

/* =========================================================
   MAIN
========================================================= */

export async function runAutoRefreshIfNeeded({
  AppCore,
  Auth,
  config,
  state,
  error,
  requestConfig,
} = {}) {
  const root =
    getRootRefreshState(state);

  const stats =
    root.refreshStats;

  const cfg =
    safeObject(config);

  const req =
    safeObject(requestConfig);

  const context =
    sanitizeRequestContext(req);

  const startedAt =
    nowMs();

  try {
    const skipResult =
      shouldSkipRefresh({
        AppCore,
        Auth,
        config:
          cfg,
        error,
        requestConfig:
          req,
        context,
        root,
      });

    if (skipResult === false) {
      return false;
    }

    /* =====================================================
       JOIN EXISTING REFRESH
    ===================================================== */

    if (root.refreshPromise) {
      stats.joined =
        safeNumber(stats.joined, 0) + 1;

      stats.lastJoinAt =
        nowMs();

      safeEmit(
        AppCore,
        cfg,
        req,
        EVENTS.join,
        {
          ...context,

          reason:
            "refresh-in-flight",
        }
      );

      try {
        const joinedResult =
          await root.refreshPromise;

        const refreshed =
          isRefreshResultPositive(joinedResult);

        await applyRefreshPayloadIfNeeded({
          AppCore,
          Auth,
          config:
            cfg,
          requestConfig:
            req,
          result:
            joinedResult,
          context,
          root,
        });

        const authenticated =
          isAuthenticatedEnough(AppCore, Auth);

        const hasAccessToken =
          hasUsableAccessToken(AppCore, Auth);

        const hasRefresh =
          hasRefreshContext(AppCore, Auth);

        const ok =
          Boolean(refreshed && hasAccessToken);

        safeEmit(
          AppCore,
          cfg,
          req,
          ok
            ? EVENTS.joinSuccess
            : EVENTS.joinFailed,
          {
            ...context,

            refreshed,
            authenticated,
            hasAccessToken,
            hasRefreshContext:
              hasRefresh,

            durationMs:
              nowMs() - startedAt,
          }
        );

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
            durationMs:
              nowMs() - startedAt,
          }
        );

        return false;
      }
    }

    /* =====================================================
       RATE LIMIT
    ===================================================== */

    const minIntervalMs =
      safeNumber(
        cfg.refreshMinIntervalMs,
        0
      );

    if (
      minIntervalMs > 0 &&
      stats.lastAttemptAt > 0 &&
      startedAt - stats.lastAttemptAt < minIntervalMs
    ) {
      return markSkipped(
        root,
        AppCore,
        cfg,
        req,
        context,
        "refresh-rate-limited"
      );
    }

    /* =====================================================
       START REFRESH
    ===================================================== */

    stats.attempts =
      safeNumber(stats.attempts, 0) + 1;

    stats.lastAttemptAt =
      startedAt;

    stats.lastError =
      null;

    safeEmit(
      AppCore,
      cfg,
      req,
      EVENTS.start,
      {
        ...context,

        attempt:
          stats.attempts,

        authenticatedBefore:
          isAuthenticatedEnough(AppCore, Auth),

        hasAccessTokenBefore:
          hasUsableAccessToken(AppCore, Auth),

        hasRefreshContextBefore:
          hasRefreshContext(AppCore, Auth),
      }
    );

    root.refreshPromise =
      Promise.resolve()
        .then(() =>
          callRefreshSession({
            Auth,
            AppCore,
            requestConfig:
              req,
            error,
          })
        )
        .finally(() => {
          root.refreshPromise =
            null;
        });

    const refreshResult =
      await root.refreshPromise;

    await applyRefreshPayloadIfNeeded({
      AppCore,
      Auth,
      config:
        cfg,
      requestConfig:
        req,
      result:
        refreshResult,
      context,
      root,
    });

    const refreshed =
      isRefreshResultPositive(refreshResult);

    const authenticated =
      isAuthenticatedEnough(AppCore, Auth);

    const hasAccessToken =
      hasUsableAccessToken(AppCore, Auth);

    const hasRefresh =
      hasRefreshContext(AppCore, Auth);

    /*
      Para que el HTTP Service pueda reintentar la request original,
      la condición mínima es access token usable.
      No exigimos user usable aquí porque algunos refresh devuelven token_only.
    */
    const ok =
      Boolean(
        refreshed &&
          hasAccessToken
      );

    if (!ok) {
      const rejectedError = {
        name:
          "RefreshRejected",

        message:
          "Refresh finalizado sin access token usable.",

        status:
          401,

        refreshed,
        authenticated,
        hasAccessToken,
        hasRefreshContext:
          hasRefresh,
      };

      markFailure(
        root,
        AppCore,
        cfg,
        req,
        context,
        rejectedError,
        EVENTS.rejected,
        {
          refreshed,
          authenticated,
          hasAccessToken,
          hasRefreshContext:
            hasRefresh,

          durationMs:
            nowMs() - startedAt,
        }
      );

      return false;
    }

    markSuccess(
      root,
      AppCore,
      cfg,
      req,
      context,
      {
        refreshed,
        authenticated,
        hasAccessToken,
        hasRefreshContext:
          hasRefresh,

        durationMs:
          nowMs() - startedAt,
      }
    );

    return true;
  } catch (refreshError) {
    safeWarn(
      AppCore,
      "HTTP auto-refresh falló.",
      refreshError
    );

    markFailure(
      root,
      AppCore,
      cfg,
      req,
      context,
      refreshError,
      EVENTS.error,
      {
        durationMs:
          nowMs() - startedAt,
      }
    );

    return false;
  }
}

/* =========================================================
   DEBUG
========================================================= */

export function getHttpAuthSnapshot(state) {
  const root =
    getRootRefreshState(state);

  return sanitizeData({
    version:
      HTTP_AUTH_VERSION,

    refreshInFlight:
      Boolean(root.refreshPromise),

    endpointPolicy: {
      authMePrivate:
        true,

      authMeEndpoints:
        AUTH_ME_ENDPOINTS,

      publicAuthMarkers:
        PUBLIC_AUTH_ENDPOINT_MARKERS.length,

      authRefreshControlMarkers:
        AUTH_REFRESH_CONTROL_MARKERS.length,

      technicalPublicRoutes:
        TECHNICAL_PUBLIC_ROUTES,
    },

    refreshStats: {
      ...root.refreshStats,

      lastAttemptAtIso:
        root.refreshStats.lastAttemptAt
          ? isoNow(root.refreshStats.lastAttemptAt)
          : "",

      lastSuccessAtIso:
        root.refreshStats.lastSuccessAt
          ? isoNow(root.refreshStats.lastSuccessAt)
          : "",

      lastFailureAtIso:
        root.refreshStats.lastFailureAt
          ? isoNow(root.refreshStats.lastFailureAt)
          : "",

      lastSkipAtIso:
        root.refreshStats.lastSkipAt
          ? isoNow(root.refreshStats.lastSkipAt)
          : "",

      lastJoinAtIso:
        root.refreshStats.lastJoinAt
          ? isoNow(root.refreshStats.lastJoinAt)
          : "",

      lastAppliedAtIso:
        root.refreshStats.lastAppliedAt
          ? isoNow(root.refreshStats.lastAppliedAt)
          : "",

      lastError:
        root.refreshStats?.lastError || null,
    },
  });
}

export function resetHttpAuthRuntime(state) {
  const root =
    getRootRefreshState(state);

  root.refreshPromise =
    null;

  root.refreshStats =
    createRefreshStats();

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
