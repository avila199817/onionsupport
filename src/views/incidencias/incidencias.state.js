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
   - hydrated coherente tras setItems / setLoaded
   - estado preparado para paginación
   - estado preparado para create view
   - cache helpers
   - snapshot debug
========================================================= */

export const CACHE_KEY = "incidencias.cache";
export const CACHE_TTL = 1000 * 60 * 3; // 3 min
export const DEFAULT_PAGE_SIZE = 5;

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeTimestamp(value, fallback = 0) {
  const direct = Number(value);

  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }

  if (!value) return fallback;

  const date = new Date(value);
  const ts = date.getTime();

  return Number.isFinite(ts) ? ts : fallback;
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  return text || fallback;
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí"].includes(key)) return true;
    if (["false", "0", "no"].includes(key)) return false;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return fallback;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return null;
}

function hasOwn(object = {}, key = "") {
  return Object.prototype.hasOwnProperty.call(safeObject(object), key);
}

function getTotalPages(total = 0, pageSize = DEFAULT_PAGE_SIZE) {
  const size = Math.max(1, safeNumber(pageSize, DEFAULT_PAGE_SIZE));
  return Math.max(1, Math.ceil(Math.max(0, safeNumber(total, 0)) / size));
}

function clampPage(page = 1, total = 0, pageSize = DEFAULT_PAGE_SIZE) {
  const current = Math.max(1, safeNumber(page, 1));
  const totalPages = getTotalPages(total, pageSize);

  return Math.min(current, totalPages);
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
   INTERNAL NORMALIZERS
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

    subject: safeText(draft.subject, base.subject),
    description: safeText(draft.description, base.description),

    priority: safeText(draft.priority, base.priority),
    status: safeText(draft.status, base.status),

    clientName: safeText(draft.clientName, base.clientName),
    clientEmail: safeText(draft.clientEmail, base.clientEmail),

    assignedTo: safeText(draft.assignedTo, base.assignedTo),
    category: safeText(draft.category, base.category),
    source: safeText(draft.source, base.source),
    tags: safeText(draft.tags, base.tags),

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

function normalizeItems(items = []) {
  return safeArray(items).filter((item) => {
    return item && typeof item === "object" && !Array.isArray(item);
  });
}

function normalizePageState() {
  const total = Math.max(
    safeNumber(incidenciasState.remoteCount, 0),
    safeArray(incidenciasState.items).length
  );

  incidenciasState.pageSize = Math.max(
    1,
    safeNumber(incidenciasState.pageSize, DEFAULT_PAGE_SIZE)
  );

  incidenciasState.page = clampPage(
    incidenciasState.page,
    total,
    incidenciasState.pageSize
  );

  return {
    page: incidenciasState.page,
    pageSize: incidenciasState.pageSize,
    total,
    totalPages: getTotalPages(total, incidenciasState.pageSize),
  };
}

function markLoaded() {
  incidenciasState.loaded = true;
  incidenciasState.hydrated = true;
  incidenciasState.loading = false;
  incidenciasState.refreshing = false;

  return incidenciasState;
}

function markIdle() {
  incidenciasState.loading = false;
  incidenciasState.refreshing = false;

  return incidenciasState;
}

/* =========================================================
   INFLIGHT
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
    incidenciasState.refreshing = false;
    touchRequestId();
  }

  return incidenciasState.loading;
}

export function setRefreshing(value) {
  incidenciasState.refreshing = Boolean(value);

  if (incidenciasState.refreshing) {
    incidenciasState.loading = false;
    touchRequestId();
  }

  return incidenciasState.refreshing;
}

export function setLoaded(value) {
  incidenciasState.loaded = Boolean(value);

  if (incidenciasState.loaded) {
    incidenciasState.hydrated = true;
    incidenciasState.loading = false;
    incidenciasState.refreshing = false;
  }

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
  normalizePageState();

  return incidenciasState.page;
}

export function setPageSize(value = DEFAULT_PAGE_SIZE) {
  incidenciasState.pageSize = Math.max(
    1,
    safeNumber(value, DEFAULT_PAGE_SIZE)
  );

  normalizePageState();

  return incidenciasState.pageSize;
}

export function getPaginationState() {
  const total = Math.max(
    safeNumber(incidenciasState.remoteCount, 0),
    safeArray(incidenciasState.items).length
  );

  const pageSize = Math.max(
    1,
    safeNumber(incidenciasState.pageSize, DEFAULT_PAGE_SIZE)
  );

  const totalPages = getTotalPages(total, pageSize);
  const page = clampPage(incidenciasState.page, total, pageSize);

  return {
    page,
    pageSize,
    total,
    totalPages,
    from: total === 0 ? 0 : (page - 1) * pageSize + 1,
    to: Math.min(page * pageSize, total),
  };
}

/* =========================================================
   DATA
========================================================= */

export function setItems(items = [], options = {}) {
  const list = normalizeItems(items);
  const opts = safeObject(options);

  incidenciasState.items = list;
  incidenciasState.error = "";

  if (hasOwn(opts, "remoteCount")) {
    incidenciasState.remoteCount = Math.max(
      0,
      safeNumber(opts.remoteCount, list.length)
    );
  } else {
    incidenciasState.remoteCount = Math.max(
      safeNumber(incidenciasState.remoteCount, 0),
      list.length
    );
  }

  markLoaded();
  normalizePageState();

  return incidenciasState.items;
}

export function getItems() {
  return safeArray(incidenciasState.items);
}

export function getItemsCount() {
  return getItems().length;
}

export function hasItems() {
  return getItemsCount() > 0;
}

export function clearItems() {
  incidenciasState.items = [];
  incidenciasState.remoteCount = 0;
  incidenciasState.page = 1;

  return incidenciasState.items;
}

export function setRemoteCount(value = 0) {
  incidenciasState.remoteCount = Math.max(0, safeNumber(value, 0));
  normalizePageState();

  return incidenciasState.remoteCount;
}

/* =========================================================
   META
========================================================= */

export function setError(value = null) {
  incidenciasState.error = value ? String(value).trim() : "";

  if (incidenciasState.error) {
    markIdle();
  }

  return incidenciasState.error;
}

export function clearError() {
  incidenciasState.error = "";
  return incidenciasState.error;
}

export function setLastSyncAt(value = 0) {
  incidenciasState.lastSyncAt = safeTimestamp(value, 0);
  return incidenciasState.lastSyncAt;
}

export function touchLastSyncAt() {
  incidenciasState.lastSyncAt = Date.now();
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

  const nextForm = hasOwn(nextPatch, "form")
    ? normalizeCreateDraft({
        ...current.form,
        ...safeObject(nextPatch.form),
      })
    : current.form;

  const nextErrors = hasOwn(nextPatch, "errors")
    ? safeObject(nextPatch.errors)
    : current.errors;

  incidenciasState.createView = normalizeCreateViewState({
    ...current,
    ...nextPatch,
    form: nextForm,
    errors: nextErrors,
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

export function patchCreateViewErrors(patch = {}) {
  const current = normalizeCreateViewState(incidenciasState.createView);

  incidenciasState.createView = {
    ...current,
    errors: {
      ...safeObject(current.errors),
      ...safeObject(patch),
    },
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

export function clearCreateViewServerError() {
  return setCreateViewServerError("");
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
  const ts = safeTimestamp(savedAt, 0);

  if (!ts) {
    return false;
  }

  return Date.now() - ts < CACHE_TTL;
}

export function writeCachePayload(payload = null) {
  const finalPayload = safeObject(payload || getCachePayload());

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(finalPayload));
    return true;
  } catch {
    return false;
  }
}

export function readCachePayload({
  freshOnly = true,
} = {}) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const payload = safeObject(parsed);

    if (!Object.keys(payload).length) return null;

    if (freshOnly && !isCacheFresh(payload.savedAt)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function clearCachePayload() {
  try {
    localStorage.removeItem(CACHE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function hydrateStateFromCache({
  freshOnly = true,
} = {}) {
  const payload = readCachePayload({ freshOnly });

  if (!payload) {
    return false;
  }

  incidenciasState.items = normalizeItems(payload.items);
  incidenciasState.remoteCount = Math.max(
    safeNumber(payload.remoteCount, incidenciasState.items.length),
    incidenciasState.items.length
  );
  incidenciasState.lastSyncAt = safeTimestamp(payload.lastSyncAt, 0);
  incidenciasState.page = Math.max(1, safeNumber(payload.page, 1));
  incidenciasState.pageSize = Math.max(
    1,
    safeNumber(payload.pageSize, DEFAULT_PAGE_SIZE)
  );

  clearError();
  markLoaded();
  normalizePageState();

  return true;
}

/* =========================================================
   DEBUG
========================================================= */

export function getIncidenciasStateSnapshot() {
  const createView = normalizeCreateViewState(incidenciasState.createView);
  const pagination = getPaginationState();

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

    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: pagination.totalPages,
    from: pagination.from,
    to: pagination.to,

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
      hasDraftDescription: Boolean(safeText(createView?.form?.description, "")),
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
  getPaginationState,

  setItems,
  getItems,
  getItemsCount,
  hasItems,
  clearItems,
  setRemoteCount,

  setError,
  clearError,
  setLastSyncAt,
  touchLastSyncAt,

  setCreateDraft,
  patchCreateDraft,
  clearCreateDraft,

  setCreateViewState,
  patchCreateViewState,
  setCreateViewForm,
  patchCreateViewForm,
  setCreateViewErrors,
  patchCreateViewErrors,
  clearCreateViewErrors,
  setCreateViewSubmitting,
  setCreateViewServerError,
  clearCreateViewServerError,
  setCreateViewSuccess,
  clearCreateViewSuccess,
  resetCreateViewState,

  getCachePayload,
  isCacheFresh,
  writeCachePayload,
  readCachePayload,
  clearCachePayload,
  hydrateStateFromCache,

  getIncidenciasStateSnapshot,
};
