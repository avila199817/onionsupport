/* =========================================================
   Onion SPA - HTTP Auth
   Archivo: src/services/http.auth.js

   Responsabilidades:
   - resolver auto refresh en respuestas 401
   - evitar refresh duplicados concurrentes
   - excluir endpoints auth del auto refresh
   - excluir rutas públicas técnicas del auto refresh
   - devolver si la request puede reintentarse tras refresh

   HARDENING EXTREMO:
   - no refrescar sobre requests abortadas
   - no refrescar si el usuario ya no está autenticado
   - no refrescar endpoints auth
   - no refrescar endpoints públicos técnicos
   - no refrescar requests public/auth:false
   - serializar refresh concurrente
   - rate-limit opcional
   - eventos sin tokens reales
   - stats consistentes
   - fallback si state no existe
   - cero throws accidentales
========================================================= */

import {
  isFn,
  isAuthEndpoint,
} from "./http.helpers.js";

/* =========================================================
   MODULE STATE FALLBACK
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

    lastAttemptAt:
      0,

    lastSuccessAt:
      0,

    lastFailureAt:
      0,

    lastSkipReason:
      "",

    lastError:
      null,
  },
};

/* =========================================================
   HELPERS
========================================================= */

function nowMs() {
  return Date.now();
}

function isoNow() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
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

function safeLower(value = "") {
  return safeText(value, "")
    .toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeObject(value, fallback = {}) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value
    : fallback;
}

function safeEmit(AppCore, eventName, payload = {}) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );

    return true;
  } catch {}

  return false;
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(
      "[HTTP Auth]",
      ...args
    );
  } catch {
    try {
      console.warn(
        "[HTTP Auth]",
        ...args
      );
    } catch {}
  }
}

function safeRedact(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  let output =
    raw;

  try {
    output = output.replace(
      /([?&](?:token|activationToken|activateToken|resetToken|passwordResetToken|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(\/activate-account\/)([^/?#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    );
  } catch {}

  return output;
}

function normalizeEndpointPath(path = "") {
  const raw =
    safeText(path, "");

  if (!raw) {
    return "";
  }

  try {
    const parsed =
      new URL(
        raw,
        typeof window !== "undefined" &&
          window.location?.origin
          ? window.location.origin
          : "http://localhost"
      );

    return safeLower(
      parsed.pathname || raw
    );
  } catch {
    return safeLower(
      raw.split("?")[0].split("#")[0] || raw
    );
  }
}

function isTechnicalPublicRoute(path = "") {
  const normalized =
    normalizeEndpointPath(path);

  return (
    normalized === "/activate-account" ||
    normalized.startsWith("/activate-account/") ||
    normalized === "/reset-password" ||
    normalized === "/forgot-password" ||
    normalized === "/reset-password/confirm" ||
    normalized.startsWith("/reset-password/confirm/")
  );
}

function isPublicAuthLikeEndpoint(path = "") {
  const normalized =
    normalizeEndpointPath(path);

  return (
    normalized.includes("/auth/login") ||
    normalized.includes("/auth/refresh") ||
    normalized.includes("/auth/2fa/login") ||
    normalized.includes("/auth/_health") ||

    normalized.includes("/auth/activate") ||
    normalized.includes("/auth/activate-account") ||
    normalized.includes("/auth/account/activate") ||
    normalized.includes("/auth/activation") ||
    normalized.includes("/auth/activate/first-user") ||

    normalized.includes("/auth/reset-password") ||
    normalized.includes("/auth/reset-password-request") ||
    normalized.includes("/auth/reset-password-confirm") ||
    normalized.includes("/auth/password-reset") ||
    normalized.includes("/auth/forgot-password") ||
    normalized.includes("/auth/recover-password")
  );
}

function normalizeErrorForEvent(error = null) {
  if (!error) {
    return null;
  }

  return {
    name:
      error?.name || "Error",

    message:
      error?.message || String(error),

    status:
      error?.status || 0,

    statusText:
      error?.statusText || "",

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
    root.refreshStats = {
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

      lastAttemptAt:
        0,

      lastSuccessAt:
        0,

      lastFailureAt:
        0,

      lastSkipReason:
        "",

      lastError:
        null,
    };
  }

  if (!Object.prototype.hasOwnProperty.call(root, "refreshPromise")) {
    root.refreshPromise =
      null;
  }

  return root;
}

function buildContext(requestConfig = {}) {
  return {
    path:
      safeRedact(requestConfig?.path || ""),

    method:
      requestConfig?.method || null,

    requestId:
      requestConfig?.requestId || null,

    public:
      requestConfig?.public === true,

    auth:
      requestConfig?.auth !== false,
  };
}

function emitAutoRefreshEvent(AppCore, type, payload = {}) {
  safeEmit(
    AppCore,
    `http:auto-refresh:${type}`,
    {
      at:
        isoNow(),
      ...payload,
    }
  );
}

function markSkipped(root, AppCore, context, reason) {
  const refreshStats =
    root.refreshStats;

  refreshStats.skipped =
    safeNumber(refreshStats.skipped, 0) + 1;

  refreshStats.lastSkipReason =
    safeText(reason, "unknown");

  emitAutoRefreshEvent(
    AppCore,
    "skipped",
    {
      ...context,
      reason:
        refreshStats.lastSkipReason,
    }
  );

  return false;
}

function isAuthenticatedEnough(AppCore, Auth) {
  try {
    if (isFn(Auth?.isAuthenticated)) {
      return Boolean(Auth.isAuthenticated());
    }
  } catch {}

  try {
    return Boolean(
      AppCore?.state?.authenticated
    );
  } catch {}

  return false;
}

function hasUsableToken(AppCore) {
  try {
    return Boolean(
      AppCore?.state?.token &&
        String(AppCore.state.token).trim()
    );
  } catch {
    return false;
  }
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
      "http-auto-refresh",

    requestId:
      requestConfig?.requestId || null,

    source:
      "http.auth",

    error,
    AppCore,
  });
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

  const refreshStats =
    root.refreshStats;

  const context =
    buildContext(requestConfig);

  const startedAt =
    nowMs();

  const status =
    safeNumber(
      error?.status,
      0
    );

  /* =======================================================
     HARD SKIPS
  ======================================================= */

  if (!config?.autoRefreshOn401) {
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

  if (isAuthEndpoint(requestConfig?.path)) {
    return markSkipped(
      root,
      AppCore,
      context,
      "auth-endpoint"
    );
  }

  if (isPublicAuthLikeEndpoint(requestConfig?.path)) {
    return markSkipped(
      root,
      AppCore,
      context,
      "public-auth-endpoint"
    );
  }

  if (isTechnicalPublicRoute(requestConfig?.path)) {
    return markSkipped(
      root,
      AppCore,
      context,
      "technical-public-route"
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

  /*
    Si no hay token local, no intentamos refresh desde HTTP Service.
    El flujo de restore/login debe resolverlo.
  */
  if (!hasUsableToken(AppCore)) {
    return markSkipped(
      root,
      AppCore,
      context,
      "missing-access-token"
    );
  }

  /* =======================================================
     JOIN EXISTING REFRESH
  ======================================================= */

  if (root.refreshPromise) {
    refreshStats.joined =
      safeNumber(refreshStats.joined, 0) + 1;

    emitAutoRefreshEvent(
      AppCore,
      "join",
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

      const ok =
        Boolean(joinedResult) &&
        authenticated;

      emitAutoRefreshEvent(
        AppCore,
        ok ? "join-success" : "join-failed",
        {
          ...context,
          refreshed:
            Boolean(joinedResult),
          authenticated,
          durationMs:
            nowMs() - startedAt,
        }
      );

      return ok;
    } catch (joinError) {
      refreshStats.failures =
        safeNumber(refreshStats.failures, 0) + 1;

      refreshStats.lastFailureAt =
        nowMs();

      refreshStats.lastError =
        normalizeErrorForEvent(joinError);

      emitAutoRefreshEvent(
        AppCore,
        "join-error",
        {
          ...context,
          durationMs:
            nowMs() - startedAt,
          error:
            normalizeErrorForEvent(joinError),
        }
      );

      return false;
    }
  }

  /* =======================================================
     RATE LIMIT
  ======================================================= */

  const minIntervalMs =
    safeNumber(
      config?.refreshMinIntervalMs,
      0
    );

  if (
    minIntervalMs > 0 &&
    refreshStats.lastAttemptAt > 0 &&
    startedAt - refreshStats.lastAttemptAt < minIntervalMs
  ) {
    return markSkipped(
      root,
      AppCore,
      context,
      "refresh-rate-limited"
    );
  }

  /* =======================================================
     START REFRESH
  ======================================================= */

  refreshStats.attempts =
    safeNumber(refreshStats.attempts, 0) + 1;

  refreshStats.lastAttemptAt =
    startedAt;

  refreshStats.lastError =
    null;

  emitAutoRefreshEvent(
    AppCore,
    "start",
    {
      ...context,
      attempt:
        refreshStats.attempts,
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

  try {
    const refreshed =
      await root.refreshPromise;

    const authenticated =
      isAuthenticatedEnough(AppCore, Auth);

    const hasToken =
      hasUsableToken(AppCore);

    const ok =
      Boolean(refreshed) &&
      authenticated &&
      hasToken;

    if (!ok) {
      refreshStats.failures =
        safeNumber(refreshStats.failures, 0) + 1;

      refreshStats.lastFailureAt =
        nowMs();

      refreshStats.lastError = {
        name:
          "RefreshRejected",

        message:
          "Refresh finalizado sin sesión válida.",

        refreshed:
          Boolean(refreshed),

        authenticated,

        hasToken,
      };

      emitAutoRefreshEvent(
        AppCore,
        "rejected",
        {
          ...context,
          refreshed:
            Boolean(refreshed),
          authenticated,
          hasToken,
          durationMs:
            nowMs() - startedAt,
        }
      );

      return false;
    }

    refreshStats.successes =
      safeNumber(refreshStats.successes, 0) + 1;

    refreshStats.lastSuccessAt =
      nowMs();

    refreshStats.lastError =
      null;

    emitAutoRefreshEvent(
      AppCore,
      "success",
      {
        ...context,
        refreshed:
          true,
        authenticated:
          true,
        hasToken:
          true,
        durationMs:
          nowMs() - startedAt,
      }
    );

    return true;
  } catch (refreshError) {
    refreshStats.failures =
      safeNumber(refreshStats.failures, 0) + 1;

    refreshStats.lastFailureAt =
      nowMs();

    refreshStats.lastError =
      normalizeErrorForEvent(refreshError);

    safeWarn(
      AppCore,
      "HTTP auto-refresh falló.",
      refreshError
    );

    emitAutoRefreshEvent(
      AppCore,
      "error",
      {
        ...context,
        durationMs:
          nowMs() - startedAt,
        error:
          normalizeErrorForEvent(refreshError),
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

  return {
    refreshInFlight:
      Boolean(root.refreshPromise),

    refreshStats: {
      ...root.refreshStats,

      lastError:
        root.refreshStats?.lastError || null,
    },
  };
}

export function resetHttpAuthRuntime(state) {
  const root =
    getRootRefreshState(state);

  root.refreshPromise =
    null;

  root.refreshStats = {
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

    lastAttemptAt:
      0,

    lastSuccessAt:
      0,

    lastFailureAt:
      0,

    lastSkipReason:
      "",

    lastError:
      null,
  };

  return true;
}

export default {
  runAutoRefreshIfNeeded,
  getHttpAuthSnapshot,
  resetHttpAuthRuntime,
};
