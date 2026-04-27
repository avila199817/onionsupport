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
   - navegación SPA con fallback seguro
   - browser guards para clipboard/download
   - eventos opcionales vía AppCore.events
   - normalización estable de dashboard/widgets
   - default export completo
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
  safeArray,
  safeObject,
  showToast,
} from "./home.utils.js";

/* =========================================================
   CONSTANTS
========================================================= */

const CSV_FILENAME = "home-export.csv";

const CSV_MIME_TYPE = "text/csv;charset=utf-8;";

/* =========================================================
   BASIC HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isFn(value) {
  return typeof value === "function";
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    return value;
  }

  return null;
}

function safeEmit(eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  try {
    AppCore?.events?.emit?.(name, payload);
    return true;
  } catch {}

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );

      return true;
    }
  } catch {}

  return false;
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[HomeActions]", ...args);
  } catch {}

  try {
    console.warn("[HomeActions]", ...args);
  } catch {}
}

function normalizeWidgetId(value = "") {
  return safeText(value, "");
}

function normalizeFilename(value = "", fallback = CSV_FILENAME) {
  const name = safeText(value, fallback)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();

  if (!name) {
    return fallback;
  }

  return name.toLowerCase().endsWith(".csv")
    ? name
    : `${name}.csv`;
}

/* =========================================================
   PAYLOAD DETECTION
========================================================= */

function isLikelyWidget(value) {
  if (!isObject(value)) {
    return false;
  }

  return Boolean(
    value.widgetId ||
      value.id ||
      value.key ||
      value.slug ||
      value.code ||
      value.title ||
      value.name ||
      value.label ||
      value.heading
  );
}

function isLikelyDashboard(value) {
  if (!isObject(value)) {
    return false;
  }

  return Boolean(
    Array.isArray(value.widgets) ||
      Array.isArray(value.cards) ||
      Array.isArray(value.kpis) ||
      Array.isArray(value.items) ||
      Array.isArray(value.recent) ||
      Array.isArray(value.recentActivity) ||
      Array.isArray(value.activity) ||
      Array.isArray(value.timeline) ||
      isObject(value.summary) ||
      isObject(value.stats) ||
      isObject(value.metrics) ||
      isObject(value.totals)
  );
}

function looksLikeEnvelope(value) {
  const obj = safeObject(value);

  return Boolean(
    obj.dashboard !== undefined ||
      obj.widget !== undefined ||
      obj.item !== undefined ||
      obj.data !== undefined ||
      obj.result !== undefined ||
      obj.payload !== undefined ||
      obj.body !== undefined ||
      obj.response !== undefined
  );
}

function pickDashboard(payload = null) {
  if (!payload) {
    return null;
  }

  if (isLikelyDashboard(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  const candidates = [
    obj.dashboard,
    obj.data,
    obj.result,
    obj.payload,
    obj.body,
    obj.response,
    obj?.data?.dashboard,
    obj?.data?.result,
    obj?.data?.payload,
    obj?.payload?.dashboard,
    obj?.result?.dashboard,
  ];

  for (const candidate of candidates) {
    if (isLikelyDashboard(candidate)) {
      return candidate;
    }
  }

  for (const candidate of candidates) {
    if (looksLikeEnvelope(candidate)) {
      const nested = pickDashboard(candidate);

      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function pickWidget(payload = null) {
  if (!payload) {
    return null;
  }

  if (isLikelyWidget(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  const candidates = [
    obj.widget,
    obj.item,
    obj.data,
    obj.result,
    obj.payload,
    obj.body,
    obj.response,
    obj?.data?.widget,
    obj?.data?.item,
    obj?.data?.result,
    obj?.data?.payload,
    obj?.payload?.widget,
    obj?.result?.widget,
  ];

  for (const candidate of candidates) {
    if (isLikelyWidget(candidate)) {
      return candidate;
    }
  }

  for (const candidate of candidates) {
    if (looksLikeEnvelope(candidate)) {
      const nested = pickWidget(candidate);

      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

/* =========================================================
   WIDGET NORMALIZATION
========================================================= */

function getWidgetId(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.widgetId,
      raw.id,
      raw.key,
      raw.slug,
      raw.code
    ),
    ""
  );
}

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
    "Sin descripción."
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
    raw.metric
  );
}

function getWidgetTrend(item = {}) {
  const raw = safeObject(item);

  return first(
    raw.trend,
    raw.delta,
    raw.change,
    raw.variation
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

  return safeText(
    first(
      raw.route,
      raw.href,
      raw.link,
      raw.to
    ),
    ""
  );
}

function getWidgetCreatedAt(item = {}) {
  const raw = safeObject(item);

  return first(
    raw.createdAt,
    raw.fechaCreacion,
    raw.date
  );
}

function getWidgetUpdatedAt(item = {}) {
  const raw = safeObject(item);

  return first(
    raw.updatedAt,
    raw.lastUpdate,
    raw.modifiedAt,
    raw.createdAt
  );
}

function getWidgetItems(item = {}) {
  const raw = safeObject(item);

  return safeArray(
    first(
      raw.items,
      raw.rows,
      raw.list,
      raw.data
    )
  ).map((entry) => safeObject(entry));
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

/* =========================================================
   DASHBOARD NORMALIZATION
========================================================= */

function getDashboardSummary(dashboard = {}) {
  const raw = safeObject(dashboard);

  return safeObject(
    first(
      raw.summary,
      raw.stats,
      raw.metrics,
      raw.totals
    )
  );
}

function getDashboardWidgets(dashboard = {}) {
  const raw = safeObject(dashboard);

  return safeArray(
    first(
      raw.widgets,
      raw.cards,
      raw.kpis,
      raw.items
    )
  )
    .map((item) => safeObject(item))
    .filter((item) => isLikelyWidget(item))
    .map((item) => normalizeWidgetDetail(item));
}

function getDashboardRecent(dashboard = {}) {
  const raw = safeObject(dashboard);

  return safeArray(
    first(
      raw.recent,
      raw.recentActivity,
      raw.activity,
      raw.timeline
    )
  ).map((item) => safeObject(item));
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

/* =========================================================
   CSV
========================================================= */

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

  const rows = safeArray(items)
    .map((item) => safeObject(item))
    .filter((item) => isLikelyWidget(item))
    .map((item) => [
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

function downloadTextFile({
  filename = CSV_FILENAME,
  content = "",
  mimeType = "text/plain;charset=utf-8;",
} = {}) {
  if (!isBrowser()) {
    return false;
  }

  let url = "";

  try {
    const blob = new Blob([String(content || "")], {
      type: mimeType,
    });

    url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = normalizeFilename(filename, CSV_FILENAME);
    anchor.rel = "noopener";

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }, 0);

    return true;
  } catch (error) {
    try {
      if (url) {
        URL.revokeObjectURL(url);
      }
    } catch {}

    safeWarn("downloadTextFile falló.", error);

    return false;
  }
}

/* =========================================================
   CLIPBOARD
========================================================= */

async function writeClipboardText(text = "") {
  const value = safeText(text, "");

  if (!value || !isBrowser()) {
    return false;
  }

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
    textarea.setAttribute("aria-hidden", "true");

    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
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

/* =========================================================
   TOAST BRIDGE
========================================================= */

function notify(message = "", type = "info", options = {}) {
  const text = safeText(message, "");

  if (!text) {
    return null;
  }

  try {
    return showToast(text, type, options);
  } catch {}

  try {
    return showToast({
      message: text,
      type,
      ...safeObject(options),
    });
  } catch {}

  return null;
}

/* =========================================================
   DASHBOARD ACTIONS
========================================================= */

export function getHomeDashboardFromStoreAction() {
  try {
    const snapshot = getHomeDashboardStore();
    const picked = pickDashboard(snapshot);

    if (!picked) {
      return null;
    }

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

    const normalized = normalizeDashboardSnapshot(snapshot);

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
      notify(
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

  if (!id) {
    return null;
  }

  try {
    const detail = getHomeWidgetByIdStore(id);
    const picked = pickWidget(detail);

    if (!picked) {
      return null;
    }

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
      notify("No se pudo resolver el bloque.", "error");
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

    const response = await getHomeWidgetByIdRequest(id);
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
      notify(
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
      notify("Bloque inválido.", "error");
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
      notify("No hay ID para copiar.", "error");
    }

    return false;
  }

  const copied = await writeClipboardText(id);

  if (!copied) {
    if (!silent) {
      notify("No se pudo copiar el ID.", "error");
    }

    return false;
  }

  safeEmit("home:widget:copy-id", {
    widgetId: id,
  });

  if (!silent) {
    notify("ID copiado", "success");
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

  const list = safeArray(sourceItems)
    .map((item) => safeObject(item))
    .filter((item) => isLikelyWidget(item));

  if (!list.length) {
    if (!silent) {
      notify("No hay datos para exportar.", "info");
    }

    return false;
  }

  try {
    const finalFilename = normalizeFilename(filename, CSV_FILENAME);

    const csv = buildCsvRows(list);

    const downloaded = downloadTextFile({
      filename: finalFilename,
      content: csv,
      mimeType: CSV_MIME_TYPE,
    });

    if (!downloaded) {
      throw new Error("CSV_DOWNLOAD_FAILED");
    }

    safeEmit("home:export:csv", {
      total: list.length,
      filename: finalFilename,
    });

    if (!silent) {
      notify("CSV exportado", "success");
    }

    return true;
  } catch (error) {
    safeEmit("home:export:error", {
      type: "csv",
      error,
    });

    if (!silent) {
      notify("No se pudo exportar el CSV.", "error");
    }

    return false;
  }
}

/* =========================================================
   NAVIGATION
========================================================= */

async function navigateSpa(targetRoute = "/", options = {}) {
  const route = safeText(targetRoute, "/") || "/";

  const routerCandidates = [
    AppCore?.router,
    AppCore?.Router,
    AppCore?.modules?.Router,
    AppCore?.modules?.router,
  ];

  for (const router of routerCandidates) {
    try {
      if (isFn(router?.navigate)) {
        await router.navigate(route, options);
        return true;
      }

      if (isFn(router?.replace) && options.replaceState === true) {
        await router.replace(route, options);
        return true;
      }

      if (isFn(router?.go)) {
        await router.go(route, options);
        return true;
      }

      if (isFn(router?.push)) {
        await router.push(route, options);
        return true;
      }
    } catch (error) {
      safeWarn("Router navigation candidate falló.", error);
    }
  }

  try {
    if (isFn(AppCore?.navigate)) {
      await AppCore.navigate(route, options);
      return true;
    }
  } catch {}

  if (!isBrowser()) {
    return false;
  }

  try {
    window.history.pushState({}, "", route);
    window.dispatchEvent(new PopStateEvent("popstate"));
    return true;
  } catch {}

  try {
    window.location.assign(route);
    return true;
  } catch {}

  return false;
}

export async function navigateFromHomeAction({
  route = "/",
  silent = false,
  replaceState = false,
} = {}) {
  const targetRoute = safeText(route, "/") || "/";

  try {
    safeEmit("home:navigate", {
      route: targetRoute,
      replaceState: Boolean(replaceState),
    });

    const ok = await navigateSpa(targetRoute, {
      source: "home",
      replaceState: Boolean(replaceState),
    });

    if (!ok) {
      throw new Error("HOME_NAVIGATION_FAILED");
    }

    return true;
  } catch (error) {
    safeEmit("home:navigate:error", {
      route: targetRoute,
      error,
    });

    if (!silent) {
      notify(
        "No se pudo navegar desde Home.",
        "error"
      );
    }

    return false;
  }
}

/* =========================================================
   QUICK ACTIONS
========================================================= */

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
      notify("Acción inválida.", "error");
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
    safeEmit("home:quick-action:error", {
      action: actionName,
      route: targetRoute,
      error,
    });

    if (!silent) {
      notify(
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

    return await navigateFromHomeAction({
      route: targetRoute,
      silent,
    });
  } catch (error) {
    safeEmit("home:create:error", {
      route: targetRoute,
      error,
    });

    if (!silent) {
      notify(
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

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
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

  getHomeWidgetIdAction: getWidgetId,
  getHomeWidgetTitleAction: getWidgetTitle,
  getHomeWidgetDescriptionAction: getWidgetDescription,
  getHomeWidgetTypeAction: getWidgetType,
  getHomeWidgetValueAction: getWidgetValue,
  getHomeWidgetTrendAction: getWidgetTrend,
  getHomeWidgetStatusAction: getWidgetStatus,
  getHomeWidgetRouteAction: getWidgetRoute,
  getHomeWidgetCreatedAtAction: getWidgetCreatedAt,
  getHomeWidgetUpdatedAtAction: getWidgetUpdatedAt,
  getHomeWidgetItemsAction: getWidgetItems,

  normalizeHomeWidgetDetailAction: normalizeWidgetDetail,
  normalizeHomeDashboardAction: normalizeDashboardSnapshot,
};
