/* =========================================================
   Onion Support - Home Selectors
   Archivo: /src/views/home/home.selectors.js

   Responsabilidad:
   - Helpers puros de datos para Home.
   - Resolver dashboard / summary / widgets / collections.
   - Normalizar lectura para template.js.
   - Calcular métricas y tarjetas.
   - Resolver usuario/rol admin-user.
   - Formatear números, dinero y fechas.
   - Sin fetch.
   - Sin Auth.
   - Sin Router.
   - Sin Storage.
   - Sin CSS inline.
   - Sin rutas inventadas.
   - Sin /home.
   - Sin roles fuera de admin/user.
========================================================= */

import {
  normalizeHomeDashboard,
  normalizeHomeWidgets,
  normalizeHomeTickets,
  normalizeHomeInvoices,
  normalizeHomeUsers,
  normalizeHomeClients,
  normalizeHomeActivityList,
} from "./home.model.js";

export const HOME_SELECTORS_VERSION = "home.selectors.v1";

/* =========================================================
   CONSTANTS
========================================================= */

export const DEFAULT_PAGE_SIZE = 5;
export const DEFAULT_CURRENCY = "EUR";
export const DEFAULT_LOCALE = "es-ES";

export const HOME_ROUTES = Object.freeze({
  HOME: "/",
  INCIDENCIAS: "/incidencias",
  FACTURAS: "/facturas",
  CLIENTES: "/clientes",
  USUARIOS: "/usuarios",
  CUENTA: "/cuenta",
  AJUSTES: "/ajustes",
});

const VALID_ROLES = Object.freeze(["admin", "user"]);

const TICKET_OPEN_KEYS = Object.freeze([
  "pending",
  "open",
  "progress",
]);

const TICKET_CLOSED_KEYS = Object.freeze([
  "resolved",
  "closed",
]);

const INVOICE_PENDING_KEYS = Object.freeze([
  "pending",
  "overdue",
  "partial",
]);

const COLLECTION_ITEM_KEYS = Object.freeze([
  "items",
  "rows",
  "data",
  "results",
  "records",
  "value",
  "docs",
  "documents",
  "list",
]);

const TICKET_ALIASES = Object.freeze([
  "tickets",
  "incidencias",
  "incidents",
  "issues",
]);

const INVOICE_ALIASES = Object.freeze([
  "facturas",
  "invoices",
  "bills",
  "billing",
]);

const USER_ALIASES = Object.freeze([
  "users",
  "usuarios",
  "members",
]);

const CLIENT_ALIASES = Object.freeze([
  "clients",
  "clientes",
  "customers",
]);

const ACTIVITY_ALIASES = Object.freeze([
  "activity",
  "activities",
  "recentActivity",
  "recent",
  "timeline",
  "events",
]);

/* =========================================================
   SAFE HELPERS
========================================================= */

export function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

export function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "string") {
    let clean = value
      .trim()
      .replace(/[€$£¥%]/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s/g, "");

    if (!clean || clean === "-" || clean === "+") return fallback;

    const hasComma = clean.includes(",");
    const hasDot = clean.includes(".");

    if (hasComma && hasDot) {
      const lastComma = clean.lastIndexOf(",");
      const lastDot = clean.lastIndexOf(".");

      clean =
        lastComma > lastDot
          ? clean.replace(/\./g, "").replace(/,/g, ".")
          : clean.replace(/,/g, "");
    } else if (hasComma) {
      clean = clean.replace(/,/g, ".");
    }

    const number = Number(clean);
    return Number.isFinite(number) ? number : fallback;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

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
    .replace(/[^a-z0-9_:.]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function clampNumber(value = 0, min = 0, max = Number.POSITIVE_INFINITY) {
  const number = safeNumber(value, min);
  return Math.min(Math.max(number, min), max);
}

export function roundMoney(value = 0) {
  const number = safeNumber(value, NaN);
  return Number.isFinite(number)
    ? Math.round((number + Number.EPSILON) * 100) / 100
    : 0;
}

export function getPath(object = {}, path = "") {
  const root = safeObject(object, null);
  const cleanPath = safeText(path, "");

  if (!root || !cleanPath) return undefined;

  return cleanPath.split(".").reduce((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return acc?.[key];
  }, root);
}

export function firstPath(object = {}, paths = []) {
  return first(...safeArray(paths).map((path) => getPath(object, path)));
}

export function uniqueBy(items = [], picker = (item) => item) {
  const seen = new Set();
  const output = [];

  safeArray(items).forEach((item, index) => {
    const raw = safeText(picker(item, index), "");
    const key = raw ? normalizeKey(raw) : "";

    if (!key) {
      output.push(item);
      return;
    }

    if (seen.has(key)) return;

    seen.add(key);
    output.push(item);
  });

  return output;
}

export function toTimestamp(value = null) {
  if (!value) return 0;

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? 0 : time;
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

  const esDate = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*|\s+)?(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (esDate) {
    const [, dd, mm, yyyy, hh = "0", min = "0", ss = "0"] = esDate;
    const date = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(min),
      Number(ss)
    );

    const time = date.getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  const date = new Date(raw.includes("T") || raw.includes("Z") ? raw : `${raw}T00:00:00`);
  const time = date.getTime();

  return Number.isNaN(time) ? 0 : time;
}

export function normalizeRoute(route = "") {
  const raw = safeText(route, "");

  if (!raw) return "";

  const lower = raw.toLowerCase();

  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:")
  ) {
    return "";
  }

  if (/^https?:\/\//i.test(raw)) return "";

  return raw.startsWith("/") ? raw : `/${raw}`;
}

export function isSameIdentity(a = "", b = "") {
  const left = normalizeKey(a);
  const right = normalizeKey(b);

  return Boolean(left && right && left === right);
}

/* =========================================================
   FORMATTERS
========================================================= */

const numberFormatterCache = new Map();
const moneyFormatterCache = new Map();
const dateFormatterCache = new Map();

export function getNumberFormatter(locale = DEFAULT_LOCALE) {
  const key = `${safeText(locale, DEFAULT_LOCALE)}:number`;

  if (numberFormatterCache.has(key)) return numberFormatterCache.get(key);

  const formatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  });

  numberFormatterCache.set(key, formatter);
  return formatter;
}

export function formatNumber(value = 0, locale = DEFAULT_LOCALE) {
  const number = safeNumber(value, NaN);

  if (!Number.isFinite(number)) return "0";

  try {
    return getNumberFormatter(locale).format(number);
  } catch {
    return String(Math.round(number));
  }
}

export function getMoneyFormatter(currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE) {
  const code = safeText(currency, DEFAULT_CURRENCY).toUpperCase();
  const key = `${safeText(locale, DEFAULT_LOCALE)}:${code}`;

  if (moneyFormatterCache.has(key)) return moneyFormatterCache.get(key);

  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  moneyFormatterCache.set(key, formatter);
  return formatter;
}

export function formatMoney(value = 0, currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE) {
  const amount = safeNumber(value, NaN);

  if (!Number.isFinite(amount)) return "—";

  const code = safeText(currency, DEFAULT_CURRENCY).toUpperCase();

  try {
    return getMoneyFormatter(code, locale).format(amount);
  } catch {
    return `${amount.toFixed(2).replace(".", ",")} ${code}`;
  }
}

export function getDateTimeFormatter(locale = DEFAULT_LOCALE) {
  const key = `${safeText(locale, DEFAULT_LOCALE)}:date-time`;

  if (dateFormatterCache.has(key)) return dateFormatterCache.get(key);

  const formatter = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  dateFormatterCache.set(key, formatter);
  return formatter;
}

export function getDateFormatter(locale = DEFAULT_LOCALE) {
  const key = `${safeText(locale, DEFAULT_LOCALE)}:date`;

  if (dateFormatterCache.has(key)) return dateFormatterCache.get(key);

  const formatter = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  dateFormatterCache.set(key, formatter);
  return formatter;
}

export function formatDateTime(value = null, locale = DEFAULT_LOCALE) {
  const timestamp = toTimestamp(value);

  if (!timestamp) return "—";

  try {
    return getDateTimeFormatter(locale).format(new Date(timestamp));
  } catch {
    return "—";
  }
}

export function formatDateShort(value = null, locale = DEFAULT_LOCALE) {
  const timestamp = toTimestamp(value);

  if (!timestamp) return "—";

  try {
    return getDateFormatter(locale).format(new Date(timestamp));
  } catch {
    return "—";
  }
}

export function formatRelativeDate(value = null) {
  const timestamp = toTimestamp(value);

  if (!timestamp) return "Sin fecha";

  const diffMs = timestamp - Date.now();
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
  const timestamp = toTimestamp(value);

  if (!timestamp) return "Sin fecha";

  const diffHours = Math.abs(Date.now() - timestamp) / 3600000;

  return diffHours <= 72 ? formatRelativeDate(value) : formatDateTime(value);
}

/* =========================================================
   AVATAR
========================================================= */

export function getInitials(value = "") {
  const clean = normalizeWhitespace(value);

  if (!clean) return "ON";

  const parts = clean.split(" ").filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "ON";
}

/* =========================================================
   DASHBOARD / SUMMARY
========================================================= */

function looksLikeDashboard(value = null) {
  const object = safeObject(value, null);

  if (!object) return false;

  return Boolean(
    "summary" in object ||
      "stats" in object ||
      "metrics" in object ||
      "totals" in object ||
      "widgets" in object ||
      "tickets" in object ||
      "incidencias" in object ||
      "facturas" in object ||
      "invoices" in object ||
      "users" in object ||
      "usuarios" in object ||
      "clients" in object ||
      "clientes" in object ||
      "activity" in object ||
      "recent" in object
  );
}

export function getDashboard(input = {}) {
  const data = safeObject(input);

  const direct = first(
    data.dashboard,
    data.home,
    data.state?.dashboard,
    data.payload?.dashboard,
    data.result?.dashboard,
    data.response?.dashboard,
    data.data?.dashboard,
    data.payload?.home,
    data.result?.home,
    data.data?.home
  );

  if (isObject(direct)) return direct;

  return looksLikeDashboard(data) ? data : {};
}

export function getNormalizedDashboard(input = {}) {
  try {
    return normalizeHomeDashboard(getDashboard(input) || input);
  } catch {
    return getDashboard(input);
  }
}

export function getSummary(input = {}) {
  const data = safeObject(input);
  const dashboard = getDashboard(data);

  return safeObject(
    first(
      data.summary,
      data.stats,
      data.metrics,
      data.totals,
      data.counts,

      data.state?.summary,
      data.state?.stats,
      data.state?.metrics,
      data.state?.totals,
      data.state?.counts,

      dashboard.summary,
      dashboard.stats,
      dashboard.metrics,
      dashboard.totals,
      dashboard.counts,

      data.payload?.summary,
      data.result?.summary,
      data.response?.summary,
      data.data?.summary,
      {}
    )
  );
}

export function getSummaryValue(input = {}, keys = [], fallback = null) {
  const data = safeObject(input);
  const summary = getSummary(data);
  const dashboard = getDashboard(data);

  const sources = [
    summary,
    dashboard,
    data.state,
    data.payload,
    data.result,
    data.response,
    data.data,
    data,
  ].filter(Boolean);

  const candidates = [];

  for (const key of safeArray(keys)) {
    for (const source of sources) {
      candidates.push(source?.[key]);

      if (String(key).includes(".")) {
        candidates.push(getPath(source, key));
      }
    }
  }

  return first(...candidates, fallback);
}

export function getBestSummaryNumber(input = {}, keys = [], fallback = 0, extraCandidates = []) {
  const candidates = [
    ...safeArray(keys).map((key) => getSummaryValue(input, [key], null)),
    ...safeArray(extraCandidates),
    fallback,
  ];

  const numbers = candidates
    .map((value) => safeNumber(value, NaN))
    .filter((value) => Number.isFinite(value));

  if (!numbers.length) return safeNumber(fallback, 0);

  const positives = numbers.filter((value) => value > 0);

  return positives.length ? Math.max(...positives) : Math.max(...numbers);
}

/* =========================================================
   COLLECTIONS
========================================================= */

export function unwrapCollectionPayload(value = null, depth = 0) {
  if (value === null || value === undefined) return {};

  if (depth > 8) return value;

  if (Array.isArray(value)) {
    return {
      items: value,
      total: value.length,
      count: value.length,
    };
  }

  const object = safeObject(value, null);

  if (!object) return {};

  if (COLLECTION_ITEM_KEYS.some((key) => Array.isArray(object[key]))) {
    return object;
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

export function normalizeCollection(value = null) {
  if (Array.isArray(value)) return value;

  const object = safeObject(unwrapCollectionPayload(value));

  return safeArray(first(...COLLECTION_ITEM_KEYS.map((key) => object[key]), []));
}

export function getRemoteCountFromCollection(value = null, fallback = 0) {
  const object = safeObject(unwrapCollectionPayload(value));

  return Math.max(
    safeNumber(fallback, 0),
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
        object.pagination?.total,
        fallback
      ),
      fallback
    )
  );
}

export function resolveCollectionSource(input = {}, aliases = []) {
  const data = safeObject(input);
  const dashboard = getDashboard(data);

  const sources = [
    data,
    data.state,
    dashboard,
    data.payload,
    data.result,
    data.response,
    data.data,
  ].filter(Boolean);

  const candidates = [];

  for (const alias of safeArray(aliases)) {
    for (const source of sources) {
      candidates.push(source?.[alias]);
      candidates.push(source?.collections?.[alias]);
      candidates.push(source?.resources?.[alias]);
      candidates.push(source?.lists?.[alias]);
    }
  }

  return first(...candidates, []);
}

/* =========================================================
   WIDGETS
========================================================= */

export function getWidgets(input = {}) {
  const data = safeObject(input);
  const dashboard = getDashboard(data);

  return normalizeHomeWidgets(
    normalizeCollection(
      first(
        data.widgets,
        data.cards,
        data.kpis,
        data.blocks,

        data.state?.widgets,
        dashboard.widgets,
        dashboard.cards,
        dashboard.kpis,
        dashboard.blocks,

        data.payload?.widgets,
        data.result?.widgets,
        data.response?.widgets,
        data.data?.widgets,
        []
      )
    )
  );
}

export function getWidgetId(widget = {}) {
  return safeText(first(widget.widgetId, widget.widgetKey, widget.id, widget.key, widget.slug, widget.code), "");
}

export function getWidgetTitle(widget = {}) {
  return safeText(first(widget.title, widget.name, widget.label, widget.heading), "Bloque");
}

export function getWidgetText(widget = {}) {
  return safeText(first(widget.description, widget.descripcion, widget.subtitle, widget.text, widget.summary), "");
}

export function getWidgetValue(widget = {}) {
  return first(widget.value, widget.total, widget.amount, widget.count, widget.metric, "—");
}

export function getWidgetTrend(widget = {}) {
  return first(widget.trend, widget.delta, widget.change, widget.variation, "");
}

export function getWidgetType(widget = {}) {
  return normalizeKey(first(widget.type, widget.kind, widget.variant, widget.category, "widget"));
}

export function getWidgetRoute(widget = {}) {
  return normalizeRoute(first(widget.route, widget.href, widget.link, widget.to, ""));
}

export function getWidgetNumericValue(input = {}, matchers = [], fallback = null) {
  const widgets = getWidgets(input);
  const aliases = safeArray(matchers).map(normalizeKey).filter(Boolean);

  if (!widgets.length || !aliases.length) return fallback;

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
      .map(normalizeKey)
      .filter(Boolean)
      .join(" ");

    if (!aliases.some((alias) => searchable.includes(alias))) continue;

    const value = safeNumber(
      first(widget.value, widget.total, widget.amount, widget.count, widget.metric),
      NaN
    );

    if (Number.isFinite(value)) return value;
  }

  return fallback;
}

/* =========================================================
   ROLE / USER
========================================================= */

export function normalizeRole(value = "") {
  return String(value || "").toLowerCase() === "admin" ? "admin" : "user";
}

export function getUser(input = {}) {
  const data = safeObject(input);
  const dashboard = getDashboard(data);

  return safeObject(
    first(
      data.user,
      data.currentUser,
      data.profile,

      data.state?.user,
      data.state?.currentUser,
      data.state?.profile,
      data.state?.session?.user,

      dashboard.user,
      dashboard.currentUser,
      dashboard.profile,

      data.payload?.user,
      data.result?.user,
      data.response?.user,
      data.data?.user,
      {}
    )
  );
}

export function getRole(input = {}) {
  const data = safeObject(input);
  const dashboard = getDashboard(data);
  const user = getUser(data);

  return normalizeRole(
    first(
      data.role,
      data.currentRole,

      data.state?.role,
      data.state?.currentRole,
      data.state?.userRole,
      data.state?.session?.role,

      dashboard.role,

      user.role,
      user.rol,

      data.payload?.role,
      data.result?.role,
      data.response?.role,
      data.data?.role,
      "user"
    )
  );
}

export function isAdminRole(role = "") {
  return normalizeRole(role) === "admin";
}

export function isUserRole(role = "") {
  return normalizeRole(role) === "user";
}

export function canSeeUsersModule(input = {}) {
  return isAdminRole(getRole(input));
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
      input.avatar,
      input.avatarUrl
    ),
    ""
  );
}

/* =========================================================
   TICKETS
========================================================= */

export function getTicketIdentity(item = {}) {
  return safeText(
    first(
      item.ticketId,
      item.incidenciaId,
      item.code,
      item.numero,
      item.ticketCode,
      item.entityId,
      item.id,
      item._id,

      item.raw?.ticketId,
      item.raw?.incidenciaId,
      item.raw?.code,
      item.raw?.numero,
      item.raw?.ticketCode,
      item.raw?.entityId,
      item.raw?.id,
      item.raw?._id
    ),
    ""
  );
}

export function getTicketId(item = {}) {
  return getTicketIdentity(item) || "INC-SIN-ID";
}

export function getTicketUniqueKey(item = {}, index = 0) {
  return (
    getTicketIdentity(item) ||
    [
      getTicketSubject(item),
      getTicketOwnerEmail(item),
      getTicketCreatedAt(item),
      getTicketUpdatedAt(item),
      index,
    ]
      .map((value) => safeText(value, ""))
      .filter(Boolean)
      .join("|")
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
      item.client?.name,
      item.customer?.name,
      item.createdBy?.name,
      item.user?.name,
      item.owner?.name,

      item.raw?.clientName,
      item.raw?.clienteNombre,
      item.raw?.customerName,
      item.raw?.requesterName,
      item.raw?.userName,
      item.raw?.createdByName,
      item.raw?.ownerName,
      item.raw?.name
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
      item.user?.email,
      item.owner?.email,

      item.raw?.clientEmail,
      item.raw?.clienteEmail,
      item.raw?.email,
      item.raw?.emailCliente
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
      item.owner?.avatarUrl
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
  const raw = isObject(value) ? getTicketStatus(value) : value;
  const key = normalizeKey(raw);

  if (["pending", "pendiente", "new", "created", "nueva", "nuevo"].includes(key)) return "pending";
  if (["open", "opened", "abierta", "abierto"].includes(key)) return "open";
  if (["progress", "in_progress", "inprogress", "en_proceso", "working", "assigned"].includes(key)) return "progress";
  if (["resolved", "resuelta", "resuelto", "solved"].includes(key)) return "resolved";
  if (["closed", "close", "cerrada", "cerrado", "cancelled", "canceled", "archived"].includes(key)) return "closed";

  return "pending";
}

export function getTicketStatusLabel(value = "") {
  const key = getTicketStatusKey(value);

  if (key === "open") return "Abierta";
  if (key === "pending") return "Pendiente";
  if (key === "progress") return "En proceso";
  if (key === "resolved") return "Resuelta";
  if (key === "closed") return "Cerrada";

  return "Pendiente";
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

  if (["critical", "critica", "critico", "p0", "blocker"].includes(key)) return "critical";
  if (["urgent", "urgente", "high", "alta", "p1"].includes(key)) return "urgent";
  if (["low", "baja", "minor", "p3"].includes(key)) return "low";

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
  const assigned = first(
    item.assignedTo?.name,
    item.assignedTo?.displayName,
    item.assignment?.assignedToName,
    item.assignment?.agentName,
    item.assignment?.technician?.name,
    item.tecnico?.name,
    item.tecnico?.nombre,
    item.tecnico,
    item.agent,

    item.raw?.assignedTo?.name,
    item.raw?.assignedTo?.displayName,
    item.raw?.assignment?.assignedToName,
    item.raw?.assignment?.agentName,
    item.raw?.assignment?.technician?.name,
    item.raw?.tecnico?.name,
    item.raw?.tecnico?.nombre,
    item.raw?.tecnico,
    item.raw?.agent
  );

  if (isObject(assigned)) {
    return safeText(first(assigned.name, assigned.nombre, assigned.displayName, assigned.email, assigned.id), "Sin asignar");
  }

  return safeText(assigned, "Sin asignar");
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
    toTimestamp(getTicketUpdatedAt(item)) ||
    toTimestamp(getTicketCreatedAt(item)) ||
    toTimestamp(item?._ts) ||
    0
  );
}

export function compareTicketsNewestFirst(a = {}, b = {}) {
  const diff = getTicketSortTimestamp(b) - getTicketSortTimestamp(a);

  if (diff !== 0) return diff;

  return safeText(getTicketId(b), "").localeCompare(
    safeText(getTicketId(a), ""),
    DEFAULT_LOCALE,
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

export function getInvoiceIdentity(item = {}) {
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
    ""
  );
}

export function getInvoiceId(item = {}) {
  return getInvoiceIdentity(item) || "FAC-SIN-ID";
}

export function getInvoiceUniqueKey(item = {}, index = 0) {
  return (
    getInvoiceIdentity(item) ||
    [
      getInvoiceAmount(item),
      getInvoiceCurrency(item),
      item.createdAt,
      item.date,
      index,
    ]
      .map((value) => safeText(value, ""))
      .filter(Boolean)
      .join("|")
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
  return safeText(first(item.currency, item.moneda, item.raw?.currency, item.raw?.moneda, DEFAULT_CURRENCY), DEFAULT_CURRENCY).toUpperCase();
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
  if (["overdue", "vencida", "vencido"].includes(key)) return "overdue";
  if (["partial", "parcial", "pago_parcial"].includes(key)) return "partial";
  if (["cancelled", "canceled", "cancelada", "cancelado"].includes(key)) return "cancelled";
  if (["draft", "borrador"].includes(key)) return "draft";

  return "pending";
}

export function isInvoicePendingLike(item = {}) {
  return INVOICE_PENDING_KEYS.includes(getInvoiceStatusKey(item));
}

/* =========================================================
   USERS / CLIENTS
========================================================= */

export function getUserId(item = {}) {
  return safeText(first(item.userId, item.usuarioId, item.id, item._id, item.email, item.username, item.raw?.userId, item.raw?.usuarioId, item.raw?.id, item.raw?._id, item.raw?.email, item.raw?.username), "");
}

export function getUserUniqueKey(item = {}, index = 0) {
  return getUserId(item) || `user:${index}`;
}

export function isActiveUser(item = {}) {
  const active = first(item.active, item.isActive, item.enabled, item.status, item.estado, item.raw?.active, item.raw?.isActive, item.raw?.enabled, item.raw?.status, item.raw?.estado);
  const key = normalizeKey(active);

  if (active === false || active === 0) return false;

  return !["false", "disabled", "inactive", "inactivo", "blocked", "deleted"].includes(key);
}

export function getClientId(item = {}) {
  return safeText(first(item.clienteId, item.clientId, item.customerId, item.id, item._id, item.email, item.nif, item.cif, item.raw?.clienteId, item.raw?.clientId, item.raw?.customerId, item.raw?.id, item.raw?._id, item.raw?.email, item.raw?.nif, item.raw?.cif), "");
}

export function getClientUniqueKey(item = {}, index = 0) {
  return getClientId(item) || `client:${index}`;
}

export function isActiveClient(item = {}) {
  const active = first(item.active, item.isActive, item.enabled, item.status, item.estado, item.raw?.active, item.raw?.isActive, item.raw?.enabled, item.raw?.status, item.raw?.estado);
  const key = normalizeKey(active);

  if (active === false || active === 0) return false;

  return !["false", "disabled", "inactive", "inactivo", "blocked", "deleted"].includes(key);
}

/* =========================================================
   COLLECTION RESOLUTION
========================================================= */

export function getCollections(input = {}) {
  const normalizedDashboard = getNormalizedDashboard(input);
  const dashboard = getDashboard(input);
  const summary = getSummary(input);

  const ticketsSource = first(
    resolveCollectionSource(normalizedDashboard, TICKET_ALIASES),
    resolveCollectionSource(input, TICKET_ALIASES),
    []
  );

  const invoicesSource = first(
    resolveCollectionSource(normalizedDashboard, INVOICE_ALIASES),
    resolveCollectionSource(input, INVOICE_ALIASES),
    []
  );

  const usersSource = first(
    resolveCollectionSource(normalizedDashboard, USER_ALIASES),
    resolveCollectionSource(input, USER_ALIASES),
    []
  );

  const clientsSource = first(
    resolveCollectionSource(normalizedDashboard, CLIENT_ALIASES),
    resolveCollectionSource(input, CLIENT_ALIASES),
    []
  );

  const activitySource = first(
    resolveCollectionSource(normalizedDashboard, ACTIVITY_ALIASES),
    resolveCollectionSource(input, ACTIVITY_ALIASES),
    []
  );

  const tickets = sortTicketsNewestFirst(
    uniqueBy(
      normalizeHomeTickets(normalizeCollection(ticketsSource)),
      getTicketUniqueKey
    )
  );

  const invoices = uniqueBy(
    normalizeHomeInvoices(normalizeCollection(invoicesSource)),
    getInvoiceUniqueKey
  );

  const users = uniqueBy(
    normalizeHomeUsers(normalizeCollection(usersSource)),
    getUserUniqueKey
  );

  const clients = uniqueBy(
    normalizeHomeClients(normalizeCollection(clientsSource)),
    getClientUniqueKey
  );

  const activity = normalizeHomeActivityList(normalizeCollection(activitySource));

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
        normalizedDashboard.ticketsTotal,
        normalizedDashboard.incidenciasTotal,
        dashboard.ticketsTotal,
        dashboard.incidenciasTotal,
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
        normalizedDashboard.invoicesTotal,
        normalizedDashboard.facturasTotal,
        dashboard.invoicesTotal,
        dashboard.facturasTotal,
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
        normalizedDashboard.usersTotal,
        normalizedDashboard.usuariosTotal,
        dashboard.usersTotal,
        dashboard.usuariosTotal,
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
        normalizedDashboard.clientsTotal,
        normalizedDashboard.clientesTotal,
        dashboard.clientsTotal,
        dashboard.clientesTotal,
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
    .map((item) => toTimestamp(getTicketUpdatedAt(item)) || toTimestamp(getTicketCreatedAt(item)))
    .filter(Boolean);

  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}

export function computeHomeStats(input = {}) {
  const data = safeObject(input);
  const collections = getCollections(data);
  const admin = isAdminRole(getRole(data));

  const tickets = collections.tickets;
  const invoices = collections.invoices;
  const users = collections.users;
  const clients = collections.clients;

  const computedOpenTickets = tickets.filter(isTicketOpenLike).length;
  const computedClosedTickets = tickets.filter(isTicketClosedLike).length;
  const computedUrgentTickets = tickets.filter(isTicketUrgent).length;
  const computedPendingInvoices = invoices.filter(isInvoicePendingLike).length;

  const computedInvoiceAmount = roundMoney(
    invoices.reduce((sum, item) => sum + getInvoiceAmount(item), 0)
  );

  const computedActiveUsers = users.filter(isActiveUser).length;
  const computedActiveClients = clients.filter(isActiveClient).length;

  const attachmentsCount = tickets.reduce(
    (sum, item) => sum + getTicketAttachmentsCount(item),
    0
  );

  const lastTicketUpdate = getLatestDateFromTickets(tickets);

  const widgetInvoiceAmount = getWidgetNumericValue(
    data,
    ["facturacion", "facturas", "billing", "invoice", "invoices", "total_facturado", "importe_facturas"],
    null
  );

  const widgetUsersCount = getWidgetNumericValue(
    data,
    ["usuarios", "usuarios_activos", "users", "active_users"],
    null
  );

  const widgetClientsCount = getWidgetNumericValue(
    data,
    ["clientes", "clientes_activos", "clients", "active_clients"],
    null
  );

  const totalTickets = getBestSummaryNumber(
    data,
    ["totalTickets", "ticketsTotal", "incidenciasTotal", "totalIncidencias", "ticketsCount", "incidenciasCount"],
    collections.ticketsRemoteCount,
    [collections.ticketsRemoteCount, tickets.length]
  );

  const openTickets = getBestSummaryNumber(
    data,
    ["openTickets", "pendingTickets", "openIncidencias", "pendingIncidencias", "incidenciasAbiertas"],
    computedOpenTickets,
    [computedOpenTickets]
  );

  const closedTickets = getBestSummaryNumber(
    data,
    ["closedTickets", "resolvedTickets", "closedIncidencias", "resolvedIncidencias", "incidenciasCerradas"],
    computedClosedTickets,
    [computedClosedTickets]
  );

  const urgentTickets = getBestSummaryNumber(
    data,
    ["urgentTickets", "urgentIncidencias", "highPriorityTickets", "ticketsUrgentes", "incidenciasUrgentes"],
    computedUrgentTickets,
    [computedUrgentTickets]
  );

  const totalInvoices = getBestSummaryNumber(
    data,
    ["totalInvoices", "invoicesTotal", "facturasTotal", "totalFacturas", "invoicesCount", "facturasCount"],
    collections.invoicesRemoteCount,
    [collections.invoicesRemoteCount, invoices.length]
  );

  const pendingInvoices = getBestSummaryNumber(
    data,
    ["pendingInvoices", "pendingFacturas", "facturasPendientes", "invoicesPending", "facturasVencidas", "overdueInvoices"],
    computedPendingInvoices,
    [computedPendingInvoices]
  );

  const invoiceAmount = roundMoney(
    getBestSummaryNumber(
      data,
      ["invoiceAmount", "billingTotal", "totalBilling", "totalFacturado", "importeFacturas", "facturacionVisible", "facturacionTotal"],
      computedInvoiceAmount,
      [computedInvoiceAmount, widgetInvoiceAmount]
    )
  );

  const usersCount = admin
    ? getBestSummaryNumber(
        data,
        ["usersCount", "usuariosCount", "totalUsers", "totalUsuarios", "activeUsers", "usuariosActivos"],
        collections.usersRemoteCount || computedActiveUsers,
        [collections.usersRemoteCount, computedActiveUsers, widgetUsersCount]
      )
    : 0;

  const clientsCount = getBestSummaryNumber(
    data,
    ["clientsCount", "clientesCount", "customersCount", "totalClients", "totalClientes", "totalCustomers", "activeClients", "clientesActivos"],
    collections.clientsRemoteCount || computedActiveClients,
    [collections.clientsRemoteCount, computedActiveClients, widgetClientsCount]
  );

  const healthRatio = totalTickets
    ? clampNumber(((totalTickets - openTickets) / totalTickets) * 100, 0, 100)
    : 100;

  return {
    role: getRole(data),
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
    activeUsersCount: admin ? computedActiveUsers : 0,

    clientsCount,
    activeClientsCount: computedActiveClients,

    attachmentsCount,
    lastTicketUpdate,
    healthRatio,
  };
}

/* =========================================================
   CARDS / ACTIONS
========================================================= */

export function getStatCards(input = {}) {
  const stats = computeHomeStats(input);

  if (stats.admin) {
    return [
      {
        iconName: "ticket",
        label: "Incidencias abiertas",
        value: formatNumber(stats.openTickets),
        rawValue: stats.openTickets,
        text: `${formatNumber(stats.totalTickets)} solicitudes totales.`,
        modifier: "open",
        badge: stats.urgentTickets ? `${formatNumber(stats.urgentTickets)} urg.` : "",
      },
      {
        iconName: "euro",
        label: "Facturación visible",
        value: formatMoney(stats.invoiceAmount, DEFAULT_CURRENCY),
        rawValue: stats.invoiceAmount,
        text: `${formatNumber(stats.pendingInvoices)} facturas pendientes o vencidas.`,
        modifier: "billing",
      },
      {
        iconName: "client",
        label: "Clientes",
        value: formatNumber(stats.clientsCount),
        rawValue: stats.clientsCount,
        text: "Clientes sincronizados en el panel.",
        modifier: "clients",
      },
      {
        iconName: "users",
        label: "Usuarios",
        value: formatNumber(stats.usersCount),
        rawValue: stats.usersCount,
        text: "Usuarios activos o sincronizados.",
        modifier: "users",
      },
    ];
  }

  return [
    {
      iconName: "ticket",
      label: "Mis incidencias",
      value: formatNumber(stats.totalTickets),
      rawValue: stats.totalTickets,
      text: `${formatNumber(stats.openTickets)} solicitudes abiertas o en seguimiento.`,
      modifier: "open",
      badge: stats.urgentTickets ? `${formatNumber(stats.urgentTickets)} urg.` : "",
    },
    {
      iconName: "euro",
      label: "Facturas pendientes",
      value: formatNumber(stats.pendingInvoices),
      rawValue: stats.pendingInvoices,
      text: `${formatMoney(stats.invoiceAmount, DEFAULT_CURRENCY)} en facturación visible.`,
      modifier: "billing",
    },
    {
      iconName: "paperclip",
      label: "Adjuntos",
      value: formatNumber(stats.attachmentsCount),
      rawValue: stats.attachmentsCount,
      text: "Documentos vinculados a tus incidencias.",
      modifier: "files",
    },
    {
      iconName: "clock",
      label: "Última actividad",
      value: stats.lastTicketUpdate ? formatRelativeDate(stats.lastTicketUpdate) : "Sin fecha",
      rawValue: stats.lastTicketUpdate || null,
      text: "Movimiento más reciente.",
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
        title: "Incidencias",
        text: "Revisar solicitudes, estados y prioridades.",
        action: "go-incidencias",
        dataAction: "navigate-home",
        route: HOME_ROUTES.INCIDENCIAS,
        modifier: "primary",
      },
      {
        iconName: "invoice",
        title: "Facturación",
        text: "Consultar importes, estados y vencimientos.",
        action: "go-facturas",
        dataAction: "navigate-home",
        route: HOME_ROUTES.FACTURAS,
        modifier: "billing",
      },
      {
        iconName: "client",
        title: "Clientes",
        text: "Abrir el listado de clientes.",
        action: "go-clientes",
        dataAction: "navigate-home",
        route: HOME_ROUTES.CLIENTES,
        modifier: "clients",
      },
      {
        iconName: "users",
        title: "Usuarios",
        text: "Gestionar usuarios y acceso al panel.",
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
      title: "Crear incidencia",
      text: "Abre una solicitud para soporte.",
      action: "create-incidencia",
      dataAction: "create-incidencia",
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
      text: "Revisa facturas, importes y estados.",
      action: "go-facturas",
      dataAction: "navigate-home",
      route: HOME_ROUTES.FACTURAS,
      modifier: "billing",
    },
    {
      iconName: "account",
      title: "Mi cuenta",
      text: "Actualiza tus datos y preferencias.",
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
    text: formatMoney(getInvoiceAmount(item), getInvoiceCurrency(item)),
    date: first(item.updatedAt, item.modifiedAt, item.createdAt, item.date, item.raw?.updatedAt, item.raw?.createdAt, item.raw?.date),
    route: HOME_ROUTES.FACTURAS,
    action: "navigate-home",
    entityId: getInvoiceId(item),
  }));

  const clientActivity = collections.clients.slice(0, 3).map((item) => ({
    type: "client",
    title: safeText(first(item.name, item.nombre, item.razonSocial, item.company, item.email, item.raw?.name, item.raw?.nombre, item.raw?.razonSocial, item.raw?.company, item.raw?.email), "Cliente"),
    text: "Cliente sincronizado en el panel.",
    date: first(item.updatedAt, item.createdAt, item.raw?.updatedAt, item.raw?.createdAt),
    route: HOME_ROUTES.CLIENTES,
    action: "navigate-home",
    entityId: getClientId(item),
  }));

  const userActivity = isAdminRole(getRole(input))
    ? collections.users.slice(0, 3).map((item) => ({
        type: "user",
        title: safeText(first(item.name, item.nombre, item.displayName, item.fullName, item.username, item.email, item.raw?.name, item.raw?.nombre, item.raw?.displayName, item.raw?.fullName, item.raw?.username, item.raw?.email), "Usuario"),
        text: "Usuario disponible en el sistema.",
        date: first(item.lastLoginAt, item.updatedAt, item.createdAt, item.raw?.lastLoginAt, item.raw?.updatedAt, item.raw?.createdAt),
        route: HOME_ROUTES.USUARIOS,
        action: "navigate-home",
        entityId: getUserId(item),
      }))
    : [];

  return normalizeHomeActivityList([
    ...ticketActivity,
    ...invoiceActivity,
    ...clientActivity,
    ...userActivity,
  ])
    .filter((item) => item.title || item.text)
    .sort((a, b) => toTimestamp(b.date) - toTimestamp(a.date));
}

export function getActivity(input = {}) {
  const collections = getCollections(input);

  return collections.activity.length
    ? normalizeHomeActivityList(collections.activity)
    : buildSyntheticActivity(input);
}

export function getActivityTitle(item = {}) {
  return safeText(first(item.title, item.name, item.subject, item.label, item.raw?.title, item.raw?.name, item.raw?.subject, item.raw?.label), "Actividad registrada");
}

export function getActivityText(item = {}) {
  return safeText(first(item.text, item.description, item.message, item.detail, item.preview, item.raw?.text, item.raw?.description, item.raw?.message, item.raw?.detail, item.raw?.preview), "Sin detalle adicional.");
}

export function getActivityDate(item = {}) {
  return first(item.date, item.createdAt, item.updatedAt, item.timestamp, item.raw?.date, item.raw?.createdAt, item.raw?.updatedAt, item.raw?.timestamp);
}

export function getActivityType(item = {}) {
  const key = normalizeKey(first(item.type, item.kind, item.category, item.raw?.type, item.raw?.kind, item.raw?.category, "activity"));

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
  const rows = safeArray(items);
  const data = safeObject(input);
  const runtime = safeObject(data.state);

  const pageSize = clampNumber(
    first(data.pageSize, data.homePageSize, runtime.pageSize, runtime.homePageSize, DEFAULT_PAGE_SIZE),
    1,
    50
  );

  const totalCount = Math.max(
    rows.length,
    safeNumber(first(data.totalCount, data.remoteCount, runtime.totalCount, runtime.remoteCount, runtime.total, rows.length), rows.length)
  );

  const totalPages = Math.max(1, Math.ceil((totalCount || 1) / pageSize));

  const currentPage = clampNumber(
    first(data.page, data.homePage, runtime.page, runtime.homePage, 1),
    1,
    totalPages
  );

  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = rows.slice(startIndex, startIndex + pageSize);

  const rangeStart = totalCount && pageItems.length ? startIndex + 1 : 0;
  const rangeEnd = totalCount ? Math.min(startIndex + pageItems.length, totalCount) : 0;

  return {
    allItems: rows,
    pageItems,
    items: pageItems,
    page: currentPage,
    currentPage,
    pageSize,
    totalPages,
    totalCount,
    total: totalCount,
    rangeStart,
    rangeEnd,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
}

/* =========================================================
   TEMPLATE DATA
========================================================= */

export function buildHomeTemplateData(input = {}) {
  const data = safeObject(input);
  const dashboard = getNormalizedDashboard(data);
  const summary = getSummary({
    ...data,
    dashboard,
  });

  const collections = getCollections({
    ...data,
    dashboard,
    summary,
  });

  const stats = computeHomeStats({
    ...data,
    dashboard,
    summary,
  });

  const widgets = getWidgets({
    ...data,
    dashboard,
  });

  const activity = getActivity({
    ...data,
    dashboard,
    summary,
  });

  const pagination = getPagination(collections.tickets, {
    ...data,
    totalCount: collections.ticketsRemoteCount,
  });

  const user = getUser(data);
  const role = getRole(data);
  const displayName = getDisplayName(data);
  const avatarUrl = getAvatarUrl(data);

  return {
    version: HOME_SELECTORS_VERSION,

    user,
    role,
    displayName,
    avatarUrl,
    initials: getInitials(displayName),

    dashboard,
    summary,
    stats,

    widgets,

    statCards: getStatCards({
      ...data,
      dashboard,
      summary,
    }),

    quickActions: getQuickActions({
      ...data,
      dashboard,
      summary,
    }),

    tickets: collections.tickets,
    incidencias: collections.tickets,

    invoices: collections.invoices,
    facturas: collections.invoices,

    users: collections.users,
    usuarios: collections.users,

    clients: collections.clients,
    clientes: collections.clients,

    activity,
    recentActivity: activity,
    recent: activity,

    collections,

    pagination,
    pageItems: pagination.pageItems,

    counts: {
      tickets: collections.tickets.length,
      ticketsRemote: collections.ticketsRemoteCount,

      invoices: collections.invoices.length,
      invoicesRemote: collections.invoicesRemoteCount,

      users: collections.users.length,
      usersRemote: collections.usersRemoteCount,

      clients: collections.clients.length,
      clientsRemote: collections.clientsRemoteCount,

      activity: activity.length,
      widgets: widgets.length,
    },

    meta: {
      requestId: first(dashboard.requestId, dashboard.meta?.requestId, data.requestId, ""),
      updatedAt: first(dashboard.updatedAt, dashboard.generatedAt, dashboard.meta?.updatedAt, ""),
      partial: Boolean(dashboard.partial),
      errorsCount: safeArray(dashboard.errors).length,
      canSeeUsers: canSeeUsersModule({
        ...data,
        dashboard,
        summary,
      }),
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  HOME_SELECTORS_VERSION,

  DEFAULT_PAGE_SIZE,
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,

  HOME_ROUTES,
  VALID_ROLES,
  TICKET_OPEN_KEYS,
  TICKET_CLOSED_KEYS,
  INVOICE_PENDING_KEYS,

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
  toTimestamp,
  normalizeRoute,
  isSameIdentity,

  getNumberFormatter,
  formatNumber,
  getMoneyFormatter,
  formatMoney,
  getDateTimeFormatter,
  getDateFormatter,
  formatDateTime,
  formatDateShort,
  formatRelativeDate,
  formatLastUpdate,

  getInitials,

  getDashboard,
  getNormalizedDashboard,
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

  normalizeRole,
  getUser,
  getRole,
  isAdminRole,
  isUserRole,
  canSeeUsersModule,
  getDisplayName,
  getAvatarUrl,

  getTicketIdentity,
  getTicketId,
  getTicketUniqueKey,
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

  getInvoiceIdentity,
  getInvoiceId,
  getInvoiceUniqueKey,
  getInvoiceAmount,
  getInvoiceCurrency,
  getInvoiceStatusKey,
  isInvoicePendingLike,

  getUserId,
  getUserUniqueKey,
  isActiveUser,

  getClientId,
  getClientUniqueKey,
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
  buildHomeTemplateData,
};
