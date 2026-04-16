/* =========================================================
   Onion SPA - App Session Bootstrap
   Archivo: src/app/session.js

   RESPONSABILIDADES:
   - restaurar sesión ANTES del primer render
   - evitar restores duplicados en paralelo
   - sincronizar UI de usuario tras restore
   - helper de navegación post-login
   - diagnóstico robusto de sesión

   HARDENING PRO:
   - restore serializado
   - cero race conditions
   - no repaint fantasma login/private
   - tolerancia total si Auth falla
   - no doble navegación durante boot
   - no contaminar el publicPath/canonicalPath
========================================================= */

import {
  getCurrentCanonicalPath,
  getCurrentPublicPath,
} from "./helpers.js";

/* =========================================================
   HELPERS
========================================================= */

function safeLog(AppCore, ...args) {
  try {
    AppCore?.utils?.log?.(...args);
  } catch {}
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(...args);
  } catch {}
}

function isFunction(value) {
  return typeof value === "function";
}

function getResolvedSessionUser(AppCore) {
  return (
    AppCore?.state?.user?.username ||
    AppCore?.state?.user?.email ||
    null
  );
}

function getResolvedSessionRole(AppCore) {
  return AppCore?.state?.role || null;
}

function shouldSkipNavigation(state) {
  return Boolean(
    state?.bootNavigationHandled ||
    state?.initialRouteRendered
  );
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
  if (!AppCore || !Router) {
    return false;
  }

  if (!AppCore?.state?.authenticated) {
    return false;
  }

  if (shouldSkipNavigation(state)) {
    safeLog(
      AppCore,
      "navigateAfterSessionRestore() omitido: navegación ya resuelta en este ciclo."
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
        Boolean(
          AppCore?.state
            ?.authenticated
        ),
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

  /* Solo navegar si seguimos en login.
     En cualquier otra ruta NO tocar nada:
     el render inicial debe resolver la URL actual. */
  if (
    currentCanonicalPath !==
    "/login"
  ) {
    return false;
  }

  const target =
    isFunction(
      Auth?.getPostLoginTarget
    )
      ? Auth.getPostLoginTarget(
          AppCore.state.user
        ) || "/"
      : "/";

  state &&
    (state.bootNavigationHandled =
      true);

  if (
    isFunction(
      Router.goAfterLogin
    )
  ) {
    Router.goAfterLogin(target);
    return true;
  }

  Router.navigate(target, {
    replaceState: true,
    force: true,
  });

  return true;
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
    state?.sessionRestorePromise
  ) {
    return state.sessionRestorePromise;
  }

  if (
    !Auth ||
    !isFunction(
      Auth.restoreSession
    )
  ) {
    syncUserUI?.(AppCore);

    return {
      ok: false,
      authenticated:
        Boolean(
          AppCore?.state
            ?.authenticated
        ),
      user:
        getResolvedSessionUser(
          AppCore
        ),
      role:
        getResolvedSessionRole(
          AppCore
        ),
    };
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

        syncUserUI?.(AppCore);

        const snapshot = {
          ok:
            Boolean(result?.ok),
          authenticated:
            Boolean(
              AppCore?.state
                ?.authenticated
            ),
          user:
            getResolvedSessionUser(
              AppCore
            ),
          role:
            getResolvedSessionRole(
              AppCore
            ),
        };

        safeLog(
          AppCore,
          "Restore session completado:",
          snapshot
        );

        return {
          ...(result || {}),
          ok:
            Boolean(result?.ok),
          authenticated:
            snapshot.authenticated,
          user:
            AppCore?.state?.user ||
            result?.user ||
            null,
          role: snapshot.role,
        };
      } catch (error) {
        safeWarn(
          AppCore,
          "restoreAuthSession() error:",
          error
        );

        syncUserUI?.(AppCore);

        return {
          ok: false,
          authenticated:
            Boolean(
              AppCore?.state
                ?.authenticated
            ),
          user:
            AppCore?.state?.user ||
            null,
          role:
            getResolvedSessionRole(
              AppCore
            ),
          error,
        };
      } finally {
        if (state) {
          state.sessionRestorePromise =
            null;
        }
      }
    })();

  return state.sessionRestorePromise;
}

/* =========================================================
   RESTORE DURANTE BOOT
   CRÍTICO:
   - bloquear boot hasta resolver auth
   - warmup después del restore
   - sin renders intermedios
   - sin navigate fantasma salvo login
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
    if (state) {
      state.bootNavigationHandled =
        false;
    }

    const result =
      await restoreAuthSession({
        AppCore,
        Auth,
        syncUserUI,
        state,
      });

    await warmup?.(AppCore);

    /* SOLO navegación explícita si quedó realmente en /login.
       En rutas protegidas o contextualizadas NO navegar aquí,
       para no provocar doble render ni perder username en URL. */
    navigateAfterSessionRestore({
      AppCore,
      Auth,
      Router,
      state,
    });

    return {
      ...(result || {}),
      ok:
        Boolean(result?.ok),
      authenticated:
        Boolean(
          AppCore?.state
            ?.authenticated
        ),
      user:
        AppCore?.state?.user ||
        result?.user ||
        null,
      role:
        getResolvedSessionRole(
          AppCore
        ),
    };
  } catch (error) {
    safeWarn(
      AppCore,
      "restoreSessionInBackground() falló:",
      error
    );

    syncUserUI?.(AppCore);

    return {
      ok: false,
      authenticated:
        Boolean(
          AppCore?.state
            ?.authenticated
        ),
      user:
        AppCore?.state?.user ||
        null,
      role:
        getResolvedSessionRole(
          AppCore
        ),
      error,
    };
  }
}
