/* =========================================================
   Onion SPA - Facturas Detail Template
   Archivo: src/views/facturas/facturas.detail.template.js

   FULLSCREEN PRO EDITION 10/10
   FINAL PRO SYSTEM · DETAIL MODAL · COMPAT MODE

   RESPONSABILIDADES:
   - renderizar modal premium fullscreen de detalle de factura
   - ocupar viewport útil con scroll interno limpio
   - mantener compatibilidad con facturasView.js
   - soportar estado loading / sending / acciones del header
   - exponer exports legacy para imports antiguos
   - mantener data-action estables para bindings existentes
========================================================= */

function safeText(value, fallback = "—") {
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
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMoney(value, currency = "EUR") {
  const amount = safeNumber(value, 0);
  const code = safeText(currency, "EUR");

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: code,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return "—";
  }
}

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "—";
  }
}

function formatRelativeDate(value) {
  if (!value) return "Sin fecha";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const absMin = Math.abs(diffMin);

  if (absMin < 1) return "Ahora mismo";

  if (absMin < 60) {
    return diffMin > 0
      ? `En ${absMin} min`
      : `Hace ${absMin} min`;
  }

  const diffHours = Math.round(absMin / 60);
  if (diffHours < 24) {
    return diffMin > 0
      ? `En ${diffHours} h`
      : `Hace ${diffHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays <= 7) {
    return diffMin > 0
      ? `En ${diffDays} día${diffDays === 1 ? "" : "s"}`
      : `Hace ${diffDays} día${diffDays === 1 ? "" : "s"}`;
  }

  return formatDate(value);
}

function getFacturaId(factura = {}) {
  return safeText(
    first(
      factura?.id,
      factura?._id,
      factura?.facturaId
    ),
    ""
  );
}

function getFacturaNumero(factura = {}) {
  return safeText(
    first(
      factura?.numero,
      factura?.code,
      factura?.facturaCode
    ),
    "—"
  );
}

function getClienteNombre(factura = {}) {
  return safeText(
    first(
      factura?.cliente?.empresa,
      factura?.cliente?.razonSocial,
      factura?.cliente?.nombreCompleto,
      factura?.cliente?.nombre,
      factura?.cliente?.name,
      factura?.clienteEmpresa,
      factura?.clienteNombre,
      factura?.clientName
    ),
    "Cliente"
  );
}

function getClienteEmail(factura = {}) {
  return safeText(
    first(
      factura?.cliente?.email,
      factura?.cliente?.mail,
      factura?.clienteEmail,
      factura?.email,
      factura?.clientEmail
    ),
    "Sin email"
  );
}

function getClienteDocumento(factura = {}) {
  return safeText(
    first(
      factura?.cliente?.nif,
      factura?.cliente?.cif,
      factura?.cliente?.vatId,
      factura?.cliente?.documentoFiscal
    ),
    "—"
  );
}

function getFacturaFecha(factura = {}) {
  return first(
    factura?.fecha,
    factura?.date,
    factura?.createdAt,
    factura?.updatedAt
  );
}

function getFacturaUpdatedAt(factura = {}) {
  return first(
    factura?.updatedAt,
    factura?.fechaEnvio,
    factura?.fecha,
    factura?.createdAt
  );
}

function getFacturaEstadoPagoLabel(factura = {}) {
  return getEstadoPagoLabel(
    first(factura?.estadoPago, factura?.paymentStatus)
  );
}

function getFacturaEstadoLabel(factura = {}) {
  return getEstadoLabel(
    first(factura?.estado, factura?.status)
  );
}

function getFacturaFormaPago(factura = {}) {
  return safeText(
    first(
      factura?.formaPago,
      factura?.paymentMethod
    ),
    "—"
  );
}

function getFacturaMoneda(factura = {}) {
  return safeText(
    first(
      factura?.moneda,
      factura?.currency
    ),
    "EUR"
  );
}

function getFacturaTotal(factura = {}) {
  return safeNumber(
    first(
      factura?.total,
      factura?.amount,
      factura?.importe
    ),
    0
  );
}

function getFacturaBase(factura = {}) {
  return safeNumber(
    first(
      factura?.baseImponible,
      factura?.subtotal
    ),
    0
  );
}

function getFacturaImpuestos(factura = {}) {
  return safeNumber(
    first(
      factura?.impuestosTotal,
      factura?.tax,
      factura?.iva
    ),
    0
  );
}

function getFacturaEnviadoA(factura = {}) {
  return safeText(
    first(
      factura?.enviadoA,
      factura?.sentTo,
      factura?.cliente?.email
    ),
    "—"
  );
}

function getFacturaFechaEnvio(factura = {}) {
  return first(
    factura?.fechaEnvio,
    factura?.sentAt
  );
}

function getFacturaPdfAvailable(factura = {}) {
  return Boolean(
    factura?.pdfAvailable ||
      factura?.hasPdf ||
      factura?.blobPath ||
      factura?.pdfUrl
  );
}

function getEstadoPagoLabel(value = "") {
  const key = String(value || "").trim().toLowerCase();

  switch (key) {
    case "paid":
    case "pagada":
    case "pagado":
    case "cobrada":
      return "Pagada";

    case "pending":
    case "pendiente":
      return "Pendiente";

    case "overdue":
    case "vencida":
      return "Vencida";

    case "cancelled":
    case "cancelada":
      return "Cancelada";

    case "draft":
    case "borrador":
      return "Borrador";

    case "partial":
    case "parcial":
      return "Pago parcial";

    default:
      return safeText(value, "Pendiente");
  }
}

function getEstadoLabel(value = "") {
  const key = String(value || "").trim().toLowerCase();

  switch (key) {
    case "emitida":
    case "issued":
      return "Emitida";

    case "enviada":
    case "sent":
      return "Enviada";

    case "anulada":
    case "void":
      return "Anulada";

    case "borrador":
    case "draft":
      return "Borrador";

    case "cancelada":
    case "cancelled":
      return "Cancelada";

    case "abonada":
    case "paid":
      return "Abonada";

    default:
      return safeText(value, "Emitida");
  }
}

function getEstadoPagoChipStyle(value = "") {
  const key = String(value || "").trim().toLowerCase();

  if (["paid", "pagada", "pagado", "cobrada"].includes(key)) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  if (["pending", "pendiente", "partial", "parcial"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  if (["overdue", "vencida"].includes(key)) {
    return `
      color:var(--danger-strong, #ff6b6b);
      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
    `;
  }

  if (["cancelled", "cancelada"].includes(key)) {
    return `
      color:var(--text-dim);
      background:var(--surface-glass);
      border:1px solid var(--border-soft);
    `;
  }

  return `
    color:var(--text-soft);
    background:var(--surface-glass);
    border:1px solid var(--border-soft);
  `;
}

function getEstadoChipStyle(value = "") {
  const key = String(value || "").trim().toLowerCase();

  if (["emitida", "issued"].includes(key)) {
    return `
      color:var(--accent-strong, var(--accent, #7c5cff));
      background:color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 26%, transparent);
    `;
  }

  if (["enviada", "sent"].includes(key)) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  if (["anulada", "void", "cancelada", "cancelled"].includes(key)) {
    return `
      color:var(--danger-strong, #ff6b6b);
      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
    `;
  }

  if (["borrador", "draft"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  if (["abonada", "paid"].includes(key)) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  return `
    color:var(--text-soft);
    background:var(--surface-glass);
    border:1px solid var(--border-soft);
  `;
}

function chip(label = "", style = "") {
  return `
    <span
      style="
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:30px;
        padding:0 12px;
        border-radius:999px;
        font-size:12px;
        font-weight:700;
        letter-spacing:.05em;
        text-transform:uppercase;
        white-space:nowrap;
        ${style || "border:1px solid var(--border-soft); background:var(--surface-glass); color:var(--text-soft);"}
      "
    >
      ${escapeHtml(label)}
    </span>
  `;
}

function renderActionSpinner(label = "") {
  return `
    <span style="display:inline-flex; align-items:center; gap:8px;">
      <span
        aria-hidden="true"
        style="
          width:14px;
          height:14px;
          border-radius:999px;
          border:2px solid color-mix(in srgb, currentColor 24%, transparent);
          border-top-color:currentColor;
          animation:facturasDetailSpin .8s linear infinite;
        "
      ></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function stat(label = "", value = "") {
  return `
    <article
      style="
        display:grid;
        gap:8px;
        min-height:92px;
        padding:16px;
        border-radius:18px;
        border:1px solid var(--border-soft);
        background:var(--surface-glass);
      "
    >
      <span
        style="
          font-size:11px;
          color:var(--text-faint);
          text-transform:uppercase;
          letter-spacing:.05em;
          font-weight:700;
        "
      >
        ${escapeHtml(label)}
      </span>

      <strong
        style="
          font-size:24px;
          line-height:1.05;
          color:var(--text-strong);
          word-break:break-word;
        "
      >
        ${escapeHtml(value)}
      </strong>
    </article>
  `;
}

function mini(label = "", value = "") {
  return `
    <div
      style="
        display:grid;
        gap:6px;
        padding:14px;
        border-radius:16px;
        border:1px solid var(--border-soft);
        background:var(--surface-glass);
      "
    >
      <span
        style="
          font-size:11px;
          color:var(--text-faint);
          text-transform:uppercase;
          font-weight:700;
          letter-spacing:.05em;
        "
      >
        ${escapeHtml(label)}
      </span>

      <span
        style="
          color:var(--text-strong);
          line-height:1.45;
          word-break:break-word;
        "
      >
        ${escapeHtml(value)}
      </span>
    </div>
  `;
}

/* =========================================================
   EXPORTS LEGACY
========================================================= */

export function renderMiniMeta(label = "", value = "") {
  return mini(label, value);
}

export function renderDetailStat(label = "", value = "") {
  return stat(label, value);
}

export function renderSectionCard({
  title = "",
  subtitle = "",
  content = "",
} = {}) {
  return `
    <section
      style="
        display:grid;
        gap:14px;
        padding:18px;
        border-radius:22px;
        border:1px solid var(--border-soft);
        background:var(--surface-glass);
      "
    >
      <div style="display:grid; gap:6px;">
        <h3
          style="
            margin:0;
            color:var(--text-strong);
            font-size:20px;
            letter-spacing:-.02em;
          "
        >
          ${escapeHtml(title)}
        </h3>

        ${
          subtitle
            ? `
              <p
                style="
                  margin:0;
                  color:var(--text-dim);
                  line-height:1.5;
                "
              >
                ${escapeHtml(subtitle)}
              </p>
            `
            : ""
        }
      </div>

      ${content}
    </section>
  `;
}

export function renderHeaderActions({
  factura = {},
  sending = false,
  viewingPdf = false,
  downloading = false,
} = {}) {
  const facturaId = getFacturaId(factura);
  const pdfAvailable = getFacturaPdfAvailable(factura);

  return `
    <div
      style="
        display:flex;
        gap:10px;
        flex-wrap:wrap;
        align-items:center;
      "
    >
      <button
        type="button"
        data-action="view-factura-pdf"
        data-factura-id="${escapeHtml(facturaId)}"
        ${pdfAvailable && !viewingPdf ? "" : "disabled"}
        style="
          min-height:42px;
          padding:0 14px;
          border-radius:14px;
          border:1px solid var(--border-soft);
          background:var(--surface-glass);
          color:var(--text-soft);
          font-weight:700;
          cursor:${pdfAvailable && !viewingPdf ? "pointer" : "not-allowed"};
          opacity:${pdfAvailable ? (viewingPdf ? ".78" : "1") : ".56"};
        "
      >
        ${
          viewingPdf
            ? renderActionSpinner("Abriendo...")
            : "Ver PDF"
        }
      </button>

      <button
        type="button"
        data-action="download-factura"
        data-factura-id="${escapeHtml(facturaId)}"
        ${pdfAvailable && !downloading ? "" : "disabled"}
        style="
          min-height:42px;
          padding:0 14px;
          border-radius:14px;
          border:1px solid var(--border-soft);
          background:var(--surface-glass);
          color:var(--text-soft);
          font-weight:700;
          cursor:${pdfAvailable && !downloading ? "pointer" : "not-allowed"};
          opacity:${pdfAvailable ? (downloading ? ".78" : "1") : ".56"};
        "
      >
        ${
          downloading
            ? renderActionSpinner("Bajando...")
            : "Descargar"
        }
      </button>

      <button
        type="button"
        data-action="send-factura"
        data-factura-id="${escapeHtml(facturaId)}"
        ${sending ? "disabled" : ""}
        style="
          min-height:42px;
          padding:0 14px;
          border-radius:14px;
          border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
          background:var(--btn-primary-bg, var(--accent, #7c5cff));
          color:var(--btn-primary-text, #fff);
          font-weight:700;
          cursor:${sending ? "wait" : "pointer"};
          opacity:${sending ? ".82" : "1"};
        "
      >
        ${
          sending
            ? renderActionSpinner("Enviando...")
            : "Enviar"
        }
      </button>

      <button
        type="button"
        data-action="close-factura-detail"
        style="
          min-height:42px;
          padding:0 14px;
          border-radius:14px;
          border:1px solid var(--border-soft);
          background:transparent;
          color:var(--text-dim);
          font-weight:700;
          cursor:pointer;
        "
      >
        Cerrar
      </button>
    </div>
  `;
}

function renderClienteSection(factura = {}) {
  return renderSectionCard({
    title: "Cliente",
    subtitle: "Información fiscal y de contacto asociada a la factura.",
    content: `
      <div
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
          gap:12px;
        "
      >
        ${mini("Cliente", getClienteNombre(factura))}
        ${mini("Email", getClienteEmail(factura))}
        ${mini("Documento fiscal", getClienteDocumento(factura))}
        ${mini("Enviado a", getFacturaEnviadoA(factura))}
      </div>
    `,
  });
}

function renderResumenSection(factura = {}) {
  const moneda = getFacturaMoneda(factura);

  return renderSectionCard({
    title: "Resumen económico",
    subtitle: "Distribución principal de importes y estado financiero del documento.",
    content: `
      <div
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
          gap:12px;
        "
      >
        ${stat("Total", formatMoney(getFacturaTotal(factura), moneda))}
        ${stat("Base", formatMoney(getFacturaBase(factura), moneda))}
        ${stat("Impuestos", formatMoney(getFacturaImpuestos(factura), moneda))}
        ${stat("Pago", getFacturaEstadoPagoLabel(factura))}
      </div>
    `,
  });
}

function renderMetaSection(factura = {}) {
  return renderSectionCard({
    title: "Metadata",
    subtitle: "Trazabilidad operativa y datos de control del documento.",
    content: `
      <div
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
          gap:12px;
        "
      >
        ${mini("Número", getFacturaNumero(factura))}
        ${mini("Estado", getFacturaEstadoLabel(factura))}
        ${mini("Fecha emisión", formatDate(getFacturaFecha(factura)))}
        ${mini("Actualizado", formatDateTime(getFacturaUpdatedAt(factura)))}
        ${mini("Último cambio", formatRelativeDate(getFacturaUpdatedAt(factura)))}
        ${mini("Forma de pago", getFacturaFormaPago(factura))}
        ${mini("Moneda", getFacturaMoneda(factura))}
        ${mini("Fecha envío", formatDateTime(getFacturaFechaEnvio(factura)))}
      </div>
    `,
  });
}

function renderLineaItem(linea = {}, moneda = "EUR") {
  const item = safeObject(linea);

  return `
    <article
      style="
        display:grid;
        gap:12px;
        padding:16px;
        border-radius:18px;
        border:1px solid var(--border-soft);
        background:var(--surface-glass);
      "
    >
      <div
        style="
          display:flex;
          justify-content:space-between;
          gap:12px;
          flex-wrap:wrap;
        "
      >
        <strong
          style="
            color:var(--text-strong);
            line-height:1.4;
            word-break:break-word;
          "
        >
          ${escapeHtml(safeText(item?.concepto, "Línea"))}
        </strong>

        <strong
          style="
            color:var(--text-strong);
            line-height:1.4;
            white-space:nowrap;
          "
        >
          ${escapeHtml(formatMoney(first(item?.totalLinea, item?.total), moneda))}
        </strong>
      </div>

      <div
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(140px,1fr));
          gap:10px;
        "
      >
        ${mini("Cantidad", safeText(item?.cantidad, "0"))}
        ${mini("Unitario", formatMoney(item?.precioUnitario, moneda))}
        ${mini("Subtotal", formatMoney(first(item?.subtotal, item?.base), moneda))}
        ${mini("Impuesto", formatMoney(first(item?.impuesto, item?.iva), moneda))}
      </div>
    </article>
  `;
}

function renderLineas(factura = {}) {
  const lineas = safeArray(
    first(
      factura?.lineas,
      factura?.items,
      factura?.conceptos
    )
  );

  if (!lineas.length) {
    return mini("Líneas", "Sin líneas");
  }

  const moneda = getFacturaMoneda(factura);

  return lineas.map((linea) => renderLineaItem(linea, moneda)).join("");
}

/* =========================================================
   CONTENT
========================================================= */

export function renderFacturasDetailContent({
  factura = null,
  loading = false,
  sendingFacturaId = "",
  viewingFacturaId = "",
  downloadingFacturaId = "",
} = {}) {
  if (loading) {
    return `
      <div style="padding:28px; display:grid; gap:18px;">
        <div style="height:42px; border-radius:14px; background:var(--surface-glass);"></div>
        <div style="height:140px; border-radius:20px; background:var(--surface-glass);"></div>
        <div style="height:420px; border-radius:22px; background:var(--surface-glass);"></div>
      </div>
    `;
  }

  if (!factura) {
    return `
      <div style="padding:28px;">
        ${mini("Detalle", "No disponible")}
      </div>
    `;
  }

  const facturaId = getFacturaId(factura);
  const sending = String(sendingFacturaId) === String(facturaId);
  const viewingPdf = String(viewingFacturaId) === String(facturaId);
  const downloading = String(downloadingFacturaId) === String(facturaId);

  return `
    <div
      style="
        display:flex;
        flex-direction:column;
        height:100%;
        min-height:0;
      "
    >
      <header
        class="facturas-detail-header"
        style="
          position:sticky;
          top:0;
          z-index:4;
          display:grid;
          gap:18px;
          padding:22px 24px 18px;
          border-bottom:1px solid var(--border-soft);
          background:var(--modal-bg, var(--surface-1, #141414));
        "
      >
        <div
          style="
            display:flex;
            justify-content:space-between;
            gap:18px;
            flex-wrap:wrap;
          "
        >
          <div
            style="
              display:grid;
              gap:10px;
              min-width:0;
              flex:1 1 520px;
            "
          >
            <span
              style="
                color:var(--text-dim);
                font-size:12px;
                text-transform:uppercase;
                font-weight:700;
                letter-spacing:.06em;
              "
            >
              Factura ${escapeHtml(getFacturaNumero(factura))}
            </span>

            <h2
              style="
                margin:0;
                font-size:clamp(30px, 4vw, 42px);
                line-height:.98;
                color:var(--text-strong);
                letter-spacing:-.04em;
                word-break:break-word;
              "
            >
              ${escapeHtml(getClienteNombre(factura))}
            </h2>

            <span
              style="
                color:var(--text-dim);
                font-size:14px;
              "
            >
              Actualizado ${escapeHtml(formatRelativeDate(getFacturaUpdatedAt(factura)))}
            </span>
          </div>

          ${renderHeaderActions({
            factura,
            sending,
            viewingPdf,
            downloading,
          })}
        </div>

        <div
          style="
            display:flex;
            gap:10px;
            flex-wrap:wrap;
          "
        >
          ${chip(
            getFacturaEstadoPagoLabel(factura),
            getEstadoPagoChipStyle(first(factura?.estadoPago, factura?.paymentStatus))
          )}
          ${chip(
            getFacturaEstadoLabel(factura),
            getEstadoChipStyle(first(factura?.estado, factura?.status))
          )}
        </div>
      </header>

      <div
        class="facturas-detail-body-shell"
        style="
          flex:1 1 auto;
          min-height:0;
          overflow:auto;
        "
      >
        <div
          style="
            padding:24px;
            display:grid;
            gap:22px;
          "
        >
          ${renderResumenSection(factura)}

          <div
            class="facturas-detail-grid"
            style="
              display:grid;
              grid-template-columns:minmax(0, 1.2fr) minmax(320px, .8fr);
              gap:20px;
              align-items:start;
            "
          >
            <section style="display:grid; gap:14px;">
              ${renderSectionCard({
                title: "Líneas de factura",
                subtitle: "Desglose de conceptos, cantidades, subtotales e impuestos.",
                content: renderLineas(factura),
              })}
            </section>

            <section style="display:grid; gap:14px;">
              ${renderClienteSection(factura)}
              ${renderMetaSection(factura)}
            </section>
          </div>
        </div>
      </div>
    </div>

    <style>
      @keyframes facturasDetailSpin {
        to { transform: rotate(360deg); }
      }

      .facturas-detail-body-shell {
        scrollbar-width: thin;
      }

      @media (max-width: 1180px) {
        .facturas-detail-grid {
          grid-template-columns: 1fr !important;
        }
      }

      @media (max-width: 900px) {
        .facturas-detail-header {
          padding: 18px !important;
        }
      }

      @media (max-width: 640px) {
        .facturas-detail-body-shell > div {
          padding: 16px !important;
        }
      }
    </style>
  `;
}

/* =========================================================
   MODAL
========================================================= */

export function renderFacturasDetailModal({
  detailOpen = false,
  detailLoading = false,
  factura = null,
  sendingFacturaId = "",
  viewingFacturaId = "",
  downloadingFacturaId = "",
} = {}) {
  if (!detailOpen) return "";

  return `
    <div
      class="facturas-detail-overlay"
      data-action="close-factura-detail"
      style="
        position:fixed;
        inset:0;
        z-index:9999;
        padding:24px;
        display:grid;
        place-items:center;
        background:rgba(0,0,0,.66);
        backdrop-filter:blur(10px);
      "
    >
      <div
        class="facturas-detail-modal"
        data-role="facturas-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Detalle factura"
        style="
          width:min(1360px, 100%);
          height:92vh;
          max-height:92vh;
          overflow:hidden;
          border-radius:26px;
          border:1px solid var(--border-soft);
          background:var(--modal-bg, var(--surface-1, #141414));
          box-shadow:0 40px 100px rgba(0,0,0,.45);
          display:flex;
          flex-direction:column;
        "
      >
        <div
          data-role="facturas-detail-panel"
          style="
            display:flex;
            flex-direction:column;
            height:100%;
            min-height:0;
          "
        >
          ${renderFacturasDetailContent({
            factura,
            loading: detailLoading,
            sendingFacturaId,
            viewingFacturaId,
            downloadingFacturaId,
          })}
        </div>
      </div>

      <style>
        @media (max-width: 900px) {
          .facturas-detail-overlay {
            padding: 12px !important;
          }

          .facturas-detail-modal {
            width: 100% !important;
            height: 94vh !important;
            max-height: 94vh !important;
            border-radius: 20px !important;
          }
        }

        @media (max-width: 640px) {
          .facturas-detail-overlay {
            padding: 8px !important;
          }

          .facturas-detail-modal {
            height: 96vh !important;
            max-height: 96vh !important;
            border-radius: 18px !important;
          }
        }
      </style>
    </div>
  `;
}

export default {
  renderMiniMeta,
  renderDetailStat,
  renderSectionCard,
  renderHeaderActions,
  renderFacturasDetailContent,
  renderFacturasDetailModal,
};
