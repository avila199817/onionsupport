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

export const WARMUP_VERSION = "app.warmup.v3";

let runs = 0;

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
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
    reason: redact(reason || "warmup"),

    runs,

    policy: {
      compatibilityOnly: true,
      noopWarmup: true,
      doesNotBlockBoot: true,

      noImports: true,
      noEvents: true,
      noGlobalDebug: true,
      noFetch: true,
      noStorage: true,
      noDomScan: true,
      noLargeSnapshots: true,

      redactedSnapshot: true,
    },
  };
}

export function getWarmupRuntimeSnapshot() {
  return {
    version: WARMUP_VERSION,

    runs,

    policy: {
      compatibilityOnly: true,
      noopWarmup: true,
      redactedSnapshot: true,
    },
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
  const payload = isObject(options) ? options : {};

  runs += 1;

  return createWarmupSnapshot(payload);
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default warmup;
