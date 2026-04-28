/* =========================================================
   Onion SPA - Cuenta API
   Archivo: src/views/cuenta/cuenta.api.js

   FINAL PRO SYSTEM · API LAYER · HARDENED · 10/10

   RESPONSABILIDADES:
   - centralizar llamadas HTTP del módulo cuenta
   - detalle + update + update theme + update language + meta
   - refresh forzado
   - hidratar store/state
   - normalizar payloads backend heterogéneos
   - soportar múltiples adapters de request
   - prevenir race conditions blandas en cargas de detalle
   - mantener compatibilidad con /api/user/preferences
   - preservar datos visibles de usuario cuando el backend solo devuelve prefs

   HARDENING PRO:
   - get detalle devuelve objeto limpio y rico
   - soporta { ok, data, preferences, item, payload, result, user, account }
   - soporta arrays / envelopes / nested envelopes
   - fallback AppCore.apiClient -> AppCore.request -> Http -> fetch
   - query params reales
   - Content-Type seguro
   - update theme con fallback real a PATCH /api/user/preferences
   - update language con fallback real a PATCH /api/user/preferences
   - persistencia coherente en store/state
   - errores con mensaje consistente
   - surface pública estable
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
  getCuentaStore,
  replaceCuentaStore,
  upsertCuentaStore,
} from "./cuenta.store.js";

/* =========================================================
   CONFIG
========================================================= */

export const CUENTA_RESOURCE = "cuenta";
export const CUENTA_ENDPOINT = "/api/user/preferences";
export const CUENTA_ALT_ENDPOINT = "/api/user/settings";
export const CUENTA_THEME_ENDPOINT = "/api/user/preferences/theme";
export const CUENTA_LANGUAGE_ENDPOINT = "/api/user/preferences/language";
export const CUENTA_META_ENDPOINT = "/api/user/preferences/_meta";
export const CUENTA_TIMEOUT = 15000;

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

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
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
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    return value;
  }

  return null;
}

function hasOwnKeys(value = {}) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length
  );
}

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .trim();
}

function isFormData(value) {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function isBlob(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function isArrayBuffer(value) {
  return typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer;
}

function isAbsoluteUrl(value = "") {
  return /^https?:\/\//i.test(safeText(value, ""));
}

function normalizePathPart(value = "") {
  return safeText(value, "").replace(/^\/+|\/+$/g, "");
}

function encodeUrlPathSegment(value = "") {
  return encodeURIComponent(safeText(value, ""));
}

function cleanPayload(payload = {}) {
  const obj = safeObject(payload);
  const next = {};

  Object.entries(obj).forEach(([key, value]) => {
    if (value === undefined) return;
    next[key] = value;
  });

  return next;
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
  const apiBase = safeText(
    first(
      AppCore?.config?.apiBase,
      AppCore?.config?.api?.baseUrl,
      AppCore?.state?.apiBase,
      window?.ONION_API_BASE,
      window?.API_BASE
    ),
    ""
  );

  return apiBase.replace(/\/+$/, "");
}

function appendQueryParams(url = "", query = {}) {
  const cleanUrl = safeText(url, "");
  const params = safeObject(query);

  const pairs = [];

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === "string" && value.trim() === "") return;

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item === undefined || item === null) return;
        if (typeof item === "string" && item.trim() === "") return;

        pairs.push(
          `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`
        );
      });

      return;
    }

    pairs.push(
      `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
    );
  });

  if (!pairs.length) {
    return cleanUrl;
  }

  const separator = cleanUrl.includes("?") ? "&" : "?";
  return `${cleanUrl}${separator}${pairs.join("&")}`;
}

function buildAbsoluteUrl(path = "", query = {}) {
  const cleanPath = safeText(path, "");

  if (!cleanPath) {
    return appendQueryParams(getApiBase(), query);
  }

  if (isAbsoluteUrl(cleanPath)) {
    return appendQueryParams(cleanPath, query);
  }

  const apiBase = getApiBase();

  if (!apiBase) {
    const localPath = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
    return appendQueryParams(localPath, query);
  }

  const finalPath = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
  return appendQueryParams(`${apiBase}${finalPath}`, query);
}

function getStorageValue(key = "") {
  const cleanKey = safeText(key, "");
  if (!cleanKey) return "";

  try {
    const localValue = localStorage.getItem(cleanKey);
    if (localValue) return localValue;
  } catch {}

  try {
    const sessionValue = sessionStorage.getItem(cleanKey);
    if (sessionValue) return sessionValue;
  } catch {}

  return "";
}

function getAuthToken() {
  return safeText(
    first(
      AppCore?.state?.token,
      AppCore?.state?.accessToken,
      AppCore?.auth?.getToken?.(),
      AppCore?.Auth?.getToken?.(),
      window?.Auth?.getToken?.(),
      getStorageValue("token"),
      getStorageValue("accessToken")
    ),
    ""
  );
}

function getRequestHeaders(extraHeaders = {}, body = null) {
  const token = getAuthToken();

  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...safeObject(extraHeaders),
  };

  if (isFormData(body)) {
    delete headers["Content-Type"];
    delete headers["content-type"];
  }

  return headers;
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
   ENDPOINT HELPERS
========================================================= */

export function getCuentaEndpoint() {
  return CUENTA_ENDPOINT;
}

export function getCuentaAltEndpoint() {
  return CUENTA_ALT_ENDPOINT;
}

export function getCuentaThemeEndpoint() {
  return CUENTA_THEME_ENDPOINT;
}

export function getCuentaLanguageEndpoint() {
  return CUENTA_LANGUAGE_ENDPOINT;
}

export function getCuentaMetaEndpoint() {
  return CUENTA_META_ENDPOINT;
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
      error?.response?.error,
      error?.data?.error,
      error?.error,
      error?.detail,
      fallback
    ),
    fallback
  );
}

function getErrorStatus(error = null) {
  return safeNumber(
    first(
      error?.status,
      error?.statusCode,
      error?.response?.status,
      error?.data?.status
    ),
    0
  );
}

function shouldTryNextEndpoint(error = null) {
  const status = getErrorStatus(error);

  if (!status) return true;

  return [404, 405, 409, 415, 422, 500, 502, 503, 504].includes(status);
}

/* =========================================================
   DOMAIN NORMALIZATION
========================================================= */

function normalizeBoolean(value = undefined, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    return value === 1;
  }

  const key = normalizeKey(value);

  if (["true", "1", "yes", "si", "sí", "on", "dark", "enabled"].includes(key)) {
    return true;
  }

  if (["false", "0", "no", "off", "light", "disabled"].includes(key)) {
    return false;
  }

  return Boolean(fallback);
}

function normalizeLang(value = "es") {
  const key = normalizeKey(value);

  if (["en", "eng", "english"].includes(key)) return "en";
  if (["ca", "cat", "catala", "catala_", "catalan"].includes(key)) return "ca";

  return "es";
}

function normalizeTheme(value = "", fallbackDarkMode = false) {
  const key = normalizeKey(value);

  if (["dark", "oscuro", "theme_dark"].includes(key)) return "dark";
  if (["light", "claro", "theme_light"].includes(key)) return "light";

  return fallbackDarkMode ? "dark" : "light";
}

function getCachedCuenta() {
  try {
    const fromStore = getCuentaStore?.();

    if (hasOwnKeys(fromStore)) {
      return fromStore;
    }
  } catch {}

  try {
    const fromState = safeObject(cuentaState?.item);

    if (hasOwnKeys(fromState)) {
      return fromState;
    }
  } catch {}

  return {};
}

function pickNestedObject(payload = null, keys = []) {
  const obj = safeObject(payload);

  for (const key of keys) {
    const value = obj?.[key];

    if (hasOwnKeys(value)) {
      return value;
    }
  }

  return {};
}

function collectCuentaSource(payload = null, fallback = {}) {
  const root = safeObject(payload);
  const baseFallback = safeObject(fallback);

  const data = safeObject(root.data);
  const payloadObj = safeObject(root.payload);
  const result = safeObject(root.result);
  const item = safeObject(root.item);

  const nestedDataPayload = safeObject(data.payload);
  const nestedDataResult = safeObject(data.result);
  const nestedPayloadData = safeObject(payloadObj.data);

  const preferences = safeObject(
    first(
      root.preferences,
      data.preferences,
      payloadObj.preferences,
      result.preferences,
      item.preferences,
      nestedDataPayload.preferences,
      nestedDataResult.preferences,
      nestedPayloadData.preferences
    )
  );

  const user = safeObject(
    first(
      root.user,
      root.account,
      root.cuenta,
      data.user,
      data.account,
      data.cuenta,
      payloadObj.user,
      payloadObj.account,
      payloadObj.cuenta,
      result.user,
      result.account,
      item.user,
      item.account,
      preferences.user,
      preferences.account
    )
  );

  const direct = safeObject(
    first(
      root.preferences,
      root.account,
      root.cuenta,
      root.user,
      root.item,
      root.result,
      root.payload,
      root.data,
      payload
    )
  );

  return {
    ...baseFallback,
    ...user,
    ...preferences,
    ...direct,

    user: hasOwnKeys(user) ? user : safeObject(baseFallback.user),
    preferences: hasOwnKeys(preferences)
      ? preferences
      : safeObject(baseFallback.preferences),

    raw: payload,
  };
}

function normalizeCuentaDetail(detail = {}, fallback = {}) {
  const source = collectCuentaSource(detail, fallback);
  const fallbackObj = safeObject(fallback);

  const rawTheme = first(
    source.theme,
    source.mode,
    source.colorMode,
    source.preferences?.theme,
    source.preferences?.mode,
    fallbackObj.theme
  );

  const darkMode = normalizeBoolean(
    first(
      source.darkMode,
      source.isDark,
      source.theme === "dark" ? true : null,
      source.theme === "light" ? false : null,
      source.preferences?.darkMode,
      source.preferences?.isDark,
      fallbackObj.darkMode
    ),
    normalizeTheme(rawTheme, Boolean(fallbackObj.darkMode)) === "dark"
  );

  const privacyMode = normalizeBoolean(
    first(
      source.privacyMode,
      source.privateMode,
      source.preferences?.privacyMode,
      source.preferences?.privateMode,
      fallbackObj.privacyMode
    ),
    false
  );

  const lang = normalizeLang(
    first(
      source.lang,
      source.language,
      source.locale,
      source.preferences?.lang,
      source.preferences?.language,
      source.preferences?.locale,
      fallbackObj.lang,
      fallbackObj.language,
      fallbackObj.locale,
      "es"
    )
  );

  const theme = normalizeTheme(
    first(rawTheme, darkMode ? "dark" : "light"),
    darkMode
  );

  const userId = safeText(
    first(
      source.userId,
      source.id,
      source._id,
      source.user?.userId,
      source.user?.id,
      source.preferences?.userId,
      fallbackObj.userId,
      fallbackObj.id
    ),
    ""
  );

  const email = safeText(
    first(
      source.email,
      source.emailLower,
      source.user?.email,
      source.user?.emailLower,
      fallbackObj.email,
      fallbackObj.emailLower
    ),
    ""
  );

  const username = safeText(
    first(
      source.username,
      source.usernameLower,
      source.user?.username,
      source.user?.usernameLower,
      fallbackObj.username,
      fallbackObj.usernameLower
    ),
    ""
  );

  const name = safeText(
    first(
      source.name,
      source.fullName,
      source.displayName,
      source.nombre,
      source.user?.name,
      source.user?.fullName,
      source.user?.displayName,
      fallbackObj.name,
      fallbackObj.fullName,
      fallbackObj.displayName
    ),
    ""
  );

  const phone = safeText(
    first(
      source.phone,
      source.telefono,
      source.mobile,
      source.user?.phone,
      source.user?.telefono,
      fallbackObj.phone,
      fallbackObj.telefono
    ),
    ""
  );

  const role = safeText(
    first(
      source.role,
      source.rol,
      source.user?.role,
      source.user?.rol,
      fallbackObj.role,
      "user"
    ),
    "user"
  );

  const updatedAt = first(
    source.updatedAt,
    source.updated_at,
    source.modifiedAt,
    source.preferences?.updatedAt,
    source.preferences?.updated_at,
    fallbackObj.updatedAt,
    fallbackObj.updated_at,
    null
  );

  const createdAt = first(
    source.createdAt,
    source.created_at,
    fallbackObj.createdAt,
    fallbackObj.created_at,
    null
  );

  return {
    ...fallbackObj,
    ...source,

    id: safeText(first(source.id, source._id, userId, fallbackObj.id), userId),
    userId,

    email,
    emailLower: safeLower(first(source.emailLower, email, fallbackObj.emailLower), email),

    username,
    usernameLower: safeLower(
      first(source.usernameLower, username, fallbackObj.usernameLower),
      username
    ),

    name,
    fullName: safeText(first(source.fullName, name, fallbackObj.fullName), name),
    displayName: safeText(
      first(source.displayName, name, username, email, fallbackObj.displayName),
      name || username || email
    ),

    phone,
    telefono: safeText(first(source.telefono, phone, fallbackObj.telefono), phone),

    role,

    active: normalizeBoolean(
      first(source.active, source.enabled, fallbackObj.active),
      true
    ),

    tipo: safeText(first(source.tipo, source.type, fallbackObj.tipo), ""),

    nif: safeText(first(source.nif, source.taxId, fallbackObj.nif), ""),

    direccion: safeObject(
      first(source.direccion, source.address, fallbackObj.direccion),
      {}
    ),

    darkMode,
    privacyMode,
    theme,
    mode: theme,
    lang,
    language: lang,
    locale: lang,

    updatedAt,
    updated_at: updatedAt,
    createdAt,
    created_at: createdAt,

    preferences: {
      ...safeObject(fallbackObj.preferences),
      ...safeObject(source.preferences),
      darkMode,
      privacyMode,
      theme,
      lang,
      language: lang,
      locale: lang,
      updatedAt,
    },

    raw: detail,
  };
}

function looksLikeCuenta(value = null) {
  const obj = safeObject(value);

  return Boolean(
    Object.prototype.hasOwnProperty.call(obj, "darkMode") ||
      Object.prototype.hasOwnProperty.call(obj, "privacyMode") ||
      Object.prototype.hasOwnProperty.call(obj, "theme") ||
      Object.prototype.hasOwnProperty.call(obj, "lang") ||
      Object.prototype.hasOwnProperty.call(obj, "language") ||
      Object.prototype.hasOwnProperty.call(obj, "locale") ||
      obj.updatedAt ||
      obj.updated_at ||
      obj.userId ||
      obj.preferences ||
      obj.account ||
      obj.cuenta ||
      obj.user ||
      obj.email ||
      obj.username ||
      obj.name
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
  if (obj.detail) return obj.detail;

  if (obj.payload) {
    return unwrapResponseEnvelope(obj.payload);
  }

  if (obj.data && typeof obj.data === "object") {
    return unwrapResponseEnvelope(obj.data);
  }

  return obj;
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
  if (looksLikeCuenta(obj.detail)) return obj.detail;

  if (obj.data && typeof obj.data === "object") {
    return pickDetail(obj.data);
  }

  if (obj.payload && typeof obj.payload === "object") {
    return pickDetail(obj.payload);
  }

  return Object.keys(obj).length ? obj : null;
}

function normalizeCuentaResponse(response = null, fallback = {}) {
  const source =
    pickDetail(response) ||
    unwrapResponseEnvelope(response) ||
    response ||
    {};

  return normalizeCuentaDetail(source, fallback);
}

function pickMeta(payload = null) {
  const obj = safeObject(payload);
  const data = safeObject(obj.data);
  const payloadObj = safeObject(obj.payload);
  const meta = safeObject(first(obj.meta, data.meta, payloadObj.meta, obj));

  return {
    ok: Boolean(first(obj.ok, data.ok, payloadObj.ok, true)),
    service: safeText(
      first(
        meta.service,
        obj.service,
        data.service,
        payloadObj.service,
        "user-preferences"
      ),
      "user-preferences"
    ),
    version: safeText(
      first(meta.version, obj.version, data.version, payloadObj.version),
      ""
    ),
    container: safeText(
      first(meta.container, obj.container, data.container, payloadObj.container),
      ""
    ),
    partitionKey: safeText(
      first(
        meta.partitionKey,
        obj.partitionKey,
        data.partitionKey,
        payloadObj.partitionKey
      ),
      ""
    ),
    defaults: safeObject(
      first(meta.defaults, obj.defaults, data.defaults, payloadObj.defaults)
    ),
    endpoints: safeArray(
      first(meta.endpoints, obj.endpoints, data.endpoints, payloadObj.endpoints)
    ),
    user: safeObject(
      first(meta.user, obj.user, data.user, payloadObj.user)
    ),
    raw: payload,
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

  const verb = safeText(method, "GET").toLowerCase();
  const timeout = safeNumber(options.timeout, CUENTA_TIMEOUT);

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

  if (verb === "patch" && typeof client.patch === "function") {
    return client.patch(path, options.body, {
      timeout,
      auth: true,
      headers: options.headers,
      query: options.query,
      params: options.params,
    });
  }

  if (verb === "put" && typeof client.put === "function") {
    return client.put(path, options.body, {
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

  throw new Error("CUENTA_API_CLIENT_METHOD_UNAVAILABLE");
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

  if (verb === "patch" && typeof Http.patch === "function") {
    return Http.patch(path, options.body, {
      headers: options.headers,
      query: options.query,
      params: options.params,
      timeout: options.timeout,
    });
  }

  if (verb === "put" && typeof Http.put === "function") {
    return Http.put(path, options.body, {
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
  const body = options.body;
  const url = buildAbsoluteUrl(path, options.query || options.params || {});
  const controller = new AbortController();

  const timeout = safeNumber(options.timeout, CUENTA_TIMEOUT);

  const timeoutId = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, timeout);

  const headers = getRequestHeaders(options.headers, body);

  const finalOptions = {
    method: method.toUpperCase(),
    headers,
    credentials: "include",
    signal: controller.signal,
  };

  if (body !== undefined && body !== null) {
    if (isFormData(body)) {
      finalOptions.body = body;
    } else if (
      typeof body === "string" ||
      isBlob(body) ||
      isArrayBuffer(body)
    ) {
      finalOptions.body = body;
    } else {
      finalOptions.headers = {
        "Content-Type": "application/json",
        ...headers,
      };
      finalOptions.body = JSON.stringify(body);
    }
  }

  try {
    const response = await fetch(url, finalOptions);
    const contentType = safeText(response.headers.get("content-type"), "");

    let data = null;

    if (response.status !== 204) {
      if (contentType.includes("application/json")) {
        try {
          data = await response.json();
        } catch {
          data = null;
        }
      } else {
        const text = await response.text();

        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = text ? { raw: text } : null;
        }
      }
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
      error.statusCode = response.status;
      error.url = url;

      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function request(method = "GET", path = "", options = {}) {
  const body = options.body;

  const requestOptions = {
    timeout: safeNumber(options.timeout, CUENTA_TIMEOUT),
    query: safeObject(options.query),
    params: safeObject(options.params),
    body,
    headers: getRequestHeaders(
      {
        ...(!isFormData(body) &&
        body !== undefined &&
        body !== null &&
        !isBlob(body) &&
        !isArrayBuffer(body)
          ? {
              "Content-Type": "application/json",
            }
          : {}),
        ...safeObject(options.headers),
      },
      body
    ),
  };

  const adapters = isFormData(body)
    ? [
        requestViaFetch,
        requestViaApiClient,
        requestViaAppCoreRequest,
        requestViaHttpModule,
      ]
    : [
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

async function requestFirst(method = "GET", paths = [], options = {}) {
  const candidates = safeArray(paths)
    .map((path) => safeText(path, ""))
    .filter(Boolean);

  let lastError = null;

  for (const path of candidates) {
    try {
      return await request(method, path, options);
    } catch (error) {
      lastError = error;

      if (!shouldTryNextEndpoint(error)) {
        break;
      }
    }
  }

  throw lastError || new Error("CUENTA_REQUEST_CANDIDATES_FAILED");
}

/* =========================================================
   PAYLOAD BUILDERS
========================================================= */

function normalizeCuentaUpdatePayload(payload = {}) {
  const body = safeObject(payload);

  const hasDarkMode =
    Object.prototype.hasOwnProperty.call(body, "darkMode") ||
    Object.prototype.hasOwnProperty.call(body, "theme");

  const hasPrivacyMode =
    Object.prototype.hasOwnProperty.call(body, "privacyMode") ||
    Object.prototype.hasOwnProperty.call(body, "privateMode");

  const hasLang =
    Object.prototype.hasOwnProperty.call(body, "lang") ||
    Object.prototype.hasOwnProperty.call(body, "language") ||
    Object.prototype.hasOwnProperty.call(body, "locale");

  const darkMode = normalizeBoolean(
    first(
      body.darkMode,
      body.theme === "dark" ? true : null,
      body.theme === "light" ? false : null
    ),
    false
  );

  const privacyMode = normalizeBoolean(
    first(body.privacyMode, body.privateMode),
    false
  );

  const lang = normalizeLang(
    first(body.lang, body.language, body.locale, "es")
  );

  return cleanPayload({
    ...body,

    ...(hasDarkMode
      ? {
          darkMode,
          theme: darkMode ? "dark" : "light",
        }
      : {}),

    ...(hasPrivacyMode
      ? {
          privacyMode,
        }
      : {}),

    ...(hasLang
      ? {
          lang,
          language: lang,
          locale: lang,
        }
      : {}),
  });
}

function normalizeThemePayload(darkMode = true) {
  const nextDarkMode = normalizeBoolean(darkMode, true);

  return {
    darkMode: nextDarkMode,
    theme: nextDarkMode ? "dark" : "light",
  };
}

function normalizeLanguagePayload(lang = "es") {
  const nextLang = normalizeLang(lang);

  return {
    lang: nextLang,
    language: nextLang,
    locale: nextLang,
  };
}

/* =========================================================
   RAW REQUESTS
========================================================= */

export async function fetchCuentaRequest({
  timeout = CUENTA_TIMEOUT,
  query = {},
} = {}) {
  const response = await requestFirst(
    "GET",
    [
      CUENTA_ENDPOINT,
      CUENTA_ALT_ENDPOINT,
    ],
    {
      timeout,
      query,
    }
  );

  return normalizeCuentaResponse(response, getCachedCuenta());
}

export async function updateCuentaRequest(
  payload = {},
  {
    timeout = CUENTA_TIMEOUT,
  } = {}
) {
  const body = normalizeCuentaUpdatePayload(payload);

  const response = await requestFirst(
    "PATCH",
    [
      CUENTA_ENDPOINT,
      CUENTA_ALT_ENDPOINT,
    ],
    {
      timeout,
      body,
    }
  );

  return normalizeCuentaResponse(response, {
    ...getCachedCuenta(),
    ...body,
  });
}

export async function updateCuentaThemeRequest(
  darkMode = true,
  {
    timeout = CUENTA_TIMEOUT,
  } = {}
) {
  const body = normalizeThemePayload(darkMode);

  const response = await requestFirst(
    "PATCH",
    [
      CUENTA_THEME_ENDPOINT,
      CUENTA_ENDPOINT,
      CUENTA_ALT_ENDPOINT,
    ],
    {
      timeout,
      body,
    }
  );

  return normalizeCuentaResponse(response, {
    ...getCachedCuenta(),
    ...body,
  });
}

export async function updateCuentaLanguageRequest(
  lang = "es",
  {
    timeout = CUENTA_TIMEOUT,
  } = {}
) {
  const body = normalizeLanguagePayload(lang);

  const response = await requestFirst(
    "PATCH",
    [
      CUENTA_LANGUAGE_ENDPOINT,
      CUENTA_ENDPOINT,
      CUENTA_ALT_ENDPOINT,
    ],
    {
      timeout,
      body,
    }
  );

  return normalizeCuentaResponse(response, {
    ...getCachedCuenta(),
    ...body,
  });
}

export async function fetchCuentaMetaRequest({
  timeout = CUENTA_TIMEOUT,
} = {}) {
  const response = await requestFirst(
    "GET",
    [
      CUENTA_META_ENDPOINT,
      `${CUENTA_ENDPOINT}/_meta`,
      `${CUENTA_ALT_ENDPOINT}/_meta`,
    ],
    {
      timeout,
    }
  );

  return pickMeta(response);
}

/* =========================================================
   CACHE HYDRATE
========================================================= */

export function hydrateCuentaFromCache() {
  try {
    const current = safeObject(cuentaState?.item);

    if (hasOwnKeys(current)) {
      const normalized = normalizeCuentaDetail(current, getCachedCuenta());

      replaceCuentaStore(normalized);
      setItem?.(normalized);

      return normalized;
    }

    const stored = safeObject(getCuentaStore?.());

    if (hasOwnKeys(stored)) {
      const normalized = normalizeCuentaDetail(stored, {});

      replaceCuentaStore(normalized);
      setItem?.(normalized);

      return normalized;
    }

    return {};
  } catch {
    return {};
  }
}

/* =========================================================
   STATE HYDRATION
========================================================= */

function applyLoadedDetailToState(detail = null, { replace = true } = {}) {
  if (!detail) return null;

  const normalized = normalizeCuentaDetail(detail, getCachedCuenta());

  if (replace) {
    replaceCuentaStore(normalized);
  } else {
    try {
      upsertCuentaStore?.(normalized);
    } catch {
      replaceCuentaStore(normalized);
    }
  }

  setItem(normalized);
  setLastSyncAt(Date.now());
  setLoaded(true);
  setError(null);

  return normalized;
}

/* =========================================================
   LOAD DETAIL
========================================================= */

export async function loadCuenta({
  force = false,
  query = {},
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

    const detail = await fetchCuentaRequest({
      timeout: CUENTA_TIMEOUT,
      query: {
        ...safeObject(query),
        ...(force ? { _t: Date.now() } : {}),
      },
    });

    if (!isActiveLoadToken(loadToken)) {
      return safeObject(cuentaState?.item);
    }

    return applyLoadedDetailToState(detail, {
      replace: true,
    });
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

    return applyLoadedDetailToState(updated, {
      replace: false,
    });
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

    return applyLoadedDetailToState(updated, {
      replace: false,
    });
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

export async function updateCuentaLanguage(lang = "es") {
  try {
    setSaving?.(true);
    setError(null);

    const updated = await updateCuentaLanguageRequest(lang);

    return applyLoadedDetailToState(updated, {
      replace: false,
    });
  } catch (error) {
    console.error("❌ CUENTA LANGUAGE UPDATE:", error);

    setError(
      normalizeErrorMessage(
        error,
        "No se pudo actualizar el idioma."
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
    return await fetchCuentaMetaRequest({
      timeout: CUENTA_TIMEOUT,
    });
  } catch (error) {
    console.error("❌ CUENTA META:", error);
    throw error;
  }
}

/* =========================================================
   PUBLIC API
========================================================= */

export const CuentaApi = Object.freeze({
  resource: CUENTA_RESOURCE,
  endpoint: CUENTA_ENDPOINT,
  altEndpoint: CUENTA_ALT_ENDPOINT,
  themeEndpoint: CUENTA_THEME_ENDPOINT,
  languageEndpoint: CUENTA_LANGUAGE_ENDPOINT,
  metaEndpoint: CUENTA_META_ENDPOINT,
  timeout: CUENTA_TIMEOUT,

  getCuentaEndpoint,
  getCuentaAltEndpoint,
  getCuentaThemeEndpoint,
  getCuentaLanguageEndpoint,
  getCuentaMetaEndpoint,

  normalizeCuentaDetail,
  hydrateCuentaFromCache,

  fetchCuentaRequest,
  updateCuentaRequest,
  updateCuentaThemeRequest,
  updateCuentaLanguageRequest,
  fetchCuentaMetaRequest,

  loadCuenta,
  updateCuenta,
  updateCuentaTheme,
  updateCuentaLanguage,
  loadCuentaMeta,
});

export default CuentaApi;
