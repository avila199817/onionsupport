import assert from "node:assert/strict";
import { AppCore } from "../../src/core/index.js";
import { Auth, AUTH_VERSION } from "../../src/features/auth/index.js";

assert.equal(AUTH_VERSION, "auth.minimal.v8-single-read-selectors");
assert.equal(typeof Auth.getSelectorStats, "function");

Auth.init();
Auth.clearSession();

AppCore.runtimeState.write({
  token: "selector.header.payload",
  user: {
    id: "selector-user",
    username: "SelectorUser",
    slug: "selector-user",
    role: "user",
    permissions: ["selector:read"],
  },
  session: {
    sessionId: "selector-session",
    userId: "selector-user",
  },
  hasRefreshToken: true,
});

function oneCoreRead(label, callback) {
  const before = Auth.getSelectorStats();
  const result = callback();
  const after = Auth.getSelectorStats();

  assert.equal(
    after.coreReads - before.coreReads,
    1,
    `${label} must perform exactly one Core read`
  );

  assert.equal(
    after.httpTokenFallbacks,
    before.httpTokenFallbacks,
    `${label} must not ask HTTP for a token when Core already owns one`
  );

  return result;
}

assert.equal(oneCoreRead("getToken", () => Auth.getToken()), "selector.header.payload");
assert.equal(oneCoreRead("isAuthenticated", () => Auth.isAuthenticated()), true);
assert.equal(oneCoreRead("getRole", () => Auth.getRole()), "user");
assert.deepEqual(oneCoreRead("getRoles", () => Auth.getRoles()), ["user"]);
assert.equal(oneCoreRead("isAdmin", () => Auth.isAdmin()), false);
assert.equal(oneCoreRead("hasRole", () => Auth.hasRole("user")), true);
assert.equal(oneCoreRead("getUserSlug", () => Auth.getUserSlug()), "selector-user");
assert.equal(oneCoreRead("getDefaultHome", () => Auth.getDefaultHome()), "/@selector-user");
assert.equal(oneCoreRead("getPostLoginTarget", () => Auth.getPostLoginTarget()), "/@selector-user");
assert.equal(oneCoreRead("hasRefreshToken", () => Auth.hasRefreshToken()), true);
assert.deepEqual(
  oneCoreRead("getAuthHeader", () => Auth.getAuthHeader()),
  { Authorization: "Bearer selector.header.payload" }
);
assert.deepEqual(oneCoreRead("getPermissions", () => Auth.getPermissions()), ["selector:read"]);

const user = oneCoreRead("getUser", () => Auth.getUser());
user.role = "admin";
user.permissions.push("selector:write");
assert.equal(AppCore.state.user.role, "user");
assert.deepEqual(AppCore.state.user.permissions, ["selector:read"]);

const session = oneCoreRead("getSession", () => Auth.getSession());
session.sessionId = "mutated";
assert.equal(AppCore.state.session.sessionId, "selector-session");

const snapshot = Auth.getSnapshot();
assert.equal(snapshot.token, null);
assert.equal(snapshot.accessToken, null);
assert.equal(snapshot.access_token, null);
assert.equal(snapshot.refreshToken, null);
assert.equal(snapshot.refresh_token, null);
assert.notEqual(snapshot.user, snapshot.currentUser);
assert.notEqual(snapshot.session, snapshot.sessionData);
assert.equal(snapshot.policy.singleReadSelectors, true);
assert.equal(snapshot.policy.lazyHttpTokenFallback, true);

AppCore.runtimeState.write({
  user: {
    id: "selector-user",
    username: "SelectorUser",
    slug: "selector-user",
    role: "admin",
    permissions: ["selector:read"],
  },
});
assert.equal(oneCoreRead("admin isAdmin", () => Auth.isAdmin()), true);
assert.equal(oneCoreRead("admin role override", () => Auth.hasRole("user")), true);

Auth.clearSession();
assert.equal(AppCore.state.authenticated, false);
assert.equal(AppCore.state.token, null);
assert.equal(AppCore.state.user, null);
assert.equal(AppCore.state.hasRefreshToken, false);

console.log(
  `Auth selector contract OK · coreReads=${Auth.getSelectorStats().coreReads} · contexts=${Auth.getSelectorStats().contexts}`
);
