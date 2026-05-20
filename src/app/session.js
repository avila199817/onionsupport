/* =========================================================
   Onion Support - App Session
   Archivo: /src/app/session.js

   Responsabilidad:
   - Compat mínima entre App y Auth.
   - Auth hace el restore real.
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

export const SESSION_VERSION = "app.session.v2";

let restorePromise = null;

/* =========================================================
   BASICS
========================================================= */

function isFunction(value) {
  return typeof value === "function";
}

function isAuthenticated(AppCore = null, Auth = null) {
  if (isFunction(Auth?.isAuthenticated)) {
    return Boolean(Auth.isAuthenticated());
  }

  return Boolean(AppCore?.state?.authenticated);
}

function getUser(AppCore = null, Auth = null) {
  if (isFunction(Auth?.getUser)) {
    return Auth.getUser();
  }

  return AppCore?.state?.user || null;
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

function requireRestore(Auth = null) {
  if (!isFunction(Auth?.restoreSession)) {
    throw new Error("Auth.restoreSession() no disponible.");
  }

  return Auth.restoreSession.bind(Auth);
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

  restorePromise = (async () => {
    const restoreSession = requireRestore(Auth);
    const result = await restoreSession(createRestorePayload(options));

    return {
      ok: Boolean(result?.ok) || isAuthenticated(AppCore, Auth),
      restored: Boolean(result?.restored || result?.ok),
      authenticated: isAuthenticated(AppCore, Auth),
      user: getUser(AppCore, Auth),
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
  return {
    version: SESSION_VERSION,
    restoring: Boolean(restorePromise),
    authenticated: isAuthenticated(AppCore, Auth),
    hasUser: Boolean(getUser(AppCore, Auth)),
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
