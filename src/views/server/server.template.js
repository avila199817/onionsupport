/* =========================================================
   Onion SPA - Server Template
   Archivo: src/views/server/server.template.js

   FINAL PRO SYSTEM · SERVER VIEW TEMPLATE · CSP CLEAN · 12/10
   NO INLINE CSS · NO STYLE TAGS · TOKEN PRO SYSTEM READY

   RESPONSABILIDADES:
   - renderizar header premium de la vista Server
   - renderizar estados loading / error / empty
   - renderizar panel premium de servicios / telemetry
   - mostrar loader SOLO en la sección principal
   - mostrar estado visual al abrir detalle lento
   - mantener compatibilidad directa con serverView.js
   - consumir datos reales de /api/dashboard + /health/internal
   - compartir lenguaje visual con Facturas / Incidencias / Usuarios / Clientes
   - emitir SOLO clases/atributos para que el CSS viva en:
     /src/css/views/server/index.css

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - soporte para snapshot normalizado
   - lectura preferente del shape normalizado server
   - paginación defensiva
   - cards técnicas consistentes
   - sin CSS inline
   - sin estilos inyectados
   - sin duplicidades visuales
========================================================= */

import { serverState } from "./server.state.js";

import {
  getServerSnapshotStore,
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
  formatRelativeDate,
  formatMs,
  formatGB,
  formatMB,
  truncate,
} from "./server.utils.js";

/* =========================================================
   CONSTANTS
========================================================= */

const PAGE_SIZE = 6;

/* =========================================================
   SAFE HELPERS
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

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    return value;
  }

  return null;
}

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]+/g, "_")
    .replace(/^_+|_+$/g, "");
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
  if (!value) return {};

  if (looksLikeServerSnapshot(value)) {
    return value;
  }

  const obj = safeObject(value);

  if (looksLikeServerSnapshot(obj.data)) {
    return unwrapServerSnapshot(obj.data);
  }

  if (looksLikeServerSnapshot(obj.payload)) {
    return unwrapServerSnapshot(obj.payload);
  }

  if (looksLikeServerSnapshot(obj.result)) {
    return unwrapServerSnapshot(obj.result);
  }

  if (looksLikeServerSnapshot(obj.snapshot)) {
    return unwrapServerSnapshot(obj.snapshot);
  }

  if (looksLikeServerSnapshot(obj.response)) {
    return unwrapServerSnapshot(obj.response);
  }

  if (looksLikeServerSnapshot(obj.body)) {
    return unwrapServerSnapshot(obj.body);
  }

  return {};
}

function getResolvedSnapshot(data = {}) {
  const direct = normalizeServerSnapshotModel(data);

  if (
    direct.servicesCount ||
    safeArray(direct.services).length ||
    Object.keys(safeObject(direct.telemetry)).length
  ) {
    return direct;
  }

  const fromEnvelope = normalizeServerSnapshotModel(
    unwrapServerSnapshot(data)
  );

  if (
    fromEnvelope.servicesCount ||
    safeArray(fromEnvelope.services).length ||
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

  const pageSize = Math.max(
    1,
    safeNumber(
      first(
        localState.pageSize,
        localState.serverPageSize,
        PAGE_SIZE
      ),
      PAGE_SIZE
    )
  );

  const totalItems = list.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = clampPage(first(localState.page, localState.currentPage, 1), totalPages);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageItems = list.slice(start, end);

  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    start,
    end,
    items: pageItems,
    from: totalItems && pageItems.length ? start + 1 : 0,
    to: Math.min(end, totalItems),
    hasPrev: page > 1,
    hasNext: page < totalPages,
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
    const status = normalizeKey(item.status);

    return ["ok", "up", "healthy", "online", "success", "operativo", "operativa"].includes(status);
  }).length;

  const warningCount = services.filter((item) => {
    const status = normalizeKey(item.status);

    return ["warning", "pending", "degraded", "slow", "revisar"].includes(status);
  }).length;

  const errorCount = services.filter((item) => {
    const status = normalizeKey(item.status);

    return ["error", "critical", "down", "offline", "failed", "disabled"].includes(status);
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

/* =========================================================
   CLASS HELPERS
========================================================= */

function getStatusClass(value = "") {
  const key = normalizeKey(value);

  if (["ok", "up", "healthy", "online", "success", "operativo", "operativa"].includes(key)) {
    return "ok";
  }

  if (["warning", "pending", "degraded", "slow", "revisar"].includes(key)) {
    return "warning";
  }

  if (["error", "critical", "down", "offline", "failed", "disabled"].includes(key)) {
    return "error";
  }

  return "unknown";
}

function getTypeClass(value = "") {
  const key = normalizeKey(value);

  if (["api", "service", "runtime"].includes(key)) {
    return "api";
  }

  if (["db", "database", "cosmos", "storage", "blob"].includes(key)) {
    return "db";
  }

  if (["system", "host", "environment"].includes(key)) {
    return "system";
  }

  if (["telemetry", "metric", "metrics", "health"].includes(key)) {
    return "telemetry";
  }

  return "default";
}

function getThemeClass(service = {}) {
  const theme = safeText(
    first(
      service.theme,
      getServerTheme(service.serviceId || service.title || service.name || "server")
    ),
    "violet"
  );

  const key = normalizeKey(theme);

  if (
    [
      "violet",
      "emerald",
      "blue",
      "amber",
      "rose",
      "purple",
      "cyan",
      "orange",
    ].includes(key)
  ) {
    return key;
  }

  return "violet";
}

/* =========================================================
   UI ATOMS
========================================================= */

function renderInlineLoader(label = "Cargando") {
  return `
    <span class="server-inline-loading" role="status" aria-label="${escapeHtml(label)}">
      <span class="server-inline-spinner" aria-hidden="true"></span>
      <span class="server-inline-loading-text">${escapeHtml(label)}</span>
    </span>
  `;
}

function renderStatCard({
  label = "",
  value = "0",
  caption = "",
  accent = false,
  tone = "default",
} = {}) {
  return `
    <article class="server-stat-card ${accent ? "server-stat-card--accent" : ""} server-stat-card--${escapeHtml(tone)}">
      <span class="server-stat-label">${escapeHtml(label)}</span>
      <strong class="server-stat-value">${escapeHtml(String(value))}</strong>
      <p class="server-stat-caption">${escapeHtml(caption)}</p>
    </article>
  `;
}

function renderChip({
  label = "",
  kind = "default",
  value = "default",
} = {}) {
  return `
    <span class="server-chip server-chip--${escapeHtml(kind)} server-chip--${escapeHtml(kind)}-${escapeHtml(value)}">
      <span class="server-chip-dot" aria-hidden="true"></span>
      ${escapeHtml(label)}
    </span>
  `;
}

/* =========================================================
   HERO
========================================================= */

export function renderHeader({ snapshot = {}, state = {} } = {}) {
  const resolvedSnapshot = getResolvedSnapshot(snapshot);
  const localState = safeObject(state || serverState || {});
  const telemetry = safeObject(resolvedSnapshot.telemetry);
  const global = safeObject(telemetry.global);
  const stats = computeServerStats(resolvedSnapshot);

  const loading = Boolean(localState.loading);
  const refreshing = Boolean(localState.refreshing);
  const autoRefresh = Boolean(localState.autoRefresh);

  const lastSyncText = localState.lastSyncAt
    ? formatRelativeDate(localState.lastSyncAt)
    : "Sin sincronización reciente";

  const requestId = safeText(
    first(localState.requestId, resolvedSnapshot.requestId),
    ""
  );

  const healthStatus = safeText(global.status, "unknown");
  const serviceName = safeText(global.service, "onion-backend");
  const healthClass = getStatusClass(healthStatus);

  return `
    <section class="server-view-root" data-server-scope="true">
      <section class="server-hero">
        <div class="server-hero-inner">
          <div class="server-hero-top">
            <div class="server-hero-copy">
              <span class="server-kicker">Observabilidad server</span>

              <div class="server-title-stack">
                <h1 class="server-page-title">Centro de control del servidor</h1>

                <p class="server-page-subtitle">
                  Estado agregado de API, base de datos, host, runtime Node/V8,
                  latencias reales, health interno y métricas clave del entorno
                  en un panel premium de supervisión técnica.
                </p>
              </div>
            </div>

            <div class="server-hero-actions">
              <button
                id="server-health-btn"
                type="button"
                class="server-btn server-btn--secondary"
                data-action="refresh-health"
                ${loading || refreshing ? 'aria-busy="true"' : ""}
              >
                Refrescar health
              </button>

              <button
                id="server-refresh-btn"
                type="button"
                class="server-btn server-btn--primary ${refreshing ? "is-loading" : ""}"
                data-action="refresh"
                ${loading || refreshing ? 'aria-busy="true"' : ""}
              >
                ${refreshing ? renderInlineLoader("Actualizando") : "Actualizar panel"}
              </button>

              <button
                id="server-toggle-live-btn"
                type="button"
                class="server-btn server-btn--ghost ${autoRefresh ? "is-active" : ""}"
                data-action="toggle-live"
                aria-pressed="${autoRefresh ? "true" : "false"}"
              >
                ${autoRefresh ? "Live ON" : "Live OFF"}
              </button>
            </div>
          </div>

          <div class="server-hero-meta">
            <span class="server-meta-pill">
              <span class="server-meta-label">Servicio</span>
              <strong>${escapeHtml(serviceName)}</strong>
            </span>

            <span class="server-meta-pill server-meta-pill--${escapeHtml(healthClass)}">
              <span class="server-meta-label">Health</span>
              <strong>${escapeHtml(healthStatus)}</strong>
            </span>

            <span class="server-meta-pill">
              <span class="server-meta-label">Última sync</span>
              <strong>${escapeHtml(lastSyncText)}</strong>
            </span>

            ${
              requestId
                ? `
                  <span class="server-meta-pill">
                    <span class="server-meta-label">Request</span>
                    <strong>${escapeHtml(requestId)}</strong>
                  </span>
                `
                : ""
            }

            ${
              refreshing || loading
                ? `
                  <span class="server-meta-pill server-meta-pill--syncing" aria-live="polite">
                    <span class="server-live-dot" aria-hidden="true"></span>
                    <strong>Sincronizando</strong>
                  </span>
                `
                : ""
            }
          </div>

          <div class="server-hero-stats">
            ${renderStatCard({
              label: "Servicios / OK",
              value: `${stats.servicesTotal} / ${stats.okCount}`,
              caption: "Servicios técnicos resueltos desde health + telemetry.",
              accent: true,
              tone: "accent",
            })}

            ${renderStatCard({
              label: "CPU / RAM / disco",
              value: `${stats.cpuPercent ?? "—"}% / ${stats.ramPercent ?? "—"}% / ${stats.diskPercent ?? "—"}%`,
              caption: "Snapshot actual del host principal.",
              tone: "system",
            })}

            ${renderStatCard({
              label: "Event loop / alertas",
              value: `${stats.eventLoopLag ? formatMs(stats.eventLoopLag) : "—"} / ${stats.errorCount}`,
              caption: "Lag del loop y servicios en error.",
              tone: stats.errorCount ? "danger" : "success",
            })}

            ${renderStatCard({
              label: "Facturas / tickets",
              value: `${stats.totalFacturas} / ${stats.ticketsActivos}`,
              caption: "Cruce rápido con el dashboard agregado.",
              tone: "info",
            })}
          </div>
        </div>
      </section>
    </section>
  `;
}

/* =========================================================
   STATES
========================================================= */

export function renderLoadingState() {
  return `
    <section class="server-shell server-shell--loading" data-server-loading="true">
      <div class="server-loading-head">
        <div class="server-skeleton server-skeleton--title"></div>
        <div class="server-skeleton server-skeleton--pill"></div>
      </div>

      <div class="server-skeleton-grid">
        ${Array.from({ length: PAGE_SIZE })
          .map(
            () => `
              <article class="server-skeleton-card" aria-hidden="true">
                <div class="server-skeleton-card-head">
                  <div class="server-skeleton server-skeleton--avatar"></div>

                  <div class="server-skeleton-copy">
                    <div class="server-skeleton server-skeleton--line-lg"></div>
                    <div class="server-skeleton server-skeleton--line-sm"></div>
                  </div>

                  <div class="server-skeleton server-skeleton--chip"></div>
                </div>

                <div class="server-skeleton server-skeleton--metric"></div>
                <div class="server-skeleton server-skeleton--line-full"></div>
                <div class="server-skeleton server-skeleton--line-md"></div>

                <div class="server-skeleton-actions">
                  <div class="server-skeleton server-skeleton--btn"></div>
                  <div class="server-skeleton server-skeleton--btn-sm"></div>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

export function renderErrorState(message = "No se pudo cargar el panel de servidor.") {
  return `
    <section class="server-state server-state--error">
      <div class="server-state-copy">
        <span class="server-state-kicker">Error de carga</span>

        <h3 class="server-state-title">No se pudo renderizar la vista Server</h3>

        <p class="server-state-text">
          ${escapeHtml(safeText(message, "Error desconocido al cargar el panel técnico."))}
        </p>
      </div>

      <div class="server-state-actions">
        <button
          id="server-retry-btn"
          type="button"
          class="server-btn server-btn--primary"
          data-action="retry"
        >
          Reintentar
        </button>
      </div>
    </section>
  `;
}

export function renderEmptyState() {
  return `
    <section class="server-state server-state--empty">
      <div class="server-state-copy">
        <span class="server-state-kicker">Sin datos</span>

        <h3 class="server-state-title">No hay servicios para mostrar</h3>

        <p class="server-state-text">
          El snapshot técnico no devolvió servicios visibles o todavía no hay
          datos agregados disponibles del health interno y la telemetría.
        </p>
      </div>

      <div class="server-state-actions">
        <button
          id="server-refresh-btn"
          type="button"
          class="server-btn server-btn--primary"
          data-action="refresh"
        >
          Actualizar panel
        </button>
      </div>
    </section>
  `;
}

/* =========================================================
   SERVICE CARD
========================================================= */

function renderServiceAvatar(service = {}) {
  const title = safeText(service.title, "Servicio");
  const initials = safeText(service.initials, getInitials(title));
  const icon = safeText(service.icon, "");
  const themeClass = getThemeClass(service);

  return `
    <div class="server-service-avatar server-service-avatar--${escapeHtml(themeClass)}" aria-hidden="true">
      <span>${escapeHtml(icon || initials)}</span>
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
  ]
    .filter(Boolean)
    .slice(0, 2);

  if (!lines.length) {
    return `
      <div class="server-service-preview server-service-preview--empty">
        <span>Sin información adicional.</span>
      </div>
    `;
  }

  return `
    <div class="server-service-preview">
      ${lines
        .map(
          (line) => `
            <div class="server-service-preview-row">
              <span>${escapeHtml(truncate(line, 96))}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderServiceActionButtons(service = {}, state = {}) {
  const serviceId = safeText(service.serviceId, "");
  const route = safeText(service.route, "");
  const isOpening = safeText(state.openingDetailId, "") === serviceId;

  return `
    <div class="server-service-actions">
      <button
        type="button"
        class="server-action-btn server-action-btn--secondary ${isOpening ? "is-loading" : ""}"
        data-action="open-server-detail"
        data-detail-id="${escapeHtml(serviceId)}"
        ${isOpening ? 'disabled aria-busy="true"' : ""}
      >
        ${isOpening ? renderInlineLoader("Abriendo") : "Ver detalle"}
      </button>

      <button
        type="button"
        class="server-action-btn server-action-btn--primary"
        data-action="copy-server-detail-id"
        data-detail-id="${escapeHtml(serviceId)}"
      >
        Copiar ID
      </button>

      ${
        route
          ? `
            <button
              type="button"
              class="server-action-btn server-action-btn--ghost"
              data-action="navigate-server"
              data-route="${escapeHtml(route)}"
            >
              Abrir
            </button>
          `
          : ""
      }
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
  const statusClass = getStatusClass(service.status);
  const typeClass = getTypeClass(service.type);
  const themeClass = getThemeClass(service);

  const primaryValue = service.hasLatency
    ? formatMs(service.latencyMs)
    : service.hasPercent
      ? `${Math.round(Number(service.percent))}%`
      : service.numericValue !== null && service.numericValue !== undefined
        ? String(service.numericValue)
        : "—";

  const metricLabel = service.hasLatency
    ? "Latencia técnica reportada"
    : service.hasPercent
      ? "Uso actual reportado"
      : "Snapshot actual";

  const updatedAt = service.updatedAt
    ? formatRelativeDate(service.updatedAt)
    : "Sin fecha";

  const isOpening = safeText(state.openingDetailId, "") === serviceId;

  return `
    <article
      class="server-service-card server-service-card--${escapeHtml(statusClass)} server-service-card--theme-${escapeHtml(themeClass)} ${isOpening ? "is-opening" : ""}"
      data-detail-id="${escapeHtml(serviceId)}"
      data-status="${escapeHtml(statusClass)}"
      data-type="${escapeHtml(typeClass)}"
    >
      <div class="server-service-head">
        <div class="server-service-identity">
          ${renderServiceAvatar(service)}

          <div class="server-service-copy">
            <button
              type="button"
              class="server-service-title-btn"
              data-action="open-server-detail"
              data-detail-id="${escapeHtml(serviceId)}"
              ${isOpening ? "disabled" : ""}
            >
              ${escapeHtml(title)}
            </button>

            <span class="server-service-id">
              Service ${escapeHtml(serviceId || "—")}
            </span>
          </div>
        </div>

        <div class="server-service-chips">
          ${renderChip({
            label: typeLabel,
            kind: "type",
            value: typeClass,
          })}

          ${renderChip({
            label: statusLabel,
            kind: "status",
            value: statusClass,
          })}
        </div>
      </div>

      <div class="server-service-metric">
        <strong>${escapeHtml(primaryValue)}</strong>
        <span>${escapeHtml(metricLabel)}</span>
      </div>

      <p class="server-service-description">
        ${escapeHtml(truncate(description, 140))}
      </p>

      ${renderServicePreview(service)}

      <div class="server-service-footer">
        <span class="server-service-updated">
          Actualizado ${escapeHtml(updatedAt)}
        </span>

        ${renderServiceActionButtons(service, state)}
      </div>
    </article>
  `;
}

/* =========================================================
   TECHNICAL SIDEBAR
========================================================= */

function renderTechnicalBlock({ title = "", rows = [] } = {}) {
  return `
    <article class="server-tech-block">
      <strong class="server-tech-block-title">${escapeHtml(title)}</strong>

      <div class="server-tech-rows">
        ${safeArray(rows)
          .map(
            ([label, value]) => `
              <div class="server-tech-row">
                <span>${escapeHtml(String(label))}</span>
                <strong>${escapeHtml(String(value))}</strong>
              </div>
            `
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderTechnicalSidebar(snapshot = {}) {
  const telemetry = safeObject(snapshot.telemetry);
  const server = safeObject(telemetry.server);
  const runtime = safeObject(telemetry.runtime);
  const environment = safeObject(telemetry.environment);
  const browserMetrics = safeObject(snapshot.browserMetrics);

  const blocks = [
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
        ["RSS", runtime.rssMB !== null && runtime.rssMB !== undefined ? formatMB(runtime.rssMB) : "—"],
        ["Heap used", runtime.heapUsedMB !== null && runtime.heapUsedMB !== undefined ? formatMB(runtime.heapUsedMB) : "—"],
        ["Heap total", runtime.heapTotalMB !== null && runtime.heapTotalMB !== undefined ? formatMB(runtime.heapTotalMB) : "—"],
      ],
    },
    {
      title: "Capacidad",
      rows: [
        [
          "RAM",
          server.ramUsedGB !== null && server.ramUsedGB !== undefined
            ? `${formatGB(server.ramUsedGB)} / ${formatGB(server.ramTotalGB)}`
            : "—",
        ],
        [
          "Disco",
          server.diskUsedGB !== null && server.diskUsedGB !== undefined
            ? `${formatGB(server.diskUsedGB)} / ${formatGB(server.diskTotalGB)}`
            : "—",
        ],
        [
          "CPU",
          server.cpuPercent !== null && server.cpuPercent !== undefined
            ? `${Math.round(server.cpuPercent)}%`
            : "—",
        ],
        [
          "Event loop",
          server.eventLoopLag !== null && server.eventLoopLag !== undefined
            ? formatMs(server.eventLoopLag)
            : "—",
        ],
        [
          "TTFB",
          browserMetrics.ttfb !== null && browserMetrics.ttfb !== undefined
            ? formatMs(browserMetrics.ttfb)
            : "—",
        ],
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
    <aside class="server-tech-sidebar">
      <div class="server-tech-head">
        <div class="server-tech-copy">
          <strong>Resumen técnico</strong>
          <span>Vista compacta de host, runtime y entorno.</span>
        </div>

        <span class="server-tech-count">4 bloques</span>
      </div>

      <div class="server-tech-list">
        ${blocks.map((block) => renderTechnicalBlock(block)).join("")}
      </div>
    </aside>
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
    <div class="server-dashboard-toolbar">
      <div class="server-dashboard-toolbar-copy">
        <strong>Servicios y componentes</strong>

        <span>
          Mostrando ${escapeHtml(String(from))}-${escapeHtml(String(to))} de ${escapeHtml(String(total))}
          · página ${escapeHtml(String(page))} de ${escapeHtml(String(totalPages))}
        </span>
      </div>

      <div class="server-dashboard-toolbar-actions">
        <span class="server-toolbar-pill">Vista técnica</span>

        ${
          refreshing
            ? `
              <span class="server-toolbar-pill server-toolbar-pill--syncing" aria-live="polite">
                <span class="server-live-dot" aria-hidden="true"></span>
                Actualizando
              </span>
            `
            : ""
        }

        <button
          type="button"
          class="server-pagination-btn"
          data-action="prev-page"
          ${page <= 1 ? 'disabled aria-disabled="true"' : ""}
        >
          Anterior
        </button>

        <span class="server-pagination-status">
          ${escapeHtml(`${page}/${totalPages}`)}
        </span>

        <button
          type="button"
          class="server-pagination-btn"
          data-action="next-page"
          ${page >= totalPages ? 'disabled aria-disabled="true"' : ""}
        >
          Siguiente
        </button>
      </div>
    </div>
  `;
}

function renderDashboardLoadingOverlay(message = "Actualizando panel técnico...") {
  return `
    <div class="server-dashboard-overlay" aria-live="polite" aria-busy="true">
      <div class="server-dashboard-overlay-card">
        <span class="server-dashboard-overlay-spinner" aria-hidden="true"></span>

        <strong>${escapeHtml(message)}</strong>

        <span>Solo se está actualizando la sección principal</span>
      </div>
    </div>
  `;
}

/* =========================================================
   MAIN DASHBOARD
========================================================= */

export function renderDashboard({ snapshot = {}, state = {} } = {}) {
  const localState = safeObject(state || serverState || {});
  const resolvedSnapshot = getResolvedSnapshot(snapshot);

  const services = sortServerServicesByLatencyDesc(
    safeArray(resolvedSnapshot.services)
  );

  const refreshing = Boolean(localState.refreshing);
  const loading = Boolean(localState.loading);
  const error = safeText(localState.error, "");

  if (loading && !services.length) {
    return renderLoadingState();
  }

  if (error && !services.length) {
    return renderErrorState(error);
  }

  if (!services.length) {
    return renderEmptyState();
  }

  const pagination = getPagination(services, localState);

  return `
    <section class="server-dashboard-wrap ${refreshing ? "is-refreshing" : ""}">
      ${renderDashboardToolbar({
        total: pagination.totalItems,
        page: pagination.page,
        totalPages: pagination.totalPages,
        from: pagination.from,
        to: pagination.to,
        refreshing,
      })}

      <div class="server-dashboard-main-grid">
        <div class="server-services-grid">
          ${pagination.items
            .map((item) => renderServiceCard(item, localState))
            .join("")}
        </div>

        ${renderTechnicalSidebar(resolvedSnapshot)}
      </div>

      ${refreshing ? renderDashboardLoadingOverlay("Actualizando panel técnico...") : ""}
    </section>
  `;
}

/* =========================================================
   BACKWARD COMPAT EXPORTS
========================================================= */

export function renderCards({ snapshot = {}, state = {} } = {}) {
  return renderDashboard({ snapshot, state });
}

export default {
  renderHeader,
  renderLoadingState,
  renderErrorState,
  renderEmptyState,
  renderDashboard,
  renderCards,
};
