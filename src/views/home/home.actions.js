/* =========================================================
   Onion SPA - Home Actions
   Archivo: src/views/home/home.actions.js

   ONION SUPPORT · HOME ACTIONS
   FINAL PRO SYSTEM · API FIRST · STORE FALLBACK · 10/10

   RESPONSABILIDADES:
   - centralizar acciones operativas del módulo Home
   - resolver dashboard desde store + backend
   - resolver detalle de widget/bloque desde store + backend
   - normalizar dashboard/widgets/colecciones heterogéneas
   - copiar IDs de widgets/bloques con clipboard robusto
   - exportar widgets/colecciones a CSV
   - ejecutar navegación SPA con fallback seguro
   - ejecutar quick actions desacopladas de la vista
   - desacoplar homeView.js de lógica operativa
   - mantener compatibilidad con AppCore, Router y eventos globales

   HARDENING EXTREMO:
   - tolerancia a envelopes backend profundos
   - fallback store -> backend -> payload local
   - eventos saneados sin tokens/secretos
   - clipboard con fallback legacy sin CSS inline
   - CSV con BOM UTF-8 y escape correcto
   - navegación SPA con Router/AppCore/history/location
   - browser guards para clipboard/download
   - no CSS inline
   - no Object.assign(style)
   - no throws accidentales en acciones públicas
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
   VERSION / CONSTANTS
========================================================= */

const HOME_ACTIONS_VERSION = "11.0.0-extreme";

const SOURCE = "views:home:home.actions";

const CSV_FILENAME = "home-export.csv";
const CSV_MIME_TYPE = "text/csv;charset=utf-8;";

const DEFAULT_HOME_ROUTE = "/";
const DEFAULT_CREATE_ROUTE = "/incidencias/nueva";

const ROUTE_ALIASES = Object.freeze({
  "/home": "/",
  "/dashboard": "/",

  "/tickets": "/incidencias",
  "/ticket": "/incidencias",
  "/incidents": "/incidencias",
  "/incident": "/incidencias",
  "/issues": "/incidencias",
  "/issue": "/incidencias",

  "/invoices": "/facturas",
  "/invoice": "/facturas",
  "/billing": "/facturas",
  "/bills": "/facturas",
  "/bill": "/facturas",

  "/users": "/usuarios",
  "/user": "/usuarios",
  "/members": "/usuarios",
  "/member": "/usuarios",

  "/clients": "/clientes",
  "/client": "/clientes",
  "/customers": "/clientes",
  "/customer": "/clientes",

  "/account": "/cuenta",
  "/profile": "/cuenta",

  "/settings": "/ajustes",
});

const DASHBOARD_OBJECT_KEYS = Object.freeze([
  "dashboard",
  "home",
  "data",
  "result",
  "payload",
  "body",
  "response",
  "content",
]);

const WIDGET_OBJECT_KEYS = Object.freeze([
  "widget",
  "block",
  "card",
  "kpi",
  "item",
  "detail",
  "data",
  "result",
  "payload",
  "body",
  "response",
  "content",
]);

const COLLECTION_KEYS = Object.freeze([
  "items",
  "rows",
  "data",
  "results",
  "records",
  "value",
  "docs",
  "documents",
  "collection",
  "list",
]);

const DASHBOARD_COLLECTION_KEYS = Object.freeze([
  "widgets",
  "cards",
  "kpis",
  "blocks",
  "items",

  "tickets",
  "incidencias",
  "supportTickets",
  "issues",

  "facturas",
  "invoices",
  "billing",
  "bills",

  "users",
  "usuarios",
  "members",

  "clients",
  "clientes",
  "customers",

  "recent",
  "recentActivity",
  "activity",
  "activities",
  "timeline",
]);

const SENSITIVE_EVENT_KEYS = Object.freeze([
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "idToken",
  "id_token",
  "tempToken",
  "temp_token",
  "password",
  "secret",
  "authorization",
  "credential",
  "credentials",
]);

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

    if (isObject(value) && Object.keys(value).length === 0) {
      continue;
    }

    return value;
  }

  return null;
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "string") {
    let normalized = value
      .trim()
      .replace(/€/g, "")
      .replace(/\$/g, "")
      .replace(/£/g, "")
      .replace(/%/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s/g, "");

    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
      const lastComma = normalized.lastIndexOf(",");
      const lastDot = normalized.lastIndexOf(".");

      normalized =
        lastComma > lastDot
          ? normalized.replace(/\./g, "").replace(/,/g, ".")
          : normalized.replace(/,/g, "");
    } else if (hasComma) {
      normalized = normalized.replace(/,/g, ".");
    }

    const parsed = Number(normalized);

    return Number.isFinite(parsed)
      ? parsed
      : fallback;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
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

function uniqueBy(items = [], picker = (item) => item) {
  const output = [];
  const seen = new Set();

  safeArray(items).forEach((item) => {
    const key = safeText(picker(item), "");

    if (!key) {
      output.push(item);
      return;
    }

    const normalized = normalizeKey(key);

    if (seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    output.push(item);
  });

  return output;
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return String(Date.now());
  }
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[HomeActions]", ...args);
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.warn("[HomeActions]", ...args);
    }
  } catch {}
}

function safeLog(...args) {
  try {
    AppCore?.utils?.log?.("[HomeActions]", ...args);
  } catch {}
}

/* =========================================================
   SANITIZE / EVENTS
========================================================= */

function redactTokenInText(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  try {
    if (isFn(AppCore?.utils?.redactTokenInText)) {
      return AppCore.utils.redactTokenInText(raw);
    }
  } catch {}

  let output = raw;

  try {
    output = output.replace(
      /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|tempToken|temp_token|code|t)=)([^&#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(\/activate-account\/)([^/?#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    );
  } catch {}

  return output;
}

function sanitizeEventPayload(value, depth = 0) {
  if (depth > 6) {
    return "[MaxDepth]";
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return redactTokenInText(value);
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (value instanceof Error) {
    return {
      name: safeText(value.name, "Error"),
      message: redactTokenInText(safeText(value.message, "")),
      code: value.code || null,
      status: value.status || value.statusCode || null,
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 80)
      .map((item) => sanitizeEventPayload(item, depth + 1));
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (
        SENSITIVE_EVENT_KEYS.includes(key) ||
        /token|secret|password|authorization|credential/i.test(key)
      ) {
        output[key] = item ? "***" : null;
        continue;
      }

      output[key] = sanitizeEventPayload(item, depth + 1);
    }

    return output;
  }

  return String(value);
}

function safeEmit(eventName = "", payload = {}, options = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  const cleanPayload = sanitizeEventPayload({
    source: SOURCE,
    ...safeObject(payload),
  });

  const opts = safeObject(options);

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFn(AppCore?.events?.emit)) {
      busAvailable = true;
      AppCore.events.emit(name, cleanPayload);
      busEmitted = true;
    }
  } catch {}

  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: cleanPayload,
        })
      );

      return true;
    } catch {}
  }

  return busEmitted;
}

/* =========================================================
   TOAST BRIDGE
========================================================= */

function normalizeToastArgs(messageOrPayload = "", type = "info", options = {}) {
  if (isObject(messageOrPayload)) {
    const payload = safeObject(messageOrPayload);

    return {
      message: safeText(
        first(
          payload.message,
          payload.text,
          payload.title,
          ""
        ),
        ""
      ),
      type: safeText(payload.type || type, "info"),
      options: {
        ...safeObject(options),
        ...payload,
      },
    };
  }

  return {
    message: safeText(messageOrPayload, ""),
    type: safeText(type, "info"),
    options: safeObject(options),
  };
}

function notify(messageOrPayload = "", type = "info", options = {}) {
  const normalized = normalizeToastArgs(messageOrPayload, type, options);

  if (!normalized.message) {
    return null;
  }

  try {
    if (isFn(AppCore?.showToast)) {
      return AppCore.showToast(
        normalized.message,
        normalized.type,
        normalized.options
      );
    }
  } catch {}

  try {
    return showToast(
      normalized.message,
      normalized.type,
      normalized.options
    );
  } catch {}

  try {
    return showToast({
      ...normalized.options,
      message: normalized.message,
      type: normalized.type,
    });
  } catch {}

  safeEmit(`toast:${normalizeKey(normalized.type) || "info"}`, {
    message: normalized.message,
    type: normalized.type,
    ...normalized.options,
  });

  return null;
}

/* =========================================================
   ENVELOPE / COLLECTION HELPERS
========================================================= */

function unwrapEnvelope(value = null, keys = [], depth = 0) {
  if (value === null || value === undefined) {
    return null;
  }

  if (depth > 12) {
    return value;
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (!isObject(value)) {
    return value;
  }

  for (const key of keys) {
    const candidate = value[key];

    if (candidate !== undefined && candidate !== null) {
      return unwrapEnvelope(candidate, keys, depth + 1);
    }
  }

  if (isObject(value.response?.data)) {
    return unwrapEnvelope(value.response.data, keys, depth + 1);
  }

  return value;
}

function collectObjects(value = null, keys = [], depth = 0, seen = new Set()) {
  if (depth > 10) {
    return [];
  }

  if (!isObject(value) || seen.has(value)) {
    return [];
  }

  seen.add(value);

  const output = [value];

  for (const key of keys) {
    const candidate = value[key];

    if (isObject(candidate)) {
      output.push(
        ...collectObjects(candidate, keys, depth + 1, seen)
      );
    }
  }

  if (isObject(value.response?.data)) {
    output.push(
      ...collectObjects(value.response.data, keys, depth + 1, seen)
    );
  }

  return output;
}

function pickObjectByKeys(payload = null, keys = [], predicate = null) {
  if (!payload) {
    return null;
  }

  if (
    isObject(payload) &&
    (!predicate || predicate(payload))
  ) {
    return payload;
  }

  const objects = collectObjects(payload, keys);

  for (const object of objects) {
    if (predicate && predicate(object)) {
      return object;
    }
  }

  for (const object of objects) {
    for (const key of keys) {
      const candidate = object[key];

      if (
        isObject(candidate) &&
        (!predicate || predicate(candidate))
      ) {
        return candidate;
      }
    }
  }

  return null;
}

function unwrapCollectionPayload(value = null, depth = 0) {
  if (value === null || value === undefined) {
    return {};
  }

  if (depth > 10) {
    return value;
  }

  if (Array.isArray(value)) {
    return {
      items: value,
      total: value.length,
      count: value.length,
    };
  }

  const object = safeObject(value);

  if (!Object.keys(object).length) {
    return {};
  }

  for (const key of COLLECTION_KEYS) {
    if (Array.isArray(object[key])) {
      return object;
    }
  }

  for (const key of DASHBOARD_COLLECTION_KEYS) {
    if (Array.isArray(object[key])) {
      return {
        ...object,
        items: object[key],
      };
    }
  }

  const nested = first(
    object.payload,
    object.result,
    object.response,
    object.body,
    object.content,
    object.data
  );

  if (
    isObject(nested) ||
    Array.isArray(nested)
  ) {
    return unwrapCollectionPayload(nested, depth + 1);
  }

  return object;
}

function normalizeCollection(value = null) {
  if (Array.isArray(value)) {
    return value;
  }

  const object = safeObject(
    unwrapCollectionPayload(value)
  );

  for (const key of COLLECTION_KEYS) {
    if (Array.isArray(object[key])) {
      return object[key];
    }
  }

  return [];
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
      value.widget_id ||
      value.id ||
      value.key ||
      value.slug ||
      value.code ||
      value.title ||
      value.name ||
      value.label ||
      value.heading ||
      value.metric ||
      value.value !== undefined ||
      value.total !== undefined ||
      value.count !== undefined
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
      Array.isArray(value.blocks) ||
      Array.isArray(value.items) ||
      Array.isArray(value.recent) ||
      Array.isArray(value.recentActivity) ||
      Array.isArray(value.activity) ||
      Array.isArray(value.timeline) ||
      Array.isArray(value.tickets) ||
      Array.isArray(value.incidencias) ||
      Array.isArray(value.facturas) ||
      Array.isArray(value.invoices) ||
      Array.isArray(value.users) ||
      Array.isArray(value.usuarios) ||
      Array.isArray(value.clients) ||
      Array.isArray(value.clientes) ||
      isObject(value.summary) ||
      isObject(value.stats) ||
      isObject(value.metrics) ||
      isObject(value.totals) ||
      isObject(value.counts)
  );
}

function pickDashboard(payload = null) {
  const direct = pickObjectByKeys(
    payload,
    DASHBOARD_OBJECT_KEYS,
    isLikelyDashboard
  );

  if (direct) {
    return direct;
  }

  const unwrapped = unwrapEnvelope(payload, DASHBOARD_OBJECT_KEYS);

  return isLikelyDashboard(unwrapped)
    ? unwrapped
    : null;
}

function pickWidget(payload = null) {
  const direct = pickObjectByKeys(
    payload,
    WIDGET_OBJECT_KEYS,
    isLikelyWidget
  );

  if (direct) {
    return direct;
  }

  const unwrapped = unwrapEnvelope(payload, WIDGET_OBJECT_KEYS);

  return isLikelyWidget(unwrapped)
    ? unwrapped
    : null;
}

/* =========================================================
   WIDGET NORMALIZATION
========================================================= */

function getWidgetId(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.widgetId,
      raw.widget_id,
      raw.id,
      raw._id,
      raw.key,
      raw.slug,
      raw.code,
      raw.name
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
      raw.heading,
      raw.caption,
      raw.text
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
      raw.subTitle,
      raw.summary,
      raw.detail,
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
      raw.category,
      raw.scope
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
    raw.number,
    raw.current,
    raw.data?.value,
    raw.data?.total,
    raw.data?.count
  );
}

function getWidgetTrend(item = {}) {
  const raw = safeObject(item);

  return first(
    raw.trend,
    raw.delta,
    raw.change,
    raw.variation,
    raw.diff,
    raw.growth
  );
}

function getWidgetStatus(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.status,
      raw.estado,
      raw.state,
      raw.health
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
      raw.to,
      raw.path,
      raw.url
    ),
    ""
  );
}

function getWidgetCreatedAt(item = {}) {
  const raw = safeObject(item);

  return first(
    raw.createdAt,
    raw.created_at,
    raw.fechaCreacion,
    raw.date
  );
}

function getWidgetUpdatedAt(item = {}) {
  const raw = safeObject(item);

  return first(
    raw.updatedAt,
    raw.updated_at,
    raw.lastUpdate,
    raw.lastUpdatedAt,
    raw.modifiedAt,
    raw.createdAt
  );
}

function getWidgetItems(item = {}) {
  const raw = safeObject(item);

  return normalizeCollection(
    first(
      raw.items,
      raw.rows,
      raw.list,
      raw.data,
      raw.collection,
      []
    )
  ).map((entry) => safeObject(entry));
}

function normalizeWidgetDetail(detail = {}) {
  const raw = safeObject(detail);

  const widgetId = getWidgetId(raw);

  return {
    ...raw,

    widgetId,
    id: raw.id || widgetId || null,
    key: raw.key || widgetId || null,

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
      raw.totals,
      raw.counts,
      {}
    )
  );
}

function getDashboardWidgets(dashboard = {}) {
  const raw = safeObject(dashboard);

  return normalizeCollection(
    first(
      raw.widgets,
      raw.cards,
      raw.kpis,
      raw.blocks,
      raw.items,
      []
    )
  )
    .map((item) => safeObject(item))
    .filter((item) => isLikelyWidget(item))
    .map((item) => normalizeWidgetDetail(item));
}

function getDashboardRecent(dashboard = {}) {
  const raw = safeObject(dashboard);

  return normalizeCollection(
    first(
      raw.recent,
      raw.recentActivity,
      raw.activity,
      raw.activities,
      raw.timeline,
      []
    )
  ).map((item) => safeObject(item));
}

function normalizeDashboardSnapshot(snapshot = {}) {
  const raw = safeObject(snapshot);

  const summary = getDashboardSummary(raw);
  const widgets = getDashboardWidgets(raw);
  const recent = getDashboardRecent(raw);

  return {
    ...raw,

    summary,
    stats: safeObject(raw.stats, summary),
    metrics: safeObject(raw.metrics, summary),
    totals: safeObject(raw.totals, summary),
    counts: safeObject(raw.counts, summary),

    widgets,
    cards: widgets,
    kpis: widgets,

    recent,
    recentActivity: recent,
    activity: recent,

    updatedAt: first(
      raw.updatedAt,
      raw.updated_at,
      raw.lastUpdate,
      raw.generatedAt,
      raw.createdAt,
      nowIso()
    ),
  };
}

/* =========================================================
   DASHBOARD ACTIONS
========================================================= */

export function getHomeDashboardFromStoreAction() {
  try {
    const snapshot = getHomeDashboardStore?.();
    const picked = pickDashboard(snapshot);

    if (!picked) {
      return null;
    }

    return normalizeDashboardSnapshot(picked);
  } catch (error) {
    safeWarn("getHomeDashboardFromStoreAction falló.", error);
    return null;
  }
}

export async function getHomeDashboardAction({
  preferFresh = true,
  silent = false,
  payload = null,
} = {}) {
  const fallbackStoreSnapshot = getHomeDashboardFromStoreAction();

  if (payload) {
    const pickedPayload = pickDashboard(payload);

    if (pickedPayload) {
      return normalizeDashboardSnapshot(pickedPayload);
    }
  }

  if (!preferFresh && fallbackStoreSnapshot) {
    return fallbackStoreSnapshot;
  }

  try {
    safeEmit("home:dashboard:request", {
      source: "backend",
    });

    const response = await getHomeDashboardRequest?.();
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

function normalizeWidgetId(value = "") {
  return safeText(value, "");
}

export function getHomeWidgetDetailFromStoreAction({
  widgetId = "",
} = {}) {
  const id = normalizeWidgetId(widgetId);

  if (!id) {
    return null;
  }

  try {
    const detail = getHomeWidgetByIdStore?.(id);
    const picked = pickWidget(detail);

    if (!picked) {
      return null;
    }

    return normalizeWidgetDetail(picked);
  } catch (error) {
    safeWarn("getHomeWidgetDetailFromStoreAction falló.", error);
    return null;
  }
}

export async function getHomeWidgetDetailAction({
  widgetId = "",
  preferFresh = true,
  silent = false,
  payload = null,
} = {}) {
  const id = normalizeWidgetId(widgetId);

  if (!id && !payload) {
    if (!silent) {
      notify("No se pudo resolver el bloque.", "error");
    }

    return null;
  }

  if (payload) {
    const pickedPayload = pickWidget(payload);

    if (pickedPayload) {
      return normalizeWidgetDetail(pickedPayload);
    }
  }

  const fallbackStoreDetail = id
    ? getHomeWidgetDetailFromStoreAction({ widgetId: id })
    : null;

  if (!preferFresh && fallbackStoreDetail) {
    return fallbackStoreDetail;
  }

  try {
    safeEmit("home:widget:detail:request", {
      widgetId: id,
      source: "backend",
    });

    const response = await getHomeWidgetByIdRequest?.(id);
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
  payload = null,
} = {}) {
  const id = normalizeWidgetId(widgetId || getWidgetId(payload || {}));

  if (!id && !payload) {
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
    payload,
  });

  if (!detail) {
    return null;
  }

  safeEmit("home:widget:open:success", {
    widgetId: id || detail.widgetId,
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

  /*
    Fallback legacy sin style inline.
    Requiere que el sistema global tenga .sr-only o clase equivalente.
    Si no existe, sigue funcionando: textarea queda en DOM sólo durante copy.
  */
  let textarea = null;

  try {
    textarea = document.createElement("textarea");

    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.setAttribute("aria-hidden", "true");
    textarea.setAttribute("tabindex", "-1");
    textarea.className = "sr-only home-clipboard-fallback";

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
    } catch {}

    return false;
  }
}

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
   CSV
========================================================= */

function normalizeFilename(value = "", fallback = CSV_FILENAME) {
  const name = safeText(value, fallback)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();

  if (!name) {
    return fallback;
  }

  return name.toLowerCase().endsWith(".csv")
    ? name
    : `${name}.csv`;
}

function escapeCsvCell(value = "") {
  const text =
    value === null || value === undefined
      ? ""
      : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

function getPlainValueForCsv(value) {
  if (value === null || value === undefined) {
    return "";
  }

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

function buildGenericCsvRows(items = [], columns = []) {
  const list = safeArray(items).map((item) => safeObject(item));

  const finalColumns = safeArray(columns).length
    ? safeArray(columns)
    : Array.from(
        new Set(
          list.flatMap((item) => Object.keys(item || {}))
        )
      ).slice(0, 40);

  if (!finalColumns.length) {
    return "";
  }

  return [
    finalColumns.map(escapeCsvCell).join(","),
    ...list.map((item) =>
      finalColumns
        .map((key) => escapeCsvCell(getPlainValueForCsv(item?.[key])))
        .join(",")
    ),
  ].join("\n");
}

function buildWidgetCsvRows(items = []) {
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
    anchor.className = "sr-only home-download-link";
    anchor.setAttribute("aria-hidden", "true");
    anchor.setAttribute("tabindex", "-1");

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

function resolveExportItems(items = null) {
  if (Array.isArray(items)) {
    return items;
  }

  try {
    return safeArray(getHomeSortedCollectionStore?.());
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
  const list = resolveExportItems(items)
    .map((item) => safeObject(item))
    .filter((item) => Object.keys(item).length);

  if (!list.length) {
    if (!silent) {
      notify("No hay datos para exportar.", "info");
    }

    return false;
  }

  try {
    const finalFilename = normalizeFilename(filename, CSV_FILENAME);
    const normalizedMode = normalizeKey(mode);

    const csvBody =
      normalizedMode === "generic" || normalizedMode === "collection"
        ? buildGenericCsvRows(list, columns)
        : buildWidgetCsvRows(list);

    const csv = `\uFEFF${csvBody}`;

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
      mode: normalizedMode || "widgets",
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

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

function isUnsafeRoute(value = "") {
  const raw = safeText(value, "").toLowerCase();

  return Boolean(
    raw.startsWith("javascript:") ||
      raw.startsWith("data:") ||
      raw.startsWith("vbscript:")
  );
}

function normalizePathnameOnly(pathname = DEFAULT_HOME_ROUTE) {
  let value = safeText(pathname, DEFAULT_HOME_ROUTE)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) {
    value = DEFAULT_HOME_ROUTE;
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || DEFAULT_HOME_ROUTE;
  }

  return value;
}

function normalizeSpaRoute(route = "") {
  const raw = safeText(route, "");

  if (!raw || isUnsafeRoute(raw)) {
    return "";
  }

  if (/^mailto:|^tel:/i.test(raw)) {
    return raw;
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw, getBaseOrigin());

      if (
        isBrowser() &&
        url.origin !== window.location.origin
      ) {
        return raw;
      }

      return normalizeSpaRoute(
        `${url.pathname}${url.search || ""}${url.hash || ""}`
      );
    } catch {
      return "";
    }
  }

  const normalized = raw.startsWith("/")
    ? raw
    : `/${raw}`;

  const [pathWithMaybeQuery, hash = ""] = normalized.split("#");
  const [path, query = ""] = pathWithMaybeQuery.split("?");

  const cleanPath = normalizePathnameOnly(path || DEFAULT_HOME_ROUTE);
  const mappedPath = ROUTE_ALIASES[cleanPath] || cleanPath;

  return [
    mappedPath,
    query ? `?${query}` : "",
    hash ? `#${hash}` : "",
  ].join("");
}

function getRouterCandidates() {
  const candidates = [];

  try {
    if (isFn(AppCore?.modules?.get)) {
      candidates.push(AppCore.modules.get("router"));
      candidates.push(AppCore.modules.get("Router"));
    }
  } catch {}

  try {
    candidates.push(AppCore?.router);
    candidates.push(AppCore?.Router);
    candidates.push(AppCore?.modules?.router);
    candidates.push(AppCore?.modules?.Router);
  } catch {}

  try {
    if (isBrowser()) {
      candidates.push(window.Router);
      candidates.push(window.AppRouter);
      candidates.push(window.OnionRouter);
    }
  } catch {}

  return candidates.filter(Boolean);
}

async function navigateSpa(targetRoute = "/", options = {}) {
  const route = normalizeSpaRoute(targetRoute);

  if (!route) {
    return false;
  }

  const opts = {
    source: SOURCE,
    ...safeObject(options),
  };

  const isExternal = /^https?:\/\//i.test(route);

  if (!isExternal) {
    for (const router of getRouterCandidates()) {
      try {
        if (isFn(router?.navigate)) {
          await router.navigate(route, opts);
          return true;
        }

        if (
          isFn(router?.replace) &&
          opts.replaceState === true
        ) {
          await router.replace(route, opts);
          return true;
        }

        if (isFn(router?.go)) {
          await router.go(route, opts);
          return true;
        }

        if (isFn(router?.push)) {
          await router.push(route, opts);
          return true;
        }
      } catch (error) {
        safeWarn("Router navigation candidate falló.", error);
      }
    }

    try {
      if (isFn(AppCore?.navigate)) {
        await AppCore.navigate(route, opts);
        return true;
      }
    } catch {}
  }

  if (!isBrowser()) {
    return false;
  }

  try {
    if (!isExternal && route.startsWith("/")) {
      const method =
        opts.replaceState === true
          ? "replaceState"
          : "pushState";

      window.history[method]?.(
        {
          path: route,
          publicPath: route,
          source: SOURCE,
        },
        "",
        route
      );

      try {
        window.dispatchEvent(new PopStateEvent("popstate"));
      } catch {
        window.dispatchEvent(new Event("popstate"));
      }

      return true;
    }
  } catch {}

  try {
    window.location.assign(route);
    return true;
  } catch {}

  return false;
}

export async function navigateFromHomeAction({
  route = DEFAULT_HOME_ROUTE,
  silent = false,
  replaceState = false,
  payload = {},
} = {}) {
  const targetRoute = normalizeSpaRoute(route || DEFAULT_HOME_ROUTE);

  if (!targetRoute) {
    if (!silent) {
      notify("Ruta inválida.", "error");
    }

    return false;
  }

  try {
    safeEmit("home:navigate", {
      route: targetRoute,
      replaceState: Boolean(replaceState),
      payload: safeObject(payload),
    });

    const ok = await navigateSpa(targetRoute, {
      source: "home",
      replaceState: Boolean(replaceState),
      payload: safeObject(payload),
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
  const actionName = normalizeKey(action);
  const targetRoute = normalizeSpaRoute(route);
  const data = safeObject(payload);

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
      payload: data,
    });

    if (targetRoute) {
      return await navigateFromHomeAction({
        route: targetRoute,
        silent,
        payload: data,
      });
    }

    if (
      actionName === "refresh" ||
      actionName === "reload"
    ) {
      safeEmit("home:reload", {
        payload: data,
      });

      return true;
    }

    if (
      actionName === "create" ||
      actionName === "new" ||
      actionName === "create_ticket" ||
      actionName === "create_incidencia"
    ) {
      return createFromHomeAction({
        silent,
        payload: data,
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
  route = DEFAULT_CREATE_ROUTE,
  fallbackEvent = "home:create",
  silent = false,
  payload = {},
} = {}) {
  const targetRoute = normalizeSpaRoute(route || DEFAULT_CREATE_ROUTE);
  const data = safeObject(payload);

  try {
    safeEmit(fallbackEvent, {
      route: targetRoute,
      payload: data,
    });

    /*
      Primero evento para modal inline de Home/Incidencias.
      Si hay listeners, la vista puede abrir modal sin navegar.
    */
    safeEmit("incidencias:create-modal:open", {
      draft: data,
      source: SOURCE,
    });

    if (targetRoute) {
      return await navigateFromHomeAction({
        route: targetRoute,
        silent,
        payload: data,
      });
    }

    return true;
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
   SNAPSHOT / DEBUG
========================================================= */

export function getHomeActionsSnapshot() {
  return {
    version: HOME_ACTIONS_VERSION,
    source: SOURCE,

    hasAppCore: Boolean(AppCore),
    hasEvents: Boolean(AppCore?.events),
    hasApiClient: Boolean(AppCore?.apiClient || AppCore?.request),

    hasDashboardRequest: isFn(getHomeDashboardRequest),
    hasWidgetRequest: isFn(getHomeWidgetByIdRequest),

    hasDashboardStore: isFn(getHomeDashboardStore),
    hasWidgetStore: isFn(getHomeWidgetByIdStore),
    hasSortedCollectionStore: isFn(getHomeSortedCollectionStore),

    browser: isBrowser(),

    at: nowIso(),
  };
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
  normalizeSpaRoute as normalizeHomeRouteAction,
};

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
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
  normalizeHomeRouteAction: normalizeSpaRoute,

  getHomeActionsSnapshot,
  getDebugSnapshot: getHomeActionsSnapshot,
};
