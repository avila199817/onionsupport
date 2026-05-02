/* =========================================================
   Onion SPA - Facturas View
   Archivo: src/views/facturas/facturasView.js

   EXTREME PRO SYSTEM · VIEW REAL · FULL PATCH 12/10
   PORTAL MODAL · SEARCH BRIDGE · URL AUTOPEN · TOPBAR READY
   DETAIL STORE MERGE · INCIDENCIA MODAL BRIDGE · CREATE MODAL
   PAGINATION 5 · ACTION STATE SYNC · RERENDER SAFE · CLEANUP PRO
   FISCAL PRESERVER · IVA/IRPF/TOTALES/IMPUESTOS HARDENED
   FILTER PILLS + SEARCH · FACTURAS CONTROL CENTER 10/10

   RESPONSABILIDADES:
   - render principal de facturas
   - render desacoplado de header/cards/template
   - modal detail en portal global body
   - modal create global vía facturas.create.modal.js
   - rerender estable y coalescido
   - bindings de vista + bindings de portal modal
   - cero conflicto con shell SPA
   - cleanup enterprise
   - preservar relación factura ↔ incidencia en listado y detalle
   - abrir incidencia relacionada en modal real
   - cerrar modal detalle por X, Escape y overlay
   - paginación visual real a 5 facturas por página
   - abrir factura desde topbar search por bridge directo
   - abrir factura desde URL /facturas?factura=... / ?id=...
   - registrar bridge público window/AppCore.modules para search
   - sincronizar loaders de acciones sin romper tabla
   - refrescar listado tras enviar / crear factura
   - preservar fiscalidad en detalle: impuestos, IVA, IRPF, totales y líneas
   - manejar filtros visuales del template:
     todas / pendientes / pagadas / vencidas / enviadas / con PDF / con incidencia
   - manejar búsqueda por factura, cliente, email, importe, forma de pago e incidencia
   - resetear página a 1 al filtrar/buscar
   - exportar CSV filtrado cuando haya filtro activo

   FIX CLAVE:
   - El listado recibe facturas enriquecidas desde store.
   - El detalle remoto puede venir sin ticketId/incidenciaId.
   - Antes de renderizar detalle se fusiona el payload remoto con la
     factura enriquecida del store por id/número/facturaId/invoiceId.
   - El search puede pasar detail completo, payload de evento, string o ID.
   - openFactura() sigue aceptando ID; el bridge externo normaliza payload.
   - Si el detalle remoto viene pobre, no pisa IVA/IRPF/impuestos/totales
     existentes en store/raw.
   - El template puede pintar filtros; esta vista les da estado y bindings reales.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  renderHeader,
  renderCards,
  renderLoadingState,
  renderErrorState,
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
  escapeHtml,
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
  const INCIDENCIA_DETAIL_TIMEOUT = 90000;
  const DEFAULT_FACTURAS_FILTER = "all";
  const FACTURAS_SEARCH_DEBOUNCE_MS = 120;
  const DEFAULT_FACTURAS_SORT = "date_desc";

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

  let facturasSearchTimer = 0;

  let renderToken = 0;
  let pendingRenderFrame = 0;

  let lastAutoOpenedFacturaId = "";

  /* =====================================================
     LOCAL HELPERS
  ===================================================== */

  function safeNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === "") return fallback;

    if (typeof value === "string") {
      let normalized = value
        .trim()
        .replace(/€/g, "")
        .replace(/%/g, "")
        .replace(/\s/g, "");

      const hasComma = normalized.includes(",");
      const hasDot = normalized.includes(".");

      if (hasComma && hasDot) {
        normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
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

  function normalizeWhitespace(value = "") {
    return safeText(value, "").replace(/\s+/g, " ").trim();
  }

  /* =====================================================
     FILTER / SEARCH STATE · FACTURAS 10/10
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
    if (["invoice_desc", "factura_desc", "numero_desc", "n_factura_desc"].includes(key)) {
      return "invoice_desc";
    }
    return "date_desc";
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
        source.numeroFacturaLegal,
        source.numeroFacturaSistema,
        source.value,
        source.key,
        source.code
      ),
      ""
    );
  }

  function pickTicketIdFromArray(value = []) {
    const items = safeArray(value);

    for (const item of items) {
      if (typeof item === "string" && item.trim()) {
        return item.trim();
      }

      if (!item || typeof item !== "object") {
        continue;
      }

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

      if (candidate) {
        return safeText(candidate, "");
      }
    }

    return null;
  }

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

  /* =====================================================
     CORE HELPERS
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

    let busAttached = false;
    let windowAttached = false;
    let busCleanup = null;

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
     CLEANUP HELPERS
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
      window.clearTimeout(facturasSearchTimer);
    } catch {}

    facturasSearchTimer = 0;
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

  function cleanupModalBindings() {
    try {
      modalBindingsCleanup?.();
    } catch {}

    modalBindingsCleanup = null;
  }

  function cancelPendingRender() {
    if (!pendingRenderFrame) return;

    cancelFrame(pendingRenderFrame);
    pendingRenderFrame = 0;
  }

  /* =====================================================
     STATE BASE
  ===================================================== */

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

    state.view.pageSize = pageSize;
    state.view.facturasPageSize = pageSize;

    state.view.page = page;
    state.view.currentPage = page;
    state.view.facturasPage = page;

    if (typeof state.view.error !== "string") {
      state.view.error = safeText(state.view.error, "");
    }

    state.view.facturasFilter = normalizeFacturaFilter(
      first(
        state.view.facturasFilter,
        state.view.paymentFilter,
        state.view.statusFilter,
        state.view.activeFilter,
        state.view.filter,
        DEFAULT_FACTURAS_FILTER
      )
    );

    state.view.paymentFilter = state.view.facturasFilter;
    state.view.statusFilter = state.view.facturasFilter;
    state.view.activeFilter = state.view.facturasFilter;
    state.view.filter = state.view.facturasFilter;

    state.view.facturasSearch = normalizeWhitespace(
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

    state.view.searchQuery = state.view.facturasSearch;
    state.view.search = state.view.facturasSearch;
    state.view.query = state.view.facturasSearch;
    state.view.q = state.view.facturasSearch;
    state.view.term = state.view.facturasSearch;
    state.view.keyword = state.view.facturasSearch;

    state.view.facturasSort = normalizeFacturaSort(
      first(
        state.view.facturasSort,
        state.view.sort,
        state.view.sortBy,
        state.view.orderBy,
        state.view.sortMode,
        DEFAULT_FACTURAS_SORT
      )
    );
    state.view.sort = state.view.facturasSort;
    state.view.sortBy = state.view.facturasSort;
    state.view.orderBy = state.view.facturasSort;
    state.view.sortMode = state.view.facturasSort;
  }

  function getViewFilter() {
    ensureBaseState();

    return normalizeFacturaFilter(
      first(
        state.view.facturasFilter,
        state.view.paymentFilter,
        state.view.statusFilter,
        state.view.activeFilter,
        state.view.filter,
        DEFAULT_FACTURAS_FILTER
      )
    );
  }

  function getViewSearch() {
    ensureBaseState();

    return normalizeWhitespace(
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
  }

  function getViewSort() {
    ensureBaseState();
    return normalizeFacturaSort(
      first(
        state.view.facturasSort,
        state.view.sort,
        state.view.sortBy,
        state.view.orderBy,
        state.view.sortMode,
        DEFAULT_FACTURAS_SORT
      )
    );
  }

  function resetViewPage() {
    ensureBaseState();

    state.view.page = 1;
    state.view.currentPage = 1;
    state.view.facturasPage = 1;

    state.view.pageSize = getPageSize();
    state.view.facturasPageSize = getPageSize();

    return 1;
  }

  function setViewFilter(filter = DEFAULT_FACTURAS_FILTER) {
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
    });

    return nextSearch;
  }

  function setViewSort(sort = DEFAULT_FACTURAS_SORT) {
    ensureBaseState();
    const nextSort = normalizeFacturaSort(sort);
    state.view.facturasSort = nextSort;
    state.view.sort = nextSort;
    state.view.sortBy = nextSort;
    state.view.orderBy = nextSort;
    state.view.sortMode = nextSort;
    resetViewPage();
    safeEmit("facturas:sort:change", { sort: nextSort, filter: getViewFilter(), search: getViewSearch() });
    return nextSort;
  }

  function clearViewFilters() {
    ensureBaseState();

    state.view.facturasFilter = DEFAULT_FACTURAS_FILTER;
    state.view.paymentFilter = DEFAULT_FACTURAS_FILTER;
    state.view.statusFilter = DEFAULT_FACTURAS_FILTER;
    state.view.activeFilter = DEFAULT_FACTURAS_FILTER;
    state.view.filter = DEFAULT_FACTURAS_FILTER;

    state.view.facturasSearch = "";
    state.view.searchQuery = "";
    state.view.search = "";
    state.view.query = "";
    state.view.q = "";
    state.view.term = "";
    state.view.keyword = "";
    state.view.facturasSort = DEFAULT_FACTURAS_SORT;
    state.view.sort = DEFAULT_FACTURAS_SORT;
    state.view.sortBy = DEFAULT_FACTURAS_SORT;
    state.view.orderBy = DEFAULT_FACTURAS_SORT;
    state.view.sortMode = DEFAULT_FACTURAS_SORT;

    resetViewPage();

    safeEmit("facturas:filters:clear", {});

    return true;
  }

  function getPaymentStatusKeyForView(item = {}) {
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

    if (
      [
        "pending",
        "pendiente",
        "unpaid",
        "sin_pagar",
      ].includes(key)
    ) {
      return "pending";
    }

    if (
      [
        "partial",
        "parcial",
        "pago_parcial",
      ].includes(key)
    ) {
      return "partial";
    }

    if (
      [
        "overdue",
        "vencida",
        "vencido",
      ].includes(key)
    ) {
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

  function hasPdfForView(item = {}) {
    const raw = safeObject(item?.raw);

    if (
      Boolean(
        first(
          item.pdfAvailable,
          item.hasPdf,
          item.meta?.hasPdf,
          raw.pdfAvailable,
          raw.hasPdf,
          raw.meta?.hasPdf
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

        raw.blobPath,
        raw.blobName,
        raw.pdfPath,
        raw.pdfUrl,
        raw.downloadUrl,
        raw.viewUrl,
        raw.pdf
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
      const value = safeObject(file);

      const type = normalizeText(
        first(value.contentType, value.mimeType, value.mimetype, value.type)
      );

      const name = normalizeText(
        first(value.name, value.filename, value.fileName, value.url)
      );

      return type.includes("pdf") || name.endsWith(".pdf");
    });
  }

  function isFacturaSentForView(item = {}) {
    const raw = safeObject(item?.raw);

    return Boolean(
      first(
        item.fechaEnvio,
        item.sentAt,
        item.mailSentAt,
        item.delivery?.lastSentAt,
        item.meta?.lastSentAt,
        item.meta?.isSent,

        raw.fechaEnvio,
        raw.sentAt,
        raw.mailSentAt,
        raw.delivery?.lastSentAt,
        raw.meta?.lastSentAt,
        raw.meta?.isSent
      )
    );
  }

  function getClientNameForView(item = {}) {
    const raw = safeObject(item?.raw);

    return safeText(
      first(
        item.clienteNombre,
        item.clientName,
        item.cliente?.nombreContacto,
        item.cliente?.nombre,
        item.cliente?.name,
        item.cliente?.displayName,
        item.client?.name,
        item.customer?.name,
        item.name,
        item.nombre,
        item.company,

        raw.clienteNombre,
        raw.clientName,
        raw.cliente?.nombreContacto,
        raw.cliente?.nombre,
        raw.cliente?.name,
        raw.cliente?.displayName,
        raw.client?.name,
        raw.customer?.name,
        raw.name,
        raw.nombre,
        raw.company
      ),
      ""
    );
  }

  function getClientEmailForView(item = {}) {
    const raw = safeObject(item?.raw);

    return safeText(
      first(
        item.clienteEmail,
        item.emailCliente,
        item.clientEmail,
        item.email,
        item.cliente?.email,
        item.cliente?.emailLower,
        item.client?.email,
        item.customer?.email,

        raw.clienteEmail,
        raw.emailCliente,
        raw.clientEmail,
        raw.email,
        raw.cliente?.email,
        raw.cliente?.emailLower,
        raw.client?.email,
        raw.customer?.email
      ),
      ""
    );
  }

  function getFacturaAmountForView(item = {}) {
    const raw = safeObject(item?.raw);

    return first(
      item.total,
      item.amount,
      item.importe,
      item.importeTotal,
      item.totalFactura,
      item.facturaTotal,
      item.invoiceAmount,

      raw.total,
      raw.amount,
      raw.importe,
      raw.importeTotal,
      raw.totalFactura,
      raw.facturaTotal,
      raw.invoiceAmount
    );
  }

  function getFormaPagoForView(item = {}) {
    const raw = safeObject(item?.raw);

    return safeText(
      first(
        item.formaPago,
        item.metodoPago,
        item.paymentMethod,
        item.payment?.method,

        raw.formaPago,
        raw.metodoPago,
        raw.paymentMethod,
        raw.payment?.method
      ),
      ""
    );
  }

  function itemMatchesFacturaFilterForView(item = {}, filter = DEFAULT_FACTURAS_FILTER) {
    const key = normalizeFacturaFilter(filter);
    const paymentKey = getPaymentStatusKeyForView(item);

    if (key === "all") return true;

    if (key === "pending") {
      return ["pending", "partial", "draft"].includes(paymentKey);
    }

    if (key === "paid") {
      return paymentKey === "paid";
    }

    if (key === "overdue") {
      return paymentKey === "overdue";
    }

    return true;
  }

  function getFacturaSearchHaystackForView(item = {}) {
    const raw = safeObject(item?.raw);
    const identities = getFacturaIdentityList(item);
    const incidenciaId = getRelatedIncidenciaId(item);
    const amount = getFacturaAmountForView(item);

    return [
      ...identities,

      getClientNameForView(item),
      getClientEmailForView(item),
      getFormaPagoForView(item),

      amount,
      Number.isFinite(safeNumber(amount, NaN))
        ? String(safeNumber(amount, 0)).replace(".", ",")
        : "",

      incidenciaId,

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

  function itemMatchesFacturaSearchForView(item = {}, query = "") {
    const normalizedQuery = normalizeText(query);

    if (!normalizedQuery) return true;

    const terms = normalizedQuery.split(" ").filter(Boolean);
    const haystack = getFacturaSearchHaystackForView(item);

    return terms.every((term) => haystack.includes(term));
  }

  function getFilteredFacturasItems(items = []) {
    const rows = safeArray(items);
    const filter = getViewFilter();
    const search = getViewSearch();
    const sort = getViewSort();

    const filtered = rows.filter((item) => {
      return (
        itemMatchesFacturaFilterForView(item, filter) &&
        itemMatchesFacturaSearchForView(item, search)
      );
    });

    if (sort === "invoice_desc") {
      return [...filtered].sort((a, b) =>
        safeText(getFacturaDisplayId(b), "").localeCompare(
          safeText(getFacturaDisplayId(a), ""),
          "es",
          { numeric: true, sensitivity: "base" }
        )
      );
    }

    return filtered;
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
    if (isAdminUser()) {
      return true;
    }

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
    /*
       Compatibilidad con templates que calculan el botón "Crear factura"
       únicamente desde role. Si hay permiso explícito de creación,
       se fuerza un role visual equivalente sin alterar AppCore.state.
    */
    if (canCreateFactura()) return "admin";
    return getCurrentRole();
  }

  /* =====================================================
     FACTURA ID / SEARCH HELPERS
  ===================================================== */

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
        item?.numeroFacturaLegal,
        item?.numeroFacturaSistema,
        item?.invoiceNumber,
        item?.code,

        item?.raw?.id,
        item?.raw?._id,
        item?.raw?.facturaId,
        item?.raw?.invoiceId,
        item?.raw?.numero,
        item?.raw?.numeroFacturaLegal,
        item?.raw?.numeroFacturaSistema,
        item?.raw?.invoiceNumber,
        item?.raw?.code,

        item?.data?.id,
        item?.data?.facturaId,
        item?.data?.invoiceId,
        item?.data?.numero,
        item?.data?.numeroFacturaLegal,
        item?.data?.numeroFacturaSistema,

        item?.payload?.id,
        item?.payload?.facturaId,
        item?.payload?.invoiceId,
        item?.payload?.numero,
        item?.payload?.numeroFacturaLegal,
        item?.payload?.numeroFacturaSistema,

        item?.result?.id,
        item?.result?.facturaId,
        item?.result?.invoiceId,
        item?.result?.numero,
        item?.result?.numeroFacturaLegal,
        item?.result?.numeroFacturaSistema
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
      source.numeroFacturaLegal,
      source.numeroFacturaSistema,
      source.invoiceNumber,
      source.code,

      raw.id,
      raw._id,
      raw.facturaId,
      raw.invoiceId,
      raw.numero,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema,
      raw.invoiceNumber,
      raw.code,
    ]
      .map((value) => safeText(value, ""))
      .filter(Boolean);
  }

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
        detail.numeroFacturaLegal,
        detail.numeroFacturaSistema,

        factura.facturaId,
        factura.invoiceId,
        factura.id,
        factura._id,
        factura.numero,
        factura.numeroFacturaLegal,
        factura.numeroFacturaSistema,

        invoice.facturaId,
        invoice.invoiceId,
        invoice.id,
        invoice._id,
        invoice.numero,
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

      return "";
    } catch {
      return "";
    }
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

    const value = eventOrPayload;

    if (value?.detail?.payload) return safeObject(value.detail.payload);

    if (value?.detail?.detail || value?.detail?.factura || value?.detail?.item) {
      return safeObject(value.detail);
    }

    if (value?.detail && typeof value.detail === "object") {
      return safeObject(value.detail);
    }

    return safeObject(value);
  }

  /* =====================================================
     INCIDENCIA RELATION HELPERS
  ===================================================== */

  function getRelatedIncidenciaId(item = {}) {
    const source = safeObject(item);
    const raw = safeObject(source.raw);

    const incidencia = safeObject(first(source.incidencia, raw.incidencia));
    const ticket = safeObject(first(source.ticket, raw.ticket));
    const linkedTicket = safeObject(first(source.linkedTicket, raw.linkedTicket));
    const relatedTicket = safeObject(first(source.relatedTicket, raw.relatedTicket));
    const relatedIncident = safeObject(first(source.relatedIncident, raw.relatedIncident));
    const relations = safeObject(first(source.relations, raw.relations));
    const relationTicket = safeObject(relations.ticket);

    return safeText(
      first(
        source.ticketId,
        source.incidenciaId,

        incidencia.ticketId,
        incidencia.id,
        incidencia.incidenciaId,

        ticket.ticketId,
        ticket.id,
        ticket.incidenciaId,

        linkedTicket.ticketId,
        linkedTicket.id,
        linkedTicket.incidenciaId,

        relatedTicket.ticketId,
        relatedTicket.id,
        relatedTicket.incidenciaId,

        relatedIncident.ticketId,
        relatedIncident.id,
        relatedIncident.incidenciaId,

        relationTicket.ticketId,
        relationTicket.id,
        relationTicket.incidenciaId,

        source.relatedTicketId,
        source.relatedIncidentId,
        source.supportTicketId,
        source.caseId,

        source.meta?.ticketId,
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

  function buildIncidenciaPayload(item = {}) {
    const source = safeObject(item);
    const raw = safeObject(source.raw);

    const incidencia = safeObject(first(source.incidencia, raw.incidencia));
    const ticket = safeObject(first(source.ticket, raw.ticket));
    const linkedTicket = safeObject(first(source.linkedTicket, raw.linkedTicket));
    const relatedTicket = safeObject(first(source.relatedTicket, raw.relatedTicket));
    const relationTicket = safeObject(first(source.relations?.ticket, raw.relations?.ticket));

    const incidenciaId = getRelatedIncidenciaId(source);

    if (!incidenciaId) {
      return null;
    }

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
        raw.subject,
        raw.asunto,
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
          relatedTicket.clienteId,
          relationTicket.clienteId,
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
          incidencia.name,
          incidencia.nombre,
          ticket.clienteNombre,
          ticket.name,
          ticket.nombre,
          linkedTicket.clienteNombre,
          linkedTicket.name,
          linkedTicket.nombre,
          relatedTicket.clienteNombre,
          relationTicket.clienteNombre,
          source.cliente?.nombre,
          source.cliente?.name,
          source.clienteNombre,
          raw.cliente?.nombre,
          raw.cliente?.name,
          raw.clienteNombre,
          ""
        ),
        ""
      ),

      relationType: safeText(
        first(
          incidencia.relationType,
          ticket.relationType,
          linkedTicket.relationType,
          relatedTicket.relationType,
          relationTicket.relationType,
          source.relationType,
          raw.relationType,
          "linked_ticket"
        ),
        "linked_ticket"
      ),

      linkedAt: safeText(
        first(
          incidencia.linkedAt,
          ticket.linkedAt,
          linkedTicket.linkedAt,
          relatedTicket.linkedAt,
          relationTicket.linkedAt,
          source.linkedAt,
          raw.linkedAt,
          ""
        ),
        ""
      ),

      linkedAtES: safeText(
        first(
          incidencia.linkedAtES,
          ticket.linkedAtES,
          linkedTicket.linkedAtES,
          relatedTicket.linkedAtES,
          relationTicket.linkedAtES,
          source.linkedAtES,
          raw.linkedAtES,
          ""
        ),
        ""
      ),
    };
  }

  function buildRelationPatch(item = {}) {
    const source = safeObject(item);
    const raw = safeObject(source.raw);

    const incidenciaId = getRelatedIncidenciaId(source);
    const incidenciaPayload = buildIncidenciaPayload(source);

    if (!incidenciaId) {
      return {};
    }

    return {
      ticketId: incidenciaId,
      incidenciaId,

      relatedTicketId: safeText(
        first(source.relatedTicketId, raw.relatedTicketId, incidenciaId),
        incidenciaId
      ),

      relatedIncidentId: safeText(
        first(source.relatedIncidentId, raw.relatedIncidentId, incidenciaId),
        incidenciaId
      ),

      supportTicketId: safeText(
        first(source.supportTicketId, raw.supportTicketId, incidenciaId),
        incidenciaId
      ),

      caseId: safeText(
        first(source.caseId, raw.caseId, incidenciaId),
        incidenciaId
      ),

      incidencia: incidenciaPayload,
      ticket: safeObject(first(source.ticket, raw.ticket, incidenciaPayload)),
      linkedTicket: safeObject(first(source.linkedTicket, raw.linkedTicket, incidenciaPayload)),
      relatedTicket: safeObject(first(source.relatedTicket, raw.relatedTicket, incidenciaPayload)),

      relations: {
        ...safeObject(source.relations),
        ticket: {
          ...safeObject(source.relations?.ticket),
          ...safeObject(incidenciaPayload),
        },
      },

      relationType: safeText(
        first(
          source.relationType,
          raw.relationType,
          incidenciaPayload?.relationType,
          "linked_ticket"
        ),
        "linked_ticket"
      ),

      meta: {
        ...safeObject(source.meta),
        hasIncidencia: true,
        incidenciaId,
        ticketId: incidenciaId,
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
        relatedTicket: safeObject(first(raw.relatedTicket, incidenciaPayload)),

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
          incidenciaId,
          ticketId: incidenciaId,
        },
      },
    };
  }

  function preserveIncidenciaFields(item = {}, fallbackRaw = {}) {
    const source = safeObject(item);

    const embeddedRaw = safeObject(source.raw);
    const externalRaw = safeObject(fallbackRaw);
    const raw = hasOwnKeys(embeddedRaw) ? embeddedRaw : externalRaw;

    const merged = {
      ...source,
      raw,
    };

    const relationPatch = buildRelationPatch(merged);

    if (!hasOwnKeys(relationPatch)) {
      return merged;
    }

    return {
      ...merged,
      ...relationPatch,

      raw: {
        ...safeObject(merged.raw),
        ...safeObject(relationPatch.raw),
      },

      meta: {
        ...safeObject(merged.meta),
        ...safeObject(relationPatch.meta),
      },
    };
  }

  /* =====================================================
     FISCAL PRESERVER · IVA / IRPF / IMPUESTOS / TOTALES
  ===================================================== */

  function readFiscalObject(source = {}, raw = {}, key = "") {
    const k = safeText(key, "");

    if (!k) return {};

    return {
      ...safeObject(raw?.[k]),
      ...safeObject(source?.[k]),
    };
  }

  function readFiscalArray(source = {}, raw = {}, keys = []) {
    for (const key of safeArray(keys)) {
      const direct = source?.[key];
      const rawDirect = raw?.[key];

      if (Array.isArray(direct) && direct.length) {
        return direct;
      }

      if (Array.isArray(rawDirect) && rawDirect.length) {
        return rawDirect;
      }
    }

    return [];
  }

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

  function buildFiscalPatch(storeItem = {}, remoteItem = {}) {
    const store = safeObject(storeItem);
    const remote = safeObject(remoteItem);

    const storeRaw = safeObject(store.raw);
    const remoteRaw = safeObject(remote.raw);

    const impuestos = safeArray(
      first(
        remote.impuestos,
        remote.taxes,
        remote.taxLines,
        remote.desgloseImpuestos,
        remoteRaw.impuestos,
        remoteRaw.taxes,
        remoteRaw.taxLines,
        remoteRaw.desgloseImpuestos,

        store.impuestos,
        store.taxes,
        store.taxLines,
        store.desgloseImpuestos,
        storeRaw.impuestos,
        storeRaw.taxes,
        storeRaw.taxLines,
        storeRaw.desgloseImpuestos
      )
    );

    const lineas = safeArray(
      first(
        remote.lineas,
        remote.items,
        remote.conceptos,
        remote.lines,
        remote.invoiceLines,
        remoteRaw.lineas,
        remoteRaw.items,
        remoteRaw.conceptos,
        remoteRaw.lines,
        remoteRaw.invoiceLines,

        store.lineas,
        store.items,
        store.conceptos,
        store.lines,
        store.invoiceLines,
        storeRaw.lineas,
        storeRaw.items,
        storeRaw.conceptos,
        storeRaw.lines,
        storeRaw.invoiceLines
      )
    );

    const iva = {
      ...readFiscalObject(store, storeRaw, "iva"),
      ...readFiscalObject(remote, remoteRaw, "iva"),
    };

    const irpf = {
      ...readFiscalObject(store, storeRaw, "irpf"),
      ...readFiscalObject(remote, remoteRaw, "irpf"),
    };

    const totales = {
      ...readFiscalObject(store, storeRaw, "totales"),
      ...readFiscalObject(remote, remoteRaw, "totales"),
    };

    const totals = {
      ...readFiscalObject(store, storeRaw, "totals"),
      ...readFiscalObject(remote, remoteRaw, "totals"),
    };

    const summary = {
      ...readFiscalObject(store, storeRaw, "summary"),
      ...readFiscalObject(remote, remoteRaw, "summary"),
    };

    const taxes = readFiscalArray(
      { ...store, ...remote },
      { ...storeRaw, ...remoteRaw },
      ["taxes", "taxLines", "desgloseImpuestos", "taxBreakdown"]
    );

    const meta = {
      ...safeObject(store.meta),
      ...safeObject(storeRaw.meta),
      ...safeObject(remote.meta),
      ...safeObject(remoteRaw.meta),
    };

    const hasIva = Boolean(
      meta.hasIva ||
        hasOwnKeys(iva) ||
        impuestos.some((tax) => {
          const tipo = normalizeText(first(tax?.tipo, tax?.taxType, tax?.name, tax?.label));
          return tipo.includes("iva") || tipo.includes("vat");
        })
    );

    const hasIrpf = Boolean(
      meta.hasIrpf ||
        hasOwnKeys(irpf) ||
        impuestos.some((tax) => {
          const tipo = normalizeText(first(tax?.tipo, tax?.taxType, tax?.name, tax?.label));
          return tipo.includes("irpf") ||
            tipo.includes("retencion") ||
            tipo.includes("retención") ||
            tipo.includes("withholding");
        })
    );

    return {
      impuestos,
      taxes,
      taxLines: taxes.length ? taxes : impuestos,
      desgloseImpuestos: taxes.length ? taxes : impuestos,

      iva,
      irpf,
      totales,
      totals,
      summary,
      lineas,

      meta: {
        ...meta,

        hasFiscalData: Boolean(
          meta.hasFiscalData ||
            hasIva ||
            hasIrpf ||
            impuestos.length ||
            taxes.length ||
            hasOwnKeys(totales) ||
            hasOwnKeys(totals)
        ),

        hasIva,
        hasIrpf,

        displayIva: safeText(
          first(
            remote.meta?.displayIva,
            remoteRaw.meta?.displayIva,
            store.meta?.displayIva,
            storeRaw.meta?.displayIva,
            meta.displayIva,
            ""
          ),
          ""
        ),

        displayIrpf: safeText(
          first(
            remote.meta?.displayIrpf,
            remoteRaw.meta?.displayIrpf,
            store.meta?.displayIrpf,
            storeRaw.meta?.displayIrpf,
            meta.displayIrpf,
            ""
          ),
          ""
        ),

        taxProfile: safeText(
          first(
            remote.meta?.taxProfile,
            remoteRaw.meta?.taxProfile,
            store.meta?.taxProfile,
            storeRaw.meta?.taxProfile,
            meta.taxProfile,
            ""
          ),
          ""
        ),
      },

      raw: {
        impuestos,
        taxes,
        taxLines: taxes.length ? taxes : impuestos,
        desgloseImpuestos: taxes.length ? taxes : impuestos,

        iva,
        irpf,
        totales,
        totals,
        summary,
        lineas,

        meta: {
          ...meta,
          hasIva,
          hasIrpf,
          hasFiscalData: Boolean(
            meta.hasFiscalData ||
              hasIva ||
              hasIrpf ||
              impuestos.length ||
              taxes.length ||
              hasOwnKeys(totales) ||
              hasOwnKeys(totals)
          ),
        },
      },
    };
  }

  function preserveFiscalFields(item = {}, fallback = {}) {
    const source = safeObject(item);
    const fallbackSource = safeObject(fallback);

    if (!hasFiscalEvidence(source) && !hasFiscalEvidence(fallbackSource)) {
      return source;
    }

    const patch = buildFiscalPatch(fallbackSource, source);

    return {
      ...source,

      impuestos: safeArray(first(source.impuestos, patch.impuestos)),
      taxes: safeArray(first(source.taxes, patch.taxes)),
      taxLines: safeArray(first(source.taxLines, patch.taxLines)),
      desgloseImpuestos: safeArray(first(source.desgloseImpuestos, patch.desgloseImpuestos)),

      iva: {
        ...safeObject(patch.iva),
        ...safeObject(source.iva),
      },

      irpf: {
        ...safeObject(patch.irpf),
        ...safeObject(source.irpf),
      },

      totales: {
        ...safeObject(patch.totales),
        ...safeObject(source.totales),
      },

      totals: {
        ...safeObject(patch.totals),
        ...safeObject(source.totals),
      },

      summary: {
        ...safeObject(patch.summary),
        ...safeObject(source.summary),
      },

      lineas: safeArray(first(source.lineas, patch.lineas)),

      raw: {
        ...safeObject(patch.raw),
        ...safeObject(source.raw),

        impuestos: safeArray(first(source.raw?.impuestos, source.impuestos, patch.raw.impuestos)),
        taxes: safeArray(first(source.raw?.taxes, source.taxes, patch.raw.taxes)),
        taxLines: safeArray(first(source.raw?.taxLines, source.taxLines, patch.raw.taxLines)),
        desgloseImpuestos: safeArray(
          first(source.raw?.desgloseImpuestos, source.desgloseImpuestos, patch.raw.desgloseImpuestos)
        ),

        iva: {
          ...safeObject(patch.raw.iva),
          ...safeObject(source.raw?.iva),
          ...safeObject(source.iva),
        },

        irpf: {
          ...safeObject(patch.raw.irpf),
          ...safeObject(source.raw?.irpf),
          ...safeObject(source.irpf),
        },

        totales: {
          ...safeObject(patch.raw.totales),
          ...safeObject(source.raw?.totales),
          ...safeObject(source.totales),
        },

        totals: {
          ...safeObject(patch.raw.totals),
          ...safeObject(source.raw?.totals),
          ...safeObject(source.totals),
        },

        summary: {
          ...safeObject(patch.raw.summary),
          ...safeObject(source.raw?.summary),
          ...safeObject(source.summary),
        },

        lineas: safeArray(first(source.raw?.lineas, source.lineas, patch.raw.lineas)),

        meta: {
          ...safeObject(patch.raw.meta),
          ...safeObject(source.raw?.meta),
          ...safeObject(source.meta),
        },
      },

      meta: {
        ...safeObject(patch.meta),
        ...safeObject(source.meta),
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

        const withFiscal = preserveFiscalFields(item, fallbackRaw);

        return preserveIncidenciaFields(withFiscal, fallbackRaw);
      });
    } catch (error) {
      safeWarn("getItems falló:", error);
      return [];
    }
  }

  function findFacturaById(facturaId = "") {
    const id = safeText(facturaId, "");

    if (!id) return null;

    const items = getItems();

    return (
      items.find((item) =>
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

    const remoteIds = getFacturaIdentityList(remote);

    for (const id of remoteIds) {
      const found = findFacturaById(id);
      if (found) return found;
    }

    const remoteIncidenciaId = getRelatedIncidenciaId(remote);

    if (remoteIncidenciaId) {
      const byIncidencia = getItems().find(
        (item) => getRelatedIncidenciaId(item) === remoteIncidenciaId
      );

      if (byIncidencia) return byIncidencia;
    }

    return null;
  }

  function mergeFacturaDetailWithStoreSnapshot(detail = {}, preferredFacturaId = "") {
    const remote = safeObject(detail);

    if (!hasOwnKeys(remote)) {
      return null;
    }

    const storeItem = findFacturaForDetail(remote, preferredFacturaId);

    if (!storeItem) {
      const fiscalOnly = preserveFiscalFields(remote, remote.raw || remote);
      return preserveIncidenciaFields(fiscalOnly, fiscalOnly.raw || fiscalOnly);
    }

    const storeEnriched = preserveIncidenciaFields(
      preserveFiscalFields(storeItem, storeItem?.raw || storeItem),
      storeItem?.raw || storeItem
    );

    const fiscalPatch = buildFiscalPatch(storeEnriched, remote);

    const preliminary = {
      ...storeEnriched,
      ...remote,

      impuestos: safeArray(first(
        remote.impuestos,
        remote.taxes,
        remote.taxLines,
        remote.desgloseImpuestos,
        remote.raw?.impuestos,
        remote.raw?.taxes,
        fiscalPatch.impuestos,
        storeEnriched.impuestos
      )),

      taxes: safeArray(first(
        remote.taxes,
        remote.taxLines,
        remote.desgloseImpuestos,
        remote.raw?.taxes,
        fiscalPatch.taxes,
        storeEnriched.taxes
      )),

      taxLines: safeArray(first(
        remote.taxLines,
        remote.taxes,
        remote.desgloseImpuestos,
        remote.raw?.taxLines,
        fiscalPatch.taxLines,
        storeEnriched.taxLines
      )),

      desgloseImpuestos: safeArray(first(
        remote.desgloseImpuestos,
        remote.taxBreakdown,
        remote.taxes,
        remote.raw?.desgloseImpuestos,
        fiscalPatch.desgloseImpuestos,
        storeEnriched.desgloseImpuestos
      )),

      iva: {
        ...safeObject(storeEnriched.iva),
        ...safeObject(storeEnriched.raw?.iva),
        ...safeObject(fiscalPatch.iva),
        ...safeObject(remote.raw?.iva),
        ...safeObject(remote.iva),
      },

      irpf: {
        ...safeObject(storeEnriched.irpf),
        ...safeObject(storeEnriched.raw?.irpf),
        ...safeObject(fiscalPatch.irpf),
        ...safeObject(remote.raw?.irpf),
        ...safeObject(remote.irpf),
      },

      totales: {
        ...safeObject(storeEnriched.totales),
        ...safeObject(storeEnriched.raw?.totales),
        ...safeObject(fiscalPatch.totales),
        ...safeObject(remote.raw?.totales),
        ...safeObject(remote.totales),
      },

      totals: {
        ...safeObject(storeEnriched.totals),
        ...safeObject(storeEnriched.raw?.totals),
        ...safeObject(fiscalPatch.totals),
        ...safeObject(remote.raw?.totals),
        ...safeObject(remote.totals),
      },

      summary: {
        ...safeObject(storeEnriched.summary),
        ...safeObject(storeEnriched.raw?.summary),
        ...safeObject(fiscalPatch.summary),
        ...safeObject(remote.raw?.summary),
        ...safeObject(remote.summary),
      },

      lineas: safeArray(first(
        remote.lineas,
        remote.items,
        remote.conceptos,
        remote.lines,
        remote.invoiceLines,
        remote.raw?.lineas,
        remote.raw?.items,
        remote.raw?.conceptos,
        fiscalPatch.lineas,
        storeEnriched.lineas
      )),

      raw: {
        ...safeObject(storeEnriched.raw),
        ...safeObject(remote.raw),

        impuestos: safeArray(first(
          remote.raw?.impuestos,
          remote.raw?.taxes,
          remote.impuestos,
          remote.taxes,
          remote.taxLines,
          fiscalPatch.raw.impuestos,
          storeEnriched.raw?.impuestos,
          storeEnriched.impuestos
        )),

        taxes: safeArray(first(
          remote.raw?.taxes,
          remote.taxes,
          remote.taxLines,
          fiscalPatch.raw.taxes,
          storeEnriched.raw?.taxes,
          storeEnriched.taxes
        )),

        taxLines: safeArray(first(
          remote.raw?.taxLines,
          remote.taxLines,
          remote.taxes,
          fiscalPatch.raw.taxLines,
          storeEnriched.raw?.taxLines,
          storeEnriched.taxLines
        )),

        desgloseImpuestos: safeArray(first(
          remote.raw?.desgloseImpuestos,
          remote.desgloseImpuestos,
          remote.taxBreakdown,
          fiscalPatch.raw.desgloseImpuestos,
          storeEnriched.raw?.desgloseImpuestos,
          storeEnriched.desgloseImpuestos
        )),

        iva: {
          ...safeObject(storeEnriched.raw?.iva),
          ...safeObject(storeEnriched.iva),
          ...safeObject(fiscalPatch.raw.iva),
          ...safeObject(remote.raw?.iva),
          ...safeObject(remote.iva),
        },

        irpf: {
          ...safeObject(storeEnriched.raw?.irpf),
          ...safeObject(storeEnriched.irpf),
          ...safeObject(fiscalPatch.raw.irpf),
          ...safeObject(remote.raw?.irpf),
          ...safeObject(remote.irpf),
        },

        totales: {
          ...safeObject(storeEnriched.raw?.totales),
          ...safeObject(storeEnriched.totales),
          ...safeObject(fiscalPatch.raw.totales),
          ...safeObject(remote.raw?.totales),
          ...safeObject(remote.totales),
        },

        totals: {
          ...safeObject(storeEnriched.raw?.totals),
          ...safeObject(storeEnriched.totals),
          ...safeObject(fiscalPatch.raw.totals),
          ...safeObject(remote.raw?.totals),
          ...safeObject(remote.totals),
        },

        summary: {
          ...safeObject(storeEnriched.raw?.summary),
          ...safeObject(storeEnriched.summary),
          ...safeObject(fiscalPatch.raw.summary),
          ...safeObject(remote.raw?.summary),
          ...safeObject(remote.summary),
        },

        lineas: safeArray(first(
          remote.raw?.lineas,
          remote.raw?.items,
          remote.lineas,
          remote.items,
          fiscalPatch.raw.lineas,
          storeEnriched.raw?.lineas,
          storeEnriched.lineas
        )),
      },

      meta: {
        ...safeObject(storeEnriched.meta),
        ...safeObject(storeEnriched.raw?.meta),
        ...safeObject(fiscalPatch.meta),
        ...safeObject(remote.raw?.meta),
        ...safeObject(remote.meta),

        hasIva: Boolean(
          remote.meta?.hasIva ||
            remote.raw?.meta?.hasIva ||
            fiscalPatch.meta?.hasIva ||
            storeEnriched.meta?.hasIva ||
            storeEnriched.raw?.meta?.hasIva ||
            hasOwnKeys(remote.iva) ||
            hasOwnKeys(remote.raw?.iva) ||
            hasOwnKeys(storeEnriched.iva)
        ),

        hasIrpf: Boolean(
          remote.meta?.hasIrpf ||
            remote.raw?.meta?.hasIrpf ||
            fiscalPatch.meta?.hasIrpf ||
            storeEnriched.meta?.hasIrpf ||
            storeEnriched.raw?.meta?.hasIrpf ||
            hasOwnKeys(remote.irpf) ||
            hasOwnKeys(remote.raw?.irpf) ||
            hasOwnKeys(storeEnriched.irpf)
        ),

        displayIva: safeText(
          first(
            remote.meta?.displayIva,
            remote.raw?.meta?.displayIva,
            fiscalPatch.meta?.displayIva,
            storeEnriched.meta?.displayIva,
            storeEnriched.raw?.meta?.displayIva,
            ""
          ),
          ""
        ),

        displayIrpf: safeText(
          first(
            remote.meta?.displayIrpf,
            remote.raw?.meta?.displayIrpf,
            fiscalPatch.meta?.displayIrpf,
            storeEnriched.meta?.displayIrpf,
            storeEnriched.raw?.meta?.displayIrpf,
            ""
          ),
          ""
        ),
      },
    };

    preliminary.raw = {
      ...safeObject(preliminary.raw),
      meta: {
        ...safeObject(preliminary.raw?.meta),
        ...safeObject(preliminary.meta),
      },
    };

    const withFiscal = preserveFiscalFields(preliminary, storeEnriched);
    const withRemoteRelation = preserveIncidenciaFields(
      withFiscal,
      withFiscal.raw || withFiscal
    );

    if (getRelatedIncidenciaId(withRemoteRelation)) {
      return withRemoteRelation;
    }

    const forcedRelationPatch = buildRelationPatch(storeEnriched);

    if (!hasOwnKeys(forcedRelationPatch)) {
      return withRemoteRelation;
    }

    return preserveIncidenciaFields(
      preserveFiscalFields(
        {
          ...preliminary,
          ...forcedRelationPatch,

          raw: {
            ...safeObject(preliminary.raw),
            ...safeObject(forcedRelationPatch.raw),
          },

          meta: {
            ...safeObject(preliminary.meta),
            ...safeObject(forcedRelationPatch.meta),
          },
        },
        storeEnriched
      ),
      {
        ...safeObject(preliminary.raw),
        ...safeObject(forcedRelationPatch.raw),
      }
    );
  }

  /* =====================================================
     API HELPERS FOR INCIDENCIA DETAIL
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

    const candidates = [
      `/api/tickets/${encodedId}`,
      `/api/incidencias/${encodedId}`,
    ];

    let lastError = null;

    for (const endpoint of candidates) {
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

    return (
      getItems().find((item) => getRelatedIncidenciaId(item) === id) ||
      null
    );
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

      status: safeText(
        first(
          incidenciaPayload?.status,
          incidenciaPayload?.estado,
          "open"
        ),
        "open"
      ),

      estado: safeText(
        first(
          incidenciaPayload?.estado,
          incidenciaPayload?.status,
          "open"
        ),
        "open"
      ),

      priority: safeText(
        first(
          incidenciaPayload?.priority,
          incidenciaPayload?.prioridad,
          "medium"
        ),
        "medium"
      ),

      prioridad: safeText(
        first(
          incidenciaPayload?.prioridad,
          incidenciaPayload?.priority,
          "medium"
        ),
        "medium"
      ),

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
          factura?.cliente?.nombre,
          factura?.cliente?.nombreContacto,
          factura?.clienteNombre,
          factura?.raw?.cliente?.nombre,
          factura?.raw?.cliente?.nombreContacto,
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
     PAGINATION
  ===================================================== */

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

  function getTotalPages(items = []) {
    const rows = getFilteredFacturasItems(items);
    const pageSize = getPageSize();

    return Math.max(1, Math.ceil((rows.length || 1) / pageSize));
  }

  function setViewPage(page = 1) {
    ensureBaseState();

    const items = getItems();
    const totalPages = getTotalPages(items);
    const nextPage = clampNumber(page, 1, totalPages);

    state.view.page = nextPage;
    state.view.currentPage = nextPage;
    state.view.facturasPage = nextPage;

    state.view.pageSize = getPageSize();
    state.view.facturasPageSize = getPageSize();

    return nextPage;
  }

  function clampPageAgainstItems(items = []) {
    ensureBaseState();

    const rows = safeArray(items);
    const filteredRows = getFilteredFacturasItems(rows);

    const totalPages = getTotalPages(rows);
    const currentPage = getCurrentPage();
    const nextPage = clampNumber(currentPage, 1, totalPages);

    state.view.page = nextPage;
    state.view.currentPage = nextPage;
    state.view.facturasPage = nextPage;

    state.view.pageSize = getPageSize();
    state.view.facturasPageSize = getPageSize();

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

      remoteCount: safeNumber(
        first(state.view.remoteCount, state.view.totalCount),
        rows.length
      ),

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
      },

      actions: {
        ...safeObject(state.actions),
      },

      detail: {
        ...safeObject(state.detail),
      },
    };
  }

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
     CREATE FACTURA BRIDGE
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
     PORTAL MODAL
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

  /* =====================================================
     TEMPLATE
  ===================================================== */

  function renderBody({
    items = [],
    templateState = {},
  } = {}) {
    if (templateState.loading && !items.length) {
      return renderLoadingState({ includeStyles: false });
    }

    if (templateState.error && !items.length) {
      return renderErrorState(templateState.error, { includeStyles: false });
    }

    return renderCards({
      items,
      state: templateState,
      includeStyles: false,
    });
  }

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
        data-facturas-scope="${escapeHtml(SCOPE)}"
      >
        <div
          class="content-wrapper"
          style="
            display:grid;
            gap:var(--space-lg);
          "
        >
          ${renderHeader({
            items,
            state: templateState,
            includeStyles: true,
          })}

          ${renderBody({
            items,
            templateState,
          })}
        </div>
      </section>
    `;
  }

  /* =====================================================
     RENDER
  ===================================================== */

  function render() {
    const container = getContainer();

    if (!container || destroyed) return null;

    ensureBaseState();

    container.innerHTML = buildHtml();

    renderDetailPortal();

    setFacturasHydrated(state, true);

    return container;
  }

  function rerender() {
    if (destroyed) return null;

    cancelPendingRender();

    const result = render();

    if (!destroyed) {
      bind();
    }

    return result;
  }

  function scheduleRerender() {
    if (destroyed) return null;

    if (pendingRenderFrame) {
      return pendingRenderFrame;
    }

    pendingRenderFrame = requestFrame(() => {
      pendingRenderFrame = 0;
      rerender();
    });

    return pendingRenderFrame;
  }

  function renderDetailOnly() {
    if (!isFacturasHydrated(state)) {
      return null;
    }

    renderDetailPortal();

    return true;
  }

  /* =====================================================
     DATA LOADERS
  ===================================================== */

  async function loadFacturas({
    force = false,
    silent = false,
    asRefresh = false,
  } = {}) {
    if (destroyed) return getItems();

    if (inflightLoad) {
      return inflightLoad;
    }

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
    const hasActiveCriteria = getViewFilter() !== "all" || Boolean(getViewSearch());
    const exportingItems = hasActiveCriteria ? filteredItems : items;

    return exportFacturasCsvAction({
      items: exportingItems,
      filenamePrefix: hasActiveCriteria
        ? "facturas-filtradas"
        : "facturas",
    });
  }

  /* =====================================================
     SEARCH / GLOBAL OPEN BRIDGE
  ===================================================== */

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

      setFilter(filter = DEFAULT_FACTURAS_FILTER) {
        const next = setViewFilter(filter);
        rerender();
        return next;
      },

      setSearch(query = "") {
        const next = setViewSearch(query);
        rerender();
        return next;
      },
      setSort(sort = DEFAULT_FACTURAS_SORT) {
        const next = setViewSort(sort);
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

        if (
          caret !== null &&
          typeof input.setSelectionRange === "function"
        ) {
          const nextCaret = Math.min(
            Math.max(Number(caret) || 0, 0),
            input.value.length
          );

          input.setSelectionRange(nextCaret, nextCaret);
        }
      } catch {}
    });
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

        const nextFilter = first(
          target.dataset.filter,
          target.dataset.filterStatus,
          target.dataset.paymentFilter,
          target.getAttribute("data-filter"),
          target.getAttribute("data-filter-status"),
          target.getAttribute("data-payment-filter"),
          DEFAULT_FACTURAS_FILTER
        );

        setViewFilter(nextFilter);
        rerender();

        return;
      }
      if (["sort", "sort_facturas"].includes(action)) {
        event.preventDefault();
        const nextSort = first(
          target.dataset.sort,
          target.getAttribute("data-sort"),
          DEFAULT_FACTURAS_SORT
        );
        setViewSort(nextSort);
        rerender();
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
        window.clearTimeout(facturasSearchTimer);
      } catch {}

      facturasSearchTimer = window.setTimeout(() => {
        const previous = getViewSearch();
        const next = normalizeWhitespace(value);

        if (previous === next) {
          return;
        }

        setViewSearch(next);
        rerender();

        if (next) {
          focusFacturasSearchInput(caret);
        }
      }, FACTURAS_SEARCH_DEBOUNCE_MS);
    };

    const onChange = (event) => {
      const select = event.target.closest?.("[data-sort-control='true'], #facturas-sort-select");
      if (!select || !container.contains(select)) return;
      setViewSort(select.value || DEFAULT_FACTURAS_SORT);
      rerender();
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
    container.addEventListener("change", onSearch);

    filterControlsCleanup = () => {
      try {
        container.removeEventListener("click", onClick);
        container.removeEventListener("input", onInput);
        container.removeEventListener("change", onChange);
        container.removeEventListener("search", onSearch);
        container.removeEventListener("change", onSearch);
      } catch {}

      try {
        window.clearTimeout(facturasSearchTimer);
      } catch {}

      facturasSearchTimer = 0;
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

      setFilter(filter = DEFAULT_FACTURAS_FILTER) {
        setViewFilter(filter);
        rerender();
      },

      setSearch(query = "") {
        setViewSearch(query);
        rerender();
      },
      setSort(sort = DEFAULT_FACTURAS_SORT) {
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
  }

  /* =====================================================
     LIFECYCLE
  ===================================================== */

  async function init() {
    if (inflightInit) {
      return inflightInit;
    }

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
    cancelPendingRender();

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

    setFilter(filter = DEFAULT_FACTURAS_FILTER) {
      const next = setViewFilter(filter);
      rerender();
      return next;
    },

    setSearch(query = "") {
      const next = setViewSearch(query);
      rerender();
      return next;
    },
    setSort(sort = DEFAULT_FACTURAS_SORT) {
      const next = setViewSort(sort);
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
