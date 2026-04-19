/* =========================================================
   Onion SPA - Server Template (FINAL PRO OBSERVABILITY GOD MODE)
   Archivo: src/views/server/server.template.js

   EXTREME MODE · SERVER SNAPSHOT FIRST · 10/10

   Responsabilidades:
   - renderizar header premium de la vista server
   - renderizar estados loading / error / empty
   - renderizar panel premium de servicios / telemetry
   - mostrar loader SOLO en la sección principal
   - mostrar estado visual al abrir detalle lento
   - mantener compatibilidad directa con serverView.js
   - consumir datos reales de /api/dashboard + /health/internal
   - compartir lenguaje visual y densidad con Facturas / Incidencias

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - soporte para snapshot normalizado
   - lectura preferente del shape normalizado server
   - mismo lenguaje visual premium
   - hero / skeleton / responsive / technical sidebar consistentes
========================================================= */

import { serverState } from "./server.state.js";

import {
  getServerSnapshotStore,
  getSortedServerServicesStore,
} from "./server.store.js";

import {
  normalizeServerSnapshotModel,
  normalizeServerServiceModel,
  sortServerServicesByLatencyDesc,
  getServerStatusLabel,
  getServerTypeLabel,
  getInitials,
  getServerTheme,
} from "./server.model.js";

import {
  escapeHtml,
  formatDate,
  formatRelativeDate,
  truncate,
  formatMs,
  formatGB,
  formatMB,
  formatNumber,
} from "./server.utils.js";

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
   SNAPSHOT RESOLVE
========================================================= */

function looksLikeServerSnapshot(value) {
  const obj = safeObject(value);

  return Boolean(
    obj.dashboardPayload ||
      obj.healthPayload ||
      obj.telemetry ||
      Array.isArray(obj.services) ||
      obj.history ||
      obj.browserMetrics ||
      obj.environmentMetrics
  );
}

function unwrapServerSnapshot(value) {
  if (!value) {
    return {};
  }

  if (looksLikeServerSnapshot(value)) {
    return value;
  }

  const obj = safeObject(value);

  if (looksLikeServerSnapshot(obj?.data)) {
    return unwrapServerSnapshot(obj.data);
  }

  if (looksLikeServerSnapshot(obj?.payload)) {
    return unwrapServerSnapshot(obj.payload);
  }

  if (looksLikeServerSnapshot(obj?.result)) {
    return unwrapServerSnapshot(obj.result);
  }

  if (looksLikeServerSnapshot(obj?.snapshot)) {
    return unwrapServerSnapshot(obj.snapshot);
  }

  return {};
}

function getResolvedSnapshot(data) {
  const normalizedDirect = normalizeServerSnapshotModel(data);

  if (
    normalizedDirect.servicesCount ||
    Object.keys(safeObject(normalizedDirect.telemetry)).length
  ) {
    return normalizedDirect;
  }

  const fromEnvelope = normalizeServerSnapshotModel(
    unwrapServerSnapshot(data)
  );

  if (
    fromEnvelope.servicesCount ||
    Object.keys(safeObject(fromEnvelope.telemetry)).length
  ) {
    return fromEnvelope;
  }

  try {
    return normalizeServerSnapshotModel(getServerSnapshotStore());
  } catch {
    return normalizeServerSnapshotModel({});
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

function computeServerStats(snapshot = {}) {
  const telemetry = safeObject(snapshot.telemetry);
  const services = safeArray(snapshot.services);
  const server = safeObject(telemetry.server);
  const dashboard = safeObject(telemetry.dashboard);

  const okCount = services.filter((item) => {
    const status = safeText(item.status, "").toLowerCase();
    return ["ok", "up", "healthy", "online", "success"].includes(status);
  }).length;

  const warningCount = services.filter((item) => {
    const status = safeText(item.status, "").toLowerCase();
    return ["warning", "pending", "degraded", "slow"].includes(status);
  }).length;

  const errorCount = services.filter((item) => {
    const status = safeText(item.status, "").toLowerCase();
    return ["error", "critical", "down", "offline", "failed"].includes(status);
  }).length;

  const latencyCount = services.filter((item) => {
    return Number.isFinite(Number(item.latencyMs));
  }).length;

  return {
    servicesTotal: services.length,
    okCount,
    warningCount,
    errorCount,
    latencyCount,

    cpuPercent: server.cpuPercent ?? null,
    ramPercent: server.ramPercent ?? null,
    diskPercent: server.diskPercent ?? null,
    eventLoopLag: server.eventLoopLag ?? null,

    totalFacturas: safeNumber(dashboard.totalFacturas, 0),
    ticketsActivos: safeNumber(dashboard.ticketsActivos, 0),
    totalClientes: safeNumber(dashboard.totalClientes, 0),
    totalUsuarios: safeNumber(dashboard.totalUsuarios, 0),
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
      class="server-stat-card panel-surface"
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

export function renderHeader({ snapshot = {}, state = {} } = {}) {
  const resolvedSnapshot = getResolvedSnapshot(snapshot);
  const localState = state || serverState || {};
  const telemetry = safeObject(resolvedSnapshot.telemetry);
  const global = safeObject(telemetry.global);
  const stats = computeServerStats(resolvedSnapshot);

  const loading = Boolean(localState?.loading);
  const refreshing = Boolean(localState?.refreshing);
  const lastSyncText = localState?.lastSyncAt
    ? formatRelativeDate(localState.lastSyncAt)
    : "Sin sincronización reciente";

  const requestId = safeText(
    first(localState?.requestId, resolvedSnapshot?.requestId),
    ""
  );

  const healthStatus = safeText(global.status, "unknown");
  const serviceName = safeText(global.service, "onion-backend");

  return `
    <section
      class="server-hero"
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
              Observabilidad server
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
                Centro de control del servidor
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
                Estado agregado de API, base de datos, host, runtime Node/V8,
                latencias reales, health interno y métricas clave del entorno
                en un panel premium de supervisión técnica.
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
              id="server-health-btn"
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
              Refrescar health
            </button>

            <button
              id="server-refresh-btn"
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
              Actualizar panel
            </button>

            <button
              id="server-toggle-live-btn"
              type="button"
              style="
                min-height:42px;
                padding:0 16px;
                border-radius:var(--btn-radius);
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
                color:var(--text-soft);
                font-weight:var(--weight-bold);
                cursor:pointer;
              "
            >
              ${localState?.autoRefresh ? "Live ON" : "Live OFF"}
            </button>
          </div>
        </div>

        <div
          class="server-hero-meta"
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
            Servicio · ${escapeHtml(serviceName)}
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
            Health · ${escapeHtml(healthStatus)}
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
                      animation:serverPulse 1.35s ease-in-out infinite;
                    "
                  ></span>
                  Sincronizando
                </span>
              `
              : ""
          }
        </div>

        <div
          class="server-hero-stats"
          style="
            display:grid;
            grid-template-columns:repeat(4, minmax(0, 1fr));
            gap:var(--space-md);
          "
        >
          ${renderStatCard({
            label: "Servicios / ok",
            value: `${stats.servicesTotal} / ${stats.okCount}`,
            caption: "Servicios técnicos resueltos desde health + telemetry.",
            accent: true,
          })}

          ${renderStatCard({
            label: "CPU / RAM / disco",
            value: `${stats.cpuPercent ?? "—"}% / ${stats.ramPercent ?? "—"}% / ${stats.diskPercent ?? "—"}%`,
            caption: "Snapshot actual del host principal.",
          })}

          ${renderStatCard({
            label: "Event loop / alertas",
            value: `${stats.eventLoopLag ? formatMs(stats.eventLoopLag) : "—"} / ${stats.errorCount}`,
            caption: "Lag del loop y servicios en error.",
          })}

          ${renderStatCard({
            label: "Facturas / tickets",
            value: `${stats.totalFacturas} / ${stats.ticketsActivos}`,
            caption: "Cruce rápido con el dashboard agregado.",
          })}
        </div>
      </div>

      <style>
        @keyframes serverPulse {
          0% { transform:scale(.92); opacity:.75; }
          50% { transform:scale(1.08); opacity:1; }
          100% { transform:scale(.92); opacity:.75; }
        }

        @media (max-width: 1100px) {
          .server-hero-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 720px) {
          .server-hero-stats {
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
      class="panel-surface server-shell"
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
            animation:serverSkeleton 1.25s linear infinite;
          "
        ></div>

        <div
          style="
            display:grid;
            grid-template-columns:repeat(3, minmax(0, 1fr));
            gap:16px;
          "
          class="server-skeleton-grid"
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
                    <div style="height:14px; width:120px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:serverSkeleton 1.25s linear infinite;"></div>
                    <div style="height:30px; width:78px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:serverSkeleton 1.25s linear infinite;"></div>
                  </div>
                  <div style="height:32px; width:84px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:serverSkeleton 1.25s linear infinite;"></div>
                  <div style="height:12px; width:90%; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:serverSkeleton 1.25s linear infinite;"></div>
                  <div style="height:12px; width:72%; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:serverSkeleton 1.25s linear infinite;"></div>
                  <div style="margin-top:auto; display:flex; gap:8px;">
                    <div style="height:38px; width:96px; border-radius:12px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:serverSkeleton 1.25s linear infinite;"></div>
                    <div style="height:38px; width:82px; border-radius:12px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:serverSkeleton 1.25s linear infinite;"></div>
                  </div>
                </article>
              `
            )
            .join("")}
        </div>
      </div>

      <style>
        @keyframes serverSkeleton {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @media (max-width: 980px) {
          .server-skeleton-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 680px) {
          .server-skeleton-grid {
            grid-template-columns: 1fr !important;
          }
        }
      </style>
    </section>
  `;
}

export function renderErrorState(message = "No se pudo cargar el panel de servidor.") {
  return `
    <section
      class="panel-surface server-error-state"
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
          No se pudo renderizar la vista Server
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
          ${escapeHtml(safeText(message, "Error desconocido al cargar el panel técnico."))}
        </p>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button
          id="server-retry-btn"
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
      class="panel-surface server-empty-state"
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
          No hay servicios para mostrar
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
          El snapshot técnico no devolvió servicios visibles o todavía no hay
          datos agregados disponibles del health interno y la telemetría.
        </p>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button
          id="server-refresh-btn"
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
          Actualizar panel
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

  if (["ok", "up", "healthy", "online", "success", "operativa", "operativo"].includes(key)) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  if (["warning", "pending", "degraded", "slow", "revisar"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  if (["error", "critical", "down", "offline", "failed", "disabled"].includes(key)) {
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

  if (["api", "service", "runtime"].includes(key)) {
    return `
      color:var(--accent-strong, var(--accent, #7c5cff));
      background:color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 26%, transparent);
    `;
  }

  if (["db", "system", "environment"].includes(key)) {
    return `
      color:#60a5fa;
      background:color-mix(in srgb, #60a5fa 14%, transparent);
      border:1px solid color-mix(in srgb, #60a5fa 26%, transparent);
    `;
  }

  if (["telemetry", "metric", "health"].includes(key)) {
    return `
      color:#b388ff;
      background:color-mix(in srgb, #b388ff 14%, transparent);
      border:1px solid color-mix(in srgb, #b388ff 26%, transparent);
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
   SERVICE VISUALS
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

function renderServiceAvatar(service = {}) {
  const title = safeText(service.title, "Servicio");
  const initials = safeText(service.initials, getInitials(title));
  const theme = safeText(service.theme, getServerTheme(service.serviceId || title));
  const palette = getThemePalette(theme);
  const icon = safeText(service.icon, "");

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
   SERVICE CARD
========================================================= */

function renderServiceActionButtons(service = {}, state = {}) {
  const serviceId = safeText(service.serviceId, "");
  const route = safeText(service.route, "");
  const isOpening = safeText(state?.openingDetailId, "") === serviceId;

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
        data-action="open-server-detail"
        data-detail-id="${escapeHtml(serviceId)}"
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
                    animation:serverSpin .8s linear infinite;
                  "
                ></span>
                Abriendo...
              </span>
            `
            : "Ver detalle"
        }
      </button>

      <button
        type="button"
        data-action="copy-server-detail-id"
        data-detail-id="${escapeHtml(serviceId)}"
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
              data-action="navigate-server"
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

function renderServicePreview(service = {}) {
  const metadata = safeObject(service.metadata);

  const lines = [
    first(
      metadata.detail,
      metadata.description,
      service.description
    ),
    metadata.latencyMs !== null && metadata.latencyMs !== undefined
      ? `Latencia: ${formatMs(metadata.latencyMs)}`
      : "",
    metadata.percent !== null && metadata.percent !== undefined
      ? `Uso: ${Math.round(Number(metadata.percent))}%`
      : "",
  ].filter(Boolean).slice(0, 2);

  if (!lines.length) {
    return `
      <div style="display:grid; gap:8px;">
        <span
          style="
            color:var(--text-dim);
            font-size:12px;
            line-height:1.4;
          "
        >
          Sin información adicional.
        </span>
      </div>
    `;
  }

  return `
    <div style="display:grid; gap:8px;">
      ${lines
        .map(
          (line) => `
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
              <span
                style="
                  color:var(--text-soft);
                  font-size:12px;
                  line-height:1.45;
                  word-break:break-word;
                "
              >
                ${escapeHtml(truncate(line, 96))}
              </span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderServiceCard(item = {}, state = {}) {
  const service = normalizeServerServiceModel(item);
  const serviceId = safeText(service.serviceId, "");
  const title = safeText(service.title, "Servicio");
  const description = safeText(service.description, "Sin descripción.");
  const typeLabel = getServerTypeLabel(service.type);
  const statusLabel = getServerStatusLabel(service.status);

  const primaryValue =
    service.hasLatency
      ? formatMs(service.latencyMs)
      : service.hasPercent
        ? `${Math.round(Number(service.percent))}%`
        : service.numericValue !== null
          ? String(service.numericValue)
          : "—";

  const updatedAt = service.updatedAt
    ? formatRelativeDate(service.updatedAt)
    : "Sin fecha";

  const isOpening = safeText(state?.openingDetailId, "") === serviceId;

  return `
    <article
      class="server-service-card panel-surface ${isOpening ? "is-opening" : ""}"
      data-detail-id="${escapeHtml(serviceId)}"
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
          ${renderServiceAvatar(service)}

          <div style="display:grid; gap:5px; min-width:0;">
            <button
              type="button"
              data-action="open-server-detail"
              data-detail-id="${escapeHtml(serviceId)}"
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
              Service ${escapeHtml(serviceId || "—")}
            </span>
          </div>
        </div>

        <div style="display:grid; gap:8px; justify-items:end;">
          ${renderChip(typeLabel, getTypeChipStyle(service.type))}
          ${renderChip(statusLabel, getStatusChipStyle(service.status))}
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
          ${escapeHtml(primaryValue)}
        </strong>

        <span
          style="
            color:var(--text-dim);
            font-size:12px;
          "
        >
          ${service.hasLatency
            ? "Latencia técnica reportada"
            : service.hasPercent
              ? "Uso actual reportado"
              : "Snapshot actual"}
        </span>
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

      ${renderServicePreview(service)}

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

        ${renderServiceActionButtons(service, state)}
      </div>
    </article>
  `;
}

/* =========================================================
   TECH SIDEBAR
========================================================= */

function renderTechnicalSidebar(snapshot = {}) {
  const telemetry = safeObject(snapshot.telemetry);
  const server = safeObject(telemetry.server);
  const runtime = safeObject(telemetry.runtime);
  const environment = safeObject(telemetry.environment);
  const browserMetrics = safeObject(snapshot.browserMetrics);

  const cards = [
    {
      title: "Host",
      rows: [
        ["Hostname", server.hostname || "—"],
        ["SO", server.osName || "—"],
        ["Platform", server.osPlatform || "—"],
        ["Arch", server.arch || "—"],
        ["Uptime host", server.hostUptime || "—"],
      ],
    },
    {
      title: "Runtime Node",
      rows: [
        ["Version", runtime.nodeVersion || "—"],
        ["PID", runtime.nodePid ?? "—"],
        ["RSS", runtime.rssMB !== null ? formatMB(runtime.rssMB) : "—"],
        ["Heap used", runtime.heapUsedMB !== null ? formatMB(runtime.heapUsedMB) : "—"],
        ["Heap total", runtime.heapTotalMB !== null ? formatMB(runtime.heapTotalMB) : "—"],
      ],
    },
    {
      title: "Capacidad",
      rows: [
        ["RAM", server.ramUsedGB !== null ? `${formatGB(server.ramUsedGB)} / ${formatGB(server.ramTotalGB)}` : "—"],
        ["Disco", server.diskUsedGB !== null ? `${formatGB(server.diskUsedGB)} / ${formatGB(server.diskTotalGB)}` : "—"],
        ["CPU", server.cpuPercent !== null ? `${Math.round(server.cpuPercent)}%` : "—"],
        ["Event loop", server.eventLoopLag !== null ? formatMs(server.eventLoopLag) : "—"],
        ["TTFB", browserMetrics.ttfb !== null ? formatMs(browserMetrics.ttfb) : "—"],
      ],
    },
    {
      title: "Entorno",
      rows: [
        ["NODE_ENV", environment.env || "—"],
        ["Timezone", environment.timezone || "—"],
        ["Azure site", environment.azureSiteName || "—"],
        ["Azure region", environment.azureRegion || "—"],
        ["Container", environment.inContainer ? "Sí" : "No"],
      ],
    },
  ];

  return `
    <section
      class="panel-surface server-tech-sidebar"
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
            Resumen técnico
          </strong>

          <span
            style="
              color:var(--text-dim);
              font-size:13px;
            "
          >
            Vista compacta de host, runtime y entorno.
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
          4 bloques
        </span>
      </div>

      <div style="display:grid; gap:12px;">
        ${cards
          .map(
            (card) => `
              <article
                style="
                  display:grid;
                  gap:10px;
                  padding:14px;
                  border-radius:16px;
                  border:1px solid var(--border-soft);
                  background:var(--surface-glass);
                "
              >
                <strong
                  style="
                    color:var(--text-strong);
                    font-size:14px;
                    letter-spacing:-.02em;
                  "
                >
                  ${escapeHtml(card.title)}
                </strong>

                <div style="display:grid; gap:8px;">
                  ${card.rows
                    .map(
                      ([label, value]) => `
                        <div
                          style="
                            display:flex;
                            align-items:flex-start;
                            justify-content:space-between;
                            gap:10px;
                          "
                        >
                          <span
                            style="
                              color:var(--text-dim);
                              font-size:12px;
                            "
                          >
                            ${escapeHtml(String(label))}
                          </span>

                          <strong
                            style="
                              color:var(--text-strong);
                              font-size:12px;
                              text-align:right;
                              word-break:break-word;
                            "
                          >
                            ${escapeHtml(String(value))}
                          </strong>
                        </div>
                      `
                    )
                    .join("")}
                </div>
              </article>
            `
          )
          .join("")}
      </div>
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
      class="server-dashboard-toolbar"
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
          Servicios y componentes
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
          Vista técnica
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
                    animation:serverPulse 1.25s ease-in-out infinite;
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

function renderDashboardLoadingOverlay(message = "Actualizando panel técnico...") {
  return `
    <div
      class="server-dashboard-overlay"
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
            animation:serverSpin .8s linear infinite;
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

export function renderDashboard({ snapshot = {}, state = {} } = {}) {
  const localState = state || serverState || {};
  const resolvedSnapshot = getResolvedSnapshot(snapshot);
  const services = sortServerServicesByLatencyDesc(
    safeArray(resolvedSnapshot.services)
  );

  const refreshing = Boolean(localState?.refreshing);
  const loading = Boolean(localState?.loading);

  if (loading && !services.length) {
    return renderLoadingState();
  }

  if (localState.error && !services.length) {
    return renderErrorState(localState.error);
  }

  if (!services.length) {
    return renderEmptyState();
  }

  const pagination = getPagination(services, localState);

  return `
    <section
      class="server-dashboard-wrap panel-surface"
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
        class="server-dashboard-main-grid"
        style="
          display:grid;
          grid-template-columns:minmax(0, 1.45fr) minmax(320px, .8fr);
          gap:18px;
          padding:18px;
        "
      >
        <div
          class="server-services-grid"
          style="
            display:grid;
            grid-template-columns:repeat(2, minmax(0, 1fr));
            gap:16px;
            align-content:start;
          "
        >
          ${pagination.items
            .map((item) => renderServiceCard(item, localState))
            .join("")}
        </div>

        <div style="display:grid; gap:18px; align-content:start;">
          ${renderTechnicalSidebar(resolvedSnapshot)}
        </div>
      </div>

      ${refreshing ? renderDashboardLoadingOverlay("Actualizando panel técnico...") : ""}

      <style>
        @keyframes serverSpin {
          to { transform:rotate(360deg); }
        }

        .server-service-card:hover {
          transform: translateY(-2px);
          border-color: color-mix(in srgb, var(--accent, #7c5cff) 20%, var(--border-soft));
          box-shadow: var(--shadow-md);
        }

        .server-service-card.is-opening:hover {
          transform: none;
        }

        @media (max-width: 1200px) {
          .server-dashboard-main-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 920px) {
          .server-services-grid {
            grid-template-columns: 1fr !important;
          }
        }
      </style>
    </section>
  `;
}

export function renderCards({ snapshot = {}, state = {} } = {}) {
  return renderDashboard({ snapshot, state });
}
