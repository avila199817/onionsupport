/* =========================================================
   Onion Support - App Session
   Archivo: /src/app/session.js

   Responsabilidad:
   - Bridge mínimo entre App y Auth.
   - Auth hace restore, refresh silencioso y validación real.
   - App/session coordina una única restauración concurrente.
   - Normaliza resultado de boot sin navegar ni tocar rutas.
   - Sin imports, Router, rutas, eventos, storage, fetch, warmup ni UI sync.
========================================================= */

export const SESSION_VERSION = "app.session.v8";

const RESTORE_OPTIONS = Object.freeze({
  persistent: true,
  restoreOnBoot: true,
  allowSilentRefresh: true,
  silentRefresh: true,
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
  return getResultBranches(result).some((branch) => (
    keys.some((key) => branch[key] === true)
  ));
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
    restored: trueBranchFlag(result, ["restored"]),
    authenticated: trueBranchFlag(result, ["authenticated"]),
    skipped: trueBranchFlag(result, ["skipped"]),
  };
}

function buildRestoreMeta(result = null) {
  if (!isPlainObject(result)) return null;

  const flags = getResultFlags(result);

  return {
    ok: flags.ok,
    restored: flags.restored,
    authenticated: flags.authenticated,
    skipped: flags.skipped,

    hasUser: Boolean(getResultUser(result)),
    hasSession: Boolean(getResultSession(result)),

    source: cleanText(firstBranchValue(result, ["source"]), null),
    reason: cleanText(firstBranchValue(result, ["reason"]), null),
    code: firstBranchValue(result, ["code", "error"]),
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

    role: cleanText(snapshot.role, null),
    userSlug: cleanText(snapshot.userSlug, null),
    homePath: redact(snapshot.homePath || snapshot.defaultHome || ""),
    source: cleanText(snapshot.source, null),
  };
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
  const resultFlags = getResultFlags(result);

  const user = getUser(AppCore, auth) || getResultUser(result) || null;
  const session = getSession(AppCore, auth) || getResultSession(result) || null;

  const authenticated = Boolean(
    hasAuthenticatedUser(AppCore, auth) ||
      (resultFlags.authenticated && user) ||
      (snapshotMeta?.authenticated && user)
  );

  const restored = Boolean(
    resultFlags.restored ||
      resultFlags.authenticated ||
      snapshotMeta?.restored ||
      snapshotMeta?.authenticated ||
      authenticated
  );

  return {
    ok: Boolean(
      resultFlags.ok ||
        resultFlags.skipped ||
        restored ||
        result !== null
    ),

    restored,
    authenticated,

    hasUser: Boolean(user),
    hasSession: Boolean(session),

    user: authenticated ? user : null,
    session: authenticated && isPlainObject(session) ? session : null,

    result: buildRestoreMeta(result),
    snapshot: snapshotMeta,

    source: cleanText(
      firstBranchValue(result, ["source"]) || snapshotMeta?.source,
      "app.session"
    ),

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
    const { auth, restoreSession } = getRestoreSession(AppCore, Auth);
    const result = await restoreSession(createRestorePayload(options));

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
      singleConcurrentRestore: true,
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
