/* =========================================================
   Onion SPA - Home Selectors / Data Helpers
   Archivo: src/views/home/home.selectors.js

   FINAL PRO SYSTEM · HOME DATA LAYER · TEMPLATE TRIM PATCH

   RESPONSABILIDADES:
   - sacar del template toda la lógica pesada de lectura/normalización
   - centralizar helpers puros de dashboard/home
   - resolver dashboard/summary/widgets/collections
   - calcular métricas home admin/user
   - resolver usuario/rol/avatar
   - normalizar tickets/facturas/clientes/usuarios/actividad
   - paginación visual estable
   - formatters reutilizables
   - evitar que un 0 prematuro tape valores reales de widgets/summary
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const DEFAULT_PAGE_SIZE = 5;
export const DEFAULT_CURRENCY = "EUR";

export const HOME_ROUTES = Object.freeze({
  HOME: "/",
  INCIDENCIAS: "/incidencias",
  FACTURAS: "/facturas",
  USUARIOS: "/usuarios",
  CLIENTES: "/clientes",
  CUENTA: "/cuenta",
  AJUSTES: "/ajustes",
});

export const ADMIN_ROLE_KEYS = Object.freeze([
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
  "super_administrador",
  "owner",
  "root",
  "staff",
  "support",
  "soporte",
  "tecnico",
  "técnico",
]);

export const TICKET_OPEN_KEYS = Object.freeze([
  "open",
  "pending",
  "progress",
]);

export const TICKET_CLOSED_KEYS = Object.freeze([
  "resolved",
  "closed",
]);

const AVATAR_PALETTE = Object.freeze([
  ["#7c3aed", "#ec4899"],
  ["#2563eb", "#06b6d4"],
  ["#f97316", "#ef4444"],
  ["#16a34a", "#14b8a6"],
  ["#db2777", "#9333ea"],
  ["#ca8a04", "#ea580c"],
  ["#0891b2", "#4f46e5"],
  ["#e11d48", "#f59e0b"],
  ["#0f766e", "#84cc16"],
  ["#4338ca", "#c026d3"],
]);

/* =========================================================
   SAFE HELPERS
========================================================= */

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  return text || fallback;
}

export function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "string") {
    let normalized = value
      .trim()
      .replace(/€/g, "")
      .replace(/\$/g, "")
      .replace(/£/g, "")
      .replace(/%/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s/g, "");

    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
      const lastComma = normalized.lastIndexOf(",");
      const lastDot = normalized.lastIndexOf(".");

      if (lastComma > lastDot) {
        normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
      } else {
        normalized = normalized.replace(/,/g, "");
      }
    } else if (hasComma) {
      normalized = normalized.replace(/,/g, ".");
    }

    const n = Number(normalized);

    return Number.isFinite(n) ? n : fallback;
  }

  const n = Number(value);

  return Number.isFinite(n) ? n : fallback;
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

export function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    if (isObject(value) && Object.keys(value).length === 0) {
      continue;
    }

    return value;
  }

  return null;
}

export function normalizeWhitespace(value = "") {
  return safeText(value, "").replace(/\s+/g, " ").trim();
}

export function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function clampNumber(value = 0, min = 0, max = Number.POSITIVE_INFINITY) {
  const n = safeNumber(value, min);
  return Math.min(Math.max(n, min), max);
}

export function roundMoney(value = 0) {
  const n = safeNumber(value, NaN);

  if (!Number.isFinite(n)) return 0;

  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function getPath(object = {}, path = "") {
  const root = safeObject(object, null);
  const cleanPath = safeText(path, "");

  if (!root || !cleanPath) return undefined;

  return cleanPath.split(".").reduce((acc, segment) => {
    if (acc === null || acc === undefined) return undefined;
    return acc?.[segment];
  }, root);
}

export function firstPath(object = {}, paths = []) {
  return first(...safeArray(paths).map((path) => getPath(object, path)));
}

export function uniqueBy(items = [], picker = (item) => item) {
  const rows = safeArray(items);
  const seen = new Set();
  const output = [];

  for (const item of rows) {
    const key = safeText(picker(item), "");

    if (!key) {
      output.push(item);
      continue;
    }

    if (seen.has(key)) continue;

    seen.add(key);
    output.push(item);
  }

  return output;
}

export function hashString(value = "") {
  const text = safeText(value, "onion");
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }

  return Math.abs(hash >>> 0);
}

export function toTimestamp(value = null) {
  if (!value) return 0;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 0 : value.getTime();
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

  const esMatch = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*|\s+)?(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (esMatch) {
    const [, dd, mm, yyyy, hh = "0", min = "0", ss = "0"] = esMatch;

    const date = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(min),
      Number(ss)
    );

    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  const date = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function normalizeRoute(route = "") {
  const raw = safeText(route, "");

  if (!raw) return "";

  const lowered = raw.toLowerCase();

  if (
    lowered.startsWith("javascript:") ||
    lowered.startsWith("mailto:") ||
    lowered.startsWith("tel:")
  ) {
    return "";
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  return raw.startsWith("/") ? raw : `/${raw}`;
}

export function isSameIdentity(a = "", b = "") {
  const left = normalizeText(a);
  const right = normalizeText(b);

  return Boolean(left && right && left === right);
}

/* =========================================================
   FORMATTERS
========================================================= */

const numberFormatterCache = new Map();
const moneyFormatterCache = new Map();
const dateFormatterCache = new Map();

export function getNumberFormatter() {
  const key = "es-ES:number";

  if (numberFormatterCache.has(key)) {
    return numberFormatterCache.get(key);
  }

  const formatter = new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 0,
  });

  numberFormatterCache.set(key, formatter);

  return formatter;
}

export function formatNumber(value = 0) {
  const amount = safeNumber(value, NaN);

  if (!Number.isFinite(amount)) return "0";

  try {
    return getNumberFormatter().format(amount);
  } catch {
    return String(Math.round(amount));
  }
}

export function getMoneyFormatter(currency = DEFAULT_CURRENCY) {
  const code = safeText(currency, DEFAULT_CURRENCY).toUpperCase();

  if (moneyFormatterCache.has(code)) {
    return moneyFormatterCache.get(code);
  }

  const formatter = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  moneyFormatterCache.set(code, formatter);

  return formatter;
}

export function formatMoney(value = 0, currency = DEFAULT_CURRENCY) {
  const amount = safeNumber(value, NaN);

  if (!Number.isFinite(amount)) return "—";

  const code = safeText(currency, DEFAULT_CURRENCY).toUpperCase();

  try {
    return getMoneyFormatter(code).format(amount);
  } catch {
    return `${amount.toFixed(2).replace(".", ",")} ${code}`;
  }
}

export function getDateTimeFormatter() {
  const key = "es-ES:date-time";

  if (dateFormatterCache.has(key)) {
    return dateFormatterCache.get(key);
  }

  const formatter = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  dateFormatterCache.set(key, formatter);

  return formatter;
}

export function getDateFormatter() {
  const key = "es-ES:date";

  if (dateFormatterCache.has(key)) {
    return dateFormatterCache.get(key);
  }

  const formatter = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  dateFormatterCache.set(key, formatter);

  return formatter;
}

export function formatDateTime(value = null) {
  const ts = toTimestamp(value);

  if (!ts) return "—";

  try {
    return getDateTimeFormatter().format(new Date(ts));
  } catch {
    return "—";
  }
}

export function formatDateShort(value = null) {
  const ts = toTimestamp(value);

  if (!ts) return "—";

  try {
    return getDateFormatter().format(new Date(ts));
  } catch {
    return "—";
  }
}

export function formatRelativeDate(value = null) {
  const ts = toTimestamp(value);

  if (!ts) return "Sin fecha";

  const diffMs = ts - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const absMin = Math.abs(diffMin);

  if (absMin < 1) return "Ahora mismo";

  if (absMin < 60) {
    return diffMin > 0 ? `En ${absMin} min` : `Hace ${absMin} min`;
  }

  const diffHours = Math.round(absMin / 60);

  if (diffHours < 24) {
    return diffMin > 0 ? `En ${diffHours} h` : `Hace ${diffHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);

  if (diffDays <= 7) {
    return diffMin > 0
      ? `En ${diffDays} día${diffDays === 1 ? "" : "s"}`
      : `Hace ${diffDays} día${diffDays === 1 ? "" : "s"}`;
  }

  return formatDateShort(value);
}

export function formatLastUpdate(value = null) {
  const ts = toTimestamp(value);

  if (!ts) return "Sin fecha";

  const diffHours = Math.abs(Date.now() - ts) / 3600000;

  if (diffHours <= 72) {
    return formatRelativeDate(value);
  }

  return formatDateTime(value);
}

/* =========================================================
   AVATAR HELPERS
========================================================= */

export function getAvatarStyle(seed = "") {
  const [a, b] = AVATAR_PALETTE[hashString(seed) % AVATAR_PALETTE.length];

  return [
    `--home-avatar-a:${a}`,
    `--home-avatar-b:${b}`,
    `--home-avatar-bg:linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
  ].join(";");
}

export function getInitials(value = "") {
  const text = normalizeWhitespace(value);

  if (!text) return "ON";

  const parts = text.split(" ").filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "ON";
}

/* =========================================================
   DASHBOARD / SUMMARY
========================================================= */

export function getDashboard(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);

  return safeObject(
    first(
      data.dashboard,
      state.dashboard,
      data.raw?.dashboard,
      data.payload?.dashboard,
      data.result?.dashboard,
      data.response?.dashboard,
      {}
    )
  );
}

export function getSummary(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  const dashboard = getDashboard(data);

  return safeObject(
    first(
      data.summary,
      data.stats,
      data.metrics,
      data.totals,
      data.counts,
      state.summary,
      state.stats,
      state.metrics,
      state.totals,
      state.counts,
      dashboard.summary,
      dashboard.stats,
      dashboard.metrics,
      dashboard.totals,
      dashboard.counts,
      data.raw?.summary,
      data.raw?.stats,
      data.payload?.summary,
      data.payload?.stats,
      data.result?.summary,
      data.response?.summary,
      {}
    )
  );
}

export function getSummaryValue(input = {}, keys = [], fallback = null) {
  const data = safeObject(input);
  const summary = getSummary(data);
  const dashboard = getDashboard(data);
  const state = safeObject(data.state);
  const payload = safeObject(data.payload);
  const raw = safeObject(data.raw);
  const result = safeObject(data.result);
  const response = safeObject(data.response);

  const sources = [
    summary,
    dashboard,
    state,
    payload,
    raw,
    result,
    response,
    data,
  ];

  const candidates = [];

  for (const key of safeArray(keys)) {
    for (const source of sources) {
      candidates.push(source?.[key]);

      if (key.includes(".")) {
        candidates.push(getPath(source, key));
      }
    }
  }

  return first(...candidates, fallback);
}

/**
 * Variante fuerte para métricas:
 * - lee summary/dashboard/state/raw/data
 * - acepta widgets como candidato extra
 * - si hay valores positivos, prioriza el mayor positivo
 * - evita que un 0 antiguo tape un valor real posterior
 */
export function getBestSummaryNumber(input = {}, keys = [], fallback = 0, extraCandidates = []) {
  const data = safeObject(input);
  const summary = getSummary(data);
  const dashboard = getDashboard(data);
  const state = safeObject(data.state);
  const payload = safeObject(data.payload);
  const raw = safeObject(data.raw);
  const result = safeObject(data.result);
  const response = safeObject(data.response);

  const sources = [
    summary,
    dashboard,
    state,
    payload,
    raw,
    result,
    response,
    data,
  ];

  const candidates = [];

  for (const key of safeArray(keys)) {
    for (const source of sources) {
      if (!source) continue;

      candidates.push(source?.[key]);

      if (key.includes(".")) {
        candidates.push(getPath(source, key));
      }
    }
  }

  candidates.push(...safeArray(extraCandidates));
  candidates.push(fallback);

  const numbers = candidates
    .map((value) => safeNumber(value, NaN))
    .filter((value) => Number.isFinite(value));

  if (!numbers.length) {
    return safeNumber(fallback, 0);
  }

  const positiveNumbers = numbers.filter((value) => value > 0);

  if (positiveNumbers.length) {
    return Math.max(...positiveNumbers);
  }

  return Math.max(...numbers);
}

/* =========================================================
   COLLECTION NORMALIZATION
========================================================= */

export function unwrapCollectionPayload(value = null, depth = 0) {
  if (value === null || value === undefined) {
    return {};
  }

  if (depth > 10) {
    return value;
  }

  if (Array.isArray(value)) {
    return {
      items: value,
      total: value.length,
      count: value.length,
    };
  }

  const object = safeObject(value, null);

  if (!object) {
    return {};
  }

  if (
    Array.isArray(object.items) ||
    Array.isArray(object.rows) ||
    Array.isArray(object.data) ||
    Array.isArray(object.results) ||
    Array.isArray(object.records) ||
    Array.isArray(object.value) ||
    Array.isArray(object.docs) ||
    Array.isArray(object.documents) ||
    Array.isArray(object.collection) ||
    Array.isArray(object.list)
  ) {
    return object;
  }

  const directArray = first(
    object.tickets,
    object.incidencias,
    object.facturas,
    object.invoices,
    object.bills,
    object.users,
    object.usuarios,
    object.clients,
    object.clientes,
    object.customers,
    object.activity,
    object.activities,
    object.recent,
    object.recentActivity,
    object.timeline,
    object.logs
  );

  if (Array.isArray(directArray)) {
    return {
      ...object,
      items: directArray,
      total: first(
        object.total,
        object.count,
        object.totalCount,
        object.remoteCount,
        directArray.length
      ),
    };
  }

  const nested = first(
    object.payload,
    object.result,
    object.response,
    object.body,
    object.content,
    object.data
  );

  if (isObject(nested) || Array.isArray(nested)) {
    return unwrapCollectionPayload(nested, depth + 1);
  }

  return object;
}

export function normalizeCollection(value) {
  if (Array.isArray(value)) return value;

  const object = safeObject(unwrapCollectionPayload(value));

  return safeArray(
    first(
      object.items,
      object.rows,
      object.data,
      object.results,
      object.records,
      object.value,
      object.docs,
      object.documents,
      object.collection,
      object.list,
      []
    )
  );
}

export function getRemoteCountFromCollection(value, fallback = 0) {
  const object = safeObject(unwrapCollectionPayload(value));

  return Math.max(
    fallback,
    safeNumber(
      first(
        object.totalCount,
        object.remoteCount,
        object.total,
        object.count,
        object.length,
        object.meta?.totalCount,
        object.meta?.remoteCount,
        object.meta?.total,
        object.meta?.count,
        object.pagination?.totalCount,
        object.pagination?.remoteCount,
        object.pagination?.total,
        object.pagination?.count,
        object.page?.total,
        object.pageInfo?.total,
        object.pageInfo?.totalCount,
        fallback
      ),
      fallback
    )
  );
}

export function resolveCollectionSource(input = {}, aliases = []) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  const dashboard = getDashboard(data);
  const payload = safeObject(data.payload);
  const raw = safeObject(data.raw);
  const result = safeObject(data.result);
  const response = safeObject(data.response);

  const candidates = [];

  for (const alias of safeArray(aliases)) {
    candidates.push(data?.[alias]);
    candidates.push(state?.[alias]);
    candidates.push(dashboard?.[alias]);
    candidates.push(payload?.[alias]);
    candidates.push(raw?.[alias]);
    candidates.push(result?.[alias]);
    candidates.push(response?.[alias]);

    candidates.push(data?.collections?.[alias]);
    candidates.push(state?.collections?.[alias]);
    candidates.push(dashboard?.collections?.[alias]);
    candidates.push(payload?.collections?.[alias]);

    candidates.push(data?.resources?.[alias]);
    candidates.push(state?.resources?.[alias]);
    candidates.push(dashboard?.resources?.[alias]);
  }

  return first(...candidates, []);
}

/* =========================================================
   WIDGETS
========================================================= */

export function getWidgets(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  const dashboard = getDashboard(data);

  return normalizeCollection(
    first(
      data.widgets,
      data.cards,
      data.kpis,
      state.widgets,
      state.cards,
      state.kpis,
      dashboard.widgets,
      dashboard.cards,
      dashboard.kpis,
      dashboard.blocks,
      data.payload?.widgets,
      data.result?.widgets,
      []
    )
  );
}

export function getWidgetId(widget = {}) {
  return safeText(
    first(
      widget.widgetId,
      widget.widgetKey,
      widget.id,
      widget.key,
      widget.slug,
      widget.code
    ),
    ""
  );
}

export function getWidgetTitle(widget = {}) {
  return safeText(
    first(
      widget.title,
      widget.name,
      widget.label,
      widget.heading
    ),
    "Bloque"
  );
}

export function getWidgetText(widget = {}) {
  return safeText(
    first(
      widget.description,
      widget.descripcion,
      widget.subtitle,
      widget.text,
      widget.summary
    ),
    ""
  );
}

export function getWidgetValue(widget = {}) {
  return first(
    widget.value,
    widget.total,
    widget.amount,
    widget.count,
    widget.metric,
    "—"
  );
}

export function getWidgetTrend(widget = {}) {
  return first(
    widget.trend,
    widget.delta,
    widget.change,
    widget.variation,
    ""
  );
}

export function getWidgetType(widget = {}) {
  return normalizeKey(
    first(
      widget.type,
      widget.kind,
      widget.variant,
      widget.category,
      "widget"
    )
  );
}

export function getWidgetRoute(widget = {}) {
  return normalizeRoute(
    first(
      widget.route,
      widget.href,
      widget.link,
      widget.to,
      ""
    )
  );
}

export function getWidgetNumericValue(input = {}, matchers = [], fallback = null) {
  const widgets = getWidgets(input);
  const aliases = safeArray(matchers)
    .map((item) => normalizeKey(item))
    .filter(Boolean);

  if (!widgets.length || !aliases.length) {
    return fallback;
  }

  for (const widget of widgets) {
    const searchable = [
      getWidgetId(widget),
      getWidgetTitle(widget),
      getWidgetText(widget),
      widget.key,
      widget.slug,
      widget.code,
      widget.type,
      widget.kind,
      widget.variant,
      widget.label,
      widget.heading,
    ]
      .map((item) => normalizeKey(item))
      .filter(Boolean)
      .join(" ");

    const matches = aliases.some((alias) => searchable.includes(alias));

    if (!matches) continue;

    const value = safeNumber(
      first(
        widget.value,
        widget.total,
        widget.amount,
        widget.count,
        widget.metric
      ),
      NaN
    );

    if (Number.isFinite(value)) {
      return value;
    }
  }

  return fallback;
}

/* =========================================================
   ROLE / USER
========================================================= */

export function getUser(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  const dashboard = getDashboard(data);

  return safeObject(
    first(
      data.user,
      data.currentUser,
      data.profile,
      state.user,
      state.currentUser,
      state.profile,
      dashboard.user,
      dashboard.currentUser,
      data.raw?.user,
      data.raw?.currentUser,
      data.payload?.user,
      {}
    )
  );
}

export function getRole(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  const user = getUser(data);
  const dashboard = getDashboard(data);

  return normalizeKey(
    first(
      data.role,
      data.currentRole,
      state.role,
      state.currentRole,
      dashboard.role,
      user.role,
      user.rol,
      user.type,
      user.userType,
      user.permissions?.role,
      data.raw?.role,
      "user"
    )
  );
}

export function isAdminRole(role = "") {
  return ADMIN_ROLE_KEYS.includes(normalizeKey(role));
}

export function getDisplayName(input = {}) {
  const user = getUser(input);

  return safeText(
    first(
      user.displayName,
      user.fullName,
      user.name,
      user.nombre,
      user.username,
      user.email,
      input.name,
      input.displayName
    ),
    "Usuario"
  );
}

export function getAvatarUrl(input = {}) {
  const user = getUser(input);

  return safeText(
    first(
      user.avatar,
      user.avatarUrl,
      user.avatar_url,
      user.photo,
      user.photoUrl,
      user.photoURL,
      user.picture,
      user.pictureUrl,
      user.image,
      user.imageUrl,
      user.profileImage,
      input.avatar,
      input.avatarUrl
    ),
    ""
  );
}

/* =========================================================
   TICKETS / INCIDENCIAS
========================================================= */

export function getTicketId(item = {}) {
  return safeText(
    first(
      item.ticketId,
      item.incidenciaId,
      item.code,
      item.numero,
      item.ticketCode,
      item.id,
      item._id,
      item.raw?.ticketId,
      item.raw?.incidenciaId,
      item.raw?.code,
      item.raw?.numero,
      item.raw?.ticketCode,
      item.raw?.id,
      item.raw?._id
    ),
    "INC-SIN-ID"
  );
}

export function getTicketSubject(item = {}) {
  return safeText(
    first(
      item.subject,
      item.title,
      item.asunto,
      item.name,
      item.preview,
      item.raw?.subject,
      item.raw?.title,
      item.raw?.asunto,
      item.raw?.name,
      item.raw?.preview
    ),
    "Incidencia sin asunto"
  );
}

export function getTicketDescription(item = {}) {
  return safeText(
    first(
      item.description,
      item.preview,
      item.message,
      item.descripcion,
      item.body,
      item.text,
      item.raw?.description,
      item.raw?.preview,
      item.raw?.message,
      item.raw?.descripcion,
      item.raw?.body,
      item.raw?.text
    ),
    "Sin descripción."
  );
}

export function getTicketOwnerName(item = {}) {
  return safeText(
    first(
      item.clientName,
      item.clienteNombre,
      item.customerName,
      item.requesterName,
      item.userName,
      item.createdByName,
      item.ownerName,
      item.name,

      item.requesterSnapshot?.name,
      item.requesterSnapshot?.displayName,
      item.cliente?.nombreContacto,
      item.cliente?.nombre,
      item.cliente?.name,
      item.cliente?.displayName,
      item.client?.name,
      item.client?.nombre,
      item.customer?.name,
      item.receptor?.name,
      item.createdBy?.name,
      item.createdBy?.displayName,
      item.user?.name,
      item.owner?.name,

      item.raw?.clientName,
      item.raw?.clienteNombre,
      item.raw?.customerName,
      item.raw?.requesterName,
      item.raw?.userName,
      item.raw?.createdByName,
      item.raw?.ownerName,
      item.raw?.name,

      item.raw?.requesterSnapshot?.name,
      item.raw?.requesterSnapshot?.displayName,
      item.raw?.cliente?.nombreContacto,
      item.raw?.cliente?.nombre,
      item.raw?.cliente?.name,
      item.raw?.cliente?.displayName,
      item.raw?.client?.name,
      item.raw?.client?.nombre,
      item.raw?.customer?.name,
      item.raw?.receptor?.name,
      item.raw?.createdBy?.name,
      item.raw?.createdBy?.displayName,
      item.raw?.user?.name,
      item.raw?.owner?.name
    ),
    getTicketSubject(item)
  );
}

export function getTicketOwnerEmail(item = {}) {
  return safeText(
    first(
      item.clientEmail,
      item.clienteEmail,
      item.email,
      item.emailCliente,
      item.requesterSnapshot?.email,
      item.createdBy?.email,
      item.cliente?.email,
      item.cliente?.emailLower,
      item.client?.email,
      item.customer?.email,
      item.receptor?.email,
      item.user?.email,
      item.owner?.email,

      item.raw?.clientEmail,
      item.raw?.clienteEmail,
      item.raw?.email,
      item.raw?.emailCliente,
      item.raw?.requesterSnapshot?.email,
      item.raw?.createdBy?.email,
      item.raw?.cliente?.email,
      item.raw?.cliente?.emailLower,
      item.raw?.client?.email,
      item.raw?.customer?.email,
      item.raw?.receptor?.email,
      item.raw?.user?.email,
      item.raw?.owner?.email
    ),
    ""
  ).toLowerCase();
}

export function getTicketAvatarUrl(item = {}) {
  return safeText(
    first(
      item.clientAvatar,
      item.avatar,
      item.avatarUrl,
      item.avatar_url,
      item.userAvatar,
      item.createdByAvatar,
      item.ownerAvatar,
      item.requesterSnapshot?.avatar,
      item.requesterSnapshot?.avatarUrl,
      item.cliente?.avatar,
      item.cliente?.avatarUrl,
      item.client?.avatar,
      item.client?.avatarUrl,
      item.customer?.avatar,
      item.customer?.avatarUrl,
      item.createdBy?.avatar,
      item.createdBy?.avatarUrl,
      item.user?.avatar,
      item.user?.avatarUrl,
      item.owner?.avatar,
      item.owner?.avatarUrl,

      item.raw?.clientAvatar,
      item.raw?.avatar,
      item.raw?.avatarUrl,
      item.raw?.avatar_url,
      item.raw?.userAvatar,
      item.raw?.createdByAvatar,
      item.raw?.ownerAvatar,
      item.raw?.requesterSnapshot?.avatar,
      item.raw?.requesterSnapshot?.avatarUrl,
      item.raw?.cliente?.avatar,
      item.raw?.cliente?.avatarUrl,
      item.raw?.client?.avatar,
      item.raw?.client?.avatarUrl,
      item.raw?.customer?.avatar,
      item.raw?.customer?.avatarUrl,
      item.raw?.createdBy?.avatar,
      item.raw?.createdBy?.avatarUrl,
      item.raw?.user?.avatar,
      item.raw?.user?.avatarUrl,
      item.raw?.owner?.avatar,
      item.raw?.owner?.avatarUrl
    ),
    ""
  );
}

export function getTicketStatus(item = {}) {
  return first(
    item.status,
    item.estado,
    item.state,
    item.lifecycle?.status,
    item.raw?.status,
    item.raw?.estado,
    item.raw?.state,
    item.raw?.lifecycle?.status,
    "pending"
  );
}

export function getTicketStatusKey(value = "") {
  const key = normalizeKey(value);

  if (
    [
      "pending",
      "pendiente",
      "pendientes",
      "new",
      "nueva",
      "nuevo",
      "created",
    ].includes(key)
  ) {
    return "pending";
  }

  if (
    [
      "open",
      "opened",
      "abierta",
      "abierto",
      "abiertas",
      "abiertos",
    ].includes(key)
  ) {
    return "open";
  }

  if (
    [
      "progress",
      "in_progress",
      "inprogress",
      "en_proceso",
      "proceso",
      "working",
      "trabajando",
      "assigned",
      "asignada",
      "asignado",
    ].includes(key)
  ) {
    return "progress";
  }

  if (
    [
      "resolved",
      "resuelta",
      "resuelto",
      "resueltas",
      "resueltos",
      "solved",
    ].includes(key)
  ) {
    return "resolved";
  }

  if (
    [
      "closed",
      "close",
      "cerrada",
      "cerrado",
      "cerradas",
      "cerrados",
      "cancelled",
      "cancelada",
      "cancelado",
      "archived",
      "archivada",
      "archivado",
    ].includes(key)
  ) {
    return "closed";
  }

  return "pending";
}

export function getTicketStatusLabel(value = "") {
  const key = getTicketStatusKey(value);

  if (key === "open") return "Abierta";
  if (key === "pending") return "Pendiente";
  if (key === "progress") return "En proceso";
  if (key === "resolved") return "Resuelta";
  if (key === "closed") return "Cerrada";

  return safeText(value, "Pendiente");
}

export function getTicketPriorityRaw(item = {}) {
  return first(
    item.priority,
    item.prioridad,
    item.severity,
    item.urgency,
    item.sla?.priority,
    item.raw?.priority,
    item.raw?.prioridad,
    item.raw?.severity,
    item.raw?.urgency,
    item.raw?.sla?.priority,
    "medium"
  );
}

export function getTicketPriorityKey(item = {}) {
  const key = normalizeKey(getTicketPriorityRaw(item));

  if (
    [
      "critical",
      "critica",
      "crítica",
      "critico",
      "crítico",
      "p0",
    ].includes(key)
  ) {
    return "critical";
  }

  if (
    [
      "urgent",
      "urgente",
      "high",
      "alta",
      "p1",
    ].includes(key)
  ) {
    return "urgent";
  }

  if (
    [
      "medium",
      "media",
      "normal",
      "p2",
    ].includes(key)
  ) {
    return "medium";
  }

  if (
    [
      "low",
      "baja",
      "minor",
      "p3",
    ].includes(key)
  ) {
    return "low";
  }

  return "medium";
}

export function getTicketPriorityLabel(item = {}) {
  const key = getTicketPriorityKey(item);

  if (key === "critical") return "Crítica";
  if (key === "urgent") return "Urgente";
  if (key === "medium") return "Media";
  if (key === "low") return "Baja";

  return "Media";
}

export function isTicketUrgent(item = {}) {
  return ["urgent", "critical"].includes(getTicketPriorityKey(item));
}

export function isTicketClosedLike(item = {}) {
  return TICKET_CLOSED_KEYS.includes(getTicketStatusKey(getTicketStatus(item)));
}

export function isTicketOpenLike(item = {}) {
  return TICKET_OPEN_KEYS.includes(getTicketStatusKey(getTicketStatus(item)));
}

export function getTicketCategory(item = {}) {
  return safeText(
    first(
      item.category,
      item.categoria,
      item.type,
      item.tipo,
      item.subcategory,
      item.subcategoria,
      item.raw?.category,
      item.raw?.categoria,
      item.raw?.type,
      item.raw?.tipo,
      item.raw?.subcategory,
      item.raw?.subcategoria
    ),
    "Soporte"
  );
}

export function getTicketAssignedTo(item = {}) {
  return safeText(
    first(
      item.assignedTo?.name,
      item.assignedTo?.displayName,
      item.assignment?.agentName,
      item.assignment?.name,
      item.tecnico?.name,
      item.tecnico?.displayName,
      item.tecnico,
      item.agent,

      item.raw?.assignedTo?.name,
      item.raw?.assignedTo?.displayName,
      item.raw?.assignment?.agentName,
      item.raw?.assignment?.name,
      item.raw?.tecnico?.name,
      item.raw?.tecnico?.displayName,
      item.raw?.tecnico,
      item.raw?.agent
    ),
    "Sin asignar"
  );
}

export function getTicketCreatedAt(item = {}) {
  return first(
    item.createdAt,
    item.fechaCreacion,
    item.createdAtES,
    item.date,
    item.fecha,
    item.lifecycle?.createdAt,
    item.raw?.createdAt,
    item.raw?.fechaCreacion,
    item.raw?.createdAtES,
    item.raw?.date,
    item.raw?.fecha,
    item.raw?.lifecycle?.createdAt
  );
}

export function getTicketUpdatedAt(item = {}) {
  return first(
    item.updatedAt,
    item.lastUpdateAt,
    item.ultimaNovedad,
    item.modifiedAt,
    item.closedAt,
    item.createdAt,
    item.lifecycle?.updatedAt,
    item.lifecycle?.lastUpdateAt,
    item.audit?.updatedAt,

    item.raw?.updatedAt,
    item.raw?.lastUpdateAt,
    item.raw?.ultimaNovedad,
    item.raw?.modifiedAt,
    item.raw?.closedAt,
    item.raw?.createdAt,
    item.raw?.lifecycle?.updatedAt,
    item.raw?.lifecycle?.lastUpdateAt,
    item.raw?.audit?.updatedAt
  );
}

export function getTicketAttachmentsCount(item = {}) {
  const attachments = first(
    item.attachments,
    item.files,
    item.adjuntos,
    item.documents,
    item.raw?.attachments,
    item.raw?.files,
    item.raw?.adjuntos,
    item.raw?.documents
  );

  if (Array.isArray(attachments)) return attachments.length;

  return safeNumber(
    first(
      item.attachmentsCount,
      item.filesCount,
      item.adjuntosCount,
      item.documentsCount,
      item.raw?.attachmentsCount,
      item.raw?.filesCount,
      item.raw?.adjuntosCount,
      item.raw?.documentsCount,
      0
    ),
    0
  );
}

export function getTicketSortTimestamp(item = {}) {
  return (
    safeNumber(item?.meta?.updatedAtMs, 0) ||
    safeNumber(item?.meta?.timestampMs, 0) ||
    safeNumber(item?.raw?.meta?.updatedAtMs, 0) ||
    safeNumber(item?.raw?.meta?.timestampMs, 0) ||
    toTimestamp(getTicketUpdatedAt(item)) ||
    toTimestamp(getTicketCreatedAt(item)) ||
    toTimestamp(item?.raw?._ts) ||
    0
  );
}

export function compareTicketsNewestFirst(a = {}, b = {}) {
  const diff = getTicketSortTimestamp(b) - getTicketSortTimestamp(a);

  if (diff !== 0) return diff;

  return safeText(getTicketId(b), "").localeCompare(
    safeText(getTicketId(a), ""),
    "es",
    {
      numeric: true,
      sensitivity: "base",
    }
  );
}

export function sortTicketsNewestFirst(items = []) {
  return [...safeArray(items)].sort(compareTicketsNewestFirst);
}

/* =========================================================
   FACTURAS
========================================================= */

export function getInvoiceId(item = {}) {
  return safeText(
    first(
      item.invoiceId,
      item.facturaId,
      item.numeroFacturaLegal,
      item.numeroFactura,
      item.invoiceNumber,
      item.number,
      item.numero,
      item.code,
      item.id,
      item._id,

      item.raw?.invoiceId,
      item.raw?.facturaId,
      item.raw?.numeroFacturaLegal,
      item.raw?.numeroFactura,
      item.raw?.invoiceNumber,
      item.raw?.number,
      item.raw?.numero,
      item.raw?.code,
      item.raw?.id,
      item.raw?._id
    ),
    "FAC-SIN-ID"
  );
}

export function getInvoiceAmount(item = {}) {
  return safeNumber(
    first(
      item.total,
      item.amount,
      item.importe,
      item.price,
      item.subtotal,
      item.base,
      item.totalFactura,
      item.importeTotal,
      item.invoiceAmount,
      item.facturaTotal,
      item.facturaImporte,

      item.raw?.total,
      item.raw?.amount,
      item.raw?.importe,
      item.raw?.price,
      item.raw?.subtotal,
      item.raw?.base,
      item.raw?.totalFactura,
      item.raw?.importeTotal,
      item.raw?.invoiceAmount,
      item.raw?.facturaTotal,
      item.raw?.facturaImporte,
      0
    ),
    0
  );
}

export function getInvoiceCurrency(item = {}) {
  return safeText(
    first(
      item.currency,
      item.moneda,
      item.raw?.currency,
      item.raw?.moneda,
      DEFAULT_CURRENCY
    ),
    DEFAULT_CURRENCY
  ).toUpperCase();
}

export function getInvoiceStatusKey(item = {}) {
  const key = normalizeKey(
    first(
      item.paymentStatus,
      item.estadoPago,
      item.status,
      item.estado,
      item.raw?.paymentStatus,
      item.raw?.estadoPago,
      item.raw?.status,
      item.raw?.estado,
      "pending"
    )
  );

  if (["paid", "pagada", "pagado", "cobrada", "cobrado"].includes(key)) return "paid";
  if (["pending", "pendiente", "unpaid"].includes(key)) return "pending";
  if (["overdue", "vencida", "vencido"].includes(key)) return "overdue";
  if (["partial", "parcial", "pago_parcial"].includes(key)) return "partial";
  if (["cancelled", "cancelada", "cancelado"].includes(key)) return "cancelled";
  if (["draft", "borrador"].includes(key)) return "draft";

  return "pending";
}

export function isInvoicePendingLike(item = {}) {
  return ["pending", "overdue", "partial"].includes(getInvoiceStatusKey(item));
}

/* =========================================================
   USERS / CLIENTS
========================================================= */

export function getUserId(item = {}) {
  return safeText(
    first(
      item.userId,
      item.usuarioId,
      item.id,
      item._id,
      item.email,
      item.username,
      item.raw?.userId,
      item.raw?.usuarioId,
      item.raw?.id,
      item.raw?._id,
      item.raw?.email,
      item.raw?.username
    ),
    ""
  );
}

export function isActiveUser(item = {}) {
  const active = first(
    item.active,
    item.isActive,
    item.enabled,
    item.status,
    item.estado,
    item.raw?.active,
    item.raw?.isActive,
    item.raw?.enabled,
    item.raw?.status,
    item.raw?.estado
  );

  const key = normalizeKey(active);

  if (active === false) return false;
  if (active === 0) return false;

  if (
    [
      "false",
      "disabled",
      "inactive",
      "inactivo",
      "bloqueado",
      "deleted",
    ].includes(key)
  ) {
    return false;
  }

  return true;
}

export function getClientId(item = {}) {
  return safeText(
    first(
      item.clienteId,
      item.clientId,
      item.customerId,
      item.id,
      item._id,
      item.email,
      item.nif,
      item.cif,
      item.raw?.clienteId,
      item.raw?.clientId,
      item.raw?.customerId,
      item.raw?.id,
      item.raw?._id,
      item.raw?.email,
      item.raw?.nif,
      item.raw?.cif
    ),
    ""
  );
}

export function isActiveClient(item = {}) {
  const active = first(
    item.active,
    item.isActive,
    item.enabled,
    item.status,
    item.estado,
    item.raw?.active,
    item.raw?.isActive,
    item.raw?.enabled,
    item.raw?.status,
    item.raw?.estado
  );

  const key = normalizeKey(active);

  if (active === false) return false;
  if (active === 0) return false;

  if (
    [
      "false",
      "disabled",
      "inactive",
      "inactivo",
      "bloqueado",
      "deleted",
    ].includes(key)
  ) {
    return false;
  }

  return true;
}

/* =========================================================
   COLLECTIONS
========================================================= */

export function getCollections(input = {}) {
  const data = safeObject(input);
  const dashboard = getDashboard(data);
  const summary = getSummary(data);

  const ticketsSource = resolveCollectionSource(data, [
    "tickets",
    "incidencias",
    "incidents",
    "issues",
    "supportTickets",
    "items",
    "rows",
  ]);

  const invoicesSource = resolveCollectionSource(data, [
    "facturas",
    "invoices",
    "bills",
    "billing",
    "payments",
  ]);

  const usersSource = resolveCollectionSource(data, [
    "users",
    "usuarios",
    "members",
    "accounts",
  ]);

  const clientsSource = resolveCollectionSource(data, [
    "clients",
    "clientes",
    "customers",
    "accountsClients",
  ]);

  const activitySource = resolveCollectionSource(data, [
    "activity",
    "activities",
    "recentActivity",
    "recent",
    "logs",
    "timeline",
    "events",
  ]);

  const tickets = sortTicketsNewestFirst(
    uniqueBy(normalizeCollection(ticketsSource), getTicketId)
  );

  const invoices = uniqueBy(normalizeCollection(invoicesSource), getInvoiceId);
  const users = uniqueBy(normalizeCollection(usersSource), getUserId);
  const clients = uniqueBy(normalizeCollection(clientsSource), getClientId);
  const activity = normalizeCollection(activitySource);

  const ticketsRemoteCount = Math.max(
    tickets.length,
    safeNumber(
      first(
        summary.totalTickets,
        summary.ticketsTotal,
        summary.incidenciasTotal,
        summary.totalIncidencias,
        summary.ticketsCount,
        summary.incidenciasCount,
        summary.tickets?.total,
        summary.incidencias?.total,
        dashboard.ticketsTotal,
        dashboard.incidenciasTotal,
        dashboard.totalTickets,
        dashboard.totalIncidencias,
        dashboard.tickets?.total,
        dashboard.incidencias?.total,
        getRemoteCountFromCollection(ticketsSource, tickets.length)
      ),
      tickets.length
    )
  );

  const invoicesRemoteCount = Math.max(
    invoices.length,
    safeNumber(
      first(
        summary.totalInvoices,
        summary.invoicesTotal,
        summary.facturasTotal,
        summary.totalFacturas,
        summary.invoicesCount,
        summary.facturasCount,
        summary.invoices?.total,
        summary.facturas?.total,
        dashboard.invoicesTotal,
        dashboard.facturasTotal,
        dashboard.totalInvoices,
        dashboard.totalFacturas,
        dashboard.invoices?.total,
        dashboard.facturas?.total,
        getRemoteCountFromCollection(invoicesSource, invoices.length)
      ),
      invoices.length
    )
  );

  const usersRemoteCount = Math.max(
    users.length,
    safeNumber(
      first(
        summary.usersCount,
        summary.usuariosCount,
        summary.totalUsers,
        summary.totalUsuarios,
        summary.activeUsers,
        summary.usuariosActivos,
        summary.users?.total,
        summary.usuarios?.total,
        dashboard.usersTotal,
        dashboard.usuariosTotal,
        dashboard.totalUsers,
        dashboard.totalUsuarios,
        dashboard.usersCount,
        dashboard.usuariosCount,
        dashboard.users?.total,
        dashboard.usuarios?.total,
        dashboard.meta?.usersCount,
        dashboard.meta?.usuariosCount,
        getRemoteCountFromCollection(usersSource, users.length)
      ),
      users.length
    )
  );

  const clientsRemoteCount = Math.max(
    clients.length,
    safeNumber(
      first(
        summary.clientsCount,
        summary.clientesCount,
        summary.customersCount,
        summary.totalClients,
        summary.totalClientes,
        summary.totalCustomers,
        summary.activeClients,
        summary.clientesActivos,
        summary.clients?.total,
        summary.clientes?.total,
        dashboard.clientsTotal,
        dashboard.clientesTotal,
        dashboard.customersTotal,
        dashboard.totalClients,
        dashboard.totalClientes,
        dashboard.clientsCount,
        dashboard.clientesCount,
        dashboard.customersCount,
        dashboard.clients?.total,
        dashboard.clientes?.total,
        dashboard.meta?.clientsCount,
        dashboard.meta?.clientesCount,
        getRemoteCountFromCollection(clientsSource, clients.length)
      ),
      clients.length
    )
  );

  return {
    tickets,
    invoices,
    users,
    clients,
    activity,

    ticketsSource,
    invoicesSource,
    usersSource,
    clientsSource,
    activitySource,

    ticketsRemoteCount,
    invoicesRemoteCount,
    usersRemoteCount,
    clientsRemoteCount,
  };
}

/* =========================================================
   STATS
========================================================= */

export function getLatestDateFromTickets(tickets = []) {
  const timestamps = safeArray(tickets)
    .map((item) => {
      return (
        toTimestamp(getTicketUpdatedAt(item)) ||
        toTimestamp(getTicketCreatedAt(item)) ||
        0
      );
    })
    .filter(Boolean);

  if (!timestamps.length) return null;

  return new Date(Math.max(...timestamps)).toISOString();
}

export function computeHomeStats(input = {}) {
  const data = safeObject(input);
  const collections = getCollections(data);
  const role = getRole(data);
  const admin = isAdminRole(role);

  const tickets = collections.tickets;
  const invoices = collections.invoices;
  const users = collections.users;
  const clients = collections.clients;

  const computedOpenTickets = tickets.filter((item) => isTicketOpenLike(item)).length;
  const computedClosedTickets = tickets.filter((item) => isTicketClosedLike(item)).length;
  const computedUrgentTickets = tickets.filter((item) => isTicketUrgent(item)).length;
  const computedPendingInvoices = invoices.filter((item) => isInvoicePendingLike(item)).length;

  const computedInvoiceAmount = roundMoney(
    invoices.reduce((sum, item) => sum + getInvoiceAmount(item), 0)
  );

  const computedActiveUsers = users.filter((item) => isActiveUser(item)).length;
  const computedActiveClients = clients.filter((item) => isActiveClient(item)).length;

  const attachmentsCount = tickets.reduce(
    (sum, item) => sum + getTicketAttachmentsCount(item),
    0
  );

  const lastTicketUpdate = getLatestDateFromTickets(tickets);

  const widgetInvoiceAmount = getWidgetNumericValue(
    data,
    [
      "facturacion",
      "facturacion_total",
      "facturacion visible",
      "facturacion total",
      "facturas",
      "billing",
      "invoice",
      "invoices",
      "total_facturado",
      "importe_facturas",
    ],
    null
  );

  const widgetUsersCount = getWidgetNumericValue(
    data,
    [
      "usuarios",
      "usuarios_activos",
      "usuarios activos",
      "users",
      "active_users",
      "members",
    ],
    null
  );

  const widgetClientsCount = getWidgetNumericValue(
    data,
    [
      "clientes",
      "clientes_activos",
      "clientes activos",
      "clients",
      "active_clients",
      "customers",
    ],
    null
  );

  const totalTickets = getBestSummaryNumber(
    data,
    [
      "totalTickets",
      "ticketsTotal",
      "incidenciasTotal",
      "totalIncidencias",
      "ticketsCount",
      "incidenciasCount",
      "tickets.total",
      "incidencias.total",
      "tickets.count",
      "incidencias.count",
    ],
    collections.ticketsRemoteCount,
    [
      collections.ticketsRemoteCount,
      tickets.length,
    ]
  );

  const openTickets = getBestSummaryNumber(
    data,
    [
      "openTickets",
      "pendingTickets",
      "openIncidencias",
      "pendingIncidencias",
      "incidenciasAbiertas",
      "ticketsAbiertos",
      "tickets.open",
      "tickets.pending",
      "incidencias.open",
      "incidencias.pending",
      "incidencias.abiertas",
    ],
    computedOpenTickets,
    [
      computedOpenTickets,
    ]
  );

  const closedTickets = getBestSummaryNumber(
    data,
    [
      "closedTickets",
      "resolvedTickets",
      "closedIncidencias",
      "resolvedIncidencias",
      "incidenciasCerradas",
      "ticketsCerrados",
      "tickets.closed",
      "tickets.resolved",
      "incidencias.closed",
      "incidencias.resolved",
      "incidencias.cerradas",
    ],
    computedClosedTickets,
    [
      computedClosedTickets,
    ]
  );

  const urgentTickets = getBestSummaryNumber(
    data,
    [
      "urgentTickets",
      "urgentIncidencias",
      "highPriorityTickets",
      "ticketsUrgentes",
      "incidenciasUrgentes",
      "tickets.urgent",
      "incidencias.urgent",
      "tickets.high",
      "incidencias.high",
    ],
    computedUrgentTickets,
    [
      computedUrgentTickets,
    ]
  );

  const totalInvoices = getBestSummaryNumber(
    data,
    [
      "totalInvoices",
      "invoicesTotal",
      "facturasTotal",
      "totalFacturas",
      "invoicesCount",
      "facturasCount",
      "invoices.total",
      "facturas.total",
      "invoices.count",
      "facturas.count",
    ],
    collections.invoicesRemoteCount,
    [
      collections.invoicesRemoteCount,
      invoices.length,
    ]
  );

  const pendingInvoices = getBestSummaryNumber(
    data,
    [
      "pendingInvoices",
      "pendingFacturas",
      "facturasPendientes",
      "invoicesPending",
      "facturasVencidas",
      "overdueInvoices",
      "invoices.pending",
      "facturas.pending",
      "facturas.pendientes",
      "invoices.overdue",
      "facturas.overdue",
    ],
    computedPendingInvoices,
    [
      computedPendingInvoices,
    ]
  );

  const invoiceAmount = roundMoney(
    getBestSummaryNumber(
      data,
      [
        "invoiceAmount",
        "billingTotal",
        "totalBilling",
        "totalFacturado",
        "importeFacturas",
        "facturacionVisible",
        "facturacionTotal",
        "facturasImporteTotal",
        "invoices.amount",
        "facturas.amount",
        "invoices.totalAmount",
        "facturas.totalAmount",
        "billing.total",
      ],
      computedInvoiceAmount,
      [
        computedInvoiceAmount,
        widgetInvoiceAmount,
      ]
    )
  );

  const usersCount = getBestSummaryNumber(
    data,
    [
      "usersCount",
      "usuariosCount",
      "totalUsers",
      "totalUsuarios",
      "activeUsers",
      "usuariosActivos",
      "users.total",
      "usuarios.total",
      "users.count",
      "usuarios.count",
      "users.active",
      "usuarios.active",
    ],
    collections.usersRemoteCount || computedActiveUsers,
    [
      collections.usersRemoteCount,
      computedActiveUsers,
      widgetUsersCount,
    ]
  );

  const clientsCount = getBestSummaryNumber(
    data,
    [
      "clientsCount",
      "clientesCount",
      "customersCount",
      "totalClients",
      "totalClientes",
      "totalCustomers",
      "activeClients",
      "clientesActivos",
      "clients.total",
      "clientes.total",
      "customers.total",
      "clients.count",
      "clientes.count",
      "clients.active",
      "clientes.active",
    ],
    collections.clientsRemoteCount || computedActiveClients,
    [
      collections.clientsRemoteCount,
      computedActiveClients,
      widgetClientsCount,
    ]
  );

  const healthRatio = totalTickets
    ? clampNumber(((totalTickets - openTickets) / totalTickets) * 100, 0, 100)
    : 100;

  return {
    role,
    admin,

    totalTickets,
    visibleTickets: tickets.length,
    openTickets,
    closedTickets,
    urgentTickets,

    totalInvoices,
    visibleInvoices: invoices.length,
    pendingInvoices,
    invoiceAmount,

    usersCount,
    activeUsersCount: computedActiveUsers,

    clientsCount,
    activeClientsCount: computedActiveClients,

    attachmentsCount,
    lastTicketUpdate,
    healthRatio,
  };
}

/* =========================================================
   CARDS / ACTIONS DATA
========================================================= */

export function getStatCards(input = {}) {
  const stats = computeHomeStats(input);

  if (stats.admin) {
    return [
      {
        iconName: "ticket",
        label: "Incidencias abiertas",
        value: formatNumber(stats.openTickets),
        text: `${formatNumber(stats.totalTickets)} solicitudes totales registradas.`,
        modifier: "open",
        badge: stats.urgentTickets ? `${formatNumber(stats.urgentTickets)} urg.` : "",
      },
      {
        iconName: "euro",
        label: "Facturación visible",
        value: formatMoney(stats.invoiceAmount, DEFAULT_CURRENCY),
        text: `${formatNumber(stats.pendingInvoices)} facturas pendientes o vencidas.`,
        modifier: "billing",
      },
      {
        iconName: "client",
        label: "Clientes",
        value: formatNumber(stats.clientsCount),
        text: "Cuentas de cliente detectadas en el panel.",
        modifier: "clients",
      },
      {
        iconName: "users",
        label: "Usuarios",
        value: formatNumber(stats.usersCount),
        text: "Usuarios activos o sincronizados en el sistema.",
        modifier: "users",
      },
    ];
  }

  return [
    {
      iconName: "ticket",
      label: "Mis incidencias",
      value: formatNumber(stats.totalTickets),
      text: `${formatNumber(stats.openTickets)} solicitudes abiertas o en seguimiento.`,
      modifier: "open",
      badge: stats.urgentTickets ? `${formatNumber(stats.urgentTickets)} urg.` : "",
    },
    {
      iconName: "euro",
      label: "Facturas pendientes",
      value: formatNumber(stats.pendingInvoices),
      text: `${formatMoney(stats.invoiceAmount, DEFAULT_CURRENCY)} en facturación visible.`,
      modifier: "billing",
    },
    {
      iconName: "paperclip",
      label: "Adjuntos",
      value: formatNumber(stats.attachmentsCount),
      text: "Documentos vinculados a tu historial.",
      modifier: "files",
    },
    {
      iconName: "clock",
      label: "Última actividad",
      value: stats.lastTicketUpdate ? formatRelativeDate(stats.lastTicketUpdate) : "Sin fecha",
      text: "Movimiento más reciente en tus solicitudes.",
      modifier: "activity",
    },
  ];
}

export function getQuickActions(input = {}) {
  const admin = isAdminRole(getRole(input));

  if (admin) {
    return [
      {
        iconName: "ticket",
        title: "Centro de incidencias",
        text: "Revisar solicitudes, estados, prioridades y seguimiento operativo.",
        action: "go-incidencias",
        dataAction: "navigate-home",
        route: HOME_ROUTES.INCIDENCIAS,
        modifier: "primary",
      },
      {
        iconName: "invoice",
        title: "Facturación",
        text: "Consultar importes, estados de pago y vencimientos.",
        action: "go-facturas",
        dataAction: "navigate-home",
        route: HOME_ROUTES.FACTURAS,
        modifier: "billing",
      },
      {
        iconName: "client",
        title: "Clientes",
        text: "Abrir el listado de clientes y su información comercial.",
        action: "go-clientes",
        dataAction: "navigate-home",
        route: HOME_ROUTES.CLIENTES,
        modifier: "clients",
      },
      {
        iconName: "users",
        title: "Usuarios",
        text: "Gestionar usuarios, roles y acceso al panel.",
        action: "go-usuarios",
        dataAction: "navigate-home",
        route: HOME_ROUTES.USUARIOS,
        modifier: "users",
      },
    ];
  }

  return [
    {
      iconName: "plus",
      title: "Crear nueva incidencia",
      text: "Abre una solicitud para que soporte pueda revisarla.",
      action: "create-incidencia",
      dataAction: "navigate-home",
      route: HOME_ROUTES.INCIDENCIAS,
      modifier: "primary",
    },
    {
      iconName: "ticket",
      title: "Mis incidencias",
      text: "Consulta el estado y las últimas novedades.",
      action: "go-incidencias",
      dataAction: "navigate-home",
      route: HOME_ROUTES.INCIDENCIAS,
      modifier: "tickets",
    },
    {
      iconName: "invoice",
      title: "Mis facturas",
      text: "Revisa facturas, importes y estados de pago.",
      action: "go-facturas",
      dataAction: "navigate-home",
      route: HOME_ROUTES.FACTURAS,
      modifier: "billing",
    },
    {
      iconName: "account",
      title: "Mi cuenta",
      text: "Actualiza tus datos y preferencias de perfil.",
      action: "go-cuenta",
      dataAction: "navigate-home",
      route: HOME_ROUTES.CUENTA,
      modifier: "account",
    },
  ];
}

/* =========================================================
   ACTIVITY
========================================================= */

export function buildSyntheticActivity(input = {}) {
  const collections = getCollections(input);

  const ticketActivity = collections.tickets.slice(0, 8).map((item) => ({
    type: "ticket",
    title: getTicketSubject(item),
    text: `Incidencia ${getTicketId(item)} · ${getTicketStatusLabel(getTicketStatus(item))}`,
    date: getTicketUpdatedAt(item) || getTicketCreatedAt(item),
    route: HOME_ROUTES.INCIDENCIAS,
    action: "open-ticket",
    entityId: getTicketId(item),
  }));

  const invoiceActivity = collections.invoices.slice(0, 4).map((item) => ({
    type: "invoice",
    title: `Factura ${getInvoiceId(item)}`,
    text: `${formatMoney(getInvoiceAmount(item), getInvoiceCurrency(item))}`,
    date: first(
      item.updatedAt,
      item.modifiedAt,
      item.createdAt,
      item.date,
      item.raw?.updatedAt,
      item.raw?.createdAt,
      item.raw?.date
    ),
    route: HOME_ROUTES.FACTURAS,
    action: "navigate-home",
    entityId: getInvoiceId(item),
  }));

  const clientActivity = collections.clients.slice(0, 3).map((item) => ({
    type: "client",
    title: safeText(first(item.name, item.nombre, item.razonSocial, item.email), "Cliente"),
    text: "Cliente sincronizado en el panel.",
    date: first(item.updatedAt, item.createdAt, item.raw?.updatedAt, item.raw?.createdAt),
    route: HOME_ROUTES.CLIENTES,
    action: "navigate-home",
    entityId: getClientId(item),
  }));

  const userActivity = collections.users.slice(0, 3).map((item) => ({
    type: "user",
    title: safeText(first(item.name, item.nombre, item.username, item.email), "Usuario"),
    text: "Usuario disponible en el sistema.",
    date: first(
      item.lastLoginAt,
      item.updatedAt,
      item.createdAt,
      item.raw?.lastLoginAt,
      item.raw?.updatedAt,
      item.raw?.createdAt
    ),
    route: HOME_ROUTES.USUARIOS,
    action: "navigate-home",
    entityId: getUserId(item),
  }));

  return [
    ...ticketActivity,
    ...invoiceActivity,
    ...clientActivity,
    ...userActivity,
  ]
    .filter((item) => item.title || item.text)
    .sort((a, b) => toTimestamp(b.date) - toTimestamp(a.date));
}

export function getActivity(input = {}) {
  const collections = getCollections(input);

  if (collections.activity.length) {
    return collections.activity;
  }

  return buildSyntheticActivity(input);
}

export function getActivityTitle(item = {}) {
  return safeText(
    first(
      item.title,
      item.name,
      item.subject,
      item.label,
      item.raw?.title,
      item.raw?.name,
      item.raw?.subject,
      item.raw?.label
    ),
    "Actividad registrada"
  );
}

export function getActivityText(item = {}) {
  return safeText(
    first(
      item.text,
      item.description,
      item.message,
      item.detail,
      item.preview,
      item.raw?.text,
      item.raw?.description,
      item.raw?.message,
      item.raw?.detail,
      item.raw?.preview
    ),
    "Sin detalle adicional."
  );
}

export function getActivityDate(item = {}) {
  return first(
    item.date,
    item.createdAt,
    item.updatedAt,
    item.timestamp,
    item.raw?.date,
    item.raw?.createdAt,
    item.raw?.updatedAt,
    item.raw?.timestamp
  );
}

export function getActivityType(item = {}) {
  const key = normalizeKey(
    first(
      item.type,
      item.kind,
      item.category,
      item.raw?.type,
      item.raw?.kind,
      item.raw?.category,
      "activity"
    )
  );

  if (["factura", "invoice", "billing", "bill"].includes(key)) return "invoice";
  if (["ticket", "incidencia", "support", "issue"].includes(key)) return "ticket";
  if (["cliente", "client", "customer"].includes(key)) return "client";
  if (["usuario", "user", "member"].includes(key)) return "user";

  return key || "activity";
}

/* =========================================================
   PAGINATION
========================================================= */

export function getPagination(items = [], input = {}) {
  const allItems = safeArray(items);
  const data = safeObject(input);
  const runtime = safeObject(data.state);

  const pageSize = clampNumber(
    first(
      data.pageSize,
      data.homePageSize,
      runtime.pageSize,
      runtime.homePageSize,
      runtime.limit,
      DEFAULT_PAGE_SIZE
    ),
    1,
    50
  );

  const reportedTotal = Math.max(
    allItems.length,
    safeNumber(
      first(
        data.totalCount,
        data.remoteCount,
        runtime.totalCount,
        runtime.remoteCount,
        runtime.total,
        allItems.length
      ),
      allItems.length
    )
  );

  const totalPagesFromProps = safeNumber(
    first(
      data.totalPages,
      runtime.totalPages
    ),
    0
  );

  const totalPages = Math.max(
    1,
    totalPagesFromProps || Math.ceil((reportedTotal || 1) / pageSize)
  );

  const currentPage = clampNumber(
    first(
      data.page,
      data.homePage,
      runtime.page,
      runtime.homePage,
      1
    ),
    1,
    totalPages
  );

  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = allItems.slice(startIndex, startIndex + pageSize);

  const rangeStart = reportedTotal && pageItems.length ? startIndex + 1 : 0;
  const rangeEnd = reportedTotal
    ? Math.min(startIndex + pageItems.length, reportedTotal)
    : 0;

  return {
    allItems,
    pageItems,
    pageSize,
    currentPage,
    totalPages,
    totalCount: reportedTotal,
    rangeStart,
    rangeEnd,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  DEFAULT_PAGE_SIZE,
  DEFAULT_CURRENCY,
  HOME_ROUTES,
  ADMIN_ROLE_KEYS,
  TICKET_OPEN_KEYS,
  TICKET_CLOSED_KEYS,

  safeText,
  safeNumber,
  safeArray,
  safeObject,
  isObject,
  first,
  normalizeWhitespace,
  normalizeText,
  normalizeKey,
  clampNumber,
  roundMoney,
  getPath,
  firstPath,
  uniqueBy,
  hashString,
  toTimestamp,
  normalizeRoute,
  isSameIdentity,

  formatNumber,
  formatMoney,
  formatDateTime,
  formatDateShort,
  formatRelativeDate,
  formatLastUpdate,

  getAvatarStyle,
  getInitials,

  getDashboard,
  getSummary,
  getSummaryValue,
  getBestSummaryNumber,

  unwrapCollectionPayload,
  normalizeCollection,
  getRemoteCountFromCollection,
  resolveCollectionSource,

  getWidgets,
  getWidgetId,
  getWidgetTitle,
  getWidgetText,
  getWidgetValue,
  getWidgetTrend,
  getWidgetType,
  getWidgetRoute,
  getWidgetNumericValue,

  getUser,
  getRole,
  isAdminRole,
  getDisplayName,
  getAvatarUrl,

  getTicketId,
  getTicketSubject,
  getTicketDescription,
  getTicketOwnerName,
  getTicketOwnerEmail,
  getTicketAvatarUrl,
  getTicketStatus,
  getTicketStatusKey,
  getTicketStatusLabel,
  getTicketPriorityRaw,
  getTicketPriorityKey,
  getTicketPriorityLabel,
  isTicketUrgent,
  isTicketClosedLike,
  isTicketOpenLike,
  getTicketCategory,
  getTicketAssignedTo,
  getTicketCreatedAt,
  getTicketUpdatedAt,
  getTicketAttachmentsCount,
  getTicketSortTimestamp,
  compareTicketsNewestFirst,
  sortTicketsNewestFirst,

  getInvoiceId,
  getInvoiceAmount,
  getInvoiceCurrency,
  getInvoiceStatusKey,
  isInvoicePendingLike,

  getUserId,
  isActiveUser,
  getClientId,
  isActiveClient,

  getCollections,
  getLatestDateFromTickets,
  computeHomeStats,
  getStatCards,
  getQuickActions,

  buildSyntheticActivity,
  getActivity,
  getActivityTitle,
  getActivityText,
  getActivityDate,
  getActivityType,

  getPagination,
};
