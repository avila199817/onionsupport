/* =========================================================
   Onion SPA - Facturas Template (FULL PRO SAAS PANEL)
   Archivo: src/views/facturas/facturas.template.js

   Responsabilidades:
   - renderizar header de la vista
   - renderizar estados loading / error / vacío
   - renderizar grid y cards de facturas
   - encapsular helpers visuales reutilizables
   - mantener el markup limpio, escalable y consistente
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

function joinHtml(parts = []) {
  return parts.filter(Boolean).join("");
}

/* =========================================================
   TOKENS INLINE REUTILIZABLES
========================================================= */
const styles = {
  btnSecondary: `
    min-height:var(--btn-height-sm);
    padding:10px 14px;
    border-radius:var(--btn-radius);
    border:1px solid var(--btn-secondary-border);
    background:var(--btn-secondary-bg);
    color:var(--btn-secondary-text);
    box-shadow:var(--btn-secondary-shadow);
    font-weight:var(--weight-bold);
    cursor:pointer;
  `,
  btnPrimary: `
    min-height:var(--btn-height-sm);
    padding:10px 14px;
    border-radius:var(--btn-radius);
    border:1px solid var(--btn-primary-border);
    background:var(--btn-primary-bg);
    color:var(--btn-primary-text);
    box-shadow:var(--btn-primary-shadow);
    font-weight:var(--weight-bold);
    cursor:pointer;
  `,
  cardRoot: `
    display:grid;
    gap:var(--space-md);
    padding:var(--space-lg);
    cursor:pointer;
  `,
  cardTop: `
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:var(--space-sm);
  `,
  titleBlock: `
    display:grid;
    gap:var(--space-xs);
    min-width:0;
  `,
  invoiceNumber: `
    font-size:var(--font-sm);
    color:var(--text-dim);
    font-weight:var(--weight-semibold);
    letter-spacing:var(--letter-wide);
  `,
  companyTitle: `
    margin:0;
    font-size:var(--font-lg);
    line-height:var(--line-snug);
    color:var(--text-strong);
    font-weight:var(--weight-bold);
  `,
  avatar: `
    inline-size:44px;
    block-size:44px;
    flex:0 0 auto;
    display:grid;
    place-items:center;
    border-radius:var(--radius-lg);
    border:1px solid var(--border-soft);
    background:var(--avatar-bg);
    color:var(--avatar-text);
    font-size:var(--font-sm);
    font-weight:var(--weight-black);
    box-shadow:var(--shadow-xs);
  `,
  preview: `
    margin:0;
    font-size:var(--font-md);
    line-height:var(--line-relaxed);
    color:var(--text-muted);
  `,
  metaList: `
    display:grid;
    gap:var(--space-xs);
    font-size:var(--font-md);
    color:var(--text-soft);
  `,
  summaryRow: `
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:var(--space-sm);
    flex-wrap:wrap;
  `,
  amountBlock: `
    display:grid;
    gap:2px;
  `,
  amountMain: `
    font-size:var(--font-xl);
    line-height:1;
    color:var(--text-strong);
  `,
  amountSub: `
    font-size:var(--font-sm);
    color:var(--text-dim);
  `,
  chipsRow: `
    display:flex;
    gap:var(--space-xs);
    flex-wrap:wrap;
  `,
  chipBase: `
    display:inline-flex;
    align-items:center;
    justify-content:center;
    min-height:30px;
    padding:6px 10px;
    border-radius:var(--radius-pill);
    border:1px solid var(--border-soft);
    font-size:var(--font-sm);
    font-weight:var(--weight-semibold);
  `,
  footerRow: `
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:var(--space-sm);
    flex-wrap:wrap;
  `,
  footerMeta: `
    display:grid;
    gap:2px;
  `,
  footerPrimaryText: `
    font-size:var(--font-sm);
    color:var(--text-dim);
  `,
  footerSecondaryText: `
    font-size:var(--font-xs);
    color:var(--text-faint);
  `,
  emptyPanel: `
    display:grid;
    place-items:center;
    min-height:320px;
  `,
  skeletonCard: `
    padding:var(--space-lg);
    display:grid;
    gap:var(--space-md);
    min-height:230px;
  `,
};

/* =========================================================
   HELPERS VISUALES
========================================================= */
function renderButton({
  id = "",
  action = "",
  facturaId = "",
  label = "",
  variant = "secondary",
} = {}) {
  const style = variant === "primary" ? styles.btnPrimary : styles.btnSecondary;

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

function renderMetaLine(label, value) {
  return `
    <span>
      <strong style="color:var(--text-strong);">${escapeHtml(label)}:</strong>
      ${escapeHtml(safeText(value))}
    </span>
  `;
}

function renderChip(label, toneStyle = "") {
  return `
    <span style="${styles.chipBase} ${toneStyle}">
      ${escapeHtml(label)}
    </span>
  `;
}

function renderStatText(primary = "", secondary = "") {
  return `
    <div style="${styles.footerMeta}">
      <span style="${styles.footerPrimaryText}">
        ${escapeHtml(primary)}
      </span>
      <span style="${styles.footerSecondaryText}">
        ${escapeHtml(secondary)}
      </span>
    </div>
  `;
}

function renderAvatar(initials = "ON") {
  return `
    <div style="${styles.avatar}">
      ${escapeHtml(initials)}
    </div>
  `;
}

function renderHeaderSummary({ items = [], state = {} } = {}) {
  return `
    <section class="section">
      <div class="section-header">
        <div class="section-header-main">
          <h2 class="section-title">${items.length} factura(s)</h2>
          <p class="section-subtitle">
            ${escapeHtml(String(state.remoteCount || items.length))} visibles en la colección actual
          </p>
        </div>
      </div>
    </section>
  `;
}

function renderSkeletonCard() {
  return `
    <article class="card-surface" style="${styles.skeletonCard}">
      <div style="display:flex; justify-content:space-between; gap:var(--space-sm);">
        <div style="display:grid; gap:var(--space-xs); flex:1;">
          <div style="width:110px; height:14px; border-radius:var(--radius-pill); background:var(--surface-glass-strong);"></div>
          <div style="width:72%; height:16px; border-radius:var(--radius-pill); background:var(--surface-hover-strong);"></div>
        </div>
        <div style="width:44px; height:44px; border-radius:var(--radius-lg); background:var(--surface-glass);"></div>
      </div>

      <div style="display:grid; gap:var(--space-xs);">
        <div style="width:100%; height:12px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
        <div style="width:84%; height:12px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
        <div style="width:62%; height:12px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
      </div>

      <div style="display:flex; gap:var(--space-xs); flex-wrap:wrap;">
        <div style="width:96px; height:30px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
        <div style="width:96px; height:30px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
      </div>
    </article>
  `;
}

function renderSurfaceMessage({
  icon = "",
  title = "",
  text = "",
  actionHtml = "",
} = {}) {
  return `
    <section class="panel-surface" style="${styles.emptyPanel}">
      <div class="empty-state">
        <div class="empty-state-icon">${icon}</div>
        <h3 class="empty-state-title">${escapeHtml(title)}</h3>
        <p class="empty-state-text">${escapeHtml(text)}</p>
        ${actionHtml || ""}
      </div>
    </section>
  `;
}

/* =========================================================
   FACTURA CARD
========================================================= */
function renderFacturaTop(item) {
  const numero = safeText(item.numero || item.id);
  const empresa = safeText(item.cliente?.empresa || item.cliente?.nombre, "Cliente");
  const initials = safeText(item.cliente?.initials, "ON");

  return `
    <div style="${styles.cardTop}">
      <div style="${styles.titleBlock}">
        <span style="${styles.invoiceNumber}">
          ${escapeHtml(numero)}
        </span>

        <h3 style="${styles.companyTitle}">
          ${escapeHtml(empresa)}
        </h3>
      </div>

      ${renderAvatar(initials)}
    </div>
  `;
}

function renderFacturaPreview(item) {
  return `
    <p style="${styles.preview}">
      ${escapeHtml(truncate(item.preview || "Sin detalle", 160))}
    </p>
  `;
}

function renderFacturaMeta(item) {
  return `
    <div style="${styles.metaList}">
      ${renderMetaLine("Cliente", item.cliente?.nombre || "—")}
      ${renderMetaLine("Email", item.cliente?.email || "-")}
      ${renderMetaLine("Fecha", formatDate(item.fecha))}
      ${renderMetaLine("Pago", item.formaPago || "-")}
    </div>
  `;
}

function renderFacturaAmount(item) {
  return `
    <div style="${styles.amountBlock}">
      <strong style="${styles.amountMain}">
        ${escapeHtml(formatMoney(item.total, item.moneda))}
      </strong>

      <span style="${styles.amountSub}">
        Base ${escapeHtml(formatMoney(item.baseImponible, item.moneda))}
      </span>
    </div>
  `;
}

function renderFacturaChips(item) {
  return `
    <div style="${styles.chipsRow}">
      ${renderChip(
        getEstadoPagoLabel(item.estadoPago),
        getEstadoPagoChipStyle(item.estadoPago)
      )}
      ${renderChip(
        getEstadoLabel(item.estado),
        getEstadoChipStyle(item.estado)
      )}
    </div>
  `;
}

function renderFacturaSummary(item) {
  return `
    <div style="${styles.summaryRow}">
      ${renderFacturaAmount(item)}
      ${renderFacturaChips(item)}
    </div>
  `;
}

function renderFacturaFooter(item) {
  const relative = formatRelativeDate(item.updatedAt);
  const attachments = `Adjuntos: ${safeNumber(item.attachmentsCount, 0)}`;

  return `
    <div style="${styles.footerRow}">
      ${renderStatText(relative, attachments)}

      ${renderButton({
        action: "open-factura",
        facturaId: item.id || "",
        label: "Ver factura",
        variant: "secondary",
      })}
    </div>
  `;
}

function renderFacturaCard(item = {}) {
  return `
    <article
      class="card-surface hover-lift factura-card"
      data-factura-id="${escapeHtml(item.id || "")}"
      style="${styles.cardRoot}"
    >
      ${renderFacturaTop(item)}
      ${renderFacturaPreview(item)}
      ${renderFacturaMeta(item)}
      ${renderFacturaSummary(item)}
      <div class="divider"></div>
      ${renderFacturaFooter(item)}
    </article>
  `;
}

/* =========================================================
   EXPORTS PÚBLICOS
========================================================= */
export function renderHeader({ items = [], state = {} } = {}) {
  return `
    <header class="page-header">
      <div class="page-header-main">
        <h1 class="page-title">Facturas</h1>
        <p class="page-subtitle">
          Listado simple de facturas existentes. Solo cards, sin ruido y sin inventar otro layout.
        </p>
      </div>

      <div class="page-header-actions">
        ${renderButton({
          id: "facturas-refresh-btn",
          label: state.loading || state.refreshing ? "Actualizando..." : "Actualizar",
          variant: "secondary",
        })}
      </div>
    </header>

    ${renderHeaderSummary({ items, state })}
  `;
}

export function renderLoadingState() {
  return `
    <section class="grid cols-auto dense">
      ${Array.from({ length: 6 }).map(() => renderSkeletonCard()).join("")}
    </section>
  `;
}

export function renderErrorState(error = "") {
  return renderSurfaceMessage({
    icon: "⚠️",
    title: "No se pudo cargar el listado",
    text: error || "Error desconocido",
    actionHtml: renderButton({
      id: "facturas-retry-btn",
      label: "Reintentar",
      variant: "primary",
    }),
  });
}

export function renderEmptyState() {
  return renderSurfaceMessage({
    icon: "🧾",
    title: "Sin facturas",
    text: "No hay facturas registradas en este momento.",
  });
}

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
    <section class="grid cols-auto">
      ${items.map((item) => renderFacturaCard(item)).join("")}
    </section>
  `;
}
