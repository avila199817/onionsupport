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
   - compatible con API normalizada { items, total } / { item }
========================================================= */

import {
  normalizeFactura,
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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
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

function getFacturaIdentity(item = null) {
  return safeText(
    item?.id ||
      item?._id ||
      item?.facturaId ||
      item?.numero,
    ""
  );
}

function normalizeCollectionResponse(response = null) {
  const obj = safeObject(response);

  const rawItems = safeArray(
    obj?.items ||
      obj?.data?.items ||
      obj?.result?.items ||
      obj?.payload?.items ||
      []
  );

  const items = rawItems.map((item) =>
    normalizeFactura(item)
  );

  const total = safeNumber(
    obj?.total ??
      obj?.data?.total ??
      obj?.result?.total ??
      obj?.payload?.total,
    items.length
  );

  return {
    items,
    total,
    raw: response,
  };
}

function normalizeDetailResponse(response = null) {
  const obj = safeObject(response);

  const payload =
    obj?.item ||
    obj?.data?.item ||
    obj?.result?.item ||
    obj?.payload?.item ||
    obj?.factura ||
    obj?.data?.factura ||
    obj?.result?.factura ||
    obj?.payload?.factura ||
    null;

  return payload
    ? normalizeFactura(payload)
    : null;
}

/* =========================================================
   COLLECTION
========================================================= */

export async function loadFacturasCollection({
  state,
  render,
  silent = false,
  force = false,
  query = {},
} = {}) {
  if (!state) {
    throw new Error("FACTURAS_STATE_REQUIRED");
  }

  const inflight = getFacturasInflightLoad(state);

  if (inflight) {
    return inflight;
  }

  const shouldRefresh =
    Boolean(silent || isFacturasLoaded(state) || force);

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
      const response = await fetchFacturasRequest(
        {
          ...safeObject(query),
        }
      );

      const { items, total } =
        normalizeCollectionResponse(response);

      setFacturasStore(items);
      setFacturasRemoteCount(state, total);
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
        safeErrorMessage(
          error,
          "No se pudieron cargar las facturas."
        )
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
      const factura = normalizeDetailResponse(response);

      if (!factura) {
        throw new Error("FACTURA_DETAIL_EMPTY");
      }

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
