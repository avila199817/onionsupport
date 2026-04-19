/* =========================================================
   Onion SPA - Facturas State
   Archivo: src/views/facturas/facturas.state.js

   FINAL PRO SYSTEM · STATE REAL · 10/10

   RESPONSABILIDADES:
   - centralizar el estado local del módulo de facturas
   - exponer factory de estado aislado por instancia
   - gestionar flags de loading / refresh / detalle
   - controlar referencias inflight del módulo
   - ofrecer helpers de lectura y escritura consistentes
   - mantener paridad operativa con incidenciasView

   HARDENING PRO:
   - setters defensivos
   - helpers de snapshot estables
   - close/open de detalle coherente
   - clear de ids de acción robusto
   - soporte para lastSyncAt / page / pageSize
   - no mezcla shape flat con shape anidado
========================================================= */

export const DEFAULT_PAGE_SIZE = 6;

/* =========================================================
   SAFE
========================================================= */

function asBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function asObject(value, fallback = {}) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : fallback;
}

/* =========================================================
   FACTORY
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
      lastSyncAt: "",
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
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
      openingFacturaId: "",
      selectedFacturaId: "",
    },

    inflight: {
      load: null,
      detail: null,
    },
  };
}

/* =========================================================
   INTERNAL NORMALIZERS
========================================================= */

function ensureViewState(state) {
  if (!state) return null;

  state.view = {
    hydrated: asBoolean(state?.view?.hydrated, false),
    loading: asBoolean(state?.view?.loading, false),
    loaded: asBoolean(state?.view?.loaded, false),
    error: state?.view?.error ? String(state.view.error).trim() : null,
    refreshing: asBoolean(state?.view?.refreshing, false),
    bootstrapped: asBoolean(state?.view?.bootstrapped, false),
    remoteCount: Math.max(0, asNumber(state?.view?.remoteCount, 0)),
    lastSyncAt: asText(state?.view?.lastSyncAt, ""),
    page: Math.max(1, asNumber(state?.view?.page, 1)),
    pageSize: Math.max(1, asNumber(state?.view?.pageSize, DEFAULT_PAGE_SIZE)),
  };

  return state.view;
}

function ensureDetailState(state) {
  if (!state) return null;

  state.detail = {
    open: asBoolean(state?.detail?.open, false),
    loading: asBoolean(state?.detail?.loading, false),
    data: state?.detail?.data || null,
  };

  return state.detail;
}

function ensureActionsState(state) {
  if (!state) return null;

  state.actions = {
    sendingFacturaId: asText(state?.actions?.sendingFacturaId, ""),
    downloadingFacturaId: asText(state?.actions?.downloadingFacturaId, ""),
    viewingFacturaId: asText(state?.actions?.viewingFacturaId, ""),
    openingFacturaId: asText(state?.actions?.openingFacturaId, ""),
    selectedFacturaId: asText(state?.actions?.selectedFacturaId, ""),
  };

  return state.actions;
}

function ensureInflightState(state) {
  if (!state) return null;

  state.inflight = {
    load: state?.inflight?.load || null,
    detail: state?.inflight?.detail || null,
  };

  return state.inflight;
}

function ensureFacturasStateShape(state) {
  if (!state) return null;

  ensureViewState(state);
  ensureDetailState(state);
  ensureActionsState(state);
  ensureInflightState(state);

  return state;
}

/* =========================================================
   RESET
========================================================= */

export function resetFacturasViewState(state) {
  if (!state) return state;

  ensureFacturasStateShape(state);

  state.view.hydrated = false;
  state.view.loading = false;
  state.view.loaded = false;
  state.view.error = null;
  state.view.refreshing = false;
  state.view.bootstrapped = false;
  state.view.remoteCount = 0;
  state.view.lastSyncAt = "";
  state.view.page = 1;
  state.view.pageSize = DEFAULT_PAGE_SIZE;

  return state;
}

export function resetFacturasDetailState(state) {
  if (!state) return state;

  ensureFacturasStateShape(state);

  state.detail.open = false;
  state.detail.loading = false;
  state.detail.data = null;

  state.actions.sendingFacturaId = "";
  state.actions.downloadingFacturaId = "";
  state.actions.viewingFacturaId = "";
  state.actions.openingFacturaId = "";
  state.actions.selectedFacturaId = "";

  state.inflight.detail = null;

  return state;
}

export function resetFacturasInflightState(state) {
  if (!state) return state;

  ensureFacturasStateShape(state);

  state.inflight.load = null;
  state.inflight.detail = null;

  return state;
}

export function resetFacturasState(state) {
  if (!state) return state;

  ensureFacturasStateShape(state);

  resetFacturasViewState(state);
  resetFacturasDetailState(state);
  resetFacturasInflightState(state);

  return state;
}

/* =========================================================
   GETTERS
========================================================= */

export function getFacturasViewState(state) {
  if (!state) return null;
  return ensureViewState(state);
}

export function getFacturasDetailState(state) {
  if (!state) return null;
  return ensureDetailState(state);
}

export function getFacturasActionsState(state) {
  if (!state) return null;
  return ensureActionsState(state);
}

export function getFacturasInflightState(state) {
  if (!state) return null;
  return ensureInflightState(state);
}

export function isFacturasHydrated(state) {
  return Boolean(ensureViewState(state)?.hydrated);
}

export function isFacturasLoading(state) {
  return Boolean(ensureViewState(state)?.loading);
}

export function isFacturasLoaded(state) {
  return Boolean(ensureViewState(state)?.loaded);
}

export function isFacturasRefreshing(state) {
  return Boolean(ensureViewState(state)?.refreshing);
}

export function isFacturasBootstrapped(state) {
  return Boolean(ensureViewState(state)?.bootstrapped);
}

export function getFacturasError(state) {
  return ensureViewState(state)?.error || null;
}

export function getFacturasRemoteCount(state) {
  return Math.max(0, asNumber(ensureViewState(state)?.remoteCount, 0));
}

export function getFacturasLastSyncAt(state) {
  return asText(ensureViewState(state)?.lastSyncAt, "");
}

export function getFacturasPage(state) {
  return Math.max(1, asNumber(ensureViewState(state)?.page, 1));
}

export function getFacturasPageSize(state) {
  return Math.max(
    1,
    asNumber(ensureViewState(state)?.pageSize, DEFAULT_PAGE_SIZE)
  );
}

export function isFacturasDetailOpen(state) {
  return Boolean(ensureDetailState(state)?.open);
}

export function isFacturasDetailLoading(state) {
  return Boolean(ensureDetailState(state)?.loading);
}

export function getFacturasDetailData(state) {
  return ensureDetailState(state)?.data || null;
}

export function getFacturasSendingFacturaId(state) {
  return asText(ensureActionsState(state)?.sendingFacturaId, "");
}

export function getFacturasDownloadingFacturaId(state) {
  return asText(ensureActionsState(state)?.downloadingFacturaId, "");
}

export function getFacturasViewingFacturaId(state) {
  return asText(ensureActionsState(state)?.viewingFacturaId, "");
}

export function getFacturasOpeningFacturaId(state) {
  return asText(ensureActionsState(state)?.openingFacturaId, "");
}

export function getFacturasSelectedFacturaId(state) {
  return asText(ensureActionsState(state)?.selectedFacturaId, "");
}

export function getFacturasInflightLoad(state) {
  return ensureInflightState(state)?.load || null;
}

export function getFacturasInflightDetail(state) {
  return ensureInflightState(state)?.detail || null;
}

/* =========================================================
   SETTERS VIEW
========================================================= */

export function setFacturasHydrated(state, value) {
  if (!state) return state;
  ensureViewState(state);
  state.view.hydrated = asBoolean(value, false);
  return state;
}

export function setFacturasLoading(state, value) {
  if (!state) return state;
  ensureViewState(state);
  state.view.loading = asBoolean(value, false);
  return state;
}

export function setFacturasLoaded(state, value) {
  if (!state) return state;
  ensureViewState(state);
  state.view.loaded = asBoolean(value, false);
  return state;
}

export function setFacturasError(state, value = null) {
  if (!state) return state;
  ensureViewState(state);
  state.view.error = value ? String(value).trim() : null;
  return state;
}

export function clearFacturasError(state) {
  if (!state) return state;
  ensureViewState(state);
  state.view.error = null;
  return state;
}

export function setFacturasRefreshing(state, value) {
  if (!state) return state;
  ensureViewState(state);
  state.view.refreshing = asBoolean(value, false);
  return state;
}

export function setFacturasBootstrapped(state, value) {
  if (!state) return state;
  ensureViewState(state);
  state.view.bootstrapped = asBoolean(value, false);
  return state;
}

export function setFacturasRemoteCount(state, value = 0) {
  if (!state) return state;
  ensureViewState(state);
  state.view.remoteCount = Math.max(0, asNumber(value, 0));
  return state;
}

export function setFacturasLastSyncAt(state, value = "") {
  if (!state) return state;
  ensureViewState(state);
  state.view.lastSyncAt = asText(value, "");
  return state;
}

export function setFacturasPage(state, value = 1) {
  if (!state) return state;
  ensureViewState(state);
  state.view.page = Math.max(1, asNumber(value, 1));
  return state;
}

export function setFacturasPageSize(state, value = DEFAULT_PAGE_SIZE) {
  if (!state) return state;
  ensureViewState(state);
  state.view.pageSize = Math.max(1, asNumber(value, DEFAULT_PAGE_SIZE));
  return state;
}

/* =========================================================
   SETTERS DETAIL
========================================================= */

export function setFacturasDetailOpen(state, value) {
  if (!state) return state;
  ensureDetailState(state);
  state.detail.open = asBoolean(value, false);
  return state;
}

export function setFacturasDetailLoading(state, value) {
  if (!state) return state;
  ensureDetailState(state);
  state.detail.loading = asBoolean(value, false);
  return state;
}

export function setFacturasDetailData(state, value = null) {
  if (!state) return state;
  ensureDetailState(state);
  state.detail.data = value || null;
  return state;
}

export function openFacturasDetail(state, factura = null) {
  if (!state) return state;

  ensureFacturasStateShape(state);

  state.detail.open = true;
  state.detail.loading = false;
  state.detail.data = factura || null;

  const facturaId =
    factura?.id ||
    factura?._id ||
    factura?.facturaId ||
    "";

  state.actions.selectedFacturaId = asText(facturaId, "");

  return state;
}

export function closeFacturasDetail(state) {
  if (!state) return state;

  ensureFacturasStateShape(state);

  state.detail.open = false;
  state.detail.loading = false;
  state.detail.data = null;

  clearFacturasActionIds(state);

  return state;
}

/* =========================================================
   SETTERS ACTIONS
========================================================= */

export function setFacturasSendingFacturaId(state, value = "") {
  if (!state) return state;
  ensureActionsState(state);
  state.actions.sendingFacturaId = asText(value, "");
  return state;
}

export function setFacturasDownloadingFacturaId(state, value = "") {
  if (!state) return state;
  ensureActionsState(state);
  state.actions.downloadingFacturaId = asText(value, "");
  return state;
}

export function setFacturasViewingFacturaId(state, value = "") {
  if (!state) return state;
  ensureActionsState(state);
  state.actions.viewingFacturaId = asText(value, "");
  return state;
}

export function setFacturasOpeningFacturaId(state, value = "") {
  if (!state) return state;
  ensureActionsState(state);
  state.actions.openingFacturaId = asText(value, "");
  return state;
}

export function setFacturasSelectedFacturaId(state, value = "") {
  if (!state) return state;
  ensureActionsState(state);
  state.actions.selectedFacturaId = asText(value, "");
  return state;
}

export function clearFacturasActionIds(state) {
  if (!state) return state;

  ensureActionsState(state);

  state.actions.sendingFacturaId = "";
  state.actions.downloadingFacturaId = "";
  state.actions.viewingFacturaId = "";
  state.actions.openingFacturaId = "";
  state.actions.selectedFacturaId = "";

  return state;
}

/* =========================================================
   SETTERS INFLIGHT
========================================================= */

export function setFacturasInflightLoad(state, promise = null) {
  if (!state) return state;
  ensureInflightState(state);
  state.inflight.load = promise || null;
  return state;
}

export function setFacturasInflightDetail(state, promise = null) {
  if (!state) return state;
  ensureInflightState(state);
  state.inflight.detail = promise || null;
  return state;
}

/* =========================================================
   PATCHERS
========================================================= */

export function patchFacturasViewState(state, patch = {}) {
  if (!state) return state;

  ensureViewState(state);

  state.view = {
    ...state.view,
    ...asObject(patch),
  };

  ensureViewState(state);

  return state;
}

export function patchFacturasDetailState(state, patch = {}) {
  if (!state) return state;

  ensureDetailState(state);

  state.detail = {
    ...state.detail,
    ...asObject(patch),
  };

  ensureDetailState(state);

  return state;
}

export function patchFacturasActionsState(state, patch = {}) {
  if (!state) return state;

  ensureActionsState(state);

  state.actions = {
    ...state.actions,
    ...asObject(patch),
  };

  ensureActionsState(state);

  return state;
}

/* =========================================================
   SNAPSHOT HELPERS
========================================================= */

export function getFacturasTemplateState(state) {
  if (!state) {
    return {
      hydrated: false,
      loading: false,
      loaded: false,
      error: null,
      refreshing: false,
      bootstrapped: false,
      remoteCount: 0,
      lastSyncAt: "",
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      detailOpen: false,
      detailLoading: false,
      detail: null,
      sendingFacturaId: "",
      downloadingFacturaId: "",
      viewingFacturaId: "",
      openingFacturaId: "",
      selectedFacturaId: "",
    };
  }

  ensureFacturasStateShape(state);

  return {
    hydrated: Boolean(state.view.hydrated),
    loading: Boolean(state.view.loading),
    loaded: Boolean(state.view.loaded),
    error: state.view.error || null,
    refreshing: Boolean(state.view.refreshing),
    bootstrapped: Boolean(state.view.bootstrapped),
    remoteCount: Math.max(0, asNumber(state.view.remoteCount, 0)),
    lastSyncAt: asText(state.view.lastSyncAt, ""),
    page: Math.max(1, asNumber(state.view.page, 1)),
    pageSize: Math.max(1, asNumber(state.view.pageSize, DEFAULT_PAGE_SIZE)),

    detailOpen: Boolean(state.detail.open),
    detailLoading: Boolean(state.detail.loading),
    detail: state.detail.data || null,

    sendingFacturaId: asText(state.actions.sendingFacturaId, ""),
    downloadingFacturaId: asText(state.actions.downloadingFacturaId, ""),
    viewingFacturaId: asText(state.actions.viewingFacturaId, ""),
    openingFacturaId: asText(state.actions.openingFacturaId, ""),
    selectedFacturaId: asText(state.actions.selectedFacturaId, ""),
  };
}

export function getFacturasStateSnapshot(state) {
  return {
    view: {
      hydrated: isFacturasHydrated(state),
      loading: isFacturasLoading(state),
      loaded: isFacturasLoaded(state),
      refreshing: isFacturasRefreshing(state),
      bootstrapped: isFacturasBootstrapped(state),
      error: getFacturasError(state),
      remoteCount: getFacturasRemoteCount(state),
      lastSyncAt: getFacturasLastSyncAt(state),
      page: getFacturasPage(state),
      pageSize: getFacturasPageSize(state),
    },

    detail: {
      open: isFacturasDetailOpen(state),
      loading: isFacturasDetailLoading(state),
      hasData: Boolean(getFacturasDetailData(state)),
    },

    actions: {
      selectedFacturaId: getFacturasSelectedFacturaId(state),
      openingFacturaId: getFacturasOpeningFacturaId(state),
      sendingFacturaId: getFacturasSendingFacturaId(state),
      downloadingFacturaId: getFacturasDownloadingFacturaId(state),
      viewingFacturaId: getFacturasViewingFacturaId(state),
    },

    inflight: {
      hasLoad: Boolean(getFacturasInflightLoad(state)),
      hasDetail: Boolean(getFacturasInflightDetail(state)),
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  DEFAULT_PAGE_SIZE,

  createFacturasState,

  resetFacturasViewState,
  resetFacturasDetailState,
  resetFacturasInflightState,
  resetFacturasState,

  getFacturasViewState,
  getFacturasDetailState,
  getFacturasActionsState,
  getFacturasInflightState,

  isFacturasHydrated,
  isFacturasLoading,
  isFacturasLoaded,
  isFacturasRefreshing,
  isFacturasBootstrapped,

  getFacturasError,
  getFacturasRemoteCount,
  getFacturasLastSyncAt,
  getFacturasPage,
  getFacturasPageSize,

  isFacturasDetailOpen,
  isFacturasDetailLoading,
  getFacturasDetailData,

  getFacturasSendingFacturaId,
  getFacturasDownloadingFacturaId,
  getFacturasViewingFacturaId,
  getFacturasOpeningFacturaId,
  getFacturasSelectedFacturaId,

  getFacturasInflightLoad,
  getFacturasInflightDetail,

  setFacturasHydrated,
  setFacturasLoading,
  setFacturasLoaded,
  setFacturasError,
  clearFacturasError,
  setFacturasRefreshing,
  setFacturasBootstrapped,
  setFacturasRemoteCount,
  setFacturasLastSyncAt,
  setFacturasPage,
  setFacturasPageSize,

  setFacturasDetailOpen,
  setFacturasDetailLoading,
  setFacturasDetailData,
  openFacturasDetail,
  closeFacturasDetail,

  setFacturasSendingFacturaId,
  setFacturasDownloadingFacturaId,
  setFacturasViewingFacturaId,
  setFacturasOpeningFacturaId,
  setFacturasSelectedFacturaId,
  clearFacturasActionIds,

  setFacturasInflightLoad,
  setFacturasInflightDetail,

  patchFacturasViewState,
  patchFacturasDetailState,
  patchFacturasActionsState,

  getFacturasTemplateState,
  getFacturasStateSnapshot,
};
