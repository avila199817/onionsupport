/* =========================================================
   Onion Support - Home Store
   Archivo: /src/views/home/home.store.js

   Responsabilidad:
   - Snapshot en memoria de datos Home.
   - Servir a home.api.js / homeView.js como cache runtime.
   - Normalizar dashboard recibido desde API.
   - Mantener aliases mínimos para template/selectors.
   - Preservar datos válidos si llega payload vacío.
   - Sin DOM.
   - Sin CSS.
   - Sin HTTP.
   - Sin Auth.
   - Sin Router.
   - Sin eventos.
   - Sin subscribers.
   - Sin globals window.
   - Sin índices paralelos.
   - Sin historial interno.
   - Sin magia negra.
========================================================= */

import {
  normalizeHomeDashboard,
  normalizeHomeSummary,
  normalizeHomeWidgets,
  normalizeHomeTickets,
  normalizeHomeInvoices,
  normalizeHomeUsers,
  normalizeHomeClients,
  normalizeHomeActivityList,
  getHomeWidgetId,
  getHomeTicketId,
  getHomeInvoiceId,
  getHomeUserId,
  getHomeClientId,
  getHomeActivityId,
} from "./home.model.js";

export const HOME_STORE_VERSION = "home.store.v1";
export const HOME_STORE_SOURCE = "views.home.store";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 5;

/* =========================================================
   SAFE HELPERS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value = "", fallback = "") {
  if (value === null || value === undefined) return fallback;

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function safeNumber(value = 0, fallback = 0) {
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

    const parsed = Number(clean);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeBoolean(value = false, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;

  if (typeof value === "string") {
    const clean = value.trim().toLowerCase();

    if (["true", "yes", "si", "sí", "ok", "on"].includes(clean)) return true;
    if (["false", "no", "off"].includes(clean)) return false;
  }

  return Boolean(fallback);
}

function hasOwnKeys(value = {}) {
  return Boolean(isObject(value) && Object.keys(value).length > 0);
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

function firstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }

  return null;
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function clone(value, fallback = null) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {
    // noop
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function uniqueBy(items = [], picker = (item) => item) {
  const seen = new Set();
  const output = [];

  for (const item of safeArray(items)) {
    const rawKey = safeText(picker(item), "");
    const key = rawKey ? normalizeKey(rawKey) : "";

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

/* =========================================================
   IDENTITY
========================================================= */

function widgetId(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      getHomeWidgetId?.(raw),
      raw.widgetId,
      raw.widgetKey,
      raw.id,
      raw.key,
      raw.slug,
      raw.code,
      raw.title,
      raw.name
    ),
    ""
  );
}

function ticketId(item = {}) {
  return safeText(getHomeTicketId?.(item), "");
}

function invoiceId(item = {}) {
  return safeText(getHomeInvoiceId?.(item), "");
}

function userId(item = {}) {
  return safeText(getHomeUserId?.(item), "");
}

function clientId(item = {}) {
  return safeText(getHomeClientId?.(item), "");
}

function activityId(item = {}) {
  return safeText(getHomeActivityId?.(item), "");
}

/* =========================================================
   INITIAL STORE
========================================================= */

export function createInitialHomeStore(seed = {}) {
  return {
    version: HOME_STORE_VERSION,
    source: HOME_STORE_SOURCE,

    hydrated: false,
    loaded: false,
    loading: false,
    refreshing: false,

    page: DEFAULT_PAGE,
    pageSize: DEFAULT_PAGE_SIZE,

    requestId: "",
    lastSyncAt: "",
    updatedAt: "",

    dashboard: {},

    summary: {},
    stats: {},
    metrics: {},
    totals: {},
    counts: {},

    widgets: [],
    cards: [],
    kpis: [],
    blocks: [],

    tickets: [],
    incidencias: [],
    ticketsRemoteCount: 0,
    remoteCount: 0,

    invoices: [],
    facturas: [],
    invoicesRemoteCount: 0,

    users: [],
    usuarios: [],
    usersRemoteCount: 0,

    clients: [],
    clientes: [],
    customers: [],
    clientsRemoteCount: 0,

    activity: [],
    activities: [],
    recent: [],
    recentActivity: [],

    health: null,

    error: null,
    errorMessage: "",

    partial: false,
    errors: [],
    modules: {},

    ...safeObject(seed),
  };
}

export const homeStore = createInitialHomeStore();

/* =========================================================
   SUMMARY / DASHBOARD SHAPE
========================================================= */

function normalizeSummary(summary = {}, fallback = {}) {
  try {
    return normalizeHomeSummary(
      safeObject(summary),
      {},
      safeObject(fallback)
    );
  } catch {
    return {
      ...safeObject(fallback),
      ...safeObject(summary),
    };
  }
}

function collectionEnvelope(items = [], total = null) {
  const rows = safeArray(items);
  const remote = Math.max(rows.length, safeNumber(total, rows.length));

  return {
    items: rows,
    rows,
    data: rows,
    results: rows,

    total: remote,
    count: rows.length,
    totalCount: remote,
    remoteCount: remote,
    visibleCount: rows.length,
  };
}

function summaryFallback({
  tickets = [],
  invoices = [],
  users = [],
  clients = [],
  ticketsRemoteCount = 0,
  invoicesRemoteCount = 0,
  usersRemoteCount = 0,
  clientsRemoteCount = 0,
} = {}) {
  return {
    totalTickets: ticketsRemoteCount,
    ticketsTotal: ticketsRemoteCount,
    incidenciasTotal: ticketsRemoteCount,
    totalIncidencias: ticketsRemoteCount,
    ticketsCount: ticketsRemoteCount,
    incidenciasCount: ticketsRemoteCount,
    visibleTickets: tickets.length,
    visibleTicketsCount: tickets.length,

    totalInvoices: invoicesRemoteCount,
    invoicesTotal: invoicesRemoteCount,
    facturasTotal: invoicesRemoteCount,
    totalFacturas: invoicesRemoteCount,
    invoicesCount: invoicesRemoteCount,
    facturasCount: invoicesRemoteCount,
    visibleInvoices: invoices.length,
    visibleInvoicesCount: invoices.length,

    usersCount: usersRemoteCount,
    usuariosCount: usersRemoteCount,
    totalUsers: usersRemoteCount,
    totalUsuarios: usersRemoteCount,
    visibleUsers: users.length,
    visibleUsersCount: users.length,

    clientsCount: clientsRemoteCount,
    clientesCount: clientsRemoteCount,
    customersCount: clientsRemoteCount,
    totalClients: clientsRemoteCount,
    totalClientes: clientsRemoteCount,
    totalCustomers: clientsRemoteCount,
    visibleClients: clients.length,
    visibleClientsCount: clients.length,
  };
}

function normalizeDashboardInput(payload = {}, previousDashboard = {}) {
  const input = safeObject(payload);

  try {
    return normalizeHomeDashboard(input);
  } catch {
    return {
      ...safeObject(previousDashboard),
      ...input,
    };
  }
}

function rawSummaryFrom(payload = {}, dashboard = {}) {
  return safeObject(
    first(
      payload.summary,
      payload.stats,
      payload.metrics,
      payload.totals,
      payload.counts,
      dashboard.summary,
      dashboard.stats,
      dashboard.metrics,
      dashboard.totals,
      dashboard.counts,
      {}
    )
  );
}

function remoteCount({ explicit = null, summary = {}, dashboard = {}, keys = [], fallback = 0 } = {}) {
  const values = [
    explicit,
    ...safeArray(keys).flatMap((key) => [
      safeObject(summary)[key],
      safeObject(dashboard)[key],
      safeObject(dashboard).meta?.[key],
    ]),
    fallback,
  ];

  return Math.max(
    safeNumber(fallback, 0),
    ...values.map((value) => safeNumber(value, fallback))
  );
}

function syncAliases() {
  homeStore.stats = homeStore.summary;
  homeStore.metrics = homeStore.summary;
  homeStore.totals = homeStore.summary;
  homeStore.counts = homeStore.summary;

  homeStore.cards = homeStore.widgets;
  homeStore.kpis = homeStore.widgets;
  homeStore.blocks = homeStore.widgets;

  homeStore.incidencias = homeStore.tickets;
  homeStore.facturas = homeStore.invoices;
  homeStore.usuarios = homeStore.users;

  homeStore.clientes = homeStore.clients;
  homeStore.customers = homeStore.clients;

  homeStore.activities = homeStore.activity;
  homeStore.recent = homeStore.activity;
  homeStore.recentActivity = homeStore.activity;

  homeStore.dashboard = {
    ...safeObject(homeStore.dashboard),

    summary: homeStore.summary,
    stats: homeStore.summary,
    metrics: homeStore.summary,
    totals: homeStore.summary,
    counts: homeStore.summary,

    widgets: homeStore.widgets,
    cards: homeStore.widgets,
    kpis: homeStore.widgets,
    blocks: homeStore.widgets,

    tickets: homeStore.tickets,
    incidencias: homeStore.tickets,

    invoices: homeStore.invoices,
    facturas: homeStore.invoices,

    users: homeStore.users,
    usuarios: homeStore.users,

    clients: homeStore.clients,
    clientes: homeStore.clients,
    customers: homeStore.clients,

    activity: homeStore.activity,
    activities: homeStore.activity,
    recent: homeStore.activity,
    recentActivity: homeStore.activity,

    ticketsTotal: homeStore.ticketsRemoteCount,
    incidenciasTotal: homeStore.ticketsRemoteCount,
    totalTickets: homeStore.ticketsRemoteCount,
    totalIncidencias: homeStore.ticketsRemoteCount,
    ticketsCount: homeStore.ticketsRemoteCount,
    incidenciasCount: homeStore.ticketsRemoteCount,
    visibleTicketsCount: homeStore.tickets.length,

    invoicesTotal: homeStore.invoicesRemoteCount,
    facturasTotal: homeStore.invoicesRemoteCount,
    totalInvoices: homeStore.invoicesRemoteCount,
    totalFacturas: homeStore.invoicesRemoteCount,
    invoicesCount: homeStore.invoicesRemoteCount,
    facturasCount: homeStore.invoicesRemoteCount,
    visibleInvoicesCount: homeStore.invoices.length,

    usersTotal: homeStore.usersRemoteCount,
    usuariosTotal: homeStore.usersRemoteCount,
    totalUsers: homeStore.usersRemoteCount,
    totalUsuarios: homeStore.usersRemoteCount,
    usersCount: homeStore.usersRemoteCount,
    usuariosCount: homeStore.usersRemoteCount,
    visibleUsersCount: homeStore.users.length,

    clientsTotal: homeStore.clientsRemoteCount,
    clientesTotal: homeStore.clientsRemoteCount,
    customersTotal: homeStore.clientsRemoteCount,
    totalClients: homeStore.clientsRemoteCount,
    totalClientes: homeStore.clientsRemoteCount,
    totalCustomers: homeStore.clientsRemoteCount,
    clientsCount: homeStore.clientsRemoteCount,
    clientesCount: homeStore.clientsRemoteCount,
    customersCount: homeStore.clientsRemoteCount,
    visibleClientsCount: homeStore.clients.length,

    activityCount: homeStore.activity.length,
    recentCount: homeStore.activity.length,
    visibleActivityCount: homeStore.activity.length,

    requestId: homeStore.requestId,
    updatedAt: homeStore.updatedAt || homeStore.lastSyncAt,
    lastSyncAt: homeStore.lastSyncAt,

    modules: homeStore.modules,
    partial: homeStore.partial,
    errors: homeStore.errors,

    meta: {
      ...safeObject(homeStore.dashboard?.meta),
      widgetsCount: homeStore.widgets.length,
      ticketsCount: homeStore.ticketsRemoteCount,
      invoicesCount: homeStore.invoicesRemoteCount,
      usersCount: homeStore.usersRemoteCount,
      clientsCount: homeStore.clientsRemoteCount,
      activityCount: homeStore.activity.length,
    },
  };

  return homeStore;
}

/* =========================================================
   NORMALIZE PAYLOAD
========================================================= */

function normalizePayload(payload = {}, options = {}) {
  const input = safeObject(payload);
  const opts = safeObject(options);

  const sourceDashboard = safeObject(first(input.dashboard, input, {}));
  const dashboard = normalizeDashboardInput(
    sourceDashboard,
    opts.preserveExisting === false ? {} : homeStore.dashboard
  );

  const widgets = normalizeHomeWidgets(
    firstArray(input.widgets, input.cards, input.kpis, input.blocks, dashboard.widgets, dashboard.cards, dashboard.kpis, dashboard.blocks) || []
  );

  const tickets = uniqueBy(
    normalizeHomeTickets(firstArray(input.tickets, input.incidencias, dashboard.tickets, dashboard.incidencias) || []),
    ticketId
  );

  const invoices = uniqueBy(
    normalizeHomeInvoices(firstArray(input.invoices, input.facturas, dashboard.invoices, dashboard.facturas) || []),
    invoiceId
  );

  const users = uniqueBy(
    normalizeHomeUsers(firstArray(input.users, input.usuarios, dashboard.users, dashboard.usuarios) || []),
    userId
  );

  const clients = uniqueBy(
    normalizeHomeClients(firstArray(input.clients, input.clientes, input.customers, dashboard.clients, dashboard.clientes, dashboard.customers) || []),
    clientId
  );

  const activity = uniqueBy(
    normalizeHomeActivityList(firstArray(input.activity, input.activities, input.recent, input.recentActivity, dashboard.activity, dashboard.activities, dashboard.recent, dashboard.recentActivity) || []),
    activityId
  );

  const rawSummary = rawSummaryFrom(input, dashboard);

  const ticketsRemoteCount = remoteCount({
    explicit: first(input.ticketsRemoteCount, input.remoteCount, input.ticketsCount, dashboard.ticketsRemoteCount, dashboard.remoteCount),
    summary: rawSummary,
    dashboard,
    keys: ["totalTickets", "ticketsTotal", "incidenciasTotal", "totalIncidencias", "ticketsCount", "incidenciasCount"],
    fallback: tickets.length,
  });

  const invoicesRemoteCount = remoteCount({
    explicit: first(input.invoicesRemoteCount, input.facturasRemoteCount, input.invoicesCount, dashboard.invoicesRemoteCount),
    summary: rawSummary,
    dashboard,
    keys: ["totalInvoices", "invoicesTotal", "facturasTotal", "totalFacturas", "invoicesCount", "facturasCount"],
    fallback: invoices.length,
  });

  const usersRemoteCount = remoteCount({
    explicit: first(input.usersRemoteCount, input.usuariosRemoteCount, input.usersCount, dashboard.usersRemoteCount),
    summary: rawSummary,
    dashboard,
    keys: ["usersCount", "usuariosCount", "totalUsers", "totalUsuarios", "activeUsers", "usuariosActivos"],
    fallback: users.length,
  });

  const clientsRemoteCount = remoteCount({
    explicit: first(input.clientsRemoteCount, input.clientesRemoteCount, input.customersRemoteCount, input.clientsCount, dashboard.clientsRemoteCount),
    summary: rawSummary,
    dashboard,
    keys: ["clientsCount", "clientesCount", "customersCount", "totalClients", "totalClientes", "totalCustomers", "activeClients", "clientesActivos"],
    fallback: clients.length,
  });

  const summary = normalizeSummary(
    rawSummary,
    summaryFallback({
      tickets,
      invoices,
      users,
      clients,
      ticketsRemoteCount,
      invoicesRemoteCount,
      usersRemoteCount,
      clientsRemoteCount,
    })
  );

  const requestId = safeText(first(input.requestId, dashboard.requestId, dashboard.meta?.requestId, homeStore.requestId, ""), "");
  const lastSyncAt = safeText(first(input.lastSyncAt, dashboard.lastSyncAt, dashboard.updatedAt, dashboard.generatedAt, homeStore.lastSyncAt, nowIso()), nowIso());
  const updatedAt = safeText(first(input.updatedAt, dashboard.updatedAt, dashboard.generatedAt, lastSyncAt), lastSyncAt);

  return {
    dashboard,

    summary,
    stats: summary,
    metrics: summary,
    totals: summary,
    counts: summary,

    widgets,
    cards: widgets,
    kpis: widgets,
    blocks: widgets,

    tickets,
    incidencias: tickets,
    ticketsRemoteCount,
    remoteCount: ticketsRemoteCount,

    invoices,
    facturas: invoices,
    invoicesRemoteCount,

    users,
    usuarios: users,
    usersRemoteCount,

    clients,
    clientes: clients,
    customers: clients,
    clientsRemoteCount,

    activity,
    activities: activity,
    recent: activity,
    recentActivity: activity,

    requestId,
    lastSyncAt,
    updatedAt,

    modules: {
      ...safeObject(dashboard.modules),
      ...safeObject(input.modules),
    },

    partial: Boolean(first(input.partial, dashboard.partial, false)),
    errors: safeArray(first(input.errors, dashboard.errors, [])),

    health: first(input.health, dashboard.health, homeStore.health, null),

    loaded: opts.loaded ?? true,
    hydrated: opts.hydrated ?? true,
    loading: false,
    refreshing: false,
    error: null,
    errorMessage: "",
  };
}

function preserveExisting(next = {}, options = {}) {
  const opts = safeObject(options);

  if (opts.preserveExisting === false || opts.replace === true) {
    return next;
  }

  const output = {
    ...next,
  };

  const keepArray = (key, previousKey = key) => {
    if (!safeArray(output[key]).length && safeArray(homeStore[previousKey]).length) {
      output[key] = homeStore[previousKey];
    }
  };

  keepArray("widgets");
  keepArray("cards", "widgets");
  keepArray("kpis", "widgets");
  keepArray("blocks", "widgets");

  keepArray("tickets");
  keepArray("incidencias", "tickets");

  keepArray("invoices");
  keepArray("facturas", "invoices");

  keepArray("users");
  keepArray("usuarios", "users");

  keepArray("clients");
  keepArray("clientes", "clients");
  keepArray("customers", "clients");

  keepArray("activity");
  keepArray("activities", "activity");
  keepArray("recent", "activity");
  keepArray("recentActivity", "activity");

  if (!hasOwnKeys(output.summary) && hasOwnKeys(homeStore.summary)) {
    output.summary = homeStore.summary;
  }

  output.stats = output.summary;
  output.metrics = output.summary;
  output.totals = output.summary;
  output.counts = output.summary;

  output.ticketsRemoteCount = Math.max(homeStore.ticketsRemoteCount, output.ticketsRemoteCount, output.tickets.length);
  output.remoteCount = Math.max(homeStore.remoteCount, output.remoteCount, output.ticketsRemoteCount);

  output.invoicesRemoteCount = Math.max(homeStore.invoicesRemoteCount, output.invoicesRemoteCount, output.invoices.length);
  output.usersRemoteCount = Math.max(homeStore.usersRemoteCount, output.usersRemoteCount, output.users.length);
  output.clientsRemoteCount = Math.max(homeStore.clientsRemoteCount, output.clientsRemoteCount, output.clients.length);

  return output;
}

function assignStore(patch = {}) {
  Object.assign(homeStore, safeObject(patch));
  syncAliases();
  return homeStore;
}

/* =========================================================
   WRITE API
========================================================= */

export function patchHomeStore(patch = {}, options = {}) {
  const opts = safeObject(options);
  const input = safeObject(patch);

  const next = opts.normalize === true
    ? normalizePayload(input, opts)
    : input;

  assignStore(
    opts.preserveExisting === false
      ? next
      : preserveExisting(next, opts)
  );

  return homeStore;
}

export function replaceHomeStore(payload = {}, options = {}) {
  const opts = safeObject(options);
  const normalized = preserveExisting(normalizePayload(payload, opts), opts);

  assignStore({
    ...normalized,
    hydrated: opts.hydrated ?? normalized.hydrated ?? true,
    loaded: opts.loaded ?? normalized.loaded ?? true,
    loading: false,
    refreshing: false,
  });

  return homeStore;
}

export function mergeHomeStore(payload = {}, options = {}) {
  return replaceHomeStore(payload, {
    ...safeObject(options),
    preserveExisting: true,
  });
}

export function clearHomeStore() {
  Object.keys(homeStore).forEach((key) => {
    delete homeStore[key];
  });

  Object.assign(homeStore, createInitialHomeStore());
  syncAliases();

  return homeStore;
}

export function resetHomeStore() {
  return clearHomeStore();
}

/* =========================================================
   COLLECTION SETTERS
========================================================= */

export function setHomeWidgetsStore(widgets = [], options = {}) {
  const rows = normalizeHomeWidgets(uniqueBy(safeArray(widgets), widgetId));

  if (!rows.length && options.replace !== true && homeStore.widgets.length) {
    return homeStore.widgets;
  }

  assignStore({
    widgets: rows,
  });

  return homeStore.widgets;
}

export function setHomeTicketsStore(tickets = [], options = {}) {
  const rows = normalizeHomeTickets(uniqueBy(safeArray(tickets), ticketId));

  if (!rows.length && options.replace !== true && homeStore.tickets.length) {
    return homeStore.tickets;
  }

  const total = Math.max(
    rows.length,
    safeNumber(options.total, safeNumber(options.remoteCount, homeStore.ticketsRemoteCount))
  );

  assignStore({
    tickets: rows,
    ticketsRemoteCount: total,
    remoteCount: Math.max(total, homeStore.remoteCount),
  });

  return homeStore.tickets;
}

export function setHomeInvoicesStore(invoices = [], options = {}) {
  const rows = normalizeHomeInvoices(uniqueBy(safeArray(invoices), invoiceId));

  if (!rows.length && options.replace !== true && homeStore.invoices.length) {
    return homeStore.invoices;
  }

  const total = Math.max(
    rows.length,
    safeNumber(options.total, safeNumber(options.remoteCount, homeStore.invoicesRemoteCount))
  );

  assignStore({
    invoices: rows,
    invoicesRemoteCount: total,
  });

  return homeStore.invoices;
}

export function setHomeUsersStore(users = [], options = {}) {
  const rows = normalizeHomeUsers(uniqueBy(safeArray(users), userId));

  if (!rows.length && options.replace !== true && homeStore.users.length) {
    return homeStore.users;
  }

  const total = Math.max(
    rows.length,
    safeNumber(options.total, safeNumber(options.remoteCount, homeStore.usersRemoteCount))
  );

  assignStore({
    users: rows,
    usersRemoteCount: total,
  });

  return homeStore.users;
}

export function setHomeClientsStore(clients = [], options = {}) {
  const rows = normalizeHomeClients(uniqueBy(safeArray(clients), clientId));

  if (!rows.length && options.replace !== true && homeStore.clients.length) {
    return homeStore.clients;
  }

  const total = Math.max(
    rows.length,
    safeNumber(options.total, safeNumber(options.remoteCount, homeStore.clientsRemoteCount))
  );

  assignStore({
    clients: rows,
    clientsRemoteCount: total,
  });

  return homeStore.clients;
}

export function setHomeActivityStore(activity = [], options = {}) {
  const rows = normalizeHomeActivityList(uniqueBy(safeArray(activity), activityId));

  if (!rows.length && options.replace !== true && homeStore.activity.length) {
    return homeStore.activity;
  }

  assignStore({
    activity: rows,
  });

  return homeStore.activity;
}

export function setHomeCollectionsStore(collections = {}, options = {}) {
  const input = safeObject(collections);

  return replaceHomeStore(
    {
      widgets: firstArray(input.widgets, input.cards, input.kpis, input.blocks),
      tickets: firstArray(input.tickets, input.incidencias),
      invoices: firstArray(input.invoices, input.facturas),
      users: firstArray(input.users, input.usuarios),
      clients: firstArray(input.clients, input.clientes, input.customers),
      activity: firstArray(input.activity, input.activities, input.recent, input.recentActivity),

      ticketsRemoteCount: first(input.ticketsRemoteCount, input.remoteCount, input.totalTickets, input.incidenciasTotal),
      invoicesRemoteCount: first(input.invoicesRemoteCount, input.facturasRemoteCount, input.totalInvoices, input.totalFacturas),
      usersRemoteCount: first(input.usersRemoteCount, input.usuariosRemoteCount, input.totalUsers, input.totalUsuarios),
      clientsRemoteCount: first(input.clientsRemoteCount, input.clientesRemoteCount, input.customersRemoteCount, input.totalClients, input.totalClientes, input.totalCustomers),
    },
    {
      ...safeObject(options),
      preserveExisting: options.preserveExisting !== false,
    }
  );
}

/* =========================================================
   WIDGET UPSERT
========================================================= */

function widgetKeys(widget = {}) {
  const raw = safeObject(widget);

  return [
    widgetId(raw),
    raw.widgetId,
    raw.widgetKey,
    raw.id,
    raw.key,
    raw.slug,
    raw.code,
    raw.title,
    raw.name,
  ]
    .map(normalizeKey)
    .filter(Boolean);
}

function findWidgetIndex(widget = {}) {
  const target = widgetKeys(widget);

  if (!target.length) return -1;

  return homeStore.widgets.findIndex((item) => {
    const keys = widgetKeys(item);
    return keys.some((key) => target.includes(key));
  });
}

export function upsertHomeWidgetStore(widget = {}) {
  const item = safeObject(widget);

  if (!hasOwnKeys(item)) return null;

  const normalized = normalizeHomeWidgets([item])[0] || item;
  const rows = [...homeStore.widgets];
  const index = findWidgetIndex(normalized);

  if (index >= 0) {
    rows[index] = {
      ...safeObject(rows[index]),
      ...normalized,
    };
  } else {
    rows.push(normalized);
  }

  setHomeWidgetsStore(rows, {
    replace: true,
  });

  return normalized;
}

export function removeHomeWidgetStore(widgetId = "") {
  const id = normalizeKey(widgetId);

  if (!id) return false;

  const rows = homeStore.widgets.filter((item) => !widgetKeys(item).includes(id));

  if (rows.length === homeStore.widgets.length) return false;

  setHomeWidgetsStore(rows, {
    replace: true,
  });

  return true;
}

/* =========================================================
   FLAGS
========================================================= */

export function setHomeStoreLoading(value = false) {
  return patchHomeStore({
    loading: safeBoolean(value, false),
    refreshing: safeBoolean(value, false) ? false : homeStore.refreshing,
  });
}

export function setHomeStoreRefreshing(value = false) {
  return patchHomeStore({
    refreshing: safeBoolean(value, false),
    loading: safeBoolean(value, false) ? false : homeStore.loading,
  });
}

export function setHomeStoreError(error = null) {
  const message = safeText(first(error?.message, error?.data?.message, error), "");

  return patchHomeStore({
    error,
    errorMessage: message,
    loading: false,
    refreshing: false,
  });
}

export function setHomeStoreLoaded(value = true) {
  const loaded = safeBoolean(value, true);

  return patchHomeStore({
    loaded,
    loading: loaded ? false : homeStore.loading,
    refreshing: loaded ? false : homeStore.refreshing,
  });
}

export function setHomeStoreHydrated(value = true) {
  return patchHomeStore({
    hydrated: safeBoolean(value, true),
  });
}

export function setHomeStoreRequestId(requestId = "") {
  return patchHomeStore({
    requestId: safeText(requestId, ""),
  });
}

export function setHomeStoreLastSyncAt(value = null) {
  const next = value || nowIso();

  return patchHomeStore({
    lastSyncAt: next,
    updatedAt: next,
  });
}

export function setHomeStoreHealth(health = null) {
  return patchHomeStore({
    health,
  });
}

export function setHomeStorePage(page = DEFAULT_PAGE) {
  return patchHomeStore({
    page: Math.max(1, safeNumber(page, DEFAULT_PAGE)),
  });
}

export function setHomeStorePageSize(pageSize = DEFAULT_PAGE_SIZE) {
  return patchHomeStore({
    page: DEFAULT_PAGE,
    pageSize: Math.max(1, safeNumber(pageSize, DEFAULT_PAGE_SIZE)),
  });
}

/* =========================================================
   GETTERS
========================================================= */

export function getHomeStore() {
  syncAliases();
  return homeStore;
}

export function getHomeDashboardStore() {
  syncAliases();
  return safeObject(homeStore.dashboard);
}

export function getHomeSummaryStore() {
  syncAliases();
  return safeObject(homeStore.summary);
}

export function getHomeStatsStore() {
  return getHomeSummaryStore();
}

export function getHomeWidgetsStore() {
  syncAliases();
  return safeArray(homeStore.widgets);
}

export function getHomeCardsStore() {
  return getHomeWidgetsStore();
}

export function getHomeKpisStore() {
  return getHomeWidgetsStore();
}

export function getHomeTicketsStore() {
  syncAliases();
  return safeArray(homeStore.tickets);
}

export function getHomeIncidenciasStore() {
  return getHomeTicketsStore();
}

export function getHomeInvoicesStore() {
  syncAliases();
  return safeArray(homeStore.invoices);
}

export function getHomeFacturasStore() {
  return getHomeInvoicesStore();
}

export function getHomeUsersStore() {
  syncAliases();
  return safeArray(homeStore.users);
}

export function getHomeUsuariosStore() {
  return getHomeUsersStore();
}

export function getHomeClientsStore() {
  syncAliases();
  return safeArray(homeStore.clients);
}

export function getHomeClientesStore() {
  return getHomeClientsStore();
}

export function getHomeCustomersStore() {
  return getHomeClientsStore();
}

export function getHomeActivityStore() {
  syncAliases();
  return safeArray(homeStore.activity);
}

export function getHomeRecentStore() {
  return getHomeActivityStore();
}

function findById(items = [], id = "", picker = null) {
  const target = normalizeKey(id);

  if (!target) return null;

  return (
    safeArray(items).find((item) => {
      const keys = [
        isFunction(picker) ? picker(item) : "",
        item?.id,
        item?._id,
        item?.key,
        item?.code,
        item?.slug,
        item?.widgetId,
        item?.widgetKey,
        item?.ticketId,
        item?.incidenciaId,
        item?.facturaId,
        item?.invoiceId,
        item?.userId,
        item?.usuarioId,
        item?.clientId,
        item?.clienteId,
        item?.customerId,
        item?.email,
        item?.username,
        item?.title,
        item?.name,
      ]
        .map(normalizeKey)
        .filter(Boolean);

      return keys.includes(target);
    }) || null
  );
}

export function getHomeWidgetByIdStore(id = "") {
  return findById(homeStore.widgets, id, widgetId);
}

export function getHomeTicketByIdStore(id = "") {
  return findById(homeStore.tickets, id, ticketId);
}

export function getHomeInvoiceByIdStore(id = "") {
  return findById(homeStore.invoices, id, invoiceId);
}

export function getHomeUserByIdStore(id = "") {
  return findById(homeStore.users, id, userId);
}

export function getHomeClientByIdStore(id = "") {
  return findById(homeStore.clients, id, clientId);
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHomeCollectionsEnvelope() {
  syncAliases();

  return {
    widgets: collectionEnvelope(homeStore.widgets, homeStore.widgets.length),
    cards: collectionEnvelope(homeStore.widgets, homeStore.widgets.length),
    kpis: collectionEnvelope(homeStore.widgets, homeStore.widgets.length),
    blocks: collectionEnvelope(homeStore.widgets, homeStore.widgets.length),

    tickets: collectionEnvelope(homeStore.tickets, homeStore.ticketsRemoteCount),
    incidencias: collectionEnvelope(homeStore.tickets, homeStore.ticketsRemoteCount),

    invoices: collectionEnvelope(homeStore.invoices, homeStore.invoicesRemoteCount),
    facturas: collectionEnvelope(homeStore.invoices, homeStore.invoicesRemoteCount),

    users: collectionEnvelope(homeStore.users, homeStore.usersRemoteCount),
    usuarios: collectionEnvelope(homeStore.users, homeStore.usersRemoteCount),

    clients: collectionEnvelope(homeStore.clients, homeStore.clientsRemoteCount),
    clientes: collectionEnvelope(homeStore.clients, homeStore.clientsRemoteCount),
    customers: collectionEnvelope(homeStore.clients, homeStore.clientsRemoteCount),

    activity: collectionEnvelope(homeStore.activity, homeStore.activity.length),
    activities: collectionEnvelope(homeStore.activity, homeStore.activity.length),
    recent: collectionEnvelope(homeStore.activity, homeStore.activity.length),
    recentActivity: collectionEnvelope(homeStore.activity, homeStore.activity.length),
  };
}

export function getHomeStoreSnapshot(options = {}) {
  const includeCollections = options.includeCollections === true;

  syncAliases();

  const snapshot = {
    version: HOME_STORE_VERSION,
    source: HOME_STORE_SOURCE,

    hydrated: Boolean(homeStore.hydrated),
    loaded: Boolean(homeStore.loaded),
    loading: Boolean(homeStore.loading),
    refreshing: Boolean(homeStore.refreshing),

    page: safeNumber(homeStore.page, DEFAULT_PAGE),
    pageSize: safeNumber(homeStore.pageSize, DEFAULT_PAGE_SIZE),

    requestId: safeText(homeStore.requestId, ""),
    lastSyncAt: homeStore.lastSyncAt || null,
    updatedAt: homeStore.updatedAt || null,

    hasDashboard: hasOwnKeys(homeStore.dashboard),
    hasSummary: hasOwnKeys(homeStore.summary),

    widgetsCount: homeStore.widgets.length,

    ticketsVisibleCount: homeStore.tickets.length,
    ticketsRemoteCount: homeStore.ticketsRemoteCount,

    invoicesVisibleCount: homeStore.invoices.length,
    invoicesRemoteCount: homeStore.invoicesRemoteCount,

    usersVisibleCount: homeStore.users.length,
    usersRemoteCount: homeStore.usersRemoteCount,

    clientsVisibleCount: homeStore.clients.length,
    clientsRemoteCount: homeStore.clientsRemoteCount,

    activityCount: homeStore.activity.length,

    partial: Boolean(homeStore.partial),
    errorsCount: homeStore.errors.length,

    hasHealth: Boolean(homeStore.health),

    hasError: Boolean(homeStore.error || homeStore.errorMessage),
    errorMessage: safeText(homeStore.errorMessage, ""),
  };

  if (includeCollections) {
    snapshot.dashboard = clone(homeStore.dashboard, {});
    snapshot.summary = clone(homeStore.summary, {});

    snapshot.widgets = clone(homeStore.widgets, []);
    snapshot.tickets = clone(homeStore.tickets, []);
    snapshot.invoices = clone(homeStore.invoices, []);
    snapshot.users = clone(homeStore.users, []);
    snapshot.clients = clone(homeStore.clients, []);
    snapshot.activity = clone(homeStore.activity, []);

    snapshot.modules = clone(homeStore.modules, {});
    snapshot.errors = clone(homeStore.errors, []);
    snapshot.collections = clone(getHomeCollectionsEnvelope(), {});
  }

  return snapshot;
}

/* =========================================================
   COMPAT ALIASES
========================================================= */

export function subscribeHomeStore() {
  return () => {};
}

export function exposeHomeStoreBridge() {
  return HomeStore;
}

export const getDashboardStore = getHomeDashboardStore;
export const getWidgetsStore = getHomeWidgetsStore;
export const getSummaryStore = getHomeSummaryStore;
export const getStatsStore = getHomeStatsStore;

export const getTicketsStore = getHomeTicketsStore;
export const getIncidenciasStore = getHomeIncidenciasStore;

export const getFacturasStore = getHomeFacturasStore;
export const getInvoicesStore = getHomeInvoicesStore;

export const getUsersStore = getHomeUsersStore;
export const getUsuariosStore = getHomeUsuariosStore;

export const getClientsStore = getHomeClientsStore;
export const getClientesStore = getHomeClientesStore;
export const getCustomersStore = getHomeCustomersStore;

export const getRecentStore = getHomeRecentStore;
export const getActivityStore = getHomeActivityStore;

export const getWidgetByIdStore = getHomeWidgetByIdStore;
export const getTicketByIdStore = getHomeTicketByIdStore;
export const getInvoiceByIdStore = getHomeInvoiceByIdStore;
export const getUserByIdStore = getHomeUserByIdStore;
export const getClientByIdStore = getHomeClientByIdStore;

/* =========================================================
   PUBLIC API
========================================================= */

syncAliases();

export const HomeStore = Object.freeze({
  version: HOME_STORE_VERSION,
  source: HOME_STORE_SOURCE,

  state: homeStore,
  store: homeStore,

  subscribe: subscribeHomeStore,

  patch: patchHomeStore,
  replace: replaceHomeStore,
  merge: mergeHomeStore,
  clear: clearHomeStore,
  reset: resetHomeStore,

  replaceHomeStore,
  mergeHomeStore,
  patchHomeStore,

  upsertHomeWidgetStore,
  removeHomeWidgetStore,

  setHomeWidgetsStore,
  setHomeTicketsStore,
  setHomeInvoicesStore,
  setHomeUsersStore,
  setHomeClientsStore,
  setHomeActivityStore,
  setHomeCollectionsStore,

  setHomeStoreLoading,
  setHomeStoreRefreshing,
  setHomeStoreError,
  setHomeStoreLoaded,
  setHomeStoreHydrated,
  setHomeStoreRequestId,
  setHomeStoreLastSyncAt,
  setHomeStoreHealth,
  setHomeStorePage,
  setHomeStorePageSize,

  getHomeStore,
  getHomeDashboardStore,
  getHomeSummaryStore,
  getHomeStatsStore,

  getHomeWidgetsStore,
  getHomeCardsStore,
  getHomeKpisStore,

  getHomeTicketsStore,
  getHomeIncidenciasStore,

  getHomeInvoicesStore,
  getHomeFacturasStore,

  getHomeUsersStore,
  getHomeUsuariosStore,

  getHomeClientsStore,
  getHomeClientesStore,
  getHomeCustomersStore,

  getHomeActivityStore,
  getHomeRecentStore,

  getHomeWidgetByIdStore,
  getHomeTicketByIdStore,
  getHomeInvoiceByIdStore,
  getHomeUserByIdStore,
  getHomeClientByIdStore,

  getHomeCollectionsEnvelope,
  getHomeStoreSnapshot,

  exposeHomeStoreBridge,
});

export default HomeStore;
