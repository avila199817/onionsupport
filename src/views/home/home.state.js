/* =========================================================
   Onion SPA - Home State
   Archivo: src/views/home/home.state.js

   HOME STATE · SINGLE SOURCE · MODULAR BACKEND READY · FINAL 11/10

   Responsabilidades:
   - Mantener estado runtime del Home.
   - Exponer setters seguros consumidos por home.api.js y HomeView.js.
   - Preservar dashboard/summary/widgets/collections sin empobrecer datos.
   - Diferenciar loading / refreshing / hydrated / loaded.
   - Sincronizar eventos de cambio con AppCore.events o window fallback.
   - Evitar tormentas de eventos mediante firma comparable.
   - Mantener shape estable para home.store.js, home.api.js y home.template.js.
   - Alinear Home con backend modular sin /api/dashboard/*.
   - Cero CSS.
   - Cero DOM obligatorio.
   - Cero dependencia con HomeApi/HomeView/HomeTemplate.

   Regla crítica:
   - No pisar arrays existentes con arrays vacíos salvo replace explícito.
   - No pisar summary/dashboard real con objeto vacío salvo replace explícito.
   - Setters individuales son tolerantes a payload parcial.
   - syncHomeStateFromDashboard aplica batch único, no cascada de setters.
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const HOME_STATE_VERSION = "11.0.0";

export const HOME_STATE_SCOPE = "view:home:state";

export const HOME_STATE_EVENTS = Object.freeze({
  change: "home:state:change",
  patch: "home:state:patch",
  reset: "home:state:reset",

  loading: "home:state:loading",
  refreshing: "home:state:refreshing",
  loaded: "home:state:loaded",
  hydrated: "home:state:hydrated",

  error: "home:state:error",

  dashboard: "home:state:dashboard",
  summary: "home:state:summary",
  widgets: "home:state:widgets",
  tickets: "home:state:tickets",
  invoices: "home:state:invoices",
  users: "home:state:users",
  clients: "home:state:clients",
  recent: "home:state:recent",
  health: "home:state:health",
});

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 5;
const MAX_RECENT_MUTATIONS = 60;

let lastStateSignature = "";
let lastEmitAt = 0;

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

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

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "string") {
    let normalized = value
      .trim()
      .replace(/[€$£¥%]/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s/g, "");

    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
      const lastComma = normalized.lastIndexOf(",");
      const lastDot = normalized.lastIndexOf(".");

      normalized =
        lastComma > lastDot
          ? normalized.replace(/\./g, "").replace(/,/g, ".")
          : normalized.replace(/,/g, "");
    } else if (hasComma) {
      normalized = normalized.replace(/,/g, ".");
    }

    const parsed = Number(normalized);

    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí", "on", "ok"].includes(key)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(key)) {
      return false;
    }
  }

  return Boolean(fallback);
}

function hasOwnKeys(value = {}) {
  return Boolean(isObject(value) && Object.keys(value).length > 0);
}

function isMeaningfulValue(value) {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === "string" && value.trim() === "") {
    return false;
  }

  if (Array.isArray(value) && value.length === 0) {
    return false;
  }

  if (isObject(value) && Object.keys(value).length === 0) {
    return false;
  }

  return true;
}

function first(...values) {
  for (const value of values) {
    if (isMeaningfulValue(value)) {
      return value;
    }
  }

  return null;
}

function firstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return null;
}

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function safeClone(value, fallback = null) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {}

  return fallback;
}

function normalizeError(error = null) {
  if (!error) {
    return null;
  }

  if (typeof error === "string") {
    return {
      name: "HomeStateError",
      message: safeText(error, "Error Home."),
      code: "HOME_STATE_ERROR",
    };
  }

  const object = safeObject(error);

  return {
    name: safeText(object.name, "HomeStateError"),

    message: safeText(
      first(
        object.message,
        object.detail,
        object.error,
        object.statusText,
        "Error Home."
      ),
      "Error Home."
    ),

    code: safeText(
      first(
        object.code,
        object.status,
        object.statusCode,
        object.errorCode,
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

    modules: {},

    partial: false,
    errors: [],

    recentMutations: [],
  };
}

export const homeState = createInitialHomeState();

/* =========================================================
   EVENTS
========================================================= */

function safeWindowDispatch(eventName = "", payload = {}) {
  if (!isBrowser() || !eventName) {
    return false;
  }

  try {
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: payload,
      })
    );

    return true;
  } catch {}

  return false;
}

function emitHomeStateEvent(eventName = "", payload = {}, options = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  const opts = safeObject(options);

  const detail = {
    source: HOME_STATE_SCOPE,
    version: HOME_STATE_VERSION,
    at: nowIso(),
    ...safeObject(payload),
  };

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable = true;
      AppCore.events.emit(name, detail);
      busEmitted = true;
    }
  } catch {}

  if (opts.window === true || (!busAvailable && isBrowser())) {
    return safeWindowDispatch(name, detail) || busEmitted;
  }

  return busEmitted;
}

/* =========================================================
   SUMMARY / ALIASES
========================================================= */

function normalizeSummaryAliases(summary = {}) {
  const raw = safeObject(summary);

  const ticketsCount = Math.max(
    0,
    safeNumber(
      first(
        raw.totalTickets,
        raw.ticketsTotal,
        raw.incidenciasTotal,
        raw.totalIncidencias,
        raw.ticketsCount,
        raw.incidenciasCount,
        homeState.ticketsRemoteCount,
        safeArray(homeState.tickets).length
      ),
      0
    )
  );

  const openTickets = Math.max(
    0,
    safeNumber(
      first(
        raw.openTickets,
        raw.pendingTickets,
        raw.openIncidencias,
        raw.pendingIncidencias,
        raw.incidenciasAbiertas,
        0
      ),
      0
    )
  );

  const closedTickets = Math.max(
    0,
    safeNumber(
      first(
        raw.closedTickets,
        raw.resolvedTickets,
        raw.closedIncidencias,
        raw.resolvedIncidencias,
        raw.incidenciasCerradas,
        0
      ),
      0
    )
  );

  const urgentTickets = Math.max(
    0,
    safeNumber(
      first(
        raw.urgentTickets,
        raw.urgentIncidencias,
        raw.highPriorityTickets,
        raw.incidenciasUrgentes,
        0
      ),
      0
    )
  );

  const invoicesCount = Math.max(
    0,
    safeNumber(
      first(
        raw.totalInvoices,
        raw.invoicesTotal,
        raw.facturasTotal,
        raw.totalFacturas,
        raw.invoicesCount,
        raw.facturasCount,
        homeState.invoicesRemoteCount,
        safeArray(homeState.invoices).length
      ),
      0
    )
  );

  const pendingInvoices = Math.max(
    0,
    safeNumber(
      first(
        raw.pendingInvoices,
        raw.pendingFacturas,
        raw.facturasPendientes,
        raw.invoicesPending,
        raw.facturasVencidas,
        raw.overdueInvoices,
        0
      ),
      0
    )
  );

  const invoiceAmount = Math.max(
    0,
    safeNumber(
      first(
        raw.invoiceAmount,
        raw.billingTotal,
        raw.totalBilling,
        raw.totalFacturado,
        raw.importeFacturas,
        raw.facturacionVisible,
        raw.facturacionTotal,
        0
      ),
      0
    )
  );

  const usersCount = Math.max(
    0,
    safeNumber(
      first(
        raw.usersCount,
        raw.usuariosCount,
        raw.totalUsers,
        raw.totalUsuarios,
        raw.activeUsers,
        raw.usuariosActivos,
        homeState.usersRemoteCount,
        safeArray(homeState.users).length
      ),
      0
    )
  );

  const clientsCount = Math.max(
    0,
    safeNumber(
      first(
        raw.clientsCount,
        raw.clientesCount,
        raw.customersCount,
        raw.totalClients,
        raw.totalClientes,
        raw.totalCustomers,
        raw.activeClients,
        raw.clientesActivos,
        homeState.clientsRemoteCount,
        safeArray(homeState.clients).length
      ),
      0
    )
  );

  const attachmentsCount = Math.max(
    0,
    safeNumber(
      first(
        raw.attachmentsCount,
        raw.filesCount,
        raw.adjuntosCount,
        0
      ),
      0
    )
  );

  const visibleTicketsCount = Math.max(
    0,
    safeNumber(
      first(
        raw.visibleTickets,
        raw.visibleTicketsCount,
        raw.visibleIncidenciasCount,
        safeArray(homeState.tickets).length
      ),
      0
    )
  );

  const visibleInvoicesCount = Math.max(
    0,
    safeNumber(
      first(
        raw.visibleInvoices,
        raw.visibleInvoicesCount,
        raw.visibleFacturasCount,
        safeArray(homeState.invoices).length
      ),
      0
    )
  );

  const visibleUsersCount = Math.max(
    0,
    safeNumber(
      first(
        raw.visibleUsers,
        raw.visibleUsersCount,
        raw.visibleUsuariosCount,
        safeArray(homeState.users).length
      ),
      0
    )
  );

  const visibleClientsCount = Math.max(
    0,
    safeNumber(
      first(
        raw.visibleClients,
        raw.visibleClientsCount,
        raw.visibleClientesCount,
        raw.visibleCustomersCount,
        safeArray(homeState.clients).length
      ),
      0
    )
  );

  const activeUsersRaw = Math.max(
    0,
    safeNumber(first(raw.activeUsers, raw.usuariosActivos, 0), 0)
  );

  const activeClientsRaw = Math.max(
    0,
    safeNumber(first(raw.activeClients, raw.clientesActivos, 0), 0)
  );

  return {
    ...raw,

    totalTickets: ticketsCount,
    ticketsTotal: ticketsCount,
    incidenciasTotal: ticketsCount,
    totalIncidencias: ticketsCount,
    ticketsCount,
    incidenciasCount: ticketsCount,

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

    totalInvoices: invoicesCount,
    invoicesTotal: invoicesCount,
    facturasTotal: invoicesCount,
    totalFacturas: invoicesCount,
    invoicesCount,
    facturasCount: invoicesCount,

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

    activeUsers: activeUsersRaw || usersCount,
    usuariosActivos: activeUsersRaw || usersCount,

    clientsCount,
    clientesCount: clientsCount,
    customersCount: clientsCount,
    totalClients: clientsCount,
    totalClientes: clientsCount,
    totalCustomers: clientsCount,

    activeClients: activeClientsRaw || clientsCount,
    clientesActivos: activeClientsRaw || clientsCount,

    visibleTickets: visibleTicketsCount,
    visibleTicketsCount,
    visibleIncidenciasCount: visibleTicketsCount,

    visibleInvoices: visibleInvoicesCount,
    visibleInvoicesCount,
    visibleFacturasCount: visibleInvoicesCount,

    visibleUsers: visibleUsersCount,
    visibleUsersCount,
    visibleUsuariosCount: visibleUsersCount,

    visibleClients: visibleClientsCount,
    visibleClientsCount,
    visibleClientesCount: visibleClientsCount,
    visibleCustomersCount: visibleClientsCount,

    attachmentsCount,
    filesCount: attachmentsCount,
    adjuntosCount: attachmentsCount,
  };
}

function syncAliasesFromCollections() {
  homeState.incidencias = safeArray(homeState.tickets);

  homeState.facturas = safeArray(homeState.invoices);

  homeState.usuarios = safeArray(homeState.users);

  homeState.clientes = safeArray(homeState.clients);
  homeState.customers = safeArray(homeState.clients);

  homeState.activities = safeArray(homeState.activity);
  homeState.recent = safeArray(homeState.activity);
  homeState.recentActivity = safeArray(homeState.activity);

  homeState.cards = safeArray(homeState.widgets);
  homeState.kpis = safeArray(homeState.widgets);
  homeState.blocks = safeArray(homeState.widgets);
}

function syncAliasesFromSummary() {
  homeState.summary = normalizeSummaryAliases(homeState.summary);

  homeState.stats = homeState.summary;
  homeState.metrics = homeState.summary;
  homeState.totals = homeState.summary;
  homeState.counts = homeState.summary;
}

function syncDashboardAliases() {
  const dashboard = safeObject(homeState.dashboard);

  homeState.dashboard = {
    ...dashboard,

    ok: dashboard.ok !== false,
    success: dashboard.success !== false,

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

    meta: {
      ...safeObject(dashboard.meta),
      ...safeObject(homeState.meta),

      widgetsCount: homeState.widgets.length,

      ticketsCount: homeState.summary.totalTickets,
      incidenciasCount: homeState.summary.totalTickets,
      visibleTicketsCount: homeState.tickets.length,
      visibleIncidenciasCount: homeState.tickets.length,

      invoicesCount: homeState.summary.totalInvoices,
      facturasCount: homeState.summary.totalInvoices,
      visibleInvoicesCount: homeState.invoices.length,
      visibleFacturasCount: homeState.invoices.length,

      usersCount: homeState.summary.usersCount,
      usuariosCount: homeState.summary.usuariosCount,
      visibleUsersCount: homeState.users.length,
      visibleUsuariosCount: homeState.users.length,

      clientsCount: homeState.summary.clientsCount,
      clientesCount: homeState.summary.clientesCount,
      customersCount: homeState.summary.customersCount,
      visibleClientsCount: homeState.clients.length,
      visibleClientesCount: homeState.clients.length,
      visibleCustomersCount: homeState.clients.length,

      activityCount: homeState.activity.length,
      recentCount: homeState.activity.length,
      visibleActivityCount: homeState.activity.length,
    },
  };
}

export function normalizeHomeState() {
  homeState.version = HOME_STATE_VERSION;

  homeState.page = Math.max(1, safeNumber(homeState.page, DEFAULT_PAGE));
  homeState.pageSize = Math.max(1, safeNumber(homeState.pageSize, DEFAULT_PAGE_SIZE));

  homeState.loading = Boolean(homeState.loading);
  homeState.refreshing = Boolean(homeState.refreshing);
  homeState.hydrated = Boolean(homeState.hydrated);
  homeState.loaded = Boolean(homeState.loaded);
  homeState.creating = Boolean(homeState.creating);

  homeState.openingTicketId = safeText(homeState.openingTicketId, "");
  homeState.selectedTicketId = safeText(homeState.selectedTicketId, "");
  homeState.navigatingAction = safeText(homeState.navigatingAction, "");

  homeState.error = safeText(homeState.error, "");
  homeState.lastError = homeState.lastError ? normalizeError(homeState.lastError) : null;

  homeState.requestId = safeText(homeState.requestId, "");

  homeState.lastSyncAt = safeText(first(homeState.lastSyncAt, homeState.lastUpdatedAt, ""), "");
  homeState.lastUpdatedAt = safeText(first(homeState.lastUpdatedAt, homeState.lastSyncAt, ""), "");

  homeState.dashboard = safeObject(homeState.dashboard);
  homeState.summary = safeObject(homeState.summary);

  homeState.widgets = safeArray(homeState.widgets);

  homeState.tickets = safeArray(homeState.tickets);
  homeState.invoices = safeArray(homeState.invoices);
  homeState.users = safeArray(homeState.users);
  homeState.clients = safeArray(homeState.clients);
  homeState.activity = safeArray(homeState.activity);

  homeState.ticketsRemoteCount = Math.max(
    homeState.tickets.length,
    safeNumber(homeState.ticketsRemoteCount, homeState.tickets.length)
  );

  homeState.invoicesRemoteCount = Math.max(
    homeState.invoices.length,
    safeNumber(homeState.invoicesRemoteCount, homeState.invoices.length)
  );

  homeState.usersRemoteCount = Math.max(
    homeState.users.length,
    safeNumber(homeState.usersRemoteCount, homeState.users.length)
  );

  homeState.clientsRemoteCount = Math.max(
    homeState.clients.length,
    safeNumber(homeState.clientsRemoteCount, homeState.clients.length)
  );

  homeState.activityRemoteCount = Math.max(
    homeState.activity.length,
    safeNumber(homeState.activityRemoteCount, homeState.activity.length)
  );

  homeState.remoteCount = Math.max(
    safeNumber(homeState.remoteCount, 0),
    homeState.ticketsRemoteCount
  );

  homeState.totalCount = Math.max(
    homeState.remoteCount,
    homeState.ticketsRemoteCount,
    safeNumber(homeState.totalCount, 0)
  );

  homeState.health =
    homeState.health === null
      ? null
      : safeObject(homeState.health, homeState.health);

  homeState.meta = safeObject(homeState.meta);
  homeState.modules = safeObject(homeState.modules);

  homeState.partial = Boolean(homeState.partial);
  homeState.errors = safeArray(homeState.errors);

  homeState.recentMutations = safeArray(homeState.recentMutations).slice(
    0,
    MAX_RECENT_MUTATIONS
  );

  syncAliasesFromCollections();
  syncAliasesFromSummary();
  syncDashboardAliases();

  return homeState;
}

/* =========================================================
   SIGNATURE / MUTATIONS
========================================================= */

function getStateSignature() {
  const data = {
    hydrated: Boolean(homeState.hydrated),
    loaded: Boolean(homeState.loaded),
    loading: Boolean(homeState.loading),
    refreshing: Boolean(homeState.refreshing),
    creating: Boolean(homeState.creating),

    openingTicketId: safeText(homeState.openingTicketId, ""),
    selectedTicketId: safeText(homeState.selectedTicketId, ""),
    navigatingAction: safeText(homeState.navigatingAction, ""),

    error: safeText(homeState.error, ""),

    page: safeNumber(homeState.page, DEFAULT_PAGE),
    pageSize: safeNumber(homeState.pageSize, DEFAULT_PAGE_SIZE),

    requestId: safeText(homeState.requestId, ""),
    lastSyncAt: safeText(homeState.lastSyncAt, ""),

    widgets: safeArray(homeState.widgets).length,
    tickets: safeArray(homeState.tickets).length,
    invoices: safeArray(homeState.invoices).length,
    users: safeArray(homeState.users).length,
    clients: safeArray(homeState.clients).length,
    activity: safeArray(homeState.activity).length,

    ticketsRemoteCount: safeNumber(homeState.ticketsRemoteCount, 0),
    invoicesRemoteCount: safeNumber(homeState.invoicesRemoteCount, 0),
    usersRemoteCount: safeNumber(homeState.usersRemoteCount, 0),
    clientsRemoteCount: safeNumber(homeState.clientsRemoteCount, 0),
    activityRemoteCount: safeNumber(homeState.activityRemoteCount, 0),

    summary: {
      totalTickets: safeNumber(homeState.summary?.totalTickets, 0),
      openTickets: safeNumber(homeState.summary?.openTickets, 0),
      urgentTickets: safeNumber(homeState.summary?.urgentTickets, 0),
      totalInvoices: safeNumber(homeState.summary?.totalInvoices, 0),
      pendingInvoices: safeNumber(homeState.summary?.pendingInvoices, 0),
      invoiceAmount: safeNumber(homeState.summary?.invoiceAmount, 0),
      usersCount: safeNumber(homeState.summary?.usersCount, 0),
      clientsCount: safeNumber(homeState.summary?.clientsCount, 0),
    },

    partial: Boolean(homeState.partial),
    errors: safeArray(homeState.errors).length,
  };

  try {
    return JSON.stringify(data);
  } catch {
    return String(nowMs());
  }
}

function recordMutation(type = "patch", patch = {}) {
  const item = {
    type: safeText(type, "patch"),
    keys: Object.keys(safeObject(patch)),
    at: nowIso(),
  };

  homeState.recentMutations.unshift(item);

  if (homeState.recentMutations.length > MAX_RECENT_MUTATIONS) {
    homeState.recentMutations = homeState.recentMutations.slice(0, MAX_RECENT_MUTATIONS);
  }

  return item;
}

function emitStateChanged(type = "patch", patch = {}, options = {}) {
  normalizeHomeState();

  const signature = getStateSignature();
  const changed = signature !== lastStateSignature;

  const force =
    safeBoolean(options?.forceEmit, false) ||
    safeBoolean(options?.emitUnchanged, false);

  lastStateSignature = signature;
  lastEmitAt = nowMs();

  const payload = {
    type: safeText(type, "patch"),
    changed,
    patch: safeClone(patch, {}),
    state: getHomeStateSnapshot(),
    at: nowIso(),
  };

  if (changed || force) {
    emitHomeStateEvent(HOME_STATE_EVENTS.change, payload);

    if (HOME_STATE_EVENTS[type]) {
      emitHomeStateEvent(HOME_STATE_EVENTS[type], payload);
    } else if (type !== "change") {
      emitHomeStateEvent(HOME_STATE_EVENTS.patch, payload);
    }
  }

  return payload;
}

/* =========================================================
   INTERNAL APPLY HELPERS
========================================================= */

function shouldPreserveExistingArray(key = "", value = [], options = {}) {
  if (options?.replace === true) {
    return false;
  }

  return Array.isArray(value) &&
    value.length === 0 &&
    Array.isArray(homeState[key]) &&
    homeState[key].length > 0;
}

function shouldPreserveExistingObject(key = "", value = {}, options = {}) {
  if (options?.replace === true) {
    return false;
  }

  return isObject(value) &&
    !hasOwnKeys(value) &&
    isObject(homeState[key]) &&
    hasOwnKeys(homeState[key]);
}

function assignIfUseful(key = "", value, options = {}) {
  if (!key) {
    return false;
  }

  if (Array.isArray(value) && shouldPreserveExistingArray(key, value, options)) {
    return false;
  }

  if (isObject(value) && shouldPreserveExistingObject(key, value, options)) {
    return false;
  }

  if (value === undefined) {
    return false;
  }

  homeState[key] = value;
  return true;
}

function getRemoteCountFromDashboard(raw = {}, kind = "") {
  const object = safeObject(raw);
  const summary = safeObject(first(object.summary, object.stats, object.metrics, object.totals, object.counts, {}));

  if (kind === "tickets") {
    return first(
      object.ticketsTotal,
      object.incidenciasTotal,
      object.totalTickets,
      object.totalIncidencias,
      object.ticketsCount,
      object.incidenciasCount,
      summary.totalTickets,
      summary.ticketsTotal,
      summary.incidenciasTotal,
      summary.totalIncidencias,
      summary.ticketsCount,
      summary.incidenciasCount,
      object.meta?.ticketsCount,
      object.meta?.incidenciasCount,
      object.meta?.totalTickets,
      object.meta?.totalIncidencias,
      0
    );
  }

  if (kind === "invoices") {
    return first(
      object.invoicesTotal,
      object.facturasTotal,
      object.totalInvoices,
      object.totalFacturas,
      object.invoicesCount,
      object.facturasCount,
      summary.totalInvoices,
      summary.invoicesTotal,
      summary.facturasTotal,
      summary.totalFacturas,
      summary.invoicesCount,
      summary.facturasCount,
      object.meta?.invoicesCount,
      object.meta?.facturasCount,
      object.meta?.totalInvoices,
      object.meta?.totalFacturas,
      0
    );
  }

  if (kind === "users") {
    return first(
      object.usersTotal,
      object.usuariosTotal,
      object.totalUsers,
      object.totalUsuarios,
      object.usersCount,
      object.usuariosCount,
      summary.usersCount,
      summary.usuariosCount,
      summary.totalUsers,
      summary.totalUsuarios,
      object.meta?.usersCount,
      object.meta?.usuariosCount,
      object.meta?.totalUsers,
      object.meta?.totalUsuarios,
      0
    );
  }

  if (kind === "clients") {
    return first(
      object.clientsTotal,
      object.clientesTotal,
      object.customersTotal,
      object.totalClients,
      object.totalClientes,
      object.totalCustomers,
      object.clientsCount,
      object.clientesCount,
      object.customersCount,
      summary.clientsCount,
      summary.clientesCount,
      summary.customersCount,
      summary.totalClients,
      summary.totalClientes,
      summary.totalCustomers,
      object.meta?.clientsCount,
      object.meta?.clientesCount,
      object.meta?.customersCount,
      0
    );
  }

  if (kind === "activity") {
    return first(
      object.activityCount,
      object.recentCount,
      object.visibleActivityCount,
      object.meta?.activityCount,
      object.meta?.recentCount,
      0
    );
  }

  return 0;
}

function applyDashboardToState(dashboard = {}, options = {}) {
  const raw = safeObject(dashboard);
  const replace = options?.replace === true;

  if (!hasOwnKeys(raw) && !replace) {
    return {};
  }

  const patch = {};

  const nextDashboard = replace
    ? raw
    : {
        ...safeObject(homeState.dashboard),
        ...raw,
      };

  assignIfUseful("dashboard", nextDashboard, { replace });
  patch.dashboard = homeState.dashboard;

  const summary = safeObject(
    first(
      raw.summary,
      raw.stats,
      raw.metrics,
      raw.totals,
      raw.counts,
      {}
    )
  );

  if (hasOwnKeys(summary) || replace) {
    const nextSummary = normalizeSummaryAliases(
      replace
        ? summary
        : {
            ...safeObject(homeState.summary),
            ...summary,
          }
    );

    assignIfUseful("summary", nextSummary, { replace });
    patch.summary = homeState.summary;
  }

  const widgets = firstArray(raw.widgets, raw.cards, raw.kpis, raw.blocks);

  if (widgets) {
    assignIfUseful("widgets", widgets, { replace });
    patch.widgets = homeState.widgets;
  }

  const tickets = firstArray(raw.tickets, raw.incidencias);

  if (tickets) {
    assignIfUseful("tickets", tickets, { replace });
    homeState.ticketsRemoteCount = Math.max(
      safeArray(homeState.tickets).length,
      safeNumber(getRemoteCountFromDashboard(raw, "tickets"), homeState.ticketsRemoteCount)
    );
    homeState.remoteCount = Math.max(homeState.remoteCount, homeState.ticketsRemoteCount);
    patch.tickets = homeState.tickets;
    patch.ticketsRemoteCount = homeState.ticketsRemoteCount;
  }

  const invoices = firstArray(raw.invoices, raw.facturas);

  if (invoices) {
    assignIfUseful("invoices", invoices, { replace });
    homeState.invoicesRemoteCount = Math.max(
      safeArray(homeState.invoices).length,
      safeNumber(getRemoteCountFromDashboard(raw, "invoices"), homeState.invoicesRemoteCount)
    );
    patch.invoices = homeState.invoices;
    patch.invoicesRemoteCount = homeState.invoicesRemoteCount;
  }

  const users = firstArray(raw.users, raw.usuarios);

  if (users) {
    assignIfUseful("users", users, { replace });
    homeState.usersRemoteCount = Math.max(
      safeArray(homeState.users).length,
      safeNumber(getRemoteCountFromDashboard(raw, "users"), homeState.usersRemoteCount)
    );
    patch.users = homeState.users;
    patch.usersRemoteCount = homeState.usersRemoteCount;
  }

  const clients = firstArray(raw.clients, raw.clientes, raw.customers);

  if (clients) {
    assignIfUseful("clients", clients, { replace });
    homeState.clientsRemoteCount = Math.max(
      safeArray(homeState.clients).length,
      safeNumber(getRemoteCountFromDashboard(raw, "clients"), homeState.clientsRemoteCount)
    );
    patch.clients = homeState.clients;
    patch.clientsRemoteCount = homeState.clientsRemoteCount;
  }

  const activity = firstArray(raw.activity, raw.activities, raw.recent, raw.recentActivity);

  if (activity) {
    assignIfUseful("activity", activity, { replace });
    homeState.activityRemoteCount = Math.max(
      safeArray(homeState.activity).length,
      safeNumber(getRemoteCountFromDashboard(raw, "activity"), homeState.activityRemoteCount)
    );
    patch.activity = homeState.activity;
    patch.activityRemoteCount = homeState.activityRemoteCount;
  }

  const meta = safeObject(first(raw.meta, {}));

  if (hasOwnKeys(meta) || replace) {
    homeState.meta = replace
      ? meta
      : {
          ...safeObject(homeState.meta),
          ...meta,
        };

    patch.meta = homeState.meta;
  }

  if (hasOwnKeys(raw.modules) || replace) {
    homeState.modules = replace
      ? safeObject(raw.modules)
      : {
          ...safeObject(homeState.modules),
          ...safeObject(raw.modules),
        };

    patch.modules = homeState.modules;
  }

  if (Array.isArray(raw.errors) || replace) {
    homeState.errors = safeArray(raw.errors);
    patch.errors = homeState.errors;
  }

  if ("partial" in raw || replace) {
    homeState.partial = Boolean(raw.partial);
    patch.partial = homeState.partial;
  }

  homeState.requestId = safeText(
    first(
      options?.requestId,
      raw.requestId,
      raw.meta?.requestId,
      homeState.requestId,
      ""
    ),
    ""
  );

  patch.requestId = homeState.requestId;

  homeState.lastSyncAt = safeText(
    first(
      options?.lastSyncAt,
      raw.lastSyncAt,
      raw.updatedAt,
      raw.generatedAt,
      raw.meta?.updatedAt,
      nowIso()
    ),
    nowIso()
  );

  homeState.lastUpdatedAt = homeState.lastSyncAt;

  patch.lastSyncAt = homeState.lastSyncAt;
  patch.lastUpdatedAt = homeState.lastUpdatedAt;

  homeState.loaded = true;
  homeState.hydrated = true;
  homeState.loading = false;
  homeState.refreshing = false;
  homeState.error = "";
  homeState.lastError = null;

  patch.loaded = true;
  patch.hydrated = true;
  patch.loading = false;
  patch.refreshing = false;
  patch.error = "";
  patch.lastError = null;

  return patch;
}

/* =========================================================
   PATCH / REPLACE / RESET
========================================================= */

export function patchHomeState(patch = {}, options = {}) {
  const data = safeObject(patch);
  const opts = safeObject(options);
  const replace = opts.replace === true;

  for (const [key, value] of Object.entries(data)) {
    assignIfUseful(key, value, { replace });
  }

  recordMutation(safeText(opts.type, "patch"), data);

  return emitStateChanged(
    safeText(opts.type, "patch"),
    data,
    opts
  );
}

export function replaceHomeState(nextState = {}, options = {}) {
  const initial = createInitialHomeState();

  Object.keys(homeState).forEach((key) => {
    delete homeState[key];
  });

  Object.assign(homeState, initial, safeObject(nextState));

  recordMutation("replace", nextState);

  return emitStateChanged("patch", nextState, {
    ...safeObject(options),
    replace: true,
    forceEmit: options?.forceEmit !== false,
  });
}

export function resetHomeState(options = {}) {
  Object.keys(homeState).forEach((key) => {
    delete homeState[key];
  });

  Object.assign(homeState, createInitialHomeState());

  lastStateSignature = "";

  recordMutation("reset", {});

  emitHomeStateEvent(
    HOME_STATE_EVENTS.reset,
    {
      state: getHomeStateSnapshot(),
    },
    {
      window: false,
    }
  );

  return emitStateChanged("reset", {}, {
    ...safeObject(options),
    forceEmit: true,
  });
}

/* =========================================================
   SETTERS
========================================================= */

export function setLoading(value = false) {
  const loading = safeBoolean(value, false);

  return patchHomeState(
    {
      loading,
      refreshing: loading ? false : homeState.refreshing,
    },
    {
      type: "loading",
      emitUnchanged: true,
    }
  );
}

export function setRefreshing(value = false) {
  const refreshing = safeBoolean(value, false);

  return patchHomeState(
    {
      refreshing,
      loading: refreshing ? false : homeState.loading,
    },
    {
      type: "refreshing",
      emitUnchanged: true,
    }
  );
}

export function setLoaded(value = true) {
  const loaded = safeBoolean(value, true);

  return patchHomeState(
    {
      loaded,
      loading: loaded ? false : homeState.loading,
      refreshing: loaded ? false : homeState.refreshing,
    },
    {
      type: "loaded",
      emitUnchanged: true,
    }
  );
}

export function setHydrated(value = true) {
  return patchHomeState(
    {
      hydrated: safeBoolean(value, true),
    },
    {
      type: "hydrated",
      emitUnchanged: true,
    }
  );
}

export function setError(error = null) {
  const normalized = normalizeError(error);

  return patchHomeState(
    {
      error: normalized ? normalized.message : "",
      lastError: normalized,
      loading: normalized ? false : homeState.loading,
      refreshing: normalized ? false : homeState.refreshing,
    },
    {
      type: "error",
      emitUnchanged: true,
    }
  );
}

export function clearHomeError() {
  return setError(null);
}

export function setDashboard(dashboard = {}, options = {}) {
  const patch = applyDashboardToState(dashboard, options);

  if (!hasOwnKeys(patch)) {
    return emitStateChanged("dashboard", {}, {
      emitUnchanged: true,
    });
  }

  recordMutation("dashboard", patch);

  return emitStateChanged("dashboard", patch, {
    replace: options?.replace === true,
    emitUnchanged: true,
  });
}

export function setSummary(summary = {}, options = {}) {
  const incoming = safeObject(summary);

  if (!hasOwnKeys(incoming) && options?.replace !== true && hasOwnKeys(homeState.summary)) {
    return emitStateChanged("summary", {}, {
      emitUnchanged: true,
      forceEmit: false,
    });
  }

  const nextSummary = normalizeSummaryAliases(
    options?.replace === true
      ? incoming
      : {
          ...safeObject(homeState.summary),
          ...incoming,
        }
  );

  return patchHomeState(
    {
      summary: nextSummary,
    },
    {
      type: "summary",
      replace: options?.replace === true,
      emitUnchanged: true,
    }
  );
}

export function setWidgets(widgets = [], options = {}) {
  const items = safeArray(widgets);

  if (!items.length && options?.replace !== true && homeState.widgets.length) {
    return emitStateChanged("widgets", {}, {
      emitUnchanged: true,
      forceEmit: false,
    });
  }

  return patchHomeState(
    {
      widgets: items,
    },
    {
      type: "widgets",
      replace: options?.replace === true,
      emitUnchanged: true,
    }
  );
}

export function setTickets(tickets = [], options = {}) {
  const items = safeArray(tickets);

  if (!items.length && options?.replace !== true && homeState.tickets.length) {
    return emitStateChanged("tickets", {}, {
      emitUnchanged: true,
      forceEmit: false,
    });
  }

  const remoteCount = Math.max(
    items.length,
    safeNumber(options?.remoteCount, homeState.ticketsRemoteCount)
  );

  return patchHomeState(
    {
      tickets: items,
      ticketsRemoteCount: remoteCount,
      remoteCount: Math.max(homeState.remoteCount, remoteCount),
    },
    {
      type: "tickets",
      replace: options?.replace === true,
      emitUnchanged: true,
    }
  );
}

export function setInvoices(invoices = [], options = {}) {
  const items = safeArray(invoices);

  if (!items.length && options?.replace !== true && homeState.invoices.length) {
    return emitStateChanged("invoices", {}, {
      emitUnchanged: true,
      forceEmit: false,
    });
  }

  const remoteCount = Math.max(
    items.length,
    safeNumber(options?.remoteCount, homeState.invoicesRemoteCount)
  );

  return patchHomeState(
    {
      invoices: items,
      invoicesRemoteCount: remoteCount,
    },
    {
      type: "invoices",
      replace: options?.replace === true,
      emitUnchanged: true,
    }
  );
}

export function setUsers(users = [], options = {}) {
  const items = safeArray(users);

  if (!items.length && options?.replace !== true && homeState.users.length) {
    return emitStateChanged("users", {}, {
      emitUnchanged: true,
      forceEmit: false,
    });
  }

  const remoteCount = Math.max(
    items.length,
    safeNumber(options?.remoteCount, homeState.usersRemoteCount)
  );

  return patchHomeState(
    {
      users: items,
      usersRemoteCount: remoteCount,
    },
    {
      type: "users",
      replace: options?.replace === true,
      emitUnchanged: true,
    }
  );
}

export function setClients(clients = [], options = {}) {
  const items = safeArray(clients);

  if (!items.length && options?.replace !== true && homeState.clients.length) {
    return emitStateChanged("clients", {}, {
      emitUnchanged: true,
      forceEmit: false,
    });
  }

  const remoteCount = Math.max(
    items.length,
    safeNumber(options?.remoteCount, homeState.clientsRemoteCount)
  );

  return patchHomeState(
    {
      clients: items,
      clientsRemoteCount: remoteCount,
    },
    {
      type: "clients",
      replace: options?.replace === true,
      emitUnchanged: true,
    }
  );
}

export function setRecent(recent = [], options = {}) {
  const items = safeArray(recent);

  if (!items.length && options?.replace !== true && homeState.activity.length) {
    return emitStateChanged("recent", {}, {
      emitUnchanged: true,
      forceEmit: false,
    });
  }

  const remoteCount = Math.max(
    items.length,
    safeNumber(options?.remoteCount, homeState.activityRemoteCount)
  );

  return patchHomeState(
    {
      activity: items,
      activityRemoteCount: remoteCount,
    },
    {
      type: "recent",
      replace: options?.replace === true,
      emitUnchanged: true,
    }
  );
}

export function setLastSyncAt(value = null) {
  const next = value instanceof Date
    ? value.toISOString()
    : safeText(value, "");

  const finalValue = next || nowIso();

  return patchHomeState(
    {
      lastSyncAt: finalValue,
      lastUpdatedAt: finalValue,
    },
    {
      type: "patch",
      emitUnchanged: true,
    }
  );
}

export function setRequestId(value = "") {
  return patchHomeState(
    {
      requestId: safeText(value, ""),
    },
    {
      type: "patch",
      emitUnchanged: true,
    }
  );
}

export function setHealth(value = null) {
  return patchHomeState(
    {
      health: value === null ? null : safeObject(value, value),
    },
    {
      type: "health",
      emitUnchanged: true,
    }
  );
}

export function setPage(page = DEFAULT_PAGE) {
  return patchHomeState(
    {
      page: Math.max(1, safeNumber(page, DEFAULT_PAGE)),
    },
    {
      type: "patch",
    }
  );
}

export function setPageSize(pageSize = DEFAULT_PAGE_SIZE) {
  return patchHomeState(
    {
      page: DEFAULT_PAGE,
      pageSize: Math.max(1, safeNumber(pageSize, DEFAULT_PAGE_SIZE)),
    },
    {
      type: "patch",
    }
  );
}

export function setOpeningTicketId(ticketId = "") {
  const next = safeText(ticketId, "");

  return patchHomeState(
    {
      openingTicketId: next,
      selectedTicketId: next || homeState.selectedTicketId,
    },
    {
      type: "patch",
      emitUnchanged: true,
    }
  );
}

export function setSelectedTicketId(ticketId = "") {
  return patchHomeState(
    {
      selectedTicketId: safeText(ticketId, ""),
    },
    {
      type: "patch",
      emitUnchanged: true,
    }
  );
}

export function setCreating(value = false) {
  return patchHomeState(
    {
      creating: safeBoolean(value, false),
    },
    {
      type: "patch",
      emitUnchanged: true,
    }
  );
}

export function setNavigatingAction(value = "") {
  return patchHomeState(
    {
      navigatingAction: safeText(value, ""),
    },
    {
      type: "patch",
      emitUnchanged: true,
    }
  );
}

/* =========================================================
   BULK SYNC
========================================================= */

export function syncHomeStateFromDashboard(dashboard = {}, options = {}) {
  const raw = safeObject(dashboard);

  if (!hasOwnKeys(raw)) {
    return patchHomeState(
      {},
      {
        type: "dashboard",
        emitUnchanged: true,
      }
    );
  }

  const patch = applyDashboardToState(raw, options);

  recordMutation("dashboard:sync", patch);

  return emitStateChanged(
    "dashboard",
    {
      dashboard: raw,
      ...patch,
    },
    {
      forceEmit: true,
      replace: options?.replace === true,
    }
  );
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

  return safeClone(
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

      modules: homeState.modules,

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

      recentMutations: homeState.recentMutations,
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

/* =========================================================
   DEBUG / BRIDGE
========================================================= */

export function getHomeStateDebugSnapshot() {
  normalizeHomeState();

  return {
    version: HOME_STATE_VERSION,
    scope: HOME_STATE_SCOPE,

    signature: getStateSignature(),
    lastStateSignature,

    lastEmitAt,
    lastEmitAtIso: lastEmitAt ? new Date(lastEmitAt).toISOString() : "",

    hasAppCore: Boolean(AppCore),
    hasEventBus: Boolean(AppCore?.events?.emit),

    state: getHomeStateSnapshot(),
  };
}

export function exposeHomeStateDebugApi() {
  const api = {
    version: HOME_STATE_VERSION,

    state: homeState,

    getState: getHomeState,
    getSnapshot: getHomeStateSnapshot,
    getDebugSnapshot: getHomeStateDebugSnapshot,

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

    setRequestId,
    setLastSyncAt,
    setHealth,
  };

  try {
    if (AppCore?.modules && isFunction(AppCore.modules.register)) {
      AppCore.modules.register("HomeState", api, {
        aliases: ["homeState", "HomeState"],
        source: HOME_STATE_SCOPE,
      });
    } else if (AppCore?.modules && typeof AppCore.modules === "object") {
      AppCore.modules.HomeState = api;
      AppCore.modules.homeState = api;
    }

    if (AppCore && Object.isExtensible(AppCore)) {
      AppCore.HomeState = api;
    }
  } catch {}

  try {
    if (isBrowser()) {
      window.OnionHomeState = api;
    }
  } catch {}

  return api;
}

/* =========================================================
   READY
========================================================= */

normalizeHomeState();

try {
  exposeHomeStateDebugApi();
} catch {}

/* =========================================================
   PUBLIC API
========================================================= */

export const HomeState = Object.freeze({
  version: HOME_STATE_VERSION,

  events: HOME_STATE_EVENTS,

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

  exposeDebugApi: exposeHomeStateDebugApi,
});

export default HomeState;
