/* =========================================================
   Onion SPA - Facturas Template
   Archivo: src/views/facturas/facturas.template.js

   FINAL PRODUCTION TEMPLATE · DEFINITIVO · FACTURAS MODE

   RESPONSABILIDADES:
   - render del hero/header de facturas
   - render de tabla productiva compacta
   - compatibilidad directa con facturasView.js
   - exportar renderHeader
   - exportar renderCards
   - exportar renderLoadingState
   - exportar renderErrorState
   - evitar mostrar null en cliente
   - quitar columna Estado
   - quitar columna Actualización
   - quitar columna PDF
   - añadir columna Incidencia clicable para abrir incidencia relacionada
   - optimizar espacio visual de tabla
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

/* =========================================================
   DOMAIN HELPERS
========================================================= */

function getFacturaId(item = {}) {
  return safeText(
    first(
      item.id,
      item._id,
      item.facturaId,
      item.numero,
      item?.raw?.id,
      item?.raw?._id,
      item?.raw?.facturaId,
      item?.raw?.numero
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
      item.id,
      item?.raw?.numero,
      item?.raw?.invoiceNumber,
      item?.raw?.code,
      item?.raw?.facturaId,
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
      item.clientName,
      item.client?.name,
      item.name,
      item.nombre,
      item.clienteEmpresa,
      item.cliente?.empresa,
      item.company,
      item?.raw?.clienteNombre,
      item?.raw?.cliente?.nombre,
      item?.raw?.clientName,
      item?.raw?.client?.name,
      item?.raw?.name,
      item?.raw?.nombre,
      item?.raw?.clienteEmpresa,
      item?.raw?.cliente?.empresa
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
      item.clientEmail,
      item.client?.email,
      item?.raw?.clienteEmail,
      item?.raw?.cliente?.email,
      item?.raw?.email,
      item?.raw?.clientEmail,
      item?.raw?.client?.email
    ),
    "Sin email"
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

function getEstadoPagoKey(value = "") {
  const key = safeText(value, "").toLowerCase();

  if (["paid", "pagada", "pagado", "cobrada"].includes(key)) return "paid";
  if (["pending", "pendiente"].includes(key)) return "pending";
  if (["partial", "parcial"].includes(key)) return "partial";
  if (["overdue", "vencida"].includes(key)) return "overdue";
  if (["cancelled", "cancelada"].includes(key)) return "cancelled";
  if (["draft", "borrador"].includes(key)) return "draft";

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
  return safeText(
    first(
      item.ticketId,
      item.incidenciaId,
      item.incidencia?.id,
      item.incidencia?.ticketId,
      item.ticket?.id,
      item.ticket?.ticketId,
      item.relatedTicketId,
      item.relatedIncidentId,
      item.supportTicketId,
      item.caseId,
      item?.raw?.ticketId,
      item?.raw?.incidenciaId,
      item?.raw?.incidencia?.id,
      item?.raw?.incidencia?.ticketId,
      item?.raw?.ticket?.id,
      item?.raw?.ticket?.ticketId,
      item?.raw?.relatedTicketId,
      item?.raw?.relatedIncidentId,
      item?.raw?.supportTicketId,
      item?.raw?.caseId
    ),
    "—"
  );
}

function getTotalLabel(item = {}) {
  return formatMoney(
    first(
      item.total,
      item.amount,
      item.importe,
      item?.raw?.total,
      item?.raw?.amount,
      item?.raw?.importe,
      0
    ),
    first(
      item.moneda,
      item.currency,
      item?.raw?.moneda,
      item?.raw?.currency,
      "EUR"
    )
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
    item?.raw?.fecha,
    item?.raw?.createdAt,
    item?.raw?.fechaCreacion,
    item?.raw?.issueDate
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

function hasPdf(item = {}) {
  return Boolean(
    first(
      item.pdfAvailable,
      item.blobPath,
      item.pdfUrl,
      item.pdf,
      item?.raw?.pdfAvailable,
      item?.raw?.blobPath,
      item?.raw?.pdfUrl,
      item?.raw?.pdf
    )
  );
}

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
      (acc, item) =>
        acc +
        safeNumber(
          first(
            item.total,
            item.amount,
            item.importe,
            item?.raw?.total,
            item?.raw?.amount,
            item?.raw?.importe,
            0
          ),
          0
        ),
      0
    ),
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
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function renderAvatar(item = {}) {
  const fullName = getClientName(item);
  const initials = getInitials(fullName);

  return `
    <div
      class="facturas-avatar facturas-avatar--fallback"
      title="${escapeHtml(fullName)}"
      aria-label="${escapeHtml(fullName)}"
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

  if (!incidenciaId || incidenciaId === "—") {
    return `<span class="facturas-incidencia-empty">—</span>`;
  }

  return `
    <button
      type="button"
      class="facturas-incidencia-link"
      data-action="open-incidencia"
      data-ticket-id="${escapeHtml(incidenciaId)}"
      data-incidencia-id="${escapeHtml(incidenciaId)}"
      title="Abrir incidencia relacionada"
    >
      ${escapeHtml(incidenciaId)}
    </button>
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
    <tr class="facturas-row" data-factura-id="${escapeHtml(facturaId)}">
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
            class="facturas-action-btn"
            data-action="open-factura"
            data-factura-id="${escapeHtml(facturaId)}"
            ${busy.isOpening ? 'disabled aria-busy="true"' : ""}
          >
            ${
              busy.isOpening
                ? renderSpinner("Abriendo...")
                : '<span class="facturas-btn-text">Detalle</span>'
            }
          </button>

          <button
            type="button"
            class="facturas-action-btn"
            data-action="view-factura-pdf"
            data-factura-id="${escapeHtml(facturaId)}"
            ${
              pdfAvailable && !busy.isViewingPdf
                ? ""
                : 'disabled aria-disabled="true"'
            }
          >
            ${
              busy.isViewingPdf
                ? renderSpinner("Abriendo...")
                : '<span class="facturas-btn-text">Ver PDF</span>'
            }
          </button>

          <button
            type="button"
            class="facturas-action-btn facturas-action-btn--primary"
            data-action="download-factura"
            data-factura-id="${escapeHtml(facturaId)}"
            ${
              pdfAvailable && !busy.isDownloading
                ? ""
                : 'disabled aria-disabled="true"'
            }
          >
            ${
              busy.isDownloading
                ? renderSpinner("Bajando...")
                : '<span class="facturas-btn-text">Descargar</span>'
            }
          </button>

          <button
            type="button"
            class="facturas-action-btn facturas-action-btn--success"
            data-action="send-factura"
            data-factura-id="${escapeHtml(facturaId)}"
            ${busy.isSending ? 'disabled aria-busy="true"' : ""}
          >
            ${
              busy.isSending
                ? renderSpinner("Enviando...")
                : '<span class="facturas-btn-text">Enviar</span>'
            }
          </button>
        </div>
      </td>
    </tr>
  `;
}

function renderTableLoading(rows = 5) {
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
              <div class="facturas-skeleton facturas-skeleton--pill"></div>
              <div class="facturas-skeleton facturas-skeleton--actions"></div>
            </div>
          `
        )
        .join("")}
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

function renderStyles() {
  return `
    <style>
      .facturas-hero{
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

      .facturas-hero-top{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:18px;
        align-items:start;
      }

      .facturas-hero-copy{
        min-width:0;
        display:grid;
        gap:10px;
      }

      .facturas-page-title{
        margin:0;
        max-width:100%;
        font-size:clamp(26px, 2.6vw, 42px);
        line-height:.98;
        letter-spacing:-.05em;
        font-weight:780;
        color:var(--text-strong, #0f172a);
        white-space:nowrap;
      }

      .facturas-page-subtitle{
        margin:0;
        max-width:860px;
        font-size:15px;
        line-height:1.58;
        color:var(--text-dim, #6b7280);
      }

      .facturas-hero-actions{
        display:flex;
        align-items:flex-start;
        justify-content:flex-end;
        gap:10px;
        flex-wrap:wrap;
      }

      .facturas-btn{
        min-height:42px;
        padding:0 15px;
        border-radius:14px;
        border:1px solid color-mix(in srgb, var(--border-soft, rgba(15,23,42,.08)) 92%, transparent);
        background:rgba(255,255,255,.74);
        color:var(--text-strong, #111827);
        font-size:13px;
        font-weight:700;
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        box-shadow:0 4px 12px rgba(15,23,42,.035);
        transition:
          transform .16s ease,
          box-shadow .16s ease,
          border-color .16s ease,
          background .16s ease,
          opacity .16s ease,
          filter .16s ease;
      }

      .facturas-btn:hover{
        transform:translateY(-1px);
        box-shadow:0 8px 18px rgba(15,23,42,.05);
        background:rgba(255,255,255,.92);
        border-color:rgba(15,23,42,.10);
      }

      .facturas-btn--primary{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 14%, rgba(15,23,42,.06));
        background:linear-gradient(
          180deg,
          color-mix(in srgb, var(--accent, #7c5cff) 84%, white 16%),
          color-mix(in srgb, var(--accent, #7c5cff) 92%, black 8%)
        );
        color:#fff;
        box-shadow:0 8px 18px color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      }

      .facturas-btn--primary:hover{
        background:linear-gradient(
          180deg,
          color-mix(in srgb, var(--accent, #7c5cff) 88%, white 12%),
          color-mix(in srgb, var(--accent, #7c5cff) 96%, black 4%)
        );
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 20%, rgba(15,23,42,.06));
        box-shadow:0 10px 22px color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent);
      }

      .facturas-btn.is-loading,
      .facturas-action-btn.is-loading{
        cursor:wait;
        opacity:.9;
      }

      .facturas-btn:disabled,
      .facturas-action-btn:disabled{
        pointer-events:none;
      }

      .facturas-hero-meta{
        margin-top:14px;
        display:flex;
        align-items:center;
        gap:8px;
        flex-wrap:wrap;
      }

      .facturas-meta-pill{
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

      .facturas-stats{
        margin-top:16px;
        display:grid;
        grid-template-columns:repeat(4, minmax(0, 1fr));
        gap:12px;
      }

      .facturas-stat-card{
        display:grid;
        gap:8px;
        min-height:124px;
        padding:16px 18px;
        border-radius:20px;
        border:1px solid rgba(15,23,42,.06);
        background:
          linear-gradient(180deg, rgba(255,255,255,.58), rgba(255,255,255,.22)),
          rgba(255,255,255,.46);
        box-shadow:0 6px 20px rgba(15,23,42,.03);
      }

      .facturas-stat-card--accent{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 16%, rgba(15,23,42,.06));
      }

      .facturas-stat-card--success{
        border-color:color-mix(in srgb, var(--success-strong, #36c690) 18%, rgba(15,23,42,.06));
      }

      .facturas-stat-card--warning{
        border-color:color-mix(in srgb, var(--warning-strong, #ffbc42) 18%, rgba(15,23,42,.06));
      }

      .facturas-stat-card--danger{
        border-color:color-mix(in srgb, var(--danger-strong, #ff6b6b) 18%, rgba(15,23,42,.06));
      }

      .facturas-stat-label{
        font-size:11px;
        font-weight:760;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:#7b8494;
      }

      .facturas-stat-value{
        font-size:42px;
        line-height:.92;
        letter-spacing:-.045em;
        font-weight:780;
        color:var(--text-strong, #111827);
      }

      .facturas-stat-text{
        font-size:14px;
        line-height:1.45;
        color:var(--text-dim, #6b7280);
      }

      .facturas-history{
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

      .facturas-history-head{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:14px;
        align-items:start;
        padding:14px 18px 12px;
        border-bottom:1px solid rgba(15,23,42,.06);
      }

      .facturas-history-copy{
        min-width:0;
        display:grid;
        gap:2px;
      }

      .facturas-history-title{
        margin:0;
        font-size:16px;
        line-height:1.2;
        font-weight:760;
        color:var(--text-strong, #111827);
      }

      .facturas-history-subtitle{
        margin:0;
        font-size:12px;
        line-height:1.4;
        color:var(--text-dim, #7b8494);
      }

      .facturas-table-wrap{
        position:relative;
      }

      .facturas-table-wrap.is-refreshing .facturas-table-shell{
        opacity:.58;
        filter:blur(.8px);
        transition:opacity .18s ease, filter .18s ease;
      }

      .facturas-table-shell{
        width:100%;
        overflow-x:auto;
        overflow-y:hidden;
        transition:opacity .18s ease, filter .18s ease;
      }

      .facturas-table{
        width:100%;
        border-collapse:separate;
        border-spacing:0;
        min-width:1080px;
      }

      .facturas-table thead th{
        padding:12px 16px;
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

      .facturas-table tbody td{
        padding:16px 16px;
        vertical-align:middle;
        border-bottom:1px solid rgba(15,23,42,.055);
      }

      .facturas-table tbody tr:last-child td{
        border-bottom:none;
      }

      .facturas-row{
        transition:background .16s ease;
      }

      .facturas-row:hover{
        background:rgba(124,92,255,.014);
      }

      .facturas-main{
        display:grid;
        grid-template-columns:40px minmax(0, 1fr);
        gap:12px;
        align-items:center;
        min-width:0;
      }

      .facturas-avatar{
        position:relative;
        width:40px;
        height:40px;
        border-radius:999px;
        overflow:hidden;
        flex:0 0 40px;
        background:linear-gradient(135deg, rgba(124,92,255,.12), rgba(139,92,246,.24));
      }

      .facturas-avatar-fallback{
        position:absolute;
        inset:0;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:17px;
        font-weight:780;
        color:#fff;
        letter-spacing:-.03em;
      }

      .facturas-main-copy{
        min-width:0;
        display:grid;
        gap:2px;
      }

      .facturas-factura-id{
        font-size:11px;
        line-height:1.15;
        font-weight:760;
        letter-spacing:.055em;
        color:#667084;
        text-transform:uppercase;
      }

      .facturas-factura-client{
        font-size:14px;
        line-height:1.16;
        font-weight:760;
        letter-spacing:-.022em;
        color:var(--text-strong, #111827);
        overflow:hidden;
        text-overflow:ellipsis;
        display:-webkit-box;
        -webkit-line-clamp:2;
        -webkit-box-orient:vertical;
      }

      .facturas-factura-email{
        font-size:12px;
        line-height:1.25;
        color:#8a93a3;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .facturas-chip{
        min-height:30px;
        padding:0 11px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        font-size:11px;
        font-weight:760;
        letter-spacing:.04em;
        text-transform:uppercase;
        white-space:nowrap;
        border:1px solid transparent;
      }

      .facturas-chip--pending,
      .facturas-chip--partial,
      .facturas-chip--draft{
        color:#b7791f;
        background:rgba(255,188,66,.11);
        border-color:rgba(255,188,66,.22);
      }

      .facturas-chip--paid{
        color:#258a59;
        background:rgba(54,198,144,.10);
        border-color:rgba(54,198,144,.22);
      }

      .facturas-chip--overdue,
      .facturas-chip--cancelled{
        color:#c24141;
        background:rgba(255,107,107,.10);
        border-color:rgba(255,107,107,.22);
      }

      .facturas-date-inline{
        display:inline-block;
        white-space:nowrap;
        font-size:13px;
        line-height:1.2;
        font-weight:650;
        font-variant-numeric:tabular-nums;
        color:#344054;
      }

      .facturas-total-stack{
        display:grid;
        gap:2px;
      }

      .facturas-total-value{
        font-size:14px;
        line-height:1.15;
        font-weight:780;
        color:var(--text-strong, #111827);
        white-space:nowrap;
      }

      .facturas-total-caption{
        font-size:11px;
        line-height:1.15;
        color:#6b7280;
        white-space:nowrap;
        font-weight:700;
      }

      .facturas-total-meta{
        font-size:11px;
        line-height:1.15;
        color:#98a2b3;
        white-space:nowrap;
      }

      .facturas-incidencia-link{
        min-height:30px;
        padding:0 10px;
        border-radius:999px;
        border:1px solid rgba(124,92,255,.16);
        background:rgba(124,92,255,.06);
        color:#6d53d7;
        font-size:11px;
        font-weight:760;
        letter-spacing:.04em;
        text-transform:uppercase;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        white-space:nowrap;
        transition:
          transform .16s ease,
          background .16s ease,
          border-color .16s ease,
          box-shadow .16s ease;
      }

      .facturas-incidencia-link:hover{
        transform:translateY(-1px);
        background:rgba(124,92,255,.10);
        border-color:rgba(124,92,255,.22);
        box-shadow:0 6px 14px rgba(124,92,255,.10);
      }

      .facturas-incidencia-empty{
        color:#98a2b3;
        font-size:13px;
        font-weight:650;
      }

      .facturas-cell--actions{
        width:1%;
        white-space:nowrap;
      }

      .facturas-actions{
        display:flex;
        align-items:center;
        gap:6px;
        flex-wrap:wrap;
        justify-content:flex-end;
      }

      .facturas-action-btn{
        width:auto;
        min-width:0;
        min-height:32px;
        padding:0 11px;
        border-radius:11px;
        border:1px solid rgba(15,23,42,.065);
        background:rgba(255,255,255,.78);
        color:#1f2937;
        font-size:12px;
        font-weight:760;
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        white-space:nowrap;
        box-shadow:0 2px 8px rgba(15,23,42,.02);
        transition:
          border-color .16s ease,
          background .16s ease,
          transform .16s ease,
          opacity .16s ease,
          box-shadow .16s ease,
          filter .16s ease;
      }

      .facturas-action-btn:hover{
        transform:translateY(-1px);
        background:rgba(255,255,255,.96);
        border-color:rgba(15,23,42,.10);
        box-shadow:0 6px 14px rgba(15,23,42,.05);
      }

      .facturas-action-btn--primary{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 16%, rgba(15,23,42,.06));
        background:linear-gradient(
          180deg,
          color-mix(in srgb, var(--accent, #7c5cff) 84%, white 16%),
          color-mix(in srgb, var(--accent, #7c5cff) 92%, black 8%)
        );
        color:#fff;
        box-shadow:0 8px 16px color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      }

      .facturas-action-btn--primary:hover{
        background:linear-gradient(
          180deg,
          color-mix(in srgb, var(--accent, #7c5cff) 88%, white 12%),
          color-mix(in srgb, var(--accent, #7c5cff) 96%, black 4%)
        );
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 22%, rgba(15,23,42,.06));
        box-shadow:0 10px 18px color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent);
      }

      .facturas-action-btn--success{
        border-color:color-mix(in srgb, var(--success-strong, #36c690) 16%, rgba(15,23,42,.06));
        background:linear-gradient(
          180deg,
          color-mix(in srgb, var(--success-strong, #36c690) 84%, white 16%),
          color-mix(in srgb, var(--success-strong, #36c690) 92%, black 8%)
        );
        color:#fff;
        box-shadow:0 8px 16px color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      }

      .facturas-action-btn--success:hover{
        background:linear-gradient(
          180deg,
          color-mix(in srgb, var(--success-strong, #36c690) 88%, white 12%),
          color-mix(in srgb, var(--success-strong, #36c690) 96%, black 4%)
        );
        border-color:color-mix(in srgb, var(--success-strong, #36c690) 22%, rgba(15,23,42,.06));
        box-shadow:0 10px 18px color-mix(in srgb, var(--success-strong, #36c690) 18%, transparent);
      }

      .facturas-inline-loading{
        display:inline-flex;
        align-items:center;
        gap:7px;
        white-space:nowrap;
      }

      .facturas-inline-spinner{
        width:13px;
        height:13px;
        border-radius:999px;
        border:2px solid rgba(255,255,255,.30);
        border-top-color:currentColor;
        animation:facturasSpin .78s linear infinite;
        flex:0 0 auto;
      }

      .facturas-btn:not(.facturas-btn--primary) .facturas-inline-spinner,
      .facturas-action-btn:not(.facturas-action-btn--primary):not(.facturas-action-btn--success) .facturas-inline-spinner{
        border-color:rgba(15,23,42,.16);
        border-top-color:currentColor;
      }

      .facturas-table-loading{
        padding:12px 18px 16px;
        display:grid;
        gap:12px;
      }

      .facturas-table-loading-row{
        display:grid;
        grid-template-columns:40px minmax(220px, 1.7fr) 110px 130px 110px 250px;
        gap:12px;
        align-items:center;
      }

      .facturas-table-loading-copy{
        display:grid;
        gap:7px;
      }

      .facturas-skeleton{
        position:relative;
        overflow:hidden;
        border-radius:999px;
        background:rgba(148,163,184,.14);
      }

      .facturas-skeleton::after{
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
        animation:facturasSkeleton 1.2s ease-in-out infinite;
      }

      .facturas-skeleton--avatar{
        width:40px;
        height:40px;
        border-radius:999px;
      }

      .facturas-skeleton--xs{
        width:120px;
        height:10px;
      }

      .facturas-skeleton--lg{
        width:74%;
        height:14px;
      }

      .facturas-skeleton--md{
        width:56%;
        height:12px;
      }

      .facturas-skeleton--pill{
        width:86px;
        height:30px;
      }

      .facturas-skeleton--date{
        width:118px;
        height:12px;
      }

      .facturas-skeleton--actions{
        width:230px;
        height:32px;
      }

      .facturas-empty{
        display:grid;
        justify-items:center;
        gap:8px;
        padding:44px 20px 48px;
        text-align:center;
      }

      .facturas-empty-title{
        margin:0;
        font-size:18px;
        font-weight:760;
        color:var(--text-strong, #111827);
      }

      .facturas-empty-text{
        margin:0;
        font-size:13px;
        line-height:1.55;
        color:var(--text-dim, #6b7280);
      }

      .facturas-error{
        display:grid;
        justify-items:start;
        gap:10px;
        padding:24px 22px;
        border-radius:20px;
        border:1px solid rgba(255,107,107,.22);
        background:
          linear-gradient(180deg, rgba(255,107,107,.06), rgba(255,255,255,.5)),
          rgba(255,255,255,.7);
      }

      .facturas-error-title{
        margin:0;
        font-size:18px;
        font-weight:760;
        color:var(--text-strong, #111827);
      }

      .facturas-error-text{
        margin:0;
        font-size:13px;
        line-height:1.6;
        color:var(--text-dim, #6b7280);
      }

      @keyframes facturasSpin{
        to{ transform:rotate(360deg); }
      }

      @keyframes facturasSkeleton{
        to{ transform:translateX(100%); }
      }

      [data-theme="light"] .facturas-hero,
      [data-theme="light"] .facturas-history{
        background:
          linear-gradient(180deg, rgba(255,255,255,.82), rgba(248,250,252,.74)),
          rgba(255,255,255,.82);
        box-shadow:
          0 12px 28px rgba(15,23,42,.035),
          0 0 0 1px rgba(255,255,255,.72) inset;
      }

      [data-theme="light"] .facturas-stat-card{
        background:
          linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.48)),
          rgba(255,255,255,.56);
      }

      @media (max-width: 1180px){
        .facturas-hero{
          padding:20px;
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
        .facturas-hero{
          padding:18px 16px;
          border-radius:20px;
        }

        .facturas-history{
          border-radius:20px;
        }

        .facturas-history-head{
          grid-template-columns:1fr;
          padding:14px 14px 12px;
        }

        .facturas-stats{
          grid-template-columns:1fr;
        }

        .facturas-page-title{
          font-size:clamp(24px, 8vw, 34px);
          line-height:1;
          white-space:normal;
        }

        .facturas-page-subtitle{
          font-size:14px;
        }
      }
    </style>
  `;
}

/* =========================================================
   HEADER
========================================================= */

export function renderHeader({ items = [], state = {} } = {}) {
  const rows = safeArray(items);
  const runtime = safeObject(state);

  const stats = computeStats(rows);

  const updatedAt = first(
    runtime.lastSyncAt,
    ...rows.map((item) => getUpdatedAt(item))
  );

  const remoteCount = safeNumber(
    first(runtime.remoteCount, runtime.totalCount, rows.length),
    rows.length
  );

  const refreshing = Boolean(runtime.refreshing);

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
          >
            <span class="facturas-btn-text">Exportar CSV</span>
          </button>

          <button
            type="button"
            id="facturas-refresh-btn"
            class="facturas-btn facturas-btn--primary${refreshing ? " is-loading" : ""}"
            ${refreshing ? 'disabled aria-busy="true"' : ""}
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
      ${renderTableLoading(6)}
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
  const rows = safeArray(items);
  const runtime = safeObject(state);
  const refreshing = Boolean(runtime.refreshing);
  const total = rows.length;

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
            ${escapeHtml(`Mostrando ${total} registro${total === 1 ? "" : "s"} en pantalla`)}
          </p>
        </div>
      </div>

      <div class="facturas-table-wrap${refreshing ? " is-refreshing" : ""}">
        ${
          refreshing
            ? renderTableLoading(Math.min(4, Math.max(3, rows.length || 3)))
            : ""
        }

        <div class="facturas-table-shell">
          <table class="facturas-table" role="table" aria-label="Listado de facturas">
            <colgroup>
              <col style="width:39%;">
              <col style="width:11%;">
              <col style="width:15%;">
              <col style="width:15%;">
              <col style="width:10%;">
              <col style="width:10%;">
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
              ${rows.map((item) => renderRow(item, runtime)).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

export default {
  renderHeader,
  renderCards,
  renderLoadingState,
  renderErrorState,
};
