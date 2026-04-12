/* =========================================================
   Onion SPA - Facturas State
   Archivo: src/views/facturas/facturas.state.js

   Responsabilidades:
   - centralizar el estado local del módulo de facturas
   - exponer factory de estado aislado por instancia
   - gestionar flags de loading / refresh / detalle
   - controlar referencias inflight del módulo
========================================================= */

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

export function setFacturasHydrated(state, value) {
  if (!state) return state;
  state.view.hydrated = Boolean(value);
  return state;
}

export function setFacturasLoading(state, value) {
  if (!state) return state;
  state.view.loading = Boolean(value);
  return state;
}

export function setFacturasLoaded(state, value) {
  if (!state) return state;
  state.view.loaded = Boolean(value);
  return state;
}

export function setFacturasError(state, value = null) {
  if (!state) return state;
  state.view.error = value || null;
  return state;
}

export function setFacturasRefreshing(state, value) {
  if (!state) return state;
  state.view.refreshing = Boolean(value);
  return state;
}

export function setFacturasBootstrapped(state, value) {
  if (!state) return state;
  state.view.bootstrapped = Boolean(value);
  return state;
}

export function setFacturasRemoteCount(state, value = 0) {
  if (!state) return state;
  state.view.remoteCount = Number.isFinite(Number(value)) ? Number(value) : 0;
  return state;
}

export function setFacturasDetailOpen(state, value) {
  if (!state) return state;
  state.detail.open = Boolean(value);
  return state;
}

export function setFacturasDetailLoading(state, value) {
  if (!state) return state;
  state.detail.loading = Boolean(value);
  return state;
}

export function setFacturasDetailData(state, value = null) {
  if (!state) return state;
  state.detail.data = value || null;
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

export function setFacturasSendingFacturaId(state, value = "") {
  if (!state) return state;
  state.actions.sendingFacturaId = String(value ?? "").trim();
  return state;
}

export function setFacturasDownloadingFacturaId(state, value = "") {
  if (!state) return state;
  state.actions.downloadingFacturaId = String(value ?? "").trim();
  return state;
}

export function setFacturasViewingFacturaId(state, value = "") {
  if (!state) return state;
  state.actions.viewingFacturaId = String(value ?? "").trim();
  return state;
}

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
