/* =========================================================
   Onion SPA - Incidencias API
   Archivo: src/views/incidencias/incidencias.api.js

   FINAL PRO SYSTEM · API LAYER · 10/10

   RESPONSABILIDADES:
   - centralizar llamadas HTTP del módulo incidencias
   - exponer listado + detalle + create
   - soportar refresh forzado
   - hidratar state/store de forma coherente
   - normalizar payloads backend heterogéneos
   - soportar múltiples adapters de request
   - prevenir race conditions blandas en cargas de listado

   HARDENING PRO:
   - get detalle devuelve objeto limpio y rico
   - soporta envelopes heterogéneos
   - soporta arrays / nested envelopes / payloads mixtos
   - fallback AppCore.apiClient -> AppCore.request -> Http -> fetch
   - persistencia coherente en store/state
   - errores con mensaje consistente
   - surface pública estable
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  incidenciasState,
  setLoading,
  setRefreshing,
  setError,
  setItems,
  setRemoteCount,
  setLastSyncAt,
  setLoaded,
} from "./incidencias.state.js";

import {
  replaceIncidenciasStore,
  upsertIncidenciaStore,
} from "./incidencias.store.js";

/* =========================================================
   CONFIG
========================================================= */

export const INCIDENCIAS_RESOURCE = "tickets";
export const INCIDENCIAS_ENDPOINT = "/api/tickets";
export const INCIDENCIAS_TIMEOUT = 15000;

let lastLoadToken = 0;

/* =========================================================
   SAFE HELPERS
========================================================= */

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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
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

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/* =========================================================
   LOAD TOKEN
========================================================= */

function nextLoadToken() {
  lastLoadToken += 1;
  return lastLoadToken;
}

function isActiveLoadToken(token) {
  return token === lastLoadToken;
}

/* =========================================================
   URL / AUTH HELPERS
========================================================= */

function getApiBase() {
  const apiBase = safeText(AppCore?.config?.apiBase, "");
  return apiBase.replace(/\/+$/, "");
}

function buildAbsoluteUrl(path = "") {
  const cleanPath = safeText(path, "");

  if (!cleanPath) {
    return getApiBase();
  }

  if (/^https?:\/\//i.test(cleanPath)) {
    return cleanPath;
  }

  return `${getApiBase()}${cleanPath}`;
}

function getAuthToken() {
  return safeText(
    first(
      AppCore?.state?.token,
      AppCore?.state?.accessToken,
      AppCore?.auth?.getToken?.(),
      AppCore?.Auth?.getToken?.(),
      localStorage.getItem("token"),
      sessionStorage.getItem("token")
    ),
    ""
  );
}

function getRequestHeaders(extraHeaders = {}) {
  const token = getAuthToken();

  return {
    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),
    ...safeObject(extraHeaders),
  };
}

function getApiClient() {
  return AppCore?.apiClient || null;
}

function getHttpModule() {
  return (
    AppCore?.modules?.Http ||
    AppCore?.Http ||
    window?.Http ||
    null
  );
}

export function normalizeIncidenciaId(id = "") {
  const ticketId = safeText(id, "");

  if (!ticketId) {
    throw new Error("INCIDENCIA_ID_REQUIRED");
  }

  return ticketId;
}

export function getIncidenciaEndpoint(id = "") {
  const ticketId = normalizeIncidenciaId(id);
  return `${INCIDENCIAS_ENDPOINT}/${encodeURIComponent(ticketId)}`;
}

/* =========================================================
   ERROR HELPERS
========================================================= */

function normalizeErrorMessage(error = null, fallback = "Error de API.") {
  return safeText(
    first(
      error?.message,
      error?.response?.message,
      error?.response?.data?.message,
      error?.data?.message,
      error?.error,
      error?.detail,
      fallback
    ),
    fallback
  );
}

/* =========================================================
   DOMAIN NORMALIZATION
========================================================= */

export function normalizeIncidencia(item = {}) {
  const raw = safeObject(item);

  const cliente = safeObject(
    first(
      raw.cliente,
      raw.client,
      raw.customer
    )
  );

  const tecnico = safeObject(
    first(
      raw.tecnico,
      raw.assignedTo,
      raw.assignee
    )
  );

  const createdBy = safeObject(raw.createdBy);
  const receptor = safeObject(raw.receptor);

  const attachments = safeArray(
    first(
      raw.attachments,
      raw.files,
      raw.adjuntos
    )
  );

  const history = safeArray(
    first(
      raw.history,
      raw.timeline,
      raw.logs
    )
  );

  const comments = safeArray(
    first(
      raw.comments,
      raw.notes,
      raw.messages
    )
  );

  return {
    id: safeText(
      first(
        raw.id,
        raw.ticketId,
        raw._id
      ),
      ""
    ),

    ticketId: safeText(
      first(
        raw.ticketId,
        raw.id,
        raw._id
      ),
      ""
    ),

    code: safeText(
      first(
        raw.code,
        raw.ticketCode,
        raw.codigo,
        raw.ticketId,
        raw.id
      ),
      ""
    ),

    title: safeText(
      first(
        raw.title,
        raw.subject,
        raw.asunto
      ),
      ""
    ),

    subject: safeText(
      first(
        raw.subject,
        raw.asunto,
        raw.title
      ),
      ""
    ),

    description: safeText(
      first(
        raw.description,
        raw.descripcion,
        raw.message,
        raw.body,
        raw.preview
      ),
      ""
    ),

    message: safeText(
      first(
        raw.message,
        raw.descripcion,
        raw.description,
        raw.body,
        raw.preview
      ),
      ""
    ),

    preview: safeText(
      first(
        raw.preview,
        raw.message,
        raw.descripcion,
        raw.description
      ),
      ""
    ),

    status: safeText(
      first(
        raw.status,
        raw.estado
      ),
      "open"
    ),

    priority: safeText(
      first(
        raw.priority,
        raw.prioridad
      ),
      "normal"
    ),

    category: safeText(
      first(
        raw.category,
        raw.categoria,
        raw.tipo
      ),
      ""
    ),

    categoria: safeText(
      first(
        raw.categoria,
        raw.category,
        raw.tipo
      ),
      ""
    ),

    tipo: safeText(
      first(
        raw.tipo,
        raw.categoria,
        raw.category
      ),
      ""
    ),

    source: safeText(
      first(
        raw.source,
        raw.origen,
        raw.channel
      ),
      "panel"
    ),

    createdAt: first(
      raw.createdAt,
      raw.fechaCreacion,
      raw.created_at,
      raw.createdAtES,
      null
    ),

    updatedAt: first(
      raw.updatedAt,
      raw.fechaActualizacion,
      raw.updated_at,
      raw.modifiedAt,
      raw.lastUpdate,
      raw.createdAt,
      null
    ),

    closedAt: first(
      raw.closedAt,
      raw.closed_at,
      null
    ),

    assignedTo: first(
      raw.assignedTo,
      raw.assignee,
      raw.asignadoA,
      tecnico,
      null
    ),

    assignedToName: safeText(
      first(
        tecnico?.name,
        tecnico?.nombre,
        raw.assignedToName,
        typeof raw.assignedTo === "string" ? raw.assignedTo : null,
        typeof raw.assignee === "string" ? raw.assignee : null
      ),
      ""
    ),

    requester: first(
      raw.requester,
      raw.user,
      raw.usuario,
      cliente,
      createdBy,
      receptor,
      null
    ),

    clientName: safeText(
      first(
        raw.clientName,
        raw.name,
        cliente?.nombre,
        cliente?.name,
        receptor?.name,
        createdBy?.name
      ),
      ""
    ),

    clientEmail: safeText(
      first(
        raw.clientEmail,
        raw.email,
        cliente?.email,
        receptor?.email,
        createdBy?.email
      ),
      ""
    ),

    clientAvatar: safeText(
      first(
        raw.clientAvatar,
        raw.avatar,
        raw.avatarUrl,
        cliente?.avatar,
        cliente?.avatarUrl
      ),
      ""
    ),

    cliente,
    tecnico,
    createdBy,
    receptor,

    attachments,
    attachmentsCount: attachments.length,

    history,
    historyCount: history.length,

    comments,
    commentsCount: comments.length,

    email: safeText(raw.email, ""),
    name: safeText(raw.name, ""),
    userId: safeText(first(raw.userId, raw.clienteId), ""),
    clienteId: safeText(first(raw.clienteId, raw.userId), ""),
    fechaProgramada: first(raw.fechaProgramada, null),
    ip: safeText(raw.ip, ""),

    raw,
  };
}

function looksLikeTicket(value = null) {
  const obj = safeObject(value);

  return Boolean(
    obj.ticketId ||
      obj.id ||
      obj._id ||
      obj.code ||
      obj.ticketCode ||
      obj.title ||
      obj.subject ||
      obj.asunto
  );
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

function unwrapResponseEnvelope(payload = null) {
  if (payload === null || payload === undefined) {
    return null;
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (!Object.keys(obj).length) {
    return payload;
  }

  if (Array.isArray(obj.items)) {
    return obj.items;
  }

  if (Array.isArray(obj.tickets)) {
    return obj.tickets;
  }

  if (Array.isArray(obj.data)) {
    return obj.data;
  }

  if (Array.isArray(obj.results)) {
    return obj.results;
  }

  if (Array.isArray(obj.rows)) {
    return obj.rows;
  }

  if (obj.ticket) {
    return obj.ticket;
  }

  if (obj.item) {
    return obj.item;
  }

  if (obj.result) {
    return obj.result;
  }

  if (obj.payload) {
    return unwrapResponseEnvelope(obj.payload);
  }

  if (obj.data && typeof obj.data === "object") {
    return unwrapResponseEnvelope(obj.data);
  }

  return obj;
}

function pickItems(payload = null) {
  const unwrapped = unwrapResponseEnvelope(payload);

  if (Array.isArray(unwrapped)) {
    return unwrapped;
  }

  const obj = safeObject(payload);

  if (Array.isArray(obj?.data?.items)) {
    return obj.data.items;
  }

  if (Array.isArray(obj?.data?.tickets)) {
    return obj.data.tickets;
  }

  if (Array.isArray(obj?.payload?.items)) {
    return obj.payload.items;
  }

  if (Array.isArray(obj?.payload?.tickets)) {
    return obj.payload.tickets;
  }

  return [];
}

function pickTotal(payload = null, fallback = 0) {
  const obj = safeObject(payload);

  const candidates = [
    obj?.total,
    obj?.count,
    obj?.remoteCount,
    obj?.pagination?.total,
    obj?.meta?.total,
    obj?.data?.total,
    obj?.data?.count,
    obj?.payload?.total,
    obj?.payload?.count,
    fallback,
  ];

  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
  }

  return fallback;
}

function pickDetail(payload = null) {
  if (!payload) {
    return null;
  }

  if (Array.isArray(payload)) {
    return payload[0] || null;
  }

  if (looksLikeTicket(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (looksLikeTicket(obj.ticket)) {
    return obj.ticket;
  }

  if (looksLikeTicket(obj.item)) {
    return obj.item;
  }

  if (looksLikeTicket(obj.result)) {
    return obj.result;
  }

  if (looksLikeTicket(obj.payload)) {
    return obj.payload;
  }

  if (looksLikeTicket(obj.data)) {
    return obj.data;
  }

  if (obj.data && typeof obj.data === "object") {
    return pickDetail(obj.data);
  }

  if (obj.payload && typeof obj.payload === "object") {
    return pickDetail(obj.payload);
  }

  return Object.keys(obj).length ? obj : null;
}

function pickCreatedTicket(payload = null) {
  return pickDetail(payload);
}

function normalizeIncidenciasListResponse(response = null) {
  const rawItems = safeArray(pickItems(response));
  const items = rawItems.map(normalizeIncidencia);
  const total = pickTotal(response, items.length);

  return {
    ok: true,
    items,
    total,
    raw: response,
  };
}

function normalizeIncidenciaDetailResponse(response = null) {
  const detail = pickDetail(response);

  return {
    ok: true,
    item: detail
      ? normalizeIncidencia(detail)
      : null,
    raw: response,
  };
}

/* =========================================================
   REQUEST ADAPTERS
========================================================= */

async function requestViaApiClient(method = "GET", path = "", options = {}) {
  const client = getApiClient();

  if (!client) {
    throw new Error("INCIDENCIAS_API_CLIENT_UNAVAILABLE");
  }

  const verb = safeText(method, "GET").toLowerCase();
  const timeout = safeNumber(options.timeout, INCIDENCIAS_TIMEOUT);

  if (verb === "get" && typeof client.get === "function") {
    return client.get(path, {
      timeout,
      auth: true,
      headers: options.headers,
      query: options.query,
      params: options.params,
    });
  }

  if (verb === "post" && typeof client.post === "function") {
    return client.post(path, options.body, {
      timeout,
      auth: true,
      headers: options.headers,
      query: options.query,
      params: options.params,
    });
  }

  if (typeof client.request === "function") {
    return client.request(path, {
      method: method.toUpperCase(),
      timeout,
      auth: true,
      headers: options.headers,
      query: options.query,
      params: options.params,
      body: options.body,
    });
  }

  throw new Error("INCIDENCIAS_API_CLIENT_METHOD_UNAVAILABLE");
}

async function requestViaAppCoreRequest(method = "GET", path = "", options = {}) {
  if (typeof AppCore?.request !== "function") {
    throw new Error("APP_CORE_REQUEST_UNAVAILABLE");
  }

  return AppCore.request(path, {
    method: method.toUpperCase(),
    timeout: options.timeout,
    headers: options.headers,
    query: options.query,
    params: options.params,
    body: options.body,
  });
}

async function requestViaHttpModule(method = "GET", path = "", options = {}) {
  const Http = getHttpModule();

  if (!Http) {
    throw new Error("HTTP_MODULE_UNAVAILABLE");
  }

  const verb = safeText(method, "GET").toLowerCase();

  if (verb === "get" && typeof Http.get === "function") {
    return Http.get(path, {
      headers: options.headers,
      query: options.query,
      params: options.params,
      timeout: options.timeout,
    });
  }

  if (verb === "post" && typeof Http.post === "function") {
    return Http.post(path, options.body, {
      headers: options.headers,
      query: options.query,
      params: options.params,
      timeout: options.timeout,
    });
  }

  if (typeof Http.request === "function") {
    return Http.request(path, {
      method: method.toUpperCase(),
      headers: options.headers,
      query: options.query,
      params: options.params,
      timeout: options.timeout,
      body: options.body,
    });
  }

  throw new Error("HTTP_MODULE_METHOD_UNAVAILABLE");
}

async function requestViaFetch(method = "GET", path = "", options = {}) {
  const url = buildAbsoluteUrl(path);
  const controller = new AbortController();

  const timeout = safeNumber(options.timeout, INCIDENCIAS_TIMEOUT);

  const timeoutId = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, timeout);

  try {
    const response = await fetch(url, {
      method: method.toUpperCase(),
      headers: options.headers,
      body:
        options.body === undefined || options.body === null
          ? undefined
          : JSON.stringify(options.body),
      signal: controller.signal,
    });

    const text = await response.text();

    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const error = new Error(
        normalizeErrorMessage(
          data,
          `HTTP ${response.status} en ${method.toUpperCase()} ${path}`
        )
      );

      error.response = data;
      error.status = response.status;

      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function request(method = "GET", path = "", options = {}) {
  const requestOptions = {
    timeout: safeNumber(options.timeout, INCIDENCIAS_TIMEOUT),
    query: safeObject(options.query),
    params: safeObject(options.params),
    body: options.body,
    headers: getRequestHeaders({
      ...(options.body !== undefined && options.body !== null
        ? {
            "Content-Type": "application/json",
          }
        : {}),
      ...safeObject(options.headers),
    }),
  };

  const adapters = [
    requestViaApiClient,
    requestViaAppCoreRequest,
    requestViaHttpModule,
    requestViaFetch,
  ];

  let lastError = null;

  for (const adapter of adapters) {
    try {
      return await adapter(method, path, requestOptions);
    } catch (error) {
      lastError = error;
    }
  }

  throw (
    lastError ||
    new Error("INCIDENCIAS_REQUEST_FAILED")
  );
}

/* =========================================================
   RAW REQUESTS
========================================================= */

export async function fetchIncidenciasRequest({
  timeout = INCIDENCIAS_TIMEOUT,
  query = {},
} = {}) {
  return request("GET", INCIDENCIAS_ENDPOINT, {
    timeout,
    query,
  });
}

export async function getIncidenciaByIdRequest(
  id = "",
  {
    timeout = INCIDENCIAS_TIMEOUT,
  } = {}
) {
  const response = await request("GET", getIncidenciaEndpoint(id), {
    timeout,
  });

  return normalizeIncidenciaDetailResponse(response).item;
}

export async function createIncidenciaRequest(
  payload = {},
  {
    timeout = INCIDENCIAS_TIMEOUT,
  } = {}
) {
  const response = await request("POST", INCIDENCIAS_ENDPOINT, {
    timeout,
    body: safeObject(payload),
  });

  const created = pickCreatedTicket(response);

  return created
    ? normalizeIncidencia(created)
    : response;
}

/* =========================================================
   CACHE HYDRATE
========================================================= */

export function hydrateFromCache() {
  try {
    const current = safeArray(incidenciasState?.items);

    if (current.length) {
      replaceIncidenciasStore(current);
    }

    return current;
  } catch {
    return [];
  }
}

/* =========================================================
   STATE HYDRATION
========================================================= */

function applyLoadedListToState(normalized = { items: [], total: 0 }) {
  const items = safeArray(normalized?.items);
  const total = safeNumber(normalized?.total, items.length);

  replaceIncidenciasStore(items);
  setItems(items);
  setRemoteCount(total);
  setLastSyncAt(Date.now());
  setLoaded(true);
  setError(null);

  return items;
}

/* =========================================================
   LOAD LIST
========================================================= */

export async function loadIncidencias({
  force = false,
  query = {},
} = {}) {
  const loadToken = nextLoadToken();

  const firstLoad = !Boolean(incidenciasState?.hydrated);
  const shouldShowLoading = firstLoad && !force;

  try {
    setError(null);

    if (shouldShowLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    const response = await fetchIncidenciasRequest({
      timeout: INCIDENCIAS_TIMEOUT,
      query,
    });

    const normalized = normalizeIncidenciasListResponse(response);

    if (!isActiveLoadToken(loadToken)) {
      return safeArray(incidenciasState?.items);
    }

    return applyLoadedListToState(normalized);
  } catch (error) {
    const message = normalizeErrorMessage(
      error,
      "No se pudieron cargar las incidencias."
    );

    if (!isActiveLoadToken(loadToken)) {
      return safeArray(incidenciasState?.items);
    }

    console.error("❌ INCIDENCIAS LOAD:", error);

    setError(message);
    setLoaded(true);

    throw error;
  } finally {
    if (isActiveLoadToken(loadToken)) {
      setLoading(false);
      setRefreshing(false);
    }
  }
}

/* =========================================================
   LOAD DETAIL
========================================================= */

export async function loadIncidenciaDetail(ticketId = "") {
  try {
    const detail = await getIncidenciaByIdRequest(ticketId);

    if (detail) {
      upsertIncidenciaStore?.(detail);
    }

    return detail;
  } catch (error) {
    console.error("❌ INCIDENCIA DETAIL:", error);
    throw error;
  }
}

/* =========================================================
   CREATE
========================================================= */

export async function createIncidencia(payload = {}) {
  try {
    const created = await createIncidenciaRequest(payload);

    if (created) {
      upsertIncidenciaStore?.(created);
    }

    return created;
  } catch (error) {
    console.error("❌ INCIDENCIA CREATE:", error);
    throw error;
  }
}

/* =========================================================
   PUBLIC API
========================================================= */

export const IncidenciasApi = Object.freeze({
  resource: INCIDENCIAS_RESOURCE,
  endpoint: INCIDENCIAS_ENDPOINT,
  timeout: INCIDENCIAS_TIMEOUT,

  normalizeIncidenciaId,
  getIncidenciaEndpoint,
  normalizeIncidencia,

  fetchIncidenciasRequest,
  getIncidenciaByIdRequest,
  createIncidenciaRequest,

  hydrateFromCache,
  loadIncidencias,
  loadIncidenciaDetail,
  createIncidencia,
});

export default IncidenciasApi;
