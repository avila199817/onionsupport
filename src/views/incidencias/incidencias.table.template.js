/* =========================================================
   Onion SPA - Incidencias Table Template
   Archivo: src/views/incidencias/incidencias.table.template.js

   FINAL PRODUCTION TEMPLATE · LIST VIEW · 10/10

   RESPONSABILIDADES:
   - render del hero/header de incidencias
   - render de tabla productiva con paginación real
   - compatibilidad con IncidenciasView.js
   - estado loading visual en "Ver detalle"
   - estado loading visual en "Crear nueva incidencia"
   - título más compacto para caber en una línea
   - fechas siempre en una sola línea
   - botón "Ver detalle" ajustado al ancho del texto
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
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
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

function getTicketId(item = {}) {
  return safeText(
    first(
      item.ticketId,
      item.code,
      item.numero,
      item.id,
      item?.raw?.ticketId,
      item?.raw?.code,
      item?.raw?.numero,
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
      item?.raw?.description,
      item?.raw?.preview,
      item?.raw?.message,
      item?.raw?.descripcion
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
      item?.raw?.clientName,
      item?.raw?.name,
      item?.raw?.cliente?.nombre,
      item?.raw?.cliente?.name,
      item?.raw?.client?.name
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
      item?.raw?.clientAvatar,
      item?.raw?.avatar,
      item?.raw?.avatarUrl
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

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function getStatusKey(value = "") {
  const key = safeText(value, "").toLowerCase();

  if (["pending", "pendiente"].includes(key)) return "pending";
  if (["open", "abierta", "abierto"].includes(key)) return "open";
  if (["progress", "in_progress", "in-progress", "en proceso", "en_proceso"].includes(key)) return "progress";
  if (["resolved", "resuelta", "resuelto"].includes(key)) return "resolved";
  if (["closed", "cerrada", "cerrado"].includes(key)) return "closed";
  if (["cancelled", "cancelada", "cancelado"].includes(key)) return "closed";

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

function getImporteLabel(item = {}) {
  const amount = first(
    item.total,
    item.amount,
    item.importe,
    item.price,
    item?.raw?.total,
    item?.raw?.amount,
    item?.raw?.importe
  );

  if (amount !== null && amount !== undefined && amount !== "") {
    const currency = first(
      item.currency,
      item.moneda,
      item?.raw?.currency,
      item?.raw?.moneda,
      "EUR"
    );

    return formatMoney(amount, currency);
  }

  const pago = safeText(
    first(
      item.paymentStatus,
      item.estadoPago,
      item?.raw?.paymentStatus,
      item?.raw?.estadoPago
    ),
    ""
  ).toLowerCase();

  if (["paid", "pagada", "pagado", "cobrada"].includes(pago)) return "Pagado";
  if (["pending", "pendiente"].includes(pago)) return "Pendiente";
  if (["partial", "parcial"].includes(pago)) return "Parcial";
  if (["overdue", "vencida"].includes(pago)) return "Vencido";

  return "Pendiente";
}

function getCreatedAt(item = {}) {
  return first(
    item.createdAt,
    item.fechaCreacion,
    item.date,
    item?.raw?.createdAt,
    item?.raw?.fechaCreacion,
    item?.raw?.date
  );
}

function getUpdatedAt(item = {}) {
  return first(
    item.updatedAt,
    item.lastUpdateAt,
    item.ultimaNovedad,
    item?.raw?.updatedAt,
    item?.raw?.lastUpdateAt,
    item?.raw?.ultimaNovedad,
    item?.raw?.createdAt
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

function computeStats(items = []) {
  const rows = safeArray(items);

  return {
    total: rows.length,
    openCount: rows.filter((item) => isOpenLike(item)).length,
    closedCount: rows.filter((item) => isClosedLike(item)).length,
  };
}

function getPagination(items = [], state = {}) {
  const allItems = safeArray(items);
  const runtime = safeObject(state);

  const pageSize = Math.max(
    1,
    safeNumber(first(runtime.pageSize, runtime.limit, 5), 5)
  );

  const reportedTotal = Math.max(
    allItems.length,
    safeNumber(
      first(
        runtime.totalCount,
        runtime.remoteCount,
        runtime.total,
        allItems.length
      ),
      allItems.length
    )
  );

  const totalPages = Math.max(
    1,
    Math.ceil((reportedTotal || 1) / pageSize)
  );

  const currentPage = Math.min(
    Math.max(1, safeNumber(first(runtime.page, runtime.currentPage, 1), 1)),
    totalPages
  );

  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = allItems.slice(startIndex, startIndex + pageSize);

  const rangeStart = reportedTotal ? startIndex + 1 : 0;
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

      <td class="incidencias-cell incidencias-cell--actions">
        <button
          type="button"
          class="incidencias-detail-btn${isOpening ? " is-loading" : ""}"
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

function renderEmptyState() {
  return `
    <div class="incidencias-empty">
      <h3 class="incidencias-empty-title">No hay incidencias para mostrar</h3>
      <p class="incidencias-empty-text">
        Cuando haya solicitudes registradas aparecerán aquí.
      </p>
    </div>
  `;
}

function renderStyles() {
  return `
    <style>
      .incidencias-view-root{
        display:grid;
        gap:24px;
      }

      .incidencias-hero{
        position:relative;
        overflow:hidden;
        border-radius:28px;
        border:1px solid var(--panel-border, rgba(255,255,255,.08));
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent 34%),
          linear-gradient(180deg, var(--panel-bg, rgba(255,255,255,.84)), var(--panel-bg, rgba(255,255,255,.84)));
        box-shadow:var(--shadow-soft, 0 20px 50px rgba(0,0,0,.08));
        padding:28px 32px 30px;
      }

      .incidencias-hero-top{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:20px;
        align-items:start;
      }

      .incidencias-hero-copy{
        min-width:0;
        display:grid;
        gap:12px;
      }

      .incidencias-page-title{
        margin:0;
        max-width:100%;
        font-size:clamp(34px, 4.4vw, 62px);
        line-height:.94;
        letter-spacing:-.055em;
        font-weight:800;
        color:var(--text-strong, #0f172a);
        white-space:nowrap;
      }

      .incidencias-page-subtitle{
        margin:0;
        max-width:1100px;
        font-size:17px;
        line-height:1.62;
        color:var(--text-dim, #6b7280);
      }

      .incidencias-hero-actions{
        display:flex;
        align-items:flex-start;
        justify-content:flex-end;
        gap:12px;
        flex-wrap:wrap;
      }

      .incidencias-btn{
        min-height:52px;
        padding:0 20px;
        border-radius:16px;
        border:1px solid var(--border-soft, rgba(15,23,42,.08));
        background:var(--surface-1, rgba(255,255,255,.74));
        color:var(--text-strong, #111827);
        font-size:14px;
        font-weight:700;
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        box-shadow:0 10px 24px rgba(15,23,42,.04);
        transition:
          transform .18s ease,
          box-shadow .18s ease,
          border-color .18s ease,
          background .18s ease,
          opacity .18s ease;
      }

      .incidencias-btn:hover{
        transform:translateY(-1px);
        box-shadow:0 16px 32px rgba(15,23,42,.08);
      }

      .incidencias-btn--primary{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent);
        background:var(--accent, #7c5cff);
        color:#fff;
        box-shadow:0 14px 30px color-mix(in srgb, var(--accent, #7c5cff) 24%, transparent);
      }

      .incidencias-btn.is-loading,
      .incidencias-detail-btn.is-loading{
        cursor:wait;
        opacity:.92;
      }

      .incidencias-hero-meta{
        margin-top:18px;
        display:flex;
        align-items:center;
        gap:10px;
        flex-wrap:wrap;
      }

      .incidencias-meta-pill{
        min-height:34px;
        padding:0 14px;
        border-radius:999px;
        border:1px solid var(--border-soft, rgba(15,23,42,.08));
        background:var(--surface-1, rgba(255,255,255,.72));
        color:var(--text-dim, #6b7280);
        font-size:12px;
        font-weight:800;
        letter-spacing:.05em;
        text-transform:uppercase;
        display:inline-flex;
        align-items:center;
        white-space:nowrap;
      }

      .incidencias-stats{
        margin-top:22px;
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 380px));
        gap:16px;
      }

      .incidencias-stat-card{
        display:grid;
        gap:10px;
        min-height:156px;
        padding:22px 22px 20px;
        border-radius:24px;
        border:1px solid var(--border-soft, rgba(15,23,42,.08));
        background:
          linear-gradient(180deg, rgba(255,255,255,.26), rgba(255,255,255,.08)),
          var(--surface-1, rgba(255,255,255,.68));
      }

      .incidencias-stat-card--open{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 22%, var(--border-soft, rgba(15,23,42,.08)));
      }

      .incidencias-stat-card--closed{
        border-color:color-mix(in srgb, var(--success-strong, #36c690) 22%, var(--border-soft, rgba(15,23,42,.08)));
      }

      .incidencias-stat-label{
        font-size:12px;
        font-weight:800;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:var(--text-dim, #6b7280);
      }

      .incidencias-stat-value{
        font-size:54px;
        line-height:.9;
        letter-spacing:-.05em;
        font-weight:800;
        color:var(--text-strong, #111827);
      }

      .incidencias-stat-text{
        font-size:15px;
        line-height:1.5;
        color:var(--text-dim, #6b7280);
      }

      .incidencias-history{
        overflow:hidden;
        border-radius:28px;
        border:1px solid var(--panel-border, rgba(255,255,255,.08));
        background:var(--panel-bg, rgba(255,255,255,.84));
        box-shadow:var(--shadow-soft, 0 20px 50px rgba(0,0,0,.08));
      }

      .incidencias-history-head{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:18px;
        align-items:start;
        padding:18px 20px 16px;
        border-bottom:1px solid var(--border-soft, rgba(15,23,42,.08));
      }

      .incidencias-history-copy{
        min-width:0;
        display:grid;
        gap:4px;
      }

      .incidencias-history-title{
        margin:0;
        font-size:18px;
        line-height:1.2;
        font-weight:800;
        color:var(--text-strong, #111827);
      }

      .incidencias-history-subtitle{
        margin:0;
        font-size:13px;
        line-height:1.45;
        color:var(--text-dim, #6b7280);
      }

      .incidencias-pagination{
        display:flex;
        gap:10px;
        flex-wrap:wrap;
      }

      .incidencias-pagination-btn{
        min-height:42px;
        padding:0 16px;
        border-radius:14px;
        border:1px solid var(--border-soft, rgba(15,23,42,.08));
        background:var(--surface-1, rgba(255,255,255,.72));
        color:var(--text-strong, #111827);
        font-size:13px;
        font-weight:700;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
      }

      .incidencias-pagination-btn[disabled],
      .incidencias-pagination-btn[aria-disabled="true"]{
        opacity:.48;
        cursor:not-allowed;
      }

      .incidencias-table-shell{
        width:100%;
        overflow-x:auto;
        overflow-y:hidden;
      }

      .incidencias-table{
        width:100%;
        border-collapse:separate;
        border-spacing:0;
        min-width:1180px;
      }

      .incidencias-table thead th{
        padding:16px 20px;
        text-align:left;
        font-size:12px;
        font-weight:800;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:var(--text-faint, #8a91a0);
        background:color-mix(in srgb, var(--surface-1, #fff) 88%, transparent);
        border-bottom:1px solid var(--border-soft, rgba(15,23,42,.08));
        white-space:nowrap;
      }

      .incidencias-table tbody td{
        padding:20px 20px;
        vertical-align:middle;
        border-bottom:1px solid var(--border-soft, rgba(15,23,42,.08));
      }

      .incidencias-table tbody tr:last-child td{
        border-bottom:none;
      }

      .incidencias-row{
        transition:background .18s ease;
      }

      .incidencias-row:hover{
        background:color-mix(in srgb, var(--accent, #7c5cff) 2.5%, transparent);
      }

      .incidencias-main{
        display:grid;
        grid-template-columns:52px minmax(0, 1fr);
        gap:14px;
        align-items:center;
        min-width:0;
      }

      .incidencias-avatar{
        position:relative;
        width:52px;
        height:52px;
        border-radius:999px;
        overflow:hidden;
        flex:0 0 52px;
        background:linear-gradient(135deg, rgba(124,92,255,.18), rgba(139,92,246,.34));
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
        font-size:22px;
        font-weight:800;
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
        gap:4px;
      }

      .incidencias-ticket-id{
        font-size:13px;
        line-height:1.2;
        font-weight:800;
        letter-spacing:.06em;
        color:#4b5563;
        text-transform:uppercase;
      }

      .incidencias-ticket-subject{
        font-size:18px;
        line-height:1.12;
        font-weight:800;
        letter-spacing:-.03em;
        color:var(--text-strong, #111827);
        overflow:hidden;
        text-overflow:ellipsis;
        display:-webkit-box;
        -webkit-line-clamp:2;
        -webkit-box-orient:vertical;
      }

      .incidencias-ticket-description{
        font-size:14px;
        line-height:1.35;
        color:var(--text-dim, #6b7280);
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .incidencias-chip{
        min-height:40px;
        padding:0 16px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        font-size:12px;
        font-weight:800;
        letter-spacing:.05em;
        text-transform:uppercase;
        white-space:nowrap;
        border:1px solid transparent;
      }

      .incidencias-chip--pending{
        color:#c57a13;
        background:rgba(255,188,66,.14);
        border-color:rgba(255,188,66,.32);
      }

      .incidencias-chip--open{
        color:var(--accent, #7c5cff);
        background:color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent);
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 24%, transparent);
      }

      .incidencias-chip--progress{
        color:#0f8ec7;
        background:rgba(125,211,252,.16);
        border-color:rgba(125,211,252,.34);
      }

      .incidencias-chip--resolved,
      .incidencias-chip--closed{
        color:#1f7a4d;
        background:rgba(54,198,144,.14);
        border-color:rgba(54,198,144,.30);
      }

      .incidencias-date-inline{
        display:inline-block;
        white-space:nowrap;
        font-size:14px;
        line-height:1.2;
        font-weight:700;
        font-variant-numeric:tabular-nums;
        color:#2f3747;
      }

      .incidencias-importe{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:34px;
        padding:0 14px;
        border-radius:999px;
        font-size:12px;
        font-weight:800;
        white-space:nowrap;
        border:1px solid transparent;
      }

      .incidencias-importe--money{
        color:#1f2937;
        background:rgba(15,23,42,.04);
        border-color:rgba(15,23,42,.08);
      }

      .incidencias-importe--status{
        color:#7b8494;
        background:rgba(15,23,42,.03);
        border-color:rgba(15,23,42,.06);
      }

      .incidencias-cell--actions{
        width:1%;
        white-space:nowrap;
      }

      .incidencias-detail-btn{
        width:auto;
        min-width:0;
        min-height:40px;
        padding:0 14px;
        border-radius:14px;
        border:1px solid var(--border-soft, rgba(15,23,42,.08));
        background:var(--surface-1, rgba(255,255,255,.74));
        color:var(--text-strong, #111827);
        font-size:14px;
        font-weight:700;
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        white-space:nowrap;
        box-shadow:none;
        transition:
          border-color .18s ease,
          background .18s ease,
          transform .18s ease,
          opacity .18s ease;
      }

      .incidencias-detail-btn:hover{
        border-color:rgba(15,23,42,.14);
        background:rgba(255,255,255,.96);
        transform:translateY(-1px);
      }

      .incidencias-inline-loading{
        display:inline-flex;
        align-items:center;
        gap:8px;
      }

      .incidencias-inline-spinner{
        width:14px;
        height:14px;
        border-radius:999px;
        border:2px solid rgba(255,255,255,.28);
        border-top-color:currentColor;
        animation:incidenciasSpin .78s linear infinite;
      }

      .incidencias-btn:not(.incidencias-btn--primary) .incidencias-inline-spinner,
      .incidencias-detail-btn .incidencias-inline-spinner{
        border-color:rgba(15,23,42,.18);
        border-top-color:currentColor;
      }

      .incidencias-empty{
        display:grid;
        justify-items:center;
        gap:8px;
        padding:54px 24px 58px;
        text-align:center;
      }

      .incidencias-empty-title{
        margin:0;
        font-size:20px;
        font-weight:800;
        color:var(--text-strong, #111827);
      }

      .incidencias-empty-text{
        margin:0;
        font-size:14px;
        line-height:1.6;
        color:var(--text-dim, #6b7280);
      }

      @keyframes incidenciasSpin{
        to{ transform:rotate(360deg); }
      }

      [data-theme="light"] .incidencias-hero,
      [data-theme="light"] .incidencias-history{
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent 34%),
          linear-gradient(180deg, rgba(255,255,255,.96), rgba(249,250,252,.94));
        box-shadow:
          0 16px 38px rgba(15,23,42,.05),
          0 0 0 1px rgba(255,255,255,.74) inset;
      }

      [data-theme="light"] .incidencias-stat-card{
        background:
          linear-gradient(180deg, rgba(255,255,255,.72), rgba(255,255,255,.42)),
          rgba(255,255,255,.58);
      }

      @media (max-width: 1240px){
        .incidencias-hero{
          padding:24px 24px 26px;
        }

        .incidencias-page-title{
          font-size:clamp(32px, 4vw, 54px);
        }
      }

      @media (max-width: 1180px){
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

      @media (max-width: 980px){
        .incidencias-stats{
          grid-template-columns:1fr 1fr;
        }
      }

      @media (max-width: 760px){
        .incidencias-view-root{
          gap:18px;
        }

        .incidencias-hero{
          padding:22px 18px 20px;
          border-radius:22px;
        }

        .incidencias-history{
          border-radius:22px;
        }

        .incidencias-history-head{
          grid-template-columns:1fr;
          padding:16px 16px 14px;
        }

        .incidencias-pagination{
          justify-content:flex-start;
        }

        .incidencias-stats{
          grid-template-columns:1fr;
        }

        .incidencias-page-title{
          font-size:clamp(30px, 9vw, 46px);
          line-height:.98;
          white-space:normal;
        }

        .incidencias-page-subtitle{
          font-size:15px;
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
  const items = safeArray(first(data.items, data.rows, data.tickets, data.incidencias));
  const state = safeObject(data.state);

  const stats = computeStats(items);

  const updatedAt = first(
    state.lastSyncAt,
    data.lastUpdatedAt,
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
            id="incidencias-export-btn"
            class="incidencias-btn"
          >
            <span class="incidencias-btn-text">Exportar historial</span>
          </button>

          <button
            type="button"
            id="incidencias-create-btn"
            class="incidencias-btn incidencias-btn--primary${creating ? " is-loading" : ""}"
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
          ${escapeHtml(`${stats.total} solicitudes registradas`)}
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
          <div class="incidencias-stat-label">Incidencias abiertas</div>
          <div class="incidencias-stat-value">${escapeHtml(String(stats.openCount))}</div>
          <div class="incidencias-stat-text">Solicitudes activas o pendientes de revisión.</div>
        </article>

        <article class="incidencias-stat-card incidencias-stat-card--closed">
          <div class="incidencias-stat-label">Incidencias cerradas</div>
          <div class="incidencias-stat-value">${escapeHtml(String(stats.closedCount))}</div>
          <div class="incidencias-stat-text">Casos resueltos o ya cerrados.</div>
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
  const items = safeArray(first(data.items, data.rows, data.tickets, data.incidencias));
  const state = safeObject(data.state);

  const pagination = getPagination(items, state);

  return `
    <section class="incidencias-history">
      <div class="incidencias-history-head">
        <div class="incidencias-history-copy">
          <h2 class="incidencias-history-title">Historial de incidencias</h2>
          <p class="incidencias-history-subtitle">
            ${escapeHtml(`Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · página ${pagination.currentPage} de ${pagination.totalPages}`)}
          </p>
        </div>

        <div class="incidencias-pagination">
          <button
            type="button"
            class="incidencias-pagination-btn"
            data-action="prev-page"
            ${pagination.currentPage <= 1 ? 'disabled aria-disabled="true"' : ""}
          >
            Anterior
          </button>

          <button
            type="button"
            class="incidencias-pagination-btn"
            data-action="next-page"
            ${pagination.currentPage >= pagination.totalPages ? 'disabled aria-disabled="true"' : ""}
          >
            Siguiente
          </button>
        </div>
      </div>

      ${
        pagination.pageItems.length
          ? `
            <div class="incidencias-table-shell">
              <table class="incidencias-table" role="table" aria-label="Listado de incidencias">
                <colgroup>
                  <col style="width:42%;">
                  <col style="width:12%;">
                  <col style="width:15%;">
                  <col style="width:15%;">
                  <col style="width:8%;">
                  <col style="width:8%;">
                </colgroup>

                <thead>
                  <tr>
                    <th>Incidencia</th>
                    <th>Estado</th>
                    <th>Fecha de creación</th>
                    <th>Última novedad</th>
                    <th>Importe</th>
                    <th>Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  ${pagination.pageItems.map((item) => renderRow(item, state)).join("")}
                </tbody>
              </table>
            </div>
          `
          : renderEmptyState()
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
