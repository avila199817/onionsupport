/* =========================================================
   Onion SPA - Facturas Model (FULL PRO SAAS PANEL · GOD MODE)
   Archivo: src/views/facturas/facturas.model.js

   RESPONSABILIDADES:
   - helpers seguros de datos
   - formatters de facturas
   - normalización del backend
   - labels y estilos de estado
   - extracción robusta de payloads
   - utilidades de ordenación / métricas
   - mantener paridad operativa con facturasView.js

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - normalización estable para store / actions / template
   - soporte para envelope backend
   - métricas robustas
   - ordenación sin mutar origen
   - filtros seguros y predecibles
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const DEFAULT_FACTURAS_SORT = Object.freeze({
  field: "updatedAt",
  direction: "desc",
});

/* =========================================================
   HELPERS BASE
========================================================= */

function safeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function normalizeText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function round2(value) {
  return Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
}

function toMs(value) {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function pickFirst(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }

  return undefined;
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isLikelyFactura(value) {
  if (!isObject(value)) return false;

  return Boolean(
    value.id ||
      value._id ||
      value.facturaId ||
      value.numero ||
      value.code ||
      value.cliente ||
      value.client ||
      value.customer ||
      value.total !== undefined ||
      value.importeTotal !== undefined
  );
}

function looksLikeFacturasEnvelope(value) {
  const obj = safeObject(value);

  return Boolean(
    Array.isArray(obj.facturas) ||
      Array.isArray(obj.items) ||
      Array.isArray(obj.data) ||
      Array.isArray(obj.results) ||
      Array.isArray(obj.rows)
  );
}

function resolveNestedArrayEnvelope(value) {
  const obj = safeObject(value);

  if (Array.isArray(value)) return value;
  if (Array.isArray(obj.facturas)) return obj.facturas;
  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.results)) return obj.results;
  if (Array.isArray(obj.rows)) return obj.rows;

  if (looksLikeFacturasEnvelope(obj.data)) {
    return resolveNestedArrayEnvelope(obj.data);
  }

  if (looksLikeFacturasEnvelope(obj.payload)) {
    return resolveNestedArrayEnvelope(obj.payload);
  }

  if (looksLikeFacturasEnvelope(obj.result)) {
    return resolveNestedArrayEnvelope(obj.result);
  }

  return [];
}

/* =========================================================
   TEXTO / FORMATO
========================================================= */

export function truncate(value = "", max = 140) {
  const text = safeString(value);
  const size = Math.max(1, safeNumber(max, 140));

  if (text.length <= size) return text;
  return `${text.slice(0, size).trim()}…`;
}

export function formatMoney(value, currency = "EUR") {
  const amount = safeNumber(value);
  const code = safeString(currency, "EUR") || "EUR";

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

export function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatRelativeDate(value) {
  if (!value) return "Sin fecha";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const absMin = Math.abs(diffMin);

  if (absMin < 1) return "Ahora mismo";

  if (absMin < 60) {
    return diffMin > 0
      ? `En ${absMin} min`
      : `Hace ${absMin} min`;
  }

  const diffHours = Math.round(absMin / 60);

  if (diffHours < 24) {
    return diffMin > 0
      ? `En ${diffHours} h`
      : `Hace ${diffHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);

  if (diffDays <= 7) {
    return diffMin > 0
      ? `En ${diffDays} día${diffDays === 1 ? "" : "s"}`
      : `Hace ${diffDays} día${diffDays === 1 ? "" : "s"}`;
  }

  return formatDate(value);
}

export function getInitials(value = "") {
  return (
    String(value || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 2) || "ON"
  );
}

/* =========================================================
   ESTADOS
========================================================= */

export function normalizeEstadoPago(value = "pending") {
  const map = {
    pagada: "paid",
    pagado: "paid",
    paid: "paid",
    cobrada: "paid",
    abonada: "paid",

    pendiente: "pending",
    pending: "pending",
    unpaid: "pending",

    parcial: "partial",
    partial: "partial",

    vencida: "overdue",
    overdue: "overdue",

    borrador: "draft",
    draft: "draft",

    cancelada: "cancelled",
    cancelado: "cancelled",
    cancelled: "cancelled",
    canceled: "cancelled",
  };

  return map[normalizeText(value)] || "pending";
}

export function normalizeEstado(value = "issued") {
  const map = {
    emitida: "issued",
    emitido: "issued",
    issued: "issued",

    enviada: "sent",
    enviado: "sent",
    sent: "sent",

    anulada: "void",
    anulado: "void",
    void: "void",

    borrador: "draft",
    draft: "draft",

    cancelada: "cancelled",
    cancelado: "cancelled",
    cancelled: "cancelled",
    canceled: "cancelled",

    abonada: "paid",
    pagada: "paid",
    paid: "paid",
  };

  return map[normalizeText(value)] || "issued";
}

export function getEstadoPagoLabel(value = "pending") {
  const labels = {
    paid: "Pagada",
    pending: "Pendiente",
    partial: "Pago parcial",
    overdue: "Vencida",
    draft: "Borrador",
    cancelled: "Cancelada",
  };

  return labels[normalizeEstadoPago(value)] || "Pendiente";
}

export function getEstadoLabel(value = "issued") {
  const labels = {
    issued: "Emitida",
    sent: "Enviada",
    void: "Anulada",
    draft: "Borrador",
    cancelled: "Cancelada",
    paid: "Abonada",
  };

  return labels[normalizeEstado(value)] || "Emitida";
}

export function getEstadoPagoChipStyle(value = "pending") {
  const normalized = normalizeEstadoPago(value);

  const tones = {
    paid: `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `,
    pending: `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `,
    partial: `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `,
    overdue: `
      color:var(--danger-strong, #ff6b6b);
      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
    `,
    draft: `
      color:var(--accent-strong, var(--accent, #7c5cff));
      background:color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 26%, transparent);
    `,
    cancelled: `
      color:var(--text-dim);
      background:var(--surface-glass);
      border:1px solid var(--border-soft);
    `,
  };

  return tones[normalized] || tones.pending;
}

export function getEstadoChipStyle(value = "issued") {
  const normalized = normalizeEstado(value);

  const tones = {
    issued: `
      color:var(--accent-strong, var(--accent, #7c5cff));
      background:color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 26%, transparent);
    `,
    sent: `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `,
    void: `
      color:var(--danger-strong, #ff6b6b);
      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
    `,
    cancelled: `
      color:var(--danger-strong, #ff6b6b);
      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
    `,
    draft: `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `,
    paid: `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `,
  };

  return tones[normalized] || tones.issued;
}

/* =========================================================
   HELPERS FACTURA
========================================================= */

export function getFacturaNumero(item = {}) {
  const source = safeObject(item);

  return (
    safeString(source.numero) ||
    safeString(source.numeroFacturaLegal) ||
    safeString(source.numeroFacturaSistema) ||
    safeString(source.numeroFactura) ||
    safeString(source.code) ||
    safeString(source.facturaCode) ||
    safeString(source.id) ||
    safeString(source._id) ||
    "—"
  );
}

export function getFacturaFecha(item = {}) {
  const source = safeObject(item);

  return (
    safeString(source.fecha) ||
    safeString(source.fechaFactura) ||
    safeString(source.issuedAt) ||
    safeString(source.createdAt) ||
    null
  );
}

export function getFacturaUpdatedAt(item = {}) {
  const source = safeObject(item);

  return (
    safeString(source.updatedAt) ||
    safeString(source.fechaEnvio) ||
    safeString(source.sentAt) ||
    safeString(source.mailSentAt) ||
    safeString(source.modifiedAt) ||
    getFacturaFecha(source) ||
    null
  );
}

export function getFacturaClienteNombre(item = {}) {
  const source = safeObject(item);
  const cliente = safeObject(
    pickFirst(source.cliente, source.client, source.customer)
  );

  return (
    safeString(cliente.nombre) ||
    safeString(cliente.nombreContacto) ||
    safeString(cliente.empresa) ||
    safeString(cliente.razonSocial) ||
    safeString(cliente.name) ||
    safeString(source.clientName) ||
    safeString(source.customerName) ||
    safeString(source.owner?.name) ||
    safeString(source.name) ||
    "Cliente"
  );
}

export function getFacturaClienteEmpresa(item = {}) {
  const source = safeObject(item);
  const cliente = safeObject(
    pickFirst(source.cliente, source.client, source.customer)
  );

  return (
    safeString(cliente.empresa) ||
    safeString(cliente.razonSocial) ||
    safeString(cliente.nombreFiscal) ||
    safeString(cliente.nombre) ||
    safeString(cliente.nombreContacto) ||
    safeString(cliente.company) ||
    "-"
  );
}

export function getFacturaClienteEmail(item = {}) {
  const source = safeObject(item);
  const cliente = safeObject(
    pickFirst(source.cliente, source.client, source.customer)
  );

  return (
    safeString(cliente.email) ||
    safeString(cliente.mail) ||
    safeString(source.emailCliente) ||
    safeString(source.clientEmail) ||
    safeString(source.owner?.email) ||
    "-"
  );
}

export function getFacturaPreview(item = {}) {
  const source = safeObject(item);
  const firstLinea = safeObject(safeArray(source.lineas)[0]);

  return (
    safeString(source.preview) ||
    safeString(source.descripcion) ||
    safeString(source.concepto) ||
    safeString(firstLinea.descripcion) ||
    safeString(firstLinea.concepto) ||
    "Sin detalle"
  );
}

export function getFacturaCurrency(item = {}) {
  const source = safeObject(item);
  return safeString(
    pickFirst(source.moneda, source.currency),
    "EUR"
  ) || "EUR";
}

export function getFacturaTotal(item = {}) {
  const source = safeObject(item);

  return round2(
    pickFirst(
      source.total,
      source.importeTotal,
      source.amount,
      source.importe,
      source.resumen?.total,
      0
    )
  );
}

export function getFacturaBaseImponible(item = {}) {
  const source = safeObject(item);

  return round2(
    pickFirst(
      source.baseImponible,
      source.subtotal,
      source.taxableBase,
      source.resumen?.baseImponible,
      source.resumen?.subtotal,
      0
    )
  );
}

export function getFacturaImpuestosTotal(item = {}) {
  const source = safeObject(item);

  return round2(
    pickFirst(
      source.impuestosTotal,
      source.taxTotal,
      source.iva,
      source.resumen?.impuestosTotal,
      0
    )
  );
}

export function getFacturaDescuentoTotal(item = {}) {
  const source = safeObject(item);

  return round2(
    pickFirst(
      source.descuentoTotal,
      source.discountTotal,
      source.resumen?.descuentoTotal,
      0
    )
  );
}

export function isFacturaPaid(item = {}) {
  return normalizeEstadoPago(item?.estadoPago) === "paid";
}

export function isFacturaPending(item = {}) {
  const status = normalizeEstadoPago(item?.estadoPago);
  return status === "pending" || status === "partial";
}

export function isFacturaOverdue(item = {}) {
  return normalizeEstadoPago(item?.estadoPago) === "overdue";
}

/* =========================================================
   NORMALIZACIÓN PRINCIPAL
========================================================= */

export function normalizeFactura(item = {}) {
  const source = safeObject(item);
  const estadoPago = normalizeEstadoPago(
    pickFirst(source.estadoPago, source.paymentStatus, "pending")
  );
  const estado = normalizeEstado(
    pickFirst(source.estado, source.status, "issued")
  );

  const clienteNombre = getFacturaClienteNombre(source);
  const clienteEmpresa = getFacturaClienteEmpresa(source);
  const clienteEmail = getFacturaClienteEmail(source);

  const currency = getFacturaCurrency(source);
  const fecha = getFacturaFecha(source);
  const fechaEnvio =
    safeString(source.fechaEnvio) ||
    safeString(source.sentAt) ||
    safeString(source.mailSentAt) ||
    null;

  const updatedAt = getFacturaUpdatedAt(source);
  const lineas = safeArray(source.lineas);
  const impuestos = safeArray(source.impuestos);
  const attachments = safeArray(
    pickFirst(source.attachments, source.files, source.adjuntos)
  );

  const id =
    source.id ??
    source._id ??
    source.facturaId ??
    null;

  return {
    id,
    _id: source._id ?? null,
    facturaId: id,
    numero: getFacturaNumero(source),

    fecha,
    fechaEnvio,
    updatedAt,

    estadoPago,
    estado,

    total: getFacturaTotal(source),
    subtotal: round2(
      pickFirst(source.subtotal, source.resumen?.subtotal, 0)
    ),
    baseImponible: getFacturaBaseImponible(source),
    descuentoTotal: getFacturaDescuentoTotal(source),
    impuestosTotal: getFacturaImpuestosTotal(source),
    iva: round2(source.iva),
    irpf: round2(source.irpf),
    moneda: currency,
    currency,

    formaPago:
      safeString(source.formaPago) ||
      safeString(source.metodoPago) ||
      safeString(source.paymentMethod) ||
      "—",

    cuentaPago:
      safeString(source.cuentaPago) ||
      safeString(source.paymentAccount) ||
      "",

    preview: getFacturaPreview(source),

    lineasCount: safeNumber(
      source.lineasCount,
      lineas.length
    ),

    attachmentsCount: safeNumber(
      source.attachmentsCount,
      attachments.length
    ),

    hasPdf:
      source.hasPdf === true ||
      source.pdfAvailable === true ||
      Boolean(source.blobPath),

    pdfAvailable:
      source.pdfAvailable === true ||
      source.hasPdf === true ||
      Boolean(source.blobPath),

    blobPath: safeString(source.blobPath) || "",

    clienteId:
      source.clienteId ??
      source.cliente?.id ??
      source.client?.id ??
      source.customer?.id ??
      source.userId ??
      null,

    cliente: {
      id:
        source.cliente?.id ??
        source.client?.id ??
        source.customer?.id ??
        source.clienteId ??
        source.userId ??
        null,
      nombre: clienteNombre,
      nombreContacto:
        safeString(source?.cliente?.nombreContacto) ||
        safeString(source?.client?.contactName) ||
        clienteNombre,
      empresa: clienteEmpresa,
      razonSocial:
        safeString(source?.cliente?.razonSocial) ||
        safeString(source?.client?.company) ||
        clienteEmpresa,
      email: clienteEmail,
      telefono:
        safeString(source?.cliente?.telefono) ||
        safeString(source?.client?.phone) ||
        safeString(source?.telefonoCliente) ||
        "",
      nif:
        safeString(source?.cliente?.nif) ||
        safeString(source?.cliente?.vatId) ||
        "",
      avatar:
        source?.cliente?.avatar ??
        source?.client?.avatar ??
        source?.owner?.avatar ??
        null,
      initials: getInitials(
        clienteEmpresa !== "-" ? clienteEmpresa : clienteNombre
      ),
      direccion: {
        calle:
          safeString(source?.cliente?.direccion?.calle) ||
          safeString(source?.client?.address?.street),
        linea2:
          safeString(source?.cliente?.direccion?.linea2) ||
          safeString(source?.client?.address?.line2),
        cp:
          safeString(source?.cliente?.direccion?.cp) ||
          safeString(source?.client?.address?.zip),
        ciudad:
          safeString(source?.cliente?.direccion?.ciudad) ||
          safeString(source?.client?.address?.city),
        provincia:
          safeString(source?.cliente?.direccion?.provincia) ||
          safeString(source?.client?.address?.state),
        pais:
          safeString(source?.cliente?.direccion?.pais) ||
          safeString(source?.client?.address?.country),
      },
    },

    owner: {
      id: source?.owner?.id ?? source?.userId ?? null,
      name:
        safeString(source?.owner?.name) ||
        safeString(source?.name) ||
        "",
      email:
        safeString(source?.owner?.email) ||
        "",
      avatar: source?.owner?.avatar ?? null,
    },

    concepto:
      safeString(source.concepto) ||
      safeString(lineas[0]?.concepto) ||
      "Factura",

    descripcion:
      safeString(source.descripcion) ||
      safeString(lineas[0]?.descripcion) ||
      "",

    lineas: lineas.map((l, index) => {
      const linea = safeObject(l);

      return {
        id: linea.id ?? `linea-${index + 1}`,
        concepto: safeString(linea.concepto),
        descripcion: safeString(linea.descripcion),
        cantidad: safeNumber(linea.cantidad, 0),
        precioUnitario: round2(linea.precioUnitario),
        subtotal: round2(linea.subtotal),
        descuento: round2(linea.descuento),
        impuesto: round2(linea.impuesto),
        totalLinea: round2(
          pickFirst(linea.totalLinea, linea.total, linea.importe, 0)
        ),
      };
    }),

    impuestos: impuestos.map((i) => {
      const impuesto = safeObject(i);

      return {
        tipo: safeString(impuesto.tipo),
        nombre: safeString(impuesto.nombre || impuesto.tipo),
        porcentaje: safeNumber(impuesto.porcentaje, 0),
        base: round2(impuesto.base),
        importe: round2(impuesto.importe),
      };
    }),

    attachments: attachments.map((entry, index) => {
      const file = safeObject(entry);

      return {
        id: file.id ?? `attachment-${index + 1}`,
        name:
          safeString(file.name) ||
          safeString(file.filename) ||
          safeString(file.fileName) ||
          `archivo_${index + 1}`,
        url:
          safeString(file.url) ||
          safeString(file.href) ||
          safeString(file.path) ||
          safeString(file.downloadUrl) ||
          "#",
        size: safeNumber(file.size, 0),
        raw: file,
      };
    }),

    notas:
      safeString(source.notas) ||
      safeString(source.observaciones) ||
      "",

    enviadoA:
      safeString(source.enviadoA) ||
      safeString(source.sentTo) ||
      "",

    sendHistory: safeArray(source.sendHistory).map((entry) => {
      const itemHistory = safeObject(entry);

      return {
        at: safeString(itemHistory?.at) || null,
        to: safeString(itemHistory?.to),
        byUserId: safeString(itemHistory?.byUserId),
        byRole: safeString(itemHistory?.byRole),
        channel: safeString(itemHistory?.channel, "email"),
        requestId: safeString(itemHistory?.requestId),
      };
    }),

    createdAt:
      safeString(source.createdAt) ||
      safeString(source?.auditoria?.createdAt) ||
      null,

    updatedBy:
      safeString(source.updatedBy) ||
      safeString(source?.auditoria?.updatedBy) ||
      "",

    createdBy:
      safeString(source.createdBy) ||
      safeString(source?.auditoria?.createdBy) ||
      "",

    estadoDetalle:
      safeString(source.estadoDetalle) ||
      "",

    meta: {
      timestampMs: toMs(updatedAt) || toMs(fecha) || 0,
      fechaMs: toMs(fecha) || 0,
      updatedAtMs: toMs(updatedAt) || 0,
      isPaid: estadoPago === "paid",
      isPending: estadoPago === "pending" || estadoPago === "partial",
      isOverdue: estadoPago === "overdue",
    },

    raw: source,
  };
}

/* =========================================================
   EXTRACCIÓN DE RESPUESTAS
========================================================= */

export function extractFacturas(response) {
  return resolveNestedArrayEnvelope(response);
}

export function extractNormalizedFacturas(response) {
  return extractFacturas(response).map(normalizeFactura);
}

export function getRemoteCount(response, fallback = 0) {
  return (
    safeNumber(response?.count, 0) ||
    safeNumber(response?.total, 0) ||
    safeNumber(response?.remoteCount, 0) ||
    safeNumber(response?.data?.count, 0) ||
    safeNumber(response?.data?.total, 0) ||
    safeNumber(response?.meta?.count, 0) ||
    fallback
  );
}

export function extractStats(response) {
  return (
    response?.stats ||
    response?.data?.stats ||
    response?.meta?.stats ||
    null
  );
}

/* =========================================================
   MÉTRICAS
========================================================= */

export function sumFacturasTotal(items = []) {
  return round2(
    safeArray(items).reduce((acc, item) => acc + safeNumber(item?.total, 0), 0)
  );
}

export function sumFacturasBase(items = []) {
  return round2(
    safeArray(items).reduce(
      (acc, item) => acc + safeNumber(item?.baseImponible, 0),
      0
    )
  );
}

export function countFacturasByEstadoPago(items = [], target = "pending") {
  const normalizedTarget = normalizeEstadoPago(target);

  return safeArray(items).reduce((acc, item) => {
    return acc + (normalizeEstadoPago(item?.estadoPago) === normalizedTarget ? 1 : 0);
  }, 0);
}

export function countFacturasByEstado(items = [], target = "issued") {
  const normalizedTarget = normalizeEstado(target);

  return safeArray(items).reduce((acc, item) => {
    return acc + (normalizeEstado(item?.estado) === normalizedTarget ? 1 : 0);
  }, 0);
}

/* =========================================================
   ORDENACIÓN
========================================================= */

export function sortFacturas(items = [], sort = DEFAULT_FACTURAS_SORT) {
  const list = [...safeArray(items)];
  const field = safeString(sort?.field, DEFAULT_FACTURAS_SORT.field);
  const direction =
    safeString(sort?.direction, DEFAULT_FACTURAS_SORT.direction) === "asc"
      ? 1
      : -1;

  list.sort((a, b) => {
    const left = normalizeFactura(a);
    const right = normalizeFactura(b);

    if (field === "cliente") {
      const av = normalizeText(left?.cliente?.empresa || left?.cliente?.nombre);
      const bv = normalizeText(right?.cliente?.empresa || right?.cliente?.nombre);

      return av.localeCompare(bv, "es") * direction;
    }

    if (field === "numero") {
      const av = normalizeText(left?.numero);
      const bv = normalizeText(right?.numero);

      return av.localeCompare(bv, "es") * direction;
    }

    if (field === "total") {
      return (
        (safeNumber(left?.total, 0) - safeNumber(right?.total, 0)) *
        direction
      );
    }

    if (field === "fecha") {
      return (toMs(left?.fecha) - toMs(right?.fecha)) * direction;
    }

    if (field === "updatedAt") {
      return (toMs(left?.updatedAt) - toMs(right?.updatedAt)) * direction;
    }

    const av = normalizeText(left?.[field]);
    const bv = normalizeText(right?.[field]);

    return av.localeCompare(bv, "es") * direction;
  });

  return list;
}

/* =========================================================
   FILTRADO
========================================================= */

export function filterFacturas(items = [], filters = {}) {
  const query = normalizeText(filters?.query);
  const estadoPago = normalizeText(filters?.estadoPago);
  const estado = normalizeText(filters?.estado);
  const formaPago = normalizeText(filters?.formaPago);

  return safeArray(items).filter((item) => {
    const factura = normalizeFactura(item);

    const matchQuery =
      !query ||
      normalizeText(factura.numero).includes(query) ||
      normalizeText(factura.cliente?.empresa).includes(query) ||
      normalizeText(factura.cliente?.nombre).includes(query) ||
      normalizeText(factura.cliente?.email).includes(query) ||
      normalizeText(factura.concepto).includes(query) ||
      normalizeText(factura.descripcion).includes(query);

    const matchEstadoPago =
      !estadoPago ||
      estadoPago === "all" ||
      normalizeEstadoPago(factura.estadoPago) === normalizeEstadoPago(estadoPago);

    const matchEstado =
      !estado ||
      estado === "all" ||
      normalizeEstado(factura.estado) === normalizeEstado(estado);

    const matchFormaPago =
      !formaPago ||
      formaPago === "all" ||
      normalizeText(factura.formaPago).includes(formaPago);

    return matchQuery && matchEstadoPago && matchEstado && matchFormaPago;
  });
}
