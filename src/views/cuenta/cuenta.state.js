/* =========================================================
   Onion SPA - Cuenta State
   Archivo: src/views/cuenta/cuenta.state.js

   FINAL PRO SYSTEM · STATE LAYER · 10/10

   RESPONSABILIDADES:
   - estado local centralizado del módulo cuenta
   - loading / refresh / save
   - errores
   - cache temporal
   - request inflight
   - draft de preferencias
   - compatibilidad View / API / Bindings / Modal

   HARDENING PRO:
   - setters robustos
   - no loading infinito
   - estado preparado para single resource
   - estado preparado para edición inline
   - cache helpers
   - snapshot debug
========================================================= */

export const CACHE_KEY = "cuenta.cache";
export const CACHE_TTL = 1000 * 60 * 3; // 3 min
export const DEFAULT_PAGE_SIZE = 1;

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

function createDefaultCuentaDraft() {
  return {
    darkMode: true,
    privacyMode: false,
  };
}

function createDefaultCuentaViewState() {
  return {
    form: createDefaultCuentaDraft(),
    errors: {},
    submitting: false,
    serverError: "",
    successMessage: "",
    updatedAt: "",
  };
}

function createInitialCuentaState() {
  return {
    hydrated: false,
    loading: false,
    refreshing: false,
    loaded: false,
    saving: false,

    error: "",

    item: null,
    lastSyncAt: 0,

    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,

    requestId: 0,

    draft: createDefaultCuentaDraft(),
    view: createDefaultCuentaViewState(),
    meta: null,
  };
}

/* =========================================================
   STATE
========================================================= */

export const cuentaState = createInitialCuentaState();

let inflightLoad = null;
let inflightSave = null;

/* =========================================================
   INTERNAL
========================================================= */

function touchRequestId() {
  cuentaState.requestId += 1;
  return cuentaState.requestId;
}

function normalizeCuentaDraft(value = {}) {
  const draft = safeObject(value);
  const base = createDefaultCuentaDraft();

  return {
    ...base,
    ...draft,
    darkMode: safeBoolean(draft.darkMode, base.darkMode),
    privacyMode: safeBoolean(draft.privacyMode, base.privacyMode),
  };
}

function normalizeCuentaViewState(value = {}) {
  const state = safeObject(value);
  const base = createDefaultCuentaViewState();

  return {
    form: normalizeCuentaDraft(firstDefined(state.form, base.form)),
    errors: safeObject(state.errors),
    submitting: safeBoolean(state.submitting, base.submitting),
    serverError: safeText(state.serverError, base.serverError),
    successMessage: safeText(state.successMessage, base.successMessage),
    updatedAt: safeText(state.updatedAt, base.updatedAt),
  };
}

function normalizeCuentaItem(value = null) {
  if (!value) {
    return null;
  }

  const item = safeObject(value);

  const darkMode =
    typeof item.darkMode === "boolean"
      ? item.darkMode
      : true;

  const privacyMode =
    typeof item.privacyMode === "boolean"
      ? item.privacyMode
      : false;

  return {
    ...item,
    darkMode,
    privacyMode,
    theme: darkMode ? "dark" : "light",
    updatedAt: safeText(
      firstDefined(item.updatedAt, item.updated_at, ""),
      ""
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

export function getInflightSave() {
  return inflightSave;
}

export function setInflightSave(value) {
  inflightSave = value || null;
  return inflightSave;
}

export function clearInflightSave() {
  inflightSave = null;
  return inflightSave;
}

/* =========================================================
   RESET
========================================================= */

export function resetCuentaState() {
  const next = createInitialCuentaState();

  Object.assign(cuentaState, next);

  inflightLoad = null;
  inflightSave = null;

  return cuentaState;
}

/* =========================================================
   FLAGS
========================================================= */

export function setLoading(value) {
  cuentaState.loading = Boolean(value);

  if (cuentaState.loading) {
    touchRequestId();
  }

  return cuentaState.loading;
}

export function setRefreshing(value) {
  cuentaState.refreshing = Boolean(value);
  return cuentaState.refreshing;
}

export function setLoaded(value) {
  cuentaState.loaded = Boolean(value);
  return cuentaState.loaded;
}

export function setHydrated(value) {
  cuentaState.hydrated = Boolean(value);
  return cuentaState.hydrated;
}

export function setSaving(value) {
  cuentaState.saving = Boolean(value);

  if (cuentaState.saving) {
    touchRequestId();
  }

  return cuentaState.saving;
}

/* =========================================================
   PAGINATION
========================================================= */

export function setPage(value = 1) {
  cuentaState.page = Math.max(1, safeNumber(value, 1));
  return cuentaState.page;
}

export function setPageSize(value = DEFAULT_PAGE_SIZE) {
  cuentaState.pageSize = Math.max(1, safeNumber(value, DEFAULT_PAGE_SIZE));
  return cuentaState.pageSize;
}

/* =========================================================
   DATA
========================================================= */

export function setItem(item = null) {
  const normalized = normalizeCuentaItem(item);

  cuentaState.item = normalized;
  cuentaState.loaded = true;
  cuentaState.error = "";

  if (normalized) {
    cuentaState.draft = normalizeCuentaDraft({
      darkMode: normalized.darkMode,
      privacyMode: normalized.privacyMode,
    });

    cuentaState.view = normalizeCuentaViewState({
      ...cuentaState.view,
      form: {
        darkMode: normalized.darkMode,
        privacyMode: normalized.privacyMode,
      },
      updatedAt: safeText(normalized.updatedAt, ""),
    });
  }

  return cuentaState.item;
}

export function getItem() {
  return normalizeCuentaItem(cuentaState.item);
}

export function clearItem() {
  cuentaState.item = null;
  cuentaState.page = 1;

  return cuentaState.item;
}

/* =========================================================
   META
========================================================= */

export function setMeta(value = null) {
  cuentaState.meta = value ? safeObject(value) : null;
  return cuentaState.meta;
}

export function clearMeta() {
  cuentaState.meta = null;
  return cuentaState.meta;
}

/* =========================================================
   ERROR / SYNC
========================================================= */

export function setError(value = null) {
  cuentaState.error = value ? String(value).trim() : "";
  return cuentaState.error;
}

export function clearError() {
  cuentaState.error = "";
  return cuentaState.error;
}

export function setLastSyncAt(value = 0) {
  cuentaState.lastSyncAt = safeNumber(value, 0);
  return cuentaState.lastSyncAt;
}

/* =========================================================
   DRAFT
========================================================= */

export function setDraft(value = {}) {
  cuentaState.draft = normalizeCuentaDraft(value);
  return cuentaState.draft;
}

export function patchDraft(patch = {}) {
  cuentaState.draft = normalizeCuentaDraft({
    ...safeObject(cuentaState.draft),
    ...safeObject(patch),
  });

  return cuentaState.draft;
}

export function clearDraft() {
  cuentaState.draft = createDefaultCuentaDraft();
  return cuentaState.draft;
}

export function syncDraftFromItem() {
  const item = getItem();

  if (!item) {
    return clearDraft();
  }

  cuentaState.draft = normalizeCuentaDraft({
    darkMode: item.darkMode,
    privacyMode: item.privacyMode,
  });

  return cuentaState.draft;
}

/* =========================================================
   VIEW STATE
========================================================= */

export function setViewState(value = {}) {
  cuentaState.view = normalizeCuentaViewState(value);
  return cuentaState.view;
}

export function patchViewState(patch = {}) {
  const current = normalizeCuentaViewState(cuentaState.view);
  const nextPatch = safeObject(patch);

  cuentaState.view = normalizeCuentaViewState({
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

  return cuentaState.view;
}

export function setViewForm(form = {}) {
  const current = normalizeCuentaViewState(cuentaState.view);

  cuentaState.view = {
    ...current,
    form: normalizeCuentaDraft(form),
  };

  return cuentaState.view.form;
}

export function patchViewForm(patch = {}) {
  const current = normalizeCuentaViewState(cuentaState.view);

  cuentaState.view = {
    ...current,
    form: normalizeCuentaDraft({
      ...current.form,
      ...safeObject(patch),
    }),
  };

  return cuentaState.view.form;
}

export function setViewErrors(errors = {}) {
  const current = normalizeCuentaViewState(cuentaState.view);

  cuentaState.view = {
    ...current,
    errors: safeObject(errors),
  };

  return cuentaState.view.errors;
}

export function clearViewErrors() {
  return setViewErrors({});
}

export function setViewSubmitting(value = false) {
  const current = normalizeCuentaViewState(cuentaState.view);

  cuentaState.view = {
    ...current,
    submitting: Boolean(value),
  };

  return cuentaState.view.submitting;
}

export function setViewServerError(value = "") {
  const current = normalizeCuentaViewState(cuentaState.view);

  cuentaState.view = {
    ...current,
    serverError: safeText(value, ""),
  };

  return cuentaState.view.serverError;
}

export function setViewSuccess({
  successMessage = "",
  updatedAt = "",
} = {}) {
  const current = normalizeCuentaViewState(cuentaState.view);

  cuentaState.view = {
    ...current,
    successMessage: safeText(successMessage, ""),
    updatedAt: safeText(updatedAt, current.updatedAt),
  };

  return cuentaState.view;
}

export function clearViewSuccess() {
  return setViewSuccess({
    successMessage: "",
    updatedAt: "",
  });
}

export function resetViewState() {
  cuentaState.view = createDefaultCuentaViewState();
  return cuentaState.view;
}

export function syncViewFormFromItem() {
  const item = getItem();

  if (!item) {
    cuentaState.view = normalizeCuentaViewState({
      ...cuentaState.view,
      form: createDefaultCuentaDraft(),
      updatedAt: "",
    });

    return cuentaState.view.form;
  }

  cuentaState.view = normalizeCuentaViewState({
    ...cuentaState.view,
    form: {
      darkMode: item.darkMode,
      privacyMode: item.privacyMode,
    },
    updatedAt: safeText(item.updatedAt, ""),
  });

  return cuentaState.view.form;
}

/* =========================================================
   CACHE HELPERS
========================================================= */

export function getCachePayload() {
  return {
    savedAt: Date.now(),
    item: getItem(),
    lastSyncAt: cuentaState.lastSyncAt,
    page: cuentaState.page,
    pageSize: cuentaState.pageSize,
    meta: cuentaState.meta ? { ...safeObject(cuentaState.meta) } : null,
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

export function getCuentaStateSnapshot() {
  const view = normalizeCuentaViewState(cuentaState.view);
  const item = getItem();

  return {
    hydrated: cuentaState.hydrated,
    loading: cuentaState.loading,
    refreshing: cuentaState.refreshing,
    loaded: cuentaState.loaded,
    saving: cuentaState.saving,

    error: cuentaState.error,

    hasItem: Boolean(item),
    lastSyncAt: cuentaState.lastSyncAt,

    page: cuentaState.page,
    pageSize: cuentaState.pageSize,

    requestId: cuentaState.requestId,
    hasInflightLoad: Boolean(inflightLoad),
    hasInflightSave: Boolean(inflightSave),

    draft: {
      ...safeObject(cuentaState.draft),
    },

    view: {
      submitting: view.submitting,
      serverError: view.serverError,
      successMessage: view.successMessage,
      updatedAt: view.updatedAt,
      errorCount: Object.keys(safeObject(view.errors)).length,
      darkMode: safeBoolean(view?.form?.darkMode, true),
      privacyMode: safeBoolean(view?.form?.privacyMode, false),
    },

    item: item
      ? {
          darkMode: Boolean(item.darkMode),
          privacyMode: Boolean(item.privacyMode),
          theme: safeText(item.theme, "dark"),
          updatedAt: safeText(item.updatedAt, ""),
        }
      : null,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  CACHE_KEY,
  CACHE_TTL,
  DEFAULT_PAGE_SIZE,
  cuentaState,

  getInflightLoad,
  setInflightLoad,
  clearInflightLoad,

  getInflightSave,
  setInflightSave,
  clearInflightSave,

  resetCuentaState,

  setLoading,
  setRefreshing,
  setLoaded,
  setHydrated,
  setSaving,

  setPage,
  setPageSize,

  setItem,
  getItem,
  clearItem,

  setMeta,
  clearMeta,

  setError,
  clearError,
  setLastSyncAt,

  setDraft,
  patchDraft,
  clearDraft,
  syncDraftFromItem,

  setViewState,
  patchViewState,
  setViewForm,
  patchViewForm,
  setViewErrors,
  clearViewErrors,
  setViewSubmitting,
  setViewServerError,
  setViewSuccess,
  clearViewSuccess,
  resetViewState,
  syncViewFormFromItem,

  getCachePayload,
  isCacheFresh,
  getCuentaStateSnapshot,
};
