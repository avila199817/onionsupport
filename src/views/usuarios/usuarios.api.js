/* =========================================================
   Onion SPA - Usuarios API
   Archivo: src/views/usuarios/usuarios.api.js

   FINAL PRO SYSTEM · API LAYER · ADMIN USERS · 10/10

   RESPONSABILIDADES:
   - centralizar llamadas HTTP del módulo usuarios
   - listado + detalle + create
   - refresh forzado
   - hidratar store/state/cache
   - normalizar payloads backend heterogéneos
   - soportar adapters múltiples de request
   - anti-race soft para listado
   - deduplicación/coherencia con usuarios.store.js
   - compatibilidad con envelopes { ok, count, users }
   - compatibilidad con users / usuarios / items / rows / data / results

   HARDENING PRO:
   - get detalle devuelve objeto limpio
   - soporta { ok, data, user, usuario, item, payload, result }
   - soporta arrays / envelopes / nested envelopes
   - fallback AppCore.apiClient -> AppCore.request -> Http -> fetch
   - persistencia coherente en store/state/cache
   - no loading infinito
   - no pisa cache buena con payload vacío accidental
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  usuariosState,

  getInflightLoad,
  setInflightLoad,
  clearInflightLoad,

  setLoading,
  setRefreshing,
  setError,
  clearError,
  setItems,
  setRemoteCount,
  setLastSyncAt,
  touchLastSyncAt,
  setLoaded,
  setHydrated,

  writeCachePayload,
  hydrateStateFromCache,
} from "./usuarios.state.js";

import {
  getUsuarios,
  replaceUsuariosStore,
  upsertUsuarioStore,
  upsertUsuariosStore,
  getUsuarioByIdStore,
} from "./usuarios.store.js";

import {
  normalizeUsuarioModel,
  normalizeUsuariosCollection,
  unwrapUsuariosPayload,
  findUsuarioById,
} from "./usuarios.model.js";

/* =========================================================
   CONFIG
========================================================= */

const USUARIOS_ENDPOINT = "/api/users";
const USUARIOS_TIMEOUT = 15000;

let lastLoadToken = 0;

/* =========================================================
   SAFE HELPERS
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

function normalizeErrorMessage(
  error = null,
  fallback = "Error de API."
) {
  return safeText(
    first(
      error?.message,
      error?.response?.message,
      error?.response?.data?.message,
      error?.data?.message,
      error?.error,
      error?.raw,
      fallback
    ),
    fallback
  );
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
   URL / AUTH
========================================================= */

function getApiBase() {
  const apiBase = safeText(
    first(
      AppCore?.config?.apiBase,
      AppCore?.config?.baseUrl,
      AppCore?.state?.apiBase,
      ""
    ),
    ""
  );

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

  const base = getApiBase();

  if (!base) {
    return cleanPath;
  }

  return `${base}${cleanPath.startsWith("/") ? "" : "/"}${cleanPath}`;
}

function getAuthToken() {
  return safeText(
    first(
      AppCore?.state?.token,
      AppCore?.state?.accessToken,
      AppCore?.state?.session?.token,
      AppCore?.state?.session?.accessToken,
      AppCore?.auth?.getToken?.(),
      AppCore?.Auth?.getToken?.(),
      AppCore?.modules?.Auth?.getToken?.(),
      localStorage.getItem("token"),
      localStorage.getItem("accessToken"),
      sessionStorage.getItem("token"),
      sessionStorage.getItem("accessToken")
    ),
    ""
  );
}

function getRequestHeaders(extra = {}) {
  const token = getAuthToken();

  return {
    Accept: "application/json",

    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),

    ...safeObject(extra),
  };
}

function getApiClient() {
  return (
    AppCore?.apiClient ||
    AppCore?.api ||
    AppCore?.modules?.ApiClient ||
    null
  );
}

function getHttpModule() {
  return (
    AppCore?.modules?.Http ||
    AppCore?.Http ||
    window?.Http ||
    null
  );
}

function getUsuariosEndpoint() {
  return safeText(
    first(
      AppCore?.config?.endpoints?.users,
      AppCore?.config?.endpoints?.usuarios,
      AppCore?.config?.usuariosEndpoint,
      AppCore?.config?.usersEndpoint,
      USUARIOS_ENDPOINT
    ),
    USUARIOS_ENDPOINT
  );
}

function getUsuarioEndpoint(id = "") {
  const userId = safeText(id, "");

  if (!userId) {
    throw new Error("USUARIO_ID_REQUIRED");
  }

  return `${getUsuariosEndpoint().replace(/\/+$/, "")}/${encodeURIComponent(userId)}`;
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

  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.rows)) return obj.rows;
  if (Array.isArray(obj.users)) return obj.users;
  if (Array.isArray(obj.usuarios)) return obj.usuarios;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.results)) return obj.results;
  if (Array.isArray(obj.records)) return obj.records;

  if (obj.user) return obj.user;
  if (obj.usuario) return obj.usuario;
  if (obj.item) return obj.item;

  if (obj.payload) {
    return unwrapResponseEnvelope(obj.payload);
  }

  if (obj.response) {
    return unwrapResponseEnvelope(obj.response);
  }

  if (obj.result) {
    return unwrapResponseEnvelope(obj.result);
  }

  if (obj.data && typeof obj.data === "object") {
    return unwrapResponseEnvelope(obj.data);
  }

  return obj;
}

function pickItems(payload = null) {
  const fromModel = unwrapUsuariosPayload(payload);

  if (fromModel.length) {
    return fromModel;
  }

  const unwrapped = unwrapResponseEnvelope(payload);

  if (Array.isArray(unwrapped)) {
    return unwrapped;
  }

  return [];
}

function pickTotal(payload = null, fallback = 0) {
  const obj = safeObject(payload);
  const data = safeObject(obj.data);
  const payloadObj = safeObject(obj.payload);
  const response = safeObject(obj.response);
  const meta = safeObject(obj.meta);
  const pagination = safeObject(obj.pagination);

  const candidates = [
    obj.total,
    obj.count,
    obj.remoteCount,
    obj.totalCount,

    pagination.total,
    pagination.count,
    pagination.totalCount,

    meta.total,
    meta.count,
    meta.totalCount,

    data.total,
    data.count,
    data.remoteCount,
    data.totalCount,
    data?.pagination?.total,
    data?.meta?.total,

    payloadObj.total,
    payloadObj.count,
    payloadObj.remoteCount,
    payloadObj.totalCount,
    payloadObj?.pagination?.total,
    payloadObj?.meta?.total,

    response.total,
    response.count,
    response.remoteCount,
    response.totalCount,

    fallback,
  ];

  for (const value of candidates) {
    const n = Number(value);

    if (Number.isFinite(n)) {
      return Math.max(0, n);
    }
  }

  return Math.max(0, fallback);
}

function looksLikeUsuario(value = null) {
  const obj = safeObject(value);

  return Boolean(
    obj.userId ||
      obj.usuarioId ||
      obj.id ||
      obj.code ||
      obj.username ||
      obj.userName ||
      obj.name ||
      obj.nombre ||
      obj.fullName ||
      obj.displayName ||
      obj.email ||
      obj.mail ||
      obj.usuario ||
      obj.profile
  );
}

function pickDetail(payload = null) {
  if (!payload) {
    return null;
  }

  if (Array.isArray(payload)) {
    return payload[0] || null;
  }

  if (looksLikeUsuario(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  const candidates = [
    obj.user,
    obj.usuario,
    obj.item,
    obj.result,
    obj.payload,
    obj.data,
    obj.response,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (Array.isArray(candidate)) {
      if (candidate[0]) return candidate[0];
      continue;
    }

    if (looksLikeUsuario(candidate)) {
      return candidate;
    }

    const nested = pickDetail(candidate);

    if (nested) {
      return nested;
    }
  }

  return Object.keys(obj).length ? obj : null;
}

function normalizeListForState(payload = null) {
  const rawItems = pickItems(payload);
  return normalizeUsuariosCollection(rawItems);
}

function normalizeDetailForState(payload = null) {
  const detail = pickDetail(payload);

  if (!detail) {
    return null;
  }

  return normalizeUsuarioModel(detail);
}

/* =========================================================
   REQUEST ADAPTERS
========================================================= */

async function requestViaApiClient(method = "GET", path = "", options = {}) {
  const client = getApiClient();

  if (!client) {
    throw new Error("USUARIOS_API_CLIENT_UNAVAILABLE");
  }

  const verb = safeText(method, "GET").toLowerCase();

  if (verb === "get" && typeof client.get === "function") {
    return client.get(path, {
      timeout: options.timeout,
      auth: true,
      headers: options.headers,
      params: options.params,
    });
  }

  if (verb === "post" && typeof client.post === "function") {
    return client.post(
      path,
      options.body,
      {
        timeout: options.timeout,
        auth: true,
        headers: options.headers,
      }
    );
  }

  if (verb === "put" && typeof client.put === "function") {
    return client.put(
      path,
      options.body,
      {
        timeout: options.timeout,
        auth: true,
        headers: options.headers,
      }
    );
  }

  if (verb === "patch" && typeof client.patch === "function") {
    return client.patch(
      path,
      options.body,
      {
        timeout: options.timeout,
        auth: true,
        headers: options.headers,
      }
    );
  }

  if (verb === "delete" && typeof client.delete === "function") {
    return client.delete(path, {
      timeout: options.timeout,
      auth: true,
      headers: options.headers,
    });
  }

  if (typeof client.request === "function") {
    return client.request(path, {
      method: method.toUpperCase(),
      timeout: options.timeout,
      auth: true,
      headers: options.headers,
      body: options.body,
      params: options.params,
    });
  }

  throw new Error("USUARIOS_API_CLIENT_METHOD_UNAVAILABLE");
}

async function requestViaAppCoreRequest(method = "GET", path = "", options = {}) {
  if (typeof AppCore?.request !== "function") {
    throw new Error("APP_CORE_REQUEST_UNAVAILABLE");
  }

  return AppCore.request(path, {
    method: method.toUpperCase(),
    headers: options.headers,
    timeout: options.timeout,
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

  const verb = safeText(method, "GET").toLowerCase();

  if (verb === "get" && typeof Http.get === "function") {
    return Http.get(path, {
      headers: options.headers,
      timeout: options.timeout,
      params: options.params,
    });
  }

  if (verb === "post" && typeof Http.post === "function") {
    return Http.post(
      path,
      options.body,
      {
        headers: options.headers,
        timeout: options.timeout,
      }
    );
  }

  if (verb === "put" && typeof Http.put === "function") {
    return Http.put(
      path,
      options.body,
      {
        headers: options.headers,
        timeout: options.timeout,
      }
    );
  }

  if (verb === "patch" && typeof Http.patch === "function") {
    return Http.patch(
      path,
      options.body,
      {
        headers: options.headers,
        timeout: options.timeout,
      }
    );
  }

  if (verb === "delete" && typeof Http.delete === "function") {
    return Http.delete(path, {
      headers: options.headers,
      timeout: options.timeout,
    });
  }

  if (typeof Http.request === "function") {
    return Http.request(path, {
      method: method.toUpperCase(),
      headers: options.headers,
      timeout: options.timeout,
      body: options.body,
      params: options.params,
    });
  }

  throw new Error("HTTP_MODULE_METHOD_UNAVAILABLE");
}

async function requestViaFetch(method = "GET", path = "", options = {}) {
  const controller = new AbortController();
  const timeout = safeNumber(options.timeout, USUARIOS_TIMEOUT);

  const timeoutId = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, timeout);

  try {
    const hasBody = options.body !== undefined && options.body !== null;

    const response = await fetch(buildAbsoluteUrl(path), {
      method: method.toUpperCase(),
      headers: options.headers,
      body: hasBody ? JSON.stringify(options.body) : undefined,
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
      throw new Error(
        normalizeErrorMessage(
          data,
          `HTTP ${response.status}`
        )
      );
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function request(method = "GET", path = "", options = {}) {
  const hasBody = options.body !== undefined && options.body !== null;

  const requestOptions = {
    timeout: safeNumber(options.timeout, USUARIOS_TIMEOUT),
    body: options.body,
    params: options.params,
    headers: getRequestHeaders({
      ...(hasBody
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

  throw lastError || new Error("USUARIOS_REQUEST_FAILED");
}

/* =========================================================
   STATE / STORE SYNC
========================================================= */

function syncUsuariosCollection({
  items = [],
  remoteCount = null,
  lastSyncAt = Date.now(),
  writeCache = true,
} = {}) {
  const list = normalizeUsuariosCollection(items);
  const count = Math.max(
    list.length,
    safeNumber(remoteCount, list.length)
  );

  replaceUsuariosStore(list);

  setItems(list, {
    remoteCount: count,
  });

  setRemoteCount(count);
  setLastSyncAt(lastSyncAt);
  setLoaded(true);
  setHydrated(true);
  clearError();

  if (writeCache) {
    try {
      writeCachePayload();
    } catch {}
  }

  return list;
}

function syncUsuarioDetail(detail = null) {
  if (!detail) {
    return null;
  }

  const normalized = normalizeUsuarioModel(detail);

  upsertUsuarioStore(normalized);

  const current = getUsuarios();
  const normalizedCollection = normalizeUsuariosCollection(current);

  setItems(normalizedCollection, {
    remoteCount: Math.max(
      usuariosState.remoteCount || 0,
      normalizedCollection.length
    ),
  });

  setHydrated(true);
  setLoaded(true);

  try {
    writeCachePayload();
  } catch {}

  return normalized;
}

/* =========================================================
   RAW REQUESTS
========================================================= */

export async function fetchUsuariosRequest() {
  return request(
    "GET",
    getUsuariosEndpoint(),
    {
      timeout: USUARIOS_TIMEOUT,
    }
  );
}

export async function getUsuarioByIdRequest(id = "") {
  const response = await request(
    "GET",
    getUsuarioEndpoint(id),
    {
      timeout: USUARIOS_TIMEOUT,
    }
  );

  return normalizeDetailForState(response);
}

export async function createUsuarioRequest(payload = {}) {
  const response = await request(
    "POST",
    getUsuariosEndpoint(),
    {
      timeout: USUARIOS_TIMEOUT,
      body: safeObject(payload),
    }
  );

  return normalizeDetailForState(response) || response;
}

/* =========================================================
   OPTIONAL REQUESTS
========================================================= */

export async function updateUsuarioRequest(id = "", payload = {}) {
  const response = await request(
    "PATCH",
    getUsuarioEndpoint(id),
    {
      timeout: USUARIOS_TIMEOUT,
      body: safeObject(payload),
    }
  );

  return normalizeDetailForState(response) || response;
}

export async function deleteUsuarioRequest(id = "") {
  return request(
    "DELETE",
    getUsuarioEndpoint(id),
    {
      timeout: USUARIOS_TIMEOUT,
    }
  );
}

/* =========================================================
   CACHE HYDRATE
========================================================= */

export function hydrateFromCache({
  freshOnly = true,
} = {}) {
  try {
    const hydrated = hydrateStateFromCache?.({
      freshOnly,
    });

    if (hydrated) {
      replaceUsuariosStore(usuariosState.items || []);
      return safeArray(usuariosState.items);
    }
  } catch {}

  try {
    const currentStateItems = safeArray(usuariosState?.items);

    if (currentStateItems.length) {
      replaceUsuariosStore(currentStateItems);
      setHydrated(true);
      setLoaded(true);
      return currentStateItems;
    }
  } catch {}

  try {
    const currentStoreItems = safeArray(getUsuarios());

    if (currentStoreItems.length) {
      syncUsuariosCollection({
        items: currentStoreItems,
        remoteCount: Math.max(
          usuariosState.remoteCount || 0,
          currentStoreItems.length
        ),
        lastSyncAt: usuariosState.lastSyncAt || Date.now(),
        writeCache: false,
      });

      return currentStoreItems;
    }
  } catch {}

  return [];
}

/* =========================================================
   LOAD LIST
========================================================= */

export async function loadUsuarios({
  force = false,
  silent = false,
} = {}) {
  const existingInflight = getInflightLoad?.();

  if (existingInflight && !force) {
    return existingInflight;
  }

  const loadPromise = (async () => {
    const loadToken = nextLoadToken();

    const currentItems = safeArray(getUsuarios());
    const stateItems = safeArray(usuariosState?.items);
    const hasVisibleData = currentItems.length > 0 || stateItems.length > 0;

    try {
      clearError();

      if (!hasVisibleData && !silent) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const response = await fetchUsuariosRequest();

      const rawItems = pickItems(response);
      const normalizedItems = normalizeListForState(response);

      const list = normalizedItems.length
        ? normalizedItems
        : normalizeUsuariosCollection(rawItems);

      const remoteCount = pickTotal(response, list.length);

      if (!isActiveLoadToken(loadToken)) {
        return safeArray(usuariosState?.items);
      }

      const finalItems = syncUsuariosCollection({
        items: list,
        remoteCount,
        lastSyncAt: Date.now(),
        writeCache: true,
      });

      return finalItems;
    } catch (error) {
      if (isActiveLoadToken(loadToken)) {
        const message = normalizeErrorMessage(
          error,
          "No se pudieron cargar los usuarios."
        );

        setError(message);
        setLoaded(true);

        const fallbackItems = hydrateFromCache({
          freshOnly: true,
        });

        if (!fallbackItems.length) {
          const storeItems = safeArray(getUsuarios());

          if (storeItems.length) {
            syncUsuariosCollection({
              items: storeItems,
              remoteCount: Math.max(
                usuariosState.remoteCount || 0,
                storeItems.length
              ),
              lastSyncAt: usuariosState.lastSyncAt || 0,
              writeCache: false,
            });
          }
        }
      }

      throw error;
    } finally {
      if (isActiveLoadToken(loadToken)) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  })();

  setInflightLoad?.(loadPromise);

  try {
    return await loadPromise;
  } finally {
    if (getInflightLoad?.() === loadPromise) {
      clearInflightLoad?.();
    }
  }
}

/* =========================================================
   DETAIL
========================================================= */

export async function loadUsuarioDetail(userId = "") {
  const id = safeText(userId, "");

  if (!id) {
    throw new Error("USUARIO_ID_REQUIRED");
  }

  const cached =
    findUsuarioById(getUsuarios(), id) ||
    getUsuarioByIdStore(id);

  try {
    const detail = await getUsuarioByIdRequest(id);

    if (detail) {
      return syncUsuarioDetail(detail);
    }

    return cached || null;
  } catch (error) {
    if (cached) {
      return cached;
    }

    throw error;
  }
}

/* =========================================================
   CREATE
========================================================= */

export async function createUsuario(payload = {}) {
  const created = await createUsuarioRequest(payload);

  if (created) {
    const synced = syncUsuarioDetail(created);

    try {
      touchLastSyncAt();
      writeCachePayload();
    } catch {}

    return synced;
  }

  return created;
}

/* =========================================================
   UPDATE / DELETE OPTIONAL HELPERS
========================================================= */

export async function updateUsuario(id = "", payload = {}) {
  const updated = await updateUsuarioRequest(id, payload);

  if (updated) {
    const synced = syncUsuarioDetail(updated);

    try {
      touchLastSyncAt();
      writeCachePayload();
    } catch {}

    return synced;
  }

  return updated;
}

export async function deleteUsuario(id = "") {
  const target = safeText(id, "");

  if (!target) {
    throw new Error("USUARIO_ID_REQUIRED");
  }

  const response = await deleteUsuarioRequest(target);

  const current = safeArray(getUsuarios()).filter((item) => {
    return !findUsuarioById([item], target);
  });

  syncUsuariosCollection({
    items: current,
    remoteCount: current.length,
    lastSyncAt: Date.now(),
    writeCache: true,
  });

  return response;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  fetchUsuariosRequest,
  getUsuarioByIdRequest,
  createUsuarioRequest,
  updateUsuarioRequest,
  deleteUsuarioRequest,

  hydrateFromCache,
  loadUsuarios,
  loadUsuarioDetail,
  createUsuario,
  updateUsuario,
  deleteUsuario,
};
