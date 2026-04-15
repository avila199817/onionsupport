/* =========================================================
   Onion SPA - HTTP Auth
   Archivo: src/services/http.auth.js

   Responsabilidades:
   - resolver auto refresh en respuestas 401
   - evitar refresh duplicados concurrentes
   - excluir endpoints auth del auto refresh
   - devolver si la request puede reintentarse tras refresh

   HARDENING:
   - no refrescar sobre requests abortadas
   - no refrescar si el usuario ya no está autenticado
   - no refrescar endpoints auth
   - serializar refresh concurrente
========================================================= */

import {
  isFn,
  isAuthEndpoint,
} from "./http.helpers.js";

function nowMs() {
  return Date.now();
}

function ensureRefreshState(state) {
  if (!state) return;

  if (
    !state.refreshStats ||
    typeof state.refreshStats !== "object"
  ) {
    state.refreshStats = {
      attempts: 0,
      failures: 0,
      lastAttemptAt: 0,
      lastSuccessAt: 0,
      lastError: null,
    };
  }
}

function emitAutoRefreshEvent(
  AppCore,
  type,
  payload = {}
) {
  AppCore?.events?.emit?.(
    `http:auto-refresh:${type}`,
    {
      at:
        new Date().toISOString(),
      ...payload,
    }
  );
}

export async function runAutoRefreshIfNeeded({
  AppCore,
  Auth,
  config,
  state,
  error,
  requestConfig,
}) {
  ensureRefreshState(state);

  const requestId =
    requestConfig?.requestId ||
    null;

  const context = {
    path:
      requestConfig?.path ||
      null,
    method:
      requestConfig?.method ||
      null,
    requestId,
  };

  const emitSkipped = (
    reason
  ) => {
    emitAutoRefreshEvent(
      AppCore,
      "skipped",
      {
        ...context,
        reason,
      }
    );
  };

  if (!config?.autoRefreshOn401) {
    emitSkipped(
      "auto-refresh-disabled"
    );
    return false;
  }

  if (!Auth?.isAuthenticated?.()) {
    emitSkipped(
      "not-authenticated"
    );
    return false;
  }

  if (Number(error?.status || 0) !== 401) {
    emitSkipped(
      "status-not-401"
    );
    return false;
  }

  if (error?.aborted === true) {
    emitSkipped("request-aborted");
    return false;
  }

  if (requestConfig?._skipAuthRefresh === true) {
    emitSkipped(
      "skip-auth-refresh-flag"
    );
    return false;
  }

  if (requestConfig?._authRefreshAttempted === true) {
    emitSkipped(
      "auth-refresh-already-attempted"
    );
    return false;
  }

  if (isAuthEndpoint(requestConfig?.path)) {
    emitSkipped("auth-endpoint");
    return false;
  }

  if (!isFn(Auth?.refreshSession)) {
    emitSkipped(
      "refresh-method-missing"
    );
    return false;
  }

  const startedAt = nowMs();
  const refreshStats =
    state?.refreshStats || {};

  const minIntervalMs = Number(
    config?.refreshMinIntervalMs ||
      0
  );

  if (
    Number.isFinite(
      minIntervalMs
    ) &&
    minIntervalMs > 0 &&
    refreshStats.lastAttemptAt > 0 &&
    startedAt -
      refreshStats.lastAttemptAt <
      minIntervalMs
  ) {
    emitSkipped(
      "refresh-rate-limited"
    );
    return false;
  }

  refreshStats.attempts =
    Number(refreshStats.attempts || 0) + 1;
  refreshStats.lastAttemptAt =
    startedAt;

  emitAutoRefreshEvent(
    AppCore,
    "start",
    {
      ...context,
      attempt:
        refreshStats.attempts,
    }
  );

  try {
    if (!state.refreshPromise) {
      state.refreshPromise = Promise.resolve(
        Auth.refreshSession()
      ).finally(() => {
        state.refreshPromise = null;
      });
    } else {
      emitAutoRefreshEvent(
        AppCore,
        "join",
        {
          ...context,
          reason:
            "refresh-in-flight",
        }
      );
    }

    const refreshed = await state.refreshPromise;

    if (!Auth?.isAuthenticated?.()) {
      emitSkipped(
        "refresh-finished-not-authenticated"
      );
      return false;
    }

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
          Boolean(refreshed),
        durationMs:
          nowMs() - startedAt,
      }
    );

    return true;
  } catch (refreshError) {
    refreshStats.failures =
      Number(refreshStats.failures || 0) + 1;
    refreshStats.lastError = {
      message:
        refreshError?.message ||
        String(refreshError),
      name:
        refreshError?.name ||
        "Error",
    };

    AppCore?.utils?.warn?.(
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
        error: refreshError,
      }
    );

    return false;
  }
}
