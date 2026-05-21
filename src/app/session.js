/* =========================================================
   Onion Support - App Session
   Archivo: /src/app/session.js

   Responsabilidad:
   - Compat mínima entre App y Auth.
   - Auth hace el restore real.
   - Auth hace refresh silencioso si corresponde.
   - Auth decide si la sesión es válida.
   - Auth decide si el usuario es usable.
   - Resolver Auth desde parámetro o AppCore.
   - Coordinar una única restauración concurrente.
   - Normalizar resultado de restauración para boot.
   - No validar usuarios.
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

export const SESSION_VERSION = "app.session.v5";

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
   AUTH READ
========================================================= */

function isAuthenticated(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);

  const fromAuth = safeCall(
    auth?.isAuthenticated?.bind?.(auth) ||
      auth?.isAuthenticated
  );

  if (fromAuth !== null) return fromAuth === true;

  const fromCore = safeCall(
    AppCore?.isAuthenticated?.bind?.(AppCore) ||
      AppCore?.isAuthenticated
  );

  if (fromCore !== null) return fromCore === true;

  return readState(AppCore).authenticated === true;
}

function getUser(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);
  const state = readState(AppCore);

  return (
    safeCall(auth?.getUser?.bind?.(auth) || auth?.getUser) ||
    safeCall(auth?.getCurrentUser?.bind?.(auth) || auth?.getCurrentUser) ||
    safeCall(auth?.getProfile?.bind?.(auth) || auth?.getProfile) ||
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

function getAuthSnapshot(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);

  return (
    safeCall(auth?.getSnapshot?.bind?.(auth) || auth?.getSnapshot) ||
    safeCall(auth?.getAuthModuleSnapshot?.bind?.(auth) || auth?.getAuthModuleSnapshot) ||
    safeCall(auth?.buildSessionSnapshot?.bind?.(auth) || auth?.buildSessionSnapshot) ||
    safeCall(auth?.getSessionDebugSnapshot?.bind?.(auth) || auth?.getSessionDebugSnapshot) ||
    null
  );
}

function hasAuthenticatedUser(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);

  return Boolean(
    isAuthenticated(AppCore, auth) &&
      getUser(AppCore, auth)
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
  const snapshot = getAuthSnapshot(AppCore, auth);

  const authenticated = hasAuthenticatedUser(AppCore, auth);

  const restored = Boolean(
    result?.restored === true ||
      result?.ok === true ||
      result?.authenticated === true ||
      snapshot?.restored === true ||
      snapshot?.authenticated === true ||
      authenticated
  );

  return {
    ok: Boolean(restored && authenticated),
    restored,
    authenticated,

    user: authenticated ? user : null,
    session: authenticated && isObject(session) ? session : null,

    result: isObject(result) ? result : null,
    snapshot: isObject(snapshot) ? snapshot : null,

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
  const snapshot = getAuthSnapshot(AppCore, auth);
  const authenticated = hasAuthenticatedUser(AppCore, auth);

  return {
    version: SESSION_VERSION,

    restoring: Boolean(restorePromise),

    hasAuth: Boolean(auth),
    hasRestore: isFunction(auth?.restoreSession),

    authenticated,
    hasUser: Boolean(user),
    hasAuthenticatedUser: authenticated,

    hasSession: Boolean(session),

    authSnapshot: isObject(snapshot)
      ? {
          authenticated: snapshot.authenticated === true,
          hasToken: snapshot.hasToken === true,
          hasUser: snapshot.hasUser === true,
          hasSession: snapshot.hasSession === true,
          role: snapshot.role || null,
          userSlug: snapshot.userSlug || null,
          homePath: snapshot.homePath || snapshot.defaultHome || null,
        }
      : null,

    policy: {
      bridgeOnly: true,
      authOwnsRestore: true,
      authOwnsSilentRefresh: true,
      authOwnsUserValidity: true,
      doesNotValidateUserStatus: true,

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
