/* =========================================================
   Onion SPA - Home State
   Archivo: src/views/home/home.state.js

   HOME STATE · SINGLE SOURCE · STORE READY · NO CSS · 10/10

   RESPONSABILIDADES:
   - Mantener estado runtime del Home.
   - Exponer setters seguros consumidos por home.api.js y HomeView.js.
   - Preservar dashboard/summary/widgets/collections sin empobrecer datos.
   - Diferenciar loading / refreshing / hydrated / loaded.
   - Sincronizar eventos de cambio con AppCore.events o window fallback.
   - Evitar tormentas de eventos mediante firma comparable.
   - Mantener shape estable para home.store.js, home.api.js y home.template.js.
   - Cero CSS, cero DOM obligatorio, cero dependencias circulares.

   REGLA CRÍTICA:
   - No pisar arrays existentes con arrays vacíos salvo replace explícito.
   - No pisar summary/dashboard real con objeto vacío salvo replace explícito.
   - Setters individuales son tolerantes a payload parcial.
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const HOME_STATE_VERSION =
  "10.0.0";

export const HOME_STATE_SCOPE =
  "view:home:state";

export const HOME_STATE_EVENTS =
  Object.freeze({
    change:
      "home:state:change",

    patch:
      "home:state:patch",

    reset:
      "home:state:reset",

    loading:
      "home:state:loading",

    refreshing:
      "home:state:refreshing",

    loaded:
      "home:state:loaded",

    hydrated:
      "home:state:hydrated",

    error:
      "home:state:error",

    dashboard:
      "home:state:dashboard",

    summary:
      "home:state:summary",

    widgets:
      "home:state:widgets",

    recent:
      "home:state:recent",

    health:
      "home:state:health",
  });

const DEFAULT_PAGE =
  1;

const DEFAULT_PAGE_SIZE =
  5;

const MAX_RECENT_MUTATIONS =
  60;

let lastStateSignature =
  "";

let lastEmitAt =
  0;

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
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
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

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key =
      value.trim().toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "on",
        "ok",
      ].includes(key)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
      ].includes(key)
    ) {
      return false;
    }
  }

  return Boolean(fallback);
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
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {}

  return fallback;
}

function normalizeError(error = null) {
  if (!error) {
    return null;
  }

  if (typeof error === "string") {
    return {
      name:
        "HomeStateError",

      message:
        safeText(error, "Error Home."),

      code:
        "HOME_STATE_ERROR",
    };
  }

  const object =
    safeObject(error);

  return {
    name:
      safeText(
        object.name,
        "HomeStateError"
      ),

    message:
      safeText(
        first(
          object.message,
          object.detail,
          object.error,
          object.statusText,
          "Error Home."
        ),
        "Error Home."
      ),

    code:
      safeText(
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
   EVENTS
========================================================= */

function safeWindowDispatch(eventName = "", payload = {}) {
  if (
    !isBrowser() ||
    !eventName
  ) {
    return false;
  }

  try {
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail:
          payload,
      })
    );

    return true;
  } catch {}

  return false;
}

function emitHomeStateEvent(eventName = "", payload = {}, options = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const opts =
    safeObject(options);

  const detail = {
    source:
      HOME_STATE_SCOPE,

    version:
      HOME_STATE_VERSION,

    at:
      nowIso(),

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
        detail
      );

      busEmitted =
        true;
    }
  } catch {}

  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    return (
      safeWindowDispatch(
        name,
        detail
      ) ||
      busEmitted
    );
  }

  return busEmitted;
}

/* =========================================================
   INITIAL STATE
========================================================= */

export function createInitialHomeState() {
  return {
    version:
      HOME_STATE_VERSION,

    hydrated:
      false,

    loaded:
      false,

    loading:
      false,

    refreshing:
      false,

    creating:
      false,

    openingTicketId:
      "",

    selectedTicketId:
      "",

    navigatingAction:
      "",

    error:
      "",

    lastError:
      null,

    page:
      DEFAULT_PAGE,

    pageSize:
      DEFAULT_PAGE_SIZE,

    remoteCount:
      0,

    totalCount:
      0,

    ticketsRemoteCount:
      0,

    invoicesRemoteCount:
      0,

    usersRemoteCount:
      0,

    clientsRemoteCount:
      0,

    activityRemoteCount:
      0,

    requestId:
      "",

    lastSyncAt:
      "",

    lastUpdatedAt:
      "",

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

    activity:
      [],

    activities:
      [],

    recent:
      [],

    recentActivity:
      [],

    health:
      null,

    meta:
      {},

    recentMutations:
      [],
  };
}

export const homeState =
  createInitialHomeState();

/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeSummaryAliases(summary = {}) {
  const raw =
    safeObject(summary);

  const ticketsCount =
    Math.max(
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

  const invoicesCount =
    Math.max(
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

  const usersCount =
    Math.max(
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

  const clientsCount =
    Math.max(
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

  const pendingInvoices =
    Math.max(
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

  const invoiceAmount =
    Math.max(
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

  return {
    ...raw,

    totalTickets:
      ticketsCount,
    ticketsTotal:
      ticketsCount,
    incidenciasTotal:
      ticketsCount,
    totalIncidencias:
      ticketsCount,
    ticketsCount,
    incidenciasCount:
      ticketsCount,

    totalInvoices:
      invoicesCount,
    invoicesTotal:
      invoicesCount,
    facturasTotal:
      invoicesCount,
    totalFacturas:
      invoicesCount,
    invoicesCount,
    facturasCount:
      invoicesCount,

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
    facturacionTotal:
      invoiceAmount,

    usersCount,
    usuariosCount:
      usersCount,
    totalUsers:
      usersCount,
    totalUsuarios:
      usersCount,
    activeUsers:
      Math.max(
        usersCount,
        safeNumber(first(raw.activeUsers, raw.usuariosActivos, 0), 0)
      ),
    usuariosActivos:
      Math.max(
        usersCount,
        safeNumber(first(raw.activeUsers, raw.usuariosActivos, 0), 0)
      ),

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
    activeClients:
      Math.max(
        clientsCount,
        safeNumber(first(raw.activeClients, raw.clientesActivos, 0), 0)
      ),
    clientesActivos:
      Math.max(
        clientsCount,
        safeNumber(first(raw.activeClients, raw.clientesActivos, 0), 0)
      ),
  };
}

function syncAliasesFromCollections() {
  homeState.incidencias =
    safeArray(homeState.tickets);

  homeState.facturas =
    safeArray(homeState.invoices);

  homeState.usuarios =
    safeArray(homeState.users);

  homeState.clientes =
    safeArray(homeState.clients);

  homeState.customers =
    safeArray(homeState.clients);

  homeState.activities =
    safeArray(homeState.activity);

  homeState.recent =
    safeArray(homeState.activity);

  homeState.recentActivity =
    safeArray(homeState.activity);

  homeState.cards =
    safeArray(homeState.widgets);

  homeState.kpis =
    safeArray(homeState.widgets);
}

function syncAliasesFromSummary() {
  homeState.summary =
    normalizeSummaryAliases(homeState.summary);

  homeState.stats =
    homeState.summary;

  homeState.metrics =
    homeState.summary;

  homeState.totals =
    homeState.summary;

  homeState.counts =
    homeState.summary;
}

function syncDashboardAliases() {
  const dashboard =
    safeObject(homeState.dashboard);

  homeState.dashboard = {
    ...dashboard,

    summary:
      homeState.summary,

    stats:
      homeState.summary,

    metrics:
      homeState.summary,

    totals:
      homeState.summary,

    counts:
      homeState.summary,

    widgets:
      homeState.widgets,

    cards:
      homeState.widgets,

    kpis:
      homeState.widgets,

    tickets:
      homeState.tickets,

    incidencias:
      homeState.tickets,

    invoices:
      homeState.invoices,

    facturas:
      homeState.invoices,

    users:
      homeState.users,

    usuarios:
      homeState.users,

    clients:
      homeState.clients,

    clientes:
      homeState.clients,

    customers:
      homeState.clients,

    activity:
      homeState.activity,

    activities:
      homeState.activity,

    recent:
      homeState.activity,

    recentActivity:
      homeState.activity,
  };
}

export function normalizeHomeState() {
  homeState.page =
    Math.max(
      1,
      safeNumber(homeState.page, DEFAULT_PAGE)
    );

  homeState.pageSize =
    Math.max(
      1,
      safeNumber(homeState.pageSize, DEFAULT_PAGE_SIZE)
    );

  homeState.loading =
    Boolean(homeState.loading);

  homeState.refreshing =
    Boolean(homeState.refreshing);

  homeState.hydrated =
    Boolean(homeState.hydrated);

  homeState.loaded =
    Boolean(homeState.loaded);

  homeState.creating =
    Boolean(homeState.creating);

  homeState.openingTicketId =
    safeText(homeState.openingTicketId, "");

  homeState.selectedTicketId =
    safeText(homeState.selectedTicketId, "");

  homeState.navigatingAction =
    safeText(homeState.navigatingAction, "");

  homeState.error =
    safeText(homeState.error, "");

  homeState.requestId =
    safeText(homeState.requestId, "");

  homeState.lastSyncAt =
    first(homeState.lastSyncAt, homeState.lastUpdatedAt, "");

  homeState.lastUpdatedAt =
    first(homeState.lastUpdatedAt, homeState.lastSyncAt, "");

  homeState.dashboard =
    safeObject(homeState.dashboard);

  homeState.summary =
    safeObject(homeState.summary);

  homeState.widgets =
    safeArray(homeState.widgets);

  homeState.tickets =
    safeArray(homeState.tickets);

  homeState.invoices =
    safeArray(homeState.invoices);

  homeState.users =
    safeArray(homeState.users);

  homeState.clients =
    safeArray(homeState.clients);

  homeState.activity =
    safeArray(homeState.activity);

  homeState.remoteCount =
    Math.max(
      0,
      safeNumber(
        homeState.remoteCount,
        homeState.tickets.length
      )
    );

  homeState.totalCount =
    Math.max(
      homeState.remoteCount,
      safeNumber(homeState.totalCount, 0)
    );

  homeState.ticketsRemoteCount =
    Math.max(
      homeState.tickets.length,
      safeNumber(homeState.ticketsRemoteCount, homeState.tickets.length)
    );

  homeState.invoicesRemoteCount =
    Math.max(
      homeState.invoices.length,
      safeNumber(homeState.invoicesRemoteCount, homeState.invoices.length)
    );

  homeState.usersRemoteCount =
    Math.max(
      homeState.users.length,
      safeNumber(homeState.usersRemoteCount, homeState.users.length)
    );

  homeState.clientsRemoteCount =
    Math.max(
      homeState.clients.length,
      safeNumber(homeState.clientsRemoteCount, homeState.clients.length)
    );

  homeState.activityRemoteCount =
    Math.max(
      homeState.activity.length,
      safeNumber(homeState.activityRemoteCount, homeState.activity.length)
    );

  homeState.meta =
    safeObject(homeState.meta);

  homeState.recentMutations =
    safeArray(homeState.recentMutations)
      .slice(0, MAX_RECENT_MUTATIONS);

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
    hydrated:
      Boolean(homeState.hydrated),

    loaded:
      Boolean(homeState.loaded),

    loading:
      Boolean(homeState.loading),

    refreshing:
      Boolean(homeState.refreshing),

    creating:
      Boolean(homeState.creating),

    openingTicketId:
      safeText(homeState.openingTicketId, ""),

    selectedTicketId:
      safeText(homeState.selectedTicketId, ""),

    navigatingAction:
      safeText(homeState.navigatingAction, ""),

    error:
      safeText(homeState.error, ""),

    page:
      safeNumber(homeState.page, DEFAULT_PAGE),

    pageSize:
      safeNumber(homeState.pageSize, DEFAULT_PAGE_SIZE),

    requestId:
      safeText(homeState.requestId, ""),

    lastSyncAt:
      safeText(homeState.lastSyncAt, ""),

    widgets:
      safeArray(homeState.widgets).length,

    tickets:
      safeArray(homeState.tickets).length,

    invoices:
      safeArray(homeState.invoices).length,

    users:
      safeArray(homeState.users).length,

    clients:
      safeArray(homeState.clients).length,

    activity:
      safeArray(homeState.activity).length,

    ticketsRemoteCount:
      safeNumber(homeState.ticketsRemoteCount, 0),

    invoicesRemoteCount:
      safeNumber(homeState.invoicesRemoteCount, 0),

    usersRemoteCount:
      safeNumber(homeState.usersRemoteCount, 0),

    clientsRemoteCount:
      safeNumber(homeState.clientsRemoteCount, 0),
  };

  try {
    return JSON.stringify(data);
  } catch {
    return String(nowMs());
  }
}

function recordMutation(type = "patch", patch = {}) {
  const item = {
    type:
      safeText(type, "patch"),

    keys:
      Object.keys(
        safeObject(patch)
      ),

    at:
      nowIso(),
  };

  homeState.recentMutations.unshift(item);

  if (homeState.recentMutations.length > MAX_RECENT_MUTATIONS) {
    homeState.recentMutations =
      homeState.recentMutations.slice(0, MAX_RECENT_MUTATIONS);
  }

  return item;
}

function emitStateChanged(type = "patch", patch = {}, options = {}) {
  normalizeHomeState();

  const signature =
    getStateSignature();

  const changed =
    signature !== lastStateSignature;

  const force =
    safeBoolean(options?.forceEmit, false) ||
    safeBoolean(options?.emitUnchanged, false);

  lastStateSignature =
    signature;

  const at =
    nowMs();

  lastEmitAt =
    at;

  const payload = {
    type:
      safeText(type, "patch"),

    changed,

    patch:
      safeClone(patch, {}),

    state:
      getHomeStateSnapshot(),

    at:
      nowIso(),
  };

  if (
    changed ||
    force
  ) {
    emitHomeStateEvent(
      HOME_STATE_EVENTS.change,
      payload
    );

    if (HOME_STATE_EVENTS[type]) {
      emitHomeStateEvent(
        HOME_STATE_EVENTS[type],
        payload
      );
    } else if (type !== "change") {
      emitHomeStateEvent(
        HOME_STATE_EVENTS.patch,
        payload
      );
    }
  }

  return payload;
}

/* =========================================================
   PATCH / SETTERS
========================================================= */

export function patchHomeState(patch = {}, options = {}) {
  const data =
    safeObject(patch);

  const opts =
    safeObject(options);

  const replace =
    opts.replace === true;

  for (const [key, value] of Object.entries(data)) {
    if (
      Array.isArray(value) &&
      value.length === 0 &&
      !replace &&
      Array.isArray(homeState[key]) &&
      homeState[key].length > 0
    ) {
      continue;
    }

    if (
      isObject(value) &&
      !hasOwnKeys(value) &&
      !replace &&
      isObject(homeState[key]) &&
      hasOwnKeys(homeState[key])
    ) {
      continue;
    }

    homeState[key] =
      value;
  }

  recordMutation(
    safeText(opts.type, "patch"),
    data
  );

  return emitStateChanged(
    safeText(opts.type, "patch"),
    data,
    opts
  );
}

export function replaceHomeState(nextState = {}, options = {}) {
  const currentInitial =
    createInitialHomeState();

  Object.keys(homeState).forEach((key) => {
    delete homeState[key];
  });

  Object.assign(
    homeState,
    currentInitial,
    safeObject(nextState)
  );

  recordMutation(
    "replace",
    nextState
  );

  return emitStateChanged(
    "patch",
    nextState,
    {
      ...safeObject(options),
      replace:
        true,
      forceEmit:
        options?.forceEmit !== false,
    }
  );
}

export function resetHomeState(options = {}) {
  Object.keys(homeState).forEach((key) => {
    delete homeState[key];
  });

  Object.assign(
    homeState,
    createInitialHomeState()
  );

  lastStateSignature =
    "";

  recordMutation(
    "reset",
    {}
  );

  emitHomeStateEvent(
    HOME_STATE_EVENTS.reset,
    {
      state:
        getHomeStateSnapshot(),
    },
    {
      window:
        false,
    }
  );

  return emitStateChanged(
    "reset",
    {},
    {
      ...safeObject(options),
      forceEmit:
        true,
    }
  );
}

export function setLoading(value = false) {
  homeState.loading =
    safeBoolean(value, false);

  if (homeState.loading) {
    homeState.refreshing =
      false;
  }

  return patchHomeState(
    {
      loading:
        homeState.loading,

      refreshing:
        homeState.refreshing,
    },
    {
      type:
        "loading",
      emitUnchanged:
        true,
    }
  );
}

export function setRefreshing(value = false) {
  homeState.refreshing =
    safeBoolean(value, false);

  if (homeState.refreshing) {
    homeState.loading =
      false;
  }

  return patchHomeState(
    {
      refreshing:
        homeState.refreshing,

      loading:
        homeState.loading,
    },
    {
      type:
        "refreshing",
      emitUnchanged:
        true,
    }
  );
}

export function setLoaded(value = true) {
  homeState.loaded =
    safeBoolean(value, true);

  if (homeState.loaded) {
    homeState.loading =
      false;

    homeState.refreshing =
      false;
  }

  return patchHomeState(
    {
      loaded:
        homeState.loaded,

      loading:
        homeState.loading,

      refreshing:
        homeState.refreshing,
    },
    {
      type:
        "loaded",
      emitUnchanged:
        true,
    }
  );
}

export function setHydrated(value = true) {
  homeState.hydrated =
    safeBoolean(value, true);

  return patchHomeState(
    {
      hydrated:
        homeState.hydrated,
    },
    {
      type:
        "hydrated",
      emitUnchanged:
        true,
    }
  );
}

export function setError(error = null) {
  const normalized =
    normalizeError(error);

  homeState.lastError =
    normalized;

  homeState.error =
    normalized
      ? normalized.message
      : "";

  if (normalized) {
    homeState.loading =
      false;

    homeState.refreshing =
      false;
  }

  return patchHomeState(
    {
      error:
        homeState.error,

      lastError:
        homeState.lastError,

      loading:
        homeState.loading,

      refreshing:
        homeState.refreshing,
    },
    {
      type:
        "error",
      emitUnchanged:
        true,
    }
  );
}

export function clearHomeError() {
  return setError(null);
}

export function setDashboard(dashboard = {}, options = {}) {
  const incoming =
    safeObject(dashboard);

  if (
    !hasOwnKeys(incoming) &&
    options?.replace !== true &&
    hasOwnKeys(homeState.dashboard)
  ) {
    return emitStateChanged(
      "dashboard",
      {},
      {
        emitUnchanged:
          true,
      }
    );
  }

  homeState.dashboard =
    options?.replace === true
      ? incoming
      : {
          ...safeObject(homeState.dashboard),
          ...incoming,
        };

  const summary =
    first(
      incoming.summary,
      incoming.stats,
      incoming.metrics,
      incoming.totals,
      incoming.counts,
      null
    );

  if (hasOwnKeys(summary)) {
    homeState.summary = {
      ...safeObject(homeState.summary),
      ...safeObject(summary),
    };
  }

  const widgets =
    first(
      incoming.widgets,
      incoming.cards,
      incoming.kpis,
      null
    );

  if (
    Array.isArray(widgets) &&
    (
      widgets.length ||
      options?.replace === true ||
      !homeState.widgets.length
    )
  ) {
    homeState.widgets =
      widgets;
  }

  const tickets =
    first(
      incoming.tickets,
      incoming.incidencias,
      null
    );

  if (
    Array.isArray(tickets) &&
    (
      tickets.length ||
      options?.replace === true ||
      !homeState.tickets.length
    )
  ) {
    homeState.tickets =
      tickets;
  }

  const invoices =
    first(
      incoming.invoices,
      incoming.facturas,
      null
    );

  if (
    Array.isArray(invoices) &&
    (
      invoices.length ||
      options?.replace === true ||
      !homeState.invoices.length
    )
  ) {
    homeState.invoices =
      invoices;
  }

  const users =
    first(
      incoming.users,
      incoming.usuarios,
      null
    );

  if (
    Array.isArray(users) &&
    (
      users.length ||
      options?.replace === true ||
      !homeState.users.length
    )
  ) {
    homeState.users =
      users;
  }

  const clients =
    first(
      incoming.clients,
      incoming.clientes,
      incoming.customers,
      null
    );

  if (
    Array.isArray(clients) &&
    (
      clients.length ||
      options?.replace === true ||
      !homeState.clients.length
    )
  ) {
    homeState.clients =
      clients;
  }

  const activity =
    first(
      incoming.activity,
      incoming.activities,
      incoming.recent,
      incoming.recentActivity,
      null
    );

  if (
    Array.isArray(activity) &&
    (
      activity.length ||
      options?.replace === true ||
      !homeState.activity.length
    )
  ) {
    homeState.activity =
      activity;
  }

  homeState.lastUpdatedAt =
    safeText(
      first(
        incoming.updatedAt,
        incoming.generatedAt,
        incoming.lastSyncAt,
        homeState.lastUpdatedAt,
        nowIso()
      ),
      nowIso()
    );

  return patchHomeState(
    {
      dashboard:
        homeState.dashboard,
    },
    {
      type:
        "dashboard",
      replace:
        options?.replace === true,
      emitUnchanged:
        true,
    }
  );
}

export function setSummary(summary = {}, options = {}) {
  const incoming =
    safeObject(summary);

  if (
    !hasOwnKeys(incoming) &&
    options?.replace !== true &&
    hasOwnKeys(homeState.summary)
  ) {
    return emitStateChanged(
      "summary",
      {},
      {
        emitUnchanged:
          true,
        forceEmit:
          false,
      }
    );
  }

  homeState.summary =
    normalizeSummaryAliases(
      options?.replace === true
        ? incoming
        : {
            ...safeObject(homeState.summary),
            ...incoming,
          }
    );

  return patchHomeState(
    {
      summary:
        homeState.summary,
    },
    {
      type:
        "summary",
      replace:
        options?.replace === true,
      emitUnchanged:
        true,
    }
  );
}

export function setWidgets(widgets = [], options = {}) {
  const items =
    safeArray(widgets);

  if (
    !items.length &&
    options?.replace !== true &&
    homeState.widgets.length
  ) {
    return emitStateChanged(
      "widgets",
      {},
      {
        emitUnchanged:
          true,
        forceEmit:
          false,
      }
    );
  }

  homeState.widgets =
    items;

  return patchHomeState(
    {
      widgets:
        homeState.widgets,
    },
    {
      type:
        "widgets",
      replace:
        options?.replace === true,
      emitUnchanged:
        true,
    }
  );
}

export function setTickets(tickets = [], options = {}) {
  const items =
    safeArray(tickets);

  if (
    !items.length &&
    options?.replace !== true &&
    homeState.tickets.length
  ) {
    return emitStateChanged(
      "patch",
      {},
      {
        emitUnchanged:
          true,
        forceEmit:
          false,
      }
    );
  }

  homeState.tickets =
    items;

  homeState.ticketsRemoteCount =
    Math.max(
      items.length,
      safeNumber(
        options?.remoteCount,
        homeState.ticketsRemoteCount
      )
    );

  homeState.remoteCount =
    Math.max(
      homeState.remoteCount,
      homeState.ticketsRemoteCount
    );

  return patchHomeState(
    {
      tickets:
        homeState.tickets,

      ticketsRemoteCount:
        homeState.ticketsRemoteCount,

      remoteCount:
        homeState.remoteCount,
    },
    {
      type:
        "patch",
      replace:
        options?.replace === true,
    }
  );
}

export function setInvoices(invoices = [], options = {}) {
  const items =
    safeArray(invoices);

  if (
    !items.length &&
    options?.replace !== true &&
    homeState.invoices.length
  ) {
    return emitStateChanged(
      "patch",
      {},
      {
        emitUnchanged:
          true,
          forceEmit:
            false,
      }
    );
  }

  homeState.invoices =
    items;

  homeState.invoicesRemoteCount =
    Math.max(
      items.length,
      safeNumber(
        options?.remoteCount,
        homeState.invoicesRemoteCount
      )
    );

  return patchHomeState(
    {
      invoices:
        homeState.invoices,

      invoicesRemoteCount:
        homeState.invoicesRemoteCount,
    },
    {
      type:
        "patch",
      replace:
        options?.replace === true,
    }
  );
}

export function setUsers(users = [], options = {}) {
  const items =
    safeArray(users);

  if (
    !items.length &&
    options?.replace !== true &&
    homeState.users.length
  ) {
    return emitStateChanged(
      "patch",
      {},
      {
        emitUnchanged:
          true,
          forceEmit:
            false,
      }
    );
  }

  homeState.users =
    items;

  homeState.usersRemoteCount =
    Math.max(
      items.length,
      safeNumber(
        options?.remoteCount,
        homeState.usersRemoteCount
      )
    );

  return patchHomeState(
    {
      users:
        homeState.users,

      usersRemoteCount:
        homeState.usersRemoteCount,
    },
    {
      type:
        "patch",
      replace:
        options?.replace === true,
    }
  );
}

export function setClients(clients = [], options = {}) {
  const items =
    safeArray(clients);

  if (
    !items.length &&
    options?.replace !== true &&
    homeState.clients.length
  ) {
    return emitStateChanged(
      "patch",
      {},
      {
        emitUnchanged:
          true,
          forceEmit:
            false,
      }
    );
  }

  homeState.clients =
    items;

  homeState.clientsRemoteCount =
    Math.max(
      items.length,
      safeNumber(
        options?.remoteCount,
        homeState.clientsRemoteCount
      )
    );

  return patchHomeState(
    {
      clients:
        homeState.clients,

      clientsRemoteCount:
        homeState.clientsRemoteCount,
    },
    {
      type:
        "patch",
      replace:
        options?.replace === true,
    }
  );
}

export function setRecent(recent = [], options = {}) {
  const items =
    safeArray(recent);

  if (
    !items.length &&
    options?.replace !== true &&
    homeState.activity.length
  ) {
    return emitStateChanged(
      "recent",
      {},
      {
        emitUnchanged:
          true,
          forceEmit:
            false,
      }
    );
  }

  homeState.activity =
    items;

  homeState.activityRemoteCount =
    Math.max(
      items.length,
      safeNumber(
        options?.remoteCount,
        homeState.activityRemoteCount
      )
    );

  return patchHomeState(
    {
      activity:
        homeState.activity,

      activityRemoteCount:
        homeState.activityRemoteCount,
    },
    {
      type:
        "recent",
      replace:
        options?.replace === true,
      emitUnchanged:
        true,
    }
  );
}

export function setLastSyncAt(value = null) {
  const next =
    value instanceof Date
      ? value.toISOString()
      : safeText(value, "");

  homeState.lastSyncAt =
    next || nowIso();

  homeState.lastUpdatedAt =
    homeState.lastSyncAt;

  return patchHomeState(
    {
      lastSyncAt:
        homeState.lastSyncAt,

      lastUpdatedAt:
        homeState.lastUpdatedAt,
    },
    {
      type:
        "patch",
      emitUnchanged:
        true,
    }
  );
}

export function setRequestId(value = "") {
  homeState.requestId =
    safeText(value, "");

  return patchHomeState(
    {
      requestId:
        homeState.requestId,
    },
    {
      type:
        "patch",
      emitUnchanged:
        true,
    }
  );
}

export function setHealth(value = null) {
  homeState.health =
    value === null
      ? null
      : safeObject(value, value);

  return patchHomeState(
    {
      health:
        homeState.health,
    },
    {
      type:
        "health",
      emitUnchanged:
        true,
    }
  );
}

export function setPage(page = DEFAULT_PAGE) {
  homeState.page =
    Math.max(
      1,
      safeNumber(page, DEFAULT_PAGE)
    );

  return patchHomeState(
    {
      page:
        homeState.page,
    },
    {
      type:
        "patch",
    }
  );
}

export function setPageSize(pageSize = DEFAULT_PAGE_SIZE) {
  homeState.pageSize =
    Math.max(
      1,
      safeNumber(pageSize, DEFAULT_PAGE_SIZE)
    );

  homeState.page =
    DEFAULT_PAGE;

  return patchHomeState(
    {
      page:
        homeState.page,

      pageSize:
        homeState.pageSize,
    },
    {
      type:
        "patch",
    }
  );
}

export function setOpeningTicketId(ticketId = "") {
  homeState.openingTicketId =
    safeText(ticketId, "");

  homeState.selectedTicketId =
    homeState.openingTicketId ||
    homeState.selectedTicketId;

  return patchHomeState(
    {
      openingTicketId:
        homeState.openingTicketId,

      selectedTicketId:
        homeState.selectedTicketId,
    },
    {
      type:
        "patch",
      emitUnchanged:
        true,
    }
  );
}

export function setSelectedTicketId(ticketId = "") {
  homeState.selectedTicketId =
    safeText(ticketId, "");

  return patchHomeState(
    {
      selectedTicketId:
        homeState.selectedTicketId,
    },
    {
      type:
        "patch",
      emitUnchanged:
        true,
    }
  );
}

export function setCreating(value = false) {
  homeState.creating =
    safeBoolean(value, false);

  return patchHomeState(
    {
      creating:
        homeState.creating,
    },
    {
      type:
        "patch",
      emitUnchanged:
        true,
    }
  );
}

export function setNavigatingAction(value = "") {
  homeState.navigatingAction =
    safeText(value, "");

  return patchHomeState(
    {
      navigatingAction:
        homeState.navigatingAction,
    },
    {
      type:
        "patch",
      emitUnchanged:
        true,
    }
  );
}

/* =========================================================
   BULK SYNC
========================================================= */

export function syncHomeStateFromDashboard(dashboard = {}, options = {}) {
  const raw =
    safeObject(dashboard);

  if (!hasOwnKeys(raw)) {
    return patchHomeState(
      {},
      {
        type:
          "dashboard",
        emitUnchanged:
          true,
      }
    );
  }

  setDashboard(
    raw,
    {
      replace:
        options?.replace === true,
    }
  );

  setSummary(
    first(
      raw.summary,
      raw.stats,
      raw.metrics,
      raw.totals,
      raw.counts,
      {}
    ),
    {
      replace:
        options?.replace === true,
    }
  );

  setWidgets(
    first(
      raw.widgets,
      raw.cards,
      raw.kpis,
      []
    ),
    {
      replace:
        options?.replace === true,
    }
  );

  setTickets(
    first(
      raw.tickets,
      raw.incidencias,
      []
    ),
    {
      replace:
        options?.replace === true,
      remoteCount:
        first(
          raw.ticketsTotal,
          raw.incidenciasTotal,
          raw.totalTickets,
          raw.totalIncidencias,
          raw.summary?.totalTickets,
          raw.summary?.incidenciasTotal,
          0
        ),
    }
  );

  setInvoices(
    first(
      raw.invoices,
      raw.facturas,
      []
    ),
    {
      replace:
        options?.replace === true,
      remoteCount:
        first(
          raw.invoicesTotal,
          raw.facturasTotal,
          raw.totalInvoices,
          raw.totalFacturas,
          raw.summary?.totalInvoices,
          raw.summary?.facturasTotal,
          0
        ),
    }
  );

  setUsers(
    first(
      raw.users,
      raw.usuarios,
      []
    ),
    {
      replace:
        options?.replace === true,
      remoteCount:
        first(
          raw.usersTotal,
          raw.usuariosTotal,
          raw.totalUsers,
          raw.totalUsuarios,
          raw.summary?.usersCount,
          raw.summary?.usuariosCount,
          0
        ),
    }
  );

  setClients(
    first(
      raw.clients,
      raw.clientes,
      raw.customers,
      []
    ),
    {
      replace:
        options?.replace === true,
      remoteCount:
        first(
          raw.clientsTotal,
          raw.clientesTotal,
          raw.customersTotal,
          raw.totalClients,
          raw.totalClientes,
          raw.totalCustomers,
          raw.summary?.clientsCount,
          raw.summary?.clientesCount,
          0
        ),
    }
  );

  setRecent(
    first(
      raw.activity,
      raw.activities,
      raw.recent,
      raw.recentActivity,
      []
    ),
    {
      replace:
        options?.replace === true,
    }
  );

  setRequestId(
    first(
      options?.requestId,
      raw.requestId,
      raw.meta?.requestId,
      homeState.requestId,
      ""
    )
  );

  setLastSyncAt(
    first(
      options?.lastSyncAt,
      raw.lastSyncAt,
      raw.updatedAt,
      raw.generatedAt,
      raw.meta?.updatedAt,
      nowIso()
    )
  );

  setLoaded(true);
  setHydrated(true);
  clearHomeError();

  return emitStateChanged(
    "dashboard",
    {
      dashboard:
        raw,
    },
    {
      forceEmit:
        true,
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
      version:
        homeState.version,

      hydrated:
        homeState.hydrated,

      loaded:
        homeState.loaded,

      loading:
        homeState.loading,

      refreshing:
        homeState.refreshing,

      creating:
        homeState.creating,

      openingTicketId:
        homeState.openingTicketId,

      selectedTicketId:
        homeState.selectedTicketId,

      navigatingAction:
        homeState.navigatingAction,

      error:
        homeState.error,

      lastError:
        homeState.lastError,

      page:
        homeState.page,

      pageSize:
        homeState.pageSize,

      remoteCount:
        homeState.remoteCount,

      totalCount:
        homeState.totalCount,

      ticketsRemoteCount:
        homeState.ticketsRemoteCount,

      invoicesRemoteCount:
        homeState.invoicesRemoteCount,

      usersRemoteCount:
        homeState.usersRemoteCount,

      clientsRemoteCount:
        homeState.clientsRemoteCount,

      activityRemoteCount:
        homeState.activityRemoteCount,

      requestId:
        homeState.requestId,

      lastSyncAt:
        homeState.lastSyncAt,

      lastUpdatedAt:
        homeState.lastUpdatedAt,

      dashboard:
        homeState.dashboard,

      summary:
        homeState.summary,

      stats:
        homeState.stats,

      metrics:
        homeState.metrics,

      totals:
        homeState.totals,

      counts:
        homeState.counts,

      widgets:
        homeState.widgets,

      cards:
        homeState.cards,

      kpis:
        homeState.kpis,

      tickets:
        homeState.tickets,

      incidencias:
        homeState.incidencias,

      invoices:
        homeState.invoices,

      facturas:
        homeState.facturas,

      users:
        homeState.users,

      usuarios:
        homeState.usuarios,

      clients:
        homeState.clients,

      clientes:
        homeState.clientes,

      customers:
        homeState.customers,

      activity:
        homeState.activity,

      activities:
        homeState.activities,

      recent:
        homeState.recent,

      recentActivity:
        homeState.recentActivity,

      health:
        homeState.health,

      meta:
        homeState.meta,

      countsInfo: {
        widgets:
          homeState.widgets.length,

        tickets:
          homeState.tickets.length,

        invoices:
          homeState.invoices.length,

        users:
          homeState.users.length,

        clients:
          homeState.clients.length,

        activity:
          homeState.activity.length,
      },

      recentMutations:
        homeState.recentMutations,
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
    version:
      HOME_STATE_VERSION,

    scope:
      HOME_STATE_SCOPE,

    signature:
      getStateSignature(),

    lastStateSignature,

    lastEmitAt,

    lastEmitAtIso:
      lastEmitAt
        ? new Date(lastEmitAt).toISOString()
        : "",

    hasAppCore:
      Boolean(AppCore),

    hasEventBus:
      Boolean(AppCore?.events?.emit),

    state:
      getHomeStateSnapshot(),
  };
}

export function exposeHomeStateDebugApi() {
  const api = {
    version:
      HOME_STATE_VERSION,

    state:
      homeState,

    getState:
      getHomeState,

    getSnapshot:
      getHomeStateSnapshot,

    getDebugSnapshot:
      getHomeStateDebugSnapshot,

    patch:
      patchHomeState,

    replace:
      replaceHomeState,

    reset:
      resetHomeState,

    setLoading,
    setRefreshing,
    setLoaded,
    setHydrated,
    setError,
    clearError:
      clearHomeError,

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
    if (AppCore) {
      if (!AppCore.modules && Object.isExtensible(AppCore)) {
        AppCore.modules = {};
      }

      if (AppCore.modules && typeof AppCore.modules === "object") {
        AppCore.modules.HomeState =
          api;

        AppCore.modules.homeState =
          api;
      }

      if (Object.isExtensible(AppCore)) {
        AppCore.HomeState =
          api;
      }
    }
  } catch {}

  try {
    if (isBrowser()) {
      window.OnionHomeState =
        api;
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

export const HomeState =
  Object.freeze({
    version:
      HOME_STATE_VERSION,

    events:
      HOME_STATE_EVENTS,

    state:
      homeState,

    createInitialState:
      createInitialHomeState,

    normalize:
      normalizeHomeState,

    patch:
      patchHomeState,

    replace:
      replaceHomeState,

    reset:
      resetHomeState,

    syncFromDashboard:
      syncHomeStateFromDashboard,

    setLoading,
    setRefreshing,
    setLoaded,
    setHydrated,

    setError,
    clearError:
      clearHomeError,

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

    getState:
      getHomeState,

    getSnapshot:
      getHomeStateSnapshot,

    getDebugSnapshot:
      getHomeStateDebugSnapshot,

    getDashboard:
      getHomeDashboard,

    getSummary:
      getHomeSummary,

    getWidgets:
      getHomeWidgets,

    getTickets:
      getHomeTickets,

    getInvoices:
      getHomeInvoices,

    getUsers:
      getHomeUsers,

    getClients:
      getHomeClients,

    getActivity:
      getHomeActivity,

    isLoading:
      isHomeLoading,

    isRefreshing:
      isHomeRefreshing,

    isLoaded:
      isHomeLoaded,

    isHydrated:
      isHomeHydrated,

    hasError:
      hasHomeError,

    exposeDebugApi:
      exposeHomeStateDebugApi,
  });

export default HomeState;
