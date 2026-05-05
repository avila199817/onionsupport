/* =========================================================
   Onion SPA - Facturas Detail Template
   Archivo: src/views/facturas/facturas.detail.template.js

   FINAL PRO SYSTEM · FACTURAS DETAIL MODAL · EXTREME 10/10
   PATCH · NO CSS IN JS · CSP CLEAN · TOKEN SYSTEM READY
   PATCH · NO INLINE STYLES · CLASS ONLY TEMPLATE
   PATCH · IVA / IRPF REAL · TAX BREAKDOWN HARDENED
   PATCH · CLASS BASED MODAL · ACTION SAFE · NO ROUTE NAVIGATION
   PATCH · FORMA DE PAGO HUMAN LABEL · FIRST LETTER UPPERCASE

   RESPONSABILIDADES:
   - renderizar modal premium centrado de detalle de factura
   - mantener compatibilidad con facturasView.js
   - soportar estado loading / sending / viewing / downloading
   - exponer exports legacy para imports antiguos
   - mantener data-action y data-facturas-action estables
   - eliminar secciones Cliente y Metadata
   - mostrar IVA / IRPF / retenciones / otros impuestos cuando existan
   - mostrar incidencia vinculada como acción modal
   - no usar navegación a URL inexistente para incidencia
   - quitar "Total línea" visual pesado
   - cerrar modal con botón aspa X
   - tolerar payloads pobres, normalizados, raw, raw.raw, data, payload,
     result, factura e invoice
   - soportar facturas enriquecidas desde incidenciaGet.js
   - renderizar forma de pago como etiqueta humana:
     "transferencia bancaria" -> "Transferencia bancaria"

   CSS:
   - Todo el estilo debe vivir en /src/css/views/facturas/detail.css
   - Este template solo emite clases y atributos data-*
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_CURRENCY = "EUR";

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "—") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  return text || fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function hasOwnKeys(value = {}) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length
  );
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

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function capitalizeFirst(value = "", fallback = "—") {
  const text = safeText(value, fallback);

  if (!text || text === fallback) return text;

  const clean = text.replace(/\s+/g, " ").trim();

  if (!clean) return fallback;

  const shouldNormalizeRest =
    clean === clean.toLocaleLowerCase("es-ES") ||
    clean === clean.toLocaleUpperCase("es-ES");

  const firstLetter = clean.charAt(0).toLocaleUpperCase("es-ES");
  const rest = shouldNormalizeRest
    ? clean.slice(1).toLocaleLowerCase("es-ES")
    : clean.slice(1);

  return `${firstLetter}${rest}`;
}

function formatPaymentMethodLabel(value = "", fallback = "—") {
  const text = safeText(value, fallback);

  if (!text || text === fallback) return text;

  const key = normalizeKey(text);

  switch (key) {
    case "transferencia_bancaria":
    case "transferencia":
    case "bank_transfer":
    case "wire_transfer":
    case "sepa_transfer":
      return "Transferencia bancaria";

    case "efectivo":
    case "cash":
      return "Efectivo";

    case "tarjeta":
    case "tarjeta_bancaria":
    case "card":
    case "credit_card":
    case "debit_card":
      return "Tarjeta";

    case "bizum":
      return "Bizum";

    case "paypal":
      return "PayPal";

    case "domiciliacion":
    case "domiciliacion_bancaria":
    case "direct_debit":
      return "Domiciliación bancaria";

    default:
      return capitalizeFirst(text, fallback);
  }
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (typeof value === "object") {
    return fallback;
  }

  const raw = String(value)
    .trim()
    .replace(/€/g, "")
    .replace(/%/g, "")
    .replace(/\s/g, "");

  if (!raw) return fallback;

  let normalized = raw;
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");

  if (hasComma && hasDot) {
    normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
  } else if (hasComma) {
    normalized = normalized.replace(/,/g, ".");
  }

  const n = Number(normalized);

  return Number.isFinite(n) ? n : fallback;
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const key = normalizeText(value);

  if (["true", "1", "yes", "si", "sí", "on"].includes(key)) return true;
  if (["false", "0", "no", "off"].includes(key)) return false;

  return fallback;
}

function readPath(source = {}, path = "") {
  const obj = safeObject(source);
  const parts = safeText(path, "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) return undefined;

  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    current = current?.[part];
  }

  return current;
}

function uniqueObjects(items = []) {
  const output = [];
  const seen = new Set();

  safeArray(items).forEach((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    if (!hasOwnKeys(item)) return;
    if (seen.has(item)) return;

    seen.add(item);
    output.push(item);
  });

  return output;
}

function getPayloadSources(payload = {}) {
  const item = safeObject(payload);
  const raw = safeObject(item.raw);
  const rawRaw = safeObject(raw.raw);

  return uniqueObjects([
    item,
    raw,
    rawRaw,

    safeObject(item.data),
    safeObject(item.payload),
    safeObject(item.result),
    safeObject(item.item),
    safeObject(item.factura),
    safeObject(item.invoice),
    safeObject(item.billing),
    safeObject(item.totales),
    safeObject(item.totals),
    safeObject(item.summary),
    safeObject(item.payment),

    safeObject(raw.data),
    safeObject(raw.payload),
    safeObject(raw.result),
    safeObject(raw.item),
    safeObject(raw.factura),
    safeObject(raw.invoice),
    safeObject(raw.billing),
    safeObject(raw.totales),
    safeObject(raw.totals),
    safeObject(raw.summary),
    safeObject(raw.payment),

    safeObject(rawRaw.data),
    safeObject(rawRaw.payload),
    safeObject(rawRaw.result),
    safeObject(rawRaw.item),
    safeObject(rawRaw.factura),
    safeObject(rawRaw.invoice),
    safeObject(rawRaw.billing),
    safeObject(rawRaw.totales),
    safeObject(rawRaw.totals),
    safeObject(rawRaw.summary),
    safeObject(rawRaw.payment),
  ]);
}

function firstFromSources(sources = [], paths = []) {
  for (const source of safeArray(sources)) {
    for (const path of safeArray(paths)) {
      const value = readPath(source, path);

      if (value !== undefined && value !== null) {
        if (typeof value === "string" && value.trim() === "") continue;
        if (Array.isArray(value) && value.length === 0) continue;

        if (
          value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          Object.keys(value).length === 0
        ) {
          continue;
        }

        return value;
      }
    }
  }

  return null;
}

/* =========================================================
   FORMATTERS
========================================================= */

function formatMoney(value, currency = DEFAULT_CURRENCY) {
  const amount = safeNumber(value, 0);
  const code = safeText(currency, DEFAULT_CURRENCY).toUpperCase();

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2).replace(".", ",")} ${code}`;
  }
}

function formatPercent(value = 0) {
  const n = Math.abs(safeNumber(value, 0));

  if (!n) return "";

  const clean = Number.isInteger(n)
    ? String(n)
    : String(n).replace(".", ",");

  return `${clean}%`;
}

function normalizeDateInput(value = null) {
  if (!value) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9999999999 ? new Date(value) : new Date(value * 1000);
  }

  const raw = safeText(value, "");

  if (!raw) return null;

  return new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);
}

function formatDate(value) {
  const date = normalizeDateInput(value);

  if (!date || Number.isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return "—";
  }
}

function formatDateTime(value) {
  const date = normalizeDateInput(value);

  if (!date || Number.isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "—";
  }
}

function formatRelativeDate(value) {
  const date = normalizeDateInput(value);

  if (!date || Number.isNaN(date.getTime())) return "Sin fecha";

  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const absMin = Math.abs(diffMin);

  if (absMin < 1) return "Ahora mismo";

  if (absMin < 60) {
    return diffMin > 0 ? `En ${absMin} min` : `Hace ${absMin} min`;
  }

  const diffHours = Math.round(absMin / 60);

  if (diffHours < 24) {
    return diffMin > 0 ? `En ${diffHours} h` : `Hace ${diffHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);

  if (diffDays <= 7) {
    return diffMin > 0
      ? `En ${diffDays} día${diffDays === 1 ? "" : "s"}`
      : `Hace ${diffDays} día${diffDays === 1 ? "" : "s"}`;
  }

  return formatDate(value);
}

/* =========================================================
   DOMAIN HELPERS · FACTURA
========================================================= */

function getFacturaId(factura = {}) {
  const sources = getPayloadSources(factura);

  return safeText(
    firstFromSources(sources, [
      "id",
      "_id",
      "facturaId",
      "invoiceId",
      "documentId",
      "uuid",
      "numeroFacturaLegal",
      "numeroFacturaSistema",
      "numero",
    ]),
    ""
  );
}

function getFacturaNumero(factura = {}) {
  const sources = getPayloadSources(factura);

  return safeText(
    firstFromSources(sources, [
      "numeroFacturaLegal",
      "legalInvoiceNumber",
      "legalNumber",
      "numeroLegal",
      "numeroFactura",
      "invoiceNumber",
      "number",
      "numero",
      "code",
      "facturaCode",
      "facturaId",
      "invoiceId",
      "id",
    ]),
    "—"
  );
}

function getFacturaSistema(factura = {}) {
  const sources = getPayloadSources(factura);

  return safeText(
    firstFromSources(sources, [
      "numeroFacturaSistema",
      "systemInvoiceNumber",
      "systemNumber",
    ]),
    ""
  );
}

function getClienteNombre(factura = {}) {
  const sources = getPayloadSources(factura);

  return safeText(
    firstFromSources(sources, [
      "cliente.nombreContacto",
      "cliente.empresa",
      "cliente.razonSocial",
      "cliente.companyName",
      "cliente.nombreCompleto",
      "cliente.nombre",
      "cliente.name",
      "cliente.displayName",

      "clienteSnapshot.nombreContacto",
      "clienteSnapshot.razonSocial",
      "clienteSnapshot.name",

      "client.name",
      "customer.name",

      "clienteEmpresa",
      "clienteNombre",
      "clientName",
      "customerName",
      "companyName",
      "name",
      "nombre",
    ]),
    "Cliente"
  );
}

function getClienteEmpresa(factura = {}) {
  const sources = getPayloadSources(factura);

  return safeText(
    firstFromSources(sources, [
      "cliente.razonSocial",
      "cliente.companyName",
      "cliente.empresa",
      "cliente.nombreFiscal",
      "clienteSnapshot.razonSocial",
      "clienteSnapshot.companyName",
      "clienteEmpresa",
      "companyName",
    ]),
    ""
  );
}

function getClienteEmail(factura = {}) {
  const sources = getPayloadSources(factura);

  return safeText(
    firstFromSources(sources, [
      "cliente.email",
      "cliente.mail",
      "cliente.emailCliente",
      "clienteSnapshot.email",
      "client.email",
      "customer.email",
      "clienteEmail",
      "emailCliente",
      "email",
      "clientEmail",
      "customerEmail",
      "email.customerEmail",
    ]),
    ""
  );
}

function getFacturaFecha(factura = {}) {
  const sources = getPayloadSources(factura);

  return firstFromSources(sources, [
    "fechaFactura",
    "fechaFacturaISO",
    "fecha",
    "date",
    "issueDate",
    "issuedAt",
    "fechaEmision",
    "lifecycle.issuedAt",
    "createdAt",
  ]);
}

function getFacturaServicioAt(factura = {}) {
  const sources = getPayloadSources(factura);

  return firstFromSources(sources, [
    "fechaServicio",
    "fechaServicioISO",
    "serviceAt",
    "lifecycle.serviceAt",
  ]);
}

function getFacturaUpdatedAt(factura = {}) {
  const sources = getPayloadSources(factura);

  return firstFromSources(sources, [
    "updatedAt",
    "lastActivityAt",
    "lifecycle.updatedAt",
    "lifecycle.lastActivityAt",
    "fechaEnvio",
    "sentAt",
    "email.sentAt",
    "createdAt",
  ]);
}

function getFacturaFechaEnvio(factura = {}) {
  const sources = getPayloadSources(factura);

  return firstFromSources(sources, [
    "fechaEnvio",
    "sentAt",
    "mailSentAt",
    "email.sentAt",
    "lifecycle.sentAt",
  ]);
}

function getFacturaFormaPago(factura = {}) {
  const sources = getPayloadSources(factura);

  return formatPaymentMethodLabel(
    firstFromSources(sources, [
      "formaPago",
      "metodoPago",
      "paymentMethod",
      "payment.methodLabel",
      "payment.method",
    ]),
    "—"
  );
}

function getFacturaMoneda(factura = {}) {
  const sources = getPayloadSources(factura);

  return safeText(
    firstFromSources(sources, [
      "moneda",
      "currency",
      "facturaCurrency",
      "facturaMoneda",
      "totales.currency",
      "payment.currency",
      "meta.currency",
    ]),
    DEFAULT_CURRENCY
  ).toUpperCase();
}

function getFacturaTotal(factura = {}) {
  const sources = getPayloadSources(factura);

  return safeNumber(
    firstFromSources(sources, [
      "total",
      "amount",
      "importe",
      "importeTotal",
      "facturaTotal",
      "facturaImporte",
      "importeFactura",
      "totalFactura",
      "invoiceAmount",
      "totales.total",
      "totals.total",
      "summary.total",
      "payment.paidAmount",
    ]),
    0
  );
}

function getFacturaBase(factura = {}) {
  const sources = getPayloadSources(factura);

  return safeNumber(
    firstFromSources(sources, [
      "baseImponible",
      "subtotal",
      "base",
      "taxBase",
      "baseAmount",
      "totales.baseImponible",
      "totales.subtotal",
      "totals.baseImponible",
      "totals.subtotal",
      "summary.baseImponible",
      "summary.subtotal",
    ]),
    0
  );
}

function getFacturaImpuestos(factura = {}) {
  const sources = getPayloadSources(factura);

  const direct = safeNumber(
    firstFromSources(sources, [
      "impuestosTotal",
      "taxTotal",
      "totalImpuestos",
      "tax",
      "taxAmount",
      "totales.totalImpuestos",
      "totals.totalImpuestos",
      "summary.totalImpuestos",
    ]),
    NaN
  );

  if (Number.isFinite(direct)) {
    return direct;
  }

  const iva = safeNumber(
    firstFromSources(sources, [
      "totales.iva",
      "iva.importe",
      "iva.amount",
      "ivaImporte",
      "importeIva",
      "totalIva",
      "ivaTotal",
      "ivaAmount",
    ]),
    0
  );

  const irpf = safeNumber(
    firstFromSources(sources, [
      "totales.irpf",
      "irpf.importe",
      "irpf.amount",
      "irpfImporte",
      "importeIrpf",
      "totalIrpf",
      "irpfTotal",
      "irpfAmount",
      "retencion",
      "withholding",
      "withholdingAmount",
    ]),
    0
  );

  return iva + irpf;
}

function getFacturaPagado(factura = {}) {
  const sources = getPayloadSources(factura);

  return safeNumber(
    firstFromSources(sources, [
      "paidAmount",
      "payment.paidAmount",
      "totales.pagado",
      "totals.paid",
    ]),
    0
  );
}

function getFacturaPendiente(factura = {}) {
  const sources = getPayloadSources(factura);

  return safeNumber(
    firstFromSources(sources, [
      "pendingAmount",
      "payment.pendingAmount",
      "totales.pendiente",
      "totals.pending",
    ]),
    0
  );
}

function getFacturaEnviadoA(factura = {}) {
  const sources = getPayloadSources(factura);

  return safeText(
    firstFromSources(sources, [
      "enviadoA",
      "sentTo",
      "email.enviadoA",
      "email.to",
      "email.customerEmail",
      "cliente.email",
      "client.email",
      "customer.email",
      "emailCliente",
      "clienteEmail",
    ]),
    "—"
  );
}

function getFacturaPdfAvailable(factura = {}) {
  const sources = getPayloadSources(factura);

  const explicit = firstFromSources(sources, [
    "pdfAvailable",
    "hasPdf",
    "meta.hasPdf",
    "document.available",
    "document.hasPdf",
  ]);

  if (explicit !== null && explicit !== undefined) {
    return bool(explicit, false);
  }

  return Boolean(
    firstFromSources(sources, [
      "blobPath",
      "pdfUrl",
      "pdf",
      "document.blobPath",
      "document.fileName",
      "document.url",
      "document.downloadUrl",
      "document.viewUrl",
    ])
  );
}

function getFacturaPreview(factura = {}) {
  const sources = getPayloadSources(factura);

  return safeText(
    firstFromSources(sources, [
      "descripcionPrincipal",
      "conceptoPrincipal",
      "descripcion",
      "concepto",
      "preview",
      "description",
      "lineas.0.descripcion",
      "lineas.0.concepto",
      "items.0.descripcion",
      "items.0.concepto",
      "conceptos.0.descripcion",
      "conceptos.0.concepto",
      "incidencia.subject",
      "incidencia.asunto",
      "ticket.subject",
      "ticket.asunto",
    ]),
    "Factura disponible para consulta."
  );
}

/* =========================================================
   DOMAIN HELPERS · INCIDENCIA
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
      item.incidencia?.id,

      item.linkedTicket?.ticketId,
      item.linkedTicket?.incidenciaId,
      item.linkedTicket?.id
    );

    if (candidate) {
      return safeText(candidate, "");
    }
  }

  return "";
}

function getRelationSources(factura = {}) {
  const sources = getPayloadSources(factura);
  const relationSources = [];

  sources.forEach((source) => {
    relationSources.push(
      safeObject(source.incidencia),
      safeObject(source.ticket),
      safeObject(source.linkedTicket),
      safeObject(source.relatedTicket),
      safeObject(source.relatedIncident),
      safeObject(source.supportTicket),
      safeObject(source.case),
      safeObject(source.relations?.ticket),
      safeObject(source.relations?.incidencia),
      safeObject(source.meta)
    );
  });

  return uniqueObjects([
    ...sources,
    ...relationSources,
  ]);
}

function getFacturaIncidenciaId(factura = {}) {
  const sources = getRelationSources(factura);

  const direct = safeText(
    firstFromSources(sources, [
      "ticketId",
      "incidenciaId",

      "incidencia.ticketId",
      "incidencia.id",
      "incidencia.incidenciaId",

      "ticket.ticketId",
      "ticket.id",
      "ticket.incidenciaId",

      "linkedTicket.ticketId",
      "linkedTicket.id",
      "linkedTicket.incidenciaId",

      "relations.ticket.ticketId",
      "relations.ticket.id",
      "relations.ticket.incidenciaId",
      "relations.incidencia.ticketId",
      "relations.incidencia.id",
      "relations.incidencia.incidenciaId",

      "relatedTicket.ticketId",
      "relatedTicket.id",
      "relatedTicket.incidenciaId",

      "relatedIncident.ticketId",
      "relatedIncident.id",
      "relatedIncident.incidenciaId",

      "supportTicket.ticketId",
      "supportTicket.id",
      "supportTicket.incidenciaId",

      "relatedTicketId",
      "relatedIncidentId",
      "supportTicketId",
      "caseId",

      "meta.ticketId",
      "meta.incidenciaId",
      "meta.linkedTicketId",
    ]),
    ""
  );

  if (direct) {
    return direct;
  }

  for (const source of sources) {
    const arrayCandidate = first(
      pickTicketIdFromArray(source.ticketIds),
      pickTicketIdFromArray(source.incidenciaIds),
      pickTicketIdFromArray(source.relatedTicketIds),
      pickTicketIdFromArray(source.relatedIncidentIds),
      pickTicketIdFromArray(source.linkedTickets),
      pickTicketIdFromArray(source.incidencias),
      pickTicketIdFromArray(source.tickets),
      pickTicketIdFromArray(source.relatedTickets),
      pickTicketIdFromArray(source.relations),
      pickTicketIdFromArray(source.facturasRelacionadas),
      pickTicketIdFromArray(source.linkedInvoices?.tickets),
      pickTicketIdFromArray(source.invoiceLinks),
      pickTicketIdFromArray(source.invoiceRelations)
    );

    if (arrayCandidate) {
      return safeText(arrayCandidate, "");
    }
  }

  return "";
}

function getFacturaIncidenciaSubject(factura = {}) {
  const sources = getRelationSources(factura);

  return safeText(
    firstFromSources(sources, [
      "incidencia.subject",
      "incidencia.asunto",
      "incidencia.title",
      "ticket.subject",
      "ticket.asunto",
      "ticket.title",
      "linkedTicket.subject",
      "linkedTicket.asunto",
      "linkedTicket.title",
      "subject",
      "asunto",
      "title",
    ]),
    ""
  );
}

/* =========================================================
   DOMAIN HELPERS · LÍNEAS
========================================================= */

function getLineas(factura = {}) {
  const sources = getPayloadSources(factura);

  const value = firstFromSources(sources, [
    "lineas",
    "items",
    "conceptos",
    "lines",
    "invoiceLines",
  ]);

  const rows = safeArray(value);

  if (rows.length) {
    return rows;
  }

  const concepto = getFacturaPreview(factura);
  const base = getFacturaBase(factura);

  if (concepto && base) {
    return [
      {
        id: "linea-principal",
        concepto,
        descripcion: "",
        cantidad: 1,
        precioUnitario: base,
        subtotal: base,
      },
    ];
  }

  return [];
}

function getLineaConcepto(linea = {}) {
  return safeText(
    first(
      linea?.concepto,
      linea?.descripcion,
      linea?.description,
      linea?.name,
      linea?.title
    ),
    "Línea"
  );
}

function getLineaDescripcion(linea = {}) {
  return safeText(
    first(
      linea?.descripcion,
      linea?.detalle,
      linea?.description,
      linea?.detail
    ),
    ""
  );
}

function getLineaCantidad(linea = {}) {
  return safeNumber(
    first(
      linea?.cantidad,
      linea?.qty,
      linea?.quantity
    ),
    0
  );
}

function getLineaUnitario(linea = {}) {
  return safeNumber(
    first(
      linea?.precioUnitario,
      linea?.importeUnitario,
      linea?.unitPrice,
      linea?.precio,
      linea?.price
    ),
    0
  );
}

function getLineaSubtotal(linea = {}) {
  const explicit = first(
    linea?.subtotal,
    linea?.base,
    linea?.importeBase
  );

  if (explicit !== null && explicit !== undefined && explicit !== "") {
    return safeNumber(explicit, 0);
  }

  return getLineaCantidad(linea) * getLineaUnitario(linea);
}

function getLineaIvaPct(linea = {}) {
  return safeNumber(
    first(
      linea?.ivaPorcentaje,
      linea?.porcentajeIva,
      linea?.ivaRate,
      linea?.taxRate
    ),
    0
  );
}

function getLineaIrpfPct(linea = {}) {
  return safeNumber(
    first(
      linea?.irpfPorcentaje,
      linea?.porcentajeIrpf,
      linea?.irpfRate,
      linea?.withholdingRate
    ),
    0
  );
}

/* =========================================================
   STATUS HELPERS
========================================================= */

function getEstadoPagoLabel(value = "") {
  const key = normalizeKey(value);

  switch (key) {
    case "paid":
    case "pagada":
    case "pagado":
    case "cobrada":
    case "abonada":
      return "Pagada";

    case "pending":
    case "pendiente":
    case "unpaid":
      return "Pendiente";

    case "overdue":
    case "vencida":
    case "vencido":
      return "Vencida";

    case "cancelled":
    case "canceled":
    case "cancelada":
    case "cancelado":
      return "Cancelada";

    case "draft":
    case "borrador":
      return "Borrador";

    case "partial":
    case "parcial":
    case "pago_parcial":
      return "Pago parcial";

    default:
      return safeText(value, "Pendiente");
  }
}

function getEstadoLabel(value = "") {
  const key = normalizeKey(value);

  switch (key) {
    case "emitida":
    case "emitido":
    case "issued":
      return "Emitida";

    case "enviada":
    case "enviado":
    case "sent":
      return "Enviada";

    case "anulada":
    case "anulado":
    case "void":
      return "Anulada";

    case "borrador":
    case "draft":
      return "Borrador";

    case "cancelada":
    case "cancelado":
    case "cancelled":
    case "canceled":
      return "Cancelada";

    case "abonada":
    case "paid":
      return "Abonada";

    default:
      return safeText(value, "Emitida");
  }
}

function getFacturaEstadoPagoRaw(factura = {}) {
  const sources = getPayloadSources(factura);

  return firstFromSources(sources, [
    "estadoPago",
    "paymentStatus",
    "payment.status",
  ]);
}

function getFacturaEstadoRaw(factura = {}) {
  const sources = getPayloadSources(factura);

  return firstFromSources(sources, [
    "estado",
    "status",
  ]);
}

function getFacturaEstadoPagoLabel(factura = {}) {
  return getEstadoPagoLabel(getFacturaEstadoPagoRaw(factura));
}

function getFacturaEstadoLabel(factura = {}) {
  return getEstadoLabel(getFacturaEstadoRaw(factura));
}

function getEstadoPagoTone(value = "") {
  const key = normalizeKey(value);

  if (["paid", "pagada", "pagado", "cobrada", "abonada"].includes(key)) {
    return "success";
  }

  if (["pending", "pendiente", "partial", "parcial", "unpaid"].includes(key)) {
    return "warning";
  }

  if (["overdue", "vencida", "vencido"].includes(key)) {
    return "danger";
  }

  if (["cancelled", "canceled", "cancelada", "cancelado"].includes(key)) {
    return "muted";
  }

  return "neutral";
}

function getEstadoTone(value = "") {
  const key = normalizeKey(value);

  if (["enviada", "enviado", "sent", "abonada", "paid"].includes(key)) {
    return "success";
  }

  if (["borrador", "draft"].includes(key)) {
    return "warning";
  }

  if (["anulada", "anulado", "void", "cancelada", "cancelado", "cancelled", "canceled"].includes(key)) {
    return "danger";
  }

  if (["emitida", "emitido", "issued"].includes(key)) {
    return "accent";
  }

  return "neutral";
}

/* =========================================================
   IMPUESTOS · IVA / IRPF HARDENED
========================================================= */

function getTaxLines(factura = {}) {
  const sources = getPayloadSources(factura);

  const value = firstFromSources(sources, [
    "impuestos",
    "taxes",
    "taxLines",
    "desgloseImpuestos",
    "taxBreakdown",
  ]);

  return safeArray(value);
}

function normalizeTaxLine(entry = {}) {
  const impuesto = safeObject(entry);

  const tipo = safeText(
    first(
      impuesto.tipo,
      impuesto.taxType,
      impuesto.nombre,
      impuesto.name,
      impuesto.label,
      impuesto.code
    ),
    "Impuesto"
  );

  return {
    tipo,
    key: normalizeKey(tipo),

    porcentaje: safeNumber(
      first(
        impuesto.porcentaje,
        impuesto.percent,
        impuesto.rate,
        impuesto.tipoPorcentaje
      ),
      0
    ),

    base: safeNumber(
      first(
        impuesto.base,
        impuesto.taxBase,
        impuesto.baseAmount
      ),
      0
    ),

    importe: safeNumber(
      first(
        impuesto.importe,
        impuesto.amount,
        impuesto.total,
        impuesto.value
      ),
      0
    ),

    sign: safeText(
      first(
        impuesto.sign,
        impuesto.tipoOperacion
      ),
      ""
    ),
  };
}

function getObjectTax(factura = {}, type = "iva") {
  const sources = getPayloadSources(factura);

  const objectPaths =
    type === "iva"
      ? ["iva", "tax.iva", "taxes.iva"]
      : ["irpf", "retencionIrpf", "withholding", "tax.irpf", "taxes.irpf"];

  const obj = safeObject(firstFromSources(sources, objectPaths));

  if (!hasOwnKeys(obj)) {
    return null;
  }

  const importe = safeNumber(
    first(
      obj.importe,
      obj.amount,
      obj.total,
      obj.value
    ),
    0
  );

  const porcentaje = safeNumber(
    first(
      obj.porcentaje,
      obj.percent,
      obj.rate,
      obj.tipoPorcentaje
    ),
    0
  );

  const base = safeNumber(
    first(
      obj.base,
      obj.taxBase,
      obj.baseAmount
    ),
    0
  );

  const enabled = bool(obj.enabled, Boolean(importe || porcentaje || base));

  if (!enabled && !importe && !porcentaje && !base) {
    return null;
  }

  return {
    tipo: type === "iva" ? "IVA" : "IRPF",
    key: type,
    porcentaje,
    base,
    importe,
    sign: type === "irpf" ? "negative" : "positive",
    source: "object",
  };
}

function getExplicitTax(factura = {}, type = "iva") {
  const sources = getPayloadSources(factura);

  const objectTax = getObjectTax(factura, type);

  if (objectTax) {
    return objectTax;
  }

  if (type === "iva") {
    const importe = safeNumber(
      firstFromSources(sources, [
        "ivaImporte",
        "importeIva",
        "totalIva",
        "ivaTotal",
        "ivaAmount",
        "totales.iva",
        "totals.iva",
        "summary.iva",
        "meta.displayIva",
      ]),
      0
    );

    const porcentaje = safeNumber(
      firstFromSources(sources, [
        "ivaPorcentaje",
        "porcentajeIva",
        "ivaRate",
        "taxRate",
      ]),
      0
    );

    const base = safeNumber(
      firstFromSources(sources, [
        "ivaBase",
        "baseIva",
        "baseImponible",
        "totales.baseImponible",
      ]),
      0
    );

    if (importe || porcentaje || base) {
      return {
        tipo: "IVA",
        key: "iva",
        porcentaje,
        base,
        importe,
        sign: "positive",
        source: "explicit",
      };
    }

    return null;
  }

  const importe = safeNumber(
    firstFromSources(sources, [
      "irpfImporte",
      "importeIrpf",
      "totalIrpf",
      "irpfTotal",
      "irpfAmount",
      "retencion",
      "retencionIrpf",
      "withholding",
      "withholdingAmount",
      "totales.irpf",
      "totals.irpf",
      "summary.irpf",
      "meta.displayIrpf",
    ]),
    0
  );

  const porcentaje = safeNumber(
    firstFromSources(sources, [
      "irpfPorcentaje",
      "porcentajeIrpf",
      "irpfRate",
      "retencionPorcentaje",
      "withholdingRate",
    ]),
    0
  );

  const base = safeNumber(
    firstFromSources(sources, [
      "irpfBase",
      "baseIrpf",
      "retencionBase",
      "baseImponible",
      "totales.baseImponible",
    ]),
    0
  );

  if (importe || porcentaje || base) {
    return {
      tipo: "IRPF",
      key: "irpf",
      porcentaje,
      base,
      importe,
      sign: "negative",
      source: "explicit",
    };
  }

  return null;
}

function getImpuestosBreakdown(factura = {}) {
  const impuestos = getTaxLines(factura);

  let iva = null;
  let irpf = null;
  const otros = [];

  impuestos.forEach((entry) => {
    const normalized = normalizeTaxLine(entry);
    const key = normalized.key;

    if (key.includes("iva") || key.includes("vat")) {
      iva = {
        ...normalized,
        tipo: "IVA",
        key: "iva",
      };
      return;
    }

    if (
      key.includes("irpf") ||
      key.includes("retencion") ||
      key.includes("retention") ||
      key.includes("withholding")
    ) {
      irpf = {
        ...normalized,
        tipo: "IRPF",
        key: "irpf",
        sign: normalized.sign || "negative",
      };
      return;
    }

    otros.push(normalized);
  });

  if (!iva) {
    iva = getExplicitTax(factura, "iva");
  }

  if (!irpf) {
    irpf = getExplicitTax(factura, "irpf");
  }

  const totalFallback = getFacturaImpuestos(factura);

  if (!iva && !irpf && !otros.length && totalFallback) {
    otros.push({
      tipo: "Impuestos",
      key: "impuestos",
      porcentaje: 0,
      base: getFacturaBase(factura),
      importe: totalFallback,
      sign: totalFallback < 0 ? "negative" : "positive",
      source: "fallback",
    });
  }

  return {
    iva,
    irpf,
    otros,
  };
}

/* =========================================================
   UI PARTIALS
========================================================= */

function renderActionSpinner(label = "") {
  return `
    <span class="facturas-detail-action-loading">
      <span class="facturas-detail-spinner" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function renderChip(label = "", tone = "neutral") {
  return `
    <span class="facturas-detail-chip facturas-detail-chip--${escapeHtml(tone)}">
      ${escapeHtml(label)}
    </span>
  `;
}

function mini(label = "", value = "") {
  return `
    <div class="facturas-detail-mini">
      <span class="facturas-detail-mini-label">${escapeHtml(label)}</span>
      <strong class="facturas-detail-mini-value">${escapeHtml(value)}</strong>
    </div>
  `;
}

function stat(label = "", value = "") {
  return `
    <article class="facturas-detail-stat">
      <span class="facturas-detail-stat-label">${escapeHtml(label)}</span>
      <strong class="facturas-detail-stat-value">${escapeHtml(value)}</strong>
    </article>
  `;
}

function taxCard(label = "", tax = null, moneda = DEFAULT_CURRENCY, tone = "neutral") {
  const item = safeObject(tax);
  const porcentaje = formatPercent(item.porcentaje);
  const base = safeNumber(item.base, 0);
  const captionParts = [];

  if (porcentaje) {
    captionParts.push(`Tipo aplicado: ${porcentaje}`);
  }

  if (base) {
    captionParts.push(`Base: ${formatMoney(base, moneda)}`);
  }

  if (tone === "irpf") {
    captionParts.push("Retención descontada del total");
  }

  const caption = captionParts.join(" · ");

  return `
    <article class="facturas-detail-tax-card facturas-detail-tax-card--${escapeHtml(tone)}">
      <span class="facturas-detail-tax-label">
        ${escapeHtml(porcentaje ? `${label} · ${porcentaje}` : label)}
      </span>

      <strong class="facturas-detail-tax-value">
        ${escapeHtml(formatMoney(item.importe, moneda))}
      </strong>

      ${
        caption
          ? `<span class="facturas-detail-tax-caption">${escapeHtml(caption)}</span>`
          : ""
      }
    </article>
  `;
}

function renderSectionCard({
  title = "",
  subtitle = "",
  content = "",
} = {}) {
  return `
    <section class="facturas-detail-section">
      <div class="facturas-detail-section-head">
        <h3 class="facturas-detail-section-title">${escapeHtml(title)}</h3>

        ${
          subtitle
            ? `<p class="facturas-detail-section-subtitle">${escapeHtml(subtitle)}</p>`
            : ""
        }
      </div>

      ${content}
    </section>
  `;
}

function renderAvatar(factura = {}) {
  const raw = safeText(
    first(getClienteEmpresa(factura), getClienteNombre(factura)),
    "ON"
  );

  const parts = raw.split(/\s+/).filter(Boolean);

  const initials =
    parts.length >= 2
      ? `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase()
      : raw.slice(0, 2).toUpperCase();

  return `
    <div class="facturas-detail-avatar" aria-hidden="true">
      ${escapeHtml(initials || "ON")}
    </div>
  `;
}

function renderIncidenciaMini(factura = {}) {
  const incidenciaId = getFacturaIncidenciaId(factura);
  const incidenciaSubject = getFacturaIncidenciaSubject(factura);
  const facturaId = getFacturaId(factura);

  if (!incidenciaId) {
    return mini("Incidencia", "Sin vincular");
  }

  return `
    <div class="facturas-detail-mini">
      <span class="facturas-detail-mini-label">Incidencia</span>

      <button
        type="button"
        class="facturas-detail-incidencia-btn"
        data-action="open-incidencia"
        data-facturas-action="open-incidencia"
        data-ticket-id="${escapeHtml(incidenciaId)}"
        data-incidencia-id="${escapeHtml(incidenciaId)}"
        data-factura-id="${escapeHtml(facturaId)}"
        title="${escapeHtml(incidenciaSubject || "Abrir incidencia relacionada")}"
        data-tooltip="${escapeHtml(incidenciaSubject || "Abrir incidencia relacionada")}"
      >
        ${escapeHtml(incidenciaId)}
      </button>
    </div>
  `;
}

/* =========================================================
   EXPORTS LEGACY
========================================================= */

export function renderMiniMeta(label = "", value = "") {
  return mini(label, value);
}

export function renderDetailStat(label = "", value = "") {
  return stat(label, value);
}

export { renderSectionCard };

/* =========================================================
   HEADER ACTIONS
========================================================= */

export function renderHeaderActions({
  factura = {},
  sending = false,
  viewingPdf = false,
  downloading = false,
} = {}) {
  const facturaId = getFacturaId(factura);
  const pdfAvailable = getFacturaPdfAvailable(factura);

  return `
    <div class="facturas-detail-actions">
      <button
        type="button"
        class="facturas-detail-btn"
        data-action="view-factura-pdf"
        data-facturas-action="view-factura-pdf"
        data-factura-id="${escapeHtml(facturaId)}"
        ${pdfAvailable && !viewingPdf ? "" : "disabled aria-disabled=\"true\""}
      >
        ${viewingPdf ? renderActionSpinner("Abriendo...") : "Ver PDF"}
      </button>

      <button
        type="button"
        class="facturas-detail-btn"
        data-action="download-factura"
        data-facturas-action="download-factura"
        data-factura-id="${escapeHtml(facturaId)}"
        ${pdfAvailable && !downloading ? "" : "disabled aria-disabled=\"true\""}
      >
        ${downloading ? renderActionSpinner("Bajando...") : "Descargar"}
      </button>

      <button
        type="button"
        class="facturas-detail-btn facturas-detail-btn--primary"
        data-action="send-factura"
        data-facturas-action="send-factura"
        data-factura-id="${escapeHtml(facturaId)}"
        ${sending ? "disabled aria-disabled=\"true\"" : ""}
      >
        ${sending ? renderActionSpinner("Enviando...") : "Enviar"}
      </button>

      <button
        type="button"
        class="facturas-detail-btn facturas-detail-btn--close"
        data-action="close-factura-detail"
        data-facturas-action="close-factura-detail"
        aria-label="Cerrar modal"
        title="Cerrar"
      >
        ✕
      </button>
    </div>
  `;
}

/* =========================================================
   CONTENT SECTIONS
========================================================= */

function renderHeroMeta(factura = {}) {
  const servicioAt = getFacturaServicioAt(factura);

  return `
    <div class="facturas-detail-meta-grid">
      ${mini("Número legal", getFacturaNumero(factura))}
      ${mini("Fecha emisión", formatDate(getFacturaFecha(factura)))}
      ${mini("Servicio", servicioAt ? formatDate(servicioAt) : "—")}
      ${mini("Forma de pago", getFacturaFormaPago(factura))}
      ${renderIncidenciaMini(factura)}
      ${mini("Enviado a", getFacturaEnviadoA(factura))}
      ${mini("Pagado", formatMoney(getFacturaPagado(factura), getFacturaMoneda(factura)))}
      ${mini("Pendiente", formatMoney(getFacturaPendiente(factura), getFacturaMoneda(factura)))}
    </div>
  `;
}

function renderResumenSection(factura = {}) {
  const moneda = getFacturaMoneda(factura);

  return renderSectionCard({
    title: "Resumen económico",
    subtitle: "Vista principal del documento y del cierre financiero.",
    content: `
      <div class="facturas-detail-stats-grid">
        ${stat("Total", formatMoney(getFacturaTotal(factura), moneda))}
        ${stat("Base imponible", formatMoney(getFacturaBase(factura), moneda))}
        ${stat("Impuestos netos", formatMoney(getFacturaImpuestos(factura), moneda))}
        ${stat("Pago", getFacturaEstadoPagoLabel(factura))}
      </div>
    `,
  });
}

function renderImpuestosSection(factura = {}) {
  const moneda = getFacturaMoneda(factura);
  const breakdown = getImpuestosBreakdown(factura);

  const cards = [];

  if (breakdown.iva) {
    cards.push(taxCard("IVA", breakdown.iva, moneda, "iva"));
  }

  if (breakdown.irpf) {
    cards.push(taxCard("IRPF", breakdown.irpf, moneda, "irpf"));
  }

  breakdown.otros.forEach((item) => {
    cards.push(taxCard(item.tipo, item, moneda, "neutral"));
  });

  return renderSectionCard({
    title: "Impuestos",
    subtitle: "Desglose fiscal real: IVA, IRPF/retenciones y otros conceptos detectados en la factura.",
    content: cards.length
      ? `<div class="facturas-detail-tax-grid">${cards.join("")}</div>`
      : mini("Desglose", "Sin desglose fiscal disponible"),
  });
}

function renderDescripcionSection(factura = {}) {
  const incidenciaId = getFacturaIncidenciaId(factura);
  const incidenciaSubject = getFacturaIncidenciaSubject(factura);
  const preview = getFacturaPreview(factura);

  return renderSectionCard({
    title: "Descripción / incidencia",
    subtitle: incidenciaId
      ? `Vinculada con ${incidenciaId}${incidenciaSubject ? ` · ${incidenciaSubject}` : ""}`
      : "",
    content: `
      <div class="facturas-detail-description">
        ${escapeHtml(preview)}
      </div>
    `,
  });
}

function renderLineaItem(linea = {}, moneda = DEFAULT_CURRENCY) {
  const item = safeObject(linea);
  const descripcion = getLineaDescripcion(item);
  const ivaPct = getLineaIvaPct(item);
  const irpfPct = getLineaIrpfPct(item);

  return `
    <article class="facturas-detail-linea">
      <div class="facturas-detail-linea-top">
        <div class="facturas-detail-linea-copy">
          <strong class="facturas-detail-linea-title">
            ${escapeHtml(getLineaConcepto(item))}
          </strong>

          ${
            descripcion
              ? `<span class="facturas-detail-linea-desc">${escapeHtml(descripcion)}</span>`
              : ""
          }

          ${
            ivaPct || irpfPct
              ? `
                <div class="facturas-detail-chip-row">
                  ${ivaPct ? renderChip(`IVA ${formatPercent(ivaPct)}`, "success") : ""}
                  ${irpfPct ? renderChip(`IRPF ${formatPercent(irpfPct)}`, "danger") : ""}
                </div>
              `
              : ""
          }
        </div>

        <strong class="facturas-detail-linea-amount">
          ${escapeHtml(formatMoney(getLineaSubtotal(item), moneda))}
        </strong>
      </div>

      <div class="facturas-detail-linea-grid">
        ${mini("Cantidad", String(getLineaCantidad(item)))}
        ${mini("Unitario", formatMoney(getLineaUnitario(item), moneda))}
        ${mini("Base línea", formatMoney(getLineaSubtotal(item), moneda))}
      </div>
    </article>
  `;
}

function renderLineasSection(factura = {}) {
  const lineas = getLineas(factura);
  const moneda = getFacturaMoneda(factura);

  return renderSectionCard({
    title: "Conceptos",
    subtitle: "Líneas facturadas y base económica de cada concepto.",
    content: lineas.length
      ? `<div class="facturas-detail-lineas">${lineas.map((linea) => renderLineaItem(linea, moneda)).join("")}</div>`
      : mini("Líneas", "Sin líneas"),
  });
}

function renderEnvioSection(factura = {}) {
  const fechaEnvio = getFacturaFechaEnvio(factura);
  const enviadoA = getFacturaEnviadoA(factura);

  if (!fechaEnvio && enviadoA === "—") {
    return "";
  }

  return renderSectionCard({
    title: "Envío",
    subtitle: "Información de entrega del documento fiscal.",
    content: `
      <div class="facturas-detail-meta-grid">
        ${mini("Enviado a", enviadoA)}
        ${mini("Fecha envío", fechaEnvio ? formatDateTime(fechaEnvio) : "—")}
        ${mini("PDF", getFacturaPdfAvailable(factura) ? "Disponible" : "No disponible")}
        ${mini("Última actualización", formatDateTime(getFacturaUpdatedAt(factura)))}
      </div>
    `,
  });
}

/* =========================================================
   CONTENT
========================================================= */

export function renderFacturasDetailContent({
  factura = null,
  loading = false,
  sendingFacturaId = "",
  viewingFacturaId = "",
  downloadingFacturaId = "",
} = {}) {
  if (loading) {
    return `
      <div class="facturas-detail-loading">
        <div class="facturas-detail-skeleton facturas-detail-skeleton--hero"></div>
        <div class="facturas-detail-skeleton facturas-detail-skeleton--summary"></div>
        <div class="facturas-detail-skeleton facturas-detail-skeleton--body"></div>
      </div>
    `;
  }

  if (!factura) {
    return `
      <div class="facturas-detail-body">
        ${mini("Detalle", "No disponible")}
      </div>
    `;
  }

  const facturaId = getFacturaId(factura);
  const sending = String(sendingFacturaId) === String(facturaId);
  const viewingPdf = String(viewingFacturaId) === String(facturaId);
  const downloading = String(downloadingFacturaId) === String(facturaId);

  const paymentRaw = getFacturaEstadoPagoRaw(factura);
  const estadoRaw = getFacturaEstadoRaw(factura);
  const numeroSistema = getFacturaSistema(factura);
  const clienteEmail = getClienteEmail(factura);
  const empresa = getClienteEmpresa(factura);
  const clienteNombre = getClienteNombre(factura);

  return `
    <div class="facturas-detail-layout">
      <header class="facturas-detail-header">
        <div class="facturas-detail-hero">
          <div class="facturas-detail-identity">
            ${renderAvatar(factura)}

            <div class="facturas-detail-title-stack">
              <div class="facturas-detail-chip-row">
                <span class="facturas-detail-number">
                  ${escapeHtml(getFacturaNumero(factura))}
                </span>

                ${
                  numeroSistema && numeroSistema !== getFacturaNumero(factura)
                    ? `<span class="facturas-detail-system-number">${escapeHtml(numeroSistema)}</span>`
                    : ""
                }

                ${renderChip(
                  getFacturaEstadoPagoLabel(factura),
                  getEstadoPagoTone(paymentRaw)
                )}

                ${renderChip(
                  getFacturaEstadoLabel(factura),
                  getEstadoTone(estadoRaw)
                )}
              </div>

              <div class="facturas-detail-title-extra">
                <h2 class="facturas-detail-title">
                  ${escapeHtml(empresa || clienteNombre)}
                </h2>

                ${
                  empresa && empresa !== clienteNombre
                    ? `<span class="facturas-detail-subtitle">${escapeHtml(clienteNombre)}</span>`
                    : ""
                }

                ${
                  clienteEmail
                    ? `<span class="facturas-detail-subtitle">${escapeHtml(clienteEmail)}</span>`
                    : ""
                }

                <span class="facturas-detail-subtitle">
                  Última actualización ${escapeHtml(formatRelativeDate(getFacturaUpdatedAt(factura)))}
                </span>
              </div>
            </div>
          </div>

          ${renderHeaderActions({
            factura,
            sending,
            viewingPdf,
            downloading,
          })}
        </div>

        ${renderHeroMeta(factura)}
      </header>

      <div class="facturas-detail-body-shell">
        <div class="facturas-detail-body">
          ${renderResumenSection(factura)}
          ${renderImpuestosSection(factura)}
          ${renderDescripcionSection(factura)}
          ${renderLineasSection(factura)}
          ${renderEnvioSection(factura)}
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   MODAL
========================================================= */

export function renderFacturasDetailModal({
  detailOpen = false,
  detailLoading = false,
  factura = null,
  sendingFacturaId = "",
  viewingFacturaId = "",
  downloadingFacturaId = "",
} = {}) {
  if (!detailOpen) return "";

  return `
    <div
      class="facturas-detail-overlay"
      data-facturas-detail-overlay="true"
    >
      <div
        class="facturas-detail-modal"
        data-role="facturas-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Detalle factura"
      >
        ${renderFacturasDetailContent({
          factura,
          loading: detailLoading,
          sendingFacturaId,
          viewingFacturaId,
          downloadingFacturaId,
        })}
      </div>
    </div>
  `;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  renderMiniMeta,
  renderDetailStat,
  renderSectionCard,
  renderHeaderActions,
  renderFacturasDetailContent,
  renderFacturasDetailModal,
};
