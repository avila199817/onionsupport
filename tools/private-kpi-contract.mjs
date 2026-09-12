import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import Http from "../src/core/http.js";
import { AppCore } from "../src/core/index.js";
import { notifyDomainChanged, onDomainChanged } from "../src/core/domain-events.js";
import { exactTotal } from "../src/core/statistics.js";
import { loadFacturasStats, clearFacturasCache, hydrateFacturasFromCache } from "../src/views/facturas/facturas.api.base.js";
import { selectFacturasStats } from "../src/views/facturas/facturas.stats.js";
import { renderHeader, renderCards, renderFacturasTemplate, renderFacturasLoadingState } from "../src/views/facturas/facturas.template.js";
import { loadHomeDashboard, clearHomeDashboardCache, hydrateHomeFromCache, hasFreshHomeDashboard } from "../src/views/home/home.api.js";
import { clearIncidenciasCache, computeIncidenciasStats } from "../src/views/incidencias/incidencias.api.js";
import { buildIncidenciasFilterFacetPresentation, reconcileIncidenciasFilterFacetPresentation, getIncidenciasFacetRequestQuery } from "../src/views/incidencias/incidencias.filter-facets.js";
import { renderClientesTemplate } from "../src/views/clientes/clientes.template.js";

// Real transport adapters, projections and templates; only HTTP is replaced.
// Controller races execute the actual closure body with explicit lifecycle
// inputs. No credentials, production writes, or network requests are used.
const originalGet = Http.get;
const originalFetch = globalThis.fetch;
const calls = [];
let statsResponse = { ok: true, stats: { invoiceCount: 20, totalAmount: 100, paidAmount: 60, outstandingAmount: 40 } };
let ticketResponse = { ok: true, responseContract: "v2", items: [], total: 30, totalKnown: true, hasMore: false };
const clone = (value) => structuredClone(value);
const deferred = () => Promise.withResolvers();
const user = (id = "ON-KPI-1", role = "admin") => AppCore.setUser({ userId: id, name: "Fixture", email: `${id}@example.test`, role });
function reset() { clearFacturasCache(); clearIncidenciasCache(); clearHomeDashboardCache(); calls.length = 0; }
globalThis.fetch = async () => { throw new Error("Unexpected network request"); };
Http.get = async (path, options = {}) => {
  calls.push({ path, options });
  if (path === "/api/facturas/stats") return typeof statsResponse === "function" ? statsResponse(options) : clone(statsResponse);
  if (path === "/api/tickets") return typeof ticketResponse === "function" ? ticketResponse(options) : clone(ticketResponse);
  if (path === "/api/facturas") return { ok: true, items: [{ facturaId: "202600001", total: 9000 }], total: 20, totalKnown: true };
  if (path === "/api/clientes/stats" || path === "/api/users/stats") return { ok: true, total: 5 };
  throw new Error(`Unexpected domain endpoint: ${path}`);
};

try {
  user();
  const rows = [{ id: "FAC-PARTIAL", total: 9000, paymentStatus: "paid" }];
  for (const stats of [{ invoiceCount: 20 }, { invoiceCount: null, countTotal: 20 }, {}]) {
    const selected = selectFacturasStats(stats);
    assert.equal(selected.totalImporte, null);
    assert.equal(selected.paidCount, null);
    const html = renderHeader({ items: rows, total: 20, stats, statsAuthoritative: true });
    assert.match(html, /Importe global no disponible/);
    assert.doesNotMatch(html, /9[.,]000|9000|>null</, "missing global amounts cannot come from one loaded row");
    assert.match(html, /— \/ —/);
  }
  assert.equal(selectFacturasStats({ invoiceCount: 0, totalAmount: 0 }).total, 0);
  assert.equal(selectFacturasStats({ invoiceCount: 0, totalAmount: 0 }).totalImporte, 0);
  assert.equal(selectFacturasStats({ totalAmount: null, amount: 55 }).totalImporte, null);
  assert.equal(selectFacturasStats({ pendingAmount: 2 }).totalPendiente, null, "a missing overdue component is not an invented zero");
  assert.equal(selectFacturasStats({ pendingAmount: 2, overdueAmount: 3 }).totalPendiente, 5);
  assert.equal(selectFacturasStats({ outstandingAmount: null, pendingAmount: 2, overdueAmount: 3 }).totalPendiente, null);
  for (const flags of [{ totalKnown: false }, { totalIsLowerBound: true }, { meta: { totalKnown: false } }]) {
    const projected = selectFacturasStats({ invoiceCount: 20, paidCount: 7, pendingCount: 10, overdueCount: 3, ...flags });
    assert.deepEqual([projected.total, projected.paidCount, projected.pendingCount, projected.overdueCount], [null, null, null, null], "uncertain snapshot counts cannot masquerade as exact status totals");
  }
  assert.match(renderHeader({ items: rows }), /Pendientes cargadas/);
  const badgeCounts = (html) => Object.fromEntries(
    [...html.matchAll(/class="facturas-filter-pill[^"]*"[^>]*data-filter="([^"]+)"[^>]*>.*?<strong data-facturas-filter-count="true">(\d+)<\/strong><\/button>/g)]
      .map((match) => [match[1], Number(match[2])])
  );
  const globalCounts = { invoiceCount: 12000, pendingCount: 2000, paidCount: 9000, overdueCount: 1000 };
  const invoiceInput = { items: rows, total: 12000, statsAuthoritative: true, stats: globalCounts };
  for (const render of [renderFacturasTemplate, renderCards, renderFacturasLoadingState]) {
    const known = render(invoiceInput);
    assert.deepEqual(badgeCounts(known), { all: 12000, pending: 2000, paid: 9000, overdue: 1000 }, "badges and header use the same global projection on the first render");
    for (const partial of [{}, { ...globalCounts, paidCount: null, countPagadas: 7 }, { ...globalCounts, totalKnown: false }, { ...globalCounts, totalIsLowerBound: true }, { ...globalCounts, pendingCount: true }]) {
      assert.doesNotMatch(render({ ...invoiceInput, stats: partial }), /data-facturas-filter-count=/, "unknown refreshed metrics render no obsolete or invented badges");
    }
    assert.deepEqual(badgeCounts(render({ ...invoiceInput, stats: { invoiceCount: 0, pendingCount: 0, paidCount: 0, overdueCount: 0 } })), { all: 0, pending: 0, paid: 0, overdue: 0 });
  }
  assert.deepEqual(badgeCounts(renderFacturasTemplate({ ...invoiceInput, filter: "paid", search: "no loaded match" })), { all: 12000, pending: 2000, paid: 9000, overdue: 1000 }, "filtering the loaded table cannot redefine global KPI counts");
  const loadedInvoices = renderFacturasTemplate({ items: rows, total: 12000, search: "no loaded match" });
  assert.match(loadedInvoices, /Facturas cargadas/);
  assert.deepEqual(badgeCounts(loadedInvoices), { all: 1, pending: 0, paid: 1, overdue: 0 }, "the loaded fallback retains its scope independently of remote totals and active search");

  for (const response of [{ ok: false, stats: { invoiceCount: 99 } }, { success: false, data: { stats: { invoiceCount: 99 } } }, { stats: { ok: false, invoiceCount: 99 } }]) {
    reset(); statsResponse = response;
    await assert.rejects(loadFacturasStats(), { code: "FACTURAS_STATS_REJECTED" });
  }
  reset(); statsResponse = { ok: true, totalKnown: false, stats: { invoiceCount: 99 } };
  assert.equal(selectFacturasStats(await loadFacturasStats()).total, null);
  for (const flags of [{ meta: { totalKnown: false } }, { pagination: { totalIsLowerBound: true } }]) {
    reset(); statsResponse = { ok: true, ...flags, data: { stats: { invoiceCount: 99, paidCount: 7 } } };
    const projected = selectFacturasStats(await loadFacturasStats());
    assert.equal(projected.total, null);
    assert.equal(projected.paidCount, null, "envelope metadata survives domain normalization");
  }
  reset(); statsResponse = { ok: true, stats: { invoiceCount: 0, totalAmount: 0 } };
  assert.equal(selectFacturasStats(await loadFacturasStats()).totalImporte, 0);

  reset();
  let pending = deferred(); statsResponse = () => pending.promise;
  const shared1 = loadFacturasStats({ query: { year: 2026 } });
  const shared2 = loadFacturasStats({ query: { year: 2026 } });
  assert.equal(calls.length, 1, "same session/query/revision shares the domain request");
  pending.resolve({ stats: { invoiceCount: 6 } });
  assert.deepEqual(await shared1, await shared2);
  assert.equal(hydrateFacturasFromCache().stats.total, 0, "scoped server stats never become another list's cached metrics");

  for (const invalidate of [() => user("ON-KPI-2"), () => user("ON-KPI-2", "user"), () => notifyDomainChanged("facturas"), clearFacturasCache]) {
    reset(); pending = deferred(); statsResponse = () => pending.promise;
    const old = loadFacturasStats();
    const rejected = assert.rejects(old, { code: "FACTURAS_STATS_CONTEXT_CHANGED" });
    invalidate();
    statsResponse = { stats: { invoiceCount: 7 } };
    assert.equal((await loadFacturasStats()).invoiceCount, 7, "new scope cannot dedupe with the old request");
    pending.resolve({ stats: { invoiceCount: 99 } });
    await rejected;
  }

  user(); reset();
  statsResponse = ({ query }) => ({ stats: { invoiceCount: query.year || 20, totalAmount: query.year || 100 } });
  const canonical = await loadHomeDashboard();
  assert.equal(canonical.summary.facturas, 20);
  const scopedOptions = { facturasStatsOptions: { query: { year: 2025 } } };
  assert.equal(hasFreshHomeDashboard(scopedOptions), false);
  const scoped = await loadHomeDashboard(scopedOptions);
  assert.equal(scoped.summary.facturas, 2025);
  assert.equal(scoped.cached, false);
  assert.equal(hydrateHomeFromCache().summary.facturas, 20, "a filtered read cannot replace the standard Home cache");
  assert.equal((await loadHomeDashboard()).summary.facturas, 20);
  const scopedPair = await Promise.all([2023, 2024].map((year) => loadHomeDashboard({ facturasStatsOptions: { query: { year } } })));
  assert.deepEqual(scopedPair.map((dashboard) => dashboard.summary.facturas), [2023, 2024]);
  ticketResponse = ({ query }) => ({ ok: true, responseContract: "v2", items: [], total: query.closed ? 8 : 30, totalKnown: true, hasMore: false });
  assert.equal((await loadHomeDashboard({ ticketsQuery: { closed: true } })).summary.incidencias, 8);
  assert.equal(hydrateHomeFromCache().summary.incidencias, 30);
  AppCore.setUser(null); user();
  assert.equal(hydrateHomeFromCache(), null, "logout/relogin of the same user is a new cache lifetime");

  const loadedStats = { total: 2, open: 1, closed: 1, urgent: 0, invoiceTotal: 9 };
  const exactResponses = Object.fromEntries(["all", "open", "closed", "urgent"].map((key) => [key, { total: key === "all" ? 20 : 4, totalKnown: true, items: [] }]));
  const exact = buildIncidenciasFilterFacetPresentation(exactResponses, { universeStats: loadedStats, universeLoaded: 2 });
  assert.equal(exact.exact, true);
  for (const invalid of [{ total: 8, totalKnown: false }, { total: 8, totalIsLowerBound: true }, { total: "unexpected" }, { total: null }, { total: true }, { total: 8, pagination: { totalKnown: false } }]) {
    const partial = buildIncidenciasFilterFacetPresentation({ ...exactResponses, open: invalid }, { universeStats: loadedStats, universeLoaded: 2 });
    assert.equal(partial.exact, false);
    assert.equal(partial.aggregatePartial, true);
    assert.deepEqual(partial.counts, { all: 2, open: 1, closed: 1, urgent: 0 }, "unavailable remote facets fall back only to the loaded universe");
    const reconciled = reconcileIncidenciasFilterFacetPresentation(exact, "open", invalid);
    assert.equal(reconciled.exact, false);
    assert.deepEqual(reconciled.counts, partial.counts);
  }
  const empty = buildIncidenciasFilterFacetPresentation(Object.fromEntries(Object.keys(exactResponses).map((key) => [key, { total: 0, totalKnown: true, items: [] }])));
  assert.equal(empty.exact, true);
  assert.equal(empty.counts.all, 0);

  const controllerSource = await readFile(new URL("../src/views/incidencias/index.impl.js", import.meta.url), "utf8");
  const start = controllerSource.indexOf("  async function refreshFilterFacets(");
  const end = controllerSource.indexOf("\n  function renderWithFilteredItems", start);
  assert.ok(start > 0 && end > start);
  const delayedFacets = deferred();
  let facetRequests = 0;
  const context = vm.createContext({
    filterFacetCache: new Map(), filterFacetSeq: 0, filterFacetController: null,
    filterFacetSearchKey: () => "", filter: "all", items: [], destroyed: false,
    mounted: false, loading: false, listQueryPending: false, serverSearch: "", INCIDENCIAS_LIST_LIMIT: 50,
    AbortController, Date, safeArray: (value) => Array.isArray(value) ? value : [], cleanText: (value = "") => String(value ?? "").trim(),
    computeIncidenciasStats, buildIncidenciasFilterFacetPresentation, reconcileIncidenciasFilterFacetPresentation, getIncidenciasFacetRequestQuery, exactTotal,
    loadIncidenciasPage: () => { facetRequests++; return delayedFacets.promise; }, renderWithFilteredItems: () => {},
  });
  vm.runInContext(controllerSource.slice(start, end) + "\nglobalThis.refresh = refreshFilterFacets;", context);
  const obsoleteFacets = context.refresh({ force: true });
  const oldController = context.filterFacetController;
  const freshFacets = await context.refresh({ baseResponse: { items: [{ status: "open" }], total: 1, totalKnown: true, hasMore: false } });
  assert.equal(freshFacets.counts.all, 1);
  assert.equal(oldController.signal.aborted, true, "complete-page fast path cancels preceding facet reads");
  delayedFacets.resolve({ total: 99, totalKnown: true, items: [], hasMore: true });
  assert.equal(await obsoleteFacets, null);
  assert.equal(context.filterFacetCache.get("").counts.all, 1, "late remote counts cannot overwrite complete fresh data");
  assert.equal(facetRequests, 4, "complete first page adds zero requests");
  context.filterFacetCache.clear(); facetRequests = 0;
  context.loadIncidenciasPage = async () => { facetRequests++; return { items: [], total: null, totalKnown: false }; };
  const unknown = await context.refresh({ baseResponse: { items: [], total: null }, force: true });
  assert.notEqual(unknown.source, "complete-first-page");
  assert.equal(unknown.exact, false);
  assert.ok(facetRequests > 0, "empty unknown response cannot claim a complete zero universe");

  // The actual Facturas refresh and domain listener must discard an old total
  // even while a create modal postpones the visual list refresh.
  reset(); pending = deferred(); statsResponse = () => pending.promise;
  const invoiceSource = await readFile(new URL("../src/views/facturas/index.js", import.meta.url), "utf8");
  const refreshStart = invoiceSource.indexOf("  async function refreshAuthoritativeStats(");
  const refreshEnd = invoiceSource.indexOf("\n  function payload(", refreshStart);
  const listener = invoiceSource.match(/unsubscribeDomain = onDomainChanged\(\(domain\) => \{([\s\S]*?)\n      \}\);/);
  assert.ok(refreshStart > 0 && refreshEnd > refreshStart && listener);
  const invoiceContext = vm.createContext({
    destroyed: false, detailOnly: false, authoritativeStats: null, authoritativeStatsLoading: false,
    authoritativeStatsSeq: 0, authoritativeStatsDirty: false, creating: true, domainDirty: false,
    safeObject: (value, fallback) => value && typeof value === "object" ? value : fallback,
    loadFacturasStats, onDomainChanged, render: () => {}, refreshChangedDomain: () => {},
  });
  vm.runInContext(invoiceSource.slice(refreshStart, refreshEnd) + `\nglobalThis.refresh = refreshAuthoritativeStats; globalThis.unsubscribe = onDomainChanged((domain) => {${listener[1]}\n});`, invoiceContext);
  try {
    const oldRefresh = invoiceContext.refresh();
    notifyDomainChanged("facturas");
    assert.equal(invoiceContext.domainDirty, true);
    assert.equal(invoiceContext.authoritativeStatsDirty, true);
    pending.resolve({ stats: { invoiceCount: 99 } });
    await oldRefresh;
    assert.equal(invoiceContext.authoritativeStats.invoiceCount, undefined);
    statsResponse = { stats: { invoiceCount: 2 } };
    await invoiceContext.refresh();
    assert.equal(invoiceContext.authoritativeStats.invoiceCount, 2);
    statsResponse = () => { throw new Error("unavailable"); };
    await invoiceContext.refresh();
    assert.equal(invoiceContext.authoritativeStats.invoiceCount, undefined, "failed refresh does not retain a silently obsolete global count");
  } finally { invoiceContext.unsubscribe(); }

  const clientsHtml = renderClientesTemplate({ items: [{ clienteId: "C1", status: "active" }, { clienteId: "C2", status: "pending" }], total: 70, totalKnown: true });
  assert.match(clientsHtml, /70 clientes/);
  assert.match(clientsHtml, /Resumen de registros cargados/);
  assert.match(clientsHtml, /clientes-stat-value">2</, "the shared model counts loaded rows independently of the remote total");
} finally {
  Http.get = originalGet;
  globalThis.fetch = originalFetch;
  AppCore.setUser(null);
  clearHomeDashboardCache(); clearFacturasCache(); clearIncidenciasCache();
}
console.log("Private KPI: PASS · shared global projections · zero/unknown/partial · session/query isolation · rejected/late stats · facet fast-path races · confirmed cross-view invalidation");
