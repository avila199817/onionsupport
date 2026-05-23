/* =========================================================
   Onion Support - Home State
   Archivo: /src/views/home/home.state.js

   Responsabilidad:
   - Estado runtime mínimo de Home.
   - Mantener shape estable para template/selectors.
   - Recibir dashboard ya normalizado.
   - Separar Home admin/user desde el propio payload.
   - User nunca conserva usuarios/clientes de cache admin.
   - Preservar datos existentes sólo si el rol no cambia.
   - Leer colecciones desde dashboard raíz y dashboard.collections.
   - Evitar machacar dashboard con arrays vacíos.
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

export const HOME_STATE_VERSION = "home.state.v9";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 5;

const RAW_DASHBOARD_KEYS = new Set([
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
  /token|authorization|cookie|password|secret|credential|jwt|bearer|refresh|access_token|accessToken|id_token|idToken|otp|totp|mfa|2fa|backupCode|backup_code|sessionId|session_id|email|correo|phone|telefono|teléfono|address|direccion|dirección|nif|dni|ipRaw|ip|userAgent/i;

const EMAIL_RE = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/gi;

const ADMIN_ENTITY_RE =
  /(^|[\s._/-])(clientes?|clients?|customers?|usuarios?|users?|members?|directorio|directory)([\s._/-]|$)/i;

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
  let empty = null;

  for (const value of values) {
    if (!Array.isArray(value)) continue;

    if (value.length) return value;

    if (!empty) empty = value;
  }

  return empty;
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
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(EMAIL_RE, "");
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

function isRawKey(key = "") {
  return RAW_DASHBOARD_KEYS.has(String(key || ""));
}

function isCosmosMetaKey(key = "") {
  return COSMOS_META_KEYS.has(String(key || ""));
}

function isEmailLike(value = "") {
  const text = safeText(value, "");
  return Boolean(text && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/i.test(text));
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature)=/i.test(
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

function stripRawDashboardFields(dashboard = {}) {
  return sanitizeStateObject(dashboard);
}

function sanitizeSnapshotValue(value, keyHint = "") {
  return sanitizeStateDeep(value, keyHint);
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
   ROLE HELPERS
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
      homeState.admin === true ? "admin" : "",
      "user"
    )
  );
}

function currentIsAdmin() {
  return isAdminRole(currentRole());
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

  return admin
    ? rows
    : rows.filter((item) => !isAdminOnlyActivity(item));
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

  return admin
    ? rows
    : rows.filter((item) => !isAdminOnlyWidget(item));
}

/* =========================================================
   INITIAL STATE
========================================================= */

export function createInitialHomeState() {
  return {
    version: HOME_STATE_VERSION,

    role: "user",
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
   DERIVED NORMALIZATION HELPERS
========================================================= */

function numberFrom(...values) {
  return Math.max(0, ...values.map((value) => safeNumber(value, 0)));
}

function getTicketStatusKey(item = {}) {
  const raw = safeObject(item);
  const key = normalizeKey(
    first(
      raw.status,
      raw.estado,
      raw.state,
      raw.lifecycle?.status,
      "pending"
    )
  );

  if (["open", "opened", "abierta", "abierto"].includes(key)) return "open";
  if (["progress", "in_progress", "inprogress", "en_proceso", "working", "assigned"].includes(key)) return "progress";
  if (["resolved", "resuelta", "resuelto", "solved"].includes(key)) return "resolved";
  if (["closed", "close", "cerrada", "cerrado", "cancelled", "canceled", "archived"].includes(key)) return "closed";

  return "pending";
}

function getInvoiceStatusKey(item = {}) {
  const raw = safeObject(item);
  const key = normalizeKey(
    first(
      raw.paymentStatus,
      raw.estadoPago,
      raw.payment?.status,
      raw.status,
      raw.estado,
      "pending"
    )
  );

  if (["paid", "pagada", "pagado", "cobrada", "cobrado", "abonada", "abonado"].includes(key)) return "paid";
  if (["overdue", "vencida", "vencido"].includes(key)) return "overdue";
  if (["partial", "parcial", "pago_parcial", "partially_paid"].includes(key)) return "partial";
  if (["cancelled", "canceled", "cancelada", "cancelado", "void"].includes(key)) return "cancelled";
  if (["draft", "borrador"].includes(key)) return "draft";

  return "pending";
}

function isInvoicePaid(item = {}) {
  return getInvoiceStatusKey(item) === "paid";
}

function isInvoicePendingLike(item = {}) {
  return ["pending", "overdue", "partial"].includes(getInvoiceStatusKey(item));
}

function getInvoiceAmount(item = {}) {
  const raw = safeObject(item);

  return safeNumber(
    first(
      raw.totales?.total,
      raw.payment?.amount,
      raw.total,
      raw.amount,
      raw.importe,
      raw.totalFactura,
      raw.facturaTotal,
      raw.facturaImporte,
      raw.importeFactura,
      raw.invoiceAmount,
      raw.price,
      raw.subtotal,
      raw.base,
      0
    ),
    0
  );
}

function getInvoicePaidAmount(item = {}) {
  const raw = safeObject(item);

  if (!isInvoicePaid(raw)) return 0;

  return safeNumber(
    first(
      raw.payment?.paidAmount,
      raw.totales?.pagado,
      raw.paidAmount,
      raw.amountPaid,
      raw.pagado,
      getInvoiceAmount(raw)
    ),
    0
  );
}

function getInvoicePendingAmount(item = {}) {
  const raw = safeObject(item);

  if (!isInvoicePendingLike(raw)) return 0;

  const explicit = first(
    raw.payment?.pendingAmount,
    raw.totales?.pendiente,
    raw.pendingAmount,
    raw.amountPending,
    raw.pendiente,
    null
  );

  if (explicit !== null && explicit !== undefined) {
    return Math.max(0, safeNumber(explicit, 0));
  }

  return Math.max(0, getInvoiceAmount(raw) - getInvoicePaidAmount(raw));
}

function computedTicketStatusCounts() {
  const counts = {
    pending: 0,
    open: 0,
    progress: 0,
    resolved: 0,
    closed: 0,
  };

  for (const ticket of safeArray(homeState.tickets)) {
    const key = getTicketStatusKey(ticket);

    if (Object.prototype.hasOwnProperty.call(counts, key)) {
      counts[key] += 1;
    }
  }

  return counts;
}

function computedInvoiceCountsAndAmounts() {
  const invoices = safeArray(homeState.invoices);

  return invoices.reduce(
    (acc, invoice) => {
      const statusKey = getInvoiceStatusKey(invoice);

      acc.grossInvoiceAmount += getInvoiceAmount(invoice);

      if (statusKey === "paid") {
        acc.paidInvoices += 1;
        acc.invoiceAmount += getInvoicePaidAmount(invoice);
        acc.paidInvoiceAmount = acc.invoiceAmount;
      }

      if (["pending", "overdue", "partial"].includes(statusKey)) {
        acc.pendingInvoices += 1;
        acc.pendingInvoiceAmount += getInvoicePendingAmount(invoice);
      }

      if (statusKey === "overdue") {
        acc.overdueInvoices += 1;
      }

      return acc;
    },
    {
      paidInvoices: 0,
      pendingInvoices: 0,
      overdueInvoices: 0,
      invoiceAmount: 0,
      paidInvoiceAmount: 0,
      pendingInvoiceAmount: 0,
      grossInvoiceAmount: 0,
    }
  );
}

/* =========================================================
   SUMMARY
========================================================= */

function normalizeSummary(summary = {}, admin = false) {
  const raw = sanitizeStateObject(summary);
  const ticketCounts = computedTicketStatusCounts();
  const invoiceData = computedInvoiceCountsAndAmounts();

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

  const pendingTickets = numberFrom(
    raw.pendingTickets,
    raw.pendingIncidencias,
    raw.incidenciasPendientes,
    ticketCounts.pending
  );

  const openTickets = numberFrom(
    raw.openTickets,
    raw.openIncidencias,
    raw.incidenciasAbiertas,
    ticketCounts.open
  );

  const progressTickets = numberFrom(
    raw.progressTickets,
    raw.progressIncidencias,
    raw.incidenciasEnCurso,
    ticketCounts.progress
  );

  const resolvedTickets = numberFrom(
    raw.resolvedTickets,
    raw.resolvedIncidencias,
    raw.incidenciasResueltas,
    ticketCounts.resolved
  );

  const closedTickets = numberFrom(
    raw.closedTickets,
    raw.closedIncidencias,
    raw.incidenciasCerradas,
    ticketCounts.closed
  );

  const activeTickets = numberFrom(
    raw.activeTickets,
    raw.activeIncidencias,
    pendingTickets + openTickets + progressTickets
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

  const paidInvoices = numberFrom(
    raw.paidInvoices,
    raw.paidFacturas,
    raw.facturasPagadas,
    invoiceData.paidInvoices
  );

  const pendingInvoices = numberFrom(
    raw.pendingInvoices,
    raw.pendingFacturas,
    raw.facturasPendientes,
    raw.invoicesPending,
    invoiceData.pendingInvoices
  );

  const overdueInvoices = numberFrom(
    raw.overdueInvoices,
    raw.overdueFacturas,
    raw.facturasVencidas,
    invoiceData.overdueInvoices
  );

  const invoiceAmount = numberFrom(
    raw.invoiceAmount,
    raw.paidInvoiceAmount,
    raw.billingTotal,
    raw.totalBilling,
    raw.totalFacturado,
    raw.importeFacturas,
    raw.facturacionVisible,
    raw.facturacionTotal,
    invoiceData.invoiceAmount
  );

  const paidInvoiceAmount = numberFrom(
    raw.paidInvoiceAmount,
    invoiceAmount
  );

  const pendingInvoiceAmount = numberFrom(
    raw.pendingInvoiceAmount,
    raw.importePendiente,
    raw.facturacionPendiente,
    invoiceData.pendingInvoiceAmount
  );

  const grossInvoiceAmount = numberFrom(
    raw.grossInvoiceAmount,
    invoiceData.grossInvoiceAmount,
    invoiceAmount + pendingInvoiceAmount
  );

  const usersCount = admin
    ? numberFrom(
        raw.usersCount,
        raw.usuariosCount,
        raw.totalUsers,
        raw.totalUsuarios,
        homeState.usersRemoteCount,
        homeState.users.length
      )
    : 0;

  const clientsCount = admin
    ? numberFrom(
        raw.clientsCount,
        raw.clientesCount,
        raw.customersCount,
        raw.totalClients,
        raw.totalClientes,
        raw.totalCustomers,
        homeState.clientsRemoteCount,
        homeState.clients.length
      )
    : 0;

  const attachmentsCount = numberFrom(
    raw.attachmentsCount,
    raw.filesCount,
    raw.adjuntosCount
  );

  return sanitizeStateObject({
    ...raw,

    totalTickets,
    ticketsTotal: totalTickets,
    incidenciasTotal: totalTickets,
    totalIncidencias: totalTickets,
    ticketsCount: totalTickets,
    incidenciasCount: totalTickets,

    pendingTickets,
    pendingIncidencias: pendingTickets,
    incidenciasPendientes: pendingTickets,

    openTickets,
    openIncidencias: openTickets,
    incidenciasAbiertas: openTickets,

    progressTickets,
    progressIncidencias: progressTickets,
    incidenciasEnCurso: progressTickets,

    resolvedTickets,
    resolvedIncidencias: resolvedTickets,
    incidenciasResueltas: resolvedTickets,

    closedTickets,
    closedIncidencias: closedTickets,
    incidenciasCerradas: closedTickets,

    activeTickets,
    activeIncidencias: activeTickets,

    urgentTickets,
    urgentIncidencias: urgentTickets,
    highPriorityTickets: urgentTickets,

    totalInvoices,
    invoicesTotal: totalInvoices,
    facturasTotal: totalInvoices,
    totalFacturas: totalInvoices,
    invoicesCount: totalInvoices,
    facturasCount: totalInvoices,

    paidInvoices,
    paidFacturas: paidInvoices,
    facturasPagadas: paidInvoices,

    pendingInvoices,
    pendingFacturas: pendingInvoices,
    facturasPendientes: pendingInvoices,
    invoicesPending: pendingInvoices,

    overdueInvoices,
    overdueFacturas: overdueInvoices,
    facturasVencidas: overdueInvoices,

    invoiceAmount,
    paidInvoiceAmount,
    pendingInvoiceAmount,
    grossInvoiceAmount,

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
  });
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

function fillCollectionsFromDashboard() {
  const admin = currentIsAdmin();
  const dashboard = safeObject(homeState.dashboard);
  const collections = safeObject(dashboard.collections);

  if (!homeState.tickets.length) {
    homeState.tickets = safeArray(
      firstArray(
        dashboard.tickets,
        dashboard.incidencias,
        collections.tickets,
        collections.incidencias
      )
    );
  }

  if (!homeState.invoices.length) {
    homeState.invoices = safeArray(
      firstArray(
        dashboard.invoices,
        dashboard.facturas,
        collections.invoices,
        collections.facturas
      )
    );
  }

  if (admin && !homeState.users.length) {
    homeState.users = safeArray(
      firstArray(
        dashboard.users,
        dashboard.usuarios,
        collections.users,
        collections.usuarios
      )
    );
  }

  if (admin && !homeState.clients.length) {
    homeState.clients = safeArray(
      firstArray(
        dashboard.clients,
        dashboard.clientes,
        dashboard.customers,
        collections.clients,
        collections.clientes,
        collections.customers
      )
    );
  }

  if (!homeState.widgets.length) {
    homeState.widgets = filterWidgetsForRole(
      safeArray(
        firstArray(
          dashboard.widgets,
          dashboard.cards,
          dashboard.kpis,
          dashboard.blocks,
          collections.widgets,
          collections.cards,
          collections.kpis,
          collections.blocks
        )
      ),
      admin
    );
  }

  if (!homeState.activity.length) {
    homeState.activity = filterActivityForRole(
      safeArray(
        firstArray(
          dashboard.activity,
          dashboard.activities,
          dashboard.recent,
          dashboard.recentActivity,
          collections.activity,
          collections.activities,
          collections.recent,
          collections.recentActivity
        )
      ),
      admin
    );
  }
}

function buildDashboardFromState() {
  const admin = currentIsAdmin();

  return sanitizeStateObject({
    ...stripRawDashboardFields(homeState.dashboard),

    role: homeState.role,
    admin: homeState.admin,

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

    partial: Boolean(homeState.partial),
    errors: homeState.errors,

    meta: {
      ...safeObject(homeState.dashboard?.meta),
      ...safeObject(homeState.meta),

      role: homeState.role,
      admin: homeState.admin,

      widgetsCount: homeState.widgets.length,

      ticketsCount: homeState.summary.totalTickets,
      incidenciasCount: homeState.summary.totalTickets,
      visibleTicketsCount: homeState.tickets.length,

      invoicesCount: homeState.summary.totalInvoices,
      facturasCount: homeState.summary.totalInvoices,
      visibleInvoicesCount: homeState.invoices.length,

      usersCount: admin ? homeState.summary.usersCount : 0,
      usuariosCount: admin ? homeState.summary.usuariosCount : 0,
      visibleUsersCount: admin ? homeState.users.length : 0,

      clientsCount: admin ? homeState.summary.clientsCount : 0,
      clientesCount: admin ? homeState.summary.clientesCount : 0,
      customersCount: admin ? homeState.summary.customersCount : 0,
      visibleClientsCount: admin ? homeState.clients.length : 0,

      activityCount: homeState.activity.length,
      recentCount: homeState.activity.length,

      selectedTicketId: homeState.selectedTicketId || "",
      selectedIncidenciaId: homeState.selectedIncidenciaId || "",
    },
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
  const admin = currentIsAdmin();

  homeState.role = normalizeRole(homeState.role);
  homeState.admin = admin;

  syncSelectedAliases();

  homeState.widgets = filterWidgetsForRole(safeArray(homeState.widgets), admin);
  homeState.activity = filterActivityForRole(safeArray(homeState.activity), admin);

  homeState.users = admin ? safeArray(homeState.users) : [];
  homeState.clients = admin ? safeArray(homeState.clients) : [];

  homeState.incidencias = homeState.tickets;
  homeState.facturas = homeState.invoices;

  homeState.usuarios = admin ? homeState.users : [];
  homeState.clientes = admin ? homeState.clients : [];
  homeState.customers = admin ? homeState.clients : [];

  homeState.activities = homeState.activity;
  homeState.recent = homeState.activity;
  homeState.recentActivity = homeState.activity;

  homeState.cards = homeState.widgets;
  homeState.kpis = homeState.widgets;
  homeState.blocks = homeState.widgets;

  homeState.ticketsRemoteCount = Math.max(homeState.tickets.length, safeNumber(homeState.ticketsRemoteCount, 0));
  homeState.invoicesRemoteCount = Math.max(homeState.invoices.length, safeNumber(homeState.invoicesRemoteCount, 0));

  homeState.usersRemoteCount = admin
    ? Math.max(homeState.users.length, safeNumber(homeState.usersRemoteCount, 0))
    : 0;

  homeState.clientsRemoteCount = admin
    ? Math.max(homeState.clients.length, safeNumber(homeState.clientsRemoteCount, 0))
    : 0;

  homeState.activityRemoteCount = Math.max(homeState.activity.length, safeNumber(homeState.activityRemoteCount, 0));

  homeState.remoteCount = Math.max(homeState.ticketsRemoteCount, safeNumber(homeState.remoteCount, 0));
  homeState.totalCount = Math.max(homeState.remoteCount, safeNumber(homeState.totalCount, 0));

  homeState.summary = normalizeSummary(homeState.summary, admin);
  homeState.stats = homeState.summary;
  homeState.metrics = homeState.summary;
  homeState.totals = homeState.summary;
  homeState.counts = homeState.summary;

  homeState.dashboard = buildDashboardFromState();

  return homeState;
}

export function normalizeHomeState() {
  const role = currentRole();
  const admin = isAdminRole(role);

  homeState.version = HOME_STATE_VERSION;

  homeState.role = role;
  homeState.admin = admin;

  homeState.hydrated = Boolean(homeState.hydrated);
  homeState.loaded = Boolean(homeState.loaded);
  homeState.loading = Boolean(homeState.loading);
  homeState.refreshing = Boolean(homeState.refreshing);
  homeState.creating = Boolean(homeState.creating);

  syncSelectedAliases();

  homeState.navigatingAction = redact(safeText(homeState.navigatingAction, ""));

  homeState.error = redact(safeText(homeState.error, ""));
  homeState.lastError = homeState.lastError ? normalizeError(homeState.lastError) : null;

  homeState.page = Math.max(1, safeNumber(homeState.page, DEFAULT_PAGE));
  homeState.pageSize = Math.max(1, safeNumber(homeState.pageSize, DEFAULT_PAGE_SIZE));

  homeState.dashboard = stripRawDashboardFields(homeState.dashboard);
  homeState.summary = sanitizeStateObject(homeState.summary);

  homeState.widgets = filterWidgetsForRole(safeArray(homeState.widgets), admin);

  homeState.tickets = safeArray(homeState.tickets);
  homeState.invoices = safeArray(homeState.invoices);

  homeState.users = admin ? safeArray(homeState.users) : [];
  homeState.clients = admin ? safeArray(homeState.clients) : [];

  homeState.activity = filterActivityForRole(safeArray(homeState.activity), admin);

  fillCollectionsFromDashboard();

  homeState.requestId = safeText(homeState.requestId, "");
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

  syncAliases();

  return homeState;
}

/* =========================================================
   PATCH
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

  if (key === "dashboard") return stripRawDashboardFields(value);
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
  const raw = stripRawDashboardFields(safeObject(dashboard));

  if (!hasKeys(raw) && options.replace !== true) {
    return homeState;
  }

  const previousRole = currentRole();
  const nextRole = roleFromDashboard(raw, first(options.role, previousRole));
  const admin = isAdminRole(nextRole);
  const replace = options.replace === true || previousRole !== nextRole || !admin;

  const selectedBeforeReplace = safePublicId(
    first(
      homeState.selectedTicketId,
      homeState.selectedIncidenciaId,
      ""
    )
  );

  homeState.role = nextRole;
  homeState.admin = admin;

  assign(
    "dashboard",
    replace
      ? raw
      : {
          ...stripRawDashboardFields(homeState.dashboard),
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

  const rawCollections = safeObject(raw.collections);

  const widgets = firstArray(
    raw.widgets,
    raw.cards,
    raw.kpis,
    raw.blocks,
    rawCollections.widgets,
    rawCollections.cards,
    rawCollections.kpis,
    rawCollections.blocks
  );

  const tickets = firstArray(
    raw.tickets,
    raw.incidencias,
    rawCollections.tickets,
    rawCollections.incidencias
  );

  const invoices = firstArray(
    raw.invoices,
    raw.facturas,
    rawCollections.invoices,
    rawCollections.facturas
  );

  const users = admin
    ? firstArray(
        raw.users,
        raw.usuarios,
        rawCollections.users,
        rawCollections.usuarios
      )
    : [];

  const clients = admin
    ? firstArray(
        raw.clients,
        raw.clientes,
        raw.customers,
        rawCollections.clients,
        rawCollections.clientes,
        rawCollections.customers
      )
    : [];

  const activity = firstArray(
    raw.activity,
    raw.activities,
    raw.recent,
    raw.recentActivity,
    rawCollections.activity,
    rawCollections.activities,
    rawCollections.recent,
    rawCollections.recentActivity
  );

  if (widgets || replace) assign("widgets", filterWidgetsForRole(widgets || [], admin), { replace });

  if (tickets || replace) {
    assign("tickets", tickets || [], { replace });
    homeState.ticketsRemoteCount = Math.max(
      homeState.tickets.length,
      safeNumber(options.remoteCount, 0),
      remoteCountFrom(raw, "tickets"),
      replace ? 0 : homeState.ticketsRemoteCount
    );
  }

  if (invoices || replace) {
    assign("invoices", invoices || [], { replace });
    homeState.invoicesRemoteCount = Math.max(
      homeState.invoices.length,
      remoteCountFrom(raw, "invoices"),
      replace ? 0 : homeState.invoicesRemoteCount
    );
  }

  if (admin && (users || replace)) {
    assign("users", users || [], { replace });
    homeState.usersRemoteCount = Math.max(
      homeState.users.length,
      remoteCountFrom(raw, "users"),
      replace ? 0 : homeState.usersRemoteCount
    );
  } else {
    homeState.users = [];
    homeState.usersRemoteCount = 0;
  }

  if (admin && (clients || replace)) {
    assign("clients", clients || [], { replace });
    homeState.clientsRemoteCount = Math.max(
      homeState.clients.length,
      remoteCountFrom(raw, "clients"),
      replace ? 0 : homeState.clientsRemoteCount
    );
  } else {
    homeState.clients = [];
    homeState.clientsRemoteCount = 0;
  }

  if (activity || replace) {
    assign("activity", filterActivityForRole(activity || [], admin), { replace });
    homeState.activityRemoteCount = Math.max(
      homeState.activity.length,
      remoteCountFrom(raw, "activity"),
      replace ? 0 : homeState.activityRemoteCount
    );
  }

  homeState.meta = replace
    ? sanitizeStateObject({
        ...safeObject(raw.meta),
        role: nextRole,
        admin,
      })
    : sanitizeStateObject({
        ...safeObject(homeState.meta),
        ...safeObject(raw.meta),
        role: nextRole,
        admin,
      });

  homeState.errors = normalizeErrorList(raw.errors);
  homeState.partial = Boolean(raw.partial);

  homeState.requestId = safeText(first(options.requestId, raw.requestId, raw.meta?.requestId, homeState.requestId, ""), "");
  homeState.lastSyncAt = safeText(first(options.lastSyncAt, raw.lastSyncAt, raw.updatedAt, raw.generatedAt, raw.meta?.updatedAt, nowIso()), nowIso());
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
    widgets: filterWidgetsForRole(safeArray(widgets), currentIsAdmin()),
  }, options);
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
  if (!currentIsAdmin()) {
    return patchHomeState({
      users: [],
      usersRemoteCount: 0,
    }, {
      ...safeObject(options),
      replace: true,
    });
  }

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
  if (!currentIsAdmin()) {
    return patchHomeState({
      clients: [],
      clientsRemoteCount: 0,
    }, {
      ...safeObject(options),
      replace: true,
    });
  }

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
  const items = filterActivityForRole(safeArray(recent), currentIsAdmin());

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

  return assignRuntime({
    lastSyncAt: finalValue,
    lastUpdatedAt: finalValue,
  });
}

export function setRequestId(value = "") {
  return assignRuntime({
    requestId: safeText(value, ""),
  });
}

export function setPage(page = DEFAULT_PAGE) {
  return assignRuntime({
    page: Math.max(1, safeNumber(page, DEFAULT_PAGE)),
  });
}

export function setPageSize(pageSize = DEFAULT_PAGE_SIZE) {
  return assignRuntime({
    page: DEFAULT_PAGE,
    pageSize: Math.max(1, safeNumber(pageSize, DEFAULT_PAGE_SIZE)),
  });
}

export function setOpeningTicketId(ticketId = "") {
  return assignRuntime({
    openingTicketId: safePublicId(ticketId),
  });
}

export function setSelectedTicketId(ticketId = "") {
  const selected = safePublicId(ticketId);

  return assignRuntime({
    selectedTicketId: selected,
    selectedIncidenciaId: selected,
  });
}

export function setSelectedIncidenciaId(incidenciaId = "") {
  return setSelectedTicketId(incidenciaId);
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
    sanitizeSnapshotValue({
      version: homeState.version,

      role: homeState.role,
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
