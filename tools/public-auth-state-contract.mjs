import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

// Real controllers and DOM; Auth is injected at the existing public boundary.
// No credentials, reset requests or activation tokens reach a network service.
const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const types = { ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".svg": "image/svg+xml" };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/fixture") {
    response.writeHead(200, { "Content-Type": "text/html" }).end(`<!doctype html><html lang="es" data-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Auth fixture</title><link rel="stylesheet" href="/src/css/app.css"><link rel="stylesheet" href="/src/css/auth/login.css"><link rel="stylesheet" href="/src/css/auth/login.portal-layout.css"><body><main id="fixture"></main></body></html>`);
    return;
  }
  try {
    const target = resolve(root, "." + pathname);
    if (!target.startsWith(root + "/") || /\/\.[^/]/.test(pathname)) throw new Error("Invalid path");
    const content = await readFile(target);
    response.writeHead(200, { "Content-Type": types[extname(target)] || "application/octet-stream" }).end(content);
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  const candidates = [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/chromium", "/tmp/chromium"].filter(Boolean);
  let executablePath;
  for (const candidate of candidates) { try { await access(candidate); executablePath = candidate; break; } catch {} }
  if (!executablePath) throw new Error("Set CHROME_BIN to a local Chromium executable");
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await context.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  async function mount(view, path, behavior = "pending") {
    await page.goto(origin + "/fixture");
    await page.evaluate(async ({ view, path, behavior }) => {
      const module = await import(`/src/views/public/${view}/index.js`);
      window.__calls = [];
      const operation = (payload) => {
        window.__calls.push(payload);
        if (behavior === "success") return Promise.resolve({ ok: true, activated: true });
        return new Promise((resolve, reject) => { window.__resolve = resolve; window.__reject = reject; });
      };
      const Auth = { login: operation, requestPasswordReset: operation, confirmResetPassword: operation, activateAccount: operation };
      const Router = { replace: async () => { throw new Error("fixture navigation failure"); } };
      window.__instance = module.mount(document.querySelector("#fixture"), { path, Auth, Router });
    }, { view, path, behavior });
  }

  const password = "Aa1!  nueva clave  ";
  async function fillPassword() {
    await page.locator("[name=password]").fill(password);
    await page.locator("[name=confirmPassword]").fill(password);
  }
  async function reject(code, status = 400) {
    await page.evaluate(({ code, status }) => window.__reject({ code, status, message: "private-internal-error-must-not-appear" }), { code, status });
    await page.waitForFunction(() => document.querySelector("form").getAttribute("aria-busy") === "false");
  }

  await mount("login", "/login");
  await page.locator("[type=submit]").click();
  assert.equal(await page.locator("[name=identifier]").getAttribute("aria-invalid"), "true");
  assert.equal(await page.evaluate(() => window.__calls.length), 0, "blank login must not contact Auth");
  await page.locator("[name=identifier]").fill("fixture-user");
  await page.locator("[name=password]").fill(password);
  assert.equal(await page.locator("[name=password]").getAttribute("autocomplete"), "current-password");
  await page.locator("[data-password-toggle]").focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("[name=password]").getAttribute("type"), "text");
  await page.locator("[type=submit]").click();
  assert.equal(await page.locator("form").getAttribute("aria-busy"), "true");
  assert.equal(await page.locator("[name=password]").getAttribute("type"), "password");
  assert.equal(await page.evaluate(() => window.__calls[0].password), password, "password spaces and pasted contents must remain exact");
  await page.evaluate(() => window.__instance.submit());
  assert.equal(await page.evaluate(() => window.__calls.length), 1, "pending login must deduplicate submit");
  await reject("RATE_LIMITED", 429);
  assert.match(await page.locator("[data-login-global-error]").innerText(), /demasiados intentos/i);
  assert.equal(await page.locator("[data-login-global-error]").evaluate((node) => document.activeElement === node), true);
  assert.equal(await page.locator("[type=submit]").isEnabled(), true, "recoverable errors must permit retry");
  await page.locator("[type=submit]").click();
  await reject("UNEXPECTED", 418);
  assert.doesNotMatch(await page.locator("body").innerText(), /private-internal-error/);
  await page.evaluate(() => window.__instance.destroy());
  assert.equal(await page.locator("[name=password]").inputValue(), "", "unmount clears retained password DOM");

  await mount("password-reset", "/password-request", "success");
  await page.locator("[name=identifier]").fill("fixture-user");
  await page.locator("[type=submit]").click();
  await page.waitForSelector('[data-auth-state="success"]');
  assert.match(await page.locator("[data-password-reset-message]").innerText(), /Si existe una cuenta/);
  assert.equal(await page.locator("[name=identifier]").isVisible(), false);
  await page.locator("[data-password-reset-retry]").click();
  assert.equal(await page.evaluate(() => window.__calls.length), 1, "choosing another identifier must not automatically resend email");
  assert.equal(await page.locator("[name=identifier]").isEditable(), true);
  assert.equal(await page.locator("[name=identifier]").evaluate((node) => document.activeElement === node), true);

  for (const [view, path] of [["password-reset", "/password-reset"], ["activate-account", "/activate-account"]]) {
    await mount(view, path);
    assert.equal(await page.locator("[name=password]").isDisabled(), true);
    assert.equal(await page.locator("[name=password]").isVisible(), false);
    assert.equal(await page.locator('[data-auth-state="invalid"]').count(), 1);
    await page.evaluate(() => window.__instance.submit());
    assert.equal(await page.evaluate(() => window.__calls.length), 0, "missing tokens never contact Auth");
    assert.equal(await page.locator(".password-reset-links a").first().isVisible(), true);
  }

  for (const [view, code] of [["password-reset", "RESET_TOKEN_EXPIRED"], ["password-reset", "RESET_TOKEN_ALREADY_USED"], ["activate-account", "TOKEN_EXPIRED"], ["activate-account", "ACTIVATION_STATE_CHANGED"]]) {
    const path = `/${view === "password-reset" ? "password-reset" : "activate-account"}?token=fixture-token-only`;
    await mount(view, path);
    await fillPassword();
    await page.locator("[type=submit]").click();
    assert.equal(await page.locator("[type=submit]").getAttribute("aria-busy"), "true");
    await reject(code);
    assert.equal(await page.locator('[data-auth-state="invalid"]').count(), 1);
    assert.equal(await page.locator("[name=password]").inputValue(), "");
    assert.equal(await page.locator("[type=submit]").isDisabled(), true);
    await page.evaluate(() => window.__instance.submit());
    assert.equal(await page.evaluate(() => window.__calls.length), 1, "invalid token must not be resubmitted");
    assert.equal(await page.evaluate(() => window.__instance.unlock()), false);
    assert.doesNotMatch(await page.locator("#fixture").innerHTML(), /fixture-token-only|private-internal-error/);
    assert.doesNotMatch(await page.evaluate(() => JSON.stringify(window.__instance.getSnapshot())), /fixture-token-only/);
  }

  await mount("password-reset", "/password-reset?token=fixture-token-only", "success");
  await fillPassword();
  await page.locator("[type=submit]").click();
  await page.waitForSelector('[data-auth-state="success"]');
  await page.waitForFunction(() => document.querySelector("form").getAttribute("aria-busy") === "false");
  assert.match(await page.locator("[data-password-reset-message]").innerText(), /Ya puedes iniciar sesión/);
  assert.equal(await page.locator("[name=password]").inputValue(), "");
  assert.equal(await page.locator("[data-password-reset-back]").isVisible(), true);
  assert.equal(await page.evaluate(() => window.__instance.unlock()), false, "completed reset cannot repeat mutation");

  await mount("activate-account", "/activate-account?token=fixture-token-only");
  await fillPassword();
  await page.locator("[name=confirmPassword]").fill("Aa1!mismatch");
  await page.locator("[type=submit]").click();
  assert.equal(await page.evaluate(() => window.__calls.length), 0, "mismatched activation passwords must not reach Auth");
  assert.equal(await page.locator("[name=confirmPassword]").getAttribute("aria-invalid"), "true");
  await fillPassword();
  await page.locator("[type=submit]").click();
  await reject("WEAK_PASSWORD");
  assert.equal(await page.locator("[name=password]").getAttribute("aria-invalid"), "true");
  assert.equal(await page.locator("[name=password]").evaluate((node) => document.activeElement === node), true, "backend field errors must focus the re-enabled field");
  assert.equal(await page.locator("[type=submit]").isEnabled(), true);

  await mount("activate-account", "/activate-account?token=fixture-token-only", "success");
  await fillPassword();
  await page.locator("[type=submit]").click();
  await page.waitForSelector('[data-auth-state="success"]');
  assert.equal(await page.locator("[name=password]").inputValue(), "");
  assert.equal(await page.locator("[data-activate-account-back]").isVisible(), true);
  await page.evaluate(() => window.__instance.destroy());

  await mount("activate-account", "/activate-account?token=fixture-token-only");
  await fillPassword();
  await page.locator("[type=submit]").click();
  await reject("ACCOUNT_ALREADY_ACTIVE");
  assert.equal(await page.locator('[data-auth-state="success"]').count(), 1);
  assert.equal(await page.locator("[name=password]").inputValue(), "");
  await page.evaluate(() => window.__instance.destroy());

  await mount("password-reset", "/password-request");
  await page.locator("[name=identifier]").fill("fixture-user");
  await page.locator("[type=submit]").click();
  await page.evaluate(() => { window.__instance.destroy(); document.querySelector("#fixture").textContent = "Next view"; window.__resolve({ ok: true }); });
  assert.equal(await page.locator("#fixture").innerText(), "Next view", "late completion must not overwrite the next view");
  assert.deepEqual(pageErrors, []);
  console.log("✅ public auth states · injected Auth only · validation/pending/retry/terminal/lifecycle/password privacy");
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
