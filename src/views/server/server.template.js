/* =========================================================
   Onion Support - Servidor Template
   Archivo: /src/views/server/server.template.js

   PRODUCTIVO · TEMPLATE PURO · OBSERVABILIDAD · 10/10

   Responsabilidad:
   - Render visual de la vista Servidor.
   - Header / Hero.
   - Dashboard técnico.
   - Cards de servicios: Backend, BD, Blobs, Azure, CPU, RAM.
   - Tabla de endpoints detectados.
   - Estados loading / error / empty.
   - Compatible con serverView.js legacy.
   - Compatible con index.js productivo.
   - Sin imports.
   - Sin HTTP.
   - Sin DOM directo.
   - Sin Store.
   - Sin Router.
   - Sin CSS inline.
   - Sin handlers inline.
========================================================= */

/* =========================================================
   META / CONSTANTS
========================================================= */

export const SERVER_TEMPLATE_VERSION =
  "server.template.productive.v1.observability.pure";

export const SERVIDOR_TEMPLATE_VERSION = SERVER_TEMPLATE_VERSION;

export const DEFAULT_PAGE_SIZE = 6;

export const SERVER_ACTIONS = Object.freeze({
  REFRESH: "refresh",
  REFRESH_SERVER: "refresh-server",
  REFRESH_HEALTH: "refresh-health",
  LOAD_HEALTH: "load-server-health",
  TOGGLE_LIVE: "toggle-live",
  COPY_JSON: "copy-json",
  COPY_DETAIL: "copy-server-detail-id",
  OPEN_DETAIL: "open-server-detail",
});

export const SERVER_STATUS = Object.freeze({
  HEALTHY: "healthy",
  WARNING: "warning",
  CRITICAL: "critical",
  UNKNOWN: "unknown",
});

/* =========================================================
   SAFE HELPERS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  if (Array.isArray(value)) return value;

  if (
    value &&
    typeof value === "object" &&
    typeof value.length === "number" &&
    typeof value !== "string"
  ) {
    try {
      return Array.from(value);
    } catch {
      return [];
    }
  }

  return [];
}

function safeText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

function safeNumber(value = 0, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value = 0, min = 0, max = 1) {
  return Math.min(Math.max(safeNumber(value, min), min), max);
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function attr(value = "") {
  return escapeHtml(safeText(value, ""));
}

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

/* =========================================================
   FORMAT
========================================================= */

function toTimestamp(value = null) {
  if (!value) return 0;

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9999999999 ? value : value * 1000;
  }

  const raw = safeText(value, "");
  if (!raw) return 0;

  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 9999999999 ? numeric : numeric * 1000;
  }

  const date = new Date(raw);
  const ms = date.getTime();

  return Number.isFinite(ms) ? ms : 0;
}

function formatDateTime(value = null) {
  const ts = toTimestamp(value);
  if (!ts) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(ts));
  } catch {
    return "—";
  }
}

function formatDuration(seconds = 0) {
  const value = Math.max(0, safeNumber(seconds, 0));

  if (!value) return "—";

  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes || 1}m`;
}

function formatBytes(value = 0) {
  const bytes = safeNumber(value, 0);

  if (!bytes) return "—";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = Math.abs(bytes);
  let unit = 0;

  while (current >= 1024 && unit < units.length - 1) {
    current /= 1024;
    unit += 1;
  }

  const sign = bytes < 0 ? "-" : "";
  const decimals = unit <= 1 ? 0 : 1;

  return `${sign}${current.toFixed(decimals)} ${units[unit]}`;
}

function formatPercent(value = null) {
  if (value === null || value === undefined || value === "") return "—";

  const numeric = safeNumber(value, NaN);
  if (!Number.isFinite(numeric)) return "—";

  const normalized = numeric <= 1 && numeric >= 0 ? numeric * 100 : numeric;

  return `${clamp(normalized, 0, 999).toFixed(normalized >= 10 ? 0 : 1)}%`;
}

function formatMs(value = null) {
  const numeric = safeNumber(value, NaN);
  if (!Number.isFinite(numeric)) return "—";

  return `${Math.max(0, Math.round(numeric))} ms`;
}

/* =========================================================
   STATUS
========================================================= */

export function normalizeStatus(value = "") {
  const key = normalizeKey(value);

  if (
    [
      "ok",
      "up",
      "online",
      "healthy",
      "success",
      "ready",
      "running",
      "connected",
      "active",
      "available",
      "operational",
    ].includes(key)
  ) {
    return "healthy";
  }

  if (
    [
      "warn",
      "warning",
      "degraded",
      "partial",
      "slow",
      "limited",
      "unstable",
    ].includes(key)
  ) {
    return "warning";
  }

  if (
    [
      "error",
      "fail",
      "failed",
      "down",
      "offline",
      "unhealthy",
      "critical",
      "disconnected",
      "unavailable",
      "ko",
    ].includes(key)
  ) {
    return "critical";
  }

  if (!key) return "unknown";

  return key;
}

export function getStatusLabel(status = "") {
  const value = normalizeStatus(status);

  if (value === "healthy") return "Operativo";
  if (value === "warning") return "Degradado";
  if (value === "critical") return "Crítico";

  return "Desconocido";
}

function statusWeight(status = "") {
  const value = normalizeStatus(status);

  if (value === "critical") return 3;
  if (value === "warning") return 2;
  if (value === "unknown") return 1;
  return 0;
}

function worstStatus(statuses = []) {
  const list = safeArray(statuses).map(normalizeStatus);

  if (!list.length) return "unknown";

  return list.sort((a, b) => statusWeight(b) - statusWeight(a))[0] || "unknown";
}

/* =========================================================
   SNAPSHOT NORMALIZATION
========================================================= */

function normalizeService(service = {}) {
  const source = safeObject(service);
  const status = normalizeStatus(first(source.status, source.health, source.state, "unknown"));

  return {
    id: normalizeKey(first(source.id, source.key, source.name, source.label, "service")),
    label: safeText(first(source.label, source.name, source.title, "Servicio"), "Servicio"),
    status,
    statusLabel: safeText(first(source.statusLabel, getStatusLabel(status)), getStatusLabel(status)),
    latencyMs: first(source.latencyMs, source.latency, source.pingMs, null),
    endpoint: safeText(first(source.endpoint, source.url, source.path, ""), ""),
    detail: safeText(first(source.detail, source.description, source.message, source.error, ""), ""),
    value: safeText(first(source.value, source.displayValue, ""), ""),
    error: safeText(first(source.error, ""), ""),
    raw: source.raw ?? source,
  };
}

function createEmptyServices() {
  return [
    normalizeService({
      id: "backend",
      label: "Backend API",
      status: "unknown",
      detail: "Pendiente de consulta.",
    }),
    normalizeService({
      id: "database",
      label: "Base de datos",
      status: "unknown",
      detail: "Pendiente de consulta.",
    }),
    normalizeService({
      id: "blobs",
      label: "Blob Storage",
      status: "unknown",
      detail: "Pendiente de consulta.",
    }),
    normalizeService({
      id: "azure",
      label: "Azure",
      status: "unknown",
      detail: "Pendiente de consulta.",
    }),
    normalizeService({
      id: "cpu",
      label: "CPU",
      status: "unknown",
      value: "—",
      detail: "Pendiente de consulta.",
    }),
    normalizeService({
      id: "memory",
      label: "RAM",
      status: "unknown",
      value: "—",
      detail: "Pendiente de consulta.",
    }),
  ];
}

function normalizeSnapshot(input = {}) {
  const state = safeObject(input);
  const snapshot = safeObject(first(state.snapshot, state.server, state.statusSnapshot, state.data, state), {});
  const services = safeArray(first(snapshot.services, state.services, [])).map(normalizeService);
  const finalServices = services.length ? services : createEmptyServices();

  const status = normalizeStatus(
    first(
      snapshot.status,
      state.status,
      worstStatus(finalServices.map((service) => service.status)),
      "unknown"
    )
  );

  const cpuUsage = first(snapshot.cpuUsage, snapshot.cpu, state.cpuUsage, state.cpu, null);
  const memoryUsage = first(snapshot.memoryUsage, snapshot.ramUsage, snapshot.memory, state.memoryUsage, state.ramUsage, null);
  const memoryUsedBytes = first(snapshot.memoryUsedBytes, snapshot.ramUsedBytes, state.memoryUsedBytes, state.ramUsedBytes, null);
  const memoryTotalBytes = first(snapshot.memoryTotalBytes, snapshot.ramTotalBytes, state.memoryTotalBytes, state.ramTotalBytes, null);
  const uptimeSeconds = first(snapshot.uptimeSeconds, snapshot.uptime, state.uptimeSeconds, state.uptime, 0);
  const latencyMs = first(snapshot.latencyMs, snapshot.latency, state.latencyMs, state.latency, null);

  return {
    version: SERVER_TEMPLATE_VERSION,
    status,
    statusLabel: safeText(first(snapshot.statusLabel, state.statusLabel, getStatusLabel(status)), getStatusLabel(status)),
    ok: first(snapshot.ok, state.ok, status === "healthy" || status === "warning", false),

    checkedAt: first(snapshot.checkedAt, state.checkedAt, state.lastSyncAt, ""),
    uptimeSeconds: safeNumber(uptimeSeconds, 0),
    uptimeLabel: safeText(first(snapshot.uptimeLabel, formatDuration(uptimeSeconds)), formatDuration(uptimeSeconds)),

    latencyMs,
    latencyLabel: safeText(first(snapshot.latencyLabel, formatMs(latencyMs)), formatMs(latencyMs)),

    cpuUsage,
    cpuUsageLabel: safeText(first(snapshot.cpuUsageLabel, formatPercent(cpuUsage)), formatPercent(cpuUsage)),

    memoryUsage,
    memoryUsageLabel: safeText(first(snapshot.memoryUsageLabel, formatPercent(memoryUsage)), formatPercent(memoryUsage)),
    memoryUsedBytes,
    memoryTotalBytes,
    memoryLabel: safeText(
      first(
        snapshot.memoryLabel,
        memoryUsedBytes || memoryTotalBytes
          ? `${formatBytes(memoryUsedBytes)} / ${formatBytes(memoryTotalBytes)}`
          : formatPercent(memoryUsage)
      ),
      "—"
    ),

    services: finalServices,
    endpoints: safeObject(first(snapshot.endpoints, state.endpoints, {}), {}),
    raw: safeObject(first(snapshot.raw, state.raw, {}), {}),
  };
}

function getViewModel(input = {}) {
  const state = safeObject(input);
  const snapshot = normalizeSnapshot(state);

  return {
    snapshot,
    loading: Boolean(first(state.loading, state.isLoading, false)),
    refreshing: Boolean(first(state.refreshing, state.isRefreshing, false)),
    live: Boolean(first(state.live, state.autoRefresh, state.realtime, false)),
    error: safeText(first(state.error, state.message, ""), ""),
    forbidden: Boolean(first(state.forbidden, state.accessDenied, state.restricted, false)),
  };
}

/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common = [
    'aria-hidden="true"',
    'focusable="false"',
    'width="18"',
    'height="18"',
    'viewBox="0 0 24 24"',
    'fill="none"',
    'stroke="currentColor"',
    'stroke-width="2"',
    'stroke-linecap="round"',
    'stroke-linejoin="round"',
  ].join(" ");

  const icons = {
    server: `<svg ${common}><rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01"/><path d="M6 18h.01"/></svg>`,
    refresh: `<svg ${common}><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>`,
    live: `<svg ${common}><path d="M4 12a8 8 0 0 1 8-8"/><path d="M4 12a8 8 0 0 0 8 8"/><path d="M20 12a8 8 0 0 0-8-8"/><path d="M20 12a8 8 0 0 1-8 8"/><circle cx="12" cy="12" r="2"/></svg>`,
    copy: `<svg ${common}><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
    cpu: `<svg ${common}><rect width="14" height="14" x="5" y="5" rx="2"/><path d="M9 1v4"/><path d="M15 1v4"/><path d="M9 19v4"/><path d="M15 19v4"/><path d="M1 9h4"/><path d="M1 15h4"/><path d="M19 9h4"/><path d="M19 15h4"/></svg>`,
    db: `<svg ${common}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/></svg>`,
    cloud: `<svg ${common}><path d="M17.5 19H8a6 6 0 1 1 5.6-8.1A4.5 4.5 0 1 1 17.5 19z"/></svg>`,
    memory: `<svg ${common}><path d="M6 19v-3"/><path d="M10 19v-3"/><path d="M14 19v-3"/><path d="M18 19v-3"/><path d="M8 5V2"/><path d="M16 5V2"/><rect width="16" height="11" x="4" y="5" rx="2"/></svg>`,
    clock: `<svg ${common}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  };

  return icons[name] || icons.server;
}

function serviceIcon(service = {}) {
  const id = normalizeKey(service.id);

  if (id.includes("database") || id.includes("db")) return icon("db");
  if (id.includes("blob") || id.includes("storage") || id.includes("azure")) return icon("cloud");
  if (id.includes("cpu")) return icon("cpu");
  if (id.includes("memory") || id.includes("ram")) return icon("memory");

  return icon("server");
}

/* =========================================================
   PARTIALS
========================================================= */

function renderSpinner(label = "Cargando") {
  return `
    <span class="server-spinner" aria-hidden="true"></span>
    <span>${escapeHtml(label)}</span>
  `;
}

function renderStatusChip(status = "") {
  const normalized = normalizeStatus(status);

  return `
    <span class="server-status-chip server-status-chip--${attr(normalized)}">
      <span class="server-status-dot" aria-hidden="true"></span>
      ${escapeHtml(getStatusLabel(normalized))}
    </span>
  `;
}

export function renderServiceCard(service = {}) {
  const item = normalizeService(service);
  const status = normalizeStatus(item.status);

  return `
    <article
      class="server-service-card server-service-card--${attr(status)}"
      data-server-service="${attr(item.id)}"
      data-status="${attr(status)}"
    >
      <div class="server-service-icon">
        ${serviceIcon(item)}
      </div>

      <div class="server-service-copy">
        <span class="server-service-label">${escapeHtml(item.label)}</span>
        <strong class="server-service-value">${escapeHtml(item.value || item.statusLabel)}</strong>
        <span class="server-service-detail">${escapeHtml(item.detail || item.endpoint || "Sin detalle")}</span>
      </div>

      ${renderStatusChip(status)}

      ${
        item.latencyMs !== null && item.latencyMs !== undefined
          ? `<span class="server-service-latency">${escapeHtml(formatMs(item.latencyMs))}</span>`
          : ""
      }
    </article>
  `;
}

function renderEndpointRow([key, endpoint] = []) {
  const item = safeObject(endpoint);
  const status = item.ok ? "healthy" : "critical";

  return `
    <tr class="server-endpoint-row server-endpoint-row--${attr(status)}">
      <td>${escapeHtml(key)}</td>
      <td>${escapeHtml(item.endpoint || "No disponible")}</td>
      <td>${escapeHtml(item.latencyMs === null || item.latencyMs === undefined ? "—" : formatMs(item.latencyMs))}</td>
      <td>${escapeHtml(item.ok ? "OK" : item.error || "KO")}</td>
    </tr>
  `;
}

export function renderHeader(input = {}) {
  const vm = getViewModel(input);
  const snapshot = vm.snapshot;
  const status = normalizeStatus(snapshot.status);

  return `
    <section class="server-hero servidor-hero">
      <div class="server-hero-top">
        <div class="server-hero-copy">
          <p class="server-kicker">Onion Observability</p>
          <h1 class="server-title">Estado del servidor</h1>
          <p class="server-subtitle">
            Backend, base de datos, blobs, Azure, CPU, RAM y métricas operativas en tiempo real.
          </p>
        </div>

        <div class="server-hero-actions">
          <button
            type="button"
            class="server-btn"
            data-server-action="refresh"
            data-action="refresh-server"
            ${vm.refreshing || vm.loading ? 'disabled aria-disabled="true"' : ""}
          >
            ${icon("refresh")}
            <span>${vm.refreshing || vm.loading ? "Consultando" : "Actualizar"}</span>
          </button>

          <button
            type="button"
            class="server-btn ${vm.live ? "is-active" : ""}"
            data-server-action="toggle-live"
            data-action="toggle-live"
            aria-pressed="${vm.live ? "true" : "false"}"
          >
            ${icon("live")}
            <span>${vm.live ? "Live activo" : "Live off"}</span>
          </button>

          <button
            type="button"
            class="server-btn"
            data-server-action="copy-json"
            data-action="copy-json"
            ${!snapshot.checkedAt ? 'disabled aria-disabled="true"' : ""}
          >
            ${icon("copy")}
            <span>Copiar JSON</span>
          </button>
        </div>
      </div>

      <div class="server-hero-meta">
        <span class="server-meta-pill server-meta-pill--${attr(status)}">
          ${icon("server")}
          <span>${escapeHtml(snapshot.statusLabel)}</span>
        </span>

        <span class="server-meta-pill">
          ${icon("clock")}
          <span>${escapeHtml(snapshot.checkedAt ? `Última consulta · ${formatDateTime(snapshot.checkedAt)}` : "Pendiente de consulta")}</span>
        </span>

        <span class="server-meta-pill">
          ${icon("clock")}
          <span>Uptime · ${escapeHtml(snapshot.uptimeLabel || "—")}</span>
        </span>

        <span class="server-meta-pill">
          ${icon("server")}
          <span>Latencia · ${escapeHtml(snapshot.latencyLabel || "—")}</span>
        </span>
      </div>

      <div class="server-stats">
        <article class="server-stat-card server-stat-card--status">
          <span class="server-stat-label">Estado general</span>
          <strong class="server-stat-value">${escapeHtml(snapshot.statusLabel)}</strong>
          <span class="server-stat-text">Peor estado detectado entre servicios críticos.</span>
        </article>

        <article class="server-stat-card server-stat-card--cpu">
          <span class="server-stat-label">CPU</span>
          <strong class="server-stat-value">${escapeHtml(snapshot.cpuUsageLabel || "—")}</strong>
          <span class="server-stat-text">Uso actual reportado por backend.</span>
        </article>

        <article class="server-stat-card server-stat-card--memory">
          <span class="server-stat-label">RAM</span>
          <strong class="server-stat-value">${escapeHtml(snapshot.memoryUsageLabel || "—")}</strong>
          <span class="server-stat-text">${escapeHtml(snapshot.memoryLabel || "Uso de memoria.")}</span>
        </article>

        <article class="server-stat-card server-stat-card--services">
          <span class="server-stat-label">Servicios</span>
          <strong class="server-stat-value">${escapeHtml(String(snapshot.services.length))}</strong>
          <span class="server-stat-text">Backend, BD, blobs, Azure y recursos.</span>
        </article>
      </div>
    </section>
  `;
}

export function renderDashboard(input = {}) {
  const vm = getViewModel(input);
  const snapshot = vm.snapshot;
  const endpoints = Object.entries(safeObject(snapshot.endpoints));

  return `
    ${
      vm.error
        ? `
          <div class="server-error" role="alert">
            <strong>No se pudo completar la consulta.</strong>
            <span>${escapeHtml(vm.error)}</span>
          </div>
        `
        : ""
    }

    <section class="server-dashboard">
      <header class="server-section-head">
        <div>
          <p class="server-section-kicker">STATUS</p>
          <h2 class="server-section-title">Servicios monitorizados</h2>
        </div>
      </header>

      <div class="server-services-grid">
        ${snapshot.services.map((service) => renderServiceCard(service)).join("")}
      </div>
    </section>

    <section class="server-dashboard server-dashboard--endpoints">
      <header class="server-section-head">
        <div>
          <p class="server-section-kicker">ENDPOINTS</p>
          <h2 class="server-section-title">Rutas detectadas</h2>
        </div>
      </header>

      <div class="server-table-shell">
        <table class="server-table">
          <thead>
            <tr>
              <th>Grupo</th>
              <th>Endpoint</th>
              <th>Latencia</th>
              <th>Resultado</th>
            </tr>
          </thead>

          <tbody>
            ${
              endpoints.length
                ? endpoints.map(renderEndpointRow).join("")
                : `
                  <tr>
                    <td colspan="4">
                      <div class="server-empty">
                        <strong>Sin endpoints detectados.</strong>
                        <span>Pulsa actualizar para consultar el backend.</span>
                      </div>
                    </td>
                  </tr>
                `
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

export function renderLoadingState(input = {}) {
  const vm = getViewModel({
    ...input,
    loading: true,
  });

  return `
    <section
      class="server-view-root servidor-view-root"
      data-server-scope="true"
      data-servidor-scope="true"
      data-view="servidor"
      data-loading="true"
      data-refreshing="${vm.refreshing ? "true" : "false"}"
      data-live="${vm.live ? "true" : "false"}"
    >
      ${renderHeader(vm)}
      ${renderDashboard(vm)}

      <div class="server-loading" role="status" aria-live="polite">
        ${renderSpinner("Consultando estado del sistema…")}
      </div>
    </section>
  `;
}

export function renderErrorState(input = {}) {
  const vm = getViewModel(input);

  return `
    <section
      class="server-view-root servidor-view-root"
      data-server-scope="true"
      data-servidor-scope="true"
      data-view="servidor"
      data-status="critical"
      data-error="true"
      data-live="${vm.live ? "true" : "false"}"
    >
      ${renderHeader(vm)}

      <div class="server-error" role="alert">
        <strong>No se pudo completar la consulta.</strong>
        <span>${escapeHtml(vm.error || "Error desconocido consultando el servidor.")}</span>
      </div>

      ${renderDashboard(vm)}
    </section>
  `;
}

export function renderAccessDeniedState() {
  return `
    <section
      class="server-view-root servidor-view-root"
      data-server-scope="true"
      data-servidor-scope="true"
      data-view="servidor"
      data-forbidden="true"
    >
      <div class="server-error" role="alert">
        <strong>Acceso restringido.</strong>
        <span>No tienes permisos suficientes para consultar el estado del servidor.</span>
      </div>
    </section>
  `;
}

/* =========================================================
   MAIN RENDER
========================================================= */

export function renderServerTemplate(input = {}) {
  const vm = getViewModel(input);
  const snapshot = vm.snapshot;
  const status = normalizeStatus(snapshot.status);

  if (vm.forbidden) {
    return renderAccessDeniedState(input);
  }

  if (vm.loading && !snapshot.checkedAt) {
    return renderLoadingState(input);
  }

  return `
    <section
      class="server-view-root servidor-view-root"
      data-server-scope="true"
      data-servidor-scope="true"
      data-view="servidor"
      data-status="${attr(status)}"
      data-loading="${vm.loading ? "true" : "false"}"
      data-refreshing="${vm.refreshing ? "true" : "false"}"
      data-live="${vm.live ? "true" : "false"}"
    >
      ${renderHeader(vm)}
      ${renderDashboard(vm)}

      ${
        vm.loading
          ? `
            <div class="server-loading" role="status" aria-live="polite">
              ${renderSpinner("Consultando estado del sistema…")}
            </div>
          `
          : ""
      }
    </section>
  `;
}

export function renderServidorTemplate(input = {}) {
  return renderServerTemplate(input);
}

export function renderTemplate(input = {}) {
  return renderServerTemplate(input);
}

export function getServerTemplateSnapshot(input = {}) {
  const vm = getViewModel(input);
  const snapshot = vm.snapshot;

  return {
    version: SERVER_TEMPLATE_VERSION,
    status: snapshot.status,
    statusLabel: snapshot.statusLabel,
    services: snapshot.services.length,
    endpoints: Object.keys(snapshot.endpoints).length,
    loading: vm.loading,
    refreshing: vm.refreshing,
    live: vm.live,
    error: vm.error,
  };
}

export function getSnapshot(input = {}) {
  return getServerTemplateSnapshot(input);
}

export default renderServerTemplate;
