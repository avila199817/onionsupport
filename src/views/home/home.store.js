/* =========================================================
   Onion SPA - Home Store
   Archivo: src/views/home/home.store.js

   ONION SUPPORT · HOME STORE
   MEMORY STORE · DASHBOARD SNAPSHOT · WIDGET REGISTRY · EXTREME 10/10

   RESPONSABILIDADES:
   - Mantener snapshot de datos del Home en memoria.
   - Exponer store estable para home.api.js / HomeView.js / template.
   - Sin DOM.
   - Sin CSS.
   - Sin HTTP.
   - Sin dependencias circulares con HomeView.
   - Reemplazar dashboard completo desde API.
   - Upsert de widgets por id/key/slug/title.
   - Preservar contadores reales aunque arrays visibles estén vacíos.
   - Mantener aliases:
       tickets/incidencias
       facturas/invoices
       users/usuarios
       clients/clientes/customers
       recent/recentActivity/activity/activities
       summary/stats/metrics/totals/counts
       widgets/cards/kpis/blocks
   - Entregar getters defensivos.
   - Entregar snapshot de diagnóstico.
   - Soportar suscripción interna.
   - Mantener compatibilidad con imports legacy.

   CONTRATO USADO POR home.api.js:
   - replaceHomeStore(payload)
   - upsertHomeWidgetStore(widget)

   HARDENING:
   - No pisa datos válidos con payloads vacíos salvo replace explícito.
   - Dedupe estable por identidad.
   - Normalización tolerante.
   - Cero throws accidentales.
   - Store autocontenido.
========================================================= */

import {
  normalizeHomeDashboard,
} from "./home.model.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const HOME_STORE_VERSION =
  "10.0.0";

export const HOME_STORE_SOURCE =
  "views:home:store";

const DEFAULT_PAGE =
  1;

const DEFAULT_PAGE_SIZE =
  5;

const MAX_HISTORY =
  80;

const STORE_EVENTS =
  Object.freeze({
    replace:
      "home:store:replace",

    patch:
      "home:store:patch",

    clear:
      "home:store:clear",

    widgetUpsert:
      "home:store:widget:upsert",

    widgetRemove:
      "home:store:widget:remove",

    collectionsSet:
      "home:store:collections:set",

    subscribed:
      "home:store:subscribed",

    unsubscribed:
      "home:store:unsubscribed",
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
    const normalized =
      value.trim().toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "ok",
        "on",
      ].includes(normalized)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
      ].includes(normalized)
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

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return String(Date.now());
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

function uniqueStrings(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flatMap((item) =>
          Array.isArray(item)
            ? item
            : [item]
        )
        .map((item) =>
          safeText(item, "")
        )
        .filter(Boolean)
    ),
  ];
}

function uniqueBy(items = [], picker = (item) => item) {
  const rows =
    safeArray(items);

  const seen =
    new Set();

  const output =
    [];

  for (const item of rows) {
    const key =
      safeText(
        picker(item),
        ""
      );

    if (!key) {
      output.push(item);
      continue;
    }

    const normalized =
      normalizeText(key);

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(item);
  }

  return output;
}

function callSafely(fn, ...args) {
  try {
    if (isFunction(fn)) {
      return fn(...args);
    }
  } catch {}

  return undefined;
}

/* =========================================================
   ID HELPERS
========================================================= */

function getWidgetId(widget = {}) {
  const raw =
    safeObject(widget);

  return safeText(
    first(
      raw.widgetId,
      raw.widgetKey,
      raw.id,
      raw.key,
      raw.slug,
      raw.code,
      raw.name,
      raw.title
    ),
    ""
  );
}

function getTicketId(item = {}) {
  if (
    typeof item === "string" ||
    typeof item === "number"
  ) {
    return safeText(item, "");
  }

  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

  return safeText(
    first(
      raw.ticketId,
      raw.incidenciaId,
      raw.code,
      raw.ticketCode,
      raw.numero,
      raw.entityId,
      raw.id,
      raw._id,

      base.ticketId,
      base.incidenciaId,
      base.code,
      base.ticketCode,
      base.numero,
      base.entityId,
      base.id,
      base._id
    ),
    ""
  );
}

function getInvoiceId(item = {}) {
  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

  return safeText(
    first(
      raw.invoiceId,
      raw.facturaId,
      raw.numeroFacturaLegal,
      raw.numeroFactura,
      raw.invoiceNumber,
      raw.number,
      raw.numero,
      raw.code,
      raw.id,
      raw._id,

      base.invoiceId,
      base.facturaId,
      base.numeroFacturaLegal,
      base.numeroFactura,
      base.invoiceNumber,
      base.number,
      base.numero,
      base.code,
      base.id,
      base._id
    ),
    ""
  );
}

function getUserId(item = {}) {
  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

  return safeText(
    first(
      raw.userId,
      raw.usuarioId,
      raw.id,
      raw._id,
      raw.username,
      raw.email,
      raw.mail,

      base.userId,
      base.usuarioId,
      base.id,
      base._id,
      base.username,
      base.email,
      base.mail
    ),
    ""
  );
}

function getClientId(item = {}) {
  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

  return safeText(
    first(
      raw.clientId,
      raw.clienteId,
      raw.customerId,
      raw.id,
      raw._id,
      raw.email,
      raw.mail,
      raw.nif,
      raw.cif,

      base.clientId,
      base.clienteId,
      base.customerId,
      base.id,
      base._id,
      base.email,
      base.mail,
      base.nif,
      base.cif
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
      raw.entityId,
      raw.id,
      raw.key,
      raw.title,
      raw.date,
      raw.createdAt,
      raw.updatedAt
    ),
    ""
  );
}

/* =========================================================
   COLLECTION HELPERS
========================================================= */

function collectionEnvelope(items = [], total = null) {
  const rows =
    safeArray(items);

  const remote =
    Math.max(
      rows.length,
      safeNumber(total, rows.length)
    );

  return {
    items:
      rows,

    rows:
      rows,

    data:
      rows,

    results:
      rows,

    total:
      remote,

    count:
      rows.length,

    totalCount:
      remote,

    remoteCount:
      remote,

    visibleCount:
      rows.length,
  };
}

function normalizeDashboardInput(payload = {}, previousDashboard = {}) {
  const input =
    safeObject(payload);

  try {
    return normalizeHomeDashboard(
      input,
      previousDashboard
    );
  } catch {
    return {
      ...safeObject(previousDashboard),
      ...input,
    };
  }
}

function extractSummary(dashboard = {}) {
  const raw =
    safeObject(dashboard);

  return safeObject(
    first(
      raw.summary,
      raw.stats,
      raw.metrics,
      raw.totals,
      raw.counts,
      {}
    )
  );
}

function extractWidgets(dashboard = {}) {
  const raw =
    safeObject(dashboard);

  return safeArray(
    first(
      raw.widgets,
      raw.cards,
      raw.kpis,
      raw.blocks,
      []
    )
  );
}

function extractTickets(dashboard = {}) {
  const raw =
    safeObject(dashboard);

  return safeArray(
    first(
      raw.tickets,
      raw.incidencias,
      []
    )
  );
}

function extractInvoices(dashboard = {}) {
  const raw =
    safeObject(dashboard);

  return safeArray(
    first(
      raw.facturas,
      raw.invoices,
      []
    )
  );
}

function extractUsers(dashboard = {}) {
  const raw =
    safeObject(dashboard);

  return safeArray(
    first(
      raw.users,
      raw.usuarios,
      []
    )
  );
}

function extractClients(dashboard = {}) {
  const raw =
    safeObject(dashboard);

  return safeArray(
    first(
      raw.clients,
      raw.clientes,
      raw.customers,
      []
    )
  );
}

function extractActivity(dashboard = {}) {
  const raw =
    safeObject(dashboard);

  return safeArray(
    first(
      raw.recent,
      raw.recentActivity,
      raw.activity,
      raw.activities,
      []
    )
  );
}

function computeRemoteCount({
  explicit = null,
  summary = {},
  dashboard = {},
  keys = [],
  fallback = 0,
} = {}) {
  const values =
    [
      explicit,
      ...safeArray(keys).flatMap((key) => [
        safeObject(summary)[key],
        safeObject(dashboard)[key],
        safeObject(dashboard).meta?.[key],
      ]),
      fallback,
    ];

  return Math.max(
    fallback,
    ...values.map((value) =>
      safeNumber(value, fallback)
    )
  );
}

/* =========================================================
   INITIAL STORE
========================================================= */

export function createInitialHomeStore(seed = {}) {
  const input =
    safeObject(seed);

  return {
    version:
      HOME_STORE_VERSION,

    source:
      HOME_STORE_SOURCE,

    hydrated:
      false,

    loaded:
      false,

    loading:
      false,

    refreshing:
      false,

    page:
      DEFAULT_PAGE,

    pageSize:
      DEFAULT_PAGE_SIZE,

    requestId:
      "",

    lastSyncAt:
      null,

    updatedAt:
      null,

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

    blocks:
      [],

    tickets:
      [],

    incidencias:
      [],

    ticketsRemoteCount:
      0,

    remoteCount:
      0,

    facturas:
      [],

    invoices:
      [],

    invoicesRemoteCount:
      0,

    users:
      [],

    usuarios:
      [],

    usersRemoteCount:
      0,

    clients:
      [],

    clientes:
      [],

    customers:
      [],

    clientsRemoteCount:
      0,

    recent:
      [],

    recentActivity:
      [],

    activity:
      [],

    activities:
      [],

    health:
      null,

    error:
      null,

    errorMessage:
      "",

    mutationCount:
      0,

    lastMutation:
      "",

    lastMutationAt:
      null,

    history:
      [],

    indexes: {
      widgets:
        new Map(),

      tickets:
        new Map(),

      invoices:
        new Map(),

      users:
        new Map(),

      clients:
        new Map(),

      activity:
        new Map(),
    },

    ...input,
  };
}

export const homeStore =
  createInitialHomeStore();

/* =========================================================
   SUBSCRIBERS
========================================================= */

const subscribers =
  new Set();

function pushHistory(reason = "store:update", patch = {}) {
  homeStore.mutationCount =
    safeNumber(homeStore.mutationCount, 0) + 1;

  homeStore.lastMutation =
    safeText(reason, "store:update");

  homeStore.lastMutationAt =
    nowIso();

  homeStore.history =
    [
      {
        reason:
          homeStore.lastMutation,

        at:
          homeStore.lastMutationAt,

        keys:
          Object.keys(
            safeObject(patch)
          ),
      },
      ...safeArray(homeStore.history),
    ].slice(0, MAX_HISTORY);

  return homeStore;
}

function notifyStore(reason = "store:update", payload = {}) {
  const event = {
    reason:
      safeText(reason, "store:update"),

    payload:
      safeObject(payload),

    store:
      homeStore,

    snapshot:
      getHomeStoreSnapshot({
        includeCollections:
          false,
      }),

    at:
      nowIso(),
  };

  for (const subscriber of [...subscribers]) {
    try {
      subscriber(event);
    } catch {}
  }

  return event;
}

export function subscribeHomeStore(callback) {
  if (!isFunction(callback)) {
    return () => {};
  }

  subscribers.add(callback);

  notifyStore(
    STORE_EVENTS.subscribed,
    {
      subscribers:
        subscribers.size,
    }
  );

  return () => {
    try {
      subscribers.delete(callback);
    } catch {}

    notifyStore(
      STORE_EVENTS.unsubscribed,
      {
        subscribers:
          subscribers.size,
      }
    );
  };
}

/* =========================================================
   INDEXES
========================================================= */

function rebuildIndex(name = "", items = [], picker = null) {
  const map =
    new Map();

  const rows =
    safeArray(items);

  const getId =
    isFunction(picker)
      ? picker
      : (item) => item?.id;

  for (const item of rows) {
    const ids =
      uniqueStrings([
        getId(item),
        item?.id,
        item?._id,
        item?.key,
        item?.code,
        item?.slug,
      ]);

    for (const id of ids) {
      map.set(
        normalizeText(id),
        item
      );
    }
  }

  try {
    homeStore.indexes[name] =
      map;
  } catch {}

  return map;
}

function rebuildAllIndexes() {
  rebuildIndex(
    "widgets",
    homeStore.widgets,
    getWidgetId
  );

  rebuildIndex(
    "tickets",
    homeStore.tickets,
    getTicketId
  );

  rebuildIndex(
    "invoices",
    homeStore.invoices,
    getInvoiceId
  );

  rebuildIndex(
    "users",
    homeStore.users,
    getUserId
  );

  rebuildIndex(
    "clients",
    homeStore.clients,
    getClientId
  );

  rebuildIndex(
    "activity",
    homeStore.activity,
    getActivityId
  );

  return homeStore.indexes;
}

/* =========================================================
   LOW LEVEL PATCH
========================================================= */

function assignStorePatch(patch = {}, reason = "store:patch", options = {}) {
  const input =
    safeObject(patch);

  const opts =
    safeObject(options);

  Object.assign(
    homeStore,
    input
  );

  pushHistory(
    reason,
    input
  );

  if (opts.reindex !== false) {
    rebuildAllIndexes();
  }

  if (opts.notify !== false) {
    notifyStore(
      reason,
      input
    );
  }

  return homeStore;
}

export function patchHomeStore(patch = {}, options = {}) {
  return assignStorePatch(
    patch,
    safeText(options?.reason, STORE_EVENTS.patch),
    options
  );
}

/* =========================================================
   NORMALIZE REPLACE PAYLOAD
========================================================= */

function normalizeReplacePayload(payload = {}, options = {}) {
  const input =
    safeObject(payload);

  const opts =
    safeObject(options);

  const dashboard =
    normalizeDashboardInput(
      first(
        input.dashboard,
        input,
        {}
      ),
      opts.preserveExisting === false
        ? {}
        : homeStore.dashboard
    );

  const summary =
    safeObject(
      first(
        input.summary,
        input.stats,
        input.metrics,
        input.totals,
        input.counts,
        extractSummary(dashboard),
        {}
      )
    );

  const widgets =
    safeArray(
      first(
        input.widgets,
        input.cards,
        input.kpis,
        input.blocks,
        extractWidgets(dashboard),
        []
      )
    );

  const tickets =
    uniqueBy(
      safeArray(
        first(
          input.tickets,
          input.incidencias,
          extractTickets(dashboard),
          []
        )
      ),
      getTicketId
    );

  const invoices =
    uniqueBy(
      safeArray(
        first(
          input.facturas,
          input.invoices,
          extractInvoices(dashboard),
          []
        )
      ),
      getInvoiceId
    );

  const users =
    uniqueBy(
      safeArray(
        first(
          input.users,
          input.usuarios,
          extractUsers(dashboard),
          []
        )
      ),
      getUserId
    );

  const clients =
    uniqueBy(
      safeArray(
        first(
          input.clients,
          input.clientes,
          input.customers,
          extractClients(dashboard),
          []
        )
      ),
      getClientId
    );

  const activity =
    safeArray(
      first(
        input.recent,
        input.recentActivity,
        input.activity,
        input.activities,
        extractActivity(dashboard),
        []
      )
    );

  const ticketsRemoteCount =
    computeRemoteCount({
      explicit:
        first(
          input.ticketsRemoteCount,
          input.remoteCount,
          input.ticketsCount,
          input.incidenciasCount
        ),

      summary,

      dashboard,

      keys: [
        "totalTickets",
        "ticketsTotal",
        "incidenciasTotal",
        "totalIncidencias",
        "ticketsCount",
        "incidenciasCount",
      ],

      fallback:
        tickets.length,
    });

  const invoicesRemoteCount =
    computeRemoteCount({
      explicit:
        first(
          input.invoicesRemoteCount,
          input.facturasRemoteCount,
          input.invoicesCount,
          input.facturasCount
        ),

      summary,

      dashboard,

      keys: [
        "totalInvoices",
        "invoicesTotal",
        "facturasTotal",
        "totalFacturas",
        "invoicesCount",
        "facturasCount",
      ],

      fallback:
        invoices.length,
    });

  const usersRemoteCount =
    computeRemoteCount({
      explicit:
        first(
          input.usersRemoteCount,
          input.usuariosRemoteCount,
          input.usersCount,
          input.usuariosCount
        ),

      summary,

      dashboard,

      keys: [
        "usersCount",
        "usuariosCount",
        "totalUsers",
        "totalUsuarios",
        "activeUsers",
        "usuariosActivos",
      ],

      fallback:
        users.length,
    });

  const clientsRemoteCount =
    computeRemoteCount({
      explicit:
        first(
          input.clientsRemoteCount,
          input.clientesRemoteCount,
          input.customersRemoteCount,
          input.clientsCount,
          input.clientesCount,
          input.customersCount
        ),

      summary,

      dashboard,

      keys: [
        "clientsCount",
        "clientesCount",
        "customersCount",
        "totalClients",
        "totalClientes",
        "totalCustomers",
        "activeClients",
        "clientesActivos",
      ],

      fallback:
        clients.length,
    });

  return {
    dashboard:
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
        blocks:
          widgets,

        tickets,
        incidencias:
          tickets,

        facturas:
          invoices,
        invoices,

        users,
        usuarios:
          users,

        clients,
        clientes:
          clients,
        customers:
          clients,

        recent:
          activity,
        recentActivity:
          activity,
        activity,
        activities:
          activity,

        ticketsTotal:
          ticketsRemoteCount,
        incidenciasTotal:
          ticketsRemoteCount,
        totalTickets:
          ticketsRemoteCount,
        totalIncidencias:
          ticketsRemoteCount,

        invoicesTotal:
          invoicesRemoteCount,
        facturasTotal:
          invoicesRemoteCount,
        totalInvoices:
          invoicesRemoteCount,
        totalFacturas:
          invoicesRemoteCount,

        usersTotal:
          usersRemoteCount,
        usuariosTotal:
          usersRemoteCount,
        totalUsers:
          usersRemoteCount,
        totalUsuarios:
          usersRemoteCount,

        clientsTotal:
          clientsRemoteCount,
        clientesTotal:
          clientsRemoteCount,
        customersTotal:
          clientsRemoteCount,
        totalClients:
          clientsRemoteCount,
        totalClientes:
          clientsRemoteCount,
        totalCustomers:
          clientsRemoteCount,
      },

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
    blocks:
      widgets,

    tickets,
    incidencias:
      tickets,

    facturas:
      invoices,
    invoices,

    users,
    usuarios:
      users,

    clients,
    clientes:
      clients,
    customers:
      clients,

    recent:
      activity,
    recentActivity:
      activity,
    activity,
    activities:
      activity,

    remoteCount:
      ticketsRemoteCount,

    ticketsRemoteCount,
    invoicesRemoteCount,
    usersRemoteCount,
    clientsRemoteCount,

    requestId:
      safeText(
        first(
          input.requestId,
          dashboard.requestId,
          dashboard.meta?.requestId,
          homeStore.requestId
        ),
        ""
      ),

    lastSyncAt:
      first(
        input.lastSyncAt,
        dashboard.updatedAt,
        dashboard.generatedAt,
        homeStore.lastSyncAt,
        nowIso()
      ),

    updatedAt:
      first(
        input.updatedAt,
        dashboard.updatedAt,
        dashboard.generatedAt,
        nowIso()
      ),

    loaded:
      opts.loaded ?? true,

    hydrated:
      opts.hydrated ?? true,

    error:
      null,

    errorMessage:
      "",
  };
}

/* =========================================================
   CONTINÚA EN PARTE 2/2
========================================================= */

/* =========================================================
   REPLACE / MERGE STORE
========================================================= */

function mergeCollectionsIfNeeded(next = {}, options = {}) {
  const opts =
    safeObject(options);

  if (opts.preserveExisting === false) {
    return next;
  }

  const output = {
    ...next,
  };

  const preserveArray = (key, fallbackKey = key) => {
    const incoming =
      safeArray(output[key]);

    const previous =
      safeArray(homeStore[fallbackKey]);

    if (
      incoming.length === 0 &&
      previous.length > 0
    ) {
      output[key] =
        previous;
    }
  };

  preserveArray("widgets");
  preserveArray("cards", "widgets");
  preserveArray("kpis", "widgets");
  preserveArray("blocks", "widgets");

  preserveArray("tickets");
  preserveArray("incidencias", "tickets");

  preserveArray("facturas", "invoices");
  preserveArray("invoices");

  preserveArray("users");
  preserveArray("usuarios", "users");

  preserveArray("clients");
  preserveArray("clientes", "clients");
  preserveArray("customers", "clients");

  preserveArray("recent", "activity");
  preserveArray("recentActivity", "activity");
  preserveArray("activity");
  preserveArray("activities", "activity");

  const previousSummary =
    safeObject(homeStore.summary);

  const nextSummary =
    safeObject(output.summary);

  output.summary = {
    ...previousSummary,
    ...nextSummary,
  };

  output.stats =
    output.summary;

  output.metrics =
    output.summary;

  output.totals =
    output.summary;

  output.counts =
    output.summary;

  output.ticketsRemoteCount =
    Math.max(
      safeNumber(homeStore.ticketsRemoteCount, 0),
      safeNumber(output.ticketsRemoteCount, 0),
      safeArray(output.tickets).length
    );

  output.remoteCount =
    Math.max(
      safeNumber(homeStore.remoteCount, 0),
      safeNumber(output.remoteCount, 0),
      output.ticketsRemoteCount
    );

  output.invoicesRemoteCount =
    Math.max(
      safeNumber(homeStore.invoicesRemoteCount, 0),
      safeNumber(output.invoicesRemoteCount, 0),
      safeArray(output.invoices).length,
      safeArray(output.facturas).length
    );

  output.usersRemoteCount =
    Math.max(
      safeNumber(homeStore.usersRemoteCount, 0),
      safeNumber(output.usersRemoteCount, 0),
      safeArray(output.users).length,
      safeArray(output.usuarios).length
    );

  output.clientsRemoteCount =
    Math.max(
      safeNumber(homeStore.clientsRemoteCount, 0),
      safeNumber(output.clientsRemoteCount, 0),
      safeArray(output.clients).length,
      safeArray(output.clientes).length,
      safeArray(output.customers).length
    );

  return output;
}

function rebuildDashboardFromStore(baseDashboard = {}) {
  const dashboard =
    safeObject(baseDashboard);

  return {
    ...dashboard,

    summary:
      homeStore.summary,
    stats:
      homeStore.summary,
    metrics:
      homeStore.summary,
    totals:
      homeStore.summary,
    counts:
      homeStore.summary,

    widgets:
      homeStore.widgets,
    cards:
      homeStore.widgets,
    kpis:
      homeStore.widgets,
    blocks:
      homeStore.widgets,

    tickets:
      homeStore.tickets,
    incidencias:
      homeStore.tickets,

    facturas:
      homeStore.invoices,
    invoices:
      homeStore.invoices,

    users:
      homeStore.users,
    usuarios:
      homeStore.users,

    clients:
      homeStore.clients,
    clientes:
      homeStore.clients,
    customers:
      homeStore.clients,

    recent:
      homeStore.activity,
    recentActivity:
      homeStore.activity,
    activity:
      homeStore.activity,
    activities:
      homeStore.activity,

    ticketsTotal:
      homeStore.ticketsRemoteCount,
    incidenciasTotal:
      homeStore.ticketsRemoteCount,
    totalTickets:
      homeStore.ticketsRemoteCount,
    totalIncidencias:
      homeStore.ticketsRemoteCount,

    invoicesTotal:
      homeStore.invoicesRemoteCount,
    facturasTotal:
      homeStore.invoicesRemoteCount,
    totalInvoices:
      homeStore.invoicesRemoteCount,
    totalFacturas:
      homeStore.invoicesRemoteCount,

    usersTotal:
      homeStore.usersRemoteCount,
    usuariosTotal:
      homeStore.usersRemoteCount,
    totalUsers:
      homeStore.usersRemoteCount,
    totalUsuarios:
      homeStore.usersRemoteCount,

    clientsTotal:
      homeStore.clientsRemoteCount,
    clientesTotal:
      homeStore.clientsRemoteCount,
    customersTotal:
      homeStore.clientsRemoteCount,
    totalClients:
      homeStore.clientsRemoteCount,
    totalClientes:
      homeStore.clientsRemoteCount,
    totalCustomers:
      homeStore.clientsRemoteCount,

    requestId:
      homeStore.requestId,

    updatedAt:
      homeStore.updatedAt ||
      homeStore.lastSyncAt,

    generatedAt:
      dashboard.generatedAt ||
      homeStore.lastSyncAt,
  };
}

function syncAliases() {
  homeStore.stats =
    homeStore.summary;

  homeStore.metrics =
    homeStore.summary;

  homeStore.totals =
    homeStore.summary;

  homeStore.counts =
    homeStore.summary;

  homeStore.cards =
    homeStore.widgets;

  homeStore.kpis =
    homeStore.widgets;

  homeStore.blocks =
    homeStore.widgets;

  homeStore.incidencias =
    homeStore.tickets;

  homeStore.facturas =
    homeStore.invoices;

  homeStore.usuarios =
    homeStore.users;

  homeStore.clientes =
    homeStore.clients;

  homeStore.customers =
    homeStore.clients;

  homeStore.recent =
    homeStore.activity;

  homeStore.recentActivity =
    homeStore.activity;

  homeStore.activities =
    homeStore.activity;

  homeStore.dashboard =
    rebuildDashboardFromStore(
      homeStore.dashboard
    );

  return homeStore;
}

export function replaceHomeStore(payload = {}, options = {}) {
  const opts =
    safeObject(options);

  const normalized =
    normalizeReplacePayload(
      payload,
      opts
    );

  const next =
    mergeCollectionsIfNeeded(
      normalized,
      opts
    );

  assignStorePatch(
    {
      ...next,

      hydrated:
        opts.hydrated ?? next.hydrated ?? true,

      loaded:
        opts.loaded ?? next.loaded ?? true,

      loading:
        false,

      refreshing:
        false,
    },
    safeText(
      opts.reason,
      STORE_EVENTS.replace
    ),
    {
      ...opts,
      notify:
        false,
      reindex:
        false,
    }
  );

  syncAliases();
  rebuildAllIndexes();

  notifyStore(
    safeText(
      opts.reason,
      STORE_EVENTS.replace
    ),
    next
  );

  return homeStore;
}

export function mergeHomeStore(payload = {}, options = {}) {
  return replaceHomeStore(
    payload,
    {
      preserveExisting:
        true,
      ...safeObject(options),
      reason:
        safeText(
          options?.reason,
          "home:store:merge"
        ),
    }
  );
}

/* =========================================================
   COLLECTION SETTERS
========================================================= */

export function setHomeWidgetsStore(widgets = [], options = {}) {
  const rows =
    uniqueBy(
      safeArray(widgets),
      getWidgetId
    );

  assignStorePatch(
    {
      widgets:
        rows,
      cards:
        rows,
      kpis:
        rows,
      blocks:
        rows,
      dashboard:
        {
          ...safeObject(homeStore.dashboard),
          widgets:
            rows,
          cards:
            rows,
          kpis:
            rows,
          blocks:
            rows,
        },
    },
    safeText(
      options?.reason,
      "home:store:widgets:set"
    )
  );

  syncAliases();

  return rows;
}

export function setHomeTicketsStore(tickets = [], options = {}) {
  const rows =
    uniqueBy(
      safeArray(tickets),
      getTicketId
    );

  const total =
    Math.max(
      rows.length,
      safeNumber(
        options?.total,
        safeNumber(
          options?.remoteCount,
          homeStore.ticketsRemoteCount
        )
      )
    );

  assignStorePatch(
    {
      tickets:
        rows,
      incidencias:
        rows,
      remoteCount:
        Math.max(
          total,
          homeStore.remoteCount
        ),
      ticketsRemoteCount:
        total,
    },
    safeText(
      options?.reason,
      "home:store:tickets:set"
    )
  );

  syncAliases();

  return rows;
}

export function setHomeInvoicesStore(invoices = [], options = {}) {
  const rows =
    uniqueBy(
      safeArray(invoices),
      getInvoiceId
    );

  const total =
    Math.max(
      rows.length,
      safeNumber(
        options?.total,
        safeNumber(
          options?.remoteCount,
          homeStore.invoicesRemoteCount
        )
      )
    );

  assignStorePatch(
    {
      invoices:
        rows,
      facturas:
        rows,
      invoicesRemoteCount:
        total,
    },
    safeText(
      options?.reason,
      "home:store:invoices:set"
    )
  );

  syncAliases();

  return rows;
}

export function setHomeUsersStore(users = [], options = {}) {
  const rows =
    uniqueBy(
      safeArray(users),
      getUserId
    );

  const total =
    Math.max(
      rows.length,
      safeNumber(
        options?.total,
        safeNumber(
          options?.remoteCount,
          homeStore.usersRemoteCount
        )
      )
    );

  assignStorePatch(
    {
      users:
        rows,
      usuarios:
        rows,
      usersRemoteCount:
        total,
    },
    safeText(
      options?.reason,
      "home:store:users:set"
    )
  );

  syncAliases();

  return rows;
}

export function setHomeClientsStore(clients = [], options = {}) {
  const rows =
    uniqueBy(
      safeArray(clients),
      getClientId
    );

  const total =
    Math.max(
      rows.length,
      safeNumber(
        options?.total,
        safeNumber(
          options?.remoteCount,
          homeStore.clientsRemoteCount
        )
      )
    );

  assignStorePatch(
    {
      clients:
        rows,
      clientes:
        rows,
      customers:
        rows,
      clientsRemoteCount:
        total,
    },
    safeText(
      options?.reason,
      "home:store:clients:set"
    )
  );

  syncAliases();

  return rows;
}

export function setHomeActivityStore(activity = [], options = {}) {
  const rows =
    uniqueBy(
      safeArray(activity),
      getActivityId
    );

  assignStorePatch(
    {
      activity:
        rows,
      activities:
        rows,
      recent:
        rows,
      recentActivity:
        rows,
    },
    safeText(
      options?.reason,
      "home:store:activity:set"
    )
  );

  syncAliases();

  return rows;
}

export function setHomeCollectionsStore(collections = {}, options = {}) {
  const input =
    safeObject(collections);

  if (
    input.widgets ||
    input.cards ||
    input.kpis ||
    input.blocks
  ) {
    setHomeWidgetsStore(
      first(
        input.widgets,
        input.cards,
        input.kpis,
        input.blocks,
        []
      ),
      {
        ...safeObject(options),
        reason:
          "home:store:collections:widgets",
      }
    );
  }

  if (
    input.tickets ||
    input.incidencias
  ) {
    setHomeTicketsStore(
      first(
        input.tickets,
        input.incidencias,
        []
      ),
      {
        ...safeObject(options),
        total:
          first(
            input.ticketsRemoteCount,
            input.remoteCount,
            input.totalTickets,
            input.incidenciasTotal
          ),
        reason:
          "home:store:collections:tickets",
      }
    );
  }

  if (
    input.facturas ||
    input.invoices
  ) {
    setHomeInvoicesStore(
      first(
        input.facturas,
        input.invoices,
        []
      ),
      {
        ...safeObject(options),
        total:
          first(
            input.invoicesRemoteCount,
            input.facturasRemoteCount,
            input.totalInvoices,
            input.totalFacturas
          ),
        reason:
          "home:store:collections:invoices",
      }
    );
  }

  if (
    input.users ||
    input.usuarios
  ) {
    setHomeUsersStore(
      first(
        input.users,
        input.usuarios,
        []
      ),
      {
        ...safeObject(options),
        total:
          first(
            input.usersRemoteCount,
            input.usuariosRemoteCount,
            input.totalUsers,
            input.totalUsuarios
          ),
        reason:
          "home:store:collections:users",
      }
    );
  }

  if (
    input.clients ||
    input.clientes ||
    input.customers
  ) {
    setHomeClientsStore(
      first(
        input.clients,
        input.clientes,
        input.customers,
        []
      ),
      {
        ...safeObject(options),
        total:
          first(
            input.clientsRemoteCount,
            input.clientesRemoteCount,
            input.customersRemoteCount,
            input.totalClients,
            input.totalClientes,
            input.totalCustomers
          ),
        reason:
          "home:store:collections:clients",
      }
    );
  }

  if (
    input.recent ||
    input.recentActivity ||
    input.activity ||
    input.activities
  ) {
    setHomeActivityStore(
      first(
        input.recent,
        input.recentActivity,
        input.activity,
        input.activities,
        []
      ),
      {
        ...safeObject(options),
        reason:
          "home:store:collections:activity",
      }
    );
  }

  syncAliases();
  rebuildAllIndexes();

  notifyStore(
    STORE_EVENTS.collectionsSet,
    input
  );

  return homeStore;
}

/* =========================================================
   WIDGET UPSERT / REMOVE
========================================================= */

function findWidgetIndex(widget = {}) {
  const targetIds =
    uniqueStrings([
      getWidgetId(widget),
      widget?.widgetId,
      widget?.widgetKey,
      widget?.id,
      widget?.key,
      widget?.slug,
      widget?.code,
      widget?.title,
      widget?.name,
    ]).map((item) =>
      normalizeText(item)
    );

  if (!targetIds.length) {
    return -1;
  }

  return safeArray(homeStore.widgets).findIndex((item) => {
    const ids =
      uniqueStrings([
        getWidgetId(item),
        item?.widgetId,
        item?.widgetKey,
        item?.id,
        item?.key,
        item?.slug,
        item?.code,
        item?.title,
        item?.name,
      ]).map((value) =>
        normalizeText(value)
      );

    return ids.some((id) =>
      targetIds.includes(id)
    );
  });
}

export function upsertHomeWidgetStore(widget = {}, options = {}) {
  const item =
    safeObject(widget);

  if (!hasOwnKeys(item)) {
    return null;
  }

  const rows =
    [...safeArray(homeStore.widgets)];

  const index =
    findWidgetIndex(item);

  if (index >= 0) {
    rows[index] = {
      ...safeObject(rows[index]),
      ...item,
    };
  } else {
    rows.push(item);
  }

  setHomeWidgetsStore(
    rows,
    {
      ...safeObject(options),
      reason:
        safeText(
          options?.reason,
          STORE_EVENTS.widgetUpsert
        ),
    }
  );

  notifyStore(
    STORE_EVENTS.widgetUpsert,
    {
      widget:
        item,
      index,
      inserted:
        index < 0,
    }
  );

  return item;
}

export function removeHomeWidgetStore(widgetId = "", options = {}) {
  const id =
    normalizeText(widgetId);

  if (!id) {
    return false;
  }

  const before =
    safeArray(homeStore.widgets);

  const after =
    before.filter((item) => {
      const ids =
        uniqueStrings([
          getWidgetId(item),
          item?.widgetId,
          item?.widgetKey,
          item?.id,
          item?.key,
          item?.slug,
          item?.code,
          item?.title,
          item?.name,
        ]).map((value) =>
          normalizeText(value)
        );

      return !ids.includes(id);
    });

  if (after.length === before.length) {
    return false;
  }

  setHomeWidgetsStore(
    after,
    {
      ...safeObject(options),
      reason:
        safeText(
          options?.reason,
          STORE_EVENTS.widgetRemove
        ),
    }
  );

  notifyStore(
    STORE_EVENTS.widgetRemove,
    {
      widgetId,
    }
  );

  return true;
}

/* =========================================================
   STATE FLAGS
========================================================= */

export function setHomeStoreLoading(value = false) {
  return patchHomeStore(
    {
      loading:
        safeBoolean(value),
    },
    {
      reason:
        "home:store:loading",
    }
  );
}

export function setHomeStoreRefreshing(value = false) {
  return patchHomeStore(
    {
      refreshing:
        safeBoolean(value),
    },
    {
      reason:
        "home:store:refreshing",
    }
  );
}

export function setHomeStoreError(error = null) {
  const message =
    safeText(
      first(
        error?.message,
        error?.data?.message,
        error
      ),
      ""
    );

  return patchHomeStore(
    {
      error,
      errorMessage:
        message,
      loading:
        false,
      refreshing:
        false,
    },
    {
      reason:
        "home:store:error",
    }
  );
}

export function setHomeStoreLoaded(value = true) {
  return patchHomeStore(
    {
      loaded:
        safeBoolean(value, true),
    },
    {
      reason:
        "home:store:loaded",
    }
  );
}

export function setHomeStoreHydrated(value = true) {
  return patchHomeStore(
    {
      hydrated:
        safeBoolean(value, true),
    },
    {
      reason:
        "home:store:hydrated",
    }
  );
}

export function setHomeStoreRequestId(requestId = "") {
  return patchHomeStore(
    {
      requestId:
        safeText(requestId, ""),
    },
    {
      reason:
        "home:store:request-id",
    }
  );
}

export function setHomeStoreLastSyncAt(value = null) {
  return patchHomeStore(
    {
      lastSyncAt:
        value || nowIso(),
      updatedAt:
        value || nowIso(),
    },
    {
      reason:
        "home:store:last-sync-at",
    }
  );
}

export function setHomeStoreHealth(health = null) {
  return patchHomeStore(
    {
      health:
        health,
    },
    {
      reason:
        "home:store:health",
    }
  );
}

export function setHomeStorePage(page = DEFAULT_PAGE) {
  const nextPage =
    Math.max(
      1,
      safeNumber(page, DEFAULT_PAGE)
    );

  return patchHomeStore(
    {
      page:
        nextPage,
    },
    {
      reason:
        "home:store:page",
    }
  );
}

export function setHomeStorePageSize(pageSize = DEFAULT_PAGE_SIZE) {
  const nextSize =
    Math.max(
      1,
      safeNumber(pageSize, DEFAULT_PAGE_SIZE)
    );

  return patchHomeStore(
    {
      pageSize:
        nextSize,
      page:
        DEFAULT_PAGE,
    },
    {
      reason:
        "home:store:page-size",
    }
  );
}

/* =========================================================
   GETTERS
========================================================= */

export function getHomeStore() {
  return homeStore;
}

export function getHomeDashboardStore() {
  syncAliases();
  return safeObject(homeStore.dashboard);
}

export function getHomeSummaryStore() {
  return safeObject(homeStore.summary);
}

export function getHomeStatsStore() {
  return getHomeSummaryStore();
}

export function getHomeWidgetsStore() {
  return safeArray(homeStore.widgets);
}

export function getHomeCardsStore() {
  return getHomeWidgetsStore();
}

export function getHomeKpisStore() {
  return getHomeWidgetsStore();
}

export function getHomeTicketsStore() {
  return safeArray(homeStore.tickets);
}

export function getHomeIncidenciasStore() {
  return getHomeTicketsStore();
}

export function getHomeInvoicesStore() {
  return safeArray(homeStore.invoices);
}

export function getHomeFacturasStore() {
  return getHomeInvoicesStore();
}

export function getHomeUsersStore() {
  return safeArray(homeStore.users);
}

export function getHomeUsuariosStore() {
  return getHomeUsersStore();
}

export function getHomeClientsStore() {
  return safeArray(homeStore.clients);
}

export function getHomeClientesStore() {
  return getHomeClientsStore();
}

export function getHomeCustomersStore() {
  return getHomeClientsStore();
}

export function getHomeActivityStore() {
  return safeArray(homeStore.activity);
}

export function getHomeRecentStore() {
  return getHomeActivityStore();
}

export function getHomeWidgetByIdStore(widgetId = "") {
  const id =
    normalizeText(widgetId);

  if (!id) {
    return null;
  }

  try {
    return homeStore.indexes.widgets.get(id) || null;
  } catch {}

  return (
    getHomeWidgetsStore().find((item) => {
      const ids =
        uniqueStrings([
          getWidgetId(item),
          item?.widgetId,
          item?.widgetKey,
          item?.id,
          item?.key,
          item?.slug,
          item?.code,
          item?.title,
          item?.name,
        ]).map((value) =>
          normalizeText(value)
        );

      return ids.includes(id);
    }) || null
  );
}

export function getHomeTicketByIdStore(ticketId = "") {
  const id =
    normalizeText(ticketId);

  if (!id) {
    return null;
  }

  try {
    return homeStore.indexes.tickets.get(id) || null;
  } catch {}

  return (
    getHomeTicketsStore().find((item) => {
      const ids =
        uniqueStrings([
          getTicketId(item),
          item?.ticketId,
          item?.incidenciaId,
          item?.id,
          item?._id,
          item?.code,
          item?.ticketCode,
        ]).map((value) =>
          normalizeText(value)
        );

      return ids.includes(id);
    }) || null
  );
}

export function getHomeInvoiceByIdStore(invoiceId = "") {
  const id =
    normalizeText(invoiceId);

  if (!id) {
    return null;
  }

  try {
    return homeStore.indexes.invoices.get(id) || null;
  } catch {}

  return (
    getHomeInvoicesStore().find((item) => {
      const ids =
        uniqueStrings([
          getInvoiceId(item),
          item?.invoiceId,
          item?.facturaId,
          item?.id,
          item?._id,
          item?.numeroFacturaLegal,
          item?.numeroFactura,
          item?.invoiceNumber,
          item?.number,
          item?.numero,
          item?.code,
        ]).map((value) =>
          normalizeText(value)
        );

      return ids.includes(id);
    }) || null
  );
}

/* =========================================================
   ENVELOPES / SNAPSHOTS
========================================================= */

export function getHomeCollectionsEnvelope() {
  return {
    widgets:
      collectionEnvelope(
        homeStore.widgets,
        homeStore.widgets.length
      ),

    cards:
      collectionEnvelope(
        homeStore.widgets,
        homeStore.widgets.length
      ),

    kpis:
      collectionEnvelope(
        homeStore.widgets,
        homeStore.widgets.length
      ),

    tickets:
      collectionEnvelope(
        homeStore.tickets,
        homeStore.ticketsRemoteCount
      ),

    incidencias:
      collectionEnvelope(
        homeStore.tickets,
        homeStore.ticketsRemoteCount
      ),

    facturas:
      collectionEnvelope(
        homeStore.invoices,
        homeStore.invoicesRemoteCount
      ),

    invoices:
      collectionEnvelope(
        homeStore.invoices,
        homeStore.invoicesRemoteCount
      ),

    users:
      collectionEnvelope(
        homeStore.users,
        homeStore.usersRemoteCount
      ),

    usuarios:
      collectionEnvelope(
        homeStore.users,
        homeStore.usersRemoteCount
      ),

    clients:
      collectionEnvelope(
        homeStore.clients,
        homeStore.clientsRemoteCount
      ),

    clientes:
      collectionEnvelope(
        homeStore.clients,
        homeStore.clientsRemoteCount
      ),

    customers:
      collectionEnvelope(
        homeStore.clients,
        homeStore.clientsRemoteCount
      ),

    activity:
      collectionEnvelope(
        homeStore.activity,
        homeStore.activity.length
      ),

    recent:
      collectionEnvelope(
        homeStore.activity,
        homeStore.activity.length
      ),

    recentActivity:
      collectionEnvelope(
        homeStore.activity,
        homeStore.activity.length
      ),
  };
}

export function getHomeStoreSnapshot(options = {}) {
  const opts =
    safeObject(options);

  const includeCollections =
    opts.includeCollections === true;

  const includeHistory =
    opts.includeHistory === true;

  const snapshot = {
    version:
      HOME_STORE_VERSION,

    source:
      HOME_STORE_SOURCE,

    hydrated:
      Boolean(homeStore.hydrated),

    loaded:
      Boolean(homeStore.loaded),

    loading:
      Boolean(homeStore.loading),

    refreshing:
      Boolean(homeStore.refreshing),

    page:
      safeNumber(homeStore.page, DEFAULT_PAGE),

    pageSize:
      safeNumber(homeStore.pageSize, DEFAULT_PAGE_SIZE),

    requestId:
      safeText(homeStore.requestId, ""),

    lastSyncAt:
      homeStore.lastSyncAt || null,

    updatedAt:
      homeStore.updatedAt || null,

    hasDashboard:
      hasOwnKeys(homeStore.dashboard),

    hasSummary:
      hasOwnKeys(homeStore.summary),

    widgetsCount:
      safeArray(homeStore.widgets).length,

    ticketsVisibleCount:
      safeArray(homeStore.tickets).length,

    ticketsRemoteCount:
      safeNumber(homeStore.ticketsRemoteCount, 0),

    invoicesVisibleCount:
      safeArray(homeStore.invoices).length,

    invoicesRemoteCount:
      safeNumber(homeStore.invoicesRemoteCount, 0),

    usersVisibleCount:
      safeArray(homeStore.users).length,

    usersRemoteCount:
      safeNumber(homeStore.usersRemoteCount, 0),

    clientsVisibleCount:
      safeArray(homeStore.clients).length,

    clientsRemoteCount:
      safeNumber(homeStore.clientsRemoteCount, 0),

    activityCount:
      safeArray(homeStore.activity).length,

    hasHealth:
      Boolean(homeStore.health),

    hasError:
      Boolean(homeStore.error || homeStore.errorMessage),

    errorMessage:
      safeText(homeStore.errorMessage, ""),

    mutationCount:
      safeNumber(homeStore.mutationCount, 0),

    lastMutation:
      safeText(homeStore.lastMutation, ""),

    lastMutationAt:
      homeStore.lastMutationAt || null,

    subscribers:
      subscribers.size,

    indexes: {
      widgets:
        homeStore.indexes.widgets?.size || 0,

      tickets:
        homeStore.indexes.tickets?.size || 0,

      invoices:
        homeStore.indexes.invoices?.size || 0,

      users:
        homeStore.indexes.users?.size || 0,

      clients:
        homeStore.indexes.clients?.size || 0,

      activity:
        homeStore.indexes.activity?.size || 0,
    },
  };

  if (includeCollections) {
    snapshot.dashboard =
      safeClone(
        homeStore.dashboard,
        {}
      );

    snapshot.summary =
      safeClone(
        homeStore.summary,
        {}
      );

    snapshot.widgets =
      safeClone(
        homeStore.widgets,
        []
      );

    snapshot.tickets =
      safeClone(
        homeStore.tickets,
        []
      );

    snapshot.invoices =
      safeClone(
        homeStore.invoices,
        []
      );

    snapshot.users =
      safeClone(
        homeStore.users,
        []
      );

    snapshot.clients =
      safeClone(
        homeStore.clients,
        []
      );

    snapshot.activity =
      safeClone(
        homeStore.activity,
        []
      );

    snapshot.collections =
      safeClone(
        getHomeCollectionsEnvelope(),
        {}
      );
  }

  if (includeHistory) {
    snapshot.history =
      safeClone(
        homeStore.history,
        []
      );
  }

  return snapshot;
}

/* =========================================================
   CLEAR / RESET
========================================================= */

export function clearHomeStore(options = {}) {
  const opts =
    safeObject(options);

  const next =
    createInitialHomeStore();

  Object.keys(homeStore).forEach((key) => {
    try {
      delete homeStore[key];
    } catch {}
  });

  Object.assign(
    homeStore,
    next
  );

  pushHistory(
    safeText(
      opts.reason,
      STORE_EVENTS.clear
    ),
    {}
  );

  rebuildAllIndexes();

  if (opts.notify !== false) {
    notifyStore(
      STORE_EVENTS.clear,
      {}
    );
  }

  return homeStore;
}

export function resetHomeStore(options = {}) {
  return clearHomeStore(options);
}

/* =========================================================
   LEGACY COMPAT ALIASES
========================================================= */

export const getDashboardStore =
  getHomeDashboardStore;

export const getWidgetsStore =
  getHomeWidgetsStore;

export const getSummaryStore =
  getHomeSummaryStore;

export const getStatsStore =
  getHomeStatsStore;

export const getTicketsStore =
  getHomeTicketsStore;

export const getIncidenciasStore =
  getHomeIncidenciasStore;

export const getFacturasStore =
  getHomeFacturasStore;

export const getInvoicesStore =
  getHomeInvoicesStore;

export const getUsersStore =
  getHomeUsersStore;

export const getUsuariosStore =
  getHomeUsuariosStore;

export const getClientsStore =
  getHomeClientsStore;

export const getClientesStore =
  getHomeClientesStore;

export const getRecentStore =
  getHomeRecentStore;

export const getActivityStore =
  getHomeActivityStore;

export const getWidgetByIdStore =
  getHomeWidgetByIdStore;

export const getTicketByIdStore =
  getHomeTicketByIdStore;

export const getInvoiceByIdStore =
  getHomeInvoiceByIdStore;

/* =========================================================
   DEBUG / BRIDGE
========================================================= */

export function exposeHomeStoreBridge() {
  const api =
    HomeStore;

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
   PUBLIC API
========================================================= */

export const HomeStore =
  Object.freeze({
    version:
      HOME_STORE_VERSION,

    source:
      HOME_STORE_SOURCE,

    state:
      homeStore,

    store:
      homeStore,

    subscribe:
      subscribeHomeStore,

    patch:
      patchHomeStore,

    replace:
      replaceHomeStore,

    merge:
      mergeHomeStore,

    clear:
      clearHomeStore,

    reset:
      resetHomeStore,

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

    getHomeCollectionsEnvelope,
    getHomeStoreSnapshot,

    exposeHomeStoreBridge,
  });

/* =========================================================
   EARLY SYNC
========================================================= */

try {
  syncAliases();
  rebuildAllIndexes();
  exposeHomeStoreBridge();
} catch {}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default HomeStore;
