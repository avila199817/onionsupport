/* =========================================================
   Onion SPA - Facturas Template (FINAL PRO TABLE GOD MODE)
   Archivo: src/views/facturas/facturas.template.js

   RESPONSABILIDADES:
   - renderizar header premium de la vista
   - renderizar estados loading / error / empty
   - renderizar tabla premium de facturas
   - mantener compatibilidad directa con facturasView.js
   - reflejar opening / refresh / sync igual que incidencias
   - soportar estado visual por factura al abrir / descargar / ver / enviar
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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
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

function formatRelativeDate(value) {
  if (!value) return "Sin fecha";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  const absMinutes = Math.abs(diffMinutes);

  if (absMinutes < 1) return "Ahora mismo";

  if (absMinutes < 60) {
    return diffMinutes > 0
      ? `En ${absMinutes} min`
      : `Hace ${absMinutes} min`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  const absHours = Math.abs(diffHours);

  if (absHours < 24) {
    return diffHours > 0
      ? `En ${absHours} h`
      : `Hace ${absHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);
  const absDays = Math.abs(diffDays);

  if (absDays < 7) {
    return diffDays > 0
      ? `En ${absDays} día${absDays === 1 ? "" : "s"}`
      : `Hace ${absDays} día${absDays === 1 ? "" : "s"}`;
  }

  return formatDate(value);
}

function getEstadoPagoLabel(value = "") {
  const key = safeLower(value);

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
  const key = safeLower(value);

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
  const key = safeLower(value);

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
  const key = safeLower(value);

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

function renderStatCard({
  label = "",
  value = "0",
  caption = "",
  accent = false,
} = {}) {
  return `
    <article
      class="facturas-stat-card panel-surface"
      style="
        position:relative;
        overflow:hidden;
        display:grid;
        gap:10px;
        min-height:132px;
        padding:20px;
        border-radius:var(--panel-radius);
        border:1px solid ${
          accent
            ? "color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft))"
            : "var(--border-soft)"
        };
        background:${
          accent
            ? "linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 72%), var(--surface-1, var(--surface-glass))"
            : "var(--surface-1, var(--surface-glass))"
        };
        box-shadow:var(--shadow-sm);
      "
    >
      <span
        style="
          font-size:12px;
          line-height:1;
          letter-spacing:.08em;
          text-transform:uppercase;
          color:var(--text-dim);
          font-weight:var(--weight-bold);
        "
      >
        ${escapeHtml(label)}
      </span>

      <strong
        style="
          font-size:clamp(24px, 3vw, 34px);
          line-height:1;
          letter-spacing:-.04em;
          color:var(--text-strong);
          font-weight:var(--weight-black);
        "
      >
        ${escapeHtml(value)}
      </strong>

      <p
        style="
          margin:0;
          color:var(--text-dim);
          font-size:var(--font-sm);
          line-height:1.45;
        "
      >
        ${escapeHtml(caption)}
      </p>
    </article>
  `;
}

function computeStats(items = []) {
  const list = safeArray(items);

  const totalFacturas = list.length;
  const totalImporte = list.reduce(
    (acc, item) => acc + safeNumber(item?.total, 0),
    0
  );

  const paidCount = list.filter((item) => {
    const estado = safeLower(item?.estadoPago);
    return ["paid", "pagada", "pagado", "cobrada"].includes(estado);
  }).length;

  const pendingCount = list.filter((item) => {
    const estado = safeLower(item?.estadoPago);
    return ["pending", "pendiente", "partial", "parcial"].includes(estado);
  }).length;

  const overdueCount = list.filter((item) => {
    const estado = safeLower(item?.estadoPago);
    return ["overdue", "vencida"].includes(estado);
  }).length;

  return {
    totalFacturas,
    totalImporte,
    paidCount,
    pendingCount,
    overdueCount,
  };
}

function getClientInitials(item = {}) {
  const raw =
    item?.cliente?.initials ||
    item?.clienteEmpresa ||
    item?.clienteNombre ||
    item?.cliente?.empresa ||
    item?.cliente?.nombre ||
    "ON";

  const clean = String(raw).trim();

  if (!clean) return "ON";

  const parts = clean.split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]).join("");

  return (initials || clean.slice(0, 2) || "ON").toUpperCase();
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

function renderInlineSpinner(label = "") {
  return `
    <span style="display:inline-flex; align-items:center; gap:8px;">
      <span
        aria-hidden="true"
        style="
          width:14px;
          height:14px;
          border-radius:999px;
          border:2px solid color-mix(in srgb, currentColor 22%, transparent);
          border-top-color:currentColor;
          animation:facturasSpin .8s linear infinite;
        "
      ></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function resolveBusyMeta(item = {}, state = {}) {
  const facturaId = safeText(
    first(item?.id, item?._id, item?.facturaId),
    ""
  );

  const openingFacturaId = safeText(state?.openingFacturaId, "");
  const viewingFacturaId = safeText(state?.viewingFacturaId, "");
  const downloadingFacturaId = safeText(state?.downloadingFacturaId, "");
  const sendingFacturaId = safeText(state?.sendingFacturaId, "");

  return {
    facturaId,
    isOpening: Boolean(facturaId && openingFacturaId === facturaId),
    isViewingPdf: Boolean(facturaId && viewingFacturaId === facturaId),
    isDownloading: Boolean(facturaId && downloadingFacturaId === facturaId),
    isSending: Boolean(facturaId && sendingFacturaId === facturaId),
  };
}

export function renderHeader({ items = [], state = {} } = {}) {
  const stats = computeStats(items);
  const loading = Boolean(state?.loading);
  const refreshing = Boolean(state?.refreshing);
  const remoteCount = safeNumber(state?.remoteCount, safeArray(items).length);
  const lastSyncText = state?.lastSyncAt
    ? formatRelativeDate(state.lastSyncAt)
    : "Sin sincronización reciente";

  return `
    <section
      class="facturas-hero"
      style="
        position:relative;
        overflow:hidden;
        border-radius:calc(var(--panel-radius) + 6px);
        border:1px solid var(--border-soft);
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent), transparent 34%),
          linear-gradient(180deg, var(--surface-2, var(--surface-glass)), var(--surface-1, var(--surface-glass)));
        box-shadow:var(--shadow-md);
      "
    >
      <div
        style="
          display:grid;
          gap:var(--space-lg);
          padding:clamp(20px, 3vw, 30px);
        "
      >
        <div
          style="
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:18px;
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
                padding:0 12px;
                border-radius:999px;
                border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft));
                background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
                color:var(--text-soft);
                font-size:12px;
                font-weight:var(--weight-bold);
                letter-spacing:.06em;
                text-transform:uppercase;
              "
            >
              Facturación
            </span>

            <div style="display:grid; gap:8px;">
              <h1
                class="page-title"
                style="
                  margin:0;
                  font-size:clamp(30px, 5vw, 48px);
                  line-height:.98;
                  letter-spacing:-.05em;
                  color:var(--text-strong);
                "
              >
                Centro de control de facturas
              </h1>

              <p
                class="page-subtitle"
                style="
                  margin:0;
                  max-width:860px;
                  color:var(--text-dim);
                  font-size:clamp(14px, 2vw, 16px);
                  line-height:1.6;
                "
              >
                Gestiona emisión, seguimiento, consulta y descarga de documentos fiscales
                desde una tabla premium con lectura rápida, contexto financiero y acciones directas.
              </p>
            </div>
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
              id="facturas-export-btn"
              type="button"
              style="
                min-height:42px;
                padding:0 14px;
                border-radius:var(--btn-radius);
                border:1px solid var(--btn-secondary-border, var(--border-soft));
                background:var(--btn-secondary-bg, var(--surface-glass));
                color:var(--btn-secondary-text, var(--text-soft));
                font-weight:var(--weight-bold);
                cursor:pointer;
              "
            >
              Exportar CSV
            </button>

            <button
              id="facturas-refresh-btn"
              type="button"
              ${loading || refreshing ? "disabled" : ""}
              style="
                min-height:42px;
                padding:0 14px;
                border-radius:var(--btn-radius);
                border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
                background:var(--btn-primary-bg, var(--accent, #7c5cff));
                color:var(--btn-primary-text, #fff);
                font-weight:var(--weight-bold);
                cursor:${loading || refreshing ? "not-allowed" : "pointer"};
                opacity:${loading || refreshing ? ".72" : "1"};
              "
            >
              ${
                refreshing
                  ? renderInlineSpinner("Actualizando...")
                  : "Actualizar"
              }
            </button>
          </div>
        </div>

        <div
          class="facturas-hero-meta"
          style="
            display:flex;
            align-items:center;
            gap:10px;
            flex-wrap:wrap;
          "
        >
          <span
            style="
              display:inline-flex;
              align-items:center;
              min-height:30px;
              padding:0 10px;
              border-radius:999px;
              border:1px solid var(--border-soft);
              background:var(--surface-glass);
              color:var(--text-dim);
              font-size:12px;
              font-weight:var(--weight-bold);
              letter-spacing:.04em;
              text-transform:uppercase;
            "
          >
            ${escapeHtml(String(remoteCount))} registros remotos
          </span>

          <span
            style="
              display:inline-flex;
              align-items:center;
              min-height:30px;
              padding:0 10px;
              border-radius:999px;
              border:1px solid var(--border-soft);
              background:var(--surface-glass);
              color:var(--text-dim);
              font-size:12px;
              font-weight:var(--weight-bold);
              letter-spacing:.04em;
              text-transform:uppercase;
            "
          >
            Última sync · ${escapeHtml(lastSyncText)}
          </span>

          ${
            refreshing || loading
              ? `
                <span
                  style="
                    display:inline-flex;
                    align-items:center;
                    gap:8px;
                    min-height:30px;
                    padding:0 10px;
                    border-radius:999px;
                    border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft));
                    background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
                    color:var(--text-soft);
                    font-size:12px;
                    font-weight:var(--weight-bold);
                    letter-spacing:.04em;
                    text-transform:uppercase;
                  "
                >
                  <span
                    aria-hidden="true"
                    style="
                      width:10px;
                      height:10px;
                      border-radius:999px;
                      background:var(--accent, #7c5cff);
                      box-shadow:0 0 0 0 color-mix(in srgb, var(--accent, #7c5cff) 30%, transparent);
                      animation:facturasPulse 1.35s ease-in-out infinite;
                    "
                  ></span>
                  Sincronizando
                </span>
              `
              : ""
          }
        </div>

        <div
          class="facturas-hero-stats"
          style="
            display:grid;
            grid-template-columns:repeat(4, minmax(0, 1fr));
            gap:var(--space-md);
          "
        >
          ${renderStatCard({
            label: "Facturas visibles",
            value: String(stats.totalFacturas),
            caption: `${remoteCount} registros totales cargados en la colección.`,
            accent: true,
          })}

          ${renderStatCard({
            label: "Importe agregado",
            value: formatMoney(stats.totalImporte, "EUR"),
            caption: "Suma de la colección actualmente visible.",
          })}

          ${renderStatCard({
            label: "Pendientes",
            value: String(stats.pendingCount),
            caption: "Facturas con cobro pendiente o parcial.",
          })}

          ${renderStatCard({
            label: "Vencidas / pagadas",
            value: `${stats.overdueCount} / ${stats.paidCount}`,
            caption: "Balance rápido entre deuda vencida y cobros cerrados.",
          })}
        </div>
      </div>

      <style>
        @keyframes facturasPulse {
          0% { transform:scale(.92); opacity:.75; }
          50% { transform:scale(1.08); opacity:1; }
          100% { transform:scale(.92); opacity:.75; }
        }

        @media (max-width: 1100px) {
          .facturas-hero-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 720px) {
          .facturas-hero-stats {
            grid-template-columns: 1fr !important;
          }
        }
      </style>
    </section>
  `;
}

export function renderLoadingState() {
  return `
    <section
      class="panel-surface facturas-table-shell"
      style="
        overflow:hidden;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
      "
    >
      <div style="display:grid; gap:0; overflow:auto;">
        <div style="min-width:1180px;">
          <div
            style="
              display:grid;
              grid-template-columns: 1.6fr .9fr .8fr .8fr .8fr 1fr 1.2fr;
              gap:0;
              border-bottom:1px solid var(--border-soft);
              background:var(--surface-2, var(--surface-glass));
            "
          >
            ${Array.from({ length: 7 })
              .map(
                () => `
                  <div style="padding:16px 18px;">
                    <div
                      style="
                        height:12px;
                        width:70%;
                        border-radius:999px;
                        background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass));
                        background-size:200% 100%;
                        animation:facturasSkeleton 1.25s linear infinite;
                      "
                    ></div>
                  </div>
                `
              )
              .join("")}
          </div>

          ${Array.from({ length: 8 })
            .map(
              () => `
                <div
                  style="
                    display:grid;
                    grid-template-columns: 1.6fr .9fr .8fr .8fr .8fr 1fr 1.2fr;
                    gap:0;
                    border-bottom:1px solid var(--border-soft);
                  "
                >
                  <div style="padding:18px;">
                    <div style="display:flex; gap:12px; align-items:center;">
                      <div
                        style="
                          width:42px;
                          height:42px;
                          border-radius:14px;
                          background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass));
                          background-size:200% 100%;
                          animation:facturasSkeleton 1.25s linear infinite;
                        "
                      ></div>

                      <div style="display:grid; gap:8px; flex:1;">
                        <div style="height:14px; width:130px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:facturasSkeleton 1.25s linear infinite;"></div>
                        <div style="height:12px; width:200px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:facturasSkeleton 1.25s linear infinite;"></div>
                        <div style="height:12px; width:170px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:facturasSkeleton 1.25s linear infinite;"></div>
                      </div>
                    </div>
                  </div>

                  <div style="padding:18px;"><div style="height:34px; width:96px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:facturasSkeleton 1.25s linear infinite;"></div></div>
                  <div style="padding:18px;"><div style="height:34px; width:92px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:facturasSkeleton 1.25s linear infinite;"></div></div>
                  <div style="padding:18px;"><div style="height:14px; width:86px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:facturasSkeleton 1.25s linear infinite;"></div></div>
                  <div style="padding:18px;"><div style="height:14px; width:116px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:facturasSkeleton 1.25s linear infinite;"></div></div>
                  <div style="padding:18px;"><div style="height:14px; width:92px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:facturasSkeleton 1.25s linear infinite;"></div></div>

                  <div style="padding:18px;">
                    <div style="display:flex; gap:8px; justify-content:flex-end;">
                      <div style="height:38px; width:82px; border-radius:12px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:facturasSkeleton 1.25s linear infinite;"></div>
                      <div style="height:38px; width:82px; border-radius:12px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:facturasSkeleton 1.25s linear infinite;"></div>
                      <div style="height:38px; width:96px; border-radius:12px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:facturasSkeleton 1.25s linear infinite;"></div>
                    </div>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
      </div>

      <style>
        @keyframes facturasSkeleton {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      </style>
    </section>
  `;
}

export function renderErrorState(message = "No se pudo cargar la colección.") {
  return `
    <section
      class="panel-surface facturas-error-state"
      style="
        display:grid;
        gap:18px;
        padding:28px;
        border-radius:var(--panel-radius);
        border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, var(--border-soft));
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--danger-strong, #ff6b6b) 10%, transparent), transparent 72%),
          var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
      "
    >
      <div style="display:grid; gap:8px;">
        <span
          style="
            display:inline-flex;
            width:max-content;
            min-height:28px;
            align-items:center;
            padding:0 12px;
            border-radius:999px;
            border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
            background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 12%, transparent);
            color:var(--danger-strong, #ff6b6b);
            font-size:12px;
            letter-spacing:.06em;
            text-transform:uppercase;
            font-weight:var(--weight-bold);
          "
        >
          Error de carga
        </span>

        <h3
          style="
            margin:0;
            font-size:clamp(24px, 3vw, 34px);
            line-height:1.05;
            color:var(--text-strong);
            letter-spacing:-.04em;
          "
        >
          No se pudo renderizar la vista de facturas
        </h3>

        <p
          style="
            margin:0;
            color:var(--text-dim);
            font-size:var(--font-base);
            line-height:1.65;
            max-width:780px;
          "
        >
          ${escapeHtml(safeText(message, "Error desconocido al cargar la vista."))}
        </p>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button
          id="facturas-retry-btn"
          type="button"
          style="
            min-height:42px;
            padding:0 14px;
            border-radius:var(--btn-radius);
            border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
            background:var(--btn-primary-bg, var(--accent, #7c5cff));
            color:var(--btn-primary-text, #fff);
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

function renderEmptyState() {
  return `
    <section
      class="panel-surface facturas-empty-state"
      style="
        display:grid;
        gap:18px;
        padding:28px;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
      "
    >
      <div style="display:grid; gap:8px;">
        <span
          style="
            display:inline-flex;
            width:max-content;
            min-height:28px;
            align-items:center;
            padding:0 12px;
            border-radius:999px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
            color:var(--text-dim);
            font-size:12px;
            letter-spacing:.06em;
            text-transform:uppercase;
            font-weight:var(--weight-bold);
          "
        >
          Sin resultados
        </span>

        <h3
          style="
            margin:0;
            font-size:clamp(24px, 3vw, 34px);
            line-height:1.05;
            color:var(--text-strong);
            letter-spacing:-.04em;
          "
        >
          No hay facturas para mostrar
        </h3>

        <p
          style="
            margin:0;
            color:var(--text-dim);
            font-size:var(--font-base);
            line-height:1.65;
            max-width:760px;
          "
        >
          Todavía no hay facturas disponibles en la colección actual.
        </p>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button
          id="facturas-refresh-btn"
          type="button"
          style="
            min-height:42px;
            padding:0 14px;
            border-radius:var(--btn-radius);
            border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
            background:var(--btn-primary-bg, var(--accent, #7c5cff));
            color:var(--btn-primary-text, #fff);
            font-weight:var(--weight-bold);
            cursor:pointer;
          "
        >
          Recargar
        </button>
      </div>
    </section>
  `;
}

function renderTableToolbar({
  total = 0,
  refreshing = false,
} = {}) {
  return `
    <div
      class="facturas-table-toolbar"
      style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:14px;
        padding:16px 18px;
        border-bottom:1px solid var(--border-soft);
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 6%, transparent), transparent),
          var(--surface-1, var(--surface-glass));
        flex-wrap:wrap;
      "
    >
      <div style="display:grid; gap:4px;">
        <strong
          style="
            color:var(--text-strong);
            font-size:var(--font-base);
            letter-spacing:-.02em;
          "
        >
          Tabla de facturas
        </strong>

        <span
          style="
            color:var(--text-dim);
            font-size:var(--font-sm);
          "
        >
          ${escapeHtml(String(total))} registro${total === 1 ? "" : "s"} visible${total === 1 ? "" : "s"} en pantalla.
        </span>
      </div>

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
            min-height:30px;
            padding:0 10px;
            border-radius:999px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
            color:var(--text-dim);
            font-size:12px;
            font-weight:var(--weight-bold);
            letter-spacing:.04em;
            text-transform:uppercase;
          "
        >
          Vista tabla
        </span>

        ${
          refreshing
            ? `
              <span
                style="
                  display:inline-flex;
                  align-items:center;
                  gap:8px;
                  min-height:30px;
                  padding:0 10px;
                  border-radius:999px;
                  border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 22%, var(--border-soft));
                  background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
                  color:var(--text-soft);
                  font-size:12px;
                  font-weight:var(--weight-bold);
                  letter-spacing:.04em;
                  text-transform:uppercase;
                "
              >
                <span
                  aria-hidden="true"
                  style="
                    width:8px;
                    height:8px;
                    border-radius:999px;
                    background:var(--accent, #7c5cff);
                    animation:facturasPulse 1.25s ease-in-out infinite;
                  "
                ></span>
                Actualizando
              </span>
            `
            : ""
        }
      </div>
    </div>
  `;
}

function renderTableLoadingOverlay(message = "Actualizando facturas...") {
  return `
    <div
      class="facturas-table-overlay"
      aria-live="polite"
      aria-busy="true"
      style="
        position:absolute;
        inset:0;
        display:grid;
        place-items:center;
        padding:18px;
        background:color-mix(in srgb, var(--surface-1, #0f1115) 74%, transparent);
        backdrop-filter:blur(4px);
        z-index:4;
      "
    >
      <div
        style="
          display:grid;
          justify-items:center;
          gap:12px;
          min-width:min(100%, 240px);
          padding:18px 20px;
          border-radius:18px;
          border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 22%, var(--border-soft));
          background:linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent), transparent), var(--surface-1, var(--surface-glass));
          box-shadow:0 20px 40px rgba(0,0,0,.22);
        "
      >
        <span
          aria-hidden="true"
          style="
            width:28px;
            height:28px;
            border-radius:999px;
            border:3px solid color-mix(in srgb, var(--accent, #7c5cff) 16%, transparent);
            border-top-color:var(--accent, #7c5cff);
            animation:facturasSpin .8s linear infinite;
          "
        ></span>

        <strong
          style="
            color:var(--text-strong);
            font-size:14px;
            letter-spacing:-.02em;
          "
        >
          ${escapeHtml(message)}
        </strong>

        <span
          style="
            color:var(--text-dim);
            font-size:12px;
          "
        >
          Solo se está actualizando la colección principal
        </span>
      </div>
    </div>
  `;
}

function renderFacturaRow(item = {}, state = {}) {
  const busy = resolveBusyMeta(item, state);

  const facturaId = busy.facturaId;
  const numero = safeText(item?.numero, "—");
  const cliente = safeText(
    first(item?.clienteEmpresa, item?.cliente?.empresa, item?.clienteNombre, item?.cliente?.nombre),
    "Cliente"
  );
  const email = safeText(
    first(item?.clienteEmail, item?.cliente?.email),
    "Sin email"
  );
  const fecha = formatDate(item?.fecha);
  const updatedAt = formatRelativeDate(first(item?.updatedAt, item?.fechaEnvio, item?.fecha));
  const total = formatMoney(item?.total, item?.moneda || "EUR");
  const formaPago = safeText(item?.formaPago, "—");
  const estadoPago = getEstadoPagoLabel(item?.estadoPago);
  const estado = getEstadoLabel(item?.estado);
  const pdfAvailable = Boolean(item?.pdfAvailable || item?.blobPath || item?.pdfUrl);
  const initials = getClientInitials(item);

  return `
    <tr
      class="facturas-row ${busy.isOpening ? "is-opening" : ""}"
      data-factura-id="${escapeHtml(facturaId)}"
      style="
        transition:background .18s ease, transform .18s ease, opacity .18s ease;
        opacity:${busy.isOpening ? ".72" : "1"};
      "
    >
      <td style="padding:18px; border-bottom:1px solid var(--border-soft); vertical-align:middle;">
        <div style="display:flex; gap:14px; align-items:center; min-width:280px;">
          <div
            aria-hidden="true"
            style="
              flex:0 0 44px;
              width:44px;
              height:44px;
              border-radius:14px;
              display:grid;
              place-items:center;
              background:
                linear-gradient(135deg, color-mix(in srgb, var(--accent, #7c5cff) 22%, transparent), transparent),
                var(--surface-glass);
              border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 18%, var(--border-soft));
              color:var(--text-strong);
              font-weight:var(--weight-black);
              letter-spacing:.03em;
              box-shadow:var(--shadow-xs, 0 4px 14px rgba(0,0,0,.08));
            "
          >
            ${escapeHtml(initials)}
          </div>

          <div style="display:grid; gap:5px; min-width:0;">
            <button
              type="button"
              data-action="open-factura"
              data-factura-id="${escapeHtml(facturaId)}"
              ${busy.isOpening ? "disabled" : ""}
              style="
                margin:0;
                padding:0;
                border:none;
                background:transparent;
                text-align:left;
                color:var(--text-strong);
                font-size:var(--font-base);
                font-weight:var(--weight-black);
                letter-spacing:-.02em;
                line-height:1.2;
                cursor:${busy.isOpening ? "wait" : "pointer"};
              "
              title="Abrir detalle de factura"
            >
              ${escapeHtml(numero)}
            </button>

            <span
              style="
                color:var(--text-soft);
                font-size:var(--font-sm);
                font-weight:var(--weight-semibold);
                line-height:1.35;
                word-break:break-word;
              "
            >
              ${escapeHtml(cliente)}
            </span>

            <span
              style="
                color:var(--text-dim);
                font-size:12px;
                line-height:1.35;
                word-break:break-word;
              "
            >
              ${escapeHtml(email)}
            </span>
          </div>
        </div>
      </td>

      <td style="padding:18px; border-bottom:1px solid var(--border-soft); vertical-align:middle; white-space:nowrap;">
        ${renderStatusChip(estadoPago, getEstadoPagoChipStyle(item?.estadoPago))}
      </td>

      <td style="padding:18px; border-bottom:1px solid var(--border-soft); vertical-align:middle; white-space:nowrap;">
        ${renderStatusChip(estado, getEstadoChipStyle(item?.estado))}
      </td>

      <td style="padding:18px; border-bottom:1px solid var(--border-soft); vertical-align:middle; white-space:nowrap;">
        <div style="display:grid; gap:4px;">
          <strong style="color:var(--text-strong); font-size:var(--font-sm); line-height:1.2;">
            ${escapeHtml(fecha)}
          </strong>
          <span style="color:var(--text-dim); font-size:12px; line-height:1.2;">
            Emisión
          </span>
        </div>
      </td>

      <td style="padding:18px; border-bottom:1px solid var(--border-soft); vertical-align:middle; white-space:nowrap;">
        <div style="display:grid; gap:4px;">
          <strong style="color:var(--text-strong); font-size:var(--font-sm); line-height:1.2;">
            ${escapeHtml(total)}
          </strong>
          <span style="color:var(--text-dim); font-size:12px; line-height:1.2;">
            ${escapeHtml(formaPago)}
          </span>
        </div>
      </td>

      <td style="padding:18px; border-bottom:1px solid var(--border-soft); vertical-align:middle; white-space:nowrap;">
        <div style="display:grid; gap:6px;">
          <span
            style="
              color:var(--text-soft);
              font-size:var(--font-sm);
              line-height:1.2;
              font-weight:var(--weight-semibold);
            "
          >
            ${escapeHtml(updatedAt)}
          </span>

          ${
            pdfAvailable
              ? `
                <span
                  style="
                    display:inline-flex;
                    align-items:center;
                    width:max-content;
                    min-height:24px;
                    padding:0 8px;
                    border-radius:999px;
                    border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 20%, var(--border-soft));
                    background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
                    color:var(--text-soft);
                    font-size:11px;
                    font-weight:var(--weight-bold);
                    letter-spacing:.04em;
                    text-transform:uppercase;
                  "
                >
                  PDF
                </span>
              `
              : `
                <span
                  style="
                    display:inline-flex;
                    align-items:center;
                    width:max-content;
                    min-height:24px;
                    padding:0 8px;
                    border-radius:999px;
                    border:1px solid var(--border-soft);
                    background:var(--surface-glass);
                    color:var(--text-dim);
                    font-size:11px;
                    font-weight:var(--weight-bold);
                    letter-spacing:.04em;
                    text-transform:uppercase;
                  "
                >
                  Sin PDF
                </span>
              `
          }
        </div>
      </td>

      <td style="padding:18px; border-bottom:1px solid var(--border-soft); vertical-align:middle; text-align:right;">
        <div style="display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap;">
          <button
            type="button"
            data-action="open-factura"
            data-factura-id="${escapeHtml(facturaId)}"
            ${busy.isOpening ? "disabled" : ""}
            style="
              min-height:38px;
              min-width:96px;
              padding:0 12px;
              border-radius:12px;
              border:1px solid var(--btn-secondary-border, var(--border-soft));
              background:var(--btn-secondary-bg, var(--surface-glass));
              color:var(--btn-secondary-text, var(--text-soft));
              font-weight:var(--weight-bold);
              cursor:${busy.isOpening ? "wait" : "pointer"};
              opacity:${busy.isOpening ? ".88" : "1"};
              white-space:nowrap;
            "
          >
            ${busy.isOpening ? renderInlineSpinner("Abriendo...") : "Detalle"}
          </button>

          <button
            type="button"
            data-action="view-factura-pdf"
            data-factura-id="${escapeHtml(facturaId)}"
            ${pdfAvailable && !busy.isViewingPdf ? "" : "disabled"}
            style="
              min-height:38px;
              min-width:96px;
              padding:0 12px;
              border-radius:12px;
              border:1px solid var(--btn-secondary-border, var(--border-soft));
              background:var(--btn-secondary-bg, var(--surface-glass));
              color:var(--btn-secondary-text, var(--text-soft));
              font-weight:var(--weight-bold);
              cursor:${pdfAvailable && !busy.isViewingPdf ? "pointer" : "not-allowed"};
              opacity:${pdfAvailable ? (busy.isViewingPdf ? ".78" : "1") : ".56"};
              white-space:nowrap;
            "
          >
            ${busy.isViewingPdf ? renderInlineSpinner("Abriendo...") : "Ver PDF"}
          </button>

          <button
            type="button"
            data-action="download-factura"
            data-factura-id="${escapeHtml(facturaId)}"
            ${pdfAvailable && !busy.isDownloading ? "" : "disabled"}
            style="
              min-height:38px;
              min-width:108px;
              padding:0 12px;
              border-radius:12px;
              border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
              background:var(--btn-primary-bg, var(--accent, #7c5cff));
              color:var(--btn-primary-text, #fff);
              font-weight:var(--weight-bold);
              cursor:${pdfAvailable && !busy.isDownloading ? "pointer" : "not-allowed"};
              opacity:${pdfAvailable ? (busy.isDownloading ? ".78" : "1") : ".56"};
              white-space:nowrap;
            "
          >
            ${busy.isDownloading ? renderInlineSpinner("Bajando...") : "Descargar"}
          </button>

          <button
            type="button"
            data-action="send-factura"
            data-factura-id="${escapeHtml(facturaId)}"
            ${!busy.isSending ? "" : "disabled"}
            style="
              min-height:38px;
              min-width:96px;
              padding:0 12px;
              border-radius:12px;
              border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 28%, transparent);
              background:color-mix(in srgb, var(--success-strong, #36c690) 88%, transparent);
              color:#fff;
              font-weight:var(--weight-bold);
              cursor:${busy.isSending ? "wait" : "pointer"};
              opacity:${busy.isSending ? ".78" : "1"};
              white-space:nowrap;
            "
          >
            ${busy.isSending ? renderInlineSpinner("Enviando...") : "Enviar"}
          </button>
        </div>
      </td>
    </tr>
  `;
}

function renderMobileFacturaCard(item = {}, state = {}) {
  const busy = resolveBusyMeta(item, state);

  const facturaId = busy.facturaId;
  const numero = safeText(item?.numero, "—");
  const cliente = safeText(
    first(item?.clienteEmpresa, item?.cliente?.empresa, item?.clienteNombre, item?.cliente?.nombre),
    "Cliente"
  );
  const email = safeText(
    first(item?.clienteEmail, item?.cliente?.email),
    "Sin email"
  );
  const fecha = formatDate(item?.fecha);
  const updatedAt = formatRelativeDate(first(item?.updatedAt, item?.fechaEnvio, item?.fecha));
  const total = formatMoney(item?.total, item?.moneda || "EUR");
  const formaPago = safeText(item?.formaPago, "—");
  const estadoPago = getEstadoPagoLabel(item?.estadoPago);
  const estado = getEstadoLabel(item?.estado);
  const pdfAvailable = Boolean(item?.pdfAvailable || item?.blobPath || item?.pdfUrl);
  const initials = getClientInitials(item);

  return `
    <article
      class="facturas-mobile-card panel-surface"
      data-factura-id="${escapeHtml(facturaId)}"
      style="
        display:grid;
        gap:16px;
        padding:18px;
        border-radius:18px;
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
        opacity:${busy.isOpening ? ".72" : "1"};
      "
    >
      <div
        style="
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:12px;
        "
      >
        <div style="display:flex; gap:12px; min-width:0; flex:1;">
          <div
            aria-hidden="true"
            style="
              flex:0 0 42px;
              width:42px;
              height:42px;
              border-radius:14px;
              display:grid;
              place-items:center;
              background:
                linear-gradient(135deg, color-mix(in srgb, var(--accent, #7c5cff) 22%, transparent), transparent),
                var(--surface-glass);
              border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 18%, var(--border-soft));
              color:var(--text-strong);
              font-weight:var(--weight-black);
            "
          >
            ${escapeHtml(initials)}
          </div>

          <div style="display:grid; gap:5px; min-width:0;">
            <button
              type="button"
              data-action="open-factura"
              data-factura-id="${escapeHtml(facturaId)}"
              ${busy.isOpening ? "disabled" : ""}
              style="
                margin:0;
                padding:0;
                border:none;
                background:transparent;
                text-align:left;
                color:var(--text-strong);
                font-size:var(--font-base);
                font-weight:var(--weight-black);
                letter-spacing:-.02em;
                line-height:1.2;
                cursor:${busy.isOpening ? "wait" : "pointer"};
              "
            >
              ${escapeHtml(numero)}
            </button>

            <span
              style="
                color:var(--text-soft);
                font-size:var(--font-sm);
                font-weight:var(--weight-semibold);
                line-height:1.35;
                word-break:break-word;
              "
            >
              ${escapeHtml(cliente)}
            </span>

            <span
              style="
                color:var(--text-dim);
                font-size:12px;
                line-height:1.35;
                word-break:break-word;
              "
            >
              ${escapeHtml(email)}
            </span>
          </div>
        </div>

        <div style="display:grid; gap:8px; justify-items:end;">
          ${renderStatusChip(estadoPago, getEstadoPagoChipStyle(item?.estadoPago))}
          ${renderStatusChip(estado, getEstadoChipStyle(item?.estado))}
        </div>
      </div>

      <div
        style="
          display:grid;
          grid-template-columns:repeat(2, minmax(0, 1fr));
          gap:10px;
        "
      >
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
              letter-spacing:.05em;
              text-transform:uppercase;
            "
          >
            Fecha
          </span>
          <strong style="color:var(--text-strong); font-size:var(--font-sm);">
            ${escapeHtml(fecha)}
          </strong>
        </div>

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
              letter-spacing:.05em;
              text-transform:uppercase;
            "
          >
            Total
          </span>
          <strong style="color:var(--text-strong); font-size:var(--font-sm);">
            ${escapeHtml(total)}
          </strong>
        </div>

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
              letter-spacing:.05em;
              text-transform:uppercase;
            "
          >
            Pago
          </span>
          <strong style="color:var(--text-strong); font-size:var(--font-sm);">
            ${escapeHtml(formaPago)}
          </strong>
        </div>

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
              letter-spacing:.05em;
              text-transform:uppercase;
            "
          >
            Actualizada
          </span>
          <strong style="color:var(--text-strong); font-size:var(--font-sm);">
            ${escapeHtml(updatedAt)}
          </strong>
        </div>
      </div>

      <div
        style="
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          justify-content:flex-start;
        "
      >
        <button
          type="button"
          data-action="open-factura"
          data-factura-id="${escapeHtml(facturaId)}"
          ${busy.isOpening ? "disabled" : ""}
          style="
            min-height:38px;
            padding:0 12px;
            border-radius:12px;
            border:1px solid var(--btn-secondary-border, var(--border-soft));
            background:var(--btn-secondary-bg, var(--surface-glass));
            color:var(--btn-secondary-text, var(--text-soft));
            font-weight:var(--weight-bold);
            cursor:${busy.isOpening ? "wait" : "pointer"};
            opacity:${busy.isOpening ? ".88" : "1"};
          "
        >
          ${busy.isOpening ? renderInlineSpinner("Abriendo...") : "Detalle"}
        </button>

        <button
          type="button"
          data-action="view-factura-pdf"
          data-factura-id="${escapeHtml(facturaId)}"
          ${pdfAvailable && !busy.isViewingPdf ? "" : "disabled"}
          style="
            min-height:38px;
            padding:0 12px;
            border-radius:12px;
            border:1px solid var(--btn-secondary-border, var(--border-soft));
            background:var(--btn-secondary-bg, var(--surface-glass));
            color:var(--btn-secondary-text, var(--text-soft));
            font-weight:var(--weight-bold);
            cursor:${pdfAvailable && !busy.isViewingPdf ? "pointer" : "not-allowed"};
            opacity:${pdfAvailable ? (busy.isViewingPdf ? ".78" : "1") : ".56"};
          "
        >
          ${busy.isViewingPdf ? renderInlineSpinner("Abriendo...") : "Ver PDF"}
        </button>

        <button
          type="button"
          data-action="download-factura"
          data-factura-id="${escapeHtml(facturaId)}"
          ${pdfAvailable && !busy.isDownloading ? "" : "disabled"}
          style="
            min-height:38px;
            padding:0 12px;
            border-radius:12px;
            border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
            background:var(--btn-primary-bg, var(--accent, #7c5cff));
            color:var(--btn-primary-text, #fff);
            font-weight:var(--weight-bold);
            cursor:${pdfAvailable && !busy.isDownloading ? "pointer" : "not-allowed"};
            opacity:${pdfAvailable ? (busy.isDownloading ? ".78" : "1") : ".56"};
          "
        >
          ${busy.isDownloading ? renderInlineSpinner("Bajando...") : "Descargar"}
        </button>

        <button
          type="button"
          data-action="send-factura"
          data-factura-id="${escapeHtml(facturaId)}"
          ${!busy.isSending ? "" : "disabled"}
          style="
            min-height:38px;
            padding:0 12px;
            border-radius:12px;
            border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 28%, transparent);
            background:color-mix(in srgb, var(--success-strong, #36c690) 88%, transparent);
            color:#fff;
            font-weight:var(--weight-bold);
            cursor:${busy.isSending ? "wait" : "pointer"};
            opacity:${busy.isSending ? ".78" : "1"};
          "
        >
          ${busy.isSending ? renderInlineSpinner("Enviando...") : "Enviar"}
        </button>
      </div>
    </article>
  `;
}

function renderDesktopTable(items = [], state = {}) {
  return `
    <div
      class="facturas-table-scroll"
      style="
        width:100%;
        overflow:auto;
      "
    >
      <table
        class="facturas-table"
        style="
          width:100%;
          min-width:1280px;
          border-collapse:separate;
          border-spacing:0;
        "
      >
        <thead>
          <tr style="background:var(--surface-2, var(--surface-glass));">
            <th style="padding:16px 18px; text-align:left; font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--text-dim); font-weight:var(--weight-bold); border-bottom:1px solid var(--border-soft); white-space:nowrap;">
              Factura / cliente
            </th>
            <th style="padding:16px 18px; text-align:left; font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--text-dim); font-weight:var(--weight-bold); border-bottom:1px solid var(--border-soft); white-space:nowrap;">
              Pago
            </th>
            <th style="padding:16px 18px; text-align:left; font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--text-dim); font-weight:var(--weight-bold); border-bottom:1px solid var(--border-soft); white-space:nowrap;">
              Estado
            </th>
            <th style="padding:16px 18px; text-align:left; font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--text-dim); font-weight:var(--weight-bold); border-bottom:1px solid var(--border-soft); white-space:nowrap;">
              Fecha
            </th>
            <th style="padding:16px 18px; text-align:left; font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--text-dim); font-weight:var(--weight-bold); border-bottom:1px solid var(--border-soft); white-space:nowrap;">
              Total
            </th>
            <th style="padding:16px 18px; text-align:left; font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--text-dim); font-weight:var(--weight-bold); border-bottom:1px solid var(--border-soft); white-space:nowrap;">
              Actualización
            </th>
            <th style="padding:16px 18px; text-align:right; font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--text-dim); font-weight:var(--weight-bold); border-bottom:1px solid var(--border-soft); white-space:nowrap;">
              Acciones
            </th>
          </tr>
        </thead>

        <tbody>
          ${safeArray(items).map((item) => renderFacturaRow(item, state)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderMobileCards(items = [], state = {}) {
  return `
    <div
      class="facturas-mobile-list"
      style="
        display:none;
        gap:14px;
        padding:14px;
      "
    >
      ${safeArray(items).map((item) => renderMobileFacturaCard(item, state)).join("")}
    </div>
  `;
}

export function renderCards({ items = [], state = {} } = {}) {
  const list = safeArray(items);
  const loading = Boolean(state?.loading);
  const refreshing = Boolean(state?.refreshing);
  const error = safeText(state?.error, "");

  if (!loading && error && !list.length) {
    return renderErrorState(error);
  }

  if (!list.length) {
    return renderEmptyState();
  }

  return `
    <section
      class="facturas-table-wrap panel-surface"
      style="
        position:relative;
        overflow:hidden;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--surface-2, transparent) 60%, transparent), transparent),
          var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
      "
    >
      ${renderTableToolbar({
        total: list.length,
        refreshing,
      })}

      <div class="facturas-desktop-table">
        ${renderDesktopTable(list, state)}
      </div>

      ${renderMobileCards(list, state)}

      ${refreshing ? renderTableLoadingOverlay("Actualizando facturas...") : ""}

      <style>
        @keyframes facturasSpin {
          to { transform: rotate(360deg); }
        }

        .facturas-table tbody tr:hover {
          background: color-mix(in srgb, var(--accent, #7c5cff) 4%, transparent);
        }

        .facturas-table tbody tr:last-child td {
          border-bottom: none;
        }

        .facturas-table tbody tr.is-opening:hover {
          background: color-mix(in srgb, var(--warning-strong, #ffbc42) 5%, transparent);
        }

        .facturas-table-scroll::-webkit-scrollbar {
          height: 10px;
          width: 10px;
        }

        .facturas-table-scroll::-webkit-scrollbar-thumb {
          background: color-mix(in srgb, var(--accent, #7c5cff) 20%, var(--border-soft));
          border-radius: 999px;
        }

        .facturas-table-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        @media (max-width: 980px) {
          .facturas-desktop-table {
            display: none !important;
          }

          .facturas-mobile-list {
            display: grid !important;
          }
        }
      </style>
    </section>
  `;
}
