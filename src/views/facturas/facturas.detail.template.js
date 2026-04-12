/* =========================================================
   Onion SPA - Facturas Detail Template (FINAL PRO CLEAN)
   Archivo: src/views/facturas/facturas.detail.template.js

   Responsabilidades:
   - renderizar el modal de detalle de factura
   - renderizar bloques meta reutilizables del detalle
   - soportar loading / vacío / detalle completo
   - mantener coherencia visual con facturas.template.js
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

export function renderMiniMeta(label = "", value = "") {
  return `
    <div
      style="
        display:grid;
        gap:4px;
        padding:12px;
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
        border-radius:20px;
        border:1px solid var(--border-soft);
        background:var(--surface-glass);
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

function renderLoadingContent() {
  return `
    <div style="padding:24px; display:grid; gap:16px;">
      <div style="height:30px; width:220px; border-radius:12px; background:var(--surface-glass);"></div>
      <div style="height:90px; border-radius:18px; background:var(--surface-glass);"></div>
      <div style="height:220px; border-radius:18px; background:var(--surface-glass);"></div>
    </div>
  `;
}

function renderEmptyContent() {
  return `
    <div style="padding:24px;">
      <p style="margin:0; color:var(--text-dim);">No hay detalle disponible.</p>
    </div>
  `;
}

function renderLineasSection({ factura, lineas }) {
  return `
    <section
      class="panel-surface"
      style="padding:20px; border-radius:var(--panel-radius);"
    >
      <div style="display:grid; gap:var(--space-md);">
        <div>
          <h3 style="margin:0 0 6px; color:var(--text-strong);">Líneas</h3>
          <p style="margin:0; color:var(--text-dim); font-size:var(--font-sm);">
            Desglose principal del documento.
          </p>
        </div>

        ${
          lineas.length
            ? `
              <div style="display:grid; gap:12px;">
                ${lineas
                  .map(
                    (linea) => `
                      <article
                        style="
                          display:grid;
                          gap:10px;
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
                          <div style="display:grid; gap:4px;">
                            <strong style="color:var(--text-strong); font-size:var(--font-base);">
                              ${escapeHtml(linea.concepto || "Línea")}
                            </strong>
                            <span style="color:var(--text-dim); font-size:var(--font-sm);">
                              ${escapeHtml(linea.descripcion || "Sin descripción")}
                            </span>
                          </div>

                          <strong style="color:var(--text-strong); font-size:var(--font-lg);">
                            ${escapeHtml(formatMoney(linea.totalLinea, factura.moneda))}
                          </strong>
                        </div>

                        <div
                          style="
                            display:grid;
                            grid-template-columns:repeat(auto-fit, minmax(120px,1fr));
                            gap:10px;
                          "
                        >
                          ${renderMiniMeta("Cantidad", String(linea.cantidad))}
                          ${renderMiniMeta("Unitario", formatMoney(linea.precioUnitario, factura.moneda))}
                          ${renderMiniMeta("Subtotal", formatMoney(linea.subtotal, factura.moneda))}
                          ${renderMiniMeta("Impuesto", formatMoney(linea.impuesto, factura.moneda))}
                        </div>
                      </article>
                    `
                  )
                  .join("")}
              </div>
            `
            : `
              <p style="margin:0; color:var(--text-dim);">No hay líneas disponibles.</p>
            `
        }
      </div>
    </section>
  `;
}

function renderClienteSection({ factura }) {
  return `
    <section
      class="panel-surface"
      style="padding:20px; border-radius:var(--panel-radius);"
    >
      <div style="display:grid; gap:var(--space-md);">
        <div>
          <h3 style="margin:0 0 6px; color:var(--text-strong);">Cliente</h3>
          <p style="margin:0; color:var(--text-dim); font-size:var(--font-sm);">
            Datos de facturación del destinatario.
          </p>
        </div>

        ${renderMiniMeta("Empresa", factura.cliente?.empresa || factura.cliente?.nombre || "—")}
        ${renderMiniMeta("Email", factura.cliente?.email || "—")}
        ${renderMiniMeta("NIF", factura.cliente?.nif || "—")}
        ${renderMiniMeta("Teléfono", factura.cliente?.telefono || "—")}
        ${renderMiniMeta(
          "Dirección",
          [
            factura.cliente?.direccion?.calle,
            factura.cliente?.direccion?.linea2,
            factura.cliente?.direccion?.cp,
            factura.cliente?.direccion?.ciudad,
            factura.cliente?.direccion?.provincia,
            factura.cliente?.direccion?.pais,
          ]
            .filter(Boolean)
            .join(", ") || "—"
        )}
      </div>
    </section>
  `;
}

function renderResumenSection({ factura, impuestos }) {
  return `
    <section
      class="panel-surface"
      style="padding:20px; border-radius:var(--panel-radius);"
    >
      <div style="display:grid; gap:var(--space-md);">
        <div>
          <h3 style="margin:0 0 6px; color:var(--text-strong);">Resumen</h3>
          <p style="margin:0; color:var(--text-dim); font-size:var(--font-sm);">
            Totales y trazabilidad.
          </p>
        </div>

        ${renderMiniMeta("Subtotal", formatMoney(factura.subtotal || factura.baseImponible, factura.moneda))}
        ${renderMiniMeta("Impuestos", formatMoney(factura.impuestosTotal || factura.iva, factura.moneda))}
        ${renderMiniMeta("Descuento", formatMoney(factura.descuentoTotal, factura.moneda))}
        ${renderMiniMeta("Total", formatMoney(factura.total, factura.moneda))}
        ${renderMiniMeta("Actualizado", formatDateTime(factura.updatedAt))}
        ${renderMiniMeta("Enviado a", factura.enviadoA || "—")}

        ${
          impuestos.length
            ? `
              <div style="display:grid; gap:10px;">
                <strong style="color:var(--text-strong);">Impuestos</strong>
                ${impuestos
                  .map(
                    (item) => `
                      <div
                        style="
                          display:flex;
                          justify-content:space-between;
                          gap:12px;
                          padding:12px;
                          border-radius:14px;
                          border:1px solid var(--border-soft);
                          background:var(--surface-glass);
                        "
                      >
                        <span style="color:var(--text-soft);">
                          ${escapeHtml(item.nombre || item.tipo || "Impuesto")} · ${escapeHtml(String(item.porcentaje || 0))}%
                        </span>
                        <strong style="color:var(--text-strong);">
                          ${escapeHtml(formatMoney(item.importe, factura.moneda))}
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
    </section>
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

  const lineas = safeArray(factura.lineas);
  const impuestos = safeArray(factura.impuestos);
  const sending = String(sendingFacturaId) === String(factura.id);

  return `
    <div style="display:grid; gap:var(--space-lg); padding:24px;">
      <div
        style="
          display:flex;
          justify-content:space-between;
          gap:16px;
          align-items:flex-start;
          flex-wrap:wrap;
        "
      >
        <div style="display:grid; gap:8px;">
          <span
            style="
              display:inline-flex;
              align-items:center;
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
              width:max-content;
            "
          >
            Factura ${escapeHtml(factura.numero)}
          </span>

          <h2
            style="
              margin:0;
              font-size:clamp(26px, 4vw, 36px);
              line-height:1.05;
              color:var(--text-strong);
              letter-spacing:-.03em;
            "
          >
            ${escapeHtml(factura.cliente?.empresa || factura.cliente?.nombre || "Cliente")}
          </h2>

          <p style="margin:0; color:var(--text-muted);">
            ${escapeHtml(factura.preview || "Documento fiscal listo para consulta.")}
          </p>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button
            type="button"
            data-action="view-factura-pdf"
            data-factura-id="${escapeHtml(factura.id)}"
            style="
              min-height:40px;
              padding:0 14px;
              border-radius:var(--btn-radius);
              border:1px solid var(--btn-secondary-border);
              background:var(--btn-secondary-bg);
              color:var(--btn-secondary-text);
              font-weight:var(--weight-bold);
              cursor:pointer;
            "
          >
            Ver PDF
          </button>

          <button
            type="button"
            data-action="download-factura"
            data-factura-id="${escapeHtml(factura.id)}"
            style="
              min-height:40px;
              padding:0 14px;
              border-radius:var(--btn-radius);
              border:1px solid var(--btn-primary-border);
              background:var(--btn-primary-bg);
              color:var(--btn-primary-text);
              font-weight:var(--weight-bold);
              cursor:pointer;
            "
          >
            Descargar
          </button>

          <button
            type="button"
            data-action="send-factura"
            data-factura-id="${escapeHtml(factura.id)}"
            style="
              min-height:40px;
              padding:0 14px;
              border-radius:var(--btn-radius);
              border:1px solid var(--btn-secondary-border);
              background:var(--btn-secondary-bg);
              color:var(--btn-secondary-text);
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
      </div>

      <div
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
          gap:var(--space-md);
        "
      >
        ${renderDetailStat("Fecha", formatDate(factura.fecha))}
        ${renderDetailStat("Estado pago", safeText(factura.estadoPago, "—"))}
        ${renderDetailStat("Estado", safeText(factura.estado, "—"))}
        ${renderDetailStat("Método pago", safeText(factura.formaPago, "—"))}
        ${renderDetailStat("Total", formatMoney(factura.total, factura.moneda))}
        ${renderDetailStat("Base", formatMoney(factura.baseImponible, factura.moneda))}
      </div>

      <div
        class="facturas-detail-grid"
        style="
          display:grid;
          grid-template-columns:1.15fr .85fr;
          gap:var(--space-lg);
        "
      >
        ${renderLineasSection({ factura, lineas })}

        <div style="display:grid; gap:var(--space-lg);">
          ${renderClienteSection({ factura })}
          ${renderResumenSection({ factura, impuestos })}
        </div>
      </div>
    </div>

    <style>
      @media (max-width: 980px) {
        .facturas-detail-grid {
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
        inset:0;
        z-index:var(--z-modal);
        background:var(--backdrop-bg);
        display:grid;
        place-items:center;
        padding:24px;
      "
    >
      <div
        class="facturas-detail-modal"
        data-role="facturas-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de factura"
        style="
          width:min(1080px, 100%);
          max-height:min(90vh, 920px);
          overflow:auto;
          border-radius:var(--modal-radius);
          border:1px solid var(--border-soft);
          background:var(--modal-bg);
          box-shadow:var(--shadow-lg);
        "
      >
        ${renderFacturasDetailContent({
          factura,
          loading: detailLoading,
          sendingFacturaId,
        })}
      </div>
    </div>
  `;
}
