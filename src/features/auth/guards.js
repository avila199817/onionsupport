/* =========================================================
   Onion SPA - Auth Guards
   Archivo: src/features/auth/guards.js

   Responsabilidades:
   - exponer helpers auth de estado
   - validar acceso por rol
   - bloquear navegación no autenticada
   - construir redirect seguro al login
   - exponer header Authorization

   HARDENING PRO:
   - sync auth robusto con token real
   - navegación opcional automática
   - eventos consistentes
   - roles normalizados
   - guards reutilizables SPA/router
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  hasValidToken,
  getCurrentCanonicalPath,
  extractMessage,
} from "./helpers.js";

import {
  buildLoginRedirectPath,
} from "./login.js";

/* =========================================================
   HELPERS
========================================================= */

function safeText(
  value,
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeEmit(
  eventName,
  payload = {}
) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}
}

function normalizeRole(
  value = ""
) {
  return safeText(
    value
  ).toLowerCase();
}

function getRouter() {
  return (
    AppCore?.modules?.get?.(
      "router"
    ) ||
    AppCore?.router ||
    null
  );
}

function navigateTo(
  path = "/"
) {
  try {
    const router =
      getRouter();

    if (
      typeof router?.navigate ===
      "function"
    ) {
      router.navigate(
        path,
        {
          replaceState: true,
          force: true,
        }
      );

      return true;
    }
  } catch {}

  if (
    typeof window !==
    "undefined"
  ) {
    window.location.assign(
      path
    );
  }

  return true;
}

function syncAuthState() {
  const token =
    AppCore?.state?.token;

  const authenticated =
    hasValidToken(
      token
    );

  try {
    AppCore.state.authenticated =
      authenticated;
  } catch {}

  return authenticated;
}

/* =========================================================
   AUTH STATE
========================================================= */

export function isAuthenticated() {
  return Boolean(
    syncAuthState()
  );
}

export function getCurrentRole() {
  return normalizeRole(
    AppCore?.state?.role ??
      AppCore?.state?.user
        ?.role ??
      AppCore?.state?.user
        ?.rol ??
      ""
  );
}

export function hasRole(
  ...roles
) {
  if (!roles.length) {
    return true;
  }

  const currentRole =
    getCurrentRole();

  if (!currentRole) {
    return false;
  }

  return roles
    .flat()
    .map((role) =>
      normalizeRole(role)
    )
    .filter(Boolean)
    .includes(
      currentRole
    );
}

export function requireRole(
  ...roles
) {
  return (
    isAuthenticated() &&
    hasRole(...roles)
  );
}

export function getAuthHeader() {
  const token =
    AppCore?.state?.token;

  if (
    !hasValidToken(
      token
    )
  ) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

/* =========================================================
   ROUTE GUARDS
========================================================= */

export function guardAuthenticated(
  options = {}
) {
  const {
    redirectTo = "/login",
    withRedirectBack = true,
    autoNavigate = false,
    hardRedirect = false,
  } = options;

  if (
    isAuthenticated()
  ) {
    return true;
  }

  const currentPath =
    getCurrentCanonicalPath();

  const finalRedirect =
    withRedirectBack
      ? buildLoginRedirectPath(
          currentPath
        )
      : safeText(
          redirectTo,
          "/login"
        );

  safeEmit(
    "auth:guard:blocked",
    {
      reason:
        "not-authenticated",
      path:
        currentPath,
      redirectTo:
        finalRedirect,
    }
  );

  if (
    autoNavigate ||
    hardRedirect
  ) {
    navigateTo(
      finalRedirect
    );
  }

  return false;
}

export function guardRole(
  roles = [],
  options = {}
) {
  const roleList =
    Array.isArray(
      roles
    )
      ? roles
      : [roles];

  const {
    redirectTo = "/",
    autoNavigate = false,
  } = options;

  const currentPath =
    getCurrentCanonicalPath();

  if (
    !isAuthenticated()
  ) {
    const loginRedirect =
      buildLoginRedirectPath(
        currentPath
      );

    safeEmit(
      "auth:guard:blocked",
      {
        reason:
          "not-authenticated",
        path:
          currentPath,
        redirectTo:
          loginRedirect,
      }
    );

    if (
      autoNavigate
    ) {
      navigateTo(
        loginRedirect
      );
    }

    return false;
  }

  if (
    hasRole(
      ...roleList
    )
  ) {
    return true;
  }

  const finalRedirect =
    safeText(
      redirectTo,
      "/"
    );

  safeEmit(
    "auth:guard:blocked",
    {
      reason:
        "insufficient-role",
      path:
        currentPath,
      currentRole:
        getCurrentRole(),
      requiredRoles:
        roleList
          .flat()
          .map(
            normalizeRole
          )
          .filter(
            Boolean
          ),
      redirectTo:
        finalRedirect,
    }
  );

  if (
    autoNavigate
  ) {
    navigateTo(
      finalRedirect
    );
  }

  return false;
}

/* =========================================================
   ERROR HELPER
========================================================= */

export function buildGuardErrorPayload(
  error
) {
  return {
    error,
    message:
      extractMessage(
        error
      ),
  };
}
