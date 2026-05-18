/* =========================================================
   Onion Support - Home Model
   Archivo: /src/views/home/home.model.js

   Responsabilidad:
   - Modelo puro de datos para Home.
   - Normalizar dashboard heterogéneo.
   - Normalizar widgets, tickets, facturas, usuarios,
     clientes y actividad.
   - Generar summary estable.
   - Generar widgets desde summary.
   - Generar actividad desde colecciones.
   - Paginar filas.
   - Buscar entidades por id.
   - Sin AppCore.
   - Sin Router.
   - Sin Auth.
   - Sin HTTP.
   - Sin Storage.
   - Sin DOM.
   - Sin CSS.
   - Sin rutas inventadas.
   - Sin /home.
========================================================= */

export const HOME_MODEL_VERSION = "home.model.v1";

export const DEFAULT_HOME_PAGE = 1;
export const DEFAULT_HOME_PAGE_SIZE = 5;
export const DEFAULT_HOME_RECENT_LIMIT = 8;

export const HOME_ENTITY_TYPES = Object.freeze({
  WIDGET: "widget",
  TICKET: "ticket",
  INVOICE: "invoice",
  USER: "user",
  CLIENT: "client",
  ACTIVITY: "activity",
});

export const HOME_STATUS_KEYS = Object.freeze({
  PENDING: "pending",
  OPEN: "open",
  PROGRESS: "progress",
  RESOLVED: "resolved",
  CLOSED: "closed",
});

export const HOME_INVOICE_STATUS_KEYS = Object.freeze({
  PAID: "paid",
  PENDING: "pending",
  OVERDUE: "overdue",
  PARTIAL: "partial",
  CANCELLED: "cancelled",
  DRAFT: "draft",
});

const HOME_ROUTES = Object.freeze({
  INCIDENCIAS: "/incidencias",
  FACTURAS: "/facturas",
  CLIENTES: "/clientes",
  USUARIOS: "/usuarios",
});

/* =========================================================
   SAFE HELPERS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "string") {
    let clean = value
      .trim()
      .replace(/[€$£¥%]/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s/g, "");

    if (!clean || clean === "-" || clean === "+") return fallback;

    const hasComma = clean.includes(",");
    const hasDot = clean.includes(".");

    if (hasComma && hasDot) {
      const lastComma = clean.lastIndexOf(",");
      const lastDot = clean.lastIndexOf(".");

      clean =
        lastComma > lastDot
          ? clean.replace(/\./g, "").replace(/,/g, ".")
          : clean.replace(/,/g, "");
    } else if (hasComma) {
      clean = clean.replace(/,/g, ".");
    }

    const number = Number(clean);
    return Number.isFinite(number) ? number : fallback;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

function firstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }

  return null;
}

function hasOwnKeys(value = {}) {
  return Boolean(isObject(value) && Object.keys(value).length > 0);
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeHomeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function toTimestamp(value = null) {
  if (!value) return 0;

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9999999999 ? value : value * 1000;
  }

  const raw = safeText(value, "");
  if (!raw) return 0;

  const numeric = Number(raw);

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 9999999999 ? numeric : numeric * 1000;
  }

  const date = new Date(raw.includes("T") || raw.includes("Z") ? raw : `${raw}T00:00:00`);
  const time = date.getTime();

  return Number.isNaN(time) ? 0 : time;
}

function maxNumber(...values) {
  const numbers = values
    .map((value) => safeNumber(value, NaN))
    .filter(Number.isFinite);

  return numbers.length ? Math.max(...numbers) : 0;
}

function uniqueStrings(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    ),
  ];
}

export function uniqueHomeBy(items = [], picker = (item) => item) {
  const seen = new Set();
  const output = [];

  for (const item of safeArray(items)) {
    const raw = safeText(picker(item), "");
    const key = raw ? normalizeHomeKey(raw) : "";

    if (!key) {
      output.push(item);
      continue;
    }

    if (seen.has(key)) continue;

    seen.add(key);
    output.push(item);
  }

  return output;
}

function sortByNewest(items = [], picker = (item) => item?.updatedAt || item?.createdAt) {
  return [...safeArray(items)].sort((a, b) => {
    const left = toTimestamp(picker(a));
    const right = toTimestamp(picker(b));

    if (right !== left) return right - left;

    return safeText(first(b?.id, b?.ticketId, b?.invoiceId, ""), "").localeCompare(
      safeText(first(a?.id, a?.ticketId, a?.invoiceId, ""), ""),
      "es-ES",
      {
        numeric: true,
        sensitivity: "base",
      }
    );
  });
}

function getPath(object = {}, path = "") {
  const root = safeObject(object, null);
  const clean = safeText(path, "");

  if (!root || !clean) return undefined;

  return clean.split(".").reduce((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return acc?.[key];
  }, root);
}

function pickMax(keys = [], sources = [], fallback = 0) {
  const values = [];

  for (const source of safeArray(sources)) {
    const object = safeObject(source, null);
    if (!object) continue;

    for (const key of safeArray(keys)) {
      const clean = safeText(key, "");
      if (!clean) continue;

      values.push(clean.includes(".") ? getPath(object, clean) : object?.[clean]);
    }
  }

  return Math.max(fallback, ...values.map((value) => safeNumber(value, fallback)));
}

/* =========================================================
   ENVELOPES / COLLECTIONS
========================================================= */

export function looksLikeHomeDashboard(value = null) {
  const object = safeObject(value, null);

  if (!object) return false;

  return Boolean(
    "dashboard" in object ||
      "summary" in object ||
      "stats" in object ||
      "metrics" in object ||
      "totals" in object ||
      "counts" in object ||
      "widgets" in object ||
      "cards" in object ||
      "kpis" in object ||
      "blocks" in object ||
      "tickets" in object ||
      "incidencias" in object ||
      "facturas" in object ||
      "invoices" in object ||
      "users" in object ||
      "usuarios" in object ||
      "clients" in object ||
      "clientes" in object ||
      "customers" in object ||
      "activity" in object ||
      "activities" in object ||
      "recent" in object ||
      "recentActivity" in object ||
      "totalTickets" in object ||
      "incidenciasTotal" in object ||
      "facturasTotal" in object ||
      "usersCount" in object ||
      "clientesCount" in object
  );
}

export function unwrapHomeEnvelope(payload = null, depth = 0) {
  if (payload === null || payload === undefined) return null;
  if (depth > 8) return payload;
  if (Array.isArray(payload)) return payload;

  const object = safeObject(payload, null);

  if (!object) return payload;
  if (looksLikeHomeDashboard(object)) return object;

  const nested = first(
    object.dashboard,
    object.home,
    object.data,
    object.payload,
    object.result,
    object.response,
    object.body
  );

  if (nested !== null && nested !== undefined) {
    return unwrapHomeEnvelope(nested, depth + 1);
  }

  return object;
}

function collectionTotal(object = {}, aliases = [], fallback = 0) {
  const source = safeObject(object);

  const aliasKeys = safeArray(aliases).flatMap((alias) => {
    const clean = safeText(alias, "");
    const pascal = clean ? `${clean.charAt(0).toUpperCase()}${clean.slice(1)}` : "";

    return clean
      ? [
          `${clean}Total`,
          `${clean}Count`,
          `total${pascal}`,
          `count${pascal}`,
        ]
      : [];
  });

  return pickMax(
    [
      "total",
      "count",
      "remoteCount",
      "totalCount",
      "documentsCounted",
      "meta.total",
      "meta.count",
      "meta.remoteCount",
      "meta.totalCount",
      "pagination.total",
      "pagination.count",
      "pagination.totalCount",
      ...aliasKeys,
    ],
    [source],
    fallback
  );
}

export function normalizeHomeCollectionSource(value = null, aliases = []) {
  if (Array.isArray(value)) {
    return {
      items: value,
      visibleCount: value.length,
      total: value.length,
      totalCount: value.length,
      remoteCount: value.length,
      raw: value,
    };
  }

  const object = safeObject(value, null);

  if (!object) {
    return {
      items: [],
      visibleCount: 0,
      total: 0,
      totalCount: 0,
      remoteCount: 0,
      raw: value,
    };
  }

  let items = safeArray(
    firstArray(
      object.items,
      object.rows,
      object.records,
      object.results,
      object.data,
      object.docs,
      object.documents,
      object.value,
      object.list
    )
  );

  if (!items.length) {
    for (const alias of safeArray(aliases)) {
      const candidate = object?.[alias];

      if (Array.isArray(candidate)) {
        items = candidate;
        break;
      }

      if (hasOwnKeys(candidate)) {
        const nested = normalizeHomeCollectionSource(candidate, aliases);

        if (nested.items.length || nested.remoteCount > 0) {
          items = nested.items;
          break;
        }
      }
    }
  }

  const total = Math.max(items.length, collectionTotal(object, aliases, items.length));

  return {
    items,
    visibleCount: items.length,
    total,
    totalCount: total,
    remoteCount: total,
    raw: value,
  };
}

function collectionSearchSources(source = {}) {
  const raw = safeObject(source);

  return [
    raw,
    raw.collections,
    raw.resources,
    raw.dashboard,
    raw.home,
    raw.data,
    raw.payload,
    raw.result,
    raw.response,
    raw.body,
    raw.data?.collections,
    raw.payload?.collections,
    raw.result?.collections,
    raw.dashboard?.collections,
  ].filter(hasOwnKeys);
}

export function pickHomeCollectionBlock(source = {}, aliases = []) {
  const keys = safeArray(aliases);
  const sources = collectionSearchSources(source);

  for (const candidate of sources) {
    for (const key of keys) {
      const direct = candidate?.[key];

      if (Array.isArray(direct)) {
        return normalizeHomeCollectionSource(direct, keys);
      }

      if (hasOwnKeys(direct)) {
        const normalized = normalizeHomeCollectionSource(direct, keys);

        if (normalized.items.length || normalized.remoteCount > 0) {
          return normalized;
        }
      }
    }
  }

  return {
    items: [],
    visibleCount: 0,
    total: 0,
    totalCount: 0,
    remoteCount: 0,
    raw: null,
  };
}

/* =========================================================
   TICKETS
========================================================= */

export function getHomeTicketId(item = {}) {
  if (typeof item === "string" || typeof item === "number") {
    return safeText(item, "");
  }

  const raw = safeObject(item);
  const base = safeObject(raw.raw);

  return safeText(
    first(
      raw.ticketId,
      raw.incidenciaId,
      raw.code,
      raw.numero,
      raw.ticketCode,
      raw.entityId,
      raw.id,
      raw._id,
      base.ticketId,
      base.incidenciaId,
      base.code,
      base.numero,
      base.ticketCode,
      base.entityId,
      base.id,
      base._id
    ),
    ""
  );
}

export function getHomeTicketIdentities(item = {}) {
  const raw = safeObject(item);
  const base = safeObject(raw.raw);

  return uniqueStrings([
    raw.ticketId,
    raw.incidenciaId,
    raw.code,
    raw.numero,
    raw.ticketCode,
    raw.entityId,
    raw.id,
    raw._id,
    base.ticketId,
    base.incidenciaId,
    base.code,
    base.numero,
    base.ticketCode,
    base.entityId,
    base.id,
    base._id,
  ]);
}

export function getHomeTicketSubject(item = {}) {
  const raw = safeObject(item);
  const base = safeObject(raw.raw);

  return safeText(
    first(
      raw.subject,
      raw.title,
      raw.asunto,
      raw.name,
      raw.preview,
      base.subject,
      base.title,
      base.asunto,
      base.name,
      base.preview
    ),
    "Incidencia sin asunto"
  );
}

export function getHomeTicketStatus(item = {}) {
  const raw = safeObject(item);
  const base = safeObject(raw.raw);

  return safeText(
    first(
      raw.status,
      raw.estado,
      raw.state,
      raw.lifecycle?.status,
      base.status,
      base.estado,
      base.state,
      base.lifecycle?.status,
      "pending"
    ),
    "pending"
  );
}

export function getHomeTicketStatusKey(itemOrStatus = {}) {
  const status =
    typeof itemOrStatus === "string"
      ? itemOrStatus
      : getHomeTicketStatus(itemOrStatus);

  const key = normalizeHomeKey(status);

  if (["pending", "pendiente", "new", "nuevo", "nueva", "created"].includes(key)) {
    return HOME_STATUS_KEYS.PENDING;
  }

  if (["open", "opened", "abierta", "abierto"].includes(key)) {
    return HOME_STATUS_KEYS.OPEN;
  }

  if (["progress", "in_progress", "inprogress", "en_proceso", "working", "assigned"].includes(key)) {
    return HOME_STATUS_KEYS.PROGRESS;
  }

  if (["resolved", "resuelta", "resuelto", "solved"].includes(key)) {
    return HOME_STATUS_KEYS.RESOLVED;
  }

  if (["closed", "close", "cerrada", "cerrado", "cancelled", "canceled", "archived"].includes(key)) {
    return HOME_STATUS_KEYS.CLOSED;
  }

  return HOME_STATUS_KEYS.PENDING;
}

export function getHomeTicketStatusLabel(itemOrStatus = {}) {
  const key = getHomeTicketStatusKey(itemOrStatus);

  if (key === HOME_STATUS_KEYS.OPEN) return "Abierta";
  if (key === HOME_STATUS_KEYS.PENDING) return "Pendiente";
  if (key === HOME_STATUS_KEYS.PROGRESS) return "En proceso";
  if (key === HOME_STATUS_KEYS.RESOLVED) return "Resuelta";
  if (key === HOME_STATUS_KEYS.CLOSED) return "Cerrada";

  return "Pendiente";
}

export function getHomeTicketPriority(item = {}) {
  const raw = safeObject(item);
  const base = safeObject(raw.raw);

  return safeText(
    first(
      raw.priority,
      raw.prioridad,
      raw.severity,
      raw.urgency,
      raw.sla?.priority,
      base.priority,
      base.prioridad,
      base.severity,
      base.urgency,
      base.sla?.priority,
      "medium"
    ),
    "medium"
  );
}

export function isHomeTicketOpenLike(item = {}) {
  return [
    HOME_STATUS_KEYS.OPEN,
    HOME_STATUS_KEYS.PENDING,
    HOME_STATUS_KEYS.PROGRESS,
  ].includes(getHomeTicketStatusKey(item));
}

export function isHomeTicketClosedLike(item = {}) {
  return [
    HOME_STATUS_KEYS.CLOSED,
    HOME_STATUS_KEYS.RESOLVED,
  ].includes(getHomeTicketStatusKey(item));
}

export function isHomeTicketUrgent(item = {}) {
  return [
    "urgent",
    "urgente",
    "critical",
    "critica",
    "critico",
    "high",
    "alta",
    "p1",
    "p0",
  ].includes(normalizeHomeKey(getHomeTicketPriority(item)));
}

export function getHomeTicketCreatedAt(item = {}) {
  const raw = safeObject(item);
  const base = safeObject(raw.raw);

  return first(
    raw.createdAt,
    raw.fechaCreacion,
    raw.createdAtES,
    raw.date,
    raw.fecha,
    raw.lifecycle?.createdAt,
    base.createdAt,
    base.fechaCreacion,
    base.createdAtES,
    base.date,
    base.fecha,
    base.lifecycle?.createdAt
  );
}

export function getHomeTicketUpdatedAt(item = {}) {
  const raw = safeObject(item);
  const base = safeObject(raw.raw);

  return first(
    raw.updatedAt,
    raw.lastUpdateAt,
    raw.ultimaNovedad,
    raw.modifiedAt,
    raw.closedAt,
    raw.createdAt,
    raw.lifecycle?.updatedAt,
    raw.lifecycle?.lastUpdateAt,
    raw.audit?.updatedAt,
    base.updatedAt,
    base.lastUpdateAt,
    base.ultimaNovedad,
    base.modifiedAt,
    base.closedAt,
    base.createdAt,
    base.lifecycle?.updatedAt,
    base.lifecycle?.lastUpdateAt,
    base.audit?.updatedAt
  );
}

export function getHomeTicketAttachmentsCount(item = {}) {
  const raw = safeObject(item);
  const base = safeObject(raw.raw);

  const attachments = first(
    raw.attachments,
    raw.files,
    raw.adjuntos,
    raw.documents,
    base.attachments,
    base.files,
    base.adjuntos,
    base.documents
  );

  if (Array.isArray(attachments)) return attachments.length;

  return safeNumber(
    first(
      raw.attachmentsCount,
      raw.filesCount,
      raw.adjuntosCount,
      raw.documentsCount,
      base.attachmentsCount,
      base.filesCount,
      base.adjuntosCount,
      base.documentsCount,
      0
    ),
    0
  );
}

export function normalizeHomeTicket(item = {}) {
  const raw = safeObject(item);

  const id = getHomeTicketId(raw);
  const subject = getHomeTicketSubject(raw);
  const status = getHomeTicketStatus(raw);
  const priority = getHomeTicketPriority(raw);

  const clientName = safeText(
    first(
      raw.clientName,
      raw.clienteNombre,
      raw.customerName,
      raw.userName,
      raw.requesterName,
      raw.createdByName,
      raw.ownerName,
      raw.requesterSnapshot?.name,
      raw.requesterSnapshot?.displayName,
      raw.cliente?.nombreContacto,
      raw.cliente?.nombre,
      raw.cliente?.name,
      raw.cliente?.displayName,
      raw.client?.name,
      raw.customer?.name,
      raw.createdBy?.name,
      raw.user?.name,
      raw.owner?.name,
      raw.raw?.clientName,
      raw.raw?.clienteNombre,
      raw.raw?.customerName,
      raw.raw?.requesterSnapshot?.name,
      raw.raw?.cliente?.nombreContacto,
      raw.raw?.cliente?.nombre,
      raw.raw?.cliente?.name
    ),
    ""
  );

  const clientEmail = safeText(
    first(
      raw.clientEmail,
      raw.clienteEmail,
      raw.email,
      raw.emailCliente,
      raw.requesterSnapshot?.email,
      raw.createdBy?.email,
      raw.cliente?.email,
      raw.cliente?.emailLower,
      raw.client?.email,
      raw.customer?.email,
      raw.receptor?.email,
      raw.raw?.clientEmail,
      raw.raw?.clienteEmail,
      raw.raw?.email,
      raw.raw?.emailCliente,
      raw.raw?.requesterSnapshot?.email,
      raw.raw?.cliente?.email
    ),
    ""
  );

  const avatar = safeText(
    first(
      raw.clientAvatar,
      raw.avatar,
      raw.avatarUrl,
      raw.avatar_url,
      raw.userAvatar,
      raw.createdByAvatar,
      raw.ownerAvatar,
      raw.requesterSnapshot?.avatar,
      raw.requesterSnapshot?.avatarUrl,
      raw.cliente?.avatar,
      raw.cliente?.avatarUrl,
      raw.client?.avatar,
      raw.client?.avatarUrl,
      raw.customer?.avatar,
      raw.customer?.avatarUrl,
      raw.createdBy?.avatar,
      raw.createdBy?.avatarUrl,
      raw.user?.avatar,
      raw.user?.avatarUrl,
      raw.owner?.avatar,
      raw.owner?.avatarUrl,
      raw.raw?.clientAvatar,
      raw.raw?.avatar,
      raw.raw?.avatarUrl
    ),
    ""
  );

  const description = safeText(
    first(
      raw.description,
      raw.descripcion,
      raw.preview,
      raw.message,
      raw.body,
      raw.text,
      raw.raw?.description,
      raw.raw?.descripcion,
      raw.raw?.preview,
      raw.raw?.message,
      raw.raw?.body,
      raw.raw?.text
    ),
    "Sin descripción."
  );

  return {
    ...raw,

    id: safeText(first(raw.id, id), id),
    _id: safeText(first(raw._id, raw.id, id), id),

    ticketId: safeText(first(raw.ticketId, id), id),
    incidenciaId: safeText(first(raw.incidenciaId, id), id),

    code: safeText(first(raw.code, raw.ticketCode, id), id),
    ticketCode: safeText(first(raw.ticketCode, raw.code, id), id),

    subject,
    title: safeText(first(raw.title, raw.subject, subject), subject),
    asunto: safeText(first(raw.asunto, raw.subject, raw.title, subject), subject),

    description,
    descripcion: safeText(first(raw.descripcion, raw.description, description), description),
    message: safeText(first(raw.message, raw.description, raw.descripcion, description), description),

    status,
    estado: safeText(first(raw.estado, raw.status, status), status),
    state: safeText(first(raw.state, raw.status, status), status),

    statusKey: getHomeTicketStatusKey(status),
    statusLabel: getHomeTicketStatusLabel(status),

    priority,
    prioridad: safeText(first(raw.prioridad, raw.priority, priority), priority),
    severity: safeText(first(raw.severity, raw.priority, priority), priority),

    clientName,
    clienteNombre: safeText(first(raw.clienteNombre, clientName), clientName),
    requesterName: safeText(first(raw.requesterName, clientName), clientName),

    clientEmail,
    clienteEmail: safeText(first(raw.clienteEmail, clientEmail), clientEmail),
    email: safeText(first(raw.email, clientEmail), clientEmail),

    clientAvatar: avatar,
    avatar: safeText(first(raw.avatar, avatar), avatar),
    avatarUrl: safeText(first(raw.avatarUrl, avatar), avatar),

    category: safeText(first(raw.category, raw.categoria, raw.type, raw.tipo), "Soporte"),
    categoria: safeText(first(raw.categoria, raw.category, raw.type, raw.tipo), "Soporte"),
    type: safeText(first(raw.type, raw.tipo, raw.category, raw.categoria), "Soporte"),
    tipo: safeText(first(raw.tipo, raw.type, raw.category, raw.categoria), "Soporte"),

    createdAt: getHomeTicketCreatedAt(raw),
    updatedAt: getHomeTicketUpdatedAt(raw),
    lastUpdateAt: first(raw.lastUpdateAt, raw.updatedAt, getHomeTicketUpdatedAt(raw)),

    attachmentsCount: getHomeTicketAttachmentsCount(raw),
    filesCount: getHomeTicketAttachmentsCount(raw),
    adjuntosCount: getHomeTicketAttachmentsCount(raw),

    raw: hasOwnKeys(raw.raw) ? raw.raw : raw,
  };
}

export function normalizeHomeTickets(items = []) {
  return sortByNewest(
    uniqueHomeBy(
      safeArray(items).map((item) => normalizeHomeTicket(item)),
      getHomeTicketId
    ),
    (item) => getHomeTicketUpdatedAt(item) || getHomeTicketCreatedAt(item)
  );
}

/* =========================================================
   INVOICES
========================================================= */

export function getHomeInvoiceId(item = {}) {
  const raw = safeObject(item);
  const base = safeObject(raw.raw);

  return safeText(
    first(
      raw.invoiceId,
      raw.facturaId,
      raw.number,
      raw.numeroFacturaLegal,
      raw.numeroFactura,
      raw.numero,
      raw.invoiceNumber,
      raw.code,
      raw.id,
      raw._id,
      base.invoiceId,
      base.facturaId,
      base.number,
      base.numeroFacturaLegal,
      base.numeroFactura,
      base.numero,
      base.invoiceNumber,
      base.code,
      base.id,
      base._id
    ),
    ""
  );
}

export function getHomeInvoiceAmount(item = {}) {
  const raw = safeObject(item);
  const base = safeObject(raw.raw);

  return safeNumber(
    first(
      raw.total,
      raw.amount,
      raw.importe,
      raw.price,
      raw.subtotal,
      raw.base,
      raw.totalFactura,
      raw.importeTotal,
      raw.facturaTotal,
      raw.facturaImporte,
      raw.invoiceAmount,
      base.total,
      base.amount,
      base.importe,
      base.price,
      base.subtotal,
      base.base,
      base.totalFactura,
      base.importeTotal,
      base.facturaTotal,
      base.facturaImporte,
      base.invoiceAmount,
      0
    ),
    0
  );
}

export function getHomeInvoiceStatusKey(item = {}) {
  const raw = safeObject(item);

  const key = normalizeHomeKey(
    first(
      raw.paymentStatus,
      raw.estadoPago,
      raw.status,
      raw.estado,
      raw.raw?.paymentStatus,
      raw.raw?.estadoPago,
      raw.raw?.status,
      raw.raw?.estado,
      "pending"
    )
  );

  if (["paid", "pagada", "pagado", "cobrada", "cobrado", "abonada"].includes(key)) {
    return HOME_INVOICE_STATUS_KEYS.PAID;
  }

  if (["overdue", "vencida", "vencido"].includes(key)) {
    return HOME_INVOICE_STATUS_KEYS.OVERDUE;
  }

  if (["partial", "parcial", "pago_parcial"].includes(key)) {
    return HOME_INVOICE_STATUS_KEYS.PARTIAL;
  }

  if (["cancelled", "canceled", "cancelada", "cancelado"].includes(key)) {
    return HOME_INVOICE_STATUS_KEYS.CANCELLED;
  }

  if (["draft", "borrador"].includes(key)) {
    return HOME_INVOICE_STATUS_KEYS.DRAFT;
  }

  return HOME_INVOICE_STATUS_KEYS.PENDING;
}

export function isHomeInvoicePendingLike(item = {}) {
  return [
    HOME_INVOICE_STATUS_KEYS.PENDING,
    HOME_INVOICE_STATUS_KEYS.OVERDUE,
    HOME_INVOICE_STATUS_KEYS.PARTIAL,
  ].includes(getHomeInvoiceStatusKey(item));
}

export function normalizeHomeInvoice(item = {}) {
  const raw = safeObject(item);

  const id = getHomeInvoiceId(raw);
  const amount = getHomeInvoiceAmount(raw);

  const status = safeText(
    first(
      raw.paymentStatus,
      raw.estadoPago,
      raw.status,
      raw.estado,
      raw.raw?.paymentStatus,
      raw.raw?.estadoPago,
      raw.raw?.status,
      raw.raw?.estado,
      "pending"
    ),
    "pending"
  );

  const currency = safeText(
    first(
      raw.currency,
      raw.moneda,
      raw.raw?.currency,
      raw.raw?.moneda,
      "EUR"
    ),
    "EUR"
  ).toUpperCase();

  return {
    ...raw,

    id: safeText(first(raw.id, id), id),
    _id: safeText(first(raw._id, raw.id, id), id),

    invoiceId: safeText(first(raw.invoiceId, id), id),
    facturaId: safeText(first(raw.facturaId, id), id),

    numeroFacturaLegal: safeText(
      first(
        raw.numeroFacturaLegal,
        raw.numeroFactura,
        raw.invoiceNumber,
        raw.number,
        raw.numero,
        raw.code,
        id
      ),
      id
    ),

    numeroFactura: safeText(first(raw.numeroFactura, raw.numeroFacturaLegal, raw.number, raw.numero, id), id),
    invoiceNumber: safeText(first(raw.invoiceNumber, raw.numeroFacturaLegal, raw.number, raw.numero, id), id),
    number: safeText(first(raw.number, raw.numero, raw.code, id), id),
    numero: safeText(first(raw.numero, raw.number, raw.code, id), id),
    code: safeText(first(raw.code, raw.numero, raw.number, id), id),

    total: amount,
    amount,
    importe: amount,
    price: amount,
    totalFactura: amount,
    facturaTotal: amount,
    facturaImporte: amount,
    invoiceAmount: amount,

    currency,
    moneda: currency,

    paymentStatus: status,
    estadoPago: safeText(first(raw.estadoPago, raw.paymentStatus, status), status),
    status: safeText(first(raw.status, status), status),
    estado: safeText(first(raw.estado, raw.status, status), status),

    statusKey: getHomeInvoiceStatusKey(raw),

    createdAt: first(
      raw.createdAt,
      raw.fechaCreacion,
      raw.fechaFactura,
      raw.issueDate,
      raw.issuedAt,
      raw.date,
      raw.raw?.createdAt,
      raw.raw?.fechaCreacion,
      raw.raw?.fechaFactura,
      raw.raw?.issueDate,
      raw.raw?.issuedAt,
      raw.raw?.date
    ),

    updatedAt: first(
      raw.updatedAt,
      raw.modifiedAt,
      raw.fechaPago,
      raw.fechaEnvio,
      raw.sentAt,
      raw.date,
      raw.raw?.updatedAt,
      raw.raw?.modifiedAt,
      raw.raw?.date
    ),

    raw: hasOwnKeys(raw.raw) ? raw.raw : raw,
  };
}

export function normalizeHomeInvoices(items = []) {
  return sortByNewest(
    uniqueHomeBy(
      safeArray(items).map((item) => normalizeHomeInvoice(item)),
      getHomeInvoiceId
    ),
    (item) => first(item.updatedAt, item.createdAt, item.date)
  );
}

/* =========================================================
   USERS
========================================================= */

export function getHomeUserId(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.userId,
      raw.usuarioId,
      raw.id,
      raw._id,
      raw.username,
      raw.email,
      raw.raw?.userId,
      raw.raw?.usuarioId,
      raw.raw?.id,
      raw.raw?._id,
      raw.raw?.username,
      raw.raw?.email
    ),
    ""
  );
}

export function normalizeHomeUser(item = {}) {
  const raw = safeObject(item);
  const id = getHomeUserId(raw);

  const displayName = safeText(
    first(
      raw.displayName,
      raw.fullName,
      raw.name,
      raw.nombre,
      raw.username,
      raw.email,
      raw.raw?.displayName,
      raw.raw?.fullName,
      raw.raw?.name,
      raw.raw?.nombre,
      raw.raw?.username,
      raw.raw?.email
    ),
    "Usuario"
  );

  const active = first(
    raw.active,
    raw.isActive,
    raw.enabled,
    raw.raw?.active,
    raw.raw?.isActive,
    raw.raw?.enabled,
    true
  );

  const avatar = safeText(
    first(
      raw.avatar,
      raw.avatarUrl,
      raw.avatar_url,
      raw.photoURL,
      raw.picture,
      raw.profile?.avatar,
      raw.profile?.avatarUrl,
      raw.raw?.avatar,
      raw.raw?.avatarUrl,
      raw.raw?.avatar_url,
      raw.raw?.photoURL,
      raw.raw?.picture
    ),
    ""
  );

  const role = String(first(raw.role, raw.rol, raw.type, raw.raw?.role, raw.raw?.rol, "user")).toLowerCase() === "admin"
    ? "admin"
    : "user";

  return {
    ...raw,

    id: safeText(first(raw.id, id), id),
    _id: safeText(first(raw._id, raw.id, id), id),

    userId: safeText(first(raw.userId, id), id),
    usuarioId: safeText(first(raw.usuarioId, id), id),

    displayName,
    fullName: safeText(first(raw.fullName, displayName), displayName),
    name: safeText(first(raw.name, displayName), displayName),
    nombre: safeText(first(raw.nombre, displayName), displayName),

    username: safeText(first(raw.username, raw.email, id), id),
    email: safeText(first(raw.email, raw.mail, raw.raw?.email, raw.raw?.mail), ""),

    role,
    rol: role,
    roles: [role],

    active,
    isActive: active,

    avatar,
    avatarUrl: safeText(first(raw.avatarUrl, raw.avatar, avatar), avatar),

    createdAt: first(raw.createdAt, raw.raw?.createdAt),
    updatedAt: first(raw.updatedAt, raw.modifiedAt, raw.lastLoginAt, raw.raw?.updatedAt),

    raw: hasOwnKeys(raw.raw) ? raw.raw : raw,
  };
}

export function normalizeHomeUsers(items = []) {
  return sortByNewest(
    uniqueHomeBy(
      safeArray(items).map((item) => normalizeHomeUser(item)),
      getHomeUserId
    ),
    (item) => first(item.updatedAt, item.lastLoginAt, item.createdAt)
  );
}

/* =========================================================
   CLIENTS
========================================================= */

export function getHomeClientId(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.clientId,
      raw.clienteId,
      raw.customerId,
      raw.id,
      raw._id,
      raw.email,
      raw.nif,
      raw.cif,
      raw.raw?.clientId,
      raw.raw?.clienteId,
      raw.raw?.customerId,
      raw.raw?.id,
      raw.raw?._id,
      raw.raw?.email,
      raw.raw?.nif,
      raw.raw?.cif
    ),
    ""
  );
}

export function normalizeHomeClient(item = {}) {
  const raw = safeObject(item);
  const id = getHomeClientId(raw);

  const name = safeText(
    first(
      raw.name,
      raw.nombre,
      raw.razonSocial,
      raw.company,
      raw.nombreContacto,
      raw.email,
      raw.raw?.name,
      raw.raw?.nombre,
      raw.raw?.razonSocial,
      raw.raw?.company,
      raw.raw?.nombreContacto,
      raw.raw?.email
    ),
    "Cliente"
  );

  const active = first(
    raw.active,
    raw.isActive,
    raw.enabled,
    raw.raw?.active,
    raw.raw?.isActive,
    raw.raw?.enabled,
    true
  );

  return {
    ...raw,

    id: safeText(first(raw.id, id), id),
    _id: safeText(first(raw._id, raw.id, id), id),

    clientId: safeText(first(raw.clientId, id), id),
    clienteId: safeText(first(raw.clienteId, id), id),
    customerId: safeText(first(raw.customerId, id), id),

    name,
    nombre: safeText(first(raw.nombre, name), name),
    displayName: safeText(first(raw.displayName, name), name),
    razonSocial: safeText(first(raw.razonSocial, name), name),

    email: safeText(first(raw.email, raw.mail, raw.raw?.email, raw.raw?.mail), ""),

    phone: safeText(first(raw.phone, raw.telefono, raw.raw?.phone, raw.raw?.telefono), ""),
    telefono: safeText(first(raw.telefono, raw.phone, raw.raw?.telefono, raw.raw?.phone), ""),

    active,
    isActive: active,

    createdAt: first(raw.createdAt, raw.raw?.createdAt),
    updatedAt: first(raw.updatedAt, raw.modifiedAt, raw.raw?.updatedAt),

    raw: hasOwnKeys(raw.raw) ? raw.raw : raw,
  };
}

export function normalizeHomeClients(items = []) {
  return sortByNewest(
    uniqueHomeBy(
      safeArray(items).map((item) => normalizeHomeClient(item)),
      getHomeClientId
    ),
    (item) => first(item.updatedAt, item.createdAt)
  );
}

/* =========================================================
   ACTIVITY
========================================================= */

export function getHomeActivityId(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.activityId,
      raw.eventId,
      raw.entityId,
      raw.id,
      raw.ticketId,
      raw.incidenciaId,
      raw.facturaId,
      raw.invoiceId,
      raw.userId,
      raw.clienteId,
      raw.title,
      raw.text,
      raw.raw?.activityId,
      raw.raw?.eventId,
      raw.raw?.entityId,
      raw.raw?.id
    ),
    ""
  );
}

export function normalizeHomeActivity(item = {}) {
  const raw = safeObject(item);

  const type = safeText(
    first(
      raw.type,
      raw.kind,
      raw.category,
      raw.raw?.type,
      raw.raw?.kind,
      raw.raw?.category,
      HOME_ENTITY_TYPES.ACTIVITY
    ),
    HOME_ENTITY_TYPES.ACTIVITY
  );

  const title = safeText(
    first(
      raw.title,
      raw.name,
      raw.subject,
      raw.label,
      raw.raw?.title,
      raw.raw?.name,
      raw.raw?.subject,
      raw.raw?.label
    ),
    "Actividad registrada"
  );

  const entityId = safeText(
    first(
      raw.entityId,
      raw.id,
      raw.ticketId,
      raw.incidenciaId,
      raw.facturaId,
      raw.invoiceId,
      raw.userId,
      raw.clienteId,
      raw.raw?.entityId,
      raw.raw?.id,
      raw.raw?.ticketId,
      raw.raw?.incidenciaId,
      raw.raw?.facturaId,
      raw.raw?.invoiceId,
      raw.raw?.userId,
      raw.raw?.clienteId
    ),
    ""
  );

  return {
    ...raw,

    type,
    kind: safeText(first(raw.kind, type), type),
    category: safeText(first(raw.category, type), type),

    title,

    text: safeText(
      first(
        raw.text,
        raw.description,
        raw.message,
        raw.detail,
        raw.preview,
        raw.raw?.text,
        raw.raw?.description,
        raw.raw?.message,
        raw.raw?.detail,
        raw.raw?.preview
      ),
      "Sin detalle adicional."
    ),

    date: first(
      raw.date,
      raw.createdAt,
      raw.updatedAt,
      raw.timestamp,
      raw.raw?.date,
      raw.raw?.createdAt,
      raw.raw?.updatedAt,
      raw.raw?.timestamp,
      nowIso()
    ),

    route: safeText(first(raw.route, raw.href, raw.link, raw.to, raw.raw?.route), ""),
    href: safeText(first(raw.href, raw.route, raw.link, raw.to, raw.raw?.href), ""),

    action: safeText(first(raw.action, raw.raw?.action, "open-activity"), "open-activity"),

    entityId,

    id: safeText(first(raw.id, entityId), entityId),

    raw: hasOwnKeys(raw.raw) ? raw.raw : raw,
  };
}

export function normalizeHomeActivityList(items = []) {
  return sortByNewest(
    uniqueHomeBy(
      safeArray(items).map((item) => normalizeHomeActivity(item)),
      getHomeActivityId
    ),
    (item) => item.date || item.updatedAt || item.createdAt
  );
}

export function buildHomeActivityFromCollections({
  tickets = [],
  invoices = [],
  users = [],
  clients = [],
  limit = DEFAULT_HOME_RECENT_LIMIT,
} = {}) {
  const ticketActivity = normalizeHomeTickets(tickets)
    .slice(0, limit)
    .map((item) => {
      const ticketId = getHomeTicketId(item);

      return normalizeHomeActivity({
        type: HOME_ENTITY_TYPES.TICKET,
        title: getHomeTicketSubject(item),
        text: `Incidencia ${ticketId || "sin ID"} · ${getHomeTicketStatusLabel(item)}`,
        date: getHomeTicketUpdatedAt(item) || getHomeTicketCreatedAt(item),
        route: HOME_ROUTES.INCIDENCIAS,
        href: HOME_ROUTES.INCIDENCIAS,
        action: "open-ticket",
        entityId: ticketId,
      });
    });

  const invoiceActivity = normalizeHomeInvoices(invoices)
    .slice(0, 4)
    .map((item) => {
      const invoiceId = getHomeInvoiceId(item);

      return normalizeHomeActivity({
        type: HOME_ENTITY_TYPES.INVOICE,
        title: invoiceId ? `Factura ${invoiceId}` : "Factura registrada",
        text: `${getHomeInvoiceAmount(item).toFixed(2)} ${safeText(item.currency || item.moneda, "EUR")}`,
        date: first(item.updatedAt, item.modifiedAt, item.createdAt, item.date),
        route: HOME_ROUTES.FACTURAS,
        href: HOME_ROUTES.FACTURAS,
        action: "open-invoice",
        entityId: invoiceId,
      });
    });

  const clientActivity = normalizeHomeClients(clients)
    .slice(0, 3)
    .map((item) => {
      const clientId = getHomeClientId(item);

      return normalizeHomeActivity({
        type: HOME_ENTITY_TYPES.CLIENT,
        title: safeText(first(item.name, item.nombre, item.razonSocial, item.company, item.email), "Cliente"),
        text: "Cliente sincronizado en el panel.",
        date: first(item.updatedAt, item.createdAt),
        route: HOME_ROUTES.CLIENTES,
        href: HOME_ROUTES.CLIENTES,
        action: "open-client",
        entityId: clientId,
      });
    });

  const userActivity = normalizeHomeUsers(users)
    .slice(0, 3)
    .map((item) => {
      const userId = getHomeUserId(item);

      return normalizeHomeActivity({
        type: HOME_ENTITY_TYPES.USER,
        title: safeText(first(item.name, item.nombre, item.displayName, item.fullName, item.username, item.email), "Usuario"),
        text: "Usuario disponible en el sistema.",
        date: first(item.lastLoginAt, item.updatedAt, item.createdAt),
        route: HOME_ROUTES.USUARIOS,
        href: HOME_ROUTES.USUARIOS,
        action: "open-user",
        entityId: userId,
      });
    });

  return normalizeHomeActivityList([
    ...ticketActivity,
    ...invoiceActivity,
    ...clientActivity,
    ...userActivity,
  ]).slice(0, limit);
}

/* =========================================================
   WIDGETS
========================================================= */

export function getHomeWidgetId(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.widgetId,
      raw.widgetKey,
      raw.id,
      raw.key,
      raw.slug,
      raw.code
    ),
    ""
  );
}

export function getHomeWidgetTitle(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.title,
      raw.name,
      raw.label,
      raw.heading
    ),
    "Bloque"
  );
}

function widgetNumericValue(item = {}) {
  const value = first(
    item.value,
    item.total,
    item.amount,
    item.count,
    item.metric,
    item.raw?.value,
    item.raw?.total,
    item.raw?.amount,
    item.raw?.count,
    item.raw?.metric
  );

  const number = safeNumber(value, NaN);

  return Number.isFinite(number) ? number : null;
}

function widgetCorpus(widget = {}) {
  const raw = safeObject(widget);

  return normalizeHomeKey(
    [
      raw.widgetId,
      raw.widgetKey,
      raw.id,
      raw.key,
      raw.slug,
      raw.code,
      raw.type,
      raw.kind,
      raw.variant,
      raw.category,
      raw.title,
      raw.name,
      raw.label,
      raw.heading,
      raw.description,
      raw.subtitle,
      raw.text,
    ]
      .filter((item) => item !== undefined && item !== null)
      .join(" ")
  );
}

export function normalizeHomeWidget(item = {}) {
  const raw = safeObject(item);

  const id = getHomeWidgetId(raw);
  const title = getHomeWidgetTitle(raw);

  return {
    ...raw,

    widgetId: id,
    widgetKey: safeText(first(raw.widgetKey, raw.key, id), id),

    id: safeText(first(raw.id, id), id),
    key: safeText(first(raw.key, id), id),

    title,

    description: safeText(first(raw.description, raw.descripcion, raw.subtitle, raw.summary, raw.text), ""),

    subtitle: safeText(first(raw.subtitle, raw.description, raw.text), ""),
    text: safeText(first(raw.text, raw.description, raw.subtitle), ""),

    type: safeText(first(raw.type, raw.kind, raw.variant, raw.category), HOME_ENTITY_TYPES.WIDGET),
    kind: safeText(first(raw.kind, raw.type, raw.variant, raw.category), HOME_ENTITY_TYPES.WIDGET),
    variant: safeText(first(raw.variant, raw.type, raw.kind, raw.category), HOME_ENTITY_TYPES.WIDGET),

    value: first(raw.value, raw.total, raw.amount, raw.count, raw.metric, "—"),

    trend: first(raw.trend, raw.delta, raw.change, raw.variation, ""),
    status: safeText(first(raw.status, raw.estado, raw.state), "active"),

    route: safeText(first(raw.route, raw.href, raw.link, raw.to), ""),
    href: safeText(first(raw.href, raw.route, raw.link, raw.to), ""),

    updatedAt: first(raw.updatedAt, raw.lastUpdate, raw.modifiedAt, raw.createdAt, nowIso()),

    raw: hasOwnKeys(raw.raw) ? raw.raw : raw,
  };
}

export function normalizeHomeWidgets(items = []) {
  return uniqueHomeBy(
    safeArray(items)
      .map((item) => normalizeHomeWidget(item))
      .filter((item) => Boolean(getHomeWidgetId(item) || getHomeWidgetTitle(item))),
    (item) => first(getHomeWidgetId(item), getHomeWidgetTitle(item), "")
  );
}

export function buildHomeWidgetSummary(widgets = []) {
  const summary = {
    totalTickets: 0,
    openTickets: 0,
    urgentTickets: 0,

    totalInvoices: 0,
    pendingInvoices: 0,
    invoiceAmount: 0,

    usersCount: 0,
    usuariosCount: 0,

    clientsCount: 0,
    clientesCount: 0,
    customersCount: 0,
  };

  for (const widget of safeArray(widgets)) {
    const corpus = widgetCorpus(widget);
    const value = widgetNumericValue(widget);

    if (value === null) continue;

    const isTicket =
      corpus.includes("ticket") ||
      corpus.includes("incidencia") ||
      corpus.includes("solicitud") ||
      corpus.includes("soporte");

    const isInvoice =
      corpus.includes("factura") ||
      corpus.includes("invoice") ||
      corpus.includes("billing") ||
      corpus.includes("facturacion") ||
      corpus.includes("cobro");

    const isUser =
      corpus.includes("usuario") ||
      corpus.includes("user") ||
      corpus.includes("member");

    const isClient =
      corpus.includes("cliente") ||
      corpus.includes("client") ||
      corpus.includes("customer");

    if (isTicket) {
      if (
        corpus.includes("abierta") ||
        corpus.includes("open") ||
        corpus.includes("pendiente") ||
        corpus.includes("pending") ||
        corpus.includes("proceso")
      ) {
        summary.openTickets = Math.max(summary.openTickets, value);
      } else {
        summary.totalTickets = Math.max(summary.totalTickets, value);
      }

      if (
        corpus.includes("urgente") ||
        corpus.includes("urgent") ||
        corpus.includes("critica") ||
        corpus.includes("critical") ||
        corpus.includes("alta")
      ) {
        summary.urgentTickets = Math.max(summary.urgentTickets, value);
      }
    }

    if (isInvoice) {
      if (
        corpus.includes("importe") ||
        corpus.includes("amount") ||
        corpus.includes("facturacion") ||
        corpus.includes("billing")
      ) {
        summary.invoiceAmount = Math.max(summary.invoiceAmount, value);
      } else if (
        corpus.includes("pendiente") ||
        corpus.includes("pending") ||
        corpus.includes("vencida") ||
        corpus.includes("overdue")
      ) {
        summary.pendingInvoices = Math.max(summary.pendingInvoices, value);
      } else {
        summary.totalInvoices = Math.max(summary.totalInvoices, value);
      }
    }

    if (isUser && !isClient) {
      summary.usersCount = Math.max(summary.usersCount, value);
      summary.usuariosCount = Math.max(summary.usuariosCount, value);
    }

    if (isClient) {
      summary.clientsCount = Math.max(summary.clientsCount, value);
      summary.clientesCount = Math.max(summary.clientesCount, value);
      summary.customersCount = Math.max(summary.customersCount, value);
    }
  }

  return summary;
}

export function buildHomeWidgetsFromSummary(summary = {}) {
  const data = safeObject(summary);

  return normalizeHomeWidgets([
    {
      id: "incidencias",
      widgetId: "incidencias",
      key: "incidencias",
      title: "Incidencias",
      description: "Tickets visibles en el panel.",
      value: safeNumber(data.totalTickets, 0),
      subtitle: `${safeNumber(data.openTickets, 0)} abiertas · ${safeNumber(data.urgentTickets, 0)} urgentes`,
      type: "tickets",
      kind: "metric",
      status: safeNumber(data.urgentTickets, 0) > 0 ? "warning" : "active",
      route: HOME_ROUTES.INCIDENCIAS,
      href: HOME_ROUTES.INCIDENCIAS,
    },

    {
      id: "facturacion",
      widgetId: "facturacion",
      key: "facturacion",
      title: "Facturación",
      description: "Facturas visibles y volumen agregado.",
      value: safeNumber(data.invoiceAmount, 0),
      subtitle: `${safeNumber(data.totalInvoices, 0)} facturas · ${safeNumber(data.pendingInvoices, 0)} pendientes`,
      type: "invoices",
      kind: "metric",
      status: safeNumber(data.pendingInvoices, 0) > 0 ? "warning" : "active",
      route: HOME_ROUTES.FACTURAS,
      href: HOME_ROUTES.FACTURAS,
    },

    {
      id: "clientes",
      widgetId: "clientes",
      key: "clientes",
      title: "Clientes",
      description: "Clientes registrados o visibles.",
      value: safeNumber(data.clientsCount, 0),
      subtitle: `${safeNumber(data.visibleClientsCount, 0)} visibles`,
      type: "clients",
      kind: "metric",
      status: "active",
      route: HOME_ROUTES.CLIENTES,
      href: HOME_ROUTES.CLIENTES,
    },

    {
      id: "usuarios",
      widgetId: "usuarios",
      key: "usuarios",
      title: "Usuarios",
      description: "Usuarios del sistema.",
      value: safeNumber(data.usersCount, 0),
      subtitle: `${safeNumber(data.visibleUsersCount, 0)} visibles`,
      type: "users",
      kind: "metric",
      status: "active",
      route: HOME_ROUTES.USUARIOS,
      href: HOME_ROUTES.USUARIOS,
    },
  ]);
}

/* =========================================================
   SUMMARY
========================================================= */

export function buildHomeDerivedSummary({
  tickets = [],
  ticketsTotal = null,
  invoices = [],
  invoicesTotal = null,
  users = [],
  usersTotal = null,
  clients = [],
  clientsTotal = null,
} = {}) {
  const ticketRows = safeArray(tickets);
  const invoiceRows = safeArray(invoices);
  const userRows = safeArray(users);
  const clientRows = safeArray(clients);

  const openTickets = ticketRows.filter(isHomeTicketOpenLike).length;
  const closedTickets = ticketRows.filter(isHomeTicketClosedLike).length;
  const urgentTickets = ticketRows.filter(isHomeTicketUrgent).length;

  const pendingInvoices = invoiceRows.filter(isHomeInvoicePendingLike).length;

  const invoiceAmount = invoiceRows.reduce(
    (sum, item) => sum + getHomeInvoiceAmount(item),
    0
  );

  const attachmentsCount = ticketRows.reduce(
    (sum, item) => sum + getHomeTicketAttachmentsCount(item),
    0
  );

  const finalTicketsTotal = Math.max(ticketRows.length, safeNumber(ticketsTotal, ticketRows.length));
  const finalInvoicesTotal = Math.max(invoiceRows.length, safeNumber(invoicesTotal, invoiceRows.length));
  const finalUsersTotal = Math.max(userRows.length, safeNumber(usersTotal, userRows.length));
  const finalClientsTotal = Math.max(clientRows.length, safeNumber(clientsTotal, clientRows.length));

  return {
    totalTickets: finalTicketsTotal,
    ticketsTotal: finalTicketsTotal,
    incidenciasTotal: finalTicketsTotal,
    totalIncidencias: finalTicketsTotal,
    ticketsCount: finalTicketsTotal,
    incidenciasCount: finalTicketsTotal,

    visibleTickets: ticketRows.length,
    visibleTicketsCount: ticketRows.length,
    visibleIncidenciasCount: ticketRows.length,

    openTickets,
    pendingTickets: openTickets,
    openIncidencias: openTickets,
    pendingIncidencias: openTickets,
    incidenciasAbiertas: openTickets,

    closedTickets,
    resolvedTickets: closedTickets,
    closedIncidencias: closedTickets,
    resolvedIncidencias: closedTickets,
    incidenciasCerradas: closedTickets,

    urgentTickets,
    urgentIncidencias: urgentTickets,
    highPriorityTickets: urgentTickets,

    totalInvoices: finalInvoicesTotal,
    invoicesTotal: finalInvoicesTotal,
    facturasTotal: finalInvoicesTotal,
    totalFacturas: finalInvoicesTotal,
    invoicesCount: finalInvoicesTotal,
    facturasCount: finalInvoicesTotal,

    visibleInvoices: invoiceRows.length,
    visibleInvoicesCount: invoiceRows.length,
    visibleFacturasCount: invoiceRows.length,

    pendingInvoices,
    pendingFacturas: pendingInvoices,
    facturasPendientes: pendingInvoices,
    invoicesPending: pendingInvoices,

    invoiceAmount,
    billingTotal: invoiceAmount,
    totalBilling: invoiceAmount,
    totalFacturado: invoiceAmount,
    importeFacturas: invoiceAmount,
    facturacionVisible: invoiceAmount,
    facturacionTotal: invoiceAmount,

    usersCount: finalUsersTotal,
    usuariosCount: finalUsersTotal,
    totalUsers: finalUsersTotal,
    totalUsuarios: finalUsersTotal,

    visibleUsersCount: userRows.length,
    visibleUsuariosCount: userRows.length,

    clientsCount: finalClientsTotal,
    clientesCount: finalClientsTotal,
    customersCount: finalClientsTotal,
    totalClients: finalClientsTotal,
    totalClientes: finalClientsTotal,
    totalCustomers: finalClientsTotal,

    visibleClientsCount: clientRows.length,
    visibleClientesCount: clientRows.length,
    visibleCustomersCount: clientRows.length,

    attachmentsCount,
    filesCount: attachmentsCount,
    adjuntosCount: attachmentsCount,

    lastTicketUpdate: getLatestHomeTicketUpdate(ticketRows),
  };
}

export function normalizeHomeSummary(rawSummary = {}, widgetSummary = {}, derivedSummary = {}) {
  const raw = safeObject(rawSummary);
  const widget = safeObject(widgetSummary);
  const derived = safeObject(derivedSummary);

  const sources = [raw, widget, derived];

  const totalTickets = pickMax(
    ["totalTickets", "ticketsTotal", "incidenciasTotal", "totalIncidencias", "ticketsCount", "incidenciasCount", "total"],
    sources
  );

  const openTickets = pickMax(
    ["openTickets", "pendingTickets", "openIncidencias", "pendingIncidencias", "incidenciasAbiertas", "active", "open", "pending", "inProgress", "in_progress"],
    sources
  );

  const closedTickets = pickMax(
    ["closedTickets", "resolvedTickets", "closedIncidencias", "resolvedIncidencias", "incidenciasCerradas", "closedGroup", "closed", "resolved"],
    sources
  );

  const urgentTickets = pickMax(
    ["urgentTickets", "urgentIncidencias", "highPriorityTickets", "incidenciasUrgentes", "urgent", "high"],
    sources
  );

  const totalInvoices = pickMax(
    ["totalInvoices", "invoicesTotal", "facturasTotal", "totalFacturas", "invoicesCount", "facturasCount", "countTotal"],
    sources
  );

  const pendingInvoices = pickMax(
    ["pendingInvoices", "pendingFacturas", "facturasPendientes", "invoicesPending", "facturasVencidas", "overdueInvoices", "countPendientes", "pendingCount"],
    sources
  );

  const invoiceAmount = pickMax(
    ["invoiceAmount", "billingTotal", "totalBilling", "totalFacturado", "importeFacturas", "facturacionVisible", "facturacionTotal", "facturasImporteTotal", "currentYearTotal"],
    sources
  );

  const usersCount = pickMax(
    ["usersCount", "usuariosCount", "totalUsers", "totalUsuarios", "activeUsers", "usuariosActivos"],
    sources
  );

  const clientsCount = pickMax(
    ["clientsCount", "clientesCount", "customersCount", "totalClients", "totalClientes", "totalCustomers", "activeClients", "clientesActivos"],
    sources
  );

  const attachmentsCount = pickMax(
    ["attachmentsCount", "filesCount", "adjuntosCount", "withAttachments"],
    sources
  );

  const visibleTicketsCount = pickMax(
    ["visibleTickets", "visibleTicketsCount", "visibleIncidenciasCount"],
    sources
  );

  const visibleInvoicesCount = pickMax(
    ["visibleInvoices", "visibleInvoicesCount", "visibleFacturasCount"],
    sources
  );

  const visibleUsersCount = pickMax(
    ["visibleUsers", "visibleUsersCount", "visibleUsuariosCount"],
    sources
  );

  const visibleClientsCount = pickMax(
    ["visibleClients", "visibleClientsCount", "visibleClientesCount", "visibleCustomersCount"],
    sources
  );

  const activeUsersRaw = pickMax(["activeUsers", "usuariosActivos"], [raw, widget], 0);
  const activeClientsRaw = pickMax(["activeClients", "clientesActivos"], [raw, widget], 0);

  return {
    ...derived,
    ...widget,
    ...raw,

    totalTickets,
    ticketsTotal: totalTickets,
    incidenciasTotal: totalTickets,
    totalIncidencias: totalTickets,
    ticketsCount: totalTickets,
    incidenciasCount: totalTickets,

    openTickets,
    pendingTickets: openTickets,
    openIncidencias: openTickets,
    pendingIncidencias: openTickets,
    incidenciasAbiertas: openTickets,

    closedTickets,
    resolvedTickets: closedTickets,
    closedIncidencias: closedTickets,
    resolvedIncidencias: closedTickets,
    incidenciasCerradas: closedTickets,

    urgentTickets,
    urgentIncidencias: urgentTickets,
    highPriorityTickets: urgentTickets,

    totalInvoices,
    invoicesTotal: totalInvoices,
    facturasTotal: totalInvoices,
    totalFacturas: totalInvoices,
    invoicesCount: totalInvoices,
    facturasCount: totalInvoices,

    pendingInvoices,
    pendingFacturas: pendingInvoices,
    facturasPendientes: pendingInvoices,
    invoicesPending: pendingInvoices,

    invoiceAmount,
    billingTotal: invoiceAmount,
    totalBilling: invoiceAmount,
    totalFacturado: invoiceAmount,
    importeFacturas: invoiceAmount,
    facturacionVisible: invoiceAmount,
    facturacionTotal: invoiceAmount,

    usersCount,
    usuariosCount: usersCount,
    totalUsers: usersCount,
    totalUsuarios: usersCount,

    activeUsers: activeUsersRaw || usersCount,
    usuariosActivos: activeUsersRaw || usersCount,

    clientsCount,
    clientesCount: clientsCount,
    customersCount: clientsCount,
    totalClients: clientsCount,
    totalClientes: clientsCount,
    totalCustomers: clientsCount,

    activeClients: activeClientsRaw || clientsCount,
    clientesActivos: activeClientsRaw || clientsCount,

    visibleTickets: visibleTicketsCount,
    visibleTicketsCount,
    visibleIncidenciasCount: visibleTicketsCount,

    visibleInvoices: visibleInvoicesCount,
    visibleInvoicesCount,
    visibleFacturasCount: visibleInvoicesCount,

    visibleUsers: visibleUsersCount,
    visibleUsersCount,
    visibleUsuariosCount: visibleUsersCount,

    visibleClients: visibleClientsCount,
    visibleClientsCount,
    visibleClientesCount: visibleClientsCount,
    visibleCustomersCount: visibleClientsCount,

    attachmentsCount,
    filesCount: attachmentsCount,
    adjuntosCount: attachmentsCount,

    lastTicketUpdate: first(raw.lastTicketUpdate, widget.lastTicketUpdate, derived.lastTicketUpdate, null),
  };
}

/* =========================================================
   DASHBOARD
========================================================= */

function summaryBlock(raw = {}) {
  const object = safeObject(raw);

  const direct = safeObject(
    first(
      object.summary,
      object.stats,
      object.metrics,
      object.totals,
      object.counts,
      object.dashboard?.summary,
      object.data?.summary,
      object.payload?.summary,
      object.result?.summary,
      {}
    )
  );

  if (hasOwnKeys(direct)) return direct;

  if (
    "totalTickets" in object ||
    "ticketsTotal" in object ||
    "incidenciasTotal" in object ||
    "openTickets" in object ||
    "pendingTickets" in object ||
    "totalInvoices" in object ||
    "facturasTotal" in object ||
    "pendingInvoices" in object ||
    "invoiceAmount" in object ||
    "usersCount" in object ||
    "clientesCount" in object
  ) {
    return object;
  }

  return {};
}

function widgetsBlock(raw = {}) {
  const object = safeObject(raw);

  return normalizeHomeWidgets(
    first(
      object.widgets,
      object.cards,
      object.kpis,
      object.blocks,
      object.widgetList,
      object.dashboard?.widgets,
      object.collections?.widgets,
      object.resources?.widgets,
      []
    )
  );
}

export function normalizeHomeDashboard(payload = null) {
  const picked = unwrapHomeEnvelope(payload);
  let raw = safeObject(picked);

  if (
    hasOwnKeys(raw.dashboard) &&
    looksLikeHomeDashboard(raw.dashboard) &&
    !hasOwnKeys(raw.summary)
  ) {
    raw = safeObject(raw.dashboard);
  }

  const ticketsBlock = pickHomeCollectionBlock(raw, [
    "tickets",
    "incidencias",
    "incidents",
    "issues",
    "supportTickets",
    "recentTickets",
    "recentIncidencias",
    "latestTickets",
    "latestIncidencias",
    "ticketItems",
    "incidenciaItems",
  ]);

  const invoicesBlock = pickHomeCollectionBlock(raw, [
    "facturas",
    "invoices",
    "bills",
    "billing",
    "payments",
    "recentFacturas",
    "recentInvoices",
    "latestFacturas",
    "latestInvoices",
    "invoiceItems",
    "facturaItems",
  ]);

  const usersBlock = pickHomeCollectionBlock(raw, [
    "users",
    "usuarios",
    "members",
    "userItems",
    "usuarioItems",
    "recentUsers",
    "recentUsuarios",
  ]);

  const clientsBlock = pickHomeCollectionBlock(raw, [
    "clients",
    "clientes",
    "customers",
    "clientItems",
    "clienteItems",
    "customerItems",
    "recentClients",
    "recentClientes",
    "recentCustomers",
  ]);

  const activityBlock = pickHomeCollectionBlock(raw, [
    "activity",
    "activities",
    "recentActivity",
    "recent",
    "timeline",
    "logs",
    "events",
  ]);

  const tickets = normalizeHomeTickets(ticketsBlock.items);
  const invoices = normalizeHomeInvoices(invoicesBlock.items);
  const users = normalizeHomeUsers(usersBlock.items);
  const clients = normalizeHomeClients(clientsBlock.items);

  const explicitActivity = normalizeHomeActivityList(activityBlock.items);
  const activity = explicitActivity.length
    ? explicitActivity
    : buildHomeActivityFromCollections({
        tickets,
        invoices,
        users,
        clients,
      });

  const rawWidgets = widgetsBlock(raw);
  const rawSummary = summaryBlock(raw);
  const widgetSummary = buildHomeWidgetSummary(rawWidgets);

  const derivedSummary = buildHomeDerivedSummary({
    tickets,
    ticketsTotal: first(
      rawSummary.totalTickets,
      rawSummary.ticketsTotal,
      rawSummary.incidenciasTotal,
      rawSummary.totalIncidencias,
      widgetSummary.totalTickets,
      ticketsBlock.remoteCount
    ),

    invoices,
    invoicesTotal: first(
      rawSummary.totalInvoices,
      rawSummary.invoicesTotal,
      rawSummary.facturasTotal,
      rawSummary.totalFacturas,
      widgetSummary.totalInvoices,
      invoicesBlock.remoteCount
    ),

    users,
    usersTotal: first(
      rawSummary.usersCount,
      rawSummary.usuariosCount,
      rawSummary.totalUsers,
      rawSummary.totalUsuarios,
      widgetSummary.usersCount,
      widgetSummary.usuariosCount,
      usersBlock.remoteCount
    ),

    clients,
    clientsTotal: first(
      rawSummary.clientsCount,
      rawSummary.clientesCount,
      rawSummary.customersCount,
      rawSummary.totalClients,
      rawSummary.totalClientes,
      widgetSummary.clientsCount,
      widgetSummary.clientesCount,
      widgetSummary.customersCount,
      clientsBlock.remoteCount
    ),
  });

  const summary = normalizeHomeSummary(rawSummary, widgetSummary, derivedSummary);

  const widgets = rawWidgets.length
    ? rawWidgets
    : buildHomeWidgetsFromSummary(summary);

  const updatedAt = first(
    raw.updatedAt,
    raw.lastUpdate,
    raw.generatedAt,
    raw.createdAt,
    summary.updatedAt,
    summary.lastUpdate,
    nowIso()
  );

  return {
    ...raw,

    ok: raw.ok !== false && raw.success !== false,
    success: raw.ok !== false && raw.success !== false,

    source: safeText(first(raw.source, "home-normalized"), "home-normalized"),
    version: HOME_MODEL_VERSION,

    summary,
    stats: summary,
    metrics: summary,
    totals: summary,
    counts: summary,

    widgets,
    cards: widgets,
    kpis: widgets,
    blocks: widgets,

    tickets,
    incidencias: tickets,

    ticketsTotal: summary.totalTickets,
    incidenciasTotal: summary.totalTickets,
    totalTickets: summary.totalTickets,
    totalIncidencias: summary.totalTickets,
    ticketsCount: summary.totalTickets,
    incidenciasCount: summary.totalTickets,

    openTickets: summary.openTickets,
    pendingTickets: summary.pendingTickets,
    urgentTickets: summary.urgentTickets,
    closedTickets: summary.closedTickets,
    resolvedTickets: summary.resolvedTickets,

    visibleTicketsCount: tickets.length,
    visibleIncidenciasCount: tickets.length,

    invoices,
    facturas: invoices,

    invoicesTotal: summary.totalInvoices,
    facturasTotal: summary.totalInvoices,
    totalInvoices: summary.totalInvoices,
    totalFacturas: summary.totalInvoices,
    invoicesCount: summary.totalInvoices,
    facturasCount: summary.totalInvoices,

    pendingInvoices: summary.pendingInvoices,
    pendingFacturas: summary.pendingFacturas,
    invoiceAmount: summary.invoiceAmount,
    billingTotal: summary.billingTotal,
    totalBilling: summary.totalBilling,
    totalFacturado: summary.totalFacturado,
    importeFacturas: summary.importeFacturas,

    visibleInvoicesCount: invoices.length,
    visibleFacturasCount: invoices.length,

    users,
    usuarios: users,

    usersTotal: summary.usersCount,
    usuariosTotal: summary.usuariosCount,
    totalUsers: summary.usersCount,
    totalUsuarios: summary.usuariosCount,
    usersCount: summary.usersCount,
    usuariosCount: summary.usuariosCount,

    visibleUsersCount: users.length,
    visibleUsuariosCount: users.length,

    clients,
    clientes: clients,
    customers: clients,

    clientsTotal: summary.clientsCount,
    clientesTotal: summary.clientesCount,
    customersTotal: summary.customersCount,
    totalClients: summary.clientsCount,
    totalClientes: summary.clientesCount,
    totalCustomers: summary.customersCount,
    clientsCount: summary.clientsCount,
    clientesCount: summary.clientesCount,
    customersCount: summary.customersCount,

    visibleClientsCount: clients.length,
    visibleClientesCount: clients.length,
    visibleCustomersCount: clients.length,

    activity,
    activities: activity,
    recent: activity,
    recentActivity: activity,

    activityCount: activity.length,
    recentCount: activity.length,
    visibleActivityCount: activity.length,

    updatedAt,
    generatedAt: first(raw.generatedAt, updatedAt),

    raw: payload,

    meta: {
      ...safeObject(raw.meta),

      updatedAt,
      generatedAt: first(raw.generatedAt, updatedAt),

      widgetsCount: widgets.length,

      ticketsCount: summary.totalTickets,
      incidenciasCount: summary.totalTickets,
      visibleTicketsCount: tickets.length,
      visibleIncidenciasCount: tickets.length,

      invoicesCount: summary.totalInvoices,
      facturasCount: summary.totalInvoices,
      visibleInvoicesCount: invoices.length,
      visibleFacturasCount: invoices.length,

      usersCount: summary.usersCount,
      usuariosCount: summary.usuariosCount,
      visibleUsersCount: users.length,
      visibleUsuariosCount: users.length,

      clientsCount: summary.clientsCount,
      clientesCount: summary.clientesCount,
      customersCount: summary.customersCount,
      visibleClientsCount: clients.length,
      visibleClientesCount: clients.length,
      visibleCustomersCount: clients.length,

      activityCount: activity.length,
      recentCount: activity.length,
      visibleActivityCount: activity.length,
    },
  };
}

/* =========================================================
   PAGINATION
========================================================= */

export function paginateHomeItems(
  items = [],
  page = DEFAULT_HOME_PAGE,
  pageSize = DEFAULT_HOME_PAGE_SIZE
) {
  const rows = safeArray(items);
  const size = Math.max(1, safeNumber(pageSize, DEFAULT_HOME_PAGE_SIZE));
  const total = rows.length;

  const totalPages = Math.max(1, Math.ceil((total || 1) / size));

  const currentPage = Math.min(
    Math.max(1, safeNumber(page, DEFAULT_HOME_PAGE)),
    totalPages
  );

  const start = (currentPage - 1) * size;
  const pageItems = rows.slice(start, start + size);

  return {
    items: pageItems,
    pageItems,
    rows: pageItems,
    data: pageItems,

    page: currentPage,
    currentPage,

    pageSize: size,
    limit: size,

    total,
    totalCount: total,

    totalPages,
    pages: totalPages,

    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,

    from: total ? start + 1 : 0,
    to: Math.min(start + size, total),
  };
}

/* =========================================================
   FINDERS / DATES
========================================================= */

export function findHomeTicketById(items = [], ticketId = "") {
  const id = normalizeHomeKey(ticketId);

  if (!id) return null;

  return (
    normalizeHomeTickets(items).find((item) =>
      getHomeTicketIdentities(item)
        .map(normalizeHomeKey)
        .includes(id)
    ) || null
  );
}

export function findHomeInvoiceById(items = [], invoiceId = "") {
  const id = normalizeHomeKey(invoiceId);

  if (!id) return null;

  return (
    normalizeHomeInvoices(items).find((item) => {
      const ids = uniqueStrings([
        getHomeInvoiceId(item),
        item.invoiceId,
        item.facturaId,
        item.id,
        item._id,
        item.numeroFacturaLegal,
        item.numeroFactura,
        item.invoiceNumber,
        item.number,
        item.numero,
        item.code,
      ]).map(normalizeHomeKey);

      return ids.includes(id);
    }) || null
  );
}

export function findHomeWidgetById(items = [], widgetId = "") {
  const id = normalizeHomeKey(widgetId);

  if (!id) return null;

  return (
    normalizeHomeWidgets(items).find((item) => {
      const ids = uniqueStrings([
        getHomeWidgetId(item),
        item.widgetId,
        item.widgetKey,
        item.id,
        item.key,
        item.slug,
        item.code,
        item.title,
        item.name,
      ]).map(normalizeHomeKey);

      return ids.includes(id);
    }) || null
  );
}

export function getLatestHomeTicketUpdate(tickets = []) {
  const timestamps = safeArray(tickets)
    .map((item) => toTimestamp(getHomeTicketUpdatedAt(item) || getHomeTicketCreatedAt(item)))
    .filter(Boolean);

  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}

/* =========================================================
   TEMPLATE PAYLOAD
========================================================= */

export function buildHomeTemplatePayload(input = {}) {
  const source = safeObject(input);
  const dashboard = normalizeHomeDashboard(first(source.dashboard, source, {}));

  const tickets =
    source.tickets || source.incidencias
      ? normalizeHomeTickets(first(source.tickets, source.incidencias, []))
      : dashboard.tickets;

  const invoices =
    source.invoices || source.facturas
      ? normalizeHomeInvoices(first(source.invoices, source.facturas, []))
      : dashboard.invoices;

  const users =
    source.users || source.usuarios
      ? normalizeHomeUsers(first(source.users, source.usuarios, []))
      : dashboard.users;

  const clients =
    source.clients || source.clientes || source.customers
      ? normalizeHomeClients(first(source.clients, source.clientes, source.customers, []))
      : dashboard.clients;

  const activity =
    source.activity || source.recent || source.recentActivity
      ? normalizeHomeActivityList(first(source.activity, source.recent, source.recentActivity, []))
      : dashboard.activity.length
        ? dashboard.activity
        : buildHomeActivityFromCollections({
            tickets,
            invoices,
            users,
            clients,
          });

  const page = safeNumber(first(source.page, DEFAULT_HOME_PAGE), DEFAULT_HOME_PAGE);
  const pageSize = safeNumber(first(source.pageSize, DEFAULT_HOME_PAGE_SIZE), DEFAULT_HOME_PAGE_SIZE);

  const pagination = paginateHomeItems(tickets, page, pageSize);

  const summary = normalizeHomeSummary(
    dashboard.summary,
    {},
    buildHomeDerivedSummary({
      tickets,
      ticketsTotal: dashboard.summary.totalTickets,

      invoices,
      invoicesTotal: dashboard.summary.totalInvoices,

      users,
      usersTotal: dashboard.summary.usersCount,

      clients,
      clientsTotal: dashboard.summary.clientsCount,
    })
  );

  const widgets = dashboard.widgets?.length
    ? dashboard.widgets
    : buildHomeWidgetsFromSummary(summary);

  const finalDashboard = {
    ...dashboard,

    summary,
    stats: summary,
    metrics: summary,
    totals: summary,
    counts: summary,

    widgets,
    cards: widgets,
    kpis: widgets,
    blocks: widgets,

    tickets,
    incidencias: tickets,

    invoices,
    facturas: invoices,

    users,
    usuarios: users,

    clients,
    clientes: clients,
    customers: clients,

    activity,
    activities: activity,
    recent: activity,
    recentActivity: activity,

    visibleTicketsCount: tickets.length,
    visibleIncidenciasCount: tickets.length,

    visibleInvoicesCount: invoices.length,
    visibleFacturasCount: invoices.length,

    visibleUsersCount: users.length,
    visibleUsuariosCount: users.length,

    visibleClientsCount: clients.length,
    visibleClientesCount: clients.length,
    visibleCustomersCount: clients.length,

    activityCount: activity.length,
    recentCount: activity.length,
    visibleActivityCount: activity.length,
  };

  return {
    ...source,

    dashboard: finalDashboard,

    summary,
    stats: summary,
    metrics: summary,
    totals: summary,
    counts: summary,

    widgets,

    tickets,
    incidencias: tickets,

    invoices,
    facturas: invoices,

    users,
    usuarios: users,

    clients,
    clientes: clients,
    customers: clients,

    activity,
    activities: activity,
    recent: activity,
    recentActivity: activity,

    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: pagination.totalPages,
    pagination,
    pageItems: pagination.items,

    totalCount: summary.totalTickets,
    remoteCount: summary.totalTickets,

    lastUpdatedAt: first(
      source.lastUpdatedAt,
      source.lastSyncAt,
      finalDashboard.updatedAt,
      finalDashboard.generatedAt,
      ""
    ),

    requestId: safeText(
      first(
        source.requestId,
        finalDashboard.requestId,
        finalDashboard.meta?.requestId,
        ""
      ),
      ""
    ),
  };
}

/* =========================================================
   PUBLIC API
========================================================= */

export const HomeModel = Object.freeze({
  version: HOME_MODEL_VERSION,

  normalizeKey: normalizeHomeKey,
  uniqueBy: uniqueHomeBy,

  unwrapEnvelope: unwrapHomeEnvelope,
  looksLikeDashboard: looksLikeHomeDashboard,

  normalizeCollectionSource: normalizeHomeCollectionSource,
  pickCollectionBlock: pickHomeCollectionBlock,

  normalizeDashboard: normalizeHomeDashboard,

  normalizeSummary: normalizeHomeSummary,
  buildDerivedSummary: buildHomeDerivedSummary,
  buildWidgetSummary: buildHomeWidgetSummary,
  buildWidgetsFromSummary: buildHomeWidgetsFromSummary,

  buildActivityFromCollections: buildHomeActivityFromCollections,

  normalizeTicket: normalizeHomeTicket,
  normalizeTickets: normalizeHomeTickets,
  getTicketId: getHomeTicketId,
  getTicketIdentities: getHomeTicketIdentities,
  getTicketStatus: getHomeTicketStatus,
  getTicketStatusKey: getHomeTicketStatusKey,
  getTicketStatusLabel: getHomeTicketStatusLabel,
  getTicketPriority: getHomeTicketPriority,
  findTicketById: findHomeTicketById,

  normalizeInvoice: normalizeHomeInvoice,
  normalizeInvoices: normalizeHomeInvoices,
  getInvoiceId: getHomeInvoiceId,
  getInvoiceAmount: getHomeInvoiceAmount,
  getInvoiceStatusKey: getHomeInvoiceStatusKey,
  findInvoiceById: findHomeInvoiceById,

  normalizeUser: normalizeHomeUser,
  normalizeUsers: normalizeHomeUsers,
  getUserId: getHomeUserId,

  normalizeClient: normalizeHomeClient,
  normalizeClients: normalizeHomeClients,
  getClientId: getHomeClientId,

  normalizeActivity: normalizeHomeActivity,
  normalizeActivityList: normalizeHomeActivityList,
  getActivityId: getHomeActivityId,

  normalizeWidget: normalizeHomeWidget,
  normalizeWidgets: normalizeHomeWidgets,
  getWidgetId: getHomeWidgetId,
  findWidgetById: findHomeWidgetById,

  paginate: paginateHomeItems,

  getLatestTicketUpdate: getLatestHomeTicketUpdate,

  buildTemplatePayload: buildHomeTemplatePayload,
});

export default HomeModel;
