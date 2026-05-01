/* =========================================================
   Onion SPA - Facturas State
   Archivo: src/views/facturas/facturas.state.js

   FINAL PRO SYSTEM · STATE REAL · 10/10
   PATCH · INFLIGHT TOKEN SAFE · LOADER COMPAT · PAGE SIZE 5

   RESPONSABILIDADES:
   - centralizar el estado local del módulo de facturas
   - exponer factory de estado aislado por instancia
   - gestionar flags de loading / refresh / detalle
   - controlar referencias inflight del módulo
   - ofrecer helpers de lectura y escritura consistentes
   - mantener paridad operativa con incidenciasView
   - preservar tokens anti-race usados por facturas.loaders.js
   - evitar que ensureInflightState borre collectionToken/detailToken
   - mantener paginación visual coherente a 5 registros

   HARDENING PRO:
   - setters defensivos
   - helpers de snapshot estables
   - close/open de detalle coherente
   - clear de ids de acción robusto
   - soporte para lastSyncAt / page / pageSize
   - no mezcla shape flat con shape anidado
   - inflight shape compatible con loaders modernos
========================================================= */

export const DEFAULT_PAGE_SIZE = 5;

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

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    return value;
  }

  return null;
}

function getFacturaIdentity(factura = null) {
  const source = asObject(factura, {});
  const raw = asObject(source.raw, {});

  return asText(
    first(
      source.id,
      source._id,
      source.facturaId,
      source.invoiceId,
      source.numero,
      source.numeroFacturaLegal,
      source.numeroFacturaSistema,
      source.invoiceNumber,

      raw.id,
      raw._id,
      raw.facturaId,
      raw.invoiceId,
      raw.numero,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema,
      raw.invoiceNumber
    ),
    ""
  );
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

      /*
        CRÍTICO:
        facturas.loaders.js usa estos campos para anti-race.
        No deben desaparecer al normalizar el estado.
      */
      collectionToken: 0,
      detailToken: 0,
      detailFacturaId: "",
    },
  };
}

/* =========================================================
   INTERNAL NORMALIZERS
========================================================= */

function ensureViewState(state) {
  if (!state) return null;

  const current = asObject(state.view, {});

  state.view = {
    hydrated: asBoolean(current.hydrated, false),
    loading: asBoolean(current.loading, false),
    loaded: asBoolean(current.loaded, false),
    error: current.error ? String(current.error).trim() : null,
    refreshing: asBoolean(current.refreshing, false),
    bootstrapped: asBoolean(current.bootstrapped, false),
    remoteCount: Math.max(0, asNumber(current.remoteCount, 0)),
    lastSyncAt: asText(current.lastSyncAt, ""),
    page: Math.max(1, asNumber(current.page, 1)),
    pageSize: Math.max(
      1,
      asNumber(current.pageSize, DEFAULT_PAGE_SIZE)
    ),
  };

  return state.view;
}

function ensureDetailState(state) {
  if (!state) return null;

  const current = asObject(state.detail, {});

  state.detail = {
    open: asBoolean(current.open, false),
    loading: asBoolean(current.loading, false),
    data: current.data || null,
  };

  return state.detail;
}

function ensureActionsState(state) {
  if (!state) return null;

  const current = asObject(state.actions, {});

  state.actions = {
    sendingFacturaId: asText(current.sendingFacturaId, ""),
    downloadingFacturaId: asText(current.downloadingFacturaId, ""),
    viewingFacturaId: asText(current.viewingFacturaId, ""),
    openingFacturaId: asText(current.openingFacturaId, ""),
    selectedFacturaId: asText(current.selectedFacturaId, ""),
  };

  return state.actions;
}

function ensureInflightState(state) {
  if (!state) return null;

  const current = asObject(state.inflight, {});

  state.inflight = {
    load: current.load || null,
    detail: current.detail || null,

    /*
      CRÍTICO:
      Estos tokens los escribe/lee facturas.loaders.js:
      - collectionToken
      - detailToken
      - detailFacturaId

      Si aquí se borran, el loader recibe la respuesta del backend,
      pero la descarta como obsoleta.
    */
    collectionToken: Math.max(0, asNumber(current.collectionToken, 0)),
    detailToken: Math.max(0, asNumber(current.detailToken, 0)),
    detailFacturaId: asText(current.detailFacturaId, ""),
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
  state.inflight.detailToken = 0;
  state.inflight.detailFacturaId = "";

  return state;
}

export function resetFacturasInflightState(state) {
  if (!state) return state;

  ensureFacturasStateShape(state);

  state.inflight.load = null;
  state.inflight.detail = null;
  state.inflight.collectionToken = 0;
  state.inflight.detailToken = 0;
  state.inflight.detailFacturaId = "";

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

export function getFacturasCollectionToken(state) {
  return Math.max(
    0,
    asNumber(ensureInflightState(state)?.collectionToken, 0)
  );
}

export function getFacturasDetailToken(state) {
  return Math.max(
    0,
    asNumber(ensureInflightState(state)?.detailToken, 0)
  );
}

export function getFacturasDetailFacturaId(state) {
  return asText(ensureInflightState(state)?.detailFacturaId, "");
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
  state.view.pageSize = Math.max(
    1,
    asNumber(value, DEFAULT_PAGE_SIZE)
  );

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

  const facturaId = getFacturaIdentity(value);

  if (facturaId) {
    ensureActionsState(state);
    state.actions.selectedFacturaId = facturaId;
  }

  return state;
}

export function openFacturasDetail(state, factura = null) {
  if (!state) return state;

  ensureFacturasStateShape(state);

  state.detail.open = true;
  state.detail.loading = false;
  state.detail.data = factura || null;

  const facturaId = getFacturaIdentity(factura);
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

  state.inflight.detail = null;
  state.inflight.detailToken = 0;
  state.inflight.detailFacturaId = "";

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

export function setFacturasCollectionToken(state, value = 0) {
  if (!state) return state;

  ensureInflightState(state);
  state.inflight.collectionToken = Math.max(0, asNumber(value, 0));

  return state;
}

export function setFacturasDetailToken(state, value = 0) {
  if (!state) return state;

  ensureInflightState(state);
  state.inflight.detailToken = Math.max(0, asNumber(value, 0));

  return state;
}

export function setFacturasDetailFacturaId(state, value = "") {
  if (!state) return state;

  ensureInflightState(state);
  state.inflight.detailFacturaId = asText(value, "");

  return state;
}

export function clearFacturasCollectionInflight(state) {
  if (!state) return state;

  ensureInflightState(state);

  state.inflight.load = null;
  state.inflight.collectionToken = 0;

  return state;
}

export function clearFacturasDetailInflight(state) {
  if (!state) return state;

  ensureInflightState(state);

  state.inflight.detail = null;
  state.inflight.detailToken = 0;
  state.inflight.detailFacturaId = "";

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

export function patchFacturasInflightState(state, patch = {}) {
  if (!state) return state;

  ensureInflightState(state);

  state.inflight = {
    ...state.inflight,
    ...asObject(patch),
  };

  ensureInflightState(state);

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
  ensureFacturasStateShape(state);

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
      selectedFacturaId: getFacturasSelectedFacturaId(state),
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
      collectionToken: getFacturasCollectionToken(state),
      detailToken: getFacturasDetailToken(state),
      detailFacturaId: getFacturasDetailFacturaId(state),
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
  getFacturasCollectionToken,
  getFacturasDetailToken,
  getFacturasDetailFacturaId,

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
  setFacturasCollectionToken,
  setFacturasDetailToken,
  setFacturasDetailFacturaId,
  clearFacturasCollectionInflight,
  clearFacturasDetailInflight,

  patchFacturasViewState,
  patchFacturasDetailState,
  patchFacturasActionsState,
  patchFacturasInflightState,

  getFacturasTemplateState,
  getFacturasStateSnapshot,
};
