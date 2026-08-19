/* =========================================================
   Onion Support - Servidor Template
   Archivo: /src/views/server/server.template.js

   PRODUCTIVO · OBSERVABILITY GOD MODE · PURE TEMPLATE · V3

   Modelo esperado:
   server.api.backend-contract.v2.health-internal

   Principios:
   - Misma gramática visual que el resto de vistas privadas.
   - Sin HTTP, DOM, Store, Router ni CSS inline.
   - Sin inventar health de Azure/Blob.
   - Resumen operativo derivado sólo del snapshot canónico.
========================================================= */

export const SERVER_TEMPLATE_VERSION =
  "server.template.observability.v3-god-mode";

export const SERVIDOR_TEMPLATE_VERSION =
  SERVER_TEMPLATE_VERSION;

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

const CANONICAL_SERVICE_ORDER = Object.freeze([
  "backend",
  "database",
  "cpu",
  "memory",
  "disk",
  "event_loop",
]);

const HEALTH_CONTRACT_ORDER = Object.freeze([
  "internal",
  "ready",
  "live",
  "blobs",
  "azure",
]);

/* =========================================================
   SAFE HELPERS
========================================================= */

function isObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

function safeObject(
  value,
  fallback = {}
) {
  return isObject(value)
    ? value
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeText(
  value = "",
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return text || fallback;
}

function safeNumber(
  value = null,
  fallback = null
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function clamp(
  value = 0,
  min = 0,
  max = 100
) {
  const numeric =
    safeNumber(
      value,
      min
    );

  return Math.min(
    Math.max(
      numeric,
      min
    ),
    max
  );
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
  return escapeHtml(
    safeText(
      value,
      ""
    )
  );
}

function normalizeKey(value = "") {
  return safeText(
    value,
    ""
  )
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[\s-]+/g,
      "_"
    )
    .replace(
      /[^\w:.]/g,
      ""
    )
    .replace(
      /^_+|_+$/g,
      ""
    );
}

function toTimestamp(
  value = null
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  if (value instanceof Date) {
    const ms =
      value.getTime();

    return Number.isFinite(ms)
      ? ms
      : 0;
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    if (value <= 0) {
      return 0;
    }

    return value > 9_999_999_999
      ? value
      : value * 1000;
  }

  const raw =
    safeText(
      value,
      ""
    );

  if (!raw) {
    return 0;
  }

  const numeric =
    Number(raw);

  if (
    Number.isFinite(numeric) &&
    numeric > 0
  ) {
    return numeric > 9_999_999_999
      ? numeric
      : numeric * 1000;
  }

  const parsed =
    Date.parse(raw);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function formatDateTime(
  value = null
) {
  const timestamp =
    toTimestamp(value);

  if (!timestamp) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(
      "es-ES",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }
    ).format(
      new Date(timestamp)
    );
  } catch {
    return "—";
  }
}

function formatMs(
  value = null
) {
  const numeric =
    safeNumber(
      value,
      null
    );

  if (numeric === null) {
    return "—";
  }

  return `${Math.max(
    0,
    Math.round(numeric)
  )} ms`;
}

/* =========================================================
   STATUS
========================================================= */

export function normalizeStatus(
  value = ""
) {
  const key =
    normalizeKey(value);

  if (
    [
      "healthy",
      "ok",
      "up",
      "online",
      "ready",
      "live",
      "alive",
      "running",
      "connected",
      "available",
      "operational",
      "success",
    ].includes(key)
  ) {
    return "healthy";
  }

  if (
    [
      "warning",
      "warn",
      "degraded",
      "slow",
      "partial",
      "limited",
      "unstable",
      "not_ready",
    ].includes(key)
  ) {
    return "warning";
  }

  if (
    [
      "critical",
      "error",
      "fail",
      "failed",
      "down",
      "offline",
      "unhealthy",
      "disconnected",
      "unavailable",
      "ko",
    ].includes(key)
  ) {
    return "critical";
  }

  return "unknown";
}

export function getStatusLabel(
  status = ""
) {
  const value =
    normalizeStatus(
      status
    );

  if (value === "healthy") {
    return "Operativo";
  }

  if (value === "warning") {
    return "Degradado";
  }

  if (value === "critical") {
    return "Crítico";
  }

  return "Desconocido";
}

/* =========================================================
   CANONICAL MODEL
========================================================= */

function createEmptyService({
  id = "",
  label = "",
} = {}) {
  return {
    id,
    label,
    status: "unknown",
    statusLabel:
      "Desconocido",
    latencyMs: null,
    endpoint: "",
    detail:
      "Pendiente de consulta.",
    value: "—",
    error: "",
  };
}

function createEmptyServices() {
  return [
    createEmptyService({
      id: "backend",
      label: "Backend API",
    }),
    createEmptyService({
      id: "database",
      label: "Cosmos DB",
    }),
    createEmptyService({
      id: "cpu",
      label: "CPU",
    }),
    createEmptyService({
      id: "memory",
      label: "RAM",
    }),
    createEmptyService({
      id: "disk",
      label: "Disco",
    }),
    createEmptyService({
      id: "event_loop",
      label: "Event loop",
    }),
  ];
}

function canonicalService(
  service = {}
) {
  const source =
    safeObject(service);

  const status =
    normalizeStatus(
      source.status
    );

  return {
    id:
      normalizeKey(
        source.id
      ),

    label:
      safeText(
        source.label,
        "Servicio"
      ),

    status,

    statusLabel:
      safeText(
        source.statusLabel,
        getStatusLabel(status)
      ),

    latencyMs:
      safeNumber(
        source.latencyMs,
        null
      ),

    endpoint:
      safeText(
        source.endpoint,
        ""
      ),

    detail:
      safeText(
        source.detail,
        ""
      ),

    value:
      safeText(
        source.value,
        ""
      ),

    error:
      safeText(
        source.error,
        ""
      ),
  };
}

function canonicalServices(
  snapshot = {}
) {
  const received =
    safeArray(
      snapshot.services
    )
      .map(
        canonicalService
      )
      .filter(
        (service) =>
          CANONICAL_SERVICE_ORDER
            .includes(
              service.id
            )
      );

  const byId =
    new Map(
      received.map(
        (service) => [
          service.id,
          service,
        ]
      )
    );

  return createEmptyServices()
    .map(
      (fallback) =>
        byId.get(
          fallback.id
        ) ||
        fallback
    );
}

function canonicalSnapshot(
  input = {}
) {
  const state =
    safeObject(input);

  const source =
    safeObject(
      state.snapshot,
      {}
    );

  const status =
    normalizeStatus(
      source.status
    );

  const capabilities =
    safeObject(
      source.capabilities
    );

  return {
    version:
      safeText(
        source.version,
        ""
      ),

    backendVersion:
      safeText(
        source.backendVersion,
        ""
      ),

    service:
      safeText(
        source.service,
        "onion-backend"
      ),

    status,

    statusLabel:
      safeText(
        source.statusLabel,
        getStatusLabel(status)
      ),

    ok:
      source.ok === true,

    checkedAt:
      safeText(
        source.checkedAt,
        ""
      ),

    uptimeSeconds:
      safeNumber(
        source.uptimeSeconds,
        0
      ),

    uptimeLabel:
      safeText(
        source.uptimeLabel,
        "—"
      ),

    latencyMs:
      safeNumber(
        source.latencyMs,
        null
      ),

    latencyLabel:
      safeText(
        source.latencyLabel,
        formatMs(
          source.latencyMs
        )
      ),

    dbStatus:
      normalizeStatus(
        source.dbStatus
      ),

    dbStatusLabel:
      safeText(
        source.dbStatusLabel,
        getStatusLabel(
          source.dbStatus
        )
      ),

    dbLatencyMs:
      safeNumber(
        source.dbLatencyMs,
        null
      ),

    dbLatencyLabel:
      safeText(
        source.dbLatencyLabel,
        formatMs(
          source.dbLatencyMs
        )
      ),

    cpuUsage:
      safeNumber(
        source.cpuUsage,
        null
      ),

    cpuUsageLabel:
      safeText(
        source.cpuUsageLabel,
        "—"
      ),

    memoryUsage:
      safeNumber(
        source.memoryUsage,
        null
      ),

    memoryUsageLabel:
      safeText(
        source.memoryUsageLabel,
        "—"
      ),

    memoryLabel:
      safeText(
        source.memoryLabel,
        "—"
      ),

    diskUsage:
      safeNumber(
        source.diskUsage,
        null
      ),

    diskUsageLabel:
      safeText(
        source.diskUsageLabel,
        "—"
      ),

    diskLabel:
      safeText(
        source.diskLabel,
        "—"
      ),

    eventLoopLagMs:
      safeNumber(
        source.eventLoopLagMs,
        null
      ),

    eventLoopLagLabel:
      safeText(
        source.eventLoopLagLabel,
        "—"
      ),

    services:
      canonicalServices(
        source
      ),

    warnings:
      safeArray(
        source.warnings
      ).map(
        (warning) => ({
          code:
            safeText(
              warning?.code,
              ""
            ),

          severity:
            safeText(
              warning?.severity,
              ""
            ),

          message:
            safeText(
              warning?.message,
              ""
            ),

          value:
            warning?.value ??
            null,

          threshold:
            warning?.threshold ??
            null,
        })
      ),

    capabilities: {
      internalHealth:
        capabilities.internalHealth ===
        true,

      readiness:
        capabilities.readiness ===
        true,

      liveness:
        capabilities.liveness ===
        true,

      databaseHealth:
        capabilities.databaseHealth ===
        true,

      cpuMetrics:
        capabilities.cpuMetrics ===
        true,

      ramMetrics:
        capabilities.ramMetrics ===
        true,

      diskMetrics:
        capabilities.diskMetrics ===
        true,

      eventLoopMetrics:
        capabilities.eventLoopMetrics ===
        true,

      azureEnvironment:
        capabilities.azureEnvironment ===
        true,

      azureHealth:
        capabilities.azureHealth ===
        true,

      blobHealth:
        capabilities.blobHealth ===
        true,
    },

    endpoints:
      safeObject(
        source.endpoints
      ),

    azure:
      safeObject(
        source.azure
      ),

    runtime:
      safeObject(
        source.runtime
      ),

    environment:
      safeObject(
        source.environment
      ),
  };
}

function getViewModel(
  input = {}
) {
  const state =
    safeObject(input);

  return {
    snapshot:
      canonicalSnapshot(
        state
      ),

    loading:
      Boolean(
        state.loading
      ),

    refreshing:
      Boolean(
        state.refreshing
      ),

    live:
      Boolean(
        state.live
      ),

    error:
      safeText(
        state.error,
        ""
      ),

    forbidden:
      Boolean(
        state.forbidden
      ),
  };
}

function serviceSummary(
  snapshot = {}
) {
  const services =
    safeArray(
      snapshot.services
    );

  const countByStatus =
    services.reduce(
      (acc, service) => {
        const status =
          normalizeStatus(
            service.status
          );

        acc[status] =
          (acc[status] || 0) +
          1;

        return acc;
      },
      {
        healthy: 0,
        warning: 0,
        critical: 0,
        unknown: 0,
      }
    );

  return {
    total:
      services.length,

    healthy:
      countByStatus.healthy,

    warning:
      countByStatus.warning,

    critical:
      countByStatus.critical,

    unknown:
      countByStatus.unknown,
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
    server:
      `<svg ${common}><rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01"/><path d="M6 18h.01"/></svg>`,

    refresh:
      `<svg ${common}><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>`,

    live:
      `<svg ${common}><circle cx="12" cy="12" r="3"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4"/><path d="M7.8 16.2a6 6 0 0 1 0-8.4"/><path d="M19.1 4.9a10 10 0 0 1 0 14.2"/><path d="M4.9 19.1a10 10 0 0 1 0-14.2"/></svg>`,

    copy:
      `<svg ${common}><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,

    cpu:
      `<svg ${common}><rect width="14" height="14" x="5" y="5" rx="2"/><path d="M9 1v4"/><path d="M15 1v4"/><path d="M9 19v4"/><path d="M15 19v4"/><path d="M1 9h4"/><path d="M1 15h4"/><path d="M19 9h4"/><path d="M19 15h4"/></svg>`,

    db:
      `<svg ${common}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/></svg>`,

    memory:
      `<svg ${common}><path d="M6 19v-3"/><path d="M10 19v-3"/><path d="M14 19v-3"/><path d="M18 19v-3"/><path d="M8 5V2"/><path d="M16 5V2"/><rect width="16" height="11" x="4" y="5" rx="2"/></svg>`,

    disk:
      `<svg ${common}><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>`,

    loop:
      `<svg ${common}><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>`,

    clock:
      `<svg ${common}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,

    gauge:
      `<svg ${common}><path d="M4 14a8 8 0 1 1 16 0"/><path d="m12 14 4-4"/><path d="M6.3 17h11.4"/></svg>`,

    shield:
      `<svg ${common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,

    alert:
      `<svg ${common}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,

    cloud:
      `<svg ${common}><path d="M17.5 19H8a6 6 0 1 1 5.6-8.1A4.5 4.5 0 1 1 17.5 19z"/></svg>`,

    activity:
      `<svg ${common}><path d="M3 12h4l2-7 4 14 2-7h6"/></svg>`,

    terminal:
      `<svg ${common}><path d="m4 17 6-6-6-6"/><path d="M12 19h8"/></svg>`,
  };

  return (
    icons[name] ||
    icons.server
  );
}

function serviceIcon(
  service = {}
) {
  const id =
    normalizeKey(
      service.id
    );

  if (id === "database") {
    return icon("db");
  }

  if (id === "cpu") {
    return icon("cpu");
  }

  if (id === "memory") {
    return icon("memory");
  }

  if (id === "disk") {
    return icon("disk");
  }

  if (id === "event_loop") {
    return icon("loop");
  }

  return icon("server");
}

/* =========================================================
   SMALL UI
========================================================= */

function renderStatusChip(
  status = ""
) {
  const normalized =
    normalizeStatus(
      status
    );

  return `
    <span
      class="server-status-chip server-status-chip--${attr(normalized)}"
      data-server-status="${attr(normalized)}"
    >
      <span
        class="server-status-dot"
        aria-hidden="true"
      ></span>

      <span>
        ${escapeHtml(
          getStatusLabel(
            normalized
          )
        )}
      </span>
    </span>
  `;
}

function renderMetricMeter(
  value = null,
  label = ""
) {
  const numeric =
    safeNumber(
      value,
      null
    );

  if (numeric === null) {
    return "";
  }

  const meterValue =
    clamp(
      numeric,
      0,
      100
    );

  return `
    <meter
      class="server-meter"
      min="0"
      max="100"
      low="70"
      high="90"
      optimum="45"
      value="${attr(meterValue)}"
      aria-label="${attr(label)}"
    >
      ${escapeHtml(
        `${Math.round(meterValue)}%`
      )}
    </meter>
  `;
}

/* =========================================================
   HEADER / SUMMARY
========================================================= */

function renderSummaryCard({
  id = "",
  label = "",
  value = "—",
  detail = "",
  status = "unknown",
  iconName = "activity",
} = {}) {
  return `
    <article
      class="server-summary-card server-summary-card--${attr(id)}"
      data-summary-card="${attr(id)}"
      data-status="${attr(
        normalizeStatus(status)
      )}"
    >
      <div class="server-summary-icon">
        ${icon(iconName)}
      </div>

      <div class="server-summary-copy">
        <span class="server-summary-label">
          ${escapeHtml(label)}
        </span>

        <strong class="server-summary-value">
          ${escapeHtml(
            safeText(
              value,
              "—"
            )
          )}
        </strong>

        <span class="server-summary-detail">
          ${escapeHtml(
            safeText(
              detail,
              "Sin datos"
            )
          )}
        </span>
      </div>
    </article>
  `;
}

export function renderHeader(
  input = {}
) {
  const vm =
    getViewModel(
      input
    );

  const snapshot =
    vm.snapshot;

  const status =
    normalizeStatus(
      snapshot.status
    );

  const summary =
    serviceSummary(
      snapshot
    );

  return `
    <section class="server-hero servidor-hero">
      <div class="server-hero-top">
        <div class="server-hero-copy">
          <p class="server-kicker">
            Observabilidad
          </p>

          <h1 class="server-title">
            Estado del servidor
          </h1>

          <p class="server-subtitle">
            Estado operativo del backend, Cosmos DB y runtime Node.
            Latencias, recursos y señales críticas en una sola vista.
          </p>
        </div>

        <div class="server-hero-actions">
          <button
            type="button"
            class="server-btn server-btn--primary"
            data-server-action="${SERVER_ACTIONS.REFRESH}"
            data-action="${SERVER_ACTIONS.REFRESH_SERVER}"
            ${
              vm.refreshing ||
              vm.loading
                ? 'disabled aria-disabled="true" aria-busy="true"'
                : ""
            }
          >
            ${icon("refresh")}

            <span>
              ${
                vm.refreshing ||
                vm.loading
                  ? "Consultando"
                  : "Actualizar"
              }
            </span>
          </button>

          <button
            type="button"
            class="server-btn server-btn--live${vm.live ? " is-active" : ""}"
            data-server-action="${SERVER_ACTIONS.TOGGLE_LIVE}"
            data-action="${SERVER_ACTIONS.TOGGLE_LIVE}"
            aria-pressed="${vm.live ? "true" : "false"}"
          >
            ${icon("live")}

            <span>
              ${
                vm.live
                  ? "Live · 30 s"
                  : "Activar live"
              }
            </span>
          </button>

          <button
            type="button"
            class="server-btn"
            data-server-action="${SERVER_ACTIONS.COPY_JSON}"
            data-action="${SERVER_ACTIONS.COPY_JSON}"
            ${
              !snapshot.checkedAt
                ? 'disabled aria-disabled="true"'
                : ""
            }
          >
            ${icon("copy")}

            <span>
              Copiar JSON
            </span>
          </button>
        </div>
      </div>

      <div class="server-hero-meta">
        <span class="server-meta-pill server-meta-pill--${attr(status)}">
          ${icon("shield")}

          <span>
            ${escapeHtml(
              snapshot.statusLabel
            )}
          </span>
        </span>

        <span class="server-meta-pill">
          ${icon("clock")}

          <span>
            ${
              snapshot.checkedAt
                ? escapeHtml(
                    `Actualizado · ${formatDateTime(snapshot.checkedAt)}`
                  )
                : "Pendiente de consulta"
            }
          </span>
        </span>

        <span class="server-meta-pill">
          ${icon("server")}

          <span>
            ${escapeHtml(
              snapshot.backendVersion ||
              snapshot.service
            )}
          </span>
        </span>

        <span class="server-meta-pill${vm.live ? " is-live" : ""}">
          ${icon("live")}

          <span>
            ${
              vm.live
                ? "Monitorización en tiempo real"
                : "Monitorización manual"
            }
          </span>
        </span>
      </div>

      <div class="server-summary-grid">
        ${renderSummaryCard({
          id: "status",
          label: "Estado global",
          value:
            snapshot.statusLabel,
          detail:
            `${summary.healthy}/${summary.total || 6} componentes operativos`,
          status,
          iconName: "shield",
        })}

        ${renderSummaryCard({
          id: "api",
          label: "Latencia API",
          value:
            snapshot.latencyLabel,
          detail:
            "/health/internal",
          status:
            status,
          iconName: "gauge",
        })}

        ${renderSummaryCard({
          id: "database",
          label: "Cosmos DB",
          value:
            snapshot.dbLatencyLabel,
          detail:
            snapshot.dbStatusLabel,
          status:
            snapshot.dbStatus,
          iconName: "db",
        })}

        ${renderSummaryCard({
          id: "uptime",
          label: "Uptime",
          value:
            snapshot.uptimeLabel,
          detail:
            snapshot.service,
          status:
            snapshot.checkedAt
              ? "healthy"
              : "unknown",
          iconName: "clock",
        })}
      </div>
    </section>
  `;
}

/* =========================================================
   SERVICE CARDS
========================================================= */

function metricForService(
  service = {},
  snapshot = {}
) {
  const id =
    normalizeKey(
      service.id
    );

  if (id === "cpu") {
    return {
      value:
        snapshot.cpuUsage,
      label:
        snapshot.cpuUsageLabel,
      meter:
        snapshot.cpuUsage,
      meterLabel:
        "Uso de CPU",
    };
  }

  if (id === "memory") {
    return {
      value:
        snapshot.memoryUsage,
      label:
        snapshot.memoryUsageLabel,
      meter:
        snapshot.memoryUsage,
      meterLabel:
        "Uso de RAM",
    };
  }

  if (id === "disk") {
    return {
      value:
        snapshot.diskUsage,
      label:
        snapshot.diskUsageLabel,
      meter:
        snapshot.diskUsage,
      meterLabel:
        "Uso de disco",
    };
  }

  if (id === "event_loop") {
    return {
      value:
        snapshot.eventLoopLagMs,
      label:
        snapshot.eventLoopLagLabel,
      meter: null,
      meterLabel: "",
    };
  }

  return {
    value: null,
    label:
      service.value ||
      service.statusLabel,
    meter: null,
    meterLabel: "",
  };
}

export function renderServiceCard(
  service = {},
  snapshot = {}
) {
  const item =
    canonicalService(
      service
    );

  const status =
    normalizeStatus(
      item.status
    );

  const metric =
    metricForService(
      item,
      snapshot
    );

  const displayValue =
    safeText(
      metric.label,
      item.value ||
      item.statusLabel ||
      getStatusLabel(status)
    );

  const detail =
    item.error ||
    item.detail ||
    item.endpoint ||
    "Sin detalle disponible.";

  return `
    <article
      class="server-service-card server-service-card--${attr(status)}"
      data-server-service="${attr(item.id)}"
      data-status="${attr(status)}"
    >
      <header class="server-service-head">
        <div class="server-service-icon">
          ${serviceIcon(item)}
        </div>

        <div class="server-service-title-group">
          <span class="server-service-label">
            ${escapeHtml(item.label)}
          </span>

          <strong class="server-service-value">
            ${escapeHtml(displayValue)}
          </strong>
        </div>

        ${renderStatusChip(status)}
      </header>

      ${
        metric.meter !== null
          ? renderMetricMeter(
              metric.meter,
              metric.meterLabel
            )
          : ""
      }

      <p class="server-service-detail">
        ${escapeHtml(detail)}
      </p>

      <footer class="server-service-foot">
        <span>
          ${escapeHtml(
            item.endpoint ||
            "Métrica interna"
          )}
        </span>

        ${
          item.latencyMs !== null
            ? `
              <span class="server-service-latency">
                ${escapeHtml(
                  formatMs(
                    item.latencyMs
                  )
                )}
              </span>
            `
            : ""
        }
      </footer>
    </article>
  `;
}

/* =========================================================
   WARNINGS
========================================================= */

function renderWarnings(
  snapshot = {}
) {
  const warnings =
    safeArray(
      snapshot.warnings
    ).filter(
      (warning) =>
        safeText(
          warning?.message,
          ""
        )
    );

  if (!warnings.length) {
    return "";
  }

  return `
    <section class="server-panel server-panel--warnings">
      <header class="server-section-head">
        <div>
          <p class="server-section-kicker">
            Alertas
          </p>

          <h2 class="server-section-title">
            Señales que requieren atención
          </h2>
        </div>

        <span class="server-section-badge">
          ${warnings.length}
        </span>
      </header>

      <div class="server-warning-list">
        ${warnings
          .map(
            (warning) => {
              const severity =
                normalizeStatus(
                  warning.severity
                ) ===
                "critical"
                  ? "critical"
                  : "warning";

              const detail = [
                warning.value !==
                  null &&
                warning.value !==
                  undefined
                  ? `Valor: ${warning.value}`
                  : "",

                warning.threshold !==
                  null &&
                warning.threshold !==
                  undefined
                  ? `Umbral: ${warning.threshold}`
                  : "",
              ]
                .filter(Boolean)
                .join(" · ");

              return `
                <article
                  class="server-warning server-warning--${attr(severity)}"
                  data-server-warning="${attr(warning.code)}"
                >
                  <div class="server-warning-icon">
                    ${icon("alert")}
                  </div>

                  <div class="server-warning-copy">
                    <span class="server-warning-code">
                      ${escapeHtml(
                        warning.code ||
                        "HEALTH_WARNING"
                      )}
                    </span>

                    <strong>
                      ${escapeHtml(
                        warning.message
                      )}
                    </strong>

                    <span>
                      ${escapeHtml(
                        detail ||
                        "Condición reportada por el backend."
                      )}
                    </span>
                  </div>
                </article>
              `;
            }
          )
          .join("")}
      </div>
    </section>
  `;
}

/* =========================================================
   HEALTH CONTRACT
========================================================= */

function healthLabel(
  key = ""
) {
  return {
    internal:
      "Health interno",

    ready:
      "Readiness",

    live:
      "Liveness",

    blobs:
      "Blob Storage",

    azure:
      "Azure platform",
  }[key] || key;
}

function healthMode(
  key = "",
  endpoint = {}
) {
  const supported =
    endpoint.supported ===
    true;

  if (
    key === "internal" &&
    endpoint.ok === true
  ) {
    return {
      status: "healthy",
      result: "Consultado",
      detail:
        "Fuente del dashboard.",
    };
  }

  if (
    (
      key === "ready" ||
      key === "live"
    ) &&
    supported
  ) {
    return {
      status: "unknown",
      result: "Disponible",
      detail:
        "Probe expuesto por el backend; no ejecutado en esta carga.",
    };
  }

  if (!supported) {
    return {
      status: "unknown",
      result: "No expuesto",
      detail:
        safeText(
          endpoint.reason,
          "El backend actual no publica este health."
        ),
    };
  }

  if (endpoint.ok === false) {
    return {
      status: "critical",
      result:
        safeText(
          endpoint.error,
          "Error"
        ),
      detail:
        safeText(
          endpoint.error,
          "La consulta no respondió correctamente."
        ),
    };
  }

  return {
    status: "unknown",
    result: "Disponible",
    detail:
      "Definido en el contrato de observabilidad.",
  };
}

function renderHealthContract(
  snapshot = {}
) {
  const endpoints =
    safeObject(
      snapshot.endpoints
    );

  const items =
    HEALTH_CONTRACT_ORDER
      .filter(
        (key) =>
          Object.prototype
            .hasOwnProperty
            .call(
              endpoints,
              key
            )
      );

  return `
    <section class="server-panel server-panel--probes">
      <header class="server-section-head">
        <div>
          <p class="server-section-kicker">
            Probes
          </p>

          <h2 class="server-section-title">
            Contrato de observabilidad
          </h2>
        </div>
      </header>

      <div class="server-probe-grid">
        ${
          items.length
            ? items
                .map(
                  (key) => {
                    const endpoint =
                      safeObject(
                        endpoints[key]
                      );

                    const mode =
                      healthMode(
                        key,
                        endpoint
                      );

                    return `
                      <article
                        class="server-probe server-probe--${attr(mode.status)}"
                        data-health-contract="${attr(key)}"
                        data-supported="${endpoint.supported === true ? "true" : "false"}"
                      >
                        <div class="server-probe-head">
                          <span class="server-probe-icon">
                            ${
                              key === "azure"
                                ? icon("cloud")
                                : key === "internal"
                                  ? icon("server")
                                  : icon("activity")
                            }
                          </span>

                          <div>
                            <span class="server-probe-label">
                              ${escapeHtml(
                                healthLabel(key)
                              )}
                            </span>

                            <strong class="server-probe-result">
                              ${escapeHtml(
                                mode.result
                              )}
                            </strong>
                          </div>

                          ${renderStatusChip(
                            mode.status
                          )}
                        </div>

                        <code class="server-probe-endpoint">
                          ${escapeHtml(
                            safeText(
                              endpoint.endpoint,
                              "—"
                            )
                          )}
                        </code>

                        <span class="server-probe-detail">
                          ${escapeHtml(
                            mode.detail
                          )}
                        </span>
                      </article>
                    `;
                  }
                )
                .join("")
            : `
              <div class="server-empty">
                <strong>
                  Sin contrato health cargado.
                </strong>

                <span>
                  Actualiza la vista para consultar el backend.
                </span>
              </div>
            `
        }
      </div>
    </section>
  `;
}

/* =========================================================
   RUNTIME / AZURE
========================================================= */

function runtimeItems(
  snapshot = {}
) {
  const runtime =
    safeObject(
      snapshot.runtime
    );

  const environment =
    safeObject(
      snapshot.environment
    );

  const azure =
    safeObject(
      snapshot.azure
    );

  const node =
    safeObject(
      runtime.node
    );

  const v8 =
    safeObject(
      runtime.v8
    );

  const process =
    safeObject(
      runtime.process
    );

  const values = [
    {
      label: "Servicio",
      value:
        snapshot.service,
      meta:
        snapshot.backendVersion ||
        "Backend Onion",
      iconName: "server",
    },
    {
      label: "Node",
      value:
        node.version ||
        environment.nodeVersion,
      meta:
        node.rssMB !==
          undefined
          ? `RSS ${node.rssMB} MB`
          : "",
      iconName: "terminal",
    },
    {
      label: "Heap Node",
      value:
        node.heapUsedMB !==
          undefined
          ? `${node.heapUsedMB} MB`
          : "",
      meta:
        v8.heapLimitMB !==
          undefined
          ? `Límite V8 ${v8.heapLimitMB} MB`
          : "",
      iconName: "memory",
    },
    {
      label: "Uptime proceso",
      value:
        process.uptime ||
        snapshot.uptimeLabel,
      meta:
        "Proceso Node actual",
      iconName: "clock",
    },
    {
      label: "Entorno",
      value:
        environment.env,
      meta:
        environment.timezone
          ? `TZ ${environment.timezone}`
          : "",
      iconName: "shield",
    },
    {
      label: "Azure Site",
      value:
        azure.websiteSiteName,
      meta:
        azure.slotName
          ? `Slot ${azure.slotName}`
          : "",
      iconName: "cloud",
    },
    {
      label: "Región",
      value:
        azure.regionName,
      meta:
        azure.sku
          ? `SKU ${azure.sku}`
          : "",
      iconName: "cloud",
    },
    {
      label: "Hostname",
      value:
        azure.websiteHostname,
      meta:
        "Metadata de runtime",
      iconName: "server",
    },
  ];

  return values.filter(
    (item) =>
      safeText(
        item.value,
        ""
      )
  );
}

function renderRuntime(
  snapshot = {}
) {
  const items =
    runtimeItems(
      snapshot
    );

  return `
    <section class="server-panel server-panel--runtime">
      <header class="server-section-head">
        <div>
          <p class="server-section-kicker">
            Runtime
          </p>

          <h2 class="server-section-title">
            Entorno de ejecución
          </h2>
        </div>

        ${
          snapshot.capabilities
            ?.azureEnvironment
            ? `
              <span class="server-section-badge">
                Azure
              </span>
            `
            : ""
        }
      </header>

      ${
        items.length
          ? `
            <div class="server-runtime-grid">
              ${items
                .map(
                  (item) => `
                    <article class="server-runtime-item">
                      <span class="server-runtime-icon">
                        ${icon(item.iconName)}
                      </span>

                      <div class="server-runtime-copy">
                        <span class="server-runtime-label">
                          ${escapeHtml(
                            item.label
                          )}
                        </span>

                        <strong class="server-runtime-value">
                          ${escapeHtml(
                            item.value
                          )}
                        </strong>

                        ${
                          item.meta
                            ? `
                              <span class="server-runtime-meta">
                                ${escapeHtml(
                                  item.meta
                                )}
                              </span>
                            `
                            : ""
                        }
                      </div>
                    </article>
                  `
                )
                .join("")}
            </div>
          `
          : `
            <div class="server-empty">
              <strong>
                Runtime pendiente.
              </strong>

              <span>
                Los metadatos aparecerán cuando responda /health/internal.
              </span>
            </div>
          `
      }

      <div class="server-runtime-note">
        ${icon("shield")}
        <span>
          Los datos Azure son metadata del entorno; no se presentan como
          comprobación independiente de salud de la plataforma.
        </span>
      </div>
    </section>
  `;
}

/* =========================================================
   DASHBOARD
========================================================= */

export function renderDashboard(
  input = {}
) {
  const vm =
    getViewModel(
      input
    );

  const snapshot =
    vm.snapshot;

  return `
    ${
      vm.error
        ? `
          <div
            class="server-error"
            role="alert"
          >
            <div class="server-error-icon">
              ${icon("alert")}
            </div>

            <div>
              <strong>
                La última actualización no se completó.
              </strong>

              <span>
                ${escapeHtml(vm.error)}
              </span>
            </div>
          </div>
        `
        : ""
    }

    <section class="server-panel server-panel--services">
      <header class="server-section-head">
        <div>
          <p class="server-section-kicker">
            Telemetría
          </p>

          <h2 class="server-section-title">
            Componentes monitorizados
          </h2>
        </div>

        <span class="server-section-badge">
          6 señales
        </span>
      </header>

      <div class="server-services-grid">
        ${snapshot.services
          .map(
            (service) =>
              renderServiceCard(
                service,
                snapshot
              )
          )
          .join("")}
      </div>
    </section>

    ${renderWarnings(snapshot)}

    <div class="server-tech-grid">
      ${renderHealthContract(snapshot)}
      ${renderRuntime(snapshot)}
    </div>
  `;
}

/* =========================================================
   STATES
========================================================= */

function renderSpinner(
  label = "Cargando"
) {
  return `
    <span
      class="server-spinner"
      aria-hidden="true"
    ></span>

    <span>
      ${escapeHtml(label)}
    </span>
  `;
}

export function renderLoadingState(
  input = {}
) {
  const vm =
    getViewModel({
      ...safeObject(
        input
      ),

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
      data-canonical-health="true"
      data-template-version="${attr(SERVER_TEMPLATE_VERSION)}"
    >
      ${renderHeader(vm)}
      ${renderDashboard(vm)}

      <div
        class="server-loading"
        role="status"
        aria-live="polite"
      >
        ${renderSpinner(
          "Consultando el servidor…"
        )}
      </div>
    </section>
  `;
}

export function renderErrorState(
  input = {}
) {
  const vm =
    getViewModel(
      input
    );

  return `
    <section
      class="server-view-root servidor-view-root"
      data-server-scope="true"
      data-servidor-scope="true"
      data-view="servidor"
      data-status="unknown"
      data-error="true"
      data-live="${vm.live ? "true" : "false"}"
      data-canonical-health="true"
      data-template-version="${attr(SERVER_TEMPLATE_VERSION)}"
    >
      ${renderHeader(vm)}

      <div
        class="server-error"
        role="alert"
      >
        <div class="server-error-icon">
          ${icon("alert")}
        </div>

        <div>
          <strong>
            No se pudo consultar el health interno.
          </strong>

          <span>
            ${escapeHtml(
              vm.error ||
              "Error desconocido consultando /health/internal."
            )}
          </span>
        </div>
      </div>

      ${renderDashboard({
        ...vm,
        error: "",
      })}
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
      data-canonical-health="true"
      data-template-version="${attr(SERVER_TEMPLATE_VERSION)}"
    >
      <div class="server-forbidden">
        <div class="server-forbidden-icon">
          ${icon("shield")}
        </div>

        <p class="server-section-kicker">
          Servidor
        </p>

        <h1 class="server-title">
          Acceso restringido
        </h1>

        <p class="server-subtitle">
          Esta vista requiere una sesión con rol administrador.
        </p>
      </div>
    </section>
  `;
}

/* =========================================================
   MAIN RENDER
========================================================= */

export function renderServerTemplate(
  input = {}
) {
  const vm =
    getViewModel(
      input
    );

  const snapshot =
    vm.snapshot;

  const status =
    normalizeStatus(
      snapshot.status
    );

  if (vm.forbidden) {
    return renderAccessDeniedState();
  }

  if (
    vm.loading &&
    !snapshot.checkedAt
  ) {
    return renderLoadingState(
      input
    );
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
      data-canonical-health="true"
      data-template-version="${attr(SERVER_TEMPLATE_VERSION)}"
    >
      ${renderHeader(vm)}
      ${renderDashboard(vm)}

      ${
        vm.loading
          ? `
            <div
              class="server-loading"
              role="status"
              aria-live="polite"
            >
              ${renderSpinner(
                "Consultando el servidor…"
              )}
            </div>
          `
          : ""
      }
    </section>
  `;
}

export function renderServidorTemplate(
  input = {}
) {
  return renderServerTemplate(
    input
  );
}

export function renderTemplate(
  input = {}
) {
  return renderServerTemplate(
    input
  );
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getServerTemplateSnapshot(
  input = {}
) {
  const vm =
    getViewModel(
      input
    );

  const snapshot =
    vm.snapshot;

  const summary =
    serviceSummary(
      snapshot
    );

  return {
    version:
      SERVER_TEMPLATE_VERSION,

    status:
      snapshot.status,

    statusLabel:
      snapshot.statusLabel,

    services:
      snapshot.services
        .map(
          (service) =>
            service.id
        ),

    serviceCount:
      snapshot.services.length,

    operationalServices:
      summary.healthy,

    healthContracts:
      HEALTH_CONTRACT_ORDER
        .filter(
          (key) =>
            Object.prototype
              .hasOwnProperty
              .call(
                snapshot.endpoints,
                key
              )
        ),

    warnings:
      snapshot.warnings.length,

    loading:
      vm.loading,

    refreshing:
      vm.refreshing,

    live:
      vm.live,

    error:
      vm.error,

    architecture: {
      http: false,
      dom: false,
      store: false,
      router: false,

      canonicalApiModel:
        true,

      rawBackendParsing:
        false,

      endpointDiscovery:
        false,

      fakeBlobHealth:
        false,

      fakeAzureHealth:
        false,

      healthInternalSource:
        true,

      tokenNativeVisual:
        true,

      nativeMetricMeters:
        true,

      derivedOperationalSummary:
        true,
    },

    contract: {
      monitoredServices: [
        "backend",
        "database",
        "cpu",
        "memory",
        "disk",
        "event_loop",
      ],

      dashboardSource:
        "/health/internal",

      optionalProbes: [
        "/health/ready",
        "/health/live",
      ],
    },
  };
}

export function getSnapshot(
  input = {}
) {
  return getServerTemplateSnapshot(
    input
  );
}

export default renderServerTemplate;
