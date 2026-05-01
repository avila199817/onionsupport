/* =========================================================
   Onion SPA - Facturas Actions
   Archivo: src/views/facturas/facturas.actions.js

   FINAL PRO SYSTEM · ACTIONS REAL · 10/10 EXTREME
   PATCH · API ALIGNED · PDF SAS SAFE · CSV PRO · INCIDENCIA SAFE

   RESPONSABILIDADES:
   - centralizar acciones operativas del módulo de facturas
   - resolver detalle desde store + loader/backend
   - abrir detalle a nivel de datos, no de UI
   - preservar relación factura ↔ incidencia
   - abrir PDF inline usando fetch autenticado + URL SAS devuelta por backend
   - descargar PDF usando fetch autenticado + URL SAS devuelta por backend
   - bloquear fallback directo a endpoint privado para evitar MISSING_TOKEN
   - soportar respuestas PDF como URL / Blob / Response / stream adaptado
   - enviar factura al cliente por endpoint real
   - copiar identificadores
   - exportar colección a CSV pro
   - desacoplar facturasView.js de la lógica operativa

   BACKEND ALINEADO:
   - GET  /api/facturas/:id
   - GET  /api/facturas/:id/pdf
   - GET  /api/facturas/:id/descargar
   - POST /api/facturas/:id/enviar

   HARDENING:
   - no navegación a rutas inexistentes de incidencia
   - apertura PDF con ventana preabierta para evitar popup blockers
   - descarga con anchor seguro
   - NUNCA abrir /api/facturas/:id/pdf directamente en pestaña nueva
   - el endpoint privado se consume con apiClient autenticado
   - la pestaña nueva solo abre blob: o SAS/public URL final
   - eventos AppCore + window
   - tolerancia a payloads heterogéneos
   - CSV con BOM + sep=; para Excel ES
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  fetchFacturaPdfUrlRequest,
  sendFacturaRequest,
  resolveFacturaPdfUrl,
  buildFacturaPdfEndpoint,
  FACTURAS_DISPOSITIONS,
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

const PDF_OBJECT_URL_REVOKE_MS = 120000;
const DOWNLOAD_OBJECT_URL_REVOKE_MS = 15000;

const FACTURA_SENT_EVENTS = Object.freeze([
  "facturas:sent",
  "facturas:send:success",
  "invoice:sent",
]);

const FACTURA_PDF_EVENTS = Object.freeze({
  OPEN_REQUEST: "facturas:pdf:open:request",
  OPEN_SUCCESS: "facturas:pdf:opened",
  DOWNLOAD_REQUEST: "facturas:pdf:download:request",
  DOWNLOAD_SUCCESS: "facturas:pdf:download",
  ERROR: "facturas:pdf:error",
});

/* =========================================================
   BASE HELPERS
========================================================= */

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

function normalizeFacturaId(value = "") {
  return safeText(value, "");
}

function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function safeDateIso(value = null) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString();
}

function safeDateLabel(value = null) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return safeDateIso(value);
  }
}

function round2(value = 0) {
  return Math.round((safeNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

function safeEmit(eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) return false;

  let emitted = false;

  try {
    AppCore?.events?.emit?.(name, payload);
    emitted = true;
  } catch {}

  try {
    window.dispatchEvent(
      new CustomEvent(name, {
        detail: payload,
      })
    );
    emitted = true;
  } catch {}

  return emitted;
}

function safeEmitMany(events = [], payload = {}) {
  safeArray(events).forEach((eventName) => {
    safeEmit(eventName, payload);
  });
}

function safeLog(...args) {
  try {
    AppCore?.utils?.log?.("[FacturasActions]", ...args);
  } catch {}
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[FacturasActions]", ...args);
  } catch {
    try {
      console.warn("[FacturasActions]", ...args);
    } catch {}
  }
}

function safeErrorMessage(error = null, fallback = "") {
  return safeText(
    first(
      error?.data?.message,
      error?.response?.data?.message,
      error?.response?.message,
      error?.response?.error,
      error?.payload?.message,
      error?.result?.message,
      error?.message,
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
      error?.code,
      error?.response?.status,
      error?.response?.statusCode,
      error?.data?.status,
      error?.payload?.status
    ),
    0
  );
}

function isFatalHttpError(error = null) {
  const status = getErrorStatus(error);

  return status >= 400 && status < 600;
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
      value.invoiceNumber ||
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
      obj.record ||
      obj.data ||
      obj.result ||
      obj.payload ||
      obj.body ||
      obj.response
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

  const direct = first(
    obj.factura,
    obj.item,
    obj.record,
    obj.data?.factura,
    obj.data?.item,
    obj.data?.record,
    obj.result?.factura,
    obj.result?.item,
    obj.result?.record,
    obj.payload?.factura,
    obj.payload?.item,
    obj.payload?.record
  );

  if (isLikelyFactura(direct)) {
    return direct;
  }

  const nested = first(
    obj.data,
    obj.result,
    obj.payload,
    obj.body,
    obj.response
  );

  if (looksLikeEnvelope(nested)) {
    return pickDetail(nested);
  }

  if (isLikelyFactura(nested)) {
    return nested;
  }

  return null;
}

/* =========================================================
   API URL HELPERS
========================================================= */

function getApiBase() {
  return safeText(
    first(
      AppCore?.config?.apiBase,
      AppCore?.config?.api?.baseUrl,
      AppCore?.state?.apiBase,
      window?.ONION_API_BASE,
      window?.API_BASE
    ),
    ""
  ).replace(/\/+$/, "");
}

function resolveApiUrl(path = "") {
  const value = safeText(path, "");

  if (!value) return "";

  if (/^https?:\/\//i.test(value) || value.startsWith("blob:")) {
    return value;
  }

  const apiBase = getApiBase();

  if (!apiBase) {
    return value.startsWith("/") ? value : `/${value}`;
  }

  const normalizedPath = value.startsWith("/") ? value : `/${value}`;

  if (apiBase.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${apiBase}${normalizedPath.slice(4)}`;
  }

  return `${apiBase}${normalizedPath}`;
}

function isPrivateFacturaPdfEndpoint(url = "") {
  const value = safeText(url, "");

  if (!value || value.startsWith("blob:")) {
    return false;
  }

  try {
    const parsed = new URL(value, window.location.origin);
    const pathname = parsed.pathname || "";

    return (
      pathname.includes("/api/facturas/") &&
      (
        pathname.endsWith("/pdf") ||
        pathname.includes("/pdf/") ||
        pathname.endsWith("/descargar") ||
        pathname.includes("/descargar/") ||
        pathname.endsWith("/download") ||
        pathname.includes("/download/")
      )
    );
  } catch {
    return (
      value.includes("/api/facturas/") &&
      (
        value.includes("/pdf") ||
        value.includes("/descargar") ||
        value.includes("/download")
      )
    );
  }
}

function assertPublicPdfTarget(url = "") {
  const value = safeText(url, "");

  if (!value) {
    return "";
  }

  if (isPrivateFacturaPdfEndpoint(value)) {
    return "";
  }

  return value;
}

/* =========================================================
   FACTURA FIELD HELPERS
========================================================= */

function getRaw(item = {}) {
  const source = safeObject(item);

  return safeObject(source.raw);
}

function getFacturaId(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return safeText(
    first(
      source.id,
      source._id,
      source.facturaId,
      source.invoiceId,
      source.numeroFacturaLegal,
      source.numeroFacturaSistema,
      source.numero,
      source.invoiceNumber,

      raw.id,
      raw._id,
      raw.facturaId,
      raw.invoiceId,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema,
      raw.numero,
      raw.invoiceNumber
    ),
    ""
  );
}

function resolveFacturaId(detail = null) {
  return getFacturaId(detail);
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
      source.numeroFactura,
      source.numeroFacturaSistema,
      source.invoiceNumber,
      source.facturaId,
      source.invoiceId,
      source.id,

      raw.numero,
      raw.code,
      raw.facturaCode,
      raw.facturaNumero,
      raw.numeroFacturaLegal,
      raw.numeroFactura,
      raw.numeroFacturaSistema,
      raw.invoiceNumber,
      raw.facturaId,
      raw.invoiceId,
      raw.id
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
    source.clienteSnapshot,
    raw.cliente,
    raw.client,
    raw.customer,
    raw.clienteSnapshot
  );

  return isObject(client) ? client : {};
}

function getFacturaClient(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);
  const client = getFacturaClientObject(source);

  if (hasOwnKeys(client)) {
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

  if (hasOwnKeys(client)) {
    return safeText(
      first(
        client.email,
        client.emailLower,
        client.mail,
        client.emailFacturacion,
        client.emailAdministracion
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
    source.issuedAt,
    source.createdAt,
    source.updatedAt,

    raw.fecha,
    raw.date,
    raw.fechaFactura,
    raw.issueDate,
    raw.issuedAt,
    raw.createdAt,
    raw.updatedAt
  );
}

function getFacturaUpdatedAt(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return first(
    source.updatedAt,
    source.fechaEnvio,
    source.sentAt,
    source.mailSentAt,
    source.delivery?.lastSentAt,
    source.createdAt,

    raw.updatedAt,
    raw.fechaEnvio,
    raw.sentAt,
    raw.mailSentAt,
    raw.delivery?.lastSentAt,
    raw.createdAt
  );
}

function getFacturaEstadoPago(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return safeText(
    first(
      source.estadoPago,
      source.paymentStatus,
      source.payment?.status,
      raw.estadoPago,
      raw.paymentStatus,
      raw.payment?.status
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
      source.payment?.method,

      raw.formaPago,
      raw.metodoPago,
      raw.paymentMethod,
      raw.payment?.method
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
      source.facturaCurrency,

      raw.moneda,
      raw.currency,
      raw.facturaCurrency
    ),
    "EUR"
  );
}

function getFacturaTotal(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return round2(
    first(
      source.total,
      source.amount,
      source.importe,
      source.importeTotal,
      source.totalFactura,
      source.invoiceAmount,
      source.facturaTotal,
      source.totals?.total,
      source.resumen?.total,

      raw.total,
      raw.amount,
      raw.importe,
      raw.importeTotal,
      raw.totalFactura,
      raw.invoiceAmount,
      raw.facturaTotal,
      raw.totals?.total,
      raw.resumen?.total
    )
  );
}

function getFacturaSentTo(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  return safeText(
    first(
      source.enviadoA,
      source.sentTo,
      source.delivery?.lastSentTo,
      source.cliente?.email,
      source.client?.email,
      source.customer?.email,

      raw.enviadoA,
      raw.sentTo,
      raw.delivery?.lastSentTo,
      raw.cliente?.email,
      raw.client?.email,
      raw.customer?.email
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
    source.delivery?.lastSentAt,

    raw.fechaEnvio,
    raw.sentAt,
    raw.mailSentAt,
    raw.delivery?.lastSentAt
  );
}

function isFacturaSent(item = {}) {
  return Boolean(getFacturaSentAt(item) || getFacturaSentTo(item));
}

function hasFacturaPdf(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  if (
    first(
      source.hasPdf,
      source.pdfAvailable,
      source.blobPath,
      source.blobName,
      source.pdfPath,
      source.pdfUrl,
      source.downloadUrl,
      source.viewUrl,

      raw.hasPdf,
      raw.pdfAvailable,
      raw.blobPath,
      raw.blobName,
      raw.pdfPath,
      raw.pdfUrl,
      raw.downloadUrl,
      raw.viewUrl
    )
  ) {
    return true;
  }

  const files = safeArray(
    first(
      source.attachments,
      source.files,
      source.adjuntos,
      raw.attachments,
      raw.files,
      raw.adjuntos
    )
  );

  return files.some((file) => {
    const itemFile = safeObject(file);

    const type = normalizeText(
      first(
        itemFile.contentType,
        itemFile.mimeType,
        itemFile.mimetype,
        itemFile.type
      )
    );

    const name = normalizeText(
      first(
        itemFile.name,
        itemFile.filename,
        itemFile.fileName,
        itemFile.url,
        itemFile.path
      )
    );

    return type.includes("pdf") || name.endsWith(".pdf");
  });
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
      item.caseId,

      item.ticket?.ticketId,
      item.ticket?.incidenciaId,
      item.ticket?.id,

      item.incidencia?.ticketId,
      item.incidencia?.incidenciaId,
      item.incidencia?.id
    );

    if (candidate) {
      return safeText(candidate, "");
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
      source.relatedTicket,
      source.relations?.ticket,
      source.relations?.incidencia,

      raw.incidencia,
      raw.ticket,
      raw.linkedTicket,
      raw.relatedTicket,
      raw.relations?.ticket,
      raw.relations?.incidencia
    )
  );
}

function getFacturaIncidenciaId(item = {}) {
  const source = safeObject(item);
  const raw = getRaw(source);

  const incidencia = safeObject(first(source.incidencia, raw.incidencia));
  const ticket = safeObject(first(source.ticket, raw.ticket));
  const linkedTicket = safeObject(first(source.linkedTicket, raw.linkedTicket));
  const relationTicket = safeObject(first(source.relations?.ticket, raw.relations?.ticket));
  const relationIncidencia = safeObject(first(source.relations?.incidencia, raw.relations?.incidencia));

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

      relationTicket.ticketId,
      relationTicket.id,
      relationTicket.incidenciaId,

      relationIncidencia.ticketId,
      relationIncidencia.id,
      relationIncidencia.incidenciaId,

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

      raw.relations?.ticket?.ticketId,
      raw.relations?.ticket?.id,
      raw.relations?.ticket?.incidenciaId,

      raw.relations?.incidencia?.ticketId,
      raw.relations?.incidencia?.id,
      raw.relations?.incidencia?.incidenciaId,

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
  const relationTicket = safeObject(first(source.relations?.ticket, raw.relations?.ticket));

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

  const subject = safeText(
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

      relationTicket.subject,
      relationTicket.asunto,
      relationTicket.title,

      source.subject,
      source.asunto,
      raw.subject,
      raw.asunto
    ),
    ""
  );

  return {
    ...incidencia,

    id: incidenciaId,
    ticketId: incidenciaId,
    incidenciaId,
    code: safeText(first(incidencia.code, ticket.code, linkedTicket.code, incidenciaId), incidenciaId),
    ticketCode: safeText(first(incidencia.ticketCode, ticket.ticketCode, linkedTicket.ticketCode, incidenciaId), incidenciaId),

    subject,
    asunto: safeText(first(incidencia.asunto, subject), subject),
    title: safeText(first(incidencia.title, subject), subject),

    clienteId: safeText(
      first(
        incidencia.clienteId,
        ticket.clienteId,
        linkedTicket.clienteId,
        relationTicket.clienteId,
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

        relationTicket.clienteNombre,
        relationTicket.name,
        relationTicket.nombre,

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
        relationTicket.relationType,
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
        relationTicket.linkedAt,
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
        relationTicket.linkedAtES,
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
        ...safeObject(source.meta),
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

      supportTicketId: safeText(
        first(raw.supportTicketId, incidenciaId),
        incidenciaId
      ),

      caseId: safeText(
        first(raw.caseId, incidenciaId),
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

      linkedTicket: hasOwnKeys(raw.linkedTicket)
        ? {
            ...incidenciaPayload,
            ...raw.linkedTicket,
            id: safeText(first(raw.linkedTicket?.id, incidenciaId), incidenciaId),
            ticketId: safeText(
              first(raw.linkedTicket?.ticketId, incidenciaId),
              incidenciaId
            ),
            incidenciaId: safeText(
              first(raw.linkedTicket?.incidenciaId, incidenciaId),
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

  const client =
    isObject(source.cliente)
      ? source.cliente
      : isObject(source.client)
        ? source.client
        : isObject(source.customer)
          ? source.customer
          : {
              empresa: getFacturaClient(source),
              nombre: getFacturaClient(source),
              nombreContacto: getFacturaClient(source),
              name: getFacturaClient(source),
              email: getFacturaEmail(source),
              emailLower: getFacturaEmail(source),
            };

  const normalized = {
    ...source,

    id: facturaId,
    facturaId,
    invoiceId: safeText(first(source.invoiceId, raw.invoiceId, facturaId), facturaId),

    numero: getFacturaNumber(source),
    numeroFactura: safeText(first(source.numeroFactura, source.numeroFacturaLegal, raw.numeroFactura, raw.numeroFacturaLegal, getFacturaNumber(source)), getFacturaNumber(source)),
    numeroFacturaLegal: safeText(first(source.numeroFacturaLegal, raw.numeroFacturaLegal, getFacturaNumber(source)), getFacturaNumber(source)),
    numeroFacturaSistema: safeText(first(source.numeroFacturaSistema, raw.numeroFacturaSistema), ""),

    cliente: client,

    clienteId: safeText(first(source.clienteId, source.cliente?.id, raw.clienteId, raw.cliente?.id), ""),
    userId: safeText(first(source.userId, raw.userId), ""),

    fecha: getFacturaDate(source),
    fechaFactura: first(source.fechaFactura, raw.fechaFactura, getFacturaDate(source)) || null,
    updatedAt: first(source.updatedAt, raw.updatedAt, getFacturaUpdatedAt(source)) || null,

    estadoPago: getFacturaEstadoPago(source),
    estado: getFacturaEstado(source),

    formaPago: getFacturaFormaPago(source),
    metodoPago: safeText(first(source.metodoPago, source.formaPago, raw.metodoPago, raw.formaPago, getFacturaFormaPago(source)), "—"),

    moneda: getFacturaMoneda(source),
    currency: getFacturaMoneda(source),

    total: getFacturaTotal(source),
    amount: getFacturaTotal(source),
    importe: getFacturaTotal(source),

    enviadoA: getFacturaSentTo(source),
    fechaEnvio: getFacturaSentAt(source) || null,

    hasPdf: hasFacturaPdf(source),

    meta: {
      ...safeObject(source.meta),
      hasPdf: hasFacturaPdf(source),
      isSent: isFacturaSent(source),
    },

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

    message: safeText(
      first(
        relation.message,
        relation.description,
        relation.descripcion,
        ""
      ),
      ""
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
   PDF RESPONSE HELPERS
========================================================= */

function isBlob(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function isArrayBuffer(value) {
  return typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer;
}

function isTypedArray(value) {
  return Boolean(
    value &&
      typeof ArrayBuffer !== "undefined" &&
      ArrayBuffer.isView?.(value)
  );
}

function isResponseLike(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.blob === "function" &&
      typeof value.headers === "object"
  );
}

function getPayloadCandidates(payload = null) {
  const obj = safeObject(payload, null);

  if (!obj) {
    return [payload].filter((item) => item !== undefined && item !== null);
  }

  return [
    payload,

    obj.file,
    obj.blob,
    obj.body,
    obj.data,
    obj.result,
    obj.payload,
    obj.response,

    obj.data?.file,
    obj.data?.blob,
    obj.data?.body,
    obj.data?.result,
    obj.data?.payload,

    obj.result?.file,
    obj.result?.blob,
    obj.result?.body,
    obj.result?.payload,

    obj.payload?.file,
    obj.payload?.blob,
    obj.payload?.body,
    obj.payload?.result,
  ].filter((item) => item !== undefined && item !== null);
}

async function extractBlobFromPayload(payload = null) {
  const candidates = getPayloadCandidates(payload);

  for (const candidate of candidates) {
    if (isBlob(candidate)) {
      return candidate;
    }

    if (isArrayBuffer(candidate)) {
      return new Blob([candidate], {
        type: "application/pdf",
      });
    }

    if (isTypedArray(candidate)) {
      return new Blob([candidate.buffer], {
        type: "application/pdf",
      });
    }

    if (isResponseLike(candidate)) {
      try {
        return await candidate.blob();
      } catch {}
    }
  }

  return null;
}

function extractUrlFromPayload(payload = null) {
  const direct = safeText(resolveFacturaPdfUrl(payload), "");

  if (direct) {
    return resolveApiUrl(direct);
  }

  const candidates = getPayloadCandidates(payload);

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const value = safeText(candidate, "");

      if (
        value.startsWith("blob:") ||
        /^https?:\/\//i.test(value) ||
        value.startsWith("/api/") ||
        value.startsWith("/facturas/") ||
        value.startsWith("/router/")
      ) {
        return resolveApiUrl(value);
      }
    }

    const obj = safeObject(candidate, null);

    if (!obj) continue;

    const url = safeText(
      first(
        obj.url,
        obj.href,
        obj.downloadUrl,
        obj.viewUrl,
        obj.pdfUrl,
        obj.publicUrl,
        obj.sasUrl,
        obj.signedUrl,
        obj.location
      ),
      ""
    );

    if (url) {
      return resolveApiUrl(url);
    }
  }

  return "";
}

function scheduleObjectUrlRevoke(url = "", delayMs = PDF_OBJECT_URL_REVOKE_MS) {
  const value = safeText(url, "");

  if (!value || !value.startsWith("blob:")) {
    return false;
  }

  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(value);
    } catch {}
  }, delayMs);

  return true;
}

function buildSafePdfFilename(facturaId = "", detail = null) {
  const factura = detail ? normalizeFacturaDetail(detail) : null;

  const numero = safeText(
    first(
      factura ? getFacturaNumber(factura) : "",
      facturaId,
      "factura"
    ),
    "factura"
  );

  const cliente = safeText(
    factura ? getFacturaClient(factura) : "",
    "cliente"
  );

  const slug = `${numero}__${cliente}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);

  return `${slug || "factura"}.pdf`;
}

function preopenBlankWindow() {
  try {
    const popup = window.open("about:blank", "_blank", "noopener,noreferrer");

    if (popup) {
      try {
        popup.document.title = "Abriendo factura…";
        popup.document.body.innerHTML = `
          <div style="
            min-height:100vh;
            display:grid;
            place-items:center;
            margin:0;
            font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
            background:#0f172a;
            color:#e5e7eb;
          ">
            <div style="text-align:center">
              <div style="font-weight:800;font-size:18px;margin-bottom:8px;">Abriendo factura…</div>
              <div style="font-size:13px;color:#94a3b8;">Preparando PDF</div>
            </div>
          </div>
        `;
      } catch {}
    }

    return popup || null;
  } catch {
    return null;
  }
}

function closePreopenedWindow(popup = null) {
  try {
    if (popup && !popup.closed) {
      popup.close();
      return true;
    }
  } catch {}

  return false;
}

function openUrlInNewTab(url = "", popup = null) {
  const finalUrl = assertPublicPdfTarget(url);

  if (!finalUrl) {
    return false;
  }

  try {
    if (popup && !popup.closed) {
      popup.location.href = finalUrl;
      return true;
    }
  } catch {}

  try {
    const opened = window.open(finalUrl, "_blank", "noopener,noreferrer");
    return Boolean(opened);
  } catch {}

  return false;
}

function triggerDownloadUrl(url = "", filename = "") {
  const finalUrl = assertPublicPdfTarget(url);
  const finalFilename = safeText(filename, "factura.pdf");

  if (!finalUrl) {
    return false;
  }

  try {
    const anchor = document.createElement("a");

    anchor.href = finalUrl;
    anchor.download = finalFilename;
    anchor.rel = "noopener noreferrer";
    anchor.target = "_blank";

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    return true;
  } catch {
    try {
      window.open(finalUrl, "_blank", "noopener,noreferrer");
      return true;
    } catch {}
  }

  return false;
}

async function resolvePdfActionTarget({
  facturaId = "",
  disposition = FACTURAS_DISPOSITIONS.ATTACHMENT,
  detail = null,
} = {}) {
  const id = normalizeFacturaId(facturaId);

  const mode =
    disposition === FACTURAS_DISPOSITIONS.INLINE
      ? FACTURAS_DISPOSITIONS.INLINE
      : FACTURAS_DISPOSITIONS.ATTACHMENT;

  const endpoint = buildFacturaPdfEndpoint(id, mode);
  const directUrl = resolveApiUrl(endpoint);

  let response = null;
  let requestError = null;

  try {
    response = await fetchFacturaPdfUrlRequest(id, mode, {
      responseType: "auto",
      raw: false,
      cache: "no-store",
      auth: true,
    });
  } catch (error) {
    requestError = error;

    if (isFatalHttpError(error)) {
      throw error;
    }

    safeWarn("PDF apiClient request failed:", error);
    throw error;
  }

  const extractedUrl = extractUrlFromPayload(response);
  const publicUrl = assertPublicPdfTarget(extractedUrl);

  if (publicUrl) {
    return {
      url: publicUrl,
      directUrl,
      response,
      requestError,
      isObjectUrl: publicUrl.startsWith("blob:"),
      from: "sas-url",
      filename: buildSafePdfFilename(id, detail),
    };
  }

  if (extractedUrl && isPrivateFacturaPdfEndpoint(extractedUrl)) {
    const error = new Error("FACTURA_PDF_PRIVATE_ENDPOINT_FALLBACK_BLOCKED");
    error.response = response;
    error.directUrl = directUrl;
    error.extractedUrl = extractedUrl;
    throw error;
  }

  const blob = await extractBlobFromPayload(response);

  if (blob && blob.size > 0) {
    const objectUrl = URL.createObjectURL(blob);

    return {
      url: objectUrl,
      directUrl,
      response,
      requestError,
      isObjectUrl: true,
      from: "blob",
      filename: buildSafePdfFilename(id, detail),
    };
  }

  const error = new Error("FACTURA_PDF_TARGET_MISSING");
  error.response = response;
  error.directUrl = directUrl;
  throw error;
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
    "fechaFactura",
    "fechaFacturaES",
    "estadoPago",
    "estado",
    "formaPago",
    "total",
    "moneda",
    "hasPdf",
    "enviada",
    "enviadoA",
    "fechaEnvio",
    "fechaEnvioES",
    "ticketId",
    "incidenciaId",
    "incidenciaAsunto",
  ];

  const rows = safeArray(items).map((item) => {
    const normalized = normalizeFacturaDetail(item);
    const incidencia = safeObject(normalized.incidencia);

    const fecha = getFacturaDate(normalized);
    const fechaEnvio = getFacturaSentAt(normalized);

    return [
      getFacturaId(normalized),
      getFacturaNumber(normalized),
      getFacturaClient(normalized),
      getFacturaEmail(normalized),
      safeDateIso(fecha),
      safeDateLabel(fecha),
      getFacturaEstadoPago(normalized),
      getFacturaEstado(normalized),
      getFacturaFormaPago(normalized),
      getFacturaTotal(normalized),
      getFacturaMoneda(normalized),
      hasFacturaPdf(normalized) ? "sí" : "no",
      isFacturaSent(normalized) ? "sí" : "no",
      getFacturaSentTo(normalized),
      safeDateIso(fechaEnvio),
      safeDateLabel(fechaEnvio),
      normalized.ticketId || "",
      normalized.incidenciaId || "",
      safeText(first(incidencia.asunto, incidencia.subject, incidencia.title), ""),
    ];
  });

  return [
    "sep=;",
    header.map(escapeCsvCell).join(";"),
    ...rows.map((row) => row.map(escapeCsvCell).join(";")),
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
    textarea.style.insetBlockStart = "-9999px";
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
  const blob = new Blob([`\uFEFF${String(content || "")}`], {
    type: mimeType,
  });

  const url = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    return true;
  } finally {
    scheduleObjectUrlRevoke(url, DOWNLOAD_OBJECT_URL_REVOKE_MS);
  }
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
  } catch (error) {
    safeWarn("getFacturaDetailFromStoreAction error:", error);
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
    safeEmit("facturas:open:error", {
      facturaId: id,
      error: "EMPTY_DETAIL",
    });

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
  detail = null,
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

  const popup = preopenBlankWindow();

  try {
    onStart?.(id);

    safeEmit(FACTURA_PDF_EVENTS.OPEN_REQUEST, {
      facturaId: id,
      mode: FACTURAS_DISPOSITIONS.INLINE,
    });

    const target = await resolvePdfActionTarget({
      facturaId: id,
      disposition: FACTURAS_DISPOSITIONS.INLINE,
      detail,
    });

    if (!target?.url) {
      throw new Error("PDF_TARGET_MISSING");
    }

    const opened = openUrlInNewTab(target.url, popup);

    if (!opened) {
      throw new Error("PDF_WINDOW_OPEN_FAILED");
    }

    if (target.isObjectUrl) {
      scheduleObjectUrlRevoke(target.url, PDF_OBJECT_URL_REVOKE_MS);
    }

    safeEmit(FACTURA_PDF_EVENTS.OPEN_SUCCESS, {
      facturaId: id,
      url: target.url,
      directUrl: target.directUrl,
      from: target.from,
      isObjectUrl: target.isObjectUrl,
      response: target.response,
    });

    safeLog("PDF opened:", {
      facturaId: id,
      from: target.from,
      isObjectUrl: target.isObjectUrl,
    });

    if (!silent) {
      showToast("Abriendo PDF de la factura.", "success");
    }

    return target.response || {
      ok: true,
      url: target.url,
      from: target.from,
    };
  } catch (error) {
    closePreopenedWindow(popup);

    safeEmit(FACTURA_PDF_EVENTS.ERROR, {
      facturaId: id,
      error,
      mode: FACTURAS_DISPOSITIONS.INLINE,
    });

    safeWarn("openFacturaPdfAction error:", {
      facturaId: id,
      message: error?.message || "UNKNOWN_ERROR",
      status: getErrorStatus(error),
      directUrl: error?.directUrl || "",
      extractedUrl: error?.extractedUrl || "",
    });

    if (!silent) {
      showToast(
        safeErrorMessage(error, "No se pudo abrir el PDF."),
        "error"
      );
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
  detail = null,
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

    safeEmit(FACTURA_PDF_EVENTS.DOWNLOAD_REQUEST, {
      facturaId: id,
      mode: FACTURAS_DISPOSITIONS.ATTACHMENT,
    });

    const storeDetail =
      detail ||
      getFacturaDetailFromStoreAction({
        facturaId: id,
      });

    const target = await resolvePdfActionTarget({
      facturaId: id,
      disposition: FACTURAS_DISPOSITIONS.ATTACHMENT,
      detail: storeDetail,
    });

    if (!target?.url) {
      throw new Error("DOWNLOAD_TARGET_MISSING");
    }

    const downloaded = triggerDownloadUrl(
      target.url,
      target.filename || buildSafePdfFilename(id, storeDetail)
    );

    if (!downloaded) {
      throw new Error("DOWNLOAD_TRIGGER_FAILED");
    }

    if (target.isObjectUrl) {
      scheduleObjectUrlRevoke(target.url, DOWNLOAD_OBJECT_URL_REVOKE_MS);
    }

    safeEmit(FACTURA_PDF_EVENTS.DOWNLOAD_SUCCESS, {
      facturaId: id,
      url: target.url,
      directUrl: target.directUrl,
      filename: target.filename,
      from: target.from,
      isObjectUrl: target.isObjectUrl,
      response: target.response,
    });

    safeLog("PDF download prepared:", {
      facturaId: id,
      from: target.from,
      filename: target.filename,
    });

    if (!silent) {
      showToast("Descarga de factura preparada.", "success");
    }

    return target.response || {
      ok: true,
      url: target.url,
      from: target.from,
    };
  } catch (error) {
    safeEmit(FACTURA_PDF_EVENTS.ERROR, {
      facturaId: id,
      error,
      mode: FACTURAS_DISPOSITIONS.ATTACHMENT,
    });

    safeWarn("downloadFacturaPdfAction error:", {
      facturaId: id,
      message: error?.message || "UNKNOWN_ERROR",
      status: getErrorStatus(error),
      directUrl: error?.directUrl || "",
      extractedUrl: error?.extractedUrl || "",
    });

    if (!silent) {
      showToast(
        safeErrorMessage(error, "No se pudo descargar la factura."),
        "error"
      );
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

  const targetEmail = safeText(
    first(
      factura?.cliente?.email,
      factura?.cliente?.emailLower,
      factura?.emailCliente,
      factura?.enviadoA
    ),
    "el cliente"
  );

  if (confirmSend) {
    const confirmed = window.confirm(
      `Se va a enviar la factura ${getFacturaNumber(factura)} a ${targetEmail}. ¿Continuar?`
    );

    if (!confirmed) {
      safeEmit("facturas:send:cancelled", {
        facturaId: id,
        factura,
      });

      return null;
    }
  }

  try {
    onStart?.(id);

    safeEmit("facturas:send:request", {
      facturaId: id,
      factura,
      to: targetEmail,
    });

    const response = await sendFacturaRequest(id, {});

    const sentAt = new Date().toISOString();

    const payload = {
      facturaId: id,
      response,
      factura,
      to: targetEmail,
      sentAt,
    };

    onSent?.(payload);

    safeEmitMany(FACTURA_SENT_EVENTS, payload);

    if (typeof reloadFacturas === "function") {
      await reloadFacturas({
        force: true,
        silent: true,
        asRefresh: true,
      });
    }

    if (!silent) {
      showToast("Factura enviada correctamente.", "success");
    }

    return response;
  } catch (error) {
    safeEmit("facturas:send:error", {
      facturaId: id,
      error,
      factura,
      to: targetEmail,
    });

    if (!silent) {
      showToast(
        safeErrorMessage(error, "No se pudo enviar la factura."),
        "error"
      );
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

  getFacturaIdAction: getFacturaId,
  getFacturaNumberAction: getFacturaNumber,
  getFacturaClientAction: getFacturaClient,
  getFacturaEmailAction: getFacturaEmail,
  getFacturaDateAction: getFacturaDate,
  getFacturaEstadoPagoAction: getFacturaEstadoPago,
  getFacturaEstadoAction: getFacturaEstado,
  getFacturaFormaPagoAction: getFacturaFormaPago,
  getFacturaMonedaAction: getFacturaMoneda,
  getFacturaTotalAction: getFacturaTotal,
  getFacturaIncidenciaIdAction: getFacturaIncidenciaId,
  buildFacturaIncidenciaOpenPayloadAction: buildIncidenciaOpenPayload,
  normalizeFacturaDetailAction: normalizeFacturaDetail,
};
