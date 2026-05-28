/* =========================================================
   Onion Support - App Session
   Archivo: /src/app/session.js

   Responsabilidad:
   - Bridge mínimo entre App y Auth.
   - Auth hace restore, refresh silencioso y validación real.
   - App/session coordina una única restauración concurrente.
   - Normaliza resultado de boot sin navegar ni tocar rutas.
   - Soporta refresh por cookie httpOnly con credentials include.
   - No limpia sesión por access token caducado/rotado.
   - No decide logout.
   - Sin imports, Router, rutas, eventos, storage, fetch, warmup ni UI sync.
========================================================= */

export const SESSION_VERSION = "app.session.v10";

const RESTORE_OPTIONS = Object.freeze({
  persistent: true,
  restoreOnBoot: true,

  allowSilentRefresh: true,
  allowCookieRefresh: true,
  silentRefresh: true,

  credentials: "include",

  silent: true,
  skipNavigation: true,
  skipRedirect: true,
  noRedirect: true,
});

const USER_METHODS = Object.freeze([
  "getUser",
  "getCurrentUser",
  "getProfile",
]);

const SESSION_METHODS = Object.freeze([
  "getSession",
  "getCurrentSession",
]);

const SNAPSHOT_METHODS = Object.freeze([
  "getSnapshot",
  "getAuthModuleSnapshot",
  "buildSessionSnapshot",
  "getSessionDebugSnapshot",
]);

const RESULT_BRANCH_KEYS = Object.freeze([
  "result",
  "data",
  "auth",
  "session",
  "snapshot",
]);

const TERMINAL_AUTH_CODES = new Set([
  "SESSION_REVOKED",
  "SESSION_INVALID",
  "SESSION_NOT_FOUND",

  "INVALID_REFRESH_TOKEN",
  "REFRESH_TOKEN_INVALID",
  "REFRESH_TOKEN_REVOKED",

  "USER_DISABLED",
  "USER_INACTIVE",
  "USER_SUSPENDED",
  "USER_BLOCKED",
  "USER_BANNED",
  "USER_REVOKED",
  "USER_DELETED",
  "USER_ARCHIVED",

  "USER_DESACTIVADO",
  "USUARIO_DESACTIVADO",
]);

let restorePromise = null;

/* =========================================================
   BASICS
========================================================= */

function isFunction(value) {
  return typeof value === "function";
}

function isPlainObject(value) {
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

function normalizeCode(value = "") {
  return cleanText(value, "")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

function safeCall(fn = null) {
  try {
    return isFunction(fn) ? fn() : null;
  } catch {
    return null;
  }
}

function callMethod(target = null, method = "") {
  if (!target || !method || !isFunction(target[method])) return null;
  return safeCall(() => target[method]());
}

function callFirst(target = null, methods = []) {
  for (const method of methods) {
    const value = callMethod(target, method);

    if (value !== null && value !== undefined) {
      return value;
    }
  }

  return null;
}

function readState(AppCore = null) {
  return isPlainObject(AppCore?.state) ? AppCore.state : {};
}

/* =========================================================
   AUTH RESOLVE
========================================================= */

function readCoreModule(AppCore = null, name = "") {
  const get = AppCore?.modules?.get;
  return isFunction(get) ? safeCall(() => get.call(AppCore.modules, name)) : null;
}

function resolveAuth(AppCore = null, Auth = null) {
  return (
    Auth ||
    AppCore?.auth ||
    AppCore?.Auth ||
    readCoreModule(AppCore, "auth") ||
    readCoreModule(AppCore, "Auth") ||
    null
  );
}

function getRestoreSession(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);

  if (!isFunction(auth?.restoreSession)) {
    throw new Error("Auth.restoreSession() no disponible.");
  }

  return {
    auth,
    restoreSession: auth.restoreSession.bind(auth),
  };
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
    callFirst(auth, USER_METHODS) ||
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
    callFirst(auth, SESSION_METHODS) ||
    auth?.session ||
    auth?.currentSession ||
    state.session ||
    state.sessionData ||
    null
  );
}

function getAuthSnapshot(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);
  return callFirst(auth, SNAPSHOT_METHODS);
}

function hasAuthenticatedUser(AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);
  return Boolean(isAuthenticated(AppCore, auth) && getUser(AppCore, auth));
}

function hasRestoreCandidate(AppCore = null, Auth = null, snapshotMeta = null) {
  const state = readState(AppCore);
  const auth = resolveAuth(AppCore, Auth);

  return Boolean(
    state.hasRefreshToken === true ||
      state.session ||
      state.sessionData ||
      state.sessionId ||
      auth?.hasRefreshToken === true ||
      auth?.refreshAvailable === true ||
      snapshotMeta?.hasRefreshToken === true ||
      snapshotMeta?.hasSession === true ||
      snapshotMeta?.hasCookieRefreshCandidate === true ||
      snapshotMeta?.supportsHttpOnlyRefresh === true
  );
}

/* =========================================================
   RESULT READ
========================================================= */

function getResultBranches(result = null) {
  if (!isPlainObject(result)) return [];

  const branches = [result];

  for (const key of RESULT_BRANCH_KEYS) {
    if (isPlainObject(result[key])) {
      branches.push(result[key]);
    }
  }

  return branches;
}

function firstBranchValue(result = null, keys = []) {
  for (const branch of getResultBranches(result)) {
    for (const key of keys) {
      if (branch[key] !== undefined && branch[key] !== null) {
        return branch[key];
      }
    }
  }

  return null;
}

function trueBranchFlag(result = null, keys = []) {
  return getResultBranches(result).some((branch) =>
    keys.some((key) => branch[key] === true)
  );
}

function falseBranchFlag(result = null, keys = []) {
  return getResultBranches(result).some((branch) =>
    keys.some((key) => branch[key] === false)
  );
}

function getResultUser(result = null) {
  return firstBranchValue(result, [
    "user",
    "currentUser",
    "profile",
    "me",
  ]);
}

function getResultSession(result = null) {
  return firstBranchValue(result, [
    "session",
    "currentSession",
    "sessionData",
  ]);
}

function getResultFlags(result = null) {
  return {
    ok: trueBranchFlag(result, ["ok", "success"]),
    failed: falseBranchFlag(result, ["ok", "success"]),
    restored: trueBranchFlag(result, ["restored"]),
    authenticated: trueBranchFlag(result, ["authenticated"]),
    skipped: trueBranchFlag(result, ["skipped"]),
  };
}

function buildRestoreMeta(result = null) {
  if (!isPlainObject(result)) {
    return {
      ok: result !== false,
      failed: result === false,
      restored: result === true,
      authenticated: false,
      skipped: result === null || result === undefined,
      hasUser: false,
      hasSession: false,
      source: "app.session",
      reason: result === null || result === undefined ? "empty-result" : "",
      code: null,
      status: null,
    };
  }

  const flags = getResultFlags(result);
  const code = normalizeCode(firstBranchValue(result, ["code", "error"]));

  return {
    ok: flags.failed ? false : true,
    failed: flags.failed,
    restored: flags.restored,
    authenticated: flags.authenticated,
    skipped: flags.skipped,

    hasUser: Boolean(getResultUser(result)),
    hasSession: Boolean(getResultSession(result)),

    source: cleanText(firstBranchValue(result, ["source"]), null),
    reason: cleanText(firstBranchValue(result, ["reason"]), null),
    code: code || null,
    status: firstBranchValue(result, ["status", "statusCode"]),
  };
}

function buildSnapshotMeta(snapshot = null) {
  if (!isPlainObject(snapshot)) return null;

  return {
    authenticated: snapshot.authenticated === true,
    restored: snapshot.restored === true,

    hasToken: snapshot.hasToken === true,
    hasRefreshToken: snapshot.hasRefreshToken === true,
    hasUser: snapshot.hasUser === true,
    hasSession: snapshot.hasSession === true,

    supportsHttpOnlyRefresh: snapshot.supportsHttpOnlyRefresh === true,
    hasCookieRefreshCandidate: snapshot.hasCookieRefreshCandidate === true,

    role: cleanText(snapshot.role, null),
    userSlug: cleanText(snapshot.userSlug, null),
    homePath: redact(snapshot.homePath || snapshot.defaultHome || ""),
    source: cleanText(snapshot.source, null),
  };
}

/* =========================================================
   ERROR
========================================================= */

function errorCode(error = null) {
  return normalizeCode(
    error?.code ||
      error?.error ||
      error?.data?.code ||
      error?.data?.error ||
      error?.response?.data?.code ||
      error?.response?.data?.error ||
      ""
  );
}

function publicError(error = null) {
  if (!error) return null;

  return {
    name: cleanText(error.name, "Error"),
    message: redact(error.message || String(error)),
    code: errorCode(error) || null,
    status:
      error.status ||
      error.statusCode ||
      error.response?.status ||
      error.data?.status ||
      null,
    canRefresh: error.canRefresh === true || error.refreshRequired === true,
    shouldLogout: error.shouldLogout === true || error.clearClientSession === true,
  };
}

function isTerminalRestoreError(error = null) {
  if (!error) return false;

  if (error.shouldLogout === true || error.clearClientSession === true) {
    return true;
  }

  return TERMINAL_AUTH_CODES.has(errorCode(error));
}

/* =========================================================
   RESTORE
========================================================= */

function createRestorePayload(options = {}) {
  return {
    ...options,
    ...RESTORE_OPTIONS,
    source: "app.session",
  };
}

function normalizeRestoreResult(result = null, AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);
  const snapshot = getAuthSnapshot(AppCore, auth);
  const snapshotMeta = buildSnapshotMeta(snapshot);
  const resultMeta = buildRestoreMeta(result);

  const user = getUser(AppCore, auth) || getResultUser(result) || null;
  const session = getSession(AppCore, auth) || getResultSession(result) || null;

  const authenticated = Boolean(
    hasAuthenticatedUser(AppCore, auth) ||
      (resultMeta.authenticated && user) ||
      (snapshotMeta?.authenticated && user)
  );

  const restored = Boolean(
    resultMeta.restored ||
      resultMeta.authenticated ||
      snapshotMeta?.restored ||
      snapshotMeta?.authenticated ||
      authenticated
  );

  const hasCandidate = hasRestoreCandidate(AppCore, auth, snapshotMeta);

  return {
    /*
      ok indica que el intento de restore terminó sin romper el boot,
      no que haya sesión autenticada.
    */
    ok: resultMeta.failed !== true,
    restoreCompleted: true,

    restored,
    authenticated,

    hasUser: Boolean(user),
    hasSession: Boolean(session),
    hasRestoreCandidate: hasCandidate,

    user: authenticated ? user : null,
    session: authenticated && isPlainObject(session) ? session : null,

    result: resultMeta,
    snapshot: snapshotMeta,

    source: cleanText(
      firstBranchValue(result, ["source"]) ||
        snapshotMeta?.source ||
        resultMeta.source,
      "app.session"
    ),

    version: SESSION_VERSION,
  };
}

function normalizeRestoreFailure(error = null, AppCore = null, Auth = null) {
  const auth = resolveAuth(AppCore, Auth);
  const snapshot = getAuthSnapshot(AppCore, auth);
  const snapshotMeta = buildSnapshotMeta(snapshot);

  const authenticated = hasAuthenticatedUser(AppCore, auth);
  const user = getUser(AppCore, auth);
  const session = getSession(AppCore, auth);
  const terminal = isTerminalRestoreError(error);
  const hasCandidate = hasRestoreCandidate(AppCore, auth, snapshotMeta);

  return {
    ok: false,
    restoreCompleted: true,

    restored: false,
    authenticated,

    hasUser: Boolean(user),
    hasSession: Boolean(session),
    hasRestoreCandidate: hasCandidate,

    /*
      recoverable sólo informa.
      App/session no limpia sesión ni navega.
    */
    recoverable: !terminal,

    user: authenticated ? user : null,
    session: authenticated && isPlainObject(session) ? session : null,

    error: publicError(error),
    result: null,
    snapshot: snapshotMeta,

    source: "app.session:error",
    version: SESSION_VERSION,
  };
}

export function restoreAuthSession({
  AppCore = null,
  Auth = null,
  ...options
} = {}) {
  if (restorePromise) return restorePromise;

  restorePromise = (async () => {
    try {
      const { auth, restoreSession } = getRestoreSession(AppCore, Auth);
      const result = await restoreSession(createRestorePayload(options));

      return normalizeRestoreResult(result, AppCore, auth);
    } catch (error) {
      /*
        App/session no limpia sesión ni navega.
        Auth/restore/session son los únicos dueños de aplicar/limpiar.
      */
      return normalizeRestoreFailure(error, AppCore, Auth);
    }
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
  const snapshotMeta = buildSnapshotMeta(getAuthSnapshot(AppCore, auth));
  const authenticated = hasAuthenticatedUser(AppCore, auth);

  return {
    version: SESSION_VERSION,

    restoring: Boolean(restorePromise),

    hasAuth: Boolean(auth),
    hasRestore: isFunction(auth?.restoreSession),

    authenticated,
    hasUser: Boolean(getUser(AppCore, auth)),
    hasAuthenticatedUser: authenticated,
    hasSession: Boolean(getSession(AppCore, auth)),
    hasRestoreCandidate: hasRestoreCandidate(AppCore, auth, snapshotMeta),

    authSnapshot: snapshotMeta
      ? {
          authenticated: snapshotMeta.authenticated,
          restored: snapshotMeta.restored,
          hasToken: snapshotMeta.hasToken,
          hasRefreshToken: snapshotMeta.hasRefreshToken,
          hasUser: snapshotMeta.hasUser,
          hasSession: snapshotMeta.hasSession,
          supportsHttpOnlyRefresh: snapshotMeta.supportsHttpOnlyRefresh,
          hasCookieRefreshCandidate: snapshotMeta.hasCookieRefreshCandidate,
          role: snapshotMeta.role,
          userSlug: snapshotMeta.userSlug,
          homePath: snapshotMeta.homePath,
        }
      : null,

    policy: {
      bridgeOnly: true,
      authOwnsRestore: true,
      authOwnsRefresh: true,
      authOwnsSessionClear: true,

      singleConcurrentRestore: true,

      restoreUsesSilentRefresh: true,
      restoreUsesCookieRefresh: true,
      credentialsInclude: true,

      tokenExpiredDoesNotMeanLogout: true,
      restoreFailureDoesNotNavigate: true,
      noSessionClearHere: true,

      noFetch: true,
      noStorage: true,
      noNavigation: true,
      redactedSnapshot: true,
    },
  };
}

export default {
  SESSION_VERSION,
  restoreAuthSession,
  getSessionBootstrapSnapshot,
};
