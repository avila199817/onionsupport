/* =========================================================
   Onion SPA - Facturas Template (LEGENDARY CLIENT PORTAL UX)
   Archivo: src/views/facturas/facturas.template.js

   Responsabilidades:
   - render premium invoices portal UI
   - experiencia tipo empresa seria / SaaS enterprise
   - cards avanzadas con jerarquía visual
   - estados inteligentes
   - métricas de negocio
   - CTA claros para cliente final
   - markup limpio / escalable
========================================================= */

import {
  truncate,
  formatMoney,
  formatDate,
  formatRelativeDate,
  getEstadoPagoLabel,
  getEstadoLabel,
  getEstadoPagoChipStyle,
  getEstadoChipStyle,
} from "./facturas.model.js";

/* =========================================================
   HELPERS BASE
========================================================= */
function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeText(value, fallback = "—") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sum(items = [], key = "") {
  return items.reduce((acc, item) => acc + safeNumber(item?.[key], 0), 0);
}

function join(parts = []) {
  return parts.filter(Boolean).join("");
}

/* =========================================================
   TOKENS INLINE
========================================================= */
const styles = {
  btnPrimary: `
    min-height:42px;
    padding:0 14px;
    border-radius:14px;
    border:1px solid var(--btn-primary-border);
    background:var(--btn-primary-bg);
    color:var(--btn-primary-text);
    font-weight:700;
    cursor:pointer;
    box-shadow:var(--btn-primary-shadow);
  `,

  btnSecondary: `
    min-height:42px;
    padding:0 14px;
    border-radius:14px;
    border:1px solid var(--btn-secondary-border);
    background:var(--btn-secondary-bg);
    color:var(--btn-secondary-text);
    font-weight:700;
    cursor:pointer;
  `,

  statCard: `
    padding:18px;
    border-radius:20px;
    border:1px solid var(--border-soft);
    background:linear-gradient(
      180deg,
      var(--surface-2),
      var(--surface-1)
    );
    display:grid;
    gap:6px;
  `,

  statLabel: `
    font-size:12px;
    color:var(--text-dim);
    font-weight:700;
    letter-spacing:.04em;
    text-transform:uppercase;
  `,

  statValue: `
    font-size:24px;
    line-height:1;
    font-weight:800;
    color:var(--text-strong);
  `,

  card: `
    padding:20px;
    border-radius:24px;
    border:1px solid var(--border-soft);
    background:
      radial-gradient(circle at top right, rgba(255,255,255,.04), transparent 32%),
      linear-gradient(180deg,var(--surface-2),var(--surface-1));
    display:grid;
    gap:16px;
    position:relative;
    overflow:hidden;
  `,

  top: `
    display:flex;
    justify-content:space-between;
    gap:12px;
    align-items:flex-start;
  `,

  titleWrap: `
    display:grid;
    gap:5px;
    min-width:0;
  `,

  code: `
    font-size:12px;
    color:var(--text-dim);
    font-weight:700;
    letter-spacing:.06em;
    text-transform:uppercase;
  `,

  company: `
    margin:0;
    font-size:22px;
    line-height:1.1;
    color:var(--text-strong);
    font-weight:800;
  `,

  avatar: `
    width:48px;
    height:48px;
    border-radius:16px;
    display:grid;
    place-items:center;
    font-weight:800;
    border:1px solid var(--border-soft);
    background:var(--surface-glass);
    color:var(--text-strong);
  `,

  amountMain: `
    font-size:34px;
    line-height:1;
    font-weight:900;
    color:var(--text-strong);
  `,

  amountSub: `
    font-size:13px;
    color:var(--text-dim);
  `,

  row: `
    display:flex;
    gap:10px;
    flex-wrap:wrap;
    align-items:center;
    justify-content:space-between;
  `,

  metaGrid: `
    display:grid;
    grid-template-columns:repeat(auto-fit,minmax(140px,1fr));
    gap:10px;
  `,

  metaBox: `
    padding:12px;
    border-radius:16px;
    background:var(--surface-glass);
    border:1px solid var(--border-soft);
    display:grid;
    gap:4px;
  `,

  metaLabel: `
    font-size:11px;
    text-transform:uppercase;
    font-weight:700;
    color:var(--text-faint);
    letter-spacing:.04em;
  `,

  metaValue: `
    font-size:14px;
    font-weight:700;
    color:var(--text-strong);
  `,

  chip: `
    display:inline-flex;
    align-items:center;
    justify-content:center;
    min-height:30px;
    padding:6px 10px;
    border-radius:999px;
    border:1px solid var(--border-soft);
    font-size:12px;
    font-weight:700;
  `,

  footer: `
    display:flex;
    justify-content:space-between;
    align-items:center;
    gap:12px;
    flex-wrap:wrap;
    padding-top:6px;
  `,
};

/* =========================================================
   COMPONENTES
========================================================= */
function button(label, opts = {}) {
  const {
    id = "",
    action = "",
    facturaId = "",
    variant = "secondary",
  } = opts;

  const style =
    variant === "primary" ? styles.btnPrimary : styles.btnSecondary;

  return `
    <button
      type="button"
      ${id ? `id="${escapeHtml(id)}"` : ""}
      ${action ? `data-action="${escapeHtml(action)}"` : ""}
      ${facturaId ? `data-factura-id="${escapeHtml(facturaId)}"` : ""}
      style="${style}"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function chip(label, tone = "") {
  return `
    <span style="${styles.chip} ${tone}">
      ${escapeHtml(label)}
    </span>
  `;
}

function metric(label, value) {
  return `
    <article style="${styles.statCard}">
      <span style="${styles.statLabel}">
        ${escapeHtml(label)}
      </span>
      <strong style="${styles.statValue}">
        ${escapeHtml(value)}
      </strong>
    </article>
  `;
}

function meta(label, value) {
  return `
    <div style="${styles.metaBox}">
      <span style="${styles.metaLabel}">
        ${escapeHtml(label)}
      </span>
      <span style="${styles.metaValue}">
        ${escapeHtml(value)}
      </span>
    </div>
  `;
}

function avatar(name = "ON") {
  return `
    <div style="${styles.avatar}">
      ${escapeHtml(name)}
    </div>
  `;
}

/* =========================================================
   HEADER PREMIUM
========================================================= */
export function renderHeader({ items = [], state = {} } = {}) {
  const total = sum(items, "total");
  const paid = items.filter((x) => x.estadoPago === "paid").length;
  const pending = items.length - paid;

  return `
    <header class="page-header">
      <div class="page-header-main">
        <h1 class="page-title">Centro de Facturación</h1>

        <p class="page-subtitle">
          Consulta, descarga y revisa todas tus facturas emitidas.
          Portal premium para clientes.
        </p>
      </div>

      <div class="page-header-actions">
        ${button(
          state.loading || state.refreshing
            ? "Actualizando..."
            : "Actualizar",
          { id: "facturas-refresh-btn" }
        )}
      </div>
    </header>

    <section
      class="grid cols-auto"
      style="margin-top:18px;"
    >
      ${metric("Facturas", String(items.length))}
      ${metric("Pagadas", String(paid))}
      ${metric("Pendientes", String(pending))}
      ${metric("Facturado", formatMoney(total, "EUR"))}
    </section>
  `;
}

/* =========================================================
   STATES
========================================================= */
export function renderLoadingState() {
  return `
    <section class="grid cols-auto" style="margin-top:18px;">
      ${Array.from({ length: 6 })
        .map(
          () => `
        <article class="card-surface" style="min-height:260px;"></article>
      `
        )
        .join("")}
    </section>
  `;
}

export function renderErrorState(error = "") {
  return `
    <section class="panel-surface" style="padding:40px;">
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <h3 class="empty-state-title">
          No se pudo cargar la facturación
        </h3>
        <p class="empty-state-text">
          ${escapeHtml(error || "Error inesperado")}
        </p>
        ${button("Reintentar", {
          id: "facturas-retry-btn",
          variant: "primary",
        })}
      </div>
    </section>
  `;
}

export function renderEmptyState() {
  return `
    <section class="panel-surface" style="padding:40px;">
      <div class="empty-state">
        <div class="empty-state-icon">🧾</div>
        <h3 class="empty-state-title">
          No hay facturas disponibles
        </h3>
        <p class="empty-state-text">
          Cuando se generen nuevas facturas aparecerán aquí.
        </p>
      </div>
    </section>
  `;
}

/* =========================================================
   CARD LEGENDARIA
========================================================= */
function renderFacturaCard(item = {}) {
  const id = safeText(item.numero || item.id);
  const empresa = safeText(
    item.cliente?.empresa || item.cliente?.nombre,
    "Cliente"
  );

  const initials = safeText(
    item.cliente?.initials,
    empresa.slice(0, 2).toUpperCase()
  );

  const total = formatMoney(item.total, item.moneda);
  const base = formatMoney(item.baseImponible, item.moneda);

  return `
    <article
      class="hover-lift factura-card"
      data-factura-id="${escapeHtml(item.id || "")}"
      style="${styles.card}"
    >
      <div style="${styles.top}">
        <div style="${styles.titleWrap}">
          <span style="${styles.code}">
            Factura ${escapeHtml(id)}
          </span>

          <h3 style="${styles.company}">
            ${escapeHtml(empresa)}
          </h3>
        </div>

        ${avatar(initials)}
      </div>

      <div>
        <div style="${styles.amountMain}">
          ${escapeHtml(total)}
        </div>

        <div style="${styles.amountSub}">
          Base imponible ${escapeHtml(base)}
        </div>
      </div>

      <div style="${styles.row}">
        ${chip(
          getEstadoPagoLabel(item.estadoPago),
          getEstadoPagoChipStyle(item.estadoPago)
        )}

        ${chip(
          getEstadoLabel(item.estado),
          getEstadoChipStyle(item.estado)
        )}
      </div>

      <div style="${styles.metaGrid}">
        ${meta("Fecha emisión", formatDate(item.fecha))}
        ${meta("Método pago", safeText(item.formaPago, "—"))}
        ${meta("Actualizado", formatRelativeDate(item.updatedAt))}
        ${meta(
          "Adjuntos",
          String(safeNumber(item.attachmentsCount, 0))
        )}
      </div>

      <div style="${styles.footer}">
        <span class="text-dim">
          ${escapeHtml(
            truncate(
              item.preview ||
                "Documento fiscal emitido y disponible para consulta.",
              80
            )
          )}
        </span>

        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${button("Ver", {
            action: "open-factura",
            facturaId: item.id,
          })}

          ${button("Descargar PDF", {
            action: "download-factura",
            facturaId: item.id,
            variant: "primary",
          })}
        </div>
      </div>
    </article>
  `;
}

/* =========================================================
   LISTADO
========================================================= */
export function renderCards({ items = [], state = {} } = {}) {
  if (state.loading && !items.length) {
    return renderLoadingState();
  }

  if (state.error && !items.length) {
    return renderErrorState(state.error);
  }

  if (!items.length) {
    return renderEmptyState();
  }

  return `
    <section
      class="grid cols-auto"
      style="margin-top:18px;"
    >
      ${items.map(renderFacturaCard).join("")}
    </section>
  `;
}
