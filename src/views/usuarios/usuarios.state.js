/* =========================================================
   Onion SPA - Usuarios State
   Archivo: src/views/usuarios/usuarios.state.js

   FINAL PRO SYSTEM · STATE LAYER · ADMIN USERS · 10/10

   RESPONSABILIDADES:
   - estado local centralizado del módulo usuarios
   - loading / refresh / create / open detail
   - errores
   - cache temporal
   - request inflight
   - draft de creación
   - compatibilidad View / API / Actions / Modal
   - paginación fija preparada para 5 usuarios por hoja
   - flags de acceso admin para fail-safe visual

   HARDENING PRO:
   - setters robustos
   - no loading infinito
   - hydrated coherente tras setItems / setLoaded
   - lastSyncAt compatible con timestamp e ISO string
   - estado preparado para paginación
   - estado preparado para create view
   - cache helpers completos
   - snapshot debug completo
========================================================= */

export const CACHE_KEY = "usuarios.cache";
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
    username: "",
    name: "",
    email: "",
    phone: "",

    city: "",
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

    /*
      Fail-safe visual.
      El bloqueo real debe vivir en router/guards.
    */
    isAdmin: false,
    admin: false,
    canManageUsers: false,
    canAccessUsers: false,
    forbidden: false,
    accessDenied: false,
    role: "",
    roles: [],

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
   INTERNAL NORMALIZERS
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

    username: safeText(draft.username, base.username),
    name: safeText(draft.name, base.name),
    email: safeText(draft.email, base.email),
    phone: safeText(draft.phone, base.phone),

    city: safeText(draft.city, base.city),
    role: safeText(draft.role, base.role),
    status: safeText(draft.status, base.status),

    notes: safeText(draft.notes, base.notes),
    source: safeText(draft.source, base.source),
    tags: safeText(draft.tags, base.tags),

    notifyUser: safeBoolean(draft.notifyUser, base.notifyUser),
    internalOnly: safeBoolean(draft.internalOnly, base.internalOnly),
    sendInvite: safeBoolean(draft.sendInvite, base.sendInvite),
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
    createdUserId: safeText(state.createdUserId, base.createdUserId),
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
    safeNumber(usuariosState.remoteCount, 0),
    safeArray(usuariosState.items).length
  );

  /*
    La vista de usuarios queda fijada a 5.
    Se mantiene como state para que template/api/actions tengan una fuente estable.
  */
  usuariosState.pageSize = Math.max(
    1,
    safeNumber(usuariosState.pageSize, DEFAULT_PAGE_SIZE)
  );

  usuariosState.page = clampPage(
    usuariosState.page,
    total,
    usuariosState.pageSize
  );

  return {
    page: usuariosState.page,
    pageSize: usuariosState.pageSize,
    total,
    totalPages: getTotalPages(total, usuariosState.pageSize),
  };
}

function markLoaded() {
  usuariosState.loaded = true;
  usuariosState.hydrated = true;
  usuariosState.loading = false;
  usuariosState.refreshing = false;

  return usuariosState;
}

function markIdle() {
  usuariosState.loading = false;
  usuariosState.refreshing = false;

  return usuariosState;
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
    usuariosState.refreshing = false;
    touchRequestId();
  }

  return usuariosState.loading;
}

export function setRefreshing(value) {
  usuariosState.refreshing = Boolean(value);

  if (usuariosState.refreshing) {
    usuariosState.loading = false;
    touchRequestId();
  }

  return usuariosState.refreshing;
}

export function setLoaded(value) {
  usuariosState.loaded = Boolean(value);

  if (usuariosState.loaded) {
    usuariosState.hydrated = true;
    usuariosState.loading = false;
    usuariosState.refreshing = false;
  }

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
   ADMIN / ACCESS FLAGS
========================================================= */

export function setAdminAccess(value = false) {
  const allowed = Boolean(value);

  usuariosState.isAdmin = allowed;
  usuariosState.admin = allowed;
  usuariosState.canManageUsers = allowed;
  usuariosState.canAccessUsers = allowed;
  usuariosState.forbidden = !allowed;
  usuariosState.accessDenied = !allowed;

  return allowed;
}

export function setAccessDenied(value = true) {
  const denied = Boolean(value);

  usuariosState.accessDenied = denied;
  usuariosState.forbidden = denied;

  if (denied) {
    usuariosState.isAdmin = false;
    usuariosState.admin = false;
    usuariosState.canManageUsers = false;
    usuariosState.canAccessUsers = false;
  }

  return denied;
}

export function setRole(value = "") {
  usuariosState.role = safeText(value, "");
  return usuariosState.role;
}

export function setRoles(value = []) {
  usuariosState.roles = safeArray(value).map((item) => safeText(item, "")).filter(Boolean);
  return usuariosState.roles;
}

/* =========================================================
   PAGINATION
========================================================= */

export function setPage(value = 1) {
  usuariosState.page = Math.max(1, safeNumber(value, 1));
  normalizePageState();

  return usuariosState.page;
}

export function setPageSize(value = DEFAULT_PAGE_SIZE) {
  usuariosState.pageSize = Math.max(
    1,
    safeNumber(value, DEFAULT_PAGE_SIZE)
  );

  normalizePageState();

  return usuariosState.pageSize;
}

export function resetPagination() {
  usuariosState.page = 1;
  usuariosState.pageSize = DEFAULT_PAGE_SIZE;

  normalizePageState();

  return getPaginationState();
}

export function getPaginationState() {
  const total = Math.max(
    safeNumber(usuariosState.remoteCount, 0),
    safeArray(usuariosState.items).length
  );

  const pageSize = Math.max(
    1,
    safeNumber(usuariosState.pageSize, DEFAULT_PAGE_SIZE)
  );

  const totalPages = getTotalPages(total, pageSize);
  const page = clampPage(usuariosState.page, total, pageSize);

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

  usuariosState.items = list;
  usuariosState.error = "";

  if (hasOwn(opts, "remoteCount")) {
    usuariosState.remoteCount = Math.max(
      0,
      safeNumber(opts.remoteCount, list.length)
    );
  } else {
    usuariosState.remoteCount = Math.max(
      safeNumber(usuariosState.remoteCount, 0),
      list.length
    );
  }

  markLoaded();
  normalizePageState();

  return usuariosState.items;
}

export function getItems() {
  return safeArray(usuariosState.items);
}

export function getItemsCount() {
  return getItems().length;
}

export function hasItems() {
  return getItemsCount() > 0;
}

export function clearItems() {
  usuariosState.items = [];
  usuariosState.remoteCount = 0;
  usuariosState.page = 1;

  return usuariosState.items;
}

export function setRemoteCount(value = 0) {
  usuariosState.remoteCount = Math.max(0, safeNumber(value, 0));
  normalizePageState();

  return usuariosState.remoteCount;
}

/* =========================================================
   META
========================================================= */

export function setError(value = null) {
  usuariosState.error = value ? String(value).trim() : "";

  if (usuariosState.error) {
    markIdle();
  }

  return usuariosState.error;
}

export function clearError() {
  usuariosState.error = "";
  return usuariosState.error;
}

export function setLastSyncAt(value = 0) {
  usuariosState.lastSyncAt = safeTimestamp(value, 0);
  return usuariosState.lastSyncAt;
}

export function touchLastSyncAt() {
  usuariosState.lastSyncAt = Date.now();
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

  const nextForm = hasOwn(nextPatch, "form")
    ? normalizeCreateDraft({
        ...current.form,
        ...safeObject(nextPatch.form),
      })
    : current.form;

  const nextErrors = hasOwn(nextPatch, "errors")
    ? safeObject(nextPatch.errors)
    : current.errors;

  usuariosState.createView = normalizeCreateViewState({
    ...current,
    ...nextPatch,
    form: nextForm,
    errors: nextErrors,
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

export function patchCreateViewErrors(patch = {}) {
  const current = normalizeCreateViewState(usuariosState.createView);

  usuariosState.createView = {
    ...current,
    errors: {
      ...safeObject(current.errors),
      ...safeObject(patch),
    },
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

export function clearCreateViewServerError() {
  return setCreateViewServerError("");
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

    isAdmin: usuariosState.isAdmin,
    canManageUsers: usuariosState.canManageUsers,
    canAccessUsers: usuariosState.canAccessUsers,
    role: usuariosState.role,
    roles: usuariosState.roles,
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

  usuariosState.items = normalizeItems(payload.items);

  usuariosState.remoteCount = Math.max(
    safeNumber(payload.remoteCount, usuariosState.items.length),
    usuariosState.items.length
  );

  usuariosState.lastSyncAt = safeTimestamp(payload.lastSyncAt, 0);
  usuariosState.page = Math.max(1, safeNumber(payload.page, 1));
  usuariosState.pageSize = Math.max(
    1,
    safeNumber(payload.pageSize, DEFAULT_PAGE_SIZE)
  );

  usuariosState.isAdmin = safeBoolean(payload.isAdmin, usuariosState.isAdmin);
  usuariosState.canManageUsers = safeBoolean(payload.canManageUsers, usuariosState.canManageUsers);
  usuariosState.canAccessUsers = safeBoolean(payload.canAccessUsers, usuariosState.canAccessUsers);
  usuariosState.admin = usuariosState.isAdmin;
  usuariosState.forbidden = false;
  usuariosState.accessDenied = false;

  usuariosState.role = safeText(payload.role, usuariosState.role);
  usuariosState.roles = safeArray(payload.roles).map((item) => safeText(item, "")).filter(Boolean);

  clearError();
  markLoaded();
  normalizePageState();

  return true;
}

/* =========================================================
   DEBUG
========================================================= */

export function getUsuariosStateSnapshot() {
  const createView = normalizeCreateViewState(usuariosState.createView);
  const pagination = getPaginationState();

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

    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: pagination.totalPages,
    from: pagination.from,
    to: pagination.to,

    requestId: usuariosState.requestId,
    hasInflight: Boolean(inflightLoad),

    isAdmin: usuariosState.isAdmin,
    admin: usuariosState.admin,
    canManageUsers: usuariosState.canManageUsers,
    canAccessUsers: usuariosState.canAccessUsers,
    forbidden: usuariosState.forbidden,
    accessDenied: usuariosState.accessDenied,
    role: usuariosState.role,
    roles: safeArray(usuariosState.roles),

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
      hasDraftEmail: Boolean(safeText(createView?.form?.email, "")),
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

  setAdminAccess,
  setAccessDenied,
  setRole,
  setRoles,

  setPage,
  setPageSize,
  resetPagination,
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

  getUsuariosStateSnapshot,
};
