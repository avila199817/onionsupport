/* =========================================================
   Onion SPA - Facturas Template
   Archivo: src/views/facturas/facturas.template.js

   FINAL PRODUCTION TEMPLATE · FACTURAS 10/10 · VISUAL FIX
   PATCH · PAGINATION 5 ITEMS · INCIDENCIA MODAL READY
   PATCH · ADMIN CREATE BUTTON · COMPACT TABLE · BUTTON HOVER FIX
   PATCH · ONION TOKENS FULL · DARK/LIGHT MODE 10/10
   PATCH · AVATAR USER-STABLE COLORS · STATUS CHIPS FIX · LOADER FIX
   PATCH · SORT DESC BY NEWEST INVOICES

   RESPONSABILIDADES:
   - render del hero/header de facturas
   - render de tabla productiva con paginación real
   - compatibilidad con FacturasView.js
   - acciones compatibles con data-facturas-action y data-action
   - botón admin "Crear factura"
   - paginación compacta de 5 items
   - enlace a incidencia relacionada listo para modal
   - loaders sin mover columnas ni tamaño de botones
   - loader icon-only centrado en acciones
   - loading overlay en refresh sin desplazar tabla
   - dark/light mode conectado a variables.css + ui.css
   - chips de pago con contraste real en dark
   - avatares fallback con colores pseudo-RNG estables por usuario
   - misma persona = mismo color de avatar en todas sus facturas
   - tabla ordenada siempre de más reciente a menos reciente
   - tabla compacta premium SaaS
   - estados loading/error/empty blindados
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_PAGE_SIZE = 5;

const ADMIN_ROLES = new Set([
  "admin",
  "administrator",
  "superadmin",
  "super_admin",
  "root",
  "owner",
]);

/* =========================================================
   HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
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

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .trim();
}

function normalizeRole(value = "") {
  return safeText(value, "").toLowerCase();
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

function isAdminState(state = {}) {
  const runtime = safeObject(state);

  const role = normalizeRole(
    first(
      runtime.role,
      runtime.rol,
      runtime.user?.role,
      runtime.user?.rol,
      runtime.currentUser?.role,
      runtime.currentUser?.rol,
      runtime.session?.user?.role,
      runtime.session?.user?.rol,
      runtime.auth?.role,
      runtime.auth?.user?.role,
      runtime.auth?.user?.rol
    )
  );

  return ADMIN_ROLES.has(role);
}

function formatMoney(value = 0, currency = "EUR") {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "—";
  }

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: safeText(currency, "EUR"),
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${safeText(currency, "EUR")}`;
  }
}

function formatDateTime(value = null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "—";
  }
}

function formatRelativeDate(value = null) {
  if (!value) return "Sin fecha";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const absMin = Math.abs(diffMin);

  if (absMin < 1) return "Ahora mismo";

  if (absMin < 60) {
    return diffMin > 0 ? `En ${absMin} min` : `Hace ${absMin} min`;
  }

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

  return formatDateTime(value);
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
      item.caseId
    );

    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function toTimestamp(value = null) {
  if (!value) return 0;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  return date.getTime();
}

/* =========================================================
   AVATAR PALETTE
========================================================= */

const AVATAR_PALETTE = Object.freeze([
  {
    bg: "linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)",
    bgDark: "linear-gradient(135deg, #8b5cf6 0%, #f472b6 100%)",
    ring: "rgba(124,58,237,.36)",
    shadow: "rgba(236,72,153,.26)",
  },
  {
    bg: "linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)",
    bgDark: "linear-gradient(135deg, #3b82f6 0%, #22d3ee 100%)",
    ring: "rgba(37,99,235,.34)",
    shadow: "rgba(6,182,212,.24)",
  },
  {
    bg: "linear-gradient(135deg, #f97316 0%, #ef4444 100%)",
    bgDark: "linear-gradient(135deg, #fb923c 0%, #f87171 100%)",
    ring: "rgba(249,115,22,.34)",
    shadow: "rgba(239,68,68,.24)",
  },
  {
    bg: "linear-gradient(135deg, #16a34a 0%, #14b8a6 100%)",
    bgDark: "linear-gradient(135deg, #22c55e 0%, #2dd4bf 100%)",
    ring: "rgba(22,163,74,.34)",
    shadow: "rgba(20,184,166,.24)",
  },
  {
    bg: "linear-gradient(135deg, #db2777 0%, #9333ea 100%)",
    bgDark: "linear-gradient(135deg, #ec4899 0%, #a855f7 100%)",
    ring: "rgba(219,39,119,.34)",
    shadow: "rgba(147,51,234,.25)",
  },
  {
    bg: "linear-gradient(135deg, #ca8a04 0%, #ea580c 100%)",
    bgDark: "linear-gradient(135deg, #facc15 0%, #fb923c 100%)",
    ring: "rgba(202,138,4,.34)",
    shadow: "rgba(234,88,12,.25)",
  },
  {
    bg: "linear-gradient(135deg, #0891b2 0%, #4f46e5 100%)",
    bgDark: "linear-gradient(135deg, #06b6d4 0%, #6366f1 100%)",
    ring: "rgba(8,145,178,.34)",
    shadow: "rgba(79,70,229,.25)",
  },
  {
    bg: "linear-gradient(135deg, #e11d48 0%, #f59e0b 100%)",
    bgDark: "linear-gradient(135deg, #fb7185 0%, #fbbf24 100%)",
    ring: "rgba(225,29,72,.34)",
    shadow: "rgba(245,158,11,.25)",
  },
  {
    bg: "linear-gradient(135deg, #0f766e 0%, #84cc16 100%)",
    bgDark: "linear-gradient(135deg, #14b8a6 0%, #a3e635 100%)",
    ring: "rgba(15,118,110,.34)",
    shadow: "rgba(132,204,22,.24)",
  },
  {
    bg: "linear-gradient(135deg, #4338ca 0%, #c026d3 100%)",
    bgDark: "linear-gradient(135deg, #6366f1 0%, #e879f9 100%)",
    ring: "rgba(67,56,202,.34)",
    shadow: "rgba(192,38,211,.25)",
  },
]);

function getAvatarPalette(item = {}) {
  const seed = getClientStableKey(item);
  const index = hashString(seed) % AVATAR_PALETTE.length;

  return AVATAR_PALETTE[index];
}

function getAvatarStyle(item = {}) {
  const palette = getAvatarPalette(item);

  return [
    `--fac-avatar-bg:${palette.bg}`,
    `--fac-avatar-bg-dark:${palette.bgDark}`,
    `--fac-avatar-ring:${palette.ring}`,
    `--fac-avatar-shadow:${palette.shadow}`,
  ].join(";");
}

/* =========================================================
   DOMAIN HELPERS
========================================================= */

function getFacturaId(item = {}) {
  return safeText(
    first(
      item.id,
      item._id,
      item.facturaId,
      item.invoiceId,
      item.numero,
      item.numeroFacturaLegal,
      item.numeroFacturaSistema,

      item?.raw?.id,
      item?.raw?._id,
      item?.raw?.facturaId,
      item?.raw?.invoiceId,
      item?.raw?.numero,
      item?.raw?.numeroFacturaLegal,
      item?.raw?.numeroFacturaSistema
    ),
    "FAC-SIN-ID"
  );
}

function getFacturaNumero(item = {}) {
  return safeText(
    first(
      item.numero,
      item.invoiceNumber,
      item.code,
      item.facturaId,
      item.invoiceId,
      item.numeroFacturaLegal,
      item.numeroFacturaSistema,
      item.id,

      item?.raw?.numero,
      item?.raw?.invoiceNumber,
      item?.raw?.code,
      item?.raw?.facturaId,
      item?.raw?.invoiceId,
      item?.raw?.numeroFacturaLegal,
      item?.raw?.numeroFacturaSistema,
      item?.raw?.id
    ),
    "Factura sin número"
  );
}

function getClientName(item = {}) {
  return safeText(
    first(
      item.clienteNombre,
      item.cliente?.nombre,
      item.cliente?.nombreContacto,
      item.clientName,
      item.client?.name,
      item.name,
      item.nombre,
      item.clienteEmpresa,
      item.cliente?.empresa,
      item.company,

      item?.raw?.clienteNombre,
      item?.raw?.cliente?.nombre,
      item?.raw?.cliente?.nombreContacto,
      item?.raw?.clientName,
      item?.raw?.client?.name,
      item?.raw?.name,
      item?.raw?.nombre,
      item?.raw?.clienteEmpresa,
      item?.raw?.cliente?.empresa,
      item?.raw?.cliente?.razonSocial
    ),
    "Cliente"
  );
}

function getClientEmail(item = {}) {
  return safeText(
    first(
      item.clienteEmail,
      item.cliente?.email,
      item.email,
      item.emailCliente,
      item.clientEmail,
      item.client?.email,

      item?.raw?.clienteEmail,
      item?.raw?.emailCliente,
      item?.raw?.cliente?.email,
      item?.raw?.email,
      item?.raw?.clientEmail,
      item?.raw?.client?.email
    ),
    "Sin email"
  );
}

function getClientAvatar(item = {}) {
  return safeText(
    first(
      item.clienteAvatar,
      item.clientAvatar,
      item.avatar,
      item.avatarUrl,
      item.cliente?.avatar,
      item.cliente?.avatarUrl,
      item.client?.avatar,
      item.client?.avatarUrl,

      item?.raw?.clienteAvatar,
      item?.raw?.clientAvatar,
      item?.raw?.avatar,
      item?.raw?.avatarUrl,
      item?.raw?.cliente?.avatar,
      item?.raw?.cliente?.avatarUrl,
      item?.raw?.client?.avatar,
      item?.raw?.client?.avatarUrl
    ),
    ""
  );
}

function getClientStableKey(item = {}) {
  const raw = safeObject(item?.raw);

  return normalizeKey(
    first(
      item.clienteId,
      item.clientId,
      item.customerId,
      item.userId,
      item.uid,
      item.cliente?.id,
      item.cliente?.userId,
      item.client?.id,
      item.client?.userId,
      item.customer?.id,
      item.customer?.userId,

      item.clienteEmail,
      item.emailCliente,
      item.clientEmail,
      item.email,
      item.cliente?.email,
      item.client?.email,
      item.customer?.email,

      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.userId,
      raw.uid,
      raw.cliente?.id,
      raw.cliente?.userId,
      raw.client?.id,
      raw.client?.userId,
      raw.customer?.id,
      raw.customer?.userId,

      raw.clienteEmail,
      raw.emailCliente,
      raw.clientEmail,
      raw.email,
      raw.cliente?.email,
      raw.client?.email,
      raw.customer?.email,

      getClientName(item)
    )
  );
}

function getInitials(value = "") {
  const text = normalizeWhitespace(value);

  if (!text) return "ON";

  const parts = text.split(" ").filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "ON";
}

function getEstadoPagoKey(value = "") {
  const key = normalizeKey(value);

  if (["paid", "pagada", "pagado", "cobrada", "abonada"].includes(key)) {
    return "paid";
  }

  if (["pending", "pendiente", "unpaid"].includes(key)) {
    return "pending";
  }

  if (["partial", "parcial"].includes(key)) {
    return "partial";
  }

  if (["overdue", "vencida"].includes(key)) {
    return "overdue";
  }

  if (["cancelled", "canceled", "cancelada", "cancelado"].includes(key)) {
    return "cancelled";
  }

  if (["draft", "borrador"].includes(key)) {
    return "draft";
  }

  return "pending";
}

function getEstadoPagoLabel(value = "") {
  const key = getEstadoPagoKey(value);

  if (key === "paid") return "Pagada";
  if (key === "pending") return "Pendiente";
  if (key === "partial") return "Pago parcial";
  if (key === "overdue") return "Vencida";
  if (key === "cancelled") return "Cancelada";
  if (key === "draft") return "Borrador";

  return safeText(value, "Pendiente");
}

function getEstadoPagoChipClass(value = "") {
  const key = getEstadoPagoKey(value);

  if (key === "paid") return "facturas-chip--paid";
  if (key === "pending") return "facturas-chip--pending";
  if (key === "partial") return "facturas-chip--partial";
  if (key === "overdue") return "facturas-chip--overdue";
  if (key === "cancelled") return "facturas-chip--cancelled";
  if (key === "draft") return "facturas-chip--draft";

  return "facturas-chip--pending";
}

function getIncidenciaId(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.ticketId,
      item.incidenciaId,

      item.incidencia?.id,
      item.incidencia?.ticketId,
      item.incidencia?.incidenciaId,

      item.ticket?.id,
      item.ticket?.ticketId,
      item.ticket?.incidenciaId,

      item.linkedTicket?.id,
      item.linkedTicket?.ticketId,
      item.linkedTicket?.incidenciaId,

      item.relatedTicketId,
      item.relatedIncidentId,
      item.supportTicketId,
      item.caseId,

      item.meta?.ticketId,
      item.meta?.incidenciaId,

      pickTicketIdFromArray(item.ticketIds),
      pickTicketIdFromArray(item.incidenciaIds),
      pickTicketIdFromArray(item.relatedTicketIds),
      pickTicketIdFromArray(item.relatedIncidentIds),
      pickTicketIdFromArray(item.linkedTickets),
      pickTicketIdFromArray(item.incidencias),
      pickTicketIdFromArray(item.tickets),
      pickTicketIdFromArray(item.relatedTickets),
      pickTicketIdFromArray(item.facturasRelacionadas),
      pickTicketIdFromArray(item.linkedInvoices?.tickets),
      pickTicketIdFromArray(item.relations),

      raw.ticketId,
      raw.incidenciaId,

      raw.incidencia?.id,
      raw.incidencia?.ticketId,
      raw.incidencia?.incidenciaId,

      raw.ticket?.id,
      raw.ticket?.ticketId,
      raw.ticket?.incidenciaId,

      raw.linkedTicket?.id,
      raw.linkedTicket?.ticketId,
      raw.linkedTicket?.incidenciaId,

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
      pickTicketIdFromArray(raw.facturasRelacionadas),
      pickTicketIdFromArray(raw.linkedInvoices?.tickets),
      pickTicketIdFromArray(raw.relations)
    ),
    "—"
  );
}

function getTotalRaw(item = {}) {
  return first(
    item.total,
    item.amount,
    item.importe,
    item.importeTotal,
    item.totalFactura,
    item?.raw?.total,
    item?.raw?.amount,
    item?.raw?.importe,
    item?.raw?.importeTotal,
    item?.raw?.totalFactura,
    0
  );
}

function getCurrency(item = {}) {
  return safeText(
    first(
      item.moneda,
      item.currency,
      item?.raw?.moneda,
      item?.raw?.currency,
      "EUR"
    ),
    "EUR"
  );
}

function getTotalLabel(item = {}) {
  return formatMoney(
    getTotalRaw(item),
    getCurrency(item)
  );
}

function getTotalCaption(item = {}) {
  const taxIncluded = first(
    item.taxIncluded,
    item.impuestosIncluidos,
    item.ivaIncluido,
    item?.raw?.taxIncluded,
    item?.raw?.impuestosIncluidos,
    item?.raw?.ivaIncluido
  );

  if (taxIncluded === false) {
    return "Impuestos no incl.";
  }

  return "Impuestos incl.";
}

function getFormaPago(item = {}) {
  return safeText(
    first(
      item.formaPago,
      item.metodoPago,
      item.paymentMethod,
      item?.raw?.formaPago,
      item?.raw?.metodoPago,
      item?.raw?.paymentMethod
    ),
    "—"
  );
}

function getCreatedAt(item = {}) {
  return first(
    item.fecha,
    item.createdAt,
    item.fechaCreacion,
    item.issueDate,
    item.fechaFactura,

    item?.raw?.fecha,
    item?.raw?.createdAt,
    item?.raw?.fechaCreacion,
    item?.raw?.issueDate,
    item?.raw?.fechaFactura
  );
}

function getUpdatedAt(item = {}) {
  return first(
    item.updatedAt,
    item.fechaEnvio,
    item.fechaActualizacion,
    item.lastUpdateAt,

    item?.raw?.updatedAt,
    item?.raw?.fechaEnvio,
    item?.raw?.fechaActualizacion,
    item?.raw?.lastUpdateAt,
    item?.raw?.createdAt
  );
}

function getSortDate(item = {}) {
  return first(
    item.fecha,
    item.fechaFactura,
    item.issueDate,
    item.createdAt,
    item.fechaCreacion,
    item.updatedAt,
    item.fechaActualizacion,
    item.lastUpdateAt,

    item?.raw?.fecha,
    item?.raw?.fechaFactura,
    item?.raw?.issueDate,
    item?.raw?.createdAt,
    item?.raw?.fechaCreacion,
    item?.raw?.updatedAt,
    item?.raw?.fechaActualizacion,
    item?.raw?.lastUpdateAt
  );
}

function getSortTimestamp(item = {}) {
  return toTimestamp(getSortDate(item));
}

function compareFacturasNewestFirst(a = {}, b = {}) {
  const diff = getSortTimestamp(b) - getSortTimestamp(a);

  if (diff !== 0) {
    return diff;
  }

  const bNumero = safeText(getFacturaNumero(b), "");
  const aNumero = safeText(getFacturaNumero(a), "");

  return bNumero.localeCompare(aNumero, "es", {
    numeric: true,
    sensitivity: "base",
  });
}

function sortFacturasNewestFirst(items = []) {
  return [...safeArray(items)].sort(compareFacturasNewestFirst);
}

function hasPdf(item = {}) {
  return Boolean(
    first(
      item.pdfAvailable,
      item.blobPath,
      item.pdfUrl,
      item.pdf,
      item.hasPdf,

      item?.raw?.pdfAvailable,
      item?.raw?.blobPath,
      item?.raw?.pdfUrl,
      item?.raw?.pdf,
      item?.raw?.hasPdf
    )
  );
}

/* =========================================================
   STATS / PAGINATION
========================================================= */

function computeStats(items = []) {
  const rows = safeArray(items);

  return {
    total: rows.length,

    pendingCount: rows.filter((item) =>
      ["pending", "partial", "draft"].includes(
        getEstadoPagoKey(first(item.estadoPago, item?.raw?.estadoPago))
      )
    ).length,

    paidCount: rows.filter((item) =>
      ["paid"].includes(
        getEstadoPagoKey(first(item.estadoPago, item?.raw?.estadoPago))
      )
    ).length,

    overdueCount: rows.filter((item) =>
      ["overdue"].includes(
        getEstadoPagoKey(first(item.estadoPago, item?.raw?.estadoPago))
      )
    ).length,

    totalImporte: rows.reduce(
      (acc, item) => acc + safeNumber(getTotalRaw(item), 0),
      0
    ),
  };
}

function getPagination(items = [], state = {}) {
  const allItems = sortFacturasNewestFirst(items);
  const runtime = safeObject(state);

  const pageSize = Math.max(
    1,
    safeNumber(
      first(
        runtime.pageSize,
        runtime.limit,
        runtime.facturasPageSize,
        DEFAULT_PAGE_SIZE
      ),
      DEFAULT_PAGE_SIZE
    )
  );

  const totalCount = allItems.length;

  const totalPages = Math.max(
    1,
    Math.ceil((totalCount || 1) / pageSize)
  );

  const currentPage = Math.min(
    Math.max(
      1,
      safeNumber(
        first(
          runtime.page,
          runtime.currentPage,
          runtime.facturasPage,
          1
        ),
        1
      )
    ),
    totalPages
  );

  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = allItems.slice(startIndex, startIndex + pageSize);

  const rangeStart = totalCount && pageItems.length ? startIndex + 1 : 0;
  const rangeEnd = totalCount
    ? Math.min(startIndex + pageItems.length, totalCount)
    : 0;

  return {
    allItems,
    pageItems,
    pageSize,
    currentPage,
    totalPages,
    totalCount,
    rangeStart,
    rangeEnd,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
}

/* =========================================================
   STATE HELPERS
========================================================= */

function resolveBusyMeta(item = {}, state = {}) {
  const runtime = safeObject(state);
  const facturaId = getFacturaId(item);

  const openingFacturaId = safeText(runtime.openingFacturaId, "");
  const viewingFacturaId = safeText(runtime.viewingFacturaId, "");
  const downloadingFacturaId = safeText(runtime.downloadingFacturaId, "");
  const sendingFacturaId = safeText(runtime.sendingFacturaId, "");

  return {
    facturaId,
    isOpening: openingFacturaId === facturaId,
    isViewingPdf: viewingFacturaId === facturaId,
    isDownloading: downloadingFacturaId === facturaId,
    isSending: sendingFacturaId === facturaId,
  };
}

/* =========================================================
   UI PARTIALS
========================================================= */

function renderSpinner(label = "") {
  return `
    <span class="facturas-inline-loading">
      <span class="facturas-inline-spinner" aria-hidden="true"></span>
      ${
        label
          ? `<span class="facturas-inline-loading-text">${escapeHtml(label)}</span>`
          : ""
      }
    </span>
  `;
}

function renderLoaderOnly(label = "Cargando") {
  return `
    <span
      class="facturas-loader-only"
      role="status"
      aria-label="${escapeHtml(label)}"
      title="${escapeHtml(label)}"
      data-tooltip="${escapeHtml(label)}"
    >
      <span class="facturas-inline-spinner" aria-hidden="true"></span>
    </span>
  `;
}

function renderAvatar(item = {}) {
  const fullName = getClientName(item);
  const initials = getInitials(fullName);
  const avatarUrl = getClientAvatar(item);
  const avatarStyle = getAvatarStyle(item);

  if (avatarUrl) {
    return `
      <div
        class="facturas-avatar"
        title="${escapeHtml(fullName)}"
        aria-label="${escapeHtml(fullName)}"
        data-tooltip="${escapeHtml(fullName)}"
        style="${escapeHtml(avatarStyle)}"
      >
        <img
          src="${escapeHtml(avatarUrl)}"
          alt="${escapeHtml(fullName)}"
          loading="lazy"
          referrerpolicy="no-referrer"
          onerror="this.style.display='none'; this.parentNode.setAttribute('data-fallback','true');"
        />
        <span class="facturas-avatar-fallback">${escapeHtml(initials)}</span>
      </div>
    `;
  }

  return `
    <div
      class="facturas-avatar facturas-avatar--fallback"
      title="${escapeHtml(fullName)}"
      aria-label="${escapeHtml(fullName)}"
      data-tooltip="${escapeHtml(fullName)}"
      style="${escapeHtml(avatarStyle)}"
    >
      <span class="facturas-avatar-fallback">${escapeHtml(initials)}</span>
    </div>
  `;
}

function renderEstadoPagoChip(item = {}) {
  const rawStatus = first(
    item.estadoPago,
    item.paymentStatus,
    item?.raw?.estadoPago,
    item?.raw?.paymentStatus
  );

  const label = getEstadoPagoLabel(rawStatus);
  const klass = getEstadoPagoChipClass(rawStatus);

  return `
    <span class="facturas-chip ${klass}">
      ${escapeHtml(label)}
    </span>
  `;
}

function renderIncidenciaLink(item = {}) {
  const incidenciaId = getIncidenciaId(item);
  const facturaId = getFacturaId(item);

  if (!incidenciaId || incidenciaId === "—") {
    return `<span class="facturas-incidencia-empty">—</span>`;
  }

  return `
    <button
      type="button"
      class="facturas-incidencia-link"
      data-action="open-incidencia"
      data-facturas-action="open-incidencia"
      data-ticket-id="${escapeHtml(incidenciaId)}"
      data-incidencia-id="${escapeHtml(incidenciaId)}"
      data-factura-id="${escapeHtml(facturaId)}"
      title="Abrir incidencia relacionada"
      data-tooltip="Abrir incidencia relacionada"
    >
      ${escapeHtml(incidenciaId)}
    </button>
  `;
}

function renderPagination(pagination = {}, state = {}) {
  const runtime = safeObject(state);
  const loading = Boolean(runtime.loading);
  const refreshing = Boolean(runtime.refreshing);

  return `
    <div class="facturas-pagination" aria-label="Paginación de facturas">
      <button
        type="button"
        class="facturas-pagination-btn"
        data-action="prev-page"
        data-facturas-action="prev-page"
        data-page="${escapeHtml(String(Math.max(1, pagination.currentPage - 1)))}"
        ${!pagination.hasPrev || loading || refreshing ? 'disabled aria-disabled="true"' : ""}
      >
        Anterior
      </button>

      <button
        type="button"
        class="facturas-pagination-btn"
        data-action="next-page"
        data-facturas-action="next-page"
        data-page="${escapeHtml(String(Math.min(pagination.totalPages, pagination.currentPage + 1)))}"
        ${!pagination.hasNext || loading || refreshing ? 'disabled aria-disabled="true"' : ""}
      >
        Siguiente
      </button>
    </div>
  `;
}

function renderRow(item = {}, state = {}) {
  const busy = resolveBusyMeta(item, state);

  const facturaId = busy.facturaId;
  const numero = getFacturaNumero(item);
  const clientName = getClientName(item);
  const clientEmail = getClientEmail(item);
  const createdAt = formatDateTime(getCreatedAt(item));
  const total = getTotalLabel(item);
  const totalCaption = getTotalCaption(item);
  const formaPago = getFormaPago(item);
  const pdfAvailable = hasPdf(item);

  return `
    <tr
      class="facturas-table-row"
      data-factura-id="${escapeHtml(facturaId)}"
      data-row-click-disabled="true"
    >
      <td class="facturas-cell facturas-cell--main">
        <div class="facturas-main">
          ${renderAvatar(item)}

          <div class="facturas-main-copy">
            <div class="facturas-factura-id">${escapeHtml(numero)}</div>
            <div class="facturas-factura-client">${escapeHtml(clientName)}</div>
            <div class="facturas-factura-email">${escapeHtml(clientEmail)}</div>
          </div>
        </div>
      </td>

      <td class="facturas-cell facturas-cell--status">
        ${renderEstadoPagoChip(item)}
      </td>

      <td class="facturas-cell facturas-cell--date">
        <span class="facturas-date-inline">${escapeHtml(createdAt)}</span>
      </td>

      <td class="facturas-cell facturas-cell--amount">
        <div class="facturas-total-stack">
          <span class="facturas-total-value">${escapeHtml(total)}</span>
          <span class="facturas-total-caption">${escapeHtml(totalCaption)}</span>
          <span class="facturas-total-meta">${escapeHtml(formaPago)}</span>
        </div>
      </td>

      <td class="facturas-cell facturas-cell--incidencia">
        ${renderIncidenciaLink(item)}
      </td>

      <td class="facturas-cell facturas-cell--actions">
        <div class="facturas-actions">
          <button
            type="button"
            class="facturas-action-btn${busy.isOpening ? " is-loading" : ""}"
            data-action="open-factura"
            data-facturas-action="open-factura"
            data-factura-id="${escapeHtml(facturaId)}"
            ${busy.isOpening ? 'disabled aria-busy="true"' : ""}
          >
            ${
              busy.isOpening
                ? renderLoaderOnly("Abriendo detalle")
                : '<span class="facturas-btn-text">Detalle</span>'
            }
          </button>

          <button
            type="button"
            class="facturas-action-btn${busy.isViewingPdf ? " is-loading" : ""}"
            data-action="view-factura-pdf"
            data-facturas-action="view-factura-pdf"
            data-factura-id="${escapeHtml(facturaId)}"
            ${
              pdfAvailable && !busy.isViewingPdf
                ? ""
                : 'disabled aria-disabled="true"'
            }
          >
            ${
              busy.isViewingPdf
                ? renderLoaderOnly("Abriendo PDF")
                : '<span class="facturas-btn-text">Ver PDF</span>'
            }
          </button>

          <button
            type="button"
            class="facturas-action-btn facturas-action-btn--primary${busy.isDownloading ? " is-loading" : ""}"
            data-action="download-factura"
            data-facturas-action="download-factura"
            data-factura-id="${escapeHtml(facturaId)}"
            ${
              pdfAvailable && !busy.isDownloading
                ? ""
                : 'disabled aria-disabled="true"'
            }
          >
            ${
              busy.isDownloading
                ? renderLoaderOnly("Descargando factura")
                : '<span class="facturas-btn-text">Descargar</span>'
            }
          </button>

          <button
            type="button"
            class="facturas-action-btn facturas-action-btn--success${busy.isSending ? " is-loading" : ""}"
            data-action="send-factura"
            data-facturas-action="send-factura"
            data-factura-id="${escapeHtml(facturaId)}"
            ${busy.isSending ? 'disabled aria-busy="true"' : ""}
          >
            ${
              busy.isSending
                ? renderLoaderOnly("Enviando factura")
                : '<span class="facturas-btn-text">Enviar</span>'
            }
          </button>
        </div>
      </td>
    </tr>
  `;
}

function renderTableLoading(rows = DEFAULT_PAGE_SIZE) {
  return `
    <div class="facturas-table-loading" aria-hidden="true">
      ${Array.from({ length: rows })
        .map(
          () => `
            <div class="facturas-table-loading-row">
              <div class="facturas-skeleton facturas-skeleton--avatar"></div>

              <div class="facturas-table-loading-copy">
                <div class="facturas-skeleton facturas-skeleton--xs"></div>
                <div class="facturas-skeleton facturas-skeleton--lg"></div>
                <div class="facturas-skeleton facturas-skeleton--md"></div>
              </div>

              <div class="facturas-skeleton facturas-skeleton--pill"></div>
              <div class="facturas-skeleton facturas-skeleton--date"></div>
              <div class="facturas-skeleton facturas-skeleton--amount"></div>
              <div class="facturas-skeleton facturas-skeleton--ticket"></div>
              <div class="facturas-skeleton facturas-skeleton--actions"></div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderRefreshOverlay() {
  return `
    <div class="facturas-refresh-overlay" aria-live="polite">
      <div class="facturas-refresh-card">
        ${renderSpinner("Actualizando facturas...")}
      </div>
    </div>
  `;
}

function renderEmptyState() {
  return `
    <div class="facturas-empty">
      <h3 class="facturas-empty-title">No hay facturas para mostrar</h3>
      <p class="facturas-empty-text">
        Cuando haya documentos registrados aparecerán aquí.
      </p>
    </div>
  `;
}

/* =========================================================
   STYLES
========================================================= */

function renderStyles() {
  return `
    <style>
      .facturas-view-root{
        display:grid;
        gap:var(--view-section-gap, var(--space-lg, 18px));
        color:var(--text, #f5f5f5);
        font-family:var(--font-family, inherit);
      }

      .facturas-hero{
        position:relative;
        overflow:hidden;
        border-radius:var(--view-hero-radius, var(--card-radius-lg, 22px));
        border:1px solid var(--view-hero-border, var(--panel-border, var(--border-default, rgba(255,255,255,.08))));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--view-hero-bg, var(--panel-bg, var(--card-bg, var(--surface-elevated, #262626))));
        box-shadow:var(--view-hero-shadow, var(--panel-shadow, var(--shadow-md, 0 14px 30px rgba(0,0,0,.22))));
        padding:var(--space-xl, 22px) var(--space-xl, 24px);
      }

      .facturas-hero-top{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:var(--space-lg, 18px);
        align-items:start;
      }

      .facturas-hero-copy{
        min-width:0;
        display:grid;
        gap:var(--space-xs, 10px);
      }

      .facturas-page-title{
        margin:0;
        max-width:100%;
        font-size:clamp(var(--font-3xl, 24px), 2.6vw, var(--font-5xl, 40px));
        line-height:var(--line-tight, .98);
        letter-spacing:var(--view-title-letter, -.05em);
        font-weight:var(--view-title-weight, var(--weight-black, 800));
        color:var(--text-strong, #ffffff);
        white-space:nowrap;
      }

      .facturas-page-subtitle{
        margin:0;
        max-width:860px;
        font-size:var(--font-lg, 15px);
        line-height:var(--line-relaxed, 1.58);
        color:var(--view-subtitle-color, var(--text-muted, rgba(245,245,245,.70)));
      }

      .facturas-hero-actions{
        display:flex;
        align-items:flex-start;
        justify-content:flex-end;
        gap:var(--space-xs, 10px);
        flex-wrap:wrap;
      }

      .facturas-btn{
        min-height:var(--btn-height, 42px);
        padding:0 var(--space-md, 16px);
        border-radius:var(--btn-radius, var(--radius-md, 13px));
        border:1px solid var(--btn-secondary-border, var(--border-default, rgba(255,255,255,.09)));
        background:var(--btn-secondary-bg, rgba(255,255,255,.045));
        color:var(--btn-secondary-text, var(--text, #f5f5f5));
        font-size:var(--font-md, 13px);
        font-weight:var(--weight-bold, 700);
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        box-shadow:var(--btn-secondary-shadow, var(--shadow-sm, 0 6px 14px rgba(0,0,0,.16)));
        transition:
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease),
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          opacity var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .facturas-btn:hover{
        transform:translateY(var(--ui-hover-lift, -1px));
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        box-shadow:var(--shadow-md, 0 14px 30px rgba(0,0,0,.22));
      }

      .facturas-btn--primary{
        border-color:var(--btn-primary-border, var(--accent-border, rgba(255,255,255,.05)));
        background:var(--btn-primary-bg, var(--gradient-accent, linear-gradient(135deg, #55555d 0%, #3f3f46 55%, #2f2f35 100%)));
        color:var(--btn-primary-text, var(--text-on-accent, #ffffff));
        box-shadow:var(--btn-primary-shadow, 0 12px 28px rgba(0,0,0,.22));
      }

      .facturas-btn--primary:hover{
        background:var(--btn-primary-bg-hover, var(--btn-primary-bg));
        color:var(--btn-primary-text, #ffffff);
      }

      .facturas-btn--create{
        border-color:color-mix(in srgb, var(--success, #22c55e) 32%, var(--btn-primary-border, transparent));
        background:var(--gradient-success, linear-gradient(180deg, #22c55e 0%, #16a34a 100%));
        color:var(--text-on-accent, #ffffff);
        box-shadow:
          0 10px 24px color-mix(in srgb, var(--success, #22c55e), transparent 82%),
          var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.04));
      }

      .facturas-btn--create:hover{
        color:var(--text-on-accent, #ffffff);
        filter:brightness(1.02);
      }

      .facturas-btn.is-loading,
      .facturas-action-btn.is-loading{
        cursor:wait;
        opacity:.92;
      }

      .facturas-btn:disabled,
      .facturas-action-btn:disabled,
      .facturas-action-btn[aria-disabled="true"]{
        pointer-events:none;
        opacity:.68;
      }

      .facturas-hero-meta{
        margin-top:var(--space-md, 14px);
        display:flex;
        align-items:center;
        gap:var(--space-xs, 8px);
        flex-wrap:wrap;
      }

      .facturas-meta-pill{
        min-height:calc(30px * var(--ui-scale, 1));
        padding:0 var(--space-sm, 12px);
        border-radius:var(--radius-pill, 999px);
        border:1px solid var(--badge-border, var(--border-default, rgba(255,255,255,.07)));
        background:var(--badge-bg, rgba(255,255,255,.048));
        color:var(--badge-text, var(--text-muted, rgba(245,245,245,.70)));
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        letter-spacing:var(--letter-wider, .08em);
        text-transform:uppercase;
        display:inline-flex;
        align-items:center;
        white-space:nowrap;
      }

      .facturas-stats{
        margin-top:var(--space-md, 16px);
        display:grid;
        grid-template-columns:repeat(4, minmax(0, 1fr));
        gap:var(--space-sm, 12px);
      }

      .facturas-stat-card{
        display:grid;
        gap:var(--space-xs, 8px);
        min-height:calc(124px * var(--ui-scale, 1));
        padding:var(--space-md, 16px) var(--space-lg, 18px);
        border-radius:var(--card-radius, 18px);
        border:1px solid var(--card-border, var(--border-default, rgba(255,255,255,.082)));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88)));
        box-shadow:var(--shadow-card, var(--card-shadow, 0 16px 36px rgba(0,0,0,.24)));
      }

      .facturas-stat-card--accent{
        border-color:var(--accent-border, var(--border-accent, rgba(113,113,122,.30)));
      }

      .facturas-stat-card--success{
        border-color:var(--border-success, rgba(34,197,94,.30));
      }

      .facturas-stat-card--warning{
        border-color:var(--border-warning, rgba(245,158,11,.30));
      }

      .facturas-stat-card--danger{
        border-color:var(--border-error, rgba(239,68,68,.30));
      }

      .facturas-stat-label{
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        letter-spacing:var(--letter-wider, .08em);
        text-transform:uppercase;
        color:var(--text-dim, rgba(245,245,245,.50));
      }

      .facturas-stat-value{
        font-size:var(--font-5xl, 40px);
        line-height:.92;
        letter-spacing:var(--letter-tight, -.03em);
        font-weight:var(--weight-black, 800);
        color:var(--text-strong, #ffffff);
      }

      .facturas-stat-text{
        font-size:var(--font-base, 14px);
        line-height:var(--line-normal, 1.42);
        color:var(--text-muted, rgba(245,245,245,.70));
      }

      .facturas-history{
        overflow:hidden;
        border-radius:var(--data-table-radius, var(--card-radius-lg, 22px));
        border:1px solid var(--data-table-border, var(--card-border, var(--border-default, rgba(255,255,255,.082))));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--data-table-bg, var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88))));
        box-shadow:var(--data-table-shadow, var(--shadow-card, var(--card-shadow, 0 16px 36px rgba(0,0,0,.24))));
      }

      .facturas-history-head{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:var(--space-md, 14px);
        align-items:start;
        padding:var(--space-md, 14px) var(--space-lg, 18px) var(--space-sm, 12px);
        border-bottom:1px solid var(--data-table-row-border, var(--table-border, rgba(255,255,255,.052)));
      }

      .facturas-history-copy{
        min-width:0;
        display:grid;
        gap:var(--space-3xs, 2px);
      }

      .facturas-history-title{
        margin:0;
        font-size:var(--section-title-size, var(--font-xl, 16px));
        line-height:var(--line-snug, 1.22);
        font-weight:var(--section-title-weight, var(--weight-bold, 700));
        color:var(--section-title-color, var(--text-strong, #ffffff));
      }

      .facturas-history-subtitle{
        margin:0;
        font-size:var(--section-subtitle-size, var(--font-sm, 12px));
        line-height:var(--line-normal, 1.42);
        color:var(--section-subtitle-color, var(--text-dim, rgba(245,245,245,.50)));
      }

      .facturas-pagination{
        display:flex;
        gap:var(--space-xs, 8px);
        flex-wrap:wrap;
        justify-content:flex-end;
      }

      .facturas-pagination-btn{
        min-height:calc(38px * var(--ui-scale, 1));
        padding:0 var(--space-sm, 14px);
        border-radius:var(--radius-md, 13px);
        border:1px solid var(--btn-secondary-border, var(--border-default, rgba(255,255,255,.09)));
        background:var(--btn-secondary-bg, rgba(255,255,255,.045));
        color:var(--btn-secondary-text, var(--text, #f5f5f5));
        font-size:var(--font-sm, 12px);
        font-weight:var(--weight-bold, 700);
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        transition:
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          opacity var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .facturas-pagination-btn:hover{
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        border-color:var(--border-strong, rgba(255,255,255,.12));
      }

      .facturas-pagination-btn[disabled],
      .facturas-pagination-btn[aria-disabled="true"]{
        opacity:.48;
        cursor:not-allowed;
        pointer-events:none;
      }

      .facturas-table-wrap{
        position:relative;
        min-height:120px;
      }

      .facturas-table-wrap.is-refreshing .facturas-table-shell{
        opacity:.56;
        filter:blur(.7px);
        transition:
          opacity var(--duration-fast, .18s) var(--ease-standard, ease),
          filter var(--duration-fast, .18s) var(--ease-standard, ease);
      }

      .facturas-table-shell{
        width:100%;
        overflow-x:auto;
        overflow-y:hidden;
        transition:
          opacity var(--duration-fast, .18s) var(--ease-standard, ease),
          filter var(--duration-fast, .18s) var(--ease-standard, ease);
      }

      .facturas-table{
        width:100%;
        border-collapse:separate;
        border-spacing:0;
        min-width:1040px;
        table-layout:fixed;
        background:var(--table-bg, transparent);
      }

      .facturas-table thead th{
        padding:var(--table-cell-padding-y, 12px) var(--table-cell-padding-x, 12px);
        text-align:left;
        font-size:var(--data-table-head-font-size, var(--font-xs, 11px));
        font-weight:var(--data-table-head-font-weight, var(--weight-bold, 700));
        letter-spacing:var(--data-table-head-letter, .075em);
        text-transform:uppercase;
        color:var(--data-table-head-text, var(--text-dim, rgba(245,245,245,.50)));
        background:var(--data-table-head-bg, var(--table-head-bg, rgba(255,255,255,.020)));
        border-bottom:1px solid var(--table-head-border, var(--border-default, rgba(255,255,255,.082)));
        white-space:nowrap;
      }

      .facturas-table tbody td{
        padding:calc(12px * var(--ui-scale, 1)) var(--table-cell-padding-x, 12px);
        vertical-align:middle;
        border-bottom:1px solid var(--data-table-row-border, var(--table-border, rgba(255,255,255,.052)));
      }

      .facturas-table tbody tr:last-child td{
        border-bottom:none;
      }

      .facturas-table-row{
        transition:
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .facturas-table-row:hover{
        background:var(--data-table-row-hover, var(--table-row-hover, rgba(255,255,255,.024)));
      }

      .facturas-main{
        display:grid;
        grid-template-columns:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1))) minmax(0, 1fr);
        gap:var(--space-sm, 12px);
        align-items:center;
        min-width:0;
      }

      .facturas-avatar{
        position:relative;
        width:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        height:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        border-radius:var(--radius-pill, 999px);
        overflow:hidden;
        flex:0 0 var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        background:var(--fac-avatar-bg, var(--avatar-bg, linear-gradient(180deg, #52525b 0%, #3f3f46 100%)));
        box-shadow:
          0 10px 22px var(--fac-avatar-shadow, rgba(0,0,0,.20)),
          0 0 0 3px color-mix(in srgb, var(--fac-avatar-ring, var(--accent-ring, rgba(113,113,122,.30))) 58%, transparent),
          var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.04));
        transform:translateZ(0);
      }

      .facturas-avatar::after{
        content:"";
        position:absolute;
        inset:0;
        border-radius:inherit;
        background:
          radial-gradient(circle at 30% 22%, rgba(255,255,255,.42), transparent 34%),
          linear-gradient(180deg, rgba(255,255,255,.10), rgba(0,0,0,.08));
        pointer-events:none;
        mix-blend-mode:screen;
      }

      .facturas-avatar img{
        position:relative;
        z-index:1;
        display:block;
        width:100%;
        height:100%;
        object-fit:cover;
      }

      .facturas-avatar-fallback{
        position:absolute;
        inset:0;
        z-index:2;
        display:none;
        align-items:center;
        justify-content:center;
        font-size:var(--font-2xl, 19px);
        font-weight:var(--weight-black, 800);
        color:var(--avatar-text, #ffffff);
        letter-spacing:-.035em;
        text-shadow:
          0 1px 2px rgba(0,0,0,.22),
          0 0 16px rgba(255,255,255,.20);
      }

      .facturas-avatar[data-fallback="true"] .facturas-avatar-fallback{
        display:flex;
      }

      .facturas-avatar[data-fallback="true"] img{
        display:none !important;
      }

      .facturas-avatar--fallback .facturas-avatar-fallback{
        display:flex;
      }

      .facturas-main-copy{
        min-width:0;
        display:grid;
        gap:var(--space-3xs, 3px);
      }

      .facturas-factura-id{
        font-size:var(--font-sm, 12px);
        line-height:var(--line-snug, 1.22);
        font-weight:var(--weight-bold, 700);
        letter-spacing:.055em;
        color:var(--text-dim, rgba(245,245,245,.50));
        text-transform:uppercase;
      }

      .facturas-factura-client{
        font-size:var(--font-lg, 15px);
        line-height:1.14;
        font-weight:var(--weight-black, 800);
        letter-spacing:var(--letter-tight, -.03em);
        color:var(--text-strong, #ffffff);
        overflow:hidden;
        text-overflow:ellipsis;
        display:-webkit-box;
        -webkit-line-clamp:2;
        -webkit-box-orient:vertical;
      }

      .facturas-factura-email{
        font-size:var(--font-md, 13px);
        line-height:1.3;
        color:var(--text-dim, rgba(245,245,245,.50));
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .facturas-chip{
        min-height:var(--chip-height, calc(26px * var(--ui-scale, 1)));
        padding:0 var(--space-sm, 12px);
        border-radius:var(--radius-pill, 999px);
        display:inline-flex;
        align-items:center;
        justify-content:center;
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        letter-spacing:.045em;
        text-transform:uppercase;
        white-space:nowrap;
        border:1px solid transparent;
        box-shadow:var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.04));
      }

      .facturas-chip--pending,
      .facturas-chip--partial{
        color:var(--warning, #f59e0b);
        background:color-mix(in srgb, var(--warning-bg, rgba(245,158,11,.10)) 78%, var(--surface-active, transparent));
        border-color:var(--border-warning, rgba(245,158,11,.30));
      }

      .facturas-chip--draft{
        color:var(--text-soft, rgba(245,245,245,.88));
        background:var(--chip-bg, rgba(255,255,255,.034));
        border-color:var(--chip-border, rgba(255,255,255,.07));
      }

      .facturas-chip--paid{
        color:var(--success, #22c55e);
        background:color-mix(in srgb, var(--success-bg, rgba(34,197,94,.10)) 78%, var(--surface-active, transparent));
        border-color:var(--border-success, rgba(34,197,94,.30));
      }

      .facturas-chip--overdue,
      .facturas-chip--cancelled{
        color:var(--error, #ef4444);
        background:color-mix(in srgb, var(--error-bg, rgba(239,68,68,.10)) 78%, var(--surface-active, transparent));
        border-color:var(--border-error, rgba(239,68,68,.30));
      }

      .facturas-date-inline{
        display:inline-block;
        white-space:nowrap;
        font-size:var(--font-md, 13px);
        line-height:1.2;
        font-weight:var(--weight-semibold, 600);
        font-variant-numeric:tabular-nums;
        color:var(--data-table-cell-text, var(--text-soft, rgba(245,245,245,.88)));
      }

      .facturas-total-stack{
        display:grid;
        gap:var(--space-3xs, 2px);
        min-width:0;
      }

      .facturas-total-value{
        font-size:var(--font-base, 14px);
        line-height:1.15;
        font-weight:var(--weight-bold, 700);
        color:var(--text-strong, #ffffff);
        white-space:nowrap;
      }

      .facturas-total-caption{
        font-size:var(--font-xs, 11px);
        line-height:1.15;
        color:var(--text-muted, rgba(245,245,245,.70));
        white-space:nowrap;
        font-weight:var(--weight-bold, 700);
      }

      .facturas-total-meta{
        font-size:var(--font-xs, 11px);
        line-height:1.15;
        color:var(--text-dim, rgba(245,245,245,.50));
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .facturas-incidencia-link{
        max-width:100%;
        min-height:calc(30px * var(--ui-scale, 1));
        padding:0 var(--space-sm, 10px);
        border-radius:var(--radius-pill, 999px);
        border:1px solid var(--accent-border, rgba(113,113,122,.28));
        background:var(--accent-soft, rgba(63,63,70,.18));
        color:var(--text-strong, #ffffff);
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        letter-spacing:.025em;
        text-transform:uppercase;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        transition:
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          border-color var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .facturas-incidencia-link:hover{
        transform:translateY(var(--ui-hover-lift, -1px));
        background:var(--accent-ghost, rgba(63,63,70,.10));
        border-color:var(--accent-border-strong, rgba(113,113,122,.42));
      }

      .facturas-incidencia-empty{
        color:var(--text-dim, rgba(245,245,245,.50));
        font-size:var(--font-md, 13px);
        font-weight:var(--weight-semibold, 600);
      }

      .facturas-cell--actions{
        width:1%;
        white-space:nowrap;
      }

      .facturas-actions{
        display:grid;
        grid-template-columns:repeat(2, minmax(calc(82px * var(--ui-scale, 1)), 1fr));
        gap:var(--space-2xs, 6px);
        width:100%;
        min-width:calc(180px * var(--ui-scale, 1));
        justify-content:end;
      }

      .facturas-action-btn{
        inline-size:100%;
        min-inline-size:0;
        min-height:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        height:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        padding:0 var(--space-xs, 8px);
        border-radius:var(--radius-md, 10px);
        border:1px solid var(--btn-secondary-border, var(--border-default, rgba(255,255,255,.09)));
        background:var(--btn-secondary-bg, rgba(255,255,255,.045));
        color:var(--btn-secondary-text, var(--text, #f5f5f5));
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        white-space:nowrap;
        box-shadow:none;
        transition:
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          opacity var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .facturas-action-btn:hover{
        border-color:var(--border-strong, rgba(255,255,255,.12));
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        color:var(--text-strong, #ffffff);
        transform:translateY(var(--ui-hover-lift, -1px));
      }

      .facturas-action-btn.is-loading{
        min-height:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        height:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        justify-content:center;
      }

      .facturas-action-btn--primary{
        border-color:var(--btn-primary-border, var(--accent-border, rgba(255,255,255,.05)));
        background:var(--btn-primary-bg, var(--gradient-accent, linear-gradient(135deg, #55555d 0%, #3f3f46 55%, #2f2f35 100%)));
        color:var(--btn-primary-text, var(--text-on-accent, #ffffff));
      }

      .facturas-action-btn--primary:hover{
        background:var(--btn-primary-bg-hover, var(--btn-primary-bg));
        color:var(--btn-primary-text, #ffffff);
        box-shadow:var(--btn-primary-shadow, 0 12px 28px rgba(0,0,0,.22));
      }

      .facturas-action-btn--success{
        border-color:color-mix(in srgb, var(--success, #22c55e) 32%, var(--btn-primary-border, transparent));
        background:var(--gradient-success, linear-gradient(180deg, #22c55e 0%, #16a34a 100%));
        color:var(--text-on-accent, #ffffff);
      }

      .facturas-action-btn--success:hover{
        color:var(--text-on-accent, #ffffff);
        filter:brightness(1.02);
        box-shadow:
          0 10px 22px color-mix(in srgb, var(--success, #22c55e), transparent 84%),
          var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.04));
      }

      .facturas-loader-only{
        display:inline-flex;
        width:16px;
        height:16px;
        align-items:center;
        justify-content:center;
        flex:0 0 auto;
      }

      .facturas-inline-loading{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:var(--space-xs, 7px);
        white-space:nowrap;
      }

      .facturas-inline-loading-text{
        display:inline-block;
      }

      .facturas-inline-spinner{
        width:14px;
        height:14px;
        border-radius:var(--radius-pill, 999px);
        border:2px solid var(--loader-ring, rgba(255,255,255,.12));
        border-top-color:currentColor;
        animation:facturasSpin .78s linear infinite;
        flex:0 0 auto;
      }

      .facturas-btn:not(.facturas-btn--primary):not(.facturas-btn--create) .facturas-inline-spinner,
      .facturas-action-btn:not(.facturas-action-btn--primary):not(.facturas-action-btn--success) .facturas-inline-spinner{
        border-color:var(--loader-ring, rgba(255,255,255,.12));
        border-top-color:currentColor;
      }

      .facturas-action-btn.is-loading .facturas-inline-spinner{
        width:15px;
        height:15px;
      }

      .facturas-refresh-overlay{
        position:absolute;
        inset:0;
        z-index:3;
        display:grid;
        place-items:center;
        pointer-events:none;
        background:var(--backdrop-bg, rgba(10,10,12,.28));
        backdrop-filter:var(--blur-sm, blur(8px));
        -webkit-backdrop-filter:var(--blur-sm, blur(8px));
      }

      .facturas-refresh-card{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:var(--btn-height, 42px);
        padding:0 var(--space-md, 16px);
        border-radius:var(--radius-md, 14px);
        border:1px solid var(--card-border, var(--border-default, rgba(255,255,255,.082)));
        background:var(--popover-bg, var(--surface-elevated-strong, rgba(44,44,48,.94)));
        color:var(--text-soft, rgba(245,245,245,.88));
        font-size:var(--font-md, 13px);
        font-weight:var(--weight-bold, 700);
        box-shadow:var(--shadow-lg, 0 20px 46px rgba(0,0,0,.28));
      }

      .facturas-table-loading{
        padding:var(--space-sm, 12px) var(--space-lg, 18px) var(--space-md, 16px);
        display:grid;
        gap:var(--space-sm, 12px);
      }

      .facturas-table-loading-row{
        display:grid;
        grid-template-columns:var(--avatar-size-lg, 44px) minmax(190px, 1.1fr) 102px 130px 108px 150px 180px;
        gap:var(--space-xs, 10px);
        align-items:center;
      }

      .facturas-table-loading-copy{
        display:grid;
        gap:var(--space-xs, 7px);
      }

      .facturas-skeleton{
        position:relative;
        overflow:hidden;
        border-radius:var(--skeleton-radius, var(--radius-md, 13px));
        background:var(--skeleton-bg, rgba(255,255,255,.050));
      }

      .facturas-skeleton::after{
        content:"";
        position:absolute;
        inset:0;
        transform:translateX(-100%);
        background:linear-gradient(
          90deg,
          transparent,
          var(--skeleton-shine, rgba(255,255,255,.095)),
          transparent
        );
        animation:facturasSkeleton 1.2s var(--ease-standard, ease-in-out) infinite;
      }

      .facturas-skeleton--avatar{
        width:var(--avatar-size-lg, 44px);
        height:var(--avatar-size-lg, 44px);
        border-radius:var(--radius-pill, 999px);
      }

      .facturas-skeleton--xs{
        width:120px;
        height:var(--skeleton-height-sm, 10px);
      }

      .facturas-skeleton--lg{
        width:74%;
        height:var(--skeleton-height-md, 14px);
      }

      .facturas-skeleton--md{
        width:56%;
        height:12px;
      }

      .facturas-skeleton--pill{
        width:86px;
        height:30px;
        border-radius:var(--radius-pill, 999px);
      }

      .facturas-skeleton--date{
        width:124px;
        height:12px;
      }

      .facturas-skeleton--amount{
        width:92px;
        height:30px;
      }

      .facturas-skeleton--ticket{
        width:148px;
        height:30px;
        border-radius:var(--radius-pill, 999px);
      }

      .facturas-skeleton--actions{
        width:180px;
        height:calc((var(--btn-height-sm, 34px) * 2) + var(--space-2xs, 6px));
        border-radius:var(--radius-md, 12px);
      }

      .facturas-empty{
        display:grid;
        justify-items:center;
        gap:var(--space-xs, 8px);
        padding:var(--space-4xl, 44px) var(--space-lg, 20px) var(--space-5xl, 48px);
        text-align:center;
      }

      .facturas-empty-title{
        margin:0;
        font-size:var(--font-2xl, 18px);
        font-weight:var(--weight-bold, 700);
        color:var(--text-strong, #ffffff);
      }

      .facturas-empty-text{
        margin:0;
        font-size:var(--font-md, 13px);
        line-height:var(--line-relaxed, 1.62);
        color:var(--text-muted, rgba(245,245,245,.70));
      }

      .facturas-error{
        display:grid;
        justify-items:start;
        gap:var(--space-xs, 10px);
        padding:var(--space-xl, 24px) var(--space-xl, 22px);
        border-radius:var(--card-radius-lg, 22px);
        border:1px solid var(--border-error, rgba(239,68,68,.30));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          color-mix(in srgb, var(--error-bg, rgba(239,68,68,.10)) 46%, var(--card-bg, transparent));
        box-shadow:var(--shadow-sm, 0 6px 14px rgba(0,0,0,.16));
      }

      .facturas-error-title{
        margin:0;
        font-size:var(--font-2xl, 18px);
        font-weight:var(--weight-bold, 700);
        color:var(--text-strong, #ffffff);
      }

      .facturas-error-text{
        margin:0;
        font-size:var(--font-md, 13px);
        line-height:var(--line-relaxed, 1.62);
        color:var(--text-muted, rgba(245,245,245,.70));
      }

      @keyframes facturasSpin{
        to{ transform:rotate(360deg); }
      }

      @keyframes facturasSkeleton{
        to{ transform:translateX(100%); }
      }

      [data-theme="dark"] .facturas-avatar,
      :root:not([data-theme="light"]) .facturas-avatar{
        background:var(--fac-avatar-bg-dark, var(--fac-avatar-bg, var(--avatar-bg)));
      }

      [data-theme="light"] .facturas-hero,
      [data-theme="light"] .facturas-history{
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,0) 34%)),
          var(--view-hero-bg, var(--panel-bg, var(--card-bg, var(--surface-elevated, #ffffff))));
      }

      [data-theme="light"] .facturas-stat-card{
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,0) 34%)),
          var(--card-bg, var(--surface-elevated, #ffffff));
      }

      [data-theme="light"] .facturas-chip--pending,
      [data-theme="light"] .facturas-chip--partial{
        color:var(--warning-hover, #9c6110);
        background:var(--warning-soft, rgba(192,122,22,.12));
        border-color:var(--border-warning, rgba(217,119,6,.245));
      }

      [data-theme="light"] .facturas-chip--draft{
        color:var(--text-muted, rgba(23,32,51,.70));
        background:var(--chip-bg, rgba(23,32,51,.040));
        border-color:var(--chip-border, rgba(23,32,51,.075));
      }

      [data-theme="light"] .facturas-chip--paid{
        color:var(--success-hover, #157a4f);
        background:var(--success-soft, rgba(31,157,104,.12));
        border-color:var(--border-success, rgba(22,163,74,.245));
      }

      [data-theme="light"] .facturas-chip--overdue,
      [data-theme="light"] .facturas-chip--cancelled{
        color:var(--error-hover, #b52a39);
        background:var(--error-soft, rgba(216,60,77,.12));
        border-color:var(--border-error, rgba(220,38,38,.245));
      }

      [data-theme="light"] .facturas-incidencia-link{
        color:var(--accent-active, #533cb6);
        background:var(--accent-soft, rgba(111,89,217,.125));
        border-color:var(--accent-border-strong, rgba(111,89,217,.36));
      }

      @media (max-width: 1180px){
        .facturas-hero{
          padding:var(--space-lg, 20px);
        }

        .facturas-hero-top{
          grid-template-columns:1fr;
        }

        .facturas-hero-actions{
          justify-content:flex-start;
        }

        .facturas-page-title{
          white-space:normal;
        }

        .facturas-stats{
          grid-template-columns:repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 760px){
        .facturas-view-root{
          gap:var(--space-md, 16px);
        }

        .facturas-hero{
          padding:var(--space-lg, 18px) var(--space-md, 16px);
          border-radius:var(--radius-xl, 18px);
        }

        .facturas-history{
          border-radius:var(--radius-xl, 18px);
        }

        .facturas-history-head{
          grid-template-columns:1fr;
          padding:var(--space-md, 14px) var(--space-md, 14px) var(--space-sm, 12px);
        }

        .facturas-pagination{
          justify-content:flex-start;
        }

        .facturas-stats{
          grid-template-columns:1fr;
        }

        .facturas-page-title{
          font-size:clamp(var(--font-3xl, 24px), 8vw, var(--font-4xl, 34px));
          line-height:1;
          white-space:normal;
        }

        .facturas-page-subtitle{
          font-size:var(--font-base, 14px);
        }

        .facturas-hero-actions{
          width:100%;
        }

        .facturas-btn{
          flex:1 1 auto;
        }
      }
    </style>
  `;
}

/* =========================================================
   HEADER
========================================================= */

export function renderHeader({ items = [], state = {} } = {}) {
  const rows = sortFacturasNewestFirst(items);
  const runtime = safeObject(state);

  const stats = computeStats(rows);
  const canCreateFactura = isAdminState(runtime);

  const updatedAt = first(
    runtime.lastSyncAt,
    ...rows.map((item) => getUpdatedAt(item))
  );

  const remoteCount = safeNumber(
    first(runtime.remoteCount, runtime.totalCount, rows.length),
    rows.length
  );

  const refreshing = Boolean(runtime.refreshing);
  const loading = Boolean(runtime.loading);
  const creating = Boolean(runtime.creating || runtime.creatingFactura);

  return `
    ${renderStyles()}

    <section class="facturas-hero">
      <div class="facturas-hero-top">
        <div class="facturas-hero-copy">
          <h1 class="facturas-page-title">Centro de control de facturas</h1>
          <p class="facturas-page-subtitle">
            Gestiona emisión, seguimiento, consulta y descarga de documentos fiscales desde una vista clara, premium y conectada con sus incidencias relacionadas.
          </p>
        </div>

        <div class="facturas-hero-actions">
          <button
            type="button"
            id="facturas-export-btn"
            class="facturas-btn"
            data-action="export"
            data-facturas-action="export"
            ${loading || refreshing || !rows.length ? "disabled" : ""}
          >
            <span class="facturas-btn-text">Exportar CSV</span>
          </button>

          ${
            canCreateFactura
              ? `
                <button
                  type="button"
                  id="facturas-create-btn"
                  class="facturas-btn facturas-btn--create${creating ? " is-loading" : ""}"
                  data-action="create-factura"
                  data-facturas-action="create-factura"
                  aria-label="Crear nueva factura"
                  ${creating ? 'disabled aria-busy="true"' : ""}
                >
                  ${
                    creating
                      ? renderSpinner("Abriendo...")
                      : '<span class="facturas-btn-text">Crear factura</span>'
                  }
                </button>
              `
              : ""
          }

          <button
            type="button"
            id="facturas-refresh-btn"
            class="facturas-btn facturas-btn--primary${refreshing ? " is-loading" : ""}"
            data-action="refresh"
            data-facturas-action="refresh"
            ${refreshing || loading ? 'disabled aria-busy="true"' : ""}
          >
            ${
              refreshing
                ? renderSpinner("Actualizando...")
                : '<span class="facturas-btn-text">Actualizar</span>'
            }
          </button>
        </div>
      </div>

      <div class="facturas-hero-meta">
        <span class="facturas-meta-pill">
          ${escapeHtml(`${remoteCount} registros remotos`)}
        </span>

        <span class="facturas-meta-pill">
          ${
            updatedAt
              ? escapeHtml(`Última actualización · ${formatRelativeDate(updatedAt)}`)
              : "Sin actualizaciones recientes"
          }
        </span>
      </div>

      <div class="facturas-stats">
        <article class="facturas-stat-card facturas-stat-card--accent">
          <div class="facturas-stat-label">Facturas visibles</div>
          <div class="facturas-stat-value">${escapeHtml(String(stats.total))}</div>
          <div class="facturas-stat-text">Documentos actualmente cargados en pantalla.</div>
        </article>

        <article class="facturas-stat-card facturas-stat-card--success">
          <div class="facturas-stat-label">Importe agregado</div>
          <div class="facturas-stat-value">${escapeHtml(formatMoney(stats.totalImporte, "EUR"))}</div>
          <div class="facturas-stat-text">Suma de la colección actualmente visible.</div>
        </article>

        <article class="facturas-stat-card facturas-stat-card--warning">
          <div class="facturas-stat-label">Pendientes</div>
          <div class="facturas-stat-value">${escapeHtml(String(stats.pendingCount))}</div>
          <div class="facturas-stat-text">Facturas con cobro pendiente, parcial o en borrador.</div>
        </article>

        <article class="facturas-stat-card facturas-stat-card--danger">
          <div class="facturas-stat-label">Vencidas / pagadas</div>
          <div class="facturas-stat-value">${escapeHtml(`${stats.overdueCount} / ${stats.paidCount}`)}</div>
          <div class="facturas-stat-text">Balance rápido entre deuda vencida y cobros cerrados.</div>
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
    ${renderStyles()}

    <section class="facturas-history">
      ${renderTableLoading(DEFAULT_PAGE_SIZE)}
    </section>
  `;
}

export function renderErrorState(message = "No se pudieron cargar las facturas.") {
  return `
    ${renderStyles()}

    <section class="facturas-error">
      <h3 class="facturas-error-title">No se pudo renderizar la vista de facturas</h3>
      <p class="facturas-error-text">${escapeHtml(safeText(message, "Error desconocido al cargar la vista."))}</p>
    </section>
  `;
}

/* =========================================================
   MAIN TABLE
========================================================= */

export function renderCards({ items = [], state = {} } = {}) {
  const rows = sortFacturasNewestFirst(items);
  const runtime = safeObject(state);

  const loading = Boolean(runtime.loading);
  const refreshing = Boolean(runtime.refreshing);

  const pagination = getPagination(rows, runtime);

  if (loading && !rows.length) {
    return `
      ${renderStyles()}

      <section class="facturas-history">
        ${renderTableLoading(DEFAULT_PAGE_SIZE)}
      </section>
    `;
  }

  if (!rows.length) {
    return `
      ${renderStyles()}

      <section class="facturas-history">
        ${renderEmptyState()}
      </section>
    `;
  }

  return `
    ${renderStyles()}

    <section class="facturas-history">
      <div class="facturas-history-head">
        <div class="facturas-history-copy">
          <h2 class="facturas-history-title">Historial de facturas</h2>
          <p class="facturas-history-subtitle">
            ${escapeHtml(
              `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · página ${pagination.currentPage} de ${pagination.totalPages}`
            )}
          </p>
        </div>

        ${renderPagination(pagination, runtime)}
      </div>

      <div class="facturas-table-wrap${refreshing ? " is-refreshing" : ""}">
        ${refreshing ? renderRefreshOverlay() : ""}

        <div class="facturas-table-shell">
          <table class="facturas-table" role="table" aria-label="Listado de facturas">
            <colgroup>
              <col style="width:31%;">
              <col style="width:10%;">
              <col style="width:14%;">
              <col style="width:12%;">
              <col style="width:16%;">
              <col style="width:17%;">
            </colgroup>

            <thead>
              <tr>
                <th>Factura / cliente</th>
                <th>Pago</th>
                <th>Fecha de emisión</th>
                <th>Total</th>
                <th>Incidencia</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              ${pagination.pageItems.map((item) => renderRow(item, runtime)).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function renderFacturasTemplate({ items = [], state = {} } = {}) {
  const rows = sortFacturasNewestFirst(items);

  const data = {
    items: rows,
    state: safeObject(state),
  };

  return `
    <section class="facturas-view-root">
      ${renderHeader(data)}
      ${renderCards(data)}
    </section>
  `;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  renderHeader,
  renderCards,
  renderLoadingState,
  renderErrorState,
  renderFacturasTemplate,
};
