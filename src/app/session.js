/* =========================================================
   Onion SPA - App Session Bootstrap
   Archivo: src/app/session.js

   Responsabilidades:
   - restaurar sesión sin bloquear el primer paint
   - navegar tras restaurar sesión si corresponde
   - evitar restores duplicados en paralelo
   - coordinar toast de progreso / éxito / fallback
========================================================= */

import {
  getCurrentCanonicalPath,
  getCurrentPublicPath,
} from "./helpers.js";

export function navigateAfterSessionRestore({
  AppCore,
  Auth,
  Router,
}) {
  if (!AppCore.state.authenticated) return;

  const currentCanonicalPath = getCurrentCanonicalPath(AppCore, Router);

  if (currentCanonicalPath === "/login") {
    const target =
      typeof Router.goAfterLogin === "function"
        ? null
        : typeof Auth.getPostLoginTarget === "function"
          ? Auth.getPostLoginTarget(AppCore.state.user)
          : "/";

    if (typeof Router.goAfterLogin === "function") {
      Router.goAfterLogin("/");
      return;
    }

    Router.navigate(target || "/", {
      replaceState: true,
      force: true,
    });

    return;
  }

  Router.render(getCurrentPublicPath(AppCore), {
    skipHistory: true,
    replaceState: true,
    force: true,
  });
}

export async function restoreAuthSession({
  AppCore,
  Auth,
  syncUserUI,
  state,
}) {
  if (state?.sessionRestorePromise) {
    return state.sessionRestorePromise;
  }

  if (typeof Auth.restoreSession !== "function") {
    return {
      ok: false,
      user: null,
    };
  }

  state.sessionRestorePromise = (async () => {
    try {
      const result = await Auth.restoreSession();

      syncUserUI?.(AppCore);

      AppCore.utils.log("Resultado restoreSession():", {
        ok: Boolean(result?.ok),
        authenticated: AppCore.state.authenticated,
        user:
          AppCore.state.user?.username ||
          AppCore.state.user?.email ||
          null,
      });

      return result;
    } finally {
      state.sessionRestorePromise = null;
    }
  })();

  return state.sessionRestorePromise;
}

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
}) {
  let loadingToastId = null;

  try {
    loadingToastId = Toast?.loading?.("Restaurando sesión...", {
      title: "Inicializando",
      closable: false,
    });

    const result = await restoreAuthSession({
      AppCore,
      Auth,
      syncUserUI,
      state,
    });

    await warmup?.(AppCore);

    if (result?.ok && AppCore.state.authenticated) {
      if (loadingToastId && typeof Toast?.update === "function") {
        Toast.update(loadingToastId, {
          type: "success",
          title: "Sesión restaurada",
          message: "Tu sesión se ha recuperado correctamente.",
          duration: 1800,
          closable: true,
        });
      }

      navigateAfterSessionRestore?.({
        AppCore,
        Auth,
        Router,
      });
    } else {
      if (loadingToastId) {
        if (typeof Toast?.dismiss === "function") {
          Toast.dismiss(loadingToastId);
        } else if (typeof Toast?.update === "function") {
          Toast.update(loadingToastId, {
            type: "info",
            title: "Inicialización completada",
            message: "Se continuará sin restaurar la sesión.",
            duration: 1800,
            closable: true,
          });
        }
      }

      applyPostRenderLoaderPolicy?.();
    }

    return result;
  } catch (error) {
    AppCore.utils.warn("restoreSession en background falló.", error);

    if (loadingToastId) {
      if (typeof Toast?.update === "function") {
        Toast.update(loadingToastId, {
          type: "warning",
          title: "Sesión no restaurada",
          message: "Se continuará sin restaurar la sesión.",
          duration: 2600,
          closable: true,
        });
      } else if (typeof Toast?.dismiss === "function") {
        Toast.dismiss(loadingToastId);
      }
    }

    applyPostRenderLoaderPolicy?.();

    return {
      ok: false,
      user: null,
      error,
    };
  }
}
