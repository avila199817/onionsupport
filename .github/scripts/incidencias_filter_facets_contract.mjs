import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildIncidenciasFilterFacetPresentation,
  getIncidenciasFacetFilterQuery,
  getIncidenciasFacetRequestQuery,
  getIncidenciasFilterFacetsSnapshot,
} from "../../src/views/incidencias/incidencias.filter-facets.js";

import {
  INCIDENCIAS_URGENT_FACET_SERVER_PRIORITY,
  isIncidenciasUrgentFacetPriority,
  matchesIncidenciasPriorityQuery,
  getIncidenciasPriorityPolicySnapshot,
} from "../../src/views/incidencias/incidencias.priority-policy.js";

import {
  computeIncidenciasStats,
} from "../../src/views/incidencias/incidencias.api.js";

import {
  getIncidenciasTemplateSnapshot,
  renderIncidenciasTemplate,
} from "../../src/views/incidencias/incidencias.template.js";

assert.deepEqual(getIncidenciasFacetFilterQuery("all"), {});
assert.deepEqual(getIncidenciasFacetFilterQuery("open"), { closed: false });
assert.deepEqual(getIncidenciasFacetFilterQuery("closed"), { closed: true });
assert.equal(INCIDENCIAS_URGENT_FACET_SERVER_PRIORITY, "high");
assert.deepEqual(
  getIncidenciasFacetFilterQuery("urgent"),
  { priority: "high" },
  "la faceta Urgentes debe consultar la prioridad productiva high"
);

/* =========================================================
   PRIORITY TRUTH · KPI === PILL === SERVER ROWS
========================================================= */

for (const value of ["high", "alta", "p1", "ALTA"] ) {
  assert.equal(
    isIncidenciasUrgentFacetPriority(value),
    true,
    `${value} debe pertenecer a la faceta productiva Urgentes`
  );
}

for (const value of ["urgent", "urgente", "critical", "critica", "p0", "medium"] ) {
  assert.equal(
    isIncidenciasUrgentFacetPriority(value),
    false,
    `${value} no puede inflar la faceta priority=high`
  );
}

const priorityUniverse = [
  { id: "HIGH-1", priority: "high" },
  { id: "HIGH-2", prioridad: "alta" },
  { id: "TRUE-URGENT", priority: "urgent" },
  { id: "CRITICAL-1", priority: "critical" },
  { id: "MEDIUM-1", priority: "medium" },
];

assert.deepEqual(
  priorityUniverse
    .filter((item) => matchesIncidenciasPriorityQuery(item, "high"))
    .map((item) => item.id),
  ["HIGH-1", "HIGH-2"],
  "la proyección local de priority=high debe ser idéntica al backend"
);

const canonicalStats = computeIncidenciasStats(priorityUniverse);
assert.equal(
  canonicalStats.urgent,
  2,
  "el KPI Urgentes no puede contar urgent/critical si el facet remoto es priority=high"
);

assert.deepEqual(
  getIncidenciasFacetRequestQuery("closed", {
    search: "José",
    limit: 1,
  }),
  {
    pageMode: "cursor",
    limit: 1,
    closed: true,
    q: "José",
  },
  "la búsqueda define el universo, pero no elimina las facetas hermanas"
);

const universeStats = {
  total: 8,
  open: 1,
  closed: 7,
  urgent: 0,
  attachments: 16,
  invoiceTotal: 785.1,
};

const facets = buildIncidenciasFilterFacetPresentation(
  {
    all: {
      total: 22,
      items: Array.from({ length: 8 }, (_value, index) => ({ id: `all-${index}` })),
      nextCursor: "opaque-next",
    },
    open: { total: 3, items: [{ id: "open-1" }] },
    closed: { total: 19, items: [{ id: "closed-1" }] },
    urgent: { total: 2, items: [{ id: "urgent-1" }] },
  },
  {
    universeStats,
    universeLoaded: 8,
  }
);

assert.deepEqual(facets.counts, {
  all: 22,
  open: 3,
  closed: 19,
  urgent: 2,
});
assert.equal(facets.stats.total, 22);
assert.equal(facets.stats.open, 3);
assert.equal(facets.stats.closed, 19);
assert.equal(facets.stats.urgent, 2);
assert.equal(
  facets.stats.attachments,
  16,
  "adjuntos conserva el universo Todas cargado y no el filtro activo"
);
assert.equal(facets.stats.invoiceTotal, 785.1);
assert.equal(facets.exact, true);
assert.equal(facets.aggregatePartial, true);

const activeOpenRows = [
  {
    id: "INC-FACET-1",
    subject: "Abierta uno",
    status: "open",
    priority: "medium",
  },
  {
    id: "INC-FACET-2",
    subject: "Abierta dos",
    status: "open",
    priority: "medium",
  },
  {
    id: "INC-FACET-3",
    subject: "Abierta tres",
    status: "open",
    priority: "medium",
  },
];

const input = {
  canonical: true,
  items: activeOpenRows,
  total: 3,
  filter: "open",
  stats: facets.stats,
  filterCounts: facets.counts,
  statsPartial: facets.aggregatePartial,
  filterFacetsExact: facets.exact,
};

const html = renderIncidenciasTemplate(input);
assert.match(html, /data-filter-facets-exact="true"/);
assert.match(html, /data-total-greater-than-items="true"/);
assert.match(html, /data-meta="total">[\s\S]*?22 solicitudes registradas/);
assert.match(html, /data-filter="all"[\s\S]*?<strong>22<\/strong>/);
assert.match(html, /data-filter="open"[\s\S]*?<strong>3<\/strong>/);
assert.match(html, /data-filter="closed"[\s\S]*?<strong>19<\/strong>/);
assert.match(html, /data-filter="urgent"[\s\S]*?<strong>2<\/strong>/);

const templateSnapshot = getIncidenciasTemplateSnapshot(input);
assert.deepEqual(templateSnapshot.filterCounts, facets.counts);
assert.equal(templateSnapshot.filterFacetsExact, true);
assert.equal(templateSnapshot.totalGreaterThanItems, true);

const serverFilteredUrgentRows = [
  {
    id: "URGENT-HIGH",
    subject: "Alta reconocida por el servidor",
    status: "closed",
    priority: "high",
  },
  {
    id: "URGENT-HIGH-2",
    subject: "Segunda prioridad alta",
    status: "closed",
    priority: "alta",
  },
];

const serverUrgentInput = {
  canonical: true,
  items: serverFilteredUrgentRows,
  total: 2,
  filter: "urgent",
  serverFilterApplied: true,
  stats: {
    total: 22,
    open: 3,
    closed: 19,
    urgent: 2,
    attachments: 32,
    invoiceTotal: 1496.6,
  },
  filterCounts: {
    all: 22,
    open: 3,
    closed: 19,
    urgent: 2,
  },
  filterFacetsExact: true,
};
const serverUrgentHtml = renderIncidenciasTemplate(serverUrgentInput);
assert.match(serverUrgentHtml, /data-server-filter-applied="true"/);
assert.match(serverUrgentHtml, /URGENT-HIGH/);
assert.match(serverUrgentHtml, /URGENT-HIGH-2/);
assert.match(serverUrgentHtml, /data-filter="urgent"[\s\S]*?<strong>2<\/strong>/);
const serverUrgentSnapshot = getIncidenciasTemplateSnapshot(serverUrgentInput);
assert.equal(serverUrgentSnapshot.serverFilterApplied, true);
assert.equal(serverUrgentSnapshot.filteredTotal, 2);
assert.equal(serverUrgentSnapshot.filterCounts.urgent, 2);

const facetSnapshot = getIncidenciasFilterFacetsSnapshot();
assert.equal(facetSnapshot.policy.selectedFacetExcludedFromCounts, true);
assert.equal(facetSnapshot.policy.searchDefinesFacetUniverse, true);
assert.equal(facetSnapshot.policy.urgentFacetMatchesServerExactly, true);
assert.equal(facetSnapshot.policy.urgentFacetServerPriority, "high");

const prioritySnapshot = getIncidenciasPriorityPolicySnapshot();
assert.equal(prioritySnapshot.urgentFacetMatchesServerExactly, true);
assert.equal(prioritySnapshot.urgentAndCriticalAreNotImplicitlyCountedAsHigh, true);

const controllerSource = await readFile(
  new URL("../../src/views/incidencias/index.impl.js", import.meta.url),
  "utf8"
);
const apiSource = await readFile(
  new URL("../../src/views/incidencias/incidencias.api.js", import.meta.url),
  "utf8"
);

for (const required of [
  "refreshFilterFacets",
  "filterFacetCache",
  "getIncidenciasFacetRequestQuery",
  "buildIncidenciasFilterFacetPresentation",
  "syncActiveFacetUniverseFromItems",
  "serverFilterApplied",
]) {
  assert.ok(controllerSource.includes(required), `falta integración de facetas: ${required}`);
}

for (const required of [
  "matchesIncidenciasPriorityQuery",
  "isIncidenciasUrgentFacetItem",
  "isFacetCountQuery",
  "source.force === true",
  "source.cache === false",
  "facetCountsBypassLocalProjection: true",
  "statsUseCanonicalUrgentFacet: true",
]) {
  assert.ok(apiSource.includes(required), `falta autoridad de prioridad en API: ${required}`);
}

assert.match(
  controllerSource,
  /loadIncidenciasPage\(\{[\s\S]*?query:\s*getIncidenciasFacetRequestQuery/,
  "las facetas deben usar el page loader cache-neutral"
);
assert.match(
  controllerSource,
  /function payload\(extra = \{\}\)[\s\S]*?filter,\s*serverFilterApplied:\s*\["open", "closed", "urgent"\]\.includes\(filter\),\s*search,[\s\S]*?function viewPayload/,
  "la autoridad remota debe llegar al payload que renderiza la tabla, no sólo al snapshot interno"
);

console.log(
  "Incidencias filter facets OK · KPI/pill/server rows share priority=high truth · urgent/critical cannot inflate count"
);
