/* =========================================================
   Onion SPA - Incidencias State
   Archivo: src/views/incidencias/incidencias.state.js

   Responsabilidades:
   - estado local centralizado
   - loading / refresh
   - errores
   - cache temporal
   - request inflight
   - compatibilidad View/API/Actions

   FIX CRÍTICO:
   - setters robustos
   - no loading infinito
   - cache helpers
   - snapshot debug
========================================================= */

export const CACHE_KEY =
  "incidencias.cache";

export const CACHE_TTL =
  1000 * 60 * 3; // 3 min

export const incidenciasState =
  {
    hydrated: false,
    loading: false,
    refreshing: false,
    loaded: false,

    error: null,

    items: [],
    remoteCount: 0,

    lastSyncAt: 0,

    requestId: 0,
  };

let inflightLoad =
  null;

/* =========================================================
   SAFE
========================================================= */

function safeArray(
  value
) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeNumber(
  value,
  fallback = 0
) {
  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

/* =========================================================
   INTERNAL
========================================================= */

function touchRequestId() {
  incidenciasState.requestId += 1;

  return incidenciasState.requestId;
}

/* =========================================================
   INFLOW
========================================================= */

export function getInflightLoad() {
  return inflightLoad;
}

export function setInflightLoad(
  value
) {
  inflightLoad =
    value || null;

  return inflightLoad;
}

export function clearInflightLoad() {
  inflightLoad =
    null;
}

/* =========================================================
   RESET
========================================================= */

export function resetIncidenciasState() {
  incidenciasState.hydrated =
    false;

  incidenciasState.loading =
    false;

  incidenciasState.refreshing =
    false;

  incidenciasState.loaded =
    false;

  incidenciasState.error =
    null;

  incidenciasState.items =
    [];

  incidenciasState.remoteCount =
    0;

  incidenciasState.lastSyncAt =
    0;

  incidenciasState.requestId =
    0;

  inflightLoad =
    null;

  return incidenciasState;
}

/* =========================================================
   FLAGS
========================================================= */

export function setLoading(
  value
) {
  incidenciasState.loading =
    Boolean(value);

  if (
    incidenciasState.loading
  ) {
    touchRequestId();
  }

  return incidenciasState.loading;
}

export function setRefreshing(
  value
) {
  incidenciasState.refreshing =
    Boolean(value);

  return incidenciasState.refreshing;
}

export function setLoaded(
  value
) {
  incidenciasState.loaded =
    Boolean(value);

  return incidenciasState.loaded;
}

export function setHydrated(
  value
) {
  incidenciasState.hydrated =
    Boolean(value);

  return incidenciasState.hydrated;
}

/* =========================================================
   DATA
========================================================= */

export function setItems(
  items = []
) {
  const list =
    safeArray(items);

  incidenciasState.items =
    list;

  incidenciasState.loaded =
    true;

  incidenciasState.error =
    null;

  incidenciasState.remoteCount =
    Math.max(
      incidenciasState.remoteCount,
      list.length
    );

  return list;
}

export function getItems() {
  return safeArray(
    incidenciasState.items
  );
}

export function clearItems() {
  incidenciasState.items =
    [];

  incidenciasState.remoteCount =
    0;

  return [];
}

export function setRemoteCount(
  value = 0
) {
  incidenciasState.remoteCount =
    safeNumber(
      value,
      0
    );

  return incidenciasState.remoteCount;
}

/* =========================================================
   META
========================================================= */

export function setError(
  value = null
) {
  incidenciasState.error =
    value || null;

  return incidenciasState.error;
}

export function clearError() {
  incidenciasState.error =
    null;
}

export function setLastSyncAt(
  value = 0
) {
  incidenciasState.lastSyncAt =
    safeNumber(
      value,
      0
    );

  return incidenciasState.lastSyncAt;
}

/* =========================================================
   CACHE HELPERS
========================================================= */

export function getCachePayload() {
  return {
    savedAt:
      Date.now(),
    items:
      getItems(),
    remoteCount:
      incidenciasState.remoteCount,
    lastSyncAt:
      incidenciasState.lastSyncAt,
  };
}

export function isCacheFresh(
  savedAt = 0
) {
  const ts =
    safeNumber(
      savedAt,
      0
    );

  if (!ts) {
    return false;
  }

  return (
    Date.now() - ts <
    CACHE_TTL
  );
}

/* =========================================================
   DEBUG
========================================================= */

export function getIncidenciasStateSnapshot() {
  return {
    hydrated:
      incidenciasState.hydrated,
    loading:
      incidenciasState.loading,
    refreshing:
      incidenciasState.refreshing,
    loaded:
      incidenciasState.loaded,
    error:
      incidenciasState.error,
    total:
      incidenciasState.items
        .length,
    remoteCount:
      incidenciasState.remoteCount,
    lastSyncAt:
      incidenciasState.lastSyncAt,
    requestId:
      incidenciasState.requestId,
    hasInflight:
      Boolean(
        inflightLoad
      ),
  };
}

export default {
  CACHE_KEY,
  CACHE_TTL,
  incidenciasState,

  getInflightLoad,
  setInflightLoad,
  clearInflightLoad,

  resetIncidenciasState,

  setLoading,
  setRefreshing,
  setLoaded,
  setHydrated,

  setItems,
  getItems,
  clearItems,
  setRemoteCount,

  setError,
  clearError,
  setLastSyncAt,

  getCachePayload,
  isCacheFresh,
  getIncidenciasStateSnapshot,
};
