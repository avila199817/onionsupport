/* =========================================================
   Onion Support - Home Template
   Archivo: /src/views/home/home.template.js

   Final:
   - Home simple, visual y directo.
   - Sin card grande envolvente.
   - Sin accesos rápidos duplicados.
   - Sin widgets duplicados.
   - Sin health/server/ready/ping.
   - Sólo Home sobre usuarios, clientes, incidencias y facturas.
   - Con Facturas totales + importe total pagado.
   - Si una factura no está pagada, no se muestra importe como cobrado.
   - Listas Home limitadas a 5 últimos elementos.
   - Contadores sobre totales completos.
   - Tabla de incidencias sin columna Usuario / Cliente.
   - Tabla de incidencias sin columna Técnico separada.
   - Técnico integrado en primera columna con avatar real/iniciales.
   - Usuario/avatar del Home hidratable desde el mismo view-model del sidebar.
   - ID de incidencia completo visible.
   - Detalle de incidencia abre modal.
   - Modal con técnico asignado, avatar/iniciales y facturas vinculadas.
   - Avatar visible con tono dinámico.
   - Textos visibles en español.
   - Modelo calculado una sola vez por render.
   - Sin rutas opcionales inventadas.
========================================================= */

import {
  ROUTES as CORE_ROUTES,
  isAdminRoute as configIsAdminRoute,
  isBlockedRoutePath as configIsBlockedRoutePath,
  normalizeRoutePath as configNormalizeRoutePath,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../../core/config.js";

import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_RECENT_LIMIT,
  DEFAULT_CURRENCY,

  safeText,
  safeNumber,
  safeArray,
  safeObject,
  first,
  isSameIdentity,
  normalizeKey,

  formatNumber,
  formatMoney,
  formatDateTime,
  formatDateShort,
  formatRelativeDate,
  formatLastUpdate,

  getInitials,

  isAdminRole,
  buildHomeTemplateData,

  getTicketId,
  getTicketSubject,
  getTicketDescription,
  getTicketStatus,
  getTicketStatusKey,
  getTicketStatusLabel,
  getTicketPriorityKey,
  getTicketCategory,
  getTicketCreatedAt,
  getTicketUpdatedAt,

  getInvoiceId,
  getInvoiceAmount,
  getInvoicePaidAmount,
  getInvoiceCurrency,
  getInvoiceStatusKey,
  getInvoiceStatusLabel,
  isInvoicePaid,

  getActivityTitle,
  getActivityText,
  getActivityDate,
  getActivityType,
} from "./home.selectors.js";

export const TEMPLATE_VERSION = "home.template.final.13";

const ACTIONS = Object.freeze({
  REFRESH: "refresh",
  RETRY: "retry",
  CREATE_INCIDENCIA: "create_incidencia",
  NAVIGATE: "navigate_home",
  COPY_ID: "copy_widget_id",
  EXPORT_CSV: "export_csv",
  OPEN_TICKET_DETAIL: "open_ticket_detail",
  CLOSE_TICKET_DETAIL: "close_ticket_detail",
});

const LIMITS = Object.freeze({
  activity: 5,
  invoices: 5,
  entities: 5,
  tickets: 5,
});

const STATUS_ORDER = Object.freeze([
  "pending",
  "open",
  "progress",
  "resolved",
  "closed",
]);

const RAW_KEYS = new Set(["raw", "data", "payload", "response", "body"]);

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
  /token|authorization|cookie|password|secret|credential|jwt|bearer|refresh|access_token|accessToken|id_token|idToken|otp|totp|mfa|2fa|backupCode|backup_code|sessionId|session_id|email|correo|phone|telefono|teléfono|address|direccion|dirección|nif|dni|ipRaw|userAgent/i;

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/i;

const AVATAR_TONES = Object.freeze([
  "violet",
  "green",
  "cyan",
  "amber",
  "rose",
  "slate",
]);

/* =========================================================
   Seguridad HTML / rutas
========================================================= */

function redact(value = "") {
  return String(value || "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function attr(value = "") {
  return escapeHtml(redact(safeText(value, "")));
}

function joinClasses(...values) {
  return values
    .flat(Infinity)
    .map((value) => safeText(value, ""))
    .filter(Boolean)
    .join(" ");
}

function boolAttr(condition = false, value = "") {
  return condition ? value : "";
}

function isEmailLike(value = "") {
  const text = safeText(value, "").trim();
  return Boolean(text && EMAIL_RE.test(text));
}

function visualLabel(value = "", fallback = "Usuario") {
  const text = redact(safeText(value, "")).trim();

  if (!text) return fallback;
  if (isEmailLike(text)) return fallback;

  return text;
}

function sanitizePayloadValue(value, keyHint = "") {
  if (RAW_KEYS.has(keyHint)) return undefined;
  if (COSMOS_META_KEYS.has(keyHint)) return undefined;
  if (SENSITIVE_KEY_RE.test(String(keyHint || ""))) return undefined;

  if (typeof value === "string") return redact(value);

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizePayloadValue(item))
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (RAW_KEYS.has(key)) continue;
      if (COSMOS_META_KEYS.has(key)) continue;
      if (SENSITIVE_KEY_RE.test(String(key || ""))) continue;

      const clean = sanitizePayloadValue(item, key);
      if (clean !== undefined) output[key] = clean;
    }

    return output;
  }

  return value;
}

function jsonAttr(value = {}) {
  try {
    return escapeHtml(JSON.stringify(sanitizePayloadValue(value) || {}));
  } catch {
    return "{}";
  }
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature)=/i.test(
    String(value || "")
  );
}

function routeInput(value = "") {
  try {
    return configRoutePathFromUrlLike(value) || "";
  } catch {
    return safeText(value, "");
  }
}

function routeSuffix(value = "") {
  const raw = safeText(value, "");
  const hashIndex = raw.indexOf("#");
  const beforeHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";
  const queryIndex = beforeHash.indexOf("?");
  const search = queryIndex >= 0 ? beforeHash.slice(queryIndex) : "";

  if (hasSensitiveQuery(search) || hasSensitiveQuery(hash)) return "";

  return `${search}${hash}`;
}

function routePathOnly(value = "") {
  const raw = routeInput(value);

  if (!raw) return "";
  if (!raw.startsWith("/")) return "";
  if (raw.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (hasSensitiveQuery(raw)) return "";

  const pathOnly = raw.split("?")[0].split("#")[0] || "";

  try {
    return configNormalizeRoutePath(pathOnly) || "";
  } catch {
    let path = pathOnly.replace(/\\/g, "/").replace(/\/{2,}/g, "/");

    if (!path.startsWith("/")) path = `/${path}`;
    if (path.length > 1) path = path.replace(/\/+$/g, "") || "/";

    return path || "";
  }
}

function isBlockedRoute(value = "") {
  try {
    return configIsBlockedRoutePath(value) === true;
  } catch {
    const path = routePathOnly(value).toLowerCase();

    return Boolean(
      path === "/home" ||
        path === "/403" ||
        path === "/404" ||
        path === "/2fa" ||
        path === "/mfa" ||
        path === "/otp" ||
        path.startsWith("/2fa/") ||
        path.startsWith("/mfa/") ||
        path.startsWith("/otp/")
    );
  }
}

function safeRoute(value = "", fallback = "") {
  const raw = routeInput(value);
  const safeFallback = safeText(fallback, "");

  if (!raw) return safeFallback;
  if (!raw.startsWith("/")) return safeFallback;
  if (raw.startsWith("//")) return safeFallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return safeFallback;
  if (/[\r\n\t\\]/.test(raw)) return safeFallback;
  if (hasSensitiveQuery(raw)) return safeFallback;

  const canonical = routePathOnly(raw);

  if (!canonical) return safeFallback;
  if (isBlockedRoute(canonical)) return safeFallback;

  return `${canonical}${routeSuffix(raw)}`;
}

function safeStaticRoute(value = "", fallback = "") {
  return safeRoute(value, fallback) || fallback;
}

const ROUTES = Object.freeze({
  INCIDENCIAS: safeStaticRoute(CORE_ROUTES?.incidencias, "/incidencias"),
  FACTURAS: safeStaticRoute(CORE_ROUTES?.facturas, "/facturas"),
  CLIENTES: safeStaticRoute(CORE_ROUTES?.clientes, "/clientes"),
  USUARIOS: safeStaticRoute(CORE_ROUTES?.usuarios, ""),
});

function getRoutePath(value = "") {
  return safeRoute(value, "").split("?")[0].split("#")[0] || "";
}

function isAdminOnlyRoute(route = "") {
  const path = getRoutePath(route);
  const clientes = getRoutePath(ROUTES.CLIENTES);
  const usuarios = getRoutePath(ROUTES.USUARIOS);

  if (!path) return false;

  try {
    if (configIsAdminRoute(path) === true) return true;
  } catch {
    // Fallback local.
  }

  return (
    Boolean(clientes && (path === clientes || path.startsWith(`${clientes}/`))) ||
    Boolean(usuarios && (path === usuarios || path.startsWith(`${usuarios}/`)))
  );
}

function safeImageSrc(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";
  if (hasSensitiveQuery(raw)) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(?:data|blob|javascript|vbscript|file):/i.test(raw)) return "";
  if (raw.startsWith("//")) return "";

  if (raw.startsWith("/")) {
    return raw.replace(/\/{2,}/g, "/");
  }

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  if (
    raw.includes("/") ||
    /\.(?:png|jpe?g|gif|webp|svg|avif|bmp)(?:[?#].*)?$/i.test(raw)
  ) {
    const clean = raw
      .replace(/^\.\//, "")
      .replace(/^\/+/, "")
      .replace(/\/{2,}/g, "/");

    return clean ? `/${clean}` : "";
  }

  return "";
}

/* =========================================================
   View model único
========================================================= */

function getState(input = {}) {
  return safeObject(input.state);
}

function getLoadingState(input = {}) {
  const data = safeObject(input);
  const state = getState(data);

  return {
    loading: Boolean(state.loading || data.loading),
    refreshing: Boolean(state.refreshing || data.refreshing),
    creating: Boolean(state.creating || data.creating),
    loaded: Boolean(state.loaded || data.loaded),
    hydrated: Boolean(state.hydrated || data.hydrated),
    error: redact(safeText(first(state.error, data.error), "")),
    openingTicketId: safeText(state.openingTicketId, ""),
    selectedTicketId: safeText(first(state.selectedTicketId, data.selectedTicketId, data.selectedIncidenciaId), ""),
    navigatingAction: redact(safeText(state.navigatingAction, "")),
  };
}

function getTemplateMetaFromView(data = {}, view = {}) {
  const state = getState(data);
  const dashboard = safeObject(view.dashboard);

  const lastUpdatedAt = first(
    data.lastUpdatedAt,
    data.lastSyncAt,
    state.lastUpdatedAt,
    state.lastSyncAt,
    view.lastUpdatedAt,
    dashboard.updatedAt,
    dashboard.generatedAt,
    dashboard.lastSyncAt,
    dashboard.meta?.updatedAt
  );

  return {
    requestId: safeText(first(data.requestId, state.requestId, view.requestId, dashboard.requestId, dashboard.meta?.requestId), ""),
    lastUpdatedAt,
    partial: Boolean(first(dashboard.partial, data.partial, false)),
    errorsCount: safeArray(first(dashboard.errors, data.errors, [])).length,
  };
}

function getHydratedHomeUser(data = {}, view = {}) {
  const sidebarUser = safeObject(
    first(
      data.sidebarUser,
      data.sidebar?.user,
      data.layout?.sidebarUser,
      data.context?.sidebarUser,
      data.context?.user,
      view.sidebarUser,
      view.sidebar?.user,
      {}
    )
  );

  const viewUser = safeObject(
    first(
      view.user,
      data.user,
      data.currentUser,
      data.authUser,
      data.sessionUser,
      data.session?.user,
      data.auth?.user,
      data.account,
      {}
    )
  );

  const user = {
    ...viewUser,
    ...sidebarUser,
  };

  const displayName = visualLabel(
    first(
      sidebarUser.displayName,
      sidebarUser.name,
      sidebarUser.fullName,
      sidebarUser.username,

      view.displayName,
      view.name,
      view.fullName,

      viewUser.displayName,
      viewUser.name,
      viewUser.fullName,
      viewUser.username,
      viewUser.userName
    ),
    "Usuario"
  );

  const avatarUrl = safeImageSrc(
    first(
      sidebarUser.avatarUrl,
      sidebarUser.avatar,
      sidebarUser.photoUrl,
      sidebarUser.photoURL,
      sidebarUser.picture,
      sidebarUser.pictureUrl,
      sidebarUser.image,
      sidebarUser.imageUrl,
      sidebarUser.foto,
      sidebarUser.fotoUrl,
      sidebarUser.imagen,
      sidebarUser.imagenUrl,

      sidebarUser.profile?.avatarUrl,
      sidebarUser.profile?.avatar,
      sidebarUser.profile?.photoUrl,
      sidebarUser.profile?.photoURL,
      sidebarUser.profile?.picture,
      sidebarUser.profile?.pictureUrl,
      sidebarUser.profile?.image,
      sidebarUser.profile?.imageUrl,
      sidebarUser.media?.avatarUrl,
      sidebarUser.media?.avatar,
      sidebarUser.media?.photoUrl,
      sidebarUser.media?.picture,

      view.avatarUrl,
      view.avatar,
      view.photoUrl,
      view.photoURL,
      view.picture,
      view.image,

      viewUser.avatarUrl,
      viewUser.avatar,
      viewUser.photoUrl,
      viewUser.photoURL,
      viewUser.picture,
      viewUser.pictureUrl,
      viewUser.image,
      viewUser.imageUrl,
      viewUser.foto,
      viewUser.fotoUrl,
      viewUser.imagen,
      viewUser.imagenUrl,

      viewUser.profile?.avatarUrl,
      viewUser.profile?.avatar,
      viewUser.profile?.photoUrl,
      viewUser.profile?.photoURL,
      viewUser.profile?.picture,
      viewUser.profile?.pictureUrl,
      viewUser.media?.avatarUrl,
      viewUser.media?.avatar,
      viewUser.media?.photoUrl,
      viewUser.media?.picture
    )
  );

  const initials = safeText(
    first(
      sidebarUser.initials,
      sidebarUser.iniciales,
      view.initials,
      view.iniciales,
      viewUser.initials,
      viewUser.iniciales,
      getInitials(displayName)
    ),
    "ON"
  )
    .slice(0, 3)
    .toUpperCase();

  const rawRole = first(
    sidebarUser.role,
    sidebarUser.rol,
    Array.isArray(sidebarUser.roles) ? sidebarUser.roles[0] : "",
    view.role,
    view.rol,
    Array.isArray(view.roles) ? view.roles[0] : "",
    viewUser.role,
    viewUser.rol,
    Array.isArray(viewUser.roles) ? viewUser.roles[0] : ""
  );

  const role = safeText(rawRole, "user").toLowerCase() === "admin" ? "admin" : "user";
  const isAdmin = Boolean(sidebarUser.isAdmin === true || view.admin === true || isAdminRole(role));

  return {
    user,
    displayName,
    avatarUrl,
    initials,
    role: isAdmin ? "admin" : "user",
    isAdmin,
  };
}

function buildTemplateViewModel(input = {}) {
  const data = safeObject(input);
  const view = buildHomeTemplateData(data);
  const state = getLoadingState(data);
  const hydratedUser = getHydratedHomeUser(data, view);
  const admin = hydratedUser.isAdmin;
  const meta = getTemplateMetaFromView(data, view);

  const ticketRows = safeArray(first(view.ticketRows, view.incidenceRows, view.tableRows, view.pageItems, []));
  const invoiceRows = safeArray(first(view.invoiceRows, view.facturaRows, []));
  const recentTickets = safeArray(first(view.recentTickets, view.recentIncidencias, view.latestTickets, view.latestIncidencias, []));
  const recentInvoices = safeArray(first(view.recentInvoices, view.recentFacturas, view.latestInvoices, view.latestFacturas, []));

  return {
    __homeTemplateVm: true,

    data,
    view,
    state,
    meta,
    admin,

    role: hydratedUser.role,
    user: hydratedUser.user,
    displayName: hydratedUser.displayName,
    avatarUrl: hydratedUser.avatarUrl,
    initials: hydratedUser.initials,

    dashboard: safeObject(view.dashboard),
    summary: safeObject(view.summary),
    stats: safeObject(view.stats),

    statCards: safeArray(view.statCards),
    statusPills: safeArray(view.statusPills),
    widgets: safeArray(view.widgets),

    tickets: safeArray(view.tickets),
    incidencias: safeArray(first(view.incidencias, view.tickets, [])),
    recentTickets,
    recentIncidencias: recentTickets,
    ticketRows,

    invoices: safeArray(view.invoices),
    facturas: safeArray(first(view.facturas, view.invoices, [])),
    recentInvoices,
    recentFacturas: recentInvoices,
    invoiceRows,

    users: admin ? safeArray(view.users) : [],
    usuarios: admin ? safeArray(first(view.usuarios, view.users, [])) : [],

    clients: admin ? safeArray(view.clients) : [],
    clientes: admin ? safeArray(first(view.clientes, view.clients, [])) : [],

    activity: safeArray(view.activity),
    recentActivity: safeArray(first(view.recentActivity, view.activity, [])),

    selectedTicketId: safeText(first(view.selectedTicketId, view.selectedIncidenciaId, state.selectedTicketId), ""),
    selectedIncidenciaId: safeText(first(view.selectedIncidenciaId, view.selectedTicketId, state.selectedTicketId), ""),
    selectedTicket: safeObject(first(view.selectedTicket, view.selectedIncidencia, {}), null),
    ticketModal: safeObject(first(view.ticketModal, view.incidenciaModal, {})),

    collections: safeObject(view.collections),
    pagination: {
      ...safeObject(view.pagination),
      pageItems: ticketRows,
      pageSize: LIMITS.tickets,
    },
    pageItems: ticketRows,
  };
}

function asViewModel(input = {}) {
  return input && input.__homeTemplateVm === true
    ? input
    : buildTemplateViewModel(input);
}

/* =========================================================
   Filtros visuales / totales / avatar
========================================================= */

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }

  return undefined;
}

function hashString(value = "") {
  const text = safeText(value, "");
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function getAvatarTone(seed = "") {
  const safeSeed = safeText(seed, "avatar");
  const index = hashString(safeSeed) % AVATAR_TONES.length;

  return AVATAR_TONES[index] || "violet";
}

function homeIdentity(...values) {
  return values
    .flat(Infinity)
    .map((value) => safeText(value, ""))
    .filter(Boolean)
    .join(" ");
}

function isBlockedHomeIdentity(...values) {
  const raw = homeIdentity(...values).toLowerCase();
  const identity = normalizeKey(raw);

  if (!identity && !raw) return false;

  return Boolean(
    identity.includes("urgent") ||
      identity.includes("urgente") ||
      identity.includes("salud") ||
      identity.includes("health") ||
      identity.includes("ready") ||
      identity.includes("ping") ||
      identity.includes("server") ||
      identity.includes("servidor") ||
      identity.includes("infra") ||
      identity.includes("adjunto") ||
      identity.includes("adjuntos") ||
      identity.includes("archivo") ||
      identity.includes("archivos") ||
      identity.includes("documento") ||
      identity.includes("documentos") ||
      identity.includes("file") ||
      identity.includes("files") ||
      identity.includes("attachment") ||
      identity.includes("attachments") ||
      identity.includes("paperclip") ||
      (
        (identity.includes("ultima") || identity.includes("last") || raw.includes("última")) &&
        (identity.includes("actividad") || identity.includes("activity"))
      )
  );
}

function isInvoiceTotalsCard(card = {}) {
  const raw = homeIdentity(
    card.id,
    card.key,
    card.type,
    card.kind,
    card.modifier,
    card.iconName,
    card.label,
    card.title,
    card.text
  ).toLowerCase();

  const identity = normalizeKey(raw);

  return Boolean(
    raw.includes("facturas totales") ||
      raw.includes("total facturas") ||
      raw.includes("total de facturas") ||
      raw.includes("invoices total") ||
      raw.includes("total invoices") ||
      (identity.includes("factur") && (identity.includes("total") || identity.includes("totales"))) ||
      (identity.includes("invoice") && identity.includes("total"))
  );
}

function parseAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;

  const text = safeText(value, "").trim();
  if (!text) return Number.NaN;

  const clean = text.replace(/[^\d,.-]/g, "");
  if (!clean) return Number.NaN;

  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");
  const normalized = lastComma > lastDot
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean.replace(/,/g, "");

  const amount = Number(normalized);

  return Number.isFinite(amount) ? amount : Number.NaN;
}

function getInvoicesTotalAmount(vm = {}) {
  const invoices = safeArray(vm.invoices);

  const candidate = firstDefined(
    vm.stats.invoiceAmount,
    vm.stats.paidInvoiceAmount,
    vm.summary.invoiceAmount,
    vm.summary.paidInvoiceAmount,
    vm.summary.billingTotal,
    vm.summary.totalFacturado,
    vm.dashboard.invoiceAmount,
    vm.dashboard.paidInvoiceAmount,
    vm.dashboard.billingTotal,
    vm.dashboard.totalFacturado,
    vm.dashboard.facturacionTotal
  );

  const candidateAmount = parseAmount(candidate);

  if (Number.isFinite(candidateAmount)) return candidateAmount;

  return invoices.reduce((total, invoice) => {
    if (!isInvoicePaid(invoice)) return total;
    return total + safeNumber(getInvoicePaidAmount(invoice), 0);
  }, 0);
}

function getInvoicesTotalCount(vm = {}) {
  const invoices = safeArray(vm.invoices);

  return safeNumber(
    firstDefined(
      vm.stats.totalInvoices,
      vm.summary.totalInvoices,
      vm.summary.invoicesTotal,
      vm.summary.facturasTotal,
      vm.collections.invoicesRemoteCount,
      vm.dashboard.totalInvoices,
      vm.dashboard.invoicesTotal,
      vm.dashboard.facturasTotal
    ),
    invoices.length
  );
}

function getInvoicesTotalCurrency(vm = {}) {
  const invoices = safeArray(vm.invoices);
  const firstInvoice = safeObject(invoices[0]);

  return safeText(
    firstDefined(
      vm.collections.invoicesCurrency,
      vm.dashboard.invoicesCurrency,
      vm.dashboard.currency,
      getInvoiceCurrency(firstInvoice)
    ),
    DEFAULT_CURRENCY
  );
}

function buildInvoicesTotalCard(vm = {}) {
  const amount = getInvoicesTotalAmount(vm);
  const currency = getInvoicesTotalCurrency(vm);
  const count = getInvoicesTotalCount(vm);

  return {
    id: "facturas-totales",
    key: "facturas-totales",
    label: "Facturas totales",
    value: formatNumber(count),
    text: `Importe total: ${formatMoney(amount, currency)}`,
    iconName: "euro",
    modifier: "invoice-total",
    route: ROUTES.FACTURAS,
  };
}

function translateCard(card = {}, vm = {}) {
  const admin = Boolean(vm.admin);
  const identity = normalizeKey(homeIdentity(
    card.id,
    card.key,
    card.type,
    card.kind,
    card.modifier,
    card.iconName,
    card.label,
    card.title,
    card.text
  ));

  if (identity.includes("ticket") || identity.includes("incid")) {
    return {
      ...card,
      label: admin ? "Incidencias" : "Mis incidencias",
      text: card.text || (admin ? "Incidencias visibles en el panel." : "Tus solicitudes visibles."),
    };
  }

  if (identity.includes("invoice") || identity.includes("factur")) {
    return {
      ...card,
      label: card.label && !String(card.label).toLowerCase().includes("invoice")
        ? card.label
        : "Facturas",
      text: card.text || "Facturación visible.",
    };
  }

  if (identity.includes("client") || identity.includes("cliente") || identity.includes("customer")) {
    return {
      ...card,
      label: "Clientes",
      text: card.text || "Clientes visibles.",
    };
  }

  if (identity.includes("user") || identity.includes("usuario") || identity.includes("member")) {
    return {
      ...card,
      label: "Usuarios",
      text: card.text || "Usuarios visibles.",
    };
  }

  return card;
}

function getVisibleHomeStatCards(vm = {}) {
  const cards = safeArray(vm.statCards)
    .map((card) => translateCard(card, vm))
    .filter((card) => !isBlockedHomeIdentity(
      card.id,
      card.key,
      card.type,
      card.kind,
      card.modifier,
      card.iconName,
      card.label,
      card.title,
      card.text,
      card.badge,
      card.value
    ));

  const hasInvoiceTotals = cards.some(isInvoiceTotalsCard);

  if (hasInvoiceTotals) return cards;

  return [
    ...cards,
    buildInvoicesTotalCard(vm),
  ];
}

function inferHomeRouteFromIdentity(...values) {
  const identity = normalizeKey(homeIdentity(...values));

  if (!identity) return "";

  if (
    identity.includes("factur") ||
    identity.includes("invoice") ||
    identity.includes("billing") ||
    identity.includes("bill") ||
    identity.includes("euro")
  ) {
    return ROUTES.FACTURAS;
  }

  if (
    identity.includes("client") ||
    identity.includes("cliente") ||
    identity.includes("customer") ||
    identity.includes("directorio")
  ) {
    return ROUTES.CLIENTES;
  }

  if (
    identity.includes("usuario") ||
    identity.includes("user") ||
    identity.includes("member") ||
    identity.includes("miembro")
  ) {
    return ROUTES.USUARIOS;
  }

  if (
    identity.includes("incid") ||
    identity.includes("ticket") ||
    identity.includes("solicitud") ||
    identity.includes("open") ||
    identity.includes("abiert") ||
    identity.includes("closed") ||
    identity.includes("cerrad")
  ) {
    return ROUTES.INCIDENCIAS;
  }

  return "";
}

function resolveStatRoute(card = {}) {
  const explicitRoute = safeRoute(first(card.route, card.href, card.to, ""), "");

  if (explicitRoute) return explicitRoute;

  return inferHomeRouteFromIdentity(
    card.id,
    card.key,
    card.type,
    card.kind,
    card.modifier,
    card.iconName,
    card.label,
    card.title,
    card.text,
    card.badge
  ) || ROUTES.INCIDENCIAS;
}

function filterActivityForRole(vm = {}, rows = []) {
  const activity = safeArray(rows).filter((item) => !isBlockedHomeIdentity(
    item.type,
    item.kind,
    item.category,
    item.title,
    item.text,
    getActivityType(item),
    getActivityTitle(item),
    getActivityText(item)
  ));

  if (vm.admin) return activity;

  return activity.filter((item) => {
    const type = normalizeKey(first(item.type, item.kind, item.category, ""));

    return ![
      "client",
      "cliente",
      "customer",
      "user",
      "usuario",
      "member",
      "server",
      "servidor",
    ].includes(type);
  });
}

/* =========================================================
   Iconos
========================================================= */

function icon(name = "activity") {
  const common =
    `aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  const icons = {
    home: `<svg ${common}><path d="m3 10.5 9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>`,
    refresh: `<svg ${common}><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>`,
    plus: `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
    ticket: `<svg ${common}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,
    invoice: `<svg ${common}><path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h4"/></svg>`,
    client: `<svg ${common}><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9h.01"/><path d="M9 13h.01"/><path d="M9 17h.01"/></svg>`,
    users: `<svg ${common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    activity: `<svg ${common}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
    euro: `<svg ${common}><path d="M4 10h10"/><path d="M4 14h9"/><path d="M19 5a7.7 7.7 0 0 0-5.2-2C8.4 3 4 7 4 12s4.4 9 9.8 9a7.7 7.7 0 0 0 5.2-2"/></svg>`,
    clock: `<svg ${common}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    shield: `<svg ${common}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.48 17.01 5 19 5a1 1 0 0 1 1 1z"/></svg>`,
    spark: `<svg ${common}><path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 21l-1.9-7.8L4 11l6.1-2.2Z"/></svg>`,
    eye: `<svg ${common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    copy: `<svg ${common}><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
    download: `<svg ${common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>`,
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    chevronLeft: `<svg ${common}><path d="m15 18-6-6 6-6"/></svg>`,
    chevronRight: `<svg ${common}><path d="m9 18 6-6-6-6"/></svg>`,
    arrowRight: `<svg ${common}><path d="M5 12h14"/><path d="m13 5 7 7-7 7"/></svg>`,
  };

  return icons[name] || icons.activity;
}

/* =========================================================
   UI pequeña
========================================================= */

function spinner(label = "Cargando") {
  return `
    <span class="home-inline-loading" role="status" aria-label="${attr(label)}">
      <span class="home-inline-spinner" aria-hidden="true"></span>
      <span class="home-inline-loading-text">${escapeHtml(label)}</span>
    </span>
  `;
}

function emptyState({
  title = "No hay datos para mostrar",
  text = "Cuando haya información disponible aparecerá aquí.",
  action = "",
  actionLabel = "Continuar",
  iconName = "spark",
} = {}) {
  return `
    <div class="home-empty">
      <div class="home-empty-icon" aria-hidden="true">${icon(iconName)}</div>
      <h3 class="home-empty-title">${escapeHtml(title)}</h3>
      <p class="home-empty-text">${escapeHtml(text)}</p>
      ${action ? `
        <button type="button" class="home-btn home-btn--primary" data-home-action="${attr(action)}" data-action="${attr(action)}">
          ${escapeHtml(actionLabel)}
        </button>
      ` : ""}
    </div>
  `;
}

function loadingCards(count = 4) {
  return `
    <div class="home-cards-loading" aria-hidden="true">
      ${Array.from({ length: Math.max(1, safeNumber(count, 4)) })
        .map(() => `
          <div class="home-card-skeleton">
            <div class="home-skeleton home-skeleton--icon"></div>
            <div class="home-skeleton home-skeleton--xs"></div>
            <div class="home-skeleton home-skeleton--xl"></div>
            <div class="home-skeleton home-skeleton--md"></div>
          </div>
        `)
        .join("")}
    </div>
  `;
}

function loadingRows(count = DEFAULT_PAGE_SIZE) {
  return `
    <div class="home-table-loading" aria-hidden="true">
      ${Array.from({ length: Math.max(1, safeNumber(count, DEFAULT_PAGE_SIZE)) })
        .map(() => `
          <div class="home-table-loading-row">
            <div class="home-skeleton home-skeleton--avatar"></div>
            <div class="home-table-loading-copy">
              <div class="home-skeleton home-skeleton--xs"></div>
              <div class="home-skeleton home-skeleton--lg"></div>
              <div class="home-skeleton home-skeleton--md"></div>
            </div>
            <div class="home-skeleton home-skeleton--pill"></div>
            <div class="home-skeleton home-skeleton--date"></div>
            <div class="home-skeleton home-skeleton--btn"></div>
          </div>
        `)
        .join("")}
    </div>
  `;
}

function errorBanner(message = "") {
  const text = redact(safeText(message, ""));

  if (!text) return "";

  return `
    <div class="home-error-banner" role="status" data-home-error-banner="true">
      <span class="home-error-banner-icon" aria-hidden="true">${icon("alert")}</span>
      <span class="home-error-banner-text">${escapeHtml(text)}</span>
      <button type="button" class="home-error-banner-action" data-home-action="${ACTIONS.RETRY}" data-action="${ACTIONS.RETRY}">
        Reintentar
      </button>
    </div>
  `;
}

function avatar({
  name = "Usuario",
  image = "",
  kind = "user",
  seed = "",
  initials = "",
  className = "home-avatar",
} = {}) {
  const label = visualLabel(name, "Usuario");
  const fallbackInitials = safeText(first(initials, getInitials(label)), "U")
    .slice(0, 3)
    .toUpperCase();
  const src = safeImageSrc(image);
  const avatarSeedBase = safeText(first(seed, label, fallbackInitials, kind), label);
  const avatarSeed = getInitials(avatarSeedBase);
  const tone = getAvatarTone(`${kind}|${avatarSeedBase}|${label}`);
  const toneIndex = Math.max(1, AVATAR_TONES.indexOf(tone) + 1);
  const fallbackClass = `${safeText(className, "home-avatar")}--fallback`;

  return `
    <div
      class="${joinClasses(className, src ? "has-image" : fallbackClass, src ? "" : "is-fallback", `home-avatar-tone-${tone}`)}"
      aria-label="${attr(label)}"
      data-avatar-root="true"
      data-avatar-kind="${attr(kind)}"
      data-avatar-seed="${attr(avatarSeed)}"
      data-avatar-initials="${attr(fallbackInitials)}"
      data-avatar-tone="${attr(tone)}"
      data-avatar-color-index="${attr(String(toneIndex))}"
      data-avatar-state="${src ? "image" : "fallback"}"
      data-fallback="${src ? "false" : "true"}"
    >
      <span class="${attr(className)}-fallback" aria-hidden="true">${escapeHtml(fallbackInitials)}</span>
      ${src ? `
        <img
          class="${attr(className)}-img"
          src="${attr(src)}"
          alt="${attr(label)}"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          draggable="false"
        >
      ` : ""}
    </div>
  `;
}

/* =========================================================
   Estados visuales
========================================================= */

function ticketStatusLabel(item = {}) {
  const key = safeText(first(item.statusKey, getTicketStatusKey(getTicketStatus(item))), "pending");

  const labels = {
    pending: "Pendiente",
    open: "Abierta",
    progress: "En curso",
    in_progress: "En curso",
    resolved: "Resuelta",
    closed: "Cerrada",
    cancelled: "Cancelada",
    canceled: "Cancelada",
  };

  return safeText(first(item.statusLabel, labels[key], getTicketStatusLabel(item)), "Pendiente");
}

function statusChip(item = {}) {
  const key = safeText(first(item.statusKey, getTicketStatusKey(item)), "pending");
  const label = ticketStatusLabel(item);

  return `
    <span class="home-chip home-chip--${attr(key)}" data-status-key="${attr(key)}">
      <span class="home-chip-dot" aria-hidden="true"></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function priorityBadge(item = {}) {
  const key = safeText(first(item.priorityKey, getTicketPriorityKey(item)), "medium");

  const labels = {
    low: "Baja",
    medium: "Media",
    normal: "Normal",
    high: "Alta",
    urgent: "Urgente",
    critical: "Crítica",
  };

  const label = safeText(first(item.priorityLabel, labels[key]), "Media");

  return `
    <span class="home-mini-badge home-mini-badge--${attr(key)}" data-priority-key="${attr(key)}">
      ${icon(key === "critical" || key === "urgent" ? "alert" : "activity")}
      ${escapeHtml(label)}
    </span>
  `;
}

/* =========================================================
   Cabecera / métricas
========================================================= */

function heroMetrics(stats = {}) {
  const items = [
    ["Abiertas", stats.activeTickets ?? stats.openTickets ?? 0, "open"],
    ["Cerradas", stats.closedTickets ?? 0, "closed"],
  ];

  return `
    <div class="home-hero-minimetrics home-hero-minimetrics--compact" aria-label="Métricas rápidas">
      ${items
        .map(([label, value, key]) => `
          <span class="home-minimetric home-minimetric--${attr(key)}">
            <strong>${escapeHtml(String(value ?? 0))}</strong>
            <span>${escapeHtml(label)}</span>
          </span>
        `)
        .join("")}
    </div>
  `;
}

function statCard(card = {}, index = 0) {
  const value = safeText(card.value, "0");
  const label = safeText(card.label, "Métrica");
  const iconName = safeText(card.iconName, "activity");
  const modifier = normalizeKey(card.modifier || iconName || `stat-${index + 1}`);
  const route = resolveStatRoute(card);

  return `
    <button
      type="button"
      class="home-stat-card home-stat-card--clickable home-stat-card--${attr(modifier)}"
      data-home-action="${ACTIONS.NAVIGATE}"
      data-action="${ACTIONS.NAVIGATE}"
      data-route="${attr(route)}"
      data-href="${attr(route)}"
      data-home-stat-card="true"
      data-stat-index="${attr(index + 1)}"
      data-stat-modifier="${attr(modifier)}"
      data-payload="${jsonAttr({ stat: modifier, route })}"
      aria-label="Abrir ${attr(label)}"
    >
      <span class="home-stat-topline">
        <span class="home-stat-icon" aria-hidden="true">${icon(iconName)}</span>
        ${card.badge ? `<span class="home-stat-badge">${escapeHtml(card.badge)}</span>` : ""}
      </span>
      <span class="home-stat-label">${escapeHtml(label)}</span>
      <strong class="home-stat-value" data-stat-value="${attr(value)}">${escapeHtml(value)}</strong>
      ${card.text ? `<span class="home-stat-text">${escapeHtml(card.text)}</span>` : ""}
    </button>
  `;
}

export function renderHomeHeader(input = {}) {
  const vm = asViewModel(input);
  const state = vm.state;
  const stats = vm.stats;
  const meta = vm.meta;
  const admin = vm.admin;
  const displayName = vm.displayName;
  const user = vm.user;

  const title = admin ? "Centro de control Onion" : `Hola, ${displayName}`;
  const subtitle = admin
    ? "Vista clara de usuarios, clientes, incidencias y facturas."
    : "Tus incidencias, facturas y actividad principal de un vistazo.";

  return `
    <section
      class="home-hero home-hero--frameless home-hero--${admin ? "admin" : "user"}"
      data-home-section="hero"
      data-home-role="${admin ? "admin" : "user"}"
    >
      <div class="home-hero-top">
        <div class="home-hero-main">
          ${avatar({
            name: displayName,
            image: vm.avatarUrl,
            kind: "user",
            seed: safeText(first(user.userId, user.id, user.username, displayName), displayName),
            initials: vm.initials,
            className: "home-user-avatar",
          })}

          <div class="home-hero-copy">
            <h1 class="home-page-title">${escapeHtml(title)}</h1>
            <p class="home-page-subtitle">${escapeHtml(subtitle)}</p>
          </div>
        </div>

        <div class="home-hero-actions">
          <button
            type="button"
            id="home-refresh-btn"
            class="${joinClasses("home-btn", state.refreshing ? "is-loading" : "")}"
            data-home-action="${ACTIONS.REFRESH}"
            data-action="${ACTIONS.REFRESH}"
            aria-label="Actualizar Home"
            ${boolAttr(state.refreshing || state.loading, 'disabled aria-busy="true"')}
          >
            ${state.refreshing ? spinner("Actualizando...") : `${icon("refresh")}<span class="home-btn-text">Actualizar</span>`}
          </button>

          <button
            type="button"
            id="home-export-btn"
            class="home-btn home-btn--ghost"
            data-home-action="${ACTIONS.EXPORT_CSV}"
            data-action="${ACTIONS.EXPORT_CSV}"
            data-export-mode="tickets"
            data-export-filename="home-incidencias.csv"
            ${boolAttr(state.loading || state.refreshing, "disabled")}
          >
            ${icon("download")}
            <span class="home-btn-text">Exportar</span>
          </button>

          <button
            type="button"
            id="home-create-ticket-btn"
            class="${joinClasses("home-btn home-btn--primary", state.creating ? "is-loading" : "")}"
            data-home-action="${ACTIONS.CREATE_INCIDENCIA}"
            data-action="${ACTIONS.CREATE_INCIDENCIA}"
            data-route="${attr(ROUTES.INCIDENCIAS)}"
            data-href="${attr(ROUTES.INCIDENCIAS)}"
            ${boolAttr(state.creating || state.loading || state.refreshing, 'disabled aria-busy="true"')}
          >
            ${state.creating ? spinner("Abriendo...") : `${icon("plus")}<span class="home-btn-text">Crear incidencia</span>`}
          </button>
        </div>
      </div>

      <div class="home-hero-meta">
        <span class="home-meta-pill">${icon("ticket")}${escapeHtml(`${formatNumber(stats.totalTickets)} incidencias`)}</span>
        <span class="home-meta-pill">${icon("invoice")}${escapeHtml(`${formatNumber(stats.pendingInvoices)} facturas pendientes`)}</span>
        <span class="home-meta-pill">
          ${icon("refresh")}
          ${meta.lastUpdatedAt ? escapeHtml(`Actualizado · ${formatRelativeDate(meta.lastUpdatedAt)}`) : "Sin sincronización reciente"}
        </span>
      </div>

      ${heroMetrics(stats)}

      <div class="home-stats" data-home-section="stats">
        ${getVisibleHomeStatCards(vm).map(statCard).join("")}
      </div>
    </section>
  `;
}

/* =========================================================
   Widgets y accesos rápidos anulados
========================================================= */

export function renderHomeWidgets() {
  return "";
}

export function renderHomeQuickActions() {
  return "";
}

/* =========================================================
   Actividad / facturación / entidades
========================================================= */

function routeForActivityType(typeKey = "") {
  if (typeKey === "invoice" || typeKey === "factura") return ROUTES.FACTURAS;
  if (typeKey === "client" || typeKey === "cliente" || typeKey === "customer") return ROUTES.CLIENTES;
  if (typeKey === "user" || typeKey === "usuario" || typeKey === "member") return ROUTES.USUARIOS;

  return ROUTES.INCIDENCIAS;
}

function activityIcon(typeKey = "") {
  if (typeKey === "invoice" || typeKey === "factura") return "invoice";
  if (typeKey === "client" || typeKey === "cliente" || typeKey === "customer") return "client";
  if (typeKey === "user" || typeKey === "usuario" || typeKey === "member") return "users";
  if (typeKey === "ticket" || typeKey === "incidencia") return "ticket";

  return "activity";
}

function activityItem(vm = {}, item = {}) {
  const type = getActivityType(item);
  const typeKey = normalizeKey(type);
  const admin = vm.admin;

  if (
    !admin &&
    ["client", "cliente", "customer", "user", "usuario", "member"].includes(typeKey)
  ) {
    return "";
  }

  if (isBlockedHomeIdentity(type, getActivityTitle(item), getActivityText(item))) {
    return "";
  }

  const route = safeRoute(first(item.route, item.href, item.link, item.to, ""), "") || routeForActivityType(typeKey);

  if (!route) return "";
  if (!admin && isAdminOnlyRoute(route)) return "";

  const entityId = safeText(first(item.entityId, item.id, item.ticketId, item.incidenciaId, item.facturaId, item.invoiceId), "");

  return `
    <button
      type="button"
      class="home-activity-item home-activity-item--${attr(type || "activity")}"
      data-home-action="${ACTIONS.NAVIGATE}"
      data-action="${ACTIONS.NAVIGATE}"
      data-route="${attr(route)}"
      data-href="${attr(route)}"
      data-entity-id="${attr(entityId)}"
      data-payload="${jsonAttr({ type, route, entityId })}"
    >
      <span class="home-activity-icon" aria-hidden="true">${icon(activityIcon(typeKey))}</span>
      <span class="home-activity-copy">
        <strong class="home-activity-title">${escapeHtml(getActivityTitle(item))}</strong>
        <span class="home-activity-text">${escapeHtml(getActivityText(item))}</span>
      </span>
      <span class="home-activity-time" title="${attr(formatDateTime(getActivityDate(item)))}">
        ${escapeHtml(formatRelativeDate(getActivityDate(item)))}
      </span>
    </button>
  `;
}

export function renderHomeActivity(input = {}) {
  const vm = asViewModel(input);
  const state = vm.state;
  const activity = filterActivityForRole(vm, vm.activity).slice(0, LIMITS.activity);
  const items = activity.map((item) => activityItem(vm, item)).filter(Boolean);

  return `
    <section class="home-panel home-panel--activity" data-home-section="activity">
      <div class="home-panel-head">
        <div class="home-panel-copy">
          <span class="home-panel-kicker">Actividad</span>
          <h2 class="home-panel-title">Últimas acciones</h2>
          <p class="home-panel-subtitle">
            ${state.loading && !items.length ? "Cargando actividad..." : escapeHtml(`${formatNumber(items.length)} últimas acciones`)}
          </p>
        </div>

        <button
          type="button"
          class="home-panel-link"
          data-home-action="${ACTIONS.NAVIGATE}"
          data-action="${ACTIONS.NAVIGATE}"
          data-route="${attr(ROUTES.INCIDENCIAS)}"
          data-href="${attr(ROUTES.INCIDENCIAS)}"
        >
          Ver incidencias ${icon("arrowRight")}
        </button>
      </div>

      ${state.loading && !items.length
        ? loadingCards(3)
        : items.length
          ? `<div class="home-activity-list">${items.join("")}</div>`
          : emptyState({
              title: "Sin actividad reciente",
              text: "Cuando haya movimientos aparecerán aquí.",
              iconName: "clock",
            })
      }
    </section>
  `;
}

function invoiceItem(item = {}) {
  const id = safeText(first(item.fullId, item.displayId, item.invoiceId, item.facturaId, getInvoiceId(item)), "FAC-SIN-ID");
  const rawInvoice = safeObject(item);
  const currency = getInvoiceCurrency(rawInvoice);
  const status = safeText(first(rawInvoice.statusKey, getInvoiceStatusKey(rawInvoice)), "pending");
  const statusLabel = safeText(first(rawInvoice.statusLabel, getInvoiceStatusLabel(rawInvoice)), "Pendiente");
  const paid = Boolean(first(rawInvoice.isPaid, rawInvoice.paid, isInvoicePaid(rawInvoice)));
  const amount = paid
    ? safeNumber(first(rawInvoice.paidAmount, rawInvoice.amount, getInvoicePaidAmount(rawInvoice)), 0)
    : 0;

  return `
    <button
      type="button"
      class="home-invoice-mini home-invoice-mini--${attr(status)}"
      data-home-action="${ACTIONS.NAVIGATE}"
      data-action="${ACTIONS.NAVIGATE}"
      data-route="${attr(ROUTES.FACTURAS)}"
      data-href="${attr(ROUTES.FACTURAS)}"
      data-invoice-id="${attr(id)}"
      data-factura-id="${attr(id)}"
      data-entity-id="${attr(id)}"
      data-payload="${jsonAttr({ invoiceId: id, facturaId: id })}"
    >
      <span class="home-invoice-mini-icon" aria-hidden="true">${icon("invoice")}</span>
      <span class="home-invoice-mini-copy">
        <strong>${escapeHtml(id || "Factura")}</strong>
        ${paid ? `<span>${escapeHtml(formatMoney(amount, currency || DEFAULT_CURRENCY))}</span>` : ""}
      </span>
      <span class="home-invoice-mini-status">${escapeHtml(statusLabel)}</span>
    </button>
  `;
}

export function renderHomeInvoicePreview(input = {}) {
  const vm = asViewModel(input);
  const state = vm.state;
  const invoices = safeArray(first(vm.invoiceRows, vm.recentInvoices, vm.invoices, [])).slice(0, LIMITS.invoices);
  const total = safeNumber(first(vm.collections.invoicesRemoteCount, vm.stats.totalInvoices, vm.invoices.length), vm.invoices.length);

  return `
    <section class="home-panel home-panel--invoice-preview" data-home-section="invoice-preview">
      <div class="home-panel-head">
        <div class="home-panel-copy">
          <span class="home-panel-kicker">Facturación</span>
          <h2 class="home-panel-title">${vm.admin ? "Últimas facturas" : "Mis últimas facturas"}</h2>
          <p class="home-panel-subtitle">
            ${state.loading && !invoices.length ? "Cargando facturas..." : escapeHtml(`Mostrando ${formatNumber(invoices.length)} de ${formatNumber(total)} facturas`)}
          </p>
        </div>

        <button
          type="button"
          class="home-panel-link"
          data-home-action="${ACTIONS.NAVIGATE}"
          data-action="${ACTIONS.NAVIGATE}"
          data-route="${attr(ROUTES.FACTURAS)}"
          data-href="${attr(ROUTES.FACTURAS)}"
        >
          Ver facturas ${icon("arrowRight")}
        </button>
      </div>

      ${state.loading && !invoices.length
        ? loadingCards(3)
        : invoices.length
          ? `<div class="home-invoice-mini-list">${invoices.map(invoiceItem).join("")}</div>`
          : emptyState({
              title: "Sin facturas visibles",
              text: "Cuando haya facturas disponibles aparecerán aquí.",
              iconName: "invoice",
            })
      }
    </section>
  `;
}

function entityName(item = {}, type = "client") {
  return visualLabel(
    first(item.displayName, item.fullName, item.name, item.nombre, item.razonSocial, item.company, item.username),
    type === "user" ? "Usuario" : "Cliente"
  );
}

function entityMeta(item = {}, type = "client") {
  if (type === "user") return safeText(first(item.role, item.rol, "Usuario"), "Usuario");

  return safeText(first(item.clientId, item.clienteId, item.customerId, item.id, "Cliente"), "Cliente");
}

function entityItem(item = {}, type = "client") {
  const isUser = type === "user";
  const label = entityName(item, type);
  const route = isUser ? ROUTES.USUARIOS : ROUTES.CLIENTES;
  const entityId = safeText(first(item.userId, item.usuarioId, item.clienteId, item.clientId, item.customerId, item.id), "");

  if (!route) return "";

  return `
    <button
      type="button"
      class="home-entity-mini home-entity-mini--${isUser ? "user" : "client"}"
      data-home-action="${ACTIONS.NAVIGATE}"
      data-action="${ACTIONS.NAVIGATE}"
      data-route="${attr(route)}"
      data-href="${attr(route)}"
      data-entity-id="${attr(entityId)}"
      data-payload="${jsonAttr({ type, entityId })}"
    >
      <span class="home-entity-mini-avatar" data-avatar-seed="${attr(getInitials(label))}" aria-hidden="true">
        ${escapeHtml(getInitials(label))}
      </span>
      <span class="home-entity-mini-copy">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(entityMeta(item, type))}</span>
      </span>
      <span class="home-entity-mini-arrow" aria-hidden="true">${icon("chevronRight")}</span>
    </button>
  `;
}

export function renderHomeEntitiesPreview(input = {}) {
  const vm = asViewModel(input);
  const state = vm.state;

  if (!vm.admin) return "";

  const clients = safeArray(vm.clients).slice(0, LIMITS.entities);
  const users = safeArray(vm.users).slice(0, LIMITS.entities);

  const clientItems = clients.map((item) => entityItem(item, "client")).filter(Boolean);
  const userItems = users.map((item) => entityItem(item, "user")).filter(Boolean);

  return `
    <section class="home-panel home-panel--entities" data-home-section="entities">
      <div class="home-panel-head">
        <div class="home-panel-copy">
          <span class="home-panel-kicker">Directorio</span>
          <h2 class="home-panel-title">Clientes y usuarios</h2>
          <p class="home-panel-subtitle">
            ${state.loading && !clientItems.length && !userItems.length
              ? "Cargando directorio..."
              : escapeHtml(`${formatNumber(vm.collections.clientsRemoteCount || clients.length)} clientes · ${formatNumber(vm.collections.usersRemoteCount || users.length)} usuarios`)
            }
          </p>
        </div>

        <button
          type="button"
          class="home-panel-link"
          data-home-action="${ACTIONS.NAVIGATE}"
          data-action="${ACTIONS.NAVIGATE}"
          data-route="${attr(ROUTES.CLIENTES)}"
          data-href="${attr(ROUTES.CLIENTES)}"
        >
          Ver clientes ${icon("arrowRight")}
        </button>
      </div>

      ${state.loading && !clientItems.length && !userItems.length
        ? loadingCards(3)
        : `
          <div class="home-entities-list">
            ${clientItems.length
              ? clientItems.join("")
              : emptyState({
                  title: "Sin clientes visibles",
                  text: "Cuando haya clientes disponibles aparecerán aquí.",
                  iconName: "client",
                })
            }
            ${userItems.length ? `
              <div class="home-entities-separator" aria-hidden="true"></div>
              ${userItems.join("")}
            ` : ""}
          </div>
        `
      }
    </section>
  `;
}

/* =========================================================
   Tabla de incidencias
========================================================= */

function statusSummary(vm = {}) {
  const tickets = safeArray(vm.tickets);
  const fallbackCounts = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0]));

  for (const ticket of tickets) {
    const key = getTicketStatusKey(ticket);

    if (Object.prototype.hasOwnProperty.call(fallbackCounts, key)) {
      fallbackCounts[key] = safeNumber(fallbackCounts[key], 0) + 1;
    }
  }

  const stats = safeObject(vm.stats);

  const counts = {
    pending: safeNumber(first(stats.pendingTickets, fallbackCounts.pending), fallbackCounts.pending),
    open: safeNumber(first(stats.openTickets, fallbackCounts.open), fallbackCounts.open),
    progress: safeNumber(first(stats.progressTickets, fallbackCounts.progress), fallbackCounts.progress),
    resolved: safeNumber(first(stats.resolvedTickets, fallbackCounts.resolved), fallbackCounts.resolved),
    closed: safeNumber(first(stats.closedTickets, fallbackCounts.closed), fallbackCounts.closed),
  };

  const labels = {
    pending: "Pendientes",
    open: "Abiertas",
    progress: "En curso",
    resolved: "Resueltas",
    closed: "Cerradas",
  };

  return `
    <div class="home-status-summary" aria-label="Resumen de estados">
      ${STATUS_ORDER.map((status) => `
        <span class="home-status-summary-item home-status-summary-item--${attr(status)}">
          <span class="home-status-summary-dot" aria-hidden="true"></span>
          <strong>${escapeHtml(formatNumber(counts[status] || 0))}</strong>
          <span>${escapeHtml(labels[status] || "Estado")}</span>
        </span>
      `).join("")}
    </div>
  `;
}

function getRowTicketId(item = {}) {
  return safeText(
    first(
      item.fullId,
      item.displayId,
      item.ticketId,
      item.incidenciaId,
      item.id,
      getTicketId(item)
    ),
    "INC-SIN-ID"
  );
}

function getRowTechnician(item = {}) {
  const assignedToObject = safeObject(typeof item.assignedTo === "object" ? item.assignedTo : {});
  const technician = safeObject(
    first(
      item.technician,
      item.tecnico,
      item.assignedTechnician,
      item.assignedUser,
      assignedToObject,
      {}
    )
  );

  const name = visualLabel(
    first(
      technician.displayName,
      technician.fullName,
      technician.name,
      technician.nombre,
      technician.username,
      technician.userName,

      item.technicianName,
      item.tecnicoNombre,
      item.assignedToName,
      item.assignedName,
      typeof item.assignedTo === "string" ? item.assignedTo : "",
      ""
    ),
    "Sin asignar"
  );

  const avatarUrl = safeImageSrc(
    first(
      technician.avatarUrl,
      technician.avatarURL,
      technician.avatar_url,
      technician.avatar,

      technician.photoUrl,
      technician.photoURL,
      technician.photo_url,
      technician.photo,

      technician.pictureUrl,
      technician.pictureURL,
      technician.picture_url,
      technician.picture,

      technician.imageUrl,
      technician.imageURL,
      technician.image_url,
      technician.image,

      technician.fotoUrl,
      technician.fotoURL,
      technician.foto_url,
      technician.foto,

      technician.imagenUrl,
      technician.imagenURL,
      technician.imagen_url,
      technician.imagen,

      technician.profile?.avatarUrl,
      technician.profile?.avatar,
      technician.profile?.photoUrl,
      technician.profile?.photoURL,
      technician.profile?.picture,
      technician.profile?.pictureUrl,
      technician.profile?.image,
      technician.profile?.imageUrl,

      technician.media?.avatarUrl,
      technician.media?.avatar,
      technician.media?.photoUrl,
      technician.media?.photoURL,
      technician.media?.picture,
      technician.media?.pictureUrl,
      technician.media?.image,
      technician.media?.imageUrl,

      item.technicianAvatarUrl,
      item.technicianAvatar,
      item.tecnicoAvatarUrl,
      item.tecnicoAvatar,
      item.assignedToAvatarUrl,
      item.assignedAvatarUrl,
      assignedToObject.avatarUrl,
      assignedToObject.avatar,
      assignedToObject.photoUrl,
      assignedToObject.photoURL,
      assignedToObject.picture,
      assignedToObject.image,
      ""
    )
  );

  const initials = safeText(
    first(
      technician.initials,
      technician.iniciales,
      item.technicianInitials,
      item.tecnicoInitials,
      assignedToObject.initials,
      getInitials(name)
    ),
    getInitials(name)
  )
    .slice(0, 3)
    .toUpperCase();

  return {
    ...technician,
    name,
    displayName: name,
    avatarUrl,
    avatar: avatarUrl,
    initials,
  };
}

function technicianInline(item = {}) {
  const technician = getRowTechnician(item);

  return `
    <div
      class="home-ticket-technician home-ticket-technician--inline"
      data-ticket-technician="true"
      data-has-technician-avatar="${technician.avatarUrl ? "true" : "false"}"
      aria-label="Técnico asignado: ${attr(technician.name)}"
    >
      ${avatar({
        name: technician.name,
        image: technician.avatarUrl,
        kind: "technician",
        seed: safeText(first(technician.userId, technician.id, technician.username, technician.name), technician.name),
        initials: technician.initials,
        className: "home-technician-avatar",
      })}

      <span class="home-ticket-technician-copy">
        <span class="home-ticket-technician-label">Técnico</span>
        <strong>${escapeHtml(technician.name)}</strong>
      </span>
    </div>
  `;
}

function ticketRow(item = {}, state = {}) {
  const ticketId = getRowTicketId(item);
  const subject = safeText(first(item.subject, item.title, getTicketSubject(item)), "Incidencia sin asunto");
  const description = safeText(first(item.description, item.preview, getTicketDescription(item)), "Sin descripción.");
  const category = safeText(first(item.category, item.categoria, getTicketCategory(item)), "Soporte");
  const statusKey = safeText(first(item.statusKey, getTicketStatusKey(item)), "pending");
  const priorityKey = safeText(first(item.priorityKey, getTicketPriorityKey(item)), "medium");
  const createdAt = first(item.createdAt, getTicketCreatedAt(item));
  const updatedAt = first(item.lastActivityAt, item.updatedAt, getTicketUpdatedAt(item));
  const createdLabel = safeText(first(item.createdAtLabel, formatDateTime(createdAt)), "—");
  const updatedLabel = safeText(first(item.lastActivityLabel, item.updatedAtLabel, formatLastUpdate(updatedAt)), "Sin fecha");
  const linkedInvoiceCount = safeNumber(first(item.linkedInvoiceCount, item.invoicesCount, item.facturasCount, 0), 0);
  const isOpening = isSameIdentity(state.openingTicketId, ticketId);
  const isSelected = isSameIdentity(state.selectedTicketId, ticketId);

  return `
    <tr
      class="${joinClasses(
        "home-ticket-row",
        `home-ticket-row--${statusKey}`,
        `home-ticket-row--priority-${priorityKey}`,
        isOpening ? "is-opening" : "",
        isSelected ? "is-selected" : ""
      )}"
      data-ticket-row="true"
      data-ticket-id="${attr(ticketId)}"
      data-incidencia-id="${attr(ticketId)}"
      data-entity-id="${attr(ticketId)}"
      data-status-key="${attr(statusKey)}"
      data-priority-key="${attr(priorityKey)}"
    >
      <td class="home-ticket-cell home-ticket-cell--main">
        <div class="home-ticket-main home-ticket-main--with-technician">
          ${technicianInline(item)}

          <div class="home-ticket-copy">
            <div class="home-ticket-line">
              <button
                type="button"
                class="home-ticket-id"
                data-home-action="${ACTIONS.COPY_ID}"
                data-action="${ACTIONS.COPY_ID}"
                data-widget-id="${attr(ticketId)}"
                data-widget-key="${attr(ticketId)}"
                data-entity-id="${attr(ticketId)}"
                aria-label="Copiar ID de incidencia ${attr(ticketId)}"
              >
                ${escapeHtml(ticketId)}
              </button>

              <span class="home-mini-badge home-mini-badge--category">
                ${escapeHtml(category)}
              </span>
            </div>

            <button
              type="button"
              class="home-ticket-subject"
              data-home-action="${ACTIONS.OPEN_TICKET_DETAIL}"
              data-action="${ACTIONS.OPEN_TICKET_DETAIL}"
              data-ticket-id="${attr(ticketId)}"
              data-incidencia-id="${attr(ticketId)}"
              data-entity-id="${attr(ticketId)}"
              data-payload="${jsonAttr({ ticketId, incidenciaId: ticketId })}"
            >
              ${escapeHtml(subject)}
            </button>

            <div class="home-ticket-description">
              ${escapeHtml(description)}
            </div>

            <div class="home-ticket-badges">
              ${priorityBadge(item)}
              ${linkedInvoiceCount > 0
                ? `<span class="home-mini-badge home-mini-badge--invoice">${icon("invoice")}${escapeHtml(`${linkedInvoiceCount} fact.`)}</span>`
                : ""
              }
            </div>
          </div>
        </div>
      </td>

      <td class="home-ticket-cell home-ticket-cell--status">
        ${statusChip(item)}
      </td>

      <td class="home-ticket-cell home-ticket-cell--date">
        <span class="home-date-inline" title="${attr(formatDateTime(createdAt))}">
          ${escapeHtml(createdLabel)}
        </span>
      </td>

      <td class="home-ticket-cell home-ticket-cell--date">
        <span class="home-date-inline" title="${attr(formatDateTime(updatedAt))}">
          ${escapeHtml(updatedLabel)}
        </span>
      </td>

      <td class="home-ticket-cell home-ticket-cell--actions">
        <button
          type="button"
          class="${joinClasses("home-detail-btn", isOpening ? "is-loading" : "")}"
          data-home-action="${ACTIONS.OPEN_TICKET_DETAIL}"
          data-action="${ACTIONS.OPEN_TICKET_DETAIL}"
          data-ticket-id="${attr(ticketId)}"
          data-incidencia-id="${attr(ticketId)}"
          data-entity-id="${attr(ticketId)}"
          data-payload="${jsonAttr({ ticketId, incidenciaId: ticketId })}"
          ${boolAttr(isOpening, 'disabled aria-busy="true"')}
        >
          ${isOpening ? spinner("Cargando...") : `${icon("eye")}<span class="home-btn-text">Detalle</span>`}
        </button>
      </td>
    </tr>
  `;
}

function getTicketRowsForHome(vm = {}) {
  const rows = safeArray(first(vm.ticketRows, vm.pageItems, vm.recentTickets, []));

  if (rows.length) return rows.slice(0, LIMITS.tickets);

  return safeArray(vm.tickets).slice(0, LIMITS.tickets);
}

export function renderHomeTicketsTable(input = {}) {
  const vm = asViewModel(input);
  const state = vm.state;
  const tickets = safeArray(vm.tickets);
  const rows = getTicketRowsForHome(vm);
  const totalCount = safeNumber(first(vm.collections.ticketsRemoteCount, vm.stats.totalTickets, tickets.length), tickets.length);
  const initialLoading = state.loading && !rows.length;

  return `
    <section class="home-tickets" data-home-section="tickets">
      <div class="home-panel-head">
        <div class="home-panel-copy">
          <span class="home-panel-kicker">Incidencias</span>
          <h2 class="home-panel-title">${vm.admin ? "Últimas incidencias" : "Tus últimas incidencias"}</h2>
          <p class="home-panel-subtitle">
            ${initialLoading
              ? "Cargando incidencias..."
              : escapeHtml(
                  totalCount
                    ? `Mostrando ${formatNumber(rows.length)} últimas de ${formatNumber(totalCount)}`
                    : "Sin incidencias visibles"
                )
            }
          </p>
        </div>

        <div class="home-panel-head-actions">
          ${statusSummary(vm)}

          <button
            type="button"
            class="home-panel-link"
            data-home-action="${ACTIONS.NAVIGATE}"
            data-action="${ACTIONS.NAVIGATE}"
            data-route="${attr(ROUTES.INCIDENCIAS)}"
            data-href="${attr(ROUTES.INCIDENCIAS)}"
          >
            Ver todas ${icon("arrowRight")}
          </button>
        </div>
      </div>

      ${initialLoading
        ? loadingRows(Math.max(3, DEFAULT_PAGE_SIZE))
        : `
          <div class="${joinClasses("home-table-wrap", state.refreshing ? "is-refreshing" : "")}">
            ${rows.length
              ? `
                <div class="home-table-shell">
                  <table class="home-table" role="table" aria-label="Últimas incidencias del Home">
                    <thead>
                      <tr>
                        <th scope="col">Incidencia</th>
                        <th scope="col">Estado</th>
                        <th scope="col">Creación</th>
                        <th scope="col">Última novedad</th>
                        <th scope="col">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${rows.map((item) => ticketRow(item, state)).join("")}
                    </tbody>
                  </table>
                </div>
              `
              : emptyState({
                  title: state.error ? "No se pudieron cargar las incidencias" : "No hay incidencias para mostrar",
                  text: state.error ? "Puedes reintentar la carga desde el botón de actualizar." : "Cuando haya solicitudes registradas aparecerán aquí.",
                  action: state.error ? ACTIONS.RETRY : "",
                  actionLabel: "Reintentar",
                  iconName: state.error ? "alert" : "ticket",
                })
            }
          </div>
        `
      }
    </section>
  `;
}

/* =========================================================
   Modal incidencia
========================================================= */

function modalInvoiceItem(item = {}) {
  const id = safeText(first(item.fullId, item.displayId, item.invoiceId, item.facturaId, getInvoiceId(item)), "FAC-SIN-ID");
  const statusKey = safeText(first(item.statusKey, getInvoiceStatusKey(item)), "pending");
  const statusLabel = safeText(first(item.statusLabel, getInvoiceStatusLabel(item)), "Pendiente");
  const currency = getInvoiceCurrency(item);
  const paid = Boolean(first(item.isPaid, item.paid, isInvoicePaid(item)));
  const amount = paid
    ? safeNumber(first(item.paidAmount, item.amount, getInvoicePaidAmount(item)), 0)
    : 0;

  return `
    <li class="home-modal-invoice home-modal-invoice--${attr(statusKey)}">
      <span class="home-modal-invoice-icon" aria-hidden="true">${icon("invoice")}</span>
      <span class="home-modal-invoice-copy">
        <strong>${escapeHtml(id)}</strong>
        <span>${escapeHtml(statusLabel)}</span>
      </span>
      ${paid ? `<span class="home-modal-invoice-amount">${escapeHtml(formatMoney(amount, currency))}</span>` : ""}
    </li>
  `;
}

function renderTicketModal(input = {}) {
  const vm = asViewModel(input);
  const modal = safeObject(vm.ticketModal);

  if (!modal.open || !modal.ticket) return "";

  const ticketId = safeText(first(modal.fullId, modal.displayId, modal.ticketId, modal.incidenciaId, modal.id), "INC-SIN-ID");
  const title = safeText(first(modal.title, modal.subject), "Incidencia sin asunto");
  const description = safeText(first(modal.description, modal.preview), "Sin descripción.");
  const technician = getRowTechnician(modal);
  const technicianName = technician.name;
  const technicianAvatar = technician.avatarUrl;
  const invoices = safeArray(first(modal.invoiceRows, modal.invoices, modal.facturas, [])).slice(0, LIMITS.invoices);
  const statusKey = safeText(first(modal.statusKey, getTicketStatusKey(modal.ticket)), "pending");
  const statusLabel = safeText(first(modal.statusLabel, getTicketStatusLabel(modal.ticket)), "Pendiente");
  const priorityKey = safeText(first(modal.priorityKey, getTicketPriorityKey(modal.ticket)), "medium");
  const priorityLabel = safeText(first(modal.priorityLabel), "Media");
  const createdAt = first(modal.createdAt, getTicketCreatedAt(modal.ticket));
  const updatedAt = first(modal.lastActivityAt, modal.updatedAt, getTicketUpdatedAt(modal.ticket));

  return `
    <section
      class="home-modal"
      data-home-modal="ticket-detail"
      data-ticket-id="${attr(ticketId)}"
      data-incidencia-id="${attr(ticketId)}"
      role="dialog"
      aria-modal="true"
      aria-labelledby="home-ticket-modal-title"
    >
      <button
        type="button"
        class="home-modal-backdrop"
        data-home-action="${ACTIONS.CLOSE_TICKET_DETAIL}"
        data-action="${ACTIONS.CLOSE_TICKET_DETAIL}"
        aria-label="Cerrar detalle de incidencia"
      ></button>

      <div class="home-modal-dialog" role="document">
        <div class="home-modal-head">
          <div class="home-modal-title-block">
            <span class="home-panel-kicker">Detalle de incidencia</span>
            <h2 id="home-ticket-modal-title" class="home-modal-title">${escapeHtml(ticketId)}</h2>
            <p class="home-modal-subtitle">${escapeHtml(title)}</p>
          </div>

          <button
            type="button"
            class="home-modal-close"
            data-home-action="${ACTIONS.CLOSE_TICKET_DETAIL}"
            data-action="${ACTIONS.CLOSE_TICKET_DETAIL}"
            aria-label="Cerrar"
          >
            ${icon("close")}
          </button>
        </div>

        <div class="home-modal-body">
          <div class="home-modal-main">
            <div class="home-modal-section">
              <h3>Resumen</h3>
              <p>${escapeHtml(description)}</p>

              <div class="home-modal-tags">
                <span class="home-chip home-chip--${attr(statusKey)}">
                  <span class="home-chip-dot" aria-hidden="true"></span>
                  ${escapeHtml(statusLabel)}
                </span>
                <span class="home-mini-badge home-mini-badge--${attr(priorityKey)}">
                  ${icon(priorityKey === "critical" || priorityKey === "urgent" ? "alert" : "activity")}
                  ${escapeHtml(priorityLabel)}
                </span>
                <span class="home-mini-badge home-mini-badge--category">
                  ${escapeHtml(safeText(first(modal.category, modal.categoria, getTicketCategory(modal.ticket)), "Soporte"))}
                </span>
              </div>
            </div>

            <div class="home-modal-section">
              <h3>Facturas vinculadas</h3>
              ${invoices.length
                ? `<ul class="home-modal-invoice-list">${invoices.map(modalInvoiceItem).join("")}</ul>`
                : `<p class="home-modal-muted">Esta incidencia no tiene facturas vinculadas.</p>`
              }
            </div>
          </div>

          <aside class="home-modal-side">
            <div class="home-modal-technician">
              ${avatar({
                name: technicianName,
                image: technicianAvatar,
                kind: "technician",
                seed: safeText(first(technician.userId, technician.id, technician.username, technicianName), technicianName),
                initials: technician.initials,
                className: "home-modal-technician-avatar",
              })}
              <div>
                <span class="home-panel-kicker">Técnico asignado</span>
                <strong>${escapeHtml(technicianName)}</strong>
                <p>${technicianAvatar ? "Avatar real del usuario." : "Mostrando iniciales."}</p>
              </div>
            </div>

            <dl class="home-modal-facts">
              <div>
                <dt>Creación</dt>
                <dd>${escapeHtml(formatDateTime(createdAt))}</dd>
              </div>
              <div>
                <dt>Última novedad</dt>
                <dd>${escapeHtml(formatLastUpdate(updatedAt))}</dd>
              </div>
              <div>
                <dt>Facturas</dt>
                <dd>${escapeHtml(formatNumber(invoices.length))}</dd>
              </div>
              <div>
                <dt>Adjuntos</dt>
                <dd>${escapeHtml(formatNumber(safeNumber(first(modal.attachmentsCount, 0), 0)))}</dd>
              </div>
            </dl>
          </aside>
        </div>

        <div class="home-modal-footer">
          <button
            type="button"
            class="home-btn"
            data-home-action="${ACTIONS.CLOSE_TICKET_DETAIL}"
            data-action="${ACTIONS.CLOSE_TICKET_DETAIL}"
          >
            Cerrar
          </button>

          <button
            type="button"
            class="home-btn home-btn--primary"
            data-home-action="${ACTIONS.NAVIGATE}"
            data-action="${ACTIONS.NAVIGATE}"
            data-route="${attr(ROUTES.INCIDENCIAS)}"
            data-href="${attr(ROUTES.INCIDENCIAS)}"
            data-ticket-id="${attr(ticketId)}"
            data-incidencia-id="${attr(ticketId)}"
          >
            Abrir incidencias ${icon("arrowRight")}
          </button>
        </div>
      </div>
    </section>
  `;
}

/* =========================================================
   Estados fallback
========================================================= */

export function renderHomeLoadingState() {
  return `
    <section class="home-view-root home-view-root--loading" data-home-scope="true">
      <section class="home-hero home-hero--frameless home-hero--loading">
        ${loadingCards(4)}
      </section>
      <section class="home-panel">
        ${loadingRows(DEFAULT_PAGE_SIZE)}
      </section>
    </section>
  `;
}

export function renderHomeErrorState(message = "No se pudo cargar el Home.") {
  return `
    <section class="home-view-root home-view-root--error" data-home-scope="true">
      <section class="home-panel">
        ${emptyState({
          title: "No se pudo renderizar el Home",
          text: redact(safeText(message, "Error desconocido al cargar la vista.")),
          action: ACTIONS.RETRY,
          actionLabel: "Reintentar",
          iconName: "alert",
        })}
      </section>
    </section>
  `;
}

/* =========================================================
   Template completo
========================================================= */

export function renderHomeTemplate(input = {}) {
  const vm = buildTemplateViewModel(input);
  const state = vm.state;
  const meta = vm.meta;
  const admin = vm.admin;

  return `
    <section
      class="${joinClasses(
        "home-view-root",
        admin ? "home-view-root--admin" : "home-view-root--user",
        state.loading ? "is-loading" : "",
        state.refreshing ? "is-refreshing" : "",
        state.creating ? "is-creating" : "",
        state.error ? "has-error" : "",
        meta.partial ? "is-partial" : ""
      )}"
      data-home-scope="true"
      data-home-data-scope="home-dashboard"
      data-home-template-version="${attr(TEMPLATE_VERSION)}"
      data-home-role="${admin ? "admin" : "user"}"
      data-home-admin="${admin ? "true" : "false"}"
      data-request-id="${attr(meta.requestId)}"
      data-last-updated-at="${attr(meta.lastUpdatedAt || "")}"
      data-partial="${meta.partial ? "true" : "false"}"
      data-errors-count="${attr(String(meta.errorsCount || 0))}"
      aria-busy="${state.loading || state.refreshing ? "true" : "false"}"
    >
      ${errorBanner(state.error)}
      ${renderHomeHeader(vm)}

      <section class="home-grid" data-home-section="main-grid">
        ${renderHomeActivity(vm)}
        ${renderHomeInvoicePreview(vm)}
        ${renderHomeEntitiesPreview(vm)}
      </section>

      ${renderHomeTicketsTable(vm)}
      ${renderTicketModal(vm)}
    </section>
  `;
}

export const renderHomeViewTemplate = renderHomeTemplate;
export const renderHomeDashboardTemplate = renderHomeTemplate;
export const renderHome = renderHomeTemplate;
export const renderDashboard = renderHomeTemplate;

export default renderHomeTemplate;
