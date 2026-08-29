/* =========================================================
   Onion Support - Facturas API · Stable Public Entrypoint

   La frontera canónica real vive en facturas.api.canonical.js. Este archivo
   conserva el namespace histórico y los manifiestos estáticos que protegen
   Home, paginación continua, flujo documental y caché sin duplicar código.
========================================================= */

import FacturasCanonical, * as Base from "./facturas.api.canonical.js";

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
  "facturas.api.entry.canonical-alias.v3";

export const FacturasApi = Object.freeze({
  ...Base,
  ...FacturasCanonical,
  FACTURAS_API_ENTRY_VERSION,
});

export default FacturasApi;
