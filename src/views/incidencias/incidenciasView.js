/* =========================================================
   Onion SPA - Incidencias View
   Archivo: src/views/incidencias/incidenciasView.js

   EXTREME PRO SYSTEM · VIEW REAL · FULL PATCH 13/10
   FILTERS CONNECTED · SEARCH BRIDGE · URL AUTOPEN · TOPBAR READY
   DETAIL STORE MERGE · CREATE MODAL BRIDGE
   PAGINATION 5 · ACTION STATE SYNC · RERENDER SAFE · CLEANUP PRO
   FACTURAS LINKED PRESERVER · MODAL DIRECT IMPORT HARDENED
   PATCH · FILTERS SIMPLIFIED: TODAS / ABIERTAS / CERRADAS
   PATCH · SEARCH INPUT CONNECTED WITH TEMPLATE V13
   PATCH · OPEN FILTER GROUPS OPEN/PENDING/PROGRESS
   PATCH · CLOSED FILTER GROUPS RESOLVED/CLOSED/CANCELLED/ARCHIVED
   PATCH · NO INLINE CSS · VIEW CSS EXTERNALIZED
   PATCH · CLEAN BIND / CLEANUP FLOW · NO DUPLICATED RENDER BINDINGS

   RESPONSABILIDADES:
   - punto de entrada real de la vista de incidencias
   - render principal con template final unificado
   - paginación visual fija a 5 incidencias por vista
   - filtros visuales conectados al estado real del View
   - búsqueda local conectada al template por input/debounce
   - carga inicial robusta con fallback a cache
   - refresh con loader SOLO en historial / tabla
   - apertura de incidencia con estado visual de loading
   - apertura de modal de creación de incidencia
   - bind de eventos de pantalla
   - evitar doble bind de listeners
   - soportar destroy limpio del router
   - permitir reload con rerender seguro
   - coordinar acciones y modales sin mezclar responsabilidades
   - preservar importes de facturas asociadas para tabla
   - preservar numeroFacturaLegal para tabla/modal
   - cargar el modal de detalle por import directo
   - abrir incidencia desde topbar search por bridge directo
   - abrir incidencia desde URL /incidencias?ticketId=... / ?id=...
   - registrar bridge público window/AppCore.modules para search
   - sincronizar loaders de acciones sin romper tabla
   - refrescar listado tras crear / modificar incidencia
   - fusionar detalle remoto con snapshot enriquecido del store

   HARDENING EXTREME:
   - render inicial inmediato
   - bind inmediato tras primer render para evitar pérdida de clicks
   - cola segura para crear incidencia antes de app ready
   - carga posterior segura
   - anti-race token
   - cleanup total
   - click delegation sólida
   - fallback elegante si los modales aún no existen
   - bloqueo de acciones antes de app ready sin perder intención del usuario
   - anti spam click en apertura rápida
   - anti spam apertura rápida de tickets
   - compatibilidad con template nuevo data-incidencias-action
   - compatibilidad con data-action legacy
   - template controlado por state real
   - blindaje contra normalizadores que descartan total/importe/linkedInvoices
   - blindaje contra normalizadores que descartan numeroFacturaLegal
   - bridge fuerte con incidencias.modal.js
   - soporte backend aliases: tickets/items/data/incidencias/results

   FIX CLAVE:
   - El listado recibe incidencias enriquecidas desde store.
   - El detalle remoto puede venir sin facturas asociadas.
   - Antes de abrir modal se fusiona el payload remoto con la
     incidencia enriquecida del store por id/ticketId/code.
   - El search puede pasar detail completo, payload de evento, string o ID.
   - openTicket() sigue aceptando ID; el bridge externo normaliza payload.
   - Si el detalle remoto viene pobre, no pisa importe/factura/legal number
     existentes en store/raw.
   - Los filtros del template funcionan desde el View real.
   - La paginación usa la colección filtrada.
   - El filtro "Abiertas" incluye abiertas, pendientes y en proceso.
   - El filtro "Cerradas" incluye resueltas, cerradas, canceladas y archivadas.
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

import renderIncidenciasTableTemplate from "./incidencias.table.template.js";

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
import { OnionIncidenciasModal } from "./incidencias.modal.js";

export const IncidenciasView = (() => {
  "use strict";

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const SCOPE = "view:incidencias";

  const PAGE_SIZE =
    Number(MODEL_DEFAULT_PAGE_SIZE || STATE_DEFAULT_PAGE_SIZE || 5) || 5;

  const CREATE_CLICK_THROTTLE_MS = 450;
  const OPEN_TICKET_THROTTLE_MS = 350;

  const DEFAULT_CURRENCY = "EUR";

  const DEFAULT_FILTER = "all";
  const FILTER_SEARCH_DEBOUNCE_MS = 180;

  const FILTER_ALIASES = Object.freeze({
    all: "all",
    todo: "all",
    todos: "all",
    todas: "all",
    total: "all",
    totales: "all",

    open: "open",
    opened: "open",
    abierta: "open",
    abiertas: "open",
    abierto: "open",
    abiertos: "open",
    active: "open",
    activa: "open",
    activas: "open",
    activo: "open",
    activos: "open",

    pending: "open",
    pendiente: "open",
    pendientes: "open",
    new: "open",
    nueva: "open",
    nuevo: "open",
    created: "open",

    progress: "open",
    in_progress: "open",
    inprogress: "open",
    proceso: "open",
    en_proceso: "open",
    trabajando: "open",
    working: "open",
    assigned: "open",
    asignada: "open",
    asignado: "open",

    resolved: "closed",
    resuelta: "closed",
    resueltas: "closed",
    resuelto: "closed",
    resueltos: "closed",
    solved: "closed",

    closed: "closed",
    close: "closed",
    cerrada: "closed",
    cerradas: "closed",
    cerrado: "closed",
    cerrados: "closed",
    cancelled: "closed",
    cancelada: "closed",
    cancelado: "closed",
    archived: "closed",
    archivada: "closed",
    archivado: "closed",

    urgent: "all",
    urgente: "all",
    urgentes: "all",
    critical: "all",
    critica: "all",
    crítico: "all",
    critico: "all",
    alta: "all",
    high: "all",

    attachments: "all",
    adjuntos: "all",
    con_adjuntos: "all",

    billed: "all",
    importe: "all",
    factura: "all",
    facturas: "all",
    con_importe: "all",
  });

  const STATUS_ALIASES = Object.freeze({
    pending: "pending",
    pendiente: "pending",
    pendientes: "pending",
    new: "pending",
    nueva: "pending",
    nuevo: "pending",
    created: "pending",

    open: "open",
    opened: "open",
    abierta: "open",
    abiertas: "open",
    abierto: "open",
    abiertos: "open",

    progress: "progress",
    in_progress: "progress",
    inprogress: "progress",
    proceso: "progress",
    en_proceso: "progress",
    trabajando: "progress",
    working: "progress",
    assigned: "progress",
    asignada: "progress",
    asignado: "progress",

    resolved: "resolved",
    resuelta: "resolved",
    resueltas: "resolved",
    resuelto: "resolved",
    resueltos: "resolved",
    solved: "resolved",

    closed: "closed",
    close: "closed",
    cerrada: "closed",
    cerradas: "closed",
    cerrado: "closed",
    cerrados: "closed",
    cancelled: "closed",
    cancelada: "closed",
    cancelado: "closed",
    archived: "closed",
    archivada: "closed",
    archivado: "closed",
  });

  const TICKET_QUERY_KEYS = Object.freeze([
    "ticket",
    "ticketId",
    "incidencia",
    "incidenciaId",
    "id",
    "openTicket",
    "openIncidencia",
  ]);

  const TICKET_OPEN_EVENTS = Object.freeze([
    "incidencias:detail:open",
    "incidencia:detail:open",
    "ticket:detail:open",
    "tickets:detail:open",
    "incidencias:ficha:open",
    "incidencia:ficha:open",
    "ticket:ficha:open",
    "topbar:search:open-incidencia",
    "topbar:search:open-ticket",
    "search:open-incidencia",
    "search:open-ticket",
    "global-search:open-incidencia",
    "global-search:open-ticket",
  ]);

  const MUTATION_EVENTS = Object.freeze([
    "incidencias:modal:updated",
    "incidencias:ticket:updated",
    "incidencias:upload:success",
    "incidencias:comment:success",
    "incidencias:reopen:success",
    "incidencias:delete:success",
    "incidencias:status:changed",
  ]);

  const READY_EVENTS = Object.freeze([
    "app:ready",
    "app:boot:ready",
    "app:boot:complete",
    "router:rendered",
  ]);

  /* =========================================================
     LOCAL RUNTIME
  ========================================================= */

  let initialized = false;
  let destroyed = false;

  let inflightInit = null;
  let inflightReload = null;
  let inflightExternalOpen = null;

  let queuedReloadOptions = null;

  let bindingsCleanup = null;
  let externalOpenCleanup = null;
  let mutationCleanup = null;
  let createSuccessCleanup = null;
  let readyCleanup = null;

  let pendingRenderFrame = 0;
  let renderToken = 0;

  let pendingCreateRequest = false;
  let lastCreateClickAt = 0;
  let lastOpenTicketClickAt = 0;

  let inflightExternalOpenTicketId = "";
  let lastAutoOpenedTicketId = "";

  let lastApiPayload = null;

  let activeFilter = DEFAULT_FILTER;
  let filterQuery = "";
  let filterSearchTimer = null;

  /* =========================================================
     SAFE HELPERS
  ========================================================= */

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) return fallback;

    const text = String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return text || fallback;
  }

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

        if (lastComma > lastDot) {
          normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
        } else {
          normalized = normalized.replace(/,/g, "");
        }
      } else if (hasComma) {
        normalized = normalized.replace(/,/g, ".");
      }

      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
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

  function uniqueStrings(values = []) {
    return [
      ...new Set(
        safeArray(values)
          .flatMap((value) => (Array.isArray(value) ? value : [value]))
          .map((value) => safeText(value, ""))
          .filter(Boolean)
      ),
    ];
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

  /* =========================================================
     FILTER STATE / MATCHERS
  ========================================================= */

  function normalizeFilter(value = DEFAULT_FILTER) {
    const key = normalizeKey(value || DEFAULT_FILTER);

    return FILTER_ALIASES[key] || DEFAULT_FILTER;
  }

  function normalizeStatusKey(value = "") {
    const key = normalizeKey(value || "");

    return STATUS_ALIASES[key] || "pending";
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
        filterQuery,
        ""
      ),
      ""
    );
  }

  function syncFilterRuntime({
    filter = getCurrentFilter(),
    searchQuery = getCurrentSearchQuery(),
  } = {}) {
    activeFilter = normalizeFilter(filter);
    filterQuery = safeText(searchQuery, "");

    incidenciasState.activeFilter = activeFilter;
    incidenciasState.statusFilter = activeFilter;
    incidenciasState.filter = activeFilter;

    incidenciasState.searchQuery = filterQuery;
    incidenciasState.filterQuery = filterQuery;
    incidenciasState.query = filterQuery;

    return {
      activeFilter,
      searchQuery: filterQuery,
    };
  }

  function clearFilterSearchTimer() {
    if (!filterSearchTimer) return;

    try {
      clearTimeout(filterSearchTimer);
    } catch {}

    filterSearchTimer = null;
  }

  function getItemStatusRaw(item = {}) {
    return first(
      item.status,
      item.estado,
      item.state,
      item.lifecycle?.status,
      item.raw?.status,
      item.raw?.estado,
      item.raw?.state,
      item.raw?.lifecycle?.status,
      ""
    );
  }

  function getItemStatusKey(item = {}) {
    return normalizeStatusKey(getItemStatusRaw(item));
  }

  function getItemPriorityKey(item = {}) {
    const key = normalizeKey(
      first(
        item.priority,
        item.prioridad,
        item.severity,
        item.urgency,
        item.sla?.priority,
        item.raw?.priority,
        item.raw?.prioridad,
        item.raw?.severity,
        item.raw?.urgency,
        item.raw?.sla?.priority,
        ""
      )
    );

    if (
      [
        "critical",
        "critica",
        "crítica",
        "critico",
        "crítico",
        "urgent",
        "urgente",
        "high",
        "alta",
        "p0",
        "p1",
      ].includes(key)
    ) {
      return "urgent";
    }

    return key || "medium";
  }

  function getItemAttachmentsCount(item = {}) {
    const attachments = first(
      item.attachments,
      item.files,
      item.adjuntos,
      item.raw?.attachments,
      item.raw?.files,
      item.raw?.adjuntos
    );

    if (Array.isArray(attachments)) return attachments.length;

    return safeNumber(
      first(
        item.attachmentsCount,
        item.filesCount,
        item.adjuntosCount,
        item.raw?.attachmentsCount,
        item.raw?.filesCount,
        item.raw?.adjuntosCount,
        0
      ),
      0
    );
  }

  function getItemAmount(item = {}) {
    return roundMoney(
      first(
        item.total,
        item.amount,
        item.importe,
        item.price,

        item.facturasTotal,
        item.invoicesTotal,
        item.importeFacturas,
        item.invoiceTotal,

        item.facturaTotal,
        item.facturaImporte,
        item.importeFactura,
        item.totalFactura,
        item.invoiceAmount,

        item.linkedInvoices?.total,
        item.linkedInvoices?.amount,
        item.linkedInvoices?.importe,

        item.meta?.invoicesTotal,
        item.meta?.invoiceTotal,

        item.raw?.total,
        item.raw?.amount,
        item.raw?.importe,
        item.raw?.price,

        item.raw?.facturasTotal,
        item.raw?.invoicesTotal,
        item.raw?.importeFacturas,
        item.raw?.invoiceTotal,

        item.raw?.facturaTotal,
        item.raw?.facturaImporte,
        item.raw?.importeFactura,
        item.raw?.totalFactura,
        item.raw?.invoiceAmount,

        item.raw?.linkedInvoices?.total,
        item.raw?.linkedInvoices?.amount,
        item.raw?.linkedInvoices?.importe,

        item.raw?.meta?.invoicesTotal,
        item.raw?.meta?.invoiceTotal
      )
    );
  }

  function getItemSearchText(item = {}) {
    return normalizeText(
      [
        item.ticketId,
        item.id,
        item.code,
        item.ticketCode,
        item.incidenciaId,

        item.subject,
        item.title,
        item.asunto,
        item.description,
        item.descripcion,
        item.message,
        item.preview,

        item.clientName,
        item.clienteNombre,
        item.requesterName,
        item.name,
        item.email,
        item.clientEmail,
        item.clienteEmail,

        item.requesterSnapshot?.name,
        item.requesterSnapshot?.email,
        item.cliente?.nombre,
        item.cliente?.name,
        item.cliente?.email,
        item.client?.name,
        item.client?.email,
        item.customer?.name,
        item.customer?.email,
        item.receptor?.name,
        item.receptor?.email,

        item.assignedTo?.name,
        item.assignedTo?.email,
        item.assignment?.assignedToName,
        item.assignment?.assignedToEmail,
        item.assignment?.agentName,
        item.assignment?.name,
        item.tecnico?.name,
        item.tecnico?.email,
        item.tecnico,

        item.category,
        item.categoria,
        item.subcategory,
        item.subcategoria,
        item.type,
        item.tipo,

        item.status,
        item.estado,
        item.priority,
        item.prioridad,

        item.numeroFacturaLegal,
        item.numeroFactura,
        item.invoiceNumber,
        item.facturaId,
        item.invoiceId,

        item.raw?.search?.text,
      ]
        .map((value) => safeText(value, ""))
        .filter(Boolean)
        .join(" ")
    );
  }

  function itemMatchesCurrentFilter(item = {}, filter = getCurrentFilter()) {
    const key = normalizeFilter(filter);
    const statusKey = getItemStatusKey(item);

    if (key === "all") return true;

    if (key === "open") {
      return ["open", "pending", "progress"].includes(statusKey);
    }

    if (key === "closed") {
      return ["resolved", "closed"].includes(statusKey);
    }

    return true;
  }

  function itemMatchesCurrentSearch(item = {}, searchQuery = getCurrentSearchQuery()) {
    const query = normalizeText(searchQuery);

    if (!query) return true;

    const terms = query.split(" ").filter(Boolean);
    const haystack = getItemSearchText(item);

    return terms.every((term) => haystack.includes(term));
  }

  function getFilteredItems(items = getItems()) {
    const filter = getCurrentFilter();
    const searchQuery = getCurrentSearchQuery();

    return safeArray(items).filter((item) => {
      return (
        itemMatchesCurrentFilter(item, filter) &&
        itemMatchesCurrentSearch(item, searchQuery)
      );
    });
  }

  function resetPageToOne() {
    try {
      setPage(1);
    } catch {
      incidenciasState.page = 1;
    }
  }

  function setFilter(filter = DEFAULT_FILTER) {
    const nextFilter = normalizeFilter(filter);

    syncFilterRuntime({
      filter: nextFilter,
      searchQuery: getCurrentSearchQuery(),
    });

    resetPageToOne();
    rerender();

    safeEmit("incidencias:filter:changed", {
      filter: nextFilter,
      searchQuery: getCurrentSearchQuery(),
      source: "incidenciasView",
    });

    return nextFilter;
  }

  function setSearchQuery(query = "") {
    const nextQuery = safeText(query, "");

    syncFilterRuntime({
      filter: getCurrentFilter(),
      searchQuery: nextQuery,
    });

    resetPageToOne();
    rerender();

    safeEmit("incidencias:filter-search:changed", {
      filter: getCurrentFilter(),
      searchQuery: nextQuery,
      source: "incidenciasView",
    });

    return nextQuery;
  }

  function clearFilters() {
    clearFilterSearchTimer();

    syncFilterRuntime({
      filter: DEFAULT_FILTER,
      searchQuery: "",
    });

    resetPageToOne();
    rerender();

    safeEmit("incidencias:filters:cleared", {
      source: "incidenciasView",
    });

    return true;
  }

  function clearSearchOnly() {
    clearFilterSearchTimer();

    syncFilterRuntime({
      filter: getCurrentFilter(),
      searchQuery: "",
    });

    resetPageToOne();
    rerender();

    safeEmit("incidencias:filter-search:cleared", {
      filter: getCurrentFilter(),
      source: "incidenciasView",
    });

    return true;
  }

  function scheduleSearchQuery(query = "") {
    clearFilterSearchTimer();

    const value = safeText(query, "");

    filterSearchTimer = setTimeout(() => {
      filterSearchTimer = null;
      setSearchQuery(value);
    }, FILTER_SEARCH_DEBOUNCE_MS);
  }

  /* =========================================================
     GENERIC HELPERS
  ========================================================= */

  function sameTicketIdentity(a = "", b = "") {
    const left = normalizeText(a);
    const right = normalizeText(b);

    return Boolean(left && right && left === right);
  }

  function normalizeMoney(value, fallback = null) {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : fallback;
    }

    const normalized = String(value)
      .replace(/\s+/g, "")
      .replace(/\./g, "")
      .replace(",", ".");

    const amount = Number(normalized);

    if (!Number.isFinite(amount)) {
      return fallback;
    }

    return amount;
  }

  function roundMoney(value) {
    const amount = normalizeMoney(value, null);

    if (!Number.isFinite(amount)) {
      return null;
    }

    return Math.round((amount + Number.EPSILON) * 100) / 100;
  }

  function getContainer() {
    return (
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      null
    );
  }

  function nextRenderToken() {
    renderToken += 1;
    return renderToken;
  }

  function isActiveToken(token) {
    return !destroyed && token === renderToken;
  }

  function requestFrame(callback) {
    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      return window.requestAnimationFrame(callback);
    }

    return window.setTimeout(callback, 0);
  }

  function cancelFrame(frameId) {
    if (!frameId) return;

    try {
      if (
        typeof window !== "undefined" &&
        typeof window.cancelAnimationFrame === "function"
      ) {
        window.cancelAnimationFrame(frameId);
        return;
      }

      window.clearTimeout(frameId);
    } catch {}
  }

  function waitForPaint() {
    return new Promise((resolve) => {
      try {
        if (typeof window === "undefined") {
          resolve();
          return;
        }

        if (typeof window.requestAnimationFrame !== "function") {
          window.setTimeout(resolve, 0);
          return;
        }

        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(resolve);
        });
      } catch {
        resolve();
      }
    });
  }

  /* =========================================================
     CORE HELPERS
  ========================================================= */

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

  function safeEmit(event = "", payload = {}) {
    const eventName = safeText(event, "");
    if (!eventName) return false;

    let emitted = false;

    try {
      AppCore?.events?.emit?.(eventName, payload);
      emitted = true;
    } catch {}

    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(eventName, {
            detail: payload,
          })
        );
        emitted = true;
      }
    } catch {}

    return emitted;
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
      if (typeof window !== "undefined") {
        window.addEventListener(eventName, windowHandler);
        windowAttached = true;
      }
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

  function showToast(message = "", type = "info") {
    const text = safeText(message, "");
    if (!text) return;

    try {
      if (typeof AppCore?.toast?.[type] === "function") {
        AppCore.toast[type](text);
        return;
      }
    } catch {}

    try {
      AppCore?.toast?.show?.(text, type);
      return;
    } catch {}

    try {
      AppCore?.ui?.toast?.[type]?.(text);
      return;
    } catch {}

    try {
      AppCore?.ui?.toast?.show?.(text, type);
    } catch {}
  }

  function safeErrorMessage(error = null) {
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

  /* =========================================================
     CLEANUP HELPERS
  ========================================================= */

  function cleanupBindings() {
    try {
      bindingsCleanup?.();
    } catch {}

    bindingsCleanup = null;

    cleanupExternalOpenListener();
    cleanupMutationListeners();
    cleanupCreateSuccessListener();
    cleanupReadyListeners();

    try {
      AppCore?.cleanup?.run?.(SCOPE);
    } catch {}
  }

  function cleanupExternalOpenListener() {
    try {
      externalOpenCleanup?.();
    } catch {}

    externalOpenCleanup = null;
  }

  function cleanupMutationListeners() {
    try {
      mutationCleanup?.();
    } catch {}

    mutationCleanup = null;
  }

  function cleanupCreateSuccessListener() {
    try {
      createSuccessCleanup?.();
    } catch {}

    createSuccessCleanup = null;
  }

  function cleanupReadyListeners() {
    try {
      readyCleanup?.();
    } catch {}

    readyCleanup = null;
  }

  function cancelPendingRender() {
    if (!pendingRenderFrame) return;

    cancelFrame(pendingRenderFrame);
    pendingRenderFrame = 0;
  }

  /* =========================================================
     BACKEND PAYLOAD HELPERS
  ========================================================= */

  function extractItemsFromPayload(payload = null) {
    if (Array.isArray(payload)) {
      return payload;
    }

    const data = safeObject(payload);

    return safeArray(
      first(
        data.tickets,
        data.items,
        data.data,
        data.incidencias,
        data.results,
        data.rows,
        data.list,
        data.payload?.tickets,
        data.payload?.items,
        data.payload?.data,
        data.payload?.incidencias,
        data.result?.tickets,
        data.result?.items,
        data.result?.data,
        data.result?.incidencias
      )
    );
  }

  function extractRemoteCountFromPayload(payload = null, fallback = 0) {
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

  function makeRawMap(...collections) {
    const map = new Map();

    for (const collection of collections) {
      safeArray(collection).forEach((item) => {
        const id = getStableTicketId(item);

        if (id && !map.has(id)) {
          map.set(id, item);
        }
      });
    }

    return map;
  }

  /* =========================================================
     TICKET ID / SEARCH HELPERS
  ========================================================= */

  function getStableTicketId(item = {}) {
    if (typeof item === "string" || typeof item === "number") {
      return safeText(item, "");
    }

    return safeText(
      first(
        item?.ticketId,
        item?.id,
        item?._id,
        item?.code,
        item?.numero,
        item?.ticketCode,
        item?.incidenciaId,
        item?.entityId,

        item?.raw?.ticketId,
        item?.raw?.id,
        item?.raw?._id,
        item?.raw?.code,
        item?.raw?.numero,
        item?.raw?.ticketCode,
        item?.raw?.incidenciaId,
        item?.raw?.entityId,

        item?.detail?.ticketId,
        item?.detail?.id,
        item?.detail?.code,
        item?.detail?.ticketCode,
        item?.detail?.incidenciaId,

        item?.ticket?.ticketId,
        item?.ticket?.id,
        item?.ticket?.code,
        item?.ticket?.ticketCode,
        item?.ticket?.incidenciaId,

        item?.incidencia?.ticketId,
        item?.incidencia?.id,
        item?.incidencia?.code,
        item?.incidencia?.ticketCode,
        item?.incidencia?.incidenciaId,

        item?.payload?.ticketId,
        item?.payload?.id,
        item?.payload?.code,
        item?.payload?.ticketCode,
        item?.payload?.incidenciaId,

        item?.result?.ticketId,
        item?.result?.id,
        item?.result?.code,
        item?.result?.ticketCode,
        item?.result?.incidenciaId
      ),
      ""
    );
  }

  function getTicketIdentityList(item = {}) {
    if (typeof item === "string" || typeof item === "number") {
      return [safeText(item, "")].filter(Boolean);
    }

    const source = safeObject(item);
    const raw = safeObject(source.raw);

    return uniqueStrings([
      source.ticketId,
      source.id,
      source._id,
      source.code,
      source.numero,
      source.ticketCode,
      source.incidenciaId,
      source.entityId,

      raw.ticketId,
      raw.id,
      raw._id,
      raw.code,
      raw.numero,
      raw.ticketCode,
      raw.incidenciaId,
      raw.entityId,
    ]);
  }

  function extractExternalOpenPayload(eventOrPayload = {}) {
    if (
      typeof eventOrPayload === "string" ||
      typeof eventOrPayload === "number"
    ) {
      return {
        ticketId: safeText(eventOrPayload, ""),
      };
    }

    const value = eventOrPayload;

    if (value?.detail?.payload) {
      return safeObject(value.detail.payload);
    }

    if (
      value?.detail?.detail ||
      value?.detail?.ticket ||
      value?.detail?.incidencia ||
      value?.detail?.item
    ) {
      return safeObject(value.detail);
    }

    if (value?.detail && typeof value.detail === "object") {
      return safeObject(value.detail);
    }

    return safeObject(value);
  }

  function getTicketIdFromExternalPayload(payload = {}) {
    if (typeof payload === "string" || typeof payload === "number") {
      return safeText(payload, "");
    }

    const source = safeObject(payload);
    const item = safeObject(source.item);
    const detail = safeObject(source.detail);
    const ticket = safeObject(source.ticket);
    const incidencia = safeObject(source.incidencia);
    const raw = safeObject(
      first(source.raw, item.raw, detail.raw, ticket.raw, incidencia.raw)
    );

    const direct = safeText(
      first(
        source.ticketId,
        source.incidenciaId,
        source.id,
        source._id,
        source.entityId,
        source.value,
        source.key,
        source.code,
        source.ticketCode,

        detail.ticketId,
        detail.incidenciaId,
        detail.id,
        detail._id,
        detail.code,
        detail.ticketCode,

        ticket.ticketId,
        ticket.incidenciaId,
        ticket.id,
        ticket._id,
        ticket.code,
        ticket.ticketCode,

        incidencia.ticketId,
        incidencia.incidenciaId,
        incidencia.id,
        incidencia._id,
        incidencia.code,
        incidencia.ticketCode,

        item.entityId,
        item.ticketId,
        item.incidenciaId,
        item.id,
        item._id,
        item.value,
        item.key,
        item.code,
        item.ticketCode,

        raw.ticketId,
        raw.incidenciaId,
        raw.id,
        raw._id,
        raw.code,
        raw.ticketCode
      ),
      ""
    );

    if (direct) return direct;

    try {
      const href = safeText(first(source.href, source.url, item.href, item.url), "");

      if (href) {
        const url = new URL(href, window.location.origin);

        for (const key of TICKET_QUERY_KEYS) {
          const value = safeText(url.searchParams.get(key), "");
          if (value) return value;
        }
      }
    } catch {}

    return "";
  }

  function getTicketIdFromLocation() {
    try {
      const params = new URLSearchParams(window.location.search || "");

      for (const key of TICKET_QUERY_KEYS) {
        const value = safeText(params.get(key), "");
        if (value) return value;
      }

      return "";
    } catch {
      return "";
    }
  }

  function clearTicketIdFromLocation() {
    try {
      const url = new URL(window.location.href);
      const params = url.searchParams;

      TICKET_QUERY_KEYS.forEach((key) => {
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

  /* =========================================================
     INVOICE FIELD PRESERVER
  ========================================================= */

  function collectInvoiceObjects(source = {}, raw = {}) {
    const output = [];

    const candidates = [
      source?.factura,
      source?.invoice,
      source?.billing,
      source?.linkedInvoices,

      raw?.factura,
      raw?.invoice,
      raw?.billing,
      raw?.linkedInvoices,

      ...safeArray(source?.facturas),
      ...safeArray(source?.invoices),
      ...safeArray(source?.facturasRelacionadas),
      ...safeArray(source?.linkedInvoices?.invoices),

      ...safeArray(raw?.facturas),
      ...safeArray(raw?.invoices),
      ...safeArray(raw?.facturasRelacionadas),
      ...safeArray(raw?.linkedInvoices?.invoices),
    ];

    candidates.forEach((candidate) => {
      if (hasOwnKeys(candidate)) {
        output.push(candidate);
      }
    });

    return output;
  }

  function resolveInvoiceNumber(source = {}, raw = {}) {
    const invoices = collectInvoiceObjects(source, raw);

    return safeText(
      first(
        source.numeroFacturaLegal,
        source.numeroFactura,
        source.invoiceNumber,
        source.legalInvoiceNumber,
        source.facturaNumeroLegal,

        source.billing?.numeroFacturaLegal,
        source.billing?.numeroFactura,
        source.billing?.invoiceNumber,

        source.factura?.numeroFacturaLegal,
        source.factura?.numeroFactura,
        source.factura?.invoiceNumber,
        source.factura?.legalNumber,
        source.factura?.number,

        source.invoice?.numeroFacturaLegal,
        source.invoice?.numeroFactura,
        source.invoice?.invoiceNumber,
        source.invoice?.legalNumber,
        source.invoice?.number,

        source.linkedInvoices?.numeroFacturaLegal,
        source.linkedInvoices?.numeroFactura,
        source.linkedInvoices?.invoiceNumber,

        raw.numeroFacturaLegal,
        raw.numeroFactura,
        raw.invoiceNumber,
        raw.legalInvoiceNumber,
        raw.facturaNumeroLegal,

        raw.billing?.numeroFacturaLegal,
        raw.billing?.numeroFactura,
        raw.billing?.invoiceNumber,

        raw.factura?.numeroFacturaLegal,
        raw.factura?.numeroFactura,
        raw.factura?.invoiceNumber,
        raw.factura?.legalNumber,
        raw.factura?.number,

        raw.invoice?.numeroFacturaLegal,
        raw.invoice?.numeroFactura,
        raw.invoice?.invoiceNumber,
        raw.invoice?.legalNumber,
        raw.invoice?.number,

        raw.linkedInvoices?.numeroFacturaLegal,
        raw.linkedInvoices?.numeroFactura,
        raw.linkedInvoices?.invoiceNumber,

        ...invoices.map((invoice) => invoice?.numeroFacturaLegal),
        ...invoices.map((invoice) => invoice?.numeroFactura),
        ...invoices.map((invoice) => invoice?.invoiceNumber),
        ...invoices.map((invoice) => invoice?.legalNumber),
        ...invoices.map((invoice) => invoice?.number)
      ),
      ""
    );
  }

  function resolvePrimaryInvoiceId(source = {}, raw = {}) {
    const invoices = collectInvoiceObjects(source, raw);

    return safeText(
      first(
        source.facturaId,
        source.invoiceId,
        source.linkedFacturaId,
        source.linkedInvoiceId,

        source.billing?.facturaId,
        source.billing?.invoiceId,

        source.factura?.id,
        source.factura?.facturaId,
        source.factura?.invoiceId,

        source.invoice?.id,
        source.invoice?.facturaId,
        source.invoice?.invoiceId,

        source.linkedInvoices?.primaryInvoiceId,

        raw.facturaId,
        raw.invoiceId,
        raw.linkedFacturaId,
        raw.linkedInvoiceId,

        raw.billing?.facturaId,
        raw.billing?.invoiceId,

        raw.factura?.id,
        raw.factura?.facturaId,
        raw.factura?.invoiceId,

        raw.invoice?.id,
        raw.invoice?.facturaId,
        raw.invoice?.invoiceId,

        raw.linkedInvoices?.primaryInvoiceId,

        ...safeArray(source.facturaIds),
        ...safeArray(source.invoiceIds),
        ...safeArray(source.linkedInvoices?.ids),

        ...safeArray(raw.facturaIds),
        ...safeArray(raw.invoiceIds),
        ...safeArray(raw.linkedInvoices?.ids),

        ...invoices.map((invoice) => invoice?.id),
        ...invoices.map((invoice) => invoice?.facturaId),
        ...invoices.map((invoice) => invoice?.invoiceId)
      ),
      ""
    );
  }

  function resolveInvoiceIds(source = {}, raw = {}) {
    const invoices = collectInvoiceObjects(source, raw);

    return uniqueStrings([
      source.facturaId,
      source.invoiceId,
      source.linkedFacturaId,
      source.linkedInvoiceId,

      raw.facturaId,
      raw.invoiceId,
      raw.linkedFacturaId,
      raw.linkedInvoiceId,

      source.linkedInvoices?.primaryInvoiceId,
      raw.linkedInvoices?.primaryInvoiceId,

      ...safeArray(source.facturaIds),
      ...safeArray(source.invoiceIds),
      ...safeArray(source.linkedInvoices?.ids),

      ...safeArray(raw.facturaIds),
      ...safeArray(raw.invoiceIds),
      ...safeArray(raw.linkedInvoices?.ids),

      ...invoices.flatMap((invoice) => [
        invoice?.id,
        invoice?.facturaId,
        invoice?.invoiceId,
        invoice?.numeroFacturaLegal,
        invoice?.numeroFactura,
        invoice?.invoiceNumber,
      ]),
    ]);
  }

  function resolveInvoiceCount(source = {}, raw = {}, invoiceIds = []) {
    const invoices = collectInvoiceObjects(source, raw);

    return Math.max(
      0,
      safeNumber(
        first(
          source.facturasCount,
          source.invoicesCount,
          source.linkedInvoices?.count,

          source.meta?.linkedInvoiceCount,
          source.meta?.invoiceCount,

          raw.facturasCount,
          raw.invoicesCount,
          raw.linkedInvoices?.count,

          raw.meta?.linkedInvoiceCount,
          raw.meta?.invoiceCount,

          invoiceIds.length,
          invoices.length
        ),
        Math.max(invoiceIds.length, invoices.length)
      )
    );
  }

  function resolveInvoiceCurrency(source = {}, raw = {}) {
    const invoices = collectInvoiceObjects(source, raw);

    return safeText(
      first(
        source.facturaCurrency,
        source.facturaMoneda,
        source.currency,
        source.moneda,

        source.linkedInvoices?.currency,
        source.linkedInvoices?.moneda,

        source.meta?.invoiceCurrency,
        source.meta?.currency,
        source.meta?.moneda,

        source.billing?.currency,
        source.billing?.moneda,

        source.factura?.currency,
        source.factura?.moneda,

        source.invoice?.currency,
        source.invoice?.moneda,

        raw.facturaCurrency,
        raw.facturaMoneda,
        raw.currency,
        raw.moneda,

        raw.linkedInvoices?.currency,
        raw.linkedInvoices?.moneda,

        raw.meta?.invoiceCurrency,
        raw.meta?.currency,
        raw.meta?.moneda,

        raw.billing?.currency,
        raw.billing?.moneda,

        raw.factura?.currency,
        raw.factura?.moneda,

        raw.invoice?.currency,
        raw.invoice?.moneda,

        ...invoices.map((invoice) => invoice?.currency),
        ...invoices.map((invoice) => invoice?.moneda),

        DEFAULT_CURRENCY
      ),
      DEFAULT_CURRENCY
    ).toUpperCase();
  }

  function resolveInvoiceAmount(source = {}, raw = {}) {
    const invoices = collectInvoiceObjects(source, raw);

    const candidates = [
      source.facturaTotal,
      source.facturaImporte,
      source.importeFactura,
      source.totalFactura,
      source.invoiceAmount,

      source.facturasTotal,
      source.invoicesTotal,
      source.importeFacturas,
      source.invoiceTotal,

      source.linkedInvoices?.total,
      source.linkedInvoices?.amount,
      source.linkedInvoices?.importe,

      source.meta?.invoicesTotal,
      source.meta?.invoiceTotal,

      source.billing?.total,
      source.billing?.amount,
      source.billing?.importe,

      source.factura?.total,
      source.factura?.amount,
      source.factura?.importe,
      source.factura?.importeTotal,
      source.factura?.totalFactura,

      source.invoice?.total,
      source.invoice?.amount,
      source.invoice?.importe,
      source.invoice?.importeTotal,
      source.invoice?.totalFactura,

      raw.facturaTotal,
      raw.facturaImporte,
      raw.importeFactura,
      raw.totalFactura,
      raw.invoiceAmount,

      raw.facturasTotal,
      raw.invoicesTotal,
      raw.importeFacturas,
      raw.invoiceTotal,

      raw.linkedInvoices?.total,
      raw.linkedInvoices?.amount,
      raw.linkedInvoices?.importe,

      raw.meta?.invoicesTotal,
      raw.meta?.invoiceTotal,

      raw.billing?.total,
      raw.billing?.amount,
      raw.billing?.importe,

      raw.factura?.total,
      raw.factura?.amount,
      raw.factura?.importe,
      raw.factura?.importeTotal,
      raw.factura?.totalFactura,

      raw.invoice?.total,
      raw.invoice?.amount,
      raw.invoice?.importe,
      raw.invoice?.importeTotal,
      raw.invoice?.totalFactura,

      ...invoices.map((invoice) => invoice?.total),
      ...invoices.map((invoice) => invoice?.amount),
      ...invoices.map((invoice) => invoice?.importe),
      ...invoices.map((invoice) => invoice?.importeTotal),
      ...invoices.map((invoice) => invoice?.totalFactura),
    ];

    for (const candidate of candidates) {
      const amount = roundMoney(candidate);

      if (amount !== null) {
        return amount;
      }
    }

    const invoiceNumber = resolveInvoiceNumber(source, raw);
    const invoiceIds = resolveInvoiceIds(source, raw);

    const hasInvoiceEvidence =
      Boolean(invoiceNumber) ||
      invoiceIds.length > 0 ||
      collectInvoiceObjects(source, raw).length > 0;

    if (hasInvoiceEvidence) {
      const genericAmount = roundMoney(
        first(
          source.total,
          source.amount,
          source.importe,
          source.price,
          raw.total,
          raw.amount,
          raw.importe,
          raw.price
        )
      );

      return genericAmount === null ? 0 : genericAmount;
    }

    return null;
  }

  function normalizeInvoiceLite(invoice = {}) {
    if (!hasOwnKeys(invoice)) return null;

    const total = resolveInvoiceAmount(invoice, {});
    const numeroFacturaLegal = resolveInvoiceNumber(invoice, {});
    const id = resolvePrimaryInvoiceId(invoice, {});
    const currency = resolveInvoiceCurrency(invoice, {});

    return {
      ...invoice,

      id,
      facturaId: safeText(first(invoice.facturaId, id), id),
      invoiceId: safeText(first(invoice.invoiceId, id), id),

      numeroFacturaLegal,
      numeroFactura: safeText(
        first(invoice.numeroFactura, numeroFacturaLegal),
        numeroFacturaLegal
      ),
      invoiceNumber: safeText(
        first(invoice.invoiceNumber, numeroFacturaLegal),
        numeroFacturaLegal
      ),

      total: total === null ? 0 : total,
      amount: total === null ? 0 : total,
      importe: total === null ? 0 : total,
      totalFactura: total === null ? 0 : total,
      importeTotal: total === null ? 0 : total,

      currency,
      moneda: currency,
    };
  }

  function normalizeInvoiceArray(source = {}, raw = {}) {
    return collectInvoiceObjects(source, raw)
      .map(normalizeInvoiceLite)
      .filter(Boolean);
  }

  function preserveInvoiceAmountFields(item = {}, fallbackRaw = {}) {
    const source = safeObject(item);

    const embeddedRaw = safeObject(source.raw);
    const externalRaw = safeObject(fallbackRaw);

    const raw = hasOwnKeys(embeddedRaw)
      ? embeddedRaw
      : externalRaw;

    const sourceMeta = safeObject(source.meta);
    const rawMeta = safeObject(raw.meta);

    const sourceLinkedInvoices = safeObject(source.linkedInvoices);
    const rawLinkedInvoices = safeObject(raw.linkedInvoices);

    const linkedInvoices = hasOwnKeys(sourceLinkedInvoices)
      ? sourceLinkedInvoices
      : rawLinkedInvoices;

    const invoiceIds = resolveInvoiceIds(source, raw);
    const primaryInvoiceId =
      resolvePrimaryInvoiceId(source, raw) || invoiceIds[0] || "";

    const facturasCount = resolveInvoiceCount(source, raw, invoiceIds);

    const amount = resolveInvoiceAmount(source, raw);
    const normalizedAmount = amount === null ? null : roundMoney(amount);

    const currency = resolveInvoiceCurrency(source, raw);
    const numeroFacturaLegal = resolveInvoiceNumber(source, raw);

    const normalizedInvoices = normalizeInvoiceArray(source, raw);

    const hasInvoiceEvidence = Boolean(
      numeroFacturaLegal ||
        primaryInvoiceId ||
        invoiceIds.length ||
        facturasCount ||
        normalizedInvoices.length ||
        normalizedAmount !== null
    );

    const finalAmount =
      normalizedAmount === null
        ? hasInvoiceEvidence
          ? 0
          : null
        : normalizedAmount;

    const nextLinkedInvoices = {
      ...linkedInvoices,

      count: Math.max(
        facturasCount,
        safeNumber(linkedInvoices.count, 0),
        safeNumber(rawLinkedInvoices.count, 0),
        invoiceIds.length,
        normalizedInvoices.length,
        hasInvoiceEvidence ? 1 : 0
      ),

      ids: uniqueStrings(
        first(
          linkedInvoices.ids,
          rawLinkedInvoices.ids,
          invoiceIds
        )
      ),

      primaryInvoiceId: safeText(
        first(
          linkedInvoices.primaryInvoiceId,
          rawLinkedInvoices.primaryInvoiceId,
          primaryInvoiceId
        ),
        primaryInvoiceId
      ),

      numeroFacturaLegal: safeText(
        first(
          linkedInvoices.numeroFacturaLegal,
          rawLinkedInvoices.numeroFacturaLegal,
          numeroFacturaLegal
        ),
        numeroFacturaLegal
      ),

      numeroFactura: safeText(
        first(
          linkedInvoices.numeroFactura,
          rawLinkedInvoices.numeroFactura,
          numeroFacturaLegal
        ),
        numeroFacturaLegal
      ),

      invoiceNumber: safeText(
        first(
          linkedInvoices.invoiceNumber,
          rawLinkedInvoices.invoiceNumber,
          numeroFacturaLegal
        ),
        numeroFacturaLegal
      ),

      total: first(linkedInvoices.total, rawLinkedInvoices.total, finalAmount),
      amount: first(linkedInvoices.amount, rawLinkedInvoices.amount, finalAmount),
      importe: first(linkedInvoices.importe, rawLinkedInvoices.importe, finalAmount),

      currency: safeText(
        first(linkedInvoices.currency, rawLinkedInvoices.currency, currency),
        currency
      ),
      moneda: safeText(
        first(linkedInvoices.moneda, rawLinkedInvoices.moneda, currency),
        currency
      ),

      invoices: safeArray(
        first(
          linkedInvoices.invoices,
          rawLinkedInvoices.invoices,
          normalizedInvoices
        )
      ),
    };

    const nextMeta = {
      ...sourceMeta,

      hasLinkedInvoices: Boolean(
        sourceMeta.hasLinkedInvoices ||
          rawMeta.hasLinkedInvoices ||
          hasInvoiceEvidence
      ),

      linkedInvoiceCount: Math.max(
        safeNumber(sourceMeta.linkedInvoiceCount, 0),
        safeNumber(rawMeta.linkedInvoiceCount, 0),
        nextLinkedInvoices.count,
        facturasCount,
        invoiceIds.length,
        normalizedInvoices.length
      ),

      invoicesTotal: first(
        sourceMeta.invoicesTotal,
        rawMeta.invoicesTotal,
        finalAmount
      ),

      invoiceTotal: first(
        sourceMeta.invoiceTotal,
        rawMeta.invoiceTotal,
        finalAmount
      ),

      invoiceCurrency: safeText(
        first(
          sourceMeta.invoiceCurrency,
          rawMeta.invoiceCurrency,
          currency
        ),
        currency
      ),

      numeroFacturaLegal: safeText(
        first(
          sourceMeta.numeroFacturaLegal,
          rawMeta.numeroFacturaLegal,
          numeroFacturaLegal
        ),
        numeroFacturaLegal
      ),
    };

    return {
      ...source,

      raw: hasOwnKeys(source.raw) ? source.raw : raw,

      facturaId: safeText(
        first(
          source.facturaId,
          raw.facturaId,
          source.invoiceId,
          raw.invoiceId,
          primaryInvoiceId
        ),
        ""
      ),

      invoiceId: safeText(
        first(
          source.invoiceId,
          raw.invoiceId,
          source.facturaId,
          raw.facturaId,
          primaryInvoiceId
        ),
        ""
      ),

      linkedFacturaId: safeText(
        first(source.linkedFacturaId, raw.linkedFacturaId, primaryInvoiceId),
        ""
      ),

      linkedInvoiceId: safeText(
        first(source.linkedInvoiceId, raw.linkedInvoiceId, primaryInvoiceId),
        ""
      ),

      numeroFacturaLegal,
      numeroFactura: safeText(
        first(source.numeroFactura, raw.numeroFactura, numeroFacturaLegal),
        numeroFacturaLegal
      ),
      invoiceNumber: safeText(
        first(source.invoiceNumber, raw.invoiceNumber, numeroFacturaLegal),
        numeroFacturaLegal
      ),

      facturaIds: uniqueStrings(first(source.facturaIds, raw.facturaIds, invoiceIds)),
      invoiceIds: uniqueStrings(first(source.invoiceIds, raw.invoiceIds, invoiceIds)),

      facturaRelacionada: safeText(
        first(
          source.facturaRelacionada,
          raw.facturaRelacionada,
          facturasCount > 0
            ? `${facturasCount} factura${facturasCount === 1 ? "" : "s"} vinculada${facturasCount === 1 ? "" : "s"}`
            : ""
        ),
        ""
      ),

      facturasCount,
      invoicesCount: Math.max(
        facturasCount,
        safeNumber(source.invoicesCount, 0),
        safeNumber(raw.invoicesCount, 0)
      ),

      linkedInvoices: nextLinkedInvoices,

      factura: first(source.factura, raw.factura, normalizedInvoices[0], null),
      invoice: first(source.invoice, raw.invoice, normalizedInvoices[0], null),
      billing: first(
        source.billing,
        raw.billing,
        hasInvoiceEvidence
          ? {
              facturaId: primaryInvoiceId,
              invoiceId: primaryInvoiceId,
              numeroFacturaLegal,
              total: finalAmount,
              amount: finalAmount,
              currency,
            }
          : null
      ),

      invoices: safeArray(first(source.invoices, raw.invoices, normalizedInvoices)),
      facturas: safeArray(first(source.facturas, raw.facturas, normalizedInvoices)),
      facturasRelacionadas: safeArray(
        first(source.facturasRelacionadas, raw.facturasRelacionadas, normalizedInvoices)
      ),

      facturasTotal: finalAmount,
      invoicesTotal: finalAmount,
      importeFacturas: finalAmount,
      invoiceTotal: finalAmount,

      facturaTotal: finalAmount,
      facturaImporte: finalAmount,
      importeFactura: finalAmount,
      totalFactura: finalAmount,
      invoiceAmount: finalAmount,

      total: finalAmount,
      amount: finalAmount,
      importe: finalAmount,
      price: finalAmount,

      currency,
      moneda: currency,
      facturaCurrency: currency,
      facturaMoneda: currency,

      meta: nextMeta,
    };
  }

  /* =========================================================
     STORE / DETAIL MERGE
  ========================================================= */

  function getRawItems() {
    try {
      return safeArray(getIncidencias());
    } catch {
      return [];
    }
  }

  function getPayloadRawItems() {
    return extractItemsFromPayload(lastApiPayload);
  }

  function getItems() {
    try {
      const storeRawItems = getRawItems();
      const payloadRawItems = getPayloadRawItems();

      const rawById = makeRawMap(payloadRawItems, storeRawItems);

      const baseItems = storeRawItems.length
        ? storeRawItems
        : payloadRawItems;

      const normalizedItems = safeArray(
        normalizeIncidenciasCollection(baseItems)
      );

      const patchedItems = normalizedItems.map((item, index) => {
        const id = getStableTicketId(item);

        const matchingRaw =
          rawById.get(id) ||
          payloadRawItems[index] ||
          storeRawItems[index] ||
          {};

        return preserveInvoiceAmountFields(item, matchingRaw);
      });

      const sorted = sortIncidenciasByUpdatedDesc(patchedItems);

      return safeArray(sorted);
    } catch (error) {
      safeWarn("getItems falló:", error);
      return [];
    }
  }

  function findTicketById(ticketId = "") {
    const id = safeText(ticketId, "");

    if (!id) return null;

    return (
      getItems().find((item) =>
        getTicketIdentityList(item).some((candidate) =>
          sameTicketIdentity(candidate, id)
        )
      ) || null
    );
  }

  function findTicketForDetail(detail = {}, preferredId = "") {
    const remote = safeObject(detail);

    const preferred = safeText(preferredId, "");
    if (preferred) {
      const byPreferred = findTicketById(preferred);
      if (byPreferred) return byPreferred;
    }

    const remoteIds = getTicketIdentityList(remote);

    for (const id of remoteIds) {
      const found = findTicketById(id);
      if (found) return found;
    }

    return null;
  }

  function mergeTicketDetailWithStoreSnapshot(detail = {}, preferredTicketId = "") {
    const remote = safeObject(detail);

    if (!hasOwnKeys(remote)) {
      return null;
    }

    const storeItem = findTicketForDetail(remote, preferredTicketId);

    if (!storeItem) {
      return preserveInvoiceAmountFields(remote, remote.raw || remote);
    }

    const storeEnriched = preserveInvoiceAmountFields(
      storeItem,
      storeItem?.raw || storeItem
    );

    const id = safeText(
      first(
        remote.ticketId,
        remote.id,
        remote.code,
        remote.ticketCode,
        remote.incidenciaId,
        storeEnriched.ticketId,
        storeEnriched.id,
        storeEnriched.code,
        storeEnriched.ticketCode,
        preferredTicketId
      ),
      ""
    );

    const preliminary = {
      ...storeEnriched,
      ...remote,

      id: safeText(first(remote.id, id), id),
      ticketId: safeText(first(remote.ticketId, id), id),
      incidenciaId: safeText(first(remote.incidenciaId, id), id),
      code: safeText(first(remote.code, remote.ticketCode, id), id),
      ticketCode: safeText(first(remote.ticketCode, remote.code, id), id),

      raw: {
        ...safeObject(storeEnriched.raw),
        ...safeObject(remote.raw || remote),

        id: safeText(first(remote.raw?.id, remote.id, id), id),
        ticketId: safeText(first(remote.raw?.ticketId, remote.ticketId, id), id),
        incidenciaId: safeText(
          first(remote.raw?.incidenciaId, remote.incidenciaId, id),
          id
        ),
        code: safeText(first(remote.raw?.code, remote.code, id), id),
        ticketCode: safeText(
          first(remote.raw?.ticketCode, remote.ticketCode, id),
          id
        ),
      },

      meta: {
        ...safeObject(storeEnriched.meta),
        ...safeObject(storeEnriched.raw?.meta),
        ...safeObject(remote.raw?.meta),
        ...safeObject(remote.meta),
      },
    };

    return preserveInvoiceAmountFields(
      preliminary,
      preliminary.raw || storeEnriched.raw || storeEnriched
    );
  }

  /* =========================================================
     STATE HELPERS
  ========================================================= */

  function ensureBaseState() {
    try {
      if (!Number.isFinite(Number(incidenciasState.page))) {
        setPage(1);
      }

      if (!Number.isFinite(Number(incidenciasState.pageSize))) {
        setPageSize(PAGE_SIZE);
      }

      if (safeNumber(incidenciasState.pageSize, 0) <= 0) {
        setPageSize(PAGE_SIZE);
      }
    } catch {
      incidenciasState.page = Math.max(1, safeNumber(incidenciasState.page, 1));
      incidenciasState.pageSize = Math.max(
        1,
        safeNumber(incidenciasState.pageSize, PAGE_SIZE)
      );
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

    syncFilterRuntime({
      filter: getCurrentFilter(),
      searchQuery: getCurrentSearchQuery(),
    });

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

  function markLoadedOk(items = [], remoteCountFallback = null) {
    const total = Math.max(
      safeArray(items).length,
      safeNumber(incidenciasState.remoteCount, safeArray(items).length),
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
      markIdle();
    }

    return total;
  }

  function getPaginationMeta(items = []) {
    const page = safeNumber(incidenciasState.page, 1);
    const pageSize = safeNumber(incidenciasState.pageSize, PAGE_SIZE);
    const visibleItems = getFilteredItems(items);

    return paginateIncidencias(
      visibleItems,
      page,
      pageSize || PAGE_SIZE
    );
  }

  function clampPageAgainstItems(items = []) {
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

    try {
      if (getItems().length) {
        setHydrated(true);
        setLoaded(true);
        hydrated = true;
      }
    } catch {}

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

  /* =========================================================
     APP READY HARDENING
  ========================================================= */

  function isDomReady() {
    return Boolean(
      typeof document !== "undefined" &&
        document.body &&
        document.readyState !== "loading"
    );
  }

  function isAppReady() {
    return Boolean(
      AppCore?.state?.ready ||
        AppCore?.state?.bootCompleted ||
        AppCore?.state?.appReady ||
        AppCore?.state?.authenticated !== undefined
    );
  }

  function canInteract() {
    return !destroyed && isDomReady() && isAppReady();
  }

  function throttleCreateClick() {
    const now = Date.now();

    if (now - lastCreateClickAt < CREATE_CLICK_THROTTLE_MS) {
      return false;
    }

    lastCreateClickAt = now;
    return true;
  }

  function throttleOpenTicketClick() {
    const now = Date.now();

    if (now - lastOpenTicketClickAt < OPEN_TICKET_THROTTLE_MS) {
      return false;
    }

    lastOpenTicketClickAt = now;
    return true;
  }

  /* =========================================================
     MODAL BRIDGES
  ========================================================= */

  function openTicketModalBridge(detail = null) {
    const payload = safeObject(detail);

    if (!hasOwnKeys(payload)) {
      return false;
    }

    try {
      if (typeof OnionIncidenciasModal?.getState === "function") {
        const modalStateSnapshot = OnionIncidenciasModal.getState();

        if (
          modalStateSnapshot?.isOpen &&
          typeof OnionIncidenciasModal.update === "function"
        ) {
          OnionIncidenciasModal.update(payload);
          return true;
        }

        if (typeof OnionIncidenciasModal.open === "function") {
          OnionIncidenciasModal.open(payload);
          return true;
        }
      }
    } catch (error) {
      safeWarn("OnionIncidenciasModal import directo falló:", error);
    }

    try {
      const modal = window?.OnionIncidenciasModal;

      if (
        modal?.getState?.()?.isOpen &&
        typeof modal.update === "function"
      ) {
        modal.update(payload);
        return true;
      }

      if (typeof modal?.open === "function") {
        modal.open(payload);
        return true;
      }
    } catch (error) {
      safeWarn("OnionIncidenciasModal hook global falló:", error);
    }

    try {
      const hook =
        window?.renderIncidenciaTicketModal ||
        window?.renderTicketModal;

      if (typeof hook === "function") {
        hook(payload);
        return true;
      }
    } catch (error) {
      safeWarn("ticket modal hook legacy falló:", error);
    }

    safeEmit("incidencias:modal:open", {
      detail: payload,
      ticketId: getStableTicketId(payload),
      source: "incidenciasView:fallback",
    });

    return true;
  }

  function closeTicketModalBridge() {
    try {
      if (typeof OnionIncidenciasModal?.close === "function") {
        OnionIncidenciasModal.close();
        return true;
      }
    } catch {}

    try {
      if (typeof window?.OnionIncidenciasModal?.close === "function") {
        window.OnionIncidenciasModal.close();
        return true;
      }
    } catch {}

    safeEmit("incidencias:modal:close", {
      source: "incidenciasView",
    });

    return true;
  }

  function updateTicketModalBridge(detail = {}) {
    const payload = safeObject(detail);

    try {
      if (typeof OnionIncidenciasModal?.update === "function") {
        OnionIncidenciasModal.update(payload);
        return true;
      }
    } catch {}

    try {
      if (typeof window?.OnionIncidenciasModal?.update === "function") {
        window.OnionIncidenciasModal.update(payload);
        return true;
      }
    } catch {}

    return openTicketModalBridge(payload);
  }

  function openCreateModalBridge(draft = {}) {
    const payload = safeObject(draft);

    try {
      const modal = window?.OnionIncidenciasCreateModal;

      if (typeof modal?.open === "function") {
        modal.open(payload);
        return true;
      }
    } catch (error) {
      safeWarn("OnionIncidenciasCreateModal hook falló:", error);
    }

    try {
      const hook =
        window?.renderIncidenciasCreateModal ||
        window?.renderIncidenciaCreateModal ||
        IncidenciasCreateView?.open;

      if (typeof hook === "function") {
        hook(payload);
        return true;
      }
    } catch (error) {
      safeWarn("create modal hook falló:", error);
    }

    safeEmit("incidencias:create-modal:open", {
      draft: payload,
      source: "incidenciasView:fallback",
    });

    return true;
  }

  function flushPendingCreate() {
    if (!pendingCreateRequest) return false;
    if (!canInteract()) return false;

    pendingCreateRequest = false;
    lastCreateClickAt = 0;

    try {
      setCreating(false);
    } catch {
      incidenciasState.creating = false;
    }

    void handleCreateIncidencia({
      skipThrottle: true,
      fromPending: true,
    });

    return true;
  }

  /* =========================================================
     DOM POST-RENDER
  ========================================================= */

  function applyErrorStateToDom(container) {
    if (!container) return;

    const oldBanner = container.querySelector(
      "[data-incidencias-error-banner='true']"
    );

    if (oldBanner) {
      oldBanner.remove();
    }

    const message = safeText(incidenciasState.error, "");
    if (!message) return;

    const anchor =
      container.querySelector(".incidencias-history-head") ||
      container.querySelector("[data-incidencias-history-head='true']") ||
      container.querySelector("[data-incidencias-table-head='true']") ||
      container.querySelector(".content-wrapper");

    if (!anchor) return;

    const banner = document.createElement("div");

    banner.className = "incidencias-error-banner";
    banner.setAttribute("data-incidencias-error-banner", "true");
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.textContent = message;

    anchor.insertAdjacentElement("afterend", banner);
  }

  function decorateDom(container) {
    if (!container) return container;

    applyErrorStateToDom(container);

    return container;
  }

  /* =========================================================
     TEMPLATE
  ========================================================= */

  function buildHtml() {
    ensureBaseState();

    const allItems = getItems();

    syncFilterRuntime({
      filter: getCurrentFilter(),
      searchQuery: getCurrentSearchQuery(),
    });

    const currentFilter = getCurrentFilter();
    const currentSearchQuery = getCurrentSearchQuery();

    const pagination = clampPageAgainstItems(allItems);

    const remoteCount = Math.max(
      allItems.length,
      safeNumber(incidenciasState.remoteCount, allItems.length)
    );

    const totalCount = remoteCount;

    return `
      <section
        class="panel-content dashboard ready"
        data-view="incidencias"
        data-incidencias-scope="${SCOPE}"
      >
        <div class="content-wrapper incidencias-view-shell">
          ${renderIncidenciasTableTemplate({
            items: allItems,
            totalCount,
            remoteCount,
            page: pagination.page,
            pageSize: pagination.pageSize,
            totalPages: pagination.totalPages,
            lastUpdatedAt: incidenciasState.lastSyncAt || "",
            title: "Tus incidencias y solicitudes",
            subtitle:
              "Consulta el estado de tus incidencias, revisa las actualizaciones más recientes y crea nuevas solicitudes desde una vista clara, cercana y fácil de seguir.",

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
              totalCount,
              remoteCount,
              selectedTicketId: safeText(incidenciasState.selectedTicketId, ""),
              openingTicketId: safeText(incidenciasState.openingTicketId, ""),
              creating: Boolean(incidenciasState.creating),
              loading: Boolean(incidenciasState.loading),
              refreshing: Boolean(incidenciasState.refreshing),

              filter: currentFilter,
              activeFilter: currentFilter,
              statusFilter: currentFilter,
              search: currentSearchQuery,
              searchQuery: currentSearchQuery,
              filterQuery: currentSearchQuery,
              query: currentSearchQuery,
              q: currentSearchQuery,
            },
          })}
        </div>
      </section>
    `;
  }

  /* =========================================================
     RENDER
  ========================================================= */

  function render() {
    const container = getContainer();

    if (!container) {
      safeWarn("No existe #view-container para renderizar incidencias.");
      return null;
    }

    if (destroyed) return null;

    ensureBaseState();

    try {
      AppCore?.setDocumentTitle?.("Incidencias");
    } catch {}

    try {
      AppCore?.clearDynamicContainers?.();
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
    if (destroyed) return null;

    cancelPendingRender();

    const container = render();

    if (!destroyed) {
      bind();
    }

    return container;
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

  /* =========================================================
     DATA
  ========================================================= */

  async function loadData({
    force = false,
    silent = false,
    asRefresh = false,
  } = {}) {
    if (destroyed) return getItems();

    const itemsBefore = getItems();
    const hasVisibleData = itemsBefore.length > 0;

    try {
      clearError();

      if (!hasVisibleData && !silent) {
        setLoading(true);
      } else if (asRefresh) {
        setRefreshing(true);
      }
    } catch {
      incidenciasState.error = "";
      incidenciasState.loading = !hasVisibleData && !silent;
      incidenciasState.refreshing = hasVisibleData && asRefresh;
    }

    if (!destroyed) {
      rerender();
    }

    try {
      const payload = await loadIncidencias({
        force,
      });

      lastApiPayload = payload || lastApiPayload;

      const payloadRemoteCount = extractRemoteCountFromPayload(
        payload,
        getItems().length
      );

      if (payloadRemoteCount > 0) {
        try {
          setRemoteCount(payloadRemoteCount);
        } catch {
          incidenciasState.remoteCount = payloadRemoteCount;
        }
      }

      const itemsAfter = getItems();

      markLoadedOk(itemsAfter, payloadRemoteCount);

      try {
        touchLastSyncAt();
      } catch {
        try {
          setLastSyncAt(Date.now());
        } catch {
          incidenciasState.lastSyncAt = Date.now();
        }
      }

      persistCacheBestEffort();

      safeEmit("incidencias:loaded", {
        items: itemsAfter,
        payload,
        force,
        silent,
        asRefresh,
      });

      return itemsAfter;
    } catch (error) {
      const message = safeErrorMessage(error);

      try {
        setError(message);
        setLoaded(true);
      } catch {
        incidenciasState.error = message;
        incidenciasState.loaded = true;
        incidenciasState.hydrated = true;
        markIdle();
      }

      if (!silent) {
        showToast(message, "error");
      }

      safeEmit("incidencias:load:error", {
        error,
        message,
      });

      return getItems();
    } finally {
      markIdle();
    }
  }

  async function renderAndLoad({
    force = false,
    asRefresh = false,
    silent = false,
  } = {}) {
    const token = nextRenderToken();

    hydrateBestEffort();
    ensureBaseState();

    render();

    if (!destroyed) {
      bind();
    }

    flushPendingCreate();

    await loadData({
      force,
      silent,
      asRefresh,
    });

    if (!isActiveToken(token)) {
      return api;
    }

    render();

    if (!destroyed) {
      bind();
    }

    flushPendingCreate();

    return api;
  }

  /* =========================================================
     ACTIONS
  ========================================================= */

  function goToPage(page = 1) {
    if (incidenciasState.loading || incidenciasState.refreshing) {
      return incidenciasState.page || 1;
    }

    const items = getFilteredItems(getItems());

    const pagination = paginateIncidencias(
      items,
      page,
      incidenciasState.pageSize || PAGE_SIZE
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
    return goToPage((incidenciasState.page || 1) - 1);
  }

  function goNextPage() {
    return goToPage((incidenciasState.page || 1) + 1);
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

  async function handleOpenTicket(ticketId = "", options = {}) {
    const id = safeText(ticketId, "");
    const opts = safeObject(options);

    if (!id) return null;

    if (!opts.skipThrottle && !throttleOpenTicketClick()) {
      return null;
    }

    if (
      incidenciasState.openingTicketId &&
      !sameTicketIdentity(incidenciasState.openingTicketId, id)
    ) {
      return null;
    }

    incidenciasState.selectedTicketId = id;

    try {
      setOpeningTicketId(id);
    } catch {
      incidenciasState.openingTicketId = id;
    }

    const payloadDetail = safeObject(
      first(
        opts.detail,
        opts.payload?.detail,
        opts.payload?.ticket,
        opts.payload?.incidencia,
        opts.payload?.item,
        opts.payload
      )
    );

    const storeSnapshot = findTicketById(id);
    const immediateDetail = mergeTicketDetailWithStoreSnapshot(
      hasOwnKeys(payloadDetail) ? payloadDetail : storeSnapshot || {},
      id
    );

    if (immediateDetail && opts.openImmediate !== false) {
      openTicketModalBridge({
        ...immediateDetail,
        meta: {
          ...safeObject(immediateDetail.meta),
          openingFromView: true,
          detailLoading: true,
        },
      });
    }

    rerender();
    await waitForPaint();

    try {
      const detail = await openTicketAction({
        ticketId: id,
        preferFresh: opts.preferFresh !== false,
        silent: opts.silent !== false,
      });

      const patchedDetail = detail
        ? mergeTicketDetailWithStoreSnapshot(detail, id)
        : immediateDetail;

      if (!patchedDetail) {
        showToast("No se pudo abrir la incidencia.", "error");
        return null;
      }

      updateTicketModalBridge({
        ...patchedDetail,
        meta: {
          ...safeObject(patchedDetail.meta),
          openingFromView: false,
          detailLoading: false,
        },
      });

      safeEmit("incidencias:open:success", {
        ticketId: id,
        incidenciaId: id,
        detail: patchedDetail,
        source: safeText(opts.source, "view"),
      });

      return patchedDetail;
    } catch (error) {
      safeWarn("handleOpenTicket falló:", error);

      if (immediateDetail) {
        updateTicketModalBridge({
          ...immediateDetail,
          meta: {
            ...safeObject(immediateDetail.meta),
            openingFromView: false,
            detailLoading: false,
            detailFallback: true,
          },
        });

        safeEmit("incidencias:open:fallback", {
          ticketId: id,
          incidenciaId: id,
          detail: immediateDetail,
          error,
        });

        showToast(
          "Incidencia abierta con datos locales. No se pudo cargar el detalle remoto.",
          "warning"
        );

        return immediateDetail;
      }

      safeEmit("incidencias:open:error", {
        ticketId: id,
        incidenciaId: id,
        error,
      });

      showToast("No se pudo abrir la incidencia.", "error");
      return null;
    } finally {
      try {
        setOpeningTicketId("");
      } catch {
        incidenciasState.openingTicketId = "";
      }

      if (!destroyed) rerender();
    }
  }

  async function handleRefreshTicketFromModal(ticketId = "") {
    const id = safeText(ticketId, "");
    if (!id) return null;

    try {
      const detail = await refreshTicketDetailAction({
        ticketId: id,
        silent: true,
      });

      if (detail) {
        const patchedDetail = mergeTicketDetailWithStoreSnapshot(detail, id);

        updateTicketModalBridge(patchedDetail);

        safeEmit("incidencias:modal:refresh:success", {
          ticketId: id,
          incidenciaId: id,
          detail: patchedDetail,
        });

        return patchedDetail;
      }

      return null;
    } catch (error) {
      safeWarn("handleRefreshTicketFromModal falló:", error);
      showToast("No se pudo actualizar la incidencia.", "error");

      safeEmit("incidencias:modal:refresh:error", {
        ticketId: id,
        incidenciaId: id,
        error,
      });

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
      safeWarn("handleCopyTicketId falló:", error);
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
      safeWarn("handleExportCsv falló:", error);
      showToast("No se pudo exportar el historial.", "error");
      return false;
    }
  }

  async function handleCreateIncidencia(options = {}) {
    const opts = safeObject(options);
    const skipThrottle = Boolean(opts.skipThrottle);

    if (incidenciasState.creating && !pendingCreateRequest) {
      return false;
    }

    if (!skipThrottle && !throttleCreateClick()) {
      return false;
    }

    if (!canInteract()) {
      pendingCreateRequest = true;

      try {
        setCreating(true);
      } catch {
        incidenciasState.creating = true;
      }

      rerender();

      showToast("Preparando formulario...", "info");

      return false;
    }

    pendingCreateRequest = false;

    try {
      setCreating(true);
    } catch {
      incidenciasState.creating = true;
    }

    rerender();
    await waitForPaint();

    try {
      const opened = openCreateModalBridge(opts.draft || {});

      if (!opened) {
        showToast("No se pudo abrir el formulario.", "error");
      }

      safeEmit("incidencias:create:open", {
        draft: opts.draft || {},
      });

      return opened;
    } finally {
      try {
        setCreating(false);
      } catch {
        incidenciasState.creating = false;
      }

      if (!destroyed) rerender();
    }
  }

  /* =========================================================
     SEARCH / GLOBAL OPEN BRIDGE
  ========================================================= */

  async function openTicketFromExternalRequest(payload = {}) {
    const source = extractExternalOpenPayload(payload);
    const ticketId = getTicketIdFromExternalPayload(source);

    if (!ticketId) {
      showToast("No se pudo identificar la incidencia.", "error");
      return null;
    }

    if (
      inflightExternalOpen &&
      inflightExternalOpenTicketId &&
      sameTicketIdentity(inflightExternalOpenTicketId, ticketId)
    ) {
      return inflightExternalOpen;
    }

    inflightExternalOpenTicketId = ticketId;

    inflightExternalOpen = (async () => {
      if (!getItems().length && !incidenciasState.loaded) {
        await reload({
          force: false,
          silent: true,
          asRefresh: false,
        });
      }

      const result = await handleOpenTicket(ticketId, {
        skipThrottle: true,
        source: safeText(source.source, "external"),
        payload: source,
        detail: first(
          source.detail,
          source.ticket,
          source.incidencia,
          source.item,
          source
        ),
      });

      if (result) {
        safeEmit("incidencias:opened-from-external", {
          source: safeText(source.source, "external"),
          ticketId,
          incidenciaId: ticketId,
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
      inflightExternalOpenTicketId = "";
    }
  }

  async function openTicketFromLocationOnce() {
    const ticketId = getTicketIdFromLocation();

    if (!ticketId) return null;

    if (
      lastAutoOpenedTicketId === ticketId &&
      sameTicketIdentity(incidenciasState.selectedTicketId, ticketId)
    ) {
      clearTicketIdFromLocation();
      return findTicketById(ticketId);
    }

    lastAutoOpenedTicketId = ticketId;

    const result = await openTicketFromExternalRequest({
      source: "location",
      ticketId,
    });

    clearTicketIdFromLocation();

    return result;
  }

  function registerIncidenciasBridge() {
    const bridge = {
      open(payload = {}) {
        return openTicketFromExternalRequest(payload);
      },

      openById(ticketId = "") {
        return openTicketFromExternalRequest({ ticketId });
      },

      close() {
        return closeTicketModalBridge();
      },

      refresh(options = {}) {
        return reload({
          force: true,
          silent: Boolean(options.silent),
          asRefresh: true,
        });
      },

      create(draft = {}) {
        return handleCreateIncidencia({
          draft,
          skipThrottle: true,
        });
      },

      setFilter(filter = DEFAULT_FILTER) {
        return setFilter(filter);
      },

      setSearchQuery(query = "") {
        return setSearchQuery(query);
      },

      clearFilters() {
        return clearFilters();
      },

      clearSearch() {
        return clearSearchOnly();
      },

      getState() {
        return api.getState();
      },
    };

    try {
      if (!AppCore.modules || typeof AppCore.modules !== "object") {
        AppCore.modules = {};
      }

      AppCore.modules.Incidencias = api;
      AppCore.modules.IncidenciasView = api;
      AppCore.modules.OnionIncidenciasUI = api;
      AppCore.modules.OnionIncidenciasBridge = bridge;
      AppCore.modules.OnionIncidenciaBridge = bridge;
    } catch {}

    try {
      window.OnionIncidenciasUI = api;
      window.OnionIncidenciasView = api;
      window.IncidenciasView = api;

      window.OnionIncidenciasBridge = bridge;
      window.OnionIncidenciaBridge = bridge;
      window.IncidenciasBridge = bridge;
      window.IncidenciaBridge = bridge;

      window.openIncidenciaModal = (payload = {}) =>
        openTicketFromExternalRequest(payload);

      window.openIncidenciaFicha = (payload = {}) =>
        openTicketFromExternalRequest(payload);

      window.openTicketModal = (payload = {}) =>
        openTicketFromExternalRequest(payload);

      window.openTicketFicha = (payload = {}) =>
        openTicketFromExternalRequest(payload);

      window.renderIncidenciaModal = (payload = {}) =>
        openTicketFromExternalRequest(payload);
    } catch {}

    return true;
  }

  function attachExternalOpenListener() {
    cleanupExternalOpenListener();

    const cleanups = TICKET_OPEN_EVENTS.map((eventName) =>
      safeOn(eventName, async (eventOrPayload) => {
        if (destroyed) return;

        const payload = extractExternalOpenPayload(eventOrPayload);

        if (payload.source === "incidenciasView:fallback") {
          return;
        }

        await openTicketFromExternalRequest({
          ...payload,
          source: safeText(payload.source, eventName),
        });
      })
    );

    externalOpenCleanup = () => {
      cleanups.forEach((cleanup) => {
        try {
          cleanup?.();
        } catch {}
      });
    };
  }

  function attachMutationListeners() {
    cleanupMutationListeners();

    const onMutated = async (eventOrPayload = {}) => {
      if (destroyed) return;

      const payload = extractExternalOpenPayload(eventOrPayload);

      await reload({
        force: true,
        asRefresh: true,
        silent: payload.silent !== false,
      });
    };

    const onRefresh = async (eventOrPayload = {}) => {
      if (destroyed) return;

      const payload = extractExternalOpenPayload(eventOrPayload);

      await handleRefreshTicketFromModal(
        first(
          payload.ticketId,
          payload.incidenciaId,
          payload.id,
          payload.detail?.ticketId,
          payload.detail?.id,
          ""
        )
      );
    };

    const onCopy = async (eventOrPayload = {}) => {
      if (destroyed) return;

      const payload = extractExternalOpenPayload(eventOrPayload);

      await handleCopyTicketId(
        first(
          payload.ticketId,
          payload.incidenciaId,
          payload.id,
          payload.detail?.ticketId,
          payload.detail?.id,
          ""
        )
      );
    };

    const cleanups = [
      safeOn("incidencias:modal:refresh", onRefresh),
      safeOn("incidencias:modal:copy", onCopy),
      ...MUTATION_EVENTS.map((eventName) => safeOn(eventName, onMutated)),
    ];

    mutationCleanup = () => {
      cleanups.forEach((cleanup) => {
        try {
          cleanup?.();
        } catch {}
      });
    };
  }

  function attachCreateSuccessListener() {
    cleanupCreateSuccessListener();

    const onCreated = async (eventOrPayload = {}) => {
      if (destroyed) return;

      const payload = extractExternalOpenPayload(eventOrPayload);

      try {
        await reload({
          force: true,
          asRefresh: true,
          silent: true,
        });

        const ticketId = getTicketIdFromExternalPayload(payload);

        if (ticketId && payload.openAfterCreate !== false) {
          await openTicketFromExternalRequest({
            ...payload,
            ticketId,
            source: "create-success",
          });
        }
      } catch {
        showToast(
          "Incidencia creada, pero no se pudo refrescar el historial.",
          "warning"
        );
      }
    };

    createSuccessCleanup = safeOn("incidencias:create:success", onCreated);
  }

  function attachReadyListeners() {
    cleanupReadyListeners();

    const onReady = () => {
      flushPendingCreate();
    };

    const cleanups = READY_EVENTS.map((eventName) =>
      safeOn(eventName, onReady)
    );

    readyCleanup = () => {
      cleanups.forEach((cleanup) => {
        try {
          cleanup?.();
        } catch {}
      });
    };
  }

  /* =========================================================
     BINDINGS
  ========================================================= */

  function getActionTarget(event, actions = []) {
    const selectors = actions
      .map((action) => {
        return [
          `[data-incidencias-action="${action}"]`,
          `[data-action="${action}"]`,
        ].join(",");
      })
      .join(",");

    if (!selectors) return null;

    return event.target?.closest?.(selectors) || null;
  }

  function getSearchFieldTarget(event) {
    return (
      event.target?.closest?.("#incidencias-search-input") ||
      event.target?.closest?.("#incidencias-filter-search") ||
      event.target?.closest?.("[data-incidencias-search-input='true']") ||
      event.target?.closest?.("[data-incidencias-action='search']") ||
      event.target?.closest?.("[data-action='search-incidencias']") ||
      event.target?.closest?.("[data-incidencias-action='filter-search']") ||
      event.target?.closest?.("[data-action='filter-search']") ||
      null
    );
  }

  function getTicketIdFromElement(element = null) {
    if (!element) return "";

    const closestRow =
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

        closestRow?.dataset?.ticketId,
        closestRow?.dataset?.incidenciaId,
        closestRow?.dataset?.ticketCode,

        closestRow?.getAttribute?.("data-ticket-id"),
        closestRow?.getAttribute?.("data-incidencia-id"),
        closestRow?.getAttribute?.("data-ticket-code")
      ),
      ""
    );
  }

  function bindNativeActions(container) {
    if (!container) {
      return () => {};
    }

    const onClick = async (event) => {
      if (destroyed) return;

      const filterBtn = getActionTarget(event, [
        "filter",
        "filter-incidencias",
        "status-filter",
        "incidencias-filter",
      ]);

      if (filterBtn) {
        event.preventDefault();
        event.stopPropagation();

        const filter = first(
          filterBtn.dataset?.filter,
          filterBtn.dataset?.filterStatus,
          filterBtn.getAttribute?.("data-filter"),
          filterBtn.getAttribute?.("data-filter-status"),
          DEFAULT_FILTER
        );

        setFilter(filter);
        return;
      }

      const clearSearchBtn = getActionTarget(event, [
        "clear-filter-search",
        "clear-search",
      ]);

      if (clearSearchBtn) {
        event.preventDefault();
        event.stopPropagation();

        clearSearchOnly();
        return;
      }

      const clearFiltersBtn = getActionTarget(event, [
        "clear-filters",
        "reset-filters",
        "filters-clear",
      ]);

      if (clearFiltersBtn) {
        event.preventDefault();
        event.stopPropagation();

        clearFilters();
        return;
      }

      const detailBtn = getActionTarget(event, [
        "detail",
        "open",
        "open-ticket",
        "view-ticket",
      ]);

      if (detailBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleOpenTicket(getTicketIdFromElement(detailBtn));
        return;
      }

      const copyBtn = getActionTarget(event, [
        "copy",
        "copy-ticket-id",
        "copy-id",
      ]);

      if (copyBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleCopyTicketId(getTicketIdFromElement(copyBtn));
        return;
      }

      const pageBtn = getActionTarget(event, [
        "page",
        "go-page",
      ]);

      if (pageBtn) {
        event.preventDefault();

        const page = safeNumber(
          first(
            pageBtn.dataset?.page,
            pageBtn.getAttribute?.("data-page")
          ),
          incidenciasState.page || 1
        );

        goToPage(page);
        return;
      }

      const prevBtn = getActionTarget(event, [
        "prev-page",
        "pagination-prev",
      ]);

      if (prevBtn) {
        event.preventDefault();
        goPrevPage();
        return;
      }

      const nextBtn = getActionTarget(event, [
        "next-page",
        "pagination-next",
      ]);

      if (nextBtn) {
        event.preventDefault();
        goNextPage();
        return;
      }

      const exportBtn =
        getActionTarget(event, [
          "export",
          "export-csv",
        ]) ||
        event.target?.closest?.("#incidencias-export-btn");

      if (exportBtn) {
        event.preventDefault();
        handleExportCsv();
        return;
      }

      const createBtn =
        getActionTarget(event, [
          "create",
          "new",
          "new-ticket",
          "create-ticket",
          "create-incidencia",
        ]) ||
        event.target?.closest?.("#incidencias-create-btn");

      if (createBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleCreateIncidencia();
        return;
      }

      const retryBtn =
        getActionTarget(event, [
          "retry",
        ]) ||
        event.target?.closest?.("#incidencias-retry-btn");

      if (retryBtn) {
        event.preventDefault();

        await reload({
          force: true,
          asRefresh: false,
        });

        return;
      }

      const refreshBtn =
        getActionTarget(event, [
          "refresh",
          "reload",
        ]) ||
        event.target?.closest?.("#incidencias-refresh-btn");

      if (refreshBtn) {
        event.preventDefault();

        await reload({
          force: true,
          asRefresh: true,
        });
      }
    };

    const onInput = (event) => {
      if (destroyed) return;

      const searchField = getSearchFieldTarget(event);

      if (!searchField) return;

      scheduleSearchQuery(searchField.value);
    };

    const onChange = (event) => {
      if (destroyed) return;

      const searchField = getSearchFieldTarget(event);

      if (searchField) {
        clearFilterSearchTimer();
        setSearchQuery(searchField.value);
        return;
      }

      const pageSizeField =
        event.target?.closest?.("[data-incidencias-field='page-size']") ||
        event.target?.closest?.("[data-field='page-size']");

      if (pageSizeField) {
        changePageSize(pageSizeField.value);
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

  function bind() {
    cleanupBindings();

    if (destroyed) return;

    registerIncidenciasBridge();

    const container = getContainer();
    const cleanups = [];

    cleanups.push(bindNativeActions(container));

    bindingsCleanup = () => {
      for (const cleanup of cleanups) {
        try {
          cleanup?.();
        } catch {}
      }
    };

    attachExternalOpenListener();
    attachMutationListeners();
    attachCreateSuccessListener();
    attachReadyListeners();
  }

  /* =========================================================
     PUBLIC
  ========================================================= */

  async function reload(options = {}) {
    if (destroyed) return api;

    const incomingOptions = safeObject(options);

    if (inflightReload) {
      queuedReloadOptions = {
        ...(queuedReloadOptions || {}),
        ...incomingOptions,
        force: Boolean(queuedReloadOptions?.force || incomingOptions.force),
        asRefresh: Boolean(
          queuedReloadOptions?.asRefresh || incomingOptions.asRefresh
        ),
        silent: Boolean(
          queuedReloadOptions?.silent ?? incomingOptions.silent
        ),
      };

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

  async function init() {
    if (destroyed) {
      destroyed = false;
    }

    if (inflightInit) {
      return inflightInit;
    }

    if (initialized && !destroyed) {
      registerIncidenciasBridge();
      ensureBaseState();
      rerender();
      flushPendingCreate();

      if (!incidenciasState.loaded && !inflightReload) {
        await reload({
          force: false,
          silent: true,
          asRefresh: false,
        });
      }

      await openTicketFromLocationOnce();

      return api;
    }

    initialized = true;

    registerIncidenciasBridge();

    inflightInit = (async () => {
      safeLog("init");

      hydrateBestEffort();

      await renderAndLoad({
        force: false,
        asRefresh: false,
        silent: false,
      });

      flushPendingCreate();

      await openTicketFromLocationOnce();

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
    clearFilterSearchTimer();

    cleanupBindings();

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

    pendingCreateRequest = false;
    queuedReloadOptions = null;

    inflightReload = null;
    inflightInit = null;
    inflightExternalOpen = null;
    inflightExternalOpenTicketId = "";

    try {
      IncidenciasCreateView?.close?.();
    } catch {}

    safeLog("destroy");
  }

  /* =========================================================
     API
  ========================================================= */

  const api = {
    init,
    mount: init,
    render: rerender,
    scheduleRender: scheduleRerender,
    reload,
    destroy,
    unmount: destroy,

    openTicket: handleOpenTicket,
    openTicketFromExternalRequest,
    openTicketFromLocationOnce,
    registerIncidenciasBridge,

    closeTicket: closeTicketModalBridge,
    copyTicketId: handleCopyTicketId,
    exportCsv: handleExportCsv,
    createIncidencia: handleCreateIncidencia,

    refreshTicketDetail: handleRefreshTicketFromModal,

    goToPage,
    goPrevPage,
    goNextPage,
    changePageSize,

    setFilter,
    setSearchQuery,
    clearFilters,
    clearSearchOnly,

    getItems: () => getItems(),
    getFilteredItems: () => getFilteredItems(getItems()),
    getPageItems: () => getPaginationMeta(getItems()).items,
    getPagination: () => getPaginationMeta(getItems()),

    getTicketById: (ticketId = "") =>
      findIncidenciaById(getItems(), ticketId) || findTicketById(ticketId),

    findTicketById,

    mergeTicketDetailWithStoreSnapshot,

    getState: () => {
      const allItems = getItems();
      const filteredItems = getFilteredItems(allItems);
      const pagination = getPaginationMeta(allItems);

      return {
        ...getIncidenciasStateSnapshot?.(),

        initialized,
        destroyed,

        hasInflightInit: Boolean(inflightInit),
        hasInflightReload: Boolean(inflightReload),
        hasQueuedReload: Boolean(queuedReloadOptions),
        hasInflightExternalOpen: Boolean(inflightExternalOpen),
        inflightExternalOpenTicketId,

        pendingCreateRequest,
        lastAutoOpenedTicketId,

        filter: getCurrentFilter(),
        activeFilter: getCurrentFilter(),
        statusFilter: getCurrentFilter(),
        search: getCurrentSearchQuery(),
        searchQuery: getCurrentSearchQuery(),
        filterQuery: getCurrentSearchQuery(),
        query: getCurrentSearchQuery(),

        lastApiPayloadHasItems: extractItemsFromPayload(lastApiPayload).length > 0,
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

  registerIncidenciasBridge();

  return api;
})();

export default IncidenciasView;
