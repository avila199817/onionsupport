/* =========================================================
   Onion SPA - Home Template (FINAL PRO DASHBOARD GOD MODE)
   Archivo: src/views/home/home.template.js

   EXTREME MODE · DASHBOARD SUMMARY FIRST · 10/10

   Responsabilidades:
   - renderizar header premium de la vista home
   - renderizar estados loading / error / empty
   - renderizar dashboard premium de widgets
   - mostrar loader SOLO en la sección principal
   - mostrar estado visual al abrir widget lento
   - mantener compatibilidad directa con homeView.js
   - consumir datos reales del backend /api/dashboard/summary
   - compartir lenguaje visual y densidad con Facturas / Incidencias

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - soporte para envelope backend { ok, requestId, data }
   - lectura preferente del shape normalizado del dashboard
   - mismo lenguaje visual premium
   - hero / skeleton / responsive / activity consistentes
========================================================= */

import { homeState } from "./home.state.js";

import {
  getHomeDashboardStore,
  getSortedHomeWidgetsStore,
} from "./home.store.js";

import {
  normalizeHomeDashboardModel,
  normalizeHomeWidgetModel,
  sortHomeWidgetsByUpdatedDesc,
  getWidgetStatusLabel,
  getWidgetTypeLabel,
  getInitials,
  getWidgetTheme,
} from "./home.model.js";

import {
  escapeHtml,
  formatDate,
  formatRelativeDate,
  truncate,
} from "./home.utils.js";

/* =========================================================
   SAFE
========================================================= */

const PAGE_SIZE = 6;

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

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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

/* =========================================================
   ENVELOPE / REAL DATA RESOLVE
========================================================= */

function looksLikeDashboardEnvelope(value) {
  const obj = safeObject(value);

  return Boolean(
    obj?.summary ||
      obj?.stats ||
      obj?.metrics ||
      Array.isArray(obj?.widgets) ||
      Array.isArray(obj?.cards) ||
      Array.isArray(obj?.kpis) ||
      Array.isArray(obj?.items) ||
      Array.isArray(obj?.recent) ||
      Array.isArray(obj?.activity) ||
      Array.isArray(obj?.timeline)
  );
}

function unwrapDashboardEnvelope(value) {
  if (!value) {
    return {};
  }

  if (looksLikeDashboardEnvelope(value)) {
    return value;
  }

  const obj = safeObject(value);

  if (looksLikeDashboardEnvelope(obj?.data)) {
    return unwrapDashboardEnvelope(obj.data);
  }

  if (looksLikeDashboardEnvelope(obj?.payload)) {
    return unwrapDashboardEnvelope(obj.payload);
  }

  if (looksLikeDashboardEnvelope(obj?.result)) {
    return unwrapDashboardEnvelope(obj.result);
  }

  if (looksLikeDashboardEnvelope(obj?.dashboard)) {
    return unwrapDashboardEnvelope(obj.dashboard);
  }

  return {};
}

function getResolvedDashboard(data) {
  const normalizedDirect = normalizeHomeDashboardModel(data);

  if (
    normalizedDirect.widgetsCount ||
    normalizedDirect.recentCount ||
    Object.keys(safeObject(normalizedDirect.summary)).length
  ) {
    return normalizedDirect;
  }

  const fromEnvelope = normalizeHomeDashboardModel(
    unwrapDashboardEnvelope(data)
  );

  if (
    fromEnvelope.widgetsCount ||
    fromEnvelope.recentCount ||
    Object.keys(safeObject(fromEnvelope.summary)).length
  ) {
    return fromEnvelope;
  }

  try {
    return normalizeHomeDashboardModel(getHomeDashboardStore());
  } catch {
    return normalizeHomeDashboardModel({});
  }
}

/* =========================================================
   PAGINATION
========================================================= */

function clampPage(page = 1, totalPages = 1) {
  const current = safeNumber(page, 1);
  return Math.min(Math.max(current, 1), Math.max(totalPages, 1));
}

function getPagination(items = [], state = {}) {
  const list = safeArray(items);
  const localState = safeObject(state);

  const pageSize = Math.max(1, safeNumber(localState.pageSize, PAGE_SIZE));
  const totalItems = list.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = clampPage(localState.page || 1, totalPages);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    start,
    end,
    items: list.slice(start, end),
    from: totalItems ? start + 1 : 0,
    to: Math.min(end, totalItems),
  };
}

/* =========================================================
   STATS
========================================================= */

function computeDashboardStats(dashboard = {}) {
  const summary = safeObject(dashboard.summary);
  const widgets = safeArray(dashboard.widgets);

  const activeCount = widgets.filter((item) => {
    const status = safeText(item.status, "").toLowerCase();
    return ["active", "ok", "ready", "enabled"].includes(status);
  }).length;

  const warningCount = widgets.filter((item) => {
    const status = safeText(item.status, "").toLowerCase();
    return ["warning", "pending", "degraded"].includes(status);
  }).length;

  const routeCount = widgets.filter((item) => {
    return Boolean(safeText(item.route, ""));
  }).length;

  const itemsCount = widgets.reduce((acc, item) => {
    return acc + safeArray(item.items).length;
  }, 0);

  return {
    widgetsTotal: widgets.length,
    activeCount,
    warningCount,
    routeCount,
    itemsCount,
    ticketsOpen: safeNumber(summary.ticketsOpen, 0),
    ticketsPending: safeNumber(summary.ticketsPending, 0),
    invoicesTotal: safeNumber(summary.invoicesTotal, 0),
    clientsTotal: safeNumber(summary.clientsTotal, 0),
    usersTotal: safeNumber(summary.usersTotal, 0),
    revenueTotal: safeNumber(summary.revenueTotal, 0),
  };
}

function renderStatCard({
  label = "",
  value = "0",
  caption = "",
  accent = false,
} = {}) {
  return `
    <article
      class="home-stat-card panel-surface"
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
        ${escapeHtml(String(value))}
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

/* =========================================================
   HERO
========================================================= */

export function renderHeader({ dashboard = {}, state = {} } = {}) {
  const resolvedDashboard = getResolvedDashboard(dashboard);
  const localState = state || homeState || {};
  const stats = computeDashboardStats(resolvedDashboard);

  const loading = Boolean(localState?.loading);
  const refreshing = Boolean(localState?.refreshing);
  const lastSyncText = localState?.lastSyncAt
    ? formatRelativeDate(localState.lastSyncAt)
    : "Sin sincronización reciente";

  const requestId = safeText(
    first(localState?.requestId, resolvedDashboard?.requestId),
    ""
  );

  return `
    <section
      class="home-hero"
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
              Dashboard ejecutivo
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
                Centro de control Home
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
                Visión agregada del sistema con métricas, widgets operativos,
                accesos rápidos y actividad reciente en un dashboard premium
                orientado a supervisión y decisión rápida.
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
              id="home-export-btn"
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
              id="home-refresh-btn"
              type="button"
              style="
                min-height:42px;
                padding:0 16px;
                border-radius:var(--btn-radius);
                border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
                background:var(--btn-primary-bg, var(--accent, #7c5cff));
                color:var(--btn-primary-text, #fff);
                font-weight:var(--weight-bold);
                cursor:pointer;
                box-shadow:0 10px 24px color-mix(in srgb, var(--accent, #7c5cff) 22%, transparent);
              "
            >
              Actualizar dashboard
            </button>
          </div>
        </div>

        <div
          class="home-hero-meta"
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
            ${escapeHtml(String(stats.widgetsTotal))} widgets visibles
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
            requestId
              ? `
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
                  Request · ${escapeHtml(requestId)}
                </span>
              `
              : ""
          }

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
                      animation:homePulse 1.35s ease-in-out infinite;
                    "
                  ></span>
                  Sincronizando
                </span>
              `
              : ""
          }
        </div>

        <div
          class="home-hero-stats"
          style="
            display:grid;
            grid-template-columns:repeat(4, minmax(0, 1fr));
            gap:var(--space-md);
          "
        >
          ${renderStatCard({
            label: "Tickets abiertos",
            value: String(stats.ticketsOpen),
            caption: "Resumen ejecutivo del volumen abierto.",
            accent: true,
          })}

          ${renderStatCard({
            label: "Tickets pendientes",
            value: String(stats.ticketsPending),
            caption: "Backlog operativo pendiente de resolver.",
          })}

          ${renderStatCard({
            label: "Facturas / clientes",
            value: `${stats.invoicesTotal} / ${stats.clientsTotal}`,
            caption: "Lectura combinada de facturación y cartera.",
          })}

          ${renderStatCard({
            label: "Widgets activos / rutas",
            value: `${stats.activeCount} / ${stats.routeCount}`,
            caption: "Cobertura del dashboard y accesos navegables.",
          })}
        </div>
      </div>

      <style>
        @keyframes homePulse {
          0% { transform:scale(.92); opacity:.75; }
          50% { transform:scale(1.08); opacity:1; }
          100% { transform:scale(.92); opacity:.75; }
        }

        @media (max-width: 1100px) {
          .home-hero-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 720px) {
          .home-hero-stats {
            grid-template-columns: 1fr !important;
          }
        }
      </style>
    </section>
  `;
}

/* =========================================================
   STATES
========================================================= */

export function renderLoadingState() {
  return `
    <section
      class="panel-surface home-dashboard-shell"
      style="
        overflow:hidden;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
      "
    >
      <div
        style="
          display:grid;
          gap:18px;
          padding:18px;
        "
      >
        <div
          style="
            height:22px;
            width:260px;
            border-radius:999px;
            background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass));
            background-size:200% 100%;
            animation:homeSkeleton 1.25s linear infinite;
          "
        ></div>

        <div
          style="
            display:grid;
            grid-template-columns:repeat(3, minmax(0, 1fr));
            gap:16px;
          "
          class="home-skeleton-grid"
        >
          ${Array.from({ length: 6 })
            .map(
              () => `
                <article
                  style="
                    display:grid;
                    gap:12px;
                    min-height:184px;
                    padding:18px;
                    border-radius:18px;
                    border:1px solid var(--border-soft);
                    background:var(--surface-glass);
                  "
                >
                  <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                    <div style="height:14px; width:120px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:homeSkeleton 1.25s linear infinite;"></div>
                    <div style="height:30px; width:78px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:homeSkeleton 1.25s linear infinite;"></div>
                  </div>
                  <div style="height:32px; width:84px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:homeSkeleton 1.25s linear infinite;"></div>
                  <div style="height:12px; width:90%; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:homeSkeleton 1.25s linear infinite;"></div>
                  <div style="height:12px; width:72%; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:homeSkeleton 1.25s linear infinite;"></div>
                  <div style="margin-top:auto; display:flex; gap:8px;">
                    <div style="height:38px; width:96px; border-radius:12px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:homeSkeleton 1.25s linear infinite;"></div>
                    <div style="height:38px; width:82px; border-radius:12px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:homeSkeleton 1.25s linear infinite;"></div>
                  </div>
                </article>
              `
            )
            .join("")}
        </div>
      </div>

      <style>
        @keyframes homeSkeleton {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @media (max-width: 980px) {
          .home-skeleton-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 680px) {
          .home-skeleton-grid {
            grid-template-columns: 1fr !important;
          }
        }
      </style>
    </section>
  `;
}

export function renderErrorState(message = "No se pudo cargar el dashboard.") {
  return `
    <section
      class="panel-surface home-error-state"
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
          No se pudo renderizar la vista Home
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
          ${escapeHtml(safeText(message, "Error desconocido al cargar el dashboard."))}
        </p>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button
          id="home-retry-btn"
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

export function renderEmptyState() {
  return `
    <section
      class="panel-surface home-empty-state"
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
          Sin datos
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
          No hay widgets para mostrar
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
          El snapshot del dashboard no devolvió bloques visibles o todavía no hay
          datos agregados disponibles para esta sesión.
        </p>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button
          id="home-refresh-btn"
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
          Actualizar dashboard
        </button>
      </div>
    </section>
  `;
}

/* =========================================================
   CHIPS
========================================================= */

function getStatusChipStyle(value = "") {
  const key = safeText(value, "").toLowerCase();

  if (["active", "ok", "ready", "enabled"].includes(key)) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  if (["warning", "pending", "degraded"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  if (["error", "critical", "down", "disabled"].includes(key)) {
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

function getTypeChipStyle(value = "") {
  const key = safeText(value, "").toLowerCase();

  if (["kpi", "metric"].includes(key)) {
    return `
      color:var(--accent-strong, var(--accent, #7c5cff));
      background:color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 26%, transparent);
    `;
  }

  if (["list", "table"].includes(key)) {
    return `
      color:#60a5fa;
      background:color-mix(in srgb, #60a5fa 14%, transparent);
      border:1px solid color-mix(in srgb, #60a5fa 26%, transparent);
    `;
  }

  if (["activity", "recent", "timeline"].includes(key)) {
    return `
      color:#b388ff;
      background:color-mix(in srgb, #b388ff 14%, transparent);
      border:1px solid color-mix(in srgb, #b388ff 26%, transparent);
    `;
  }

  if (["shortcut"].includes(key)) {
    return `
      color:#22d3ee;
      background:color-mix(in srgb, #22d3ee 14%, transparent);
      border:1px solid color-mix(in srgb, #22d3ee 26%, transparent);
    `;
  }

  return `
    color:var(--text-soft);
    background:var(--surface-glass);
    border:1px solid var(--border-soft);
  `;
}

function renderChip(label = "", style = "") {
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

/* =========================================================
   WIDGET VISUALS
========================================================= */

function getThemePalette(theme = "violet") {
  const themeMap = {
    violet: {
      bg: "linear-gradient(135deg, rgba(124,92,255,.28), rgba(88,72,200,.12))",
      border: "rgba(124,92,255,.28)",
      text: "#efeaff",
      glow: "rgba(124,92,255,.22)",
    },
    emerald: {
      bg: "linear-gradient(135deg, rgba(54,198,144,.28), rgba(35,131,95,.12))",
      border: "rgba(54,198,144,.28)",
      text: "#ddfff1",
      glow: "rgba(54,198,144,.22)",
    },
    blue: {
      bg: "linear-gradient(135deg, rgba(96,165,250,.28), rgba(37,99,235,.12))",
      border: "rgba(96,165,250,.28)",
      text: "#e7f2ff",
      glow: "rgba(96,165,250,.22)",
    },
    amber: {
      bg: "linear-gradient(135deg, rgba(255,188,66,.28), rgba(217,119,6,.12))",
      border: "rgba(255,188,66,.28)",
      text: "#fff4d8",
      glow: "rgba(255,188,66,.22)",
    },
    rose: {
      bg: "linear-gradient(135deg, rgba(255,107,107,.28), rgba(190,24,93,.12))",
      border: "rgba(255,107,107,.28)",
      text: "#ffe4e4",
      glow: "rgba(255,107,107,.22)",
    },
    purple: {
      bg: "linear-gradient(135deg, rgba(179,136,255,.28), rgba(109,40,217,.12))",
      border: "rgba(179,136,255,.28)",
      text: "#f3e8ff",
      glow: "rgba(179,136,255,.22)",
    },
    cyan: {
      bg: "linear-gradient(135deg, rgba(34,211,238,.28), rgba(8,145,178,.12))",
      border: "rgba(34,211,238,.28)",
      text: "#e6fcff",
      glow: "rgba(34,211,238,.22)",
    },
    orange: {
      bg: "linear-gradient(135deg, rgba(251,146,60,.28), rgba(194,65,12,.12))",
      border: "rgba(251,146,60,.28)",
      text: "#fff0e4",
      glow: "rgba(251,146,60,.22)",
    },
  };

  return themeMap[theme] || themeMap.violet;
}

function renderWidgetAvatar(widget = {}) {
  const title = safeText(widget.title, "Widget");
  const initials = safeText(widget.initials, getInitials(title));
  const theme = safeText(widget.theme, getWidgetTheme(widget.widgetId || title));
  const palette = getThemePalette(theme);
  const icon = safeText(widget.icon, "");

  return `
    <div
      aria-hidden="true"
      style="
        position:relative;
        flex:0 0 52px;
        width:52px;
        height:52px;
        border-radius:16px;
        display:grid;
        place-items:center;
        background:${palette.bg};
        border:1px solid ${palette.border};
        color:${palette.text};
        box-shadow:0 8px 24px ${palette.glow};
        font-weight:var(--weight-black);
        letter-spacing:.03em;
        font-size:${icon ? "22px" : "16px"};
      "
    >
      ${escapeHtml(icon || initials)}
    </div>
  `;
}

/* =========================================================
   WIDGET CARD
========================================================= */

function renderWidgetActionButtons(widget = {}, state = {}) {
  const widgetId = safeText(widget.widgetId, "");
  const route = safeText(widget.route, "");
  const isOpening = safeText(state?.openingWidgetId, "") === widgetId;

  return `
    <div
      style="
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        margin-top:auto;
      "
    >
      <button
        type="button"
        data-action="open-home-widget"
        data-widget-id="${escapeHtml(widgetId)}"
        ${isOpening ? "disabled" : ""}
        style="
          min-height:38px;
          min-width:92px;
          padding:0 12px;
          border-radius:12px;
          border:1px solid var(--btn-secondary-border, var(--border-soft));
          background:var(--btn-secondary-bg, var(--surface-glass));
          color:var(--btn-secondary-text, var(--text-soft));
          font-weight:var(--weight-bold);
          cursor:${isOpening ? "wait" : "pointer"};
          white-space:nowrap;
          opacity:${isOpening ? ".82" : "1"};
        "
      >
        ${
          isOpening
            ? `
              <span style="display:inline-flex; align-items:center; gap:8px;">
                <span
                  aria-hidden="true"
                  style="
                    width:14px;
                    height:14px;
                    border-radius:999px;
                    border:2px solid color-mix(in srgb, var(--text-soft) 22%, transparent);
                    border-top-color:var(--text-soft);
                    animation:homeSpin .8s linear infinite;
                  "
                ></span>
                Abriendo...
              </span>
            `
            : "Ver"
        }
      </button>

      <button
        type="button"
        data-action="copy-home-widget-id"
        data-widget-id="${escapeHtml(widgetId)}"
        style="
          min-height:38px;
          padding:0 12px;
          border-radius:12px;
          border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
          background:var(--btn-primary-bg, var(--accent, #7c5cff));
          color:var(--btn-primary-text, #fff);
          font-weight:var(--weight-bold);
          cursor:pointer;
          white-space:nowrap;
        "
      >
        Copiar ID
      </button>

      ${
        route
          ? `
            <button
              type="button"
              data-action="navigate-home"
              data-route="${escapeHtml(route)}"
              style="
                min-height:38px;
                padding:0 12px;
                border-radius:12px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
                color:var(--text-soft);
                font-weight:var(--weight-bold);
                cursor:pointer;
                white-space:nowrap;
              "
            >
              Abrir
            </button>
          `
          : ""
      }
    </div>
  `;
}

function renderWidgetItemsPreview(widget = {}) {
  const items = safeArray(widget.items).slice(0, 3);

  if (!items.length) {
    return `
      <div
        style="
          display:grid;
          gap:8px;
        "
      >
        <span
          style="
            color:var(--text-dim);
            font-size:12px;
            line-height:1.4;
          "
        >
          Sin elementos asociados.
        </span>
      </div>
    `;
  }

  return `
    <div
      style="
        display:grid;
        gap:8px;
      "
    >
      ${items
        .map((entry) => {
          const item = safeObject(entry);
          const title = safeText(
            first(
              item.title,
              item.name,
              item.label,
              item.id
            ),
            "Elemento"
          );

          const meta = safeText(
            first(
              item.description,
              item.status,
              item.route
            ),
            ""
          );

          return `
            <div
              style="
                display:grid;
                gap:4px;
                padding:10px 12px;
                border-radius:12px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
              "
            >
              <strong
                style="
                  color:var(--text-strong);
                  font-size:12px;
                  line-height:1.3;
                  word-break:break-word;
                "
              >
                ${escapeHtml(truncate(title, 56))}
              </strong>

              ${
                meta
                  ? `
                    <span
                      style="
                        color:var(--text-dim);
                        font-size:11px;
                        line-height:1.3;
                        word-break:break-word;
                      "
                    >
                      ${escapeHtml(truncate(meta, 80))}
                    </span>
                  `
                  : ""
              }
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderWidgetCard(item = {}, state = {}) {
  const widget = normalizeHomeWidgetModel(item);
  const widgetId = safeText(widget.widgetId, "");
  const title = safeText(widget.title, "Bloque");
  const description = safeText(widget.description, "Sin descripción.");
  const typeLabel = getWidgetTypeLabel(widget.type);
  const statusLabel = getWidgetStatusLabel(widget.status);
  const value = widget.hasValue ? widget.value : "—";
  const trend = widget.hasTrend ? widget.trend : "";
  const updatedAt = widget.updatedAt
    ? formatRelativeDate(widget.updatedAt)
    : "Sin fecha";
  const isOpening = safeText(state?.openingWidgetId, "") === widgetId;

  return `
    <article
      class="home-widget-card panel-surface ${isOpening ? "is-opening" : ""}"
      data-widget-id="${escapeHtml(widgetId)}"
      style="
        display:grid;
        gap:14px;
        min-height:240px;
        padding:18px;
        border-radius:20px;
        border:1px solid var(--border-soft);
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--surface-2, transparent) 50%, transparent), transparent),
          var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
        transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease, opacity .18s ease;
        opacity:${isOpening ? ".74" : "1"};
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
          ${renderWidgetAvatar(widget)}

          <div style="display:grid; gap:5px; min-width:0;">
            <button
              type="button"
              data-action="open-home-widget"
              data-widget-id="${escapeHtml(widgetId)}"
              ${isOpening ? "disabled" : ""}
              style="
                margin:0;
                padding:0;
                border:none;
                background:transparent;
                text-align:left;
                color:var(--text-strong);
                font-size:16px;
                font-weight:var(--weight-black);
                letter-spacing:-.02em;
                line-height:1.15;
                cursor:${isOpening ? "wait" : "pointer"};
              "
            >
              ${escapeHtml(title)}
            </button>

            <span
              style="
                color:var(--text-dim);
                font-size:12px;
                line-height:1.35;
              "
            >
              Widget ${escapeHtml(widgetId || "—")}
            </span>
          </div>
        </div>

        <div style="display:grid; gap:8px; justify-items:end;">
          ${renderChip(typeLabel, getTypeChipStyle(widget.type))}
          ${renderChip(statusLabel, getStatusChipStyle(widget.status))}
        </div>
      </div>

      <div style="display:grid; gap:6px;">
        <strong
          style="
            color:var(--text-strong);
            font-size:clamp(24px, 3vw, 30px);
            line-height:1;
            letter-spacing:-.04em;
          "
        >
          ${escapeHtml(String(value))}
        </strong>

        ${
          trend
            ? `
              <span
                style="
                  color:${widget.isPositiveTrend ? "var(--success-strong, #36c690)" : widget.isNegativeTrend ? "var(--danger-strong, #ff6b6b)" : "var(--text-dim)"};
                  font-size:12px;
                  font-weight:var(--weight-bold);
                  letter-spacing:.04em;
                  text-transform:uppercase;
                "
              >
                Tendencia · ${escapeHtml(String(trend))}
              </span>
            `
            : `
              <span
                style="
                  color:var(--text-dim);
                  font-size:12px;
                "
              >
                Sin tendencia disponible
              </span>
            `
        }
      </div>

      <p
        style="
          margin:0;
          color:var(--text-soft);
          font-size:13px;
          line-height:1.55;
          word-break:break-word;
        "
      >
        ${escapeHtml(truncate(description, 140))}
      </p>

      ${renderWidgetItemsPreview(widget)}

      <div
        style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          flex-wrap:wrap;
        "
      >
        <span
          style="
            color:var(--text-dim);
            font-size:12px;
          "
        >
          Actualizado ${escapeHtml(updatedAt)}
        </span>

        ${renderWidgetActionButtons(widget, state)}
      </div>
    </article>
  `;
}

/* =========================================================
   RECENT ACTIVITY
========================================================= */

function renderRecentActivity(recent = []) {
  const list = safeArray(recent).slice(0, 8);

  return `
    <section
      class="panel-surface home-recent-section"
      style="
        display:grid;
        gap:14px;
        padding:18px;
        border-radius:20px;
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
      "
    >
      <div
        style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          flex-wrap:wrap;
        "
      >
        <div style="display:grid; gap:4px;">
          <strong
            style="
              color:var(--text-strong);
              font-size:18px;
              letter-spacing:-.02em;
            "
          >
            Actividad reciente
          </strong>

          <span
            style="
              color:var(--text-dim);
              font-size:13px;
            "
          >
            Timeline compacto del snapshot del dashboard.
          </span>
        </div>

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
            letter-spacing:.04em;
            text-transform:uppercase;
          "
        >
          ${escapeHtml(String(list.length))} eventos
        </span>
      </div>

      ${
        !list.length
          ? `
            <div
              style="
                padding:14px;
                border-radius:16px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
                color:var(--text-dim);
              "
            >
              Sin actividad reciente.
            </div>
          `
          : `
            <div style="display:grid; gap:10px;">
              ${list
                .map((entry) => {
                  const item = safeObject(entry);
                  const title = safeText(
                    first(item.title, item.action, item.message, item.name),
                    "Evento"
                  );

                  const description = safeText(
                    first(item.description, item.subtitle, item.summary),
                    ""
                  );

                  const route = safeText(
                    first(item.route, item.href, item.link, item.to),
                    ""
                  );

                  const createdAt = first(
                    item.createdAt,
                    item.updatedAt,
                    item.date,
                    item.timestamp
                  );

                  return `
                    <article
                      style="
                        display:grid;
                        gap:8px;
                        padding:14px;
                        border-radius:16px;
                        border:1px solid var(--border-soft);
                        background:var(--surface-glass);
                      "
                    >
                      <div
                        style="
                          display:flex;
                          align-items:flex-start;
                          justify-content:space-between;
                          gap:12px;
                          flex-wrap:wrap;
                        "
                      >
                        <strong
                          style="
                            color:var(--text-strong);
                            font-size:14px;
                            line-height:1.35;
                            word-break:break-word;
                          "
                        >
                          ${escapeHtml(title)}
                        </strong>

                        <span
                          style="
                            color:var(--text-dim);
                            font-size:12px;
                            white-space:nowrap;
                          "
                        >
                          ${escapeHtml(formatRelativeDate(createdAt))}
                        </span>
                      </div>

                      ${
                        description
                          ? `
                            <div
                              style="
                                color:var(--text-soft);
                                font-size:13px;
                                line-height:1.55;
                                word-break:break-word;
                              "
                            >
                              ${escapeHtml(truncate(description, 180))}
                            </div>
                          `
                          : ""
                      }

                      ${
                        route
                          ? `
                            <div style="display:flex; justify-content:flex-start;">
                              <button
                                type="button"
                                data-action="navigate-home"
                                data-route="${escapeHtml(route)}"
                                style="
                                  min-height:34px;
                                  padding:0 12px;
                                  border-radius:12px;
                                  border:1px solid var(--border-soft);
                                  background:var(--surface-glass);
                                  color:var(--text-soft);
                                  font-weight:var(--weight-bold);
                                  cursor:pointer;
                                "
                              >
                                Abrir ruta
                              </button>
                            </div>
                          `
                          : ""
                      }
                    </article>
                  `;
                })
                .join("")}
            </div>
          `
      }
    </section>
  `;
}

/* =========================================================
   TOOLBAR / OVERLAY
========================================================= */

function renderDashboardToolbar({
  total = 0,
  page = 1,
  totalPages = 1,
  from = 0,
  to = 0,
  refreshing = false,
} = {}) {
  return `
    <div
      class="home-dashboard-toolbar"
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
          Widgets del dashboard
        </strong>

        <span
          style="
            color:var(--text-dim);
            font-size:var(--font-sm);
          "
        >
          Mostrando ${escapeHtml(String(from))}-${escapeHtml(String(to))} de ${escapeHtml(String(total))} · página ${escapeHtml(String(page))} de ${escapeHtml(String(totalPages))}
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
          Vista dashboard
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
                    animation:homePulse 1.25s ease-in-out infinite;
                  "
                ></span>
                Actualizando
              </span>
            `
            : ""
        }

        <button
          type="button"
          data-action="prev-page"
          ${page <= 1 ? "disabled" : ""}
          style="
            min-height:34px;
            padding:0 12px;
            border-radius:12px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
            color:var(--text-soft);
            font-weight:var(--weight-bold);
            cursor:${page <= 1 ? "not-allowed" : "pointer"};
            opacity:${page <= 1 ? ".55" : "1"};
          "
        >
          Anterior
        </button>

        <button
          type="button"
          data-action="next-page"
          ${page >= totalPages ? "disabled" : ""}
          style="
            min-height:34px;
            padding:0 12px;
            border-radius:12px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
            color:var(--text-soft);
            font-weight:var(--weight-bold);
            cursor:${page >= totalPages ? "not-allowed" : "pointer"};
            opacity:${page >= totalPages ? ".55" : "1"};
          "
        >
          Siguiente
        </button>
      </div>
    </div>
  `;
}

function renderDashboardLoadingOverlay(message = "Actualizando dashboard...") {
  return `
    <div
      class="home-dashboard-overlay"
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
            animation:homeSpin .8s linear infinite;
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
          Solo se está actualizando la sección principal
        </span>
      </div>
    </div>
  `;
}

/* =========================================================
   MAIN
========================================================= */

export function renderDashboard({ dashboard = {}, state = {} } = {}) {
  const localState = state || homeState || {};
  const resolvedDashboard = getResolvedDashboard(dashboard);
  const widgets = sortHomeWidgetsByUpdatedDesc(
    safeArray(resolvedDashboard.widgets)
  );

  const refreshing = Boolean(localState?.refreshing);
  const loading = Boolean(localState?.loading);

  if (loading && !widgets.length) {
    return renderLoadingState();
  }

  if (localState.error && !widgets.length) {
    return renderErrorState(localState.error);
  }

  if (!widgets.length) {
    return renderEmptyState();
  }

  const pagination = getPagination(widgets, localState);

  return `
    <section
      class="home-dashboard-wrap panel-surface"
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
      ${renderDashboardToolbar({
        total: pagination.totalItems,
        page: pagination.page,
        totalPages: pagination.totalPages,
        from: pagination.from,
        to: pagination.to,
        refreshing,
      })}

      <div
        class="home-dashboard-main-grid"
        style="
          display:grid;
          grid-template-columns:minmax(0, 1.45fr) minmax(320px, .8fr);
          gap:18px;
          padding:18px;
        "
      >
        <div
          class="home-widgets-grid"
          style="
            display:grid;
            grid-template-columns:repeat(2, minmax(0, 1fr));
            gap:16px;
            align-content:start;
          "
        >
          ${pagination.items
            .map((item) => renderWidgetCard(item, localState))
            .join("")}
        </div>

        <div style="display:grid; gap:18px; align-content:start;">
          ${renderRecentActivity(resolvedDashboard.recent)}
        </div>
      </div>

      ${refreshing ? renderDashboardLoadingOverlay("Actualizando dashboard...") : ""}

      <style>
        @keyframes homeSpin {
          to { transform:rotate(360deg); }
        }

        .home-widget-card:hover {
          transform: translateY(-2px);
          border-color: color-mix(in srgb, var(--accent, #7c5cff) 20%, var(--border-soft));
          box-shadow: var(--shadow-md);
        }

        .home-widget-card.is-opening:hover {
          transform: none;
        }

        @media (max-width: 1200px) {
          .home-dashboard-main-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 920px) {
          .home-widgets-grid {
            grid-template-columns: 1fr !important;
          }
        }
      </style>
    </section>
  `;
}

export function renderCards({ dashboard = {}, state = {} } = {}) {
  return renderDashboard({ dashboard, state });
}
