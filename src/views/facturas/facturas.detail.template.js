/* =========================================================
   Onion SPA - Facturas Detail Template
   Archivo: src/views/facturas/facturas.detail.template.js

   FACTURAS DETAIL MODAL · VISUAL 1:1 CON INCIDENCIAS MODE
   FINAL PRO SYSTEM · DETAIL MODAL · COMPAT MODE

   RESPONSABILIDADES:
   - renderizar modal premium centrado de detalle de factura
   - mantener compatibilidad con facturasView.js
   - soportar estado loading / sending / acciones del header
   - exponer exports legacy para imports antiguos
   - mantener data-action estables para bindings existentes
   - separar visualmente resumen, cliente, metadata, líneas e impuestos
   - mostrar IVA / IRPF cuando existan
   - no meter impuestos en la descripción de líneas
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

function normalizeText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

  return formatDate(value);
}

/* =========================================================
   DOMAIN HELPERS
========================================================= */

function getFacturaId(factura = {}) {
  return safeText(first(factura?.id, factura?._id, factura?.facturaId), "");
}

function getFacturaNumero(factura = {}) {
  return safeText(
    first(
      factura?.numero,
      factura?.numeroFacturaLegal,
      factura?.numeroFacturaSistema,
      factura?.code,
      factura?.facturaCode
    ),
    "—"
  );
}

function getClienteNombre(factura = {}) {
  return safeText(
    first(
      factura?.cliente?.nombreContacto,
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

function getClienteEmpresa(factura = {}) {
  return safeText(
    first(
      factura?.cliente?.empresa,
      factura?.cliente?.razonSocial,
      factura?.cliente?.nombre,
      factura?.clienteEmpresa,
      factura?.clienteNombre
    ),
    getClienteNombre(factura)
  );
}

function getClienteEmail(factura = {}) {
  return safeText(
    first(
      factura?.cliente?.email,
      factura?.cliente?.mail,
      factura?.clienteEmail,
      factura?.emailCliente,
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

function getClienteTelefono(factura = {}) {
  return safeText(
    first(
      factura?.cliente?.telefono,
      factura?.cliente?.phone,
      factura?.telefonoCliente
    ),
    "—"
  );
}

function getFacturaFecha(factura = {}) {
  return first(
    factura?.fecha,
    factura?.fechaFactura,
    factura?.date,
    factura?.createdAt,
    factura?.updatedAt
  );
}

function getFacturaFechaServicio(factura = {}) {
  return first(
    factura?.fechaServicio,
    factura?.serviceDate
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

function getFacturaFechaEnvio(factura = {}) {
  return first(
    factura?.fechaEnvio,
    factura?.sentAt
  );
}

function getFacturaEstadoPagoLabel(factura = {}) {
  return getEstadoPagoLabel(first(factura?.estadoPago, factura?.paymentStatus));
}

function getFacturaEstadoLabel(factura = {}) {
  return getEstadoLabel(first(factura?.estado, factura?.status));
}

function getFacturaFormaPago(factura = {}) {
  return safeText(first(factura?.formaPago, factura?.metodoPago, factura?.paymentMethod), "—");
}

function getFacturaMoneda(factura = {}) {
  return safeText(first(factura?.moneda, factura?.currency), "EUR");
}

function getFacturaTotal(factura = {}) {
  return safeNumber(first(factura?.total, factura?.amount, factura?.importe), 0);
}

function getFacturaSubtotal(factura = {}) {
  return safeNumber(first(factura?.subtotal, factura?.baseImponible), 0);
}

function getFacturaBase(factura = {}) {
  return safeNumber(first(factura?.baseImponible, factura?.subtotal), 0);
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

function getFacturaDescuentoTotal(factura = {}) {
  return safeNumber(first(factura?.descuentoTotal, factura?.discountTotal), 0);
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

function getFacturaPdfAvailable(factura = {}) {
  return Boolean(
    factura?.pdfAvailable ||
      factura?.hasPdf ||
      factura?.blobPath ||
      factura?.pdfUrl
  );
}

function getFacturaPreview(factura = {}) {
  return safeText(
    first(
      factura?.descripcion,
      factura?.concepto,
      factura?.preview,
      factura?.lineas?.[0]?.descripcion,
      factura?.lineas?.[0]?.concepto
    ),
    "Factura disponible para consulta."
  );
}

function getFacturaDireccionCliente(factura = {}) {
  const direccion = safeObject(factura?.cliente?.direccion);

  const parts = [
    safeText(direccion?.calle, ""),
    safeText(direccion?.linea2, ""),
    safeText(direccion?.cp, ""),
    safeText(direccion?.ciudad, ""),
    safeText(direccion?.provincia, ""),
    safeText(direccion?.pais, ""),
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : "—";
}

function getFacturaDireccionServicio(factura = {}) {
  const direccion = safeObject(factura?.direccionServicio);

  const parts = [
    safeText(direccion?.calle, ""),
    safeText(direccion?.linea2, ""),
    safeText(direccion?.cp, ""),
    safeText(direccion?.ciudad, ""),
    safeText(direccion?.provincia, ""),
    safeText(direccion?.pais, ""),
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : "—";
}

function getLineaConcepto(linea = {}) {
  return safeText(first(linea?.concepto, linea?.descripcion), "Línea");
}

function getLineaDescripcion(linea = {}) {
  return safeText(first(linea?.descripcion, linea?.detalle), "");
}

function getLineaCantidad(linea = {}) {
  return safeNumber(first(linea?.cantidad, linea?.qty, linea?.quantity), 0);
}

function getLineaUnitario(linea = {}) {
  return safeNumber(first(linea?.precioUnitario, linea?.unitPrice, linea?.precio), 0);
}

function getLineaSubtotal(linea = {}) {
  const explicit = first(linea?.subtotal, linea?.base);
  if (explicit !== null && explicit !== undefined && explicit !== "") {
    return safeNumber(explicit, 0);
  }

  return getLineaCantidad(linea) * getLineaUnitario(linea);
}

function getLineaTotal(linea = {}) {
  const explicit = first(linea?.totalLinea, linea?.total, linea?.importe);
  if (explicit !== null && explicit !== undefined && explicit !== "") {
    return safeNumber(explicit, 0);
  }

  return getLineaSubtotal(linea);
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

function getImpuestosBreakdown(factura = {}) {
  const impuestos = safeArray(factura?.impuestos);

  let iva = null;
  let irpf = null;
  let otros = [];

  impuestos.forEach((item) => {
    const impuesto = safeObject(item);
    const tipo = normalizeText(first(impuesto?.tipo, impuesto?.nombre));

    const normalized = {
      tipo: safeText(first(impuesto?.tipo, impuesto?.nombre), "Impuesto"),
      porcentaje: safeNumber(impuesto?.porcentaje, 0),
      base: safeNumber(impuesto?.base, 0),
      importe: safeNumber(impuesto?.importe, 0),
    };

    if (tipo.includes("iva")) {
      iva = normalized;
      return;
    }

    if (tipo.includes("irpf") || tipo.includes("retencion") || tipo.includes("retención")) {
      irpf = normalized;
      return;
    }

    otros.push(normalized);
  });

  return { iva, irpf, otros };
}

/* =========================================================
   UI PARTIALS
========================================================= */

function chip(label = "", style = "") {
  return `
    <span
      style="
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:30px;
        padding:0 10px;
        border-radius:999px;
        font-size:11px;
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
        background:var(--surface-1, var(--surface-glass));
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
        padding:12px;
        border-radius:14px;
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
      "
    >
      <span
        style="
          font-size:10px;
          color:var(--text-faint);
          text-transform:uppercase;
          font-weight:700;
          letter-spacing:.08em;
        "
      >
        ${escapeHtml(label)}
      </span>

      <strong
        style="
          color:var(--text-strong);
          font-size:13px;
          line-height:1.4;
          word-break:break-word;
        "
      >
        ${escapeHtml(value)}
      </strong>
    </div>
  `;
}

function renderSectionCard({
  title = "",
  subtitle = "",
  content = "",
} = {}) {
  return `
    <section
      style="
        display:grid;
        gap:12px;
        padding:16px;
        border-radius:18px;
        border:1px solid var(--border-soft);
        background:var(--surface-glass);
      "
    >
      <div style="display:grid; gap:4px;">
        <h3
          style="
            margin:0;
            color:var(--text-strong);
            font-size:18px;
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
                  line-height:1.55;
                  font-size:12px;
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

function renderAvatar(factura = {}) {
  const raw = safeText(getClienteNombre(factura), "ON");
  const parts = raw.split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase()
      : raw.slice(0, 2).toUpperCase();

  return `
    <div
      style="
        position:relative;
        flex:0 0 60px;
        width:60px;
        height:60px;
        border-radius:18px;
        display:grid;
        place-items:center;
        background:linear-gradient(135deg, rgba(124,92,255,.36), rgba(88,72,200,.18));
        border:1px solid rgba(124,92,255,.28);
        color:#efeaff;
        font-size:18px;
        font-weight:800;
        letter-spacing:.03em;
        box-shadow:0 10px 22px rgba(124,92,255,.18);
      "
    >
      ${escapeHtml(initials || "ON")}
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

export { renderSectionCard };

/* =========================================================
   HEADER ACTIONS
========================================================= */

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
        gap:8px;
        flex-wrap:wrap;
        align-items:flex-start;
      "
    >
      <button
        type="button"
        data-action="view-factura-pdf"
        data-factura-id="${escapeHtml(facturaId)}"
        ${pdfAvailable && !viewingPdf ? "" : "disabled"}
        style="
          min-height:38px;
          padding:0 12px;
          border-radius:12px;
          border:1px solid var(--border-soft);
          background:var(--surface-glass);
          color:var(--text-soft);
          font-size:12px;
          font-weight:700;
          cursor:${pdfAvailable && !viewingPdf ? "pointer" : "not-allowed"};
          opacity:${pdfAvailable ? (viewingPdf ? ".78" : "1") : ".56"};
        "
      >
        ${viewingPdf ? renderActionSpinner("Abriendo...") : "Ver PDF"}
      </button>

      <button
        type="button"
        data-action="download-factura"
        data-factura-id="${escapeHtml(facturaId)}"
        ${pdfAvailable && !downloading ? "" : "disabled"}
        style="
          min-height:38px;
          padding:0 12px;
          border-radius:12px;
          border:1px solid var(--border-soft);
          background:var(--surface-glass);
          color:var(--text-soft);
          font-size:12px;
          font-weight:700;
          cursor:${pdfAvailable && !downloading ? "pointer" : "not-allowed"};
          opacity:${pdfAvailable ? (downloading ? ".78" : "1") : ".56"};
        "
      >
        ${downloading ? renderActionSpinner("Bajando...") : "Descargar"}
      </button>

      <button
        type="button"
        data-action="send-factura"
        data-factura-id="${escapeHtml(facturaId)}"
        ${sending ? "disabled" : ""}
        style="
          min-height:38px;
          padding:0 12px;
          border-radius:12px;
          border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent);
          background:var(--accent, #7c5cff);
          color:#fff;
          font-size:12px;
          font-weight:700;
          cursor:${sending ? "wait" : "pointer"};
          opacity:${sending ? ".82" : "1"};
          box-shadow:0 12px 28px color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent);
        "
      >
        ${sending ? renderActionSpinner("Enviando...") : "Enviar"}
      </button>

      <button
        type="button"
        data-action="close-factura-detail"
        style="
          min-height:38px;
          padding:0 12px;
          border-radius:12px;
          border:1px solid var(--border-soft);
          background:transparent;
          color:var(--text-dim);
          font-size:12px;
          font-weight:700;
          cursor:pointer;
        "
      >
        Cerrar
      </button>
    </div>
  `;
}

/* =========================================================
   CONTENT SECTIONS
========================================================= */

function renderHeroMeta(factura = {}) {
  return `
    <div
      class="facturas-detail-meta-grid"
      style="
        display:grid;
        grid-template-columns:repeat(4, minmax(0, 1fr));
        gap:10px;
      "
    >
      ${mini("Número", getFacturaNumero(factura))}
      ${mini("Creada", formatDate(getFacturaFecha(factura)))}
      ${mini("Servicio", formatDate(getFacturaFechaServicio(factura)))}
      ${mini("Enviada", formatDateTime(getFacturaFechaEnvio(factura)))}
    </div>
  `;
}

function renderResumenSection(factura = {}) {
  const moneda = getFacturaMoneda(factura);

  return renderSectionCard({
    title: "Resumen económico",
    subtitle: "Vista principal del documento y del cierre financiero.",
    content: `
      <div
        style="
          display:grid;
          grid-template-columns:repeat(4, minmax(0, 1fr));
          gap:12px;
        "
        class="facturas-detail-stats-grid"
      >
        ${stat("Total", formatMoney(getFacturaTotal(factura), moneda))}
        ${stat("Base", formatMoney(getFacturaBase(factura), moneda))}
        ${stat("Impuestos", formatMoney(getFacturaImpuestos(factura), moneda))}
        ${stat("Pago", getFacturaEstadoPagoLabel(factura))}
      </div>
    `,
  });
}

function renderImpuestosSection(factura = {}) {
  const moneda = getFacturaMoneda(factura);
  const breakdown = getImpuestosBreakdown(factura);

  const cards = [];

  if (breakdown.iva) {
    cards.push(
      stat(
        `IVA ${breakdown.iva.porcentaje ? `(${breakdown.iva.porcentaje}%)` : ""}`.trim(),
        formatMoney(breakdown.iva.importe, moneda)
      )
    );
  }

  if (breakdown.irpf) {
    cards.push(
      stat(
        `IRPF ${breakdown.irpf.porcentaje ? `(${breakdown.irpf.porcentaje}%)` : ""}`.trim(),
        formatMoney(breakdown.irpf.importe, moneda)
      )
    );
  }

  breakdown.otros.forEach((item) => {
    cards.push(
      stat(
        `${item.tipo}${item.porcentaje ? ` (${item.porcentaje}%)` : ""}`,
        formatMoney(item.importe, moneda)
      )
    );
  });

  if (!cards.length) {
    cards.push(mini("Impuestos", "Sin desglose de impuestos disponible"));
  }

  return renderSectionCard({
    title: "Impuestos",
    subtitle: "Desglose fiscal detectado en la factura. Se muestran IVA e IRPF cuando existen.",
    content: `
      <div
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));
          gap:12px;
        "
      >
        ${cards.join("")}
      </div>
    `,
  });
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
        ${mini("Empresa", getClienteEmpresa(factura))}
        ${mini("Email", getClienteEmail(factura))}
        ${mini("Documento fiscal", getClienteDocumento(factura))}
        ${mini("Teléfono", getClienteTelefono(factura))}
        ${mini("Dirección cliente", getFacturaDireccionCliente(factura))}
        ${mini("Dirección servicio", getFacturaDireccionServicio(factura))}
        ${mini("Enviado a", getFacturaEnviadoA(factura))}
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
        ${mini("Estado factura", getFacturaEstadoLabel(factura))}
        ${mini("Estado pago", getFacturaEstadoPagoLabel(factura))}
        ${mini("Fecha emisión", formatDate(getFacturaFecha(factura)))}
        ${mini("Actualizado", formatDateTime(getFacturaUpdatedAt(factura)))}
        ${mini("Último cambio", formatRelativeDate(getFacturaUpdatedAt(factura)))}
        ${mini("Forma de pago", getFacturaFormaPago(factura))}
        ${mini("Moneda", getFacturaMoneda(factura))}
        ${mini("PDF", getFacturaPdfAvailable(factura) ? "Disponible" : "No disponible")}
        ${mini("Descuento total", formatMoney(getFacturaDescuentoTotal(factura), getFacturaMoneda(factura)))}
      </div>
    `,
  });
}

function renderDescripcionSection(factura = {}) {
  return renderSectionCard({
    title: "Descripción de la factura",
    subtitle: "Resumen general del documento sin mezclar el bloque fiscal.",
    content: `
      <div
        style="
          padding:14px;
          border-radius:16px;
          background:var(--surface-1, var(--surface-glass));
          border:1px solid var(--border-soft);
          color:var(--text-soft);
          font-size:13px;
          line-height:1.65;
          white-space:pre-wrap;
          word-break:break-word;
        "
      >
        ${escapeHtml(getFacturaPreview(factura))}
      </div>
    `,
  });
}

function renderLineaItem(linea = {}, moneda = "EUR") {
  const item = safeObject(linea);
  const descripcion = getLineaDescripcion(item);

  return `
    <article
      style="
        display:grid;
        gap:12px;
        padding:14px;
        border-radius:16px;
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
      "
    >
      <div
        style="
          display:flex;
          justify-content:space-between;
          gap:12px;
          flex-wrap:wrap;
          align-items:flex-start;
        "
      >
        <div style="display:grid; gap:4px; min-width:0;">
          <strong
            style="
              color:var(--text-strong);
              line-height:1.4;
              word-break:break-word;
              font-size:14px;
            "
          >
            ${escapeHtml(getLineaConcepto(item))}
          </strong>

          ${
            descripcion
              ? `
                <span
                  style="
                    color:var(--text-dim);
                    font-size:12px;
                    line-height:1.5;
                    word-break:break-word;
                  "
                >
                  ${escapeHtml(descripcion)}
                </span>
              `
              : ""
          }
        </div>

        <strong
          style="
            color:var(--text-strong);
            line-height:1.4;
            white-space:nowrap;
            font-size:14px;
          "
        >
          ${escapeHtml(formatMoney(getLineaTotal(item), moneda))}
        </strong>
      </div>

      <div
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(140px,1fr));
          gap:10px;
        "
      >
        ${mini("Cantidad", String(getLineaCantidad(item)))}
        ${mini("Unitario", formatMoney(getLineaUnitario(item), moneda))}
        ${mini("Subtotal", formatMoney(getLineaSubtotal(item), moneda))}
        ${mini("Total línea", formatMoney(getLineaTotal(item), moneda))}
      </div>
    </article>
  `;
}

function renderLineasSection(factura = {}) {
  const lineas = safeArray(first(factura?.lineas, factura?.items, factura?.conceptos));
  const moneda = getFacturaMoneda(factura);

  return renderSectionCard({
    title: "Líneas de factura",
    subtitle: "Desglose de conceptos, cantidades, precios unitarios y subtotales.",
    content: lineas.length
      ? `<div style="display:grid; gap:12px;">${lineas
          .map((linea) => renderLineaItem(linea, moneda))
          .join("")}</div>`
      : mini("Líneas", "Sin líneas"),
  });
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
      <div style="padding:18px; display:grid; gap:16px;">
        <div style="height:88px; border-radius:18px; background:var(--surface-glass); border:1px solid var(--border-soft);"></div>
        <div style="height:120px; border-radius:18px; background:var(--surface-glass); border:1px solid var(--border-soft);"></div>
        <div style="height:240px; border-radius:18px; background:var(--surface-glass); border:1px solid var(--border-soft);"></div>
      </div>
    `;
  }

  if (!factura) {
    return `
      <div style="padding:18px;">
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
        min-height:0;
        height:100%;
        max-height:100%;
      "
    >
      <header
        class="facturas-detail-header"
        style="
          position:sticky;
          top:0;
          z-index:4;
          display:grid;
          gap:16px;
          padding:18px 18px 14px;
          border-bottom:1px solid var(--border-soft);
          background:var(--modal-bg, var(--surface-1, #141414));
        "
      >
        <div
          class="facturas-modal-hero"
          style="
            display:flex;
            justify-content:space-between;
            gap:16px;
            flex-wrap:wrap;
          "
        >
          <div
            style="
              display:flex;
              gap:14px;
              align-items:flex-start;
              min-width:min(100%, 520px);
            "
          >
            ${renderAvatar(factura)}

            <div
              style="
                display:grid;
                gap:6px;
                min-width:0;
                flex:1 1 auto;
                padding-top:1px;
              "
            >
              <div
                style="
                  display:flex;
                  align-items:center;
                  gap:8px;
                  flex-wrap:wrap;
                "
              >
                <span
                  style="
                    display:inline-flex;
                    align-items:center;
                    min-height:28px;
                    padding:0 9px;
                    border-radius:999px;
                    border:1px solid var(--border-soft);
                    background:var(--surface-glass);
                    color:var(--text-dim);
                    font-size:11px;
                    font-weight:700;
                    letter-spacing:.04em;
                    text-transform:uppercase;
                  "
                >
                  ${escapeHtml(getFacturaNumero(factura))}
                </span>

                ${chip(
                  getFacturaEstadoPagoLabel(factura),
                  getEstadoPagoChipStyle(first(factura?.estadoPago, factura?.paymentStatus))
                )}

                ${chip(
                  getFacturaEstadoLabel(factura),
                  getEstadoChipStyle(first(factura?.estado, factura?.status))
                )}
              </div>

              <div style="display:grid; gap:4px; min-width:0;">
                <h2
                  style="
                    margin:0;
                    color:var(--text-strong);
                    font-size:clamp(20px, 3vw, 28px);
                    line-height:1.02;
                    letter-spacing:-.04em;
                    word-break:break-word;
                  "
                >
                  ${escapeHtml(getClienteNombre(factura))}
                </h2>

                <span
                  style="
                    color:var(--text-dim);
                    font-size:12px;
                    line-height:1.42;
                  "
                >
                  Última actualización ${escapeHtml(formatRelativeDate(getFacturaUpdatedAt(factura)))}
                </span>
              </div>
            </div>
          </div>

          ${renderHeaderActions({
            factura,
            sending,
            viewingPdf,
            downloading,
          })}
        </div>

        ${renderHeroMeta(factura)}
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
            padding:16px 18px 18px;
            display:grid;
            gap:16px;
          "
        >
          ${renderResumenSection(factura)}
          ${renderDescripcionSection(factura)}

          <div
            class="facturas-detail-grid"
            style="
              display:grid;
              grid-template-columns:minmax(0, 1.15fr) minmax(320px, .85fr);
              gap:16px;
              align-items:start;
            "
          >
            <section style="display:grid; gap:16px;">
              ${renderLineasSection(factura)}
            </section>

            <section style="display:grid; gap:16px;">
              ${renderImpuestosSection(factura)}
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

      @media (max-width: 980px) {
        .facturas-detail-meta-grid,
        .facturas-detail-stats-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }

        .facturas-detail-grid {
          grid-template-columns: 1fr !important;
        }
      }

      @media (max-width: 720px) {
        .facturas-modal-hero {
          align-items:flex-start !important;
        }
      }

      @media (max-width: 640px) {
        .facturas-detail-header {
          padding: 16px !important;
        }

        .facturas-detail-body-shell > div {
          padding: 14px !important;
        }

        .facturas-detail-meta-grid,
        .facturas-detail-stats-grid {
          grid-template-columns: 1fr !important;
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
        padding:20px;
        display:grid;
        place-items:center;
        background:rgba(0,0,0,.64);
        backdrop-filter:blur(8px);
      "
    >
      <div
        class="facturas-detail-modal"
        data-role="facturas-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Detalle factura"
        style="
          position:relative;
          width:min(1080px, 100%);
          max-height:92vh;
          overflow:auto;
          border-radius:24px;
          border:1px solid var(--border-soft, #2b2b2b);
          background:
            radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent 34%),
            linear-gradient(180deg, var(--surface-2, #151515), var(--surface-1, #121212));
          box-shadow:0 34px 84px rgba(0,0,0,.40);
        "
      >
        ${renderFacturasDetailContent({
          factura,
          loading: detailLoading,
          sendingFacturaId,
          viewingFacturaId,
          downloadingFacturaId,
        })}

        <style>
          [data-theme="light"] .facturas-detail-modal{
            background:
              radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 34%),
              linear-gradient(180deg, rgba(255,255,255,.96), rgba(250,251,255,.94));
            box-shadow:
              0 30px 70px rgba(15,23,42,.14),
              0 0 0 1px rgba(255,255,255,.65) inset;
          }

          @media (max-width: 900px) {
            .facturas-detail-overlay {
              padding: 14px !important;
            }

            .facturas-detail-modal {
              width: 100% !important;
              max-height: 94vh !important;
              border-radius: 22px !important;
            }
          }

          @media (max-width: 640px) {
            .facturas-detail-overlay {
              padding: 10px !important;
            }

            .facturas-detail-modal {
              width: 100% !important;
              max-height: 96vh !important;
              border-radius: 18px !important;
            }
          }
        </style>
      </div>
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
