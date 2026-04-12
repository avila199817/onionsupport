/* =========================================================
   Onion SPA - Incidencias API
   Archivo: src/views/incidencias/incidencias.api.js

   Responsabilidades:
   - cargar incidencias desde backend
   - estrategia cache-first
   - hidratar store
   - persistir cache local
   - controlar inflight requests
========================================================= */

import { AppCore } from "../../core/index.js";
import { Http } from "../../services/index.js";

import {
  CACHE_KEY,
  CACHE_TTL,
  incidenciasState,
  getInflightLoad,
  setInflightLoad,
  setLoading,
  setLoaded,
  setError,
  setLastSyncAt,
} from "./incidencias.state.js";

import {
  safeNumber,
} from "./incidencias.utils.js";

import {
  extractItems,
  normalizeIncidencia,
} from "./incidencias.model.js";

import {
  getIncidencias,
  setIncidencias,
} from "./incidencias.store.js";

const ENDPOINT = "/api/tickets";

/* =========================================================
   STORAGE
========================================================= */

function getStorageApi() {
  return AppCore?.storage || null;
}

function saveCache(payload) {
  try {
    const storage = getStorageApi();

    if (storage?.set) {
      storage.set(CACHE_KEY, payload);
      return;
    }

    localStorage.setItem(
      `${AppCore.config?.storagePrefix || "onion"}:${CACHE_KEY}`,
      JSON.stringify(payload)
    );
  } catch {
    /* noop */
  }
}

function readCache() {
  try {
    const storage = getStorageApi();

    if (storage?.get) {
      return storage.get(CACHE_KEY);
    }

    const raw = localStorage.getItem(
      `${AppCore.config?.storagePrefix || "onion"}:${CACHE_KEY}`
    );

    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function isFreshCache(cache) {
  if (!cache?.timestamp) return false;

  return (
    Date.now() - safeNumber(cache.timestamp, 0)
    < CACHE_TTL
  );
}

/* =========================================================
   CACHE HYDRATION
========================================================= */

export function hydrateFromCache() {
  const cache = readCache();

  if (!cache || !Array.isArray(cache.items)) {
    return false;
  }

  const items = cache.items.map(normalizeIncidencia);

  setIncidencias(items);
  setLastSyncAt(cache.timestamp);
  setLoaded(true);

  return true;
}

/* =========================================================
   LOAD
========================================================= */

export async function loadIncidencias({
  force = false,
} = {}) {
  const inflight = getInflightLoad();

  if (inflight && !force) {
    return inflight;
  }

  const cache = readCache();

  if (
    !incidenciasState.loaded &&
    cache?.items?.length
  ) {
    hydrateFromCache();
  }

  if (isFreshCache(cache) && !force) {
    return Promise.resolve(
      getIncidencias()
    );
  }

  setLoading(true);
  setError(null);

  const request = (async () => {
    try {
      const response = await Http.get(
        ENDPOINT
      );

      const items = extractItems(response)
        .map(normalizeIncidencia);

      setIncidencias(items);

      const now = Date.now();

      setLastSyncAt(now);
      setLoaded(true);
      setLoading(false);
      setError(null);

      saveCache({
        timestamp: now,
        items,
      });

      return items;
    } catch (error) {
      setLoading(false);
      setLoaded(true);

      setError(
        error?.data?.message ||
        error?.message ||
        "No se pudieron cargar las incidencias."
      );

      throw error;
    } finally {
      setInflightLoad(null);
    }
  })();

  setInflightLoad(request);

  return request;
}
