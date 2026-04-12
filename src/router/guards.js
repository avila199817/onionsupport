/* =========================================================
   Onion SPA - Router Guards
   Archivo: src/router/guards.js

   Responsabilidades:
   - evaluar acceso a rutas públicas / privadas
   - redirigir fuera de /login si existe sesión
   - redirigir a login cuando falta auth
   - validar acceso por rol
   - soportar boot/restoring seguro
========================================================= */

import {
  getRouteNames,
  getRedirectPath,
  getDefaultHomeTarget,
  buildLoginUrl,
} from "./helpers.js";

/* =========================================================
   HELPERS
========================================================= */
function isAuthReady(
  AppCore
) {
  /* Si no existe flag, asumimos ready para compatibilidad */
  if (
    typeof AppCore?.state
      ?.booting ===
    "boolean"
  ) {
    return !AppCore.state
      .booting;
  }

  return true;
}

/* =========================================================
   MAIN GUARD
========================================================= */
export function shouldAllowRoute({
  AppCore,
  Auth,
  route,
  requestedCanonicalPath = "/",
  getRoute,
} = {}) {
  const routeNames =
    getRouteNames(
      AppCore
    );

  if (!route) {
    return {
      allowed: false,
      reason:
        "not-found",
      redirectTo:
        null,
    };
  }

  const authenticated =
    Boolean(
      Auth?.isAuthenticated?.()
    );

  const authReady =
    isAuthReady(
      AppCore
    );

  /* =====================================================
     LOGIN ROUTE
  ===================================================== */
  if (
    route.path ===
    routeNames.LOGIN
  ) {
    if (
      authenticated &&
      authReady
    ) {
      return {
        allowed: false,
        reason:
          "already-authenticated",
        redirectTo:
          getRedirectPath(
            AppCore
          ) ||
          getDefaultHomeTarget(
            AppCore,
            getRoute
          ),
      };
    }

    return {
      allowed: true,
      reason: null,
      redirectTo:
        null,
    };
  }

  /* =====================================================
     PUBLIC ROUTE
  ===================================================== */
  if (route.public) {
    return {
      allowed: true,
      reason: null,
      redirectTo:
        null,
    };
  }

  /* =====================================================
     PRIVATE ROUTE
  ===================================================== */
  if (
    !authenticated
  ) {
    return {
      allowed: false,
      reason:
        "not-authenticated",
      redirectTo:
        buildLoginUrl(
          AppCore,
          requestedCanonicalPath
        ),
    };
  }

  /* =====================================================
     ROLE CHECK
  ===================================================== */
  if (
    route.roles
      ?.length &&
    !Auth.hasRole(
      ...route.roles
    )
  ) {
    return {
      allowed: false,
      reason:
        "insufficient-role",
      redirectTo:
        getDefaultHomeTarget(
          AppCore,
          getRoute
        ),
    };
  }

  return {
    allowed: true,
    reason: null,
    redirectTo:
      null,
  };
}
