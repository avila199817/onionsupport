/* =========================================================
   Onion Support - Home State
   Archivo: src/views/home/home.state.js

   Responsabilidad:
   - Estado runtime mínimo de Home.
   - Mantener shape estable para homeView/template/selectors.
   - Recibir dashboard normalizado o normalizable.
   - Delegar normalización de colecciones en home.model.js.
   - Separar Home admin/user desde el propio payload.
   - User nunca conserva usuarios/clientes de cache admin.
   - Preservar datos existentes sólo si el rol no cambia y no se fuerza replace.
   - Leer colecciones desde dashboard raíz y dashboard.collections mediante model.
   - Evitar machacar colecciones existentes con arrays vacíos salvo replace explícito.
   - Exponer setters usados por homeView.js.
   - Mantener selectedTicketId y selectedIncidenciaId sincronizados.
   - openingTicketId sólo representa carga visual, no selección persistente.
   - Redactar errores/snapshots.
   - No conservar raw/payload/response/data backend en dashboard.
   - Sin AppCore.
   - Sin eventos.
   - Sin window globals.
   - Sin Router.
   - Sin Auth.
   - Sin HTTP.
   - Sin Storage.
   - Sin CSS.
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
} from "./home.model.js";

export const HOME_STATE_VERSION = "home.state.v11.runtime-contract";

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

const SENSITIVE_KEY_PARTS = Object.freeze([
  "token",
  "authorization",
  "cookie",
  "password",
  "passwd",
  "pwd",
  "secret",
  "credential",
  "jwt",
  "bearer",
  "refresh",
  "apikey",
  "privatekey",
  "connectionstring",
  "sas",
  "otp",
  "totp",
  "mfa",
  "twofa",
  "backupcode",
  "sessionid",
  "email",
  "correo",
  "mail",
  "phone",
  "telefono",
  "address",
  "direccion",
  "nif",
  "dni",
  "iban",
  "bank",
  "cuenta",
  "account",
  "useragent",
]);

const SENSITIVE_KEY_EXACT = new Set([
  "session",
  "ip",
  "ipraw",
]);

const EMAIL_GLOBAL_RE = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/gi;
const EMAIL_EXACT_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/i;

const JWT_RE =
  /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

const JWT_TEST_RE =
  /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/;

const SENSITIVE_QUERY_RE =
  /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i;

const ADMIN_COLLECTION_KEYS = new Set([
  "users",
  "usuarios",
  "clients",
  "clientes",
  "customers",
]);

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

    if (["true", "yes", "si", "sí", "on", "ok", "active", "enabled"].includes(clean)) return true;
    if (["false", "no", "off", "inactive", "disabled"].includes(clean)) return false;
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
    // fallback below
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
    .replace(EMAIL_GLOBAL_RE, "");
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

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function normalizeSensitiveKey(value = "") {
  return normalizeKey(value).replace(/_/g, "");
}

function isSensitiveKey(key = "") {
  const clean = normalizeSensitiveKey(key);

  if (!clean) return false;
  if (SENSITIVE_KEY_EXACT.has(clean)) return true;

  return SENSITIVE_KEY_PARTS.some((part) => clean.includes(part));
}

function isEmailLike(value = "") {
  const text = safeText(value, "");
  return Boolean(text && EMAIL_EXACT_RE.test(text));
}

function hasSensitiveQuery(value = "") {
  return SENSITIVE_QUERY_RE.test(String(value || ""));
}

function hasJwt(value = "") {
  return JWT_TEST_RE.test(String(value || ""));
}

function safePublicId(value = "") {
  const text = safeText(value, "");

  if (!text) return "";
  if (isEmailLike(text)) return "";
  if (hasSensitiveQuery(text)) return "";
  if (/Bearer\s+/i.test(text)) return "";
  if (hasJwt(text)) return "";

  return redact(text).slice(0, 240);
}

function sanitizeStateDeep(value, keyHint = "") {
  if (isRawKey(keyHint)) return undefined;
  if (isCosmosMetaKey(keyHint)) return undefined;
  if (isSensitiveKey(keyHint)) return undefined;

  if (typeof value === "string") {
    return redact(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeStateDeep(item))
      .filter((item) => item !== undefined);
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (isRawKey(key)) continue;
      if (isCosmosMetaKey(key)) continue;
      if (isSensitiveKey(key)) continue;

      const clean = sanitizeStateDeep(item, key);

      if (clean !== undefined) {
        output[key] = clean;
      }
    }

    return output;
  }

  return value;
}

function sanitizeStateObject(value = {}) {
  return safeObject(sanitizeStateDeep(value), {});
}

function normalizeError(error = null) {
  if (!error) return null;

  if (typeof error === "string") {
    return {
      name: "HomeStateError",
      message: redact(safeText(error, "Error Home.")),
      code: "HOME_STATE_ERROR",
    };
  }

  const value = safeObject(error);

  return {
    name: safeText(value.name, "HomeStateError"),
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
        "HOME_STATE_ERROR"
      ),
      "HOME_STATE_ERROR"
    ),
  };
}

function normalizeErrorList(errors = []) {
  return safeArray(errors)
    .map((error) => normalizeError(error))
    .filter(Boolean);
}

/* =========================================================
   INITIAL STATE
========================================================= */

export function createInitialHomeState() {
  return {
    version: HOME_STATE_VERSION,

    role: "user",
    rol: "user",
    roles: ["user"],
    admin: false,

    hydrated: false,
    loaded: false,
    loading: false,
    refreshing: false,
    creating: false,

    openingTicketId: "",
    selectedTicketId: "",
    selectedIncidenciaId: "",
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

    meta: {},
    partial: false,
    errors: [],
  };
}

export const homeState = createInitialHomeState();

/* =========================================================
   ROLE / NORMALIZATION
========================================================= */

function roleFromDashboard(dashboard = {}, fallback = "user") {
  const raw = safeObject(dashboard);
  const meta = safeObject(raw.meta);

  const role = normalizeRole(
    first(
      raw.role,
      raw.rol,
      raw.roles,
      meta.role,
      meta.rol,
      meta.roles,
      ""
    ),
    ""
  );

  if (role) return role;
  if (raw.admin === true || meta.admin === true) return "admin";
  if (raw.admin === false || meta.admin === false) return "user";

  return normalizeRole(fallback, "user");
}

function currentRole() {
  return roleFromDashboard(
    homeState.dashboard,
    first(
      homeState.role,
      homeState.rol,
      homeState.roles,
      homeState.admin === true ? "admin" : "",
      "user"
    )
  );
}

function currentIsAdmin() {
  return isAdminRole(currentRole());
}

function roleFromAny(value = {}, fallback = currentRole()) {
  const source = safeObject(value);
  return roleFromDashboard(source, fallback);
}

function sanitizeDashboard(dashboard = {}, fallbackRole = currentRole()) {
  const raw = sanitizeStateObject(dashboard);
  const role = roleFromAny(raw, fallbackRole);

  try {
    return normalizeHomeDashboard({
      ...raw,
      role,
      admin: role === "admin",
      meta: {
        ...safeObject(raw.meta),
        role,
        admin: role === "admin",
      },
    });
  } catch {
    return sanitizeStateObject({
      ...raw,
      role,
      rol: role,
      roles: [role],
      admin: role === "admin",
      meta: {
        ...safeObject(raw.meta),
        role,
        admin: role === "admin",
      },
    });
  }
}

function collectionOrExisting(key = "", incoming = [], replace = false) {
  const rows = safeArray(incoming);

  if (replace) return rows;
  if (rows.length) return rows;

  return safeArray(homeState[key]);
}

function normalizeCollectionsFromDashboard(dashboard = {}, replace = false) {
  const source = safeObject(dashboard);
  const admin = source.admin === true;
  const collections = safeObject(source.collections);

  const invoices = normalizeHomeInvoices(
    collectionOrExisting(
      "invoices",
      firstArray(source.invoices, source.facturas, collections.invoices, collections.facturas),
      replace
    )
  );

  const users = admin
    ? normalizeHomeUsers(
        collectionOrExisting(
          "users",
          firstArray(source.users, source.usuarios, collections.users, collections.usuarios),
          replace
        )
      )
    : [];

  const clients = admin
    ? normalizeHomeClients(
        collectionOrExisting(
          "clients",
          firstArray(source.clients, source.clientes, source.customers, collections.clients, collections.clientes, collections.customers),
          replace
        )
      )
    : [];

  const tickets = normalizeHomeTickets(
    collectionOrExisting(
      "tickets",
      firstArray(source.tickets, source.incidencias, collections.tickets, collections.incidencias),
      replace
    ),
    {
      invoices,
      users,
    }
  );

  const widgets = normalizeHomeWidgets(
    collectionOrExisting(
      "widgets",
      firstArray(source.widgets, source.cards, source.kpis, source.blocks, collections.widgets, collections.cards, collections.kpis, collections.blocks),
      replace
    ),
    admin
  );

  let activity = normalizeHomeActivityList(
    collectionOrExisting(
      "activity",
      firstArray(source.activity, source.activities, source.recent, source.recentActivity, collections.activity, collections.activities, collections.recent, collections.recentActivity),
      replace
    ),
    admin
  );

  if (!activity.length && (tickets.length || invoices.length || users.length || clients.length)) {
    activity = normalizeHomeActivityList(
      buildHomeActivityFromCollections({
        tickets,
        invoices,
        users,
        clients,
      }),
      admin
    );
  }

  return {
    tickets,
    invoices,
    users,
    clients,
    widgets,
    activity,
  };
}

function buildDashboardFromState() {
  const role = normalizeRole(homeState.role, "user");
  const admin = role === "admin";

  return normalizeHomeDashboard({
    ...safeObject(homeState.dashboard),

    role,
    rol: role,
    roles: [role],
    admin,

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

    users: admin ? homeState.users : [],
    usuarios: admin ? homeState.users : [],

    clients: admin ? homeState.clients : [],
    clientes: admin ? homeState.clients : [],
    customers: admin ? homeState.clients : [],

    activity: homeState.activity,
    activities: homeState.activity,
    recent: homeState.activity,
    recentActivity: homeState.activity,

    requestId: homeState.requestId,
    updatedAt: homeState.lastSyncAt,
    lastSyncAt: homeState.lastSyncAt,

    meta: {
      ...safeObject(homeState.meta),
      role,
      admin,
      requestId: homeState.requestId,
      updatedAt: homeState.lastSyncAt,
      lastSyncAt: homeState.lastSyncAt,
    },

    partial: homeState.partial,
    errors: homeState.errors,
  });
}

function syncSelectedAliases() {
  const selected = safePublicId(
    first(
      homeState.selectedTicketId,
      homeState.selectedIncidenciaId,
      ""
    )
  );

  homeState.selectedTicketId = selected;
  homeState.selectedIncidenciaId = selected;
  homeState.openingTicketId = safePublicId(homeState.openingTicketId);

  return selected;
}

function syncAliases() {
  const role = normalizeRole(homeState.role, "user");
  const admin = role === "admin";

  homeState.version = HOME_STATE_VERSION;

  homeState.role = role;
  homeState.rol = role;
  homeState.roles = [role];
  homeState.admin = admin;

  syncSelectedAliases();

  homeState.widgets = normalizeHomeWidgets(homeState.widgets, admin);
  homeState.cards = homeState.widgets;
  homeState.kpis = homeState.widgets;
  homeState.blocks = homeState.widgets;

  homeState.invoices = normalizeHomeInvoices(homeState.invoices);
  homeState.facturas = homeState.invoices;

  homeState.users = admin ? normalizeHomeUsers(homeState.users) : [];
  homeState.usuarios = admin ? homeState.users : [];

  homeState.clients = admin ? normalizeHomeClients(homeState.clients) : [];
  homeState.clientes = admin ? homeState.clients : [];
  homeState.customers = admin ? homeState.clients : [];

  homeState.tickets = normalizeHomeTickets(homeState.tickets, {
    invoices: homeState.invoices,
    users: admin ? homeState.users : [],
  });
  homeState.incidencias = homeState.tickets;

  homeState.activity = normalizeHomeActivityList(homeState.activity, admin);
  homeState.activities = homeState.activity;
  homeState.recent = homeState.activity;
  homeState.recentActivity = homeState.activity;

  homeState.ticketsRemoteCount = Math.max(homeState.tickets.length, safeNumber(homeState.ticketsRemoteCount, 0));
  homeState.invoicesRemoteCount = Math.max(homeState.invoices.length, safeNumber(homeState.invoicesRemoteCount, 0));
  homeState.usersRemoteCount = admin ? Math.max(homeState.users.length, safeNumber(homeState.usersRemoteCount, 0)) : 0;
  homeState.clientsRemoteCount = admin ? Math.max(homeState.clients.length, safeNumber(homeState.clientsRemoteCount, 0)) : 0;
  homeState.activityRemoteCount = Math.max(homeState.activity.length, safeNumber(homeState.activityRemoteCount, 0));

  homeState.remoteCount = Math.max(homeState.ticketsRemoteCount, safeNumber(homeState.remoteCount, 0));
  homeState.totalCount = Math.max(homeState.remoteCount, safeNumber(homeState.totalCount, 0));

  homeState.summary = safeObject(
    first(
      sanitizeDashboard({
        role,
        admin,
        summary: homeState.summary,
        tickets: homeState.tickets,
        invoices: homeState.invoices,
        users: admin ? homeState.users : [],
        clients: admin ? homeState.clients : [],
        widgets: homeState.widgets,
        activity: homeState.activity,
      }).summary,
      homeState.summary,
      {}
    )
  );

  homeState.stats = homeState.summary;
  homeState.metrics = homeState.summary;
  homeState.totals = homeState.summary;
  homeState.counts = homeState.summary;

  homeState.dashboard = buildDashboardFromState();

  homeState.loading = Boolean(homeState.loading);
  homeState.refreshing = Boolean(homeState.refreshing);
  homeState.loaded = Boolean(homeState.loaded);
  homeState.hydrated = Boolean(homeState.hydrated);
  homeState.creating = Boolean(homeState.creating);

  homeState.error = redact(safeText(homeState.error, ""));
  homeState.lastError = homeState.lastError ? normalizeError(homeState.lastError) : null;

  homeState.page = Math.max(1, safeNumber(homeState.page, DEFAULT_PAGE));
  homeState.pageSize = Math.max(1, safeNumber(homeState.pageSize, DEFAULT_PAGE_SIZE));

  homeState.requestId = safePublicId(homeState.requestId);
  homeState.lastSyncAt = safeText(first(homeState.lastSyncAt, homeState.lastUpdatedAt, ""), "");
  homeState.lastUpdatedAt = safeText(first(homeState.lastUpdatedAt, homeState.lastSyncAt, ""), "");

  homeState.meta = sanitizeStateObject({
    ...safeObject(homeState.meta),
    role,
    admin,
    selectedTicketId: homeState.selectedTicketId || "",
    selectedIncidenciaId: homeState.selectedIncidenciaId || "",
  });

  homeState.partial = Boolean(homeState.partial);
  homeState.errors = normalizeErrorList(homeState.errors);

  return homeState;
}

export function normalizeHomeState() {
  return syncAliases();
}

/* =========================================================
   PATCH / REPLACE / RESET
========================================================= */

function shouldKeepExisting(key = "", value, replace = false) {
  if (replace) return false;

  if (ADMIN_COLLECTION_KEYS.has(key) && !currentIsAdmin()) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length === 0 && safeArray(homeState[key]).length > 0;
  }

  if (isObject(value)) {
    return Object.keys(value).length === 0 && hasKeys(homeState[key]);
  }

  return false;
}

function sanitizeStateValue(key = "", value) {
  if (value === undefined) return undefined;

  if (isRawKey(key)) return undefined;
  if (isCosmosMetaKey(key)) return undefined;
  if (isSensitiveKey(key)) return undefined;

  if (key === "dashboard") return sanitizeDashboard(value);
  if (key === "error") return redact(safeText(value, ""));
  if (key === "lastError") return normalizeError(value);
  if (key === "errors") return normalizeErrorList(value);
  if (key === "navigatingAction") return redact(safeText(value, ""));

  if (
    key === "openingTicketId" ||
    key === "selectedTicketId" ||
    key === "selectedIncidenciaId" ||
    key === "ticketId" ||
    key === "incidenciaId"
  ) {
    return safePublicId(value);
  }

  if (ADMIN_COLLECTION_KEYS.has(key) && !currentIsAdmin()) {
    return [];
  }

  return sanitizeStateDeep(value, key);
}

function assign(key = "", value, { replace = false } = {}) {
  if (!key || value === undefined) return false;

  const clean = sanitizeStateValue(key, value);

  if (clean === undefined) return false;
  if (shouldKeepExisting(key, clean, replace)) return false;

  if (key === "ticketId" || key === "incidenciaId") {
    homeState.selectedTicketId = clean;
    homeState.selectedIncidenciaId = clean;
    return true;
  }

  homeState[key] = clean;
  return true;
}

function assignRuntime(patch = {}) {
  const data = safeObject(patch);

  for (const [key, value] of Object.entries(data)) {
    const clean = sanitizeStateValue(key, value);

    if (clean === undefined) continue;

    if (key === "ticketId" || key === "incidenciaId") {
      homeState.selectedTicketId = clean;
      homeState.selectedIncidenciaId = clean;
      continue;
    }

    homeState[key] = clean;
  }

  syncSelectedAliases();

  homeState.error = redact(safeText(homeState.error, ""));
  homeState.lastError = homeState.lastError ? normalizeError(homeState.lastError) : null;

  homeState.page = Math.max(1, safeNumber(homeState.page, DEFAULT_PAGE));
  homeState.pageSize = Math.max(1, safeNumber(homeState.pageSize, DEFAULT_PAGE_SIZE));

  return homeState;
}

export function patchHomeState(patch = {}, options = {}) {
  const data = safeObject(patch);
  const replace = options.replace === true;

  for (const [key, value] of Object.entries(data)) {
    assign(key, value, { replace });
  }

  normalizeHomeState();

  return homeState;
}

export function replaceHomeState(nextState = {}) {
  Object.keys(homeState).forEach((key) => {
    delete homeState[key];
  });

  Object.assign(homeState, createInitialHomeState(), sanitizeStateObject(nextState));

  normalizeHomeState();

  return homeState;
}

export function resetHomeState() {
  return replaceHomeState({});
}

/* =========================================================
   DASHBOARD SYNC
========================================================= */

export function syncHomeStateFromDashboard(dashboard = {}, options = {}) {
  const opts = safeObject(options);
  const raw = safeObject(dashboard);

  if (!hasKeys(raw) && opts.replace !== true) {
    return homeState;
  }

  const previousRole = currentRole();
  const normalized = sanitizeDashboard(raw, first(opts.role, previousRole));
  const nextRole = normalizeRole(normalized.role, previousRole);
  const admin = nextRole === "admin";
  const replace = opts.replace === true || previousRole !== nextRole || !admin;

  const selectedBeforeReplace = safePublicId(
    first(
      homeState.selectedTicketId,
      homeState.selectedIncidenciaId,
      ""
    )
  );

  const collections = normalizeCollectionsFromDashboard(normalized, replace);

  homeState.role = nextRole;
  homeState.rol = nextRole;
  homeState.roles = [nextRole];
  homeState.admin = admin;

  homeState.dashboard = replace
    ? normalized
    : {
        ...safeObject(homeState.dashboard),
        ...normalized,
      };

  homeState.summary = replace
    ? safeObject(normalized.summary)
    : {
        ...safeObject(homeState.summary),
        ...safeObject(normalized.summary),
      };

  homeState.widgets = collections.widgets;
  homeState.tickets = collections.tickets;
  homeState.invoices = collections.invoices;
  homeState.users = admin ? collections.users : [];
  homeState.clients = admin ? collections.clients : [];
  homeState.activity = collections.activity;

  homeState.ticketsRemoteCount = Math.max(
    homeState.tickets.length,
    safeNumber(normalized.ticketsRemoteCount, 0),
    safeNumber(normalized.collections?.ticketsRemoteCount, 0),
    replace ? 0 : homeState.ticketsRemoteCount
  );

  homeState.invoicesRemoteCount = Math.max(
    homeState.invoices.length,
    safeNumber(normalized.invoicesRemoteCount, 0),
    safeNumber(normalized.collections?.invoicesRemoteCount, 0),
    replace ? 0 : homeState.invoicesRemoteCount
  );

  homeState.usersRemoteCount = admin
    ? Math.max(
        homeState.users.length,
        safeNumber(normalized.usersRemoteCount, 0),
        safeNumber(normalized.collections?.usersRemoteCount, 0),
        replace ? 0 : homeState.usersRemoteCount
      )
    : 0;

  homeState.clientsRemoteCount = admin
    ? Math.max(
        homeState.clients.length,
        safeNumber(normalized.clientsRemoteCount, 0),
        safeNumber(normalized.collections?.clientsRemoteCount, 0),
        replace ? 0 : homeState.clientsRemoteCount
      )
    : 0;

  homeState.activityRemoteCount = Math.max(
    homeState.activity.length,
    safeNumber(normalized.activityRemoteCount, 0),
    safeNumber(normalized.collections?.activityRemoteCount, 0),
    replace ? 0 : homeState.activityRemoteCount
  );

  homeState.remoteCount = Math.max(homeState.ticketsRemoteCount, safeNumber(normalized.remoteCount, 0));
  homeState.totalCount = Math.max(homeState.remoteCount, safeNumber(normalized.totalCount, 0));

  homeState.meta = replace
    ? sanitizeStateObject({
        ...safeObject(normalized.meta),
        role: nextRole,
        admin,
      })
    : sanitizeStateObject({
        ...safeObject(homeState.meta),
        ...safeObject(normalized.meta),
        role: nextRole,
        admin,
      });

  homeState.errors = normalizeErrorList(normalized.errors);
  homeState.partial = Boolean(normalized.partial);

  homeState.requestId = safePublicId(first(opts.requestId, normalized.requestId, normalized.meta?.requestId, homeState.requestId, ""));
  homeState.lastSyncAt = safeText(first(opts.lastSyncAt, normalized.lastSyncAt, normalized.updatedAt, normalized.generatedAt, normalized.meta?.updatedAt, nowIso()), nowIso());
  homeState.lastUpdatedAt = homeState.lastSyncAt;

  if (selectedBeforeReplace) {
    homeState.selectedTicketId = selectedBeforeReplace;
    homeState.selectedIncidenciaId = selectedBeforeReplace;
  }

  homeState.loaded = true;
  homeState.hydrated = true;
  homeState.loading = false;
  homeState.refreshing = false;
  homeState.error = "";
  homeState.lastError = null;

  normalizeHomeState();

  return homeState;
}

/* =========================================================
   SETTERS
========================================================= */

export function setLoading(value = false) {
  const loading = safeBoolean(value, false);

  return assignRuntime({
    loading,
    refreshing: loading ? false : homeState.refreshing,
  });
}

export function setRefreshing(value = false) {
  const refreshing = safeBoolean(value, false);

  return assignRuntime({
    refreshing,
    loading: refreshing ? false : homeState.loading,
  });
}

export function setLoaded(value = true) {
  const loaded = safeBoolean(value, true);

  return assignRuntime({
    loaded,
    loading: loaded ? false : homeState.loading,
    refreshing: loaded ? false : homeState.refreshing,
  });
}

export function setHydrated(value = true) {
  return assignRuntime({
    hydrated: safeBoolean(value, true),
  });
}

export function setError(error = null) {
  const normalized = normalizeError(error);

  return assignRuntime({
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
  const incoming = sanitizeStateObject(summary);
  const replace = options.replace === true;

  if (!hasKeys(incoming) && !replace && hasKeys(homeState.summary)) {
    return homeState;
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
  return patchHomeState({
    widgets: normalizeHomeWidgets(safeArray(widgets), currentIsAdmin()),
  }, options);
}

export function setTickets(tickets = [], options = {}) {
  const items = normalizeHomeTickets(safeArray(tickets), {
    invoices: homeState.invoices,
    users: currentIsAdmin() ? homeState.users : [],
  });

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
  const items = normalizeHomeInvoices(safeArray(invoices));

  return patchHomeState(
    {
      invoices: items,
      invoicesRemoteCount: Math.max(items.length, safeNumber(options.remoteCount, homeState.invoicesRemoteCount)),
    },
    options
  );
}

export function setUsers(users = [], options = {}) {
  if (!currentIsAdmin()) {
    return patchHomeState({
      users: [],
      usersRemoteCount: 0,
    }, {
      ...safeObject(options),
      replace: true,
    });
  }

  const items = normalizeHomeUsers(safeArray(users));

  return patchHomeState(
    {
      users: items,
      usersRemoteCount: Math.max(items.length, safeNumber(options.remoteCount, homeState.usersRemoteCount)),
    },
    options
  );
}

export function setClients(clients = [], options = {}) {
  if (!currentIsAdmin()) {
    return patchHomeState({
      clients: [],
      clientsRemoteCount: 0,
    }, {
      ...safeObject(options),
      replace: true,
    });
  }

  const items = normalizeHomeClients(safeArray(clients));

  return patchHomeState(
    {
      clients: items,
      clientsRemoteCount: Math.max(items.length, safeNumber(options.remoteCount, homeState.clientsRemoteCount)),
    },
    options
  );
}

export function setRecent(activity = [], options = {}) {
  const items = normalizeHomeActivityList(safeArray(activity), currentIsAdmin());

  return patchHomeState(
    {
      activity: items,
      activityRemoteCount: Math.max(items.length, safeNumber(options.remoteCount, homeState.activityRemoteCount)),
    },
    options
  );
}

export function setLastSyncAt(value = nowIso()) {
  const timestamp = safeText(value, nowIso());

  return assignRuntime({
    lastSyncAt: timestamp,
    lastUpdatedAt: timestamp,
  });
}

export function setRequestId(value = "") {
  return assignRuntime({
    requestId: safePublicId(value),
  });
}

export function setPage(value = DEFAULT_PAGE) {
  return assignRuntime({
    page: Math.max(1, safeNumber(value, DEFAULT_PAGE)),
  });
}

export function setPageSize(value = DEFAULT_PAGE_SIZE) {
  return assignRuntime({
    pageSize: Math.max(1, safeNumber(value, DEFAULT_PAGE_SIZE)),
  });
}

export function setOpeningTicketId(value = "") {
  return assignRuntime({
    openingTicketId: safePublicId(value),
  });
}

export function setSelectedTicketId(value = "") {
  const id = safePublicId(value);

  return assignRuntime({
    selectedTicketId: id,
    selectedIncidenciaId: id,
  });
}

export function setSelectedIncidenciaId(value = "") {
  return setSelectedTicketId(value);
}

export function clearSelectedTicketId() {
  return setSelectedTicketId("");
}

export function setCreating(value = false) {
  return assignRuntime({
    creating: safeBoolean(value, false),
  });
}

export function setNavigatingAction(value = "") {
  return assignRuntime({
    navigatingAction: redact(safeText(value, "")),
  });
}

/* =========================================================
   GETTERS
========================================================= */

export function getHomeState() {
  return homeState;
}

export function getHomeStateSnapshot() {
  normalizeHomeState();

  return clone(
    sanitizeStateDeep({
      version: homeState.version,

      role: homeState.role,
      rol: homeState.rol,
      roles: homeState.roles,
      admin: homeState.admin,

      hydrated: homeState.hydrated,
      loaded: homeState.loaded,
      loading: homeState.loading,
      refreshing: homeState.refreshing,
      creating: homeState.creating,

      openingTicketId: homeState.openingTicketId,
      selectedTicketId: homeState.selectedTicketId,
      selectedIncidenciaId: homeState.selectedIncidenciaId,
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

      users: homeState.admin ? homeState.users : [],
      usuarios: homeState.admin ? homeState.usuarios : [],

      clients: homeState.admin ? homeState.clients : [],
      clientes: homeState.admin ? homeState.clientes : [],
      customers: homeState.admin ? homeState.customers : [],

      activity: homeState.activity,
      activities: homeState.activities,
      recent: homeState.recent,
      recentActivity: homeState.recentActivity,

      meta: homeState.meta,

      partial: homeState.partial,
      errors: homeState.errors,

      countsInfo: {
        widgets: homeState.widgets.length,
        tickets: homeState.tickets.length,
        invoices: homeState.invoices.length,
        users: homeState.admin ? homeState.users.length : 0,
        clients: homeState.admin ? homeState.clients.length : 0,
        activity: homeState.activity.length,
      },

      policy: {
        runtimeOnly: true,
        modelBackedNormalization: true,

        noAppCore: true,
        noEvents: true,
        noWindowGlobals: true,
        noRouter: true,
        noAuth: true,
        noHttp: true,
        noStorage: true,
        noCss: true,

        roleAware: true,
        userNeverKeepsAdminUsersClients: true,
        readsCollectionsFromDashboardFallback: true,
        normalizeOnlyOnWritesOrExplicitSnapshot: true,

        selectedTicketSyncedWithSelectedIncidencia: true,
        openingTicketDoesNotSelectTicket: true,

        noRawBackendPayloadInDashboard: true,
        stripsCosmosMetadata: true,
        noEmailAsIdentity: true,
        sanitizerDoesNotStripDescription: true,

        errorsRedacted: true,
        snapshotRedacted: true,
      },
    }),
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
  return homeState.dashboard;
}

export function getHomeSummary() {
  return homeState.summary;
}

export function getHomeWidgets() {
  return homeState.widgets;
}

export function getHomeTickets() {
  return homeState.tickets;
}

export function getHomeInvoices() {
  return homeState.invoices;
}

export function getHomeUsers() {
  return homeState.admin ? homeState.users : [];
}

export function getHomeClients() {
  return homeState.admin ? homeState.clients : [];
}

export function getHomeActivity() {
  return homeState.activity;
}

export function getSelectedTicketId() {
  return homeState.selectedTicketId || homeState.selectedIncidenciaId || "";
}

export function getSelectedIncidenciaId() {
  return getSelectedTicketId();
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

  get state() {
    return homeState;
  },

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

  setPage,
  setPageSize,

  setOpeningTicketId,
  setSelectedTicketId,
  setSelectedIncidenciaId,
  clearSelectedTicketId,

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

  getSelectedTicketId,
  getSelectedIncidenciaId,

  isLoading: isHomeLoading,
  isRefreshing: isHomeRefreshing,
  isLoaded: isHomeLoaded,
  isHydrated: isHomeHydrated,
  hasError: hasHomeError,
});

export default HomeState;
