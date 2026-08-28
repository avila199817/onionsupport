import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { AppCore } from "../../src/core/index.js";
import { Router, ROUTER_VERSION } from "../../src/router/index.js";

assert.equal(
  ROUTER_VERSION,
  "router.minimal.v16-private-runtime-after-guard"
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
assert.equal(snapshot.policy.singleRouteResolutionPerTransition, true);
assert.equal(snapshot.policy.postCommitActiveMenuDedup, true);

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

const authWaitStart = source.indexOf("async function waitForAuthIfNeeded(");
const authWaitEnd = source.indexOf("\nfunction isAuthenticated(", authWaitStart);
assert.ok(
  authWaitStart >= 0 && authWaitEnd > authWaitStart,
  "Router contract must isolate waitForAuthIfNeeded()"
);
const authWaitSource = source.slice(authWaitStart, authWaitEnd);
const publicShortCircuitIndex = authWaitSource.indexOf("route.public === true");
const authSelectorIndex = authWaitSource.indexOf('"isAuthenticated"');
const authResolvingIndex = authWaitSource.indexOf("isAuthResolving()");
const authPromiseIndex = authWaitSource.indexOf("getInFlightAuthPromise()");
assert.ok(
  publicShortCircuitIndex >= 0 && authSelectorIndex > publicShortCircuitIndex,
  "known public routes must short-circuit before Auth.isAuthenticated()"
);
assert.equal(
  (authWaitSource.match(/"isAuthenticated"/g) || []).length,
  1,
  "private-route auth wait must retain exactly one authentication selector"
);
assert.ok(
  authResolvingIndex > authSelectorIndex,
  "private unauthenticated routes must still inspect resolving Auth state"
);
assert.ok(
  authPromiseIndex > authResolvingIndex,
  "private Auth wait must still reuse the in-flight Auth promise"
);

const executeRenderStart = source.indexOf("async function executeRender(");
const executeRenderEnd = source.indexOf("\nfunction render(", executeRenderStart);
assert.ok(
  executeRenderStart >= 0 && executeRenderEnd > executeRenderStart,
  "Router contract must isolate executeRender()"
);
const executeRenderSource = source.slice(executeRenderStart, executeRenderEnd);
assert.equal(
  (executeRenderSource.match(/\bgetRouteMatch\s*\(/g) || []).length,
  1,
  "each Router transition must resolve the route exactly once"
);
assert.equal(
  (executeRenderSource.match(/\bsetRoutePending\s*\(/g) || []).length,
  1,
  "each Router transition must publish pending route state exactly once"
);
assert.equal(
  executeRenderSource.includes("refreshResolveStartedAt"),
  false,
  "Router must not retain the redundant post-auth route resolution"
);

const guardIndex = executeRenderSource.indexOf("const guardStartedAt =");
const slugRedirectIndex = executeRenderSource.indexOf("if (\n      slugRedirect");
const privateRuntimeIndex = executeRenderSource.indexOf("const privateRuntimeStartedAt =");
const renderRouteIndex = executeRenderSource.indexOf("return await renderRoute(");
assert.ok(
  guardIndex >= 0 &&
  slugRedirectIndex > guardIndex &&
  privateRuntimeIndex > slugRedirectIndex &&
  renderRouteIndex > privateRuntimeIndex,
  "private runtime must start only after access/user-scope guards and before owner view render"
);
assert.equal(
  executeRenderSource.includes('"private-runtime"'),
  true,
  "private runtime activation must remain an explicit Router phase"
);

const goAfterLoginStart = source.indexOf("function goAfterLogin(");
const goAfterLoginEnd = source.indexOf(
  "\n/* =========================================================\n   EVENTS",
  goAfterLoginStart
);
assert.ok(
  goAfterLoginStart >= 0 && goAfterLoginEnd > goAfterLoginStart,
  "Router contract must isolate goAfterLogin()"
);
const goAfterLoginSource = source.slice(goAfterLoginStart, goAfterLoginEnd);
assert.equal(
  goAfterLoginSource.includes('authCall("syncAuthState", false)'),
  true,
  "post-login navigation must synchronize the new authenticated Core state"
);
assert.equal(
  /force:\s*true/.test(goAfterLoginSource),
  true,
  "post-login navigation must force a fresh transition across the guest/auth boundary"
);

const chromePhaseStart = source.indexOf("const chromeStartedAt =");
const chromePhaseEnd = source.indexOf(
  'recordTransitionPhase(\n      transition,\n      route,\n      "chrome"',
  chromePhaseStart
);
assert.ok(
  chromePhaseStart >= 0 && chromePhaseEnd > chromePhaseStart,
  "Router contract must isolate the successful post-commit chrome phase"
);
const chromePhaseSource = source.slice(chromePhaseStart, chromePhaseEnd);
assert.equal(
  chromePhaseSource.includes("syncChrome("),
  true,
  "successful commit must still sync Sidebar/Topbar"
);
assert.equal(
  chromePhaseSource.includes("setActiveMenu("),
  false,
  "Router must not re-walk active menu after Sidebar sync"
);

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
  "Router runtime contract OK · public auth short-circuit · private runtime after guard · forced post-login transition · native Core port"
);