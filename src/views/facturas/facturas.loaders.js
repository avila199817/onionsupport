/* =========================================================
   Onion SPA - Facturas Loaders
   Archivo: src/views/facturas/facturas.loaders.js

   FINAL PRO SYSTEM · LOADERS REAL · 10/10 EXTREME
   PATCH · API ALIGNED · STORE SAFE · DETAIL RACE SAFE
   PATCH · FACTURAS ARRAY + INCIDENCIA PRESERVER
   PATCH · NORMALIZED API COMPAT + LEGACY RESPONSE COMPAT
   PATCH · RAW PAYLOAD DEEP READER + STALE RESPONSE FALLBACK
   PATCH · NO DUPLICATE DOMAIN LOGIC · MODEL-DRIVEN RELATIONS

   RESPONSABILIDADES:
   - cargar colección de facturas desde backend
   - cargar detalle individual de factura
   - sincronizar Store y estado local del módulo
   - controlar flags de loading / refresh / error / inflight
   - mantener paridad de flujo con incidenciasView
   - evitar estados colgados en render / inflight
   - preservar relación factura ↔ incidencia usando facturas.model.js
   - tolerar respuestas normalizadas desde facturas.api.js
   - tolerar respuestas legacy del backend
   - leer datos reales dentro de raw/raw.data/raw.payload/raw.result
   - evitar tabla vacía si una respuesta stale trae datos y el store sigue vacío

   BACKEND ALINEADO:
   - GET /api/facturas
   - GET /api/facturas/:id

   API NORMALIZADA ESPERADA:
   - fetchFacturasRequest() -> {
       ok,
       items,
       facturas,
       total,
       count,
       remoteCount,
       page,
       limit,
       raw,
       meta
     }

   - fetchFacturaDetailRequest(id) -> {
       ok,
       item,
       factura,
       raw,
       meta
     }

   HARDENING PRO:
   - anti-race por token en colección
   - anti-race por id/token en detalle
   - loading inicial vs refreshing posterior
   - lastSyncAt coherente
   - remoteCount robusto
   - detalle con apertura previa segura
   - error de detalle no ensucia error global
   - no pisa detalle si llega una respuesta vieja
   - no rompe si normalizeFactura falla
   - no duplica inflight de colección
   - no devuelve inflight de detalle de otra factura
   - no descarta datos si el wrapper normalizado viene vacío pero raw trae facturas
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  normalizeFactura,
  getFacturaPrimaryId,
  getFacturaIdentityList,
  sameFacturaIdentity,
  getFacturaIncidenciaId,
  buildFacturaIncidenciaPayload,
} from "./facturas.model.js";

import {
  fetchFacturasRequest,
  fetchFacturaDetailRequest,
} from "./facturas.api.js";

import {
  setFacturasStore,
  getFacturaByIdStore,
} from "./facturas.store.js";

import {
  safeText,
} from "./facturas.utils.js";

import {
  getFacturasInflightLoad,
  getFacturasInflightDetail,
  getFacturasDetailData,
  isFacturasLoaded,

  setFacturasLoading,
  setFacturasLoaded,
  setFacturasError,
  clearFacturasError,
  setFacturasRefreshing,
  setFacturasRemoteCount,
  setFacturasLastSyncAt,

  setFacturasDetailOpen,
  setFacturasDetailLoading,
  setFacturasDetailData,

  setFacturasInflightLoad,
  setFacturasInflightDetail,
} from "./facturas.state.js";

/* =========================================================
   CONSTANTS
========================================================= */

const MODULE_NAME = "FacturasLoaders";

const COLLECTION_DEPTH_LIMIT = 6;
const DETAIL_DEPTH_LIMIT = 6;

const COLLECTION_ARRAY_KEYS = Object.freeze([
  "items",
  "facturas",
  "invoices",
  "data",
  "rows",
  "results",
  "records",
  "list",
  "collection",
  "documents",
]);

const PAYLOAD_OBJECT_KEYS = Object.freeze([
  "data",
  "body",
  "result",
  "payload",
  "response",
  "resource",
  "raw",
]);

const DETAIL_OBJECT_KEYS = Object.freeze([
  "item",
  "factura",
  "invoice",
  "record",
  "detail",
  "document",
]);

const TOTAL_KEYS = Object.freeze([
  "total",
  "count",
  "remoteCount",
  "totalCount",
  "totalItems",
  "matched",
  "totalMatched",
]);

const TOTAL_CONTAINER_KEYS = Object.freeze([
  "meta",
  "pagination",
  "pageInfo",
  "summary",
]);

/* =========================================================
   MODULE STATE
========================================================= */

let collectionLoadToken = 0;
let detailLoadToken = 0;

/* =========================================================
   BASE HELPERS
========================================================= */

function safeRender(render) {
  try {
    if (typeof render === "function") {
      render();
      return true;
    }
  } catch {}

  return false;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
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
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    return value;
  }

  return null;
}

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function safeLog(...args) {
  try {
    AppCore?.utils?.log?.(`[${MODULE_NAME}]`, ...args);
  } catch {}
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(`[${MODULE_NAME}]`, ...args);
  } catch {
    try {
      console.warn(`[${MODULE_NAME}]`, ...args);
    } catch {}
  }
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
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );

      emitted = true;
    }
  } catch {}

  return emitted;
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

function ensureStateShape(state = null) {
  if (!state || typeof state !== "object") {
    throw new Error("FACTURAS_STATE_REQUIRED");
  }

  if (!state.view || typeof state.view !== "object") {
    state.view = {};
  }

  if (!state.detail || typeof state.detail !== "object") {
    state.detail = {};
  }

  if (!state.inflight || typeof state.inflight !== "object") {
    state.inflight = {};
  }

  if (!state.actions || typeof state.actions !== "object") {
    state.actions = {};
  }

  return state;
}

/* =========================================================
   FACTURA IDENTITY HELPERS
========================================================= */

function getFacturaIdentitySafe(item = null) {
  const source = safeObject(item);

  try {
    return safeText(getFacturaPrimaryId(source), "");
  } catch {}

  const raw = safeObject(source.raw);

  return safeText(
    first(
      source.id,
      source._id,
      source.facturaId,
      source.invoiceId,
      source.numero,
      source.numeroFacturaLegal,
      source.numeroFacturaSistema,
      source.invoiceNumber,
      source.code,

      raw.id,
      raw._id,
      raw.facturaId,
      raw.invoiceId,
      raw.numero,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema,
      raw.invoiceNumber,
      raw.code
    ),
    ""
  );
}

function getFacturaIdentityListSafe(item = null) {
  const source = safeObject(item);

  try {
    const identities = getFacturaIdentityList(source);
    if (Array.isArray(identities) && identities.length) {
      return identities.map((value) => safeText(value, "")).filter(Boolean);
    }
  } catch {}

  const raw = safeObject(source.raw);

  return [
    source.id,
    source._id,
    source.facturaId,
    source.invoiceId,
    source.numero,
    source.numeroFacturaLegal,
    source.numeroFacturaSistema,
    source.invoiceNumber,
    source.code,

    raw.id,
    raw._id,
    raw.facturaId,
    raw.invoiceId,
    raw.numero,
    raw.numeroFacturaLegal,
    raw.numeroFacturaSistema,
    raw.invoiceNumber,
    raw.code,
  ]
    .map((value) => safeText(value, ""))
    .filter(Boolean);
}

function sameFacturaId(a = "", b = "") {
  try {
    return sameFacturaIdentity(a, b);
  } catch {
    const left = normalizeKey(a);
    const right = normalizeKey(b);

    return Boolean(left && right && left === right);
  }
}

/* =========================================================
   INCIDENCIA PRESERVER
   Nota:
   - La extracción fuerte vive en facturas.model.js.
   - Aquí solo blindamos merges por si una respuesta remota pierde campos.
========================================================= */

function getIncidenciaIdSafe(item = {}) {
  try {
    return safeText(getFacturaIncidenciaId(item), "");
  } catch {
    return "";
  }
}

function buildIncidenciaPayloadSafe(item = {}) {
  try {
    return buildFacturaIncidenciaPayload(item) || null;
  } catch {
    return null;
  }
}

function mergeRelationRaw(raw = {}, incidenciaId = "", incidenciaPayload = null) {
  const base = safeObject(raw);

  if (!incidenciaId) {
    return base;
  }

  const payload = safeObject(
    incidenciaPayload,
    {
      id: incidenciaId,
      ticketId: incidenciaId,
      incidenciaId,
      subject: "Incidencia relacionada",
      asunto: "Incidencia relacionada",
      title: "Incidencia relacionada",
    }
  );

  const withId = (value = {}) => ({
    ...payload,
    ...safeObject(value),
    id: safeText(first(value?.id, incidenciaId), incidenciaId),
    ticketId: safeText(first(value?.ticketId, incidenciaId), incidenciaId),
    incidenciaId: safeText(first(value?.incidenciaId, incidenciaId), incidenciaId),
  });

  return {
    ...base,

    ticketId: safeText(first(base.ticketId, incidenciaId), incidenciaId),
    incidenciaId: safeText(first(base.incidenciaId, incidenciaId), incidenciaId),
    relatedTicketId: safeText(first(base.relatedTicketId, incidenciaId), incidenciaId),
    relatedIncidentId: safeText(first(base.relatedIncidentId, incidenciaId), incidenciaId),
    supportTicketId: safeText(first(base.supportTicketId, incidenciaId), incidenciaId),
    caseId: safeText(first(base.caseId, incidenciaId), incidenciaId),

    incidencia: hasOwnKeys(base.incidencia)
      ? withId(base.incidencia)
      : payload,

    ticket: hasOwnKeys(base.ticket)
      ? withId(base.ticket)
      : payload,

    linkedTicket: hasOwnKeys(base.linkedTicket)
      ? withId(base.linkedTicket)
      : payload,

    relations: {
      ...safeObject(base.relations),
      ticket: withId(base.relations?.ticket),
    },

    meta: {
      ...safeObject(base.meta),
      hasIncidencia: true,
      incidenciaId,
      ticketId: incidenciaId,
    },
  };
}

function preserveIncidenciaFields(normalized = {}, original = {}) {
  const base = safeObject(normalized);
  const source = safeObject(original);

  const sourceRaw = hasOwnKeys(source.raw)
    ? safeObject(source.raw)
    : source;

  const baseRaw = hasOwnKeys(base.raw)
    ? safeObject(base.raw)
    : {};

  const raw = {
    ...sourceRaw,
    ...baseRaw,
  };

  const probe = {
    ...source,
    ...base,
    raw,
  };

  const incidenciaId = safeText(
    first(
      getIncidenciaIdSafe(probe),
      getIncidenciaIdSafe(source),
      getIncidenciaIdSafe(base),
      getIncidenciaIdSafe(raw)
    ),
    ""
  );

  if (!incidenciaId) {
    return {
      ...base,

      raw,

      meta: {
        ...safeObject(source.meta),
        ...safeObject(base.meta),
        hasIncidencia: Boolean(
          first(
            base.meta?.hasIncidencia,
            source.meta?.hasIncidencia,
            raw.meta?.hasIncidencia,
            false
          )
        ),
      },
    };
  }

  const incidenciaPayload =
    buildIncidenciaPayloadSafe(probe) ||
    buildIncidenciaPayloadSafe(source) ||
    buildIncidenciaPayloadSafe(base) ||
    {
      id: incidenciaId,
      ticketId: incidenciaId,
      incidenciaId,
      subject: "Incidencia relacionada",
      asunto: "Incidencia relacionada",
      title: "Incidencia relacionada",
    };

  const nextRaw = mergeRelationRaw(raw, incidenciaId, incidenciaPayload);

  const pickRelationObject = (...values) => {
    const picked = first(...values);
    return hasOwnKeys(picked) ? safeObject(picked) : incidenciaPayload;
  };

  return {
    ...base,

    ticketId: incidenciaId,
    incidenciaId,

    relatedTicketId: safeText(
      first(base.relatedTicketId, source.relatedTicketId, nextRaw.relatedTicketId, incidenciaId),
      incidenciaId
    ),

    relatedIncidentId: safeText(
      first(base.relatedIncidentId, source.relatedIncidentId, nextRaw.relatedIncidentId, incidenciaId),
      incidenciaId
    ),

    supportTicketId: safeText(
      first(base.supportTicketId, source.supportTicketId, nextRaw.supportTicketId, incidenciaId),
      incidenciaId
    ),

    caseId: safeText(
      first(base.caseId, source.caseId, nextRaw.caseId, incidenciaId),
      incidenciaId
    ),

    incidencia: incidenciaPayload,

    ticket: {
      ...incidenciaPayload,
      ...pickRelationObject(base.ticket, source.ticket, nextRaw.ticket),
      id: incidenciaId,
      ticketId: incidenciaId,
      incidenciaId,
    },

    linkedTicket: {
      ...incidenciaPayload,
      ...pickRelationObject(base.linkedTicket, source.linkedTicket, nextRaw.linkedTicket),
      id: incidenciaId,
      ticketId: incidenciaId,
      incidenciaId,
    },

    relationType: safeText(
      first(
        base.relationType,
        source.relationType,
        nextRaw.relationType,
        incidenciaPayload?.relationType,
        "linked_ticket"
      ),
      "linked_ticket"
    ),

    meta: {
      ...safeObject(source.meta),
      ...safeObject(base.meta),
      ...safeObject(nextRaw.meta),
      hasIncidencia: true,
      incidenciaId,
      ticketId: incidenciaId,
    },

    raw: nextRaw,
  };
}

function normalizeFacturaSafe(item = {}) {
  const original = safeObject(item);

  let normalized = original;

  try {
    normalized = normalizeFactura(original);
  } catch (error) {
    safeWarn("normalizeFactura falló; se usa payload original.", {
      message: error?.message || "UNKNOWN_ERROR",
    });

    normalized = original;
  }

  return preserveIncidenciaFields(normalized, original);
}

/* =========================================================
   DEEP RESPONSE READER
========================================================= */

function pushCandidate(output = [], value = null) {
  if (value === undefined || value === null) {
    return output;
  }

  output.push(value);
  return output;
}

function collectPayloadCandidates({
  value = null,
  output = [],
  seen = new WeakSet(),
  depth = 0,
  maxDepth = COLLECTION_DEPTH_LIMIT,
} = {}) {
  if (value === undefined || value === null) {
    return output;
  }

  pushCandidate(output, value);

  if (depth >= maxDepth) {
    return output;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return output;
  }

  if (seen.has(value)) {
    return output;
  }

  seen.add(value);

  for (const key of COLLECTION_ARRAY_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;

    const child = value[key];

    pushCandidate(output, child);

    if (child && typeof child === "object" && !Array.isArray(child)) {
      collectPayloadCandidates({
        value: child,
        output,
        seen,
        depth: depth + 1,
        maxDepth,
      });
    }
  }

  for (const key of DETAIL_OBJECT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;

    const child = value[key];

    pushCandidate(output, child);

    if (child && typeof child === "object" && !Array.isArray(child)) {
      collectPayloadCandidates({
        value: child,
        output,
        seen,
        depth: depth + 1,
        maxDepth,
      });
    }
  }

  for (const key of PAYLOAD_OBJECT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;

    const child = value[key];

    pushCandidate(output, child);

    if (child && typeof child === "object" && !Array.isArray(child)) {
      collectPayloadCandidates({
        value: child,
        output,
        seen,
        depth: depth + 1,
        maxDepth,
      });
    }
  }

  return output;
}

function getPayloadCandidates(payload = null, maxDepth = COLLECTION_DEPTH_LIMIT) {
  return collectPayloadCandidates({
    value: payload,
    maxDepth,
  }).filter((item) => item !== undefined && item !== null);
}

function isLikelyFacturaObject(value = null) {
  const obj = safeObject(value, null);

  if (!obj) {
    return false;
  }

  return Boolean(
    obj.id ||
      obj._id ||
      obj.facturaId ||
      obj.invoiceId ||
      obj.numero ||
      obj.numeroFacturaLegal ||
      obj.numeroFacturaSistema ||
      obj.numeroFactura ||
      obj.invoiceNumber ||
      obj.code ||
      obj.tipoDocumento ||
      obj.entityType ||
      obj.cliente ||
      obj.client ||
      obj.customer ||
      obj.total !== undefined ||
      obj.amount !== undefined ||
      obj.importe !== undefined ||
      obj.totalFactura !== undefined ||
      obj.invoiceAmount !== undefined
  );
}

/* =========================================================
   COLLECTION NORMALIZER
========================================================= */

function pickArrayFromCandidate(candidate = null) {
  if (Array.isArray(candidate)) {
    return candidate;
  }

  const obj = safeObject(candidate, null);

  if (!obj) {
    return null;
  }

  let emptyArray = null;

  for (const key of COLLECTION_ARRAY_KEYS) {
    const value = obj[key];

    if (!Array.isArray(value)) {
      continue;
    }

    if (value.length > 0) {
      return value;
    }

    if (!emptyArray) {
      emptyArray = value;
    }
  }

  return emptyArray;
}

function pickCollectionItems(response = null) {
  const candidates = getPayloadCandidates(response, COLLECTION_DEPTH_LIMIT);

  let emptyArray = null;

  for (const candidate of candidates) {
    const found = pickArrayFromCandidate(candidate);

    if (Array.isArray(found) && found.length > 0) {
      return found;
    }

    if (Array.isArray(found) && !emptyArray) {
      emptyArray = found;
    }
  }

  return emptyArray || [];
}

function readTotalFromObject(obj = null) {
  const source = safeObject(obj, null);

  if (!source) {
    return null;
  }

  for (const key of TOTAL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;

    const value = source[key];

    if (value === undefined || value === null || value === "") {
      continue;
    }

    const number = safeNumber(value, NaN);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  for (const containerKey of TOTAL_CONTAINER_KEYS) {
    const nested = safeObject(source[containerKey], null);

    if (!nested) {
      continue;
    }

    for (const key of TOTAL_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(nested, key)) continue;

      const value = nested[key];

      if (value === undefined || value === null || value === "") {
        continue;
      }

      const number = safeNumber(value, NaN);

      if (Number.isFinite(number)) {
        return number;
      }
    }
  }

  return null;
}

function pickCollectionTotal(response = null, fallback = 0) {
  const candidates = getPayloadCandidates(response, COLLECTION_DEPTH_LIMIT);

  let zeroTotal = null;

  for (const candidate of candidates) {
    const total = readTotalFromObject(candidate);

    if (total === null) {
      continue;
    }

    if (total > 0) {
      return total;
    }

    if (total === 0) {
      zeroTotal = 0;
    }
  }

  return zeroTotal !== null ? zeroTotal : fallback;
}

function normalizeCollectionResponse(response = null) {
  const rawItems = pickCollectionItems(response);

  const items = rawItems
    .map((item) => normalizeFacturaSafe(item))
    .filter(hasOwnKeys);

  const total = Math.max(
    pickCollectionTotal(response, items.length),
    items.length
  );

  return {
    items,
    facturas: items,
    total,
    count: items.length,
    remoteCount: total,
    rawItems,
    raw: response,
  };
}

/* =========================================================
   DETAIL NORMALIZER
========================================================= */

function pickDetailFromCandidate(candidate = null) {
  const obj = safeObject(candidate, null);

  if (!obj || Array.isArray(obj)) {
    return null;
  }

  for (const key of DETAIL_OBJECT_KEYS) {
    const direct = obj[key];

    if (direct && typeof direct === "object" && !Array.isArray(direct)) {
      return direct;
    }
  }

  for (const outerKey of PAYLOAD_OBJECT_KEYS) {
    const nested = safeObject(obj[outerKey], null);

    if (!nested) {
      continue;
    }

    for (const key of DETAIL_OBJECT_KEYS) {
      const detail = nested[key];

      if (detail && typeof detail === "object" && !Array.isArray(detail)) {
        return detail;
      }
    }
  }

  return null;
}

function pickDetailPayload(response = null) {
  if (!response) {
    return null;
  }

  const candidates = getPayloadCandidates(response, DETAIL_DEPTH_LIMIT);

  for (const candidate of candidates) {
    const detail = pickDetailFromCandidate(candidate);

    if (detail) {
      return detail;
    }
  }

  for (const candidate of candidates) {
    if (isLikelyFacturaObject(candidate)) {
      return candidate;
    }
  }

  return null;
}

function normalizeDetailResponse(response = null) {
  const payload = pickDetailPayload(response);

  return payload
    ? normalizeFacturaSafe(payload)
    : null;
}

/* =========================================================
   STORE FALLBACK / MERGE
========================================================= */

function findStoreFacturaById(facturaId = "") {
  const id = safeText(facturaId, "");

  if (!id) {
    return null;
  }

  try {
    const direct = getFacturaByIdStore(id);

    if (direct) {
      return normalizeFacturaSafe(direct);
    }
  } catch {}

  return null;
}

function mergeDetailWithStore(remoteDetail = {}, facturaId = "") {
  const remote = safeObject(remoteDetail);

  if (!hasOwnKeys(remote)) {
    return null;
  }

  const storeItem = findStoreFacturaById(
    facturaId || getFacturaIdentitySafe(remote)
  );

  if (!storeItem) {
    return normalizeFacturaSafe(remote);
  }

  const merged = {
    ...storeItem,
    ...remote,

    raw: {
      ...safeObject(storeItem.raw),
      ...safeObject(remote.raw),
    },

    meta: {
      ...safeObject(storeItem.meta),
      ...safeObject(remote.meta),
    },
  };

  const normalizedMerged = normalizeFacturaSafe(merged);

  if (getIncidenciaIdSafe(normalizedMerged)) {
    return normalizedMerged;
  }

  const storeRelationId = getIncidenciaIdSafe(storeItem);

  if (!storeRelationId) {
    return normalizedMerged;
  }

  return preserveIncidenciaFields(
    {
      ...normalizedMerged,
      ticketId: storeRelationId,
      incidenciaId: storeRelationId,
    },
    storeItem
  );
}

function getCurrentRemoteCount(state = {}) {
  return safeNumber(
    first(
      state?.view?.remoteCount,
      state?.view?.totalCount,
      state?.remoteCount,
      0
    ),
    0
  );
}

function isCurrentCollectionToken(state = {}, token = 0) {
  return Boolean(
    state &&
      state.inflight &&
      safeNumber(state.inflight.collectionToken, 0) === token
  );
}

function isCurrentDetailToken(state = {}, token = 0, facturaId = "") {
  return Boolean(
    state &&
      state.inflight &&
      safeNumber(state.inflight.detailToken, 0) === token &&
      sameFacturaId(state.inflight.detailFacturaId, facturaId)
  );
}

function clearCollectionInflightIfCurrent(state = {}, token = 0) {
  if (!isCurrentCollectionToken(state, token)) {
    return false;
  }

  setFacturasInflightLoad(state, null);
  state.inflight.collectionToken = 0;

  return true;
}

function clearDetailInflightIfCurrent(state = {}, token = 0, facturaId = "") {
  if (!isCurrentDetailToken(state, token, facturaId)) {
    return false;
  }

  setFacturasInflightDetail(state, null);
  state.inflight.detailToken = 0;
  state.inflight.detailFacturaId = "";

  return true;
}

function applyCollectionSuccess({
  state,
  render,
  items = [],
  total = 0,
  response = null,
  token = 0,
  eventName = "facturas:load:success",
} = {}) {
  const finalItems = safeArray(items);
  const finalTotal = Math.max(safeNumber(total, finalItems.length), finalItems.length);
  const nowIso = new Date().toISOString();

  setFacturasStore(finalItems);
  setFacturasRemoteCount(state, finalTotal);

  setFacturasLoading(state, false);
  setFacturasRefreshing(state, false);
  setFacturasLoaded(state, true);
  setFacturasLastSyncAt(state, nowIso);
  clearFacturasError(state);

  safeEmit(eventName, {
    total: finalTotal,
    count: finalItems.length,
    items: finalItems,
    response,
    token,
    lastSyncAt: nowIso,
  });

  safeRender(render);

  return finalItems;
}

function applyCollectionError({
  state,
  render,
  error,
  token = 0,
} = {}) {
  const message = safeErrorMessage(
    error,
    "No se pudieron cargar las facturas."
  );

  setFacturasLoading(state, false);
  setFacturasRefreshing(state, false);
  setFacturasError(state, message);

  /*
    Evita skeleton infinito:
    la vista ya tiene estado de error + retry.
  */
  setFacturasLoaded(state, true);

  safeEmit("facturas:load:error", {
    error,
    message,
    token,
  });

  safeRender(render);
}

/* =========================================================
   COLLECTION
========================================================= */

export async function loadFacturasCollection({
  state,
  render,
  silent = false,
  force = false,
  query = {},
} = {}) {
  ensureStateShape(state);

  const inflight = getFacturasInflightLoad(state);

  if (inflight && !force) {
    return inflight;
  }

  const token = collectionLoadToken + 1;
  collectionLoadToken = token;

  state.inflight.collectionToken = token;

  const hasLoaded = isFacturasLoaded(state);
  const shouldRefresh = Boolean(silent || hasLoaded || force);

  clearFacturasError(state);

  if (shouldRefresh) {
    setFacturasRefreshing(state, true);
    setFacturasLoading(state, false);
  } else {
    setFacturasLoading(state, true);
    setFacturasRefreshing(state, false);
  }

  safeRender(render);

  const promise = (async () => {
    try {
      const finalQuery = safeObject(query);

      safeEmit("facturas:load:request", {
        query: finalQuery,
        silent,
        force,
        token,
      });

      const response = await fetchFacturasRequest(finalQuery);
      const normalized = normalizeCollectionResponse(response);

      const items = normalized.items;
      const total = normalized.total;

      safeLog("Colección normalizada.", {
        rawItems: normalized.rawItems.length,
        items: items.length,
        total,
        token,
        responseType: response && typeof response === "object"
          ? Object.keys(response)
          : typeof response,
      });

      if (!isCurrentCollectionToken(state, token)) {
        safeLog("Colección obsoleta recibida.", {
          token,
          currentToken: state?.inflight?.collectionToken,
          count: items.length,
          total,
        });

        /*
          Fallback controlado:
          si una respuesta vieja trae datos reales y el estado sigue vacío,
          se evita dejar la UI clavada en 0 registros.
        */
        if (items.length > 0 && getCurrentRemoteCount(state) <= 0) {
          safeWarn("Aplicando colección obsoleta como fallback porque el estado seguía vacío.", {
            token,
            count: items.length,
            total,
          });

          return applyCollectionSuccess({
            state,
            render,
            items,
            total,
            response,
            token,
            eventName: "facturas:load:stale-fallback",
          });
        }

        return items;
      }

      return applyCollectionSuccess({
        state,
        render,
        items,
        total,
        response,
        token,
      });
    } catch (error) {
      if (isCurrentCollectionToken(state, token)) {
        applyCollectionError({
          state,
          render,
          error,
          token,
        });
      }

      throw error;
    } finally {
      clearCollectionInflightIfCurrent(state, token);
    }
  })();

  setFacturasInflightLoad(state, promise);

  return promise;
}

/* =========================================================
   DETAIL
========================================================= */

export async function loadFacturaDetailById({
  state,
  render,
  facturaId = "",
  force = true,
} = {}) {
  ensureStateShape(state);

  const id = safeText(facturaId, "");

  if (!id) {
    return null;
  }

  const currentDetail = getFacturasDetailData(state);
  const currentDetailIds = getFacturaIdentityListSafe(currentDetail);

  if (
    !force &&
    currentDetail &&
    currentDetailIds.some((candidate) => sameFacturaId(candidate, id))
  ) {
    setFacturasDetailOpen(state, true);
    setFacturasDetailLoading(state, false);
    safeRender(render);
    return currentDetail;
  }

  const inflight = getFacturasInflightDetail(state);
  const inflightId = safeText(state?.inflight?.detailFacturaId, "");

  if (inflight && sameFacturaId(inflightId, id)) {
    return inflight;
  }

  const token = detailLoadToken + 1;
  detailLoadToken = token;

  state.inflight.detailToken = token;
  state.inflight.detailFacturaId = id;

  const storeFallback = findStoreFacturaById(id);

  setFacturasDetailOpen(state, true);
  setFacturasDetailLoading(state, true);

  if (storeFallback) {
    setFacturasDetailData(state, storeFallback);
  }

  safeRender(render);

  const promise = (async () => {
    try {
      safeEmit("facturas:detail:load:request", {
        facturaId: id,
        token,
        hasStoreFallback: Boolean(storeFallback),
      });

      const response = await fetchFacturaDetailRequest(id);
      const remoteFactura = normalizeDetailResponse(response);

      if (!remoteFactura) {
        throw new Error("FACTURA_DETAIL_EMPTY");
      }

      const factura = mergeDetailWithStore(remoteFactura, id);

      if (!factura) {
        throw new Error("FACTURA_DETAIL_EMPTY_AFTER_MERGE");
      }

      if (!isCurrentDetailToken(state, token, id)) {
        safeLog("Ignorando detalle obsoleto.", {
          facturaId: id,
          token,
          currentToken: state?.inflight?.detailToken,
          currentFacturaId: state?.inflight?.detailFacturaId,
        });

        return factura;
      }

      setFacturasDetailData(state, factura);
      setFacturasDetailOpen(state, true);
      setFacturasDetailLoading(state, false);

      safeEmit("facturas:detail:load:success", {
        facturaId: id,
        detail: factura,
        response,
        token,
      });

      safeRender(render);

      return factura;
    } catch (error) {
      if (isCurrentDetailToken(state, token, id)) {
        setFacturasDetailLoading(state, false);

        if (storeFallback) {
          setFacturasDetailData(state, storeFallback);
          setFacturasDetailOpen(state, true);

          safeEmit("facturas:detail:load:fallback", {
            facturaId: id,
            detail: storeFallback,
            error,
            token,
          });

          safeRender(render);

          return storeFallback;
        }

        if (!getFacturasDetailData(state)) {
          setFacturasDetailOpen(state, false);
        }

        safeEmit("facturas:detail:load:error", {
          facturaId: id,
          error,
          message: safeErrorMessage(
            error,
            "No se pudo cargar el detalle de la factura."
          ),
          token,
        });

        safeRender(render);
      }

      throw error;
    } finally {
      clearDetailInflightIfCurrent(state, token, id);
    }
  })();

  setFacturasInflightDetail(state, promise);

  return promise;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  loadFacturasCollection,
  loadFacturaDetailById,
};
