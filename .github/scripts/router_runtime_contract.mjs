import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { AppCore } from "../../src/core/index.js";
import { Router, ROUTER_VERSION } from "../../src/router/index.js";

assert.equal(
  ROUTER_VERSION,
  "router.minimal.v11-native-runtime-state"
);

assert.equal(
  typeof AppCore.runtimeState?.read,
  "function",
  "Core must expose the native runtime read port"
);
assert.equal(
  typeof AppCore.runtimeState?.write,
  "function",
  "Core must expose the native runtime write port"
);

const before = AppCore.runtimeState.getStats();
const canonicalPath = Router.getCurrentCanonicalPath();
const after = AppCore.runtimeState.getStats();

assert.equal(typeof canonicalPath, "string");
assert.equal(
  after.reads,
  before.reads + 1,
  "Router canonical state lookup must perform exactly one native runtime read"
);

const snapshot = Router.getSnapshot();
assert.equal(snapshot.policy.sensitivePublicPathInState, false);
assert.equal(snapshot.policy.sensitivePublicPathInDom, false);
assert.equal(snapshot.policy.sensitivePublicPathInHistoryState, false);
assert.equal(snapshot.policy.tokenPassedToViewInMemory, true);
assert.equal(snapshot.policy.transitionAbort, true);
assert.equal(snapshot.policy.staleCommitProtection, true);
assert.equal(snapshot.policy.samePendingNavigationDedup, true);

const source = await readFile("src/router/index.js", "utf8");

assert.equal(
  /\bAppCore\s*\.\s*getState\s*\(/.test(source),
  false,
  "Router hot path must not call the public snapshot API AppCore.getState()"
);
assert.equal(
  /\bAppCore\s*\.\s*setState\s*\(/.test(source),
  false,
  "Router writes must not call public AppCore.setState()"
);

const directStateAccessPatterns = [
  /\bAppCore\s*\.\s*state\s*\.\s*[A-Za-z_$][\w$]*/,
  /\bAppCore\s*\.\s*state\s*\[/,
  /\bAppCore\s*\.\s*state\s*=/,
  /\bObject\s*\.\s*assign\s*\(\s*AppCore\s*\.\s*state\b/,
  /\bdelete\s+AppCore\s*\.\s*state\b/,
];

for (const pattern of directStateAccessPatterns) {
  assert.equal(
    pattern.test(source),
    false,
    `Router must not access or mutate AppCore.state directly: ${pattern}`
  );
}

assert.equal(
  source.includes("AppCore.runtimeState.read()"),
  true,
  "Router must consume Core's explicit runtime read port"
);
assert.equal(
  source.includes("AppCore.runtimeState.write("),
  true,
  "Router must consume Core's explicit runtime write port"
);
assert.equal(
  source.includes("root.replaceChildren("),
  true,
  "atomic route-host swap must remain intact"
);
assert.equal(
  source.includes("transitionIsCurrent("),
  true,
  "stale-transition cancellation must remain intact"
);
assert.equal(
  source.includes("stateSafePublicPath("),
  true,
  "sensitive public-path sanitization must remain intact"
);

console.log(
  "Router runtime contract OK · native Core port · no public state snapshots"
);
