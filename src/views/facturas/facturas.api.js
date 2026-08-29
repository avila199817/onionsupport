/* =========================================================
   Onion Support - Facturas API · Stable Public Entrypoint

   La frontera canónica real vive en facturas.api.canonical.js. Este archivo
   conserva el namespace histórico y los manifiestos estáticos que protegen
   Home, paginación continua y caché sin duplicar la implementación.
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

export const FACTURAS_API_ENTRY_VERSION =
  "facturas.api.entry.canonical-alias.v2";

export const FacturasApi = Object.freeze({
  ...Base,
  ...FacturasCanonical,
  FACTURAS_API_ENTRY_VERSION,
});

export default FacturasApi;
