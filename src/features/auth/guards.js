/* =========================================================
   Onion SPA - Auth Guards
   Archivo: src/features/auth/guards.js

   Responsabilidades:
   - exponer helpers auth de estado
   - validar acceso por rol
   - bloquear navegación no autenticada
   - construir redirect seguro al login
   - exponer header Authorization
========================================================= */

import { AppCore } from "../../core/core.js";

import {
  hasValidToken,
  getCurrentCanonicalPath,
  extractMessage,
} from "./helpers.js";

import {
  buildLoginRedirectPath,
} from "./login.js";

/* =========================================================
   AUTH STATE
========================================================= */
export function isAuthenticated() {
  return Boolean(AppCore.state.authenticated);
}

export function getCurrentRole() {
  return String(AppCore.state.role || "")
    .trim()
    .toLowerCase();
}

export function hasRole(...roles) {
  if (!roles.length) return true;

  const currentRole = getCurrentRole();
  if (!currentRole) return false;

  return roles
    .flat()
    .map((role) => String(role || "").trim().toLowerCase())
    .filter(Boolean)
    .includes(currentRole);
}

export function requireRole(...roles) {
  return isAuthenticated() && hasRole(...roles);
}

export function getAuthHeader() {
  if (!hasValidToken()) {
    return {};
  }

  return {
    Authorization: `Bearer ${AppCore.state.token}`,
  };
}

/* =========================================================
   ROUTE GUARDS
========================================================= */
export function guardAuthenticated(options = {}) {
  const {
    redirectTo = "/login",
    hardRedirect = false,
    withRedirectBack = true,
  } = options;

  if (isAuthenticated()) {
    return true;
  }

  const currentPath = getCurrentCanonicalPath();

  const finalRedirect = withRedirectBack
    ? buildLoginRedirectPath(currentPath)
    : String(redirectTo || "/login").trim() || "/login";

  AppCore.events.emit("auth:guard:blocked", {
    reason: "not-authenticated",
    redirectTo: finalRedirect,
    path: currentPath,
  });

  if (hardRedirect && typeof window !== "undefined") {
    window.location.href = finalRedirect;
  }

  return false;
}

export function guardRole(roles = [], options = {}) {
  const roleList = Array.isArray(roles) ? roles : [roles];
  const { redirectTo = "/" } = options;

  if (!isAuthenticated()) {
    AppCore.events.emit("auth:guard:blocked", {
      reason: "not-authenticated",
      redirectTo: buildLoginRedirectPath(getCurrentCanonicalPath()),
      path: getCurrentCanonicalPath(),
    });

    return false;
  }

  if (hasRole(...roleList)) {
    return true;
  }

  AppCore.events.emit("auth:guard:blocked", {
    reason: "insufficient-role",
    currentRole: AppCore.state.role,
    requiredRoles: roleList,
    redirectTo,
    path: getCurrentCanonicalPath(),
  });

  return false;
}

/* =========================================================
   ERROR HELPER
========================================================= */
export function buildGuardErrorPayload(error) {
  return {
    error,
    message: extractMessage(error),
  };
}
