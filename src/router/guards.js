/* =========================================================
   Onion SPA - Router Guards
   Archivo: src/router/guards.js

   Responsabilidades:
   - evaluar acceso a rutas públicas / privadas
   - redirigir fuera de /login si ya existe sesión
   - redirigir a login cuando falta autenticación
   - validar acceso por rol
========================================================= */

import {
  getRouteNames,
  getRedirectPath,
  getDefaultHomeTarget,
  buildLoginUrl,
} from "./helpers.js";

export function shouldAllowRoute({
  AppCore,
  Auth,
  route,
  requestedCanonicalPath = "/",
  getRoute,
}) {
  const routeNames = getRouteNames(AppCore);

  if (!route) {
    return {
      allowed: false,
      reason: "not-found",
      redirectTo: null,
    };
  }

  if (route.path === routeNames.LOGIN && Auth.isAuthenticated()) {
    return {
      allowed: false,
      reason: "already-authenticated",
      redirectTo:
        getRedirectPath(AppCore) ||
        getDefaultHomeTarget(AppCore, getRoute),
    };
  }

  if (route.public) {
    return {
      allowed: true,
      reason: null,
      redirectTo: null,
    };
  }

  if (!Auth.isAuthenticated()) {
    return {
      allowed: false,
      reason: "not-authenticated",
      redirectTo: buildLoginUrl(AppCore, requestedCanonicalPath),
    };
  }

  if (route.roles?.length && !Auth.hasRole(...route.roles)) {
    return {
      allowed: false,
      reason: "insufficient-role",
      redirectTo: getDefaultHomeTarget(AppCore, getRoute),
    };
  }

  return {
    allowed: true,
    reason: null,
    redirectTo: null,
  };
}
