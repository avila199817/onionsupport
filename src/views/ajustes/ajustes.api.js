/* =========================================================
   Onion SPA - Ajustes API
   Archivo: src/views/ajustes/ajustes.api.js

   FINAL PRO SYSTEM · API LAYER · SIMPLE /CLIENTES ONLY

   RESPONSABILIDADES:
   - centralizar llamadas HTTP del módulo ajustes
   - usar SOLO /api/clientes
   - listado + detalle + create + update
   - refresh forzado
   - hidratar store/state
   - normalizar payloads backend heterogéneos
   - soportar adapters múltiples de request
   - anti-race soft para listado

   HARDENING PRO:
   - cero rutas inventadas
   - get detalle devuelve objeto limpio
   - soporta arrays / envelopes / nested envelopes
   - fallback AppCore.apiClient -> AppCore.request -> Http -> fetch
   - persistencia coherente en store/state
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  ajustesState,
  setLoading,
  setRefreshing,
  setSaving,
  setError,
  setItems,
  setRemoteCount,
  setLastSyncAt,
  setLoaded,
} from "./ajustes.state.js";

import {
  replaceAjustesStore,
  upsertAjusteStore,
} from "./ajustes.store.js";

/* =========================================================
   CONFIG
========================================================= */

const CLIENTES_ENDPOINT = "/api/clientes";
const AJUSTES_TIMEOUT = 15000;

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

function getClienteDetailEndpoint(id = "") {
  const cleanId = safeText(id, "");

  if (!cleanId) {
    throw new Error("CLIENTE_ID_REQUIRED");
  }

  return `${CLIENTES_ENDPOINT}/${encodeURIComponent(cleanId)}`;
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
  if (Array.isArray(obj.clientes)) return obj.clientes;
  if (Array.isArray(obj.clients)) return obj.clients;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.results)) return obj.results;
  if (Array.isArray(obj.rows)) return obj.rows;

  if (obj.cliente) return obj.cliente;
  if (obj.client) return obj.client;
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

  if (Array.isArray(obj?.data?.items)) return obj.data.items;
  if (Array.isArray(obj?.data?.clientes)) return obj.data.clientes;
  if (Array.isArray(obj?.data?.clients)) return obj.data.clients;

  if (Array.isArray(obj?.payload?.items)) return obj.payload.items;
  if (Array.isArray(obj?.payload?.clientes)) return obj.payload.clientes;
  if (Array.isArray(obj?.payload?.clients)) return obj.payload.clients;

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

function looksLikeCliente(value = null) {
  const obj = safeObject(value);

  return Boolean(
    obj.id ||
      obj.clienteId ||
      obj.userId ||
      obj.nombre ||
      obj.name ||
      obj.empresa ||
      obj.company ||
      obj.email
  );
}

function pickDetail(payload = null) {
  if (!payload) {
    return null;
  }

  if (Array.isArray(payload)) {
    return payload[0] || null;
  }

  if (looksLikeCliente(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (looksLikeCliente(obj.cliente)) return obj.cliente;
  if (looksLikeCliente(obj.client)) return obj.client;
  if (looksLikeCliente(obj.item)) return obj.item;
  if (looksLikeCliente(obj.result)) return obj.result;
  if (looksLikeCliente(obj.payload)) return obj.payload;
  if (looksLikeCliente(obj.data)) return obj.data;

  if (obj.data && typeof obj.data === "object") {
    return pickDetail(obj.data);
  }

  if (obj.payload && typeof obj.payload === "object") {
    return pickDetail(obj.payload);
  }

  return Object.keys(obj).length ? obj : null;
}

function pickCreatedAjuste(payload = null) {
  return pickDetail(payload);
}

/* =========================================================
   REQUEST ADAPTERS
========================================================= */

async function requestViaApiClient(method = "GET", path = "", options = {}) {
  const client = getApiClient();

  if (!client) {
    throw new Error("AJUSTES_API_CLIENT_UNAVAILABLE");
  }

  const verb = String(method || "GET").toLowerCase();
  const timeout = safeNumber(options.timeout, AJUSTES_TIMEOUT);

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

  if (verb === "put" && typeof client.put === "function") {
    return client.put(path, options.body, {
      timeout,
      auth: true,
      headers: options.headers,
      params: options.params,
    });
  }

  if (verb === "patch" && typeof client.patch === "function") {
    return client.patch(path, options.body, {
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

  throw new Error("AJUSTES_API_CLIENT_METHOD_UNAVAILABLE");
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

  if (verb === "put" && typeof Http.put === "function") {
    return Http.put(path, options.body, {
      headers: options.headers,
      params: options.params,
      timeout: options.timeout,
    });
  }

  if (verb === "patch" && typeof Http.patch === "function") {
    return Http.patch(path, options.body, {
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
  const timeout = safeNumber(options.timeout, AJUSTES_TIMEOUT);

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
    timeout: safeNumber(options.timeout, AJUSTES_TIMEOUT),
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

  throw lastError || new Error("AJUSTES_REQUEST_FAILED");
}

/* =========================================================
   NORMALIZE DOMAIN MODEL
========================================================= */

function getClienteId(item = {}) {
  return safeText(
    first(
      item.id,
      item.clienteId,
      item.userId
    ),
    ""
  );
}

function getClienteKey(item = {}) {
  return safeText(
    first(
      item.key,
      item.slug,
      item.email,
      item.id
    ),
    ""
  );
}

function getClienteTitle(item = {}) {
  return safeText(
    first(
      item.nombre,
      item.name,
      item.empresa,
      item.company,
      item.label,
      item.title,
      item.email
    ),
    "Cliente"
  );
}

function getClienteCategory(item = {}) {
  return "Cliente";
}

function getClienteValue(item = {}) {
  const paymentCandidate = first(
    item.metodoPago,
    item.paymentMethod,
    item.defaultPaymentMethod,
    item.metodo_pago
  );

  if (paymentCandidate !== null && paymentCandidate !== undefined) {
    return safeText(paymentCandidate, "");
  }

  return safeText(
    first(
      item.estado,
      item.status,
      item.email,
      item.telefono,
      item.phone
    ),
    ""
  );
}

function getClienteType(item = {}) {
  const paymentCandidate = first(
    item.metodoPago,
    item.paymentMethod,
    item.defaultPaymentMethod,
    item.metodo_pago
  );

  if (paymentCandidate !== null && paymentCandidate !== undefined) {
    return "payment_method";
  }

  return "text";
}

function getClienteStatus(item = {}) {
  return safeText(
    first(
      item.status,
      item.estado,
      "active"
    ),
    "active"
  );
}

function getClienteVisibility(item = {}) {
  return "private";
}

function getClienteUpdatedAt(item = {}) {
  return first(
    item.updatedAt,
    item.modifiedAt,
    item.lastUpdate,
    item.fechaActualizacion,
    item.createdAt
  );
}

function normalizeAjuste(item = {}) {
  const raw = safeObject(item);

  return {
    ...raw,
    settingId: getClienteId(raw),
    key: getClienteKey(raw),
    title: getClienteTitle(raw),
    category: getClienteCategory(raw),
    value: getClienteValue(raw),
    type: getClienteType(raw),
    status: getClienteStatus(raw),
    visibility: getClienteVisibility(raw),
    updatedAt: getClienteUpdatedAt(raw),
  };
}

function normalizeAjustesList(items = []) {
  return safeArray(items).map((item) => normalizeAjuste(item));
}

/* =========================================================
   RAW REQUESTS
========================================================= */

export async function fetchAjustesRequest() {
  return request("GET", CLIENTES_ENDPOINT, {
    timeout: AJUSTES_TIMEOUT,
  });
}

export async function getAjusteByIdRequest(id = "") {
  const response = await request("GET", getClienteDetailEndpoint(id), {
    timeout: AJUSTES_TIMEOUT,
  });

  return normalizeAjuste(pickDetail(response));
}

export async function createAjusteRequest(payload = {}) {
  const response = await request("POST", CLIENTES_ENDPOINT, {
    timeout: AJUSTES_TIMEOUT,
    body: safeObject(payload),
  });

  return normalizeAjuste(pickCreatedAjuste(response) || response);
}

export async function updateAjusteRequest(id = "", payload = {}) {
  const detailPath = getClienteDetailEndpoint(id);

  let response = null;
  let lastError = null;

  for (const method of ["PATCH", "PUT"]) {
    try {
      response = await request(method, detailPath, {
        timeout: AJUSTES_TIMEOUT,
        body: safeObject(payload),
      });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return normalizeAjuste(pickDetail(response) || response);
}

/**
 * Validación local para no depender de endpoints que no existen.
 */
export async function validateAjustesRequest(payload = {}) {
  const data = safeObject(payload);

  const errors = {};

  if (!safeText(data.key, "")) {
    errors.key = "KEY_REQUIRED";
  }

  if (!safeText(data.title, "")) {
    errors.title = "TITLE_REQUIRED";
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    payload: data,
  };
}

/* =========================================================
   CACHE HYDRATE
========================================================= */

export function hydrateFromCache() {
  try {
    const current = safeArray(ajustesState?.items);

    if (current.length) {
      replaceAjustesStore(current);
    }

    return current;
  } catch {
    return [];
  }
}

/* =========================================================
   LOAD LIST
========================================================= */

export async function loadAjustes({
  force = false,
} = {}) {
  const loadToken = nextLoadToken();
  const firstLoad = !Boolean(ajustesState?.hydrated);
  const shouldShowLoading = firstLoad && !force;

  try {
    setError(null);

    if (shouldShowLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    const response = await fetchAjustesRequest();
    const rawList = safeArray(pickItems(response));
    const list = normalizeAjustesList(rawList);
    const remoteCount = pickTotal(response, list.length);

    if (!isActiveLoadToken(loadToken)) {
      return safeArray(ajustesState?.items);
    }

    replaceAjustesStore(list);
    setItems(list);
    setRemoteCount(remoteCount);
    setLastSyncAt(Date.now());
    setLoaded(true);
    setError(null);

    return list;
  } catch (error) {
    const message = normalizeErrorMessage(
      error,
      "No se pudieron cargar los clientes."
    );

    if (!isActiveLoadToken(loadToken)) {
      return safeArray(ajustesState?.items);
    }

    console.error("❌ AJUSTES LOAD:", error);

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

export async function loadAjusteDetail(settingId = "") {
  try {
    const detail = await getAjusteByIdRequest(settingId);

    if (detail) {
      upsertAjusteStore?.(detail);
    }

    return detail;
  } catch (error) {
    console.error("❌ AJUSTE DETAIL:", error);
    throw error;
  }
}

/* =========================================================
   CREATE
========================================================= */

export async function createAjuste(payload = {}) {
  try {
    setSaving?.(true);

    const created = await createAjusteRequest(payload);

    if (created) {
      upsertAjusteStore?.(created);
    }

    return created;
  } catch (error) {
    console.error("❌ AJUSTE CREATE:", error);
    throw error;
  } finally {
    setSaving?.(false);
  }
}

/* =========================================================
   UPDATE
========================================================= */

export async function updateAjuste(settingId = "", payload = {}) {
  try {
    setSaving?.(true);

    const updated = await updateAjusteRequest(settingId, payload);

    if (updated) {
      upsertAjusteStore?.(updated);
    }

    return updated;
  } catch (error) {
    console.error("❌ AJUSTE UPDATE:", error);
    throw error;
  } finally {
    setSaving?.(false);
  }
}

/* =========================================================
   VALIDATE
========================================================= */

export async function validateAjustes(payload = {}) {
  try {
    return await validateAjustesRequest(payload);
  } catch (error) {
    console.error("❌ AJUSTES VALIDATE:", error);
    throw error;
  }
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  fetchAjustesRequest,
  getAjusteByIdRequest,
  createAjusteRequest,
  updateAjusteRequest,
  validateAjustesRequest,
  hydrateFromCache,
  loadAjustes,
  loadAjusteDetail,
  createAjuste,
  updateAjuste,
  validateAjustes,
};
