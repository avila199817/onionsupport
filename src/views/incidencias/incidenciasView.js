/* =========================================================
   Onion Support - Incidencias View
   Archivo: /src/views/incidencias/incidenciasView.js

   Responsabilidad:
   - Controlador de la vista Incidencias.
   - Renderizar la plantilla en el contenedor principal.
   - Coordinar carga, estado, paginación, filtros y acciones de UI.
   - Delegar datos a api/store/model/state.
   - Delegar HTML a incidencias.table.template.js.
   - Delegar acciones remotas a incidencias.actions.js.
   - Delegar modales a incidencias.modal.js e incidencias.create.modal.js.
   - No validar rutas.
   - No resolver slug.
   - No registrar globals.
   - No crear bridges.
   - No duplicar Router/Auth/AppCore.
   - No meter patches de datos que pertenecen al modelo/API.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  incidenciasState,
  DEFAULT_PAGE_SIZE as STATE_DEFAULT_PAGE_SIZE,
  setHydrated,
  setLoading,
  setRefreshing,
  setLoaded,
  setError,
  clearError,
  setLastSyncAt,
  touchLastSyncAt,
  setRemoteCount,
  setPage,
  setPageSize,
  setCreating,
  setOpeningTicketId,
  writeCachePayload,
  hydrateStateFromCache,
  getIncidenciasStateSnapshot,
} from "./incidencias.state.js";

import {
  loadIncidencias,
  hydrateFromCache,
} from "./incidencias.api.js";

import {
  getIncidencias,
} from "./incidencias.store.js";

import renderIncidenciasTableTemplate, {
  bindIncidenciasTemplateDom,
} from "./incidencias.table.template.js";

import {
  DEFAULT_PAGE_SIZE as MODEL_DEFAULT_PAGE_SIZE,
  normalizeIncidenciasCollection,
  sortIncidenciasByUpdatedDesc,
  paginateIncidencias,
  findIncidenciaById,
} from "./incidencias.model.js";

import {
  openTicketAction,
  copyTicketIdAction,
  exportIncidenciasCsvAction,
  refreshTicketDetailAction,
} from "./incidencias.actions.js";

import IncidenciasCreateView from "./incidencias.create.modal.js";

import {
  OnionIncidenciasModal,
} from "./incidencias.modal.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const INCIDENCIAS_VIEW_VERSION = "incidencias.view.v1";

const SCOPE = "view:incidencias";

const PAGE_SIZE =
  Number(MODEL_DEFAULT_PAGE_SIZE || STATE_DEFAULT_PAGE_SIZE || 5) || 5;

const DEFAULT_FILTER = "all";
const SEARCH_DEBOUNCE_MS = 180;

const FILTER_ALIASES = Object.freeze({
  all: "all",
  todo: "all",
  todos: "all",
  todas: "all",

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
});

const STATUS_ALIASES = Object.freeze({
  new: "pending",
  created: "pending",
  pending: "pending",
  pendiente: "pending",
  pendientes: "pending",

  open: "open",
  opened: "open",
  active: "open",
  abierta: "open",
  abiertas: "open",
  abierto: "open",
  abiertos: "open",

  progress: "progress",
  in_progress: "progress",
  inprogress: "progress",
  working: "progress",
  assigned: "progress",
  proceso: "progress",
  en_proceso: "progress",
  trabajando: "progress",
  asignada: "progress",
  asignado: "progress",

  resolved: "resolved",
  solved: "resolved",
  resuelta: "resolved",
  resueltas: "resolved",
  resuelto: "resolved",
  resueltos: "resolved",

  closed: "closed",
  close: "closed",
  archived: "closed",
  cancelled: "closed",
  canceled: "closed",
  cerrada: "closed",
  cerradas: "closed",
  cerrado: "closed",
  cerrados: "closed",
});

const OPEN_STATUS_KEYS = new Set([
  "pending",
  "open",
  "progress",
]);

const CLOSED_STATUS_KEYS = new Set([
  "resolved",
  "closed",
]);

/* =========================================================
   VIEW
========================================================= */

export const IncidenciasView = (() => {
  "use strict";

  let initialized = false;
  let destroyed = false;

  let inflightInit = null;
  let inflightReload = null;
  let queuedReloadOptions = null;

  let bindingsCleanup = null;
  let pendingRenderFrame = 0;
  let renderToken = 0;

  let activeFilter = DEFAULT_FILTER;
  let searchQuery = "";
  let searchTimer = 0;

  let lastApiPayload = null;
  let inflightOpenTicket = null;
  let inflightOpenTicketId = "";

  /* =========================================================
     BASICS
  ========================================================= */

  function isFn(value) {
    return typeof value === "function";
  }

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) {
      return fallback;
    }

    const text = String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return text || fallback;
  }

  function safeNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }

    const number = Number(value);

    return Number.isFinite(number)
      ? number
      : fallback;
  }

  function safeArray(value) {
    return Array.isArray(value)
      ? value
      : [];
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function hasOwnKeys(value) {
    return Boolean(
      value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).length
    );
  }

  function first(...values) {
    for (const value of values) {
      if (value === undefined || value === null) {
        continue;
      }

      if (typeof value === "string" && value.trim() === "") {
        continue;
      }

      if (Array.isArray(value) && value.length === 0) {
        continue;
      }

      return value;
    }

    return null;
  }

  function normalizeText(value = "") {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeKey(value = "") {
    return normalizeText(value)
      .replace(/[^\w]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function escapeHtml(value = "") {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.("[IncidenciasView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[IncidenciasView]", ...args);
    } catch {}

    try {
      console.warn("[IncidenciasView]", ...args);
    } catch {}
  }

  function emit(eventName = "", payload = {}) {
    const name = safeText(eventName, "");

    if (!name) {
      return false;
    }

    try {
      AppCore?.events?.emit?.(name, payload);
      return true;
    } catch {
      return false;
    }
  }

  function showToast(message = "", type = "info") {
    const text = safeText(message, "");

    if (!text) {
      return;
    }

    try {
      if (isFn(AppCore?.toast?.[type])) {
        AppCore.toast[type](text);
        return;
      }
    } catch {}

    try {
      AppCore?.toast?.show?.(text, type);
      return;
    } catch {}

    try {
      AppCore?.ui?.toast?.show?.(text, type);
    } catch {}
  }

  function getErrorMessage(error = null) {
    return safeText(
      first(
        error?.message,
        error?.response?.message,
        error?.response?.data?.message,
        error?.data?.message,
        error?.error,
        "No se pudo cargar el historial de incidencias."
      ),
      "No se pudo cargar el historial de incidencias."
    );
  }

  function getContainer() {
    try {
      return (
        AppCore?.dom?.viewContainer ||
        document.getElementById("view-container") ||
        null
      );
    } catch {
      return null;
    }
  }

  function getTimerHost() {
    if (typeof window !== "undefined") {
      return window;
    }

    return globalThis;
  }

  function requestFrame(callback) {
    const host = getTimerHost();

    if (isFn(host.requestAnimationFrame)) {
      return host.requestAnimationFrame(callback);
    }

    return host.setTimeout(callback, 0);
  }

  function cancelFrame(frameId) {
    if (!frameId) {
      return;
    }

    const host = getTimerHost();

    try {
      if (isFn(host.cancelAnimationFrame)) {
        host.cancelAnimationFrame(frameId);
        return;
      }

      host.clearTimeout(frameId);
    } catch {}
  }

  function nextRenderToken() {
    renderToken += 1;
    return renderToken;
  }

  function isActiveRenderToken(token) {
    return !destroyed && token === renderToken;
  }

  function cancelPendingRender() {
    if (!pendingRenderFrame) {
      return;
    }

    cancelFrame(pendingRenderFrame);
    pendingRenderFrame = 0;
  }

  function waitForPaint() {
    return new Promise((resolve) => {
      const host = getTimerHost();

      try {
        if (!isFn(host.requestAnimationFrame)) {
          host.setTimeout(resolve, 0);
          return;
        }

        host.requestAnimationFrame(() => {
          host.requestAnimationFrame(resolve);
        });
      } catch {
        resolve();
      }
    });
  }

  /* =========================================================
     FILTER / SEARCH
  ========================================================= */

  function normalizeFilter(value = DEFAULT_FILTER) {
    const key = normalizeKey(value || DEFAULT_FILTER);

    return FILTER_ALIASES[key] || DEFAULT_FILTER;
  }

  function normalizeStatus(value = "") {
    const key = normalizeKey(value || "");

    return STATUS_ALIASES[key] || key || "pending";
  }

  function getCurrentFilter() {
    return normalizeFilter(
      first(
        incidenciasState.activeFilter,
        incidenciasState.statusFilter,
        incidenciasState.filter,
        activeFilter,
        DEFAULT_FILTER
      )
    );
  }

  function getCurrentSearchQuery() {
    return safeText(
      first(
        incidenciasState.searchQuery,
        incidenciasState.filterQuery,
        incidenciasState.query,
        searchQuery,
        ""
      ),
      ""
    );
  }

  function syncFilterState({
    filter = getCurrentFilter(),
    query = getCurrentSearchQuery(),
  } = {}) {
    activeFilter = normalizeFilter(filter);
    searchQuery = safeText(query, "");

    incidenciasState.activeFilter = activeFilter;
    incidenciasState.statusFilter = activeFilter;
    incidenciasState.filter = activeFilter;

    incidenciasState.searchQuery = searchQuery;
    incidenciasState.filterQuery = searchQuery;
    incidenciasState.query = searchQuery;

    return {
      filter: activeFilter,
      query: searchQuery,
    };
  }

  function getItemStatus(item = {}) {
    const source = safeObject(item);

    return normalizeStatus(
      first(
        source.status,
        source.estado,
        source.state,
        source.lifecycle?.status,
        source.raw?.status,
        source.raw?.estado,
        source.raw?.state,
        source.raw?.lifecycle?.status,
        ""
      )
    );
  }

  function itemMatchesFilter(item = {}, filter = getCurrentFilter()) {
    const currentFilter = normalizeFilter(filter);
    const status = getItemStatus(item);

    if (currentFilter === "all") {
      return true;
    }

    if (currentFilter === "open") {
      return OPEN_STATUS_KEYS.has(status);
    }

    if (currentFilter === "closed") {
      return CLOSED_STATUS_KEYS.has(status);
    }

    return true;
  }

  function getItemSearchText(item = {}) {
    const source = safeObject(item);

    return normalizeText(
      [
        source.ticketId,
        source.id,
        source.code,
        source.ticketCode,
        source.incidenciaId,

        source.subject,
        source.title,
        source.asunto,
        source.description,
        source.descripcion,
        source.message,
        source.preview,

        source.clientName,
        source.clienteNombre,
        source.requesterName,
        source.name,
        source.email,
        source.clientEmail,
        source.clienteEmail,

        source.requesterSnapshot?.name,
        source.requesterSnapshot?.email,
        source.cliente?.nombre,
        source.cliente?.name,
        source.cliente?.email,
        source.client?.name,
        source.client?.email,

        source.assignedTo?.name,
        source.assignedTo?.email,
        source.assignment?.assignedToName,
        source.assignment?.assignedToEmail,
        source.tecnico?.name,
        source.tecnico?.email,
        source.tecnico,

        source.category,
        source.categoria,
        source.subcategory,
        source.subcategoria,
        source.type,
        source.tipo,

        source.status,
        source.estado,
        source.priority,
        source.prioridad,

        source.numeroFacturaLegal,
        source.numeroFactura,
        source.invoiceNumber,
        source.facturaId,
        source.invoiceId,

        source.raw?.search?.text,
      ]
        .map((value) => safeText(value, ""))
        .filter(Boolean)
        .join(" ")
    );
  }

  function itemMatchesSearch(item = {}, query = getCurrentSearchQuery()) {
    const normalizedQuery = normalizeText(query);

    if (!normalizedQuery) {
      return true;
    }

    const terms = normalizedQuery
      .split(" ")
      .map((term) => term.trim())
      .filter(Boolean);

    const haystack = getItemSearchText(item);

    return terms.every((term) => haystack.includes(term));
  }

  function getFilteredItems(items = getItems()) {
    const filter = getCurrentFilter();
    const query = getCurrentSearchQuery();

    return safeArray(items).filter((item) => (
      itemMatchesFilter(item, filter) &&
      itemMatchesSearch(item, query)
    ));
  }

  function clearSearchTimer() {
    if (!searchTimer) {
      return;
    }

    try {
      getTimerHost().clearTimeout(searchTimer);
    } catch {}

    searchTimer = 0;
  }

  function resetPage() {
    try {
      setPage(1);
    } catch {
      incidenciasState.page = 1;
    }
  }

  function setFilter(filter = DEFAULT_FILTER) {
    const nextFilter = normalizeFilter(filter);

    syncFilterState({
      filter: nextFilter,
      query: getCurrentSearchQuery(),
    });

    resetPage();
    rerender();

    emit("incidencias:filter:changed", {
      filter: nextFilter,
      searchQuery: getCurrentSearchQuery(),
      source: SCOPE,
    });

    return nextFilter;
  }

  function setSearchQuery(query = "") {
    const nextQuery = safeText(query, "");

    syncFilterState({
      filter: getCurrentFilter(),
      query: nextQuery,
    });

    resetPage();
    rerender();

    emit("incidencias:search:changed", {
      filter: getCurrentFilter(),
      searchQuery: nextQuery,
      source: SCOPE,
    });

    return nextQuery;
  }

  function scheduleSearchQuery(query = "") {
    clearSearchTimer();

    const value = safeText(query, "");

    searchTimer = getTimerHost().setTimeout(() => {
      searchTimer = 0;
      setSearchQuery(value);
    }, SEARCH_DEBOUNCE_MS);
  }

  function clearFilters() {
    clearSearchTimer();

    syncFilterState({
      filter: DEFAULT_FILTER,
      query: "",
    });

    resetPage();
    rerender();

    emit("incidencias:filters:cleared", {
      source: SCOPE,
    });

    return true;
  }

  function clearSearchOnly() {
    clearSearchTimer();

    syncFilterState({
      filter: getCurrentFilter(),
      query: "",
    });

    resetPage();
    rerender();

    emit("incidencias:search:cleared", {
      filter: getCurrentFilter(),
      source: SCOPE,
    });

    return true;
  }

  /* =========================================================
     DATA
  ========================================================= */

  function extractItemsFromPayload(payload = null) {
    if (Array.isArray(payload)) {
      return payload;
    }

    const data = safeObject(payload);

    return safeArray(
      first(
        data.items,
        data.tickets,
        data.incidencias,
        data.data,
        data.results,
        data.rows,
        data.list,
        data.payload?.items,
        data.payload?.tickets,
        data.payload?.incidencias,
        data.payload?.data,
        data.result?.items,
        data.result?.tickets,
        data.result?.incidencias,
        data.result?.data
      )
    );
  }

  function extractRemoteCount(payload = null, fallback = 0) {
    const data = safeObject(payload);

    return Math.max(
      0,
      safeNumber(
        first(
          data.total,
          data.count,
          data.remoteCount,
          data.totalCount,
          data.meta?.total,
          data.meta?.count,
          data.pagination?.total,
          data.payload?.total,
          data.payload?.count,
          data.result?.total,
          data.result?.count,
          fallback
        ),
        fallback
      )
    );
  }

  function getRawItems() {
    try {
      return safeArray(getIncidencias());
    } catch {
      return [];
    }
  }

  function getItems() {
    try {
      const storeItems = getRawItems();
      const payloadItems = extractItemsFromPayload(lastApiPayload);
      const sourceItems = storeItems.length ? storeItems : payloadItems;

      const normalizedItems = normalizeIncidenciasCollection(sourceItems);

      return safeArray(sortIncidenciasByUpdatedDesc(normalizedItems));
    } catch (error) {
      safeWarn("getItems falló.", error);
      return [];
    }
  }

  function getTicketIdentity(item = {}) {
    if (typeof item === "string" || typeof item === "number") {
      return safeText(item, "");
    }

    const source = safeObject(item);

    return safeText(
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
        source.raw?.entityId
      ),
      ""
    );
  }

  function sameIdentity(a = "", b = "") {
    const left = normalizeText(a);
    const right = normalizeText(b);

    return Boolean(left && right && left === right);
  }

  function findTicketById(ticketId = "") {
    const id = safeText(ticketId, "");

    if (!id) {
      return null;
    }

    return (
      findIncidenciaById(getItems(), id) ||
      getItems().find((item) => sameIdentity(getTicketIdentity(item), id)) ||
      null
    );
  }

  function mergeTicketDetailWithStoreSnapshot(detail = {}, preferredTicketId = "") {
    const remote = safeObject(detail);
    const local = findTicketById(
      first(
        preferredTicketId,
        remote.ticketId,
        remote.id,
        remote.code,
        remote.ticketCode,
        remote.incidenciaId,
        ""
      )
    );

    if (!local && !hasOwnKeys(remote)) {
      return null;
    }

    if (!local) {
      return remote;
    }

    if (!hasOwnKeys(remote)) {
      return local;
    }

    const id = safeText(
      first(
        remote.ticketId,
        remote.id,
        remote.code,
        remote.ticketCode,
        remote.incidenciaId,
        local.ticketId,
        local.id,
        local.code,
        local.ticketCode,
        preferredTicketId
      ),
      ""
    );

    return {
      ...local,
      ...remote,

      id: safeText(first(remote.id, id), id),
      ticketId: safeText(first(remote.ticketId, id), id),
      incidenciaId: safeText(first(remote.incidenciaId, id), id),
      code: safeText(first(remote.code, remote.ticketCode, id), id),
      ticketCode: safeText(first(remote.ticketCode, remote.code, id), id),

      raw: {
        ...safeObject(local.raw),
        ...safeObject(remote.raw || remote),
      },

      meta: {
        ...safeObject(local.meta),
        ...safeObject(local.raw?.meta),
        ...safeObject(remote.raw?.meta),
        ...safeObject(remote.meta),
      },
    };
  }

  function getPaginationMeta(items = getItems()) {
    const filteredItems = getFilteredItems(items);
    const page = safeNumber(incidenciasState.page, 1);
    const pageSize = safeNumber(incidenciasState.pageSize, PAGE_SIZE);

    return paginateIncidencias(
      filteredItems,
      page,
      pageSize || PAGE_SIZE
    );
  }

  function clampPage(items = getItems()) {
    const pagination = getPaginationMeta(items);

    if (safeNumber(incidenciasState.page, 1) !== pagination.page) {
      try {
        setPage(pagination.page);
      } catch {
        incidenciasState.page = pagination.page;
      }
    }

    return pagination;
  }

  function ensureBaseState() {
    const page = safeNumber(incidenciasState.page, 1);
    const pageSize = safeNumber(incidenciasState.pageSize, PAGE_SIZE);

    try {
      setPage(Math.max(1, page));
      setPageSize(Math.max(1, pageSize));
    } catch {
      incidenciasState.page = Math.max(1, page);
      incidenciasState.pageSize = Math.max(1, pageSize);
    }

    if (typeof incidenciasState.loading !== "boolean") {
      incidenciasState.loading = false;
    }

    if (typeof incidenciasState.refreshing !== "boolean") {
      incidenciasState.refreshing = false;
    }

    if (typeof incidenciasState.creating !== "boolean") {
      incidenciasState.creating = false;
    }

    incidenciasState.openingTicketId = safeText(
      incidenciasState.openingTicketId,
      ""
    );

    incidenciasState.selectedTicketId = safeText(
      incidenciasState.selectedTicketId,
      ""
    );

    incidenciasState.error = safeText(
      incidenciasState.error,
      ""
    );

    incidenciasState.remoteCount = Math.max(
      0,
      safeNumber(incidenciasState.remoteCount, 0)
    );

    syncFilterState();

    return incidenciasState;
  }

  function markIdle() {
    try {
      setLoading(false);
      setRefreshing(false);
    } catch {
      incidenciasState.loading = false;
      incidenciasState.refreshing = false;
    }
  }

  function markLoaded(items = [], remoteCountFallback = 0) {
    const total = Math.max(
      safeArray(items).length,
      safeNumber(incidenciasState.remoteCount, 0),
      safeNumber(remoteCountFallback, 0)
    );

    try {
      setRemoteCount(total);
      setLoaded(true);
      setHydrated(true);
      clearError();
    } catch {
      incidenciasState.remoteCount = total;
      incidenciasState.loaded = true;
      incidenciasState.hydrated = true;
      incidenciasState.error = "";
    }

    markIdle();

    return total;
  }

  function markSync() {
    try {
      touchLastSyncAt();
      return;
    } catch {}

    try {
      setLastSyncAt(Date.now());
    } catch {
      incidenciasState.lastSyncAt = Date.now();
    }
  }

  function hydrateBestEffort() {
    let hydrated = false;

    try {
      hydrated = Boolean(
        hydrateStateFromCache?.({
          freshOnly: true,
        })
      );
    } catch {}

    try {
      hydrateFromCache?.();
    } catch {}

    if (getItems().length) {
      try {
        setHydrated(true);
        setLoaded(true);
      } catch {
        incidenciasState.hydrated = true;
        incidenciasState.loaded = true;
      }

      hydrated = true;
    }

    return hydrated;
  }

  function persistCacheBestEffort() {
    try {
      writeCachePayload?.();
      return true;
    } catch {
      return false;
    }
  }

  async function loadData({
    force = false,
    silent = false,
    asRefresh = false,
  } = {}) {
    if (destroyed) {
      return getItems();
    }

    const beforeItems = getItems();
    const hasData = beforeItems.length > 0;

    try {
      clearError();

      if (!hasData && !silent) {
        setLoading(true);
      } else if (asRefresh) {
        setRefreshing(true);
      }
    } catch {
      incidenciasState.error = "";
      incidenciasState.loading = !hasData && !silent;
      incidenciasState.refreshing = hasData && asRefresh;
    }

    if (!silent) {
      rerender();
    }

    try {
      const payload = await loadIncidencias({
        force: Boolean(force),
      });

      lastApiPayload = payload || lastApiPayload;

      const remoteCount = extractRemoteCount(
        payload,
        getItems().length
      );

      if (remoteCount > 0) {
        try {
          setRemoteCount(remoteCount);
        } catch {
          incidenciasState.remoteCount = remoteCount;
        }
      }

      const afterItems = getItems();

      markLoaded(afterItems, remoteCount);
      markSync();
      persistCacheBestEffort();

      emit("incidencias:loaded", {
        items: afterItems,
        total: afterItems.length,
        remoteCount,
        force: Boolean(force),
        silent: Boolean(silent),
        asRefresh: Boolean(asRefresh),
        source: SCOPE,
      });

      return afterItems;
    } catch (error) {
      const message = getErrorMessage(error);

      try {
        setError(message);
        setLoaded(true);
        setHydrated(true);
      } catch {
        incidenciasState.error = message;
        incidenciasState.loaded = true;
        incidenciasState.hydrated = true;
      }

      markIdle();

      if (!silent) {
        showToast(message, "error");
      }

      emit("incidencias:load:error", {
        error,
        message,
        source: SCOPE,
      });

      return getItems();
    } finally {
      markIdle();
    }
  }

  /* =========================================================
     RENDER
  ========================================================= */

  function getCurrentUserSnapshot() {
    const coreState = safeObject(AppCore?.state);
    const authState = safeObject(coreState.auth);

    return safeObject(
      first(
        coreState.user,
        coreState.currentUser,
        coreState.sessionUser,
        authState.user,
        {}
      )
    );
  }

  function getCurrentUserAvatar(user = getCurrentUserSnapshot()) {
    const source = safeObject(user);
    const raw = safeObject(source.raw);

    return safeText(
      first(
        source.avatar,
        source.avatarUrl,
        source.photo,
        source.photoUrl,
        source.picture,
        source.pictureUrl,
        source.image,
        source.imageUrl,
        raw.avatar,
        raw.avatarUrl,
        raw.photo,
        raw.photoUrl,
        raw.picture,
        raw.pictureUrl,
        raw.image,
        raw.imageUrl
      ),
      ""
    );
  }

  function applyErrorBanner(container) {
    if (!container) {
      return;
    }

    const previous = container.querySelector(
      "[data-incidencias-error-banner='true']"
    );

    if (previous) {
      previous.remove();
    }

    const message = safeText(incidenciasState.error, "");

    if (!message) {
      return;
    }

    const anchor =
      container.querySelector("[data-incidencias-history-head='true']") ||
      container.querySelector("[data-incidencias-table-head='true']") ||
      container.querySelector(".incidencias-history-head") ||
      container.querySelector(".content-wrapper");

    if (!anchor) {
      return;
    }

    const banner = document.createElement("div");

    banner.className = "incidencias-error-banner";
    banner.dataset.incidenciasErrorBanner = "true";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.textContent = message;

    anchor.insertAdjacentElement("afterend", banner);
  }

  function decorateDom(container) {
    if (!container) {
      return container;
    }

    applyErrorBanner(container);

    try {
      bindIncidenciasTemplateDom?.(container);
    } catch (error) {
      safeWarn("bindIncidenciasTemplateDom falló.", error);
    }

    return container;
  }

  function buildTemplatePayload() {
    ensureBaseState();

    const allItems = getItems();
    const filteredItems = getFilteredItems(allItems);
    const pagination = clampPage(allItems);

    const currentFilter = getCurrentFilter();
    const currentSearchQuery = getCurrentSearchQuery();

    const currentUser = getCurrentUserSnapshot();
    const currentUserAvatar = getCurrentUserAvatar(currentUser);

    const remoteCount = Math.max(
      allItems.length,
      safeNumber(incidenciasState.remoteCount, allItems.length)
    );

    return {
      items: allItems,
      filteredItems,
      pageItems: pagination.items,

      totalCount: remoteCount,
      remoteCount,

      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: pagination.totalPages,

      lastUpdatedAt: incidenciasState.lastSyncAt || "",

      title: "Tus incidencias y solicitudes",
      subtitle:
        "Consulta el estado de tus incidencias, revisa actualizaciones y crea nuevas solicitudes.",

      filter: currentFilter,
      activeFilter: currentFilter,
      statusFilter: currentFilter,

      search: currentSearchQuery,
      searchQuery: currentSearchQuery,
      filterQuery: currentSearchQuery,
      query: currentSearchQuery,
      q: currentSearchQuery,

      state: {
        ...incidenciasState,

        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: pagination.totalPages,
        totalCount: remoteCount,
        remoteCount,

        selectedTicketId: safeText(incidenciasState.selectedTicketId, ""),
        openingTicketId: safeText(incidenciasState.openingTicketId, ""),

        creating: Boolean(incidenciasState.creating),
        loading: Boolean(incidenciasState.loading),
        refreshing: Boolean(incidenciasState.refreshing),

        user: currentUser,
        currentUser,
        sessionUser: currentUser,

        avatar: currentUserAvatar,
        avatarUrl: currentUserAvatar,
        userAvatar: currentUserAvatar,
        userAvatarUrl: currentUserAvatar,

        filter: currentFilter,
        activeFilter: currentFilter,
        statusFilter: currentFilter,

        search: currentSearchQuery,
        searchQuery: currentSearchQuery,
        filterQuery: currentSearchQuery,
        query: currentSearchQuery,
        q: currentSearchQuery,
      },
    };
  }

  function buildHtml() {
    const payload = buildTemplatePayload();

    return `
      <section
        class="panel-content dashboard ready"
        data-view="incidencias"
        data-incidencias-scope="${escapeHtml(SCOPE)}"
      >
        <div class="content-wrapper incidencias-view-shell">
          ${renderIncidenciasTableTemplate(payload)}
        </div>
      </section>
    `;
  }

  function render() {
    if (destroyed) {
      return null;
    }

    const container = getContainer();

    if (!container) {
      safeWarn("No existe #view-container para renderizar incidencias.");
      return null;
    }

    ensureBaseState();

    try {
      AppCore?.setDocumentTitle?.("Incidencias");
    } catch {}

    container.innerHTML = buildHtml();

    decorateDom(container);

    try {
      setHydrated(true);
    } catch {
      incidenciasState.hydrated = true;
    }

    return container;
  }

  function rerender() {
    if (destroyed) {
      return null;
    }

    cancelPendingRender();

    const container = render();

    if (container && !destroyed) {
      bind(container);
    }

    return container;
  }

  function scheduleRerender() {
    if (destroyed) {
      return null;
    }

    if (pendingRenderFrame) {
      return pendingRenderFrame;
    }

    pendingRenderFrame = requestFrame(() => {
      pendingRenderFrame = 0;
      rerender();
    });

    return pendingRenderFrame;
  }

  async function renderAndLoad(options = {}) {
    const token = nextRenderToken();

    hydrateBestEffort();
    ensureBaseState();
    rerender();

    await loadData(options);

    if (!isActiveRenderToken(token)) {
      return api;
    }

    rerender();

    return api;
  }

  /* =========================================================
     MODALS / ACTIONS
  ========================================================= */

  function openDetailModal(detail = {}, options = {}) {
    const payload = safeObject(detail);

    if (!hasOwnKeys(payload)) {
      return false;
    }

    try {
      if (isFn(OnionIncidenciasModal?.open)) {
        OnionIncidenciasModal.open(payload, {
          source: SCOPE,
          ...safeObject(options),
        });

        return true;
      }
    } catch (error) {
      safeWarn("No se pudo abrir el modal de incidencia.", error);
    }

    return false;
  }

  function updateDetailModal(detail = {}, options = {}) {
    const payload = safeObject(detail);

    if (!hasOwnKeys(payload)) {
      return false;
    }

    try {
      if (isFn(OnionIncidenciasModal?.update)) {
        OnionIncidenciasModal.update(payload, {
          source: SCOPE,
          preserveTransient: true,
          preserveFocus: true,
          focus: false,
          ...safeObject(options),
        });

        return true;
      }
    } catch (error) {
      safeWarn("No se pudo actualizar el modal de incidencia.", error);
    }

    return openDetailModal(payload, options);
  }

  function closeDetailModal() {
    try {
      if (isFn(OnionIncidenciasModal?.close)) {
        OnionIncidenciasModal.close();
        return true;
      }
    } catch {}

    return false;
  }

  function openCreateModal(draft = {}) {
    const payload = safeObject(draft);

    try {
      if (isFn(IncidenciasCreateView?.open)) {
        IncidenciasCreateView.open(payload);
        return true;
      }

      if (isFn(IncidenciasCreateView?.mount)) {
        IncidenciasCreateView.mount(payload);
        return true;
      }

      if (isFn(IncidenciasCreateView?.init)) {
        IncidenciasCreateView.init(payload);
        return true;
      }
    } catch (error) {
      safeWarn("No se pudo abrir el modal de creación.", error);
    }

    return false;
  }

  async function handleOpenTicket(ticketId = "", options = {}) {
    const id = safeText(ticketId, "");
    const opts = safeObject(options);

    if (!id) {
      showToast("No se pudo identificar la incidencia.", "error");
      return null;
    }

    if (
      inflightOpenTicket &&
      inflightOpenTicketId &&
      sameIdentity(inflightOpenTicketId, id)
    ) {
      return inflightOpenTicket;
    }

    inflightOpenTicketId = id;

    inflightOpenTicket = (async () => {
      const localSnapshot = findTicketById(id);

      incidenciasState.selectedTicketId = id;

      try {
        setOpeningTicketId(id);
      } catch {
        incidenciasState.openingTicketId = id;
      }

      if (localSnapshot && opts.openImmediate !== false) {
        openDetailModal({
          ...localSnapshot,
          meta: {
            ...safeObject(localSnapshot.meta),
            detailLoading: true,
          },
        });
      }

      rerender();
      await waitForPaint();

      try {
        const remoteDetail = await openTicketAction({
          ticketId: id,
          preferFresh: opts.preferFresh !== false,
          silent: opts.silent !== false,
        });

        const detail = mergeTicketDetailWithStoreSnapshot(
          remoteDetail || localSnapshot || {},
          id
        );

        if (!detail) {
          showToast("No se pudo abrir la incidencia.", "error");
          return null;
        }

        updateDetailModal({
          ...detail,
          meta: {
            ...safeObject(detail.meta),
            detailLoading: false,
          },
        });

        emit("incidencias:open:success", {
          ticketId: id,
          incidenciaId: id,
          detail,
          source: SCOPE,
        });

        return detail;
      } catch (error) {
        safeWarn("handleOpenTicket falló.", error);

        if (localSnapshot) {
          updateDetailModal({
            ...localSnapshot,
            meta: {
              ...safeObject(localSnapshot.meta),
              detailLoading: false,
              detailFallback: true,
            },
          });

          showToast(
            "Incidencia abierta con datos locales. No se pudo cargar el detalle remoto.",
            "warning"
          );

          return localSnapshot;
        }

        showToast("No se pudo abrir la incidencia.", "error");

        emit("incidencias:open:error", {
          ticketId: id,
          incidenciaId: id,
          error,
          source: SCOPE,
        });

        return null;
      } finally {
        try {
          setOpeningTicketId("");
        } catch {
          incidenciasState.openingTicketId = "";
        }

        if (!destroyed) {
          rerender();
        }
      }
    })();

    try {
      return await inflightOpenTicket;
    } finally {
      inflightOpenTicket = null;
      inflightOpenTicketId = "";
    }
  }

  function extractTicketId(payload = {}) {
    if (typeof payload === "string" || typeof payload === "number") {
      return safeText(payload, "");
    }

    const source = safeObject(payload);

    return safeText(
      first(
        source.ticketId,
        source.incidenciaId,
        source.id,
        source._id,
        source.code,
        source.ticketCode,
        source.value,
        source.key,

        source.detail?.ticketId,
        source.detail?.incidenciaId,
        source.detail?.id,
        source.detail?.code,
        source.detail?.ticketCode,

        source.ticket?.ticketId,
        source.ticket?.incidenciaId,
        source.ticket?.id,
        source.ticket?.code,
        source.ticket?.ticketCode,

        source.incidencia?.ticketId,
        source.incidencia?.incidenciaId,
        source.incidencia?.id,
        source.incidencia?.code,
        source.incidencia?.ticketCode,

        source.item?.ticketId,
        source.item?.incidenciaId,
        source.item?.id,
        source.item?.code,
        source.item?.ticketCode
      ),
      ""
    );
  }

  async function openTicketFromExternalRequest(payload = {}) {
    const source = safeObject(payload);
    const ticketId = extractTicketId(payload);

    if (!ticketId) {
      showToast("No se pudo identificar la incidencia.", "error");
      return null;
    }

    if (!getItems().length && !incidenciasState.loaded) {
      await reload({
        force: false,
        silent: true,
        asRefresh: false,
      });
    }

    return handleOpenTicket(ticketId, {
      skipThrottle: true,
      source: safeText(source.source, "external"),
      detail: first(
        source.detail,
        source.ticket,
        source.incidencia,
        source.item,
        source
      ),
    });
  }

  async function handleRefreshTicketDetail(ticketId = "") {
    const id = safeText(ticketId, "");

    if (!id) {
      return null;
    }

    try {
      const detail = await refreshTicketDetailAction({
        ticketId: id,
        silent: true,
      });

      const patchedDetail = mergeTicketDetailWithStoreSnapshot(detail, id);

      if (patchedDetail) {
        updateDetailModal(patchedDetail);
      }

      emit("incidencias:detail:refresh:success", {
        ticketId: id,
        incidenciaId: id,
        detail: patchedDetail,
        source: SCOPE,
      });

      return patchedDetail;
    } catch (error) {
      safeWarn("No se pudo actualizar el detalle de la incidencia.", error);
      showToast("No se pudo actualizar la incidencia.", "error");

      return null;
    }
  }

  async function handleCopyTicketId(ticketId = "") {
    const id = safeText(ticketId, "");

    if (!id) {
      showToast("No hay referencia para copiar.", "error");
      return false;
    }

    try {
      return await copyTicketIdAction({
        ticketId: id,
        silent: false,
      });
    } catch (error) {
      safeWarn("No se pudo copiar la referencia.", error);
      showToast("No se pudo copiar la referencia.", "error");
      return false;
    }
  }

  function handleExportCsv() {
    try {
      return exportIncidenciasCsvAction({
        silent: false,
      });
    } catch (error) {
      safeWarn("No se pudo exportar el historial.", error);
      showToast("No se pudo exportar el historial.", "error");
      return false;
    }
  }

  async function handleCreateIncidencia(options = {}) {
    const opts = safeObject(options);

    try {
      setCreating(true);
    } catch {
      incidenciasState.creating = true;
    }

    rerender();
    await waitForPaint();

    try {
      const opened = openCreateModal(opts.draft || {});

      if (!opened) {
        showToast("No se pudo abrir el formulario.", "error");
        return false;
      }

      emit("incidencias:create:open", {
        draft: opts.draft || {},
        source: SCOPE,
      });

      return true;
    } finally {
      try {
        setCreating(false);
      } catch {
        incidenciasState.creating = false;
      }

      if (!destroyed) {
        rerender();
      }
    }
  }

  /* =========================================================
     PAGINATION
  ========================================================= */

  function goToPage(page = 1) {
    if (incidenciasState.loading || incidenciasState.refreshing) {
      return safeNumber(incidenciasState.page, 1);
    }

    const pagination = paginateIncidencias(
      getFilteredItems(getItems()),
      page,
      safeNumber(incidenciasState.pageSize, PAGE_SIZE)
    );

    try {
      setPage(pagination.page);
    } catch {
      incidenciasState.page = pagination.page;
    }

    rerender();

    return pagination.page;
  }

  function goPrevPage() {
    return goToPage(safeNumber(incidenciasState.page, 1) - 1);
  }

  function goNextPage() {
    return goToPage(safeNumber(incidenciasState.page, 1) + 1);
  }

  function changePageSize(value = PAGE_SIZE) {
    const nextSize = Math.max(1, safeNumber(value, PAGE_SIZE));

    try {
      setPageSize(nextSize);
      setPage(1);
    } catch {
      incidenciasState.pageSize = nextSize;
      incidenciasState.page = 1;
    }

    rerender();

    return nextSize;
  }

  /* =========================================================
     BINDINGS
  ========================================================= */

  function getActionTarget(event, actions = []) {
    const selectors = safeArray(actions)
      .map((action) => [
        `[data-incidencias-action="${action}"]`,
        `[data-action="${action}"]`,
      ].join(","))
      .join(",");

    if (!selectors) {
      return null;
    }

    return event.target?.closest?.(selectors) || null;
  }

  function getTicketIdFromElement(element = null) {
    if (!element) {
      return "";
    }

    const row =
      element.closest?.("[data-ticket-id]") ||
      element.closest?.("[data-incidencia-id]") ||
      element.closest?.("[data-ticket-code]") ||
      null;

    return safeText(
      first(
        element.dataset?.ticketId,
        element.dataset?.incidenciaId,
        element.dataset?.ticketCode,

        element.getAttribute?.("data-ticket-id"),
        element.getAttribute?.("data-incidencia-id"),
        element.getAttribute?.("data-ticket-code"),

        row?.dataset?.ticketId,
        row?.dataset?.incidenciaId,
        row?.dataset?.ticketCode,

        row?.getAttribute?.("data-ticket-id"),
        row?.getAttribute?.("data-incidencia-id"),
        row?.getAttribute?.("data-ticket-code")
      ),
      ""
    );
  }

  function getSearchInput(event) {
    return (
      event.target?.closest?.("#incidencias-search-input") ||
      event.target?.closest?.("#incidencias-filter-search") ||
      event.target?.closest?.("[data-incidencias-search-input='true']") ||
      event.target?.closest?.("[data-incidencias-field='search']") ||
      event.target?.closest?.("[data-field='search']") ||
      null
    );
  }

  function isInteractiveElement(target = null) {
    return Boolean(
      target?.closest?.(
        [
          "a",
          "button",
          "input",
          "select",
          "textarea",
          "label",
          "[role='button']",
          "[data-action]",
          "[data-incidencias-action]",
        ].join(",")
      )
    );
  }

  function bindNativeActions(container) {
    if (!container) {
      return () => {};
    }

    const onClick = async (event) => {
      if (destroyed) {
        return;
      }

      const createButton =
        getActionTarget(event, [
          "create",
          "new",
          "new-ticket",
          "create-ticket",
          "create-incidencia",
        ]) ||
        event.target?.closest?.("#incidencias-create-btn");

      if (createButton) {
        event.preventDefault();
        event.stopPropagation();

        await handleCreateIncidencia();
        return;
      }

      const refreshButton =
        getActionTarget(event, [
          "refresh",
          "reload",
        ]) ||
        event.target?.closest?.("#incidencias-refresh-btn");

      if (refreshButton) {
        event.preventDefault();

        await reload({
          force: true,
          asRefresh: true,
        });

        return;
      }

      const retryButton =
        getActionTarget(event, [
          "retry",
        ]) ||
        event.target?.closest?.("#incidencias-retry-btn");

      if (retryButton) {
        event.preventDefault();

        await reload({
          force: true,
          asRefresh: false,
        });

        return;
      }

      const exportButton =
        getActionTarget(event, [
          "export",
          "export-csv",
        ]) ||
        event.target?.closest?.("#incidencias-export-btn");

      if (exportButton) {
        event.preventDefault();
        handleExportCsv();
        return;
      }

      const filterButton = getActionTarget(event, [
        "filter",
        "filter-incidencias",
        "status-filter",
        "incidencias-filter",
      ]);

      if (filterButton) {
        event.preventDefault();
        event.stopPropagation();

        setFilter(
          first(
            filterButton.dataset?.filter,
            filterButton.dataset?.filterStatus,
            filterButton.getAttribute?.("data-filter"),
            filterButton.getAttribute?.("data-filter-status"),
            DEFAULT_FILTER
          )
        );

        return;
      }

      const clearSearchButton = getActionTarget(event, [
        "clear-filter-search",
        "clear-search",
      ]);

      if (clearSearchButton) {
        event.preventDefault();
        event.stopPropagation();

        clearSearchOnly();
        return;
      }

      const clearFiltersButton = getActionTarget(event, [
        "clear-filters",
        "reset-filters",
        "filters-clear",
      ]);

      if (clearFiltersButton) {
        event.preventDefault();
        event.stopPropagation();

        clearFilters();
        return;
      }

      const pageButton = getActionTarget(event, [
        "page",
        "go-page",
      ]);

      if (pageButton) {
        event.preventDefault();

        goToPage(
          safeNumber(
            first(
              pageButton.dataset?.page,
              pageButton.getAttribute?.("data-page")
            ),
            incidenciasState.page || 1
          )
        );

        return;
      }

      const prevButton = getActionTarget(event, [
        "prev-page",
        "pagination-prev",
      ]);

      if (prevButton) {
        event.preventDefault();
        goPrevPage();
        return;
      }

      const nextButton = getActionTarget(event, [
        "next-page",
        "pagination-next",
      ]);

      if (nextButton) {
        event.preventDefault();
        goNextPage();
        return;
      }

      const copyButton = getActionTarget(event, [
        "copy",
        "copy-ticket-id",
        "copy-id",
      ]);

      if (copyButton) {
        event.preventDefault();
        event.stopPropagation();

        await handleCopyTicketId(getTicketIdFromElement(copyButton));
        return;
      }

      const detailButton = getActionTarget(event, [
        "detail",
        "open",
        "open-ticket",
        "view-ticket",
      ]);

      if (detailButton) {
        event.preventDefault();
        event.stopPropagation();

        await handleOpenTicket(getTicketIdFromElement(detailButton));
        return;
      }

      const row =
        event.target?.closest?.("[data-ticket-row='true']") ||
        event.target?.closest?.(".incidencias-row") ||
        null;

      if (row && !isInteractiveElement(event.target)) {
        event.preventDefault();

        await handleOpenTicket(getTicketIdFromElement(row));
      }
    };

    const onInput = (event) => {
      if (destroyed) {
        return;
      }

      const searchInput = getSearchInput(event);

      if (searchInput) {
        scheduleSearchQuery(searchInput.value);
      }
    };

    const onChange = (event) => {
      if (destroyed) {
        return;
      }

      const searchInput = getSearchInput(event);

      if (searchInput) {
        clearSearchTimer();
        setSearchQuery(searchInput.value);
        return;
      }

      const pageSizeInput =
        event.target?.closest?.("[data-incidencias-field='page-size']") ||
        event.target?.closest?.("[data-field='page-size']") ||
        null;

      if (pageSizeInput) {
        changePageSize(pageSizeInput.value);
      }
    };

    container.addEventListener("click", onClick);
    container.addEventListener("input", onInput);
    container.addEventListener("change", onChange);

    return () => {
      try {
        container.removeEventListener("click", onClick);
        container.removeEventListener("input", onInput);
        container.removeEventListener("change", onChange);
      } catch {}
    };
  }

  function cleanupBindings() {
    clearSearchTimer();

    try {
      bindingsCleanup?.();
    } catch {}

    bindingsCleanup = null;
  }

  function bind(container = getContainer()) {
    cleanupBindings();

    if (destroyed || !container) {
      return false;
    }

    bindingsCleanup = bindNativeActions(container);

    return true;
  }

  /* =========================================================
     LIFECYCLE
  ========================================================= */

  function mergeReloadOptions(base = {}, incoming = {}) {
    const baseOptions = safeObject(base);
    const incomingOptions = safeObject(incoming);

    const hasIncomingSilent = Object.prototype.hasOwnProperty.call(
      incomingOptions,
      "silent"
    );

    const hasBaseSilent = Object.prototype.hasOwnProperty.call(
      baseOptions,
      "silent"
    );

    return {
      ...baseOptions,
      ...incomingOptions,

      force: Boolean(baseOptions.force || incomingOptions.force),
      asRefresh: Boolean(baseOptions.asRefresh || incomingOptions.asRefresh),
      silent: hasIncomingSilent
        ? Boolean(incomingOptions.silent)
        : hasBaseSilent
          ? Boolean(baseOptions.silent)
          : false,
    };
  }

  async function reload(options = {}) {
    if (destroyed) {
      return api;
    }

    const incomingOptions = safeObject(options);

    if (inflightReload) {
      queuedReloadOptions = mergeReloadOptions(
        queuedReloadOptions || {},
        incomingOptions
      );

      return inflightReload;
    }

    inflightReload = (async () => {
      let currentOptions = incomingOptions;

      do {
        queuedReloadOptions = null;

        await renderAndLoad(currentOptions);

        currentOptions = queuedReloadOptions;
      } while (currentOptions && !destroyed);

      return api;
    })();

    try {
      return await inflightReload;
    } finally {
      inflightReload = null;
      queuedReloadOptions = null;
    }
  }

  async function init(options = {}) {
    if (destroyed) {
      destroyed = false;
    }

    if (inflightInit) {
      return inflightInit;
    }

    if (initialized) {
      ensureBaseState();
      rerender();

      if (!incidenciasState.loaded && !inflightReload) {
        await reload({
          force: false,
          silent: true,
          asRefresh: false,
        });
      }

      return api;
    }

    initialized = true;
    destroyed = false;

    inflightInit = (async () => {
      safeLog("init");

      await renderAndLoad({
        force: Boolean(options.force),
        silent: Boolean(options.silent),
        asRefresh: false,
      });

      return api;
    })();

    try {
      return await inflightInit;
    } finally {
      inflightInit = null;
    }
  }

  function destroy() {
    destroyed = true;
    initialized = false;

    nextRenderToken();
    cancelPendingRender();
    cleanupBindings();

    queuedReloadOptions = null;
    inflightReload = null;
    inflightInit = null;
    inflightOpenTicket = null;
    inflightOpenTicketId = "";

    try {
      setOpeningTicketId("");
      setCreating(false);
      setRefreshing(false);
      setLoading(false);
    } catch {
      incidenciasState.openingTicketId = "";
      incidenciasState.creating = false;
      incidenciasState.refreshing = false;
      incidenciasState.loading = false;
    }

    incidenciasState.selectedTicketId = "";

    try {
      IncidenciasCreateView?.close?.();
    } catch {}

    try {
      closeDetailModal();
    } catch {}

    safeLog("destroy");
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */

  const api = {
    init,
    mount: init,

    render: rerender,
    scheduleRender: scheduleRerender,

    reload,
    refresh: reload,

    destroy,
    unmount: destroy,

    openTicket: handleOpenTicket,
    open: handleOpenTicket,
    openById: handleOpenTicket,
    openTicketFromExternalRequest,

    closeTicket: closeDetailModal,
    copyTicketId: handleCopyTicketId,
    exportCsv: handleExportCsv,
    createIncidencia: handleCreateIncidencia,
    create: handleCreateIncidencia,

    refreshTicketDetail: handleRefreshTicketDetail,
    refreshDetail: handleRefreshTicketDetail,

    goToPage,
    goPrevPage,
    prevPage: goPrevPage,
    goNextPage,
    nextPage: goNextPage,
    changePageSize,
    setPageSize: changePageSize,

    setFilter,
    setSearchQuery,
    search: setSearchQuery,
    clearFilters,
    clearSearchOnly,
    clearSearch: clearSearchOnly,

    getItems: () => getItems(),
    getFilteredItems: () => getFilteredItems(getItems()),
    getPageItems: () => getPaginationMeta(getItems()).items,
    getPagination: () => getPaginationMeta(getItems()),

    getTicketById: findTicketById,
    findTicketById,

    mergeTicketDetailWithStoreSnapshot,

    getState: () => {
      const allItems = getItems();
      const filteredItems = getFilteredItems(allItems);
      const pagination = getPaginationMeta(allItems);
      const currentUser = getCurrentUserSnapshot();
      const currentUserAvatar = getCurrentUserAvatar(currentUser);

      return {
        ...safeObject(getIncidenciasStateSnapshot?.()),

        initialized,
        destroyed,

        hasInflightInit: Boolean(inflightInit),
        hasInflightReload: Boolean(inflightReload),
        hasQueuedReload: Boolean(queuedReloadOptions),
        hasInflightOpenTicket: Boolean(inflightOpenTicket),
        inflightOpenTicketId,

        user: currentUser,
        currentUser,
        sessionUser: currentUser,

        avatar: currentUserAvatar,
        avatarUrl: currentUserAvatar,
        userAvatar: currentUserAvatar,
        userAvatarUrl: currentUserAvatar,

        filter: getCurrentFilter(),
        activeFilter: getCurrentFilter(),
        statusFilter: getCurrentFilter(),

        search: getCurrentSearchQuery(),
        searchQuery: getCurrentSearchQuery(),
        filterQuery: getCurrentSearchQuery(),
        query: getCurrentSearchQuery(),

        itemsCount: allItems.length,
        filteredItemsCount: filteredItems.length,
        pagination,
      };
    },

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },
  };

  return api;
})();

export default IncidenciasView;
