import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium } from "playwright-core";

const ROOT = new URL("../", import.meta.url);
const FEATURES = [
  "public-support", "public-postal-autofill", "public-home-experience",
  "public-support-progress", "public-support-extreme",
];
const sourcePaths = new Set([
  ...FEATURES.map((name) => `/src/features/${name}/index.js`),
  "/src/core/dom-mutations.js", "/src/core/async-scope.js",
]);
const mocks = new Map([
  ["/src/core/index.js", `
    export const AppCore = {
      getState: () => window.__formSession || {},
      runtimeState: { read: () => window.__formSession || {} },
      isAuthenticated: () => window.__formSession?.authenticated === true,
    };
  `],
  ["/src/core/http.js", `
    export default {
      post(endpoint, body, options) {
        return new Promise((resolve, reject) => {
          // Deliberately ignore abort so stale-result protection is also exercised.
          window.__publicRequests.push({ endpoint, body, options, resolve, reject });
        });
      },
    };
  `],
  ["/src/features/avatar-system/index.js", `
    export function resolveAvatarPresentation() {
      return { fingerprint: "fixture", email: "", username: "", initials: "TU" };
    }
    export default { mount() {}, syncHost() {} };
  `],
  ["/src/core/media.js", "export const sanitizeRuntimeImageUrl = (value) => value || '';"],
]);
const fixture = `<!doctype html><html lang="es"><meta charset="utf-8">
<title>Public support isolated browser contract</title>
<style>
  [hidden], .public-support-honeypot, .public-support-person { display:none !important }
  body { margin:20px; font:16px sans-serif }
  svg { width:24px; height:24px }
  form { max-width:640px }
  label, input, textarea { display:block }
  input, textarea { margin-bottom:8px }
  .public-support-submit-overlay { position:fixed; inset:0; z-index:1000; background:white; padding:40px }
</style>
<button id="outside-before">Outside before</button>
<main id="view-container"><section data-public-home="true">
  <div class="public-home-content"><div class="public-home-hero"></div></div>
</section></main><button id="outside-after">Outside after</button>
<script type="module">
  window.__formSession = new URL(location.href).searchParams.has("authenticated")
    ? { authenticated:true, currentUser:{ id:"fixture-user", fullName:"Ana Prueba", email:"ana@example.test" } }
    : {};
  window.__publicRequests = [];
  window.__publicAccepted = [];
  window.addEventListener("onion:public-support:accepted", (event) => window.__publicAccepted.push(event.detail));
  ${FEATURES.map((name) => `await import("/src/features/${name}/index.js");`).join("\n")}
  window.__fixtureReady = true;
</script></html>`;

const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://localhost").pathname;
    if (path === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(fixture);
      return;
    }
    let body = mocks.get(path);
    if (body === undefined && sourcePaths.has(path)) {
      body = await readFile(new URL(path.slice(1), ROOT), "utf8");
      if (path === "/src/features/public-support-extreme/index.js") {
        const cssImport = 'import "../../css/views/public/support-extreme.css";';
        assert.equal(body.split(cssImport).length, 2, "transform only the known CSS import");
        body = body.replace(cssImport, "");
      }
    }
    if (body === undefined) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" }).end(body);
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const FORM = "[data-public-support-form]";
const OVERLAY = "[data-public-support-submit-overlay]";
const NEUTRAL = { ok: true, success: true, accepted: true, ticketId: null, incidenciaId: null, activationRequired: null };
const AUTHENTICATED = {
  ok: true, success: true, accepted: true,
  ticketId: "INC-20260908-ABC123", incidenciaId: "INC-20260908-ABC123", activationRequired: false,
};
let browser;
try {
  let executablePath;
  for (const candidate of [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/chromium", "/tmp/chromium"].filter(Boolean)) {
    try { await access(candidate); executablePath = candidate; break; } catch {}
  }
  if (!executablePath) throw new Error("Set CHROME_BIN to a local Chromium executable");
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext();
  await context.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const field = (name) => page.locator(`${FORM} [name="${name}"]`);
  const submit = page.locator(`${FORM} button[type="submit"]`);
  async function load(authenticated = false) {
    await page.goto(origin + (authenticated ? "/?authenticated=1" : "/"), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__fixtureReady === true);
    await page.waitForSelector(`${FORM}[data-public-postal-autofill-ready="true"]`);
  }
  async function fill() {
    for (const [name, value] of Object.entries({
      fullName: "Ana Prueba", email: "ana@example.test", phone: "612345678",
      address: "Calle Mayor 10", postalCode: "28001", city: "Madrid",
      subject: "El ordenador no arranca", description: "Desde esta mañana el ordenador no consigue arrancar.",
    })) await field(name).fill(value);
    assert.equal(await field("province").inputValue(), "Madrid");
  }
  async function send(count) {
    await submit.click();
    await page.waitForFunction((expected) => window.__publicRequests.length === expected, count);
  }
  async function settle(index, value, reject = false) {
    await page.evaluate(({ index, value, reject }) => {
      window.__publicRequests[index][reject ? "reject" : "resolve"](value);
    }, { index, value, reject });
    await page.waitForFunction(() => document.querySelector("[data-public-support-form]")?.dataset.submitting !== "true");
    await page.waitForFunction(() => document.querySelector("[data-public-support-submit-overlay]")?.hidden === true);
  }
  async function paste(value) {
    await field("phone").evaluate((input, text) => {
      input.focus(); input.select();
      const data = new DataTransfer(); data.setData("text/plain", text);
      input.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
    }, value);
  }

  // Real empty-form validation and progressive postal autofill share accessible errors.
  await load();
  await submit.click();
  assert.equal(await field("fullName").getAttribute("aria-invalid"), "true");
  assert.equal(await field("province").getAttribute("aria-invalid"), "true");
  const describedBy = (await field("postalCode").getAttribute("aria-describedby")).split(/\s+/);
  assert.ok(describedBy.includes("public-support-postal-help"));
  assert.ok(describedBy.includes("public-support-error-postalCode"));
  await field("postalCode").fill("28001");
  assert.equal(await field("province").inputValue(), "Madrid");
  assert.notEqual(await field("province").getAttribute("aria-invalid"), "true");
  assert.equal(await page.locator("#public-support-error-province").isHidden(), true);
  assert.equal(await page.evaluate(() => window.__publicRequests.length), 0);

  // Clipboard normalization sees complete international input despite maxlength=11.
  for (const value of ["+34 612 345 678", "+34612345678", "0034612345678"]) {
    await paste(value);
    assert.equal(await field("phone").inputValue(), "612 345 678");
    assert.equal(await field("phone").evaluate((input) => input.selectionStart), 11);
  }
  await field("phone").evaluate((input) => input.setSelectionRange(3, 3));
  await page.keyboard.press("Delete");
  assert.equal(await field("phone").inputValue(), "612 456 78");
  await paste("+34 612 345 678");
  await field("phone").evaluate((input) => input.setSelectionRange(4, 4));
  await page.keyboard.press("Backspace");
  assert.equal(await field("phone").inputValue(), "613 456 78");
  for (const value of ["6123456789", "+34 34612345678"]) {
    await paste(value);
    await field("phone").blur();
    assert.equal(await field("phone").inputValue(), value, "excess digits must remain visible and unaccepted");
  }

  // Double submit produces one request; pending interaction stays inside the dialog.
  await load(); await fill();
  await page.locator(FORM).evaluate((form) => {
    for (let index = 0; index < 2; index++) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => window.__publicRequests.length === 1);
  await page.waitForFunction(() => document.querySelector("[data-public-home]").inert === true);
  await page.waitForFunction(() => document.activeElement === document.querySelector("[data-public-support-submit-overlay]"));
  for (const key of ["Tab", "Shift+Tab", "Escape"]) {
    await page.keyboard.press(key);
    assert.equal(await page.locator(OVERLAY).evaluate((overlay) => !overlay.hidden && overlay.contains(document.activeElement)), true);
  }
  await page.locator("#outside-after").evaluate((button) => button.focus());
  assert.equal(await page.locator(OVERLAY).evaluate((overlay) => overlay.contains(document.activeElement)), true);
  const first = await page.evaluate(() => ({
    key: window.__publicRequests[0].options.headers["Idempotency-Key"],
    endpoint: window.__publicRequests[0].endpoint, auth: window.__publicRequests[0].options.auth,
    phone: window.__publicRequests[0].body.phone,
  }));
  assert.equal(first.endpoint, "/api/tickets/public");
  assert.equal(first.auth, false); assert.equal(first.phone, "+34 612 345 678");
  assert.ok(first.key);
  await settle(0, { status: 503 }, true);
  await page.waitForFunction(() => document.querySelector("[data-public-support-submit-label]").textContent === "Reintentar incidencia");
  assert.equal(await page.locator("[data-public-home]").evaluate((home) => home.inert), false);
  assert.equal(await page.locator("[data-public-support-status]").evaluate((status) => document.activeElement === status), true);
  await send(2);
  assert.equal(await page.evaluate(() => window.__publicRequests[1].options.headers["Idempotency-Key"]), first.key);
  await settle(1, { status: 503 }, true);
  await field("subject").fill("El ordenador sigue sin arrancar");
  await send(3);
  assert.notEqual(await page.evaluate(() => window.__publicRequests[2].options.headers["Idempotency-Key"]), first.key);
  await settle(2, { status: 422, payload: { errors: [{ field: "city", message: "Revisa el municipio." }] } }, true);
  assert.equal(await field("city").getAttribute("aria-invalid"), "true");
  assert.equal(await page.locator("#public-support-error-city").textContent(), "Revisa el municipio.");

  // Neutral acceptance clears issue content and locks on either original identity.
  await load(); await fill(); await send(1); await settle(0, NEUTRAL);
  assert.equal(await page.locator("[data-public-support-submit-label]").textContent(), "Solicitud recibida");
  assert.equal(await field("subject").inputValue(), "");
  assert.equal(await field("description").inputValue(), "");
  assert.equal(await page.locator("[data-public-support-counter]").textContent(), "0 / 4000");
  assert.equal(await page.evaluate(() => window.__publicAccepted.length), 1);
  assert.equal(await submit.isDisabled(), true);
  await field("email").fill("otra@example.test");
  assert.equal(await submit.isDisabled(), true, "unchanged phone keeps the lock");
  await page.locator(FORM).evaluate((form) => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  assert.equal(await page.evaluate(() => window.__publicRequests.length), 1, "the identity lock also prevents programmatic resubmission");
  await field("phone").fill("699888777");
  assert.equal(await submit.isDisabled(), false, "changing both identities releases the lock");
  await field("email").fill("ana@example.test");
  assert.equal(await submit.isDisabled(), true, "restoring the accepted email restores the lock");

  // An HTTP 2xx with no accepted envelope cannot clear fields or lock the form.
  await load(); await fill(); await send(1); await settle(0, null);
  assert.equal(await field("subject").inputValue(), "El ordenador no arranca");
  assert.equal(await submit.isDisabled(), false);
  assert.equal(await page.locator(FORM).getAttribute("data-active-ticket"), "false");
  assert.equal(await page.evaluate(() => window.__publicAccepted.length), 0);

  // Authenticated acceptance uses the canonical shaped response.
  await load(true); await fill(); await send(1);
  assert.equal(await page.evaluate(() => window.__publicRequests[0].options.auth), true);
  await settle(0, AUTHENTICATED);
  assert.equal(await page.locator("[data-public-support-submit-label]").textContent(), "Incidencia en curso");
  assert.equal(await page.evaluate(() => window.__publicAccepted[0].ticketId), AUTHENTICATED.ticketId);

  // Detachment aborts I/O and ignores a later resolution even if transport ignores abort.
  await load(); await fill(); await send(1);
  await page.locator("[data-public-home]").evaluate((home) => home.remove());
  await page.waitForFunction(() => window.__publicRequests[0].options.signal.aborted === true);
  await page.evaluate((response) => window.__publicRequests[0].resolve(response), NEUTRAL);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  assert.equal(await page.evaluate(() => window.__publicAccepted.length), 0);
  assert.equal(await page.locator(OVERLAY).isHidden(), true);
  assert.deepEqual(errors, [], "isolated real form modules must not throw");
  await context.close();
  console.log("Public support browser: PASS · real form modules · validation/postal/phone · single submission · focus · retry identity · accepted envelope · unmount cancellation");
} finally {
  if (browser) await browser.close();
  await new Promise((done) => server.close(done));
}
