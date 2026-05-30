/* =========================================================
   Onion Support - Incidencias API
   Archivo: /src/views/incidencias/incidencias.api.js

   Responsabilidad:
   - Centralizar llamadas HTTP de Incidencias.
   - Adaptar backend /api/tickets al frontend.
   - Normalizar DTOs ligeros para la vista.
   - Crear incidencias con/sin adjuntos.
   - Cargar detalle, comentar, reabrir y subir adjuntos.
   - Abrir/descargar adjuntos mediante endpoint backend.
   - Sin DOM.
   - Sin Router.
   - Sin Auth directo.
   - Sin Store.
   - Sin State externo.
   - Sin Model externo.
   - Sin fetch propio.
========================================================= */

import Http from "../../core/http.js";

export const INCIDENCIAS_API_VERSION = "incidencias.api.minimal.v1";

export const INCIDENCIAS_ENDPOINT = "/api/tickets";

export const INCIDENCIAS_TIMEOUT = 15000;
export const INCIDENCIAS_DETAIL_TIMEOUT = 25000;
export const INCIDENCIAS_UPLOAD_TIMEOUT = 90000;

export const INCIDENCIAS_LIST_LIMIT = 48;

let loading = false;
let lastLoadedAt = null;
let lastError = null;
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

function isFormData(value) {
  return typeof FormData !== "undefined" && value instanceof FormData;
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
  for (const value of values) {
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
  if (/[?&#](?:token|access_token|refresh_token|password|secret|sig|signature)=/i.test(raw)) {
    return "";
  }

  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

function encodeSegment(value = "") {
  const clean = cleanText(value, "");

  if (!clean) {
    throw new Error("INCIDENCIA_ID_REQUIRED");
  }

  return encodeURIComponent(clean);
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
    Array.isArray(object.incidencias)
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

  return {
    id: cleanText(first(raw.id, raw.userId, raw.uid, raw.sub, raw.username, raw.slug), ""),
    userId: cleanText(first(raw.userId, raw.id, raw.uid, raw.sub), ""),
    username: cleanText(first(raw.username, raw.userName, raw.slug), ""),
    displayName: cleanText(
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
    ),
    name: cleanText(
      first(
        raw.name,
        raw.nombre,
        raw.displayName,
        raw.fullName,
        raw.profile?.name,
        raw.profile?.displayName
      ),
      ""
    ),
    role: cleanText(first(raw.role, raw.rol, Array.isArray(raw.roles) ? raw.roles[0] : ""), ""),
    avatarUrl: safeUrl(
      first(
        raw.avatarUrl,
        raw.avatar,
        raw.picture,
        raw.photoUrl,
        raw.profile?.avatarUrl,
        raw.profile?.avatar
      )
    ),
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

  const url = safeUrl(
    first(
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
    )
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
    viewUrl: safeUrl(first(raw.viewUrl, raw.openUrl, raw.signedUrl, raw.url, url)),
    openUrl: safeUrl(first(raw.openUrl, raw.viewUrl, raw.signedUrl, raw.url, url)),
    downloadUrl: safeUrl(first(raw.downloadUrl, raw.signedUrl, raw.url, url)),
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
    "Usuario"
  );

  const assignedTo = normalizePerson(
    first(
      raw.assignedTo,
      raw.tecnico,
      raw.technician,
      raw.assignedTechnician,
      raw.assignedUser,
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
      raw.assignment?.assignedToName,
      raw.assignment?.technicianName,
      assignedTo.displayName,
      assignedTo.name
    ),
    "Sin asignar"
  );

  const attachments = safeArray(first(raw.attachments, raw.files, raw.adjuntos, [])).map(normalizeAttachment);

  const invoices = safeArray(first(raw.invoices, raw.facturas, raw.linkedInvoices?.items, []));

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
      raw.linkedInvoices?.total,
      raw.linkedInvoices?.amount,
      raw.meta?.invoicesTotal,
      0
    ),
    0
  );

  return {
    id: ticketId,
    ticketId,
    incidenciaId: ticketId,
    entityId: ticketId,

    subject,
    asunto: subject,
    title: subject,

    description,
    descripcion: description,
    message: description,
    preview: description,

    status,
    estado: status,
    priority,
    prioridad: priority,
    category,
    categoria: category,

    userId: cleanText(first(raw.userId, raw.usuarioId, raw.requesterUserId, raw.userRef?.userId), ""),
    usuarioId: cleanText(first(raw.usuarioId, raw.userId, raw.requesterUserId, raw.userRef?.userId), ""),
    clienteId: cleanText(first(raw.clienteId, raw.clientId, raw.customerId, raw.clienteRef?.clienteId), ""),
    clientId: cleanText(first(raw.clientId, raw.clienteId, raw.customerId, raw.clienteRef?.clienteId), ""),

    requesterName,
    clientName: safePublicText(first(raw.clientName, raw.clienteName, requesterName), requesterName),
    userName: safePublicText(first(raw.userName, raw.usuarioName, requesterName), requesterName),

    avatarUrl: safeUrl(first(raw.avatarUrl, raw.requesterAvatarUrl, raw.userAvatarUrl, raw.photoUrl)),
    requesterAvatarUrl: safeUrl(first(raw.requesterAvatarUrl, raw.avatarUrl, raw.userAvatarUrl)),
    userAvatarUrl: safeUrl(first(raw.userAvatarUrl, raw.avatarUrl, raw.requesterAvatarUrl)),

    assignedTo,
    tecnico: assignedTo,
    technician: assignedTo,
    assignedToName,
    technicianName: assignedToName,
    tecnicoName: assignedToName,
    assignedToAvatarUrl: safeUrl(first(raw.assignedToAvatarUrl, raw.technicianAvatarUrl, raw.tecnicoAvatarUrl, raw.assignment?.assignedToAvatarUrl)),
    technicianAvatarUrl: safeUrl(first(raw.technicianAvatarUrl, raw.tecnicoAvatarUrl, raw.assignedToAvatarUrl, raw.assignment?.technicianAvatarUrl)),
    tecnicoAvatarUrl: safeUrl(first(raw.tecnicoAvatarUrl, raw.technicianAvatarUrl, raw.assignedToAvatarUrl)),

    assignment: safeObject(raw.assignment, null),

    invoiceId: cleanText(first(raw.invoiceId, raw.facturaId), ""),
    facturaId: cleanText(first(raw.facturaId, raw.invoiceId), ""),
    invoiceIds: safeArray(raw.invoiceIds),
    facturaIds: safeArray(raw.facturaIds),
    invoices,
    facturas: invoices,
    invoiceTotal,
    invoicesTotal: invoiceTotal,
    facturasTotal: invoiceTotal,
    paymentStatus: cleanText(first(raw.paymentStatus, raw.estadoPago, raw.linkedInvoices?.paymentStatus), ""),

    attachments,
    files: attachments,
    adjuntos: attachments,
    attachmentsCount: attachments.length,
    filesCount: attachments.length,

    comments: safeArray(first(raw.comments, raw.notes, raw.messages, [])),
    history: safeArray(first(raw.history, raw.events, [])),
    timeline: normalizeTimeline(raw),

    createdAt: first(raw.createdAt, raw.fechaCreacion, raw.created_at, raw.lifecycle?.createdAt, null),
    updatedAt: first(raw.updatedAt, raw.updated_at, raw.modifiedAt, raw.lastActivityAt, raw.lifecycle?.updatedAt, null),
    lastActivityAt: first(raw.lastActivityAt, raw.updatedAt, raw.lifecycle?.lastActivityAt, null),
    closedAt: first(raw.closedAt, raw.lifecycle?.closedAt, null),
  };
}

function normalizeList(items = []) {
  const map = new Map();

  for (const item of safeArray(items)) {
    const normalized = normalizeIncidencia(item);
    const id = cleanText(first(normalized.ticketId, normalized.id), "");

    if (!id) continue;
    if (!map.has(id)) map.set(id, normalized);
  }

  return [...map.values()].sort((a, b) => {
    const left = Date.parse(a.lastActivityAt || a.updatedAt || a.createdAt || 0);
    const right = Date.parse(b.lastActivityAt || b.updatedAt || b.createdAt || 0);

    return right - left;
  });
}

function normalizeFileResponse(response = null, fallback = {}) {
  const file = fileFromPayload(response);
  const source = {
    ...safeObject(fallback),
    ...file,
  };

  const url = safeUrl(
    first(
      source.url,
      source.viewUrl,
      source.openUrl,
      source.downloadUrl,
      source.signedUrl,
      source.blobUrl,
      source.publicUrl,
      source.href
    )
  );

  return {
    ...source,
    url,
    viewUrl: safeUrl(first(source.viewUrl, source.openUrl, url)),
    openUrl: safeUrl(first(source.openUrl, source.viewUrl, url)),
    downloadUrl: safeUrl(first(source.downloadUrl, url)),
    signedUrl: safeUrl(first(source.signedUrl, url)),
    filename: cleanText(first(source.filename, source.fileName, source.name), "archivo"),
    fileName: cleanText(first(source.fileName, source.filename, source.name), "archivo"),
    name: cleanText(first(source.name, source.filename, source.fileName), "archivo"),
    contentType: cleanText(first(source.contentType, source.mimetype, source.mimeType, source.mime), ""),
  };
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

  const targetUserId = cleanText(first(source.targetUserId, source.userId, source.usuarioId, source.clienteId), "");
  const targetUserName = cleanText(first(source.targetUserName, source.userName, source.clienteNombre, source.clientName), "");
  const targetUserAvatar = safeUrl(first(source.targetUserAvatar, source.userAvatar, source.clienteAvatar, source.avatar, source.avatarUrl));

  return {
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

    source: origin,
    origen: origin,
    channel: origin,

    ...(targetUserId
      ? {
          userId: targetUserId,
          usuarioId: targetUserId,
          clienteId: targetUserId,
          targetUserId,
          targetUserName,
          clienteNombre: targetUserName,
          clientName: targetUserName,
          targetUserAvatar,
          clienteAvatar: targetUserAvatar,
          avatar: targetUserAvatar,
          avatarUrl: targetUserAvatar,
        }
      : {}),
  };
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

export async function fetchIncidenciasRequest({
  query = {},
  params = {},
  timeout = INCIDENCIAS_TIMEOUT,
} = {}) {
  return getJson(INCIDENCIAS_ENDPOINT, {
    timeout,
    query: {
      limit: INCIDENCIAS_LIST_LIMIT,
      includeTotal: true,
      sortBy: "updatedAt",
      sortDir: "DESC",
      ...safeObject(params),
      ...safeObject(query),
    },
  });
}

export async function listIncidencias(options = {}) {
  loading = true;
  lastError = null;

  try {
    const response = await fetchIncidenciasRequest(options);
    const rawItems = listFromPayload(response);
    const items = normalizeList(rawItems);
    const total = totalFromPayload(response, items.length);

    lastList = {
      items,
      total,
    };

    lastLoadedAt = nowIso();

    return {
      ok: true,
      items,
      total,
      count: items.length,
      loadedAt: lastLoadedAt,
    };
  } catch (error) {
    lastError = normalizeError(error);

    if (options.returnStaleOnError !== false && lastList.items.length) {
      return {
        ok: false,
        stale: true,
        items: lastList.items,
        total: lastList.total,
        count: lastList.items.length,
        error: lastError,
      };
    }

    throw error;
  } finally {
    loading = false;
  }
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

  return detail ? normalizeIncidencia(detail) : null;
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
    lastList = {
      ...lastList,
      items: normalizeList([created, ...safeArray(lastList.items)]),
      total: Math.max(number(lastList.total, 0), safeArray(lastList.items).length + 1),
    };
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
  return updated || getIncidenciaByIdRequest(id);
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
  return updated || getIncidenciaByIdRequest(id);
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
  return updated || getIncidenciaByIdRequest(id);
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
  return updated || getIncidenciaByIdRequest(id);
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
    hydrated: safeArray(lastList.items).length > 0,
  };
}

export function clearIncidenciasCache() {
  lastList = {
    items: [],
    total: 0,
  };

  lastLoadedAt = null;
  lastError = null;

  return true;
}

export function getIncidenciasApiSnapshot() {
  return {
    version: INCIDENCIAS_API_VERSION,

    endpoint: INCIDENCIAS_ENDPOINT,

    loading,
    lastLoadedAt,
    lastError,

    cache: {
      items: lastList.items.length,
      total: lastList.total,
      hydrated: lastList.items.length > 0,
    },

    policy: {
      apiOnly: true,
      singleHttpLayer: true,
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

  timeout: INCIDENCIAS_TIMEOUT,
  detailTimeout: INCIDENCIAS_DETAIL_TIMEOUT,
  uploadTimeout: INCIDENCIAS_UPLOAD_TIMEOUT,

  normalizeIncidenciaId,

  getIncidenciaEndpoint,
  getIncidenciaCommentsEndpoint,
  getIncidenciaReopenEndpoint,
  getIncidenciaAttachmentsEndpoint,
  getIncidenciaAttachmentFileEndpoint,

  normalizeIncidencia,
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
  clearIncidenciasCache,

  getIncidenciasApiSnapshot,
  getSnapshot: getIncidenciasApiSnapshot,
});

export default IncidenciasApi;
