import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { renderIncidenciasTemplate, renderIncidenciasLoadingState } from "../../src/views/incidencias/incidencias.template.js";
import { buildIncidenciasFilterFacetPresentation } from "../../src/views/incidencias/incidencias.filter-facets.js";

// Scope belongs to the template that already receives the controller's facet
// presentation. Inspect its first output, without a DOM repair pass.
const items = [{ id: "INC-SCOPE-1", subject: "Fixture", status: "open", priority: "high" }];
const stats = { total: 8, open: 1, closed: 7, urgent: 0, attachments: 16, invoiceTotal: 785.1 };
const input = { canonical: true, items, total: 22, stats };
const keys = ["open", "closed", "urgent", "amount"];
const card = (html, key) => {
  const markup = html.match(new RegExp(`data-stat="${key}"[^>]*>[\\s\\S]*?<\\/button>`))?.[0] || "";
  assert.ok(markup, `Card ${key} is rendered`);
  return {
    scope: markup.match(/data-stat-scope="([^"]+)"/)?.[1],
    label: markup.match(/class="incidencias-stat-label">([^<]*)/)?.[1],
    value: markup.match(/class="incidencias-stat-value">([^<]*)/)?.[1],
    text: markup.match(/class="incidencias-stat-text">([^<]*)/)?.[1],
  };
};
const loadedLabels = ["Abiertas cargadas", "Cerradas cargadas", "Urgentes cargadas", "Importe cargado"];
const completeLabels = ["Abiertas", "Cerradas", "Urgentes", "Importe asociado"];
const loadedText = ["Solicitudes activas entre las incidencias ya cargadas.", "Casos cerrados entre las incidencias ya cargadas.", "Prioridades altas entre las incidencias ya cargadas.", "Suma asociada únicamente a las incidencias ya cargadas."];
const completeText = ["Solicitudes activas, pendientes o en proceso.", "Casos resueltos o cerrados.", "Incidencias con prioridad alta.", "Ordenar incidencias de mayor a menor importe."];
for (const render of [renderIncidenciasTemplate, renderIncidenciasLoadingState]) {
  let expectedValues;
  for (const [statsPartial, filterFacetsExact] of [[true, false], [true, true], [false, true], [false, false]]) {
    const html = render({ ...input, statsPartial, filterFacetsExact });
    assert.match(html, new RegExp(`data-stats-scope="${statsPartial ? "loaded" : "complete"}"`));
    assert.match(html, new RegExp(`data-total-greater-than-items="${statsPartial}"`));
    const cards = keys.map((key) => card(html, key));
    const scopes = keys.map((key) => statsPartial && (key === "amount" || !filterFacetsExact) ? "loaded" : "complete");
    assert.deepEqual(cards.map(({ scope }) => scope), scopes);
    assert.deepEqual(cards.map(({ label }, index) => label), scopes.map((scope, index) => (scope === "loaded" ? loadedLabels : completeLabels)[index]));
    assert.deepEqual(cards.map(({ text }, index) => text), scopes.map((scope, index) => (scope === "loaded" ? loadedText : completeText)[index]));
    const values = cards.map(({ value }) => value);
    expectedValues ??= values;
    assert.deepEqual(values, expectedValues, "Copy changes never recalculate controller-owned metrics");
    assert.deepEqual(values.slice(0, 3), ["1", "7", "0"]);
    assert.ok(html.includes(`16 adjuntos${statsPartial ? " en cargadas" : ""}</span>`));
  }
  assert.match(render(input), /data-stats-scope="loaded"/, "Absent explicit scope preserves the remote-total fallback");
  assert.match(render({ ...input, total: items.length }), /data-stats-scope="complete"/);
}

const responses = Object.fromEntries(["all", "open", "closed", "urgent"].map((key) => [key, { total: key === "all" ? 22 : 3, totalKnown: true, items: [] }]));
const fromFacets = (facets, extra = {}) => renderIncidenciasTemplate({
  ...input, total: 3, filter: "open", serverFilterApplied: true,
  stats: facets.stats, filterCounts: facets.counts,
  statsPartial: facets.aggregatePartial, filterFacetsExact: facets.exact, ...extra,
});
const exact = buildIncidenciasFilterFacetPresentation(responses, { universeStats: stats, universeLoaded: 8 });
const exactHtml = fromFacets(exact);
assert.match(exactHtml, /22 solicitudes registradas/);
assert.equal(card(exactHtml, "closed").label, "Cerradas", "A complete selected filter does not change the aggregate universe");
assert.equal(card(exactHtml, "amount").label, "Importe cargado");
for (const flags of [{ totalKnown: false }, { totalIsLowerBound: true }, { total: null }, { meta: { totalKnown: false } }, { pagination: { totalIsLowerBound: true } }]) {
  const uncertain = buildIncidenciasFilterFacetPresentation({ ...responses, open: { ...responses.open, ...flags } }, { universeStats: stats, universeLoaded: 8 });
  const html = fromFacets(uncertain);
  assert.equal(card(html, "open").label, "Abiertas cargadas", "Unknown/lower-bound remote facets remain loaded");
  assert.equal(card(html, "open").value, "1", "Remote minima cannot replace the loaded count");
}
const zeroStats = Object.fromEntries(Object.keys(stats).map((key) => [key, 0]));
const zero = buildIncidenciasFilterFacetPresentation(Object.fromEntries(Object.keys(responses).map((key) => [key, { total: 0, totalKnown: true, items: [] }])), { universeStats: zeroStats, universeLoaded: 0 });
const zeroHtml = fromFacets(zero, { items: [], total: 0 });
assert.equal(card(zeroHtml, "open").label, "Abiertas");
assert.equal(card(zeroHtml, "open").value, "0", "An exact empty universe preserves explicit zero");
assert.equal(card(zeroHtml, "amount").label, "Importe asociado");

const boundarySource = await readFile(new URL("../../src/views/incidencias/index.js", import.meta.url), "utf8");
const templateSource = await readFile(new URL("../../src/views/incidencias/incidencias.template.js", import.meta.url), "utf8");
assert.doesNotMatch(boundarySource, /installIncidenciasStatsScope|uninstallStatsScope|INCIDENCIAS_STATS_SCOPE_VERSION/);
assert.doesNotMatch(templateSource, /\bMutationObserver\b|\bfetch\s*\(|\bHttp\.(?:get|post|put|patch|delete)\s*\(/);
await assert.rejects(access(new URL("../../src/views/incidencias/incidencias.stats-scope.js", import.meta.url)), { code: "ENOENT" });
console.log("Incidencias stats scope OK · template-owned first render · exact/loaded/zero/lower-bound · no observer or HTTP");
