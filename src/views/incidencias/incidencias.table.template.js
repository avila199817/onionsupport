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
   - dark mode reforzado con contraste real y menos aspecto grisáceo

   HARDENING PRO:
   - no depende de imports externos
   - tolera payload heterogéneo
   - soporta state + props directas
   - paginación defensiva
   - estilos encapsulados
   - responsive robusto
   - columna prioridad eliminada de tabla
   - importe blindado contra normalizadores intermedios
   - loading inline icon-only para no desplazar columnas
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
        gap:18px;
      }

      .incidencias-hero{
        position:relative;
        overflow:hidden;
        border-radius:24px;
        border:1px solid color-mix(in srgb, var(--border-soft, rgba(15,23,42,.08)) 88%, transparent);
        background:
          radial-gradient(circle at 12% 8%, color-mix(in srgb, var(--accent, #7c5cff) 9%, transparent), transparent 34%),
          linear-gradient(180deg, rgba(255,255,255,.74), rgba(255,255,255,.46)),
          color-mix(in srgb, var(--panel-bg, #ffffff) 92%, transparent);
        box-shadow:
          0 10px 30px rgba(15,23,42,.04),
          0 1px 0 rgba(255,255,255,.55) inset;
        padding:22px 24px 22px;
      }

      .incidencias-hero-top{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:18px;
        align-items:start;
      }

      .incidencias-hero-copy{
        min-width:0;
        display:grid;
        gap:10px;
      }

      .incidencias-page-title{
        margin:0;
        max-width:100%;
        font-size:clamp(26px, 2.6vw, 42px);
        line-height:.98;
        letter-spacing:-.05em;
        font-weight:780;
        color:var(--text-strong, #0f172a);
        white-space:nowrap;
      }

      .incidencias-page-subtitle{
        margin:0;
        max-width:860px;
        font-size:15px;
        line-height:1.58;
        color:var(--text-dim, #6b7280);
      }

      .incidencias-hero-actions{
        display:flex;
        align-items:flex-start;
        justify-content:flex-end;
        gap:10px;
        flex-wrap:wrap;
      }

      .incidencias-btn{
        min-height:44px;
        padding:0 16px;
        border-radius:14px;
        border:1px solid color-mix(in srgb, var(--border-soft, rgba(15,23,42,.08)) 92%, transparent);
        background:rgba(255,255,255,.72);
        color:var(--text-strong, #111827);
        font-size:13px;
        font-weight:680;
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        box-shadow:0 4px 14px rgba(15,23,42,.04);
        transition:
          transform .16s ease,
          box-shadow .16s ease,
          border-color .16s ease,
          background .16s ease,
          opacity .16s ease;
      }

      .incidencias-btn:hover{
        transform:translateY(-1px);
        box-shadow:0 8px 18px rgba(15,23,42,.06);
      }

      .incidencias-btn--primary{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 24%, rgba(15,23,42,.06));
        background:linear-gradient(
          180deg,
          color-mix(in srgb, var(--accent, #7c5cff) 88%, white 12%),
          color-mix(in srgb, var(--accent, #7c5cff) 94%, black 6%)
        );
        color:#fff;
        box-shadow:0 10px 24px color-mix(in srgb, var(--accent, #7c5cff) 22%, transparent);
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
        margin-top:14px;
        display:flex;
        align-items:center;
        gap:8px;
        flex-wrap:wrap;
      }

      .incidencias-meta-pill{
        min-height:30px;
        padding:0 12px;
        border-radius:999px;
        border:1px solid rgba(15,23,42,.06);
        background:rgba(255,255,255,.58);
        color:#6b7280;
        font-size:11px;
        font-weight:780;
        letter-spacing:.045em;
        text-transform:uppercase;
        display:inline-flex;
        align-items:center;
        white-space:nowrap;
      }

      .incidencias-stats{
        margin-top:16px;
        display:grid;
        grid-template-columns:repeat(4, minmax(0, 1fr));
        gap:12px;
      }

      .incidencias-stat-card{
        display:grid;
        gap:8px;
        min-height:122px;
        padding:16px 18px;
        border-radius:20px;
        border:1px solid rgba(15,23,42,.06);
        background:
          linear-gradient(180deg, rgba(255,255,255,.72), rgba(255,255,255,.36)),
          rgba(255,255,255,.58);
        box-shadow:0 8px 22px rgba(15,23,42,.035);
      }

      .incidencias-stat-card--open{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 24%, rgba(15,23,42,.06));
      }

      .incidencias-stat-card--closed{
        border-color:color-mix(in srgb, var(--success-strong, #16a34a) 26%, rgba(15,23,42,.06));
      }

      .incidencias-stat-card--urgent{
        border-color:color-mix(in srgb, var(--danger-strong, #ef4444) 26%, rgba(15,23,42,.06));
      }

      .incidencias-stat-label{
        font-size:11px;
        font-weight:780;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:#64748b;
      }

      .incidencias-stat-value{
        font-size:40px;
        line-height:.92;
        letter-spacing:-.045em;
        font-weight:800;
        color:var(--text-strong, #111827);
      }

      .incidencias-stat-text{
        font-size:13px;
        line-height:1.45;
        color:var(--text-dim, #6b7280);
      }

      .incidencias-history{
        overflow:hidden;
        border-radius:24px;
        border:1px solid color-mix(in srgb, var(--border-soft, rgba(15,23,42,.08)) 88%, transparent);
        background:
          linear-gradient(180deg, rgba(255,255,255,.68), rgba(255,255,255,.46)),
          color-mix(in srgb, var(--panel-bg, #ffffff) 94%, transparent);
        box-shadow:
          0 10px 30px rgba(15,23,42,.04),
          0 1px 0 rgba(255,255,255,.5) inset;
      }

      .incidencias-history-head{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:14px;
        align-items:start;
        padding:14px 18px 12px;
        border-bottom:1px solid rgba(15,23,42,.06);
      }

      .incidencias-history-copy{
        min-width:0;
        display:grid;
        gap:2px;
      }

      .incidencias-history-title{
        margin:0;
        font-size:16px;
        line-height:1.2;
        font-weight:780;
        color:var(--text-strong, #111827);
      }

      .incidencias-history-subtitle{
        margin:0;
        font-size:12px;
        line-height:1.4;
        color:var(--text-dim, #7b8494);
      }

      .incidencias-pagination{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
      }

      .incidencias-pagination-btn{
        min-height:38px;
        padding:0 14px;
        border-radius:13px;
        border:1px solid rgba(15,23,42,.06);
        background:rgba(255,255,255,.66);
        color:#273142;
        font-size:12px;
        font-weight:700;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        transition:
          background .16s ease,
          border-color .16s ease,
          opacity .16s ease;
      }

      .incidencias-pagination-btn:hover{
        background:rgba(255,255,255,.92);
        border-color:rgba(15,23,42,.10);
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
        transition:opacity .18s ease, filter .18s ease;
      }

      .incidencias-table-shell{
        width:100%;
        overflow-x:auto;
        overflow-y:hidden;
        transition:opacity .18s ease, filter .18s ease;
      }

      .incidencias-table{
        width:100%;
        border-collapse:separate;
        border-spacing:0;
        min-width:1120px;
      }

      .incidencias-table thead th{
        padding:12px 18px;
        text-align:left;
        font-size:11px;
        font-weight:780;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:#7c8798;
        background:rgba(248,250,252,.72);
        border-bottom:1px solid rgba(15,23,42,.06);
        white-space:nowrap;
      }

      .incidencias-table tbody td{
        padding:14px 18px;
        vertical-align:middle;
        border-bottom:1px solid rgba(15,23,42,.055);
      }

      .incidencias-table tbody tr:last-child td{
        border-bottom:none;
      }

      .incidencias-row{
        transition:
          background .16s ease,
          box-shadow .16s ease;
      }

      .incidencias-row:hover{
        background:rgba(124,92,255,.035);
      }

      .incidencias-main{
        display:grid;
        grid-template-columns:48px minmax(0, 1fr);
        gap:12px;
        align-items:center;
        min-width:0;
      }

      .incidencias-avatar{
        position:relative;
        width:48px;
        height:48px;
        border-radius:999px;
        overflow:hidden;
        flex:0 0 48px;
        background:var(--inc-avatar-bg, linear-gradient(135deg, #7c3aed 0%, #ec4899 100%));
        box-shadow:
          0 10px 22px var(--inc-avatar-shadow, rgba(124,58,237,.22)),
          0 0 0 3px color-mix(in srgb, var(--inc-avatar-ring, rgba(124,58,237,.30)) 54%, transparent),
          0 1px 0 rgba(255,255,255,.55) inset;
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
        font-size:18px;
        font-weight:850;
        color:#fff;
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
        gap:3px;
      }

      .incidencias-ticket-id{
        font-size:12px;
        line-height:1.15;
        font-weight:780;
        letter-spacing:.055em;
        color:#667084;
        text-transform:uppercase;
      }

      .incidencias-ticket-subject{
        font-size:15px;
        line-height:1.14;
        font-weight:800;
        letter-spacing:-.025em;
        color:var(--text-strong, #111827);
        overflow:hidden;
        text-overflow:ellipsis;
        display:-webkit-box;
        -webkit-line-clamp:2;
        -webkit-box-orient:vertical;
      }

      .incidencias-ticket-description{
        font-size:13px;
        line-height:1.3;
        color:#7f8a9d;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .incidencias-chip{
        min-height:32px;
        padding:0 12px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        font-size:11px;
        font-weight:780;
        letter-spacing:.045em;
        text-transform:uppercase;
        white-space:nowrap;
        border:1px solid transparent;
      }

      .incidencias-chip--pending{
        color:#a16207;
        background:rgba(245,158,11,.15);
        border-color:rgba(245,158,11,.28);
      }

      .incidencias-chip--open{
        color:#5b3fd6;
        background:rgba(124,92,255,.13);
        border-color:rgba(124,92,255,.25);
      }

      .incidencias-chip--progress{
        color:#0369a1;
        background:rgba(14,165,233,.15);
        border-color:rgba(14,165,233,.28);
      }

      .incidencias-chip--resolved,
      .incidencias-chip--closed{
        color:#15803d;
        background:rgba(34,197,94,.14);
        border-color:rgba(34,197,94,.28);
      }

      .incidencias-date-inline{
        display:inline-block;
        white-space:nowrap;
        font-size:13px;
        line-height:1.2;
        font-weight:680;
        font-variant-numeric:tabular-nums;
        color:#334155;
      }

      .incidencias-importe,
      .incidencias-attachments-pill{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:30px;
        padding:0 12px;
        border-radius:999px;
        font-size:11px;
        font-weight:780;
        white-space:nowrap;
        border:1px solid transparent;
      }

      .incidencias-importe--money{
        color:#1f2937;
        background:rgba(15,23,42,.045);
        border-color:rgba(15,23,42,.075);
      }

      .incidencias-importe--status{
        color:#667085;
        background:rgba(15,23,42,.032);
        border-color:rgba(15,23,42,.06);
      }

      .incidencias-attachments-pill{
        min-width:32px;
        color:#475569;
        background:rgba(15,23,42,.045);
        border-color:rgba(15,23,42,.075);
      }

      .incidencias-cell--actions{
        width:1%;
        white-space:nowrap;
      }

      .incidencias-detail-btn{
        width:auto;
        min-width:84px;
        min-height:34px;
        padding:0 12px;
        border-radius:12px;
        border:1px solid rgba(15,23,42,.07);
        background:rgba(255,255,255,.72);
        color:#1f2937;
        font-size:13px;
        font-weight:760;
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        white-space:nowrap;
        box-shadow:none;
        transition:
          border-color .16s ease,
          background .16s ease,
          transform .16s ease,
          opacity .16s ease;
      }

      .incidencias-detail-btn:hover{
        border-color:rgba(15,23,42,.11);
        background:rgba(255,255,255,.94);
        transform:translateY(-1px);
      }

      .incidencias-detail-btn.is-loading{
        width:34px;
        min-width:34px;
        max-width:34px;
        min-height:34px;
        height:34px;
        padding:0;
        border-radius:999px;
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
        gap:7px;
        white-space:nowrap;
      }

      .incidencias-inline-loading-text{
        display:inline-block;
      }

      .incidencias-inline-spinner{
        width:14px;
        height:14px;
        border-radius:999px;
        border:2px solid rgba(255,255,255,.34);
        border-top-color:currentColor;
        animation:incidenciasSpin .78s linear infinite;
        flex:0 0 auto;
      }

      .incidencias-btn:not(.incidencias-btn--primary) .incidencias-inline-spinner,
      .incidencias-detail-btn .incidencias-inline-spinner{
        border-color:rgba(15,23,42,.16);
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
        background:linear-gradient(180deg, rgba(255,255,255,.24), rgba(255,255,255,.12));
        backdrop-filter:blur(2px);
      }

      .incidencias-refresh-card{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:42px;
        padding:0 16px;
        border-radius:14px;
        border:1px solid rgba(15,23,42,.07);
        background:rgba(255,255,255,.86);
        color:#344054;
        font-size:13px;
        font-weight:760;
        box-shadow:0 10px 26px rgba(15,23,42,.08);
      }

      .incidencias-table-loading{
        padding:12px 18px 16px;
        display:grid;
        gap:12px;
      }

      .incidencias-table-loading-row{
        display:grid;
        grid-template-columns:48px minmax(220px, 1.45fr) 112px 140px 140px 86px 70px 112px;
        gap:12px;
        align-items:center;
      }

      .incidencias-table-loading-copy{
        display:grid;
        gap:7px;
      }

      .incidencias-skeleton{
        position:relative;
        overflow:hidden;
        border-radius:999px;
        background:rgba(148,163,184,.15);
      }

      .incidencias-skeleton::after{
        content:"";
        position:absolute;
        inset:0;
        transform:translateX(-100%);
        background:linear-gradient(
          90deg,
          transparent,
          rgba(255,255,255,.58),
          transparent
        );
        animation:incidenciasSkeleton 1.2s ease-in-out infinite;
      }

      .incidencias-skeleton--avatar{
        width:48px;
        height:48px;
        border-radius:999px;
      }

      .incidencias-skeleton--xs{
        width:120px;
        height:10px;
      }

      .incidencias-skeleton--lg{
        width:74%;
        height:14px;
      }

      .incidencias-skeleton--md{
        width:56%;
        height:12px;
      }

      .incidencias-skeleton--pill{
        width:86px;
        height:30px;
      }

      .incidencias-skeleton--date{
        width:124px;
        height:12px;
      }

      .incidencias-skeleton--btn{
        width:98px;
        height:34px;
      }

      .incidencias-empty{
        display:grid;
        justify-items:center;
        gap:8px;
        padding:44px 20px 48px;
        text-align:center;
      }

      .incidencias-empty-title{
        margin:0;
        font-size:18px;
        font-weight:780;
        color:var(--text-strong, #111827);
      }

      .incidencias-empty-text{
        margin:0;
        font-size:13px;
        line-height:1.55;
        color:var(--text-dim, #6b7280);
      }

      @keyframes incidenciasSpin{
        to{ transform:rotate(360deg); }
      }

      @keyframes incidenciasSkeleton{
        to{ transform:translateX(100%); }
      }

      [data-theme="light"] .incidencias-hero,
      [data-theme="light"] .incidencias-history{
        background:
          radial-gradient(circle at 10% 8%, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent 32%),
          linear-gradient(180deg, rgba(255,255,255,.86), rgba(248,250,252,.76)),
          rgba(255,255,255,.86);
        box-shadow:
          0 12px 28px rgba(15,23,42,.04),
          0 0 0 1px rgba(255,255,255,.72) inset;
      }

      [data-theme="light"] .incidencias-stat-card{
        background:
          linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,.52)),
          rgba(255,255,255,.62);
      }

      [data-theme="dark"] .incidencias-hero,
      [data-theme="dark"] .incidencias-history{
        border-color:rgba(255,255,255,.105);
        background:
          radial-gradient(circle at 10% 0%, color-mix(in srgb, var(--accent, #8b5cf6) 18%, transparent), transparent 34%),
          radial-gradient(circle at 88% 8%, rgba(14,165,233,.12), transparent 28%),
          linear-gradient(180deg, #20222a 0%, #161820 54%, #11131a 100%);
        box-shadow:
          0 18px 42px rgba(0,0,0,.34),
          0 1px 0 rgba(255,255,255,.08) inset;
      }

      [data-theme="dark"] .incidencias-page-title,
      [data-theme="dark"] .incidencias-history-title,
      [data-theme="dark"] .incidencias-stat-value,
      [data-theme="dark"] .incidencias-ticket-subject,
      [data-theme="dark"] .incidencias-empty-title{
        color:#f8fafc;
      }

      [data-theme="dark"] .incidencias-page-subtitle,
      [data-theme="dark"] .incidencias-history-subtitle,
      [data-theme="dark"] .incidencias-stat-text,
      [data-theme="dark"] .incidencias-ticket-description,
      [data-theme="dark"] .incidencias-empty-text{
        color:#a7b2c3;
      }

      [data-theme="dark"] .incidencias-meta-pill{
        background:rgba(255,255,255,.08);
        border-color:rgba(255,255,255,.10);
        color:#aeb9ca;
      }

      [data-theme="dark"] .incidencias-stat-card{
        background:
          linear-gradient(180deg, rgba(255,255,255,.105), rgba(255,255,255,.052)),
          rgba(15,23,42,.42);
        border-color:rgba(255,255,255,.095);
        box-shadow:
          0 14px 32px rgba(0,0,0,.26),
          0 1px 0 rgba(255,255,255,.055) inset;
      }

      [data-theme="dark"] .incidencias-stat-card--open{
        border-color:color-mix(in srgb, var(--accent, #8b5cf6) 34%, rgba(255,255,255,.10));
      }

      [data-theme="dark"] .incidencias-stat-card--closed{
        border-color:rgba(34,197,94,.34);
      }

      [data-theme="dark"] .incidencias-stat-card--urgent{
        border-color:rgba(248,113,113,.34);
      }

      [data-theme="dark"] .incidencias-stat-label,
      [data-theme="dark"] .incidencias-table thead th,
      [data-theme="dark"] .incidencias-ticket-id{
        color:#93a4bd;
      }

      [data-theme="dark"] .incidencias-btn,
      [data-theme="dark"] .incidencias-pagination-btn,
      [data-theme="dark"] .incidencias-detail-btn,
      [data-theme="dark"] .incidencias-refresh-card{
        background:rgba(255,255,255,.075);
        border-color:rgba(255,255,255,.12);
        color:#f8fafc;
        box-shadow:0 10px 26px rgba(0,0,0,.22);
      }

      [data-theme="dark"] .incidencias-btn:hover,
      [data-theme="dark"] .incidencias-pagination-btn:hover,
      [data-theme="dark"] .incidencias-detail-btn:hover{
        background:rgba(255,255,255,.115);
        border-color:rgba(255,255,255,.18);
      }

      [data-theme="dark"] .incidencias-btn--primary{
        background:linear-gradient(
          180deg,
          color-mix(in srgb, var(--accent, #8b5cf6) 92%, white 8%),
          color-mix(in srgb, var(--accent, #8b5cf6) 78%, black 22%)
        );
        border-color:color-mix(in srgb, var(--accent, #8b5cf6) 48%, rgba(255,255,255,.18));
        box-shadow:0 16px 36px color-mix(in srgb, var(--accent, #8b5cf6) 28%, transparent);
      }

      [data-theme="dark"] .incidencias-table thead th{
        background:rgba(255,255,255,.045);
        border-bottom-color:rgba(255,255,255,.085);
      }

      [data-theme="dark"] .incidencias-table tbody td{
        border-bottom-color:rgba(255,255,255,.065);
      }

      [data-theme="dark"] .incidencias-row:hover{
        background:rgba(139,92,246,.075);
      }

      [data-theme="dark"] .incidencias-date-inline{
        color:#d7dee9;
      }

      [data-theme="dark"] .incidencias-importe--money,
      [data-theme="dark"] .incidencias-importe--status,
      [data-theme="dark"] .incidencias-attachments-pill{
        background:rgba(255,255,255,.07);
        border-color:rgba(255,255,255,.10);
        color:#dbe4f0;
      }

      [data-theme="dark"] .incidencias-chip--pending{
        color:#facc15;
        background:rgba(245,158,11,.16);
        border-color:rgba(245,158,11,.30);
      }

      [data-theme="dark"] .incidencias-chip--open{
        color:#c4b5fd;
        background:rgba(139,92,246,.20);
        border-color:rgba(139,92,246,.34);
      }

      [data-theme="dark"] .incidencias-chip--progress{
        color:#7dd3fc;
        background:rgba(14,165,233,.18);
        border-color:rgba(14,165,233,.34);
      }

      [data-theme="dark"] .incidencias-chip--resolved,
      [data-theme="dark"] .incidencias-chip--closed{
        color:#86efac;
        background:rgba(34,197,94,.17);
        border-color:rgba(34,197,94,.32);
      }

      [data-theme="dark"] .incidencias-avatar{
        background:var(--inc-avatar-bg-dark, var(--inc-avatar-bg));
        box-shadow:
          0 12px 26px var(--inc-avatar-shadow, rgba(139,92,246,.30)),
          0 0 0 3px color-mix(in srgb, var(--inc-avatar-ring, rgba(139,92,246,.36)) 70%, transparent),
          0 1px 0 rgba(255,255,255,.20) inset;
      }

      [data-theme="dark"] .incidencias-refresh-overlay{
        background:linear-gradient(180deg, rgba(10,12,18,.42), rgba(10,12,18,.22));
      }

      [data-theme="dark"] .incidencias-btn:not(.incidencias-btn--primary) .incidencias-inline-spinner,
      [data-theme="dark"] .incidencias-detail-btn .incidencias-inline-spinner{
        border-color:rgba(255,255,255,.20);
        border-top-color:currentColor;
      }

      [data-theme="dark"] .incidencias-skeleton{
        background:rgba(148,163,184,.16);
      }

      [data-theme="dark"] .incidencias-skeleton::after{
        background:linear-gradient(
          90deg,
          transparent,
          rgba(255,255,255,.16),
          transparent
        );
      }

      @media (max-width: 1240px){
        .incidencias-page-title{
          font-size:clamp(24px, 2.4vw, 36px);
        }

        .incidencias-stats{
          grid-template-columns:repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 1180px){
        .incidencias-hero{
          padding:20px;
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
          gap:16px;
        }

        .incidencias-hero{
          padding:18px 16px;
          border-radius:20px;
        }

        .incidencias-history{
          border-radius:20px;
        }

        .incidencias-history-head{
          grid-template-columns:1fr;
          padding:14px 14px 12px;
        }

        .incidencias-pagination{
          justify-content:flex-start;
        }

        .incidencias-stats{
          grid-template-columns:1fr;
        }

        .incidencias-page-title{
          font-size:clamp(24px, 8vw, 34px);
          line-height:1;
          white-space:normal;
        }

        .incidencias-page-subtitle{
          font-size:14px;
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
