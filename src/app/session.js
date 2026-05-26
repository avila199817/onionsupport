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

export const SESSION_VERSION = "app.session.v7";

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

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function safeCall(fn = null, ...args) {
  try {
    return isFunction(fn) ? fn(...args) : null;
  } catch {
    return null;
  }
}

function callMethod(target = null, method = "", ...args) {
  if (!target || !method || !isFunction(target[method])) {
    return null;
  }

  return safeCall(target[method].bind(target), ...args);
}

function readState(AppCore = null) {
  return isObject(AppCore?.state) ? AppCore.state : {};
}

/* =========================================================
   AUTH RESOLVE
========================================================= */

function resolveAuth(AppCore = null, Auth = null) {
  try {
    const modules = AppCore?.modules || null;
    const getModule = isFunction(modules?.get)
      ? modules.get.bind(modules)
      : null;

    return (
      Auth ||
      AppCore?.auth ||
      AppCore?.Auth ||
      safeCall(getModule, "auth") ||
      safeCall(getModule, "Auth") ||
      null
    );
  } catch {
    return Auth || null;
  }
}

function requireRestore(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);

  if (!isFunction(auth?.restoreSession)) {
    throw new Error("Auth.restoreSession() no disponible.");
  }

  return auth.restoreSession.bind(auth);
}

/* =========================================================
   AUTH READ
========================================================= */

function isAuthenticated(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);

  const fromAuth = callMethod(auth, "isAuthenticated");

  if (fromAuth !== null) return fromAuth === true;

  const fromCore = callMethod(AppCore, "isAuthenticated");

  if (fromCore !== null) return fromCore === true;

  return readState(AppCore).authenticated === true;
}

function getUser(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);
  const state = readState(AppCore);

  return (
    callMethod(auth, "getUser") ||
    callMethod(auth, "getCurrentUser") ||
    callMethod(auth, "getProfile") ||
    callMethod(AppCore, "getCurrentUser") ||
    auth?.user ||
    auth?.currentUser ||
    auth?.profile ||
    state.user ||
    state.currentUser ||
    null
  );
}

function getSession(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);
  const state = readState(AppCore);

  return (
    callMethod(auth, "getSession") ||
    callMethod(auth, "getCurrentSession") ||
    auth?.session ||
    auth?.currentSession ||
    state.session ||
    state.sessionData ||
    null
  );
}

function getAuthSnapshot(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);

  return (
    callMethod(auth, "getSnapshot") ||
    callMethod(auth, "getAuthModuleSnapshot") ||
    callMethod(auth, "buildSessionSnapshot") ||
    callMethod(auth, "getSessionDebugSnapshot") ||
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

/* =========================================================
   RESULT READ
========================================================= */

function getNestedResult(result = null) {
  return isObject(result?.result) ? result.result : {};
}

function getResultUser(result = null) {
  if (!isObject(result)) return null;

  const nested = getNestedResult(result);

  return (
    result.user ||
    result.currentUser ||
    result.profile ||
    nested.user ||
    nested.currentUser ||
    nested.profile ||
    null
  );
}

function getResultSession(result = null) {
  if (!isObject(result)) return null;

  const nested = getNestedResult(result);

  return (
    result.session ||
    result.currentSession ||
    nested.session ||
    nested.currentSession ||
    null
  );
}

function getResultFlags(result = null) {
  if (!isObject(result)) {
    return {
      ok: false,
      restored: false,
      authenticated: false,
      skipped: false,
    };
  }

  const nested = getNestedResult(result);

  return {
    ok: result.ok === true || nested.ok === true,
    restored: result.restored === true || nested.restored === true,
    authenticated: result.authenticated === true || nested.authenticated === true,
    skipped: result.skipped === true || nested.skipped === true,
  };
}

function buildRestoreMeta(result = null) {
  if (!isObject(result)) return null;

  const nested = getNestedResult(result);
  const flags = getResultFlags(result);

  return {
    ok: flags.ok,
    restored: flags.restored,
    authenticated: flags.authenticated,
    skipped: flags.skipped,

    hasUser: Boolean(getResultUser(result)),
    hasSession: Boolean(getResultSession(result)),

    source: cleanText(result.source || nested.source, null),
    reason: cleanText(result.reason || nested.reason, null),
    code: result.code || nested.code || null,
    status: result.status || result.statusCode || nested.status || nested.statusCode || null,
  };
}

function buildSnapshotMeta(snapshot = null) {
  if (!isObject(snapshot)) return null;

  return {
    authenticated: snapshot.authenticated === true,
    restored: snapshot.restored === true,

    hasToken: snapshot.hasToken === true,
    hasRefreshToken: snapshot.hasRefreshToken === true,
    hasUser: snapshot.hasUser === true,
    hasSession: snapshot.hasSession === true,

    role: cleanText(snapshot.role, null),
    userSlug: cleanText(snapshot.userSlug, null),
    homePath: redact(snapshot.homePath || snapshot.defaultHome || ""),
    source: cleanText(snapshot.source, null),
  };
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

  const authUser = getUser(AppCore, auth);
  const authSession = getSession(AppCore, auth);
  const snapshot = getAuthSnapshot(AppCore, auth);

  const resultUser = getResultUser(result);
  const resultSession = getResultSession(result);
  const resultFlags = getResultFlags(result);

  const user = authUser || resultUser || null;
  const session = authSession || resultSession || null;

  const authenticated = Boolean(
    hasAuthenticatedUser(AppCore, auth) ||
      (resultFlags.authenticated && user) ||
      (snapshot?.authenticated === true && user)
  );

  const restored = Boolean(
    resultFlags.restored ||
      resultFlags.authenticated ||
      snapshot?.restored === true ||
      snapshot?.authenticated === true ||
      authenticated
  );

  /*
    ok indica que el bridge ha completado sin lanzar excepción.
    No significa usuario autenticado. Auth conserva la autoridad real.
  */
  const ok = Boolean(
    resultFlags.ok ||
      resultFlags.skipped ||
      restored ||
      result !== null
  );

  return {
    ok,
    restored,
    authenticated,

    hasUser: Boolean(user),
    hasSession: Boolean(session),

    user: authenticated ? user : null,
    session: authenticated && isObject(session) ? session : null,

    result: buildRestoreMeta(result),
    snapshot: buildSnapshotMeta(snapshot),

    source: cleanText(
      result?.source ||
        result?.result?.source ||
        snapshot?.source,
      "app.session"
    ),

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
  const snapshotMeta = buildSnapshotMeta(snapshot);
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

    authSnapshot: snapshotMeta
      ? {
          authenticated: snapshotMeta.authenticated,
          restored: snapshotMeta.restored,
          hasToken: snapshotMeta.hasToken,
          hasRefreshToken: snapshotMeta.hasRefreshToken,
          hasUser: snapshotMeta.hasUser,
          hasSession: snapshotMeta.hasSession,
          role: snapshotMeta.role,
          userSlug: snapshotMeta.userSlug,
          homePath: snapshotMeta.homePath,
        }
      : null,

    policy: {
      bridgeOnly: true,

      authOwnsRestore: true,
      authOwnsSilentRefresh: true,
      authOwnsUserValidity: true,
      authOwnsSessionValidity: true,

      doesNotValidateUserStatus: true,
      doesNotValidateRoutes: true,
      doesNotNavigate: true,

      singleConcurrentRestore: true,
      restoreResultNormalizedForBoot: true,

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

      redactedSnapshot: true,
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
