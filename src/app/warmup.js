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

export const WARMUP_VERSION = "simple";

let count = 0;
let lastSnapshot = null;

function getState(AppCore = null) {
  return AppCore?.state && typeof AppCore.state === "object"
    ? AppCore.state
    : {};
}

export function createWarmupSnapshot(options = {}) {
  const { AppCore = null, reason = "warmup" } = options;
  const state = getState(AppCore);

  return {
    version: WARMUP_VERSION,
    ok: true,
    reason,
    count,
    route: state.route || state.publicPath || "/",
    ready: Boolean(state.ready || state.appReady),
    authenticated: Boolean(state.authenticated),
  };
}

export function getWarmupSummary(snapshot = lastSnapshot) {
  return {
    ok: Boolean(snapshot?.ok),
    version: WARMUP_VERSION,
    route: snapshot?.route || "/",
    ready: Boolean(snapshot?.ready),
    authenticated: Boolean(snapshot?.authenticated),
  };
}

export function getWarmupRuntimeSnapshot() {
  return {
    version: WARMUP_VERSION,
    count,
    lastSnapshot,
  };
}

export function resetWarmupRuntimeState() {
  count = 0;
  lastSnapshot = null;

  return getWarmupRuntimeSnapshot();
}

export function exposeWarmupDebugApi() {
  return {
    version: WARMUP_VERSION,
    run: warmup,
    getLastSnapshot: () => lastSnapshot,
    getRuntimeSnapshot: getWarmupRuntimeSnapshot,
    reset: resetWarmupRuntimeState,
  };
}

export function printWarmupSummary(snapshot = lastSnapshot) {
  return getWarmupSummary(snapshot);
}

export async function warmup(options = {}) {
  count += 1;
  lastSnapshot = createWarmupSnapshot(options);

  return lastSnapshot;
}

export default warmup;
