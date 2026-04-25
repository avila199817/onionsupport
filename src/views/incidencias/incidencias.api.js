/* =========================================================
   Onion SPA - Incidencias API
   Archivo: src/views/incidencias/incidencias.api.js

   FINAL PRO SYSTEM · API LAYER · 10/10

   RESPONSABILIDADES:
   - centralizar llamadas HTTP del módulo incidencias
   - exponer listado + detalle + create + update
   - subir adjuntos en incidencias existentes
   - comentar / reabrir incidencias
   - resolver URLs seguras de visualización / descarga de adjuntos
   - soportar refresh forzado
   - hidratar state/store de forma coherente
   - normalizar payloads backend heterogéneos
   - soportar múltiples adapters de request
   - prevenir race conditions blandas en cargas de listado

   HARDENING PRO:
   - get detalle devuelve objeto limpio y rico
   - soporta envelopes heterogéneos
   - soporta arrays / nested envelopes / payloads mixtos
   - fallback AppCore.apiClient -> AppCore.request -> Http -> fetch
   - fetch soporta JSON, FormData, Blob, texto
   - query params reales
   - Content-Type seguro para FormData
   - persistencia coherente en store/state
   - errores con mensaje consistente
   - surface pública estable
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  incidenciasState,
  setLoading,
  setRefreshing,
  setError,
  setItems,
  setRemoteCount,
  setLastSyncAt,
  setLoaded,
} from "./incidencias.state.js";

import {
  replaceIncidenciasStore,
  upsertIncidenciaStore,
} from "./incidencias.store.js";

/* =========================================================
   CONFIG
========================================================= */

export const INCIDENCIAS_RESOURCE = "tickets";
export const INCIDENCIAS_ENDPOINT = "/api/tickets";
export const INCIDENCIAS_ALT_ENDPOINT = "/api/incidencias";
export const INCIDENCIAS_TIMEOUT = 15000;
export const INCIDENCIAS_UPLOAD_TIMEOUT = 90000;

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

    return value;
  }

  return null;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

function joinApiPath(...parts) {
  return parts
    .map((part) => normalizePathPart(part))
    .filter(Boolean)
    .join("/");
}

function encodeUrlPathSegment(value = "") {
  return encodeURIComponent(safeText(value, ""));
}

function normalizeStatus(value = "open") {
  const raw = safeLower(value, "open").replace(/\s+/g, "_");

  const map = {
    open: "open",
    abierta: "open",
    abierto: "open",

    pending: "pending",
    pendiente: "pending",

    in_progress: "in_progress",
    inprogress: "in_progress",
    progress: "in_progress",
    proceso: "in_progress",
    en_proceso: "in_progress",

    resolved: "resolved",
    resuelta: "resolved",
    resuelto: "resolved",

    closed: "closed",
    cerrada: "closed",
    cerrado: "closed",
  };

  return map[raw] || raw || "open";
}

function normalizePriority(value = "medium") {
  const raw = safeLower(value, "medium").replace(/\s+/g, "_");

  const map = {
    low: "low",
    baja: "low",

    medium: "medium",
    media: "medium",
    normal: "medium",

    high: "high",
    alta: "high",

    urgent: "urgent",
    urgente: "urgent",
    critical: "urgent",
    critica: "urgent",
    crítica: "urgent",
  };

  return map[raw] || raw || "medium";
}

function normalizeCategory(value = "general") {
  return safeLower(value, "general") || "general";
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

  const entries = Object.entries(params).filter(([, value]) => {
    if (value === undefined || value === null) return false;
    if (typeof value === "string" && value.trim() === "") return false;
    return true;
  });

  if (!entries.length) {
    return cleanUrl;
  }

  const separator = cleanUrl.includes("?") ? "&" : "?";
  const search = entries
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return value
          .map((item) => {
            return `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`;
          })
          .join("&");
      }

      return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
    })
    .filter(Boolean)
    .join("&");

  return search ? `${cleanUrl}${separator}${search}` : cleanUrl;
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
    return localStorage.getItem(cleanKey) || "";
  } catch {}

  try {
    return sessionStorage.getItem(cleanKey) || "";
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

export function normalizeIncidenciaId(id = "") {
  const ticketId = safeText(id, "");

  if (!ticketId) {
    throw new Error("INCIDENCIA_ID_REQUIRED");
  }

  return ticketId;
}

export function getIncidenciaEndpoint(id = "") {
  const ticketId = normalizeIncidenciaId(id);
  return `${INCIDENCIAS_ENDPOINT}/${encodeUrlPathSegment(ticketId)}`;
}

export function getIncidenciaAltEndpoint(id = "") {
  const ticketId = normalizeIncidenciaId(id);
  return `${INCIDENCIAS_ALT_ENDPOINT}/${encodeUrlPathSegment(ticketId)}`;
}

export function getIncidenciaAttachmentsEndpoint(id = "") {
  const ticketId = normalizeIncidenciaId(id);
  return `${INCIDENCIAS_ENDPOINT}/${encodeUrlPathSegment(ticketId)}/attachments`;
}

export function getIncidenciaFilesEndpoint(id = "") {
  const ticketId = normalizeIncidenciaId(id);
  return `${INCIDENCIAS_ENDPOINT}/${encodeUrlPathSegment(ticketId)}/files`;
}

export function getIncidenciaCommentsEndpoint(id = "") {
  const ticketId = normalizeIncidenciaId(id);
  return `${INCIDENCIAS_ENDPOINT}/${encodeUrlPathSegment(ticketId)}/comments`;
}

export function getIncidenciaMessagesEndpoint(id = "") {
  const ticketId = normalizeIncidenciaId(id);
  return `${INCIDENCIAS_ENDPOINT}/${encodeUrlPathSegment(ticketId)}/messages`;
}

export function getIncidenciaReopenEndpoint(id = "") {
  const ticketId = normalizeIncidenciaId(id);
  return `${INCIDENCIAS_ENDPOINT}/${encodeUrlPathSegment(ticketId)}/reopen`;
}

export function getIncidenciaAttachmentFileEndpoint({
  ticketId = "",
  attachmentId = "",
  mode = "view",
  kind = "attachments",
} = {}) {
  const id = normalizeIncidenciaId(ticketId);
  const attId = safeText(attachmentId, "");

  if (!attId) {
    throw new Error("ATTACHMENT_ID_REQUIRED");
  }

  const safeMode = mode === "download" ? "download" : "view";
  const safeKind = kind === "files" ? "files" : "attachments";

  return `${INCIDENCIAS_ENDPOINT}/${encodeUrlPathSegment(id)}/${safeKind}/${encodeUrlPathSegment(attId)}/${safeMode}`;
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

function normalizeAttachment(item = {}, index = 0) {
  const raw = safeObject(item);

  const name = safeText(
    first(
      raw.name,
      raw.filename,
      raw.fileName,
      raw.originalname,
      raw.title
    ),
    `archivo_${index + 1}`
  );

  const path = safeText(
    first(
      raw.path,
      raw.storageKey,
      raw.storagePath,
      raw.blobPath,
      raw.blobName,
      raw.key
    ),
    ""
  );

  const id = safeText(
    first(
      raw.id,
      raw.fileId,
      raw.attachmentId,
      raw.storageKey,
      raw.path,
      raw.blobName,
      raw.key
    ),
    path || `attachment-${index + 1}`
  );

  const viewUrl = safeText(
    first(
      raw.viewUrl,
      raw.openUrl,
      raw.signedUrl,
      raw.url,
      raw.blobUrl,
      raw.publicUrl,
      raw.href
    ),
    ""
  );

  const downloadUrl = safeText(
    first(
      raw.downloadUrl,
      raw.signedUrl,
      raw.url,
      raw.blobUrl,
      raw.publicUrl,
      raw.href
    ),
    ""
  );

  const contentType = safeText(
    first(
      raw.contentType,
      raw.mimetype,
      raw.mimeType,
      raw.mime,
      raw.type
    ),
    ""
  );

  return {
    ...raw,

    id,
    attachmentId: id,

    name,
    filename: safeText(
      first(
        raw.filename,
        raw.fileName,
        raw.name,
        raw.originalname
      ),
      name
    ),

    url: safeText(
      first(
        raw.url,
        viewUrl,
        downloadUrl,
        raw.signedUrl,
        raw.blobUrl,
        raw.publicUrl
      ),
      ""
    ),

    viewUrl,
    openUrl: safeText(first(raw.openUrl, viewUrl), viewUrl),
    downloadUrl,
    signedUrl: safeText(raw.signedUrl, ""),
    blobUrl: safeText(raw.blobUrl, ""),
    publicUrl: safeText(raw.publicUrl, ""),

    path,
    storageKey: safeText(first(raw.storageKey, path), path),
    storagePath: safeText(first(raw.storagePath, path), path),
    blobPath: safeText(first(raw.blobPath, path), path),
    blobName: safeText(first(raw.blobName, path), path),

    size: safeNumber(raw.size, 0),
    type: safeText(first(raw.type, contentType), contentType),
    contentType,
    mimetype: safeText(first(raw.mimetype, contentType), contentType),
    mimeType: safeText(first(raw.mimeType, contentType), contentType),

    uploadedAt: first(
      raw.uploadedAt,
      raw.createdAt,
      raw.date,
      null
    ),

    raw,
  };
}

export function normalizeIncidencia(item = {}) {
  const raw = safeObject(item);

  const cliente = safeObject(
    first(
      raw.cliente,
      raw.client,
      raw.customer
    )
  );

  const tecnico = safeObject(
    first(
      raw.tecnico,
      raw.assignedTo,
      raw.assignee
    )
  );

  const createdBy = safeObject(raw.createdBy);
  const receptor = safeObject(raw.receptor);

  const attachments = safeArray(
    first(
      raw.attachments,
      raw.files,
      raw.adjuntos
    )
  ).map(normalizeAttachment);

  const history = safeArray(
    first(
      raw.history,
      raw.timeline,
      raw.logs
    )
  );

  const comments = safeArray(
    first(
      raw.comments,
      raw.notes,
      raw.messages
    )
  );

  const ticketId = safeText(
    first(
      raw.ticketId,
      raw.id,
      raw._id,
      raw.code,
      raw.ticketCode
    ),
    ""
  );

  const id = safeText(
    first(
      raw.id,
      raw.ticketId,
      raw._id,
      ticketId
    ),
    ticketId
  );

  const status = normalizeStatus(
    first(
      raw.status,
      raw.estado
    )
  );

  const priority = normalizePriority(
    first(
      raw.priority,
      raw.prioridad
    )
  );

  const categoria = normalizeCategory(
    first(
      raw.categoria,
      raw.category,
      raw.tipo
    )
  );

  const title = safeText(
    first(
      raw.title,
      raw.subject,
      raw.asunto
    ),
    ""
  );

  const message = safeText(
    first(
      raw.message,
      raw.descripcion,
      raw.description,
      raw.body,
      raw.preview
    ),
    ""
  );

  const clientName = safeText(
    first(
      raw.clientName,
      raw.name,
      cliente?.nombre,
      cliente?.name,
      receptor?.name,
      createdBy?.name
    ),
    ""
  );

  const clientEmail = safeText(
    first(
      raw.clientEmail,
      raw.email,
      cliente?.email,
      receptor?.email,
      createdBy?.email
    ),
    ""
  );

  return {
    ...raw,

    id,
    ticketId,

    code: safeText(
      first(
        raw.code,
        raw.ticketCode,
        raw.codigo,
        ticketId,
        id
      ),
      ""
    ),

    ticketCode: safeText(
      first(
        raw.ticketCode,
        raw.code,
        ticketId,
        id
      ),
      ""
    ),

    title,
    subject: safeText(
      first(
        raw.subject,
        raw.asunto,
        title
      ),
      title
    ),
    asunto: safeText(
      first(
        raw.asunto,
        raw.subject,
        title
      ),
      title
    ),

    description: message,
    descripcion: safeText(
      first(
        raw.descripcion,
        raw.message,
        raw.description,
        message
      ),
      message
    ),
    message,
    preview: safeText(
      first(
        raw.preview,
        message
      ),
      message
    ),

    status,
    estado: status,

    priority,
    prioridad: priority,

    category: categoria,
    categoria,
    tipo: safeText(
      first(
        raw.tipo,
        categoria
      ),
      categoria
    ),

    source: safeText(
      first(
        raw.source,
        raw.origen,
        raw.channel
      ),
      "panel"
    ),

    createdAt: first(
      raw.createdAt,
      raw.fechaCreacion,
      raw.created_at,
      null
    ),
    createdAtES: first(
      raw.createdAtES,
      null
    ),

    updatedAt: first(
      raw.updatedAt,
      raw.fechaActualizacion,
      raw.updated_at,
      raw.modifiedAt,
      raw.lastUpdate,
      raw.closedAt,
      raw.createdAt,
      null
    ),

    closedAt: first(
      raw.closedAt,
      raw.closed_at,
      null
    ),

    closedAtES: first(
      raw.closedAtES,
      null
    ),

    assignedTo: first(
      raw.assignedTo,
      raw.assignee,
      raw.asignadoA,
      tecnico,
      null
    ),

    assignedToName: safeText(
      first(
        tecnico?.name,
        tecnico?.nombre,
        raw.assignedToName,
        typeof raw.assignedTo === "string" ? raw.assignedTo : null,
        typeof raw.assignee === "string" ? raw.assignee : null
      ),
      ""
    ),

    requester: first(
      raw.requester,
      raw.user,
      raw.usuario,
      cliente,
      createdBy,
      receptor,
      null
    ),

    clientName,
    clientEmail,

    clientAvatar: safeText(
      first(
        raw.clientAvatar,
        raw.avatar,
        raw.avatarUrl,
        cliente?.avatar,
        cliente?.avatarUrl
      ),
      ""
    ),

    cliente,
    tecnico,
    createdBy,
    receptor,

    attachments,
    attachmentsCount: safeNumber(
      first(
        raw.attachmentsCount,
        attachments.length
      ),
      attachments.length
    ),

    history,
    historyCount: safeNumber(
      first(
        raw.historyCount,
        history.length
      ),
      history.length
    ),

    comments,
    commentsCount: safeNumber(
      first(
        raw.commentsCount,
        comments.length
      ),
      comments.length
    ),

    email: safeText(first(raw.email, clientEmail), clientEmail),
    name: safeText(first(raw.name, clientName), clientName),

    userId: safeText(first(raw.userId, raw.clienteId), ""),
    clienteId: safeText(first(raw.clienteId, raw.userId), ""),

    fechaProgramada: first(raw.fechaProgramada, null),
    ip: safeText(raw.ip, ""),

    raw,
  };
}

function looksLikeTicket(value = null) {
  const obj = safeObject(value);

  return Boolean(
    obj.ticketId ||
      obj.id ||
      obj._id ||
      obj.code ||
      obj.ticketCode ||
      obj.title ||
      obj.subject ||
      obj.asunto ||
      obj.message ||
      obj.descripcion
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
  if (Array.isArray(obj.tickets)) return obj.tickets;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.results)) return obj.results;
  if (Array.isArray(obj.rows)) return obj.rows;

  if (obj.ticket) return obj.ticket;
  if (obj.item) return obj.item;
  if (obj.result) return obj.result;
  if (obj.incidencia) return obj.incidencia;
  if (obj.detail) return obj.detail;

  if (obj.payload) {
    return unwrapResponseEnvelope(obj.payload);
  }

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

  if (Array.isArray(obj?.data?.items)) return obj.data.items;
  if (Array.isArray(obj?.data?.tickets)) return obj.data.tickets;
  if (Array.isArray(obj?.payload?.items)) return obj.payload.items;
  if (Array.isArray(obj?.payload?.tickets)) return obj.payload.tickets;

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

function pickDetail(payload = null) {
  if (!payload) {
    return null;
  }

  if (Array.isArray(payload)) {
    return payload[0] || null;
  }

  if (looksLikeTicket(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (looksLikeTicket(obj.ticket)) return obj.ticket;
  if (looksLikeTicket(obj.item)) return obj.item;
  if (looksLikeTicket(obj.result)) return obj.result;
  if (looksLikeTicket(obj.payload)) return obj.payload;
  if (looksLikeTicket(obj.data)) return obj.data;
  if (looksLikeTicket(obj.incidencia)) return obj.incidencia;
  if (looksLikeTicket(obj.detail)) return obj.detail;

  if (obj.data && typeof obj.data === "object") {
    return pickDetail(obj.data);
  }

  if (obj.payload && typeof obj.payload === "object") {
    return pickDetail(obj.payload);
  }

  return Object.keys(obj).length ? obj : null;
}

function pickCreatedTicket(payload = null) {
  return pickDetail(payload);
}

function pickFile(payload = null) {
  const obj = safeObject(payload);

  return safeObject(
    first(
      obj.file,
      obj.attachment,
      obj.data?.file,
      obj.data?.attachment,
      obj.payload?.file,
      obj.payload?.attachment,
      obj.result?.file,
      obj.result?.attachment,
      obj
    )
  );
}

function normalizeIncidenciasListResponse(response = null) {
  const rawItems = safeArray(pickItems(response));
  const items = rawItems.map(normalizeIncidencia);
  const total = pickTotal(response, items.length);

  return {
    ok: true,
    items,
    total,
    raw: response,
  };
}

function normalizeIncidenciaDetailResponse(response = null) {
  const detail = pickDetail(response);

  return {
    ok: true,
    item: detail ? normalizeIncidencia(detail) : null,
    raw: response,
  };
}

function normalizeIncidenciaFileResponse(response = null, fallback = {}) {
  const file = pickFile(response);
  const source = {
    ...safeObject(fallback),
    ...file,
  };

  const url = safeText(
    first(
      source.url,
      source.viewUrl,
      source.openUrl,
      source.downloadUrl,
      source.signedUrl,
      source.blobUrl,
      source.publicUrl,
      source.href
    ),
    ""
  );

  return {
    ...source,
    url,
    viewUrl: safeText(first(source.viewUrl, source.openUrl, url), url),
    openUrl: safeText(first(source.openUrl, source.viewUrl, url), url),
    downloadUrl: safeText(first(source.downloadUrl, url), url),
    signedUrl: safeText(first(source.signedUrl, url), url),
    filename: safeText(
      first(
        source.filename,
        source.fileName,
        source.name
      ),
      "archivo"
    ),
    name: safeText(
      first(
        source.name,
        source.filename,
        source.fileName
      ),
      "archivo"
    ),
    contentType: safeText(
      first(
        source.contentType,
        source.mimetype,
        source.mimeType,
        source.mime
      ),
      ""
    ),
    raw: response,
  };
}

/* =========================================================
   REQUEST ADAPTERS
========================================================= */

async function requestViaApiClient(method = "GET", path = "", options = {}) {
  const client = getApiClient();

  if (!client) {
    throw new Error("INCIDENCIAS_API_CLIENT_UNAVAILABLE");
  }

  const verb = safeText(method, "GET").toLowerCase();
  const timeout = safeNumber(options.timeout, INCIDENCIAS_TIMEOUT);

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

  throw new Error("INCIDENCIAS_API_CLIENT_METHOD_UNAVAILABLE");
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

  const timeout = safeNumber(options.timeout, INCIDENCIAS_TIMEOUT);

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
    timeout: safeNumber(options.timeout, INCIDENCIAS_TIMEOUT),
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

  throw lastError || new Error("INCIDENCIAS_REQUEST_FAILED");
}

async function requestFirst(method = "GET", paths = [], options = {}) {
  const candidates = safeArray(paths).map((path) => safeText(path, "")).filter(Boolean);

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

  throw lastError || new Error("INCIDENCIAS_REQUEST_CANDIDATES_FAILED");
}

/* =========================================================
   RAW REQUESTS - LIST / DETAIL / CREATE
========================================================= */

export async function fetchIncidenciasRequest({
  timeout = INCIDENCIAS_TIMEOUT,
  query = {},
} = {}) {
  return request("GET", INCIDENCIAS_ENDPOINT, {
    timeout,
    query,
  });
}

export async function getIncidenciaByIdRequest(
  id = "",
  {
    timeout = INCIDENCIAS_TIMEOUT,
  } = {}
) {
  const ticketId = normalizeIncidenciaId(id);

  const response = await requestFirst(
    "GET",
    [
      getIncidenciaEndpoint(ticketId),
      getIncidenciaAltEndpoint(ticketId),
    ],
    {
      timeout,
    }
  );

  return normalizeIncidenciaDetailResponse(response).item;
}

export async function createIncidenciaRequest(
  payload = {},
  {
    timeout = INCIDENCIAS_TIMEOUT,
  } = {}
) {
  const response = await request("POST", INCIDENCIAS_ENDPOINT, {
    timeout,
    body: safeObject(payload),
  });

  const created = pickCreatedTicket(response);

  return created
    ? normalizeIncidencia(created)
    : response;
}

/* =========================================================
   RAW REQUESTS - UPDATE / COMMENT / REOPEN
========================================================= */

export async function updateIncidenciaRequest(
  id = "",
  payload = {},
  {
    timeout = INCIDENCIAS_TIMEOUT,
  } = {}
) {
  const ticketId = normalizeIncidenciaId(id);

  const response = await requestFirst(
    "PATCH",
    [
      getIncidenciaEndpoint(ticketId),
      getIncidenciaAltEndpoint(ticketId),
    ],
    {
      timeout,
      body: safeObject(payload),
    }
  );

  const detail = pickDetail(response);

  return detail
    ? normalizeIncidencia(detail)
    : response;
}

export async function commentIncidenciaRequest(
  id = "",
  message = "",
  {
    timeout = INCIDENCIAS_TIMEOUT,
    status = "open",
  } = {}
) {
  const ticketId = normalizeIncidenciaId(id);
  const text = safeText(message, "").replace(/\s+/g, " ").trim();

  if (!text) {
    throw new Error("INCIDENCIA_COMMENT_REQUIRED");
  }

  const finalStatus = normalizeStatus(status || "open");

  const payload = {
    message: text,
    comment: text,
    body: text,
    text,
    status: finalStatus,
    estado: finalStatus,
  };

  const response = await requestFirst(
    "POST",
    [
      getIncidenciaCommentsEndpoint(ticketId),
      getIncidenciaMessagesEndpoint(ticketId),
      `${getIncidenciaAltEndpoint(ticketId)}/comments`,
      `${getIncidenciaAltEndpoint(ticketId)}/messages`,
    ],
    {
      timeout,
      body: payload,
    }
  );

  const detail = pickDetail(response);

  return detail
    ? normalizeIncidencia(detail)
    : response;
}

export async function reopenIncidenciaRequest(
  id = "",
  {
    timeout = INCIDENCIAS_TIMEOUT,
  } = {}
) {
  const ticketId = normalizeIncidenciaId(id);

  const payload = {
    status: "open",
    estado: "open",
  };

  const response = await requestFirst(
    "POST",
    [
      getIncidenciaReopenEndpoint(ticketId),
      `${getIncidenciaAltEndpoint(ticketId)}/reopen`,
    ],
    {
      timeout,
      body: payload,
    }
  );

  const detail = pickDetail(response);

  return detail
    ? normalizeIncidencia(detail)
    : response;
}

/* =========================================================
   RAW REQUESTS - ATTACHMENTS
========================================================= */

function buildAttachmentsFormData(files = []) {
  const formData = new FormData();

  safeArray(files).forEach((file) => {
    if (typeof File !== "undefined" && file instanceof File) {
      formData.append("attachments", file, file.name);
    }
  });

  return formData;
}

export async function uploadIncidenciaAttachmentsRequest(
  id = "",
  files = [],
  {
    timeout = INCIDENCIAS_UPLOAD_TIMEOUT,
  } = {}
) {
  const ticketId = normalizeIncidenciaId(id);
  const list = safeArray(files).filter((file) => {
    return typeof File !== "undefined" && file instanceof File;
  });

  if (!list.length) {
    throw new Error("INCIDENCIA_ATTACHMENTS_REQUIRED");
  }

  const response = await requestFirst(
    "POST",
    [
      getIncidenciaAttachmentsEndpoint(ticketId),
      getIncidenciaFilesEndpoint(ticketId),
      `${getIncidenciaAltEndpoint(ticketId)}/attachments`,
      `${getIncidenciaAltEndpoint(ticketId)}/files`,
    ],
    {
      timeout,
      body: buildAttachmentsFormData(list),
      headers: {},
    }
  );

  const detail = pickDetail(response);

  return detail
    ? normalizeIncidencia(detail)
    : response;
}

export async function getIncidenciaAttachmentFileRequest(
  {
    ticketId = "",
    attachmentId = "",
    mode = "view",
    kind = "attachments",
  } = {},
  {
    timeout = INCIDENCIAS_TIMEOUT,
  } = {}
) {
  const id = normalizeIncidenciaId(ticketId);
  const attId = safeText(attachmentId, "");

  if (!attId) {
    throw new Error("ATTACHMENT_ID_REQUIRED");
  }

  const safeMode = mode === "download" ? "download" : "view";

  const response = await requestFirst(
    "GET",
    [
      getIncidenciaAttachmentFileEndpoint({
        ticketId: id,
        attachmentId: attId,
        mode: safeMode,
        kind,
      }),
      getIncidenciaAttachmentFileEndpoint({
        ticketId: id,
        attachmentId: attId,
        mode: safeMode,
        kind: kind === "files" ? "attachments" : "files",
      }),
      `${getIncidenciaAltEndpoint(id)}/${kind === "files" ? "files" : "attachments"}/${encodeUrlPathSegment(attId)}/${safeMode}`,
      `${getIncidenciaAltEndpoint(id)}/${kind === "files" ? "attachments" : "files"}/${encodeUrlPathSegment(attId)}/${safeMode}`,
    ],
    {
      timeout,
    }
  );

  return normalizeIncidenciaFileResponse(response);
}

/* =========================================================
   CACHE HYDRATE
========================================================= */

export function hydrateFromCache() {
  try {
    const current = safeArray(incidenciasState?.items);

    if (current.length) {
      replaceIncidenciasStore(current);
    }

    return current;
  } catch {
    return [];
  }
}

/* =========================================================
   STATE HYDRATION
========================================================= */

function applyLoadedListToState(normalized = { items: [], total: 0 }) {
  const items = safeArray(normalized?.items);
  const total = safeNumber(normalized?.total, items.length);

  replaceIncidenciasStore(items);
  setItems(items);
  setRemoteCount(total);
  setLastSyncAt(Date.now());
  setLoaded(true);
  setError(null);

  return items;
}

function upsertLoadedDetail(detail = null) {
  if (!detail) return null;

  try {
    upsertIncidenciaStore?.(detail);
  } catch {}

  return detail;
}

/* =========================================================
   LOAD LIST
========================================================= */

export async function loadIncidencias({
  force = false,
  query = {},
} = {}) {
  const loadToken = nextLoadToken();

  const firstLoad = !Boolean(incidenciasState?.hydrated);
  const shouldShowLoading = firstLoad && !force;

  try {
    setError(null);

    if (shouldShowLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    const response = await fetchIncidenciasRequest({
      timeout: INCIDENCIAS_TIMEOUT,
      query,
    });

    const normalized = normalizeIncidenciasListResponse(response);

    if (!isActiveLoadToken(loadToken)) {
      return safeArray(incidenciasState?.items);
    }

    return applyLoadedListToState(normalized);
  } catch (error) {
    const message = normalizeErrorMessage(
      error,
      "No se pudieron cargar las incidencias."
    );

    if (!isActiveLoadToken(loadToken)) {
      return safeArray(incidenciasState?.items);
    }

    console.error("❌ INCIDENCIAS LOAD:", error);

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
   LOAD DETAIL / MUTATIONS
========================================================= */

export async function loadIncidenciaDetail(ticketId = "") {
  try {
    const detail = await getIncidenciaByIdRequest(ticketId);

    return upsertLoadedDetail(detail);
  } catch (error) {
    console.error("❌ INCIDENCIA DETAIL:", error);
    throw error;
  }
}

export async function createIncidencia(payload = {}) {
  try {
    const created = await createIncidenciaRequest(payload);

    return upsertLoadedDetail(created);
  } catch (error) {
    console.error("❌ INCIDENCIA CREATE:", error);
    throw error;
  }
}

export async function updateIncidencia(ticketId = "", payload = {}) {
  try {
    const updated = await updateIncidenciaRequest(ticketId, payload);

    return upsertLoadedDetail(updated);
  } catch (error) {
    console.error("❌ INCIDENCIA UPDATE:", error);
    throw error;
  }
}

export async function commentIncidencia(ticketId = "", message = "", options = {}) {
  try {
    const updated = await commentIncidenciaRequest(ticketId, message, options);

    return upsertLoadedDetail(updated);
  } catch (error) {
    console.error("❌ INCIDENCIA COMMENT:", error);
    throw error;
  }
}

export async function reopenIncidencia(ticketId = "") {
  try {
    const updated = await reopenIncidenciaRequest(ticketId);

    return upsertLoadedDetail(updated);
  } catch (error) {
    console.error("❌ INCIDENCIA REOPEN:", error);
    throw error;
  }
}

export async function uploadIncidenciaAttachments(ticketId = "", files = []) {
  try {
    const updated = await uploadIncidenciaAttachmentsRequest(ticketId, files);

    return upsertLoadedDetail(updated);
  } catch (error) {
    console.error("❌ INCIDENCIA ATTACHMENTS UPLOAD:", error);
    throw error;
  }
}

/* =========================================================
   PUBLIC API
========================================================= */

export const IncidenciasApi = Object.freeze({
  resource: INCIDENCIAS_RESOURCE,
  endpoint: INCIDENCIAS_ENDPOINT,
  altEndpoint: INCIDENCIAS_ALT_ENDPOINT,
  timeout: INCIDENCIAS_TIMEOUT,
  uploadTimeout: INCIDENCIAS_UPLOAD_TIMEOUT,

  normalizeIncidenciaId,
  getIncidenciaEndpoint,
  getIncidenciaAltEndpoint,
  getIncidenciaAttachmentsEndpoint,
  getIncidenciaFilesEndpoint,
  getIncidenciaCommentsEndpoint,
  getIncidenciaMessagesEndpoint,
  getIncidenciaReopenEndpoint,
  getIncidenciaAttachmentFileEndpoint,

  normalizeIncidencia,

  fetchIncidenciasRequest,
  getIncidenciaByIdRequest,
  createIncidenciaRequest,
  updateIncidenciaRequest,
  commentIncidenciaRequest,
  reopenIncidenciaRequest,
  uploadIncidenciaAttachmentsRequest,
  getIncidenciaAttachmentFileRequest,

  hydrateFromCache,
  loadIncidencias,
  loadIncidenciaDetail,
  createIncidencia,
  updateIncidencia,
  commentIncidencia,
  reopenIncidencia,
  uploadIncidenciaAttachments,
});

export default IncidenciasApi;
