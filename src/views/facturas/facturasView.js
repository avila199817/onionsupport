/* =========================================================
   Onion SPA - Facturas View
   Archivo: src/views/facturas/facturasView.js

   EXTREME PRO SYSTEM · FACTURAS VIEW · CSP CLEAN · 15/10
   PATCH · SINGLE TEMPLATE OWNER
   PATCH · NO INLINE STYLE
   PATCH · NO TEMPLATE STYLE INJECTION
   PATCH · TEMPLATE DOM BIND · AVATAR FALLBACK CSP SAFE
   PATCH · FILTER / SEARCH / DATE SORT STATE BRIDGE
   PATCH · SORT ÚNICO: FECHA DESC ⇄ FECHA ASC
   PATCH · INVOICE NUMBER INTERNAL TIEBREAKER ONLY
   PATCH · PAGINATION 5
   PATCH · DETAIL PORTAL
   PATCH · CREATE MODAL BRIDGE
   PATCH · INCIDENCIA MODAL BRIDGE
   PATCH · URL AUTOPEN
   PATCH · TOPBAR SEARCH BRIDGE
   PATCH · ACTION LOADERS SYNC
   PATCH · FISCAL + RELATION PRESERVER
   PATCH · RERENDER SAFE
   PATCH · CLEANUP ENTERPRISE

   RESPONSABILIDADES:
   - Montar la vista real de facturas.
   - Renderizar mediante renderFacturasTemplate().
   - No duplicar renderHeader/renderCards en la vista.
   - Mantener estado de filtro, búsqueda, orden y paginación.
   - Usar solo orden por fecha: date_desc / date_asc.
   - Mapear orden legacy por número a orden por fecha para evitar incoherencias.
   - Usar número de factura solo como desempate interno.
   - Delegar markup al template.
   - Delegar estilos al CSS externo /src/css/views/facturas.css.
   - Abrir detalle de factura en portal global.
   - Abrir modal de creación.
   - Abrir incidencia relacionada.
   - Sin style="".
   - Sin eventos inline.
   - Sin <style> inyectado desde JS.
   - Soportar apertura desde URL y topbar/global search.
   - Sin pisar IVA/IRPF/impuestos/totales/relación con incidencia.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  renderFacturasTemplate,
  bindFacturasTemplateDom,
} from "./facturas.template.js";

import {
  renderFacturasDetailModal,
} from "./facturas.detail.template.js";

import FacturasCreateModal from "./facturas.create.modal.js";

import { getSortedFacturasStore } from "./facturas.store.js";

import {
  createFacturasState,
  getFacturasTemplateState,
  isFacturasHydrated,
  isFacturasBootstrapped,
  isFacturasLoading,
  isFacturasRefreshing,
  isFacturasDetailOpen,
  getFacturasDetailData,
  setFacturasHydrated,
  setFacturasBootstrapped,
  setFacturasDetailOpen,
  setFacturasDetailLoading,
  setFacturasDetailData,
  setFacturasSendingFacturaId,
  setFacturasDownloadingFacturaId,
  setFacturasViewingFacturaId,
  setFacturasOpeningFacturaId,
  setFacturasLoading,
  setFacturasRefreshing,
  setFacturasLoaded,
  clearFacturasError,
  clearFacturasActionIds,
  closeFacturasDetail,
  setFacturasLastSyncAt,
  getFacturasLastSyncAt,
} from "./facturas.state.js";

import {
  loadFacturasCollection,
  loadFacturaDetailById,
} from "./facturas.loaders.js";

import {
  openFacturaAction,
  openFacturaPdfAction,
  downloadFacturaPdfAction,
  sendFacturaToClientAction,
  exportFacturasCsvAction,
} from "./facturas.actions.js";

import { bindFacturasView } from "./facturas.bindings.js";

import {
  safeText,
  showToast,
} from "./facturas.utils.js";

export const FacturasView = (() => {
  "use strict";

  /* =====================================================
     CONSTANTS
  ===================================================== */

  const SCOPE = "view:facturas";
  const DETAIL_MODAL_ID = "facturas-detail-root";

  const PAGE_SIZE = 5;
  const SEARCH_DEBOUNCE_MS = 120;
  const INCIDENCIA_DETAIL_TIMEOUT = 90000;

  const DEFAULT_FILTER = "all";
  const DEFAULT_SORT = "date_desc";

  const SORT_DATE_DESC = "date_desc";
  const SORT_DATE_ASC = "date_asc";

  const SORT_MODES = Object.freeze([
    SORT_DATE_DESC,
    SORT_DATE_ASC,
  ]);

  const ADMIN_ROLES = Object.freeze([
    "admin",
    "administrator",
    "superadmin",
    "super_admin",
    "root",
    "owner",
  ]);

  const CREATE_PERMISSIONS = Object.freeze([
    "admin",
    "administrator",
    "superadmin",
    "super_admin",
    "root",
    "owner",
    "facturas:create",
    "facturas:write",
    "facturas:create:any",
    "facturas:write:any",
    "billing:create",
    "billing:write",
  ]);

  const FACTURA_QUERY_KEYS = Object.freeze([
    "factura",
    "facturaId",
    "invoiceId",
    "id",
    "openFactura",
  ]);

  const FACTURA_OPEN_EVENTS = Object.freeze([
    "facturas:modal:open",
    "factura:modal:open",
    "facturas:detail:open",
    "factura:ficha:open",
    "invoice:detail:open",
    "topbar:search:open-factura",
    "search:open-factura",
    "global-search:open-factura",
  ]);

  /* =====================================================
     MODULE STATE
  ===================================================== */

  const state = createFacturasState();

  let initialized = false;
  let destroyed = false;

  let inflightInit = null;
  let inflightLoad = null;
  let inflightExternalOpen = null;
  let inflightExternalOpenFacturaId = "";

  let bindingsCleanup = null;
  let modalBindingsCleanup = null;
  let createSuccessCleanup = null;
  let searchOpenCleanup = null;
  let filterControlsCleanup = null;

  let searchTimer = 0;
  let renderFrame = 0;
  let renderToken = 0;

  let lastAutoOpenedFacturaId = "";

  /* =====================================================
     PRIMITIVES
  ===================================================== */

  function safeNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === "") return fallback;

    if (typeof value === "string") {
      let normalized = value
        .trim()
        .replace(/€/g, "")
        .replace(/\$/g, "")
        .replace(/£/g, "")
        .replace(/%/g, "")
        .replace(/[^\d.,+\-\s]/g, "")
        .replace(/\s/g, "");

      const hasComma = normalized.includes(",");
      const hasDot = normalized.includes(".");

      if (hasComma && hasDot) {
        const lastComma = normalized.lastIndexOf(",");
        const lastDot = normalized.lastIndexOf(".");

        normalized = lastComma > lastDot
          ? normalized.replace(/\./g, "").replace(/,/g, ".")
          : normalized.replace(/,/g, "");
      } else if (hasComma) {
        normalized = normalized.replace(/,/g, ".");
      }

      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
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

  function hasOwnKeys(value = {}) {
    return Boolean(
      value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).length
    );
  }

  function clampNumber(value, min = 1, max = Number.MAX_SAFE_INTEGER) {
    const n = safeNumber(value, min);

    return Math.min(Math.max(n, min), max);
  }

  function normalizeText(value = "") {
    return safeText(value, "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeKey(value = "") {
    return normalizeText(value)
      .replace(/[\s-]+/g, "_")
      .replace(/[^\w]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function normalizeWhitespace(value = "") {
    return safeText(value, "").replace(/\s+/g, " ").trim();
  }

  function toTimestamp(value = null) {
    if (!value) return 0;

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? 0 : value.getTime();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return value > 9999999999 ? value : value * 1000;
    }

    const raw = safeText(value, "");
    if (!raw) return 0;

    const numeric = Number(raw);

    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric > 9999999999 ? numeric : numeric * 1000;
    }

    const esMatch = raw.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*|\s+)?(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (esMatch) {
      const [, dd, mm, yyyy, hh = "0", min = "0", ss = "0"] = esMatch;

      const date = new Date(
        Number(yyyy),
        Number(mm) - 1,
        Number(dd),
        Number(hh),
        Number(min),
        Number(ss)
      );

      return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    }

    const date = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);

    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  function escapeHtml(value = "") {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeTokenList(value) {
    if (Array.isArray(value)) {
      return value.map((item) => normalizeKey(item)).filter(Boolean);
    }

    if (value && typeof value === "object") {
      return Object.entries(value)
        .filter(([, enabled]) => Boolean(enabled))
        .map(([key]) => normalizeKey(key))
        .filter(Boolean);
    }

    if (typeof value === "string") {
      return value
        .split(/[,\s|;]+/g)
        .map((item) => normalizeKey(item))
        .filter(Boolean);
    }

    return [];
  }

  /* =====================================================
     CORE / EVENTS
  ===================================================== */

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.("[FacturasView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[FacturasView]", ...args);
    } catch {}

    try {
      console.warn("[FacturasView]", ...args);
    } catch {}
  }

  function safeEmit(event = "", payload = {}) {
    const eventName = safeText(event, "");
    if (!eventName) return false;

    try {
      AppCore?.events?.emit?.(eventName, payload);
    } catch {}

    try {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: payload,
        })
      );
    } catch {}

    return true;
  }

  function safeOn(event = "", handler = null) {
    const eventName = safeText(event, "");

    if (!eventName || typeof handler !== "function") {
      return () => {};
    }

    let busCleanup = null;
    let busAttached = false;
    let windowAttached = false;

    const windowHandler = (domEvent) => handler(domEvent);

    try {
      const maybeCleanup = AppCore?.events?.on?.(eventName, handler);

      if (typeof maybeCleanup === "function") {
        busCleanup = maybeCleanup;
      }

      busAttached = true;
    } catch {}

    try {
      window.addEventListener(eventName, windowHandler);
      windowAttached = true;
    } catch {}

    return () => {
      if (busCleanup) {
        try {
          busCleanup();
        } catch {}
      } else if (busAttached) {
        try {
          AppCore?.events?.off?.(eventName, handler);
        } catch {}
      }

      if (windowAttached) {
        try {
          window.removeEventListener(eventName, windowHandler);
        } catch {}
      }
    };
  }

  function getContainer() {
    return (
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      null
    );
  }

  function safeErrorMessage(error = null) {
    return safeText(
      first(
        error?.message,
        error?.response?.message,
        error?.response?.data?.message,
        error?.data?.message,
        "No se pudieron cargar las facturas."
      ),
      "No se pudieron cargar las facturas."
    );
  }

  /* =====================================================
     FRAME / RENDER TOKEN
  ===================================================== */

  function nextRenderToken() {
    renderToken += 1;
    return renderToken;
  }

  function isActiveToken(token) {
    return !destroyed && token === renderToken;
  }

  function requestFrame(callback) {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      return window.requestAnimationFrame(callback);
    }

    return window.setTimeout(callback, 0);
  }

  function cancelFrame(frameId) {
    if (!frameId) return;

    try {
      if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(frameId);
        return;
      }

      window.clearTimeout(frameId);
    } catch {}
  }

  function cancelScheduledRender() {
    if (!renderFrame) return;

    cancelFrame(renderFrame);
    renderFrame = 0;
  }

  /* =====================================================
     CLEANUP
  ===================================================== */

  function cleanupCreateSuccessListener() {
    try {
      createSuccessCleanup?.();
    } catch {}

    createSuccessCleanup = null;
  }

  function cleanupSearchOpenListener() {
    try {
      searchOpenCleanup?.();
    } catch {}

    searchOpenCleanup = null;
  }

  function cleanupFilterControls() {
    try {
      filterControlsCleanup?.();
    } catch {}

    filterControlsCleanup = null;

    try {
      window.clearTimeout(searchTimer);
    } catch {}

    searchTimer = 0;
  }

  function cleanupModalBindings() {
    try {
      modalBindingsCleanup?.();
    } catch {}

    modalBindingsCleanup = null;
  }

  function cleanupBindings() {
    cleanupFilterControls();

    try {
      bindingsCleanup?.();
    } catch {}

    bindingsCleanup = null;

    cleanupCreateSuccessListener();
    cleanupSearchOpenListener();

    try {
      AppCore?.cleanup?.run?.(SCOPE);
    } catch {}
  }

  /* =====================================================
     VIEW STATE · FILTER / SEARCH / SORT / PAGE
  ===================================================== */

  function normalizeFacturaFilter(value = "") {
    const key = normalizeKey(value);

    if (!key || ["all", "todo", "todos", "todas", "total"].includes(key)) {
      return "all";
    }

    if (
      [
        "pending",
        "pendiente",
        "pendientes",
        "partial",
        "parcial",
        "draft",
        "borrador",
        "unpaid",
        "sin_pagar",
      ].includes(key)
    ) {
      return "pending";
    }

    if (
      [
        "paid",
        "pagada",
        "pagado",
        "pagadas",
        "pagados",
        "cobrada",
        "cobrado",
        "cobradas",
        "cobrados",
      ].includes(key)
    ) {
      return "paid";
    }

    if (
      [
        "overdue",
        "vencida",
        "vencido",
        "vencidas",
        "vencidos",
      ].includes(key)
    ) {
      return "overdue";
    }

    return "all";
  }

  function normalizeFacturaSort(value = "") {
    const key = normalizeKey(value);

    if (SORT_MODES.includes(key)) {
      return key;
    }

    if (
      [
        "date_asc",
        "fecha_asc",
        "emission_asc",
        "issue_date_asc",
        "fecha_emision_asc",
        "oldest",
        "oldest_first",
        "menor_fecha",
        "asc",

        /*
          Legacy compat:
          El template definitivo ya no muestra orden por Nº factura.
          Si entra invoice_asc desde un estado viejo o query externa,
          se mapea a date_asc para mantener una única semántica visual.
        */
        "invoice_asc",
        "factura_asc",
        "numero_asc",
        "n_factura_asc",
        "num_factura_asc",
        "number_asc",
        "invoice_number_asc",
        "menor_factura",
      ].includes(key)
    ) {
      return SORT_DATE_ASC;
    }

    /*
      Legacy compat:
      invoice_desc se mapea a date_desc porque en este sistema la numeración
      es correlativa con fecha y el usuario solo debe ver un criterio: Fecha.
    */
    return SORT_DATE_DESC;
  }

  function getNextDateSort(currentSort = DEFAULT_SORT) {
    return normalizeFacturaSort(currentSort) === SORT_DATE_DESC
      ? SORT_DATE_ASC
      : SORT_DATE_DESC;
  }

  function ensureBaseState() {
    if (!state.view) state.view = {};
    if (!state.detail) state.detail = {};
    if (!state.actions) state.actions = {};
    if (!state.inflight) state.inflight = {};

    const pageSize = clampNumber(
      first(state.view.pageSize, state.view.facturasPageSize, PAGE_SIZE),
      1,
      100
    );

    const page = clampNumber(
      first(state.view.page, state.view.currentPage, state.view.facturasPage, 1),
      1,
      Number.MAX_SAFE_INTEGER
    );

    const filter = normalizeFacturaFilter(
      first(
        state.view.facturasFilter,
        state.view.paymentFilter,
        state.view.statusFilter,
        state.view.activeFilter,
        state.view.filter,
        DEFAULT_FILTER
      )
    );

    const search = normalizeWhitespace(
      first(
        state.view.facturasSearch,
        state.view.searchQuery,
        state.view.search,
        state.view.query,
        state.view.q,
        state.view.term,
        state.view.keyword,
        ""
      )
    );

    const sort = normalizeFacturaSort(
      first(
        state.view.facturasSort,
        state.view.sort,
        state.view.sortBy,
        state.view.orderBy,
        state.view.sortMode,
        DEFAULT_SORT
      )
    );

    state.view.pageSize = pageSize;
    state.view.facturasPageSize = pageSize;

    state.view.page = page;
    state.view.currentPage = page;
    state.view.facturasPage = page;

    state.view.facturasFilter = filter;
    state.view.paymentFilter = filter;
    state.view.statusFilter = filter;
    state.view.activeFilter = filter;
    state.view.filter = filter;

    state.view.facturasSearch = search;
    state.view.searchQuery = search;
    state.view.search = search;
    state.view.query = search;
    state.view.q = search;
    state.view.term = search;
    state.view.keyword = search;

    state.view.facturasSort = sort;
    state.view.sort = sort;
    state.view.sortBy = sort;
    state.view.orderBy = sort;
    state.view.sortMode = sort;

    state.view.error = safeText(state.view.error, "");
  }

  function getPageSize() {
    ensureBaseState();

    return clampNumber(
      first(state.view.pageSize, state.view.facturasPageSize, PAGE_SIZE),
      1,
      100
    );
  }

  function getCurrentPage() {
    ensureBaseState();

    return clampNumber(
      first(state.view.page, state.view.currentPage, state.view.facturasPage, 1),
      1,
      Number.MAX_SAFE_INTEGER
    );
  }

  function getViewFilter() {
    ensureBaseState();

    return normalizeFacturaFilter(state.view.facturasFilter);
  }

  function getViewSearch() {
    ensureBaseState();

    return normalizeWhitespace(state.view.facturasSearch);
  }

  function getViewSort() {
    ensureBaseState();

    return normalizeFacturaSort(state.view.facturasSort);
  }

  function resetViewPage() {
    ensureBaseState();

    state.view.page = 1;
    state.view.currentPage = 1;
    state.view.facturasPage = 1;

    return 1;
  }

  function setViewPage(page = 1) {
    ensureBaseState();

    const totalPages = getTotalPages(getItems());
    const nextPage = clampNumber(page, 1, totalPages);

    state.view.page = nextPage;
    state.view.currentPage = nextPage;
    state.view.facturasPage = nextPage;

    return nextPage;
  }

  function setViewFilter(filter = DEFAULT_FILTER) {
    ensureBaseState();

    const nextFilter = normalizeFacturaFilter(filter);

    state.view.facturasFilter = nextFilter;
    state.view.paymentFilter = nextFilter;
    state.view.statusFilter = nextFilter;
    state.view.activeFilter = nextFilter;
    state.view.filter = nextFilter;

    resetViewPage();

    safeEmit("facturas:filter:change", {
      filter: nextFilter,
      search: getViewSearch(),
      sort: getViewSort(),
    });

    return nextFilter;
  }

  function setViewSearch(query = "") {
    ensureBaseState();

    const nextSearch = normalizeWhitespace(query);

    state.view.facturasSearch = nextSearch;
    state.view.searchQuery = nextSearch;
    state.view.search = nextSearch;
    state.view.query = nextSearch;
    state.view.q = nextSearch;
    state.view.term = nextSearch;
    state.view.keyword = nextSearch;

    resetViewPage();

    safeEmit("facturas:search:change", {
      filter: getViewFilter(),
      search: nextSearch,
      sort: getViewSort(),
    });

    return nextSearch;
  }

  function setViewSort(sort = DEFAULT_SORT) {
    ensureBaseState();

    const nextSort = normalizeFacturaSort(sort);

    state.view.facturasSort = nextSort;
    state.view.sort = nextSort;
    state.view.sortBy = nextSort;
    state.view.orderBy = nextSort;
    state.view.sortMode = nextSort;

    resetViewPage();

    safeEmit("facturas:sort:change", {
      sort: nextSort,
      filter: getViewFilter(),
      search: getViewSearch(),
    });

    return nextSort;
  }

  function clearViewFilters() {
    ensureBaseState();

    state.view.facturasFilter = DEFAULT_FILTER;
    state.view.paymentFilter = DEFAULT_FILTER;
    state.view.statusFilter = DEFAULT_FILTER;
    state.view.activeFilter = DEFAULT_FILTER;
    state.view.filter = DEFAULT_FILTER;

    state.view.facturasSearch = "";
    state.view.searchQuery = "";
    state.view.search = "";
    state.view.query = "";
    state.view.q = "";
    state.view.term = "";
    state.view.keyword = "";

    state.view.facturasSort = DEFAULT_SORT;
    state.view.sort = DEFAULT_SORT;
    state.view.sortBy = DEFAULT_SORT;
    state.view.orderBy = DEFAULT_SORT;
    state.view.sortMode = DEFAULT_SORT;

    resetViewPage();

    safeEmit("facturas:filters:clear", {});

    return true;
  }

  /* =====================================================
     FACTURA IDENTITY / DOMAIN HELPERS
  ===================================================== */

  function sameFacturaIdentity(a = "", b = "") {
    const left = normalizeText(a);
    const right = normalizeText(b);

    return Boolean(left && right && left === right);
  }

  function getValueFromMaybeObject(value = {}) {
    if (typeof value === "string" || typeof value === "number") {
      return safeText(value, "");
    }

    const source = safeObject(value);

    return safeText(
      first(
        source.facturaId,
        source.invoiceId,
        source.id,
        source._id,
        source.entityId,
        source.numero,
        source.numeroFactura,
        source.numeroFacturaLegal,
        source.numeroFacturaSistema,
        source.legalInvoiceNumber,
        source.systemInvoiceNumber,
        source.invoiceNumber,
        source.value,
        source.key,
        source.code
      ),
      ""
    );
  }

  function getStableFacturaId(item = {}) {
    if (typeof item === "string" || typeof item === "number") {
      return safeText(item, "");
    }

    return safeText(
      first(
        item?.id,
        item?._id,
        item?.facturaId,
        item?.invoiceId,
        item?.numero,
        item?.numeroFactura,
        item?.numeroFacturaLegal,
        item?.numeroFacturaSistema,
        item?.legalInvoiceNumber,
        item?.systemInvoiceNumber,
        item?.invoiceNumber,
        item?.code,

        item?.raw?.id,
        item?.raw?._id,
        item?.raw?.facturaId,
        item?.raw?.invoiceId,
        item?.raw?.numero,
        item?.raw?.numeroFactura,
        item?.raw?.numeroFacturaLegal,
        item?.raw?.numeroFacturaSistema,
        item?.raw?.legalInvoiceNumber,
        item?.raw?.systemInvoiceNumber,
        item?.raw?.invoiceNumber,
        item?.raw?.code,

        item?.data?.id,
        item?.data?.facturaId,
        item?.data?.invoiceId,
        item?.data?.numero,
        item?.data?.numeroFactura,
        item?.data?.numeroFacturaLegal,
        item?.data?.numeroFacturaSistema,

        item?.payload?.id,
        item?.payload?.facturaId,
        item?.payload?.invoiceId,
        item?.payload?.numero,
        item?.payload?.numeroFactura,
        item?.payload?.numeroFacturaLegal,
        item?.payload?.numeroFacturaSistema,

        item?.result?.id,
        item?.result?.facturaId,
        item?.result?.invoiceId,
        item?.result?.numero,
        item?.result?.numeroFactura,
        item?.result?.numeroFacturaLegal,
        item?.result?.numeroFacturaSistema
      ),
      ""
    );
  }

  function getFacturaDisplayId(item = {}) {
    if (typeof item === "string" || typeof item === "number") {
      return safeText(item, "");
    }

    const source = safeObject(item);
    const raw = safeObject(source.raw);

    return safeText(
      first(
        source.numeroFacturaLegal,
        source.numeroFactura,
        source.legalInvoiceNumber,
        source.numero,
        source.invoiceNumber,
        source.code,
        source.facturaId,
        source.invoiceId,
        source.numeroFacturaSistema,
        source.systemInvoiceNumber,
        source.id,

        raw.numeroFacturaLegal,
        raw.numeroFactura,
        raw.legalInvoiceNumber,
        raw.numero,
        raw.invoiceNumber,
        raw.code,
        raw.facturaId,
        raw.invoiceId,
        raw.numeroFacturaSistema,
        raw.systemInvoiceNumber,
        raw.id
      ),
      ""
    );
  }

  function getFacturaSystemDisplayId(item = {}) {
    const source = safeObject(item);
    const raw = safeObject(source.raw);

    return safeText(
      first(
        source.numeroFacturaSistema,
        source.systemInvoiceNumber,
        raw.numeroFacturaSistema,
        raw.systemInvoiceNumber
      ),
      ""
    );
  }

  function getFacturaIdentityList(item = {}) {
    if (typeof item === "string" || typeof item === "number") {
      return [safeText(item, "")].filter(Boolean);
    }

    const source = safeObject(item);
    const raw = safeObject(source.raw);

    return [
      source.id,
      source._id,
      source.facturaId,
      source.invoiceId,
      source.numero,
      source.numeroFactura,
      source.numeroFacturaLegal,
      source.numeroFacturaSistema,
      source.legalInvoiceNumber,
      source.systemInvoiceNumber,
      source.invoiceNumber,
      source.code,

      raw.id,
      raw._id,
      raw.facturaId,
      raw.invoiceId,
      raw.numero,
      raw.numeroFactura,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema,
      raw.legalInvoiceNumber,
      raw.systemInvoiceNumber,
      raw.invoiceNumber,
      raw.code,
    ]
      .map((value) => safeText(value, ""))
      .filter(Boolean);
  }

  function pickTicketIdFromArray(value = []) {
    const items = safeArray(value);

    for (const item of items) {
      if (typeof item === "string" && item.trim()) {
        return item.trim();
      }

      if (!item || typeof item !== "object") continue;

      const candidate = first(
        item.ticketId,
        item.incidenciaId,
        item.id,
        item.code,
        item.numero,
        item.relatedTicketId,
        item.relatedIncidentId,
        item.supportTicketId,
        item.caseId,

        item.ticket?.ticketId,
        item.ticket?.incidenciaId,
        item.ticket?.id,

        item.incidencia?.ticketId,
        item.incidencia?.incidenciaId,
        item.incidencia?.id,

        item.linkedTicket?.ticketId,
        item.linkedTicket?.incidenciaId,
        item.linkedTicket?.id
      );

      if (candidate) return safeText(candidate, "");
    }

    return "";
  }

  function getRelatedIncidenciaId(item = {}) {
    const source = safeObject(item);
    const raw = safeObject(source.raw);

    return safeText(
      first(
        source.ticketId,
        source.incidenciaId,

        source.incidencia?.ticketId,
        source.incidencia?.id,
        source.incidencia?.incidenciaId,

        source.ticket?.ticketId,
        source.ticket?.id,
        source.ticket?.incidenciaId,

        source.linkedTicket?.ticketId,
        source.linkedTicket?.id,
        source.linkedTicket?.incidenciaId,

        source.relatedTicket?.ticketId,
        source.relatedTicket?.id,
        source.relatedTicket?.incidenciaId,

        source.relatedIncident?.ticketId,
        source.relatedIncident?.id,
        source.relatedIncident?.incidenciaId,

        source.relations?.ticket?.ticketId,
        source.relations?.ticket?.id,
        source.relations?.ticket?.incidenciaId,

        source.relatedTicketId,
        source.relatedIncidentId,
        source.supportTicketId,
        source.caseId,

        source.meta?.ticketId,
        source.meta?.linkedTicketId,
        source.meta?.incidenciaId,

        pickTicketIdFromArray(source.ticketIds),
        pickTicketIdFromArray(source.incidenciaIds),
        pickTicketIdFromArray(source.relatedTicketIds),
        pickTicketIdFromArray(source.relatedIncidentIds),
        pickTicketIdFromArray(source.linkedTickets),
        pickTicketIdFromArray(source.incidencias),
        pickTicketIdFromArray(source.tickets),
        pickTicketIdFromArray(source.relatedTickets),
        pickTicketIdFromArray(source.relations),
        pickTicketIdFromArray(source.facturasRelacionadas),
        pickTicketIdFromArray(source.linkedInvoices?.tickets),
        pickTicketIdFromArray(source.invoiceLinks),
        pickTicketIdFromArray(source.invoiceRelations),

        raw.ticketId,
        raw.incidenciaId,

        raw.incidencia?.ticketId,
        raw.incidencia?.id,
        raw.incidencia?.incidenciaId,

        raw.ticket?.ticketId,
        raw.ticket?.id,
        raw.ticket?.incidenciaId,

        raw.linkedTicket?.ticketId,
        raw.linkedTicket?.id,
        raw.linkedTicket?.incidenciaId,

        raw.relatedTicket?.ticketId,
        raw.relatedTicket?.id,
        raw.relatedTicket?.incidenciaId,

        raw.relatedIncident?.ticketId,
        raw.relatedIncident?.id,
        raw.relatedIncident?.incidenciaId,

        raw.relations?.ticket?.ticketId,
        raw.relations?.ticket?.id,
        raw.relations?.ticket?.incidenciaId,

        raw.relatedTicketId,
        raw.relatedIncidentId,
        raw.supportTicketId,
        raw.caseId,

        raw.meta?.ticketId,
        raw.meta?.linkedTicketId,
        raw.meta?.incidenciaId,

        pickTicketIdFromArray(raw.ticketIds),
        pickTicketIdFromArray(raw.incidenciaIds),
        pickTicketIdFromArray(raw.relatedTicketIds),
        pickTicketIdFromArray(raw.relatedIncidentIds),
        pickTicketIdFromArray(raw.linkedTickets),
        pickTicketIdFromArray(raw.incidencias),
        pickTicketIdFromArray(raw.tickets),
        pickTicketIdFromArray(raw.relatedTickets),
        pickTicketIdFromArray(raw.relations),
        pickTicketIdFromArray(raw.facturasRelacionadas),
        pickTicketIdFromArray(raw.linkedInvoices?.tickets),
        pickTicketIdFromArray(raw.invoiceLinks),
        pickTicketIdFromArray(raw.invoiceRelations)
      ),
      ""
    );
  }

  /* =====================================================
     LIST FILTER / SEARCH / SORT FOR VIEW
  ===================================================== */

  function getPaymentStatusKey(item = {}) {
    const raw = safeObject(item?.raw);

    const key = normalizeKey(
      first(
        item.estadoPago,
        item.paymentStatus,
        item.payment?.status,
        item.billing?.paymentStatus,
        raw.estadoPago,
        raw.paymentStatus,
        raw.payment?.status,
        raw.billing?.paymentStatus
      )
    );

    if (
      [
        "paid",
        "pagada",
        "pagado",
        "cobrada",
        "cobrado",
        "abonada",
        "abonado",
      ].includes(key)
    ) {
      return "paid";
    }

    if (["pending", "pendiente", "unpaid", "sin_pagar"].includes(key)) {
      return "pending";
    }

    if (["partial", "parcial", "pago_parcial"].includes(key)) {
      return "partial";
    }

    if (["overdue", "vencida", "vencido"].includes(key)) {
      return "overdue";
    }

    if (
      [
        "cancelled",
        "canceled",
        "cancelada",
        "cancelado",
        "anulada",
        "anulado",
      ].includes(key)
    ) {
      return "cancelled";
    }

    if (["draft", "borrador"].includes(key)) {
      return "draft";
    }

    return "pending";
  }

  function getFacturaEmissionDate(item = {}) {
    const source = safeObject(item);
    const raw = safeObject(source.raw);

    return first(
      source.fechaFactura,
      source.fechaFacturaISO,
      source.lifecycle?.issuedAt,
      source.issueDate,
      source.issuedAt,
      source.fecha,

      raw.fechaFactura,
      raw.fechaFacturaISO,
      raw.lifecycle?.issuedAt,
      raw.issueDate,
      raw.issuedAt,
      raw.fecha,

      source.createdAt,
      source.lifecycle?.createdAt,
      source.fechaCreacion,

      raw.createdAt,
      raw.lifecycle?.createdAt,
      raw.fechaCreacion
    );
  }

  function getFacturaUpdatedDate(item = {}) {
    const source = safeObject(item);
    const raw = safeObject(source.raw);

    return first(
      source.updatedAt,
      source.lifecycle?.updatedAt,
      source.lastActivityAt,
      source.lifecycle?.lastActivityAt,
      source.fechaEnvio,
      source.sentAt,
      source.mailSentAt,
      source.delivery?.lastSentAt,

      raw.updatedAt,
      raw.lifecycle?.updatedAt,
      raw.lastActivityAt,
      raw.lifecycle?.lastActivityAt,
      raw.fechaEnvio,
      raw.sentAt,
      raw.mailSentAt,
      raw.delivery?.lastSentAt
    );
  }

  function getFacturaDateSortValue(item = {}) {
    const source = safeObject(item);
    const raw = safeObject(source.raw);

    return (
      toTimestamp(getFacturaEmissionDate(source)) ||
      toTimestamp(getFacturaUpdatedDate(source)) ||
      safeNumber(source.meta?.updatedAtMs, 0) ||
      safeNumber(source.meta?.timestampMs, 0) ||
      safeNumber(raw.meta?.updatedAtMs, 0) ||
      safeNumber(raw.meta?.timestampMs, 0) ||
      toTimestamp(raw._ts) ||
      0
    );
  }

  function compareFacturaNumberAsc(a = {}, b = {}) {
    return safeText(getFacturaDisplayId(a), "").localeCompare(
      safeText(getFacturaDisplayId(b), ""),
      "es",
      {
        numeric: true,
        sensitivity: "base",
      }
    );
  }

  function compareFacturaNumberDesc(a = {}, b = {}) {
    return safeText(getFacturaDisplayId(b), "").localeCompare(
      safeText(getFacturaDisplayId(a), ""),
      "es",
      {
        numeric: true,
        sensitivity: "base",
      }
    );
  }

  function compareByDateDesc(a = {}, b = {}) {
    const diff = getFacturaDateSortValue(b) - getFacturaDateSortValue(a);

    if (diff !== 0) return diff;

    return compareFacturaNumberDesc(a, b);
  }

  function compareByDateAsc(a = {}, b = {}) {
    const diff = getFacturaDateSortValue(a) - getFacturaDateSortValue(b);

    if (diff !== 0) return diff;

    return compareFacturaNumberAsc(a, b);
  }

  function getCompanyName(item = {}) {
    const raw = safeObject(item?.raw);

    return safeText(
      first(
        item.clienteEmpresa,
        item.empresa,
        item.company,
        item.companyName,
        item.razonSocial,
        item.cliente?.razonSocial,
        item.cliente?.companyName,
        item.cliente?.empresa,
        item.cliente?.company,
        item.clienteSnapshot?.razonSocial,
        item.clienteSnapshot?.companyName,
        item.clienteSnapshot?.empresa,
        item.client?.razonSocial,
        item.client?.companyName,
        item.client?.empresa,
        item.client?.company,
        item.customer?.razonSocial,
        item.customer?.companyName,
        item.customer?.empresa,
        item.customer?.company,

        raw.clienteEmpresa,
        raw.empresa,
        raw.company,
        raw.companyName,
        raw.razonSocial,
        raw.cliente?.razonSocial,
        raw.cliente?.companyName,
        raw.cliente?.empresa,
        raw.cliente?.company,
        raw.clienteSnapshot?.razonSocial,
        raw.clienteSnapshot?.companyName,
        raw.clienteSnapshot?.empresa,
        raw.client?.razonSocial,
        raw.client?.companyName,
        raw.client?.empresa,
        raw.client?.company,
        raw.customer?.razonSocial,
        raw.customer?.companyName,
        raw.customer?.empresa,
        raw.customer?.company
      ),
      ""
    );
  }

  function getContactName(item = {}) {
    const raw = safeObject(item?.raw);

    return safeText(
      first(
        item.clienteNombre,
        item.nombreContacto,
        item.contactName,
        item.clientName,
        item.cliente?.nombreContacto,
        item.cliente?.nombre,
        item.cliente?.name,
        item.cliente?.displayName,
        item.clienteSnapshot?.nombreContacto,
        item.client?.nombreContacto,
        item.client?.name,
        item.customer?.nombreContacto,
        item.customer?.name,
        item.name,
        item.nombre,

        raw.clienteNombre,
        raw.nombreContacto,
        raw.contactName,
        raw.clientName,
        raw.cliente?.nombreContacto,
        raw.cliente?.nombre,
        raw.cliente?.name,
        raw.cliente?.displayName,
        raw.clienteSnapshot?.nombreContacto,
        raw.client?.nombreContacto,
        raw.client?.name,
        raw.customer?.nombreContacto,
        raw.customer?.name,
        raw.name,
        raw.nombre
      ),
      ""
    );
  }

  function getClientName(item = {}) {
    return safeText(first(getCompanyName(item), getContactName(item)), "");
  }

  function getClientEmail(item = {}) {
    const raw = safeObject(item?.raw);

    return safeText(
      first(
        item.clienteEmail,
        item.emailCliente,
        item.clientEmail,
        item.email,
        item.cliente?.email,
        item.cliente?.emailLower,
        item.clienteSnapshot?.email,
        item.client?.email,
        item.customer?.email,

        raw.clienteEmail,
        raw.emailCliente,
        raw.clientEmail,
        raw.email,
        raw.cliente?.email,
        raw.cliente?.emailLower,
        raw.clienteSnapshot?.email,
        raw.client?.email,
        raw.customer?.email
      ),
      ""
    );
  }

  function getFacturaAmount(item = {}) {
    const raw = safeObject(item?.raw);

    return first(
      item.total,
      item.amount,
      item.importe,
      item.importeTotal,
      item.totalFactura,
      item.facturaTotal,
      item.facturaImporte,
      item.importeFactura,
      item.invoiceAmount,
      item.totales?.total,

      raw.total,
      raw.amount,
      raw.importe,
      raw.importeTotal,
      raw.totalFactura,
      raw.facturaTotal,
      raw.facturaImporte,
      raw.importeFactura,
      raw.invoiceAmount,
      raw.totales?.total
    );
  }

  function getFormaPago(item = {}) {
    const raw = safeObject(item?.raw);

    return safeText(
      first(
        item.formaPago,
        item.metodoPago,
        item.paymentMethod,
        item.payment?.methodLabel,
        item.payment?.method,

        raw.formaPago,
        raw.metodoPago,
        raw.paymentMethod,
        raw.payment?.methodLabel,
        raw.payment?.method
      ),
      ""
    );
  }

  function hasPdf(item = {}) {
    const raw = safeObject(item?.raw);

    if (
      Boolean(
        first(
          item.pdfAvailable,
          item.hasPdf,
          item.document?.available,
          item.meta?.hasPdf,
          item.meta?.hasBlob,

          raw.pdfAvailable,
          raw.hasPdf,
          raw.document?.available,
          raw.meta?.hasPdf,
          raw.meta?.hasBlob
        )
      )
    ) {
      return true;
    }

    if (
      first(
        item.blobPath,
        item.blobName,
        item.pdfPath,
        item.pdfUrl,
        item.downloadUrl,
        item.viewUrl,
        item.pdf,
        item.document?.blobPath,
        item.document?.fileName,

        raw.blobPath,
        raw.blobName,
        raw.pdfPath,
        raw.pdfUrl,
        raw.downloadUrl,
        raw.viewUrl,
        raw.pdf,
        raw.document?.blobPath,
        raw.document?.fileName
      )
    ) {
      return true;
    }

    const files = safeArray(
      first(
        item.attachments,
        item.files,
        item.adjuntos,
        raw.attachments,
        raw.files,
        raw.adjuntos,
        []
      )
    );

    return files.some((file) => {
      const source = safeObject(file);

      const type = normalizeText(
        first(source.contentType, source.mimeType, source.mimetype, source.type)
      );

      const name = normalizeText(
        first(source.name, source.filename, source.fileName, source.url)
      );

      return type.includes("pdf") || name.endsWith(".pdf");
    });
  }

  function isFacturaSent(item = {}) {
    const raw = safeObject(item?.raw);

    return Boolean(
      first(
        item.fechaEnvio,
        item.sentAt,
        item.mailSentAt,
        item.email?.sent,
        item.email?.sentAt,
        item.delivery?.lastSentAt,
        item.lifecycle?.sentAt,
        item.meta?.lastSentAt,
        item.meta?.isSent,
        item.meta?.hasEmailSent,

        raw.fechaEnvio,
        raw.sentAt,
        raw.mailSentAt,
        raw.email?.sent,
        raw.email?.sentAt,
        raw.delivery?.lastSentAt,
        raw.lifecycle?.sentAt,
        raw.meta?.lastSentAt,
        raw.meta?.isSent,
        raw.meta?.hasEmailSent
      )
    );
  }

  function itemMatchesFilter(item = {}, filter = DEFAULT_FILTER) {
    const key = normalizeFacturaFilter(filter);
    const paymentKey = getPaymentStatusKey(item);

    if (key === "all") return true;
    if (key === "pending") return ["pending", "partial", "draft"].includes(paymentKey);
    if (key === "paid") return paymentKey === "paid";
    if (key === "overdue") return paymentKey === "overdue";

    return true;
  }

  function getSearchHaystack(item = {}) {
    const raw = safeObject(item?.raw);
    const amount = getFacturaAmount(item);

    return [
      ...getFacturaIdentityList(item),

      getFacturaDisplayId(item),
      getFacturaSystemDisplayId(item),

      getCompanyName(item),
      getContactName(item),
      getClientName(item),
      getClientEmail(item),
      getFormaPago(item),

      getPaymentStatusKey(item),
      hasPdf(item) ? "pdf con pdf documento" : "",
      isFacturaSent(item) ? "enviada email sent" : "",

      amount,
      Number.isFinite(safeNumber(amount, NaN))
        ? String(safeNumber(amount, 0)).replace(".", ",")
        : "",

      getRelatedIncidenciaId(item),

      item.clienteId,
      item.clientId,
      item.customerId,
      item.userId,
      item.uid,
      item.blobPath,
      item.blobName,
      item.pdfPath,

      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.userId,
      raw.uid,
      raw.blobPath,
      raw.blobName,
      raw.pdfPath,
    ]
      .map((value) => normalizeText(value))
      .filter(Boolean)
      .join(" · ");
  }

  function itemMatchesSearch(item = {}, query = "") {
    const normalizedQuery = normalizeText(query);

    if (!normalizedQuery) return true;

    const terms = normalizedQuery.split(" ").filter(Boolean);
    const haystack = getSearchHaystack(item);

    return terms.every((term) => haystack.includes(term));
  }

  function getFilteredFacturasItems(items = []) {
    const filter = getViewFilter();
    const search = getViewSearch();
    const sort = getViewSort();

    const filtered = safeArray(items).filter((item) => {
      return itemMatchesFilter(item, filter) && itemMatchesSearch(item, search);
    });

    return sort === SORT_DATE_ASC
      ? [...filtered].sort(compareByDateAsc)
      : [...filtered].sort(compareByDateDesc);
  }

  function getTotalPages(items = []) {
    const total = getFilteredFacturasItems(items).length;
    const pageSize = getPageSize();

    return Math.max(1, Math.ceil((total || 1) / pageSize));
  }

  function clampPageAgainstItems(items = []) {
    ensureBaseState();

    const rows = safeArray(items);
    const filteredRows = getFilteredFacturasItems(rows);
    const totalPages = getTotalPages(rows);
    const nextPage = clampNumber(getCurrentPage(), 1, totalPages);

    state.view.page = nextPage;
    state.view.currentPage = nextPage;
    state.view.facturasPage = nextPage;

    const remoteCount = safeNumber(
      first(state.view.remoteCount, state.view.totalCount),
      rows.length
    );

    return {
      page: nextPage,
      currentPage: nextPage,
      facturasPage: nextPage,

      pageSize: getPageSize(),
      facturasPageSize: getPageSize(),

      totalPages,

      totalCount: filteredRows.length,
      totalMatched: filteredRows.length,
      filteredCount: filteredRows.length,
      unfilteredCount: rows.length,
      remoteCount,

      filter: getViewFilter(),
      paymentFilter: getViewFilter(),
      statusFilter: getViewFilter(),
      activeFilter: getViewFilter(),
      facturasFilter: getViewFilter(),

      search: getViewSearch(),
      searchQuery: getViewSearch(),
      query: getViewSearch(),
      q: getViewSearch(),
      term: getViewSearch(),
      keyword: getViewSearch(),
      facturasSearch: getViewSearch(),

      sort: getViewSort(),
      sortBy: getViewSort(),
      orderBy: getViewSort(),
      sortMode: getViewSort(),
      facturasSort: getViewSort(),
    };
  }

  function goToPage(page = 1) {
    if (isFacturasLoading(state) || isFacturasRefreshing(state)) {
      return getCurrentPage();
    }

    const nextPage = setViewPage(page);
    rerender();

    return nextPage;
  }

  function goPrevPage() {
    return goToPage(getCurrentPage() - 1);
  }

  function goNextPage() {
    return goToPage(getCurrentPage() + 1);
  }

  /* =====================================================
     AUTH / PERMISSIONS
  ===================================================== */

  function getCurrentRole() {
    return normalizeKey(
      first(
        AppCore?.state?.user?.role,
        AppCore?.state?.user?.rol,
        AppCore?.state?.role,
        AppCore?.state?.rol,
        AppCore?.auth?.getRole?.(),
        AppCore?.Auth?.getRole?.()
      )
    );
  }

  function isAdminUser() {
    return ADMIN_ROLES.includes(getCurrentRole());
  }

  function canCreateFactura() {
    if (isAdminUser()) return true;

    const permissions = [
      ...normalizeTokenList(AppCore?.state?.permissions),
      ...normalizeTokenList(AppCore?.state?.user?.permissions),
      ...normalizeTokenList(AppCore?.auth?.getPermissions?.()),
      ...normalizeTokenList(AppCore?.Auth?.getPermissions?.()),
    ];

    return permissions.some((permission) =>
      CREATE_PERMISSIONS.includes(permission)
    );
  }

  function getTemplateRoleForCreate() {
    if (canCreateFactura()) return "admin";

    return getCurrentRole();
  }

  /* =====================================================
     FISCAL + RELATION PRESERVER
  ===================================================== */

  function hasFiscalEvidence(item = {}) {
    const source = safeObject(item);
    const raw = safeObject(source.raw);

    return Boolean(
      safeArray(source.impuestos).length ||
        safeArray(raw.impuestos).length ||
        safeArray(source.taxes).length ||
        safeArray(raw.taxes).length ||
        safeArray(source.taxLines).length ||
        safeArray(raw.taxLines).length ||
        safeArray(source.desgloseImpuestos).length ||
        safeArray(raw.desgloseImpuestos).length ||
        safeArray(source.lineas).length ||
        safeArray(raw.lineas).length ||
        safeArray(source.conceptos).length ||
        safeArray(raw.conceptos).length ||
        hasOwnKeys(source.iva) ||
        hasOwnKeys(raw.iva) ||
        hasOwnKeys(source.irpf) ||
        hasOwnKeys(raw.irpf) ||
        hasOwnKeys(source.totales) ||
        hasOwnKeys(raw.totales) ||
        hasOwnKeys(source.totals) ||
        hasOwnKeys(raw.totals) ||
        source.meta?.hasIva ||
        raw.meta?.hasIva ||
        source.meta?.hasIrpf ||
        raw.meta?.hasIrpf ||
        source.meta?.displayIva ||
        raw.meta?.displayIva ||
        source.meta?.displayIrpf ||
        raw.meta?.displayIrpf
    );
  }

  function firstArrayFrom(source = {}, raw = {}, keys = []) {
    for (const key of safeArray(keys)) {
      if (Array.isArray(source?.[key]) && source[key].length) return source[key];
      if (Array.isArray(raw?.[key]) && raw[key].length) return raw[key];
    }

    return [];
  }

  function mergeObjectField(preferred = {}, fallback = {}, key = "") {
    return {
      ...safeObject(fallback?.raw?.[key]),
      ...safeObject(fallback?.[key]),
      ...safeObject(preferred?.raw?.[key]),
      ...safeObject(preferred?.[key]),
    };
  }

  function preserveFiscalFields(item = {}, fallback = {}) {
    const source = safeObject(item);
    const base = safeObject(fallback);

    if (!hasFiscalEvidence(source) && !hasFiscalEvidence(base)) {
      return source;
    }

    const sourceRaw = safeObject(source.raw);
    const baseRaw = safeObject(base.raw);

    const impuestos = safeArray(
      first(
        firstArrayFrom(source, sourceRaw, [
          "impuestos",
          "taxes",
          "taxLines",
          "desgloseImpuestos",
          "taxBreakdown",
        ]),
        firstArrayFrom(base, baseRaw, [
          "impuestos",
          "taxes",
          "taxLines",
          "desgloseImpuestos",
          "taxBreakdown",
        ])
      )
    );

    const lineas = safeArray(
      first(
        firstArrayFrom(source, sourceRaw, [
          "lineas",
          "items",
          "conceptos",
          "lines",
          "invoiceLines",
        ]),
        firstArrayFrom(base, baseRaw, [
          "lineas",
          "items",
          "conceptos",
          "lines",
          "invoiceLines",
        ])
      )
    );

    const iva = mergeObjectField(source, base, "iva");
    const irpf = mergeObjectField(source, base, "irpf");
    const totales = mergeObjectField(source, base, "totales");
    const totals = mergeObjectField(source, base, "totals");
    const summary = mergeObjectField(source, base, "summary");

    const meta = {
      ...safeObject(base.meta),
      ...safeObject(baseRaw.meta),
      ...safeObject(source.meta),
      ...safeObject(sourceRaw.meta),
    };

    const hasIva = Boolean(
      meta.hasIva ||
        hasOwnKeys(iva) ||
        impuestos.some((tax) => {
          const label = normalizeText(first(tax?.tipo, tax?.taxType, tax?.name, tax?.label));
          return label.includes("iva") || label.includes("vat");
        })
    );

    const hasIrpf = Boolean(
      meta.hasIrpf ||
        hasOwnKeys(irpf) ||
        impuestos.some((tax) => {
          const label = normalizeText(first(tax?.tipo, tax?.taxType, tax?.name, tax?.label));
          return (
            label.includes("irpf") ||
            label.includes("retencion") ||
            label.includes("retención") ||
            label.includes("withholding")
          );
        })
    );

    const finalMeta = {
      ...meta,
      hasIva,
      hasIrpf,
      hasFiscalData: Boolean(
        meta.hasFiscalData ||
          hasIva ||
          hasIrpf ||
          impuestos.length ||
          hasOwnKeys(totales) ||
          hasOwnKeys(totals)
      ),
    };

    return {
      ...base,
      ...source,

      impuestos,
      taxes: safeArray(first(source.taxes, impuestos)),
      taxLines: safeArray(first(source.taxLines, impuestos)),
      desgloseImpuestos: safeArray(first(source.desgloseImpuestos, impuestos)),

      iva,
      irpf,
      totales,
      totals,
      summary,
      lineas,

      meta: finalMeta,

      raw: {
        ...baseRaw,
        ...sourceRaw,

        impuestos,
        taxes: safeArray(first(sourceRaw.taxes, source.taxes, impuestos)),
        taxLines: safeArray(first(sourceRaw.taxLines, source.taxLines, impuestos)),
        desgloseImpuestos: safeArray(
          first(sourceRaw.desgloseImpuestos, source.desgloseImpuestos, impuestos)
        ),

        iva,
        irpf,
        totales,
        totals,
        summary,
        lineas,

        meta: {
          ...safeObject(baseRaw.meta),
          ...safeObject(sourceRaw.meta),
          ...finalMeta,
        },
      },
    };
  }

  function buildIncidenciaPayload(item = {}) {
    const source = safeObject(item);
    const raw = safeObject(source.raw);

    const incidencia = safeObject(first(source.incidencia, raw.incidencia));
    const ticket = safeObject(first(source.ticket, raw.ticket));
    const linkedTicket = safeObject(first(source.linkedTicket, raw.linkedTicket));
    const relatedTicket = safeObject(first(source.relatedTicket, raw.relatedTicket));
    const relationTicket = safeObject(first(source.relations?.ticket, raw.relations?.ticket));

    const incidenciaId = getRelatedIncidenciaId(source);

    if (!incidenciaId) return null;

    const subject = safeText(
      first(
        incidencia.subject,
        incidencia.asunto,
        incidencia.title,
        ticket.subject,
        ticket.asunto,
        ticket.title,
        linkedTicket.subject,
        linkedTicket.asunto,
        linkedTicket.title,
        relatedTicket.subject,
        relatedTicket.asunto,
        relatedTicket.title,
        relationTicket.subject,
        relationTicket.asunto,
        relationTicket.title,
        "Incidencia relacionada"
      ),
      "Incidencia relacionada"
    );

    return {
      ...incidencia,

      id: incidenciaId,
      ticketId: incidenciaId,
      incidenciaId,
      code: safeText(first(incidencia.code, ticket.code, linkedTicket.code, incidenciaId), incidenciaId),
      ticketCode: safeText(first(incidencia.ticketCode, ticket.ticketCode, linkedTicket.ticketCode, incidenciaId), incidenciaId),

      subject,
      asunto: subject,
      title: subject,

      clienteId: safeText(
        first(
          incidencia.clienteId,
          ticket.clienteId,
          linkedTicket.clienteId,
          source.clienteId,
          source.cliente?.id,
          raw.clienteId,
          raw.cliente?.id,
          ""
        ),
        ""
      ),

      clienteNombre: safeText(
        first(
          incidencia.clienteNombre,
          ticket.clienteNombre,
          linkedTicket.clienteNombre,
          getClientName(source),
          ""
        ),
        ""
      ),

      relationType: safeText(
        first(
          incidencia.relationType,
          ticket.relationType,
          linkedTicket.relationType,
          source.relationType,
          raw.relationType,
          "linked_ticket"
        ),
        "linked_ticket"
      ),
    };
  }

  function preserveIncidenciaFields(item = {}, fallbackRaw = {}) {
    const source = safeObject(item);
    const embeddedRaw = safeObject(source.raw);
    const externalRaw = safeObject(fallbackRaw);
    const raw = hasOwnKeys(embeddedRaw) ? embeddedRaw : externalRaw;

    const base = {
      ...source,
      raw,
    };

    const incidenciaId = getRelatedIncidenciaId(base);
    const incidenciaPayload = buildIncidenciaPayload(base);

    if (!incidenciaId) return base;

    return {
      ...base,

      ticketId: incidenciaId,
      incidenciaId,
      relatedTicketId: safeText(first(base.relatedTicketId, raw.relatedTicketId, incidenciaId), incidenciaId),
      relatedIncidentId: safeText(first(base.relatedIncidentId, raw.relatedIncidentId, incidenciaId), incidenciaId),
      supportTicketId: safeText(first(base.supportTicketId, raw.supportTicketId, incidenciaId), incidenciaId),
      caseId: safeText(first(base.caseId, raw.caseId, incidenciaId), incidenciaId),

      incidencia: safeObject(first(base.incidencia, raw.incidencia, incidenciaPayload)),
      ticket: safeObject(first(base.ticket, raw.ticket, incidenciaPayload)),
      linkedTicket: safeObject(first(base.linkedTicket, raw.linkedTicket, incidenciaPayload)),

      relations: {
        ...safeObject(base.relations),
        ticket: {
          ...safeObject(base.relations?.ticket),
          ...safeObject(incidenciaPayload),
        },
      },

      meta: {
        ...safeObject(base.meta),
        hasIncidencia: true,
        hasLinkedTicket: true,
        incidenciaId,
        ticketId: incidenciaId,
        linkedTicketId: incidenciaId,
      },

      raw: {
        ...raw,

        ticketId: safeText(first(raw.ticketId, incidenciaId), incidenciaId),
        incidenciaId: safeText(first(raw.incidenciaId, incidenciaId), incidenciaId),
        relatedTicketId: safeText(first(raw.relatedTicketId, incidenciaId), incidenciaId),
        relatedIncidentId: safeText(first(raw.relatedIncidentId, incidenciaId), incidenciaId),
        supportTicketId: safeText(first(raw.supportTicketId, incidenciaId), incidenciaId),
        caseId: safeText(first(raw.caseId, incidenciaId), incidenciaId),

        incidencia: safeObject(first(raw.incidencia, incidenciaPayload)),
        ticket: safeObject(first(raw.ticket, incidenciaPayload)),
        linkedTicket: safeObject(first(raw.linkedTicket, incidenciaPayload)),

        relations: {
          ...safeObject(raw.relations),
          ticket: {
            ...safeObject(raw.relations?.ticket),
            ...safeObject(incidenciaPayload),
          },
        },

        meta: {
          ...safeObject(raw.meta),
          hasIncidencia: true,
          hasLinkedTicket: true,
          incidenciaId,
          ticketId: incidenciaId,
          linkedTicketId: incidenciaId,
        },
      },
    };
  }

  /* =====================================================
     STORE / DETAIL MERGE
  ===================================================== */

  function getItems() {
    try {
      const storeItems = safeArray(getSortedFacturasStore());

      const rawById = new Map();

      storeItems.forEach((item) => {
        const id = getStableFacturaId(item);

        if (id && !rawById.has(id)) {
          rawById.set(id, safeObject(item.raw || item));
        }
      });

      return storeItems.map((item, index) => {
        const id = getStableFacturaId(item);

        const fallbackRaw =
          rawById.get(id) ||
          storeItems[index]?.raw ||
          storeItems[index] ||
          {};

        return preserveIncidenciaFields(
          preserveFiscalFields(item, fallbackRaw),
          fallbackRaw
        );
      });
    } catch (error) {
      safeWarn("getItems falló:", error);
      return [];
    }
  }

  function findFacturaById(facturaId = "") {
    const id = safeText(facturaId, "");

    if (!id) return null;

    return (
      getItems().find((item) =>
        getFacturaIdentityList(item).some((candidate) =>
          sameFacturaIdentity(candidate, id)
        )
      ) || null
    );
  }

  function findFacturaForDetail(detail = {}, preferredId = "") {
    const remote = safeObject(detail);
    const preferred = safeText(preferredId, "");

    if (preferred) {
      const byPreferred = findFacturaById(preferred);
      if (byPreferred) return byPreferred;
    }

    for (const id of getFacturaIdentityList(remote)) {
      const found = findFacturaById(id);
      if (found) return found;
    }

    const remoteIncidenciaId = getRelatedIncidenciaId(remote);

    if (remoteIncidenciaId) {
      return (
        getItems().find((item) => getRelatedIncidenciaId(item) === remoteIncidenciaId) ||
        null
      );
    }

    return null;
  }

  function mergeFacturaDetailWithStoreSnapshot(detail = {}, preferredFacturaId = "") {
    const remote = safeObject(detail);

    if (!hasOwnKeys(remote)) return null;

    const storeItem = findFacturaForDetail(remote, preferredFacturaId);

    if (!storeItem) {
      return preserveIncidenciaFields(
        preserveFiscalFields(remote, remote.raw || remote),
        remote.raw || remote
      );
    }

    const storeEnriched = preserveIncidenciaFields(
      preserveFiscalFields(storeItem, storeItem.raw || storeItem),
      storeItem.raw || storeItem
    );

    const merged = {
      ...storeEnriched,
      ...remote,

      raw: {
        ...safeObject(storeEnriched.raw),
        ...safeObject(remote.raw),
      },

      meta: {
        ...safeObject(storeEnriched.meta),
        ...safeObject(storeEnriched.raw?.meta),
        ...safeObject(remote.raw?.meta),
        ...safeObject(remote.meta),
      },
    };

    return preserveIncidenciaFields(
      preserveFiscalFields(merged, storeEnriched),
      {
        ...safeObject(storeEnriched.raw),
        ...safeObject(remote.raw),
      }
    );
  }

  /* =====================================================
     INCIDENCIA MODAL BRIDGE
  ===================================================== */

  async function apiGet(endpoint = "") {
    const path = safeText(endpoint, "");

    if (!path) {
      throw new Error("API_ENDPOINT_REQUIRED");
    }

    const client =
      AppCore?.apiClient ||
      AppCore?.modules?.Http ||
      AppCore?.Http ||
      window?.Http ||
      null;

    if (typeof client?.get === "function") {
      return client.get(path, {
        timeout: INCIDENCIA_DETAIL_TIMEOUT,
        auth: true,
      });
    }

    if (typeof client?.request === "function") {
      return client.request(path, {
        method: "GET",
        timeout: INCIDENCIA_DETAIL_TIMEOUT,
        auth: true,
      });
    }

    throw new Error("API_CLIENT_UNAVAILABLE");
  }

  function pickIncidenciaDetail(payload = null) {
    if (!payload) return null;

    const obj = safeObject(payload);

    return (
      obj.detail ||
      obj.ticket ||
      obj.incidencia ||
      obj.item ||
      obj.data?.detail ||
      obj.data?.ticket ||
      obj.data?.incidencia ||
      obj.data?.item ||
      obj.data ||
      obj.result?.detail ||
      obj.result?.ticket ||
      obj.result?.incidencia ||
      obj.result?.item ||
      obj.result ||
      obj.payload?.detail ||
      obj.payload?.ticket ||
      obj.payload?.incidencia ||
      obj.payload?.item ||
      obj.payload ||
      obj
    );
  }

  async function fetchIncidenciaDetail(ticketId = "") {
    const id = safeText(ticketId, "");
    if (!id) return null;

    const encodedId = encodeURIComponent(id);
    const endpoints = [
      `/api/tickets/${encodedId}`,
      `/api/incidencias/${encodedId}`,
    ];

    let lastError = null;

    for (const endpoint of endpoints) {
      try {
        const response = await apiGet(endpoint);
        const detail = pickIncidenciaDetail(response);

        if (detail && typeof detail === "object") {
          return detail;
        }
      } catch (error) {
        lastError = error;

        const status = safeNumber(
          first(error?.status, error?.statusCode, error?.response?.status),
          0
        );

        if (status && ![404, 405].includes(status)) {
          break;
        }
      }
    }

    if (lastError) {
      safeWarn("No se pudo cargar detalle de incidencia:", lastError);
    }

    return null;
  }

  function findFacturaByIncidenciaId(ticketId = "") {
    const id = safeText(ticketId, "");

    if (!id) return null;

    return getItems().find((item) => getRelatedIncidenciaId(item) === id) || null;
  }

  function buildIncidenciaFallback(ticketId = "") {
    const id = safeText(ticketId, "");
    const factura = findFacturaByIncidenciaId(id);
    const incidenciaPayload = factura ? buildIncidenciaPayload(factura) : null;
    const facturaId = factura ? getStableFacturaId(factura) : "";

    return {
      ...safeObject(incidenciaPayload),

      id,
      ticketId: id,
      incidenciaId: id,
      code: id,
      ticketCode: id,

      subject: safeText(
        first(
          incidenciaPayload?.subject,
          incidenciaPayload?.asunto,
          "Incidencia relacionada"
        ),
        "Incidencia relacionada"
      ),

      title: safeText(
        first(
          incidenciaPayload?.title,
          incidenciaPayload?.subject,
          incidenciaPayload?.asunto,
          "Incidencia relacionada"
        ),
        "Incidencia relacionada"
      ),

      asunto: safeText(
        first(
          incidenciaPayload?.asunto,
          incidenciaPayload?.subject,
          "Incidencia relacionada"
        ),
        "Incidencia relacionada"
      ),

      status: safeText(first(incidenciaPayload?.status, incidenciaPayload?.estado, "open"), "open"),
      estado: safeText(first(incidenciaPayload?.estado, incidenciaPayload?.status, "open"), "open"),

      priority: safeText(first(incidenciaPayload?.priority, incidenciaPayload?.prioridad, "medium"), "medium"),
      prioridad: safeText(first(incidenciaPayload?.prioridad, incidenciaPayload?.priority, "medium"), "medium"),

      description: safeText(
        first(
          incidenciaPayload?.description,
          incidenciaPayload?.descripcion,
          incidenciaPayload?.message,
          facturaId ? `Incidencia vinculada a la factura ${facturaId}.` : ""
        ),
        "Incidencia vinculada a una factura."
      ),

      facturaId,
      invoiceId: facturaId,
      factura: facturaId,
      facturaRelacionada: facturaId,
      invoiceCode: facturaId,

      clienteId: safeText(
        first(
          incidenciaPayload?.clienteId,
          factura?.clienteId,
          factura?.cliente?.id,
          factura?.raw?.clienteId,
          factura?.raw?.cliente?.id,
          ""
        ),
        ""
      ),

      clienteNombre: safeText(
        first(
          incidenciaPayload?.clienteNombre,
          getClientName(factura),
          factura?.clienteNombre,
          factura?.raw?.clienteNombre,
          ""
        ),
        ""
      ),

      raw: {
        ...safeObject(incidenciaPayload),
        linkedFacturaId: facturaId,
        factura,
      },
    };
  }

  function mergeIncidenciaDetail(fallback = {}, remote = {}) {
    const base = safeObject(fallback);
    const next = safeObject(remote);

    const id = safeText(
      first(
        next.ticketId,
        next.id,
        next.code,
        next.ticketCode,
        next.incidenciaId,
        base.ticketId,
        base.id
      ),
      ""
    );

    const facturaId = safeText(
      first(
        next.facturaId,
        next.invoiceId,
        base.facturaId,
        base.invoiceId
      ),
      ""
    );

    const facturaLabel = safeText(
      first(
        next.factura,
        next.facturaRelacionada,
        next.invoiceCode,
        base.factura,
        base.facturaRelacionada,
        base.invoiceCode,
        facturaId
      ),
      ""
    );

    return {
      ...base,
      ...next,

      id,
      ticketId: id,
      incidenciaId: safeText(first(next.incidenciaId, id), id),
      code: safeText(first(next.code, next.ticketCode, id), id),
      ticketCode: safeText(first(next.ticketCode, next.code, id), id),

      facturaId,
      invoiceId: safeText(first(next.invoiceId, next.facturaId, facturaId), facturaId),
      factura: facturaLabel,
      facturaRelacionada: facturaLabel,
      invoiceCode: safeText(first(next.invoiceCode, facturaLabel), facturaLabel),

      raw: {
        ...safeObject(base.raw),
        ...safeObject(next.raw || next),

        id,
        ticketId: id,
        incidenciaId: safeText(first(next.incidenciaId, id), id),

        facturaId,
        invoiceId: safeText(first(next.invoiceId, next.facturaId, facturaId), facturaId),
        facturaRelacionada: facturaLabel,
      },
    };
  }

  async function ensureIncidenciasModal() {
    try {
      if (typeof window?.OnionIncidenciasModal?.open === "function") {
        return window.OnionIncidenciasModal;
      }
    } catch {}

    try {
      const mod = await import("../incidencias/incidencias.modal.js");

      return (
        mod?.OnionIncidenciasModal ||
        mod?.default ||
        window?.OnionIncidenciasModal ||
        null
      );
    } catch {
      return null;
    }
  }

  async function openIncidenciaModal(detail = {}) {
    const payload = safeObject(detail);
    const modal = await ensureIncidenciasModal();

    try {
      if (typeof modal?.open === "function") {
        modal.open(payload);
        return modal;
      }
    } catch {}

    safeEmit("incidencias:modal:open", {
      detail: payload,
      ticketId: safeText(first(payload.ticketId, payload.id), ""),
      incidenciaId: safeText(first(payload.incidenciaId, payload.id), ""),
    });

    return modal || true;
  }

  async function updateIncidenciaModal(modal = null, detail = {}) {
    const payload = safeObject(detail);

    try {
      if (modal && typeof modal.update === "function") {
        modal.update(payload);
        return true;
      }
    } catch {}

    try {
      if (modal && typeof modal.open === "function") {
        modal.open(payload);
        return true;
      }
    } catch {}

    safeEmit("incidencias:modal:update", {
      detail: payload,
      ticketId: safeText(first(payload.ticketId, payload.id), ""),
      incidenciaId: safeText(first(payload.incidenciaId, payload.id), ""),
    });

    return true;
  }

  function setIncidenciaModalFeedback(modal = null, message = "", type = "info") {
    const text = safeText(message, "");
    if (!text) return false;

    try {
      if (modal && typeof modal.setFeedback === "function") {
        modal.setFeedback(text, type);
        return true;
      }
    } catch {}

    return false;
  }

  async function openIncidenciaBridge(ticketId = "") {
    const id = safeText(ticketId, "");

    if (!id) {
      showToast("No hay incidencia relacionada.", "error");
      return false;
    }

    safeEmit("facturas:incidencia:open", {
      ticketId: id,
      incidenciaId: id,
    });

    const fallback = buildIncidenciaFallback(id);
    const modal = await openIncidenciaModal(fallback);

    try {
      const fetchedDetail = await fetchIncidenciaDetail(id);

      if (!fetchedDetail) {
        setIncidenciaModalFeedback(
          modal,
          "La incidencia se ha abierto con la información vinculada a la factura. No se encontró detalle remoto adicional.",
          "info"
        );

        return true;
      }

      const finalDetail = mergeIncidenciaDetail(fallback, fetchedDetail);

      await updateIncidenciaModal(modal, finalDetail);

      safeEmit("incidencias:open:success", {
        ticketId: id,
        incidenciaId: id,
        detail: finalDetail,
      });

      return true;
    } catch (error) {
      safeWarn("openIncidenciaBridge fallback:", error);

      setIncidenciaModalFeedback(
        modal,
        "La incidencia se ha abierto con la información vinculada a la factura, pero no se pudo cargar el detalle completo desde la API.",
        "info"
      );

      safeEmit("facturas:incidencia:open:fallback", {
        ticketId: id,
        incidenciaId: id,
        error,
      });

      return true;
    }
  }

  /* =====================================================
     TEMPLATE STATE
  ===================================================== */

  function getTemplateState() {
    ensureBaseState();

    const canCreate = canCreateFactura();

    return {
      ...getFacturasTemplateState(state),

      error: safeText(state?.view?.error, ""),
      lastSyncAt: getFacturasLastSyncAt(state),

      selectedFacturaId: safeText(state?.view?.selectedFacturaId, ""),

      page: getCurrentPage(),
      currentPage: getCurrentPage(),
      facturasPage: getCurrentPage(),

      pageSize: getPageSize(),
      facturasPageSize: getPageSize(),

      filter: getViewFilter(),
      paymentFilter: getViewFilter(),
      statusFilter: getViewFilter(),
      activeFilter: getViewFilter(),
      facturasFilter: getViewFilter(),

      search: getViewSearch(),
      searchQuery: getViewSearch(),
      query: getViewSearch(),
      q: getViewSearch(),
      term: getViewSearch(),
      keyword: getViewSearch(),
      facturasSearch: getViewSearch(),

      sort: getViewSort(),
      sortBy: getViewSort(),
      orderBy: getViewSort(),
      sortMode: getViewSort(),
      facturasSort: getViewSort(),

      loading: isFacturasLoading(state),
      refreshing: isFacturasRefreshing(state),

      openingFacturaId: safeText(state?.actions?.openingFacturaId, ""),
      viewingFacturaId: safeText(state?.actions?.viewingFacturaId, ""),
      downloadingFacturaId: safeText(state?.actions?.downloadingFacturaId, ""),
      sendingFacturaId: safeText(state?.actions?.sendingFacturaId, ""),

      detailLoading: Boolean(state?.detail?.loading),

      role: getTemplateRoleForCreate(),
      rawRole: getCurrentRole(),
      isAdmin: isAdminUser(),
      canCreateFactura: canCreate,

      creating: Boolean(state?.actions?.creatingFacturaId || state?.actions?.creating),
      creatingFactura: Boolean(state?.actions?.creatingFacturaId || state?.actions?.creating),
    };
  }

  function getBindingState() {
    const templateState = getTemplateState();

    return {
      ...templateState,

      detailOpen: isFacturasDetailOpen(state),
      bootstrapped: isFacturasBootstrapped(state),

      view: {
        ...safeObject(state.view),
        ...templateState,
      },

      actions: {
        ...safeObject(state.actions),
      },

      detail: {
        ...safeObject(state.detail),
      },
    };
  }

  /* =====================================================
     DETAIL STATE
  ===================================================== */

  function setDetail(data = null, preferredFacturaId = "") {
    const patchedDetail = data
      ? mergeFacturaDetailWithStoreSnapshot(
          data,
          first(
            preferredFacturaId,
            state?.view?.selectedFacturaId,
            getStableFacturaId(data)
          )
        )
      : null;

    setFacturasDetailData(state, patchedDetail);
    setFacturasDetailOpen(state, Boolean(patchedDetail));

    syncDetailBodyState();

    return patchedDetail;
  }

  function closeDetail() {
    closeFacturasDetail(state);
    state.view.selectedFacturaId = "";

    syncDetailBodyState();
    renderDetailPortal();
    rerender();

    safeEmit("facturas:detail:close", {});
  }

  /* =====================================================
     CREATE FACTURA
  ===================================================== */

  async function createFactura(draft = {}) {
    if (!canCreateFactura()) {
      showToast("No tienes permisos para crear facturas.", "error");
      return false;
    }

    const payload = safeObject(draft);

    safeEmit("facturas:create:open", {
      draft: payload,
    });

    try {
      if (typeof FacturasCreateModal?.open === "function") {
        FacturasCreateModal.open(payload);
        return true;
      }
    } catch {}

    try {
      if (typeof window?.OnionFacturasCreateModal?.open === "function") {
        window.OnionFacturasCreateModal.open(payload);
        return true;
      }
    } catch {}

    safeEmit("facturas:create-modal:open", {
      draft: payload,
    });

    return true;
  }

  function attachCreateSuccessListener() {
    cleanupCreateSuccessListener();

    const handler = async (eventOrPayload = {}) => {
      if (destroyed) return;

      const payload = extractExternalOpenPayload(eventOrPayload);

      try {
        await loadFacturas({
          force: true,
          silent: true,
          asRefresh: true,
        });

        const facturaId = getFacturaIdFromSearchPayload(payload);

        if (facturaId && payload.openAfterCreate !== false) {
          await openFactura(facturaId);
        }
      } catch {
        showToast(
          "Factura creada, pero no se pudo refrescar el listado.",
          "warning"
        );
      }
    };

    createSuccessCleanup = safeOn("facturas:create:success", handler);
  }

  /* =====================================================
     DETAIL PORTAL
  ===================================================== */

  function getDetailRoot() {
    return document.getElementById(DETAIL_MODAL_ID);
  }

  function ensureDetailRoot() {
    let root = getDetailRoot();

    if (root) return root;

    root = document.createElement("div");
    root.id = DETAIL_MODAL_ID;
    root.setAttribute("data-facturas-detail-root", "true");

    document.body.appendChild(root);

    return root;
  }

  function destroyDetailRoot() {
    try {
      getDetailRoot()?.remove?.();
    } catch {}
  }

  function syncDetailBodyState() {
    try {
      document.body.classList.toggle(
        "facturas-detail-open",
        isFacturasDetailOpen(state)
      );
    } catch {}
  }

  function renderDetailPortal() {
    const root = ensureDetailRoot();
    const rawDetail = getFacturasDetailData(state);

    const detail = rawDetail
      ? mergeFacturaDetailWithStoreSnapshot(
          rawDetail,
          first(
            state?.view?.selectedFacturaId,
            getStableFacturaId(rawDetail)
          )
        )
      : null;

    const detailOpen = isFacturasDetailOpen(state);

    syncDetailBodyState();

    if (!detailOpen && !detail) {
      root.innerHTML = "";
      cleanupModalBindings();
      return root;
    }

    root.innerHTML = renderFacturasDetailModal({
      detailOpen,
      detailLoading: Boolean(state?.detail?.loading),
      factura: detail,

      sendingFacturaId: safeText(state?.actions?.sendingFacturaId, ""),
      viewingFacturaId: safeText(state?.actions?.viewingFacturaId, ""),
      downloadingFacturaId: safeText(state?.actions?.downloadingFacturaId, ""),
    });

    bindModalPortal();

    return root;
  }

  function bindModalPortal() {
    cleanupModalBindings();

    const root = getDetailRoot();
    if (!root) return;

    const onClick = async (event) => {
      const overlay = event.target.closest(
        "[data-facturas-detail-overlay='true']"
      );

      const modal = event.target.closest(
        "[data-role='facturas-detail-modal']"
      );

      if (overlay && !modal && event.target === overlay) {
        event.preventDefault();
        closeDetail();
        return;
      }

      const closeAction = event.target.closest(
        '[data-action="close-factura-detail"]'
      );

      if (closeAction) {
        event.preventDefault();
        closeDetail();
        return;
      }

      const incidenciaBtn = event.target.closest(
        '[data-action="open-incidencia"]'
      );

      if (incidenciaBtn) {
        event.preventDefault();

        const ticketId = safeText(
          first(
            incidenciaBtn.dataset.ticketId,
            incidenciaBtn.dataset.incidenciaId,
            incidenciaBtn.getAttribute("data-ticket-id"),
            incidenciaBtn.getAttribute("data-incidencia-id")
          ),
          ""
        );

        await openIncidenciaBridge(ticketId);
        return;
      }

      const pdfBtn = event.target.closest('[data-action="view-factura-pdf"]');

      if (pdfBtn) {
        event.preventDefault();

        const facturaId = safeText(pdfBtn.dataset.facturaId, "");
        if (!facturaId) return;

        await openFacturaPdf(facturaId);
        return;
      }

      const downloadBtn = event.target.closest(
        '[data-action="download-factura"]'
      );

      if (downloadBtn) {
        event.preventDefault();

        const facturaId = safeText(downloadBtn.dataset.facturaId, "");
        if (!facturaId) return;

        await downloadFacturaPdf(facturaId);
        return;
      }

      const sendBtn = event.target.closest('[data-action="send-factura"]');

      if (sendBtn) {
        event.preventDefault();

        const facturaId = safeText(sendBtn.dataset.facturaId, "");
        if (!facturaId) return;

        await sendFacturaToClient(facturaId);
      }
    };

    const onKeydown = (event) => {
      if (!isFacturasDetailOpen(state)) return;
      if (event.key !== "Escape") return;

      event.preventDefault();
      closeDetail();
    };

    root.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeydown);

    modalBindingsCleanup = () => {
      try {
        root.removeEventListener("click", onClick);
      } catch {}

      try {
        document.removeEventListener("keydown", onKeydown);
      } catch {}
    };
  }

  function renderDetailOnly() {
    if (!isFacturasHydrated(state)) return null;

    renderDetailPortal();

    return true;
  }

  /* =====================================================
     RENDER
  ===================================================== */

  function buildHtml() {
    ensureBaseState();

    const items = getItems();
    const pagination = clampPageAgainstItems(items);

    const templateState = {
      ...getTemplateState(),
      ...pagination,
    };

    return `
      <section
        class="panel-content dashboard ready"
        data-facturas-panel="true"
        data-facturas-scope="${escapeHtml(SCOPE)}"
      >
        <div class="content-wrapper facturas-view__content">
          ${renderFacturasTemplate({
            items,
            state: templateState,

            totalCount: templateState.totalCount,
            totalMatched: templateState.totalMatched,
            remoteCount: templateState.remoteCount,
            totalPages: templateState.totalPages,

            page: templateState.page,
            pageSize: templateState.pageSize,

            filter: templateState.filter,
            paymentFilter: templateState.paymentFilter,
            statusFilter: templateState.statusFilter,
            activeFilter: templateState.activeFilter,
            facturasFilter: templateState.facturasFilter,

            search: templateState.search,
            searchQuery: templateState.searchQuery,
            query: templateState.query,
            q: templateState.q,
            term: templateState.term,
            keyword: templateState.keyword,
            facturasSearch: templateState.facturasSearch,

            sort: templateState.sort,
            sortBy: templateState.sortBy,
            orderBy: templateState.orderBy,
            sortMode: templateState.sortMode,
            facturasSort: templateState.facturasSort,
          })}
        </div>
      </section>
    `;
  }

  function render() {
    const container = getContainer();

    if (!container || destroyed) return null;

    ensureBaseState();

    container.innerHTML = buildHtml();

    bindFacturasTemplateDom(container);
    renderDetailPortal();

    setFacturasHydrated(state, true);

    return container;
  }

  function rerender() {
    if (destroyed) return null;

    cancelScheduledRender();

    const result = render();

    if (!destroyed) {
      bind();
    }

    return result;
  }

  function scheduleRerender() {
    if (destroyed) return null;

    if (renderFrame) return renderFrame;

    renderFrame = requestFrame(() => {
      renderFrame = 0;
      rerender();
    });

    return renderFrame;
  }

  /* =====================================================
     LOADERS
  ===================================================== */

  async function loadFacturas({
    force = false,
    silent = false,
    asRefresh = false,
  } = {}) {
    if (destroyed) return getItems();

    if (inflightLoad) return inflightLoad;

    inflightLoad = (async () => {
      const hasData = getItems().length > 0;

      clearFacturasError(state);

      setFacturasLoading(state, !hasData && !silent);
      setFacturasRefreshing(state, hasData && asRefresh);

      rerender();

      try {
        const response = await loadFacturasCollection({
          state,
          render: () => {},
          silent,
          force,
        });

        setFacturasLoading(state, false);
        setFacturasRefreshing(state, false);
        setFacturasLoaded(state, true);
        setFacturasBootstrapped(state, true);
        setFacturasLastSyncAt(state, new Date().toISOString());

        clampPageAgainstItems(getItems());

        safeEmit("facturas:loaded", {
          items: getItems(),
          filteredItems: getFilteredFacturasItems(getItems()),
          response,
          force,
          silent,
          asRefresh,
          filter: getViewFilter(),
          search: getViewSearch(),
          sort: getViewSort(),
        });

        return getItems();
      } catch (error) {
        setFacturasLoading(state, false);
        setFacturasRefreshing(state, false);

        state.view.error = safeErrorMessage(error);

        if (!silent) {
          showToast(safeErrorMessage(error), "error");
        }

        safeEmit("facturas:load:error", {
          error,
          message: safeErrorMessage(error),
        });

        return getItems();
      } finally {
        if (!destroyed) {
          rerender();
        }
      }
    })();

    try {
      return await inflightLoad;
    } finally {
      inflightLoad = null;
    }
  }

  async function loadFacturaDetail(id = "") {
    const facturaId = safeText(id, "");
    if (!facturaId) return null;

    state.view.selectedFacturaId = facturaId;

    setFacturasDetailOpen(state, true);
    setFacturasDetailLoading(state, true);

    renderDetailOnly();

    try {
      const detail = await loadFacturaDetailById({
        state,
        render: () => {},
        facturaId,
        force: true,
      });

      const patchedDetail = detail
        ? mergeFacturaDetailWithStoreSnapshot(detail, facturaId)
        : null;

      setFacturasDetailLoading(state, false);

      if (patchedDetail) {
        setDetail(patchedDetail, facturaId);
      }

      renderDetailOnly();

      return patchedDetail;
    } catch (error) {
      setFacturasDetailLoading(state, false);

      renderDetailOnly();

      safeEmit("facturas:detail:load:error", {
        facturaId,
        error,
      });

      showToast("No se pudo cargar detalle.", "error");

      return null;
    }
  }

  /* =====================================================
     ACTIONS
  ===================================================== */

  async function openFactura(id = "") {
    const facturaId = getValueFromMaybeObject(id);

    if (!facturaId) return null;

    state.view.selectedFacturaId = facturaId;

    setFacturasOpeningFacturaId(state, facturaId);
    setFacturasDetailOpen(state, true);
    setFacturasDetailLoading(state, true);

    const storeSnapshot = findFacturaById(facturaId);

    if (storeSnapshot) {
      setFacturasDetailData(
        state,
        mergeFacturaDetailWithStoreSnapshot(storeSnapshot, facturaId)
      );
    }

    renderDetailOnly();
    scheduleRerender();

    try {
      const detail = await openFacturaAction({
        facturaId,
        loadFacturaDetail,
        preferFresh: true,
        silent: true,
      });

      const patchedDetail = detail
        ? mergeFacturaDetailWithStoreSnapshot(detail, facturaId)
        : mergeFacturaDetailWithStoreSnapshot(storeSnapshot || {}, facturaId);

      if (!patchedDetail) {
        throw new Error("EMPTY_FACTURA_DETAIL");
      }

      setDetail(patchedDetail, facturaId);

      safeEmit("facturas:open:success", {
        facturaId,
        detail: patchedDetail,
      });

      renderDetailOnly();

      return patchedDetail;
    } catch (error) {
      const fallbackDetail = storeSnapshot
        ? mergeFacturaDetailWithStoreSnapshot(storeSnapshot, facturaId)
        : null;

      if (fallbackDetail) {
        setDetail(fallbackDetail, facturaId);

        safeEmit("facturas:open:fallback", {
          facturaId,
          detail: fallbackDetail,
          error,
        });

        showToast(
          "Factura abierta con datos locales. No se pudo cargar el detalle remoto.",
          "warning"
        );

        return fallbackDetail;
      }

      safeEmit("facturas:open:error", {
        facturaId,
        error,
      });

      showToast("No se pudo abrir la factura.", "error");

      return null;
    } finally {
      setFacturasOpeningFacturaId(state, "");
      setFacturasDetailLoading(state, false);

      renderDetailOnly();
      rerender();
    }
  }

  async function openFacturaPdf(id = "") {
    const facturaId = safeText(id, "");

    if (!facturaId) {
      showToast("No se pudo identificar la factura.", "error");
      return null;
    }

    return openFacturaPdfAction({
      facturaId,

      onStart(value) {
        setFacturasViewingFacturaId(state, value);

        renderDetailOnly();
        rerender();
      },

      onEnd() {
        setFacturasViewingFacturaId(state, "");

        renderDetailOnly();
        rerender();
      },
    });
  }

  async function downloadFacturaPdf(id = "") {
    const facturaId = safeText(id, "");

    if (!facturaId) {
      showToast("No se pudo identificar la factura.", "error");
      return null;
    }

    return downloadFacturaPdfAction({
      facturaId,

      onStart(value) {
        setFacturasDownloadingFacturaId(state, value);

        renderDetailOnly();
        rerender();
      },

      onEnd() {
        setFacturasDownloadingFacturaId(state, "");

        renderDetailOnly();
        rerender();
      },
    });
  }

  async function sendFacturaToClient(id = "") {
    const facturaId = safeText(id, "");

    if (!facturaId) {
      showToast("No se pudo identificar la factura.", "error");
      return null;
    }

    const result = await sendFacturaToClientAction({
      facturaId,
      detail: getFacturasDetailData(state),

      onStart(value) {
        setFacturasSendingFacturaId(state, value);

        renderDetailOnly();
        rerender();
      },

      onEnd() {
        setFacturasSendingFacturaId(state, "");

        renderDetailOnly();
        rerender();
      },
    });

    try {
      await loadFacturas({
        force: true,
        silent: true,
        asRefresh: true,
      });

      const currentDetailId = safeText(
        first(
          state.view.selectedFacturaId,
          getStableFacturaId(getFacturasDetailData(state))
        ),
        ""
      );

      if (currentDetailId && sameFacturaIdentity(currentDetailId, facturaId)) {
        const refreshed = findFacturaById(facturaId);

        if (refreshed) {
          setDetail(refreshed, facturaId);
          renderDetailOnly();
        }
      }
    } catch {
      showToast(
        "Factura enviada, pero no se pudo refrescar el listado.",
        "warning"
      );
    }

    safeEmit("facturas:send:done", {
      facturaId,
      result,
    });

    return result;
  }

  function exportFacturasCsv() {
    const items = getItems();
    const filteredItems = getFilteredFacturasItems(items);

    const hasActiveCriteria =
      getViewFilter() !== DEFAULT_FILTER ||
      Boolean(getViewSearch()) ||
      getViewSort() !== DEFAULT_SORT;

    return exportFacturasCsvAction({
      items: hasActiveCriteria ? filteredItems : items,
      filenamePrefix: hasActiveCriteria
        ? "facturas-filtradas"
        : "facturas",
    });
  }

  /* =====================================================
     EXTERNAL OPEN / URL / SEARCH BRIDGE
  ===================================================== */

  function getFacturaIdFromSearchPayload(payload = {}) {
    if (typeof payload === "string" || typeof payload === "number") {
      return safeText(payload, "");
    }

    const source = safeObject(payload);
    const item = safeObject(source.item);
    const detail = safeObject(source.detail);
    const factura = safeObject(source.factura);
    const invoice = safeObject(source.invoice);
    const raw = safeObject(first(source.raw, item.raw, factura.raw, invoice.raw));

    const direct = safeText(
      first(
        source.facturaId,
        source.invoiceId,
        source.id,
        source._id,
        source.entityId,
        source.value,
        source.key,
        source.code,

        detail.facturaId,
        detail.invoiceId,
        detail.id,
        detail._id,
        detail.numero,
        detail.numeroFactura,
        detail.numeroFacturaLegal,
        detail.numeroFacturaSistema,

        factura.facturaId,
        factura.invoiceId,
        factura.id,
        factura._id,
        factura.numero,
        factura.numeroFactura,
        factura.numeroFacturaLegal,
        factura.numeroFacturaSistema,

        invoice.facturaId,
        invoice.invoiceId,
        invoice.id,
        invoice._id,
        invoice.numero,
        invoice.numeroFactura,
        invoice.numeroFacturaLegal,
        invoice.numeroFacturaSistema,

        item.entityId,
        item.facturaId,
        item.invoiceId,
        item.id,
        item._id,
        item.value,
        item.key,
        item.code,

        raw.facturaId,
        raw.invoiceId,
        raw.id,
        raw._id,
        raw.numero,
        raw.numeroFactura,
        raw.numeroFacturaLegal,
        raw.numeroFacturaSistema
      ),
      ""
    );

    if (direct) return direct;

    try {
      const href = safeText(first(source.href, source.url, item.href, item.url), "");

      if (href) {
        const url = new URL(href, window.location.origin);

        for (const key of FACTURA_QUERY_KEYS) {
          const value = safeText(url.searchParams.get(key), "");
          if (value) return value;
        }
      }
    } catch {}

    return "";
  }

  function getFacturaIdFromLocation() {
    try {
      const params = new URLSearchParams(window.location.search || "");

      for (const key of FACTURA_QUERY_KEYS) {
        const value = safeText(params.get(key), "");
        if (value) return value;
      }
    } catch {}

    return "";
  }

  function clearFacturaIdFromLocation() {
    try {
      const url = new URL(window.location.href);
      const params = url.searchParams;

      FACTURA_QUERY_KEYS.forEach((key) => {
        params.delete(key);
      });

      const nextSearch = params.toString();

      const nextUrl = [
        url.pathname,
        nextSearch ? `?${nextSearch}` : "",
        url.hash || "",
      ].join("");

      window.history.replaceState(
        window.history.state || {},
        "",
        nextUrl
      );

      return true;
    } catch {
      return false;
    }
  }

  function extractExternalOpenPayload(eventOrPayload = {}) {
    if (typeof eventOrPayload === "string" || typeof eventOrPayload === "number") {
      return {
        facturaId: safeText(eventOrPayload, ""),
      };
    }

    if (eventOrPayload?.detail?.payload) {
      return safeObject(eventOrPayload.detail.payload);
    }

    if (
      eventOrPayload?.detail?.detail ||
      eventOrPayload?.detail?.factura ||
      eventOrPayload?.detail?.item
    ) {
      return safeObject(eventOrPayload.detail);
    }

    if (eventOrPayload?.detail && typeof eventOrPayload.detail === "object") {
      return safeObject(eventOrPayload.detail);
    }

    return safeObject(eventOrPayload);
  }

  async function openFacturaFromExternalRequest(payload = {}) {
    const source = extractExternalOpenPayload(payload);
    const facturaId = getFacturaIdFromSearchPayload(source);

    if (!facturaId) {
      showToast("No se pudo identificar la factura.", "error");
      return null;
    }

    if (
      inflightExternalOpen &&
      inflightExternalOpenFacturaId &&
      sameFacturaIdentity(inflightExternalOpenFacturaId, facturaId)
    ) {
      return inflightExternalOpen;
    }

    inflightExternalOpenFacturaId = facturaId;

    inflightExternalOpen = (async () => {
      if (!isFacturasBootstrapped(state) && !getItems().length) {
        await loadFacturas({
          force: false,
          silent: true,
          asRefresh: false,
        });
      }

      const result = await openFactura(facturaId);

      if (result) {
        safeEmit("facturas:opened-from-external", {
          source: safeText(source.source, "external"),
          facturaId,
          detail: result,
          payload: source,
        });
      }

      return result;
    })();

    try {
      return await inflightExternalOpen;
    } finally {
      inflightExternalOpen = null;
      inflightExternalOpenFacturaId = "";
    }
  }

  async function openFacturaFromLocationOnce() {
    const facturaId = getFacturaIdFromLocation();

    if (!facturaId) return null;

    if (lastAutoOpenedFacturaId === facturaId && isFacturasDetailOpen(state)) {
      clearFacturaIdFromLocation();
      return getFacturasDetailData(state);
    }

    lastAutoOpenedFacturaId = facturaId;

    const result = await openFacturaFromExternalRequest({
      source: "location",
      facturaId,
    });

    clearFacturaIdFromLocation();

    return result;
  }

  function attachSearchOpenListener() {
    cleanupSearchOpenListener();

    const cleanups = FACTURA_OPEN_EVENTS.map((eventName) =>
      safeOn(eventName, async (event) => {
        if (destroyed) return;

        const payload = extractExternalOpenPayload(event);

        await openFacturaFromExternalRequest({
          ...payload,
          source: safeText(payload.source, eventName),
        });
      })
    );

    searchOpenCleanup = () => {
      cleanups.forEach((cleanup) => {
        try {
          cleanup?.();
        } catch {}
      });
    };
  }

  function registerFacturasBridge() {
    const bridge = {
      open(payload = {}) {
        return openFacturaFromExternalRequest(payload);
      },

      openById(facturaId = "") {
        return openFacturaFromExternalRequest({ facturaId });
      },

      close() {
        closeDetail();
        return true;
      },

      refresh(options = {}) {
        return loadFacturas({
          force: true,
          silent: Boolean(options.silent),
          asRefresh: true,
        });
      },

      create(draft = {}) {
        return createFactura(draft);
      },

      setFilter(filter = DEFAULT_FILTER) {
        const next = setViewFilter(filter);
        rerender();
        return next;
      },

      setSearch(query = "") {
        const next = setViewSearch(query);
        rerender();
        return next;
      },

      setSort(sort = DEFAULT_SORT) {
        const next = setViewSort(sort);
        rerender();
        return next;
      },

      toggleSort() {
        const next = setViewSort(getNextDateSort(getViewSort()));
        rerender();
        return next;
      },

      clearFilters() {
        clearViewFilters();
        rerender();
        return true;
      },

      getState() {
        return api.getState();
      },
    };

    try {
      if (!AppCore.modules || typeof AppCore.modules !== "object") {
        AppCore.modules = {};
      }

      AppCore.modules.Facturas = api;
      AppCore.modules.FacturasView = api;
      AppCore.modules.OnionFacturasUI = api;
      AppCore.modules.OnionFacturasModal = bridge;
    } catch {}

    try {
      window.OnionFacturasUI = api;
      window.OnionFacturasView = api;

      window.OnionFacturasModal = bridge;
      window.OnionFacturaModal = bridge;
      window.FacturasModal = bridge;
      window.FacturaModal = bridge;

      window.openFacturaModal = (payload = {}) =>
        openFacturaFromExternalRequest(payload);

      window.renderFacturaModal = (payload = {}) =>
        openFacturaFromExternalRequest(payload);

      window.openFacturaFicha = (payload = {}) =>
        openFacturaFromExternalRequest(payload);
    } catch {}

    return true;
  }

  /* =====================================================
     BINDINGS
  ===================================================== */

  function focusFacturasSearchInput(caret = null) {
    requestFrame(() => {
      try {
        const input = document.getElementById("facturas-search-input");
        if (!input) return;

        input.focus({ preventScroll: true });

        if (caret !== null && typeof input.setSelectionRange === "function") {
          const nextCaret = Math.min(
            Math.max(Number(caret) || 0, 0),
            input.value.length
          );

          input.setSelectionRange(nextCaret, nextCaret);
        }
      } catch {}
    });
  }

  function resolveSortFromControl(target = null) {
    if (!target) return getNextDateSort(getViewSort());

    const explicit = first(
      target.dataset?.nextSort,
      target.dataset?.sort,
      target.dataset?.sortMode,
      target.dataset?.facturasSort,
      target.getAttribute?.("data-next-sort"),
      target.getAttribute?.("data-sort"),
      target.getAttribute?.("data-sort-mode"),
      target.getAttribute?.("data-facturas-sort")
    );

    if (explicit) {
      return normalizeFacturaSort(explicit);
    }

    return getNextDateSort(getViewSort());
  }

  function bindFacturasFilterControls() {
    cleanupFilterControls();

    const container = getContainer();

    if (!container || destroyed) return;

    const onClick = (event) => {
      const target = event.target.closest?.(
        "[data-facturas-action], [data-action]"
      );

      if (!target || !container.contains(target)) return;

      const action = normalizeKey(
        first(
          target.dataset.facturasAction,
          target.dataset.action,
          target.getAttribute("data-facturas-action"),
          target.getAttribute("data-action")
        )
      );

      if (["filter", "filter_facturas"].includes(action)) {
        event.preventDefault();
        event.stopPropagation();

        const nextFilter = first(
          target.dataset.filter,
          target.dataset.filterStatus,
          target.dataset.paymentFilter,
          target.getAttribute("data-filter"),
          target.getAttribute("data-filter-status"),
          target.getAttribute("data-payment-filter"),
          DEFAULT_FILTER
        );

        const previous = getViewFilter();
        const next = setViewFilter(nextFilter);

        if (previous !== next || getCurrentPage() !== 1) {
          rerender();
        } else {
          rerender();
        }

        return;
      }

      if (["sort", "sort_facturas"].includes(action)) {
        event.preventDefault();
        event.stopPropagation();

        const previous = getViewSort();
        const nextSort = resolveSortFromControl(target);
        const next = setViewSort(nextSort);

        if (previous !== next || getCurrentPage() !== 1) {
          rerender();
        } else {
          rerender();
        }

        return;
      }

      if (
        [
          "clear_search",
          "clear_facturas_search",
          "search_clear",
        ].includes(action)
      ) {
        event.preventDefault();
        event.stopPropagation();

        setViewSearch("");
        rerender();
        focusFacturasSearchInput(0);

        return;
      }

      if (
        [
          "clear_filters",
          "clear_facturas_filters",
          "reset_filters",
          "reset_facturas_filters",
        ].includes(action)
      ) {
        event.preventDefault();
        event.stopPropagation();

        clearViewFilters();
        rerender();

        return;
      }
    };

    const onInput = (event) => {
      const input = event.target.closest?.(
        "[data-facturas-search-input='true'], #facturas-search-input"
      );

      if (!input || !container.contains(input)) return;

      const value = input.value || "";
      const caret = typeof input.selectionStart === "number"
        ? input.selectionStart
        : value.length;

      try {
        window.clearTimeout(searchTimer);
      } catch {}

      searchTimer = window.setTimeout(() => {
        const previous = getViewSearch();
        const next = normalizeWhitespace(value);

        if (previous === next) return;

        setViewSearch(next);
        rerender();

        if (next) {
          focusFacturasSearchInput(caret);
        }
      }, SEARCH_DEBOUNCE_MS);
    };

    const onChange = (event) => {
      const sortSelect = event.target.closest?.(
        "[data-sort-control='true'], #facturas-sort-select"
      );

      if (sortSelect && container.contains(sortSelect)) {
        setViewSort(sortSelect.value || DEFAULT_SORT);
        rerender();
        return;
      }

      const searchInput = event.target.closest?.(
        "[data-facturas-search-input='true'], #facturas-search-input"
      );

      if (searchInput && container.contains(searchInput)) {
        const next = normalizeWhitespace(searchInput.value || "");
        setViewSearch(next);
        rerender();

        if (next) {
          focusFacturasSearchInput(searchInput.value.length);
        }
      }
    };

    const onSearch = (event) => {
      const input = event.target.closest?.(
        "[data-facturas-search-input='true'], #facturas-search-input"
      );

      if (!input || !container.contains(input)) return;

      const next = normalizeWhitespace(input.value || "");

      setViewSearch(next);
      rerender();

      if (next) {
        focusFacturasSearchInput(input.value.length);
      }
    };

    container.addEventListener("click", onClick);
    container.addEventListener("input", onInput);
    container.addEventListener("change", onChange);
    container.addEventListener("search", onSearch);

    filterControlsCleanup = () => {
      try {
        container.removeEventListener("click", onClick);
        container.removeEventListener("input", onInput);
        container.removeEventListener("change", onChange);
        container.removeEventListener("search", onSearch);
      } catch {}

      try {
        window.clearTimeout(searchTimer);
      } catch {}

      searchTimer = 0;
    };
  }

  function bind() {
    cleanupBindings();

    if (destroyed) return;

    registerFacturasBridge();

    const cleanup = bindFacturasView({
      scopeName: SCOPE,

      getContainer,
      getState: getBindingState,

      render: rerender,

      loadFacturas,
      openFactura,
      openFacturaPdf,
      downloadFacturaPdf,
      sendFacturaToClient,
      closeDetail,
      exportFacturasCsv,

      createFactura,

      openIncidencia: openIncidenciaBridge,
      openRelatedIncidencia: openIncidenciaBridge,

      goToPage,
      goPrevPage,
      goNextPage,

      setPage(page = 1) {
        setViewPage(page);
        rerender();
      },

      setFilter(filter = DEFAULT_FILTER) {
        setViewFilter(filter);
        rerender();
      },

      setSearch(query = "") {
        setViewSearch(query);
        rerender();
      },

      setSort(sort = DEFAULT_SORT) {
        setViewSort(sort);
        rerender();
      },

      clearFilters() {
        clearViewFilters();
        rerender();
      },

      onBootstrap() {
        setFacturasBootstrapped(state, true);
        loadFacturas();
      },
    });

    bindingsCleanup = typeof cleanup === "function" ? cleanup : null;

    bindFacturasFilterControls();
    attachCreateSuccessListener();
    attachSearchOpenListener();

    try {
      bindFacturasTemplateDom(getContainer());
    } catch {}
  }

  /* =====================================================
     LIFECYCLE
  ===================================================== */

  async function init() {
    if (inflightInit) return inflightInit;

    if (initialized && !destroyed) {
      registerFacturasBridge();
      render();
      bind();

      if (!isFacturasBootstrapped(state) && !inflightLoad) {
        await loadFacturas({
          force: false,
          silent: true,
          asRefresh: false,
        });
      }

      await openFacturaFromLocationOnce();

      return api;
    }

    destroyed = false;
    initialized = true;

    registerFacturasBridge();

    inflightInit = (async () => {
      safeLog("init");

      ensureBaseState();

      const token = nextRenderToken();

      render();
      bind();

      await loadFacturas();

      if (isActiveToken(token)) {
        bind();
        await openFacturaFromLocationOnce();
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
    cancelScheduledRender();

    cleanupBindings();
    cleanupModalBindings();
    cleanupCreateSuccessListener();
    cleanupSearchOpenListener();
    cleanupFilterControls();

    closeFacturasDetail(state);
    clearFacturasActionIds(state);

    try {
      document.body.classList.remove("facturas-detail-open");
    } catch {}

    try {
      FacturasCreateModal?.close?.();
    } catch {}

    destroyDetailRoot();

    inflightLoad = null;
    inflightInit = null;
    inflightExternalOpen = null;
    inflightExternalOpenFacturaId = "";
    lastAutoOpenedFacturaId = "";

    safeLog("destroy");
  }

  /* =====================================================
     API
  ===================================================== */

  const api = {
    init,
    mount: init,
    unmount: destroy,
    destroy,

    render: rerender,
    scheduleRender: scheduleRerender,

    loadFacturas,

    openFactura,
    openFacturaFromExternalRequest,
    openFacturaFromLocationOnce,
    registerFacturasBridge,

    openFacturaPdf,
    downloadFacturaPdf,
    sendFacturaToClient,
    closeDetail,
    exportFacturasCsv,

    createFactura,

    openIncidencia: openIncidenciaBridge,
    openRelatedIncidencia: openIncidenciaBridge,

    goToPage,
    goPrevPage,
    goNextPage,

    setFilter(filter = DEFAULT_FILTER) {
      const next = setViewFilter(filter);
      rerender();
      return next;
    },

    setSearch(query = "") {
      const next = setViewSearch(query);
      rerender();
      return next;
    },

    setSort(sort = DEFAULT_SORT) {
      const next = setViewSort(sort);
      rerender();
      return next;
    },

    toggleSort() {
      const next = setViewSort(getNextDateSort(getViewSort()));
      rerender();
      return next;
    },

    clearFilters() {
      clearViewFilters();
      rerender();
      return true;
    },

    getFilter() {
      return getViewFilter();
    },

    getSearch() {
      return getViewSearch();
    },

    getSort() {
      return getViewSort();
    },

    getItems,

    getFilteredItems() {
      return getFilteredFacturasItems(getItems());
    },

    getPagination() {
      const items = getItems();
      const pagination = clampPageAgainstItems(items);

      return {
        ...pagination,
        items,
        filteredItems: getFilteredFacturasItems(items),
      };
    },

    findFacturaById,

    getFacturaDisplayId,
    getFacturaIdentityList,
    getRelatedIncidenciaId,

    getState() {
      return {
        ...getBindingState(),

        initialized,
        destroyed,

        hasInflightInit: Boolean(inflightInit),
        hasInflightLoad: Boolean(inflightLoad),
        hasInflightExternalOpen: Boolean(inflightExternalOpen),
        inflightExternalOpenFacturaId,
        lastAutoOpenedFacturaId,
      };
    },

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },
  };

  registerFacturasBridge();

  return api;
})();

export default FacturasView;
