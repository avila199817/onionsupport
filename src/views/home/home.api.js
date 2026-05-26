/* =========================================================
   Onion Support - Home API
   Archivo: /src/views/home/home.api.js

   Responsabilidad:
   - Cargar datos del Home desde backend real existente.
   - Usar Core HTTP/AppCore HTTP como única capa de transporte.
   - Construir dashboard local desde endpoints de listado:
     /api/tickets
     /api/facturas
     /api/clientes sólo admin
     /api/users sólo admin
   - Proyectar respuestas grandes a DTOs ligeros para Home.
   - Vista Home distinta para admin y user.
   - User: incidencias + facturas propias según scope backend.
   - Admin: incidencias + facturas + clientes + usuarios.
   - Calcular métricas desde listas/meta devueltas mediante home.model.js.
   - Normalizar respuesta para homeView.js.
   - Blindar cache admin cuando el rol actual sea user.
   - Rutas/admin-routes/bloqueos delegados en core/config.js.
   - No conservar raw backend sensible en dashboard/cache.
   - No tocar DOM.
   - No CSS.
   - No Router.
   - No Storage persistente.
   - No fetch propio.
   - No eventos.
   - No apiClient paralelo.
   - No /api/dashboard.
   - No endpoints /stats inexistentes.
   - No /home.
========================================================= */

import { AppCore } from "../../core/index.js";
import * as CoreHttpModule from "../../core/http.js";

import {
  ROUTES,
  isAdminRoute as configIsAdminRoute,
  isBlockedRoutePath as configIsBlockedRoutePath,
  normalizeRoutePath as configNormalizeRoutePath,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../../core/config.js";

import { homeState } from "./home.state.js";

import {
  getHomeDashboardStore,
} from "./home.store.js";

import {
  normalizeHomeDashboard,
  normalizeHomeWidgets,
  normalizeHomeActivityList,

  getHomeWidgetId,
  getHomeTicketId,
  getHomeInvoiceId,
  getHomeUserId,
  getHomeClientId,
} from "./home.model.js";

export const HOME_API_VERSION = "home.api.v12.core-http-list-aggregate";

export const HOME_DASHBOARD_ENDPOINT = "local:home-list-aggregate";
export const HOME_DASHBOARD_LEGACY_ENDPOINT = "";

export const HOME_TIMEOUT = 15000;

const CoreHttp =
  CoreHttpModule.default ||
  CoreHttpModule.Http ||
  CoreHttpModule.http ||
  CoreHttpModule;

const ENDPOINTS = Object.freeze({
  ticketsList: "/api/tickets",
  facturasList: "/api/facturas",
  clientesList: "/api/clientes",
  usersList: "/api/users",
});

const DEFAULT_LIST_PARAMS = Object.freeze({
  limit: 24,
  includeTotal: true,
  sortBy: "updatedAt",
  sortDir: "DESC",
});

const HOME_MAX_ITEMS = 24;
const HOME_ACTIVITY_LIMIT = 5;
const HOME_TEXT_LIMIT = 180;
const HOME_TITLE_LIMIT = 120;

const RAW_KEYS = new Set([
  "raw",
  "data",
  "payload",
  "response",
  "body",
  "request",
  "headers",
  "config",
]);

const COSMOS_META_KEYS = new Set([
  "_rid",
  "_self",
  "_etag",
  "_attachments",
  "_ts",
  "_lsn",
  "_metadata",
  "_id",
]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|passwd|pwd|secret|credential|jwt|bearer|refresh|access_token|accessToken|id_token|idToken|apiKey|api_key|privateKey|private_key|connectionString|connection_string|sas|otp|totp|mfa|twofa|2fa|backupCode|backup_code|backupCodes|backup_codes|session|sessionId|session_id|email|correo|mail|phone|telefono|teléfono|address|direccion|dirección|nif|dni|iban|bank|cuenta|account|ipRaw|ip|userAgent/i;

const SENSITIVE_QUERY_RE =
  /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i;

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/i;
const EMAIL_GLOBAL_RE = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/gi;
const JWT_RE =
  /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

let loadSeq = 0;

const runtime = {
  loading: false,
  refreshing: false,

  lastRequestAt: "",
  lastResponseAt: "",
  lastLoadedAt: "",

  lastRequestId: "",
  lastError: null,

  modules: {
    tickets: null,
    facturas: null,
    clientes: null,
    users: null,
  },
};

/* =========================================================
   SAFE HELPERS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value = "", fallback = "") {
  if (value === null || value === undefined) return fallback;

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function compactText(value = "", fallback = "", max = HOME_TEXT_LIMIT) {
  const text = safeText(value, fallback);

  if (!text) return fallback;
  if (text.length <= max) return text;

  return `${text.slice(0, Math.max(1, max - 1)).trim()}…`;
}

function safeNumber(value = 0, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string") {
    let clean = value
      .trim()
      .replace(/[€$£¥%]/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s/g, "");

    if (!clean || clean === "-" || clean === "+") return fallback;

    const hasComma = clean.includes(",");
    const hasDot = clean.includes(".");

    if (hasComma && hasDot) {
      const lastComma = clean.lastIndexOf(",");
      const lastDot = clean.lastIndexOf(".");

      clean =
        lastComma > lastDot
          ? clean.replace(/\./g, "").replace(/,/g, ".")
          : clean.replace(/,/g, "");
    } else if (hasComma) {
      clean = clean.replace(/,/g, ".");
    }

    const number = Number(clean);
    return Number.isFinite(number) ? number : fallback;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hasOwnKeys(value = {}) {
  return Boolean(isObject(value) && Object.keys(value).length > 0);
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function redact(value = "") {
  return String(value || "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(JWT_RE, "***")
    .replace(EMAIL_GLOBAL_RE, "");
}

function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function normalizeRole(value = "", fallback = "") {
  if (Array.isArray(value)) {
    const roles = value
      .map((item) => normalizeRole(item, ""))
      .filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return fallback;
  }

  const role = String(value || "").trim().toLowerCase();

  if (role === "admin") return "admin";
  if (role === "user") return "user";

  return fallback;
}

function uniqueBy(items = [], picker = (item) => item) {
  const seen = new Set();
  const output = [];

  for (const item of safeArray(items)) {
    const raw = safeText(picker(item), "");
    const key = raw ? normalizeKey(raw) : "";

    if (!key) {
      output.push(item);
      continue;
    }

    if (seen.has(key)) continue;

    seen.add(key);
    output.push(item);
  }

  return output;
}

function clone(value, fallback = null) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {
    // fallback abajo
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function safeCall(fn = null, ...args) {
  try {
    return isFunction(fn) ? fn(...args) : null;
  } catch {
    return null;
  }
}

function isSensitiveKey(key = "") {
  return SENSITIVE_KEY_RE.test(String(key || ""));
}

function isRawKey(key = "") {
  return RAW_KEYS.has(String(key || ""));
}

function isCosmosMetaKey(key = "") {
  return COSMOS_META_KEYS.has(String(key || ""));
}

function isEmailLike(value = "") {
  const text = safeText(value, "");
  return Boolean(text && EMAIL_RE.test(text));
}

function hasSensitiveQuery(value = "") {
  return SENSITIVE_QUERY_RE.test(String(value || ""));
}

function safePublicId(value = "") {
  const text = safeText(value, "");

  if (!text) return "";
  if (isEmailLike(text)) return "";
  if (hasSensitiveQuery(text)) return "";
  if (/Bearer\s+/i.test(text)) return "";
  if (SENSITIVE_KEY_RE.test(text) && text.length > 80) return "";

  return compactText(redact(text), "", 160);
}

function safePublicText(value = "", fallback = "") {
  const text = redact(safeText(value, ""));

  if (!text) return fallback;
  if (isEmailLike(text)) return fallback;
  if (hasSensitiveQuery(text)) return fallback;
  if (/Bearer\s+/i.test(text)) return fallback;

  return compactText(text, fallback, HOME_TITLE_LIMIT);
}

function safePublicUrl(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";
  if (raw.length > 2048) return "";
  if (hasSensitiveQuery(raw)) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(?:data|blob|javascript|vbscript|file):/i.test(raw)) return "";
  if (raw.startsWith("//")) return "";

  if (raw.startsWith("/")) {
    return raw.replace(/\/{2,}/g, "/");
  }

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  if (
    raw.includes("/") ||
    /\.(?:png|jpe?g|gif|webp|svg|avif|bmp)(?:[?#].*)?$/i.test(raw)
  ) {
    const clean = raw
      .replace(/^\.\//, "")
      .replace(/^\/+/, "")
      .replace(/\/{2,}/g, "/");

    return clean ? `/${clean}` : "";
  }

  return "";
}

function sanitizeDashboardValue(value, keyHint = "") {
  if (isRawKey(keyHint)) return undefined;
  if (isCosmosMetaKey(keyHint)) return undefined;
  if (isSensitiveKey(keyHint)) return undefined;

  if (typeof value === "string") {
    return redact(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeDashboardValue(item))
      .filter((item) => item !== undefined);
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (isRawKey(key)) continue;
      if (isCosmosMetaKey(key)) continue;
      if (isSensitiveKey(key)) continue;

      const clean = sanitizeDashboardValue(item, key);

      if (clean !== undefined) {
        output[key] = clean;
      }
    }

    return output;
  }

  return value;
}

function sanitizeDashboardObject(value = {}) {
  return safeObject(sanitizeDashboardValue(value), {});
}

function normalizeErrorMessage(error = null) {
  return redact(
    safeText(
      first(
        error?.response?.data?.message,
        error?.data?.message,
        error?.message,
        error?.reason,
        "No se pudo cargar el Home."
      ),
      "No se pudo cargar el Home."
    )
  );
}

function getErrorStatus(error = null) {
  return (
    error?.status ||
    error?.statusCode ||
    error?.response?.status ||
    error?.data?.status ||
    0
  );
}

function getErrorCode(error = null) {
  return safeText(
    first(
      error?.code,
      error?.data?.code,
      error?.response?.data?.code,
      ""
    ),
    ""
  );
}

function normalizeError(error = null) {
  if (!error) return null;

  return {
    status: getErrorStatus(error),
    code: getErrorCode(error),
    message: normalizeErrorMessage(error),
    at: nowIso(),
  };
}

/* =========================================================
   ROUTES
========================================================= */

function routeInput(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (hasSensitiveQuery(raw)) return "";

  try {
    return configRoutePathFromUrlLike(raw) || "";
  } catch {
    if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || "/";
    if (raw.startsWith("#/")) return raw.slice(1) || "/";
    return raw;
  }
}

function routeSuffix(value = "") {
  const raw = safeText(value, "");
  const hashIndex = raw.indexOf("#");
  const beforeHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";
  const queryIndex = beforeHash.indexOf("?");
  const search = queryIndex >= 0 ? beforeHash.slice(queryIndex) : "";

  if (hasSensitiveQuery(search) || hasSensitiveQuery(hash)) return "";

  return `${search}${hash}`;
}

function routePathOnly(value = "") {
  const input = routeInput(value);

  if (!input) return "";
  if (!input.startsWith("/")) return "";
  if (input.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) return "";
  if (/[\r\n\t\\]/.test(input)) return "";
  if (hasSensitiveQuery(input)) return "";

  const pathOnly = input.split("?")[0].split("#")[0] || "";

  try {
    return configNormalizeRoutePath(pathOnly) || "";
  } catch {
    let path = pathOnly.replace(/\\/g, "/").replace(/\/{2,}/g, "/");

    if (!path.startsWith("/")) {
      path = `/${path}`;
    }

    if (path.length > 1) {
      path = path.replace(/\/+$/g, "") || "/";
    }

    return path || "";
  }
}

function isBlockedRoute(value = "") {
  const path = routePathOnly(value);

  if (!path) return true;

  try {
    return configIsBlockedRoutePath(path) === true;
  } catch {
    const lower = path.toLowerCase();

    return Boolean(
      lower === "/home" ||
        lower === "/403" ||
        lower === "/404" ||
        lower === "/2fa" ||
        lower === "/mfa" ||
        lower === "/otp" ||
        lower.startsWith("/2fa/") ||
        lower.startsWith("/mfa/") ||
        lower.startsWith("/otp/")
    );
  }
}

function normalizeSpaRoute(route = "") {
  const input = routeInput(route);

  if (!input) return "";
  if (!input.startsWith("/")) return "";
  if (input.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) return "";
  if (/[\r\n\t\\]/.test(input)) return "";
  if (hasSensitiveQuery(input)) return "";

  const pathOnly = routePathOnly(input);

  if (!pathOnly) return "";
  if (isBlockedRoute(pathOnly)) return "";

  return `${pathOnly}${routeSuffix(input)}`;
}

function routeFromCore(name = "", fallback = "") {
  return normalizeSpaRoute(ROUTES?.[name]) || normalizeSpaRoute(fallback);
}

const INCIDENCIAS_ROUTE = routeFromCore("incidencias", "/incidencias");
const FACTURAS_ROUTE = routeFromCore("facturas", "/facturas");
const CLIENTES_ROUTE = routeFromCore("clientes", "/clientes");
const USUARIOS_ROUTE = routeFromCore("usuarios", "");

function routePath(route = "") {
  return normalizeSpaRoute(route).split("?")[0].split("#")[0] || "";
}

function isAdminOnlyRoute(route = "") {
  const path = routePath(route);
  const clientes = routePath(CLIENTES_ROUTE);
  const usuarios = routePath(USUARIOS_ROUTE);

  if (!path) return false;

  try {
    if (configIsAdminRoute(path) === true) return true;
  } catch {
    // fallback abajo
  }

  return (
    Boolean(clientes && (path === clientes || path.startsWith(`${clientes}/`))) ||
    Boolean(usuarios && (path === usuarios || path.startsWith(`${usuarios}/`)))
  );
}

/* =========================================================
   AUTH / ROLE
========================================================= */

function getAuth() {
  try {
    return (
      AppCore?.auth ||
      AppCore?.Auth ||
      AppCore?.modules?.get?.("auth") ||
      AppCore?.modules?.get?.("Auth") ||
      null
    );
  } catch {
    return null;
  }
}

function getCurrentUser() {
  const Auth = getAuth();
  const state = safeObject(AppCore?.state);

  return safeObject(
    first(
      safeCall(Auth?.getCurrentUser?.bind?.(Auth) || Auth?.getCurrentUser),
      safeCall(Auth?.getUser?.bind?.(Auth) || Auth?.getUser),
      safeCall(AppCore?.getCurrentUser?.bind?.(AppCore) || AppCore?.getCurrentUser),
      state.user,
      state.currentUser,
      state.authUser,
      state.sessionUser,
      state.session?.user,
      state.sessionData?.user,
      {}
    )
  );
}

function getCurrentRole() {
  const Auth = getAuth();
  const state = safeObject(AppCore?.state);
  const user = getCurrentUser();

  return (
    normalizeRole(
      first(
        safeCall(Auth?.getRole?.bind?.(Auth) || Auth?.getRole),
        safeCall(Auth?.getCurrentRole?.bind?.(Auth) || Auth?.getCurrentRole),
        safeCall(AppCore?.getCurrentRole?.bind?.(AppCore) || AppCore?.getCurrentRole),

        state.role,
        state.rol,
        state.userRole,
        state.roles,

        user.role,
        user.rol,
        user.roles,

        homeState?.role,
        homeState?.rol,
        homeState?.roles,

        ""
      ),
      ""
    ) || "user"
  );
}

function isAdmin() {
  return getCurrentRole() === "admin";
}

function canRequestUsersModule(options = {}) {
  if (typeof options.includeUsers === "boolean") {
    return options.includeUsers === true && isAdmin();
  }

  return isAdmin();
}

function canRequestClientsModule(options = {}) {
  if (typeof options.includeClientes === "boolean") {
    return options.includeClientes === true && isAdmin();
  }

  if (typeof options.includeClients === "boolean") {
    return options.includeClients === true && isAdmin();
  }

  return isAdmin();
}

/* =========================================================
   HTTP CLIENT
========================================================= */

export function getHomeApiClient() {
  try {
    return (
      AppCore?.http ||
      AppCore?.Http ||
      AppCore?.services?.http ||
      AppCore?.core?.http ||
      AppCore?.modules?.get?.("http") ||
      AppCore?.modules?.get?.("Http") ||
      CoreHttp ||
      null
    );
  } catch {
    return CoreHttp || null;
  }
}

function appendQuery(endpoint = "", params = {}) {
  const path = normalizeSpaRoute(endpoint);

  if (!path) return "";

  const cleanParams = sanitizeDashboardObject(params);

  try {
    const url = new URL(path, "http://localhost");

    for (const [key, value] of Object.entries(cleanParams)) {
      if (value === null || value === undefined || value === "") continue;
      if (isSensitiveKey(key)) continue;

      url.searchParams.set(key, String(value));
    }

    return `${url.pathname}${url.search}`;
  } catch {
    return path;
  }
}

async function coreGet(endpoint = "", {
  params = {},
  timeout = HOME_TIMEOUT,
} = {}) {
  const client = getHomeApiClient();
  const url = appendQuery(endpoint, params);

  if (!client || !url) {
    throw new Error("HOME_API_HTTP_CLIENT_UNAVAILABLE");
  }

  const options = {
    timeout,
    source: "views.home.api",
  };

  if (isFunction(client.get)) {
    return client.get(url, options);
  }

  if (isFunction(client.request)) {
    return client.request({
      method: "GET",
      url,
      timeout,
      source: "views.home.api",
    });
  }

  if (isFunction(client)) {
    return client({
      method: "GET",
      url,
      timeout,
      source: "views.home.api",
    });
  }

  throw new Error("HOME_API_HTTP_GET_UNAVAILABLE");
}

/* =========================================================
   RESPONSE UNWRAP
========================================================= */

function responseStatus(response = null) {
  return safeNumber(
    first(
      response?.status,
      response?.statusCode,
      response?.response?.status,
      response?.data?.status,
      0
    ),
    0
  );
}

function responsePayload(response = null, depth = 0) {
  if (depth > 5) return response;
  if (Array.isArray(response)) return response;

  const object = safeObject(response, null);

  if (!object) return response;

  if (
    Array.isArray(object.items) ||
    Array.isArray(object.rows) ||
    Array.isArray(object.results) ||
    Array.isArray(object.records) ||
    Array.isArray(object.docs) ||
    Array.isArray(object.documents) ||
    Array.isArray(object.value) ||
    Array.isArray(object.list)
  ) {
    return object;
  }

  const nested = first(
    object.data,
    object.payload,
    object.result,
    object.response,
    object.body
  );

  if (nested !== null && nested !== undefined && nested !== response) {
    return responsePayload(nested, depth + 1);
  }

  return object;
}

function listFromPayload(payload = null, aliases = []) {
  if (Array.isArray(payload)) return payload;

  const object = safeObject(payload, null);

  if (!object) return [];

  for (const key of [
    ...safeArray(aliases),
    "items",
    "rows",
    "records",
    "results",
    "docs",
    "documents",
    "value",
    "list",
  ]) {
    const value = object?.[key];

    if (Array.isArray(value)) return value;
  }

  for (const key of safeArray(aliases)) {
    const value = object?.[key];

    if (isObject(value)) {
      const nested = listFromPayload(value, aliases);

      if (nested.length) return nested;
    }
  }

  return [];
}

function totalFromPayload(payload = null, fallback = 0) {
  const object = safeObject(payload, null);

  if (!object) return fallback;

  return Math.max(
    fallback,
    safeNumber(
      first(
        object.total,
        object.count,
        object.totalCount,
        object.remoteCount,
        object.meta?.total,
        object.meta?.count,
        object.meta?.totalCount,
        object.pagination?.total,
        object.pagination?.totalCount,
        object.page?.total,
        fallback
      ),
      fallback
    )
  );
}

/* =========================================================
   DTO PROJECTION
========================================================= */

function projectTicketDto(item = {}) {
  const raw = safeObject(item);

  return sanitizeDashboardObject({
    id: first(raw.id, raw.ticketId, raw.incidenciaId, raw.code, raw.numero),
    ticketId: first(raw.ticketId, raw.incidenciaId, raw.id, raw.code, raw.numero),
    incidenciaId: first(raw.incidenciaId, raw.ticketId, raw.id, raw.code, raw.numero),
    entityId: first(raw.entityId, raw.ticketId, raw.incidenciaId, raw.id),

    subject: first(raw.subject, raw.asunto, raw.title, raw.titulo, raw.name),
    asunto: first(raw.asunto, raw.subject, raw.title, raw.titulo, raw.name),
    title: first(raw.title, raw.subject, raw.asunto, raw.titulo, raw.name),
    message: first(raw.message, raw.description, raw.descripcion, raw.preview, raw.body, raw.text),
    description: first(raw.description, raw.descripcion, raw.message, raw.preview, raw.body, raw.text),
    descripcion: first(raw.descripcion, raw.description, raw.message, raw.preview, raw.body, raw.text),
    preview: first(raw.preview, raw.description, raw.descripcion, raw.message),

    status: first(raw.status, raw.estado, raw.state, raw.lifecycle?.status),
    estado: first(raw.estado, raw.status, raw.state, raw.lifecycle?.status),
    priority: first(raw.priority, raw.prioridad, raw.severity, raw.urgency, raw.sla?.priority),
    prioridad: first(raw.prioridad, raw.priority, raw.severity, raw.urgency, raw.sla?.priority),
    category: first(raw.category, raw.categoria, raw.type, raw.tipo),
    categoria: first(raw.categoria, raw.category, raw.type, raw.tipo),

    userId: first(raw.userId, raw.usuarioId, raw.requesterUserId, raw.requesterId, raw.userRef?.userId, raw.userRef?.id),
    usuarioId: first(raw.usuarioId, raw.userId, raw.requesterUserId, raw.requesterId, raw.userRef?.userId, raw.userRef?.id),
    clienteId: first(raw.clienteId, raw.clientId, raw.customerId, raw.clienteRef?.clienteId, raw.clienteRef?.id),
    clientId: first(raw.clientId, raw.clienteId, raw.customerId, raw.clienteRef?.clienteId, raw.clienteRef?.id),

    requesterName: first(
      raw.requesterName,
      raw.ownerName,
      raw.clientName,
      raw.clienteName,
      raw.userName,
      raw.requesterSnapshot?.displayName,
      raw.requesterSnapshot?.name,
      raw.clienteSnapshot?.displayName,
      raw.clienteSnapshot?.name,
      raw.userSnapshot?.displayName,
      raw.userSnapshot?.name,
      raw.user?.displayName,
      raw.user?.name,
      raw.cliente?.displayName,
      raw.cliente?.name
    ),
    clientName: first(raw.clientName, raw.clienteName, raw.clienteSnapshot?.displayName, raw.clienteSnapshot?.name),
    userName: first(raw.userName, raw.usuarioName, raw.userSnapshot?.displayName, raw.userSnapshot?.name, raw.user?.displayName, raw.user?.name),

    avatarUrl: first(raw.avatarUrl, raw.requesterAvatarUrl, raw.userAvatarUrl, raw.photoUrl, raw.photoURL),
    requesterAvatarUrl: first(raw.requesterAvatarUrl, raw.avatarUrl, raw.userAvatarUrl, raw.photoUrl, raw.photoURL),
    userAvatarUrl: first(raw.userAvatarUrl, raw.avatarUrl, raw.requesterAvatarUrl, raw.photoUrl, raw.photoURL),

    assignedToUserId: first(raw.assignedToUserId, raw.assignedToId, raw.assigneeId, raw.technicianId, raw.tecnicoId, raw.agentId, raw.assignment?.assignedToUserId),
    assignedToId: first(raw.assignedToId, raw.assignedToUserId, raw.assigneeId, raw.technicianId, raw.tecnicoId, raw.agentId),
    technicianId: first(raw.technicianId, raw.tecnicoId, raw.assignedToUserId, raw.assignedToId, raw.assigneeId),
    tecnicoId: first(raw.tecnicoId, raw.technicianId, raw.assignedToUserId, raw.assignedToId, raw.assigneeId),

    assignedToName: first(raw.assignedToName, raw.technicianName, raw.tecnicoName, raw.assigneeName, raw.agentName, raw.assignment?.assignedToName),
    technicianName: first(raw.technicianName, raw.tecnicoName, raw.assignedToName, raw.assigneeName, raw.agentName, raw.assignment?.technicianName),
    tecnicoName: first(raw.tecnicoName, raw.technicianName, raw.assignedToName, raw.assigneeName, raw.agentName, raw.assignment?.tecnicoName),

    assignedToAvatarUrl: first(raw.assignedToAvatarUrl, raw.technicianAvatarUrl, raw.tecnicoAvatarUrl, raw.agentAvatarUrl),
    technicianAvatarUrl: first(raw.technicianAvatarUrl, raw.tecnicoAvatarUrl, raw.assignedToAvatarUrl, raw.agentAvatarUrl),
    tecnicoAvatarUrl: first(raw.tecnicoAvatarUrl, raw.technicianAvatarUrl, raw.assignedToAvatarUrl, raw.agentAvatarUrl),

    assignment: raw.assignment,
    assignedTo: raw.assignedTo,
    tecnico: raw.tecnico,
    technician: raw.technician,
    assignedTechnician: raw.assignedTechnician,
    assignedUser: raw.assignedUser,

    requesterSnapshot: raw.requesterSnapshot,
    userSnapshot: raw.userSnapshot,
    clienteSnapshot: raw.clienteSnapshot,
    user: raw.user,
    cliente: raw.cliente,

    invoiceId: raw.invoiceId,
    facturaId: raw.facturaId,
    invoiceIds: raw.invoiceIds,
    facturaIds: raw.facturaIds,
    invoices: raw.invoices,
    facturas: raw.facturas,
    relations: raw.relations,
    ticketRef: raw.ticketRef,

    createdAt: first(raw.createdAt, raw.fechaCreacion, raw.created_at, raw.lifecycle?.createdAt),
    updatedAt: first(raw.updatedAt, raw.updated_at, raw.modifiedAt, raw.lastActivityAt, raw.lifecycle?.updatedAt),
    lastActivityAt: first(raw.lastActivityAt, raw.updatedAt, raw.lifecycle?.lastActivityAt),
    closedAt: first(raw.closedAt, raw.lifecycle?.closedAt),
  });
}

function projectInvoiceDto(item = {}) {
  const raw = safeObject(item);

  return sanitizeDashboardObject({
    id: first(raw.id, raw.invoiceId, raw.facturaId, raw.number, raw.numeroFacturaLegal, raw.numeroFactura, raw.numero, raw.code),
    invoiceId: first(raw.invoiceId, raw.facturaId, raw.id, raw.number, raw.numeroFacturaLegal, raw.numeroFactura, raw.numero, raw.code),
    facturaId: first(raw.facturaId, raw.invoiceId, raw.id, raw.number, raw.numeroFacturaLegal, raw.numeroFactura, raw.numero, raw.code),

    number: first(raw.number, raw.numeroFacturaLegal, raw.numeroFactura, raw.numero, raw.invoiceNumber, raw.code),
    numeroFactura: first(raw.numeroFactura, raw.numeroFacturaLegal, raw.number, raw.numero, raw.invoiceNumber, raw.code),
    title: first(raw.title, raw.name, raw.conceptoPrincipal, raw.concepto, raw.descripcionPrincipal),
    name: first(raw.name, raw.title, raw.conceptoPrincipal, raw.concepto, raw.descripcionPrincipal),
    concepto: first(raw.concepto, raw.conceptoPrincipal, raw.title, raw.name, raw.descripcionPrincipal),

    status: first(raw.status, raw.estado, raw.paymentStatus, raw.estadoPago, raw.payment?.status),
    estado: first(raw.estado, raw.status, raw.paymentStatus, raw.estadoPago, raw.payment?.status),
    paymentStatus: first(raw.paymentStatus, raw.estadoPago, raw.payment?.status, raw.status, raw.estado),
    estadoPago: first(raw.estadoPago, raw.paymentStatus, raw.payment?.status, raw.status, raw.estado),

    total: first(raw.total, raw.amount, raw.importe, raw.totalFactura, raw.facturaTotal, raw.facturaImporte, raw.importeFactura, raw.invoiceAmount, raw.totales?.total),
    amount: first(raw.amount, raw.total, raw.importe, raw.totalFactura, raw.facturaTotal, raw.facturaImporte, raw.importeFactura, raw.invoiceAmount, raw.totales?.total),
    importe: first(raw.importe, raw.amount, raw.total, raw.totalFactura, raw.facturaTotal, raw.facturaImporte, raw.importeFactura, raw.invoiceAmount, raw.totales?.total),
    paidAmount: first(raw.paidAmount, raw.amountPaid, raw.pagado, raw.payment?.paidAmount, raw.totales?.pagado),
    pendingAmount: first(raw.pendingAmount, raw.amountPending, raw.pendiente, raw.payment?.pendingAmount, raw.totales?.pendiente),
    currency: first(raw.currency, raw.moneda, raw.totales?.currency, raw.payment?.currency),
    moneda: first(raw.moneda, raw.currency, raw.totales?.currency, raw.payment?.currency),

    ticketId: first(raw.ticketId, raw.incidenciaId, raw.ticket?.ticketId, raw.ticket?.id, raw.incidencia?.ticketId, raw.incidencia?.id, raw.ticketRef?.ticketId, raw.ticketRef?.id),
    incidenciaId: first(raw.incidenciaId, raw.ticketId, raw.ticket?.ticketId, raw.ticket?.id, raw.incidencia?.ticketId, raw.incidencia?.id, raw.ticketRef?.ticketId, raw.ticketRef?.id),
    ticketIds: raw.ticketIds,
    incidenciaIds: raw.incidenciaIds,
    ticketRef: raw.ticketRef,
    relations: raw.relations,

    createdAt: first(raw.createdAt, raw.fechaCreacion, raw.date),
    issuedAt: first(raw.issuedAt, raw.fechaEmision, raw.createdAt),
    dueAt: first(raw.dueAt, raw.fechaVencimiento, raw.vencimiento),
    paidAt: first(raw.paidAt, raw.fechaPago, raw.payment?.paidAt),
    updatedAt: first(raw.updatedAt, raw.modifiedAt, raw.fechaActualizacion),
  });
}

function projectUserDto(item = {}) {
  const raw = safeObject(item);

  return sanitizeDashboardObject({
    id: first(raw.id, raw.userId, raw.usuarioId, raw.uid, raw.sub, raw.username, raw.userName, raw.slug),
    userId: first(raw.userId, raw.id, raw.usuarioId, raw.uid, raw.sub, raw.username, raw.userName, raw.slug),
    usuarioId: first(raw.usuarioId, raw.userId, raw.id, raw.uid, raw.sub),

    displayName: first(raw.displayName, raw.fullName, raw.name, raw.nombre, raw.profile?.displayName, raw.profile?.fullName, raw.profile?.name, raw.username, raw.userName, raw.slug),
    fullName: first(raw.fullName, raw.displayName, raw.name, raw.nombre, raw.profile?.fullName, raw.profile?.displayName, raw.profile?.name),
    name: first(raw.name, raw.displayName, raw.fullName, raw.nombre, raw.profile?.name, raw.profile?.displayName, raw.profile?.fullName),
    nombre: first(raw.nombre, raw.name, raw.displayName, raw.fullName, raw.profile?.nombre, raw.profile?.name),

    username: first(raw.username, raw.userName, raw.slug),
    userName: first(raw.userName, raw.username, raw.slug),
    slug: first(raw.slug, raw.lookup?.slug, raw.profile?.slug),

    role: first(raw.role, raw.rol, raw.roles),
    rol: first(raw.rol, raw.role, raw.roles),
    roles: raw.roles,

    avatarUrl: first(raw.avatarUrl, raw.avatarURL, raw.avatar_url, raw.avatar, raw.photoUrl, raw.photoURL, raw.picture, raw.image, raw.foto, raw.imagen, raw.profile?.avatarUrl, raw.profile?.avatar, raw.media?.avatarUrl),
    avatar: first(raw.avatar, raw.avatarUrl, raw.photoUrl, raw.picture, raw.image, raw.foto, raw.imagen),
    photoUrl: first(raw.photoUrl, raw.photoURL, raw.avatarUrl, raw.avatar, raw.picture, raw.image),
    picture: first(raw.picture, raw.pictureUrl, raw.avatarUrl, raw.photoUrl),
    image: first(raw.image, raw.imageUrl, raw.avatarUrl, raw.photoUrl),

    active: first(raw.active, raw.isActive, raw.enabled),
    isActive: first(raw.isActive, raw.active, raw.enabled),
    createdAt: raw.createdAt,
    updatedAt: first(raw.updatedAt, raw.modifiedAt, raw.lastLoginAt),
    lastLoginAt: raw.lastLoginAt,
  });
}

function projectClientDto(item = {}) {
  const raw = safeObject(item);

  return sanitizeDashboardObject({
    id: first(raw.id, raw.clientId, raw.clienteId, raw.customerId, raw.userId, raw.slug),
    clientId: first(raw.clientId, raw.clienteId, raw.customerId, raw.id, raw.userId, raw.slug),
    clienteId: first(raw.clienteId, raw.clientId, raw.customerId, raw.id, raw.userId, raw.slug),
    customerId: first(raw.customerId, raw.clientId, raw.clienteId, raw.id, raw.userId, raw.slug),
    userId: raw.userId,

    name: first(raw.name, raw.nombre, raw.displayName, raw.razonSocial, raw.companyName, raw.company, raw.nombreContacto, raw.contacto?.name),
    nombre: first(raw.nombre, raw.name, raw.displayName, raw.razonSocial, raw.companyName, raw.company, raw.nombreContacto, raw.contacto?.nombre),
    displayName: first(raw.displayName, raw.name, raw.nombre, raw.razonSocial, raw.companyName, raw.company),
    razonSocial: first(raw.razonSocial, raw.companyName, raw.company, raw.name, raw.nombre, raw.displayName),

    active: first(raw.active, raw.isActive, raw.enabled),
    isActive: first(raw.isActive, raw.active, raw.enabled),
    createdAt: raw.createdAt,
    updatedAt: first(raw.updatedAt, raw.modifiedAt),
  });
}

function projectList(items = [], projector = (item) => item, maxItems = HOME_MAX_ITEMS) {
  return safeArray(items)
    .slice(0, Math.max(1, safeNumber(maxItems, HOME_MAX_ITEMS)))
    .map((item) => projector(item))
    .filter(hasOwnKeys);
}

/* =========================================================
   LIST REQUESTS
========================================================= */

function mergeParams(...sources) {
  const output = {};

  for (const source of sources) {
    for (const [key, value] of Object.entries(safeObject(source))) {
      if (value === null || value === undefined || value === "") continue;
      if (isSensitiveKey(key)) continue;

      output[key] = value;
    }
  }

  return output;
}

function moduleSnapshot(module = {}) {
  const value = safeObject(module);

  return sanitizeDashboardObject({
    ok: value.ok === true,
    skipped: value.skipped === true,
    listOk: value.listOk === true,
    status: safeNumber(value.status, 0),
    endpoint: value.endpoint || "",
    count: safeNumber(value.count, 0),
    remoteCount: safeNumber(value.remoteCount, 0),
    soft: value.soft === true,
    configured: value.configured !== false,
    error: value.error || null,
  });
}

async function loadListModule({
  name = "",
  endpoint = "",
  aliases = [],
  projector = (item) => item,
  params = {},
  timeout = HOME_TIMEOUT,
  required = false,
  skipped = false,
} = {}) {
  if (skipped) {
    return {
      name,
      ok: true,
      skipped: true,
      listOk: true,
      status: 0,
      endpoint,
      items: [],
      count: 0,
      remoteCount: 0,
      soft: true,
      configured: Boolean(endpoint),
      error: null,
    };
  }

  const safeEndpoint = normalizeSpaRoute(endpoint);

  if (!safeEndpoint) {
    return {
      name,
      ok: !required,
      skipped: true,
      listOk: !required,
      status: 0,
      endpoint: "",
      items: [],
      count: 0,
      remoteCount: 0,
      soft: !required,
      configured: false,
      error: required
        ? {
            message: `Endpoint no configurado: ${name}`,
            code: "HOME_API_ENDPOINT_MISSING",
          }
        : null,
    };
  }

  try {
    const response = await coreGet(safeEndpoint, {
      params,
      timeout,
    });

    const payload = responsePayload(response);
    const rawItems = listFromPayload(payload, aliases);
    const items = projectList(rawItems, projector, HOME_MAX_ITEMS);
    const remoteCount = totalFromPayload(payload, items.length);
    const status = responseStatus(response);

    return {
      name,
      ok: true,
      skipped: false,
      listOk: true,
      status,
      endpoint: safeEndpoint,
      items,
      count: items.length,
      remoteCount,
      soft: false,
      configured: true,
      error: null,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      skipped: false,
      listOk: false,
      status: getErrorStatus(error),
      endpoint: safeEndpoint,
      items: [],
      count: 0,
      remoteCount: 0,
      soft: !required,
      configured: true,
      error: normalizeError(error),
    };
  }
}

/* =========================================================
   DASHBOARD NORMALIZATION
========================================================= */

export function normalizeDashboard(payload = {}, options = {}) {
  const raw = sanitizeDashboardObject(payload);
  const role = normalizeRole(first(options.role, raw.role, raw.rol, raw.roles, getCurrentRole()), getCurrentRole());
  const admin = role === "admin";

  return normalizeHomeDashboard({
    ...raw,

    role,
    rol: role,
    roles: [role],
    admin,

    users: admin ? safeArray(raw.users) : [],
    usuarios: admin ? safeArray(raw.usuarios) : [],

    clients: admin ? safeArray(raw.clients) : [],
    clientes: admin ? safeArray(raw.clientes) : [],
    customers: admin ? safeArray(raw.customers) : [],

    meta: {
      ...safeObject(raw.meta),
      role,
      admin,
    },
  });
}

function buildLocalDashboard({
  ticketsModule = {},
  facturasModule = {},
  clientesModule = {},
  usersModule = {},
  role = getCurrentRole(),
  requestId = "",
} = {}) {
  const admin = role === "admin";

  const tickets = safeArray(ticketsModule.items);
  const invoices = safeArray(facturasModule.items);
  const clients = admin ? safeArray(clientesModule.items) : [];
  const users = admin ? safeArray(usersModule.items) : [];

  const modules = {
    tickets: moduleSnapshot(ticketsModule),
    facturas: moduleSnapshot(facturasModule),
    clientes: moduleSnapshot(clientesModule),
    users: moduleSnapshot(usersModule),
  };

  const dashboard = normalizeDashboard(
    {
      role,
      rol: role,
      roles: [role],
      admin,

      tickets,
      incidencias: tickets,

      invoices,
      facturas: invoices,

      clients,
      clientes: clients,
      customers: clients,

      users,
      usuarios: users,

      activity: normalizeHomeActivityList([], admin),

      requestId,
      updatedAt: nowIso(),
      lastSyncAt: nowIso(),

      collections: {
        ticketsRemoteCount: safeNumber(ticketsModule.remoteCount, tickets.length),
        invoicesRemoteCount: safeNumber(facturasModule.remoteCount, invoices.length),
        clientsRemoteCount: admin ? safeNumber(clientesModule.remoteCount, clients.length) : 0,
        usersRemoteCount: admin ? safeNumber(usersModule.remoteCount, users.length) : 0,
      },

      modules,
      partial: Boolean(
        ticketsModule.ok !== true ||
          facturasModule.ok !== true ||
          (admin && clientesModule.ok !== true && clientesModule.skipped !== true) ||
          (admin && usersModule.ok !== true && usersModule.skipped !== true)
      ),
      errors: [
        ticketsModule.error,
        facturasModule.error,
        admin ? clientesModule.error : null,
        admin ? usersModule.error : null,
      ].filter(Boolean),

      meta: {
        role,
        admin,
        requestId,
        updatedAt: nowIso(),
        lastSyncAt: nowIso(),
      },
    },
    {
      role,
    }
  );

  return {
    dashboard,
    modules,
  };
}

export function normalizeHomeDashboardResponse(response = {}) {
  const source = safeObject(
    first(
      response?.dashboard,
      response?.home,
      response?.data?.dashboard,
      response?.payload?.dashboard,
      response?.result?.dashboard,
      response
    )
  );

  const role = normalizeRole(first(source.role, source.rol, source.roles, getCurrentRole()), getCurrentRole());
  const dashboard = normalizeDashboard(source, { role });

  return {
    dashboard,

    summary: dashboard.summary,
    widgets: dashboard.widgets,

    tickets: dashboard.tickets,
    incidencias: dashboard.incidencias,

    invoices: dashboard.invoices,
    facturas: dashboard.facturas,

    clients: dashboard.admin ? dashboard.clients : [],
    clientes: dashboard.admin ? dashboard.clientes : [],
    customers: dashboard.admin ? dashboard.customers : [],

    users: dashboard.admin ? dashboard.users : [],
    usuarios: dashboard.admin ? dashboard.usuarios : [],

    activity: dashboard.activity,
    recent: dashboard.activity,
    recentActivity: dashboard.activity,

    requestId: dashboard.requestId || dashboard.meta?.requestId || "",
    lastSyncAt: dashboard.updatedAt || dashboard.generatedAt || dashboard.lastSyncAt || null,

    hydrated: true,
  };
}

export function resolveHomeWidgetFromDashboard(dashboard = {}, widgetId = "") {
  const target = normalizeKey(safePublicId(widgetId));

  if (!target) return null;

  const normalized = normalizeDashboard(dashboard);
  const widgets = normalizeHomeWidgets(normalized.widgets, normalized.admin);

  return (
    widgets.find((widget) => {
      return [
        getHomeWidgetId(widget),
        widget.id,
        widget.key,
        widget.widgetId,
        widget.widgetKey,
        widget.slug,
        widget.code,
        widget.label,
        widget.title,
        widget.name,
      ]
        .map(safePublicId)
        .map(normalizeKey)
        .filter(Boolean)
        .includes(target);
    }) || null
  );
}

/* =========================================================
   CACHE HYDRATION
========================================================= */

function hydrateDashboardSource(source = {}) {
  const raw = safeObject(source);

  if (!hasOwnKeys(raw)) return null;

  const dashboard = normalizeDashboard(raw, {
    role: getCurrentRole(),
  });

  return {
    dashboard,

    summary: dashboard.summary,
    widgets: dashboard.widgets,

    tickets: dashboard.tickets,
    incidencias: dashboard.incidencias,

    invoices: dashboard.invoices,
    facturas: dashboard.facturas,

    clients: dashboard.admin ? dashboard.clients : [],
    clientes: dashboard.admin ? dashboard.clientes : [],
    customers: dashboard.admin ? dashboard.customers : [],

    users: dashboard.admin ? dashboard.users : [],
    usuarios: dashboard.admin ? dashboard.usuarios : [],

    activity: dashboard.activity,
    recent: dashboard.activity,
    recentActivity: dashboard.activity,

    requestId: dashboard.requestId || dashboard.meta?.requestId || "",
    lastSyncAt: dashboard.updatedAt || dashboard.generatedAt || dashboard.lastSyncAt || null,

    hydrated: true,
  };
}

export function hydrateHomeFromCache() {
  const fromStore = hydrateDashboardSource(getHomeDashboardStore?.());

  if (fromStore) return fromStore;

  const fromState = hydrateDashboardSource(homeState?.dashboard);

  if (fromState) return fromState;

  return {
    dashboard: {},
    summary: {},
    widgets: [],

    tickets: [],
    incidencias: [],

    invoices: [],
    facturas: [],

    clients: [],
    clientes: [],
    customers: [],

    users: [],
    usuarios: [],

    activity: [],
    recent: [],
    recentActivity: [],

    requestId: "",
    lastSyncAt: null,

    hydrated: false,
  };
}

/* =========================================================
   REQUEST
========================================================= */

function nextLoadSeq() {
  loadSeq += 1;
  return loadSeq;
}

function isActiveLoadSeq(seq = 0) {
  return seq === loadSeq;
}

function requestId() {
  return `home_${Date.now()}_${loadSeq}`;
}

export async function fetchHomeDashboardRequest({
  includeUsers = undefined,
  includeClientes = undefined,
  includeClients = undefined,
  params = null,
  timeout = HOME_TIMEOUT,
} = {}) {
  const role = getCurrentRole();
  const admin = role === "admin";
  const id = requestId();

  runtime.lastRequestAt = nowIso();
  runtime.lastRequestId = id;

  const listParams = mergeParams(DEFAULT_LIST_PARAMS, params);

  const [ticketsModule, facturasModule, clientesModule, usersModule] = await Promise.all([
    loadListModule({
      name: "tickets",
      endpoint: ENDPOINTS.ticketsList,
      aliases: ["tickets", "incidencias"],
      projector: projectTicketDto,
      params: listParams,
      timeout,
      required: true,
    }),
    loadListModule({
      name: "facturas",
      endpoint: ENDPOINTS.facturasList,
      aliases: ["facturas", "invoices"],
      projector: projectInvoiceDto,
      params: listParams,
      timeout,
      required: true,
    }),
    loadListModule({
      name: "clientes",
      endpoint: ENDPOINTS.clientesList,
      aliases: ["clientes", "clients", "customers"],
      projector: projectClientDto,
      params: listParams,
      timeout,
      required: false,
      skipped: !canRequestClientsModule({
        includeClientes,
        includeClients,
      }),
    }),
    loadListModule({
      name: "users",
      endpoint: ENDPOINTS.usersList,
      aliases: ["users", "usuarios"],
      projector: projectUserDto,
      params: listParams,
      timeout,
      required: false,
      skipped: !canRequestUsersModule({
        includeUsers,
      }),
    }),
  ]);

  runtime.lastResponseAt = nowIso();

  const requiredFailed = ticketsModule.ok !== true && facturasModule.ok !== true;

  if (requiredFailed) {
    const error = new Error("HOME_API_CORE_MODULES_FAILED");
    error.modules = {
      tickets: moduleSnapshot(ticketsModule),
      facturas: moduleSnapshot(facturasModule),
      clientes: moduleSnapshot(clientesModule),
      users: moduleSnapshot(usersModule),
    };
    error.status = ticketsModule.status || facturasModule.status || 0;
    error.code = "HOME_API_CORE_MODULES_FAILED";
    throw error;
  }

  const local = buildLocalDashboard({
    ticketsModule,
    facturasModule,
    clientesModule,
    usersModule,
    role,
    requestId: id,
  });

  runtime.modules = local.modules;

  return {
    endpoint: HOME_DASHBOARD_ENDPOINT,
    requestId: id,
    role,
    admin,

    dashboard: local.dashboard,
    modules: local.modules,

    updatedAt: nowIso(),
    generatedAt: nowIso(),
    lastSyncAt: nowIso(),
  };
}

export async function getHomeDashboardRequest(options = {}) {
  const response = await fetchHomeDashboardRequest(options);
  return normalizeHomeDashboardResponse(response).dashboard;
}

export async function getHomeWidgetByIdRequest(widgetId = "", options = {}) {
  const dashboard = await getHomeDashboardRequest(options);
  return resolveHomeWidgetFromDashboard(dashboard, widgetId);
}

/* =========================================================
   LOAD DASHBOARD
========================================================= */

export async function loadHomeDashboard({
  force = false,
  returnStaleOnError = true,
  includeUsers = undefined,
  includeClientes = undefined,
  includeClients = undefined,
  params = null,
  timeout = HOME_TIMEOUT,
} = {}) {
  const seq = nextLoadSeq();

  runtime.loading = true;
  runtime.refreshing = Boolean(force);

  try {
    const response = await fetchHomeDashboardRequest({
      includeUsers,
      includeClientes,
      includeClients,
      params,
      timeout,
    });

    const normalized = normalizeHomeDashboardResponse(response);
    const dashboard = normalized.dashboard;

    if (!isActiveLoadSeq(seq)) {
      const cached = hydrateHomeFromCache();
      return cached.dashboard || {};
    }

    runtime.lastLoadedAt = nowIso();
    runtime.lastRequestId = normalized.requestId || runtime.lastRequestId || "";
    runtime.lastError = null;

    return dashboard;
  } catch (error) {
    runtime.lastError = normalizeError(error);

    if (returnStaleOnError) {
      const cached = hydrateHomeFromCache();

      if (cached.hydrated && hasOwnKeys(cached.dashboard)) {
        return normalizeDashboard(cached.dashboard, {
          role: getCurrentRole(),
        });
      }
    }

    throw error;
  } finally {
    if (isActiveLoadSeq(seq)) {
      runtime.loading = false;
      runtime.refreshing = false;
    }
  }
}

export async function refreshHomeDashboard(options = {}) {
  return loadHomeDashboard({
    ...safeObject(options),
    force: true,
  });
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHomeApiSnapshot() {
  const dashboard = safeObject(hydrateHomeFromCache().dashboard);

  return {
    version: HOME_API_VERSION,

    endpoint: HOME_DASHBOARD_ENDPOINT,
    legacyEndpoint: HOME_DASHBOARD_LEGACY_ENDPOINT,

    endpoints: {
      ticketsList: ENDPOINTS.ticketsList,
      facturasList: ENDPOINTS.facturasList,
      clientesList: ENDPOINTS.clientesList,
      usersList: ENDPOINTS.usersList,
    },

    timeout: HOME_TIMEOUT,

    role: getCurrentRole(),
    admin: isAdmin(),

    runtime: {
      loading: runtime.loading,
      refreshing: runtime.refreshing,

      lastRequestAt: runtime.lastRequestAt,
      lastResponseAt: runtime.lastResponseAt,
      lastLoadedAt: runtime.lastLoadedAt,

      lastRequestId: runtime.lastRequestId,
      lastError: runtime.lastError,

      modules: {
        tickets: moduleSnapshot(runtime.modules.tickets),
        facturas: moduleSnapshot(runtime.modules.facturas),
        clientes: moduleSnapshot(runtime.modules.clientes),
        users: moduleSnapshot(runtime.modules.users),
      },
    },

    cache: {
      hydrated: hydrateHomeFromCache().hydrated,
      dashboardRole: dashboard.role || null,
      dashboardAdmin: dashboard.admin === true,
      ticketsCount: safeArray(dashboard.tickets).length,
      invoicesCount: safeArray(dashboard.invoices).length,
      usersCount: dashboard.admin ? safeArray(dashboard.users).length : 0,
      clientsCount: dashboard.admin ? safeArray(dashboard.clients).length : 0,
      activityCount: safeArray(dashboard.activity).length,

      partial: Boolean(dashboard.partial),
      updatedAt: dashboard.updatedAt || null,
    },

    state: {
      loading: Boolean(homeState?.loading),
      refreshing: Boolean(homeState?.refreshing),
      loaded: Boolean(homeState?.loaded),
      hydrated: Boolean(homeState?.hydrated),

      requestId: safeText(homeState?.requestId, ""),
      lastSyncAt: homeState?.lastSyncAt || null,
      error: redact(homeState?.error || ""),
    },

    policy: {
      apiOnly: true,

      singleHttpLayer: true,
      usesCoreHttpOnly: true,
      noFetch: true,
      noApiClientParallel: true,

      noDom: true,
      noCss: true,
      noStoragePersistent: true,
      noEvents: true,
      noRouter: true,

      noDashboardEndpoint: true,
      noStatsEndpoints: true,

      ticketsFromListEndpoint: true,
      facturasFromListEndpoint: true,
      usersOnlyAdmin: true,
      clientesOnlyAdmin: true,

      distinctUserAdminHome: true,
      roleAwareCache: true,

      routesFromConfig: true,
      adminRoutesFromConfig: true,
      blockedRoutesFromConfig: true,

      projectsLargeBackendObjectsToLightHomeDTO: true,
      preservesTicketInvoiceRelations: true,
      preservesTicketTechnicianData: true,
      resolvesTechnicianAvatarFromUsers: true,
      paidInvoiceAmountOnlyInModel: true,

      noRawBackendPayloadInDashboard: true,
      stripsCosmosMetadata: true,
      noEmailAsUserIdentity: true,
      noEmailAsClientIdentity: true,

      coreModulesRequired: true,
      noHomeRoute: true,
      snapshotRedacted: true,
    },
  };
}

/* =========================================================
   PUBLIC API
========================================================= */

export const HomeApi = Object.freeze({
  version: HOME_API_VERSION,

  endpoints: Object.freeze({
    dashboard: HOME_DASHBOARD_ENDPOINT,
    legacyDashboard: HOME_DASHBOARD_LEGACY_ENDPOINT,
    ticketsList: ENDPOINTS.ticketsList,
    facturasList: ENDPOINTS.facturasList,
    clientesList: ENDPOINTS.clientesList,
    usersList: ENDPOINTS.usersList,
  }),

  timeout: HOME_TIMEOUT,

  getHomeApiClient,

  normalizeDashboard,
  normalizeHomeDashboardResponse,
  resolveHomeWidgetFromDashboard,

  fetchHomeDashboardRequest,
  getHomeDashboardRequest,
  getHomeWidgetByIdRequest,

  hydrateHomeFromCache,

  loadHomeDashboard,
  refreshHomeDashboard,

  getHomeApiSnapshot,
});

export default HomeApi;
