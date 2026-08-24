import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ROUTE_INTENT_PRELOAD_VERSION,
  normalizeIntentPath,
  shouldPrefetchForConnection,
  shouldPrefetchForDocument,
  shouldUsePointerIntent,
  getRouteIntentPreloadSnapshot,
} from "../../src/features/route-intent-preload/index.js";

import {
  RUNTIME_PERFORMANCE_VERSION,
  getRuntimePerformanceSnapshot,
  isCommittedRouteHost,
  shouldRecordRouteCommit,
} from "../../src/features/runtime-performance/index.js";

assert.equal(
  ROUTE_INTENT_PRELOAD_VERSION,
  "route-intent-preload.v2-strong-intent-gates"
);

assert.equal(
  RUNTIME_PERFORMANCE_VERSION,
  "runtime-performance.v2-committed-host-lifecycle"
);

assert.equal(
  normalizeIntentPath("/@User/facturas?token=secret#modal"),
  "/@User/facturas"
);
assert.equal(normalizeIntentPath("facturas//"), "/facturas");

assert.equal(shouldPrefetchForConnection(null), true);
assert.equal(shouldPrefetchForConnection({ saveData: true }), false);
assert.equal(shouldPrefetchForConnection({ effectiveType: "slow-2g" }), false);
assert.equal(shouldPrefetchForConnection({ effectiveType: "2g" }), false);
assert.equal(shouldPrefetchForConnection({ effectiveType: "3g" }), true);
assert.equal(shouldPrefetchForConnection({ effectiveType: "4g" }), true);

assert.equal(shouldPrefetchForDocument("visible"), true);
assert.equal(shouldPrefetchForDocument("hidden"), false);
assert.equal(shouldPrefetchForDocument("prerender"), false);

assert.equal(shouldUsePointerIntent("mouse", "hover-dwell"), true);
assert.equal(shouldUsePointerIntent("touch", "hover-dwell"), false);
assert.equal(shouldUsePointerIntent("pen", "hover-dwell"), false);
assert.equal(shouldUsePointerIntent("mouse", "pointerdown"), true);
assert.equal(shouldUsePointerIntent("pen", "pointerdown"), true);
assert.equal(shouldUsePointerIntent("touch", "pointerdown"), false);

const intentSnapshot = getRouteIntentPreloadSnapshot();
assert.equal(intentSnapshot.installed, false);
assert.equal(intentSnapshot.policy.sameOriginOnly, true);
assert.equal(intentSnapshot.policy.strongIntentOnly, true);
assert.equal(intentSnapshot.policy.saveDataAware, true);
assert.equal(intentSnapshot.policy.slow2gAware, true);
assert.equal(intentSnapshot.policy.documentVisibleOnly, true);
assert.equal(intentSnapshot.policy.modifierAware, true);
assert.equal(intentSnapshot.policy.touchPointerdown, false);
assert.equal(intentSnapshot.policy.activeRouteSkip, true);
assert.equal(intentSnapshot.policy.routerResolution, true);
assert.equal(intentSnapshot.policy.liveGuardAware, true);
assert.equal(intentSnapshot.policy.authCache, false);
assert.equal(intentSnapshot.policy.clickCapture, false);
assert.equal(intentSnapshot.policy.routerCacheAuthority, true);
assert.equal(intentSnapshot.policy.storesRawUrls, false);
assert.equal(intentSnapshot.policy.externalNetwork, false);
assert.equal(intentSnapshot.policy.storage, false);

const preparingHost = {
  hidden: true,
  dataset: {
    routeHost: "true",
    routeHostState: "preparing",
    viewKey: "facturas",
  },
};

const readyHost = {
  hidden: false,
  dataset: {
    routeHost: "true",
    routeHostState: "ready",
    viewKey: "facturas",
  },
};

assert.equal(
  isCommittedRouteHost(preparingHost),
  false,
  "a hidden preparation host must never be a route commit"
);
assert.equal(
  isCommittedRouteHost(readyHost),
  true,
  "only the visible ready host is a committed route host"
);
assert.equal(
  shouldRecordRouteCommit(readyHost, readyHost),
  false,
  "the same committed host must not be counted twice"
);
assert.equal(
  shouldRecordRouteCommit(readyHost, preparingHost),
  true,
  "a new visible ready host is a new commit"
);

const perfSnapshot = getRuntimePerformanceSnapshot();
assert.equal(perfSnapshot.installed, false);
assert.equal(perfSnapshot.sampleCap, 64);
assert.equal(perfSnapshot.policy.localOnly, true);
assert.equal(perfSnapshot.policy.externalNetwork, false);
assert.equal(perfSnapshot.policy.storage, false);
assert.equal(perfSnapshot.policy.rawUrls, false);
assert.equal(perfSnapshot.policy.userIdentifiers, false);
assert.equal(perfSnapshot.policy.boundedSamples, true);
assert.equal(perfSnapshot.policy.routeHostOnlyObservation, true);
assert.equal(perfSnapshot.policy.visibleCommittedHostOnly, true);
assert.equal(perfSnapshot.policy.pendingViewKeyMatch, true);
assert.equal(perfSnapshot.policy.stalePaintDrop, true);
assert.equal(perfSnapshot.policy.interactionMetric, "event-duration-not-inp");
assert.equal(perfSnapshot.policy.lcpLifecycleAware, true);

const sourceFiles = [
  "src/features/route-intent-preload/index.js",
  "src/features/runtime-performance/index.js",
];

const forbiddenPatterns = [
  ["fetch() call", /(^|[^A-Za-z0-9_$])fetch\s*\(/m],
  ["XMLHttpRequest", /\bXMLHttpRequest\b/],
  ["sendBeacon", /\bsendBeacon\b/],
  ["localStorage", /\blocalStorage\b/],
  ["sessionStorage", /\bsessionStorage\b/],
  ["indexedDB", /\bindexedDB\b/],
];

for (const file of sourceFiles) {
  const text = await readFile(file, "utf8");
  for (const [label, pattern] of forbiddenPatterns) {
    assert.equal(
      pattern.test(text),
      false,
      `${file} must not contain ${label}`
    );
  }
}

const preloadSource = await readFile(
  "src/features/route-intent-preload/index.js",
  "utf8"
);
assert.equal(
  preloadSource.includes("Routes.preloadRouteView"),
  true,
  "route intent preload must reuse the Router view cache"
);
assert.equal(
  preloadSource.includes("HOVER_DWELL_MS = 64"),
  true,
  "hover prefetch must remain confidence-gated"
);
assert.equal(
  preloadSource.includes("ROUTE_COMMITTED_SELECTOR"),
  true,
  "active-route detection must use the committed host rather than URL persistence"
);
assert.equal(
  preloadSource.includes("getRouteMatch"),
  true,
  "scoped route intent must resolve through the canonical Router when available"
);
assert.equal(
  preloadSource.includes("runtimeState?.read"),
  true,
  "preload guard must read live runtime auth state without caching authorization"
);

const performanceSource = await readFile(
  "src/features/runtime-performance/index.js",
  "utf8"
);
assert.equal(
  performanceSource.includes("const MAX_SAMPLES = 64"),
  true,
  "performance buffers must remain bounded"
);
assert.equal(
  performanceSource.includes("subtree: false"),
  true,
  "route telemetry must not observe internal view mutations"
);
assert.equal(
  performanceSource.includes("ROUTE_COMMITTED_SELECTOR"),
  true,
  "route telemetry must resolve the visible ready host before recording a commit"
);
assert.equal(
  performanceSource.includes("pendingNavigationViewKey"),
  true,
  "navigation intent must be correlated by safe viewKey instead of raw URL"
);

console.log(
  "Navigation performance contract OK · strong-intent preload · committed-host telemetry"
);
