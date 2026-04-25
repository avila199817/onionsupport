/* =========================================================
   Onion SPA - Router Guards
   Archivo: src/router/guards.js

   RESPONSABILIDADES:
   - resolver acceso a rutas
   - guards auth / guest / roles
   - redirects centralizados
   - tolerancia config heterogénea
   - salida estable para Router
   - permitir rutas públicas técnicas aunque exista sesión
   - no bloquear /activate-account, /reset-password, confirm reset

   HARDENING EXTREMO:
   - rutas públicas por defecto
   - normalización robusta de roles
   - soporte meta.requiresAuth / guestOnly / roles
   - redirects consistentes
   - prioridad clara entre auth / guest / roles
   - compatibilidad route.public / route.private / meta.public
   - fallback seguro si Auth falla
   - bypass seguro para rutas públicas técnicas
========================================================= */

import {
  getRouteNames,
  normalizeCanonicalPath,
  getDefaultHomeTarget,
} from "./helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const PUBLIC_TECHNICAL_ROUTES = new Set([
  "/activate-account",
  "/reset-password",
  "/reset-password/confirm",
  "/forgot-password",
  "/recover-password",
  "/password-reset",
]);

/* =========================================================
   HELPERS
========================================================= */

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return [];
  }

  return [value];
}

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeRoles(value) {
  return toArray(value)
    .flat()
    .map(normalizeRole)
    .filter(Boolean);
}

function routeMeta(route) {
  return route?.meta &&
    typeof route.meta === "object"
    ? route.meta
    : {};
}

function getUserRole(AppCore) {
  return normalizeRole(
    AppCore?.state?.role ||
      AppCore?.state?.user?.role ||
      AppCore?.state?.user?.rol ||
      ""
  );
}

function isAuthenticated(
  AppCore,
  Auth
) {
  if (
    typeof Auth?.isAuthenticated === "function"
  ) {
    try {
      return Boolean(
        Auth.isAuthenticated()
      );
    } catch {}
  }

  return Boolean(
    AppCore?.state?.authenticated
  );
}

function isRouteExplicitlyPublic(route) {
  const meta =
    routeMeta(route);

  if (
    typeof route?.public === "boolean"
  ) {
    return route.public;
  }

  if (
    typeof meta.public === "boolean"
  ) {
    return meta.public;
  }

  return false;
}

function getRouteRoles(route) {
  const meta =
    routeMeta(route);

  return normalizeRoles(
    route?.roles ??
      route?.allowRoles ??
      meta.roles ??
      meta.allowRoles ??
      meta.requireRoles ??
      []
  );
}

function routeRequiresAuth(route) {
  const meta =
    routeMeta(route);

  if (
    typeof route?.requiresAuth === "boolean"
  ) {
    return route.requiresAuth;
  }

  if (
    typeof route?.private === "boolean"
  ) {
    return route.private;
  }

  if (
    typeof meta.requiresAuth === "boolean"
  ) {
    return meta.requiresAuth;
  }

  if (
    typeof meta.private === "boolean"
  ) {
    return meta.private;
  }

  if (
    getRouteRoles(route).length > 0
  ) {
    return true;
  }

  if (
    isRouteExplicitlyPublic(route)
  ) {
    return false;
  }

  return false;
}

function routeGuestOnly(route) {
  const meta =
    routeMeta(route);

  return Boolean(
    route?.guestOnly ??
      route?.publicOnly ??
      meta.guestOnly ??
      meta.publicOnly ??
      false
  );
}

function isPublicTechnicalRoute(
  route,
  canonicalPath = "/"
) {
  if (!route) {
    return false;
  }

  if (
    !isRouteExplicitlyPublic(route)
  ) {
    return false;
  }

  if (
    routeGuestOnly(route)
  ) {
    return false;
  }

  return PUBLIC_TECHNICAL_ROUTES.has(
    canonicalPath
  );
}

function getAuthenticatedRedirectTarget(
  AppCore,
  route,
  getRoute
) {
  return (
    route?.redirectAuthenticated ||
    route?.redirectIfAuth ||
    getDefaultHomeTarget(
      AppCore,
      getRoute
    )
  );
}

function buildAllowResult({
  route,
  canonicalPath,
  publicPath = null,
  getRoute,
} = {}) {
  return {
    allowed: true,
    reason: null,
    route: route || null,
    redirectTo: null,
    canonicalPath,
    publicPath,
    getRoute:
      typeof getRoute === "function"
        ? getRoute
        : null,
  };
}

function buildDenyResult({
  reason,
  route,
  redirectTo = null,
  canonicalPath,
  publicPath = null,
} = {}) {
  return {
    allowed: false,
    reason: reason || "blocked",
    route: route || null,
    redirectTo: redirectTo || null,
    canonicalPath,
    publicPath,
  };
}

/* =========================================================
   MAIN
========================================================= */

export function shouldAllowRoute({
  AppCore,
  Auth,
  route,
  requestedCanonicalPath = "/",
  requestedPublicPath = null,
  getRoute,
} = {}) {
  const routeNames =
    getRouteNames(AppCore);

  const canonicalPath =
    normalizeCanonicalPath(
      AppCore,
      requestedCanonicalPath
    );

  const publicPath =
    requestedPublicPath || canonicalPath;

  /*
    Ruta inexistente:
    no bloquear aquí. El Router debe resolver 404.
  */
  if (!route) {
    return buildAllowResult({
      route: null,
      canonicalPath,
      publicPath,
      getRoute,
    });
  }

  /*
    CRÍTICO:
    Rutas públicas técnicas deben pasar siempre.
    Ejemplo:
      /activate-account?token=XXX
    No deben redirigirse aunque exista sesión previa.
  */
  if (
    isPublicTechnicalRoute(
      route,
      canonicalPath
    )
  ) {
    return buildAllowResult({
      route,
      canonicalPath,
      publicPath,
      getRoute,
    });
  }

  const logged =
    isAuthenticated(
      AppCore,
      Auth
    );

  const currentRole =
    getUserRole(AppCore);

  const guestOnly =
    routeGuestOnly(route);

  const allowedRoles =
    getRouteRoles(route);

  const requiresAuth =
    routeRequiresAuth(route);

  /*
    Guest-only:
    normalmente solo /login.
  */
  if (
    guestOnly &&
    logged
  ) {
    return buildDenyResult({
      reason: "already-authenticated",
      route,
      redirectTo:
        getAuthenticatedRedirectTarget(
          AppCore,
          route,
          getRoute
        ) || routeNames.HOME,
      canonicalPath,
      publicPath,
    });
  }

  /*
    Requires auth.
  */
  if (
    requiresAuth &&
    !logged
  ) {
    return buildDenyResult({
      reason: "not-authenticated",
      route,
      redirectTo: routeNames.LOGIN,
      canonicalPath,
      publicPath,
    });
  }

  /*
    Roles y no logueado.
  */
  if (
    allowedRoles.length > 0 &&
    !logged
  ) {
    return buildDenyResult({
      reason: "not-authenticated",
      route,
      redirectTo: routeNames.LOGIN,
      canonicalPath,
      publicPath,
    });
  }

  /*
    Roles y logueado.
  */
  if (
    allowedRoles.length > 0 &&
    logged
  ) {
    const hasAllowedRole =
      allowedRoles.includes(
        currentRole
      );

    if (!hasAllowedRole) {
      return buildDenyResult({
        reason: "insufficient-role",
        route,
        redirectTo:
          route.redirectForbidden ||
          null,
        canonicalPath,
        publicPath,
      });
    }
  }

  return buildAllowResult({
    route,
    canonicalPath,
    publicPath,
    getRoute,
  });
}

export default {
  shouldAllowRoute,
};
