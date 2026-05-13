/* =========================================================
   Onion SPA - Home API
   Archivo: src/views/home/home.api.js

   ONION SUPPORT · HOME API
   MODULAR BACKEND AGGREGATOR · FINAL EXTREME 11/10

   Responsabilidades:
   - Centralizar llamadas HTTP del módulo Home.
   - NO consumir routers legacy eliminados: /api/dashboard/*.
   - Construir el dashboard de Home desde módulos backend reales:
       · /api/tickets/stats
       · /api/tickets
       · /api/facturas/stats
       · /api/facturas
       · /api/clientes/stats
       · /api/clientes
       · /api/users/stats solo si role === "admin"
       · /api/users solo si role === "admin"
       · /api/health/ready como health opcional
   - Tolerar 403/404 por módulo sin romper Home.
   - Evitar llamadas a users para roles no admin, porque backend users
     exige role exacto "admin".
   - Normalizar payloads backend heterogéneos.
   - Separar total/count real de visibleCount.
   - No pisar contadores reales por arrays vacíos.
   - Retornar stale cache si backend falla y se solicita.
   - Evitar carreras con token de carga.
   - Exponer snapshot de diagnóstico seguro.
   - No tocar DOM.
   - No CSS.
   - No HTML.

   Contrato público:
   - loadHomeDashboard(options)
   - refreshHomeDashboard(options)
   - hydrateHomeFromCache(options)
   - normalizeDashboard(payload)
   - normalizeHomeDashboardResponse(payload)
   - resolveHomeWidgetFromDashboard(widgetId, dashboard)
   - loadHomeHealth(options)
   - getHomeApiSnapshot()

   Regla crítica:
   - total/count = contador agregado real.
   - visibleCount = longitud del array renderizable.
   - Nunca se sustituye un contador agregado real por 0
     solo porque el backend no haya enviado arrays visibles.
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

export const HOME_API_VERSION = "11.0.0";

export const HOME_DASHBOARD_ENDPOINT = "local:home-modular-aggregate";
export const HOME_DASHBOARD_LEGACY_ENDPOINT = "";
export const HOME_DASHBOARD_PING_ENDPOINT = "/api/health/ready";

export const HOME_TIMEOUT = 15000;
export const HOME_HEALTH_TIMEOUT = 8000;

const SOURCE = "views:home:api";

const HOME_API_CACHE_KEY = "onion.home.api.cache.v11";
const HOME_API_CACHE_TTL_MS = 1000 * 60 * 10;

const DEFAULT_RECENT_LIMIT = 6;
const MAX_SNAPSHOT_RECENT = 40;

const ENDPOINTS = Object.freeze({
  ticketsStats: "/api/tickets/stats",
  ticketsList: "/api/tickets",

  facturasStats: "/api/facturas/stats",
  facturasList: "/api/facturas",

  clientesStats: "/api/clientes/stats",
  clientesList: "/api/clientes",

  usersStats: "/api/users/stats",
  usersList: "/api/users",

  healthReady: "/api/health/ready",
  health: "/api/health",
  healthLive: "/api/health/live",

  rootHealthReady: "/health/ready",
  rootHealth: "/health",
  rootHealthLive: "/health/live",
});

const DEFAULT_LIST_PARAMS = Object.freeze({
  limit: DEFAULT_RECENT_LIMIT,
  includeTotal: true,
  sortBy: "updatedAt",
  sortDir: "DESC",
});

const ADAPTER_UNAVAILABLE_CODES = Object.freeze([
  "HOME_API_CLIENT_UNAVAILABLE",
  "HOME_API_CLIENT_METHOD_UNAVAILABLE",
  "APP_CORE_REQUEST_UNAVAILABLE",
  "HTTP_MODULE_UNAVAILABLE",
  "HTTP_MODULE_METHOD_UNAVAILABLE",
  "FETCH_UNAVAILABLE",
]);

const SENSITIVE_PARAM_NAMES = Object.freeze([
  "token",
  "activationToken",
  "activateToken",
  "resetToken",
  "passwordResetToken",
  "confirmToken",
  "code",
  "t",
  "access_token",
  "refresh_token",
  "id_token",
  "tempToken",
  "temp_token",
  "temporaryToken",
  "temporary_token",
  "twoFactorToken",
  "two_factor_token",
  "mfaToken",
  "mfa_token",
]);

/* =========================================================
   RUNTIME
========================================================= */

let lastLoadToken = 0;

const runtime = {
  initialized: true,

  loading: false,
  refreshing: false,

  lastEndpoint: "",
  lastRequestAt: "",
  lastResponseAt: "",
  lastLoadedAt: "",
  lastCacheHydratedAt: "",

  lastError: null,
  lastErrorMessage: "",
  lastRequestId: "",

  modules: {
    tickets: null,
    facturas: null,
    clientes: null,
    users: null,
    health: null,
  },

  recent: [],
};

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "string") {
    let normalized = value
      .trim()
      .replace(/[€$£¥%]/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s/g, "");

    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
      const lastComma = normalized.lastIndexOf(",");
      const lastDot = normalized.lastIndexOf(".");

      normalized =
        lastComma > lastDot
          ? normalized.replace(/\./g, "").replace(/,/g, ".")
          : normalized.replace(/,/g, "");
    } else if (hasComma) {
      normalized = normalized.replace(/,/g, ".");
    }

    const parsed = Number(normalized);

    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "y", "si", "sí", "on", "ok"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "n", "off"].includes(normalized)) {
      return false;
    }
  }

  return Boolean(fallback);
}

function hasOwnKeys(value) {
  return Boolean(isObject(value) && Object.keys(value).length > 0);
}

function isMeaningfulValue(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string" && value.trim() === "") {
    return false;
  }

  if (Array.isArray(value) && value.length === 0) {
    return false;
  }

  return true;
}

function first(...values) {
  for (const value of values) {
    if (isMeaningfulValue(value)) {
      return value;
    }
  }

  return null;
}

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function safeClone(value, fallback = null) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {}

  return fallback;
}

function safeCall(fn, ...args) {
  try {
    if (isFn(fn)) {
      return fn(...args);
    }
  } catch {}

  return undefined;
}

function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "")
    .trim();
}

function getPath(object = {}, path = "") {
  const root = safeObject(object, null);
  const cleanPath = safeText(path, "");

  if (!root || !cleanPath) {
    return undefined;
  }

  return cleanPath.split(".").reduce((acc, segment) => {
    if (acc === null || acc === undefined) {
      return undefined;
    }

    return acc?.[segment];
  }, root);
}

function pickFirstFromSources(keys = [], sources = [], fallback = null) {
  for (const source of safeArray(sources)) {
    const object = safeObject(source, null);

    if (!object) {
      continue;
    }

    for (const key of safeArray(keys)) {
      const cleanKey = safeText(key, "");

      if (!cleanKey) {
        continue;
      }

      const value = cleanKey.includes(".")
        ? getPath(object, cleanKey)
        : object?.[cleanKey];

      if (isMeaningfulValue(value)) {
        return value;
      }
    }
  }

  return fallback;
}

function pickMaxFromSources(keys = [], sources = [], fallback = 0) {
  let max = null;

  for (const source of safeArray(sources)) {
    const object = safeObject(source, null);

    if (!object) {
      continue;
    }

    for (const key of safeArray(keys)) {
      const cleanKey = safeText(key, "");

      if (!cleanKey) {
        continue;
      }

      const raw = cleanKey.includes(".")
        ? getPath(object, cleanKey)
        : object?.[cleanKey];

      const number = safeNumber(raw, NaN);

      if (!Number.isFinite(number)) {
        continue;
      }

      max = max === null ? number : Math.max(max, number);
    }
  }

  return max === null ? fallback : max;
}

function uniqueBy(items = [], picker = (item) => item) {
  const seen = new Set();
  const output = [];

  for (const item of safeArray(items)) {
    const rawKey = safeText(picker(item), "");

    if (!rawKey) {
      output.push(item);
      continue;
    }

    const key = normalizeKey(rawKey);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(item);
  }

  return output;
}

function mergeParams(...sources) {
  const output = {};

  for (const source of sources) {
    const object = safeObject(source, null);

    if (!object) {
      continue;
    }

    for (const [key, value] of Object.entries(object)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }

      output[key] = value;
    }
  }

  return output;
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
   REDACTION / LOG / EVENTS
========================================================= */

function redactSensitiveText(value = "") {
  let output = safeText(value, "");

  if (!output) {
    return "";
  }

  for (const name of SENSITIVE_PARAM_NAMES) {
    try {
      const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      output = output.replace(
        new RegExp(`([?&#]${escaped}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  try {
    output = output.replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    );
  } catch {}

  return output;
}

function sanitizePayload(value, depth = 0) {
  if (depth > 7) {
    return "[MaxDepth]";
  }

  if (typeof value === "string") {
    return redactSensitiveText(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 120).map((item) => sanitizePayload(item, depth + 1));
  }

  if (value instanceof Error) {
    return {
      name: safeText(value.name, "Error"),
      message: redactSensitiveText(value.message || ""),
      code: value.code || null,
      status: value.status || value.statusCode || null,
    };
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (/token|secret|password|authorization|credential|bearer/i.test(key)) {
        output[key] = item ? "***" : item;
        continue;
      }

      output[key] = sanitizePayload(item, depth + 1);
    }

    return output;
  }

  return String(value);
}

function pushRecent(event = {}) {
  runtime.recent.unshift({
    ...sanitizePayload(event),
    at: nowIso(),
  });

  if (runtime.recent.length > MAX_SNAPSHOT_RECENT) {
    runtime.recent = runtime.recent.slice(0, MAX_SNAPSHOT_RECENT);
  }
}

function safeLog(...args) {
  const cleanArgs = args.map((item) => sanitizePayload(item));

  try {
    AppCore?.utils?.log?.("[HomeAPI]", ...cleanArgs);
    return;
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.log("[HomeAPI]", ...cleanArgs);
    }
  } catch {}
}

function safeWarn(...args) {
  const cleanArgs = args.map((item) => sanitizePayload(item));

  try {
    if (isFn(AppCore?.utils?.warn)) {
      AppCore.utils.warn("[HomeAPI]", ...cleanArgs);
      return;
    }
  } catch {}

  try {
    console.warn("[HomeAPI]", ...cleanArgs);
  } catch {}
}

function safeError(...args) {
  const cleanArgs = args.map((item) => sanitizePayload(item));

  try {
    if (isFn(AppCore?.utils?.error)) {
      AppCore.utils.error("[HomeAPI]", ...cleanArgs);
      return;
    }
  } catch {}

  try {
    console.error("[HomeAPI]", ...cleanArgs);
  } catch {}
}

function safeWindowDispatch(eventName = "", payload = {}) {
  if (!isBrowser() || !eventName) {
    return false;
  }

  try {
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: payload,
      })
    );

    return true;
  } catch {}

  return false;
}

function safeEmit(eventName = "", payload = {}, options = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  const finalPayload = sanitizePayload({
    source: SOURCE,
    version: HOME_API_VERSION,
    ...safeObject(payload),
  });

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFn(AppCore?.events?.emit)) {
      busAvailable = true;
      AppCore.events.emit(name, finalPayload);
      busEmitted = true;
    }
  } catch {}

  if (options.window === true || (!busAvailable && isBrowser())) {
    return safeWindowDispatch(name, finalPayload) || busEmitted;
  }

  return busEmitted;
}

/* =========================================================
   ROLE / AUTH
========================================================= */

function getModuleByName(...names) {
  for (const name of names) {
    const cleanName = safeText(name, "");

    if (!cleanName) {
      continue;
    }

    try {
      if (isFn(AppCore?.modules?.get)) {
        const resolved = AppCore.modules.get(cleanName);

        if (resolved) {
          return resolved;
        }
      }
    } catch {}
  }

  for (const name of names) {
    const cleanName = safeText(name, "");

    if (!cleanName) {
      continue;
    }

    const direct =
      AppCore?.[cleanName] ||
      AppCore?.modules?.[cleanName] ||
      (typeof globalThis !== "undefined" ? globalThis?.[cleanName] : null);

    if (direct) {
      return direct;
    }
  }

  return null;
}

function getAuthModule() {
  return getModuleByName("Auth", "auth");
}

function getHttpModule() {
  return getModuleByName("Http", "http");
}

export function getHomeApiClient() {
  return (
    getModuleByName("apiClient", "ApiClient", "api") ||
    AppCore?.apiClient ||
    AppCore?.api ||
    null
  );
}

function getCurrentUser() {
  return safeObject(
    first(
      AppCore?.state?.user,
      AppCore?.state?.currentUser,
      AppCore?.state?.session?.user,
      AppCore?.state?.auth?.user,
      AppCore?.user,
      null
    ),
    {}
  );
}

function getCurrentRole() {
  const auth = getAuthModule();

  return safeLower(
    first(
      AppCore?.state?.role,
      AppCore?.state?.user?.role,
      AppCore?.state?.user?.rol,
      AppCore?.state?.session?.role,
      AppCore?.state?.session?.user?.role,
      AppCore?.state?.auth?.role,
      AppCore?.state?.auth?.user?.role,
      getCurrentUser()?.role,
      getCurrentUser()?.rol,
      safeCall(auth?.getCurrentRole?.bind?.(auth)),
      safeCall(auth?.getRole?.bind?.(auth)),
      ""
    ),
    ""
  );
}

function canRequestUsersModule(options = {}) {
  if (typeof options.includeUsers === "boolean") {
    return options.includeUsers;
  }

  /*
    Backend real actual:
    usersRouter.isAdminRequest(req) === getAuthenticatedRole(req) === "admin".
    No usar aliases aquí para evitar 403 innecesarios en Home.
  */
  return getCurrentRole() === "admin";
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
  const auth = getAuthModule();

  const authHeader = safeText(
    first(
      safeCall(auth?.getAuthHeader?.bind?.(auth)),
      safeCall(auth?.buildAuthHeader?.bind?.(auth)),
      ""
    ),
    ""
  );

  if (/^Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^Bearer\s+/i, "").trim();
  }

  return safeText(
    first(
      AppCore?.state?.token,
      AppCore?.state?.accessToken,
      AppCore?.state?.authToken,

      AppCore?.state?.session?.token,
      AppCore?.state?.session?.accessToken,

      AppCore?.state?.auth?.token,
      AppCore?.state?.auth?.accessToken,

      safeCall(auth?.getToken?.bind?.(auth)),
      safeCall(auth?.getAccessToken?.bind?.(auth)),

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
      readWebStorageValue("sessionStorage", "onion:auth.accessToken")
    ),
    ""
  );
}

function getRequestHeaders(extraHeaders = {}) {
  const token = getAuthToken();

  return {
    Accept: "application/json",

    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),

    ...safeObject(extraHeaders),
  };
}

/* =========================================================
   URL HELPERS
========================================================= */

function getApiBase() {
  return safeText(
    first(
      AppCore?.config?.apiBase,
      AppCore?.config?.apiBaseUrl,
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

function joinApiBaseAndPath(apiBase = "", path = "") {
  const base = safeText(apiBase, "").replace(/\/+$/g, "");
  let cleanPath = safeText(path, "");

  if (!cleanPath) {
    return base || "/";
  }

  if (/^https?:\/\//i.test(cleanPath)) {
    return cleanPath;
  }

  if (!cleanPath.startsWith("/")) {
    cleanPath = `/${cleanPath}`;
  }

  /*
    Evita doble /api cuando apiBase ya viene como:
    https://api.onionit.net/api
  */
  if (/\/api$/i.test(base) && /^\/api(\/|$)/i.test(cleanPath)) {
    cleanPath = cleanPath.replace(/^\/api/i, "") || "/";
  }

  return base ? `${base}${cleanPath}` : cleanPath;
}

function buildAbsoluteUrl(path = "") {
  return joinApiBaseAndPath(getApiBase(), path);
}

function appendParamsToUrl(url = "", params = null) {
  const entries = Object.entries(safeObject(params));

  if (!entries.length) {
    return url;
  }

  try {
    const isAbsolute = /^https?:\/\//i.test(url);
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

    if (isAbsolute) {
      return parsed.toString();
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

/* =========================================================
   ERROR NORMALIZATION
========================================================= */

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

function normalizeErrorMessage(error = null, fallback = "Error de API.") {
  const status = getErrorStatus(error);
  const code = normalizeKey(getErrorCode(error));

  if (status === 0 && error?.name === "AbortError") {
    return "La petición de Home ha agotado el tiempo de espera.";
  }

  if (status === 401 || code === "unauthorized") {
    return "No autorizado. Inicia sesión de nuevo.";
  }

  if (status === 403 || code === "forbidden") {
    return "No tienes permisos para consultar este módulo.";
  }

  if (
    status === 404 ||
    [
      "route_not_found",
      "endpoint_not_found",
      "not_found",
      "tickets_route_not_found",
      "facturas_route_not_found",
      "users_route_not_found",
    ].includes(code)
  ) {
    return "El endpoint solicitado no está disponible.";
  }

  if (status >= 500) {
    return "El backend devolvió un error interno.";
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

function normalizeRequestError(error = null) {
  return {
    status: getErrorStatus(error),
    code: safeText(getErrorCode(error), ""),
    message: normalizeErrorMessage(error),
    raw: sanitizePayload(error),
  };
}

function isSoftModuleError(error = null) {
  const status = getErrorStatus(error);

  return status === 401 || status === 403 || status === 404;
}

/* =========================================================
   RESPONSE / ENVELOPE HELPERS
========================================================= */

function unwrapResponseEnvelope(payload = null, depth = 0) {
  if (payload === null || payload === undefined) {
    return null;
  }

  if (depth > 12) {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  const object = safeObject(payload, null);

  if (!object) {
    return payload;
  }

  if (
    "modules" in object ||
    "dashboard" in object ||
    "summary" in object ||
    "stats" in object ||
    "items" in object ||
    "rows" in object ||
    "resources" in object ||
    "data" in object && Array.isArray(object.data)
  ) {
    return object;
  }

  const candidates = [
    object.data,
    object.result,
    object.payload,
    object.body,
    object.response,
    object.item,
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

  return object;
}

function extractOk(payload = null, fallback = true) {
  const object = safeObject(payload, null);

  if (!object) {
    return fallback;
  }

  if (typeof object.ok === "boolean") {
    return object.ok;
  }

  if (typeof object.success === "boolean") {
    return object.success;
  }

  if (typeof object.data?.ok === "boolean") {
    return object.data.ok;
  }

  if (typeof object.data?.success === "boolean") {
    return object.data.success;
  }

  return fallback;
}

function getRequestIdFromPayload(payload = null) {
  const object = safeObject(payload, null);

  return safeText(
    first(
      object?.requestId,
      object?.correlationId,
      object?.traceId,
      object?.operationId,
      object?.meta?.requestId,
      object?.headers?.["x-request-id"],
      object?.data?.requestId,
      object?.data?.meta?.requestId,
      object?.result?.requestId,
      object?.payload?.requestId
    ),
    ""
  );
}

function extractMeta(payload = null) {
  const object = safeObject(payload, null);

  return safeObject(
    first(
      object?.meta,
      object?.pagination,
      object?.pageInfo,
      object?.data?.meta,
      object?.data?.pagination,
      object?.result?.meta,
      object?.result?.pagination,
      object?.payload?.meta,
      object?.payload?.pagination,
      {}
    )
  );
}

function extractStatsBlock(payload = null) {
  const unwrapped = unwrapResponseEnvelope(payload);
  const object = safeObject(unwrapped, {});

  return safeObject(
    first(
      object.stats,
      object.summary,
      object.metrics,
      object.totals,
      object.counts,
      object.data?.stats,
      object.data?.summary,
      object.result?.stats,
      object.payload?.stats,
      object
    ),
    {}
  );
}

function extractCollection(payload = null, aliases = []) {
  const unwrapped = unwrapResponseEnvelope(payload);

  if (Array.isArray(unwrapped)) {
    return {
      items: unwrapped,
      total: unwrapped.length,
      raw: payload,
    };
  }

  const object = safeObject(unwrapped, {});

  const candidateSources = [
    object,
    object.data,
    object.result,
    object.payload,
    object.response,
    object.body,
    object.collections,
    object.resources,
    object.data?.collections,
    object.data?.resources,
    object.result?.collections,
    object.payload?.collections,
  ].filter(hasOwnKeys);

  for (const source of candidateSources) {
    for (const key of aliases) {
      const value = source?.[key];

      if (Array.isArray(value)) {
        return {
          items: value,
          total: Math.max(value.length, extractTotal(source, aliases, value.length)),
          raw: payload,
        };
      }

      if (hasOwnKeys(value)) {
        const nested = extractCollection(value, aliases);

        if (nested.items.length || nested.total > 0) {
          return nested;
        }
      }
    }

    const direct = first(
      source.items,
      source.rows,
      source.records,
      source.results,
      source.docs,
      source.documents,
      source.value,
      source.list
    );

    if (Array.isArray(direct)) {
      return {
        items: direct,
        total: Math.max(direct.length, extractTotal(source, aliases, direct.length)),
        raw: payload,
      };
    }
  }

  return {
    items: [],
    total: extractTotal(object, aliases, 0),
    raw: payload,
  };
}

function extractTotal(payload = null, aliases = [], fallback = 0) {
  const object = safeObject(unwrapResponseEnvelope(payload), {});

  const keys = [
    "total",
    "count",
    "totalCount",
    "remoteCount",
    "countTotal",
    "documentsCounted",

    "meta.total",
    "meta.count",
    "meta.totalCount",
    "meta.remoteCount",

    "pagination.total",
    "pagination.count",
    "pagination.totalCount",

    "page.total",
    "pageInfo.total",
    "pageInfo.totalCount",

    ...safeArray(aliases).flatMap((alias) => [
      `${alias}Total`,
      `total${alias.charAt(0).toUpperCase()}${alias.slice(1)}`,
      `${alias}Count`,
    ]),
  ];

  return pickMaxFromSources(keys, [object], fallback);
}

/* =========================================================
   REQUEST BODY
========================================================= */

function hasRequestBody(body) {
  return body !== undefined && body !== null;
}

function isFormDataBody(body) {
  try {
    return typeof FormData !== "undefined" && body instanceof FormData;
  } catch {
    return false;
  }
}

function isBlobBody(body) {
  try {
    return typeof Blob !== "undefined" && body instanceof Blob;
  } catch {
    return false;
  }
}

function buildRequestBody(body) {
  if (!hasRequestBody(body)) {
    return undefined;
  }

  if (typeof body === "string" || isFormDataBody(body) || isBlobBody(body)) {
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

  const adapterOptions = {
    timeout: safeNumber(options.timeout, HOME_TIMEOUT),
    auth: true,
    headers: options.headers,
    params: options.params,
    raw: options.raw,
    responseType: options.responseType || "auto",
  };

  if (verb === "get" && isFn(client.get)) {
    return client.get(path, adapterOptions);
  }

  if (verb === "post" && isFn(client.post)) {
    return client.post(path, options.body, adapterOptions);
  }

  if (verb === "put" && isFn(client.put)) {
    return client.put(path, options.body, adapterOptions);
  }

  if (verb === "patch" && isFn(client.patch)) {
    return client.patch(path, options.body, adapterOptions);
  }

  if (verb === "delete" && isFn(client.delete)) {
    return client.delete(path, adapterOptions);
  }

  if (isFn(client.request)) {
    try {
      return await client.request(path, {
        method: method.toUpperCase(),
        ...adapterOptions,
        body: options.body,
      });
    } catch (error) {
      if (!isAdapterUnavailable(error)) {
        throw error;
      }
    }

    return client.request({
      url: path,
      path,
      method: method.toUpperCase(),
      ...adapterOptions,
      body: options.body,
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

  const adapterOptions = {
    headers: options.headers,
    params: options.params,
    timeout: options.timeout,
    auth: true,
    raw: options.raw,
    responseType: options.responseType || "auto",
  };

  if (verb === "get" && isFn(Http.get)) {
    return Http.get(path, adapterOptions);
  }

  if (verb === "post" && isFn(Http.post)) {
    return Http.post(path, options.body, adapterOptions);
  }

  if (verb === "put" && isFn(Http.put)) {
    return Http.put(path, options.body, adapterOptions);
  }

  if (verb === "patch" && isFn(Http.patch)) {
    return Http.patch(path, options.body, adapterOptions);
  }

  if (verb === "delete" && isFn(Http.delete)) {
    return Http.delete(path, adapterOptions);
  }

  if (isFn(Http.request)) {
    return Http.request(path, {
      method: method.toUpperCase(),
      ...adapterOptions,
      body: options.body,
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

  let controller = null;
  let timeoutId = null;

  try {
    if (typeof AbortController !== "undefined") {
      controller = new AbortController();

      timeoutId = setTimeout(() => {
        try {
          controller.abort();
        } catch {}
      }, timeout);
    }

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
      signal: controller?.signal,
      credentials: options.credentials || "same-origin",
    });

    const contentType = safeText(response.headers?.get?.("content-type"), "");
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
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
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

async function requestOptional(name = "", method = "GET", endpoint = "", options = {}) {
  const startedAt = nowMs();

  try {
    const response = await request(method, endpoint, options);

    const result = {
      ok: true,
      name,
      endpoint,
      status: 200,
      durationMs: nowMs() - startedAt,
      requestId: getRequestIdFromPayload(response),
      data: response,
      error: null,
    };

    pushRecent({
      event: "module:request:success",
      module: name,
      endpoint,
      durationMs: result.durationMs,
      requestId: result.requestId,
    });

    return result;
  } catch (error) {
    const normalizedError = normalizeRequestError(error);

    const result = {
      ok: false,
      name,
      endpoint,
      status: normalizedError.status,
      durationMs: nowMs() - startedAt,
      requestId: getRequestIdFromPayload(error?.response || error?.data),
      data: null,
      error: normalizedError,
      soft: isSoftModuleError(error),
    };

    pushRecent({
      event: "module:request:error",
      module: name,
      endpoint,
      status: normalizedError.status,
      code: normalizedError.code,
      soft: result.soft,
    });

    return result;
  }
}

async function requestFirstOk(name = "", candidates = [], options = {}) {
  let last = null;

  for (const endpoint of safeArray(candidates)) {
    const result = await requestOptional(name, "GET", endpoint, options);

    if (result.ok) {
      return result;
    }

    last = result;
  }

  return last || {
    ok: false,
    name,
    endpoint: "",
    status: 0,
    durationMs: 0,
    requestId: "",
    data: null,
    error: {
      status: 0,
      code: "NO_ENDPOINT_CANDIDATES",
      message: "No hay endpoints candidatos.",
    },
    soft: true,
  };
}

/* =========================================================
   ITEM NORMALIZERS
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
      raw.entityId,
      raw.id,
      raw._id,

      base.ticketId,
      base.incidenciaId,
      base.code,
      base.numero,
      base.ticketCode,
      base.entityId,
      base.id,
      base._id
    ),
    ""
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
      raw.lifecycle?.status,

      base.status,
      base.estado,
      base.state,
      base.lifecycle?.status,
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
      raw.severity,
      raw.urgency,
      raw.sla?.priority,

      base.priority,
      base.prioridad,
      base.severity,
      base.urgency,
      base.sla?.priority,
      "medium"
    ),
    "medium"
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
      raw.preview,

      base.subject,
      base.title,
      base.asunto,
      base.name,
      base.preview
    ),
    "Incidencia sin asunto"
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
    raw.lifecycle?.updatedAt,
    raw.lifecycle?.lastUpdateAt,
    raw.audit?.updatedAt,

    base.updatedAt,
    base.lastUpdateAt,
    base.ultimaNovedad,
    base.modifiedAt,
    base.closedAt,
    base.createdAt,
    base.lifecycle?.updatedAt,
    base.lifecycle?.lastUpdateAt,
    base.audit?.updatedAt
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
    raw.lifecycle?.createdAt,

    base.createdAt,
    base.fechaCreacion,
    base.createdAtES,
    base.date,
    base.fecha,
    base.lifecycle?.createdAt
  );
}

function getTicketAttachmentsCount(item = {}) {
  const raw = safeObject(item);
  const base = safeObject(raw.raw);

  const attachments = first(
    raw.attachments,
    raw.files,
    raw.adjuntos,
    raw.documents,

    base.attachments,
    base.files,
    base.adjuntos,
    base.documents
  );

  if (Array.isArray(attachments)) {
    return attachments.length;
  }

  return safeNumber(
    first(
      raw.attachmentsCount,
      raw.filesCount,
      raw.adjuntosCount,
      raw.documentsCount,

      base.attachmentsCount,
      base.filesCount,
      base.adjuntosCount,
      base.documentsCount,
      0
    ),
    0
  );
}

function normalizeTicketItem(item = {}) {
  const raw = safeObject(item);
  const id = getTicketId(raw);
  const subject = getTicketSubject(raw);
  const status = getTicketStatus(raw);
  const priority = getTicketPriority(raw);

  const clientName = safeText(
    first(
      raw.clientName,
      raw.clienteNombre,
      raw.customerName,
      raw.userName,
      raw.requesterName,
      raw.createdByName,
      raw.ownerName,
      raw.name,

      raw.requesterSnapshot?.name,
      raw.requesterSnapshot?.displayName,

      raw.cliente?.nombreContacto,
      raw.cliente?.nombre,
      raw.cliente?.name,
      raw.cliente?.displayName,

      raw.client?.name,
      raw.customer?.name,
      raw.createdBy?.name,
      raw.user?.name,
      raw.owner?.name,
      raw.receptor?.name
    ),
    ""
  );

  const clientEmail = safeText(
    first(
      raw.clientEmail,
      raw.clienteEmail,
      raw.email,
      raw.emailCliente,

      raw.requesterSnapshot?.email,
      raw.createdBy?.email,

      raw.cliente?.email,
      raw.cliente?.emailLower,

      raw.client?.email,
      raw.customer?.email,
      raw.receptor?.email
    ),
    ""
  );

  const avatar = safeText(
    first(
      raw.clientAvatar,
      raw.avatar,
      raw.avatarUrl,
      raw.avatar_url,
      raw.userAvatar,
      raw.createdByAvatar,
      raw.ownerAvatar,

      raw.requesterSnapshot?.avatar,
      raw.requesterSnapshot?.avatarUrl,

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

      raw.owner?.avatar,
      raw.owner?.avatarUrl
    ),
    ""
  );

  const description = safeText(
    first(
      raw.description,
      raw.descripcion,
      raw.preview,
      raw.message,
      raw.body,
      raw.text
    ),
    "Sin descripción."
  );

  return {
    ...raw,

    id: safeText(first(raw.id, id), id),
    _id: safeText(first(raw._id, raw.id, id), id),

    ticketId: safeText(first(raw.ticketId, id), id),
    incidenciaId: safeText(first(raw.incidenciaId, id), id),
    code: safeText(first(raw.code, raw.ticketCode, id), id),
    ticketCode: safeText(first(raw.ticketCode, raw.code, id), id),

    subject,
    title: safeText(first(raw.title, raw.subject, subject), subject),
    asunto: safeText(first(raw.asunto, raw.subject, raw.title, subject), subject),

    description,
    descripcion: safeText(first(raw.descripcion, raw.description, description), description),
    message: safeText(first(raw.message, raw.description, raw.descripcion, description), description),

    status,
    estado: safeText(first(raw.estado, raw.status, status), status),
    state: safeText(first(raw.state, raw.status, status), status),

    priority,
    prioridad: safeText(first(raw.prioridad, raw.priority, priority), priority),
    severity: safeText(first(raw.severity, raw.priority, priority), priority),

    clientName,
    clienteNombre: safeText(first(raw.clienteNombre, clientName), clientName),
    requesterName: safeText(first(raw.requesterName, clientName), clientName),

    clientEmail,
    clienteEmail: safeText(first(raw.clienteEmail, clientEmail), clientEmail),
    email: safeText(first(raw.email, clientEmail), clientEmail),

    clientAvatar: avatar,
    avatar: safeText(first(raw.avatar, avatar), avatar),
    avatarUrl: safeText(first(raw.avatarUrl, avatar), avatar),

    category: safeText(first(raw.category, raw.categoria, raw.type, raw.tipo), "Soporte"),
    categoria: safeText(first(raw.categoria, raw.category, raw.type, raw.tipo), "Soporte"),
    type: safeText(first(raw.type, raw.tipo, raw.category, raw.categoria), "Soporte"),
    tipo: safeText(first(raw.tipo, raw.type, raw.category, raw.categoria), "Soporte"),

    createdAt: getTicketCreatedAt(raw),
    updatedAt: getTicketUpdatedAt(raw),
    lastUpdateAt: first(raw.lastUpdateAt, raw.updatedAt, getTicketUpdatedAt(raw)),

    attachmentsCount: getTicketAttachmentsCount(raw),
    filesCount: getTicketAttachmentsCount(raw),
    adjuntosCount: getTicketAttachmentsCount(raw),

    raw: hasOwnKeys(raw.raw) ? raw.raw : raw,
  };
}

function getInvoiceId(item = {}) {
  const raw = safeObject(item);
  const base = safeObject(raw.raw);

  return safeText(
    first(
      raw.invoiceId,
      raw.facturaId,
      raw.number,
      raw.numeroFacturaLegal,
      raw.numeroFactura,
      raw.invoiceNumber,
      raw.numero,
      raw.code,
      raw.id,
      raw._id,

      base.invoiceId,
      base.facturaId,
      base.number,
      base.numeroFacturaLegal,
      base.numeroFactura,
      base.invoiceNumber,
      base.numero,
      base.code,
      base.id,
      base._id
    ),
    ""
  );
}

function getInvoiceAmount(item = {}) {
  const raw = safeObject(item);
  const base = safeObject(raw.raw);

  return safeNumber(
    first(
      raw.total,
      raw.amount,
      raw.importe,
      raw.price,
      raw.subtotal,
      raw.base,
      raw.totalFactura,
      raw.importeTotal,
      raw.facturaTotal,
      raw.facturaImporte,
      raw.invoiceAmount,

      base.total,
      base.amount,
      base.importe,
      base.price,
      base.subtotal,
      base.base,
      base.totalFactura,
      base.importeTotal,
      base.facturaTotal,
      base.facturaImporte,
      base.invoiceAmount,
      0
    ),
    0
  );
}

function normalizeInvoiceItem(item = {}) {
  const raw = safeObject(item);
  const id = getInvoiceId(raw);
  const amount = getInvoiceAmount(raw);

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

  const currency = safeText(
    first(
      raw.currency,
      raw.moneda,
      raw.raw?.currency,
      raw.raw?.moneda,
      "EUR"
    ),
    "EUR"
  ).toUpperCase();

  return {
    ...raw,

    id: safeText(first(raw.id, id), id),
    _id: safeText(first(raw._id, raw.id, id), id),

    invoiceId: safeText(first(raw.invoiceId, id), id),
    facturaId: safeText(first(raw.facturaId, id), id),

    numeroFacturaLegal: safeText(
      first(
        raw.numeroFacturaLegal,
        raw.numeroFactura,
        raw.invoiceNumber,
        raw.number,
        raw.numero,
        raw.code,
        id
      ),
      id
    ),

    numeroFactura: safeText(
      first(raw.numeroFactura, raw.numeroFacturaLegal, raw.number, raw.numero, id),
      id
    ),

    invoiceNumber: safeText(
      first(raw.invoiceNumber, raw.numeroFacturaLegal, raw.number, raw.numero, id),
      id
    ),

    numero: safeText(first(raw.numero, raw.number, raw.code, id), id),
    number: safeText(first(raw.number, raw.numero, raw.code, id), id),
    code: safeText(first(raw.code, raw.numero, raw.number, id), id),

    total: amount,
    amount,
    importe: amount,
    price: amount,
    totalFactura: amount,
    facturaTotal: amount,
    facturaImporte: amount,
    invoiceAmount: amount,

    currency,
    moneda: currency,

    paymentStatus: status,
    estadoPago: safeText(first(raw.estadoPago, raw.paymentStatus, status), status),
    status: safeText(first(raw.status, status), status),
    estado: safeText(first(raw.estado, raw.status, status), status),

    createdAt: first(raw.createdAt, raw.fechaCreacion, raw.date, raw.raw?.createdAt),
    updatedAt: first(raw.updatedAt, raw.modifiedAt, raw.date, raw.raw?.updatedAt),

    raw: hasOwnKeys(raw.raw) ? raw.raw : raw,
  };
}

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

  const active = first(
    raw.active,
    raw.isActive,
    raw.enabled,
    raw.raw?.active,
    raw.raw?.isActive,
    raw.raw?.enabled,
    true
  );

  return {
    ...raw,

    id: safeText(first(raw.id, id), id),
    _id: safeText(first(raw._id, raw.id, id), id),
    userId: safeText(first(raw.userId, id), id),
    usuarioId: safeText(first(raw.usuarioId, id), id),

    displayName,
    fullName: safeText(first(raw.fullName, displayName), displayName),
    name: safeText(first(raw.name, displayName), displayName),
    nombre: safeText(first(raw.nombre, displayName), displayName),

    username: safeText(first(raw.username, raw.email, id), id),
    email: safeText(first(raw.email, raw.mail, raw.raw?.email, raw.raw?.mail), ""),

    role: safeText(first(raw.role, raw.rol, raw.type, raw.raw?.role), "user"),
    rol: safeText(first(raw.rol, raw.role, raw.type, raw.raw?.rol), "user"),

    active,
    isActive: active,

    avatar: safeText(first(raw.avatar, raw.avatarUrl, raw.raw?.avatar, raw.raw?.avatarUrl), ""),
    avatarUrl: safeText(first(raw.avatarUrl, raw.avatar, raw.raw?.avatarUrl, raw.raw?.avatar), ""),

    createdAt: first(raw.createdAt, raw.raw?.createdAt),
    updatedAt: first(raw.updatedAt, raw.modifiedAt, raw.raw?.updatedAt),

    raw: hasOwnKeys(raw.raw) ? raw.raw : raw,
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
      raw.nif,
      raw.cif,
      raw.raw?.clientId,
      raw.raw?.clienteId,
      raw.raw?.customerId,
      raw.raw?.id,
      raw.raw?._id,
      raw.raw?.email,
      raw.raw?.nif,
      raw.raw?.cif
    ),
    ""
  );

  const name = safeText(
    first(
      raw.name,
      raw.nombre,
      raw.razonSocial,
      raw.company,
      raw.nombreContacto,
      raw.email,
      raw.raw?.name,
      raw.raw?.nombre,
      raw.raw?.razonSocial,
      raw.raw?.company,
      raw.raw?.nombreContacto,
      raw.raw?.email
    ),
    "Cliente"
  );

  const active = first(
    raw.active,
    raw.isActive,
    raw.enabled,
    raw.raw?.active,
    raw.raw?.isActive,
    raw.raw?.enabled,
    true
  );

  return {
    ...raw,

    id: safeText(first(raw.id, id), id),
    _id: safeText(first(raw._id, raw.id, id), id),

    clientId: safeText(first(raw.clientId, id), id),
    clienteId: safeText(first(raw.clienteId, id), id),
    customerId: safeText(first(raw.customerId, id), id),

    name,
    nombre: safeText(first(raw.nombre, name), name),
    displayName: safeText(first(raw.displayName, name), name),
    razonSocial: safeText(first(raw.razonSocial, name), name),

    email: safeText(first(raw.email, raw.mail, raw.raw?.email, raw.raw?.mail), ""),
    phone: safeText(first(raw.phone, raw.telefono, raw.raw?.phone), ""),
    telefono: safeText(first(raw.telefono, raw.phone, raw.raw?.telefono), ""),

    active,
    isActive: active,

    createdAt: first(raw.createdAt, raw.raw?.createdAt),
    updatedAt: first(raw.updatedAt, raw.modifiedAt, raw.raw?.updatedAt),

    raw: hasOwnKeys(raw.raw) ? raw.raw : raw,
  };
}

/* =========================================================
   STATUS HELPERS
========================================================= */

function getTicketStatusKey(value = "") {
  const key = normalizeKey(value);

  if (["pending", "pendiente", "new", "nueva", "nuevo", "created"].includes(key)) {
    return "pending";
  }

  if (["open", "opened", "abierta", "abierto"].includes(key)) {
    return "open";
  }

  if (
    [
      "progress",
      "in_progress",
      "inprogress",
      "en_proceso",
      "proceso",
      "working",
      "assigned",
      "asignada",
      "asignado",
    ].includes(key)
  ) {
    return "progress";
  }

  if (["resolved", "resuelta", "resuelto", "solved"].includes(key)) {
    return "resolved";
  }

  if (
    [
      "closed",
      "cerrada",
      "cerrado",
      "cancelled",
      "cancelada",
      "cancelado",
      "archived",
      "archivada",
      "archivado",
    ].includes(key)
  ) {
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
    "critico",
    "crítico",
    "high",
    "alta",
    "p1",
    "p0",
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

  if (["paid", "pagada", "pagado", "cobrada", "cobrado"].includes(key)) {
    return "paid";
  }

  if (["pending", "pendiente", "unpaid"].includes(key)) {
    return "pending";
  }

  if (["overdue", "vencida", "vencido"].includes(key)) {
    return "overdue";
  }

  if (["partial", "parcial", "pago_parcial"].includes(key)) {
    return "partial";
  }

  if (["cancelled", "cancelada", "cancelado"].includes(key)) {
    return "cancelled";
  }

  if (["draft", "borrador"].includes(key)) {
    return "draft";
  }

  return "pending";
}

function isInvoicePendingLike(item = {}) {
  return ["pending", "overdue", "partial"].includes(getInvoiceStatusKey(item));
}

/* =========================================================
   MODULE NORMALIZATION
========================================================= */

function normalizeTicketsModule(statsPayload = null, listPayload = null) {
  const stats = extractStatsBlock(statsPayload);
  const collection = extractCollection(listPayload, [
    "tickets",
    "incidencias",
    "items",
    "rows",
    "results",
  ]);

  const tickets = uniqueBy(
    collection.items.map((item) => normalizeTicketItem(item)),
    getTicketId
  );

  const totalFromStats = pickMaxFromSources(
    [
      "total",
      "documentsCounted",
      "count",
      "totalCount",
      "ticketsTotal",
      "incidenciasTotal",
    ],
    [stats],
    0
  );

  const openFromStats = pickMaxFromSources(
    ["active", "open", "pending", "inProgress", "in_progress"],
    [stats],
    0
  );

  const closedFromStats = pickMaxFromSources(
    ["closedGroup", "closed", "resolved", "cancelled", "archived"],
    [stats],
    0
  );

  const urgentFromStats =
    safeNumber(stats.urgent, 0) + safeNumber(stats.high, 0);

  const total = Math.max(tickets.length, collection.total, totalFromStats);

  const openTickets =
    openFromStats ||
    tickets.filter((item) => isTicketOpenLike(item)).length;

  const closedTickets =
    closedFromStats ||
    tickets.filter((item) => isTicketClosedLike(item)).length;

  const urgentTickets =
    urgentFromStats ||
    tickets.filter((item) => isTicketUrgent(item)).length;

  const attachmentsCount =
    safeNumber(stats.withAttachments, 0) ||
    tickets.reduce((sum, item) => sum + getTicketAttachmentsCount(item), 0);

  return {
    items: tickets,
    total,
    visibleCount: tickets.length,

    stats: {
      ...stats,

      total,
      totalTickets: total,
      ticketsTotal: total,
      incidenciasTotal: total,
      totalIncidencias: total,

      openTickets,
      pendingTickets: openTickets,
      openIncidencias: openTickets,
      pendingIncidencias: openTickets,

      closedTickets,
      resolvedTickets: closedTickets,
      closedIncidencias: closedTickets,
      resolvedIncidencias: closedTickets,

      urgentTickets,
      urgentIncidencias: urgentTickets,
      highPriorityTickets: urgentTickets,

      attachmentsCount,
      filesCount: attachmentsCount,
      adjuntosCount: attachmentsCount,
    },
  };
}

function normalizeFacturasModule(statsPayload = null, listPayload = null) {
  const outer = safeObject(unwrapResponseEnvelope(statsPayload), {});
  const stats = safeObject(first(outer.stats, outer.summary, outer), {});

  const collection = extractCollection(listPayload, [
    "facturas",
    "invoices",
    "items",
    "rows",
    "results",
  ]);

  const invoices = uniqueBy(
    collection.items.map((item) => normalizeInvoiceItem(item)),
    getInvoiceId
  );

  const totalFromStats = pickMaxFromSources(
    [
      "countTotal",
      "total",
      "count",
      "totalCount",
      "remoteCount",
      "totalFacturas",
      "facturasTotal",
      "totalInvoices",
      "invoicesTotal",
    ],
    [stats, outer],
    0
  );

  const total = Math.max(invoices.length, collection.total, totalFromStats);

  const pendingInvoices =
    pickMaxFromSources(
      [
        "countPendientes",
        "pendingCount",
        "pendingInvoices",
        "pendingFacturas",
      ],
      [stats],
      0
    ) ||
    invoices.filter((item) => isInvoicePendingLike(item)).length;

  const overdueInvoices = pickMaxFromSources(
    ["countVencidas", "overdueCount", "overdueInvoices", "facturasVencidas"],
    [stats],
    0
  );

  const paidInvoices = pickMaxFromSources(
    ["countPagadas", "paidCount", "paidInvoices", "facturasPagadas"],
    [stats],
    0
  );

  const invoiceAmount =
    pickMaxFromSources(
      [
        "totalFacturado",
        "invoiceAmount",
        "billingTotal",
        "totalBilling",
        "importeFacturas",
        "currentYearTotal",
      ],
      [stats],
      0
    ) ||
    invoices.reduce((sum, item) => sum + getInvoiceAmount(item), 0);

  const pendingAmount = pickMaxFromSources(
    ["totalPendiente", "pendingTotal", "overdueTotal", "totalVencido"],
    [stats],
    0
  );

  return {
    items: invoices,
    total,
    visibleCount: invoices.length,

    stats: {
      ...stats,

      total,
      totalInvoices: total,
      invoicesTotal: total,
      facturasTotal: total,
      totalFacturas: total,

      pendingInvoices,
      pendingFacturas: pendingInvoices,
      facturasPendientes: pendingInvoices,
      invoicesPending: pendingInvoices,

      overdueInvoices,
      facturasVencidas: overdueInvoices,

      paidInvoices,
      facturasPagadas: paidInvoices,

      invoiceAmount,
      billingTotal: invoiceAmount,
      totalBilling: invoiceAmount,
      totalFacturado: invoiceAmount,
      importeFacturas: invoiceAmount,

      pendingAmount,
      totalPendiente: pendingAmount,
    },
  };
}

function normalizeClientesModule(statsPayload = null, listPayload = null) {
  const stats = extractStatsBlock(statsPayload);
  const collection = extractCollection(listPayload, [
    "clientes",
    "clients",
    "customers",
    "items",
    "rows",
    "results",
  ]);

  const clients = uniqueBy(
    collection.items.map((item) => normalizeClientItem(item)),
    (item) => first(item.clienteId, item.clientId, item.customerId, item.id, item.email, "")
  );

  const totalFromStats = pickMaxFromSources(
    [
      "total",
      "count",
      "totalCount",
      "remoteCount",
      "clientsCount",
      "clientesCount",
      "customersCount",
      "totalClients",
      "totalClientes",
      "totalCustomers",
    ],
    [stats],
    0
  );

  const total = Math.max(clients.length, collection.total, totalFromStats);

  return {
    items: clients,
    total,
    visibleCount: clients.length,

    stats: {
      ...stats,

      total,
      clientsCount: total,
      clientesCount: total,
      customersCount: total,
      totalClients: total,
      totalClientes: total,
      totalCustomers: total,
    },
  };
}

function normalizeUsersModule(statsPayload = null, listPayload = null) {
  const stats = extractStatsBlock(statsPayload);
  const collection = extractCollection(listPayload, [
    "users",
    "usuarios",
    "members",
    "accounts",
    "items",
    "rows",
    "results",
  ]);

  const users = uniqueBy(
    collection.items.map((item) => normalizeUserItem(item)),
    (item) => first(item.userId, item.id, item.email, item.username, "")
  );

  const totalFromStats = pickMaxFromSources(
    [
      "total",
      "count",
      "totalCount",
      "remoteCount",
      "usersCount",
      "usuariosCount",
      "totalUsers",
      "totalUsuarios",
    ],
    [stats],
    0
  );

  const total = Math.max(users.length, collection.total, totalFromStats);

  return {
    items: users,
    total,
    visibleCount: users.length,

    stats: {
      ...stats,

      total,
      usersCount: total,
      usuariosCount: total,
      totalUsers: total,
      totalUsuarios: total,
    },
  };
}

/* =========================================================
   ACTIVITY / WIDGETS
========================================================= */

function normalizeActivityItem(item = {}, fallback = {}) {
  const raw = safeObject(item);
  const type = safeText(first(raw.type, raw.kind, fallback.type, "activity"), "activity");

  const title = safeText(
    first(raw.title, raw.name, raw.subject, raw.label, fallback.title),
    "Actividad registrada"
  );

  const entityId = safeText(
    first(
      raw.entityId,
      raw.id,
      raw.ticketId,
      raw.incidenciaId,
      raw.facturaId,
      raw.invoiceId,
      raw.userId,
      raw.clienteId,
      fallback.entityId
    ),
    ""
  );

  return {
    ...raw,

    type,
    kind: safeText(first(raw.kind, type), type),
    category: safeText(first(raw.category, type), type),

    title,
    text: safeText(
      first(raw.text, raw.description, raw.message, raw.detail, raw.preview, fallback.text),
      "Sin detalle adicional."
    ),

    date: first(raw.date, raw.createdAt, raw.updatedAt, raw.timestamp, fallback.date, nowIso()),

    route: safeText(first(raw.route, raw.href, raw.link, raw.to, fallback.route), ""),
    href: safeText(first(raw.href, raw.route, raw.link, raw.to, fallback.href), ""),

    action: safeText(first(raw.action, fallback.action, "open-activity"), "open-activity"),

    entityId,
    id: safeText(first(raw.id, entityId), entityId),

    raw: hasOwnKeys(raw.raw) ? raw.raw : raw,
  };
}

function buildActivityFromCollections({
  tickets = [],
  invoices = [],
  clients = [],
  users = [],
} = {}) {
  const activity = [];

  for (const ticket of safeArray(tickets)) {
    const id = getTicketId(ticket);

    activity.push(
      normalizeActivityItem(ticket, {
        type: "ticket",
        title: getTicketSubject(ticket),
        text: safeText(first(ticket.description, ticket.descripcion), "Incidencia actualizada."),
        entityId: id,
        route: id ? `/incidencias/${encodeURIComponent(id)}` : "/incidencias",
        action: "open-ticket",
        date: first(ticket.updatedAt, ticket.createdAt),
      })
    );
  }

  for (const invoice of safeArray(invoices)) {
    const id = getInvoiceId(invoice);

    activity.push(
      normalizeActivityItem(invoice, {
        type: "invoice",
        title: safeText(first(invoice.numeroFacturaLegal, invoice.numeroFactura, id), "Factura"),
        text: "Factura registrada o actualizada.",
        entityId: id,
        route: id ? `/facturas/${encodeURIComponent(id)}` : "/facturas",
        action: "open-invoice",
        date: first(invoice.updatedAt, invoice.createdAt),
      })
    );
  }

  for (const client of safeArray(clients)) {
    const id = safeText(first(client.clienteId, client.clientId, client.id), "");

    activity.push(
      normalizeActivityItem(client, {
        type: "client",
        title: safeText(first(client.name, client.nombre, client.email), "Cliente"),
        text: "Cliente disponible en el panel.",
        entityId: id,
        route: id ? `/clientes/${encodeURIComponent(id)}` : "/clientes",
        action: "open-client",
        date: first(client.updatedAt, client.createdAt),
      })
    );
  }

  for (const user of safeArray(users)) {
    const id = safeText(first(user.userId, user.id), "");

    activity.push(
      normalizeActivityItem(user, {
        type: "user",
        title: safeText(first(user.displayName, user.name, user.username, user.email), "Usuario"),
        text: "Usuario disponible en el panel.",
        entityId: id,
        route: id ? `/usuarios/${encodeURIComponent(id)}` : "/usuarios",
        action: "open-user",
        date: first(user.updatedAt, user.createdAt),
      })
    );
  }

  return activity
    .sort((a, b) => {
      const aTs = new Date(first(a.date, a.updatedAt, a.createdAt, 0)).getTime();
      const bTs = new Date(first(b.date, b.updatedAt, b.createdAt, 0)).getTime();

      return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
    })
    .slice(0, DEFAULT_RECENT_LIMIT);
}

function normalizeWidget(item = {}) {
  const raw = safeObject(item);

  const id = safeText(
    first(raw.widgetId, raw.widgetKey, raw.id, raw.key, raw.slug, raw.code),
    ""
  );

  const title = safeText(first(raw.title, raw.name, raw.label, raw.heading), "Bloque");

  return {
    ...raw,

    widgetId: id,
    widgetKey: safeText(first(raw.widgetKey, raw.key, id), id),
    id: safeText(first(raw.id, id), id),
    key: safeText(first(raw.key, id), id),

    title,

    description: safeText(
      first(raw.description, raw.descripcion, raw.subtitle, raw.summary, raw.text),
      ""
    ),

    subtitle: safeText(first(raw.subtitle, raw.description, raw.text), ""),
    text: safeText(first(raw.text, raw.description, raw.subtitle), ""),

    type: safeText(first(raw.type, raw.kind, raw.variant, raw.category), "widget"),
    kind: safeText(first(raw.kind, raw.type, raw.variant, raw.category), "widget"),
    variant: safeText(first(raw.variant, raw.type, raw.kind, raw.category), "widget"),

    value: first(raw.value, raw.total, raw.amount, raw.count, raw.metric, "—"),

    trend: first(raw.trend, raw.delta, raw.change, raw.variation, ""),
    status: safeText(first(raw.status, raw.estado, raw.state), "active"),

    route: safeText(first(raw.route, raw.href, raw.link, raw.to), ""),
    href: safeText(first(raw.href, raw.route, raw.link, raw.to), ""),

    updatedAt: first(raw.updatedAt, raw.lastUpdate, raw.modifiedAt, raw.createdAt, nowIso()),

    raw: hasOwnKeys(raw.raw) ? raw.raw : raw,
  };
}

function buildHomeWidgets(summary = {}) {
  const data = safeObject(summary);

  return [
    normalizeWidget({
      id: "incidencias",
      widgetId: "incidencias",
      key: "incidencias",
      title: "Incidencias",
      description: "Tickets visibles en el panel.",
      value: safeNumber(data.totalTickets, 0),
      subtitle: `${safeNumber(data.openTickets, 0)} abiertas · ${safeNumber(data.urgentTickets, 0)} urgentes`,
      type: "tickets",
      kind: "metric",
      status: safeNumber(data.urgentTickets, 0) > 0 ? "warning" : "active",
      route: "/incidencias",
      href: "/incidencias",
    }),

    normalizeWidget({
      id: "facturacion",
      widgetId: "facturacion",
      key: "facturacion",
      title: "Facturación",
      description: "Facturas visibles y volumen agregado.",
      value: safeNumber(data.invoiceAmount, 0),
      subtitle: `${safeNumber(data.totalInvoices, 0)} facturas · ${safeNumber(data.pendingInvoices, 0)} pendientes`,
      type: "invoices",
      kind: "metric",
      status: safeNumber(data.pendingInvoices, 0) > 0 ? "warning" : "active",
      route: "/facturas",
      href: "/facturas",
    }),

    normalizeWidget({
      id: "clientes",
      widgetId: "clientes",
      key: "clientes",
      title: "Clientes",
      description: "Clientes registrados o visibles.",
      value: safeNumber(data.clientsCount, 0),
      subtitle: `${safeNumber(data.visibleClients, data.visibleClientsCount || 0)} visibles`,
      type: "clients",
      kind: "metric",
      status: "active",
      route: "/clientes",
      href: "/clientes",
    }),

    normalizeWidget({
      id: "usuarios",
      widgetId: "usuarios",
      key: "usuarios",
      title: "Usuarios",
      description: "Usuarios del sistema.",
      value: safeNumber(data.usersCount, 0),
      subtitle:
        getCurrentRole() === "admin"
          ? `${safeNumber(data.visibleUsers, data.visibleUsersCount || 0)} visibles`
          : "Disponible para administradores",
      type: "users",
      kind: "metric",
      status: getCurrentRole() === "admin" ? "active" : "restricted",
      route: "/usuarios",
      href: "/usuarios",
    }),
  ];
}

/* =========================================================
   SUMMARY / DASHBOARD BUILDERS
========================================================= */

function buildSummaryFromModules({
  ticketsModule = {},
  facturasModule = {},
  clientesModule = {},
  usersModule = {},
} = {}) {
  const ticketStats = safeObject(ticketsModule.stats);
  const facturaStats = safeObject(facturasModule.stats);
  const clienteStats = safeObject(clientesModule.stats);
  const userStats = safeObject(usersModule.stats);

  const totalTickets = Math.max(
    safeNumber(ticketStats.totalTickets, 0),
    safeNumber(ticketStats.ticketsTotal, 0),
    safeNumber(ticketStats.incidenciasTotal, 0),
    safeNumber(ticketsModule.total, 0)
  );

  const openTickets = Math.max(
    safeNumber(ticketStats.openTickets, 0),
    safeNumber(ticketStats.pendingTickets, 0),
    safeNumber(ticketStats.active, 0)
  );

  const closedTickets = Math.max(
    safeNumber(ticketStats.closedTickets, 0),
    safeNumber(ticketStats.resolvedTickets, 0),
    safeNumber(ticketStats.closedGroup, 0)
  );

  const urgentTickets = Math.max(
    safeNumber(ticketStats.urgentTickets, 0),
    safeNumber(ticketStats.highPriorityTickets, 0)
  );

  const totalInvoices = Math.max(
    safeNumber(facturaStats.totalInvoices, 0),
    safeNumber(facturaStats.facturasTotal, 0),
    safeNumber(facturasModule.total, 0)
  );

  const pendingInvoices = Math.max(
    safeNumber(facturaStats.pendingInvoices, 0),
    safeNumber(facturaStats.pendingFacturas, 0),
    safeNumber(facturaStats.countPendientes, 0)
  );

  const invoiceAmount = Math.max(
    safeNumber(facturaStats.invoiceAmount, 0),
    safeNumber(facturaStats.billingTotal, 0),
    safeNumber(facturaStats.totalFacturado, 0)
  );

  const usersCount = Math.max(
    safeNumber(userStats.usersCount, 0),
    safeNumber(userStats.usuariosCount, 0),
    safeNumber(usersModule.total, 0)
  );

  const clientsCount = Math.max(
    safeNumber(clienteStats.clientsCount, 0),
    safeNumber(clienteStats.clientesCount, 0),
    safeNumber(clienteStats.customersCount, 0),
    safeNumber(clientesModule.total, 0)
  );

  const attachmentsCount = safeNumber(ticketStats.attachmentsCount, 0);

  return {
    totalTickets,
    ticketsTotal: totalTickets,
    incidenciasTotal: totalTickets,
    totalIncidencias: totalTickets,
    ticketsCount: totalTickets,
    incidenciasCount: totalTickets,

    openTickets,
    pendingTickets: openTickets,
    openIncidencias: openTickets,
    pendingIncidencias: openTickets,
    incidenciasAbiertas: openTickets,

    closedTickets,
    resolvedTickets: closedTickets,
    closedIncidencias: closedTickets,
    resolvedIncidencias: closedTickets,
    incidenciasCerradas: closedTickets,

    urgentTickets,
    urgentIncidencias: urgentTickets,
    highPriorityTickets: urgentTickets,

    totalInvoices,
    invoicesTotal: totalInvoices,
    facturasTotal: totalInvoices,
    totalFacturas: totalInvoices,
    invoicesCount: totalInvoices,
    facturasCount: totalInvoices,

    pendingInvoices,
    pendingFacturas: pendingInvoices,
    facturasPendientes: pendingInvoices,
    invoicesPending: pendingInvoices,

    invoiceAmount,
    billingTotal: invoiceAmount,
    totalBilling: invoiceAmount,
    totalFacturado: invoiceAmount,
    importeFacturas: invoiceAmount,
    facturacionVisible: invoiceAmount,

    usersCount,
    usuariosCount: usersCount,
    totalUsers: usersCount,
    totalUsuarios: usersCount,

    clientsCount,
    clientesCount: clientsCount,
    customersCount: clientsCount,
    totalClients: clientsCount,
    totalClientes: clientsCount,
    totalCustomers: clientsCount,

    visibleTickets: safeNumber(ticketsModule.visibleCount, 0),
    visibleTicketsCount: safeNumber(ticketsModule.visibleCount, 0),
    visibleIncidenciasCount: safeNumber(ticketsModule.visibleCount, 0),

    visibleInvoices: safeNumber(facturasModule.visibleCount, 0),
    visibleInvoicesCount: safeNumber(facturasModule.visibleCount, 0),
    visibleFacturasCount: safeNumber(facturasModule.visibleCount, 0),

    visibleUsers: safeNumber(usersModule.visibleCount, 0),
    visibleUsersCount: safeNumber(usersModule.visibleCount, 0),
    visibleUsuariosCount: safeNumber(usersModule.visibleCount, 0),

    visibleClients: safeNumber(clientesModule.visibleCount, 0),
    visibleClientsCount: safeNumber(clientesModule.visibleCount, 0),
    visibleClientesCount: safeNumber(clientesModule.visibleCount, 0),
    visibleCustomersCount: safeNumber(clientesModule.visibleCount, 0),

    attachmentsCount,
    filesCount: attachmentsCount,
    adjuntosCount: attachmentsCount,

    updatedAt: nowIso(),
  };
}

function buildDashboardFromModules(modules = {}, meta = {}) {
  const ticketsModule = normalizeTicketsModule(
    modules?.tickets?.stats?.data,
    modules?.tickets?.list?.data
  );

  const facturasModule = normalizeFacturasModule(
    modules?.facturas?.stats?.data,
    modules?.facturas?.list?.data
  );

  const clientesModule = normalizeClientesModule(
    modules?.clientes?.stats?.data,
    modules?.clientes?.list?.data
  );

  const usersModule = normalizeUsersModule(
    modules?.users?.stats?.data,
    modules?.users?.list?.data
  );

  const summary = buildSummaryFromModules({
    ticketsModule,
    facturasModule,
    clientesModule,
    usersModule,
  });

  const widgets = buildHomeWidgets(summary);

  const activity = buildActivityFromCollections({
    tickets: ticketsModule.items,
    invoices: facturasModule.items,
    clients: clientesModule.items,
    users: usersModule.items,
  });

  const requestId = safeText(
    first(
      meta.requestId,
      modules?.tickets?.stats?.requestId,
      modules?.facturas?.stats?.requestId,
      modules?.clientes?.stats?.requestId,
      modules?.users?.stats?.requestId,
      ""
    ),
    ""
  );

  const errors = Object.entries(safeObject(modules))
    .flatMap(([name, block]) => {
      const output = [];

      if (block?.stats?.ok === false) {
        output.push({
          module: name,
          kind: "stats",
          ...safeObject(block.stats.error),
        });
      }

      if (block?.list?.ok === false) {
        output.push({
          module: name,
          kind: "list",
          ...safeObject(block.list.error),
        });
      }

      return output;
    });

  const updatedAt = nowIso();

  return {
    ok: true,
    success: true,

    source: "home-modular-aggregate",
    version: HOME_API_VERSION,

    summary,
    stats: summary,
    metrics: summary,
    totals: summary,
    counts: summary,

    widgets,
    cards: widgets,
    kpis: widgets,
    blocks: widgets,

    tickets: ticketsModule.items,
    incidencias: ticketsModule.items,
    ticketsTotal: summary.totalTickets,
    incidenciasTotal: summary.totalTickets,
    totalTickets: summary.totalTickets,
    totalIncidencias: summary.totalTickets,
    ticketsCount: summary.totalTickets,
    incidenciasCount: summary.totalTickets,
    openTickets: summary.openTickets,
    pendingTickets: summary.pendingTickets,
    urgentTickets: summary.urgentTickets,
    closedTickets: summary.closedTickets,
    resolvedTickets: summary.resolvedTickets,
    visibleTicketsCount: summary.visibleTicketsCount,
    visibleIncidenciasCount: summary.visibleIncidenciasCount,

    invoices: facturasModule.items,
    facturas: facturasModule.items,
    invoicesTotal: summary.totalInvoices,
    facturasTotal: summary.totalInvoices,
    totalInvoices: summary.totalInvoices,
    totalFacturas: summary.totalInvoices,
    invoicesCount: summary.totalInvoices,
    facturasCount: summary.totalInvoices,
    pendingInvoices: summary.pendingInvoices,
    pendingFacturas: summary.pendingFacturas,
    invoiceAmount: summary.invoiceAmount,
    billingTotal: summary.billingTotal,
    totalBilling: summary.totalBilling,
    totalFacturado: summary.totalFacturado,
    importeFacturas: summary.importeFacturas,
    visibleInvoicesCount: summary.visibleInvoicesCount,
    visibleFacturasCount: summary.visibleFacturasCount,

    users: usersModule.items,
    usuarios: usersModule.items,
    usersTotal: summary.usersCount,
    usuariosTotal: summary.usuariosCount,
    totalUsers: summary.usersCount,
    totalUsuarios: summary.usuariosCount,
    usersCount: summary.usersCount,
    usuariosCount: summary.usuariosCount,
    visibleUsersCount: summary.visibleUsersCount,
    visibleUsuariosCount: summary.visibleUsuariosCount,

    clients: clientesModule.items,
    clientes: clientesModule.items,
    customers: clientesModule.items,
    clientsTotal: summary.clientsCount,
    clientesTotal: summary.clientesCount,
    customersTotal: summary.customersCount,
    totalClients: summary.clientsCount,
    totalClientes: summary.clientesCount,
    totalCustomers: summary.customersCount,
    clientsCount: summary.clientsCount,
    clientesCount: summary.clientesCount,
    customersCount: summary.customersCount,
    visibleClientsCount: summary.visibleClientsCount,
    visibleClientesCount: summary.visibleClientesCount,
    visibleCustomersCount: summary.visibleCustomersCount,

    activity,
    activities: activity,
    recent: activity,
    recentActivity: activity,
    activityCount: activity.length,
    recentCount: activity.length,
    visibleActivityCount: activity.length,

    modules: {
      tickets: {
        statsOk: modules?.tickets?.stats?.ok === true,
        listOk: modules?.tickets?.list?.ok === true,
      },
      facturas: {
        statsOk: modules?.facturas?.stats?.ok === true,
        listOk: modules?.facturas?.list?.ok === true,
      },
      clientes: {
        statsOk: modules?.clientes?.stats?.ok === true,
        listOk: modules?.clientes?.list?.ok === true,
      },
      users: {
        skipped: modules?.users?.skipped === true,
        statsOk: modules?.users?.stats?.ok === true,
        listOk: modules?.users?.list?.ok === true,
      },
    },

    errors,
    partial: errors.length > 0,

    updatedAt,
    generatedAt: updatedAt,

    meta: {
      requestId,
      updatedAt,
      generatedAt: updatedAt,

      role: getCurrentRole() || "unknown",
      usersModuleRequested: modules?.users?.skipped !== true,

      widgetsCount: widgets.length,

      ticketsCount: summary.totalTickets,
      incidenciasCount: summary.totalTickets,
      totalTickets: summary.totalTickets,
      totalIncidencias: summary.totalTickets,
      openTickets: summary.openTickets,
      pendingTickets: summary.pendingTickets,
      urgentTickets: summary.urgentTickets,
      closedTickets: summary.closedTickets,
      visibleTicketsCount: summary.visibleTicketsCount,
      visibleIncidenciasCount: summary.visibleIncidenciasCount,

      invoicesCount: summary.totalInvoices,
      facturasCount: summary.totalInvoices,
      totalInvoices: summary.totalInvoices,
      totalFacturas: summary.totalInvoices,
      pendingInvoices: summary.pendingInvoices,
      pendingFacturas: summary.pendingFacturas,
      invoiceAmount: summary.invoiceAmount,
      billingTotal: summary.billingTotal,
      visibleInvoicesCount: summary.visibleInvoicesCount,
      visibleFacturasCount: summary.visibleFacturasCount,

      usersCount: summary.usersCount,
      usuariosCount: summary.usuariosCount,
      totalUsers: summary.usersCount,
      totalUsuarios: summary.usuariosCount,
      visibleUsersCount: summary.visibleUsersCount,
      visibleUsuariosCount: summary.visibleUsuariosCount,

      clientsCount: summary.clientsCount,
      clientesCount: summary.clientesCount,
      customersCount: summary.customersCount,
      totalClients: summary.clientsCount,
      totalClientes: summary.clientesCount,
      totalCustomers: summary.customersCount,
      visibleClientsCount: summary.visibleClientsCount,
      visibleClientesCount: summary.visibleClientesCount,

      activityCount: activity.length,
      recentCount: activity.length,

      errorsCount: errors.length,
      partial: errors.length > 0,
    },

    raw: {
      modules,
      meta,
    },
  };
}

/* =========================================================
   DASHBOARD NORMALIZATION
========================================================= */

export function normalizeDashboard(payload = null) {
  const unwrapped = unwrapResponseEnvelope(payload);
  const object = safeObject(unwrapped, {});

  if (object?.modules) {
    return buildDashboardFromModules(object.modules, object.meta || object);
  }

  if (object?.dashboard?.modules) {
    return buildDashboardFromModules(object.dashboard.modules, object.dashboard.meta || object);
  }

  if (
    object?.dashboard &&
    hasOwnKeys(object.dashboard) &&
    object.dashboard.source === "home-modular-aggregate"
  ) {
    return {
      ...object.dashboard,
      raw: payload,
    };
  }

  /*
    Compatibilidad defensiva con payloads antiguos ya normalizados.
  */
  const ticketsBlock = extractCollection(object, [
    "tickets",
    "incidencias",
    "recentTickets",
    "recentIncidencias",
    "items",
  ]);

  const facturasBlock = extractCollection(object, [
    "facturas",
    "invoices",
    "recentFacturas",
    "recentInvoices",
  ]);

  const clientesBlock = extractCollection(object, [
    "clientes",
    "clients",
    "customers",
  ]);

  const usersBlock = extractCollection(object, [
    "users",
    "usuarios",
  ]);

  const ticketsModule = {
    stats: extractStatsBlock(object),
    items: uniqueBy(ticketsBlock.items.map((item) => normalizeTicketItem(item)), getTicketId),
    total: Math.max(ticketsBlock.items.length, ticketsBlock.total),
    visibleCount: ticketsBlock.items.length,
  };

  const facturasModule = {
    stats: extractStatsBlock(object),
    items: uniqueBy(facturasBlock.items.map((item) => normalizeInvoiceItem(item)), getInvoiceId),
    total: Math.max(facturasBlock.items.length, facturasBlock.total),
    visibleCount: facturasBlock.items.length,
  };

  const clientesModule = {
    stats: extractStatsBlock(object),
    items: uniqueBy(
      clientesBlock.items.map((item) => normalizeClientItem(item)),
      (item) => first(item.clienteId, item.clientId, item.customerId, item.id, item.email, "")
    ),
    total: Math.max(clientesBlock.items.length, clientesBlock.total),
    visibleCount: clientesBlock.items.length,
  };

  const usersModule = {
    stats: extractStatsBlock(object),
    items: uniqueBy(
      usersBlock.items.map((item) => normalizeUserItem(item)),
      (item) => first(item.userId, item.id, item.email, item.username, "")
    ),
    total: Math.max(usersBlock.items.length, usersBlock.total),
    visibleCount: usersBlock.items.length,
  };

  const summary = buildSummaryFromModules({
    ticketsModule,
    facturasModule,
    clientesModule,
    usersModule,
  });

  const widgets = safeArray(
    first(object.widgets, object.cards, object.kpis, object.blocks, [])
  ).map((item) => normalizeWidget(item));

  const finalWidgets = widgets.length ? widgets : buildHomeWidgets(summary);

  const activity = safeArray(
    first(object.activity, object.activities, object.recent, object.recentActivity, [])
  ).map((item) => normalizeActivityItem(item));

  const finalActivity = activity.length
    ? activity
    : buildActivityFromCollections({
        tickets: ticketsModule.items,
        invoices: facturasModule.items,
        clients: clientesModule.items,
        users: usersModule.items,
      });

  const updatedAt = first(object.updatedAt, object.generatedAt, summary.updatedAt, nowIso());

  return {
    ...object,

    ok: extractOk(payload, true),
    success: extractOk(payload, true),

    source: safeText(first(object.source, "home-normalized"), "home-normalized"),
    version: HOME_API_VERSION,

    summary,
    stats: summary,
    metrics: summary,
    totals: summary,
    counts: summary,

    widgets: finalWidgets,
    cards: finalWidgets,
    kpis: finalWidgets,
    blocks: finalWidgets,

    tickets: ticketsModule.items,
    incidencias: ticketsModule.items,
    ticketsTotal: summary.totalTickets,
    incidenciasTotal: summary.totalTickets,
    totalTickets: summary.totalTickets,
    totalIncidencias: summary.totalTickets,
    ticketsCount: summary.totalTickets,
    incidenciasCount: summary.totalTickets,
    openTickets: summary.openTickets,
    pendingTickets: summary.pendingTickets,
    urgentTickets: summary.urgentTickets,
    closedTickets: summary.closedTickets,
    resolvedTickets: summary.resolvedTickets,
    visibleTicketsCount: summary.visibleTicketsCount,
    visibleIncidenciasCount: summary.visibleIncidenciasCount,

    invoices: facturasModule.items,
    facturas: facturasModule.items,
    invoicesTotal: summary.totalInvoices,
    facturasTotal: summary.totalInvoices,
    totalInvoices: summary.totalInvoices,
    totalFacturas: summary.totalInvoices,
    invoicesCount: summary.totalInvoices,
    facturasCount: summary.totalInvoices,
    pendingInvoices: summary.pendingInvoices,
    pendingFacturas: summary.pendingFacturas,
    invoiceAmount: summary.invoiceAmount,
    billingTotal: summary.billingTotal,
    totalBilling: summary.totalBilling,
    totalFacturado: summary.totalFacturado,
    importeFacturas: summary.importeFacturas,
    visibleInvoicesCount: summary.visibleInvoicesCount,
    visibleFacturasCount: summary.visibleFacturasCount,

    users: usersModule.items,
    usuarios: usersModule.items,
    usersTotal: summary.usersCount,
    usuariosTotal: summary.usuariosCount,
    totalUsers: summary.usersCount,
    totalUsuarios: summary.usuariosCount,
    usersCount: summary.usersCount,
    usuariosCount: summary.usuariosCount,
    visibleUsersCount: summary.visibleUsersCount,
    visibleUsuariosCount: summary.visibleUsuariosCount,

    clients: clientesModule.items,
    clientes: clientesModule.items,
    customers: clientesModule.items,
    clientsTotal: summary.clientsCount,
    clientesTotal: summary.clientesCount,
    customersTotal: summary.customersCount,
    totalClients: summary.clientsCount,
    totalClientes: summary.clientesCount,
    totalCustomers: summary.customersCount,
    clientsCount: summary.clientsCount,
    clientesCount: summary.clientesCount,
    customersCount: summary.customersCount,
    visibleClientsCount: summary.visibleClientsCount,
    visibleClientesCount: summary.visibleClientesCount,
    visibleCustomersCount: summary.visibleCustomersCount,

    activity: finalActivity,
    activities: finalActivity,
    recent: finalActivity,
    recentActivity: finalActivity,
    activityCount: finalActivity.length,
    recentCount: finalActivity.length,
    visibleActivityCount: finalActivity.length,

    updatedAt,
    generatedAt: first(object.generatedAt, updatedAt),

    meta: {
      ...extractMeta(payload),

      requestId: getRequestIdFromPayload(payload),

      updatedAt,
      generatedAt: first(object.generatedAt, updatedAt),

      widgetsCount: finalWidgets.length,

      ticketsCount: summary.totalTickets,
      incidenciasCount: summary.totalTickets,
      totalTickets: summary.totalTickets,
      totalIncidencias: summary.totalTickets,
      visibleTicketsCount: summary.visibleTicketsCount,
      visibleIncidenciasCount: summary.visibleIncidenciasCount,

      invoicesCount: summary.totalInvoices,
      facturasCount: summary.totalInvoices,
      totalInvoices: summary.totalInvoices,
      totalFacturas: summary.totalInvoices,
      visibleInvoicesCount: summary.visibleInvoicesCount,
      visibleFacturasCount: summary.visibleFacturasCount,

      usersCount: summary.usersCount,
      usuariosCount: summary.usuariosCount,
      totalUsers: summary.usersCount,
      totalUsuarios: summary.usuariosCount,
      visibleUsersCount: summary.visibleUsersCount,
      visibleUsuariosCount: summary.visibleUsuariosCount,

      clientsCount: summary.clientsCount,
      clientesCount: summary.clientesCount,
      customersCount: summary.customersCount,
      totalClients: summary.clientsCount,
      totalClientes: summary.clientesCount,
      totalCustomers: summary.customersCount,
      visibleClientsCount: summary.visibleClientsCount,
      visibleClientesCount: summary.visibleClientesCount,

      activityCount: finalActivity.length,
      recentCount: finalActivity.length,
    },

    raw: payload,
  };
}

export function normalizeHomeDashboardResponse(payload = null) {
  const dashboard = normalizeDashboard(payload);
  const requestId = getRequestIdFromPayload(payload) || safeText(dashboard?.meta?.requestId, "");

  return {
    ok: extractOk(payload, true),

    dashboard,

    summary: dashboard.summary,
    stats: dashboard.summary,
    metrics: dashboard.summary,
    totals: dashboard.summary,
    counts: dashboard.summary,

    widgets: dashboard.widgets,
    cards: dashboard.widgets,
    kpis: dashboard.widgets,

    recent: dashboard.recent,
    recentActivity: dashboard.recentActivity,
    activity: dashboard.activity,
    activities: dashboard.activity,

    tickets: dashboard.tickets,
    incidencias: dashboard.incidencias,

    invoices: dashboard.invoices,
    facturas: dashboard.facturas,

    users: dashboard.users,
    usuarios: dashboard.usuarios,

    clients: dashboard.clients,
    clientes: dashboard.clientes,
    customers: dashboard.customers,

    ticketsCount: dashboard.ticketsCount,
    incidenciasCount: dashboard.incidenciasCount,

    invoicesCount: dashboard.invoicesCount,
    facturasCount: dashboard.facturasCount,

    usersCount: dashboard.usersCount,
    usuariosCount: dashboard.usuariosCount,

    clientsCount: dashboard.clientsCount,
    clientesCount: dashboard.clientesCount,
    customersCount: dashboard.customersCount,

    visibleTicketsCount: dashboard.visibleTicketsCount,
    visibleIncidenciasCount: dashboard.visibleIncidenciasCount,

    visibleInvoicesCount: dashboard.visibleInvoicesCount,
    visibleFacturasCount: dashboard.visibleFacturasCount,

    visibleUsersCount: dashboard.visibleUsersCount,
    visibleUsuariosCount: dashboard.visibleUsuariosCount,

    visibleClientsCount: dashboard.visibleClientsCount,
    visibleClientesCount: dashboard.visibleClientesCount,

    requestId,

    lastSyncAt: first(
      dashboard.updatedAt,
      dashboard.generatedAt,
      nowIso()
    ),

    raw: payload,
    meta: dashboard.meta,
  };
}

/* =========================================================
   WIDGET RESOLUTION
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

function findWidgetInCollection(items = [], widgetId = "") {
  const target = safeText(widgetId, "");

  if (!target) {
    return null;
  }

  const targetLower = target.toLowerCase();
  const targetKey = normalizeKey(target);

  return (
    safeArray(items).find((item) => {
      const currentId = getWidgetId(item);
      const currentTitle = getWidgetTitle(item);

      const currentKey = safeText(
        first(
          item.key,
          item.slug,
          item.code
        ),
        ""
      );

      return (
        currentId === target ||
        currentId.toLowerCase() === targetLower ||
        currentKey === target ||
        currentKey.toLowerCase() === targetLower ||
        normalizeKey(currentTitle) === targetKey
      );
    }) || null
  );
}

export function resolveHomeWidgetFromDashboard(widgetId = "", dashboard = {}) {
  const normalized = normalizeDashboard(dashboard);

  return findWidgetInCollection(
    normalized.widgets,
    widgetId
  );
}

/* =========================================================
   CACHE
========================================================= */

function readApiCache() {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(HOME_API_CACHE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    const savedAt = safeNumber(parsed?.savedAt, 0);

    if (!savedAt || nowMs() - savedAt > HOME_API_CACHE_TTL_MS) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeApiCache(payload = {}) {
  if (!isBrowser()) {
    return false;
  }

  try {
    window.localStorage.setItem(
      HOME_API_CACHE_KEY,
      JSON.stringify({
        savedAt: nowMs(),
        cacheVersion: 11,
        ...safeObject(payload),
      })
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   RAW REQUESTS
========================================================= */

export async function fetchHomeDashboardRequest({
  includeRecent = true,
  includeUsers = undefined,
  params = null,
  timeout = HOME_TIMEOUT,
} = {}) {
  const startedAt = nowMs();
  const requestId = `home_${startedAt}_${Math.random().toString(16).slice(2)}`;
  const shouldRequestUsers = canRequestUsersModule({ includeUsers });

  const listParams = mergeParams(DEFAULT_LIST_PARAMS, params);

  runtime.lastEndpoint = HOME_DASHBOARD_ENDPOINT;
  runtime.lastRequestAt = nowIso();

  pushRecent({
    event: "dashboard:aggregate:start",
    includeRecent,
    includeUsers: shouldRequestUsers,
    role: getCurrentRole() || "unknown",
  });

  const [
    ticketsStats,
    facturasStats,
    clientesStats,
    usersStats,
  ] = await Promise.all([
    requestOptional("tickets.stats", "GET", ENDPOINTS.ticketsStats, {
      timeout,
    }),

    requestOptional("facturas.stats", "GET", ENDPOINTS.facturasStats, {
      timeout,
    }),

    requestOptional("clientes.stats", "GET", ENDPOINTS.clientesStats, {
      timeout,
    }),

    shouldRequestUsers
      ? requestOptional("users.stats", "GET", ENDPOINTS.usersStats, {
          timeout,
        })
      : Promise.resolve({
          ok: false,
          skipped: true,
          name: "users.stats",
          endpoint: ENDPOINTS.usersStats,
          status: 0,
          durationMs: 0,
          requestId: "",
          data: null,
          error: {
            status: 0,
            code: "USERS_MODULE_SKIPPED",
            message: "Módulo users omitido para roles no admin.",
          },
          soft: true,
        }),
  ]);

  const [
    ticketsList,
    facturasList,
    clientesList,
    usersList,
  ] = includeRecent
    ? await Promise.all([
        requestOptional("tickets.list", "GET", ENDPOINTS.ticketsList, {
          timeout,
          params: listParams,
        }),

        requestOptional("facturas.list", "GET", ENDPOINTS.facturasList, {
          timeout,
          params: listParams,
        }),

        requestOptional("clientes.list", "GET", ENDPOINTS.clientesList, {
          timeout,
          params: listParams,
        }),

        shouldRequestUsers
          ? requestOptional("users.list", "GET", ENDPOINTS.usersList, {
              timeout,
              params: listParams,
            })
          : Promise.resolve({
              ok: false,
              skipped: true,
              name: "users.list",
              endpoint: ENDPOINTS.usersList,
              status: 0,
              durationMs: 0,
              requestId: "",
              data: null,
              error: {
                status: 0,
                code: "USERS_MODULE_SKIPPED",
                message: "Módulo users omitido para roles no admin.",
              },
              soft: true,
            }),
      ])
    : [
        null,
        null,
        null,
        null,
      ];

  const modules = {
    tickets: {
      stats: ticketsStats,
      list: ticketsList,
    },

    facturas: {
      stats: facturasStats,
      list: facturasList,
    },

    clientes: {
      stats: clientesStats,
      list: clientesList,
    },

    users: {
      skipped: !shouldRequestUsers,
      stats: usersStats,
      list: usersList,
    },
  };

  const dashboard = buildDashboardFromModules(modules, {
    requestId,
  });

  runtime.lastResponseAt = nowIso();
  runtime.modules = sanitizePayload({
    tickets: dashboard.modules.tickets,
    facturas: dashboard.modules.facturas,
    clientes: dashboard.modules.clientes,
    users: dashboard.modules.users,
  });

  pushRecent({
    event: "dashboard:aggregate:success",
    requestId,
    durationMs: nowMs() - startedAt,
    partial: dashboard.partial,
    errorsCount: safeArray(dashboard.errors).length,
  });

  return {
    ok: true,
    success: true,

    source: "home-modular-aggregate",
    version: HOME_API_VERSION,

    requestId,
    generatedAt: nowIso(),
    durationMs: nowMs() - startedAt,

    dashboard,
    modules,

    meta: {
      requestId,
      role: getCurrentRole() || "unknown",
      includeUsers: shouldRequestUsers,
      includeRecent: Boolean(includeRecent),
      partial: dashboard.partial,
      errorsCount: safeArray(dashboard.errors).length,
    },
  };
}

export async function fetchHomeHealthRequest({
  timeout = HOME_HEALTH_TIMEOUT,
  params = null,
} = {}) {
  return requestFirstOk(
    "health",
    [
      ENDPOINTS.healthReady,
      ENDPOINTS.health,
      ENDPOINTS.healthLive,
      ENDPOINTS.rootHealthReady,
      ENDPOINTS.rootHealth,
      ENDPOINTS.rootHealthLive,
    ],
    {
      timeout,
      params,
    }
  );
}

export async function getHomeDashboardRequest(options = {}) {
  const response = await fetchHomeDashboardRequest(options);

  return normalizeDashboard(response);
}

export async function getHomeWidgetByIdRequest(widgetId = "", options = {}) {
  const id = safeText(widgetId, "");

  if (!id) {
    return null;
  }

  const dashboard = await getHomeDashboardRequest(options);

  return findWidgetInCollection(
    dashboard.widgets,
    id
  );
}

/* =========================================================
   CACHE HYDRATION
========================================================= */

export function hydrateHomeFromCache() {
  try {
    const apiCache = readApiCache();

    if (apiCache?.dashboard && hasOwnKeys(apiCache.dashboard)) {
      const dashboard = normalizeDashboard(apiCache.dashboard);
      const requestId = safeText(apiCache.requestId, "");
      const lastSyncAt = first(apiCache.lastSyncAt, dashboard.updatedAt, null);

      replaceHomeStore({
        dashboard,

        widgets: dashboard.widgets,
        summary: dashboard.summary,

        recent: dashboard.recent,
        recentActivity: dashboard.recentActivity,
        activity: dashboard.activity,

        tickets: dashboard.tickets,
        incidencias: dashboard.incidencias,

        facturas: dashboard.facturas,
        invoices: dashboard.invoices,

        users: dashboard.users,
        usuarios: dashboard.usuarios,

        clients: dashboard.clients,
        clientes: dashboard.clientes,
        customers: dashboard.customers,

        requestId,
        lastSyncAt,
      });

      safeCall(setDashboard, dashboard);
      safeCall(setWidgets, dashboard.widgets);
      safeCall(setSummary, dashboard.summary);
      safeCall(setRecent, dashboard.recent);
      safeCall(setRequestId, requestId);
      safeCall(setLastSyncAt, lastSyncAt);
      safeCall(setLoaded, true);
      safeCall(setHydrated, true);

      runtime.lastCacheHydratedAt = nowIso();

      pushRecent({
        event: "cache:hydrate",
        hasDashboard: true,
        requestId,
      });

      return {
        dashboard,

        widgets: dashboard.widgets,
        summary: dashboard.summary,

        recent: dashboard.recent,
        recentActivity: dashboard.recentActivity,
        activity: dashboard.activity,

        tickets: dashboard.tickets,
        incidencias: dashboard.incidencias,

        facturas: dashboard.facturas,
        invoices: dashboard.invoices,

        users: dashboard.users,
        usuarios: dashboard.usuarios,

        clients: dashboard.clients,
        clientes: dashboard.clientes,
        customers: dashboard.customers,

        requestId,
        lastSyncAt,

        hydrated: true,
      };
    }

    const currentDashboard = safeObject(homeState?.dashboard);
    const currentWidgets = safeArray(homeState?.widgets);
    const currentSummary = safeObject(homeState?.summary);
    const currentRecent = safeArray(first(homeState?.recent, homeState?.activity, []));
    const currentRequestId = safeText(homeState?.requestId, "");
    const currentLastSyncAt = first(homeState?.lastSyncAt, null);

    const hasStateCache =
      hasOwnKeys(currentDashboard) ||
      currentWidgets.length > 0 ||
      hasOwnKeys(currentSummary) ||
      currentRecent.length > 0;

    if (hasStateCache) {
      const dashboard = normalizeDashboard({
        ...currentDashboard,

        widgets: currentWidgets.length
          ? currentWidgets
          : currentDashboard.widgets,

        summary: hasOwnKeys(currentSummary)
          ? currentSummary
          : currentDashboard.summary,

        recent: currentRecent.length
          ? currentRecent
          : currentDashboard.recent,
      });

      replaceHomeStore({
        dashboard,

        widgets: dashboard.widgets,
        summary: dashboard.summary,

        recent: dashboard.recent,
        recentActivity: dashboard.recentActivity,
        activity: dashboard.activity,

        tickets: dashboard.tickets,
        incidencias: dashboard.incidencias,

        facturas: dashboard.facturas,
        invoices: dashboard.invoices,

        users: dashboard.users,
        usuarios: dashboard.usuarios,

        clients: dashboard.clients,
        clientes: dashboard.clientes,
        customers: dashboard.customers,

        requestId: currentRequestId,
        lastSyncAt: currentLastSyncAt,
      });

      safeCall(setHydrated, true);

      runtime.lastCacheHydratedAt = nowIso();

      return {
        dashboard,

        widgets: dashboard.widgets,
        summary: dashboard.summary,

        recent: dashboard.recent,
        recentActivity: dashboard.recentActivity,
        activity: dashboard.activity,

        tickets: dashboard.tickets,
        incidencias: dashboard.incidencias,

        facturas: dashboard.facturas,
        invoices: dashboard.invoices,

        users: dashboard.users,
        usuarios: dashboard.usuarios,

        clients: dashboard.clients,
        clientes: dashboard.clientes,
        customers: dashboard.customers,

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
      recentActivity: [],
      activity: [],

      tickets: [],
      incidencias: [],

      facturas: [],
      invoices: [],

      users: [],
      usuarios: [],

      clients: [],
      clientes: [],
      customers: [],

      requestId: "",
      lastSyncAt: null,

      hydrated: false,
    };
  } catch (error) {
    safeWarn("hydrateHomeFromCache() falló.", error);

    return {
      dashboard: {},
      widgets: [],
      summary: {},

      recent: [],
      recentActivity: [],
      activity: [],

      tickets: [],
      incidencias: [],

      facturas: [],
      invoices: [],

      users: [],
      usuarios: [],

      clients: [],
      clientes: [],
      customers: [],

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
    recentActivity: normalizedDashboard.recentActivity,
    activity: normalizedDashboard.activity,

    tickets: normalizedDashboard.tickets,
    incidencias: normalizedDashboard.incidencias,

    facturas: normalizedDashboard.facturas,
    invoices: normalizedDashboard.invoices,

    users: normalizedDashboard.users,
    usuarios: normalizedDashboard.usuarios,

    clients: normalizedDashboard.clients,
    clientes: normalizedDashboard.clientes,
    customers: normalizedDashboard.customers,

    requestId,
    lastSyncAt,
  });

  widgets.forEach((item) => {
    if (hasOwnKeys(item)) {
      safeCall(upsertHomeWidgetStore, item);
    }
  });

  safeCall(setDashboard, normalizedDashboard);
  safeCall(setWidgets, widgets);
  safeCall(setSummary, summary);
  safeCall(setRecent, recent);
  safeCall(setRequestId, requestId);
  safeCall(setLastSyncAt, lastSyncAt);
  safeCall(setLoaded, true);
  safeCall(setHydrated, true);
  safeCall(setError, null);

  writeApiCache({
    dashboard: normalizedDashboard,
    requestId,
    lastSyncAt,
  });

  runtime.lastLoadedAt = nowIso();
  runtime.lastRequestId = safeText(requestId, "");

  pushRecent({
    event: "dashboard:sync",

    requestId,

    ticketsCount: normalizedDashboard.summary.totalTickets,
    visibleTicketsCount: normalizedDashboard.visibleTicketsCount,

    invoicesCount: normalizedDashboard.summary.totalInvoices,
    visibleInvoicesCount: normalizedDashboard.visibleInvoicesCount,

    clientsCount: normalizedDashboard.summary.clientsCount,
    visibleClientsCount: normalizedDashboard.visibleClientsCount,
  });

  return normalizedDashboard;
}

/* =========================================================
   LOAD DASHBOARD
========================================================= */

export async function loadHomeDashboard({
  force = false,
  returnStaleOnError = true,
  includeRecent = true,
  includeUsers = undefined,
  params = null,
} = {}) {
  const loadToken = nextLoadToken();

  const cachedDashboard = safeObject(homeState?.dashboard);
  const hasCachedDashboard = hasOwnKeys(cachedDashboard);

  const firstLoad = !Boolean(
    homeState?.hydrated ||
      homeState?.loaded ||
      hasCachedDashboard
  );

  const shouldShowLoading = firstLoad && !force;

  runtime.loading = true;
  runtime.refreshing = !shouldShowLoading;

  safeEmit("home:dashboard:load:start", {
    force: Boolean(force),
    firstLoad,
    includeRecent: Boolean(includeRecent),
    includeUsers: canRequestUsersModule({ includeUsers }),
  });

  try {
    safeCall(setError, null);

    if (shouldShowLoading) {
      safeCall(setLoading, true);
    } else {
      safeCall(setRefreshing, true);
    }

    const rawResponse = await fetchHomeDashboardRequest({
      includeRecent,
      includeUsers,
      params,
    });

    const normalizedResponse = normalizeHomeDashboardResponse(rawResponse);
    const requestId = normalizedResponse.requestId || rawResponse.requestId || "";
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

    runtime.lastError = null;
    runtime.lastErrorMessage = "";

    safeEmit("home:dashboard:load:success", {
      requestId,

      widgetsCount: dashboard.widgets.length,
      recentCount: dashboard.recent.length,

      ticketsCount: dashboard.summary.totalTickets,
      incidenciasCount: dashboard.summary.totalTickets,
      visibleTicketsCount: dashboard.visibleTicketsCount,
      visibleIncidenciasCount: dashboard.visibleIncidenciasCount,

      invoicesCount: dashboard.summary.totalInvoices,
      facturasCount: dashboard.summary.totalInvoices,
      visibleInvoicesCount: dashboard.visibleInvoicesCount,
      visibleFacturasCount: dashboard.visibleFacturasCount,

      usersCount: dashboard.summary.usersCount,
      usuariosCount: dashboard.summary.usuariosCount,
      visibleUsersCount: dashboard.visibleUsersCount,
      visibleUsuariosCount: dashboard.visibleUsuariosCount,

      clientsCount: dashboard.summary.clientsCount,
      clientesCount: dashboard.summary.clientesCount,
      visibleClientsCount: dashboard.visibleClientsCount,
      visibleClientesCount: dashboard.visibleClientesCount,

      partial: dashboard.partial,
      syncedAt,
    });

    safeLog("Home cargado.", {
      requestId,

      tickets: dashboard.summary.totalTickets,
      invoices: dashboard.summary.totalInvoices,
      users: dashboard.summary.usersCount,
      clients: dashboard.summary.clientsCount,
      partial: dashboard.partial,
    });

    return dashboard;
  } catch (error) {
    const message = normalizeErrorMessage(
      error,
      "No se pudo cargar el Home."
    );

    if (!isActiveLoadToken(loadToken)) {
      safeEmit("home:dashboard:load:error:stale", {
        message,
      });

      return safeObject(homeState?.dashboard);
    }

    runtime.lastError = sanitizePayload(error);
    runtime.lastErrorMessage = message;

    safeError("HOME LOAD:", error);

    safeCall(setError, message);
    safeCall(setLoaded, true);

    safeEmit("home:dashboard:load:error", {
      message,
      error: sanitizePayload(error),
    });

    if (returnStaleOnError && hasCachedDashboard) {
      return normalizeDashboard(cachedDashboard);
    }

    const cache = hydrateHomeFromCache();

    if (
      returnStaleOnError &&
      cache?.hydrated &&
      hasOwnKeys(cache.dashboard)
    ) {
      return normalizeDashboard(cache.dashboard);
    }

    throw error;
  } finally {
    if (isActiveLoadToken(loadToken)) {
      safeCall(setLoading, false);
      safeCall(setRefreshing, false);
    }

    runtime.loading = false;
    runtime.refreshing = false;
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
    const result = await fetchHomeHealthRequest({
      params,
    });

    const health = result?.ok
      ? unwrapResponseEnvelope(result.data)
      : {
          ok: false,
          error: result?.error?.code || "HEALTH_UNAVAILABLE",
          message: result?.error?.message || "Health no disponible.",
        };

    const normalizedHealth = safeObject(health);

    safeCall(setHealth, normalizedHealth);

    safeEmit("home:health:success", {
      health: normalizedHealth,
    });

    return normalizedHealth;
  } catch (error) {
    safeError("HOME HEALTH:", error);

    safeEmit("home:health:error", {
      error: sanitizePayload(error),
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
   DEBUG SNAPSHOT
========================================================= */

export function getHomeApiSnapshot() {
  const dashboard = normalizeDashboard(homeState?.dashboard || {});
  const cache = readApiCache();

  return sanitizePayload({
    version: HOME_API_VERSION,
    source: SOURCE,

    endpoints: {
      dashboard: HOME_DASHBOARD_ENDPOINT,
      legacyDashboard: HOME_DASHBOARD_LEGACY_ENDPOINT,
      health: HOME_DASHBOARD_PING_ENDPOINT,

      ticketsStats: ENDPOINTS.ticketsStats,
      ticketsList: ENDPOINTS.ticketsList,

      facturasStats: ENDPOINTS.facturasStats,
      facturasList: ENDPOINTS.facturasList,

      clientesStats: ENDPOINTS.clientesStats,
      clientesList: ENDPOINTS.clientesList,

      usersStats: ENDPOINTS.usersStats,
      usersList: ENDPOINTS.usersList,
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
      role: getCurrentRole() || "unknown",
      usersModuleAllowed: canRequestUsersModule(),
    },

    cache: {
      hasApiCache: Boolean(cache?.dashboard),
      cacheKey: HOME_API_CACHE_KEY,
      ttlMs: HOME_API_CACHE_TTL_MS,
      savedAt: cache?.savedAt || null,
      cacheVersion: cache?.cacheVersion || null,
    },

    runtime: {
      ...runtime,
      recent: safeClone(runtime.recent, []),
    },

    lastLoadToken,

    dashboard: {
      widgetsCount: dashboard.widgets.length,

      ticketsCount: dashboard.summary.totalTickets,
      incidenciasCount: dashboard.summary.incidenciasTotal,
      openTickets: dashboard.summary.openTickets,
      urgentTickets: dashboard.summary.urgentTickets,
      visibleTicketsCount: dashboard.visibleTicketsCount,
      visibleIncidenciasCount: dashboard.visibleIncidenciasCount,

      invoicesCount: dashboard.summary.totalInvoices,
      facturasCount: dashboard.summary.totalFacturas,
      pendingInvoices: dashboard.summary.pendingInvoices,
      invoiceAmount: dashboard.summary.invoiceAmount,
      visibleInvoicesCount: dashboard.visibleInvoicesCount,
      visibleFacturasCount: dashboard.visibleFacturasCount,

      usersCount: dashboard.summary.usersCount,
      usuariosCount: dashboard.summary.usuariosCount,
      visibleUsersCount: dashboard.visibleUsersCount,
      visibleUsuariosCount: dashboard.visibleUsuariosCount,

      clientsCount: dashboard.summary.clientsCount,
      clientesCount: dashboard.summary.clientesCount,
      customersCount: dashboard.summary.customersCount,
      visibleClientsCount: dashboard.visibleClientsCount,
      visibleClientesCount: dashboard.visibleClientesCount,

      activityCount: dashboard.activity.length,
      partial: dashboard.partial || false,
      updatedAt: dashboard.updatedAt || null,
    },

    summary: dashboard.summary,

    state: {
      loading: Boolean(homeState?.loading),
      refreshing: Boolean(homeState?.refreshing),
      loaded: Boolean(homeState?.loaded),
      hydrated: Boolean(homeState?.hydrated),

      requestId: safeText(homeState?.requestId, ""),

      widgetsCount: safeArray(homeState?.widgets).length,
      recentCount: safeArray(first(homeState?.recent, homeState?.activity, [])).length,

      lastSyncAt: homeState?.lastSyncAt || null,
      error: homeState?.error || null,
    },
  });
}

/* =========================================================
   PUBLIC API
========================================================= */

export const HomeApi = Object.freeze({
  version: HOME_API_VERSION,

  endpoints: Object.freeze({
    dashboard: HOME_DASHBOARD_ENDPOINT,
    legacyDashboard: HOME_DASHBOARD_LEGACY_ENDPOINT,
    health: HOME_DASHBOARD_PING_ENDPOINT,

    ticketsStats: ENDPOINTS.ticketsStats,
    ticketsList: ENDPOINTS.ticketsList,

    facturasStats: ENDPOINTS.facturasStats,
    facturasList: ENDPOINTS.facturasList,

    clientesStats: ENDPOINTS.clientesStats,
    clientesList: ENDPOINTS.clientesList,

    usersStats: ENDPOINTS.usersStats,
    usersList: ENDPOINTS.usersList,
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
