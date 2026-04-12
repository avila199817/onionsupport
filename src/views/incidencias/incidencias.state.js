/* =========================================================
   Onion SPA - Incidencias State
   Archivo: src/views/incidencias/incidencias.state.js

   Responsabilidades:
   - centralizar estado local de incidencias
   - flags de carga
   - errores
   - timestamps
   - request inflight
========================================================= */

export const CACHE_KEY = "incidencias.cache";

export const CACHE_TTL = 1000 * 60 * 3; // 3 min

export const incidenciasState = {
  hydrated: false,
  loading: false,
  loaded: false,
  error: null,
  lastSyncAt: 0,
};

let inflightLoad = null;

/* =========================================================
   GETTERS / SETTERS
========================================================= */

export function getInflightLoad() {
  return inflightLoad;
}

export function setInflightLoad(value) {
  inflightLoad = value;
}

export function resetIncidenciasState() {
  incidenciasState.hydrated = false;
  incidenciasState.loading = false;
  incidenciasState.loaded = false;
  incidenciasState.error = null;
  incidenciasState.lastSyncAt = 0;

  inflightLoad = null;
}

/* =========================================================
   HELPERS
========================================================= */

export function setLoading(value) {
  incidenciasState.loading = Boolean(value);
}

export function setLoaded(value) {
  incidenciasState.loaded = Boolean(value);
}

export function setHydrated(value) {
  incidenciasState.hydrated = Boolean(value);
}

export function setError(value = null) {
  incidenciasState.error = value || null;
}

export function setLastSyncAt(value = 0) {
  incidenciasState.lastSyncAt = Number(value) || 0;
}
