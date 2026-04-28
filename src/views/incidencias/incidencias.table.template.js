/* =========================================================
   Onion SPA - Incidencias Table Template
   Archivo: src/views/incidencias/incidencias.table.template.js

   FINAL PRODUCTION TEMPLATE · LIST VIEW · SOFT APPLE MODE · 10/10

   RESPONSABILIDADES:
   - render del hero/header de incidencias
   - render de tabla productiva con paginación real
   - compatibilidad con IncidenciasView.js
   - estado loading visual en "Ver detalle" sin mover tabla
   - estado loading visual en "Crear nueva incidencia"
   - estado loading visual en refresh / retry / export
   - título compacto y responsive
   - fechas siempre en una sola línea
   - botón "Ver detalle" ajustado al ancho del texto
   - loading de tabla suave en carga / refresh
   - acciones compatibles con data-incidencias-action y data-action
   - pintar importe total de facturas asociadas al ticket
   - avatares fallback con colores intensos pseudo-RNG estables
   - dark/light mode 100% conectado a variables.css

   HARDENING PRO:
   - no depende de imports externos
   - tolera payload heterogéneo
   - soporta state + props directas
   - paginación defensiva
   - estilos encapsulados
   - responsive robusto
   - columna prioridad eliminada de tabla
   - importe blindado contra normalizadores intermedios
   - loading inline icon-only centrado sin cambiar tamaño del botón
========================================================= */

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

function formatLastUpdate(value = null) {
  if (!value) return "Sin fecha";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  const diffHours = Math.abs(Date.now() - date.getTime()) / 3600000;

  if (diffHours <= 72) {
    return formatRelativeDate(value);
  }

  return formatDateTime(value);
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
  const ticketId = getTicketId(item);
  const clientName = getClientName(item);
  const seed = `${ticketId}|${clientName}`;
  const index = hashString(seed) % AVATAR_PALETTE.length;

  return AVATAR_PALETTE[index];
}

function getAvatarStyle(item = {}) {
  const palette = getAvatarPalette(item);

  return [
    `--inc-avatar-bg:${palette.bg}`,
    `--inc-avatar-bg-dark:${palette.bgDark}`,
    `--inc-avatar-ring:${palette.ring}`,
    `--inc-avatar-shadow:${palette.shadow}`,
  ].join(";");
}

/* =========================================================
   DATA PICKERS
========================================================= */

function getTicketId(item = {}) {
  return safeText(
    first(
      item.ticketId,
      item.code,
      item.numero,
      item.ticketCode,
      item.id,
      item?.raw?.ticketId,
      item?.raw?.code,
      item?.raw?.numero,
      item?.raw?.ticketCode,
      item?.raw?.id
    ),
    "INC-SIN-ID"
  );
}

function getSubject(item = {}) {
  return safeText(
    first(
      item.subject,
      item.title,
      item.asunto,
      item.name,
      item?.raw?.subject,
      item?.raw?.title,
      item?.raw?.asunto,
      item?.raw?.name
    ),
    "Incidencia sin asunto"
  );
}

function getDescription(item = {}) {
  return safeText(
    first(
      item.description,
      item.preview,
      item.message,
      item.descripcion,
      item.body,
      item?.raw?.description,
      item?.raw?.preview,
      item?.raw?.message,
      item?.raw?.descripcion,
      item?.raw?.body
    ),
    "Sin descripción."
  );
}

function getClientName(item = {}) {
  return safeText(
    first(
      item.clientName,
      item.name,
      item.cliente?.nombre,
      item.cliente?.name,
      item.client?.name,
      item.customer?.name,
      item.receptor?.name,
      item.createdBy?.name,
      item?.raw?.clientName,
      item?.raw?.name,
      item?.raw?.cliente?.nombre,
      item?.raw?.cliente?.name,
      item?.raw?.client?.name,
      item?.raw?.customer?.name,
      item?.raw?.receptor?.name,
      item?.raw?.createdBy?.name
    ),
    getSubject(item)
  );
}

function getAvatarUrl(item = {}) {
  return safeText(
    first(
      item.clientAvatar,
      item.avatar,
      item.avatarUrl,
      item.cliente?.avatar,
      item.cliente?.avatarUrl,
      item.client?.avatar,
      item.client?.avatarUrl,
      item.customer?.avatar,
      item.customer?.avatarUrl,
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

function getInitials(value = "") {
  const text = normalizeWhitespace(value);

  if (!text) return "ON";

  const parts = text.split(" ").filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "ON";
}

function getStatusKey(value = "") {
  const key = normalizeKey(value);

  if (["pending", "pendiente"].includes(key)) return "pending";
  if (["open", "abierta", "abierto"].includes(key)) return "open";

  if (
    [
      "progress",
      "in_progress",
      "inprogress",
      "en_proceso",
      "proceso",
    ].includes(key)
  ) {
    return "progress";
  }

  if (["resolved", "resuelta", "resuelto"].includes(key)) return "resolved";
  if (["closed", "cerrada", "cerrado"].includes(key)) return "closed";

  if (["cancelled", "cancelada", "cancelado"].includes(key)) {
    return "closed";
  }

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

function getPriorityKey(item = {}) {
  return normalizeKey(
    first(
      item.priority,
      item.prioridad,
      item?.raw?.priority,
      item?.raw?.prioridad,
      "medium"
    )
  );
}

function getImporteAmount(item = {}) {
  return first(
    item.total,
    item.amount,
    item.importe,
    item.price,

    item.facturasTotal,
    item.invoicesTotal,
    item.importeFacturas,
    item.invoiceTotal,

    item.linkedInvoices?.total,
    item.linkedInvoices?.amount,
    item.linkedInvoices?.importe,

    item.meta?.invoicesTotal,
    item.meta?.invoiceTotal,

    item?.raw?.total,
    item?.raw?.amount,
    item?.raw?.importe,
    item?.raw?.price,

    item?.raw?.facturasTotal,
    item?.raw?.invoicesTotal,
    item?.raw?.importeFacturas,
    item?.raw?.invoiceTotal,

    item?.raw?.linkedInvoices?.total,
    item?.raw?.linkedInvoices?.amount,
    item?.raw?.linkedInvoices?.importe,

    item?.raw?.meta?.invoicesTotal,
    item?.raw?.meta?.invoiceTotal
  );
}

function getImporteCurrency(item = {}) {
  return safeText(
    first(
      item.currency,
      item.moneda,

      item.linkedInvoices?.currency,
      item.linkedInvoices?.moneda,

      item.meta?.invoiceCurrency,
      item.meta?.currency,
      item.meta?.moneda,

      item?.raw?.currency,
      item?.raw?.moneda,

      item?.raw?.linkedInvoices?.currency,
      item?.raw?.linkedInvoices?.moneda,

      item?.raw?.meta?.invoiceCurrency,
      item?.raw?.meta?.currency,
      item?.raw?.meta?.moneda,

      "EUR"
    ),
    "EUR"
  );
}

function getImporteLabel(item = {}) {
  const amount = getImporteAmount(item);

  if (amount !== null && amount !== undefined && amount !== "") {
    const numericAmount = Number(amount);

    if (Number.isFinite(numericAmount)) {
      return formatMoney(numericAmount, getImporteCurrency(item));
    }
  }

  const pago = normalizeKey(
    first(
      item.paymentStatus,
      item.estadoPago,
      item.linkedInvoices?.paymentStatus,
      item.linkedInvoices?.estadoPago,
      item?.raw?.paymentStatus,
      item?.raw?.estadoPago,
      item?.raw?.linkedInvoices?.paymentStatus,
      item?.raw?.linkedInvoices?.estadoPago
    )
  );

  if (["paid", "pagada", "pagado", "cobrada"].includes(pago)) return "Pagado";
  if (["pending", "pendiente"].includes(pago)) return "Pendiente";
  if (["partial", "parcial"].includes(pago)) return "Parcial";
  if (["overdue", "vencida"].includes(pago)) return "Vencido";

  return "—";
}

function getCreatedAt(item = {}) {
  return first(
    item.createdAt,
    item.fechaCreacion,
    item.createdAtES,
    item.date,
    item?.raw?.createdAt,
    item?.raw?.fechaCreacion,
    item?.raw?.createdAtES,
    item?.raw?.date
  );
}

function getUpdatedAt(item = {}) {
  return first(
    item.updatedAt,
    item.lastUpdateAt,
    item.ultimaNovedad,
    item.modifiedAt,
    item.closedAt,
    item.createdAt,
    item?.raw?.updatedAt,
    item?.raw?.lastUpdateAt,
    item?.raw?.ultimaNovedad,
    item?.raw?.modifiedAt,
    item?.raw?.closedAt,
    item?.raw?.createdAt
  );
}

function getAttachmentsCount(item = {}) {
  const attachments = first(
    item.attachments,
    item.files,
    item.adjuntos,
    item?.raw?.attachments,
    item?.raw?.files,
    item?.raw?.adjuntos
  );

  if (Array.isArray(attachments)) return attachments.length;

  return safeNumber(
    first(
      item.attachmentsCount,
      item.filesCount,
      item?.raw?.attachmentsCount,
      item?.raw?.filesCount,
      0
    ),
    0
  );
}

function isClosedLike(item = {}) {
  return ["closed", "resolved"].includes(
    getStatusKey(
      first(
        item.status,
        item.estado,
        item?.raw?.status,
        item?.raw?.estado
      )
    )
  );
}

function isOpenLike(item = {}) {
  return ["open", "pending", "progress"].includes(
    getStatusKey(
      first(
        item.status,
        item.estado,
        item?.raw?.status,
        item?.raw?.estado
      )
    )
  );
}

function isUrgentLike(item = {}) {
  return ["urgent", "urgente", "critical", "critica"].includes(
    getPriorityKey(item)
  );
}

/* =========================================================
   STATS / PAGINATION
========================================================= */

function computeStats(items = []) {
  const rows = safeArray(items);

  return {
    total: rows.length,
    openCount: rows.filter((item) => isOpenLike(item)).length,
    closedCount: rows.filter((item) => isClosedLike(item)).length,
    urgentCount: rows.filter((item) => isUrgentLike(item)).length,
    attachmentsCount: rows.reduce(
      (sum, item) => sum + getAttachmentsCount(item),
      0
    ),
  };
}

function getPagination(items = [], input = {}) {
  const allItems = safeArray(items);
  const data = safeObject(input);
  const runtime = safeObject(data.state);

  const pageSize = Math.max(
    1,
    safeNumber(
      first(
        data.pageSize,
        runtime.pageSize,
        runtime.limit,
        5
      ),
      5
    )
  );

  const reportedTotal = Math.max(
    allItems.length,
    safeNumber(
      first(
        data.totalCount,
        data.remoteCount,
        runtime.totalCount,
        runtime.remoteCount,
        runtime.total,
        allItems.length
      ),
      allItems.length
    )
  );

  const totalPagesFromProps = safeNumber(
    first(data.totalPages, runtime.totalPages),
    0
  );

  const totalPages = Math.max(
    1,
    totalPagesFromProps || Math.ceil((reportedTotal || 1) / pageSize)
  );

  const currentPage = Math.min(
    Math.max(
      1,
      safeNumber(
        first(data.page, runtime.page, runtime.currentPage, 1),
        1
      )
    ),
    totalPages
  );

  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = allItems.slice(startIndex, startIndex + pageSize);

  const rangeStart = reportedTotal && pageItems.length ? startIndex + 1 : 0;
  const rangeEnd = reportedTotal
    ? Math.min(startIndex + pageItems.length, reportedTotal)
    : 0;

  return {
    allItems,
    pageItems,
    pageSize,
    currentPage,
    totalPages,
    totalCount: reportedTotal,
    rangeStart,
    rangeEnd,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
}

/* =========================================================
   UI PARTIALS
========================================================= */

function renderSpinner(label = "") {
  return `
    <span class="incidencias-inline-loading">
      <span class="incidencias-inline-spinner" aria-hidden="true"></span>
      ${
        label
          ? `<span class="incidencias-inline-loading-text">${escapeHtml(label)}</span>`
          : ""
      }
    </span>
  `;
}

function renderLoaderOnly(label = "Cargando") {
  return `
    <span
      class="incidencias-loader-only"
      role="status"
      aria-label="${escapeHtml(label)}"
      title="${escapeHtml(label)}"
      data-tooltip="${escapeHtml(label)}"
    >
      <span class="incidencias-inline-spinner" aria-hidden="true"></span>
    </span>
  `;
}

function renderAvatar(item = {}) {
  const fullName = getClientName(item);
  const initials = getInitials(fullName);
  const avatarUrl = getAvatarUrl(item);
  const avatarStyle = getAvatarStyle(item);

  if (avatarUrl) {
    return `
      <div
        class="incidencias-avatar"
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
        <span class="incidencias-avatar-fallback">${escapeHtml(initials)}</span>
      </div>
    `;
  }

  return `
    <div
      class="incidencias-avatar incidencias-avatar--fallback"
      title="${escapeHtml(fullName)}"
      aria-label="${escapeHtml(fullName)}"
      data-tooltip="${escapeHtml(fullName)}"
      style="${escapeHtml(avatarStyle)}"
    >
      <span class="incidencias-avatar-fallback">${escapeHtml(initials)}</span>
    </div>
  `;
}

function renderStatusChip(item = {}) {
  const rawStatus = first(
    item.status,
    item.estado,
    item?.raw?.status,
    item?.raw?.estado
  );

  const key = getStatusKey(rawStatus);
  const label = getStatusLabel(rawStatus);

  return `
    <span class="incidencias-chip incidencias-chip--${escapeHtml(key)}">
      ${escapeHtml(label)}
    </span>
  `;
}

function renderImporteChip(item = {}) {
  const label = getImporteLabel(item);
  const isMoney = /€|EUR|\$|USD/i.test(label);

  if (isMoney) {
    return `<span class="incidencias-importe incidencias-importe--money">${escapeHtml(label)}</span>`;
  }

  return `<span class="incidencias-importe incidencias-importe--status">${escapeHtml(label)}</span>`;
}

function renderRow(item = {}, state = {}) {
  const runtime = safeObject(state);
  const ticketId = getTicketId(item);
  const subject = getSubject(item);
  const description = getDescription(item);
  const createdAt = formatDateTime(getCreatedAt(item));
  const updatedAt = formatLastUpdate(getUpdatedAt(item));
  const attachmentsCount = getAttachmentsCount(item);

  const openingTicketId = safeText(runtime.openingTicketId, "");
  const isOpening = openingTicketId === ticketId;

  return `
    <tr class="incidencias-row" data-ticket-id="${escapeHtml(ticketId)}">
      <td class="incidencias-cell incidencias-cell--main">
        <div class="incidencias-main">
          ${renderAvatar(item)}

          <div class="incidencias-main-copy">
            <div class="incidencias-ticket-id">${escapeHtml(ticketId)}</div>
            <div class="incidencias-ticket-subject">${escapeHtml(subject)}</div>
            <div class="incidencias-ticket-description">${escapeHtml(description)}</div>
          </div>
        </div>
      </td>

      <td class="incidencias-cell incidencias-cell--status">
        ${renderStatusChip(item)}
      </td>

      <td class="incidencias-cell incidencias-cell--date">
        <span class="incidencias-date-inline">${escapeHtml(createdAt)}</span>
      </td>

      <td class="incidencias-cell incidencias-cell--date">
        <span class="incidencias-date-inline">${escapeHtml(updatedAt)}</span>
      </td>

      <td class="incidencias-cell incidencias-cell--importe">
        ${renderImporteChip(item)}
      </td>

      <td class="incidencias-cell incidencias-cell--attachments">
        <span class="incidencias-attachments-pill">
          ${escapeHtml(String(attachmentsCount))}
        </span>
      </td>

      <td class="incidencias-cell incidencias-cell--actions">
        <button
          type="button"
          class="incidencias-detail-btn${isOpening ? " is-loading" : ""}"
          data-incidencias-action="detail"
          data-action="open-ticket"
          data-ticket-id="${escapeHtml(ticketId)}"
          ${isOpening ? 'disabled aria-busy="true"' : ""}
        >
          ${
            isOpening
              ? renderLoaderOnly("Cargando detalle")
              : '<span class="incidencias-btn-text">Ver detalle</span>'
          }
        </button>
      </td>
    </tr>
  `;
}

function renderEmptyState({ hasError = false } = {}) {
  return `
    <div class="incidencias-empty">
      <h3 class="incidencias-empty-title">
        ${
          hasError
            ? "No se pudieron cargar las incidencias"
            : "No hay incidencias para mostrar"
        }
      </h3>
      <p class="incidencias-empty-text">
        ${
          hasError
            ? "Puedes reintentar la carga desde el botón de actualizar."
            : "Cuando haya solicitudes registradas aparecerán aquí."
        }
      </p>

      ${
        hasError
          ? `
            <button
              type="button"
              class="incidencias-btn"
              data-incidencias-action="retry"
              data-action="retry"
            >
              Reintentar
            </button>
          `
          : ""
      }
    </div>
  `;
}

function renderTableLoading(rows = 5) {
  return `
    <div class="incidencias-table-loading" aria-hidden="true">
      ${Array.from({ length: rows })
        .map(
          () => `
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
              <div class="incidencias-skeleton incidencias-skeleton--pill"></div>
              <div class="incidencias-skeleton incidencias-skeleton--pill"></div>
              <div class="incidencias-skeleton incidencias-skeleton--btn"></div>
            </div>
          `
        )
        .join("")}
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
   STYLES
========================================================= */

function renderStyles() {
  return `
    <style>
      .incidencias-view-root{
        display:grid;
        gap:var(--view-section-gap, var(--space-lg, 18px));
        color:var(--text, #f5f5f5);
        font-family:var(--font-family, inherit);
      }

      .incidencias-hero{
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

      .incidencias-hero-top{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:var(--space-lg, 18px);
        align-items:start;
      }

      .incidencias-hero-copy{
        min-width:0;
        display:grid;
        gap:var(--space-xs, 10px);
      }

      .incidencias-page-title{
        margin:0;
        max-width:100%;
        font-size:clamp(var(--font-3xl, 24px), 2.6vw, var(--font-5xl, 40px));
        line-height:var(--line-tight, .98);
        letter-spacing:var(--view-title-letter, -.05em);
        font-weight:var(--view-title-weight, var(--weight-black, 800));
        color:var(--text-strong, #ffffff);
        white-space:nowrap;
      }

      .incidencias-page-subtitle{
        margin:0;
        max-width:860px;
        font-size:var(--font-lg, 15px);
        line-height:var(--line-relaxed, 1.58);
        color:var(--view-subtitle-color, var(--text-muted, rgba(245,245,245,.70)));
      }

      .incidencias-hero-actions{
        display:flex;
        align-items:flex-start;
        justify-content:flex-end;
        gap:var(--space-xs, 10px);
        flex-wrap:wrap;
      }

      .incidencias-btn{
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

      .incidencias-btn:hover{
        transform:translateY(-1px);
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        box-shadow:var(--shadow-md, 0 14px 30px rgba(0,0,0,.22));
      }

      .incidencias-btn--primary{
        border-color:var(--btn-primary-border, var(--accent-border, rgba(255,255,255,.05)));
        background:var(--btn-primary-bg, var(--gradient-accent, linear-gradient(135deg, #55555d 0%, #3f3f46 55%, #2f2f35 100%)));
        color:var(--btn-primary-text, var(--text-on-accent, #ffffff));
        box-shadow:var(--btn-primary-shadow, 0 12px 28px rgba(0,0,0,.22));
      }

      .incidencias-btn--primary:hover{
        background:var(--btn-primary-bg-hover, var(--btn-primary-bg));
      }

      .incidencias-btn.is-loading,
      .incidencias-detail-btn.is-loading{
        cursor:wait;
        opacity:.92;
      }

      .incidencias-btn:disabled,
      .incidencias-detail-btn:disabled{
        pointer-events:none;
        opacity:.76;
      }

      .incidencias-hero-meta{
        margin-top:var(--space-md, 14px);
        display:flex;
        align-items:center;
        gap:var(--space-xs, 8px);
        flex-wrap:wrap;
      }

      .incidencias-meta-pill{
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

      .incidencias-stats{
        margin-top:var(--space-md, 16px);
        display:grid;
        grid-template-columns:repeat(4, minmax(0, 1fr));
        gap:var(--space-sm, 12px);
      }

      .incidencias-stat-card{
        display:grid;
        gap:var(--space-xs, 8px);
        min-height:calc(122px * var(--ui-scale, 1));
        padding:var(--space-md, 16px) var(--space-lg, 18px);
        border-radius:var(--card-radius, 18px);
        border:1px solid var(--card-border, var(--border-default, rgba(255,255,255,.082)));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88)));
        box-shadow:var(--shadow-card, var(--card-shadow, 0 16px 36px rgba(0,0,0,.24)));
      }

      .incidencias-stat-card--open{
        border-color:var(--accent-border, var(--border-accent, rgba(113,113,122,.30)));
      }

      .incidencias-stat-card--closed{
        border-color:var(--border-success, rgba(34,197,94,.30));
      }

      .incidencias-stat-card--urgent{
        border-color:var(--border-error, rgba(239,68,68,.30));
      }

      .incidencias-stat-label{
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        letter-spacing:var(--letter-wider, .08em);
        text-transform:uppercase;
        color:var(--text-dim, rgba(245,245,245,.50));
      }

      .incidencias-stat-value{
        font-size:var(--font-5xl, 40px);
        line-height:.92;
        letter-spacing:var(--letter-tight, -.03em);
        font-weight:var(--weight-black, 800);
        color:var(--text-strong, #ffffff);
      }

      .incidencias-stat-text{
        font-size:var(--font-md, 13px);
        line-height:var(--line-normal, 1.42);
        color:var(--text-muted, rgba(245,245,245,.70));
      }

      .incidencias-history{
        overflow:hidden;
        border-radius:var(--data-table-radius, var(--card-radius-lg, 22px));
        border:1px solid var(--data-table-border, var(--card-border, var(--border-default, rgba(255,255,255,.082))));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--data-table-bg, var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88))));
        box-shadow:var(--data-table-shadow, var(--shadow-card, var(--card-shadow, 0 16px 36px rgba(0,0,0,.24))));
      }

      .incidencias-history-head{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:var(--space-md, 14px);
        align-items:start;
        padding:var(--space-md, 14px) var(--space-lg, 18px) var(--space-sm, 12px);
        border-bottom:1px solid var(--data-table-row-border, var(--table-border, rgba(255,255,255,.052)));
      }

      .incidencias-history-copy{
        min-width:0;
        display:grid;
        gap:var(--space-3xs, 2px);
      }

      .incidencias-history-title{
        margin:0;
        font-size:var(--section-title-size, var(--font-xl, 16px));
        line-height:var(--line-snug, 1.22);
        font-weight:var(--section-title-weight, var(--weight-bold, 700));
        color:var(--section-title-color, var(--text-strong, #ffffff));
      }

      .incidencias-history-subtitle{
        margin:0;
        font-size:var(--section-subtitle-size, var(--font-sm, 12px));
        line-height:var(--line-normal, 1.42);
        color:var(--section-subtitle-color, var(--text-dim, rgba(245,245,245,.50)));
      }

      .incidencias-pagination{
        display:flex;
        gap:var(--space-xs, 8px);
        flex-wrap:wrap;
      }

      .incidencias-pagination-btn{
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

      .incidencias-pagination-btn:hover{
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        border-color:var(--border-strong, rgba(255,255,255,.12));
      }

      .incidencias-pagination-btn[disabled],
      .incidencias-pagination-btn[aria-disabled="true"]{
        opacity:.48;
        cursor:not-allowed;
        pointer-events:none;
      }

      .incidencias-table-wrap{
        position:relative;
        min-height:120px;
      }

      .incidencias-table-wrap.is-refreshing .incidencias-table-shell{
        opacity:.56;
        filter:blur(.7px);
        transition:
          opacity var(--duration-fast, .18s) var(--ease-standard, ease),
          filter var(--duration-fast, .18s) var(--ease-standard, ease);
      }

      .incidencias-table-shell{
        width:100%;
        overflow-x:auto;
        overflow-y:hidden;
        transition:
          opacity var(--duration-fast, .18s) var(--ease-standard, ease),
          filter var(--duration-fast, .18s) var(--ease-standard, ease);
      }

      .incidencias-table{
        width:100%;
        border-collapse:separate;
        border-spacing:0;
        min-width:1120px;
        background:var(--table-bg, transparent);
      }

      .incidencias-table thead th{
        padding:var(--table-cell-padding-y, 12px) var(--table-cell-padding-x, 18px);
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

      .incidencias-table tbody td{
        padding:calc(14px * var(--ui-scale, 1)) var(--table-cell-padding-x, 18px);
        vertical-align:middle;
        border-bottom:1px solid var(--data-table-row-border, var(--table-border, rgba(255,255,255,.052)));
      }

      .incidencias-table tbody tr:last-child td{
        border-bottom:none;
      }

      .incidencias-row{
        transition:
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .incidencias-row:hover{
        background:var(--data-table-row-hover, var(--table-row-hover, rgba(255,255,255,.024)));
      }

      .incidencias-main{
        display:grid;
        grid-template-columns:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1))) minmax(0, 1fr);
        gap:var(--space-sm, 12px);
        align-items:center;
        min-width:0;
      }

      .incidencias-avatar{
        position:relative;
        width:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        height:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        border-radius:var(--radius-pill, 999px);
        overflow:hidden;
        flex:0 0 var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        background:var(--inc-avatar-bg, var(--avatar-bg, linear-gradient(180deg, #52525b 0%, #3f3f46 100%)));
        box-shadow:
          0 10px 22px var(--inc-avatar-shadow, rgba(0,0,0,.20)),
          0 0 0 3px color-mix(in srgb, var(--inc-avatar-ring, var(--accent-ring, rgba(113,113,122,.30))) 58%, transparent),
          var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.04));
        transform:translateZ(0);
      }

      .incidencias-avatar::after{
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

      .incidencias-avatar img{
        position:relative;
        z-index:1;
        display:block;
        width:100%;
        height:100%;
        object-fit:cover;
      }

      .incidencias-avatar-fallback{
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

      .incidencias-avatar[data-fallback="true"] .incidencias-avatar-fallback{
        display:flex;
      }

      .incidencias-avatar[data-fallback="true"] img{
        display:none !important;
      }

      .incidencias-avatar--fallback .incidencias-avatar-fallback{
        display:flex;
      }

      .incidencias-main-copy{
        min-width:0;
        display:grid;
        gap:var(--space-3xs, 3px);
      }

      .incidencias-ticket-id{
        font-size:var(--font-sm, 12px);
        line-height:var(--line-snug, 1.22);
        font-weight:var(--weight-bold, 700);
        letter-spacing:.055em;
        color:var(--text-dim, rgba(245,245,245,.50));
        text-transform:uppercase;
      }

      .incidencias-ticket-subject{
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

      .incidencias-ticket-description{
        font-size:var(--font-md, 13px);
        line-height:1.3;
        color:var(--text-dim, rgba(245,245,245,.50));
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .incidencias-chip{
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
      }

      .incidencias-chip--pending{
        color:var(--warning, #f59e0b);
        background:var(--warning-bg, rgba(245,158,11,.10));
        border-color:var(--border-warning, rgba(245,158,11,.30));
      }

      .incidencias-chip--open{
        color:var(--accent-hover, var(--accent, #3f3f46));
        background:var(--accent-soft, rgba(63,63,70,.18));
        border-color:var(--accent-border, rgba(113,113,122,.28));
      }

      .incidencias-chip--progress{
        color:var(--info, #94a3b8);
        background:var(--info-bg, rgba(148,163,184,.10));
        border-color:var(--border-info, rgba(148,163,184,.28));
      }

      .incidencias-chip--resolved,
      .incidencias-chip--closed{
        color:var(--success, #22c55e);
        background:var(--success-bg, rgba(34,197,94,.10));
        border-color:var(--border-success, rgba(34,197,94,.30));
      }

      .incidencias-date-inline{
        display:inline-block;
        white-space:nowrap;
        font-size:var(--font-md, 13px);
        line-height:1.2;
        font-weight:var(--weight-semibold, 600);
        font-variant-numeric:tabular-nums;
        color:var(--data-table-cell-text, var(--text-soft, rgba(245,245,245,.88)));
      }

      .incidencias-importe,
      .incidencias-attachments-pill{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:calc(30px * var(--ui-scale, 1));
        padding:0 var(--space-sm, 12px);
        border-radius:var(--radius-pill, 999px);
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        white-space:nowrap;
        border:1px solid transparent;
      }

      .incidencias-importe--money{
        color:var(--chip-text, var(--text-soft, rgba(245,245,245,.88)));
        background:var(--chip-bg, rgba(255,255,255,.034));
        border-color:var(--chip-border, rgba(255,255,255,.07));
      }

      .incidencias-importe--status{
        color:var(--text-dim, rgba(245,245,245,.50));
        background:var(--chip-bg, rgba(255,255,255,.034));
        border-color:var(--chip-border, rgba(255,255,255,.07));
      }

      .incidencias-attachments-pill{
        min-width:32px;
        color:var(--chip-text, var(--text-soft, rgba(245,245,245,.88)));
        background:var(--chip-bg, rgba(255,255,255,.034));
        border-color:var(--chip-border, rgba(255,255,255,.07));
      }

      .incidencias-cell--actions{
        width:1%;
        white-space:nowrap;
      }

      .incidencias-detail-btn{
        width:auto;
        min-width:calc(96px * var(--ui-scale, 1));
        min-height:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        height:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        padding:0 var(--space-sm, 12px);
        border-radius:var(--radius-md, 12px);
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
        white-space:nowrap;
        box-shadow:none;
        transition:
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          opacity var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .incidencias-detail-btn:hover{
        border-color:var(--border-strong, rgba(255,255,255,.12));
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        transform:translateY(-1px);
      }

      .incidencias-detail-btn.is-loading{
        min-width:calc(96px * var(--ui-scale, 1));
        width:auto;
        max-width:none;
        height:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        min-height:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        padding:0 var(--space-sm, 12px);
        border-radius:var(--radius-md, 12px);
        justify-content:center;
      }

      .incidencias-loader-only{
        display:inline-flex;
        width:16px;
        height:16px;
        align-items:center;
        justify-content:center;
        flex:0 0 auto;
      }

      .incidencias-inline-loading{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:var(--space-xs, 7px);
        white-space:nowrap;
      }

      .incidencias-inline-loading-text{
        display:inline-block;
      }

      .incidencias-inline-spinner{
        width:14px;
        height:14px;
        border-radius:var(--radius-pill, 999px);
        border:2px solid var(--loader-ring, rgba(255,255,255,.12));
        border-top-color:currentColor;
        animation:incidenciasSpin .78s linear infinite;
        flex:0 0 auto;
      }

      .incidencias-btn:not(.incidencias-btn--primary) .incidencias-inline-spinner,
      .incidencias-detail-btn .incidencias-inline-spinner{
        border-color:var(--loader-ring, rgba(255,255,255,.12));
        border-top-color:currentColor;
      }

      .incidencias-detail-btn.is-loading .incidencias-inline-spinner{
        width:15px;
        height:15px;
      }

      .incidencias-refresh-overlay{
        position:absolute;
        inset:0;
        z-index:3;
        display:grid;
        place-items:center;
        pointer-events:none;
        background:var(--backdrop-bg, rgba(10,10,12,.28));
        backdrop-filter:var(--blur-sm, blur(8px));
      }

      .incidencias-refresh-card{
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

      .incidencias-table-loading{
        padding:var(--space-sm, 12px) var(--space-lg, 18px) var(--space-md, 16px);
        display:grid;
        gap:var(--space-sm, 12px);
      }

      .incidencias-table-loading-row{
        display:grid;
        grid-template-columns:var(--avatar-size-lg, 44px) minmax(220px, 1.45fr) 112px 140px 140px 86px 70px 112px;
        gap:var(--space-sm, 12px);
        align-items:center;
      }

      .incidencias-table-loading-copy{
        display:grid;
        gap:var(--space-xs, 7px);
      }

      .incidencias-skeleton{
        position:relative;
        overflow:hidden;
        border-radius:var(--skeleton-radius, var(--radius-md, 13px));
        background:var(--skeleton-bg, rgba(255,255,255,.050));
      }

      .incidencias-skeleton::after{
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
        animation:incidenciasSkeleton 1.2s var(--ease-standard, ease-in-out) infinite;
      }

      .incidencias-skeleton--avatar{
        width:var(--avatar-size-lg, 44px);
        height:var(--avatar-size-lg, 44px);
        border-radius:var(--radius-pill, 999px);
      }

      .incidencias-skeleton--xs{
        width:120px;
        height:var(--skeleton-height-sm, 10px);
      }

      .incidencias-skeleton--lg{
        width:74%;
        height:var(--skeleton-height-md, 14px);
      }

      .incidencias-skeleton--md{
        width:56%;
        height:12px;
      }

      .incidencias-skeleton--pill{
        width:86px;
        height:30px;
        border-radius:var(--radius-pill, 999px);
      }

      .incidencias-skeleton--date{
        width:124px;
        height:12px;
      }

      .incidencias-skeleton--btn{
        width:96px;
        height:var(--btn-height-sm, 34px);
        border-radius:var(--radius-md, 12px);
      }

      .incidencias-empty{
        display:grid;
        justify-items:center;
        gap:var(--space-xs, 8px);
        padding:var(--space-4xl, 44px) var(--space-lg, 20px) var(--space-5xl, 48px);
        text-align:center;
      }

      .incidencias-empty-title{
        margin:0;
        font-size:var(--font-2xl, 18px);
        font-weight:var(--weight-bold, 700);
        color:var(--text-strong, #ffffff);
      }

      .incidencias-empty-text{
        margin:0;
        font-size:var(--font-md, 13px);
        line-height:var(--line-relaxed, 1.62);
        color:var(--text-muted, rgba(245,245,245,.70));
      }

      @keyframes incidenciasSpin{
        to{ transform:rotate(360deg); }
      }

      @keyframes incidenciasSkeleton{
        to{ transform:translateX(100%); }
      }

      [data-theme="dark"] .incidencias-avatar,
      :root:not([data-theme="light"]) .incidencias-avatar{
        background:var(--inc-avatar-bg-dark, var(--inc-avatar-bg, var(--avatar-bg)));
      }

      [data-theme="light"] .incidencias-hero,
      [data-theme="light"] .incidencias-history{
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,0) 34%)),
          var(--view-hero-bg, var(--panel-bg, var(--card-bg, var(--surface-elevated, #ffffff))));
      }

      [data-theme="light"] .incidencias-stat-card{
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,0) 34%)),
          var(--card-bg, var(--surface-elevated, #ffffff));
      }

      @media (max-width: 1240px){
        .incidencias-page-title{
          font-size:clamp(var(--font-3xl, 24px), 2.4vw, var(--font-4xl, 32px));
        }

        .incidencias-stats{
          grid-template-columns:repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 1180px){
        .incidencias-hero{
          padding:var(--space-lg, 20px);
        }

        .incidencias-hero-top{
          grid-template-columns:1fr;
        }

        .incidencias-hero-actions{
          justify-content:flex-start;
        }

        .incidencias-page-title{
          white-space:normal;
        }
      }

      @media (max-width: 760px){
        .incidencias-view-root{
          gap:var(--space-md, 16px);
        }

        .incidencias-hero{
          padding:var(--space-lg, 18px) var(--space-md, 16px);
          border-radius:var(--radius-xl, 18px);
        }

        .incidencias-history{
          border-radius:var(--radius-xl, 18px);
        }

        .incidencias-history-head{
          grid-template-columns:1fr;
          padding:var(--space-md, 14px) var(--space-md, 14px) var(--space-sm, 12px);
        }

        .incidencias-pagination{
          justify-content:flex-start;
        }

        .incidencias-stats{
          grid-template-columns:1fr;
        }

        .incidencias-page-title{
          font-size:clamp(var(--font-3xl, 24px), 8vw, var(--font-4xl, 34px));
          line-height:1;
          white-space:normal;
        }

        .incidencias-page-subtitle{
          font-size:var(--font-base, 14px);
        }

        .incidencias-hero-actions{
          width:100%;
        }

        .incidencias-btn{
          flex:1 1 auto;
        }
      }
    </style>
  `;
}

/* =========================================================
   HEADER
========================================================= */

export function renderHeader(input = {}) {
  const data = safeObject(input);

  const items = safeArray(
    first(data.items, data.rows, data.tickets, data.incidencias)
  );

  const state = safeObject(data.state);

  const stats = computeStats(items);

  const remoteCount = Math.max(
    stats.total,
    safeNumber(
      first(
        data.remoteCount,
        data.totalCount,
        state.remoteCount,
        state.totalCount,
        stats.total
      ),
      stats.total
    )
  );

  const updatedAt = first(
    data.lastUpdatedAt,
    state.lastSyncAt,
    data.updatedAt,
    ...items.map((item) => getUpdatedAt(item))
  );

  const title = safeText(
    first(data.title, "Tus incidencias y solicitudes"),
    "Tus incidencias y solicitudes"
  );

  const subtitle = safeText(
    first(
      data.subtitle,
      "Consulta el estado de tus incidencias, revisa las actualizaciones más recientes y crea nuevas solicitudes desde una vista clara, cercana y fácil de seguir."
    ),
    ""
  );

  const creating = Boolean(state.creating);
  const refreshing = Boolean(state.refreshing);
  const loading = Boolean(state.loading);

  return `
    ${renderStyles()}

    <section class="incidencias-hero">
      <div class="incidencias-hero-top">
        <div class="incidencias-hero-copy">
          <h1 class="incidencias-page-title">${escapeHtml(title)}</h1>
          <p class="incidencias-page-subtitle">${escapeHtml(subtitle)}</p>
        </div>

        <div class="incidencias-hero-actions">
          <button
            type="button"
            id="incidencias-refresh-btn"
            class="incidencias-btn${refreshing ? " is-loading" : ""}"
            data-incidencias-action="refresh"
            data-action="refresh"
            ${refreshing || loading ? 'disabled aria-busy="true"' : ""}
          >
            ${
              refreshing
                ? renderSpinner("Actualizando...")
                : '<span class="incidencias-btn-text">Actualizar</span>'
            }
          </button>

          <button
            type="button"
            id="incidencias-export-btn"
            class="incidencias-btn"
            data-incidencias-action="export"
            data-action="export-csv"
            ${loading || refreshing || !items.length ? "disabled" : ""}
          >
            <span class="incidencias-btn-text">Exportar historial</span>
          </button>

          <button
            type="button"
            id="incidencias-create-btn"
            class="incidencias-btn incidencias-btn--primary${creating ? " is-loading" : ""}"
            data-incidencias-action="create"
            data-action="create-incidencia"
            ${creating ? 'disabled aria-busy="true"' : ""}
          >
            ${
              creating
                ? renderSpinner("Abriendo...")
                : '<span class="incidencias-btn-text">Crear nueva incidencia</span>'
            }
          </button>
        </div>
      </div>

      <div class="incidencias-hero-meta">
        <span class="incidencias-meta-pill">
          ${escapeHtml(`${remoteCount} solicitudes registradas`)}
        </span>

        <span class="incidencias-meta-pill">
          ${
            updatedAt
              ? escapeHtml(`Última actualización · ${formatRelativeDate(updatedAt)}`)
              : "Sin actualizaciones recientes"
          }
        </span>
      </div>

      <div class="incidencias-stats">
        <article class="incidencias-stat-card incidencias-stat-card--open">
          <div class="incidencias-stat-label">Abiertas</div>
          <div class="incidencias-stat-value">${escapeHtml(String(stats.openCount))}</div>
          <div class="incidencias-stat-text">Solicitudes activas o pendientes de revisión.</div>
        </article>

        <article class="incidencias-stat-card incidencias-stat-card--closed">
          <div class="incidencias-stat-label">Cerradas</div>
          <div class="incidencias-stat-value">${escapeHtml(String(stats.closedCount))}</div>
          <div class="incidencias-stat-text">Casos resueltos o ya cerrados.</div>
        </article>

        <article class="incidencias-stat-card incidencias-stat-card--urgent">
          <div class="incidencias-stat-label">Urgentes</div>
          <div class="incidencias-stat-value">${escapeHtml(String(stats.urgentCount))}</div>
          <div class="incidencias-stat-text">Incidencias marcadas con prioridad alta o crítica.</div>
        </article>

        <article class="incidencias-stat-card">
          <div class="incidencias-stat-label">Adjuntos</div>
          <div class="incidencias-stat-value">${escapeHtml(String(stats.attachmentsCount))}</div>
          <div class="incidencias-stat-text">Documentos vinculados al historial visible.</div>
        </article>
      </div>
    </section>
  `;
}

/* =========================================================
   TABLE
========================================================= */

export function renderTable(input = {}) {
  const data = safeObject(input);

  const items = safeArray(
    first(data.items, data.rows, data.tickets, data.incidencias)
  );

  const state = safeObject(data.state);
  const pagination = getPagination(items, data);

  const loading = Boolean(state.loading);
  const refreshing = Boolean(state.refreshing);
  const hasError = Boolean(safeText(state.error, ""));

  const showInitialLoading = loading && !pagination.pageItems.length;
  const showRefreshOverlay = refreshing && pagination.pageItems.length;

  return `
    <section class="incidencias-history">
      <div class="incidencias-history-head">
        <div class="incidencias-history-copy">
          <h2 class="incidencias-history-title">Historial de incidencias</h2>
          <p class="incidencias-history-subtitle">
            ${
              showInitialLoading
                ? "Cargando incidencias..."
                : escapeHtml(
                    `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · página ${pagination.currentPage} de ${pagination.totalPages}`
                  )
            }
          </p>
        </div>

        <div class="incidencias-pagination">
          <button
            type="button"
            class="incidencias-pagination-btn"
            data-incidencias-action="prev-page"
            data-action="prev-page"
            data-page="${escapeHtml(String(Math.max(1, pagination.currentPage - 1)))}"
            ${!pagination.hasPrev || loading || refreshing ? 'disabled aria-disabled="true"' : ""}
          >
            Anterior
          </button>

          <button
            type="button"
            class="incidencias-pagination-btn"
            data-incidencias-action="next-page"
            data-action="next-page"
            data-page="${escapeHtml(String(Math.min(pagination.totalPages, pagination.currentPage + 1)))}"
            ${!pagination.hasNext || loading || refreshing ? 'disabled aria-disabled="true"' : ""}
          >
            Siguiente
          </button>
        </div>
      </div>

      ${
        showInitialLoading
          ? renderTableLoading(Math.max(3, pagination.pageSize || 5))
          : `
            <div class="incidencias-table-wrap${refreshing ? " is-refreshing" : ""}">
              ${showRefreshOverlay ? renderRefreshOverlay() : ""}

              ${
                pagination.pageItems.length
                  ? `
                    <div class="incidencias-table-shell">
                      <table class="incidencias-table" role="table" aria-label="Listado de incidencias">
                        <colgroup>
                          <col style="width:39%;">
                          <col style="width:11%;">
                          <col style="width:15%;">
                          <col style="width:15%;">
                          <col style="width:8%;">
                          <col style="width:5%;">
                          <col style="width:7%;">
                        </colgroup>

                        <thead>
                          <tr>
                            <th>Incidencia</th>
                            <th>Estado</th>
                            <th>Creación</th>
                            <th>Última novedad</th>
                            <th>Importe</th>
                            <th>Adj.</th>
                            <th>Acciones</th>
                          </tr>
                        </thead>

                        <tbody>
                          ${pagination.pageItems.map((item) => renderRow(item, state)).join("")}
                        </tbody>
                      </table>
                    </div>
                  `
                  : renderEmptyState({ hasError })
              }
            </div>
          `
      }
    </section>
  `;
}

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function renderIncidenciasTableTemplate(input = {}) {
  const data = safeObject(input);

  return `
    <section class="incidencias-view-root">
      ${renderHeader(data)}
      ${renderTable(data)}
    </section>
  `;
}

export default renderIncidenciasTableTemplate;
