import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "playwright-core";
import { png, webm } from "./spa-modal-media-fixtures.mjs";

/* While a layer is open, the panel underneath stays isolated and focus stays in the layer.
 *
 * Changing file inside the attachment viewer is a CONTENT change of that layer, not a close
 * and a reopen. Two things used to contradict that on every navigation:
 *
 *   - the owner's re-render synced the panel's attributes from a template that knows nothing
 *     about the layer above it, so `inert` and `aria-hidden` were stripped off a panel the
 *     stack was still holding, and put back a frame later. In between, a covered modal was
 *     live again;
 *   - the navigation controls are disabled for the moment the swap takes, and disabling the
 *     button that HOLDS focus drops focus to the body, so the covered incidencia became the
 *     focused context on every file change.
 *
 * Neither is visible as a flash -- `inert` has no appearance -- which is exactly why this is
 * asserted by instrumenting the transitions instead of looking at pixels.
 *
 * Synthetic fixtures only; no production data and nothing leaves the origin.
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
      return route.fulfill({
        response,
        body: original.replace(
          'export const openIncidenciaAttachment = (...args) => window.__forbidden("openIncidenciaAttachment", args);',
          "export const openIncidenciaAttachment = (params) => window.__attachmentRequest(params);"
        ),
      });
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
    const files = [
      { id: "image-one", name: "captura-uno.png", contentType: "image/png", viewUrl: "/@media/png" },
      { id: "image-two", name: "captura-dos.png", contentType: "image/png", viewUrl: "/@media/png?second=1" },
      { id: "video-webm", name: "grabacion.webm", contentType: "video/webm", viewUrl: "/@media/webm" },
    ].map((file) => ({ ...file, attachmentId: file.id, size: 1024 }));
    window.__fixtureData.incidencia.attachments = files;
    window.__attachmentRequest = (params) => {
      const file = files.find(({ id }) => id === params.attachmentId);
      return file ? Promise.resolve(file) : Promise.reject(new Error("Unknown fixture attachment"));
    };
  });

  const panel = "[data-incidencias-modal-panel='true']";
  const viewer = "[data-incidencias-media-viewer='true']";
  const openCard = (id) => `${panel} [data-detail-action='detail-attachment-open'][data-attachment-id='${id}']`;

  await page.locator("#open-incidencia").click();
  await page.locator(`${panel} [data-detail-field='comment']`).waitFor({ state: "visible" });
  await page.locator(`${panel} [data-detail-field='comment']`).fill("Borrador que debe sobrevivir");
  await page.waitForTimeout(250);

  const opener = openCard("image-one");
  await page.locator(opener).first().click();
  await page.locator(viewer).waitFor({ state: "visible" });
  await page.waitForTimeout(600);

  /* Record every isolation change and every focus transition from here on. */
  await page.evaluate((sel) => {
    const owner = document.querySelector(sel);
    window.__iso = [];
    window.__focus = [];
    window.__owner = owner;
    new MutationObserver((records) => {
      for (const record of records) {
        if (["inert", "aria-hidden"].includes(record.attributeName)) {
          window.__iso.push({
            attr: record.attributeName,
            from: record.oldValue,
            to: owner.getAttribute(record.attributeName),
          });
        }
      }
    }).observe(owner, { attributes: true, attributeOldValue: true, attributeFilter: ["inert", "aria-hidden"] });
    /* Sampled per animation frame, not from focusin: focus falling through to the body does
       not reliably raise focusin, and the whole defect lasted a handful of frames. This is
       the method that detected it, so it is the method that guards it. */
    window.__focusRunning = true;
    const sampleFocus = () => {
      const node = document.activeElement;
      const entry = {
        tag: node?.tagName || "",
        inViewer: Boolean(node?.closest?.("[data-incidencias-media-viewer='true']")),
        isBody: node === document.body || node === document.documentElement,
      };
      const last = window.__focus.at(-1);
      if (!last || last.tag !== entry.tag || last.inViewer !== entry.inViewer || last.isBody !== entry.isBody) {
        window.__focus.push(entry);
      }
      if (window.__focusRunning) requestAnimationFrame(sampleFocus);
    };
    requestAnimationFrame(sampleFocus);
  }, panel);

  const isolated = () => page.evaluate((sel) => {
    const owner = document.querySelector(sel);
    return { inert: owner.hasAttribute("inert"), ariaHidden: owner.getAttribute("aria-hidden") };
  }, panel);

  const before = await isolated();
  assert.equal(before.inert, true, "With the viewer open the owner panel is inert");
  assert.equal(before.ariaHidden, "true", "With the viewer open the owner panel is aria-hidden");

  /* Several navigations, by mouse and by keyboard. */
  for (let step = 0; step < 4; step += 1) {
    const forward = page.locator(`${viewer} [data-media-gallery-action='next']`);
    const back = page.locator(`${viewer} [data-media-gallery-action='previous']`);
    const control = await forward.isDisabled().catch(() => true) ? back : forward;
    if (await control.isDisabled().catch(() => true)) break;
    if (step % 2 === 0) {
      await control.click();
    } else {
      await control.focus();
      await page.keyboard.press("Enter");
    }
    await page.waitForTimeout(320);
  }

  const trail = await page.evaluate(() => {
    window.__focusRunning = false;
    return { iso: window.__iso, focus: window.__focus };
  });

  assert.deepEqual(
    trail.iso, [],
    `Navigating inside the viewer changed the owner's isolation ${trail.iso.length} time(s): ` +
      `${JSON.stringify(trail.iso)}. Changing file is a content change of the open layer, not a reopen.`
  );
  const escaped = trail.focus.filter((entry) => entry.isBody || !entry.inViewer);
  assert.deepEqual(
    escaped, [],
    `Focus left the viewer ${escaped.length} time(s) while navigating: ${JSON.stringify(escaped)}. ` +
      "It must stay on a valid element of the layer."
  );
  assert.ok(trail.focus.length > 0, "Focus transitions were recorded at all");

  const during = await isolated();
  assert.equal(during.inert, true, "The owner is still inert after navigating");
  assert.equal(during.ariaHidden, "true", "The owner is still aria-hidden after navigating");

  /* Tab and Shift+Tab stay inside the layer. */
  for (const key of ["Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(120);
    const inside = await page.evaluate((v) => Boolean(document.activeElement?.closest?.(v)), viewer);
    assert.equal(inside, true, `${key} moved focus out of the viewer`);
  }

  /* Escape closes the viewer only, and the owner is released and gets focus back. */
  await page.keyboard.press("Escape");
  await page.locator(viewer).waitFor({ state: "detached" });
  await page.waitForTimeout(400);
  assert.equal(await page.locator(panel).count(), 1, "Escape closed the owner as well as the viewer");

  const released = await isolated();
  assert.equal(released.inert, false, "Closing the viewer releases the owner's isolation");
  assert.equal(released.ariaHidden, null, "Closing the viewer removes aria-hidden from the owner");

  const restored = await page.evaluate((sel) => {
    const node = document.activeElement;
    return {
      inOwner: Boolean(node?.closest?.(sel)),
      attachment: node?.getAttribute?.("data-attachment-id") || "",
      draft: document.querySelector(`${sel} [data-detail-field='comment']`)?.value ?? null,
    };
  }, panel);
  assert.equal(restored.inOwner, true, "Focus returns into the incidencia when the viewer closes");
  assert.equal(restored.draft, "Borrador que debe sobrevivir", "The draft survives the whole episode");

  assert.deepEqual(outside, [], "No request leaves the isolated fixture origin");
  assert.deepEqual(errors, [], "No uncaught browser error");

  console.log("Modal stack isolation contract: PASS");
  console.log(`- the owner stays inert and aria-hidden across every navigation: ${trail.iso.length} isolation changes`);
  console.log(`- focus never leaves the viewer while navigating: ${trail.focus.length} transitions, ${escaped.length} outside`);
  console.log("- Tab and Shift+Tab stay in the layer; Escape closes only the viewer");
  console.log(`- closing releases the owner, returns focus to it${restored.attachment ? ` (${restored.attachment})` : ""} and keeps the draft`);
} finally {
  await browser?.close();
  fixture.kill("SIGTERM");
  if (fixture.exitCode === null && fixture.signalCode === null) await once(fixture, "exit");
}
