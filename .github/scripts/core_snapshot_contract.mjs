import assert from "node:assert/strict";
import { AppCore, CORE_VERSION } from "../../src/core/index.js";

assert.equal(CORE_VERSION, "core.minimal.v9-specialized-snapshot");

AppCore.clearSession();
AppCore.runtimeState.write({
  token: "snapshot.header.payload",
  user: {
    id: "snapshot-user",
    username: "SnapshotUser",
    slug: "snapshot-user",
    role: "user",
    permissions: ["snapshot:read"],
  },
  session: {
    sessionId: "snapshot-session",
    userId: "snapshot-user",
  },
  routeParams: {
    page: 1,
    nested: {
      list: [1, 2, 3],
      detail: { enabled: true },
    },
  },
});

const nativeStructuredClone = globalThis.structuredClone;
let structuredCloneCalls = 0;

globalThis.structuredClone = (...args) => {
  structuredCloneCalls += 1;
  return nativeStructuredClone(...args);
};

try {
  const snapshot = AppCore.getState();

  assert.equal(
    structuredCloneCalls,
    0,
    "canonical getState() must not invoke generic structuredClone"
  );

  assert.equal(snapshot.token, null);
  assert.equal(snapshot.accessToken, null);
  assert.equal(snapshot.access_token, null);

  snapshot.user.role = "admin";
  snapshot.user.permissions.push("snapshot:write");
  snapshot.session.sessionId = "mutated-session";
  snapshot.routeParams.nested.list.push(4);
  snapshot.routeParams.nested.detail.enabled = false;

  assert.equal(AppCore.state.user.role, "user");
  assert.deepEqual(AppCore.state.user.permissions, ["snapshot:read"]);
  assert.equal(AppCore.state.session.sessionId, "snapshot-session");
  assert.deepEqual(AppCore.state.routeParams.nested.list, [1, 2, 3]);
  assert.equal(AppCore.state.routeParams.nested.detail.enabled, true);

  const withToken = AppCore.getState({ includeToken: true });
  assert.equal(withToken.token, "snapshot.header.payload");
  assert.equal(structuredCloneCalls, 0);

  AppCore.setState(
    {
      pluginState: {
        nested: { value: 1 },
      },
    },
    { raw: true }
  );

  const beforeExtensionSnapshot = structuredCloneCalls;
  const extensionSnapshot = AppCore.getState();

  assert.ok(
    structuredCloneCalls > beforeExtensionSnapshot,
    "unknown object extensions must retain generic deep-clone compatibility"
  );

  extensionSnapshot.pluginState.nested.value = 2;
  assert.equal(AppCore.state.pluginState.nested.value, 1);
} finally {
  globalThis.structuredClone = nativeStructuredClone;
  delete AppCore.state.pluginState;
  AppCore.clearSession();
}

console.log(
  `Core snapshot contract OK · genericCloneCalls=${structuredCloneCalls}`
);
