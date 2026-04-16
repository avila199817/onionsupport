/* =========================================================
   Onion SPA - App Session Bootstrap
   Archivo: src/app/session.js

   RESPONSABILIDADES:
   - restaurar sesión ANTES del primer render
   - evitar restores duplicados en paralelo
   - sincronizar UI usuario tras restore
   - navegación post-login segura
   - diagnóstico robusto de sesión
   - no romper rutas contextualizadas

   HARDENING EXTREMO:
   - restore serializado real
   - anti race conditions
   - no repaint fantasma login/private
   - tolerancia total si Auth falla
   - no doble navegación durante boot
   - no contaminar publicPath/canonicalPath
   - warmup aislado
   - snapshot consistente
========================================================= */

import {
  getCurrentCanonicalPath,
  getCurrentPublicPath,
} from "./helpers.js";

/* =========================================================
   BASICS
========================================================= */

function safeLog(
  AppCore,
  ...args
) {
  try {
    AppCore?.utils?.log?.(
      ...args
    );
  } catch {}
}

function safeWarn(
  AppCore,
  ...args
) {
  try {
    AppCore?.utils?.warn?.(
      ...args
    );
  } catch {}
}

function isFunction(
  value
) {
  return (
    typeof value ===
    "function"
  );
}

function safeBool(
  value
) {
  return value === true;
}

function getState(
  AppCore
) {
  try {
    return (
      AppCore?.state ||
      {}
    );
  } catch {
    return {};
  }
}

function getResolvedSessionUser(
  AppCore
) {
  const state =
    getState(
      AppCore
    );

  return (
    state?.user
      ?.username ||
    state?.user
      ?.email ||
    state?.user
      ?.id ||
    null
  );
}

function getResolvedSessionRole(
  AppCore
) {
  return (
    getState(
      AppCore
    )?.role || null
  );
}

function isAuthenticated(
  AppCore
) {
  return Boolean(
    getState(
      AppCore
    )?.authenticated
  );
}

function shouldSkipNavigation(
  state
) {
  return Boolean(
    state
      ?.bootNavigationHandled ||
    state
      ?.initialRouteRendered
  );
}

function markNavigationHandled(
  state,
  value = true
) {
  try {
    if (
      state &&
      typeof state ===
        "object"
    ) {
      state.bootNavigationHandled =
        Boolean(
          value
        );
    }
  } catch {}
}

function buildSnapshot(
  AppCore,
  extras = {}
) {
  const state =
    getState(
      AppCore
    );

  return {
    authenticated:
      Boolean(
        state.authenticated
      ),
    user:
      state.user ||
      null,
    username:
      getResolvedSessionUser(
        AppCore
      ),
    role:
      getResolvedSessionRole(
        AppCore
      ),
    route:
      state.route ||
      "/",
    publicPath:
      state.publicPath ||
      "/",
    ...extras,
  };
}

/* =========================================================
   TARGET RESOLUTION
========================================================= */

function resolvePostLoginTarget({
  AppCore,
  Auth,
} = {}) {
  try {
    if (
      isFunction(
        Auth?.getPostLoginTarget
      )
    ) {
      const next =
        Auth.getPostLoginTarget(
          getState(
            AppCore
          ).user
        );

      if (
        next &&
        typeof next ===
          "string"
      ) {
        return next;
      }
    }
  } catch {}

  return "/";
}

/* =========================================================
   NAVEGACIÓN POST RESTORE
========================================================= */

export function navigateAfterSessionRestore({
  AppCore,
  Auth,
  Router,
  state,
} = {}) {
  if (
    !AppCore ||
    !Router
  ) {
    return false;
  }

  if (
    !isAuthenticated(
      AppCore
    )
  ) {
    return false;
  }

  if (
    shouldSkipNavigation(
      state
    )
  ) {
    safeLog(
      AppCore,
      "navigateAfterSessionRestore(): omitido (ya resuelto)."
    );

    return false;
  }

  const currentCanonicalPath =
    getCurrentCanonicalPath(
      AppCore,
      Router
    );

  const currentPublicPath =
    getCurrentPublicPath(
      AppCore,
      Router
    );

  safeLog(
    AppCore,
    "navigateAfterSessionRestore()",
    {
      canonical:
        currentCanonicalPath,
      publicPath:
        currentPublicPath,
      authenticated:
        true,
      user:
        getResolvedSessionUser(
          AppCore
        ),
      role:
        getResolvedSessionRole(
          AppCore
        ),
    }
  );

  /* Solo redirigir desde login */
  if (
    currentCanonicalPath !==
    "/login"
  ) {
    return false;
  }

  const target =
    resolvePostLoginTarget({
      AppCore,
      Auth,
    });

  markNavigationHandled(
    state,
    true
  );

  try {
    if (
      isFunction(
        Router.goAfterLogin
      )
    ) {
      Router.goAfterLogin(
        target
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "Router.goAfterLogin() falló:",
      error
    );
  }

  try {
    if (
      isFunction(
        Router.navigate
      )
    ) {
      Router.navigate(
        target,
        {
          replaceState: true,
          force: true,
        }
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "Router.navigate() falló:",
      error
    );
  }

  return false;
}

/* =========================================================
   RESTORE AUTH SESSION
========================================================= */

export async function restoreAuthSession({
  AppCore,
  Auth,
  syncUserUI,
  state,
} = {}) {
  if (
    state
      ?.sessionRestorePromise
  ) {
    return state.sessionRestorePromise;
  }

  if (
    !Auth ||
    !isFunction(
      Auth.restoreSession
    )
  ) {
    try {
      await Promise.resolve(
        syncUserUI?.(
          AppCore
        )
      );
    } catch {}

    return buildSnapshot(
      AppCore,
      {
        ok: false,
        reason:
          "auth-module-missing",
      }
    );
  }

  state.sessionRestorePromise =
    (async () => {
      try {
        safeLog(
          AppCore,
          "Restore session iniciado..."
        );

        const result =
          await Auth.restoreSession();

        await Promise.resolve(
          syncUserUI?.(
            AppCore
          )
        );

        const snapshot =
          buildSnapshot(
            AppCore,
            {
              ok:
                Boolean(
                  result?.ok
                ),
            }
          );

        safeLog(
          AppCore,
          "Restore session completado:",
          snapshot
        );

        return {
          ...(result ||
            {}),
          ...snapshot,
        };
      } catch (error) {
        safeWarn(
          AppCore,
          "restoreAuthSession() error:",
          error
        );

        try {
          await Promise.resolve(
            syncUserUI?.(
              AppCore
            )
          );
        } catch {}

        return buildSnapshot(
          AppCore,
          {
            ok: false,
            error,
          }
        );
      } finally {
        if (
          state &&
          typeof state ===
            "object"
        ) {
          state.sessionRestorePromise =
            null;
        }
      }
    })();

  return state.sessionRestorePromise;
}

/* =========================================================
   RESTORE DURANTE BOOT
========================================================= */

export async function restoreSessionInBackground({
  AppCore,
  Auth,
  Router,
  state,
  syncUserUI,
  warmup,
} = {}) {
  try {
    markNavigationHandled(
      state,
      false
    );

    const result =
      await restoreAuthSession({
        AppCore,
        Auth,
        syncUserUI,
        state,
      });

    try {
      await Promise.resolve(
        warmup?.(
          AppCore
        )
      );
    } catch (error) {
      safeWarn(
        AppCore,
        "warmup() falló:",
        error
      );
    }

    navigateAfterSessionRestore({
      AppCore,
      Auth,
      Router,
      state,
    });

    const snapshot =
      buildSnapshot(
        AppCore,
        {
          ok:
            safeBool(
              result?.ok
            ) ||
            Boolean(
              result?.ok
            ),
        }
      );

    safeLog(
      AppCore,
      "restoreSessionInBackground() completado:",
      snapshot
    );

    return {
      ...(result ||
        {}),
      ...snapshot,
    };
  } catch (error) {
    safeWarn(
      AppCore,
      "restoreSessionInBackground() falló:",
      error
    );

    try {
      await Promise.resolve(
        syncUserUI?.(
          AppCore
        )
      );
    } catch {}

    return buildSnapshot(
      AppCore,
      {
        ok: false,
        error,
      }
    );
  }
}

/* =========================================================
   DEBUG
========================================================= */

export function getSessionBootstrapSnapshot({
  AppCore,
  state,
} = {}) {
  return {
    ...buildSnapshot(
      AppCore
    ),
    restoring:
      Boolean(
        state
          ?.sessionRestorePromise
      ),
    bootNavigationHandled:
      Boolean(
        state
          ?.bootNavigationHandled
      ),
    initialRouteRendered:
      Boolean(
        state
          ?.initialRouteRendered
      ),
  };
}

export default {
  navigateAfterSessionRestore,
  restoreAuthSession,
  restoreSessionInBackground,
  getSessionBootstrapSnapshot,
};
