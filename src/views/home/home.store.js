/* =========================================================
   Onion SPA - Home Store
   Archivo: src/views/home/home.store.js

   Responsabilidades:
   - exponer acceso semántico al estado Home
   - desacoplar consumers del shape interno de home.state.js
   - ofrecer getters y setters de alto nivel
   - facilitar integración con actions / api / bindings
========================================================= */

import {
  getHomeState,
  getHomeSummary,
  getHomeUiState,
  getHomeError,
  getHomeLastSyncAt,
  getHomeHydratedAt,
  getHomeCacheHit,
  isHomeLoading,
  isHomeLoaded,

  setHomeSummary,
  patchHomeSummary,
  clearHomeSummary,

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

  startHomeLoad,
  finishHomeLoad,
  failHomeLoad,
  resetHomeState,
} from "./home.state.js";

/* =========================================================
   BASICS
========================================================= */

function safeText(value = "", fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
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
    error: getHomeError(),
    lastSyncAt: getHomeLastSyncAt(),
    hydratedAt: getHomeHydratedAt(),
    cacheHit: getHomeCacheHit(),
  };
}

export function hasHomeError() {
  return Boolean(getHomeError());
}

export function isHomeReady() {
  return (
    isHomeLoaded() === true &&
    isHomeLoading() !== true &&
    !getHomeError()
  );
}

/* =========================================================
   SUMMARY
========================================================= */

export function readHomeSummary() {
  return getHomeSummary();
}

export function writeHomeSummary(summary = {}) {
  return setHomeSummary(summary);
}

export function mergeHomeSummary(patch = {}) {
  return patchHomeSummary(patch);
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

export function markHomeMounted(value = true) {
  return setHomeMounted(value);
}

export function setHomeSelectedCard(card = "") {
  return setHomeActiveCard(
    safeText(card, "")
  );
}

export function setHomeAction(action = "") {
  return setHomeLastAction(
    safeText(action, "")
  );
}

export function patchHomeUi(patch = {}) {
  return patchHomeUiState(
    safeObject(patch)
  );
}

/* =========================================================
   METADATA
========================================================= */

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
  syncedAt = "",
  hydratedAt = "",
  cacheHit = false,
} = {}) {
  return finishHomeLoad({
    summary,
    syncedAt: safeText(
      syncedAt,
      ""
    ),
    hydratedAt: safeText(
      hydratedAt,
      ""
    ),
    cacheHit: cacheHit === true,
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
  getHomeSnapshot,
  getHomeSummarySnapshot,
  getHomeUiSnapshot,

  getHomeStatus,
  hasHomeError,
  isHomeReady,

  readHomeSummary,
  writeHomeSummary,
  mergeHomeSummary,
  clearHomeSummaryStore,

  readHomeUi,
  markHomeMounted,
  setHomeSelectedCard,
  setHomeAction,
  patchHomeUi,

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

  resetHomeStore,
};

export default HomeStore;
