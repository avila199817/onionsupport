import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

// Native-browser source contract: the production template and shared statistics
// selector are unmodified ESM. No observer enhancement, API, or list loader.
const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const servedSources = new Set();
const serverErrors = [];
const fixture = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Private KPI render contract</title></head><body><main id="fixture-host"></main><script type="module">
  import { renderFacturasTemplate } from "/src/views/facturas/facturas.template.js";
  window.fixture = { renderFacturasTemplate };
</script></body></html>`;
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  try {
    if (path === "/@fixture") {
      response.writeHead(200, { "Content-Type":"text/html; charset=utf-8" }).end(fixture);
      return;
    }
    if (path === "/favicon.ico") { response.writeHead(204).end(); return; }
    const target = resolve(ROOT, `.${path}`);
    assert.ok(target.startsWith(`${ROOT}/src/`) && path.endsWith(".js"), `Unexpected fixture request: ${path}`);
    const body = await readFile(target, "utf8");
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

  assert.equal(await page.evaluate(() => window.__observerConstructions), 0, "KPI rendering does not construct an observer");
  assert.ok(servedSources.has("/src/views/facturas/facturas.template.js"));
  assert.ok(servedSources.has("/src/views/facturas/facturas.stats.js"));
  assert.ok(![...servedSources].some((path) => /filter-counts|stats-scope|\.api(?:\.|\/)/.test(path)), "No retired enhancement or API is loaded");
  assert.deepEqual(external, [], "No external requests");
  assert.deepEqual(serverErrors, [], "No unexpected source/HTTP requests");
  assert.deepEqual(pageErrors, [], "No browser errors");
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
