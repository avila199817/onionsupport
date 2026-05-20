/* =========================================================
   Onion Support - App Session
   Archivo: /src/app/session.js

   Responsabilidad:
   - Compat mínima entre App y Auth.
   - Auth hace el restore real.
   - Resolver Auth desde parámetro o AppCore.
   - Sin imports.
   - Sin Router.
   - Sin rutas.
   - Sin eventos.
   - Sin storage.
   - Sin fetch.
   - Sin navegación.
   - Sin warmup.
   - Sin sync UI.
========================================================= */

export const SESSION_VERSION = "app.session.v3";

let restorePromise = null;

/* =========================================================
   BASICS
========================================================= */

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function resolveAuth(AppCore = null, Auth = null) {
  try {
    return (
      Auth ||
      AppCore?.auth ||
      AppCore?.Auth ||
      AppCore?.modules?.get?.("auth") ||
      AppCore?.modules?.get?.("Auth") ||
      null
    );
  } catch {
    return Auth || null;
  }
}

function readState(AppCore = null) {
  return isObject(AppCore?.state) ? AppCore.state : {};
}

function safeCall(fn = null, ...args) {
  try {
    return isFunction(fn) ? fn(...args) : null;
  } catch {
    return null;
  }
}

function isAuthenticated(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);

  if (isFunction(auth?.isAuthenticated)) {
    return auth.isAuthenticated() === true;
  }

  if (isFunction(AppCore?.isAuthenticated)) {
    return AppCore.isAuthenticated() === true;
  }

  return readState(AppCore).authenticated === true;
}

function getUser(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);
  const state = readState(AppCore);

  return (
    safeCall(auth?.getUser?.bind?.(auth) || auth?.getUser) ||
    safeCall(auth?.getCurrentUser?.bind?.(auth) || auth?.getCurrentUser) ||
    safeCall(AppCore?.getCurrentUser?.bind?.(AppCore) || AppCore?.getCurrentUser) ||
    state.user ||
    state.currentUser ||
    null
  );
}

function createRestorePayload(options = {}) {
  return {
    ...options,
    source: "app.session",
    silent: true,
    skipNavigation: true,
    skipRedirect: true,
    noRedirect: true,
  };
}

function requireRestore(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);

  if (!isFunction(auth?.restoreSession)) {
    throw new Error("Auth.restoreSession() no disponible.");
  }

  return auth.restoreSession.bind(auth);
}

/* =========================================================
   RESTORE
========================================================= */

export function restoreAuthSession({
  AppCore = null,
  Auth = null,
  ...options
} = {}) {
  if (restorePromise) return restorePromise;

  const auth = resolveAuth(AppCore, Auth);

  restorePromise = (async () => {
    const restoreSession = requireRestore(AppCore, auth);
    const result = await restoreSession(createRestorePayload(options));

    return {
      ok: Boolean(result?.ok) || isAuthenticated(AppCore, auth),
      restored: Boolean(result?.restored || result?.ok),
      authenticated: isAuthenticated(AppCore, auth),
      user: getUser(AppCore, auth),
      result,
    };
  })().finally(() => {
    restorePromise = null;
  });

  return restorePromise;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSessionBootstrapSnapshot({
  AppCore = null,
  Auth = null,
} = {}) {
  const auth = resolveAuth(AppCore, Auth);

  return {
    version: SESSION_VERSION,
    restoring: Boolean(restorePromise),
    hasAuth: Boolean(auth),
    hasRestore: isFunction(auth?.restoreSession),
    authenticated: isAuthenticated(AppCore, auth),
    hasUser: Boolean(getUser(AppCore, auth)),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SESSION_VERSION,

  restoreAuthSession,
  getSessionBootstrapSnapshot,
};
