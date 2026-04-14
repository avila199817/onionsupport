/* =========================================================
   Onion SPA - Incidencias API
   Archivo: src/views/incidencias/incidencias.api.js

   Responsabilidades:
   - cargar incidencias desde backend
   - estrategia cache-first inteligente
   - hidratar store
   - persistir cache local
   - controlar inflight requests
   - tolerar respuestas heterogéneas
   - debug extremo de carga
   - fallback robusto cuando backend cambia payload
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

function buildStorageKey() {
  return `${
    AppCore.config?.storagePrefix ||
    "onion"
  }:${CACHE_KEY}`;
}

function saveCache(payload) {
  try {
    const storage =
      getStorageApi();

    if (
      storage &&
      typeof storage.set ===
        "function"
    ) {
      storage.set(
        CACHE_KEY,
        payload
      );
      return;
    }

    localStorage.setItem(
      buildStorageKey(),
      JSON.stringify(payload)
    );
  } catch (error) {
    AppCore?.utils?.warn?.(
      "[Incidencias] saveCache error:",
      error
    );
  }
}

function readCache() {
  try {
    const storage =
      getStorageApi();

    if (
      storage &&
      typeof storage.get ===
        "function"
    ) {
      return storage.get(
        CACHE_KEY
      );
    }

    const raw =
      localStorage.getItem(
        buildStorageKey()
      );

    return raw
      ? JSON.parse(raw)
      : null;
  } catch {
    return null;
  }
}

function isFreshCache(cache) {
  if (!cache?.timestamp) {
    return false;
  }

  return (
    Date.now() -
      safeNumber(
        cache.timestamp,
        0
      ) <
    CACHE_TTL
  );
}

/* =========================================================
   RESPONSE HELPERS
========================================================= */

function fallbackExtractItems(
  response
) {
  if (!response) {
    return [];
  }

  if (
    Array.isArray(response)
  ) {
    return response;
  }

  if (
    Array.isArray(
      response.items
    )
  ) {
    return response.items;
  }

  if (
    Array.isArray(
      response.data
    )
  ) {
    return response.data;
  }

  if (
    Array.isArray(
      response.resources
    )
  ) {
    return response.resources;
  }

  if (
    Array.isArray(
      response.rows
    )
  ) {
    return response.rows;
  }

  if (
    Array.isArray(
      response.data?.items
    )
  ) {
    return response.data.items;
  }

  if (
    Array.isArray(
      response.data?.rows
    )
  ) {
    return response.data.rows;
  }

  if (
    Array.isArray(
      response.result
    )
  ) {
    return response.result;
  }

  return [];
}

function resolveItems(
  response
) {
  try {
    const items =
      extractItems(
        response
      );

    if (
      Array.isArray(items)
    ) {
      return items;
    }
  } catch {}

  return fallbackExtractItems(
    response
  );
}

/* =========================================================
   CACHE HYDRATION
========================================================= */

export function hydrateFromCache() {
  const cache =
    readCache();

  if (
    !cache ||
    !Array.isArray(
      cache.items
    )
  ) {
    return false;
  }

  const items =
    cache.items.map(
      normalizeIncidencia
    );

  setIncidencias(items);
  setLastSyncAt(
    cache.timestamp
  );
  setLoaded(true);

  return true;
}

/* =========================================================
   LOAD
========================================================= */

export async function loadIncidencias({
  force = false,
} = {}) {
  const inflight =
    getInflightLoad();

  if (
    inflight &&
    !force
  ) {
    return inflight;
  }

  const cache =
    readCache();

  if (
    !incidenciasState.loaded &&
    cache?.items?.length
  ) {
    hydrateFromCache();
  }

  if (
    isFreshCache(
      cache
    ) &&
    !force
  ) {
    return Promise.resolve(
      getIncidencias()
    );
  }

  setLoading(true);
  setError(null);

  const request =
    (async () => {
      try {
        AppCore?.utils?.log?.(
          "[Incidencias] GET",
          ENDPOINT
        );

        const response =
          await Http.get(
            ENDPOINT
          );

        AppCore?.utils?.log?.(
          "[Incidencias] response:",
          response
        );

        const rawItems =
          resolveItems(
            response
          );

        const items =
          rawItems.map(
            normalizeIncidencia
          );

        setIncidencias(
          items
        );

        const now =
          Date.now();

        setLastSyncAt(
          now
        );
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
        AppCore?.utils?.error?.(
          "[Incidencias] load error:",
          error
        );

        setLoading(false);
        setLoaded(true);

        setError(
          error?.data
            ?.message ||
            error?.message ||
            "No se pudieron cargar las incidencias."
        );

        throw error;
      } finally {
        setInflightLoad(
          null
        );
      }
    })();

  setInflightLoad(
    request
  );

  return request;
}
