/* =========================================================
   Onion SPA - Home Actions
   Archivo: src/views/home/home.actions.js

   RESPONSABILIDADES:
   - centralizar acciones operativas del módulo home
   - resolver snapshot/dashboard desde store + backend
   - abrir detalle de bloque/widget a nivel de datos, no de UI
   - copiar id/key de widget
   - exportar colecciones del dashboard a CSV
   - desacoplar la vista home de la lógica operativa
   - mantener compatibilidad con homeView.js

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - fallback store -> backend
   - soporte envelope backend
   - export seguro con escape CSV
   - clipboard robusto con fallback legacy
   - eventos opcionales vía AppCore.events
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  getHomeDashboardRequest,
  getHomeWidgetByIdRequest,
} from "./home.api.js";

import {
  getHomeDashboardStore,
  getHomeWidgetByIdStore,
  getHomeSortedCollectionStore,
} from "./home.store.js";

import {
  safeText,
  safeNumber,
  safeArray,
  safeObject,
  showToast,
} from "./home.utils.js";

/* =========================================================
   CONSTANTS
========================================================= */

const CSV_FILENAME = "home-export.csv";

/* =========================================================
   HELPERS
========================================================= */

function safeEmit(event = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(event, payload);
  } catch {}
}

function first(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }
  return null;
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function normalizeWidgetId(value = "") {
  return safeText(value, "");
}

function isLikelyWidget(value) {
  if (!isObject(value)) return false;

  return Boolean(
    value.widgetId ||
      value.id ||
      value.key ||
      value.slug ||
      value.code ||
      value.title ||
      value.name ||
      value.label
  );
}

function isLikelyDashboard(value) {
  if (!isObject(value)) return false;

  return Boolean(
    Array.isArray(value.widgets) ||
      Array.isArray(value.cards) ||
      Array.isArray(value.kpis) ||
      Array.isArray(value.items) ||
      Array.isArray(value.recent) ||
      value.summary ||
      value.stats ||
      value.metrics
  );
}

function looksLikeEnvelope(value) {
  const obj = safeObject(value);

  return Boolean(
    obj.dashboard ||
      obj.widget ||
      obj.item ||
      obj.data ||
      obj.result ||
      obj.payload
  );
}

function pickDashboard(payload = null) {
  if (!payload) return null;

  if (isLikelyDashboard(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (isLikelyDashboard(obj.dashboard)) {
    return obj.dashboard;
  }

  if (isLikelyDashboard(obj.data)) {
    return obj.data;
  }

  if (isLikelyDashboard(obj.result)) {
    return obj.result;
  }

  if (isLikelyDashboard(obj.payload)) {
    return obj.payload;
  }

  if (looksLikeEnvelope(obj.data)) {
    return pickDashboard(obj.data);
  }

  return null;
}

function pickWidget(payload = null) {
  if (!payload) return null;

  if (isLikelyWidget(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (isLikelyWidget(obj.widget)) {
    return obj.widget;
  }

  if (isLikelyWidget(obj.item)) {
    return obj.item;
  }

  if (isLikelyWidget(obj.result)) {
    return obj.result;
  }

  if (isLikelyWidget(obj.payload)) {
    return obj.payload;
  }

  if (isLikelyWidget(obj.data)) {
    return obj.data;
  }

  if (looksLikeEnvelope(obj.data)) {
    return pickWidget(obj.data);
  }

  return null;
}

function getWidgetId(item = {}) {
  return safeText(
    first(
      item.widgetId,
      item.id,
      item.key,
      item.slug,
      item.code
    ),
    ""
  );
}

function getWidgetTitle(item = {}) {
  return safeText(
    first(
      item.title,
      item.name,
      item.label,
      item.heading
    ),
    "Bloque"
  );
}

function getWidgetDescription(item = {}) {
  return safeText(
    first(
      item.description,
      item.descripcion,
      item.subtitle,
      item.summary,
      item.text
    ),
    "Sin descripción."
  );
}

function getWidgetType(item = {}) {
  return safeText(
    first(
      item.type,
      item.kind,
      item.variant,
      item.category
    ),
    "widget"
  );
}

function getWidgetValue(item = {}) {
  return first(
    item.value,
    item.total,
    item.amount,
    item.count,
    item.metric
  );
}

function getWidgetTrend(item = {}) {
  return first(
    item.trend,
    item.delta,
    item.change,
    item.variation
  );
}

function getWidgetStatus(item = {}) {
  return safeText(
    first(
      item.status,
      item.estado,
      item.state
    ),
    "active"
  );
}

function getWidgetRoute(item = {}) {
  return safeText(
    first(
      item.route,
      item.href,
      item.link,
      item.to
    ),
    ""
  );
}

function getWidgetCreatedAt(item = {}) {
  return first(
    item.createdAt,
    item.fechaCreacion,
    item.date
  );
}

function getWidgetUpdatedAt(item = {}) {
  return first(
    item.updatedAt,
    item.lastUpdate,
    item.modifiedAt,
    item.createdAt
  );
}

function getWidgetItems(item = {}) {
  return safeArray(
    first(
      item.items,
      item.rows,
      item.list,
      item.data
    )
  ).map((entry) => safeObject(entry));
}

function getDashboardWidgets(dashboard = {}) {
  return safeArray(
    first(
      dashboard.widgets,
      dashboard.cards,
      dashboard.kpis,
      dashboard.items
    )
  ).map((item) => normalizeWidgetDetail(item));
}

function getDashboardRecent(dashboard = {}) {
  return safeArray(
    first(
      dashboard.recent,
      dashboard.recentActivity,
      dashboard.activity,
      dashboard.timeline
    )
  ).map((item) => safeObject(item));
}

function getDashboardSummary(dashboard = {}) {
  return safeObject(
    first(
      dashboard.summary,
      dashboard.stats,
      dashboard.metrics,
      dashboard.totals
    )
  );
}

function normalizeWidgetDetail(detail = {}) {
  const raw = safeObject(detail);

  return {
    ...raw,
    widgetId: getWidgetId(raw),
    title: getWidgetTitle(raw),
    description: getWidgetDescription(raw),
    type: getWidgetType(raw),
    value: getWidgetValue(raw),
    trend: getWidgetTrend(raw),
    status: getWidgetStatus(raw),
    route: getWidgetRoute(raw),
    createdAt: getWidgetCreatedAt(raw),
    updatedAt: getWidgetUpdatedAt(raw),
    items: getWidgetItems(raw),
  };
}

function normalizeDashboardSnapshot(snapshot = {}) {
  const raw = safeObject(snapshot);

  return {
    ...raw,
    summary: getDashboardSummary(raw),
    widgets: getDashboardWidgets(raw),
    recent: getDashboardRecent(raw),
    updatedAt: first(
      raw.updatedAt,
      raw.lastUpdate,
      raw.generatedAt,
      raw.createdAt
    ),
  };
}

function escapeCsvCell(value = "") {
  const text =
    value === null || value === undefined
      ? ""
      : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvRows(items = []) {
  const header = [
    "widgetId",
    "title",
    "description",
    "type",
    "value",
    "trend",
    "status",
    "route",
    "createdAt",
    "updatedAt",
  ];

  const rows = safeArray(items).map((item) => [
    getWidgetId(item),
    getWidgetTitle(item),
    getWidgetDescription(item),
    getWidgetType(item),
    getWidgetValue(item) ?? "",
    getWidgetTrend(item) ?? "",
    getWidgetStatus(item),
    getWidgetRoute(item),
    getWidgetCreatedAt(item) || "",
    getWidgetUpdatedAt(item) || "",
  ]);

  return [
    header.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\n");
}

async function writeClipboardText(text = "") {
  const value = safeText(text, "");

  if (!value) return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const ok = document.execCommand("copy");

    textarea.remove();

    return Boolean(ok);
  } catch {
    return false;
  }
}

function downloadTextFile({
  filename = CSV_FILENAME,
  content = "",
  mimeType = "text/plain;charset=utf-8;",
} = {}) {
  const blob = new Blob([String(content || "")], {
    type: mimeType,
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);

  return true;
}

/* =========================================================
   DASHBOARD ACTIONS
========================================================= */

export function getHomeDashboardFromStoreAction() {
  try {
    const snapshot = getHomeDashboardStore();
    const picked = pickDashboard(snapshot);

    if (!picked) return null;

    return normalizeDashboardSnapshot(picked);
  } catch {
    return null;
  }
}

export async function getHomeDashboardAction({
  preferFresh = true,
  silent = false,
} = {}) {
  const fallbackStoreSnapshot =
    getHomeDashboardFromStoreAction();

  if (!preferFresh && fallbackStoreSnapshot) {
    return fallbackStoreSnapshot;
  }

  try {
    safeEmit("home:dashboard:request", {
      source: "backend",
    });

    const response = await getHomeDashboardRequest();
    const snapshot = pickDashboard(response);

    if (!snapshot) {
      if (fallbackStoreSnapshot) {
        safeEmit("home:dashboard:fallback", {
          source: "store",
        });
        return fallbackStoreSnapshot;
      }

      throw new Error("EMPTY_HOME_DASHBOARD");
    }

    const normalized =
      normalizeDashboardSnapshot(snapshot);

    safeEmit("home:dashboard:success", {
      source: "backend",
      dashboard: normalized,
    });

    return normalized;
  } catch (error) {
    if (fallbackStoreSnapshot) {
      safeEmit("home:dashboard:fallback", {
        source: "store",
        error,
      });

      return fallbackStoreSnapshot;
    }

    safeEmit("home:dashboard:error", {
      error,
    });

    if (!silent) {
      showToast(
        "No se pudo cargar el dashboard de inicio.",
        "error"
      );
    }

    return null;
  }
}

export async function refreshHomeDashboardAction({
  silent = true,
} = {}) {
  return getHomeDashboardAction({
    preferFresh: true,
    silent,
  });
}

/* =========================================================
   WIDGET DETAIL ACTIONS
========================================================= */

export function getHomeWidgetDetailFromStoreAction({
  widgetId = "",
} = {}) {
  const id = normalizeWidgetId(widgetId);

  if (!id) return null;

  try {
    const detail = getHomeWidgetByIdStore(id);
    const picked = pickWidget(detail);

    if (!picked) return null;

    return normalizeWidgetDetail(picked);
  } catch {
    return null;
  }
}

export async function getHomeWidgetDetailAction({
  widgetId = "",
  preferFresh = true,
  silent = false,
} = {}) {
  const id = normalizeWidgetId(widgetId);

  if (!id) {
    if (!silent) {
      showToast("No se pudo resolver el bloque.", "error");
    }
    return null;
  }

  const fallbackStoreDetail =
    getHomeWidgetDetailFromStoreAction({
      widgetId: id,
    });

  if (!preferFresh && fallbackStoreDetail) {
    return fallbackStoreDetail;
  }

  try {
    safeEmit("home:widget:detail:request", {
      widgetId: id,
      source: "backend",
    });

    const response =
      await getHomeWidgetByIdRequest(id);

    const detail = pickWidget(response);

    if (!detail) {
      if (fallbackStoreDetail) {
        safeEmit("home:widget:detail:fallback", {
          widgetId: id,
          source: "store",
        });
        return fallbackStoreDetail;
      }

      throw new Error("EMPTY_HOME_WIDGET_DETAIL");
    }

    const normalized = normalizeWidgetDetail(detail);

    safeEmit("home:widget:detail:success", {
      widgetId: id,
      source: "backend",
      detail: normalized,
    });

    return normalized;
  } catch (error) {
    if (fallbackStoreDetail) {
      safeEmit("home:widget:detail:fallback", {
        widgetId: id,
        source: "store",
        error,
      });

      return fallbackStoreDetail;
    }

    safeEmit("home:widget:detail:error", {
      widgetId: id,
      error,
    });

    if (!silent) {
      showToast(
        "No se pudo cargar el detalle del bloque.",
        "error"
      );
    }

    return null;
  }
}

export async function openHomeWidgetAction({
  widgetId = "",
  preferFresh = true,
  silent = false,
} = {}) {
  const id = normalizeWidgetId(widgetId);

  if (!id) {
    if (!silent) {
      showToast("Bloque inválido.", "error");
    }
    return null;
  }

  safeEmit("home:widget:open", {
    widgetId: id,
  });

  const detail = await getHomeWidgetDetailAction({
    widgetId: id,
    preferFresh,
    silent,
  });

  if (!detail) {
    return null;
  }

  safeEmit("home:widget:open:success", {
    widgetId: id,
    detail,
  });

  return detail;
}

export async function refreshHomeWidgetDetailAction({
  widgetId = "",
  silent = true,
} = {}) {
  return getHomeWidgetDetailAction({
    widgetId,
    preferFresh: true,
    silent,
  });
}

/* =========================================================
   COPY ID
========================================================= */

export async function copyHomeWidgetIdAction({
  widgetId = "",
  silent = false,
} = {}) {
  const id = normalizeWidgetId(widgetId);

  if (!id) {
    if (!silent) {
      showToast("No hay ID para copiar.", "error");
    }
    return false;
  }

  const copied = await writeClipboardText(id);

  if (!copied) {
    if (!silent) {
      showToast("No se pudo copiar el ID.", "error");
    }
    return false;
  }

  safeEmit("home:widget:copy-id", {
    widgetId: id,
  });

  if (!silent) {
    showToast("ID copiado", "success");
  }

  return true;
}

/* =========================================================
   EXPORT
========================================================= */

export function exportHomeCsvAction({
  filename = CSV_FILENAME,
  items = null,
  silent = false,
} = {}) {
  const sourceItems = Array.isArray(items)
    ? items
    : getHomeSortedCollectionStore();

  const list = safeArray(sourceItems);

  if (!list.length) {
    if (!silent) {
      showToast("No hay datos para exportar.", "info");
    }
    return false;
  }

  try {
    const csv = buildCsvRows(list);

    downloadTextFile({
      filename: safeText(filename, CSV_FILENAME),
      content: csv,
      mimeType: "text/csv;charset=utf-8;",
    });

    safeEmit("home:export:csv", {
      total: list.length,
      filename: safeText(filename, CSV_FILENAME),
    });

    if (!silent) {
      showToast("CSV exportado", "success");
    }

    return true;
  } catch (error) {
    safeEmit("home:export:error", {
      type: "csv",
      error,
    });

    if (!silent) {
      showToast("No se pudo exportar el CSV.", "error");
    }

    return false;
  }
}

/* =========================================================
   QUICK ACTIONS / NAVIGATION
========================================================= */

export async function navigateFromHomeAction({
  route = "/",
  silent = false,
} = {}) {
  const targetRoute = safeText(route, "/");

  try {
    safeEmit("home:navigate", {
      route: targetRoute,
    });

    if (AppCore?.router?.navigate) {
      await AppCore.router.navigate(targetRoute);
      return true;
    }

    if (AppCore?.Router?.navigate) {
      await AppCore.Router.navigate(targetRoute);
      return true;
    }

    return true;
  } catch (error) {
    if (!silent) {
      showToast(
        "No se pudo navegar desde Home.",
        "error"
      );
    }

    return false;
  }
}

export async function runHomeQuickAction({
  action = "",
  route = "",
  payload = {},
  silent = false,
} = {}) {
  const actionName = safeText(action, "");
  const targetRoute = safeText(route, "");

  if (!actionName && !targetRoute) {
    if (!silent) {
      showToast("Acción inválida.", "error");
    }
    return false;
  }

  try {
    safeEmit("home:quick-action", {
      action: actionName,
      route: targetRoute,
      payload: safeObject(payload),
    });

    if (targetRoute) {
      return await navigateFromHomeAction({
        route: targetRoute,
        silent,
      });
    }

    return true;
  } catch (error) {
    if (!silent) {
      showToast(
        "No se pudo ejecutar la acción rápida.",
        "error"
      );
    }

    return false;
  }
}

/* =========================================================
   CREATE SHORTCUT
========================================================= */

export async function createFromHomeAction({
  route = "/incidencias/nueva",
  fallbackEvent = "home:create",
  silent = false,
} = {}) {
  const targetRoute = safeText(route, "/incidencias/nueva");

  try {
    safeEmit(fallbackEvent, {
      route: targetRoute,
    });

    if (AppCore?.router?.navigate) {
      await AppCore.router.navigate(targetRoute);
      return true;
    }

    if (AppCore?.Router?.navigate) {
      await AppCore.Router.navigate(targetRoute);
      return true;
    }

    return true;
  } catch (error) {
    if (!silent) {
      showToast(
        "No se pudo abrir el flujo de creación.",
        "error"
      );
    }

    return false;
  }
}

/* =========================================================
   DETAIL HELPERS EXPORT
========================================================= */

export {
  getWidgetId as getHomeWidgetIdAction,
  getWidgetTitle as getHomeWidgetTitleAction,
  getWidgetDescription as getHomeWidgetDescriptionAction,
  getWidgetType as getHomeWidgetTypeAction,
  getWidgetValue as getHomeWidgetValueAction,
  getWidgetTrend as getHomeWidgetTrendAction,
  getWidgetStatus as getHomeWidgetStatusAction,
  getWidgetRoute as getHomeWidgetRouteAction,
  getWidgetCreatedAt as getHomeWidgetCreatedAtAction,
  getWidgetUpdatedAt as getHomeWidgetUpdatedAtAction,
  getWidgetItems as getHomeWidgetItemsAction,
  normalizeWidgetDetail as normalizeHomeWidgetDetailAction,
  normalizeDashboardSnapshot as normalizeHomeDashboardAction,
};
