/* =========================================================
   Onion Support - Incidencias API
   Archivo: /src/views/incidencias/incidencias.api.js

   Responsabilidad:
   - Centralizar llamadas HTTP de Incidencias.
   - Adaptar backend /api/tickets al frontend.
   - Buscar usuarios para modal create vía /api/users.
   - Normalizar DTOs ligeros para la vista.
   - Cachear listado en memoria con TTL.
   - Dedupe de peticiones concurrentes de listado.
   - Crear incidencias con/sin adjuntos.
   - Cargar detalle, comentar, reabrir y subir adjuntos.
   - Abrir/descargar adjuntos mediante endpoint backend.
   - Mantener cache coherente tras mutaciones.
   - No inventar clienteId desde targetUserId.
   - Sin DOM.
   - Sin Router.
   - Sin Auth directo.
   - Sin Store.
   - Sin State externo.
   - Sin Model externo.
   - Sin fetch propio.
========================================================= */

import Http from "../../core/http.js";

export const INCIDENCIAS_API_VERSION = "incidencias.api.cached.v5.production";
export const INCIDENCIAS_ENDPOINT = "/api/tickets";

export const USERS_SEARCH_ENDPOINT = "/api/users";
export const USERS_SEARCH_LIMIT = 8;

export const INCIDENCIAS_TIMEOUT = 15000;
export const INCIDENCIAS_DETAIL_TIMEOUT = 25000;
export const INCIDENCIAS_UPLOAD_TIMEOUT = 90000;

export const INCIDENCIAS_LIST_LIMIT = 48;
export const INCIDENCIAS_CACHE_TTL_MS = 60000;

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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
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

function first(...values) {
  for (const value of values.flat(Infinity)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && !value.length) continue;
    if (isObject(value) && !Object.keys(value).length) continue;

    return value;
  }

  return null;
}

function number(value = 0, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

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

      clean =
        lastComma > lastDot
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
  if (/[?&#](?:token|access_token|refresh_token|password|secret|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i.test(raw)) {
    return "";
  }

  if (/^blob:/i.test(raw)) return raw;

  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  if (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

function firstUrl(...values) {
  for (const value of values.flat(Infinity)) {
    if (value === undefined || value === null) continue;

    if (isObject(value)) {
      const nested = firstUrl(
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

      if (nested) return nested;
      continue;
    }

    const url = safeUrl(value);
    if (url) return url;
  }

  return "";
}

function normalizeEmail(value = "") {
  const email = cleanText(value, "").toLowerCase();

  if (!email) return "";

  if (
    [
      "null",
      "undefined",
      "none",
      "sin email",
      "no email",
      "no_email",
      "__no_email__",
    ].includes(email)
  ) {
    return "";
  }

  return email.includes("@") ? email : "";
}

function firstEmail(...values) {
  for (const value of values.flat(Infinity)) {
    const email = normalizeEmail(value);
    if (email) return email;
  }

  return "";
}

function countFrom(...values) {
  return Math.max(
    0,
    ...values.map((value) => number(value, 0))
  );
}

function encodeSegment(value = "") {
  const clean = cleanText(value, "");

  if (!clean) {
    throw new Error("INCIDENCIA_ID_REQUIRED");
  }

  return encodeURIComponent(clean);
}

function stableSerialize(value = null) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${key}:${stableSerialize(value[key])}`)
    .join(",")}}`;
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

function buildListQuery({
  query = {},
  params = {},
} = {}) {
  return {
    limit: INCIDENCIAS_LIST_LIMIT,
    includeTotal: true,
    sortBy: "updatedAt",
    sortDir: "DESC",
    ...safeObject(params),
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

function cachedListResponse({
  cached = true,
  stale = false,
  error = null,
  options = {},
} = {}) {
  const items = safeArray(lastList.items);
  const total = number(lastList.total, items.length);

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

function setListCache({
  items = [],
  total = 0,
  key = "",
} = {}) {
  const normalizedItems = normalizeList(items);

  lastList = {
    items: normalizedItems,
    total: Math.max(number(total, normalizedItems.length), normalizedItems.length),
  };

  lastLoadedAt = nowIso();
  lastCacheKey = key || lastCacheKey || "";

  return lastList;
}

function getIncidenciaStableId(item = {}) {
  const raw = safeObject(item);

  return cleanText(
    first(
      raw.ticketId,
      raw.incidenciaId,
      raw.id,
      raw._id,
      raw.code,
      raw.numero,
      raw.ticketCode
    ),
    ""
  );
}

function shouldPreserveExisting(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (isObject(value) && !Object.keys(value).length) return true;

  return false;
}

function mergeIncidenciaData(current = {}, next = {}) {
  const base = safeObject(current, {});
  const incoming = safeObject(next, {});
  const output = { ...base };

  for (const [key, value] of Object.entries(incoming)) {
    const previous = output[key];

    if (isObject(previous) && isObject(value)) {
      output[key] = mergeIncidenciaData(previous, value);
      continue;
    }

    output[key] =
      shouldPreserveExisting(value) && previous !== undefined && previous !== null
        ? previous
        : value;
  }

  return output;
}

function incidenciaSortTime(item = {}) {
  const timestamp = Date.parse(
    first(
      item.lastActivityAt,
      item.updatedAt,
      item.modifiedAt,
      item.closedAt,
      item.createdAt,
      item.lifecycle?.lastActivityAt,
      item.lifecycle?.updatedAt,
      item.lifecycle?.closedAt,
      item.lifecycle?.createdAt,
      0
    )
  );

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function upsertCachedIncidencia(item = null) {
  const raw = safeObject(item, null);

  if (!raw) return null;

  const normalized = normalizeIncidencia(raw);
  const id = getIncidenciaStableId(normalized);

  if (!id) return normalized;

  const currentItems = safeArray(lastList.items);
  const existing = currentItems.find((current) => getIncidenciaStableId(current) === id) || null;
  const merged = existing ? mergeIncidenciaData(existing, normalized) : normalized;
  const map = new Map();

  map.set(id, merged);

  for (const current of currentItems) {
    const currentId = getIncidenciaStableId(current);

    if (!currentId || map.has(currentId)) continue;

    map.set(currentId, current);
  }

  const items = normalizeList([...map.values()]);

  lastList = {
    items,
    total: Math.max(number(lastList.total, items.length), items.length),
  };

  lastLoadedAt = lastLoadedAt || nowIso();

  return merged;
}

export function hasFreshIncidenciasCache(options = {}) {
  return isCacheFresh(options);
}

export function getIncidenciasCacheState() {
  return {
    hydrated: Boolean(lastLoadedAt),
    fresh: isCacheFresh(),
    key: lastCacheKey,
    ageMs: cacheAgeMs(),
    ttlMs: INCIDENCIAS_CACHE_TTL_MS,
    lastLoadedAt,
    loading,
    inFlight: Boolean(inFlightListPromise),
    items: lastList.items.length,
    total: lastList.total,
  };
}

/* =========================================================
   ENDPOINTS
========================================================= */

export function normalizeIncidenciaId(id = "") {
  const value = cleanText(id, "");

  if (!value) {
    throw new Error("INCIDENCIA_ID_REQUIRED");
  }

  return value;
}

export function getIncidenciaEndpoint(id = "") {
  return `${INCIDENCIAS_ENDPOINT}/${encodeSegment(normalizeIncidenciaId(id))}`;
}

export function getIncidenciaCommentsEndpoint(id = "") {
  return `${getIncidenciaEndpoint(id)}/comments`;
}

export function getIncidenciaReopenEndpoint(id = "") {
  return `${getIncidenciaEndpoint(id)}/reopen`;
}

export function getIncidenciaAttachmentsEndpoint(id = "") {
  return `${getIncidenciaEndpoint(id)}/attachments`;
}

export function getIncidenciaAttachmentFileEndpoint({
  ticketId = "",
  attachmentId = "",
  mode = "view",
  kind = "attachments",
} = {}) {
  const id = normalizeIncidenciaId(ticketId);
  const attId = cleanText(attachmentId, "");

  if (!attId) {
    throw new Error("ATTACHMENT_ID_REQUIRED");
  }

  const safeMode = mode === "download" ? "download" : "view";
  const safeKind = ["attachments", "files", "adjuntos"].includes(kind)
    ? kind
    : "attachments";

  return `${getIncidenciaEndpoint(id)}/${safeKind}/${encodeSegment(attId)}/${safeMode}`;
}

/* =========================================================
   RESPONSE UNWRAP
========================================================= */

function unwrapEnvelope(payload = null, depth = 0) {
  if (depth > 6) return payload;
  if (payload === null || payload === undefined) return payload;
  if (Array.isArray(payload)) return payload;
  if (isBlob(payload)) return payload;

  const object = safeObject(payload, null);

  if (!object) return payload;

  if (
    Array.isArray(object.items) ||
    Array.isArray(object.rows) ||
    Array.isArray(object.results) ||
    Array.isArray(object.records) ||
    Array.isArray(object.docs) ||
    Array.isArray(object.documents) ||
    Array.isArray(object.value) ||
    Array.isArray(object.list) ||
    Array.isArray(object.tickets) ||
    Array.isArray(object.incidencias) ||
    Array.isArray(object.users) ||
    Array.isArray(object.usuarios)
  ) {
    return object;
  }

  if (
    object.ticket ||
    object.incidencia ||
    object.item ||
    object.detail ||
    object.file ||
    object.attachment ||
    object.adjunto
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

  if (nested !== null && nested !== undefined && nested !== payload) {
    return unwrapEnvelope(nested, depth + 1);
  }

  return object;
}

function listFromPayload(payload = null) {
  if (Array.isArray(payload)) return payload;

  const object = safeObject(unwrapEnvelope(payload), {});

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
    if (Array.isArray(object[key])) return object[key];
  }

  return [];
}

function totalFromPayload(payload = null, fallback = 0) {
  const object = safeObject(payload, {});
  const envelope = safeObject(unwrapEnvelope(payload), {});

  return Math.max(
    fallback,
    number(
      first(
        envelope.total,
        envelope.count,
        envelope.totalCount,
        envelope.remoteCount,
        envelope.meta?.total,
        envelope.meta?.count,
        envelope.meta?.totalCount,
        envelope.pagination?.total,
        envelope.pagination?.totalCount,
        envelope.page?.total,
        object.total,
        object.count,
        object.totalCount,
        object.remoteCount,
        fallback
      ),
      fallback
    )
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

function detailFromPayload(payload = null) {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload[0] || null;
  if (looksLikeIncidencia(payload)) return payload;

  const object = safeObject(unwrapEnvelope(payload), {});

  return (
    first(
      looksLikeIncidencia(object.ticket) ? object.ticket : null,
      looksLikeIncidencia(object.incidencia) ? object.incidencia : null,
      looksLikeIncidencia(object.item) ? object.item : null,
      looksLikeIncidencia(object.detail) ? object.detail : null,
      looksLikeIncidencia(object.result) ? object.result : null,
      looksLikeIncidencia(object.data) ? object.data : null,
      looksLikeIncidencia(object.payload) ? object.payload : null,
      null
    ) || null
  );
}

function fileFromPayload(payload = null) {
  if (isBlob(payload)) {
    return {
      blob: payload,
      size: payload.size,
      contentType: payload.type,
    };
  }

  const object = safeObject(unwrapEnvelope(payload), {});

  return safeObject(
    first(
      object.file,
      object.attachment,
      object.adjunto,
      object.data?.file,
      object.data?.attachment,
      object.data?.adjunto,
      object.payload?.file,
      object.payload?.attachment,
      object.payload?.adjunto,
      object.result?.file,
      object.result?.attachment,
      object.result?.adjunto,
      object
    ),
    {}
  );
}

/* =========================================================
   DTO NORMALIZATION
========================================================= */

function normalizePerson(value = {}) {
  const raw = safeObject(value);
  const email = firstEmail(
    raw.email,
    raw.emailLower,
    raw.userEmail,
    raw.mail,
    raw.profile?.email,
    raw.auth?.email,
    raw.lookup?.emailLower
  );
  const avatarUrl = firstUrl(
    raw.avatarUrl,
    raw.avatar,
    raw.picture,
    raw.photoUrl,
    raw.photoURL,
    raw.imageUrl,
    raw.profile?.avatarUrl,
    raw.profile?.avatar,
    raw.profile?.photoUrl,
    raw.profile?.photoURL
  );
  const name = cleanText(
    first(
      raw.displayName,
      raw.fullName,
      raw.name,
      raw.nombre,
      raw.profile?.displayName,
      raw.profile?.name,
      raw.username
    ),
    ""
  );

  return {
    id: cleanText(first(raw.id, raw.userId, raw.uid, raw.sub, raw.username, raw.slug), ""),
    userId: cleanText(first(raw.userId, raw.id, raw.uid, raw.sub), ""),
    username: cleanText(first(raw.username, raw.userName, raw.slug), ""),
    displayName: name,
    name,
    email: email || null,
    emailLower: email || null,
    role: cleanText(first(raw.role, raw.rol, Array.isArray(raw.roles) ? raw.roles[0] : ""), ""),
    avatar: avatarUrl || null,
    avatarUrl,
    hasAvatar: Boolean(avatarUrl),
  };
}

function normalizeAttachment(file = {}, index = 0) {
  const raw = safeObject(file);
  const rawNested = safeObject(raw.raw);

  const id = cleanText(
    first(
      raw.id,
      raw.fileId,
      raw.attachmentId,
      raw.blobName,
      raw.storageKey,
      raw.path,
      raw.key,
      rawNested.id,
      rawNested.fileId,
      rawNested.attachmentId,
      rawNested.blobName,
      rawNested.storageKey,
      rawNested.path,
      rawNested.key
    ),
    `attachment-${index + 1}`
  );

  const name = cleanText(
    first(
      raw.name,
      raw.filename,
      raw.fileName,
      raw.title,
      rawNested.name,
      rawNested.filename,
      rawNested.fileName,
      rawNested.title
    ),
    `archivo_${index + 1}`
  );

  const url = firstUrl(
    raw.viewUrl,
    raw.openUrl,
    raw.signedUrl,
    raw.url,
    raw.blobUrl,
    raw.publicUrl,
    raw.downloadUrl,
    rawNested.viewUrl,
    rawNested.openUrl,
    rawNested.signedUrl,
    rawNested.url,
    rawNested.blobUrl,
    rawNested.publicUrl,
    rawNested.downloadUrl
  );

  return {
    id,
    attachmentId: cleanText(first(raw.attachmentId, rawNested.attachmentId, id), id),
    name,
    filename: cleanText(first(raw.filename, raw.fileName, raw.name, name), name),
    fileName: cleanText(first(raw.fileName, raw.filename, raw.name, name), name),
    size: number(first(raw.size, raw.sizeBytes, raw.contentLength, rawNested.size, rawNested.sizeBytes), 0),
    type: cleanText(first(raw.type, raw.contentType, raw.mimetype, raw.mimeType, rawNested.type), ""),
    contentType: cleanText(first(raw.contentType, raw.mimetype, raw.mimeType, raw.type, rawNested.contentType), ""),
    uploadedAt: first(raw.uploadedAt, raw.createdAt, raw.date, rawNested.uploadedAt, rawNested.createdAt, null),
    url,
    viewUrl: firstUrl(raw.viewUrl, raw.openUrl, raw.signedUrl, raw.url, url),
    openUrl: firstUrl(raw.openUrl, raw.viewUrl, raw.signedUrl, raw.url, url),
    downloadUrl: firstUrl(raw.downloadUrl, raw.signedUrl, raw.url, url),
  };
}

function normalizeTimelineEntry(entry = {}, index = 0) {
  const raw = safeObject(entry);

  const kind = cleanText(
    first(raw.kind, raw.type === "comment" ? "comment" : "event"),
    "event"
  );

  const type = cleanText(
    first(raw.type, raw.action, kind === "comment" ? "comment" : "update"),
    "update"
  );

  return {
    id: cleanText(first(raw.id, raw.eventId, raw.historyId, raw.commentId), `${kind}-${index + 1}`),
    kind,
    type,
    title: cleanText(
      first(
        raw.title,
        kind === "comment" ? "Comentario" : type === "created" ? "Incidencia creada" : "Actualización"
      ),
      "Actualización"
    ),
    body: cleanText(
      first(raw.body, raw.message, raw.text, raw.comment, raw.description, raw.detail),
      kind === "comment" ? "" : "Actualización registrada."
    ),
    author: cleanText(
      first(raw.author, raw.byName, raw.user, raw.name, raw.createdBy?.name, raw.createdBy?.displayName),
      kind === "comment" ? "Usuario" : "Sistema"
    ),
    createdAt: first(raw.createdAt, raw.date, raw.timestamp, raw.updatedAt, null),
  };
}

function normalizeTimeline(item = {}) {
  const raw = safeObject(item);

  const timeline = safeArray(first(raw.timeline));

  if (timeline.length) {
    return timeline.map(normalizeTimelineEntry);
  }

  const history = safeArray(first(raw.history, raw.events));
  const comments = safeArray(first(raw.comments, raw.notes, raw.messages));

  return [
    ...history.map((entry, index) => normalizeTimelineEntry(entry, index)),
    ...comments.map((entry, index) =>
      normalizeTimelineEntry(
        {
          ...safeObject(entry),
          kind: "comment",
          type: "comment",
        },
        index
      )
    ),
  ].sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
}

export function normalizeIncidencia(item = {}) {
  const raw = safeObject(item);
  const ticketId = cleanText(
    first(raw.ticketId, raw.incidenciaId, raw.id, raw._id, raw.code, raw.numero, raw.ticketCode),
    ""
  );

  const subject = safePublicText(
    first(raw.subject, raw.asunto, raw.title, raw.titulo, raw.name),
    "Incidencia"
  );

  const description = safePublicText(
    first(raw.description, raw.descripcion, raw.message, raw.preview, raw.text, raw.body),
    "Sin descripción."
  );

  const status = cleanText(first(raw.status, raw.estado, raw.state, raw.lifecycle?.status), "open");
  const priority = cleanText(first(raw.priority, raw.prioridad, raw.severity, raw.urgency, raw.sla?.priority), "medium");
  const category = cleanText(first(raw.category, raw.categoria, raw.type, raw.tipo, raw.subcategory), "Soporte");

  const requesterName = safePublicText(
    first(
      raw.requesterName,
      raw.ownerName,
      raw.clientName,
      raw.clienteName,
      raw.clienteNombre,
      raw.userName,
      raw.usuarioName,
      raw.name,
      raw.requesterSnapshotName,
      raw.requesterSnapshotNombre,
      raw.requesterSnapshot?.displayName,
      raw.requesterSnapshot?.name,
      raw.requesterSnapshot?.nombre,
      raw.cliente?.displayName,
      raw.cliente?.name,
      raw.cliente?.nombre,
      raw.client?.displayName,
      raw.client?.name,
      raw.user?.displayName,
      raw.user?.name
    ),
    "Usuario"
  );

  const requesterEmail = firstEmail(
    raw.requesterEmail,
    raw.requesterEmailLower,
    raw.clientEmail,
    raw.clientEmailLower,
    raw.clienteEmail,
    raw.clienteEmailLower,
    raw.userEmail,
    raw.userEmailLower,
    raw.email,
    raw.emailLower,
    raw.emailCliente,
    raw.rootEmail,
    raw.rootUserEmail,
    raw.rootClienteEmail,
    raw.rootClienteEmailLower,
    raw.requesterSnapshotEmail,
    raw.requesterSnapshotEmailLower,
    raw.clienteEmailNested,
    raw.clienteEmailLowerNested,
    raw.receptorEmail,
    raw.receptorEmailLower,
    raw.createdByEmail,
    raw.createdByEmailLower,
    raw.requesterSnapshot?.email,
    raw.requesterSnapshot?.emailLower,
    raw.cliente?.email,
    raw.cliente?.emailLower,
    raw.client?.email,
    raw.client?.emailLower,
    raw.usuario?.email,
    raw.usuario?.emailLower,
    raw.user?.email,
    raw.user?.emailLower,
    raw.receptor?.email,
    raw.receptor?.emailLower,
    raw.createdBy?.email,
    raw.createdBy?.emailLower,
    raw.meta?.requesterEmail,
    raw.meta?.clientEmail,
    raw.meta?.clienteEmail,
    raw.meta?.userEmail
  );

  const requesterAvatarUrl = firstUrl(
    raw.requesterAvatarUrl,
    raw.requesterAvatar,
    raw.clientAvatarUrl,
    raw.clientAvatar,
    raw.clienteAvatarUrl,
    raw.clienteAvatar,
    raw.userAvatarUrl,
    raw.userAvatar,
    raw.avatarUrl,
    raw.avatar,
    raw.photoUrl,
    raw.photoURL,
    raw.picture,
    raw.requesterSnapshotAvatarUrl,
    raw.requesterSnapshotAvatar,
    raw.clienteAvatarUrl,
    raw.clienteAvatar,
    raw.receptorAvatarUrl,
    raw.receptorAvatar,
    raw.createdByAvatarUrl,
    raw.createdByAvatar,
    raw.requesterSnapshot?.avatarUrl,
    raw.requesterSnapshot?.avatar,
    raw.requesterSnapshot?.photoUrl,
    raw.requesterSnapshot?.photoURL,
    raw.cliente?.avatarUrl,
    raw.cliente?.avatar,
    raw.cliente?.photoUrl,
    raw.client?.avatarUrl,
    raw.client?.avatar,
    raw.user?.avatarUrl,
    raw.user?.avatar,
    raw.receptor?.avatarUrl,
    raw.receptor?.avatar,
    raw.createdBy?.avatarUrl,
    raw.createdBy?.avatar,
    raw.meta?.requesterAvatarUrl,
    raw.meta?.requesterAvatar,
    raw.meta?.clientAvatarUrl,
    raw.meta?.clientAvatar
  );

  const requesterUserId = cleanText(
    first(
      raw.userId,
      raw.usuarioId,
      raw.requesterUserId,
      raw.ownerUserId,
      raw.createdByUserId,
      raw.receptorUserId,
      raw.requesterSnapshotUserId,
      raw.clienteUserId,
      raw.createdByUserIdNested,
      raw.userRef?.userId,
      raw.requesterSnapshot?.userId,
      raw.requesterSnapshot?.id,
      raw.cliente?.userId,
      raw.client?.userId,
      raw.user?.userId,
      raw.user?.id
    ),
    ""
  );

  const requesterClienteId = cleanText(
    first(
      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.targetClienteId,
      raw.requesterSnapshotClienteId,
      raw.clienteClienteId,
      raw.receptorClienteId,
      raw.clienteRef?.clienteId,
      raw.requesterSnapshot?.clienteId,
      raw.cliente?.clienteId,
      raw.cliente?.id,
      raw.client?.clienteId,
      raw.client?.id
    ),
    ""
  );

  const requesterUsername = cleanText(
    first(
      raw.requesterUsername,
      raw.username,
      raw.userName,
      raw.requesterSnapshotUsername,
      raw.clienteUsername,
      raw.receptorUsername,
      raw.createdByUsername,
      raw.requesterSnapshot?.username,
      raw.cliente?.username,
      raw.client?.username,
      raw.user?.username
    ),
    ""
  );

  const assignedTo = normalizePerson(
    first(
      raw.assignedTo,
      raw.tecnico,
      raw.technician,
      raw.agent,
      raw.assignedTechnician,
      raw.assignedUser,
      raw.assignment?.technician,
      raw.assignment?.assignedTo,
      {}
    )
  );

  const assignedToName = safePublicText(
    first(
      raw.assignedToName,
      raw.technicianName,
      raw.tecnicoName,
      raw.assigneeName,
      raw.agentName,
      raw.assignmentAssignedToName,
      raw.assignmentTechnicianName,
      raw.assignmentTechnicianNombre,
      raw.assignmentName,
      raw.assignedToNombre,
      raw.tecnicoNombre,
      raw.metaTechnicianName,
      raw.metaAssignedTechnicianName,
      raw.metaLastTechnicianName,
      raw.assignment?.assignedToName,
      raw.assignment?.technicianName,
      raw.assignment?.agentName,
      raw.assignment?.name,
      raw.meta?.technicianName,
      raw.meta?.assignedTechnicianName,
      raw.meta?.lastTechnicianName,
      assignedTo.displayName,
      assignedTo.name
    ),
    "Sin asignar"
  );

  const assignedToEmail = firstEmail(
    raw.assignedToEmail,
    raw.technicianEmail,
    raw.tecnicoEmail,
    raw.agentEmail,
    raw.assignmentAssignedToEmail,
    raw.assignmentTechnicianEmail,
    raw.assignmentEmail,
    raw.metaTechnicianEmail,
    raw.metaAssignedTechnicianEmail,
    raw.metaLastTechnicianEmail,
    raw.assignment?.assignedToEmail,
    raw.assignment?.technicianEmail,
    raw.assignment?.agentEmail,
    raw.assignment?.email,
    raw.assignedTo?.email,
    raw.technician?.email,
    raw.tecnico?.email,
    raw.agent?.email,
    raw.meta?.technicianEmail,
    raw.meta?.assignedTechnicianEmail,
    raw.meta?.lastTechnicianEmail,
    assignedTo.email,
    assignedTo.emailLower
  );

  const assignedToAvatarUrl = firstUrl(
    raw.assignedToAvatarUrl,
    raw.assignedToAvatar,
    raw.technicianAvatarUrl,
    raw.technicianAvatar,
    raw.tecnicoAvatarUrl,
    raw.tecnicoAvatar,
    raw.agentAvatarUrl,
    raw.agentAvatar,
    raw.assignmentAssignedToAvatarUrl,
    raw.assignmentAssignedToAvatar,
    raw.assignmentTechnicianAvatarUrl,
    raw.assignmentTechnicianAvatar,
    raw.assignmentAvatarUrl,
    raw.assignmentAvatar,
    raw.metaTechnicianAvatarUrl,
    raw.metaTechnicianAvatar,
    raw.metaAssignedTechnicianAvatarUrl,
    raw.metaAssignedTechnicianAvatar,
    raw.metaLastTechnicianAvatarUrl,
    raw.metaLastTechnicianAvatar,
    raw.assignment?.assignedToAvatarUrl,
    raw.assignment?.assignedToAvatar,
    raw.assignment?.technicianAvatarUrl,
    raw.assignment?.technicianAvatar,
    raw.assignment?.agentAvatarUrl,
    raw.assignment?.agentAvatar,
    raw.assignment?.avatarUrl,
    raw.assignment?.avatar,
    raw.assignedTo?.avatarUrl,
    raw.assignedTo?.avatar,
    raw.technician?.avatarUrl,
    raw.technician?.avatar,
    raw.tecnico?.avatarUrl,
    raw.tecnico?.avatar,
    raw.agent?.avatarUrl,
    raw.agent?.avatar,
    raw.meta?.technicianAvatarUrl,
    raw.meta?.technicianAvatar,
    raw.meta?.assignedTechnicianAvatarUrl,
    raw.meta?.assignedTechnicianAvatar,
    raw.meta?.lastTechnicianAvatarUrl,
    raw.meta?.lastTechnicianAvatar,
    assignedTo.avatarUrl,
    assignedTo.avatar
  );

  const assignedToUserId = cleanText(
    first(
      raw.assignedToUserId,
      raw.technicianUserId,
      raw.tecnicoUserId,
      raw.agentUserId,
      raw.assignmentAssignedToUserId,
      raw.assignmentTechnicianUserId,
      raw.assignmentTechnicianId,
      raw.assignmentUserId,
      raw.assignedToUserIdNested,
      raw.assignedToId,
      raw.tecnicoId,
      raw.metaTechnicianUserId,
      raw.metaAssignedTechnicianUserId,
      raw.metaLastTechnicianUserId,
      raw.assignment?.assignedToUserId,
      raw.assignment?.technicianUserId,
      raw.assignment?.userId,
      raw.assignedTo?.userId,
      raw.assignedTo?.id,
      raw.technician?.userId,
      raw.technician?.id,
      raw.tecnico?.userId,
      raw.tecnico?.id,
      raw.agent?.userId,
      raw.agent?.id,
      assignedTo.userId,
      assignedTo.id
    ),
    ""
  );

  const technician = {
    ...assignedTo,
    id: assignedToUserId || assignedTo.id,
    userId: assignedToUserId || assignedTo.userId,
    name: assignedToName,
    nombre: assignedToName,
    displayName: assignedToName,
    email: assignedToEmail || null,
    emailLower: assignedToEmail || null,
    avatar: assignedToAvatarUrl || null,
    avatarUrl: assignedToAvatarUrl,
    hasAvatar: Boolean(assignedToAvatarUrl),
    assigned: Boolean(
      assignedToUserId ||
        assignedToEmail ||
        assignedToAvatarUrl ||
        (assignedToName && normalizeKey(assignedToName) !== "sin_asignar")
    ),
  };

  const requesterSnapshot = {
    ...safeObject(raw.requesterSnapshot),
    userId: requesterUserId,
    id: requesterUserId,
    clienteId: requesterClienteId,
    name: requesterName,
    nombre: requesterName,
    displayName: requesterName,
    email: requesterEmail || null,
    emailLower: requesterEmail || null,
    username: requesterUsername || null,
    usernameLower: requesterUsername ? requesterUsername.toLowerCase() : null,
    avatar: requesterAvatarUrl || null,
    avatarUrl: requesterAvatarUrl || null,
    hasAvatar: Boolean(requesterAvatarUrl),
  };

  const cliente = {
    ...safeObject(raw.cliente || raw.client),
    id: requesterClienteId,
    userId: requesterUserId,
    clienteId: requesterClienteId,
    name: requesterName,
    nombre: requesterName,
    displayName: requesterName,
    email: requesterEmail || null,
    emailLower: requesterEmail || null,
    username: requesterUsername || null,
    usernameLower: requesterUsername ? requesterUsername.toLowerCase() : null,
    avatar: requesterAvatarUrl || null,
    avatarUrl: requesterAvatarUrl || null,
    hasAvatar: Boolean(requesterAvatarUrl),
  };

  const assignment = {
    ...safeObject(raw.assignment),
    assignedToUserId: technician.userId || null,
    userId: technician.userId || null,
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

  const attachments = safeArray(first(raw.attachments, raw.files, raw.adjuntos, [])).map(normalizeAttachment);
  const attachmentsCount = countFrom(
    attachments.length,
    raw.attachmentsCount,
    raw.filesCount,
    raw.adjuntosCount,
    raw.meta?.attachmentsCount,
    raw.meta?.filesCount
  );

  const comments = safeArray(first(raw.comments, raw.notes, raw.messages, []));
  const history = safeArray(first(raw.history, raw.events, []));
  const commentsCount = countFrom(comments.length, raw.commentsCount, raw.meta?.commentsCount);
  const historyCount = countFrom(history.length, raw.historyCount, raw.meta?.historyCount);

  const invoices = safeArray(first(raw.invoices, raw.facturas, raw.linkedInvoices?.items, []));
  const invoicesCount = countFrom(
    raw.facturasCount,
    raw.invoicesCount,
    raw.linkedInvoicesCount,
    raw.linkedInvoices?.count,
    invoices.length
  );

  const invoiceTotal = number(
    first(
      raw.facturasTotal,
      raw.invoicesTotal,
      raw.importeFacturas,
      raw.invoiceTotal,
      raw.facturaTotal,
      raw.facturaImporte,
      raw.importeFactura,
      raw.totalFactura,
      raw.invoiceAmount,
      raw.linkedInvoicesTotal,
      raw.linkedInvoicesAmount,
      raw.linkedInvoicesImporte,
      raw.linkedInvoices?.total,
      raw.linkedInvoices?.amount,
      raw.meta?.invoicesTotal,
      raw.meta?.invoiceTotal,
      0
    ),
    0
  );

  const currency = cleanText(
    first(
      raw.currency,
      raw.moneda,
      raw.facturaCurrency,
      raw.facturaMoneda,
      raw.linkedInvoicesCurrency,
      raw.linkedInvoicesMoneda,
      raw.linkedInvoices?.currency,
      raw.linkedInvoices?.moneda,
      raw.meta?.invoiceCurrency,
      "EUR"
    ),
    "EUR"
  ).toUpperCase();

  const createdAt = first(raw.createdAt, raw.fechaCreacion, raw.created_at, raw.lifecycle?.createdAt, null);
  const updatedAt = first(raw.updatedAt, raw.updated_at, raw.modifiedAt, raw.lastActivityAt, raw.lifecycle?.updatedAt, null);
  const lastActivityAt = first(raw.lastActivityAt, raw.lifecycle?.lastActivityAt, updatedAt, createdAt, null);
  const closedAt = first(raw.closedAt, raw.lifecycle?.closedAt, null);

  return {
    id: ticketId,
    ticketId,
    incidenciaId: ticketId,
    entityId: ticketId,

    entityType: cleanText(first(raw.entityType, "ticket"), "ticket"),
    tipoDocumento: cleanText(first(raw.tipoDocumento, "ticket"), "ticket"),

    subject,
    asunto: subject,
    title: subject,

    description,
    descripcion: description,
    message: description,
    preview: description,

    status,
    estado: status,
    statusKey: cleanText(first(raw.statusKey, status), status),
    statusReason: cleanText(first(raw.statusReason, raw.motivoEstado), ""),

    priority,
    prioridad: priority,
    priorityKey: cleanText(first(raw.priorityKey, priority), priority),

    category,
    categoria: category,
    tipo: cleanText(first(raw.tipo, raw.type, category), category),
    type: cleanText(first(raw.type, raw.tipo, category), category),

    source: cleanText(first(raw.source, raw.origen), ""),
    origen: cleanText(first(raw.origen, raw.source), ""),
    channel: cleanText(raw.channel, ""),

    userId: requesterUserId,
    usuarioId: requesterUserId,
    clienteId: requesterClienteId,
    clientId: requesterClienteId,

    requesterName,
    requesterInitials: cleanText(raw.requesterInitials, ""),
    requesterEmail: requesterEmail || null,
    requesterEmailLower: requesterEmail || null,
    requesterAvatarUrl,
    requesterAvatar: requesterAvatarUrl || null,
    requesterUsername: requesterUsername || null,

    clientName: requesterName,
    clienteName: requesterName,
    clienteNombre: requesterName,
    userName: requesterName,

    clientEmail: requesterEmail || null,
    clienteEmail: requesterEmail || null,
    userEmail: requesterEmail || null,
    email: requesterEmail || null,
    emailLower: requesterEmail || null,

    avatar: requesterAvatarUrl || null,
    avatarUrl: requesterAvatarUrl,
    clientAvatar: requesterAvatarUrl || null,
    clientAvatarUrl: requesterAvatarUrl,
    clienteAvatar: requesterAvatarUrl || null,
    clienteAvatarUrl: requesterAvatarUrl,
    userAvatar: requesterAvatarUrl || null,
    userAvatarUrl: requesterAvatarUrl,
    hasAvatar: Boolean(requesterAvatarUrl),

    requesterSnapshot,
    cliente,
    client: cliente,

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
    filesCount: attachmentsCount,
    adjuntosCount: attachmentsCount,

    comments,
    history,
    timeline: normalizeTimeline(raw),
    commentsCount,
    historyCount,

    createdAt,
    createdAtES: raw.createdAtES || null,
    updatedAt,
    updatedAtES: raw.updatedAtES || null,
    lastActivityAt,
    lastActivityAtES: raw.lastActivityAtES || null,
    closedAt,
    closedAtES: raw.closedAtES || null,

    lifecycle: {
      ...safeObject(raw.lifecycle),
      createdAt,
      updatedAt,
      lastActivityAt,
      closedAt,
    },

    meta: {
      ...safeObject(raw.meta),

      requesterEmail: requesterEmail || null,
      requesterAvatar: requesterAvatarUrl || null,
      requesterAvatarUrl: requesterAvatarUrl || null,
      requesterHasAvatar: Boolean(requesterAvatarUrl),

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

      lastTechnicianUserId: technician.userId,
      lastTechnicianName: technician.name,
      lastTechnicianEmail: technician.email,
      lastTechnicianAvatar: technician.avatarUrl || null,
      lastTechnicianAvatarUrl: technician.avatarUrl || null,

      isAssigned: Boolean(technician.assigned),

      attachmentsCount,
      commentsCount,
      historyCount,
      linkedInvoiceCount: invoicesCount,
      invoicesTotal: invoiceTotal,
      invoiceTotal,
      invoiceCurrency: currency,

      frontendReady: true,
    },
  };
}

function normalizeList(items = []) {
  const map = new Map();

  for (const item of safeArray(items)) {
    const normalized = normalizeIncidencia(item);
    const id = cleanText(first(normalized.ticketId, normalized.id), "");

    if (!id) continue;

    map.set(
      id,
      map.has(id)
        ? mergeIncidenciaData(map.get(id), normalized)
        : normalized
    );
  }

  return [...map.values()].sort((a, b) => {
    const diff = incidenciaSortTime(b) - incidenciaSortTime(a);

    if (diff !== 0) return diff;

    return getIncidenciaStableId(b).localeCompare(getIncidenciaStableId(a), "es", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function normalizeFileResponse(response = null, fallback = {}) {
  const file = fileFromPayload(response);
  const source = {
    ...safeObject(fallback),
    ...file,
  };

  const url = firstUrl(
    source.url,
    source.viewUrl,
    source.openUrl,
    source.downloadUrl,
    source.signedUrl,
    source.blobUrl,
    source.publicUrl,
    source.href
  );

  return {
    ...source,
    url,
    viewUrl: firstUrl(source.viewUrl, source.openUrl, url),
    openUrl: firstUrl(source.openUrl, source.viewUrl, url),
    downloadUrl: firstUrl(source.downloadUrl, url),
    signedUrl: firstUrl(source.signedUrl, url),
    filename: cleanText(first(source.filename, source.fileName, source.name), "archivo"),
    fileName: cleanText(first(source.fileName, source.filename, source.name), "archivo"),
    name: cleanText(first(source.name, source.filename, source.fileName), "archivo"),
    contentType: cleanText(first(source.contentType, source.mimetype, source.mimeType, source.mime), ""),
  };
}

/* =========================================================
   USERS SEARCH FOR CREATE MODAL
========================================================= */

function usersListFromPayload(payload = null) {
  if (Array.isArray(payload)) return payload;

  const object = safeObject(unwrapEnvelope(payload), {});

  const direct = first(
    object.items,
    object.rows,
    object.results,
    object.records,
    object.users,
    object.usuarios,
    object.data,
    object.payload,
    object.result,
    object.response,
    object.body
  );

  if (Array.isArray(direct)) return direct;

  const data = safeObject(object.data);
  const payloadObject = safeObject(object.payload);
  const result = safeObject(object.result);
  const response = safeObject(object.response);
  const body = safeObject(object.body);

  return safeArray(
    first(
      data.items,
      data.rows,
      data.results,
      data.records,
      data.users,
      data.usuarios,

      payloadObject.items,
      payloadObject.rows,
      payloadObject.results,
      payloadObject.records,
      payloadObject.users,
      payloadObject.usuarios,

      result.items,
      result.rows,
      result.results,
      result.records,
      result.users,
      result.usuarios,

      response.items,
      response.rows,
      response.results,
      response.records,
      response.users,
      response.usuarios,

      body.items,
      body.rows,
      body.results,
      body.records,
      body.users,
      body.usuarios,

      []
    )
  );
}

export function normalizeCreateSearchUser(user = {}) {
  const raw = safeObject(user);

  const userId = cleanText(
    first(
      raw.userId,
      raw.id,
      raw.uid,
      raw.sub,
      raw.usuarioId,
      raw.username
    ),
    ""
  );

  const clienteId = cleanText(
    first(
      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.lookup?.clienteId,
      raw.tenant?.clienteId,
      ""
    ),
    ""
  );

  const name = cleanText(
    first(
      raw.displayName,
      raw.fullName,
      raw.name,
      raw.nombre,
      raw.publicName,
      raw.profile?.publicName,
      raw.profile?.displayName,
      raw.profile?.name,
      raw.username,
      raw.email
    ),
    "Usuario"
  );

  const email = firstEmail(
    raw.email,
    raw.emailLower,
    raw.userEmail,
    raw.mail,
    raw.profile?.email,
    raw.auth?.email,
    raw.contacto?.email,
    raw.contacto?.emailLower,
    raw.lookup?.emailLower
  );

  const username = cleanText(
    first(
      raw.username,
      raw.userName,
      raw.usernameLower,
      raw.lookup?.usernameLower,
      raw.slug,
      raw.lookup?.slug
    ),
    ""
  );

  const avatarUrl = firstUrl(
    raw.avatarUrl,
    raw.avatar,
    raw.picture,
    raw.photoUrl,
    raw.photoURL,
    raw.imageUrl,
    raw.profile?.avatarUrl,
    raw.profile?.avatar,
    raw.profile?.photoUrl,
    raw.profile?.photoURL,
    raw.profile?.picture
  );

  const role = cleanText(
    first(
      raw.role,
      raw.rol,
      Array.isArray(raw.roles) ? raw.roles[0] : "",
      "user"
    ),
    "user"
  );

  return {
    id: userId,
    userId,

    clienteId,
    clientId: clienteId,
    targetClienteId: clienteId,

    displayName: name,
    fullName: name,
    name,
    nombre: name,

    email: email || "",
    emailLower: email || "",
    userEmail: email || "",
    mail: email || "",

    username,
    usernameLower: username.toLowerCase(),

    role,
    rol: role,
    roles: safeArray(raw.roles).length ? safeArray(raw.roles) : [role],

    avatar: avatarUrl || "",
    avatarUrl: avatarUrl || "",
    picture: avatarUrl || "",
    photoUrl: avatarUrl || "",
    hasAvatar: Boolean(avatarUrl || raw.hasAvatar || raw.profile?.avatarEnabled || raw.meta?.hasAvatar),
  };
}

export async function searchIncidenciaUsers(query = "", options = {}) {
  const q = cleanText(query, "");
  const limit = Math.max(
    1,
    Math.min(Number(options.limit || USERS_SEARCH_LIMIT) || USERS_SEARCH_LIMIT, 20)
  );

  if (q.length < 2) return [];

  const response = await getJson(USERS_SEARCH_ENDPOINT, {
    timeout: options.timeout || INCIDENCIAS_TIMEOUT,
    query: {
      q,
      search: q,
      query: q,
      term: q,
      text: q,
      limit,
      includeTotal: false,
      active: true,
    },
  });

  if (
    response?.ok === false ||
    response?.success === false ||
    response?.error ||
    response?.code
  ) {
    throw new Error(
      response?.message ||
        response?.error ||
        response?.code ||
        "No se pudieron buscar usuarios."
    );
  }

  return usersListFromPayload(response)
    .map(normalizeCreateSearchUser)
    .filter((user) => user.userId || user.id)
    .slice(0, limit);
}

/* =========================================================
   PAYLOAD / FORM DATA
========================================================= */

function extractFiles(payload = {}) {
  const source = safeObject(payload);

  return safeArray(
    first(
      source.files,
      source.attachments,
      source.adjuntos,
      source.uploads,
      []
    )
  ).filter((file) => isFile(file) || isBlob(file));
}

function withoutFileFields(payload = {}) {
  const source = safeObject(payload);
  const output = {};

  for (const [key, value] of Object.entries(source)) {
    if (["files", "attachments", "adjuntos", "uploads"].includes(key)) continue;
    if (value === undefined || value === null) continue;

    output[key] = value;
  }

  return output;
}

function normalizeCreatePayload(payload = {}) {
  const source = safeObject(payload);

  const subject = cleanText(first(source.subject, source.asunto, source.title), "");
  const description = cleanText(first(source.description, source.descripcion, source.message, source.body), "");
  const priority = cleanText(first(source.priority, source.prioridad, "medium"), "medium");
  const status = cleanText(first(source.status, source.estado, "open"), "open");
  const category = cleanText(first(source.category, source.categoria, source.tipo, "general"), "general");
  const origin = cleanText(first(source.source, source.origen, source.channel, "panel"), "panel");

  const targetUserId = cleanText(
    first(
      source.targetUserId,
      source.userId,
      source.usuarioId,
      source.user?.userId,
      source.user?.id,
      source.usuario?.userId,
      source.usuario?.id,
      ""
    ),
    ""
  );

  const targetClienteId = cleanText(
    first(
      source.targetClienteId,
      source.clienteId,
      source.clientId,
      source.customerId,
      source.cliente?.clienteId,
      source.cliente?.id,
      source.client?.clienteId,
      source.client?.id,
      ""
    ),
    ""
  );

  const targetUserName = cleanText(
    first(
      source.targetUserName,
      source.receptorName,
      source.userName,
      source.clienteNombre,
      source.clientName,
      source.name,
      source.nombre,
      source.user?.displayName,
      source.user?.name,
      source.cliente?.displayName,
      source.cliente?.name,
      source.cliente?.nombre,
      ""
    ),
    ""
  );

  const targetUserEmail = firstEmail(
    source.targetUserEmail,
    source.receptorEmail,
    source.userEmail,
    source.clienteEmail,
    source.clientEmail,
    source.email,
    source.emailLower,
    source.user?.email,
    source.cliente?.email,
    source.client?.email
  );

  const targetUserAvatar = firstUrl(
    source.targetUserAvatar,
    source.receptorAvatar,
    source.userAvatar,
    source.userAvatarUrl,
    source.clienteAvatar,
    source.clienteAvatarUrl,
    source.clientAvatar,
    source.clientAvatarUrl,
    source.avatar,
    source.avatarUrl,
    source.user?.avatarUrl,
    source.user?.avatar,
    source.cliente?.avatarUrl,
    source.cliente?.avatar,
    source.client?.avatar
  );

  const normalized = {
    ...withoutFileFields(source),

    subject,
    asunto: subject,
    title: subject,

    description,
    descripcion: description,
    message: description,
    body: description,

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
  };

  if (targetUserId) {
    normalized.targetUserId = targetUserId;
    normalized.userId = targetUserId;
    normalized.usuarioId = targetUserId;
    normalized.uid = targetUserId;
  }

  /*
    Importante:
    No inventamos clienteId desde targetUserId.
    Sólo se envía clienteId/clientId si existe targetClienteId real.
  */
  if (targetClienteId) {
    normalized.targetClienteId = targetClienteId;
    normalized.clienteId = targetClienteId;
    normalized.clientId = targetClienteId;
  }

  if (targetUserName) {
    normalized.targetUserName = targetUserName;
    normalized.receptorName = targetUserName;
    normalized.userName = targetUserName;
    normalized.clienteNombre = targetUserName;
    normalized.clientName = targetUserName;
    normalized.name = targetUserName;
    normalized.nombre = targetUserName;
  }

  if (targetUserEmail) {
    normalized.targetUserEmail = targetUserEmail;
    normalized.receptorEmail = targetUserEmail;
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

function buildFormData(payload = {}) {
  const files = extractFiles(payload);
  const cleanPayload = normalizeCreatePayload(payload);
  const formData = new FormData();

  for (const [key, value] of Object.entries(cleanPayload)) {
    if (value === undefined || value === null) continue;

    if (typeof value === "object" && !isBlob(value) && !isFile(value)) {
      formData.append(key, JSON.stringify(value));
    } else {
      formData.append(key, value);
    }
  }

  for (const file of files) {
    formData.append("attachments", file, file?.name || "archivo");
  }

  return formData;
}

function buildMutationBody(payload = {}) {
  const files = extractFiles(payload);

  if (files.length && typeof FormData !== "undefined") {
    return {
      body: buildFormData(payload),
      hasFiles: true,
    };
  }

  return {
    body: normalizeCreatePayload(payload),
    hasFiles: false,
  };
}

function buildAttachmentsFormData(files = [], extra = {}) {
  const formData = new FormData();

  for (const file of safeArray(files)) {
    if (isFile(file) || isBlob(file)) {
      formData.append("attachments", file, file?.name || "archivo");
    }
  }

  for (const [key, value] of Object.entries(safeObject(extra))) {
    if (value === undefined || value === null) continue;

    if (typeof value === "object" && !isBlob(value) && !isFile(value)) {
      formData.append(key, JSON.stringify(value));
    } else {
      formData.append(key, value);
    }
  }

  return formData;
}

/* =========================================================
   HTTP
========================================================= */

async function getJson(endpoint = "", options = {}) {
  return Http.get(endpoint, {
    timeout: options.timeout || INCIDENCIAS_TIMEOUT,
    query: safeObject(options.query || options.params),
    source: "views.incidencias",
  });
}

async function postJson(endpoint = "", body = {}, options = {}) {
  return Http.post(endpoint, body, {
    timeout: options.timeout || INCIDENCIAS_TIMEOUT,
    source: "views.incidencias",
  });
}

async function patchJson(endpoint = "", body = {}, options = {}) {
  return Http.patch(endpoint, body, {
    timeout: options.timeout || INCIDENCIAS_TIMEOUT,
    source: "views.incidencias",
  });
}

/* =========================================================
   LIST / DETAIL
========================================================= */

export async function fetchIncidenciasRequest(options = {}) {
  const timeout = options.timeout || INCIDENCIAS_TIMEOUT;

  return getJson(INCIDENCIAS_ENDPOINT, {
    timeout,
    query: buildListQuery(options),
  });
}

export async function listIncidencias(options = {}) {
  const force = options.force === true || options.forceRefresh === true;
  const useCache = options.cache !== false && options.noCache !== true;
  const returnStaleOnError = options.returnStaleOnError !== false;
  const key = listCacheKey(options);

  if (!force && useCache && isCacheFresh(options)) {
    return cachedListResponse({
      cached: true,
      stale: false,
      options,
    });
  }

  if (!force && inFlightListPromise && inFlightListKey === key) {
    return inFlightListPromise;
  }

  loading = true;
  lastError = null;
  inFlightListKey = key;

  inFlightListPromise = (async () => {
    try {
      const response = await fetchIncidenciasRequest(options);
      const rawItems = listFromPayload(response);
      const items = normalizeList(rawItems);
      const total = totalFromPayload(response, items.length);

      setListCache({
        items,
        total,
        key,
      });

      return {
        ok: true,
        cached: false,
        stale: false,

        items: lastList.items,
        total: lastList.total,
        count: lastList.items.length,
        loadedAt: lastLoadedAt,

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
        return cachedListResponse({
          cached: true,
          stale: true,
          error: lastError,
          options,
        });
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

export async function getIncidenciaByIdRequest(
  id = "",
  {
    timeout = INCIDENCIAS_DETAIL_TIMEOUT,
  } = {}
) {
  const response = await getJson(getIncidenciaEndpoint(id), {
    timeout,
  });

  const detail = detailFromPayload(response);
  const item = detail ? upsertCachedIncidencia(detail) : null;

  return item;
}

export const loadIncidenciaDetail = getIncidenciaByIdRequest;

/* =========================================================
   CREATE / UPDATE / COMMENT / REOPEN
========================================================= */

export async function createIncidenciaRequest(
  payload = {},
  {
    timeout = INCIDENCIAS_UPLOAD_TIMEOUT,
  } = {}
) {
  const mutation = buildMutationBody(payload);

  const response = await Http.post(INCIDENCIAS_ENDPOINT, mutation.body, {
    timeout: mutation.hasFiles ? INCIDENCIAS_UPLOAD_TIMEOUT : timeout,
    source: "views.incidencias.create",
  });

  const detail = detailFromPayload(response);

  return detail ? normalizeIncidencia(detail) : null;
}

export async function createIncidencia(payload = {}, options = {}) {
  const created = await createIncidenciaRequest(payload, options);

  if (created) {
    return upsertCachedIncidencia(created);
  }

  return created;
}

export async function updateIncidenciaRequest(
  id = "",
  payload = {},
  {
    timeout = INCIDENCIAS_TIMEOUT,
    method = "PATCH",
  } = {}
) {
  const endpoint = getIncidenciaEndpoint(id);
  const verb = cleanText(method, "PATCH").toUpperCase();

  const response =
    verb === "PUT"
      ? await Http.put(endpoint, safeObject(payload), {
          timeout,
          source: "views.incidencias.update",
        })
      : await patchJson(endpoint, safeObject(payload), {
          timeout,
        });

  const detail = detailFromPayload(response);

  return detail ? normalizeIncidencia(detail) : null;
}

export async function updateIncidencia(id = "", payload = {}, options = {}) {
  const updated = await updateIncidenciaRequest(id, payload, options);
  const item = updated ? upsertCachedIncidencia(updated) : await getIncidenciaByIdRequest(id);

  return item;
}

export async function commentIncidenciaRequest(
  id = "",
  message = "",
  {
    timeout = INCIDENCIAS_TIMEOUT,
    status = "open",
  } = {}
) {
  const text = cleanText(message, "");

  if (!text) {
    throw new Error("INCIDENCIA_COMMENT_REQUIRED");
  }

  const response = await postJson(
    getIncidenciaCommentsEndpoint(id),
    {
      message: text,
      text,
      comment: text,
      status,
      estado: status,
    },
    {
      timeout,
    }
  );

  const detail = detailFromPayload(response);

  return detail ? normalizeIncidencia(detail) : null;
}

export async function commentIncidencia(id = "", message = "", options = {}) {
  const updated = await commentIncidenciaRequest(id, message, options);
  const item = updated ? upsertCachedIncidencia(updated) : await getIncidenciaByIdRequest(id);

  return item;
}

export async function reopenIncidenciaRequest(
  id = "",
  {
    timeout = INCIDENCIAS_TIMEOUT,
  } = {}
) {
  const response = await postJson(
    getIncidenciaReopenEndpoint(id),
    {
      status: "open",
      estado: "open",
    },
    {
      timeout,
    }
  );

  const detail = detailFromPayload(response);

  return detail ? normalizeIncidencia(detail) : null;
}

export async function reopenIncidencia(id = "", options = {}) {
  const updated = await reopenIncidenciaRequest(id, options);
  const item = updated ? upsertCachedIncidencia(updated) : await getIncidenciaByIdRequest(id);

  return item;
}

/* =========================================================
   ATTACHMENTS
========================================================= */

export async function uploadIncidenciaAttachmentsRequest(
  id = "",
  files = [],
  {
    timeout = INCIDENCIAS_UPLOAD_TIMEOUT,
    status = "open",
    extra = {},
  } = {}
) {
  const list = safeArray(files).filter((file) => isFile(file) || isBlob(file));

  if (!list.length) {
    throw new Error("INCIDENCIA_ATTACHMENTS_REQUIRED");
  }

  const formData = buildAttachmentsFormData(list, {
    status,
    estado: status,
    ...safeObject(extra),
  });

  const response = await Http.post(getIncidenciaAttachmentsEndpoint(id), formData, {
    timeout,
    source: "views.incidencias.attachments",
  });

  const detail = detailFromPayload(response);

  return detail ? normalizeIncidencia(detail) : null;
}

export async function uploadIncidenciaAttachments(id = "", files = [], options = {}) {
  const updated = await uploadIncidenciaAttachmentsRequest(id, files, options);
  const item = updated ? upsertCachedIncidencia(updated) : await getIncidenciaByIdRequest(id);

  return item;
}

export async function getIncidenciaAttachmentFileRequest(
  {
    ticketId = "",
    attachmentId = "",
    mode = "view",
    kind = "attachments",
  } = {},
  {
    timeout = INCIDENCIAS_DETAIL_TIMEOUT,
  } = {}
) {
  const endpoint = getIncidenciaAttachmentFileEndpoint({
    ticketId,
    attachmentId,
    mode,
    kind,
  });

  const response = await getJson(endpoint, {
    timeout,
  });

  return normalizeFileResponse(response, {
    ticketId,
    attachmentId,
    mode,
    kind,
  });
}

export async function openIncidenciaAttachment(options = {}, requestOptions = {}) {
  return getIncidenciaAttachmentFileRequest(
    {
      ...options,
      mode: "view",
    },
    requestOptions
  );
}

export async function downloadIncidenciaAttachment(
  {
    ticketId = "",
    attachmentId = "",
    kind = "attachments",
    filename = "",
  } = {},
  {
    timeout = INCIDENCIAS_DETAIL_TIMEOUT,
    autoDownload = true,
  } = {}
) {
  const endpoint = getIncidenciaAttachmentFileEndpoint({
    ticketId,
    attachmentId,
    kind,
    mode: "download",
  });

  return Http.downloadBlob(endpoint, {
    timeout,
    autoDownload,
    filename,
    source: "views.incidencias.download",
  });
}

/* =========================================================
   STATS LOCAL
========================================================= */

function isClosedStatus(value = "") {
  return ["closed", "resolved", "cerrada", "cerrado", "resuelta", "resuelto"].includes(
    normalizeKey(value)
  );
}

function isOpenStatus(value = "") {
  const key = normalizeKey(value);
  return ["open", "pending", "in_progress", "progress", "abierta", "pendiente", "proceso"].includes(key);
}

function isUrgentPriority(value = "") {
  const key = normalizeKey(value);
  return ["urgent", "urgente", "high", "alta", "critical", "critica", "critico"].includes(key);
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
    {
      total: 0,
      open: 0,
      closed: 0,
      urgent: 0,
      attachments: 0,
      invoiceTotal: 0,
    }
  );
}

export async function loadIncidenciasStats() {
  return computeIncidenciasStats(lastList.items);
}

/* =========================================================
   ERRORS / CACHE / SNAPSHOT
========================================================= */

function normalizeError(error = null) {
  return {
    message: redact(error?.message || "No se pudo cargar incidencias."),
    status: error?.status || error?.statusCode || error?.response?.status || null,
    code: error?.code || error?.error || null,
    at: nowIso(),
  };
}

export function hydrateIncidenciasFromCache() {
  return {
    items: safeArray(lastList.items),
    total: number(lastList.total, safeArray(lastList.items).length),
    loadedAt: lastLoadedAt,
    hydrated: Boolean(lastLoadedAt),
    fresh: isCacheFresh(),
    ageMs: cacheAgeMs(),
    ttlMs: INCIDENCIAS_CACHE_TTL_MS,
  };
}

export function clearIncidenciasCache() {
  lastList = {
    items: [],
    total: 0,
  };

  lastLoadedAt = null;
  lastError = null;
  lastCacheKey = "";

  inFlightListPromise = null;
  inFlightListKey = "";

  loading = false;

  return true;
}

export function getIncidenciasApiSnapshot() {
  return {
    version: INCIDENCIAS_API_VERSION,

    endpoint: INCIDENCIAS_ENDPOINT,
    usersSearchEndpoint: USERS_SEARCH_ENDPOINT,

    loading,
    inFlight: Boolean(inFlightListPromise),

    lastLoadedAt,
    lastError,

    cache: {
      ...getIncidenciasCacheState(),
      stats: computeIncidenciasStats(lastList.items),
    },

    policy: {
      apiOnly: true,
      singleHttpLayer: true,
      inMemoryCache: true,
      ttlCache: true,
      inFlightDedupe: true,
      staleOnError: true,
      mutationCacheSync: true,
      nonDestructiveCacheMerge: true,

      backendCreatePayload1to1: true,
      doesNotInventClienteId: true,
      targetClienteIdCompatible: true,
      createUserSearchViaApi: true,

      requesterEmailAliasCompatibility: true,
      requesterAvatarAliasCompatibility: true,
      technicianAvatarAliasCompatibility: true,
      preservesLightweightCounts: true,

      noFetch: true,
      noStore: true,
      noStateExternal: true,
      noModelExternal: true,
      noDom: true,
      noRouter: true,
    },
  };
}

/* =========================================================
   COMPAT EXPORTS
========================================================= */

export const fetchIncidencias = listIncidencias;
export const getIncidenciaById = getIncidenciaByIdRequest;

export const createTicket = createIncidencia;
export const updateTicket = updateIncidencia;
export const commentTicket = commentIncidencia;
export const reopenTicket = reopenIncidencia;
export const uploadTicketAttachments = uploadIncidenciaAttachments;
export const openTicketAttachment = openIncidenciaAttachment;
export const downloadTicketAttachment = downloadIncidenciaAttachment;

/* =========================================================
   PUBLIC API
========================================================= */

export const IncidenciasApi = Object.freeze({
  version: INCIDENCIAS_API_VERSION,

  endpoint: INCIDENCIAS_ENDPOINT,
  usersSearchEndpoint: USERS_SEARCH_ENDPOINT,

  timeout: INCIDENCIAS_TIMEOUT,
  detailTimeout: INCIDENCIAS_DETAIL_TIMEOUT,
  uploadTimeout: INCIDENCIAS_UPLOAD_TIMEOUT,
  cacheTtl: INCIDENCIAS_CACHE_TTL_MS,

  USERS_SEARCH_ENDPOINT,
  USERS_SEARCH_LIMIT,

  normalizeIncidenciaId,

  getIncidenciaEndpoint,
  getIncidenciaCommentsEndpoint,
  getIncidenciaReopenEndpoint,
  getIncidenciaAttachmentsEndpoint,
  getIncidenciaAttachmentFileEndpoint,

  normalizeIncidencia,
  normalizeCreateSearchUser,
  searchIncidenciaUsers,

  computeIncidenciasStats,

  fetchIncidenciasRequest,
  listIncidencias,
  loadIncidencias,
  fetchIncidencias,

  getIncidenciaByIdRequest,
  getIncidenciaById,
  loadIncidenciaDetail,

  createIncidenciaRequest,
  createIncidencia,
  createTicket,

  updateIncidenciaRequest,
  updateIncidencia,
  updateTicket,

  commentIncidenciaRequest,
  commentIncidencia,
  commentTicket,

  reopenIncidenciaRequest,
  reopenIncidencia,
  reopenTicket,

  uploadIncidenciaAttachmentsRequest,
  uploadIncidenciaAttachments,
  uploadTicketAttachments,

  getIncidenciaAttachmentFileRequest,
  openIncidenciaAttachment,
  openTicketAttachment,
  downloadIncidenciaAttachment,
  downloadTicketAttachment,

  loadIncidenciasStats,

  hydrateIncidenciasFromCache,
  hasFreshIncidenciasCache,
  getIncidenciasCacheState,
  clearIncidenciasCache,

  getIncidenciasApiSnapshot,
  getSnapshot: getIncidenciasApiSnapshot,
});

export default IncidenciasApi;
