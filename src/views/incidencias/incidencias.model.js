/* =========================================================
   Onion SPA - Incidencias Model
   Archivo: src/views/incidencias/incidencias.model.js

   FULL PRO 10/10

   RESPONSABILIDADES:
   - normalizar payloads heterogéneos backend/store
   - exponer modelo consistente Ticket
   - labels estado / prioridad
   - flags computados
   - avatars / initials
   - fechas base
   - adjuntos normalizados para modal/API/actions
   - historial limpio sin updates fantasma
   - collections helpers
   - sorting helpers
   - stats helpers
   - defensive parsing enterprise ready

   USO:
   import {
     normalizeIncidenciaModel,
     normalizeIncidenciasCollection,
     computeIncidenciasStats
   } from "./incidencias.model.js";
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const DEFAULT_PAGE_SIZE = 5;

export const STATUS = Object.freeze({
  OPEN: "open",
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
  CLOSED: "closed",
});

export const PRIORITY = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  URGENT: "urgent",
});

/* =========================================================
   SAFE CORE
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

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

function uniqueStrings(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    ),
  ];
}

function normalizeWhitespace(value = "") {
  return safeText(value, "").replace(/\s+/g, " ").trim();
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/* =========================================================
   IDS / HASH
========================================================= */

function hashString(value = "") {
  const str = String(value || "onion");
  let hash = 0;

  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

/* =========================================================
   LABEL MAPS
========================================================= */

export function normalizeStatus(value = "") {
  const key = safeLower(value, "open")
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");

  switch (key) {
    case "open":
    case "opened":
    case "abierta":
    case "abierto":
      return STATUS.OPEN;

    case "pending":
    case "pendiente":
      return STATUS.PENDING;

    case "progress":
    case "in_progress":
    case "inprogress":
    case "en_proceso":
    case "en_curso":
    case "proceso":
      return STATUS.IN_PROGRESS;

    case "resolved":
    case "resuelta":
    case "resuelto":
      return STATUS.RESOLVED;

    case "closed":
    case "cerrada":
    case "cerrado":
      return STATUS.CLOSED;

    default:
      return STATUS.OPEN;
  }
}

export function normalizePriority(value = "") {
  const key = safeLower(value, "medium")
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");

  switch (key) {
    case "low":
    case "baja":
      return PRIORITY.LOW;

    case "medium":
    case "media":
    case "normal":
      return PRIORITY.MEDIUM;

    case "high":
    case "alta":
      return PRIORITY.HIGH;

    case "urgent":
    case "urgente":
    case "critical":
    case "critica":
    case "crítica":
      return PRIORITY.URGENT;

    default:
      return PRIORITY.MEDIUM;
  }
}

export function getStatusLabel(value = "") {
  switch (normalizeStatus(value)) {
    case STATUS.OPEN:
      return "Abierta";

    case STATUS.PENDING:
      return "Pendiente";

    case STATUS.IN_PROGRESS:
      return "En proceso";

    case STATUS.RESOLVED:
      return "Resuelta";

    case STATUS.CLOSED:
      return "Cerrada";

    default:
      return "Abierta";
  }
}

export function getPriorityLabel(value = "") {
  switch (normalizePriority(value)) {
    case PRIORITY.LOW:
      return "Baja";

    case PRIORITY.MEDIUM:
      return "Media";

    case PRIORITY.HIGH:
      return "Alta";

    case PRIORITY.URGENT:
      return "Urgente";

    default:
      return "Media";
  }
}

/* =========================================================
   DATES
========================================================= */

export function toDate(value = null) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function toTimestamp(value = null) {
  const date = toDate(value);
  return date ? date.getTime() : 0;
}

/* =========================================================
   INITIALS / AVATAR
========================================================= */

export function getInitials(value = "") {
  const text = safeText(value, "ON");
  const parts = text.split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return "ON";
  }

  const initials = parts
    .slice(0, 2)
    .map((part) => safeText(part[0], ""))
    .join("");

  return safeText(initials, "ON").toUpperCase();
}

export function getAvatarTheme(seed = "") {
  const themes = [
    "violet",
    "emerald",
    "blue",
    "amber",
    "rose",
    "purple",
    "cyan",
    "orange",
  ];

  return themes[hashString(seed) % themes.length];
}

/* =========================================================
   ATTACHMENTS
========================================================= */

function getAttachmentPath(item = {}) {
  return safeText(
    first(
      item.path,
      item.storageKey,
      item.storagePath,
      item.blobPath,
      item.blobName,
      item.key
    ),
    ""
  );
}

function normalizeAttachment(file = {}, index = 0) {
  const item = safeObject(file);
  const raw = safeObject(item.raw);

  const name = safeText(
    first(
      item.name,
      item.filename,
      item.fileName,
      item.originalname,
      item.originalName,
      item.title,
      raw.name,
      raw.filename,
      raw.fileName,
      raw.originalname,
      raw.originalName,
      raw.title
    ),
    `archivo_${index + 1}`
  );

  const path = safeText(
    first(
      item.path,
      item.storageKey,
      item.storagePath,
      item.blobPath,
      item.blobName,
      item.key,
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
      item.id,
      item.fileId,
      item.attachmentId,
      item.blobName,
      item.storageKey,
      item.path,
      item.key,
      raw.id,
      raw.fileId,
      raw.attachmentId,
      raw.blobName,
      raw.storageKey,
      raw.path,
      raw.key
    ),
    path || `attachment-${index + 1}`
  );

  const viewUrl = safeText(
    first(
      item.viewUrl,
      item.openUrl,
      item.signedUrl,
      item.url,
      item.blobUrl,
      item.publicUrl,
      item.href,
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
      item.downloadUrl,
      item.signedUrl,
      item.url,
      item.blobUrl,
      item.publicUrl,
      item.href,
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
      item.contentType,
      item.mimetype,
      item.mimeType,
      item.mime,
      item.type,
      raw.contentType,
      raw.mimetype,
      raw.mimeType,
      raw.mime,
      raw.type
    ),
    ""
  );

  const normalized = {
    ...item,

    id,
    attachmentId: id,

    name,
    filename: safeText(
      first(
        item.filename,
        item.fileName,
        item.name,
        item.originalname,
        item.originalName,
        raw.filename,
        raw.fileName,
        raw.name,
        raw.originalname,
        raw.originalName
      ),
      name
    ),

    originalName: safeText(
      first(item.originalName, item.originalname, raw.originalName, raw.originalname),
      name
    ),

    url: safeText(
      first(
        item.url,
        viewUrl,
        downloadUrl,
        item.signedUrl,
        item.blobUrl,
        item.publicUrl,
        raw.url,
        raw.signedUrl,
        raw.blobUrl,
        raw.publicUrl
      ),
      ""
    ),

    viewUrl,
    openUrl: safeText(first(item.openUrl, raw.openUrl, viewUrl), viewUrl),
    downloadUrl,

    signedUrl: safeText(first(item.signedUrl, raw.signedUrl), ""),
    blobUrl: safeText(first(item.blobUrl, raw.blobUrl), ""),
    publicUrl: safeText(first(item.publicUrl, raw.publicUrl), ""),

    path,
    storageKey: safeText(first(item.storageKey, raw.storageKey, path), path),
    storagePath: safeText(first(item.storagePath, raw.storagePath, path), path),
    blobPath: safeText(first(item.blobPath, raw.blobPath, path), path),
    blobName: safeText(first(item.blobName, raw.blobName, path), path),
    key: safeText(first(item.key, raw.key, path), path),

    size: safeNumber(first(item.size, raw.size), 0),

    type: safeText(first(item.type, contentType), contentType),
    contentType,
    mimetype: safeText(first(item.mimetype, raw.mimetype, contentType), contentType),
    mimeType: safeText(first(item.mimeType, raw.mimeType, contentType), contentType),

    source: safeText(first(item.source, raw.source), ""),
    uploadedAt: first(
      item.uploadedAt,
      item.createdAt,
      item.date,
      item.timestamp,
      raw.uploadedAt,
      raw.createdAt,
      raw.date,
      raw.timestamp,
      null
    ),
    uploadedAtES: first(item.uploadedAtES, raw.uploadedAtES, null),
    uploadedBy: first(item.uploadedBy, raw.uploadedBy, null),

    raw: {
      ...raw,
      ...item,
    },
  };

  return normalized;
}

function normalizeAttachments(value) {
  return safeArray(value).map(normalizeAttachment);
}

/* =========================================================
   HISTORY / COMMENTS
========================================================= */

function formatChange(change = {}) {
  const item = safeObject(change);
  const field = safeLower(item.field, "");
  const action = safeLower(item.action, "");

  if (field === "attachments" || field === "adjuntos" || field === "files") {
    const added = safeNumber(item.added, 0);
    const removed = safeNumber(item.removed, 0);

    if (action === "remove" || removed > 0) {
      return removed === 1
        ? "Se eliminó 1 adjunto."
        : `Se eliminaron ${removed} adjuntos.`;
    }

    if (added > 0) {
      return added === 1
        ? "Se añadió 1 adjunto."
        : `Se añadieron ${added} adjuntos.`;
    }

    return "Adjuntos actualizados.";
  }

  if (field === "status" || field === "estado") {
    const from = safeText(item.from, "—");
    const to = safeText(item.to, "—");

    if (from === to) return "";

    return `Estado actualizado: ${from} → ${to}.`;
  }

  if (field === "priority" || field === "prioridad") {
    const from = safeText(item.from, "—");
    const to = safeText(item.to, "—");

    if (from === to) return "";

    return `Prioridad actualizada: ${from} → ${to}.`;
  }

  if (
    field === "message" ||
    field === "descripcion" ||
    field === "description" ||
    field === "body"
  ) {
    const from = normalizeWhitespace(item.from);
    const to = normalizeWhitespace(item.to);

    if (from && to && from === to) {
      return "";
    }

    return "Descripción actualizada.";
  }

  if (field === "categoria" || field === "category" || field === "tipo") {
    const from = safeText(item.from, "—");
    const to = safeText(item.to, "—");

    if (from === to) return "";

    return `Categoría actualizada: ${from} → ${to}.`;
  }

  if (field) {
    const from = safeText(item.from, "");
    const to = safeText(item.to, "");

    if (from && to && from === to) return "";

    return `${field} actualizado.`;
  }

  return "";
}

function normalizeHistoryEntry(row = {}, index = 0) {
  const item = safeObject(row);

  const type = safeText(first(item.type, item.action), "event");
  const normalizedType = safeLower(type, "event");
  const changes = safeArray(item.changes);

  let title = safeText(
    first(
      item.title,
      item.action,
      item.type,
      item.message,
      item.text
    ),
    "Evento"
  );

  let body = safeText(
    first(
      item.description,
      item.detail,
      item.body
    ),
    ""
  );

  if (normalizedType === "created" || normalizedType === "creation") {
    title = "Incidencia creada";
    body = safeText(
      first(
        item.body,
        item.description,
        item.detail,
        item.message
      ),
      "La incidencia fue registrada."
    );
  }

  if (normalizedType === "update") {
    const changeLines = changes.map(formatChange).filter(Boolean);

    title = "Actualización";
    body = changeLines.join("\n");
  }

  if (normalizedType === "attachments_added") {
    title = "Adjuntos añadidos";
    body = safeText(
      first(
        item.body,
        item.description,
        item.detail,
        item.message,
        changes.map(formatChange).filter(Boolean).join("\n")
      ),
      "Se añadieron adjuntos."
    );
  }

  if (normalizedType === "comment") {
    title = "Comentario";
    body = safeText(
      first(
        item.message,
        item.text,
        item.body,
        item.comment,
        body
      ),
      ""
    );
  }

  return {
    id: safeText(
      first(
        item.id,
        item.eventId,
        item.historyId
      ),
      `h-${index + 1}`
    ),

    kind: "event",
    type: normalizedType,
    action: safeText(first(item.action, item.type), normalizedType),

    title,
    body,

    changes,

    createdAt: first(
      item.createdAt,
      item.date,
      item.timestamp,
      null
    ),

    author: safeText(
      first(
        item.byName,
        item.user,
        item.author,
        item.name,
        item.by
      ),
      "Sistema"
    ),

    by: safeText(first(item.by, item.userId), ""),
    role: safeText(item.role, ""),

    raw: item,
  };
}

function normalizeCommentEntry(row = {}, index = 0) {
  const item = safeObject(row);

  return {
    id: safeText(
      first(
        item.id,
        item.commentId,
        item.messageId
      ),
      `c-${index + 1}`
    ),

    kind: "comment",
    type: "comment",

    title: "Comentario",

    body: safeText(
      first(
        item.message,
        item.text,
        item.body,
        item.comment
      ),
      ""
    ),

    createdAt: first(
      item.createdAt,
      item.date,
      item.timestamp,
      null
    ),

    author: safeText(
      first(
        item.byName,
        item.user,
        item.author,
        item.name,
        item.by
      ),
      "Usuario"
    ),

    by: safeText(first(item.by, item.userId), ""),
    role: safeText(item.role, ""),

    raw: item,
  };
}

function isNoiseHistoryEntry(entry = {}) {
  const title = safeLower(entry.title, "");
  const body = safeLower(entry.body, "");
  const type = safeLower(entry.type, "");

  if (type === "update" && !safeText(entry.body, "")) return true;
  if (title === "update" && body === "update") return true;
  if (title === "actualización" && body === "update") return true;
  if (title === "actualizacion" && body === "update") return true;

  return false;
}

function normalizeHistory(value) {
  return safeArray(value)
    .map(normalizeHistoryEntry)
    .filter((entry) => !isNoiseHistoryEntry(entry));
}

function normalizeComments(value) {
  return safeArray(value)
    .map(normalizeCommentEntry)
    .filter((entry) => Boolean(safeText(entry.body, "")));
}

/* =========================================================
   PAYLOAD UNWRAP
========================================================= */

function unwrapDetailPayload(payload = {}) {
  const source = safeObject(payload);

  if (!Object.keys(source).length) {
    return {};
  }

  const candidates = [
    source.ticket,
    source.detail,
    source.item,
    source.incidencia,
    source.result,
    source.payload,
    source.data,
    source,
  ];

  for (const candidate of candidates) {
    if (!isObject(candidate)) continue;

    if (
      candidate.ticketId ||
      candidate.id ||
      candidate.code ||
      candidate.ticketCode ||
      candidate.subject ||
      candidate.asunto ||
      candidate.title ||
      candidate.message ||
      candidate.descripcion ||
      candidate.description
    ) {
      return candidate;
    }
  }

  if (isObject(source.data)) {
    return unwrapDetailPayload(source.data);
  }

  if (isObject(source.payload)) {
    return unwrapDetailPayload(source.payload);
  }

  return source;
}

/* =========================================================
   CORE NORMALIZER
========================================================= */

export function normalizeIncidenciaModel(payload = {}) {
  const source = safeObject(payload);
  const item = safeObject(unwrapDetailPayload(source));

  const clienteObject = safeObject(
    first(
      item.cliente,
      item.client,
      item.customer
    )
  );

  const tecnicoObject = safeObject(
    first(
      item.tecnico,
      item.assignedTo,
      item.assignee
    )
  );

  const createdByObject = safeObject(item.createdBy);
  const receptorObject = safeObject(item.receptor);

  const ticketId = safeText(
    first(
      item.ticketId,
      item.id,
      item._id,
      item.code,
      item.ticketCode
    ),
    ""
  );

  const id = safeText(
    first(
      item.id,
      item.ticketId,
      item._id,
      ticketId
    ),
    ticketId
  );

  const ticketCode = safeText(
    first(
      item.ticketCode,
      item.code,
      ticketId,
      id
    ),
    ticketId || id
  );

  const title = safeText(
    first(
      item.title,
      item.subject,
      item.asunto,
      item.tipo,
      item.name
    ),
    "Incidencia"
  );

  const message = safeText(
    first(
      item.message,
      item.descripcion,
      item.description,
      item.body,
      item.preview
    ),
    ""
  );

  const description = safeText(
    first(
      item.description,
      item.descripcion,
      item.message,
      item.preview,
      item.body
    ),
    "Sin descripción."
  );

  const clientName = safeText(
    first(
      item.clientName,
      item.clienteNombre,
      item.name,
      clienteObject.nombre,
      clienteObject.name,
      clienteObject.company,
      clienteObject.empresa,
      receptorObject.name,
      createdByObject.name
    ),
    "Cliente"
  );

  const clientEmail = safeText(
    first(
      item.clientEmail,
      item.clienteEmail,
      item.email,
      clienteObject.email,
      receptorObject.email,
      createdByObject.email
    ),
    "Sin email"
  );

  const clientAvatar = safeText(
    first(
      item.clientAvatar,
      item.avatar,
      item.avatarUrl,
      clienteObject.avatar,
      clienteObject.avatarUrl
    ),
    ""
  );

  const assignedToName = safeText(
    first(
      tecnicoObject.name,
      tecnicoObject.nombre,
      item.assignedToName,
      typeof item.assignedTo === "string" ? item.assignedTo : null,
      typeof item.assignee === "string" ? item.assignee : null,
      typeof item.tecnico === "string" ? item.tecnico : null
    ),
    "No asignado"
  );

  const status = normalizeStatus(
    first(
      item.status,
      item.estado
    )
  );

  const priority = normalizePriority(
    first(
      item.priority,
      item.prioridad
    )
  );

  const category = safeLower(
    first(
      item.category,
      item.categoria,
      item.tipo
    ),
    "general"
  );

  const sourceLabel = safeText(
    first(
      item.source,
      item.origen,
      item.channel
    ),
    "panel"
  );

  const createdAt = first(
    item.createdAt,
    item.fechaCreacion,
    item.created_at,
    null
  );

  const createdAtES = first(
    item.createdAtES,
    null
  );

  const updatedAt = first(
    item.updatedAt,
    item.fechaActualizacion,
    item.updated_at,
    item.modifiedAt,
    item.lastUpdate,
    item.closedAt,
    createdAt,
    null
  );

  const updatedAtES = first(
    item.updatedAtES,
    null
  );

  const closedAt = first(
    item.closedAt,
    item.closed_at,
    null
  );

  const closedAtES = first(
    item.closedAtES,
    null
  );

  const attachments = normalizeAttachments(
    first(
      item.attachments,
      item.files,
      item.adjuntos
    )
  );

  const history = normalizeHistory(
    first(
      item.history,
      item.timeline,
      item.logs
    )
  );

  const comments = normalizeComments(
    first(
      item.comments,
      item.notes,
      item.messages
    )
  );

  const tagsRaw = first(
    item.tags,
    item.labels
  );

  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map((x) => safeText(x, "")).filter(Boolean)
    : typeof tagsRaw === "string"
      ? tagsRaw.split(",").map((x) => safeText(x, "")).filter(Boolean)
      : [];

  const initials = getInitials(clientName);
  const avatarTheme = getAvatarTheme(ticketId || clientName || clientEmail);

  const assignedLower = safeLower(assignedToName);
  const isAssigned = Boolean(
    assignedLower &&
      assignedLower !== "no asignado" &&
      assignedLower !== "sin asignar"
  );

  const isOpen = status === STATUS.OPEN;
  const isPending = status === STATUS.PENDING;
  const isInProgress = status === STATUS.IN_PROGRESS;
  const isResolved = status === STATUS.RESOLVED;
  const isClosed = status === STATUS.CLOSED;
  const isUrgent = priority === PRIORITY.URGENT;
  const isHigh = priority === PRIORITY.HIGH;

  const createdAtTs = toTimestamp(createdAt);
  const updatedAtTs = toTimestamp(updatedAt);
  const closedAtTs = toTimestamp(closedAt);

  const timeline = [...history, ...comments].sort(
    (a, b) => safeNumber(toTimestamp(b.createdAt)) - safeNumber(toTimestamp(a.createdAt))
  );

  const clienteId = safeText(
    first(
      item.clienteId,
      item.userId,
      clienteObject.id,
      clienteObject.userId,
      receptorObject.clienteId,
      receptorObject.userId,
      createdByObject.userId
    ),
    ""
  );

  const userId = safeText(
    first(
      item.userId,
      item.clienteId,
      receptorObject.userId,
      receptorObject.id,
      clienteObject.userId,
      clienteObject.id,
      createdByObject.userId
    ),
    ""
  );

  const normalized = {
    ...item,

    /* identity */
    id,
    ticketId,
    code: safeText(first(item.code, item.ticketCode, ticketCode), ticketCode),
    ticketCode,

    tipoDocumento: safeText(item.tipoDocumento, "ticket"),

    /* content */
    title,
    subject: safeText(first(item.subject, item.asunto, title), title),
    asunto: safeText(first(item.asunto, item.subject, title), title),

    description,
    descripcion: safeText(
      first(
        item.descripcion,
        item.message,
        item.description,
        description
      ),
      description
    ),
    message,
    preview: safeText(first(item.preview, message, description), description),

    /* relations */
    clientName,
    clientEmail,
    clientAvatar,
    assignedToName,

    cliente: {
      ...clienteObject,
      id: safeText(first(clienteObject.id, clienteObject.userId, clienteId), clienteId),
      userId: safeText(first(clienteObject.userId, clienteObject.id, userId), userId),
      nombre: safeText(first(clienteObject.nombre, clienteObject.name, clientName), clientName),
      name: safeText(first(clienteObject.name, clienteObject.nombre, clientName), clientName),
      email: safeText(first(clienteObject.email, clientEmail), clientEmail),
      avatar: safeText(first(clienteObject.avatar, clienteObject.avatarUrl, clientAvatar), clientAvatar),
      avatarUrl: safeText(first(clienteObject.avatarUrl, clienteObject.avatar, clientAvatar), clientAvatar),
      raw: clienteObject,
    },

    tecnico: {
      ...tecnicoObject,
      name: safeText(first(tecnicoObject.name, tecnicoObject.nombre, assignedToName), assignedToName),
      nombre: safeText(first(tecnicoObject.nombre, tecnicoObject.name, assignedToName), assignedToName),
      email: safeText(first(tecnicoObject.email), ""),
      raw: tecnicoObject,
    },

    createdBy: {
      ...createdByObject,
      userId: safeText(first(createdByObject.userId, createdByObject.id, item.createdByUserId, userId), ""),
      id: safeText(first(createdByObject.id, createdByObject.userId, item.createdByUserId, userId), ""),
      name: safeText(first(createdByObject.name, createdByObject.nombre, item.name), ""),
      email: safeText(first(createdByObject.email, item.email), ""),
      raw: createdByObject,
    },

    receptor: {
      ...receptorObject,
      userId: safeText(first(receptorObject.userId, receptorObject.id, userId), userId),
      id: safeText(first(receptorObject.id, receptorObject.userId, userId), userId),
      clienteId: safeText(first(receptorObject.clienteId, clienteId), clienteId),
      name: safeText(first(receptorObject.name, receptorObject.nombre, item.name, clientName), clientName),
      nombre: safeText(first(receptorObject.nombre, receptorObject.name, item.name, clientName), clientName),
      email: safeText(first(receptorObject.email, item.email, clientEmail), clientEmail),
      raw: receptorObject,
    },

    requester: first(
      item.requester,
      item.user,
      item.usuario,
      receptorObject,
      clienteObject,
      createdByObject,
      null
    ),

    /* enums */
    status,
    estado: status,
    statusLabel: getStatusLabel(status),

    priority,
    prioridad: priority,
    priorityLabel: getPriorityLabel(priority),

    /* semantic fields */
    category,
    categoria: category,
    tipo: safeText(first(item.tipo, item.categoria, item.category, category), category),
    source: sourceLabel,
    origen: safeText(first(item.origen, sourceLabel), sourceLabel),

    /* dates */
    createdAt,
    createdAtES,
    updatedAt,
    updatedAtES,
    closedAt,
    closedAtES,

    createdAtTs,
    updatedAtTs,
    closedAtTs,

    fechaProgramada: first(item.fechaProgramada, null),

    /* visuals */
    initials,
    avatarTheme,

    /* collections */
    attachments,
    attachmentsCount: safeNumber(
      first(
        item.attachmentsCount,
        attachments.length
      ),
      attachments.length
    ),

    history,
    historyCount: safeNumber(
      first(
        item.historyCount,
        history.length
      ),
      history.length
    ),

    comments,
    commentsCount: safeNumber(
      first(
        item.commentsCount,
        comments.length
      ),
      comments.length
    ),

    timeline,
    timelineCount: timeline.length,

    tags,

    /* flags */
    isAssigned,
    isOpen,
    isPending,
    isInProgress,
    isResolved,
    isClosed,
    isUrgent,
    isHigh,
    hasAttachments: attachments.length > 0,
    hasComments: comments.length > 0,
    hasHistory: history.length > 0,

    /* misc */
    email: safeText(first(item.email, clientEmail), clientEmail),
    name: safeText(first(item.name, clientName), clientName),
    userId,
    clienteId,
    ip: safeText(item.ip, ""),

    /* raw */
    raw: item,
  };

  return normalized;
}

/* =========================================================
   COLLECTION NORMALIZER
========================================================= */

export function unwrapIncidenciasPayload(payload = null) {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (Array.isArray(obj.tickets)) return obj.tickets;
  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.results)) return obj.results;
  if (Array.isArray(obj.rows)) return obj.rows;

  if (Array.isArray(obj?.payload?.tickets)) return obj.payload.tickets;
  if (Array.isArray(obj?.payload?.items)) return obj.payload.items;
  if (Array.isArray(obj?.data?.tickets)) return obj.data.tickets;
  if (Array.isArray(obj?.data?.items)) return obj.data.items;

  if (obj.data && typeof obj.data === "object") {
    return unwrapIncidenciasPayload(obj.data);
  }

  if (obj.payload && typeof obj.payload === "object") {
    return unwrapIncidenciasPayload(obj.payload);
  }

  return [];
}

export function normalizeIncidenciasCollection(payload = []) {
  return unwrapIncidenciasPayload(payload).map(normalizeIncidenciaModel);
}

/* =========================================================
   SORT
========================================================= */

export function sortIncidenciasByUpdatedDesc(items = []) {
  return [...safeArray(items)].sort(
    (a, b) => safeNumber(b.updatedAtTs) - safeNumber(a.updatedAtTs)
  );
}

export function sortIncidenciasByPriorityDesc(items = []) {
  const weight = {
    urgent: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  return [...safeArray(items)].sort((a, b) => {
    const priorityDiff =
      safeNumber(weight[b.priority]) - safeNumber(weight[a.priority]);

    if (priorityDiff !== 0) return priorityDiff;

    return safeNumber(b.updatedAtTs) - safeNumber(a.updatedAtTs);
  });
}

export function sortIncidenciasDefault(items = []) {
  return sortIncidenciasByUpdatedDesc(sortIncidenciasByPriorityDesc(items));
}

/* =========================================================
   PAGINATION
========================================================= */

export function paginateIncidencias(
  items = [],
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE
) {
  const list = safeArray(items);

  const size = Math.max(
    1,
    safeNumber(pageSize, DEFAULT_PAGE_SIZE)
  );

  const total = list.length;

  const totalPages = Math.max(
    1,
    Math.ceil(total / size)
  );

  const current = Math.min(
    Math.max(1, safeNumber(page, 1)),
    totalPages
  );

  const start = (current - 1) * size;
  const end = start + size;

  return {
    page: current,
    pageSize: size,
    total,
    totalPages,
    items: list.slice(start, end),
    from: total === 0 ? 0 : start + 1,
    to: Math.min(end, total),
  };
}

/* =========================================================
   STATS
========================================================= */

export function computeIncidenciasStats(items = []) {
  const list = safeArray(items);

  const total = list.length;
  const open = list.filter((x) => x.isOpen).length;
  const pending = list.filter((x) => x.isPending).length;
  const inProgress = list.filter((x) => x.isInProgress).length;
  const resolved = list.filter((x) => x.isResolved).length;
  const closed = list.filter((x) => x.isClosed).length;
  const urgent = list.filter((x) => x.isUrgent).length;
  const high = list.filter((x) => x.isHigh).length;
  const assigned = list.filter((x) => x.isAssigned).length;
  const withAttachments = list.filter((x) => x.hasAttachments).length;

  return {
    total,
    active: Math.max(total - closed, 0),

    open,
    pending,
    inProgress,
    resolved,
    closed,

    urgent,
    high,

    assigned,
    unassigned: Math.max(total - assigned, 0),

    withAttachments,
  };
}

/* =========================================================
   FINDERS
========================================================= */

export function findIncidenciaById(items = [], ticketId = "") {
  const id = safeText(ticketId, "");

  if (!id) return null;

  return (
    safeArray(items).find((item) => {
      const candidates = uniqueStrings([
        item?.ticketId,
        item?.id,
        item?.ticketCode,
        item?.code,
        item?.raw?.ticketId,
        item?.raw?.id,
        item?.raw?.ticketCode,
        item?.raw?.code,
      ]);

      return candidates.includes(id);
    }) || null
  );
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  DEFAULT_PAGE_SIZE,

  STATUS,
  PRIORITY,

  normalizeIncidenciaModel,
  normalizeIncidenciasCollection,
  unwrapIncidenciasPayload,

  sortIncidenciasByUpdatedDesc,
  sortIncidenciasByPriorityDesc,
  sortIncidenciasDefault,

  paginateIncidencias,
  computeIncidenciasStats,
  findIncidenciaById,

  getStatusLabel,
  getPriorityLabel,
  normalizeStatus,
  normalizePriority,

  toDate,
  toTimestamp,

  getInitials,
  getAvatarTheme,
};
