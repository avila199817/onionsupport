/* =========================================================
   Onion Support - Home Model
   Archivo: /src/views/home/home.model.js

   Responsabilidad:
   - Modelo puro de datos para Home.
   - Normalizar DTOs ligeros ya preparados por home.api.js.
   - Mantener contrato estable para homeView.js, selectors, store y template.
   - Ser la fuente única de normalización de colecciones Home.
   - Generar summary estable desde colecciones completas.
   - Limitar sólo listas recientes/tabla mediante helpers explícitos.
   - Calcular facturación cobrada sólo con facturas pagadas.
   - Resolver técnico asignado y avatar desde ticket/usuarios cuando exista.
   - Preservar avatar de técnico ya enriquecido por /api/tickets.
   - Resolver facturas vinculadas a incidencias.
   - Preservar user/sidebarUser/displayName/avatar/initials en payload final.
   - User nunca conserva usuarios/clientes ni métricas admin.
   - No conservar raw/payload/response/data backend.
   - No conservar metadata Cosmos.
   - No usar email como identidad de user/cliente.
   - Sin AppCore.
   - Sin Router.
   - Sin Auth.
   - Sin HTTP.
   - Sin Storage.
   - Sin DOM.
   - Sin CSS.
   - Sin rutas inventadas.
   - Sin /home.
========================================================= */

import {
  ROUTES,
  isAdminRoute as configIsAdminRoute,
  isBlockedRoutePath as configIsBlockedRoutePath,
  normalizeRoutePath as configNormalizeRoutePath,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../../core/config.js";

export const HOME_MODEL_VERSION = "home.model.v12.template-contract";

export const DEFAULT_HOME_PAGE = 1;
export const DEFAULT_HOME_PAGE_SIZE = 5;
export const DEFAULT_HOME_RECENT_LIMIT = 5;

export const HOME_ENTITY_TYPES = Object.freeze({
  WIDGET: "widget",
  TICKET: "ticket",
  INVOICE: "invoice",
  USER: "user",
  CLIENT: "client",
  ACTIVITY: "activity",
});

export const HOME_STATUS_KEYS = Object.freeze({
  PENDING: "pending",
  OPEN: "open",
  PROGRESS: "progress",
  RESOLVED: "resolved",
  CLOSED: "closed",
});

export const HOME_INVOICE_STATUS_KEYS = Object.freeze({
  PAID: "paid",
  PENDING: "pending",
  OVERDUE: "overdue",
  PARTIAL: "partial",
  CANCELLED: "cancelled",
  DRAFT: "draft",
});

const RAW_KEYS = new Set([
  "raw",
  "response",
  "payload",
  "data",
  "body",
  "request",
  "headers",
  "config",
]);

const COSMOS_META_KEYS = new Set([
  "_id",
  "_rid",
  "_self",
  "_etag",
  "_attachments",
  "_ts",
  "_lsn",
  "_metadata",
]);

const SENSITIVE_KEY_PARTS = Object.freeze([
  "token",
  "authorization",
  "cookie",
  "password",
  "passwd",
  "pwd",
  "secret",
  "credential",
  "jwt",
  "bearer",
  "refresh",
  "apikey",
  "privatekey",
  "connectionstring",
  "sas",
  "otp",
  "totp",
  "mfa",
  "twofa",
  "backupcode",
  "sessionid",
  "email",
  "correo",
  "mail",
  "phone",
  "telefono",
  "address",
  "direccion",
  "nif",
  "dni",
  "iban",
  "bank",
  "cuenta",
  "account",
  "useragent",
]);

const SENSITIVE_KEY_EXACT = new Set([
  "session",
  "ip",
  "ipraw",
]);

const SENSITIVE_QUERY_RE =
  /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i;

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/i;
const JWT_RE = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

const ADMIN_ENTITY_RE =
  /(^|[\s._/-])(clientes?|clients?|customers?|usuarios?|users?|members?|directorio|directory)([\s._/-]|$)/i;

const HOME_TEXT_LIMIT = 180;
const HOME_TITLE_LIMIT = 120;
const HOME_ID_LIMIT = 160;
const HOME_AVATAR_LIMIT = 2048;

const EMPTY_COLLECTION = Object.freeze({
  items: [],
  visibleCount: 0,
  total: 0,
  totalCount: 0,
  remoteCount: 0,
});

/* =========================================================
   SAFE HELPERS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasKeys(value = {}) {
  return Boolean(isObject(value) && Object.keys(value).length > 0);
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function compactText(value = "", fallback = "", max = HOME_TEXT_LIMIT) {
  const output = safeText(value, fallback);
  const limit = Math.max(1, safeNumber(max, HOME_TEXT_LIMIT));

  if (!output) return fallback;
  if (output.length <= limit) return output;

  return `${output.slice(0, Math.max(1, limit - 1)).trim()}…`;
}

function safeNumber(value, fallback = 0) {
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

function firstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }

  return [];
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function hasSensitiveQuery(value = "") {
  return SENSITIVE_QUERY_RE.test(String(value || ""));
}

function redact(value = "") {
  return String(value || "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(JWT_RE, "***");
}

function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function normalizeHomeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function normalizeSensitiveKey(value = "") {
  return normalizeHomeKey(value).replace(/_/g, "");
}

function normalizeRole(value = "", fallback = "") {
  if (Array.isArray(value)) {
    const roles = value.map((item) => normalizeRole(item, "")).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return fallback;
  }

  const role = String(value || "").trim().toLowerCase();

  if (role === "admin") return "admin";
  if (role === "user") return "user";

  return fallback;
}

function isSensitiveKey(key = "") {
  const clean = normalizeSensitiveKey(key);

  if (!clean) return false;
  if (SENSITIVE_KEY_EXACT.has(clean)) return true;

  return SENSITIVE_KEY_PARTS.some((part) => clean.includes(part));
}

function isEmailLike(value = "") {
  const output = safeText(value, "");
  return Boolean(output && EMAIL_RE.test(output));
}

function firstVisual(values = [], fallback = "Sin nombre") {
  for (const value of safeArray(values)) {
    if (isObject(value)) continue;

    const output = safeText(value, "");

    if (!output || isEmailLike(output)) continue;

    return compactText(redact(output), fallback, HOME_TITLE_LIMIT);
  }

  return fallback;
}

function safePublicId(value = "") {
  const output = safeText(value, "");

  if (!output) return "";
  if (isEmailLike(output)) return "";
  if (hasSensitiveQuery(output)) return "";
  if (/Bearer\s+/i.test(output)) return "";

  return compactText(redact(output), "", HOME_ID_LIMIT);
}

function sanitizeHomeValue(value, keyHint = "") {
  if (RAW_KEYS.has(keyHint)) return undefined;
  if (COSMOS_META_KEYS.has(keyHint)) return undefined;
  if (isSensitiveKey(keyHint)) return undefined;

  if (typeof value === "string") return redact(value);

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeHomeValue(item))
      .filter((item) => item !== undefined);
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (RAW_KEYS.has(key)) continue;
      if (COSMOS_META_KEYS.has(key)) continue;
      if (isSensitiveKey(key)) continue;

      const clean = sanitizeHomeValue(item, key);

      if (clean !== undefined) {
        output[key] = clean;
      }
    }

    return output;
  }

  return value;
}

function sanitizeHomeRecord(value = {}) {
  return safeObject(sanitizeHomeValue(value), {});
}

function safeImageSrc(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";
  if (raw.length > HOME_AVATAR_LIMIT) return "";
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

function firstSafeImageSrc(...candidates) {
  for (const candidate of candidates.flat(Infinity)) {
    const safe = safeImageSrc(candidate);
    if (safe) return safe;
  }

  return "";
}

function avatarCandidatesFromObject(value = null) {
  const source = safeObject(value, null);

  if (!source) return [];

  return [
    source.avatarUrl,
    source.avatarURL,
    source.avatar_url,
    source.avatar,

    source.assignedToAvatarUrl,
    source.assignedToAvatar,
    source.technicianAvatarUrl,
    source.technicianAvatar,
    source.tecnicoAvatarUrl,
    source.tecnicoAvatar,
    source.agentAvatarUrl,
    source.agentAvatar,

    source.photoUrl,
    source.photoURL,
    source.photo_url,
    source.photo,

    source.pictureUrl,
    source.pictureURL,
    source.picture_url,
    source.picture,

    source.imageUrl,
    source.imageURL,
    source.image_url,
    source.image,

    source.fotoUrl,
    source.fotoURL,
    source.foto_url,
    source.foto,

    source.imagenUrl,
    source.imagenURL,
    source.imagen_url,
    source.imagen,

    source.url,
    source.href,
    source.src,
    source.path,
  ];
}

function avatarFromObject(value = null) {
  const source = safeObject(value, null);
  if (!source) return "";

  return firstSafeImageSrc(
    avatarCandidatesFromObject(source),
    avatarCandidatesFromObject(source.profile),
    avatarCandidatesFromObject(source.media),
    avatarCandidatesFromObject(source.account)
  );
}

function toTimestamp(value = null) {
  if (!value) return 0;

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9999999999 ? value : value * 1000;
  }

  const raw = safeText(value, "");
  if (!raw) return 0;

  const numeric = Number(raw);

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 9999999999 ? numeric : numeric * 1000;
  }

  const esDate = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*|\s+-\s+|\s+)?(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (esDate) {
    const [, dd, mm, yyyy, hh = "0", min = "0", ss = "0"] = esDate;
    const date = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(min),
      Number(ss)
    );

    const time = date.getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  const date = new Date(raw.includes("T") || raw.includes("Z") ? raw : `${raw}T00:00:00`);
  const time = date.getTime();

  return Number.isNaN(time) ? 0 : time;
}

function uniqueStrings(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => safePublicId(value))
        .filter(Boolean)
    ),
  ];
}

export function uniqueHomeBy(items = [], picker = (item) => item) {
  const seen = new Set();
  const output = [];

  for (const item of safeArray(items)) {
    const raw = safePublicId(picker(item));
    const key = raw ? normalizeHomeKey(raw) : "";

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

function sortByNewest(items = [], picker = (item) => item?.updatedAt || item?.createdAt) {
  return [...safeArray(items)].sort((a, b) => {
    const left = toTimestamp(picker(a));
    const right = toTimestamp(picker(b));

    if (right !== left) return right - left;

    return safeText(first(b?.id, b?.ticketId, b?.invoiceId, ""), "").localeCompare(
      safeText(first(a?.id, a?.ticketId, a?.invoiceId, ""), ""),
      "es-ES",
      {
        numeric: true,
        sensitivity: "base",
      }
    );
  });
}

function maxNumber(...values) {
  const numbers = values
    .map((value) => safeNumber(value, NaN))
    .filter(Number.isFinite);

  return numbers.length ? Math.max(...numbers) : 0;
}

function roundMoney(value = 0) {
  const number = safeNumber(value, NaN);
  return Number.isFinite(number)
    ? Math.round((number + Number.EPSILON) * 100) / 100
    : 0;
}

function initialsFromName(value = "") {
  const output = safeText(value, "");
  const parts = output.split(/\s+/).filter(Boolean);

  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase() || "?";
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

    if (!path.startsWith("/")) path = `/${path}`;
    if (path.length > 1) path = path.replace(/\/+$/g, "") || "/";

    return path || "";
  }
}

function isBlockedRoute(value = "") {
  const path = routePathOnly(value);

  if (!path) return true;

  try {
    return configIsBlockedRoutePath(path) === true;
  } catch {
    return false;
  }
}

function safeRoute(value = "", fallback = "") {
  const input = routeInput(value);
  const safeFallback = safeText(fallback, "");

  if (!input) return safeFallback;
  if (!input.startsWith("/")) return safeFallback;
  if (input.startsWith("//")) return safeFallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) return safeFallback;
  if (/[\r\n\t\\]/.test(input)) return safeFallback;
  if (hasSensitiveQuery(input)) return safeFallback;

  const pathOnly = routePathOnly(input);

  if (!pathOnly) return safeFallback;
  if (isBlockedRoute(pathOnly)) return safeFallback;

  return `${pathOnly}${routeSuffix(input)}`;
}

function routeFromCore(name = "", fallback = "") {
  return safeRoute(ROUTES?.[name], "") || safeRoute(fallback, "");
}

const HOME_ROUTES = Object.freeze({
  INCIDENCIAS: routeFromCore("incidencias", "/incidencias"),
  FACTURAS: routeFromCore("facturas", "/facturas"),
  CLIENTES: routeFromCore("clientes", "/clientes"),
  USUARIOS: routeFromCore("usuarios", ""),
});

function routePath(route = "") {
  return safeRoute(route, "").split("?")[0].split("#")[0] || "";
}

function isAdminOnlyRoute(route = "") {
  const path = routePath(route);
  const clientes = routePath(HOME_ROUTES.CLIENTES);
  const usuarios = routePath(HOME_ROUTES.USUARIOS);

  if (!path) return false;

  try {
    if (configIsAdminRoute(path) === true) return true;
  } catch {
    // fallback mínimo
  }

  return (
    Boolean(clientes && (path === clientes || path.startsWith(`${clientes}/`))) ||
    Boolean(usuarios && (path === usuarios || path.startsWith(`${usuarios}/`)))
  );
}

function isAdminEntityValue(value = "") {
  return ADMIN_ENTITY_RE.test(String(value || "").toLowerCase());
}

/* =========================================================
   ROLE SANITIZE
========================================================= */

function emptyCollection() {
  return {
    ...EMPTY_COLLECTION,
    items: [],
  };
}

function sanitizeSummaryForRole(summary = {}, admin = false) {
  const output = {
    ...safeObject(summary),
  };

  if (!admin) {
    output.usersCount = 0;
    output.usuariosCount = 0;
    output.totalUsers = 0;
    output.totalUsuarios = 0;
    output.usersTotal = 0;
    output.usuariosTotal = 0;
    output.visibleUsersCount = 0;
    output.visibleUsuariosCount = 0;

    output.clientsCount = 0;
    output.clientesCount = 0;
    output.customersCount = 0;
    output.totalClients = 0;
    output.totalClientes = 0;
    output.totalCustomers = 0;
    output.clientsTotal = 0;
    output.clientesTotal = 0;
    output.customersTotal = 0;
    output.visibleClientsCount = 0;
    output.visibleClientesCount = 0;
    output.visibleCustomersCount = 0;
  }

  return sanitizeHomeRecord(output);
}

function isAdminOnlyActivity(item = {}) {
  const raw = safeObject(item);
  const type = normalizeHomeKey(first(raw.type, raw.kind, raw.category, ""));
  const route = safeRoute(first(raw.route, raw.href, raw.link, raw.to, ""), "");

  const identity = safeText(
    [
      raw.entity,
      raw.resource,
      raw.collection,
      raw.targetType,
      raw.meta?.entity,
      raw.meta?.type,
      type,
      route,
    ]
      .filter(Boolean)
      .join(" "),
    ""
  );

  return (
    ["client", "cliente", "customer", "user", "usuario", "member"].includes(type) ||
    isAdminOnlyRoute(route) ||
    isAdminEntityValue(identity)
  );
}

function filterActivityForRole(items = [], admin = false) {
  const rows = safeArray(items);
  return admin ? rows : rows.filter((item) => !isAdminOnlyActivity(item));
}

function isAdminOnlyWidget(item = {}) {
  const raw = safeObject(item);
  const route = safeRoute(first(raw.route, raw.href, raw.link, raw.to, ""), "");

  const identity = safeText(
    [
      raw.widgetId,
      raw.widgetKey,
      raw.id,
      raw.key,
      raw.slug,
      raw.code,
      raw.type,
      raw.kind,
      raw.variant,
      raw.category,
      raw.title,
      raw.name,
      route,
    ]
      .filter(Boolean)
      .join(" "),
    ""
  );

  return isAdminOnlyRoute(route) || isAdminEntityValue(identity);
}

function filterWidgetsForRole(items = [], admin = false) {
  const rows = safeArray(items);
  return admin ? rows : rows.filter((item) => !isAdminOnlyWidget(item));
}

/* =========================================================
   ENVELOPES / COLLECTIONS
========================================================= */

export function looksLikeHomeDashboard(value = null) {
  const object = safeObject(value, null);

  if (!object) return false;

  return Boolean(
    "dashboard" in object ||
      "summary" in object ||
      "stats" in object ||
      "metrics" in object ||
      "totals" in object ||
      "counts" in object ||
      "widgets" in object ||
      "cards" in object ||
      "tickets" in object ||
      "incidencias" in object ||
      "facturas" in object ||
      "invoices" in object ||
      "users" in object ||
      "usuarios" in object ||
      "clients" in object ||
      "clientes" in object ||
      "customers" in object ||
      "activity" in object ||
      "recent" in object ||
      "totalTickets" in object ||
      "facturasTotal" in object
  );
}

export function unwrapHomeEnvelope(payload = null, depth = 0) {
  if (payload === null || payload === undefined) return null;
  if (depth > 6) return payload;
  if (Array.isArray(payload)) return payload;

  const object = safeObject(payload, null);

  if (!object) return payload;
  if (looksLikeHomeDashboard(object)) return object;

  const nested = first(
    object.dashboard,
    object.home,
    object.data,
    object.payload,
    object.result,
    object.response,
    object.body
  );

  if (nested !== null && nested !== undefined) {
    return unwrapHomeEnvelope(nested, depth + 1);
  }

  return object;
}

export function normalizeHomeCollectionSource(value = null, aliases = []) {
  if (Array.isArray(value)) {
    return {
      items: value,
      visibleCount: value.length,
      total: value.length,
      totalCount: value.length,
      remoteCount: value.length,
    };
  }

  const object = safeObject(value, null);

  if (!object) return emptyCollection();

  let items = safeArray(
    first(
      object.items,
      object.rows,
      object.records,
      object.results,
      object.docs,
      object.documents,
      object.value,
      object.list,
      Array.isArray(object.data) ? object.data : null,
      Array.isArray(object.payload) ? object.payload : null,
      Array.isArray(object.result) ? object.result : null,
      Array.isArray(object.response) ? object.response : null,
      []
    )
  );

  if (!items.length) {
    for (const alias of safeArray(aliases)) {
      const candidate = object?.[alias];

      if (Array.isArray(candidate)) {
        items = candidate;
        break;
      }

      if (isObject(candidate)) {
        const normalized = normalizeHomeCollectionSource(candidate, aliases);

        if (normalized.items.length || normalized.remoteCount > 0) {
          items = normalized.items;
          break;
        }
      }
    }
  }

  const total = Math.max(
    items.length,
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
        items.length
      ),
      items.length
    )
  );

  return {
    items,
    visibleCount: items.length,
    total,
    totalCount: total,
    remoteCount: total,
  };
}

export function pickHomeCollectionBlock(source = {}, aliases = []) {
  const raw = safeObject(source);

  const sources = [
    raw,
    raw.collections,
    raw.resources,
    raw.lists,
    raw.dashboard,
    raw.home,
    raw.data,
    raw.payload,
    raw.result,
    raw.response,
  ].filter(hasKeys);

  for (const candidate of sources) {
    for (const alias of safeArray(aliases)) {
      const direct = candidate?.[alias];

      if (Array.isArray(direct)) {
        return normalizeHomeCollectionSource(direct, aliases);
      }

      if (isObject(direct)) {
        const normalized = normalizeHomeCollectionSource(direct, aliases);

        if (normalized.items.length || normalized.remoteCount > 0) {
          return normalized;
        }
      }
    }
  }

  return emptyCollection();
}

/* =========================================================
   USERS / CLIENTS
========================================================= */

export function getHomeUserId(item = {}) {
  const raw = safeObject(item);

  return safePublicId(
    first(
      raw.userId,
      raw.usuarioId,
      raw.uid,
      raw.sub,
      raw.id,
      raw.username,
      raw.userName,
      raw.slug
    )
  );
}

export function normalizeHomeUser(item = {}) {
  const source = safeObject(item);
  const id = getHomeUserId(source);

  const displayName = firstVisual(
    [
      source.displayName,
      source.fullName,
      source.name,
      source.nombre,
      source.profile?.displayName,
      source.profile?.fullName,
      source.profile?.name,
      source.profile?.nombre,
      source.profile?.publicName,
      source.username,
      source.userName,
      source.slug,
      id ? `Usuario ${id}` : "",
    ],
    "Usuario"
  );

  const role =
    normalizeRole(first(source.role, source.rol, source.roles, source.type, ""), "") ||
    "user";

  const avatar = avatarFromObject(source);

  return sanitizeHomeRecord({
    id,
    userId: id,
    usuarioId: id,

    displayName,
    fullName: displayName,
    name: displayName,
    nombre: displayName,

    username: safePublicId(first(source.username, source.userName, source.slug, id)),
    slug: safePublicId(first(source.slug, source.lookup?.slug, source.profile?.slug, "")),

    role,
    rol: role,
    roles: [role],

    active: first(source.active, source.isActive, source.enabled, true),
    isActive: first(source.active, source.isActive, source.enabled, true),

    avatar,
    avatarUrl: avatar,
    photoUrl: avatar,
    pictureUrl: avatar,
    imageUrl: avatar,
    hasAvatar: Boolean(avatar),

    createdAt: source.createdAt,
    updatedAt: first(source.updatedAt, source.modifiedAt, source.lastLoginAt),
    lastLoginAt: source.lastLoginAt,
  });
}

export function normalizeHomeUsers(items = []) {
  return sortByNewest(
    uniqueHomeBy(
      safeArray(items).map((item) => normalizeHomeUser(item)).filter((item) => item.id || item.displayName),
      getHomeUserId
    ),
    (item) => first(item.updatedAt, item.lastLoginAt, item.createdAt)
  );
}

export function getHomeClientId(item = {}) {
  const raw = safeObject(item);

  return safePublicId(
    first(
      raw.clientId,
      raw.clienteId,
      raw.customerId,
      raw.userId,
      raw.id,
      raw.slug
    )
  );
}

export function normalizeHomeClient(item = {}) {
  const source = safeObject(item);
  const id = getHomeClientId(source);

  const name = firstVisual(
    [
      source.name,
      source.nombre,
      source.displayName,
      source.razonSocial,
      source.companyName,
      source.company,
      source.nombreContacto,
      source.contacto?.name,
      source.contacto?.nombre,
      source.slug,
      id ? `Cliente ${id}` : "",
    ],
    "Cliente"
  );

  return sanitizeHomeRecord({
    id,
    clientId: id,
    clienteId: id,
    customerId: id,
    userId: safePublicId(source.userId),

    name,
    nombre: name,
    displayName: name,
    razonSocial: name,

    active: first(source.active, source.isActive, source.enabled, true),
    isActive: first(source.active, source.isActive, source.enabled, true),

    createdAt: source.createdAt,
    updatedAt: first(source.updatedAt, source.modifiedAt),
  });
}

export function normalizeHomeClients(items = []) {
  return sortByNewest(
    uniqueHomeBy(
      safeArray(items).map((item) => normalizeHomeClient(item)).filter((item) => item.id || item.name),
      getHomeClientId
    ),
    (item) => first(item.updatedAt, item.createdAt)
  );
}

/* =========================================================
   INVOICES
========================================================= */

export function getHomeInvoiceId(item = {}) {
  const raw = safeObject(item);

  return safePublicId(
    first(
      raw.invoiceId,
      raw.facturaId,
      raw.number,
      raw.numeroFacturaLegal,
      raw.numeroFactura,
      raw.numero,
      raw.invoiceNumber,
      raw.code,
      raw.id
    )
  );
}

export function getHomeInvoiceAmount(item = {}) {
  const raw = safeObject(item);

  return safeNumber(
    first(
      raw.totales?.total,
      raw.payment?.amount,
      raw.total,
      raw.amount,
      raw.importe,
      raw.totalFactura,
      raw.facturaTotal,
      raw.facturaImporte,
      raw.importeFactura,
      raw.invoiceAmount,
      raw.totalAmount,
      raw.price,
      raw.subtotal,
      raw.base,
      0
    ),
    0
  );
}

export function getHomeInvoiceCurrency(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.currency,
      raw.moneda,
      raw.totales?.currency,
      raw.payment?.currency,
      "EUR"
    ),
    "EUR"
  ).toUpperCase();
}

export function getHomeInvoiceStatusKey(item = {}) {
  const raw = safeObject(item);

  const key = normalizeHomeKey(
    first(
      raw.paymentStatus,
      raw.estadoPago,
      raw.payment?.status,
      raw.status,
      raw.estado,
      "pending"
    )
  );

  if (["paid", "pagada", "pagado", "cobrada", "cobrado", "abonada", "abonado"].includes(key)) {
    return HOME_INVOICE_STATUS_KEYS.PAID;
  }

  if (["overdue", "vencida", "vencido"].includes(key)) return HOME_INVOICE_STATUS_KEYS.OVERDUE;
  if (["partial", "parcial", "pago_parcial", "partially_paid"].includes(key)) return HOME_INVOICE_STATUS_KEYS.PARTIAL;
  if (["cancelled", "canceled", "cancelada", "cancelado", "void"].includes(key)) return HOME_INVOICE_STATUS_KEYS.CANCELLED;
  if (["draft", "borrador"].includes(key)) return HOME_INVOICE_STATUS_KEYS.DRAFT;

  return HOME_INVOICE_STATUS_KEYS.PENDING;
}

export function getHomeInvoiceStatusLabel(item = {}) {
  const key = getHomeInvoiceStatusKey(item);

  if (key === HOME_INVOICE_STATUS_KEYS.PAID) return "Pagada";
  if (key === HOME_INVOICE_STATUS_KEYS.OVERDUE) return "Vencida";
  if (key === HOME_INVOICE_STATUS_KEYS.PARTIAL) return "Parcial";
  if (key === HOME_INVOICE_STATUS_KEYS.CANCELLED) return "Cancelada";
  if (key === HOME_INVOICE_STATUS_KEYS.DRAFT) return "Borrador";

  return "Pendiente";
}

export function isHomeInvoicePaid(item = {}) {
  return getHomeInvoiceStatusKey(item) === HOME_INVOICE_STATUS_KEYS.PAID;
}

export function isHomeInvoicePendingLike(item = {}) {
  return [
    HOME_INVOICE_STATUS_KEYS.PENDING,
    HOME_INVOICE_STATUS_KEYS.OVERDUE,
    HOME_INVOICE_STATUS_KEYS.PARTIAL,
  ].includes(getHomeInvoiceStatusKey(item));
}

export function getHomeInvoicePaidAmount(item = {}) {
  const raw = safeObject(item);

  if (!isHomeInvoicePaid(raw)) return 0;

  return safeNumber(
    first(
      raw.payment?.paidAmount,
      raw.totales?.pagado,
      raw.paidAmount,
      raw.amountPaid,
      raw.pagado,
      getHomeInvoiceAmount(raw)
    ),
    0
  );
}

export function getHomeInvoicePendingAmount(item = {}) {
  const raw = safeObject(item);

  if (!isHomeInvoicePendingLike(raw)) return 0;

  const explicit = first(
    raw.payment?.pendingAmount,
    raw.totales?.pendiente,
    raw.pendingAmount,
    raw.amountPending,
    raw.pendiente,
    null
  );

  if (explicit !== null && explicit !== undefined) {
    return Math.max(0, safeNumber(explicit, 0));
  }

  return Math.max(0, getHomeInvoiceAmount(raw) - getHomeInvoicePaidAmount(raw));
}

export function getHomeInvoiceTicketIdentities(item = {}) {
  const raw = safeObject(item);

  return uniqueStrings([
    raw.ticketId,
    raw.incidenciaId,
    raw.ticket?.id,
    raw.ticket?.ticketId,
    raw.incidencia?.id,
    raw.incidencia?.ticketId,
    raw.incidencia?.incidenciaId,
    raw.relations?.ticket?.id,
    raw.relations?.ticket?.ticketId,
    raw.relations?.ticket?.partitionKey,
    raw.ticketRef?.id,
    raw.ticketRef?.ticketId,
    raw.ticketRef?.partitionKey,
  ]);
}

export function normalizeHomeInvoice(item = {}) {
  const source = safeObject(item);
  const id = getHomeInvoiceId(source);
  const amount = getHomeInvoiceAmount(source);
  const paidAmount = roundMoney(getHomeInvoicePaidAmount(source));
  const pendingAmount = roundMoney(getHomeInvoicePendingAmount(source));
  const statusKey = getHomeInvoiceStatusKey(source);
  const currency = getHomeInvoiceCurrency(source);

  const title = compactText(
    first(
      source.title,
      source.name,
      source.conceptoPrincipal,
      source.concepto,
      source.descripcionPrincipal,
      id ? `Factura ${id}` : "Factura"
    ),
    id ? `Factura ${id}` : "Factura",
    HOME_TITLE_LIMIT
  );

  const ticketIdentities = getHomeInvoiceTicketIdentities(source);
  const primaryTicketId = first(ticketIdentities, "");

  return sanitizeHomeRecord({
    id,
    invoiceId: id,
    facturaId: id,

    title,
    name: title,
    concepto: title,

    status: statusKey,
    estado: statusKey,
    statusKey,
    statusLabel: getHomeInvoiceStatusLabel(source),
    paymentStatus: statusKey,
    estadoPago: statusKey,

    amount,
    total: amount,
    importe: amount,
    paidAmount,
    pagado: paidAmount,
    pendingAmount,
    pendiente: pendingAmount,
    currency,
    moneda: currency,

    paid: statusKey === HOME_INVOICE_STATUS_KEYS.PAID,
    isPaid: statusKey === HOME_INVOICE_STATUS_KEYS.PAID,

    ticketId: primaryTicketId,
    incidenciaId: primaryTicketId,
    ticketIds: ticketIdentities,
    incidenciaIds: ticketIdentities,

    createdAt: first(source.createdAt, source.fechaCreacion, source.date),
    issuedAt: first(source.issuedAt, source.fechaEmision, source.createdAt),
    dueAt: first(source.dueAt, source.fechaVencimiento, source.vencimiento),
    paidAt: first(source.paidAt, source.fechaPago, source.payment?.paidAt),
    updatedAt: first(source.updatedAt, source.modifiedAt, source.fechaActualizacion),
  });
}

export function normalizeHomeInvoices(items = []) {
  return sortByNewest(
    uniqueHomeBy(
      safeArray(items).map((item) => normalizeHomeInvoice(item)).filter((item) => item.id || item.title),
      getHomeInvoiceId
    ),
    (item) => first(item.updatedAt, item.paidAt, item.issuedAt, item.createdAt)
  );
}

/* =========================================================
   TICKETS / INCIDENCIAS
========================================================= */

export function getHomeTicketId(item = {}) {
  const raw = safeObject(item);

  return safePublicId(
    first(
      raw.ticketId,
      raw.incidenciaId,
      raw.code,
      raw.numero,
      raw.ticketCode,
      raw.entityId,
      raw.id
    )
  );
}

export function getHomeTicketSubject(item = {}) {
  const raw = safeObject(item);

  return compactText(
    first(
      raw.subject,
      raw.asunto,
      raw.title,
      raw.titulo,
      raw.name,
      raw.summary,
      getHomeTicketId(raw) ? `Incidencia ${getHomeTicketId(raw)}` : "Incidencia"
    ),
    "Incidencia",
    HOME_TITLE_LIMIT
  );
}

export function getHomeTicketDescription(item = {}) {
  const raw = safeObject(item);

  return compactText(
    first(
      raw.message,
      raw.description,
      raw.descripcion,
      raw.preview,
      raw.body,
      raw.text,
      ""
    ),
    "",
    HOME_TEXT_LIMIT
  );
}

export function getHomeTicketStatusKey(item = {}) {
  const raw = safeObject(item);
  const key = normalizeHomeKey(
    first(
      raw.status,
      raw.estado,
      raw.state,
      raw.lifecycle?.status,
      "pending"
    )
  );

  if (["open", "opened", "abierta", "abierto"].includes(key)) return HOME_STATUS_KEYS.OPEN;
  if (["progress", "in_progress", "inprogress", "en_proceso", "working", "assigned"].includes(key)) return HOME_STATUS_KEYS.PROGRESS;
  if (["resolved", "resuelta", "resuelto", "solved"].includes(key)) return HOME_STATUS_KEYS.RESOLVED;
  if (["closed", "close", "cerrada", "cerrado", "cancelled", "canceled", "archived"].includes(key)) return HOME_STATUS_KEYS.CLOSED;

  return HOME_STATUS_KEYS.PENDING;
}

export function getHomeTicketStatusLabel(item = {}) {
  const key = getHomeTicketStatusKey(item);

  if (key === HOME_STATUS_KEYS.OPEN) return "Abierta";
  if (key === HOME_STATUS_KEYS.PROGRESS) return "En curso";
  if (key === HOME_STATUS_KEYS.RESOLVED) return "Resuelta";
  if (key === HOME_STATUS_KEYS.CLOSED) return "Cerrada";

  return "Pendiente";
}

export function getHomeTicketPriorityKey(item = {}) {
  const raw = safeObject(item);
  const key = normalizeHomeKey(
    first(
      raw.priority,
      raw.prioridad,
      raw.severity,
      raw.urgency,
      raw.sla?.priority,
      "medium"
    )
  );

  if (["critical", "critica", "critico", "p0", "blocker"].includes(key)) return "critical";
  if (["urgent", "urgente", "high", "alta", "p1"].includes(key)) return "urgent";
  if (["low", "baja", "minor", "p3"].includes(key)) return "low";

  return "medium";
}

export function getHomeTicketPriorityLabel(item = {}) {
  const key = getHomeTicketPriorityKey(item);

  if (key === "critical") return "Crítica";
  if (key === "urgent") return "Alta";
  if (key === "low") return "Baja";

  return "Media";
}

export function getHomeTicketCategory(item = {}) {
  const raw = safeObject(item);

  return compactText(
    first(raw.category, raw.categoria, raw.type, raw.tipo, "General"),
    "General",
    HOME_TITLE_LIMIT
  );
}

export function getHomeTicketCreatedAt(item = {}) {
  const raw = safeObject(item);
  return first(raw.createdAt, raw.fechaCreacion, raw.created_at, raw.lifecycle?.createdAt, "");
}

export function getHomeTicketUpdatedAt(item = {}) {
  const raw = safeObject(item);
  return first(raw.updatedAt, raw.updated_at, raw.modifiedAt, raw.lastActivityAt, raw.lifecycle?.updatedAt, getHomeTicketCreatedAt(raw));
}

function getHomeTicketUserId(item = {}) {
  const raw = safeObject(item);

  return safePublicId(
    first(
      raw.userId,
      raw.usuarioId,
      raw.requesterUserId,
      raw.requesterId,
      raw.userRef?.id,
      raw.userRef?.userId,
      raw.requesterSnapshot?.userId,
      raw.requesterSnapshot?.id,
      raw.user?.userId,
      raw.user?.id
    )
  );
}

function getHomeTicketClientId(item = {}) {
  const raw = safeObject(item);

  return safePublicId(
    first(
      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.clienteRef?.id,
      raw.clienteRef?.clienteId,
      raw.clienteSnapshot?.clienteId,
      raw.clienteSnapshot?.id,
      raw.cliente?.clienteId,
      raw.cliente?.id
    )
  );
}

function ticketOwnerName(item = {}) {
  const raw = safeObject(item);

  return firstVisual(
    [
      raw.ownerName,
      raw.requesterName,
      raw.clientName,
      raw.clienteName,
      raw.clienteNombre,
      raw.userName,
      raw.usuarioName,
      raw.name,
      raw.requesterSnapshot?.displayName,
      raw.requesterSnapshot?.name,
      raw.requesterSnapshot?.nombre,
      raw.clienteSnapshot?.displayName,
      raw.clienteSnapshot?.name,
      raw.clienteSnapshot?.nombre,
      raw.userSnapshot?.displayName,
      raw.userSnapshot?.name,
      raw.userSnapshot?.nombre,
      raw.user?.displayName,
      raw.user?.name,
      raw.cliente?.displayName,
      raw.cliente?.name,
      raw.cliente?.nombre,
      raw.createdByName,
      raw.createdBy?.displayName,
      raw.createdBy?.name,
    ],
    "Usuario"
  );
}

function ticketAvatarUrl(item = {}) {
  const raw = safeObject(item);

  return firstSafeImageSrc(
    avatarCandidatesFromObject(raw),
    avatarCandidatesFromObject(raw.requesterSnapshot),
    avatarCandidatesFromObject(raw.userSnapshot),
    avatarCandidatesFromObject(raw.user),
    avatarCandidatesFromObject(raw.cliente),
    avatarCandidatesFromObject(raw.profile)
  );
}

function technicianId(item = {}) {
  const raw = safeObject(item);

  return safePublicId(
    first(
      raw.assignedToUserId,
      raw.assignedToId,
      raw.assigneeId,
      raw.technicianId,
      raw.tecnicoId,
      raw.agentId,

      raw.assignment?.assignedToUserId,
      raw.assignment?.assignedToId,
      raw.assignment?.assigneeId,
      raw.assignment?.technicianId,
      raw.assignment?.tecnicoId,
      raw.assignment?.agentId,
      raw.assignment?.userId,
      raw.assignment?.id,

      raw.assignedTo?.userId,
      raw.assignedTo?.usuarioId,
      raw.assignedTo?.uid,
      raw.assignedTo?.sub,
      raw.assignedTo?.id,

      raw.tecnico?.userId,
      raw.tecnico?.usuarioId,
      raw.tecnico?.uid,
      raw.tecnico?.sub,
      raw.tecnico?.id,

      raw.technician?.userId,
      raw.technician?.usuarioId,
      raw.technician?.uid,
      raw.technician?.sub,
      raw.technician?.id,

      raw.assignedTechnician?.userId,
      raw.assignedTechnician?.id,
      raw.assignedUser?.userId,
      raw.assignedUser?.id,

      raw.meta?.technicianUserId,
      raw.meta?.assignedToUserId,
      raw.meta?.tecnicoId,
      raw.meta?.assigneeId,
      ""
    )
  );
}

function technicianName(item = {}) {
  const raw = safeObject(item);
  const assignedToObject = safeObject(typeof raw.assignedTo === "object" ? raw.assignedTo : {});

  return firstVisual(
    [
      raw.technicianName,
      raw.tecnicoName,
      raw.tecnicoNombre,
      raw.assignedToName,
      raw.assignedName,
      raw.assigneeName,
      raw.agentName,

      raw.assignment?.assignedToName,
      raw.assignment?.technicianName,
      raw.assignment?.tecnicoName,
      raw.assignment?.agentName,
      raw.assignment?.displayName,
      raw.assignment?.fullName,
      raw.assignment?.name,
      raw.assignment?.assignedTo?.displayName,
      raw.assignment?.assignedTo?.fullName,
      raw.assignment?.assignedTo?.name,

      assignedToObject.displayName,
      assignedToObject.fullName,
      assignedToObject.name,
      assignedToObject.nombre,
      assignedToObject.username,

      raw.tecnico?.displayName,
      raw.tecnico?.fullName,
      raw.tecnico?.name,
      raw.tecnico?.nombre,
      raw.tecnico?.username,

      raw.technician?.displayName,
      raw.technician?.fullName,
      raw.technician?.name,
      raw.technician?.nombre,
      raw.technician?.username,

      raw.assignedTechnician?.displayName,
      raw.assignedTechnician?.fullName,
      raw.assignedTechnician?.name,
      raw.assignedUser?.displayName,
      raw.assignedUser?.fullName,
      raw.assignedUser?.name,

      raw.meta?.technicianName,
      raw.meta?.lastTechnicianName,
      raw.meta?.assignedToName,

      typeof raw.assignedTo === "string" ? raw.assignedTo : "",
      typeof raw.tecnico === "string" ? raw.tecnico : "",
      typeof raw.technician === "string" ? raw.technician : "",
      typeof raw.agent === "string" ? raw.agent : "",
      typeof raw.assignee === "string" ? raw.assignee : "",
    ],
    "Sin asignar"
  );
}

function technicianAvatarUrl(item = {}) {
  const raw = safeObject(item);
  const assignedToObject = safeObject(typeof raw.assignedTo === "object" ? raw.assignedTo : {});

  return firstSafeImageSrc(
    avatarCandidatesFromObject(raw.technician),
    avatarCandidatesFromObject(raw.tecnico),
    avatarCandidatesFromObject(raw.assignedTechnician),
    avatarCandidatesFromObject(raw.assignedUser),
    avatarCandidatesFromObject(assignedToObject),
    avatarCandidatesFromObject(raw.assignment?.assignedTo),
    raw.technicianAvatarUrl,
    raw.tecnicoAvatarUrl,
    raw.assignedToAvatarUrl,
    raw.agentAvatarUrl,
    raw.meta?.technicianAvatarUrl,
    raw.meta?.assignedToAvatarUrl
  );
}

export function resolveHomeTicketTechnician(ticket = {}, users = []) {
  const raw = safeObject(ticket);
  const id = technicianId(raw);
  const name = technicianName(raw);
  const directAvatar = technicianAvatarUrl(raw);

  let matchedUser = null;

  if (id) {
    matchedUser = safeArray(users).find((user) => normalizeHomeKey(getHomeUserId(user)) === normalizeHomeKey(id)) || null;
  }

  if (!matchedUser && name && name !== "Sin asignar") {
    matchedUser = safeArray(users).find((user) => {
      const candidate = firstVisual([user.displayName, user.name, user.fullName, user.username], "");
      return normalizeHomeKey(candidate) === normalizeHomeKey(name);
    }) || null;
  }

  const normalizedUser = matchedUser ? normalizeHomeUser(matchedUser) : null;
  const finalName = normalizedUser?.displayName || name || "Sin asignar";
  const finalId = normalizedUser?.userId || id || "";
  const finalAvatar = directAvatar || normalizedUser?.avatarUrl || "";

  return sanitizeHomeRecord({
    id: finalId,
    userId: finalId,
    technicianId: finalId,
    tecnicoId: finalId,
    displayName: finalName,
    name: finalName,
    fullName: finalName,
    nombre: finalName,
    avatarUrl: finalAvatar,
    avatar: finalAvatar,
    photoUrl: finalAvatar,
    pictureUrl: finalAvatar,
    imageUrl: finalAvatar,
    initials: initialsFromName(finalName),
    assigned: Boolean(finalId || (finalName && finalName !== "Sin asignar")),
  });
}

function ticketInvoiceIdentities(item = {}) {
  const raw = safeObject(item);

  return uniqueStrings([
    raw.invoiceId,
    raw.facturaId,
    raw.invoiceIds,
    raw.facturaIds,
    raw.invoices,
    raw.facturas,
    raw.relations?.invoice?.id,
    raw.relations?.invoice?.invoiceId,
    raw.relations?.factura?.id,
    raw.relations?.factura?.facturaId,
  ]);
}

export function resolveHomeTicketInvoices(ticket = {}, invoices = []) {
  const raw = safeObject(ticket);
  const ticketId = getHomeTicketId(raw);
  const wantedInvoiceIds = new Set(ticketInvoiceIdentities(raw).map(normalizeHomeKey));
  const ticketIdentity = normalizeHomeKey(ticketId);

  return normalizeHomeInvoices(invoices).filter((invoice) => {
    const invoiceId = normalizeHomeKey(getHomeInvoiceId(invoice));

    if (invoiceId && wantedInvoiceIds.has(invoiceId)) return true;

    const linkedTicketIds = getHomeInvoiceTicketIdentities(invoice).map(normalizeHomeKey);

    return Boolean(ticketIdentity && linkedTicketIds.includes(ticketIdentity));
  });
}

export function normalizeHomeTicket(item = {}, context = {}) {
  const source = safeObject(item);
  const ctx = safeObject(context);
  const invoices = normalizeHomeInvoices(ctx.invoices || []);
  const users = normalizeHomeUsers(ctx.users || []);

  const id = getHomeTicketId(source);
  const subject = getHomeTicketSubject(source);
  const description = getHomeTicketDescription(source);
  const statusKey = getHomeTicketStatusKey(source);
  const priorityKey = getHomeTicketPriorityKey(source);
  const technician = resolveHomeTicketTechnician(source, users);
  const linkedInvoices = resolveHomeTicketInvoices({ ...source, ticketId: id }, invoices);
  const ownerName = ticketOwnerName(source);
  const ownerAvatar = ticketAvatarUrl(source);

  return sanitizeHomeRecord({
    id,
    ticketId: id,
    incidenciaId: id,
    entityId: id,

    subject,
    asunto: subject,
    title: subject,
    titulo: subject,

    description,
    descripcion: description,
    message: description,
    preview: description,

    status: statusKey,
    estado: statusKey,
    statusKey,
    statusLabel: getHomeTicketStatusLabel(source),

    priority: priorityKey,
    prioridad: priorityKey,
    priorityKey,
    priorityLabel: getHomeTicketPriorityLabel(source),

    category: getHomeTicketCategory(source),
    categoria: getHomeTicketCategory(source),

    userId: getHomeTicketUserId(source),
    clienteId: getHomeTicketClientId(source),
    clientId: getHomeTicketClientId(source),

    ownerName,
    requesterName: ownerName,
    clientName: ownerName,
    userName: ownerName,
    avatarUrl: ownerAvatar,
    requesterAvatarUrl: ownerAvatar,
    userAvatarUrl: ownerAvatar,
    hasAvatar: Boolean(ownerAvatar),

    assignedTo: technician.displayName,
    assignedToName: technician.displayName,
    technicianName: technician.displayName,
    tecnicoName: technician.displayName,
    technician,
    tecnico: technician,

    invoices: linkedInvoices,
    facturas: linkedInvoices,
    invoiceIds: linkedInvoices.map(getHomeInvoiceId).filter(Boolean),
    facturaIds: linkedInvoices.map(getHomeInvoiceId).filter(Boolean),

    createdAt: getHomeTicketCreatedAt(source),
    updatedAt: getHomeTicketUpdatedAt(source),
    lastActivityAt: first(source.lastActivityAt, getHomeTicketUpdatedAt(source)),
    closedAt: first(source.closedAt, source.lifecycle?.closedAt, ""),
  });
}

export function normalizeHomeTickets(items = [], context = {}) {
  const ctx = safeObject(context);

  return sortByNewest(
    uniqueHomeBy(
      safeArray(items)
        .map((item) => normalizeHomeTicket(item, ctx))
        .filter((item) => item.id || item.subject),
      getHomeTicketId
    ),
    (item) => first(item.updatedAt, item.lastActivityAt, item.createdAt)
  );
}

export function findHomeTicketById(items = [], ticketId = "") {
  const target = normalizeHomeKey(ticketId);

  if (!target) return null;

  return safeArray(items).find((item) => {
    const raw = safeObject(item);
    return [
      getHomeTicketId(raw),
      raw.ticketId,
      raw.incidenciaId,
      raw.entityId,
      raw.id,
      raw.code,
      raw.numero,
    ].some((candidate) => normalizeHomeKey(candidate) === target);
  }) || null;
}

/* =========================================================
   WIDGETS / ACTIVITY
========================================================= */

export function getHomeWidgetId(item = {}) {
  const raw = safeObject(item);

  return safePublicId(
    first(
      raw.widgetId,
      raw.widgetKey,
      raw.id,
      raw.key,
      raw.slug,
      raw.code,
      raw.title,
      raw.name
    )
  );
}

export function normalizeHomeWidget(item = {}) {
  const source = safeObject(item);
  const id = getHomeWidgetId(source) || normalizeHomeKey(first(source.label, source.title, source.name, "widget"));
  const label = compactText(first(source.label, source.title, source.name, id), id, HOME_TITLE_LIMIT);
  const route = safeRoute(first(source.route, source.href, source.link, source.to, ""), "");

  return sanitizeHomeRecord({
    id,
    key: id,
    widgetId: id,
    widgetKey: id,

    label,
    title: label,
    name: label,

    value: first(source.value, source.count, source.total, 0),
    text: compactText(first(source.text, source.description, source.subtitle, ""), "", HOME_TEXT_LIMIT),
    badge: compactText(first(source.badge, source.statusLabel, ""), "", HOME_TITLE_LIMIT),

    iconName: safeText(first(source.iconName, source.icon, "activity"), "activity"),
    modifier: normalizeHomeKey(first(source.modifier, source.variant, source.type, "")),
    type: normalizeHomeKey(first(source.type, source.kind, HOME_ENTITY_TYPES.WIDGET)),
    route,
    href: route,

    role: normalizeRole(first(source.role, source.requiredRole, source.roles, source.meta?.role, ""), ""),
    adminOnly: source.adminOnly === true || source.requiresAdmin === true || isAdminOnlyRoute(route),
  });
}

export function normalizeHomeWidgets(items = [], admin = true) {
  return filterWidgetsForRole(
    uniqueHomeBy(
      safeArray(items).map((item) => normalizeHomeWidget(item)),
      getHomeWidgetId
    ),
    admin
  );
}

export function getHomeActivityId(item = {}) {
  const raw = safeObject(item);

  return safePublicId(
    first(
      raw.activityId,
      raw.eventId,
      raw.id,
      raw.key,
      raw.ticketId,
      raw.incidenciaId,
      raw.invoiceId,
      raw.facturaId,
      raw.title
    )
  );
}

export function normalizeHomeActivity(item = {}) {
  const source = safeObject(item);
  const id = getHomeActivityId(source) || `${normalizeHomeKey(first(source.type, source.kind, "activity"))}:${toTimestamp(first(source.date, source.createdAt, source.updatedAt, nowIso()))}`;
  const type = normalizeHomeKey(first(source.type, source.kind, source.category, HOME_ENTITY_TYPES.ACTIVITY));
  const route = safeRoute(first(source.route, source.href, source.link, source.to, ""), "");
  const title = compactText(first(source.title, source.name, source.subject, "Actividad"), "Actividad", HOME_TITLE_LIMIT);
  const text = compactText(first(source.text, source.description, source.message, source.detail, ""), "", HOME_TEXT_LIMIT);
  const date = first(source.date, source.at, source.createdAt, source.updatedAt, nowIso());

  return sanitizeHomeRecord({
    id,
    activityId: id,
    type,
    kind: type,
    category: type,
    title,
    text,
    description: text,
    route,
    href: route,
    date,
    at: date,
    createdAt: date,
    updatedAt: first(source.updatedAt, date),
    iconName: safeText(first(source.iconName, source.icon, type || "activity"), "activity"),
  });
}

export function normalizeHomeActivityList(items = [], admin = true) {
  return filterActivityForRole(
    sortByNewest(
      uniqueHomeBy(
        safeArray(items).map((item) => normalizeHomeActivity(item)),
        getHomeActivityId
      ),
      (item) => first(item.date, item.updatedAt, item.createdAt)
    ),
    admin
  );
}

export function buildHomeActivityFromCollections({
  tickets = [],
  invoices = [],
  users = [],
  clients = [],
} = {}) {
  const rows = [];

  for (const ticket of safeArray(tickets).slice(0, DEFAULT_HOME_RECENT_LIMIT)) {
    rows.push({
      id: `ticket:${getHomeTicketId(ticket)}`,
      type: HOME_ENTITY_TYPES.TICKET,
      title: getHomeTicketSubject(ticket),
      text: getHomeTicketStatusLabel(ticket),
      route: HOME_ROUTES.INCIDENCIAS,
      date: first(ticket.updatedAt, ticket.lastActivityAt, ticket.createdAt),
    });
  }

  for (const invoice of safeArray(invoices).slice(0, DEFAULT_HOME_RECENT_LIMIT)) {
    rows.push({
      id: `invoice:${getHomeInvoiceId(invoice)}`,
      type: HOME_ENTITY_TYPES.INVOICE,
      title: first(invoice.title, `Factura ${getHomeInvoiceId(invoice)}`),
      text: getHomeInvoiceStatusLabel(invoice),
      route: HOME_ROUTES.FACTURAS,
      date: first(invoice.updatedAt, invoice.paidAt, invoice.issuedAt, invoice.createdAt),
    });
  }

  for (const user of safeArray(users).slice(0, DEFAULT_HOME_RECENT_LIMIT)) {
    rows.push({
      id: `user:${getHomeUserId(user)}`,
      type: HOME_ENTITY_TYPES.USER,
      title: first(user.displayName, user.name, "Usuario"),
      text: "Usuario actualizado",
      route: HOME_ROUTES.USUARIOS,
      date: first(user.updatedAt, user.lastLoginAt, user.createdAt),
    });
  }

  for (const client of safeArray(clients).slice(0, DEFAULT_HOME_RECENT_LIMIT)) {
    rows.push({
      id: `client:${getHomeClientId(client)}`,
      type: HOME_ENTITY_TYPES.CLIENT,
      title: first(client.name, client.displayName, "Cliente"),
      text: "Cliente actualizado",
      route: HOME_ROUTES.CLIENTES,
      date: first(client.updatedAt, client.createdAt),
    });
  }

  return normalizeHomeActivityList(rows, Boolean(users.length || clients.length));
}

/* =========================================================
   SUMMARY / DASHBOARD
========================================================= */

function roleFromSource(source = {}, fallback = "user") {
  const raw = safeObject(source);
  const meta = safeObject(raw.meta);
  const dashboard = safeObject(raw.dashboard);
  const dashboardMeta = safeObject(dashboard.meta);

  const role = normalizeRole(
    first(
      raw.role,
      raw.rol,
      raw.roles,
      meta.role,
      meta.rol,
      meta.roles,
      dashboard.role,
      dashboard.rol,
      dashboard.roles,
      dashboardMeta.role,
      dashboardMeta.rol,
      dashboardMeta.roles,
      ""
    ),
    ""
  );

  if (role) return role;

  if (raw.admin === true || meta.admin === true || dashboard.admin === true || dashboardMeta.admin === true) {
    return "admin";
  }

  if (raw.admin === false || meta.admin === false || dashboard.admin === false || dashboardMeta.admin === false) {
    return "user";
  }

  return normalizeRole(fallback, "user");
}

function statusCounts(tickets = []) {
  const counts = {
    pending: 0,
    open: 0,
    progress: 0,
    resolved: 0,
    closed: 0,
  };

  for (const ticket of safeArray(tickets)) {
    const key = getHomeTicketStatusKey(ticket);
    if (Object.prototype.hasOwnProperty.call(counts, key)) counts[key] += 1;
  }

  return counts;
}

function invoiceAmounts(invoices = []) {
  return safeArray(invoices).reduce(
    (acc, invoice) => {
      const statusKey = getHomeInvoiceStatusKey(invoice);
      acc.grossInvoiceAmount = roundMoney(acc.grossInvoiceAmount + getHomeInvoiceAmount(invoice));

      if (statusKey === HOME_INVOICE_STATUS_KEYS.PAID) {
        acc.paidInvoices += 1;
        acc.paidInvoiceAmount = roundMoney(acc.paidInvoiceAmount + getHomeInvoicePaidAmount(invoice));
        acc.invoiceAmount = acc.paidInvoiceAmount;
      }

      if (isHomeInvoicePendingLike(invoice)) {
        acc.pendingInvoices += 1;
        acc.pendingInvoiceAmount = roundMoney(acc.pendingInvoiceAmount + getHomeInvoicePendingAmount(invoice));
      }

      if (statusKey === HOME_INVOICE_STATUS_KEYS.OVERDUE) {
        acc.overdueInvoices += 1;
      }

      return acc;
    },
    {
      paidInvoices: 0,
      pendingInvoices: 0,
      overdueInvoices: 0,
      invoiceAmount: 0,
      paidInvoiceAmount: 0,
      pendingInvoiceAmount: 0,
      grossInvoiceAmount: 0,
    }
  );
}

function buildSummary({
  rawSummary = {},
  tickets = [],
  invoices = [],
  users = [],
  clients = [],
  collections = {},
  admin = false,
} = {}) {
  const raw = safeObject(rawSummary);
  const ticketCounts = statusCounts(tickets);
  const invoiceData = invoiceAmounts(invoices);

  const totalTickets = maxNumber(
    raw.totalTickets,
    raw.ticketsTotal,
    raw.incidenciasTotal,
    raw.totalIncidencias,
    raw.ticketsCount,
    raw.incidenciasCount,
    collections.tickets?.remoteCount,
    tickets.length
  );

  const totalInvoices = maxNumber(
    raw.totalInvoices,
    raw.invoicesTotal,
    raw.facturasTotal,
    raw.totalFacturas,
    raw.invoicesCount,
    raw.facturasCount,
    collections.invoices?.remoteCount,
    invoices.length
  );

  const usersCount = admin
    ? maxNumber(raw.usersCount, raw.usuariosCount, raw.totalUsers, collections.users?.remoteCount, users.length)
    : 0;

  const clientsCount = admin
    ? maxNumber(raw.clientsCount, raw.clientesCount, raw.customersCount, raw.totalClients, collections.clients?.remoteCount, clients.length)
    : 0;

  const paidInvoiceAmount = maxNumber(
    raw.paidInvoiceAmount,
    raw.totalPagado,
    raw.paidAmount,
    raw.facturasPaidAmount,
    invoiceData.paidInvoiceAmount
  );

  const pendingInvoiceAmount = maxNumber(
    raw.pendingInvoiceAmount,
    raw.importePendiente,
    raw.totalPendiente,
    invoiceData.pendingInvoiceAmount
  );

  return sanitizeSummaryForRole(
    {
      ...raw,

      totalTickets,
      ticketsTotal: totalTickets,
      incidenciasTotal: totalTickets,
      ticketsCount: totalTickets,
      incidenciasCount: totalTickets,

      pendingTickets: maxNumber(raw.pendingTickets, raw.pendingIncidencias, ticketCounts.pending),
      openTickets: maxNumber(raw.openTickets, raw.openIncidencias, ticketCounts.open),
      progressTickets: maxNumber(raw.progressTickets, raw.progressIncidencias, ticketCounts.progress),
      resolvedTickets: maxNumber(raw.resolvedTickets, raw.resolvedIncidencias, ticketCounts.resolved),
      closedTickets: maxNumber(raw.closedTickets, raw.closedIncidencias, ticketCounts.closed),
      activeTickets: maxNumber(raw.activeTickets, raw.activeIncidencias, ticketCounts.pending + ticketCounts.open + ticketCounts.progress),

      totalInvoices,
      invoicesTotal: totalInvoices,
      facturasTotal: totalInvoices,
      invoicesCount: totalInvoices,
      facturasCount: totalInvoices,

      paidInvoices: maxNumber(raw.paidInvoices, raw.paidFacturas, invoiceData.paidInvoices),
      pendingInvoices: maxNumber(raw.pendingInvoices, raw.pendingFacturas, invoiceData.pendingInvoices),
      overdueInvoices: maxNumber(raw.overdueInvoices, raw.overdueFacturas, invoiceData.overdueInvoices),

      invoiceAmount: paidInvoiceAmount,
      paidInvoiceAmount,
      pendingInvoiceAmount,
      grossInvoiceAmount: maxNumber(raw.grossInvoiceAmount, raw.totalFacturado, invoiceData.grossInvoiceAmount),

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
    },
    admin
  );
}

function defaultWidgets(summary = {}, admin = false) {
  const paidAmount = safeNumber(first(summary.paidInvoiceAmount, summary.invoiceAmount, 0), 0);

  const items = [
    {
      id: "incidencias",
      label: admin ? "Incidencias" : "Mis incidencias",
      value: first(summary.totalTickets, summary.ticketsTotal, 0),
      text: "Incidencias visibles en el panel.",
      iconName: "ticket",
      route: HOME_ROUTES.INCIDENCIAS,
    },
    {
      id: "facturas-totales",
      label: "Facturas totales",
      value: first(summary.totalInvoices, summary.facturasTotal, 0),
      text: `Pagado: ${paidAmount}`,
      iconName: "euro",
      route: HOME_ROUTES.FACTURAS,
    },
  ];

  if (admin) {
    items.push(
      {
        id: "clientes",
        label: "Clientes",
        value: first(summary.clientsCount, summary.clientesCount, 0),
        text: "Clientes visibles.",
        iconName: "client",
        route: HOME_ROUTES.CLIENTES,
        adminOnly: true,
      },
      {
        id: "usuarios",
        label: "Usuarios",
        value: first(summary.usersCount, summary.usuariosCount, 0),
        text: "Usuarios visibles.",
        iconName: "users",
        route: HOME_ROUTES.USUARIOS,
        adminOnly: true,
      }
    );
  }

  return items;
}

function normalizeRoleScopedDashboard(raw = {}, role = "user") {
  const source = sanitizeHomeRecord(raw);
  const admin = role === "admin";

  return sanitizeHomeRecord({
    ...source,
    role,
    rol: role,
    roles: [role],
    admin,
    users: admin ? safeArray(source.users) : [],
    usuarios: admin ? safeArray(source.usuarios) : [],
    clients: admin ? safeArray(source.clients) : [],
    clientes: admin ? safeArray(source.clientes) : [],
    customers: admin ? safeArray(source.customers) : [],
    meta: {
      ...safeObject(source.meta),
      role,
      admin,
    },
  });
}

export function normalizeHomeDashboard(payload = {}) {
  const unwrapped = safeObject(unwrapHomeEnvelope(payload));
  const role = roleFromSource(unwrapped, "user");
  const admin = role === "admin";
  const source = normalizeRoleScopedDashboard(unwrapped, role);

  const ticketsBlock = pickHomeCollectionBlock(source, ["tickets", "incidencias"]);
  const invoicesBlock = pickHomeCollectionBlock(source, ["invoices", "facturas"]);
  const usersBlock = admin ? pickHomeCollectionBlock(source, ["users", "usuarios"]) : emptyCollection();
  const clientsBlock = admin ? pickHomeCollectionBlock(source, ["clients", "clientes", "customers"]) : emptyCollection();
  const activityBlock = pickHomeCollectionBlock(source, ["activity", "activities", "recent", "recentActivity"]);
  const widgetsBlock = pickHomeCollectionBlock(source, ["widgets", "cards", "kpis", "blocks"]);

  const invoices = normalizeHomeInvoices(invoicesBlock.items);
  const users = admin ? normalizeHomeUsers(usersBlock.items) : [];
  const clients = admin ? normalizeHomeClients(clientsBlock.items) : [];
  const tickets = normalizeHomeTickets(ticketsBlock.items, {
    invoices,
    users,
  });

  const rawSummary = first(source.summary, source.stats, source.metrics, source.totals, source.counts, {});
  const collections = {
    tickets: ticketsBlock,
    invoices: invoicesBlock,
    users: usersBlock,
    clients: clientsBlock,
  };
  const summary = buildSummary({
    rawSummary,
    tickets,
    invoices,
    users,
    clients,
    collections,
    admin,
  });

  const widgets = normalizeHomeWidgets(
    widgetsBlock.items.length ? widgetsBlock.items : defaultWidgets(summary, admin),
    admin
  );

  const activity = normalizeHomeActivityList(
    activityBlock.items.length
      ? activityBlock.items
      : buildHomeActivityFromCollections({ tickets, invoices, users, clients }),
    admin
  );

  const requestId = safePublicId(first(source.requestId, source.meta?.requestId, ""));
  const updatedAt = safeText(first(source.updatedAt, source.generatedAt, source.lastSyncAt, source.meta?.updatedAt, source.meta?.lastSyncAt, nowIso()), "");

  return sanitizeHomeRecord({
    version: HOME_MODEL_VERSION,

    role,
    rol: role,
    roles: [role],
    admin,

    requestId,
    updatedAt,
    generatedAt: first(source.generatedAt, updatedAt),
    lastSyncAt: first(source.lastSyncAt, updatedAt),

    summary,
    stats: summary,
    metrics: summary,
    totals: summary,
    counts: summary,

    widgets,
    cards: widgets,
    kpis: widgets,
    blocks: widgets,

    tickets,
    incidencias: tickets,
    ticketsRemoteCount: Math.max(tickets.length, safeNumber(ticketsBlock.remoteCount, tickets.length)),
    remoteCount: Math.max(tickets.length, safeNumber(ticketsBlock.remoteCount, tickets.length)),

    invoices,
    facturas: invoices,
    invoicesRemoteCount: Math.max(invoices.length, safeNumber(invoicesBlock.remoteCount, invoices.length)),

    users,
    usuarios: users,
    usersRemoteCount: admin ? Math.max(users.length, safeNumber(usersBlock.remoteCount, users.length)) : 0,

    clients,
    clientes: clients,
    customers: clients,
    clientsRemoteCount: admin ? Math.max(clients.length, safeNumber(clientsBlock.remoteCount, clients.length)) : 0,

    activity,
    activities: activity,
    recent: activity,
    recentActivity: activity,
    activityRemoteCount: Math.max(activity.length, safeNumber(activityBlock.remoteCount, activity.length)),

    collections: {
      ticketsRemoteCount: Math.max(tickets.length, safeNumber(ticketsBlock.remoteCount, tickets.length)),
      invoicesRemoteCount: Math.max(invoices.length, safeNumber(invoicesBlock.remoteCount, invoices.length)),
      usersRemoteCount: admin ? Math.max(users.length, safeNumber(usersBlock.remoteCount, users.length)) : 0,
      clientsRemoteCount: admin ? Math.max(clients.length, safeNumber(clientsBlock.remoteCount, clients.length)) : 0,
      activityRemoteCount: Math.max(activity.length, safeNumber(activityBlock.remoteCount, activity.length)),
      invoicesCurrency: first(invoices[0]?.currency, source.currency, "EUR"),
    },

    meta: {
      ...safeObject(source.meta),
      role,
      admin,
      requestId,
      updatedAt,
      lastSyncAt: first(source.lastSyncAt, updatedAt),
    },

    partial: source.partial === true,
    errors: safeArray(source.errors).map((error) => sanitizeHomeRecord(error)).filter(hasKeys),
  });
}

/* =========================================================
   PAGINATION / TEMPLATE PAYLOAD
========================================================= */

export function paginateHomeItems(items = [], page = DEFAULT_HOME_PAGE, pageSize = DEFAULT_HOME_PAGE_SIZE) {
  const rows = safeArray(items);
  const size = Math.max(1, safeNumber(pageSize, DEFAULT_HOME_PAGE_SIZE));
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const currentPage = Math.min(Math.max(1, safeNumber(page, DEFAULT_HOME_PAGE)), totalPages);
  const start = (currentPage - 1) * size;
  const pageItems = rows.slice(start, start + size);

  return {
    items: pageItems,
    pageItems,
    page: currentPage,
    currentPage,
    pageSize: size,
    totalPages,
    total,
    totalCount: total,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
}

function publicUserFromPayload(payload = {}) {
  const source = safeObject(first(payload.sidebarUser, payload.user, payload.currentUser, payload.state?.user, {}));

  const displayName = firstVisual(
    [
      source.displayName,
      source.fullName,
      source.name,
      source.nombre,
      source.username,
      source.userName,
      source.slug,
      payload.displayName,
      payload.name,
      payload.fullName,
    ],
    "Usuario"
  );

  const role = normalizeRole(first(source.role, source.rol, source.roles, payload.role, payload.rol, payload.roles, "user"), "user");
  const avatarUrl = firstSafeImageSrc(
    avatarCandidatesFromObject(source),
    source.avatarUrl,
    payload.avatarUrl,
    payload.avatar
  );

  return sanitizeHomeRecord({
    hasUser: source.hasUser !== false,
    id: safePublicId(first(source.id, source.userId, source.uid, source.sub, "")) || null,
    userId: safePublicId(first(source.userId, source.id, source.uid, source.sub, "")) || null,
    slug: safePublicId(first(source.slug, source.lookup?.slug, source.profile?.slug, "")) || null,
    username: safePublicId(first(source.username, source.userName, "")) || null,
    displayName,
    name: displayName,
    fullName: displayName,
    avatarUrl,
    avatar: avatarUrl,
    photoUrl: avatarUrl,
    photoURL: avatarUrl,
    picture: avatarUrl,
    pictureUrl: avatarUrl,
    image: avatarUrl,
    imageUrl: avatarUrl,
    foto: avatarUrl,
    fotoUrl: avatarUrl,
    imagen: avatarUrl,
    imagenUrl: avatarUrl,
    initials: safeText(first(source.initials, payload.initials, initialsFromName(displayName)), "U").slice(0, 3).toUpperCase(),
    role,
    rol: role,
    roles: [role],
    roleLabel: safeText(first(source.roleLabel, role === "admin" ? "Administrador" : "Estándar"), role === "admin" ? "Administrador" : "Estándar"),
    isAdmin: role === "admin",
    isUser: role === "user",
  });
}

export function buildHomeTemplatePayload(input = {}) {
  const source = safeObject(input);
  const dashboard = normalizeHomeDashboard(
    hasKeys(source.dashboard)
      ? {
          ...source.dashboard,
          role: first(source.role, source.dashboard.role),
          admin: first(source.admin, source.dashboard.admin),
        }
      : source
  );

  const role = normalizeRole(first(source.role, source.state?.role, dashboard.role, "user"), "user");
  const admin = role === "admin";
  const user = publicUserFromPayload({ ...source, role });

  const tickets = normalizeHomeTickets(firstArray(source.tickets, source.incidencias, dashboard.tickets), {
    invoices: firstArray(source.invoices, source.facturas, dashboard.invoices),
    users: admin ? firstArray(source.users, source.usuarios, dashboard.users) : [],
  });
  const invoices = normalizeHomeInvoices(firstArray(source.invoices, source.facturas, dashboard.invoices));
  const users = admin ? normalizeHomeUsers(firstArray(source.users, source.usuarios, dashboard.users)) : [];
  const clients = admin ? normalizeHomeClients(firstArray(source.clients, source.clientes, source.customers, dashboard.clients)) : [];
  const activity = normalizeHomeActivityList(firstArray(source.activity, source.recentActivity, dashboard.activity), admin);
  const widgets = normalizeHomeWidgets(firstArray(source.widgets, source.cards, dashboard.widgets), admin);
  const summary = sanitizeSummaryForRole(first(source.summary, dashboard.summary, {}), admin);
  const pagination = paginateHomeItems(tickets, source.page || source.state?.page, source.pageSize || source.state?.pageSize);

  return sanitizeHomeRecord({
    ...source,

    user,
    currentUser: user,
    sidebarUser: user,
    sidebar: {
      ...safeObject(source.sidebar),
      user,
    },
    layout: {
      ...safeObject(source.layout),
      sidebarUser: user,
    },
    context: {
      ...safeObject(source.context),
      user,
      sidebarUser: user,
    },

    role,
    admin,
    displayName: user.displayName,
    name: user.displayName,
    fullName: user.displayName,
    avatarUrl: user.avatarUrl,
    initials: user.initials,

    dashboard,
    summary,
    stats: summary,
    widgets,
    cards: widgets,
    kpis: widgets,
    blocks: widgets,

    tickets,
    incidencias: tickets,
    invoices,
    facturas: invoices,
    users,
    usuarios: users,
    clients,
    clientes: clients,
    customers: clients,
    activity,
    recent: activity,
    recentActivity: activity,

    pagination,
    pageItems: pagination.items,
    selectedTicket: findHomeTicketById(tickets, first(source.selectedTicketId, source.selectedIncidenciaId, source.state?.selectedTicketId, "")),

    state: {
      ...safeObject(source.state),
      role,
      admin,
      user,
      currentUser: user,
      sidebarUser: user,
      dashboard,
      summary,
      widgets,
      tickets,
      incidencias: tickets,
      invoices,
      facturas: invoices,
      users,
      usuarios: users,
      clients,
      clientes: clients,
      activity,
      recentActivity: activity,
      pagination,
    },
  });
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHomeModelSnapshot() {
  return sanitizeHomeRecord({
    version: HOME_MODEL_VERSION,
    source: "views.home.model",
    routes: HOME_ROUTES,
    defaults: {
      page: DEFAULT_HOME_PAGE,
      pageSize: DEFAULT_HOME_PAGE_SIZE,
      recentLimit: DEFAULT_HOME_RECENT_LIMIT,
    },
    policy: {
      modelOnly: true,
      noAppCore: true,
      noRouter: true,
      noAuth: true,
      noHttp: true,
      noStorage: true,
      noDom: true,
      noCss: true,
      noHomeRoute: true,
      noRawBackendPayload: true,
      stripsCosmosMetadata: true,
      noEmailIdentity: true,
      userDoesNotKeepAdminCollections: true,
      paidInvoiceAmountOnlyForPaidInvoices: true,
      resolvesTicketInvoices: true,
      resolvesTechnicianFromUsers: true,
      preservesTicketTechnicianAvatar: true,
      snapshotRedacted: true,
    },
    at: nowIso(),
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  HOME_MODEL_VERSION,

  DEFAULT_HOME_PAGE,
  DEFAULT_HOME_PAGE_SIZE,
  DEFAULT_HOME_RECENT_LIMIT,
  HOME_ENTITY_TYPES,
  HOME_STATUS_KEYS,
  HOME_INVOICE_STATUS_KEYS,

  normalizeHomeKey,
  uniqueHomeBy,

  looksLikeHomeDashboard,
  unwrapHomeEnvelope,
  normalizeHomeCollectionSource,
  pickHomeCollectionBlock,

  getHomeUserId,
  normalizeHomeUser,
  normalizeHomeUsers,

  getHomeClientId,
  normalizeHomeClient,
  normalizeHomeClients,

  getHomeInvoiceId,
  getHomeInvoiceAmount,
  getHomeInvoiceCurrency,
  getHomeInvoiceStatusKey,
  getHomeInvoiceStatusLabel,
  isHomeInvoicePaid,
  isHomeInvoicePendingLike,
  getHomeInvoicePaidAmount,
  getHomeInvoicePendingAmount,
  getHomeInvoiceTicketIdentities,
  normalizeHomeInvoice,
  normalizeHomeInvoices,

  getHomeTicketId,
  getHomeTicketSubject,
  getHomeTicketDescription,
  getHomeTicketStatusKey,
  getHomeTicketStatusLabel,
  getHomeTicketPriorityKey,
  getHomeTicketPriorityLabel,
  getHomeTicketCategory,
  getHomeTicketCreatedAt,
  getHomeTicketUpdatedAt,
  resolveHomeTicketTechnician,
  resolveHomeTicketInvoices,
  normalizeHomeTicket,
  normalizeHomeTickets,
  findHomeTicketById,

  getHomeWidgetId,
  normalizeHomeWidget,
  normalizeHomeWidgets,

  getHomeActivityId,
  normalizeHomeActivity,
  normalizeHomeActivityList,
  buildHomeActivityFromCollections,

  normalizeHomeDashboard,
  paginateHomeItems,
  buildHomeTemplatePayload,

  getHomeModelSnapshot,
  getDebugSnapshot: getHomeModelSnapshot,
};
