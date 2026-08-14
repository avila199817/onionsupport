/* =========================================================
   Onion Support - Servidor API
   Archivo: /src/views/server/server.api.js

   PRODUCTIVO · BACKEND CONTRACT REAL · HEALTH INTERNAL · V2

   Backend real:
   - GET /health
   - GET /health/live
   - GET /health/ready
   - GET /health/internal   JWT + admin
   - GET /health/_meta

   Fuente del dashboard Servidor:
   - GET /health/internal

   /health/internal ya devuelve en UNA sola respuesta:
   - estado backend
   - latencia API
   - estado/latencia DB
   - CPU
   - RAM
   - disco
   - event loop
   - runtime Node/V8
   - uptime
   - entorno Azure/container
   - warnings

   Responsabilidad:
   - única capa HTTP de la vista Servidor
   - una sola request para el dashboard
   - normalización del contrato real
   - cache corta SOLO en memoria
   - auto-refresh opcional
   - sin DOM, Router, Toast ni window.fetch
   - sin endpoint discovery/fuerza bruta
   - sin inventar health de Blob/Azure
========================================================= */

import Http from "../../core/http.js";

/* =========================================================
   META / CONFIG
========================================================= */

export const SERVER_API_VERSION =
  "server.api.backend-contract.v2.health-internal";

export const SERVIDOR_API_VERSION =
  SERVER_API_VERSION;

export const SERVER_REQUEST_TIMEOUT_MS = 15_000;
export const SERVER_CACHE_TTL_MS = 15_000;
export const SERVER_AUTO_REFRESH_DEFAULT_MS = 30_000;

/*
  Se conserva por compatibilidad de imports.
  V2 NO persiste health interno en localStorage.
*/
export const SERVER_CACHE_KEY =
  "onion.support.server.status.memory.v2";

export const SERVER_ENDPOINTS =
  Object.freeze({
    public: "/health",
    live: "/health/live",
    ready: "/health/ready",
    internal: "/health/internal",
    meta: "/health/_meta",
  });

/*
  Compat con consumidores antiguos.
  Ya no representa listas de fallback: cada grupo apunta
  exclusivamente al endpoint real que contiene ese dato.
*/
export const SERVER_ENDPOINT_GROUPS =
  Object.freeze({
    overview: Object.freeze([
      SERVER_ENDPOINTS.internal,
    ]),

    metrics: Object.freeze([
      SERVER_ENDPOINTS.internal,
    ]),

    database: Object.freeze([
      SERVER_ENDPOINTS.internal,
    ]),

    blobs: Object.freeze([]),

    azure: Object.freeze([
      SERVER_ENDPOINTS.internal,
    ]),
  });

const ALLOWED_PROBE_ENDPOINTS =
  new Set(
    Object.values(
      SERVER_ENDPOINTS
    )
  );

const autoRefreshRegistry =
  new Map();

const serverState = {
  snapshot: null,

  loading: false,
  refreshing: false,

  loaded: false,
  hydrated: false,

  error: "",
  lastSyncAt: 0,

  inflight: null,
};

/* =========================================================
   BASICS
========================================================= */

function isFunction(value) {
  return typeof value === "function";
}

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

function cleanText(
  value = "",
  fallback = ""
) {
  const output =
    String(value ?? "")
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return output || fallback;
}

function first(...values) {
  for (const value of values) {
    if (
      value === null ||
      value === undefined
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    if (
      Array.isArray(value) &&
      value.length === 0
    ) {
      continue;
    }

    if (
      isObject(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function number(
  value = 0,
  fallback = 0
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
  max = 1
) {
  return Math.min(
    Math.max(
      number(value, min),
      min
    ),
    max
  );
}

function normalizeKey(
  value = ""
) {
  return cleanText(
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

function nowIso() {
  try {
    return new Date()
      .toISOString();
  } catch {
    return "";
  }
}

function performanceNow() {
  try {
    if (
      typeof performance !==
        "undefined" &&
      isFunction(
        performance.now
      )
    ) {
      return performance.now();
    }
  } catch {
    // Date.now debajo
  }

  return Date.now();
}

function safeError(
  error = null,
  fallback =
    "No se pudo consultar el estado del servidor."
) {
  return cleanText(
    first(
      error?.data?.message,
      error?.payload?.message,
      error?.response?.data
        ?.message,
      error?.response?.message,
      error?.message,
      error?.error,
      error?.code,
      fallback
    ),
    fallback
  );
}

function createContractError(
  code = "SERVER_CONTRACT_ERROR",
  message = code,
  status = 400
) {
  const error =
    new Error(message);

  error.code = code;
  error.status = status;

  return error;
}

/* =========================================================
   SAFE DIAGNOSTIC COPY
========================================================= */

const SENSITIVE_KEYS =
  new Set([
    "password",
    "passwordHash",
    "token",
    "accessToken",
    "refreshToken",
    "idToken",
    "secret",
    "sessionId",
    "authorization",
    "cookie",
    "connectionString",
    "accountKey",
    "sharedAccessKey",
    "sig",
    "signature",
    "key",
  ]);

function isSensitiveKey(
  key = ""
) {
  if (
    SENSITIVE_KEYS.has(key)
  ) {
    return true;
  }

  return /(?:password|passwd|pwd|token|secret|authorization|cookie|connection.?string|account.?key|shared.?access.?key|signature|sas)$/i.test(
    key
  );
}

function sanitizeString(
  value = ""
) {
  return String(value ?? "")
    .replace(
      /(AccountKey=)[^;&\s]+/gi,
      "$1***"
    )
    .replace(
      /(SharedAccessKey=)[^;&\s]+/gi,
      "$1***"
    )
    .replace(
      /(sig=)[^;&\s]+/gi,
      "$1***"
    )
    .replace(
      /(token=)[^;&\s]+/gi,
      "$1***"
    )
    .replace(
      /(access_token=)[^;&\s]+/gi,
      "$1***"
    )
    .replace(
      /(refresh_token=)[^;&\s]+/gi,
      "$1***"
    )
    .replace(
      /(password=)[^;&\s]+/gi,
      "$1***"
    );
}

function sanitizeDiagnostic(
  value,
  depth = 0
) {
  if (depth > 8) {
    return "[MaxDepth]";
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (
    typeof value === "string"
  ) {
    return sanitizeString(
      value
    );
  }

  if (
    typeof value !== "object"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 200)
      .map(
        (item) =>
          sanitizeDiagnostic(
            item,
            depth + 1
          )
      );
  }

  const output = {};

  for (
    const [key, item] of
    Object.entries(value)
  ) {
    if (
      isSensitiveKey(key)
    ) {
      continue;
    }

    /*
      No necesitamos persistir/reflejar identidad del admin
      ni interfaces/IPs en el snapshot visual.
    */
    if (
      depth === 0 &&
      (
        key === "user" ||
        key === "network"
      )
    ) {
      continue;
    }

    output[key] =
      sanitizeDiagnostic(
        item,
        depth + 1
      );
  }

  return output;
}

/* =========================================================
   FORMAT
========================================================= */

function formatPercent(
  value = null
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const numeric =
    number(
      value,
      NaN
    );

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return "—";
  }

  const normalized =
    numeric >= 0 &&
    numeric <= 1
      ? numeric * 100
      : numeric;

  const final =
    clamp(
      normalized,
      0,
      999
    );

  return `${final.toFixed(
    final >= 10 ? 0 : 1
  )}%`;
}

function formatMs(
  value = null
) {
  const numeric =
    number(
      value,
      NaN
    );

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return "—";
  }

  return `${Math.max(
    0,
    Math.round(numeric)
  )} ms`;
}

function formatDuration(
  seconds = 0
) {
  const value =
    Math.max(
      0,
      number(
        seconds,
        0
      )
    );

  if (!value) {
    return "—";
  }

  const days =
    Math.floor(
      value / 86_400
    );

  const hours =
    Math.floor(
      (value % 86_400) /
        3_600
    );

  const minutes =
    Math.floor(
      (value % 3_600) /
        60
    );

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes || 1}m`;
}

function mbToBytes(
  mb = null
) {
  const numeric =
    number(
      mb,
      NaN
    );

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return null;
  }

  return Math.round(
    numeric *
      1024 *
      1024
  );
}

function gbToBytes(
  gb = null
) {
  const numeric =
    number(
      gb,
      NaN
    );

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return null;
  }

  return Math.round(
    numeric *
      1024 *
      1024 *
      1024
  );
}

function formatBytes(
  bytes = null
) {
  const numeric =
    number(
      bytes,
      NaN
    );

  if (
    !Number.isFinite(
      numeric
    ) ||
    numeric < 0
  ) {
    return "—";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
    "TB",
  ];

  let value =
    numeric;

  let unit = 0;

  while (
    value >= 1024 &&
    unit <
      units.length - 1
  ) {
    value /= 1024;
    unit += 1;
  }

  return `${value.toFixed(
    unit <= 1
      ? 0
      : 1
  )} ${units[unit]}`;
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
      "degraded",
      "warning",
      "warn",
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
      "down",
      "critical",
      "error",
      "fail",
      "failed",
      "offline",
      "unhealthy",
      "disconnected",
      "unavailable",
      "ko",
    ].includes(key)
  ) {
    return "critical";
  }

  if (!key) {
    return "unknown";
  }

  return "unknown";
}

export function labelForStatus(
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

function statusFromUsage({
  value = null,
  warning = 85,
  critical = 95,
} = {}) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "unknown";
  }

  const numeric =
    number(
      value,
      NaN
    );

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return "unknown";
  }

  if (
    numeric >= critical
  ) {
    return "critical";
  }

  if (
    numeric >= warning
  ) {
    return "warning";
  }

  return "healthy";
}

export function normalizeService({
  id = "",
  label = "",
  status = "unknown",
  latencyMs = null,
  endpoint = "",
  detail = "",
  value = "",
  raw = null,
  error = "",
} = {}) {
  const normalizedStatus =
    normalizeStatus(
      status
    );

  return {
    id:
      normalizeKey(
        id ||
        label ||
        endpoint ||
        "service"
      ),

    label:
      cleanText(
        label,
        "Servicio"
      ),

    status:
      normalizedStatus,

    statusLabel:
      labelForStatus(
        normalizedStatus
      ),

    latencyMs:
      latencyMs === null ||
      latencyMs === undefined
        ? null
        : number(
            latencyMs,
            null
          ),

    endpoint:
      cleanText(
        endpoint,
        ""
      ),

    detail:
      cleanText(
        detail,
        ""
      ),

    value:
      cleanText(
        value,
        ""
      ),

    error:
      cleanText(
        error,
        ""
      ),

    raw:
      sanitizeDiagnostic(
        raw
      ),
  };
}

/* =========================================================
   HTTP
========================================================= */

async function httpGet(
  endpoint = "",
  options = {}
) {
  const path =
    cleanText(
      endpoint,
      ""
    );

  if (!path) {
    throw createContractError(
      "SERVER_ENDPOINT_REQUIRED",
      "Falta el endpoint de health."
    );
  }

  if (
    !ALLOWED_PROBE_ENDPOINTS.has(
      path
    )
  ) {
    throw createContractError(
      "SERVER_ENDPOINT_NOT_ALLOWED",
      `El endpoint ${path} no forma parte del contrato de health.`,
      400
    );
  }

  const startedAt =
    performanceNow();

  let response;

  if (
    isFunction(
      Http?.get
    )
  ) {
    response =
      await Http.get(
        path,
        {
          timeout:
            number(
              options.timeout,
              SERVER_REQUEST_TIMEOUT_MS
            ),

          query:
            safeObject(
              options.query
            ),

          headers:
            safeObject(
              options.headers
            ),

          source:
            cleanText(
              options.source,
              "views.server.api"
            ),
        }
      );
  } else if (
    isFunction(
      Http?.request
    )
  ) {
    response =
      await Http.request(
        path,
        {
          method: "GET",

          timeout:
            number(
              options.timeout,
              SERVER_REQUEST_TIMEOUT_MS
            ),

          query:
            safeObject(
              options.query
            ),

          headers:
            safeObject(
              options.headers
            ),

          source:
            cleanText(
              options.source,
              "views.server.api"
            ),
        }
      );
  } else {
    throw createContractError(
      "SERVER_HTTP_UNAVAILABLE",
      "El cliente HTTP no expone GET.",
      500
    );
  }

  return {
    endpoint: path,

    latencyMs:
      Math.max(
        0,
        Math.round(
          performanceNow() -
            startedAt
        )
      ),

    response,
  };
}

export async function probeServerEndpoint(
  endpoint = "",
  options = {}
) {
  return httpGet(
    endpoint,
    {
      ...safeObject(
        options
      ),

      source:
        cleanText(
          options?.source,
          "views.server.api.probe"
        ),
    }
  );
}

/*
  Compatibilidad deliberada con el export antiguo.
  NO se recorren arrays de endpoints.
*/
export async function probeEndpointGroup(
  group = "",
  _endpoints = [],
  options = {}
) {
  const name =
    normalizeKey(group);

  if (!name) {
    throw createContractError(
      "SERVER_GROUP_REQUIRED",
      "Falta el grupo de health."
    );
  }

  const configured =
    SERVER_ENDPOINT_GROUPS[
      name
    ];

  if (
    !Array.isArray(
      configured
    )
  ) {
    throw createContractError(
      "SERVER_GROUP_NOT_SUPPORTED",
      `El grupo ${name} no existe.`,
      400
    );
  }

  if (!configured.length) {
    return {
      group: name,
      ok: false,
      supported: false,
      endpoint: "",
      latencyMs: null,
      data: null,
      error:
        `${name} no dispone de un health independiente en el backend actual.`,
      tried: [],
      errors: [],
    };
  }

  const endpoint =
    configured[0];

  try {
    const result =
      await httpGet(
        endpoint,
        {
          ...safeObject(
            options
          ),

          source:
            `views.server.api.${name}`,
        }
      );

    return {
      group: name,
      ok: true,
      supported: true,

      endpoint:
        result.endpoint,

      latencyMs:
        result.latencyMs,

      data:
        result.response,

      error: "",
      tried: [
        endpoint,
      ],
      errors: [],
    };
  } catch (error) {
    return {
      group: name,
      ok: false,
      supported: true,
      endpoint,
      latencyMs: null,
      data: null,

      error:
        safeError(error),

      tried: [
        endpoint,
      ],

      errors: [
        {
          endpoint,
          message:
            safeError(error),
        },
      ],
    };
  }
}

/* =========================================================
   RESPONSE
========================================================= */

function unwrapHealthResponse(
  payload = null
) {
  let current =
    payload;

  const seen =
    new Set();

  for (
    let depth = 0;
    depth < 6;
    depth += 1
  ) {
    if (
      !isObject(current) ||
      seen.has(current)
    ) {
      break;
    }

    seen.add(current);

    /*
      /health/internal devuelve el payload directamente.
      Esto solo tolera wrappers del core Http/proxies.
    */
    const nested =
      first(
        current.data,
        current.payload,
        current.result,
        current.response,
        null
      );

    if (
      isObject(nested) &&
      !current.api &&
      !current.db &&
      !current.system &&
      !current.infrastructure
    ) {
      current =
        nested;

      continue;
    }

    break;
  }

  return safeObject(
    current,
    {}
  );
}

function healthFromLegacyResults(
  results = []
) {
  for (
    const result of
    safeArray(results)
  ) {
    const candidate =
      safeObject(
        first(
          result?.data,
          result?.response,
          {}
        )
      );

    if (
      candidate.api ||
      candidate.db ||
      candidate.system ||
      candidate.infrastructure
    ) {
      return {
        payload:
          candidate,

        endpoint:
          cleanText(
            result.endpoint,
            SERVER_ENDPOINTS.internal
          ),

        transportLatencyMs:
          result.latencyMs ??
          null,
      };
    }
  }

  return {
    payload: {},
    endpoint:
      SERVER_ENDPOINTS.internal,

    transportLatencyMs:
      null,
  };
}

/* =========================================================
   CANONICAL SNAPSHOT
========================================================= */

function detailedHealthPayload(
  payload = {}
) {
  const source =
    unwrapHealthResponse(
      payload
    );

  /*
    El montaje actual de server.js NO inyecta checkInfrastructure,
    así que producción usa getDetailedHealth(db):
    api/db/system/runtime/environment/warnings.
  */
  return source;
}

function infrastructurePayload(
  payload = {}
) {
  const source =
    unwrapHealthResponse(
      payload
    );

  return safeObject(
    source.infrastructure,
    {}
  );
}

function normalizeDatabaseStatus(
  db = {}
) {
  if (
    db.ok === true ||
    normalizeKey(
      db.status
    ) === "up"
  ) {
    return "healthy";
  }

  if (
    db.ok === false ||
    [
      "down",
      "error",
      "unavailable",
    ].includes(
      normalizeKey(
        db.status
      )
    )
  ) {
    return "critical";
  }

  return "unknown";
}

function extractAzureEnvironment(
  source = {}
) {
  const environment =
    safeObject(
      source.environment
    );

  const azure =
    safeObject(
      environment.azure
    );

  const fields = {
    websiteInstanceId:
      cleanText(
        azure.websiteInstanceId,
        ""
      ),

    websiteSiteName:
      cleanText(
        azure.websiteSiteName,
        ""
      ),

    websiteHostname:
      cleanText(
        azure.websiteHostname,
        ""
      ),

    regionName:
      cleanText(
        azure.regionName,
        ""
      ),

    sku:
      cleanText(
        azure.sku,
        ""
      ),

    resourceGroup:
      cleanText(
        azure.resourceGroup,
        ""
      ),

    slotName:
      cleanText(
        azure.slotName,
        ""
      ),
  };

  return Object.fromEntries(
    Object.entries(fields)
      .filter(
        ([, value]) =>
          Boolean(value)
      )
  );
}

function buildServices({
  source = {},
  endpoint =
    SERVER_ENDPOINTS.internal,
  transportLatencyMs = null,
} = {}) {
  const api =
    safeObject(
      source.api
    );

  const db =
    safeObject(
      source.db
    );

  const system =
    safeObject(
      source.system
    );

  const cpu =
    safeObject(
      system.cpu
    );

  const ram =
    safeObject(
      system.ram
    );

  const disk =
    safeObject(
      system.disk
    );

  const eventLoop =
    safeObject(
      system.eventLoop
    );

  const thresholds =
    safeObject(
      source.thresholds
    );

  const apiStatus =
    normalizeStatus(
      first(
        api.status,
        source.status,
        source.ok === true
          ? "healthy"
          : source.ok === false
            ? "down"
            : ""
      )
    );

  const dbStatus =
    normalizeDatabaseStatus(
      db
    );

  const cpuUsage =
    cpu.usagePercent ??
    null;

  const ramUsage =
    ram.usagePercent ??
    null;

  const diskUsage =
    disk.available === false
      ? null
      : disk.percent ??
        null;

  const eventLoopLag =
    eventLoop.lagMs ??
    eventLoop.lag ??
    null;

  return [
    normalizeService({
      id: "backend",
      label: "Backend API",
      status: apiStatus,

      latencyMs:
        api.latencyMs ??
        transportLatencyMs,

      endpoint,

      detail:
        source.service
          ? `Servicio ${cleanText(source.service)}.`
          : "Health interno del backend.",

      raw: api,
    }),

    normalizeService({
      id: "database",
      label: "Base de datos",
      status: dbStatus,

      latencyMs:
        db.latencyMs ??
        null,

      endpoint,

      detail:
        dbStatus === "healthy"
          ? "Cosmos DB responde correctamente."
          : db?.error?.message ||
            "Estado de Cosmos DB.",

      raw: db,

      error:
        db?.error?.message ||
        "",
    }),

    normalizeService({
      id: "cpu",
      label: "CPU",

      status:
        statusFromUsage({
          value: cpuUsage,

          warning:
            number(
              thresholds.cpuWarnPercent,
              85
            ),

          critical:
            number(
              thresholds.cpuCriticalPercent,
              95
            ),
        }),

      endpoint,

      value:
        formatPercent(
          cpuUsage
        ),

      detail:
        cpu.cores
          ? `${number(cpu.cores, 0)} núcleo${number(cpu.cores, 0) === 1 ? "" : "s"} · carga 1m ${number(cpu.load1, 0)}`
          : "Uso de CPU del host.",

      raw: cpu,
    }),

    normalizeService({
      id: "memory",
      label: "RAM",

      status:
        statusFromUsage({
          value: ramUsage,

          warning:
            number(
              thresholds.ramWarnPercent,
              85
            ),

          critical:
            number(
              thresholds.ramCriticalPercent,
              94
            ),
        }),

      endpoint,

      value:
        formatPercent(
          ramUsage
        ),

      detail:
        ram.totalGB
          ? `${number(ram.usedGB, 0)} GB / ${number(ram.totalGB, 0)} GB`
          : "Uso de memoria del host.",

      raw: ram,
    }),

    normalizeService({
      id: "disk",
      label: "Disco",

      status:
        diskUsage === null
          ? "unknown"
          : statusFromUsage({
              value:
                diskUsage,

              warning:
                number(
                  thresholds.diskWarnPercent,
                  90
                ),

              critical:
                number(
                  thresholds.diskCriticalPercent,
                  97
                ),
            }),

      endpoint,

      value:
        diskUsage === null
          ? "—"
          : formatPercent(
              diskUsage
            ),

      detail:
        disk.available === false
          ? "Métrica de disco no disponible en este runtime."
          : disk.totalGB
            ? `${number(disk.usedGB, 0)} GB / ${number(disk.totalGB, 0)} GB`
            : "Uso de disco del host.",

      raw: disk,
    }),

    normalizeService({
      id: "event_loop",
      label: "Event loop",

      status:
        eventLoopLag === null
          ? "unknown"
          : statusFromUsage({
              value:
                eventLoopLag,

              warning:
                number(
                  thresholds.eventLoopLagWarnMs,
                  120
                ),

              critical:
                number(
                  thresholds.eventLoopLagCriticalMs,
                  350
                ),
            }),

      latencyMs:
        eventLoopLag === null
          ? null
          : number(
              eventLoopLag,
              null
            ),

      endpoint,

      value:
        eventLoopLag === null
          ? "—"
          : formatMs(
              eventLoopLag
            ),

      detail:
        "Retardo del event loop de Node.",

      raw: eventLoop,
    }),
  ];
}

/*
  Compatibilidad del nombre antiguo:
  acepta el payload real o el array de resultados legacy.
*/
export function normalizeServerSnapshot(
  payload = null,
  options = {}
) {
  let source;
  let endpoint =
    SERVER_ENDPOINTS.internal;
  let transportLatencyMs =
    options.transportLatencyMs ??
    null;

  if (
    Array.isArray(payload)
  ) {
    const legacy =
      healthFromLegacyResults(
        payload
      );

    source =
      detailedHealthPayload(
        legacy.payload
      );

    endpoint =
      legacy.endpoint;

    transportLatencyMs =
      legacy.transportLatencyMs;
  } else {
    source =
      detailedHealthPayload(
        payload
      );

    endpoint =
      cleanText(
        options.endpoint,
        SERVER_ENDPOINTS.internal
      );
  }

  const infrastructure =
    infrastructurePayload(
      source
    );

  /*
    Si un backend futuro inyecta checkInfrastructure,
    preferimos sus datos reales. Hoy normalmente está vacío.
  */
  const db =
    safeObject(
      first(
        source.db,
        infrastructure.cosmos,
        infrastructure.database,
        {}
      )
    );

  const system =
    safeObject(
      source.system
    );

  const cpu =
    safeObject(
      system.cpu
    );

  const ram =
    safeObject(
      system.ram
    );

  const disk =
    safeObject(
      system.disk
    );

  const eventLoop =
    safeObject(
      system.eventLoop
    );

  const runtime =
    safeObject(
      source.runtime
    );

  const environment =
    safeObject(
      source.environment
    );

  const backendStatus =
    normalizeStatus(
      first(
        source.status,
        source.ok === true
          ? "healthy"
          : source.ok === false
            ? "down"
            : "",
        source.success === true
          ? "healthy"
          : source.success === false
            ? "down"
            : ""
      )
    );

  const dbStatus =
    normalizeDatabaseStatus(
      db
    );

  const cpuUsage =
    cpu.usagePercent ??
    null;

  const memoryUsage =
    ram.usagePercent ??
    null;

  const memoryUsedBytes =
    first(
      mbToBytes(
        ram.usedMB
      ),
      gbToBytes(
        ram.usedGB
      )
    );

  const memoryTotalBytes =
    first(
      mbToBytes(
        ram.totalMB
      ),
      gbToBytes(
        ram.totalGB
      )
    );

  const diskUsage =
    disk.available === false
      ? null
      : disk.percent ??
        null;

  const diskUsedBytes =
    gbToBytes(
      disk.usedGB
    );

  const diskTotalBytes =
    gbToBytes(
      disk.totalGB
    );

  const eventLoopLagMs =
    first(
      eventLoop.lagMs,
      eventLoop.lag,
      null
    );

  const apiLatencyMs =
    first(
      source.api?.latencyMs,
      source.api?.latency,
      transportLatencyMs,
      null
    );

  const dbLatencyMs =
    first(
      db.latencyMs,
      db.latency,
      null
    );

  const uptimeSeconds =
    number(
      first(
        source.uptimeSeconds,
        runtime.process
          ?.uptimeSeconds,
        system.host
          ?.uptimeSeconds,
        0
      ),
      0
    );

  const services =
    buildServices({
      source: {
        ...source,
        db,
      },

      endpoint,
      transportLatencyMs,
    });

  const warnings =
    safeArray(
      source.warnings
    ).map(
      (warning) => ({
        code:
          cleanText(
            warning?.code,
            ""
          ),

        severity:
          cleanText(
            warning?.severity,
            ""
          ),

        message:
          cleanText(
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
    );

  const azure =
    extractAzureEnvironment(
      source
    );

  /*
    Importante:
    azurePresent = runtime detectado, NO health de Azure.
    blobHealthSupported = false porque no existe una prueba
    de Blob en /health/internal actualmente.
  */
  const capabilities = {
    internalHealth: true,

    readiness: true,
    liveness: true,

    databaseHealth: true,

    cpuMetrics:
      cpuUsage !== null,

    ramMetrics:
      memoryUsage !== null,

    diskMetrics:
      diskUsage !== null,

    eventLoopMetrics:
      eventLoopLagMs !== null,

    azureEnvironment:
      Object.keys(azure)
        .length > 0,

    azureHealth: false,
    blobHealth: false,
  };

  const sanitizedRaw =
    sanitizeDiagnostic({
      ok:
        source.ok,

      success:
        source.success,

      status:
        source.status,

      service:
        source.service,

      module:
        source.module,

      version:
        source.version,

      scope:
        source.scope,

      api:
        source.api,

      db,

      system,

      runtime,

      environment,

      thresholds:
        source.thresholds,

      warnings,

      uptime:
        source.uptime,

      uptimeSeconds,

      timestamp:
        source.timestamp,

      durationMs:
        source.durationMs,

      requestId:
        source.requestId,
    });

  return {
    version:
      SERVER_API_VERSION,

    backendVersion:
      cleanText(
        source.version,
        ""
      ),

    service:
      cleanText(
        source.service,
        "onion-backend"
      ),

    status:
      backendStatus,

    statusLabel:
      labelForStatus(
        backendStatus
      ),

    ok:
      source.ok !== false &&
      backendStatus !==
        "critical",

    checkedAt:
      cleanText(
        source.timestamp,
        nowIso()
      ),

    uptimeSeconds,

    uptimeLabel:
      formatDuration(
        uptimeSeconds
      ),

    latencyMs:
      apiLatencyMs === null
        ? null
        : number(
            apiLatencyMs,
            null
          ),

    latencyLabel:
      formatMs(
        apiLatencyMs
      ),

    dbStatus,
    dbStatusLabel:
      labelForStatus(
        dbStatus
      ),

    dbLatencyMs:
      dbLatencyMs === null
        ? null
        : number(
            dbLatencyMs,
            null
          ),

    dbLatencyLabel:
      formatMs(
        dbLatencyMs
      ),

    cpuUsage,

    cpuUsageLabel:
      formatPercent(
        cpuUsage
      ),

    memoryUsage,

    memoryUsageLabel:
      formatPercent(
        memoryUsage
      ),

    memoryUsedBytes,
    memoryTotalBytes,

    memoryLabel:
      memoryUsedBytes !== null &&
      memoryTotalBytes !== null
        ? `${formatBytes(memoryUsedBytes)} / ${formatBytes(memoryTotalBytes)}`
        : formatPercent(
            memoryUsage
          ),

    diskUsage,

    diskUsageLabel:
      formatPercent(
        diskUsage
      ),

    diskUsedBytes,
    diskTotalBytes,

    diskLabel:
      diskUsedBytes !== null &&
      diskTotalBytes !== null
        ? `${formatBytes(diskUsedBytes)} / ${formatBytes(diskTotalBytes)}`
        : formatPercent(
            diskUsage
          ),

    eventLoopLagMs,

    eventLoopLagLabel:
      formatMs(
        eventLoopLagMs
      ),

    warnings,

    services,

    capabilities,

    azure,

    runtime:
      sanitizeDiagnostic(
        runtime
      ),

    environment:
      sanitizeDiagnostic(
        environment
      ),

    endpoints: {
      internal: {
        ok:
          source.ok !== false,

        supported: true,

        endpoint,

        latencyMs:
          transportLatencyMs,

        error: "",

        tried: [
          endpoint,
        ],
      },

      ready: {
        supported: true,

        endpoint:
          SERVER_ENDPOINTS.ready,
      },

      live: {
        supported: true,

        endpoint:
          SERVER_ENDPOINTS.live,
      },

      blobs: {
        supported: false,

        endpoint: "",

        reason:
          "El backend actual no expone health independiente de Blob.",
      },

      azure: {
        supported: false,

        endpoint: "",

        reason:
          "Se expone entorno Azure, no una comprobación de salud de Azure.",
      },
    },

    raw:
      sanitizedRaw,
  };
}

export function createEmptyServerSnapshot() {
  return {
    version:
      SERVER_API_VERSION,

    backendVersion: "",

    service:
      "onion-backend",

    status: "unknown",

    statusLabel:
      "Sin datos",

    ok: false,

    checkedAt: "",

    uptimeSeconds: 0,
    uptimeLabel: "—",

    latencyMs: null,
    latencyLabel: "—",

    dbStatus: "unknown",
    dbStatusLabel:
      "Desconocido",

    dbLatencyMs: null,
    dbLatencyLabel: "—",

    cpuUsage: null,
    cpuUsageLabel: "—",

    memoryUsage: null,
    memoryUsageLabel: "—",

    memoryUsedBytes: null,
    memoryTotalBytes: null,
    memoryLabel: "—",

    diskUsage: null,
    diskUsageLabel: "—",

    diskUsedBytes: null,
    diskTotalBytes: null,
    diskLabel: "—",

    eventLoopLagMs: null,
    eventLoopLagLabel: "—",

    warnings: [],

    services: [
      normalizeService({
        id: "backend",
        label: "Backend API",
        status: "unknown",
        endpoint:
          SERVER_ENDPOINTS.internal,
        detail:
          "Pendiente de consulta.",
      }),

      normalizeService({
        id: "database",
        label: "Base de datos",
        status: "unknown",
        endpoint:
          SERVER_ENDPOINTS.internal,
        detail:
          "Pendiente de consulta.",
      }),

      normalizeService({
        id: "cpu",
        label: "CPU",
        status: "unknown",
        value: "—",
        detail:
          "Pendiente de consulta.",
      }),

      normalizeService({
        id: "memory",
        label: "RAM",
        status: "unknown",
        value: "—",
        detail:
          "Pendiente de consulta.",
      }),

      normalizeService({
        id: "disk",
        label: "Disco",
        status: "unknown",
        value: "—",
        detail:
          "Pendiente de consulta.",
      }),

      normalizeService({
        id: "event_loop",
        label: "Event loop",
        status: "unknown",
        value: "—",
        detail:
          "Pendiente de consulta.",
      }),
    ],

    capabilities: {
      internalHealth: true,
      readiness: true,
      liveness: true,
      databaseHealth: true,

      cpuMetrics: false,
      ramMetrics: false,
      diskMetrics: false,
      eventLoopMetrics: false,

      azureEnvironment: false,
      azureHealth: false,
      blobHealth: false,
    },

    azure: {},
    runtime: {},
    environment: {},

    endpoints: {
      internal: {
        supported: true,
        endpoint:
          SERVER_ENDPOINTS.internal,
      },

      ready: {
        supported: true,
        endpoint:
          SERVER_ENDPOINTS.ready,
      },

      live: {
        supported: true,
        endpoint:
          SERVER_ENDPOINTS.live,
      },

      blobs: {
        supported: false,
        endpoint: "",
      },

      azure: {
        supported: false,
        endpoint: "",
      },
    },

    raw: {},
  };
}

/* =========================================================
   MEMORY CACHE / STATE
========================================================= */

function cacheIsFresh() {
  if (
    !serverState.snapshot ||
    !serverState.lastSyncAt
  ) {
    return false;
  }

  return (
    Date.now() -
      serverState.lastSyncAt
  ) <= SERVER_CACHE_TTL_MS;
}

/*
  Compatibilidad del nombre histórico.
  Ya NO lee localStorage.
*/
export function hydrateServerFromCache({
  freshOnly = true,
} = {}) {
  if (
    !serverState.snapshot
  ) {
    return null;
  }

  if (
    freshOnly &&
    !cacheIsFresh()
  ) {
    return null;
  }

  serverState.hydrated =
    true;

  serverState.loaded =
    true;

  return serverState.snapshot;
}

export function clearServerCache() {
  serverState.snapshot =
    null;

  serverState.loading =
    false;

  serverState.refreshing =
    false;

  serverState.loaded =
    false;

  serverState.hydrated =
    false;

  serverState.error = "";
  serverState.lastSyncAt = 0;
  serverState.inflight = null;

  return true;
}

function setLoading(
  value = false
) {
  serverState.loading =
    Boolean(value);

  return serverState.loading;
}

function setRefreshing(
  value = false
) {
  serverState.refreshing =
    Boolean(value);

  return serverState.refreshing;
}

function setError(
  value = ""
) {
  serverState.error =
    cleanText(
      value,
      ""
    );

  return serverState.error;
}

function clearError() {
  serverState.error = "";
  return true;
}

function setSnapshot(
  snapshot = null
) {
  serverState.snapshot =
    snapshot;

  serverState.loaded =
    Boolean(snapshot);

  serverState.hydrated =
    Boolean(snapshot);

  serverState.lastSyncAt =
    snapshot
      ? Date.now()
      : 0;

  return snapshot;
}

/* =========================================================
   REAL REQUESTS
========================================================= */

export async function fetchServerHealthRequest(
  options = {}
) {
  const result =
    await httpGet(
      SERVER_ENDPOINTS.internal,
      {
        ...safeObject(
          options
        ),

        source:
          cleanText(
            options?.source,
            "views.server.api.health.internal"
          ),
      }
    );

  const source =
    unwrapHealthResponse(
      result.response
    );

  if (
    !Object.keys(source).length
  ) {
    throw createContractError(
      "SERVER_HEALTH_INVALID_RESPONSE",
      "El backend no devolvió un health interno válido.",
      502
    );
  }

  return {
    endpoint:
      result.endpoint,

    transportLatencyMs:
      result.latencyMs,

    data: source,
  };
}

export async function fetchServerReadinessRequest(
  options = {}
) {
  const result =
    await httpGet(
      SERVER_ENDPOINTS.ready,
      {
        ...safeObject(
          options
        ),

        source:
          cleanText(
            options?.source,
            "views.server.api.health.ready"
          ),
      }
    );

  const source =
    unwrapHealthResponse(
      result.response
    );

  return {
    endpoint:
      result.endpoint,

    transportLatencyMs:
      result.latencyMs,

    ok:
      source.ok === true &&
      normalizeKey(
        source.status
      ) === "ready",

    status:
      cleanText(
        source.status,
        source.ok === true
          ? "ready"
          : "not_ready"
      ),

    checks:
      safeObject(
        source.checks
      ),

    uptimeSec:
      number(
        source.uptimeSec,
        0
      ),

    timestamp:
      cleanText(
        source.timestamp,
        ""
      ),

    data:
      sanitizeDiagnostic(
        source
      ),
  };
}

export async function fetchServerLivenessRequest(
  options = {}
) {
  const result =
    await httpGet(
      SERVER_ENDPOINTS.live,
      {
        ...safeObject(
          options
        ),

        source:
          cleanText(
            options?.source,
            "views.server.api.health.live"
          ),
      }
    );

  const source =
    unwrapHealthResponse(
      result.response
    );

  return {
    endpoint:
      result.endpoint,

    transportLatencyMs:
      result.latencyMs,

    ok:
      source.ok !== false,

    status:
      cleanText(
        source.status,
        "live"
      ),

    uptimeSec:
      number(
        first(
          source.uptimeSec,
          source.uptimeSeconds,
          0
        ),
        0
      ),

    timestamp:
      cleanText(
        source.timestamp,
        ""
      ),

    data:
      sanitizeDiagnostic(
        source
      ),
  };
}

/* =========================================================
   LOADERS
========================================================= */

export async function loadServerSnapshot(
  options = {}
) {
  const opts =
    safeObject(
      options
    );

  if (
    serverState.inflight &&
    !opts.force
  ) {
    return serverState.inflight;
  }

  const cached =
    hydrateServerFromCache({
      freshOnly:
        opts.freshOnly !==
        false,
    });

  if (
    cached &&
    !opts.force
  ) {
    return cached;
  }

  const hadSnapshot =
    Boolean(
      serverState.snapshot
    );

  setLoading(
    !hadSnapshot
  );

  setRefreshing(
    hadSnapshot
  );

  clearError();

  let task = null;

  task = (async () => {
    try {
      const response =
        await fetchServerHealthRequest(
          opts
        );

      const snapshot =
        normalizeServerSnapshot(
          response.data,
          {
            endpoint:
              response.endpoint,

            transportLatencyMs:
              response.transportLatencyMs,
          }
        );

      setSnapshot(
        snapshot
      );

      return snapshot;
    } catch (error) {
      setError(
        safeError(error)
      );

      throw error;
    } finally {
      setLoading(false);
      setRefreshing(false);

      if (
        serverState.inflight ===
        task
      ) {
        serverState.inflight =
          null;
      }
    }
  })();

  serverState.inflight =
    task;

  return task;
}

export async function loadServerHealth(
  options = {}
) {
  return loadServerSnapshot(
    options
  );
}

export async function refreshServerSnapshot(
  options = {}
) {
  return loadServerSnapshot({
    ...safeObject(
      options
    ),

    force: true,
  });
}

export async function refreshServerHealth(
  options = {}
) {
  return refreshServerSnapshot(
    options
  );
}

/* =========================================================
   AUTO REFRESH
========================================================= */

export function setServerAutoRefresh(
  key = "server:view",
  enabled = false,
  options = {}
) {
  const registryKey =
    cleanText(
      key,
      "server:view"
    );

  const current =
    autoRefreshRegistry.get(
      registryKey
    );

  if (
    current?.timer
  ) {
    clearInterval(
      current.timer
    );
  }

  autoRefreshRegistry.delete(
    registryKey
  );

  if (!enabled) {
    return {
      key:
        registryKey,

      enabled: false,
      intervalMs: 0,
    };
  }

  const intervalMs =
    clamp(
      number(
        options?.intervalMs,
        SERVER_AUTO_REFRESH_DEFAULT_MS
      ),
      5_000,
      600_000
    );

  const timer =
    setInterval(
      () => {
        refreshServerSnapshot({
          ...safeObject(
            options
          ),

          source:
            `auto-refresh:${registryKey}`,
        }).catch(
          () => {}
        );
      },
      intervalMs
    );

  autoRefreshRegistry.set(
    registryKey,
    {
      key:
        registryKey,

      timer,
      intervalMs,

      startedAt:
        Date.now(),
    }
  );

  return {
    key:
      registryKey,

    enabled: true,
    intervalMs,
  };
}

export function stopAllServerAutoRefresh() {
  for (
    const entry of
    autoRefreshRegistry.values()
  ) {
    try {
      clearInterval(
        entry.timer
      );
    } catch {
      // noop
    }
  }

  autoRefreshRegistry.clear();

  return true;
}

/* =========================================================
   SNAPSHOTS / COMPAT
========================================================= */

export function getServerSnapshotStore() {
  return (
    serverState.snapshot ||
    createEmptyServerSnapshot()
  );
}

export function getServerSnapshot() {
  return getServerSnapshotStore();
}

export function getServerStateSnapshot() {
  return {
    version:
      SERVER_API_VERSION,

    snapshot:
      getServerSnapshotStore(),

    loading:
      serverState.loading,

    refreshing:
      serverState.refreshing,

    loaded:
      serverState.loaded,

    hydrated:
      serverState.hydrated,

    error:
      serverState.error,

    lastSyncAt:
      serverState.lastSyncAt,

    cache: {
      type: "memory",
      persisted: false,
      ttlMs:
        SERVER_CACHE_TTL_MS,
    },

    endpoint:
      SERVER_ENDPOINTS.internal,

    requestPolicy: {
      dashboardRequests: 1,
      discoveryFallbacks: 0,
      endpointAllowlist: true,
    },

    autoRefresh: [
      ...autoRefreshRegistry
        .values(),
    ].map(
      (entry) => ({
        key:
          entry.key,

        intervalMs:
          entry.intervalMs,

        startedAt:
          entry.startedAt,
      })
    ),
  };
}

export function getState() {
  return getServerStateSnapshot();
}

export function getSnapshot() {
  return getServerStateSnapshot();
}

export function getServerServices() {
  return safeArray(
    getServerSnapshotStore()
      .services
  );
}

export function getServerServiceByIdStore(
  id = ""
) {
  const target =
    normalizeKey(id);

  if (!target) {
    return null;
  }

  return (
    getServerServices()
      .find(
        (service) =>
          normalizeKey(
            service.id
          ) === target
      ) ||
    null
  );
}

export {
  serverState,
};

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default Object.freeze({
  version:
    SERVER_API_VERSION,

  endpoint:
    SERVER_ENDPOINTS.internal,

  endpoints:
    SERVER_ENDPOINTS,

  endpointGroups:
    SERVER_ENDPOINT_GROUPS,

  fetchServerHealthRequest,
  fetchServerReadinessRequest,
  fetchServerLivenessRequest,

  loadServerSnapshot,
  loadServerHealth,

  refreshServerSnapshot,
  refreshServerHealth,

  probeServerEndpoint,
  probeEndpointGroup,

  hydrateServerFromCache,
  clearServerCache,

  setServerAutoRefresh,
  stopAllServerAutoRefresh,

  normalizeServerSnapshot,
  createEmptyServerSnapshot,

  getServerSnapshotStore,
  getServerSnapshot,
  getServerStateSnapshot,
  getServerServices,
  getServerServiceByIdStore,

  getState,
  getSnapshot,

  normalizeStatus,
  labelForStatus,
  normalizeService,

  serverState,
});
