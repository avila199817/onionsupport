/* =========================================================
   Onion SPA - Facturas State
   Archivo: src/views/facturas/facturas.state.js

   FINAL PRO SYSTEM · FACTURAS STATE · 10/10
   PATCH · INFLIGHT TOKEN SAFE · PAGE SIZE 5 · NO FLAT SHAPE
   PATCH · LOADERS COMPAT · DETAIL SAFE · ACTION IDS SAFE

   RESPONSABILIDADES:
   - centralizar el estado local del módulo de facturas
   - exponer factory de estado aislado por instancia
   - gestionar loading / refreshing / error / loaded / hydrated
   - gestionar modal de detalle
   - gestionar ids de acciones en curso
   - gestionar inflight real para colección y detalle
   - preservar tokens anti-race usados por facturas.loaders.js
   - mantener paginación visual a 5 registros
   - entregar snapshots estables al template
========================================================= */

export const DEFAULT_PAGE_SIZE = 5;

/* =========================================================
   DEFAULT SHAPES
========================================================= */

const DEFAULT_VIEW_STATE = Object.freeze({
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
});

const DEFAULT_DETAIL_STATE = Object.freeze({
  open: false,
  loading: false,
  data: null,
});

const DEFAULT_ACTIONS_STATE = Object.freeze({
  sendingFacturaId: "",
  downloadingFacturaId: "",
  viewingFacturaId: "",
  openingFacturaId: "",
  selectedFacturaId: "",
});

const DEFAULT_INFLIGHT_STATE = Object.freeze({
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
});

/* =========================================================
   SAFE HELPERS
========================================================= */

function asBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asPositiveNumber(value, fallback = 0) {
  return Math.max(0, asNumber(value, fallback));
}

function asPositiveInteger(value, fallback = 1) {
  return Math.max(1, Math.trunc(asNumber(value, fallback)));
}

function asText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function asNullableText(value) {
  const text = asText(value, "");
  return text || null;
}

function asObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
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
      source.code,

      raw.id,
      raw._id,
      raw.facturaId,
      raw.invoiceId,
      raw.numero,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema,
      raw.invoiceNumber,
      raw.code
    ),
    ""
  );
}

/* =========================================================
   CLONE HELPERS
========================================================= */

function createViewState(patch = {}) {
  const current = asObject(patch, {});

  return {
    hydrated: asBoolean(current.hydrated, DEFAULT_VIEW_STATE.hydrated),
    loading: asBoolean(current.loading, DEFAULT_VIEW_STATE.loading),
    loaded: asBoolean(current.loaded, DEFAULT_VIEW_STATE.loaded),
    error: asNullableText(current.error),
    refreshing: asBoolean(current.refreshing, DEFAULT_VIEW_STATE.refreshing),
    bootstrapped: asBoolean(current.bootstrapped, DEFAULT_VIEW_STATE.bootstrapped),
    remoteCount: asPositiveNumber(current.remoteCount, DEFAULT_VIEW_STATE.remoteCount),
    lastSyncAt: asText(current.lastSyncAt, DEFAULT_VIEW_STATE.lastSyncAt),
    page: asPositiveInteger(current.page, DEFAULT_VIEW_STATE.page),
    pageSize: asPositiveInteger(current.pageSize, DEFAULT_VIEW_STATE.pageSize),
  };
}

function createDetailState(patch = {}) {
  const current = asObject(patch, {});

  return {
    open: asBoolean(current.open, DEFAULT_DETAIL_STATE.open),
    loading: asBoolean(current.loading, DEFAULT_DETAIL_STATE.loading),
    data: current.data || null,
  };
}

function createActionsState(patch = {}) {
  const current = asObject(patch, {});

  return {
    sendingFacturaId: asText(current.sendingFacturaId, ""),
    downloadingFacturaId: asText(current.downloadingFacturaId, ""),
    viewingFacturaId: asText(current.viewingFacturaId, ""),
    openingFacturaId: asText(current.openingFacturaId, ""),
    selectedFacturaId: asText(current.selectedFacturaId, ""),
  };
}

function createInflightState(patch = {}) {
  const current = asObject(patch, {});

  return {
    load: current.load || null,
    detail: current.detail || null,
    collectionToken: asPositiveNumber(current.collectionToken, 0),
    detailToken: asPositiveNumber(current.detailToken, 0),
    detailFacturaId: asText(current.detailFacturaId, ""),
  };
}

/* =========================================================
   FACTORY
========================================================= */

export function createFacturasState() {
  return {
    view: createViewState(),
    detail: createDetailState(),
    actions: createActionsState(),
    inflight: createInflightState(),
  };
}

/* =========================================================
   INTERNAL NORMALIZERS
========================================================= */

function ensureViewState(state) {
  if (!state || typeof state !== "object") return null;

  state.view = createViewState(state.view);

  return state.view;
}

function ensureDetailState(state) {
  if (!state || typeof state !== "object") return null;

  state.detail = createDetailState(state.detail);

  return state.detail;
}

function ensureActionsState(state) {
  if (!state || typeof state !== "object") return null;

  state.actions = createActionsState(state.actions);

  return state.actions;
}

function ensureInflightState(state) {
  if (!state || typeof state !== "object") return null;

  state.inflight = createInflightState(state.inflight);

  return state.inflight;
}

export function ensureFacturasStateShape(state) {
  if (!state || typeof state !== "object") return null;

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
  state.view = createViewState();

  return state;
}

export function resetFacturasDetailState(state) {
  if (!state) return state;

  ensureFacturasStateShape(state);

  state.detail = createDetailState();
  state.actions = createActionsState({
    ...state.actions,
    selectedFacturaId: "",
    openingFacturaId: "",
    sendingFacturaId: "",
    downloadingFacturaId: "",
    viewingFacturaId: "",
  });

  state.inflight = createInflightState({
    ...state.inflight,
    detail: null,
    detailToken: 0,
    detailFacturaId: "",
  });

  return state;
}

export function resetFacturasActionsState(state) {
  if (!state) return state;

  ensureFacturasStateShape(state);
  state.actions = createActionsState();

  return state;
}

export function resetFacturasInflightState(state) {
  if (!state) return state;

  ensureFacturasStateShape(state);
  state.inflight = createInflightState();

  return state;
}

export function resetFacturasState(state) {
  if (!state) return state;

  state.view = createViewState();
  state.detail = createDetailState();
  state.actions = createActionsState();
  state.inflight = createInflightState();

  return state;
}

/* =========================================================
   GETTERS · ROOT
========================================================= */

export function getFacturasViewState(state) {
  return ensureViewState(state);
}

export function getFacturasDetailState(state) {
  return ensureDetailState(state);
}

export function getFacturasActionsState(state) {
  return ensureActionsState(state);
}

export function getFacturasInflightState(state) {
  return ensureInflightState(state);
}

/* =========================================================
   GETTERS · VIEW
========================================================= */

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
  return asPositiveNumber(ensureViewState(state)?.remoteCount, 0);
}

export function getFacturasLastSyncAt(state) {
  return asText(ensureViewState(state)?.lastSyncAt, "");
}

export function getFacturasPage(state) {
  return asPositiveInteger(ensureViewState(state)?.page, 1);
}

export function getFacturasPageSize(state) {
  return asPositiveInteger(ensureViewState(state)?.pageSize, DEFAULT_PAGE_SIZE);
}

/* =========================================================
   GETTERS · DETAIL
========================================================= */

export function isFacturasDetailOpen(state) {
  return Boolean(ensureDetailState(state)?.open);
}

export function isFacturasDetailLoading(state) {
  return Boolean(ensureDetailState(state)?.loading);
}

export function getFacturasDetailData(state) {
  return ensureDetailState(state)?.data || null;
}

/* =========================================================
   GETTERS · ACTIONS
========================================================= */

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

/* =========================================================
   GETTERS · INFLIGHT
========================================================= */

export function getFacturasInflightLoad(state) {
  return ensureInflightState(state)?.load || null;
}

export function getFacturasInflightDetail(state) {
  return ensureInflightState(state)?.detail || null;
}

export function getFacturasCollectionToken(state) {
  return asPositiveNumber(ensureInflightState(state)?.collectionToken, 0);
}

export function getFacturasDetailToken(state) {
  return asPositiveNumber(ensureInflightState(state)?.detailToken, 0);
}

export function getFacturasDetailFacturaId(state) {
  return asText(ensureInflightState(state)?.detailFacturaId, "");
}

/* =========================================================
   SETTERS · VIEW
========================================================= */

export function setFacturasHydrated(state, value = false) {
  if (!state) return state;

  ensureViewState(state);
  state.view.hydrated = asBoolean(value, false);

  return state;
}

export function setFacturasLoading(state, value = false) {
  if (!state) return state;

  ensureViewState(state);
  state.view.loading = asBoolean(value, false);

  return state;
}

export function setFacturasLoaded(state, value = false) {
  if (!state) return state;

  ensureViewState(state);

  const next = asBoolean(value, false);

  state.view.loaded = next;

  if (next) {
    state.view.hydrated = true;
  }

  return state;
}

export function setFacturasError(state, value = null) {
  if (!state) return state;

  ensureViewState(state);
  state.view.error = asNullableText(value);

  return state;
}

export function clearFacturasError(state) {
  if (!state) return state;

  ensureViewState(state);
  state.view.error = null;

  return state;
}

export function setFacturasRefreshing(state, value = false) {
  if (!state) return state;

  ensureViewState(state);
  state.view.refreshing = asBoolean(value, false);

  return state;
}

export function setFacturasBootstrapped(state, value = false) {
  if (!state) return state;

  ensureViewState(state);
  state.view.bootstrapped = asBoolean(value, false);

  return state;
}

export function setFacturasRemoteCount(state, value = 0) {
  if (!state) return state;

  ensureViewState(state);
  state.view.remoteCount = asPositiveNumber(value, 0);

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
  state.view.page = asPositiveInteger(value, 1);

  return state;
}

export function setFacturasPageSize(state, value = DEFAULT_PAGE_SIZE) {
  if (!state) return state;

  ensureViewState(state);
  state.view.pageSize = asPositiveInteger(value, DEFAULT_PAGE_SIZE);

  return state;
}

/* =========================================================
   SETTERS · DETAIL
========================================================= */

export function setFacturasDetailOpen(state, value = false) {
  if (!state) return state;

  ensureDetailState(state);
  state.detail.open = asBoolean(value, false);

  return state;
}

export function setFacturasDetailLoading(state, value = false) {
  if (!state) return state;

  ensureDetailState(state);
  state.detail.loading = asBoolean(value, false);

  return state;
}

export function setFacturasDetailData(state, value = null) {
  if (!state) return state;

  ensureFacturasStateShape(state);

  state.detail.data = value || null;

  const facturaId = getFacturaIdentity(value);

  state.actions.selectedFacturaId = facturaId || "";

  return state;
}

export function openFacturasDetail(state, factura = null) {
  if (!state) return state;

  ensureFacturasStateShape(state);

  const facturaId = getFacturaIdentity(factura);

  state.detail.open = true;
  state.detail.loading = false;
  state.detail.data = factura || null;

  state.actions.selectedFacturaId = facturaId || "";

  return state;
}

export function closeFacturasDetail(state) {
  if (!state) return state;

  ensureFacturasStateShape(state);

  state.detail.open = false;
  state.detail.loading = false;
  state.detail.data = null;

  clearFacturasActionIds(state);
  clearFacturasDetailInflight(state);

  return state;
}

/* =========================================================
   SETTERS · ACTIONS
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
   SETTERS · INFLIGHT
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
  state.inflight.collectionToken = asPositiveNumber(value, 0);

  return state;
}

export function setFacturasDetailToken(state, value = 0) {
  if (!state) return state;

  ensureInflightState(state);
  state.inflight.detailToken = asPositiveNumber(value, 0);

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

  state.view = createViewState({
    ...state.view,
    ...asObject(patch),
  });

  return state;
}

export function patchFacturasDetailState(state, patch = {}) {
  if (!state) return state;

  ensureDetailState(state);

  state.detail = createDetailState({
    ...state.detail,
    ...asObject(patch),
  });

  return state;
}

export function patchFacturasActionsState(state, patch = {}) {
  if (!state) return state;

  ensureActionsState(state);

  state.actions = createActionsState({
    ...state.actions,
    ...asObject(patch),
  });

  return state;
}

export function patchFacturasInflightState(state, patch = {}) {
  if (!state) return state;

  ensureInflightState(state);

  state.inflight = createInflightState({
    ...state.inflight,
    ...asObject(patch),
  });

  return state;
}

/* =========================================================
   PAGE HELPERS
========================================================= */

export function getFacturasTotalPages(state, totalItems = null) {
  const total = asPositiveNumber(
    first(totalItems, getFacturasRemoteCount(state)),
    0
  );

  const pageSize = getFacturasPageSize(state);

  return Math.max(1, Math.ceil(total / pageSize));
}

export function clampFacturasPage(state, totalItems = null) {
  if (!state) return state;

  ensureViewState(state);

  const totalPages = getFacturasTotalPages(state, totalItems);
  state.view.page = Math.min(Math.max(1, state.view.page), totalPages);

  return state;
}

export function nextFacturasPage(state, totalItems = null) {
  if (!state) return state;

  ensureViewState(state);

  const totalPages = getFacturasTotalPages(state, totalItems);
  state.view.page = Math.min(totalPages, state.view.page + 1);

  return state;
}

export function previousFacturasPage(state) {
  if (!state) return state;

  ensureViewState(state);
  state.view.page = Math.max(1, state.view.page - 1);

  return state;
}

/* =========================================================
   SNAPSHOTS
========================================================= */

export function getFacturasTemplateState(state) {
  if (!state) {
    return {
      ...DEFAULT_VIEW_STATE,

      detailOpen: false,
      detailLoading: false,
      detail: null,
      detailData: null,

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
    remoteCount: asPositiveNumber(state.view.remoteCount, 0),
    lastSyncAt: asText(state.view.lastSyncAt, ""),
    page: asPositiveInteger(state.view.page, 1),
    pageSize: asPositiveInteger(state.view.pageSize, DEFAULT_PAGE_SIZE),

    detailOpen: Boolean(state.detail.open),
    detailLoading: Boolean(state.detail.loading),
    detail: state.detail.data || null,
    detailData: state.detail.data || null,

    sendingFacturaId: asText(state.actions.sendingFacturaId, ""),
    downloadingFacturaId: asText(state.actions.downloadingFacturaId, ""),
    viewingFacturaId: asText(state.actions.viewingFacturaId, ""),
    openingFacturaId: asText(state.actions.openingFacturaId, ""),
    selectedFacturaId: asText(state.actions.selectedFacturaId, ""),
  };
}

export function getFacturasStateSnapshot(state) {
  if (!state) {
    return {
      view: {
        hydrated: false,
        loading: false,
        loaded: false,
        refreshing: false,
        bootstrapped: false,
        error: null,
        remoteCount: 0,
        lastSyncAt: "",
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        totalPages: 1,
      },

      detail: {
        open: false,
        loading: false,
        hasData: false,
        selectedFacturaId: "",
      },

      actions: {
        selectedFacturaId: "",
        openingFacturaId: "",
        sendingFacturaId: "",
        downloadingFacturaId: "",
        viewingFacturaId: "",
      },

      inflight: {
        hasLoad: false,
        hasDetail: false,
        collectionToken: 0,
        detailToken: 0,
        detailFacturaId: "",
      },
    };
  }

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
      totalPages: getFacturasTotalPages(state),
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
  ensureFacturasStateShape,

  resetFacturasViewState,
  resetFacturasDetailState,
  resetFacturasActionsState,
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
  getFacturasTotalPages,

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

  clampFacturasPage,
  nextFacturasPage,
  previousFacturasPage,

  getFacturasTemplateState,
  getFacturasStateSnapshot,
};
