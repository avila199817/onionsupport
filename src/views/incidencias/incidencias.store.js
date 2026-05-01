/* =========================================================
   Onion SPA - Incidencias Store
   Archivo: src/views/incidencias/incidencias.store.js

   EXTREME PRO SYSTEM · STORE LAYER · 12/10
   PATCH · MODEL NORMALIZED STORE
   PATCH · RICH DETAIL PRESERVATION
   PATCH · FACTURAS / BILLING / LINKED INVOICES SAFE
   PATCH · ALIAS INDEX DEDUPE ENGINE
   PATCH · DETAIL CACHE BY ID

   RESPONSABILIDADES:
   - encapsular Store global
   - leer / escribir colección incidencias
   - helpers para API / View / Actions / Modal
   - búsquedas robustas por id / ticketId / incidenciaId / code / ticketCode
   - replace / append / update / upsert / remove
   - deduplicación segura por aliases de identidad
   - persistencia estable para detalle modal
   - conservar payload rico: factura / facturas / linkedInvoices / billing
   - conservar adjuntos normalizados con URLs SAS cuando existan
   - ordenar de forma consistente por actividad real
   - compatibilidad con Store.set / Store.get / Store.actions.setCollection

   HARDENING PRO:
   - no muta colecciones originales
   - merge seguro preservando raw/meta/nested objects
   - lectura tolerante a distintas formas de Store
   - escritura multi-path defensiva
   - cache byId defensiva para detalle modal
   - upsert sin duplicados aunque cambie id/code/ticketId
   - búsquedas case-insensitive sin romper ids originales
   - normalización conectada con incidencias.model.js
========================================================= */

import { Store } from "../../store/index.js";

import {
  normalizeIncidenciaModel,
} from "./incidencias.model.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const STORE_PATH = "entities.incidencias";
export const STORE_COLLECTION_KEY = "incidencias";

export const STORE_BY_ID_PATH = "entities.incidenciasById";
export const STORE_DETAIL_PATH = "entities.incidenciasDetail";
export const STORE_META_PATH = "entities.incidenciasMeta";

const READ_PATHS = [
  STORE_PATH,
  STORE_COLLECTION_KEY,
  `collections.${STORE_COLLECTION_KEY}`,
  "entities.tickets",
  "tickets",
  "collections.tickets",
];

const DETAIL_READ_PATHS = [
  STORE_BY_ID_PATH,
  STORE_DETAIL_PATH,
  "incidenciasById",
  "incidenciasDetail",
  "entities.ticketsById",
  "ticketsById",
];

/* =========================================================
   SAFE CORE
========================================================= */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "string") {
    let normalized = value
      .trim()
      .replace(/€/g, "")
      .replace(/%/g, "")
      .replace(/\s+/g, "");

    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else if (hasComma) {
      normalized = normalized.replace(",", ".");
    }

    const num = Number(normalized);
    return Number.isFinite(num) ? num : fallback;
  }

  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
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

function normalizeIdForCompare(value = "") {
  return safeLower(value, "");
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cloneObject(value = {}) {
  return {
    ...safeObject(value),
  };
}

function cloneArray(items = []) {
  return safeArray(items).map((item) => cloneObject(item));
}

/* =========================================================
   PATH HELPERS
========================================================= */

function getByPath(source = {}, path = "") {
  const cleanPath = safeText(path, "");
  if (!cleanPath) return undefined;

  return cleanPath.split(".").reduce((acc, key) => {
    if (!acc || typeof acc !== "object") return undefined;
    return acc[key];
  }, source);
}

function setByPath(source = {}, path = "", value = null) {
  const cleanPath = safeText(path, "");
  if (!cleanPath || !source || typeof source !== "object") return false;

  const parts = cleanPath.split(".").filter(Boolean);
  if (!parts.length) return false;

  let cursor = source;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];

    if (!cursor[key] || typeof cursor[key] !== "object") {
      cursor[key] = {};
    }

    cursor = cursor[key];
  }

  cursor[parts[parts.length - 1]] = value;

  return true;
}

/* =========================================================
   TIMESTAMP HELPERS
========================================================= */

function parseSpanishDate(value = "") {
  const text = safeText(value, "");
  if (!text) return 0;

  const match = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (!match) return 0;

  const [, dd, mm, yyyy, hh = "0", min = "0", ss = "0"] = match;

  const date = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
    Number(ss)
  );

  const ts = date.getTime();

  return Number.isFinite(ts) ? ts : 0;
}

function safeTimestamp(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const numeric = Number(value);

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 9999999999 ? numeric : numeric * 1000;
  }

  const nativeDate = new Date(value);
  const nativeTs = nativeDate.getTime();

  if (Number.isFinite(nativeTs) && nativeTs > 0) {
    return nativeTs;
  }

  const esTs = parseSpanishDate(value);

  if (Number.isFinite(esTs) && esTs > 0) {
    return esTs;
  }

  return fallback;
}

function getUpdatedTimestamp(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return safeTimestamp(
    first(
      row.updatedAtMs,
      row.updatedAtTs,
      row.meta?.updatedAtMs,
      row.meta?.timestampMs,
      row.lastActivityAt,
      row.lastActivityAtES,
      row.updatedAt,
      row.updatedAtES,
      row.closedAt,
      row.closedAtES,
      row.modifiedAt,
      row.lastUpdate,
      row.createdAt,
      row.createdAtES,
      row._ts,

      raw.updatedAtMs,
      raw.updatedAtTs,
      raw.meta?.updatedAtMs,
      raw.meta?.timestampMs,
      raw.lastActivityAt,
      raw.lastActivityAtES,
      raw.updatedAt,
      raw.updatedAtES,
      raw.closedAt,
      raw.closedAtES,
      raw.modifiedAt,
      raw.lastUpdate,
      raw.createdAt,
      raw.createdAtES,
      raw._ts,

      0
    ),
    0
  );
}

function getCreatedTimestamp(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return safeTimestamp(
    first(
      row.createdAtMs,
      row.createdAtTs,
      row.createdAt,
      row.createdAtES,
      row.date,
      row._ts,

      raw.createdAtMs,
      raw.createdAtTs,
      raw.createdAt,
      raw.createdAtES,
      raw.date,
      raw._ts,

      0
    ),
    0
  );
}

/* =========================================================
   ID HELPERS
========================================================= */

export function getItemId(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return safeText(
    first(
      row.ticketId,
      row.incidenciaId,
      row.id,
      row.code,
      row.ticketCode,
      row._id,

      row.ticket?.ticketId,
      row.ticket?.id,

      row.item?.ticketId,
      row.item?.id,

      row.data?.ticketId,
      row.data?.id,

      raw.ticketId,
      raw.incidenciaId,
      raw.id,
      raw.code,
      raw.ticketCode,
      raw._id
    ),
    ""
  );
}

export function getItemCandidateIds(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return uniqueStrings([
    row.ticketId,
    row.incidenciaId,
    row.id,
    row.code,
    row.ticketCode,
    row._id,

    row.ticket?.ticketId,
    row.ticket?.incidenciaId,
    row.ticket?.id,
    row.ticket?.code,
    row.ticket?.ticketCode,

    row.item?.ticketId,
    row.item?.incidenciaId,
    row.item?.id,
    row.item?.code,
    row.item?.ticketCode,

    row.data?.ticketId,
    row.data?.incidenciaId,
    row.data?.id,
    row.data?.code,
    row.data?.ticketCode,

    row.detail?.ticketId,
    row.detail?.id,

    row.incidencia?.ticketId,
    row.incidencia?.id,

    raw.ticketId,
    raw.incidenciaId,
    raw.id,
    raw.code,
    raw.ticketCode,
    raw._id,
  ]);
}

function hasCandidateId(item = {}, id = "") {
  const target = normalizeIdForCompare(id);
  if (!target) return false;

  return getItemCandidateIds(item).some(
    (candidate) => normalizeIdForCompare(candidate) === target
  );
}

function isSameItemId(item = {}, id = "") {
  return hasCandidateId(item, id);
}

function findExistingKeyForItem(aliasIndex = new Map(), item = {}) {
  const candidates = getItemCandidateIds(item);

  for (const candidate of candidates) {
    const normalized = normalizeIdForCompare(candidate);

    if (normalized && aliasIndex.has(normalized)) {
      return aliasIndex.get(normalized);
    }
  }

  return "";
}

function registerAliases(aliasIndex = new Map(), primaryKey = "", item = {}) {
  const cleanPrimary = safeText(primaryKey, "");
  if (!cleanPrimary) return;

  getItemCandidateIds(item).forEach((candidate) => {
    const normalized = normalizeIdForCompare(candidate);

    if (normalized) {
      aliasIndex.set(normalized, cleanPrimary);
    }
  });
}

/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeStoreItem(item = {}) {
  const source = safeObject(item);

  try {
    return normalizeIncidenciaModel(source);
  } catch {
    return source;
  }
}

function normalizeStoreItems(items = []) {
  return safeArray(items).map(normalizeStoreItem);
}

/* =========================================================
   RICH MERGE HELPERS
========================================================= */

function mergePlainObject(base = {}, patch = {}) {
  return {
    ...safeObject(base),
    ...safeObject(patch),
  };
}

function mergeRaw(base = {}, patch = {}) {
  const baseRaw = safeObject(base.raw);
  const patchRaw = safeObject(patch.raw);

  if (!Object.keys(baseRaw).length && !Object.keys(patchRaw).length) {
    return undefined;
  }

  return {
    ...baseRaw,
    ...patchRaw,
  };
}

function mergeArrayById(baseItems = [], patchItems = []) {
  const output = [];
  const index = new Map();

  function getArrayItemKey(item = {}, fallback = "") {
    const row = safeObject(item);

    return safeText(
      first(
        row.id,
        row.attachmentId,
        row.fileId,
        row.commentId,
        row.historyId,
        row.eventId,
        row.ticketId,
        row.facturaId,
        row.invoiceId,
        row.numeroFacturaLegal,
        row.numeroFactura,
        row.invoiceNumber,
        row.path,
        row.blobName,
        row.storageKey,
        fallback
      ),
      fallback
    );
  }

  [...safeArray(baseItems), ...safeArray(patchItems)].forEach((item, position) => {
    const row = safeObject(item);
    const key = getArrayItemKey(row, `__anon_${position}`);

    if (!index.has(key)) {
      index.set(key, output.length);
      output.push(row);
      return;
    }

    const currentIndex = index.get(key);
    output[currentIndex] = mergePlainObject(output[currentIndex], row);
  });

  return output;
}

function mergeNestedRichObjects(current = {}, incoming = {}) {
  const merged = {
    ...current,
    ...incoming,
  };

  const nestedObjectKeys = [
    "raw",
    "meta",
    "cliente",
    "client",
    "customer",
    "tecnico",
    "assignedTo",
    "receptor",
    "createdBy",
    "requester",
    "requesterSnapshot",
    "owner",
    "usuario",
    "factura",
    "invoice",
    "billing",
    "linkedInvoices",
    "assignment",
    "lifecycle",
    "sla",
    "resolution",
    "relations",
    "visibility",
    "privacy",
    "audit",
    "search",
  ];

  nestedObjectKeys.forEach((key) => {
    if (isObject(current[key]) || isObject(incoming[key])) {
      merged[key] = mergePlainObject(current[key], incoming[key]);
    }
  });

  const raw = mergeRaw(current, incoming);

  if (raw) {
    merged.raw = raw;
  }

  const arrayKeys = [
    "attachments",
    "files",
    "adjuntos",
    "history",
    "comments",
    "timeline",
    "facturas",
    "invoices",
    "facturasRelacionadas",
    "linkedFacturas",
  ];

  arrayKeys.forEach((key) => {
    if (Array.isArray(current[key]) || Array.isArray(incoming[key])) {
      merged[key] = mergeArrayById(current[key], incoming[key]);
    }
  });

  /*
    Mantener aliases de adjuntos sincronizados si cualquiera llega mejorado
    desde detalle / upload.
  */
  const attachments = mergeArrayById(
    first(current.attachments, current.files, current.adjuntos, []),
    first(incoming.attachments, incoming.files, incoming.adjuntos, [])
  );

  if (attachments.length) {
    merged.attachments = attachments;
    merged.files = attachments;
    merged.adjuntos = attachments;
    merged.attachmentsCount = safeNumber(
      first(incoming.attachmentsCount, incoming.filesCount, attachments.length),
      attachments.length
    );
    merged.filesCount = safeNumber(
      first(incoming.filesCount, incoming.attachmentsCount, attachments.length),
      attachments.length
    );
  }

  /*
    Mantener aliases de facturación sincronizados.
  */
  const invoiceTotal = safeNumber(
    first(
      incoming.facturasTotal,
      incoming.invoicesTotal,
      incoming.importeFacturas,
      incoming.invoiceTotal,
      incoming.facturaTotal,
      incoming.facturaImporte,
      incoming.importeFactura,
      incoming.totalFactura,
      incoming.invoiceAmount,
      incoming.linkedInvoices?.total,
      incoming.billing?.total,
      incoming.total,
      incoming.amount,
      incoming.importe,

      current.facturasTotal,
      current.invoicesTotal,
      current.importeFacturas,
      current.invoiceTotal,
      current.facturaTotal,
      current.facturaImporte,
      current.importeFactura,
      current.totalFactura,
      current.invoiceAmount,
      current.linkedInvoices?.total,
      current.billing?.total,
      current.total,
      current.amount,
      current.importe,

      0
    ),
    0
  );

  const invoiceCurrency = safeText(
    first(
      incoming.currency,
      incoming.moneda,
      incoming.facturaCurrency,
      incoming.facturaMoneda,
      incoming.linkedInvoices?.currency,
      incoming.linkedInvoices?.moneda,
      incoming.billing?.currency,
      incoming.billing?.moneda,
      incoming.meta?.invoiceCurrency,

      current.currency,
      current.moneda,
      current.facturaCurrency,
      current.facturaMoneda,
      current.linkedInvoices?.currency,
      current.linkedInvoices?.moneda,
      current.billing?.currency,
      current.billing?.moneda,
      current.meta?.invoiceCurrency,

      "EUR"
    ),
    "EUR"
  ).toUpperCase();

  const invoiceNumber = safeText(
    first(
      incoming.numeroFacturaLegal,
      incoming.numeroFactura,
      incoming.invoiceNumber,
      incoming.linkedInvoices?.numeroFacturaLegal,
      incoming.billing?.numeroFacturaLegal,
      incoming.factura?.numeroFacturaLegal,

      current.numeroFacturaLegal,
      current.numeroFactura,
      current.invoiceNumber,
      current.linkedInvoices?.numeroFacturaLegal,
      current.billing?.numeroFacturaLegal,
      current.factura?.numeroFacturaLegal,

      ""
    ),
    ""
  );

  if (invoiceTotal || invoiceNumber) {
    merged.numeroFacturaLegal = invoiceNumber;
    merged.numeroFactura = invoiceNumber;
    merged.invoiceNumber = invoiceNumber;

    merged.facturasTotal = invoiceTotal;
    merged.invoicesTotal = invoiceTotal;
    merged.importeFacturas = invoiceTotal;
    merged.invoiceTotal = invoiceTotal;

    merged.facturaTotal = invoiceTotal;
    merged.facturaImporte = invoiceTotal;
    merged.importeFactura = invoiceTotal;
    merged.totalFactura = invoiceTotal;
    merged.invoiceAmount = invoiceTotal;

    merged.total = invoiceTotal;
    merged.amount = invoiceTotal;
    merged.importe = invoiceTotal;

    merged.currency = invoiceCurrency;
    merged.moneda = invoiceCurrency;
    merged.facturaCurrency = invoiceCurrency;
    merged.facturaMoneda = invoiceCurrency;

    merged.linkedInvoices = {
      ...safeObject(current.linkedInvoices),
      ...safeObject(incoming.linkedInvoices),
      numeroFacturaLegal: invoiceNumber,
      numeroFactura: invoiceNumber,
      invoiceNumber,
      total: invoiceTotal,
      amount: invoiceTotal,
      importe: invoiceTotal,
      currency: invoiceCurrency,
      moneda: invoiceCurrency,
    };

    merged.billing = {
      ...safeObject(current.billing),
      ...safeObject(incoming.billing),
      numeroFacturaLegal: invoiceNumber,
      numeroFactura: invoiceNumber,
      invoiceNumber,
      total: invoiceTotal,
      amount: invoiceTotal,
      importe: invoiceTotal,
      currency: invoiceCurrency,
      moneda: invoiceCurrency,
    };

    merged.meta = {
      ...safeObject(merged.meta),
      hasLinkedInvoices: true,
      hasFactura: true,
      hasInvoice: true,
      invoiceTotal,
      invoicesTotal: invoiceTotal,
      invoiceCurrency,
      numeroFacturaLegal: invoiceNumber,
    };
  }

  return normalizeStoreItem(merged);
}

function mergeIncidencia(base = {}, patch = {}) {
  const current = normalizeStoreItem(base);
  const incoming = normalizeStoreItem(patch);

  return mergeNestedRichObjects(current, incoming);
}

function dedupeIncidencias(items = []) {
  const list = normalizeStoreItems(items);
  const map = new Map();
  const aliasIndex = new Map();
  const anonymous = [];

  for (const rawItem of list) {
    const item = safeObject(rawItem);
    const primaryId = getItemId(item);

    if (!primaryId) {
      anonymous.push(item);
      continue;
    }

    const existingKey = findExistingKeyForItem(aliasIndex, item);
    const finalKey = existingKey || primaryId;

    if (!map.has(finalKey)) {
      map.set(finalKey, item);
      registerAliases(aliasIndex, finalKey, item);
      continue;
    }

    const current = map.get(finalKey);
    const merged = mergeIncidencia(current, item);

    map.set(finalKey, merged);
    registerAliases(aliasIndex, finalKey, merged);
  }

  return [...map.values(), ...anonymous];
}

function normalizeCollection(items = [], { sort = true } = {}) {
  const deduped = dedupeIncidencias(items);

  if (!sort) {
    return deduped;
  }

  return sortIncidenciasByUpdatedDesc(deduped);
}

/* =========================================================
   STORE LOW LEVEL READ
========================================================= */

function readViaStoreGet(paths = READ_PATHS) {
  if (typeof Store?.get !== "function") return null;

  for (const path of paths) {
    try {
      const value = Store.get(path);

      if (Array.isArray(value)) {
        return value;
      }

      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value;
      }
    } catch {}
  }

  return null;
}

function getStoreStateCandidates() {
  const output = [];

  try {
    if (Store?.state) output.push(Store.state);
  } catch {}

  try {
    if (Store?.data) output.push(Store.data);
  } catch {}

  try {
    if (Store?.snapshot) output.push(Store.snapshot);
  } catch {}

  try {
    if (typeof Store?.getState === "function") {
      output.push(Store.getState());
    }
  } catch {}

  return output;
}

function readViaStoreState(paths = READ_PATHS) {
  const stateCandidates = getStoreStateCandidates();

  for (const state of stateCandidates) {
    const obj = safeObject(state);

    for (const path of paths) {
      const value = getByPath(obj, path);

      if (Array.isArray(value)) {
        return value;
      }

      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value;
      }
    }
  }

  return null;
}

function readViaStoreCollections() {
  const candidates = [
    Store?.collections?.[STORE_COLLECTION_KEY],
    Store?.entities?.[STORE_COLLECTION_KEY],
    Store?.entities?.incidencias,
    Store?.collections?.tickets,
    Store?.entities?.tickets,
  ];

  for (const value of candidates) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return null;
}

function objectMapToArray(value = {}) {
  const obj = safeObject(value);

  return Object.values(obj).filter((item) => isObject(item));
}

function readStoreCollection() {
  const candidates = [
    readViaStoreGet(READ_PATHS),
    readViaStoreState(READ_PATHS),
    readViaStoreCollections(),
  ];

  for (const value of candidates) {
    if (Array.isArray(value)) {
      return cloneArray(value);
    }

    if (value && typeof value === "object") {
      const list = objectMapToArray(value);
      if (list.length) return cloneArray(list);
    }
  }

  return [];
}

function readStoreDetailMap() {
  const candidates = [
    readViaStoreGet(DETAIL_READ_PATHS),
    readViaStoreState(DETAIL_READ_PATHS),
    Store?.entities?.incidenciasById,
    Store?.entities?.incidenciasDetail,
    Store?.incidenciasById,
  ];

  for (const value of candidates) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return safeObject(value);
    }
  }

  return {};
}

/* =========================================================
   STORE LOW LEVEL WRITE
========================================================= */

function writeViaSet(path = "", value = null) {
  try {
    if (typeof Store?.set === "function") {
      Store.set(path, value);
      return true;
    }
  } catch {}

  return false;
}

function writeViaActions(list = []) {
  let wrote = false;

  try {
    if (typeof Store?.actions?.setCollection === "function") {
      Store.actions.setCollection(STORE_COLLECTION_KEY, list);
      wrote = true;
    }
  } catch {}

  try {
    if (typeof Store?.actions?.replaceCollection === "function") {
      Store.actions.replaceCollection(STORE_COLLECTION_KEY, list);
      wrote = true;
    }
  } catch {}

  try {
    if (typeof Store?.actions?.set === "function") {
      Store.actions.set(STORE_PATH, list);
      wrote = true;
    }
  } catch {}

  try {
    if (typeof Store?.commit === "function") {
      Store.commit(STORE_PATH, list);
      wrote = true;
    }
  } catch {}

  return wrote;
}

function buildDetailMap(items = []) {
  const map = {};

  safeArray(items).forEach((item) => {
    const row = safeObject(item);
    const primaryId = getItemId(row);

    if (!primaryId) return;

    const ids = getItemCandidateIds(row);

    ids.forEach((id) => {
      const key = normalizeIdForCompare(id);
      if (key) map[key] = row;
    });

    map[primaryId] = row;
  });

  return map;
}

function writeDetailMap(items = []) {
  const detailMap = buildDetailMap(items);

  writeViaSet(STORE_BY_ID_PATH, detailMap);
  writeViaSet(STORE_DETAIL_PATH, detailMap);
  writeViaSet("incidenciasById", detailMap);

  try {
    if (Store && typeof Store === "object") {
      Store.entities = safeObject(Store.entities);
      Store.entities.incidenciasById = detailMap;
      Store.entities.incidenciasDetail = detailMap;
    }
  } catch {}

  return detailMap;
}

function writeMeta(list = []) {
  const meta = {
    count: safeArray(list).length,
    ids: safeArray(list).map(getItemId).filter(Boolean),
    updatedAt: new Date().toISOString(),
  };

  writeViaSet(STORE_META_PATH, meta);

  try {
    if (Store && typeof Store === "object") {
      Store.entities = safeObject(Store.entities);
      Store.entities.incidenciasMeta = meta;
    }
  } catch {}

  return meta;
}

function writeDirectFallback(list = []) {
  try {
    if (Store && typeof Store === "object") {
      Store.entities = safeObject(Store.entities);
      Store.entities.incidencias = list;
      return true;
    }
  } catch {}

  return false;
}

function writeStoreCollection(items = []) {
  const list = normalizeCollection(items);

  let wrote = false;

  wrote = writeViaSet(STORE_PATH, list) || wrote;
  wrote = writeViaSet(STORE_COLLECTION_KEY, list) || wrote;
  wrote = writeViaSet(`collections.${STORE_COLLECTION_KEY}`, list) || wrote;
  wrote = writeViaActions(list) || wrote;
  wrote = writeDirectFallback(list) || wrote;

  writeDetailMap(list);
  writeMeta(list);

  return list;
}

/* =========================================================
   GETTERS
========================================================= */

export function getIncidencias() {
  return normalizeCollection(readStoreCollection());
}

export function getIncidenciasStore() {
  return getIncidencias();
}

export function getSortedIncidenciasStore() {
  return sortIncidenciasByUpdatedDesc(getIncidencias());
}

export function getIncidenciaById(id = "") {
  const target = safeText(id, "");
  if (!target) return null;

  const normalizedTarget = normalizeIdForCompare(target);

  const detailMap = readStoreDetailMap();

  if (detailMap[normalizedTarget]) {
    return normalizeStoreItem(detailMap[normalizedTarget]);
  }

  if (detailMap[target]) {
    return normalizeStoreItem(detailMap[target]);
  }

  const items = getIncidencias();

  return items.find((item) => isSameItemId(item, target)) || null;
}

export function getIncidenciaByIdStore(id = "") {
  return getIncidenciaById(id);
}

export function hasIncidencias() {
  return getIncidencias().length > 0;
}

export function getIncidenciasCount() {
  return getIncidencias().length;
}

export function getIncidenciasSnapshot() {
  const items = getIncidencias();

  return {
    items,
    count: items.length,
    hasItems: items.length > 0,
    ids: items.map(getItemId).filter(Boolean),
    lastReadAt: new Date().toISOString(),
  };
}

/* =========================================================
   SETTERS
========================================================= */

export function setIncidencias(items = []) {
  return writeStoreCollection(items);
}

export function setIncidenciasStore(items = []) {
  return setIncidencias(items);
}

export function replaceIncidenciasStore(items = []) {
  return setIncidencias(items);
}

export function clearIncidencias() {
  return writeStoreCollection([]);
}

export function clearIncidenciasStore() {
  return clearIncidencias();
}

export function appendIncidenciaStore(item = null) {
  if (!item) {
    return getIncidencias();
  }

  const current = getIncidencias();
  const incoming = normalizeStoreItem(item);
  const next = normalizeCollection([incoming, ...current]);

  return writeStoreCollection(next);
}

export function updateIncidenciaStore(id = "", patch = {}) {
  const target = safeText(id, "");

  if (!target) {
    return getIncidencias();
  }

  const current = getIncidencias();
  const incomingPatch = normalizeStoreItem(patch);

  let found = false;

  const next = current.map((item) => {
    if (!isSameItemId(item, target)) {
      return item;
    }

    found = true;

    return mergeIncidencia(item, {
      ...incomingPatch,
      id: safeText(
        first(incomingPatch.id, incomingPatch.ticketId, item.id),
        item.id
      ),
      ticketId: safeText(
        first(incomingPatch.ticketId, incomingPatch.id, item.ticketId),
        item.ticketId
      ),
    });
  });

  if (!found) {
    return current;
  }

  return writeStoreCollection(next);
}

export function patchIncidenciaStore(id = "", patch = {}) {
  return updateIncidenciaStore(id, patch);
}

/* =========================================================
   UPSERT
========================================================= */

export function upsertIncidenciaStore(item = null) {
  if (!item) {
    return getIncidencias();
  }

  const incoming = normalizeStoreItem(item);
  const current = getIncidencias();
  const incomingIds = getItemCandidateIds(incoming);

  if (!incomingIds.length) {
    return writeStoreCollection([incoming, ...current]);
  }

  let found = false;

  const next = current.map((row) => {
    const matches = incomingIds.some((id) => hasCandidateId(row, id));

    if (!matches) {
      return row;
    }

    found = true;
    return mergeIncidencia(row, incoming);
  });

  const finalItems = found
    ? next
    : [incoming, ...current];

  return writeStoreCollection(finalItems);
}

export function upsertManyIncidenciasStore(items = []) {
  const incoming = safeArray(items);

  if (!incoming.length) {
    return getIncidencias();
  }

  let next = getIncidencias();

  incoming.forEach((item) => {
    const row = normalizeStoreItem(item);
    const ids = getItemCandidateIds(row);

    if (!ids.length) {
      next = [row, ...next];
      next = normalizeCollection(next);
      return;
    }

    let found = false;

    next = next.map((existing) => {
      const matches = ids.some((id) => hasCandidateId(existing, id));

      if (!matches) {
        return existing;
      }

      found = true;
      return mergeIncidencia(existing, row);
    });

    if (!found) {
      next = [row, ...next];
    }

    next = normalizeCollection(next);
  });

  return writeStoreCollection(next);
}

/* =========================================================
   REMOVE
========================================================= */

export function removeIncidenciaStore(id = "") {
  const target = safeText(id, "");

  if (!target) {
    return getIncidencias();
  }

  const next = getIncidencias().filter(
    (item) => !isSameItemId(item, target)
  );

  return writeStoreCollection(next);
}

/* =========================================================
   SORT HELPERS
========================================================= */

export function sortIncidenciasByUpdatedDesc(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const aTime = getUpdatedTimestamp(a);
    const bTime = getUpdatedTimestamp(b);

    if (bTime !== aTime) {
      return bTime - aTime;
    }

    return safeText(getItemId(b)).localeCompare(
      safeText(getItemId(a)),
      "es",
      {
        numeric: true,
        sensitivity: "base",
      }
    );
  });
}

export function sortIncidenciasByCreatedDesc(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const aTime = getCreatedTimestamp(a);
    const bTime = getCreatedTimestamp(b);

    if (bTime !== aTime) {
      return bTime - aTime;
    }

    return safeText(getItemId(b)).localeCompare(
      safeText(getItemId(a)),
      "es",
      {
        numeric: true,
        sensitivity: "base",
      }
    );
  });
}

/* =========================================================
   COLLECTION HELPERS
========================================================= */

export function filterIncidenciasStore(predicate = null) {
  const items = getIncidencias();

  if (typeof predicate !== "function") {
    return items;
  }

  return items.filter(predicate);
}

export function mapIncidenciasStore(mapper = null) {
  const items = getIncidencias();

  if (typeof mapper !== "function") {
    return items;
  }

  return items.map(mapper);
}

export function findIncidenciaStore(predicate = null) {
  const items = getIncidencias();

  if (typeof predicate !== "function") {
    return null;
  }

  return items.find(predicate) || null;
}

/* =========================================================
   STATUS / STATS HELPERS
========================================================= */

function getStatus(item = {}) {
  return safeLower(first(item.status, item.estado, item.raw?.status, item.raw?.estado), "");
}

function getPriority(item = {}) {
  return safeLower(first(item.priority, item.prioridad, item.raw?.priority, item.raw?.prioridad), "");
}

function isClosedLike(item = {}) {
  const status = getStatus(item);

  return [
    "closed",
    "cerrada",
    "cerrado",
    "resolved",
    "resuelta",
    "resuelto",
  ].includes(status);
}

function isOpenLike(item = {}) {
  const status = getStatus(item);

  return [
    "open",
    "abierta",
    "abierto",
    "pending",
    "pendiente",
    "in_progress",
    "progress",
    "proceso",
    "en_proceso",
  ].includes(status);
}

function isUrgentLike(item = {}) {
  const priority = getPriority(item);

  return [
    "urgent",
    "urgente",
    "critical",
    "critica",
    "crítica",
    "high",
    "alta",
  ].includes(priority);
}

function hasAttachments(item = {}) {
  return (
    safeArray(first(item.attachments, item.files, item.adjuntos)).length > 0 ||
    safeNumber(first(item.attachmentsCount, item.filesCount, item.adjuntosCount), 0) > 0
  );
}

function hasInvoices(item = {}) {
  return Boolean(
    item.factura ||
      item.invoice ||
      item.billing ||
      item.linkedInvoices ||
      safeArray(item.facturas).length ||
      safeArray(item.invoices).length ||
      safeNumber(
        first(
          item.facturasTotal,
          item.invoicesTotal,
          item.invoiceTotal,
          item.facturaTotal,
          item.total,
          item.amount,
          item.importe
        ),
        0
      ) > 0
  );
}

export function computeIncidenciasStoreStats(items = getIncidencias()) {
  const list = safeArray(items);

  const total = list.length;
  const closed = list.filter(isClosedLike).length;
  const open = list.filter(isOpenLike).length;
  const urgent = list.filter(isUrgentLike).length;
  const withAttachments = list.filter(hasAttachments).length;
  const withInvoices = list.filter(hasInvoices).length;

  return {
    total,
    open,
    closed,
    active: Math.max(total - closed, 0),
    urgent,
    withAttachments,
    withInvoices,
  };
}

/* =========================================================
   DEBUG
========================================================= */

export function getIncidenciasStoreDebugSnapshot() {
  const items = getIncidencias();
  const detailMap = readStoreDetailMap();

  return {
    path: STORE_PATH,
    collectionKey: STORE_COLLECTION_KEY,
    byIdPath: STORE_BY_ID_PATH,
    detailPath: STORE_DETAIL_PATH,

    count: items.length,
    detailKeys: Object.keys(detailMap || {}).length,

    ids: items.map(getItemId).filter(Boolean),

    firstId: getItemId(items[0] || {}),
    lastUpdatedAt:
      items[0]?.lastActivityAt ||
      items[0]?.updatedAt ||
      items[0]?.raw?.lastActivityAt ||
      items[0]?.raw?.updatedAt ||
      null,

    stats: computeIncidenciasStoreStats(items),

    items,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  STORE_PATH,
  STORE_COLLECTION_KEY,
  STORE_BY_ID_PATH,
  STORE_DETAIL_PATH,
  STORE_META_PATH,

  getIncidencias,
  getIncidenciasStore,
  getSortedIncidenciasStore,
  getIncidenciaById,
  getIncidenciaByIdStore,
  getIncidenciasSnapshot,
  hasIncidencias,
  getIncidenciasCount,

  setIncidencias,
  setIncidenciasStore,
  replaceIncidenciasStore,
  appendIncidenciaStore,
  updateIncidenciaStore,
  patchIncidenciaStore,
  upsertIncidenciaStore,
  upsertManyIncidenciasStore,
  removeIncidenciaStore,
  clearIncidencias,
  clearIncidenciasStore,

  filterIncidenciasStore,
  mapIncidenciasStore,
  findIncidenciaStore,

  sortIncidenciasByUpdatedDesc,
  sortIncidenciasByCreatedDesc,

  computeIncidenciasStoreStats,

  getItemId,
  getItemCandidateIds,
  getIncidenciasStoreDebugSnapshot,
};
