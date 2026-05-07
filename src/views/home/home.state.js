/* =========================================================
   Onion SPA - Home State
   Archivo: src/views/home/home.state.js

   ONION SUPPORT · HOME STATE
   SINGLE SOURCE OF VIEW STATE · APPCORE SAFE · NO CSS · 10/10

   RESPONSABILIDADES:
   - Centralizar el estado mutable del módulo Home.
   - Exponer setters estables para home.api.js y HomeView.js.
   - Mantener dashboard / summary / widgets / recent coherentes.
   - Mantener flags loading / refreshing / loaded / hydrated.
   - Mantener requestId / lastSyncAt / health / error.
   - Emitir eventos seguros sin duplicar bus + window salvo fallback.
   - Permitir snapshot de diagnóstico sin tokens.
   - Evitar ciclos con home.api.js y home.store.js.
   - No renderizar, no tocar CSS, no manipular DOM.
   - Integrarse con AppCore.modules para debug/control.

   CONTRATO PRINCIPAL:
   export const homeState
   export function setLoading()
   export function setRefreshing()
   export function setError()
   export function setDashboard()
   export function setWidgets()
   export function setSummary()
   export function setRecent()
   export function setLastSyncAt()
   export function setLoaded()
   export function setRequestId()
   export function setHealth()
   export function setHydrated()

   EXTRA:
   - patchHomeState()
   - replaceHomeState()
   - resetHomeState()
   - getHomeStateSnapshot()
   - subscribeHomeState()
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const HOME_STATE_VERSION =
  "10.0.0";

const SOURCE =
  "views:home:state";

const DEFAULT_PAGE_SIZE =
  5;

const MAX_RECENT_STATE_EVENTS =
  50;

const SENSITIVE_PARAM_NAMES =
  Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "resetToken",
    "passwordResetToken",
    "confirmToken",
    "code",
    "t",
    "access_token",
    "refresh_token",
    "id_token",
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "twoFactorToken",
    "two_factor_token",
    "mfaToken",
    "mfa_token",
  ]);

export const HOME_STATE_EVENTS =
  Object.freeze({
    change:
      "home:state:change",

    reset:
      "home:state:reset",

    replace:
      "home:state:replace",

    patch:
      "home:state:patch",

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

    request:
      "home:state:request",

    health:
      "home:state:health",
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
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  if (typeof value === "string") {
    let normalized =
      value
        .trim()
        .replace(/€/g, "")
        .replace(/\$/g, "")
        .replace(/£/g, "")
        .replace(/%/g, "")
        .replace(/[^\d.,+\-\s]/g, "")
        .replace(/\s/g, "");

    const hasComma =
      normalized.includes(",");

    const hasDot =
      normalized.includes(".");

    if (
      hasComma &&
      hasDot
    ) {
      const lastComma =
        normalized.lastIndexOf(",");

      const lastDot =
        normalized.lastIndexOf(".");

      normalized =
        lastComma > lastDot
          ? normalized.replace(/\./g, "").replace(/,/g, ".")
          : normalized.replace(/,/g, "");
    } else if (hasComma) {
      normalized =
        normalized.replace(/,/g, ".");
    }

    const parsed =
      Number(normalized);

    return Number.isFinite(parsed)
      ? parsed
      : fallback;
  }

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

function safeAssign(target, payload) {
  try {
    if (
      target &&
      typeof target === "object"
    ) {
      Object.assign(
        target,
        safeObject(payload)
      );

      return true;
    }
  } catch {}

  return false;
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
    target[key] =
      value;

    return true;
  } catch {}

  return false;
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

/* =========================================================
   REDACTION / SANITIZE
========================================================= */

function redactSensitiveText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  for (const name of SENSITIVE_PARAM_NAMES) {
    try {
      const escaped =
        String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      output =
        output.replace(
          new RegExp(`([?&#]${escaped}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
    } catch {}
  }

  try {
    output =
      output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /(authorization["'\s:=]+)(Bearer\s+)?([A-Za-z0-9._~+/=-]+)/gi,
        "$1$2***"
      );
  } catch {}

  return output;
}

function sanitizePayload(value, depth = 0) {
  if (depth > 6) {
    return "[MaxDepth]";
  }

  if (typeof value === "string") {
    return redactSensitiveText(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name:
        safeText(value.name, "Error"),

      message:
        redactSensitiveText(value.message || ""),

      code:
        value.code || null,

      status:
        value.status || value.statusCode || null,

      stack:
        value.stack
          ? redactSensitiveText(value.stack)
          : "",
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 150)
      .map((item) =>
        sanitizePayload(item, depth + 1)
      );
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (
        /token|secret|password|authorization|credential/i.test(key) &&
        item
      ) {
        output[key] =
          "***";
        continue;
      }

      output[key] =
        sanitizePayload(item, depth + 1);
    }

    return output;
  }

  return String(value);
}

/* =========================================================
   RUNTIME
========================================================= */

const subscribers =
  new Set();

const runtime = {
  initialized:
    false,

  changeCount:
    0,

  lastEvent:
    "",

  lastReason:
    "",

  lastChangedAt:
    "",

  lastChangedAtMs:
    0,

  lastSignature:
    "",

  recent:
    [],
};

/* =========================================================
   INITIAL STATE
========================================================= */

function createInitialHomeState() {
  return {
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

    page:
      1,

    pageSize:
      DEFAULT_PAGE_SIZE,

    remoteCount:
      0,

    ticketsRemoteCount:
      0,

    invoicesRemoteCount:
      0,

    usersRemoteCount:
      0,

    clientsRemoteCount:
      0,

    requestId:
      "",

    lastSyncAt:
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

    health:
      null,

    meta:
      {},

    updatedAt:
      "",

    createdAt:
      nowIso(),
  };
}

export const homeState =
  createInitialHomeState();

/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeSummaryAliases(summary = {}) {
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

    activeUsers:
      Math.max(
        usersCount,
        safeNumber(input.activeUsers, 0)
      ),

    usuariosActivos:
      Math.max(
        usersCount,
        safeNumber(first(input.usuariosActivos, input.activeUsers, 0), 0)
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
        safeNumber(input.activeClients, 0)
      ),

    clientesActivos:
      Math.max(
        clientsCount,
        safeNumber(first(input.clientesActivos, input.activeClients, 0), 0)
      ),
  };
}

function normalizeDashboardAliases(dashboard = {}, summary = {}) {
  const input =
    safeObject(dashboard);

  const finalSummary =
    normalizeSummaryAliases(
      hasOwnKeys(summary)
        ? summary
        : first(
            input.summary,
            input.stats,
            input.metrics,
            input.totals,
            input.counts,
            {}
          )
    );

  return {
    ...input,

    summary:
      finalSummary,

    stats:
      finalSummary,

    metrics:
      finalSummary,

    totals:
      finalSummary,

    counts:
      finalSummary,

    widgets:
      safeArray(first(input.widgets, input.cards, input.kpis, [])),

    cards:
      safeArray(first(input.cards, input.widgets, input.kpis, [])),

    kpis:
      safeArray(first(input.kpis, input.widgets, input.cards, [])),

    tickets:
      safeArray(first(input.tickets, input.incidencias, [])),

    incidencias:
      safeArray(first(input.incidencias, input.tickets, [])),

    invoices:
      safeArray(first(input.invoices, input.facturas, [])),

    facturas:
      safeArray(first(input.facturas, input.invoices, [])),

    users:
      safeArray(first(input.users, input.usuarios, [])),

    usuarios:
      safeArray(first(input.usuarios, input.users, [])),

    clients:
      safeArray(first(input.clients, input.clientes, input.customers, [])),

    clientes:
      safeArray(first(input.clientes, input.clients, input.customers, [])),

    customers:
      safeArray(first(input.customers, input.clients, input.clientes, [])),

    recent:
      safeArray(first(input.recent, input.recentActivity, input.activity, [])),

    recentActivity:
      safeArray(first(input.recentActivity, input.recent, input.activity, [])),

    activity:
      safeArray(first(input.activity, input.recentActivity, input.recent, [])),
  };
}

function ensureHomeStateAliases() {
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

  homeState.dashboard =
    normalizeDashboardAliases(
      homeState.dashboard,
      homeState.summary
    );

  homeState.widgets =
    safeArray(
      first(
        homeState.widgets,
        homeState.dashboard.widgets,
        []
      )
    );

  homeState.cards =
    homeState.widgets;

  homeState.kpis =
    homeState.widgets;

  homeState.tickets =
    safeArray(
      first(
        homeState.tickets,
        homeState.incidencias,
        homeState.dashboard.tickets,
        homeState.dashboard.incidencias,
        []
      )
    );

  homeState.incidencias =
    homeState.tickets;

  homeState.invoices =
    safeArray(
      first(
        homeState.invoices,
        homeState.facturas,
        homeState.dashboard.invoices,
        homeState.dashboard.facturas,
        []
      )
    );

  homeState.facturas =
    homeState.invoices;

  homeState.users =
    safeArray(
      first(
        homeState.users,
        homeState.usuarios,
        homeState.dashboard.users,
        homeState.dashboard.usuarios,
        []
      )
    );

  homeState.usuarios =
    homeState.users;

  homeState.clients =
    safeArray(
      first(
        homeState.clients,
        homeState.clientes,
        homeState.customers,
        homeState.dashboard.clients,
        homeState.dashboard.clientes,
        homeState.dashboard.customers,
        []
      )
    );

  homeState.clientes =
    homeState.clients;

  homeState.customers =
    homeState.clients;

  homeState.recent =
    safeArray(
      first(
        homeState.recent,
        homeState.recentActivity,
        homeState.activity,
        homeState.dashboard.recent,
        homeState.dashboard.recentActivity,
        homeState.dashboard.activity,
        []
      )
    );

  homeState.recentActivity =
    homeState.recent;

  homeState.activity =
    safeArray(
      first(
        homeState.activity,
        homeState.recent,
        homeState.recentActivity,
        []
      )
    );

  homeState.ticketsRemoteCount =
    Math.max(
      safeNumber(homeState.ticketsRemoteCount, 0),
      safeNumber(homeState.summary.totalTickets, 0),
      homeState.tickets.length
    );

  homeState.invoicesRemoteCount =
    Math.max(
      safeNumber(homeState.invoicesRemoteCount, 0),
      safeNumber(homeState.summary.totalInvoices, 0),
      homeState.invoices.length
    );

  homeState.usersRemoteCount =
    Math.max(
      safeNumber(homeState.usersRemoteCount, 0),
      safeNumber(homeState.summary.usersCount, 0),
      homeState.users.length
    );

  homeState.clientsRemoteCount =
    Math.max(
      safeNumber(homeState.clientsRemoteCount, 0),
      safeNumber(homeState.summary.clientsCount, 0),
      homeState.clients.length
    );

  homeState.remoteCount =
    Math.max(
      safeNumber(homeState.remoteCount, 0),
      homeState.ticketsRemoteCount,
      homeState.tickets.length
    );

  homeState.page =
    Math.max(
      1,
      Math.trunc(
        safeNumber(homeState.page, 1)
      )
    );

  homeState.pageSize =
    Math.max(
      1,
      Math.trunc(
        safeNumber(homeState.pageSize, DEFAULT_PAGE_SIZE)
      )
    );

  homeState.loading =
    Boolean(homeState.loading);

  homeState.refreshing =
    Boolean(homeState.refreshing);

  homeState.loaded =
    Boolean(homeState.loaded);

  homeState.hydrated =
    Boolean(homeState.hydrated);

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
    homeState.lastSyncAt || "";

  homeState.meta =
    safeObject(homeState.meta);

  homeState.updatedAt =
    safeText(homeState.updatedAt, "");

  return homeState;
}

/* =========================================================
   SIGNATURE / RECENT
========================================================= */

function getComparableSignature() {
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
      safeNumber(homeState.page, 1),

    pageSize:
      safeNumber(homeState.pageSize, DEFAULT_PAGE_SIZE),

    remoteCount:
      safeNumber(homeState.remoteCount, 0),

    ticketsRemoteCount:
      safeNumber(homeState.ticketsRemoteCount, 0),

    invoicesRemoteCount:
      safeNumber(homeState.invoicesRemoteCount, 0),

    usersRemoteCount:
      safeNumber(homeState.usersRemoteCount, 0),

    clientsRemoteCount:
      safeNumber(homeState.clientsRemoteCount, 0),

    requestId:
      safeText(homeState.requestId, ""),

    lastSyncAt:
      safeText(homeState.lastSyncAt, ""),

    widgets:
      safeArray(homeState.widgets).length,

    recent:
      safeArray(homeState.recent).length,

    tickets:
      safeArray(homeState.tickets).length,

    invoices:
      safeArray(homeState.invoices).length,

    users:
      safeArray(homeState.users).length,

    clients:
      safeArray(homeState.clients).length,
  };

  try {
    return JSON.stringify(data);
  } catch {
    return String(nowMs());
  }
}

function pushRecentStateEvent(entry = {}) {
  const atMs =
    nowMs();

  runtime.recent.unshift({
    source:
      SOURCE,

    ...safeObject(entry),

    at:
      nowIso(),

    atMs,
  });

  if (runtime.recent.length > MAX_RECENT_STATE_EVENTS) {
    runtime.recent =
      runtime.recent.slice(
        0,
        MAX_RECENT_STATE_EVENTS
      );
  }
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

  const opts =
    safeObject(options);

  const finalPayload =
    sanitizePayload({
      source:
        SOURCE,

      version:
        HOME_STATE_VERSION,

      ...safeObject(payload),
    });

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
    opts.window === true ||
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
  for (const subscriber of Array.from(subscribers)) {
    try {
      subscriber(
        homeState,
        payload
      );
    } catch {}
  }
}

function notifyChange({
  event =
    HOME_STATE_EVENTS.change,

  reason =
    "state-change",

  changedKeys =
    [],

  force =
    false,

  emit =
    true,
} = {}) {
  ensureHomeStateAliases();

  const signature =
    getComparableSignature();

  const changed =
    force || signature !== runtime.lastSignature;

  if (!changed) {
    return {
      changed:
        false,

      state:
        homeState,
    };
  }

  runtime.lastSignature =
    signature;

  runtime.changeCount += 1;
  runtime.lastEvent = event;
  runtime.lastReason = reason;
  runtime.lastChangedAt = nowIso();
  runtime.lastChangedAtMs = nowMs();

  const payload = {
    changed:
      true,

    reason,

    event,

    changedKeys:
      safeArray(changedKeys),

    changeCount:
      runtime.changeCount,

    state:
      getHomeStateSnapshot({
        includeData:
          false,
      }),
  };

  pushRecentStateEvent({
    event,
    reason,
    changedKeys:
      safeArray(changedKeys),
  });

  notifySubscribers(payload);

  if (emit !== false) {
    safeEmit(
      event,
      payload
    );

    if (event !== HOME_STATE_EVENTS.change) {
      safeEmit(
        HOME_STATE_EVENTS.change,
        payload
      );
    }
  }

  return {
    changed:
      true,

    payload,

    state:
      homeState,
  };
}

/* =========================================================
   CORE STATE WRITE
========================================================= */

function syncAppCoreState(patch = {}) {
  const payload =
    safeObject(patch);

  if (!hasOwnKeys(payload)) {
    return false;
  }

  try {
    if (isFunction(AppCore?.setState)) {
      AppCore.setState({
        home:
          {
            ...safeObject(AppCore?.state?.home),
            ...payload,
          },
      });
    }
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      AppCore.state.home = {
        ...safeObject(AppCore.state.home),
        ...payload,
      };
    }
  } catch {}

  return true;
}

/* =========================================================
   PUBLIC MUTATORS
========================================================= */

export function patchHomeState(patch = {}, options = {}) {
  const payload =
    safeObject(patch);

  if (!hasOwnKeys(payload)) {
    return homeState;
  }

  safeAssign(
    homeState,
    payload
  );

  ensureHomeStateAliases();

  syncAppCoreState({
    loaded:
      homeState.loaded,

    hydrated:
      homeState.hydrated,

    loading:
      homeState.loading,

    refreshing:
      homeState.refreshing,

    error:
      homeState.error,

    requestId:
      homeState.requestId,

    lastSyncAt:
      homeState.lastSyncAt,
  });

  notifyChange({
    event:
      options.event || HOME_STATE_EVENTS.patch,

    reason:
      options.reason || "patch-home-state",

    changedKeys:
      Object.keys(payload),

    force:
      options.force === true,

    emit:
      options.emit,
  });

  return homeState;
}

export function replaceHomeState(nextState = {}, options = {}) {
  const payload =
    {
      ...createInitialHomeState(),
      ...safeObject(nextState),
    };

  for (const key of Object.keys(homeState)) {
    try {
      delete homeState[key];
    } catch {}
  }

  safeAssign(
    homeState,
    payload
  );

  ensureHomeStateAliases();

  syncAppCoreState({
    loaded:
      homeState.loaded,

    hydrated:
      homeState.hydrated,

    loading:
      homeState.loading,

    refreshing:
      homeState.refreshing,

    error:
      homeState.error,

    requestId:
      homeState.requestId,

    lastSyncAt:
      homeState.lastSyncAt,
  });

  notifyChange({
    event:
      options.event || HOME_STATE_EVENTS.replace,

    reason:
      options.reason || "replace-home-state",

    changedKeys:
      Object.keys(payload),

    force:
      true,

    emit:
      options.emit,
  });

  return homeState;
}

export function resetHomeState(options = {}) {
  return replaceHomeState(
    createInitialHomeState(),
    {
      event:
        HOME_STATE_EVENTS.reset,

      reason:
        options.reason || "reset-home-state",

      emit:
        options.emit,

      force:
        true,
    }
  );
}

/* =========================================================
   REQUIRED SETTERS FOR HOME API
========================================================= */

export function setLoading(value = false, options = {}) {
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
      event:
        HOME_STATE_EVENTS.loading,

      reason:
        options.reason || "set-loading",

      emit:
        options.emit,
    }
  );
}

export function setRefreshing(value = false, options = {}) {
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
      event:
        HOME_STATE_EVENTS.refreshing,

      reason:
        options.reason || "set-refreshing",

      emit:
        options.emit,
      }
  );
}

export function setError(value = null, options = {}) {
  const message =
    value
      ? safeText(
          value?.message || value,
          "Error del Home."
        )
      : "";

  return patchHomeState(
    {
      error:
        message,
    },
    {
      event:
        HOME_STATE_EVENTS.error,

      reason:
        options.reason || "set-error",

      emit:
        options.emit,
    }
  );
}

export function setDashboard(value = {}, options = {}) {
  const dashboard =
    normalizeDashboardAliases(
      safeObject(value),
      first(
        value?.summary,
        value?.stats,
        value?.metrics,
        value?.totals,
        value?.counts,
        homeState.summary,
        {}
      )
    );

  return patchHomeState(
    {
      dashboard,

      summary:
        dashboard.summary,

      stats:
        dashboard.summary,

      metrics:
        dashboard.summary,

      totals:
        dashboard.summary,

      counts:
        dashboard.summary,

      widgets:
        safeArray(dashboard.widgets),

      cards:
        safeArray(dashboard.widgets),

      kpis:
        safeArray(dashboard.widgets),

      tickets:
        safeArray(dashboard.tickets),

      incidencias:
        safeArray(dashboard.tickets),

      invoices:
        safeArray(dashboard.invoices),

      facturas:
        safeArray(dashboard.invoices),

      users:
        safeArray(dashboard.users),

      usuarios:
        safeArray(dashboard.users),

      clients:
        safeArray(dashboard.clients),

      clientes:
        safeArray(dashboard.clients),

      customers:
        safeArray(dashboard.clients),

      recent:
        safeArray(dashboard.recent),

      recentActivity:
        safeArray(dashboard.recent),

      activity:
        safeArray(dashboard.activity),
    },
    {
      event:
        HOME_STATE_EVENTS.dashboard,

      reason:
        options.reason || "set-dashboard",

      emit:
        options.emit,
    }
  );
}

export function setWidgets(value = [], options = {}) {
  const widgets =
    safeArray(value);

  return patchHomeState(
    {
      widgets,
      cards:
        widgets,

      kpis:
        widgets,
    },
    {
      event:
        HOME_STATE_EVENTS.widgets,

      reason:
        options.reason || "set-widgets",

      emit:
        options.emit,
    }
  );
}

export function setSummary(value = {}, options = {}) {
  const summary =
    normalizeSummaryAliases(value);

  return patchHomeState(
    {
      summary,

      stats:
        summary,

      metrics:
        summary,

      totals:
        summary,

      counts:
        summary,
    },
    {
      event:
        HOME_STATE_EVENTS.summary,

      reason:
        options.reason || "set-summary",

      emit:
        options.emit,
    }
  );
}

export function setRecent(value = [], options = {}) {
  const recent =
    safeArray(value);

  return patchHomeState(
    {
      recent,
      recentActivity:
        recent,

      activity:
        safeArray(
          first(
            options.activity,
            homeState.activity,
            recent
          )
        ),
    },
    {
      event:
        HOME_STATE_EVENTS.recent,

      reason:
        options.reason || "set-recent",

      emit:
        options.emit,
    }
  );
}

export function setLastSyncAt(value = null, options = {}) {
  const lastSyncAt =
    value
      ? value
      : nowIso();

  return patchHomeState(
    {
      lastSyncAt,
      updatedAt:
        typeof lastSyncAt === "number"
          ? new Date(lastSyncAt).toISOString()
          : safeText(lastSyncAt, nowIso()),
    },
    {
      event:
        HOME_STATE_EVENTS.request,

      reason:
        options.reason || "set-last-sync-at",

      emit:
        options.emit,
    }
  );
}

export function setLoaded(value = true, options = {}) {
  return patchHomeState(
    {
      loaded:
        safeBoolean(value, true),
    },
    {
      event:
        HOME_STATE_EVENTS.loaded,

      reason:
        options.reason || "set-loaded",

      emit:
        options.emit,
    }
  );
}

export function setRequestId(value = "", options = {}) {
  return patchHomeState(
    {
      requestId:
        safeText(value, ""),
    },
    {
      event:
        HOME_STATE_EVENTS.request,

      reason:
        options.reason || "set-request-id",

      emit:
        options.emit,
    }
  );
}

export function setHealth(value = null, options = {}) {
  return patchHomeState(
    {
      health:
        value === null
          ? null
          : safeObject(value),
    },
    {
      event:
        HOME_STATE_EVENTS.health,

      reason:
        options.reason || "set-health",

      emit:
        options.emit,
    }
  );
}

export function setHydrated(value = true, options = {}) {
  return patchHomeState(
    {
      hydrated:
        safeBoolean(value, true),
    },
    {
      event:
        HOME_STATE_EVENTS.hydrated,

      reason:
        options.reason || "set-hydrated",

      emit:
        options.emit,
    }
  );
}

/* =========================================================
   EXTRA SETTERS
========================================================= */

export function setTickets(value = [], options = {}) {
  const tickets =
    safeArray(value);

  return patchHomeState(
    {
      tickets,
      incidencias:
        tickets,

      ticketsRemoteCount:
        Math.max(
          safeNumber(homeState.ticketsRemoteCount, 0),
          tickets.length
        ),

      remoteCount:
        Math.max(
          safeNumber(homeState.remoteCount, 0),
          tickets.length
        ),
    },
    {
      event:
        options.event || HOME_STATE_EVENTS.patch,

      reason:
        options.reason || "set-tickets",

      emit:
        options.emit,
    }
  );
}

export function setInvoices(value = [], options = {}) {
  const invoices =
    safeArray(value);

  return patchHomeState(
    {
      invoices,
      facturas:
        invoices,

      invoicesRemoteCount:
        Math.max(
          safeNumber(homeState.invoicesRemoteCount, 0),
          invoices.length
        ),
    },
    {
      event:
        options.event || HOME_STATE_EVENTS.patch,

      reason:
        options.reason || "set-invoices",

      emit:
        options.emit,
    }
  );
}

export function setUsers(value = [], options = {}) {
  const users =
    safeArray(value);

  return patchHomeState(
    {
      users,
      usuarios:
        users,

      usersRemoteCount:
        Math.max(
          safeNumber(homeState.usersRemoteCount, 0),
          users.length
        ),
    },
    {
      event:
        options.event || HOME_STATE_EVENTS.patch,

      reason:
        options.reason || "set-users",

      emit:
        options.emit,
    }
  );
}

export function setClients(value = [], options = {}) {
  const clients =
    safeArray(value);

  return patchHomeState(
    {
      clients,
      clientes:
        clients,

      customers:
        clients,

      clientsRemoteCount:
        Math.max(
          safeNumber(homeState.clientsRemoteCount, 0),
          clients.length
        ),
    },
    {
      event:
        options.event || HOME_STATE_EVENTS.patch,

      reason:
        options.reason || "set-clients",

      emit:
        options.emit,
    }
  );
}

export function setActivity(value = [], options = {}) {
  const activity =
    safeArray(value);

  return patchHomeState(
    {
      activity,
      recent:
        safeArray(
          first(
            options.recent,
            homeState.recent,
            activity
          )
        ),

      recentActivity:
        safeArray(
          first(
            options.recentActivity,
            homeState.recentActivity,
            homeState.recent,
            activity
          )
        ),
    },
    {
      event:
        options.event || HOME_STATE_EVENTS.patch,

      reason:
        options.reason || "set-activity",

      emit:
        options.emit,
    }
  );
}

export function setPage(value = 1, options = {}) {
  return patchHomeState(
    {
      page:
        Math.max(
          1,
          Math.trunc(
            safeNumber(value, 1)
          )
        ),
    },
    {
      event:
        options.event || HOME_STATE_EVENTS.patch,

      reason:
        options.reason || "set-page",

      emit:
        options.emit,
    }
  );
}

export function setPageSize(value = DEFAULT_PAGE_SIZE, options = {}) {
  return patchHomeState(
    {
      pageSize:
        Math.max(
          1,
          Math.trunc(
            safeNumber(value, DEFAULT_PAGE_SIZE)
          )
        ),

      page:
        1,
    },
    {
      event:
        options.event || HOME_STATE_EVENTS.patch,

      reason:
        options.reason || "set-page-size",

      emit:
        options.emit,
    }
  );
}

/* =========================================================
   SUBSCRIPTIONS
========================================================= */

export function subscribeHomeState(handler) {
  if (!isFunction(handler)) {
    return () => {};
  }

  subscribers.add(handler);

  return () => {
    try {
      subscribers.delete(handler);
    } catch {}
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHomeStateSnapshot(options = {}) {
  const opts =
    safeObject(options);

  ensureHomeStateAliases();

  const base = {
    version:
      HOME_STATE_VERSION,

    source:
      SOURCE,

    initialized:
      runtime.initialized,

    changeCount:
      runtime.changeCount,

    lastEvent:
      runtime.lastEvent,

    lastReason:
      runtime.lastReason,

    lastChangedAt:
      runtime.lastChangedAt,

    lastChangedAtMs:
      runtime.lastChangedAtMs,

    subscribers:
      subscribers.size,

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
      homeState.openingTicketId,

    selectedTicketId:
      homeState.selectedTicketId,

    navigatingAction:
      homeState.navigatingAction,

    error:
      homeState.error,

    page:
      homeState.page,

    pageSize:
      homeState.pageSize,

    remoteCount:
      homeState.remoteCount,

    ticketsRemoteCount:
      homeState.ticketsRemoteCount,

    invoicesRemoteCount:
      homeState.invoicesRemoteCount,

    usersRemoteCount:
      homeState.usersRemoteCount,

    clientsRemoteCount:
      homeState.clientsRemoteCount,

    requestId:
      homeState.requestId,

    lastSyncAt:
      homeState.lastSyncAt,

    counts: {
      widgets:
        homeState.widgets.length,

      recent:
        homeState.recent.length,

      activity:
        homeState.activity.length,

      tickets:
        homeState.tickets.length,

      invoices:
        homeState.invoices.length,

      users:
        homeState.users.length,

      clients:
        homeState.clients.length,
    },

    hasDashboard:
      hasOwnKeys(homeState.dashboard),

    hasSummary:
      hasOwnKeys(homeState.summary),

    hasHealth:
      Boolean(homeState.health),

    summary:
      safeClone(homeState.summary, {}),

    health:
      safeClone(homeState.health, null),

    meta:
      safeClone(homeState.meta, {}),

    runtime: {
      recent:
        safeClone(runtime.recent, []),
    },
  };

  if (opts.includeData === true) {
    return sanitizePayload({
      ...base,

      dashboard:
        homeState.dashboard,

      widgets:
        homeState.widgets,

      recent:
        homeState.recent,

      recentActivity:
        homeState.recentActivity,

      activity:
        homeState.activity,

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
    });
  }

  return sanitizePayload(base);
}

/* =========================================================
   APPCORE BRIDGE
========================================================= */

function registerHomeStateBridge() {
  const api = {
    version:
      HOME_STATE_VERSION,

    state:
      homeState,

    getState:
      () => homeState,

    getSnapshot:
      getHomeStateSnapshot,

    patch:
      patchHomeState,

    replace:
      replaceHomeState,

    reset:
      resetHomeState,

    subscribe:
      subscribeHomeState,

    setLoading,
    setRefreshing,
    setError,
    setDashboard,
    setWidgets,
    setSummary,
    setRecent,
    setLastSyncAt,
    setLoaded,
    setRequestId,
    setHealth,
    setHydrated,

    setTickets,
    setInvoices,
    setUsers,
    setClients,
    setActivity,
    setPage,
    setPageSize,
  };

  try {
    if (isFunction(AppCore?.modules?.register)) {
      AppCore.modules.register(
        "HomeState",
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
        "HomeState",
        api
      );
    } else if (
      AppCore?.modules &&
      typeof AppCore.modules === "object"
    ) {
      AppCore.modules.HomeState =
        api;

      AppCore.modules.homeState =
        api;
    }
  } catch {}

  try {
    defineHiddenValue(
      AppCore,
      "HomeState",
      api
    );
  } catch {}

  try {
    if (isBrowser()) {
      window.OnionHomeState = {
        ...(window.OnionHomeState || {}),
        ...api,
      };
    }
  } catch {}

  runtime.initialized =
    true;

  return api;
}

/* =========================================================
   BOOTSTRAP
========================================================= */

ensureHomeStateAliases();
registerHomeStateBridge();

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

    getState:
      () => homeState,

    getSnapshot:
      getHomeStateSnapshot,

    patch:
      patchHomeState,

    replace:
      replaceHomeState,

    reset:
      resetHomeState,

    subscribe:
      subscribeHomeState,

    setLoading,
    setRefreshing,
    setError,
    setDashboard,
    setWidgets,
    setSummary,
    setRecent,
    setLastSyncAt,
    setLoaded,
    setRequestId,
    setHealth,
    setHydrated,

    setTickets,
    setInvoices,
    setUsers,
    setClients,
    setActivity,
    setPage,
    setPageSize,
  });

export default HomeState;
