import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Http from "../src/core/http.js";
import { AppCore } from "../src/core/index.js";
import { notifyDomainChanged, onDomainChanged } from "../src/core/domain-events.js";
import {
  loadHomeDashboard, clearHomeDashboardCache, hydrateHomeFromCache,
} from "../src/views/home/home.api.js";
import {
  fetchClientesStatsRequest, loadClientesStats, fetchClientesPage, createCliente,
} from "../src/views/clientes/clientes.api.js";
import { fetchUsuariosStatsRequest } from "../src/views/usuarios/usuarios.api.js";
import { buildVm } from "../src/views/home/home.template.viewmodel.js";
import { stats } from "../src/views/home/home.template.stats.js";

// Execute real domain adapters, Home aggregation and presentation. Stub only
// transport; no network, production data or browser authentication is involved.
const originalGet = Http.get;
const originalPost = Http.post;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Unexpected network request"); };
const calls = [];
let responses;
function baseline() {
  return {
    "/api/tickets": {
      ok: true, responseContract: "v2", items: [
        { ticketId: "INC-20260908-FIX001", subject: "Fixture", status: "open" },
      ], total: 26, totalKnown: true, hasMore: true, nextCursor: "fixture-cursor",
    },
    "/api/facturas": { ok: true, items: [{ facturaId: "202600001", total: 12 }], total: 15 },
    "/api/facturas/stats": { ok: true, stats: {
      invoiceCount: 15, totalAmount: 100, paidAmount: 90, pendingAmount: 10,
    } },
    "/api/clientes/stats": { ok: true, total: 5 },
    "/api/users/stats": { ok: true, total: 14 },
  };
}
function reset(role = "admin") {
  clearHomeDashboardCache();
  calls.length = 0;
  responses = baseline();
  AppCore.setUser({ userId: `ON-HOME-${role}`, name: "Fixture", role, email: `${role}@example.test` });
}
const load = () => loadHomeDashboard({ force: true, cache: false, returnStaleOnError: false });
const values = (dashboard) => ["incidencias", "facturas", "clientes", "usuarios"].map((key) => dashboard.summary[key]);
const renderStats = (dashboard) => stats(buildVm({ role: "admin", dashboard }));
Http.get = async (path, options = {}) => {
  calls.push({ path, options });
  assert.ok(Object.hasOwn(responses, path), `Unexpected domain request: ${path}`);
  const response = responses[path];
  if (response instanceof Error) throw response;
  return typeof response === "function" ? response() : structuredClone(response);
};
Http.post = async () => { throw new Error("Unexpected mutation"); };

let scenarios = 0;
try {
  reset();
  let dashboard = await load();
  assert.deepEqual(values(dashboard), [26, 15, 5, 14]);
  assert.equal(dashboard.incidencias.length, 1, "the displayed page is smaller than the exact count");
  assert.equal(calls.length, 5, "Home consumes five domain reads, never individual user/client lookups");
  assert.equal(calls.find(({ path }) => path === "/api/tickets").options.query.includeTotal, true);
  for (const path of ["/api/clientes/stats", "/api/users/stats"]) {
    const call = calls.find((item) => item.path === path);
    assert.equal(call.options.query?.limit, undefined, "exact totals do not come from a one-row list");
    assert.ok(!call.options.source.startsWith("views.home"), "transport belongs to each domain");
  }
  assert.equal(dashboard.summary.totalInvoiced, 100);
  scenarios++;

  reset();
  responses["/api/tickets"].total = 1;
  responses["/api/tickets"].totalKnown = false;
  responses["/api/facturas/stats"] = {};
  responses["/api/clientes/stats"] = { ok: true, total: null };
  responses["/api/users/stats"] = { ok: true };
  dashboard = await load();
  assert.deepEqual(values(dashboard), [null, null, null, null], "unknown totals stay unknown despite available rows");
  const missingHtml = renderStats(dashboard);
  assert.equal((missingHtml.match(/class="home-stat-value">—</g) || []).length, 4);
  assert.equal((missingHtml.match(/class="home-stat-text">No disponible</g) || []).length, 4);
  scenarios++;

  reset();
  responses["/api/tickets"] = { ok: true, responseContract: "v2", items: [], total: 0, totalKnown: true, hasMore: false };
  responses["/api/facturas"] = { ok: true, items: [] };
  responses["/api/facturas/stats"] = { ok: true, stats: { invoiceCount: 0, totalAmount: 0, paidAmount: 0, pendingAmount: 0 } };
  responses["/api/clientes/stats"] = { ok: true, total: 0 };
  responses["/api/users/stats"] = { ok: true, total: 0 };
  dashboard = await load();
  assert.deepEqual(values(dashboard), [0, 0, 0, 0], "a confirmed empty domain remains a real zero");
  assert.equal((renderStats(dashboard).match(/class="home-stat-value">0</g) || []).length, 4);
  assert.equal(dashboard.summary.invoiceStatsAvailable, true);
  scenarios++;

  reset();
  responses["/api/tickets"].totalKnown = true;
  responses["/api/tickets"].totalIsLowerBound = true;
  dashboard = await load();
  assert.equal(dashboard.summary.incidencias, null, "a lower bound is never an exact total");
  scenarios++;

  for (const raw of [null, undefined, "", "unknown", true, {}, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    reset();
    responses["/api/clientes/stats"] = { ok: true, total: raw };
    responses["/api/users/stats"] = { ok: true, total: raw };
    for (const port of [fetchClientesStatsRequest, fetchUsuariosStatsRequest]) {
      const result = await port();
      assert.equal(result.total, null, `malformed counts must not become zero: ${String(raw)}`);
      assert.equal(result.totalKnown, false);
    }
    scenarios++;
  }

  for (const payload of [
    { total: null, totalCount: 99 },
    { total: 99, totalKnown: false },
    { total: 99, totalIsLowerBound: true },
  ]) {
    reset();
    responses["/api/clientes/stats"] = { ok: true, ...payload };
    responses["/api/users/stats"] = { ok: true, ...payload };
    for (const port of [fetchClientesStatsRequest, fetchUsuariosStatsRequest]) {
      assert.equal((await port()).total, null, "explicit unknown/lower-bound counts cannot be recovered from aliases");
    }
    scenarios++;
  }

  reset();
  responses["/api/facturas/stats"] = { ok: true, stats: { invoiceCount: null, countTotal: 99 } };
  dashboard = await load();
  assert.equal(dashboard.summary.facturas, null, "an explicit unknown invoice count does not fall through to aliases or list totals");
  scenarios++;

  reset();
  responses["/api/tickets"] = Object.assign(new Error("Tickets unavailable"), { status: 503 });
  responses["/api/facturas/stats"] = Object.assign(new Error("Billing unavailable"), { status: 503 });
  responses["/api/clientes/stats"] = Object.assign(new Error("Clients unavailable"), { status: 503 });
  responses["/api/users/stats"] = Object.assign(new Error("Users unavailable"), { status: 503 });
  dashboard = await load();
  assert.deepEqual(values(dashboard), [null, null, null, null]);
  assert.equal(dashboard.facturas.length, 1, "a partial failure preserves the available invoice list");
  assert.equal(dashboard.partial, true);
  assert.equal(dashboard.summary.totalInvoiced, null, "page amounts never replace unavailable global billing");
  scenarios++;

  reset("user");
  dashboard = await load();
  assert.deepEqual(values(dashboard), [26, 15, null, null]);
  assert.equal(calls.some(({ path }) => path === "/api/clientes/stats" || path === "/api/users/stats"), false);
  scenarios++;

  for (const domain of ["incidencias", "facturas", "clientes", "usuarios"]) {
    reset();
    await load();
    assert.ok(hydrateHomeFromCache());
    notifyDomainChanged(domain);
    assert.equal(hydrateHomeFromCache(), null, `${domain} changes invalidate Home even while unmounted`);
    scenarios++;
  }

  reset();
  let release;
  responses["/api/clientes/stats"] = () => new Promise((resolve) => { release = resolve; });
  const pending = load();
  const rejected = assert.rejects(pending, { code: "HOME_CONTEXT_CHANGED" });
  assert.equal(typeof release, "function");
  notifyDomainChanged("clientes");
  release({ ok: true, total: 5 });
  await rejected;
  assert.equal(hydrateHomeFromCache(), null, "a response started before a write cannot restore obsolete Home data");
  scenarios++;

  reset();
  responses["/api/clientes/page"] = { ok: true, items: [{ clienteId: "CON-FIXTURE", nombreFiscal: "Fixture" }] };
  await fetchClientesPage();
  const before = await loadClientesStats();
  assert.equal(before.total, 1);
  const exact = await fetchClientesStatsRequest();
  assert.equal(exact.total, 5);
  assert.deepEqual(await loadClientesStats(), before, "remote statistics do not replace page-local Clientes stats");
  scenarios++;

  const changes = [];
  const unsubscribe = onDomainChanged((domain) => changes.push(domain));
  try {
    Http.post = async () => ({ ok: true, clienteId: "CON-CREATED", userId: "ON-CLIENT", synced: true });
    await createCliente({ userId: "ON-CLIENT", tipo: "particular", nombreFiscal: "Fixture" });
    assert.deepEqual(changes, ["clientes"], "a confirmed mutation emits once at its domain boundary");
    Http.post = async () => ({ ok: false, code: "CLIENTE_CREATE_REJECTED" });
    await assert.rejects(createCliente({ userId: "ON-CLIENT", tipo: "particular", nombreFiscal: "Fixture" }));
    assert.deepEqual(changes, ["clientes"], "a rejected mutation emits no success signal");
  } finally {
    unsubscribe();
  }
  scenarios++;

  const source = await readFile(new URL("../src/views/home/home.api.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /import\s+Http\b|\bHttp\.(get|post|request)\s*\(|\bfetch\s*\(/,
    "Home must aggregate domain ports without owning transport");
  scenarios++;
} finally {
  Http.get = originalGet;
  Http.post = originalPost;
  globalThis.fetch = originalFetch;
  AppCore.setUser(null);
  clearHomeDashboardCache();
}
console.log(`Home domain counts: PASS · ${scenarios} scenarios · exact/unknown/zero · partial failures · confirmed invalidation · no network`);
