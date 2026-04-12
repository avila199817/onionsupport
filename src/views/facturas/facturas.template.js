/* =========================================================
   Onion SPA - Facturas Template (FINAL PRO CLEAN)
   Archivo: src/views/facturas/facturas.template.js

   Responsabilidades:
   - renderizar header premium de la vista
   - renderizar estados loading / error / empty
   - renderizar grid de cards de facturas
   - mantener compatibilidad directa con facturasView.js
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
    return diffMinutes > 0 ? `En ${absMinutes} min` : `Hace ${absMinutes} min`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  const absHours = Math.abs(diffHours);

  if (absHours < 24) {
    return diffHours > 0 ? `En ${absHours} h` : `Hace ${absHours} h`;
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

  if (["borrador", "draft"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  if (["cancelada", "cancelled"].includes(key)) {
    return `
      color:var(--danger-strong, #ff6b6b);
      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
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
        border:1px solid ${accent ? "color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft))" : "var(--border-soft)"};
        background:${accent ? "linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 72%), var(--surface-1, var(--surface-glass))" : "var(--surface-1, var(--surface-glass))"};
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
  const totalImporte = list.reduce((acc, item) => acc + safeNumber(item?.total, 0), 0);

  const paidCount = list.filter((item) => {
    const estado = String(item?.estadoPago || "").toLowerCase();
    return ["paid", "pagada", "pagado", "cobrada"].includes(estado);
  }).length;

  const pendingCount = list.filter((item) => {
    const estado = String(item?.estadoPago || "").toLowerCase();
    return ["pending", "pendiente", "partial", "parcial"].includes(estado);
  }).length;

  const overdueCount = list.filter((item) => {
    const estado = String(item?.estadoPago || "").toLowerCase();
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

export function renderHeader({ items = [], state = {} } = {}) {
  const stats = computeStats(items);
  const loading = Boolean(state?.loading);
  const refreshing = Boolean(state?.refreshing);
  const remoteCount = safeNumber(state?.remoteCount, safeArray(items).length);

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
                desde una vista unificada con lectura rápida y acciones directas.
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
              ${refreshing ? "Actualizando..." : "Actualizar"}
            </button>
          </div>
        </div>

        <div
          style="
            display:grid;
            grid-template-columns:repeat(4, minmax(0, 1fr));
            gap:var(--space-md);
          "
          class="facturas-hero-stats"
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
      class="facturas-loading-grid"
      style="
        display:grid;
        grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));
        gap:var(--space-lg);
      "
    >
      ${Array.from({ length: 6 })
        .map(
          () => `
            <article
              class="panel-surface"
              style="
                display:grid;
                gap:16px;
                min-height:260px;
                padding:20px;
                border-radius:var(--panel-radius);
                border:1px solid var(--border-soft);
                background:var(--surface-1, var(--surface-glass));
                box-shadow:var(--shadow-sm);
              "
            >
              <div style="display:flex; justify-content:space-between; gap:12px;">
                <div style="display:grid; gap:10px; flex:1;">
                  <div style="height:14px; width:90px; border-radius:999px; background:var(--surface-glass);"></div>
                  <div style="height:28px; width:68%; border-radius:12px; background:var(--surface-glass);"></div>
                  <div style="height:12px; width:52%; border-radius:999px; background:var(--surface-glass);"></div>
                </div>

                <div style="height:44px; width:92px; border-radius:14px; background:var(--surface-glass);"></div>
              </div>

              <div style="display:grid; gap:10px;">
                <div style="height:12px; width:100%; border-radius:999px; background:var(--surface-glass);"></div>
                <div style="height:12px; width:82%; border-radius:999px; background:var(--surface-glass);"></div>
              </div>

              <div
                style="
                  display:grid;
                  grid-template-columns:repeat(3, minmax(0, 1fr));
                  gap:10px;
                "
              >
                <div style="height:70px; border-radius:16px; background:var(--surface-glass);"></div>
                <div style="height:70px; border-radius:16px; background:var(--surface-glass);"></div>
                <div style="height:70px; border-radius:16px; background:var(--surface-glass);"></div>
              </div>

              <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <div style="height:40px; width:110px; border-radius:12px; background:var(--surface-glass);"></div>
                <div style="height:40px; width:100px; border-radius:12px; background:var(--surface-glass);"></div>
                <div style="height:40px; width:96px; border-radius:12px; background:var(--surface-glass);"></div>
              </div>
            </article>
          `
        )
        .join("")}
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

function renderMetaTile(label = "", value = "") {
  return `
    <div
      style="
        display:grid;
        gap:6px;
        min-height:78px;
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
          font-weight:var(--weight-bold);
          letter-spacing:.05em;
          text-transform:uppercase;
        "
      >
        ${escapeHtml(label)}
      </span>

      <strong
        style="
          color:var(--text-strong);
          font-size:var(--font-base);
          line-height:1.25;
        "
      >
        ${escapeHtml(value)}
      </strong>
    </div>
  `;
}

function renderFacturaCard(item = {}) {
  const facturaId = safeText(item?.id, "");
  const numero = safeText(item?.numero, "—");
  const cliente = safeText(item?.cliente?.empresa || item?.cliente?.nombre, "Cliente");
  const email = safeText(item?.cliente?.email, "Sin email");
  const fecha = formatDate(item?.fecha);
  const updatedAt = formatRelativeDate(item?.updatedAt);
  const total = formatMoney(item?.total, item?.moneda || "EUR");
  const formaPago = safeText(item?.formaPago, "—");
  const preview = safeText(
    item?.preview || item?.descripcion || item?.concepto,
    "Documento fiscal disponible para consulta."
  );
  const estadoPago = getEstadoPagoLabel(item?.estadoPago);
  const estado = getEstadoLabel(item?.estado);
  const initials = safeText(item?.cliente?.initials, "ON").slice(0, 2).toUpperCase();
  const pdfAvailable = Boolean(item?.pdfAvailable || item?.blobPath);

  return `
    <article
      class="factura-card panel-surface"
      data-factura-id="${escapeHtml(facturaId)}"
      style="
        position:relative;
        overflow:hidden;
        display:grid;
        gap:18px;
        min-height:290px;
        padding:20px;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--surface-2, transparent) 68%, transparent), transparent),
          var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
        cursor:pointer;
        transition:
          transform .18s ease,
          box-shadow .18s ease,
          border-color .18s ease;
      "
      onmouseenter="this.style.transform='translateY(-2px)'; this.style.boxShadow='var(--shadow-md)';"
      onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow='var(--shadow-sm)';"
    >
      <div
        style="
          display:flex;
          justify-content:space-between;
          gap:14px;
          align-items:flex-start;
          flex-wrap:wrap;
        "
      >
        <div style="display:flex; gap:14px; min-width:0; flex:1;">
          <div
            aria-hidden="true"
            style="
              flex:0 0 48px;
              width:48px;
              height:48px;
              border-radius:16px;
              display:grid;
              place-items:center;
              background:
                linear-gradient(135deg, color-mix(in srgb, var(--accent, #7c5cff) 22%, transparent), transparent),
                var(--surface-glass);
              border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 18%, var(--border-soft));
              color:var(--text-strong);
              font-weight:var(--weight-black);
              letter-spacing:.03em;
            "
          >
            ${escapeHtml(initials)}
          </div>

          <div style="display:grid; gap:8px; min-width:0; flex:1;">
            <div style="display:grid; gap:4px;">
              <span
                style="
                  font-size:12px;
                  color:var(--text-dim);
                  font-weight:var(--weight-bold);
                  letter-spacing:.06em;
                  text-transform:uppercase;
                "
              >
                Factura
              </span>

              <h3
                style="
                  margin:0;
                  color:var(--text-strong);
                  font-size:clamp(20px, 3vw, 28px);
                  line-height:1.05;
                  letter-spacing:-.04em;
                  word-break:break-word;
                "
              >
                ${escapeHtml(numero)}
              </h3>

              <p
                style="
                  margin:0;
                  color:var(--text-soft);
                  font-size:var(--font-base);
                  font-weight:var(--weight-semibold);
                  word-break:break-word;
                "
              >
                ${escapeHtml(cliente)}
              </p>

              <p
                style="
                  margin:0;
                  color:var(--text-dim);
                  font-size:var(--font-sm);
                  word-break:break-word;
                "
              >
                ${escapeHtml(email)}
              </p>
            </div>
          </div>
        </div>

        <div style="display:grid; gap:8px; justify-items:end;">
          <span
            style="
              display:inline-flex;
              align-items:center;
              min-height:30px;
              padding:0 10px;
              border-radius:999px;
              font-size:12px;
              font-weight:var(--weight-bold);
              letter-spacing:.05em;
              text-transform:uppercase;
              ${getEstadoPagoChipStyle(item?.estadoPago)}
            "
          >
            ${escapeHtml(estadoPago)}
          </span>

          <span
            style="
              display:inline-flex;
              align-items:center;
              min-height:28px;
              padding:0 10px;
              border-radius:999px;
              font-size:11px;
              font-weight:var(--weight-bold);
              letter-spacing:.05em;
              text-transform:uppercase;
              ${getEstadoChipStyle(item?.estado)}
            "
          >
            ${escapeHtml(estado)}
          </span>
        </div>
      </div>

      <p
        style="
          margin:0;
          color:var(--text-dim);
          line-height:1.65;
          font-size:var(--font-sm);
        "
      >
        ${escapeHtml(preview)}
      </p>

      <div
        style="
          display:grid;
          grid-template-columns:repeat(3, minmax(0, 1fr));
          gap:10px;
        "
        class="factura-card-metas"
      >
        ${renderMetaTile("Fecha", fecha)}
        ${renderMetaTile("Total", total)}
        ${renderMetaTile("Pago", formaPago)}
      </div>

      <div
        style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          flex-wrap:wrap;
          margin-top:auto;
        "
      >
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
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
            "
          >
            Actualizado ${escapeHtml(updatedAt)}
          </span>

          ${
            pdfAvailable
              ? `
                <span
                  style="
                    display:inline-flex;
                    align-items:center;
                    min-height:28px;
                    padding:0 10px;
                    border-radius:999px;
                    border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 20%, var(--border-soft));
                    background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
                    color:var(--text-soft);
                    font-size:12px;
                    font-weight:var(--weight-bold);
                  "
                >
                  PDF disponible
                </span>
              `
              : ""
          }
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button
            type="button"
            data-action="open-factura"
            data-factura-id="${escapeHtml(facturaId)}"
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
            Detalle
          </button>

          <button
            type="button"
            data-action="view-factura-pdf"
            data-factura-id="${escapeHtml(facturaId)}"
            ${pdfAvailable ? "" : "disabled"}
            style="
              min-height:40px;
              padding:0 14px;
              border-radius:var(--btn-radius);
              border:1px solid var(--btn-secondary-border, var(--border-soft));
              background:var(--btn-secondary-bg, var(--surface-glass));
              color:var(--btn-secondary-text, var(--text-soft));
              font-weight:var(--weight-bold);
              cursor:${pdfAvailable ? "pointer" : "not-allowed"};
              opacity:${pdfAvailable ? "1" : ".56"};
            "
          >
            Ver PDF
          </button>

          <button
            type="button"
            data-action="download-factura"
            data-factura-id="${escapeHtml(facturaId)}"
            ${pdfAvailable ? "" : "disabled"}
            style="
              min-height:40px;
              padding:0 14px;
              border-radius:var(--btn-radius);
              border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
              background:var(--btn-primary-bg, var(--accent, #7c5cff));
              color:var(--btn-primary-text, #fff);
              font-weight:var(--weight-bold);
              cursor:${pdfAvailable ? "pointer" : "not-allowed"};
              opacity:${pdfAvailable ? "1" : ".56"};
            "
          >
            Descargar
          </button>
        </div>
      </div>

      <style>
        @media (max-width: 640px) {
          .factura-card-metas {
            grid-template-columns: 1fr !important;
          }
        }
      </style>
    </article>
  `;
}

export function renderCards({ items = [], state = {} } = {}) {
  const list = safeArray(items);
  const loading = Boolean(state?.loading);
  const error = safeText(state?.error, "");

  if (!loading && error && !list.length) {
    return renderErrorState(error);
  }

  if (!list.length) {
    return renderEmptyState();
  }

  return `
    <section
      class="facturas-cards-wrap"
      style="display:grid; gap:var(--space-lg);"
    >
      <div
        class="facturas-cards-grid"
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));
          gap:var(--space-lg);
          align-items:start;
        "
      >
        ${list.map((item) => renderFacturaCard(item)).join("")}
      </div>
    </section>
  `;
}
