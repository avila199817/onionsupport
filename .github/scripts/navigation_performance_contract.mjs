import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ROUTE_INTENT_PRELOAD_VERSION,
  normalizeIntentPath,
  shouldPrefetchForConnection,
  getRouteIntentPreloadSnapshot,
} from "../../src/features/route-intent-preload/index.js";

import {
  RUNTIME_PERFORMANCE_VERSION,
  getRuntimePerformanceSnapshot,
} from "../../src/features/runtime-performance/index.js";

assert.equal(
  ROUTE_INTENT_PRELOAD_VERSION,
  "route-intent-preload.v1-confidence-gated"
);

assert.equal(
  RUNTIME_PERFORMANCE_VERSION,
  "runtime-performance.v1-navigation-rendering"
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

const intentSnapshot = getRouteIntentPreloadSnapshot();
assert.equal(intentSnapshot.installed, false);
assert.equal(intentSnapshot.policy.sameOriginOnly, true);
assert.equal(intentSnapshot.policy.strongIntentOnly, true);
assert.equal(intentSnapshot.policy.saveDataAware, true);
assert.equal(intentSnapshot.policy.slow2gAware, true);
assert.equal(intentSnapshot.policy.routerCacheAuthority, true);
assert.equal(intentSnapshot.policy.storesRawUrls, false);
assert.equal(intentSnapshot.policy.externalNetwork, false);
assert.equal(intentSnapshot.policy.storage, false);

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

const sourceFiles = [
  "src/features/route-intent-preload/index.js",
  "src/features/runtime-performance/index.js",
];

for (const file of sourceFiles) {
  const text = await readFile(file, "utf8");
  for (const forbidden of [
    "fetch(",
    "XMLHttpRequest",
    "sendBeacon",
    "localStorage",
    "sessionStorage",
    "indexedDB",
  ]) {
    assert.equal(
      text.includes(forbidden),
      false,
      `${file} must not contain ${forbidden}`
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

console.log(
  "Navigation performance contract OK · local-only telemetry · confidence-gated preload"
);
