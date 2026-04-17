/* =========================================================
   Onion SPA - Ajustes State
   Archivo: src/views/ajustes/ajustes.state.js

   FINAL PRO SYSTEM · STATE LAYER · 10/10

   RESPONSABILIDADES:
   - estado local centralizado del módulo ajustes
   - loading / refresh / save / open detail
   - errores
   - cache temporal
   - request inflight
   - draft de configuración
   - compatibilidad View / API / Actions / Modal

   HARDENING PRO:
   - setters robustos
   - no loading infinito
   - estado preparado para paginación
   - estado preparado para edit view
   - cache helpers
   - snapshot debug
========================================================= */

export const CACHE_KEY = "ajustes.cache";
export const CACHE_TTL = 1000 * 60 * 3; // 3 min
export const DEFAULT_PAGE_SIZE = 8;

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

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return null;
}

/* =========================================================
   DEFAULTS
========================================================= */

function createDefaultSaveDraft() {
  return {
    settingId: "",
    key: "",
    title: "",
    description: "",
    category: "General",
    value: "",
    type: "text",
    status: "active",
    visibility: "private",
    options: [],
    tags: "",
    updatedByName: "",
    validateBeforeSave: true,
    publishOnSave: false,
  };
}

function createDefaultEditViewState() {
  return {
    form: createDefaultSaveDraft(),
    errors: {},
    submitting: false,
    serverError: "",
    savedSettingId: "",
    successMessage: "",
  };
}

function createInitialAjustesState() {
  return {
    hydrated: false,
    loading: false,
    refreshing: false,
    loaded: false,

    saving: false,
    openingSettingId: "",

    error: "",

    items: [],
    remoteCount: 0,
    lastSyncAt: 0,

    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,

    requestId: 0,

    saveDraft: createDefaultSaveDraft(),
    editView: createDefaultEditViewState(),
  };
}

/* =========================================================
   STATE
========================================================= */

export const ajustesState = createInitialAjustesState();

let inflightLoad = null;

/* =========================================================
   INTERNAL
========================================================= */

function touchRequestId() {
  ajustesState.requestId += 1;
  return ajustesState.requestId;
}

function normalizeSaveDraft(value = {}) {
  const draft = safeObject(value);
  const base = createDefaultSaveDraft();

  return {
    ...base,
    ...draft,
    settingId: safeText(draft.settingId, base.settingId),
    key: safeText(draft.key, base.key),
    title: safeText(draft.title, base.title),
    description: safeText(draft.description, base.description),
    category: safeText(draft.category, base.category),
    type: safeText(draft.type, base.type),
    status: safeText(draft.status, base.status),
    visibility: safeText(draft.visibility, base.visibility),
    options: safeArray(draft.options),
    tags: safeText(draft.tags, base.tags),
    updatedByName: safeText(draft.updatedByName, base.updatedByName),
    validateBeforeSave: safeBoolean(
      draft.validateBeforeSave,
      base.validateBeforeSave
    ),
    publishOnSave: safeBoolean(
      draft.publishOnSave,
      base.publishOnSave
    ),
  };
}

function normalizeEditViewState(value = {}) {
  const state = safeObject(value);
  const base = createDefaultEditViewState();

  return {
    form: normalizeSaveDraft(
      firstDefined(state.form, base.form)
    ),
    errors: safeObject(state.errors),
    submitting: safeBoolean(
      state.submitting,
      base.submitting
    ),
    serverError: safeText(
      state.serverError,
      base.serverError
    ),
    savedSettingId: safeText(
      state.savedSettingId,
      base.savedSettingId
    ),
    successMessage: safeText(
      state.successMessage,
      base.successMessage
    ),
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

export function resetAjustesState() {
  const next = createInitialAjustesState();

  Object.assign(ajustesState, next);

  inflightLoad = null;

  return ajustesState;
}

/* =========================================================
   FLAGS
========================================================= */

export function setLoading(value) {
  ajustesState.loading = Boolean(value);

  if (ajustesState.loading) {
    touchRequestId();
  }

  return ajustesState.loading;
}

export function setRefreshing(value) {
  ajustesState.refreshing = Boolean(value);
  return ajustesState.refreshing;
}

export function setLoaded(value) {
  ajustesState.loaded = Boolean(value);
  return ajustesState.loaded;
}

export function setHydrated(value) {
  ajustesState.hydrated = Boolean(value);
  return ajustesState.hydrated;
}

export function setSaving(value) {
  ajustesState.saving = Boolean(value);
  return ajustesState.saving;
}

export function setOpeningSettingId(value = "") {
  ajustesState.openingSettingId = safeText(value, "");
  return ajustesState.openingSettingId;
}

/* =========================================================
   PAGINATION
========================================================= */

export function setPage(value = 1) {
  ajustesState.page = Math.max(1, safeNumber(value, 1));
  return ajustesState.page;
}

export function setPageSize(value = DEFAULT_PAGE_SIZE) {
  ajustesState.pageSize = Math.max(
    1,
    safeNumber(value, DEFAULT_PAGE_SIZE)
  );
  return ajustesState.pageSize;
}

/* =========================================================
   DATA
========================================================= */

export function setItems(items = []) {
  const list = safeArray(items);

  ajustesState.items = list;
  ajustesState.loaded = true;
  ajustesState.error = "";

  ajustesState.remoteCount = Math.max(
    safeNumber(ajustesState.remoteCount, 0),
    list.length
  );

  return list;
}

export function getItems() {
  return safeArray(ajustesState.items);
}

export function clearItems() {
  ajustesState.items = [];
  ajustesState.remoteCount = 0;
  ajustesState.page = 1;

  return ajustesState.items;
}

export function setRemoteCount(value = 0) {
  ajustesState.remoteCount = Math.max(0, safeNumber(value, 0));
  return ajustesState.remoteCount;
}

/* =========================================================
   META
========================================================= */

export function setError(value = null) {
  ajustesState.error = value ? String(value).trim() : "";
  return ajustesState.error;
}

export function clearError() {
  ajustesState.error = "";
  return ajustesState.error;
}

export function setLastSyncAt(value = 0) {
  ajustesState.lastSyncAt = safeNumber(value, 0);
  return ajustesState.lastSyncAt;
}

/* =========================================================
   SAVE DRAFT
========================================================= */

export function setSaveDraft(value = {}) {
  ajustesState.saveDraft = normalizeSaveDraft(value);
  return ajustesState.saveDraft;
}

export function patchSaveDraft(patch = {}) {
  ajustesState.saveDraft = normalizeSaveDraft({
    ...safeObject(ajustesState.saveDraft),
    ...safeObject(patch),
  });

  return ajustesState.saveDraft;
}

export function clearSaveDraft() {
  ajustesState.saveDraft = createDefaultSaveDraft();
  return ajustesState.saveDraft;
}

/* =========================================================
   EDIT VIEW STATE
========================================================= */

export function setEditViewState(value = {}) {
  ajustesState.editView = normalizeEditViewState(value);
  return ajustesState.editView;
}

export function patchEditViewState(patch = {}) {
  const current = normalizeEditViewState(ajustesState.editView);
  const nextPatch = safeObject(patch);

  ajustesState.editView = normalizeEditViewState({
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

  return ajustesState.editView;
}

export function setEditViewForm(form = {}) {
  const current = normalizeEditViewState(ajustesState.editView);

  ajustesState.editView = {
    ...current,
    form: normalizeSaveDraft(form),
  };

  return ajustesState.editView.form;
}

export function patchEditViewForm(patch = {}) {
  const current = normalizeEditViewState(ajustesState.editView);

  ajustesState.editView = {
    ...current,
    form: normalizeSaveDraft({
      ...current.form,
      ...safeObject(patch),
    }),
  };

  return ajustesState.editView.form;
}

export function setEditViewErrors(errors = {}) {
  const current = normalizeEditViewState(ajustesState.editView);

  ajustesState.editView = {
    ...current,
    errors: safeObject(errors),
  };

  return ajustesState.editView.errors;
}

export function clearEditViewErrors() {
  return setEditViewErrors({});
}

export function setEditViewSubmitting(value = false) {
  const current = normalizeEditViewState(ajustesState.editView);

  ajustesState.editView = {
    ...current,
    submitting: Boolean(value),
  };

  return ajustesState.editView.submitting;
}

export function setEditViewServerError(value = "") {
  const current = normalizeEditViewState(ajustesState.editView);

  ajustesState.editView = {
    ...current,
    serverError: safeText(value, ""),
  };

  return ajustesState.editView.serverError;
}

export function setEditViewSuccess({
  savedSettingId = "",
  successMessage = "",
} = {}) {
  const current = normalizeEditViewState(ajustesState.editView);

  ajustesState.editView = {
    ...current,
    savedSettingId: safeText(savedSettingId, ""),
    successMessage: safeText(successMessage, ""),
  };

  return ajustesState.editView;
}

export function clearEditViewSuccess() {
  return setEditViewSuccess({
    savedSettingId: "",
    successMessage: "",
  });
}

export function resetEditViewState() {
  ajustesState.editView = createDefaultEditViewState();
  return ajustesState.editView;
}

/* =========================================================
   CACHE HELPERS
========================================================= */

export function getCachePayload() {
  return {
    savedAt: Date.now(),
    items: getItems(),
    remoteCount: ajustesState.remoteCount,
    lastSyncAt: ajustesState.lastSyncAt,
    page: ajustesState.page,
    pageSize: ajustesState.pageSize,
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

export function getAjustesStateSnapshot() {
  const editView = normalizeEditViewState(ajustesState.editView);

  return {
    hydrated: ajustesState.hydrated,
    loading: ajustesState.loading,
    refreshing: ajustesState.refreshing,
    loaded: ajustesState.loaded,

    saving: ajustesState.saving,
    openingSettingId: ajustesState.openingSettingId,

    error: ajustesState.error,

    total: safeArray(ajustesState.items).length,
    remoteCount: ajustesState.remoteCount,
    lastSyncAt: ajustesState.lastSyncAt,

    page: ajustesState.page,
    pageSize: ajustesState.pageSize,

    requestId: ajustesState.requestId,
    hasInflight: Boolean(inflightLoad),

    saveDraft: {
      ...safeObject(ajustesState.saveDraft),
    },

    editView: {
      submitting: editView.submitting,
      serverError: editView.serverError,
      savedSettingId: editView.savedSettingId,
      successMessage: editView.successMessage,
      errorCount: Object.keys(safeObject(editView.errors)).length,
      hasDraftKey: Boolean(safeText(editView?.form?.key, "")),
      hasDraftValue: Boolean(
        safeText(editView?.form?.value, "") ||
        typeof editView?.form?.value === "boolean" ||
        typeof editView?.form?.value === "number"
      ),
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
  ajustesState,

  getInflightLoad,
  setInflightLoad,
  clearInflightLoad,

  resetAjustesState,

  setLoading,
  setRefreshing,
  setLoaded,
  setHydrated,
  setSaving,
  setOpeningSettingId,

  setPage,
  setPageSize,

  setItems,
  getItems,
  clearItems,
  setRemoteCount,

  setError,
  clearError,
  setLastSyncAt,

  setSaveDraft,
  patchSaveDraft,
  clearSaveDraft,

  setEditViewState,
  patchEditViewState,
  setEditViewForm,
  patchEditViewForm,
  setEditViewErrors,
  clearEditViewErrors,
  setEditViewSubmitting,
  setEditViewServerError,
  setEditViewSuccess,
  clearEditViewSuccess,
  resetEditViewState,

  getCachePayload,
  isCacheFresh,
  getAjustesStateSnapshot,
};
