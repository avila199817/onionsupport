import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

// THE SHARED HOST'S SIDE OF THE MODAL STACK, ON A REAL CONSUMER.
//
// tools/modal-stack-isolation-contract.mjs covers the other real patcher: the Incidencias
// controller's own patchDetailModalDom, with the attachment viewer as the covering layer.
// This one covers src/features/entity-overlay/modal-host.js, and it does it through a real
// consumer rather than a fixture that copies the implementation: the Facturas detail is
// patched by renderModalContent (src/views/facturas/index.js), and the payment confirmation
// (src/features/facturas-paid-confirm/index.js) is a real higher layer over it, opened by
// clicking the real action inside the detail.
//
// A fixture that reimplements the patch would prove nothing about the consumer. So every
// module here is served from src/: the Facturas view, the shared host, the stack authority
// and the confirmation feature, which installs itself on import exactly as the enhancement
// loader imports it. Only the payment boundary is replaced, so no write can leave the page.
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

const PANEL = "[data-facturas-detail-modal='true']";
const DIALOG = "[data-fpc-dialog='true']";
const ACTION = "[data-facturas-action='mark-factura-paid']";
const CANCEL = "button.fpc-btn[data-fpc-action='cancel']";
const HELD = "data-modal-stack-held";
const PREVIOUS = "data-modal-stack-previous-aria-hidden";

let browser;
let checks = 0;
try {
  let executablePath;
  for (const candidate of [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/tmp/chromium"].filter(Boolean)) {
    try { await access(candidate); executablePath = candidate; break; } catch { /* next */ }
  }
  assert.ok(executablePath, "CHROME_BIN must identify a local Chromium executable");
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(12000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("dialog", async (dialog) => { pageErrors.push(`Unexpected native ${dialog.type()}`); await dialog.dismiss(); });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/src/views/facturas/facturas.api.js") {
      const response = await route.fetch();
      const source = await response.text();
      const boundary = 'export const markFacturaPaid = (...args) => window.__forbidden("markFacturaPaid", args);';
      assert.equal(source.split(boundary).length, 2, "Replace only the payment fixture boundary");
      return route.fulfill({ response, body: source.replace(boundary, "export const markFacturaPaid = (...args) => window.__paymentRequest(...args);") });
    }
    if (url.pathname === "/src/features/entity-overlay/index.js") {
      const response = await route.fetch();
      const source = await response.text();
      // Fixture boundary, not a reimplementation: the overlay keeps the owner controller it
      // created from the real view module, and the journey needs that exact instance to make
      // the parent re-render through the controller's own in-place path.
      assert.equal(source.split("let ownerSession = null;").length, 2, "Overlay owner session boundary");
      return route.fulfill({ response, body: `${source}\nexport const __ownerSessionForContract = () => ownerSession;` });
    }
    return route.continue();
  });

  // 1 · The parent modal: the real Facturas detail, rendered and patched by the shared host.
  await page.goto(`${origin}/@fixture`);
  await page.waitForFunction(() => window.__fixtureReady === true);
  await page.evaluate(() => {
    window.__autoResolve = { factura: true };
    Object.assign(window.__fixtureData.factura, { estado: "pendiente", estadoPago: "pendiente", paymentStatus: "pending", pagado: 0, pendiente: 48.4 });
    window.__paymentCalls = [];
    window.__paymentRequest = (...args) => { __paymentCalls.push(args); return new Promise(() => {}); };
  });
  await page.locator("#open-factura").click();
  await page.locator(ACTION).waitFor();

  const consumer = await page.evaluate(() => {
    const panel = document.querySelector("[data-facturas-detail-modal='true']");
    return {
      shell: panel?.classList.contains("ui-detail-modal-panel"),
      marked: panel?.getAttribute("data-modal-panel"),
      servedHost: [...performance.getEntriesByType("resource")].some((entry) => entry.name.endsWith("/src/features/entity-overlay/modal-host.js")),
    };
  });
  assert.equal(consumer.shell, true, "The parent is a real shared-shell panel");
  assert.equal(consumer.marked, "true", "The parent carries the shared shell's panel marker");
  assert.equal(consumer.servedHost, true, "The real shared host module is the one loaded");
  checks += 1;
  console.log("PASS 1 · the parent modal is a real consumer of the shared host, loaded from src");

  // 2 · A higher layer, through the real mechanism: the feature installs on import, the
  //     document dispatcher intercepts the real action inside the detail.
  await page.evaluate(() => import("/src/features/facturas-paid-confirm/index.js"));
  await page.evaluate(() => {
    const panel = document.querySelector("[data-facturas-detail-modal='true']");
    window.__panel = panel;
    window.__stackMutations = [];
    window.__contentMutations = [];
    new MutationObserver((records) => {
      for (const record of records) {
        const bucket = ["inert", "aria-hidden", "data-modal-stack-held", "data-modal-stack-previous-aria-hidden"].includes(record.attributeName)
          ? window.__stackMutations : window.__contentMutations;
        bucket.push({ name: record.attributeName, from: record.oldValue, to: panel.getAttribute(record.attributeName) });
      }
    }).observe(panel, { attributes: true, attributeOldValue: true });
  });
  await page.locator(ACTION).click();
  await page.locator(DIALOG).waitFor();
  await page.waitForFunction(() => document.querySelector("[data-fpc-dialog='true']")?.contains(document.activeElement));

  // 3 · Covered: the layer below is isolated, and it is not an ancestor of the active layer.
  const covered = await page.evaluate(() => {
    const panel = window.__panel;
    const dialog = document.querySelector("[data-fpc-dialog='true']");
    return {
      sameNode: panel === document.querySelector("[data-facturas-detail-modal='true']"),
      held: panel.getAttribute("data-modal-stack-held"),
      inert: panel.hasAttribute("inert") || panel.inert === true,
      ariaHidden: panel.getAttribute("aria-hidden"),
      previous: panel.getAttribute("data-modal-stack-previous-aria-hidden"),
      ancestorOfLayer: panel.contains(dialog),
      focusInDialog: dialog.contains(document.activeElement),
      opened: window.__stackMutations.length,
    };
  });
  assert.equal(covered.sameNode, true, "Opening the layer patches the parent in place");
  assert.equal(covered.held, "true");
  assert.equal(covered.inert, true, "The covered parent is inert while a layer is above it");
  assert.equal(covered.ariaHidden, "true", "The covered parent leaves the accessibility tree");
  assert.equal(covered.previous, "__missing__", "The stack records the exact state it must restore");
  assert.equal(covered.ancestorOfLayer, false, "The isolated panel never contains the active layer");
  assert.equal(covered.focusInDialog, true, "Focus moves into the layer that was opened");
  checks += 1;
  console.log(`PASS 2 · a real higher layer isolates the shared-host parent (${covered.opened} stack writes to take the hold)`);

  // 4 · The parent's content is updated WHILE COVERED, through the controller's own
  //     boundary, so the shared host really patches a held panel.
  await page.evaluate(() => {
    window.__stackMutations.length = 0;
    window.__contentMutations.length = 0;
    window.__beforePatch = document.querySelector("[data-facturas-detail-modal='true']").innerHTML.length;
    Object.assign(window.__fixtureData.factura, { estado: "pagada", estadoPago: "pagada", paymentStatus: "paid", pagado: 48.4, pendiente: 0 });
  });
  const reRendered = await page.evaluate(async () => {
    const overlay = await import("/src/features/entity-overlay/index.js");
    const controller = overlay.__ownerSessionForContract()?.controller;
    if (!controller) return { controller: false };
    // The detail's own in-place re-render: the same call its retry control makes. It keeps
    // the shell and patches it through renderModalContent, which is the path under test.
    const opened = await controller.openFactura(window.__fixtureData.factura.id, null, { retry: true });
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    return { controller: true, opened, detailModalOpen: controller.getSnapshot().detailModalOpen };
  });
  assert.equal(reRendered.controller, true, "The overlay exposes the real owner controller it created");
  assert.equal(reRendered.detailModalOpen, true, "The parent stays open across its own re-render");
  const patched = await page.evaluate(() => {
    const panel = window.__panel;
    return {
      sameNode: panel === document.querySelector("[data-facturas-detail-modal='true']"),
      connected: panel.isConnected,
      held: panel.getAttribute("data-modal-stack-held"),
      inert: panel.hasAttribute("inert") || panel.inert === true,
      ariaHidden: panel.getAttribute("aria-hidden"),
      stackWrites: window.__stackMutations.slice(),
      contentChanged: panel.innerHTML.length !== window.__beforePatch || panel.textContent.includes("Pagada"),
      contentWrites: window.__contentMutations.length,
      dialogStillOpen: Boolean(document.querySelector("[data-fpc-dialog='true']")),
      focusInDialog: document.querySelector("[data-fpc-dialog='true']")?.contains(document.activeElement),
    };
  });
  assert.equal(patched.sameNode, true, "The covered parent is patched, not rebuilt");
  assert.equal(patched.connected, true);
  assert.equal(patched.dialogStillOpen, true, "The layer above survives the parent's update");
  assert.equal(patched.held, "true", "A render of the parent never releases a panel the stack holds");
  assert.equal(patched.inert, true);
  assert.equal(patched.ariaHidden, "true");
  assert.deepEqual(patched.stackWrites, [], "The isolation is neither torn off nor needlessly re-asserted");
  assert.equal(patched.contentChanged, true, "The covered parent really did update its content");
  assert.equal(patched.focusInDialog, true, "Updating the parent does not pull focus out of the layer above");
  checks += 1;
  console.log(`PASS 3 · the parent updates under the layer (${patched.contentWrites} content attribute writes) with 0 writes to the stack's attributes`);

  // 5 · The top layer stays usable and keeps the focus.
  const walk = [];
  for (let step = 0; step < 10; step += 1) {
    await page.keyboard.press("Tab");
    walk.push(await page.evaluate(() => {
      const dialog = document.querySelector("[data-fpc-dialog='true']");
      const active = document.activeElement;
      return { inLayer: Boolean(dialog?.contains(active)), inParent: Boolean(window.__panel.contains(active)), body: active === document.body };
    }));
  }
  assert.deepEqual(walk.filter((s) => !s.inLayer), [], "Tab never leaves the layer above");
  assert.deepEqual(walk.filter((s) => s.inParent || s.body), [], "Focus never falls into the covered parent or the body");
  checks += 1;
  console.log(`PASS 4 · ${walk.length} keyboard steps stay inside the top layer`);

  // 6 · Closing ONLY that layer.
  await page.locator(CANCEL).click();
  await page.waitForFunction(() => !document.querySelector("[data-fpc-dialog='true']"));
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

  // 7 · The prior state comes back, and no isolation mark survives the close.
  const released = await page.evaluate(() => {
    const panel = window.__panel;
    return {
      parentStillOpen: Boolean(document.querySelector("[data-facturas-detail-modal='true']")),
      sameNode: panel === document.querySelector("[data-facturas-detail-modal='true']"),
      held: panel.getAttribute("data-modal-stack-held"),
      inert: panel.hasAttribute("inert") || panel.inert === true,
      ariaHidden: panel.getAttribute("aria-hidden"),
      previous: panel.getAttribute("data-modal-stack-previous-aria-hidden"),
      focusBackInParent: panel.contains(document.activeElement),
      focusedAction: document.activeElement?.getAttribute?.("data-facturas-action"),
      bodyOverflow: document.body.style.overflow,
      payments: window.__paymentCalls.length,
    };
  });
  assert.equal(released.parentStillOpen, true, "Closing the layer closes only that layer");
  assert.equal(released.sameNode, true);
  assert.equal(released.inert, false, "The parent is interactive again");
  assert.equal(released.ariaHidden, null, "An aria-hidden the parent never had is removed, not left reading false");
  assert.equal(released.held, "false", "No panel is left marked as held");
  assert.equal(released.previous, null, "No isolation bookkeeping survives the close");
  assert.equal(released.focusBackInParent, true, "Focus returns to the parent that owned the layer");
  assert.equal(released.focusedAction, "mark-factura-paid", "Focus returns to the exact control that opened the layer");
  assert.equal(released.bodyOverflow, "hidden", "The parent modal keeps the page scroll locked");
  assert.equal(released.payments, 0, "The whole journey issues no payment");
  checks += 1;
  console.log("PASS 5 · closing the layer restores the parent exactly and leaves no isolation marks");

  // The protection is scoped: it never freezes content, permission, control or state
  // attributes, and it does nothing at all on a panel the stack is not holding.
  const scope = await page.evaluate(async () => {
    const { modalStackProtects } = await import("/src/features/entity-overlay/modal-lifecycle.js");
    const held = document.createElement("div");
    held.setAttribute("data-modal-stack-held", "true");
    const free = document.createElement("div");
    const names = ["inert", "aria-hidden", "data-modal-stack-held", "data-modal-stack-previous-aria-hidden",
      "aria-busy", "aria-disabled", "disabled", "hidden", "class", "data-factura-id", "data-facturas-action", "aria-expanded"];
    return {
      onHeld: names.filter((name) => modalStackProtects(held, name)),
      onFree: names.filter((name) => modalStackProtects(free, name)),
    };
  });
  assert.deepEqual(scope.onHeld, ["inert", "aria-hidden", "data-modal-stack-held", "data-modal-stack-previous-aria-hidden"],
    "Only the four attributes the stack owns are protected, and only those");
  assert.deepEqual(scope.onFree, [], "Nothing is protected on a panel the stack is not holding");
  checks += 1;
  console.log("PASS 6 · the protection is scoped to the stack's own attributes on a held panel");

  assert.deepEqual(await page.evaluate(() => window.__forbiddenCalls), [], "No forbidden boundary is reached");
  assert.deepEqual(pageErrors, [], "No browser errors");
  console.log(`Shared host modal stack contract: PASS · ${checks} checks · real Facturas detail, real payment confirmation, real shared host`);
} finally {
  await browser?.close();
  fixture.kill();
}
