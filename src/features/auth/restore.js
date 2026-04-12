/* =========================================================
   Onion SPA - Auth Restore
   Archivo: src/features/auth/restore.js

   Responsabilidades:
   - cargar usuario actual desde /me
   - refrescar access token
   - restaurar sesión con token o refresh context
   - serializar me / refresh / restore
   - endurecer recuperación de sesión
   - priorizar refresh cuando exista contexto válido para evitar 401 iniciales
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
   /ME
========================================================= */
export async function fetchMe(
  session
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

  AppCore.events.emit(
    "auth:me:start",
    {}
  );

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
          extractUser(
            response
          ) ||
          extractUser(
            response?.data
          ) ||
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

        AppCore.events.emit(
          "auth:me:success",
          {
            user:
              snapshot.user,
          }
        );

        return snapshot.user;
      } catch (error) {
        AppCore.events.emit(
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
        session.checking =
          false;
        session.mePromise =
          null;
      }
    })();

  return session.mePromise;
}

/* =========================================================
   REFRESH
========================================================= */
export async function refreshSession(
  session
) {
  if (
    !hasRefreshContext()
  ) {
    throw new Error(
      "No hay contexto de refresh disponible."
    );
  }

  if (
    session.refreshPromise
  ) {
    return session.refreshPromise;
  }

  const now = Date.now();

  if (
    session.refreshBlockedUntil >
    now
  ) {
    throw new Error(
      "Refresh temporalmente bloqueado."
    );
  }

  session.refreshing = true;

  AppCore.events.emit(
    "auth:refresh:start",
    {}
  );

  session.refreshPromise =
    (async () => {
      try {
        const storedRefreshToken =
          getStoredRefreshToken();

        const storedSessionId =
          getStoredSessionId();

        const storedSessionUserId =
          getStoredSessionUserId();

        const requestBody = {
          refreshToken:
            String(
              storedRefreshToken ||
                ""
            ).trim(),
          sessionId:
            String(
              storedSessionId ||
                ""
            ).trim(),
          userId:
            String(
              storedSessionUserId ||
                ""
            ).trim(),
        };

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
              AppCore.state
                .token,
            user:
              nextUser ??
              AppCore.state
                .user,
            refreshToken:
              nextRefreshToken ??
              storedRefreshToken,
            sessionData:
              nextSessionData ?? {
                sessionId:
                  storedSessionId,
                userId:
                  storedSessionUserId,
              },
          });

        if (
          !snapshot.token
        ) {
          throw new Error(
            "Refresh completado sin token."
          );
        }

        session.lastRefreshAt =
          Date.now();
        session.refreshFailCount =
          0;
        session.refreshBlockedUntil =
          0;

        AppCore.events.emit(
          "auth:refresh:success",
          {
            ...snapshot,
            response,
          }
        );

        return {
          ok: true,
          ...snapshot,
          response,
        };
      } catch (error) {
        session.refreshFailCount += 1;

        if (
          session.refreshFailCount >=
          AUTH_CONSTANTS.maxSequentialRefreshFailures
        ) {
          session.refreshBlockedUntil =
            Date.now() +
            AUTH_CONSTANTS.refreshRetryCooldownMs;
        }

        AppCore.events.emit(
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
        session.refreshing =
          false;
        session.refreshPromise =
          null;
      }
    })();

  return session.refreshPromise;
}

/* =========================================================
   RESTORE HELPERS
========================================================= */
export async function restoreUsingRefreshOnly(
  session
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

  AppCore.events.emit(
    "auth:restore:success",
    {
      user:
        AppCore.state.user,
      source:
        "refresh-without-token",
    }
  );

  return {
    ok: true,
    user:
      AppCore.state.user,
    refreshed,
  };
}

export async function restoreUsingMe(
  session
) {
  const user =
    await fetchMe(
      session
    );

  AppCore.events.emit(
    "auth:restore:success",
    {
      user,
      source: "me",
    }
  );

  return {
    ok: true,
    user,
  };
}

export async function restoreAfterMeFailure(
  session,
  meError
) {
  AppCore.utils.warn(
    "fetchMe() falló en restoreSession(), intentando refresh.",
    meError
  );

  if (
    !hasRefreshContext()
  ) {
    clearSessionLocal();

    AppCore.events.emit(
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
    const refreshed =
      await refreshSession(
        session
      );

    if (
      !AppCore.state.user
    ) {
      await fetchMe(
        session
      );
    }

    AppCore.events.emit(
      "auth:restore:success",
      {
        user:
          AppCore.state.user,
        source:
          "refresh-after-me-failure",
      }
    );

    return {
      ok: true,
      user:
        AppCore.state.user,
      refreshed,
    };
  } catch (
    refreshError
  ) {
    clearSessionLocal();

    AppCore.events.emit(
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

export async function restoreUsingRefreshPreferred(
  session
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

  AppCore.events.emit(
    "auth:restore:success",
    {
      user:
        AppCore.state.user,
      source:
        "refresh-preferred",
    }
  );

  return {
    ok: true,
    user:
      AppCore.state.user,
    refreshed,
  };
}

/* =========================================================
   RESTORE SESSION
   Política:
   - si existe refresh context, refrescar primero
   - así evitamos el 401 inicial de /me con access token expirado
   - solo usar /me directo cuando NO exista refresh context
========================================================= */
export async function restoreSession(
  session
) {
  if (
    session.restorePromise
  ) {
    return session.restorePromise;
  }

  session.restoring = true;

  AppCore.events.emit(
    "auth:restore:start",
    {
      hasToken:
        hasValidToken(),
      hasUser: Boolean(
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

        /* =========================================
           1) Nada disponible
        ========================================= */
        if (
          !tokenAvailable &&
          !refreshAvailable
        ) {
          clearSessionLocal({
            silent: true,
          });

          AppCore.events.emit(
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

        /* =========================================
           2) Preferir refresh si existe contexto
              elimina el 401 inicial de /me
        ========================================= */
        if (refreshAvailable) {
          try {
            return await restoreUsingRefreshPreferred(
              session
            );
          } catch (
            refreshPreferredError
          ) {
            AppCore.utils.warn(
              "Refresh preferente falló en restoreSession().",
              refreshPreferredError
            );

            /*
              Fallback:
              si aún queda token válido local, intentamos /me.
              Esto cubre backend de refresh caído pero token todavía usable.
            */
            if (
              hasValidToken()
            ) {
              try {
                return await restoreUsingMe(
                  session
                );
              } catch (
                meAfterRefreshError
              ) {
                clearSessionLocal();

                AppCore.events.emit(
                  "auth:restore:error",
                  {
                    error:
                      meAfterRefreshError,
                    message:
                      extractMessage(
                        meAfterRefreshError
                      ),
                  }
                );

                return {
                  ok: false,
                  user: null,
                  error:
                    meAfterRefreshError,
                };
              }
            }

            clearSessionLocal();

            AppCore.events.emit(
              "auth:restore:error",
              {
                error:
                  refreshPreferredError,
                message:
                  extractMessage(
                    refreshPreferredError
                  ),
              }
            );

            return {
              ok: false,
              user: null,
              error:
                refreshPreferredError,
            };
          }
        }

        /* =========================================
           3) Solo token, sin refresh context
        ========================================= */
        try {
          return await restoreUsingMe(
            session
          );
        } catch (
          meError
        ) {
          return await restoreAfterMeFailure(
            session,
            meError
          );
        }
      } finally {
        session.restoring =
          false;
        session.restorePromise =
          null;
      }
    })();

  return session.restorePromise;
}
