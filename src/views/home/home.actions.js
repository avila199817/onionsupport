/* =========================================================
   Onion Support - Home Actions
   Archivo: /src/views/home/home.actions.js

   Responsabilidad:
   - Acciones operativas mínimas de Home.
   - Navegación SPA delegada en Router si existe.
   - Abrir/cerrar detalle de incidencia sin navegar.
   - Devolver statePatch para que bindings/homeView actualicen selectedTicketId.
   - Export CSV desde colecciones reales del store.
   - Copiar IDs.
   - Ejecutar acciones simples.
   - Leer dashboard/widget/ticket desde store si hace falta.
   - Rutas base desde core/config.js.
   - Admin routes reales desde core/config.js.
   - Toast sólo mediante AppCore.showToast si existe.
   - Sin fetch.
   - Sin API calls.
   - Sin storage.
   - Sin eventos globales.
   - Sin window bridges.
   - Sin route aliases legacy.
   - Sin Router.push/go legacy.
   - Sin AppCore.navigate.
   - Sin fallback manual de history.
   - Sin /home.
   - Sin /incidencias/nueva.
   - Sin rutas opcionales inventadas.
   - Sin Auth.
   - Sin CSS.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  ROUTES as CORE_ROUTES,
  isAdminRoute as configIsAdminRoute,
  isBlockedRoutePath as configIsBlockedRoutePath,
  normalizeRoutePath as configNormalizeRoutePath,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../../core/config.js";

import {
  getHomeDashboardStore,
  getHomeWidgetByIdStore,
  getHomeWidgetsStore,
  getHomeTicketsStore,
  getHomeInvoicesStore,
  getHomeUsersStore,
  getHomeClientsStore,
  getHomeActivityStore,
} from "./home.store.js";

import {
  normalizeHomeDashboard,
  normalizeHomeWidget,
  normalizeHomeTickets,
  normalizeHomeInvoices,
  normalizeHomeUsers,
  normalizeHomeClients,

  getHomeWidgetId,
  getHomeTicketId,
  getHomeInvoiceId,
  getHomeUserId,
  getHomeClientId,

  findHomeTicketById,
  resolveHomeTicketInvoices,
  resolveHomeTicketTechnician,
} from "./home.model.js";

export const HOME_ACTIONS_VERSION = "home.actions.v8.router-safe-store-aligned";

const SOURCE = "views.home.actions";

const CSV_FILENAME = "home-export.csv";
const CSV_MIME_TYPE = "text/csv;charset=utf-8;";

const HOME_ACTION_RESULT_TYPES = Object.freeze({
  STATE_PATCH: "home_state_patch",
  NAVIGATION: "home_navigation",
  EXPORT: "home_export",
  COPY: "home_copy",
  READ: "home_read",
});

const RAW_KEYS = new Set([
  "raw",
  "data",
  "payload",
  "payloadRaw",
  "response",
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

const SENSITIVE_QUERY_RE =
  /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i;

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/i;
const EMAIL_GLOBAL_RE = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/gi;
const JWT_RE =
  /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
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

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = String(value || "").trim().toLowerCase();

  if (role === "admin") return "admin";
  if (role === "user") return "user";

  return "";
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
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(JWT_RE, "***")
    .replace(EMAIL_GLOBAL_RE, "");
}

function isSensitiveKey(key = "") {
  return SENSITIVE_KEY_RE.test(String(key || ""));
}

function isRawKey(key = "") {
  return RAW_KEYS.has(String(key || ""));
}

function isCosmosMetaKey(key = "") {
  return COSMOS_META_KEYS.has(String(key || ""));
}

function isEmailLike(value = "") {
  const text = safeText(value, "");
  return Boolean(text && EMAIL_RE.test(text));
}

function hasSensitiveQuery(value = "") {
  return SENSITIVE_QUERY_RE.test(String(value || ""));
}

function safeCopyText(value = "") {
  const text = safeText(value, "");

  if (!text) return "";
  if (isEmailLike(text)) return "";
  if (hasSensitiveQuery(text)) return "";
  if (/Bearer\s+/i.test(text)) return "";
  if (SENSITIVE_KEY_RE.test(text) && text.length > 80) return "";

  return redact(text).slice(0, 240);
}

function sanitizePayloadValue(value, keyHint = "") {
  if (isRawKey(keyHint)) return undefined;
  if (isCosmosMetaKey(keyHint)) return undefined;
  if (isSensitiveKey(keyHint)) return undefined;

  if (typeof value === "string") {
    return redact(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizePayloadValue(item))
      .filter((item) => item !== undefined);
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (isRawKey(key)) continue;
      if (isCosmosMetaKey(key)) continue;
      if (isSensitiveKey(key)) continue;

      const clean = sanitizePayloadValue(item, key);

      if (clean !== undefined) {
        output[key] = clean;
      }
    }

    return output;
  }

  return value;
}

function sanitizePayload(value = {}) {
  return safeObject(sanitizePayloadValue(value), {});
}

function notify(message = "", type = "info", options = {}) {
  const text = redact(safeText(message, ""));

  if (!text) return false;

  try {
    if (isFunction(AppCore?.showToast)) {
      return AppCore.showToast(text, type, safeObject(options)) !== false;
    }
  } catch {
    return false;
  }

  return false;
}

function publicError(error = null) {
  if (!error) return null;

  return {
    name: safeText(error.name, "HomeActionError"),
    message: redact(
      safeText(
        first(
          error.response?.data?.message,
          error.data?.message,
          error.message,
          error.reason,
          "Error Home."
        ),
        "Error Home."
      )
    ),
    status:
      error.status ||
      error.statusCode ||
      error.response?.status ||
      error.data?.status ||
      0,
    code: safeText(
      first(
        error.code,
        error.data?.code,
        error.response?.data?.code,
        "HOME_ACTION_ERROR"
      ),
      "HOME_ACTION_ERROR"
    ),
  };
}

/* =========================================================
   ROUTES
========================================================= */

function routeInput(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (hasSensitiveQuery(raw)) return "";

  try {
    return configRoutePathFromUrlLike(raw) || "";
  } catch {
    if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || "/";
    if (raw.startsWith("#/")) return raw.slice(1) || "/";
    return raw;
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
  const input = routeInput(value);

  if (!input) return "";
  if (!input.startsWith("/")) return "";
  if (input.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) return "";
  if (/[\r\n\t\\]/.test(input)) return "";
  if (hasSensitiveQuery(input)) return "";

  const pathOnly = input.split("?")[0].split("#")[0] || "";

  try {
    return configNormalizeRoutePath(pathOnly) || "";
  } catch {
    let path = pathOnly.replace(/\\/g, "/").replace(/\/{2,}/g, "/");

    if (!path.startsWith("/")) {
      path = `/${path}`;
    }

    if (path.length > 1) {
      path = path.replace(/\/+$/g, "") || "/";
    }

    return path || "";
  }
}

function isBlockedRoute(value = "") {
  const path = routePathOnly(value);
  const lower = path.toLowerCase();

  if (!path) return true;

  /*
    Crear incidencia se delega a /incidencias.
    No existe /incidencias/nueva en esta fase.
  */
  if (
    lower === "/incidencias/nueva" ||
    lower.startsWith("/incidencias/nueva/")
  ) {
    return true;
  }

  try {
    return configIsBlockedRoutePath(path) === true;
  } catch {
    return Boolean(
      lower === "/home" ||
        lower === "/403" ||
        lower === "/404" ||
        lower === "/2fa" ||
        lower === "/mfa" ||
        lower === "/otp" ||
        lower.startsWith("/2fa/") ||
        lower.startsWith("/mfa/") ||
        lower.startsWith("/otp/")
    );
  }
}

function normalizeSpaRoute(route = "") {
  const input = routeInput(route);

  if (!input) return "";
  if (!input.startsWith("/")) return "";
  if (input.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) return "";
  if (/[\r\n\t\\]/.test(input)) return "";
  if (hasSensitiveQuery(input)) return "";

  const pathOnly = routePathOnly(input);

  if (!pathOnly) return "";
  if (isBlockedRoute(pathOnly)) return "";

  return `${pathOnly}${routeSuffix(input)}`;
}

function routeFromCore(name = "", fallback = "") {
  const configured = normalizeSpaRoute(CORE_ROUTES?.[name]);

  if (configured) return configured;

  return fallback ? normalizeSpaRoute(fallback) : "";
}

const ROUTES = Object.freeze({
  INCIDENCIAS: routeFromCore("incidencias", "/incidencias"),
  FACTURAS: routeFromCore("facturas", "/facturas"),
  CLIENTES: routeFromCore("clientes", "/clientes"),
  USUARIOS: routeFromCore("usuarios", ""),
  CUENTA: routeFromCore("cuenta", ""),
  AJUSTES: routeFromCore("ajustes", ""),
});

const ACTION_ROUTES = Object.freeze({
  go_incidencias: ROUTES.INCIDENCIAS,
  go_facturas: ROUTES.FACTURAS,
  go_clientes: ROUTES.CLIENTES,
  go_usuarios: ROUTES.USUARIOS,
  go_cuenta: ROUTES.CUENTA,
  go_ajustes: ROUTES.AJUSTES,
});

function routePath(route = "") {
  return normalizeSpaRoute(route).split("?")[0].split("#")[0] || "";
}

function isAdminOnlyRoute(route = "") {
  const path = routePath(route);
  const clientes = routePath(ROUTES.CLIENTES);
  const usuarios = routePath(ROUTES.USUARIOS);

  if (!path) return false;

  try {
    if (configIsAdminRoute(path) === true) return true;
  } catch {
    // fallback local
  }

  return (
    Boolean(clientes && (path === clientes || path.startsWith(`${clientes}/`))) ||
    Boolean(usuarios && (path === usuarios || path.startsWith(`${usuarios}/`)))
  );
}

function routeFromAction(action = "") {
  return ACTION_ROUTES[normalizeKey(action)] || "";
}

/* =========================================================
   ROUTER
========================================================= */

function navigationOk(result = null) {
  if (result === false) return false;
  if (isObject(result) && result.ok === false) return false;

  return true;
}

function getRouterCandidates() {
  const candidates = [];

  try {
    candidates.push(AppCore?.router);
    candidates.push(AppCore?.Router);
    candidates.push(AppCore?.modules?.get?.("router"));
    candidates.push(AppCore?.modules?.get?.("Router"));
  } catch {
    // noop
  }

  return candidates.filter(Boolean);
}

async function navigateSpa(route = "", options = {}) {
  const target = normalizeSpaRoute(route);

  if (!target) return false;
  if (!canUseRoute(target)) return false;

  const rawOptions = safeObject(options);
  const cleanOptions = sanitizePayload({
    ...rawOptions,
    payload: undefined,
  });

  const opts = {
    ...cleanOptions,
    source: SOURCE,
    payload: sanitizePayload(rawOptions.payload),
  };

  for (const router of getRouterCandidates()) {
    try {
      if (opts.replaceState === true && isFunction(router?.replace)) {
        return navigationOk(await router.replace(target, opts));
      }

      if (isFunction(router?.navigate)) {
        return navigationOk(await router.navigate(target, opts));
      }
    } catch {
      // probar siguiente router
    }
  }

  return false;
}

/* =========================================================
   STORE READ
========================================================= */

export function getHomeDashboardFromStoreAction() {
  try {
    const dashboard = getHomeDashboardStore?.();

    if (!isObject(dashboard) || !Object.keys(dashboard).length) {
      return null;
    }

    return normalizeHomeDashboard(sanitizePayload(dashboard));
  } catch {
    return null;
  }
}

function getStoredRole() {
  let dashboard = {};

  try {
    dashboard = safeObject(getHomeDashboardStore?.());
  } catch {
    dashboard = {};
  }

  const role = normalizeRole(
    first(
      dashboard.role,
      dashboard.rol,
      dashboard.roles,
      dashboard.meta?.role,
      dashboard.meta?.rol,
      dashboard.meta?.roles,
      ""
    )
  );

  if (role) return role;

  if (
    dashboard.admin === true ||
    dashboard.isAdmin === true ||
    dashboard.meta?.admin === true
  ) {
    return "admin";
  }

  try {
    const state = safeObject(AppCore?.state);
    return normalizeRole(
      first(
        state.role,
        state.rol,
        state.roles,
        state.user?.role,
        state.user?.rol,
        state.user?.roles,
        "user"
      )
    ) || "user";
  } catch {
    return "user";
  }
}

function canUseAdminActions() {
  return getStoredRole() === "admin";
}

function canUseRoute(route = "") {
  const target = normalizeSpaRoute(route);

  if (!target) return false;
  if (!isAdminOnlyRoute(target)) return true;

  return canUseAdminActions();
}

export async function getHomeDashboardAction({
  payload = null,
  silent = true,
} = {}) {
  try {
    if (payload) return normalizeHomeDashboard(sanitizePayload(payload));

    return getHomeDashboardFromStoreAction();
  } catch {
    if (!silent) notify("No se pudo resolver el dashboard de Home.", "error");
    return null;
  }
}

export async function refreshHomeDashboardAction(options = {}) {
  return getHomeDashboardAction(options);
}

/* =========================================================
   TICKET DETAIL
========================================================= */

function getTicketIdFromPayload(payload = {}) {
  const data = safeObject(payload);

  return safeCopyText(
    first(
      data.ticketId,
      data.incidenciaId,
      data.entityId,
      data.id,
      data.widgetId,
      data.widgetKey,
      data.code,
      data.numero,
      ""
    )
  );
}

function getHomeTicketsForDetail() {
  try {
    return safeArray(getHomeTicketsStore?.());
  } catch {
    return [];
  }
}

function getHomeInvoicesForDetail() {
  try {
    return normalizeHomeInvoices(safeArray(getHomeInvoicesStore?.()));
  } catch {
    return [];
  }
}

function getHomeUsersForDetail() {
  if (!canUseAdminActions()) return [];

  try {
    return normalizeHomeUsers(safeArray(getHomeUsersStore?.()));
  } catch {
    return [];
  }
}

function normalizeTicketDetail({
  ticket = null,
  ticketId = "",
  invoices = [],
  users = [],
  found = true,
} = {}) {
  const id = safeCopyText(ticketId || getHomeTicketId(ticket || {}));

  if (!id) return null;

  const normalizedTickets = ticket
    ? normalizeHomeTickets([ticket], {
        invoices,
        users,
      })
    : [];

  const normalizedTicket = normalizedTickets[0] || {
    id,
    ticketId: id,
    incidenciaId: id,
    subject: "Incidencia",
    title: "Incidencia",
  };

  let linkedInvoices = [];

  try {
    linkedInvoices = resolveHomeTicketInvoices(normalizedTicket, invoices);
  } catch {
    linkedInvoices = safeArray(first(normalizedTicket.invoices, normalizedTicket.facturas, []));
  }

  let technician = {};

  try {
    technician = resolveHomeTicketTechnician(normalizedTicket, users);
  } catch {
    technician = safeObject(first(normalizedTicket.technician, normalizedTicket.tecnico, {}));
  }

  const selectedTicketId = safeCopyText(
    first(
      getHomeTicketId(normalizedTicket),
      normalizedTicket.ticketId,
      normalizedTicket.incidenciaId,
      id
    )
  );

  return sanitizePayload({
    ok: true,
    type: HOME_ACTION_RESULT_TYPES.STATE_PATCH,
    action: "open_ticket_detail",
    source: SOURCE,

    found: Boolean(found && ticket),

    selectedTicketId,
    selectedIncidenciaId: selectedTicketId,
    ticketId: selectedTicketId,
    incidenciaId: selectedTicketId,

    statePatch: {
      selectedTicketId,
      selectedIncidenciaId: selectedTicketId,
      openingTicketId: "",
    },

    modal: {
      open: true,
      ticketId: selectedTicketId,
      incidenciaId: selectedTicketId,
    },

    ticket: normalizedTicket,
    incidencia: normalizedTicket,

    invoices: linkedInvoices,
    facturas: linkedInvoices,
    invoiceIds: linkedInvoices
      .map((invoice) => safeCopyText(first(invoice.invoiceId, invoice.facturaId, invoice.id, "")))
      .filter(Boolean),
    facturaIds: linkedInvoices
      .map((invoice) => safeCopyText(first(invoice.facturaId, invoice.invoiceId, invoice.id, "")))
      .filter(Boolean),

    technician,
    tecnico: technician,

    at: nowIso(),
  });
}

export function getHomeTicketDetailFromStoreAction({
  ticketId = "",
  incidenciaId = "",
  payload = null,
} = {}) {
  const data = sanitizePayload(payload || {});
  const id = getTicketIdFromPayload({
    ...data,
    ticketId,
    incidenciaId,
  });

  if (!id) return null;

  const invoices = getHomeInvoicesForDetail();
  const users = getHomeUsersForDetail();
  const rawTickets = getHomeTicketsForDetail();

  const tickets = normalizeHomeTickets(rawTickets, {
    invoices,
    users,
  });

  let ticket = null;

  try {
    ticket = findHomeTicketById(tickets, id);
  } catch {
    ticket = tickets.find((item) => normalizeKey(getHomeTicketId(item)) === normalizeKey(id)) || null;
  }

  if (!ticket && Object.keys(data).length) {
    const payloadTicketId = getTicketIdFromPayload(data);

    if (payloadTicketId && normalizeKey(payloadTicketId) === normalizeKey(id)) {
      ticket = data;
    }
  }

  return normalizeTicketDetail({
    ticket,
    ticketId: id,
    invoices,
    users,
    found: Boolean(ticket),
  });
}

export async function openHomeTicketDetailAction({
  ticketId = "",
  incidenciaId = "",
  entityId = "",
  payload = null,
  silent = false,
} = {}) {
  const data = sanitizePayload(payload || {});
  const id = getTicketIdFromPayload({
    ...data,
    ticketId,
    incidenciaId,
    entityId,
  });

  if (!id) {
    if (!silent) notify("No se pudo abrir la incidencia.", "error");
    return false;
  }

  const result = getHomeTicketDetailFromStoreAction({
    ticketId: id,
    incidenciaId: id,
    payload: data,
  });

  if (!result) {
    if (!silent) notify("No se encontró la incidencia.", "warning");

    return sanitizePayload({
      ok: false,
      type: HOME_ACTION_RESULT_TYPES.STATE_PATCH,
      action: "open_ticket_detail",
      source: SOURCE,
      found: false,
      ticketId: id,
      incidenciaId: id,
      statePatch: {
        selectedTicketId: "",
        selectedIncidenciaId: "",
        openingTicketId: "",
      },
      at: nowIso(),
    });
  }

  return result;
}

export async function closeHomeTicketDetailAction() {
  return sanitizePayload({
    ok: true,
    type: HOME_ACTION_RESULT_TYPES.STATE_PATCH,
    action: "close_ticket_detail",
    source: SOURCE,

    selectedTicketId: "",
    selectedIncidenciaId: "",

    statePatch: {
      selectedTicketId: "",
      selectedIncidenciaId: "",
      openingTicketId: "",
    },

    modal: {
      open: false,
      ticketId: "",
      incidenciaId: "",
    },

    at: nowIso(),
  });
}

/* =========================================================
   NAVIGATION / QUICK ACTIONS
========================================================= */

export async function navigateFromHomeAction({
  route = "",
  payload = {},
  silent = false,
  replaceState = false,
} = {}) {
  const target = normalizeSpaRoute(route);

  if (!target) {
    if (!silent) notify("Ruta no disponible.", "warning");

    return sanitizePayload({
      ok: false,
      type: HOME_ACTION_RESULT_TYPES.NAVIGATION,
      action: "navigate",
      source: SOURCE,
      route: "",
      reason: "invalid-route",
      at: nowIso(),
    });
  }

  if (!canUseRoute(target)) {
    if (!silent) notify("No tienes permisos para abrir esta ruta.", "warning");

    return sanitizePayload({
      ok: false,
      type: HOME_ACTION_RESULT_TYPES.NAVIGATION,
      action: "navigate",
      source: SOURCE,
      route: target,
      reason: "route-not-allowed",
      at: nowIso(),
    });
  }

  const ok = await navigateSpa(target, {
    payload,
    replaceState,
  });

  if (!ok && !silent) {
    notify("No se pudo abrir la vista solicitada.", "error");
  }

  return sanitizePayload({
    ok,
    type: HOME_ACTION_RESULT_TYPES.NAVIGATION,
    action: "navigate",
    source: SOURCE,
    route: target,
    statePatch: {
      navigatingAction: "",
    },
    at: nowIso(),
  });
}

export async function createHomeIncidenciaAction({
  payload = {},
  draft = {},
  silent = false,
} = {}) {
  return navigateFromHomeAction({
    route: ROUTES.INCIDENCIAS,
    payload: {
      ...safeObject(payload),
      ...safeObject(draft),
      action: "create_incidencia",
    },
    silent,
  });
}

function normalizeQuickActionRoute(action = "", route = "") {
  const explicit = normalizeSpaRoute(route);

  if (explicit) return explicit;

  return routeFromAction(action);
}

export async function runHomeQuickAction({
  action = "",
  route = "",
  payload = {},
  silent = false,
} = {}) {
  const cleanAction = normalizeKey(action);
  const data = sanitizePayload(payload || {});

  if (
    cleanAction === "open_ticket_detail" ||
    cleanAction === "open_incidencia_detail" ||
    cleanAction === "ticket_detail" ||
    cleanAction === "incidencia_detail"
  ) {
    return openHomeTicketDetailAction({
      ticketId: data.ticketId,
      incidenciaId: data.incidenciaId,
      entityId: data.entityId,
      payload: data,
      silent,
    });
  }

  if (
    cleanAction === "close_ticket_detail" ||
    cleanAction === "close_incidencia_detail" ||
    cleanAction === "close_detail"
  ) {
    return closeHomeTicketDetailAction();
  }

  if (
    cleanAction === "create" ||
    cleanAction === "new" ||
    cleanAction === "create_incidencia" ||
    cleanAction === "new_incidencia" ||
    cleanAction === "open_create" ||
    cleanAction === "open_create_incidencia"
  ) {
    return createHomeIncidenciaAction({
      payload: data,
      silent,
    });
  }

  if (
    cleanAction === "copy" ||
    cleanAction === "copy_id" ||
    cleanAction === "copy_widget_id" ||
    cleanAction === "copy_ticket_id" ||
    cleanAction === "copy_incidencia_id"
  ) {
    return copyHomeWidgetIdAction({
      widgetId: first(data.widgetId, data.ticketId, data.incidenciaId, data.entityId, data.id, ""),
      silent,
    });
  }

  const target = normalizeQuickActionRoute(cleanAction, route);

  if (target) {
    return navigateFromHomeAction({
      route: target,
      payload: data,
      silent,
    });
  }

  const widgetId = safeCopyText(first(data.widgetId, data.widgetKey, data.id, ""));
  const widget = widgetId ? getHomeWidgetByIdStore?.(widgetId) : null;

  return sanitizePayload({
    ok: true,
    type: HOME_ACTION_RESULT_TYPES.READ,
    action: cleanAction || "read",
    source: SOURCE,
    widget: widget ? normalizeHomeWidget(widget) : null,
    payload: data,
    at: nowIso(),
  });
}

/* =========================================================
   STATE REDUCER
========================================================= */

export function reduceHomeActionState(currentState = {}, result = {}) {
  const state = safeObject(currentState);
  const output = {};
  const clean = safeObject(result);
  const patch = safeObject(clean.statePatch);

  Object.assign(output, patch);

  const action = normalizeKey(clean.action);

  if (action === "open_ticket_detail") {
    const selectedTicketId = safeCopyText(
      first(
        clean.selectedTicketId,
        clean.selectedIncidenciaId,
        clean.ticketId,
        clean.incidenciaId,
        clean.modal?.ticketId,
        clean.modal?.incidenciaId,
        ""
      )
    );

    output.selectedTicketId = selectedTicketId;
    output.selectedIncidenciaId = selectedTicketId;
    output.openingTicketId = "";
  }

  if (action === "close_ticket_detail") {
    output.selectedTicketId = "";
    output.selectedIncidenciaId = "";
    output.openingTicketId = "";
  }

  if (clean.type === HOME_ACTION_RESULT_TYPES.NAVIGATION) {
    output.navigatingAction = "";
  }

  if (clean.error) {
    output.error = clean.error?.message || "Error Home.";
  }

  if (!Object.keys(output).length) {
    return state;
  }

  return sanitizePayload(output);
}

/* =========================================================
   CSV EXPORT
========================================================= */

function csvMode(value = "") {
  const mode = normalizeKey(value || "tickets");

  if (["ticket", "tickets", "incidencia", "incidencias"].includes(mode)) return "tickets";
  if (["invoice", "invoices", "factura", "facturas"].includes(mode)) return "invoices";
  if (["user", "users", "usuario", "usuarios"].includes(mode)) return "users";
  if (["client", "clients", "cliente", "clientes", "customer", "customers"].includes(mode)) return "clients";
  if (["activity", "actividad", "recent"].includes(mode)) return "activity";
  if (["widget", "widgets", "cards", "kpis"].includes(mode)) return "widgets";
  if (["dashboard", "home"].includes(mode)) return "dashboard";

  return "tickets";
}

function rowsForCsvMode(mode = "tickets") {
  const cleanMode = csvMode(mode);

  if (cleanMode === "tickets") {
    return normalizeHomeTickets(getHomeTicketsStore?.() || [], {
      invoices: normalizeHomeInvoices(getHomeInvoicesStore?.() || []),
      users: canUseAdminActions() ? normalizeHomeUsers(getHomeUsersStore?.() || []) : [],
    });
  }

  if (cleanMode === "invoices") return normalizeHomeInvoices(getHomeInvoicesStore?.() || []);
  if (cleanMode === "users") return canUseAdminActions() ? normalizeHomeUsers(getHomeUsersStore?.() || []) : [];
  if (cleanMode === "clients") return canUseAdminActions() ? normalizeHomeClients(getHomeClientsStore?.() || []) : [];
  if (cleanMode === "activity") return safeArray(getHomeActivityStore?.());
  if (cleanMode === "widgets") return safeArray(getHomeWidgetsStore?.());

  if (cleanMode === "dashboard") {
    const dashboard = normalizeHomeDashboard(getHomeDashboardStore?.() || {});
    return [
      {
        role: dashboard.role,
        admin: dashboard.admin,
        tickets: safeArray(dashboard.tickets).length,
        invoices: safeArray(dashboard.invoices).length,
        users: dashboard.admin ? safeArray(dashboard.users).length : 0,
        clients: dashboard.admin ? safeArray(dashboard.clients).length : 0,
        activity: safeArray(dashboard.activity).length,
        requestId: dashboard.requestId || "",
        updatedAt: dashboard.updatedAt || "",
      },
    ];
  }

  return [];
}

function flattenCsvValue(value) {
  if (value === null || value === undefined) return "";

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return redact(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (isObject(item)) return first(item.id, item.ticketId, item.invoiceId, item.name, item.title, "");
        return item;
      })
      .filter((item) => item !== undefined && item !== null && item !== "")
      .join(" | ");
  }

  if (isObject(value)) {
    return first(value.id, value.userId, value.clientId, value.ticketId, value.invoiceId, value.name, value.title, value.displayName, "");
  }

  return redact(String(value));
}

function rowForCsv(row = {}) {
  const clean = sanitizePayload(row);

  return Object.fromEntries(
    Object.entries(safeObject(clean)).filter(([key, value]) => {
      if (isRawKey(key)) return false;
      if (isCosmosMetaKey(key)) return false;
      if (isSensitiveKey(key)) return false;
      if (isObject(value)) return false;

      return true;
    })
  );
}

function csvEscape(value = "") {
  const text = String(flattenCsvValue(value) ?? "");

  if (/[",\r\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function buildCsv(rows = []) {
  const cleanRows = safeArray(rows).map(rowForCsv).filter((row) => Object.keys(row).length);

  if (!cleanRows.length) return "";

  const headers = [
    ...new Set(cleanRows.flatMap((row) => Object.keys(row))),
  ];

  const lines = [
    headers.map(csvEscape).join(";"),
    ...cleanRows.map((row) => headers.map((key) => csvEscape(row[key])).join(";")),
  ];

  return lines.join("\r\n");
}

function safeFilename(value = "") {
  const name = safeText(value, CSV_FILENAME)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);

  if (!name) return CSV_FILENAME;

  return name.toLowerCase().endsWith(".csv") ? name : `${name}.csv`;
}

function downloadCsv(filename = CSV_FILENAME, csv = "") {
  if (!isBrowser()) return false;
  if (!csv) return false;

  try {
    const blob = new Blob([`\uFEFF${csv}`], {
      type: CSV_MIME_TYPE,
    });

    const url = window.URL?.createObjectURL?.(blob);

    if (!url) return false;

    const link = document.createElement("a");
    link.href = url;
    link.download = safeFilename(filename);
    link.rel = "noopener";
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.URL.revokeObjectURL(url);

    return true;
  } catch {
    return false;
  }
}

export async function exportHomeCsvAction({
  filename = CSV_FILENAME,
  mode = "tickets",
  silent = false,
} = {}) {
  const cleanMode = csvMode(mode);
  const rows = rowsForCsvMode(cleanMode);
  const csv = buildCsv(rows);
  const finalFilename = safeFilename(filename);

  if (!csv) {
    if (!silent) notify("No hay datos para exportar.", "warning");

    return sanitizePayload({
      ok: false,
      type: HOME_ACTION_RESULT_TYPES.EXPORT,
      action: "export_csv",
      source: SOURCE,
      mode: cleanMode,
      filename: finalFilename,
      rowCount: 0,
      downloaded: false,
      reason: "empty",
      at: nowIso(),
    });
  }

  const downloaded = downloadCsv(finalFilename, csv);

  if (!downloaded && !silent) {
    notify("No se pudo descargar el CSV.", "error");
  }

  if (downloaded && !silent) {
    notify("Exportación generada.", "success");
  }

  return sanitizePayload({
    ok: downloaded,
    type: HOME_ACTION_RESULT_TYPES.EXPORT,
    action: "export_csv",
    source: SOURCE,
    mode: cleanMode,
    filename: finalFilename,
    rowCount: rows.length,
    downloaded,
    at: nowIso(),
  });
}

/* =========================================================
   COPY
========================================================= */

async function copyTextToClipboard(value = "") {
  const text = safeCopyText(value);

  if (!text) return false;

  try {
    if (typeof navigator !== "undefined" && isFunction(navigator.clipboard?.writeText)) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export async function copyHomeWidgetIdAction({
  widgetId = "",
  id = "",
  value = "",
  silent = false,
} = {}) {
  const target = safeCopyText(first(widgetId, id, value, ""));

  if (!target) {
    if (!silent) notify("No hay ID para copiar.", "warning");

    return sanitizePayload({
      ok: false,
      type: HOME_ACTION_RESULT_TYPES.COPY,
      action: "copy_id",
      source: SOURCE,
      copied: false,
      reason: "empty",
      at: nowIso(),
    });
  }

  const copied = await copyTextToClipboard(target);

  if (copied && !silent) {
    notify("ID copiado.", "success");
  }

  if (!copied && !silent) {
    notify("No se pudo copiar el ID.", "warning");
  }

  return sanitizePayload({
    ok: copied,
    type: HOME_ACTION_RESULT_TYPES.COPY,
    action: "copy_id",
    source: SOURCE,
    copied,
    value: copied ? target : "",
    at: nowIso(),
  });
}

/* =========================================================
   READ HELPERS
========================================================= */

export function getHomeWidgetAction({
  widgetId = "",
  id = "",
} = {}) {
  const target = safeCopyText(first(widgetId, id, ""));

  if (!target) return null;

  try {
    const widget = getHomeWidgetByIdStore?.(target);

    return widget ? normalizeHomeWidget(widget) : null;
  } catch {
    return null;
  }
}

export function getHomeCollectionsAction() {
  const admin = canUseAdminActions();

  return sanitizePayload({
    dashboard: normalizeHomeDashboard(getHomeDashboardStore?.() || {}),
    widgets: safeArray(getHomeWidgetsStore?.()),
    tickets: safeArray(getHomeTicketsStore?.()),
    invoices: safeArray(getHomeInvoicesStore?.()),
    users: admin ? safeArray(getHomeUsersStore?.()) : [],
    clients: admin ? safeArray(getHomeClientsStore?.()) : [],
    activity: safeArray(getHomeActivityStore?.()),
  });
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHomeActionsSnapshot() {
  const admin = canUseAdminActions();

  return sanitizePayload({
    version: HOME_ACTIONS_VERSION,
    source: SOURCE,

    role: getStoredRole(),
    admin,

    routes: {
      incidencias: ROUTES.INCIDENCIAS,
      facturas: ROUTES.FACTURAS,
      clientes: ROUTES.CLIENTES,
      usuarios: ROUTES.USUARIOS,
      cuenta: ROUTES.CUENTA,
      ajustes: ROUTES.AJUSTES,
    },

    availableRoutes: Object.fromEntries(
      Object.entries(ROUTES).map(([key, value]) => [
        key,
        Boolean(value && canUseRoute(value)),
      ])
    ),

    store: {
      dashboard: Boolean(getHomeDashboardFromStoreAction()),
      widgets: safeArray(getHomeWidgetsStore?.()).length,
      tickets: safeArray(getHomeTicketsStore?.()).length,
      invoices: safeArray(getHomeInvoicesStore?.()).length,
      users: admin ? safeArray(getHomeUsersStore?.()).length : 0,
      clients: admin ? safeArray(getHomeClientsStore?.()).length : 0,
      activity: safeArray(getHomeActivityStore?.()).length,
    },

    policy: {
      actionsOnly: true,

      navigationDelegatedToRouter: true,
      noRouterPushLegacy: true,
      noAppCoreNavigate: true,
      noManualHistoryFallback: true,

      noFetch: true,
      noApiCalls: true,
      noStorage: true,
      noGlobalEvents: true,
      noWindowBridge: true,

      toastOnlyViaAppCoreShowToast: true,

      ticketDetailModalOnly: true,
      ticketDetailDoesNotNavigate: true,
      ticketDetailReturnsStatePatch: true,
      closeDetailClearsSelection: true,

      exportCsvFromStoreCollections: true,
      copyUsesClipboardOnlyWhenAvailable: true,

      routesFromCoreConfig: true,
      adminRoutesFromCoreConfig: true,
      blocksLegacyRoutesViaCoreConfig: true,
      noLocalDenylistExceptCreateRouteAlias: true,

      noHomeRoute: true,
      noIncidenciasNuevaRoute: true,
      noOptionalRoutesInvented: true,
      noAuth: true,
      noCss: true,

      snapshotRedacted: true,
    },

    at: nowIso(),
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  HOME_ACTIONS_VERSION,
  HOME_ACTION_RESULT_TYPES,

  getHomeDashboardAction,
  refreshHomeDashboardAction,
  getHomeDashboardFromStoreAction,

  getHomeWidgetAction,
  getHomeCollectionsAction,

  navigateFromHomeAction,
  createHomeIncidenciaAction,
  runHomeQuickAction,

  getHomeTicketDetailFromStoreAction,
  openHomeTicketDetailAction,
  closeHomeTicketDetailAction,

  reduceHomeActionState,

  exportHomeCsvAction,
  copyHomeWidgetIdAction,

  getHomeActionsSnapshot,
  getDebugSnapshot: getHomeActionsSnapshot,
};
