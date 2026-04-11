/* =========================================================
   Onion SPA - Core State
   Archivo: src/core/state.js

   Responsabilidades:
   - definir el estado global base del core
   - exponer snapshot seguro del estado
   - computar autenticación
   - aplicar patches de estado normalizados
========================================================= */

import {
  cloneError,
  safeClone,
  normalizeUser,
  hasValidToken,
  getCurrentLocationCanonicalPath,
  getCurrentLocationPath,
} from "./helpers.js";

/* =========================================================
   STATE FACTORY
========================================================= */
export function createInitialState({
  config,
} = {}) {
  return {
    initialized: false,
    booting: false,
    ready: false,

    route: getCurrentLocationCanonicalPath(),
    publicPath: getCurrentLocationPath(),

    user: null,
    token: null,
    role: null,
    authenticated: false,

    lang: config?.defaultLang || "es",
    theme: config?.defaultTheme || "dark",

    sidebarOpen: true,
    loading: true,

    lastError: null,
    lastRoute: null,
    lastRequestAt: null,
    lastRequestUrl: null,
    online: typeof navigator !== "undefined" ? navigator.onLine !== false : true,
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */
export function cloneState(state) {
  return {
    ...state,
    user: state?.user ? safeClone(state.user, state.user) : null,
    lastError: cloneError(state?.lastError),
  };
}

/* =========================================================
   AUTH
========================================================= */
export function computeAuthenticated(
  nextUser,
  nextToken
) {
  const normalizedUser = normalizeUser(nextUser);
  const validToken = hasValidToken(nextToken);

  return Boolean(validToken && normalizedUser?.active !== false);
}

/* =========================================================
   WRITE STATE
========================================================= */
export function setState({
  state,
  events,
  patch = {},
}) {
  if (!patch || typeof patch !== "object") {
    return cloneState(state);
  }

  const previousState = cloneState(state);
  const normalizedPatch = { ...patch };

  if (Object.prototype.hasOwnProperty.call(normalizedPatch, "user")) {
    normalizedPatch.user = normalizeUser(normalizedPatch.user);
    normalizedPatch.role = normalizedPatch.user?.role || null;
  }

  if (Object.prototype.hasOwnProperty.call(normalizedPatch, "token")) {
    normalizedPatch.token = hasValidToken(normalizedPatch.token)
      ? String(normalizedPatch.token).trim()
      : null;
  }

  const shouldRecomputeAuth =
    Object.prototype.hasOwnProperty.call(normalizedPatch, "user") ||
    Object.prototype.hasOwnProperty.call(normalizedPatch, "token") ||
    Object.prototype.hasOwnProperty.call(normalizedPatch, "authenticated");

  if (shouldRecomputeAuth) {
    normalizedPatch.authenticated = computeAuthenticated(
      Object.prototype.hasOwnProperty.call(normalizedPatch, "user")
        ? normalizedPatch.user
        : state.user,
      Object.prototype.hasOwnProperty.call(normalizedPatch, "token")
        ? normalizedPatch.token
        : state.token
    );
  }

  Object.assign(state, normalizedPatch);

  events?.emit?.("app:state:change", {
    state: cloneState(state),
    patch: normalizedPatch,
    previousState,
  });

  return cloneState(state);
}

export function getState(state) {
  return cloneState(state);
}
