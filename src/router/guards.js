/* =========================================================
   Onion SPA - Router Guards
   Archivo: src/router/guards.js

   Responsabilidades:
   - evaluar acceso a rutas públicas / privadas
   - redirigir fuera de /login si existe sesión
   - redirigir a login cuando falta auth
   - validar acceso por rol
   - soportar boot/restoring seguro
   - devolver motivos normalizados
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
  /* compatibilidad legacy */
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

function buildAllowed() {
  return {
    allowed: true,
    reason: null,
    redirectTo: null,
  };
}

function buildDenied(
  reason,
  redirectTo = null
) {
  return {
    allowed: false,
    reason,
    redirectTo,
  };
}

function hasRouteRoles(
  route
) {
  return Array.isArray(
    route?.roles
  ) && route.roles.length > 0;
}

function isLoginRoute(
  route,
  routeNames
) {
  return (
    route?.path ===
    routeNames.LOGIN
  );
}

function isPublicRoute(
  route
) {
  return Boolean(
    route?.public
  );
}

function isAuthenticated(
  Auth
) {
  return Boolean(
    Auth?.isAuthenticated?.()
  );
}

function hasRequiredRole(
  Auth,
  route
) {
  if (!hasRouteRoles(route)) {
    return true;
  }

  return Boolean(
    Auth?.hasRole?.(
      ...route.roles
    )
  );
}

/* =========================================================
   LOGIN GUARD
========================================================= */
function evaluateLoginRoute({
  AppCore,
  authenticated,
  authReady,
  getRoute,
}) {
  if (
    authenticated &&
    authReady
  ) {
    return buildDenied(
      "already-authenticated",
      getRedirectPath(
        AppCore
      ) ||
        getDefaultHomeTarget(
          AppCore,
          getRoute
        )
    );
  }

  return buildAllowed();
}

/* =========================================================
   PRIVATE GUARD
========================================================= */
function evaluatePrivateRoute({
  AppCore,
  Auth,
  route,
  authenticated,
  requestedCanonicalPath,
  getRoute,
}) {
  if (
    !authenticated
  ) {
    return buildDenied(
      "not-authenticated",
      buildLoginUrl(
        AppCore,
        requestedCanonicalPath
      )
    );
  }

  if (
    !hasRequiredRole(
      Auth,
      route
    )
  ) {
    return buildDenied(
      "insufficient-role",
      getDefaultHomeTarget(
        AppCore,
        getRoute
      )
    );
  }

  return buildAllowed();
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
    return buildDenied(
      "not-found",
      null
    );
  }

  const authenticated =
    isAuthenticated(
      Auth
    );

  const authReady =
    isAuthReady(
      AppCore
    );

  /* =====================================
     LOGIN
  ===================================== */
  if (
    isLoginRoute(
      route,
      routeNames
    )
  ) {
    return evaluateLoginRoute({
      AppCore,
      authenticated,
      authReady,
      getRoute,
    });
  }

  /* =====================================
     PUBLIC
  ===================================== */
  if (
    isPublicRoute(
      route
    )
  ) {
    return buildAllowed();
  }

  /* =====================================
     PRIVATE
  ===================================== */
  return evaluatePrivateRoute({
    AppCore,
    Auth,
    route,
    authenticated,
    requestedCanonicalPath,
    getRoute,
  });
}
