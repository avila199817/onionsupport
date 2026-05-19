/* =========================================================
   Onion Support - Incidencias Table Template
   Archivo: /src/views/incidencias/incidencias.table.template.js

   Responsabilidad:
   - Renderizar HTML de tabla/listado de incidencias.
   - Consumir datos ya preparados por incidenciasView.js.
   - Exponer data-action/data-incidencias-action para bindings.
   - Mantener CSP limpio: sin estilos inline y sin eventos inline.
   - No cargar datos.
   - No filtrar ni paginar por su cuenta.
   - No abrir modales.
   - No registrar listeners de acciones.
   - No leer AppCore, Router, Auth, Store ni globals.
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_PAGE_SIZE = 5;
const DEFAULT_CURRENCY = "EUR";
const AVATAR_TONE_COUNT = 10;

const FILTERS = Object.freeze([
  { key: "all", label: "Todas" },
  { key: "open", label: "Abiertas" },
  { key: "closed", label: "Cerradas" },
]);

/* =========================================================
   SAFE HELPERS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

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
      .replace(/\s+/g, "");

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

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return isObject(value) ? value : {};
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

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeWhitespace(value = "") {
  return safeText(value, "").replace(/\s+/g, " ").trim();
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

function hashString(value = "") {
  const text = safeText(value, "onion");
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }

  return Math.abs(hash >>> 0);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function htmlAttrs(attrs = {}) {
  return Object.entries(safeObject(attrs))
    .map(([key, value]) => {
      if (value === false || value === null || value === undefined) return "";
      if (value === true) return escapeHtml(key);

      return `${escapeHtml(key)}="${escapeHtml(value)}"`;
    })
    .filter(Boolean)
    .join(" ");
}

function tooltipAttrs(tooltip = "", ariaLabel = "") {
  const cleanTooltip = safeText(tooltip, "");
  const cleanAria = safeText(ariaLabel, cleanTooltip);

  return htmlAttrs({
    "aria-label": cleanAria || false,
    "data-tooltip": cleanTooltip || false,
  });
}

function disabledAttrs(disabled = false, busy = false) {
  return htmlAttrs({
    disabled: Boolean(disabled),
    "aria-disabled": disabled ? "true" : false,
    "aria-busy": busy ? "true" : false,
  });
}

function actionAttrs(action = "", ticketId = "") {
  const cleanAction = safeText(action, "");
  const cleanTicketId = safeText(ticketId, "");

  return htmlAttrs({
    "data-action": cleanAction,
    "data-incidencias-action": cleanAction,
    "data-ticket-id": cleanTicketId || false,
    "data-incidencia-id": cleanTicketId || false,
  });
}

/* =========================================================
   INPUT NORMALIZATION
========================================================= */

function getRuntimeState(input = {}) {
  const data = safeObject(input);

  return safeObject(
    first(
      data.state,
      data.viewState,
      data.runtime,
      data.meta?.state,
      {}
    )
  );
}

function getInputItems(input = {}) {
  const data = safeObject(input);

  return safeArray(
    first(
      data.items,
      data.rows,
      data.tickets,
      data.incidencias,
      data.data?.items,
      data.data?.tickets,
      data.data?.incidencias,
      data.payload?.items,
      data.payload?.tickets,
      data.payload?.incidencias,
      []
    )
  );
}

function getFilteredItems(input = {}) {
  const data = safeObject(input);

  return safeArray(
    first(
      data.filteredItems,
      data.visibleItems,
      data.state?.filteredItems,
      null
    )
  );
}

function getPageItems(input = {}) {
  const data = safeObject(input);

  const explicitPageItems = safeArray(
    first(
      data.pageItems,
      data.itemsPage,
      data.state?.pageItems,
      null
    )
  );

  if (explicitPageItems.length) return explicitPageItems;

  return getFilteredItems(data).length
    ? getFilteredItems(data)
    : getInputItems(data);
}

function getSearchQuery(input = {}) {
  const data = safeObject(input);
  const runtime = getRuntimeState(data);

  return normalizeWhitespace(
    first(
      data.search,
      data.searchQuery,
      data.filterQuery,
      data.query,
      data.q,
      runtime.search,
      runtime.searchQuery,
      runtime.filterQuery,
      runtime.query,
      runtime.q,
      ""
    )
  );
}

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
      "activa",
      "activo",
      "activas",
      "activos",
      "pending",
      "pendiente",
      "pendientes",
      "progress",
      "in_progress",
      "inprogress",
      "en_proceso",
      "proceso",
      "working",
      "trabajando",
      "assigned",
      "asignada",
      "asignado",
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
      "resueltas",
      "resueltos",
      "solved",
      "cancelled",
      "canceled",
      "cancelada",
      "cancelado",
      "archived",
      "archivada",
      "archivado",
    ].includes(key)
  ) {
    return "closed";
  }

  return "all";
}

function getActiveFilter(input = {}) {
  const data = safeObject(input);
  const runtime = getRuntimeState(data);

  return normalizeFilter(
    first(
      data.filter,
      data.activeFilter,
      data.statusFilter,
      runtime.filter,
      runtime.activeFilter,
      runtime.statusFilter,
      "all"
    )
  );
}

function getPagination(input = {}) {
  const data = safeObject(input);
  const runtime = getRuntimeState(data);
  const allItems = getInputItems(data);
  const filteredItems = getFilteredItems(data);
  const pageItems = getPageItems(data);

  const pageSize = clamp(
    safeNumber(first(data.pageSize, runtime.pageSize, DEFAULT_PAGE_SIZE), DEFAULT_PAGE_SIZE),
    1,
    50
  );

  const currentPage = Math.max(
    1,
    safeNumber(first(data.page, data.currentPage, runtime.page, runtime.currentPage, 1), 1)
  );

  const totalCount = Math.max(
    0,
    safeNumber(
      first(
        data.totalCount,
        data.remoteCount,
        runtime.totalCount,
        runtime.remoteCount,
        filteredItems.length || allItems.length
      ),
      filteredItems.length || allItems.length
    )
  );

  const totalPages = Math.max(
    1,
    safeNumber(
      first(
        data.totalPages,
        runtime.totalPages,
        Math.ceil((totalCount || 1) / pageSize)
      ),
      1
    )
  );

  const safePage = clamp(currentPage, 1, totalPages);
  const rangeStart = totalCount && pageItems.length
    ? (safePage - 1) * pageSize + 1
    : 0;
  const rangeEnd = totalCount
    ? Math.min(rangeStart + pageItems.length - 1, totalCount)
    : 0;

  return {
    allItems,
    filteredItems,
    pageItems,
    pageSize,
    currentPage: safePage,
    totalPages,
    totalCount,
    rangeStart,
    rangeEnd,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
    activeFilter: getActiveFilter(data),
    searchQuery: getSearchQuery(data),
    filtering: getActiveFilter(data) !== "all" || Boolean(getSearchQuery(data)),
  };
}

/* =========================================================
   DATE / FORMATTERS
========================================================= */

function parseSpanishDate(value = "") {
  const text = safeText(value, "");
  if (!text) return 0;

  const match = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (!match) return 0;

  const [, dd, mm, yyyy, hh = "0", min = "0", ss = "0"] = match;

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

function isDateOnlyValue(value = null) {
  const raw = safeText(value, "");

  return /^\d{4}-\d{2}-\d{2}$/.test(raw) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw);
}

function toTimestamp(value = null) {
  if (!value) return 0;

  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 0 : value.getTime();

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9999999999 ? value : value * 1000;
  }

  const raw = safeText(value, "");
  if (!raw) return 0;

  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 9999999999 ? numeric : numeric * 1000;
  }

  const esTimestamp = parseSpanishDate(raw);
  if (esTimestamp) return esTimestamp;

  const date = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

const moneyFormatterCache = new Map();
const dateFormatterCache = new Map();

function getMoneyFormatter(currency = DEFAULT_CURRENCY) {
  const code = safeText(currency, DEFAULT_CURRENCY).toUpperCase();

  if (moneyFormatterCache.has(code)) return moneyFormatterCache.get(code);

  const formatter = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  moneyFormatterCache.set(code, formatter);
  return formatter;
}

function formatMoney(value = 0, currency = DEFAULT_CURRENCY) {
  const amount = safeNumber(value, NaN);

  if (!Number.isFinite(amount)) return "—";

  const code = safeText(currency, DEFAULT_CURRENCY).toUpperCase();

  try {
    return getMoneyFormatter(code).format(amount);
  } catch {
    return `${amount.toFixed(2).replace(".", ",")} ${code}`;
  }
}

function getDateFormatter(type = "datetime") {
  const key = `es-ES:${type}`;

  if (dateFormatterCache.has(key)) return dateFormatterCache.get(key);

  const formatter = new Intl.DateTimeFormat(
    "es-ES",
    type === "date"
      ? {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }
      : {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }
  );

  dateFormatterCache.set(key, formatter);
  return formatter;
}

function formatDateTime(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "—";

  try {
    return getDateFormatter("datetime").format(new Date(timestamp));
  } catch {
    return "—";
  }
}

function formatDateShort(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "—";

  try {
    return getDateFormatter("date").format(new Date(timestamp));
  } catch {
    return "—";
  }
}

function formatDateTooltip(value = null) {
  return isDateOnlyValue(value) ? formatDateShort(value) : formatDateTime(value);
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
  if (diffHours < 24) return diffMin > 0 ? `En ${diffHours} h` : `Hace ${diffHours} h`;

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

/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common = 'aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  const icons = {
    refresh: `<svg ${common}><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>`,
    export: `<svg ${common}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,
    plus: `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
    ticket: `<svg ${common}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,
    eye: `<svg ${common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    paperclip: `<svg ${common}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.48-8.49"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    euro: `<svg ${common}><path d="M4 10h10"/><path d="M4 14h9"/><path d="M19 5a7.7 7.7 0 0 0-5.2-2C8.4 3 4 7 4 12s4.4 9 9.8 9a7.7 7.7 0 0 0 5.2-2"/></svg>`,
    activity: `<svg ${common}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
    users: `<svg ${common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    filter: `<svg ${common}><path d="M22 3H2l8 9.46V19l4 2v-8.54Z"/></svg>`,
  };

  return icons[name] || "";
}

/* =========================================================
   ITEM PICKERS
========================================================= */

function getRaw(item = {}) {
  return safeObject(item?.raw);
}

function getTicketId(item = {}) {
  const raw = getRaw(item);

  return safeText(
    first(
      item.ticketId,
      item.incidenciaId,
      item.code,
      item.numero,
      item.ticketCode,
      item.id,
      item._id,
      raw.ticketId,
      raw.incidenciaId,
      raw.code,
      raw.numero,
      raw.ticketCode,
      raw.id,
      raw._id
    ),
    "INC-SIN-ID"
  );
}

function getSubject(item = {}) {
  const raw = getRaw(item);

  return safeText(
    first(
      item.subject,
      item.title,
      item.asunto,
      item.name,
      item.preview,
      raw.subject,
      raw.title,
      raw.asunto,
      raw.name,
      raw.preview
    ),
    "Incidencia sin asunto"
  );
}

function getDescription(item = {}) {
  const raw = getRaw(item);

  return safeText(
    first(
      item.description,
      item.descripcion,
      item.message,
      item.body,
      item.preview,
      item.text,
      raw.description,
      raw.descripcion,
      raw.message,
      raw.body,
      raw.preview,
      raw.text
    ),
    "Sin descripción."
  );
}

function getClientName(item = {}) {
  const raw = getRaw(item);

  return safeText(
    first(
      item.clientName,
      item.clienteNombre,
      item.requesterName,
      item.requesterSnapshot?.name,
      item.requesterSnapshot?.displayName,
      item.createdBy?.name,
      item.createdBy?.displayName,
      item.cliente?.nombreContacto,
      item.cliente?.nombre,
      item.cliente?.name,
      item.cliente?.displayName,
      item.client?.name,
      item.customer?.name,
      item.receptor?.name,
      item.name,
      raw.clientName,
      raw.clienteNombre,
      raw.requesterName,
      raw.requesterSnapshot?.name,
      raw.requesterSnapshot?.displayName,
      raw.createdBy?.name,
      raw.createdBy?.displayName,
      raw.cliente?.nombreContacto,
      raw.cliente?.nombre,
      raw.cliente?.name,
      raw.cliente?.displayName,
      raw.client?.name,
      raw.customer?.name,
      raw.receptor?.name,
      raw.name
    ),
    "Cliente"
  );
}

function getClientEmail(item = {}) {
  const raw = getRaw(item);

  return safeText(
    first(
      item.clientEmail,
      item.clienteEmail,
      item.email,
      item.emailCliente,
      item.requesterSnapshot?.email,
      item.createdBy?.email,
      item.cliente?.email,
      item.cliente?.emailLower,
      item.client?.email,
      item.customer?.email,
      item.receptor?.email,
      raw.clientEmail,
      raw.clienteEmail,
      raw.email,
      raw.emailCliente,
      raw.requesterSnapshot?.email,
      raw.createdBy?.email,
      raw.cliente?.email,
      raw.cliente?.emailLower,
      raw.client?.email,
      raw.customer?.email,
      raw.receptor?.email
    ),
    ""
  ).toLowerCase();
}

function getAvatarUrl(item = {}) {
  const raw = getRaw(item);

  return safeText(
    first(
      item.clientAvatar,
      item.avatar,
      item.avatarUrl,
      item.requesterSnapshot?.avatar,
      item.requesterSnapshot?.avatarUrl,
      item.cliente?.avatar,
      item.cliente?.avatarUrl,
      item.client?.avatar,
      item.client?.avatarUrl,
      item.customer?.avatar,
      item.customer?.avatarUrl,
      raw.clientAvatar,
      raw.avatar,
      raw.avatarUrl,
      raw.requesterSnapshot?.avatar,
      raw.requesterSnapshot?.avatarUrl,
      raw.cliente?.avatar,
      raw.cliente?.avatarUrl,
      raw.client?.avatar,
      raw.client?.avatarUrl,
      raw.customer?.avatar,
      raw.customer?.avatarUrl
    ),
    ""
  );
}

function getInitials(value = "") {
  const text = normalizeWhitespace(value);
  if (!text) return "ON";

  const parts = text.split(" ").filter(Boolean);

  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "ON";
}

function getAvatarTone(item = {}) {
  return String(hashString(`${getTicketId(item)}|${getClientName(item)}`) % AVATAR_TONE_COUNT);
}

function getStatusRaw(item = {}) {
  const raw = getRaw(item);

  return first(
    item.status,
    item.estado,
    item.state,
    item.lifecycle?.status,
    raw.status,
    raw.estado,
    raw.state,
    raw.lifecycle?.status
  );
}

function getStatusKey(value = "") {
  const key = normalizeKey(value);

  if (["pending", "pendiente", "new", "nueva", "nuevo", "created"].includes(key)) return "pending";
  if (["open", "abierta", "abierto"].includes(key)) return "open";

  if (["progress", "in_progress", "inprogress", "en_proceso", "proceso", "working", "trabajando", "assigned", "asignada", "asignado"].includes(key)) return "progress";

  if (["resolved", "resuelta", "resuelto", "solved"].includes(key)) return "resolved";

  if (["closed", "cerrada", "cerrado", "cancelled", "canceled", "cancelada", "cancelado", "archived", "archivada", "archivado"].includes(key)) return "closed";

  return "pending";
}

function getStatusLabel(value = "") {
  const key = getStatusKey(value);

  if (key === "open") return "Abierta";
  if (key === "pending") return "Pendiente";
  if (key === "progress") return "En proceso";
  if (key === "resolved") return "Resuelta";
  if (key === "closed") return "Cerrada";

  return safeText(value, "Pendiente");
}

function getPriorityRaw(item = {}) {
  const raw = getRaw(item);

  return first(
    item.priority,
    item.prioridad,
    item.severity,
    item.urgency,
    item.sla?.priority,
    raw.priority,
    raw.prioridad,
    raw.severity,
    raw.urgency,
    raw.sla?.priority,
    "medium"
  );
}

function getPriorityKey(item = {}) {
  const key = normalizeKey(getPriorityRaw(item));

  if (["critical", "critica", "crítica", "critico", "crítico", "p0"].includes(key)) return "critical";
  if (["urgent", "urgente", "high", "alta", "p1"].includes(key)) return "urgent";
  if (["medium", "media", "normal", "p2"].includes(key)) return "medium";
  if (["low", "baja", "minor", "p3"].includes(key)) return "low";

  return "medium";
}

function getPriorityLabel(item = {}) {
  const key = getPriorityKey(item);

  if (key === "critical") return "Crítica";
  if (key === "urgent") return "Urgente";
  if (key === "medium") return "Media";
  if (key === "low") return "Baja";

  return "Media";
}

function getCategory(item = {}) {
  const raw = getRaw(item);

  return safeText(
    first(
      item.category,
      item.categoria,
      item.type,
      item.tipo,
      item.subcategory,
      item.subcategoria,
      raw.category,
      raw.categoria,
      raw.type,
      raw.tipo,
      raw.subcategory,
      raw.subcategoria
    ),
    "Soporte"
  );
}

function getAssignedTo(item = {}) {
  const raw = getRaw(item);

  return safeText(
    first(
      item.assignedToName,
      item.technicianName,
      item.tecnicoName,
      item.assignment?.assignedToName,
      item.assignment?.agentName,
      item.assignment?.technicianName,
      item.assignment?.displayName,
      item.assignment?.name,
      item.tecnico?.name,
      item.tecnico?.nombre,
      item.tecnico?.displayName,
      typeof item.tecnico === "string" ? item.tecnico : "",
      item.assignedTo?.name,
      item.assignedTo?.nombre,
      item.assignedTo?.displayName,
      typeof item.assignedTo === "string" ? item.assignedTo : "",
      item.agent?.name,
      item.agent?.displayName,
      typeof item.agent === "string" ? item.agent : "",
      item.meta?.technicianName,
      item.meta?.lastTechnicianName,
      raw.assignedToName,
      raw.technicianName,
      raw.tecnicoName,
      raw.assignment?.assignedToName,
      raw.assignment?.agentName,
      raw.assignment?.technicianName,
      raw.assignment?.displayName,
      raw.assignment?.name,
      raw.tecnico?.name,
      raw.tecnico?.nombre,
      raw.tecnico?.displayName,
      typeof raw.tecnico === "string" ? raw.tecnico : "",
      raw.assignedTo?.name,
      raw.assignedTo?.nombre,
      raw.assignedTo?.displayName,
      typeof raw.assignedTo === "string" ? raw.assignedTo : "",
      raw.agent?.name,
      raw.agent?.displayName,
      typeof raw.agent === "string" ? raw.agent : "",
      raw.meta?.technicianName,
      raw.meta?.lastTechnicianName
    ),
    "Sin asignar"
  );
}

function getAssignedEmail(item = {}) {
  const raw = getRaw(item);

  return safeText(
    first(
      item.assignedToEmail,
      item.technicianEmail,
      item.tecnicoEmail,
      item.assignment?.assignedToEmail,
      item.assignment?.agentEmail,
      item.assignment?.technicianEmail,
      item.assignment?.email,
      item.tecnico?.email,
      item.assignedTo?.email,
      item.agentEmail,
      item.agent?.email,
      item.meta?.technicianEmail,
      raw.assignedToEmail,
      raw.technicianEmail,
      raw.tecnicoEmail,
      raw.assignment?.assignedToEmail,
      raw.assignment?.agentEmail,
      raw.assignment?.technicianEmail,
      raw.assignment?.email,
      raw.tecnico?.email,
      raw.assignedTo?.email,
      raw.agentEmail,
      raw.agent?.email,
      raw.meta?.technicianEmail
    ),
    ""
  ).toLowerCase();
}

function getAssignedAvatarUrl(item = {}) {
  const raw = getRaw(item);

  return safeText(
    first(
      item.assignedToAvatar,
      item.tecnicoAvatar,
      item.technicianAvatar,
      item.agentAvatar,
      item.assignment?.assignedToAvatar,
      item.assignment?.agentAvatar,
      item.assignment?.technicianAvatar,
      item.assignment?.avatar,
      item.assignment?.avatarUrl,
      item.tecnico?.avatar,
      item.tecnico?.avatarUrl,
      item.assignedTo?.avatar,
      item.assignedTo?.avatarUrl,
      item.agent?.avatar,
      item.agent?.avatarUrl,
      item.meta?.technicianAvatar,
      item.meta?.technicianAvatarUrl,
      raw.assignedToAvatar,
      raw.tecnicoAvatar,
      raw.technicianAvatar,
      raw.agentAvatar,
      raw.assignment?.assignedToAvatar,
      raw.assignment?.agentAvatar,
      raw.assignment?.technicianAvatar,
      raw.assignment?.avatar,
      raw.assignment?.avatarUrl,
      raw.tecnico?.avatar,
      raw.tecnico?.avatarUrl,
      raw.assignedTo?.avatar,
      raw.assignedTo?.avatarUrl,
      raw.agent?.avatar,
      raw.agent?.avatarUrl,
      raw.meta?.technicianAvatar,
      raw.meta?.technicianAvatarUrl
    ),
    ""
  );
}

function getImporteAmount(item = {}) {
  const raw = getRaw(item);

  return first(
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
    raw.facturasTotal,
    raw.invoicesTotal,
    raw.importeFacturas,
    raw.invoiceTotal,
    raw.facturaTotal,
    raw.facturaImporte,
    raw.importeFactura,
    raw.totalFactura,
    raw.invoiceAmount,
    raw.linkedInvoices?.total,
    raw.linkedInvoices?.amount,
    raw.linkedInvoices?.importe,
    raw.meta?.invoicesTotal,
    raw.meta?.invoiceTotal
  );
}

function getImporteCurrency(item = {}) {
  const raw = getRaw(item);

  return safeText(
    first(
      item.currency,
      item.moneda,
      item.linkedInvoices?.currency,
      item.linkedInvoices?.moneda,
      item.meta?.invoiceCurrency,
      item.meta?.currency,
      item.meta?.moneda,
      raw.currency,
      raw.moneda,
      raw.linkedInvoices?.currency,
      raw.linkedInvoices?.moneda,
      raw.meta?.invoiceCurrency,
      raw.meta?.currency,
      raw.meta?.moneda,
      DEFAULT_CURRENCY
    ),
    DEFAULT_CURRENCY
  );
}

function getPaymentStatusKey(item = {}) {
  const raw = getRaw(item);

  const key = normalizeKey(
    first(
      item.paymentStatus,
      item.estadoPago,
      item.linkedInvoices?.paymentStatus,
      item.linkedInvoices?.estadoPago,
      raw.paymentStatus,
      raw.estadoPago,
      raw.linkedInvoices?.paymentStatus,
      raw.linkedInvoices?.estadoPago
    )
  );

  if (["paid", "pagada", "pagado", "cobrada", "cobrado"].includes(key)) return "paid";
  if (["pending", "pendiente", "unpaid"].includes(key)) return "pending";
  if (["partial", "parcial", "pago_parcial"].includes(key)) return "partial";
  if (["overdue", "vencida", "vencido"].includes(key)) return "overdue";

  return "";
}

function getImporteLabel(item = {}) {
  const amount = getImporteAmount(item);

  if (amount !== null && amount !== undefined && amount !== "") {
    const numericAmount = safeNumber(amount, NaN);

    if (Number.isFinite(numericAmount)) {
      return formatMoney(numericAmount, getImporteCurrency(item));
    }
  }

  const paymentKey = getPaymentStatusKey(item);

  if (paymentKey === "paid") return "Pagado";
  if (paymentKey === "pending") return "Pendiente";
  if (paymentKey === "partial") return "Parcial";
  if (paymentKey === "overdue") return "Vencido";

  return "—";
}

function getCreatedAt(item = {}) {
  const raw = getRaw(item);

  return first(
    item.createdAt,
    item.fechaCreacion,
    item.createdAtES,
    item.date,
    item.lifecycle?.createdAt,
    raw.createdAt,
    raw.fechaCreacion,
    raw.createdAtES,
    raw.date,
    raw.lifecycle?.createdAt
  );
}

function getUpdatedAt(item = {}) {
  const raw = getRaw(item);

  return first(
    item.lastActivityAt,
    item.updatedAt,
    item.lastUpdateAt,
    item.ultimaNovedad,
    item.modifiedAt,
    item.closedAt,
    item.createdAt,
    item.lifecycle?.updatedAt,
    item.lifecycle?.lastUpdateAt,
    item.audit?.updatedAt,
    raw.lastActivityAt,
    raw.updatedAt,
    raw.lastUpdateAt,
    raw.ultimaNovedad,
    raw.modifiedAt,
    raw.closedAt,
    raw.createdAt,
    raw.lifecycle?.updatedAt,
    raw.lifecycle?.lastUpdateAt,
    raw.audit?.updatedAt
  );
}

function getAttachmentsCount(item = {}) {
  const raw = getRaw(item);

  const attachments = first(
    item.attachments,
    item.files,
    item.adjuntos,
    raw.attachments,
    raw.files,
    raw.adjuntos
  );

  if (Array.isArray(attachments)) return attachments.length;

  return safeNumber(
    first(
      item.attachmentsCount,
      item.filesCount,
      item.adjuntosCount,
      raw.attachmentsCount,
      raw.filesCount,
      raw.adjuntosCount,
      0
    ),
    0
  );
}

function isClosedLike(item = {}) {
  return ["closed", "resolved"].includes(getStatusKey(getStatusRaw(item)));
}

function isOpenLike(item = {}) {
  return ["open", "pending", "progress"].includes(getStatusKey(getStatusRaw(item)));
}

function isUrgentLike(item = {}) {
  return ["urgent", "critical"].includes(getPriorityKey(item));
}

function getSearchHaystack(item = {}) {
  const raw = getRaw(item);

  return [
    getTicketId(item),
    getSubject(item),
    getDescription(item),
    getClientName(item),
    getClientEmail(item),
    getCategory(item),
    getAssignedTo(item),
    getAssignedEmail(item),
    getStatusLabel(getStatusRaw(item)),
    getPriorityLabel(item),
    getImporteLabel(item),
    item.userId,
    item.clienteId,
    raw.userId,
    raw.clienteId,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" · ");
}

function itemMatchesFilter(item = {}, filter = "all") {
  const key = normalizeFilter(filter);

  if (key === "all") return true;
  if (key === "open") return isOpenLike(item);
  if (key === "closed") return isClosedLike(item);

  return true;
}

function itemMatchesSearch(item = {}, query = "") {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) return true;

  const terms = normalizedQuery.split(" ").filter(Boolean);
  const haystack = getSearchHaystack(item);

  return terms.every((term) => haystack.includes(term));
}

function computeFilterCounts(items = [], input = {}) {
  const rows = safeArray(items);
  const searchQuery = getSearchQuery(input);
  const searchableRows = rows.filter((item) => itemMatchesSearch(item, searchQuery));

  return FILTERS.reduce((acc, filter) => {
    acc[filter.key] = searchableRows.filter((item) => itemMatchesFilter(item, filter.key)).length;
    return acc;
  }, {});
}

function computeStats(items = []) {
  return safeArray(items).reduce(
    (acc, item) => {
      acc.total += 1;
      acc.totalImporte += safeNumber(getImporteAmount(item), 0);
      acc.attachmentsCount += getAttachmentsCount(item);

      if (isOpenLike(item)) acc.openCount += 1;
      if (isClosedLike(item)) acc.closedCount += 1;
      if (isUrgentLike(item)) acc.urgentCount += 1;

      return acc;
    },
    {
      total: 0,
      openCount: 0,
      closedCount: 0,
      urgentCount: 0,
      attachmentsCount: 0,
      totalImporte: 0,
    }
  );
}

function resolveBusyMeta(item = {}, state = {}) {
  const runtime = safeObject(state);
  const ticketId = getTicketId(item);

  return {
    ticketId,
    isOpening: safeText(
      first(
        runtime.openingTicketId,
        runtime.openingIncidenciaId,
        runtime.detailTicketId,
        runtime.loadingTicketId
      ),
      ""
    ) === ticketId,
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
    <span class="incidencias-loader-only" role="status" ${tooltipAttrs(label, label)}>
      <span class="incidencias-inline-spinner" aria-hidden="true"></span>
    </span>
  `;
}

function renderAvatar(item = {}) {
  const fullName = getClientName(item);
  const initials = getInitials(fullName);
  const avatarUrl = getAvatarUrl(item);
  const tone = getAvatarTone(item);

  if (avatarUrl) {
    return `
      <div
        class="incidencias-avatar"
        ${tooltipAttrs(fullName, fullName)}
        data-avatar-tone="${escapeHtml(tone)}"
        data-has-avatar="true"
        data-fallback="false"
        data-incidencias-avatar="true"
      >
        <img
          class="incidencias-avatar-img"
          src="${escapeHtml(avatarUrl)}"
          alt="${escapeHtml(fullName)}"
          loading="lazy"
          referrerpolicy="no-referrer"
          data-incidencias-avatar-img="true"
        />
        <span class="incidencias-avatar-fallback">${escapeHtml(initials)}</span>
      </div>
    `;
  }

  return `
    <div
      class="incidencias-avatar incidencias-avatar--fallback"
      ${tooltipAttrs(fullName, fullName)}
      data-avatar-tone="${escapeHtml(tone)}"
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
    <span class="incidencias-chip incidencias-chip--${escapeHtml(key)}">
      <span class="incidencias-chip-dot" aria-hidden="true"></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function renderPriorityBadge(item = {}) {
  const key = getPriorityKey(item);
  const label = getPriorityLabel(item);
  const tooltip = `Prioridad ${label}`;

  return `
    <span class="incidencias-mini-badge incidencias-mini-badge--${escapeHtml(key)}" ${tooltipAttrs(tooltip, tooltip)}>
      ${key === "critical" || key === "urgent" ? icon("alert") : icon("activity")}
      ${escapeHtml(label)}
    </span>
  `;
}

function renderAssignedAvatar(item = {}) {
  const assigned = getAssignedTo(item);
  const assignedEmail = getAssignedEmail(item);
  const assignedInitials = getInitials(assigned);
  const avatarUrl = getAssignedAvatarUrl(item);

  if (!avatarUrl) {
    return `
      <span class="incidencias-agent-avatar incidencias-agent-avatar--fallback" aria-hidden="true">
        <span class="incidencias-agent-avatar-fallback">${escapeHtml(assignedInitials)}</span>
      </span>
    `;
  }

  return `
    <span
      class="incidencias-agent-avatar incidencias-agent-avatar--image"
      ${tooltipAttrs(assignedEmail || assigned, assignedEmail || assigned)}
      data-technician-avatar="true"
      data-avatar-fallback-index="0"
      data-avatar-fallback-srcs="${escapeHtml(avatarUrl)}"
      data-fallback="false"
      aria-hidden="true"
    >
      <img
        class="incidencias-agent-avatar-img"
        src="${escapeHtml(avatarUrl)}"
        alt=""
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
        draggable="false"
        data-incidencias-agent-avatar-img="true"
      />
      <span class="incidencias-agent-avatar-fallback">${escapeHtml(assignedInitials)}</span>
    </span>
  `;
}

function renderAssignedBadge(item = {}) {
  const assigned = getAssignedTo(item);
  const assignedEmail = getAssignedEmail(item);
  const tooltip = `Técnico · ${assigned}${assignedEmail ? ` · ${assignedEmail}` : ""}`;

  return `
    <span
      class="incidencias-mini-badge incidencias-mini-badge--agent"
      ${tooltipAttrs(tooltip, tooltip)}
      data-assigned-technician="${escapeHtml(assigned)}"
      data-assigned-email="${escapeHtml(assignedEmail)}"
    >
      ${renderAssignedAvatar(item)}
      ${escapeHtml(assigned)}
    </span>
  `;
}

function renderImporteChip(item = {}) {
  const label = getImporteLabel(item);
  const isMoney = /€|EUR|\$|USD|£|GBP/i.test(label);
  const paymentKey = getPaymentStatusKey(item) || "idle";

  if (isMoney) {
    return `
      <span class="incidencias-importe incidencias-importe--money incidencias-importe--${escapeHtml(paymentKey)}">
        ${icon("euro")}
        ${escapeHtml(label)}
      </span>
    `;
  }

  return `
    <span class="incidencias-importe incidencias-importe--status incidencias-importe--${escapeHtml(paymentKey)}">
      ${escapeHtml(label)}
    </span>
  `;
}

function renderActionButton({
  action = "open-ticket",
  ticketId = "",
  label = "Detalle",
  loadingLabel = "Cargando detalle",
  loading = false,
  disabled = false,
  iconName = "eye",
  tooltip = "",
} = {}) {
  const finalDisabled = disabled || loading;
  const finalTooltip = tooltip || label;

  return `
    <button
      type="button"
      class="incidencias-detail-btn${loading ? " is-loading" : ""}"
      ${actionAttrs(action, ticketId)}
      ${tooltipAttrs(finalTooltip, finalTooltip)}
      ${disabledAttrs(finalDisabled, loading)}
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
   TABLE PARTIALS
========================================================= */

function renderRow(item = {}, state = {}) {
  const runtime = safeObject(state);
  const busy = resolveBusyMeta(item, runtime);
  const ticketId = busy.ticketId;
  const subject = getSubject(item);
  const description = getDescription(item);
  const clientName = getClientName(item);
  const clientEmail = getClientEmail(item) || "Sin email";
  const createdAtRaw = getCreatedAt(item);
  const updatedAtRaw = getUpdatedAt(item);
  const createdAt = formatDateTime(createdAtRaw);
  const updatedAt = formatLastUpdate(updatedAtRaw);
  const updatedAtFull = formatDateTooltip(updatedAtRaw);
  const attachmentsCount = getAttachmentsCount(item);
  const category = getCategory(item);
  const statusKey = getStatusKey(getStatusRaw(item));

  return `
    <tr
      class="incidencias-row incidencias-row--${escapeHtml(statusKey)} incidencias-row--clickable"
      data-ticket-row="true"
      data-ticket-id="${escapeHtml(ticketId)}"
      data-incidencia-id="${escapeHtml(ticketId)}"
      data-detail-target="true"
      data-row-click-disabled="false"
      role="button"
      tabindex="0"
      ${tooltipAttrs(`Abrir detalle de incidencia ${ticketId}`, `Abrir detalle de incidencia ${ticketId}`)}
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
        <span class="incidencias-date-inline" ${tooltipAttrs(createdAt, `Fecha de creación ${createdAt}`)}>
          ${escapeHtml(createdAt)}
        </span>
      </td>

      <td class="incidencias-cell incidencias-cell--date">
        <span class="incidencias-date-inline" ${tooltipAttrs(updatedAtFull, `Última novedad ${updatedAtFull}`)}>
          ${escapeHtml(updatedAt)}
        </span>
      </td>

      <td class="incidencias-cell incidencias-cell--importe">
        ${renderImporteChip(item)}
      </td>

      <td class="incidencias-cell incidencias-cell--attachments">
        <span
          class="incidencias-attachments-pill"
          ${tooltipAttrs(`${attachmentsCount} adjunto${attachmentsCount === 1 ? "" : "s"}`, `${attachmentsCount} adjunto${attachmentsCount === 1 ? "" : "s"}`)}
        >
          ${icon("paperclip")}
          ${escapeHtml(String(attachmentsCount))}
        </span>
      </td>

      <td class="incidencias-cell incidencias-cell--actions">
        ${renderActionButton({
          ticketId,
          loading: busy.isOpening,
          label: "Detalle",
          loadingLabel: "Cargando detalle",
          iconName: "eye",
          tooltip: "Abrir detalle de incidencia",
        })}
      </td>
    </tr>
  `;
}

function renderPagination(pagination = {}, state = {}) {
  const runtime = safeObject(state);
  const loading = Boolean(runtime.loading);
  const refreshing = Boolean(runtime.refreshing);

  const prevDisabled = !pagination.hasPrev || loading || refreshing;
  const nextDisabled = !pagination.hasNext || loading || refreshing;

  return `
    <div class="incidencias-pagination" aria-label="Paginación de incidencias">
      <button
        type="button"
        class="incidencias-pagination-btn"
        ${actionAttrs("prev-page")}
        data-page="${escapeHtml(String(Math.max(1, pagination.currentPage - 1)))}"
        ${disabledAttrs(prevDisabled)}
      >
        Anterior
      </button>

      <span class="incidencias-pagination-status">
        ${escapeHtml(`${pagination.currentPage}/${pagination.totalPages}`)}
      </span>

      <button
        type="button"
        class="incidencias-pagination-btn incidencias-pagination-btn--next"
        ${actionAttrs("next-page")}
        data-page="${escapeHtml(String(Math.min(pagination.totalPages, pagination.currentPage + 1)))}"
        ${disabledAttrs(nextDisabled)}
      >
        Siguiente
      </button>
    </div>
  `;
}

function renderSearch(input = {}) {
  const searchQuery = getSearchQuery(input);

  return `
    <div class="incidencias-search" role="search" aria-label="Buscar incidencias">
      <span class="incidencias-search-icon" aria-hidden="true">${icon("search")}</span>

      <input
        id="incidencias-search-input"
        class="incidencias-search-input"
        type="search"
        value="${escapeHtml(searchQuery)}"
        placeholder="Buscar cliente, email, asunto, ID..."
        autocomplete="off"
        spellcheck="false"
        data-incidencias-search-input="true"
        data-incidencias-field="search"
        data-field="search"
        aria-label="Buscar incidencias por cliente, email, asunto o identificador"
      />

      ${
        searchQuery
          ? `
            <button
              type="button"
              class="incidencias-search-clear"
              data-incidencias-action="clear-search"
              data-action="clear-search"
              ${tooltipAttrs("Limpiar búsqueda", "Limpiar búsqueda")}
            >
              ${icon("close")}
            </button>
          `
          : ""
      }
    </div>
  `;
}

function renderFilters(input = {}, pagination = {}) {
  const data = safeObject(input);
  const items = getInputItems(data);
  const counts = computeFilterCounts(items, data);
  const activeFilter = normalizeFilter(pagination.activeFilter || getActiveFilter(data));

  return `
    <div class="incidencias-filters" aria-label="Filtros y búsqueda de incidencias">
      <div class="incidencias-filter-pills" role="group" aria-label="Filtrar incidencias por estado">
        ${FILTERS.map((filter) => {
          const isActive = filter.key === activeFilter;
          const count = counts[filter.key] ?? 0;

          return `
            <button
              type="button"
              class="incidencias-filter-pill${isActive ? " is-active" : ""}"
              data-incidencias-action="filter"
              data-action="filter-incidencias"
              data-filter="${escapeHtml(filter.key)}"
              data-filter-status="${escapeHtml(filter.key)}"
              aria-pressed="${isActive ? "true" : "false"}"
            >
              <span>${escapeHtml(filter.label)}</span>
              <strong>${escapeHtml(String(count))}</strong>
            </button>
          `;
        }).join("")}
      </div>

      ${renderSearch(data)}
    </div>
  `;
}

function renderEmptyState({ hasError = false, filtering = false, searchQuery = "" } = {}) {
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
              ? searchQuery
                ? `No se encontraron incidencias para “${escapeHtml(searchQuery)}”. Prueba con otro nombre, email, asunto o identificador.`
                : "Cambia el filtro activo para volver al historial completo."
              : "Cuando haya solicitudes registradas aparecerán aquí con su estado, seguimiento, adjuntos, facturación asociada y acciones disponibles."
        }
      </p>

      ${
        hasError
          ? `
            <button type="button" class="incidencias-btn incidencias-btn--primary" data-incidencias-action="retry" data-action="retry">
              ${icon("refresh")}
              <span class="incidencias-btn-text">Reintentar</span>
            </button>
          `
          : filtering
            ? `
              <button type="button" class="incidencias-btn" data-incidencias-action="clear-filters" data-action="clear-filters">
                ${icon("close")}
                <span class="incidencias-btn-text">Limpiar filtros</span>
              </button>
            `
            : ""
      }
    </div>
  `;
}

function renderTableLoading(rows = DEFAULT_PAGE_SIZE) {
  return `
    <div class="incidencias-table-loading" aria-hidden="true">
      ${Array.from({ length: rows }).map(() => `
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

/* =========================================================
   HEADER
========================================================= */

export function renderHeader(input = {}) {
  const data = safeObject(input);
  const rows = getInputItems(data);
  const runtime = getRuntimeState(data);
  const stats = computeStats(rows);

  const remoteCount = Math.max(
    stats.total,
    safeNumber(
      first(
        data.remoteCount,
        data.totalCount,
        runtime.remoteCount,
        runtime.totalCount,
        runtime.total,
        stats.total
      ),
      stats.total
    )
  );

  const updatedAt = first(
    data.lastUpdatedAt,
    runtime.lastSyncAt,
    data.updatedAt,
    runtime.updatedAt,
    ...rows.map((item) => getUpdatedAt(item))
  );

  const title = safeText(first(data.title, runtime.title, "Tus incidencias y solicitudes"), "Tus incidencias y solicitudes");
  const subtitle = safeText(first(data.subtitle, runtime.subtitle, "Consulta el estado de tus incidencias, revisa actualizaciones y crea nuevas solicitudes."), "");

  const creating = Boolean(first(runtime.creating, runtime.creatingIncidencia, data.creating));
  const refreshing = Boolean(first(runtime.refreshing, data.refreshing));
  const loading = Boolean(first(runtime.loading, data.loading));

  return `
    <section class="incidencias-hero">
      <div class="incidencias-hero-top">
        <div class="incidencias-hero-copy">
          <h1 class="incidencias-page-title">${escapeHtml(title)}</h1>
          <p class="incidencias-page-subtitle">${escapeHtml(subtitle)}</p>
        </div>

        <div class="incidencias-hero-actions incidencias-hero-actions--facturas-order">
          <button
            type="button"
            id="incidencias-export-btn"
            class="incidencias-btn incidencias-btn--ghost incidencias-btn--export"
            data-incidencias-action="export"
            data-action="export-csv"
            ${disabledAttrs(loading || refreshing || !rows.length)}
          >
            ${icon("export")}
            <span class="incidencias-btn-text">Exportar CSV</span>
          </button>

          <button
            type="button"
            id="incidencias-create-btn"
            class="incidencias-btn incidencias-btn--create${creating ? " is-loading" : ""}"
            data-incidencias-action="create"
            data-action="create-incidencia"
            ${disabledAttrs(creating, creating)}
          >
            ${creating ? renderSpinner("Abriendo...") : `${icon("plus")}<span class="incidencias-btn-text">Crear incidencia</span>`}
          </button>

          <button
            type="button"
            id="incidencias-refresh-btn"
            class="incidencias-btn incidencias-btn--accent incidencias-btn--refresh${refreshing ? " is-loading" : ""}"
            data-incidencias-action="refresh"
            data-action="refresh"
            ${disabledAttrs(refreshing || loading, refreshing)}
          >
            ${refreshing ? renderSpinner("Actualizando...") : `${icon("refresh")}<span class="incidencias-btn-text">Actualizar</span>`}
          </button>
        </div>
      </div>

      <div class="incidencias-hero-meta">
        <span class="incidencias-meta-pill">${icon("ticket")}${escapeHtml(`${remoteCount} solicitudes registradas`)}</span>
        <span class="incidencias-meta-pill">${icon("refresh")}${updatedAt ? escapeHtml(`Última actualización · ${formatRelativeDate(updatedAt)}`) : "Sin actualizaciones recientes"}</span>
        <span class="incidencias-meta-pill">${icon("paperclip")}${escapeHtml(`${stats.attachmentsCount} adjuntos`)}</span>
        <span class="incidencias-meta-pill">${icon("euro")}${escapeHtml(formatMoney(stats.totalImporte, DEFAULT_CURRENCY))}</span>
      </div>

      <div class="incidencias-stats">
        <article class="incidencias-stat-card incidencias-stat-card--open">
          <div class="incidencias-stat-label">Abiertas</div>
          <div class="incidencias-stat-value">${escapeHtml(String(stats.openCount))}</div>
          <div class="incidencias-stat-text">Solicitudes activas, pendientes o en proceso.</div>
        </article>

        <article class="incidencias-stat-card incidencias-stat-card--closed">
          <div class="incidencias-stat-label">Cerradas</div>
          <div class="incidencias-stat-value">${escapeHtml(String(stats.closedCount))}</div>
          <div class="incidencias-stat-text">Casos resueltos, cerrados o archivados.</div>
        </article>

        <article class="incidencias-stat-card incidencias-stat-card--urgent">
          <div class="incidencias-stat-label">Urgentes</div>
          <div class="incidencias-stat-value">${escapeHtml(String(stats.urgentCount))}</div>
          <div class="incidencias-stat-text">Incidencias marcadas como urgentes o críticas.</div>
        </article>

        <article class="incidencias-stat-card incidencias-stat-card--amount">
          <div class="incidencias-stat-label">Importe asociado</div>
          <div class="incidencias-stat-value">${escapeHtml(formatMoney(stats.totalImporte, DEFAULT_CURRENCY))}</div>
          <div class="incidencias-stat-text">Total vinculado a facturas visibles.</div>
        </article>
      </div>
    </section>
  `;
}

/* =========================================================
   LOADING / ERROR
========================================================= */

export function renderLoadingState() {
  return `
    <section class="incidencias-history">
      ${renderTableLoading(DEFAULT_PAGE_SIZE)}
    </section>
  `;
}

export function renderErrorState(message = "No se pudieron cargar las incidencias.") {
  return `
    <section class="incidencias-error">
      <h3 class="incidencias-error-title">No se pudo renderizar la vista de incidencias</h3>
      <p class="incidencias-error-text">${escapeHtml(safeText(message, "Error desconocido al cargar la vista."))}</p>
    </section>
  `;
}

/* =========================================================
   MAIN TABLE
========================================================= */

export function renderTable(input = {}) {
  const data = safeObject(input);
  const runtime = getRuntimeState(data);
  const pagination = getPagination(data);

  const loading = Boolean(first(runtime.loading, data.loading));
  const refreshing = Boolean(first(runtime.refreshing, data.refreshing));
  const hasError = Boolean(safeText(first(runtime.error, data.error), ""));

  const showInitialLoading = loading && !pagination.pageItems.length;
  const showRefreshOverlay = refreshing && pagination.pageItems.length;

  const activeFilterLabel = FILTERS.find((item) => item.key === pagination.activeFilter)?.label || "Todas";
  const activeCriteria = [
    pagination.activeFilter !== "all" ? activeFilterLabel : "",
    pagination.searchQuery ? `búsqueda “${pagination.searchQuery}”` : "",
  ].filter(Boolean);

  const subtitle = showInitialLoading
    ? "Cargando incidencias..."
    : pagination.filtering
      ? `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · ${activeCriteria.join(" · ")}`
      : `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · página ${pagination.currentPage} de ${pagination.totalPages}`;

  return `
    <section class="incidencias-history">
      <div class="incidencias-history-head" data-incidencias-history-head="true">
        <div class="incidencias-history-copy">
          <h2 class="incidencias-history-title">Historial de incidencias</h2>
          <p class="incidencias-history-subtitle">${escapeHtml(subtitle)}</p>
        </div>

        ${renderPagination(pagination, runtime)}
        ${renderFilters(data, pagination)}
      </div>

      ${
        showInitialLoading
          ? renderTableLoading(Math.max(3, pagination.pageSize || DEFAULT_PAGE_SIZE))
          : `
            <div class="incidencias-table-wrap${refreshing ? " is-refreshing" : ""}">
              ${showRefreshOverlay ? renderRefreshOverlay() : ""}

              ${
                pagination.pageItems.length
                  ? `
                    <div class="incidencias-table-shell">
                      <table class="incidencias-table" role="table" aria-label="Listado de incidencias">
                        <colgroup>
                          <col class="incidencias-col incidencias-col--main">
                          <col class="incidencias-col incidencias-col--status">
                          <col class="incidencias-col incidencias-col--created">
                          <col class="incidencias-col incidencias-col--updated">
                          <col class="incidencias-col incidencias-col--importe">
                          <col class="incidencias-col incidencias-col--attachments">
                          <col class="incidencias-col incidencias-col--actions">
                        </colgroup>

                        <thead data-incidencias-table-head="true">
                          <tr>
                            <th scope="col">Incidencia / cliente</th>
                            <th scope="col">Estado</th>
                            <th scope="col">Creación</th>
                            <th scope="col">Última novedad</th>
                            <th scope="col">Importe</th>
                            <th scope="col">Adj.</th>
                            <th scope="col">Acciones</th>
                          </tr>
                        </thead>

                        <tbody>
                          ${pagination.pageItems.map((item) => renderRow(item, runtime)).join("")}
                        </tbody>
                      </table>
                    </div>
                  `
                  : renderEmptyState({
                      hasError,
                      filtering: pagination.filtering,
                      searchQuery: pagination.searchQuery,
                    })
              }
            </div>
          `
      }
    </section>
  `;
}

export const renderCards = renderTable;

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function renderIncidenciasTableTemplate(input = {}) {
  const data = safeObject(input);
  const items = getInputItems(data);
  const runtime = getRuntimeState(data);
  const error = safeText(first(runtime.error, data.error), "");

  if (error && !items.length) {
    return `
      <section class="incidencias-view-root" data-incidencias-scope="true">
        ${renderErrorState(error)}
      </section>
    `;
  }

  const payload = {
    ...data,
    items,
    state: runtime,
  };

  return `
    <section class="incidencias-view-root" data-incidencias-scope="true">
      ${renderHeader(payload)}
      ${renderTable(payload)}
    </section>
  `;
}

/* =========================================================
   DOM FALLBACKS · CSP CLEAN
========================================================= */

function bindImageFallback({
  img,
  container,
  fallbackClass = "",
  hasImageClass = "",
  fallbackSources = [],
} = {}) {
  if (!img || img.dataset.incImageFallbackBound === "true") return false;

  img.dataset.incImageFallbackBound = "true";

  const sources = Array.from(
    new Set(
      safeArray(fallbackSources)
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    )
  );

  const markFallback = () => {
    try {
      if (container) {
        container.setAttribute("data-fallback", "true");
        container.setAttribute("data-has-avatar", "false");
        if (fallbackClass) container.classList.add(fallbackClass);
        if (hasImageClass) container.classList.remove(hasImageClass);
      }

      img.hidden = true;
    } catch {}
  };

  const tryNextSource = () => {
    try {
      const currentSrc = safeText(img.getAttribute("src"), "");
      const currentIndex = safeNumber(container?.dataset?.avatarFallbackIndex, 0);
      const nextIndex = currentIndex + 1;
      const nextSource = sources[nextIndex];

      if (nextSource && nextSource !== currentSrc) {
        if (container) container.dataset.avatarFallbackIndex = String(nextIndex);
        img.hidden = false;
        img.setAttribute("src", nextSource);
        return true;
      }
    } catch {}

    markFallback();
    return false;
  };

  img.addEventListener("error", tryNextSource, { passive: true });

  if (img.complete && img.naturalWidth === 0) {
    tryNextSource();
  }

  return true;
}

function bindClientAvatarFallbacks(scope) {
  const images = scope.querySelectorAll("[data-incidencias-avatar-img='true']");

  images.forEach((img) => {
    const avatar = img.closest("[data-incidencias-avatar='true']");

    bindImageFallback({
      img,
      container: avatar,
      fallbackClass: "incidencias-avatar--fallback",
      hasImageClass: "has-image",
      fallbackSources: [safeText(img.getAttribute("src"), "")],
    });
  });
}

function bindAgentAvatarFallbacks(scope) {
  const images = scope.querySelectorAll("[data-incidencias-agent-avatar-img='true']");

  images.forEach((img) => {
    const avatar = img.closest("[data-technician-avatar='true']");

    const fallbackSources = safeText(avatar?.dataset?.avatarFallbackSrcs, "")
      .split("|")
      .map((value) => safeText(value, ""))
      .filter(Boolean);

    bindImageFallback({
      img,
      container: avatar,
      fallbackClass: "incidencias-agent-avatar--fallback",
      hasImageClass: "incidencias-agent-avatar--image",
      fallbackSources,
    });
  });
}

export function bindIncidenciasTemplateDom(root = null) {
  const scope = root || (typeof document !== "undefined"
    ? document.querySelector(".incidencias-view-root, [data-incidencias-scope]")
    : null);

  if (!scope || typeof scope.querySelectorAll !== "function") return false;

  bindClientAvatarFallbacks(scope);
  bindAgentAvatarFallbacks(scope);

  return true;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default renderIncidenciasTableTemplate;
