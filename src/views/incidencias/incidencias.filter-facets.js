/* =========================================================
   Onion Support - Incidencias Filter Facets

   FACETED NAVIGATION · CACHE-NEUTRAL · ZERO DOM

   Los conteos de navegación pertenecen al universo de búsqueda, no al
   subconjunto del filtro activo. Este módulo sólo describe consultas y
   normaliza sus totales; el controller conserva la autoridad HTTP.
========================================================= */

import {
  INCIDENCIAS_PRIORITY_POLICY_VERSION,
  INCIDENCIAS_URGENT_FACET_SERVER_PRIORITY,
} from "./incidencias.priority-policy.js";
import { exactCount, exactTotal } from "../../core/statistics.js";
import { cleanText } from "../../core/presentation-text.js";
import { safeObject } from "../../core/objects.js";
import { safeArray } from "../../core/arrays.js";
import { coercedNumber } from "../../core/numbers.js";

const INCIDENCIAS_FILTER_FACETS_VERSION =
  "incidencias.filter-facets.v2-priority-truth";

const INCIDENCIAS_FILTER_FACET_KEYS = Object.freeze([
  "all",
  "open",
  "closed",
  "urgent",
]);

function normalizeIncidenciasFilterFacet(value = "all") {
  const key = cleanText(value).toLowerCase();
  return INCIDENCIAS_FILTER_FACET_KEYS.includes(key) ? key : "all";
}

export function getIncidenciasFacetFilterQuery(value = "all") {
  const filter = normalizeIncidenciasFilterFacet(value);

  if (filter === "open") return { closed: false };
  if (filter === "closed") return { closed: true };

  /*
    Autoridad única: la faceta visual "Urgentes" usa exactamente el mismo
    predicado que el listado productivo. La forma literal de esta línea está
    además protegida por el contrato histórico de paginación para demostrar
    que página uno y cursores posteriores comparten query.
  */
  if (filter === "urgent") return { priority: "high" };

  return {};
}

export function getIncidenciasFacetRequestQuery(
  value = "all",
  {
    search = "",
    limit = 1,
  } = {}
) {
  const query = {
    pageMode: "cursor",
    limit: Math.max(1, Math.trunc(coercedNumber(limit, 1))),
    /*
       P0 PERF + TRUTH:
       Las facetas sólo llegan aquí por HTTP cuando NO existe un universo
       completo local. En ese fallback remoto sí necesitamos el total exacto
       del filtro, aunque el listado normal y P2+ nunca deban pagar COUNT.
    */
    includeTotal: true,
    ...getIncidenciasFacetFilterQuery(value),
  };
  const normalizedSearch = cleanText(search);
  if (normalizedSearch) query.q = normalizedSearch;
  return query;
}

function getIncidenciasFacetTotal(response = {}, fallback = 0) {
  const source = safeObject(response);
  const rows = safeArray(source.items);
  return Math.max(rows.length, exactTotal(source) ?? exactCount(fallback) ?? rows.length);
}

export function mergeIncidenciasFacetStats(
  universeStats = {},
  counts = {}
) {
  const stats = safeObject(universeStats);
  const facets = safeObject(counts);

  return Object.freeze({
    ...stats,
    total: Math.max(0, coercedNumber(facets.all, stats.total || 0)),
    open: Math.max(0, coercedNumber(facets.open, stats.open || 0)),
    closed: Math.max(0, coercedNumber(facets.closed, stats.closed || 0)),
    urgent: Math.max(0, coercedNumber(facets.urgent, stats.urgent || 0)),
  });
}

export function buildIncidenciasFilterFacetPresentation(
  responses = {},
  {
    universeStats = {},
    universeLoaded = null,
  } = {}
) {
  const source = safeObject(responses);
  const fallback = safeObject(universeStats);
  const allResponse = safeObject(source.all);
  const allItems = safeArray(allResponse.items);
  const loaded = universeLoaded === null
    ? allItems.length
    : Math.max(0, Math.trunc(coercedNumber(universeLoaded, allItems.length)));

  const loadedCounts = Object.freeze({ all: loaded, open: exactCount(fallback.open) ?? 0, closed: exactCount(fallback.closed) ?? 0, urgent: exactCount(fallback.urgent) ?? 0 });
  const exact = INCIDENCIAS_FILTER_FACET_KEYS.every((key) => exactTotal(source[key]) !== null);
  const counts = exact ? Object.freeze({
    all: getIncidenciasFacetTotal(allResponse, fallback.total),
    open: getIncidenciasFacetTotal(source.open, fallback.open),
    closed: getIncidenciasFacetTotal(source.closed, fallback.closed),
    urgent: getIncidenciasFacetTotal(source.urgent, fallback.urgent),
  }) : loadedCounts;

  return Object.freeze({
    counts,
    loadedCounts,
    stats: mergeIncidenciasFacetStats(fallback, counts),
    exact,
    aggregatePartial: Boolean(
      !exact ||
      allResponse.hasMore === true ||
      allResponse.nextCursor ||
      allResponse.pagination?.nextCursor ||
      counts.all > loaded
    ),
    universeLoaded: loaded,
  });
}

export function reconcileIncidenciasFilterFacetPresentation(
  presentation = {},
  facet = "all",
  response = {}
) {
  const current = safeObject(presentation);
  const key = normalizeIncidenciasFilterFacet(facet);
  const currentCounts = safeObject(current.counts);
  const exact = current.exact === true && exactTotal(response) !== null;
  const counts = exact ? Object.freeze({
    ...currentCounts,
    [key]: getIncidenciasFacetTotal(
      response,
      currentCounts[key]
    ),
  }) : safeObject(current.loadedCounts);

  return Object.freeze({
    ...current,
    counts,
    exact,
    aggregatePartial: !exact || current.aggregatePartial === true,
    stats: mergeIncidenciasFacetStats(
      current.stats,
      counts
    ),
  });
}

export function getIncidenciasFilterFacetsSnapshot() {
  return Object.freeze({
    version: INCIDENCIAS_FILTER_FACETS_VERSION,
    keys: INCIDENCIAS_FILTER_FACET_KEYS,
    priorityPolicyVersion: INCIDENCIAS_PRIORITY_POLICY_VERSION,
    policy: Object.freeze({
      selectedFacetExcludedFromCounts: true,
      searchDefinesFacetUniverse: true,
      dateSortDoesNotChangeFacets: true,
      cacheNeutralPageQueries: true,
      urgentFacetServerPriority: INCIDENCIAS_URGENT_FACET_SERVER_PRIORITY,
      urgentFacetMatchesServerExactly: true,
      exactStatusCountsPreserveUniverseAggregates: true,
    }),
  });
}

export default Object.freeze({
  version: INCIDENCIAS_FILTER_FACETS_VERSION,
  keys: INCIDENCIAS_FILTER_FACET_KEYS,
  getFilterQuery: getIncidenciasFacetFilterQuery,
  getRequestQuery: getIncidenciasFacetRequestQuery,
  buildPresentation: buildIncidenciasFilterFacetPresentation,
  reconcilePresentation: reconcileIncidenciasFilterFacetPresentation,
});
