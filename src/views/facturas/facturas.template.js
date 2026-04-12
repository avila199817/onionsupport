/* =========================================================
   Onion SPA - Facturas Template
   Archivo: src/views/facturas/facturas.template.js

   Responsabilidades:
   - renderizar header de la vista
   - renderizar estados loading / error / vacío
   - renderizar grid y cards de facturas
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

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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
        <button
          type="button"
          id="facturas-refresh-btn"
          style="
            min-height:var(--btn-height-sm);
            padding:10px 14px;
            border-radius:var(--btn-radius);
            border:1px solid var(--btn-secondary-border);
            background:var(--btn-secondary-bg);
            color:var(--btn-secondary-text);
            box-shadow:var(--btn-secondary-shadow);
            font-weight:var(--weight-bold);
            cursor:pointer;
          "
        >
          ${state.loading || state.refreshing ? "Actualizando..." : "Actualizar"}
        </button>
      </div>
    </header>

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

export function renderLoadingState() {
  return `
    <section class="grid cols-auto dense">
      ${Array.from({ length: 6 })
        .map(
          () => `
            <article class="card-surface" style="padding:var(--space-lg); display:grid; gap:var(--space-md); min-height:230px;">
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
          `
        )
        .join("")}
    </section>
  `;
}

export function renderErrorState(error = "") {
  return `
    <section class="panel-surface">
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <h3 class="empty-state-title">No se pudo cargar el listado</h3>
        <p class="empty-state-text">${escapeHtml(error || "Error desconocido")}</p>
        <button
          type="button"
          id="facturas-retry-btn"
          style="
            min-height:var(--btn-height-sm);
            padding:10px 14px;
            border-radius:var(--btn-radius);
            border:1px solid var(--btn-primary-border);
            background:var(--btn-primary-bg);
            color:var(--btn-primary-text);
            box-shadow:var(--btn-primary-shadow);
            font-weight:var(--weight-bold);
            cursor:pointer;
          "
        >
          Reintentar
        </button>
      </div>
    </section>
  `;
}

export function renderEmptyState() {
  return `
    <section class="panel-surface">
      <div class="empty-state">
        <div class="empty-state-icon">🧾</div>
        <h3 class="empty-state-title">Sin facturas</h3>
        <p class="empty-state-text">
          No hay facturas registradas en este momento.
        </p>
      </div>
    </section>
  `;
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
      ${items
        .map(
          (item) => `
            <article
              class="card-surface hover-lift factura-card"
              data-factura-id="${escapeHtml(item.id || "")}"
              style="
                display:grid;
                gap:var(--space-md);
                padding:var(--space-lg);
                cursor:pointer;
              "
            >
              <div style="
                display:flex;
                align-items:flex-start;
                justify-content:space-between;
                gap:var(--space-sm);
              ">
                <div style="display:grid; gap:var(--space-xs); min-width:0;">
                  <span style="
                    font-size:var(--font-sm);
                    color:var(--text-dim);
                    font-weight:var(--weight-semibold);
                    letter-spacing:var(--letter-wide);
                  ">
                    ${escapeHtml(item.numero || item.id || "—")}
                  </span>

                  <h3 style="
                    margin:0;
                    font-size:var(--font-lg);
                    line-height:var(--line-snug);
                    color:var(--text-strong);
                    font-weight:var(--weight-bold);
                  ">
                    ${escapeHtml(item.cliente?.empresa || item.cliente?.nombre || "Cliente")}
                  </h3>
                </div>

                <div style="
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
                ">
                  ${escapeHtml(item.cliente?.initials || "ON")}
                </div>
              </div>

              <p style="
                margin:0;
                font-size:var(--font-md);
                line-height:var(--line-relaxed);
                color:var(--text-muted);
              ">
                ${escapeHtml(truncate(item.preview || "Sin detalle", 160))}
              </p>

              <div style="
                display:grid;
                gap:var(--space-xs);
                font-size:var(--font-md);
                color:var(--text-soft);
              ">
                <span><strong style="color:var(--text-strong);">Cliente:</strong> ${escapeHtml(item.cliente?.nombre || "—")}</span>
                <span><strong style="color:var(--text-strong);">Email:</strong> ${escapeHtml(item.cliente?.email || "-")}</span>
                <span><strong style="color:var(--text-strong);">Fecha:</strong> ${escapeHtml(formatDate(item.fecha))}</span>
                <span><strong style="color:var(--text-strong);">Pago:</strong> ${escapeHtml(item.formaPago || "-")}</span>
              </div>

              <div style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:var(--space-sm);
                flex-wrap:wrap;
              ">
                <div style="display:grid; gap:2px;">
                  <strong style="
                    font-size:var(--font-xl);
                    line-height:1;
                    color:var(--text-strong);
                  ">
                    ${escapeHtml(formatMoney(item.total, item.moneda))}
                  </strong>

                  <span style="
                    font-size:var(--font-sm);
                    color:var(--text-dim);
                  ">
                    Base ${escapeHtml(formatMoney(item.baseImponible, item.moneda))}
                  </span>
                </div>

                <div style="display:flex; gap:var(--space-xs); flex-wrap:wrap;">
                  <span style="
                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    min-height:30px;
                    padding:6px 10px;
                    border-radius:var(--radius-pill);
                    border:1px solid var(--border-soft);
                    font-size:var(--font-sm);
                    font-weight:var(--weight-semibold);
                    ${getEstadoPagoChipStyle(item.estadoPago)}
                  ">
                    ${escapeHtml(getEstadoPagoLabel(item.estadoPago))}
                  </span>

                  <span style="
                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    min-height:30px;
                    padding:6px 10px;
                    border-radius:var(--radius-pill);
                    border:1px solid var(--border-soft);
                    font-size:var(--font-sm);
                    font-weight:var(--weight-semibold);
                    ${getEstadoChipStyle(item.estado)}
                  ">
                    ${escapeHtml(getEstadoLabel(item.estado))}
                  </span>
                </div>
              </div>

              <div class="divider"></div>

              <div style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:var(--space-sm);
                flex-wrap:wrap;
              ">
                <div style="display:grid; gap:2px;">
                  <span style="
                    font-size:var(--font-sm);
                    color:var(--text-dim);
                  ">
                    ${escapeHtml(formatRelativeDate(item.updatedAt))}
                  </span>

                  <span style="
                    font-size:var(--font-xs);
                    color:var(--text-faint);
                  ">
                    Adjuntos: ${escapeHtml(String(item.attachmentsCount || 0))}
                  </span>
                </div>

                <button
                  type="button"
                  data-action="open-factura"
                  data-factura-id="${escapeHtml(item.id || "")}"
                  style="
                    min-height:36px;
                    padding:8px 12px;
                    border-radius:var(--radius-sm);
                    border:1px solid var(--btn-secondary-border);
                    background:var(--btn-secondary-bg);
                    color:var(--btn-secondary-text);
                    font-size:var(--font-sm);
                    font-weight:var(--weight-bold);
                    cursor:pointer;
                  "
                >
                  Ver factura
                </button>
              </div>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}
