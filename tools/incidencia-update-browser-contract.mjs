import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "playwright-core";

/* The global action of the incidencia detail: where it lives, and when it may run.
 *
 * It used to sit inside the "Añadir actualización" card, so it read as "send a comment"
 * while it already saved estado, prioridad and tipo too; and it was always enabled, so
 * pressing it with nothing pending answered with an error instead of being unavailable.
 *
 * What this pins, against the real templates and the real patcher, in a browser:
 *   - the action lives in the shell's own footer slot, a direct child of the panel,
 *     and NOT inside the composer card;
 *   - it is enabled exactly when something is really pending, by the authority in
 *     src/views/incidencias/incidencias.detail-pending.js;
 *   - whitespace is not an update, and reverting a field is not a change;
 *   - a metadata-only edit saves without inventing a comment;
 *   - none of this issues a single write.
 *
 * The footer is the part that regressed hardest while building this: the panel mounts in
 * its loading skeleton, which has no footer, and the domain patcher only ever REPLACED
 * parts it already had. A footer appearing for the first time was dropped in silence, so
 * the template emitted it and the DOM never showed it. That is why "the footer is a direct
 * child of the panel" is asserted here and not taken on trust from the template.
 *
 * API responses are fixtures. No live account, production endpoint or mutation.
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
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });

  const writes = [];
  const outside = [];
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.origin !== origin) { outside.push(url.href); return route.abort(); }
    if (method !== "GET" && method !== "HEAD") writes.push(`${method} ${url.pathname}`);
    return route.continue();
  });

  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(`${origin}/@fixture`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__fixtureReady === true);
  await page.evaluate(() => { window.__autoResolve = { incidencia: true, factura: true, cliente: true, usuario: true }; });

  const panel = "[data-incidencias-modal-panel='true']";
  const comment = `${panel} [data-detail-field='comment']`;
  await page.locator("#open-incidencia").click();
  await page.locator(comment).waitFor({ state: "visible" });
  await page.waitForTimeout(400);

  const state = () => page.evaluate(() => {
    const button = document.querySelector("[data-modal-footer='true'] .incidencias-modal-submit-btn");
    const footer = document.querySelector("[data-modal-footer='true']");
    return {
      present: Boolean(button),
      disabled: button?.disabled ?? null,
      label: (button?.innerText || "").trim(),
      pending: button?.dataset?.detailPending ?? null,
      inComposer: Boolean(button?.closest(".incidencias-modal-composer, [data-detail-card='comment']")),
      footerIsPanelChild: footer?.parentElement?.matches("[data-modal-panel='true']") ?? null,
      summary: document.querySelector("[data-detail-pending-summary='true']")?.textContent?.trim() ?? null,
    };
  });

  let now = await state();
  assert.equal(now.present, true, "The global action is rendered in the shell footer slot");
  assert.equal(now.footerIsPanelChild, true, "The footer is a direct child of the panel, not nested in the body");
  assert.equal(now.inComposer, false, "The global action never lives inside the comment card");
  assert.equal(now.label, "Actualizar incidencia", "The action is named for what it does");
  assert.equal(now.disabled, true, "Opening the modal without touching anything leaves nothing to save");
  assert.equal(now.summary, "No hay cambios pendientes.", "The footer states there is nothing pending");

  await page.locator(comment).click();
  await page.locator(comment).blur();
  await page.waitForTimeout(200);
  assert.equal((await state()).disabled, true, "Focusing and blurring a field is not a change");

  await page.locator(comment).fill("   \n  ");
  await page.waitForTimeout(250);
  assert.equal((await state()).disabled, true, "A comment of only whitespace is not an update");

  await page.locator(comment).fill("Actualización real");
  await page.waitForTimeout(250);
  now = await state();
  assert.equal(now.disabled, false, "A real comment is something to save");
  assert.equal(now.pending, "comment", "The pending parts name the comment");

  await page.locator(comment).fill("");
  await page.waitForTimeout(250);
  assert.equal((await state()).disabled, true, "Clearing the comment returns to nothing pending");

  const priority = `${panel} select[name='priority'], ${panel} [data-detail-field='priority']`;
  await page.locator(priority).first().selectOption("high");
  await page.waitForTimeout(350);
  now = await state();
  assert.equal(now.disabled, false, "A metadata-only change saves without inventing a comment");
  assert.equal(now.pending, "fields", "The pending parts name the editable fields");

  await page.locator(priority).first().selectOption("medium");
  await page.waitForTimeout(350);
  assert.equal((await state()).disabled, true, "Returning a field to its original value is not a change");

  assert.deepEqual(writes, [], "Inspecting and reverting an edit never issues a write");
  assert.deepEqual(outside, [], "No request leaves the isolated fixture origin");
  assert.deepEqual(errors, [], "No uncaught browser error");

  console.log("Incidencia update action contract: PASS");
  console.log("- the global action sits in the shell footer, a direct child of the panel, never in the comment card");
  console.log("- enabled only with something really pending: whitespace and reverted fields do not count");
  console.log("- metadata-only edits save without a comment; the whole run issues zero writes");
} finally {
  await browser?.close();
  fixture.kill("SIGTERM");
  if (fixture.exitCode === null && fixture.signalCode === null) await once(fixture, "exit");
}
