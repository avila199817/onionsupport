/* =========================================================
   Onion Support - App Warmup
   Archivo: /src/app/warmup.js

   Responsabilidad:
   - Compat mínima post-boot.
   - No bloquea el arranque.
   - Sin imports.
   - Sin eventos.
   - Sin debug global.
   - Sin fetch.
   - Sin storage.
   - Sin DOM scan.
   - Sin snapshots grandes.
========================================================= */

export const WARMUP_VERSION = "app.warmup.v2";

let runs = 0;

/* =========================================================
   BASICS
========================================================= */

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function createWarmupSnapshot({
  reason = "warmup",
} = {}) {
  return {
    version: WARMUP_VERSION,
    ok: true,
    skipped: true,
    reason: cleanText(reason, "warmup"),
    runs,
  };
}

export function getWarmupRuntimeSnapshot() {
  return {
    version: WARMUP_VERSION,
    runs,
  };
}

export function resetWarmupRuntimeState() {
  runs = 0;
  return getWarmupRuntimeSnapshot();
}

/* =========================================================
   PUBLIC API
========================================================= */

export async function warmup(options = {}) {
  runs += 1;
  return createWarmupSnapshot(options);
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default warmup;
