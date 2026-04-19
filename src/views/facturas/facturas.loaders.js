/* =========================================================
   Onion SPA - Facturas Loaders
   Archivo: src/views/facturas/facturas.loaders.js

   FINAL PRO SYSTEM · LOADERS REAL · 10/10

   RESPONSABILIDADES:
   - cargar colección de facturas desde backend
   - cargar detalle individual de factura
   - sincronizar Store y estado local del módulo
   - controlar flags de loading / refresh / error / inflight
   - mantener paridad de flujo con incidenciasView
   - evitar estados colgados en render / inflight

   HARDENING PRO:
   - anti-race básico por inflight
   - loading inicial vs refreshing posterior
   - lastSyncAt coherente
   - remoteCount robusto
   - detalle con apertura previa segura
   - error de detalle no rompe el estado principal
   - no ensucia error global con fallos de detalle
========================================================= */

import {
  extractFacturas,
  normalizeFactura,
  getRemoteCount,
} from "./facturas.model.js";

import {
  fetchFacturasRequest,
  fetchFacturaDetailRequest,
} from "./facturas.api.js";

import { setFacturasStore } from "./facturas.store.js";
import { safeText } from "./facturas.utils.js";

import {
  getFacturasInflightLoad,
  getFacturasInflightDetail,
  getFacturasDetailData,
  isFacturasLoaded,

  setFacturasLoading,
  setFacturasLoaded,
  setFacturasError,
  clearFacturasError,
  setFacturasRefreshing,
  setFacturasRemoteCount,
  setFacturasLastSyncAt,

  setFacturasDetailOpen,
  setFacturasDetailLoading,
  setFacturasDetailData,

  setFacturasInflightLoad,
  setFacturasInflightDetail,
} from "./facturas.state.js";

/* =========================================================
   HELPERS
========================================================= */

function safeRender(render) {
  try {
    render?.();
  } catch {}
}

function safeErrorMessage(error = null, fallback = "") {
  return safeText(
    error?.data?.message ||
      error?.response?.data?.message ||
      error?.response?.message ||
      error?.message,
    fallback
  );
}

function resolveDetailPayload(response = null) {
  if (!response || typeof response !== "object") {
    return response;
  }

  if (response.factura && typeof response.factura === "object") {
    return response.factura;
  }

  if (response.item && typeof response.item === "object") {
    return response.item;
  }

  if (response.result && typeof response.result === "object") {
    return resolveDetailPayload(response.result);
  }

  if (response.payload && typeof response.payload === "object") {
    return resolveDetailPayload(response.payload);
  }

  if (response.data && typeof response.data === "object") {
    return resolveDetailPayload(response.data);
  }

  return response;
}

function getFacturaIdentity(item = null) {
  return safeText(
    item?.id ||
      item?._id ||
      item?.facturaId ||
      item?.numero,
    ""
  );
}

/* =========================================================
   COLLECTION
========================================================= */

export async function loadFacturasCollection({
  state,
  render,
  silent = false,
  force = false,
} = {}) {
  if (!state) {
    throw new Error("FACTURAS_STATE_REQUIRED");
  }

  const inflight = getFacturasInflightLoad(state);
  if (inflight) {
    return inflight;
  }

  const shouldRefresh = Boolean(silent || isFacturasLoaded(state) || force);

  clearFacturasError(state);

  if (shouldRefresh) {
    setFacturasRefreshing(state, true);
    setFacturasLoading(state, false);
  } else {
    setFacturasLoading(state, true);
    setFacturasRefreshing(state, false);
  }

  safeRender(render);

  const promise = (async () => {
    try {
      const response = await fetchFacturasRequest();

      const items = extractFacturas(response).map((item) =>
        normalizeFactura(item)
      );

      setFacturasStore(items);

      setFacturasRemoteCount(
        state,
        getRemoteCount(response, items.length)
      );

      setFacturasLoading(state, false);
      setFacturasRefreshing(state, false);
      setFacturasLoaded(state, true);
      setFacturasLastSyncAt(state, new Date().toISOString());
      clearFacturasError(state);

      safeRender(render);

      return items;
    } catch (error) {
      setFacturasLoading(state, false);
      setFacturasRefreshing(state, false);
      setFacturasLoaded(state, true);

      setFacturasError(
        state,
        safeErrorMessage(error, "No se pudieron cargar las facturas.")
      );

      safeRender(render);
      throw error;
    } finally {
      setFacturasInflightLoad(state, null);
    }
  })();

  setFacturasInflightLoad(state, promise);
  return promise;
}

/* =========================================================
   DETAIL
========================================================= */

export async function loadFacturaDetailById({
  state,
  render,
  facturaId = "",
  force = true,
} = {}) {
  if (!state) {
    throw new Error("FACTURAS_STATE_REQUIRED");
  }

  const id = safeText(facturaId, "");
  if (!id) {
    return null;
  }

  const currentDetail = getFacturasDetailData(state);
  const currentDetailId = getFacturaIdentity(currentDetail);

  if (!force && currentDetail && currentDetailId === id) {
    setFacturasDetailOpen(state, true);
    setFacturasDetailLoading(state, false);
    safeRender(render);
    return currentDetail;
  }

  const inflight = getFacturasInflightDetail(state);
  if (inflight) {
    return inflight;
  }

  setFacturasDetailOpen(state, true);
  setFacturasDetailLoading(state, true);

  safeRender(render);

  const promise = (async () => {
    try {
      const response = await fetchFacturaDetailRequest(id);
      const payload = resolveDetailPayload(response);
      const factura = normalizeFactura(payload);

      setFacturasDetailData(state, factura);
      setFacturasDetailOpen(state, true);
      setFacturasDetailLoading(state, false);

      safeRender(render);

      return factura;
    } catch (error) {
      setFacturasDetailLoading(state, false);

      if (!getFacturasDetailData(state)) {
        setFacturasDetailOpen(state, false);
      }

      safeRender(render);
      throw error;
    } finally {
      setFacturasInflightDetail(state, null);
    }
  })();

  setFacturasInflightDetail(state, promise);
  return promise;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  loadFacturasCollection,
  loadFacturaDetailById,
};
