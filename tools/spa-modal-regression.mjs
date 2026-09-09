import assert from "node:assert/strict";
import { access, mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "playwright-core";
import { png, pdf, webm } from "./spa-modal-media-fixtures.mjs";

// Exercise the actual Home templates, dispatcher, domain owners and attachment
// features against the existing isolated source harness. Only API/HTTP responses
// are fixtures. No live account, production endpoint or mutation is involved.
const fixture = spawn(process.execPath, ["tools/private-owner-modal-browser-contract.mjs", "--serve"], {
  cwd: new URL("../", import.meta.url), stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
fixture.stderr.on("data", (chunk) => { log += chunk; });
const origin = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Fixture did not start: ${log}`)), 15000);
  fixture.once("error", reject);
  fixture.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Fixture exited ${code}: ${log}`)); });
  fixture.stdout.on("data", (chunk) => {
    log += chunk;
    const match = log.match(/Private owner fixture: (http:\/\/127\.0\.0\.1:\d+)/);
    if (match) { clearTimeout(timer); resolve(match[1]); }
  });
});
let browser;
const failures = [];
const results = [];
const evidence = process.env.SPA_MODAL_EVIDENCE || "/tmp/spa-modal-evidence";
await mkdir(evidence, { recursive: true });
try {
  let executablePath;
  for (const path of [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"].filter(Boolean)) {
    try { await access(path); executablePath = path; break; } catch { /* next */ }
  }
  assert.ok(executablePath, "A local Chromium executable is required");
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
  const outside = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    // Chromium's built-in PDF viewer is local browser UI, not network egress.
    // Keep every HTTP(S) request outside the fixture origin blocked.
    if (url.protocol === "chrome:" || (
      url.protocol === "chrome-extension:" && url.hostname === "mhjfbmdgcfjbbpaeojofohoefgiehjai"
    )) return route.continue();
    if (url.origin !== origin) { outside.push(url.href); return route.abort(); }
    if (url.pathname.startsWith("/@media/")) {
      const kind = url.pathname.split("/").at(-1);
      const [contentType, body] = kind === "pdf" ? ["application/pdf", pdf] : kind === "webm" ? ["video/webm", webm] : ["image/png", png];
      return route.fulfill({ status: 200, contentType, body });
    }
    if (url.pathname === "/src/views/incidencias/incidencias.api.js") {
      const response = await route.fetch();
      const original = await response.text();
      const boundary = 'export const openIncidenciaAttachment = (...args) => window.__forbidden("openIncidenciaAttachment", args);';
      assert.equal(original.split(boundary).length, 2, "Replace only the named read-only /view boundary");
      return route.fulfill({ response, body: original.replace(boundary, "export const openIncidenciaAttachment = (params) => window.__attachmentRequest(params);") });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const panel = "[data-incidencias-modal-panel='true']";
  const viewer = "[data-incidencias-media-viewer='true']";
  const closeViewer = `${viewer} [data-detail-action='detail-preview-close']`;
  const attachment = (id) => `${panel} .incidencias-modal-view-btn[data-attachment-id='${id}']`;

  async function load(width = 1280, realHome = false) {
    errors.length = 0;
    outside.length = 0;
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/@fixture`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__fixtureReady === true);
    await page.evaluate(async (realHome) => {
      window.__mediaReads = [];
      window.__deferredMedia = new Set();
      window.__failNextMedia = false;
      window.__autoResolve = { incidencia: true, factura: true, cliente: true, usuario: true };
      const files = [
        { id: "image-one", name: "screenshot-one.png", contentType: "image/png", viewUrl: "/@media/png" },
        { id: "image-two", name: "screenshot-two.png", contentType: "image/png", viewUrl: "/@media/png?second=1" },
        { id: "document-pdf", name: "report.pdf", contentType: "application/pdf", viewUrl: "/@media/pdf" },
        { id: "video-webm", name: "recording.webm", contentType: "video/webm", viewUrl: "/@media/webm" },
        { id: "document-other", name: "notes.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", viewUrl: "/@media/document" },
      ].map((file) => ({ ...file, attachmentId: file.id, size: 1024 }));
      window.__fixtureData.incidencia.attachments = files;
      window.__fixtureData.factura.numeroFacturaLegal = "2026/00123";
      window.__attachmentRequest = (params) => {
        const file = files.find(({ id }) => id === params.attachmentId);
        if (!file) return Promise.reject(new Error("Unknown fixture attachment"));
        const entry = { ...params, file };
        window.__mediaReads.push(entry);
        if (window.__failNextMedia) {
          window.__failNextMedia = false;
          return Promise.reject(Object.assign(new Error("No tienes permiso para visualizar este adjunto."), { status: 403 }));
        }
        if (window.__deferredMedia.has(file.id)) return new Promise((resolve) => { entry.resolve = () => resolve(file); });
        return Promise.resolve(file);
      };
      if (realHome) {
        const { renderHomeTemplate } = await import("/src/views/home/home.template.js");
        const ticket = window.__fixtureData.incidencia;
        const invoice = window.__fixtureData.factura;
        window.__homeNode.innerHTML = renderHomeTemplate({ role: "admin", user: { name: "Operadora de prueba" }, dashboard: {
          incidencias: [ticket], facturas: [invoice], summary: { incidencias: 1, facturas: 1 },
          activity: [{ type: "ticket", entityId: ticket.id, title: ticket.subject }, { ...invoice, type: "invoice", title: "Factura de prueba" }],
        } });
        const styles = document.createElement("link");
        styles.rel = "stylesheet";
        styles.href = "/src/css/views/home/index.css";
        document.head.append(styles);
      }
      window.__preservedHome = window.__homeNode.innerHTML;
      window.__preservedPath = location.href;
      window.__preservedHistory = history.length;
    }, realHome);
  }
  async function openIncident() {
    await page.locator("#open-incidencia").click();
    await page.locator(`${panel} [data-detail-field='comment']`).waitFor({ state: "visible" });
  }
  async function mediaOpen(id = "image-one") {
    await page.locator(attachment(id)).click();
    await page.locator(viewer).waitFor({ state: "visible" });
    await page.waitForFunction(({ viewer, id }) => document.querySelector(`${viewer} [data-preview-attachment-id]`)?.dataset.previewAttachmentId === id, { viewer, id });
  }
  async function invariant() {
    assert.deepEqual(errors, [], "No uncaught browser error");
    assert.deepEqual(outside, [], "No request leaves the isolated fixture origin");
    const state = await page.evaluate(() => ({
      unchanged: location.href === window.__preservedPath && history.length === window.__preservedHistory && window.__homeNode.innerHTML === window.__preservedHome,
      forbidden: window.__forbiddenCalls,
    }));
    assert.equal(state.unchanged, true, "Opening media never replaces Home, changes route or writes history");
    assert.deepEqual(state.forbidden, [], "No mutation/navigation or unowned HTTP call");
  }
  async function scenario(name, run) {
    try {
      await run();
      await invariant();
      results.push({ name, result: "PASS" });
      console.log(`PASS SPA ${name}`);
    } catch (error) {
      const state = await page.evaluate(() => ({
        errors: window.__errors,
        overlay: window.__overlay?.getSnapshot(),
        requests: window.__requests?.map(({ type, id }) => ({ type, id })),
        media: window.__mediaReads?.map(({ ticketId, attachmentId }) => ({ ticketId, attachmentId })),
        dialogs: [...document.querySelectorAll("[role='dialog']")].map((node) => ({ text: node.textContent.slice(0, 500), hidden: node.hidden, inert: node.hasAttribute("inert") })),
      })).catch(() => null);
      const message = `${name}: ${error.message}`;
      failures.push(message);
      results.push({ name, result: "FAIL", message, state, errors: [...errors], outside: [...outside] });
      console.error(`FAIL SPA ${message}\n${JSON.stringify(state)}`);
      await page.screenshot({ path: `${evidence}/failure-${results.length}.png`, fullPage: true }).catch(() => {});
    }
  }

  for (const source of ["home.invoices", "home.activity"]) {
    await scenario(`real Home ${source}: canonical ID differs from visible invoice number`, async () => {
      await load(1280, true);
      const trigger = page.locator(`[data-home-entity-source='${source}'][data-entity-type='factura']`);
      assert.equal(await trigger.getAttribute("data-entity-id"), "fixture-factura-1", "Never request detail by its display label");
      assert.match(await trigger.innerText(), /2026\/00123/);
      await trigger.locator(".home-entity-title").click();
      await page.locator("[data-facturas-detail-modal='true']").waitFor({ state: "visible" });
      await page.waitForFunction(() => window.__requests.some(({ type, id }) => type === "factura" && id === "fixture-factura-1"));
      await page.keyboard.press("Escape");
      await page.locator("[data-facturas-detail-modal='true']").waitFor({ state: "detached" });
    });
  }
  await scenario("real Home nested incident icon opens the canonical owner on a cold load", async () => {
    await load(1280, true);
    await page.locator("[data-entity-type='incidencia'] .home-entity-leading").click();
    await page.locator(`${panel} [data-detail-field='comment']`).waitFor({ state: "visible" });
    await mediaOpen();
    await page.keyboard.press("Escape");
    await page.locator(viewer).waitFor({ state: "detached" });
    assert.equal(await page.locator(panel).count(), 1);
  });

  for (const width of [1280, 390]) {
    await scenario(`image preview at ${width}px: visible, nested focus, draft and exact scroll retained`, async () => {
      await load(width); await openIncident();
      await page.locator(`${panel} [data-detail-field='comment']`).fill("Borrador sin enviar");
      await page.locator(attachment("image-one")).scrollIntoViewIfNeeded();
      const before = await page.locator(`${panel} [data-modal-body='true']`).evaluate((body) => body.scrollTop);
      await mediaOpen();
      await page.waitForFunction((viewer) => { const img = document.querySelector(`${viewer} img`); return img?.complete && img.naturalWidth > 0; }, viewer);
      const bounds = await page.locator(`${viewer} .incidencias-modal-preview`).boundingBox();
      assert.ok(bounds && bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= 901);
      for (const key of ["Tab", "Shift+Tab"]) {
        await page.keyboard.press(key);
        assert.equal(await page.locator(viewer).evaluate((node) => node.contains(document.activeElement)), true);
      }
      await page.screenshot({ path: `${evidence}/image-${width}.png` });
      await page.keyboard.press("Escape");
      await page.locator(viewer).waitFor({ state: "detached" });
      assert.equal(await page.locator(panel).count(), 1, "Escape closes the viewer, not its ticket");
      assert.equal(await page.locator(`${panel} [data-detail-field='comment']`).inputValue(), "Borrador sin enviar");
      assert.equal(await page.locator(`${panel} [data-modal-body='true']`).evaluate((body) => body.scrollTop), before);
      assert.equal(await page.evaluate(() => document.activeElement?.dataset.attachmentId), "image-one");
      assert.equal(await page.locator(panel).evaluate((node) => node.inert), false);
    });
  }
  await scenario("gallery replaces attachment content without creating another viewer", async () => {
    await load(); await openIncident(); await mediaOpen();
    const layer = await page.locator(viewer).elementHandle();
    // Gallery order follows the domain's rendered list, not fixture input order.
    const ids = await page.locator(`${panel} .incidencias-modal-view-btn[data-attachment-id]`).evaluateAll((nodes) =>
      [...new Set(nodes.map((node) => node.dataset.attachmentId))].filter((id) => id !== "document-other"));
    assert.equal(ids.length, 4);
    const index = ids.indexOf("image-one");
    assert.ok(index >= 0);
    const direction = index + 1 < ids.length ? "next" : "previous";
    const target = index + (direction === "next" ? 1 : -1);
    await page.locator(`${viewer} [data-media-gallery-action='${direction}']`).click();
    await page.waitForFunction(({ viewer, id }) => document.querySelector(`${viewer} [data-preview-attachment-id]`)?.dataset.previewAttachmentId === id, { viewer, id: ids[target] });
    assert.equal(await page.locator(viewer).evaluate((node, previous) => node === previous, layer), true);
    assert.equal(await page.locator(`${viewer} [data-media-gallery-counter='true']`).innerText(), `${target + 1} / ${ids.length}`);
    await page.locator(`${viewer} [data-media-gallery-action='${direction === "next" ? "previous" : "next"}']`).click();
    await page.waitForFunction((viewer) => document.querySelector(`${viewer} [data-preview-attachment-id]`)?.dataset.previewAttachmentId === "image-one", viewer);
    assert.equal(await page.locator(viewer).evaluate((node, previous) => node === previous, layer), true);
    await page.locator(closeViewer).click();
    await page.locator(viewer).waitFor({ state: "detached" });
    assert.equal(await page.locator(panel).count(), 1);
  });
  for (const [id, selector] of [["document-pdf", "iframe"], ["video-webm", "video"], ["document-other", ".incidencias-modal-preview"]]) {
    await scenario(`${id}: usable viewer and explicit close`, async () => {
      await load(); await openIncident(); await mediaOpen(id);
      await page.locator(`${viewer} ${selector}`).waitFor({ state: "visible" });
      if (id === "video-webm") await page.waitForFunction((viewer) => document.querySelector(`${viewer} video`)?.readyState >= 2, viewer);
      if (id === "document-pdf") {
        assert.match(await page.locator(`${viewer} iframe`).getAttribute("src"), /\/@media\/pdf/);
        // Wait for the browser's native PDF renderer, not just an empty iframe.
        const nativePdfUrl = (frame) => frame.url().startsWith("chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/");
        const pdfFrame = page.frames().find(nativePdfUrl) || await page.waitForEvent("framenavigated", { predicate: nativePdfUrl });
        await pdfFrame.waitForFunction(() => document.querySelector("pdf-viewer")?.getLoadSucceededForTesting?.() === true);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      }
      if (id === "document-other") assert.match(await page.locator(`${viewer} ${selector}`).innerText(), /descargar|documento/i);
      await page.screenshot({ path: `${evidence}/${id}.png` });
      await page.locator(closeViewer).click();
      await page.locator(viewer).waitFor({ state: "detached" });
      assert.equal(await page.locator(panel).count(), 1);
    });
  }
  await scenario("attachment permission error is visible and retry recovers without a stuck layer", async () => {
    await load(); await openIncident();
    await page.evaluate(() => { window.__failNextMedia = true; });
    await page.locator(attachment("image-one")).click();
    await page.getByText("No tienes permiso para visualizar este adjunto.", { exact: true }).waitFor({ state: "visible" });
    assert.equal(await page.locator(viewer).count(), 0);
    assert.equal(await page.locator(panel).evaluate((node) => node.inert), false);
    await mediaOpen();
    await page.locator(closeViewer).click();
    await page.locator(viewer).waitFor({ state: "detached" });
  });
  await scenario("closing the owner while /view is pending rejects the late response", async () => {
    await load(); await openIncident();
    await page.evaluate(() => window.__deferredMedia.add("image-one"));
    await page.locator(attachment("image-one")).click();
    await page.waitForFunction(() => window.__mediaReads.some((request) => request.attachmentId === "image-one" && request.resolve));
    await page.evaluate(() => window.__overlay.releaseOrigin(window.__homeNode));
    await page.evaluate(async () => {
      window.__mediaReads.find((request) => request.attachmentId === "image-one" && request.resolve).resolve();
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
    assert.equal(await page.locator(viewer).count(), 0);
    assert.equal(await page.locator(panel).count(), 0);
    const snapshots = await page.evaluate(async () => {
      const core = await import("/src/features/incidencias-video-preview/core.js");
      const images = await import("/src/features/incidencias-media-preview/index.js");
      return [core.getIncidenciasVideoPreviewSnapshot().mounted, images.getIncidenciasMediaPreviewSnapshot().mounted];
    });
    assert.deepEqual(snapshots, [false, false]);
    await page.evaluate(() => window.__deferredMedia.clear());
    await openIncident(); await mediaOpen();
  });
  await scenario("repeated owner replacement and runtime reinitialization retain one media authority", async () => {
    await load();
    for (let index = 0; index < 3; index += 1) {
      await openIncident(); await mediaOpen();
      assert.equal(await page.locator(viewer).count(), 1);
      await page.locator(closeViewer).click();
      await page.locator(viewer).waitFor({ state: "detached" });
      await page.keyboard.press("Escape");
      await page.locator(panel).waitFor({ state: "detached" });
    }
    await page.evaluate(() => { window.__overlay.destroy(); window.__overlay.init(); });
    await openIncident(); await mediaOpen();
    assert.equal(await page.locator(viewer).count(), 1);
  });
  await scenario("list-origin ticket uses the same owner-scoped attachment viewer", async () => {
    await load();
    await page.evaluate(async () => {
      await window.__mountRoute("incidencia");
      window.__preservedPath = location.href;
    });
    await page.locator("[data-ticket-row='true']").first().click();
    await page.locator(`${panel} [data-detail-field='comment']`).waitFor({ state: "visible" });
    await mediaOpen();
    await page.locator(closeViewer).click();
    await page.locator(viewer).waitFor({ state: "detached" });
    assert.equal(await page.locator(panel).count(), 1);
  });
  await writeFile(`${evidence}/results.json`, JSON.stringify({ results, failures, browser: browser.version() }, null, 2));
  assert.deepEqual(failures, [], "Every SPA Home/attachment regression must pass");
  console.log(`PASS SPA modal regressions: ${results.length} scenarios; actual owners/templates, isolated API, no production writes`);
} finally {
  await browser?.close();
  fixture.kill("SIGTERM");
  if (fixture.exitCode === null && fixture.signalCode === null) await once(fixture, "exit");
}
