/* =========================================================
   Onion SPA - Router Guards
   Archivo: src/router/guards.js

   Responsabilidades:
   - resolver acceso a rutas
   - guards auth / guest / roles
   - redirects centralizados
   - tolerancia config heterogénea
   - salida estable para Router

   HARDENING:
   - rutas públicas por defecto
   - normalización robusta de roles
   - soporte meta.requiresAuth / guestOnly / roles
========================================================= */

import {
  getRouteNames,
  normalizeCanonicalPath,
} from "./helpers.js";

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
  return String(
    value || ""
  )
    .trim()
    .toLowerCase();
}

function normalizeRoles(value) {
  return toArray(value)
    .flat()
    .map(normalizeRole)
    .filter(Boolean);
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
    typeof Auth
      ?.isAuthenticated ===
    "function"
  ) {
    try {
      return Boolean(
        Auth.isAuthenticated()
      );
    } catch {}
  }

  return Boolean(
    AppCore?.state
      ?.authenticated
  );
}

function routeMeta(route) {
  return route?.meta &&
    typeof route.meta ===
      "object"
    ? route.meta
    : {};
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

function routeRequiresAuth(
  route
) {
  const meta =
    routeMeta(route);

  return Boolean(
    route?.requiresAuth ??
      route?.private ??
      meta.requiresAuth ??
      meta.private ??
      false
  );
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

/* =========================================================
   MAIN
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

  const canonicalPath =
    normalizeCanonicalPath(
      AppCore,
      requestedCanonicalPath
    );

  /* ruta inexistente:
     no bloquear aquí */
  if (!route) {
    return {
      allowed: true,
      reason: null,
      route: null,
      redirectTo: null,
      canonicalPath,
    };
  }

  const logged =
    isAuthenticated(
      AppCore,
      Auth
    );

  const currentRole =
    getUserRole(AppCore);

  const requiresAuth =
    routeRequiresAuth(
      route
    );

  const guestOnly =
    routeGuestOnly(
      route
    );

  const allowedRoles =
    getRouteRoles(route);

  /* guest only */
  if (
    guestOnly &&
    logged
  ) {
    return {
      allowed: false,
      reason:
        "already-authenticated",
      route,
      redirectTo:
        route.redirectAuthenticated ||
        route.redirectIfAuth ||
        routeNames.HOME,
      canonicalPath,
    };
  }

  /* requires auth */
  if (
    requiresAuth &&
    !logged
  ) {
    return {
      allowed: false,
      reason:
        "not-authenticated",
      route,
      redirectTo:
        routeNames.LOGIN,
      canonicalPath,
    };
  }

  /* roles */
  if (
    allowedRoles.length >
      0 &&
    logged
  ) {
    const ok =
      allowedRoles.includes(
        currentRole
      );

    if (!ok) {
      return {
        allowed: false,
        reason:
          "insufficient-role",
        route,
        redirectTo:
          route.redirectForbidden ||
          null,
        canonicalPath,
      };
    }
  }

  /* si define roles y no está logueado */
  if (
    allowedRoles.length >
      0 &&
    !logged
  ) {
    return {
      allowed: false,
      reason:
        "not-authenticated",
      route,
      redirectTo:
        routeNames.LOGIN,
      canonicalPath,
    };
  }

  return {
    allowed: true,
    reason: null,
    route,
    redirectTo: null,
    canonicalPath,
    getRoute:
      typeof getRoute ===
      "function"
        ? getRoute
        : null,
  };
}
