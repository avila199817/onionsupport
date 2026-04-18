/* =========================================================
   Onion SPA - Home Model
   Archivo: src/views/home/home.model.js

   FULL PRO 10/10

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

/* =========================================================
   SAFE CORE
========================================================= */

function safeText(value, fallback = "") {
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
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
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
   IDS / HASH
========================================================= */

function hashString(value = "") {
  const str = String(value || "onion");
  let hash = 0;

  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

/* =========================================================
   LABEL MAPS
========================================================= */

export function normalizeWidgetStatus(value = "") {
  const key = safeText(value).toLowerCase();

  switch (key) {
    case "active":
    case "ok":
    case "ready":
    case "enabled":
      return WIDGET_STATUS.ACTIVE;

    case "warning":
    case "pending":
    case "degraded":
      return WIDGET_STATUS.WARNING;

    case "error":
    case "critical":
    case "down":
      return WIDGET_STATUS.ERROR;

    case "disabled":
    case "off":
      return WIDGET_STATUS.DISABLED;

    default:
      return WIDGET_STATUS.ACTIVE;
  }
}

export function normalizeWidgetType(value = "") {
  const key = safeText(value).toLowerCase();

  switch (key) {
    case "kpi":
      return WIDGET_TYPE.KPI;

    case "metric":
      return WIDGET_TYPE.METRIC;

    case "list":
      return WIDGET_TYPE.LIST;

    case "table":
      return WIDGET_TYPE.TABLE;

    case "activity":
    case "timeline":
    case "recent":
      return WIDGET_TYPE.ACTIVITY;

    case "shortcut":
    case "action":
    case "quick_action":
    case "quick-action":
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
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function toTimestamp(value = null) {
  const date = toDate(value);
  return date ? date.getTime() : 0;
}

/* =========================================================
   INITIALS / THEME
========================================================= */

export function getInitials(value = "") {
  const text = safeText(value, "ON");

  const parts = text.split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return "ON";
  }

  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (initials || "ON").toUpperCase();
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
   RECENT / ACTIVITY
========================================================= */

function normalizeRecentEntry(row = {}) {
  const item = safeObject(row);

  return {
    id: safeText(
      first(
        item.id,
        item.eventId,
        item.code
      ),
      ""
    ),

    title: safeText(
      first(
        item.title,
        item.action,
        item.message,
        item.text,
        item.name
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
        item.state
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

    createdAt: first(
      item.createdAt,
      item.updatedAt,
      item.date,
      item.timestamp
    ),

    createdAtTs: toTimestamp(
      first(
        item.createdAt,
        item.updatedAt,
        item.date,
        item.timestamp
      )
    ),

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
  const item = safeObject(entry);

  const itemId = safeText(
    first(
      item.id,
      item.code,
      item.key,
      item.slug
    ),
    ""
  );

  const title = safeText(
    first(
      item.title,
      item.name,
      item.label,
      item.subject
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
      item.state
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

  const updatedAt = first(
    item.updatedAt,
    item.createdAt,
    item.date,
    item.timestamp
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
        item.abiertas
      ),
      0
    ),

    ticketsPending: safeNumber(
      first(
        item.ticketsPending,
        item.pendingTickets,
        item.pending,
        item.pendientes
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
        item.importe
      ),
      0
    ),

    raw: item,
  };
}

/* =========================================================
   WIDGET NORMALIZER
========================================================= */

export function normalizeHomeWidgetModel(
  payload = {}
) {
  const item = safeObject(payload);

  const widgetId = safeText(
    first(
      item.widgetId,
      item.id,
      item.key,
      item.slug,
      item.code
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
      item.category
    )
  );

  const status = normalizeWidgetStatus(
    first(
      item.status,
      item.estado,
      item.state
    )
  );

  const value = first(
    item.value,
    item.total,
    item.amount,
    item.count,
    item.metric
  );

  const trend = first(
    item.trend,
    item.delta,
    item.change,
    item.variation
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

  const icon = safeText(
    first(
      item.icon,
      item.emoji,
      item.symbol
    ),
    ""
  );

  const updatedAt = first(
    item.updatedAt,
    item.lastUpdate,
    item.modifiedAt,
    item.createdAt
  );

  const tagsRaw = first(
    item.tags,
    item.labels,
    item.badges
  );

  const tags = Array.isArray(tagsRaw)
    ? tagsRaw
        .map((tag) => safeText(tag, ""))
        .filter(Boolean)
    : typeof tagsRaw === "string"
      ? tagsRaw
          .split(",")
          .map((tag) => safeText(tag, ""))
          .filter(Boolean)
      : [];

  const items = normalizeWidgetItems(
    first(
      item.items,
      item.rows,
      item.list,
      item.data
    )
  );

  const initials = getInitials(
    title || widgetId || "ON"
  );

  const theme = getWidgetTheme(
    widgetId || title || route
  );

  const numericValue = Number(value);
  const numericTrend = Number(trend);

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

    /* content */
    title,
    description,
    icon,

    /* enums */
    type,
    typeLabel:
      getWidgetTypeLabel(type),

    status,
    statusLabel:
      getWidgetStatusLabel(status),

    /* values */
    value,
    numericValue:
      Number.isFinite(numericValue)
        ? numericValue
        : null,

    trend,
    numericTrend:
      Number.isFinite(numericTrend)
        ? numericTrend
        : null,

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
    updatedAtTs:
      toTimestamp(updatedAt),

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
   DASHBOARD NORMALIZER
========================================================= */

export function unwrapHomeDashboardPayload(
  payload = null
) {
  if (!payload) return {};

  if (Array.isArray(payload)) {
    return {
      widgets: payload,
    };
  }

  const obj = safeObject(payload);

  if (
    obj.data &&
    typeof obj.data === "object"
  ) {
    return unwrapHomeDashboardPayload(
      obj.data
    );
  }

  if (
    obj.payload &&
    typeof obj.payload === "object"
  ) {
    return unwrapHomeDashboardPayload(
      obj.payload
    );
  }

  if (
    obj.result &&
    typeof obj.result === "object"
  ) {
    return unwrapHomeDashboardPayload(
      obj.result
    );
  }

  if (
    obj.dashboard &&
    typeof obj.dashboard === "object"
  ) {
    return unwrapHomeDashboardPayload(
      obj.dashboard
    );
  }

  return obj;
}

export function normalizeHomeDashboardModel(
  payload = {}
) {
  const root =
    safeObject(
      unwrapHomeDashboardPayload(
        payload
      )
    );

  const summary = normalizeSummary(
    first(
      root.summary,
      root.stats,
      root.metrics,
      root.totals
    )
  );

  const widgets =
    safeArray(
      first(
        root.widgets,
        root.cards,
        root.kpis,
        root.items
      )
    ).map(
      normalizeHomeWidgetModel
    );

  const recent =
    normalizeRecentCollection(
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
      root.meta?.requestId
    ),
    ""
  );

  const updatedAt = first(
    root.updatedAt,
    root.lastUpdate,
    root.generatedAt,
    root.createdAt
  );

  return {
    summary,
    widgets,
    recent,

    widgetsCount:
      widgets.length,

    recentCount:
      recent.length,

    requestId,
    updatedAt,
    updatedAtTs:
      toTimestamp(updatedAt),

    raw: root,
  };
}

/* =========================================================
   COLLECTION NORMALIZER
========================================================= */

export function unwrapHomeWidgetsPayload(
  payload = null
) {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (
    Array.isArray(obj.widgets)
  ) {
    return obj.widgets;
  }

  if (
    Array.isArray(obj.cards)
  ) {
    return obj.cards;
  }

  if (
    Array.isArray(obj.kpis)
  ) {
    return obj.kpis;
  }

  if (
    Array.isArray(obj.items)
  ) {
    return obj.items;
  }

  if (
    obj.data &&
    typeof obj.data === "object"
  ) {
    return unwrapHomeWidgetsPayload(
      obj.data
    );
  }

  if (
    obj.payload &&
    typeof obj.payload === "object"
  ) {
    return unwrapHomeWidgetsPayload(
      obj.payload
    );
  }

  return [];
}

export function normalizeHomeWidgetsCollection(
  payload = []
) {
  return unwrapHomeWidgetsPayload(
    payload
  ).map(
    normalizeHomeWidgetModel
  );
}

/* =========================================================
   SORT
========================================================= */

export function sortHomeWidgetsByUpdatedDesc(
  items = []
) {
  return [...safeArray(items)].sort(
    (a, b) =>
      safeNumber(
        b.updatedAtTs
      ) -
      safeNumber(
        a.updatedAtTs
      )
  );
}

export function sortHomeWidgetsByValueDesc(
  items = []
) {
  return [...safeArray(items)].sort(
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

export function sortHomeWidgetsByTrendDesc(
  items = []
) {
  return [...safeArray(items)].sort(
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

/* =========================================================
   PAGINATION
========================================================= */

export function paginateHomeWidgets(
  items = [],
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE
) {
  const list =
    safeArray(items);

  const size = Math.max(
    1,
    safeNumber(
      pageSize,
      DEFAULT_PAGE_SIZE
    )
  );

  const total =
    list.length;

  const totalPages =
    Math.max(
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
    items:
      list.slice(
        start,
        end
      ),
    from:
      total === 0
        ? 0
        : start + 1,
    to: Math.min(
      end,
      total
    ),
  };
}

/* =========================================================
   STATS
========================================================= */

export function computeHomeWidgetsStats(
  items = []
) {
  const list =
    safeArray(items);

  return {
    total:
      list.length,

    active:
      list.filter(
        (x) => x.isActive
      ).length,

    warning:
      list.filter(
        (x) => x.isWarning
      ).length,

    error:
      list.filter(
        (x) => x.isError
      ).length,

    disabled:
      list.filter(
        (x) => x.isDisabled
      ).length,

    withRoute:
      list.filter(
        (x) => x.hasRoute
      ).length,

    withItems:
      list.filter(
        (x) => x.hasItems
      ).length,

    kpis:
      list.filter(
        (x) => x.isKpi
      ).length,

    metrics:
      list.filter(
        (x) => x.isMetric
      ).length,

    lists:
      list.filter(
        (x) => x.isList
      ).length,

    tables:
      list.filter(
        (x) => x.isTable
      ).length,

    shortcuts:
      list.filter(
        (x) => x.isShortcut
      ).length,
  };
}

/* =========================================================
   FINDERS
========================================================= */

export function findHomeWidgetById(
  items = [],
  widgetId = ""
) {
  const id = safeText(
    widgetId,
    ""
  );

  if (!id) return null;

  return (
    safeArray(items).find(
      (item) =>
        safeText(
          item.widgetId
        ) === id
    ) || null
  );
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  DEFAULT_PAGE_SIZE,
  normalizeHomeDashboardModel,
  normalizeHomeWidgetModel,
  normalizeHomeWidgetsCollection,
  unwrapHomeDashboardPayload,
  unwrapHomeWidgetsPayload,
  sortHomeWidgetsByUpdatedDesc,
  sortHomeWidgetsByValueDesc,
  sortHomeWidgetsByTrendDesc,
  paginateHomeWidgets,
  computeHomeWidgetsStats,
  findHomeWidgetById,
  getWidgetStatusLabel,
  getWidgetTypeLabel,
  normalizeWidgetStatus,
  normalizeWidgetType,
  getInitials,
  getWidgetTheme,
};
