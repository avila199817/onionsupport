import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "playwright-core";

// Real Home dispatcher, invoice owner, templates and shared modal authorities.
// The existing fixture isolates session/API boundaries; only payment is allowed
// below, against an in-memory invoice. No live mutation or email is possible.
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
let completed = 0;
try {
  let executablePath;
  for (const path of [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/tmp/chromium"].filter(Boolean)) {
    try { await access(path); executablePath = path; break; } catch { /* next */ }
  }
  assert.ok(executablePath, "Chrome/Chromium required for invoice confirmation tests");
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", async (dialog) => { errors.push(`Unexpected native ${dialog.type()}`); await dialog.dismiss(); });
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
    if (url.pathname === "/src/views/facturas/index.js") {
      const response = await route.fetch();
      return route.fulfill({ response, body: `${await response.text()}\nexport { confirmFacturaResend as testConfirmFacturaResend };` });
    }
    return route.continue();
  });
  const panel = "[data-facturas-detail-modal='true']";
  const payment = "[data-facturas-action='mark-factura-paid']";
  const confirm = "[data-facturas-payment-confirm-action='confirm']";
  const cancel = "[data-facturas-payment-confirm-action='cancel']";

  async function fresh() {
    await page.goto(`${origin}/@fixture`);
    await page.waitForFunction(() => window.__fixtureReady === true);
    await page.evaluate(() => {
      // The fixture normally preloads this CSS; require the Home detail loader
      // itself to make confirmation styles available before opening the owner.
      document.querySelector('link[href="/src/css/views/facturas/resend-confirm.css"]')?.remove();
      window.__autoResolve = { factura: true };
      Object.assign(window.__fixtureData.factura, { estado: "pendiente", estadoPago: "pendiente", paymentStatus: "pending", pagado: 0, pendiente: 48.4 });
      window.__paymentCalls = [];
      window.__paymentRequest = (...args) => {
        __paymentCalls.push(args);
        return new Promise((resolve) => {
          window.__finishPayment = () => {
            Object.assign(__fixtureData.factura, { estado: "pagada", estadoPago: "pagada", paymentStatus: "paid", pagado: 48.4, pendiente: 0 });
            resolve(structuredClone(__fixtureData.factura));
          };
        });
      };
    });
    await page.locator("#open-factura").click();
    try { await page.locator(payment).waitFor(); }
    catch (error) {
      console.error(JSON.stringify({ errors, state: await page.evaluate(() => ({ body: document.body.innerText, snapshot: __overlay.getSnapshot(), requests: __requests.map(({ type, id }) => ({ type, id })) })) }, null, 2));
      throw error;
    }
  }
  async function scenario(name, run) {
    await fresh();
    await run();
    assert.deepEqual(await page.evaluate(() => window.__forbiddenCalls), []);
    assert.deepEqual(errors, []);
    completed += 1;
    console.log(`PASS invoice confirmation ${name}`);
  }

  await scenario("Home-first Cancel and Escape preserve the detail and exact opener", async () => {
    await page.locator(payment).click();
    await page.locator(cancel).waitFor();
    assert.equal(await page.locator(cancel).evaluate((node) => document.activeElement === node), true);
    assert.equal(await page.locator(".facturas-resend-confirm-overlay").evaluate((node) => getComputedStyle(node).position), "fixed");
    assert.equal(await page.locator("[data-fpc-dialog]").count(), 0);
    await page.keyboard.press("Tab");
    assert.equal(await page.locator(confirm).evaluate((node) => document.activeElement === node), true);
    await page.keyboard.press("Tab");
    assert.equal(await page.locator(cancel).evaluate((node) => document.activeElement === node), true);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("[data-facturas-payment-confirm-dialog]"));
    assert.equal(await page.locator(panel).count(), 1);
    assert.equal(await page.locator(payment).evaluate((node) => document.activeElement === node), true);
    assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
    assert.equal(await page.evaluate(() => __paymentCalls.length), 0);
  });

  await scenario("double activation records one payment and retains the busy close guard", async () => {
    await page.locator(payment).evaluate((node) => { node.click(); node.click(); });
    assert.equal(await page.locator(confirm).count(), 1);
    await page.locator(confirm).evaluate((node) => { node.click(); node.click(); });
    await page.waitForFunction(() => __paymentCalls.length === 1);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(panel).count(), 1);
    assert.deepEqual(await page.evaluate(() => __paymentCalls), [["fixture-factura-1"]]);
    await page.evaluate(() => __finishPayment());
    await page.getByText("Factura marcada como pagada correctamente.", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => __paymentCalls.length), 1);
  });

  await scenario("owner release cancels a pending payment decision", async () => {
    await page.locator(payment).click();
    await page.locator(cancel).waitFor();
    await page.evaluate(() => __overlay.releaseOrigin(__homeNode));
    await page.waitForFunction(() => !document.querySelector("[data-facturas-payment-confirm-dialog]"));
    assert.equal(await page.evaluate(() => __paymentCalls.length), 0);
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  });

  await scenario("role is rechecked after the asynchronous decision", async () => {
    await page.locator(payment).click();
    await page.evaluate(() => __setFixtureRole("user"));
    await page.locator(confirm).click();
    assert.equal(await page.evaluate(() => __paymentCalls.length), 0);
  });

  await scenario("resend deduplicates only identical invoice and owner signal", async () => {
    const result = await page.evaluate(async () => {
      const { testConfirmFacturaResend: resend } = await import("/src/views/facturas/index.js");
      window.__abort = new AbortController();
      const options = { factura: __fixtureData.factura, signal: __abort.signal, recipient: "<script>customer@example.test</script>" };
      window.__resendSettles = 0;
      window.__resendPromise = resend(options);
      __resendPromise.then((value) => { window.__resendValue = value; __resendSettles++; });
      const same = __resendPromise === resend(options);
      return [same, await resend({ ...options, signal: new AbortController().signal }), await resend({ ...options, factura: { id: "other" } })];
    });
    assert.deepEqual(result, [true, false, false]);
    assert.equal(await page.locator("[data-facturas-resend-confirm-dialog]").count(), 1);
    assert.equal(await page.locator("[data-facturas-resend-confirm-dialog] script").count(), 0);
    await page.locator("[data-facturas-resend-confirm-action='confirm']").evaluate((node) => { node.click(); node.click(); });
    await page.waitForFunction(() => __resendSettles === 1);
    assert.equal(await page.evaluate(() => __resendValue), true);
  });

  for (const dismissal of ["abort", "detach", "popstate", "hashchange", "pagehide", "backdrop"]) {
    await scenario(`resend ${dismissal} settles once without closing its parent`, async () => {
      await page.evaluate(async () => {
        const { testConfirmFacturaResend: resend } = await import("/src/views/facturas/index.js");
        window.__abort = new AbortController();
        window.__resendSettles = 0;
        resend({ factura: __fixtureData.factura, signal: __abort.signal }).then((value) => { window.__resendValue = value; __resendSettles++; });
      });
      await page.evaluate((kind) => {
        if (kind === "abort") __abort.abort();
        else if (kind === "detach") document.querySelector("#facturas-resend-confirm-root").remove();
        else if (kind === "backdrop") document.querySelector(".facturas-resend-confirm-overlay").click();
        else window.dispatchEvent(new Event(kind));
      }, dismissal);
      await page.waitForFunction(() => __resendSettles === 1);
      await page.evaluate(() => { __abort.abort(); window.dispatchEvent(new Event("pagehide")); });
      assert.deepEqual(await page.evaluate(() => [__resendSettles, __resendValue]), [1, false]);
      assert.equal(await page.locator(panel).count(), 1);
      assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
    });
  }
  console.log(`Invoice confirmation browser: ${completed} scenarios PASS`);
} finally {
  await browser?.close();
  if (fixture.exitCode === null) { fixture.kill("SIGTERM"); await once(fixture, "exit"); }
}
