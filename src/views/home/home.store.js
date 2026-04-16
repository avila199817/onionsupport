/* =========================================================
   Onion SPA - Home Store
   Archivo: src/views/home/home.store.js

   FINAL PRO SYSTEM · SEMANTIC STORE · 10/10

   Responsabilidades:
   - exponer acceso semántico al estado Home
   - desacoplar consumers del shape interno de home.state.js
   - ofrecer getters y setters de alto nivel
   - facilitar integración con api / view / bindings
   - centralizar lectura de flags y metadatos
   - mantener coherencia con home.api.js y home.state.js
========================================================= */

import {
  HOME_SOURCES,

  getHomeState,
  getHomeSummary,
  getHomeSource,
  getHomeKpis,
  getHomeAlerts,
  getHomeRecentActivity,
  getHomeQuickActions,
  getHomeHealth,
  getHomeUiState,
  getHomeError,
  getHomeLastError,
  getHomeLastSyncAt,
  getHomeHydratedAt,
  getHomeCacheHit,
  isHomeLoading,
  isHomeLoaded,
  isHomeDegraded,
  isHomeRemoteOk,

  setHomeSummary,
  patchHomeSummary,
  clearHomeSummary,

  setHomeSource,
  setHomeRemoteOk,
  setHomeDegraded,

  setHomeMounted,
  setHomeActiveCard,
  setHomeLastAction,
  patchHomeUiState,

  setHomeLastSyncAt,
  setHomeHydratedAt,
  setHomeCacheHit,

  setHomeLoading,
  setHomeLoaded,
  setHomeError,
  clearHomeError,
  clearHomeLastError,

  startHomeLoad,
  finishHomeLoad,
  failHomeLoad,
  resetHomeState,
} from "./home.state.js";

/* =========================================================
   BASICS
========================================================= */

function safeText(
  value = "",
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeBoolean(
  value,
  fallback = false
) {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function normalizeHomeSource(
  value = HOME_SOURCES.IDLE
) {
  const source = safeText(
    value,
    HOME_SOURCES.IDLE
  );

  const allowed =
    Object.values(HOME_SOURCES);

  return allowed.includes(source)
    ? source
    : HOME_SOURCES.IDLE;
}

/* =========================================================
   SNAPSHOTS
========================================================= */

export function getHomeSnapshot() {
  return getHomeState();
}

export function getHomeSummarySnapshot() {
  return getHomeSummary();
}

export function getHomeUiSnapshot() {
  return getHomeUiState();
}

/* =========================================================
   STATUS
========================================================= */

export function getHomeStatus() {
  return {
    loading: isHomeLoading(),
    loaded: isHomeLoaded(),
    degraded: isHomeDegraded(),
    remoteOk: isHomeRemoteOk(),
    source: getHomeSource(),
    error: getHomeError(),
    lastError: getHomeLastError(),
    lastSyncAt: getHomeLastSyncAt(),
    hydratedAt: getHomeHydratedAt(),
    cacheHit: getHomeCacheHit(),
  };
}

export function getHomeSourceStatus() {
  return {
    source: getHomeSource(),
    remoteOk: isHomeRemoteOk(),
    degraded: isHomeDegraded(),
    cacheHit: getHomeCacheHit(),
  };
}

export function hasHomeError() {
  return Boolean(getHomeError());
}

export function hasHomeLastError() {
  return Boolean(
    getHomeLastError()
  );
}

export function isHomeReady() {
  return (
    isHomeLoaded() === true &&
    isHomeLoading() !== true &&
    !getHomeError()
  );
}

export function isHomeIdleSource() {
  return (
    getHomeSource() ===
    HOME_SOURCES.IDLE
  );
}

export function isHomeRemoteSource() {
  return (
    getHomeSource() ===
    HOME_SOURCES.REMOTE
  );
}

export function isHomeFreshCacheSource() {
  return (
    getHomeSource() ===
    HOME_SOURCES.CACHE_FRESH
  );
}

export function isHomeStaleCacheSource() {
  return (
    getHomeSource() ===
    HOME_SOURCES.CACHE_STALE
  );
}

export function isHomeFallbackSource() {
  return (
    getHomeSource() ===
    HOME_SOURCES.FALLBACK_LOCAL
  );
}

export function isHomeErrorSource() {
  return (
    getHomeSource() ===
    HOME_SOURCES.ERROR
  );
}

/* =========================================================
   SUMMARY
========================================================= */

export function readHomeSummary() {
  return getHomeSummary();
}

export function readHomeKpis() {
  return getHomeKpis();
}

export function readHomeAlerts() {
  return getHomeAlerts();
}

export function readHomeRecentActivity() {
  return getHomeRecentActivity();
}

export function readHomeQuickActions() {
  return getHomeQuickActions();
}

export function readHomeHealth() {
  return getHomeHealth();
}

export function writeHomeSummary(
  summary = {}
) {
  return setHomeSummary(summary);
}

export function mergeHomeSummary(
  patch = {}
) {
  return patchHomeSummary(
    safeObject(patch)
  );
}

export function clearHomeSummaryStore() {
  return clearHomeSummary();
}

/* =========================================================
   UI
========================================================= */

export function readHomeUi() {
  return getHomeUiState();
}

export function markHomeMounted(
  value = true
) {
  return setHomeMounted(
    value === true
  );
}

export function setHomeSelectedCard(
  card = ""
) {
  return setHomeActiveCard(
    safeText(card, "")
  );
}

export function setHomeAction(
  action = ""
) {
  return setHomeLastAction(
    safeText(action, "")
  );
}

export function patchHomeUi(
  patch = {}
) {
  return patchHomeUiState(
    safeObject(patch)
  );
}

/* =========================================================
   METADATA
========================================================= */

export function readHomeMetadata() {
  return {
    source: getHomeSource(),
    remoteOk: isHomeRemoteOk(),
    degraded: isHomeDegraded(),
    lastSyncAt: getHomeLastSyncAt(),
    hydratedAt: getHomeHydratedAt(),
    cacheHit: getHomeCacheHit(),
  };
}

export function setHomeSourceState(
  value = HOME_SOURCES.IDLE
) {
  return setHomeSource(
    normalizeHomeSource(value)
  );
}

export function setHomeRemoteOkState(
  value = false
) {
  return setHomeRemoteOk(
    value === true
  );
}

export function setHomeDegradedState(
  value = false
) {
  return setHomeDegraded(
    value === true
  );
}

export function setHomeSyncTimestamp(
  value = ""
) {
  return setHomeLastSyncAt(
    safeText(value, "")
  );
}

export function setHomeHydrationTimestamp(
  value = ""
) {
  return setHomeHydratedAt(
    safeText(value, "")
  );
}

export function markHomeCacheHit(
  value = true
) {
  return setHomeCacheHit(
    value === true
  );
}

/* =========================================================
   LOAD FLOW
========================================================= */

export function beginHomeLoad() {
  return startHomeLoad();
}

export function completeHomeLoad({
  summary = null,
  source = HOME_SOURCES.REMOTE,
  remoteOk = false,
  degraded = false,
  syncedAt = "",
  hydratedAt = "",
  cacheHit = false,
} = {}) {
  return finishHomeLoad({
    summary,
    source: normalizeHomeSource(
      source
    ),
    remoteOk:
      remoteOk === true,
    degraded:
      degraded === true,
    syncedAt: safeText(
      syncedAt,
      ""
    ),
    hydratedAt: safeText(
      hydratedAt,
      ""
    ),
    cacheHit:
      cacheHit === true,
  });
}

export function rejectHomeLoad(
  error = null
) {
  return failHomeLoad(error);
}

/* =========================================================
   LOW LEVEL FLAGS
========================================================= */

export function setHomeLoadingState(
  value = true
) {
  return setHomeLoading(
    value === true
  );
}

export function setHomeLoadedState(
  value = true
) {
  return setHomeLoaded(
    value === true
  );
}

export function setHomeErrorState(
  error = null
) {
  return setHomeError(error);
}

export function clearHomeErrorState() {
  return clearHomeError();
}

export function clearHomeLastErrorState() {
  return clearHomeLastError();
}

/* =========================================================
   RESET
========================================================= */

export function resetHomeStore() {
  return resetHomeState();
}

/* =========================================================
   EXPORT OBJECT
========================================================= */

export const HomeStore = {
  HOME_SOURCES,

  getHomeSnapshot,
  getHomeSummarySnapshot,
  getHomeUiSnapshot,

  getHomeStatus,
  getHomeSourceStatus,
  hasHomeError,
  hasHomeLastError,
  isHomeReady,
  isHomeIdleSource,
  isHomeRemoteSource,
  isHomeFreshCacheSource,
  isHomeStaleCacheSource,
  isHomeFallbackSource,
  isHomeErrorSource,

  readHomeSummary,
  readHomeKpis,
  readHomeAlerts,
  readHomeRecentActivity,
  readHomeQuickActions,
  readHomeHealth,
  writeHomeSummary,
  mergeHomeSummary,
  clearHomeSummaryStore,

  readHomeUi,
  markHomeMounted,
  setHomeSelectedCard,
  setHomeAction,
  patchHomeUi,

  readHomeMetadata,
  setHomeSourceState,
  setHomeRemoteOkState,
  setHomeDegradedState,
  setHomeSyncTimestamp,
  setHomeHydrationTimestamp,
  markHomeCacheHit,

  beginHomeLoad,
  completeHomeLoad,
  rejectHomeLoad,

  setHomeLoadingState,
  setHomeLoadedState,
  setHomeErrorState,
  clearHomeErrorState,
  clearHomeLastErrorState,

  resetHomeStore,
};

export default HomeStore;
