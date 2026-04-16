/* =========================================================
   Onion SPA - Incidencias State
   Archivo: src/views/incidencias/incidencias.state.js

   FINAL PRO SYSTEM · STATE LAYER · 10/10

   RESPONSABILIDADES:
   - estado local centralizado del módulo incidencias
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

export const CACHE_KEY = "incidencias.cache";
export const CACHE_TTL = 1000 * 60 * 3; // 3 min
export const DEFAULT_PAGE_SIZE = 5;

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
    subject: "",
    description: "",
    priority: "medium",
    status: "open",
    clientName: "",
    clientEmail: "",
    assignedTo: "",
    category: "",
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
    createdTicketId: "",
    successMessage: "",
  };
}

function createInitialIncidenciasState() {
  return {
    hydrated: false,
    loading: false,
    refreshing: false,
    loaded: false,

    creating: false,
    openingTicketId: "",

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

export const incidenciasState = createInitialIncidenciasState();

let inflightLoad = null;

/* =========================================================
   INTERNAL
========================================================= */

function touchRequestId() {
  incidenciasState.requestId += 1;
  return incidenciasState.requestId;
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

function normalizeCreateViewState(value = {}) {
  const state = safeObject(value);
  const base = createDefaultCreateViewState();

  return {
    form: normalizeCreateDraft(firstDefined(state.form, base.form)),
    errors: safeObject(state.errors),
    submitting: safeBoolean(state.submitting, base.submitting),
    serverError: safeText(state.serverError, base.serverError),
    createdTicketId: safeText(state.createdTicketId, base.createdTicketId),
    successMessage: safeText(state.successMessage, base.successMessage),
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

export function resetIncidenciasState() {
  const next = createInitialIncidenciasState();

  Object.assign(incidenciasState, next);

  inflightLoad = null;

  return incidenciasState;
}

/* =========================================================
   FLAGS
========================================================= */

export function setLoading(value) {
  incidenciasState.loading = Boolean(value);

  if (incidenciasState.loading) {
    touchRequestId();
  }

  return incidenciasState.loading;
}

export function setRefreshing(value) {
  incidenciasState.refreshing = Boolean(value);
  return incidenciasState.refreshing;
}

export function setLoaded(value) {
  incidenciasState.loaded = Boolean(value);
  return incidenciasState.loaded;
}

export function setHydrated(value) {
  incidenciasState.hydrated = Boolean(value);
  return incidenciasState.hydrated;
}

export function setCreating(value) {
  incidenciasState.creating = Boolean(value);
  return incidenciasState.creating;
}

export function setOpeningTicketId(value = "") {
  incidenciasState.openingTicketId = safeText(value, "");
  return incidenciasState.openingTicketId;
}

/* =========================================================
   PAGINATION
========================================================= */

export function setPage(value = 1) {
  incidenciasState.page = Math.max(1, safeNumber(value, 1));
  return incidenciasState.page;
}

export function setPageSize(value = DEFAULT_PAGE_SIZE) {
  incidenciasState.pageSize = Math.max(1, safeNumber(value, DEFAULT_PAGE_SIZE));
  return incidenciasState.pageSize;
}

/* =========================================================
   DATA
========================================================= */

export function setItems(items = []) {
  const list = safeArray(items);

  incidenciasState.items = list;
  incidenciasState.loaded = true;
  incidenciasState.error = "";

  incidenciasState.remoteCount = Math.max(
    safeNumber(incidenciasState.remoteCount, 0),
    list.length
  );

  return list;
}

export function getItems() {
  return safeArray(incidenciasState.items);
}

export function clearItems() {
  incidenciasState.items = [];
  incidenciasState.remoteCount = 0;
  incidenciasState.page = 1;

  return incidenciasState.items;
}

export function setRemoteCount(value = 0) {
  incidenciasState.remoteCount = Math.max(0, safeNumber(value, 0));
  return incidenciasState.remoteCount;
}

/* =========================================================
   META
========================================================= */

export function setError(value = null) {
  incidenciasState.error = value ? String(value).trim() : "";
  return incidenciasState.error;
}

export function clearError() {
  incidenciasState.error = "";
  return incidenciasState.error;
}

export function setLastSyncAt(value = 0) {
  incidenciasState.lastSyncAt = safeNumber(value, 0);
  return incidenciasState.lastSyncAt;
}

/* =========================================================
   CREATE DRAFT
========================================================= */

export function setCreateDraft(value = {}) {
  incidenciasState.createDraft = normalizeCreateDraft(value);
  return incidenciasState.createDraft;
}

export function patchCreateDraft(patch = {}) {
  incidenciasState.createDraft = normalizeCreateDraft({
    ...safeObject(incidenciasState.createDraft),
    ...safeObject(patch),
  });

  return incidenciasState.createDraft;
}

export function clearCreateDraft() {
  incidenciasState.createDraft = createDefaultCreateDraft();
  return incidenciasState.createDraft;
}

/* =========================================================
   CREATE VIEW STATE
========================================================= */

export function setCreateViewState(value = {}) {
  incidenciasState.createView = normalizeCreateViewState(value);
  return incidenciasState.createView;
}

export function patchCreateViewState(patch = {}) {
  const current = normalizeCreateViewState(incidenciasState.createView);
  const nextPatch = safeObject(patch);

  incidenciasState.createView = normalizeCreateViewState({
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

  return incidenciasState.createView;
}

export function setCreateViewForm(form = {}) {
  const current = normalizeCreateViewState(incidenciasState.createView);

  incidenciasState.createView = {
    ...current,
    form: normalizeCreateDraft(form),
  };

  return incidenciasState.createView.form;
}

export function patchCreateViewForm(patch = {}) {
  const current = normalizeCreateViewState(incidenciasState.createView);

  incidenciasState.createView = {
    ...current,
    form: normalizeCreateDraft({
      ...current.form,
      ...safeObject(patch),
    }),
  };

  return incidenciasState.createView.form;
}

export function setCreateViewErrors(errors = {}) {
  const current = normalizeCreateViewState(incidenciasState.createView);

  incidenciasState.createView = {
    ...current,
    errors: safeObject(errors),
  };

  return incidenciasState.createView.errors;
}

export function clearCreateViewErrors() {
  return setCreateViewErrors({});
}

export function setCreateViewSubmitting(value = false) {
  const current = normalizeCreateViewState(incidenciasState.createView);

  incidenciasState.createView = {
    ...current,
    submitting: Boolean(value),
  };

  return incidenciasState.createView.submitting;
}

export function setCreateViewServerError(value = "") {
  const current = normalizeCreateViewState(incidenciasState.createView);

  incidenciasState.createView = {
    ...current,
    serverError: safeText(value, ""),
  };

  return incidenciasState.createView.serverError;
}

export function setCreateViewSuccess({
  createdTicketId = "",
  successMessage = "",
} = {}) {
  const current = normalizeCreateViewState(incidenciasState.createView);

  incidenciasState.createView = {
    ...current,
    createdTicketId: safeText(createdTicketId, ""),
    successMessage: safeText(successMessage, ""),
  };

  return incidenciasState.createView;
}

export function clearCreateViewSuccess() {
  return setCreateViewSuccess({
    createdTicketId: "",
    successMessage: "",
  });
}

export function resetCreateViewState() {
  incidenciasState.createView = createDefaultCreateViewState();
  return incidenciasState.createView;
}

/* =========================================================
   CACHE HELPERS
========================================================= */

export function getCachePayload() {
  return {
    savedAt: Date.now(),
    items: getItems(),
    remoteCount: incidenciasState.remoteCount,
    lastSyncAt: incidenciasState.lastSyncAt,
    page: incidenciasState.page,
    pageSize: incidenciasState.pageSize,
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

export function getIncidenciasStateSnapshot() {
  const createView = normalizeCreateViewState(incidenciasState.createView);

  return {
    hydrated: incidenciasState.hydrated,
    loading: incidenciasState.loading,
    refreshing: incidenciasState.refreshing,
    loaded: incidenciasState.loaded,

    creating: incidenciasState.creating,
    openingTicketId: incidenciasState.openingTicketId,

    error: incidenciasState.error,

    total: safeArray(incidenciasState.items).length,
    remoteCount: incidenciasState.remoteCount,
    lastSyncAt: incidenciasState.lastSyncAt,

    page: incidenciasState.page,
    pageSize: incidenciasState.pageSize,

    requestId: incidenciasState.requestId,
    hasInflight: Boolean(inflightLoad),

    createDraft: {
      ...safeObject(incidenciasState.createDraft),
    },

    createView: {
      submitting: createView.submitting,
      serverError: createView.serverError,
      createdTicketId: createView.createdTicketId,
      successMessage: createView.successMessage,
      errorCount: Object.keys(safeObject(createView.errors)).length,
      hasDraftSubject: Boolean(safeText(createView?.form?.subject, "")),
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
  incidenciasState,

  getInflightLoad,
  setInflightLoad,
  clearInflightLoad,

  resetIncidenciasState,

  setLoading,
  setRefreshing,
  setLoaded,
  setHydrated,
  setCreating,
  setOpeningTicketId,

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
  getIncidenciasStateSnapshot,
};
