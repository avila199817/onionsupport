/* =========================================================
   Onion Support - Home State
   Archivo: /src/views/home/home.state.js

   Responsabilidad:
   - Estado runtime mínimo de Home.
   - Mantener shape estable para template/selectors.
   - Recibir dashboard ya normalizado.
   - Preservar datos existentes si llega payload vacío.
   - Exponer setters usados por homeView.js.
   - Sin AppCore.
   - Sin eventos.
   - Sin window globals.
   - Sin Router.
   - Sin Auth.
   - Sin HTTP.
   - Sin Storage.
   - Sin CSS.
   - Sin magia negra.
========================================================= */

export const HOME_STATE_VERSION = "home.state.v2";

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

    const number = Number(clean);
    return Number.isFinite(number) ? number : fallback;
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

    if (["true", "yes", "si", "sí", "on", "ok"].includes(clean)) return true;
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

function normalizeError(error = null) {
  if (!error) return null;

  if (typeof error === "string") {
    return {
      name: "HomeStateError",
      message: safeText(error, "Error Home."),
      code: "HOME_STATE_ERROR",
    };
  }

  const value = safeObject(error);

  return {
    name: safeText(value.name, "HomeStateError"),
    message: safeText(
      first(
        value.response?.data?.message,
        value.data?.message,
        value.message,
        value.detail,
        value.error,
        "Error Home."
      ),
      "Error Home."
    ),
    code: safeText(
      first(
        value.code,
        value.status,
        value.statusCode,
        value.errorCode,
        "HOME_STATE_ERROR"
      ),
      "HOME_STATE_ERROR"
    ),
  };
}

/* =========================================================
   INITIAL STATE
========================================================= */

export function createInitialHomeState() {
  return {
    version: HOME_STATE_VERSION,

    hydrated: false,
    loaded: false,
    loading: false,
    refreshing: false,
    creating: false,

    openingTicketId: "",
    selectedTicketId: "",
    navigatingAction: "",

    error: "",
    lastError: null,

    page: DEFAULT_PAGE,
    pageSize: DEFAULT_PAGE_SIZE,

    remoteCount: 0,
    totalCount: 0,

    ticketsRemoteCount: 0,
    invoicesRemoteCount: 0,
    usersRemoteCount: 0,
    clientsRemoteCount: 0,
    activityRemoteCount: 0,

    requestId: "",
    lastSyncAt: "",
    lastUpdatedAt: "",

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

    invoices: [],
    facturas: [],

    users: [],
    usuarios: [],

    clients: [],
    clientes: [],
    customers: [],

    activity: [],
    activities: [],
    recent: [],
    recentActivity: [],

    health: null,

    meta: {},
    partial: false,
    errors: [],
  };
}

export const homeState = createInitialHomeState();

/* =========================================================
   NORMALIZATION
========================================================= */

function numberFrom(...values) {
  return Math.max(0, ...values.map((value) => safeNumber(value, 0)));
}

function normalizeSummary(summary = {}) {
  const raw = safeObject(summary);

  const totalTickets = numberFrom(
    raw.totalTickets,
    raw.ticketsTotal,
    raw.incidenciasTotal,
    raw.totalIncidencias,
    raw.ticketsCount,
    raw.incidenciasCount,
    homeState.ticketsRemoteCount,
    homeState.tickets.length
  );

  const openTickets = numberFrom(
    raw.openTickets,
    raw.pendingTickets,
    raw.openIncidencias,
    raw.pendingIncidencias,
    raw.incidenciasAbiertas
  );

  const closedTickets = numberFrom(
    raw.closedTickets,
    raw.resolvedTickets,
    raw.closedIncidencias,
    raw.resolvedIncidencias,
    raw.incidenciasCerradas
  );

  const urgentTickets = numberFrom(
    raw.urgentTickets,
    raw.urgentIncidencias,
    raw.highPriorityTickets,
    raw.incidenciasUrgentes
  );

  const totalInvoices = numberFrom(
    raw.totalInvoices,
    raw.invoicesTotal,
    raw.facturasTotal,
    raw.totalFacturas,
    raw.invoicesCount,
    raw.facturasCount,
    homeState.invoicesRemoteCount,
    homeState.invoices.length
  );

  const pendingInvoices = numberFrom(
    raw.pendingInvoices,
    raw.pendingFacturas,
    raw.facturasPendientes,
    raw.invoicesPending,
    raw.facturasVencidas,
    raw.overdueInvoices
  );

  const invoiceAmount = numberFrom(
    raw.invoiceAmount,
    raw.billingTotal,
    raw.totalBilling,
    raw.totalFacturado,
    raw.importeFacturas,
    raw.facturacionVisible,
    raw.facturacionTotal
  );

  const usersCount = numberFrom(
    raw.usersCount,
    raw.usuariosCount,
    raw.totalUsers,
    raw.totalUsuarios,
    homeState.usersRemoteCount,
    homeState.users.length
  );

  const clientsCount = numberFrom(
    raw.clientsCount,
    raw.clientesCount,
    raw.customersCount,
    raw.totalClients,
    raw.totalClientes,
    raw.totalCustomers,
    homeState.clientsRemoteCount,
    homeState.clients.length
  );

  const attachmentsCount = numberFrom(
    raw.attachmentsCount,
    raw.filesCount,
    raw.adjuntosCount
  );

  return {
    ...raw,

    totalTickets,
    ticketsTotal: totalTickets,
    incidenciasTotal: totalTickets,
    totalIncidencias: totalTickets,
    ticketsCount: totalTickets,
    incidenciasCount: totalTickets,

    openTickets,
    pendingTickets: openTickets,
    openIncidencias: openTickets,
    pendingIncidencias: openTickets,
    incidenciasAbiertas: openTickets,

    closedTickets,
    resolvedTickets: closedTickets,
    closedIncidencias: closedTickets,
    resolvedIncidencias: closedTickets,
    incidenciasCerradas: closedTickets,

    urgentTickets,
    urgentIncidencias: urgentTickets,
    highPriorityTickets: urgentTickets,

    totalInvoices,
    invoicesTotal: totalInvoices,
    facturasTotal: totalInvoices,
    totalFacturas: totalInvoices,
    invoicesCount: totalInvoices,
    facturasCount: totalInvoices,

    pendingInvoices,
    pendingFacturas: pendingInvoices,
    facturasPendientes: pendingInvoices,
    invoicesPending: pendingInvoices,

    invoiceAmount,
    billingTotal: invoiceAmount,
    totalBilling: invoiceAmount,
    totalFacturado: invoiceAmount,
    importeFacturas: invoiceAmount,
    facturacionVisible: invoiceAmount,
    facturacionTotal: invoiceAmount,

    usersCount,
    usuariosCount: usersCount,
    totalUsers: usersCount,
    totalUsuarios: usersCount,

    clientsCount,
    clientesCount: clientsCount,
    customersCount: clientsCount,
    totalClients: clientsCount,
    totalClientes: clientsCount,
    totalCustomers: clientsCount,

    attachmentsCount,
    filesCount: attachmentsCount,
    adjuntosCount: attachmentsCount,
  };
}

function syncAliases() {
  homeState.incidencias = homeState.tickets;

  homeState.facturas = homeState.invoices;

  homeState.usuarios = homeState.users;

  homeState.clientes = homeState.clients;
  homeState.customers = homeState.clients;

  homeState.activities = homeState.activity;
  homeState.recent = homeState.activity;
  homeState.recentActivity = homeState.activity;

  homeState.cards = homeState.widgets;
  homeState.kpis = homeState.widgets;
  homeState.blocks = homeState.widgets;

  homeState.summary = normalizeSummary(homeState.summary);
  homeState.stats = homeState.summary;
  homeState.metrics = homeState.summary;
  homeState.totals = homeState.summary;
  homeState.counts = homeState.summary;

  homeState.dashboard = {
    ...safeObject(homeState.dashboard),

    summary: homeState.summary,
    stats: homeState.summary,
    metrics: homeState.summary,
    totals: homeState.summary,
    counts: homeState.summary,

    widgets: homeState.widgets,
    cards: homeState.widgets,
    kpis: homeState.widgets,
    blocks: homeState.widgets,

    tickets: homeState.tickets,
    incidencias: homeState.tickets,

    invoices: homeState.invoices,
    facturas: homeState.invoices,

    users: homeState.users,
    usuarios: homeState.users,

    clients: homeState.clients,
    clientes: homeState.clients,
    customers: homeState.clients,

    activity: homeState.activity,
    activities: homeState.activity,
    recent: homeState.activity,
    recentActivity: homeState.activity,

    requestId: homeState.requestId,
    updatedAt: homeState.lastSyncAt,
    lastSyncAt: homeState.lastSyncAt,

    partial: homeState.partial,
    errors: homeState.errors,

    meta: {
      ...safeObject(homeState.dashboard?.meta),
      ...safeObject(homeState.meta),

      widgetsCount: homeState.widgets.length,

      ticketsCount: homeState.summary.totalTickets,
      incidenciasCount: homeState.summary.totalTickets,
      visibleTicketsCount: homeState.tickets.length,

      invoicesCount: homeState.summary.totalInvoices,
      facturasCount: homeState.summary.totalInvoices,
      visibleInvoicesCount: homeState.invoices.length,

      usersCount: homeState.summary.usersCount,
      usuariosCount: homeState.summary.usuariosCount,
      visibleUsersCount: homeState.users.length,

      clientsCount: homeState.summary.clientsCount,
      clientesCount: homeState.summary.clientesCount,
      customersCount: homeState.summary.customersCount,
      visibleClientsCount: homeState.clients.length,

      activityCount: homeState.activity.length,
      recentCount: homeState.activity.length,
    },
  };
}

export function normalizeHomeState() {
  homeState.version = HOME_STATE_VERSION;

  homeState.hydrated = Boolean(homeState.hydrated);
  homeState.loaded = Boolean(homeState.loaded);
  homeState.loading = Boolean(homeState.loading);
  homeState.refreshing = Boolean(homeState.refreshing);
  homeState.creating = Boolean(homeState.creating);

  homeState.openingTicketId = safeText(homeState.openingTicketId, "");
  homeState.selectedTicketId = safeText(homeState.selectedTicketId, "");
  homeState.navigatingAction = safeText(homeState.navigatingAction, "");

  homeState.error = safeText(homeState.error, "");
  homeState.lastError = homeState.lastError ? normalizeError(homeState.lastError) : null;

  homeState.page = Math.max(1, safeNumber(homeState.page, DEFAULT_PAGE));
  homeState.pageSize = Math.max(1, safeNumber(homeState.pageSize, DEFAULT_PAGE_SIZE));

  homeState.dashboard = safeObject(homeState.dashboard);
  homeState.summary = safeObject(homeState.summary);

  homeState.widgets = safeArray(homeState.widgets);

  homeState.tickets = safeArray(homeState.tickets);
  homeState.invoices = safeArray(homeState.invoices);
  homeState.users = safeArray(homeState.users);
  homeState.clients = safeArray(homeState.clients);
  homeState.activity = safeArray(homeState.activity);

  homeState.ticketsRemoteCount = Math.max(homeState.tickets.length, safeNumber(homeState.ticketsRemoteCount, 0));
  homeState.invoicesRemoteCount = Math.max(homeState.invoices.length, safeNumber(homeState.invoicesRemoteCount, 0));
  homeState.usersRemoteCount = Math.max(homeState.users.length, safeNumber(homeState.usersRemoteCount, 0));
  homeState.clientsRemoteCount = Math.max(homeState.clients.length, safeNumber(homeState.clientsRemoteCount, 0));
  homeState.activityRemoteCount = Math.max(homeState.activity.length, safeNumber(homeState.activityRemoteCount, 0));

  homeState.remoteCount = Math.max(homeState.ticketsRemoteCount, safeNumber(homeState.remoteCount, 0));
  homeState.totalCount = Math.max(homeState.remoteCount, safeNumber(homeState.totalCount, 0));

  homeState.requestId = safeText(homeState.requestId, "");
  homeState.lastSyncAt = safeText(first(homeState.lastSyncAt, homeState.lastUpdatedAt, ""), "");
  homeState.lastUpdatedAt = safeText(first(homeState.lastUpdatedAt, homeState.lastSyncAt, ""), "");

  homeState.health = homeState.health === null ? null : safeObject(homeState.health, homeState.health);

  homeState.meta = safeObject(homeState.meta);
  homeState.partial = Boolean(homeState.partial);
  homeState.errors = safeArray(homeState.errors);

  syncAliases();

  return homeState;
}

/* =========================================================
   PATCH
========================================================= */

function shouldKeepExisting(key = "", value, replace = false) {
  if (replace) return false;

  if (Array.isArray(value)) {
    return value.length === 0 && safeArray(homeState[key]).length > 0;
  }

  if (isObject(value)) {
    return Object.keys(value).length === 0 && hasKeys(homeState[key]);
  }

  return false;
}

function assign(key = "", value, { replace = false } = {}) {
  if (!key || value === undefined) return false;
  if (shouldKeepExisting(key, value, replace)) return false;

  homeState[key] = value;
  return true;
}

function remoteCountFrom(dashboard = {}, key = "") {
  const data = safeObject(dashboard);
  const summary = safeObject(first(data.summary, data.stats, data.metrics, data.totals, data.counts, {}));
  const meta = safeObject(data.meta);

  const maps = {
    tickets: [
      data.ticketsTotal,
      data.incidenciasTotal,
      data.totalTickets,
      data.totalIncidencias,
      data.ticketsCount,
      data.incidenciasCount,
      summary.totalTickets,
      summary.ticketsTotal,
      summary.incidenciasTotal,
      meta.ticketsCount,
      meta.incidenciasCount,
    ],
    invoices: [
      data.invoicesTotal,
      data.facturasTotal,
      data.totalInvoices,
      data.totalFacturas,
      data.invoicesCount,
      data.facturasCount,
      summary.totalInvoices,
      summary.invoicesTotal,
      summary.facturasTotal,
      meta.invoicesCount,
      meta.facturasCount,
    ],
    users: [
      data.usersTotal,
      data.usuariosTotal,
      data.totalUsers,
      data.totalUsuarios,
      data.usersCount,
      data.usuariosCount,
      summary.usersCount,
      summary.usuariosCount,
      meta.usersCount,
      meta.usuariosCount,
    ],
    clients: [
      data.clientsTotal,
      data.clientesTotal,
      data.customersTotal,
      data.totalClients,
      data.totalClientes,
      data.totalCustomers,
      data.clientsCount,
      data.clientesCount,
      data.customersCount,
      summary.clientsCount,
      summary.clientesCount,
      summary.customersCount,
      meta.clientsCount,
      meta.clientesCount,
    ],
    activity: [
      data.activityCount,
      data.recentCount,
      meta.activityCount,
      meta.recentCount,
    ],
  };

  return numberFrom(...(maps[key] || []));
}

export function patchHomeState(patch = {}, options = {}) {
  const data = safeObject(patch);
  const replace = options.replace === true;

  for (const [key, value] of Object.entries(data)) {
    assign(key, value, { replace });
  }

  normalizeHomeState();

  return getHomeStateSnapshot();
}

export function replaceHomeState(nextState = {}) {
  Object.keys(homeState).forEach((key) => {
    delete homeState[key];
  });

  Object.assign(homeState, createInitialHomeState(), safeObject(nextState));

  normalizeHomeState();

  return getHomeStateSnapshot();
}

export function resetHomeState() {
  return replaceHomeState({});
}

/* =========================================================
   DASHBOARD SYNC
========================================================= */

export function syncHomeStateFromDashboard(dashboard = {}, options = {}) {
  const raw = safeObject(dashboard);
  const replace = options.replace === true;

  if (!hasKeys(raw) && !replace) {
    return getHomeStateSnapshot();
  }

  assign(
    "dashboard",
    replace
      ? raw
      : {
          ...safeObject(homeState.dashboard),
          ...raw,
        },
    { replace }
  );

  const summary = safeObject(first(raw.summary, raw.stats, raw.metrics, raw.totals, raw.counts, {}));

  if (hasKeys(summary) || replace) {
    assign(
      "summary",
      replace
        ? summary
        : {
            ...safeObject(homeState.summary),
            ...summary,
          },
      { replace }
    );
  }

  const widgets = firstArray(raw.widgets, raw.cards, raw.kpis, raw.blocks);
  const tickets = firstArray(raw.tickets, raw.incidencias);
  const invoices = firstArray(raw.invoices, raw.facturas);
  const users = firstArray(raw.users, raw.usuarios);
  const clients = firstArray(raw.clients, raw.clientes, raw.customers);
  const activity = firstArray(raw.activity, raw.activities, raw.recent, raw.recentActivity);

  if (widgets) assign("widgets", widgets, { replace });

  if (tickets) {
    assign("tickets", tickets, { replace });
    homeState.ticketsRemoteCount = Math.max(
      homeState.tickets.length,
      safeNumber(options.remoteCount, 0),
      remoteCountFrom(raw, "tickets"),
      homeState.ticketsRemoteCount
    );
  }

  if (invoices) {
    assign("invoices", invoices, { replace });
    homeState.invoicesRemoteCount = Math.max(
      homeState.invoices.length,
      remoteCountFrom(raw, "invoices"),
      homeState.invoicesRemoteCount
    );
  }

  if (users) {
    assign("users", users, { replace });
    homeState.usersRemoteCount = Math.max(
      homeState.users.length,
      remoteCountFrom(raw, "users"),
      homeState.usersRemoteCount
    );
  }

  if (clients) {
    assign("clients", clients, { replace });
    homeState.clientsRemoteCount = Math.max(
      homeState.clients.length,
      remoteCountFrom(raw, "clients"),
      homeState.clientsRemoteCount
    );
  }

  if (activity) {
    assign("activity", activity, { replace });
    homeState.activityRemoteCount = Math.max(
      homeState.activity.length,
      remoteCountFrom(raw, "activity"),
      homeState.activityRemoteCount
    );
  }

  homeState.meta = replace
    ? safeObject(raw.meta)
    : {
        ...safeObject(homeState.meta),
        ...safeObject(raw.meta),
      };

  homeState.errors = safeArray(raw.errors);
  homeState.partial = Boolean(raw.partial);

  homeState.requestId = safeText(first(options.requestId, raw.requestId, raw.meta?.requestId, homeState.requestId, ""), "");
  homeState.lastSyncAt = safeText(first(options.lastSyncAt, raw.lastSyncAt, raw.updatedAt, raw.generatedAt, raw.meta?.updatedAt, nowIso()), nowIso());
  homeState.lastUpdatedAt = homeState.lastSyncAt;

  homeState.loaded = true;
  homeState.hydrated = true;
  homeState.loading = false;
  homeState.refreshing = false;
  homeState.error = "";
  homeState.lastError = null;

  normalizeHomeState();

  return getHomeStateSnapshot();
}

/* =========================================================
   SETTERS
========================================================= */

export function setLoading(value = false) {
  return patchHomeState({
    loading: safeBoolean(value, false),
    refreshing: safeBoolean(value, false) ? false : homeState.refreshing,
  });
}

export function setRefreshing(value = false) {
  return patchHomeState({
    refreshing: safeBoolean(value, false),
    loading: safeBoolean(value, false) ? false : homeState.loading,
  });
}

export function setLoaded(value = true) {
  const loaded = safeBoolean(value, true);

  return patchHomeState({
    loaded,
    loading: loaded ? false : homeState.loading,
    refreshing: loaded ? false : homeState.refreshing,
  });
}

export function setHydrated(value = true) {
  return patchHomeState({
    hydrated: safeBoolean(value, true),
  });
}

export function setError(error = null) {
  const normalized = normalizeError(error);

  return patchHomeState({
    error: normalized ? normalized.message : "",
    lastError: normalized,
    loading: normalized ? false : homeState.loading,
    refreshing: normalized ? false : homeState.refreshing,
  });
}

export function clearHomeError() {
  return setError(null);
}

export function setDashboard(dashboard = {}, options = {}) {
  return syncHomeStateFromDashboard(dashboard, options);
}

export function setSummary(summary = {}, options = {}) {
  const incoming = safeObject(summary);
  const replace = options.replace === true;

  if (!hasKeys(incoming) && !replace && hasKeys(homeState.summary)) {
    return getHomeStateSnapshot();
  }

  return patchHomeState(
    {
      summary: replace
        ? incoming
        : {
            ...safeObject(homeState.summary),
            ...incoming,
          },
    },
    { replace }
  );
}

export function setWidgets(widgets = [], options = {}) {
  return patchHomeState({ widgets: safeArray(widgets) }, options);
}

export function setTickets(tickets = [], options = {}) {
  const items = safeArray(tickets);
  const remoteCount = Math.max(items.length, safeNumber(options.remoteCount, homeState.ticketsRemoteCount));

  return patchHomeState(
    {
      tickets: items,
      ticketsRemoteCount: remoteCount,
      remoteCount: Math.max(homeState.remoteCount, remoteCount),
      totalCount: Math.max(homeState.totalCount, remoteCount),
    },
    options
  );
}

export function setInvoices(invoices = [], options = {}) {
  const items = safeArray(invoices);

  return patchHomeState(
    {
      invoices: items,
      invoicesRemoteCount: Math.max(items.length, safeNumber(options.remoteCount, homeState.invoicesRemoteCount)),
    },
    options
  );
}

export function setUsers(users = [], options = {}) {
  const items = safeArray(users);

  return patchHomeState(
    {
      users: items,
      usersRemoteCount: Math.max(items.length, safeNumber(options.remoteCount, homeState.usersRemoteCount)),
    },
    options
  );
}

export function setClients(clients = [], options = {}) {
  const items = safeArray(clients);

  return patchHomeState(
    {
      clients: items,
      clientsRemoteCount: Math.max(items.length, safeNumber(options.remoteCount, homeState.clientsRemoteCount)),
    },
    options
  );
}

export function setRecent(recent = [], options = {}) {
  const items = safeArray(recent);

  return patchHomeState(
    {
      activity: items,
      activityRemoteCount: Math.max(items.length, safeNumber(options.remoteCount, homeState.activityRemoteCount)),
    },
    options
  );
}

export function setLastSyncAt(value = null) {
  const finalValue = value instanceof Date
    ? value.toISOString()
    : safeText(value, nowIso());

  return patchHomeState({
    lastSyncAt: finalValue,
    lastUpdatedAt: finalValue,
  });
}

export function setRequestId(value = "") {
  return patchHomeState({
    requestId: safeText(value, ""),
  });
}

export function setHealth(value = null) {
  return patchHomeState({
    health: value === null ? null : safeObject(value, value),
  });
}

export function setPage(page = DEFAULT_PAGE) {
  return patchHomeState({
    page: Math.max(1, safeNumber(page, DEFAULT_PAGE)),
  });
}

export function setPageSize(pageSize = DEFAULT_PAGE_SIZE) {
  return patchHomeState({
    page: DEFAULT_PAGE,
    pageSize: Math.max(1, safeNumber(pageSize, DEFAULT_PAGE_SIZE)),
  });
}

export function setOpeningTicketId(ticketId = "") {
  const next = safeText(ticketId, "");

  return patchHomeState({
    openingTicketId: next,
    selectedTicketId: next || homeState.selectedTicketId,
  });
}

export function setSelectedTicketId(ticketId = "") {
  return patchHomeState({
    selectedTicketId: safeText(ticketId, ""),
  });
}

export function setCreating(value = false) {
  return patchHomeState({
    creating: safeBoolean(value, false),
  });
}

export function setNavigatingAction(value = "") {
  return patchHomeState({
    navigatingAction: safeText(value, ""),
  });
}

/* =========================================================
   GETTERS
========================================================= */

export function getHomeState() {
  normalizeHomeState();
  return homeState;
}

export function getHomeStateSnapshot() {
  normalizeHomeState();

  return clone(
    {
      version: homeState.version,

      hydrated: homeState.hydrated,
      loaded: homeState.loaded,
      loading: homeState.loading,
      refreshing: homeState.refreshing,
      creating: homeState.creating,

      openingTicketId: homeState.openingTicketId,
      selectedTicketId: homeState.selectedTicketId,
      navigatingAction: homeState.navigatingAction,

      error: homeState.error,
      lastError: homeState.lastError,

      page: homeState.page,
      pageSize: homeState.pageSize,

      remoteCount: homeState.remoteCount,
      totalCount: homeState.totalCount,

      ticketsRemoteCount: homeState.ticketsRemoteCount,
      invoicesRemoteCount: homeState.invoicesRemoteCount,
      usersRemoteCount: homeState.usersRemoteCount,
      clientsRemoteCount: homeState.clientsRemoteCount,
      activityRemoteCount: homeState.activityRemoteCount,

      requestId: homeState.requestId,
      lastSyncAt: homeState.lastSyncAt,
      lastUpdatedAt: homeState.lastUpdatedAt,

      dashboard: homeState.dashboard,

      summary: homeState.summary,
      stats: homeState.stats,
      metrics: homeState.metrics,
      totals: homeState.totals,
      counts: homeState.counts,

      widgets: homeState.widgets,
      cards: homeState.cards,
      kpis: homeState.kpis,
      blocks: homeState.blocks,

      tickets: homeState.tickets,
      incidencias: homeState.incidencias,

      invoices: homeState.invoices,
      facturas: homeState.facturas,

      users: homeState.users,
      usuarios: homeState.usuarios,

      clients: homeState.clients,
      clientes: homeState.clientes,
      customers: homeState.customers,

      activity: homeState.activity,
      activities: homeState.activities,
      recent: homeState.recent,
      recentActivity: homeState.recentActivity,

      health: homeState.health,
      meta: homeState.meta,

      partial: homeState.partial,
      errors: homeState.errors,

      countsInfo: {
        widgets: homeState.widgets.length,
        tickets: homeState.tickets.length,
        invoices: homeState.invoices.length,
        users: homeState.users.length,
        clients: homeState.clients.length,
        activity: homeState.activity.length,
      },
    },
    {}
  );
}

export function isHomeLoading() {
  return Boolean(homeState.loading);
}

export function isHomeRefreshing() {
  return Boolean(homeState.refreshing);
}

export function isHomeLoaded() {
  return Boolean(homeState.loaded);
}

export function isHomeHydrated() {
  return Boolean(homeState.hydrated);
}

export function hasHomeError() {
  return Boolean(homeState.error);
}

export function getHomeDashboard() {
  normalizeHomeState();
  return homeState.dashboard;
}

export function getHomeSummary() {
  normalizeHomeState();
  return homeState.summary;
}

export function getHomeWidgets() {
  normalizeHomeState();
  return homeState.widgets;
}

export function getHomeTickets() {
  normalizeHomeState();
  return homeState.tickets;
}

export function getHomeInvoices() {
  normalizeHomeState();
  return homeState.invoices;
}

export function getHomeUsers() {
  normalizeHomeState();
  return homeState.users;
}

export function getHomeClients() {
  normalizeHomeState();
  return homeState.clients;
}

export function getHomeActivity() {
  normalizeHomeState();
  return homeState.activity;
}

export function getHomeStateDebugSnapshot() {
  return {
    version: HOME_STATE_VERSION,
    state: getHomeStateSnapshot(),
  };
}

/* =========================================================
   PUBLIC API
========================================================= */

normalizeHomeState();

export const HomeState = Object.freeze({
  version: HOME_STATE_VERSION,

  state: homeState,

  createInitialState: createInitialHomeState,

  normalize: normalizeHomeState,

  patch: patchHomeState,
  replace: replaceHomeState,
  reset: resetHomeState,

  syncFromDashboard: syncHomeStateFromDashboard,

  setLoading,
  setRefreshing,
  setLoaded,
  setHydrated,

  setError,
  clearError: clearHomeError,

  setDashboard,
  setSummary,
  setWidgets,
  setTickets,
  setInvoices,
  setUsers,
  setClients,
  setRecent,

  setLastSyncAt,
  setRequestId,
  setHealth,

  setPage,
  setPageSize,

  setOpeningTicketId,
  setSelectedTicketId,
  setCreating,
  setNavigatingAction,

  getState: getHomeState,
  getSnapshot: getHomeStateSnapshot,
  getDebugSnapshot: getHomeStateDebugSnapshot,

  getDashboard: getHomeDashboard,
  getSummary: getHomeSummary,
  getWidgets: getHomeWidgets,
  getTickets: getHomeTickets,
  getInvoices: getHomeInvoices,
  getUsers: getHomeUsers,
  getClients: getHomeClients,
  getActivity: getHomeActivity,

  isLoading: isHomeLoading,
  isRefreshing: isHomeRefreshing,
  isLoaded: isHomeLoaded,
  isHydrated: isHomeHydrated,
  hasError: hasHomeError,
});

export default HomeState;
