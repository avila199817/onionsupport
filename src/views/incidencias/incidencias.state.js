/* =========================================================
   Onion Support - Incidencias State
   Archivo: /src/views/incidencias/incidencias.state.js

   Responsabilidad:
   - Estado local del módulo Incidencias.
   - Flags de carga/refresco/creación/detalle/mutación.
   - Filtros, sort, scroll incremental y cache temporal.
   - Compatibilidad legacy con page/pageSize sin paginación visual real.
   - Helpers de estado usados por View/API/Actions/Modal.
   - No importar AppCore.
   - No tocar DOM.
   - No llamar APIs.
   - No registrar eventos.
   - No duplicar lógica de modelo, vista ni bindings.
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const CACHE_KEY = "incidencias.cache";
export const CACHE_VERSION = 4;
export const CACHE_TTL = 1000 * 60 * 3;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 500;

export const DEFAULT_INITIAL_VISIBLE_COUNT = 20;
export const DEFAULT_LOAD_MORE_BATCH = 20;
export const MAX_VISIBLE_COUNT = 10000;

export const DEFAULT_SORT = "updated_desc";
export const DEFAULT_LIST_FILTER = "all";

export const DEFAULT_FILTERS = Object.freeze({
  q: "",
  search: "",
  query: "",

  filter: DEFAULT_LIST_FILTER,
  activeFilter: DEFAULT_LIST_FILTER,
  statusFilter: DEFAULT_LIST_FILTER,

  status: "",
  estado: "",

  priority: "",
  prioridad: "",

  categoria: "",
  category: "",
  tipo: "",

  assigned: "",
  closed: null,

  active: false,
  withAttachments: false,
  withComments: false,
  withInvoices: false,
});

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (["true", "1", "yes", "y", "si", "sí", "on"].includes(key)) return true;
    if (["false", "0", "no", "n", "off"].includes(key)) return false;
  }

  return fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    return value;
  }

  return null;
}

function hasOwn(object = {}, key = "") {
  return Object.prototype.hasOwnProperty.call(safeObject(object), key);
}

function clamp(value = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Math.min(
    Math.max(safeNumber(value, min), min),
    max
  );
}

function now() {
  return Date.now();
}

function safeTimestamp(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  const direct = Number(value);

  if (Number.isFinite(direct) && direct > 0) {
    return direct > 9999999999 ? direct : direct * 1000;
  }

  const date = new Date(value);
  const timestamp = date.getTime();

  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : fallback;
}

function normalizeTextKey(value = "") {
  return safeLower(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function canUseLocalStorage() {
  try {
    return typeof localStorage !== "undefined" && Boolean(localStorage);
  } catch {
    return false;
  }
}

/* =========================================================
   NORMALIZERS
========================================================= */

function normalizeListFilter(value = DEFAULT_LIST_FILTER) {
  const key = normalizeTextKey(value || DEFAULT_LIST_FILTER);

  const map = {
    all: "all",
    todo: "all",
    todos: "all",
    todas: "all",
    total: "all",
    totales: "all",

    open: "open",
    opened: "open",
    active: "open",
    pending: "open",
    progress: "open",
    in_progress: "open",
    inprogress: "open",
    pendiente: "open",
    pendientes: "open",
    abierta: "open",
    abiertas: "open",
    abierto: "open",
    abiertos: "open",
    proceso: "open",
    en_proceso: "open",

    closed: "closed",
    close: "closed",
    resolved: "closed",
    solved: "closed",
    archived: "closed",
    cancelled: "closed",
    canceled: "closed",
    cerrada: "closed",
    cerradas: "closed",
    cerrado: "closed",
    cerrados: "closed",
    resuelta: "closed",
    resueltas: "closed",
    resuelto: "closed",
    resueltos: "closed",
  };

  return map[key] || DEFAULT_LIST_FILTER;
}

function normalizeStatus(value = "open") {
  const key = normalizeTextKey(value || "open");

  const map = {
    open: "open",
    opened: "open",
    abierta: "open",
    abierto: "open",

    pending: "pending",
    pendiente: "pending",

    progress: "in_progress",
    in_progress: "in_progress",
    inprogress: "in_progress",
    en_proceso: "in_progress",
    en_curso: "in_progress",
    proceso: "in_progress",

    resolved: "resolved",
    resuelta: "resolved",
    resuelto: "resolved",

    closed: "closed",
    cerrada: "closed",
    cerrado: "closed",
  };

  return map[key] || key || "open";
}

function normalizePriority(value = "medium") {
  const key = normalizeTextKey(value || "medium");

  const map = {
    low: "low",
    baja: "low",

    medium: "medium",
    media: "medium",
    normal: "medium",

    high: "high",
    alta: "high",

    urgent: "urgent",
    urgente: "urgent",
    critical: "urgent",
    critica: "urgent",
    crítico: "urgent",
    critico: "urgent",
  };

  return map[key] || "medium";
}

function normalizeFilters(value = {}) {
  const filters = safeObject(value);
  const query = safeText(first(filters.q, filters.search, filters.query, ""), "");
  const listFilter = normalizeListFilter(
    first(filters.activeFilter, filters.filter, filters.statusFilter, DEFAULT_LIST_FILTER)
  );

  return {
    ...DEFAULT_FILTERS,
    ...filters,

    q: query,
    search: query,
    query,

    filter: listFilter,
    activeFilter: listFilter,
    statusFilter: listFilter,

    status: safeText(filters.status, ""),
    estado: safeText(first(filters.estado, filters.status, ""), ""),

    priority: safeText(filters.priority, ""),
    prioridad: safeText(first(filters.prioridad, filters.priority, ""), ""),

    categoria: safeText(first(filters.categoria, filters.category, filters.tipo, ""), ""),
    category: safeText(first(filters.category, filters.categoria, filters.tipo, ""), ""),
    tipo: safeText(first(filters.tipo, filters.categoria, filters.category, ""), ""),

    assigned: safeText(filters.assigned, ""),
    closed: filters.closed === null || filters.closed === undefined
      ? null
      : safeBoolean(filters.closed, false),

    active: safeBoolean(filters.active, false),
    withAttachments: safeBoolean(filters.withAttachments, false),
    withComments: safeBoolean(filters.withComments, false),
    withInvoices: safeBoolean(filters.withInvoices, false),
  };
}

function normalizeItems(items = []) {
  return safeArray(items).filter((item) => {
    return item && typeof item === "object" && !Array.isArray(item);
  });
}

function normalizeScrollMode(value = "infinite") {
  const key = normalizeTextKey(value || "infinite");

  if (["infinite", "scroll", "feed", "continuous", "continuo"].includes(key)) {
    return "infinite";
  }

  return "infinite";
}

/* =========================================================
   DEFAULTS
========================================================= */

function createDefaultCreateDraft() {
  return {
    subject: "",
    asunto: "",
    title: "",

    description: "",
    descripcion: "",
    message: "",

    priority: "medium",
    prioridad: "medium",

    status: "open",
    estado: "open",

    clientName: "",
    clientEmail: "",
    clienteId: "",
    userId: "",

    assignedTo: "",
    category: "",
    categoria: "",
    source: "panel",
    origen: "panel",
    tags: "",

    facturaId: "",
    invoiceId: "",
    numeroFacturaLegal: "",

    notifyClient: true,
    internalOnly: false,

    attachments: [],
  };
}

function normalizeCreateDraft(value = {}) {
  const draft = safeObject(value);
  const base = createDefaultCreateDraft();

  const subject = safeText(first(draft.subject, draft.asunto, draft.title), "");
  const description = safeText(
    first(draft.description, draft.descripcion, draft.message, draft.body, draft.preview),
    ""
  );
  const priority = normalizePriority(first(draft.priority, draft.prioridad, base.priority));
  const status = normalizeStatus(first(draft.status, draft.estado, base.status));
  const category = safeText(first(draft.category, draft.categoria, draft.tipo, base.category), "");
  const source = safeText(first(draft.source, draft.origen, base.source), base.source);

  return {
    ...base,
    ...draft,

    subject,
    asunto: subject,
    title: subject,

    description,
    descripcion: description,
    message: safeText(first(draft.message, description), description),

    priority,
    prioridad: priority,

    status,
    estado: status,

    clientName: safeText(
      first(draft.clientName, draft.clienteNombre, draft.name, draft.cliente?.name, draft.cliente?.nombre, ""),
      ""
    ),

    clientEmail: safeText(
      first(draft.clientEmail, draft.clienteEmail, draft.email, draft.cliente?.email, ""),
      ""
    ),

    clienteId: safeText(first(draft.clienteId, draft.cliente?.id, ""), ""),
    userId: safeText(first(draft.userId, draft.cliente?.userId, ""), ""),

    assignedTo: safeText(first(draft.assignedTo, draft.tecnico, ""), ""),

    category,
    categoria: category,

    source,
    origen: source,

    tags: Array.isArray(draft.tags)
      ? draft.tags.map((tag) => safeText(tag, "")).filter(Boolean).join(",")
      : safeText(draft.tags, ""),

    facturaId: safeText(first(draft.facturaId, draft.invoiceId, ""), ""),
    invoiceId: safeText(first(draft.invoiceId, draft.facturaId, ""), ""),
    numeroFacturaLegal: safeText(draft.numeroFacturaLegal, ""),

    notifyClient: safeBoolean(draft.notifyClient, true),
    internalOnly: safeBoolean(draft.internalOnly, false),

    attachments: safeArray(draft.attachments),
  };
}

function createDefaultCreateViewState() {
  return {
    form: createDefaultCreateDraft(),
    errors: {},
    touched: {},

    submitting: false,
    validating: false,

    serverError: "",
    createdTicketId: "",
    successMessage: "",

    startedAt: 0,
    submittedAt: 0,
    completedAt: 0,
  };
}

function normalizeCreateViewState(value = {}) {
  const state = safeObject(value);
  const base = createDefaultCreateViewState();

  return {
    form: normalizeCreateDraft(first(state.form, base.form)),

    errors: safeObject(state.errors),
    touched: safeObject(state.touched),

    submitting: safeBoolean(state.submitting, false),
    validating: safeBoolean(state.validating, false),

    serverError: safeText(state.serverError, ""),
    createdTicketId: safeText(state.createdTicketId, ""),
    successMessage: safeText(state.successMessage, ""),

    startedAt: safeTimestamp(state.startedAt, 0),
    submittedAt: safeTimestamp(state.submittedAt, 0),
    completedAt: safeTimestamp(state.completedAt, 0),
  };
}

function createDefaultDetailState() {
  return {
    open: false,
    ticketId: "",
    item: null,

    loading: false,
    refreshing: false,
    error: "",

    lastLoadedAt: 0,
    lastUpdatedAt: 0,
  };
}

function normalizeDetailState(value = {}) {
  const state = safeObject(value);

  return {
    open: safeBoolean(state.open, false),
    ticketId: safeText(state.ticketId, ""),
    item: state.item || null,

    loading: safeBoolean(state.loading, false),
    refreshing: safeBoolean(state.refreshing, false),
    error: safeText(state.error, ""),

    lastLoadedAt: safeTimestamp(state.lastLoadedAt, 0),
    lastUpdatedAt: safeTimestamp(state.lastUpdatedAt, 0),
  };
}

function createDefaultMutationState() {
  return {
    commenting: false,
    uploading: false,
    reopening: false,
    updating: false,
    exporting: false,

    commentTicketId: "",
    uploadTicketId: "",
    reopenTicketId: "",
    updateTicketId: "",

    lastMutationAt: 0,
    lastMutationType: "",
    lastMutationTicketId: "",
  };
}

function normalizeMutationState(value = {}) {
  const state = safeObject(value);

  return {
    commenting: safeBoolean(state.commenting, false),
    uploading: safeBoolean(state.uploading, false),
    reopening: safeBoolean(state.reopening, false),
    updating: safeBoolean(state.updating, false),
    exporting: safeBoolean(state.exporting, false),

    commentTicketId: safeText(state.commentTicketId, ""),
    uploadTicketId: safeText(state.uploadTicketId, ""),
    reopenTicketId: safeText(state.reopenTicketId, ""),
    updateTicketId: safeText(state.updateTicketId, ""),

    lastMutationAt: safeTimestamp(state.lastMutationAt, 0),
    lastMutationType: safeText(state.lastMutationType, ""),
    lastMutationTicketId: safeText(state.lastMutationTicketId, ""),
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
    selectedTicketId: "",

    error: "",
    errorAt: 0,

    items: [],
    remoteCount: 0,
    lastSyncAt: 0,

    /*
      Compatibilidad legacy:
      - page siempre se mantiene en 1.
      - totalPages siempre se expone como 1.
      - pageSize se usa como tamaño visible actual/batch, no como paginación real.
    */
    page: 1,
    currentPage: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalPages: 1,
    pages: 1,
    hasPrev: false,
    hasNext: false,

    /*
      Estado canónico nuevo:
      - La tabla pinta una ventana visible inicial.
      - Al hacer scroll se amplía visibleCount.
      - El orden lo decide el modelo: nuevo → antiguo.
    */
    infiniteScroll: true,
    scrollMode: "infinite",
    paginationDisabled: true,

    initialVisibleCount: DEFAULT_INITIAL_VISIBLE_COUNT,
    visibleInitialCount: DEFAULT_INITIAL_VISIBLE_COUNT,

    loadMoreBatch: DEFAULT_LOAD_MORE_BATCH,
    batchSize: DEFAULT_LOAD_MORE_BATCH,

    visibleCount: 0,
    visibleItemsCount: 0,
    loadedCount: 0,
    remainingCount: 0,

    hasMoreItems: false,
    hasMore: false,
    canLoadMore: false,

    loadingMore: false,
    isLoadingMore: false,

    sort: DEFAULT_SORT,
    filters: normalizeFilters(DEFAULT_FILTERS),

    filter: DEFAULT_LIST_FILTER,
    activeFilter: DEFAULT_LIST_FILTER,
    statusFilter: DEFAULT_LIST_FILTER,

    search: "",
    searchQuery: "",
    filterQuery: "",
    query: "",
    q: "",

    requestId: 0,
    activeRequestId: 0,
    lastRequestStartedAt: 0,
    lastRequestFinishedAt: 0,

    createDraft: createDefaultCreateDraft(),
    createView: createDefaultCreateViewState(),

    detail: createDefaultDetailState(),
    mutations: createDefaultMutationState(),

    cache: {
      restored: false,
      restoredAt: 0,
      savedAt: 0,
      fresh: false,
    },
  };
}

/* =========================================================
   STATE
========================================================= */

export const incidenciasState = createInitialIncidenciasState();

let inflightLoad = null;

/* =========================================================
   INTERNAL STATE HELPERS
========================================================= */

function getListTotal() {
  return Math.max(
    safeNumber(incidenciasState.remoteCount, 0),
    safeArray(incidenciasState.items).length
  );
}

function getSafeInitialVisibleCount(total = getListTotal()) {
  const totalCount = Math.max(0, safeNumber(total, 0));

  if (!totalCount) return 0;

  return Math.min(
    totalCount,
    clamp(
      first(
        incidenciasState.initialVisibleCount,
        incidenciasState.visibleInitialCount,
        DEFAULT_INITIAL_VISIBLE_COUNT
      ),
      1,
      MAX_VISIBLE_COUNT
    )
  );
}

function getSafeLoadMoreBatch() {
  return clamp(
    first(
      incidenciasState.loadMoreBatch,
      incidenciasState.batchSize,
      DEFAULT_LOAD_MORE_BATCH
    ),
    1,
    MAX_VISIBLE_COUNT
  );
}

function getSafeVisibleCount(total = getListTotal()) {
  const totalCount = Math.max(0, safeNumber(total, 0));

  if (!totalCount) return 0;

  const current = safeNumber(incidenciasState.visibleCount, 0);

  if (current > 0) {
    return Math.min(current, totalCount, MAX_VISIBLE_COUNT);
  }

  return getSafeInitialVisibleCount(totalCount);
}

function syncInfiniteAliases(total = getListTotal()) {
  const totalCount = Math.max(0, safeNumber(total, 0));
  const visibleCount = getSafeVisibleCount(totalCount);
  const remainingCount = Math.max(0, totalCount - visibleCount);
  const hasMore = remainingCount > 0;

  incidenciasState.page = 1;
  incidenciasState.currentPage = 1;
  incidenciasState.totalPages = 1;
  incidenciasState.pages = 1;
  incidenciasState.hasPrev = false;
  incidenciasState.hasNext = false;

  incidenciasState.pageSize = Math.max(1, visibleCount || getSafeLoadMoreBatch());

  incidenciasState.infiniteScroll = true;
  incidenciasState.scrollMode = "infinite";
  incidenciasState.paginationDisabled = true;

  incidenciasState.visibleCount = visibleCount;
  incidenciasState.visibleItemsCount = visibleCount;
  incidenciasState.loadedCount = visibleCount;
  incidenciasState.remainingCount = remainingCount;

  incidenciasState.hasMoreItems = hasMore;
  incidenciasState.hasMore = hasMore;
  incidenciasState.canLoadMore = hasMore;

  incidenciasState.loadingMore = Boolean(incidenciasState.loadingMore);
  incidenciasState.isLoadingMore = Boolean(incidenciasState.loadingMore);

  incidenciasState.initialVisibleCount = clamp(
    incidenciasState.initialVisibleCount,
    1,
    MAX_VISIBLE_COUNT
  );

  incidenciasState.visibleInitialCount = incidenciasState.initialVisibleCount;

  incidenciasState.loadMoreBatch = getSafeLoadMoreBatch();
  incidenciasState.batchSize = incidenciasState.loadMoreBatch;

  return {
    total: totalCount,
    visibleCount,
    remainingCount,
    hasMore,
  };
}

function normalizePageState() {
  const total = getListTotal();
  const meta = syncInfiniteAliases(total);

  return {
    page: 1,
    currentPage: 1,
    pageSize: incidenciasState.pageSize,
    total: meta.total,
    totalCount: meta.total,
    totalPages: 1,
    pages: 1,
    from: meta.visibleCount ? 1 : 0,
    to: meta.visibleCount,
    hasPrev: false,
    hasNext: false,
    hasMore: meta.hasMore,
    canLoadMore: meta.hasMore,
    remainingCount: meta.remainingCount,
    visibleCount: meta.visibleCount,
    visibleItemsCount: meta.visibleCount,
    loadedCount: meta.visibleCount,
    infiniteScroll: true,
    scrollMode: "infinite",
    paginationDisabled: true,
  };
}

function syncRootFilterAliases(value = {}) {
  const filters = normalizeFilters(value);

  incidenciasState.filters = filters;

  incidenciasState.filter = filters.filter;
  incidenciasState.activeFilter = filters.activeFilter;
  incidenciasState.statusFilter = filters.statusFilter;

  incidenciasState.search = filters.query;
  incidenciasState.searchQuery = filters.query;
  incidenciasState.filterQuery = filters.query;
  incidenciasState.query = filters.query;
  incidenciasState.q = filters.query;

  return filters;
}

function getCurrentFiltersForSnapshot() {
  return normalizeFilters({
    ...safeObject(incidenciasState.filters),
    filter: first(incidenciasState.activeFilter, incidenciasState.filter, incidenciasState.statusFilter),
    activeFilter: first(incidenciasState.activeFilter, incidenciasState.filter, incidenciasState.statusFilter),
    statusFilter: first(incidenciasState.statusFilter, incidenciasState.activeFilter, incidenciasState.filter),
    q: first(incidenciasState.searchQuery, incidenciasState.filterQuery, incidenciasState.query, incidenciasState.q),
    search: first(incidenciasState.searchQuery, incidenciasState.filterQuery, incidenciasState.query, incidenciasState.q),
    query: first(incidenciasState.query, incidenciasState.searchQuery, incidenciasState.filterQuery, incidenciasState.q),
  });
}

function touchRequestId() {
  incidenciasState.requestId += 1;
  incidenciasState.activeRequestId = incidenciasState.requestId;
  incidenciasState.lastRequestStartedAt = now();

  return incidenciasState.requestId;
}

function finishRequest(requestId = incidenciasState.activeRequestId) {
  if (
    requestId &&
    incidenciasState.activeRequestId &&
    requestId !== incidenciasState.activeRequestId
  ) {
    return false;
  }

  incidenciasState.lastRequestFinishedAt = now();

  return true;
}

function markIdle() {
  incidenciasState.loading = false;
  incidenciasState.refreshing = false;
  finishRequest();

  return incidenciasState;
}

function markLoaded() {
  incidenciasState.loaded = true;
  incidenciasState.hydrated = true;
  markIdle();
  normalizePageState();

  return incidenciasState;
}

function markMutationDone(type = "", ticketId = "") {
  incidenciasState.mutations = normalizeMutationState({
    ...incidenciasState.mutations,

    commenting: false,
    uploading: false,
    reopening: false,
    updating: false,

    commentTicketId: "",
    uploadTicketId: "",
    reopenTicketId: "",
    updateTicketId: "",

    lastMutationAt: now(),
    lastMutationType: safeText(type, ""),
    lastMutationTicketId: safeText(ticketId, ""),
  });

  return incidenciasState.mutations;
}

function getItemIdentity(item = {}) {
  const source = safeObject(item);

  return safeLower(
    first(
      source.ticketId,
      source.id,
      source._id,
      source.code,
      source.ticketCode,
      source.incidenciaId,
      source.entityId,
      source.raw?.ticketId,
      source.raw?.id,
      source.raw?._id,
      source.raw?.code,
      source.raw?.ticketCode,
      source.raw?.incidenciaId,
      source.raw?.entityId,
      ""
    ),
    ""
  );
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

export function hasInflightLoad() {
  return Boolean(inflightLoad);
}

/* =========================================================
   RESET
========================================================= */

export function resetIncidenciasState() {
  Object.assign(incidenciasState, createInitialIncidenciasState());
  inflightLoad = null;

  return incidenciasState;
}

export function resetIncidenciasRuntimeState() {
  incidenciasState.loading = false;
  incidenciasState.refreshing = false;
  incidenciasState.loadingMore = false;
  incidenciasState.isLoadingMore = false;

  incidenciasState.creating = false;
  incidenciasState.openingTicketId = "";
  incidenciasState.selectedTicketId = "";
  incidenciasState.error = "";
  incidenciasState.errorAt = 0;
  incidenciasState.detail = createDefaultDetailState();
  incidenciasState.mutations = createDefaultMutationState();

  inflightLoad = null;

  normalizePageState();

  return incidenciasState;
}

/* =========================================================
   REQUEST
========================================================= */

export function beginRequest({
  loading = false,
  refreshing = false,
} = {}) {
  const requestId = touchRequestId();

  incidenciasState.error = "";
  incidenciasState.errorAt = 0;

  incidenciasState.loading = Boolean(loading);
  incidenciasState.refreshing = Boolean(refreshing);

  if (incidenciasState.loading) {
    incidenciasState.refreshing = false;
  }

  if (incidenciasState.refreshing) {
    incidenciasState.loading = false;
  }

  return requestId;
}

export function isActiveRequest(requestId = 0) {
  const id = safeNumber(requestId, 0);

  return Boolean(id && id === incidenciasState.activeRequestId);
}

export function completeRequest(requestId = 0) {
  const id = safeNumber(requestId, 0);

  if (id && !isActiveRequest(id)) {
    return false;
  }

  markIdle();
  return true;
}

/* =========================================================
   FLAGS
========================================================= */

export function setLoading(value) {
  incidenciasState.loading = Boolean(value);

  if (incidenciasState.loading) {
    incidenciasState.refreshing = false;
    touchRequestId();
  } else {
    finishRequest();
  }

  return incidenciasState.loading;
}

export function setRefreshing(value) {
  incidenciasState.refreshing = Boolean(value);

  if (incidenciasState.refreshing) {
    incidenciasState.loading = false;
    touchRequestId();
  } else {
    finishRequest();
  }

  return incidenciasState.refreshing;
}

export function setLoadingMore(value) {
  incidenciasState.loadingMore = Boolean(value);
  incidenciasState.isLoadingMore = Boolean(value);
  return incidenciasState.loadingMore;
}

export function setLoaded(value) {
  incidenciasState.loaded = Boolean(value);

  if (incidenciasState.loaded) {
    markLoaded();
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
   INFINITE SCROLL / LEGACY PAGINATION COMPAT
========================================================= */

export function setInfiniteScrollMeta(value = {}) {
  const meta = safeObject(value);

  if (hasOwn(meta, "initialVisibleCount")) {
    incidenciasState.initialVisibleCount = clamp(meta.initialVisibleCount, 1, MAX_VISIBLE_COUNT);
    incidenciasState.visibleInitialCount = incidenciasState.initialVisibleCount;
  }

  if (hasOwn(meta, "visibleInitialCount")) {
    incidenciasState.initialVisibleCount = clamp(meta.visibleInitialCount, 1, MAX_VISIBLE_COUNT);
    incidenciasState.visibleInitialCount = incidenciasState.initialVisibleCount;
  }

  if (hasOwn(meta, "loadMoreBatch")) {
    incidenciasState.loadMoreBatch = clamp(meta.loadMoreBatch, 1, MAX_VISIBLE_COUNT);
    incidenciasState.batchSize = incidenciasState.loadMoreBatch;
  }

  if (hasOwn(meta, "batchSize")) {
    incidenciasState.loadMoreBatch = clamp(meta.batchSize, 1, MAX_VISIBLE_COUNT);
    incidenciasState.batchSize = incidenciasState.loadMoreBatch;
  }

  if (hasOwn(meta, "visibleCount")) {
    setVisibleCount(meta.visibleCount);
  } else {
    normalizePageState();
  }

  incidenciasState.infiniteScroll = true;
  incidenciasState.scrollMode = normalizeScrollMode(meta.scrollMode || "infinite");
  incidenciasState.paginationDisabled = true;

  return getInfiniteScrollState();
}

export function setVisibleCount(value = 0) {
  const total = getListTotal();
  const next = total
    ? Math.min(clamp(value, 1, MAX_VISIBLE_COUNT), total)
    : 0;

  incidenciasState.visibleCount = next;
  incidenciasState.visibleItemsCount = next;
  incidenciasState.loadedCount = next;

  normalizePageState();

  return incidenciasState.visibleCount;
}

export function increaseVisibleCount(amount = DEFAULT_LOAD_MORE_BATCH) {
  const total = getListTotal();
  const current = getSafeVisibleCount(total);
  const increment = clamp(amount, 1, MAX_VISIBLE_COUNT);
  const next = total
    ? Math.min(total, current + increment)
    : 0;

  return setVisibleCount(next);
}

export function resetVisibleCount() {
  return setVisibleCount(getSafeInitialVisibleCount(getListTotal()));
}

export function setHasMoreItems(value = false) {
  incidenciasState.hasMoreItems = Boolean(value);
  incidenciasState.hasMore = Boolean(value);
  incidenciasState.canLoadMore = Boolean(value);

  return incidenciasState.hasMoreItems;
}

export function getInfiniteScrollState() {
  const pagination = normalizePageState();

  return {
    mode: "infinite",
    infiniteScroll: true,
    scrollMode: "infinite",
    paginationDisabled: true,

    initialVisibleCount: incidenciasState.initialVisibleCount,
    visibleInitialCount: incidenciasState.visibleInitialCount,

    loadMoreBatch: incidenciasState.loadMoreBatch,
    batchSize: incidenciasState.batchSize,

    visibleCount: pagination.visibleCount,
    visibleItemsCount: pagination.visibleItemsCount,
    loadedCount: pagination.loadedCount,
    remainingCount: pagination.remainingCount,

    hasMoreItems: pagination.hasMore,
    hasMore: pagination.hasMore,
    canLoadMore: pagination.canLoadMore,

    loadingMore: Boolean(incidenciasState.loadingMore),
    isLoadingMore: Boolean(incidenciasState.loadingMore),
  };
}

export function setPage(_value = 1) {
  incidenciasState.page = 1;
  incidenciasState.currentPage = 1;
  normalizePageState();

  return incidenciasState.page;
}

export function nextPage() {
  increaseVisibleCount(getSafeLoadMoreBatch());
  return incidenciasState.page;
}

export function prevPage() {
  resetVisibleCount();
  return incidenciasState.page;
}

export function setPageSize(value = DEFAULT_PAGE_SIZE) {
  const size = clamp(value, 1, MAX_PAGE_SIZE);

  incidenciasState.pageSize = size;
  incidenciasState.loadMoreBatch = size;
  incidenciasState.batchSize = size;
  incidenciasState.page = 1;
  incidenciasState.currentPage = 1;

  normalizePageState();

  return incidenciasState.pageSize;
}

export function resetPage() {
  incidenciasState.page = 1;
  incidenciasState.currentPage = 1;
  resetVisibleCount();
  normalizePageState();

  return incidenciasState.page;
}

export function getPaginationState() {
  return normalizePageState();
}

/* =========================================================
   FILTERS / SORT
========================================================= */

export function setFilters(value = {}) {
  const filters = syncRootFilterAliases(value);
  resetPage();

  return filters;
}

export function patchFilters(patch = {}) {
  const filters = syncRootFilterAliases({
    ...getCurrentFiltersForSnapshot(),
    ...safeObject(patch),
  });

  resetPage();

  return filters;
}

export function clearFilters() {
  const filters = syncRootFilterAliases(DEFAULT_FILTERS);
  resetPage();

  return filters;
}

export function getFilters() {
  return getCurrentFiltersForSnapshot();
}

export function setSort(value = DEFAULT_SORT) {
  incidenciasState.sort = safeText(value, DEFAULT_SORT);
  return incidenciasState.sort;
}

export function getSort() {
  return safeText(incidenciasState.sort, DEFAULT_SORT);
}

/* =========================================================
   DATA
========================================================= */

export function setItems(items = [], options = {}) {
  const list = normalizeItems(items);
  const opts = safeObject(options);

  incidenciasState.items = list;
  incidenciasState.error = "";
  incidenciasState.errorAt = 0;

  if (hasOwn(opts, "remoteCount")) {
    incidenciasState.remoteCount = Math.max(0, safeNumber(opts.remoteCount, list.length));
  } else if (hasOwn(opts, "total")) {
    incidenciasState.remoteCount = Math.max(0, safeNumber(opts.total, list.length));
  } else {
    incidenciasState.remoteCount = Math.max(safeNumber(incidenciasState.remoteCount, 0), list.length);
  }

  if (hasOwn(opts, "visibleCount")) {
    incidenciasState.visibleCount = clamp(opts.visibleCount, 0, MAX_VISIBLE_COUNT);
  } else if (!safeNumber(incidenciasState.visibleCount, 0)) {
    incidenciasState.visibleCount = getSafeInitialVisibleCount(Math.max(list.length, incidenciasState.remoteCount));
  }

  if (hasOwn(opts, "pageSize")) {
    const size = clamp(opts.pageSize, 1, MAX_PAGE_SIZE);
    incidenciasState.pageSize = size;
    incidenciasState.loadMoreBatch = size;
    incidenciasState.batchSize = size;
  }

  incidenciasState.page = 1;
  incidenciasState.currentPage = 1;

  markLoaded();
  normalizePageState();

  return incidenciasState.items;
}

export function patchItemById(ticketId = "", patch = {}) {
  const id = safeLower(ticketId, "");
  const nextPatch = safeObject(patch);

  if (!id) {
    return incidenciasState.items;
  }

  let updated = false;

  incidenciasState.items = safeArray(incidenciasState.items).map((item) => {
    if (getItemIdentity(item) !== id) {
      return item;
    }

    updated = true;

    return {
      ...safeObject(item),
      ...nextPatch,
      raw: {
        ...safeObject(item?.raw),
        ...safeObject(nextPatch?.raw),
      },
    };
  });

  if (updated) {
    normalizePageState();
  }

  return incidenciasState.items;
}

export function upsertItem(item = {}) {
  const row = safeObject(item);
  const id = getItemIdentity(row);

  if (!id) {
    incidenciasState.items = [row, ...safeArray(incidenciasState.items)];
    incidenciasState.remoteCount = Math.max(safeNumber(incidenciasState.remoteCount, 0), incidenciasState.items.length);
    normalizePageState();
    return incidenciasState.items;
  }

  let found = false;

  incidenciasState.items = safeArray(incidenciasState.items).map((current) => {
    if (getItemIdentity(current) !== id) {
      return current;
    }

    found = true;

    return {
      ...safeObject(current),
      ...row,
      raw: {
        ...safeObject(current?.raw),
        ...safeObject(row?.raw),
      },
    };
  });

  if (!found) {
    incidenciasState.items = [row, ...safeArray(incidenciasState.items)];
  }

  incidenciasState.remoteCount = Math.max(safeNumber(incidenciasState.remoteCount, 0), incidenciasState.items.length);
  normalizePageState();

  return incidenciasState.items;
}

export function removeItemById(ticketId = "") {
  const id = safeLower(ticketId, "");

  if (!id) {
    return incidenciasState.items;
  }

  incidenciasState.items = safeArray(incidenciasState.items).filter((item) => {
    return getItemIdentity(item) !== id;
  });

  incidenciasState.remoteCount = Math.max(
    0,
    Math.min(safeNumber(incidenciasState.remoteCount, incidenciasState.items.length), incidenciasState.items.length)
  );

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
  incidenciasState.currentPage = 1;
  incidenciasState.visibleCount = 0;
  incidenciasState.visibleItemsCount = 0;
  incidenciasState.loadedCount = 0;
  incidenciasState.remainingCount = 0;
  incidenciasState.hasMoreItems = false;
  incidenciasState.hasMore = false;
  incidenciasState.canLoadMore = false;

  normalizePageState();

  return incidenciasState.items;
}

export function setRemoteCount(value = 0) {
  incidenciasState.remoteCount = Math.max(0, safeNumber(value, 0));
  normalizePageState();

  return incidenciasState.remoteCount;
}

/* =========================================================
   META / ERROR
========================================================= */

export function setError(value = null) {
  incidenciasState.error = value ? safeText(value, "") : "";
  incidenciasState.errorAt = incidenciasState.error ? now() : 0;

  if (incidenciasState.error) {
    markIdle();
  }

  return incidenciasState.error;
}

export function clearError() {
  incidenciasState.error = "";
  incidenciasState.errorAt = 0;

  return incidenciasState.error;
}

export function setLastSyncAt(value = 0) {
  incidenciasState.lastSyncAt = safeTimestamp(value, 0);
  return incidenciasState.lastSyncAt;
}

export function touchLastSyncAt() {
  incidenciasState.lastSyncAt = now();
  return incidenciasState.lastSyncAt;
}

/* =========================================================
   DETAIL / MODAL STATE
========================================================= */

export function setDetailState(value = {}) {
  incidenciasState.detail = normalizeDetailState(value);
  return incidenciasState.detail;
}

export function patchDetailState(patch = {}) {
  incidenciasState.detail = normalizeDetailState({
    ...safeObject(incidenciasState.detail),
    ...safeObject(patch),
  });

  return incidenciasState.detail;
}

export function openDetail(ticketId = "", item = null) {
  const id = safeText(ticketId, "");

  incidenciasState.detail = normalizeDetailState({
    ...safeObject(incidenciasState.detail),
    open: true,
    ticketId: id,
    item: item || incidenciasState.detail.item || null,
    error: "",
  });

  incidenciasState.openingTicketId = id;
  incidenciasState.selectedTicketId = id;

  return incidenciasState.detail;
}

export function closeDetail() {
  incidenciasState.detail = normalizeDetailState({
    ...safeObject(incidenciasState.detail),
    open: false,
    loading: false,
    refreshing: false,
    error: "",
  });

  incidenciasState.openingTicketId = "";

  return incidenciasState.detail;
}

export function setDetailLoading(value = false, ticketId = "") {
  const loading = Boolean(value);
  const id = safeText(ticketId, incidenciasState.detail.ticketId || "");

  incidenciasState.detail = normalizeDetailState({
    ...safeObject(incidenciasState.detail),
    loading,
    refreshing: false,
    ticketId: id,
    error: loading ? "" : incidenciasState.detail.error,
  });

  incidenciasState.openingTicketId = loading ? id : "";

  return incidenciasState.detail.loading;
}

export function setDetailRefreshing(value = false, ticketId = "") {
  const refreshing = Boolean(value);

  incidenciasState.detail = normalizeDetailState({
    ...safeObject(incidenciasState.detail),
    refreshing,
    loading: false,
    ticketId: safeText(ticketId, incidenciasState.detail.ticketId || ""),
    error: refreshing ? "" : incidenciasState.detail.error,
  });

  return incidenciasState.detail.refreshing;
}

export function setDetailItem(item = null, ticketId = "") {
  const finalTicketId = safeText(
    first(ticketId, item?.ticketId, item?.id, item?.code, item?.ticketCode, incidenciasState.detail.ticketId),
    ""
  );

  incidenciasState.detail = normalizeDetailState({
    ...safeObject(incidenciasState.detail),
    open: true,
    ticketId: finalTicketId,
    item: item || null,
    loading: false,
    refreshing: false,
    error: "",
    lastLoadedAt: now(),
    lastUpdatedAt: now(),
  });

  incidenciasState.openingTicketId = "";
  incidenciasState.selectedTicketId = finalTicketId;

  if (item) {
    upsertItem(item);
  }

  return incidenciasState.detail.item;
}

export function setDetailError(value = "") {
  incidenciasState.detail = normalizeDetailState({
    ...safeObject(incidenciasState.detail),
    loading: false,
    refreshing: false,
    error: safeText(value, ""),
  });

  incidenciasState.openingTicketId = "";

  return incidenciasState.detail.error;
}

export function getDetailState() {
  return normalizeDetailState(incidenciasState.detail);
}

export function clearDetailState() {
  incidenciasState.detail = createDefaultDetailState();
  incidenciasState.openingTicketId = "";
  incidenciasState.selectedTicketId = "";

  return incidenciasState.detail;
}

/* =========================================================
   MUTATION STATE
========================================================= */

export function setMutationState(value = {}) {
  incidenciasState.mutations = normalizeMutationState(value);
  return incidenciasState.mutations;
}

export function patchMutationState(patch = {}) {
  incidenciasState.mutations = normalizeMutationState({
    ...safeObject(incidenciasState.mutations),
    ...safeObject(patch),
  });

  return incidenciasState.mutations;
}

export function setCommenting(value = false, ticketId = "") {
  incidenciasState.mutations = normalizeMutationState({
    ...safeObject(incidenciasState.mutations),
    commenting: Boolean(value),
    commentTicketId: Boolean(value) ? safeText(ticketId, "") : "",
  });

  if (!value) {
    markMutationDone("comment", ticketId);
  }

  return incidenciasState.mutations.commenting;
}

export function setUploading(value = false, ticketId = "") {
  incidenciasState.mutations = normalizeMutationState({
    ...safeObject(incidenciasState.mutations),
    uploading: Boolean(value),
    uploadTicketId: Boolean(value) ? safeText(ticketId, "") : "",
  });

  if (!value) {
    markMutationDone("upload", ticketId);
  }

  return incidenciasState.mutations.uploading;
}

export function setReopening(value = false, ticketId = "") {
  incidenciasState.mutations = normalizeMutationState({
    ...safeObject(incidenciasState.mutations),
    reopening: Boolean(value),
    reopenTicketId: Boolean(value) ? safeText(ticketId, "") : "",
  });

  if (!value) {
    markMutationDone("reopen", ticketId);
  }

  return incidenciasState.mutations.reopening;
}

export function setUpdating(value = false, ticketId = "") {
  incidenciasState.mutations = normalizeMutationState({
    ...safeObject(incidenciasState.mutations),
    updating: Boolean(value),
    updateTicketId: Boolean(value) ? safeText(ticketId, "") : "",
  });

  if (!value) {
    markMutationDone("update", ticketId);
  }

  return incidenciasState.mutations.updating;
}

export function setExporting(value = false) {
  incidenciasState.mutations = normalizeMutationState({
    ...safeObject(incidenciasState.mutations),
    exporting: Boolean(value),
  });

  return incidenciasState.mutations.exporting;
}

export function clearMutationState() {
  incidenciasState.mutations = createDefaultMutationState();
  return incidenciasState.mutations;
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

export function getCreateDraft() {
  return normalizeCreateDraft(incidenciasState.createDraft);
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

  const form = hasOwn(nextPatch, "form")
    ? normalizeCreateDraft({
        ...current.form,
        ...safeObject(nextPatch.form),
      })
    : current.form;

  const errors = hasOwn(nextPatch, "errors")
    ? safeObject(nextPatch.errors)
    : current.errors;

  const touched = hasOwn(nextPatch, "touched")
    ? safeObject(nextPatch.touched)
    : current.touched;

  incidenciasState.createView = normalizeCreateViewState({
    ...current,
    ...nextPatch,
    form,
    errors,
    touched,
  });

  return incidenciasState.createView;
}

export function setCreateViewForm(form = {}) {
  const current = normalizeCreateViewState(incidenciasState.createView);
  const nextForm = normalizeCreateDraft(form);

  incidenciasState.createView = normalizeCreateViewState({
    ...current,
    form: nextForm,
  });

  incidenciasState.createDraft = nextForm;

  return incidenciasState.createView.form;
}

export function patchCreateViewForm(patch = {}) {
  const current = normalizeCreateViewState(incidenciasState.createView);
  const form = normalizeCreateDraft({
    ...current.form,
    ...safeObject(patch),
  });

  incidenciasState.createView = normalizeCreateViewState({
    ...current,
    form,
  });

  incidenciasState.createDraft = form;

  return incidenciasState.createView.form;
}

export function setCreateViewErrors(errors = {}) {
  const current = normalizeCreateViewState(incidenciasState.createView);

  incidenciasState.createView = normalizeCreateViewState({
    ...current,
    errors: safeObject(errors),
  });

  return incidenciasState.createView.errors;
}

export function patchCreateViewErrors(patch = {}) {
  const current = normalizeCreateViewState(incidenciasState.createView);

  incidenciasState.createView = normalizeCreateViewState({
    ...current,
    errors: {
      ...safeObject(current.errors),
      ...safeObject(patch),
    },
  });

  return incidenciasState.createView.errors;
}

export function clearCreateViewErrors() {
  return setCreateViewErrors({});
}

export function setCreateViewTouched(touched = {}) {
  const current = normalizeCreateViewState(incidenciasState.createView);

  incidenciasState.createView = normalizeCreateViewState({
    ...current,
    touched: safeObject(touched),
  });

  return incidenciasState.createView.touched;
}

export function patchCreateViewTouched(patch = {}) {
  const current = normalizeCreateViewState(incidenciasState.createView);

  incidenciasState.createView = normalizeCreateViewState({
    ...current,
    touched: {
      ...safeObject(current.touched),
      ...safeObject(patch),
    },
  });

  return incidenciasState.createView.touched;
}

export function setCreateViewSubmitting(value = false) {
  const current = normalizeCreateViewState(incidenciasState.createView);
  const submitting = Boolean(value);

  incidenciasState.creating = submitting;

  incidenciasState.createView = normalizeCreateViewState({
    ...current,
    submitting,
    serverError: submitting ? "" : current.serverError,
    submittedAt: submitting ? now() : current.submittedAt,
  });

  return incidenciasState.createView.submitting;
}

export function setCreateViewValidating(value = false) {
  const current = normalizeCreateViewState(incidenciasState.createView);

  incidenciasState.createView = normalizeCreateViewState({
    ...current,
    validating: Boolean(value),
  });

  return incidenciasState.createView.validating;
}

export function setCreateViewServerError(value = "") {
  const current = normalizeCreateViewState(incidenciasState.createView);

  incidenciasState.createView = normalizeCreateViewState({
    ...current,
    submitting: false,
    serverError: safeText(value, ""),
  });

  incidenciasState.creating = false;

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

  incidenciasState.createView = normalizeCreateViewState({
    ...current,
    submitting: false,
    serverError: "",
    createdTicketId: safeText(createdTicketId, ""),
    successMessage: safeText(successMessage, ""),
    completedAt: now(),
  });

  incidenciasState.creating = false;

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
  incidenciasState.createDraft = createDefaultCreateDraft();
  incidenciasState.creating = false;

  return incidenciasState.createView;
}

export function getCreateViewState() {
  return normalizeCreateViewState(incidenciasState.createView);
}

/* =========================================================
   CACHE HELPERS
========================================================= */

export function getCachePayload() {
  const filters = getCurrentFiltersForSnapshot();

  normalizePageState();

  return {
    version: CACHE_VERSION,
    savedAt: now(),

    items: getItems(),
    remoteCount: incidenciasState.remoteCount,
    lastSyncAt: incidenciasState.lastSyncAt,

    page: 1,
    pageSize: incidenciasState.pageSize,

    infiniteScroll: true,
    scrollMode: "infinite",
    paginationDisabled: true,

    initialVisibleCount: incidenciasState.initialVisibleCount,
    visibleInitialCount: incidenciasState.visibleInitialCount,

    loadMoreBatch: incidenciasState.loadMoreBatch,
    batchSize: incidenciasState.batchSize,

    visibleCount: incidenciasState.visibleCount,
    visibleItemsCount: incidenciasState.visibleItemsCount,
    loadedCount: incidenciasState.loadedCount,

    sort: incidenciasState.sort,
    filters,

    filter: filters.filter,
    activeFilter: filters.activeFilter,
    statusFilter: filters.statusFilter,
    searchQuery: filters.query,
  };
}

export function isCacheFresh(savedAt = 0) {
  const timestamp = safeTimestamp(savedAt, 0);

  if (!timestamp) {
    return false;
  }

  return now() - timestamp < CACHE_TTL;
}

export function isCachePayloadValid(payload = {}) {
  const data = safeObject(payload);

  if (!Object.keys(data).length) {
    return false;
  }

  if (safeNumber(data.version, 0) !== CACHE_VERSION) {
    return false;
  }

  return Array.isArray(data.items);
}

export function writeCachePayload(payload = null) {
  if (!canUseLocalStorage()) {
    return false;
  }

  const finalPayload = safeObject(payload || getCachePayload());

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(finalPayload));

    incidenciasState.cache = {
      ...safeObject(incidenciasState.cache),
      savedAt: safeTimestamp(finalPayload.savedAt, now()),
      fresh: true,
    };

    return true;
  } catch {
    return false;
  }
}

export function readCachePayload({
  freshOnly = true,
} = {}) {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    const raw = localStorage.getItem(CACHE_KEY);

    if (!raw) {
      return null;
    }

    const payload = safeObject(JSON.parse(raw));

    if (!isCachePayloadValid(payload)) {
      return null;
    }

    if (freshOnly && !isCacheFresh(payload.savedAt)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function clearCachePayload() {
  if (!canUseLocalStorage()) {
    return false;
  }

  try {
    localStorage.removeItem(CACHE_KEY);

    incidenciasState.cache = {
      restored: false,
      restoredAt: 0,
      savedAt: 0,
      fresh: false,
    };

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
  incidenciasState.page = 1;
  incidenciasState.currentPage = 1;

  const restoredPageSize = safeNumber(
    first(payload.pageSize, payload.loadMoreBatch, payload.batchSize, DEFAULT_PAGE_SIZE),
    DEFAULT_PAGE_SIZE
  );

  incidenciasState.pageSize = clamp(restoredPageSize, 1, MAX_PAGE_SIZE);
  incidenciasState.loadMoreBatch = clamp(first(payload.loadMoreBatch, payload.batchSize, restoredPageSize), 1, MAX_VISIBLE_COUNT);
  incidenciasState.batchSize = incidenciasState.loadMoreBatch;

  incidenciasState.initialVisibleCount = clamp(
    first(payload.initialVisibleCount, payload.visibleInitialCount, DEFAULT_INITIAL_VISIBLE_COUNT),
    1,
    MAX_VISIBLE_COUNT
  );

  incidenciasState.visibleInitialCount = incidenciasState.initialVisibleCount;

  const total = Math.max(incidenciasState.remoteCount, incidenciasState.items.length);

  incidenciasState.visibleCount = clamp(
    first(payload.visibleCount, payload.visibleItemsCount, payload.loadedCount, getSafeInitialVisibleCount(total)),
    0,
    total || MAX_VISIBLE_COUNT
  );

  incidenciasState.sort = safeText(payload.sort, DEFAULT_SORT);

  incidenciasState.infiniteScroll = true;
  incidenciasState.scrollMode = "infinite";
  incidenciasState.paginationDisabled = true;

  syncRootFilterAliases(
    first(
      payload.filters,
      {
        filter: payload.filter,
        activeFilter: payload.activeFilter,
        statusFilter: payload.statusFilter,
        q: payload.searchQuery,
        search: payload.searchQuery,
        query: payload.searchQuery,
      },
      DEFAULT_FILTERS
    )
  );

  incidenciasState.cache = {
    restored: true,
    restoredAt: now(),
    savedAt: safeTimestamp(payload.savedAt, 0),
    fresh: isCacheFresh(payload.savedAt),
  };

  clearError();
  markLoaded();
  normalizePageState();

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getIncidenciasStateSnapshot() {
  const filters = getCurrentFiltersForSnapshot();
  const createView = normalizeCreateViewState(incidenciasState.createView);
  const detail = normalizeDetailState(incidenciasState.detail);
  const mutations = normalizeMutationState(incidenciasState.mutations);
  const pagination = getPaginationState();
  const infinite = getInfiniteScrollState();

  return {
    hydrated: incidenciasState.hydrated,
    loading: incidenciasState.loading,
    refreshing: incidenciasState.refreshing,
    loaded: incidenciasState.loaded,

    creating: incidenciasState.creating,
    openingTicketId: safeText(incidenciasState.openingTicketId, ""),
    selectedTicketId: safeText(incidenciasState.selectedTicketId, ""),

    error: incidenciasState.error,
    errorAt: incidenciasState.errorAt,

    total: safeArray(incidenciasState.items).length,
    remoteCount: incidenciasState.remoteCount,
    lastSyncAt: incidenciasState.lastSyncAt,

    page: 1,
    currentPage: 1,
    pageSize: pagination.pageSize,
    totalPages: 1,
    pages: 1,
    from: pagination.from,
    to: pagination.to,
    hasPrev: false,
    hasNext: false,

    infiniteScroll: true,
    scrollMode: "infinite",
    paginationDisabled: true,

    initialVisibleCount: infinite.initialVisibleCount,
    visibleInitialCount: infinite.visibleInitialCount,
    loadMoreBatch: infinite.loadMoreBatch,
    batchSize: infinite.batchSize,

    visibleCount: infinite.visibleCount,
    visibleItemsCount: infinite.visibleItemsCount,
    loadedCount: infinite.loadedCount,
    remainingCount: infinite.remainingCount,

    hasMoreItems: infinite.hasMoreItems,
    hasMore: infinite.hasMore,
    canLoadMore: infinite.canLoadMore,
    loadingMore: infinite.loadingMore,
    isLoadingMore: infinite.isLoadingMore,

    sort: incidenciasState.sort,
    filters,

    filter: filters.filter,
    activeFilter: filters.activeFilter,
    statusFilter: filters.statusFilter,
    search: filters.query,
    searchQuery: filters.query,
    filterQuery: filters.query,
    query: filters.query,

    requestId: incidenciasState.requestId,
    activeRequestId: incidenciasState.activeRequestId,
    lastRequestStartedAt: incidenciasState.lastRequestStartedAt,
    lastRequestFinishedAt: incidenciasState.lastRequestFinishedAt,
    hasInflight: Boolean(inflightLoad),

    detail: {
      open: detail.open,
      ticketId: detail.ticketId,
      loading: detail.loading,
      refreshing: detail.refreshing,
      error: detail.error,
      hasItem: Boolean(detail.item),
      lastLoadedAt: detail.lastLoadedAt,
      lastUpdatedAt: detail.lastUpdatedAt,
    },

    mutations,

    cache: {
      ...safeObject(incidenciasState.cache),
    },

    createDraft: {
      ...safeObject(incidenciasState.createDraft),
    },

    createView: {
      submitting: createView.submitting,
      validating: createView.validating,
      serverError: createView.serverError,
      createdTicketId: createView.createdTicketId,
      successMessage: createView.successMessage,
      startedAt: createView.startedAt,
      submittedAt: createView.submittedAt,
      completedAt: createView.completedAt,
      errorCount: Object.keys(safeObject(createView.errors)).length,
      touchedCount: Object.keys(safeObject(createView.touched)).length,
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
  CACHE_VERSION,
  CACHE_TTL,

  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  DEFAULT_INITIAL_VISIBLE_COUNT,
  DEFAULT_LOAD_MORE_BATCH,
  MAX_VISIBLE_COUNT,

  DEFAULT_SORT,
  DEFAULT_FILTERS,

  incidenciasState,

  getInflightLoad,
  setInflightLoad,
  clearInflightLoad,
  hasInflightLoad,

  resetIncidenciasState,
  resetIncidenciasRuntimeState,

  beginRequest,
  isActiveRequest,
  completeRequest,

  setLoading,
  setRefreshing,
  setLoadingMore,
  setLoaded,
  setHydrated,
  setCreating,
  setOpeningTicketId,

  setInfiniteScrollMeta,
  setVisibleCount,
  increaseVisibleCount,
  resetVisibleCount,
  setHasMoreItems,
  getInfiniteScrollState,

  setPage,
  nextPage,
  prevPage,
  setPageSize,
  resetPage,
  getPaginationState,

  setFilters,
  patchFilters,
  clearFilters,
  getFilters,
  setSort,
  getSort,

  setItems,
  patchItemById,
  upsertItem,
  removeItemById,
  getItems,
  getItemsCount,
  hasItems,
  clearItems,
  setRemoteCount,

  setError,
  clearError,
  setLastSyncAt,
  touchLastSyncAt,

  setDetailState,
  patchDetailState,
  openDetail,
  closeDetail,
  setDetailLoading,
  setDetailRefreshing,
  setDetailItem,
  setDetailError,
  getDetailState,
  clearDetailState,

  setMutationState,
  patchMutationState,
  setCommenting,
  setUploading,
  setReopening,
  setUpdating,
  setExporting,
  clearMutationState,

  setCreateDraft,
  patchCreateDraft,
  clearCreateDraft,
  getCreateDraft,

  setCreateViewState,
  patchCreateViewState,
  setCreateViewForm,
  patchCreateViewForm,
  setCreateViewErrors,
  patchCreateViewErrors,
  clearCreateViewErrors,
  setCreateViewTouched,
  patchCreateViewTouched,
  setCreateViewSubmitting,
  setCreateViewValidating,
  setCreateViewServerError,
  clearCreateViewServerError,
  setCreateViewSuccess,
  clearCreateViewSuccess,
  resetCreateViewState,
  getCreateViewState,

  getCachePayload,
  isCacheFresh,
  isCachePayloadValid,
  writeCachePayload,
  readCachePayload,
  clearCachePayload,
  hydrateStateFromCache,

  getIncidenciasStateSnapshot,
};
