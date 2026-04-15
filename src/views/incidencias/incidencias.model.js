/* =========================================================
   Onion SPA - Incidencias Model
   Archivo: src/views/incidencias/incidencias.model.js

   Responsabilidades:
   - normalizar respuesta backend
   - mapear estados y prioridades
   - generar modelo UI consistente
   - soportar formatos legacy / nuevos
   - tolerar payloads heterogéneos reales
   - blindar campos vacíos que rompen render
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
   HELPERS
========================================================= */

function firstDefined(...values) {
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

function safeText(value, fallback = "") {
  const text = safeString(value, "");
  return text || fallback;
}

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
    progress: "in_progress",

    resuelta: "resolved",
    resuelto: "resolved",
    resolved: "resolved",

    cerrada: "closed",
    cerrado: "closed",
    closed: "closed",
  };

  const key = normalizeText(
    String(value ?? "")
      .replaceAll("_", " ")
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
  if (Array.isArray(response)) {
    return response;
  }

  const candidates = [
    response?.tickets,
    response?.items,
    response?.rows,
    response?.resources,
    response?.results,

    response?.data,
    response?.data?.tickets,
    response?.data?.items,
    response?.data?.rows,
    response?.data?.resources,
    response?.data?.results,

    response?.data?.data,
    response?.data?.data?.tickets,
    response?.data?.data?.items,
  ];

  for (const item of candidates) {
    if (Array.isArray(item)) {
      return item;
    }
  }

  return [];
}

/* =========================================================
   NORMALIZER
========================================================= */

export function normalizeIncidencia(item = {}) {
  const id = firstDefined(
    item.id,
    item.ticketId,
    item._id,
    item.codigo
  );

  const ticketId = firstDefined(
    item.ticketId,
    item.id,
    item._id,
    item.codigo
  );

  const status = normalizeStatus(
    firstDefined(
      item.status,
      item.estado,
      "open"
    )
  );

  const priority = normalizePriority(
    firstDefined(
      item.priority,
      item.prioridad,
      "medium"
    )
  );

  /* =======================================================
     CLIENTE / USUARIO
  ======================================================= */

  const clientName = safeText(
    firstDefined(
      item.cliente?.nombre,
      item.cliente?.name,
      item.client?.name,
      item.clientName,
      item.nombreCliente,
      item.receptor?.name,
      item.createdBy?.name,
      item.user?.name,
      item.name
    ),
    "Usuario"
  );

  const clientEmail = safeText(
    firstDefined(
      item.cliente?.email,
      item.client?.email,
      item.email,
      item.receptor?.email,
      item.createdBy?.email,
      item.user?.email
    ),
    "-"
  );

  /* =======================================================
     ASIGNADO
  ======================================================= */

  const assignedName = safeText(
    firstDefined(
      item.tecnico?.name,
      item.assignedTo?.name,
      item.assigned_to?.name,
      item.assignee?.name
    ),
    "No asignado"
  );

  const assignedEmail = safeText(
    firstDefined(
      item.tecnico?.email,
      item.assignedTo?.email,
      item.assigned_to?.email,
      item.assignee?.email
    ),
    ""
  );

  /* =======================================================
     FECHAS
  ======================================================= */

  const createdAt = firstDefined(
    item.createdAt,
    item.created_at,
    item.fechaCreacion,
    item.fechaAlta,
    item.date
  );

  const updatedAt = firstDefined(
    item.updatedAt,
    item.updated_at,
    item.fechaActualizacion,
    item.closedAt,
    createdAt
  );

  /* =======================================================
     ATTACHMENTS
  ======================================================= */

  const attachments = safeArray(
    firstDefined(
      item.attachments,
      item.files,
      []
    )
  );

  /* =======================================================
     TEXTO PRINCIPAL
  ======================================================= */

  const title = safeText(
    firstDefined(
      item.subject,
      item.asunto,
      item.title,
      item.titulo,
      item.name
    ),
    `Ticket ${ticketId || id || "sin asunto"}`
  );

  const description = safeText(
    firstDefined(
      item.descripcion,
      item.description,
      item.message,
      item.body,
      item.detalle
    ),
    ""
  );

  const preview =
    description ||
    title;

  /* =======================================================
     RETURN MODEL
  ======================================================= */

  return {
    id,
    ticketId,

    code:
      ticketId ||
      id ||
      null,

    title,
    description,
    preview,

    status,
    priority,

    tipo: safeText(
      item.tipo,
      "general"
    ),

    categoria: safeText(
      item.categoria,
      "general"
    ),

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

      initials:
        getInitials(
          clientName
        ),
    },

    raw: item,
  };
}
