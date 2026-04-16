/* =========================================================
   Onion SPA - Facturas Detail Template
   Archivo: src/views/facturas/facturas.detail.template.js

   FULLSCREEN PRO EDITION

   RESPONSABILIDADES:
   - modal detalle factura fullscreen real
   - ocupa viewport útil como incidencias
   - offsets shell reales
   - tamaño más equilibrado
   - no gigante visualmente
   - scroll interno premium
   - responsive enterprise
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

  return new Intl.DateTimeFormat("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getClienteNombre(factura = {}) {
  return safeText(
    factura?.cliente?.empresa ||
      factura?.cliente?.razonSocial ||
      factura?.cliente?.nombreCompleto ||
      factura?.cliente?.nombre ||
      factura?.cliente?.name,
    "Cliente"
  );
}

function getEstadoPagoLabel(value = "") {
  const key = String(value).trim().toLowerCase();

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
  const key = String(value).trim().toLowerCase();

  switch (key) {
    case "emitida":
    case "issued":
      return "Emitida";

    case "borrador":
    case "draft":
      return "Borrador";

    case "cancelada":
    case "cancelled":
      return "Cancelada";

    default:
      return safeText(value, "Emitida");
  }
}

function chip(label = "") {
  return `
    <span
      style="
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:30px;
        padding:0 12px;
        border-radius:999px;
        border:1px solid var(--border-soft);
        background:var(--surface-glass);
        color:var(--text-soft);
        font-size:12px;
        font-weight:700;
        letter-spacing:.05em;
        text-transform:uppercase;
      "
    >
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

function renderLineas(factura = {}) {
  const lineas = safeArray(factura?.lineas);

  if (!lineas.length) {
    return mini("Líneas", "Sin líneas");
  }

  return lineas
    .map(
      (linea) => `
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
                font-size:15px;
              "
            >
              ${escapeHtml(
                safeText(
                  linea?.concepto,
                  "Línea"
                )
              )}
            </strong>

            <strong>
              ${escapeHtml(
                formatMoney(
                  linea?.totalLinea,
                  factura?.moneda
                )
              )}
            </strong>
          </div>

          <div
            style="
              display:grid;
              grid-template-columns:repeat(auto-fit,minmax(140px,1fr));
              gap:10px;
            "
          >
            ${mini("Cantidad", safeText(linea?.cantidad, "0"))}
            ${mini("Unitario", formatMoney(linea?.precioUnitario, factura?.moneda))}
            ${mini("Subtotal", formatMoney(linea?.subtotal, factura?.moneda))}
            ${mini("Impuesto", formatMoney(linea?.impuesto, factura?.moneda))}
          </div>
        </article>
      `
    )
    .join("");
}

export function renderFacturasDetailContent({
  factura = null,
  loading = false,
  sendingFacturaId = "",
} = {}) {
  if (loading) {
    return `
      <div style="padding:28px;display:grid;gap:18px;">
        <div style="height:42px;border-radius:14px;background:var(--surface-glass);"></div>
        <div style="height:140px;border-radius:20px;background:var(--surface-glass);"></div>
        <div style="height:420px;border-radius:22px;background:var(--surface-glass);"></div>
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

  const sending =
    String(sendingFacturaId) === String(factura?.id);

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
          background:
            linear-gradient(180deg, rgba(255,255,255,.03), transparent),
            var(--modal-bg,var(--surface-1,#141414));
          backdrop-filter:blur(14px);
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
                letter-spacing:.05em;
                font-weight:700;
              "
            >
              Factura ${escapeHtml(safeText(factura?.numero))}
            </span>

            <h2
              style="
                margin:0;
                font-size:clamp(30px,4vw,42px);
                line-height:.98;
                letter-spacing:-.04em;
                color:var(--text-strong);
              "
            >
              ${escapeHtml(getClienteNombre(factura))}
            </h2>
          </div>

          <div
            style="
              display:flex;
              gap:10px;
              flex-wrap:wrap;
              align-items:center;
            "
          >
            <button
              data-action="view-factura-pdf"
              data-factura-id="${escapeHtml(factura?.id || "")}"
              style="
                min-height:42px;
                padding:0 16px;
                border:none;
                border-radius:14px;
                cursor:pointer;
              "
            >
              Ver PDF
            </button>

            <button
              data-action="download-factura"
              data-factura-id="${escapeHtml(factura?.id || "")}"
              style="
                min-height:42px;
                padding:0 16px;
                border:none;
                border-radius:14px;
                cursor:pointer;
              "
            >
              Descargar
            </button>

            <button
              data-action="send-factura"
              data-factura-id="${escapeHtml(factura?.id || "")}"
              style="
                min-height:42px;
                padding:0 16px;
                border:none;
                border-radius:14px;
                cursor:pointer;
              "
            >
              ${sending ? "Enviando..." : "Enviar"}
            </button>

            <button
              data-action="close-factura-detail"
              style="
                min-height:42px;
                padding:0 16px;
                border:none;
                border-radius:14px;
                cursor:pointer;
              "
            >
              Cerrar
            </button>
          </div>
        </div>

        <div
          style="
            display:flex;
            gap:10px;
            flex-wrap:wrap;
          "
        >
          ${chip(getEstadoPagoLabel(factura?.estadoPago))}
          ${chip(getEstadoLabel(factura?.estado))}
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

          <div
            style="
              display:grid;
              grid-template-columns:repeat(auto-fit,minmax(170px,1fr));
              gap:12px;
            "
          >
            ${stat("Fecha", formatDate(factura?.fecha))}
            ${stat("Total", formatMoney(factura?.total, factura?.moneda))}
            ${stat("Base", formatMoney(factura?.baseImponible ?? factura?.subtotal, factura?.moneda))}
            ${stat("Pago", getEstadoPagoLabel(factura?.estadoPago))}
          </div>

          <div
            class="facturas-detail-grid"
            style="
              display:grid;
              grid-template-columns:minmax(0,1.2fr) minmax(320px,.8fr);
              gap:20px;
              align-items:start;
            "
          >

            <section
              style="
                display:grid;
                gap:14px;
              "
            >
              ${renderLineas(factura)}
            </section>

            <section
              style="
                display:grid;
                gap:14px;
              "
            >
              ${mini("Cliente", getClienteNombre(factura))}
              ${mini("Email", safeText(factura?.cliente?.email))}
              ${mini("Método pago", safeText(factura?.formaPago))}
              ${mini("Actualizado", formatDateTime(factura?.updatedAt))}
            </section>

          </div>

        </div>
      </div>

    </div>

    <style>
      .facturas-detail-body-shell{
        scrollbar-width:thin;
      }

      @media (max-width:1180px){
        .facturas-detail-grid{
          grid-template-columns:1fr !important;
        }
      }

      @media (max-width:900px){
        .facturas-detail-header{
          padding:18px !important;
        }
      }

      @media (max-width:640px){
        .facturas-detail-body-shell > div{
          padding:16px !important;
        }
      }
    </style>
  `;
}

export function renderFacturasDetailModal({
  detailOpen = false,
  detailLoading = false,
  factura = null,
  sendingFacturaId = "",
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
          width:min(1360px,100%);
          height:92vh;
          max-height:92vh;
          overflow:hidden;
          border-radius:26px;
          border:1px solid var(--border-soft);
          background:var(--modal-bg,var(--surface-1,#141414));
          box-shadow:0 40px 100px rgba(0,0,0,.45);
          display:flex;
          flex-direction:column;
        "
      >
        ${renderFacturasDetailContent({
          factura,
          loading: detailLoading,
          sendingFacturaId,
        })}
      </div>

      <style>
        @media (max-width:900px){
          .facturas-detail-overlay{
            padding:12px !important;
          }

          .facturas-detail-modal{
            width:100% !important;
            height:94vh !important;
            max-height:94vh !important;
            border-radius:20px !important;
          }
        }

        @media (max-width:640px){
          .facturas-detail-overlay{
            padding:8px !important;
          }

          .facturas-detail-modal{
            height:96vh !important;
            max-height:96vh !important;
            border-radius:18px !important;
          }
        }
      </style>
    </div>
  `;
}
