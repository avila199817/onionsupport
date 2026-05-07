/* =========================================================
   Onion SPA - Home Model
   Archivo: src/views/home/home.model.js

   ONION SUPPORT · HOME MODEL
   DATA NORMALIZATION · VIEW MODEL · PAGINATION · ALIASES · 10/10

   RESPONSABILIDADES:
   - Normalizar dashboard del Home.
   - Normalizar tickets/incidencias.
   - Normalizar facturas/invoices.
   - Normalizar usuarios.
   - Normalizar clientes.
   - Normalizar actividad reciente.
   - Normalizar widgets/KPIs.
   - Construir summary estable para user/admin.
   - Separar total real vs visibleCount.
   - Mantener aliases backend/frontend.
   - Preparar payload estable para home.template.js.
   - Paginación fija/parametrizable.
   - Buscar tickets/widgets por múltiples IDs.
   - Ordenar incidencias por fecha reciente.
   - No tocar DOM.
   - No hacer HTTP.
   - No importar AppCore.
   - No CSS.
   - No side effects.

   REGLA CRÍTICA:
   - total/count = contador agregado real.
   - visibleCount = longitud de array renderizable.
   - Nunca pisar contador real con array vacío.
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const HOME_MODEL_VERSION =
  "10.0.0";

export const HOME_DEFAULT_PAGE_SIZE =
  5;

export const HOME_ROUTES =
  Object.freeze({
    HOME:
      "/",

    INCIDENCIAS:
      "/incidencias",

    FACTURAS:
      "/facturas",

    USUARIOS:
      "/usuarios",

    CLIENTES:
      "/clientes",

    CUENTA:
      "/cuenta",

    AJUSTES:
      "/ajustes",
  });

const EMPTY_DASHBOARD =
  Object.freeze({});

const EMPTY_ARRAY =
  Object.freeze([]);

/* =========================================================
   SAFE HELPERS
========================================================= */

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value, fallback = {}) {
  return isObject(value)
    ? value
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  if (typeof value === "string") {
    let normalized =
      value
        .trim()
        .replace(/€/g, "")
        .replace(/\$/g, "")
        .replace(/£/g, "")
        .replace(/%/g, "")
        .replace(/[^\d.,+\-\s]/g, "")
        .replace(/\s/g, "");

    const hasComma =
      normalized.includes(",");

    const hasDot =
      normalized.includes(".");

    if (
      hasComma &&
      hasDot
    ) {
      const lastComma =
        normalized.lastIndexOf(",");

      const lastDot =
        normalized.lastIndexOf(".");

      normalized =
        lastComma > lastDot
          ? normalized
              .replace(/\./g, "")
              .replace(/,/g, ".")
          : normalized
              .replace(/,/g, "");
    } else if (hasComma) {
      normalized =
        normalized.replace(/,/g, ".");
    }

    const parsed =
      Number(normalized);

    return Number.isFinite(parsed)
      ? parsed
      : fallback;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function toFiniteNumber(value = null) {
  const number =
    safeNumber(value, NaN);

  return Number.isFinite(number)
    ? number
    : null;
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key =
      value.trim().toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "on",
        "ok",
      ].includes(key)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
      ].includes(key)
    ) {
      return false;
    }
  }

  return Boolean(fallback);
}

function hasOwnKeys(value = {}) {
  return Boolean(
    isObject(value) &&
    Object.keys(value).length > 0
  );
}

function isMeaningful(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return false;
  }

  if (
    typeof value === "string" &&
    value.trim() === ""
  ) {
    return false;
  }

  if (
    Array.isArray(value) &&
    value.length === 0
  ) {
    return false;
  }

  if (
    isObject(value) &&
    Object.keys(value).length === 0
  ) {
    return false;
  }

  return true;
}

function first(...values) {
  for (const value of values) {
    if (isMeaningful(value)) {
      return value;
    }
  }

  return null;
}

function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function uniqueStrings(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flatMap((value) =>
          Array.isArray(value)
            ? value
            : [value]
        )
        .map((value) =>
          safeText(value, "")
        )
        .filter(Boolean)
    ),
  ];
}

function uniqueBy(items = [], picker = (item) => item) {
  const seen =
    new Set();

  const output =
    [];

  for (const item of safeArray(items)) {
    const key =
      safeText(picker(item), "");

    if (!key) {
      output.push(item);
      continue;
    }

    const normalized =
      normalizeKey(key);

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(item);
  }

  return output;
}

function getPath(object = {}, path = "") {
  const root =
    safeObject(object, null);

  const cleanPath =
    safeText(path, "");

  if (
    !root ||
    !cleanPath
  ) {
    return undefined;
  }

  return cleanPath
    .split(".")
    .reduce((acc, segment) => {
      if (
        acc === null ||
        acc === undefined
      ) {
        return undefined;
      }

      return acc?.[segment];
    }, root);
}

function pickFirstFromSources(keys = [], sources = [], fallback = null) {
  for (const source of safeArray(sources)) {
    const object =
      safeObject(source, null);

    if (!object) {
      continue;
    }

    for (const key of safeArray(keys)) {
      const value =
        key.includes(".")
          ? getPath(object, key)
          : object?.[key];

      if (isMeaningful(value)) {
        return value;
      }
    }
  }

  return fallback;
}

function pickMaxFromSources(keys = [], sources = [], fallback = 0) {
  let max =
    null;

  for (const source of safeArray(sources)) {
    const object =
      safeObject(source, null);

    if (!object) {
      continue;
    }

    for (const key of safeArray(keys)) {
      const value =
        key.includes(".")
          ? getPath(object, key)
          : object?.[key];

      const number =
        toFiniteNumber(value);

      if (number === null) {
        continue;
      }

      max =
        max === null
          ? number
          : Math.max(max, number);
    }
  }

  return max === null
    ? fallback
    : max;
}

function parseDateMs(value = null) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : 0;
  }

  try {
    const time =
      new Date(value).getTime();

    return Number.isFinite(time)
      ? time
      : 0;
  } catch {
    return 0;
  }
}

function toIsoDate(value = null) {
  const ms =
    parseDateMs(value);

  if (!ms) {
    return null;
  }

  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return String(Date.now());
  }
}

/* =========================================================
   ENVELOPE / DASHBOARD DETECTION
========================================================= */

function looksLikeDashboard(value = null) {
  const object =
    safeObject(value, null);

  if (!object) {
    return false;
  }

  return Boolean(
    "summary" in object ||
      "stats" in object ||
      "metrics" in object ||
      "totals" in object ||
      "counts" in object ||
      "widgets" in object ||
      "cards" in object ||
      "kpis" in object ||
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
      "collections" in object ||
      "resources" in object ||
      "totalTickets" in object ||
      "ticketsTotal" in object ||
      "incidenciasTotal" in object ||
      "totalInvoices" in object ||
      "facturasTotal" in object ||
      "usersCount" in object ||
      "usuariosCount" in object ||
      "clientsCount" in object ||
      "clientesCount" in object
  );
}

function unwrapEnvelope(payload = null, depth = 0) {
  if (
    payload === null ||
    payload === undefined
  ) {
    return null;
  }

  if (depth > 12) {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  if (looksLikeDashboard(payload)) {
    return payload;
  }

  const object =
    safeObject(payload, null);

  if (!object) {
    return payload;
  }

  const candidates = [
    object.dashboard,
    object.data,
    object.result,
    object.payload,
    object.body,
    object.response,
    object.item,
    object.content,
  ];

  for (const candidate of candidates) {
    if (
      candidate === undefined ||
      candidate === null
    ) {
      continue;
    }

    const unwrapped =
      unwrapEnvelope(
        candidate,
        depth + 1
      );

    if (
      unwrapped !== undefined &&
      unwrapped !== null
    ) {
      return unwrapped;
    }
  }

  return object;
}

function pickDashboard(payload = null) {
  if (looksLikeDashboard(payload)) {
    return safeObject(payload, {});
  }

  const object =
    safeObject(payload, null);

  const candidates = [
    payload,

    object?.dashboard,
    object?.data?.dashboard,
    object?.payload?.dashboard,
    object?.result?.dashboard,
    object?.response?.dashboard,

    object?.data,
    object?.payload,
    object?.result,
    object?.response,
    object?.body,
  ];

  for (const candidate of candidates) {
    if (looksLikeDashboard(candidate)) {
      return safeObject(candidate, {});
    }

    const unwrapped =
      unwrapEnvelope(candidate);

    if (looksLikeDashboard(unwrapped)) {
      return safeObject(unwrapped, {});
    }
  }

  const fallback =
    unwrapEnvelope(payload);

  return safeObject(fallback, {});
}

/* =========================================================
   COLLECTION NORMALIZATION
========================================================= */

function normalizeCollectionSource(value = null, fallbackKeys = []) {
  if (Array.isArray(value)) {
    return {
      items:
        value,

      total:
        value.length,

      visibleCount:
        value.length,

      raw:
        value,
    };
  }

  const object =
    safeObject(value, null);

  if (!object) {
    return {
      items:
        [],

      total:
        0,

      visibleCount:
        0,

      raw:
        value,
    };
  }

  const directItems =
    first(
      object.items,
      object.rows,
      object.records,
      object.results,
      object.data,
      object.docs,
      object.value,
      object.documents,
      object.collection,
      object.list
    );

  let items =
    safeArray(directItems);

  if (!items.length) {
    for (const key of safeArray(fallbackKeys)) {
      const candidate =
        object?.[key];

      if (Array.isArray(candidate)) {
        items =
          candidate;
        break;
      }

      if (hasOwnKeys(candidate)) {
        const nested =
          normalizeCollectionSource(
            candidate,
            fallbackKeys
          );

        if (
          nested.items.length ||
          nested.total > 0
        ) {
          items =
            nested.items;
          break;
        }
      }
    }
  }

  const total =
    Math.max(
      items.length,
      safeNumber(
        first(
          object.total,
          object.count,
          object.remoteCount,
          object.totalCount,
          object.length,

          object.meta?.total,
          object.meta?.count,
          object.meta?.remoteCount,
          object.meta?.totalCount,

          object.pagination?.total,
          object.pagination?.count,
          object.pagination?.remoteCount,
          object.pagination?.totalCount,

          object.page?.total,
          object.pageInfo?.total,
          object.pageInfo?.totalCount,

          items.length
        ),
        items.length
      )
    );

  return {
    items,
    total,
    visibleCount:
      items.length,

    raw:
      value,
  };
}

function getCollectionSources(source = {}) {
  const raw =
    safeObject(source);

  return [
    raw,

    raw.collections,
    raw.resources,

    raw.dashboard,
    raw.summary,
    raw.stats,
    raw.metrics,
    raw.totals,
    raw.counts,

    raw.data,
    raw.payload,
    raw.result,
    raw.response,
    raw.body,

    raw.data?.collections,
    raw.data?.resources,

    raw.payload?.collections,
    raw.payload?.resources,

    raw.result?.collections,
    raw.result?.resources,

    raw.response?.collections,
    raw.response?.resources,

    raw.dashboard?.collections,
    raw.dashboard?.resources,
  ].filter(hasOwnKeys);
}

function pickCollectionBlock(source = {}, keys = []) {
  const aliases =
    safeArray(keys);

  const sources =
    getCollectionSources(source);

  for (const candidateSource of sources) {
    for (const key of aliases) {
      const direct =
        candidateSource?.[key];

      if (Array.isArray(direct)) {
        return normalizeCollectionSource(
          direct,
          aliases
        );
      }

      if (hasOwnKeys(direct)) {
        const normalized =
          normalizeCollectionSource(
            direct,
            aliases
          );

        if (
          normalized.items.length ||
          normalized.total > 0
        ) {
          return normalized;
        }
      }
    }
  }

  return {
    items:
      [],

    total:
      0,

    visibleCount:
      0,

    raw:
      null,
  };
}

function mergeCollectionBlocks(primary = {}, fallback = {}) {
  const primaryItems =
    safeArray(primary.items);

  const fallbackItems =
    safeArray(fallback.items);

  const items =
    primaryItems.length
      ? primaryItems
      : fallbackItems;

  const total =
    Math.max(
      items.length,
      safeNumber(primary.total, 0),
      safeNumber(fallback.total, 0)
    );

  return {
    items,
    total,
    visibleCount:
      items.length,

    raw:
      primary.raw || fallback.raw || null,
  };
}

export function buildHomeCollectionEnvelope(items = [], total = null) {
  const rows =
    safeArray(items);

  const finalTotal =
    Math.max(
      rows.length,
      safeNumber(total, rows.length)
    );

  return {
    items:
      rows,

    rows:
      rows,

    data:
      rows,

    results:
      rows,

    total:
      finalTotal,

    count:
      rows.length,

    totalCount:
      finalTotal,

    remoteCount:
      finalTotal,

    visibleCount:
      rows.length,
  };
}

/* =========================================================
   TICKETS / INCIDENCIAS
========================================================= */

export function getHomeTicketId(item = {}) {
  if (
    typeof item === "string" ||
    typeof item === "number"
  ) {
    return safeText(item, "");
  }

  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

  return safeText(
    first(
      raw.ticketId,
      raw.incidenciaId,
      raw.id,
      raw._id,
      raw.code,
      raw.numero,
      raw.ticketCode,
      raw.entityId,

      base.ticketId,
      base.incidenciaId,
      base.id,
      base._id,
      base.code,
      base.numero,
      base.ticketCode,
      base.entityId
    ),
    ""
  );
}

export function getHomeTicketAliases(item = {}) {
  if (
    typeof item === "string" ||
    typeof item === "number"
  ) {
    return [
      safeText(item, ""),
    ].filter(Boolean);
  }

  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

  return uniqueStrings([
    raw.ticketId,
    raw.incidenciaId,
    raw.id,
    raw._id,
    raw.code,
    raw.numero,
    raw.ticketCode,
    raw.entityId,

    base.ticketId,
    base.incidenciaId,
    base.id,
    base._id,
    base.code,
    base.numero,
    base.ticketCode,
    base.entityId,
  ]);
}

export function getHomeTicketSubject(item = {}) {
  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

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

export function getHomeTicketDescription(item = {}) {
  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

  return safeText(
    first(
      raw.description,
      raw.descripcion,
      raw.message,
      raw.preview,
      raw.body,
      raw.text,

      base.description,
      base.descripcion,
      base.message,
      base.preview,
      base.body,
      base.text
    ),
    "Sin descripción."
  );
}

export function getHomeTicketStatus(item = {}) {
  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

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

export function getHomeTicketStatusKey(valueOrItem = {}) {
  const rawStatus =
    isObject(valueOrItem)
      ? getHomeTicketStatus(valueOrItem)
      : valueOrItem;

  const key =
    normalizeKey(rawStatus);

  if (
    [
      "pending",
      "pendiente",
      "pendientes",
      "new",
      "nueva",
      "nuevo",
      "created",
      "creada",
      "creado",
    ].includes(key)
  ) {
    return "pending";
  }

  if (
    [
      "open",
      "opened",
      "abierta",
      "abierto",
      "abiertas",
      "abiertos",
    ].includes(key)
  ) {
    return "open";
  }

  if (
    [
      "progress",
      "in_progress",
      "inprogress",
      "en_proceso",
      "proceso",
      "working",
      "trabajando",
      "assigned",
      "asignada",
      "asignado",
    ].includes(key)
  ) {
    return "progress";
  }

  if (
    [
      "resolved",
      "resuelta",
      "resuelto",
      "solved",
    ].includes(key)
  ) {
    return "resolved";
  }

  if (
    [
      "closed",
      "close",
      "cerrada",
      "cerrado",
      "cancelled",
      "cancelada",
      "cancelado",
      "archived",
      "archivada",
      "archivado",
    ].includes(key)
  ) {
    return "closed";
  }

  return "pending";
}

export function getHomeTicketStatusLabel(valueOrItem = {}) {
  const key =
    getHomeTicketStatusKey(valueOrItem);

  if (key === "open") return "Abierta";
  if (key === "pending") return "Pendiente";
  if (key === "progress") return "En proceso";
  if (key === "resolved") return "Resuelta";
  if (key === "closed") return "Cerrada";

  return "Pendiente";
}

export function getHomeTicketPriority(item = {}) {
  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

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

export function getHomeTicketPriorityKey(valueOrItem = {}) {
  const rawPriority =
    isObject(valueOrItem)
      ? getHomeTicketPriority(valueOrItem)
      : valueOrItem;

  const key =
    normalizeKey(rawPriority);

  if (
    [
      "urgent",
      "urgente",
      "critical",
      "critica",
      "crítica",
      "critico",
      "crítico",
      "p0",
      "p1",
    ].includes(key)
  ) {
    return "urgent";
  }

  if (
    [
      "high",
      "alta",
      "alto",
      "important",
      "importante",
      "p2",
    ].includes(key)
  ) {
    return "high";
  }

  if (
    [
      "low",
      "baja",
      "bajo",
      "minor",
      "menor",
      "p4",
    ].includes(key)
  ) {
    return "low";
  }

  return "medium";
}

export function getHomeTicketPriorityLabel(valueOrItem = {}) {
  const key =
    getHomeTicketPriorityKey(valueOrItem);

  if (key === "urgent") return "Urgente";
  if (key === "high") return "Alta";
  if (key === "low") return "Baja";

  return "Media";
}

export function getHomeTicketCreatedAt(item = {}) {
  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

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
  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

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
  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

  const attachments =
    first(
      raw.attachments,
      raw.files,
      raw.adjuntos,
      raw.documents,

      base.attachments,
      base.files,
      base.adjuntos,
      base.documents
    );

  if (Array.isArray(attachments)) {
    return attachments.length;
  }

  return Math.max(
    0,
    safeNumber(
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
    )
  );
}

export function getHomeTicketRequesterName(item = {}) {
  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

  return safeText(
    first(
      raw.clientName,
      raw.clienteNombre,
      raw.customerName,
      raw.userName,
      raw.requesterName,
      raw.createdByName,
      raw.ownerName,
      raw.name,

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
      raw.receptor?.name,

      base.clientName,
      base.clienteNombre,
      base.customerName,
      base.userName,
      base.requesterName,
      base.createdByName,
      base.ownerName,
      base.name,

      base.requesterSnapshot?.name,
      base.requesterSnapshot?.displayName,
      base.cliente?.nombreContacto,
      base.cliente?.nombre,
      base.cliente?.name,
      base.cliente?.displayName,
      base.client?.name,
      base.customer?.name,
      base.createdBy?.name,
      base.user?.name,
      base.owner?.name,
      base.receptor?.name
    ),
    ""
  );
}

export function getHomeTicketRequesterEmail(item = {}) {
  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

  return safeText(
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

      base.clientEmail,
      base.clienteEmail,
      base.email,
      base.emailCliente,
      base.requesterSnapshot?.email,
      base.createdBy?.email,
      base.cliente?.email,
      base.cliente?.emailLower,
      base.client?.email,
      base.customer?.email,
      base.receptor?.email
    ),
    ""
  );
}

export function getHomeTicketAvatar(item = {}) {
  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

  return safeText(
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

      base.clientAvatar,
      base.avatar,
      base.avatarUrl,
      base.avatar_url,
      base.userAvatar,
      base.createdByAvatar,
      base.ownerAvatar,

      base.requesterSnapshot?.avatar,
      base.requesterSnapshot?.avatarUrl,

      base.cliente?.avatar,
      base.cliente?.avatarUrl,
      base.client?.avatar,
      base.client?.avatarUrl,
      base.customer?.avatar,
      base.customer?.avatarUrl,
      base.createdBy?.avatar,
      base.createdBy?.avatarUrl,
      base.user?.avatar,
      base.user?.avatarUrl,
      base.owner?.avatar,
      base.owner?.avatarUrl
    ),
    ""
  );
}

export function normalizeHomeTicket(item = {}) {
  const raw =
    safeObject(item);

  const id =
    getHomeTicketId(raw);

  const subject =
    getHomeTicketSubject(raw);

  const description =
    getHomeTicketDescription(raw);

  const status =
    getHomeTicketStatus(raw);

  const statusKey =
    getHomeTicketStatusKey(status);

  const statusLabel =
    getHomeTicketStatusLabel(status);

  const priority =
    getHomeTicketPriority(raw);

  const priorityKey =
    getHomeTicketPriorityKey(priority);

  const priorityLabel =
    getHomeTicketPriorityLabel(priority);

  const requesterName =
    getHomeTicketRequesterName(raw);

  const requesterEmail =
    getHomeTicketRequesterEmail(raw);

  const avatar =
    getHomeTicketAvatar(raw);

  const createdAt =
    getHomeTicketCreatedAt(raw);

  const updatedAt =
    getHomeTicketUpdatedAt(raw) ||
    createdAt;

  const attachmentsCount =
    getHomeTicketAttachmentsCount(raw);

  return {
    ...raw,

    id:
      safeText(first(raw.id, id), id),

    _id:
      safeText(first(raw._id, raw.id, id), id),

    ticketId:
      safeText(first(raw.ticketId, id), id),

    incidenciaId:
      safeText(first(raw.incidenciaId, id), id),

    code:
      safeText(first(raw.code, raw.ticketCode, id), id),

    ticketCode:
      safeText(first(raw.ticketCode, raw.code, id), id),

    entityId:
      safeText(first(raw.entityId, id), id),

    subject,
    title:
      safeText(first(raw.title, raw.subject, subject), subject),

    asunto:
      safeText(first(raw.asunto, raw.subject, raw.title, subject), subject),

    description,
    descripcion:
      safeText(first(raw.descripcion, raw.description, description), description),

    message:
      safeText(first(raw.message, raw.description, raw.descripcion, description), description),

    preview:
      safeText(first(raw.preview, description, subject), subject),

    status,
    estado:
      safeText(first(raw.estado, raw.status, status), status),

    state:
      safeText(first(raw.state, raw.status, status), status),

    statusKey,
    estadoKey:
      statusKey,

    statusLabel,
    estadoLabel:
      statusLabel,

    priority,
    prioridad:
      safeText(first(raw.prioridad, raw.priority, priority), priority),

    severity:
      safeText(first(raw.severity, raw.priority, priority), priority),

    priorityKey,
    prioridadKey:
      priorityKey,

    priorityLabel,
    prioridadLabel:
      priorityLabel,

    clientName:
      requesterName,

    clienteNombre:
      safeText(first(raw.clienteNombre, requesterName), requesterName),

    requesterName,

    clientEmail:
      requesterEmail,

    clienteEmail:
      safeText(first(raw.clienteEmail, requesterEmail), requesterEmail),

    email:
      safeText(first(raw.email, requesterEmail), requesterEmail),

    clientAvatar:
      avatar,

    avatar:
      safeText(first(raw.avatar, avatar), avatar),

    avatarUrl:
      safeText(first(raw.avatarUrl, avatar), avatar),

    category:
      safeText(first(raw.category, raw.categoria, raw.type, raw.tipo), "Soporte"),

    categoria:
      safeText(first(raw.categoria, raw.category, raw.type, raw.tipo), "Soporte"),

    type:
      safeText(first(raw.type, raw.tipo, raw.category, raw.categoria), "Soporte"),

    tipo:
      safeText(first(raw.tipo, raw.type, raw.category, raw.categoria), "Soporte"),

    createdAt,
    updatedAt,

    lastUpdateAt:
      first(raw.lastUpdateAt, raw.updatedAt, updatedAt),

    attachmentsCount,
    filesCount:
      attachmentsCount,

    adjuntosCount:
      attachmentsCount,

    hasAttachments:
      attachmentsCount > 0,

    raw:
      hasOwnKeys(raw.raw)
        ? raw.raw
        : raw,
  };
}

export function normalizeHomeTicketsCollection(items = []) {
  return sortHomeTicketsByUpdatedDesc(
    uniqueBy(
      safeArray(items).map((item) =>
        normalizeHomeTicket(item)
      ),
      getHomeTicketId
    )
  );
}

export function sortHomeTicketsByUpdatedDesc(items = []) {
  return [...safeArray(items)]
    .sort((a, b) => {
      const left =
        parseDateMs(
          getHomeTicketUpdatedAt(a) ||
            getHomeTicketCreatedAt(a)
        );

      const right =
        parseDateMs(
          getHomeTicketUpdatedAt(b) ||
            getHomeTicketCreatedAt(b)
        );

      return right - left;
    });
}

export function isHomeTicketOpenLike(item = {}) {
  return [
    "open",
    "pending",
    "progress",
  ].includes(
    getHomeTicketStatusKey(item)
  );
}

export function isHomeTicketClosedLike(item = {}) {
  return [
    "closed",
    "resolved",
  ].includes(
    getHomeTicketStatusKey(item)
  );
}

export function isHomeTicketUrgentLike(item = {}) {
  return [
    "urgent",
    "high",
  ].includes(
    getHomeTicketPriorityKey(item)
  );
}

export function findHomeTicketById(items = [], ticketId = "") {
  const target =
    safeText(ticketId, "");

  if (!target) {
    return null;
  }

  const normalizedTarget =
    normalizeKey(target);

  return (
    safeArray(items).find((item) =>
      getHomeTicketAliases(item).some((candidate) =>
        normalizeKey(candidate) === normalizedTarget
      )
    ) || null
  );
}

/* =========================================================
   FACTURAS / INVOICES
========================================================= */

export function getHomeInvoiceId(item = {}) {
  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

  return safeText(
    first(
      raw.invoiceId,
      raw.facturaId,
      raw.number,
      raw.numeroFacturaLegal,
      raw.numeroFactura,
      raw.invoiceNumber,
      raw.numero,
      raw.code,
      raw.id,
      raw._id,

      base.invoiceId,
      base.facturaId,
      base.number,
      base.numeroFacturaLegal,
      base.numeroFactura,
      base.invoiceNumber,
      base.numero,
      base.code,
      base.id,
      base._id
    ),
    ""
  );
}

export function getHomeInvoiceAmount(item = {}) {
  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

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

export function getHomeInvoiceCurrency(item = {}) {
  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

  return safeText(
    first(
      raw.currency,
      raw.moneda,
      base.currency,
      base.moneda,
      "EUR"
    ),
    "EUR"
  ).toUpperCase();
}

export function getHomeInvoiceStatus(item = {}) {
  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

  return safeText(
    first(
      raw.paymentStatus,
      raw.estadoPago,
      raw.status,
      raw.estado,

      base.paymentStatus,
      base.estadoPago,
      base.status,
      base.estado,

      "pending"
    ),
    "pending"
  );
}

export function getHomeInvoiceStatusKey(valueOrItem = {}) {
  const rawStatus =
    isObject(valueOrItem)
      ? getHomeInvoiceStatus(valueOrItem)
      : valueOrItem;

  const key =
    normalizeKey(rawStatus);

  if (
    [
      "paid",
      "pagada",
      "pagado",
      "cobrada",
      "cobrado",
    ].includes(key)
  ) {
    return "paid";
  }

  if (
    [
      "pending",
      "pendiente",
      "unpaid",
    ].includes(key)
  ) {
    return "pending";
  }

  if (
    [
      "overdue",
      "vencida",
      "vencido",
    ].includes(key)
  ) {
    return "overdue";
  }

  if (
    [
      "partial",
      "parcial",
      "pago_parcial",
    ].includes(key)
  ) {
    return "partial";
  }

  if (
    [
      "cancelled",
      "cancelada",
      "cancelado",
    ].includes(key)
  ) {
    return "cancelled";
  }

  if (
    [
      "draft",
      "borrador",
    ].includes(key)
  ) {
    return "draft";
  }

  return "pending";
}

export function isHomeInvoicePendingLike(item = {}) {
  return [
    "pending",
    "overdue",
    "partial",
  ].includes(
    getHomeInvoiceStatusKey(item)
  );
}

export function normalizeHomeInvoice(item = {}) {
  const raw =
    safeObject(item);

  const id =
    getHomeInvoiceId(raw);

  const amount =
    getHomeInvoiceAmount(raw);

  const currency =
    getHomeInvoiceCurrency(raw);

  const status =
    getHomeInvoiceStatus(raw);

  const statusKey =
    getHomeInvoiceStatusKey(status);

  return {
    ...raw,

    id:
      safeText(first(raw.id, id), id),

    _id:
      safeText(first(raw._id, raw.id, id), id),

    invoiceId:
      safeText(first(raw.invoiceId, id), id),

    facturaId:
      safeText(first(raw.facturaId, id), id),

    numeroFacturaLegal:
      safeText(
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

    numeroFactura:
      safeText(first(raw.numeroFactura, raw.numeroFacturaLegal, raw.number, raw.numero, id), id),

    invoiceNumber:
      safeText(first(raw.invoiceNumber, raw.numeroFacturaLegal, raw.number, raw.numero, id), id),

    number:
      safeText(first(raw.number, raw.numero, raw.code, id), id),

    numero:
      safeText(first(raw.numero, raw.number, raw.code, id), id),

    code:
      safeText(first(raw.code, raw.numero, raw.number, id), id),

    total:
      amount,

    amount,
    importe:
      amount,

    price:
      amount,

    totalFactura:
      amount,

    facturaTotal:
      amount,

    facturaImporte:
      amount,

    invoiceAmount:
      amount,

    currency,
    moneda:
      currency,

    paymentStatus:
      status,

    estadoPago:
      safeText(first(raw.estadoPago, raw.paymentStatus, status), status),

    status:
      safeText(first(raw.status, status), status),

    estado:
      safeText(first(raw.estado, raw.status, status), status),

    statusKey,
    estadoPagoKey:
      statusKey,

    createdAt:
      first(raw.createdAt, raw.fechaCreacion, raw.date, raw.raw?.createdAt, raw.raw?.fechaCreacion, raw.raw?.date),

    updatedAt:
      first(raw.updatedAt, raw.modifiedAt, raw.date, raw.raw?.updatedAt, raw.raw?.modifiedAt, raw.raw?.date),

    raw:
      hasOwnKeys(raw.raw)
        ? raw.raw
        : raw,
  };
}

export function normalizeHomeInvoicesCollection(items = []) {
  return uniqueBy(
    safeArray(items).map((item) =>
      normalizeHomeInvoice(item)
    ),
    getHomeInvoiceId
  );
}

/* =========================================================
   USERS
========================================================= */

export function getHomeUserId(item = {}) {
  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

  return safeText(
    first(
      raw.userId,
      raw.usuarioId,
      raw.id,
      raw._id,
      raw.email,
      raw.mail,
      raw.username,

      base.userId,
      base.usuarioId,
      base.id,
      base._id,
      base.email,
      base.mail,
      base.username
    ),
    ""
  );
}

export function normalizeHomeUser(item = {}) {
  const raw =
    safeObject(item);

  const id =
    getHomeUserId(raw);

  const displayName =
    safeText(
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

  const active =
    safeBoolean(
      first(
        raw.active,
        raw.isActive,
        raw.enabled,
        raw.raw?.active,
        raw.raw?.isActive,
        raw.raw?.enabled,
        true
      ),
      true
    );

  return {
    ...raw,

    id:
      safeText(first(raw.id, id), id),

    _id:
      safeText(first(raw._id, raw.id, id), id),

    userId:
      safeText(first(raw.userId, id), id),

    usuarioId:
      safeText(first(raw.usuarioId, id), id),

    displayName,

    fullName:
      safeText(first(raw.fullName, displayName), displayName),

    name:
      safeText(first(raw.name, displayName), displayName),

    nombre:
      safeText(first(raw.nombre, displayName), displayName),

    username:
      safeText(first(raw.username, raw.email, id), id),

    email:
      safeText(first(raw.email, raw.mail, raw.raw?.email, raw.raw?.mail), ""),

    role:
      safeText(first(raw.role, raw.rol, raw.type, raw.raw?.role, raw.raw?.rol, raw.raw?.type), "user"),

    rol:
      safeText(first(raw.rol, raw.role, raw.type, raw.raw?.rol, raw.raw?.role, raw.raw?.type), "user"),

    active,
    isActive:
      active,

    createdAt:
      first(raw.createdAt, raw.raw?.createdAt),

    updatedAt:
      first(raw.updatedAt, raw.modifiedAt, raw.raw?.updatedAt, raw.raw?.modifiedAt),

    raw:
      hasOwnKeys(raw.raw)
        ? raw.raw
        : raw,
  };
}

export function normalizeHomeUsersCollection(items = []) {
  return uniqueBy(
    safeArray(items).map((item) =>
      normalizeHomeUser(item)
    ),
    getHomeUserId
  );
}

/* =========================================================
   CLIENTS
========================================================= */

export function getHomeClientId(item = {}) {
  const raw =
    safeObject(item);

  const base =
    safeObject(raw.raw);

  return safeText(
    first(
      raw.clientId,
      raw.clienteId,
      raw.customerId,
      raw.id,
      raw._id,
      raw.email,
      raw.mail,
      raw.nif,
      raw.cif,

      base.clientId,
      base.clienteId,
      base.customerId,
      base.id,
      base._id,
      base.email,
      base.mail,
      base.nif,
      base.cif
    ),
    ""
  );
}

export function normalizeHomeClient(item = {}) {
  const raw =
    safeObject(item);

  const id =
    getHomeClientId(raw);

  const name =
    safeText(
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

  const active =
    safeBoolean(
      first(
        raw.active,
        raw.isActive,
        raw.enabled,
        raw.raw?.active,
        raw.raw?.isActive,
        raw.raw?.enabled,
        true
      ),
      true
    );

  return {
    ...raw,

    id:
      safeText(first(raw.id, id), id),

    _id:
      safeText(first(raw._id, raw.id, id), id),

    clientId:
      safeText(first(raw.clientId, id), id),

    clienteId:
      safeText(first(raw.clienteId, id), id),

    customerId:
      safeText(first(raw.customerId, id), id),

    name,
    nombre:
      safeText(first(raw.nombre, name), name),

    displayName:
      safeText(first(raw.displayName, name), name),

    razonSocial:
      safeText(first(raw.razonSocial, name), name),

    email:
      safeText(first(raw.email, raw.mail, raw.raw?.email, raw.raw?.mail), ""),

    phone:
      safeText(first(raw.phone, raw.telefono, raw.raw?.phone, raw.raw?.telefono), ""),

    telefono:
      safeText(first(raw.telefono, raw.phone, raw.raw?.telefono, raw.raw?.phone), ""),

    active,
    isActive:
      active,

    createdAt:
      first(raw.createdAt, raw.raw?.createdAt),

    updatedAt:
      first(raw.updatedAt, raw.modifiedAt, raw.raw?.updatedAt, raw.raw?.modifiedAt),

    raw:
      hasOwnKeys(raw.raw)
        ? raw.raw
        : raw,
  };
}

export function normalizeHomeClientsCollection(items = []) {
  return uniqueBy(
    safeArray(items).map((item) =>
      normalizeHomeClient(item)
    ),
    getHomeClientId
  );
}

/* =========================================================
   ACTIVITY
========================================================= */

export function getHomeActivityId(item = {}) {
  const raw =
    safeObject(item);

  return safeText(
    first(
      raw.activityId,
      raw.eventId,
      raw.id,
      raw._id,
      raw.entityId,
      raw.ticketId,
      raw.incidenciaId,
      raw.facturaId,
      raw.invoiceId,
      raw.userId,
      raw.clienteId,
      raw.title
    ),
    ""
  );
}

export function normalizeHomeActivityItem(item = {}) {
  const raw =
    safeObject(item);

  const type =
    safeText(
      first(
        raw.type,
        raw.kind,
        raw.category,
        raw.raw?.type,
        raw.raw?.kind,
        raw.raw?.category,
        "activity"
      ),
      "activity"
    );

  const title =
    safeText(
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

  const entityId =
    safeText(
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

    kind:
      safeText(first(raw.kind, type), type),

    category:
      safeText(first(raw.category, type), type),

    title,

    text:
      safeText(
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

    date:
      first(
        raw.date,
        raw.createdAt,
        raw.updatedAt,
        raw.timestamp,

        raw.raw?.date,
        raw.raw?.createdAt,
        raw.raw?.updatedAt,
        raw.raw?.timestamp
      ),

    route:
      safeText(first(raw.route, raw.href, raw.link, raw.to, raw.raw?.route), ""),

    href:
      safeText(first(raw.href, raw.route, raw.link, raw.to, raw.raw?.href), ""),

    action:
      safeText(first(raw.action, raw.raw?.action, "open-activity"), "open-activity"),

    entityId,

    id:
      safeText(first(raw.id, entityId), entityId),

    raw:
      hasOwnKeys(raw.raw)
        ? raw.raw
        : raw,
  };
}

export function normalizeHomeActivityCollection(items = []) {
  return uniqueBy(
    safeArray(items).map((item) =>
      normalizeHomeActivityItem(item)
    ),
    getHomeActivityId
  ).sort((a, b) =>
    parseDateMs(b.date) - parseDateMs(a.date)
  );
}

export function buildHomeActivityFromCollections({
  tickets = [],
  invoices = [],
  users = [],
  clients = [],
} = {}) {
  const ticketActivity =
    safeArray(tickets)
      .slice(0, 8)
      .map((item) => {
        const ticketId =
          getHomeTicketId(item);

        return {
          type:
            "ticket",

          title:
            getHomeTicketSubject(item),

          text:
            `Incidencia ${ticketId || "sin ID"} · ${getHomeTicketStatusLabel(item)}`,

          date:
            getHomeTicketUpdatedAt(item) ||
            getHomeTicketCreatedAt(item),

          route:
            HOME_ROUTES.INCIDENCIAS,

          action:
            "open-ticket",

          entityId:
            ticketId,
        };
      });

  const invoiceActivity =
    safeArray(invoices)
      .slice(0, 4)
      .map((item) => {
        const invoiceId =
          getHomeInvoiceId(item);

        const amount =
          getHomeInvoiceAmount(item);

        const currency =
          getHomeInvoiceCurrency(item);

        return {
          type:
            "invoice",

          title:
            invoiceId
              ? `Factura ${invoiceId}`
              : "Factura registrada",

          text:
            formatHomeMoney(amount, currency),

          date:
            first(
              item.updatedAt,
              item.modifiedAt,
              item.createdAt,
              item.date,
              item.raw?.updatedAt,
              item.raw?.modifiedAt,
              item.raw?.createdAt,
              item.raw?.date
            ),

          route:
            HOME_ROUTES.FACTURAS,

          action:
            "open-invoice",

          entityId:
            invoiceId,
        };
      });

  const clientActivity =
    safeArray(clients)
      .slice(0, 3)
      .map((item) => ({
        type:
          "client",

        title:
          safeText(
            first(
              item.name,
              item.nombre,
              item.razonSocial,
              item.company,
              item.email
            ),
            "Cliente"
          ),

        text:
          "Cliente sincronizado en el panel.",

        date:
          first(
            item.updatedAt,
            item.createdAt,
            item.raw?.updatedAt,
            item.raw?.createdAt
          ),

        route:
          HOME_ROUTES.CLIENTES,

        action:
          "navigate-home",

        entityId:
          getHomeClientId(item),
      }));

  const userActivity =
    safeArray(users)
      .slice(0, 3)
      .map((item) => ({
        type:
          "user",

        title:
          safeText(
            first(
              item.name,
              item.nombre,
              item.displayName,
              item.fullName,
              item.username,
              item.email
            ),
            "Usuario"
          ),

        text:
          "Usuario disponible en el sistema.",

        date:
          first(
            item.lastLoginAt,
            item.updatedAt,
            item.createdAt,
            item.raw?.lastLoginAt,
            item.raw?.updatedAt,
            item.raw?.createdAt
          ),

        route:
          HOME_ROUTES.USUARIOS,

        action:
          "navigate-home",

        entityId:
          getHomeUserId(item),
      }));

  return normalizeHomeActivityCollection([
    ...ticketActivity,
    ...invoiceActivity,
    ...clientActivity,
    ...userActivity,
  ]);
}

/* =========================================================
   WIDGETS
========================================================= */

export function getHomeWidgetId(item = {}) {
  const raw =
    safeObject(item);

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
  const raw =
    safeObject(item);

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

export function getHomeWidgetNumericValue(item = {}) {
  return toFiniteNumber(
    first(
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
    )
  );
}

export function getHomeWidgetCorpus(item = {}) {
  const raw =
    safeObject(item);

  return normalizeKey(
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
      .filter((value) =>
        value !== undefined &&
        value !== null
      )
      .join(" ")
  );
}

export function normalizeHomeWidget(item = {}) {
  const raw =
    safeObject(item);

  const id =
    getHomeWidgetId(raw);

  const title =
    getHomeWidgetTitle(raw);

  return {
    ...raw,

    widgetId:
      id,

    widgetKey:
      safeText(first(raw.widgetKey, raw.key, id), id),

    id:
      safeText(first(raw.id, id), id),

    key:
      safeText(first(raw.key, id), id),

    slug:
      safeText(first(raw.slug, raw.key, id), id),

    title,

    name:
      safeText(first(raw.name, title), title),

    label:
      safeText(first(raw.label, title), title),

    description:
      safeText(
        first(
          raw.description,
          raw.descripcion,
          raw.subtitle,
          raw.summary,
          raw.text
        ),
        ""
      ),

    subtitle:
      safeText(first(raw.subtitle, raw.description, raw.text), ""),

    text:
      safeText(first(raw.text, raw.description, raw.subtitle), ""),

    type:
      safeText(first(raw.type, raw.kind, raw.variant, raw.category), "widget"),

    kind:
      safeText(first(raw.kind, raw.type, raw.variant, raw.category), "widget"),

    variant:
      safeText(first(raw.variant, raw.type, raw.kind, raw.category), "widget"),

    value:
      first(
        raw.value,
        raw.total,
        raw.amount,
        raw.count,
        raw.metric,
        "—"
      ),

    trend:
      first(
        raw.trend,
        raw.delta,
        raw.change,
        raw.variation,
        ""
      ),

    status:
      safeText(first(raw.status, raw.estado, raw.state), "active"),

    route:
      safeText(first(raw.route, raw.href, raw.link, raw.to), ""),

    href:
      safeText(first(raw.href, raw.route, raw.link, raw.to), ""),

    updatedAt:
      first(
        raw.updatedAt,
        raw.lastUpdate,
        raw.modifiedAt,
        raw.createdAt
      ),

    raw:
      hasOwnKeys(raw.raw)
        ? raw.raw
        : raw,
  };
}

export function normalizeHomeWidgetsCollection(items = []) {
  return uniqueBy(
    safeArray(items)
      .map((item) =>
        normalizeHomeWidget(item)
      )
      .filter((item) =>
        Boolean(
          getHomeWidgetId(item) ||
            getHomeWidgetTitle(item)
        )
      ),
    (item) =>
      getHomeWidgetId(item) ||
      getHomeWidgetTitle(item)
  );
}

export function findHomeWidgetById(items = [], widgetId = "") {
  const target =
    safeText(widgetId, "");

  if (!target) {
    return null;
  }

  const targetKey =
    normalizeKey(target);

  return (
    safeArray(items).find((item) => {
      const aliases =
        [
          item.widgetId,
          item.widgetKey,
          item.id,
          item.key,
          item.slug,
          item.code,
          item.title,
          item.name,
          item.label,
        ]
          .map((value) =>
            normalizeKey(value)
          )
          .filter(Boolean);

      return aliases.includes(targetKey);
    }) || null
  );
}

/* =========================================================
   SUMMARY
========================================================= */

function buildHomeWidgetSummary(widgets = []) {
  const summary = {
    totalTickets:
      0,

    openTickets:
      0,

    urgentTickets:
      0,

    totalInvoices:
      0,

    pendingInvoices:
      0,

    invoiceAmount:
      0,

    usersCount:
      0,

    usuariosCount:
      0,

    clientsCount:
      0,

    clientesCount:
      0,

    customersCount:
      0,
  };

  for (const widget of safeArray(widgets)) {
    const corpus =
      getHomeWidgetCorpus(widget);

    const value =
      getHomeWidgetNumericValue(widget);

    if (value === null) {
      continue;
    }

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
      corpus.includes("facturacin") ||
      corpus.includes("cobro");

    const isUser =
      corpus.includes("usuario") ||
      corpus.includes("user") ||
      corpus.includes("member") ||
      corpus.includes("account");

    const isClient =
      corpus.includes("cliente") ||
      corpus.includes("client") ||
      corpus.includes("customer");

    if (isTicket) {
      if (
        corpus.includes("abierta") ||
        corpus.includes("abierto") ||
        corpus.includes("open") ||
        corpus.includes("pendiente") ||
        corpus.includes("pending") ||
        corpus.includes("proceso")
      ) {
        summary.openTickets =
          Math.max(summary.openTickets, value);
      } else {
        summary.totalTickets =
          Math.max(summary.totalTickets, value);
      }

      if (
        corpus.includes("urgente") ||
        corpus.includes("urgent") ||
        corpus.includes("critica") ||
        corpus.includes("critical") ||
        corpus.includes("alta")
      ) {
        summary.urgentTickets =
          Math.max(summary.urgentTickets, value);
      }
    }

    if (isInvoice) {
      if (
        corpus.includes("importe") ||
        corpus.includes("amount") ||
        corpus.includes("facturacion") ||
        corpus.includes("billing") ||
        corpus.includes("total_facturado") ||
        corpus.includes("facturacion_total") ||
        corpus.includes("visible")
      ) {
        summary.invoiceAmount =
          Math.max(summary.invoiceAmount, value);
      } else if (
        corpus.includes("pendiente") ||
        corpus.includes("pending") ||
        corpus.includes("vencida") ||
        corpus.includes("overdue")
      ) {
        summary.pendingInvoices =
          Math.max(summary.pendingInvoices, value);
      } else {
        summary.totalInvoices =
          Math.max(summary.totalInvoices, value);
      }
    }

    if (
      isUser &&
      !isClient
    ) {
      summary.usersCount =
        Math.max(summary.usersCount, value);

      summary.usuariosCount =
        Math.max(summary.usuariosCount, value);
    }

    if (isClient) {
      summary.clientsCount =
        Math.max(summary.clientsCount, value);

      summary.clientesCount =
        Math.max(summary.clientesCount, value);

      summary.customersCount =
        Math.max(summary.customersCount, value);
    }
  }

  return summary;
}

function buildHomeDerivedSummary({
  tickets = [],
  ticketsTotal = 0,
  invoices = [],
  invoicesTotal = 0,
  users = [],
  usersTotal = 0,
  clients = [],
  clientsTotal = 0,
} = {}) {
  const normalizedTickets =
    safeArray(tickets);

  const normalizedInvoices =
    safeArray(invoices);

  const openTickets =
    normalizedTickets
      .filter(isHomeTicketOpenLike)
      .length;

  const closedTickets =
    normalizedTickets
      .filter(isHomeTicketClosedLike)
      .length;

  const urgentTickets =
    normalizedTickets
      .filter(isHomeTicketUrgentLike)
      .length;

  const pendingInvoices =
    normalizedInvoices
      .filter(isHomeInvoicePendingLike)
      .length;

  const invoiceAmount =
    normalizedInvoices
      .reduce(
        (sum, item) =>
          sum + getHomeInvoiceAmount(item),
        0
      );

  const attachmentsCount =
    normalizedTickets
      .reduce(
        (sum, item) =>
          sum + getHomeTicketAttachmentsCount(item),
        0
      );

  const finalTicketsTotal =
    Math.max(
      normalizedTickets.length,
      safeNumber(ticketsTotal, normalizedTickets.length)
    );

  const finalInvoicesTotal =
    Math.max(
      normalizedInvoices.length,
      safeNumber(invoicesTotal, normalizedInvoices.length)
    );

  const finalUsersTotal =
    Math.max(
      safeArray(users).length,
      safeNumber(usersTotal, safeArray(users).length)
    );

  const finalClientsTotal =
    Math.max(
      safeArray(clients).length,
      safeNumber(clientsTotal, safeArray(clients).length)
    );

  const latestTicketUpdate =
    normalizedTickets
      .map((item) =>
        parseDateMs(
          getHomeTicketUpdatedAt(item) ||
            getHomeTicketCreatedAt(item)
        )
      )
      .filter(Boolean)
      .sort((a, b) => b - a)[0] || 0;

  return {
    totalTickets:
      finalTicketsTotal,

    ticketsTotal:
      finalTicketsTotal,

    incidenciasTotal:
      finalTicketsTotal,

    totalIncidencias:
      finalTicketsTotal,

    visibleTickets:
      normalizedTickets.length,

    visibleTicketsCount:
      normalizedTickets.length,

    visibleIncidenciasCount:
      normalizedTickets.length,

    openTickets,
    pendingTickets:
      openTickets,

    openIncidencias:
      openTickets,

    pendingIncidencias:
      openTickets,

    incidenciasAbiertas:
      openTickets,

    closedTickets,
    resolvedTickets:
      closedTickets,

    closedIncidencias:
      closedTickets,

    resolvedIncidencias:
      closedTickets,

    incidenciasCerradas:
      closedTickets,

    urgentTickets,
    urgentIncidencias:
      urgentTickets,

    highPriorityTickets:
      urgentTickets,

    totalInvoices:
      finalInvoicesTotal,

    invoicesTotal:
      finalInvoicesTotal,

    facturasTotal:
      finalInvoicesTotal,

    totalFacturas:
      finalInvoicesTotal,

    visibleInvoices:
      normalizedInvoices.length,

    visibleInvoicesCount:
      normalizedInvoices.length,

    visibleFacturasCount:
      normalizedInvoices.length,

    pendingInvoices,
    pendingFacturas:
      pendingInvoices,

    facturasPendientes:
      pendingInvoices,

    invoicesPending:
      pendingInvoices,

    invoiceAmount,
    billingTotal:
      invoiceAmount,

    totalBilling:
      invoiceAmount,

    totalFacturado:
      invoiceAmount,

    importeFacturas:
      invoiceAmount,

    facturacionVisible:
      invoiceAmount,

    usersCount:
      finalUsersTotal,

    usuariosCount:
      finalUsersTotal,

    totalUsers:
      finalUsersTotal,

    totalUsuarios:
      finalUsersTotal,

    visibleUsersCount:
      safeArray(users).length,

    visibleUsuariosCount:
      safeArray(users).length,

    clientsCount:
      finalClientsTotal,

    clientesCount:
      finalClientsTotal,

    customersCount:
      finalClientsTotal,

    totalClients:
      finalClientsTotal,

    totalClientes:
      finalClientsTotal,

    totalCustomers:
      finalClientsTotal,

    visibleClientsCount:
      safeArray(clients).length,

    visibleClientesCount:
      safeArray(clients).length,

    visibleCustomersCount:
      safeArray(clients).length,

    attachmentsCount,
    filesCount:
      attachmentsCount,

    adjuntosCount:
      attachmentsCount,

    lastTicketUpdate:
      latestTicketUpdate
        ? new Date(latestTicketUpdate).toISOString()
        : null,
  };
}

export function normalizeHomeSummary(rawSummary = {}, widgetSummary = {}, derivedSummary = {}) {
  const raw =
    safeObject(rawSummary);

  const widget =
    safeObject(widgetSummary);

  const derived =
    safeObject(derivedSummary);

  const sources = [
    raw,
    widget,
    derived,
  ];

  const totalTickets =
    pickMaxFromSources(
      [
        "totalTickets",
        "ticketsTotal",
        "incidenciasTotal",
        "totalIncidencias",
        "ticketsCount",
        "incidenciasCount",
      ],
      sources,
      0
    );

  const openTickets =
    pickMaxFromSources(
      [
        "openTickets",
        "pendingTickets",
        "openIncidencias",
        "pendingIncidencias",
        "incidenciasAbiertas",
        "ticketsOpen",
      ],
      sources,
      0
    );

  const closedTickets =
    pickMaxFromSources(
      [
        "closedTickets",
        "resolvedTickets",
        "closedIncidencias",
        "resolvedIncidencias",
        "incidenciasCerradas",
      ],
      sources,
      0
    );

  const urgentTickets =
    pickMaxFromSources(
      [
        "urgentTickets",
        "urgentIncidencias",
        "highPriorityTickets",
        "incidenciasUrgentes",
      ],
      sources,
      0
    );

  const totalInvoices =
    pickMaxFromSources(
      [
        "totalInvoices",
        "invoicesTotal",
        "facturasTotal",
        "totalFacturas",
        "invoicesCount",
        "facturasCount",
      ],
      sources,
      0
    );

  const pendingInvoices =
    pickMaxFromSources(
      [
        "pendingInvoices",
        "pendingFacturas",
        "facturasPendientes",
        "invoicesPending",
        "facturasVencidas",
        "overdueInvoices",
      ],
      sources,
      0
    );

  const invoiceAmount =
    pickMaxFromSources(
      [
        "invoiceAmount",
        "billingTotal",
        "totalBilling",
        "totalFacturado",
        "importeFacturas",
        "facturacionVisible",
        "facturacionTotal",
        "facturasImporteTotal",
      ],
      sources,
      0
    );

  const usersCount =
    pickMaxFromSources(
      [
        "usersCount",
        "usuariosCount",
        "totalUsers",
        "totalUsuarios",
        "activeUsers",
        "usuariosActivos",
      ],
      sources,
      0
    );

  const clientsCount =
    pickMaxFromSources(
      [
        "clientsCount",
        "clientesCount",
        "customersCount",
        "totalClients",
        "totalClientes",
        "totalCustomers",
        "activeClients",
        "clientesActivos",
      ],
      sources,
      0
    );

  const attachmentsCount =
    pickMaxFromSources(
      [
        "attachmentsCount",
        "filesCount",
        "adjuntosCount",
      ],
      sources,
      0
    );

  const lastTicketUpdate =
    pickFirstFromSources(
      [
        "lastTicketUpdate",
        "lastIncidenciaUpdate",
        "lastUpdate",
        "updatedAt",
      ],
      sources,
      null
    );

  const visibleTicketsCount =
    pickMaxFromSources(
      [
        "visibleTickets",
        "visibleTicketsCount",
        "visibleIncidenciasCount",
      ],
      sources,
      0
    );

  const visibleInvoicesCount =
    pickMaxFromSources(
      [
        "visibleInvoices",
        "visibleInvoicesCount",
        "visibleFacturasCount",
      ],
      sources,
      0
    );

  const visibleUsersCount =
    pickMaxFromSources(
      [
        "visibleUsersCount",
        "visibleUsuariosCount",
      ],
      sources,
      0
    );

  const visibleClientsCount =
    pickMaxFromSources(
      [
        "visibleClientsCount",
        "visibleClientesCount",
        "visibleCustomersCount",
      ],
      sources,
      0
    );

  return {
    ...derived,
    ...widget,
    ...raw,

    totalTickets,
    ticketsTotal:
      totalTickets,

    incidenciasTotal:
      totalTickets,

    totalIncidencias:
      totalTickets,

    ticketsCount:
      totalTickets,

    incidenciasCount:
      totalTickets,

    openTickets,
    pendingTickets:
      openTickets,

    openIncidencias:
      openTickets,

    pendingIncidencias:
      openTickets,

    incidenciasAbiertas:
      openTickets,

    closedTickets,
    resolvedTickets:
      closedTickets,

    closedIncidencias:
      closedTickets,

    resolvedIncidencias:
      closedTickets,

    incidenciasCerradas:
      closedTickets,

    urgentTickets,
    urgentIncidencias:
      urgentTickets,

    highPriorityTickets:
      urgentTickets,

    totalInvoices,
    invoicesTotal:
      totalInvoices,

    facturasTotal:
      totalInvoices,

    totalFacturas:
      totalInvoices,

    invoicesCount:
      totalInvoices,

    facturasCount:
      totalInvoices,

    pendingInvoices,
    pendingFacturas:
      pendingInvoices,

    facturasPendientes:
      pendingInvoices,

    invoicesPending:
      pendingInvoices,

    invoiceAmount,
    billingTotal:
      invoiceAmount,

    totalBilling:
      invoiceAmount,

    totalFacturado:
      invoiceAmount,

    importeFacturas:
      invoiceAmount,

    facturacionVisible:
      invoiceAmount,

    facturacionTotal:
      invoiceAmount,

    usersCount,
    usuariosCount:
      usersCount,

    totalUsers:
      usersCount,

    totalUsuarios:
      usersCount,

    activeUsers:
      Math.max(
        usersCount,
        safeNumber(first(raw.activeUsers, raw.usuariosActivos, 0), 0)
      ),

    usuariosActivos:
      Math.max(
        usersCount,
        safeNumber(first(raw.activeUsers, raw.usuariosActivos, 0), 0)
      ),

    clientsCount,
    clientesCount:
      clientsCount,

    customersCount:
      clientsCount,

    totalClients:
      clientsCount,

    totalClientes:
      clientsCount,

    totalCustomers:
      clientsCount,

    activeClients:
      Math.max(
        clientsCount,
        safeNumber(first(raw.activeClients, raw.clientesActivos, 0), 0)
      ),

    clientesActivos:
      Math.max(
        clientsCount,
        safeNumber(first(raw.activeClients, raw.clientesActivos, 0), 0)
      ),

    attachmentsCount,
    filesCount:
      attachmentsCount,

    adjuntosCount:
      attachmentsCount,

    visibleTicketsCount,
    visibleIncidenciasCount:
      visibleTicketsCount,

    visibleInvoicesCount,
    visibleFacturasCount:
      visibleInvoicesCount,

    visibleUsersCount,
    visibleUsuariosCount:
      visibleUsersCount,

    visibleClientsCount,
    visibleClientesCount:
      visibleClientsCount,

    visibleCustomersCount:
      visibleClientsCount,

    lastTicketUpdate,
  };
}

/* =========================================================
   DASHBOARD NORMALIZATION
========================================================= */

function getRawSummaryBlock(dashboard = {}) {
  const raw =
    safeObject(dashboard);

  const summary =
    safeObject(
      first(
        raw.summary,
        raw.stats,
        raw.metrics,
        raw.totals,
        raw.counts,

        raw.dashboard?.summary,
        raw.data?.summary,
        raw.payload?.summary,
        raw.result?.summary,

        {}
      )
    );

  if (hasOwnKeys(summary)) {
    return summary;
  }

  if (
    "totalTickets" in raw ||
    "ticketsTotal" in raw ||
    "incidenciasTotal" in raw ||
    "openTickets" in raw ||
    "pendingTickets" in raw ||
    "totalInvoices" in raw ||
    "invoicesTotal" in raw ||
    "facturasTotal" in raw ||
    "pendingInvoices" in raw ||
    "invoiceAmount" in raw ||
    "billingTotal" in raw ||
    "usersCount" in raw ||
    "usuariosCount" in raw ||
    "clientsCount" in raw ||
    "clientesCount" in raw
  ) {
    return raw;
  }

  return {};
}

function getWidgetsBlock(dashboard = {}, previous = {}) {
  const raw =
    safeObject(dashboard);

  const prev =
    safeObject(previous);

  const primary =
    safeArray(
      first(
        raw.widgets,
        raw.cards,
        raw.kpis,
        raw.blocks,
        raw.widgetList,
        raw.dashboard?.widgets,
        raw.collections?.widgets,
        raw.resources?.widgets,
        []
      )
    );

  const fallback =
    safeArray(
      first(
        prev.widgets,
        prev.cards,
        prev.kpis,
        prev.blocks,
        []
      )
    );

  return normalizeHomeWidgetsCollection(
    primary.length
      ? primary
      : fallback
  );
}

function getDashboardCollections(dashboard = {}, previous = {}) {
  const raw =
    safeObject(dashboard);

  const prev =
    safeObject(previous);

  const ticketsBlock =
    mergeCollectionBlocks(
      pickCollectionBlock(raw, [
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
        "items",
        "rows",
      ]),
      pickCollectionBlock(prev, [
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
        "items",
        "rows",
      ])
    );

  const invoicesBlock =
    mergeCollectionBlocks(
      pickCollectionBlock(raw, [
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
      ]),
      pickCollectionBlock(prev, [
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
      ])
    );

  const usersBlock =
    mergeCollectionBlocks(
      pickCollectionBlock(raw, [
        "users",
        "usuarios",
        "members",
        "accounts",
        "userItems",
        "usuarioItems",
        "recentUsers",
        "recentUsuarios",
      ]),
      pickCollectionBlock(prev, [
        "users",
        "usuarios",
        "members",
        "accounts",
        "userItems",
        "usuarioItems",
        "recentUsers",
        "recentUsuarios",
      ])
    );

  const clientsBlock =
    mergeCollectionBlocks(
      pickCollectionBlock(raw, [
        "clients",
        "clientes",
        "customers",
        "accountsClients",
        "clientItems",
        "clienteItems",
        "customerItems",
        "recentClients",
        "recentClientes",
        "recentCustomers",
      ]),
      pickCollectionBlock(prev, [
        "clients",
        "clientes",
        "customers",
        "accountsClients",
        "clientItems",
        "clienteItems",
        "customerItems",
        "recentClients",
        "recentClientes",
        "recentCustomers",
      ])
    );

  const activityBlock =
    mergeCollectionBlocks(
      pickCollectionBlock(raw, [
        "activity",
        "activities",
        "recentActivity",
        "recent",
        "timeline",
        "logs",
        "events",
      ]),
      pickCollectionBlock(prev, [
        "activity",
        "activities",
        "recentActivity",
        "recent",
        "timeline",
        "logs",
        "events",
      ])
    );

  const tickets =
    normalizeHomeTicketsCollection(
      ticketsBlock.items
    );

  const invoices =
    normalizeHomeInvoicesCollection(
      invoicesBlock.items
    );

  const users =
    normalizeHomeUsersCollection(
      usersBlock.items
    );

  const clients =
    normalizeHomeClientsCollection(
      clientsBlock.items
    );

  const activity =
    normalizeHomeActivityCollection(
      activityBlock.items
    );

  return {
    tickets,
    incidencias:
      tickets,

    ticketsTotal:
      Math.max(
        tickets.length,
        ticketsBlock.total
      ),

    invoices,
    facturas:
      invoices,

    invoicesTotal:
      Math.max(
        invoices.length,
        invoicesBlock.total
      ),

    users,
    usuarios:
      users,

    usersTotal:
      Math.max(
        users.length,
        usersBlock.total
      ),

    clients,
    clientes:
      clients,

    customers:
      clients,

    clientsTotal:
      Math.max(
        clients.length,
        clientsBlock.total
      ),

    activity,
    activities:
      activity,

    recent:
      activity,

    recentActivity:
      activity,

    activityTotal:
      Math.max(
        activity.length,
        activityBlock.total
      ),
  };
}

export function normalizeHomeDashboard(payload = null, previousDashboard = {}) {
  const picked =
    pickDashboard(payload);

  const previous =
    safeObject(previousDashboard);

  const raw =
    {
      ...previous,
      ...safeObject(picked),
    };

  const collections =
    getDashboardCollections(
      picked,
      previous
    );

  const widgets =
    getWidgetsBlock(
      picked,
      previous
    );

  const rawSummary =
    {
      ...getRawSummaryBlock(previous),
      ...getRawSummaryBlock(picked),
    };

  const widgetSummary =
    buildHomeWidgetSummary(widgets);

  const derivedSummary =
    buildHomeDerivedSummary({
      tickets:
        collections.tickets,

      ticketsTotal:
        first(
          rawSummary.totalTickets,
          rawSummary.ticketsTotal,
          rawSummary.incidenciasTotal,
          rawSummary.totalIncidencias,
          widgetSummary.totalTickets,
          collections.ticketsTotal
        ),

      invoices:
        collections.invoices,

      invoicesTotal:
        first(
          rawSummary.totalInvoices,
          rawSummary.invoicesTotal,
          rawSummary.facturasTotal,
          rawSummary.totalFacturas,
          widgetSummary.totalInvoices,
          collections.invoicesTotal
        ),

      users:
        collections.users,

      usersTotal:
        first(
          rawSummary.usersCount,
          rawSummary.usuariosCount,
          rawSummary.totalUsers,
          rawSummary.totalUsuarios,
          widgetSummary.usersCount,
          widgetSummary.usuariosCount,
          collections.usersTotal
        ),

      clients:
        collections.clients,

      clientsTotal:
        first(
          rawSummary.clientsCount,
          rawSummary.clientesCount,
          rawSummary.customersCount,
          rawSummary.totalClients,
          rawSummary.totalClientes,
          widgetSummary.clientsCount,
          widgetSummary.clientesCount,
          widgetSummary.customersCount,
          collections.clientsTotal
        ),
    });

  const summary =
    normalizeHomeSummary(
      rawSummary,
      widgetSummary,
      derivedSummary
    );

  const activity =
    collections.activity.length
      ? collections.activity
      : buildHomeActivityFromCollections({
          tickets:
            collections.tickets,
          invoices:
            collections.invoices,
          users:
            collections.users,
          clients:
            collections.clients,
        });

  const updatedAt =
    first(
      raw.updatedAt,
      raw.lastUpdate,
      raw.generatedAt,
      raw.createdAt,
      summary.updatedAt,
      summary.lastUpdate,
      previous.updatedAt,
      previous.generatedAt,
      nowIso()
    );

  return {
    ...raw,

    version:
      HOME_MODEL_VERSION,

    ok:
      raw.ok !== false,

    summary,
    stats:
      summary,

    metrics:
      summary,

    totals:
      summary,

    counts:
      summary,

    widgets,
    cards:
      widgets,

    kpis:
      widgets,

    blocks:
      widgets,

    tickets:
      collections.tickets,

    incidencias:
      collections.incidencias,

    ticketsTotal:
      summary.totalTickets,

    incidenciasTotal:
      summary.totalTickets,

    totalTickets:
      summary.totalTickets,

    totalIncidencias:
      summary.totalTickets,

    ticketsCount:
      summary.totalTickets,

    incidenciasCount:
      summary.totalTickets,

    visibleTicketsCount:
      collections.tickets.length,

    visibleIncidenciasCount:
      collections.tickets.length,

    invoices:
      collections.invoices,

    facturas:
      collections.facturas,

    invoicesTotal:
      summary.totalInvoices,

    facturasTotal:
      summary.totalInvoices,

    totalInvoices:
      summary.totalInvoices,

    totalFacturas:
      summary.totalInvoices,

    invoicesCount:
      summary.totalInvoices,

    facturasCount:
      summary.totalInvoices,

    visibleInvoicesCount:
      collections.invoices.length,

    visibleFacturasCount:
      collections.invoices.length,

    users:
      collections.users,

    usuarios:
      collections.usuarios,

    usersTotal:
      summary.usersCount,

    usuariosTotal:
      summary.usuariosCount,

    totalUsers:
      summary.usersCount,

    totalUsuarios:
      summary.usuariosCount,

    usersCount:
      summary.usersCount,

    usuariosCount:
      summary.usuariosCount,

    visibleUsersCount:
      collections.users.length,

    visibleUsuariosCount:
      collections.users.length,

    clients:
      collections.clients,

    clientes:
      collections.clientes,

    customers:
      collections.customers,

    clientsTotal:
      summary.clientsCount,

    clientesTotal:
      summary.clientesCount,

    customersTotal:
      summary.customersCount,

    totalClients:
      summary.clientsCount,

    totalClientes:
      summary.clientesCount,

    totalCustomers:
      summary.customersCount,

    clientsCount:
      summary.clientsCount,

    clientesCount:
      summary.clientesCount,

    customersCount:
      summary.customersCount,

    visibleClientsCount:
      collections.clients.length,

    visibleClientesCount:
      collections.clients.length,

    visibleCustomersCount:
      collections.clients.length,

    activity,
    activities:
      activity,

    recent:
      activity,

    recentActivity:
      activity,

    activityCount:
      activity.length,

    recentCount:
      activity.length,

    visibleActivityCount:
      activity.length,

    updatedAt:
      updatedAt,

    generatedAt:
      first(raw.generatedAt, updatedAt),

    meta: {
      ...safeObject(raw.meta),

      updatedAt,
      generatedAt:
        first(raw.generatedAt, updatedAt),

      widgetsCount:
        widgets.length,

      ticketsCount:
        summary.totalTickets,

      incidenciasCount:
        summary.totalTickets,

      visibleTicketsCount:
        collections.tickets.length,

      visibleIncidenciasCount:
        collections.tickets.length,

      invoicesCount:
        summary.totalInvoices,

      facturasCount:
        summary.totalInvoices,

      visibleInvoicesCount:
        collections.invoices.length,

      visibleFacturasCount:
        collections.invoices.length,

      usersCount:
        summary.usersCount,

      usuariosCount:
        summary.usuariosCount,

      visibleUsersCount:
        collections.users.length,

      visibleUsuariosCount:
        collections.users.length,

      clientsCount:
        summary.clientsCount,

      clientesCount:
        summary.clientesCount,

      customersCount:
        summary.customersCount,

      visibleClientsCount:
        collections.clients.length,

      visibleClientesCount:
        collections.clients.length,

      visibleCustomersCount:
        collections.clients.length,

      activityCount:
        activity.length,

      recentCount:
        activity.length,

      visibleActivityCount:
        activity.length,
    },

    raw:
      payload,
  };
}

/* =========================================================
   PAGINATION
========================================================= */

export function paginateHomeItems(items = [], page = 1, pageSize = HOME_DEFAULT_PAGE_SIZE) {
  const rows =
    safeArray(items);

  const size =
    Math.max(
      1,
      safeNumber(pageSize, HOME_DEFAULT_PAGE_SIZE)
    );

  const total =
    rows.length;

  const totalPages =
    Math.max(
      1,
      Math.ceil((total || 1) / size)
    );

  const currentPage =
    Math.min(
      Math.max(
        1,
        safeNumber(page, 1)
      ),
      totalPages
    );

  const start =
    (currentPage - 1) * size;

  const pageItems =
    rows.slice(
      start,
      start + size
    );

  return {
    items:
      pageItems,

    pageItems,

    rows:
      pageItems,

    data:
      pageItems,

    page:
      currentPage,

    currentPage,

    pageSize:
      size,

    limit:
      size,

    total,
    totalCount:
      total,

    totalPages,

    hasPrev:
      currentPage > 1,

    hasNext:
      currentPage < totalPages,

    prevPage:
      currentPage > 1
        ? currentPage - 1
        : null,

    nextPage:
      currentPage < totalPages
        ? currentPage + 1
        : null,

    start,
    end:
      start + pageItems.length,
  };
}

export function paginateHomeTickets(tickets = [], page = 1, pageSize = HOME_DEFAULT_PAGE_SIZE) {
  return paginateHomeItems(
    sortHomeTicketsByUpdatedDesc(tickets),
    page,
    pageSize
  );
}

/* =========================================================
   ROLE / FORMAT HELPERS
========================================================= */

export function normalizeHomeRole(role = "user") {
  return normalizeKey(role || "user") || "user";
}

export function isHomeAdminRole(role = "") {
  const key =
    normalizeHomeRole(role);

  return [
    "admin",
    "administrator",
    "administrador",
    "superadmin",
    "super_admin",
    "super_administrador",
    "owner",
    "root",
    "staff",
    "support",
    "soporte",
    "tecnico",
    "técnico",
  ].includes(key);
}

export function formatHomeMoney(value = 0, currency = "EUR") {
  const amount =
    Number(value);

  if (!Number.isFinite(amount)) {
    return "—";
  }

  const code =
    safeText(currency, "EUR").toUpperCase();

  try {
    return new Intl.NumberFormat(
      "es-ES",
      {
        style:
          "currency",

        currency:
          code,

        maximumFractionDigits:
          2,
      }
    ).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

/* =========================================================
   VIEW MODEL BUILDER
========================================================= */

export function buildHomeViewModel({
  dashboard = EMPTY_DASHBOARD,
  previousDashboard = EMPTY_DASHBOARD,
  user = null,
  role = "user",
  state = {},
  page = 1,
  pageSize = HOME_DEFAULT_PAGE_SIZE,
} = {}) {
  const normalizedDashboard =
    normalizeHomeDashboard(
      dashboard,
      previousDashboard
    );

  const tickets =
    sortHomeTicketsByUpdatedDesc(
      normalizedDashboard.tickets
    );

  const pagination =
    paginateHomeTickets(
      tickets,
      page,
      pageSize
    );

  const ticketsInput =
    buildHomeCollectionEnvelope(
      tickets,
      normalizedDashboard.summary.totalTickets
    );

  const invoicesInput =
    buildHomeCollectionEnvelope(
      normalizedDashboard.invoices,
      normalizedDashboard.summary.totalInvoices
    );

  const usersInput =
    buildHomeCollectionEnvelope(
      normalizedDashboard.users,
      normalizedDashboard.summary.usersCount
    );

  const clientsInput =
    buildHomeCollectionEnvelope(
      normalizedDashboard.clients,
      normalizedDashboard.summary.clientsCount
    );

  const activityInput =
    buildHomeCollectionEnvelope(
      normalizedDashboard.activity,
      normalizedDashboard.activity.length
    );

  const finalRole =
    normalizeHomeRole(role);

  const isAdmin =
    isHomeAdminRole(finalRole);

  return {
    version:
      HOME_MODEL_VERSION,

    user,
    role:
      finalRole,

    isAdmin,

    dashboard:
      normalizedDashboard,

    summary:
      normalizedDashboard.summary,

    stats:
      normalizedDashboard.summary,

    metrics:
      normalizedDashboard.summary,

    totals:
      normalizedDashboard.summary,

    counts:
      normalizedDashboard.summary,

    widgets:
      normalizedDashboard.widgets,

    cards:
      normalizedDashboard.widgets,

    kpis:
      normalizedDashboard.widgets,

    tickets:
      ticketsInput,

    incidencias:
      ticketsInput,

    facturas:
      invoicesInput,

    invoices:
      invoicesInput,

    users:
      usersInput,

    usuarios:
      usersInput,

    clients:
      clientsInput,

    clientes:
      clientsInput,

    customers:
      clientsInput,

    activity:
      activityInput,

    activities:
      activityInput,

    recent:
      activityInput,

    recentActivity:
      activityInput,

    items:
      tickets,

    page:
      pagination.page,

    pageSize:
      pagination.pageSize,

    totalPages:
      pagination.totalPages,

    pagination,

    totalCount:
      normalizedDashboard.summary.totalTickets,

    remoteCount:
      normalizedDashboard.summary.totalTickets,

    visibleCount:
      tickets.length,

    requestId:
      safeText(
        first(
          state.requestId,
          normalizedDashboard.requestId,
          normalizedDashboard.meta?.requestId,
          ""
        ),
        ""
      ),

    lastUpdatedAt:
      first(
        state.lastSyncAt,
        normalizedDashboard.updatedAt,
        normalizedDashboard.generatedAt,
        null
      ),

    state: {
      ...safeObject(state),

      user,
      role:
        finalRole,

      isAdmin,

      dashboard:
        normalizedDashboard,

      summary:
        normalizedDashboard.summary,

      stats:
        normalizedDashboard.summary,

      metrics:
        normalizedDashboard.summary,

      totals:
        normalizedDashboard.summary,

      counts:
        normalizedDashboard.summary,

      widgets:
        normalizedDashboard.widgets,

      items:
        tickets,

      tickets:
        ticketsInput,

      incidencias:
        ticketsInput,

      facturas:
        invoicesInput,

      invoices:
        invoicesInput,

      users:
        usersInput,

      usuarios:
        usersInput,

      clients:
        clientsInput,

      clientes:
        clientsInput,

      customers:
        clientsInput,

      activity:
        activityInput,

      recentActivity:
        activityInput,

      recent:
        activityInput,

      page:
        pagination.page,

      pageSize:
        pagination.pageSize,

      totalPages:
        pagination.totalPages,

      pagination,

      totalCount:
        normalizedDashboard.summary.totalTickets,

      remoteCount:
        normalizedDashboard.summary.totalTickets,

      visibleCount:
        tickets.length,
    },
  };
}

/* =========================================================
   DEBUG SNAPSHOT
========================================================= */

export function getHomeModelSnapshot(dashboard = {}) {
  const normalized =
    normalizeHomeDashboard(dashboard);

  return {
    version:
      HOME_MODEL_VERSION,

    hasDashboard:
      hasOwnKeys(normalized),

    counts: {
      widgets:
        normalized.widgets.length,

      tickets:
        normalized.tickets.length,

      invoices:
        normalized.invoices.length,

      users:
        normalized.users.length,

      clients:
        normalized.clients.length,

      activity:
        normalized.activity.length,
    },

    totals: {
      tickets:
        normalized.summary.totalTickets,

      invoices:
        normalized.summary.totalInvoices,

      users:
        normalized.summary.usersCount,

      clients:
        normalized.summary.clientsCount,

      pendingInvoices:
        normalized.summary.pendingInvoices,

      invoiceAmount:
        normalized.summary.invoiceAmount,
    },

    updatedAt:
      normalized.updatedAt || null,
  };
}

/* =========================================================
   PUBLIC API
========================================================= */

export const HomeModel =
  Object.freeze({
    version:
      HOME_MODEL_VERSION,

    routes:
      HOME_ROUTES,

    pageSize:
      HOME_DEFAULT_PAGE_SIZE,

    normalizeDashboard:
      normalizeHomeDashboard,

    normalizeSummary:
      normalizeHomeSummary,

    buildViewModel:
      buildHomeViewModel,

    buildCollectionEnvelope:
      buildHomeCollectionEnvelope,

    paginateItems:
      paginateHomeItems,

    paginateTickets:
      paginateHomeTickets,

    normalizeTicket:
      normalizeHomeTicket,

    normalizeTickets:
      normalizeHomeTicketsCollection,

    sortTicketsByUpdatedDesc:
      sortHomeTicketsByUpdatedDesc,

    findTicketById:
      findHomeTicketById,

    getTicketId:
      getHomeTicketId,

    getTicketAliases:
      getHomeTicketAliases,

    getTicketStatusKey:
      getHomeTicketStatusKey,

    getTicketStatusLabel:
      getHomeTicketStatusLabel,

    getTicketPriorityKey:
      getHomeTicketPriorityKey,

    getTicketPriorityLabel:
      getHomeTicketPriorityLabel,

    normalizeInvoice:
      normalizeHomeInvoice,

    normalizeInvoices:
      normalizeHomeInvoicesCollection,

    getInvoiceId:
      getHomeInvoiceId,

    getInvoiceAmount:
      getHomeInvoiceAmount,

    getInvoiceCurrency:
      getHomeInvoiceCurrency,

    getInvoiceStatusKey:
      getHomeInvoiceStatusKey,

    normalizeUser:
      normalizeHomeUser,

    normalizeUsers:
      normalizeHomeUsersCollection,

    getUserId:
      getHomeUserId,

    normalizeClient:
      normalizeHomeClient,

    normalizeClients:
      normalizeHomeClientsCollection,

    getClientId:
      getHomeClientId,

    normalizeActivity:
      normalizeHomeActivityItem,

    normalizeActivityCollection:
      normalizeHomeActivityCollection,

    buildActivityFromCollections:
      buildHomeActivityFromCollections,

    normalizeWidget:
      normalizeHomeWidget,

    normalizeWidgets:
      normalizeHomeWidgetsCollection,

    findWidgetById:
      findHomeWidgetById,

    getWidgetId:
      getHomeWidgetId,

    getWidgetTitle:
      getHomeWidgetTitle,

    normalizeRole:
      normalizeHomeRole,

    isAdminRole:
      isHomeAdminRole,

    formatMoney:
      formatHomeMoney,

    getSnapshot:
      getHomeModelSnapshot,
  });

export default HomeModel;
