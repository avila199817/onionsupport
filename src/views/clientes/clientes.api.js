/* =========================================================
   Onion Support - Clientes API
   Cursor-paginated list adapter + legacy-safe detail/create exports
========================================================= */

import Http from "../../core/http.js";
import LegacyClientesApi, {
  normalizeClienteModel,
  normalizeClientesCollection,
} from "./clientes.api.legacy.js";

export * from "./clientes.api.legacy.js";

export const CLIENTES_API_VERSION =
  "clientes.api.cursor.v5.server-pagination";

export const CLIENTES_ENDPOINT = "/api/clientes";
export const CLIENTES_PAGE_ENDPOINT = "/api/clientes/page";

export const CLIENTES_FETCH_LIMIT = 50;
export const CLIENTES_LIST_LIMIT = CLIENTES_FETCH_LIMIT;
export const CLIENTES_MAX_LIMIT = 100;
export const CLIENTES_MAX_PAGES = Number.POSITIVE_INFINITY;

export const CLIENTES_CACHE_SCHEMA_VERSION = 5;
export const CLIENTES_CACHE_KEY =
  "onion.support.clientes.api.cache.v5.cursor-disabled";
export const CLIENTES_CACHE_TTL_MS = 0;

export const CLIENTES_TIMEOUT = 15_000;

const FILTERS = new Set(["all", "active", "pending", "blocked"]);
const ORDERS = new Set(["asc", "desc"]);
const MAX_SEARCH_LENGTH = 120;
const MAX_CURSOR_LENGTH = 7000;

function cleanText(value = "", fallback = "") {
  const text = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || fallback;
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return null;
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeFilter(value = "all") {
  const filter = cleanText(value, "all").toLowerCase();
  return FILTERS.has(filter) ? filter : "all";
}

function normalizeOrder(value = "desc") {
  const order = cleanText(value, "desc").toLowerCase();
  return ORDERS.has(order) ? order : "desc";
}

function normalizeSearch(value = "") {
  return cleanText(value, "").slice(0, MAX_SEARCH_LENGTH);
}

function normalizeCursor(value = "") {
  return cleanText(value, "").slice(0, MAX_CURSOR_LENGTH);
}

function responseItems(response = {}) {
  const data = safeObject(response);
  for (const candidate of [
    data.items,
    data.clientes,
    data.clients,
    data.rows,
    data.results,
    data.data?.items,
    data.data?.clientes,
  ]) {
    if (Array.isArray(candidate)) {
      const seen = new Set();
      const items = [];
      for (const raw of candidate) {
        const item = normalizeClienteModel(raw);
        const key = cleanText(
          first(
            item.clienteId,
            item.clientId,
            item.customerId,
            item.id,
            item._id,
            item.uid,
            ""
          ),
          ""
        ).toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        items.push(item);
      }
      return items;
    }
  }
  return [];
}

function responseLooksFailed(response = {}) {
  const data = safeObject(response);
  return data.ok === false || data.success === false;
}

function errorMessage(response = {}, fallback = "No se pudieron cargar los clientes.") {
  const data = safeObject(response);
  return cleanText(
    first(
      data.message,
      data.error?.message,
      data.error,
      data.code,
      data.data?.message,
      data.response?.data?.message,
      fallback
    ),
    fallback
  );
}

function errorCode(error = null) {
  return cleanText(
    first(
      error?.code,
      error?.data?.code,
      error?.payload?.code,
      error?.response?.data?.code,
      error?.response?.code,
      error?.error,
      ""
    ),
    ""
  ).toUpperCase();
}

function normalizePageError(error = null) {
  if (errorCode(error) !== "CLIENTES_CURSOR_REJECTED") {
    return error;
  }

  const normalized = new Error(
    errorMessage(error, "El cursor de clientes ya no es válido.")
  );
  normalized.name = cleanText(error?.name, "Error");
  normalized.code = "CLIENTES_CURSOR_INVALID";
  normalized.status = Number(
    first(
      error?.status,
      error?.statusCode,
      error?.response?.status,
      error?.response?.data?.status,
      400
    )
  ) || 400;
  return normalized;
}

function normalizedMeta(response = {}) {
  const data = safeObject(response);
  return safeObject(first(data.meta, data.data?.meta, {}), {});
}

function normalizedPagination(response = {}) {
  const data = safeObject(response);
  return safeObject(first(data.pagination, data.data?.pagination, {}), {});
}

export async function fetchClientesPage(options = {}) {
  const limit = clampInt(
    first(options.limit, options.pageSize, CLIENTES_FETCH_LIMIT),
    CLIENTES_FETCH_LIMIT,
    1,
    CLIENTES_MAX_LIMIT
  );
  const search = normalizeSearch(first(options.q, options.search, options.query, ""));
  const filter = normalizeFilter(options.filter);
  const order = normalizeOrder(first(options.order, options.sortOrder, "desc"));
  const cursor = normalizeCursor(options.cursor);

  const query = {
    limit,
    filter,
    order,
  };

  if (search) {
    query.q = search;
  }
  if (cursor) {
    query.cursor = cursor;
  }

  let response;
  try {
    response = await Http.get(CLIENTES_PAGE_ENDPOINT, {
      timeout: clampInt(options.timeout, CLIENTES_TIMEOUT, 1000, 120_000),
      query,
      source: cleanText(options.source, "views.clientes.api.page"),
      signal: options.signal,
    });
  } catch (requestError) {
    throw normalizePageError(requestError);
  }

  if (responseLooksFailed(response)) {
    const error = new Error(errorMessage(response));
    const code = cleanText(
      first(response?.code, response?.error, "CLIENTES_PAGE_REJECTED")
    ).toUpperCase();
    error.code = code === "CLIENTES_CURSOR_REJECTED"
      ? "CLIENTES_CURSOR_INVALID"
      : code;
    error.status = Number(response?.status || 400) || 400;
    throw error;
  }

  const items = responseItems(response);
  const pagination = normalizedPagination(response);
  const meta = normalizedMeta(response);

  const nextCursor = normalizeCursor(
    first(
      response?.nextCursor,
      pagination.nextCursor,
      response?.data?.nextCursor,
      ""
    )
  );

  const hasMore =
    first(response?.hasMore, pagination.hasMore, response?.data?.hasMore, false) === true &&
    Boolean(nextCursor);

  const totalKnown = meta.totalKnown === true;
  const explicitTotal = Number(
    first(response?.total, response?.totalCount, meta.total, pagination.total)
  );
  const total =
    totalKnown && Number.isFinite(explicitTotal) && explicitTotal >= 0
      ? explicitTotal
      : null;

  return Object.freeze({
    ok: true,
    items,
    clientes: items,
    clients: items,
    rows: items,
    count: items.length,
    hasMore,
    nextCursor,
    pagination: Object.freeze({
      ...pagination,
      mode: cleanText(pagination.mode, "cursor"),
      pageSize: clampInt(pagination.pageSize, limit, 1, CLIENTES_MAX_LIMIT),
      hasMore,
      nextCursor,
    }),
    meta: Object.freeze({
      ...meta,
      totalKnown,
      filter,
      order,
      search: safeObject(meta.search, {
        applied: Boolean(search),
        query: search || null,
      }),
    }),
    total,
    totalKnown,
    context: Object.freeze({
      search,
      filter,
      order,
      limit,
    }),
    requestId: cleanText(response?.requestId, "") || null,
    lastSyncAt: Date.now(),
  });
}

/*
  Compatibility aliases intentionally return ONE cursor page only.
  Nothing here walks every continuation token or recreates the former
  unbounded "dataset complete" cache.
*/
export async function loadClientes(options = {}) {
  return fetchClientesPage(options);
}

export async function refreshClientes(options = {}) {
  return fetchClientesPage({ ...options, force: true });
}

export async function fetchClientes(options = {}) {
  return fetchClientesPage(options);
}

export async function listClientes(options = {}) {
  return fetchClientesPage(options);
}

export async function getClientes(options = {}) {
  return fetchClientesPage(options);
}

export async function fetchClientesRequest(options = {}) {
  return fetchClientesPage(options);
}

/*
  Cursor pagination invalidates the old list-cache model. Returning an empty,
  explicit cache miss prevents a stale full-dataset snapshot from masquerading
  as the first page of a new query context.
*/
export function hydrateClientesFromCache() {
  return Object.freeze({
    ok: false,
    cached: false,
    stale: true,
    items: [],
    clientes: [],
    clients: [],
    rows: [],
    total: null,
    totalKnown: false,
    hasMore: false,
    nextCursor: "",
    lastSyncAt: 0,
    cache: Object.freeze({
      hydrated: false,
      fresh: false,
      key: CLIENTES_CACHE_KEY,
      schemaVersion: CLIENTES_CACHE_SCHEMA_VERSION,
      ttlMs: 0,
    }),
  });
}

export function getClientesApiSnapshot() {
  const legacy = typeof LegacyClientesApi?.getSnapshot === "function"
    ? LegacyClientesApi.getSnapshot()
    : {};

  return {
    ...safeObject(legacy),
    version: CLIENTES_API_VERSION,
    endpoint: CLIENTES_ENDPOINT,
    pageEndpoint: CLIENTES_PAGE_ENDPOINT,
    cacheKey: CLIENTES_CACHE_KEY,
    cacheSchemaVersion: CLIENTES_CACHE_SCHEMA_VERSION,
    backendContract: Object.freeze({
      list: "GET /api/clientes/page",
      legacyList: "GET /api/clientes",
      detail: "GET /api/clientes/:id",
      create: "POST /api/clientes",
      pagination: "cursor",
      totalKnown: false,
    }),
    safeguards: Object.freeze({
      cursorPagination: true,
      cursorRejectedNormalizesToSafeReset: true,
      noAutomaticPageDrain: true,
      noLegacyDatasetCache: true,
      serverSearch: true,
      serverFilter: true,
      serverOrder: true,
      externalAbortSignal: true,
    }),
  };
}

export const getSnapshot = getClientesApiSnapshot;
export const getDebugSnapshot = getClientesApiSnapshot;

export default Object.freeze({
  ...LegacyClientesApi,
  version: CLIENTES_API_VERSION,
  endpoint: CLIENTES_ENDPOINT,
  pageEndpoint: CLIENTES_PAGE_ENDPOINT,
  fetchClientesPage,
  loadClientes,
  refreshClientes,
  fetchClientes,
  listClientes,
  getClientes,
  fetchClientesRequest,
  hydrateClientesFromCache,
  getClientesApiSnapshot,
  getSnapshot,
  getDebugSnapshot,
  normalizeClienteModel,
  normalizeClientesCollection,
});
