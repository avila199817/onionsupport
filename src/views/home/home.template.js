/* =========================================================
   Onion Support - Home Template
   Archivo: /src/views/home/home.template.js

   Final:
   - Home simple, visual y directo.
   - Sin card grande envolvente.
   - Sin accesos rápidos.
   - Sin widgets duplicados.
   - Sin Urgentes, Salud, Última actividad ni Adjuntos.
   - Con Facturas totales + importe total.
   - Avatar visible con tono dinámico.
   - Textos visibles en español.
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
  formatRelativeDate,
  formatLastUpdate,

  getInitials,

  getDashboard,
  getCollections,
  computeHomeStats,
  getStatCards,

  getUser,
  getRole,
  isAdminRole,
  getDisplayName,
  getAvatarUrl,

  getTicketId,
  getTicketSubject,
  getTicketDescription,
  getTicketOwnerName,
  getTicketAvatarUrl,
  getTicketStatus,
  getTicketStatusKey,
  getTicketPriorityKey,
  getTicketCategory,
  getTicketAssignedTo,
  getTicketCreatedAt,
  getTicketUpdatedAt,

  getInvoiceId,
  getInvoiceAmount,
  getInvoiceCurrency,
  getInvoiceStatusKey,

  getActivity,
  getActivityTitle,
  getActivityText,
  getActivityDate,
  getActivityType,

  getPagination,
} from "./home.selectors.js";

export const TEMPLATE_VERSION = "home.template.final.10";

const ACTIONS = Object.freeze({
  REFRESH: "refresh",
  RETRY: "retry",
  CREATE_INCIDENCIA: "create_incidencia",
  NAVIGATE: "navigate_home",
  COPY_ID: "copy_widget_id",
  PREV_PAGE: "prev_page",
  NEXT_PAGE: "next_page",
  EXPORT_CSV: "export_csv",
});

const LIMITS = Object.freeze({
  activity: 6,
  invoices: 4,
  entities: 5,
});

const STATUS_ORDER = Object.freeze([
  "pending",
  "open",
  "progress",
  "resolved",
  "closed",
]);

const RAW_KEYS = new Set(["raw", "data", "payload", "response"]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|jwt|bearer|refresh|access_token|accessToken|id_token|idToken|otp|totp|mfa|2fa|backupCode|backup_code|sessionId|session_id/i;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

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
  USUARIOS: safeStaticRoute(CORE_ROUTES?.usuarios, "/usuarios"),
  SERVIDOR: safeStaticRoute(CORE_ROUTES?.servidor, "/servidor"),
});

function getRoutePath(value = "") {
  return safeRoute(value, "").split("?")[0].split("#")[0] || "";
}

function isAdminOnlyRoute(route = "") {
  const path = getRoutePath(route);
  const clientes = getRoutePath(ROUTES.CLIENTES);
  const usuarios = getRoutePath(ROUTES.USUARIOS);
  const servidor = getRoutePath(ROUTES.SERVIDOR);

  if (!path) return false;

  try {
    if (configIsAdminRoute(path) === true) return true;
  } catch {
    // Fallback local.
  }

  return (
    Boolean(clientes && (path === clientes || path.startsWith(`${clientes}/`))) ||
    Boolean(usuarios && (path === usuarios || path.startsWith(`${usuarios}/`))) ||
    Boolean(servidor && (path === servidor || path.startsWith(`${servidor}/`)))
  );
}

function safeImageSrc(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";

  if (raw.startsWith("/") && !raw.startsWith("//") && !hasSensitiveQuery(raw)) {
    return raw.replace(/\/{2,}/g, "/");
  }

  if (/^https:\/\//i.test(raw) && !hasSensitiveQuery(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
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

function getInvoicesTotalAmount(input = {}) {
  const data = safeObject(input);
  const dashboard = getDashboard(data);
  const collections = getCollections(data);
  const invoices = safeArray(collections.invoices);

  const candidate = firstDefined(
    collections.invoicesTotalAmount,
    collections.totalInvoicesAmount,
    collections.totalInvoiceAmount,
    collections.totalAmount,
    collections.facturasTotalAmount,
    collections.facturacionTotal,
    collections.billingTotal,
    dashboard.invoicesTotalAmount,
    dashboard.totalInvoicesAmount,
    dashboard.totalInvoiceAmount,
    dashboard.facturasTotalAmount,
    dashboard.facturacionTotal,
    dashboard.billingTotal,
    data.invoicesTotalAmount,
    data.totalInvoicesAmount,
    data.totalInvoiceAmount,
    data.facturasTotalAmount,
    data.facturacionTotal,
    data.billingTotal
  );

  const candidateAmount = parseAmount(candidate);

  if (Number.isFinite(candidateAmount)) return candidateAmount;

  return invoices.reduce((total, invoice) => total + safeNumber(getInvoiceAmount(invoice), 0), 0);
}

function getInvoicesTotalCount(input = {}) {
  const data = safeObject(input);
  const dashboard = getDashboard(data);
  const collections = getCollections(data);
  const invoices = safeArray(collections.invoices);

  return safeNumber(
    firstDefined(
      collections.invoicesRemoteCount,
      collections.invoicesTotalCount,
      collections.totalInvoicesCount,
      collections.facturasTotalCount,
      dashboard.invoicesRemoteCount,
      dashboard.invoicesTotalCount,
      dashboard.totalInvoicesCount,
      dashboard.facturasTotalCount,
      data.invoicesRemoteCount,
      data.invoicesTotalCount,
      data.totalInvoicesCount,
      data.facturasTotalCount
    ),
    invoices.length
  );
}

function getInvoicesTotalCurrency(input = {}) {
  const data = safeObject(input);
  const dashboard = getDashboard(data);
  const collections = getCollections(data);
  const invoices = safeArray(collections.invoices);
  const firstInvoice = safeObject(invoices[0]);

  return safeText(
    firstDefined(
      collections.invoicesCurrency,
      collections.currency,
      dashboard.invoicesCurrency,
      dashboard.currency,
      data.invoicesCurrency,
      data.currency,
      getInvoiceCurrency(firstInvoice)
    ),
    DEFAULT_CURRENCY
  );
}

function buildInvoicesTotalCard(input = {}) {
  const amount = getInvoicesTotalAmount(input);
  const currency = getInvoicesTotalCurrency(input);
  const count = getInvoicesTotalCount(input);

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

function translateCard(card = {}, input = {}) {
  const admin = isAdmin(input);
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

  if (identity.includes("ticket")) {
    return {
      ...card,
      label: admin ? "Incidencias" : "Mis incidencias",
      text: card.text || (admin ? "Incidencias visibles en el panel." : "Tus solicitudes visibles."),
    };
  }

  if (identity.includes("invoice")) {
    return {
      ...card,
      label: card.label && !String(card.label).toLowerCase().includes("invoice") ? card.label : "Facturas pendientes",
      text: card.text || "Facturación visible.",
    };
  }

  if (identity.includes("client") || identity.includes("customer")) {
    return {
      ...card,
      label: "Clientes",
      text: card.text || "Clientes visibles.",
    };
  }

  if (identity.includes("user") || identity.includes("member")) {
    return {
      ...card,
      label: "Usuarios",
      text: card.text || "Usuarios visibles.",
    };
  }

  return card;
}

function getVisibleHomeStatCards(input = {}) {
  const cards = getStatCards(input)
    .map((card) => translateCard(card, input))
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
    ))
    .filter((card) => !isInvoiceTotalsCard(card));

  return [
    ...cards,
    buildInvoicesTotalCard(input),
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
    identity.includes("servidor") ||
    identity.includes("server") ||
    identity.includes("infra")
  ) {
    return ROUTES.SERVIDOR;
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

/* =========================================================
   Estado / rol / meta
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
    selectedTicketId: safeText(state.selectedTicketId, ""),
    navigatingAction: redact(safeText(state.navigatingAction, "")),
  };
}

function getTemplateMeta(input = {}) {
  const data = safeObject(input);
  const state = getState(data);
  const dashboard = getDashboard(data);

  const lastUpdatedAt = first(
    data.lastUpdatedAt,
    data.lastSyncAt,
    state.lastUpdatedAt,
    state.lastSyncAt,
    dashboard.updatedAt,
    dashboard.generatedAt,
    dashboard.lastSyncAt,
    dashboard.meta?.updatedAt
  );

  return {
    requestId: safeText(first(data.requestId, state.requestId, dashboard.requestId, dashboard.meta?.requestId), ""),
    lastUpdatedAt,
    partial: Boolean(first(dashboard.partial, data.partial, false)),
    errorsCount: safeArray(first(dashboard.errors, data.errors, [])).length,
  };
}

function isAdmin(input = {}) {
  return isAdminRole(getRole(input));
}

function getSafeDisplayName(input = {}) {
  return visualLabel(getDisplayName(input), "Usuario");
}

function filterActivityForRole(input = {}, rows = []) {
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

  if (isAdmin(input)) return activity;

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
  className = "home-avatar",
} = {}) {
  const label = visualLabel(name, "Usuario");
  const initials = getInitials(label);
  const src = safeImageSrc(image);
  const avatarSeedBase = safeText(first(seed, label, initials, kind), label);
  const avatarSeed = getInitials(avatarSeedBase);
  const tone = getAvatarTone(`${kind}|${avatarSeedBase}|${label}`);
  const toneIndex = Math.max(1, AVATAR_TONES.indexOf(tone) + 1);
  const fallbackClass = `${safeText(className, "home-avatar")}--fallback`;

  return `
    <div
      class="${joinClasses(className, src ? "" : fallbackClass, `home-avatar-tone-${tone}`)}"
      aria-label="${attr(label)}"
      data-avatar-root="true"
      data-avatar-kind="${attr(kind)}"
      data-avatar-seed="${attr(avatarSeed)}"
      data-avatar-initials="${attr(initials)}"
      data-avatar-tone="${attr(tone)}"
      data-avatar-color-index="${attr(String(toneIndex))}"
      ${boolAttr(!src, 'data-fallback="true"')}
    >
      <span class="${attr(className)}-fallback" aria-hidden="true">${escapeHtml(initials)}</span>
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
  const key = getTicketStatusKey(getTicketStatus(item));

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

  return labels[key] || "Estado";
}

function statusChip(item = {}) {
  const key = getTicketStatusKey(getTicketStatus(item));

  return `
    <span class="home-chip home-chip--${attr(key)}" data-status-key="${attr(key)}">
      <span class="home-chip-dot" aria-hidden="true"></span>
      ${escapeHtml(ticketStatusLabel(item))}
    </span>
  `;
}

function priorityBadge(item = {}) {
  const key = getTicketPriorityKey(item);

  const labels = {
    low: "Baja",
    medium: "Media",
    normal: "Normal",
    high: "Alta",
    urgent: "Urgente",
    critical: "Crítica",
  };

  const label = labels[key] || "Prioridad";

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
    ["Abiertas", stats.openTickets, "open"],
    ["Cerradas", stats.closedTickets, "closed"],
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
  const data = safeObject(input);
  const state = getLoadingState(data);
  const stats = computeHomeStats(data);
  const meta = getTemplateMeta(data);
  const admin = isAdmin(data);
  const displayName = getSafeDisplayName(data);
  const user = getUser(data);

  const title = admin ? "Centro de control Onion" : `Hola, ${displayName}`;
  const subtitle = admin
    ? "Vista clara de incidencias, facturación, clientes y usuarios."
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
            image: getAvatarUrl(data),
            kind: "user",
            seed: safeText(first(user.userId, user.id, user.username, displayName), displayName),
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
        ${getVisibleHomeStatCards(data).map(statCard).join("")}
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
  if (typeKey === "server" || typeKey === "servidor") return ROUTES.SERVIDOR;

  return ROUTES.INCIDENCIAS;
}

function activityIcon(typeKey = "") {
  if (typeKey === "invoice" || typeKey === "factura") return "invoice";
  if (typeKey === "client" || typeKey === "cliente" || typeKey === "customer") return "client";
  if (typeKey === "user" || typeKey === "usuario" || typeKey === "member") return "users";
  if (typeKey === "ticket" || typeKey === "incidencia") return "ticket";

  return "activity";
}

function activityItem(input = {}, item = {}) {
  const type = getActivityType(item);
  const typeKey = normalizeKey(type);
  const admin = isAdmin(input);

  if (
    !admin &&
    ["client", "cliente", "customer", "user", "usuario", "member", "server", "servidor"].includes(typeKey)
  ) {
    return "";
  }

  const route = safeRoute(first(item.route, item.href, item.link, item.to, ""), "") || routeForActivityType(typeKey);

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
  const data = safeObject(input);
  const state = getLoadingState(data);
  const activity = filterActivityForRole(data, getActivity(data)).slice(0, LIMITS.activity);
  const items = activity.map((item) => activityItem(data, item)).filter(Boolean);

  return `
    <section class="home-panel home-panel--activity" data-home-section="activity">
      <div class="home-panel-head">
        <div class="home-panel-copy">
          <span class="home-panel-kicker">Actividad</span>
          <h2 class="home-panel-title">Actividad reciente</h2>
          <p class="home-panel-subtitle">
            ${state.loading && !items.length ? "Cargando actividad..." : escapeHtml(`${formatNumber(items.length)} movimientos recientes`)}
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

function invoiceStatusLabel(status = "") {
  const key = normalizeKey(status);

  const labels = {
    paid: "Pagada",
    pending: "Pendiente",
    overdue: "Vencida",
    draft: "Borrador",
    cancelled: "Cancelada",
    canceled: "Cancelada",
  };

  return labels[key] || "Estado";
}

function invoiceItem(item = {}) {
  const id = getInvoiceId(item);
  const amount = getInvoiceAmount(item);
  const currency = getInvoiceCurrency(item);
  const status = getInvoiceStatusKey(item);

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
        <span>${escapeHtml(formatMoney(amount, currency || DEFAULT_CURRENCY))}</span>
      </span>
      <span class="home-invoice-mini-status">${escapeHtml(invoiceStatusLabel(status))}</span>
    </button>
  `;
}

export function renderHomeInvoicePreview(input = {}) {
  const data = safeObject(input);
  const state = getLoadingState(data);
  const collections = getCollections(data);
  const invoices = safeArray(collections.invoices).slice(0, LIMITS.invoices);
  const total = safeNumber(first(collections.invoicesRemoteCount, invoices.length), invoices.length);

  return `
    <section class="home-panel home-panel--invoice-preview" data-home-section="invoice-preview">
      <div class="home-panel-head">
        <div class="home-panel-copy">
          <span class="home-panel-kicker">Facturación</span>
          <h2 class="home-panel-title">${isAdmin(data) ? "Facturación rápida" : "Mis facturas"}</h2>
          <p class="home-panel-subtitle">
            ${state.loading && !invoices.length ? "Cargando facturas..." : escapeHtml(`${formatNumber(total)} facturas detectadas`)}
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
  const data = safeObject(input);
  const state = getLoadingState(data);
  const collections = getCollections(data);

  if (!isAdmin(data)) return "";

  const clients = safeArray(collections.clients).slice(0, LIMITS.entities);
  const users = safeArray(collections.users).slice(0, LIMITS.entities);

  return `
    <section class="home-panel home-panel--entities" data-home-section="entities">
      <div class="home-panel-head">
        <div class="home-panel-copy">
          <span class="home-panel-kicker">Directorio</span>
          <h2 class="home-panel-title">Clientes y usuarios</h2>
          <p class="home-panel-subtitle">
            ${state.loading && !clients.length && !users.length
              ? "Cargando directorio..."
              : escapeHtml(`${formatNumber(collections.clientsRemoteCount || clients.length)} clientes · ${formatNumber(collections.usersRemoteCount || users.length)} usuarios`)
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

      ${state.loading && !clients.length && !users.length
        ? loadingCards(3)
        : `
          <div class="home-entities-list">
            ${clients.length
              ? clients.map((item) => entityItem(item, "client")).join("")
              : emptyState({
                  title: "Sin clientes visibles",
                  text: "Cuando haya clientes disponibles aparecerán aquí.",
                  iconName: "client",
                })
            }
            ${users.length ? `
              <div class="home-entities-separator" aria-hidden="true"></div>
              ${users.map((item) => entityItem(item, "user")).join("")}
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

function statusSummary(input = {}) {
  const tickets = safeArray(getCollections(input).tickets);
  const counts = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0]));

  for (const ticket of tickets) {
    const key = getTicketStatusKey(getTicketStatus(ticket));

    if (Object.prototype.hasOwnProperty.call(counts, key)) {
      counts[key] = safeNumber(counts[key], 0) + 1;
    }
  }

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
          <strong>${escapeHtml(String(counts[status] || 0))}</strong>
          <span>${escapeHtml(labels[status] || "Estado")}</span>
        </span>
      `).join("")}
    </div>
  `;
}

function ticketRow(item = {}, state = {}) {
  const ticketId = getTicketId(item);
  const subject = getTicketSubject(item);
  const description = getTicketDescription(item);
  const statusKey = getTicketStatusKey(getTicketStatus(item));
  const priorityKey = getTicketPriorityKey(item);
  const createdAt = getTicketCreatedAt(item);
  const updatedAt = getTicketUpdatedAt(item);
  const ownerName = visualLabel(getTicketOwnerName(item), "Usuario");
  const ownerMeta = safeText(first(getTicketAssignedTo(item), getTicketCategory(item)), "Sin asignación");
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
        <div class="home-ticket-main">
          ${avatar({
            name: ownerName,
            image: getTicketAvatarUrl(item),
            kind: "ticket",
            seed: `${ticketId}|${ownerName}`,
            className: "home-ticket-avatar",
          })}

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
              <span class="home-mini-badge home-mini-badge--category">${escapeHtml(getTicketCategory(item))}</span>
            </div>

            <button
              type="button"
              class="home-ticket-subject"
              data-home-action="${ACTIONS.NAVIGATE}"
              data-action="${ACTIONS.NAVIGATE}"
              data-ticket-id="${attr(ticketId)}"
              data-incidencia-id="${attr(ticketId)}"
              data-entity-id="${attr(ticketId)}"
              data-route="${attr(ROUTES.INCIDENCIAS)}"
              data-href="${attr(ROUTES.INCIDENCIAS)}"
              data-payload="${jsonAttr({ ticketId, incidenciaId: ticketId })}"
            >
              ${escapeHtml(subject)}
            </button>

            <div class="home-ticket-description">${escapeHtml(description)}</div>
            <div class="home-ticket-badges">
              ${priorityBadge(item)}
              <span class="home-mini-badge home-mini-badge--agent">
                ${icon("users")}
                ${escapeHtml(getTicketAssignedTo(item))}
              </span>
            </div>
          </div>
        </div>
      </td>

      <td class="home-ticket-cell home-ticket-cell--owner">
        <span class="home-ticket-owner">
          <strong>${escapeHtml(ownerName)}</strong>
          <span>${escapeHtml(ownerMeta)}</span>
        </span>
      </td>

      <td class="home-ticket-cell home-ticket-cell--status">${statusChip(item)}</td>

      <td class="home-ticket-cell home-ticket-cell--date">
        <span class="home-date-inline" title="${attr(formatDateTime(createdAt))}">
          ${escapeHtml(formatDateTime(createdAt))}
        </span>
      </td>

      <td class="home-ticket-cell home-ticket-cell--date">
        <span class="home-date-inline" title="${attr(formatDateTime(updatedAt))}">
          ${escapeHtml(formatLastUpdate(updatedAt))}
        </span>
      </td>

      <td class="home-ticket-cell home-ticket-cell--actions">
        <button
          type="button"
          class="${joinClasses("home-detail-btn", isOpening ? "is-loading" : "")}"
          data-home-action="${ACTIONS.NAVIGATE}"
          data-action="${ACTIONS.NAVIGATE}"
          data-ticket-id="${attr(ticketId)}"
          data-incidencia-id="${attr(ticketId)}"
          data-entity-id="${attr(ticketId)}"
          data-route="${attr(ROUTES.INCIDENCIAS)}"
          data-href="${attr(ROUTES.INCIDENCIAS)}"
          data-payload="${jsonAttr({ ticketId, incidenciaId: ticketId })}"
          ${boolAttr(isOpening, 'disabled aria-busy="true"')}
        >
          ${isOpening ? spinner("Cargando...") : `${icon("eye")}<span class="home-btn-text">Detalle</span>`}
        </button>
      </td>
    </tr>
  `;
}

function normalizePagination(pagination = {}, rows = []) {
  const source = safeObject(pagination);
  const pageItems = safeArray(first(source.pageItems, source.items, rows));

  const pageSize = Math.max(
    1,
    safeNumber(first(source.pageSize, source.limit, DEFAULT_PAGE_SIZE), DEFAULT_PAGE_SIZE)
  );

  const totalCount = Math.max(
    pageItems.length,
    safeNumber(first(source.totalCount, source.total, rows.length), rows.length)
  );

  const totalPages = Math.max(
    1,
    safeNumber(source.totalPages, Math.ceil(totalCount / pageSize) || 1)
  );

  const currentPage = Math.min(
    totalPages,
    Math.max(1, safeNumber(first(source.currentPage, source.page), 1))
  );

  const fallbackStart = totalCount && pageItems.length
    ? ((currentPage - 1) * pageSize) + 1
    : 0;

  const fallbackEnd = totalCount && pageItems.length
    ? Math.min(fallbackStart + pageItems.length - 1, totalCount)
    : 0;

  return {
    ...source,
    pageItems,
    currentPage,
    page: currentPage,
    pageSize,
    totalPages,
    totalCount,
    rangeStart: safeNumber(first(source.rangeStart, source.from), fallbackStart),
    rangeEnd: safeNumber(first(source.rangeEnd, source.to), fallbackEnd),
    hasPrev: Boolean(source.hasPrev || currentPage > 1),
    hasNext: Boolean(source.hasNext || currentPage < totalPages),
  };
}

export function renderHomeTicketsTable(input = {}) {
  const data = safeObject(input);
  const state = getLoadingState(data);
  const collections = getCollections(data);
  const tickets = safeArray(collections.tickets);

  const pagination = normalizePagination(
    getPagination(tickets, {
      ...data,
      remoteCount: collections.ticketsRemoteCount,
      totalCount: collections.ticketsRemoteCount,
    }),
    tickets
  );

  const initialLoading = state.loading && !pagination.pageItems.length;

  return `
    <section class="home-tickets" data-home-section="tickets">
      <div class="home-panel-head">
        <div class="home-panel-copy">
          <span class="home-panel-kicker">Incidencias</span>
          <h2 class="home-panel-title">${isAdmin(data) ? "Incidencias recientes" : "Tus últimas incidencias"}</h2>
          <p class="home-panel-subtitle">
            ${initialLoading
              ? "Cargando incidencias..."
              : escapeHtml(
                  pagination.totalCount
                    ? `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · página ${pagination.currentPage} de ${pagination.totalPages}`
                    : "Sin incidencias visibles"
                )
            }
          </p>
        </div>

        <div class="home-panel-head-actions">
          ${statusSummary(data)}

          <div class="home-pagination" aria-label="Paginación del Home">
            <button
              type="button"
              class="home-pagination-btn"
              data-home-action="${ACTIONS.PREV_PAGE}"
              data-action="${ACTIONS.PREV_PAGE}"
              data-page="${attr(String(Math.max(1, pagination.currentPage - 1)))}"
              ${boolAttr(!pagination.hasPrev || state.loading || state.refreshing, 'disabled aria-disabled="true"')}
            >
              ${icon("chevronLeft")}
              <span>Anterior</span>
            </button>

            <span class="home-pagination-status">${escapeHtml(`${pagination.currentPage}/${pagination.totalPages}`)}</span>

            <button
              type="button"
              class="home-pagination-btn home-pagination-btn--next"
              data-home-action="${ACTIONS.NEXT_PAGE}"
              data-action="${ACTIONS.NEXT_PAGE}"
              data-page="${attr(String(Math.min(pagination.totalPages, pagination.currentPage + 1)))}"
              ${boolAttr(!pagination.hasNext || state.loading || state.refreshing, 'disabled aria-disabled="true"')}
            >
              <span>Siguiente</span>
              ${icon("chevronRight")}
            </button>
          </div>
        </div>
      </div>

      ${initialLoading
        ? loadingRows(Math.max(3, pagination.pageSize || DEFAULT_PAGE_SIZE))
        : `
          <div class="${joinClasses("home-table-wrap", state.refreshing ? "is-refreshing" : "")}">
            ${pagination.pageItems.length
              ? `
                <div class="home-table-shell">
                  <table class="home-table" role="table" aria-label="Resumen de incidencias del Home">
                    <thead>
                      <tr>
                        <th scope="col">Incidencia</th>
                        <th scope="col">Usuario / cliente</th>
                        <th scope="col">Estado</th>
                        <th scope="col">Creación</th>
                        <th scope="col">Última novedad</th>
                        <th scope="col">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${pagination.pageItems.map((item) => ticketRow(item, state)).join("")}
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
  const data = safeObject(input);
  const state = getLoadingState(data);
  const meta = getTemplateMeta(data);
  const admin = isAdmin(data);
  const dashboard = getDashboard(data);

  const payload = {
    ...data,
    dashboard,
    state: {
      ...safeObject(data.state),
      ...state,
    },
  };

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
      ${renderHomeHeader(payload)}

      <section class="home-grid" data-home-section="main-grid">
        ${renderHomeActivity(payload)}
        ${renderHomeInvoicePreview(payload)}
        ${renderHomeEntitiesPreview(payload)}
      </section>

      ${renderHomeTicketsTable(payload)}
    </section>
  `;
}

export const renderHomeViewTemplate = renderHomeTemplate;
export const renderHomeDashboardTemplate = renderHomeTemplate;
export const renderHome = renderHomeTemplate;
export const renderDashboard = renderHomeTemplate;

export default renderHomeTemplate;
