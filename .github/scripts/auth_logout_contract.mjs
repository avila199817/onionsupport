import assert from "node:assert/strict";
import fs from "node:fs";

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

console.log(
  "Auth logout contract OK · remote revocation is confirmed before local logout"
);
