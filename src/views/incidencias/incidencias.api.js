/* =========================================================
   Onion SPA - Incidencias API
   Archivo: src/views/incidencias/incidencias.api.js

   FINAL PRO SYSTEM · API LAYER · 10/10

   RESPONSABILIDADES:
   - centralizar llamadas HTTP del módulo incidencias
   - listado + detalle + create
   - refresh forzado
   - hidratar store/state
   - normalizar payloads backend heterogéneos
   - soportar adapters múltiples de request
   - anti-race soft para listado

   HARDENING PRO:
   - get detalle devuelve objeto limpio
   - soporta { ok, data, ticket, item, payload, result }
   - soporta arrays / envelopes / nested envelopes
   - fallback AppCore.apiClient -> AppCore.request -> Http -> fetch
   - persistencia coherente en store/state
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

const INCIDENCIAS_ENDPOINT = "/api/tickets";
const INCIDENCIAS_TIMEOUT = 15000;

let lastLoadToken = 0;

/* =========================================================
   SAFE
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
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

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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
  const cleanPath = String(path || "").trim();
  if (!cleanPath) return getApiBase();
  if (/^https?:\/\//i.test(cleanPath)) return cleanPath;
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
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
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

function getTicketEndpoint(id = "") {
  const ticketId = String(id ?? "").trim();

  if (!ticketId) {
    throw new Error("INCIDENCIA_ID_REQUIRED");
  }

  return `${INCIDENCIAS_ENDPOINT}/${encodeURIComponent(ticketId)}`;
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

function normalizeErrorMessage(error = null, fallback = "Error de API.") {
  return safeText(
    first(
      error?.message,
      error?.response?.message,
      error?.response?.data?.message,
      error?.data?.message,
      error?.error,
      fallback
    ),
    fallback
  );
}

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

  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.tickets)) return obj.tickets;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.results)) return obj.results;
  if (Array.isArray(obj.rows)) return obj.rows;

  if (obj.ticket) return obj.ticket;
  if (obj.item) return obj.item;
  if (obj.result) return obj.result;
  if (obj.payload) return unwrapResponseEnvelope(obj.payload);

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

function looksLikeTicket(value = null) {
  const obj = safeObject(value);

  return Boolean(
    obj.ticketId ||
      obj.id ||
      obj.code ||
      obj.ticketCode ||
      obj.title ||
      obj.subject ||
      obj.asunto
  );
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

  if (looksLikeTicket(obj.ticket)) return obj.ticket;
  if (looksLikeTicket(obj.item)) return obj.item;
  if (looksLikeTicket(obj.result)) return obj.result;
  if (looksLikeTicket(obj.payload)) return obj.payload;
  if (looksLikeTicket(obj.data)) return obj.data;

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

/* =========================================================
   REQUEST ADAPTERS
========================================================= */

async function requestViaApiClient(method = "GET", path = "", options = {}) {
  const client = getApiClient();

  if (!client) {
    throw new Error("INCIDENCIAS_API_CLIENT_UNAVAILABLE");
  }

  const verb = String(method || "GET").toLowerCase();
  const timeout = safeNumber(options.timeout, INCIDENCIAS_TIMEOUT);

  if (verb === "get" && typeof client.get === "function") {
    return client.get(path, {
      timeout,
      auth: true,
      headers: options.headers,
      params: options.params,
    });
  }

  if (verb === "post" && typeof client.post === "function") {
    return client.post(path, options.body, {
      timeout,
      auth: true,
      headers: options.headers,
      params: options.params,
    });
  }

  if (typeof client.request === "function") {
    return client.request(path, {
      method: method.toUpperCase(),
      timeout,
      auth: true,
      headers: options.headers,
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
    headers: options.headers,
    params: options.params,
    body:
      options.body && typeof options.body !== "string"
        ? JSON.stringify(options.body)
        : options.body,
  });
}

async function requestViaHttpModule(method = "GET", path = "", options = {}) {
  const Http = getHttpModule();

  if (!Http) {
    throw new Error("HTTP_MODULE_UNAVAILABLE");
  }

  const verb = String(method || "GET").toLowerCase();

  if (verb === "get" && typeof Http.get === "function") {
    return Http.get(path, {
      headers: options.headers,
      params: options.params,
      timeout: options.timeout,
    });
  }

  if (verb === "post" && typeof Http.post === "function") {
    return Http.post(path, options.body, {
      headers: options.headers,
      params: options.params,
      timeout: options.timeout,
    });
  }

  if (typeof Http.request === "function") {
    return Http.request(path, {
      method: method.toUpperCase(),
      headers: options.headers,
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
    params: options.params,
    body: options.body,
    headers: getRequestHeaders({
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(safeObject(options.headers)),
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

  throw lastError || new Error("INCIDENCIAS_REQUEST_FAILED");
}

/* =========================================================
   RAW REQUESTS
========================================================= */

export async function fetchIncidenciasRequest() {
  return request("GET", INCIDENCIAS_ENDPOINT, {
    timeout: INCIDENCIAS_TIMEOUT,
  });
}

export async function getIncidenciaByIdRequest(id = "") {
  const response = await request("GET", getTicketEndpoint(id), {
    timeout: INCIDENCIAS_TIMEOUT,
  });

  return pickDetail(response);
}

export async function createIncidenciaRequest(payload = {}) {
  const response = await request("POST", INCIDENCIAS_ENDPOINT, {
    timeout: INCIDENCIAS_TIMEOUT,
    body: safeObject(payload),
  });

  return pickCreatedTicket(response) || response;
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
   LOAD LIST
========================================================= */

export async function loadIncidencias({
  force = false,
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

    const response = await fetchIncidenciasRequest();
    const list = safeArray(pickItems(response));
    const remoteCount = pickTotal(response, list.length);

    if (!isActiveLoadToken(loadToken)) {
      return safeArray(incidenciasState?.items);
    }

    replaceIncidenciasStore(list);
    setItems(list);
    setRemoteCount(remoteCount);
    setLastSyncAt(Date.now());
    setLoaded(true);
    setError(null);

    return list;
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
   DEFAULT EXPORT
========================================================= */

export default {
  fetchIncidenciasRequest,
  getIncidenciaByIdRequest,
  createIncidenciaRequest,
  hydrateFromCache,
  loadIncidencias,
  loadIncidenciaDetail,
  createIncidencia,
};
