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

export async function runAutoRefreshIfNeeded({
  AppCore,
  Auth,
  config,
  state,
  error,
  requestConfig,
}) {
  if (!config?.autoRefreshOn401) {
    return false;
  }

  if (!Auth?.isAuthenticated?.()) {
    return false;
  }

  if (Number(error?.status || 0) !== 401) {
    return false;
  }

  if (error?.aborted === true) {
    return false;
  }

  if (requestConfig?._skipAuthRefresh === true) {
    return false;
  }

  if (requestConfig?._authRefreshAttempted === true) {
    return false;
  }

  if (isAuthEndpoint(requestConfig?.path)) {
    return false;
  }

  if (!isFn(Auth?.refreshSession)) {
    return false;
  }

  try {
    if (!state.refreshPromise) {
      state.refreshPromise = Promise.resolve(
        Auth.refreshSession()
      ).finally(() => {
        state.refreshPromise = null;
      });
    }

    const refreshed = await state.refreshPromise;

    if (!Auth?.isAuthenticated?.()) {
      return false;
    }

    AppCore?.events?.emit?.(
      "http:auto-refresh:success",
      {
        path: requestConfig?.path || null,
        method: requestConfig?.method || null,
        refreshed: Boolean(refreshed),
      }
    );

    return true;
  } catch (refreshError) {
    AppCore?.utils?.warn?.(
      "HTTP auto-refresh falló.",
      refreshError
    );

    AppCore?.events?.emit?.(
      "http:auto-refresh:error",
      {
        path: requestConfig?.path || null,
        method: requestConfig?.method || null,
        error: refreshError,
      }
    );

    return false;
  }
}
