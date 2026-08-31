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

export const INCIDENCIAS_FILTER_FACETS_VERSION =
  "incidencias.filter-facets.v2-priority-truth";

export const INCIDENCIAS_FILTER_FACET_KEYS = Object.freeze([
  "all",
  "open",
  "closed",
  "urgent",
]);

function object(value = null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function array(value = null) {
  return Array.isArray(value) ? value : [];
}

function text(value = "") {
  return String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function number(value = 0, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeIncidenciasFilterFacet(value = "all") {
  const key = text(value).toLowerCase();
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
    limit: Math.max(1, Math.trunc(number(limit, 1))),
    ...getIncidenciasFacetFilterQuery(value),
  };
  const normalizedSearch = text(search);
  if (normalizedSearch) query.q = normalizedSearch;
  return query;
}

export function getIncidenciasFacetTotal(response = {}, fallback = 0) {
  const source = object(response);
  const rows = array(source.items);
  const candidate = source.total;

  if (candidate !== null && candidate !== undefined && candidate !== "") {
    return Math.max(rows.length, Math.trunc(number(candidate, rows.length)));
  }

  return Math.max(rows.length, Math.trunc(number(fallback, rows.length)));
}

export function mergeIncidenciasFacetStats(
  universeStats = {},
  counts = {}
) {
  const stats = object(universeStats);
  const facets = object(counts);

  return Object.freeze({
    ...stats,
    total: Math.max(0, number(facets.all, stats.total || 0)),
    open: Math.max(0, number(facets.open, stats.open || 0)),
    closed: Math.max(0, number(facets.closed, stats.closed || 0)),
    urgent: Math.max(0, number(facets.urgent, stats.urgent || 0)),
  });
}

export function buildIncidenciasFilterFacetPresentation(
  responses = {},
  {
    universeStats = {},
    universeLoaded = null,
  } = {}
) {
  const source = object(responses);
  const fallback = object(universeStats);
  const allResponse = object(source.all);
  const allItems = array(allResponse.items);
  const loaded = universeLoaded === null
    ? allItems.length
    : Math.max(0, Math.trunc(number(universeLoaded, allItems.length)));

  const counts = Object.freeze({
    all: getIncidenciasFacetTotal(allResponse, fallback.total),
    open: getIncidenciasFacetTotal(source.open, fallback.open),
    closed: getIncidenciasFacetTotal(source.closed, fallback.closed),
    urgent: getIncidenciasFacetTotal(source.urgent, fallback.urgent),
  });

  const exact = INCIDENCIAS_FILTER_FACET_KEYS.every((key) => {
    const response = object(source[key]);
    return response.total !== null &&
      response.total !== undefined &&
      response.total !== "";
  });

  return Object.freeze({
    counts,
    stats: mergeIncidenciasFacetStats(fallback, counts),
    exact,
    aggregatePartial: Boolean(
      allResponse.nextCursor ||
      allResponse.pagination?.nextCursor ||
      counts.all > loaded
    ),
    universeLoaded: loaded,
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
});
