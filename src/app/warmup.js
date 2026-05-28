/* =========================================================
   Onion Support - App Warmup
   Archivo: /src/app/warmup.js

   Responsabilidad:
   - Compat mínima post-boot.
   - No bloquea el arranque.
   - No hace trabajo real.
   - Sin imports, eventos, debug global, fetch, storage, DOM scan,
     snapshots grandes, timers, repair loops ni dominio.
========================================================= */

export const WARMUP_VERSION = "app.warmup.v5";

let runs = 0;

const WARMUP_POLICY = Object.freeze({
  compatibilityOnly: true,
  noopWarmup: true,
  doesNotBlockBoot: true,

  noImports: true,
  noEvents: true,
  noGlobalDebug: true,
  noFetch: true,
  noStorage: true,
  noDomScan: true,
  noTimers: true,
  noRepairLoops: true,
  noDomainLogic: true,
  noLargeSnapshots: true,
});

/* =========================================================
   SNAPSHOT
========================================================= */

export function createWarmupSnapshot() {
  return {
    version: WARMUP_VERSION,

    ok: true,
    skipped: true,
    reason: "noop",

    runs,

    policy: WARMUP_POLICY,
  };
}

export function getWarmupRuntimeSnapshot() {
  return {
    version: WARMUP_VERSION,
    runs,
    policy: WARMUP_POLICY,
  };
}

export function resetWarmupRuntimeState() {
  runs = 0;
  return getWarmupRuntimeSnapshot();
}

/* =========================================================
   PUBLIC API
========================================================= */

export async function warmup() {
  runs += 1;
  return createWarmupSnapshot();
}

export default warmup;
