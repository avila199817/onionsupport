/* =========================================================
   Onion Support - Home Actions
   Archivo: /src/views/home/home.actions.js

   Responsabilidad:
   - Acciones operativas mínimas de Home.
   - Navegación SPA delegada en Router si existe.
   - Crear incidencia delegando a la ruta real de incidencias.
   - Abrir/cerrar detalle de incidencia sin navegar.
   - Devolver statePatch para que bindings/homeView actualicen selectedTicketId.
   - Copiar IDs públicos.
   - Leer dashboard/ticket desde store si hace falta.
   - Rutas base desde core/config.js.
   - Admin routes reales desde core/config.js.
   - Toast sólo mediante AppCore.showToast si existe.
   - Sin fetch.
   - Sin API calls.
   - Sin storage.
   - Sin eventos globales.
   - Sin window bridges.
   - Sin route aliases legacy.
   - Sin quick actions legacy.
   - Sin export CSV.
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
  getHomeTicketsStore,
  getHomeInvoicesStore,
  getHomeUsersStore,
} from "./home.store.js";

import {
  normalizeHomeDashboard,
  normalizeHomeTickets,
  normalizeHomeInvoices,
  normalizeHomeUsers,

  getHomeTicketId,

  findHomeTicketById,
  resolveHomeTicketInvoices,
  resolveHomeTicketTechnician,
} from "./home.model.js";

export const HOME_ACTIONS_VERSION = "home.actions.v9.template-aligned-minimal";

const SOURCE = "views.home.actions";

export const HOME_ACTION_RESULT_TYPES = Object.freeze({
  STATE_PATCH: "home_state_patch",
  NAVIGATION: "home_navigation",
  COPY: "home_copy",
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
  SERVIDOR: routeFromCore("servidor", ""),
  CUENTA: routeFromCore("cuenta", ""),
  AJUSTES: routeFromCore("ajustes", ""),
});

function routePath(route = "") {
  return normalizeSpaRoute(route).split("?")[0].split("#")[0] || "";
}

function isAdminOnlyRoute(route = "") {
  const path = routePath(route);
  const clientes = routePath(ROUTES.CLIENTES);
  const usuarios = routePath(ROUTES.USUARIOS);
  const servidor = routePath(ROUTES.SERVIDOR);

  if (!path) return false;

  try {
    if (configIsAdminRoute(path) === true) return true;
  } catch {
    // fallback local mínimo
  }

  return (
    Boolean(clientes && (path === clientes || path.startsWith(`${clientes}/`))) ||
    Boolean(usuarios && (path === usuarios || path.startsWith(`${usuarios}/`))) ||
    Boolean(servidor && (path === servidor || path.startsWith(`${servidor}/`)))
  );
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
   STORE / PERMISSIONS
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
   NAVIGATION / CREATE
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

/*
   Compatibilidad temporal:
   homeView.js anterior aún puede importar runHomeQuickAction.
   No contiene aliases legacy ni acciones extra; sólo delega las acciones
   reales del template actual.
*/
export async function runHomeQuickAction({
  action = "",
  route = "",
  payload = {},
  silent = false,
} = {}) {
  const cleanAction = normalizeKey(action);
  const data = sanitizePayload(payload || {});

  if (cleanAction === "open_ticket_detail") {
    return openHomeTicketDetailAction({
      ticketId: data.ticketId,
      incidenciaId: data.incidenciaId,
      entityId: data.entityId,
      payload: data,
      silent,
    });
  }

  if (cleanAction === "close_ticket_detail") {
    return closeHomeTicketDetailAction();
  }

  if (cleanAction === "create_incidencia") {
    return createHomeIncidenciaAction({
      payload: data,
      silent,
    });
  }

  if (cleanAction === "copy_widget_id") {
    return copyHomeWidgetIdAction({
      widgetId: first(data.widgetId, data.ticketId, data.incidenciaId, data.entityId, data.id, ""),
      silent,
    });
  }

  if (cleanAction === "navigate_home") {
    return navigateFromHomeAction({
      route,
      payload: data,
      silent,
    });
  }

  return false;
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
      servidor: ROUTES.SERVIDOR,
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
      tickets: safeArray(getHomeTicketsStore?.()).length,
      invoices: safeArray(getHomeInvoicesStore?.()).length,
      users: admin ? safeArray(getHomeUsersStore?.()).length : 0,
    },

    policy: {
      actionsOnly: true,
      templateAlignedActionsOnly: true,

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

      createIncidenciaDelegatesToIncidenciasRoute: true,
      copyUsesClipboardOnlyWhenAvailable: true,

      noExportCsv: true,
      noQuickActionsLegacy: true,
      runHomeQuickActionCompatOnly: true,

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

  navigateFromHomeAction,
  createHomeIncidenciaAction,
  runHomeQuickAction,

  getHomeTicketDetailFromStoreAction,
  openHomeTicketDetailAction,
  closeHomeTicketDetailAction,

  reduceHomeActionState,

  copyHomeWidgetIdAction,

  getHomeActionsSnapshot,
  getDebugSnapshot: getHomeActionsSnapshot,
};
