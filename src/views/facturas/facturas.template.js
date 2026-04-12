/* =========================================================
   Onion SPA - Facturas Template (APPLE STYLE · FULL PRO SAAS)
   Archivo: src/views/facturas/facturas.template.js

   Responsabilidades:
   - renderizar header premium de facturación
   - renderizar resumen ejecutivo de la colección
   - renderizar tabla principal de facturas en desktop
   - renderizar cards premium en mobile / fallback
   - renderizar estados loading / error / vacío
   - encapsular helpers visuales reutilizables
   - mantener markup limpio, consistente y escalable
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

function sumBy(items = [], selector = () => 0) {
  return items.reduce((acc, item) => acc + safeNumber(selector(item), 0), 0);
}

function countBy(items = [], predicate = () => false) {
  return items.reduce((acc, item) => acc + (predicate(item) ? 1 : 0), 0);
}

function getClienteDisplay(item = {}) {
  return safeText(item.cliente?.empresa || item.cliente?.nombre, "Cliente");
}

function getClienteSecondary(item = {}) {
  return safeText(item.cliente?.email || item.cliente?.nombre || "Sin contacto");
}

function getFacturaNumero(item = {}) {
  return safeText(item.numero || item.id, "Sin código");
}

function getFacturaInitials(item = {}) {
  const raw = safeText(item.cliente?.initials, "");
  if (raw && raw !== "—") return raw.slice(0, 2).toUpperCase();

  const source = getClienteDisplay(item)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk.charAt(0).toUpperCase())
    .join("");

  return source || "ON";
}

function isPaid(item = {}) {
  return String(item.estadoPago || "").toLowerCase() === "paid";
}

function isPending(item = {}) {
  return ["pending", "unpaid", "partial"].includes(
    String(item.estadoPago || "").toLowerCase()
  );
}

/* =========================================================
   TOKENS INLINE REUTILIZABLES
========================================================= */
const styles = {
  btnSecondary: `
    min-height:40px;
    padding:0 14px;
    border-radius:14px;
    border:1px solid var(--btn-secondary-border);
    background:var(--btn-secondary-bg);
    color:var(--btn-secondary-text);
    box-shadow:var(--btn-secondary-shadow);
    font-weight:var(--weight-bold);
    cursor:pointer;
    transition:
      transform .18s ease,
      border-color .18s ease,
      background .18s ease,
      box-shadow .18s ease;
    backdrop-filter:blur(10px);
    -webkit-backdrop-filter:blur(10px);
  `,
  btnPrimary: `
    min-height:40px;
    padding:0 14px;
    border-radius:14px;
    border:1px solid var(--btn-primary-border);
    background:var(--btn-primary-bg);
    color:var(--btn-primary-text);
    box-shadow:var(--btn-primary-shadow);
    font-weight:var(--weight-bold);
    cursor:pointer;
    transition:
      transform .18s ease,
      opacity .18s ease,
      box-shadow .18s ease;
  `,
  btnGhost: `
    min-height:36px;
    padding:0 12px;
    border-radius:12px;
    border:1px solid var(--border-soft);
    background:var(--surface-glass);
    color:var(--text-soft);
    font-weight:var(--weight-semibold);
    cursor:pointer;
    backdrop-filter:blur(10px);
    -webkit-backdrop-filter:blur(10px);
  `,
  hero: `
    position:relative;
    overflow:hidden;
    display:grid;
    gap:var(--space-lg);
    padding:clamp(20px, 2vw, 28px);
    border-radius:calc(var(--radius-xl) + 4px);
    border:1px solid var(--border-soft);
    background:
      radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 18%, transparent), transparent 34%),
      radial-gradient(circle at left bottom, color-mix(in srgb, var(--accent) 10%, transparent), transparent 28%),
      linear-gradient(180deg, var(--surface-2), var(--surface-1));
    box-shadow:var(--shadow-md);
  `,
  heroTop: `
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:var(--space-lg);
    flex-wrap:wrap;
  `,
  heroEyebrow: `
    display:inline-flex;
    align-items:center;
    gap:8px;
    min-height:30px;
    padding:0 12px;
    border-radius:999px;
    border:1px solid var(--border-soft);
    background:var(--surface-glass);
    color:var(--text-dim);
    font-size:12px;
    font-weight:var(--weight-bold);
    letter-spacing:.06em;
    text-transform:uppercase;
    backdrop-filter:blur(12px);
    -webkit-backdrop-filter:blur(12px);
  `,
  heroTitle: `
    margin:0;
    font-size:clamp(28px, 4vw, 40px);
    line-height:1.02;
    letter-spacing:-.03em;
    color:var(--text-strong);
    font-weight:var(--weight-black);
  `,
  heroSubtitle: `
    margin:0;
    max-width:760px;
    font-size:var(--font-md);
    line-height:var(--line-relaxed);
    color:var(--text-muted);
  `,
  metricGrid: `
    display:grid;
    grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
    gap:var(--space-md);
  `,
  metricCard: `
    position:relative;
    overflow:hidden;
    display:grid;
    gap:8px;
    min-height:108px;
    padding:18px;
    border-radius:22px;
    border:1px solid var(--border-soft);
    background:
      linear-gradient(180deg, var(--surface-glass-strong), var(--surface-glass)),
      var(--surface-1);
    box-shadow:var(--shadow-xs);
    backdrop-filter:blur(14px);
    -webkit-backdrop-filter:blur(14px);
  `,
  metricLabel: `
    font-size:12px;
    color:var(--text-dim);
    font-weight:var(--weight-bold);
    letter-spacing:.05em;
    text-transform:uppercase;
  `,
  metricValue: `
    font-size:clamp(24px, 3vw, 32px);
    line-height:1;
    color:var(--text-strong);
    font-weight:var(--weight-black);
    letter-spacing:-.03em;
  `,
  metricHint: `
    font-size:var(--font-sm);
    color:var(--text-faint);
  `,
  surfaceShell: `
    position:relative;
    overflow:hidden;
    border-radius:28px;
    border:1px solid var(--border-soft);
    background:
      linear-gradient(180deg, var(--surface-2), var(--surface-1));
    box-shadow:var(--shadow-md);
  `,
  toolbar: `
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:var(--space-md);
    padding:18px 20px;
    border-bottom:1px solid var(--border-soft);
    background:var(--surface-glass);
    backdrop-filter:blur(16px);
    -webkit-backdrop-filter:blur(16px);
    flex-wrap:wrap;
  `,
  toolbarTitleWrap: `
    display:grid;
    gap:4px;
    min-width:0;
  `,
  toolbarTitle: `
    margin:0;
    font-size:var(--font-xl);
    color:var(--text-strong);
    font-weight:var(--weight-bold);
    letter-spacing:-.02em;
  `,
  toolbarText: `
    margin:0;
    font-size:var(--font-sm);
    color:var(--text-dim);
  `,
  tableWrap: `
    width:100%;
    overflow:auto;
  `,
  table: `
    width:100%;
    min-width:1080px;
    border-collapse:separate;
    border-spacing:0;
  `,
  theadCell: `
    position:sticky;
    top:0;
    z-index:1;
    padding:14px 18px;
    border-bottom:1px solid var(--border-soft);
    background:
      linear-gradient(180deg, var(--surface-glass-strong), var(--surface-glass));
    color:var(--text-dim);
    font-size:12px;
    font-weight:var(--weight-bold);
    letter-spacing:.06em;
    text-transform:uppercase;
    text-align:left;
    backdrop-filter:blur(16px);
    -webkit-backdrop-filter:blur(16px);
    white-space:nowrap;
  `,
  tbodyRow: `
    transition:
      background .18s ease,
      transform .18s ease;
  `,
  tbodyCell: `
    padding:16px 18px;
    border-bottom:1px solid var(--border-soft);
    vertical-align:middle;
  `,
  mainCell: `
    display:flex;
    align-items:center;
    gap:12px;
    min-width:0;
  `,
  avatar: `
    inline-size:44px;
    block-size:44px;
    flex:0 0 auto;
    display:grid;
    place-items:center;
    border-radius:16px;
    border:1px solid var(--border-soft);
    background:
      linear-gradient(180deg, var(--surface-glass-strong), var(--surface-glass));
    color:var(--text-strong);
    font-size:var(--font-sm);
    font-weight:var(--weight-black);
    box-shadow:var(--shadow-xs);
  `,
  companyBlock: `
    display:grid;
    gap:4px;
    min-width:0;
  `,
  invoiceNumber: `
    font-size:12px;
    color:var(--text-dim);
    font-weight:var(--weight-bold);
    letter-spacing:.05em;
    text-transform:uppercase;
  `,
  companyTitle: `
    margin:0;
    font-size:var(--font-md);
    line-height:var(--line-snug);
    color:var(--text-strong);
    font-weight:var(--weight-bold);
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
    max-width:240px;
  `,
  companyMeta: `
    font-size:var(--font-sm);
    color:var(--text-muted);
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
    max-width:240px;
  `,
  amountMain: `
    display:block;
    font-size:var(--font-lg);
    line-height:1.05;
    color:var(--text-strong);
    font-weight:var(--weight-black);
    letter-spacing:-.02em;
    white-space:nowrap;
  `,
  amountSub: `
    display:block;
    margin-top:3px;
    font-size:12px;
    color:var(--text-faint);
    white-space:nowrap;
  `,
  chipRow: `
    display:flex;
    gap:8px;
    flex-wrap:wrap;
    align-items:center;
  `,
  chipBase: `
    display:inline-flex;
    align-items:center;
    justify-content:center;
    min-height:30px;
    padding:6px 10px;
    border-radius:999px;
    border:1px solid var(--border-soft);
    font-size:12px;
    font-weight:var(--weight-semibold);
    white-space:nowrap;
  `,
  rowActionWrap: `
    display:flex;
    align-items:center;
    justify-content:flex-end;
    gap:8px;
    flex-wrap:wrap;
  `,
  mobileGrid: `
    display:none;
    gap:var(--space-md);
    padding:var(--space-lg);
  `,
  mobileCard: `
    display:grid;
    gap:var(--space-md);
    padding:20px;
    border-radius:24px;
    border:1px solid var(--border-soft);
    background:
      radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 8%, transparent), transparent 30%),
      linear-gradient(180deg, var(--surface-2), var(--surface-1));
    box-shadow:var(--shadow-sm);
  `,
  mobileTop: `
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:var(--space-sm);
  `,
  mobileTitleBlock: `
    display:grid;
    gap:4px;
    min-width:0;
  `,
  mobilePreview: `
    margin:0;
    font-size:var(--font-md);
    line-height:var(--line-relaxed);
    color:var(--text-muted);
  `,
  mobileMetaGrid: `
    display:grid;
    grid-template-columns:repeat(2, minmax(0, 1fr));
    gap:10px;
  `,
  metaBox: `
    display:grid;
    gap:4px;
    padding:12px;
    border-radius:16px;
    border:1px solid var(--border-soft);
    background:var(--surface-glass);
  `,
  metaLabel: `
    font-size:11px;
    color:var(--text-faint);
    font-weight:var(--weight-bold);
    letter-spacing:.04em;
    text-transform:uppercase;
  `,
  metaValue: `
    font-size:var(--font-sm);
    color:var(--text-strong);
    font-weight:var(--weight-semibold);
  `,
  mobileFooter: `
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
    flex-wrap:wrap;
  `,
  emptyPanel: `
    display:grid;
    place-items:center;
    min-height:360px;
    padding:32px;
  `,
  skeletonArea: `
    padding:20px;
    display:grid;
    gap:12px;
  `,
  skeletonRow: `
    display:grid;
    grid-template-columns:2.2fr 1fr 1fr 1fr 1.1fr 1.5fr;
    gap:12px;
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
  const style =
    variant === "primary"
      ? styles.btnPrimary
      : variant === "ghost"
      ? styles.btnGhost
      : styles.btnSecondary;

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

function renderChip(label, toneStyle = "") {
  return `
    <span style="${styles.chipBase} ${toneStyle}">
      ${escapeHtml(label)}
    </span>
  `;
}

function renderMetricCard({ label = "", value = "", hint = "" } = {}) {
  return `
    <article style="${styles.metricCard}">
      <span style="${styles.metricLabel}">${escapeHtml(label)}</span>
      <strong style="${styles.metricValue}">${escapeHtml(value)}</strong>
      <span style="${styles.metricHint}">${escapeHtml(hint)}</span>
    </article>
  `;
}

function renderAvatar(initials = "ON") {
  return `
    <div style="${styles.avatar}">
      ${escapeHtml(initials)}
    </div>
  `;
}

function renderMetaBox(label = "", value = "") {
  return `
    <div style="${styles.metaBox}">
      <span style="${styles.metaLabel}">${escapeHtml(label)}</span>
      <span style="${styles.metaValue}">${escapeHtml(value)}</span>
    </div>
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

function renderInjectResponsiveRules() {
  return `
    <style>
      @media (max-width: 980px) {
        .facturas-desktop-table {
          display: none !important;
        }

        .facturas-mobile-grid {
          display: grid !important;
        }
      }

      @media (min-width: 981px) {
        .facturas-desktop-table {
          display: block !important;
        }

        .facturas-mobile-grid {
          display: none !important;
        }
      }

      .facturas-table-row:hover {
        background: var(--surface-glass);
      }

      .facturas-table-row:last-child td {
        border-bottom: 0;
      }

      .facturas-hero-actions > * {
        flex: 0 0 auto;
      }

      .facturas-toolbar-actions > * {
        flex: 0 0 auto;
      }
    </style>
  `;
}

/* =========================================================
   HERO / HEADER
========================================================= */
function renderHeaderMetrics({ items = [] } = {}) {
  const totalFacturado = sumBy(items, (item) => item.total);
  const totalBase = sumBy(items, (item) => item.baseImponible);
  const totalPagadas = countBy(items, isPaid);
  const totalPendientes = countBy(items, isPending);

  return `
    <section style="${styles.metricGrid}">
      ${renderMetricCard({
        label: "Facturas",
        value: String(items.length),
        hint: "Documentos visibles en esta colección",
      })}
      ${renderMetricCard({
        label: "Pagadas",
        value: String(totalPagadas),
        hint: "Cobro confirmado",
      })}
      ${renderMetricCard({
        label: "Pendientes",
        value: String(totalPendientes),
        hint: "Requieren seguimiento",
      })}
      ${renderMetricCard({
        label: "Facturado",
        value: formatMoney(totalFacturado, "EUR"),
        hint: `Base ${formatMoney(totalBase, "EUR")}`,
      })}
    </section>
  `;
}

export function renderHeader({ items = [], state = {} } = {}) {
  return `
    ${renderInjectResponsiveRules()}

    <section style="${styles.hero}">
      <div style="${styles.heroTop}">
        <div style="display:grid; gap:12px; min-width:0;">
          <span style="${styles.heroEyebrow}">
            Billing Experience · Premium Client Portal
          </span>

          <div style="display:grid; gap:10px;">
            <h1 class="page-title" style="${styles.heroTitle}">
              Centro de Facturación
            </h1>

            <p class="page-subtitle" style="${styles.heroSubtitle}">
              Accede a tus facturas, revisa estados de cobro, consulta importes
              y descarga cada documento con una experiencia limpia, elegante y
              orientada a cliente final tipo empresa premium.
            </p>
          </div>
        </div>

        <div
          class="facturas-hero-actions"
          style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;"
        >
          ${renderButton({
            id: "facturas-export-btn",
            label: "Exportar",
            variant: "ghost",
          })}

          ${renderButton({
            id: "facturas-refresh-btn",
            label: state.loading || state.refreshing ? "Actualizando..." : "Actualizar",
            variant: "primary",
          })}
        </div>
      </div>

      ${renderHeaderMetrics({ items })}
    </section>
  `;
}

/* =========================================================
   LOADING
========================================================= */
function renderSkeletonDesktop() {
  return `
    <section style="${styles.surfaceShell}">
      <div style="${styles.toolbar}">
        <div style="${styles.toolbarTitleWrap}">
          <h2 style="${styles.toolbarTitle}">Cargando facturas</h2>
          <p style="${styles.toolbarText}">Preparando tabla y resumen visual...</p>
        </div>
      </div>

      <div style="${styles.skeletonArea}">
        ${Array.from({ length: 6 })
          .map(
            () => `
              <div style="${styles.skeletonRow}">
                <div style="height:54px; border-radius:16px; background:var(--surface-glass);"></div>
                <div style="height:54px; border-radius:16px; background:var(--surface-glass);"></div>
                <div style="height:54px; border-radius:16px; background:var(--surface-glass);"></div>
                <div style="height:54px; border-radius:16px; background:var(--surface-glass);"></div>
                <div style="height:54px; border-radius:16px; background:var(--surface-glass);"></div>
                <div style="height:54px; border-radius:16px; background:var(--surface-glass);"></div>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderSkeletonMobile() {
  return `
    <section class="facturas-mobile-grid" style="${styles.mobileGrid}">
      ${Array.from({ length: 4 })
        .map(
          () => `
            <article style="${styles.mobileCard}">
              <div style="display:flex; justify-content:space-between; gap:12px;">
                <div style="display:grid; gap:8px; flex:1;">
                  <div style="width:120px; height:12px; border-radius:999px; background:var(--surface-glass-strong);"></div>
                  <div style="width:72%; height:16px; border-radius:999px; background:var(--surface-hover-strong);"></div>
                </div>
                <div style="width:44px; height:44px; border-radius:16px; background:var(--surface-glass);"></div>
              </div>

              <div style="width:160px; height:28px; border-radius:12px; background:var(--surface-glass);"></div>

              <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px;">
                <div style="height:56px; border-radius:14px; background:var(--surface-glass);"></div>
                <div style="height:56px; border-radius:14px; background:var(--surface-glass);"></div>
                <div style="height:56px; border-radius:14px; background:var(--surface-glass);"></div>
                <div style="height:56px; border-radius:14px; background:var(--surface-glass);"></div>
              </div>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

export function renderLoadingState() {
  return `
    ${renderSkeletonDesktop()}
    ${renderSkeletonMobile()}
  `;
}

/* =========================================================
   ERROR / EMPTY
========================================================= */
export function renderErrorState(error = "") {
  return renderSurfaceMessage({
    icon: "⚠️",
    title: "No se pudo cargar la facturación",
    text: error || "Se produjo un error al obtener el listado de facturas.",
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
    title: "Todavía no hay facturas",
    text: "Cuando exista facturación emitida aparecerá aquí con su estado, importe y acciones disponibles.",
  });
}

/* =========================================================
   FILAS DE TABLA DESKTOP
========================================================= */
function renderClienteCell(item = {}) {
  return `
    <div style="${styles.mainCell}">
      ${renderAvatar(getFacturaInitials(item))}

      <div style="${styles.companyBlock}">
        <span style="${styles.invoiceNumber}">
          ${escapeHtml(getFacturaNumero(item))}
        </span>

        <h3 style="${styles.companyTitle}">
          ${escapeHtml(getClienteDisplay(item))}
        </h3>

        <span style="${styles.companyMeta}">
          ${escapeHtml(getClienteSecondary(item))}
        </span>
      </div>
    </div>
  `;
}

function renderAmountCell(item = {}) {
  return `
    <div>
      <strong style="${styles.amountMain}">
        ${escapeHtml(formatMoney(item.total, item.moneda))}
      </strong>

      <span style="${styles.amountSub}">
        Base ${escapeHtml(formatMoney(item.baseImponible, item.moneda))}
      </span>
    </div>
  `;
}

function renderStatesCell(item = {}) {
  return `
    <div style="${styles.chipRow}">
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

function renderActionsCell(item = {}) {
  return `
    <div style="${styles.rowActionWrap}">
      ${renderButton({
        action: "open-factura",
        facturaId: item.id || "",
        label: "Ver",
        variant: "secondary",
      })}

      ${renderButton({
        action: "download-factura",
        facturaId: item.id || "",
        label: "PDF",
        variant: "primary",
      })}
    </div>
  `;
}

function renderFacturaTableRow(item = {}) {
  return `
    <tr
      class="facturas-table-row"
      data-factura-id="${escapeHtml(item.id || "")}"
      style="${styles.tbodyRow}"
    >
      <td style="${styles.tbodyCell}">
        ${renderClienteCell(item)}
      </td>

      <td style="${styles.tbodyCell}">
        ${renderAmountCell(item)}
      </td>

      <td style="${styles.tbodyCell}">
        <span style="${styles.companyMeta}">
          ${escapeHtml(formatDate(item.fecha))}
        </span>
      </td>

      <td style="${styles.tbodyCell}">
        <span style="${styles.companyMeta}">
          ${escapeHtml(safeText(item.formaPago, "—"))}
        </span>
      </td>

      <td style="${styles.tbodyCell}">
        ${renderStatesCell(item)}
      </td>

      <td style="${styles.tbodyCell}">
        <span style="${styles.companyMeta}">
          ${escapeHtml(formatRelativeDate(item.updatedAt))}
        </span>
      </td>

      <td style="${styles.tbodyCell}">
        <span style="${styles.companyMeta}">
          ${escapeHtml(String(safeNumber(item.attachmentsCount, 0)))}
        </span>
      </td>

      <td style="${styles.tbodyCell}">
        ${renderActionsCell(item)}
      </td>
    </tr>
  `;
}

function renderDesktopTable({ items = [], state = {} } = {}) {
  return `
    <section class="facturas-desktop-table" style="${styles.surfaceShell}">
      <div style="${styles.toolbar}">
        <div style="${styles.toolbarTitleWrap}">
          <h2 style="${styles.toolbarTitle}">
            Facturas emitidas
          </h2>

          <p style="${styles.toolbarText}">
            ${escapeHtml(String(state.remoteCount || items.length))} visibles en la colección actual
          </p>
        </div>

        <div
          class="facturas-toolbar-actions"
          style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;"
        >
          ${renderButton({
            id: "facturas-filter-btn",
            label: "Filtrar",
            variant: "ghost",
          })}

          ${renderButton({
            id: "facturas-sort-btn",
            label: "Ordenar",
            variant: "ghost",
          })}
        </div>
      </div>

      <div style="${styles.tableWrap}">
        <table style="${styles.table}">
          <thead>
            <tr>
              <th style="${styles.theadCell}">Cliente / Factura</th>
              <th style="${styles.theadCell}">Importe</th>
              <th style="${styles.theadCell}">Fecha</th>
              <th style="${styles.theadCell}">Pago</th>
              <th style="${styles.theadCell}">Estado</th>
              <th style="${styles.theadCell}">Última actividad</th>
              <th style="${styles.theadCell}">Adj.</th>
              <th style="${styles.theadCell}; text-align:right;">Acciones</th>
            </tr>
          </thead>

          <tbody>
            ${items.map((item) => renderFacturaTableRow(item)).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

/* =========================================================
   CARDS MOBILE
========================================================= */
function renderFacturaMobileCard(item = {}) {
  return `
    <article
      class="hover-lift factura-card"
      data-factura-id="${escapeHtml(item.id || "")}"
      style="${styles.mobileCard}"
    >
      <div style="${styles.mobileTop}">
        <div style="${styles.mobileTitleBlock}">
          <span style="${styles.invoiceNumber}">
            ${escapeHtml(getFacturaNumero(item))}
          </span>

          <h3 style="${styles.companyTitle}; max-width:none;">
            ${escapeHtml(getClienteDisplay(item))}
          </h3>

          <span style="${styles.companyMeta}; max-width:none;">
            ${escapeHtml(getClienteSecondary(item))}
          </span>
        </div>

        ${renderAvatar(getFacturaInitials(item))}
      </div>

      <div style="display:grid; gap:6px;">
        <strong style="${styles.amountMain}">
          ${escapeHtml(formatMoney(item.total, item.moneda))}
        </strong>

        <span style="${styles.amountSub}">
          Base ${escapeHtml(formatMoney(item.baseImponible, item.moneda))}
        </span>
      </div>

      <div style="${styles.chipRow}">
        ${renderChip(
          getEstadoPagoLabel(item.estadoPago),
          getEstadoPagoChipStyle(item.estadoPago)
        )}
        ${renderChip(
          getEstadoLabel(item.estado),
          getEstadoChipStyle(item.estado)
        )}
      </div>

      <p style="${styles.mobilePreview}">
        ${escapeHtml(
          truncate(
            item.preview || "Documento fiscal disponible para revisión y descarga.",
            140
          )
        )}
      </p>

      <div style="${styles.mobileMetaGrid}">
        ${renderMetaBox("Fecha", formatDate(item.fecha))}
        ${renderMetaBox("Pago", safeText(item.formaPago, "—"))}
        ${renderMetaBox("Actualizado", formatRelativeDate(item.updatedAt))}
        ${renderMetaBox("Adjuntos", String(safeNumber(item.attachmentsCount, 0)))}
      </div>

      <div style="${styles.mobileFooter}">
        <div style="font-size:var(--font-sm); color:var(--text-dim);">
          ${escapeHtml(safeText(item.estadoDetalle || "Factura lista para consulta"))}
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${renderButton({
            action: "open-factura",
            facturaId: item.id || "",
            label: "Ver",
            variant: "secondary",
          })}
          ${renderButton({
            action: "download-factura",
            facturaId: item.id || "",
            label: "PDF",
            variant: "primary",
          })}
        </div>
      </div>
    </article>
  `;
}

function renderMobileCards({ items = [] } = {}) {
  return `
    <section class="facturas-mobile-grid" style="${styles.mobileGrid}">
      ${items.map((item) => renderFacturaMobileCard(item)).join("")}
    </section>
  `;
}

/* =========================================================
   EXPORTS PÚBLICOS
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

  return joinHtml([
    renderDesktopTable({ items, state }),
    renderMobileCards({ items, state }),
  ]);
}
