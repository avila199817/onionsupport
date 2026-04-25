/* =========================================================
   Onion SPA - Incidencias Table Template
   Archivo: src/views/incidencias/incidencias.table.template.js

   FINAL PRODUCTION TEMPLATE · LIST VIEW · SOFT APPLE MODE · 10/10

   RESPONSABILIDADES:
   - render del hero/header de incidencias
   - render de tabla productiva con paginación real
   - compatibilidad con IncidenciasView.js
   - estado loading visual en "Ver detalle"
   - estado loading visual en "Crear nueva incidencia"
   - estado loading visual en refresh / retry / export
   - título compacto y responsive
   - fechas siempre en una sola línea
   - botón "Ver detalle" ajustado al ancho del texto
   - loading de tabla suave en carga / refresh
   - acciones compatibles con data-incidencias-action y data-action
   - pintar importe total de facturas asociadas al ticket

   HARDENING PRO:
   - no depende de imports externos
   - tolera payload heterogéneo
   - soporta state + props directas
   - paginación defensiva
   - estilos encapsulados
   - responsive robusto
   - columna prioridad eliminada de tabla
   - importe blindado contra normalizadores intermedios
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
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function renderAvatar(item = {}) {
  const fullName = getClientName(item);
  const initials = getInitials(fullName);
  const avatarUrl = getAvatarUrl(item);

  if (avatarUrl) {
    return `
      <div
        class="incidencias-avatar"
        title="${escapeHtml(fullName)}"
        aria-label="${escapeHtml(fullName)}"
        data-tooltip="${escapeHtml(fullName)}"
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
              ? renderSpinner("Cargando...")
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
          linear-gradient(180deg, rgba(255,255,255,.58), rgba(255,255,255,.36)),
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
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 16%, rgba(15,23,42,.06));
        background:linear-gradient(
          180deg,
          color-mix(in srgb, var(--accent, #7c5cff) 86%, white 14%),
          color-mix(in srgb, var(--accent, #7c5cff) 92%, black 8%)
        );
        color:#fff;
        box-shadow:0 8px 20px color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent);
      }

      .incidencias-btn.is-loading,
      .incidencias-detail-btn.is-loading{
        cursor:wait;
        opacity:.9;
      }

      .incidencias-btn:disabled,
      .incidencias-detail-btn:disabled{
        pointer-events:none;
        opacity:.72;
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
        background:rgba(255,255,255,.52);
        color:#7a8392;
        font-size:11px;
        font-weight:760;
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
          linear-gradient(180deg, rgba(255,255,255,.58), rgba(255,255,255,.22)),
          rgba(255,255,255,.46);
        box-shadow:0 6px 20px rgba(15,23,42,.03);
      }

      .incidencias-stat-card--open{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 16%, rgba(15,23,42,.06));
      }

      .incidencias-stat-card--closed{
        border-color:color-mix(in srgb, var(--success-strong, #36c690) 18%, rgba(15,23,42,.06));
      }

      .incidencias-stat-card--urgent{
        border-color:color-mix(in srgb, var(--danger-strong, #ff6b6b) 18%, rgba(15,23,42,.06));
      }

      .incidencias-stat-label{
        font-size:11px;
        font-weight:760;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:#7b8494;
      }

      .incidencias-stat-value{
        font-size:40px;
        line-height:.92;
        letter-spacing:-.045em;
        font-weight:780;
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
          linear-gradient(180deg, rgba(255,255,255,.6), rgba(255,255,255,.4)),
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
        font-weight:760;
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
        font-weight:680;
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
        background:rgba(255,255,255,.9);
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
        font-weight:760;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:#97a0af;
        background:rgba(248,250,252,.62);
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
        transition:background .16s ease;
      }

      .incidencias-row:hover{
        background:rgba(124,92,255,.018);
      }

      .incidencias-main{
        display:grid;
        grid-template-columns:44px minmax(0, 1fr);
        gap:12px;
        align-items:center;
        min-width:0;
      }

      .incidencias-avatar{
        position:relative;
        width:44px;
        height:44px;
        border-radius:999px;
        overflow:hidden;
        flex:0 0 44px;
        background:linear-gradient(135deg, rgba(124,92,255,.12), rgba(139,92,246,.24));
      }

      .incidencias-avatar img{
        display:block;
        width:100%;
        height:100%;
        object-fit:cover;
      }

      .incidencias-avatar-fallback{
        position:absolute;
        inset:0;
        display:none;
        align-items:center;
        justify-content:center;
        font-size:18px;
        font-weight:780;
        color:#fff;
        letter-spacing:-.03em;
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
        font-weight:760;
        letter-spacing:.055em;
        color:#667084;
        text-transform:uppercase;
      }

      .incidencias-ticket-subject{
        font-size:15px;
        line-height:1.14;
        font-weight:760;
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
        color:#8a93a3;
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
        font-weight:760;
        letter-spacing:.045em;
        text-transform:uppercase;
        white-space:nowrap;
        border:1px solid transparent;
      }

      .incidencias-chip--pending{
        color:#b7791f;
        background:rgba(255,188,66,.11);
        border-color:rgba(255,188,66,.22);
      }

      .incidencias-chip--open{
        color:#6d53d7;
        background:rgba(124,92,255,.09);
        border-color:rgba(124,92,255,.18);
      }

      .incidencias-chip--progress{
        color:#1778ab;
        background:rgba(125,211,252,.12);
        border-color:rgba(125,211,252,.24);
      }

      .incidencias-chip--resolved,
      .incidencias-chip--closed{
        color:#258a59;
        background:rgba(54,198,144,.10);
        border-color:rgba(54,198,144,.22);
      }

      .incidencias-date-inline{
        display:inline-block;
        white-space:nowrap;
        font-size:13px;
        line-height:1.2;
        font-weight:650;
        font-variant-numeric:tabular-nums;
        color:#344054;
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
        font-weight:760;
        white-space:nowrap;
        border:1px solid transparent;
      }

      .incidencias-importe--money{
        color:#374151;
        background:rgba(15,23,42,.035);
        border-color:rgba(15,23,42,.06);
      }

      .incidencias-importe--status{
        color:#8590a3;
        background:rgba(15,23,42,.025);
        border-color:rgba(15,23,42,.05);
      }

      .incidencias-attachments-pill{
        min-width:32px;
        color:#64748b;
        background:rgba(15,23,42,.035);
        border-color:rgba(15,23,42,.06);
      }

      .incidencias-cell--actions{
        width:1%;
        white-space:nowrap;
      }

      .incidencias-detail-btn{
        width:auto;
        min-width:0;
        min-height:34px;
        padding:0 12px;
        border-radius:12px;
        border:1px solid rgba(15,23,42,.07);
        background:rgba(255,255,255,.68);
        color:#1f2937;
        font-size:13px;
        font-weight:700;
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
        background:rgba(255,255,255,.9);
        transform:translateY(-1px);
      }

      .incidencias-inline-loading{
        display:inline-flex;
        align-items:center;
        gap:7px;
        white-space:nowrap;
      }

      .incidencias-inline-spinner{
        width:13px;
        height:13px;
        border-radius:999px;
        border:2px solid rgba(255,255,255,.30);
        border-top-color:currentColor;
        animation:incidenciasSpin .78s linear infinite;
        flex:0 0 auto;
      }

      .incidencias-btn:not(.incidencias-btn--primary) .incidencias-inline-spinner,
      .incidencias-detail-btn .incidencias-inline-spinner{
        border-color:rgba(15,23,42,.16);
        border-top-color:currentColor;
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
        background:rgba(255,255,255,.82);
        color:#344054;
        font-size:13px;
        font-weight:720;
        box-shadow:0 10px 26px rgba(15,23,42,.08);
      }

      .incidencias-table-loading{
        padding:12px 18px 16px;
        display:grid;
        gap:12px;
      }

      .incidencias-table-loading-row{
        display:grid;
        grid-template-columns:44px minmax(220px, 1.45fr) 112px 140px 140px 86px 70px 112px;
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
        background:rgba(148,163,184,.14);
      }

      .incidencias-skeleton::after{
        content:"";
        position:absolute;
        inset:0;
        transform:translateX(-100%);
        background:linear-gradient(
          90deg,
          transparent,
          rgba(255,255,255,.55),
          transparent
        );
        animation:incidenciasSkeleton 1.2s ease-in-out infinite;
      }

      .incidencias-skeleton--avatar{
        width:44px;
        height:44px;
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
        font-weight:760;
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
          linear-gradient(180deg, rgba(255,255,255,.82), rgba(248,250,252,.74)),
          rgba(255,255,255,.82);
        box-shadow:
          0 12px 28px rgba(15,23,42,.035),
          0 0 0 1px rgba(255,255,255,.72) inset;
      }

      [data-theme="light"] .incidencias-stat-card{
        background:
          linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.48)),
          rgba(255,255,255,.56);
      }

      [data-theme="dark"] .incidencias-hero,
      [data-theme="dark"] .incidencias-history{
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 7%, transparent), transparent 34%),
          linear-gradient(180deg, var(--surface-2, #171922), var(--surface-1, #10121a));
        border-color:var(--border-soft, rgba(255,255,255,.08));
      }

      [data-theme="dark"] .incidencias-page-title,
      [data-theme="dark"] .incidencias-history-title,
      [data-theme="dark"] .incidencias-stat-value,
      [data-theme="dark"] .incidencias-ticket-subject{
        color:var(--text-strong, #f8fafc);
      }

      [data-theme="dark"] .incidencias-page-subtitle,
      [data-theme="dark"] .incidencias-history-subtitle,
      [data-theme="dark"] .incidencias-stat-text,
      [data-theme="dark"] .incidencias-ticket-description{
        color:var(--text-dim, #94a3b8);
      }

      [data-theme="dark"] .incidencias-btn,
      [data-theme="dark"] .incidencias-pagination-btn,
      [data-theme="dark"] .incidencias-detail-btn,
      [data-theme="dark"] .incidencias-refresh-card{
        background:rgba(255,255,255,.06);
        border-color:rgba(255,255,255,.08);
        color:var(--text-strong, #f8fafc);
      }

      [data-theme="dark"] .incidencias-table thead th{
        background:rgba(255,255,255,.035);
        border-bottom-color:rgba(255,255,255,.07);
      }

      [data-theme="dark"] .incidencias-table tbody td{
        border-bottom-color:rgba(255,255,255,.055);
      }

      [data-theme="dark"] .incidencias-date-inline{
        color:var(--text-soft, #cbd5e1);
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
