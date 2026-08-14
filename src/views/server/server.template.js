/* =========================================================
   Onion Support - Servidor Template
   Archivo: /src/views/server/server.template.js

   PRODUCTIVO · CANONICAL HEALTH MODEL · PURE TEMPLATE · V2

   Modelo esperado:
   server.api.backend-contract.v2.health-internal

   Servicios reales del dashboard:
   - Backend API
   - Cosmos DB
   - CPU
   - RAM
   - Disco
   - Event loop

   Contrato visual:
   - No interpreta payload backend crudo.
   - No descubre endpoints.
   - No presenta Blob/Azure como health comprobado.
   - Azure solo puede mostrarse como metadata de entorno.
   - /health/ready y /health/live se presentan como probes
     disponibles bajo demanda, no como checks ejecutados.
   - Sin imports, HTTP, DOM, Store, Router ni CSS inline.
========================================================= */

/* =========================================================
   META / CONSTANTS
========================================================= */

export const SERVER_TEMPLATE_VERSION =
  "server.template.backend-contract.v2.health-internal";

export const SERVIDOR_TEMPLATE_VERSION =
  SERVER_TEMPLATE_VERSION;

/*
  Compat histórica. La vista no pagina, pero se conserva
  el export para consumidores antiguos.
*/
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
    safeText(value, "")
  );
}

function normalizeKey(value = "") {
  return safeText(value, "")
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
    safeText(value, "");

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

  if (
    value === "healthy"
  ) {
    return "Operativo";
  }

  if (
    value === "warning"
  ) {
    return "Degradado";
  }

  if (
    value === "critical"
  ) {
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
      label: "Base de datos",
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

  const endpoints =
    safeObject(
      source.endpoints
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

    endpoints,

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
      `<svg ${common}><path d="M4 12a8 8 0 0 1 8-8"/><path d="M4 12a8 8 0 0 0 8 8"/><path d="M20 12a8 8 0 0 0-8-8"/><path d="M20 12a8 8 0 0 1-8 8"/><circle cx="12" cy="12" r="2"/></svg>`,

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

    shield:
      `<svg ${common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,

    alert:
      `<svg ${common}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,

    cloud:
      `<svg ${common}><path d="M17.5 19H8a6 6 0 1 1 5.6-8.1A4.5 4.5 0 1 1 17.5 19z"/></svg>`,
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

  if (
    id === "database"
  ) {
    return icon("db");
  }

  if (
    id === "cpu"
  ) {
    return icon("cpu");
  }

  if (
    id === "memory"
  ) {
    return icon("memory");
  }

  if (
    id === "disk"
  ) {
    return icon("disk");
  }

  if (
    id === "event_loop"
  ) {
    return icon("loop");
  }

  return icon("server");
}

/* =========================================================
   SERVICE CARDS
========================================================= */

function renderStatusChip(
  status = ""
) {
  const normalized =
    normalizeStatus(
      status
    );

  return `
    <span class="server-status-chip server-status-chip--${attr(normalized)}">
      <span
        class="server-status-dot"
        aria-hidden="true"
      ></span>
      ${escapeHtml(
        getStatusLabel(
          normalized
        )
      )}
    </span>
  `;
}

export function renderServiceCard(
  service = {}
) {
  const item =
    canonicalService(
      service
    );

  const status =
    normalizeStatus(
      item.status
    );

  const displayValue =
    item.value ||
    item.statusLabel ||
    getStatusLabel(status);

  const detail =
    item.error ||
    item.detail ||
    item.endpoint ||
    "Sin detalle";

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
        <span class="server-service-label">
          ${escapeHtml(item.label)}
        </span>

        <strong class="server-service-value">
          ${escapeHtml(displayValue)}
        </strong>

        <span class="server-service-detail">
          ${escapeHtml(detail)}
        </span>
      </div>

      ${renderStatusChip(status)}

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
    </article>
  `;
}

/* =========================================================
   HEALTH CONTRACT TABLE
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
      "Blob health",

    azure:
      "Azure health",
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
        "Fuente del dashboard actual.",
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
      result:
        "Bajo demanda",
      detail:
        "La ruta existe, pero esta vista no la ejecuta en cada carga.",
    };
  }

  if (!supported) {
    return {
      status: "unknown",
      result:
        "No expuesto",
      detail:
        safeText(
          endpoint.reason,
          "El backend actual no publica este health."
        ),
    };
  }

  return {
    status:
      endpoint.ok === false
        ? "critical"
        : "unknown",

    result:
      endpoint.ok === false
        ? safeText(
            endpoint.error,
            "Error"
          )
        : "Disponible",

    detail:
      endpoint.ok === false
        ? safeText(
            endpoint.error,
            "La consulta no respondió correctamente."
          )
        : "Disponible en el contrato del backend.",
  };
}

function renderHealthContractRow(
  key = "",
  endpoint = {}
) {
  const item =
    safeObject(endpoint);

  const mode =
    healthMode(
      key,
      item
    );

  const path =
    safeText(
      item.endpoint,
      "—"
    );

  const latency =
    item.latencyMs ===
      null ||
    item.latencyMs ===
      undefined
      ? "—"
      : formatMs(
          item.latencyMs
        );

  return `
    <tr
      class="server-endpoint-row server-endpoint-row--${attr(mode.status)}"
      data-health-contract="${attr(key)}"
      data-supported="${item.supported === true ? "true" : "false"}"
    >
      <td>
        ${escapeHtml(
          healthLabel(key)
        )}
      </td>

      <td>
        ${escapeHtml(path)}
      </td>

      <td>
        ${escapeHtml(latency)}
      </td>

      <td
        title="${attr(mode.detail)}"
      >
        ${escapeHtml(
          mode.result
        )}
      </td>
    </tr>
  `;
}

function renderHealthContract(
  snapshot = {}
) {
  const endpoints =
    safeObject(
      snapshot.endpoints
    );

  const rows =
    HEALTH_CONTRACT_ORDER
      .filter(
        (key) =>
          Object.prototype
            .hasOwnProperty
            .call(
              endpoints,
              key
            )
      )
      .map(
        (key) =>
          renderHealthContractRow(
            key,
            endpoints[key]
          )
      );

  return `
    <section class="server-dashboard server-dashboard--endpoints">
      <header class="server-section-head">
        <div>
          <p class="server-section-kicker">
            HEALTH CONTRACT
          </p>

          <h2 class="server-section-title">
            Superficie de observabilidad
          </h2>
        </div>
      </header>

      <div class="server-table-shell">
        <table
          class="server-table"
          aria-label="Contrato de health del backend"
        >
          <thead>
            <tr>
              <th>Probe</th>
              <th>Endpoint</th>
              <th>Latencia</th>
              <th>Uso en esta vista</th>
            </tr>
          </thead>

          <tbody>
            ${
              rows.length
                ? rows.join("")
                : `
                  <tr>
                    <td colspan="4">
                      <div class="server-empty">
                        <strong>
                          Sin contrato health cargado.
                        </strong>

                        <span>
                          Actualiza la vista para consultar el backend.
                        </span>
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
    <section class="server-dashboard">
      <header class="server-section-head">
        <div>
          <p class="server-section-kicker">
            WARNINGS
          </p>

          <h2 class="server-section-title">
            Avisos del health interno
          </h2>
        </div>
      </header>

      <div class="server-services-grid">
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
                  class="server-service-card server-service-card--${attr(severity)}"
                  data-server-warning="${attr(warning.code)}"
                >
                  <div class="server-service-icon">
                    ${icon("alert")}
                  </div>

                  <div class="server-service-copy">
                    <span class="server-service-label">
                      ${escapeHtml(
                        warning.code ||
                        "Health warning"
                      )}
                    </span>

                    <strong class="server-service-value">
                      ${escapeHtml(
                        warning.message
                      )}
                    </strong>

                    <span class="server-service-detail">
                      ${escapeHtml(
                        detail ||
                        "El backend ha marcado una condición a revisar."
                      )}
                    </span>
                  </div>

                  ${renderStatusChip(
                    severity
                  )}
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
   ENVIRONMENT / RUNTIME
========================================================= */

function runtimeRows(
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
    [
      "Servicio",
      snapshot.service,
    ],

    [
      "Versión backend",
      snapshot.backendVersion,
    ],

    [
      "Entorno",
      environment.env,
    ],

    [
      "Zona horaria",
      environment.timezone,
    ],

    [
      "Node RSS",
      node.rssMB !==
        undefined
        ? `${node.rssMB} MB`
        : "",
    ],

    [
      "Node heap",
      node.heapUsedMB !==
        undefined
        ? `${node.heapUsedMB} MB`
        : "",
    ],

    [
      "V8 heap limit",
      v8.heapLimitMB !==
        undefined
        ? `${v8.heapLimitMB} MB`
        : "",
    ],

    [
      "Uptime proceso",
      process.uptime ||
      snapshot.uptimeLabel,
    ],

    [
      "Azure site",
      azure.websiteSiteName,
    ],

    [
      "Azure región",
      azure.regionName,
    ],

    [
      "Azure SKU",
      azure.sku,
    ],

    [
      "Azure slot",
      azure.slotName,
    ],
  ];

  return values.filter(
    ([, value]) =>
      safeText(
        value,
        ""
      )
  );
}

function renderRuntime(
  snapshot = {}
) {
  const rows =
    runtimeRows(
      snapshot
    );

  if (!rows.length) {
    return "";
  }

  return `
    <section class="server-dashboard">
      <header class="server-section-head">
        <div>
          <p class="server-section-kicker">
            RUNTIME
          </p>

          <h2 class="server-section-title">
            Entorno de ejecución
          </h2>
        </div>
      </header>

      <div class="server-table-shell">
        <table
          class="server-table"
          aria-label="Entorno de ejecución del backend"
        >
          <thead>
            <tr>
              <th>Dato</th>
              <th>Valor</th>
              <th colspan="2">Interpretación</th>
            </tr>
          </thead>

          <tbody>
            ${rows
              .map(
                ([label, value]) => `
                  <tr>
                    <td>
                      ${escapeHtml(label)}
                    </td>

                    <td>
                      ${escapeHtml(value)}
                    </td>

                    <td colspan="2">
                      ${
                        label.startsWith(
                          "Azure "
                        )
                          ? "Metadata de entorno; no implica health de Azure."
                          : "Reportado por /health/internal."
                      }
                    </td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

/* =========================================================
   HEADER
========================================================= */

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

  return `
    <section class="server-hero servidor-hero">
      <div class="server-hero-top">
        <div class="server-hero-copy">
          <p class="server-kicker">
            Onion Observability
          </p>

          <h1 class="server-title">
            Estado del servidor
          </h1>

          <p class="server-subtitle">
            Health interno del backend, Cosmos DB y recursos del runtime:
            CPU, RAM, disco y event loop.
          </p>
        </div>

        <div class="server-hero-actions">
          <button
            type="button"
            class="server-btn"
            data-server-action="${SERVER_ACTIONS.REFRESH}"
            data-action="${SERVER_ACTIONS.REFRESH_SERVER}"
            ${
              vm.refreshing ||
              vm.loading
                ? 'disabled aria-disabled="true"'
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
            class="server-btn${vm.live ? " is-active" : ""}"
            data-server-action="${SERVER_ACTIONS.TOGGLE_LIVE}"
            data-action="${SERVER_ACTIONS.TOGGLE_LIVE}"
            aria-pressed="${vm.live ? "true" : "false"}"
          >
            ${icon("live")}

            <span>
              ${
                vm.live
                  ? "Live activo"
                  : "Live off"
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
          ${icon("server")}

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
                    `Última consulta · ${formatDateTime(snapshot.checkedAt)}`
                  )
                : "Pendiente de consulta"
            }
          </span>
        </span>

        <span class="server-meta-pill">
          ${icon("clock")}

          <span>
            Uptime · ${escapeHtml(
              snapshot.uptimeLabel
            )}
          </span>
        </span>

        <span class="server-meta-pill">
          ${icon("server")}

          <span>
            API · ${escapeHtml(
              snapshot.latencyLabel
            )}
          </span>
        </span>

        <span class="server-meta-pill">
          ${icon("db")}

          <span>
            DB · ${escapeHtml(
              snapshot.dbLatencyLabel
            )}
          </span>
        </span>
      </div>

      <div class="server-stats">
        <article class="server-stat-card server-stat-card--status">
          <span class="server-stat-label">
            Backend
          </span>

          <strong class="server-stat-value">
            ${escapeHtml(
              snapshot.statusLabel
            )}
          </strong>

          <span class="server-stat-text">
            Estado del health interno autenticado.
          </span>
        </article>

        <article class="server-stat-card server-stat-card--cpu">
          <span class="server-stat-label">
            CPU
          </span>

          <strong class="server-stat-value">
            ${escapeHtml(
              snapshot.cpuUsageLabel
            )}
          </strong>

          <span class="server-stat-text">
            Uso actual del host reportado por backend.
          </span>
        </article>

        <article class="server-stat-card server-stat-card--memory">
          <span class="server-stat-label">
            RAM
          </span>

          <strong class="server-stat-value">
            ${escapeHtml(
              snapshot.memoryUsageLabel
            )}
          </strong>

          <span class="server-stat-text">
            ${escapeHtml(
              snapshot.memoryLabel
            )}
          </span>
        </article>

        <article class="server-stat-card server-stat-card--services">
          <span class="server-stat-label">
            Disco
          </span>

          <strong class="server-stat-value">
            ${escapeHtml(
              snapshot.diskUsageLabel
            )}
          </strong>

          <span class="server-stat-text">
            ${escapeHtml(
              snapshot.diskLabel
            )}
          </span>
        </article>
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
            <strong>
              No se pudo completar la última consulta.
            </strong>

            <span>
              ${escapeHtml(vm.error)}
            </span>
          </div>
        `
        : ""
    }

    <section class="server-dashboard">
      <header class="server-section-head">
        <div>
          <p class="server-section-kicker">
            STATUS
          </p>

          <h2 class="server-section-title">
            Componentes monitorizados
          </h2>
        </div>
      </header>

      <div class="server-services-grid">
        ${snapshot.services
          .map(
            (service) =>
              renderServiceCard(
                service
              )
          )
          .join("")}
      </div>
    </section>

    ${renderWarnings(snapshot)}
    ${renderHealthContract(snapshot)}
    ${renderRuntime(snapshot)}
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
    >
      ${renderHeader(vm)}
      ${renderDashboard(vm)}

      <div
        class="server-loading"
        role="status"
        aria-live="polite"
      >
        ${renderSpinner(
          "Consultando /health/internal…"
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
    >
      ${renderHeader(vm)}

      <div
        class="server-error"
        role="alert"
      >
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
    >
      <div
        class="server-error"
        role="alert"
      >
        <strong>
          Acceso restringido.
        </strong>

        <span>
          /health/internal requiere una sesión de administrador.
        </span>
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
    return renderAccessDeniedState(
      input
    );
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
                "Consultando /health/internal…"
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

      readinessOnEveryLoad:
        false,

      livenessOnEveryLoad:
        false,
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

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default renderServerTemplate;
