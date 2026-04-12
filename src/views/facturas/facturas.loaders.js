/* =========================================================
   Onion SPA - Facturas Loaders
   Archivo: src/views/facturas/facturas.loaders.js

   Responsabilidades:
   - cargar colección de facturas desde backend
   - cargar detalle individual de factura
   - sincronizar Store y estado local del módulo
   - controlar flags de loading / refresh / error / inflight
   - apoyarse en helpers centralizados de state
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
  setFacturasLoading,
  setFacturasLoaded,
  setFacturasError,
  clearFacturasError,
  setFacturasRefreshing,
  setFacturasRemoteCount,
  setFacturasDetailOpen,
  setFacturasDetailLoading,
  setFacturasDetailData,
  setFacturasInflightLoad,
  setFacturasInflightDetail,
} from "./facturas.state.js";

export async function loadFacturasCollection({
  state,
  render,
  silent = false,
} = {}) {
  if (!state) {
    throw new Error("FACTURAS_STATE_REQUIRED");
  }

  const inflight = getFacturasInflightLoad(state);
  if (inflight) {
    return inflight;
  }

  if (!silent) {
    setFacturasLoading(state, true);
    clearFacturasError(state);
    render?.();
  } else {
    setFacturasRefreshing(state, true);
    render?.();
  }

  const promise = (async () => {
    try {
      const response = await fetchFacturasRequest();
      const items = extractFacturas(response).map(normalizeFactura);

      setFacturasStore(items);
      setFacturasRemoteCount(state, getRemoteCount(response, items.length));
      setFacturasLoading(state, false);
      setFacturasRefreshing(state, false);
      setFacturasLoaded(state, true);
      clearFacturasError(state);

      render?.();
      return items;
    } catch (error) {
      setFacturasLoading(state, false);
      setFacturasRefreshing(state, false);
      setFacturasLoaded(state, true);

      setFacturasError(
        state,
        error?.data?.message ||
          error?.message ||
          "No se pudieron cargar las facturas."
      );

      render?.();
      throw error;
    } finally {
      setFacturasInflightLoad(state, null);
    }
  })();

  setFacturasInflightLoad(state, promise);
  return getFacturasInflightLoad(state);
}

export async function loadFacturaDetailById({
  state,
  render,
  facturaId = "",
} = {}) {
  if (!state) {
    throw new Error("FACTURAS_STATE_REQUIRED");
  }

  const id = safeText(facturaId, "");
  if (!id) return null;

  const inflight = getFacturasInflightDetail(state);
  if (inflight) {
    return inflight;
  }

  setFacturasDetailOpen(state, true);
  setFacturasDetailLoading(state, true);
  render?.();

  const promise = (async () => {
    try {
      const response = await fetchFacturaDetailRequest(id);

      const factura = normalizeFactura(
        response?.factura && typeof response.factura === "object"
          ? response.factura
          : response
      );

      setFacturasDetailData(state, factura);
      setFacturasDetailLoading(state, false);

      render?.();
      return factura;
    } catch (error) {
      setFacturasDetailLoading(state, false);
      render?.();
      throw error;
    } finally {
      setFacturasInflightDetail(state, null);
    }
  })();

  setFacturasInflightDetail(state, promise);
  return getFacturasInflightDetail(state);
}
