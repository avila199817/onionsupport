/* =========================================================
   Onion SPA - Incidencias Model
   Archivo: src/views/incidencias/incidencias.model.js

   Responsabilidades:
   - normalizar respuesta backend
   - mapear estados y prioridades
   - generar modelo UI consistente
   - soportar múltiples formatos legacy/new api
========================================================= */

import {
  safeArray,
  safeNumber,
  safeString,
  normalizeText,
  getInitials,
  toMs,
} from "./incidencias.utils.js";

/* =========================================================
   STATUS
========================================================= */

export function normalizeStatus(value = "open") {
  const map = {
    abierta: "open",
    abierto: "open",
    open: "open",

    pendiente: "pending",
    pending: "pending",

    "en proceso": "in_progress",
    en_proceso: "in_progress",
    in_progress: "in_progress",

    resuelta: "resolved",
    resuelto: "resolved",
    resolved: "resolved",

    cerrada: "closed",
    cerrado: "closed",
    closed: "closed",
  };

  const key = normalizeText(
    String(value ?? "").replaceAll("_", " ")
  );

  return map[key] || "open";
}

/* =========================================================
   PRIORITY
========================================================= */

export function normalizePriority(value = "medium") {
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

  const key = normalizeText(value);

  return map[key] || "medium";
}

/* =========================================================
   RESPONSE EXTRACTOR
========================================================= */

export function extractItems(response) {
  if (Array.isArray(response)) return response;

  if (Array.isArray(response?.tickets)) return response.tickets;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.data)) return response.data;

  if (Array.isArray(response?.data?.tickets)) {
    return response.data.tickets;
  }

  if (Array.isArray(response?.data?.items)) {
    return response.data.items;
  }

  if (Array.isArray(response?.results)) return response.results;

  return [];
}

/* =========================================================
   NORMALIZER
========================================================= */

export function normalizeIncidencia(item = {}) {
  const id =
    item.id ??
    item.ticketId ??
    item._id ??
    null;

  const ticketId =
    item.ticketId ??
    item.id ??
    item._id ??
    null;

  const status = normalizeStatus(
    item.status ??
    item.estado ??
    "open"
  );

  const priority = normalizePriority(
    item.priority ??
    item.prioridad ??
    "medium"
  );

  const clientName =
    item.cliente?.nombre ??
    item.name ??
    item.receptor?.name ??
    item.createdBy?.name ??
    item.user?.name ??
    "Usuario";

  const clientEmail =
    item.cliente?.email ??
    item.email ??
    item.receptor?.email ??
    item.createdBy?.email ??
    item.user?.email ??
    "-";

  const assignedName =
    item.tecnico?.name ??
    item.assignedTo?.name ??
    item.assigned_to?.name ??
    item.assignee?.name ??
    "No asignado";

  const assignedEmail =
    item.tecnico?.email ??
    item.assignedTo?.email ??
    item.assigned_to?.email ??
    item.assignee?.email ??
    "";

  const createdAt =
    item.createdAt ??
    item.fechaCreacion ??
    null;

  const updatedAt =
    item.updatedAt ??
    item.fechaActualizacion ??
    item.closedAt ??
    createdAt ??
    null;

  const attachments = safeArray(item.attachments);

  return {
    id,
    ticketId,
    code: ticketId || id || null,

    title:
      item.subject ??
      item.asunto ??
      item.title ??
      `Ticket ${ticketId || id || "sin asunto"}`,

    description:
      item.descripcion ??
      item.message ??
      item.description ??
      "",

    preview:
      item.preview ??
      item.descripcion ??
      item.message ??
      item.description ??
      "",

    status,
    priority,

    tipo: safeString(item.tipo, "general"),
    categoria: safeString(item.categoria, "general"),

    client: clientName,
    clientEmail,

    assignedTo: assignedName,
    assignedEmail,

    attachmentsCount:
      safeNumber(
        item.attachmentsCount,
        attachments.length
      ) || 0,

    createdAt,
    updatedAt,

    meta: {
      timestampMs:
        toMs(updatedAt) ||
        toMs(createdAt) ||
        0,

      initials: getInitials(clientName),
    },

    raw: item,
  };
}
