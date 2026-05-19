/* =========================================================
   Onion Support - Home Actions
   Archivo: /src/views/home/home.actions.js

   Responsabilidad:
   - Acciones operativas mínimas de Home.
   - Navegación SPA delegada en Router/AppCore.
   - Export CSV desde colecciones del store.
   - Copiar IDs.
   - Ejecutar quick actions simples.
   - Leer dashboard/widget desde store si hace falta.
   - Sin fetch.
   - Sin API calls.
   - Sin storage.
   - Sin eventos globales.
   - Sin window bridges.
   - Sin route aliases legacy.
   - Sin /home.
   - Sin /incidencias/nueva.
   - Sin Auth.
   - Sin CSS.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../../core/index.js";

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
  getHomeWidgetId,
} from "./home.model.js";

import {
  showToast,
} from "./home.utils.js";

export const HOME_ACTIONS_VERSION = "home.actions.v2";

const SOURCE = "views.home.actions";

const CSV_FILENAME = "home-export.csv";
const CSV_MIME_TYPE = "text/csv;charset=utf-8;";

const ROUTES = Object.freeze({
  HOME: "/",
  INCIDENCIAS: "/incidencias",
  FACTURAS: "/facturas",
  CLIENTES: "/clientes",
  USUARIOS: "/usuarios",
  CUENTA: "/cuenta",
  AJUSTES: "/ajustes",
});

const ACTION_ROUTES = Object.freeze({
  go_incidencias: ROUTES.INCIDENCIAS,
  go_tickets: ROUTES.INCIDENCIAS,

  go_facturas: ROUTES.FACTURAS,
  go_invoices: ROUTES.FACTURAS,

  go_clientes: ROUTES.CLIENTES,
  go_clients: ROUTES.CLIENTES,

  go_usuarios: ROUTES.USUARIOS,
  go_users: ROUTES.USUARIOS,

  go_cuenta: ROUTES.CUENTA,
  go_account: ROUTES.CUENTA,

  go_ajustes: ROUTES.AJUSTES,
  go_settings: ROUTES.AJUSTES,
});

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

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function notify(message = "", type = "info", options = {}) {
  const text = safeText(message, "");

  if (!text) return false;

  try {
    return showToast(text, type, safeObject(options));
  } catch {
    return false;
  }
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

    return normalizeHomeDashboard(dashboard);
  } catch {
    return null;
  }
}

export async function getHomeDashboardAction({
  payload = null,
  silent = true,
} = {}) {
  try {
    if (payload) return normalizeHomeDashboard(payload);

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
   WIDGETS
========================================================= */

function widgetRoute(widget = {}) {
  const raw = safeObject(widget);

  return normalizeSpaRoute(first(raw.route, raw.href, raw.link, raw.to, ""));
}

function normalizeWidgetDetail(widget = {}) {
  const item = normalizeHomeWidget(widget);
  const id = safeText(getHomeWidgetId(item), "");

  return {
    ...item,

    widgetId: id,
    id: safeText(first(item.id, id), id),
    key: safeText(first(item.key, id), id),

    title: safeText(first(item.title, item.name, item.label, item.heading), "Bloque"),
    description: safeText(first(item.description, item.descripcion, item.subtitle, item.summary, item.text), ""),

    type: safeText(first(item.type, item.kind, item.variant, item.category), "widget"),
    value: first(item.value, item.total, item.amount, item.count, item.metric, "—"),
    trend: first(item.trend, item.delta, item.change, item.variation, ""),
    status: safeText(first(item.status, item.estado, item.state), "active"),

    route: widgetRoute(item),
    href: widgetRoute(item),

    items: safeArray(first(item.items, item.rows, item.data, item.list, [])),
  };
}

export function getHomeWidgetDetailFromStoreAction({
  widgetId = "",
} = {}) {
  const id = safeText(widgetId, "");

  if (!id) return null;

  try {
    const widget = getHomeWidgetByIdStore?.(id);
    return widget ? normalizeWidgetDetail(widget) : null;
  } catch {
    return null;
  }
}

export async function getHomeWidgetDetailAction({
  widgetId = "",
  payload = null,
  silent = true,
} = {}) {
  try {
    if (payload) return normalizeWidgetDetail(payload);

    return getHomeWidgetDetailFromStoreAction({
      widgetId,
    });
  } catch {
    if (!silent) notify("No se pudo resolver el bloque.", "error");
    return null;
  }
}

export async function openHomeWidgetAction({
  widgetId = "",
  payload = null,
  navigate = true,
  silent = true,
} = {}) {
  const id = safeText(widgetId || getHomeWidgetId(payload || {}), "");

  if (!id && !payload) {
    if (!silent) notify("Bloque inválido.", "error");
    return null;
  }

  const detail = await getHomeWidgetDetailAction({
    widgetId: id,
    payload,
    silent,
  });

  if (!detail) return null;

  const route = normalizeSpaRoute(detail.route || detail.href || "");

  if (navigate && route) {
    await navigateFromHomeAction({
      route,
      silent,
      payload: {
        widgetId: id || detail.widgetId,
      },
    });
  }

  return detail;
}

export async function refreshHomeWidgetDetailAction(options = {}) {
  return getHomeWidgetDetailAction(options);
}

/* =========================================================
   CLIPBOARD
========================================================= */

async function writeClipboardText(value = "") {
  const text = safeText(value, "");

  if (!text || !isBrowser()) return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback abajo
  }

  let textarea = null;

  try {
    textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.setAttribute("aria-hidden", "true");
    textarea.setAttribute("tabindex", "-1");
    textarea.className = "sr-only";

    document.body.appendChild(textarea);

    textarea.focus();
    textarea.select();
    textarea.setSelectionRange?.(0, textarea.value.length);

    const ok = document.execCommand("copy");

    textarea.remove();

    return Boolean(ok);
  } catch {
    try {
      textarea?.remove?.();
    } catch {
      // noop
    }

    return false;
  }
}

export async function copyHomeWidgetIdAction({
  widgetId = "",
  silent = false,
} = {}) {
  const id = safeText(widgetId, "");

  if (!id) {
    if (!silent) notify("No hay ID para copiar.", "error");
    return false;
  }

  const copied = await writeClipboardText(id);

  if (!copied) {
    if (!silent) notify("No se pudo copiar el ID.", "error");
    return false;
  }

  if (!silent) notify("ID copiado", "success");

  return true;
}

/* =========================================================
   CSV
========================================================= */

function normalizeFilename(value = "", fallback = CSV_FILENAME) {
  const name = safeText(value, fallback)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!name) return fallback;

  return name.toLowerCase().endsWith(".csv") ? name : `${name}.csv`;
}

function csvCell(value = "") {
  const text = value === null || value === undefined
    ? ""
    : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

function readValue(row = {}, paths = []) {
  const source = safeObject(row);

  for (const path of safeArray(paths)) {
    const keys = safeText(path, "").split(".").filter(Boolean);
    let value = source;

    for (const key of keys) {
      value = value?.[key];
    }

    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }

  return "";
}

function plainCsvValue(value) {
  if (value === null || value === undefined) return "";

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return "";
}

function columnSpecs(mode = "widgets") {
  const key = normalizeKey(mode);

  if (["ticket", "tickets", "incidencia", "incidencias"].includes(key)) {
    return [
      ["ID", ["ticketId", "incidenciaId", "id"]],
      ["Asunto", ["subject", "title", "asunto"]],
      ["Estado", ["status", "estado", "statusLabel"]],
      ["Prioridad", ["priority", "prioridad", "priorityKey"]],
      ["Categoría", ["category", "categoria", "type"]],
      ["Cliente/usuario", ["clientName", "clienteNombre", "requesterName", "userName"]],
      ["Email", ["clientEmail", "clienteEmail", "email"]],
      ["Creado", ["createdAt", "fechaCreacion"]],
      ["Actualizado", ["updatedAt", "lastUpdateAt"]],
    ];
  }

  if (["invoice", "invoices", "factura", "facturas", "billing"].includes(key)) {
    return [
      ["ID", ["facturaId", "invoiceId", "id"]],
      ["Número", ["numeroFacturaLegal", "numeroFactura", "invoiceNumber", "number"]],
      ["Importe", ["total", "amount", "importe", "invoiceAmount"]],
      ["Moneda", ["currency", "moneda"]],
      ["Estado", ["paymentStatus", "estadoPago", "status", "estado"]],
      ["Creada", ["createdAt", "fechaFactura", "issueDate"]],
      ["Actualizada", ["updatedAt", "modifiedAt"]],
    ];
  }

  if (["client", "clients", "cliente", "clientes", "customer", "customers"].includes(key)) {
    return [
      ["ID", ["clienteId", "clientId", "customerId", "id"]],
      ["Nombre", ["displayName", "name", "nombre", "razonSocial", "company"]],
      ["Email", ["email", "mail"]],
      ["Activo", ["active", "isActive", "enabled"]],
      ["Creado", ["createdAt"]],
      ["Actualizado", ["updatedAt", "modifiedAt"]],
    ];
  }

  if (["user", "users", "usuario", "usuarios"].includes(key)) {
    return [
      ["ID", ["userId", "usuarioId", "id"]],
      ["Nombre", ["displayName", "fullName", "name", "nombre", "username"]],
      ["Email", ["email", "mail"]],
      ["Rol", ["role", "rol"]],
      ["Activo", ["active", "isActive", "enabled"]],
      ["Creado", ["createdAt"]],
      ["Actualizado", ["updatedAt", "modifiedAt", "lastLoginAt"]],
    ];
  }

  if (["activity", "activities", "recent", "timeline"].includes(key)) {
    return [
      ["Tipo", ["type", "kind", "category"]],
      ["Título", ["title", "name", "subject"]],
      ["Texto", ["text", "description", "message", "detail"]],
      ["Fecha", ["date", "createdAt", "updatedAt", "timestamp"]],
      ["Entidad", ["entityId", "ticketId", "incidenciaId", "facturaId", "invoiceId", "userId", "clienteId"]],
    ];
  }

  return [
    ["ID", ["widgetId", "widgetKey", "id", "key"]],
    ["Título", ["title", "name", "label"]],
    ["Tipo", ["type", "kind", "variant", "category"]],
    ["Valor", ["value", "total", "amount", "count", "metric"]],
    ["Estado", ["status", "estado", "state"]],
    ["Ruta", ["route", "href"]],
  ];
}

function buildCsv(items = [], mode = "widgets", columns = []) {
  const rows = safeArray(items)
    .map(safeObject)
    .filter((item) => Object.keys(item).length);

  const specs = safeArray(columns).length
    ? safeArray(columns)
        .map((key) => [safeText(key, ""), [safeText(key, "")]])
        .filter(([label]) => Boolean(label))
    : columnSpecs(mode);

  if (!rows.length || !specs.length) return "";

  return [
    specs.map(([label]) => csvCell(label)).join(","),
    ...rows.map((row) =>
      specs
        .map(([, paths]) => csvCell(plainCsvValue(readValue(row, paths))))
        .join(",")
    ),
  ].join("\n");
}

function downloadTextFile({
  filename = CSV_FILENAME,
  content = "",
  mimeType = "text/plain;charset=utf-8;",
} = {}) {
  if (!isBrowser()) return false;

  let url = "";

  try {
    const blob = new Blob([String(content || "")], {
      type: mimeType,
    });

    url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = normalizeFilename(filename);
    anchor.rel = "noopener";
    anchor.className = "sr-only";
    anchor.setAttribute("aria-hidden", "true");
    anchor.setAttribute("tabindex", "-1");

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // noop
      }
    }, 0);

    return true;
  } catch {
    try {
      if (url) URL.revokeObjectURL(url);
    } catch {
      // noop
    }

    return false;
  }
}

function resolveExportItems(items = null, mode = "widgets") {
  if (Array.isArray(items)) return items;

  const key = normalizeKey(mode);

  try {
    if (["ticket", "tickets", "incidencia", "incidencias"].includes(key)) {
      return safeArray(getHomeTicketsStore?.());
    }

    if (["invoice", "invoices", "factura", "facturas", "billing"].includes(key)) {
      return safeArray(getHomeInvoicesStore?.());
    }

    if (["user", "users", "usuario", "usuarios"].includes(key)) {
      return safeArray(getHomeUsersStore?.());
    }

    if (["client", "clients", "cliente", "clientes", "customer", "customers"].includes(key)) {
      return safeArray(getHomeClientsStore?.());
    }

    if (["activity", "activities", "recent", "timeline"].includes(key)) {
      return safeArray(getHomeActivityStore?.());
    }

    return safeArray(getHomeWidgetsStore?.());
  } catch {
    return [];
  }
}

export function exportHomeCsvAction({
  filename = CSV_FILENAME,
  items = null,
  columns = [],
  mode = "widgets",
  silent = false,
} = {}) {
  const list = resolveExportItems(items, mode);

  if (!list.length) {
    if (!silent) notify("No hay datos para exportar.", "info");
    return false;
  }

  const csvBody = buildCsv(list, mode, columns);

  if (!csvBody) {
    if (!silent) notify("No hay columnas válidas para exportar.", "info");
    return false;
  }

  const downloaded = downloadTextFile({
    filename: normalizeFilename(filename),
    content: `\uFEFF${csvBody}`,
    mimeType: CSV_MIME_TYPE,
  });

  if (!downloaded) {
    if (!silent) notify("No se pudo exportar el CSV.", "error");
    return false;
  }

  if (!silent) notify("CSV exportado", "success");

  return true;
}

/* =========================================================
   NAVIGATION
========================================================= */

function normalizePath(pathname = ROUTES.HOME) {
  let value = safeText(pathname, ROUTES.HOME)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || ROUTES.HOME;
  }

  return value;
}

function normalizeSpaRoute(route = "") {
  const raw = safeText(route, "");

  if (!raw) return "";

  const lower = raw.toLowerCase();

  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:")
  ) {
    return "";
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      if (!isBrowser()) return "";

      const url = new URL(raw, window.location.origin);

      if (url.origin !== window.location.origin) return "";

      return normalizeSpaRoute(`${url.pathname}${url.search || ""}${url.hash || ""}`);
    } catch {
      return "";
    }
  }

  const normalized = raw.startsWith("/") ? raw : `/${raw}`;

  const hashIndex = normalized.indexOf("#");
  const hash = hashIndex >= 0 ? normalized.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? normalized.slice(0, hashIndex) : normalized;

  const queryIndex = withoutHash.indexOf("?");
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex) : "";
  const path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;

  const cleanPath = normalizePath(path || ROUTES.HOME);

  if (cleanPath === "/home") return "";

  return `${cleanPath}${query}${hash}`;
}

function routeFromAction(action = "") {
  return ACTION_ROUTES[normalizeKey(action)] || "";
}

function getRouterCandidates() {
  const candidates = [];

  try {
    candidates.push(AppCore?.Router);
    candidates.push(AppCore?.router);
    candidates.push(AppCore?.modules?.get?.("Router"));
    candidates.push(AppCore?.modules?.get?.("router"));
    candidates.push(AppCore?.modules?.Router);
    candidates.push(AppCore?.modules?.router);
  } catch {
    // noop
  }

  return candidates.filter(Boolean);
}

async function navigateSpa(route = ROUTES.HOME, options = {}) {
  const target = normalizeSpaRoute(route);

  if (!target) return false;

  const opts = {
    source: SOURCE,
    ...safeObject(options),
  };

  for (const router of getRouterCandidates()) {
    try {
      if (opts.replaceState === true && isFunction(router?.replace)) {
        await router.replace(target, opts);
        return true;
      }

      if (isFunction(router?.navigate)) {
        await router.navigate(target, opts);
        return true;
      }

      if (isFunction(router?.go)) {
        await router.go(target, opts);
        return true;
      }

      if (isFunction(router?.push)) {
        await router.push(target, opts);
        return true;
      }
    } catch {
      // probar siguiente candidato
    }
  }

  try {
    if (isFunction(AppCore?.navigate)) {
      await AppCore.navigate(target, opts);
      return true;
    }
  } catch {
    // noop
  }

  return false;
}

export async function navigateFromHomeAction({
  route = ROUTES.HOME,
  silent = false,
  replaceState = false,
  payload = {},
} = {}) {
  const target = normalizeSpaRoute(route || ROUTES.HOME);

  if (!target) {
    if (!silent) notify("Ruta inválida.", "error");
    return false;
  }

  try {
    const ok = await navigateSpa(target, {
      replaceState: Boolean(replaceState),
      payload: safeObject(payload),
    });

    if (!ok) throw new Error("HOME_NAVIGATION_FAILED");

    return true;
  } catch {
    if (!silent) notify("No se pudo navegar desde Home.", "error");
    return false;
  }
}

/* =========================================================
   QUICK ACTIONS
========================================================= */

export async function createFromHomeAction({
  route = ROUTES.INCIDENCIAS,
  silent = false,
  payload = {},
} = {}) {
  return navigateFromHomeAction({
    route,
    silent,
    payload,
  });
}

export async function runHomeQuickAction({
  action = "",
  route = "",
  payload = {},
  silent = false,
} = {}) {
  const data = safeObject(payload);
  const actionName = normalizeKey(action);
  const targetRoute = normalizeSpaRoute(
    first(route, data.route, data.href, routeFromAction(actionName), "")
  );

  if (targetRoute) {
    return navigateFromHomeAction({
      route: targetRoute,
      silent,
      payload: data,
    });
  }

  if (
    [
      "create",
      "new",
      "create_ticket",
      "create_incidencia",
      "new_ticket",
      "new_incidencia",
      "nueva_incidencia",
    ].includes(actionName)
  ) {
    return createFromHomeAction({
      silent,
      payload: data,
    });
  }

  if (
    [
      "copy",
      "copy_id",
      "copy_widget_id",
      "copy_ticket_id",
      "copy_entity_id",
    ].includes(actionName)
  ) {
    return copyHomeWidgetIdAction({
      widgetId: first(data.widgetId, data.ticketId, data.incidenciaId, data.entityId, data.id, ""),
      silent,
    });
  }

  if (
    [
      "export",
      "export_csv",
      "download_csv",
    ].includes(actionName)
  ) {
    return exportHomeCsvAction({
      ...data,
      silent,
    });
  }

  if (
    [
      "refresh",
      "retry",
      "reload",
      "actualizar",
    ].includes(actionName)
  ) {
    return true;
  }

  if (!actionName) {
    if (!silent) notify("Acción inválida.", "error");
    return false;
  }

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHomeActionsSnapshot() {
  return {
    version: HOME_ACTIONS_VERSION,
    source: SOURCE,

    browser: isBrowser(),

    router: {
      hasCandidates: getRouterCandidates().length > 0,
      hasAppCoreNavigate: isFunction(AppCore?.navigate),
    },

    store: {
      hasDashboard: isFunction(getHomeDashboardStore),
      hasWidgets: isFunction(getHomeWidgetsStore),
      hasTickets: isFunction(getHomeTicketsStore),
      hasInvoices: isFunction(getHomeInvoicesStore),
      hasUsers: isFunction(getHomeUsersStore),
      hasClients: isFunction(getHomeClientsStore),
      hasActivity: isFunction(getHomeActivityStore),
    },

    policy: {
      noFetch: true,
      noApiCalls: true,
      noStorage: true,
      noEvents: true,
      noGlobals: true,
      noHomeAlias: true,
      noCreateRoute: true,
      noManualHistoryFallback: true,
    },

    routes: {
      ...ROUTES,
    },

    at: nowIso(),
  };
}

/* =========================================================
   DETAIL HELPERS EXPORT
========================================================= */

export {
  normalizeWidgetDetail as normalizeHomeWidgetDetailAction,
  normalizeSpaRoute as normalizeHomeRouteAction,
};

export function getHomeWidgetIdAction(item = {}) {
  return getHomeWidgetId(item);
}

export function normalizeHomeDashboardAction(payload = {}) {
  return normalizeHomeDashboard(payload);
}

/* =========================================================
   PUBLIC API
========================================================= */

export const HomeActions = Object.freeze({
  version: HOME_ACTIONS_VERSION,

  getHomeDashboardFromStoreAction,
  getHomeDashboardAction,
  refreshHomeDashboardAction,

  getHomeWidgetDetailFromStoreAction,
  getHomeWidgetDetailAction,
  openHomeWidgetAction,
  refreshHomeWidgetDetailAction,

  copyHomeWidgetIdAction,
  exportHomeCsvAction,

  navigateFromHomeAction,
  runHomeQuickAction,
  createFromHomeAction,

  getHomeWidgetIdAction,
  normalizeHomeWidgetDetailAction: normalizeWidgetDetail,
  normalizeHomeDashboardAction,
  normalizeHomeRouteAction: normalizeSpaRoute,

  getHomeActionsSnapshot,
  getDebugSnapshot: getHomeActionsSnapshot,
});

export default HomeActions;
