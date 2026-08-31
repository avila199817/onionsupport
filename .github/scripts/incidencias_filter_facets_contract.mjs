import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildIncidenciasFilterFacetPresentation,
  getIncidenciasFacetFilterQuery,
  getIncidenciasFacetRequestQuery,
  getIncidenciasFilterFacetsSnapshot,
} from "../../src/views/incidencias/incidencias.filter-facets.js";

import {
  getIncidenciasTemplateSnapshot,
  renderIncidenciasTemplate,
} from "../../src/views/incidencias/incidencias.template.js";

assert.deepEqual(getIncidenciasFacetFilterQuery("all"), {});
assert.deepEqual(getIncidenciasFacetFilterQuery("open"), { closed: false });
assert.deepEqual(getIncidenciasFacetFilterQuery("closed"), { closed: true });
assert.deepEqual(
  getIncidenciasFacetFilterQuery("urgent"),
  { priority: "high" },
  "la faceta Urgentes debe consultar la prioridad productiva high"
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

const facetSnapshot = getIncidenciasFilterFacetsSnapshot();
assert.equal(facetSnapshot.policy.selectedFacetExcludedFromCounts, true);
assert.equal(facetSnapshot.policy.searchDefinesFacetUniverse, true);
assert.equal(facetSnapshot.policy.highPriorityMapsToUrgentProductFacet, true);

const controllerSource = await readFile(
  new URL("../../src/views/incidencias/index.impl.js", import.meta.url),
  "utf8"
);

for (const required of [
  "refreshFilterFacets",
  "filterFacetCache",
  "getIncidenciasFacetRequestQuery",
  "buildIncidenciasFilterFacetPresentation",
  "syncActiveFacetUniverseFromItems",
]) {
  assert.ok(controllerSource.includes(required), `falta integración de facetas: ${required}`);
}

assert.match(
  controllerSource,
  /loadIncidenciasPage\(\{[\s\S]*?query:\s*getIncidenciasFacetRequestQuery/,
  "las facetas deben usar el page loader cache-neutral"
);

console.log(
  "Incidencias filter facets OK · Todas 22 · Abiertas 3 · Cerradas 19 · Urgentes 2 · active filter never erases sibling counts"
);
