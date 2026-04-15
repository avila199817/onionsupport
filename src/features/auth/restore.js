/* =========================================================
   Onion SPA - Auth Restore
   Archivo: src/features/auth/restore.js

   Responsabilidades:
   - cargar usuario actual desde /me
   - refrescar access token
   - restaurar sesión desde token o refresh context
   - serializar me / refresh / restore
   - evitar carreras concurrentes
   - priorizar refresh cuando exista contexto válido
   - endurecer errores y limpieza de sesión

   HARDENING PRO:
   - promises únicas anti race-condition
   - cooldown anti refresh-loop
   - tolerancia backend heterogéneo
   - logs enterprise
   - fallbacks robustos
   - limpieza garantizada
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  extractMessage,
  hasValidToken,
} from "./helpers.js";

import {
  AUTH_ENDPOINTS,
  AUTH_CONSTANTS,
} from "./constants.js";

import {
  extractToken,
  extractUser,
  extractRefreshToken,
  normalizeSessionPayload,
} from "./normalize.js";

import {
  getStoredRefreshToken,
  getStoredSessionId,
  getStoredSessionUserId,
  hasRefreshContext,
} from "./storage.js";

import {
  applySession,
  clearSessionLocal,
} from "./session.js";

/* =========================================================
   BASICS
========================================================= */

function safeNumber(
  value,
  fallback = 0
) {
  const n = Number(value);
  return Number.isFinite(n)
    ? n
    : fallback;
}

function emit(
  eventName,
  payload = {}
) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}
}

function warn(...args) {
  try {
    AppCore?.utils?.warn?.(...args);
  } catch {}
}

function log(...args) {
  try {
    AppCore?.utils?.log?.(...args);
  } catch {}
}

function getMaxSequentialFailures() {
  return safeNumber(
    AUTH_CONSTANTS?.maxSequentialRefreshFailures,
    3
  );
}

function getRefreshRetryCooldownMs() {
  return safeNumber(
    AUTH_CONSTANTS?.refreshRetryCooldownMs,
    60000
  );
}

function clearRuntimeFlags(
  session
) {
  if (!session) return;

  session.checking = false;
  session.refreshing = false;
  session.restoring = false;

  session.mePromise = null;
  session.refreshPromise = null;
  session.restorePromise = null;
}

function getStoredRefreshPayload() {
  return {
    refreshToken:
      String(
        getStoredRefreshToken() || ""
      ).trim(),

    sessionId:
      String(
        getStoredSessionId() || ""
      ).trim(),

    userId:
      String(
        getStoredSessionUserId() || ""
      ).trim(),
  };
}

/* =========================================================
   /ME
========================================================= */

export async function fetchMe(
  session = {}
) {
  if (!hasValidToken()) {
    throw new Error(
      "No hay token disponible para /me."
    );
  }

  if (session.mePromise) {
    return session.mePromise;
  }

  session.checking = true;

  emit("auth:me:start");

  session.mePromise =
    (async () => {
      try {
        const response =
          await AppCore.apiClient.get(
            AUTH_ENDPOINTS.me,
            {
              auth: true,
            }
          );

        const user =
          extractUser(response) ||
          extractUser(
            response?.data
          ) ||
          response?.user ||
          null;

        if (!user) {
          throw new Error(
            "No se pudo resolver el usuario actual."
          );
        }

        const snapshot =
          applySession({
            user,
          });

        session.lastCheckAt =
          Date.now();

        emit(
          "auth:me:success",
          {
            user:
              snapshot?.user ||
              user,
          }
        );

        return (
          snapshot?.user ||
          user
        );
      } catch (error) {
        emit(
          "auth:me:error",
          {
            error,
            message:
              extractMessage(
                error
              ),
          }
        );

        throw error;
      } finally {
        session.checking = false;
        session.mePromise = null;
      }
    })();

  return session.mePromise;
}

/* =========================================================
   REFRESH
========================================================= */

export async function refreshSession(
  session = {}
) {
  if (!hasRefreshContext()) {
    throw new Error(
      "No hay contexto de refresh disponible."
    );
  }

  if (session.refreshPromise) {
    return session.refreshPromise;
  }

  const now =
    Date.now();

  if (
    safeNumber(
      session.refreshBlockedUntil,
      0
    ) > now
  ) {
    throw new Error(
      "Refresh temporalmente bloqueado."
    );
  }

  session.refreshing = true;

  emit(
    "auth:refresh:start"
  );

  session.refreshPromise =
    (async () => {
      try {
        const requestBody =
          getStoredRefreshPayload();

        const response =
          await AppCore.apiClient.post(
            AUTH_ENDPOINTS.refresh,
            requestBody,
            {
              auth: false,
            }
          );

        const nextToken =
          extractToken(
            response
          );

        const nextUser =
          extractUser(
            response
          );

        const nextRefreshToken =
          extractRefreshToken(
            response
          );

        const nextSessionData =
          normalizeSessionPayload(
            response
          );

        if (
          !nextToken &&
          !nextUser
        ) {
          throw new Error(
            "Refresh sin datos de sesión."
          );
        }

        const snapshot =
          applySession({
            token:
              nextToken ??
              AppCore.state.token,

            user:
              nextUser ??
              AppCore.state.user,

            refreshToken:
              nextRefreshToken ??
              requestBody.refreshToken,

            sessionData:
              nextSessionData ?? {
                sessionId:
                  requestBody.sessionId,
                userId:
                  requestBody.userId,
              },
          });

        if (
          !snapshot?.token &&
          !hasValidToken()
        ) {
          throw new Error(
            "Refresh completado sin token."
          );
        }

        session.lastRefreshAt =
          Date.now();

        session.refreshFailCount = 0;
        session.refreshBlockedUntil = 0;

        emit(
          "auth:refresh:success",
          {
            ...snapshot,
          }
        );

        return {
          ok: true,
          ...snapshot,
          response,
        };
      } catch (error) {
        session.refreshFailCount =
          safeNumber(
            session.refreshFailCount,
            0
          ) + 1;

        if (
          session.refreshFailCount >=
          getMaxSequentialFailures()
        ) {
          session.refreshBlockedUntil =
            Date.now() +
            getRefreshRetryCooldownMs();
        }

        emit(
          "auth:refresh:error",
          {
            error,
            message:
              extractMessage(
                error
              ),
            refreshFailCount:
              session.refreshFailCount,
            refreshBlockedUntil:
              session.refreshBlockedUntil ||
              null,
          }
        );

        throw error;
      } finally {
        session.refreshing = false;
        session.refreshPromise = null;
      }
    })();

  return session.refreshPromise;
}

/* =========================================================
   RESTORE HELPERS
========================================================= */

export async function restoreUsingMe(
  session = {}
) {
  const user =
    await fetchMe(
      session
    );

  emit(
    "auth:restore:success",
    {
      source: "me",
      user,
    }
  );

  return {
    ok: true,
    user,
  };
}

export async function restoreUsingRefreshOnly(
  session = {}
) {
  const refreshed =
    await refreshSession(
      session
    );

  if (
    !AppCore.state.user &&
    hasValidToken()
  ) {
    await fetchMe(
      session
    );
  }

  emit(
    "auth:restore:success",
    {
      source:
        "refresh-only",
      user:
        AppCore.state.user,
    }
  );

  return {
    ok: true,
    user:
      AppCore.state.user,
    refreshed,
  };
}

export async function restoreUsingRefreshPreferred(
  session = {}
) {
  return restoreUsingRefreshOnly(
    session
  );
}

export async function restoreAfterMeFailure(
  session = {},
  meError
) {
  warn(
    "fetchMe() falló en restoreSession().",
    meError
  );

  if (!hasRefreshContext()) {
    clearSessionLocal({
      silent: true,
    });

    emit(
      "auth:restore:error",
      {
        error: meError,
        message:
          extractMessage(
            meError
          ),
      }
    );

    return {
      ok: false,
      user: null,
      error: meError,
    };
  }

  try {
    return await restoreUsingRefreshOnly(
      session
    );
  } catch (refreshError) {
    clearSessionLocal({
      silent: true,
    });

    emit(
      "auth:restore:error",
      {
        error:
          refreshError,
        message:
          extractMessage(
            refreshError
          ),
      }
    );

    return {
      ok: false,
      user: null,
      error:
        refreshError,
    };
  }
}

/* =========================================================
   RESTORE SESSION
========================================================= */

export async function restoreSession(
  session = {}
) {
  if (session.restorePromise) {
    return session.restorePromise;
  }

  session.restoring = true;

  emit(
    "auth:restore:start",
    {
      hasToken:
        hasValidToken(),
      hasUser:
        Boolean(
          AppCore.state.user
        ),
      hasRefreshContext:
        hasRefreshContext(),
    }
  );

  session.restorePromise =
    (async () => {
      try {
        const tokenAvailable =
          hasValidToken();

        const refreshAvailable =
          hasRefreshContext();

        /* 1) Nada disponible */
        if (
          !tokenAvailable &&
          !refreshAvailable
        ) {
          clearSessionLocal({
            silent: true,
          });

          emit(
            "auth:restore:empty",
            {
              reason:
                "missing-token-and-refresh-context",
            }
          );

          return {
            ok: false,
            user: null,
          };
        }

        /* 2) Prefer refresh */
        if (
          refreshAvailable
        ) {
          try {
            return await restoreUsingRefreshPreferred(
              session
            );
          } catch (refreshError) {
            warn(
              "Refresh preferente falló.",
              refreshError
            );

            if (
              hasValidToken()
            ) {
              return await restoreAfterMeFailure(
                session,
                refreshError
              );
            }

            clearSessionLocal({
              silent: true,
            });

            return {
              ok: false,
              user: null,
              error:
                refreshError,
            };
          }
        }

        /* 3) Solo token */
        return await restoreUsingMe(
          session
        );
      } catch (error) {
        clearSessionLocal({
          silent: true,
        });

        emit(
          "auth:restore:error",
          {
            error,
            message:
              extractMessage(
                error
              ),
          }
        );

        return {
          ok: false,
          user: null,
          error,
        };
      } finally {
        clearRuntimeFlags(
          session
        );
      }
    })();

  return session.restorePromise;
}
