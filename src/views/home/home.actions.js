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
  normalizeHomeWidgets,
  getHomeWidgetId,
} from "./home.model.js";

import {
  showToast,
} from "./home.utils.js";

export const HOME_ACTIONS_VERSION = "home.actions.v1";

const SOURCE = "views.home.actions";

const CSV_FILENAME = "home-export.csv";
const CSV_MIME_TYPE = "text/csv;charset=utf-8;";

const ROUTES = Object.freeze({
  home: "/",
  incidencias: "/incidencias",
  facturas: "/facturas",
  clientes: "/clientes",
  usuarios: "/usuarios",
  cuenta: "/cuenta",
  ajustes: "/ajustes",
});

const VALID_ROOT_ROUTES = new Set(Object.values(ROUTES));

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

  if (!text) return null;

  try {
    return showToast(text, type, safeObject(options));
  } catch {
    return null;
  }
}

/* =========================================================
   STORE READ ACTIONS
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
    if (payload) {
      return normalizeHomeDashboard(payload);
    }

    return getHomeDashboardFromStoreAction();
  } catch {
    if (!silent) {
      notify("No se pudo resolver el dashboard de Home.", "error");
    }

    return null;
  }
}

export async function refreshHomeDashboardAction(options = {}) {
  return getHomeDashboardAction(options);
}

/* =========================================================
   WIDGET READ ACTIONS
========================================================= */

function getWidgetTitle(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.title,
      raw.name,
      raw.label,
      raw.heading
    ),
    "Bloque"
  );
}

function getWidgetDescription(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.description,
      raw.descripcion,
      raw.subtitle,
      raw.summary,
      raw.text
    ),
    ""
  );
}

function getWidgetType(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.type,
      raw.kind,
      raw.variant,
      raw.category
    ),
    "widget"
  );
}

function getWidgetValue(item = {}) {
  const raw = safeObject(item);

  return first(
    raw.value,
    raw.total,
    raw.amount,
    raw.count,
    raw.metric,
    "—"
  );
}

function getWidgetTrend(item = {}) {
  const raw = safeObject(item);

  return first(
    raw.trend,
    raw.delta,
    raw.change,
    raw.variation,
    ""
  );
}

function getWidgetStatus(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.status,
      raw.estado,
      raw.state
    ),
    "active"
  );
}

function getWidgetRoute(item = {}) {
  const raw = safeObject(item);

  return normalizeSpaRoute(
    first(
      raw.route,
      raw.href,
      raw.link,
      raw.to,
      ""
    )
  );
}

function getWidgetItems(item = {}) {
  const raw = safeObject(item);
  const items = first(raw.items, raw.rows, raw.data, raw.list, []);

  return safeArray(items).map(safeObject);
}

function normalizeWidgetDetail(widget = {}) {
  const normalized = normalizeHomeWidget(widget);
  const widgetId = safeText(getHomeWidgetId(normalized), "");

  return {
    ...normalized,

    widgetId,
    id: normalized.id || widgetId || null,
    key: normalized.key || widgetId || null,

    title: getWidgetTitle(normalized),
    description: getWidgetDescription(normalized),
    type: getWidgetType(normalized),
    value: getWidgetValue(normalized),
    trend: getWidgetTrend(normalized),
    status: getWidgetStatus(normalized),
    route: getWidgetRoute(normalized),
    href: getWidgetRoute(normalized),
    items: getWidgetItems(normalized),
  };
}

export function getHomeWidgetDetailFromStoreAction({
  widgetId = "",
} = {}) {
  const id = safeText(widgetId, "");

  if (!id) return null;

  try {
    const widget = getHomeWidgetByIdStore?.(id);

    if (!widget) return null;

    return normalizeWidgetDetail(widget);
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
    if (payload) {
      return normalizeWidgetDetail(payload);
    }

    return getHomeWidgetDetailFromStoreAction({
      widgetId,
    });
  } catch {
    if (!silent) {
      notify("No se pudo resolver el bloque.", "error");
    }

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

  if (navigate) {
    const route = normalizeSpaRoute(detail.route || detail.href || "");

    if (route) {
      await navigateFromHomeAction({
        route,
        silent,
        payload: {
          widgetId: id || detail.widgetId,
        },
      });
    }
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

function plainCsvValue(value) {
  if (value === null || value === undefined) return "";

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildCsv(items = [], columns = []) {
  const rows = safeArray(items)
    .map(safeObject)
    .filter((item) => Object.keys(item).length);

  const finalColumns = safeArray(columns).length
    ? safeArray(columns).map((item) => safeText(item, "")).filter(Boolean)
    : Array.from(
        new Set(rows.flatMap((item) => Object.keys(item)))
      ).slice(0, 40);

  if (!rows.length || !finalColumns.length) return "";

  return [
    finalColumns.map(csvCell).join(","),
    ...rows.map((row) =>
      finalColumns
        .map((key) => csvCell(plainCsvValue(row?.[key])))
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

  const csvBody = buildCsv(list, columns);

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

function normalizePath(pathname = ROUTES.home) {
  let value = safeText(pathname, ROUTES.home)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || ROUTES.home;
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

  const cleanPath = normalizePath(path || ROUTES.home);

  /*
    /home no existe en la SPA nueva.
    Si aparece desde HTML viejo, se rechaza para no perpetuar alias.
  */
  if (cleanPath === "/home") return "";

  return `${cleanPath}${query}${hash}`;
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

async function navigateSpa(route = ROUTES.home, options = {}) {
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
    // fallback abajo
  }

  if (!isBrowser()) return false;

  try {
    const method = opts.replaceState === true ? "replaceState" : "pushState";

    window.history[method](
      {
        path: target,
        publicPath: target,
        source: SOURCE,
      },
      "",
      target
    );

    try {
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {
      window.dispatchEvent(new Event("popstate"));
    }

    return true;
  } catch {
    return false;
  }
}

export async function navigateFromHomeAction({
  route = ROUTES.home,
  silent = false,
  replaceState = false,
  payload = {},
} = {}) {
  const target = normalizeSpaRoute(route || ROUTES.home);

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
  route = ROUTES.incidencias,
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
  const actionName = normalizeKey(action);
  const targetRoute = normalizeSpaRoute(route);
  const data = safeObject(payload);

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
      widgetId: first(
        data.widgetId,
        data.ticketId,
        data.incidenciaId,
        data.entityId,
        data.id,
        ""
      ),
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
  getWidgetTitle as getHomeWidgetTitleAction,
  getWidgetDescription as getHomeWidgetDescriptionAction,
  getWidgetType as getHomeWidgetTypeAction,
  getWidgetValue as getHomeWidgetValueAction,
  getWidgetTrend as getHomeWidgetTrendAction,
  getWidgetStatus as getHomeWidgetStatusAction,
  getWidgetRoute as getHomeWidgetRouteAction,
  getWidgetItems as getHomeWidgetItemsAction,

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
  getHomeWidgetTitleAction: getWidgetTitle,
  getHomeWidgetDescriptionAction: getWidgetDescription,
  getHomeWidgetTypeAction: getWidgetType,
  getHomeWidgetValueAction: getWidgetValue,
  getHomeWidgetTrendAction: getWidgetTrend,
  getHomeWidgetStatusAction: getWidgetStatus,
  getHomeWidgetRouteAction: getWidgetRoute,
  getHomeWidgetItemsAction: getWidgetItems,

  normalizeHomeWidgetDetailAction: normalizeWidgetDetail,
  normalizeHomeDashboardAction,
  normalizeHomeRouteAction: normalizeSpaRoute,

  getHomeActionsSnapshot,
  getDebugSnapshot: getHomeActionsSnapshot,
});

export default HomeActions;
