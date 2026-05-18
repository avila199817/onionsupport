/* =========================================================
   Onion Support - Home Selectors
   Archivo: /src/views/home/home.selectors.js

   Responsabilidad:
   - Selectores puros para Home.
   - Leer dashboard normalizado.
   - Leer colecciones para template.js.
   - Calcular métricas/cards/actions.
   - Formatear números, dinero y fechas.
   - Resolver usuario/rol admin-user.
   - Sin fetch.
   - Sin Auth.
   - Sin Router.
   - Sin Storage.
   - Sin CSS inline.
   - Sin rutas inventadas.
   - Sin /home.
========================================================= */

import {
  normalizeHomeDashboard,
  normalizeHomeWidgets,
  normalizeHomeTickets,
  normalizeHomeInvoices,
  normalizeHomeUsers,
  normalizeHomeClients,
  normalizeHomeActivityList,
  buildHomeActivityFromCollections,
} from "./home.model.js";

export const HOME_SELECTORS_VERSION = "home.selectors.v2";

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

const TICKET_OPEN_KEYS = Object.freeze(["pending", "open", "progress"]);
const TICKET_CLOSED_KEYS = Object.freeze(["resolved", "closed"]);
const INVOICE_PENDING_KEYS = Object.freeze(["pending", "overdue", "partial"]);

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

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

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

  for (const item of safeArray(items)) {
    const key = normalizeKey(picker(item));

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

export function isSameIdentity(a = "", b = "") {
  const left = normalizeKey(a);
  const right = normalizeKey(b);

  return Boolean(left && right && left === right);
}

export function normalizeRoute(route = "") {
  const raw = safeText(route, "");

  if (!raw) return "";

  const lower = raw.toLowerCase();

  if (
    lower === "/home" ||
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:") ||
    /^https?:\/\//i.test(raw)
  ) {
    return "";
  }

  return raw.startsWith("/") ? raw : `/${raw}`;
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
    const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss));
    const time = date.getTime();

    return Number.isNaN(time) ? 0 : time;
  }

  const date = new Date(raw.includes("T") || raw.includes("Z") ? raw : `${raw}T00:00:00`);
  const time = date.getTime();

  return Number.isNaN(time) ? 0 : time;
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

  const diffMin = Math.round((timestamp - Date.now()) / 60000);
  const absMin = Math.abs(diffMin);

  if (absMin < 1) return "Ahora mismo";

  if (absMin < 60) {
    return diffMin > 0 ? `En ${absMin} min` : `Hace ${absMin} min`;
  }

  const hours = Math.round(absMin / 60);

  if (hours < 24) {
    return diffMin > 0 ? `En ${hours} h` : `Hace ${hours} h`;
  }

  const days = Math.round(hours / 24);

  if (days <= 7) {
    return diffMin > 0
      ? `En ${days} día${days === 1 ? "" : "s"}`
      : `Hace ${days} día${days === 1 ? "" : "s"}`;
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
   USER / ROLE
========================================================= */

export function normalizeRole(value = "") {
  return String(value || "").toLowerCase() === "admin" ? "admin" : "user";
}

export function isAdminRole(role = "") {
  return normalizeRole(role) === "admin";
}

export function isUserRole(role = "") {
  return normalizeRole(role) === "user";
}

export function getDashboard(input = {}) {
  const data = safeObject(input);

  return safeObject(
    first(
      data.dashboard,
      data.state?.dashboard,
      data.home,
      data.data?.dashboard,
      data.payload?.dashboard,
      data.result?.dashboard,
      {}
    )
  );
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

      dashboard.summary,
      dashboard.stats,
      dashboard.metrics,
      dashboard.totals,
      dashboard.counts,
      {}
    )
  );
}

export function getSummaryValue(input = {}, keys = [], fallback = null) {
  const data = safeObject(input);
  const summary = getSummary(data);
  const dashboard = getDashboard(data);

  const sources = [summary, dashboard, data.state, data];

  for (const key of safeArray(keys)) {
    for (const source of sources) {
      const value = String(key).includes(".")
        ? getPath(source, key)
        : source?.[key];

      if (value !== null && value !== undefined && value !== "") {
        return value;
      }
    }
  }

  return fallback;
}

export function getBestSummaryNumber(input = {}, keys = [], fallback = 0, extraCandidates = []) {
  const values = [
    ...safeArray(keys).map((key) => getSummaryValue(input, [key], null)),
    ...safeArray(extraCandidates),
    fallback,
  ];

  const numbers = values
    .map((value) => safeNumber(value, NaN))
    .filter(Number.isFinite);

  if (!numbers.length) return safeNumber(fallback, 0);

  const positive = numbers.filter((value) => value > 0);

  return positive.length ? Math.max(...positive) : Math.max(...numbers);
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
      data.state?.session?.user,
      dashboard.user,
      dashboard.currentUser,
      dashboard.profile,
      {}
    )
  );
}

export function getRole(input = {}) {
  const data = safeObject(input);
  const user = getUser(data);
  const dashboard = getDashboard(data);

  return normalizeRole(
    first(
      data.role,
      data.currentRole,
      data.state?.role,
      data.state?.userRole,
      dashboard.role,
      user.role,
      user.rol,
      "user"
    )
  );
}

export function canSeeUsersModule(input = {}) {
  return isAdminRole(getRole(input));
}

export function getDisplayName(input = {}) {
  const user = getUser(input);

  return safeText(
    first(user.displayName, user.fullName, user.name, user.nombre, user.username, user.email),
    "Usuario"
  );
}

export function getAvatarUrl(input = {}) {
  const user = getUser(input);

  return safeText(
    first(user.avatar, user.avatarUrl, user.avatar_url, user.photo, user.photoUrl, user.photoURL, user.picture),
    ""
  );
}

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
   COLLECTIONS
========================================================= */

function collection(input = {}, names = []) {
  const data = safeObject(input);
  const dashboard = getDashboard(data);
  const state = safeObject(data.state);

  for (const name of safeArray(names)) {
    const value = first(data[name], state[name], dashboard[name]);

    if (Array.isArray(value)) return value;
    if (isObject(value)) {
      const nested = first(value.items, value.rows, value.results, value.data, value.records);
      if (Array.isArray(nested)) return nested;
    }
  }

  return [];
}

function countFrom(input = {}, names = [], fallback = 0) {
  const data = safeObject(input);
  const dashboard = getDashboard(data);
  const summary = getSummary(data);
  const state = safeObject(data.state);

  const candidates = [];

  for (const name of safeArray(names)) {
    candidates.push(data[name], state[name], dashboard[name], dashboard.meta?.[name], summary[name]);
  }

  return Math.max(
    safeNumber(fallback, 0),
    ...candidates.map((value) => safeNumber(value, fallback))
  );
}

export function getCollections(input = {}) {
  const tickets = normalizeHomeTickets(collection(input, ["tickets", "incidencias"]));
  const invoices = normalizeHomeInvoices(collection(input, ["invoices", "facturas"]));
  const users = normalizeHomeUsers(collection(input, ["users", "usuarios"]));
  const clients = normalizeHomeClients(collection(input, ["clients", "clientes", "customers"]));
  const activity = normalizeHomeActivityList(collection(input, ["activity", "activities", "recent", "recentActivity"]));

  return {
    tickets,
    invoices,
    users,
    clients,
    activity,

    ticketsRemoteCount: countFrom(
      input,
      ["totalTickets", "ticketsTotal", "incidenciasTotal", "totalIncidencias", "ticketsCount", "incidenciasCount"],
      tickets.length
    ),

    invoicesRemoteCount: countFrom(
      input,
      ["totalInvoices", "invoicesTotal", "facturasTotal", "totalFacturas", "invoicesCount", "facturasCount"],
      invoices.length
    ),

    usersRemoteCount: countFrom(
      input,
      ["usersCount", "usuariosCount", "totalUsers", "totalUsuarios"],
      users.length
    ),

    clientsRemoteCount: countFrom(
      input,
      ["clientsCount", "clientesCount", "customersCount", "totalClients", "totalClientes"],
      clients.length
    ),
  };
}

export function unwrapCollectionPayload(value = null) {
  if (Array.isArray(value)) {
    return {
      items: value,
      total: value.length,
      count: value.length,
    };
  }

  return safeObject(value);
}

export function normalizeCollection(value = null) {
  if (Array.isArray(value)) return value;

  const object = safeObject(value);
  return safeArray(first(object.items, object.rows, object.results, object.data, object.records, []));
}

export function getRemoteCountFromCollection(value = null, fallback = 0) {
  const object = safeObject(value);

  return Math.max(
    safeNumber(fallback, 0),
    safeNumber(first(object.totalCount, object.remoteCount, object.total, object.count, fallback), fallback)
  );
}

export function resolveCollectionSource(input = {}, aliases = []) {
  return collection(input, aliases);
}

/* =========================================================
   WIDGETS
========================================================= */

export function getWidgets(input = {}) {
  return normalizeHomeWidgets(collection(input, ["widgets", "cards", "kpis", "blocks"]));
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
  const aliases = safeArray(matchers).map(normalizeKey).filter(Boolean);

  for (const widget of getWidgets(input)) {
    const text = [
      getWidgetId(widget),
      getWidgetTitle(widget),
      getWidgetText(widget),
      widget.key,
      widget.slug,
      widget.type,
      widget.kind,
      widget.label,
    ]
      .map(normalizeKey)
      .join(" ");

    if (!aliases.some((alias) => text.includes(alias))) continue;

    const value = safeNumber(getWidgetValue(widget), NaN);

    if (Number.isFinite(value)) return value;
  }

  return fallback;
}

/* =========================================================
   TICKETS
========================================================= */

export function getTicketIdentity(item = {}) {
  return safeText(first(item.ticketId, item.incidenciaId, item.code, item.numero, item.ticketCode, item.entityId, item.id, item._id), "");
}

export function getTicketId(item = {}) {
  return getTicketIdentity(item) || "INC-SIN-ID";
}

export function getTicketUniqueKey(item = {}, index = 0) {
  return getTicketIdentity(item) || `${getTicketSubject(item)}:${getTicketCreatedAt(item)}:${index}`;
}

export function getTicketSubject(item = {}) {
  return safeText(first(item.subject, item.title, item.asunto, item.name, item.preview), "Incidencia sin asunto");
}

export function getTicketDescription(item = {}) {
  return safeText(first(item.description, item.descripcion, item.preview, item.message, item.body, item.text), "Sin descripción.");
}

export function getTicketOwnerName(item = {}) {
  return safeText(
    first(
      item.clientName,
      item.clienteNombre,
      item.customerName,
      item.requesterName,
      item.userName,
      item.ownerName,
      item.requesterSnapshot?.name,
      item.requesterSnapshot?.displayName,
      item.cliente?.nombreContacto,
      item.cliente?.nombre,
      item.client?.name,
      item.customer?.name,
      item.user?.name
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
      item.cliente?.email,
      item.client?.email,
      item.customer?.email,
      item.user?.email
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
      item.requesterSnapshot?.avatar,
      item.requesterSnapshot?.avatarUrl,
      item.cliente?.avatar,
      item.cliente?.avatarUrl,
      item.client?.avatar,
      item.client?.avatarUrl,
      item.user?.avatar,
      item.user?.avatarUrl
    ),
    ""
  );
}

export function getTicketStatus(item = {}) {
  return first(item.status, item.estado, item.state, item.lifecycle?.status, "pending");
}

export function getTicketStatusKey(value = "") {
  const raw = isObject(value) ? getTicketStatus(value) : value;
  const key = normalizeKey(raw);

  if (["open", "opened", "abierta", "abierto"].includes(key)) return "open";
  if (["progress", "in_progress", "inprogress", "en_proceso", "working", "assigned"].includes(key)) return "progress";
  if (["resolved", "resuelta", "resuelto", "solved"].includes(key)) return "resolved";
  if (["closed", "close", "cerrada", "cerrado", "cancelled", "canceled", "archived"].includes(key)) return "closed";

  return "pending";
}

export function getTicketStatusLabel(value = "") {
  const key = getTicketStatusKey(value);

  if (key === "open") return "Abierta";
  if (key === "progress") return "En proceso";
  if (key === "resolved") return "Resuelta";
  if (key === "closed") return "Cerrada";

  return "Pendiente";
}

export function getTicketPriorityRaw(item = {}) {
  return first(item.priority, item.prioridad, item.severity, item.urgency, item.sla?.priority, "medium");
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
  return safeText(first(item.category, item.categoria, item.type, item.tipo, item.subcategory), "Soporte");
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
    item.agent
  );

  if (isObject(assigned)) {
    return safeText(first(assigned.name, assigned.nombre, assigned.displayName, assigned.email, assigned.id), "Sin asignar");
  }

  return safeText(assigned, "Sin asignar");
}

export function getTicketCreatedAt(item = {}) {
  return first(item.createdAt, item.fechaCreacion, item.createdAtES, item.date, item.fecha, item.lifecycle?.createdAt);
}

export function getTicketUpdatedAt(item = {}) {
  return first(item.updatedAt, item.lastUpdateAt, item.ultimaNovedad, item.modifiedAt, item.closedAt, item.createdAt, item.lifecycle?.updatedAt, item.audit?.updatedAt);
}

export function getTicketAttachmentsCount(item = {}) {
  const attachments = first(item.attachments, item.files, item.adjuntos, item.documents);

  if (Array.isArray(attachments)) return attachments.length;

  return safeNumber(first(item.attachmentsCount, item.filesCount, item.adjuntosCount, item.documentsCount, 0), 0);
}

export function getTicketSortTimestamp(item = {}) {
  return toTimestamp(getTicketUpdatedAt(item)) || toTimestamp(getTicketCreatedAt(item)) || safeNumber(item?._ts, 0);
}

export function compareTicketsNewestFirst(a = {}, b = {}) {
  return getTicketSortTimestamp(b) - getTicketSortTimestamp(a);
}

export function sortTicketsNewestFirst(items = []) {
  return [...safeArray(items)].sort(compareTicketsNewestFirst);
}

/* =========================================================
   FACTURAS / USERS / CLIENTS
========================================================= */

export function getInvoiceIdentity(item = {}) {
  return safeText(first(item.invoiceId, item.facturaId, item.numeroFacturaLegal, item.numeroFactura, item.invoiceNumber, item.number, item.numero, item.code, item.id, item._id), "");
}

export function getInvoiceId(item = {}) {
  return getInvoiceIdentity(item) || "FAC-SIN-ID";
}

export function getInvoiceUniqueKey(item = {}, index = 0) {
  return getInvoiceIdentity(item) || `invoice:${index}`;
}

export function getInvoiceAmount(item = {}) {
  return safeNumber(first(item.total, item.amount, item.importe, item.price, item.subtotal, item.totalFactura, item.importeTotal, item.invoiceAmount, item.facturaTotal, 0), 0);
}

export function getInvoiceCurrency(item = {}) {
  return safeText(first(item.currency, item.moneda, DEFAULT_CURRENCY), DEFAULT_CURRENCY).toUpperCase();
}

export function getInvoiceStatusKey(item = {}) {
  const key = normalizeKey(first(item.paymentStatus, item.estadoPago, item.status, item.estado, "pending"));

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

export function getUserId(item = {}) {
  return safeText(first(item.userId, item.usuarioId, item.id, item._id, item.email, item.username), "");
}

export function getUserUniqueKey(item = {}, index = 0) {
  return getUserId(item) || `user:${index}`;
}

export function isActiveUser(item = {}) {
  const active = first(item.active, item.isActive, item.enabled, item.status, item.estado);
  const key = normalizeKey(active);

  if (active === false || active === 0) return false;

  return !["false", "disabled", "inactive", "inactivo", "blocked", "deleted"].includes(key);
}

export function getClientId(item = {}) {
  return safeText(first(item.clienteId, item.clientId, item.customerId, item.id, item._id, item.email), "");
}

export function getClientUniqueKey(item = {}, index = 0) {
  return getClientId(item) || `client:${index}`;
}

export function isActiveClient(item = {}) {
  const active = first(item.active, item.isActive, item.enabled, item.status, item.estado);
  const key = normalizeKey(active);

  if (active === false || active === 0) return false;

  return !["false", "disabled", "inactive", "inactivo", "blocked", "deleted"].includes(key);
}

/* =========================================================
   STATS / CARDS / ACTIONS
========================================================= */

export function getLatestDateFromTickets(tickets = []) {
  const timestamps = safeArray(tickets)
    .map((item) => toTimestamp(getTicketUpdatedAt(item)) || toTimestamp(getTicketCreatedAt(item)))
    .filter(Boolean);

  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}

export function computeHomeStats(input = {}) {
  const collections = getCollections(input);
  const admin = isAdminRole(getRole(input));

  const tickets = collections.tickets;
  const invoices = collections.invoices;
  const users = collections.users;
  const clients = collections.clients;

  const totalTickets = getBestSummaryNumber(
    input,
    ["totalTickets", "ticketsTotal", "incidenciasTotal", "totalIncidencias", "ticketsCount", "incidenciasCount"],
    collections.ticketsRemoteCount,
    [tickets.length]
  );

  const openTickets = getBestSummaryNumber(
    input,
    ["openTickets", "pendingTickets", "openIncidencias", "pendingIncidencias", "incidenciasAbiertas"],
    tickets.filter(isTicketOpenLike).length
  );

  const closedTickets = getBestSummaryNumber(
    input,
    ["closedTickets", "resolvedTickets", "closedIncidencias", "resolvedIncidencias", "incidenciasCerradas"],
    tickets.filter(isTicketClosedLike).length
  );

  const urgentTickets = getBestSummaryNumber(
    input,
    ["urgentTickets", "urgentIncidencias", "highPriorityTickets", "ticketsUrgentes", "incidenciasUrgentes"],
    tickets.filter(isTicketUrgent).length
  );

  const totalInvoices = getBestSummaryNumber(
    input,
    ["totalInvoices", "invoicesTotal", "facturasTotal", "totalFacturas", "invoicesCount", "facturasCount"],
    collections.invoicesRemoteCount,
    [invoices.length]
  );

  const pendingInvoices = getBestSummaryNumber(
    input,
    ["pendingInvoices", "pendingFacturas", "facturasPendientes", "invoicesPending", "facturasVencidas", "overdueInvoices"],
    invoices.filter(isInvoicePendingLike).length
  );

  const invoiceAmount = roundMoney(
    getBestSummaryNumber(
      input,
      ["invoiceAmount", "billingTotal", "totalBilling", "totalFacturado", "importeFacturas", "facturacionVisible", "facturacionTotal"],
      invoices.reduce((sum, item) => sum + getInvoiceAmount(item), 0),
      [
        getWidgetNumericValue(input, ["facturacion", "facturas", "billing", "invoice", "total_facturado"], null),
      ]
    )
  );

  const usersCount = admin
    ? getBestSummaryNumber(
        input,
        ["usersCount", "usuariosCount", "totalUsers", "totalUsuarios", "activeUsers", "usuariosActivos"],
        collections.usersRemoteCount,
        [users.filter(isActiveUser).length]
      )
    : 0;

  const clientsCount = getBestSummaryNumber(
    input,
    ["clientsCount", "clientesCount", "customersCount", "totalClients", "totalClientes", "totalCustomers", "activeClients", "clientesActivos"],
    collections.clientsRemoteCount,
    [clients.filter(isActiveClient).length]
  );

  const attachmentsCount = tickets.reduce((sum, item) => sum + getTicketAttachmentsCount(item), 0);

  return {
    role: getRole(input),
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
    activeUsersCount: admin ? users.filter(isActiveUser).length : 0,

    clientsCount,
    activeClientsCount: clients.filter(isActiveClient).length,

    attachmentsCount,
    lastTicketUpdate: getLatestDateFromTickets(tickets),
    healthRatio: totalTickets ? clampNumber(((totalTickets - openTickets) / totalTickets) * 100, 0, 100) : 100,
  };
}

export function getStatCards(input = {}) {
  const stats = computeHomeStats(input);

  if (stats.admin) {
    return [
      {
        iconName: "ticket",
        label: "Incidencias abiertas",
        value: formatNumber(stats.openTickets),
        text: `${formatNumber(stats.totalTickets)} solicitudes totales.`,
        modifier: "open",
        badge: stats.urgentTickets ? `${formatNumber(stats.urgentTickets)} urg.` : "",
      },
      {
        iconName: "euro",
        label: "Facturación visible",
        value: formatMoney(stats.invoiceAmount),
        text: `${formatNumber(stats.pendingInvoices)} facturas pendientes o vencidas.`,
        modifier: "billing",
      },
      {
        iconName: "client",
        label: "Clientes",
        value: formatNumber(stats.clientsCount),
        text: "Clientes sincronizados en el panel.",
        modifier: "clients",
      },
      {
        iconName: "users",
        label: "Usuarios",
        value: formatNumber(stats.usersCount),
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
      text: `${formatNumber(stats.openTickets)} solicitudes abiertas o en seguimiento.`,
      modifier: "open",
      badge: stats.urgentTickets ? `${formatNumber(stats.urgentTickets)} urg.` : "",
    },
    {
      iconName: "euro",
      label: "Facturas pendientes",
      value: formatNumber(stats.pendingInvoices),
      text: `${formatMoney(stats.invoiceAmount)} en facturación visible.`,
      modifier: "billing",
    },
    {
      iconName: "paperclip",
      label: "Adjuntos",
      value: formatNumber(stats.attachmentsCount),
      text: "Documentos vinculados a tus incidencias.",
      modifier: "files",
    },
    {
      iconName: "clock",
      label: "Última actividad",
      value: stats.lastTicketUpdate ? formatRelativeDate(stats.lastTicketUpdate) : "Sin fecha",
      text: "Movimiento más reciente.",
      modifier: "activity",
    },
  ];
}

export function getQuickActions(input = {}) {
  if (isAdminRole(getRole(input))) {
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
   ACTIVITY / PAGINATION
========================================================= */

export function buildSyntheticActivity(input = {}) {
  return normalizeHomeActivityList(
    buildHomeActivityFromCollections({
      tickets: getCollections(input).tickets,
      invoices: getCollections(input).invoices,
      users: isAdminRole(getRole(input)) ? getCollections(input).users : [],
      clients: getCollections(input).clients,
    })
  );
}

export function getActivity(input = {}) {
  const collections = getCollections(input);

  return collections.activity.length
    ? normalizeHomeActivityList(collections.activity)
    : buildSyntheticActivity(input);
}

export function getActivityTitle(item = {}) {
  return safeText(first(item.title, item.name, item.subject, item.label), "Actividad registrada");
}

export function getActivityText(item = {}) {
  return safeText(first(item.text, item.description, item.message, item.detail, item.preview), "Sin detalle adicional.");
}

export function getActivityDate(item = {}) {
  return first(item.date, item.createdAt, item.updatedAt, item.timestamp);
}

export function getActivityType(item = {}) {
  const key = normalizeKey(first(item.type, item.kind, item.category, "activity"));

  if (["factura", "invoice", "billing", "bill"].includes(key)) return "invoice";
  if (["ticket", "incidencia", "support", "issue"].includes(key)) return "ticket";
  if (["cliente", "client", "customer"].includes(key)) return "client";
  if (["usuario", "user", "member"].includes(key)) return "user";

  return key || "activity";
}

export function getPagination(items = [], input = {}) {
  const rows = safeArray(items);
  const data = safeObject(input);
  const state = safeObject(data.state);

  const pageSize = clampNumber(first(data.pageSize, state.pageSize, DEFAULT_PAGE_SIZE), 1, 50);
  const totalCount = Math.max(rows.length, safeNumber(first(data.totalCount, data.remoteCount, state.totalCount, rows.length), rows.length));
  const totalPages = Math.max(1, Math.ceil((totalCount || 1) / pageSize));
  const page = clampNumber(first(data.page, state.page, 1), 1, totalPages);

  const start = (page - 1) * pageSize;
  const pageItems = rows.slice(start, start + pageSize);

  return {
    allItems: rows,
    pageItems,
    items: pageItems,
    page,
    currentPage: page,
    pageSize,
    totalPages,
    totalCount,
    total: totalCount,
    rangeStart: totalCount && pageItems.length ? start + 1 : 0,
    rangeEnd: totalCount ? Math.min(start + pageItems.length, totalCount) : 0,
    hasPrev: page > 1,
    hasNext: page < totalPages,
  };
}

/* =========================================================
   TEMPLATE DATA
========================================================= */

export function buildHomeTemplateData(input = {}) {
  const data = safeObject(input);
  const dashboard = getNormalizedDashboard(data);
  const summary = getSummary({ ...data, dashboard });
  const collections = getCollections({ ...data, dashboard, summary });
  const stats = computeHomeStats({ ...data, dashboard, summary });
  const widgets = getWidgets({ ...data, dashboard });
  const activity = getActivity({ ...data, dashboard, summary });
  const pagination = getPagination(collections.tickets, {
    ...data,
    totalCount: collections.ticketsRemoteCount,
  });

  const user = getUser(data);
  const role = getRole(data);
  const displayName = getDisplayName(data);

  return {
    version: HOME_SELECTORS_VERSION,

    user,
    role,
    displayName,
    avatarUrl: getAvatarUrl(data),
    initials: getInitials(displayName),

    dashboard,
    summary,
    stats,

    widgets,
    statCards: getStatCards({ ...data, dashboard, summary }),
    quickActions: getQuickActions({ ...data, dashboard, summary }),

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
      canSeeUsers: canSeeUsersModule({ ...data, dashboard, summary }),
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
