/* =========================================================
   Onion Support - Home Store
   Archivo: /src/views/home/home.store.js

   Responsabilidad:
   - Cache runtime mínima de datos Home.
   - Recibir dashboard desde home.api.js / homeView.js.
   - Normalizar usando home.model.js sólo en escrituras.
   - Mantener aliases mínimos para template/selectors/actions.
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
  buildHomeActivityFromCollections,

  getHomeWidgetId,
  getHomeTicketId,
  getHomeInvoiceId,
  getHomeUserId,
  getHomeClientId,
} from "./home.model.js";

export const HOME_STORE_VERSION = "home.store.v9.runtime-cache-only";
export const HOME_STORE_SOURCE = "views.home.store";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 5;

const RAW_KEYS = new Set([
  "raw",
  "response",
  "payload",
  "data",
  "body",
  "request",
  "headers",
  "config",
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
  /token|authorization|cookie|password|passwd|pwd|secret|credential|jwt|bearer|refresh|access_token|accessToken|id_token|idToken|apiKey|api_key|privateKey|private_key|connectionString|connection_string|sas|otp|totp|mfa|twofa|2fa|backupCode|backup_code|backupCodes|backup_codes|session|sessionId|session_id|email|correo|mail|phone|telefono|teléfono|address|direccion|dirección|nif|dni|iban|bank|cuenta|account|ipRaw|ip|userAgent/i;

const EMAIL_RE = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/gi;

const JWT_RE =
  /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

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

    if (["true", "yes", "si", "sí", "ok", "on", "active", "enabled"].includes(clean)) {
      return true;
    }

    if (["false", "no", "off", "inactive", "disabled"].includes(clean)) {
      return false;
    }
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

  return [];
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

function redact(value = "") {
  return String(value || "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(JWT_RE, "***")
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

function isRawKey(key = "") {
  return RAW_KEYS.has(String(key || ""));
}

function isCosmosMetaKey(key = "") {
  return COSMOS_META_KEYS.has(String(key || ""));
}

function isSensitiveKey(key = "") {
  return SENSITIVE_KEY_RE.test(String(key || ""));
}

function isEmailLike(value = "") {
  const text = safeText(value, "");
  return Boolean(text && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/i.test(text));
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i.test(
    String(value || "")
  );
}

function safePublicId(value = "") {
  const text = safeText(value, "");

  if (!text) return "";
  if (isEmailLike(text)) return "";
  if (hasSensitiveQuery(text)) return "";
  if (/Bearer\s+/i.test(text)) return "";
  if (SENSITIVE_KEY_RE.test(text) && text.length > 80) return "";

  return redact(text).slice(0, 240);
}

function sanitizeStoreValue(value, keyHint = "") {
  if (isRawKey(keyHint)) return undefined;
  if (isCosmosMetaKey(keyHint)) return undefined;
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
      if (isRawKey(key)) continue;
      if (isCosmosMetaKey(key)) continue;
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
   ROLE
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

function currentRole() {
  return normalizeRole(
    first(
      homeStore.role,
      homeStore.rol,
      homeStore.roles,
      homeStore.dashboard?.role,
      homeStore.dashboard?.rol,
      homeStore.dashboard?.roles,
      homeStore.dashboard?.meta?.role,
      homeStore.dashboard?.meta?.rol,
      homeStore.dashboard?.meta?.roles,
      "user"
    ),
    "user"
  );
}

function currentIsAdmin() {
  return isAdminRole(currentRole());
}

/* =========================================================
   INITIAL STORE
========================================================= */

export function createInitialHomeStore(seed = {}) {
  const raw = sanitizeStoreObject(seed);
  const hasSeed = hasKeys(raw);
  const role = hasSeed ? roleFromSource(raw, "user") : "user";
  const admin = role === "admin";

  return {
    version: HOME_STORE_VERSION,
    source: HOME_STORE_SOURCE,

    role,
    rol: role,
    roles: [role],
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
    activityRemoteCount: 0,

    error: null,
    errorMessage: "",

    partial: false,
    errors: [],
    modules: {},

    ...(hasSeed
      ? normalizePayloadToStore(raw, {
          replace: true,
          preserveExisting: false,
          role,
        })
      : {}),
  };
}

export const homeStore = createInitialHomeStore();

/* =========================================================
   NORMALIZE PAYLOAD
========================================================= */

function normalizeInvoicesForStore(items = []) {
  return uniqueBy(
    normalizeHomeInvoices(items),
    getHomeInvoiceId
  );
}

function normalizeUsersForStore(items = [], admin = currentIsAdmin()) {
  if (!admin) return [];

  return uniqueBy(
    normalizeHomeUsers(items),
    getHomeUserId
  );
}

function normalizeClientsForStore(items = [], admin = currentIsAdmin()) {
  if (!admin) return [];

  return uniqueBy(
    normalizeHomeClients(items),
    getHomeClientId
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
    getHomeTicketId
  );
}

function normalizeWidgetsForStore(items = [], admin = currentIsAdmin()) {
  return uniqueBy(
    normalizeHomeWidgets(items, admin),
    getHomeWidgetId
  );
}

function normalizeActivityForStore(items = [], admin = currentIsAdmin()) {
  return normalizeHomeActivityList(items, admin);
}

function normalizeModules(modules = {}) {
  const output = {};

  for (const [key, value] of Object.entries(safeObject(modules))) {
    const module = safeObject(value);

    output[key] = sanitizeStoreObject({
      ok: module.ok === true,
      skipped: module.skipped === true,
      listOk: module.listOk === true,
      status: safeNumber(module.status, 0),
      endpoint: safeText(module.endpoint, ""),
      soft: module.soft === true,
      configured: module.configured === true,
      error: module.error ? normalizeError(module.error) : null,
    });
  }

  return output;
}

function normalizeDashboardInput(payload = {}, options = {}) {
  const opts = safeObject(options);
  const raw = sanitizeStoreObject(payload);
  const role = normalizeRole(
    first(
      opts.role,
      raw.role,
      raw.rol,
      raw.roles,
      raw.meta?.role,
      raw.dashboard?.role,
      currentRole()
    ),
    currentRole()
  );
  const admin = role === "admin";

  try {
    return normalizeHomeDashboard({
      ...raw,
      role,
      rol: role,
      roles: [role],
      admin,
      meta: {
        ...safeObject(raw.meta),
        role,
        admin,
      },
    });
  } catch {
    return sanitizeStoreObject({
      ...raw,
      role,
      rol: role,
      roles: [role],
      admin,
      meta: {
        ...safeObject(raw.meta),
        role,
        admin,
      },
    });
  }
}

function collectionOrExisting({
  key = "",
  incoming = [],
  preserveExisting = false,
  replace = false,
} = {}) {
  const rows = safeArray(incoming);

  if (replace) return rows;
  if (rows.length) return rows;
  if (preserveExisting) return safeArray(homeStore[key]);

  return [];
}

function normalizePayloadToStore(payload = {}, options = {}) {
  const opts = safeObject(options);
  const raw = sanitizeStoreObject(payload);

  const role = normalizeRole(
    first(
      opts.role,
      roleFromSource(raw, currentRole()),
      currentRole()
    ),
    "user"
  );
  const admin = role === "admin";
  const previousRole = currentRole();
  const roleChanged = previousRole !== role;
  const replace = opts.replace === true || roleChanged;
  const preserveExisting = opts.preserveExisting === true && !roleChanged;

  const dashboard = normalizeDashboardInput(
    {
      ...raw,
      role,
      admin,
    },
    {
      role,
    }
  );

  const invoices = normalizeInvoicesForStore(
    collectionOrExisting({
      key: "invoices",
      incoming: firstArray(
        raw.invoices,
        raw.facturas,
        dashboard.invoices,
        dashboard.facturas
      ),
      preserveExisting,
      replace,
    })
  );

  const users = admin
    ? normalizeUsersForStore(
        collectionOrExisting({
          key: "users",
          incoming: firstArray(
            raw.users,
            raw.usuarios,
            dashboard.users,
            dashboard.usuarios
          ),
          preserveExisting,
          replace,
        }),
        admin
      )
    : [];

  const clients = admin
    ? normalizeClientsForStore(
        collectionOrExisting({
          key: "clients",
          incoming: firstArray(
            raw.clients,
            raw.clientes,
            raw.customers,
            dashboard.clients,
            dashboard.clientes,
            dashboard.customers
          ),
          preserveExisting,
          replace,
        }),
        admin
      )
    : [];

  const tickets = normalizeTicketsForStore(
    collectionOrExisting({
      key: "tickets",
      incoming: firstArray(
        raw.tickets,
        raw.incidencias,
        dashboard.tickets,
        dashboard.incidencias
      ),
      preserveExisting,
      replace,
    }),
    {
      invoices,
      users,
      admin,
    }
  );

  const widgets = normalizeWidgetsForStore(
    collectionOrExisting({
      key: "widgets",
      incoming: firstArray(
        raw.widgets,
        raw.cards,
        raw.kpis,
        raw.blocks,
        dashboard.widgets,
        dashboard.cards,
        dashboard.kpis,
        dashboard.blocks
      ),
      preserveExisting,
      replace,
    }),
    admin
  );

  let activity = normalizeActivityForStore(
    collectionOrExisting({
      key: "activity",
      incoming: firstArray(
        raw.activity,
        raw.activities,
        raw.recent,
        raw.recentActivity,
        dashboard.activity,
        dashboard.activities,
        dashboard.recent,
        dashboard.recentActivity
      ),
      preserveExisting,
      replace,
    }),
    admin
  );

  if (!activity.length && (tickets.length || invoices.length || users.length || clients.length)) {
    activity = normalizeActivityForStore(
      buildHomeActivityFromCollections({
        tickets,
        invoices,
        users,
        clients,
      }),
      admin
    );
  }

  const normalizedDashboard = normalizeHomeDashboard({
    ...dashboard,

    role,
    rol: role,
    roles: [role],
    admin,

    summary: first(raw.summary, raw.stats, raw.metrics, raw.totals, raw.counts, dashboard.summary, {}),
    stats: first(raw.stats, dashboard.stats, dashboard.summary, {}),
    metrics: first(raw.metrics, dashboard.metrics, dashboard.summary, {}),
    totals: first(raw.totals, dashboard.totals, dashboard.summary, {}),
    counts: first(raw.counts, dashboard.counts, dashboard.summary, {}),

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

    requestId: first(raw.requestId, dashboard.requestId, homeStore.requestId, ""),
    updatedAt: first(raw.updatedAt, raw.lastSyncAt, dashboard.updatedAt, dashboard.lastSyncAt, homeStore.updatedAt, ""),
    lastSyncAt: first(raw.lastSyncAt, dashboard.lastSyncAt, dashboard.updatedAt, homeStore.lastSyncAt, ""),

    meta: {
      ...safeObject(dashboard.meta),
      ...safeObject(raw.meta),
      role,
      admin,
    },
  });

  const summary = safeObject(normalizedDashboard.summary);

  return sanitizeStoreObject({
    version: HOME_STORE_VERSION,
    source: HOME_STORE_SOURCE,

    role,
    rol: role,
    roles: [role],
    admin,

    hydrated: safeBoolean(first(opts.hydrated, raw.hydrated, dashboard.hydrated, true), true),
    loaded: safeBoolean(first(opts.loaded, raw.loaded, dashboard.loaded, true), true),
    loading: false,
    refreshing: false,

    page: Math.max(1, safeNumber(first(raw.page, homeStore.page, DEFAULT_PAGE), DEFAULT_PAGE)),
    pageSize: Math.max(1, safeNumber(first(raw.pageSize, homeStore.pageSize, DEFAULT_PAGE_SIZE), DEFAULT_PAGE_SIZE)),

    requestId: safePublicId(first(raw.requestId, normalizedDashboard.requestId, normalizedDashboard.meta?.requestId, homeStore.requestId, "")),
    lastSyncAt: safeText(first(raw.lastSyncAt, raw.updatedAt, normalizedDashboard.lastSyncAt, normalizedDashboard.updatedAt, nowIso()), nowIso()),
    updatedAt: safeText(first(raw.updatedAt, raw.lastSyncAt, normalizedDashboard.updatedAt, normalizedDashboard.lastSyncAt, nowIso()), nowIso()),

    dashboard: normalizedDashboard,

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
    ticketsRemoteCount: Math.max(
      tickets.length,
      safeNumber(first(raw.ticketsRemoteCount, normalizedDashboard.ticketsRemoteCount, normalizedDashboard.collections?.ticketsRemoteCount), 0)
    ),
    remoteCount: Math.max(
      tickets.length,
      safeNumber(first(raw.remoteCount, normalizedDashboard.remoteCount, normalizedDashboard.ticketsRemoteCount), 0)
    ),

    invoices,
    facturas: invoices,
    invoicesRemoteCount: Math.max(
      invoices.length,
      safeNumber(first(raw.invoicesRemoteCount, normalizedDashboard.invoicesRemoteCount, normalizedDashboard.collections?.invoicesRemoteCount), 0)
    ),

    users: admin ? users : [],
    usuarios: admin ? users : [],
    usersRemoteCount: admin
      ? Math.max(
          users.length,
          safeNumber(first(raw.usersRemoteCount, normalizedDashboard.usersRemoteCount, normalizedDashboard.collections?.usersRemoteCount), 0)
        )
      : 0,

    clients: admin ? clients : [],
    clientes: admin ? clients : [],
    customers: admin ? clients : [],
    clientsRemoteCount: admin
      ? Math.max(
          clients.length,
          safeNumber(first(raw.clientsRemoteCount, normalizedDashboard.clientsRemoteCount, normalizedDashboard.collections?.clientsRemoteCount), 0)
        )
      : 0,

    activity,
    activities: activity,
    recent: activity,
    recentActivity: activity,
    activityRemoteCount: Math.max(
      activity.length,
      safeNumber(first(raw.activityRemoteCount, normalizedDashboard.activityRemoteCount, normalizedDashboard.collections?.activityRemoteCount), 0)
    ),

    error: raw.error ? normalizeError(raw.error) : null,
    errorMessage: redact(safeText(raw.errorMessage, "")),

    partial: raw.partial === true || normalizedDashboard.partial === true,
    errors: normalizeErrors(first(raw.errors, normalizedDashboard.errors, [])),
    modules: normalizeModules(first(raw.modules, normalizedDashboard.modules, {})),
  });
}

/* =========================================================
   ALIASES / DASHBOARD
========================================================= */

function buildDashboardFromStore() {
  const role = currentRole();
  const admin = role === "admin";

  return normalizeHomeDashboard({
    ...safeObject(homeStore.dashboard),

    role,
    rol: role,
    roles: [role],
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

    requestId: homeStore.requestId,
    updatedAt: homeStore.updatedAt || homeStore.lastSyncAt,
    lastSyncAt: homeStore.lastSyncAt || homeStore.updatedAt,

    meta: {
      ...safeObject(homeStore.dashboard?.meta),
      role,
      admin,
      requestId: homeStore.requestId,
      updatedAt: homeStore.updatedAt || homeStore.lastSyncAt,
      lastSyncAt: homeStore.lastSyncAt || homeStore.updatedAt,
    },

    partial: homeStore.partial,
    errors: homeStore.errors,
  });
}

function syncAliases() {
  const role = normalizeRole(homeStore.role, "user");
  const admin = role === "admin";

  homeStore.version = HOME_STORE_VERSION;
  homeStore.source = HOME_STORE_SOURCE;

  homeStore.role = role;
  homeStore.rol = role;
  homeStore.roles = [role];
  homeStore.admin = admin;

  homeStore.invoices = normalizeInvoicesForStore(homeStore.invoices);
  homeStore.facturas = homeStore.invoices;

  homeStore.users = admin ? normalizeUsersForStore(homeStore.users, true) : [];
  homeStore.usuarios = admin ? homeStore.users : [];

  homeStore.clients = admin ? normalizeClientsForStore(homeStore.clients, true) : [];
  homeStore.clientes = admin ? homeStore.clients : [];
  homeStore.customers = admin ? homeStore.clients : [];

  homeStore.tickets = normalizeTicketsForStore(homeStore.tickets, {
    invoices: homeStore.invoices,
    users: homeStore.users,
    admin,
  });
  homeStore.incidencias = homeStore.tickets;

  homeStore.widgets = normalizeWidgetsForStore(homeStore.widgets, admin);
  homeStore.cards = homeStore.widgets;
  homeStore.kpis = homeStore.widgets;
  homeStore.blocks = homeStore.widgets;

  homeStore.activity = normalizeActivityForStore(homeStore.activity, admin);
  homeStore.activities = homeStore.activity;
  homeStore.recent = homeStore.activity;
  homeStore.recentActivity = homeStore.activity;

  homeStore.summary = safeObject(
    first(
      normalizeHomeDashboard({
        role,
        admin,
        summary: homeStore.summary,
        widgets: homeStore.widgets,
        tickets: homeStore.tickets,
        invoices: homeStore.invoices,
        users: admin ? homeStore.users : [],
        clients: admin ? homeStore.clients : [],
        activity: homeStore.activity,
      }).summary,
      homeStore.summary,
      {}
    )
  );

  homeStore.stats = homeStore.summary;
  homeStore.metrics = homeStore.summary;
  homeStore.totals = homeStore.summary;
  homeStore.counts = homeStore.summary;

  homeStore.ticketsRemoteCount = Math.max(homeStore.tickets.length, safeNumber(homeStore.ticketsRemoteCount, 0));
  homeStore.remoteCount = Math.max(homeStore.ticketsRemoteCount, safeNumber(homeStore.remoteCount, 0));

  homeStore.invoicesRemoteCount = Math.max(homeStore.invoices.length, safeNumber(homeStore.invoicesRemoteCount, 0));

  homeStore.usersRemoteCount = admin
    ? Math.max(homeStore.users.length, safeNumber(homeStore.usersRemoteCount, 0))
    : 0;

  homeStore.clientsRemoteCount = admin
    ? Math.max(homeStore.clients.length, safeNumber(homeStore.clientsRemoteCount, 0))
    : 0;

  homeStore.activityRemoteCount = Math.max(homeStore.activity.length, safeNumber(homeStore.activityRemoteCount, 0));

  homeStore.modules = normalizeModules(homeStore.modules);
  homeStore.errors = normalizeErrors(homeStore.errors);
  homeStore.error = homeStore.error ? normalizeError(homeStore.error) : null;
  homeStore.errorMessage = redact(safeText(homeStore.errorMessage, ""));

  homeStore.page = Math.max(1, safeNumber(homeStore.page, DEFAULT_PAGE));
  homeStore.pageSize = Math.max(1, safeNumber(homeStore.pageSize, DEFAULT_PAGE_SIZE));

  homeStore.requestId = safePublicId(homeStore.requestId);
  homeStore.lastSyncAt = safeText(homeStore.lastSyncAt, "");
  homeStore.updatedAt = safeText(first(homeStore.updatedAt, homeStore.lastSyncAt, ""), "");

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
  const next = normalizePayloadToStore(payload, {
    ...opts,
    preserveExisting: opts.preserveExisting === true,
  });

  return assignStore({
    ...next,
    hydrated: safeBoolean(first(opts.hydrated, next.hydrated, true), true),
    loaded: safeBoolean(first(opts.loaded, next.loaded, true), true),
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

      widgets: firstArray(input.widgets, input.cards, input.kpis, input.blocks),
      tickets: firstArray(input.tickets, input.incidencias),
      invoices: firstArray(input.invoices, input.facturas),

      users: admin ? firstArray(input.users, input.usuarios) : [],
      clients: admin ? firstArray(input.clients, input.clientes, input.customers) : [],

      activity: firstArray(input.activity, input.activities, input.recent, input.recentActivity),

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
      replace: options.replace === true || role !== currentRole(),
    }
  );
}

/* =========================================================
   WIDGET MUTATION
========================================================= */

function widgetKeys(widget = {}) {
  const raw = safeObject(widget);

  return [
    getHomeWidgetId(raw),
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
  const item = normalizeHomeWidgets([widget], admin)[0] || sanitizeStoreObject(widget);

  if (!hasKeys(item)) return null;
  if (!admin && item.adminOnly === true) return null;

  const id = normalizeKey(first(getHomeWidgetId(item), item.id, item.key, item.widgetId, item.widgetKey, ""));
  const rows = [...homeStore.widgets];
  const index = rows.findIndex((row) => widgetKeys(row).includes(id));

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
    requestId: safePublicId(requestId),
  });
}

export function setHomeStoreLastSyncAt(value = null) {
  const next = safeText(value || nowIso(), nowIso());

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
  return findById(homeStore.widgets, id, getHomeWidgetId);
}

export function getHomeTicketByIdStore(id = "") {
  return findById(homeStore.tickets, id, getHomeTicketId);
}

export function getHomeInvoiceByIdStore(id = "") {
  return findById(homeStore.invoices, id, getHomeInvoiceId);
}

export function getHomeUserByIdStore(id = "") {
  return currentIsAdmin()
    ? findById(homeStore.users, id, getHomeUserId)
    : null;
}

export function getHomeClientByIdStore(id = "") {
  return currentIsAdmin()
    ? findById(homeStore.clients, id, getHomeClientId)
    : null;
}

export function getHomeCollectionsEnvelope() {
  const admin = currentIsAdmin();

  return sanitizeStoreObject({
    role: currentRole(),
    admin,

    widgets: getHomeWidgetsStore(),
    cards: getHomeWidgetsStore(),
    kpis: getHomeWidgetsStore(),
    blocks: getHomeWidgetsStore(),

    tickets: getHomeTicketsStore(),
    incidencias: getHomeTicketsStore(),

    invoices: getHomeInvoicesStore(),
    facturas: getHomeInvoicesStore(),

    users: admin ? getHomeUsersStore() : [],
    usuarios: admin ? getHomeUsersStore() : [],

    clients: admin ? getHomeClientsStore() : [],
    clientes: admin ? getHomeClientsStore() : [],
    customers: admin ? getHomeClientsStore() : [],

    activity: getHomeActivityStore(),
    activities: getHomeActivityStore(),
    recent: getHomeActivityStore(),
    recentActivity: getHomeActivityStore(),

    ticketsRemoteCount: homeStore.ticketsRemoteCount,
    invoicesRemoteCount: homeStore.invoicesRemoteCount,
    usersRemoteCount: admin ? homeStore.usersRemoteCount : 0,
    clientsRemoteCount: admin ? homeStore.clientsRemoteCount : 0,
    activityRemoteCount: homeStore.activityRemoteCount,
  });
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHomeStoreSnapshot(options = {}) {
  const opts = safeObject(options);
  const includeCollections = opts.includeCollections === true;
  const admin = currentIsAdmin();

  syncAliases();

  const snapshot = {
    version: HOME_STORE_VERSION,
    source: HOME_STORE_SOURCE,

    role: currentRole(),
    admin,

    hydrated: Boolean(homeStore.hydrated),
    loaded: Boolean(homeStore.loaded),
    loading: Boolean(homeStore.loading),
    refreshing: Boolean(homeStore.refreshing),

    page: homeStore.page,
    pageSize: homeStore.pageSize,

    requestId: homeStore.requestId,
    lastSyncAt: homeStore.lastSyncAt,
    updatedAt: homeStore.updatedAt,

    hasDashboard: hasKeys(homeStore.dashboard),

    summary: homeStore.summary,

    counts: {
      widgets: homeStore.widgets.length,
      tickets: homeStore.tickets.length,
      invoices: homeStore.invoices.length,
      users: admin ? homeStore.users.length : 0,
      clients: admin ? homeStore.clients.length : 0,
      activity: homeStore.activity.length,

      ticketsRemoteCount: homeStore.ticketsRemoteCount,
      invoicesRemoteCount: homeStore.invoicesRemoteCount,
      usersRemoteCount: admin ? homeStore.usersRemoteCount : 0,
      clientsRemoteCount: admin ? homeStore.clientsRemoteCount : 0,
      activityRemoteCount: homeStore.activityRemoteCount,
    },

    error: homeStore.error,
    errorMessage: homeStore.errorMessage,

    partial: Boolean(homeStore.partial),
    errors: homeStore.errors,
    modules: homeStore.modules,

    policy: {
      runtimeCacheOnly: true,
      modelBackedNormalization: true,
      normalizesOnlyOnWrites: true,

      noDom: true,
      noCss: true,
      noHttp: true,
      noAuth: true,
      noRouter: true,
      noEvents: true,
      noSubscribersReal: true,
      noWindowGlobals: true,
      noIndexesParallel: true,
      noInternalHistory: true,

      userNeverKeepsAdminUsersClients: true,
      noRawBackendPayload: true,
      stripsCosmosMetadata: true,
      snapshotRedacted: true,
    },

    at: nowIso(),
  };

  if (includeCollections) {
    snapshot.dashboard = homeStore.dashboard;
    snapshot.collections = getHomeCollectionsEnvelope();
  }

  return sanitizeStoreObject(clone(snapshot, snapshot));
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

syncAliases();

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
