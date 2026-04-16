/* =========================================================
   Onion SPA - Incidencias API
   Archivo: src/views/incidencias/incidencias.api.js

   Responsabilidades:
   - centralizar llamadas HTTP
   - listado + detalle
   - refresh forzado
   - hidratar store/state
   - normalizar payloads backend heterogéneos

   FIX CRÍTICO:
   - get detalle devuelve objeto limpio
   - soporta {ok,data,ticket,item}
   - soporta arrays / envelopes
   - anti-race soft
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
  setLoaded,
} from "./incidencias.state.js";

import {
  replaceIncidenciasStore,
  upsertIncidenciaStore,
} from "./incidencias.store.js";

/* =========================================================
   CONFIG
========================================================= */

const INCIDENCIAS_ENDPOINT =
  "/api/tickets";

const INCIDENCIAS_TIMEOUT =
  15000;

/* =========================================================
   HELPERS
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

function safeArray(
  value
) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeObject(
  value
) {
  return value &&
    typeof value ===
      "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function getTicketEndpoint(
  id = ""
) {
  const ticketId =
    String(id ?? "")
      .trim();

  if (!ticketId) {
    throw new Error(
      "INCIDENCIA_ID_REQUIRED"
    );
  }

  return `${INCIDENCIAS_ENDPOINT}/${encodeURIComponent(
    ticketId
  )}`;
}

/* =========================================================
   LIST PICKERS
========================================================= */

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
      payload?.tickets
    )
  ) {
    return payload.tickets;
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

  if (
    Array.isArray(
      payload?.data?.items
    )
  ) {
    return payload.data
      .items;
  }

  if (
    Array.isArray(
      payload?.data?.tickets
    )
  ) {
    return payload.data
      .tickets;
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
    const n =
      Number(value);

    if (
      Number.isFinite(n)
    ) {
      return n;
    }
  }

  return fallback;
}

/* =========================================================
   DETAIL PICKER
========================================================= */

function pickDetail(
  payload = null
) {
  if (!payload) {
    return null;
  }

  if (
    Array.isArray(payload)
  ) {
    return payload[0] || null;
  }

  if (
    payload?.ticket
  ) {
    return payload.ticket;
  }

  if (
    payload?.item
  ) {
    return payload.item;
  }

  if (
    payload?.data &&
    !Array.isArray(
      payload.data
    )
  ) {
    if (
      payload.data.ticket
    ) {
      return payload.data
        .ticket;
    }

    return payload.data;
  }

  return safeObject(
    payload
  );
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
  const response =
    await getApiClient().get(
      getTicketEndpoint(id),
      {
        timeout:
          INCIDENCIAS_TIMEOUT,
        auth: true,
      }
    );

  return pickDetail(
    response
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
   LOAD LIST
========================================================= */

export async function loadIncidencias({
  force = false,
} = {}) {
  const firstLoad =
    !incidenciasState
      ?.hydrated;

  try {
    setError(null);

    if (
      firstLoad &&
      !force
    ) {
      setLoading(true);
    } else {
      setRefreshing(
        true
      );
    }

    const response =
      await fetchIncidenciasRequest();

    const list =
      safeArray(
        pickItems(
          response
        )
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

    setLoaded(true);

    return list;
  } catch (error) {
    console.error(
      "❌ INCIDENCIAS LOAD:",
      error
    );

    setError(
      error?.data
        ?.message ||
        error?.message ||
        "No se pudieron cargar las incidencias."
    );

    setLoaded(true);

    throw error;
  } finally {
    setLoading(false);
    setRefreshing(
      false
    );
  }
}

/* =========================================================
   LOAD DETAIL
========================================================= */

export async function loadIncidenciaDetail(
  ticketId
) {
  try {
    const detail =
      await getIncidenciaByIdRequest(
        ticketId
      );

    if (
      detail
    ) {
      upsertIncidenciaStore?.(
        detail
      );
    }

    return detail;
  } catch (error) {
    console.error(
      "❌ INCIDENCIA DETAIL:",
      error
    );

    throw error;
  }
}

export default {
  fetchIncidenciasRequest,
  getIncidenciaByIdRequest,
  hydrateFromCache,
  loadIncidencias,
  loadIncidenciaDetail,
};
