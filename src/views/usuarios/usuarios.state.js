/* =========================================================
   Onion SPA - Usuarios State
   Archivo: src/views/usuarios/usuarios.state.js

   FINAL PRO SYSTEM · STATE LAYER · 10/10

   RESPONSABILIDADES:
   - estado local centralizado del módulo usuarios
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

export const CACHE_KEY = "usuarios.cache";
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
    username: "",
    name: "",
    email: "",
    phone: "",
    role: "user",
    status: "active",
    notes: "",
    source: "panel",
    tags: "",
    notifyUser: true,
    internalOnly: false,
    sendInvite: false,
  };
}

function createDefaultCreateViewState() {
  return {
    form: createDefaultCreateDraft(),
    errors: {},
    submitting: false,
    serverError: "",
    createdUserId: "",
    successMessage: "",
  };
}

function createInitialUsuariosState() {
  return {
    hydrated: false,
    loading: false,
    refreshing: false,
    loaded: false,

    creating: false,
    openingUserId: "",

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

export const usuariosState = createInitialUsuariosState();

let inflightLoad = null;

/* =========================================================
   INTERNAL
========================================================= */

function touchRequestId() {
  usuariosState.requestId += 1;
  return usuariosState.requestId;
}

function normalizeCreateDraft(value = {}) {
  const draft = safeObject(value);
  const base = createDefaultCreateDraft();

  return {
    ...base,
    ...draft,
    notifyUser: safeBoolean(draft.notifyUser, base.notifyUser),
    internalOnly: safeBoolean(draft.internalOnly, base.internalOnly),
    sendInvite: safeBoolean(draft.sendInvite, base.sendInvite),
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
    createdUserId: safeText(state.createdUserId, base.createdUserId),
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

export function resetUsuariosState() {
  const next = createInitialUsuariosState();

  Object.assign(usuariosState, next);

  inflightLoad = null;

  return usuariosState;
}

/* =========================================================
   FLAGS
========================================================= */

export function setLoading(value) {
  usuariosState.loading = Boolean(value);

  if (usuariosState.loading) {
    touchRequestId();
  }

  return usuariosState.loading;
}

export function setRefreshing(value) {
  usuariosState.refreshing = Boolean(value);
  return usuariosState.refreshing;
}

export function setLoaded(value) {
  usuariosState.loaded = Boolean(value);
  return usuariosState.loaded;
}

export function setHydrated(value) {
  usuariosState.hydrated = Boolean(value);
  return usuariosState.hydrated;
}

export function setCreating(value) {
  usuariosState.creating = Boolean(value);
  return usuariosState.creating;
}

export function setOpeningUserId(value = "") {
  usuariosState.openingUserId = safeText(value, "");
  return usuariosState.openingUserId;
}

/* =========================================================
   PAGINATION
========================================================= */

export function setPage(value = 1) {
  usuariosState.page = Math.max(1, safeNumber(value, 1));
  return usuariosState.page;
}

export function setPageSize(value = DEFAULT_PAGE_SIZE) {
  usuariosState.pageSize = Math.max(1, safeNumber(value, DEFAULT_PAGE_SIZE));
  return usuariosState.pageSize;
}

/* =========================================================
   DATA
========================================================= */

export function setItems(items = []) {
  const list = safeArray(items);

  usuariosState.items = list;
  usuariosState.loaded = true;
  usuariosState.error = "";

  usuariosState.remoteCount = Math.max(
    safeNumber(usuariosState.remoteCount, 0),
    list.length
  );

  return list;
}

export function getItems() {
  return safeArray(usuariosState.items);
}

export function clearItems() {
  usuariosState.items = [];
  usuariosState.remoteCount = 0;
  usuariosState.page = 1;

  return usuariosState.items;
}

export function setRemoteCount(value = 0) {
  usuariosState.remoteCount = Math.max(0, safeNumber(value, 0));
  return usuariosState.remoteCount;
}

/* =========================================================
   META
========================================================= */

export function setError(value = null) {
  usuariosState.error = value ? String(value).trim() : "";
  return usuariosState.error;
}

export function clearError() {
  usuariosState.error = "";
  return usuariosState.error;
}

export function setLastSyncAt(value = 0) {
  usuariosState.lastSyncAt = safeNumber(value, 0);
  return usuariosState.lastSyncAt;
}

/* =========================================================
   CREATE DRAFT
========================================================= */

export function setCreateDraft(value = {}) {
  usuariosState.createDraft = normalizeCreateDraft(value);
  return usuariosState.createDraft;
}

export function patchCreateDraft(patch = {}) {
  usuariosState.createDraft = normalizeCreateDraft({
    ...safeObject(usuariosState.createDraft),
    ...safeObject(patch),
  });

  return usuariosState.createDraft;
}

export function clearCreateDraft() {
  usuariosState.createDraft = createDefaultCreateDraft();
  return usuariosState.createDraft;
}

/* =========================================================
   CREATE VIEW STATE
========================================================= */

export function setCreateViewState(value = {}) {
  usuariosState.createView = normalizeCreateViewState(value);
  return usuariosState.createView;
}

export function patchCreateViewState(patch = {}) {
  const current = normalizeCreateViewState(usuariosState.createView);
  const nextPatch = safeObject(patch);

  usuariosState.createView = normalizeCreateViewState({
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

  return usuariosState.createView;
}

export function setCreateViewForm(form = {}) {
  const current = normalizeCreateViewState(usuariosState.createView);

  usuariosState.createView = {
    ...current,
    form: normalizeCreateDraft(form),
  };

  return usuariosState.createView.form;
}

export function patchCreateViewForm(patch = {}) {
  const current = normalizeCreateViewState(usuariosState.createView);

  usuariosState.createView = {
    ...current,
    form: normalizeCreateDraft({
      ...current.form,
      ...safeObject(patch),
    }),
  };

  return usuariosState.createView.form;
}

export function setCreateViewErrors(errors = {}) {
  const current = normalizeCreateViewState(usuariosState.createView);

  usuariosState.createView = {
    ...current,
    errors: safeObject(errors),
  };

  return usuariosState.createView.errors;
}

export function clearCreateViewErrors() {
  return setCreateViewErrors({});
}

export function setCreateViewSubmitting(value = false) {
  const current = normalizeCreateViewState(usuariosState.createView);

  usuariosState.createView = {
    ...current,
    submitting: Boolean(value),
  };

  return usuariosState.createView.submitting;
}

export function setCreateViewServerError(value = "") {
  const current = normalizeCreateViewState(usuariosState.createView);

  usuariosState.createView = {
    ...current,
    serverError: safeText(value, ""),
  };

  return usuariosState.createView.serverError;
}

export function setCreateViewSuccess({
  createdUserId = "",
  successMessage = "",
} = {}) {
  const current = normalizeCreateViewState(usuariosState.createView);

  usuariosState.createView = {
    ...current,
    createdUserId: safeText(createdUserId, ""),
    successMessage: safeText(successMessage, ""),
  };

  return usuariosState.createView;
}

export function clearCreateViewSuccess() {
  return setCreateViewSuccess({
    createdUserId: "",
    successMessage: "",
  });
}

export function resetCreateViewState() {
  usuariosState.createView = createDefaultCreateViewState();
  return usuariosState.createView;
}

/* =========================================================
   CACHE HELPERS
========================================================= */

export function getCachePayload() {
  return {
    savedAt: Date.now(),
    items: getItems(),
    remoteCount: usuariosState.remoteCount,
    lastSyncAt: usuariosState.lastSyncAt,
    page: usuariosState.page,
    pageSize: usuariosState.pageSize,
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

export function getUsuariosStateSnapshot() {
  const createView = normalizeCreateViewState(usuariosState.createView);

  return {
    hydrated: usuariosState.hydrated,
    loading: usuariosState.loading,
    refreshing: usuariosState.refreshing,
    loaded: usuariosState.loaded,

    creating: usuariosState.creating,
    openingUserId: usuariosState.openingUserId,

    error: usuariosState.error,

    total: safeArray(usuariosState.items).length,
    remoteCount: usuariosState.remoteCount,
    lastSyncAt: usuariosState.lastSyncAt,

    page: usuariosState.page,
    pageSize: usuariosState.pageSize,

    requestId: usuariosState.requestId,
    hasInflight: Boolean(inflightLoad),

    createDraft: {
      ...safeObject(usuariosState.createDraft),
    },

    createView: {
      submitting: createView.submitting,
      serverError: createView.serverError,
      createdUserId: createView.createdUserId,
      successMessage: createView.successMessage,
      errorCount: Object.keys(safeObject(createView.errors)).length,
      hasDraftName: Boolean(safeText(createView?.form?.name, "")),
      hasDraftUsername: Boolean(safeText(createView?.form?.username, "")),
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
  usuariosState,

  getInflightLoad,
  setInflightLoad,
  clearInflightLoad,

  resetUsuariosState,

  setLoading,
  setRefreshing,
  setLoaded,
  setHydrated,
  setCreating,
  setOpeningUserId,

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
  getUsuariosStateSnapshot,
};
