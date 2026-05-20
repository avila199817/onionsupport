/* =========================================================
   Onion Support - App Session
   Archivo: /src/app/session.js

   Responsabilidad:
   - Compat mínima entre App y Auth.
   - Auth hace el restore real.
   - Auth hace refresh silencioso si corresponde.
   - Resolver Auth desde parámetro o AppCore.
   - Coordinar una única restauración concurrente.
   - Normalizar resultado de restauración para boot.
   - No validar rutas.
   - No navegar.
   - Sin imports.
   - Sin Router.
   - Sin rutas.
   - Sin eventos.
   - Sin storage.
   - Sin fetch.
   - Sin warmup.
   - Sin sync UI.
========================================================= */

export const SESSION_VERSION = "app.session.v4";

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

function safeText(value = "", fallback = "") {
  if (value === null || value === undefined) return fallback;

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function normalizeStatus(value = "") {
  return safeText(value, "").toLowerCase();
}

function safeCall(fn = null, ...args) {
  try {
    return isFunction(fn) ? fn(...args) : null;
  } catch {
    return null;
  }
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

/* =========================================================
   USER / AUTH STATE
========================================================= */

function isUsableUser(user = null) {
  if (!isObject(user)) return false;

  const status = normalizeStatus(user.status || user.estado || user.state || "");

  if (
    user.disabled === true ||
    user.deleted === true ||
    user.archived === true ||
    user.revoked === true ||
    user.active === false ||
    user.enabled === false ||
    Boolean(user.deletedAt)
  ) {
    return false;
  }

  if (
    [
      "disabled",
      "inactive",
      "deleted",
      "archived",
      "revoked",
      "blocked",
      "banned",
      "suspended",
      "desactivado",
      "inactivo",
      "eliminado",
      "archivado",
      "bloqueado",
      "suspendido",
    ].includes(status)
  ) {
    return false;
  }

  return Boolean(user.id || user.userId || user.uid || user.sub || user.username || user.slug);
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

function getSession(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);
  const state = readState(AppCore);

  return (
    safeCall(auth?.getSession?.bind?.(auth) || auth?.getSession) ||
    safeCall(auth?.getCurrentSession?.bind?.(auth) || auth?.getCurrentSession) ||
    state.session ||
    state.sessionData ||
    null
  );
}

function requireRestore(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);

  if (!isFunction(auth?.restoreSession)) {
    throw new Error("Auth.restoreSession() no disponible.");
  }

  return auth.restoreSession.bind(auth);
}

/* =========================================================
   RESTORE PAYLOAD
========================================================= */

function createRestorePayload(options = {}) {
  return {
    ...options,

    source: "app.session",

    /*
      Contrato sesión persistente:
      App/session no hace refresh, sólo exige a Auth que lo intente.
    */
    persistent: true,
    restoreOnBoot: true,
    allowSilentRefresh: true,
    silentRefresh: true,

    /*
      El boot no debe navegar desde aquí.
      Router/App decidirán después con el resultado normalizado.
    */
    silent: true,
    skipNavigation: true,
    skipRedirect: true,
    noRedirect: true,
  };
}

function normalizeRestoreResult(result = null, AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);
  const user = getUser(AppCore, auth);
  const session = getSession(AppCore, auth);

  const authenticated =
    result?.authenticated === true ||
    isAuthenticated(AppCore, auth);

  const usableUser = isUsableUser(user);

  const ok =
    result?.ok === true ||
    result?.restored === true ||
    (authenticated && usableUser);

  return {
    ok: Boolean(ok && usableUser),
    restored: Boolean(result?.restored || result?.ok || (authenticated && usableUser)),
    authenticated: Boolean(authenticated && usableUser),

    user: usableUser ? user : null,
    session: isObject(session) ? session : null,

    result: isObject(result) ? result : null,

    source: "app.session",
    version: SESSION_VERSION,
  };
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

    const result = await restoreSession(
      createRestorePayload(options)
    );

    return normalizeRestoreResult(result, AppCore, auth);
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
  const user = getUser(AppCore, auth);
  const session = getSession(AppCore, auth);

  return {
    version: SESSION_VERSION,

    restoring: Boolean(restorePromise),

    hasAuth: Boolean(auth),
    hasRestore: isFunction(auth?.restoreSession),

    authenticated: isAuthenticated(AppCore, auth),
    hasUser: Boolean(user),
    hasUsableUser: isUsableUser(user),

    hasSession: Boolean(session),

    policy: {
      bridgeOnly: true,
      authOwnsRestore: true,
      authOwnsSilentRefresh: true,

      noImports: true,
      noRouter: true,
      noRoutes: true,
      noEvents: true,
      noStorage: true,
      noFetch: true,
      noNavigation: true,
      noWarmup: true,
      noUiSync: true,

      persistentSession: true,
      restoreOnBoot: true,
      silentRefreshRequested: true,
    },
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
