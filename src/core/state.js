/* =========================================================
   Onion SPA - Core State
   Archivo: src/core/state.js

   RESPONSABILIDADES:
   - definir el estado global base del core
   - exponer snapshot seguro del estado
   - computar autenticación
   - aplicar patches de estado normalizados

   HARDENING EXTREMO:
   - estado inicial robusto
   - route/publicPath siempre definidos
   - currentResolvedUsername persistente
   - patches seguros e idempotentes
   - auth derivada consistente
   - eventos con snapshot estable
========================================================= */

import {
  cloneError,
  safeClone,
  normalizeUser,
  hasValidToken,
  sanitizeUsername,
  getCurrentLocationCanonicalPath,
  getCurrentLocationPath,
} from "./helpers.js";

/* =========================================================
   HELPERS
========================================================= */

function safePath(value, fallback = "/") {
  const raw = String(value || "").trim();
  return raw || fallback;
}

function resolveRole(user = null) {
  return (
    user?.role ||
    user?.rol ||
    null
  );
}

function resolveCurrentResolvedUsername({
  user = null,
  publicPath = "/",
  previous = null,
} = {}) {
  const pathMatch = String(
    publicPath || ""
  ).match(/^\/@([^/]+)(?:\/|$)/i);

  const fromPath =
    sanitizeUsername(
      pathMatch?.[1] || ""
    ) || null;

  const fromUser =
    sanitizeUsername(
      user?.username ||
        user?.userName ||
        user?.nick ||
        user?.alias ||
        user?.login ||
        user?.slug ||
        ""
    ) || null;

  const fromPrevious =
    sanitizeUsername(
      previous || ""
    ) || null;

  return (
    fromPath ||
    fromUser ||
    fromPrevious ||
    null
  );
}

/* =========================================================
   STATE FACTORY
========================================================= */

export function createInitialState({
  config,
} = {}) {
  const route =
    safePath(
      getCurrentLocationCanonicalPath(),
      "/"
    );

  const publicPath =
    safePath(
      getCurrentLocationPath(),
      route
    );

  return {
    initialized: false,
    booting: false,
    ready: false,

    route,
    publicPath,

    user: null,
    token: null,
    role: null,
    authenticated: false,
    currentResolvedUsername:
      resolveCurrentResolvedUsername({
        user: null,
        publicPath,
      }),

    lang:
      config?.defaultLang || "es",
    theme:
      config?.defaultTheme || "dark",

    sidebarOpen: true,
    loading: true,

    lastError: null,
    lastRoute: null,
    lastRequestAt: null,
    lastRequestUrl: null,
    online:
      typeof navigator !==
      "undefined"
        ? navigator.onLine !== false
        : true,
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function cloneState(state) {
  return {
    ...state,
    user: state?.user
      ? safeClone(
          state.user,
          state.user
        )
      : null,
    lastError: cloneError(
      state?.lastError
    ),
  };
}

/* =========================================================
   AUTH
========================================================= */

export function computeAuthenticated(
  nextUser,
  nextToken
) {
  const normalizedUser =
    normalizeUser(nextUser);

  const validToken =
    hasValidToken(nextToken);

  return Boolean(
    validToken &&
      normalizedUser?.active !==
        false
  );
}

/* =========================================================
   WRITE STATE
========================================================= */

export function setState({
  state,
  events,
  patch = {},
}) {
  if (
    !state ||
    typeof state !== "object"
  ) {
    throw new Error(
      "Core state inválido."
    );
  }

  if (
    !patch ||
    typeof patch !== "object" ||
    Array.isArray(patch)
  ) {
    return cloneState(state);
  }

  const previousState =
    cloneState(state);

  const normalizedPatch = {
    ...patch,
  };

  if (
    Object.prototype.hasOwnProperty.call(
      normalizedPatch,
      "user"
    )
  ) {
    normalizedPatch.user =
      normalizeUser(
        normalizedPatch.user
      );

    normalizedPatch.role =
      resolveRole(
        normalizedPatch.user
      );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      normalizedPatch,
      "token"
    )
  ) {
    normalizedPatch.token =
      hasValidToken(
        normalizedPatch.token
      )
        ? String(
            normalizedPatch.token
          ).trim()
        : null;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      normalizedPatch,
      "route"
    )
  ) {
    normalizedPatch.route =
      safePath(
        normalizedPatch.route,
        state.route || "/"
      );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      normalizedPatch,
      "publicPath"
    )
  ) {
    normalizedPatch.publicPath =
      safePath(
        normalizedPatch.publicPath,
        state.publicPath ||
          state.route ||
          "/"
      );
  }

  const shouldRecomputeAuth =
    Object.prototype.hasOwnProperty.call(
      normalizedPatch,
      "user"
    ) ||
    Object.prototype.hasOwnProperty.call(
      normalizedPatch,
      "token"
    ) ||
    Object.prototype.hasOwnProperty.call(
      normalizedPatch,
      "authenticated"
    );

  if (shouldRecomputeAuth) {
    const nextUser =
      Object.prototype.hasOwnProperty.call(
        normalizedPatch,
        "user"
      )
        ? normalizedPatch.user
        : state.user;

    const nextToken =
      Object.prototype.hasOwnProperty.call(
        normalizedPatch,
        "token"
      )
        ? normalizedPatch.token
        : state.token;

    normalizedPatch.authenticated =
      computeAuthenticated(
        nextUser,
        nextToken
      );

    normalizedPatch.role =
      normalizedPatch.authenticated
        ? resolveRole(nextUser)
        : null;
  }

  const nextUserForSlug =
    Object.prototype.hasOwnProperty.call(
      normalizedPatch,
      "user"
    )
      ? normalizedPatch.user
      : state.user;

  const nextPublicPathForSlug =
    Object.prototype.hasOwnProperty.call(
      normalizedPatch,
      "publicPath"
    )
      ? normalizedPatch.publicPath
      : state.publicPath;

  normalizedPatch.currentResolvedUsername =
    resolveCurrentResolvedUsername({
      user: nextUserForSlug,
      publicPath:
        nextPublicPathForSlug,
      previous:
        state.currentResolvedUsername,
    });

  Object.assign(
    state,
    normalizedPatch
  );

  events?.emit?.(
    "app:state:change",
    {
      state: cloneState(state),
      patch: normalizedPatch,
      previousState,
    }
  );

  return cloneState(state);
}

export function getState(state) {
  return cloneState(state);
}
