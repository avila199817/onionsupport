/* =========================================================
   Onion SPA - Facturas Detail Template
   Archivo: src/views/facturas/facturas.detail.template.js

   Responsabilidades:
   - renderizar el modal premium de detalle de factura
   - mantener una presentación robusta dentro del shell real
   - respetar offsets reales de sidebar / topbar / table-head
   - soportar loading / vacío / detalle completo
   - mantener scroll interno limpio y layout estable
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
        min-width:0;
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
        gap:8px;
        min-height:104px;
        padding:16px;
        border-radius:18px;
        border:1px solid var(--border-soft);
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--surface-2, transparent) 50%, transparent), transparent),
          var(--surface-glass);
        min-width:0;
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
          font-size:clamp(22px, 2vw, 28px);
          line-height:1.08;
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
        min-width:0;
      "
    >
      <div style="display:grid; gap:var(--space-md); min-width:0;">
        <div style="display:grid; gap:6px; min-width:0;">
          <h3
            style="
              margin:0;
              color:var(--text-strong);
              font-size:clamp(18px, 2vw, 22px);
              line-height:1.1;
              letter-spacing:-.02em;
              word-break:break-word;
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
    <div class="facturas-detail-body-shell">
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
                <div style="height:104px; border-radius:18px; background:var(--surface-glass);"></div>
              `
            )
            .join("")}
        </div>

        <div
          class="facturas-detail-loading-grid"
          style="
            display:grid;
            grid-template-columns:minmax(0, 1.15fr) minmax(320px, .85fr);
            gap:18px;
          "
        >
          <div style="height:260px; border-radius:22px; background:var(--surface-glass);"></div>
          <div style="display:grid; gap:18px;">
            <div style="height:220px; border-radius:22px; background:var(--surface-glass);"></div>
            <div style="height:240px; border-radius:22px; background:var(--surface-glass);"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderEmptyContent() {
  return `
    <div class="facturas-detail-body-shell">
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
    </div>
  `;
}

function renderLineasSection({ factura, lineas }) {
  const content = lineas.length
    ? `
      <div style="display:grid; gap:12px; min-width:0;">
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
                  min-width:0;
                "
              >
                <div
                  style="
                    display:flex;
                    justify-content:space-between;
                    gap:12px;
                    align-items:flex-start;
                    flex-wrap:wrap;
                    min-width:0;
                  "
                >
                  <div style="display:grid; gap:4px; min-width:0; flex:1 1 320px;">
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
                      flex:0 0 auto;
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
                    min-width:0;
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
      <div style="display:grid; gap:10px; min-width:0;">
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
      <div style="display:grid; gap:10px; min-width:0;">
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
                  min-width:0;
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
                            min-width:0;
                          "
                        >
                          ${escapeHtml(item?.nombre || item?.tipo || "Impuesto")} · ${escapeHtml(String(item?.porcentaje || 0))}%
                        </span>

                        <strong
                          style="
                            color:var(--text-strong);
                            white-space:nowrap;
                            flex:0 0 auto;
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
      class="facturas-detail-actions"
      style="
        display:flex;
        gap:10px;
        flex-wrap:wrap;
        align-items:center;
        justify-content:flex-end;
      "
    >
      <button
        type="button"
        data-action="view-factura-pdf"
        data-factura-id="${escapeHtml(factura?.id || "")}"
        ${canUsePdf ? "" : "disabled"}
        style="
          min-height:42px;
          padding:0 16px;
          border-radius:var(--btn-radius);
          border:1px solid var(--btn-secondary-border, var(--border-soft));
          background:var(--btn-secondary-bg, var(--surface-glass));
          color:var(--btn-secondary-text, var(--text-soft));
          font-weight:var(--weight-bold);
          cursor:${canUsePdf ? "pointer" : "not-allowed"};
          opacity:${canUsePdf ? "1" : ".56"};
          white-space:nowrap;
          transition:
            transform var(--duration-fast, .18s) var(--ease-standard, ease),
            border-color var(--duration-fast, .18s) var(--ease-standard, ease),
            background var(--duration-fast, .18s) var(--ease-standard, ease);
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
          min-height:42px;
          padding:0 16px;
          border-radius:var(--btn-radius);
          border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
          background:var(--btn-primary-bg, var(--accent, #7c5cff));
          color:var(--btn-primary-text, #fff);
          font-weight:var(--weight-bold);
          cursor:${canUsePdf ? "pointer" : "not-allowed"};
          opacity:${canUsePdf ? "1" : ".56"};
          white-space:nowrap;
          box-shadow:0 10px 24px color-mix(in srgb, var(--accent, #7c5cff) 22%, transparent);
          transition:
            transform var(--duration-fast, .18s) var(--ease-standard, ease),
            filter var(--duration-fast, .18s) var(--ease-standard, ease);
        "
      >
        Descargar
      </button>

      <button
        type="button"
        data-action="send-factura"
        data-factura-id="${escapeHtml(factura?.id || "")}"
        style="
          min-height:42px;
          padding:0 16px;
          border-radius:var(--btn-radius);
          border:1px solid var(--btn-secondary-border, var(--border-soft));
          background:var(--btn-secondary-bg, var(--surface-glass));
          color:var(--btn-secondary-text, var(--text-soft));
          font-weight:var(--weight-bold);
          cursor:pointer;
          white-space:nowrap;
          transition:
            transform var(--duration-fast, .18s) var(--ease-standard, ease),
            border-color var(--duration-fast, .18s) var(--ease-standard, ease),
            background var(--duration-fast, .18s) var(--ease-standard, ease);
        "
      >
        ${sending ? "Enviando..." : "Enviar"}
      </button>

      <button
        type="button"
        data-action="close-factura-detail"
        style="
          min-height:42px;
          padding:0 16px;
          border-radius:var(--btn-radius);
          border:1px solid var(--border-soft);
          background:var(--surface-glass);
          color:var(--text-soft);
          font-weight:var(--weight-bold);
          cursor:pointer;
          white-space:nowrap;
          transition:
            transform var(--duration-fast, .18s) var(--ease-standard, ease),
            border-color var(--duration-fast, .18s) var(--ease-standard, ease),
            background var(--duration-fast, .18s) var(--ease-standard, ease);
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
    <div
      class="facturas-detail-shell"
      style="
        display:flex;
        flex-direction:column;
        min-height:0;
        height:100%;
      "
    >
      <header
        class="facturas-detail-header"
        style="
          position:sticky;
          top:0;
          z-index:3;
          display:grid;
          gap:18px;
          padding:24px 24px 20px;
          border-bottom:1px solid var(--border-soft);
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 7%, transparent), transparent 70%),
            color-mix(in srgb, var(--modal-bg, var(--surface-1, var(--surface-glass))) 92%, transparent);
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
          <div
            style="
              display:grid;
              gap:10px;
              min-width:0;
              flex:1 1 560px;
            "
          >
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
                max-width:100%;
              "
            >
              Factura ${escapeHtml(safeText(factura?.numero, "—"))}
            </span>

            <div style="display:grid; gap:8px; min-width:0;">
              <h2
                style="
                  margin:0;
                  font-size:clamp(28px, 4vw, 42px);
                  line-height:.98;
                  color:var(--text-strong);
                  letter-spacing:-.045em;
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
                  word-break:break-word;
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
            display:grid;
            gap:var(--space-lg);
            padding:24px;
          "
        >
          <div
            style="
              display:grid;
              grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
              gap:var(--space-md);
              min-width:0;
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
              grid-template-columns:minmax(0, 1.18fr) minmax(320px, .82fr);
              gap:var(--space-lg);
              align-items:start;
              min-width:0;
            "
          >
            ${renderLineasSection({ factura, lineas })}

            <div style="display:grid; gap:var(--space-lg); min-width:0;">
              ${renderClienteSection({ factura })}
              ${renderResumenSection({ factura, impuestos })}
            </div>
          </div>
        </div>
      </div>
    </div>

    <style>
      .facturas-detail-overlay{
        --facturas-detail-gap:16px;
      }

      .facturas-detail-modal{
        scrollbar-width:thin;
        scrollbar-color:var(--scrollbar-thumb) transparent;
      }

      .facturas-detail-body-shell{
        scrollbar-width:thin;
        scrollbar-color:var(--scrollbar-thumb) transparent;
      }

      .facturas-detail-modal::-webkit-scrollbar,
      .facturas-detail-body-shell::-webkit-scrollbar{
        width:10px;
        height:10px;
      }

      .facturas-detail-modal::-webkit-scrollbar-track,
      .facturas-detail-body-shell::-webkit-scrollbar-track{
        background:transparent;
      }

      .facturas-detail-modal::-webkit-scrollbar-thumb,
      .facturas-detail-body-shell::-webkit-scrollbar-thumb{
        background:var(--scrollbar-thumb);
        border-radius:999px;
        border:2px solid transparent;
        background-clip:padding-box;
      }

      .facturas-detail-modal::-webkit-scrollbar-thumb:hover,
      .facturas-detail-body-shell::-webkit-scrollbar-thumb:hover{
        background:var(--scrollbar-thumb-hover);
        background-clip:padding-box;
      }

      @media (max-width: 1180px) {
        .facturas-detail-grid,
        .facturas-detail-loading-grid {
          grid-template-columns: 1fr !important;
        }
      }

      @media (max-width: 980px) {
        .facturas-detail-actions {
          justify-content:flex-start !important;
          width:100%;
        }
      }

      @media (max-width: 640px) {
        .facturas-detail-header {
          padding:18px 18px 16px !important;
        }

        .facturas-detail-body-shell > div {
          padding:18px !important;
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
        inset-block-start:calc(var(--app-offset-topbar, var(--topbar-height, 56px)) + var(--app-offset-tablehead, 0px) + 12px);
        inset-inline-end:16px;
        inset-block-end:16px;
        inset-inline-start:calc(var(--app-sidebar-current-width, var(--sidebar-width, 260px)) + 16px);
        z-index:calc(var(--z-modal, 50) + 20);
        display:grid;
        place-items:start center;
        padding:0;
        background:color-mix(in srgb, var(--backdrop-bg, rgba(6,10,18,.56)) 86%, transparent);
        backdrop-filter:blur(10px);
        -webkit-backdrop-filter:blur(10px);
        overflow:hidden;
      "
    >
      <div
        class="facturas-detail-modal"
        data-role="facturas-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de factura"
        style="
          inline-size:min(1180px, 100%);
          block-size:100%;
          max-block-size:100%;
          min-inline-size:0;
          overflow:hidden;
          border-radius:var(--modal-radius, 24px);
          border:1px solid color-mix(in srgb, var(--border-soft) 88%, transparent);
          background:
            linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01)),
            var(--modal-bg, var(--surface-1, var(--surface-glass)));
          box-shadow:
            0 20px 60px rgba(0,0,0,.22),
            0 8px 24px rgba(0,0,0,.14),
            inset 0 1px 0 rgba(255,255,255,.05);
          display:flex;
          flex-direction:column;
          min-height:0;
          isolation:isolate;
        "
      >
        ${renderFacturasDetailContent({
          factura,
          loading: detailLoading,
          sendingFacturaId,
        })}
      </div>

      <style>
        @media (max-width: 900px) {
          .facturas-detail-overlay {
            inset-inline-start: 12px !important;
            inset-inline-end: 12px !important;
            inset-block-start: calc(var(--app-offset-topbar, var(--topbar-height, 56px)) + 8px) !important;
            inset-block-end: 12px !important;
          }

          .facturas-detail-modal {
            inline-size: 100% !important;
            border-radius: 20px !important;
          }
        }

        @media (max-width: 640px) {
          .facturas-detail-overlay {
            inset-inline-start: 8px !important;
            inset-inline-end: 8px !important;
            inset-block-start: calc(var(--app-offset-topbar, var(--topbar-height, 56px)) + 6px) !important;
            inset-block-end: 8px !important;
          }

          .facturas-detail-modal {
            border-radius: 18px !important;
          }
        }
      </style>
    </div>
  `;
}
