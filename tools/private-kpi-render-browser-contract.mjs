import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

// Native-browser source contract. Templates and statistics are unmodified ESM.
// Incidencias runs the real controller's DOM patch closure, extracted verbatim:
// no reimplementation of patching, observer enhancement, API, or list loader.
const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const facturasOnly = process.argv.includes("--facturas");
let patchModule = "";
if (!facturasOnly) {
  const source = await readFile(resolve(ROOT, "src/views/incidencias/index.impl.js"), "utf8");
  const extract = (start, end) => {
    const from = source.indexOf(start);
    assert.ok(from >= 0 && source.indexOf(start, from + start.length) < 0, `Unique controller boundary: ${start}`);
    const to = source.indexOf(end, from + start.length);
    assert.ok(to > from, `Controller end boundary: ${end}`);
    return source.slice(from, to);
  };
  const helpers = [
    extract("function isBrowser()", "function isDomNode("),
    extract("function cleanText(", "function multilineValue("),
    extract("function first(...values)", "function redact("),
  ].join("\n");
  const patch = extract("  function activeElementInside(", "  function syncCreateAlerts(");
  assert.match(patch, /function patchListDom\(/);
  patchModule = `${helpers}\nexport function createListPatch(host) {\n${patch}\nreturn patchListDom;\n}`;
}

const servedSources = new Set();
const serverErrors = [];
const fixture = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Private KPI render contract</title></head><body><main id="fixture-host"></main><script type="module">
  import { renderFacturasTemplate } from "/src/views/facturas/facturas.template.js";
  ${facturasOnly ? "" : `import { renderIncidenciasTemplate } from "/src/views/incidencias/incidencias.template.js";
  import { createListPatch } from "/@incidencias-patch.js";`}
  window.fixture = { renderFacturasTemplate ${facturasOnly ? "" : ", renderIncidenciasTemplate, createListPatch"} };
</script></body></html>`;
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  try {
    if (path === "/@fixture") {
      response.writeHead(200, { "Content-Type":"text/html; charset=utf-8" }).end(fixture);
      return;
    }
    if (path === "/favicon.ico") { response.writeHead(204).end(); return; }
    let body;
    if (path === "/@incidencias-patch.js" && !facturasOnly) body = patchModule;
    else {
      const target = resolve(ROOT, `.${path}`);
      assert.ok(target.startsWith(`${ROOT}/src/`) && path.endsWith(".js"), `Unexpected fixture request: ${path}`);
      body = await readFile(target, "utf8");
    }
    servedSources.add(path);
    response.writeHead(200, { "Content-Type":"text/javascript; charset=utf-8", "Cache-Control":"no-store" }).end(body);
  } catch (error) {
    serverErrors.push(`${path}: ${error.message}`);
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  let executablePath;
  for (const candidate of [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/opt/google/chrome/chrome", "/tmp/chromium"].filter(Boolean)) {
    try { await access(candidate); executablePath = candidate; break; } catch { /* next executable */ }
  }
  assert.ok(executablePath, "CHROME_BIN must identify a local Chromium executable");
  browser = await chromium.launch({ executablePath, headless:true, args:["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ serviceWorkers:"block" });
  const external = [];
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${origin}/@fixture`);
  await page.waitForFunction(() => Boolean(window.fixture));
  await page.evaluate(() => {
    // Install after Playwright's own injected observer has initialized.
    window.__observerConstructions = 0;
    const NativeObserver = window.MutationObserver;
    window.MutationObserver = class extends NativeObserver {
      constructor(callback) { super(callback); window.__observerConstructions += 1; }
    };
  });

  // Every transition and snapshot occurs in the same JavaScript task. Neither
  // MutationObserver delivery nor a later frame can repair missing markup.
  const invoices = await page.evaluate(() => {
    const host = document.querySelector("#fixture-host");
    const items = [{ id:"invoice-fixture", estadoPago:"paid", total:10, cliente:{ nombre:"Fixture" } }];
    const stats = { invoiceCount:81, pendingCount:9, paidCount:65, overdueCount:7, totalAmount:810, paidAmount:650, pendingAmount:90, overdueAmount:70 };
    const snapshots = [];
    const render = (overrides = {}) => {
      const oldBadge = host.querySelector("[data-facturas-filter-count='true']");
      host.innerHTML = window.fixture.renderFacturasTemplate({ items, stats, statsAuthoritative:true, ...overrides });
      const pills = [...host.querySelectorAll(".facturas-filter-pill")];
      snapshots.push({
        counts:pills.map((pill) => pill.querySelector("strong[data-facturas-filter-count='true']")?.textContent ?? null),
        active:pills.find((pill) => pill.getAttribute("aria-pressed") === "true")?.dataset.filter,
        search:host.querySelector("[data-facturas-search-input='true']")?.value,
        rows:host.querySelectorAll("[data-facturas-row='true']").length,
        oldBadgeRemoved:!oldBadge || !oldBadge.isConnected,
      });
    };
    render();
    render({ filter:"pending", search:"no matching invoice" });
    render({ stats:{ ...stats, pendingCount:null, countPendientes:99 } });
    render({ items:[], stats:{ invoiceCount:0, pendingCount:0, paidCount:0, overdueCount:0 } });
    render({ stats:{ ...stats, totalKnown:false } });
    return snapshots;
  });
  assert.deepEqual(invoices.map(({ counts }) => counts), [
    ["81", "9", "65", "7"], ["81", "9", "65", "7"],
    [null, null, null, null], ["0", "0", "0", "0"], [null, null, null, null],
  ], "Facturas renders authoritative counts synchronously and clears every badge when one count is unknown");
  assert.equal(invoices[1].active, "pending");
  assert.equal(invoices[1].search, "no matching invoice");
  assert.equal(invoices[1].rows, 0, "An empty filtered list does not replace global KPI counts");
  assert.ok(invoices.every(({ oldBadgeRemoved }) => oldBadgeRemoved), "Rerender removes previous badges");
  console.log("PASS Facturas: synchronous global counts, filtered search, known → unknown → zero → unknown");

  if (!facturasOnly) {
    const incidents = await page.evaluate(() => {
      const host = document.querySelector("#fixture-host");
      const patch = window.fixture.createListPatch(host);
      const base = { canonical:true, items:[], total:22, search:"fixture", filter:"open", statsPartial:true,
        stats:{ total:22, open:2, closed:1, urgent:1, attachments:3, invoiceTotal:42 },
        filterCounts:{ all:22, open:14, closed:8, urgent:3 } };
      host.innerHTML = window.fixture.renderIncidenciasTemplate(base);
      const root = host.querySelector("[data-incidencias-scope='true']");
      const search = host.querySelector("[data-incidencias-search-input='true']");
      const snapshots = [];
      const snapshot = (patched = null, oldCard = null) => {
        const currentRoot = host.querySelector("[data-incidencias-scope='true']");
        const cards = ["open", "closed", "urgent", "amount"].map((key) => {
          const card = currentRoot.querySelector(`[data-stat="${key}"]`);
          return { scope:card.dataset.statScope, label:card.querySelector(".incidencias-stat-label").textContent,
            text:card.querySelector(".incidencias-stat-text").textContent,
            value:card.querySelector(".incidencias-stat-value").textContent };
        });
        snapshots.push({ patched, scope:currentRoot.dataset.statsScope, cards,
          attachments:currentRoot.querySelector('[data-meta="attachments"] span:last-child').textContent,
          sameRoot:currentRoot === root, sameSearch:currentRoot.querySelector("[data-incidencias-search-input='true']") === search,
          oldCardRemoved:!oldCard || !oldCard.isConnected, focused:document.activeElement?.dataset.stat,
        });
      };
      root.querySelector('[data-stat="open"]').focus();
      snapshot();
      for (const next of [
        { ...base, filterFacetsExact:true, stats:{ ...base.stats, open:14, closed:8, urgent:3 } },
        { ...base, statsPartial:false, filterFacetsExact:true, stats:{ ...base.stats, open:14, closed:8, urgent:3, invoiceTotal:900, attachments:27 } },
        base,
      ]) {
        const oldCard = root.querySelector('[data-stat="open"]');
        const patched = patch(window.fixture.renderIncidenciasTemplate(next));
        snapshot(patched, oldCard);
      }
      return snapshots;
    });
    assert.deepEqual(incidents.map(({ scope }) => scope), ["loaded", "loaded", "complete", "loaded"]);
    const loadedLabels = ["Abiertas cargadas", "Cerradas cargadas", "Urgentes cargadas", "Importe cargado"];
    const completeLabels = ["Abiertas", "Cerradas", "Urgentes", "Importe asociado"];
    assert.deepEqual(incidents.map(({ cards }) => cards.map(({ label }) => label)), [loadedLabels, [...completeLabels.slice(0, 3), "Importe cargado"], completeLabels, loadedLabels]);
    assert.deepEqual(incidents.map(({ cards }) => cards.map(({ scope }) => scope)), [
      ["loaded", "loaded", "loaded", "loaded"], ["complete", "complete", "complete", "loaded"],
      ["complete", "complete", "complete", "complete"], ["loaded", "loaded", "loaded", "loaded"],
    ]);
    assert.deepEqual(incidents.map(({ attachments }) => attachments), ["3 adjuntos en cargadas", "3 adjuntos en cargadas", "27 adjuntos", "3 adjuntos en cargadas"]);
    assert.deepEqual(incidents.map(({ cards }) => cards.slice(0, 3).map(({ value }) => value)), [["2", "1", "1"], ["14", "8", "3"], ["14", "8", "3"], ["2", "1", "1"]]);
    assert.equal(incidents[2].cards[2].text, "Incidencias con prioridad alta.");
    assert.equal(incidents[0].cards[3].text, "Suma asociada únicamente a las incidencias ya cargadas.");
    assert.ok(incidents.slice(1).every(({ patched }) => patched === true), "The real controller patch succeeds without full-render fallback");
    assert.ok(incidents.every(({ sameRoot, sameSearch, oldCardRemoved, focused }) => sameRoot && sameSearch && oldCardRemoved && focused === "open"), "DOM patches preserve the root, search node and card focus while replacing stale KPI cards");
    console.log("PASS Incidencias: synchronous partial → exact facets → complete → partial using the real controller patch");
  }
  assert.equal(await page.evaluate(() => window.__observerConstructions), 0, "KPI rendering does not construct an observer");
  assert.ok(servedSources.has("/src/views/facturas/facturas.template.js"));
  assert.ok(servedSources.has("/src/views/facturas/facturas.stats.js"));
  if (!facturasOnly) assert.ok(servedSources.has("/@incidencias-patch.js"));
  assert.ok(![...servedSources].some((path) => /filter-counts|stats-scope|\.api(?:\.|\/)/.test(path)), "No retired enhancement or API is loaded");
  assert.deepEqual(external, [], "No external requests");
  assert.deepEqual(serverErrors, [], "No unexpected source/HTTP requests");
  assert.deepEqual(pageErrors, [], "No browser errors");
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
