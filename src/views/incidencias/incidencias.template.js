/* =========================================================
   Onion Support - Incidencias Template
   Archivo: /src/views/incidencias/incidencias.template.js

   Responsabilidad:
   - Render HTML puro de la vista Incidencias.
   - Header/hero, stats, filtros, búsqueda y listado.
   - Integrar modal de creación y modal de detalle.
   - Exponer data-action/data-field para index.js.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Store.
   - Sin State externo.
   - Sin Model externo.
   - Sin listeners.
   - Sin DOM API.
   - Sin Toast.
========================================================= */

import {
  renderIncidenciasCreateModal,
} from "./incidencias.template.create.js";

import {
  renderIncidenciasDetailModal,
} from "./incidencias.template.modal.js";

export const INCIDENCIAS_TEMPLATE_VERSION = "incidencias.template.v1";

export const INCIDENCIAS_ACTIONS = Object.freeze({
  REFRESH: "refresh",
  CREATE_OPEN: "create-open",

  FILTER: "filter",
  CLEAR_FILTERS: "clear-filters",
  CLEAR_SEARCH: "clear-search",

  OPEN_DETAIL: "open-detail",
  LOAD_MORE: "load-more",
});

const DEFAULT_ROUTE = "/incidencias";
const DEFAULT_VISIBLE_ROWS = 20;
const DEFAULT_CURRENCY = "EUR";

const FILTERS = Object.freeze([
  { key: "all", label: "Todas" },
  { key: "open", label: "Abiertas" },
  { key: "closed", label: "Cerradas" },
]);

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && !value.length) continue;
    if (isObject(value) && !Object.keys(value).length) continue;

    return value;
  }

  return null;
}

function number(value = 0, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string") {
    let clean = value
      .trim()
      .replace(/[€$£¥%]/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s+/g, "");

    if (!clean || clean === "-" || clean === "+") return fallback;

    const hasComma = clean.includes(",");
    const hasDot = clean.includes(".");

    if (hasComma && hasDot) {
      const lastComma = clean.lastIndexOf(",");
      const lastDot = clean.lastIndexOf(".");

      clean =
        lastComma > lastDot
          ? clean.replace(/\./g, "").replace(/,/g, ".")
          : clean.replace(/,/g, "");
    } else if (hasComma) {
      clean = clean.replace(/,/g, ".");
    }

    const parsed = Number(clean);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function attr(value = "") {
  return escapeHtml(cleanText(value, ""));
}

function htmlAttrs(attrs = {}) {
  return Object.entries(safeObject(attrs))
    .map(([key, value]) => {
      if (!key) return "";
      if (value === false || value === null || value === undefined) return "";
      if (value === true) return escapeHtml(key);

      return `${escapeHtml(key)}="${escapeHtml(value)}"`;
    })
    .filter(Boolean)
    .join(" ");
}

function joinClasses(...values) {
  return values
    .flat(Infinity)
    .map((value) => cleanText(value, ""))
    .filter(Boolean)
    .join(" ");
}

function normalizeText(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i.test(
    String(value || "")
  );
}

function safeImageSrc(value = "") {
  const raw = cleanText(value, "");

  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return "";
  if (hasSensitiveQuery(raw)) return "";

  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

/* =========================================================
   FORMATTERS
========================================================= */

function formatNumber(value = 0) {
  try {
    return new Intl.NumberFormat("es-ES").format(Number(value) || 0);
  } catch {
    return String(Number(value) || 0);
  }
}

function formatMoney(value = 0, currency = DEFAULT_CURRENCY) {
  const amount = number(value, NaN);

  if (!Number.isFinite(amount)) return "—";

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: cleanText(currency, DEFAULT_CURRENCY).toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2).replace(".", ",")} €`;
  }
}

function toTimestamp(value = null) {
  if (!value) return 0;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 0 : value.getTime();

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9999999999 ? value : value * 1000;
  }

  const raw = cleanText(value, "");

  if (!raw) return 0;

  const numeric = Number(raw);

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 9999999999 ? numeric : numeric * 1000;
  }

  const parsed = Date.parse(raw);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(value = null) {
  const timestamp = toTimestamp(value);

  if (!timestamp) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return "—";
  }
}

function formatDateShort(value = null) {
  const timestamp = toTimestamp(value);

  if (!timestamp) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(timestamp));
  } catch {
    return "—";
  }
}

function formatRelativeDate(value = null) {
  const timestamp = toTimestamp(value);

  if (!timestamp) return "Sin fecha";

  const diffMs = timestamp - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const absMin = Math.abs(diffMin);

  if (absMin < 1) return "Ahora mismo";
  if (absMin < 60) return diffMin > 0 ? `En ${absMin} min` : `Hace ${absMin} min`;

  const diffHours = Math.round(absMin / 60);

  if (diffHours < 24) {
    return diffMin > 0 ? `En ${diffHours} h` : `Hace ${diffHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);

  if (diffDays <= 7) {
    return diffMin > 0
      ? `En ${diffDays} día${diffDays === 1 ? "" : "s"}`
      : `Hace ${diffDays} día${diffDays === 1 ? "" : "s"}`;
  }

  return formatDateShort(value);
}

function formatLastUpdate(value = null) {
  const timestamp = toTimestamp(value);

  if (!timestamp) return "Sin fecha";

  const diffHours = Math.abs(Date.now() - timestamp) / 3600000;

  return diffHours <= 72 ? formatRelativeDate(value) : formatDateTime(value);
}

function formatBytes(bytes = 0) {
  const size = number(bytes, 0);

  if (!size || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function initialsFrom(value = "") {
  return (
    cleanText(value, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 2) || "ON"
  );
}

/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common =
    `aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  const icons = {
    refresh: `<svg ${common}><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>`,
    plus: `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
    ticket: `<svg ${common}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,
    eye: `<svg ${common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    paperclip: `<svg ${common}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.48-8.49"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    euro: `<svg ${common}><path d="M4 10h10"/><path d="M4 14h9"/><path d="M19 5a7.7 7.7 0 0 0-5.2-2C8.4 3 4 7 4 12s4.4 9 9.8 9a7.7 7.7 0 0 0 5.2-2"/></svg>`,
    activity: `<svg ${common}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
    filter: `<svg ${common}><path d="M22 3H2l8 9.46V19l4 2v-8.54Z"/></svg>`,
    chevronDown: `<svg ${common}><path d="m6 9 6 6 6-6"/></svg>`,
  };

  return icons[name] || "";
}

/* =========================================================
   ITEM PICKERS
========================================================= */

function getTicketId(item = {}) {
  return cleanText(
    first(
      item.ticketId,
      item.incidenciaId,
      item.code,
      item.numero,
      item.ticketCode,
      item.id
    ),
    "INC-SIN-ID"
  );
}

function getSubject(item = {}) {
  return cleanText(
    first(
      item.subject,
      item.title,
      item.asunto,
      item.name,
      item.preview
    ),
    "Incidencia sin asunto"
  );
}

function getDescription(item = {}) {
  return cleanText(
    first(
      item.description,
      item.descripcion,
      item.message,
      item.body,
      item.preview,
      item.text
    ),
    "Sin descripción."
  );
}

function getClientName(item = {}) {
  return cleanText(
    first(
      item.clientName,
      item.clienteNombre,
      item.requesterName,
      item.userName,
      item.name,
      item.requesterSnapshot?.displayName,
      item.requesterSnapshot?.name,
      item.cliente?.displayName,
      item.cliente?.name,
      item.client?.displayName,
      item.client?.name
    ),
    "Cliente"
  );
}

function getClientEmail(item = {}) {
  return cleanText(
    first(
      item.clientEmail,
      item.clienteEmail,
      item.email,
      item.emailCliente,
      item.requesterSnapshot?.email,
      item.cliente?.email,
      item.client?.email
    ),
    ""
  ).toLowerCase();
}

function getAvatarUrl(item = {}) {
  return safeImageSrc(
    first(
      item.clientAvatar,
      item.avatar,
      item.avatarUrl,
      item.requesterAvatarUrl,
      item.userAvatarUrl,
      item.requesterSnapshot?.avatarUrl,
      item.cliente?.avatarUrl,
      item.client?.avatarUrl
    )
  );
}

function getStatusRaw(item = {}) {
  return first(item.status, item.estado, item.state, item.lifecycle?.status, "open");
}

function getPriorityRaw(item = {}) {
  return first(item.priority, item.prioridad, item.severity, item.urgency, "medium");
}

function getStatusKey(value = "") {
  const key = normalizeKey(value);

  if (["open", "opened", "abierta", "abierto"].includes(key)) return "open";
  if (["pending", "pendiente", "new", "nueva", "nuevo"].includes(key)) return "pending";
  if (["in_progress", "progress", "inprogress", "proceso", "en_proceso", "working"].includes(key)) return "progress";
  if (["resolved", "resuelta", "resuelto", "solved"].includes(key)) return "resolved";
  if (["closed", "cerrada", "cerrado", "cancelled", "archived"].includes(key)) return "closed";

  return "pending";
}

function getStatusLabel(value = "") {
  const key = getStatusKey(value);

  if (key === "open") return "Abierta";
  if (key === "pending") return "Pendiente";
  if (key === "progress") return "En proceso";
  if (key === "resolved") return "Resuelta";
  if (key === "closed") return "Cerrada";

  return "Pendiente";
}

function getPriorityKey(item = {}) {
  const key = normalizeKey(getPriorityRaw(item));

  if (["critical", "critica", "crítica", "critico", "crítico", "p0"].includes(key)) {
    return "critical";
  }

  if (["urgent", "urgente", "high", "alta", "p1"].includes(key)) return "urgent";
  if (["low", "baja", "minor", "p3"].includes(key)) return "low";

  return "medium";
}

function getPriorityLabel(item = {}) {
  const key = getPriorityKey(item);

  if (key === "critical") return "Crítica";
  if (key === "urgent") return "Urgente";
  if (key === "low") return "Baja";

  return "Media";
}

function getCategory(item = {}) {
  return cleanText(
    first(
      item.category,
      item.categoria,
      item.type,
      item.tipo,
      item.subcategory,
      item.subcategoria
    ),
    "Soporte"
  );
}

function getAssignedTo(item = {}) {
  return cleanText(
    first(
      item.assignedToName,
      item.technicianName,
      item.tecnicoName,
      item.assignment?.assignedToName,
      item.assignment?.agentName,
      item.assignment?.technicianName,
      item.tecnico?.displayName,
      item.tecnico?.name,
      item.assignedTo?.displayName,
      item.assignedTo?.name,
      item.technician?.displayName,
      item.technician?.name,
      item.agent?.displayName,
      item.agent?.name
    ),
    "Sin asignar"
  );
}

function getAssignedAvatarUrl(item = {}) {
  return safeImageSrc(
    first(
      item.assignedToAvatarUrl,
      item.tecnicoAvatarUrl,
      item.technicianAvatarUrl,
      item.agentAvatarUrl,
      item.assignment?.assignedToAvatarUrl,
      item.assignment?.technicianAvatarUrl,
      item.tecnico?.avatarUrl,
      item.assignedTo?.avatarUrl,
      item.technician?.avatarUrl,
      item.agent?.avatarUrl
    )
  );
}

function getInvoiceTotal(item = {}) {
  return number(
    first(
      item.invoiceTotal,
      item.invoicesTotal,
      item.facturasTotal,
      item.importeFacturas,
      item.facturaTotal,
      item.invoiceAmount,
      0
    ),
    0
  );
}

function getInvoiceCurrency(item = {}) {
  return cleanText(first(item.currency, item.moneda, item.meta?.invoiceCurrency), DEFAULT_CURRENCY);
}

function getImporteLabel(item = {}) {
  const amount = getInvoiceTotal(item);

  if (amount > 0) {
    return formatMoney(amount, getInvoiceCurrency(item));
  }

  const paymentKey = normalizeKey(first(item.paymentStatus, item.estadoPago, ""));

  if (["paid", "pagada", "pagado"].includes(paymentKey)) return "Pagado";
  if (["pending", "pendiente"].includes(paymentKey)) return "Pendiente";
  if (["partial", "parcial"].includes(paymentKey)) return "Parcial";
  if (["overdue", "vencida", "vencido"].includes(paymentKey)) return "Vencido";

  return "—";
}

function getCreatedAt(item = {}) {
  return first(item.createdAt, item.fechaCreacion, item.created_at, item.lifecycle?.createdAt, null);
}

function getUpdatedAt(item = {}) {
  return first(
    item.lastActivityAt,
    item.updatedAt,
    item.updated_at,
    item.modifiedAt,
    item.closedAt,
    item.createdAt,
    item.lifecycle?.updatedAt,
    item.lifecycle?.lastActivityAt,
    null
  );
}

function getAttachmentsCount(item = {}) {
  const attachments = first(item.attachments, item.files, item.adjuntos);

  if (Array.isArray(attachments)) return attachments.length;

  return number(first(item.attachmentsCount, item.filesCount, item.adjuntosCount, 0), 0);
}

/* =========================================================
   FILTER / STATS
========================================================= */

function normalizeFilter(value = "") {
  const key = normalizeKey(value);

  if (["all", "todo", "todos", "todas", "total", "totales"].includes(key)) return "all";

  if (
    [
      "open",
      "opened",
      "abierta",
      "abierto",
      "abiertas",
      "abiertos",
      "active",
      "pending",
      "pendiente",
      "progress",
      "in_progress",
      "inprogress",
      "en_proceso",
      "working",
      "assigned",
    ].includes(key)
  ) {
    return "open";
  }

  if (
    [
      "closed",
      "close",
      "cerrada",
      "cerrado",
      "cerradas",
      "cerrados",
      "resolved",
      "resuelta",
      "resuelto",
      "solved",
      "cancelled",
      "archived",
    ].includes(key)
  ) {
    return "closed";
  }

  return "all";
}

function isOpenLike(item = {}) {
  return ["open", "pending", "progress"].includes(getStatusKey(getStatusRaw(item)));
}

function isClosedLike(item = {}) {
  return ["resolved", "closed"].includes(getStatusKey(getStatusRaw(item)));
}

function isUrgentLike(item = {}) {
  return ["urgent", "critical"].includes(getPriorityKey(item));
}

function getSearchHaystack(item = {}) {
  return [
    getTicketId(item),
    getSubject(item),
    getDescription(item),
    getClientName(item),
    getClientEmail(item),
    getCategory(item),
    getAssignedTo(item),
    getStatusLabel(getStatusRaw(item)),
    getPriorityLabel(item),
    getImporteLabel(item),
    item.userId,
    item.clienteId,
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

function itemMatchesFilter(item = {}, filter = "all") {
  const key = normalizeFilter(filter);

  if (key === "all") return true;
  if (key === "open") return isOpenLike(item);
  if (key === "closed") return isClosedLike(item);

  return true;
}

function computeStats(items = []) {
  return safeArray(items).reduce(
    (acc, item) => {
      acc.total += 1;
      acc.invoiceTotal += getInvoiceTotal(item);
      acc.attachments += getAttachmentsCount(item);

      if (isOpenLike(item)) acc.open += 1;
      if (isClosedLike(item)) acc.closed += 1;
      if (isUrgentLike(item)) acc.urgent += 1;

      return acc;
    },
    {
      total: 0,
      open: 0,
      closed: 0,
      urgent: 0,
      attachments: 0,
      invoiceTotal: 0,
    }
  );
}

function computeFilterCounts(items = [], query = "") {
  const searchable = safeArray(items).filter((item) => itemMatchesSearch(item, query));

  return {
    all: searchable.length,
    open: searchable.filter((item) => itemMatchesFilter(item, "open")).length,
    closed: searchable.filter((item) => itemMatchesFilter(item, "closed")).length,
  };
}

function buildVisibleItems({
  items = [],
  filter = "all",
  search = "",
  visibleLimit = DEFAULT_VISIBLE_ROWS,
} = {}) {
  return safeArray(items)
    .filter((item) => itemMatchesSearch(item, search))
    .filter((item) => itemMatchesFilter(item, filter))
    .slice(0, Math.max(1, number(visibleLimit, DEFAULT_VISIBLE_ROWS)));
}

/* =========================================================
   VIEW MODEL
========================================================= */

function buildVm(input = {}) {
  const data = safeObject(input);

  const allItems = safeArray(
    first(
      data.items,
      data.allItems,
      data.tickets,
      data.incidencias,
      data.data?.items,
      []
    )
  );

  const state = safeObject(data.state);
  const search = cleanText(first(data.search, data.searchQuery, state.search, state.searchQuery, ""), "");
  const filter = normalizeFilter(first(data.filter, data.activeFilter, state.filter, state.activeFilter, "all"));
  const visibleLimit = Math.max(1, number(first(data.visibleLimit, state.visibleLimit, DEFAULT_VISIBLE_ROWS), DEFAULT_VISIBLE_ROWS));

  const explicitVisible = safeArray(first(data.visibleItems, data.pageItems, state.visibleItems, state.pageItems, []));
  const visibleItems = explicitVisible.length
    ? explicitVisible
    : buildVisibleItems({
        items: allItems,
        filter,
        search,
        visibleLimit,
      });

  const filteredTotal = safeArray(allItems)
    .filter((item) => itemMatchesSearch(item, search))
    .filter((item) => itemMatchesFilter(item, filter)).length;

  const total = Math.max(
    allItems.length,
    number(first(data.total, data.remoteCount, state.total, state.remoteCount, allItems.length), allItems.length)
  );

  const stats = {
    ...computeStats(allItems),
    ...safeObject(data.stats),
  };

  const filterCounts = {
    ...computeFilterCounts(allItems, search),
    ...safeObject(data.filterCounts),
  };

  const loading = data.loading === true || state.loading === true;
  const refreshing = data.refreshing === true || state.refreshing === true;
  const loadingMore = data.loadingMore === true || state.loadingMore === true;
  const creating = data.creating === true || state.creating === true;

  const route = cleanText(first(data.route, data.routes?.incidencias, DEFAULT_ROUTE), DEFAULT_ROUTE);

  return {
    data,
    state,

    route,

    title: cleanText(data.title, "Tus incidencias y solicitudes"),
    subtitle: cleanText(
      data.subtitle,
      "Consulta el estado de tus incidencias, revisa actualizaciones y crea nuevas solicitudes."
    ),

    items: allItems,
    visibleItems,

    total,
    filteredTotal,
    visibleCount: visibleItems.length,
    remainingCount: Math.max(0, filteredTotal - visibleItems.length),
    hasMore: data.hasMore === true || filteredTotal > visibleItems.length,
    loading,
    refreshing,
    loadingMore,
    creating,

    error: cleanText(first(data.error, state.error, ""), ""),

    filter,
    search,
    filterCounts,
    stats,

    openingTicketId: cleanText(first(data.openingTicketId, state.openingTicketId, ""), ""),

    createModal: safeObject(data.createModal),
    detailModal: safeObject(data.detailModal),
  };
}

/* =========================================================
   UI PARTIALS
========================================================= */

function renderSpinner(label = "") {
  return `
    <span class="incidencias-inline-loading">
      <span class="incidencias-inline-spinner" aria-hidden="true"></span>
      ${label ? `<span class="incidencias-inline-loading-text">${escapeHtml(label)}</span>` : ""}
    </span>
  `;
}

function renderLoaderOnly(label = "Cargando") {
  return `
    <span class="incidencias-loader-only" role="status" aria-label="${attr(label)}">
      <span class="incidencias-inline-spinner" aria-hidden="true"></span>
    </span>
  `;
}

function renderAvatar(item = {}) {
  const fullName = getClientName(item);
  const initials = initialsFrom(fullName);
  const avatarUrl = getAvatarUrl(item);

  if (avatarUrl) {
    return `
      <div
        class="incidencias-avatar"
        title="${attr(fullName)}"
        data-has-avatar="true"
        data-fallback="false"
        data-incidencias-avatar="true"
      >
        <img
          class="incidencias-avatar-img"
          src="${attr(avatarUrl)}"
          alt="${attr(fullName)}"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          data-incidencias-avatar-img="true"
        >
        <span class="incidencias-avatar-fallback">${escapeHtml(initials)}</span>
      </div>
    `;
  }

  return `
    <div
      class="incidencias-avatar incidencias-avatar--fallback"
      title="${attr(fullName)}"
      data-has-avatar="false"
      data-fallback="true"
      data-incidencias-avatar="true"
    >
      <span class="incidencias-avatar-fallback">${escapeHtml(initials)}</span>
    </div>
  `;
}

function renderStatusChip(item = {}) {
  const rawStatus = getStatusRaw(item);
  const key = getStatusKey(rawStatus);
  const label = getStatusLabel(rawStatus);

  return `
    <span class="incidencias-chip incidencias-chip--${attr(key)}">
      <span class="incidencias-chip-dot" aria-hidden="true"></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function renderPriorityBadge(item = {}) {
  const key = getPriorityKey(item);
  const label = getPriorityLabel(item);

  return `
    <span class="incidencias-mini-badge incidencias-mini-badge--${attr(key)}" title="Prioridad ${attr(label)}">
      ${key === "critical" || key === "urgent" ? icon("alert") : icon("activity")}
      ${escapeHtml(label)}
    </span>
  `;
}

function renderAssignedAvatar(item = {}) {
  const assigned = getAssignedTo(item);
  const initials = initialsFrom(assigned);
  const avatarUrl = getAssignedAvatarUrl(item);

  if (!avatarUrl) {
    return `
      <span
        class="incidencias-agent-avatar incidencias-agent-avatar--fallback"
        title="${attr(assigned)}"
        data-technician-avatar="true"
        data-has-avatar="false"
        data-fallback="true"
        aria-hidden="true"
      >
        <span class="incidencias-agent-avatar-fallback">${escapeHtml(initials)}</span>
      </span>
    `;
  }

  return `
    <span
      class="incidencias-agent-avatar incidencias-agent-avatar--image"
      title="${attr(assigned)}"
      data-technician-avatar="true"
      data-has-avatar="true"
      data-fallback="false"
      aria-hidden="true"
    >
      <img
        class="incidencias-agent-avatar-img"
        src="${attr(avatarUrl)}"
        alt=""
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
        draggable="false"
        data-incidencias-agent-avatar-img="true"
      >
      <span class="incidencias-agent-avatar-fallback">${escapeHtml(initials)}</span>
    </span>
  `;
}

function renderAssignedBadge(item = {}) {
  const assigned = getAssignedTo(item);

  return `
    <span
      class="incidencias-mini-badge incidencias-mini-badge--agent"
      aria-label="Técnico · ${attr(assigned)}"
      data-assigned-technician="${attr(assigned)}"
    >
      ${renderAssignedAvatar(item)}
      <span class="incidencias-agent-name">${escapeHtml(assigned)}</span>
    </span>
  `;
}

function renderImporteChip(item = {}) {
  const label = getImporteLabel(item);
  const isMoney = /€|EUR|\$|USD|£|GBP/i.test(label);

  if (isMoney) {
    return `
      <span class="incidencias-importe incidencias-importe--money">
        ${icon("euro")}
        ${escapeHtml(label)}
      </span>
    `;
  }

  return `
    <span class="incidencias-importe incidencias-importe--status">
      ${escapeHtml(label)}
    </span>
  `;
}

function renderActionButton({
  action = INCIDENCIAS_ACTIONS.OPEN_DETAIL,
  ticketId = "",
  label = "Detalle",
  loadingLabel = "Cargando detalle",
  loading = false,
  disabled = false,
  iconName = "eye",
} = {}) {
  const finalDisabled = disabled || loading;

  return `
    <button
      type="button"
      class="incidencias-detail-btn${loading ? " is-loading" : ""}"
      data-incidencias-action="${attr(action)}"
      data-action="${attr(action)}"
      data-ticket-id="${attr(ticketId)}"
      data-incidencia-id="${attr(ticketId)}"
      aria-label="${attr(label)}"
      ${htmlAttrs({
        disabled: finalDisabled,
        "aria-disabled": finalDisabled ? "true" : false,
        "aria-busy": loading ? "true" : false,
      })}
    >
      ${
        loading
          ? renderLoaderOnly(loadingLabel)
          : `
            <span class="incidencias-action-icon">${icon(iconName)}</span>
            <span class="incidencias-btn-text">${escapeHtml(label)}</span>
          `
      }
    </button>
  `;
}

/* =========================================================
   HEADER
========================================================= */

function renderHeader(vm = {}) {
  const stats = vm.stats;
  const updatedAt = first(vm.items[0]?.lastActivityAt, vm.items[0]?.updatedAt, vm.items[0]?.createdAt, null);

  return `
    <section class="incidencias-hero">
      <div class="incidencias-hero-top">
        <div class="incidencias-hero-copy">
          <h1 class="incidencias-page-title">${escapeHtml(vm.title)}</h1>
          <p class="incidencias-page-subtitle">${escapeHtml(vm.subtitle)}</p>
        </div>

        <div class="incidencias-hero-actions incidencias-hero-actions--facturas-order">
          <button
            type="button"
            id="incidencias-create-btn"
            class="incidencias-btn incidencias-btn--create${vm.creating ? " is-loading" : ""}"
            data-incidencias-action="${INCIDENCIAS_ACTIONS.CREATE_OPEN}"
            data-action="${INCIDENCIAS_ACTIONS.CREATE_OPEN}"
            ${htmlAttrs({
              disabled: vm.creating,
              "aria-disabled": vm.creating ? "true" : false,
              "aria-busy": vm.creating ? "true" : false,
            })}
          >
            ${
              vm.creating
                ? renderSpinner("Abriendo...")
                : `${icon("plus")}<span class="incidencias-btn-text">Crear incidencia</span>`
            }
          </button>

          <button
            type="button"
            id="incidencias-refresh-btn"
            class="incidencias-btn incidencias-btn--accent incidencias-btn--refresh${vm.refreshing ? " is-loading" : ""}"
            data-incidencias-action="${INCIDENCIAS_ACTIONS.REFRESH}"
            data-action="${INCIDENCIAS_ACTIONS.REFRESH}"
            ${htmlAttrs({
              disabled: vm.refreshing || vm.loading,
              "aria-disabled": vm.refreshing || vm.loading ? "true" : false,
              "aria-busy": vm.refreshing ? "true" : false,
            })}
          >
            ${
              vm.refreshing
                ? renderSpinner("Actualizando...")
                : `${icon("refresh")}<span class="incidencias-btn-text">Actualizar</span>`
            }
          </button>
        </div>
      </div>

      <div class="incidencias-hero-meta">
        <span class="incidencias-meta-pill">${icon("ticket")}${escapeHtml(`${formatNumber(vm.total)} solicitudes registradas`)}</span>
        <span class="incidencias-meta-pill">${icon("refresh")}${updatedAt ? escapeHtml(`Última actualización · ${formatRelativeDate(updatedAt)}`) : "Sin actualizaciones recientes"}</span>
        <span class="incidencias-meta-pill">${icon("paperclip")}${escapeHtml(`${formatNumber(stats.attachments)} adjuntos`)}</span>
        <span class="incidencias-meta-pill">${icon("euro")}${escapeHtml(formatMoney(stats.invoiceTotal, DEFAULT_CURRENCY))}</span>
      </div>

      <div class="incidencias-stats">
        <article class="incidencias-stat-card incidencias-stat-card--open">
          <div class="incidencias-stat-label">Abiertas</div>
          <div class="incidencias-stat-value">${escapeHtml(formatNumber(stats.open))}</div>
          <div class="incidencias-stat-text">Solicitudes activas, pendientes o en proceso.</div>
        </article>

        <article class="incidencias-stat-card incidencias-stat-card--closed">
          <div class="incidencias-stat-label">Cerradas</div>
          <div class="incidencias-stat-value">${escapeHtml(formatNumber(stats.closed))}</div>
          <div class="incidencias-stat-text">Casos resueltos o cerrados.</div>
        </article>

        <article class="incidencias-stat-card incidencias-stat-card--urgent">
          <div class="incidencias-stat-label">Urgentes</div>
          <div class="incidencias-stat-value">${escapeHtml(formatNumber(stats.urgent))}</div>
          <div class="incidencias-stat-text">Incidencias marcadas como urgentes o críticas.</div>
        </article>

        <article class="incidencias-stat-card incidencias-stat-card--amount">
          <div class="incidencias-stat-label">Importe asociado</div>
          <div class="incidencias-stat-value">${escapeHtml(formatMoney(stats.invoiceTotal, DEFAULT_CURRENCY))}</div>
          <div class="incidencias-stat-text">Total vinculado a facturas visibles.</div>
        </article>
      </div>
    </section>
  `;
}

/* =========================================================
   FILTERS / SEARCH
========================================================= */

function renderSearch(vm = {}) {
  return `
    <div class="incidencias-search" role="search" aria-label="Buscar incidencias">
      <span class="incidencias-search-icon" aria-hidden="true">${icon("search")}</span>

      <input
        id="incidencias-search-input"
        class="incidencias-search-input"
        type="search"
        value="${attr(vm.search)}"
        placeholder="Buscar cliente, asunto, ID..."
        autocomplete="off"
        spellcheck="false"
        data-incidencias-search-input="true"
        data-incidencias-field="search"
        data-field="search"
        aria-label="Buscar incidencias por cliente, asunto o identificador"
      >

      ${
        vm.search
          ? `
            <button
              type="button"
              class="incidencias-search-clear"
              data-incidencias-action="${INCIDENCIAS_ACTIONS.CLEAR_SEARCH}"
              data-action="${INCIDENCIAS_ACTIONS.CLEAR_SEARCH}"
              aria-label="Limpiar búsqueda"
            >
              ${icon("close")}
            </button>
          `
          : ""
      }
    </div>
  `;
}

function renderFilters(vm = {}) {
  return `
    <div class="incidencias-filters" aria-label="Filtros y búsqueda de incidencias">
      <div class="incidencias-filter-pills" role="group" aria-label="Filtrar incidencias por estado">
        ${FILTERS.map((filter) => {
          const active = filter.key === vm.filter;
          const count = vm.filterCounts[filter.key] ?? 0;

          return `
            <button
              type="button"
              class="incidencias-filter-pill${active ? " is-active" : ""}"
              data-incidencias-action="${INCIDENCIAS_ACTIONS.FILTER}"
              data-action="${INCIDENCIAS_ACTIONS.FILTER}"
              data-filter="${attr(filter.key)}"
              data-filter-status="${attr(filter.key)}"
              aria-pressed="${active ? "true" : "false"}"
            >
              <span>${escapeHtml(filter.label)}</span>
              <strong>${escapeHtml(formatNumber(count))}</strong>
            </button>
          `;
        }).join("")}
      </div>

      ${renderSearch(vm)}
    </div>
  `;
}

/* =========================================================
   TABLE
========================================================= */

function renderRow(item = {}, vm = {}) {
  const ticketId = getTicketId(item);
  const subject = getSubject(item);
  const description = getDescription(item);
  const clientName = getClientName(item);
  const clientEmail = getClientEmail(item) || "Sin email";
  const createdAtRaw = getCreatedAt(item);
  const updatedAtRaw = getUpdatedAt(item);
  const createdAt = formatDateTime(createdAtRaw);
  const updatedAt = formatLastUpdate(updatedAtRaw);
  const attachmentsCount = getAttachmentsCount(item);
  const category = getCategory(item);
  const statusKey = getStatusKey(getStatusRaw(item));
  const opening = vm.openingTicketId === ticketId;

  return `
    <tr
      class="incidencias-row incidencias-row--${attr(statusKey)} incidencias-row--clickable"
      data-ticket-row="true"
      data-ticket-id="${attr(ticketId)}"
      data-incidencia-id="${attr(ticketId)}"
      data-detail-target="true"
      role="button"
      tabindex="0"
      aria-label="Abrir detalle de incidencia ${attr(ticketId)}"
    >
      <td class="incidencias-cell incidencias-cell--main">
        <div class="incidencias-main">
          ${renderAvatar(item)}

          <div class="incidencias-main-copy">
            <div class="incidencias-ticket-line">
              <span class="incidencias-ticket-id">${escapeHtml(ticketId)}</span>
              <span class="incidencias-category-pill">${escapeHtml(category)}</span>
            </div>

            <div class="incidencias-ticket-subject">${escapeHtml(subject)}</div>
            <div class="incidencias-ticket-description">${escapeHtml(description)}</div>

            <div class="incidencias-client-line">
              <span class="incidencias-client-name">${escapeHtml(clientName)}</span>
              <span class="incidencias-client-separator">·</span>
              <span class="incidencias-client-email">${escapeHtml(clientEmail)}</span>
            </div>

            <div class="incidencias-row-badges">
              ${renderPriorityBadge(item)}
              ${renderAssignedBadge(item)}
            </div>
          </div>
        </div>
      </td>

      <td class="incidencias-cell incidencias-cell--status">
        ${renderStatusChip(item)}
      </td>

      <td class="incidencias-cell incidencias-cell--date">
        <span class="incidencias-date-inline" title="${attr(createdAt)}">
          ${escapeHtml(createdAt)}
        </span>
      </td>

      <td class="incidencias-cell incidencias-cell--date">
        <span class="incidencias-date-inline" title="${attr(formatDateTime(updatedAtRaw))}">
          ${escapeHtml(updatedAt)}
        </span>
      </td>

      <td class="incidencias-cell incidencias-cell--importe">
        ${renderImporteChip(item)}
      </td>

      <td class="incidencias-cell incidencias-cell--attachments">
        <span
          class="incidencias-attachments-pill"
          title="${attr(`${attachmentsCount} adjunto${attachmentsCount === 1 ? "" : "s"}`)}"
        >
          ${icon("paperclip")}
          ${escapeHtml(formatNumber(attachmentsCount))}
        </span>
      </td>

      <td class="incidencias-cell incidencias-cell--actions">
        ${renderActionButton({
          ticketId,
          loading: opening,
          label: "Detalle",
          loadingLabel: "Cargando detalle",
          iconName: "eye",
        })}
      </td>
    </tr>
  `;
}

function renderTableLoading(rows = DEFAULT_VISIBLE_ROWS) {
  return `
    <div class="incidencias-table-loading" aria-hidden="true">
      ${Array.from({ length: Math.max(3, number(rows, DEFAULT_VISIBLE_ROWS)) }).map(() => `
        <div class="incidencias-table-loading-row">
          <div class="incidencias-skeleton incidencias-skeleton--avatar"></div>
          <div class="incidencias-table-loading-copy">
            <div class="incidencias-skeleton incidencias-skeleton--xs"></div>
            <div class="incidencias-skeleton incidencias-skeleton--lg"></div>
            <div class="incidencias-skeleton incidencias-skeleton--md"></div>
          </div>
          <div class="incidencias-skeleton incidencias-skeleton--pill"></div>
          <div class="incidencias-skeleton incidencias-skeleton--date"></div>
          <div class="incidencias-skeleton incidencias-skeleton--date"></div>
          <div class="incidencias-skeleton incidencias-skeleton--amount"></div>
          <div class="incidencias-skeleton incidencias-skeleton--attach"></div>
          <div class="incidencias-skeleton incidencias-skeleton--btn"></div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderRefreshOverlay() {
  return `
    <div class="incidencias-refresh-overlay" aria-live="polite">
      <div class="incidencias-refresh-card">
        ${renderSpinner("Actualizando historial...")}
      </div>
    </div>
  `;
}

function renderEmptyState(vm = {}) {
  const filtering = vm.filter !== "all" || Boolean(vm.search);
  const hasError = Boolean(vm.error);

  return `
    <div class="incidencias-empty">
      <div class="incidencias-empty-icon" aria-hidden="true">
        ${hasError ? icon("alert") : filtering ? icon("filter") : icon("ticket")}
      </div>

      <h3 class="incidencias-empty-title">
        ${
          hasError
            ? "No se pudieron cargar las incidencias"
            : filtering
              ? "No hay incidencias con este criterio"
              : "No hay incidencias para mostrar"
        }
      </h3>

      <p class="incidencias-empty-text">
        ${
          hasError
            ? "Puedes reintentar la carga desde el botón de actualizar."
            : filtering
              ? vm.search
                ? `No se encontraron incidencias para “${escapeHtml(vm.search)}”.`
                : "Cambia el filtro activo para volver al historial completo."
              : "Cuando haya solicitudes registradas aparecerán aquí con su estado, seguimiento, adjuntos, facturación asociada y acciones disponibles."
        }
      </p>

      ${
        hasError
          ? `
            <button
              type="button"
              class="incidencias-btn incidencias-btn--primary"
              data-incidencias-action="${INCIDENCIAS_ACTIONS.REFRESH}"
              data-action="${INCIDENCIAS_ACTIONS.REFRESH}"
            >
              ${icon("refresh")}
              <span class="incidencias-btn-text">Reintentar</span>
            </button>
          `
          : filtering
            ? `
              <button
                type="button"
                class="incidencias-btn"
                data-incidencias-action="${INCIDENCIAS_ACTIONS.CLEAR_FILTERS}"
                data-action="${INCIDENCIAS_ACTIONS.CLEAR_FILTERS}"
              >
                ${icon("close")}
                <span class="incidencias-btn-text">Limpiar filtros</span>
              </button>
            `
            : ""
      }
    </div>
  `;
}

function renderFeedFooter(vm = {}) {
  if (!vm.total || !vm.visibleCount) {
    return `
      <div
        class="incidencias-feed-sentinel"
        data-incidencias-load-more="true"
        data-incidencias-infinite-sentinel="true"
        aria-hidden="true"
      ></div>
    `;
  }

  if (!vm.hasMore) {
    return `
      <div
        class="incidencias-feed-end"
        data-incidencias-feed-end="true"
        data-incidencias-load-more="false"
      >
        <span class="incidencias-feed-end-text">
          Has visto todas las incidencias disponibles.
        </span>
      </div>
    `;
  }

  return `
    <div class="incidencias-feed-more" data-incidencias-feed-more="true">
      <button
        type="button"
        class="incidencias-load-more-btn${vm.loadingMore ? " is-loading" : ""}"
        data-incidencias-action="${INCIDENCIAS_ACTIONS.LOAD_MORE}"
        data-action="${INCIDENCIAS_ACTIONS.LOAD_MORE}"
        data-incidencias-load-more-button="true"
        ${htmlAttrs({
          disabled: vm.loadingMore,
          "aria-disabled": vm.loadingMore ? "true" : false,
          "aria-busy": vm.loadingMore ? "true" : false,
        })}
      >
        ${
          vm.loadingMore
            ? renderSpinner("Cargando más incidencias...")
            : `
              ${icon("chevronDown")}
              <span class="incidencias-btn-text">Mostrar más</span>
              <span class="incidencias-load-more-count">
                ${escapeHtml(`${formatNumber(vm.remainingCount)} restantes`)}
              </span>
            `
        }
      </button>

      <div
        class="incidencias-feed-sentinel"
        data-incidencias-load-more="true"
        data-incidencias-infinite-sentinel="true"
        data-load-more-sentinel="true"
        aria-hidden="true"
      ></div>
    </div>
  `;
}

function renderHistory(vm = {}) {
  const showInitialLoading = vm.loading && !vm.visibleItems.length;
  const showRefreshOverlay = vm.refreshing && vm.visibleItems.length;

  const activeFilterLabel =
    FILTERS.find((item) => item.key === vm.filter)?.label || "Todas";

  const activeCriteria = [
    vm.filter !== "all" ? activeFilterLabel : "",
    vm.search ? `búsqueda “${vm.search}”` : "",
  ].filter(Boolean);

  const subtitle = showInitialLoading
    ? "Cargando incidencias..."
    : vm.filter !== "all" || vm.search
      ? `Mostrando ${formatNumber(vm.visibleCount)} de ${formatNumber(vm.filteredTotal)}${activeCriteria.length ? ` · ${activeCriteria.join(" · ")}` : ""}`
      : `Mostrando ${formatNumber(vm.visibleCount)} de ${formatNumber(vm.total)} · ordenadas de más nuevas a más antiguas`;

  return `
    <section
      class="incidencias-history"
      data-incidencias-scroll-host="true"
      data-incidencias-scroll-mode="infinite"
    >
      <div class="incidencias-history-head" data-incidencias-history-head="true">
        <div class="incidencias-history-copy">
          <h2 class="incidencias-history-title">Historial de incidencias</h2>
          <p class="incidencias-history-subtitle">${escapeHtml(subtitle)}</p>
        </div>

        ${renderFilters(vm)}
      </div>

      ${
        showInitialLoading
          ? renderTableLoading(DEFAULT_VISIBLE_ROWS)
          : `
            <div
              class="incidencias-table-wrap${vm.refreshing ? " is-refreshing" : ""}"
              data-incidencias-table-wrap="true"
              data-incidencias-scroll-mode="infinite"
            >
              ${showRefreshOverlay ? renderRefreshOverlay() : ""}

              ${
                vm.visibleItems.length
                  ? `
                    <div class="incidencias-table-shell">
                      <table class="incidencias-table" role="table" aria-label="Listado de incidencias">
                        <colgroup>
                          <col class="incidencias-col incidencias-col--main">
                          <col class="incidencias-col incidencias-col--status">
                          <col class="incidencias-col incidencias-col--created">
                          <col class="incidencias-col incidencias-col--updated">
                          <col class="incidencias-col incidencias-col--amount">
                          <col class="incidencias-col incidencias-col--attachments">
                          <col class="incidencias-col incidencias-col--actions">
                        </colgroup>

                        <thead>
                          <tr>
                            <th>Incidencia</th>
                            <th>Estado</th>
                            <th>Creada</th>
                            <th>Última novedad</th>
                            <th>Importe</th>
                            <th>Adjuntos</th>
                            <th>Acciones</th>
                          </tr>
                        </thead>

                        <tbody>
                          ${vm.visibleItems.map((item) => renderRow(item, vm)).join("")}
                        </tbody>
                      </table>
                    </div>

                    ${renderFeedFooter(vm)}
                  `
                  : renderEmptyState(vm)
              }
            </div>
          `
      }
    </section>
  `;
}

/* =========================================================
   STATES
========================================================= */

export function renderIncidenciasLoadingState(input = {}) {
  const vm = buildVm({
    ...input,
    loading: true,
  });

  return `
    <section
      class="incidencias-view-root incidencias-view-root--loading"
      data-incidencias-scope="true"
      data-template-version="${attr(INCIDENCIAS_TEMPLATE_VERSION)}"
      aria-busy="true"
    >
      ${renderHeader(vm)}
      ${renderHistory(vm)}
    </section>
  `;
}

export function renderIncidenciasErrorState(message = "No se pudieron cargar las incidencias.") {
  return `
    <section
      class="incidencias-view-root incidencias-view-root--error"
      data-incidencias-scope="true"
      data-template-version="${attr(INCIDENCIAS_TEMPLATE_VERSION)}"
    >
      <section class="incidencias-error">
        <h3 class="incidencias-error-title">No se pudo renderizar la vista de incidencias</h3>
        <p class="incidencias-error-text">${escapeHtml(cleanText(message, "Error desconocido al cargar la vista."))}</p>

        <button
          type="button"
          class="incidencias-btn incidencias-btn--primary"
          data-incidencias-action="${INCIDENCIAS_ACTIONS.REFRESH}"
          data-action="${INCIDENCIAS_ACTIONS.REFRESH}"
        >
          ${icon("refresh")}
          <span class="incidencias-btn-text">Reintentar</span>
        </button>
      </section>
    </section>
  `;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function renderIncidenciasTemplate(input = {}) {
  const vm = buildVm(input);

  return `
    <section
      class="${joinClasses(
        "incidencias-view-root",
        vm.loading ? "is-loading" : "",
        vm.refreshing ? "is-refreshing" : "",
        vm.creating ? "is-creating" : "",
        vm.error ? "has-error" : ""
      )}"
      data-incidencias-scope="true"
      data-template-version="${attr(INCIDENCIAS_TEMPLATE_VERSION)}"
      data-total="${attr(String(vm.total))}"
      data-visible="${attr(String(vm.visibleCount))}"
      data-filter="${attr(vm.filter)}"
      aria-busy="${vm.loading || vm.refreshing ? "true" : "false"}"
    >
      ${vm.error ? `
        <div class="incidencias-alert incidencias-alert--error" role="alert">
          ${icon("alert")}
          <span>${escapeHtml(vm.error)}</span>
        </div>
      ` : ""}

      ${renderHeader(vm)}
      ${renderHistory(vm)}

      ${renderIncidenciasCreateModal({
        ...vm.createModal,
        admin: input.admin === true || input.role === "admin" || vm.data.admin === true,
        role: input.role || vm.data.role || "",
      })}

      ${renderIncidenciasDetailModal(vm.detailModal)}
    </section>
  `;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getIncidenciasTemplateSnapshot() {
  return {
    version: INCIDENCIAS_TEMPLATE_VERSION,

    actions: INCIDENCIAS_ACTIONS,
    filters: FILTERS,

    policy: {
      templateOnly: true,
      noAuth: true,
      noRouter: true,
      noHttp: true,
      noStore: true,
      noStateExternal: true,
      noModelExternal: true,
      noListeners: true,
      noDomApi: true,
      noToast: true,

      includesCreateTemplate: true,
      includesDetailTemplate: true,
      tableMarkup: true,
      searchMarkup: true,
      filtersMarkup: true,
      infiniteFeedMarkup: true,
    },
  };
}

/* =========================================================
   EXPORTS
========================================================= */

export const renderIncidenciasViewTemplate = renderIncidenciasTemplate;
export const renderIncidenciasDashboardTemplate = renderIncidenciasTemplate;
export const renderIncidencias = renderIncidenciasTemplate;

export default renderIncidenciasTemplate;
