/* =========================================================
   Onion SPA - Ajustes API
   Archivo: src/views/ajustes/ajustes.api.js

   FINAL PRO SYSTEM · API LAYER · 10/10

   RESPONSABILIDADES:
   - centralizar llamadas HTTP del módulo ajustes
   - listado + detalle + create + update + validate
   - refresh forzado
   - hidratar store/state
   - normalizar payloads backend heterogéneos
   - soportar adapters múltiples de request
   - anti-race soft para listado
   - orientado a ajustes de cliente / métodos de pago / configuración operativa
   - no tocar datos de cuenta de usuario

   HARDENING PRO:
   - get detalle devuelve objeto limpio
   - soporta { ok, data, setting, ajuste, item, payload, result }
   - soporta arrays / envelopes / nested envelopes
   - fallback AppCore.apiClient -> AppCore.request -> Http -> fetch
   - persistencia coherente en store/state
   - tolerancia a backends con rutas distintas de cliente/ajustes
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

/**
 * Rutas base candidatas para ajustes de cliente.
 * El backend real mostrado en server.js confirma:
 * - /api/ajustes/validate
 * - /api/clientes/*
 *
 * Como no has pegado todavía el router real de ajustes/clientes,
 * dejo una estrategia multi-candidato para que el módulo sea
 * tolerante y no quede acoplado a una sola convención.
 */

const AJUSTES_LIST_ENDPOINTS = [
  "/api/clientes/ajustes",
  "/api/clientes/settings",
  "/api/clientes/configuracion",
  "/api/clientes/preferences",
  "/api/clientes/metodos-pago",
  "/api/clientes/payment-methods",
];

const AJUSTES_CREATE_ENDPOINTS = [
  "/api/clientes/ajustes",
  "/api/clientes/settings",
  "/api/clientes/configuracion",
  "/api/clientes/metodos-pago",
  "/api/clientes/payment-methods",
];

const AJUSTES_UPDATE_ENDPOINTS = [
  "/api/clientes/ajustes",
  "/api/clientes/settings",
  "/api/clientes/configuracion",
  "/api/clientes/metodos-pago",
  "/api/clientes/payment-methods",
];

const AJUSTES_VALIDATE_ENDPOINT = "/api/ajustes/validate";
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

function buildResourceEndpoint(base = "", id = "") {
  const cleanBase = safeText(base, "").replace(/\/+$/, "");
  const resourceId = safeText(id, "");

  if (!cleanBase) {
    throw new Error("AJUSTES_ENDPOINT_REQUIRED");
  }

  if (!resourceId) {
    throw new Error("AJUSTE_ID_REQUIRED");
  }

  return `${cleanBase}/${encodeURIComponent(resourceId)}`;
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
  if (Array.isArray(obj.settings)) return obj.settings;
  if (Array.isArray(obj.ajustes)) return obj.ajustes;
  if (Array.isArray(obj.paymentMethods)) return obj.paymentMethods;
  if (Array.isArray(obj.metodosPago)) return obj.metodosPago;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.results)) return obj.results;
  if (Array.isArray(obj.rows)) return obj.rows;

  if (obj.setting) return obj.setting;
  if (obj.ajuste) return obj.ajuste;
  if (obj.paymentMethod) return obj.paymentMethod;
  if (obj.metodoPago) return obj.metodoPago;
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

  if (Array.isArray(obj?.data?.settings)) {
    return obj.data.settings;
  }

  if (Array.isArray(obj?.data?.ajustes)) {
    return obj.data.ajustes;
  }

  if (Array.isArray(obj?.data?.paymentMethods)) {
    return obj.data.paymentMethods;
  }

  if (Array.isArray(obj?.data?.metodosPago)) {
    return obj.data.metodosPago;
  }

  if (Array.isArray(obj?.payload?.items)) {
    return obj.payload.items;
  }

  if (Array.isArray(obj?.payload?.settings)) {
    return obj.payload.settings;
  }

  if (Array.isArray(obj?.payload?.ajustes)) {
    return obj.payload.ajustes;
  }

  if (Array.isArray(obj?.payload?.paymentMethods)) {
    return obj.payload.paymentMethods;
  }

  if (Array.isArray(obj?.payload?.metodosPago)) {
    return obj.payload.metodosPago;
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

function looksLikeAjuste(value = null) {
  const obj = safeObject(value);

  return Boolean(
    obj.settingId ||
      obj.ajusteId ||
      obj.id ||
      obj.key ||
      obj.slug ||
      obj.code ||
      obj.name ||
      obj.nombre ||
      obj.label ||
      obj.title ||
      obj.paymentMethodId ||
      obj.metodoPagoId
  );
}

function pickDetail(payload = null) {
  if (!payload) {
    return null;
  }

  if (Array.isArray(payload)) {
    return payload[0] || null;
  }

  if (looksLikeAjuste(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (looksLikeAjuste(obj.setting)) return obj.setting;
  if (looksLikeAjuste(obj.ajuste)) return obj.ajuste;
  if (looksLikeAjuste(obj.paymentMethod)) return obj.paymentMethod;
  if (looksLikeAjuste(obj.metodoPago)) return obj.metodoPago;
  if (looksLikeAjuste(obj.item)) return obj.item;
  if (looksLikeAjuste(obj.result)) return obj.result;
  if (looksLikeAjuste(obj.payload)) return obj.payload;
  if (looksLikeAjuste(obj.data)) return obj.data;

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

async function requestFirstAvailable(
  method = "GET",
  paths = [],
  options = {}
) {
  const candidates = safeArray(paths).filter(Boolean);

  if (!candidates.length) {
    throw new Error("AJUSTES_ENDPOINT_CANDIDATES_EMPTY");
  }

  let lastError = null;

  for (const path of candidates) {
    try {
      return await request(method, path, options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("AJUSTES_ALL_ENDPOINTS_FAILED");
}

/* =========================================================
   NORMALIZE DOMAIN MODEL
========================================================= */

function getAjusteId(item = {}) {
  return safeText(
    first(
      item.settingId,
      item.ajusteId,
      item.paymentMethodId,
      item.metodoPagoId,
      item.id,
      item.key,
      item.slug,
      item.code
    ),
    ""
  );
}

function getAjusteKey(item = {}) {
  return safeText(
    first(
      item.key,
      item.settingKey,
      item.slug,
      item.code,
      item.id
    ),
    ""
  );
}

function getAjusteTitle(item = {}) {
  return safeText(
    first(
      item.title,
      item.titulo,
      item.label,
      item.name,
      item.nombre,
      item.key
    ),
    "Ajuste"
  );
}

function getAjusteCategory(item = {}) {
  const categoryObject = first(
    item.category,
    item.categoria,
    item.group,
    item.section
  );

  if (categoryObject && typeof categoryObject === "object") {
    return safeText(
      first(
        categoryObject.name,
        categoryObject.nombre,
        categoryObject.label,
        categoryObject.title
      ),
      "General"
    );
  }

  return safeText(
    first(
      item.categoryName,
      item.categoriaNombre,
      categoryObject
    ),
    "General"
  );
}

function getAjusteValue(item = {}) {
  const rawValue = first(
    item.value,
    item.valor,
    item.currentValue,
    item.defaultValue
  );

  if (rawValue === null || rawValue === undefined) {
    return "";
  }

  if (typeof rawValue === "object") {
    try {
      return JSON.stringify(rawValue);
    } catch {
      return safeText(rawValue, "");
    }
  }

  return safeText(rawValue, "");
}

function getAjusteType(item = {}) {
  return safeText(
    first(
      item.type,
      item.tipo,
      item.valueType,
      item.inputType
    ),
    "text"
  );
}

function getAjusteStatus(item = {}) {
  return safeText(
    first(
      item.status,
      item.estado,
      item.state
    ),
    "active"
  );
}

function getAjusteVisibility(item = {}) {
  return safeText(
    first(
      item.visibility,
      item.visibilidad,
      item.scope
    ),
    "private"
  );
}

function getAjusteUpdatedAt(item = {}) {
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
    settingId: getAjusteId(raw),
    key: getAjusteKey(raw),
    title: getAjusteTitle(raw),
    category: getAjusteCategory(raw),
    value: getAjusteValue(raw),
    type: getAjusteType(raw),
    status: getAjusteStatus(raw),
    visibility: getAjusteVisibility(raw),
    updatedAt: getAjusteUpdatedAt(raw),
  };
}

function normalizeAjustesList(items = []) {
  return safeArray(items).map((item) => normalizeAjuste(item));
}

/* =========================================================
   ENDPOINT RESOLVERS
========================================================= */

function buildDetailCandidates(id = "") {
  const itemId = safeText(id, "");

  if (!itemId) {
    throw new Error("AJUSTE_ID_REQUIRED");
  }

  const paths = [];

  for (const base of AJUSTES_LIST_ENDPOINTS) {
    paths.push(buildResourceEndpoint(base, itemId));
  }

  return paths;
}

function buildUpdateCandidates(id = "") {
  const itemId = safeText(id, "");

  if (!itemId) {
    throw new Error("AJUSTE_ID_REQUIRED");
  }

  const paths = [];

  for (const base of AJUSTES_UPDATE_ENDPOINTS) {
    paths.push(buildResourceEndpoint(base, itemId));
  }

  return paths;
}

/* =========================================================
   RAW REQUESTS
========================================================= */

export async function fetchAjustesRequest() {
  const response = await requestFirstAvailable("GET", AJUSTES_LIST_ENDPOINTS, {
    timeout: AJUSTES_TIMEOUT,
  });

  return response;
}

export async function getAjusteByIdRequest(id = "") {
  const response = await requestFirstAvailable(
    "GET",
    buildDetailCandidates(id),
    {
      timeout: AJUSTES_TIMEOUT,
    }
  );

  return normalizeAjuste(pickDetail(response));
}

export async function createAjusteRequest(payload = {}) {
  const response = await requestFirstAvailable(
    "POST",
    AJUSTES_CREATE_ENDPOINTS,
    {
      timeout: AJUSTES_TIMEOUT,
      body: safeObject(payload),
    }
  );

  return normalizeAjuste(pickCreatedAjuste(response) || response);
}

export async function updateAjusteRequest(id = "", payload = {}) {
  const updatePaths = buildUpdateCandidates(id);

  let response = null;
  let lastError = null;

  for (const method of ["PATCH", "PUT"]) {
    try {
      response = await requestFirstAvailable(method, updatePaths, {
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

export async function validateAjustesRequest(payload = {}) {
  return request("GET", AJUSTES_VALIDATE_ENDPOINT, {
    timeout: AJUSTES_TIMEOUT,
    params: safeObject(payload),
  });
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
      "No se pudieron cargar los ajustes."
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
