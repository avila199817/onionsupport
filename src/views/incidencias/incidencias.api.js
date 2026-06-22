/* =========================================================
   Onion Support - Incidencias API
   Archivo: /src/views/incidencias/incidencias.api.js

   PRODUCTIVO · PAINT SAFE · BLOB READY · 1:1 COSMOS · 10/10

   Punto cerrado:
   - El backend /api/tickets devuelve items/rows/tickets/incidencias.
   - Esta capa NO puede perder arrays por usar first(...).flat().
   - listIncidencias() debe devolver items.length === response.items.length.

   Responsabilidad:
   - Centralizar llamadas HTTP de Incidencias.
   - Adaptar backend /api/tickets al frontend.
   - Cachear listado en memoria con TTL y dedupe de concurrentes.
   - Crear incidencias con multipart real cuando hay adjuntos.
   - Cargar detalle, comentar, reabrir, subir adjuntos.
   - Abrir/descargar adjuntos.
   - Buscar usuarios para creación admin.
   - Sin DOM, sin Router, sin Store, sin fetch propio.
========================================================= */

import Http from "../../core/http.js";

export const INCIDENCIAS_API_VERSION = "incidencias.api.paint-safe.v11.no-array-flatten";
export const INCIDENCIAS_ENDPOINT = "/api/tickets";
export const USERS_SEARCH_ENDPOINT = "/api/users";

export const USERS_SEARCH_LIMIT = 8;
export const USERS_SEARCH_MIN_LENGTH = 2;

export const INCIDENCIAS_TIMEOUT = 15000;
export const INCIDENCIAS_DETAIL_TIMEOUT = 25000;
export const INCIDENCIAS_UPLOAD_TIMEOUT = 180000;

export const INCIDENCIAS_LIST_LIMIT = 48;
export const INCIDENCIAS_CACHE_TTL_MS = 60000;

const DEFAULT_CURRENCY = "EUR";
const DEFAULT_STATUS = "open";
const DEFAULT_PRIORITY = "medium";
const DEFAULT_CATEGORY = "general";

const FIXED_TECHNICIAN = Object.freeze({
  id: "ON-20260218164977",
  userId: "ON-20260218164977",
  name: "Cristian Ávila Luque",
  nombre: "Cristian Ávila Luque",
  displayName: "Cristian Ávila Luque",
  email: "cristian@onionsupport.com",
  emailLower: "cristian@onionsupport.com",
  avatar: "https://onionassets.blob.core.windows.net/avatars/ON-20260218164977/avatar.png",
  avatarUrl: "https://onionassets.blob.core.windows.net/avatars/ON-20260218164977/avatar.png",
  hasAvatar: true,
  role: "admin",
  display: "Cristian Ávila Luque <cristian@onionsupport.com>",
});

let loading = false;
let lastLoadedAt = null;
let lastError = null;
let lastCacheKey = "";
let inFlightListPromise = null;
let inFlightListKey = "";

let lastList = {
  items: [],
  total: 0,
};

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isBlob(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function isFile(value) {
  return typeof File !== "undefined" && value instanceof File;
}

function isFileLike(value = null) {
  if (!value || typeof value !== "object") return false;
  if (isFile(value) || isBlob(value)) return true;

  return Boolean(
    typeof value.name === "string" &&
      typeof value.size === "number" &&
      (
        typeof value.arrayBuffer === "function" ||
        typeof value.stream === "function" ||
        typeof value.slice === "function"
      )
  );
}

function safeArray(value) {
  if (Array.isArray(value)) return value;

  if (
    value &&
    typeof value === "object" &&
    typeof value.length === "number" &&
    typeof value !== "string"
  ) {
    try {
      return Array.from(value);
    } catch {
      return [];
    }
  }

  return [];
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

/*
  IMPORTANTE:
  No aplanar arrays aquí. El bug que dejaba la tabla en 0/18 venía de
  first(...values.flat(Infinity)): cuando el backend devolvía items: [..],
  first(items, ...) devolvía el primer ticket, y safeArray(ticket) => [].
*/
function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

function number(value = 0, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;

  if (typeof value === "string") {
    let clean = value
      .trim()
      .replace(/[€$£¥%]/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s+/g, "");

    if (!clean || clean === "-" || clean === "+") return fallback;

    const hasComma = clean.includes(",");
    const hasDot = clean.includes(".");

    if (hasComma && hasDot) {
      const lastComma = clean.lastIndexOf(",");
      const lastDot = clean.lastIndexOf(".");
      clean = lastComma > lastDot
        ? clean.replace(/\./g, "").replace(/,/g, ".")
        : clean.replace(/,/g, "");
    } else if (hasComma) {
      clean = clean.replace(/,/g, ".");
    }

    const parsed = Number(clean);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function now() {
  return Date.now();
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function normalizeSearch(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@._ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(value = "") {
  const email = cleanText(value, "").toLowerCase();
  if (!email) return "";

  if (["null", "undefined", "none", "sin email", "no email", "no_email", "__no_email__"].includes(email)) {
    return "";
  }

  return email.includes("@") ? email : "";
}

function firstEmail(...values) {
  for (const value of values) {
    const email = normalizeEmail(value);
    if (email) return email;
  }

  return "";
}

function redact(value = "") {
  return String(value ?? "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function safePublicText(value = "", fallback = "") {
  const text = redact(cleanText(value, ""));
  if (!text) return fallback;

  if (/[?&#](?:token|access_token|refresh_token|password|secret|sig|signature)=/i.test(text)) {
    return fallback;
  }

  return text;
}

function safeUrl(value = "") {
  const raw = cleanText(value, "");
  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return "";
  if (/[?&#](?:token|access_token|refresh_token|password|secret|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i.test(raw)) return "";
  if (/^blob:/i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");

  if (/^https:\/\//i.test(raw)) {
    try { return new URL(raw).href; } catch { return ""; }
  }

  if (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(raw)) {
    try { return new URL(raw).href; } catch { return ""; }
  }

  return "";
}

function firstUrl(...values) {
  const stack = [...values];

  while (stack.length) {
    const value = stack.shift();
    if (value === undefined || value === null) continue;

    if (isObject(value)) {
      stack.unshift(
        value.avatarUrl,
        value.avatar,
        value.photoUrl,
        value.photoURL,
        value.imageUrl,
        value.picture,
        value.viewUrl,
        value.openUrl,
        value.downloadUrl,
        value.signedUrl,
        value.blobUrl,
        value.publicUrl,
        value.url,
        value.href,
        value.src,
        value.profile?.avatarUrl,
        value.profile?.avatar,
        value.profile?.photoUrl,
        value.profile?.photoURL,
        value.profile?.picture
      );
      continue;
    }

    const url = safeUrl(value);
    if (url) return url;
  }

  return "";
}

function countFrom(...values) {
  return Math.max(0, ...values.map((value) => number(value, 0)));
}

function encodeSegment(value = "") {
  const clean = cleanText(value, "");
  if (!clean) throw new Error("INCIDENCIA_ID_REQUIRED");
  return encodeURIComponent(clean);
}

function stableSerialize(value = null) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${key}:${stableSerialize(value[key])}`)
    .join(",")}}`;
}

/* =========================================================
   ENDPOINTS
========================================================= */

function normalizeIncidenciaId(id = "") {
  return cleanText(id, "");
}

function getIncidenciaEndpoint(id = "") {
  return `${INCIDENCIAS_ENDPOINT}/${encodeSegment(normalizeIncidenciaId(id))}`;
}

function getIncidenciaCommentsEndpoint(id = "") {
  return `${getIncidenciaEndpoint(id)}/comments`;
}

function getIncidenciaReopenEndpoint(id = "") {
  return `${getIncidenciaEndpoint(id)}/reopen`;
}

function getIncidenciaAttachmentsEndpoint(id = "") {
  return `${getIncidenciaEndpoint(id)}/attachments`;
}

function getIncidenciaAttachmentFileEndpoint({
  ticketId = "",
  attachmentId = "",
  mode = "view",
  kind = "attachments",
} = {}) {
  const safeMode = mode === "download" ? "download" : "view";
  const safeKind = ["attachments", "files", "adjuntos", "attachment", "file", "adjunto"].includes(kind)
    ? kind
    : "attachments";

  return `${getIncidenciaEndpoint(ticketId)}/${encodeSegment(safeKind)}/${encodeSegment(attachmentId)}/${safeMode}`;
}

/* =========================================================
   CACHE
========================================================= */

function cacheAgeMs() {
  if (!lastLoadedAt) return Number.POSITIVE_INFINITY;
  const time = Date.parse(lastLoadedAt);
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return Math.max(0, now() - time);
}

function buildListQuery({ query = {}, params = {}, ...rest } = {}) {
  const restQuery = {};

  for (const key of [
    "q",
    "search",
    "status",
    "estado",
    "priority",
    "prioridad",
    "category",
    "categoria",
    "tipo",
    "debug",
    "limit",
    "fetchLimit",
    "active",
    "activeOnly",
    "closed",
    "withAttachments",
    "withComments",
    "withInvoices",
    "assigned",
  ]) {
    if (rest[key] !== undefined) restQuery[key] = rest[key];
  }

  return {
    limit: INCIDENCIAS_LIST_LIMIT,
    includeTotal: true,
    sortBy: "updatedAt",
    sortDir: "DESC",
    ...safeObject(params),
    ...restQuery,
    ...safeObject(query),
  };
}

function listCacheKey(options = {}) {
  return stableSerialize(buildListQuery(options));
}

function isCacheFresh(options = {}) {
  if (!lastLoadedAt) return false;

  const key = listCacheKey(options);
  if (lastCacheKey && key && lastCacheKey !== key) return false;

  const ttl = number(options.ttlMs ?? options.cacheTtlMs, INCIDENCIAS_CACHE_TTL_MS);
  if (ttl <= 0) return false;

  return cacheAgeMs() <= ttl;
}

function cachedListResponse({ cached = true, stale = false, error = null, options = {} } = {}) {
  const items = safeArray(lastList.items);
  const total = Math.max(number(lastList.total, items.length), items.length);

  return {
    ok: !error,
    cached,
    stale,
    items,
    total,
    count: items.length,
    loadedAt: lastLoadedAt,
    ...(error ? { error } : {}),
    cache: {
      hydrated: Boolean(lastLoadedAt),
      key: lastCacheKey,
      ageMs: cacheAgeMs(),
      ttlMs: number(options.ttlMs ?? options.cacheTtlMs, INCIDENCIAS_CACHE_TTL_MS),
      fresh: !stale && !error && isCacheFresh(options),
    },
  };
}

function setListCache({ items = [], total = 0, key = "" } = {}) {
  const normalizedItems = normalizeList(items);

  lastList = {
    items: normalizedItems,
    total: Math.max(number(total, normalizedItems.length), normalizedItems.length),
  };

  lastLoadedAt = nowIso();
  lastCacheKey = cleanText(key, "");

  return lastList;
}

export function hydrateIncidenciasFromCache() {
  const items = safeArray(lastList.items);

  return {
    ok: Boolean(lastLoadedAt),
    cached: true,
    stale: !lastLoadedAt,
    items,
    total: Math.max(number(lastList.total, items.length), items.length),
    count: items.length,
    loadedAt: lastLoadedAt,
    loading,
    error: lastError,
    cache: {
      hydrated: Boolean(lastLoadedAt),
      key: lastCacheKey,
      ageMs: cacheAgeMs(),
      ttlMs: INCIDENCIAS_CACHE_TTL_MS,
      fresh: Boolean(lastLoadedAt) && cacheAgeMs() <= INCIDENCIAS_CACHE_TTL_MS,
    },
  };
}

export function clearIncidenciasCache() {
  lastList = { items: [], total: 0 };
  lastLoadedAt = null;
  lastError = null;
  lastCacheKey = "";
  inFlightListPromise = null;
  inFlightListKey = "";
  loading = false;
  return true;
}

/* =========================================================
   PAYLOAD READERS
========================================================= */

function responseLooksFailed(response = {}) {
  const raw = safeObject(response);
  return raw.ok === false || raw.success === false || raw.error === true;
}

function responseErrorMessage(response = {}, fallback = "La operación no se pudo completar.") {
  const source = safeObject(response);

  return cleanText(
    first(
      source.message,
      source.errorMessage,
      source.error_description,
      source.detail,
      source.title,
      typeof source.error === "string" ? source.error : "",
      fallback
    ),
    fallback
  );
}

function collectArraysDeep(value = null, seen = new WeakSet()) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return [value];
  if (typeof value !== "object") return [];
  if (isBlob(value) || isFile(value)) return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const object = safeObject(value, {});
  const arrays = [];

  for (const key of [
    "items",
    "rows",
    "records",
    "results",
    "docs",
    "documents",
    "value",
    "list",
    "tickets",
    "incidencias",
  ]) {
    if (Array.isArray(object[key])) arrays.push(object[key]);
  }

  for (const key of ["data", "payload", "result", "response", "body"]) {
    const nested = object[key];
    if (nested && typeof nested === "object") arrays.push(...collectArraysDeep(nested, seen));
  }

  return arrays;
}

function listFromPayload(payload = null) {
  const candidates = collectArraysDeep(payload);
  const nonEmpty = candidates.find((candidate) => Array.isArray(candidate) && candidate.length > 0);
  if (nonEmpty) return nonEmpty;

  return candidates.find(Array.isArray) || [];
}

function usersListFromPayload(payload = null) {
  const object = safeObject(payload, {});
  const data = safeObject(object.data, {});

  const candidates = [
    object.items,
    object.results,
    object.users,
    object.usuarios,
    data.items,
    data.results,
    data.users,
    data.usuarios,
    Array.isArray(object.data) ? object.data : null,
  ].filter(Array.isArray);

  return candidates.find((candidate) => candidate.length > 0) || [];
}

function totalFromPayload(payload = null, fallback = 0) {
  const queue = [payload];
  const seen = new WeakSet();
  let best = number(fallback, 0);

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    if (seen.has(current)) continue;
    seen.add(current);

    const object = safeObject(current, {});

    best = Math.max(
      best,
      number(object.total, 0),
      number(object.count, 0),
      number(object.totalCount, 0),
      number(object.remoteCount, 0),
      number(object.meta?.total, 0),
      number(object.meta?.count, 0),
      number(object.meta?.totalCount, 0),
      number(object.pagination?.total, 0),
      number(object.pagination?.totalCount, 0),
      number(object.page?.total, 0)
    );

    for (const key of ["data", "payload", "result", "response", "body"]) {
      const nested = object[key];
      if (nested && typeof nested === "object" && !Array.isArray(nested)) queue.push(nested);
    }
  }

  return Math.max(best, fallback);
}

function detailFromPayload(payload = null) {
  if (!payload) return null;

  if (Array.isArray(payload)) return safeObject(payload[0], null);

  const object = safeObject(payload, null);
  if (!object) return null;

  const direct = first(
    object.ticket,
    object.item,
    object.detail,
    object.incidencia,
    object.data?.ticket,
    object.data?.item,
    object.data?.detail,
    object.data?.incidencia,
    object.resource,
    object.result?.ticket,
    object.result?.item,
    object.result?.detail,
    object.result?.incidencia
  );

  if (direct) return safeObject(direct, direct);

  if (looksLikeIncidencia(object)) return object;
  if (looksLikeIncidencia(object.data)) return object.data;
  if (looksLikeIncidencia(object.result)) return object.result;

  return null;
}

function fileFromPayload(payload = null) {
  const object = safeObject(payload, {});
  const data = safeObject(object.data, {});

  return safeObject(
    first(
      object.file,
      object.attachment,
      object.adjunto,
      data.file,
      data.attachment,
      data.adjunto,
      data,
      object
    ),
    {}
  );
}

function looksLikeIncidencia(value = null) {
  const item = safeObject(value, null);
  if (!item) return false;

  return Boolean(
    item.ticketId ||
      item.incidenciaId ||
      item.id ||
      item._id ||
      item.code ||
      item.numero ||
      item.ticketCode ||
      item.subject ||
      item.asunto ||
      item.title ||
      item.message ||
      item.description ||
      item.descripcion
  );
}

/* =========================================================
   NORMALIZE USERS
========================================================= */

function normalizeCreateSearchUser(user = {}) {
  const raw = safeObject(user);

  const userId = cleanText(
    first(raw.userId, raw.id, raw.uid, raw.sub, raw.usuarioId, raw.auth?.userId, raw.profile?.userId, raw.lookup?.userId, raw.raw?.userId, raw.raw?.id),
    ""
  );

  const clienteId = cleanText(
    first(raw.targetClienteId, raw.clienteId, raw.clientId, raw.customerId, raw.cliente?.clienteId, raw.cliente?.id, raw.client?.clienteId, raw.client?.id, raw.tenant?.clienteId, raw.lookup?.clienteId, raw.raw?.clienteId, raw.raw?.cliente?.clienteId, raw.raw?.cliente?.id),
    ""
  );

  const name = cleanText(
    first(
      raw.displayName,
      raw.fullName,
      raw.name,
      raw.nombre,
      raw.publicName,
      raw.clienteNombre,
      raw.clientName,
      [raw.firstName, raw.lastName].filter(Boolean).join(" "),
      [raw.nombre, raw.apellidos].filter(Boolean).join(" "),
      raw.profile?.displayName,
      raw.profile?.name,
      raw.lookup?.displayName,
      raw.raw?.displayName,
      raw.raw?.name,
      raw.raw?.nombre,
      raw.username,
      userId
    ),
    "Usuario"
  );

  const email = firstEmail(raw.email, raw.emailLower, raw.userEmail, raw.clienteEmail, raw.clientEmail, raw.profile?.email, raw.lookup?.email, raw.raw?.email, raw.raw?.emailLower);
  const username = cleanText(first(raw.username, raw.usernameLower, raw.profile?.username, raw.raw?.username), "");
  const avatar = firstUrl(raw, raw.raw, raw.profile, raw.cliente, raw.client);
  const role = normalizeKey(first(raw.role, raw.rol, raw.raw?.role, raw.raw?.rol, "user")) || "user";
  const phone = cleanText(first(raw.phone, raw.telefono, raw.raw?.phone, raw.raw?.telefono), "");

  return {
    id: userId,
    userId,
    uid: userId,
    targetUserId: userId,
    clienteId,
    targetClienteId: clienteId,
    clientId: clienteId,
    name,
    nombre: name,
    fullName: name,
    displayName: name,
    email,
    emailLower: email,
    username,
    usernameLower: username.toLowerCase(),
    role,
    rol: role,
    phone,
    telefono: phone,
    avatar,
    avatarUrl: avatar,
    hasAvatar: Boolean(avatar),
    raw,
  };
}

function buildUsersSearchQuery(query = "", limit = USERS_SEARCH_LIMIT) {
  return {
    q: query,
    search: query,
    query,
    term: query,
    text: query,
    keyword: query,
    limit,
    includeTotal: false,
  };
}

export async function searchIncidenciaUsers(query = "", options = {}) {
  const q = cleanText(query, "");
  const limit = Math.max(1, Math.min(number(options.limit, USERS_SEARCH_LIMIT), 20));

  if (q.length < USERS_SEARCH_MIN_LENGTH) return [];

  const response = await getJson(USERS_SEARCH_ENDPOINT, {
    timeout: options.timeout || INCIDENCIAS_TIMEOUT,
    query: buildUsersSearchQuery(q, limit),
    source: "views.incidencias.users.search",
  });

  if (responseLooksFailed(response)) throw new Error(responseErrorMessage(response));

  return usersListFromPayload(response)
    .map(normalizeCreateSearchUser)
    .filter((user) => user.userId || user.id)
    .slice(0, limit);
}

/* =========================================================
   NORMALIZE TICKETS
========================================================= */

function unwrapTicket(value = {}) {
  const raw = safeObject(value, {});

  return safeObject(
    first(
      raw.ticket,
      raw.incidencia,
      raw.item,
      raw.detail,
      raw.data?.ticket,
      raw.data?.incidencia,
      raw.data?.item,
      raw.data,
      raw
    ),
    raw
  );
}

function getTicketId(item = {}) {
  const raw = unwrapTicket(item);
  return cleanText(first(raw.ticketId, raw.incidenciaId, raw.id, raw._id, raw.code, raw.numero, raw.ticketCode, raw.reference, raw.ref), "");
}

function normalizeStatus(value = "") {
  const k = normalizeKey(value || DEFAULT_STATUS);
  const map = {
    open: "open",
    opened: "open",
    abierta: "open",
    abierto: "open",
    pending: "pending",
    pendiente: "pending",
    new: "pending",
    nueva: "pending",
    nuevo: "pending",
    in_progress: "in_progress",
    inprogress: "in_progress",
    progress: "in_progress",
    proceso: "in_progress",
    en_proceso: "in_progress",
    working: "in_progress",
    assigned: "in_progress",
    asignada: "in_progress",
    asignado: "in_progress",
    resolved: "closed",
    resuelta: "closed",
    resuelto: "closed",
    solved: "closed",
    closed: "closed",
    close: "closed",
    cerrada: "closed",
    cerrado: "closed",
    cancelled: "closed",
    canceled: "closed",
    cancelada: "closed",
    cancelado: "closed",
    archived: "closed",
    archivada: "closed",
    archivado: "closed",
  };

  return map[k] || k || DEFAULT_STATUS;
}

function normalizePriority(value = "") {
  const k = normalizeKey(value || DEFAULT_PRIORITY);
  const map = {
    baja: "low",
    low: "low",
    minor: "low",
    p3: "low",
    media: "medium",
    normal: "medium",
    medium: "medium",
    p2: "medium",
    alta: "high",
    high: "high",
    p1: "high",
    urgente: "urgent",
    urgent: "urgent",
    critical: "urgent",
    critica: "urgent",
    critico: "urgent",
    crítico: "urgent",
    crítica: "urgent",
    p0: "urgent",
  };

  return map[k] || k || DEFAULT_PRIORITY;
}

function normalizeCategory(value = "") {
  return normalizeKey(value || DEFAULT_CATEGORY) || DEFAULT_CATEGORY;
}

function normalizePerson(value = {}) {
  const raw = safeObject(value);
  const userId = cleanText(first(raw.userId, raw.id, raw.uid, raw.sub), "");
  const name = cleanText(first(raw.name, raw.nombre, raw.displayName, raw.fullName), "");
  const email = firstEmail(raw.email, raw.emailLower, raw.mail);
  const avatar = firstUrl(raw.avatarUrl, raw.avatar, raw.picture, raw.photoUrl, raw.photoURL, raw.imageUrl, raw);
  const role = normalizeKey(first(raw.role, raw.rol, ""));

  return {
    id: userId || null,
    userId: userId || null,
    name,
    nombre: name,
    displayName: name,
    email,
    emailLower: email,
    avatar: avatar || null,
    avatarUrl: avatar || null,
    hasAvatar: Boolean(avatar),
    role,
  };
}

function normalizeTechnician(item = {}) {
  const raw = unwrapTicket(item);
  const assignment = safeObject(raw.assignment);

  const base = normalizePerson(
    first(
      raw.tecnico,
      raw.assignedTo,
      raw.technician,
      raw.agent,
      assignment.technician,
      assignment.assignedTo,
      {}
    )
  );

  const userId = cleanText(
    first(raw.assignedToUserId, raw.technicianUserId, raw.tecnicoUserId, assignment.assignedToUserId, assignment.userId, base.userId, FIXED_TECHNICIAN.userId),
    FIXED_TECHNICIAN.userId
  );

  const name = cleanText(
    first(raw.assignedToName, raw.technicianName, raw.tecnicoName, raw.agentName, assignment.assignedToName, assignment.technicianName, assignment.name, base.name, FIXED_TECHNICIAN.name),
    FIXED_TECHNICIAN.name
  );

  const email = firstEmail(raw.assignedToEmail, raw.technicianEmail, raw.tecnicoEmail, raw.agentEmail, assignment.assignedToEmail, assignment.technicianEmail, assignment.email, base.email, FIXED_TECHNICIAN.email);
  const avatar = firstUrl(raw.assignedToAvatarUrl, raw.assignedToAvatar, raw.technicianAvatarUrl, raw.technicianAvatar, raw.tecnicoAvatarUrl, raw.tecnicoAvatar, raw.agentAvatarUrl, raw.agentAvatar, assignment.assignedToAvatarUrl, assignment.assignedToAvatar, assignment.technicianAvatarUrl, assignment.technicianAvatar, assignment.avatarUrl, assignment.avatar, base.avatarUrl, FIXED_TECHNICIAN.avatarUrl);
  const role = normalizeKey(first(base.role, FIXED_TECHNICIAN.role)) || FIXED_TECHNICIAN.role;

  return {
    id: userId || null,
    userId: userId || null,
    name,
    nombre: name,
    displayName: name,
    email,
    emailLower: email,
    avatar: avatar || null,
    avatarUrl: avatar || null,
    hasAvatar: Boolean(avatar),
    role,
    display: email ? `${name} <${email}>` : name,
    assigned: Boolean(userId || email || name),
  };
}

function normalizeAttachment(file = {}, index = 0) {
  const raw = safeObject(file);
  const id = cleanText(first(raw.id, raw.attachmentId, raw.fileId, `att_${index}`), `att_${index}`);
  const name = safePublicText(first(raw.name, raw.filename, raw.fileName, raw.originalName, `Adjunto ${index + 1}`), `Adjunto ${index + 1}`);
  const contentType = cleanText(first(raw.contentType, raw.mimeType, raw.mimetype, raw.type), "");
  const url = firstUrl(raw.viewUrl, raw.openUrl, raw.downloadUrl, raw.url, raw.blobUrl, raw.publicUrl, raw.signedUrl);
  const path = safePublicText(first(raw.path, raw.blobPath, raw.blobName, raw.storagePath, raw.storageKey), "");

  return {
    ...raw,
    id,
    attachmentId: id,
    name,
    filename: name,
    fileName: name,
    originalName: safePublicText(first(raw.originalName, name), name),
    size: number(first(raw.size, raw.sizeBytes), 0),
    sizeBytes: number(first(raw.sizeBytes, raw.size), 0),
    contentType,
    mimeType: contentType,
    mimetype: contentType,
    type: cleanText(raw.type, contentType),
    url,
    viewUrl: firstUrl(raw.viewUrl, url),
    openUrl: firstUrl(raw.openUrl, url),
    downloadUrl: firstUrl(raw.downloadUrl, url),
    blobUrl: firstUrl(raw.blobUrl, url),
    publicUrl: firstUrl(raw.publicUrl, url),
    path,
    blobPath: safePublicText(first(raw.blobPath, path), path),
    blobName: safePublicText(first(raw.blobName, path), path),
    storagePath: safePublicText(first(raw.storagePath, path), path),
    storageKey: safePublicText(first(raw.storageKey, path), path),
    containerName: cleanText(first(raw.containerName, raw.container, "tickets"), "tickets"),
    isImage: Boolean(raw.isImage || contentType.startsWith("image/")),
    isVideo: Boolean(raw.isVideo || contentType.startsWith("video/")),
    isPdf: Boolean(raw.isPdf || contentType === "application/pdf"),
    uploadedAt: cleanText(first(raw.uploadedAt, raw.createdAt), ""),
  };
}

function normalizeRequester(item = {}) {
  const raw = unwrapTicket(item);
  const snap = safeObject(first(raw.requesterSnapshot, raw.cliente, raw.receptor, raw.user, {}));

  const userId = cleanText(first(raw.userId, raw.usuarioId, raw.ownerUserId, snap.userId, snap.id, snap.uid), "");
  const clienteId = cleanText(first(raw.clienteId, raw.clientId, raw.customerId, snap.clienteId, snap.clientId), "");
  const name = safePublicText(first(raw.displayName, raw.name, raw.nombre, raw.clientName, raw.clienteNombre, snap.displayName, snap.name, snap.nombre, raw.email, userId), "Usuario");
  const email = firstEmail(raw.email, raw.emailLower, raw.userEmail, raw.clienteEmail, snap.email, snap.emailLower);
  const username = cleanText(first(raw.username, raw.usernameLower, snap.username, snap.usernameLower), "");
  const phone = cleanText(first(raw.phone, raw.telefono, snap.phone, snap.telefono), "");
  const avatar = firstUrl(raw.avatarUrl, raw.avatar, raw.userAvatarUrl, raw.userAvatar, raw.clienteAvatarUrl, raw.clienteAvatar, snap.avatarUrl, snap.avatar, snap.picture, snap.photoUrl, snap.photoURL);
  const role = normalizeKey(first(raw.role, raw.rol, snap.role, snap.rol, "user")) || "user";

  return {
    id: userId || null,
    userId: userId || null,
    clienteId: clienteId || null,
    name,
    nombre: name,
    displayName: name,
    email: email || null,
    emailLower: email || null,
    username: username || null,
    usernameLower: username ? username.toLowerCase() : null,
    phone: phone || null,
    telefono: phone || null,
    avatar: avatar || null,
    avatarUrl: avatar || null,
    hasAvatar: Boolean(avatar),
    role,
    active: raw.active !== false && snap.active !== false,
    tipo: cleanText(first(raw.tipo, snap.tipo), ""),
    nif: cleanText(first(raw.nif, snap.nif), ""),
  };
}

function incidenciaSortTime(item = {}) {
  const raw = unwrapTicket(item);
  const ms = Date.parse(first(raw.lastActivityAt, raw.updatedAt, raw.modifiedAt, raw.closedAt, raw.createdAt, raw.lifecycle?.lastActivityAt, raw.lifecycle?.updatedAt, raw.lifecycle?.closedAt, raw.lifecycle?.createdAt, 0));
  if (Number.isFinite(ms)) return ms;

  const ts = number(raw._ts, 0);
  return ts > 0 ? ts * 1000 : 0;
}

function mergeIncidenciaData(current = {}, next = {}) {
  return {
    ...safeObject(current),
    ...safeObject(next),
    meta: {
      ...safeObject(current.meta),
      ...safeObject(next.meta),
    },
  };
}

export function normalizeIncidencia(item = {}) {
  const raw = unwrapTicket(item);
  const ticketId = getTicketId(raw);

  if (!ticketId && !looksLikeIncidencia(raw)) return null;

  const id = ticketId || cleanText(first(raw.id, raw._id), "");
  const finalId = id || `INC-${Math.abs(JSON.stringify(raw).length)}-${Date.now()}`;

  const subject = safePublicText(first(raw.subject, raw.asunto, raw.title, raw.titulo, raw.name), "Incidencia");
  const description = safePublicText(first(raw.description, raw.descripcion, raw.message, raw.preview, raw.text, raw.body), "Sin descripción.");
  const status = normalizeStatus(first(raw.status, raw.estado, raw.state, raw.lifecycle?.status, DEFAULT_STATUS));
  const priority = normalizePriority(first(raw.priority, raw.prioridad, raw.severity, raw.urgency, raw.sla?.priority, DEFAULT_PRIORITY));
  const category = normalizeCategory(first(raw.category, raw.categoria, raw.tipo, raw.type, raw.subcategory, DEFAULT_CATEGORY));
  const type = normalizeCategory(first(raw.tipo, raw.type, category, DEFAULT_CATEGORY));

  const requester = normalizeRequester(raw);
  const technician = normalizeTechnician(raw);
  const attachments = safeArray(first(raw.attachments, raw.files, raw.adjuntos, [])).map(normalizeAttachment);

  const attachmentsCount = countFrom(attachments.length, raw.attachmentsCount, raw.attachmentCount, raw.filesCount, raw.adjuntosCount, raw.meta?.attachmentsCount, raw.meta?.filesCount);
  const comments = safeArray(first(raw.comments, raw.notes, raw.messages, []));
  const history = safeArray(first(raw.history, raw.events, []));
  const commentsCount = countFrom(comments.length, raw.commentsCount, raw.meta?.commentsCount);
  const historyCount = countFrom(history.length, raw.historyCount, raw.meta?.historyCount);

  const invoices = safeArray(first(raw.invoices, raw.facturas, raw.linkedInvoices?.items, []));
  const invoicesCount = countFrom(raw.facturasCount, raw.invoicesCount, raw.linkedInvoicesCount, raw.linkedInvoices?.count, invoices.length);
  const invoiceTotal = number(first(raw.facturasTotal, raw.invoicesTotal, raw.importeFacturas, raw.invoiceTotal, raw.facturaTotal, raw.facturaImporte, raw.importeFactura, raw.totalFactura, raw.invoiceAmount, raw.linkedInvoicesTotal, raw.linkedInvoicesAmount, raw.linkedInvoicesImporte, raw.linkedInvoices?.total, raw.linkedInvoices?.amount, raw.meta?.invoicesTotal, raw.meta?.invoiceTotal, 0), 0);
  const currency = cleanText(first(raw.currency, raw.moneda, raw.facturaCurrency, raw.facturaMoneda, raw.linkedInvoicesCurrency, raw.linkedInvoicesMoneda, raw.linkedInvoices?.currency, raw.linkedInvoices?.moneda, raw.meta?.invoiceCurrency, DEFAULT_CURRENCY), DEFAULT_CURRENCY).toUpperCase();

  const createdAt = first(raw.createdAt, raw.fechaCreacion, raw.created_at, raw.lifecycle?.createdAt, null);
  const updatedAt = first(raw.updatedAt, raw.updated_at, raw.modifiedAt, raw.lastActivityAt, raw.lifecycle?.updatedAt, null);
  const lastActivityAt = first(raw.lastActivityAt, raw.lifecycle?.lastActivityAt, updatedAt, createdAt, null);
  const closedAt = first(raw.closedAt, raw.resolvedAt, raw.lifecycle?.closedAt, raw.lifecycle?.resolvedAt, null);

  const requesterSnapshot = {
    ...safeObject(raw.requesterSnapshot),
    ...requester,
  };

  const cliente = {
    ...safeObject(raw.cliente || raw.client),
    id: first(raw.cliente?.id, requester.clienteId, requester.userId, null),
    userId: requester.userId,
    clienteId: requester.clienteId,
    name: requester.name,
    nombre: requester.name,
    displayName: requester.displayName,
    email: requester.email,
    emailLower: requester.emailLower,
    username: requester.username,
    usernameLower: requester.usernameLower,
    phone: requester.phone,
    telefono: requester.phone,
    avatar: requester.avatar,
    avatarUrl: requester.avatarUrl,
    hasAvatar: requester.hasAvatar,
    active: requester.active,
    tipo: requester.tipo || type,
    nif: requester.nif || "",
  };

  const assignment = {
    ...safeObject(raw.assignment),
    status: "assigned",
    policy: cleanText(raw.assignment?.policy || raw.meta?.assignmentPolicy || "fixed_default_technician", "fixed_default_technician"),
    assignedToUserId: technician.userId,
    userId: technician.userId,
    assignedToName: technician.name,
    assignedToEmail: technician.email,
    assignedToAvatar: technician.avatarUrl || null,
    assignedToAvatarUrl: technician.avatarUrl || null,
    technicianAvatar: technician.avatarUrl || null,
    technicianAvatarUrl: technician.avatarUrl || null,
    agentAvatar: technician.avatarUrl || null,
    agentAvatarUrl: technician.avatarUrl || null,
    avatar: technician.avatarUrl || null,
    avatarUrl: technician.avatarUrl || null,
    assignedToHasAvatar: technician.hasAvatar,
    team: cleanText(first(raw.assignment?.team, "support"), "support"),
    assignedTo: technician,
    technician,
  };

  return {
    ...raw,

    id: finalId,
    ticketId: finalId,
    incidenciaId: finalId,
    entityId: finalId,

    entityType: cleanText(first(raw.entityType, "ticket"), "ticket"),
    tipoDocumento: cleanText(first(raw.tipoDocumento, "ticket"), "ticket"),
    schemaVersion: number(raw.schemaVersion, number(raw.meta?.schemaVersion, 1)),

    subject,
    asunto: subject,
    title: subject,

    description,
    descripcion: description,
    message: description,
    preview: safePublicText(first(raw.preview, description.slice(0, 280)), description.slice(0, 280)),

    status,
    estado: status,
    statusKey: cleanText(first(raw.statusKey, status), status),
    statusReason: cleanText(first(raw.statusReason, raw.motivoEstado), ""),

    priority,
    prioridad: priority,
    priorityKey: cleanText(first(raw.priorityKey, priority), priority),
    severity: cleanText(first(raw.severity, priority), priority),

    category,
    categoria: category,
    tipo: type,
    type,
    subcategory: cleanText(first(raw.subcategory, raw.subcategoria), ""),
    tags: safeArray(raw.tags),

    source: cleanText(first(raw.source, raw.origen), ""),
    origen: cleanText(first(raw.origen, raw.source), ""),
    channel: cleanText(raw.channel, ""),

    userId: requester.userId,
    usuarioId: requester.userId,
    clienteId: requester.clienteId,
    clientId: requester.clienteId,

    requesterName: requester.name,
    requesterEmail: requester.email,
    requesterEmailLower: requester.emailLower,
    requesterAvatarUrl: requester.avatarUrl,
    requesterAvatar: requester.avatar,
    requesterUsername: requester.username,

    name: requester.name,
    displayName: requester.displayName,
    clientName: requester.name,
    clienteName: requester.name,
    clienteNombre: requester.name,
    userName: requester.name,

    email: requester.email,
    emailLower: requester.emailLower,
    clientEmail: requester.email,
    clienteEmail: requester.email,
    userEmail: requester.email,

    username: requester.username,
    usernameLower: requester.usernameLower,
    phone: requester.phone,
    telefono: requester.phone,

    avatar: requester.avatar,
    avatarUrl: requester.avatarUrl,
    clientAvatar: requester.avatar,
    clientAvatarUrl: requester.avatarUrl,
    clienteAvatar: requester.avatar,
    clienteAvatarUrl: requester.avatarUrl,
    userAvatar: requester.avatar,
    userAvatarUrl: requester.avatarUrl,
    hasAvatar: requester.hasAvatar,

    requesterSnapshot,
    cliente,
    client: cliente,
    receptor: {
      ...safeObject(raw.receptor),
      id: requester.userId,
      userId: requester.userId,
      clienteId: requester.clienteId,
      name: requester.name,
      displayName: requester.displayName,
      email: requester.email,
      username: requester.username,
      phone: requester.phone,
      avatar: requester.avatar,
      avatarUrl: requester.avatarUrl,
    },

    assignedTo: technician,
    tecnico: technician,
    technician,
    assignedTechnician: technician,
    assignment,

    assignedToUserId: technician.userId,
    assignedToName: technician.name,
    assignedToEmail: technician.email,
    assignedToAvatar: technician.avatarUrl || null,
    assignedToAvatarUrl: technician.avatarUrl,

    technicianName: technician.name,
    technicianEmail: technician.email,
    technicianAvatar: technician.avatarUrl || null,
    technicianAvatarUrl: technician.avatarUrl,

    tecnicoName: technician.name,
    tecnicoEmail: technician.email,
    tecnicoAvatar: technician.avatarUrl || null,
    tecnicoAvatarUrl: technician.avatarUrl,

    agentName: technician.name,
    agentEmail: technician.email,
    agentAvatar: technician.avatarUrl || null,
    agentAvatarUrl: technician.avatarUrl,

    invoiceId: cleanText(first(raw.invoiceId, raw.facturaId, raw.linkedInvoiceId, raw.linkedFacturaId), ""),
    facturaId: cleanText(first(raw.facturaId, raw.invoiceId, raw.linkedFacturaId, raw.linkedInvoiceId), ""),
    invoiceIds: safeArray(raw.invoiceIds),
    facturaIds: safeArray(raw.facturaIds),
    invoices,
    facturas: invoices,
    facturasCount: invoicesCount,
    invoicesCount,
    linkedInvoicesCount: invoicesCount,

    numeroFacturaLegal: cleanText(first(raw.numeroFacturaLegal, raw.numeroFactura, raw.invoiceNumber), ""),
    numeroFactura: cleanText(first(raw.numeroFactura, raw.numeroFacturaLegal, raw.invoiceNumber), ""),
    invoiceNumber: cleanText(first(raw.invoiceNumber, raw.numeroFacturaLegal, raw.numeroFactura), ""),

    invoiceTotal,
    invoicesTotal: invoiceTotal,
    facturasTotal: invoiceTotal,
    facturaTotal: invoiceTotal,
    facturaImporte: invoiceTotal,
    importeFactura: invoiceTotal,
    totalFactura: invoiceTotal,
    invoiceAmount: invoiceTotal,
    amount: invoiceTotal,
    total: invoiceTotal,
    importe: invoiceTotal,
    price: invoiceTotal,

    currency,
    moneda: currency,
    facturaCurrency: currency,
    facturaMoneda: currency,

    paymentStatus: cleanText(first(raw.paymentStatus, raw.estadoPago, raw.linkedInvoices?.paymentStatus), ""),

    attachments,
    files: attachments,
    adjuntos: attachments,
    attachmentsCount,
    attachmentCount: attachmentsCount,
    filesCount: attachmentsCount,
    adjuntosCount: attachmentsCount,

    comments,
    history,
    commentsCount,
    historyCount,

    createdAt,
    createdAtES: raw.createdAtES || null,
    updatedAt,
    updatedAtES: raw.updatedAtES || null,
    lastActivityAt,
    lastActivityAtES: raw.lastActivityAtES || raw.updatedAtES || null,
    closedAt,
    closedAtES: raw.closedAtES || null,

    lifecycle: {
      ...safeObject(raw.lifecycle),
      createdAt,
      createdAtES: raw.createdAtES || raw.lifecycle?.createdAtES || null,
      updatedAt,
      updatedAtES: raw.updatedAtES || raw.lifecycle?.updatedAtES || null,
      lastActivityAt,
      lastActivityAtES: raw.lastActivityAtES || raw.lifecycle?.lastActivityAtES || null,
      closedAt,
      closedAtES: raw.closedAtES || raw.lifecycle?.closedAtES || null,
    },

    meta: {
      ...safeObject(raw.meta),
      schemaVersion: number(raw.meta?.schemaVersion, number(raw.schemaVersion, 1)),
      frontendReady: true,
      hasAttachments: attachmentsCount > 0,
      hasComments: commentsCount > 0,
      hasHistory: historyCount > 0,
      hasFactura: invoicesCount > 0 || invoiceTotal > 0,
      hasLinkedInvoices: invoicesCount > 0 || invoiceTotal > 0,
      linkedInvoiceCount: invoicesCount,
      invoicesTotal: invoiceTotal,
      invoiceTotal,
      invoiceCurrency: currency,
      isClosed: status === "closed",
      isOpen: ["open", "pending", "in_progress"].includes(status),
      isAssigned: Boolean(technician.assigned),
      assignmentPolicy: assignment.policy,
      technicianUserId: technician.userId,
      technicianName: technician.name,
      technicianEmail: technician.email,
      technicianAvatar: technician.avatarUrl || null,
      technicianAvatarUrl: technician.avatarUrl || null,
      technicianHasAvatar: technician.hasAvatar,
      assignedTechnician: technician,
      assignedTechnicianUserId: technician.userId,
      assignedTechnicianName: technician.name,
      assignedTechnicianEmail: technician.email,
      assignedTechnicianAvatar: technician.avatarUrl || null,
      assignedTechnicianAvatarUrl: technician.avatarUrl || null,
      blobContainer: raw.meta?.blobContainer || attachments[0]?.containerName || "tickets",
      blobPathPolicy: raw.meta?.blobPathPolicy || raw.meta?.attachmentStoragePolicy || "userId_userName_ticketId_attachment",
      sortTs: incidenciaSortTime(raw),
    },
  };
}

function normalizeList(items = []) {
  const source = safeArray(items);
  const map = new Map();

  for (const item of source) {
    const normalized = normalizeIncidencia(item);
    if (!normalized) continue;

    const id = cleanText(first(normalized.ticketId, normalized.id), "");
    if (!id) continue;

    map.set(id, map.has(id) ? mergeIncidenciaData(map.get(id), normalized) : normalized);
  }

  return [...map.values()].sort((a, b) => {
    const diff = incidenciaSortTime(b) - incidenciaSortTime(a);
    if (diff !== 0) return diff;

    return getTicketId(b).localeCompare(getTicketId(a), "es", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function upsertCachedIncidencia(item = null) {
  const normalized = normalizeIncidencia(item);
  if (!normalized) return null;

  const id = getTicketId(normalized);
  if (!id) return normalized;

  const current = safeArray(lastList.items).filter((row) => getTicketId(row) !== id);
  const next = normalizeList([normalized, ...current]);

  lastList = {
    items: next,
    total: Math.max(number(lastList.total, next.length), next.length),
  };

  lastLoadedAt = lastLoadedAt || nowIso();

  return normalized;
}

/* =========================================================
   CREATE PAYLOAD / FORMDATA
========================================================= */

function normalizeFilesInput(value = null) {
  if (!value) return [];
  if (isFileLike(value)) return [value];
  if (typeof FileList !== "undefined" && value instanceof FileList) return Array.from(value).filter(isFileLike);
  if (Array.isArray(value)) return value.flatMap(normalizeFilesInput).filter(isFileLike);

  if (isObject(value) && typeof value.length === "number") {
    try { return Array.from(value).filter(isFileLike); } catch { return []; }
  }

  return [];
}

function extractFiles(payload = {}) {
  const source = safeObject(payload);
  return normalizeFilesInput(first(source.attachments, source.files, source.adjuntos, source.uploads, source.file, source.adjunto, []));
}

function dedupeFiles(files = []) {
  const map = new Map();

  for (const file of safeArray(files)) {
    if (!isFileLike(file)) continue;
    const key = [file.name || "archivo", file.size || 0, file.lastModified || 0, file.type || ""].join("::");
    if (!map.has(key)) map.set(key, file);
  }

  return [...map.values()];
}

function withoutFileFields(payload = {}) {
  const source = safeObject(payload);
  const output = {};

  for (const [key, value] of Object.entries(source)) {
    if (["files", "attachments", "adjuntos", "uploads", "file", "adjunto"].includes(key)) continue;
    if (value === undefined || value === null) continue;
    output[key] = value;
  }

  return output;
}

function normalizeCreatePayload(payload = {}) {
  const source = safeObject(payload);

  const subject = cleanText(first(source.subject, source.asunto, source.title), "");
  const description = cleanText(first(source.description, source.descripcion, source.message, source.body, source.text), "");
  const priority = normalizePriority(first(source.priority, source.prioridad, DEFAULT_PRIORITY));
  const status = normalizeStatus(first(source.status, source.estado, DEFAULT_STATUS));
  const category = normalizeCategory(first(source.category, source.categoria, source.tipo, DEFAULT_CATEGORY));
  const origin = cleanText(first(source.source, source.origen, source.channel, "panel_admin"), "panel_admin");

  const targetUserId = cleanText(first(source.targetUserId, source.receptorUserId, source.affectedUserId, source.usuarioId, source.userId, source.user?.userId, source.user?.id, source.usuario?.userId, source.usuario?.id), "");
  const targetClienteId = cleanText(first(source.targetClienteId, source.clienteId, source.clientId, source.customerId, source.cliente?.clienteId, source.cliente?.id, source.client?.clienteId, source.client?.id), "");
  const targetUserName = cleanText(first(source.targetUserName, source.receptorName, source.affectedUserName, source.userName, source.clienteNombre, source.clientName, source.name, source.nombre, source.user?.displayName, source.user?.name, source.cliente?.displayName, source.cliente?.name, source.cliente?.nombre), "");
  const targetUserEmail = firstEmail(source.targetUserEmail, source.receptorEmail, source.affectedUserEmail, source.userEmail, source.clienteEmail, source.clientEmail, source.email, source.emailLower, source.user?.email, source.cliente?.email, source.client?.email);
  const targetUserAvatar = firstUrl(source.targetUserAvatar, source.receptorAvatar, source.userAvatar, source.userAvatarUrl, source.clienteAvatar, source.clienteAvatarUrl, source.clientAvatar, source.clientAvatarUrl, source.avatar, source.avatarUrl, source.user?.avatarUrl, source.user?.avatar, source.cliente?.avatarUrl, source.cliente?.avatar, source.client?.avatar);

  const normalized = {
    ...withoutFileFields(source),

    subject,
    asunto: subject,
    title: subject,

    description,
    descripcion: description,
    message: description,
    body: description,
    text: description,

    priority,
    prioridad: priority,
    status,
    estado: status,
    category,
    categoria: category,
    tipo: category,
    type: category,

    source: origin,
    origen: origin,
    channel: origin,
    createSource: "incidencias_panel",
    blobContainer: "tickets",
    attachmentFieldName: "attachments",

    assignedToUserId: FIXED_TECHNICIAN.userId,
    assignedToName: FIXED_TECHNICIAN.name,
    assignedToEmail: FIXED_TECHNICIAN.email,
    assignmentPolicy: "fixed_default_technician",
  };

  if (targetUserId) {
    normalized.targetUserId = targetUserId;
    normalized.receptorUserId = targetUserId;
    normalized.affectedUserId = targetUserId;
    normalized.userId = targetUserId;
    normalized.usuarioId = targetUserId;
    normalized.uid = targetUserId;
  }

  if (targetClienteId) {
    normalized.targetClienteId = targetClienteId;
    normalized.clienteId = targetClienteId;
    normalized.clientId = targetClienteId;
    normalized.customerId = targetClienteId;
  }

  if (targetUserName) {
    normalized.targetUserName = targetUserName;
    normalized.receptorName = targetUserName;
    normalized.affectedUserName = targetUserName;
    normalized.userName = targetUserName;
    normalized.clienteNombre = targetUserName;
    normalized.clientName = targetUserName;
    normalized.name = targetUserName;
    normalized.nombre = targetUserName;
  }

  if (targetUserEmail) {
    normalized.targetUserEmail = targetUserEmail;
    normalized.receptorEmail = targetUserEmail;
    normalized.affectedUserEmail = targetUserEmail;
    normalized.userEmail = targetUserEmail;
    normalized.clienteEmail = targetUserEmail;
    normalized.clientEmail = targetUserEmail;
    normalized.email = targetUserEmail;
    normalized.emailLower = targetUserEmail;
  }

  if (targetUserAvatar) {
    normalized.targetUserAvatar = targetUserAvatar;
    normalized.receptorAvatar = targetUserAvatar;
    normalized.userAvatar = targetUserAvatar;
    normalized.userAvatarUrl = targetUserAvatar;
    normalized.clienteAvatar = targetUserAvatar;
    normalized.clienteAvatarUrl = targetUserAvatar;
    normalized.clientAvatar = targetUserAvatar;
    normalized.clientAvatarUrl = targetUserAvatar;
    normalized.avatar = targetUserAvatar;
    normalized.avatarUrl = targetUserAvatar;
  }

  return normalized;
}

function appendFormValue(formData, key = "", value = null) {
  if (!key || value === undefined || value === null) return false;
  if (isFileLike(value)) return false;

  if (typeof value === "object") {
    formData.append(key, JSON.stringify(value));
    return true;
  }

  formData.append(key, String(value));
  return true;
}

function buildFormData(payload = {}) {
  const files = dedupeFiles(extractFiles(payload));
  const cleanPayload = normalizeCreatePayload(payload);
  const formData = new FormData();

  for (const [key, value] of Object.entries(cleanPayload)) appendFormValue(formData, key, value);

  formData.append("hasAttachments", files.length ? "true" : "false");
  formData.append("attachmentsCount", String(files.length));

  for (const file of files) formData.append("attachments", file, file?.name || "archivo");

  return formData;
}

function buildMutationBody(payload = {}) {
  const files = dedupeFiles(extractFiles(payload));

  if (files.length && typeof FormData !== "undefined") {
    return { body: buildFormData(payload), hasFiles: true, filesCount: files.length };
  }

  return { body: normalizeCreatePayload(payload), hasFiles: false, filesCount: 0 };
}

function buildAttachmentsFormData(files = [], extra = {}) {
  const list = dedupeFiles(normalizeFilesInput(files));
  const formData = new FormData();

  formData.append("hasAttachments", list.length ? "true" : "false");
  formData.append("attachmentsCount", String(list.length));

  for (const file of list) formData.append("attachments", file, file?.name || "archivo");
  for (const [key, value] of Object.entries(safeObject(extra))) appendFormValue(formData, key, value);

  return formData;
}

/* =========================================================
   HTTP
========================================================= */

async function getJson(endpoint = "", options = {}) {
  return Http.get(endpoint, {
    timeout: options.timeout || INCIDENCIAS_TIMEOUT,
    query: safeObject(options.query || options.params),
    source: options.source || "views.incidencias",
  });
}

async function postJson(endpoint = "", body = {}, options = {}) {
  return Http.post(endpoint, body, {
    timeout: options.timeout || INCIDENCIAS_TIMEOUT,
    source: options.source || "views.incidencias",
  });
}

async function patchJson(endpoint = "", body = {}, options = {}) {
  return Http.patch(endpoint, body, {
    timeout: options.timeout || INCIDENCIAS_TIMEOUT,
    source: options.source || "views.incidencias",
  });
}

async function postMultipart(endpoint = "", formData = null, options = {}) {
  if (!formData || typeof FormData === "undefined" || !(formData instanceof FormData)) {
    return postJson(endpoint, formData, options);
  }

  return Http.post(endpoint, formData, {
    timeout: options.timeout || INCIDENCIAS_UPLOAD_TIMEOUT,
    source: options.source || "views.incidencias.multipart",
    multipart: true,
    formData: true,
    isFormData: true,
    rawBody: true,
    skipJson: true,
    skipContentType: true,
    headers: {},
  });
}

/* =========================================================
   LIST / DETAIL
========================================================= */

export async function fetchIncidenciasRequest(options = {}) {
  return getJson(INCIDENCIAS_ENDPOINT, {
    timeout: options.timeout || INCIDENCIAS_TIMEOUT,
    query: buildListQuery(options),
    source: "views.incidencias.list",
  });
}

export async function listIncidencias(options = {}) {
  const force = options.force === true || options.forceRefresh === true;
  const useCache = options.cache !== false && options.noCache !== true;
  const returnStaleOnError = options.returnStaleOnError !== false;
  const key = listCacheKey(options);

  if (!force && useCache && isCacheFresh(options)) {
    return cachedListResponse({ cached: true, stale: false, options });
  }

  if (!force && inFlightListPromise && inFlightListKey === key) return inFlightListPromise;

  loading = true;
  lastError = null;
  inFlightListKey = key;

  inFlightListPromise = (async () => {
    try {
      const response = await fetchIncidenciasRequest(options);

      if (responseLooksFailed(response)) {
        throw new Error(responseErrorMessage(response, "No se pudieron cargar las incidencias."));
      }

      const rawItems = listFromPayload(response);
      const items = normalizeList(rawItems);
      const total = totalFromPayload(response, items.length);

      setListCache({ items, total, key });

      return {
        ok: true,
        cached: false,
        stale: false,
        items: lastList.items,
        total: lastList.total,
        count: lastList.items.length,
        loadedAt: lastLoadedAt,
        rawCount: rawItems.length,
        cache: {
          hydrated: true,
          key: lastCacheKey,
          ageMs: 0,
          ttlMs: number(options.ttlMs ?? options.cacheTtlMs, INCIDENCIAS_CACHE_TTL_MS),
          fresh: true,
        },
      };
    } catch (error) {
      lastError = normalizeError(error);

      if (returnStaleOnError && lastLoadedAt) {
        return cachedListResponse({ cached: true, stale: true, error: lastError, options });
      }

      throw error;
    } finally {
      loading = false;
      if (inFlightListKey === key) {
        inFlightListPromise = null;
        inFlightListKey = "";
      }
    }
  })();

  return inFlightListPromise;
}

export async function loadIncidencias(options = {}) {
  const response = await listIncidencias(options);
  return response.items;
}

export async function getIncidenciaByIdRequest(id = "", { timeout = INCIDENCIAS_DETAIL_TIMEOUT } = {}) {
  const response = await getJson(getIncidenciaEndpoint(id), {
    timeout,
    source: "views.incidencias.detail",
  });

  if (responseLooksFailed(response)) throw new Error(responseErrorMessage(response, "No se pudo cargar la incidencia."));

  const detail = detailFromPayload(response);
  return detail ? upsertCachedIncidencia(detail) : null;
}

export const loadIncidenciaDetail = getIncidenciaByIdRequest;

/* =========================================================
   CREATE / UPDATE / COMMENT / REOPEN
========================================================= */

export async function createIncidenciaRequest(payload = {}, { timeout = INCIDENCIAS_UPLOAD_TIMEOUT } = {}) {
  const mutation = buildMutationBody(payload);

  const response = mutation.hasFiles
    ? await postMultipart(INCIDENCIAS_ENDPOINT, mutation.body, {
        timeout: Math.max(timeout, INCIDENCIAS_UPLOAD_TIMEOUT),
        source: "views.incidencias.create.multipart",
      })
    : await postJson(INCIDENCIAS_ENDPOINT, mutation.body, {
        timeout,
        source: "views.incidencias.create.json",
      });

  if (responseLooksFailed(response)) throw new Error(responseErrorMessage(response, "No se pudo crear la incidencia."));

  const detail = detailFromPayload(response);
  return detail ? normalizeIncidencia(detail) : null;
}

export async function createIncidencia(payload = {}, options = {}) {
  const created = await createIncidenciaRequest(payload, options);
  return created ? upsertCachedIncidencia(created) : created;
}

export async function updateIncidenciaRequest(id = "", payload = {}, { timeout = INCIDENCIAS_TIMEOUT, method = "PATCH" } = {}) {
  const endpoint = getIncidenciaEndpoint(id);
  const verb = cleanText(method, "PATCH").toUpperCase();

  const response = verb === "PUT" && typeof Http.put === "function"
    ? await Http.put(endpoint, safeObject(payload), { timeout, source: "views.incidencias.update" })
    : await patchJson(endpoint, safeObject(payload), { timeout, source: "views.incidencias.update" });

  if (responseLooksFailed(response)) throw new Error(responseErrorMessage(response, "No se pudo actualizar la incidencia."));

  const detail = detailFromPayload(response);
  return detail ? normalizeIncidencia(detail) : null;
}

export async function updateIncidencia(id = "", payload = {}, options = {}) {
  const updated = await updateIncidenciaRequest(id, payload, options);
  return updated ? upsertCachedIncidencia(updated) : await getIncidenciaByIdRequest(id);
}

export async function commentIncidenciaRequest(id = "", message = "", { timeout = INCIDENCIAS_TIMEOUT, status = "open" } = {}) {
  const text = cleanText(message, "");
  if (!text) throw new Error("INCIDENCIA_COMMENT_REQUIRED");

  const response = await postJson(
    getIncidenciaCommentsEndpoint(id),
    { message: text, text, comment: text, status, estado: status },
    { timeout, source: "views.incidencias.comment" }
  );

  if (responseLooksFailed(response)) throw new Error(responseErrorMessage(response, "No se pudo comentar la incidencia."));

  const detail = detailFromPayload(response);
  return detail ? normalizeIncidencia(detail) : null;
}

export async function commentIncidencia(id = "", message = "", options = {}) {
  const updated = await commentIncidenciaRequest(id, message, options);
  return updated ? upsertCachedIncidencia(updated) : await getIncidenciaByIdRequest(id);
}

export async function reopenIncidenciaRequest(id = "", { timeout = INCIDENCIAS_TIMEOUT } = {}) {
  const response = await postJson(
    getIncidenciaReopenEndpoint(id),
    { status: "open", estado: "open", reopen: true },
    { timeout, source: "views.incidencias.reopen" }
  );

  if (responseLooksFailed(response)) throw new Error(responseErrorMessage(response, "No se pudo reabrir la incidencia."));

  const detail = detailFromPayload(response);
  return detail ? normalizeIncidencia(detail) : null;
}

export async function reopenIncidencia(id = "", options = {}) {
  const updated = await reopenIncidenciaRequest(id, options);
  return updated ? upsertCachedIncidencia(updated) : await getIncidenciaByIdRequest(id);
}

/* =========================================================
   ATTACHMENTS
========================================================= */

export async function uploadIncidenciaAttachmentsRequest(id = "", files = [], { timeout = INCIDENCIAS_UPLOAD_TIMEOUT, status = "open", extra = {} } = {}) {
  const list = dedupeFiles(normalizeFilesInput(files));
  if (!list.length) throw new Error("INCIDENCIA_ATTACHMENTS_REQUIRED");

  const formData = buildAttachmentsFormData(list, { status, estado: status, ...safeObject(extra) });

  const response = await postMultipart(getIncidenciaAttachmentsEndpoint(id), formData, {
    timeout,
    source: "views.incidencias.attachments.multipart",
  });

  if (responseLooksFailed(response)) throw new Error(responseErrorMessage(response, "No se pudieron subir los adjuntos."));

  const detail = detailFromPayload(response);
  return detail ? normalizeIncidencia(detail) : null;
}

export async function uploadIncidenciaAttachments(id = "", files = [], options = {}) {
  const updated = await uploadIncidenciaAttachmentsRequest(id, files, options);
  return updated ? upsertCachedIncidencia(updated) : await getIncidenciaByIdRequest(id);
}

function normalizeFileResponse(response = {}, context = {}) {
  const data = fileFromPayload(response);
  const url = firstUrl(data.viewUrl, data.openUrl, data.downloadUrl, data.signedUrl, data.url, response?.url, response?.href);
  const id = cleanText(first(data.id, data.attachmentId, context.attachmentId), context.attachmentId);
  const contentType = cleanText(first(data.contentType, data.mimeType, data.mimetype, data.type), "");

  return {
    ...data,
    ticketId: context.ticketId,
    attachmentId: id,
    mode: context.mode,
    kind: context.kind,
    id,
    url,
    viewUrl: firstUrl(data.viewUrl, url),
    openUrl: firstUrl(data.openUrl, url),
    downloadUrl: firstUrl(data.downloadUrl, url),
    signedUrl: firstUrl(data.signedUrl, url),
    name: safePublicText(first(data.name, data.filename, data.fileName, "adjunto"), "adjunto"),
    contentType,
    mimeType: contentType,
  };
}

export async function getIncidenciaAttachmentFileRequest({ ticketId = "", attachmentId = "", mode = "view", kind = "attachments" } = {}, { timeout = INCIDENCIAS_DETAIL_TIMEOUT } = {}) {
  const endpoint = getIncidenciaAttachmentFileEndpoint({ ticketId, attachmentId, mode, kind });
  const response = await getJson(endpoint, { timeout, source: "views.incidencias.attachment.file" });

  if (responseLooksFailed(response)) throw new Error(responseErrorMessage(response, "No se pudo abrir el adjunto."));

  return normalizeFileResponse(response, { ticketId, attachmentId, mode, kind });
}

export async function openIncidenciaAttachment(options = {}, requestOptions = {}) {
  return getIncidenciaAttachmentFileRequest({ ...options, mode: "view" }, requestOptions);
}

export async function downloadIncidenciaAttachment({ ticketId = "", attachmentId = "", kind = "attachments", filename = "" } = {}, { timeout = INCIDENCIAS_DETAIL_TIMEOUT, autoDownload = true } = {}) {
  const endpoint = getIncidenciaAttachmentFileEndpoint({ ticketId, attachmentId, kind, mode: "download" });

  if (typeof Http.downloadBlob === "function") {
    return Http.downloadBlob(endpoint, {
      timeout,
      autoDownload,
      filename,
      source: "views.incidencias.download",
    });
  }

  return getJson(endpoint, { timeout, source: "views.incidencias.download" });
}

/* =========================================================
   STATS
========================================================= */

function isClosedStatus(value = "") {
  return normalizeStatus(value) === "closed";
}

function isOpenStatus(value = "") {
  return ["open", "pending", "in_progress"].includes(normalizeStatus(value));
}

function isUrgentPriority(value = "") {
  return ["urgent", "high"].includes(normalizePriority(value));
}

export function computeIncidenciasStats(items = lastList.items) {
  const rows = safeArray(items);

  return rows.reduce(
    (acc, item) => {
      acc.total += 1;
      if (isOpenStatus(item.status || item.estado)) acc.open += 1;
      if (isClosedStatus(item.status || item.estado)) acc.closed += 1;
      if (isUrgentPriority(item.priority || item.prioridad)) acc.urgent += 1;

      acc.attachments += number(item.attachmentsCount, safeArray(item.attachments).length);
      acc.invoiceTotal += number(first(item.invoiceTotal, item.invoicesTotal, item.facturasTotal), 0);

      return acc;
    },
    { total: 0, open: 0, closed: 0, urgent: 0, attachments: 0, invoiceTotal: 0 }
  );
}

export async function loadIncidenciasStats() {
  return computeIncidenciasStats(lastList.items);
}

/* =========================================================
   ERRORS / SNAPSHOT
========================================================= */

function normalizeError(error = null) {
  return {
    message: redact(error?.message || "No se pudo cargar incidencias."),
    status: error?.status || error?.statusCode || error?.response?.status || null,
    code: error?.code || error?.response?.code || "INCIDENCIAS_ERROR",
  };
}

export function getIncidenciasApiSnapshot() {
  const items = safeArray(lastList.items);

  return {
    version: INCIDENCIAS_API_VERSION,
    endpoint: INCIDENCIAS_ENDPOINT,
    usersEndpoint: USERS_SEARCH_ENDPOINT,
    loading,
    cached: Boolean(lastLoadedAt),
    total: Math.max(number(lastList.total, items.length), items.length),
    count: items.length,
    items: items.length,
    lastLoadedAt,
    lastCacheKey,
    cacheAgeMs: cacheAgeMs(),
    inFlight: Boolean(inFlightListPromise),
    lastError,
    bugfix: {
      noArrayFlattenInFirst: true,
      recursiveListAliases: true,
      keepsBackendItems: true,
    },
    multipart: {
      createField: "attachments",
      uploadField: "attachments",
      forceFormDataWhenFiles: true,
      noJsonFallbackWhenFiles: true,
      backendContainer: "tickets",
    },
    fixedTechnician: FIXED_TECHNICIAN,
  };
}

export const getSnapshot = getIncidenciasApiSnapshot;
export const getDebugSnapshot = getIncidenciasApiSnapshot;

export default {
  listIncidencias,
  loadIncidencias,
  hydrateIncidenciasFromCache,
  clearIncidenciasCache,

  createIncidencia,
  createIncidenciaRequest,

  loadIncidenciaDetail,
  getIncidenciaByIdRequest,

  updateIncidencia,
  updateIncidenciaRequest,

  commentIncidencia,
  commentIncidenciaRequest,

  reopenIncidencia,
  reopenIncidenciaRequest,

  uploadIncidenciaAttachments,
  uploadIncidenciaAttachmentsRequest,

  openIncidenciaAttachment,
  downloadIncidenciaAttachment,

  computeIncidenciasStats,
  loadIncidenciasStats,
  searchIncidenciaUsers,

  getIncidenciasApiSnapshot,
  getSnapshot,
  getDebugSnapshot,
};
