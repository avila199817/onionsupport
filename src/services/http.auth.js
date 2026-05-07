/* =========================================================
   Onion SPA - HTTP Auth
   Archivo: src/services/http.auth.js

   ONION SUPPORT · HTTP AUTH
   AUTO REFRESH 401 · SINGLE FLIGHT · PUBLIC ENDPOINT SAFE

   Responsabilidades:
   - Resolver auto refresh ante respuestas 401 privadas.
   - Evitar refresh duplicados concurrentes.
   - Excluir endpoints auth del auto refresh.
   - Excluir endpoints públicos técnicos del auto refresh.
   - Excluir requests public/auth:false.
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
   - No refrescar endpoints auth.
   - No refrescar endpoints públicos técnicos.
   - No refrescar requests public/auth:false.
   - Serializar refresh concurrente.
   - Rate-limit opcional.
   - Eventos sin tokens reales.
   - Stats consistentes.
   - Fallback si state no existe.
   - Cero throws accidentales.
========================================================= */

import {
  isFn,
  isAuthEndpoint,
  isPublicAuthEndpoint,
  isTechnicalPublicRoute,
  isPublicEndpoint,
  redactHttpValue,
  sanitizeData,
} from "./http.helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const LOG_PREFIX =
  "[HTTP Auth]";

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

const DEFAULT_REFRESH_REASON =
  "http-auto-refresh";

/* =========================================================
   MODULE FALLBACK STATE
========================================================= */

const fallbackRefreshState = {
  refreshPromise:
    null,

  refreshStats: {
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
  },
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

function safeObject(value, fallback = {}) {
  return isObject(value)
    ? value
    : fallback;
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

function safeRedact(value = "") {
  try {
    return redactHttpValue(value);
  } catch {
    return safeText(value, "");
  }
}

/* =========================================================
   EVENTS / LOGS
========================================================= */

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  try {
    AppCore?.events?.emit?.(
      name,
      sanitizeData({
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
  try {
    AppCore?.utils?.warn?.(
      LOG_PREFIX,
      ...args.map((item) => sanitizeData(item))
    );

    return;
  } catch {}

  try {
    console.warn(
      LOG_PREFIX,
      ...args.map((item) => sanitizeData(item))
    );
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

function getRootRefreshState(state) {
  const root =
    state &&
    typeof state === "object"
      ? state
      : fallbackRefreshState;

  if (
    !root.refreshStats ||
    typeof root.refreshStats !== "object"
  ) {
    root.refreshStats =
      createRefreshStats();
  }

  const defaults =
    createRefreshStats();

  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in root.refreshStats)) {
      root.refreshStats[key] = value;
    }
  }

  if (!Object.prototype.hasOwnProperty.call(root, "refreshPromise")) {
    root.refreshPromise =
      null;
  }

  return root;
}

function markSkipped(root, AppCore, context, reason) {
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
    EVENTS.skipped,
    {
      ...context,

      reason:
        stats.lastSkipReason,
    }
  );

  return false;
}

function markFailure(root, AppCore, context, error, eventName = EVENTS.error, extra = {}) {
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

function markSuccess(root, AppCore, context, extra = {}) {
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
    EVENTS.success,
    {
      ...context,

      refreshed:
        true,

      authenticated:
        true,

      hasSession:
        true,

      ...safeObject(extra),
    }
  );

  return true;
}

function markApplied(root, AppCore, context, extra = {}) {
  const stats =
    root.refreshStats;

  stats.applied =
    safeNumber(stats.applied, 0) + 1;

  stats.lastAppliedAt =
    nowMs();

  safeEmit(
    AppCore,
    EVENTS.applied,
    {
      ...context,

      ...safeObject(extra),
    }
  );

  return true;
}

/* =========================================================
   SESSION / AUTH HELPERS
========================================================= */

function getCoreState(AppCore) {
  try {
    if (isFn(AppCore?.getState)) {
      return AppCore.getState();
    }
  } catch {}

  try {
    return AppCore?.state || {};
  } catch {
    return {};
  }
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

function hasUsableAccessToken(AppCore, Auth) {
  try {
    if (isFn(Auth?.getAuthHeader)) {
      const header =
        Auth.getAuthHeader();

      if (
        header &&
        typeof header === "object" &&
        Object.values(header).some((value) =>
          safeText(value, "").length > 0
        )
      ) {
        return true;
      }
    }
  } catch {}

  try {
    if (isFn(AppCore?.getAuthHeader)) {
      const header =
        AppCore.getAuthHeader();

      if (
        header &&
        typeof header === "object" &&
        Object.values(header).some((value) =>
          safeText(value, "").length > 0
        )
      ) {
        return true;
      }
    }
  } catch {}

  const state =
    getCoreState(AppCore);

  return Boolean(
    safeText(
      state?.token ||
        state?.accessToken ||
        state?.access_token ||
        "",
      ""
    )
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

  try {
    if (isFn(Auth?.getStoredRefreshToken)) {
      return Boolean(
        safeText(Auth.getStoredRefreshToken(), "")
      );
    }
  } catch {}

  const state =
    getCoreState(AppCore);

  return Boolean(
    safeText(
      state?.refreshToken ||
        state?.refresh_token ||
        state?.sessionId ||
        state?.sessionUserId ||
        "",
      ""
    )
  );
}

function hasRefreshCapability(AppCore, Auth) {
  return Boolean(
    hasUsableAccessToken(AppCore, Auth) ||
      hasRefreshContext(AppCore, Auth)
  );
}

function extractSessionPayload(value = null) {
  if (!value) {
    return {};
  }

  const root =
    safeObject(value);

  const nested =
    safeObject(
      root.session ||
        root.data ||
        root.payload ||
        root.result ||
        {}
    );

  return {
    token:
      root.token ||
      root.accessToken ||
      root.access_token ||
      nested.token ||
      nested.accessToken ||
      nested.access_token ||
      "",

    refreshToken:
      root.refreshToken ||
      root.refresh_token ||
      nested.refreshToken ||
      nested.refresh_token ||
      "",

    user:
      root.user ||
      root.usuario ||
      root.account ||
      nested.user ||
      nested.usuario ||
      nested.account ||
      null,
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
    return Boolean(safeText(result, ""));
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

  return Boolean(
    payload.token ||
      payload.user
  );
}

async function applyRefreshPayloadIfNeeded({
  AppCore,
  Auth,
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
        payload.refreshToken
    );

  if (!hasSessionData) {
    return false;
  }

  let applied =
    false;

  try {
    if (isFn(Auth?.applySession)) {
      const applyResult =
        await Auth.applySession({
          token:
            payload.token || undefined,

          refreshToken:
            payload.refreshToken || undefined,

          user:
            payload.user || undefined,

          source:
            "http.auth",

          reason:
            DEFAULT_REFRESH_REASON,
        });

      applied =
        applyResult !== false;
    }
  } catch {}

  if (!applied) {
    try {
      if (isFn(AppCore?.applySession)) {
        const applyResult =
          AppCore.applySession(
            {
              token:
                payload.token || undefined,

              user:
                payload.user || undefined,
            },
            {
              source:
                "http.auth",

              reason:
                DEFAULT_REFRESH_REASON,
            }
          );

        applied =
          applyResult !== false;
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

  if (applied) {
    markApplied(
      root,
      AppCore,
      context,
      {
        hasToken:
          Boolean(payload.token),

        hasUser:
          Boolean(payload.user),

        hasRefreshToken:
          Boolean(payload.refreshToken),
      }
    );
  }

  return applied;
}

async function callRefreshSession({
  Auth,
  AppCore,
  requestConfig,
  error,
}) {
  if (!isFn(Auth?.refreshSession)) {
    return false;
  }

  return Auth.refreshSession({
    silent:
      true,

    reason:
      DEFAULT_REFRESH_REASON,

    requestId:
      requestConfig?.requestId || null,

    source:
      "http.auth",

    error,

    AppCore,
  });
}

/* =========================================================
   SKIP RULES
========================================================= */

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
      context,
      "auto-refresh-disabled"
    );
  }

  if (status !== 401) {
    return markSkipped(
      root,
      AppCore,
      context,
      "status-not-401"
    );
  }

  if (error?.aborted === true) {
    return markSkipped(
      root,
      AppCore,
      context,
      "request-aborted"
    );
  }

  if (error?.timeout === true) {
    return markSkipped(
      root,
      AppCore,
      context,
      "request-timeout"
    );
  }

  if (requestConfig?.public === true) {
    return markSkipped(
      root,
      AppCore,
      context,
      "public-request"
    );
  }

  if (requestConfig?.auth === false) {
    return markSkipped(
      root,
      AppCore,
      context,
      "auth-disabled-request"
    );
  }

  if (requestConfig?._skipAuthRefresh === true) {
    return markSkipped(
      root,
      AppCore,
      context,
      "skip-auth-refresh-flag"
    );
  }

  if (requestConfig?._authRefreshAttempted === true) {
    return markSkipped(
      root,
      AppCore,
      context,
      "auth-refresh-already-attempted"
    );
  }

  const path =
    requestConfig?.path ||
    requestConfig?.url ||
    "";

  if (isAuthEndpoint(path)) {
    return markSkipped(
      root,
      AppCore,
      context,
      "auth-endpoint"
    );
  }

  if (isPublicAuthEndpoint(path)) {
    return markSkipped(
      root,
      AppCore,
      context,
      "public-auth-endpoint"
    );
  }

  if (isTechnicalPublicRoute(path)) {
    return markSkipped(
      root,
      AppCore,
      context,
      "technical-public-route"
    );
  }

  if (isPublicEndpoint(path)) {
    return markSkipped(
      root,
      AppCore,
      context,
      "public-endpoint"
    );
  }

  if (!isFn(Auth?.refreshSession)) {
    return markSkipped(
      root,
      AppCore,
      context,
      "refresh-method-missing"
    );
  }

  if (!isAuthenticatedEnough(AppCore, Auth)) {
    return markSkipped(
      root,
      AppCore,
      context,
      "not-authenticated"
    );
  }

  if (!hasRefreshCapability(AppCore, Auth)) {
    return markSkipped(
      root,
      AppCore,
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

  const context =
    sanitizeRequestContext(requestConfig);

  const startedAt =
    nowMs();

  try {
    const skipResult =
      shouldSkipRefresh({
        AppCore,
        Auth,
        config,
        error,
        requestConfig:
          safeObject(requestConfig),
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

        const authenticated =
          isAuthenticatedEnough(AppCore, Auth);

        const hasSession =
          hasRefreshCapability(AppCore, Auth);

        const ok =
          Boolean(joinedResult) &&
          authenticated &&
          hasSession;

        safeEmit(
          AppCore,
          ok
            ? EVENTS.joinSuccess
            : EVENTS.joinFailed,
          {
            ...context,

            refreshed:
              Boolean(joinedResult),

            authenticated,

            hasSession,

            durationMs:
              nowMs() - startedAt,
          }
        );

        return ok;
      } catch (joinError) {
        markFailure(
          root,
          AppCore,
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
        config?.refreshMinIntervalMs,
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
      EVENTS.start,
      {
        ...context,

        attempt:
          stats.attempts,
      }
    );

    root.refreshPromise =
      Promise.resolve()
        .then(() =>
          callRefreshSession({
            Auth,
            AppCore,
            requestConfig,
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
      result:
        refreshResult,
      context,
      root,
    });

    const refreshed =
      isRefreshResultPositive(refreshResult);

    const authenticated =
      isAuthenticatedEnough(AppCore, Auth);

    const hasSession =
      hasRefreshCapability(AppCore, Auth);

    const ok =
      refreshed &&
      authenticated &&
      hasSession;

    if (!ok) {
      const rejectedError = {
        name:
          "RefreshRejected",

        message:
          "Refresh finalizado sin sesión válida.",

        status:
          401,

        refreshed,
        authenticated,
        hasSession,
      };

      markFailure(
        root,
        AppCore,
        context,
        rejectedError,
        EVENTS.rejected,
        {
          refreshed,
          authenticated,
          hasSession,
          durationMs:
            nowMs() - startedAt,
        }
      );

      return false;
    }

    markSuccess(
      root,
      AppCore,
      context,
      {
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
    refreshInFlight:
      Boolean(root.refreshPromise),

    refreshStats: {
      ...root.refreshStats,

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
  runAutoRefreshIfNeeded,
  getHttpAuthSnapshot,
  resetHttpAuthRuntime,
};
