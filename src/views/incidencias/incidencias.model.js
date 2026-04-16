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

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function first(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return null;
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
  const key = safeText(value).toLowerCase();

  switch (key) {
    case "open":
    case "abierta":
    case "abierto":
      return STATUS.OPEN;

    case "pending":
    case "pendiente":
      return STATUS.PENDING;

    case "progress":
    case "in_progress":
    case "in-progress":
    case "en_proceso":
    case "en proceso":
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
  const key = safeText(value).toLowerCase();

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
    .map((part) => part[0])
    .join("");

  return (initials || "ON").toUpperCase();
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

  return themes[
    hashString(seed) % themes.length
  ];
}

/* =========================================================
   ATTACHMENTS
========================================================= */

function normalizeAttachment(file = {}) {
  const item = safeObject(file);

  return {
    id: safeText(
      first(
        item.id,
        item.fileId
      ),
      ""
    ),

    name: safeText(
      first(
        item.name,
        item.filename,
        item.fileName,
        item.originalname
      ),
      "archivo"
    ),

    url: safeText(
      first(
        item.url,
        item.href,
        item.path,
        item.downloadUrl
      ),
      "#"
    ),

    size: safeNumber(item.size, 0),

    raw: item,
  };
}

function normalizeAttachments(value) {
  return safeArray(value).map(
    normalizeAttachment
  );
}

/* =========================================================
   HISTORY
========================================================= */

function normalizeHistoryEntry(row = {}) {
  const item = safeObject(row);

  return {
    id: safeText(
      first(item.id),
      ""
    ),

    title: safeText(
      first(
        item.title,
        item.action,
        item.message,
        item.text
      ),
      "Evento"
    ),

    createdAt: first(
      item.createdAt,
      item.date,
      item.timestamp
    ),

    user: safeText(
      first(
        item.user,
        item.author,
        item.name
      ),
      ""
    ),

    raw: item,
  };
}

function normalizeHistory(value) {
  return safeArray(value).map(
    normalizeHistoryEntry
  );
}

/* =========================================================
   CORE NORMALIZER
========================================================= */

export function normalizeIncidenciaModel(
  payload = {}
) {
  const item = safeObject(payload);

  const clientObject = safeObject(
    first(
      item.client,
      item.cliente,
      item.customer,
      item.receptor,
      item.createdBy
    )
  );

  const assignedObject = safeObject(
    first(
      item.assignedTo,
      item.assignee,
      item.tecnico
    )
  );

  const ticketId = safeText(
    first(
      item.ticketId,
      item.id,
      item.code,
      item.ticketCode
    ),
    ""
  );

  const title = safeText(
    first(
      item.title,
      item.subject,
      item.asunto,
      item.name
    ),
    "Incidencia"
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
      clientObject.name,
      clientObject.nombre,
      clientObject.company,
      item.clientName,
      item.company,
      item.clienteNombre
    ),
    "Cliente"
  );

  const clientEmail = safeText(
    first(
      clientObject.email,
      item.clientEmail,
      item.email
    ),
    "Sin email"
  );

  const clientAvatar = safeText(
    first(
      clientObject.avatar,
      clientObject.avatarUrl,
      item.clientAvatar,
      item.avatar,
      item.avatarUrl
    ),
    ""
  );

  const assignedToName = safeText(
    first(
      assignedObject.name,
      assignedObject.nombre,
      item.assignedTo,
      item.assignee,
      item.tecnico
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

  const createdAt = first(
    item.createdAt,
    item.createdAtES,
    item.date,
    item.fechaCreacion
  );

  const updatedAt = first(
    item.updatedAt,
    item.closedAt,
    item.modifiedAt,
    item.lastUpdate,
    createdAt
  );

  const attachments =
    normalizeAttachments(
      first(
        item.attachments,
        item.files,
        item.adjuntos
      )
    );

  const history =
    normalizeHistory(
      first(
        item.history,
        item.timeline,
        item.logs,
        item.comments
      )
    );

  const initials =
    getInitials(clientName);

  const avatarTheme =
    getAvatarTheme(
      ticketId ||
      clientName ||
      clientEmail
    );

  const isAssigned =
    assignedToName !==
    "No asignado";

  const isOpen =
    status === STATUS.OPEN;

  const isPending =
    status === STATUS.PENDING;

  const isInProgress =
    status === STATUS.IN_PROGRESS;

  const isResolved =
    status === STATUS.RESOLVED;

  const isClosed =
    status === STATUS.CLOSED;

  const isUrgent =
    priority === PRIORITY.URGENT;

  const isHigh =
    priority === PRIORITY.HIGH;

  const createdAtTs =
    toTimestamp(createdAt);

  const updatedAtTs =
    toTimestamp(updatedAt);

  return {
    /* identity */
    ticketId,
    id: ticketId,

    /* content */
    title,
    description,

    /* relations */
    clientName,
    clientEmail,
    clientAvatar,
    assignedToName,

    /* enums */
    status,
    statusLabel:
      getStatusLabel(status),

    priority,
    priorityLabel:
      getPriorityLabel(
        priority
      ),

    /* dates */
    createdAt,
    updatedAt,
    createdAtTs,
    updatedAtTs,

    /* visuals */
    initials,
    avatarTheme,

    /* collections */
    attachments,
    attachmentsCount:
      attachments.length,

    history,
    historyCount:
      history.length,

    /* flags */
    isAssigned,
    isOpen,
    isPending,
    isInProgress,
    isResolved,
    isClosed,
    isUrgent,
    isHigh,

    /* raw */
    raw: item,
  };
}

/* =========================================================
   COLLECTION NORMALIZER
========================================================= */

export function unwrapIncidenciasPayload(
  payload = null
) {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (
    Array.isArray(obj.tickets)
  ) {
    return obj.tickets;
  }

  if (
    Array.isArray(obj.items)
  ) {
    return obj.items;
  }

  if (
    Array.isArray(obj.data)
  ) {
    return obj.data;
  }

  if (
    Array.isArray(obj.results)
  ) {
    return obj.results;
  }

  if (
    obj.data &&
    typeof obj.data ===
      "object"
  ) {
    return unwrapIncidenciasPayload(
      obj.data
    );
  }

  return [];
}

export function normalizeIncidenciasCollection(
  payload = []
) {
  return unwrapIncidenciasPayload(
    payload
  ).map(
    normalizeIncidenciaModel
  );
}

/* =========================================================
   SORT
========================================================= */

export function sortIncidenciasByUpdatedDesc(
  items = []
) {
  return [...safeArray(items)].sort(
    (a, b) =>
      safeNumber(
        b.updatedAtTs
      ) -
      safeNumber(
        a.updatedAtTs
      )
  );
}

export function sortIncidenciasByPriorityDesc(
  items = []
) {
  const weight = {
    urgent: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  return [...safeArray(items)].sort(
    (a, b) =>
      safeNumber(
        weight[b.priority]
      ) -
      safeNumber(
        weight[a.priority]
      )
  );
}

/* =========================================================
   PAGINATION
========================================================= */

export function paginateIncidencias(
  items = [],
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE
) {
  const list =
    safeArray(items);

  const size = Math.max(
    1,
    safeNumber(
      pageSize,
      DEFAULT_PAGE_SIZE
    )
  );

  const total =
    list.length;

  const totalPages =
    Math.max(
      1,
      Math.ceil(total / size)
    );

  const current = Math.min(
    Math.max(
      1,
      safeNumber(page, 1)
    ),
    totalPages
  );

  const start =
    (current - 1) * size;

  const end =
    start + size;

  return {
    page: current,
    pageSize: size,
    total,
    totalPages,
    items:
      list.slice(
        start,
        end
      ),
    from:
      total === 0
        ? 0
        : start + 1,
    to: Math.min(
      end,
      total
    ),
  };
}

/* =========================================================
   STATS
========================================================= */

export function computeIncidenciasStats(
  items = []
) {
  const list =
    safeArray(items);

  return {
    total:
      list.length,

    open:
      list.filter(
        (x) => x.isOpen
      ).length,

    pending:
      list.filter(
        (x) =>
          x.isPending
      ).length,

    inProgress:
      list.filter(
        (x) =>
          x.isInProgress
      ).length,

    resolved:
      list.filter(
        (x) =>
          x.isResolved
      ).length,

    closed:
      list.filter(
        (x) =>
          x.isClosed
      ).length,

    urgent:
      list.filter(
        (x) =>
          x.isUrgent
      ).length,

    assigned:
      list.filter(
        (x) =>
          x.isAssigned
      ).length,
  };
}

/* =========================================================
   FINDERS
========================================================= */

export function findIncidenciaById(
  items = [],
  ticketId = ""
) {
  const id = safeText(
    ticketId,
    ""
  );

  if (!id) return null;

  return (
    safeArray(items).find(
      (item) =>
        safeText(
          item.ticketId
        ) === id
    ) || null
  );
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  DEFAULT_PAGE_SIZE,
  normalizeIncidenciaModel,
  normalizeIncidenciasCollection,
  unwrapIncidenciasPayload,
  sortIncidenciasByUpdatedDesc,
  sortIncidenciasByPriorityDesc,
  paginateIncidencias,
  computeIncidenciasStats,
  findIncidenciaById,
  getStatusLabel,
  getPriorityLabel,
  normalizeStatus,
  normalizePriority,
};
