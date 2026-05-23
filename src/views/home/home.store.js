/* =========================================================
   Onion Support - Home Store
   Archivo: /src/views/home/home.store.js

   Responsabilidad:
   - Cache runtime mínima de datos Home.
   - Recibir dashboard desde home.api.js / homeView.js.
   - Normalizar usando home.model.js sólo en escrituras.
   - Mantener aliases mínimos para template/selectors.
   - Separar Home admin/user desde el propio payload.
   - User nunca conserva usuarios/clientes de cache admin.
   - Preservar datos válidos sólo si el rol no cambia y se solicita.
   - Exponer getters usados por Home.
   - Normalizar incidencias con facturas + usuarios para detalle/modal.
   - No conservar raw/payload/response/data backend.
   - No conservar metadatos Cosmos.
   - Redactar errores/snapshots.
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

export const HOME_STORE_VERSION = "home.store.v8";
export const HOME_STORE_SOURCE = "views.home.store";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 5;

const RAW_KEYS = new Set([
  "raw",
  "response",
  "payload",
  "data",
  "body",
]);

const COSMOS_META_KEYS = new Set([
  "_id",
  "_rid",
  "_self",
  "_etag",
  "_attachments",
  "_ts",
  "_lsn",
  "_metadata",
]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|jwt|bearer|refresh|access_token|accessToken|id_token|idToken|otp|totp|mfa|2fa|backupCode|backup_code|sessionId|session_id|email|correo|phone|telefono|teléfono|address|direccion|dirección|nif|dni|iban|cuenta|bank|account|ipRaw|ip|userAgent/i;

const EMAIL_RE = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/gi;

const ADMIN_ENTITY_RE =
  /(^|[\s._/-])(clientes?|clients?|customers?|usuarios?|users?|members?|directorio|directory)([\s._/-]|$)/i;

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

function redact(value = "") {
  return String(value || "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(EMAIL_RE, "");
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

function normalizeRole(value = "", fallback = "user") {
  if (Array.isArray(value)) {
    const roles = value
      .map((item) => normalizeRole(item, ""))
      .filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return fallback;
  }

  const role = String(value || "").trim().toLowerCase();

  if (role === "admin") return "admin";
  if (role === "user") return "user";

  return fallback;
}

function isAdminRole(value = "") {
  return normalizeRole(value) === "admin";
}

function isSensitiveKey(key = "") {
  return SENSITIVE_KEY_RE.test(String(key || ""));
}

function sanitizeStoreValue(value, keyHint = "") {
  if (RAW_KEYS.has(keyHint)) return undefined;
  if (COSMOS_META_KEYS.has(keyHint)) return undefined;
  if (isSensitiveKey(keyHint)) return undefined;

  if (typeof value === "string") {
    return redact(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeStoreValue(item))
      .filter((item) => item !== undefined);
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (RAW_KEYS.has(key)) continue;
      if (COSMOS_META_KEYS.has(key)) continue;
      if (isSensitiveKey(key)) continue;

      const clean = sanitizeStoreValue(item, key);

      if (clean !== undefined) {
        output[key] = clean;
      }
    }

    return output;
  }

  return value;
}

function sanitizeStoreObject(value = {}) {
  return safeObject(sanitizeStoreValue(value), {});
}

function safePublicId(value = "") {
  const text = safeText(value, "");

  if (!text) return "";
  if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/i.test(text)) return "";
  if (/[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature)=/i.test(text)) return "";
  if (/Bearer\s+/i.test(text)) return "";

  return redact(text).slice(0, 240);
}

function normalizeError(error = null) {
  if (!error) return null;

  if (typeof error === "string") {
    return {
      name: "HomeStoreError",
      message: redact(safeText(error, "Error Home.")),
      code: "HOME_STORE_ERROR",
    };
  }

  const value = safeObject(error);

  return {
    name: safeText(value.name, "HomeStoreError"),
    message: redact(
      safeText(
        first(
          value.response?.data?.message,
          value.data?.message,
          value.message,
          value.detail,
          value.error,
          "Error Home."
        ),
        "Error Home."
      )
    ),
    code: safeText(
      first(
        value.code,
        value.status,
        value.statusCode,
        value.errorCode,
        "HOME_STORE_ERROR"
      ),
      "HOME_STORE_ERROR"
    ),
  };
}

function normalizeErrors(errors = []) {
  return safeArray(errors)
    .map((error) => normalizeError(error))
    .filter(Boolean);
}

function uniqueBy(items = [], picker = (item) => item) {
  const seen = new Set();
  const output = [];

  for (const item of safeArray(items)) {
    const raw = safePublicId(picker(item));
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
   ROLE / ADMIN FILTERS
========================================================= */

function roleFromSource(source = {}, fallback = "user") {
  const raw = safeObject(source);
  const meta = safeObject(raw.meta);
  const dashboard = safeObject(raw.dashboard);
  const dashboardMeta = safeObject(dashboard.meta);

  const role = normalizeRole(
    first(
      raw.role,
      raw.rol,
      raw.roles,

      meta.role,
      meta.rol,
      meta.roles,

      dashboard.role,
      dashboard.rol,
      dashboard.roles,

      dashboardMeta.role,
      dashboardMeta.rol,
      dashboardMeta.roles,

      ""
    ),
    ""
  );

  if (role) return role;

  if (
    raw.admin === true ||
    meta.admin === true ||
    dashboard.admin === true ||
    dashboardMeta.admin === true
  ) {
    return "admin";
  }

  if (
    raw.admin === false ||
    meta.admin === false ||
    dashboard.admin === false ||
    dashboardMeta.admin === false
  ) {
    return "user";
  }

  return normalizeRole(fallback, "user");
}

function isAdminEntityValue(value = "") {
  return ADMIN_ENTITY_RE.test(String(value || "").toLowerCase());
}

function isAdminOnlyActivity(item = {}) {
  const raw = safeObject(item);

  const identity = safeText(
    [
      raw.type,
      raw.kind,
      raw.category,
      raw.entity,
      raw.resource,
      raw.collection,
      raw.targetType,
      raw.meta?.type,
      raw.meta?.entity,
      raw.route,
      raw.href,
      raw.link,
      raw.to,
    ]
      .filter(Boolean)
      .join(" "),
    ""
  );

  return isAdminEntityValue(identity);
}

function filterActivityForRole(items = [], admin = false) {
  const rows = safeArray(items);
  return admin ? rows : rows.filter((item) => !isAdminOnlyActivity(item));
}

function isAdminOnlyWidget(item = {}) {
  const raw = safeObject(item);

  const identity = safeText(
    [
      raw.widgetId,
      raw.widgetKey,
      raw.id,
      raw.key,
      raw.slug,
      raw.code,
      raw.type,
      raw.kind,
      raw.variant,
      raw.category,
      raw.title,
      raw.name,
      raw.route,
      raw.href,
      raw.link,
      raw.to,
    ]
      .filter(Boolean)
      .join(" "),
    ""
  );

  return isAdminEntityValue(identity);
}

function filterWidgetsForRole(items = [], admin = false) {
  const rows = safeArray(items);
  return admin ? rows : rows.filter((item) => !isAdminOnlyWidget(item));
}

function sanitizeSummaryForRole(summary = {}, admin = false) {
  const output = sanitizeStoreObject(summary);

  if (!admin) {
    output.usersCount = 0;
    output.usuariosCount = 0;
    output.totalUsers = 0;
    output.totalUsuarios = 0;
    output.usersTotal = 0;
    output.usuariosTotal = 0;
    output.visibleUsersCount = 0;
    output.visibleUsuariosCount = 0;

    output.clientsCount = 0;
    output.clientesCount = 0;
    output.customersCount = 0;
    output.totalClients = 0;
    output.totalClientes = 0;
    output.totalCustomers = 0;
    output.clientsTotal = 0;
    output.clientesTotal = 0;
    output.customersTotal = 0;
    output.visibleClientsCount = 0;
    output.visibleClientesCount = 0;
    output.visibleCustomersCount = 0;
  }

  return output;
}

/* =========================================================
   IDS
========================================================= */

function widgetId(item = {}) {
  const raw = safeObject(item);

  return safePublicId(
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
    )
  );
}

function ticketId(item = {}) {
  return safePublicId(getHomeTicketId?.(item));
}

function invoiceId(item = {}) {
  return safePublicId(getHomeInvoiceId?.(item));
}

function userId(item = {}) {
  return safePublicId(getHomeUserId?.(item));
}

function clientId(item = {}) {
  return safePublicId(getHomeClientId?.(item));
}

/* =========================================================
   NORMALIZE COLLECTIONS
========================================================= */

function normalizeInvoicesForStore(items = []) {
  return uniqueBy(
    normalizeHomeInvoices(items),
    invoiceId
  );
}

function normalizeUsersForStore(items = [], admin = currentIsAdmin()) {
  if (!admin) return [];

  return uniqueBy(
    normalizeHomeUsers(items),
    userId
  );
}

function normalizeClientsForStore(items = [], admin = currentIsAdmin()) {
  if (!admin) return [];

  return uniqueBy(
    normalizeHomeClients(items),
    clientId
  );
}

function normalizeTicketsForStore(items = [], {
  invoices = [],
  users = [],
  admin = currentIsAdmin(),
} = {}) {
  const normalizedInvoices = normalizeInvoicesForStore(invoices);
  const normalizedUsers = admin ? normalizeUsersForStore(users, admin) : [];

  return uniqueBy(
    normalizeHomeTickets(items, {
      invoices: normalizedInvoices,
      users: normalizedUsers,
    }),
    ticketId
  );
}

function normalizeWidgetsForStore(items = [], admin = currentIsAdmin()) {
  return filterWidgetsForRole(
    uniqueBy(
      normalizeHomeWidgets(items),
      widgetId
    ),
    admin
  );
}

function normalizeActivityForStore(items = [], admin = currentIsAdmin()) {
  return filterActivityForRole(
    normalizeHomeActivityList(items),
    admin
  );
}

/* =========================================================
   INITIAL STORE
========================================================= */

export function createInitialHomeStore(seed = {}) {
  const raw = sanitizeStoreObject(seed);
  const role = roleFromSource(raw, "user");
  const admin = isAdminRole(role);

  const summary = sanitizeSummaryForRole(
    first(raw.summary, raw.stats, raw.metrics, raw.totals, raw.counts, {}),
    admin
  );

  const invoices = normalizeInvoicesForStore(firstArray(raw.invoices, raw.facturas) || []);
  const users = normalizeUsersForStore(firstArray(raw.users, raw.usuarios) || [], admin);
  const clients = normalizeClientsForStore(firstArray(raw.clients, raw.clientes, raw.customers) || [], admin);

  const tickets = normalizeTicketsForStore(firstArray(raw.tickets, raw.incidencias) || [], {
    invoices,
    users,
    admin,
  });

  const widgets = normalizeWidgetsForStore(
    firstArray(raw.widgets, raw.cards, raw.kpis, raw.blocks) || [],
    admin
  );

  const activity = normalizeActivityForStore(
    firstArray(raw.activity, raw.activities, raw.recent, raw.recentActivity) || [],
    admin
  );

  return {
    version: HOME_STORE_VERSION,
    source: HOME_STORE_SOURCE,

    role,
    admin,

    hydrated: false,
    loaded: false,
    loading: false,
    refreshing: false,

    page: DEFAULT_PAGE,
    pageSize: DEFAULT_PAGE_SIZE,

    requestId: "",
    lastSyncAt: "",
    updatedAt: "",

    dashboard: sanitizeStoreObject(raw.dashboard),

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
    ticketsRemoteCount: Math.max(tickets.length, safeNumber(raw.ticketsRemoteCount, 0)),
    remoteCount: Math.max(tickets.length, safeNumber(raw.remoteCount, 0)),

    invoices,
    facturas: invoices,
    invoicesRemoteCount: Math.max(invoices.length, safeNumber(raw.invoicesRemoteCount, 0)),

    users,
    usuarios: users,
    usersRemoteCount: admin ? Math.max(users.length, safeNumber(raw.usersRemoteCount, 0)) : 0,

    clients,
    clientes: clients,
    customers: clients,
    clientsRemoteCount: admin ? Math.max(clients.length, safeNumber(raw.clientsRemoteCount, 0)) : 0,

    activity,
    activities: activity,
    recent: activity,
    recentActivity: activity,

    error: null,
    errorMessage: "",

    partial: false,
    errors: [],
    modules: {},
  };
}

export const homeStore = createInitialHomeStore();

/* =========================================================
   NORMALIZE PAYLOAD
========================================================= */

function currentRole() {
  return normalizeRole(
    first(
      homeStore.role,
      homeStore.dashboard?.role,
      homeStore.dashboard?.meta?.role,
      "user"
    )
  );
}

function currentIsAdmin() {
  return isAdminRole(currentRole());
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

function sanitizeModules(modules = {}) {
  const output = {};

  for (const [key, value] of Object.entries(safeObject(modules))) {
    const module = safeObject(value);

    output[key] = {
      ok: module.ok === true,
      skipped: module.skipped === true,
      listOk: module.listOk === true,
      status: safeNumber(module.status, 0),
      endpoint: safeText(module.endpoint, ""),
      soft: module.soft === true,
      configured: module.configured === true,
      error: module.error ? normalizeError(module.error) : null,
    };
  }

  return sanitizeStoreObject(output);
}

function selectDashboardPayload(rawInput = {}) {
  return safeObject(
    first(
      rawInput.dashboard,
      rawInput.home,
      rawInput.data?.dashboard,
      rawInput.payload?.dashboard,
      rawInput.result?.dashboard,
      rawInput.response?.dashboard,
      rawInput
    )
  );
}

function normalizeDashboard(input = {}, options = {}) {
  const raw = sanitizeStoreObject(input);
  const role = normalizeRole(options.role || roleFromSource(raw, currentRole()));
  const admin = isAdminRole(role);

  try {
    return sanitizeStoreObject(
      normalizeHomeDashboard({
        ...raw,

        role,
        admin,

        users: admin ? raw.users : [],
        usuarios: admin ? raw.usuarios : [],

        clients: admin ? raw.clients : [],
        clientes: admin ? raw.clientes : [],
        customers: admin ? raw.customers : [],

        meta: {
          ...safeObject(raw.meta),
          role,
          admin,
        },
      })
    );
  } catch {
    return sanitizeStoreObject({
      ...safeObject(options.previousDashboard),
      ...raw,

      role,
      admin,

      users: admin ? raw.users : [],
      usuarios: admin ? raw.usuarios : [],

      clients: admin ? raw.clients : [],
      clientes: admin ? raw.clientes : [],
      customers: admin ? raw.customers : [],

      meta: {
        ...safeObject(options.previousDashboard?.meta),
        ...safeObject(raw.meta),
        role,
        admin,
      },
    });
  }
}

function normalizedPayload(payload = {}, options = {}) {
  const rawInput = safeObject(payload);
  const input = sanitizeStoreObject(rawInput);
  const opts = safeObject(options);

  const sourceDashboard = sanitizeStoreObject(selectDashboardPayload(rawInput));

  const role = roleFromSource(
    {
      ...sourceDashboard,
      role: first(input.role, rawInput.meta?.role, sourceDashboard.role),
      admin: first(input.admin, rawInput.meta?.admin, sourceDashboard.admin),
      meta: {
        ...safeObject(sourceDashboard.meta),
        role: first(input.meta?.role, rawInput.meta?.role, sourceDashboard.meta?.role, input.role),
        admin: first(input.meta?.admin, rawInput.meta?.admin, sourceDashboard.meta?.admin, input.admin),
      },
    },
    opts.role || currentRole()
  );

  const admin = isAdminRole(role);

  const dashboard = normalizeDashboard(sourceDashboard, {
    role,
    previousDashboard: opts.preserveExisting === false ? {} : homeStore.dashboard,
  });

  const rawSummary = sanitizeStoreObject(
    first(
      input.summary,
      input.stats,
      input.metrics,
      input.totals,
      input.counts,
      {}
    )
  );

  const summary = sanitizeSummaryForRole(
    {
      ...rawSummary,
      ...safeObject(dashboard.summary),
      ...safeObject(dashboard.stats),
      ...safeObject(dashboard.metrics),
      ...safeObject(dashboard.totals),
      ...safeObject(dashboard.counts),
    },
    admin
  );

  const widgets = normalizeWidgetsForStore(
    firstArray(
      input.widgets,
      input.cards,
      input.kpis,
      input.blocks,
      dashboard.widgets,
      dashboard.cards,
      dashboard.kpis,
      dashboard.blocks
    ) || [],
    admin
  );

  const invoices = normalizeInvoicesForStore(
    firstArray(
      input.invoices,
      input.facturas,
      dashboard.invoices,
      dashboard.facturas
    ) || []
  );

  const users = normalizeUsersForStore(
    firstArray(
      input.users,
      input.usuarios,
      dashboard.users,
      dashboard.usuarios
    ) || [],
    admin
  );

  const clients = normalizeClientsForStore(
    firstArray(
      input.clients,
      input.clientes,
      input.customers,
      dashboard.clients,
      dashboard.clientes,
      dashboard.customers
    ) || [],
    admin
  );

  const tickets = normalizeTicketsForStore(
    firstArray(
      input.tickets,
      input.incidencias,
      dashboard.tickets,
      dashboard.incidencias
    ) || [],
    {
      invoices,
      users,
      admin,
    }
  );

  const activity = normalizeActivityForStore(
    firstArray(
      input.activity,
      input.activities,
      input.recent,
      input.recentActivity,
      dashboard.activity,
      dashboard.activities,
      dashboard.recent,
      dashboard.recentActivity
    ) || [],
    admin
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

  const usersRemoteCount = admin
    ? countFrom({
        explicit: first(input.usersRemoteCount, input.usuariosRemoteCount, dashboard.usersRemoteCount),
        summary,
        dashboard,
        keys: ["usersCount", "usuariosCount", "totalUsers", "totalUsuarios"],
        fallback: users.length,
      })
    : 0;

  const clientsRemoteCount = admin
    ? countFrom({
        explicit: first(input.clientsRemoteCount, input.clientesRemoteCount, input.customersRemoteCount, dashboard.clientsRemoteCount),
        summary,
        dashboard,
        keys: ["clientsCount", "clientesCount", "customersCount", "totalClients", "totalClientes", "totalCustomers"],
        fallback: clients.length,
      })
    : 0;

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

  const modules = sanitizeModules({
    ...safeObject(dashboard.modules),
    ...safeObject(input.modules),
  });

  const errors = normalizeErrors(first(input.errors, dashboard.errors, []));

  return sanitizeStoreObject({
    version: HOME_STORE_VERSION,
    source: HOME_STORE_SOURCE,

    role,
    admin,

    dashboard: {
      ...dashboard,

      role,
      admin,

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

      invoices,
      facturas: invoices,

      users: admin ? users : [],
      usuarios: admin ? users : [],

      clients: admin ? clients : [],
      clientes: admin ? clients : [],
      customers: admin ? clients : [],

      activity,
      activities: activity,
      recent: activity,
      recentActivity: activity,

      requestId,
      updatedAt,
      lastSyncAt,

      modules,
      partial: Boolean(first(input.partial, dashboard.partial, false)),
      errors,

      meta: {
        ...safeObject(dashboard.meta),

        role,
        admin,

        requestId,
        updatedAt,
        lastSyncAt,

        widgetsCount: widgets.length,

        ticketsCount: ticketsRemoteCount,
        incidenciasCount: ticketsRemoteCount,
        visibleTicketsCount: tickets.length,
        visibleIncidenciasCount: tickets.length,

        invoicesCount: invoicesRemoteCount,
        facturasCount: invoicesRemoteCount,
        visibleInvoicesCount: invoices.length,
        visibleFacturasCount: invoices.length,

        usersCount: admin ? usersRemoteCount : 0,
        usuariosCount: admin ? usersRemoteCount : 0,
        visibleUsersCount: admin ? users.length : 0,
        visibleUsuariosCount: admin ? users.length : 0,

        clientsCount: admin ? clientsRemoteCount : 0,
        clientesCount: admin ? clientsRemoteCount : 0,
        customersCount: admin ? clientsRemoteCount : 0,
        visibleClientsCount: admin ? clients.length : 0,
        visibleClientesCount: admin ? clients.length : 0,
        visibleCustomersCount: admin ? clients.length : 0,

        activityCount: activity.length,
      },
    },

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

    users: admin ? users : [],
    usuarios: admin ? users : [],
    usersRemoteCount: admin ? usersRemoteCount : 0,

    clients: admin ? clients : [],
    clientes: admin ? clients : [],
    customers: admin ? clients : [],
    clientsRemoteCount: admin ? clientsRemoteCount : 0,

    activity,
    activities: activity,
    recent: activity,
    recentActivity: activity,

    requestId,
    lastSyncAt,
    updatedAt,

    modules,
    partial: Boolean(first(input.partial, dashboard.partial, false)),
    errors,

    loaded: opts.loaded ?? true,
    hydrated: opts.hydrated ?? true,
    loading: false,
    refreshing: false,
    error: null,
    errorMessage: "",
  });
}

function preserveExisting(next = {}, options = {}) {
  const opts = safeObject(options);
  const role = normalizeRole(first(next.role, "user"));
  const admin = isAdminRole(role);
  const sameRole = normalizeRole(homeStore.role) === role;

  if (opts.replace === true || opts.preserveExisting === false || !sameRole) {
    return sanitizeStoreObject(next);
  }

  const output = sanitizeStoreObject(next);

  for (const key of ["widgets", "tickets", "invoices", "activity"]) {
    if (!safeArray(output[key]).length && safeArray(homeStore[key]).length) {
      output[key] = homeStore[key];
    }
  }

  if (admin) {
    for (const key of ["users", "clients"]) {
      if (!safeArray(output[key]).length && safeArray(homeStore[key]).length) {
        output[key] = homeStore[key];
      }
    }
  } else {
    output.users = [];
    output.usuarios = [];
    output.usersRemoteCount = 0;

    output.clients = [];
    output.clientes = [];
    output.customers = [];
    output.clientsRemoteCount = 0;
  }

  if (!hasKeys(output.summary) && hasKeys(homeStore.summary)) {
    output.summary = sanitizeSummaryForRole(homeStore.summary, admin);
  }

  output.widgets = normalizeWidgetsForStore(output.widgets, admin);
  output.invoices = normalizeInvoicesForStore(output.invoices);
  output.users = normalizeUsersForStore(output.users, admin);
  output.clients = normalizeClientsForStore(output.clients, admin);
  output.tickets = normalizeTicketsForStore(output.tickets, {
    invoices: output.invoices,
    users: output.users,
    admin,
  });
  output.activity = normalizeActivityForStore(output.activity, admin);

  output.summary = sanitizeSummaryForRole(output.summary, admin);

  output.ticketsRemoteCount = Math.max(homeStore.ticketsRemoteCount, output.ticketsRemoteCount || 0, safeArray(output.tickets).length);
  output.remoteCount = Math.max(homeStore.remoteCount, output.remoteCount || 0, output.ticketsRemoteCount);

  output.invoicesRemoteCount = Math.max(homeStore.invoicesRemoteCount, output.invoicesRemoteCount || 0, safeArray(output.invoices).length);

  output.usersRemoteCount = admin
    ? Math.max(homeStore.usersRemoteCount, output.usersRemoteCount || 0, safeArray(output.users).length)
    : 0;

  output.clientsRemoteCount = admin
    ? Math.max(homeStore.clientsRemoteCount, output.clientsRemoteCount || 0, safeArray(output.clients).length)
    : 0;

  return sanitizeStoreObject(output);
}

/* =========================================================
   SYNC / ASSIGN
========================================================= */

function buildDashboardFromStore() {
  const role = normalizeRole(homeStore.role);
  const admin = isAdminRole(role);

  return sanitizeStoreObject({
    ...safeObject(homeStore.dashboard),

    role,
    admin,

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

    users: admin ? homeStore.users : [],
    usuarios: admin ? homeStore.users : [],

    clients: admin ? homeStore.clients : [],
    clientes: admin ? homeStore.clients : [],
    customers: admin ? homeStore.clients : [],

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

    invoicesTotal: homeStore.invoicesRemoteCount,
    facturasTotal: homeStore.invoicesRemoteCount,
    totalInvoices: homeStore.invoicesRemoteCount,
    totalFacturas: homeStore.invoicesRemoteCount,
    invoicesCount: homeStore.invoicesRemoteCount,
    facturasCount: homeStore.invoicesRemoteCount,

    usersTotal: admin ? homeStore.usersRemoteCount : 0,
    usuariosTotal: admin ? homeStore.usersRemoteCount : 0,
    totalUsers: admin ? homeStore.usersRemoteCount : 0,
    totalUsuarios: admin ? homeStore.usersRemoteCount : 0,
    usersCount: admin ? homeStore.usersRemoteCount : 0,
    usuariosCount: admin ? homeStore.usersRemoteCount : 0,

    clientsTotal: admin ? homeStore.clientsRemoteCount : 0,
    clientesTotal: admin ? homeStore.clientsRemoteCount : 0,
    customersTotal: admin ? homeStore.clientsRemoteCount : 0,
    totalClients: admin ? homeStore.clientsRemoteCount : 0,
    totalClientes: admin ? homeStore.clientsRemoteCount : 0,
    totalCustomers: admin ? homeStore.clientsRemoteCount : 0,
    clientsCount: admin ? homeStore.clientsRemoteCount : 0,
    clientesCount: admin ? homeStore.clientsRemoteCount : 0,
    customersCount: admin ? homeStore.clientsRemoteCount : 0,

    requestId: homeStore.requestId,
    updatedAt: homeStore.updatedAt || homeStore.lastSyncAt,
    lastSyncAt: homeStore.lastSyncAt,

    modules: homeStore.modules,
    partial: Boolean(homeStore.partial),
    errors: homeStore.errors,

    meta: {
      ...safeObject(homeStore.dashboard?.meta),

      role,
      admin,

      requestId: homeStore.requestId,
      updatedAt: homeStore.updatedAt || homeStore.lastSyncAt,
      lastSyncAt: homeStore.lastSyncAt,

      widgetsCount: homeStore.widgets.length,

      ticketsCount: homeStore.ticketsRemoteCount,
      incidenciasCount: homeStore.ticketsRemoteCount,
      visibleTicketsCount: homeStore.tickets.length,
      visibleIncidenciasCount: homeStore.tickets.length,

      invoicesCount: homeStore.invoicesRemoteCount,
      facturasCount: homeStore.invoicesRemoteCount,
      visibleInvoicesCount: homeStore.invoices.length,
      visibleFacturasCount: homeStore.invoices.length,

      usersCount: admin ? homeStore.usersRemoteCount : 0,
      usuariosCount: admin ? homeStore.usersRemoteCount : 0,
      visibleUsersCount: admin ? homeStore.users.length : 0,
      visibleUsuariosCount: admin ? homeStore.users.length : 0,

      clientsCount: admin ? homeStore.clientsRemoteCount : 0,
      clientesCount: admin ? homeStore.clientsRemoteCount : 0,
      customersCount: admin ? homeStore.clientsRemoteCount : 0,
      visibleClientsCount: admin ? homeStore.clients.length : 0,
      visibleClientesCount: admin ? homeStore.clients.length : 0,
      visibleCustomersCount: admin ? homeStore.clients.length : 0,

      activityCount: homeStore.activity.length,
    },
  });
}

function syncAliases() {
  const role = normalizeRole(homeStore.role);
  const admin = isAdminRole(role);

  homeStore.version = HOME_STORE_VERSION;
  homeStore.source = HOME_STORE_SOURCE;

  homeStore.role = role;
  homeStore.admin = admin;

  homeStore.invoices = normalizeInvoicesForStore(homeStore.invoices);
  homeStore.users = normalizeUsersForStore(homeStore.users, admin);
  homeStore.clients = normalizeClientsForStore(homeStore.clients, admin);

  homeStore.tickets = normalizeTicketsForStore(homeStore.tickets, {
    invoices: homeStore.invoices,
    users: homeStore.users,
    admin,
  });

  homeStore.widgets = normalizeWidgetsForStore(homeStore.widgets, admin);
  homeStore.activity = normalizeActivityForStore(homeStore.activity, admin);
  homeStore.summary = sanitizeSummaryForRole(homeStore.summary, admin);

  homeStore.stats = homeStore.summary;
  homeStore.metrics = homeStore.summary;
  homeStore.totals = homeStore.summary;
  homeStore.counts = homeStore.summary;

  homeStore.cards = homeStore.widgets;
  homeStore.kpis = homeStore.widgets;
  homeStore.blocks = homeStore.widgets;

  homeStore.incidencias = homeStore.tickets;
  homeStore.facturas = homeStore.invoices;

  homeStore.usuarios = admin ? homeStore.users : [];
  homeStore.clientes = admin ? homeStore.clients : [];
  homeStore.customers = admin ? homeStore.clients : [];

  homeStore.ticketsRemoteCount = Math.max(homeStore.tickets.length, safeNumber(homeStore.ticketsRemoteCount, 0));
  homeStore.remoteCount = Math.max(homeStore.ticketsRemoteCount, safeNumber(homeStore.remoteCount, 0));

  homeStore.invoicesRemoteCount = Math.max(homeStore.invoices.length, safeNumber(homeStore.invoicesRemoteCount, 0));

  homeStore.usersRemoteCount = admin
    ? Math.max(homeStore.users.length, safeNumber(homeStore.usersRemoteCount, 0))
    : 0;

  homeStore.clientsRemoteCount = admin
    ? Math.max(homeStore.clients.length, safeNumber(homeStore.clientsRemoteCount, 0))
    : 0;

  homeStore.activities = homeStore.activity;
  homeStore.recent = homeStore.activity;
  homeStore.recentActivity = homeStore.activity;

  homeStore.modules = sanitizeModules(homeStore.modules);
  homeStore.errors = normalizeErrors(homeStore.errors);
  homeStore.error = homeStore.error ? normalizeError(homeStore.error) : null;
  homeStore.errorMessage = redact(safeText(homeStore.errorMessage, ""));

  homeStore.page = Math.max(1, safeNumber(homeStore.page, DEFAULT_PAGE));
  homeStore.pageSize = Math.max(1, safeNumber(homeStore.pageSize, DEFAULT_PAGE_SIZE));

  homeStore.dashboard = buildDashboardFromStore();

  return homeStore;
}

function assignStore(patch = {}) {
  Object.assign(homeStore, sanitizeStoreObject(patch));
  syncAliases();

  return homeStore;
}

function assignFlags(patch = {}) {
  Object.assign(homeStore, sanitizeStoreObject(patch));

  homeStore.error = homeStore.error ? normalizeError(homeStore.error) : null;
  homeStore.errorMessage = redact(safeText(homeStore.errorMessage, ""));
  homeStore.page = Math.max(1, safeNumber(homeStore.page, DEFAULT_PAGE));
  homeStore.pageSize = Math.max(1, safeNumber(homeStore.pageSize, DEFAULT_PAGE_SIZE));

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

function patchNeedsNormalization(data = {}) {
  return Boolean(
    data.dashboard ||
      data.summary ||
      data.stats ||
      data.metrics ||
      data.totals ||
      data.counts ||
      data.widgets ||
      data.cards ||
      data.kpis ||
      data.blocks ||
      data.tickets ||
      data.incidencias ||
      data.invoices ||
      data.facturas ||
      data.users ||
      data.usuarios ||
      data.clients ||
      data.clientes ||
      data.customers ||
      data.activity ||
      data.activities ||
      data.recent ||
      data.recentActivity
  );
}

export function patchHomeStore(patch = {}, options = {}) {
  const opts = safeObject(options);
  const data = sanitizeStoreObject(patch);

  if (opts.normalize === true || patchNeedsNormalization(data)) {
    return replaceHomeStore(data, {
      ...opts,
      preserveExisting: opts.preserveExisting !== false,
    });
  }

  return assignFlags(data);
}

export function clearHomeStore() {
  Object.keys(homeStore).forEach((key) => {
    delete homeStore[key];
  });

  Object.assign(homeStore, createInitialHomeStore());

  return homeStore;
}

export function resetHomeStore() {
  return clearHomeStore();
}

/* =========================================================
   COLLECTION SETTERS
========================================================= */

export function setHomeWidgetsStore(widgets = [], options = {}) {
  return replaceHomeStore(
    {
      widgets,
    },
    {
      ...safeObject(options),
      preserveExisting: true,
    }
  ).widgets;
}

export function setHomeTicketsStore(tickets = [], options = {}) {
  const admin = currentIsAdmin();
  const invoices = getHomeInvoicesStore();
  const users = admin ? getHomeUsersStore() : [];
  const rows = normalizeTicketsForStore(tickets, {
    invoices,
    users,
    admin,
  });

  const remoteCount = Math.max(rows.length, safeNumber(options.remoteCount, homeStore.ticketsRemoteCount));

  return replaceHomeStore(
    {
      tickets: rows,
      ticketsRemoteCount: remoteCount,
      remoteCount,
    },
    {
      ...safeObject(options),
      preserveExisting: true,
    }
  ).tickets;
}

export function setHomeInvoicesStore(invoices = [], options = {}) {
  const rows = normalizeInvoicesForStore(invoices);

  return replaceHomeStore(
    {
      invoices: rows,
      invoicesRemoteCount: Math.max(rows.length, safeNumber(options.remoteCount, homeStore.invoicesRemoteCount)),
    },
    {
      ...safeObject(options),
      preserveExisting: true,
    }
  ).invoices;
}

export function setHomeUsersStore(users = [], options = {}) {
  if (!currentIsAdmin()) {
    return replaceHomeStore(
      {
        users: [],
        usuarios: [],
        usersRemoteCount: 0,
      },
      {
        ...safeObject(options),
        replace: true,
      }
    ).users;
  }

  const rows = normalizeUsersForStore(users, true);

  return replaceHomeStore(
    {
      users: rows,
      usersRemoteCount: Math.max(rows.length, safeNumber(options.remoteCount, homeStore.usersRemoteCount)),
    },
    {
      ...safeObject(options),
      preserveExisting: true,
    }
  ).users;
}

export function setHomeClientsStore(clients = [], options = {}) {
  if (!currentIsAdmin()) {
    return replaceHomeStore(
      {
        clients: [],
        clientes: [],
        customers: [],
        clientsRemoteCount: 0,
      },
      {
        ...safeObject(options),
        replace: true,
      }
    ).clients;
  }

  const rows = normalizeClientsForStore(clients, true);

  return replaceHomeStore(
    {
      clients: rows,
      clientsRemoteCount: Math.max(rows.length, safeNumber(options.remoteCount, homeStore.clientsRemoteCount)),
    },
    {
      ...safeObject(options),
      preserveExisting: true,
    }
  ).clients;
}

export function setHomeActivityStore(activity = [], options = {}) {
  return replaceHomeStore(
    {
      activity,
    },
    {
      ...safeObject(options),
      preserveExisting: true,
    }
  ).activity;
}

export function setHomeCollectionsStore(collections = {}, options = {}) {
  const input = sanitizeStoreObject(collections);
  const role = roleFromSource(input, currentRole());
  const admin = isAdminRole(role);

  return replaceHomeStore(
    {
      role,
      admin,

      widgets: filterWidgetsForRole(firstArray(input.widgets, input.cards, input.kpis, input.blocks) || [], admin),
      tickets: firstArray(input.tickets, input.incidencias) || [],
      invoices: firstArray(input.invoices, input.facturas) || [],

      users: admin ? firstArray(input.users, input.usuarios) || [] : [],
      clients: admin ? firstArray(input.clients, input.clientes, input.customers) || [] : [],

      activity: filterActivityForRole(firstArray(input.activity, input.activities, input.recent, input.recentActivity) || [], admin),

      ticketsRemoteCount: first(input.ticketsRemoteCount, input.remoteCount, input.totalTickets, input.incidenciasTotal),
      invoicesRemoteCount: first(input.invoicesRemoteCount, input.facturasRemoteCount, input.totalInvoices, input.totalFacturas),

      usersRemoteCount: admin
        ? first(input.usersRemoteCount, input.usuariosRemoteCount, input.totalUsers, input.totalUsuarios)
        : 0,

      clientsRemoteCount: admin
        ? first(input.clientsRemoteCount, input.clientesRemoteCount, input.customersRemoteCount, input.totalClients, input.totalClientes, input.totalCustomers)
        : 0,
    },
    {
      ...safeObject(options),
      preserveExisting: options.preserveExisting !== false,
      replace: options.replace === true || role !== currentRole() || !admin,
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
    .map(safePublicId)
    .map(normalizeKey)
    .filter(Boolean);
}

export function upsertHomeWidgetStore(widget = {}) {
  const admin = currentIsAdmin();
  const item = normalizeHomeWidgets([widget])[0] || sanitizeStoreObject(widget);

  if (!hasKeys(item)) return null;
  if (!admin && isAdminOnlyWidget(item)) return null;

  const keys = widgetKeys(item);
  const rows = [...homeStore.widgets];

  const index = rows.findIndex((row) => {
    const rowKeys = widgetKeys(row);
    return rowKeys.some((key) => keys.includes(key));
  });

  if (index >= 0) {
    rows[index] = sanitizeStoreObject({
      ...safeObject(rows[index]),
      ...item,
    });
  } else {
    rows.push(item);
  }

  setHomeWidgetsStore(rows, {
    replace: true,
  });

  return item;
}

export function removeHomeWidgetStore(widgetId = "") {
  const id = normalizeKey(safePublicId(widgetId));

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
  const loading = safeBoolean(value, false);

  return assignFlags({
    loading,
    refreshing: loading ? false : homeStore.refreshing,
  });
}

export function setHomeStoreRefreshing(value = false) {
  const refreshing = safeBoolean(value, false);

  return assignFlags({
    refreshing,
    loading: refreshing ? false : homeStore.loading,
  });
}

export function setHomeStoreError(error = null) {
  const normalized = normalizeError(error);

  return assignFlags({
    error: normalized,
    errorMessage: normalized?.message || "",
    loading: false,
    refreshing: false,
  });
}

export function setHomeStoreLoaded(value = true) {
  const loaded = safeBoolean(value, true);

  return assignFlags({
    loaded,
    loading: loaded ? false : homeStore.loading,
    refreshing: loaded ? false : homeStore.refreshing,
  });
}

export function setHomeStoreHydrated(value = true) {
  return assignFlags({
    hydrated: safeBoolean(value, true),
  });
}

export function setHomeStoreRequestId(requestId = "") {
  return assignFlags({
    requestId: safeText(requestId, ""),
  });
}

export function setHomeStoreLastSyncAt(value = null) {
  const next = value || nowIso();

  return assignFlags({
    lastSyncAt: next,
    updatedAt: next,
  });
}

export function setHomeStorePage(page = DEFAULT_PAGE) {
  return assignFlags({
    page: Math.max(1, safeNumber(page, DEFAULT_PAGE)),
  });
}

export function setHomeStorePageSize(pageSize = DEFAULT_PAGE_SIZE) {
  return assignFlags({
    page: DEFAULT_PAGE,
    pageSize: Math.max(1, safeNumber(pageSize, DEFAULT_PAGE_SIZE)),
  });
}

/* =========================================================
   GETTERS
========================================================= */

export function getHomeStore() {
  return homeStore;
}

export function getHomeDashboardStore() {
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
  return currentIsAdmin() ? safeArray(homeStore.users) : [];
}

export function getHomeUsuariosStore() {
  return getHomeUsersStore();
}

export function getHomeClientsStore() {
  return currentIsAdmin() ? safeArray(homeStore.clients) : [];
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

function findById(items = [], id = "", picker = null) {
  const target = normalizeKey(safePublicId(id));

  if (!target) return null;

  return (
    safeArray(items).find((item) => {
      const keys = [
        picker ? picker(item) : "",
        item?.id,
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
        item?.username,
        item?.title,
        item?.name,
        item?.nombre,
      ]
        .map(safePublicId)
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
  return currentIsAdmin() ? findById(homeStore.users, id, userId) : null;
}

export function getHomeClientByIdStore(id = "") {
  return currentIsAdmin() ? findById(homeStore.clients, id, clientId) : null;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function collectionEnvelope(items = [], total = null) {
  const rows = safeArray(items);
  const remote = Math.max(rows.length, safeNumber(total, rows.length));

  return sanitizeStoreObject({
    items: rows,
    rows,
    results: rows,
    total: remote,
    count: rows.length,
    totalCount: remote,
    remoteCount: remote,
    visibleCount: rows.length,
  });
}

export function getHomeCollectionsEnvelope() {
  const admin = currentIsAdmin();

  return sanitizeStoreObject({
    widgets: collectionEnvelope(homeStore.widgets, homeStore.widgets.length),
    cards: collectionEnvelope(homeStore.widgets, homeStore.widgets.length),
    kpis: collectionEnvelope(homeStore.widgets, homeStore.widgets.length),
    blocks: collectionEnvelope(homeStore.widgets, homeStore.widgets.length),

    tickets: collectionEnvelope(homeStore.tickets, homeStore.ticketsRemoteCount),
    incidencias: collectionEnvelope(homeStore.tickets, homeStore.ticketsRemoteCount),

    invoices: collectionEnvelope(homeStore.invoices, homeStore.invoicesRemoteCount),
    facturas: collectionEnvelope(homeStore.invoices, homeStore.invoicesRemoteCount),

    users: collectionEnvelope(admin ? homeStore.users : [], admin ? homeStore.usersRemoteCount : 0),
    usuarios: collectionEnvelope(admin ? homeStore.users : [], admin ? homeStore.usersRemoteCount : 0),

    clients: collectionEnvelope(admin ? homeStore.clients : [], admin ? homeStore.clientsRemoteCount : 0),
    clientes: collectionEnvelope(admin ? homeStore.clients : [], admin ? homeStore.clientsRemoteCount : 0),
    customers: collectionEnvelope(admin ? homeStore.clients : [], admin ? homeStore.clientsRemoteCount : 0),

    activity: collectionEnvelope(homeStore.activity, homeStore.activity.length),
    activities: collectionEnvelope(homeStore.activity, homeStore.activity.length),
    recent: collectionEnvelope(homeStore.activity, homeStore.activity.length),
    recentActivity: collectionEnvelope(homeStore.activity, homeStore.activity.length),
  });
}

export function getHomeStoreSnapshot(options = {}) {
  const admin = currentIsAdmin();
  const includeCollections = options.includeCollections === true;

  const snapshot = {
    version: HOME_STORE_VERSION,
    source: HOME_STORE_SOURCE,

    role: homeStore.role,
    admin,

    hydrated: Boolean(homeStore.hydrated),
    loaded: Boolean(homeStore.loaded),
    loading: Boolean(homeStore.loading),
    refreshing: Boolean(homeStore.refreshing),

    page: safeNumber(homeStore.page, DEFAULT_PAGE),
    pageSize: safeNumber(homeStore.pageSize, DEFAULT_PAGE_SIZE),

    requestId: safeText(homeStore.requestId, ""),
    lastSyncAt: homeStore.lastSyncAt || null,
    updatedAt: homeStore.updatedAt || null,

    hasDashboard: hasKeys(homeStore.dashboard),
    hasSummary: hasKeys(homeStore.summary),

    widgetsCount: homeStore.widgets.length,

    ticketsVisibleCount: homeStore.tickets.length,
    ticketsRemoteCount: homeStore.ticketsRemoteCount,

    invoicesVisibleCount: homeStore.invoices.length,
    invoicesRemoteCount: homeStore.invoicesRemoteCount,

    usersVisibleCount: admin ? homeStore.users.length : 0,
    usersRemoteCount: admin ? homeStore.usersRemoteCount : 0,

    clientsVisibleCount: admin ? homeStore.clients.length : 0,
    clientsRemoteCount: admin ? homeStore.clientsRemoteCount : 0,

    activityCount: homeStore.activity.length,

    partial: Boolean(homeStore.partial),
    errorsCount: homeStore.errors.length,

    hasError: Boolean(homeStore.error || homeStore.errorMessage),
    errorMessage: redact(safeText(homeStore.errorMessage, "")),

    policy: {
      runtimeCacheOnly: true,

      noDom: true,
      noCss: true,
      noHttp: true,
      noAuth: true,
      noRouter: true,
      noEvents: true,
      noRealSubscribers: true,
      noWindowGlobals: true,
      noParallelIndexes: true,
      noInternalHistory: true,

      roleAware: true,
      userNeverKeepsAdminUsersClients: true,

      noRawBackendPayload: true,
      stripsCosmosMetadata: true,
      noEmailAsIdentity: true,

      gettersDoNotRenormalize: true,
      normalizeOnlyOnWrites: true,

      ticketsNormalizedWithInvoicesAndUsers: true,
      modalDataReadyFromStore: true,

      noDataAliasInSnapshot: true,
      snapshotRedacted: true,
    },
  };

  if (includeCollections) {
    snapshot.dashboard = sanitizeStoreValue(homeStore.dashboard);
    snapshot.summary = sanitizeStoreValue(homeStore.summary);

    snapshot.widgets = sanitizeStoreValue(homeStore.widgets);
    snapshot.tickets = sanitizeStoreValue(homeStore.tickets);
    snapshot.invoices = sanitizeStoreValue(homeStore.invoices);

    snapshot.users = admin ? sanitizeStoreValue(homeStore.users) : [];
    snapshot.clients = admin ? sanitizeStoreValue(homeStore.clients) : [];

    snapshot.activity = sanitizeStoreValue(homeStore.activity);

    snapshot.modules = sanitizeStoreValue(homeStore.modules);
    snapshot.errors = sanitizeStoreValue(homeStore.errors);
    snapshot.collections = sanitizeStoreValue(getHomeCollectionsEnvelope());
  }

  return sanitizeStoreObject(snapshot);
}

/* =========================================================
   COMPAT MÍNIMA
========================================================= */

export function subscribeHomeStore() {
  return () => false;
}

export function exposeHomeStoreBridge() {
  /*
    Compat histórico.
    No publica globals ni toca window.
  */
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

export const HomeStore = Object.freeze({
  version: HOME_STORE_VERSION,
  source: HOME_STORE_SOURCE,

  get state() {
    return getHomeStoreSnapshot({
      includeCollections: true,
    });
  },

  get store() {
    return getHomeStoreSnapshot({
      includeCollections: true,
    });
  },

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
