/* =========================================================
   Onion SPA - Facturas Detail Template (FINAL PRO CLEAN LAYOUT SAFE)
   Archivo: src/views/facturas/facturas.detail.template.js

   Responsabilidades:
   - renderizar el modal de detalle de factura
   - renderizar bloques meta reutilizables del detalle
   - soportar loading / vacío / detalle completo
   - mantener coherencia visual con facturas.template.js
   - respetar offsets reales del layout shell
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
  const code = safeText(currency, "EUR") || "EUR";

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

function getClienteDireccion(factura = {}) {
  return (
    [
      factura?.cliente?.direccion?.calle,
      factura?.cliente?.direccion?.linea2,
      factura?.cliente?.direccion?.cp,
      factura?.cliente?.direccion?.ciudad,
      factura?.cliente?.direccion?.provincia,
      factura?.cliente?.direccion?.pais,
    ]
      .filter(Boolean)
      .join(", ") || "—"
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

    case "borrador":
    case "draft":
      return "Borrador";

    case "cancelada":
    case "cancelled":
      return "Cancelada";

    case "abonada":
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
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 24%, transparent);
    `;
  }

  if (["pending", "pendiente", "partial", "parcial"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 24%, transparent);
    `;
  }

  if (["overdue", "vencida"].includes(key)) {
    return `
      color:var(--danger-strong, #ff6b6b);
      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 24%, transparent);
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
      border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, transparent);
    `;
  }

  if (["borrador", "draft"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 24%, transparent);
    `;
  }

  if (["cancelada", "cancelled"].includes(key)) {
    return `
      color:var(--danger-strong, #ff6b6b);
      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 24%, transparent);
    `;
  }

  return `
    color:var(--text-soft);
    background:var(--surface-glass);
    border:1px solid var(--border-soft);
  `;
}

function renderStatusChip(label = "", style = "") {
  return `
    <span
      style="
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:30px;
        padding:0 10px;
        border-radius:999px;
        font-size:12px;
        font-weight:var(--weight-bold);
        letter-spacing:.05em;
        text-transform:uppercase;
        white-space:nowrap;
        ${style}
      "
    >
      ${escapeHtml(label)}
    </span>
  `;
}

export function renderMiniMeta(label = "", value = "") {
  return `
    <div
      style="
        display:grid;
        gap:4px;
        padding:12px 14px;
        border-radius:14px;
        border:1px solid var(--border-soft);
        background:var(--surface-glass);
      "
    >
      <span
        style="
          font-size:11px;
          color:var(--text-faint);
          font-weight:var(--weight-bold);
          letter-spacing:.04em;
          text-transform:uppercase;
        "
      >
        ${escapeHtml(label)}
      </span>

      <span
        style="
          color:var(--text-strong);
          font-weight:var(--weight-semibold);
          line-height:1.45;
          word-break:break-word;
        "
      >
        ${escapeHtml(value)}
      </span>
    </div>
  `;
}

export function renderDetailStat(label = "", value = "") {
  return `
    <article
      style="
        display:grid;
        gap:6px;
        min-height:96px;
        padding:16px;
        border-radius:18px;
        border:1px solid var(--border-soft);
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--surface-2, transparent) 50%, transparent), transparent),
          var(--surface-glass);
      "
    >
      <span
        style="
          font-size:12px;
          color:var(--text-dim);
          font-weight:var(--weight-bold);
          letter-spacing:.05em;
          text-transform:uppercase;
        "
      >
        ${escapeHtml(label)}
      </span>

      <strong
        style="
          font-size:var(--font-xl);
          line-height:1.1;
          color:var(--text-strong);
          font-weight:var(--weight-black);
          word-break:break-word;
        "
      >
        ${escapeHtml(value)}
      </strong>
    </article>
  `;
}

function renderSectionCard({
  title = "",
  subtitle = "",
  content = "",
} = {}) {
  return `
    <section
      class="panel-surface"
      style="
        padding:20px;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
      "
    >
      <div style="display:grid; gap:var(--space-md);">
        <div style="display:grid; gap:6px;">
          <h3
            style="
              margin:0;
              color:var(--text-strong);
              font-size:clamp(18px, 2vw, 22px);
              line-height:1.1;
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
                    font-size:var(--font-sm);
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
      </div>
    </section>
  `;
}

function renderLoadingContent() {
  return `
    <div style="padding:24px; display:grid; gap:18px;">
      <div
        style="
          display:grid;
          gap:14px;
          padding-bottom:18px;
          border-bottom:1px solid var(--border-soft);
        "
      >
        <div style="height:26px; width:180px; border-radius:999px; background:var(--surface-glass);"></div>
        <div style="height:38px; width:min(420px, 100%); border-radius:14px; background:var(--surface-glass);"></div>
        <div style="height:14px; width:min(520px, 100%); border-radius:999px; background:var(--surface-glass);"></div>
      </div>

      <div
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
          gap:12px;
        "
      >
        ${Array.from({ length: 6 })
          .map(
            () => `
              <div style="height:96px; border-radius:18px; background:var(--surface-glass);"></div>
            `
          )
          .join("")}
      </div>

      <div
        style="
          display:grid;
          grid-template-columns:1.15fr .85fr;
          gap:18px;
        "
        class="facturas-detail-loading-grid"
      >
        <div style="height:260px; border-radius:22px; background:var(--surface-glass);"></div>
        <div style="display:grid; gap:18px;">
          <div style="height:220px; border-radius:22px; background:var(--surface-glass);"></div>
          <div style="height:240px; border-radius:22px; background:var(--surface-glass);"></div>
        </div>
      </div>
    </div>
  `;
}

function renderEmptyContent() {
  return `
    <div style="padding:24px;">
      <section
        class="panel-surface"
        style="
          display:grid;
          gap:10px;
          padding:24px;
          border-radius:var(--panel-radius);
          border:1px solid var(--border-soft);
          background:var(--surface-1, var(--surface-glass));
        "
      >
        <h3
          style="
            margin:0;
            color:var(--text-strong);
            font-size:clamp(22px, 3vw, 28px);
            letter-spacing:-.03em;
          "
        >
          No hay detalle disponible
        </h3>

        <p
          style="
            margin:0;
            color:var(--text-dim);
            line-height:1.65;
          "
        >
          No se ha encontrado información suficiente para renderizar el detalle de esta factura.
        </p>
      </section>
    </div>
  `;
}

function renderLineasSection({ factura, lineas }) {
  const content = lineas.length
    ? `
      <div style="display:grid; gap:12px;">
        ${lineas
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
                    align-items:flex-start;
                    flex-wrap:wrap;
                  "
                >
                  <div style="display:grid; gap:4px; min-width:0;">
                    <strong
                      style="
                        color:var(--text-strong);
                        font-size:var(--font-base);
                        line-height:1.3;
                        word-break:break-word;
                      "
                    >
                      ${escapeHtml(linea?.concepto || "Línea")}
                    </strong>

                    <span
                      style="
                        color:var(--text-dim);
                        font-size:var(--font-sm);
                        line-height:1.55;
                        word-break:break-word;
                      "
                    >
                      ${escapeHtml(linea?.descripcion || "Sin descripción")}
                    </span>
                  </div>

                  <strong
                    style="
                      color:var(--text-strong);
                      font-size:var(--font-lg);
                      line-height:1.1;
                      white-space:nowrap;
                    "
                  >
                    ${escapeHtml(formatMoney(linea?.totalLinea, factura?.moneda))}
                  </strong>
                </div>

                <div
                  style="
                    display:grid;
                    grid-template-columns:repeat(auto-fit, minmax(120px, 1fr));
                    gap:10px;
                  "
                >
                  ${renderMiniMeta("Cantidad", String(safeNumber(linea?.cantidad, 0)))}
                  ${renderMiniMeta("Unitario", formatMoney(linea?.precioUnitario, factura?.moneda))}
                  ${renderMiniMeta("Subtotal", formatMoney(linea?.subtotal, factura?.moneda))}
                  ${renderMiniMeta("Impuesto", formatMoney(linea?.impuesto, factura?.moneda))}
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    `
    : `
      <p style="margin:0; color:var(--text-dim); line-height:1.65;">
        No hay líneas disponibles para esta factura.
      </p>
    `;

  return renderSectionCard({
    title: "Líneas",
    subtitle: "Desglose principal del documento.",
    content,
  });
}

function renderClienteSection({ factura }) {
  return renderSectionCard({
    title: "Cliente",
    subtitle: "Datos de facturación del destinatario.",
    content: `
      <div style="display:grid; gap:10px;">
        ${renderMiniMeta("Empresa", getClienteNombre(factura))}
        ${renderMiniMeta("Email", safeText(factura?.cliente?.email, "—"))}
        ${renderMiniMeta("NIF", safeText(factura?.cliente?.nif, "—"))}
        ${renderMiniMeta("Teléfono", safeText(factura?.cliente?.telefono, "—"))}
        ${renderMiniMeta("Dirección", getClienteDireccion(factura))}
      </div>
    `,
  });
}

function renderResumenSection({ factura, impuestos }) {
  return renderSectionCard({
    title: "Resumen",
    subtitle: "Totales y trazabilidad del documento.",
    content: `
      <div style="display:grid; gap:10px;">
        ${renderMiniMeta("Subtotal", formatMoney(factura?.subtotal || factura?.baseImponible, factura?.moneda))}
        ${renderMiniMeta("Impuestos", formatMoney(factura?.impuestosTotal || factura?.iva, factura?.moneda))}
        ${renderMiniMeta("Descuento", formatMoney(factura?.descuentoTotal, factura?.moneda))}
        ${renderMiniMeta("Total", formatMoney(factura?.total, factura?.moneda))}
        ${renderMiniMeta("Actualizado", formatDateTime(factura?.updatedAt))}
        ${renderMiniMeta("Enviado a", safeText(factura?.enviadoA, "—"))}

        ${
          impuestos.length
            ? `
              <div
                style="
                  display:grid;
                  gap:10px;
                  margin-top:4px;
                "
              >
                <strong
                  style="
                    color:var(--text-strong);
                    font-size:var(--font-base);
                    line-height:1.2;
                  "
                >
                  Impuestos
                </strong>

                ${impuestos
                  .map(
                    (item) => `
                      <div
                        style="
                          display:flex;
                          justify-content:space-between;
                          gap:12px;
                          align-items:flex-start;
                          padding:12px 14px;
                          border-radius:14px;
                          border:1px solid var(--border-soft);
                          background:var(--surface-glass);
                        "
                      >
                        <span
                          style="
                            color:var(--text-soft);
                            line-height:1.45;
                            word-break:break-word;
                          "
                        >
                          ${escapeHtml(item?.nombre || item?.tipo || "Impuesto")} · ${escapeHtml(String(item?.porcentaje || 0))}%
                        </span>

                        <strong
                          style="
                            color:var(--text-strong);
                            white-space:nowrap;
                          "
                        >
                          ${escapeHtml(formatMoney(item?.importe, factura?.moneda))}
                        </strong>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            `
            : ""
        }
      </div>
    `,
  });
}

function renderHeaderActions({ factura, sending = false, canUsePdf = true }) {
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
        data-factura-id="${escapeHtml(factura?.id || "")}"
        ${canUsePdf ? "" : "disabled"}
        style="
          min-height:40px;
          padding:0 14px;
          border-radius:var(--btn-radius);
          border:1px solid var(--btn-secondary-border, var(--border-soft));
          background:var(--btn-secondary-bg, var(--surface-glass));
          color:var(--btn-secondary-text, var(--text-soft));
          font-weight:var(--weight-bold);
          cursor:${canUsePdf ? "pointer" : "not-allowed"};
          opacity:${canUsePdf ? "1" : ".56"};
        "
      >
        Ver PDF
      </button>

      <button
        type="button"
        data-action="download-factura"
        data-factura-id="${escapeHtml(factura?.id || "")}"
        ${canUsePdf ? "" : "disabled"}
        style="
          min-height:40px;
          padding:0 14px;
          border-radius:var(--btn-radius);
          border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
          background:var(--btn-primary-bg, var(--accent, #7c5cff));
          color:var(--btn-primary-text, #fff);
          font-weight:var(--weight-bold);
          cursor:${canUsePdf ? "pointer" : "not-allowed"};
          opacity:${canUsePdf ? "1" : ".56"};
        "
      >
        Descargar
      </button>

      <button
        type="button"
        data-action="send-factura"
        data-factura-id="${escapeHtml(factura?.id || "")}"
        style="
          min-height:40px;
          padding:0 14px;
          border-radius:var(--btn-radius);
          border:1px solid var(--btn-secondary-border, var(--border-soft));
          background:var(--btn-secondary-bg, var(--surface-glass));
          color:var(--btn-secondary-text, var(--text-soft));
          font-weight:var(--weight-bold);
          cursor:pointer;
        "
      >
        ${sending ? "Enviando..." : "Enviar"}
      </button>

      <button
        type="button"
        data-action="close-factura-detail"
        style="
          min-height:40px;
          padding:0 14px;
          border-radius:var(--btn-radius);
          border:1px solid var(--border-soft);
          background:var(--surface-glass);
          color:var(--text-soft);
          font-weight:var(--weight-bold);
          cursor:pointer;
        "
      >
        Cerrar
      </button>
    </div>
  `;
}

export function renderFacturasDetailContent({
  factura = null,
  loading = false,
  sendingFacturaId = "",
} = {}) {
  if (loading) {
    return renderLoadingContent();
  }

  if (!factura) {
    return renderEmptyContent();
  }

  const lineas = safeArray(factura?.lineas);
  const impuestos = safeArray(factura?.impuestos);
  const sending = String(sendingFacturaId) === String(factura?.id);
  const canUsePdf = Boolean(factura?.pdfAvailable || factura?.blobPath);
  const clienteNombre = getClienteNombre(factura);

  return `
    <div style="display:grid; gap:var(--space-lg);">
      <header
        class="facturas-detail-header"
        style="
          position:sticky;
          top:0;
          z-index:2;
          display:grid;
          gap:18px;
          padding:24px 24px 20px;
          border-bottom:1px solid var(--border-soft);
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 7%, transparent), transparent 70%),
            var(--modal-bg, var(--surface-1, var(--surface-glass)));
          backdrop-filter:blur(16px);
          -webkit-backdrop-filter:blur(16px);
        "
      >
        <div
          style="
            display:flex;
            justify-content:space-between;
            gap:18px;
            align-items:flex-start;
            flex-wrap:wrap;
          "
        >
          <div style="display:grid; gap:10px; min-width:min(100%, 560px);">
            <span
              style="
                display:inline-flex;
                align-items:center;
                width:max-content;
                min-height:28px;
                padding:0 10px;
                border-radius:999px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
                color:var(--text-dim);
                font-size:12px;
                font-weight:var(--weight-bold);
                letter-spacing:.05em;
                text-transform:uppercase;
              "
            >
              Factura ${escapeHtml(safeText(factura?.numero, "—"))}
            </span>

            <div style="display:grid; gap:8px;">
              <h2
                style="
                  margin:0;
                  font-size:clamp(26px, 4vw, 38px);
                  line-height:1.02;
                  color:var(--text-strong);
                  letter-spacing:-.04em;
                  word-break:break-word;
                "
              >
                ${escapeHtml(clienteNombre)}
              </h2>

              <p
                style="
                  margin:0;
                  color:var(--text-dim);
                  line-height:1.65;
                  max-width:860px;
                "
              >
                ${escapeHtml(safeText(factura?.preview, "Documento fiscal listo para consulta."))}
              </p>
            </div>
          </div>

          ${renderHeaderActions({
            factura,
            sending,
            canUsePdf,
          })}
        </div>

        <div
          style="
            display:flex;
            gap:10px;
            flex-wrap:wrap;
            align-items:center;
          "
        >
          ${renderStatusChip(
            getEstadoPagoLabel(factura?.estadoPago),
            getEstadoPagoChipStyle(factura?.estadoPago)
          )}

          ${renderStatusChip(
            getEstadoLabel(factura?.estado),
            getEstadoChipStyle(factura?.estado)
          )}
        </div>
      </header>

      <div style="display:grid; gap:var(--space-lg); padding:0 24px 24px;">
        <div
          style="
            display:grid;
            grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
            gap:var(--space-md);
          "
        >
          ${renderDetailStat("Fecha", formatDate(factura?.fecha))}
          ${renderDetailStat("Estado pago", getEstadoPagoLabel(factura?.estadoPago))}
          ${renderDetailStat("Estado", getEstadoLabel(factura?.estado))}
          ${renderDetailStat("Método pago", safeText(factura?.formaPago, "—"))}
          ${renderDetailStat("Total", formatMoney(factura?.total, factura?.moneda))}
          ${renderDetailStat("Base", formatMoney(factura?.baseImponible ?? factura?.subtotal, factura?.moneda))}
        </div>

        <div
          class="facturas-detail-grid"
          style="
            display:grid;
            grid-template-columns:minmax(0, 1.15fr) minmax(320px, .85fr);
            gap:var(--space-lg);
            align-items:start;
          "
        >
          ${renderLineasSection({ factura, lineas })}

          <div style="display:grid; gap:var(--space-lg);">
            ${renderClienteSection({ factura })}
            ${renderResumenSection({ factura, impuestos })}
          </div>
        </div>
      </div>
    </div>

    <style>
      @media (max-width: 980px) {
        .facturas-detail-grid,
        .facturas-detail-loading-grid {
          grid-template-columns: 1fr !important;
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
        top:calc(var(--topbar-height, 56px) + var(--topbar-view-height, 0px) + var(--tablehead-height, 0px) + 8px);
        right:0;
        bottom:0;
        left:var(--sidebar-current-width, var(--sidebar-width, 260px));
        z-index:calc(var(--z-modal, 50) - 1);
        display:grid;
        place-items:start center;
        padding:20px;
        background:color-mix(in srgb, var(--backdrop-bg, rgba(6,10,18,.56)) 88%, transparent);
        backdrop-filter:blur(10px);
        -webkit-backdrop-filter:blur(10px);
        overflow:auto;
      "
    >
      <div
        class="facturas-detail-modal"
        data-role="facturas-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de factura"
        style="
          width:min(1120px, 100%);
          max-height:100%;
          overflow:auto;
          border-radius:var(--modal-radius, 24px);
          border:1px solid var(--border-soft);
          background:var(--modal-bg, var(--surface-1, var(--surface-glass)));
          box-shadow:var(--shadow-lg);
        "
      >
        ${renderFacturasDetailContent({
          factura,
          loading: detailLoading,
          sendingFacturaId,
        })}
      </div>

      <style>
        @media (max-width: 980px) {
          .facturas-detail-overlay {
            left: 0 !important;
            top: calc(var(--topbar-height, 56px) + var(--topbar-view-height, 0px) + 6px) !important;
            padding: 12px !important;
            place-items: start stretch !important;
          }

          .facturas-detail-modal {
            width: 100% !important;
            max-height: 100% !important;
            border-radius: 18px !important;
          }
        }

        @media (max-width: 640px) {
          .facturas-detail-header {
            padding: 18px 18px 16px !important;
          }

          .facturas-detail-modal [style*="padding:0 24px 24px"] {
            padding: 0 18px 18px !important;
          }
        }
      </style>
    </div>
  `;
}
