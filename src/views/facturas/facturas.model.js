/* =========================================================
   Onion SPA - Facturas Model (FULL PRO SAAS PANEL · GOD MODE)
   Archivo: src/views/facturas/facturas.model.js

   Responsabilidades:
   - helpers seguros de datos
   - formatters de facturas
   - normalización del backend
   - labels y estilos de estado
   - extracción robusta de payloads
   - utilidades de ordenación / métricas
========================================================= */

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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
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

/* =========================================================
   TEXTO / FORMATO
========================================================= */
export function truncate(value = "", max = 140) {
  const text = safeString(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
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
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const diff = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "Hace un momento";
  if (diff < hour) return `Hace ${Math.max(1, Math.floor(diff / minute))} min`;
  if (diff < day) return `Hace ${Math.max(1, Math.floor(diff / hour))} h`;
  if (diff < 7 * day) return `Hace ${Math.max(1, Math.floor(diff / day))} d`;

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
    abonada: "paid",

    pendiente: "pending",
    pending: "pending",
    unpaid: "pending",
    parcial: "pending",
    partial: "pending",

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

    cancelada: "void",
    cancelado: "void",
  };

  return map[normalizeText(value)] || "issued";
}

export function getEstadoPagoLabel(value = "pending") {
  const labels = {
    paid: "Pagada",
    pending: "Pendiente",
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
  };

  return labels[normalizeEstado(value)] || "Emitida";
}

export function getEstadoPagoChipStyle(value = "pending") {
  const tones = {
    paid:
      "background:var(--success-bg); border-color:var(--border-success); color:var(--text-soft);",
    pending:
      "background:var(--warning-bg); border-color:var(--border-warning); color:var(--text-soft);",
    overdue:
      "background:var(--error-bg); border-color:var(--border-error); color:var(--text-soft);",
    draft:
      "background:var(--info-bg); border-color:var(--border-info); color:var(--text-soft);",
    cancelled:
      "background:var(--surface-glass); border-color:var(--border-soft); color:var(--text-muted);",
  };

  return tones[normalizeEstadoPago(value)] || tones.pending;
}

export function getEstadoChipStyle(value = "issued") {
  const tones = {
    issued:
      "background:var(--info-bg); border-color:var(--border-info); color:var(--text-soft);",
    sent:
      "background:var(--success-bg); border-color:var(--border-success); color:var(--text-soft);",
    void:
      "background:var(--surface-glass); border-color:var(--border-soft); color:var(--text-muted);",
    draft:
      "background:var(--accent-soft-2); border-color:var(--border-accent); color:var(--text-soft);",
  };

  return tones[normalizeEstado(value)] || tones.issued;
}

/* =========================================================
   HELPERS FACTURA
========================================================= */
export function getFacturaNumero(item = {}) {
  return (
    safeString(item.numero) ||
    safeString(item.numeroFacturaLegal) ||
    safeString(item.numeroFacturaSistema) ||
    safeString(item.numeroFactura) ||
    safeString(item.id) ||
    "--"
  );
}

export function getFacturaFecha(item = {}) {
  return (
    safeString(item.fecha) ||
    safeString(item.fechaFactura) ||
    null
  );
}

export function getFacturaUpdatedAt(item = {}) {
  return (
    safeString(item.updatedAt) ||
    safeString(item.fechaEnvio) ||
    safeString(item.sentAt) ||
    safeString(item.mailSentAt) ||
    getFacturaFecha(item) ||
    null
  );
}

export function getFacturaClienteNombre(item = {}) {
  return (
    safeString(item?.cliente?.nombre) ||
    safeString(item?.cliente?.nombreContacto) ||
    safeString(item?.cliente?.empresa) ||
    safeString(item?.cliente?.razonSocial) ||
    safeString(item?.owner?.name) ||
    safeString(item?.name) ||
    "Cliente"
  );
}

export function getFacturaClienteEmpresa(item = {}) {
  return (
    safeString(item?.cliente?.empresa) ||
    safeString(item?.cliente?.razonSocial) ||
    safeString(item?.cliente?.nombreFiscal) ||
    safeString(item?.cliente?.nombre) ||
    safeString(item?.cliente?.nombreContacto) ||
    "-"
  );
}

export function getFacturaClienteEmail(item = {}) {
  return (
    safeString(item?.cliente?.email) ||
    safeString(item?.emailCliente) ||
    safeString(item?.owner?.email) ||
    "-"
  );
}

export function getFacturaPreview(item = {}) {
  const firstLinea = safeArray(item.lineas)[0] || {};

  return (
    safeString(item.preview) ||
    safeString(item.descripcion) ||
    safeString(item.concepto) ||
    safeString(firstLinea.descripcion) ||
    safeString(firstLinea.concepto) ||
    "Sin detalle"
  );
}

export function getFacturaCurrency(item = {}) {
  return safeString(item.moneda, "EUR") || "EUR";
}

export function getFacturaTotal(item = {}) {
  return round2(
    pickFirst(
      item.total,
      item.importeTotal,
      item?.resumen?.total,
      0
    )
  );
}

export function getFacturaBaseImponible(item = {}) {
  return round2(
    pickFirst(
      item.baseImponible,
      item.subtotal,
      item?.resumen?.baseImponible,
      item?.resumen?.subtotal,
      0
    )
  );
}

export function getFacturaImpuestosTotal(item = {}) {
  return round2(
    pickFirst(
      item.impuestosTotal,
      item.iva,
      item?.resumen?.impuestosTotal,
      0
    )
  );
}

export function getFacturaDescuentoTotal(item = {}) {
  return round2(
    pickFirst(
      item.descuentoTotal,
      item?.resumen?.descuentoTotal,
      0
    )
  );
}

export function isFacturaPaid(item = {}) {
  return normalizeEstadoPago(item.estadoPago) === "paid";
}

export function isFacturaPending(item = {}) {
  return normalizeEstadoPago(item.estadoPago) === "pending";
}

export function isFacturaOverdue(item = {}) {
  return normalizeEstadoPago(item.estadoPago) === "overdue";
}

/* =========================================================
   NORMALIZACIÓN PRINCIPAL
========================================================= */
export function normalizeFactura(item = {}) {
  const estadoPago = normalizeEstadoPago(item.estadoPago || "pending");
  const estado = normalizeEstado(item.estado || "issued");

  const clienteNombre = getFacturaClienteNombre(item);
  const clienteEmpresa = getFacturaClienteEmpresa(item);
  const clienteEmail = getFacturaClienteEmail(item);

  const currency = getFacturaCurrency(item);
  const fecha = getFacturaFecha(item);
  const fechaEnvio =
    safeString(item.fechaEnvio) ||
    safeString(item.sentAt) ||
    safeString(item.mailSentAt) ||
    null;

  const updatedAt = getFacturaUpdatedAt(item);
  const lineas = safeArray(item.lineas);
  const impuestos = safeArray(item.impuestos);

  return {
    id: item.id ?? null,
    numero: getFacturaNumero(item),

    fecha,
    fechaEnvio,
    updatedAt,

    estadoPago,
    estado,

    total: getFacturaTotal(item),
    subtotal: round2(
      pickFirst(item.subtotal, item?.resumen?.subtotal, 0)
    ),
    baseImponible: getFacturaBaseImponible(item),
    descuentoTotal: getFacturaDescuentoTotal(item),
    impuestosTotal: getFacturaImpuestosTotal(item),
    iva: round2(item.iva),
    irpf: round2(item.irpf),
    moneda: currency,

    formaPago:
      safeString(item.formaPago) ||
      safeString(item.metodoPago) ||
      "-",

    cuentaPago: safeString(item.cuentaPago) || "",
    preview: getFacturaPreview(item),

    lineasCount: safeNumber(
      item.lineasCount,
      lineas.length
    ),

    attachmentsCount: safeNumber(
      item.attachmentsCount,
      safeArray(item.attachments).length
    ),

    hasPdf:
      item.hasPdf === true ||
      item.pdfAvailable === true ||
      Boolean(item.blobPath),

    pdfAvailable:
      item.pdfAvailable === true ||
      item.hasPdf === true ||
      Boolean(item.blobPath),

    blobPath: safeString(item.blobPath) || "",

    clienteId:
      item.clienteId ??
      item.cliente?.id ??
      item.userId ??
      null,

    cliente: {
      id: item.cliente?.id ?? item.clienteId ?? item.userId ?? null,
      nombre: clienteNombre,
      nombreContacto:
        safeString(item?.cliente?.nombreContacto) ||
        clienteNombre,
      empresa: clienteEmpresa,
      email: clienteEmail,
      telefono:
        safeString(item?.cliente?.telefono) ||
        safeString(item?.telefonoCliente) ||
        "",
      nif: safeString(item?.cliente?.nif) || "",
      avatar:
        item?.cliente?.avatar ??
        item?.owner?.avatar ??
        null,
      initials: getInitials(
        clienteEmpresa !== "-" ? clienteEmpresa : clienteNombre
      ),
      direccion: {
        calle: safeString(item?.cliente?.direccion?.calle),
        linea2: safeString(item?.cliente?.direccion?.linea2),
        cp: safeString(item?.cliente?.direccion?.cp),
        ciudad: safeString(item?.cliente?.direccion?.ciudad),
        provincia: safeString(item?.cliente?.direccion?.provincia),
        pais: safeString(item?.cliente?.direccion?.pais),
      },
    },

    owner: {
      id: item?.owner?.id ?? item?.userId ?? null,
      name:
        safeString(item?.owner?.name) ||
        safeString(item?.name) ||
        "",
      email:
        safeString(item?.owner?.email) ||
        "",
      avatar: item?.owner?.avatar ?? null,
    },

    concepto:
      safeString(item.concepto) ||
      safeString(lineas[0]?.concepto) ||
      "Factura",

    descripcion:
      safeString(item.descripcion) ||
      safeString(lineas[0]?.descripcion) ||
      "",

    lineas: lineas.map((l, index) => ({
      id: l.id ?? `linea-${index + 1}`,
      concepto: safeString(l.concepto),
      descripcion: safeString(l.descripcion),
      cantidad: safeNumber(l.cantidad, 0),
      precioUnitario: round2(l.precioUnitario),
      subtotal: round2(l.subtotal),
      descuento: round2(l.descuento),
      impuesto: round2(l.impuesto),
      totalLinea: round2(
        pickFirst(l.totalLinea, l.total, l.importe, 0)
      ),
    })),

    impuestos: impuestos.map((i) => ({
      tipo: safeString(i.tipo),
      nombre: safeString(i.nombre || i.tipo),
      porcentaje: safeNumber(i.porcentaje, 0),
      base: round2(i.base),
      importe: round2(i.importe),
    })),

    notas:
      safeString(item.notas) ||
      safeString(item.observaciones) ||
      "",

    enviadoA:
      safeString(item.enviadoA) ||
      "",

    sendHistory: safeArray(item.sendHistory).map((entry) => ({
      at: safeString(entry?.at) || null,
      to: safeString(entry?.to),
      byUserId: safeString(entry?.byUserId),
      byRole: safeString(entry?.byRole),
      channel: safeString(entry?.channel, "email"),
      requestId: safeString(entry?.requestId),
    })),

    createdAt:
      safeString(item.createdAt) ||
      safeString(item?.auditoria?.createdAt) ||
      null,

    updatedBy:
      safeString(item.updatedBy) ||
      safeString(item?.auditoria?.updatedBy) ||
      "",

    createdBy:
      safeString(item.createdBy) ||
      safeString(item?.auditoria?.createdBy) ||
      "",

    estadoDetalle:
      safeString(item.estadoDetalle) ||
      "",

    meta: {
      timestampMs: toMs(updatedAt) || toMs(fecha) || 0,
      fechaMs: toMs(fecha) || 0,
      updatedAtMs: toMs(updatedAt) || 0,
      isPaid: estadoPago === "paid",
      isPending: estadoPago === "pending",
      isOverdue: estadoPago === "overdue",
    },

    raw: item,
  };
}

/* =========================================================
   EXTRACCIÓN DE RESPUESTAS
========================================================= */
export function extractFacturas(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.facturas)) return response.facturas;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.data?.facturas)) return response.data.facturas;
  if (Array.isArray(response?.data?.items)) return response.data.items;
  return [];
}

export function extractNormalizedFacturas(response) {
  return extractFacturas(response).map(normalizeFactura);
}

export function getRemoteCount(response, fallback = 0) {
  return (
    safeNumber(response?.count, 0) ||
    safeNumber(response?.total, 0) ||
    safeNumber(response?.remoteCount, 0) ||
    fallback
  );
}

export function extractStats(response) {
  return response?.stats || response?.data?.stats || null;
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
export function sortFacturas(items = [], sort = {}) {
  const list = [...safeArray(items)];
  const field = safeString(sort?.field, "fecha");
  const direction = safeString(sort?.direction, "desc") === "asc" ? 1 : -1;

  list.sort((a, b) => {
    const left = normalizeFactura(a);
    const right = normalizeFactura(b);

    if (field === "cliente") {
      const av = normalizeText(left?.cliente?.empresa || left?.cliente?.nombre);
      const bv = normalizeText(right?.cliente?.empresa || right?.cliente?.nombre);

      return av.localeCompare(bv, "es") * direction;
    }

    if (field === "total") {
      return (safeNumber(left?.total, 0) - safeNumber(right?.total, 0)) * direction;
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
      normalizeText(factura.concepto).includes(query);

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
