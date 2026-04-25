/* =========================================================
   Onion SPA - Facturas Actions
   Archivo: src/views/facturas/facturas.actions.js

   FINAL PRO SYSTEM · ACTIONS REAL · 10/10
   PATCH · INCIDENCIA SAFE · NO URL NAVIGATION

   RESPONSABILIDADES:
   - centralizar acciones operativas del módulo de facturas
   - resolver detalle desde store + loader/backend
   - abrir detalle a nivel de datos, no de UI
   - preservar relación factura ↔ incidencia
   - abrir pdf inline / descarga
   - enviar factura al cliente
   - copiar identificadores
   - exportar colección a CSV
   - desacoplar facturasView.js de la lógica operativa

   FULL PRO 10/10:
   - misma filosofía que incidencias.actions.js
   - sin acoplar modal global en actions
   - fallback store -> loader
   - export CSV robusto con incidencia
   - clipboard con fallback legacy
   - eventos opcionales vía AppCore.events
   - tolerancia a payloads heterogéneos
   - compatible con API normalizada actual
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  fetchFacturaPdfUrlRequest,
  sendFacturaRequest,
  resolveFacturaPdfUrl,
} from "./facturas.api.js";

import {
  getFacturaByIdStore,
  getSortedFacturasStore,
} from "./facturas.store.js";

import {
  safeText,
  safeNumber,
  safeArray,
  safeObject,
  showToast,
} from "./facturas.utils.js";

/* =========================================================
   CONSTANTS
========================================================= */

const CSV_FILENAME_PREFIX = "facturas";

/* =========================================================
   BASE HELPERS
========================================================= */

function safeEmit(eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) return false;

  try {
    AppCore?.events?.emit?.(name, payload);
    return true;
  } catch {}

  try {
    window.dispatchEvent(
      new CustomEvent(name, {
        detail: payload,
      })
    );
    return true;
  } catch {}

  return false;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    return value;
  }

  return null;
}

function normalizeFacturaId(value = "") {
  return safeText(value, "");
}

function isObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

function hasOwnKeys(value = {}) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length
  );
}

function isLikelyFactura(value) {
  if (!isObject(value)) {
    return false;
  }

  return Boolean(
    value.id ||
      value._id ||
      value.facturaId ||
      value.invoiceId ||
      value.numero ||
      value.code ||
      value.numeroFacturaLegal ||
      value.numeroFacturaSistema ||
      value.total !== undefined ||
      value.amount !== undefined ||
      value.importe !== undefined ||
      value.cliente ||
      value.client ||
      value.customer ||
      value.ticketId ||
      value.incidenciaId ||
      value.incidencia ||
      value.ticket
  );
}

function looksLikeEnvelope(value) {
  const obj = safeObject(value);

  return Boolean(
    obj.factura ||
      obj.item ||
      obj.data ||
      obj.result ||
      obj.payload
  );
}

function pickDetail(payload = null) {
  if (!payload) {
    return null;
  }

  if (isLikelyFactura(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (isLikelyFactura(obj.factura)) {
    return obj.factura;
  }

  if (isLikelyFactura(obj.item)) {
    return obj.item;
  }

  if (isLikelyFactura(obj.result)) {
    return obj.result;
  }

  if (isLikelyFactura(obj.payload)) {
    return obj.payload;
  }

  if (isLikelyFactura(obj.data)) {
    return obj.data;
  }

  if (looksLikeEnvelope(obj.data)) {
    return pickDetail(obj.data);
  }

  if (looksLikeEnvelope(obj.payload)) {
    return pickDetail(obj.payload);
  }

  if (looksLikeEnvelope(obj.result)) {
    return pickDetail(obj.result);
  }

  return null;
}

function safeErrorMessage(error = null, fallback = "") {
  return safeText(
    first(
      error?.data?.message,
      error?.response?.data?.message,
      error?.response?.message,
      error?.message,
      fallback
    ),
    fallback
  );
}

/* =========================================================
   FACTURA FIELD HELPERS
========================================================= */

function getRaw(item = {}) {
  return safeObject(item?.raw);
}

function resolveFacturaId(detail = null) {
  const item = safeObject(detail);
  const raw = getRaw(item);

  return safeText(
    first(
      item.id,
      item._id,
      item.facturaId,
      item.invoiceId,
      item.numeroFacturaLegal,
      item.numeroFacturaSistema,

      raw.id,
      raw._id,
      raw.facturaId,
      raw.invoiceId,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema
    ),
    ""
  );
}

function getFacturaId(item = {}) {
  return resolveFacturaId(item);
}

function getFacturaNumber(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return safeText(
    first(
      source.numero,
      source.code,
      source.facturaCode,
      source.facturaNumero,
      source.numeroFacturaLegal,
      source.numeroFacturaSistema,
      source.invoiceNumber,

      raw.numero,
      raw.code,
      raw.facturaCode,
      raw.facturaNumero,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema,
      raw.invoiceNumber
    ),
    "—"
  );
}

function getFacturaClientObject(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  const client = first(
    source.cliente,
    source.client,
    source.customer,
    raw.cliente,
    raw.client,
    raw.customer
  );

  return isObject(client) ? client : {};
}

function getFacturaClient(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);
  const client = getFacturaClientObject(source);

  if (Object.keys(client).length) {
    return safeText(
      first(
        client.empresa,
        client.razonSocial,
        client.nombreFiscal,
        client.nombre,
        client.nombreContacto,
        client.name,
        client.company,
        client.displayName
      ),
      "Cliente"
    );
  }

  return safeText(
    first(
      source.clienteNombre,
      source.clientName,
      source.customerName,
      source.name,
      source.nombre,

      raw.clienteNombre,
      raw.clientName,
      raw.customerName,
      raw.name,
      raw.nombre
    ),
    "Cliente"
  );
}

function getFacturaEmail(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);
  const client = getFacturaClientObject(source);

  if (Object.keys(client).length) {
    return safeText(
      first(
        client.email,
        client.mail
      ),
      "Sin email"
    );
  }

  return safeText(
    first(
      source.email,
      source.emailCliente,
      source.clienteEmail,
      source.clientEmail,
      source.customerEmail,

      raw.email,
      raw.emailCliente,
      raw.clienteEmail,
      raw.clientEmail,
      raw.customerEmail
    ),
    "Sin email"
  );
}

function getFacturaDate(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return first(
    source.fecha,
    source.date,
    source.fechaFactura,
    source.issueDate,
    source.createdAt,
    source.updatedAt,

    raw.fecha,
    raw.date,
    raw.fechaFactura,
    raw.issueDate,
    raw.createdAt,
    raw.updatedAt
  );
}

function getFacturaEstadoPago(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return safeText(
    first(
      source.estadoPago,
      source.paymentStatus,

      raw.estadoPago,
      raw.paymentStatus
    ),
    "pending"
  );
}

function getFacturaEstado(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return safeText(
    first(
      source.estado,
      source.status,

      raw.estado,
      raw.status
    ),
    "emitida"
  );
}

function getFacturaFormaPago(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return safeText(
    first(
      source.formaPago,
      source.metodoPago,
      source.paymentMethod,

      raw.formaPago,
      raw.metodoPago,
      raw.paymentMethod
    ),
    "—"
  );
}

function getFacturaMoneda(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return safeText(
    first(
      source.moneda,
      source.currency,

      raw.moneda,
      raw.currency
    ),
    "EUR"
  );
}

function getFacturaTotal(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return safeNumber(
    first(
      source.total,
      source.amount,
      source.importe,
      source.importeTotal,

      raw.total,
      raw.amount,
      raw.importe,
      raw.importeTotal
    ),
    0
  );
}

function getFacturaSentTo(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return safeText(
    first(
      source.enviadoA,
      source.sentTo,
      source?.cliente?.email,
      source?.client?.email,
      source?.customer?.email,

      raw.enviadoA,
      raw.sentTo,
      raw?.cliente?.email,
      raw?.client?.email,
      raw?.customer?.email
    ),
    ""
  );
}

function getFacturaSentAt(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return first(
    source.fechaEnvio,
    source.sentAt,
    source.mailSentAt,
    source.updatedAt,

    raw.fechaEnvio,
    raw.sentAt,
    raw.mailSentAt,
    raw.updatedAt
  );
}

/* =========================================================
   INCIDENCIA / TICKET HELPERS
========================================================= */

function pickTicketIdFromArray(value = []) {
  const items = safeArray(value);

  for (const item of items) {
    if (typeof item === "string" && item.trim()) {
      return item.trim();
    }

    if (!item || typeof item !== "object") {
      continue;
    }

    const candidate = first(
      item.ticketId,
      item.incidenciaId,
      item.id,
      item.code,
      item.numero,
      item.relatedTicketId,
      item.relatedIncidentId,
      item.supportTicketId,
      item.caseId
    );

    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function getRelationObject(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return safeObject(
    first(
      source.incidencia,
      source.ticket,
      source.linkedTicket,

      raw.incidencia,
      raw.ticket,
      raw.linkedTicket
    )
  );
}

function getFacturaIncidenciaId(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  const incidencia = safeObject(first(source.incidencia, raw.incidencia));
  const ticket = safeObject(first(source.ticket, raw.ticket));
  const linkedTicket = safeObject(first(source.linkedTicket, raw.linkedTicket));

  return safeText(
    first(
      source.ticketId,
      source.incidenciaId,

      incidencia.ticketId,
      incidencia.id,
      incidencia.incidenciaId,

      ticket.ticketId,
      ticket.id,
      ticket.incidenciaId,

      linkedTicket.ticketId,
      linkedTicket.id,
      linkedTicket.incidenciaId,

      source.relatedTicketId,
      source.relatedIncidentId,
      source.supportTicketId,
      source.caseId,

      source.meta?.ticketId,
      source.meta?.incidenciaId,

      pickTicketIdFromArray(source.ticketIds),
      pickTicketIdFromArray(source.incidenciaIds),
      pickTicketIdFromArray(source.relatedTicketIds),
      pickTicketIdFromArray(source.relatedIncidentIds),
      pickTicketIdFromArray(source.linkedTickets),
      pickTicketIdFromArray(source.incidencias),
      pickTicketIdFromArray(source.tickets),
      pickTicketIdFromArray(source.relatedTickets),
      pickTicketIdFromArray(source.relations),

      raw.ticketId,
      raw.incidenciaId,

      raw.incidencia?.ticketId,
      raw.incidencia?.id,
      raw.incidencia?.incidenciaId,

      raw.ticket?.ticketId,
      raw.ticket?.id,
      raw.ticket?.incidenciaId,

      raw.linkedTicket?.ticketId,
      raw.linkedTicket?.id,
      raw.linkedTicket?.incidenciaId,

      raw.relatedTicketId,
      raw.relatedIncidentId,
      raw.supportTicketId,
      raw.caseId,

      raw.meta?.ticketId,
      raw.meta?.incidenciaId,

      pickTicketIdFromArray(raw.ticketIds),
      pickTicketIdFromArray(raw.incidenciaIds),
      pickTicketIdFromArray(raw.relatedTicketIds),
      pickTicketIdFromArray(raw.relatedIncidentIds),
      pickTicketIdFromArray(raw.linkedTickets),
      pickTicketIdFromArray(raw.incidencias),
      pickTicketIdFromArray(raw.tickets),
      pickTicketIdFromArray(raw.relatedTickets),
      pickTicketIdFromArray(raw.relations)
    ),
    ""
  );
}

function buildIncidenciaPayload(item = {}, forcedId = "") {
  const source = safeObject(item);
  const raw = getRaw(source);

  const incidencia = safeObject(first(source.incidencia, raw.incidencia));
  const ticket = safeObject(first(source.ticket, raw.ticket));
  const linkedTicket = safeObject(first(source.linkedTicket, raw.linkedTicket));

  const incidenciaId = safeText(
    first(
      forcedId,
      getFacturaIncidenciaId(source)
    ),
    ""
  );

  if (!incidenciaId) {
    return null;
  }

  return {
    ...incidencia,

    id: incidenciaId,
    ticketId: incidenciaId,
    incidenciaId,

    subject: safeText(
      first(
        incidencia.subject,
        incidencia.asunto,
        incidencia.title,

        ticket.subject,
        ticket.asunto,
        ticket.title,

        linkedTicket.subject,
        linkedTicket.asunto,
        linkedTicket.title,

        source.subject,
        source.asunto,
        raw.subject,
        raw.asunto
      ),
      ""
    ),

    asunto: safeText(
      first(
        incidencia.asunto,
        incidencia.subject,
        incidencia.title,

        ticket.asunto,
        ticket.subject,
        ticket.title,

        linkedTicket.asunto,
        linkedTicket.subject,
        linkedTicket.title,

        source.asunto,
        source.subject,
        raw.asunto,
        raw.subject
      ),
      ""
    ),

    clienteId: safeText(
      first(
        incidencia.clienteId,
        ticket.clienteId,
        linkedTicket.clienteId,
        source.clienteId,
        source.cliente?.id,
        raw.clienteId,
        raw.cliente?.id
      ),
      ""
    ),

    clienteNombre: safeText(
      first(
        incidencia.clienteNombre,
        incidencia.name,
        incidencia.nombre,

        ticket.clienteNombre,
        ticket.name,
        ticket.nombre,

        linkedTicket.clienteNombre,
        linkedTicket.name,
        linkedTicket.nombre,

        source.cliente?.nombre,
        source.cliente?.nombreContacto,
        source.cliente?.name,

        raw.cliente?.nombre,
        raw.cliente?.nombreContacto,
        raw.cliente?.name
      ),
      ""
    ),

    relationType: safeText(
      first(
        incidencia.relationType,
        ticket.relationType,
        linkedTicket.relationType,
        source.relationType,
        raw.relationType,
        "linked_ticket"
      ),
      "linked_ticket"
    ),

    linkedAt: safeText(
      first(
        incidencia.linkedAt,
        ticket.linkedAt,
        linkedTicket.linkedAt,
        source.linkedAt,
        raw.linkedAt,
        source.updatedAt,
        raw.updatedAt
      ),
      ""
    ),

    linkedAtES: safeText(
      first(
        incidencia.linkedAtES,
        ticket.linkedAtES,
        linkedTicket.linkedAtES,
        source.linkedAtES,
        raw.linkedAtES,
        source.updatedAtES,
        raw.updatedAtES
      ),
      ""
    ),
  };
}

function preserveFacturaIncidenciaFields(normalized = {}, original = {}) {
  const base = safeObject(normalized);
  const source = safeObject(original);

  const raw = {
    ...safeObject(source.raw),
    ...safeObject(base.raw),
  };

  const probe = {
    ...source,
    ...base,
    raw,
  };

  const incidenciaId = getFacturaIncidenciaId(probe);

  if (!incidenciaId) {
    return {
      ...base,
      raw,
      meta: {
        ...safeObject(base.meta),
        hasIncidencia: Boolean(base.meta?.hasIncidencia),
      },
    };
  }

  const incidenciaPayload = buildIncidenciaPayload(probe, incidenciaId);

  const ticketObject = hasOwnKeys(first(base.ticket, source.ticket, raw.ticket))
    ? safeObject(first(base.ticket, source.ticket, raw.ticket))
    : incidenciaPayload;

  const linkedTicketObject = hasOwnKeys(
    first(base.linkedTicket, source.linkedTicket, raw.linkedTicket)
  )
    ? safeObject(first(base.linkedTicket, source.linkedTicket, raw.linkedTicket))
    : incidenciaPayload;

  return {
    ...base,

    ticketId: incidenciaId,
    incidenciaId,

    relatedTicketId: safeText(
      first(
        base.relatedTicketId,
        source.relatedTicketId,
        raw.relatedTicketId,
        incidenciaId
      ),
      incidenciaId
    ),

    relatedIncidentId: safeText(
      first(
        base.relatedIncidentId,
        source.relatedIncidentId,
        raw.relatedIncidentId,
        incidenciaId
      ),
      incidenciaId
    ),

    supportTicketId: safeText(
      first(
        base.supportTicketId,
        source.supportTicketId,
        raw.supportTicketId,
        incidenciaId
      ),
      incidenciaId
    ),

    caseId: safeText(
      first(
        base.caseId,
        source.caseId,
        raw.caseId,
        incidenciaId
      ),
      incidenciaId
    ),

    incidencia: incidenciaPayload,
    ticket: ticketObject,
    linkedTicket: linkedTicketObject,

    relationType: safeText(
      first(
        base.relationType,
        source.relationType,
        raw.relationType,
        incidenciaPayload?.relationType,
        "linked_ticket"
      ),
      "linked_ticket"
    ),

    meta: {
      ...safeObject(source.meta),
      ...safeObject(base.meta),
      hasIncidencia: true,
      incidenciaId,
      ticketId: incidenciaId,
    },

    raw: {
      ...raw,

      ticketId: safeText(first(raw.ticketId, incidenciaId), incidenciaId),
      incidenciaId: safeText(first(raw.incidenciaId, incidenciaId), incidenciaId),

      relatedTicketId: safeText(
        first(raw.relatedTicketId, incidenciaId),
        incidenciaId
      ),

      relatedIncidentId: safeText(
        first(raw.relatedIncidentId, incidenciaId),
        incidenciaId
      ),

      incidencia: hasOwnKeys(raw.incidencia)
        ? {
            ...incidenciaPayload,
            ...raw.incidencia,
            id: safeText(first(raw.incidencia?.id, incidenciaId), incidenciaId),
            ticketId: safeText(
              first(raw.incidencia?.ticketId, incidenciaId),
              incidenciaId
            ),
            incidenciaId: safeText(
              first(raw.incidencia?.incidenciaId, incidenciaId),
              incidenciaId
            ),
          }
        : incidenciaPayload,

      ticket: hasOwnKeys(raw.ticket)
        ? {
            ...incidenciaPayload,
            ...raw.ticket,
            id: safeText(first(raw.ticket?.id, incidenciaId), incidenciaId),
            ticketId: safeText(
              first(raw.ticket?.ticketId, incidenciaId),
              incidenciaId
            ),
            incidenciaId: safeText(
              first(raw.ticket?.incidenciaId, incidenciaId),
              incidenciaId
            ),
          }
        : incidenciaPayload,
    },
  };
}

/* =========================================================
   DETAIL NORMALIZATION
========================================================= */

function normalizeFacturaDetail(detail = {}) {
  const source = safeObject(detail);
  const raw = {
    ...safeObject(source.raw),
  };

  const facturaId = getFacturaId(source);

  const normalized = {
    ...source,

    id: facturaId,
    facturaId,

    numero: getFacturaNumber(source),

    cliente: isObject(source.cliente)
      ? source.cliente
      : isObject(source.client)
        ? source.client
        : isObject(source.customer)
          ? source.customer
          : {
              empresa: getFacturaClient(source),
              nombre: getFacturaClient(source),
              email: getFacturaEmail(source),
            },

    fecha: getFacturaDate(source),
    estadoPago: getFacturaEstadoPago(source),
    estado: getFacturaEstado(source),
    formaPago: getFacturaFormaPago(source),
    moneda: getFacturaMoneda(source),
    total: getFacturaTotal(source),
    enviadoA: getFacturaSentTo(source),
    fechaEnvio: getFacturaSentAt(source),

    raw,
  };

  return preserveFacturaIncidenciaFields(normalized, source);
}

/* =========================================================
   INCIDENCIA OPEN PAYLOAD
========================================================= */

function buildIncidenciaOpenPayload({
  factura = {},
  ticketId = "",
} = {}) {
  const item = normalizeFacturaDetail(factura);
  const relation = getRelationObject(item);

  const id = safeText(
    first(
      ticketId,
      getFacturaIncidenciaId(item),
      relation.ticketId,
      relation.incidenciaId,
      relation.id
    ),
    ""
  );

  if (!id) {
    return null;
  }

  const facturaId = getFacturaId(item);
  const facturaNumero = getFacturaNumber(item);
  const clientName = getFacturaClient(item);
  const clientEmail = getFacturaEmail(item);

  const subject = safeText(
    first(
      relation.subject,
      relation.asunto,
      relation.title,
      facturaNumero
        ? `Incidencia vinculada a factura ${facturaNumero}`
        : `Incidencia ${id}`
    ),
    `Incidencia ${id}`
  );

  return {
    id,
    ticketId: id,
    incidenciaId: id,
    code: id,
    ticketCode: id,

    title: subject,
    subject,
    asunto: subject,

    status: safeText(
      first(
        relation.status,
        relation.estado,
        "open"
      ),
      "open"
    ),

    estado: safeText(
      first(
        relation.estado,
        relation.status,
        "open"
      ),
      "open"
    ),

    priority: safeText(
      first(
        relation.priority,
        relation.prioridad,
        "medium"
      ),
      "medium"
    ),

    prioridad: safeText(
      first(
        relation.prioridad,
        relation.priority,
        "medium"
      ),
      "medium"
    ),

    description: safeText(
      first(
        relation.description,
        relation.descripcion,
        relation.message,
        relation.preview,
        facturaNumero
          ? `Incidencia relacionada con la factura ${facturaNumero}.`
          : "Incidencia relacionada con una factura."
      ),
      "Incidencia relacionada con una factura."
    ),

    clientName,
    clienteNombre: clientName,

    cliente: {
      id: safeText(first(item.clienteId, item.cliente?.id), ""),
      nombre: clientName,
      name: clientName,
      email: clientEmail,
      avatar: safeText(first(item.cliente?.avatar, relation.clienteAvatar), ""),
    },

    client: {
      id: safeText(first(item.clienteId, item.cliente?.id), ""),
      name: clientName,
      email: clientEmail,
      avatar: safeText(first(item.cliente?.avatar, relation.clienteAvatar), ""),
    },

    facturaId,
    invoiceId: facturaId,
    factura: facturaNumero || facturaId,
    invoiceCode: facturaNumero || facturaId,
    facturaRelacionada: facturaNumero || facturaId,

    createdAt: first(
      relation.createdAt,
      item.createdAt,
      item.fecha,
      null
    ),

    updatedAt: first(
      relation.updatedAt,
      relation.linkedAt,
      item.updatedAt,
      item.fechaEnvio,
      null
    ),

    attachments: first(
      relation.attachments,
      relation.files,
      relation.adjuntos,
      []
    ),

    comments: first(
      relation.comments,
      relation.messages,
      relation.notes,
      []
    ),

    history: first(
      relation.history,
      relation.timeline,
      relation.events,
      []
    ),

    raw: {
      ...relation,

      id,
      ticketId: id,
      incidenciaId: id,
      code: id,
      ticketCode: id,

      facturaId,
      invoiceId: facturaId,
      facturaRelacionada: facturaNumero || facturaId,

      clienteNombre: clientName,

      factura: {
        id: facturaId,
        numero: facturaNumero,
      },

      invoice: {
        id: facturaId,
        code: facturaNumero,
      },
    },
  };
}

/* =========================================================
   CSV HELPERS
========================================================= */

function escapeCsvCell(value = "") {
  const text =
    value === null || value === undefined
      ? ""
      : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvRows(items = []) {
  const header = [
    "id",
    "numero",
    "cliente",
    "email",
    "fecha",
    "estadoPago",
    "estado",
    "formaPago",
    "total",
    "moneda",
    "enviadoA",
    "fechaEnvio",
    "ticketId",
    "incidenciaId",
    "incidenciaAsunto",
  ];

  const rows = safeArray(items).map((item) => {
    const normalized = normalizeFacturaDetail(item);
    const incidencia = safeObject(normalized.incidencia);

    return [
      getFacturaId(normalized),
      getFacturaNumber(normalized),
      getFacturaClient(normalized),
      getFacturaEmail(normalized),
      getFacturaDate(normalized) || "",
      getFacturaEstadoPago(normalized),
      getFacturaEstado(normalized),
      getFacturaFormaPago(normalized),
      getFacturaTotal(normalized),
      getFacturaMoneda(normalized),
      getFacturaSentTo(normalized),
      getFacturaSentAt(normalized) || "",
      normalized.ticketId || "",
      normalized.incidenciaId || "",
      safeText(first(incidencia.asunto, incidencia.subject), ""),
    ];
  });

  return [
    header.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\n");
}

async function writeClipboardText(text = "") {
  const value = safeText(text, "");

  if (!value) {
    return false;
  }

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}

  try {
    const textarea = document.createElement("textarea");

    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const ok = document.execCommand("copy");

    textarea.remove();

    return Boolean(ok);
  } catch {
    return false;
  }
}

function downloadTextFile({
  filename = "",
  content = "",
  mimeType = "text/plain;charset=utf-8;",
} = {}) {
  const blob = new Blob([String(content || "")], {
    type: mimeType,
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);

  return true;
}

/* =========================================================
   DETAIL ACTIONS
========================================================= */

export function getFacturaDetailFromStoreAction({
  facturaId = "",
} = {}) {
  const id = normalizeFacturaId(facturaId);

  if (!id) {
    return null;
  }

  try {
    const detail = getFacturaByIdStore(id);
    const picked = pickDetail(detail);

    if (!picked) {
      return null;
    }

    return normalizeFacturaDetail(picked);
  } catch {
    return null;
  }
}

export async function getFacturaDetailAction({
  facturaId = "",
  loadFacturaDetail,
  preferFresh = true,
  silent = false,
} = {}) {
  const id = normalizeFacturaId(facturaId);

  if (!id) {
    if (!silent) {
      showToast("No se pudo resolver la factura.", "error");
    }

    return null;
  }

  const fallbackStoreDetail = getFacturaDetailFromStoreAction({
    facturaId: id,
  });

  if (!preferFresh && fallbackStoreDetail) {
    return fallbackStoreDetail;
  }

  try {
    safeEmit("facturas:detail:request", {
      facturaId: id,
      source: typeof loadFacturaDetail === "function" ? "loader" : "store",
    });

    let detail = null;

    if (typeof loadFacturaDetail === "function") {
      detail = await loadFacturaDetail(id);
    } else {
      detail = fallbackStoreDetail;
    }

    const picked = pickDetail(detail);

    if (!picked) {
      if (fallbackStoreDetail) {
        safeEmit("facturas:detail:fallback", {
          facturaId: id,
          source: "store",
        });

        return fallbackStoreDetail;
      }

      throw new Error("EMPTY_FACTURA_DETAIL");
    }

    const normalized = normalizeFacturaDetail(picked);

    safeEmit("facturas:detail:success", {
      facturaId: id,
      source: typeof loadFacturaDetail === "function" ? "loader" : "store",
      detail: normalized,
    });

    return normalized;
  } catch (error) {
    if (fallbackStoreDetail) {
      safeEmit("facturas:detail:fallback", {
        facturaId: id,
        source: "store",
        error,
      });

      return fallbackStoreDetail;
    }

    safeEmit("facturas:detail:error", {
      facturaId: id,
      error,
    });

    if (!silent) {
      showToast(
        safeErrorMessage(error, "No se pudo cargar el detalle de la factura."),
        "error"
      );
    }

    return null;
  }
}

export async function openFacturaAction({
  facturaId = "",
  loadFacturaDetail,
  preferFresh = true,
  silent = false,
} = {}) {
  const id = normalizeFacturaId(facturaId);

  if (!id) {
    if (!silent) {
      showToast("Factura inválida.", "error");
    }

    return null;
  }

  safeEmit("facturas:open", {
    facturaId: id,
  });

  const detail = await getFacturaDetailAction({
    facturaId: id,
    loadFacturaDetail,
    preferFresh,
    silent,
  });

  if (!detail) {
    return null;
  }

  safeEmit("facturas:open:success", {
    facturaId: id,
    detail,
  });

  return detail;
}

export async function refreshFacturaDetailAction({
  facturaId = "",
  loadFacturaDetail,
  silent = true,
} = {}) {
  return getFacturaDetailAction({
    facturaId,
    loadFacturaDetail,
    preferFresh: true,
    silent,
  });
}

/* =========================================================
   INCIDENCIA ACTION
========================================================= */

export async function openFacturaIncidenciaAction({
  facturaId = "",
  ticketId = "",
  incidenciaId = "",
  detail = null,
  silent = false,
} = {}) {
  const id = normalizeFacturaId(facturaId);

  const factura =
    isLikelyFactura(detail)
      ? normalizeFacturaDetail(detail)
      : id
        ? getFacturaDetailFromStoreAction({ facturaId: id })
        : null;

  const finalTicketId = safeText(
    first(
      ticketId,
      incidenciaId,
      getFacturaIncidenciaId(factura)
    ),
    ""
  );

  if (!finalTicketId) {
    if (!silent) {
      showToast(
        "No se pudo identificar la incidencia relacionada.",
        "error"
      );
    }

    return null;
  }

  const incidenciaDetail = buildIncidenciaOpenPayload({
    factura: factura || {},
    ticketId: finalTicketId,
  });

  if (!incidenciaDetail) {
    if (!silent) {
      showToast(
        "No se pudo preparar la incidencia relacionada.",
        "error"
      );
    }

    return null;
  }

  safeEmit("facturas:open-incidencia", {
    facturaId: id || getFacturaId(factura || {}),
    ticketId: finalTicketId,
    incidenciaId: finalTicketId,
    factura,
    detail: incidenciaDetail,
  });

  safeEmit("incidencias:modal:open", {
    ticketId: finalTicketId,
    incidenciaId: finalTicketId,
    detail: incidenciaDetail,
  });

  return incidenciaDetail;
}

/* =========================================================
   PDF INLINE
========================================================= */

export async function openFacturaPdfAction({
  facturaId = "",
  onStart,
  onEnd,
  silent = false,
} = {}) {
  const id = normalizeFacturaId(facturaId);

  if (!id) {
    if (!silent) {
      showToast("Factura inválida.", "error");
    }

    return null;
  }

  try {
    onStart?.(id);

    const response = await fetchFacturaPdfUrlRequest(id, "inline");

    const url = safeText(resolveFacturaPdfUrl(response), "");

    if (!url) {
      throw new Error("PDF_URL_MISSING");
    }

    window.open(url, "_blank", "noopener,noreferrer");

    safeEmit("facturas:pdf:opened", {
      facturaId: id,
      url,
    });

    if (!silent) {
      showToast("Abriendo PDF de la factura.", "success");
    }

    return response;
  } catch (error) {
    safeEmit("facturas:pdf:error", {
      facturaId: id,
      error,
      mode: "inline",
    });

    if (!silent) {
      showToast("No se pudo abrir el PDF.", "error");
    }

    return null;
  } finally {
    onEnd?.(id);
  }
}

/* =========================================================
   PDF DOWNLOAD
========================================================= */

export async function downloadFacturaPdfAction({
  facturaId = "",
  onStart,
  onEnd,
  silent = false,
} = {}) {
  const id = normalizeFacturaId(facturaId);

  if (!id) {
    if (!silent) {
      showToast("Factura inválida.", "error");
    }

    return null;
  }

  try {
    onStart?.(id);

    const response = await fetchFacturaPdfUrlRequest(id, "attachment");

    const url = safeText(resolveFacturaPdfUrl(response), "");

    if (!url) {
      throw new Error("DOWNLOAD_URL_MISSING");
    }

    window.open(url, "_blank", "noopener,noreferrer");

    safeEmit("facturas:pdf:download", {
      facturaId: id,
      url,
    });

    if (!silent) {
      showToast("Preparando descarga de factura.", "success");
    }

    return response;
  } catch (error) {
    safeEmit("facturas:pdf:error", {
      facturaId: id,
      error,
      mode: "download",
    });

    if (!silent) {
      showToast("No se pudo descargar la factura.", "error");
    }

    return null;
  } finally {
    onEnd?.(id);
  }
}

/* =========================================================
   SEND
========================================================= */

export async function sendFacturaToClientAction({
  facturaId = "",
  detail = null,
  onStart,
  onEnd,
  onSent,
  reloadFacturas,
  confirmSend = true,
  silent = false,
} = {}) {
  const id = normalizeFacturaId(facturaId);

  if (!id) {
    if (!silent) {
      showToast("Factura inválida.", "error");
    }

    return null;
  }

  const selectedDetail =
    resolveFacturaId(detail) === id
      ? detail
      : getFacturaByIdStore(id) || detail || {};

  const factura = normalizeFacturaDetail(selectedDetail);

  const targetEmail =
    factura?.cliente?.email ||
    factura?.enviadoA ||
    "el cliente";

  if (confirmSend) {
    const confirmed = window.confirm(
      `Se va a enviar la factura ${getFacturaNumber(factura)} a ${targetEmail}. ¿Continuar?`
    );

    if (!confirmed) {
      return null;
    }
  }

  try {
    onStart?.(id);

    const response = await sendFacturaRequest(id);

    onSent?.({
      facturaId: id,
      response,
      factura,
    });

    safeEmit("facturas:sent", {
      facturaId: id,
      response,
    });

    if (typeof reloadFacturas === "function") {
      await reloadFacturas();
    }

    if (!silent) {
      showToast("Factura enviada correctamente.", "success");
    }

    return response;
  } catch (error) {
    safeEmit("facturas:send:error", {
      facturaId: id,
      error,
    });

    if (!silent) {
      showToast("No se pudo enviar la factura.", "error");
    }

    return null;
  } finally {
    onEnd?.(id);
  }
}

/* =========================================================
   COPY
========================================================= */

export async function copyFacturaIdAction({
  facturaId = "",
  numero = "",
  silent = false,
} = {}) {
  const value =
    safeText(numero, "") ||
    safeText(facturaId, "");

  if (!value) {
    if (!silent) {
      showToast(
        "No se encontró identificador para copiar.",
        "info"
      );
    }

    return false;
  }

  const ok = await writeClipboardText(value);

  if (!ok) {
    if (!silent) {
      showToast(
        "No se pudo copiar el identificador.",
        "error"
      );
    }

    return false;
  }

  safeEmit("facturas:copied", {
    facturaId: safeText(facturaId, ""),
    numero: safeText(numero, ""),
    value,
  });

  if (!silent) {
    showToast("Identificador copiado.", "success");
  }

  return true;
}

/* =========================================================
   EXPORT CSV
========================================================= */

export function exportFacturasCsvAction({
  items = null,
  filenamePrefix = CSV_FILENAME_PREFIX,
  silent = false,
} = {}) {
  const list = Array.isArray(items)
    ? items
    : getSortedFacturasStore();

  const safeList = safeArray(list);

  if (!safeList.length) {
    if (!silent) {
      showToast("No hay facturas para exportar.", "info");
    }

    return false;
  }

  try {
    const csv = buildCsvRows(safeList);

    const filename = `${safeText(
      filenamePrefix,
      CSV_FILENAME_PREFIX
    )}_${new Date().toISOString().slice(0, 10)}.csv`;

    downloadTextFile({
      filename,
      content: csv,
      mimeType: "text/csv;charset=utf-8;",
    });

    safeEmit("facturas:exported", {
      total: safeList.length,
      filename,
      filenamePrefix: safeText(
        filenamePrefix,
        CSV_FILENAME_PREFIX
      ),
    });

    if (!silent) {
      showToast("Exportación CSV generada.", "success");
    }

    return true;
  } catch (error) {
    safeEmit("facturas:export:error", {
      type: "csv",
      error,
    });

    if (!silent) {
      showToast("No se pudo exportar el CSV.", "error");
    }

    return false;
  }
}

/* =========================================================
   HELPERS EXPORT
========================================================= */

export {
  getFacturaId as getFacturaIdAction,
  getFacturaNumber as getFacturaNumberAction,
  getFacturaClient as getFacturaClientAction,
  getFacturaEmail as getFacturaEmailAction,
  getFacturaDate as getFacturaDateAction,
  getFacturaEstadoPago as getFacturaEstadoPagoAction,
  getFacturaEstado as getFacturaEstadoAction,
  getFacturaFormaPago as getFacturaFormaPagoAction,
  getFacturaMoneda as getFacturaMonedaAction,
  getFacturaTotal as getFacturaTotalAction,
  getFacturaIncidenciaId as getFacturaIncidenciaIdAction,
  buildIncidenciaOpenPayload as buildFacturaIncidenciaOpenPayloadAction,
  normalizeFacturaDetail as normalizeFacturaDetailAction,
};

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  getFacturaDetailFromStoreAction,
  getFacturaDetailAction,
  openFacturaAction,
  refreshFacturaDetailAction,

  openFacturaIncidenciaAction,

  openFacturaPdfAction,
  downloadFacturaPdfAction,
  sendFacturaToClientAction,
  copyFacturaIdAction,
  exportFacturasCsvAction,

  getFacturaIncidenciaIdAction: getFacturaIncidenciaId,
  buildFacturaIncidenciaOpenPayloadAction: buildIncidenciaOpenPayload,
  normalizeFacturaDetailAction: normalizeFacturaDetail,
};
