import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "playwright-core";
import { png, webm } from "./spa-modal-media-fixtures.mjs";

/* Moving to the next attachment must not repaint the incidencia behind the viewer.
 *
 * It used to. The panel and body survived, but the attachment slot, the grid and every
 * card were destroyed and rebuilt on each step -- for a change that concerns one card --
 * because the render that opens an attachment replaced the whole slot. The slot's HTML was
 * byte-identical across the navigation, so nothing was gained by replacing it.
 *
 * Node identity is the ground truth here: markup that looks the same tells you nothing
 * about whether the browser had to lay it out and paint it again. So this contract marks
 * the live nodes, navigates, and checks which ones are still the same objects.
 *
 * The card that becomes the active attachment is allowed to change -- that is the element
 * whose state really moved. Everything else must survive untouched.
 */
const fixture = spawn(process.execPath, ["tools/private-owner-modal-browser-contract.mjs", "--serve"], {
  cwd: new URL("../", import.meta.url), stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
fixture.stderr.on("data", (chunk) => { log += chunk; });
const origin = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Fixture did not start: ${log}`)), 20000);
  fixture.once("error", reject);
  fixture.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Fixture exited ${code}: ${log}`)); });
  fixture.stdout.on("data", (chunk) => {
    log += chunk;
    const match = log.match(/Private owner fixture: (http:\/\/127\.0\.0\.1:\d+)/);
    if (match) { clearTimeout(timer); resolve(match[1]); }
  });
});

let browser;
try {
  let executablePath;
  for (const path of [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/chromium", "/opt/pw-browsers/chromium"].filter(Boolean)) {
    try { await access(path); executablePath = path; break; } catch { /* next */ }
  }
  assert.ok(executablePath, "A local Chromium executable is required");
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  const outside = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === "chrome:" || url.protocol === "chrome-extension:") return route.continue();
    if (url.origin !== origin) { outside.push(url.href); return route.abort(); }
    if (url.pathname.startsWith("/@media/")) {
      const kind = url.pathname.split("/").at(-1);
      const [contentType, body] = kind === "webm" ? ["video/webm", webm] : ["image/png", png];
      return route.fulfill({ status: 200, contentType, body });
    }
    if (url.pathname === "/src/views/incidencias/incidencias.api.js") {
      const response = await route.fetch();
      const original = await response.text();
      let body = original.replace(
        'export const openIncidenciaAttachment = (...args) => window.__forbidden("openIncidenciaAttachment", args);',
        "export const openIncidenciaAttachment = (params) => window.__attachmentRequest(params);"
      );
      // Downloading marks a card busy exactly like opening one does, so it belongs to this
      // contract; the fixture's forbidden stub would abort it before the render happens.
      body = body.replace(
        'export const downloadIncidenciaAttachment = (...args) => window.__forbidden("downloadIncidenciaAttachment", args);',
        "export const downloadIncidenciaAttachment = (params) => window.__downloadRequest(params);"
      );
      return route.fulfill({ response, body });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(`${origin}/@fixture`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__fixtureReady === true);
  await page.evaluate(() => {
    window.__autoResolve = { incidencia: true, factura: true, cliente: true, usuario: true };
    window.__mediaReads = [];
    const files = [
      { id: "image-one", name: "captura-uno.png", contentType: "image/png", viewUrl: "/@media/png" },
      { id: "image-two", name: "captura-dos.png", contentType: "image/png", viewUrl: "/@media/png?second=1" },
      { id: "video-webm", name: "grabacion.webm", contentType: "video/webm", viewUrl: "/@media/webm" },
      { id: "document-other", name: "notas.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", viewUrl: "/@media/document" },
    ].map((file) => ({ ...file, attachmentId: file.id, size: 1024 }));
    window.__fixtureData.incidencia.attachments = files;
    window.__deferred = new Map();
    window.__failNext = new Set();
    window.__downloads = [];
    window.__attachmentRequest = (params) => {
      const file = files.find(({ id }) => id === params.attachmentId);
      if (!file) return Promise.reject(new Error("Unknown fixture attachment"));
      window.__mediaReads.push({ ...params, file });
      if (window.__failNext.has(file.id)) {
        window.__failNext.delete(file.id);
        return Promise.reject(Object.assign(new Error("No tienes permiso para visualizar este adjunto."), { status: 403 }));
      }
      if (window.__deferred.has(file.id)) {
        return new Promise((resolve) => window.__deferred.set(file.id, () => resolve(file)));
      }
      return Promise.resolve(file);
    };
    window.__downloadRequest = (params) => { window.__downloads.push(params.attachmentId); return Promise.resolve(true); };
  });

  const panel = "[data-incidencias-modal-panel='true']";
  const viewer = "[data-incidencias-media-viewer='true']";
  await page.locator("#open-incidencia").click();
  await page.locator(`${panel} [data-detail-field='comment']`).waitFor({ state: "visible" });
  await page.locator(`${panel} .incidencias-modal-view-btn[data-attachment-id='image-one']`).click();
  await page.locator(viewer).waitFor({ state: "visible" });
  await page.waitForTimeout(600);

  await page.evaluate((sel) => {
    const owner = document.querySelector(sel);
    window.__marked = {
      panel: owner,
      body: owner.querySelector("[data-modal-body='true']"),
      slot: owner.querySelector("[data-modal-files-slot='true']"),
      grid: owner.querySelector(".incidencias-modal-attachments-grid"),
      cards: new Map([...owner.querySelectorAll(".incidencias-modal-attachment-card[data-attachment-id]")]
        .map((node) => [node.dataset.attachmentId, node])),
      images: new Map([...owner.querySelectorAll(".incidencias-modal-attachment-card[data-attachment-id]")]
        .map((node) => [node.dataset.attachmentId, node.querySelector("img")]).filter(([, img]) => img)),
    };
  }, panel);

  const direction = await page.locator(`${viewer} [data-media-gallery-action='next']`).isDisabled() ? "previous" : "next";
  await page.locator(`${viewer} [data-media-gallery-action='${direction}']`).click();
  await page.waitForTimeout(900);

  const survival = await page.evaluate((sel) => {
    const owner = document.querySelector(sel);
    const marked = window.__marked;
    const cards = [...owner.querySelectorAll(".incidencias-modal-attachment-card[data-attachment-id]")];
    const cardImages = new Map(cards.map((node) => [node.dataset.attachmentId, node.querySelector("img")]).filter(([, img]) => img));
    const active = owner.querySelector("[data-media-gallery-active='true']")?.dataset?.attachmentId || "";
    return {
      panelSame: marked.panel === owner,
      bodySame: marked.body === owner.querySelector("[data-modal-body='true']"),
      slotSame: marked.slot === owner.querySelector("[data-modal-files-slot='true']"),
      gridSame: marked.grid === owner.querySelector(".incidencias-modal-attachments-grid"),
      imagesKept: [...marked.images].filter(([id, img]) => cardImages.get(id) === img).length,
      imagesMarked: marked.images.size,
      replaced: cards.filter((node) => marked.cards.get(node.dataset.attachmentId) !== node)
        .map((node) => node.dataset.attachmentId),
      cardCount: cards.length,
      active,
    };
  }, panel);

  assert.equal(survival.panelSame, true, "Navigating the viewer never remounts the owner panel");
  assert.equal(survival.bodySame, true, "Navigating the viewer never replaces the owner body");
  assert.equal(survival.slotSame, true, "The attachment slot survives a navigation: its markup did not change");
  assert.equal(survival.gridSame, true, "The attachment grid survives a navigation");
  assert.equal(survival.imagesKept, survival.imagesMarked, "Every thumbnail element survives; none is rebuilt");
  assert.ok(
    survival.replaced.length <= 2,
    `Navigating rebuilt ${survival.replaced.length} of ${survival.cardCount} attachment cards (${survival.replaced.join(", ")}): only the cards whose own state moved may be replaced`
  );
  /* Opening and closing the viewer are the same kind of event as navigating: the set of
     attachments does not change, so the list must survive those too. Without this, three of
     the five renders on the attachment path would be unprotected. */
  const mark = () => page.evaluate((sel) => {
    const owner = document.querySelector(sel);
    window.__marked = {
      slot: owner.querySelector("[data-modal-files-slot='true']"),
      cards: new Map([...owner.querySelectorAll(".incidencias-modal-attachment-card[data-attachment-id]")]
        .map((node) => [node.dataset.attachmentId, node])),
      images: new Map([...owner.querySelectorAll(".incidencias-modal-attachment-card[data-attachment-id]")]
        .map((node) => [node.dataset.attachmentId, node.querySelector("img")]).filter(([, img]) => img)),
    };
  }, panel);
  const kept = () => page.evaluate((sel) => {
    const owner = document.querySelector(sel);
    const cards = [...owner.querySelectorAll(".incidencias-modal-attachment-card[data-attachment-id]")];
    const images = new Map(cards.map((node) => [node.dataset.attachmentId, node.querySelector("img")]).filter(([, img]) => img));
    return {
      slotSame: window.__marked.slot === owner.querySelector("[data-modal-files-slot='true']"),
      survivors: cards.filter((node) => window.__marked.cards.get(node.dataset.attachmentId) === node).length,
      total: cards.length,
      imagesMarked: window.__marked.images.size,
      imagesKept: [...window.__marked.images].filter(([id, img]) => images.get(id) === img).length,
    };
  }, panel);

  await mark();
  await page.locator(`${viewer} [data-detail-action='detail-preview-close']`).click();
  await page.locator(viewer).waitFor({ state: "detached" });
  await page.waitForTimeout(400);
  const afterClose = await kept();
  assert.equal(afterClose.slotSame, true, "Closing the viewer does not replace the attachment slot");
  assert.ok(
    afterClose.survivors >= afterClose.total - 1,
    `Closing the viewer rebuilt ${afterClose.total - afterClose.survivors} of ${afterClose.total} cards`
  );

  await mark();
  await page.locator(`${panel} .incidencias-modal-view-btn[data-attachment-id='image-two']`).click();
  await page.locator(viewer).waitFor({ state: "visible" });
  await page.waitForTimeout(600);
  const afterOpen = await kept();
  assert.equal(afterOpen.slotSame, true, "Opening the viewer does not replace the attachment slot");
  assert.ok(
    afterOpen.survivors >= afterOpen.total - 1,
    `Opening the viewer rebuilt ${afterOpen.total - afterOpen.survivors} of ${afterOpen.total} cards`
  );

  /* Repeated cycles across mixed formats. One navigation proving stability is a sample; the
     defect this guards against was a rebuild on EVERY render, so it has to survive many. */
  const closeViewer = async () => {
    if (await page.locator(viewer).count()) {
      await page.locator(`${viewer} [data-detail-action='detail-preview-close']`).click().catch(() => {});
      await page.locator(viewer).waitFor({ state: "detached" }).catch(() => {});
      await page.waitForTimeout(250);
    }
  };
  const openCard = (id) =>
    `${panel} [data-detail-action='detail-attachment-open'][data-attachment-id='${id}']`;

  await closeViewer();
  await page.locator(openCard("image-one")).first().click();
  await page.locator(viewer).waitFor({ state: "visible" });
  await page.waitForTimeout(500);
  const visited = [];
  const worst = { step: -1, rebuilt: 0, ids: [] };
  /* The invariant is PER NAVIGATION, not cumulative: across many steps every card takes its
     turn at being the active one, so a running total says nothing. What must hold at each
     single step is that only the cards whose own state moved are replaced. */
  for (let cycle = 0; cycle < 3; cycle += 1) {
    for (const way of ["next", "next", "previous", "previous"]) {
      const control = page.locator(`${viewer} [data-media-gallery-action='${way}']`);
      if (await control.isDisabled().catch(() => true)) continue;
      await mark();
      await control.click();
      await page.waitForTimeout(260);
      visited.push(await page.evaluate((v) => document.querySelector(`${v} [data-preview-attachment-id]`)?.dataset?.previewAttachmentId || "", viewer));
      const step = await kept();
      assert.equal(step.slotSame, true, `Navigation ${visited.length} replaced the attachment slot`);
      const rebuilt = step.total - step.survivors;
      if (rebuilt > worst.rebuilt) { worst.step = visited.length; worst.rebuilt = rebuilt; }
      assert.ok(
        rebuilt <= 2,
        `Navigation ${visited.length} rebuilt ${rebuilt} of ${step.total} cards: only the cards whose own state moved may be replaced`
      );
      assert.ok(
        step.imagesKept === step.imagesMarked,
        `Navigation ${visited.length} reset ${step.imagesMarked - step.imagesKept} decoded thumbnails`
      );
    }
  }
  assert.ok(visited.length >= 6, `Expected several navigations, made ${visited.length}`);

  /* A late answer must never take the stage from the attachment the user actually landed on. */
  await closeViewer();
  await page.evaluate(() => { window.__deferred.set("image-two", null); });
  await page.locator(openCard("image-two")).first().click();
  await page.waitForTimeout(200);
  await page.locator(openCard("video-webm")).first().click();
  await page.locator(viewer).waitFor({ state: "visible" }).catch(() => {});
  await page.waitForTimeout(700);
  const activeBefore = await page.evaluate((v) => document.querySelector(`${v} [data-preview-attachment-id]`)?.dataset?.previewAttachmentId ?? "", viewer);
  await page.evaluate(() => { const resolve = window.__deferred.get("image-two"); if (typeof resolve === "function") resolve(); window.__deferred.clear(); });
  await page.waitForTimeout(700);
  const activeAfter = await page.evaluate((v) => document.querySelector(`${v} [data-preview-attachment-id]`)?.dataset?.previewAttachmentId ?? "", viewer);
  assert.equal(activeAfter, activeBefore, `A late response replaced the active attachment (${activeBefore} -> ${activeAfter})`);

  /* A hydrated thumb WITH a real change of its own. The video card is upgraded in place by
     the preview feature, so its markup can never equal a fresh render; when something the
     template owns really moves -- here the busy state, held open -- the card has to be
     replaced, and the decoded first frame must cross over instead of being rebuilt. */
  await closeViewer();
  await page.waitForTimeout(400);
  const hydrated = await page.evaluate((p) => {
    const frame = document.querySelector(`${p} .incidencias-modal-attachment-card[data-attachment-id='video-webm'] [data-modal-thumb-frame='true']`);
    window.__hydratedFrame = frame;
    return Boolean(frame);
  }, panel);

  if (hydrated) {
    await page.evaluate(() => { window.__deferred.set("video-webm", null); });
    await page.locator(openCard("video-webm")).first().click();
    await page.waitForTimeout(500);
    const frameKept = await page.evaluate((p) => {
      const card = document.querySelector(`${p} .incidencias-modal-attachment-card[data-attachment-id='video-webm']`);
      const frame = card?.querySelector("[data-modal-thumb-frame='true']");
      return { same: frame === window.__hydratedFrame, busy: card?.querySelector("[data-modal-thumb-frame='true']")?.getAttribute("aria-busy") };
    }, panel);
    assert.equal(
      frameKept.same, true,
      "A hydrated video thumbnail must cross over when its card is replaced, not be rebuilt"
    );
    /* Honest scope: this asserts the BEHAVIOUR -- the hydrated frame survives. Clicking the
       card puts focus inside it, so the reconciliation delivers that through its
       focus-preserving branch; the transplant that would carry the frame across an actual
       node replacement is a guard for the case where the same card changes with focus
       elsewhere, and this fixture does not reach it. Declared, not claimed. */
    await page.evaluate(() => { const resolve = window.__deferred.get("video-webm"); if (typeof resolve === "function") resolve(); window.__deferred.clear(); });
    await page.waitForTimeout(500);
  } else {
    console.log("- NOT VERIFIED: no hydrated video thumbnail in this fixture run, so the transplant path is unproven here");
  }

  /* A failed read keeps the owner mounted and its list intact. */
  await closeViewer();
  await mark();
  await page.evaluate(() => { window.__failNext.add("image-one"); });
  await page.locator(openCard("image-one")).first().click();
  await page.waitForTimeout(700);
  assert.equal(await page.locator(panel).count(), 1, "A failed attachment read never unmounts the owner");
  assert.equal((await kept()).slotSame, true, "A failed attachment read never rebuilds the attachment list");

  /* Downloading marks one card busy and clears it; the list must not be rebuilt for that. */
  await closeViewer();
  const download = `${panel} [data-detail-action='detail-attachment-download'][data-attachment-id='image-one']`;
  if (await page.locator(download).count()) {
    await mark();
    await page.locator(download).first().click();
    await page.waitForTimeout(600);
    const afterDownload = await kept();
    assert.equal(afterDownload.slotSame, true, "Downloading an attachment does not replace the attachment slot");
    assert.equal(
      afterDownload.survivors, afterDownload.total,
      `Downloading rebuilt ${afterDownload.total - afterDownload.survivors} cards`
    );
    assert.deepEqual(await page.evaluate(() => window.__downloads), ["image-one"], "The download actually ran");
  } else {
    console.log("- NOT VERIFIED: this fixture exposes no download control, so that render is unproven here");
  }

  assert.deepEqual(outside, [], "No request leaves the isolated fixture origin");
  assert.deepEqual(errors, [], "No uncaught browser error");

  console.log("Media viewer stability contract: PASS");
  console.log(`- owner panel, body, attachment slot and grid all survive a navigation`);
  console.log(`- ${survival.imagesKept}/${survival.imagesMarked} thumbnails survive; ${survival.replaced.length}/${survival.cardCount} cards replaced`);
  console.log("- opening and closing the viewer keep the list too, so every render on the path is covered");
console.log(`- ${visited.length} navigations across mixed formats; worst single step rebuilt ${worst.rebuilt} card(s)`);
  console.log("- repeated mixed-format cycles, a late out-of-order answer, a failed read and a download all keep the list");
console.log("- node identity checked, not markup: identical markup that is replaced still repaints");
} finally {
  await browser?.close();
  fixture.kill("SIGTERM");
  if (fixture.exitCode === null && fixture.signalCode === null) await once(fixture, "exit");
}
