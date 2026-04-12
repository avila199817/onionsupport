/* =========================================================
   Onion SPA - App Session Bootstrap
   Archivo: src/app/session.js

   Responsabilidades:
   - restaurar sesión de forma bloqueante durante el boot
   - evitar restores duplicados en paralelo
   - sincronizar UI de usuario tras restore
   - exponer navegación post-restore solo para usos explícitos
========================================================= */

import {
  getCurrentCanonicalPath,
  getCurrentPublicPath,
} from "./helpers.js";

/* =========================================================
   NAVEGACIÓN POST-RESTORE
   Nota:
   - durante el boot normal ya no debe forzar rerender si la ruta
     inicial se pinta después del restore
   - se mantiene como helper por compatibilidad para flujos explícitos
========================================================= */
export function navigateAfterSessionRestore({
  AppCore,
  Auth,
  Router,
  forceRender = false,
} = {}) {
  if (!AppCore || !Router) return;
  if (!AppCore.state.authenticated) return;
  if (!forceRender) return;

  const currentCanonicalPath =
    getCurrentCanonicalPath(AppCore, Router);

  if (currentCanonicalPath === "/login") {
    const target =
      typeof Router.goAfterLogin === "function"
        ? null
        : typeof Auth?.getPostLoginTarget === "function"
          ? Auth.getPostLoginTarget(
              AppCore.state.user
            )
          : "/";

    if (
      typeof Router.goAfterLogin ===
      "function"
    ) {
      Router.goAfterLogin("/");
      return;
    }

    Router.navigate(target || "/", {
      replaceState: true,
      force: true,
    });

    return;
  }

  Router.render(
    getCurrentPublicPath(AppCore),
    {
      skipHistory: true,
      replaceState: true,
      force: true,
    }
  );
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
  if (state?.sessionRestorePromise) {
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
        const result =
          await Auth.restoreSession();

        syncUserUI?.(AppCore);

        AppCore?.utils?.log?.(
          "Resultado restoreSession():",
          {
            ok: Boolean(result?.ok),
            authenticated:
              AppCore?.state
                ?.authenticated,
            user:
              AppCore?.state?.user
                ?.username ||
              AppCore?.state?.user
                ?.email ||
              null,
          }
        );

        return result || {
          ok: false,
          user: null,
        };
      } catch (error) {
        AppCore?.utils?.warn?.(
          "restoreAuthSession() falló.",
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
   RESTORE SESSION DURANTE BOOT
   Nota:
   - esta función YA NO trabaja "en background"
   - no debe navegar ni rerenderizar durante el boot
   - warmup se ejecuta después del restore para que ya exista el estado
     auth resuelto antes del primer render real
========================================================= */
export async function restoreSessionInBackground({
  AppCore,
  Auth,
  Router,
  Toast,
  state,
  syncUserUI,
  warmup,
  navigateAfterSessionRestore,
  applyPostRenderLoaderPolicy,
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

    return result || {
      ok: false,
      user: null,
    };
  } catch (error) {
    AppCore?.utils?.warn?.(
      "restoreSession() falló durante boot.",
      error
    );

    return {
      ok: false,
      user: null,
      error,
    };
  }
}
