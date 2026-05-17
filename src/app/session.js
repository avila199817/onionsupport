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

export const SESSION_VERSION = "simple";

let restorePromise = null;

function isAuthenticated(AppCore = null, Auth = null) {
  if (typeof Auth?.isAuthenticated === "function") {
    return Boolean(Auth.isAuthenticated());
  }

  return Boolean(AppCore?.state?.authenticated);
}

function getUser(AppCore = null, Auth = null) {
  if (typeof Auth?.getUser === "function") {
    return Auth.getUser();
  }

  if (typeof Auth?.getCurrentUser === "function") {
    return Auth.getCurrentUser();
  }

  return AppCore?.state?.user || null;
}

function restoreOptions(options = {}) {
  return {
    silent: true,
    skipNavigation: true,
    skipRedirect: true,
    noRedirect: true,
    source: "app.session",
    ...options,
  };
}

async function callRestore(Auth = null, options = {}) {
  if (typeof Auth?.restoreSession === "function") {
    return Auth.restoreSession(options);
  }

  if (typeof Auth?.restore === "function") {
    return Auth.restore(options);
  }

  if (typeof Auth?.session?.restore === "function") {
    return Auth.session.restore(options);
  }

  return null;
}

export async function restoreAuthSession({
  AppCore = null,
  Auth = null,
  skipNavigation = true,
} = {}) {
  if (restorePromise) return restorePromise;

  restorePromise = (async () => {
    const result = await callRestore(
      Auth,
      restoreOptions({ skipNavigation })
    );

    return {
      ok: Boolean(result?.ok) || isAuthenticated(AppCore, Auth),
      restored: Boolean(result?.restored || result?.ok),
      authenticated: isAuthenticated(AppCore, Auth),
      user: getUser(AppCore, Auth),
      result,
    };
  })()
    .catch(() => {
      return {
        ok: false,
        restored: false,
        authenticated: isAuthenticated(AppCore, Auth),
        user: getUser(AppCore, Auth),
        result: null,
      };
    })
    .finally(() => {
      restorePromise = null;
    });

  return restorePromise;
}

export function restoreSessionInBackground(options = {}) {
  return restoreAuthSession(options);
}

export async function navigateAfterSessionRestore() {
  return false;
}

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

export default {
  SESSION_VERSION,
  restoreAuthSession,
  restoreSessionInBackground,
  navigateAfterSessionRestore,
  getSessionBootstrapSnapshot,
};
