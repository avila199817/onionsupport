/* =========================================================
   Onion SPA - Home Store
   Archivo: src/views/home/home.store.js

   ONION SUPPORT · HOME STORE
   DASHBOARD MEMORY STORE · WIDGET INDEX · NO CSS · 10/10

   RESPONSABILIDADES:
   - Mantener store local del módulo Home.
   - Guardar dashboard normalizado.
   - Indexar widgets por id/key/slug/title.
   - Exponer colecciones del Home con aliases estables.
   - Soportar replace / patch / upsert sin duplicidades.
   - Servir como memoria rápida para home.api.js y HomeView.js.
   - Emitir eventos seguros del store.
   - Registrar bridge en AppCore.modules.
   - No hacer requests HTTP.
   - No renderizar.
   - No tocar DOM.
   - No importar templates.
   - No CSS.
   - Evitar ciclos con home.api.js.

   CONTRATO USADO POR home.api.js:
   - replaceHomeStore(payload)
   - upsertHomeWidgetStore(widget)

   CONTRATO EXTRA:
   - getHomeStore()
   - getHomeDashboardStore()
   - getHomeWidgetsStore()
   - getHomeWidgetByIdStore(id)
   - getHomeSummaryStore()
   - getHomeTicketsStore()
   - getHomeInvoicesStore()
   - getHomeUsersStore()
   - getHomeClientsStore()
   - getHomeActivityStore()
   - patchHomeStore()
   - clearHomeStore()
   - subscribeHomeStore()
   - getHomeStoreSnapshot()
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const HOME_STORE_VERSION =
  "10.0.0";

const SOURCE =
  "views:home:store";

const MAX_RECENT_EVENTS =
  50;

const HOME_STORE_EVENTS =
  Object.freeze({
    change:
      "home:store:change",

    replace:
      "home:store:replace",

    patch:
      "home:store:patch",

    clear:
      "home:store:clear",

    widgetUpsert:
      "home:store:widget:upsert",
  });

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isObjectLike(value) {
  return (
    value !== null &&
    (
      typeof value === "object" ||
      typeof value === "function"
    )
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function safeObject(value, fallback = {}) {
  return isObject(value)
    ? value
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function hasOwnKeys(value = {}) {
  return Boolean(
    isObject(value) &&
    Object.keys(value).length > 0
  );
}

function first(...values) {
  for (const value of values) {
    if (
      value === undefined ||
      value === null
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

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "")
    .trim();
}

function safeClone(value, fallback = null) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {}

  return fallback;
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
    return String(nowMs());
  }
}

function canExtend(value) {
  try {
    return (
      isObjectLike(value) &&
      Object.isExtensible(value)
    );
  } catch {}

  return false;
}

function defineHiddenValue(target, key, value) {
  if (
    !target ||
    !key ||
    !canExtend(target)
  ) {
    return false;
  }

  try {
    Object.defineProperty(
      target,
      key,
      {
        value,
        enumerable:
          false,
        configurable:
          true,
        writable:
          true,
      }
    );

    return true;
  } catch {}

  try {
    target[key] = value;
    return true;
  } catch {}

  return false;
}

function uniqueBy(items = [], picker = (item) => item) {
  const seen =
    new Set();

  const output =
    [];

  for (const item of safeArray(items)) {
    const key =
      safeText(picker(item), "");

    if (!key) {
      output.push(item);
      continue;
    }

    const normalized =
      normalizeKey(key);

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(item);
  }

  return output;
}

/* =========================================================
   STORE STATE
========================================================= */

function createInitialStore() {
  return {
    version:
      HOME_STORE_VERSION,

    source:
      SOURCE,

    hydrated:
      false,

    loaded:
      false,

    dashboard:
      {},

    summary:
      {},

    stats:
      {},

    metrics:
      {},

    totals:
      {},

    counts:
      {},

    widgets:
      [],

    cards:
      [],

    kpis:
      [],

    widgetsById:
      {},

    widgetsIndex:
      {},

    recent:
      [],

    recentActivity:
      [],

    activity:
      [],

    tickets:
      [],

    incidencias:
      [],

    invoices:
      [],

    facturas:
      [],

    users:
      [],

    usuarios:
      [],

    clients:
      [],

    clientes:
      [],

    customers:
      [],

    requestId:
      "",

    lastSyncAt:
      null,

    lastReplaceAt:
      "",

    lastPatchAt:
      "",

    lastWidgetUpsertAt:
      "",

    mutationCount:
      0,

    meta:
      {},

    raw:
      null,
  };
}

export const homeStore =
  createInitialStore();

const runtime = {
  subscribers:
    new Set(),

  lastSignature:
    "",

  lastEvent:
    "",

  lastReason:
    "",

  lastChangedAt:
    "",

  lastChangedAtMs:
    0,

  recent:
    [],
};

/* =========================================================
   ID HELPERS
========================================================= */

function getWidgetId(widget = {}) {
  const item =
    safeObject(widget);

  return safeText(
    first(
      item.widgetId,
      item.widgetKey,
      item.id,
      item.key,
      item.slug,
      item.code,
      item.name,
      item.title
    ),
    ""
  );
}

function getWidgetAliases(widget = {}) {
  const item =
    safeObject(widget);

  return [
    item.widgetId,
    item.widgetKey,
    item.id,
    item.key,
    item.slug,
    item.code,
    item.type,
    item.kind,
    item.name,
    item.title,
    item.label,
  ]
    .map((value) =>
      normalizeKey(value)
    )
    .filter(Boolean);
}

function getTicketId(item = {}) {
  const raw =
    safeObject(item);

  return safeText(
    first(
      raw.ticketId,
      raw.incidenciaId,
      raw.id,
      raw._id,
      raw.code,
      raw.ticketCode,
      raw.entityId
    ),
    ""
  );
}

function getInvoiceId(item = {}) {
  const raw =
    safeObject(item);

  return safeText(
    first(
      raw.invoiceId,
      raw.facturaId,
      raw.id,
      raw._id,
      raw.numeroFacturaLegal,
      raw.numeroFactura,
      raw.invoiceNumber,
      raw.number,
      raw.numero,
      raw.code
    ),
    ""
  );
}

function getUserId(item = {}) {
  const raw =
    safeObject(item);

  return safeText(
    first(
      raw.userId,
      raw.usuarioId,
      raw.id,
      raw._id,
      raw.email,
      raw.username
    ),
    ""
  );
}

function getClientId(item = {}) {
  const raw =
    safeObject(item);

  return safeText(
    first(
      raw.clientId,
      raw.clienteId,
      raw.customerId,
      raw.id,
      raw._id,
      raw.email,
      raw.nif,
      raw.cif
    ),
    ""
  );
}

function getActivityId(item = {}) {
  const raw =
    safeObject(item);

  return safeText(
    first(
      raw.activityId,
      raw.eventId,
      raw.id,
      raw._id,
      raw.entityId,
      raw.ticketId,
      raw.incidenciaId,
      raw.invoiceId,
      raw.facturaId,
      raw.title
    ),
    ""
  );
}

/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeCollection(value = []) {
  if (Array.isArray(value)) {
    return value;
  }

  const object =
    safeObject(value);

  return safeArray(
    first(
      object.items,
      object.rows,
      object.data,
      object.results,
      object.records,
      object.docs,
      object.value,
      object.collection,
      object.list,
      []
    )
  );
}

function normalizeSummary(summary = {}) {
  const input =
    safeObject(summary);

  const totalTickets =
    Math.max(
      0,
      safeNumber(
        first(
          input.totalTickets,
          input.ticketsTotal,
          input.incidenciasTotal,
          input.totalIncidencias,
          input.ticketsCount,
          input.incidenciasCount,
          0
        ),
        0
      )
    );

  const totalInvoices =
    Math.max(
      0,
      safeNumber(
        first(
          input.totalInvoices,
          input.invoicesTotal,
          input.facturasTotal,
          input.totalFacturas,
          input.invoicesCount,
          input.facturasCount,
          0
        ),
        0
      )
    );

  const usersCount =
    Math.max(
      0,
      safeNumber(
        first(
          input.usersCount,
          input.usuariosCount,
          input.totalUsers,
          input.totalUsuarios,
          input.activeUsers,
          input.usuariosActivos,
          0
        ),
        0
      )
    );

  const clientsCount =
    Math.max(
      0,
      safeNumber(
        first(
          input.clientsCount,
          input.clientesCount,
          input.customersCount,
          input.totalClients,
          input.totalClientes,
          input.totalCustomers,
          input.activeClients,
          input.clientesActivos,
          0
        ),
        0
      )
    );

  const pendingInvoices =
    Math.max(
      0,
      safeNumber(
        first(
          input.pendingInvoices,
          input.pendingFacturas,
          input.facturasPendientes,
          input.invoicesPending,
          input.facturasVencidas,
          input.overdueInvoices,
          0
        ),
        0
      )
    );

  const invoiceAmount =
    Math.max(
      0,
      safeNumber(
        first(
          input.invoiceAmount,
          input.billingTotal,
          input.totalBilling,
          input.totalFacturado,
          input.importeFacturas,
          input.facturacionVisible,
          input.facturacionTotal,
          0
        ),
        0
      )
    );

  return {
    ...input,

    totalTickets,
    ticketsTotal:
      totalTickets,

    incidenciasTotal:
      totalTickets,

    totalIncidencias:
      totalTickets,

    ticketsCount:
      totalTickets,

    incidenciasCount:
      totalTickets,

    totalInvoices,
    invoicesTotal:
      totalInvoices,

    facturasTotal:
      totalInvoices,

    totalFacturas:
      totalInvoices,

    invoicesCount:
      totalInvoices,

    facturasCount:
      totalInvoices,

    pendingInvoices,
    pendingFacturas:
      pendingInvoices,

    facturasPendientes:
      pendingInvoices,

    invoicesPending:
      pendingInvoices,

    invoiceAmount,
    billingTotal:
      invoiceAmount,

    totalBilling:
      invoiceAmount,

    totalFacturado:
      invoiceAmount,

    importeFacturas:
      invoiceAmount,

    facturacionVisible:
      invoiceAmount,

    usersCount,
    usuariosCount:
      usersCount,

    totalUsers:
      usersCount,

    totalUsuarios:
      usersCount,

    clientsCount,
    clientesCount:
      clientsCount,

    customersCount:
      clientsCount,

    totalClients:
      clientsCount,

    totalClientes:
      clientsCount,

    totalCustomers:
      clientsCount,
  };
}

function normalizeDashboard(dashboard = {}, fallback = {}) {
  const input =
    safeObject(dashboard);

  const base =
    safeObject(fallback);

  const summary =
    normalizeSummary(
      first(
        input.summary,
        input.stats,
        input.metrics,
        input.totals,
        input.counts,
        base.summary,
        base.stats,
        base.metrics,
        base.totals,
        base.counts,
        {}
      )
    );

  const widgets =
    normalizeCollection(
      first(
        input.widgets,
        input.cards,
        input.kpis,
        base.widgets,
        base.cards,
        base.kpis,
        []
      )
    );

  const tickets =
    normalizeCollection(
      first(
        input.tickets,
        input.incidencias,
        base.tickets,
        base.incidencias,
        []
      )
    );

  const invoices =
    normalizeCollection(
      first(
        input.invoices,
        input.facturas,
        base.invoices,
        base.facturas,
        []
      )
    );

  const users =
    normalizeCollection(
      first(
        input.users,
        input.usuarios,
        base.users,
        base.usuarios,
        []
      )
    );

  const clients =
    normalizeCollection(
      first(
        input.clients,
        input.clientes,
        input.customers,
        base.clients,
        base.clientes,
        base.customers,
        []
      )
    );

  const recent =
    normalizeCollection(
      first(
        input.recent,
        input.recentActivity,
        input.activity,
        base.recent,
        base.recentActivity,
        base.activity,
        []
      )
    );

  const activity =
    normalizeCollection(
      first(
        input.activity,
        input.activities,
        input.recentActivity,
        input.recent,
        base.activity,
        base.activities,
        base.recentActivity,
        base.recent,
        []
      )
    );

  return {
    ...base,
    ...input,

    summary,
    stats:
      summary,

    metrics:
      summary,

    totals:
      summary,

    counts:
      summary,

    widgets,
    cards:
      widgets,

    kpis:
      widgets,

    tickets,
    incidencias:
      tickets,

    invoices,
    facturas:
      invoices,

    users,
    usuarios:
      users,

    clients,
    clientes:
      clients,

    customers:
      clients,

    recent,
    recentActivity:
      recent,

    activity,

    activities:
      activity,
  };
}

function buildWidgetIndex(widgets = []) {
  const byId =
    {};

  const index =
    {};

  for (const widget of safeArray(widgets)) {
    const normalized =
      safeObject(widget);

    const primaryId =
      getWidgetId(normalized);

    if (primaryId) {
      byId[primaryId] =
        normalized;
    }

    for (const alias of getWidgetAliases(normalized)) {
      index[alias] =
        normalized;
    }
  }

  return {
    byId,
    index,
  };
}

function ensureAliases() {
  const dashboard =
    normalizeDashboard(
      homeStore.dashboard,
      homeStore
    );

  const summary =
    normalizeSummary(
      first(
        homeStore.summary,
        dashboard.summary,
        {}
      )
    );

  const widgets =
    uniqueBy(
      safeArray(
        first(
          homeStore.widgets,
          dashboard.widgets,
          []
        )
      ),
      getWidgetId
    );

  const tickets =
    uniqueBy(
      safeArray(
        first(
          homeStore.tickets,
          homeStore.incidencias,
          dashboard.tickets,
          dashboard.incidencias,
          []
        )
      ),
      getTicketId
    );

  const invoices =
    uniqueBy(
      safeArray(
        first(
          homeStore.invoices,
          homeStore.facturas,
          dashboard.invoices,
          dashboard.facturas,
          []
        )
      ),
      getInvoiceId
    );

  const users =
    uniqueBy(
      safeArray(
        first(
          homeStore.users,
          homeStore.usuarios,
          dashboard.users,
          dashboard.usuarios,
          []
        )
      ),
      getUserId
    );

  const clients =
    uniqueBy(
      safeArray(
        first(
          homeStore.clients,
          homeStore.clientes,
          homeStore.customers,
          dashboard.clients,
          dashboard.clientes,
          dashboard.customers,
          []
        )
      ),
      getClientId
    );

  const recent =
    uniqueBy(
      safeArray(
        first(
          homeStore.recent,
          homeStore.recentActivity,
          dashboard.recent,
          dashboard.recentActivity,
          []
        )
      ),
      getActivityId
    );

  const activity =
    uniqueBy(
      safeArray(
        first(
          homeStore.activity,
          dashboard.activity,
          recent,
          []
        )
      ),
      getActivityId
    );

  const widgetIndex =
    buildWidgetIndex(widgets);

  homeStore.dashboard =
    {
      ...dashboard,

      summary,
      stats:
        summary,

      metrics:
        summary,

      totals:
        summary,

      counts:
        summary,

      widgets,
      cards:
        widgets,

      kpis:
        widgets,

      tickets,
      incidencias:
        tickets,

      invoices,
      facturas:
        invoices,

      users,
      usuarios:
        users,

      clients,
      clientes:
        clients,

      customers:
        clients,

      recent,
      recentActivity:
        recent,

      activity,
      activities:
        activity,
    };

  homeStore.summary =
    summary;

  homeStore.stats =
    summary;

  homeStore.metrics =
    summary;

  homeStore.totals =
    summary;

  homeStore.counts =
    summary;

  homeStore.widgets =
    widgets;

  homeStore.cards =
    widgets;

  homeStore.kpis =
    widgets;

  homeStore.widgetsById =
    widgetIndex.byId;

  homeStore.widgetsIndex =
    widgetIndex.index;

  homeStore.tickets =
    tickets;

  homeStore.incidencias =
    tickets;

  homeStore.invoices =
    invoices;

  homeStore.facturas =
    invoices;

  homeStore.users =
    users;

  homeStore.usuarios =
    users;

  homeStore.clients =
    clients;

  homeStore.clientes =
    clients;

  homeStore.customers =
    clients;

  homeStore.recent =
    recent;

  homeStore.recentActivity =
    recent;

  homeStore.activity =
    activity;

  homeStore.loaded =
    Boolean(
      homeStore.loaded ||
        hasOwnKeys(homeStore.dashboard) ||
        hasOwnKeys(homeStore.summary) ||
        widgets.length ||
        tickets.length ||
        invoices.length ||
        users.length ||
        clients.length ||
        recent.length ||
        activity.length
    );

  homeStore.hydrated =
    Boolean(
      homeStore.hydrated ||
        homeStore.loaded
    );

  homeStore.requestId =
    safeText(homeStore.requestId, "");

  homeStore.lastSyncAt =
    homeStore.lastSyncAt || null;

  homeStore.meta =
    safeObject(homeStore.meta);

  return homeStore;
}

/* =========================================================
   EVENT SYSTEM
========================================================= */

function getComparableSignature() {
  const data = {
    hydrated:
      Boolean(homeStore.hydrated),

    loaded:
      Boolean(homeStore.loaded),

    requestId:
      safeText(homeStore.requestId, ""),

    lastSyncAt:
      homeStore.lastSyncAt || "",

    dashboard:
      hasOwnKeys(homeStore.dashboard),

    summary:
      hasOwnKeys(homeStore.summary),

    widgets:
      safeArray(homeStore.widgets).length,

    tickets:
      safeArray(homeStore.tickets).length,

    invoices:
      safeArray(homeStore.invoices).length,

    users:
      safeArray(homeStore.users).length,

    clients:
      safeArray(homeStore.clients).length,

    recent:
      safeArray(homeStore.recent).length,

    activity:
      safeArray(homeStore.activity).length,

    mutationCount:
      safeNumber(homeStore.mutationCount, 0),
  };

  try {
    return JSON.stringify(data);
  } catch {
    return String(nowMs());
  }
}

function pushRecentEvent(entry = {}) {
  runtime.recent.unshift({
    source:
      SOURCE,

    ...safeObject(entry),

    at:
      nowIso(),

    atMs:
      nowMs(),
  });

  if (runtime.recent.length > MAX_RECENT_EVENTS) {
    runtime.recent =
      runtime.recent.slice(
        0,
        MAX_RECENT_EVENTS
      );
  }
}

function safeWindowDispatch(eventName = "", payload = {}) {
  if (
    !isBrowser() ||
    !eventName
  ) {
    return false;
  }

  try {
    window.dispatchEvent(
      new CustomEvent(
        eventName,
        {
          detail:
            payload,
        }
      )
    );

    return true;
  } catch {}

  return false;
}

function safeEmit(eventName = "", payload = {}, options = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const finalPayload = {
    source:
      SOURCE,

    version:
      HOME_STORE_VERSION,

    ...safeObject(payload),
  };

  let busAvailable =
    false;

  let busEmitted =
    false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable =
        true;

      AppCore.events.emit(
        name,
        finalPayload
      );

      busEmitted =
        true;
    }
  } catch {}

  if (
    options.window === true ||
    (!busAvailable && isBrowser())
  ) {
    return (
      safeWindowDispatch(
        name,
        finalPayload
      ) ||
      busEmitted
    );
  }

  return busEmitted;
}

function notifySubscribers(payload = {}) {
  for (const subscriber of Array.from(runtime.subscribers)) {
    try {
      subscriber(
        homeStore,
        payload
      );
    } catch {}
  }
}

function notifyChange({
  event =
    HOME_STORE_EVENTS.change,

  reason =
    "store-change",

  changedKeys =
    [],

  force =
    false,

  emit =
    true,
} = {}) {
  ensureAliases();

  const signature =
    getComparableSignature();

  const changed =
    force || signature !== runtime.lastSignature;

  if (!changed) {
    return {
      changed:
        false,

      store:
        homeStore,
    };
  }

  runtime.lastSignature =
    signature;

  runtime.lastEvent =
    event;

  runtime.lastReason =
    reason;

  runtime.lastChangedAt =
    nowIso();

  runtime.lastChangedAtMs =
    nowMs();

  pushRecentEvent({
    event,
    reason,
    changedKeys:
      safeArray(changedKeys),
  });

  const payload = {
    changed:
      true,

    event,
    reason,

    changedKeys:
      safeArray(changedKeys),

    snapshot:
      getHomeStoreSnapshot({
        includeData:
          false,
      }),
  };

  notifySubscribers(payload);

  if (emit !== false) {
    safeEmit(
      event,
      payload
    );

    if (event !== HOME_STORE_EVENTS.change) {
      safeEmit(
        HOME_STORE_EVENTS.change,
        payload
      );
    }
  }

  return {
    changed:
      true,

    payload,

    store:
      homeStore,
  };
}

/* =========================================================
   CORE SYNC
========================================================= */

function syncCoreStoreBridge() {
  try {
    if (isFunction(AppCore?.setState)) {
      AppCore.setState({
        homeStore: {
          hydrated:
            Boolean(homeStore.hydrated),

          loaded:
            Boolean(homeStore.loaded),

          requestId:
            homeStore.requestId,

          lastSyncAt:
            homeStore.lastSyncAt,

          widgetsCount:
            homeStore.widgets.length,

          ticketsCount:
            homeStore.tickets.length,

          invoicesCount:
            homeStore.invoices.length,

          usersCount:
            homeStore.users.length,

          clientsCount:
            homeStore.clients.length,
        },
      });
    }
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      AppCore.state.homeStore = {
        ...safeObject(AppCore.state.homeStore),

        hydrated:
          Boolean(homeStore.hydrated),

        loaded:
          Boolean(homeStore.loaded),

        requestId:
          homeStore.requestId,

        lastSyncAt:
          homeStore.lastSyncAt,

        widgetsCount:
          homeStore.widgets.length,

        ticketsCount:
          homeStore.tickets.length,

        invoicesCount:
          homeStore.invoices.length,

        usersCount:
          homeStore.users.length,

        clientsCount:
          homeStore.clients.length,
      };
    }
  } catch {}

  return true;
}

/* =========================================================
   MUTATORS
========================================================= */

export function replaceHomeStore(payload = {}, options = {}) {
  const input =
    safeObject(payload);

  const dashboard =
    normalizeDashboard(
      first(
        input.dashboard,
        input.data?.dashboard,
        input.payload?.dashboard,
        input.result?.dashboard,
        input
      )
    );

  const summary =
    normalizeSummary(
      first(
        input.summary,
        input.stats,
        input.metrics,
        input.totals,
        input.counts,
        dashboard.summary,
        {}
      )
    );

  const widgets =
    safeArray(
      first(
        input.widgets,
        input.cards,
        input.kpis,
        dashboard.widgets,
        []
      )
    );

  const recent =
    safeArray(
      first(
        input.recent,
        input.recentActivity,
        input.activity,
        dashboard.recent,
        dashboard.recentActivity,
        []
      )
    );

  const activity =
    safeArray(
      first(
        input.activity,
        input.activities,
        dashboard.activity,
        recent,
        []
      )
    );

  const tickets =
    safeArray(
      first(
        input.tickets,
        input.incidencias,
        dashboard.tickets,
        dashboard.incidencias,
        []
      )
    );

  const invoices =
    safeArray(
      first(
        input.invoices,
        input.facturas,
        dashboard.invoices,
        dashboard.facturas,
        []
      )
    );

  const users =
    safeArray(
      first(
        input.users,
        input.usuarios,
        dashboard.users,
        dashboard.usuarios,
        []
      )
    );

  const clients =
    safeArray(
      first(
        input.clients,
        input.clientes,
        input.customers,
        dashboard.clients,
        dashboard.clientes,
        dashboard.customers,
        []
      )
    );

  homeStore.dashboard =
    {
      ...dashboard,
      summary,
      stats:
        summary,
      metrics:
        summary,
      totals:
        summary,
      counts:
        summary,
      widgets,
      cards:
        widgets,
      kpis:
        widgets,
      recent,
      recentActivity:
        recent,
      activity,
      activities:
        activity,
      tickets,
      incidencias:
        tickets,
      invoices,
      facturas:
        invoices,
      users,
      usuarios:
        users,
      clients,
      clientes:
        clients,
      customers:
        clients,
    };

  homeStore.summary =
    summary;

  homeStore.stats =
    summary;

  homeStore.metrics =
    summary;

  homeStore.totals =
    summary;

  homeStore.counts =
    summary;

  homeStore.widgets =
    widgets;

  homeStore.cards =
    widgets;

  homeStore.kpis =
    widgets;

  homeStore.recent =
    recent;

  homeStore.recentActivity =
    recent;

  homeStore.activity =
    activity;

  homeStore.tickets =
    tickets;

  homeStore.incidencias =
    tickets;

  homeStore.invoices =
    invoices;

  homeStore.facturas =
    invoices;

  homeStore.users =
    users;

  homeStore.usuarios =
    users;

  homeStore.clients =
    clients;

  homeStore.clientes =
    clients;

  homeStore.customers =
    clients;

  homeStore.requestId =
    safeText(
      first(
        input.requestId,
        dashboard.requestId,
        dashboard.meta?.requestId,
        ""
      ),
      ""
    );

  homeStore.lastSyncAt =
    first(
      input.lastSyncAt,
      dashboard.lastSyncAt,
      dashboard.updatedAt,
      dashboard.generatedAt,
      null
    );

  homeStore.meta =
    {
      ...safeObject(dashboard.meta),
      ...safeObject(input.meta),
    };

  homeStore.raw =
    first(
      input.raw,
      dashboard.raw,
      input
    );

  homeStore.hydrated =
    true;

  homeStore.loaded =
    true;

  homeStore.lastReplaceAt =
    nowIso();

  homeStore.mutationCount +=
    1;

  ensureAliases();
  syncCoreStoreBridge();

  notifyChange({
    event:
      HOME_STORE_EVENTS.replace,

    reason:
      options.reason || "replace-home-store",

    changedKeys:
      Object.keys(input),

    force:
      true,

    emit:
      options.emit,
  });

  return homeStore;
}

export function patchHomeStore(patch = {}, options = {}) {
  const input =
    safeObject(patch);

  if (!hasOwnKeys(input)) {
    return homeStore;
  }

  Object.assign(
    homeStore,
    input
  );

  homeStore.lastPatchAt =
    nowIso();

  homeStore.mutationCount +=
    1;

  ensureAliases();
  syncCoreStoreBridge();

  notifyChange({
    event:
      HOME_STORE_EVENTS.patch,

    reason:
      options.reason || "patch-home-store",

    changedKeys:
      Object.keys(input),

    force:
      options.force === true,

    emit:
      options.emit,
  });

  return homeStore;
}

export function upsertHomeWidgetStore(widget = {}, options = {}) {
  const item =
    safeObject(widget);

  if (!hasOwnKeys(item)) {
    return null;
  }

  const id =
    getWidgetId(item);

  const aliases =
    getWidgetAliases(item);

  const currentWidgets =
    safeArray(homeStore.widgets);

  const nextWidgets =
    [];

  let replaced =
    false;

  for (const current of currentWidgets) {
    const currentAliases =
      getWidgetAliases(current);

    const same =
      Boolean(
        id &&
          currentAliases.some((alias) =>
            aliases.includes(alias)
          )
      );

    if (same) {
      nextWidgets.push({
        ...safeObject(current),
        ...item,
      });

      replaced =
        true;
    } else {
      nextWidgets.push(current);
    }
  }

  if (!replaced) {
    nextWidgets.push(item);
  }

  homeStore.widgets =
    nextWidgets;

  homeStore.cards =
    nextWidgets;

  homeStore.kpis =
    nextWidgets;

  homeStore.dashboard =
    {
      ...safeObject(homeStore.dashboard),
      widgets:
        nextWidgets,
      cards:
        nextWidgets,
      kpis:
        nextWidgets,
    };

  homeStore.lastWidgetUpsertAt =
    nowIso();

  homeStore.mutationCount +=
    1;

  ensureAliases();
  syncCoreStoreBridge();

  notifyChange({
    event:
      HOME_STORE_EVENTS.widgetUpsert,

    reason:
      options.reason || "upsert-home-widget",

    changedKeys:
      [
        "widgets",
        "widgetsById",
        "widgetsIndex",
      ],

    force:
      true,

    emit:
      options.emit,
  });

  return id
    ? getHomeWidgetByIdStore(id)
    : item;
}

export function clearHomeStore(options = {}) {
  const fresh =
    createInitialStore();

  for (const key of Object.keys(homeStore)) {
    try {
      delete homeStore[key];
    } catch {}
  }

  Object.assign(
    homeStore,
    fresh
  );

  homeStore.mutationCount +=
    1;

  ensureAliases();
  syncCoreStoreBridge();

  notifyChange({
    event:
      HOME_STORE_EVENTS.clear,

    reason:
      options.reason || "clear-home-store",

    changedKeys:
      Object.keys(fresh),

    force:
      true,

    emit:
      options.emit,
  });

  return homeStore;
}

/* =========================================================
   READERS
========================================================= */

export function getHomeStore() {
  ensureAliases();
  return homeStore;
}

export function getHomeDashboardStore() {
  ensureAliases();
  return homeStore.dashboard;
}

export function getHomeSummaryStore() {
  ensureAliases();
  return homeStore.summary;
}

export function getHomeWidgetsStore() {
  ensureAliases();
  return homeStore.widgets;
}

export function getHomeWidgetByIdStore(widgetId = "") {
  ensureAliases();

  const id =
    safeText(widgetId, "");

  if (!id) {
    return null;
  }

  return (
    homeStore.widgetsById[id] ||
    homeStore.widgetsIndex[normalizeKey(id)] ||
    null
  );
}

export function getHomeTicketsStore() {
  ensureAliases();
  return homeStore.tickets;
}

export function getHomeIncidenciasStore() {
  return getHomeTicketsStore();
}

export function getHomeInvoicesStore() {
  ensureAliases();
  return homeStore.invoices;
}

export function getHomeFacturasStore() {
  return getHomeInvoicesStore();
}

export function getHomeUsersStore() {
  ensureAliases();
  return homeStore.users;
}

export function getHomeUsuariosStore() {
  return getHomeUsersStore();
}

export function getHomeClientsStore() {
  ensureAliases();
  return homeStore.clients;
}

export function getHomeClientesStore() {
  return getHomeClientsStore();
}

export function getHomeActivityStore() {
  ensureAliases();
  return homeStore.activity;
}

export function getHomeRecentStore() {
  ensureAliases();
  return homeStore.recent;
}

/* =========================================================
   SUBSCRIBE
========================================================= */

export function subscribeHomeStore(handler) {
  if (!isFunction(handler)) {
    return () => {};
  }

  runtime.subscribers.add(handler);

  return () => {
    try {
      runtime.subscribers.delete(handler);
    } catch {}
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHomeStoreSnapshot(options = {}) {
  const opts =
    safeObject(options);

  ensureAliases();

  const base = {
    version:
      HOME_STORE_VERSION,

    source:
      SOURCE,

    hydrated:
      Boolean(homeStore.hydrated),

    loaded:
      Boolean(homeStore.loaded),

    requestId:
      homeStore.requestId,

    lastSyncAt:
      homeStore.lastSyncAt,

    lastReplaceAt:
      homeStore.lastReplaceAt,

    lastPatchAt:
      homeStore.lastPatchAt,

    lastWidgetUpsertAt:
      homeStore.lastWidgetUpsertAt,

    mutationCount:
      homeStore.mutationCount,

    counts: {
      widgets:
        homeStore.widgets.length,

      widgetIndex:
        Object.keys(homeStore.widgetsIndex || {}).length,

      recent:
        homeStore.recent.length,

      activity:
        homeStore.activity.length,

      tickets:
        homeStore.tickets.length,

      invoices:
        homeStore.invoices.length,

      users:
        homeStore.users.length,

      clients:
        homeStore.clients.length,
    },

    hasDashboard:
      hasOwnKeys(homeStore.dashboard),

    hasSummary:
      hasOwnKeys(homeStore.summary),

    summary:
      safeClone(homeStore.summary, {}),

    meta:
      safeClone(homeStore.meta, {}),

    runtime: {
      subscribers:
        runtime.subscribers.size,

      lastEvent:
        runtime.lastEvent,

      lastReason:
        runtime.lastReason,

      lastChangedAt:
        runtime.lastChangedAt,

      lastChangedAtMs:
        runtime.lastChangedAtMs,

      recent:
        safeClone(runtime.recent, []),
    },
  };

  if (opts.includeData === true) {
    return {
      ...base,

      dashboard:
        safeClone(homeStore.dashboard, {}),

      widgets:
        safeClone(homeStore.widgets, []),

      widgetsById:
        safeClone(homeStore.widgetsById, {}),

      widgetsIndex:
        safeClone(homeStore.widgetsIndex, {}),

      recent:
        safeClone(homeStore.recent, []),

      recentActivity:
        safeClone(homeStore.recentActivity, []),

      activity:
        safeClone(homeStore.activity, []),

      tickets:
        safeClone(homeStore.tickets, []),

      incidencias:
        safeClone(homeStore.incidencias, []),

      invoices:
        safeClone(homeStore.invoices, []),

      facturas:
        safeClone(homeStore.facturas, []),

      users:
        safeClone(homeStore.users, []),

      usuarios:
        safeClone(homeStore.usuarios, []),

      clients:
        safeClone(homeStore.clients, []),

      clientes:
        safeClone(homeStore.clientes, []),

      customers:
        safeClone(homeStore.customers, []),
    };
  }

  return base;
}

/* =========================================================
   APPCORE BRIDGE
========================================================= */

function registerHomeStoreBridge() {
  const api = {
    version:
      HOME_STORE_VERSION,

    events:
      HOME_STORE_EVENTS,

    store:
      homeStore,

    getStore:
      getHomeStore,

    getSnapshot:
      getHomeStoreSnapshot,

    replace:
      replaceHomeStore,

    patch:
      patchHomeStore,

    clear:
      clearHomeStore,

    subscribe:
      subscribeHomeStore,

    upsertWidget:
      upsertHomeWidgetStore,

    getDashboard:
      getHomeDashboardStore,

    getSummary:
      getHomeSummaryStore,

    getWidgets:
      getHomeWidgetsStore,

    getWidgetById:
      getHomeWidgetByIdStore,

    getTickets:
      getHomeTicketsStore,

    getIncidencias:
      getHomeIncidenciasStore,

    getInvoices:
      getHomeInvoicesStore,

    getFacturas:
      getHomeFacturasStore,

    getUsers:
      getHomeUsersStore,

    getUsuarios:
      getHomeUsuariosStore,

    getClients:
      getHomeClientsStore,

    getClientes:
      getHomeClientesStore,

    getActivity:
      getHomeActivityStore,

    getRecent:
      getHomeRecentStore,
  };

  try {
    if (isFunction(AppCore?.modules?.register)) {
      AppCore.modules.register(
        "HomeStore",
        api,
        {
          overwrite:
            true,

          replace:
            true,

          source:
            SOURCE,
        }
      );
    } else if (isFunction(AppCore?.modules?.set)) {
      AppCore.modules.set(
        "HomeStore",
        api
      );
    } else if (
      AppCore?.modules &&
      typeof AppCore.modules === "object"
    ) {
      AppCore.modules.HomeStore =
        api;

      AppCore.modules.homeStore =
        api;
    }
  } catch {}

  try {
    defineHiddenValue(
      AppCore,
      "HomeStore",
      api
    );
  } catch {}

  try {
    if (isBrowser()) {
      window.OnionHomeStore = {
        ...(window.OnionHomeStore || {}),
        ...api,
      };
    }
  } catch {}

  return api;
}

/* =========================================================
   BOOTSTRAP
========================================================= */

ensureAliases();
registerHomeStoreBridge();

/* =========================================================
   PUBLIC API OBJECT
========================================================= */

export const HomeStore =
  Object.freeze({
    version:
      HOME_STORE_VERSION,

    events:
      HOME_STORE_EVENTS,

    store:
      homeStore,

    getStore:
      getHomeStore,

    getSnapshot:
      getHomeStoreSnapshot,

    replace:
      replaceHomeStore,

    patch:
      patchHomeStore,

    clear:
      clearHomeStore,

    subscribe:
      subscribeHomeStore,

    upsertWidget:
      upsertHomeWidgetStore,

    getDashboard:
      getHomeDashboardStore,

    getSummary:
      getHomeSummaryStore,

    getWidgets:
      getHomeWidgetsStore,

    getWidgetById:
      getHomeWidgetByIdStore,

    getTickets:
      getHomeTicketsStore,

    getIncidencias:
      getHomeIncidenciasStore,

    getInvoices:
      getHomeInvoicesStore,

    getFacturas:
      getHomeFacturasStore,

    getUsers:
      getHomeUsersStore,

    getUsuarios:
      getHomeUsuariosStore,

    getClients:
      getHomeClientsStore,

    getClientes:
      getHomeClientesStore,

    getActivity:
      getHomeActivityStore,

    getRecent:
      getHomeRecentStore,
  });

export default HomeStore;
