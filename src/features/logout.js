/* =========================================================
   Onion SPA - Auth Logout
   Archivo: src/features/auth/logout.js

   Responsabilidades:
   - cerrar sesión local y remota
   - mantener logout robusto aunque falle backend
   - emitir eventos de logout
   - redirigir tras logout cuando proceda
========================================================= */

import { AppCore } from "../../core/core.js";

import {
  hasValidToken,
  configLikeRoute,
} from "./helpers.js";

import {
  AUTH_ENDPOINTS,
} from "./constants.js";

import {
  clearSessionLocal,
} from "./session.js";

export async function logout(options = {}) {
  const {
    silent = false,
    redirectTo = "/",
    notifyServer = true,
  } = options;

  AppCore.events.emit("auth:logout:start", {});

  try {
    if (notifyServer && hasValidToken()) {
      await AppCore.apiClient.post(
        AUTH_ENDPOINTS.logout,
        null,
        {
          auth: true,
        }
      );
    }
  } catch (error) {
    AppCore.utils.warn(
      "Logout remoto falló, se limpiará sesión local igualmente.",
      error
    );
  } finally {
    clearSessionLocal();

    AppCore.events.emit("auth:logout:success", {
      redirectTo,
    });

    if (!silent && typeof window !== "undefined") {
      const nextPath = configLikeRoute(redirectTo);

      const router = AppCore.modules?.get?.("router");

      if (router && typeof router.navigate === "function") {
        router.navigate(nextPath, {
          replaceState: true,
          force: true,
        });
      } else {
        window.history.replaceState({}, "", nextPath);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    }
  }

  return {
    ok: true,
  };
}
