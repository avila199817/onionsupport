/* =========================================================
   Onion Support - Home Store
   Archivo: /src/views/home/home.store.js

   Responsabilidad:
   - Cache runtime mínima de datos Home.
   - Recibir dashboard desde home.api.js / homeView.js.
   - Normalizar usando home.model.js.
   - Mantener aliases mínimos para template/selectors.
   - Preservar datos válidos si llega payload vacío.
   - Exponer getters usados por Home.
   - Sin DOM.
   - Sin CSS.
   - Sin HTTP.
   - Sin Auth.
   - Sin Router.
   - Sin eventos.
   - Sin subscribers reales.
   - Sin globals window.
   - Sin índices paralelos.
   - Sin historial interno.
   - Sin magia negra.
========================================================= */

import {
  normalizeHomeDashboard,
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
} from "./home.model.js";

export const HOME_STORE_VERSION = "home.store.v2";
export const HOME_STORE_SOURCE = "views.home.store";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 5;

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

function hasKeys(value = {}) {
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
    // fallback abajo
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
    const raw = safeText(picker(item), "");
    const key = raw ? normalizeKey(raw) : "";

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
   IDS
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
   NORMALIZE
========================================================= */

function normalizeDashboard(input = {}, previousDashboard = {}) {
  const raw = safeObject(input);

  try {
    return normalizeHomeDashboard(raw);
  } catch {
    return {
      ...safeObject(previousDashboard),
      ...raw,
    };
  }
}

function countFrom({
  explicit = null,
  summary = {},
  dashboard = {},
  keys = [],
  fallback = 0,
} = {}) {
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

function normalizedPayload(payload = {}, options = {}) {
  const input = safeObject(payload);
  const opts = safeObject(options);

  const sourceDashboard = safeObject(first(input.dashboard, input, {}));
  const dashboard = normalizeDashboard(
    sourceDashboard,
    opts.preserveExisting === false ? {} : homeStore.dashboard
  );

  const summary = safeObject(
    first(
      input.summary,
      input.stats,
      input.metrics,
      input.totals,
      input.counts,
      dashboard.summary,
      dashboard.stats,
      dashboard.metrics,
      dashboard.totals,
      dashboard.counts,
      {}
    )
  );

  const widgets = uniqueBy(
    normalizeHomeWidgets(
      firstArray(
        input.widgets,
        input.cards,
        input.kpis,
        input.blocks,
        dashboard.widgets,
        dashboard.cards,
        dashboard.kpis,
        dashboard.blocks
      ) || []
    ),
    widgetId
  );

  const tickets = uniqueBy(
    normalizeHomeTickets(
      firstArray(input.tickets, input.incidencias, dashboard.tickets, dashboard.incidencias) || []
    ),
    ticketId
  );

  const invoices = uniqueBy(
    normalizeHomeInvoices(
      firstArray(input.invoices, input.facturas, dashboard.invoices, dashboard.facturas) || []
    ),
    invoiceId
  );

  const users = uniqueBy(
    normalizeHomeUsers(
      firstArray(input.users, input.usuarios, dashboard.users, dashboard.usuarios) || []
    ),
    userId
  );

  const clients = uniqueBy(
    normalizeHomeClients(
      firstArray(input.clients, input.clientes, input.customers, dashboard.clients, dashboard.clientes, dashboard.customers) || []
    ),
    clientId
  );

  const activity = normalizeHomeActivityList(
    firstArray(
      input.activity,
      input.activities,
      input.recent,
      input.recentActivity,
      dashboard.activity,
      dashboard.activities,
      dashboard.recent,
      dashboard.recentActivity
    ) || []
  );

  const ticketsRemoteCount = countFrom({
    explicit: first(input.ticketsRemoteCount, input.remoteCount, dashboard.ticketsRemoteCount, dashboard.remoteCount),
    summary,
    dashboard,
    keys: ["totalTickets", "ticketsTotal", "incidenciasTotal", "totalIncidencias", "ticketsCount", "incidenciasCount"],
    fallback: tickets.length,
  });

  const invoicesRemoteCount = countFrom({
    explicit: first(input.invoicesRemoteCount, input.facturasRemoteCount, dashboard.invoicesRemoteCount),
    summary,
    dashboard,
    keys: ["totalInvoices", "invoicesTotal", "facturasTotal", "totalFacturas", "invoicesCount", "facturasCount"],
    fallback: invoices.length,
  });

  const usersRemoteCount = countFrom({
    explicit: first(input.usersRemoteCount, input.usuariosRemoteCount, dashboard.usersRemoteCount),
    summary,
    dashboard,
    keys: ["usersCount", "usuariosCount", "totalUsers", "totalUsuarios"],
    fallback: users.length,
  });

  const clientsRemoteCount = countFrom({
    explicit: first(input.clientsRemoteCount, input.clientesRemoteCount, input.customersRemoteCount, dashboard.clientsRemoteCount),
    summary,
    dashboard,
    keys: ["clientsCount", "clientesCount", "customersCount", "totalClients", "totalClientes", "totalCustomers"],
    fallback: clients.length,
  });

  const requestId = safeText(
    first(input.requestId, dashboard.requestId, dashboard.meta?.requestId, homeStore.requestId, ""),
    ""
  );

  const lastSyncAt = safeText(
    first(input.lastSyncAt, dashboard.lastSyncAt, dashboard.updatedAt, dashboard.generatedAt, homeStore.lastSyncAt, nowIso()),
    nowIso()
  );

  const updatedAt = safeText(
    first(input.updatedAt, dashboard.updatedAt, dashboard.generatedAt, lastSyncAt),
    lastSyncAt
  );

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

  if (opts.replace === true || opts.preserveExisting === false) {
    return next;
  }

  const output = {
    ...next,
  };

  for (const key of ["widgets", "tickets", "invoices", "users", "clients", "activity"]) {
    if (!safeArray(output[key]).length && safeArray(homeStore[key]).length) {
      output[key] = homeStore[key];
    }
  }

  if (!hasKeys(output.summary) && hasKeys(homeStore.summary)) {
    output.summary = homeStore.summary;
  }

  output.ticketsRemoteCount = Math.max(homeStore.ticketsRemoteCount, output.ticketsRemoteCount || 0, safeArray(output.tickets).length);
  output.remoteCount = Math.max(homeStore.remoteCount, output.remoteCount || 0, output.ticketsRemoteCount);

  output.invoicesRemoteCount = Math.max(homeStore.invoicesRemoteCount, output.invoicesRemoteCount || 0, safeArray(output.invoices).length);
  output.usersRemoteCount = Math.max(homeStore.usersRemoteCount, output.usersRemoteCount || 0, safeArray(output.users).length);
  output.clientsRemoteCount = Math.max(homeStore.clientsRemoteCount, output.clientsRemoteCount || 0, safeArray(output.clients).length);

  return output;
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

    invoicesTotal: homeStore.invoicesRemoteCount,
    facturasTotal: homeStore.invoicesRemoteCount,
    totalInvoices: homeStore.invoicesRemoteCount,
    totalFacturas: homeStore.invoicesRemoteCount,

    usersTotal: homeStore.usersRemoteCount,
    usuariosTotal: homeStore.usersRemoteCount,
    totalUsers: homeStore.usersRemoteCount,
    totalUsuarios: homeStore.usersRemoteCount,

    clientsTotal: homeStore.clientsRemoteCount,
    clientesTotal: homeStore.clientsRemoteCount,
    customersTotal: homeStore.clientsRemoteCount,
    totalClients: homeStore.clientsRemoteCount,
    totalClientes: homeStore.clientsRemoteCount,
    totalCustomers: homeStore.clientsRemoteCount,

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
      visibleTicketsCount: homeStore.tickets.length,

      invoicesCount: homeStore.invoicesRemoteCount,
      visibleInvoicesCount: homeStore.invoices.length,

      usersCount: homeStore.usersRemoteCount,
      visibleUsersCount: homeStore.users.length,

      clientsCount: homeStore.clientsRemoteCount,
      visibleClientsCount: homeStore.clients.length,

      activityCount: homeStore.activity.length,
    },
  };

  return homeStore;
}

function assignStore(patch = {}) {
  Object.assign(homeStore, safeObject(patch));
  syncAliases();

  return homeStore;
}

/* =========================================================
   WRITE API
========================================================= */

export function replaceHomeStore(payload = {}, options = {}) {
  const opts = safeObject(options);
  const next = preserveExisting(normalizedPayload(payload, opts), opts);

  return assignStore({
    ...next,
    hydrated: opts.hydrated ?? next.hydrated ?? true,
    loaded: opts.loaded ?? next.loaded ?? true,
    loading: false,
    refreshing: false,
  });
}

export function mergeHomeStore(payload = {}, options = {}) {
  return replaceHomeStore(payload, {
    ...safeObject(options),
    preserveExisting: true,
  });
}

export function patchHomeStore(patch = {}, options = {}) {
  const opts = safeObject(options);
  const data = safeObject(patch);

  if (opts.normalize === true || data.dashboard) {
    return replaceHomeStore(data, opts);
  }

  return assignStore(
    opts.preserveExisting === false
      ? data
      : preserveExisting(data, opts)
  );
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
  return patchHomeStore(
    {
      widgets: uniqueBy(normalizeHomeWidgets(widgets), widgetId),
    },
    options
  ).widgets;
}

export function setHomeTicketsStore(tickets = [], options = {}) {
  const rows = uniqueBy(normalizeHomeTickets(tickets), ticketId);

  return patchHomeStore(
    {
      tickets: rows,
      ticketsRemoteCount: Math.max(rows.length, safeNumber(options.remoteCount, homeStore.ticketsRemoteCount)),
      remoteCount: Math.max(rows.length, safeNumber(options.remoteCount, homeStore.remoteCount)),
    },
    options
  ).tickets;
}

export function setHomeInvoicesStore(invoices = [], options = {}) {
  const rows = uniqueBy(normalizeHomeInvoices(invoices), invoiceId);

  return patchHomeStore(
    {
      invoices: rows,
      invoicesRemoteCount: Math.max(rows.length, safeNumber(options.remoteCount, homeStore.invoicesRemoteCount)),
    },
    options
  ).invoices;
}

export function setHomeUsersStore(users = [], options = {}) {
  const rows = uniqueBy(normalizeHomeUsers(users), userId);

  return patchHomeStore(
    {
      users: rows,
      usersRemoteCount: Math.max(rows.length, safeNumber(options.remoteCount, homeStore.usersRemoteCount)),
    },
    options
  ).users;
}

export function setHomeClientsStore(clients = [], options = {}) {
  const rows = uniqueBy(normalizeHomeClients(clients), clientId);

  return patchHomeStore(
    {
      clients: rows,
      clientsRemoteCount: Math.max(rows.length, safeNumber(options.remoteCount, homeStore.clientsRemoteCount)),
    },
    options
  ).clients;
}

export function setHomeActivityStore(activity = [], options = {}) {
  return patchHomeStore(
    {
      activity: normalizeHomeActivityList(activity),
    },
    options
  ).activity;
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
   WIDGET MUTATION
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

export function upsertHomeWidgetStore(widget = {}) {
  const item = normalizeHomeWidgets([widget])[0] || safeObject(widget);

  if (!hasKeys(item)) return null;

  const keys = widgetKeys(item);
  const rows = [...homeStore.widgets];

  const index = rows.findIndex((row) => {
    const rowKeys = widgetKeys(row);
    return rowKeys.some((key) => keys.includes(key));
  });

  if (index >= 0) {
    rows[index] = {
      ...safeObject(rows[index]),
      ...item,
    };
  } else {
    rows.push(item);
  }

  setHomeWidgetsStore(rows, {
    replace: true,
  });

  return item;
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
  return safeObject(getHomeStore().dashboard);
}

export function getHomeSummaryStore() {
  return safeObject(getHomeStore().summary);
}

export function getHomeStatsStore() {
  return getHomeSummaryStore();
}

export function getHomeWidgetsStore() {
  return safeArray(getHomeStore().widgets);
}

export function getHomeCardsStore() {
  return getHomeWidgetsStore();
}

export function getHomeKpisStore() {
  return getHomeWidgetsStore();
}

export function getHomeTicketsStore() {
  return safeArray(getHomeStore().tickets);
}

export function getHomeIncidenciasStore() {
  return getHomeTicketsStore();
}

export function getHomeInvoicesStore() {
  return safeArray(getHomeStore().invoices);
}

export function getHomeFacturasStore() {
  return getHomeInvoicesStore();
}

export function getHomeUsersStore() {
  return safeArray(getHomeStore().users);
}

export function getHomeUsuariosStore() {
  return getHomeUsersStore();
}

export function getHomeClientsStore() {
  return safeArray(getHomeStore().clients);
}

export function getHomeClientesStore() {
  return getHomeClientsStore();
}

export function getHomeCustomersStore() {
  return getHomeClientsStore();
}

export function getHomeActivityStore() {
  return safeArray(getHomeStore().activity);
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
        picker ? picker(item) : "",
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

export function getHomeCollectionsEnvelope() {
  const store = getHomeStore();

  return {
    widgets: collectionEnvelope(store.widgets, store.widgets.length),
    cards: collectionEnvelope(store.widgets, store.widgets.length),
    kpis: collectionEnvelope(store.widgets, store.widgets.length),
    blocks: collectionEnvelope(store.widgets, store.widgets.length),

    tickets: collectionEnvelope(store.tickets, store.ticketsRemoteCount),
    incidencias: collectionEnvelope(store.tickets, store.ticketsRemoteCount),

    invoices: collectionEnvelope(store.invoices, store.invoicesRemoteCount),
    facturas: collectionEnvelope(store.invoices, store.invoicesRemoteCount),

    users: collectionEnvelope(store.users, store.usersRemoteCount),
    usuarios: collectionEnvelope(store.users, store.usersRemoteCount),

    clients: collectionEnvelope(store.clients, store.clientsRemoteCount),
    clientes: collectionEnvelope(store.clients, store.clientsRemoteCount),
    customers: collectionEnvelope(store.clients, store.clientsRemoteCount),

    activity: collectionEnvelope(store.activity, store.activity.length),
    activities: collectionEnvelope(store.activity, store.activity.length),
    recent: collectionEnvelope(store.activity, store.activity.length),
    recentActivity: collectionEnvelope(store.activity, store.activity.length),
  };
}

export function getHomeStoreSnapshot(options = {}) {
  const store = getHomeStore();
  const includeCollections = options.includeCollections === true;

  const snapshot = {
    version: HOME_STORE_VERSION,
    source: HOME_STORE_SOURCE,

    hydrated: Boolean(store.hydrated),
    loaded: Boolean(store.loaded),
    loading: Boolean(store.loading),
    refreshing: Boolean(store.refreshing),

    page: safeNumber(store.page, DEFAULT_PAGE),
    pageSize: safeNumber(store.pageSize, DEFAULT_PAGE_SIZE),

    requestId: safeText(store.requestId, ""),
    lastSyncAt: store.lastSyncAt || null,
    updatedAt: store.updatedAt || null,

    hasDashboard: hasKeys(store.dashboard),
    hasSummary: hasKeys(store.summary),

    widgetsCount: store.widgets.length,

    ticketsVisibleCount: store.tickets.length,
    ticketsRemoteCount: store.ticketsRemoteCount,

    invoicesVisibleCount: store.invoices.length,
    invoicesRemoteCount: store.invoicesRemoteCount,

    usersVisibleCount: store.users.length,
    usersRemoteCount: store.usersRemoteCount,

    clientsVisibleCount: store.clients.length,
    clientsRemoteCount: store.clientsRemoteCount,

    activityCount: store.activity.length,

    partial: Boolean(store.partial),
    errorsCount: store.errors.length,

    hasHealth: Boolean(store.health),

    hasError: Boolean(store.error || store.errorMessage),
    errorMessage: safeText(store.errorMessage, ""),
  };

  if (includeCollections) {
    snapshot.dashboard = clone(store.dashboard, {});
    snapshot.summary = clone(store.summary, {});

    snapshot.widgets = clone(store.widgets, []);
    snapshot.tickets = clone(store.tickets, []);
    snapshot.invoices = clone(store.invoices, []);
    snapshot.users = clone(store.users, []);
    snapshot.clients = clone(store.clients, []);
    snapshot.activity = clone(store.activity, []);

    snapshot.modules = clone(store.modules, {});
    snapshot.errors = clone(store.errors, []);
    snapshot.collections = clone(getHomeCollectionsEnvelope(), {});
  }

  return snapshot;
}

/* =========================================================
   COMPAT MÍNIMA
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
