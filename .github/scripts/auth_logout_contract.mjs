import assert from "node:assert/strict";
import fs from "node:fs";
import { AppCore } from "../../src/core/index.js";
import Http from "../../src/core/http.js";
import { Auth } from "../../src/features/auth/index.js";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function scope(source, startMarker, endMarker, owner) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  assert.ok(start >= 0, `${owner}: missing ${startMarker}`);
  assert.ok(end > start, `${owner}: unable to isolate contract scope`);

  return source.slice(start, end);
}

const auth = read("src/features/auth/index.js");
const http = read("src/core/http.js");
const sidebar = read("src/ui/sidebar/index.js");
const ci = read(".github/ci/validate_spa_contracts.sh");

assert.match(
  auth,
  /AUTH_VERSION = "auth\.minimal\.v10-logout-fail-closed"/,
  "auth version must identify the fail-closed logout contract"
);

const authLogout = scope(
  auth,
  "async function logout(",
  "function tokenFromPayload(",
  "Auth.logout"
);

const remoteCall = authLogout.indexOf("await Http.logout(options)");
const confirmation = authLogout.indexOf(
  "result?.serverRevocationConfirmed !== true"
);
const localClear = authLogout.indexOf(
  "clearSession({ invalidate: false })"
);

assert.ok(
  remoteCall >= 0 &&
    confirmation > remoteCall &&
    localClear > confirmation,
  "local session may clear only after the server confirms revocation"
);

assert.match(
  authLogout,
  /if \(shouldClearSessionForAuthError\(error\)\)[\s\S]*?clearSession\(\{ invalidate: false \}\)[\s\S]*?return true;[\s\S]*?throw error;/,
  "only a final auth error may turn a failed remote logout into local success"
);

assert.match(
  authLogout,
  /sessionState\.logoutPromise[\s\S]*?sessionState\.loggingOut = true/,
  "logout must remain single-flight"
);

assert.doesNotMatch(
  authLogout,
  /let remoteLogout|catch\s*\{\s*\}|best-effort/,
  "Auth.logout must not swallow remote revocation failures"
);

const httpLogout = scope(
  http,
  "export function logout(",
  "export function logoutAll(",
  "Http.logout"
);
const httpLogoutAll = scope(
  http,
  "export function logoutAll(",
  "export function me(",
  "Http.logoutAll"
);

for (const [name, source] of [
  ["logout", httpLogout],
  ["logout-all", httpLogoutAll],
]) {
  assert.match(source, /auth:\s*true/, `${name} must require access auth`);
  assert.doesNotMatch(
    source,
    /noAutoRefresh:\s*true/,
    `${name} must allow one refresh+retry for an expired access token`
  );
}

const sidebarLogout = scope(
  sidebar,
  "async function handleLogout(",
  "/* =========================================================\n   REGISTRATION",
  "Sidebar.handleLogout"
);

assert.match(
  sidebarLogout,
  /loggedOut\s*=\s*await auth\.logout\([\s\S]*?\) === true/,
  "sidebar must await an explicit successful logout result"
);
assert.match(
  sidebarLogout,
  /catch\s*\{[\s\S]*?showLogoutFailure\(\);[\s\S]*?return false;[\s\S]*?finally/,
  "sidebar must keep the authenticated UI and surface remote logout failure"
);
assert.ok(
  sidebarLogout.indexOf("router?.replace") >
    sidebarLogout.indexOf("showLogoutFailure()"),
  "navigation to login must exist only after the failure branch returns"
);
assert.doesNotMatch(
  sidebarLogout,
  /logout remoto best-effort/,
  "sidebar must not describe revocation as best-effort"
);

assert.match(
  sidebar,
  /Sigues conectado; inténtalo de nuevo\./,
  "logout failure must tell the user that the session remains active"
);

assert.match(
  ci,
  /node --experimental-default-type=module \.github\/scripts\/auth_logout_contract\.mjs/,
  "critical SPA validation must execute the logout regression contract"
);

function seedAuthenticatedSession() {
  Auth.clearSession();

  AppCore.runtimeState.write({
    token: "logout.header.payload",
    user: {
      id: "logout-user",
      userId: "logout-user",
      username: "LogoutUser",
      slug: "logout-user",
      role: "user",
      permissions: [],
    },
    session: {
      id: "logout-session",
      sessionId: "logout-session",
      userId: "logout-user",
    },
    hasRefreshToken: true,
  });

  assert.equal(Auth.isAuthenticated(), true);
}

const confirmedLogout = Object.freeze({
  ok: true,
  success: true,
  authenticated: false,
  loggedOut: true,
  serverRevocationConfirmed: true,
});

const originalHttpLogout = Http.logout;

try {
  seedAuthenticatedSession();

  Http.logout = async () => {
    const error = new Error("simulated storage failure");
    error.code = "LOGOUT_FAILED";
    error.status = 503;
    error.endpoint = "/api/auth/logout";
    throw error;
  };

  await assert.rejects(
    () => Auth.logout(),
    (error) =>
      error?.code === "LOGOUT_FAILED" &&
      error?.status === 503
  );
  assert.equal(
    Auth.isAuthenticated(),
    true,
    "retryable 5xx must preserve the local authenticated session"
  );

  seedAuthenticatedSession();

  Http.logout = async () => ({
    ok: false,
    loggedOut: true,
    serverRevocationConfirmed: false,
  });

  await assert.rejects(
    () => Auth.logout(),
    (error) =>
      error?.code === "LOGOUT_REVOCATION_UNCONFIRMED" &&
      error?.status === 503
  );
  assert.equal(
    Auth.isAuthenticated(),
    true,
    "an unconfirmed 2xx payload must preserve the local session"
  );

  seedAuthenticatedSession();
  Http.logout = async () => confirmedLogout;

  assert.equal(await Auth.logout(), true);
  assert.equal(
    Auth.isAuthenticated(),
    false,
    "confirmed remote revocation must clear local auth"
  );

  seedAuthenticatedSession();

  Http.logout = async () => {
    const error = new Error("session already revoked");
    error.code = "SESSION_REVOKED";
    error.status = 401;
    error.endpoint = "/api/auth/logout";
    throw error;
  };

  assert.equal(
    await Auth.logout(),
    true,
    "a final auth error may complete idempotent local logout"
  );
  assert.equal(Auth.isAuthenticated(), false);

  seedAuthenticatedSession();

  let remoteCalls = 0;
  let releaseLogout = null;

  Http.logout = () => {
    remoteCalls += 1;

    return new Promise((resolve) => {
      releaseLogout = () => resolve(confirmedLogout);
    });
  };

  const firstLogout = Auth.logout();
  const secondLogout = Auth.logout();

  assert.equal(
    remoteCalls,
    1,
    "concurrent logout callers must share one remote revocation"
  );

  releaseLogout();

  assert.deepEqual(
    await Promise.all([firstLogout, secondLogout]),
    [true, true]
  );
  assert.equal(Auth.isAuthenticated(), false);
} finally {
  Http.logout = originalHttpLogout;
  Auth.clearSession();
}

console.log(
  "Auth logout contract OK · remote revocation is confirmed before local logout"
);
