/* =========================================================
   Onion SPA - Facturas State
   Archivo: src/views/facturas/facturas.state.js

   Responsabilidades:
   - centralizar el estado local del módulo de facturas
   - exponer factory de estado aislado por instancia
   - gestionar flags de loading / refresh / detalle
   - controlar referencias inflight del módulo
   - ofrecer helpers de lectura y escritura consistentes
========================================================= */

function asBoolean(value) {
  return Boolean(value);
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

export function createFacturasState() {
  return {
    view: {
      hydrated: false,
      loading: false,
      loaded: false,
      error: null,
      refreshing: false,
      bootstrapped: false,
      remoteCount: 0,
    },

    detail: {
      open: false,
      loading: false,
      data: null,
    },

    actions: {
      sendingFacturaId: "",
      downloadingFacturaId: "",
      viewingFacturaId: "",
    },

    inflight: {
      load: null,
      detail: null,
    },
  };
}

/* =========================================================
   RESET
========================================================= */

export function resetFacturasViewState(state) {
  if (!state) return state;

  state.view.hydrated = false;
  state.view.loading = false;
  state.view.loaded = false;
  state.view.error = null;
  state.view.refreshing = false;
  state.view.bootstrapped = false;
  state.view.remoteCount = 0;

  return state;
}

export function resetFacturasDetailState(state) {
  if (!state) return state;

  state.detail.open = false;
  state.detail.loading = false;
  state.detail.data = null;

  state.actions.sendingFacturaId = "";
  state.actions.downloadingFacturaId = "";
  state.actions.viewingFacturaId = "";

  state.inflight.detail = null;

  return state;
}

export function resetFacturasInflightState(state) {
  if (!state) return state;

  state.inflight.load = null;
  state.inflight.detail = null;

  return state;
}

export function resetFacturasState(state) {
  if (!state) return state;

  resetFacturasViewState(state);
  resetFacturasDetailState(state);
  resetFacturasInflightState(state);

  return state;
}

/* =========================================================
   GETTERS
========================================================= */

export function getFacturasViewState(state) {
  return state?.view || null;
}

export function getFacturasDetailState(state) {
  return state?.detail || null;
}

export function getFacturasActionsState(state) {
  return state?.actions || null;
}

export function getFacturasInflightState(state) {
  return state?.inflight || null;
}

export function isFacturasHydrated(state) {
  return Boolean(state?.view?.hydrated);
}

export function isFacturasLoading(state) {
  return Boolean(state?.view?.loading);
}

export function isFacturasLoaded(state) {
  return Boolean(state?.view?.loaded);
}

export function isFacturasRefreshing(state) {
  return Boolean(state?.view?.refreshing);
}

export function isFacturasBootstrapped(state) {
  return Boolean(state?.view?.bootstrapped);
}

export function getFacturasError(state) {
  return state?.view?.error || null;
}

export function getFacturasRemoteCount(state) {
  return asNumber(state?.view?.remoteCount, 0);
}

export function isFacturasDetailOpen(state) {
  return Boolean(state?.detail?.open);
}

export function isFacturasDetailLoading(state) {
  return Boolean(state?.detail?.loading);
}

export function getFacturasDetailData(state) {
  return state?.detail?.data || null;
}

export function getFacturasSendingFacturaId(state) {
  return asText(state?.actions?.sendingFacturaId, "");
}

export function getFacturasDownloadingFacturaId(state) {
  return asText(state?.actions?.downloadingFacturaId, "");
}

export function getFacturasViewingFacturaId(state) {
  return asText(state?.actions?.viewingFacturaId, "");
}

export function getFacturasInflightLoad(state) {
  return state?.inflight?.load || null;
}

export function getFacturasInflightDetail(state) {
  return state?.inflight?.detail || null;
}

/* =========================================================
   SETTERS VIEW
========================================================= */

export function setFacturasHydrated(state, value) {
  if (!state) return state;
  state.view.hydrated = asBoolean(value);
  return state;
}

export function setFacturasLoading(state, value) {
  if (!state) return state;
  state.view.loading = asBoolean(value);
  return state;
}

export function setFacturasLoaded(state, value) {
  if (!state) return state;
  state.view.loaded = asBoolean(value);
  return state;
}

export function setFacturasError(state, value = null) {
  if (!state) return state;
  state.view.error = value || null;
  return state;
}

export function clearFacturasError(state) {
  if (!state) return state;
  state.view.error = null;
  return state;
}

export function setFacturasRefreshing(state, value) {
  if (!state) return state;
  state.view.refreshing = asBoolean(value);
  return state;
}

export function setFacturasBootstrapped(state, value) {
  if (!state) return state;
  state.view.bootstrapped = asBoolean(value);
  return state;
}

export function setFacturasRemoteCount(state, value = 0) {
  if (!state) return state;
  state.view.remoteCount = asNumber(value, 0);
  return state;
}

/* =========================================================
   SETTERS DETAIL
========================================================= */

export function setFacturasDetailOpen(state, value) {
  if (!state) return state;
  state.detail.open = asBoolean(value);
  return state;
}

export function setFacturasDetailLoading(state, value) {
  if (!state) return state;
  state.detail.loading = asBoolean(value);
  return state;
}

export function setFacturasDetailData(state, value = null) {
  if (!state) return state;
  state.detail.data = value || null;
  return state;
}

export function openFacturasDetail(state, factura = null) {
  if (!state) return state;

  state.detail.open = true;
  state.detail.loading = false;
  state.detail.data = factura || null;

  return state;
}

export function closeFacturasDetail(state) {
  if (!state) return state;

  state.detail.open = false;
  state.detail.loading = false;
  state.detail.data = null;

  state.actions.sendingFacturaId = "";
  state.actions.downloadingFacturaId = "";
  state.actions.viewingFacturaId = "";

  return state;
}

/* =========================================================
   SETTERS ACTIONS
========================================================= */

export function setFacturasSendingFacturaId(state, value = "") {
  if (!state) return state;
  state.actions.sendingFacturaId = asText(value, "");
  return state;
}

export function setFacturasDownloadingFacturaId(state, value = "") {
  if (!state) return state;
  state.actions.downloadingFacturaId = asText(value, "");
  return state;
}

export function setFacturasViewingFacturaId(state, value = "") {
  if (!state) return state;
  state.actions.viewingFacturaId = asText(value, "");
  return state;
}

export function clearFacturasActionIds(state) {
  if (!state) return state;

  state.actions.sendingFacturaId = "";
  state.actions.downloadingFacturaId = "";
  state.actions.viewingFacturaId = "";

  return state;
}

/* =========================================================
   SETTERS INFLIGHT
========================================================= */

export function setFacturasInflightLoad(state, promise = null) {
  if (!state) return state;
  state.inflight.load = promise || null;
  return state;
}

export function setFacturasInflightDetail(state, promise = null) {
  if (!state) return state;
  state.inflight.detail = promise || null;
  return state;
}

/* =========================================================
   SNAPSHOT HELPERS
========================================================= */

export function getFacturasTemplateState(state) {
  if (!state) {
    return {
      loading: false,
      loaded: false,
      error: null,
      refreshing: false,
      bootstrapped: false,
      remoteCount: 0,
      detailOpen: false,
      detailLoading: false,
      detail: null,
      sendingFacturaId: "",
      downloadingFacturaId: "",
      viewingFacturaId: "",
    };
  }

  return {
    loading: Boolean(state.view.loading),
    loaded: Boolean(state.view.loaded),
    error: state.view.error || null,
    refreshing: Boolean(state.view.refreshing),
    bootstrapped: Boolean(state.view.bootstrapped),
    remoteCount: asNumber(state.view.remoteCount, 0),

    detailOpen: Boolean(state.detail.open),
    detailLoading: Boolean(state.detail.loading),
    detail: state.detail.data || null,

    sendingFacturaId: asText(state.actions.sendingFacturaId, ""),
    downloadingFacturaId: asText(state.actions.downloadingFacturaId, ""),
    viewingFacturaId: asText(state.actions.viewingFacturaId, ""),
  };
}
