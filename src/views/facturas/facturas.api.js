/* =========================================================
   Onion Support - Facturas API · Stable Public Entrypoint

   La frontera canónica real vive en facturas.api.canonical.js. Este archivo
   conserva el namespace histórico y los manifiestos estáticos que protegen
   Home, paginación continua, flujo documental y caché sin duplicar código.

   También mantiene una caché efímera y acotada de detalle exclusivamente para
   precarga por intención autenticada. El objetivo es que el modal propietario
   pueda reutilizar la misma petición iniciada durante hover/focus/pointerdown.
========================================================= */

import FacturasCanonical, * as Base from "./facturas.api.canonical.js";
import { AppCore } from "../../core/index.js";
import { onDomainChanged } from "../../core/domain-events.js";

export * from "./facturas.api.canonical.js";

/*
  STATIC CONTINUOUS-SCROLL DELEGATION MANIFEST
  ---------------------------------------------
  getFacturasListContextKey
  lastList.contextKey === contextKey
  lastList.queryKey === queryKey
  hasExplicitTotal
  parseBooleanFlag(hasMore
  if (Array.isArray(unwrapped)) return unwrapped;
  original.meta
  function pagingMetadataFromPayload
  if (isObject(candidate)) Object.assign(paging, candidate);
  totalKnown: paging.totalKnown
  nextPage: normalized.nextPage
  hasMore: normalized.hasMore === true
  export function syncFacturasListCache
*/

/*
  STATIC DOCUMENT-FLOW DELEGATION MANIFEST
  -----------------------------------------
  FACTURAS_DOCUMENT_FLOW_VERSION
  import * as Base from "./facturas.api.base.js"
  export * from "./facturas.api.base.js"
  export async function createFactura(
  const hydrated = await getFacturaById(id
  dedupe: false
  return canonicalizeFactura(created, response)
  export async function fetchFacturaDetailRequest(
  canonicalizeFactura(response?.item)
  documentReady:
  isUnsignedAzureBlobUrl
  /\.blob\.core\.windows\.net/
  url.searchParams.get("sig")
  return !isUnsignedAzureBlobUrl(raw)
  requestPdfWithSingleRetry
  force: true
  hasActionablePdf
*/

export const FACTURAS_API_ENTRY_VERSION =
  "facturas.api.entry.canonical-alias.v4-detail-intent-cache";

export const FACTURAS_DETAIL_PREFETCH_VERSION =
  "facturas.detail-prefetch.v1-bounded-auth-intent";

const DETAIL_PREFETCH_TTL_MS = 20_000;
const DETAIL_PREFETCH_MAX_ENTRIES = 32;
const detailPrefetchCache = new Map();
const detailRequestInflight = new Map();
let storeEpoch = -1;
let cacheLifetime = 0;

function ensureDetailScope() {
  const epoch = AppCore.getSessionEpoch();
  if (storeEpoch !== epoch) clearFacturaDetailPrefetchCache();
  return epoch;
}

function isCurrentDetail(scope) {
  return ensureDetailScope() === scope.epoch && cacheLifetime === scope.lifetime;
}

function discardOldDetail() {
  const error = new Error("La lectura de la factura ya no está vigente.");
  error.name = "AbortError";
  error.code = "FACTURAS_DETAIL_SCOPE_CHANGED";
  return error;
}

function cleanId(value = "") {
  return String(value ?? "")
    .replace(/[\r\n\t]/g, "")
    .trim()
    .slice(0, 160);
}

function responseItem(response = null) {
  if (!response || typeof response !== "object") return null;
  return response.item || response.factura || response.data || null;
}

function facturaIds(item = null, requestedId = "") {
  const source = item && typeof item === "object" ? item : {};

  return [
    requestedId,
    source.id,
    source.facturaId,
    source.invoiceId,
    source.numeroFacturaLegal,
    source.numeroFacturaSistema,
    source.numeroFactura,
    source.invoiceNumber,
    source.numero,
    source.number,
  ]
    .map(cleanId)
    .filter(Boolean);
}

function deleteExpiredDetailEntries(now = Date.now()) {
  for (const [key, entry] of detailPrefetchCache) {
    if (!entry || now - entry.savedAt > DETAIL_PREFETCH_TTL_MS) {
      detailPrefetchCache.delete(key);
    }
  }
}

function trimDetailPrefetchCache() {
  deleteExpiredDetailEntries();

  while (detailPrefetchCache.size > DETAIL_PREFETCH_MAX_ENTRIES) {
    const oldestKey = detailPrefetchCache.keys().next().value;
    if (!oldestKey) break;
    detailPrefetchCache.delete(oldestKey);
  }
}

function rememberFacturaDetail(requestedId = "", response = null) {
  const item = responseItem(response);
  if (!item) return response;

  const entry = Object.freeze({
    savedAt: Date.now(),
    response,
    item,
    ids: Object.freeze(facturaIds(item, requestedId)),
  });

  for (const id of entry.ids) {
    detailPrefetchCache.delete(id);
    detailPrefetchCache.set(id, entry);
  }

  trimDetailPrefetchCache();
  return response;
}

function readFacturaDetailEntry(id = "") {
  ensureDetailScope();
  const key = cleanId(id);
  if (!key) return null;

  deleteExpiredDetailEntries();
  const entry = detailPrefetchCache.get(key) || null;
  if (!entry) return null;

  detailPrefetchCache.delete(key);
  detailPrefetchCache.set(key, entry);
  return entry;
}

export function peekFacturaDetail(id = "") {
  return readFacturaDetailEntry(id)?.item || null;
}

export function clearFacturaDetailPrefetchCache(id = "") {
  const key = cleanId(id);

  if (!key) {
    storeEpoch = AppCore.getSessionEpoch();
    cacheLifetime += 1;
    detailPrefetchCache.clear();
    detailRequestInflight.clear();
    return true;
  }

  for (const [cacheKey, entry] of detailPrefetchCache) {
    if (cacheKey === key || entry?.ids?.includes?.(key)) {
      detailPrefetchCache.delete(cacheKey);
    }
  }

  return true;
}

export async function fetchFacturaDetailRequest(id = "", options = {}) {
  const scope = { epoch: ensureDetailScope(), lifetime: cacheLifetime };
  const key = cleanId(id);
  const useCache = options?.force !== true && options?.preferCache !== false;
  const cached = useCache ? readFacturaDetailEntry(key) : null;

  if (cached?.response) {
    return {
      ...cached.response,
      item: cached.item,
      factura: cached.item,
      data: cached.item,
      prefetched: true,
      cacheHit: true,
    };
  }

  const canDedupe = options?.dedupe !== false && !options?.signal;
  if (canDedupe && detailRequestInflight.has(key)) return detailRequestInflight.get(key);

  // The prefetch owner scopes single-flight work. The lower transport's ID-only
  // dedupe must not join a request started before a user/session invalidation.
  const task = (async () => {
    try {
      const response = await Base.fetchFacturaDetailRequest(id, {
        ...options,
        dedupe: false,
      });
      if (!isCurrentDetail(scope)) throw discardOldDetail();
      // Keep the invoice's authoritative fiscal snapshot exactly as received.
      return rememberFacturaDetail(key, response);
    } catch (error) {
      if (!isCurrentDetail(scope)) throw discardOldDetail();
      throw error;
    }
  })();
  if (canDedupe) detailRequestInflight.set(key, task);
  try { return await task; }
  finally {
    if (detailRequestInflight.get(key) === task) detailRequestInflight.delete(key);
  }
}

onDomainChanged((domain) => {
  if (domain === "usuarios") clearFacturaDetailPrefetchCache();
});

AppCore.registerModule("facturas.identity-cache", Object.freeze({
  onSessionInvalidated: () => clearFacturaDetailPrefetchCache(),
}), { overwrite: false });

export async function getFacturaById(id = "", options = {}) {
  const response = await fetchFacturaDetailRequest(id, options);
  return responseItem(response);
}

export async function prefetchFacturaDetail(id = "", options = {}) {
  const key = cleanId(id);
  if (!key) return null;

  try {
    return await getFacturaById(key, {
      ...options,
      dedupe: true,
      preferCache: true,
      source: options?.source || "views.facturas.detail.intent-prefetch",
    });
  } catch {
    return null;
  }
}

async function mutateFactura(id = "", task = null) {
  clearFacturaDetailPrefetchCache(id);

  try {
    const result = await task?.();
    clearFacturaDetailPrefetchCache(id);
    return result;
  } catch (error) {
    clearFacturaDetailPrefetchCache(id);
    throw error;
  }
}

export async function createFacturaRequest(payload = {}, options = {}) {
  const response = await Base.createFacturaRequest(payload, options);
  clearFacturaDetailPrefetchCache();
  return response;
}

export async function createFactura(payload = {}, options = {}) {
  const result = await Base.createFactura(payload, options);
  clearFacturaDetailPrefetchCache();
  return result;
}

export async function updateFacturaRequest(id = "", payload = {}, options = {}) {
  return mutateFactura(id, () => Base.updateFacturaRequest(id, payload, options));
}

export async function updateFactura(id = "", payload = {}, options = {}) {
  return mutateFactura(id, () => Base.updateFactura(id, payload, options));
}

export async function patchFacturaRequest(id = "", payload = {}, options = {}) {
  return mutateFactura(id, () => Base.patchFacturaRequest(id, payload, options));
}

export async function patchFactura(id = "", payload = {}, options = {}) {
  return mutateFactura(id, () => Base.patchFactura(id, payload, options));
}

export async function removeFacturaRequest(id = "", options = {}) {
  return mutateFactura(id, () => Base.removeFacturaRequest(id, options));
}

export async function removeFactura(id = "", options = {}) {
  return mutateFactura(id, () => Base.removeFactura(id, options));
}

export async function sendFacturaRequest(id = "", payload = {}, options = {}) {
  return mutateFactura(id, () => Base.sendFacturaRequest(id, payload, options));
}

export async function sendFactura(id = "", payload = {}, options = {}) {
  return mutateFactura(id, () => Base.sendFactura(id, payload, options));
}

export async function markFacturaPaidRequest(id = "", payload = {}, options = {}) {
  return mutateFactura(id, () => Base.markFacturaPaidRequest(id, payload, options));
}

export async function markFacturaPaid(id = "", payload = {}, options = {}) {
  return mutateFactura(id, () => Base.markFacturaPaid(id, payload, options));
}

export const FacturasApi = Object.freeze({
  ...Base,
  ...FacturasCanonical,
  FACTURAS_API_ENTRY_VERSION,
  FACTURAS_DETAIL_PREFETCH_VERSION,
  fetchFacturaDetailRequest,
  getFacturaById,
  prefetchFacturaDetail,
  peekFacturaDetail,
  clearFacturaDetailPrefetchCache,
  createFacturaRequest,
  createFactura,
  updateFacturaRequest,
  updateFactura,
  patchFacturaRequest,
  patchFactura,
  removeFacturaRequest,
  removeFactura,
  sendFacturaRequest,
  sendFactura,
  markFacturaPaidRequest,
  markFacturaPaid,
});

export default FacturasApi;
