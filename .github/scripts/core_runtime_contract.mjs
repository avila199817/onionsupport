import assert from "node:assert/strict";
import { AppCore, CORE_VERSION } from "../../src/core/index.js";

assert.equal(
  CORE_VERSION,
  "core.minimal.v8-dirty-runtime-state",
  "Core runtime contract version must stay explicit"
);

assert.equal(
  AppCore.runtimeState?.version,
  "core.runtime-state.v2-dirty-guard",
  "runtimeState v2 port is required"
);

assert.equal(
  typeof AppCore.runtimeState?.getStats,
  "function",
  "runtimeState must expose cheap reconciliation metrics"
);

const firstState = AppCore.runtimeState.read();
const afterFirstRead = AppCore.runtimeState.getStats();

assert.equal(firstState, AppCore.state, "runtime read must be zero-copy");

for (let index = 0; index < 32; index += 1) {
  assert.equal(AppCore.runtimeState.read(), firstState);
}

const afterHotReads = AppCore.runtimeState.getStats();
assert.equal(
  afterHotReads.reconciliations,
  afterFirstRead.reconciliations,
  "stable runtime reads must not reconcile Auth repeatedly"
);

AppCore.runtimeState.write({
  token: "contract.header.payload",
  user: {
    id: "contract-user",
    username: "ContractUser",
    slug: "ContractUser",
    role: "user",
    permissions: ["contract:read"],
  },
  session: {
    sessionId: "contract-session",
    userId: "contract-user",
  },
  hasRefreshToken: true,
});

assert.equal(AppCore.isAuthenticated(), true);
assert.equal(AppCore.getCurrentRole(), "user");
assert.equal(AppCore.state.homePath, "/@contractuser");

const publicSnapshot = AppCore.getState();
assert.equal(publicSnapshot.token, null);
assert.equal(publicSnapshot.accessToken, null);
assert.equal(publicSnapshot.access_token, null);

publicSnapshot.user.role = "admin";
publicSnapshot.user.permissions.push("contract:write");
assert.equal(AppCore.state.user.role, "user", "public snapshot must isolate user object");
assert.deepEqual(
  AppCore.state.user.permissions,
  ["contract:read"],
  "public snapshot must isolate nested permission arrays"
);

const beforeLegacyRepair = AppCore.runtimeState.getStats();
AppCore.state.user.role = "admin";
assert.equal(AppCore.getCurrentRole(), "admin", "legacy nested role mutation must be reconciled");
const afterLegacyRepair = AppCore.runtimeState.getStats();
assert.ok(
  afterLegacyRepair.legacyRepairs > beforeLegacyRepair.legacyRepairs,
  "legacy mutation must be observable as a repair"
);

AppCore.state.token = null;
AppCore.state.accessToken = "legacy.alias.token";
AppCore.state.access_token = null;
assert.deepEqual(
  AppCore.getAuthHeader(),
  { Authorization: "Bearer legacy.alias.token" },
  "legacy accessToken alias must reconcile into canonical token"
);
assert.equal(AppCore.state.token, "legacy.alias.token");

AppCore.setState({
  route: "/facturas?token=secret&safe=1",
  routeParams: {
    ok: "visible",
    token: "must-not-leak",
  },
});
assert.equal(AppCore.state.route, "/facturas?safe=1");
assert.equal(AppCore.state.routeParams.token, "***");

const requestA = AppCore.getActiveRequest();
const requestB = AppCore.getActiveRequest();
assert.equal(requestA, requestB, "bound HTTP request function must be reused");

AppCore.clearSession();
assert.equal(AppCore.isAuthenticated(), false);
assert.equal(AppCore.state.hasRefreshToken, false);
assert.equal(AppCore.state.user, null);
assert.equal(AppCore.state.token, null);

const finalSnapshot = AppCore.getSnapshot();
assert.equal(finalSnapshot.runtimeState.version, "core.runtime-state.v2-dirty-guard");
assert.equal(finalSnapshot.session.sessionId, null);

console.log(
  `Core runtime contract OK · reads=${finalSnapshot.runtimeState.reads} · reconciliations=${finalSnapshot.runtimeState.reconciliations}`
);
