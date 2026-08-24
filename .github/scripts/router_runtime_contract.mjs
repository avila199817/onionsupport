import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { AppCore } from "../../src/core/index.js";
import { Router, ROUTER_VERSION } from "../../src/router/index.js";

assert.equal(
  ROUTER_VERSION,
  "router.minimal.v12-phase-attribution"
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
assert.equal(snapshot.policy.nativeRoutePhaseTelemetry, true);
assert.equal(snapshot.policy.opaqueNavigationPerformanceIds, true);

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

const executableStatePatterns = [
  /\bAppCore\s*\.\s*state\s*\.\s*[A-Za-z_$]/,
  /\bAppCore\s*\.\s*state\s*\[/,
  /\bAppCore\s*\.\s*state\s*=/,
  /\bObject\s*\.\s*assign\s*\(\s*AppCore\s*\.\s*state\b/,
  /\bdelete\s+AppCore\s*\.\s*state\b/,
];

for (const pattern of executableStatePatterns) {
  assert.equal(
    pattern.test(source),
    false,
    "Router must not mutate or dereference AppCore.state directly"
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
assert.equal(
  /AppCore\s*\.\s*getModule\?\.\(\s*["']runtimePerformance["']\s*\)/.test(source),
  true,
  "Router phase telemetry must remain an optional Core registry lookup"
);
assert.equal(
  source.includes("performanceId") && source.includes("`nav:${"),
  true,
  "navigation performance IDs must be local opaque sequence IDs"
);
assert.equal(
  source.includes("recordTransitionPhase("),
  true,
  "Router must emit explicit phase windows"
);
assert.equal(
  source.includes("Routes.isRouteViewLoaded?.("),
  true,
  "cold/warm classification must reuse the canonical route-view cache"
);
assert.equal(source.includes('"view-cold"'), true);
assert.equal(source.includes('"view-warm"'), true);
assert.equal(source.includes('"style-load"'), true);
assert.equal(source.includes('"commit"'), true);
assert.equal(source.includes('"chrome"'), true);
assert.equal(source.includes('"resolve"'), true);
assert.equal(source.includes('"guard"'), true);
assert.equal(source.includes('"auth-wait"'), true);

const phaseCallStart = source.indexOf("module.recordRoutePhase({");
assert.notEqual(
  phaseCallStart,
  -1,
  "Router must call the telemetry receiver"
);
const phaseCallEnd = source.indexOf("}) === true", phaseCallStart);
assert.notEqual(phaseCallEnd, -1);
const phasePayload = source.slice(phaseCallStart, phaseCallEnd);
for (const forbidden of [
  "publicPath",
  "canonicalPath",
  "pathname",
  "href",
  "token",
  "userSlug",
]) {
  assert.equal(
    phasePayload.includes(forbidden),
    false,
    `phase payload must not expose ${forbidden}`
  );
}
for (const required of [
  "navigationId",
  "viewKey",
  "phase",
  "startTime",
  "endTime",
]) {
  assert.equal(
    phasePayload.includes(required),
    true,
    `phase payload must include ${required}`
  );
}

const failedCommitIndex = source.indexOf("if (!committed)");
const styleCommitIndex = source.indexOf(
  "commitRouteStylesForTransition(",
  failedCommitIndex
);
assert.ok(
  failedCommitIndex >= 0 && styleCommitIndex > failedCommitIndex,
  "style commit must remain after successful DOM commit validation"
);

console.log(
  "Router runtime contract OK · native Core port · explicit private phase telemetry"
);
