/* =========================================================
   Onion Support - Clientes API
   Archivo: /src/views/clientes/clientes.api.js

   CANÓNICO · CURSOR PAGINATION · SINGLE HTTP AUTHORITY

   Responsabilidad:
   - Ser el único adaptador HTTP de Clientes.
   - Listar mediante GET /api/clientes/page con cursor opaco.
   - Resolver detalle mediante GET /api/clientes/:id.
   - Crear mediante POST /api/clientes.
   - Compartir el modelo canónico de clientes.model.js.
   - No drenar páginas, no revivir cache de dataset completo y no duplicar
     política de normalización en Templates o Controllers.
========================================================= */

import Http from "../../core/http.js";
import {
  CLIENTES_MODEL_VERSION,
  normalizeClienteModel,
  normalizeClientesCollection,
  dedupeClientes,
  findClienteById,
  getClienteStableId,
  statusBucket,
  computeClientesStats,
  filterClientes,
} from "./clientes.model.js";

export {
  CLIENTES_MODEL_VERSION,
  normalizeClienteModel,
  normalizeClientesCollection,
  dedupeClientes,
  findClienteById,
  getClienteStableId,
  statusBucket,
  computeClientesStats,
  filterClientes,
};

export const CLIENTES_API_VERSION =
  "clientes.api.cursor.v6.single-authority";

export const CLIENTES_ENDPOINT = "/api/clientes";
export const CLIENTES_PAGE_ENDPOINT = "/api/clientes/page";

export const CLIENTES_FETCH_LIMIT = 50;
export const CLIENTES_LIST_LIMIT = CLIENTES_FETCH_LIMIT;
export const CLIENTES_MAX_LIMIT = 100;
export const CLIENTES_MAX_PAGES = Number.POSITIVE_INFINITY;

export const CLIENTES_CACHE_SCHEMA_VERSION = 6;
export const CLIENTES_CACHE_KEY =
  "onion.support.clientes.api.cache.v6.cursor-disabled";
export const CLIENTES_CACHE_TTL_MS = 0;

export const CLIENTES_TIMEOUT = 15_000;
export const CLIENTES_DETAIL_TIMEOUT = 20_000;
export const CLIENTES_MUTATION_TIMEOUT = 25_000;

const FILTERS = new Set(["all", "active", "pending", "blocked"]);
const ORDERS = new Set(["asc", "desc"]);
const MAX_SEARCH_LENGTH = 120;
const MAX_CURSOR_LENGTH = 7000;
const MAX_ID_LENGTH = 160;
const MAX_USER_ID_LENGTH = 160;
const MAX_NAME_LENGTH = 150;
const MAX_NIF_LENGTH = 20;
const MAX_STREET_LENGTH = 150;
const MAX_POSTAL_LENGTH = 10;
const MAX_CITY_LENGTH = 100;
const MAX_PROVINCE_LENGTH = 100;
const MAX_COUNTRY_LENGTH = 100;
const MAX_EMAIL_LENGTH = 150;
const MAX_PHONE_LENGTH = 30;

const detailInflight = new Map();
const createInflight = new Map();
const detailStore = new Map();
let lastPageItems = [];
let lastPageContext = null;
let lastSyncAt = 0;
let lastError = "";

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

function normalizeEmailText(value = "") {
  return cleanText(value, "").toLowerCase().slice(0, MAX_EMAIL_LENGTH);
}

function normalizePhone(value = "") {
  return cleanText(value, "")
    .replace(/[^\d+()\s.\-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_PHONE_LENGTH);
}

function normalizeClienteType(value = "") {
  const key = cleanText(value, "").toLowerCase();
  if (["empresa", "company", "business", "b2b", "autonomo"].includes(key)) return "empresa";
  if (["particular", "persona", "individual", "b2c"].includes(key)) return "particular";
  return "";
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
    if (!Array.isArray(candidate)) continue;

    const seen = new Set();
    const items = [];
    for (const raw of candidate) {
      const item = normalizeClienteModel(raw);
      const key = getClienteStableId(item).toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
    return items;
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
  if (errorCode(error) !== "CLIENTES_CURSOR_REJECTED") return error;

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

function detailFromResponse(response = null) {
  if (!response) return null;
  if (Array.isArray(response)) return response[0] || null;

  const queue = [response];
  const seen = new Set();
  while (queue.length) {
    const value = queue.shift();
    if (!safeObject(value, null) || seen.has(value)) continue;
    seen.add(value);

    for (const key of ["cliente", "client", "customer", "item", "detail", "record"]) {
      if (safeObject(value[key], null)) return value[key];
    }
    for (const key of ["data", "payload", "result", "response", "body", "value"]) {
      if (safeObject(value[key], null)) queue.push(value[key]);
    }
  }

  const direct = safeObject(response, null);
  if (!direct) return null;
  return getClienteStableId(direct) || direct.nombreFiscal ? direct : null;
}

function createAckFromResponse(response = null) {
  const queue = [response];
  const seen = new Set();
  while (queue.length) {
    const value = queue.shift();
    if (!safeObject(value, null) || seen.has(value)) continue;
    seen.add(value);

    const clienteId = cleanText(
      first(value.clienteId, value.clientId, value.id, ""),
      ""
    ).slice(0, MAX_ID_LENGTH);
    if (clienteId) {
      return {
        ok: value.ok !== false,
        clienteId,
        userId: cleanText(first(value.userId, value.usuarioId, ""), "")
          .slice(0, MAX_USER_ID_LENGTH),
        synced: value.synced === true,
      };
    }

    for (const key of ["data", "payload", "result", "response", "body", "value"]) {
      if (safeObject(value[key], null)) queue.push(value[key]);
    }
  }

  return {
    ok: safeObject(response)?.ok !== false,
    clienteId: "",
    userId: "",
    synced: false,
  };
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

  const query = { limit, filter, order };
  if (search) query.q = search;
  if (cursor) query.cursor = cursor;

  let response;
  try {
    response = await Http.get(CLIENTES_PAGE_ENDPOINT, {
      timeout: clampInt(options.timeout, CLIENTES_TIMEOUT, 1000, 120_000),
      query,
      source: cleanText(options.source, "views.clientes.api.page"),
      signal: options.signal,
    });
  } catch (requestError) {
    lastError = errorMessage(requestError);
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
    lastError = error.message;
    throw error;
  }

  const items = responseItems(response);
  const pagination = normalizedPagination(response);
  const meta = normalizedMeta(response);
  const nextCursor = normalizeCursor(first(
    response?.nextCursor,
    pagination.nextCursor,
    response?.data?.nextCursor,
    ""
  ));
  const hasMore = first(
    response?.hasMore,
    pagination.hasMore,
    response?.data?.hasMore,
    false
  ) === true && Boolean(nextCursor);
  const totalKnown = meta.totalKnown === true;
  const explicitTotal = Number(first(
    response?.total,
    response?.totalCount,
    meta.total,
    pagination.total
  ));
  const total = totalKnown && Number.isFinite(explicitTotal) && explicitTotal >= 0
    ? explicitTotal
    : null;

  lastPageItems = items;
  lastPageContext = Object.freeze({ search, filter, order, limit });
  lastSyncAt = Date.now();
  lastError = "";

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
    context: lastPageContext,
    requestId: cleanText(response?.requestId, "") || null,
    lastSyncAt,
  });
}

/* Compatibility aliases: one server cursor page, never a dataset drain. */
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

function detailKey(id = "") {
  return cleanText(id, "").toLowerCase().slice(0, MAX_ID_LENGTH);
}

export function getClienteByIdRequest(id = "", options = {}) {
  const clienteId = cleanText(id, "").slice(0, MAX_ID_LENGTH);
  if (!clienteId) {
    const error = new Error("Falta el identificador del cliente.");
    error.code = "CLIENTE_ID_REQUIRED";
    return Promise.reject(error);
  }

  const key = detailKey(clienteId);
  if (options.dedupe !== false && detailInflight.has(key)) {
    return detailInflight.get(key);
  }

  let task = null;
  task = Http.get(`${CLIENTES_ENDPOINT}/${encodeURIComponent(clienteId)}`, {
    timeout: clampInt(options.timeout, CLIENTES_DETAIL_TIMEOUT, 1000, 120_000),
    source: cleanText(options.source, "views.clientes.api.detail"),
    signal: options.signal,
  })
    .then((response) => {
      if (responseLooksFailed(response)) {
        const error = new Error(errorMessage(response, "No se pudo cargar el cliente."));
        error.code = cleanText(response?.code, "CLIENTE_DETAIL_REJECTED").toUpperCase();
        throw error;
      }

      const detail = normalizeClienteModel(detailFromResponse(response));
      const returnedId = getClienteStableId(detail);
      if (!returnedId) {
        const error = new Error("El backend no devolvió un cliente válido.");
        error.code = "CLIENTE_DETAIL_INVALID_RESPONSE";
        throw error;
      }
      if (returnedId.toLowerCase() !== clienteId.toLowerCase()) {
        const error = new Error("El backend devolvió un cliente distinto al solicitado.");
        error.code = "CLIENTE_DETAIL_ID_MISMATCH";
        throw error;
      }

      detailStore.set(key, detail);
      lastError = "";
      return detail;
    })
    .catch((error) => {
      lastError = errorMessage(error, "No se pudo cargar el cliente.");
      throw error;
    })
    .finally(() => {
      if (detailInflight.get(key) === task) detailInflight.delete(key);
    });

  detailInflight.set(key, task);
  return task;
}

export async function getClienteById(id = "", options = {}) {
  const key = detailKey(id);
  const cached = detailStore.get(key) || findClienteById(lastPageItems, id);
  if (cached && options.force !== true && options.preferCache !== false) {
    return cached;
  }
  return getClienteByIdRequest(id, options);
}

export const fetchClienteById = getClienteById;
export const fetchClienteDetail = getClienteById;
export const fetchClienteDetailRequest = getClienteByIdRequest;
export const loadClienteDetail = getClienteByIdRequest;
export const getCliente = getClienteById;

function buildCreateClienteBody(payload = {}) {
  const source = safeObject(payload);
  const contacto = safeObject(source.contacto);
  const direccion = safeObject(source.direccion);
  const userId = cleanText(first(
    source.userId,
    source.targetUserId,
    source.usuarioId,
    ""
  ), "").slice(0, MAX_USER_ID_LENGTH);
  const tipo = normalizeClienteType(first(
    source.tipo,
    source.clienteTipo,
    source.segmento,
    source.type,
    ""
  ));
  const nombreFiscal = cleanText(first(
    source.nombreFiscal,
    source.razonSocial,
    source.businessName,
    source.companyName,
    source.displayName,
    source.name,
    ""
  ), "").slice(0, MAX_NAME_LENGTH);
  const contactoEmail = normalizeEmailText(first(
    source.contactoEmail,
    source.email,
    contacto.email,
    source.targetUserEmail,
    ""
  ));

  const body = {
    userId,
    tipo,
    nombreFiscal,
    nif: cleanText(first(source.nif, source.cif, source.taxId, ""), "")
      .toUpperCase().slice(0, MAX_NIF_LENGTH),
    calle: cleanText(first(source.calle, direccion.calle, direccion.street, ""), "")
      .slice(0, MAX_STREET_LENGTH),
    cp: cleanText(first(source.cp, source.postalCode, direccion.cp, direccion.postalCode, ""), "")
      .slice(0, MAX_POSTAL_LENGTH),
    ciudad: cleanText(first(source.ciudad, source.city, direccion.ciudad, direccion.city, ""), "")
      .slice(0, MAX_CITY_LENGTH),
    provincia: cleanText(first(source.provincia, source.province, direccion.provincia, direccion.province, ""), "")
      .slice(0, MAX_PROVINCE_LENGTH),
    pais: cleanText(first(source.pais, source.country, direccion.pais, direccion.country, "España"), "España")
      .slice(0, MAX_COUNTRY_LENGTH),
    contactoNombre: cleanText(first(
      source.contactoNombre,
      source.nombreContacto,
      contacto.nombre,
      contacto.name,
      nombreFiscal,
      ""
    ), nombreFiscal).slice(0, MAX_NAME_LENGTH),
    contactoEmail,
    contactoPhone: normalizePhone(first(
      source.contactoPhone,
      source.phone,
      source.telefono,
      contacto.phone,
      contacto.telefono,
      source.targetUserPhone,
      ""
    )),
  };

  if (!body.userId) {
    const error = new Error("Selecciona un usuario real antes de crear el cliente.");
    error.code = "CLIENTE_USER_ID_REQUIRED";
    throw error;
  }
  if (!body.tipo) {
    const error = new Error("El tipo de cliente debe ser particular o empresa.");
    error.code = "CLIENTE_TYPE_INVALID";
    throw error;
  }
  if (!body.nombreFiscal) {
    const error = new Error("El nombre fiscal es obligatorio.");
    error.code = "CLIENTE_FISCAL_NAME_REQUIRED";
    throw error;
  }
  if (
    contactoEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactoEmail)
  ) {
    const error = new Error("El email de contacto no es válido.");
    error.code = "CLIENTE_CONTACT_EMAIL_INVALID";
    throw error;
  }
  return body;
}

export function createCliente(payload = {}, options = {}) {
  let body;
  try {
    body = buildCreateClienteBody(payload);
  } catch (error) {
    return Promise.reject(error);
  }

  const key = body.userId.toLowerCase();
  if (options.dedupe !== false && createInflight.has(key)) {
    return createInflight.get(key);
  }

  let task = null;
  task = Http.post(CLIENTES_ENDPOINT, body, {
    timeout: clampInt(options.timeout, CLIENTES_MUTATION_TIMEOUT, 1000, 120_000),
    source: cleanText(options.source, "views.clientes.api.create"),
    signal: options.signal,
  })
    .then((response) => {
      if (responseLooksFailed(response)) {
        const error = new Error(errorMessage(response, "El backend rechazó la creación del cliente."));
        error.code = cleanText(response?.code, "CLIENTE_CREATE_REJECTED").toUpperCase();
        throw error;
      }

      const ack = createAckFromResponse(response);
      if (ack.ok === false || !ack.clienteId) {
        const error = new Error(
          ack.ok === false
            ? "El backend rechazó la creación del cliente."
            : "El backend no devolvió el identificador del cliente creado."
        );
        error.code = ack.ok === false
          ? "CLIENTE_CREATE_REJECTED"
          : "CLIENTE_CREATE_INVALID_RESPONSE";
        throw error;
      }

      detailStore.delete(detailKey(ack.clienteId));
      lastPageItems = [];
      lastPageContext = null;
      lastSyncAt = 0;
      lastError = "";

      return {
        ok: true,
        clienteId: ack.clienteId,
        id: ack.clienteId,
        userId: cleanText(first(ack.userId, body.userId), body.userId)
          .slice(0, MAX_USER_ID_LENGTH),
        synced: ack.synced === true,
      };
    })
    .catch((error) => {
      lastError = errorMessage(error, "No se pudo crear el cliente.");
      throw error;
    })
    .finally(() => {
      if (createInflight.get(key) === task) createInflight.delete(key);
    });

  createInflight.set(key, task);
  return task;
}

export const createClienteRequest = createCliente;

function unsupportedMutation(method = "PATCH") {
  const verb = cleanText(method, "PATCH").toUpperCase();
  const error = new Error(
    `${verb} /api/clientes/:id no forma parte del contrato productivo actual.`
  );
  error.code = `CLIENTES_${verb}_NOT_SUPPORTED`;
  error.status = 405;
  return error;
}

export async function updateCliente() {
  throw unsupportedMutation("PATCH");
}
export const updateClienteRequest = updateCliente;
export async function patchCliente() {
  throw unsupportedMutation("PATCH");
}
export async function putCliente() {
  throw unsupportedMutation("PUT");
}
export async function deleteCliente() {
  throw unsupportedMutation("DELETE");
}
export const deleteClienteRequest = deleteCliente;

export function getClienteByIdStore(id = "") {
  return detailStore.get(detailKey(id)) || findClienteById(lastPageItems, id);
}

export function getItems() {
  return lastPageItems.map((item) => ({ ...item }));
}
export function getClientesCount() {
  return lastPageItems.length;
}
export function hasClientes() {
  return getClientesCount() > 0;
}
export async function loadClientesStats() {
  return computeClientesStats(lastPageItems);
}

export function clearClientesCache() {
  detailInflight.clear();
  createInflight.clear();
  detailStore.clear();
  lastPageItems = [];
  lastPageContext = null;
  lastSyncAt = 0;
  lastError = "";
  return true;
}

export function getClientesStoreSnapshot() {
  const items = getItems();
  return {
    version: CLIENTES_API_VERSION,
    items,
    clientes: items,
    clients: items,
    rows: items,
    total: null,
    totalKnown: false,
    count: items.length,
    loading: false,
    refreshing: false,
    loaded: Boolean(lastSyncAt),
    hydrated: false,
    lastSyncAt,
    stats: computeClientesStats(items),
  };
}
export const getClientesStateSnapshot = getClientesStoreSnapshot;
export const getState = getClientesStoreSnapshot;

export function getClientesApiSnapshot() {
  return {
    ...getClientesStoreSnapshot(),
    version: CLIENTES_API_VERSION,
    modelVersion: CLIENTES_MODEL_VERSION,
    endpoint: CLIENTES_ENDPOINT,
    pageEndpoint: CLIENTES_PAGE_ENDPOINT,
    cacheKey: CLIENTES_CACHE_KEY,
    cacheSchemaVersion: CLIENTES_CACHE_SCHEMA_VERSION,
    pageContext: lastPageContext,
    detailInFlight: detailInflight.size,
    createInFlight: createInflight.size,
    lastError: lastError ? { message: lastError, code: "CLIENTES_ERROR" } : null,
    backendContract: Object.freeze({
      list: "GET /api/clientes/page",
      detail: "GET /api/clientes/:id",
      create: "POST /api/clientes",
      update: false,
      delete: false,
      pagination: "cursor",
      totalKnown: false,
    }),
    safeguards: Object.freeze({
      singleModelAuthority: true,
      singleHttpAuthority: true,
      cursorPagination: true,
      cursorRejectedNormalizesToSafeReset: true,
      noAutomaticPageDrain: true,
      noLegacyDatasetCache: true,
      serverSearch: true,
      serverFilter: true,
      serverOrder: true,
      externalAbortSignal: true,
      detailSingleFlight: true,
      createSingleFlightByUser: true,
      createAckIsNotDetail: true,
    }),
  };
}

export const getSnapshot = getClientesApiSnapshot;
export const getDebugSnapshot = getClientesApiSnapshot;

export default Object.freeze({
  version: CLIENTES_API_VERSION,
  modelVersion: CLIENTES_MODEL_VERSION,
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
  getClienteById,
  getClienteByIdRequest,
  fetchClienteById,
  fetchClienteDetail,
  fetchClienteDetailRequest,
  loadClienteDetail,
  getCliente,
  createCliente,
  createClienteRequest,
  updateCliente,
  updateClienteRequest,
  patchCliente,
  putCliente,
  deleteCliente,
  deleteClienteRequest,
  getClienteByIdStore,
  getClientesStoreSnapshot,
  getClientesStateSnapshot,
  getClientesApiSnapshot,
  getState,
  getSnapshot,
  getDebugSnapshot,
  getItems,
  getClientesCount,
  hasClientes,
  clearClientesCache,
  normalizeClienteModel,
  normalizeClientesCollection,
  dedupeClientes,
  findClienteById,
  filterClientes,
  computeClientesStats,
  loadClientesStats,
  statusBucket,
});
