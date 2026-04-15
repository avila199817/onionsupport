/* =========================================================
   Onion SPA - Incidencias API
   Archivo: src/views/incidencias/incidencias.api.js

   Responsabilidades:
   - centralizar las llamadas HTTP del módulo de incidencias
   - exponer operaciones de listado y detalle
   - soportar refresh forzado
   - aislar la vista del acceso directo al apiClient
   - mantener endpoints y timeouts en un único punto
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  incidenciasState,
  setLoading,
  setRefreshing,
  setError,
  setItems,
  setRemoteCount,
  setLastSyncAt,
} from "./incidencias.state.js";

import {
  replaceIncidenciasStore,
} from "./incidencias.store.js";

/* =========================================================
   CONFIG
========================================================= */

const INCIDENCIAS_ENDPOINT =
  "/api/tickets";

const INCIDENCIAS_TIMEOUT =
  15000;

/* =========================================================
   CORE HELPERS
========================================================= */

function getApiClient() {
  const client =
    AppCore?.apiClient;

  if (!client) {
    throw new Error(
      "INCIDENCIAS_API_CLIENT_UNAVAILABLE"
    );
  }

  return client;
}

function getTicketEndpoint(
  id = ""
) {
  const ticketId = String(
    id ?? ""
  ).trim();

  if (!ticketId) {
    throw new Error(
      "INCIDENCIA_ID_REQUIRED"
    );
  }

  return `${INCIDENCIAS_ENDPOINT}/${encodeURIComponent(
    ticketId
  )}`;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function pickItems(
  payload = null
) {
  if (
    Array.isArray(payload)
  ) {
    return payload;
  }

  if (
    Array.isArray(
      payload?.items
    )
  ) {
    return payload.items;
  }

  if (
    Array.isArray(
      payload?.data
    )
  ) {
    return payload.data;
  }

  if (
    Array.isArray(
      payload?.results
    )
  ) {
    return payload.results;
  }

  if (
    Array.isArray(
      payload?.rows
    )
  ) {
    return payload.rows;
  }

  return [];
}

function pickTotal(
  payload = null,
  fallback = 0
) {
  const candidates = [
    payload?.total,
    payload?.count,
    payload?.remoteCount,
    payload?.pagination
      ?.total,
    fallback,
  ];

  for (const value of candidates) {
    const num =
      Number(value);

    if (
      Number.isFinite(
        num
      )
    ) {
      return num;
    }
  }

  return fallback;
}

/* =========================================================
   RAW REQUESTS
========================================================= */

export async function fetchIncidenciasRequest() {
  return getApiClient().get(
    INCIDENCIAS_ENDPOINT,
    {
      timeout:
        INCIDENCIAS_TIMEOUT,
      auth: true,
    }
  );
}

export async function getIncidenciaByIdRequest(
  id
) {
  return getApiClient().get(
    getTicketEndpoint(
      id
    ),
    {
      timeout:
        INCIDENCIAS_TIMEOUT,
      auth: true,
    }
  );
}

/* =========================================================
   CACHE HYDRATE
========================================================= */

export function hydrateFromCache() {
  try {
    const current =
      safeArray(
        incidenciasState?.items
      );

    if (
      current.length
    ) {
      replaceIncidenciasStore(
        current
      );
    }

    return current;
  } catch {
    return [];
  }
}

/* =========================================================
   HIGH LEVEL LOAD
========================================================= */

export async function loadIncidencias({
  force = false,
} = {}) {
  const firstLoad =
    !incidenciasState?.hydrated;

  try {
    setError("");

    if (
      firstLoad &&
      !force
    ) {
      setLoading(
        true
      );
    } else {
      setRefreshing(
        true
      );
    }

    const response =
      await fetchIncidenciasRequest();

    const items =
      pickItems(
        response
      );

    const list =
      safeArray(
        items
      );

    replaceIncidenciasStore(
      list
    );

    setItems(list);

    setRemoteCount(
      pickTotal(
        response,
        list.length
      )
    );

    setLastSyncAt(
      Date.now()
    );

    return list;
  } catch (error) {
    console.error(
      "❌ INCIDENCIAS LOAD:",
      error
    );

    setError(
      error?.message ||
        "No se pudieron cargar las incidencias."
    );

    throw error;
  } finally {
    setLoading(
      false
    );
    setRefreshing(
      false
    );
  }
}
