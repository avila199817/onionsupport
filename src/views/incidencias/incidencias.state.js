/* =========================================================
   Onion SPA - Incidencias State
   Archivo: src/views/incidencias/incidencias.state.js

   Responsabilidades:
   - centralizar estado local de incidencias
   - flags de carga / refresh
   - errores
   - timestamps
   - request inflight
   - cache temporal de items
   - compatibilidad total con View / API / Actions
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
  };

let inflightLoad = null;

/* =========================================================
   SAFE
========================================================= */

function safeArray(value) {
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
   GETTERS / SETTERS
========================================================= */

export function getInflightLoad() {
  return inflightLoad;
}

export function setInflightLoad(
  value
) {
  inflightLoad =
    value || null;
}

export function resetIncidenciasState() {
  incidenciasState.hydrated = false;
  incidenciasState.loading = false;
  incidenciasState.refreshing = false;
  incidenciasState.loaded = false;
  incidenciasState.error = null;

  incidenciasState.items = [];
  incidenciasState.remoteCount = 0;

  incidenciasState.lastSyncAt = 0;

  inflightLoad = null;
}

/* =========================================================
   FLAGS
========================================================= */

export function setLoading(
  value
) {
  incidenciasState.loading =
    Boolean(value);
}

export function setRefreshing(
  value
) {
  incidenciasState.refreshing =
    Boolean(value);
}

export function setLoaded(
  value
) {
  incidenciasState.loaded =
    Boolean(value);
}

export function setHydrated(
  value
) {
  incidenciasState.hydrated =
    Boolean(value);
}

/* =========================================================
   DATA
========================================================= */

export function setItems(
  items = []
) {
  incidenciasState.items =
    safeArray(items);

  incidenciasState.loaded = true;

  return incidenciasState.items;
}

export function getItems() {
  return safeArray(
    incidenciasState.items
  );
}

export function clearItems() {
  incidenciasState.items = [];
  incidenciasState.remoteCount = 0;
}

export function setRemoteCount(
  value = 0
) {
  incidenciasState.remoteCount =
    safeNumber(
      value,
      0
    );
}

/* =========================================================
   META
========================================================= */

export function setError(
  value = null
) {
  incidenciasState.error =
    value || null;
}

export function setLastSyncAt(
  value = 0
) {
  incidenciasState.lastSyncAt =
    safeNumber(
      value,
      0
    );
}
