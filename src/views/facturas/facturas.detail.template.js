/* =========================================================
   Onion SPA - Facturas Detail Template
   Archivo: src/views/facturas/facturas.detail.template.js

   FACTURAS DETAIL MODAL · VISUAL 1:1 CON INCIDENCIAS MODE
   FINAL PRO SYSTEM · DETAIL MODAL · COMPACT VERSION

   RESPONSABILIDADES:
   - renderizar modal premium centrado de detalle de factura
   - mantener compatibilidad con facturasView.js
   - soportar estado loading / sending / acciones del header
   - exponer exports legacy para imports antiguos
   - mantener data-action estables para bindings existentes
   - eliminar secciones Cliente y Metadata
   - mostrar IVA / IRPF / retenciones / otros impuestos cuando existan
   - mostrar incidencia vinculada como acción modal
   - no usar navegación a URL inexistente para incidencia
   - quitar "Total línea"
   - cerrar modal con botón aspa X
========================================================= */

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "—") {
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
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatMoney(value, currency = "EUR") {
  const amount = safeNumber(value, 0);
  const code = safeText(currency, "EUR");

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

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
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

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
  if (!value) return "Sin fecha";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

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
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return safeText(
    first(
      item.id,
      item._id,
      item.facturaId,
      item.invoiceId,
      item.numero,
      item.numeroFacturaLegal,
      item.numeroFacturaSistema,

      raw.id,
      raw._id,
      raw.facturaId,
      raw.invoiceId,
      raw.numero,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema
    ),
    ""
  );
}

function getFacturaNumero(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return safeText(
    first(
      item.numero,
      item.numeroFacturaLegal,
      item.numeroFacturaSistema,
      item.code,
      item.facturaCode,
      item.invoiceNumber,

      raw.numero,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema,
      raw.code,
      raw.facturaCode,
      raw.invoiceNumber
    ),
    "—"
  );
}

function getClienteNombre(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return safeText(
    first(
      item.cliente?.nombreContacto,
      item.cliente?.empresa,
      item.cliente?.razonSocial,
      item.cliente?.nombreCompleto,
      item.cliente?.nombre,
      item.cliente?.name,
      item.clienteEmpresa,
      item.clienteNombre,
      item.clientName,
      item.customerName,

      raw.cliente?.nombreContacto,
      raw.cliente?.empresa,
      raw.cliente?.razonSocial,
      raw.cliente?.nombreCompleto,
      raw.cliente?.nombre,
      raw.cliente?.name,
      raw.clienteEmpresa,
      raw.clienteNombre,
      raw.clientName,
      raw.customerName
    ),
    "Cliente"
  );
}

function getClienteEmail(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return safeText(
    first(
      item.cliente?.email,
      item.cliente?.mail,
      item.clienteEmail,
      item.emailCliente,
      item.email,
      item.clientEmail,
      item.customerEmail,

      raw.cliente?.email,
      raw.cliente?.mail,
      raw.clienteEmail,
      raw.emailCliente,
      raw.email,
      raw.clientEmail,
      raw.customerEmail
    ),
    ""
  );
}

function getFacturaFecha(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return first(
    item.fecha,
    item.fechaFactura,
    item.date,
    item.issueDate,
    item.createdAt,
    item.updatedAt,

    raw.fecha,
    raw.fechaFactura,
    raw.date,
    raw.issueDate,
    raw.createdAt,
    raw.updatedAt
  );
}

function getFacturaUpdatedAt(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return first(
    item.updatedAt,
    item.fechaEnvio,
    item.sentAt,
    item.fecha,
    item.createdAt,

    raw.updatedAt,
    raw.fechaEnvio,
    raw.sentAt,
    raw.fecha,
    raw.createdAt
  );
}

function getFacturaFechaEnvio(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return first(
    item.fechaEnvio,
    item.sentAt,
    item.mailSentAt,

    raw.fechaEnvio,
    raw.sentAt,
    raw.mailSentAt
  );
}

function getFacturaFormaPago(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return safeText(
    first(
      item.formaPago,
      item.metodoPago,
      item.paymentMethod,

      raw.formaPago,
      raw.metodoPago,
      raw.paymentMethod
    ),
    "—"
  );
}

function getFacturaMoneda(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return safeText(
    first(
      item.moneda,
      item.currency,

      raw.moneda,
      raw.currency
    ),
    "EUR"
  );
}

function getFacturaTotal(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return safeNumber(
    first(
      item.total,
      item.amount,
      item.importe,
      item.importeTotal,

      raw.total,
      raw.amount,
      raw.importe,
      raw.importeTotal
    ),
    0
  );
}

function getFacturaBase(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return safeNumber(
    first(
      item.baseImponible,
      item.subtotal,
      item.base,

      raw.baseImponible,
      raw.subtotal,
      raw.base
    ),
    0
  );
}

function getFacturaImpuestos(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return safeNumber(
    first(
      item.impuestosTotal,
      item.taxTotal,
      item.totalImpuestos,
      item.tax,
      item.iva,
      item.ivaImporte,
      item.importeIva,

      raw.impuestosTotal,
      raw.taxTotal,
      raw.totalImpuestos,
      raw.tax,
      raw.iva,
      raw.ivaImporte,
      raw.importeIva
    ),
    0
  );
}

function getFacturaEnviadoA(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return safeText(
    first(
      item.enviadoA,
      item.sentTo,
      item.cliente?.email,
      item.emailCliente,

      raw.enviadoA,
      raw.sentTo,
      raw.cliente?.email,
      raw.emailCliente
    ),
    "—"
  );
}

function getFacturaPdfAvailable(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return Boolean(
    item.pdfAvailable ||
      item.hasPdf ||
      item.blobPath ||
      item.pdfUrl ||
      item.pdf ||

      raw.pdfAvailable ||
      raw.hasPdf ||
      raw.blobPath ||
      raw.pdfUrl ||
      raw.pdf
  );
}

function getFacturaPreview(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return safeText(
    first(
      item.descripcion,
      item.concepto,
      item.preview,
      item.description,
      item.lineas?.[0]?.descripcion,
      item.lineas?.[0]?.concepto,

      raw.descripcion,
      raw.concepto,
      raw.preview,
      raw.description,
      raw.lineas?.[0]?.descripcion,
      raw.lineas?.[0]?.concepto
    ),
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

function getFacturaIncidenciaId(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return safeText(
    first(
      item.ticketId,
      item.incidenciaId,

      item.incidencia?.ticketId,
      item.incidencia?.id,
      item.incidencia?.incidenciaId,

      item.ticket?.ticketId,
      item.ticket?.id,
      item.ticket?.incidenciaId,

      item.linkedTicket?.ticketId,
      item.linkedTicket?.id,
      item.linkedTicket?.incidenciaId,

      item.relatedTicketId,
      item.relatedIncidentId,
      item.supportTicketId,
      item.caseId,

      item.meta?.ticketId,
      item.meta?.incidenciaId,

      pickTicketIdFromArray(item.ticketIds),
      pickTicketIdFromArray(item.incidenciaIds),
      pickTicketIdFromArray(item.relatedTicketIds),
      pickTicketIdFromArray(item.relatedIncidentIds),
      pickTicketIdFromArray(item.linkedTickets),
      pickTicketIdFromArray(item.incidencias),
      pickTicketIdFromArray(item.tickets),
      pickTicketIdFromArray(item.relatedTickets),
      pickTicketIdFromArray(item.relations),
      pickTicketIdFromArray(item.facturasRelacionadas),
      pickTicketIdFromArray(item.linkedInvoices?.tickets),

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
      pickTicketIdFromArray(raw.relations),
      pickTicketIdFromArray(raw.facturasRelacionadas),
      pickTicketIdFromArray(raw.linkedInvoices?.tickets)
    ),
    ""
  );
}

/* =========================================================
   DOMAIN HELPERS · LÍNEAS
========================================================= */

function getLineaConcepto(linea = {}) {
  return safeText(
    first(
      linea?.concepto,
      linea?.descripcion,
      linea?.description,
      linea?.name
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

function getLineaTotal(linea = {}) {
  const explicit = first(
    linea?.totalLinea,
    linea?.total,
    linea?.importe
  );

  if (explicit !== null && explicit !== undefined && explicit !== "") {
    return safeNumber(explicit, 0);
  }

  return getLineaSubtotal(linea);
}

/* =========================================================
   STATUS HELPERS
========================================================= */

function getEstadoPagoLabel(value = "") {
  const key = String(value || "").trim().toLowerCase();

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
      return "Pago parcial";

    default:
      return safeText(value, "Pendiente");
  }
}

function getEstadoLabel(value = "") {
  const key = String(value || "").trim().toLowerCase();

  switch (key) {
    case "emitida":
    case "issued":
      return "Emitida";

    case "enviada":
    case "sent":
      return "Enviada";

    case "anulada":
    case "void":
      return "Anulada";

    case "borrador":
    case "draft":
      return "Borrador";

    case "cancelada":
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

function getFacturaEstadoPagoLabel(factura = {}) {
  return getEstadoPagoLabel(
    first(
      factura?.estadoPago,
      factura?.paymentStatus,
      factura?.raw?.estadoPago,
      factura?.raw?.paymentStatus
    )
  );
}

function getFacturaEstadoLabel(factura = {}) {
  return getEstadoLabel(
    first(
      factura?.estado,
      factura?.status,
      factura?.raw?.estado,
      factura?.raw?.status
    )
  );
}

function getEstadoPagoChipStyle(value = "") {
  const key = String(value || "").trim().toLowerCase();

  if (["paid", "pagada", "pagado", "cobrada", "abonada"].includes(key)) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  if (["pending", "pendiente", "partial", "parcial", "unpaid"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  if (["overdue", "vencida"].includes(key)) {
    return `
      color:var(--danger-strong, #ff6b6b);
      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
    `;
  }

  if (["cancelled", "canceled", "cancelada", "cancelado"].includes(key)) {
    return `
      color:var(--text-dim);
      background:var(--surface-glass);
      border:1px solid var(--border-soft);
    `;
  }

  return `
    color:var(--text-soft);
    background:var(--surface-glass);
    border:1px solid var(--border-soft);
  `;
}

function getEstadoChipStyle(value = "") {
  const key = String(value || "").trim().toLowerCase();

  if (["emitida", "issued"].includes(key)) {
    return `
      color:var(--accent-strong, var(--accent, #7c5cff));
      background:color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 26%, transparent);
    `;
  }

  if (["enviada", "sent"].includes(key)) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  if (["anulada", "void", "cancelada", "cancelled", "canceled"].includes(key)) {
    return `
      color:var(--danger-strong, #ff6b6b);
      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
    `;
  }

  if (["borrador", "draft"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  if (["abonada", "paid"].includes(key)) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  return `
    color:var(--text-soft);
    background:var(--surface-glass);
    border:1px solid var(--border-soft);
  `;
}

/* =========================================================
   IMPUESTOS
========================================================= */

function getImpuestosBreakdown(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  const impuestos = safeArray(
    first(
      item.impuestos,
      item.taxes,
      item.taxLines,
      item.desgloseImpuestos,

      raw.impuestos,
      raw.taxes,
      raw.taxLines,
      raw.desgloseImpuestos
    )
  );

  let iva = null;
  let irpf = null;
  const otros = [];

  impuestos.forEach((entry) => {
    const impuesto = safeObject(entry);

    const tipo = normalizeText(
      first(
        impuesto.tipo,
        impuesto.nombre,
        impuesto.name,
        impuesto.code,
        impuesto.label
      )
    );

    const normalized = {
      tipo: safeText(
        first(
          impuesto.tipo,
          impuesto.nombre,
          impuesto.name,
          impuesto.label
        ),
        "Impuesto"
      ),

      porcentaje: safeNumber(
        first(
          impuesto.porcentaje,
          impuesto.percent,
          impuesto.rate,
          impuesto.tipoPorcentaje
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
    };

    if (tipo.includes("iva") || tipo.includes("vat")) {
      iva = normalized;
      return;
    }

    if (
      tipo.includes("irpf") ||
      tipo.includes("retencion") ||
      tipo.includes("retención") ||
      tipo.includes("withholding")
    ) {
      irpf = normalized;
      return;
    }

    otros.push(normalized);
  });

  const ivaImporte = safeNumber(
    first(
      item.ivaImporte,
      item.importeIva,
      item.totalIva,
      item.ivaTotal,
      item.ivaAmount,
      item.tax,
      item.taxAmount,
      item.iva,

      raw.ivaImporte,
      raw.importeIva,
      raw.totalIva,
      raw.ivaTotal,
      raw.ivaAmount,
      raw.tax,
      raw.taxAmount,
      raw.iva
    ),
    0
  );

  const ivaPorcentaje = safeNumber(
    first(
      item.ivaPorcentaje,
      item.porcentajeIva,
      item.ivaRate,
      item.taxRate,

      raw.ivaPorcentaje,
      raw.porcentajeIva,
      raw.ivaRate,
      raw.taxRate
    ),
    0
  );

  if (!iva && ivaImporte) {
    iva = {
      tipo: "IVA",
      porcentaje: ivaPorcentaje,
      importe: ivaImporte,
    };
  }

  const irpfImporte = safeNumber(
    first(
      item.irpfImporte,
      item.importeIrpf,
      item.totalIrpf,
      item.irpfTotal,
      item.irpfAmount,
      item.retencion,
      item.retencionIrpf,
      item.withholding,
      item.withholdingAmount,
      item.irpf,

      raw.irpfImporte,
      raw.importeIrpf,
      raw.totalIrpf,
      raw.irpfTotal,
      raw.irpfAmount,
      raw.retencion,
      raw.retencionIrpf,
      raw.withholding,
      raw.withholdingAmount,
      raw.irpf
    ),
    0
  );

  const irpfPorcentaje = safeNumber(
    first(
      item.irpfPorcentaje,
      item.porcentajeIrpf,
      item.irpfRate,
      item.retencionPorcentaje,
      item.withholdingRate,

      raw.irpfPorcentaje,
      raw.porcentajeIrpf,
      raw.irpfRate,
      raw.retencionPorcentaje,
      raw.withholdingRate
    ),
    0
  );

  if (!irpf && irpfImporte) {
    irpf = {
      tipo: "IRPF",
      porcentaje: irpfPorcentaje,
      importe: irpfImporte,
    };
  }

  const impuestosTotal = safeNumber(
    first(
      item.impuestosTotal,
      item.taxTotal,
      item.totalImpuestos,

      raw.impuestosTotal,
      raw.taxTotal,
      raw.totalImpuestos
    ),
    0
  );

  if (!iva && !irpf && !otros.length && impuestosTotal) {
    otros.push({
      tipo: "Impuestos",
      porcentaje: 0,
      importe: impuestosTotal,
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

function chip(label = "", style = "") {
  return `
    <span
      style="
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:30px;
        padding:0 10px;
        border-radius:999px;
        font-size:11px;
        font-weight:700;
        letter-spacing:.05em;
        text-transform:uppercase;
        white-space:nowrap;
        ${style || "border:1px solid var(--border-soft); background:var(--surface-glass); color:var(--text-soft);"}
      "
    >
      ${escapeHtml(label)}
    </span>
  `;
}

function renderActionSpinner(label = "") {
  return `
    <span style="display:inline-flex; align-items:center; gap:8px;">
      <span
        aria-hidden="true"
        style="
          width:14px;
          height:14px;
          border-radius:999px;
          border:2px solid color-mix(in srgb, currentColor 24%, transparent);
          border-top-color:currentColor;
          animation:facturasDetailSpin .8s linear infinite;
        "
      ></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function stat(label = "", value = "") {
  return `
    <article
      style="
        display:grid;
        gap:8px;
        min-height:92px;
        padding:16px;
        border-radius:18px;
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
      "
    >
      <span
        style="
          font-size:11px;
          color:var(--text-faint);
          text-transform:uppercase;
          letter-spacing:.05em;
          font-weight:700;
        "
      >
        ${escapeHtml(label)}
      </span>

      <strong
        style="
          font-size:24px;
          line-height:1.05;
          color:var(--text-strong);
          word-break:break-word;
        "
      >
        ${escapeHtml(value)}
      </strong>
    </article>
  `;
}

function mini(label = "", value = "") {
  return `
    <div
      style="
        display:grid;
        gap:6px;
        padding:12px;
        border-radius:14px;
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
      "
    >
      <span
        style="
          font-size:10px;
          color:var(--text-faint);
          text-transform:uppercase;
          font-weight:700;
          letter-spacing:.08em;
        "
      >
        ${escapeHtml(label)}
      </span>

      <strong
        style="
          color:var(--text-strong);
          font-size:13px;
          line-height:1.4;
          word-break:break-word;
        "
      >
        ${escapeHtml(value)}
      </strong>
    </div>
  `;
}

function renderSectionCard({
  title = "",
  subtitle = "",
  content = "",
} = {}) {
  return `
    <section
      style="
        display:grid;
        gap:12px;
        padding:16px;
        border-radius:18px;
        border:1px solid var(--border-soft);
        background:var(--surface-glass);
      "
    >
      <div style="display:grid; gap:4px;">
        <h3
          style="
            margin:0;
            color:var(--text-strong);
            font-size:18px;
            letter-spacing:-.02em;
          "
        >
          ${escapeHtml(title)}
        </h3>

        ${
          subtitle
            ? `
              <p
                style="
                  margin:0;
                  color:var(--text-dim);
                  line-height:1.55;
                  font-size:12px;
                "
              >
                ${escapeHtml(subtitle)}
              </p>
            `
            : ""
        }
      </div>

      ${content}
    </section>
  `;
}

function renderAvatar(factura = {}) {
  const raw = safeText(getClienteNombre(factura), "ON");
  const parts = raw.split(/\s+/).filter(Boolean);

  const initials =
    parts.length >= 2
      ? `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase()
      : raw.slice(0, 2).toUpperCase();

  return `
    <div
      style="
        position:relative;
        flex:0 0 76px;
        width:76px;
        height:76px;
        border-radius:22px;
        display:grid;
        place-items:center;
        background:linear-gradient(135deg, rgba(124,92,255,.36), rgba(88,72,200,.18));
        border:1px solid rgba(124,92,255,.28);
        color:#efeaff;
        font-size:22px;
        font-weight:800;
        letter-spacing:.03em;
        box-shadow:0 12px 28px rgba(124,92,255,.18);
      "
    >
      ${escapeHtml(initials || "ON")}
    </div>
  `;
}

function renderIncidenciaMini(factura = {}) {
  const incidenciaId = getFacturaIncidenciaId(factura);

  if (!incidenciaId) {
    return mini("Incidencia", "Sin vincular");
  }

  return `
    <div
      style="
        display:grid;
        gap:6px;
        padding:12px;
        border-radius:14px;
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
      "
    >
      <span
        style="
          font-size:10px;
          color:var(--text-faint);
          text-transform:uppercase;
          font-weight:700;
          letter-spacing:.08em;
        "
      >
        Incidencia
      </span>

      <button
        type="button"
        data-action="open-incidencia"
        data-ticket-id="${escapeHtml(incidenciaId)}"
        data-incidencia-id="${escapeHtml(incidenciaId)}"
        style="
          justify-self:start;
          max-width:100%;
          min-height:28px;
          padding:0 10px;
          border-radius:999px;
          border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft));
          background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
          color:var(--accent-strong, var(--accent, #7c5cff));
          font-size:11px;
          font-weight:800;
          letter-spacing:.04em;
          text-transform:uppercase;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
          cursor:pointer;
        "
        title="Abrir incidencia relacionada"
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
    <div
      style="
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        align-items:flex-start;
        justify-content:flex-end;
      "
    >
      <button
        type="button"
        data-action="view-factura-pdf"
        data-factura-id="${escapeHtml(facturaId)}"
        ${pdfAvailable && !viewingPdf ? "" : "disabled"}
        style="
          min-height:38px;
          padding:0 12px;
          border-radius:12px;
          border:1px solid var(--border-soft);
          background:var(--surface-glass);
          color:var(--text-soft);
          font-size:12px;
          font-weight:700;
          cursor:${pdfAvailable && !viewingPdf ? "pointer" : "not-allowed"};
          opacity:${pdfAvailable ? (viewingPdf ? ".78" : "1") : ".56"};
        "
      >
        ${viewingPdf ? renderActionSpinner("Abriendo...") : "Ver PDF"}
      </button>

      <button
        type="button"
        data-action="download-factura"
        data-factura-id="${escapeHtml(facturaId)}"
        ${pdfAvailable && !downloading ? "" : "disabled"}
        style="
          min-height:38px;
          padding:0 12px;
          border-radius:12px;
          border:1px solid var(--border-soft);
          background:var(--surface-glass);
          color:var(--text-soft);
          font-size:12px;
          font-weight:700;
          cursor:${pdfAvailable && !downloading ? "pointer" : "not-allowed"};
          opacity:${pdfAvailable ? (downloading ? ".78" : "1") : ".56"};
        "
      >
        ${downloading ? renderActionSpinner("Bajando...") : "Descargar"}
      </button>

      <button
        type="button"
        data-action="send-factura"
        data-factura-id="${escapeHtml(facturaId)}"
        ${sending ? "disabled" : ""}
        style="
          min-height:38px;
          padding:0 12px;
          border-radius:12px;
          border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent);
          background:var(--accent, #7c5cff);
          color:#fff;
          font-size:12px;
          font-weight:700;
          cursor:${sending ? "wait" : "pointer"};
          opacity:${sending ? ".82" : "1"};
          box-shadow:0 12px 28px color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent);
        "
      >
        ${sending ? renderActionSpinner("Enviando...") : "Enviar"}
      </button>

      <button
        type="button"
        data-action="close-factura-detail"
        aria-label="Cerrar modal"
        title="Cerrar"
        style="
          width:38px;
          height:38px;
          padding:0;
          border-radius:12px;
          border:1px solid var(--border-soft);
          background:transparent;
          color:var(--text-dim);
          font-size:18px;
          font-weight:700;
          cursor:pointer;
          display:inline-flex;
          align-items:center;
          justify-content:center;
        "
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
  return `
    <div
      class="facturas-detail-meta-grid"
      style="
        display:grid;
        grid-template-columns:repeat(4, minmax(0, 1fr));
        gap:10px;
      "
    >
      ${mini("Número", getFacturaNumero(factura))}
      ${mini("Fecha emisión", formatDate(getFacturaFecha(factura)))}
      ${mini("Forma de pago", getFacturaFormaPago(factura))}
      ${renderIncidenciaMini(factura)}
    </div>
  `;
}

function renderResumenSection(factura = {}) {
  const moneda = getFacturaMoneda(factura);

  return renderSectionCard({
    title: "Resumen económico",
    subtitle: "Vista principal del documento y del cierre financiero.",
    content: `
      <div
        class="facturas-detail-stats-grid"
        style="
          display:grid;
          grid-template-columns:repeat(4, minmax(0, 1fr));
          gap:12px;
        "
      >
        ${stat("Total", formatMoney(getFacturaTotal(factura), moneda))}
        ${stat("Base", formatMoney(getFacturaBase(factura), moneda))}
        ${stat("Impuestos", formatMoney(getFacturaImpuestos(factura), moneda))}
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
    cards.push(
      stat(
        `IVA${breakdown.iva.porcentaje ? ` (${breakdown.iva.porcentaje}%)` : ""}`,
        formatMoney(breakdown.iva.importe, moneda)
      )
    );
  }

  if (breakdown.irpf) {
    cards.push(
      stat(
        `IRPF${breakdown.irpf.porcentaje ? ` (${breakdown.irpf.porcentaje}%)` : ""}`,
        formatMoney(breakdown.irpf.importe, moneda)
      )
    );
  }

  breakdown.otros.forEach((item) => {
    cards.push(
      stat(
        `${item.tipo}${item.porcentaje ? ` (${item.porcentaje}%)` : ""}`,
        formatMoney(item.importe, moneda)
      )
    );
  });

  return renderSectionCard({
    title: "Impuestos",
    subtitle: "Desglose fiscal de IVA, IRPF y otros conceptos detectados en la factura.",
    content: cards.length
      ? `
        <div
          class="facturas-detail-tax-grid"
          style="
            display:grid;
            grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
            gap:12px;
          "
        >
          ${cards.join("")}
        </div>
      `
      : mini("Desglose", "Sin desglose fiscal disponible"),
  });
}

function renderDescripcionSection(factura = {}) {
  return renderSectionCard({
    title: "Incidencia",
    subtitle: "",
    content: `
      <div
        style="
          padding:14px;
          border-radius:16px;
          background:var(--surface-1, var(--surface-glass));
          border:1px solid var(--border-soft);
          color:var(--text-soft);
          font-size:13px;
          line-height:1.65;
          white-space:pre-wrap;
          word-break:break-word;
        "
      >
        ${escapeHtml(getFacturaPreview(factura))}
      </div>
    `,
  });
}

function renderLineaItem(linea = {}, moneda = "EUR") {
  const item = safeObject(linea);
  const descripcion = getLineaDescripcion(item);

  return `
    <article
      style="
        display:grid;
        gap:12px;
        padding:14px;
        border-radius:16px;
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
      "
    >
      <div
        style="
          display:flex;
          justify-content:space-between;
          gap:12px;
          flex-wrap:wrap;
          align-items:flex-start;
        "
      >
        <div style="display:grid; gap:4px; min-width:0;">
          <strong
            style="
              color:var(--text-strong);
              line-height:1.4;
              word-break:break-word;
              font-size:14px;
            "
          >
            ${escapeHtml(getLineaConcepto(item))}
          </strong>

          ${
            descripcion
              ? `
                <span
                  style="
                    color:var(--text-dim);
                    font-size:12px;
                    line-height:1.5;
                    word-break:break-word;
                  "
                >
                  ${escapeHtml(descripcion)}
                </span>
              `
              : ""
          }
        </div>

        <strong
          style="
            color:var(--text-strong);
            line-height:1.4;
            white-space:nowrap;
            font-size:14px;
          "
        >
          ${escapeHtml(formatMoney(getLineaTotal(item), moneda))}
        </strong>
      </div>

      <div
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(140px,1fr));
          gap:10px;
        "
      >
        ${mini("Cantidad", String(getLineaCantidad(item)))}
        ${mini("Unitario", formatMoney(getLineaUnitario(item), moneda))}
        ${mini("Subtotal", formatMoney(getLineaSubtotal(item), moneda))}
      </div>
    </article>
  `;
}

function renderLineasSection(factura = {}) {
  const lineas = safeArray(
    first(
      factura?.lineas,
      factura?.items,
      factura?.conceptos,

      factura?.raw?.lineas,
      factura?.raw?.items,
      factura?.raw?.conceptos
    )
  );

  const moneda = getFacturaMoneda(factura);

  return renderSectionCard({
    title: "Conceptos",
    subtitle: "",
    content: lineas.length
      ? `
        <div style="display:grid; gap:12px;">
          ${lineas.map((linea) => renderLineaItem(linea, moneda)).join("")}
        </div>
      `
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
    subtitle: "",
    content: `
      <div
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
          gap:12px;
        "
      >
        ${mini("Enviado a", enviadoA)}
        ${mini("Fecha envío", fechaEnvio ? formatDateTime(fechaEnvio) : "—")}
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
      <div style="padding:18px; display:grid; gap:16px;">
        <div style="height:88px; border-radius:18px; background:var(--surface-glass); border:1px solid var(--border-soft);"></div>
        <div style="height:120px; border-radius:18px; background:var(--surface-glass); border:1px solid var(--border-soft);"></div>
        <div style="height:240px; border-radius:18px; background:var(--surface-glass); border:1px solid var(--border-soft);"></div>
      </div>
    `;
  }

  if (!factura) {
    return `
      <div style="padding:18px;">
        ${mini("Detalle", "No disponible")}
      </div>
    `;
  }

  const facturaId = getFacturaId(factura);
  const sending = String(sendingFacturaId) === String(facturaId);
  const viewingPdf = String(viewingFacturaId) === String(facturaId);
  const downloading = String(downloadingFacturaId) === String(facturaId);

  return `
    <div
      style="
        display:flex;
        flex-direction:column;
        min-height:0;
        height:100%;
        max-height:100%;
      "
    >
      <header
        class="facturas-detail-header"
        style="
          position:sticky;
          top:0;
          z-index:4;
          display:grid;
          gap:16px;
          padding:22px 22px 18px;
          border-bottom:1px solid var(--border-soft);
          background:
            radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent 34%),
            linear-gradient(180deg, var(--surface-2, #151515), var(--surface-1, #121212));
        "
      >
        <div
          class="facturas-modal-hero"
          style="
            display:flex;
            justify-content:space-between;
            gap:16px;
            flex-wrap:wrap;
            align-items:flex-start;
          "
        >
          <div
            style="
              display:flex;
              gap:16px;
              align-items:center;
              min-width:0;
              flex:1 1 620px;
            "
          >
            ${renderAvatar(factura)}

            <div
              style="
                display:grid;
                gap:6px;
                min-width:0;
                flex:1 1 auto;
              "
            >
              <div
                style="
                  display:flex;
                  align-items:center;
                  gap:8px;
                  flex-wrap:wrap;
                  min-width:0;
                "
              >
                <span
                  style="
                    display:inline-flex;
                    align-items:center;
                    max-width:220px;
                    min-height:28px;
                    padding:0 9px;
                    border-radius:999px;
                    border:1px solid var(--border-soft);
                    background:var(--surface-glass);
                    color:var(--text-dim);
                    font-size:11px;
                    font-weight:700;
                    letter-spacing:.04em;
                    text-transform:uppercase;
                    white-space:nowrap;
                    overflow:hidden;
                    text-overflow:ellipsis;
                  "
                >
                  ${escapeHtml(getFacturaNumero(factura))}
                </span>

                ${chip(
                  getFacturaEstadoPagoLabel(factura),
                  getEstadoPagoChipStyle(
                    first(
                      factura?.estadoPago,
                      factura?.paymentStatus,
                      factura?.raw?.estadoPago,
                      factura?.raw?.paymentStatus
                    )
                  )
                )}

                ${chip(
                  getFacturaEstadoLabel(factura),
                  getEstadoChipStyle(
                    first(
                      factura?.estado,
                      factura?.status,
                      factura?.raw?.estado,
                      factura?.raw?.status
                    )
                  )
                )}
              </div>

              <div style="display:grid; gap:4px; min-width:0;">
                <h2
                  style="
                    margin:0;
                    color:var(--text-strong);
                    font-size:clamp(22px, 2.35vw, 32px);
                    line-height:.98;
                    letter-spacing:-.055em;
                    font-weight:var(--weight-black, 850);
                    word-break:break-word;
                  "
                >
                  ${escapeHtml(getClienteNombre(factura))}
                </h2>

                ${
                  getClienteEmail(factura)
                    ? `
                      <span
                        style="
                          color:var(--text-dim);
                          font-size:13px;
                          line-height:1.35;
                          word-break:break-word;
                        "
                      >
                        ${escapeHtml(getClienteEmail(factura))}
                      </span>
                    `
                    : ""
                }

                <span
                  style="
                    color:var(--text-dim);
                    font-size:12px;
                    line-height:1.42;
                  "
                >
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

      <div
        class="facturas-detail-body-shell"
        style="
          flex:1 1 auto;
          min-height:0;
          overflow:auto;
        "
      >
        <div
          style="
            padding:16px 18px 18px;
            display:grid;
            gap:16px;
          "
        >
          ${renderResumenSection(factura)}
          ${renderDescripcionSection(factura)}
          ${renderLineasSection(factura)}
          ${renderImpuestosSection(factura)}
          ${renderEnvioSection(factura)}
        </div>
      </div>
    </div>

    <style>
      @keyframes facturasDetailSpin {
        to { transform: rotate(360deg); }
      }

      .facturas-detail-body-shell {
        scrollbar-width: thin;
      }

      [data-theme="light"] .facturas-detail-header {
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 34%),
          linear-gradient(180deg, rgba(255,255,255,.96), rgba(250,251,255,.94)) !important;
      }

      @media (max-width: 980px) {
        .facturas-detail-meta-grid,
        .facturas-detail-stats-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }
      }

      @media (max-width: 720px) {
        .facturas-modal-hero {
          align-items:flex-start !important;
        }
      }

      @media (max-width: 640px) {
        .facturas-detail-header {
          padding: 16px !important;
        }

        .facturas-detail-body-shell > div {
          padding: 14px !important;
        }

        .facturas-detail-meta-grid,
        .facturas-detail-stats-grid {
          grid-template-columns: 1fr !important;
        }
      }
    </style>
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
      style="
        position:fixed;
        inset:0;
        z-index:9999;
        padding:20px;
        display:grid;
        place-items:center;
        background:rgba(0,0,0,.64);
        backdrop-filter:blur(8px);
      "
    >
      <div
        class="facturas-detail-modal"
        data-role="facturas-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Detalle factura"
        style="
          position:relative;
          width:min(1080px, 100%);
          max-height:92vh;
          overflow:hidden;
          border-radius:24px;
          border:1px solid var(--border-soft, #2b2b2b);
          background:
            radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent 34%),
            linear-gradient(180deg, var(--surface-2, #151515), var(--surface-1, #121212));
          box-shadow:0 34px 84px rgba(0,0,0,.40);
        "
      >
        ${renderFacturasDetailContent({
          factura,
          loading: detailLoading,
          sendingFacturaId,
          viewingFacturaId,
          downloadingFacturaId,
        })}

        <style>
          [data-theme="light"] .facturas-detail-modal{
            background:
              radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 34%),
              linear-gradient(180deg, rgba(255,255,255,.96), rgba(250,251,255,.94));
            box-shadow:
              0 30px 70px rgba(15,23,42,.14),
              0 0 0 1px rgba(255,255,255,.65) inset;
          }

          @media (max-width: 900px) {
            .facturas-detail-overlay {
              padding: 14px !important;
            }

            .facturas-detail-modal {
              width: 100% !important;
              max-height: 94vh !important;
              border-radius: 22px !important;
            }
          }

          @media (max-width: 640px) {
            .facturas-detail-overlay {
              padding: 10px !important;
            }

            .facturas-detail-modal {
              width: 100% !important;
              max-height: 96vh !important;
              border-radius: 18px !important;
            }
          }
        </style>
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
