/* =========================================================
   Onion SPA - Home Model
   Archivo: src/views/home/home.model.js

   FINAL PRO SYSTEM · DASHBOARD MODEL · 10/10

   RESPONSABILIDADES:
   - normalizar payloads heterogéneos backend/store del dashboard
   - exponer modelo consistente Dashboard / Widget
   - labels de estado / tipo
   - flags computados
   - icon / initials / theme
   - fechas base
   - collections helpers
   - sorting helpers
   - stats helpers
   - defensive parsing enterprise ready

   USO:
   import {
     normalizeHomeDashboardModel,
     normalizeHomeWidgetModel,
     normalizeHomeWidgetsCollection,
     computeHomeWidgetsStats
   } from "./home.model.js";
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const DEFAULT_PAGE_SIZE = 6;
export const MAX_UNWRAP_DEPTH = 8;

export const WIDGET_STATUS = Object.freeze({
  ACTIVE: "active",
  WARNING: "warning",
  ERROR: "error",
  DISABLED: "disabled",
});

export const WIDGET_TYPE = Object.freeze({
  KPI: "kpi",
  METRIC: "metric",
  LIST: "list",
  TABLE: "table",
  ACTIVITY: "activity",
  SHORTCUT: "shortcut",
  WIDGET: "widget",
});

const EMPTY_DASHBOARD = Object.freeze({
  summary: {},
  widgets: [],
  recent: [],
});

/* =========================================================
   SAFE CORE
========================================================= */

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isBlank(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim() === "";
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function safeFiniteNumber(value, fallback = null) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeObject(value) {
  return isObject(value)
    ? value
    : {};
}

function first(...values) {
  for (const value of values) {
    if (isBlank(value)) {
      continue;
    }

    return value;
  }

  return null;
}

function unique(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    )
  );
}

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .trim();
}

function stableCompareByString(a = "", b = "") {
  return safeText(a, "").localeCompare(
    safeText(b, ""),
    "es",
    {
      sensitivity: "base",
      numeric: true,
    }
  );
}

/* =========================================================
   IDS / HASH
========================================================= */

function hashString(value = "") {
  const str = safeText(value, "onion");
  let hash = 0;

  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

function resolveEntityId(value = {}) {
  const item = safeObject(value);

  return safeText(
    first(
      item.widgetId,
      item.id,
      item.key,
      item.slug,
      item.code,
      item.uuid,
      item._id
    ),
    ""
  );
}

/* =========================================================
   LABEL MAPS
========================================================= */

export function normalizeWidgetStatus(value = "") {
  const key = normalizeKey(value);

  switch (key) {
    case "active":
    case "ok":
    case "ready":
    case "enabled":
    case "healthy":
    case "success":
    case "online":
    case "up":
    case "completed":
    case "complete":
    case "done":
      return WIDGET_STATUS.ACTIVE;

    case "warning":
    case "warn":
    case "pending":
    case "degraded":
    case "attention":
    case "review":
    case "queued":
    case "in_progress":
    case "progress":
      return WIDGET_STATUS.WARNING;

    case "error":
    case "critical":
    case "down":
    case "failed":
    case "failure":
    case "danger":
    case "offline":
    case "ko":
      return WIDGET_STATUS.ERROR;

    case "disabled":
    case "off":
    case "inactive":
    case "archived":
    case "deleted":
    case "blocked":
      return WIDGET_STATUS.DISABLED;

    default:
      return WIDGET_STATUS.ACTIVE;
  }
}

export function normalizeWidgetType(value = "") {
  const key = normalizeKey(value);

  switch (key) {
    case "kpi":
    case "stat":
    case "stats":
    case "counter":
      return WIDGET_TYPE.KPI;

    case "metric":
    case "metrics":
    case "number":
    case "amount":
      return WIDGET_TYPE.METRIC;

    case "list":
    case "collection":
    case "items":
      return WIDGET_TYPE.LIST;

    case "table":
    case "grid":
    case "rows":
      return WIDGET_TYPE.TABLE;

    case "activity":
    case "timeline":
    case "recent":
    case "recent_activity":
    case "log":
    case "events":
      return WIDGET_TYPE.ACTIVITY;

    case "shortcut":
    case "action":
    case "quick_action":
    case "quick":
    case "link":
    case "cta":
      return WIDGET_TYPE.SHORTCUT;

    default:
      return WIDGET_TYPE.WIDGET;
  }
}

export function getWidgetStatusLabel(value = "") {
  switch (normalizeWidgetStatus(value)) {
    case WIDGET_STATUS.ACTIVE:
      return "Activo";

    case WIDGET_STATUS.WARNING:
      return "Atención";

    case WIDGET_STATUS.ERROR:
      return "Error";

    case WIDGET_STATUS.DISABLED:
      return "Desactivado";

    default:
      return "Activo";
  }
}

export function getWidgetTypeLabel(value = "") {
  switch (normalizeWidgetType(value)) {
    case WIDGET_TYPE.KPI:
      return "KPI";

    case WIDGET_TYPE.METRIC:
      return "Métrica";

    case WIDGET_TYPE.LIST:
      return "Lista";

    case WIDGET_TYPE.TABLE:
      return "Tabla";

    case WIDGET_TYPE.ACTIVITY:
      return "Actividad";

    case WIDGET_TYPE.SHORTCUT:
      return "Acceso rápido";

    case WIDGET_TYPE.WIDGET:
      return "Widget";

    default:
      return "Widget";
  }
}

/* =========================================================
   DATES
========================================================= */

export function toDate(value = null) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function toTimestamp(value = null) {
  const date = toDate(value);

  return date
    ? date.getTime()
    : 0;
}

export function normalizeDateValue(...values) {
  return first(...values);
}

/* =========================================================
   INITIALS / THEME
========================================================= */

export function getInitials(value = "") {
  const text = safeText(value, "ON");
  const parts = text
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return "ON";
  }

  const initials = parts
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return initials || "ON";
}

export function getWidgetTheme(seed = "") {
  const themes = [
    "violet",
    "emerald",
    "blue",
    "amber",
    "rose",
    "purple",
    "cyan",
    "orange",
  ];

  return themes[
    hashString(seed) % themes.length
  ];
}

/* =========================================================
   TAGS
========================================================= */

function normalizeTagEntry(value = "") {
  if (isObject(value)) {
    return safeText(
      first(
        value.label,
        value.name,
        value.title,
        value.key,
        value.id
      ),
      ""
    );
  }

  return safeText(value, "");
}

function normalizeTags(value = null) {
  if (Array.isArray(value)) {
    return unique(
      value
        .map(normalizeTagEntry)
        .filter(Boolean)
    );
  }

  if (typeof value === "string") {
    return unique(
      value
        .split(/[,\|]/g)
        .map((tag) => safeText(tag, ""))
        .filter(Boolean)
    );
  }

  return [];
}

/* =========================================================
   RECENT / ACTIVITY
========================================================= */

function normalizeRecentEntry(row = {}) {
  const item =
    isObject(row)
      ? row
      : {
          title: row,
        };

  const createdAt = normalizeDateValue(
    item.createdAt,
    item.updatedAt,
    item.date,
    item.timestamp,
    item.time
  );

  return {
    id: safeText(
      first(
        item.id,
        item.eventId,
        item.code,
        item.key
      ),
      ""
    ),

    title: safeText(
      first(
        item.title,
        item.action,
        item.message,
        item.text,
        item.name,
        row
      ),
      "Evento"
    ),

    description: safeText(
      first(
        item.description,
        item.subtitle,
        item.summary,
        item.preview
      ),
      ""
    ),

    status: safeText(
      first(
        item.status,
        item.state,
        item.severity
      ),
      ""
    ),

    route: safeText(
      first(
        item.route,
        item.href,
        item.link,
        item.to
      ),
      ""
    ),

    createdAt,
    createdAtTs: toTimestamp(createdAt),

    raw: item,
  };
}

function normalizeRecentCollection(value) {
  return safeArray(value).map(
    normalizeRecentEntry
  );
}

/* =========================================================
   WIDGET ITEMS
========================================================= */

function normalizeWidgetItem(entry = {}) {
  const item =
    isObject(entry)
      ? entry
      : {
          title: entry,
        };

  const itemId = safeText(
    first(
      item.id,
      item.code,
      item.key,
      item.slug,
      item.uuid,
      item._id
    ),
    ""
  );

  const title = safeText(
    first(
      item.title,
      item.name,
      item.label,
      item.subject,
      entry
    ),
    itemId || "Elemento"
  );

  const description = safeText(
    first(
      item.description,
      item.subtitle,
      item.summary,
      item.preview,
      item.text
    ),
    ""
  );

  const status = safeText(
    first(
      item.status,
      item.state,
      item.estado
    ),
    ""
  );

  const route = safeText(
    first(
      item.route,
      item.href,
      item.link,
      item.to
    ),
    ""
  );

  const updatedAt = normalizeDateValue(
    item.updatedAt,
    item.createdAt,
    item.date,
    item.timestamp,
    item.time
  );

  return {
    id: itemId,
    title,
    description,
    status,
    route,
    updatedAt,
    updatedAtTs: toTimestamp(updatedAt),
    raw: item,
  };
}

function normalizeWidgetItems(value) {
  return safeArray(value).map(
    normalizeWidgetItem
  );
}

/* =========================================================
   SUMMARY
========================================================= */

function normalizeSummary(summary = {}) {
  const item = safeObject(summary);

  return {
    ticketsOpen: safeNumber(
      first(
        item.ticketsOpen,
        item.openTickets,
        item.open,
        item.abiertas,
        item.incidenciasAbiertas
      ),
      0
    ),

    ticketsPending: safeNumber(
      first(
        item.ticketsPending,
        item.pendingTickets,
        item.pending,
        item.pendientes,
        item.incidenciasPendientes
      ),
      0
    ),

    ticketsTotal: safeNumber(
      first(
        item.ticketsTotal,
        item.totalTickets,
        item.incidenciasTotal,
        item.incidencias
      ),
      0
    ),

    invoicesTotal: safeNumber(
      first(
        item.invoicesTotal,
        item.totalFacturas,
        item.facturasTotal,
        item.facturas
      ),
      0
    ),

    clientsTotal: safeNumber(
      first(
        item.clientsTotal,
        item.totalClientes,
        item.clientesTotal,
        item.clientes
      ),
      0
    ),

    usersTotal: safeNumber(
      first(
        item.usersTotal,
        item.totalUsuarios,
        item.usuariosTotal,
        item.usuarios
      ),
      0
    ),

    revenueTotal: safeNumber(
      first(
        item.revenueTotal,
        item.totalRevenue,
        item.totalImporte,
        item.importe,
        item.amount,
        item.totalAmount
      ),
      0
    ),

    raw: item,
  };
}

/* =========================================================
   WIDGET NORMALIZER
========================================================= */

export function normalizeHomeWidgetModel(payload = {}) {
  const item =
    isObject(payload)
      ? payload
      : {
          title: payload,
        };

  const widgetId = safeText(
    first(
      item.widgetId,
      item.id,
      item.key,
      item.slug,
      item.code,
      item.uuid,
      item._id
    ),
    ""
  );

  const title = safeText(
    first(
      item.title,
      item.name,
      item.label,
      item.heading
    ),
    "Bloque"
  );

  const description = safeText(
    first(
      item.description,
      item.descripcion,
      item.subtitle,
      item.summary,
      item.text
    ),
    "Sin descripción."
  );

  const type = normalizeWidgetType(
    first(
      item.type,
      item.kind,
      item.variant,
      item.category,
      item.widgetType
    )
  );

  const status = normalizeWidgetStatus(
    first(
      item.status,
      item.estado,
      item.state,
      item.health,
      item.severity,
      item.enabled === false ? "disabled" : null,
      item.disabled === true ? "disabled" : null
    )
  );

  const value = first(
    item.value,
    item.total,
    item.amount,
    item.count,
    item.metric,
    item.number
  );

  const trend = first(
    item.trend,
    item.delta,
    item.change,
    item.variation,
    item.diff
  );

  const route = safeText(
    first(
      item.route,
      item.href,
      item.link,
      item.to,
      item.path
    ),
    ""
  );

  const icon = safeText(
    first(
      item.icon,
      item.emoji,
      item.symbol
    ),
    ""
  );

  const updatedAt = normalizeDateValue(
    item.updatedAt,
    item.lastUpdate,
    item.modifiedAt,
    item.createdAt,
    item.date,
    item.timestamp
  );

  const tags = normalizeTags(
    first(
      item.tags,
      item.labels,
      item.badges
    )
  );

  const items = normalizeWidgetItems(
    first(
      item.items,
      item.rows,
      item.list,
      item.data,
      item.children
    )
  );

  const initials = getInitials(
    title ||
      widgetId ||
      "ON"
  );

  const theme = getWidgetTheme(
    widgetId ||
      title ||
      route
  );

  const numericValue =
    safeFiniteNumber(value, null);

  const numericTrend =
    safeFiniteNumber(trend, null);

  const hasValue =
    value !== null &&
    value !== undefined &&
    String(value).trim() !== "";

  const hasTrend =
    trend !== null &&
    trend !== undefined &&
    String(trend).trim() !== "";

  const isActive =
    status === WIDGET_STATUS.ACTIVE;

  const isWarning =
    status === WIDGET_STATUS.WARNING;

  const isError =
    status === WIDGET_STATUS.ERROR;

  const isDisabled =
    status === WIDGET_STATUS.DISABLED;

  const isKpi =
    type === WIDGET_TYPE.KPI;

  const isMetric =
    type === WIDGET_TYPE.METRIC;

  const isList =
    type === WIDGET_TYPE.LIST;

  const isTable =
    type === WIDGET_TYPE.TABLE;

  const isActivity =
    type === WIDGET_TYPE.ACTIVITY;

  const isShortcut =
    type === WIDGET_TYPE.SHORTCUT;

  const hasRoute = Boolean(route);
  const hasItems = items.length > 0;

  const isPositiveTrend =
    Number.isFinite(numericTrend) &&
    numericTrend > 0;

  const isNegativeTrend =
    Number.isFinite(numericTrend) &&
    numericTrend < 0;

  return {
    /* identity */
    widgetId,
    id: widgetId,

    key: safeText(
      first(
        item.key,
        widgetId
      ),
      widgetId
    ),

    slug: safeText(
      first(
        item.slug,
        widgetId
      ),
      widgetId
    ),

    code: safeText(
      first(
        item.code,
        widgetId
      ),
      widgetId
    ),

    /* content */
    title,
    description,
    icon,

    /* enums */
    type,
    typeLabel: getWidgetTypeLabel(type),

    status,
    statusLabel: getWidgetStatusLabel(status),

    /* values */
    value,

    numericValue,

    trend,

    numericTrend,

    /* route */
    route,

    /* visuals */
    initials,
    theme,

    /* collections */
    tags,
    tagsCount: tags.length,

    items,
    itemsCount: items.length,

    /* dates */
    updatedAt,
    updatedAtTs: toTimestamp(updatedAt),

    /* flags */
    hasValue,
    hasTrend,
    hasRoute,
    hasItems,

    isActive,
    isWarning,
    isError,
    isDisabled,

    isKpi,
    isMetric,
    isList,
    isTable,
    isActivity,
    isShortcut,

    isPositiveTrend,
    isNegativeTrend,

    /* raw */
    raw: item,
  };
}

/* =========================================================
   DASHBOARD UNWRAP
========================================================= */

function looksLikeDashboard(value = null) {
  const obj = safeObject(value);

  return Boolean(
    Array.isArray(obj.widgets) ||
      Array.isArray(obj.cards) ||
      Array.isArray(obj.kpis) ||
      Array.isArray(obj.items) ||
      Array.isArray(obj.recent) ||
      Array.isArray(obj.recentActivity) ||
      Array.isArray(obj.activity) ||
      Array.isArray(obj.timeline) ||
      isObject(obj.summary) ||
      isObject(obj.stats) ||
      isObject(obj.metrics) ||
      isObject(obj.totals)
  );
}

function unwrapObjectPayload(payload = null, depth = 0) {
  if (depth > MAX_UNWRAP_DEPTH) {
    return safeObject(payload);
  }

  if (!payload) {
    return {};
  }

  if (Array.isArray(payload)) {
    return {
      widgets: payload,
    };
  }

  const obj = safeObject(payload);

  if (!Object.keys(obj).length) {
    return {};
  }

  if (looksLikeDashboard(obj)) {
    return obj;
  }

  const candidates = [
    obj.dashboard,
    obj.data,
    obj.payload,
    obj.result,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const unwrapped =
      unwrapObjectPayload(
        candidate,
        depth + 1
      );

    if (
      looksLikeDashboard(unwrapped) ||
      Object.keys(unwrapped).length
    ) {
      return unwrapped;
    }
  }

  return obj;
}

export function unwrapHomeDashboardPayload(payload = null) {
  return unwrapObjectPayload(payload, 0);
}

/* =========================================================
   DASHBOARD NORMALIZER
========================================================= */

export function normalizeHomeDashboardModel(payload = {}) {
  const root = safeObject(
    unwrapHomeDashboardPayload(payload)
  );

  const summary = normalizeSummary(
    first(
      root.summary,
      root.stats,
      root.metrics,
      root.totals
    )
  );

  const widgets = safeArray(
    first(
      root.widgets,
      root.cards,
      root.kpis,
      root.items
    )
  ).map(
    normalizeHomeWidgetModel
  );

  const recent = normalizeRecentCollection(
    first(
      root.recent,
      root.recentActivity,
      root.activity,
      root.timeline
    )
  );

  const requestId = safeText(
    first(
      root.requestId,
      root.correlationId,
      root.traceId,
      root.meta?.requestId,
      root.meta?.correlationId
    ),
    ""
  );

  const updatedAt = normalizeDateValue(
    root.updatedAt,
    root.lastUpdate,
    root.generatedAt,
    root.createdAt,
    root.date,
    root.timestamp
  );

  return {
    summary,
    widgets,
    recent,

    widgetsCount: widgets.length,
    recentCount: recent.length,

    requestId,
    updatedAt,
    updatedAtTs: toTimestamp(updatedAt),

    hasWidgets: widgets.length > 0,
    hasRecent: recent.length > 0,

    raw: root,
  };
}

/* =========================================================
   COLLECTION UNWRAP / NORMALIZER
========================================================= */

export function unwrapHomeWidgetsPayload(payload = null) {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  const direct = first(
    obj.widgets,
    obj.cards,
    obj.kpis,
    obj.items
  );

  if (Array.isArray(direct)) {
    return direct;
  }

  const candidates = [
    obj.data,
    obj.payload,
    obj.result,
    obj.dashboard,
  ];

  for (const candidate of candidates) {
    const nested =
      unwrapHomeWidgetsPayload(candidate);

    if (nested.length) {
      return nested;
    }
  }

  return [];
}

export function normalizeHomeWidgetsCollection(payload = []) {
  return unwrapHomeWidgetsPayload(payload).map(
    normalizeHomeWidgetModel
  );
}

/* =========================================================
   SORT
========================================================= */

function sortStable(items = [], compareFn) {
  return safeArray(items)
    .map((item, index) => ({
      item,
      index,
    }))
    .sort((a, b) => {
      const result =
        compareFn(a.item, b.item);

      return result === 0
        ? a.index - b.index
        : result;
    })
    .map(({ item }) => item);
}

export function sortHomeWidgetsByUpdatedDesc(items = []) {
  return sortStable(
    items,
    (a, b) =>
      safeNumber(b.updatedAtTs, 0) -
      safeNumber(a.updatedAtTs, 0)
  );
}

export function sortHomeWidgetsByValueDesc(items = []) {
  return sortStable(
    items,
    (a, b) =>
      safeNumber(
        b.numericValue,
        Number.NEGATIVE_INFINITY
      ) -
      safeNumber(
        a.numericValue,
        Number.NEGATIVE_INFINITY
      )
  );
}

export function sortHomeWidgetsByTrendDesc(items = []) {
  return sortStable(
    items,
    (a, b) =>
      safeNumber(
        b.numericTrend,
        Number.NEGATIVE_INFINITY
      ) -
      safeNumber(
        a.numericTrend,
        Number.NEGATIVE_INFINITY
      )
  );
}

export function sortHomeWidgetsByTitleAsc(items = []) {
  return sortStable(
    items,
    (a, b) =>
      stableCompareByString(
        a.title,
        b.title
      )
  );
}

/* =========================================================
   PAGINATION
========================================================= */

export function paginateHomeWidgets(
  items = [],
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE
) {
  const list = safeArray(items);

  const size = Math.max(
    1,
    safeNumber(
      pageSize,
      DEFAULT_PAGE_SIZE
    )
  );

  const total = list.length;

  const totalPages = Math.max(
    1,
    Math.ceil(total / size)
  );

  const current = Math.min(
    Math.max(
      1,
      safeNumber(page, 1)
    ),
    totalPages
  );

  const start =
    (current - 1) * size;

  const end =
    start + size;

  return {
    page: current,
    pageSize: size,
    total,
    totalPages,

    hasPrev: current > 1,
    hasNext: current < totalPages,

    prevPage:
      current > 1
        ? current - 1
        : null,

    nextPage:
      current < totalPages
        ? current + 1
        : null,

    items: list.slice(start, end),

    from:
      total === 0
        ? 0
        : start + 1,

    to: Math.min(end, total),
  };
}

/* =========================================================
   STATS
========================================================= */

export function computeHomeWidgetsStats(items = []) {
  const list = safeArray(items);

  const numericValues = list
    .map((item) => item.numericValue)
    .filter(Number.isFinite);

  const numericTrends = list
    .map((item) => item.numericTrend)
    .filter(Number.isFinite);

  const sumValues = numericValues.reduce(
    (acc, value) => acc + value,
    0
  );

  const sumTrends = numericTrends.reduce(
    (acc, value) => acc + value,
    0
  );

  return {
    total: list.length,

    active: list.filter((x) => x.isActive).length,
    warning: list.filter((x) => x.isWarning).length,
    error: list.filter((x) => x.isError).length,
    disabled: list.filter((x) => x.isDisabled).length,

    withRoute: list.filter((x) => x.hasRoute).length,
    withItems: list.filter((x) => x.hasItems).length,
    withValue: list.filter((x) => x.hasValue).length,
    withTrend: list.filter((x) => x.hasTrend).length,

    kpis: list.filter((x) => x.isKpi).length,
    metrics: list.filter((x) => x.isMetric).length,
    lists: list.filter((x) => x.isList).length,
    tables: list.filter((x) => x.isTable).length,
    activities: list.filter((x) => x.isActivity).length,
    shortcuts: list.filter((x) => x.isShortcut).length,

    positiveTrend: list.filter((x) => x.isPositiveTrend).length,
    negativeTrend: list.filter((x) => x.isNegativeTrend).length,

    sumValues,
    averageValue:
      numericValues.length
        ? sumValues / numericValues.length
        : 0,

    sumTrends,
    averageTrend:
      numericTrends.length
        ? sumTrends / numericTrends.length
        : 0,
  };
}

/* =========================================================
   FINDERS
========================================================= */

export function findHomeWidgetById(items = [], widgetId = "") {
  const id = safeText(widgetId, "");

  if (!id) {
    return null;
  }

  return (
    safeArray(items).find((item) => {
      const candidates = [
        item.widgetId,
        item.id,
        item.key,
        item.slug,
        item.code,
        item.raw?.widgetId,
        item.raw?.id,
        item.raw?.key,
        item.raw?.slug,
        item.raw?.code,
      ];

      return candidates.some(
        (candidate) =>
          safeText(candidate, "") === id
      );
    }) || null
  );
}

export function filterHomeWidgetsByStatus(items = [], status = "") {
  const normalized =
    normalizeWidgetStatus(status);

  return safeArray(items).filter(
    (item) =>
      normalizeWidgetStatus(item.status) === normalized
  );
}

export function filterHomeWidgetsByType(items = [], type = "") {
  const normalized =
    normalizeWidgetType(type);

  return safeArray(items).filter(
    (item) =>
      normalizeWidgetType(item.type) === normalized
  );
}

export function searchHomeWidgets(items = [], query = "") {
  const q = safeText(query, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (!q) {
    return safeArray(items);
  }

  return safeArray(items).filter((item) => {
    const haystack = [
      item.widgetId,
      item.id,
      item.key,
      item.slug,
      item.code,
      item.title,
      item.description,
      item.type,
      item.status,
      item.route,
      ...safeArray(item.tags),
    ]
      .map((value) =>
        safeText(value, "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
      )
      .join(" ");

    return haystack.includes(q);
  });
}

/* =========================================================
   EMPTY FACTORY
========================================================= */

export function createEmptyHomeDashboardModel() {
  return normalizeHomeDashboardModel(
    EMPTY_DASHBOARD
  );
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  DEFAULT_PAGE_SIZE,

  WIDGET_STATUS,
  WIDGET_TYPE,

  normalizeHomeDashboardModel,
  normalizeHomeWidgetModel,
  normalizeHomeWidgetsCollection,

  unwrapHomeDashboardPayload,
  unwrapHomeWidgetsPayload,

  sortHomeWidgetsByUpdatedDesc,
  sortHomeWidgetsByValueDesc,
  sortHomeWidgetsByTrendDesc,
  sortHomeWidgetsByTitleAsc,

  paginateHomeWidgets,
  computeHomeWidgetsStats,

  findHomeWidgetById,
  filterHomeWidgetsByStatus,
  filterHomeWidgetsByType,
  searchHomeWidgets,

  getWidgetStatusLabel,
  getWidgetTypeLabel,
  normalizeWidgetStatus,
  normalizeWidgetType,

  getInitials,
  getWidgetTheme,

  toDate,
  toTimestamp,

  createEmptyHomeDashboardModel,
};
