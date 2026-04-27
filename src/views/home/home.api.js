/* =========================================================
   Onion SPA - Home API
   Archivo: src/views/home/home.api.js

   FINAL PRODUCTION API · HOME DASHBOARD · 10/10
   PATCH · DASHBOARD SUMMARY + COLLECTIONS NORMALIZED

   RESPONSABILIDADES:
   - centralizar llamadas HTTP del módulo home
   - cargar dashboard summary desde /api/dashboard/summary
   - fallback legacy controlado a /api/dashboard solo si procede
   - resolver widget individual desde snapshot dashboard
   - health local opcional del módulo dashboard
   - refresh forzado
   - hidratar store/state
   - normalizar payloads backend heterogéneos
   - soportar adapters múltiples de request
   - anti-race soft para dashboard load
   - entregar shape estable para home.template.js

   HARDENING PRO:
   - soporta { ok, data, payload, result, summary, dashboard }
   - soporta nested envelopes
   - soporta tickets/incidencias, facturas/invoices, usuarios/users, clientes/clients
   - genera aliases compatibles para template y stores
   - fallback AppCore.apiClient -> AppCore.request -> Http -> fetch
   - no reintenta con otro adapter si el backend respondió error real
   - browser guards para window/localStorage/sessionStorage/fetch/FormData/Blob
   - Authorization robusto
   - params soportados en fetch fallback
   - persistencia coherente en store/state
   - contrato alineado con /api/dashboard/summary
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  homeState,
  setLoading,
  setRefreshing,
  setError,
  setDashboard,
  setWidgets,
  setSummary,
  setRecent,
  setLastSyncAt,
  setLoaded,
  setRequestId,
  setHealth,
  setHydrated,
} from "./home.state.js";

import {
  replaceHomeStore,
  upsertHomeWidgetStore,
} from "./home.store.js";

/* =========================================================
   CONFIG
========================================================= */

export const HOME_DASHBOARD_ENDPOINT = "/api/dashboard/summary";
export const HOME_DASHBOARD_LEGACY_ENDPOINT = "/api/dashboard";
export const HOME_DASHBOARD_PING_ENDPOINT = "/api/dashboard/ping";

export const HOME_TIMEOUT = 15000;
export const HOME_HEALTH_TIMEOUT = 8000;

let lastLoadToken = 0;

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFn(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);

  return Number.isFinite(n) ? n : fallback;
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí", "on"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function isNonEmptyObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length
  );
}

function isMeaningfulValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;

  return true;
}

function first(...values) {
  for (const value of values) {
    if (!isMeaningfulValue(value)) continue;
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
    .trim();
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function safeCall(fn, ...args) {
  try {
    if (isFn(fn)) {
      return fn(...args);
    }
  } catch {}

  return undefined;
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

function safeError(...args) {
  try {
    AppCore?.utils?.error?.("[HomeAPI]", ...args);
  } catch {}

  try {
    console.error("[HomeAPI]", ...args);
  } catch {}
}

/* =========================================================
   TOKEN / RACE
========================================================= */

function nextLoadToken() {
  lastLoadToken += 1;
  return lastLoadToken;
}

function isActiveLoadToken(token) {
  return token === lastLoadToken;
}

/* =========================================================
   ADAPTER ERROR CLASSIFICATION
========================================================= */

const ADAPTER_UNAVAILABLE_CODES = Object.freeze([
  "HOME_API_CLIENT_UNAVAILABLE",
  "HOME_API_CLIENT_METHOD_UNAVAILABLE",
  "APP_CORE_REQUEST_UNAVAILABLE",
  "HTTP_MODULE_UNAVAILABLE",
  "HTTP_MODULE_METHOD_UNAVAILABLE",
  "FETCH_UNAVAILABLE",
]);

function createUnavailableError(code = "ADAPTER_UNAVAILABLE") {
  const error = new Error(code);

  error.code = code;
  error.adapterUnavailable = true;

  return error;
}

function isAdapterUnavailable(error = null) {
  const code = safeText(error?.code, "");
  const message = safeText(error?.message, "");

  return Boolean(
    error?.adapterUnavailable === true ||
      ADAPTER_UNAVAILABLE_CODES.includes(code) ||
      ADAPTER_UNAVAILABLE_CODES.includes(message)
  );
}

function getErrorStatus(error = null) {
  return safeNumber(
    first(
      error?.status,
      error?.statusCode,
      error?.response?.status,
      error?.response?.statusCode,
      error?.response?.data?.status,
      error?.response?.data?.statusCode,
      error?.data?.status,
      error?.data?.statusCode
    ),
    0
  );
}

function getErrorCode(error = null) {
  return safeText(
    first(
      error?.code,
      error?.errorCode,
      error?.response?.code,
      error?.response?.error,
      error?.response?.data?.code,
      error?.response?.data?.error,
      error?.data?.code,
      error?.data?.error,
      error?.error
    ),
    ""
  );
}

function shouldFallbackToLegacyDashboard(error = null) {
  const status = getErrorStatus(error);
  const code = normalizeKey(getErrorCode(error));

  if (status === 404) return true;

  return [
    "dashboard_route_not_found",
    "route_not_found",
    "not_found",
    "endpoint_not_found",
  ].includes(code);
}

/* =========================================================
   URL / AUTH HELPERS
========================================================= */

function getConfiguredEndpoint(key = "", fallback = "") {
  const cleanKey = safeText(key, "");

  if (!cleanKey) {
    return fallback;
  }

  return safeText(
    first(
      AppCore?.config?.endpoints?.[cleanKey],
      AppCore?.config?.[`${cleanKey}Endpoint`],
      fallback
    ),
    fallback
  );
}

function getDashboardEndpoint() {
  return getConfiguredEndpoint(
    "dashboardSummary",
    safeText(
      first(
        AppCore?.config?.endpoints?.dashboard_summary,
        AppCore?.config?.endpoints?.dashboard,
        HOME_DASHBOARD_ENDPOINT
      ),
      HOME_DASHBOARD_ENDPOINT
    )
  );
}

function getLegacyDashboardEndpoint() {
  return getConfiguredEndpoint(
    "dashboard",
    safeText(
      first(
        AppCore?.config?.endpoints?.dashboardLegacy,
        AppCore?.config?.endpoints?.dashboard_legacy,
        HOME_DASHBOARD_LEGACY_ENDPOINT
      ),
      HOME_DASHBOARD_LEGACY_ENDPOINT
    )
  );
}

function getDashboardPingEndpoint() {
  return getConfiguredEndpoint(
    "dashboardPing",
    safeText(
      first(
        AppCore?.config?.endpoints?.dashboard_ping,
        AppCore?.config?.endpoints?.healthDashboard,
        HOME_DASHBOARD_PING_ENDPOINT
      ),
      HOME_DASHBOARD_PING_ENDPOINT
    )
  );
}

function getApiBase() {
  return safeText(
    first(
      AppCore?.config?.apiBase,
      AppCore?.config?.baseUrl,
      AppCore?.state?.apiBase,
      ""
    ),
    ""
  ).replace(/\/+$/g, "");
}

function getBrowserOrigin() {
  if (!isBrowser()) {
    return "http://localhost";
  }

  try {
    return window.location.origin || "http://localhost";
  } catch {
    return "http://localhost";
  }
}

function buildAbsoluteUrl(path = "") {
  const cleanPath = safeText(path, "");

  if (!cleanPath) {
    return getApiBase() || "/";
  }

  if (/^https?:\/\//i.test(cleanPath)) {
    return cleanPath;
  }

  const apiBase = getApiBase();

  if (apiBase) {
    return `${apiBase}${cleanPath.startsWith("/") ? "" : "/"}${cleanPath}`;
  }

  return cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
}

function appendParamsToUrl(url = "", params = null) {
  const entries = Object.entries(safeObject(params));

  if (!entries.length) {
    return url;
  }

  try {
    const absoluteInput = /^https?:\/\//i.test(url);
    const parsed = new URL(url, getBrowserOrigin());

    entries.forEach(([key, value]) => {
      const name = safeText(key, "");

      if (!name || value === undefined || value === null || value === "") {
        return;
      }

      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item !== undefined && item !== null && item !== "") {
            parsed.searchParams.append(name, String(item));
          }
        });

        return;
      }

      parsed.searchParams.set(name, String(value));
    });

    if (absoluteInput) {
      return parsed.toString();
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

function readWebStorageValue(storageName = "localStorage", key = "") {
  if (!isBrowser()) {
    return "";
  }

  try {
    const storage = window?.[storageName];

    if (!storage || !isFn(storage.getItem)) {
      return "";
    }

    return safeText(storage.getItem(key), "");
  } catch {
    return "";
  }
}

function readAppStorageValue(key = "") {
  const cleanKey = safeText(key, "");

  if (!cleanKey) {
    return "";
  }

  try {
    if (isFn(AppCore?.storage?.get)) {
      return safeText(AppCore.storage.get(cleanKey), "");
    }
  } catch {}

  try {
    if (isFn(AppCore?.utils?.storage?.get)) {
      return safeText(AppCore.utils.storage.get(cleanKey), "");
    }
  } catch {}

  return "";
}

function getAuthToken() {
  const candidates = [
    AppCore?.state?.token,
    AppCore?.state?.accessToken,
    AppCore?.state?.session?.token,
    AppCore?.state?.session?.accessToken,
    AppCore?.state?.auth?.token,
    AppCore?.state?.auth?.accessToken,

    AppCore?.auth?.getToken?.(),
    AppCore?.Auth?.getToken?.(),
    AppCore?.modules?.Auth?.getToken?.(),
    AppCore?.modules?.auth?.getToken?.(),

    readAppStorageValue("token"),
    readAppStorageValue("accessToken"),
    readAppStorageValue("auth.token"),
    readAppStorageValue("auth.accessToken"),
    readAppStorageValue("session.token"),
    readAppStorageValue("session.accessToken"),

    readWebStorageValue("localStorage", "token"),
    readWebStorageValue("localStorage", "accessToken"),
    readWebStorageValue("localStorage", "auth.token"),
    readWebStorageValue("localStorage", "auth.accessToken"),
    readWebStorageValue("localStorage", "session.token"),
    readWebStorageValue("localStorage", "session.accessToken"),
    readWebStorageValue("localStorage", "onion:token"),
    readWebStorageValue("localStorage", "onion:accessToken"),
    readWebStorageValue("localStorage", "onion:auth.token"),
    readWebStorageValue("localStorage", "onion:auth.accessToken"),

    readWebStorageValue("sessionStorage", "token"),
    readWebStorageValue("sessionStorage", "accessToken"),
    readWebStorageValue("sessionStorage", "auth.token"),
    readWebStorageValue("sessionStorage", "auth.accessToken"),
    readWebStorageValue("sessionStorage", "session.token"),
    readWebStorageValue("sessionStorage", "session.accessToken"),
    readWebStorageValue("sessionStorage", "onion:token"),
    readWebStorageValue("sessionStorage", "onion:accessToken"),
    readWebStorageValue("sessionStorage", "onion:auth.token"),
    readWebStorageValue("sessionStorage", "onion:auth.accessToken"),
  ];

  return safeText(first(...candidates), "");
}

function getRequestHeaders(extraHeaders = {}) {
  const token = getAuthToken();

  return {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...safeObject(extraHeaders),
  };
}

export function getHomeApiClient() {
  return (
    AppCore?.apiClient ||
    AppCore?.api ||
    AppCore?.modules?.ApiClient ||
    AppCore?.modules?.apiClient ||
    null
  );
}

function getHttpModule() {
  try {
    if (isFn(AppCore?.modules?.get)) {
      return (
        AppCore.modules.get("Http") ||
        AppCore.modules.get("http") ||
        null
      );
    }
  } catch {}

  return (
    AppCore?.modules?.Http ||
    AppCore?.modules?.http ||
    AppCore?.Http ||
    AppCore?.http ||
    (typeof globalThis !== "undefined" ? globalThis.Http : null) ||
    null
  );
}

/* =========================================================
   ERROR NORMALIZATION
========================================================= */

function normalizeErrorMessage(error = null, fallback = "Error de API.") {
  const status = getErrorStatus(error);
  const errorCode = normalizeKey(getErrorCode(error));

  if (status === 0 && error?.name === "AbortError") {
    return "La petición del dashboard ha agotado el tiempo de espera.";
  }

  if (status === 401 || errorCode === "unauthorized") {
    return "No autorizado. Inicia sesión de nuevo.";
  }

  if (status === 403 || errorCode === "forbidden") {
    return "No tienes permisos para acceder al dashboard.";
  }

  if (
    status === 404 ||
    [
      "dashboard_route_not_found",
      "route_not_found",
      "endpoint_not_found",
      "not_found",
    ].includes(errorCode)
  ) {
    return "La ruta del dashboard no existe o no está disponible.";
  }

  if (status >= 500 || errorCode === "dashboard_error") {
    return "El dashboard devolvió un error interno.";
  }

  return safeText(
    first(
      error?.message,
      error?.response?.message,
      error?.response?.data?.message,
      error?.response?.error,
      error?.data?.message,
      error?.data?.error,
      error?.error,
      fallback
    ),
    fallback
  );
}

/* =========================================================
   RESPONSE HELPERS
========================================================= */

function getPayloadCandidates(payload = null) {
  const obj = safeObject(payload, null);

  if (!obj) {
    return [payload].filter((item) => item !== undefined && item !== null);
  }

  return [
    payload,

    obj.dashboard,
    obj.summary,

    obj.data,
    obj.body,
    obj.result,
    obj.payload,
    obj.response,

    obj.data?.dashboard,
    obj.data?.summary,
    obj.data?.data,
    obj.data?.body,
    obj.data?.result,
    obj.data?.payload,

    obj.result?.dashboard,
    obj.result?.summary,
    obj.result?.data,
    obj.result?.payload,

    obj.payload?.dashboard,
    obj.payload?.summary,
    obj.payload?.data,
    obj.payload?.result,

    obj.response?.dashboard,
    obj.response?.summary,
    obj.response?.data,
    obj.response?.result,
  ].filter((item) => item !== undefined && item !== null);
}

function looksLikeDashboard(value = null) {
  const obj = safeObject(value, null);

  if (!obj) return false;

  return Boolean(
    "summary" in obj ||
      "stats" in obj ||
      "metrics" in obj ||
      "totals" in obj ||
      "widgets" in obj ||
      "cards" in obj ||
      "kpis" in obj ||
      "blocks" in obj ||
      "recent" in obj ||
      "recentActivity" in obj ||
      "activity" in obj ||
      "activities" in obj ||
      "timeline" in obj ||
      "tickets" in obj ||
      "incidencias" in obj ||
      "facturas" in obj ||
      "invoices" in obj ||
      "users" in obj ||
      "usuarios" in obj ||
      "clients" in obj ||
      "clientes" in obj ||
      "customers" in obj ||
      "totalTickets" in obj ||
      "ticketsTotal" in obj ||
      "incidenciasTotal" in obj ||
      "openTickets" in obj ||
      "pendingTickets" in obj ||
      "totalInvoices" in obj ||
      "facturasTotal" in obj ||
      "pendingInvoices" in obj ||
      "invoiceAmount" in obj ||
      "billingTotal" in obj ||
      "usersCount" in obj ||
      "usuariosCount" in obj ||
      "clientsCount" in obj ||
      "clientesCount" in obj
  );
}

function looksLikeWidget(value = null) {
  const obj = safeObject(value, null);

  if (!obj) return false;

  return Boolean(
    obj.widgetId ||
      obj.widgetKey ||
      obj.key ||
      obj.slug ||
      obj.code ||
      obj.type ||
      obj.kind ||
      obj.title ||
      obj.name ||
      obj.label ||
      obj.heading
  );
}

function unwrapResponseEnvelope(payload = null, depth = 0) {
  if (payload === null || payload === undefined) {
    return null;
  }

  if (depth > 10) {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  if (looksLikeDashboard(payload)) {
    return payload;
  }

  const obj = safeObject(payload, null);

  if (!obj || !Object.keys(obj).length) {
    return payload;
  }

  const candidates = [
    obj.dashboard,
    obj.data,
    obj.result,
    obj.payload,
    obj.body,
    obj.response,
    obj.item,
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }

    const unwrapped = unwrapResponseEnvelope(candidate, depth + 1);

    if (unwrapped !== undefined && unwrapped !== null) {
      return unwrapped;
    }
  }

  return obj;
}

function pickDashboard(payload = null) {
  const candidates = getPayloadCandidates(payload);

  for (const candidate of candidates) {
    if (looksLikeDashboard(candidate)) {
      return candidate;
    }

    const unwrapped = unwrapResponseEnvelope(candidate);

    if (looksLikeDashboard(unwrapped)) {
      return unwrapped;
    }
  }

  const unwrapped = unwrapResponseEnvelope(payload);

  if (looksLikeDashboard(unwrapped)) {
    return unwrapped;
  }

  return safeObject(unwrapped, {});
}

function extractOk(payload = null, fallback = true) {
  const candidates = getPayloadCandidates(payload);

  for (const candidate of candidates) {
    const obj = safeObject(candidate, null);

    if (!obj) continue;

    if (typeof obj.ok === "boolean") return obj.ok;
    if (typeof obj.success === "boolean") return obj.success;
  }

  return fallback;
}

function extractMeta(payload = null) {
  const candidates = getPayloadCandidates(payload);

  for (const candidate of candidates) {
    const obj = safeObject(candidate, null);

    if (!obj) continue;

    const meta = first(
      obj.meta,
      obj.pagination,
      obj.pageInfo,
      obj.data?.meta,
      obj.data?.pagination,
      obj.result?.meta,
      obj.result?.pagination,
      obj.payload?.meta,
      obj.payload?.pagination
    );

    if (isNonEmptyObject(meta)) {
      return safeObject(meta);
    }
  }

  return {};
}

function getRequestIdFromPayload(payload = null) {
  const candidates = getPayloadCandidates(payload);

  for (const candidate of candidates) {
    const obj = safeObject(candidate, null);

    if (!obj) continue;

    const id = safeText(
      first(
        obj.requestId,
        obj.correlationId,
        obj.traceId,
        obj.operationId,
        obj.meta?.requestId,
        obj.meta?.correlationId,
        obj.headers?.["x-request-id"],
        obj.headers?.["x-correlation-id"]
      ),
      ""
    );

    if (id) return id;
  }

  return "";
}

/* =========================================================
   COLLECTION NORMALIZATION HELPERS
========================================================= */

function normalizeCollectionSource(value = null) {
  if (Array.isArray(value)) {
    return {
      items: value,
      total: value.length,
      raw: value,
    };
  }

  const obj = safeObject(value, null);

  if (!obj) {
    return {
      items: [],
      total: 0,
      raw: value,
    };
  }

  const items = safeArray(
    first(
      obj.items,
      obj.rows,
      obj.records,
      obj.results,
      obj.data,
      obj.docs,
      obj.value,
      obj.collection,
      []
    )
  );

  const total = Math.max(
    items.length,
    safeNumber(
      first(
        obj.total,
        obj.count,
        obj.remoteCount,
        obj.totalCount,
        obj.meta?.total,
        obj.meta?.count,
        obj.pagination?.total,
        obj.pagination?.count,
        obj.pageInfo?.total
      ),
      items.length
    )
  );

  return {
    items,
    total,
    raw: value,
  };
}

function pickCollectionBlock(source = {}, keys = []) {
  const raw = safeObject(source);

  for (const key of keys) {
    const direct = raw?.[key];

    if (Array.isArray(direct)) {
      return normalizeCollectionSource(direct);
    }

    if (isNonEmptyObject(direct)) {
      const normalized = normalizeCollectionSource(direct);

      if (normalized.items.length || normalized.total > 0) {
        return normalized;
      }
    }
  }

  return {
    items: [],
    total: 0,
    raw: null,
  };
}

function getArrayCount(value = null) {
  if (Array.isArray(value)) return value.length;

  const obj = safeObject(value, null);

  if (!obj) return 0;

  return safeNumber(
    first(
      obj.total,
      obj.count,
      obj.remoteCount,
      obj.totalCount,
      obj.meta?.total,
      obj.pagination?.total
    ),
    safeArray(first(obj.items, obj.rows, obj.data, obj.results, [])).length
  );
}

/* =========================================================
   TICKETS / INCIDENCIAS NORMALIZER
========================================================= */

function getTicketId(item = {}) {
  const raw = safeObject(item);
  const base = safeObject(raw.raw);

  return safeText(
    first(
      raw.ticketId,
      raw.incidenciaId,
      raw.code,
      raw.numero,
      raw.ticketCode,
      raw.id,
      raw._id,

      base.ticketId,
      base.incidenciaId,
      base.code,
      base.numero,
      base.ticketCode,
      base.id,
      base._id
    ),
    ""
  );
}

function getTicketSubject(item = {}) {
  const raw = safeObject(item);
  const base = safeObject(raw.raw);

  return safeText(
    first(
      raw.subject,
      raw.title,
      raw.asunto,
      raw.name,

      base.subject,
      base.title,
      base.asunto,
      base.name
    ),
    "Incidencia sin asunto"
  );
}

function getTicketStatus(item = {}) {
  const raw = safeObject(item);
  const base = safeObject(raw.raw);

  return safeText(
    first(
      raw.status,
      raw.estado,
      raw.state,

      base.status,
      base.estado,
      base.state,
      "pending"
    ),
    "pending"
  );
}

function getTicketPriority(item = {}) {
  const raw = safeObject(item);
  const base = safeObject(raw.raw);

  return safeText(
    first(
      raw.priority,
      raw.prioridad,
      base.priority,
      base.prioridad,
      "medium"
    ),
    "medium"
  );
}

function getTicketCreatedAt(item = {}) {
  const raw = safeObject(item);
  const base = safeObject(raw.raw);

  return first(
    raw.createdAt,
    raw.fechaCreacion,
    raw.createdAtES,
    raw.date,
    raw.fecha,

    base.createdAt,
    base.fechaCreacion,
    base.createdAtES,
    base.date,
    base.fecha
  );
}

function getTicketUpdatedAt(item = {}) {
  const raw = safeObject(item);
  const base = safeObject(raw.raw);

  return first(
    raw.updatedAt,
    raw.lastUpdateAt,
    raw.ultimaNovedad,
    raw.modifiedAt,
    raw.closedAt,
    raw.createdAt,

    base.updatedAt,
    base.lastUpdateAt,
    base.ultimaNovedad,
    base.modifiedAt,
    base.closedAt,
    base.createdAt
  );
}

function getTicketAttachmentsCount(item = {}) {
  const raw = safeObject(item);
  const base = safeObject(raw.raw);

  const attachments = first(
    raw.attachments,
    raw.files,
    raw.adjuntos,

    base.attachments,
    base.files,
    base.adjuntos
  );

  if (Array.isArray(attachments)) {
    return attachments.length;
  }

  return safeNumber(
    first(
      raw.attachmentsCount,
      raw.filesCount,
      raw.adjuntosCount,

      base.attachmentsCount,
      base.filesCount,
      base.adjuntosCount,
      0
    ),
    0
  );
}

function normalizeTicketItem(item = {}) {
  const raw = safeObject(item);
  const id = getTicketId(raw);

  return {
    ...raw,

    id: safeText(first(raw.id, id), id),
    ticketId: safeText(first(raw.ticketId, id), id),
    incidenciaId: safeText(first(raw.incidenciaId, id), id),

    subject: getTicketSubject(raw),
    title: safeText(first(raw.title, raw.subject, getTicketSubject(raw)), getTicketSubject(raw)),
    asunto: safeText(first(raw.asunto, raw.subject, raw.title), getTicketSubject(raw)),

    description: safeText(
      first(
        raw.description,
        raw.preview,
        raw.message,
        raw.descripcion,
        raw.body,
        raw.raw?.description,
        raw.raw?.preview,
        raw.raw?.message,
        raw.raw?.descripcion,
        raw.raw?.body
      ),
      "Sin descripción."
    ),

    status: getTicketStatus(raw),
    estado: safeText(first(raw.estado, raw.status, getTicketStatus(raw)), getTicketStatus(raw)),
    priority: getTicketPriority(raw),
    prioridad: safeText(first(raw.prioridad, raw.priority, getTicketPriority(raw)), getTicketPriority(raw)),

    clientName: safeText(
      first(
        raw.clientName,
        raw.clienteNombre,
        raw.userName,
        raw.createdByName,
        raw.name,
        raw.cliente?.nombre,
        raw.cliente?.name,
        raw.client?.name,
        raw.customer?.name,
        raw.createdBy?.name,
        raw.user?.name,
        raw.raw?.clientName,
        raw.raw?.clienteNombre,
        raw.raw?.userName,
        raw.raw?.createdByName
      ),
      ""
    ),

    clientAvatar: safeText(
      first(
        raw.clientAvatar,
        raw.avatar,
        raw.avatarUrl,
        raw.avatar_url,
        raw.userAvatar,
        raw.createdByAvatar,
        raw.cliente?.avatar,
        raw.cliente?.avatarUrl,
        raw.client?.avatar,
        raw.client?.avatarUrl,
        raw.customer?.avatar,
        raw.customer?.avatarUrl,
        raw.createdBy?.avatar,
        raw.createdBy?.avatarUrl,
        raw.user?.avatar,
        raw.user?.avatarUrl,
        raw.raw?.clientAvatar,
        raw.raw?.avatar,
        raw.raw?.avatarUrl,
        raw.raw?.avatar_url
      ),
      ""
    ),

    createdAt: getTicketCreatedAt(raw),
    updatedAt: getTicketUpdatedAt(raw),
    attachmentsCount: getTicketAttachmentsCount(raw),

    raw: isNonEmptyObject(raw.raw) ? raw.raw : raw,
  };
}

/* =========================================================
   FACTURAS NORMALIZER
========================================================= */

function getInvoiceId(item = {}) {
  const raw = safeObject(item);
  const base = safeObject(raw.raw);

  return safeText(
    first(
      raw.invoiceId,
      raw.facturaId,
      raw.number,
      raw.numero,
      raw.code,
      raw.id,
      raw._id,

      base.invoiceId,
      base.facturaId,
      base.number,
      base.numero,
      base.code,
      base.id,
      base._id
    ),
    ""
  );
}

function normalizeInvoiceItem(item = {}) {
  const raw = safeObject(item);
  const id = getInvoiceId(raw);

  const amount = safeNumber(
    first(
      raw.total,
      raw.amount,
      raw.importe,
      raw.price,
      raw.subtotal,
      raw.raw?.total,
      raw.raw?.amount,
      raw.raw?.importe,
      raw.raw?.price,
      raw.raw?.subtotal,
      0
    ),
    0
  );

  const status = safeText(
    first(
      raw.paymentStatus,
      raw.estadoPago,
      raw.status,
      raw.estado,
      raw.raw?.paymentStatus,
      raw.raw?.estadoPago,
      raw.raw?.status,
      raw.raw?.estado,
      "pending"
    ),
    "pending"
  );

  return {
    ...raw,

    id: safeText(first(raw.id, id), id),
    invoiceId: safeText(first(raw.invoiceId, id), id),
    facturaId: safeText(first(raw.facturaId, id), id),
    numero: safeText(first(raw.numero, raw.number, raw.code, id), id),
    number: safeText(first(raw.number, raw.numero, raw.code, id), id),
    code: safeText(first(raw.code, raw.numero, raw.number, id), id),

    total: amount,
    amount,
    importe: amount,

    currency: safeText(first(raw.currency, raw.moneda, raw.raw?.currency, raw.raw?.moneda, "EUR"), "EUR"),
    moneda: safeText(first(raw.moneda, raw.currency, raw.raw?.moneda, raw.raw?.currency, "EUR"), "EUR"),

    paymentStatus: status,
    estadoPago: safeText(first(raw.estadoPago, raw.paymentStatus, status), status),
    status: safeText(first(raw.status, status), status),
    estado: safeText(first(raw.estado, raw.status, status), status),

    createdAt: first(raw.createdAt, raw.fechaCreacion, raw.date, raw.raw?.createdAt, raw.raw?.fechaCreacion, raw.raw?.date),
    updatedAt: first(raw.updatedAt, raw.modifiedAt, raw.date, raw.raw?.updatedAt, raw.raw?.modifiedAt, raw.raw?.date),

    raw: isNonEmptyObject(raw.raw) ? raw.raw : raw,
  };
}

/* =========================================================
   USERS / CLIENTS NORMALIZER
========================================================= */

function normalizeUserItem(item = {}) {
  const raw = safeObject(item);

  const id = safeText(
    first(
      raw.userId,
      raw.usuarioId,
      raw.id,
      raw._id,
      raw.username,
      raw.email,
      raw.raw?.userId,
      raw.raw?.usuarioId,
      raw.raw?.id,
      raw.raw?._id,
      raw.raw?.username,
      raw.raw?.email
    ),
    ""
  );

  const displayName = safeText(
    first(
      raw.displayName,
      raw.fullName,
      raw.name,
      raw.nombre,
      raw.username,
      raw.email,
      raw.raw?.displayName,
      raw.raw?.fullName,
      raw.raw?.name,
      raw.raw?.nombre,
      raw.raw?.username,
      raw.raw?.email
    ),
    "Usuario"
  );

  return {
    ...raw,

    id: safeText(first(raw.id, id), id),
    userId: safeText(first(raw.userId, id), id),
    usuarioId: safeText(first(raw.usuarioId, id), id),

    displayName,
    fullName: safeText(first(raw.fullName, displayName), displayName),
    name: safeText(first(raw.name, displayName), displayName),
    nombre: safeText(first(raw.nombre, displayName), displayName),

    email: safeText(first(raw.email, raw.mail, raw.raw?.email, raw.raw?.mail), ""),
    role: safeText(first(raw.role, raw.rol, raw.type, raw.raw?.role, raw.raw?.rol, raw.raw?.type), "user"),

    raw: isNonEmptyObject(raw.raw) ? raw.raw : raw,
  };
}

function normalizeClientItem(item = {}) {
  const raw = safeObject(item);

  const id = safeText(
    first(
      raw.clientId,
      raw.clienteId,
      raw.customerId,
      raw.id,
      raw._id,
      raw.email,
      raw.raw?.clientId,
      raw.raw?.clienteId,
      raw.raw?.customerId,
      raw.raw?.id,
      raw.raw?._id,
      raw.raw?.email
    ),
    ""
  );

  const name = safeText(
    first(
      raw.name,
      raw.nombre,
      raw.razonSocial,
      raw.company,
      raw.email,
      raw.raw?.name,
      raw.raw?.nombre,
      raw.raw?.razonSocial,
      raw.raw?.company,
      raw.raw?.email
    ),
    "Cliente"
  );

  return {
    ...raw,

    id: safeText(first(raw.id, id), id),
    clientId: safeText(first(raw.clientId, id), id),
    clienteId: safeText(first(raw.clienteId, id), id),

    name,
    nombre: safeText(first(raw.nombre, name), name),
    displayName: safeText(first(raw.displayName, name), name),

    email: safeText(first(raw.email, raw.mail, raw.raw?.email, raw.raw?.mail), ""),
    phone: safeText(first(raw.phone, raw.telefono, raw.raw?.phone, raw.raw?.telefono), ""),

    raw: isNonEmptyObject(raw.raw) ? raw.raw : raw,
  };
}

/* =========================================================
   ACTIVITY NORMALIZER
========================================================= */

function normalizeActivityItem(item = {}) {
  const raw = safeObject(item);

  const type = safeText(
    first(
      raw.type,
      raw.kind,
      raw.category,
      raw.raw?.type,
      raw.raw?.kind,
      raw.raw?.category,
      "activity"
    ),
    "activity"
  );

  const title = safeText(
    first(
      raw.title,
      raw.name,
      raw.subject,
      raw.label,
      raw.raw?.title,
      raw.raw?.name,
      raw.raw?.subject,
      raw.raw?.label
    ),
    "Actividad registrada"
  );

  return {
    ...raw,

    type,
    kind: safeText(first(raw.kind, type), type),
    title,
    text: safeText(
      first(
        raw.text,
        raw.description,
        raw.message,
        raw.detail,
        raw.preview,
        raw.raw?.text,
        raw.raw?.description,
        raw.raw?.message,
        raw.raw?.detail,
        raw.raw?.preview
      ),
      "Sin detalle adicional."
    ),

    date: first(
      raw.date,
      raw.createdAt,
      raw.updatedAt,
      raw.timestamp,
      raw.raw?.date,
      raw.raw?.createdAt,
      raw.raw?.updatedAt,
      raw.raw?.timestamp
    ),

    route: safeText(first(raw.route, raw.href, raw.link, raw.to, raw.raw?.route), ""),
    action: safeText(first(raw.action, raw.raw?.action, "open-activity"), "open-activity"),
    entityId: safeText(first(raw.entityId, raw.id, raw.ticketId, raw.facturaId, raw.raw?.entityId), ""),

    raw: isNonEmptyObject(raw.raw) ? raw.raw : raw,
  };
}

/* =========================================================
   WIDGET NORMALIZER
========================================================= */

function getWidgetId(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.widgetId,
      raw.widgetKey,
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

function normalizeWidget(item = {}) {
  const raw = safeObject(item);

  return {
    ...raw,

    widgetId: getWidgetId(raw),
    id: safeText(first(raw.id, getWidgetId(raw)), getWidgetId(raw)),
    title: getWidgetTitle(raw),

    description: safeText(
      first(
        raw.description,
        raw.descripcion,
        raw.subtitle,
        raw.summary,
        raw.text
      ),
      ""
    ),

    type: safeText(
      first(
        raw.type,
        raw.kind,
        raw.variant,
        raw.category
      ),
      "widget"
    ),

    value: first(
      raw.value,
      raw.total,
      raw.amount,
      raw.count,
      raw.metric
    ),

    trend: first(
      raw.trend,
      raw.delta,
      raw.change,
      raw.variation
    ),

    status: safeText(
      first(
        raw.status,
        raw.estado,
        raw.state
      ),
      "active"
    ),

    route: safeText(
      first(
        raw.route,
        raw.href,
        raw.link,
        raw.to
      ),
      ""
    ),

    updatedAt: first(
      raw.updatedAt,
      raw.lastUpdate,
      raw.modifiedAt,
      raw.createdAt
    ),

    raw: isNonEmptyObject(raw.raw) ? raw.raw : raw,
  };
}

function getDashboardWidgetsBlock(dashboard = {}) {
  const raw = safeObject(dashboard);

  return safeArray(
    first(
      raw.widgets,
      raw.cards,
      raw.kpis,
      raw.blocks,
      raw.widgetList,
      raw.items
    )
  )
    .map((item) => normalizeWidget(item))
    .filter((item) => looksLikeWidget(item));
}

/* =========================================================
   SUMMARY NORMALIZATION
========================================================= */

function getTicketStatusKey(value = "") {
  const key = normalizeKey(value);

  if (["pending", "pendiente"].includes(key)) return "pending";
  if (["open", "abierta", "abierto"].includes(key)) return "open";

  if (
    [
      "progress",
      "in_progress",
      "inprogress",
      "en_proceso",
      "proceso",
      "working",
      "trabajando",
    ].includes(key)
  ) {
    return "progress";
  }

  if (["resolved", "resuelta", "resuelto"].includes(key)) return "resolved";
  if (["closed", "cerrada", "cerrado"].includes(key)) return "closed";

  if (["cancelled", "cancelada", "cancelado"].includes(key)) {
    return "closed";
  }

  return "pending";
}

function isTicketOpenLike(item = {}) {
  return ["open", "pending", "progress"].includes(
    getTicketStatusKey(getTicketStatus(item))
  );
}

function isTicketClosedLike(item = {}) {
  return ["closed", "resolved"].includes(
    getTicketStatusKey(getTicketStatus(item))
  );
}

function isTicketUrgent(item = {}) {
  return [
    "urgent",
    "urgente",
    "critical",
    "critica",
    "crítica",
    "high",
    "alta",
  ].includes(normalizeKey(getTicketPriority(item)));
}

function getInvoiceStatusKey(item = {}) {
  const raw = safeObject(item);

  const key = normalizeKey(
    first(
      raw.paymentStatus,
      raw.estadoPago,
      raw.status,
      raw.estado,
      raw.raw?.paymentStatus,
      raw.raw?.estadoPago,
      raw.raw?.status,
      raw.raw?.estado,
      "pending"
    )
  );

  if (["paid", "pagada", "pagado", "cobrada"].includes(key)) return "paid";
  if (["pending", "pendiente"].includes(key)) return "pending";
  if (["overdue", "vencida", "vencido"].includes(key)) return "overdue";
  if (["partial", "parcial"].includes(key)) return "partial";
  if (["cancelled", "cancelada", "cancelado"].includes(key)) return "cancelled";
  if (["draft", "borrador"].includes(key)) return "draft";

  return "pending";
}

function isInvoicePendingLike(item = {}) {
  return ["pending", "overdue", "partial"].includes(getInvoiceStatusKey(item));
}

function getInvoiceAmount(item = {}) {
  const raw = safeObject(item);

  return safeNumber(
    first(
      raw.total,
      raw.amount,
      raw.importe,
      raw.price,
      raw.subtotal,
      raw.raw?.total,
      raw.raw?.amount,
      raw.raw?.importe,
      raw.raw?.price,
      raw.raw?.subtotal,
      0
    ),
    0
  );
}

function getLatestTicketUpdate(tickets = []) {
  const timestamps = safeArray(tickets)
    .map((item) => {
      const value = getTicketUpdatedAt(item) || getTicketCreatedAt(item);
      const date = new Date(value || 0);
      const ts = date.getTime();

      return Number.isFinite(ts) ? ts : 0;
    })
    .filter(Boolean);

  if (!timestamps.length) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function getDashboardSummaryBlock(dashboard = {}) {
  const raw = safeObject(dashboard);

  const summary = safeObject(
    first(
      raw.summary,
      raw.stats,
      raw.metrics,
      raw.totals,
      {}
    )
  );

  if (Object.keys(summary).length) {
    return summary;
  }

  const maybeSummaryOnly = safeObject(raw);

  if (
    "totalTickets" in maybeSummaryOnly ||
    "ticketsTotal" in maybeSummaryOnly ||
    "openTickets" in maybeSummaryOnly ||
    "totalInvoices" in maybeSummaryOnly ||
    "invoiceAmount" in maybeSummaryOnly ||
    "clientsCount" in maybeSummaryOnly ||
    "usersCount" in maybeSummaryOnly
  ) {
    return maybeSummaryOnly;
  }

  return {};
}

function buildDerivedSummary({
  tickets = [],
  ticketsTotal = null,
  invoices = [],
  invoicesTotal = null,
  users = [],
  usersTotal = null,
  clients = [],
  clientsTotal = null,
} = {}) {
  const openTickets = tickets.filter((item) => isTicketOpenLike(item)).length;
  const closedTickets = tickets.filter((item) => isTicketClosedLike(item)).length;
  const urgentTickets = tickets.filter((item) => isTicketUrgent(item)).length;

  const pendingInvoices = invoices.filter((item) => isInvoicePendingLike(item)).length;
  const invoiceAmount = invoices.reduce((sum, item) => sum + getInvoiceAmount(item), 0);

  const attachmentsCount = tickets.reduce(
    (sum, item) => sum + getTicketAttachmentsCount(item),
    0
  );

  return {
    totalTickets: Math.max(tickets.length, safeNumber(ticketsTotal, tickets.length)),
    ticketsTotal: Math.max(tickets.length, safeNumber(ticketsTotal, tickets.length)),
    incidenciasTotal: Math.max(tickets.length, safeNumber(ticketsTotal, tickets.length)),
    visibleTickets: tickets.length,
    openTickets,
    pendingTickets: openTickets,
    closedTickets,
    urgentTickets,

    totalInvoices: Math.max(invoices.length, safeNumber(invoicesTotal, invoices.length)),
    invoicesTotal: Math.max(invoices.length, safeNumber(invoicesTotal, invoices.length)),
    facturasTotal: Math.max(invoices.length, safeNumber(invoicesTotal, invoices.length)),
    visibleInvoices: invoices.length,
    pendingInvoices,
    invoiceAmount,
    billingTotal: invoiceAmount,

    usersCount: Math.max(users.length, safeNumber(usersTotal, users.length)),
    usuariosCount: Math.max(users.length, safeNumber(usersTotal, users.length)),

    clientsCount: Math.max(clients.length, safeNumber(clientsTotal, clients.length)),
    clientesCount: Math.max(clients.length, safeNumber(clientsTotal, clients.length)),

    attachmentsCount,
    lastTicketUpdate: getLatestTicketUpdate(tickets),
  };
}

function normalizeSummary(rawSummary = {}, derivedSummary = {}) {
  const raw = safeObject(rawSummary);
  const derived = safeObject(derivedSummary);

  return {
    ...derived,
    ...raw,

    totalTickets: safeNumber(
      first(raw.totalTickets, raw.ticketsTotal, raw.incidenciasTotal, raw.totalIncidencias, derived.totalTickets),
      derived.totalTickets || 0
    ),
    ticketsTotal: safeNumber(
      first(raw.ticketsTotal, raw.totalTickets, raw.incidenciasTotal, raw.totalIncidencias, derived.ticketsTotal),
      derived.ticketsTotal || 0
    ),
    incidenciasTotal: safeNumber(
      first(raw.incidenciasTotal, raw.totalIncidencias, raw.totalTickets, raw.ticketsTotal, derived.incidenciasTotal),
      derived.incidenciasTotal || 0
    ),

    openTickets: safeNumber(
      first(raw.openTickets, raw.openIncidencias, raw.pendingTickets, raw.ticketsOpen, derived.openTickets),
      derived.openTickets || 0
    ),
    pendingTickets: safeNumber(
      first(raw.pendingTickets, raw.openTickets, raw.pendingIncidencias, derived.pendingTickets),
      derived.pendingTickets || 0
    ),
    closedTickets: safeNumber(
      first(raw.closedTickets, raw.closedIncidencias, raw.resolvedTickets, derived.closedTickets),
      derived.closedTickets || 0
    ),
    urgentTickets: safeNumber(
      first(raw.urgentTickets, raw.urgentIncidencias, raw.highPriorityTickets, derived.urgentTickets),
      derived.urgentTickets || 0
    ),

    totalInvoices: safeNumber(
      first(raw.totalInvoices, raw.invoicesTotal, raw.facturasTotal, raw.totalFacturas, derived.totalInvoices),
      derived.totalInvoices || 0
    ),
    invoicesTotal: safeNumber(
      first(raw.invoicesTotal, raw.totalInvoices, raw.facturasTotal, raw.totalFacturas, derived.invoicesTotal),
      derived.invoicesTotal || 0
    ),
    facturasTotal: safeNumber(
      first(raw.facturasTotal, raw.totalFacturas, raw.totalInvoices, raw.invoicesTotal, derived.facturasTotal),
      derived.facturasTotal || 0
    ),

    pendingInvoices: safeNumber(
      first(raw.pendingInvoices, raw.pendingFacturas, raw.invoicesPending, raw.facturasPendientes, derived.pendingInvoices),
      derived.pendingInvoices || 0
    ),

    invoiceAmount: safeNumber(
      first(raw.invoiceAmount, raw.billingTotal, raw.totalBilling, raw.totalFacturado, raw.importeFacturas, derived.invoiceAmount),
      derived.invoiceAmount || 0
    ),
    billingTotal: safeNumber(
      first(raw.billingTotal, raw.invoiceAmount, raw.totalBilling, raw.totalFacturado, derived.billingTotal),
      derived.billingTotal || 0
    ),

    usersCount: safeNumber(
      first(raw.usersCount, raw.usuariosCount, raw.totalUsers, raw.totalUsuarios, derived.usersCount),
      derived.usersCount || 0
    ),
    usuariosCount: safeNumber(
      first(raw.usuariosCount, raw.usersCount, raw.totalUsuarios, raw.totalUsers, derived.usuariosCount),
      derived.usuariosCount || 0
    ),

    clientsCount: safeNumber(
      first(raw.clientsCount, raw.clientesCount, raw.customersCount, raw.totalClients, raw.totalClientes, derived.clientsCount),
      derived.clientsCount || 0
    ),
    clientesCount: safeNumber(
      first(raw.clientesCount, raw.clientsCount, raw.customersCount, raw.totalClientes, raw.totalClients, derived.clientesCount),
      derived.clientesCount || 0
    ),

    attachmentsCount: safeNumber(
      first(raw.attachmentsCount, raw.filesCount, raw.adjuntosCount, derived.attachmentsCount),
      derived.attachmentsCount || 0
    ),

    lastTicketUpdate: first(
      raw.lastTicketUpdate,
      raw.lastIncidenciaUpdate,
      raw.lastUpdate,
      raw.updatedAt,
      derived.lastTicketUpdate
    ),
  };
}

/* =========================================================
   DASHBOARD NORMALIZATION
========================================================= */

function getDashboardCollections(dashboard = {}) {
  const raw = safeObject(dashboard);

  const ticketsBlock = pickCollectionBlock(raw, [
    "tickets",
    "incidencias",
    "recentTickets",
    "recentIncidencias",
    "latestTickets",
    "latestIncidencias",
    "ticketItems",
    "incidenciaItems",
  ]);

  const invoicesBlock = pickCollectionBlock(raw, [
    "facturas",
    "invoices",
    "bills",
    "recentFacturas",
    "recentInvoices",
    "latestFacturas",
    "latestInvoices",
    "invoiceItems",
    "facturaItems",
  ]);

  const usersBlock = pickCollectionBlock(raw, [
    "users",
    "usuarios",
    "userItems",
    "usuarioItems",
    "recentUsers",
    "recentUsuarios",
  ]);

  const clientsBlock = pickCollectionBlock(raw, [
    "clients",
    "clientes",
    "customers",
    "clientItems",
    "clienteItems",
    "customerItems",
    "recentClients",
    "recentClientes",
    "recentCustomers",
  ]);

  const activityBlock = pickCollectionBlock(raw, [
    "activity",
    "activities",
    "recentActivity",
    "recent",
    "timeline",
    "logs",
    "events",
  ]);

  const tickets = ticketsBlock.items.map((item) => normalizeTicketItem(item));
  const invoices = invoicesBlock.items.map((item) => normalizeInvoiceItem(item));
  const users = usersBlock.items.map((item) => normalizeUserItem(item));
  const clients = clientsBlock.items.map((item) => normalizeClientItem(item));
  const activity = activityBlock.items.map((item) => normalizeActivityItem(item));

  return {
    tickets,
    incidencias: tickets,
    ticketsTotal: Math.max(tickets.length, ticketsBlock.total),

    invoices,
    facturas: invoices,
    invoicesTotal: Math.max(invoices.length, invoicesBlock.total),

    users,
    usuarios: users,
    usersTotal: Math.max(users.length, usersBlock.total),

    clients,
    clientes: clients,
    customers: clients,
    clientsTotal: Math.max(clients.length, clientsBlock.total),

    activity,
    recent: activity,
    recentTotal: Math.max(activity.length, activityBlock.total),
  };
}

function normalizeDashboard(payload = null) {
  const picked = pickDashboard(payload);
  const raw = safeObject(picked);

  const collections = getDashboardCollections(raw);
  const widgets = getDashboardWidgetsBlock(raw);

  const rawSummary = getDashboardSummaryBlock(raw);

  const derivedSummary = buildDerivedSummary({
    tickets: collections.tickets,
    ticketsTotal: first(
      rawSummary.totalTickets,
      rawSummary.ticketsTotal,
      rawSummary.incidenciasTotal,
      collections.ticketsTotal
    ),

    invoices: collections.invoices,
    invoicesTotal: first(
      rawSummary.totalInvoices,
      rawSummary.invoicesTotal,
      rawSummary.facturasTotal,
      collections.invoicesTotal
    ),

    users: collections.users,
    usersTotal: first(
      rawSummary.usersCount,
      rawSummary.usuariosCount,
      collections.usersTotal
    ),

    clients: collections.clients,
    clientsTotal: first(
      rawSummary.clientsCount,
      rawSummary.clientesCount,
      collections.clientsTotal
    ),
  });

  const summary = normalizeSummary(rawSummary, derivedSummary);

  const updatedAt = first(
    raw.updatedAt,
    raw.lastUpdate,
    raw.generatedAt,
    raw.createdAt,
    summary.updatedAt,
    summary.lastUpdate,
    nowIso()
  );

  return {
    ...raw,

    ok: extractOk(payload, true),

    summary,
    stats: summary,
    metrics: summary,
    totals: summary,

    widgets,
    cards: widgets,
    kpis: widgets,

    tickets: collections.tickets,
    incidencias: collections.incidencias,
    ticketsTotal: summary.totalTickets,
    incidenciasTotal: summary.totalTickets,

    invoices: collections.invoices,
    facturas: collections.facturas,
    invoicesTotal: summary.totalInvoices,
    facturasTotal: summary.totalInvoices,

    users: collections.users,
    usuarios: collections.usuarios,
    usersTotal: summary.usersCount,
    usuariosTotal: summary.usersCount,

    clients: collections.clients,
    clientes: collections.clientes,
    customers: collections.customers,
    clientsTotal: summary.clientsCount,
    clientesTotal: summary.clientsCount,

    activity: collections.activity,
    activities: collections.activity,
    recent: collections.recent,
    recentActivity: collections.activity,

    updatedAt,
    generatedAt: first(raw.generatedAt, updatedAt),
    raw: payload,
    meta: {
      ...extractMeta(payload),
      updatedAt,
      widgetsCount: widgets.length,
      ticketsCount: collections.tickets.length,
      invoicesCount: collections.invoices.length,
      usersCount: collections.users.length,
      clientsCount: collections.clients.length,
      activityCount: collections.activity.length,
    },
  };
}

export function normalizeHomeDashboardResponse(payload = null) {
  const dashboard = normalizeDashboard(payload);

  return {
    ok: extractOk(payload, true),
    dashboard,
    summary: dashboard.summary,
    widgets: dashboard.widgets,
    recent: dashboard.recent,
    activity: dashboard.activity,

    tickets: dashboard.tickets,
    incidencias: dashboard.incidencias,

    invoices: dashboard.invoices,
    facturas: dashboard.facturas,

    users: dashboard.users,
    usuarios: dashboard.usuarios,

    clients: dashboard.clients,
    clientes: dashboard.clientes,

    requestId: getRequestIdFromPayload(payload),
    raw: payload,
    meta: dashboard.meta,
  };
}

/* =========================================================
   WIDGET RESOLUTION
========================================================= */

function findWidgetInCollection(items = [], widgetId = "") {
  const target = safeText(widgetId, "");

  if (!target) {
    return null;
  }

  const targetLower = target.toLowerCase();

  return (
    safeArray(items).find((item) => {
      const currentId = getWidgetId(item);
      const currentTitle = getWidgetTitle(item);
      const currentKey = safeText(first(item.key, item.slug, item.code), "");

      return (
        currentId === target ||
        currentId.toLowerCase() === targetLower ||
        currentKey === target ||
        currentKey.toLowerCase() === targetLower ||
        normalizeKey(currentTitle) === normalizeKey(target)
      );
    }) || null
  );
}

export function resolveHomeWidgetFromDashboard(widgetId = "", dashboard = {}) {
  const normalized = normalizeDashboard(dashboard);
  return findWidgetInCollection(normalized.widgets, widgetId);
}

/* =========================================================
   REQUEST BODY
========================================================= */

function hasRequestBody(body) {
  return body !== undefined && body !== null;
}

function isFormDataBody(body) {
  try {
    return (
      typeof FormData !== "undefined" &&
      body instanceof FormData
    );
  } catch {
    return false;
  }
}

function isBlobBody(body) {
  try {
    return (
      typeof Blob !== "undefined" &&
      body instanceof Blob
    );
  } catch {
    return false;
  }
}

function buildRequestBody(body) {
  if (!hasRequestBody(body)) {
    return undefined;
  }

  if (
    typeof body === "string" ||
    isFormDataBody(body) ||
    isBlobBody(body)
  ) {
    return body;
  }

  return JSON.stringify(body);
}

/* =========================================================
   REQUEST ADAPTERS
========================================================= */

async function requestViaApiClient(method = "GET", path = "", options = {}) {
  const client = getHomeApiClient();

  if (!client) {
    throw createUnavailableError("HOME_API_CLIENT_UNAVAILABLE");
  }

  const verb = safeText(method, "GET").toLowerCase();
  const timeout = safeNumber(options.timeout, HOME_TIMEOUT);

  if (verb === "get" && isFn(client.get)) {
    return client.get(path, {
      timeout,
      auth: true,
      headers: options.headers,
      params: options.params,
      raw: options.raw,
      responseType: options.responseType || "auto",
    });
  }

  if (verb === "post" && isFn(client.post)) {
    return client.post(path, options.body, {
      timeout,
      auth: true,
      headers: options.headers,
      params: options.params,
      raw: options.raw,
      responseType: options.responseType || "auto",
    });
  }

  if (verb === "put" && isFn(client.put)) {
    return client.put(path, options.body, {
      timeout,
      auth: true,
      headers: options.headers,
      params: options.params,
      raw: options.raw,
      responseType: options.responseType || "auto",
    });
  }

  if (verb === "patch" && isFn(client.patch)) {
    return client.patch(path, options.body, {
      timeout,
      auth: true,
      headers: options.headers,
      params: options.params,
      raw: options.raw,
      responseType: options.responseType || "auto",
    });
  }

  if (verb === "delete" && isFn(client.delete)) {
    return client.delete(path, {
      timeout,
      auth: true,
      headers: options.headers,
      params: options.params,
      raw: options.raw,
      responseType: options.responseType || "auto",
    });
  }

  if (isFn(client.request)) {
    return client.request(path, {
      method: method.toUpperCase(),
      timeout,
      auth: true,
      headers: options.headers,
      params: options.params,
      body: options.body,
      raw: options.raw,
      responseType: options.responseType || "auto",
    });
  }

  throw createUnavailableError("HOME_API_CLIENT_METHOD_UNAVAILABLE");
}

async function requestViaAppCoreRequest(method = "GET", path = "", options = {}) {
  if (!isFn(AppCore?.request)) {
    throw createUnavailableError("APP_CORE_REQUEST_UNAVAILABLE");
  }

  return AppCore.request(path, {
    method: method.toUpperCase(),
    headers: options.headers,
    params: options.params,
    body: buildRequestBody(options.body),
    timeout: options.timeout,
    auth: true,
    raw: options.raw,
    responseType: options.responseType || "auto",
  });
}

async function requestViaHttpModule(method = "GET", path = "", options = {}) {
  const Http = getHttpModule();

  if (!Http) {
    throw createUnavailableError("HTTP_MODULE_UNAVAILABLE");
  }

  const verb = safeText(method, "GET").toLowerCase();

  if (verb === "get" && isFn(Http.get)) {
    return Http.get(path, {
      headers: options.headers,
      params: options.params,
      timeout: options.timeout,
      auth: true,
      raw: options.raw,
      responseType: options.responseType || "auto",
    });
  }

  if (verb === "post" && isFn(Http.post)) {
    return Http.post(path, options.body, {
      headers: options.headers,
      params: options.params,
      timeout: options.timeout,
      auth: true,
      raw: options.raw,
      responseType: options.responseType || "auto",
    });
  }

  if (verb === "put" && isFn(Http.put)) {
    return Http.put(path, options.body, {
      headers: options.headers,
      params: options.params,
      timeout: options.timeout,
      auth: true,
      raw: options.raw,
      responseType: options.responseType || "auto",
    });
  }

  if (verb === "patch" && isFn(Http.patch)) {
    return Http.patch(path, options.body, {
      headers: options.headers,
      params: options.params,
      timeout: options.timeout,
      auth: true,
      raw: options.raw,
      responseType: options.responseType || "auto",
    });
  }

  if (verb === "delete" && isFn(Http.delete)) {
    return Http.delete(path, {
      headers: options.headers,
      params: options.params,
      timeout: options.timeout,
      auth: true,
      raw: options.raw,
      responseType: options.responseType || "auto",
    });
  }

  if (isFn(Http.request)) {
    return Http.request(path, {
      method: method.toUpperCase(),
      headers: options.headers,
      params: options.params,
      timeout: options.timeout,
      body: options.body,
      auth: true,
      raw: options.raw,
      responseType: options.responseType || "auto",
    });
  }

  throw createUnavailableError("HTTP_MODULE_METHOD_UNAVAILABLE");
}

async function requestViaFetch(method = "GET", path = "", options = {}) {
  if (typeof fetch !== "function") {
    throw createUnavailableError("FETCH_UNAVAILABLE");
  }

  const methodName = safeText(method, "GET").toUpperCase();
  const timeout = safeNumber(options.timeout, HOME_TIMEOUT);

  const url = appendParamsToUrl(
    buildAbsoluteUrl(path),
    options.params
  );

  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, timeout);

  try {
    const headers = {
      ...safeObject(options.headers),
    };

    if (
      hasRequestBody(options.body) &&
      methodName !== "GET" &&
      methodName !== "HEAD" &&
      !isFormDataBody(options.body) &&
      !headers["Content-Type"] &&
      !headers["content-type"]
    ) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method: methodName,
      headers,
      body:
        methodName === "GET" || methodName === "HEAD"
          ? undefined
          : buildRequestBody(options.body),
      signal: controller.signal,
      credentials: options.credentials || "same-origin",
    });

    const contentType = safeText(
      response.headers?.get?.("content-type"),
      ""
    );

    const text = await response.text();

    let data = null;

    if (text) {
      if (contentType.includes("application/json")) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
      } else {
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
      }
    }

    if (!response.ok) {
      const error = new Error(
        normalizeErrorMessage(
          {
            ...safeObject(data),
            status: response.status,
          },
          `HTTP ${response.status} en ${methodName} ${path}`
        )
      );

      error.response = data;
      error.data = data;
      error.status = response.status;
      error.statusCode = response.status;

      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function request(method = "GET", path = "", options = {}) {
  const headers = getRequestHeaders({
    ...safeObject(options.headers),
  });

  const requestOptions = {
    timeout: safeNumber(options.timeout, HOME_TIMEOUT),
    params: options.params,
    body: options.body,
    headers,
    raw: safeBoolean(options.raw, false),
    responseType: options.responseType || "auto",
    credentials: options.credentials,
  };

  const adapters = [
    requestViaApiClient,
    requestViaAppCoreRequest,
    requestViaHttpModule,
    requestViaFetch,
  ];

  let lastUnavailableError = null;

  for (const adapter of adapters) {
    try {
      return await adapter(method, path, requestOptions);
    } catch (error) {
      if (isAdapterUnavailable(error)) {
        lastUnavailableError = error;
        continue;
      }

      throw error;
    }
  }

  throw lastUnavailableError || new Error("HOME_REQUEST_FAILED");
}

/* =========================================================
   RAW REQUESTS
========================================================= */

export async function fetchHomeDashboardRequest({
  allowLegacyFallback = true,
  params = null,
  timeout = HOME_TIMEOUT,
} = {}) {
  const summaryEndpoint = getDashboardEndpoint();

  try {
    return await request("GET", summaryEndpoint, {
      timeout,
      params,
    });
  } catch (error) {
    if (!allowLegacyFallback || !shouldFallbackToLegacyDashboard(error)) {
      throw error;
    }

    return request("GET", getLegacyDashboardEndpoint(), {
      timeout,
      params,
    });
  }
}

export async function fetchHomeHealthRequest({
  timeout = HOME_HEALTH_TIMEOUT,
  params = null,
} = {}) {
  return request("GET", getDashboardPingEndpoint(), {
    timeout,
    params,
  });
}

export async function getHomeDashboardRequest(options = {}) {
  const response = await fetchHomeDashboardRequest(options);
  return normalizeDashboard(response);
}

export async function getHomeWidgetByIdRequest(
  widgetId = "",
  options = {}
) {
  const id = safeText(widgetId, "");

  if (!id) {
    return null;
  }

  const dashboard = await getHomeDashboardRequest(options);
  return findWidgetInCollection(dashboard.widgets, id);
}

/* =========================================================
   CACHE HYDRATE
========================================================= */

export function hydrateHomeFromCache() {
  try {
    const currentDashboard = safeObject(homeState?.dashboard);
    const currentWidgets = safeArray(homeState?.widgets);
    const currentSummary = safeObject(homeState?.summary);
    const currentRecent = safeArray(homeState?.recent);
    const currentRequestId = safeText(homeState?.requestId, "");
    const currentLastSyncAt = first(homeState?.lastSyncAt, null);

    const hasCache =
      Object.keys(currentDashboard).length > 0 ||
      currentWidgets.length > 0 ||
      Object.keys(currentSummary).length > 0 ||
      currentRecent.length > 0;

    if (hasCache) {
      const dashboard = normalizeDashboard({
        ...currentDashboard,
        widgets: currentWidgets.length ? currentWidgets : currentDashboard.widgets,
        summary: Object.keys(currentSummary).length ? currentSummary : currentDashboard.summary,
        recent: currentRecent.length ? currentRecent : currentDashboard.recent,
      });

      replaceHomeStore({
        dashboard,
        widgets: dashboard.widgets,
        summary: dashboard.summary,
        recent: dashboard.recent,
        activity: dashboard.activity,
        tickets: dashboard.tickets,
        incidencias: dashboard.incidencias,
        facturas: dashboard.facturas,
        invoices: dashboard.invoices,
        users: dashboard.users,
        usuarios: dashboard.usuarios,
        clients: dashboard.clients,
        clientes: dashboard.clientes,
        requestId: currentRequestId,
        lastSyncAt: currentLastSyncAt,
      });

      safeCall(setHydrated, true);

      return {
        dashboard,
        widgets: dashboard.widgets,
        summary: dashboard.summary,
        recent: dashboard.recent,
        activity: dashboard.activity,
        requestId: currentRequestId,
        lastSyncAt: currentLastSyncAt,
        hydrated: true,
      };
    }

    return {
      dashboard: {},
      widgets: [],
      summary: {},
      recent: [],
      activity: [],
      requestId: "",
      lastSyncAt: null,
      hydrated: false,
    };
  } catch {
    return {
      dashboard: {},
      widgets: [],
      summary: {},
      recent: [],
      activity: [],
      requestId: "",
      lastSyncAt: null,
      hydrated: false,
    };
  }
}

/* =========================================================
   STATE / STORE SYNC
========================================================= */

function syncHomeDashboard({
  dashboard = {},
  requestId = "",
  lastSyncAt = Date.now(),
} = {}) {
  const normalizedDashboard = normalizeDashboard(dashboard);

  const widgets = safeArray(normalizedDashboard.widgets);
  const summary = safeObject(normalizedDashboard.summary);
  const recent = safeArray(normalizedDashboard.recent);

  replaceHomeStore({
    dashboard: normalizedDashboard,
    widgets,
    summary,
    recent,
    activity: normalizedDashboard.activity,

    tickets: normalizedDashboard.tickets,
    incidencias: normalizedDashboard.incidencias,

    facturas: normalizedDashboard.facturas,
    invoices: normalizedDashboard.invoices,

    users: normalizedDashboard.users,
    usuarios: normalizedDashboard.usuarios,

    clients: normalizedDashboard.clients,
    clientes: normalizedDashboard.clientes,

    requestId,
    lastSyncAt,
  });

  widgets.forEach((item) => {
    if (looksLikeWidget(item)) {
      safeCall(upsertHomeWidgetStore, item);
    }
  });

  setDashboard(normalizedDashboard);
  setWidgets(widgets);
  setSummary(summary);
  setRecent(recent);
  setRequestId(requestId);
  setLastSyncAt(lastSyncAt);
  setLoaded(true);
  safeCall(setHydrated, true);
  setError(null);

  return normalizedDashboard;
}

/* =========================================================
   LOAD DASHBOARD
========================================================= */

export async function loadHomeDashboard({
  force = false,
  allowLegacyFallback = true,
  returnStaleOnError = true,
  params = null,
} = {}) {
  const loadToken = nextLoadToken();

  const cachedDashboard = safeObject(homeState?.dashboard);
  const hasCachedDashboard = Object.keys(cachedDashboard).length > 0;

  const firstLoad = !Boolean(
    homeState?.hydrated ||
      homeState?.loaded ||
      hasCachedDashboard
  );

  const shouldShowLoading = firstLoad && !force;

  safeEmit("home:dashboard:load:start", {
    force: Boolean(force),
    firstLoad,
  });

  try {
    setError(null);

    if (shouldShowLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    const rawResponse = await fetchHomeDashboardRequest({
      allowLegacyFallback,
      params,
    });

    const normalizedResponse = normalizeHomeDashboardResponse(rawResponse);
    const requestId = normalizedResponse.requestId;
    const syncedAt = Date.now();

    if (!isActiveLoadToken(loadToken)) {
      safeEmit("home:dashboard:load:stale", {
        requestId,
      });

      return safeObject(homeState?.dashboard);
    }

    const dashboard = syncHomeDashboard({
      dashboard: normalizedResponse.dashboard,
      requestId,
      lastSyncAt: syncedAt,
    });

    safeEmit("home:dashboard:load:success", {
      requestId,
      widgetsCount: dashboard.widgets.length,
      recentCount: dashboard.recent.length,
      ticketsCount: dashboard.tickets.length,
      invoicesCount: dashboard.facturas.length,
      usersCount: dashboard.users.length,
      clientsCount: dashboard.clients.length,
      syncedAt,
    });

    return dashboard;
  } catch (error) {
    const message = normalizeErrorMessage(
      error,
      "No se pudo cargar el dashboard de inicio."
    );

    if (!isActiveLoadToken(loadToken)) {
      safeEmit("home:dashboard:load:error:stale", {
        message,
      });

      return safeObject(homeState?.dashboard);
    }

    safeError("HOME DASHBOARD LOAD:", error);

    setError(message);
    setLoaded(true);

    safeEmit("home:dashboard:load:error", {
      message,
      error,
    });

    if (returnStaleOnError && hasCachedDashboard) {
      return normalizeDashboard(cachedDashboard);
    }

    throw error;
  } finally {
    if (isActiveLoadToken(loadToken)) {
      setLoading(false);
      setRefreshing(false);
    }
  }
}

/* =========================================================
   LOAD HEALTH
========================================================= */

export async function loadHomeHealth({
  silent = true,
  params = null,
} = {}) {
  try {
    const health = await fetchHomeHealthRequest({
      params,
    });

    const normalizedHealth = safeObject(
      unwrapResponseEnvelope(health)
    );

    safeCall(setHealth, normalizedHealth);

    safeEmit("home:health:success", {
      health: normalizedHealth,
    });

    return normalizedHealth;
  } catch (error) {
    safeError("HOME DASHBOARD PING:", error);

    safeEmit("home:health:error", {
      error,
    });

    if (!silent) {
      throw error;
    }

    return null;
  }
}

/* =========================================================
   REFRESH
========================================================= */

export async function refreshHomeDashboard(options = {}) {
  return loadHomeDashboard({
    ...safeObject(options),
    force: true,
  });
}

/* =========================================================
   DEBUG
========================================================= */

export function getHomeApiSnapshot() {
  const dashboard = normalizeDashboard(homeState?.dashboard || {});

  return {
    endpoints: {
      dashboard: getDashboardEndpoint(),
      legacyDashboard: getLegacyDashboardEndpoint(),
      health: getDashboardPingEndpoint(),
    },

    apiBase: getApiBase(),

    adapters: {
      hasApiClient: Boolean(getHomeApiClient()),
      hasAppCoreRequest: isFn(AppCore?.request),
      hasHttpModule: Boolean(getHttpModule()),
      hasFetch: typeof fetch === "function",
    },

    auth: {
      hasToken: Boolean(getAuthToken()),
    },

    lastLoadToken,

    dashboard: {
      widgetsCount: dashboard.widgets.length,
      ticketsCount: dashboard.tickets.length,
      invoicesCount: dashboard.facturas.length,
      usersCount: dashboard.users.length,
      clientsCount: dashboard.clients.length,
      activityCount: dashboard.activity.length,
      updatedAt: dashboard.updatedAt || null,
    },

    state: {
      loading: Boolean(homeState?.loading),
      refreshing: Boolean(homeState?.refreshing),
      loaded: Boolean(homeState?.loaded),
      hydrated: Boolean(homeState?.hydrated),
      requestId: safeText(homeState?.requestId, ""),
      widgetsCount: safeArray(homeState?.widgets).length,
      recentCount: safeArray(homeState?.recent).length,
      lastSyncAt: homeState?.lastSyncAt || null,
      error: homeState?.error || null,
    },
  };
}

/* =========================================================
   PUBLIC API
========================================================= */

export const HomeApi = Object.freeze({
  endpoints: Object.freeze({
    dashboard: HOME_DASHBOARD_ENDPOINT,
    legacyDashboard: HOME_DASHBOARD_LEGACY_ENDPOINT,
    health: HOME_DASHBOARD_PING_ENDPOINT,
  }),

  timeout: HOME_TIMEOUT,

  getHomeApiClient,

  normalizeDashboard,
  normalizeHomeDashboardResponse,
  resolveHomeWidgetFromDashboard,

  fetchHomeDashboardRequest,
  fetchHomeHealthRequest,

  getHomeDashboardRequest,
  getHomeWidgetByIdRequest,

  hydrateHomeFromCache,

  loadHomeDashboard,
  loadHomeHealth,
  refreshHomeDashboard,

  getHomeApiSnapshot,
});

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default HomeApi;
