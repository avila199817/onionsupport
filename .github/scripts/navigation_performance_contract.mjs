import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  APP_ENHANCEMENTS_VERSION,
  getAppEnhancementsSnapshot,
  isCommittedEnhancementRouteHost,
  shouldSyncCommittedRouteHost,
} from "../../src/app/enhancements.js";

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
  ROUTE_PERFORMANCE_PHASES,
  getRuntimePerformanceSnapshot,
  isCommittedRouteHost,
  isSupportedRoutePerformancePhase,
  shouldRecordRouteCommit,
} from "../../src/features/runtime-performance/index.js";

assert.equal(
  APP_ENHANCEMENTS_VERSION,
  "app.enhancements.v15-committed-route-sync"
);
assert.equal(
  ROUTE_INTENT_PRELOAD_VERSION,
  "route-intent-preload.v2-strong-intent-gates"
);
assert.equal(
  RUNTIME_PERFORMANCE_VERSION,
  "runtime-performance.v3-route-phase-attribution"
);
assert.deepEqual(
  [...ROUTE_PERFORMANCE_PHASES],
  [
    "resolve",
    "auth-wait",
    "guard",
    "style-load",
    "view-cold",
    "view-warm",
    "commit",
    "chrome",
  ]
);
for (const phase of ROUTE_PERFORMANCE_PHASES) {
  assert.equal(isSupportedRoutePerformancePhase(phase), true);
}
assert.equal(isSupportedRoutePerformancePhase("raw-url"), false);
assert.equal(isSupportedRoutePerformancePhase("backend"), false);

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
    routePath: "/facturas",
    viewKey: "facturas",
  },
};

const readyHost = {
  hidden: false,
  dataset: {
    routeHost: "true",
    routeHostState: "ready",
    routePath: "/facturas",
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

assert.equal(
  isCommittedEnhancementRouteHost(preparingHost),
  false,
  "progressive features must ignore the hidden preparation host"
);
assert.equal(
  isCommittedEnhancementRouteHost(readyHost),
  true,
  "progressive features may sync only from the visible ready host"
);
assert.equal(
  shouldSyncCommittedRouteHost(readyHost, readyHost),
  false,
  "the same committed host must not resync progressive features"
);
assert.equal(
  shouldSyncCommittedRouteHost(readyHost, preparingHost),
  true,
  "a new committed host must trigger exactly one route feature sync"
);

const enhancementsSnapshot = getAppEnhancementsSnapshot();
assert.equal(enhancementsSnapshot.policy.routeCommitLazyLoading, true);
assert.equal(enhancementsSnapshot.policy.visibleCommittedHostOnly, true);
assert.equal(enhancementsSnapshot.policy.preparationHostIgnored, true);
assert.equal(enhancementsSnapshot.policy.rapidNavigationCoalescing, true);
assert.equal(enhancementsSnapshot.policy.speculativeRoutePreload, false);
assert.equal(enhancementsSnapshot.policy.routeHostOnlyObservation, true);
assert.equal(enhancementsSnapshot.policy.mutationObserverFallback, true);

const perfSnapshot = getRuntimePerformanceSnapshot();
assert.equal(perfSnapshot.installed, false);
assert.equal(perfSnapshot.sampleCap, 64);
assert.equal(perfSnapshot.routePhaseEvents, 0);
assert.equal(perfSnapshot.recentRoutePhases.length, 0);
for (const phase of ROUTE_PERFORMANCE_PHASES) {
  assert.equal(perfSnapshot.routePhases[phase].count, 0);
  assert.equal(perfSnapshot.longTaskAttribution.byPhase[phase].count, 0);
}
assert.equal(perfSnapshot.longTaskAttribution.seen, 0);
assert.equal(perfSnapshot.longTaskAttribution.attributed, 0);
assert.equal(perfSnapshot.longTaskAttribution.unattributed, 0);
assert.equal(perfSnapshot.policy.localOnly, true);
assert.equal(perfSnapshot.policy.externalNetwork, false);
assert.equal(perfSnapshot.policy.storage, false);
assert.equal(perfSnapshot.policy.rawUrls, false);
assert.equal(perfSnapshot.policy.userIdentifiers, false);
assert.equal(perfSnapshot.policy.boundedSamples, true);
assert.equal(perfSnapshot.policy.boundedPhaseWindows, 128);
assert.equal(perfSnapshot.policy.boundedPhaseViews, 32);
assert.equal(perfSnapshot.policy.routeHostOnlyObservation, true);
assert.equal(perfSnapshot.policy.visibleCommittedHostOnly, true);
assert.equal(perfSnapshot.policy.pendingViewKeyMatch, true);
assert.equal(perfSnapshot.policy.stalePaintDrop, true);
assert.equal(perfSnapshot.policy.interactionMetric, "event-duration-not-inp");
assert.equal(perfSnapshot.policy.lcpLifecycleAware, true);
assert.equal(perfSnapshot.policy.opaqueNavigationIds, true);
assert.equal(perfSnapshot.policy.routePhaseViewKeyOnly, true);
assert.equal(perfSnapshot.policy.monotonicPhaseWindows, true);
assert.equal(perfSnapshot.policy.longTaskPhaseAttribution, "best-overlap");

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

const enhancementsSource = await readFile(
  "src/app/enhancements.js",
  "utf8"
);
assert.equal(
  enhancementsSource.includes("ROUTE_COMMITTED_SELECTOR"),
  true,
  "enhancements must resolve the visible ready host before syncing route features"
);
assert.equal(
  enhancementsSource.includes("lastCommittedHost"),
  true,
  "enhancements must dedupe route sync by committed host identity"
);
assert.equal(
  enhancementsSource.includes("subtree: false"),
  true,
  "enhancements must not observe internal view mutations"
);

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
  performanceSource.includes("const MAX_PHASE_WINDOWS = 128"),
  true,
  "route phase attribution windows must remain bounded"
);
assert.equal(
  performanceSource.includes("const MAX_PHASE_VIEWS = 32"),
  true,
  "per-view attribution cardinality must remain bounded"
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
assert.equal(
  performanceSource.includes("recordRoutePerformancePhase"),
  true,
  "runtime telemetry must expose the explicit Router phase receiver"
);
assert.equal(
  performanceSource.includes("bestPhaseWindow"),
  true,
  "long tasks must be attributed by bounded phase-window overlap"
);
assert.equal(
  performanceSource.includes("phaseOverlap"),
  true,
  "long-task attribution must use temporal overlap rather than route-name guessing"
);

const routerSource = await readFile(
  "src/router/index.js",
  "utf8"
);
for (const phase of ROUTE_PERFORMANCE_PHASES) {
  assert.equal(
    routerSource.includes(`"${phase}"`),
    true,
    `Router must emit the ${phase} phase`
  );
}
assert.equal(
  routerSource.includes("Routes.isRouteViewLoaded?.("),
  true,
  "cold/warm view attribution must read the Router view cache"
);
assert.equal(
  routerSource.includes("recordTransitionPhase("),
  true,
  "Router must emit phase windows through the optional telemetry module"
);

console.log(
  "Navigation performance contract OK · bounded Router phases · Long Task attribution · committed lazy sync"
);
