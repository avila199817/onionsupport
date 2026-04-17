/* =========================================================
   Onion SPA - Clientes State
   Archivo: src/views/clientes/clientes.state.js

   FINAL PRO SYSTEM · STATE LAYER · 10/10

   RESPONSABILIDADES:
   - estado local centralizado del módulo clientes
   - loading / refresh / create / open detail
   - errores
   - cache temporal
   - request inflight
   - draft de creación
   - compatibilidad View / API / Actions / Modal

   HARDENING PRO:
   - setters robustos
   - no loading infinito
   - estado preparado para paginación
   - estado preparado para create view
   - cache helpers
   - snapshot debug
========================================================= */

export const CACHE_KEY = "clientes.cache";
export const CACHE_TTL = 1000 * 60 * 3; // 3 min
export const DEFAULT_PAGE_SIZE = 10;

/* =========================================================
   SAFE
========================================================= */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  return fallback;
}

/* =========================================================
   DEFAULTS
========================================================= */

function createDefaultCreateDraft() {
  return {
    name: "",
    email: "",
    phone: "",
    company: "",
    status: "active",
    tier: "basic",
    notes: "",
    source: "panel",
    tags: "",
    notifyClient: true,
    internalOnly: false,
  };
}

function createDefaultCreateViewState() {
  return {
    form: createDefaultCreateDraft(),
    errors: {},
    submitting: false,
    serverError: "",
    createdClientId: "",
    successMessage: "",
  };
}

function createInitialClientesState() {
  return {
    hydrated: false,
    loading: false,
    refreshing: false,
    loaded: false,

    creating: false,
    openingClientId: "",

    error: "",

    items: [],
    remoteCount: 0,
    lastSyncAt: 0,

    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,

    requestId: 0,

    createDraft: createDefaultCreateDraft(),
    createView: createDefaultCreateViewState(),
  };
}

/* =========================================================
   STATE
========================================================= */

export const clientesState = createInitialClientesState();

let inflightLoad = null;

/* =========================================================
   INTERNAL
========================================================= */

function touchRequestId() {
  clientesState.requestId += 1;
  return clientesState.requestId;
}

function normalizeCreateDraft(value = {}) {
  const draft = safeObject(value);
  const base = createDefaultCreateDraft();

  return {
    ...base,
    ...draft,
    notifyClient: safeBoolean(draft.notifyClient, base.notifyClient),
    internalOnly: safeBoolean(draft.internalOnly, base.internalOnly),
  };
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return null;
}

function normalizeCreateViewState(value = {}) {
  const state = safeObject(value);
  const base = createDefaultCreateViewState();

  return {
    form: normalizeCreateDraft(firstDefined(state.form, base.form)),
    errors: safeObject(state.errors),
    submitting: safeBoolean(state.submitting, base.submitting),
    serverError: safeText(state.serverError, base.serverError),
    createdClientId: safeText(state.createdClientId, base.createdClientId),
    successMessage: safeText(state.successMessage, base.successMessage),
  };
}

/* =========================================================
   INFLOW
========================================================= */

export function getInflightLoad() {
  return inflightLoad;
}

export function setInflightLoad(value) {
  inflightLoad = value || null;
  return inflightLoad;
}

export function clearInflightLoad() {
  inflightLoad = null;
  return inflightLoad;
}

/* =========================================================
   RESET
========================================================= */

export function resetClientesState() {
  const next = createInitialClientesState();

  Object.assign(clientesState, next);

  inflightLoad = null;

  return clientesState;
}

/* =========================================================
   FLAGS
========================================================= */

export function setLoading(value) {
  clientesState.loading = Boolean(value);

  if (clientesState.loading) {
    touchRequestId();
  }

  return clientesState.loading;
}

export function setRefreshing(value) {
  clientesState.refreshing = Boolean(value);
  return clientesState.refreshing;
}

export function setLoaded(value) {
  clientesState.loaded = Boolean(value);
  return clientesState.loaded;
}

export function setHydrated(value) {
  clientesState.hydrated = Boolean(value);
  return clientesState.hydrated;
}

export function setCreating(value) {
  clientesState.creating = Boolean(value);
  return clientesState.creating;
}

export function setOpeningClientId(value = "") {
  clientesState.openingClientId = safeText(value, "");
  return clientesState.openingClientId;
}

/* =========================================================
   PAGINATION
========================================================= */

export function setPage(value = 1) {
  clientesState.page = Math.max(1, safeNumber(value, 1));
  return clientesState.page;
}

export function setPageSize(value = DEFAULT_PAGE_SIZE) {
  clientesState.pageSize = Math.max(1, safeNumber(value, DEFAULT_PAGE_SIZE));
  return clientesState.pageSize;
}

/* =========================================================
   DATA
========================================================= */

export function setItems(items = []) {
  const list = safeArray(items);

  clientesState.items = list;
  clientesState.loaded = true;
  clientesState.error = "";

  clientesState.remoteCount = Math.max(
    safeNumber(clientesState.remoteCount, 0),
    list.length
  );

  return list;
}

export function getItems() {
  return safeArray(clientesState.items);
}

export function clearItems() {
  clientesState.items = [];
  clientesState.remoteCount = 0;
  clientesState.page = 1;

  return clientesState.items;
}

export function setRemoteCount(value = 0) {
  clientesState.remoteCount = Math.max(0, safeNumber(value, 0));
  return clientesState.remoteCount;
}

/* =========================================================
   META
========================================================= */

export function setError(value = null) {
  clientesState.error = value ? String(value).trim() : "";
  return clientesState.error;
}

export function clearError() {
  clientesState.error = "";
  return clientesState.error;
}

export function setLastSyncAt(value = 0) {
  clientesState.lastSyncAt = safeNumber(value, 0);
  return clientesState.lastSyncAt;
}

/* =========================================================
   CREATE DRAFT
========================================================= */

export function setCreateDraft(value = {}) {
  clientesState.createDraft = normalizeCreateDraft(value);
  return clientesState.createDraft;
}

export function patchCreateDraft(patch = {}) {
  clientesState.createDraft = normalizeCreateDraft({
    ...safeObject(clientesState.createDraft),
    ...safeObject(patch),
  });

  return clientesState.createDraft;
}

export function clearCreateDraft() {
  clientesState.createDraft = createDefaultCreateDraft();
  return clientesState.createDraft;
}

/* =========================================================
   CREATE VIEW STATE
========================================================= */

export function setCreateViewState(value = {}) {
  clientesState.createView = normalizeCreateViewState(value);
  return clientesState.createView;
}

export function patchCreateViewState(patch = {}) {
  const current = normalizeCreateViewState(clientesState.createView);
  const nextPatch = safeObject(patch);

  clientesState.createView = normalizeCreateViewState({
    ...current,
    ...nextPatch,
    form:
      nextPatch.form !== undefined
        ? nextPatch.form
        : current.form,
    errors:
      nextPatch.errors !== undefined
        ? nextPatch.errors
        : current.errors,
  });

  return clientesState.createView;
}

export function setCreateViewForm(form = {}) {
  const current = normalizeCreateViewState(clientesState.createView);

  clientesState.createView = {
    ...current,
    form: normalizeCreateDraft(form),
  };

  return clientesState.createView.form;
}

export function patchCreateViewForm(patch = {}) {
  const current = normalizeCreateViewState(clientesState.createView);

  clientesState.createView = {
    ...current,
    form: normalizeCreateDraft({
      ...current.form,
      ...safeObject(patch),
    }),
  };

  return clientesState.createView.form;
}

export function setCreateViewErrors(errors = {}) {
  const current = normalizeCreateViewState(clientesState.createView);

  clientesState.createView = {
    ...current,
    errors: safeObject(errors),
  };

  return clientesState.createView.errors;
}

export function clearCreateViewErrors() {
  return setCreateViewErrors({});
}

export function setCreateViewSubmitting(value = false) {
  const current = normalizeCreateViewState(clientesState.createView);

  clientesState.createView = {
    ...current,
    submitting: Boolean(value),
  };

  return clientesState.createView.submitting;
}

export function setCreateViewServerError(value = "") {
  const current = normalizeCreateViewState(clientesState.createView);

  clientesState.createView = {
    ...current,
    serverError: safeText(value, ""),
  };

  return clientesState.createView.serverError;
}

export function setCreateViewSuccess({
  createdClientId = "",
  successMessage = "",
} = {}) {
  const current = normalizeCreateViewState(clientesState.createView);

  clientesState.createView = {
    ...current,
    createdClientId: safeText(createdClientId, ""),
    successMessage: safeText(successMessage, ""),
  };

  return clientesState.createView;
}

export function clearCreateViewSuccess() {
  return setCreateViewSuccess({
    createdClientId: "",
    successMessage: "",
  });
}

export function resetCreateViewState() {
  clientesState.createView = createDefaultCreateViewState();
  return clientesState.createView;
}

/* =========================================================
   CACHE HELPERS
========================================================= */

export function getCachePayload() {
  return {
    savedAt: Date.now(),
    items: getItems(),
    remoteCount: clientesState.remoteCount,
    lastSyncAt: clientesState.lastSyncAt,
    page: clientesState.page,
    pageSize: clientesState.pageSize,
  };
}

export function isCacheFresh(savedAt = 0) {
  const ts = safeNumber(savedAt, 0);

  if (!ts) {
    return false;
  }

  return Date.now() - ts < CACHE_TTL;
}

/* =========================================================
   DEBUG
========================================================= */

export function getClientesStateSnapshot() {
  const createView = normalizeCreateViewState(clientesState.createView);

  return {
    hydrated: clientesState.hydrated,
    loading: clientesState.loading,
    refreshing: clientesState.refreshing,
    loaded: clientesState.loaded,

    creating: clientesState.creating,
    openingClientId: clientesState.openingClientId,

    error: clientesState.error,

    total: safeArray(clientesState.items).length,
    remoteCount: clientesState.remoteCount,
    lastSyncAt: clientesState.lastSyncAt,

    page: clientesState.page,
    pageSize: clientesState.pageSize,

    requestId: clientesState.requestId,
    hasInflight: Boolean(inflightLoad),

    createDraft: {
      ...safeObject(clientesState.createDraft),
    },

    createView: {
      submitting: createView.submitting,
      serverError: createView.serverError,
      createdClientId: createView.createdClientId,
      successMessage: createView.successMessage,
      errorCount: Object.keys(safeObject(createView.errors)).length,
      hasDraftName: Boolean(safeText(createView?.form?.name, "")),
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  CACHE_KEY,
  CACHE_TTL,
  DEFAULT_PAGE_SIZE,
  clientesState,

  getInflightLoad,
  setInflightLoad,
  clearInflightLoad,

  resetClientesState,

  setLoading,
  setRefreshing,
  setLoaded,
  setHydrated,
  setCreating,
  setOpeningClientId,

  setPage,
  setPageSize,

  setItems,
  getItems,
  clearItems,
  setRemoteCount,

  setError,
  clearError,
  setLastSyncAt,

  setCreateDraft,
  patchCreateDraft,
  clearCreateDraft,

  setCreateViewState,
  patchCreateViewState,
  setCreateViewForm,
  patchCreateViewForm,
  setCreateViewErrors,
  clearCreateViewErrors,
  setCreateViewSubmitting,
  setCreateViewServerError,
  setCreateViewSuccess,
  clearCreateViewSuccess,
  resetCreateViewState,

  getCachePayload,
  isCacheFresh,
  getClientesStateSnapshot,
};
