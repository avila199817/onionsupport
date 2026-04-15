/* =========================================================
   Onion SPA - Incidencias API
   Archivo: src/views/incidencias/incidencias.api.js
   EXTREME MODE FIXED
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

import { safeNumber } from "./incidencias.utils.js";

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

function buildStorageKey() {
  return `${AppCore.config?.storagePrefix || "onion"}:${CACHE_KEY}`;
}

function saveCache(payload) {
  try {
    const storage = getStorageApi();

    if (storage?.set) {
      storage.set(CACHE_KEY, payload);
      return;
    }

    localStorage.setItem(
      buildStorageKey(),
      JSON.stringify(payload)
    );
  } catch {}
}

function readCache() {
  try {
    const storage = getStorageApi();

    if (storage?.get) {
      return storage.get(CACHE_KEY);
    }

    const raw = localStorage.getItem(buildStorageKey());

    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function isFreshCache(cache) {
  return (
    cache?.timestamp &&
    Date.now() - safeNumber(cache.timestamp, 0) < CACHE_TTL
  );
}

/* =========================================================
   RESPONSE
========================================================= */

function fallbackExtractItems(response) {
  const candidates = [
    response,
    response?.items,
    response?.data,
    response?.data?.items,
    response?.data?.data,
    response?.data?.data?.items,
    response?.rows,
    response?.resources,
    response?.result,
  ];

  for (const item of candidates) {
    if (Array.isArray(item)) {
      return item;
    }
  }

  return [];
}

function resolveItems(response) {
  try {
    const items = extractItems(response);

    if (Array.isArray(items)) {
      return items;
    }
  } catch {}

  return fallbackExtractItems(response);
}

/* =========================================================
   CACHE
========================================================= */

export function hydrateFromCache() {
  const cache = readCache();

  if (!Array.isArray(cache?.items)) {
    return false;
  }

  /* YA ESTÁN NORMALIZADOS */
  setIncidencias(cache.items);

  setLastSyncAt(cache.timestamp || Date.now());
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

  if (!incidenciasState.loaded && cache?.items?.length) {
    hydrateFromCache();
  }

  if (isFreshCache(cache) && !force) {
    return Promise.resolve(getIncidencias());
  }

  setLoading(true);
  setError(null);

  const request = (async () => {
    try {
      AppCore?.utils?.log?.("[Incidencias] GET", ENDPOINT);

      const response = await Http.get(ENDPOINT);

      AppCore?.utils?.log?.("[Incidencias] RAW:", response);

      const rawItems = resolveItems(response);

      const items = Array.isArray(rawItems)
        ? rawItems.map(normalizeIncidencia)
        : [];

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

      AppCore?.utils?.log?.(
        "[Incidencias] loaded:",
        items.length
      );

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
