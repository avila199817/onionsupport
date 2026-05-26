/* =========================================================
   Onion Support - Incidencias View
   Archivo: /src/views/incidencias/incidenciasView.js

   Responsabilidad:
   - Controlador de la vista Incidencias.
   - Renderizar la plantilla en el contenedor principal.
   - Coordinar carga, estado, filtros, scroll incremental y acciones de UI.
   - Delegar datos a api/store/model/state.
   - Delegar HTML a incidencias.table.template.js.
   - Delegar acciones remotas a incidencias.actions.js.
   - Delegar modales a incidencias.modal.js e incidencias.create.modal.js.
   - Delegar eventos DOM generales a incidencias.bindings.js.
   - Mantener compatibilidad con llamadas antiguas de paginación sin mostrar páginas.
   - Pintar incidencias de más nuevas a más antiguas.
   - Ir ampliando la lista visible al hacer scroll, estilo feed/infinite scroll.
   - Primera entrada: pintar estructura/cache/skeleton y cargar remoto tras paint.
   - La primera carga remota se hace una sola vez por runtime SPA.
   - La cache no bloquea la primera carga remota útil.
   - Después de la primera carga remota, montar la vista usa memoria/store.
   - Reload/refresh explícitos siguen permitidos.
   - Mantener bindings delegados estables entre rerenders.
   - Reenganchar sólo scroll/sentinel cuando el DOM se repinta.
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
  filterIncidencias,
  normalizeFilter as normalizeModelFilter,
  normalizeIncidenciasCollection,
  sortIncidenciasByUpdatedDesc,
  findIncidenciaById,
} from "./incidencias.model.js";

import {
  openTicketAction,
  copyTicketIdAction,
  exportIncidenciasCsvAction,
  refreshTicketDetailAction,
} from "./incidencias.actions.js";

import {
  bindIncidenciasEvents,
} from "./incidencias.bindings.js";

import IncidenciasCreateView from "./incidencias.create.modal.js";

import {
  OnionIncidenciasModal,
} from "./incidencias.modal.js";

import {
  BrowserDocument,
  BrowserWindow,
  safeText,
  safeNumber,
  safeArray,
  safeObject,
  first,
  hasOwnKeys,
  escapeHtml,
  normalizeText,
  showToast,
  getErrorMessage as getUtilsErrorMessage,
  safeEmit,
  safeImageSrc,
} from "./incidencias.utils.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const INCIDENCIAS_VIEW_VERSION =
  "incidencias.view.v8.load-once-memory-first";

const SCOPE = "view:incidencias";

const LEGACY_PAGE_SIZE =
  Number(MODEL_DEFAULT_PAGE_SIZE || STATE_DEFAULT_PAGE_SIZE || 5) || 5;

const INITIAL_VISIBLE_COUNT = Math.max(
  10,
  Number(STATE_DEFAULT_PAGE_SIZE || MODEL_DEFAULT_PAGE_SIZE || 20) || 20
);

const LOAD_MORE_BATCH = Math.max(INITIAL_VISIBLE_COUNT, 20);
const SCROLL_THRESHOLD_PX = 900;
const DEFAULT_FILTER = "all";

/* =========================================================
   VIEW
========================================================= */

export const IncidenciasView = (() => {
  "use strict";

  let initialized = false;
  let destroyed = false;

  let initialRemoteLoadRequested = false;
  let initialRemoteLoadScheduled = false;
  let initialRemoteLoadCompleted = false;
  let initialRemoteLoadCompletedAt = "";

  let inflightInit = null;
  let inflightReload = null;
  let queuedReloadOptions = null;

  let bindingsCleanup = null;
  let boundContainer = null;
  let scrollCleanup = null;

  let pendingRenderFrame = 0;
  let renderToken = 0;

  let activeFilter = DEFAULT_FILTER;
  let searchQuery = "";

  let lastApiPayload = null;
  let inflightOpenTicket = null;
  let inflightOpenTicketId = "";

  let inflightLoadMore = null;

  /* =========================================================
     BASICS
  ========================================================= */

  function isBrowser() {
    return Boolean(BrowserWindow && BrowserDocument);
  }

  function isElement(value = null) {
    return Boolean(value && typeof value === "object" && value.nodeType === 1);
  }

  function isFn(value) {
    return typeof value === "function";
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
    return safeEmit(eventName, payload);
  }

  function getLoadErrorMessage(error = null) {
    return getUtilsErrorMessage(
      error,
      "No se pudo cargar el historial de incidencias."
    );
  }

  function getContainer() {
    try {
      return (
        AppCore?.dom?.viewContainer ||
        BrowserDocument?.getElementById?.("view-container") ||
        null
      );
    } catch {
      return null;
    }
  }

  function getTimerHost() {
    return BrowserWindow || globalThis;
  }

  function nowIso() {
    try {
      return new Date().toISOString();
    } catch {
      return "";
    }
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

  function runDeferred(label = "async", callback = null) {
    if (!isFn(callback)) {
      return false;
    }

    Promise.resolve()
      .then(callback)
      .catch((error) => {
        safeWarn(`${label} falló.`, error);
      });

    return true;
  }

  function stateHasLoadedPayload() {
    return Boolean(
      incidenciasState.loaded === true &&
        incidenciasState.hydrated === true
    );
  }

  function stateHasVisibleData(items = null) {
    const sourceItems = Array.isArray(items)
      ? items
      : getItems();

    return safeArray(sourceItems).length > 0;
  }

  function shouldLoadOnInit(options = {}) {
    const opts = safeObject(options);

    if (opts.force === true) {
      return true;
    }

    if (inflightReload || initialRemoteLoadScheduled) {
      return false;
    }

    if (!initialRemoteLoadCompleted) {
      return true;
    }

    if (!stateHasLoadedPayload() && !stateHasVisibleData()) {
      return true;
    }

    return false;
  }

  function startInitialRemoteLoadAfterPaint(options = {}, label = "incidencias:init:initial-load") {
    const opts = safeObject(options);

    if (inflightReload || initialRemoteLoadScheduled) {
      return false;
    }

    if (initialRemoteLoadCompleted && opts.force !== true) {
      return false;
    }

    initialRemoteLoadRequested = true;
    initialRemoteLoadScheduled = true;

    return runDeferred(label, async () => {
      await waitForPaint();

      initialRemoteLoadScheduled = false;

      if (destroyed) {
        return api;
      }

      return reload({
        ...opts,
        force: true,
        initial: true,
        paintBeforeLoad: false,
        renderBeforeLoad: false,
      });
    });
  }

  function setInitialLoadVisualState(options = {}, items = null) {
    const opts = safeObject(options);
    const sourceItems = Array.isArray(items)
      ? items
      : getItems();

    const hasData = sourceItems.length > 0;

    try {
      clearError();

      if (!hasData && !opts.silent) {
        setLoading(true);
      } else if (hasData && opts.asRefresh) {
        setRefreshing(true);
      } else {
        setLoading(false);
        setRefreshing(false);
      }
    } catch {
      incidenciasState.error = "";
      incidenciasState.loading = !hasData && !opts.silent;
      incidenciasState.refreshing = hasData && Boolean(opts.asRefresh);
    }

    return {
      hasData,
      loading: Boolean(incidenciasState.loading),
      refreshing: Boolean(incidenciasState.refreshing),
    };
  }

  /* =========================================================
     FILTER / SEARCH
  ========================================================= */

  function normalizeFilter(value = DEFAULT_FILTER) {
    try {
      return normalizeModelFilter(value || DEFAULT_FILTER) || DEFAULT_FILTER;
    } catch {
      return DEFAULT_FILTER;
    }
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
        incidenciasState.q,
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
    incidenciasState.q = searchQuery;

    return {
      filter: activeFilter,
      query: searchQuery,
    };
  }

  function getFilteredItems(items = getItems()) {
    return filterIncidencias(safeArray(items), {
      filter: getCurrentFilter(),
      searchQuery: getCurrentSearchQuery(),
    });
  }

  function getFilterCounts(items = getItems()) {
    const sourceItems = safeArray(items);
    const query = getCurrentSearchQuery();

    return {
      all: filterIncidencias(sourceItems, {
        filter: "all",
        searchQuery: query,
      }).length,
      open: filterIncidencias(sourceItems, {
        filter: "open",
        searchQuery: query,
      }).length,
      closed: filterIncidencias(sourceItems, {
        filter: "closed",
        searchQuery: query,
      }).length,
    };
  }

  function resetVisibleWindow(items = null) {
    const sourceItems = Array.isArray(items)
      ? items
      : getItems();

    const filteredTotal = getFilteredItems(sourceItems).length;
    const nextVisibleCount = getInitialVisibleCount(filteredTotal);

    setVisibleCount(nextVisibleCount, filteredTotal);

    return nextVisibleCount;
  }

  function setFilter(filter = DEFAULT_FILTER) {
    const nextFilter = normalizeFilter(filter);

    syncFilterState({
      filter: nextFilter,
      query: getCurrentSearchQuery(),
    });

    resetVisibleWindow();
    rerender();

    emit("incidencias:filter:changed", {
      filter: nextFilter,
      searchQuery: getCurrentSearchQuery(),
      source: SCOPE,
      mode: "infinite",
    });

    return nextFilter;
  }

  function setSearchQuery(query = "") {
    const nextQuery = safeText(query, "");

    syncFilterState({
      filter: getCurrentFilter(),
      query: nextQuery,
    });

    resetVisibleWindow();
    rerender();

    emit("incidencias:search:changed", {
      filter: getCurrentFilter(),
      searchQuery: nextQuery,
      source: SCOPE,
      mode: "infinite",
    });

    return nextQuery;
  }

  function clearFilters() {
    syncFilterState({
      filter: DEFAULT_FILTER,
      query: "",
    });

    resetVisibleWindow();
    rerender();

    emit("incidencias:filters:cleared", {
      source: SCOPE,
      mode: "infinite",
    });

    return true;
  }

  function clearSearchOnly() {
    syncFilterState({
      filter: getCurrentFilter(),
      query: "",
    });

    resetVisibleWindow();
    rerender();

    emit("incidencias:search:cleared", {
      filter: getCurrentFilter(),
      source: SCOPE,
      mode: "infinite",
    });

    return true;
  }

  /* =========================================================
     INFINITE SCROLL STATE
  ========================================================= */

  function getLoadMoreBatch() {
    return Math.max(
      1,
      safeNumber(
        first(
          incidenciasState.loadMoreBatch,
          incidenciasState.batchSize,
          LOAD_MORE_BATCH
        ),
        LOAD_MORE_BATCH
      )
    );
  }

  function getInitialVisibleCount(total = 0) {
    const fallback = Math.max(1, INITIAL_VISIBLE_COUNT);
    const configured = Math.max(
      1,
      safeNumber(
        first(
          incidenciasState.initialVisibleCount,
          incidenciasState.visibleInitialCount,
          fallback
        ),
        fallback
      )
    );

    const totalCount = Math.max(0, safeNumber(total, 0));

    if (!totalCount) {
      return 0;
    }

    return Math.min(totalCount, configured);
  }

  function getVisibleCount(total = 0) {
    const totalCount = Math.max(0, safeNumber(total, 0));

    if (!totalCount) {
      return 0;
    }

    const current = safeNumber(incidenciasState.visibleCount, 0);

    if (current > 0) {
      return Math.min(current, totalCount);
    }

    return getInitialVisibleCount(totalCount);
  }

  function setVisibleCount(value = 0, total = null) {
    const resolvedTotal = total === null || total === undefined
      ? getFilteredItems(getItems()).length
      : total;

    const totalCount = Math.max(0, safeNumber(resolvedTotal, 0));
    const next = totalCount
      ? Math.min(Math.max(1, safeNumber(value, 1)), totalCount)
      : 0;

    incidenciasState.visibleCount = next;
    incidenciasState.visibleItemsCount = next;
    incidenciasState.loadedCount = next;
    incidenciasState.remainingCount = Math.max(0, totalCount - next);
    incidenciasState.hasMoreItems = totalCount > next;
    incidenciasState.hasMore = totalCount > next;
    incidenciasState.canLoadMore = totalCount > next;
    incidenciasState.infiniteScroll = true;
    incidenciasState.scrollMode = "infinite";
    incidenciasState.paginationDisabled = true;

    try {
      setPage(1);
      setPageSize(Math.max(1, next || getLoadMoreBatch()));
    } catch {
      incidenciasState.page = 1;
      incidenciasState.pageSize = Math.max(1, next || getLoadMoreBatch());
    }

    incidenciasState.totalPages = 1;
    incidenciasState.pages = 1;

    return next;
  }

  function setLoadingMore(value = false) {
    incidenciasState.loadingMore = Boolean(value);
    incidenciasState.isLoadingMore = Boolean(value);
    return incidenciasState.loadingMore;
  }

  function buildInfiniteMeta(items = getItems()) {
    const allItems = safeArray(items);
    const filteredItems = getFilteredItems(allItems);
    const filteredTotal = filteredItems.length;
    const visibleCount = getVisibleCount(filteredTotal);
    const visibleItems = filteredItems.slice(0, visibleCount);
    const remainingCount = Math.max(0, filteredTotal - visibleItems.length);
    const remoteCount = Math.max(
      allItems.length,
      safeNumber(incidenciasState.remoteCount, allItems.length)
    );

    return {
      mode: "infinite",
      paginationDisabled: true,
      infiniteScroll: true,

      allItems,
      filteredItems,
      items: visibleItems,
      pageItems: visibleItems,
      rows: visibleItems,

      page: 1,
      currentPage: 1,
      pageSize: Math.max(1, visibleItems.length || getLoadMoreBatch()),
      limit: Math.max(1, visibleItems.length || getLoadMoreBatch()),

      total: filteredTotal,
      totalCount: filteredTotal,
      filteredTotal,
      filteredCount: filteredTotal,

      remoteCount,
      loadedTotal: allItems.length,
      loadedCount: visibleItems.length,
      visibleCount: visibleItems.length,
      visibleItemsCount: visibleItems.length,

      totalPages: 1,
      pages: 1,

      hasPrev: false,
      hasNext: false,
      hasMore: remainingCount > 0,
      canLoadMore: remainingCount > 0,
      remainingCount,

      from: visibleItems.length ? 1 : 0,
      to: visibleItems.length,
      rangeStart: visibleItems.length ? 1 : 0,
      rangeEnd: visibleItems.length,
    };
  }

  function increaseVisibleCount(amount = getLoadMoreBatch(), items = null) {
    const sourceItems = Array.isArray(items)
      ? items
      : getItems();

    const meta = buildInfiniteMeta(sourceItems);

    if (!meta.hasMore) {
      setVisibleCount(meta.filteredTotal, meta.filteredTotal);
      return buildInfiniteMeta(sourceItems);
    }

    const nextVisibleCount = Math.min(
      meta.filteredTotal,
      meta.visibleCount + Math.max(1, safeNumber(amount, getLoadMoreBatch()))
    );

    setVisibleCount(nextVisibleCount, meta.filteredTotal);

    const nextMeta = buildInfiniteMeta(sourceItems);

    emit("incidencias:visible:changed", {
      source: SCOPE,
      mode: "infinite",
      visibleCount: nextMeta.visibleCount,
      filteredTotal: nextMeta.filteredTotal,
      remainingCount: nextMeta.remainingCount,
      hasMore: nextMeta.hasMore,
    });

    return nextMeta;
  }

  async function loadMore(options = {}) {
    if (destroyed) {
      return buildInfiniteMeta(getItems()).items;
    }

    if (inflightLoadMore) {
      return inflightLoadMore;
    }

    const opts = safeObject(options);

    inflightLoadMore = (async () => {
      const beforeMeta = buildInfiniteMeta(getItems());

      if (!beforeMeta.hasMore) {
        return beforeMeta.items;
      }

      let finalMeta = beforeMeta;

      setLoadingMore(true);

      try {
        finalMeta = increaseVisibleCount(
          safeNumber(opts.amount, getLoadMoreBatch()),
          beforeMeta.allItems
        );

        return finalMeta.items;
      } finally {
        setLoadingMore(false);

        if (!destroyed) {
          rerender();
        }

        emit("incidencias:load-more", {
          source: SCOPE,
          mode: "infinite",
          reason: safeText(opts.reason || opts.source, "scroll"),
          visibleCount: finalMeta.visibleCount,
          filteredTotal: finalMeta.filteredTotal,
        });
      }
    })();

    try {
      return await inflightLoadMore;
    } finally {
      inflightLoadMore = null;
    }
  }

  function hasMoreVisibleItems() {
    return buildInfiniteMeta(getItems()).hasMore;
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

  function getPayloadItems() {
    try {
      return extractItemsFromPayload(lastApiPayload);
    } catch {
      return [];
    }
  }

  function normalizePayloadItems(items = []) {
    try {
      return normalizeIncidenciasCollection(items, {
        sort: false,
        dedupe: true,
      });
    } catch {
      return safeArray(items);
    }
  }

  function getItems() {
    try {
      const storeItems = getRawItems();

      if (storeItems.length) {
        return safeArray(sortIncidenciasByUpdatedDesc(storeItems));
      }

      const payloadItems = getPayloadItems();

      if (!payloadItems.length) {
        return [];
      }

      return safeArray(
        sortIncidenciasByUpdatedDesc(
          normalizePayloadItems(payloadItems)
        )
      );
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

    const items = getItems();

    return (
      findIncidenciaById(items, id) ||
      items.find((item) => sameIdentity(getTicketIdentity(item), id)) ||
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
    return buildInfiniteMeta(items);
  }

  function clampPage(items = getItems()) {
    const sourceItems = safeArray(items);
    const meta = buildInfiniteMeta(sourceItems);

    setVisibleCount(meta.visibleCount, meta.filteredTotal);

    return buildInfiniteMeta(sourceItems);
  }

  function ensureBaseState(items = null) {
    const fallbackPageSize = Math.max(
      1,
      safeNumber(
        first(
          incidenciasState.pageSize,
          incidenciasState.visibleCount,
          LEGACY_PAGE_SIZE,
          INITIAL_VISIBLE_COUNT
        ),
        INITIAL_VISIBLE_COUNT
      )
    );

    try {
      setPage(1);
      setPageSize(fallbackPageSize);
    } catch {
      incidenciasState.page = 1;
      incidenciasState.pageSize = fallbackPageSize;
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

    if (typeof incidenciasState.loadingMore !== "boolean") {
      incidenciasState.loadingMore = false;
    }

    incidenciasState.isLoadingMore = Boolean(incidenciasState.loadingMore);

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

    incidenciasState.page = 1;
    incidenciasState.totalPages = 1;
    incidenciasState.pages = 1;

    incidenciasState.infiniteScroll = true;
    incidenciasState.scrollMode = "infinite";
    incidenciasState.paginationDisabled = true;

    syncFilterState();

    const sourceItems = Array.isArray(items)
      ? items
      : getItems();

    const filteredTotal = getFilteredItems(sourceItems).length;
    const currentVisibleCount = safeNumber(incidenciasState.visibleCount, 0);
    const nextVisibleCount = filteredTotal && currentVisibleCount <= 0
      ? getInitialVisibleCount(filteredTotal)
      : getVisibleCount(filteredTotal);

    setVisibleCount(nextVisibleCount, filteredTotal);

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

  function markInitialRemoteLoadCompleted() {
    initialRemoteLoadCompleted = true;
    initialRemoteLoadCompletedAt = nowIso();
    return initialRemoteLoadCompletedAt;
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
    renderBeforeLoad = true,
    initial = false,
  } = {}) {
    if (destroyed && !initial) {
      return getItems();
    }

    const beforeItems = getItems();
    const hasData = beforeItems.length > 0;
    const previousVisibleCount = safeNumber(incidenciasState.visibleCount, 0);

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

    if (!silent && renderBeforeLoad) {
      rerender();
    }

    try {
      const payload = await loadIncidencias({
        force: Boolean(force),
        silent: Boolean(silent),
      });

      lastApiPayload = payload || lastApiPayload;

      const afterItems = getItems();
      const remoteCount = extractRemoteCount(
        payload,
        afterItems.length
      );

      if (remoteCount > 0) {
        try {
          setRemoteCount(remoteCount);
        } catch {
          incidenciasState.remoteCount = remoteCount;
        }
      }

      const filteredTotal = getFilteredItems(afterItems).length;
      const nextVisibleCount = previousVisibleCount > 0
        ? Math.max(previousVisibleCount, getInitialVisibleCount(filteredTotal))
        : getInitialVisibleCount(filteredTotal);

      setVisibleCount(nextVisibleCount, filteredTotal);

      markLoaded(afterItems, remoteCount);
      markSync();
      persistCacheBestEffort();

      if (initial || !initialRemoteLoadCompleted) {
        markInitialRemoteLoadCompleted();
      }

      emit("incidencias:loaded", {
        items: afterItems,
        total: afterItems.length,
        remoteCount,
        force: Boolean(force),
        silent: Boolean(silent),
        asRefresh: Boolean(asRefresh),
        initial: Boolean(initial),
        source: SCOPE,
        mode: "infinite",
      });

      return afterItems;
    } catch (error) {
      const message = getLoadErrorMessage(error);

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
        initial: Boolean(initial),
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

    return safeImageSrc(
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
      )
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

    const banner = BrowserDocument.createElement("div");

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

  function buildTemplatePayload(preloadedItems = null) {
    const allItems = Array.isArray(preloadedItems)
      ? preloadedItems
      : getItems();

    ensureBaseState(allItems);

    const infinite = clampPage(allItems);

    const currentFilter = getCurrentFilter();
    const currentSearchQuery = getCurrentSearchQuery();

    const currentUser = getCurrentUserSnapshot();
    const currentUserAvatar = getCurrentUserAvatar(currentUser);

    const remoteCount = Math.max(
      allItems.length,
      safeNumber(incidenciasState.remoteCount, allItems.length)
    );

    const filterCounts = getFilterCounts(allItems);

    return {
      items: allItems,
      allItems,
      filteredItems: infinite.filteredItems,
      pageItems: infinite.pageItems,
      visibleItems: infinite.pageItems,

      filterCounts,
      countsByFilter: filterCounts,

      totalCount: remoteCount,
      remoteCount,
      filteredCount: infinite.filteredCount,
      visibleCount: infinite.visibleCount,
      visibleItemsCount: infinite.visibleItemsCount,
      loadedCount: infinite.loadedCount,
      remainingCount: infinite.remainingCount,

      hasMore: infinite.hasMore,
      canLoadMore: infinite.canLoadMore,
      infiniteScroll: true,
      scrollMode: "infinite",
      paginationDisabled: true,

      page: 1,
      pageSize: infinite.pageSize,
      totalPages: 1,

      pagination: infinite,

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

        page: 1,
        pageSize: infinite.pageSize,
        totalPages: 1,
        pages: 1,

        filterCounts,
        countsByFilter: filterCounts,

        totalCount: remoteCount,
        remoteCount,
        filteredCount: infinite.filteredCount,
        visibleCount: infinite.visibleCount,
        visibleItemsCount: infinite.visibleItemsCount,
        loadedCount: infinite.loadedCount,
        remainingCount: infinite.remainingCount,

        hasMore: infinite.hasMore,
        canLoadMore: infinite.canLoadMore,
        infiniteScroll: true,
        scrollMode: "infinite",
        paginationDisabled: true,

        selectedTicketId: safeText(incidenciasState.selectedTicketId, ""),
        openingTicketId: safeText(incidenciasState.openingTicketId, ""),

        creating: Boolean(incidenciasState.creating),
        loading: Boolean(incidenciasState.loading),
        refreshing: Boolean(incidenciasState.refreshing),
        loadingMore: Boolean(incidenciasState.loadingMore),
        isLoadingMore: Boolean(incidenciasState.loadingMore),

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

  function buildHtml(preloadedItems = null) {
    const payload = buildTemplatePayload(preloadedItems);

    return `
      <section
        class="panel-content dashboard ready"
        data-view="incidencias"
        data-incidencias-scope="${escapeHtml(SCOPE)}"
        data-incidencias-scroll-mode="infinite"
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

    const allItems = getItems();

    try {
      AppCore?.setDocumentTitle?.("Incidencias");
    } catch {}

    container.innerHTML = buildHtml(allItems);

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
    const opts = safeObject(options);
    const paintBeforeLoad = opts.paintBeforeLoad !== false;

    hydrateBestEffort();

    const initialItems = getItems();

    ensureBaseState(initialItems);

    if (paintBeforeLoad) {
      setInitialLoadVisualState(
        {
          silent: Boolean(opts.silent),
          asRefresh: Boolean(opts.asRefresh),
        },
        initialItems
      );

      rerender();
      await waitForPaint();
    }

    if (!isActiveRenderToken(token) && !opts.initial) {
      return api;
    }

    await loadData({
      ...opts,
      renderBeforeLoad: opts.renderBeforeLoad !== false && !paintBeforeLoad,
    });

    if (!isActiveRenderToken(token) && !opts.initial) {
      return api;
    }

    rerender();

    return api;
  }

  /* =========================================================
     INFINITE SCROLL DOM BINDING
  ========================================================= */

  function getScrollDocument() {
    if (!isBrowser()) return null;

    return BrowserDocument.scrollingElement ||
      BrowserDocument.documentElement ||
      BrowserDocument.body ||
      null;
  }

  function isNearViewportBottom() {
    if (!isBrowser()) {
      return false;
    }

    const scrolling = getScrollDocument();

    if (!scrolling) {
      return false;
    }

    const scrollTop = BrowserWindow.scrollY || scrolling.scrollTop || 0;
    const viewportHeight = BrowserWindow.innerHeight || scrolling.clientHeight || 0;
    const scrollHeight = scrolling.scrollHeight || 0;

    return scrollTop + viewportHeight >= scrollHeight - SCROLL_THRESHOLD_PX;
  }

  function queryLoadMoreSentinel(container = null) {
    if (!isElement(container)) {
      return null;
    }

    return (
      container.querySelector("[data-incidencias-load-more='true']") ||
      container.querySelector("[data-incidencias-infinite-sentinel='true']") ||
      container.querySelector("[data-infinite-scroll-sentinel='true']") ||
      container.querySelector("[data-load-more-sentinel='true']") ||
      container.querySelector("[data-home-load-more='true']") ||
      null
    );
  }

  function cleanupScrollBinding() {
    try {
      scrollCleanup?.();
    } catch {}

    scrollCleanup = null;
  }

  function bindInfiniteScroll(container = getContainer()) {
    cleanupScrollBinding();

    if (destroyed || !isBrowser() || !isElement(container)) {
      return null;
    }

    if (!hasMoreVisibleItems()) {
      return null;
    }

    let disposed = false;
    let ticking = false;
    let observer = null;

    const maybeLoadMore = (reason = "scroll") => {
      if (disposed || destroyed) {
        return;
      }

      if (
        incidenciasState.loading ||
        incidenciasState.refreshing ||
        incidenciasState.loadingMore
      ) {
        return;
      }

      if (!hasMoreVisibleItems()) {
        return;
      }

      loadMore({
        reason,
      });
    };

    const onScroll = () => {
      if (disposed || ticking) {
        return;
      }

      ticking = true;

      requestFrame(() => {
        ticking = false;

        if (isNearViewportBottom()) {
          maybeLoadMore("scroll");
        }
      });
    };

    const sentinel = queryLoadMoreSentinel(container);

    if (sentinel && typeof IntersectionObserver !== "undefined") {
      try {
        observer = new IntersectionObserver(
          (entries = []) => {
            const visible = entries.some((entry) => entry?.isIntersecting);

            if (visible) {
              maybeLoadMore("intersection");
            }
          },
          {
            root: null,
            rootMargin: `${SCROLL_THRESHOLD_PX}px 0px`,
            threshold: 0,
          }
        );

        observer.observe(sentinel);
      } catch {
        observer = null;
      }
    }

    BrowserWindow.addEventListener("scroll", onScroll, {
      passive: true,
    });

    BrowserWindow.addEventListener("resize", onScroll, {
      passive: true,
    });

    const shell =
      container.querySelector(".incidencias-view-shell") ||
      container.querySelector("[data-incidencias-scroll-host='true']") ||
      null;

    if (shell && shell !== BrowserWindow) {
      try {
        shell.addEventListener("scroll", onScroll, {
          passive: true,
        });
      } catch {}
    }

    requestFrame(onScroll);

    scrollCleanup = () => {
      disposed = true;

      try {
        observer?.disconnect?.();
      } catch {}

      try {
        BrowserWindow.removeEventListener("scroll", onScroll);
      } catch {}

      try {
        BrowserWindow.removeEventListener("resize", onScroll);
      } catch {}

      try {
        shell?.removeEventListener?.("scroll", onScroll);
      } catch {}
    };

    return scrollCleanup;
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
    const id = extractTicketId(ticketId) || safeText(ticketId, "");

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
     LEGACY PAGINATION COMPAT
     No hay paginación visual. Estas funciones sólo mantienen
     compatibilidad con bindings antiguos.
  ========================================================= */

  function goToPage(page = 1) {
    const targetPage = Math.max(1, safeNumber(page, 1));
    const filteredTotal = getFilteredItems(getItems()).length;
    const targetVisible = Math.min(
      filteredTotal,
      Math.max(
        getInitialVisibleCount(filteredTotal),
        targetPage * getLoadMoreBatch()
      )
    );

    setVisibleCount(targetVisible, filteredTotal);
    rerender();

    return 1;
  }

  async function goPrevPage() {
    resetVisibleWindow();
    rerender();
    return 1;
  }

  async function goNextPage() {
    await loadMore({
      reason: "legacy_next_page",
    });

    return 1;
  }

  function changePageSize(value = LOAD_MORE_BATCH) {
    const nextSize = Math.max(1, safeNumber(value, LOAD_MORE_BATCH));

    incidenciasState.loadMoreBatch = nextSize;
    incidenciasState.batchSize = nextSize;

    const filteredTotal = getFilteredItems(getItems()).length;
    const nextVisible = Math.min(
      filteredTotal,
      Math.max(getVisibleCount(filteredTotal), nextSize)
    );

    setVisibleCount(nextVisible, filteredTotal);
    rerender();

    return nextSize;
  }

  /* =========================================================
     BINDINGS
  ========================================================= */

  function cleanupBindings() {
    try {
      bindingsCleanup?.();
    } catch {}

    bindingsCleanup = null;
    boundContainer = null;

    cleanupScrollBinding();
  }

  function bind(container = getContainer(), options = {}) {
    const target = container || getContainer();
    const opts = safeObject(options);
    const force = opts.force === true;

    if (destroyed || !target) {
      return false;
    }

    if (!bindingsCleanup || boundContainer !== target || force) {
      if (bindingsCleanup || boundContainer) {
        cleanupBindings();
      }

      const eventsCleanup = bindIncidenciasEvents({
        container: target,
        scope: SCOPE,

        loadIncidencias,
        reload,

        openTicket: handleOpenTicket,

        copyTicketId: handleCopyTicketId,
        exportCsv: handleExportCsv,
        createIncidencia: handleCreateIncidencia,

        setFilter,
        setSearchQuery,
        clearFilters,
        clearSearchOnly,

        goToPage,
        goPrevPage,
        goNextPage,
        changePageSize,

        loadMore,
        showMore: loadMore,
        infiniteScroll: true,
      });

      bindingsCleanup = () => {
        try {
          eventsCleanup?.();
        } catch {}
      };

      boundContainer = target;
    }

    bindInfiniteScroll(target);

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

    const hasIncomingPaintBeforeLoad = Object.prototype.hasOwnProperty.call(
      incomingOptions,
      "paintBeforeLoad"
    );

    const hasBasePaintBeforeLoad = Object.prototype.hasOwnProperty.call(
      baseOptions,
      "paintBeforeLoad"
    );

    const hasIncomingRenderBeforeLoad = Object.prototype.hasOwnProperty.call(
      incomingOptions,
      "renderBeforeLoad"
    );

    const hasBaseRenderBeforeLoad = Object.prototype.hasOwnProperty.call(
      baseOptions,
      "renderBeforeLoad"
    );

    return {
      ...baseOptions,
      ...incomingOptions,

      force: Boolean(baseOptions.force || incomingOptions.force),
      asRefresh: Boolean(baseOptions.asRefresh || incomingOptions.asRefresh),
      initial: Boolean(baseOptions.initial || incomingOptions.initial),

      silent: hasIncomingSilent
        ? Boolean(incomingOptions.silent)
        : hasBaseSilent
          ? Boolean(baseOptions.silent)
          : false,

      paintBeforeLoad: hasIncomingPaintBeforeLoad
        ? incomingOptions.paintBeforeLoad !== false
        : hasBasePaintBeforeLoad
          ? baseOptions.paintBeforeLoad !== false
          : true,

      renderBeforeLoad: hasIncomingRenderBeforeLoad
        ? incomingOptions.renderBeforeLoad !== false
        : hasBaseRenderBeforeLoad
          ? baseOptions.renderBeforeLoad !== false
          : true,
    };
  }

  async function reload(options = {}) {
    if (destroyed && !safeObject(options).initial) {
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

    const opts = safeObject(options);
    const force = opts.force === true;

    if (initialized) {
      hydrateBestEffort();

      const currentItems = getItems();
      const hasCurrentItems = currentItems.length > 0;
      const needsInitialLoad = shouldLoadOnInit({
        force,
      });

      ensureBaseState(currentItems);

      if (needsInitialLoad) {
        setInitialLoadVisualState(
          {
            silent: hasCurrentItems || Boolean(opts.silent),
            asRefresh: hasCurrentItems,
          },
          currentItems
        );
      } else {
        markIdle();
      }

      rerender();

      if (needsInitialLoad) {
        startInitialRemoteLoadAfterPaint(
          {
            force: true,
            silent: hasCurrentItems || Boolean(opts.silent),
            asRefresh: hasCurrentItems,
          },
          "incidencias:init:initial-load-existing"
        );
      }

      return api;
    }

    initialized = true;
    destroyed = false;

    inflightInit = (async () => {
      safeLog("init");

      hydrateBestEffort();

      const initialItems = getItems();
      const hasInitialItems = initialItems.length > 0;
      const needsInitialLoad = shouldLoadOnInit({
        force,
      });

      ensureBaseState(initialItems);

      if (needsInitialLoad) {
        setInitialLoadVisualState(
          {
            silent: hasInitialItems || Boolean(opts.silent),
            asRefresh: hasInitialItems,
          },
          initialItems
        );
      } else {
        markIdle();
      }

      rerender();

      if (needsInitialLoad) {
        startInitialRemoteLoadAfterPaint(
          {
            force: true,
            silent: hasInitialItems || Boolean(opts.silent),
            asRefresh: hasInitialItems,
          },
          "incidencias:init:initial-load"
        );
      }

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
    inflightInit = null;
    inflightOpenTicket = null;
    inflightOpenTicketId = "";
    inflightLoadMore = null;

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

    setLoadingMore(false);

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

    loadMore,
    showMore: loadMore,
    hasMore: hasMoreVisibleItems,

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
    getPageItems: () => buildInfiniteMeta(getItems()).pageItems,
    getVisibleItems: () => buildInfiniteMeta(getItems()).pageItems,
    getPagination: () => getPaginationMeta(getItems()),
    getInfiniteMeta: () => buildInfiniteMeta(getItems()),
    getFilterCounts: () => getFilterCounts(getItems()),

    getTicketById: findTicketById,
    findTicketById,

    mergeTicketDetailWithStoreSnapshot,

    getState: () => {
      const allItems = getItems();
      const filteredItems = getFilteredItems(allItems);
      const infinite = getPaginationMeta(allItems);
      const currentUser = getCurrentUserSnapshot();
      const currentUserAvatar = getCurrentUserAvatar(currentUser);
      const filterCounts = getFilterCounts(allItems);

      return {
        ...safeObject(getIncidenciasStateSnapshot?.()),

        initialized,
        destroyed,

        initialRemoteLoadRequested,
        initialRemoteLoadScheduled,
        initialRemoteLoadCompleted,
        initialRemoteLoadCompletedAt,

        hasInflightInit: Boolean(inflightInit),
        hasInflightReload: Boolean(inflightReload),
        hasQueuedReload: Boolean(queuedReloadOptions),
        hasInflightOpenTicket: Boolean(inflightOpenTicket),
        inflightOpenTicketId,
        hasInflightLoadMore: Boolean(inflightLoadMore),

        hasStableBindings: Boolean(bindingsCleanup),
        hasScrollBinding: Boolean(scrollCleanup),

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

        filterCounts,
        countsByFilter: filterCounts,

        mode: "infinite",
        scrollMode: "infinite",
        infiniteScroll: true,
        paginationDisabled: true,

        itemsCount: allItems.length,
        filteredItemsCount: filteredItems.length,
        visibleItemsCount: infinite.visibleItemsCount,
        visibleCount: infinite.visibleCount,
        remainingCount: infinite.remainingCount,
        hasMore: infinite.hasMore,
        canLoadMore: infinite.canLoadMore,
        loadingMore: Boolean(incidenciasState.loadingMore),

        pagination: infinite,

        policy: {
          loadOncePerRuntime: true,
          initialRemoteLoadAfterFirstPaint: true,
          cacheDoesNotBlockInitialRemoteLoad: true,
          memoryFirstAfterInitialRemoteLoad: true,
          explicitReloadStillAllowed: true,
          noRouterAuthDuplication: true,
          noLocalDataPatch: true,
          delegatedApiStoreModelState: true,
        },
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
