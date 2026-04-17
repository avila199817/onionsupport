/* =========================================================
   Onion SPA - Cuenta API
   Archivo: src/views/cuenta/cuenta.api.js

   FINAL PRO SYSTEM · API LAYER · 10/10

   RESPONSABILIDADES:
   - centralizar llamadas HTTP del módulo cuenta
   - detalle + update + update theme + meta
   - refresh forzado
   - hidratar store/state
   - normalizar payloads backend heterogéneos
   - soportar adapters múltiples de request
   - anti-race soft para carga de detalle

   HARDENING PRO:
   - get detalle devuelve objeto limpio
   - soporta { ok, data, preferences, item, payload, result }
   - soporta arrays / envelopes / nested envelopes
   - fallback AppCore.apiClient -> AppCore.request -> Http -> fetch
   - persistencia coherente en store/state
   - compatible con backend /api/user/preferences
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  cuentaState,
  setLoading,
  setRefreshing,
  setSaving,
  setError,
  setItem,
  setLastSyncAt,
  setLoaded,
} from "./cuenta.state.js";

import {
  replaceCuentaStore,
  upsertCuentaStore,
} from "./cuenta.store.js";

/* =========================================================
   CONFIG
========================================================= */

const CUENTA_ENDPOINT = "/api/user/preferences";
const CUENTA_THEME_ENDPOINT = "/api/user/preferences/theme";
const CUENTA_META_ENDPOINT = "/api/user/preferences/_meta";
const CUENTA_TIMEOUT = 15000;

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
  if (Array.isArray(obj.results)) return obj.results;
  if (Array.isArray(obj.rows)) return obj.rows;
  if (Array.isArray(obj.data)) return obj.data;

  if (obj.preferences) return obj.preferences;
  if (obj.account) return obj.account;
  if (obj.cuenta) return obj.cuenta;
  if (obj.user) return obj.user;
  if (obj.item) return obj.item;
  if (obj.result) return obj.result;
  if (obj.payload) return unwrapResponseEnvelope(obj.payload);

  if (obj.data && typeof obj.data === "object") {
    return unwrapResponseEnvelope(obj.data);
  }

  return obj;
}

function looksLikeCuenta(value = null) {
  const obj = safeObject(value);

  return Boolean(
    Object.prototype.hasOwnProperty.call(obj, "darkMode") ||
      Object.prototype.hasOwnProperty.call(obj, "privacyMode") ||
      obj.updatedAt ||
      obj.userId ||
      obj.preferences
  );
}

function pickDetail(payload = null) {
  if (!payload) {
    return null;
  }

  if (Array.isArray(payload)) {
    return payload[0] || null;
  }

  if (looksLikeCuenta(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (looksLikeCuenta(obj.preferences)) return obj.preferences;
  if (looksLikeCuenta(obj.account)) return obj.account;
  if (looksLikeCuenta(obj.cuenta)) return obj.cuenta;
  if (looksLikeCuenta(obj.user)) return obj.user;
  if (looksLikeCuenta(obj.item)) return obj.item;
  if (looksLikeCuenta(obj.result)) return obj.result;
  if (looksLikeCuenta(obj.payload)) return obj.payload;
  if (looksLikeCuenta(obj.data)) return obj.data;

  if (obj.data && typeof obj.data === "object") {
    return pickDetail(obj.data);
  }

  if (obj.payload && typeof obj.payload === "object") {
    return pickDetail(obj.payload);
  }

  return Object.keys(obj).length ? obj : null;
}

function normalizeCuentaDetail(detail = {}) {
  const raw = safeObject(detail);

  const darkMode =
    typeof raw.darkMode === "boolean"
      ? raw.darkMode
      : typeof raw.theme === "string"
      ? raw.theme === "dark"
      : true;

  const privacyMode =
    typeof raw.privacyMode === "boolean"
      ? raw.privacyMode
      : false;

  return {
    ...raw,
    darkMode,
    privacyMode,
    theme: darkMode ? "dark" : "light",
    updatedAt: first(raw.updatedAt, raw.updated_at, null),
  };
}

function pickMeta(payload = null) {
  const obj = safeObject(payload);

  return {
    ok: Boolean(obj.ok),
    service: safeText(obj.service, "user-preferences"),
    version: safeText(obj.version, ""),
    container: safeText(obj.container, ""),
    partitionKey: safeText(obj.partitionKey, ""),
    defaults: safeObject(obj.defaults),
    endpoints: safeArray(obj.endpoints),
    user: safeObject(obj.user),
  };
}

/* =========================================================
   REQUEST ADAPTERS
========================================================= */

async function requestViaApiClient(method = "GET", path = "", options = {}) {
  const client = getApiClient();

  if (!client) {
    throw new Error("CUENTA_API_CLIENT_UNAVAILABLE");
  }

  const verb = String(method || "GET").toLowerCase();
  const timeout = safeNumber(options.timeout, CUENTA_TIMEOUT);

  if (verb === "get" && typeof client.get === "function") {
    return client.get(path, {
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

  throw new Error("CUENTA_API_CLIENT_METHOD_UNAVAILABLE");
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

  if (verb === "patch" && typeof Http.patch === "function") {
    return Http.patch(path, options.body, {
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
  const timeout = safeNumber(options.timeout, CUENTA_TIMEOUT);

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
    timeout: safeNumber(options.timeout, CUENTA_TIMEOUT),
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

  throw lastError || new Error("CUENTA_REQUEST_FAILED");
}

/* =========================================================
   RAW REQUESTS
========================================================= */

export async function fetchCuentaRequest() {
  const response = await request("GET", CUENTA_ENDPOINT, {
    timeout: CUENTA_TIMEOUT,
  });

  return normalizeCuentaDetail(
    pickDetail(response) || unwrapResponseEnvelope(response) || response
  );
}

export async function updateCuentaRequest(payload = {}) {
  const body = safeObject(payload);

  const response = await request("PATCH", CUENTA_ENDPOINT, {
    timeout: CUENTA_TIMEOUT,
    body,
  });

  return normalizeCuentaDetail(
    pickDetail(response) || unwrapResponseEnvelope(response) || response
  );
}

export async function updateCuentaThemeRequest(darkMode = true) {
  const response = await request("PATCH", CUENTA_THEME_ENDPOINT, {
    timeout: CUENTA_TIMEOUT,
    body: {
      darkMode: Boolean(darkMode),
    },
  });

  return normalizeCuentaDetail(
    pickDetail(response) || unwrapResponseEnvelope(response) || response
  );
}

export async function fetchCuentaMetaRequest() {
  const response = await request("GET", CUENTA_META_ENDPOINT, {
    timeout: CUENTA_TIMEOUT,
  });

  return pickMeta(response);
}

/* =========================================================
   CACHE HYDRATE
========================================================= */

export function hydrateCuentaFromCache() {
  try {
    const current = safeObject(cuentaState?.item);

    if (Object.keys(current).length) {
      replaceCuentaStore(current);
    }

    return current;
  } catch {
    return {};
  }
}

/* =========================================================
   LOAD DETAIL
========================================================= */

export async function loadCuenta({
  force = false,
} = {}) {
  const loadToken = nextLoadToken();
  const firstLoad = !Boolean(cuentaState?.hydrated);
  const shouldShowLoading = firstLoad && !force;

  try {
    setError(null);

    if (shouldShowLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    const detail = await fetchCuentaRequest();

    if (!isActiveLoadToken(loadToken)) {
      return safeObject(cuentaState?.item);
    }

    replaceCuentaStore(detail);
    setItem(detail);
    setLastSyncAt(Date.now());
    setLoaded(true);
    setError(null);

    return detail;
  } catch (error) {
    const message = normalizeErrorMessage(
      error,
      "No se pudo cargar la cuenta."
    );

    if (!isActiveLoadToken(loadToken)) {
      return safeObject(cuentaState?.item);
    }

    console.error("❌ CUENTA LOAD:", error);

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
   UPDATE
========================================================= */

export async function updateCuenta(payload = {}) {
  try {
    setSaving?.(true);
    setError(null);

    const updated = await updateCuentaRequest(payload);

    upsertCuentaStore?.(updated);
    setItem(updated);
    setLastSyncAt(Date.now());
    setError(null);

    return updated;
  } catch (error) {
    console.error("❌ CUENTA UPDATE:", error);
    setError(
      normalizeErrorMessage(
        error,
        "No se pudo actualizar la cuenta."
      )
    );
    throw error;
  } finally {
    setSaving?.(false);
  }
}

export async function updateCuentaTheme(darkMode = true) {
  try {
    setSaving?.(true);
    setError(null);

    const updated = await updateCuentaThemeRequest(darkMode);

    upsertCuentaStore?.(updated);
    setItem(updated);
    setLastSyncAt(Date.now());
    setError(null);

    return updated;
  } catch (error) {
    console.error("❌ CUENTA THEME UPDATE:", error);
    setError(
      normalizeErrorMessage(
        error,
        "No se pudo actualizar el tema."
      )
    );
    throw error;
  } finally {
    setSaving?.(false);
  }
}

/* =========================================================
   META
========================================================= */

export async function loadCuentaMeta() {
  try {
    return await fetchCuentaMetaRequest();
  } catch (error) {
    console.error("❌ CUENTA META:", error);
    throw error;
  }
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  fetchCuentaRequest,
  updateCuentaRequest,
  updateCuentaThemeRequest,
  fetchCuentaMetaRequest,
  hydrateCuentaFromCache,
  loadCuenta,
  updateCuenta,
  updateCuentaTheme,
  loadCuentaMeta,
};
