/* =========================================================
   Onion SPA - App Session Bootstrap
   Archivo: src/app/session.js

   Responsabilidades:
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

/* =========================================================
   NAVEGACIÓN POST RESTORE
========================================================= */

export function navigateAfterSessionRestore({
  AppCore,
  Auth,
  Router,
} = {}) {
  if (!AppCore || !Router) {
    return false;
  }

  if (!AppCore?.state?.authenticated) {
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
    }
  );

  /* Si está en login -> salir */
  if (
    currentCanonicalPath ===
    "/login"
  ) {
    if (
      typeof Router.goAfterLogin ===
      "function"
    ) {
      Router.goAfterLogin("/");
      return true;
    }

    const target =
      typeof Auth?.getPostLoginTarget ===
      "function"
        ? Auth.getPostLoginTarget(
            AppCore.state.user
          )
        : "/";

    Router.navigate(
      target || "/",
      {
        replaceState: true,
        force: true,
      }
    );

    return true;
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
    state?.sessionRestorePromise
  ) {
    return state.sessionRestorePromise;
  }

  if (
    !Auth ||
    typeof Auth.restoreSession !==
      "function"
  ) {
    return {
      ok: false,
      user: null,
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
            AppCore?.state?.user
              ?.username ||
            AppCore?.state?.user
              ?.email ||
            null,

          role:
            AppCore?.state?.role ||
            null,
        };

        safeLog(
          AppCore,
          "Restore session completado:",
          snapshot
        );

        return (
          result || {
            ok: false,
            user: null,
          }
        );
      } catch (error) {
        safeWarn(
          AppCore,
          "restoreAuthSession() error:",
          error
        );

        syncUserUI?.(AppCore);

        return {
          ok: false,
          user: null,
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
    const result =
      await restoreAuthSession({
        AppCore,
        Auth,
        syncUserUI,
        state,
      });

    await warmup?.(AppCore);

    /* Solo navegación explícita si quedó en login */
    navigateAfterSessionRestore({
      AppCore,
      Auth,
      Router,
    });

    return (
      result || {
        ok: false,
        user: null,
      }
    );
  } catch (error) {
    safeWarn(
      AppCore,
      "restoreSessionInBackground() falló:",
      error
    );

    return {
      ok: false,
      user: null,
      error,
    };
  }
}
