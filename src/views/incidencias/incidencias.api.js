/* =========================================================
   Onion Support - Incidencias API
   Archivo: /src/views/incidencias/incidencias.api.js

   Contrato productivo:
   - Centraliza HTTP de incidencias.
   - Crea incidencias con multipart real cuando hay adjuntos.
   - Campo de fichero canónico: attachments.
   - Mantiene aliases para backend: subject/asunto/title,
     description/descripcion/message/body, category/categoria/tipo/type.
   - Admin: targetUserId real + targetClienteId sólo si existe.
   - No inventa clienteId desde targetUserId.
   - Normaliza respuesta a ticket/item/detail/incidencia/data.
   - Compatible con Blob container tickets y paths devueltos por backend.
========================================================= */

import Http from "../../core/http.js";

export const INCIDENCIAS_API_VERSION = "incidencias.api.aligned.blob.v10";
export const INCIDENCIAS_ENDPOINT = "/api/tickets";
export const USERS_SEARCH_ENDPOINT = "/api/users";

export const USERS_SEARCH_LIMIT = 8;
export const USERS_SEARCH_MIN_LENGTH = 2;

export const INCIDENCIAS_TIMEOUT = 15000;
export const INCIDENCIAS_DETAIL_TIMEOUT = 25000;
export const INCIDENCIAS_UPLOAD_TIMEOUT = 180000;

export const INCIDENCIAS_LIST_LIMIT = 48;
export const INCIDENCIAS_CACHE_TTL_MS = 60000;

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

function normalizeEmail(value = "") {
  const email = cleanText(value, "").toLowerCase();

  if (!email) return "";

  if (["null", "undefined", "none", "sin email", "no email", "no_email", "__no_email__"].includes(email)) {
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

function getIncidenciaEndpoint(id = "") {
  return `${INCIDENCIAS_ENDPOINT}/${encodeSegment(id)}`;
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
  return `${getIncidenciaEndpoint(ticketId)}/${encodeSegment(kind)}/${encodeSegment(attachmentId)}/${encodeSegment(mode)}`;
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

function buildListQuery({ query = {}, params = {} } = {}) {
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

function cachedListResponse({ cached = true, stale = false, error = null, options = {} } = {}) {
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

function setListCache({ items = [], total = 0, key = "" } = {}) {
  const normalized = normalizeList(items);

  lastList = {
    items: normalized,
    total: number(total, normalized.length),
  };

  lastLoadedAt = nowIso();
  lastCacheKey = cleanText(key, "");

  return lastList;
}

export function hydrateIncidenciasFromCache() {
  return {
    ok: Boolean(lastLoadedAt),
    cached: true,
    stale: !lastLoadedAt,
    items: safeArray(lastList.items),
    total: number(lastList.total, safeArray(lastList.items).length),
    count: safeArray(lastList.items).length,
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

function listFromPayload(payload = {}) {
  const raw = safeObject(payload);

  return safeArray(
    first(
      raw.items,
      raw.results,
      raw.data?.items,
      raw.data?.results,
      raw.data,
      raw.tickets,
      raw.incidencias,
      raw.rows,
      []
    )
  );
}

function detailFromPayload(payload = {}) {
  const raw = safeObject(payload);

  return safeObject(
    first(
      raw.ticket,
      raw.item,
      raw.detail,
      raw.incidencia,
      raw.data?.ticket,
      raw.data?.item,
      raw.data?.detail,
      raw.data?.incidencia,
      raw.data,
      raw.resource,
      raw.result,
      raw
    ),
    null
  );
}

function totalFromPayload(payload = {}, fallback = 0) {
  const raw = safeObject(payload);

  return countFrom(
    raw.total,
    raw.totalCount,
    raw.countTotal,
    raw.meta?.total,
    raw.data?.total,
    raw.data?.totalCount,
    fallback
  );
}

function usersListFromPayload(payload = {}) {
  const raw = safeObject(payload);

  return safeArray(
    first(
      raw.items,
      raw.results,
      raw.users,
      raw.usuarios,
      raw.data?.items,
      raw.data?.results,
      raw.data?.users,
      raw.data?.usuarios,
      raw.data,
      []
    )
  );
}

/* =========================================================
   NORMALIZE USERS
========================================================= */

function normalizeCreateSearchUser(user = {}) {
  const raw = safeObject(user);

  const userId = cleanText(
    first(
      raw.userId,
      raw.id,
      raw.uid,
      raw.sub,
      raw.usuarioId,
      raw.auth?.userId,
      raw.profile?.userId,
      raw.lookup?.userId,
      raw.raw?.userId,
      raw.raw?.id,
      ""
    ),
    ""
  );

  const clienteId = cleanText(
    first(
      raw.targetClienteId,
      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.cliente?.clienteId,
      raw.cliente?.id,
      raw.client?.clienteId,
      raw.client?.id,
      raw.tenant?.clienteId,
      raw.lookup?.clienteId,
      raw.raw?.clienteId,
      raw.raw?.cliente?.clienteId,
      raw.raw?.cliente?.id,
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

  const email = firstEmail(
    raw.email,
    raw.emailLower,
    raw.userEmail,
    raw.clienteEmail,
    raw.clientEmail,
    raw.profile?.email,
    raw.lookup?.email,
    raw.raw?.email,
    raw.raw?.emailLower
  );

  const username = cleanText(
    first(raw.username, raw.usernameLower, raw.profile?.username, raw.raw?.username, ""),
    ""
  );

  const avatar = firstUrl(raw, raw.raw, raw.profile, raw.cliente, raw.client);
  const role = normalizeKey(first(raw.role, raw.rol, raw.raw?.role, raw.raw?.rol, "user")) || "user";
  const phone = cleanText(first(raw.phone, raw.telefono, raw.raw?.phone, raw.raw?.telefono, ""), "");

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

function getTicketId(item = {}) {
  const raw = safeObject(item);

  return cleanText(
    first(raw.ticketId, raw.incidenciaId, raw.id, raw.code, raw.numero, raw.ticketCode),
    ""
  );
}

function normalizeStatus(value = "") {
  const key = normalizeKey(value || "open");

  const map = {
    pending: "pending",
    pendiente: "pending",
    open: "open",
    abierta: "open",
    abierto: "open",
    in_progress: "in_progress",
    progress: "in_progress",
    proceso: "in_progress",
    resolved: "resolved",
    resuelta: "resolved",
    resuelto: "resolved",
    closed: "closed",
    cerrada: "closed",
    cerrado: "closed",
  };

  return map[key] || key || "open";
}

function normalizePriority(value = "") {
  const key = normalizeKey(value || "medium");

  const map = {
    baja: "low",
    low: "low",
    media: "medium",
    normal: "medium",
    medium: "medium",
    alta: "high",
    high: "high",
    urgente: "urgent",
    urgent: "urgent",
    critical: "urgent",
    critica: "urgent",
    critico: "urgent",
  };

  return map[key] || key || "medium";
}

function normalizeTechnician(value = {}) {
  const raw = safeObject(value);
  const avatar = firstUrl(
    raw.avatarUrl,
    raw.avatar,
    raw.assignedToAvatarUrl,
    raw.assignedToAvatar,
    raw.technicianAvatarUrl,
    raw.technicianAvatar,
    FIXED_TECHNICIAN.avatarUrl
  );

  const userId = cleanText(first(raw.userId, raw.id, raw.assignedToUserId, FIXED_TECHNICIAN.userId), FIXED_TECHNICIAN.userId);
  const name = cleanText(first(raw.name, raw.nombre, raw.displayName, raw.assignedToName, FIXED_TECHNICIAN.name), FIXED_TECHNICIAN.name);
  const email = firstEmail(raw.email, raw.emailLower, raw.assignedToEmail, FIXED_TECHNICIAN.email);
  const role = normalizeKey(first(raw.role, raw.rol, FIXED_TECHNICIAN.role)) || FIXED_TECHNICIAN.role;

  return {
    id: userId,
    userId,
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
  };
}

function normalizeAttachment(file = {}, index = 0) {
  const raw = safeObject(file);
  const id = cleanText(first(raw.id, raw.attachmentId, raw.fileId, `att_${index}`), `att_${index}`);
  const name = safePublicText(first(raw.name, raw.filename, raw.fileName, raw.originalName, `Adjunto ${index + 1}`), `Adjunto ${index + 1}`);
  const url = firstUrl(raw.viewUrl, raw.openUrl, raw.downloadUrl, raw.url, raw.blobUrl, raw.publicUrl, raw.signedUrl);
  const contentType = cleanText(first(raw.contentType, raw.mimeType, raw.mimetype, raw.type, ""), "");
  const path = safePublicText(first(raw.path, raw.blobPath, raw.blobName, raw.storagePath, raw.storageKey, ""), "");

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
    uploadedAt: cleanText(first(raw.uploadedAt, raw.createdAt, ""), ""),
  };
}

function normalizeRequester(raw = {}) {
  const source = safeObject(raw);
  const snap = safeObject(first(source.requesterSnapshot, source.cliente, source.receptor, source.user, {}));

  const userId = cleanText(first(source.userId, snap.userId, snap.id, snap.uid, ""), "");
  const clienteId = cleanText(first(source.clienteId, snap.clienteId, snap.clientId, ""), "");
  const name = cleanText(first(source.displayName, source.name, source.nombre, snap.displayName, snap.name, snap.nombre, "Usuario"), "Usuario");
  const email = firstEmail(source.email, source.emailLower, snap.email, snap.emailLower);
  const username = cleanText(first(source.username, source.usernameLower, snap.username, snap.usernameLower, ""), "");
  const phone = cleanText(first(source.phone, source.telefono, snap.phone, snap.telefono, ""), "");
  const avatar = firstUrl(source.avatarUrl, source.avatar, snap.avatarUrl, snap.avatar);
  const role = normalizeKey(first(source.role, source.rol, snap.role, snap.rol, "user")) || "user";

  return {
    id: userId,
    userId,
    clienteId: clienteId || null,
    name,
    nombre: name,
    displayName: name,
    email,
    emailLower: email,
    username,
    usernameLower: username.toLowerCase(),
    phone,
    telefono: phone,
    avatar: avatar || null,
    avatarUrl: avatar || null,
    hasAvatar: Boolean(avatar),
    role,
    active: source.active !== false && snap.active !== false,
    tipo: cleanText(first(source.tipo, snap.tipo, ""), ""),
    nif: cleanText(first(source.nif, snap.nif, ""), ""),
  };
}

function normalizeIncidencia(item = {}) {
  const raw = safeObject(item);
  const id = getTicketId(raw);
  const subject = safePublicText(first(raw.subject, raw.asunto, raw.title, "Sin asunto"), "Sin asunto");
  const message = safePublicText(first(raw.message, raw.description, raw.descripcion, raw.body, ""), "");
  const status = normalizeStatus(first(raw.status, raw.estado, "open"));
  const priority = normalizePriority(first(raw.priority, raw.prioridad, "medium"));
  const category = normalizeKey(first(raw.category, raw.categoria, raw.tipo, raw.type, "general")) || "general";
  const type = normalizeKey(first(raw.tipo, raw.type, category, "general")) || category;
  const requester = normalizeRequester(raw);
  const attachments = safeArray(first(raw.attachments, raw.files, raw.adjuntos, [])).map(normalizeAttachment);
  const comments = safeArray(raw.comments);
  const history = safeArray(raw.history);
  const technician = normalizeTechnician(first(raw.tecnico, raw.assignedTo, raw.assignment?.technician, raw.technician, FIXED_TECHNICIAN));
  const assignment = {
    ...safeObject(raw.assignment),
    status: "assigned",
    policy: cleanText(raw.assignment?.policy || raw.meta?.assignmentPolicy || "fixed_default_technician", "fixed_default_technician"),
    assignedToUserId: technician.userId,
    assignedToName: technician.name,
    assignedToEmail: technician.email,
    team: cleanText(raw.assignment?.team, "support"),
    userId: technician.userId,
    assignedToAvatar: technician.avatar,
    assignedToAvatarUrl: technician.avatarUrl,
    technicianAvatar: technician.avatar,
    technicianAvatarUrl: technician.avatarUrl,
    agentAvatar: technician.avatar,
    agentAvatarUrl: technician.avatarUrl,
    avatar: technician.avatar,
    avatarUrl: technician.avatarUrl,
    assignedToHasAvatar: Boolean(technician.avatar),
    technician,
  };

  const normalized = {
    ...raw,

    id,
    ticketId: id,
    incidenciaId: id,
    entityType: cleanText(raw.entityType, "ticket"),
    tipoDocumento: cleanText(raw.tipoDocumento, "ticket"),
    schemaVersion: number(raw.schemaVersion, 1),

    subject,
    asunto: subject,
    title: subject,
    message,
    description: message,
    descripcion: message,
    preview: safePublicText(first(raw.preview, message.slice(0, 240)), message.slice(0, 240)),

    status,
    estado: status,
    priority,
    prioridad: priority,
    category,
    categoria: category,
    tipo: type,
    type,

    userId: cleanText(first(raw.userId, requester.userId), requester.userId),
    clienteId: first(raw.clienteId, requester.clienteId, null),

    name: requester.name,
    displayName: requester.displayName,
    email: requester.email,
    avatar: requester.avatar,
    avatarUrl: requester.avatarUrl,
    username: requester.username,
    phone: requester.phone,

    requesterSnapshot: {
      ...safeObject(raw.requesterSnapshot),
      ...requester,
    },

    cliente: {
      ...safeObject(raw.cliente),
      id: first(raw.cliente?.id, raw.clienteId, requester.clienteId, requester.userId, null),
      userId: requester.userId,
      clienteId: first(raw.cliente?.clienteId, raw.clienteId, requester.clienteId, null),
      nombre: requester.name,
      name: requester.name,
      displayName: requester.displayName,
      email: requester.email,
      avatar: requester.avatar,
      avatarUrl: requester.avatarUrl,
      username: requester.username,
      phone: requester.phone,
      telefono: requester.phone,
      active: requester.active,
    },

    receptor: {
      ...safeObject(raw.receptor),
      id: requester.userId,
      userId: requester.userId,
      clienteId: first(raw.receptor?.clienteId, raw.clienteId, requester.clienteId, null),
      name: requester.name,
      displayName: requester.displayName,
      email: requester.email,
      username: requester.username,
      phone: requester.phone,
      avatar: requester.avatar,
      avatarUrl: requester.avatarUrl,
    },

    tecnico: technician,
    assignedTo: technician,
    technician,
    assignment,

    assignedToUserId: technician.userId,
    assignedToName: technician.name,
    assignedToEmail: technician.email,
    assignedToAvatar: technician.avatar,
    assignedToAvatarUrl: technician.avatarUrl,
    technicianName: technician.name,
    technicianEmail: technician.email,
    technicianAvatar: technician.avatar,
    technicianAvatarUrl: technician.avatarUrl,
    tecnicoName: technician.name,
    tecnicoEmail: technician.email,
    tecnicoAvatar: technician.avatar,
    tecnicoAvatarUrl: technician.avatarUrl,
    agentName: technician.name,
    agentEmail: technician.email,
    agentAvatar: technician.avatar,
    agentAvatarUrl: technician.avatarUrl,

    createdAt: cleanText(first(raw.createdAt, raw.lifecycle?.createdAt, ""), ""),
    createdAtES: cleanText(first(raw.createdAtES, raw.lifecycle?.createdAtES, ""), ""),
    updatedAt: cleanText(first(raw.updatedAt, raw.lifecycle?.updatedAt, raw.createdAt, ""), ""),
    updatedAtES: cleanText(first(raw.updatedAtES, raw.lifecycle?.updatedAtES, raw.createdAtES, ""), ""),
    lastActivityAt: cleanText(first(raw.lastActivityAt, raw.lifecycle?.lastActivityAt, raw.updatedAt, raw.createdAt, ""), ""),
    lastActivityAtES: cleanText(first(raw.lastActivityAtES, raw.lifecycle?.lastActivityAtES, raw.updatedAtES, raw.createdAtES, ""), ""),

    attachments,
    files: attachments,
    adjuntos: attachments,
    attachmentsCount: countFrom(raw.attachmentsCount, raw.attachmentCount, raw.filesCount, attachments.length),
    attachmentCount: countFrom(raw.attachmentCount, raw.attachmentsCount, raw.filesCount, attachments.length),
    filesCount: countFrom(raw.filesCount, raw.attachmentsCount, attachments.length),

    comments,
    commentsCount: countFrom(raw.commentsCount, comments.length),
    history,
    historyCount: countFrom(raw.historyCount, history.length),

    meta: {
      ...safeObject(raw.meta),
      schemaVersion: number(raw.meta?.schemaVersion, number(raw.schemaVersion, 1)),
      hasAttachments: attachments.length > 0,
      isAssigned: true,
      assignmentPolicy: raw.meta?.assignmentPolicy || assignment.policy,
      blobContainer: raw.meta?.blobContainer || attachments[0]?.containerName || "tickets",
      blobPathPolicy: raw.meta?.blobPathPolicy || raw.meta?.attachmentStoragePolicy || "userId_userName_ticketId_attachment",
      assignedTechnicianUserId: technician.userId,
      assignedTechnicianName: technician.name,
      assignedTechnicianEmail: technician.email,
      assignedTechnicianAvatar: technician.avatar,
      assignedTechnicianAvatarUrl: technician.avatarUrl,
    },
  };

  return normalized;
}

function normalizeList(items = []) {
  return safeArray(items)
    .map(normalizeIncidencia)
    .filter((item) => item.ticketId || item.id)
    .sort((a, b) => ticketSortTime(b) - ticketSortTime(a));
}

function ticketSortTime(item = {}) {
  const raw = safeObject(item);
  const timestamp = Date.parse(
    first(
      raw.lastActivityAt,
      raw.updatedAt,
      raw.modifiedAt,
      raw.closedAt,
      raw.createdAt,
      raw.lifecycle?.lastActivityAt,
      raw.lifecycle?.updatedAt,
      raw.lifecycle?.closedAt,
      raw.lifecycle?.createdAt,
      0
    )
  );

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function upsertCachedIncidencia(item = null) {
  const normalized = normalizeIncidencia(item);
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

  if (typeof FileList !== "undefined" && value instanceof FileList) {
    return Array.from(value).filter(isFileLike);
  }

  if (Array.isArray(value)) return value.flatMap(normalizeFilesInput).filter(isFileLike);

  if (isObject(value) && typeof value.length === "number") {
    try {
      return Array.from(value).filter(isFileLike);
    } catch {
      return [];
    }
  }

  return [];
}

function extractFiles(payload = {}) {
  const source = safeObject(payload);

  return normalizeFilesInput(
    first(source.attachments, source.files, source.adjuntos, source.uploads, source.file, source.adjunto, [])
  );
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
  const priority = normalizePriority(first(source.priority, source.prioridad, "medium"));
  const status = normalizeStatus(first(source.status, source.estado, "open"));
  const category = normalizeKey(first(source.category, source.categoria, source.tipo, "general")) || "general";
  const origin = cleanText(first(source.source, source.origen, source.channel, "panel_admin"), "panel_admin");

  const targetUserId = cleanText(
    first(
      source.targetUserId,
      source.receptorUserId,
      source.affectedUserId,
      source.usuarioId,
      source.userId,
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
      source.affectedUserName,
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
    source.affectedUserEmail,
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
  };

  if (targetUserId) {
    normalized.targetUserId = targetUserId;
    normalized.receptorUserId = targetUserId;
    normalized.affectedUserId = targetUserId;
    normalized.userId = targetUserId;
    normalized.usuarioId = targetUserId;
    normalized.uid = targetUserId;
  }

  /*
    No inventamos clienteId desde targetUserId.
    Sólo se envía clienteId/clientId cuando el buscador/backend lo devuelve real.
  */
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

  normalized.assignedToUserId = FIXED_TECHNICIAN.userId;
  normalized.assignedToName = FIXED_TECHNICIAN.name;
  normalized.assignedToEmail = FIXED_TECHNICIAN.email;
  normalized.assignmentPolicy = "fixed_default_technician";

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

  for (const [key, value] of Object.entries(cleanPayload)) {
    appendFormValue(formData, key, value);
  }

  formData.append("hasAttachments", files.length ? "true" : "false");
  formData.append("attachmentsCount", String(files.length));

  for (const file of files) {
    formData.append("attachments", file, file?.name || "archivo");
  }

  return formData;
}

function buildMutationBody(payload = {}) {
  const files = dedupeFiles(extractFiles(payload));

  if (files.length && typeof FormData !== "undefined") {
    return {
      body: buildFormData(payload),
      hasFiles: true,
      filesCount: files.length,
    };
  }

  return {
    body: normalizeCreatePayload(payload),
    hasFiles: false,
    filesCount: 0,
  };
}

function buildAttachmentsFormData(files = [], extra = {}) {
  const list = dedupeFiles(normalizeFilesInput(files));
  const formData = new FormData();

  formData.append("hasAttachments", list.length ? "true" : "false");
  formData.append("attachmentsCount", String(list.length));

  for (const file of list) {
    formData.append("attachments", file, file?.name || "archivo");
  }

  for (const [key, value] of Object.entries(safeObject(extra))) {
    appendFormValue(formData, key, value);
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

    // Flags defensivos: si el core/http los soporta, evitan serialización JSON
    // y dejan que el navegador ponga el boundary correcto.
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

      setListCache({ items, total, key });

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

  if (responseLooksFailed(response)) {
    throw new Error(responseErrorMessage(response, "No se pudo crear la incidencia."));
  }

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

  const response = verb === "PUT"
    ? await Http.put(endpoint, safeObject(payload), {
        timeout,
        source: "views.incidencias.update",
      })
    : await patchJson(endpoint, safeObject(payload), {
        timeout,
        source: "views.incidencias.update",
      });

  if (responseLooksFailed(response)) {
    throw new Error(responseErrorMessage(response, "No se pudo actualizar la incidencia."));
  }

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
    {
      message: text,
      text,
      comment: text,
      status,
      estado: status,
    },
    {
      timeout,
      source: "views.incidencias.comment",
    }
  );

  if (responseLooksFailed(response)) {
    throw new Error(responseErrorMessage(response, "No se pudo comentar la incidencia."));
  }

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
    { status: "open", estado: "open" },
    {
      timeout,
      source: "views.incidencias.reopen",
    }
  );

  if (responseLooksFailed(response)) {
    throw new Error(responseErrorMessage(response, "No se pudo reabrir la incidencia."));
  }

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

  const formData = buildAttachmentsFormData(list, {
    status,
    estado: status,
    ...safeObject(extra),
  });

  const response = await postMultipart(getIncidenciaAttachmentsEndpoint(id), formData, {
    timeout,
    source: "views.incidencias.attachments.multipart",
  });

  if (responseLooksFailed(response)) {
    throw new Error(responseErrorMessage(response, "No se pudieron subir los adjuntos."));
  }

  const detail = detailFromPayload(response);
  return detail ? normalizeIncidencia(detail) : null;
}

export async function uploadIncidenciaAttachments(id = "", files = [], options = {}) {
  const updated = await uploadIncidenciaAttachmentsRequest(id, files, options);
  return updated ? upsertCachedIncidencia(updated) : await getIncidenciaByIdRequest(id);
}

function normalizeFileResponse(response = {}, context = {}) {
  const raw = safeObject(response);
  const data = safeObject(first(raw.file, raw.attachment, raw.data?.file, raw.data?.attachment, raw.data, raw), {});
  const url = firstUrl(data.viewUrl, data.openUrl, data.downloadUrl, data.signedUrl, data.url, raw.url, raw.href);

  return {
    ...data,
    ticketId: context.ticketId,
    attachmentId: context.attachmentId,
    mode: context.mode,
    kind: context.kind,
    id: cleanText(first(data.id, data.attachmentId, context.attachmentId), context.attachmentId),
    attachmentId: cleanText(first(data.attachmentId, data.id, context.attachmentId), context.attachmentId),
    url,
    viewUrl: firstUrl(data.viewUrl, url),
    openUrl: firstUrl(data.openUrl, url),
    downloadUrl: firstUrl(data.downloadUrl, url),
    signedUrl: firstUrl(data.signedUrl, url),
    name: safePublicText(first(data.name, data.filename, data.fileName, "adjunto"), "adjunto"),
    contentType: cleanText(first(data.contentType, data.mimeType, data.mimetype, data.type, ""), ""),
  };
}

export async function getIncidenciaAttachmentFileRequest({ ticketId = "", attachmentId = "", mode = "view", kind = "attachments" } = {}, { timeout = INCIDENCIAS_DETAIL_TIMEOUT } = {}) {
  const endpoint = getIncidenciaAttachmentFileEndpoint({ ticketId, attachmentId, mode, kind });
  const response = await getJson(endpoint, {
    timeout,
    source: "views.incidencias.attachment.file",
  });

  if (responseLooksFailed(response)) {
    throw new Error(responseErrorMessage(response, "No se pudo abrir el adjunto."));
  }

  return normalizeFileResponse(response, { ticketId, attachmentId, mode, kind });
}

export async function openIncidenciaAttachment(options = {}, requestOptions = {}) {
  return getIncidenciaAttachmentFileRequest({ ...options, mode: "view" }, requestOptions);
}

export async function downloadIncidenciaAttachment({ ticketId = "", attachmentId = "", kind = "attachments", filename = "" } = {}, { timeout = INCIDENCIAS_DETAIL_TIMEOUT, autoDownload = true } = {}) {
  const endpoint = getIncidenciaAttachmentFileEndpoint({ ticketId, attachmentId, kind, mode: "download" });

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
  return ["closed", "resolved", "cerrada", "cerrado", "resuelta", "resuelto"].includes(normalizeKey(value));
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
  return {
    version: INCIDENCIAS_API_VERSION,
    endpoint: INCIDENCIAS_ENDPOINT,
    usersEndpoint: USERS_SEARCH_ENDPOINT,
    loading,
    cached: Boolean(lastLoadedAt),
    total: number(lastList.total, safeArray(lastList.items).length),
    count: safeArray(lastList.items).length,
    lastLoadedAt,
    lastCacheKey,
    cacheAgeMs: cacheAgeMs(),
    inFlight: Boolean(inFlightListPromise),
    lastError,
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
};
