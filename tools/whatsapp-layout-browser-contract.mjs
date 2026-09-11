import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

// Real compiled SPA, Auth selectors/guards, Router, private stylesheet loader,
// WhatsApp controller and templates. Only an in-memory synthetic session and
// HTTP responses are fixtures. No real login, account, payment or message.
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = resolve(ROOT, process.env.ONION_BUILD_OUT_DIR || "dist");
const chunks = await readdir(resolve(DIST, "assets/js"));
function chunk(prefix) {
  const found = chunks.filter((name) => name.startsWith(prefix) && name.endsWith(".js"));
  assert.equal(found.length, 1, `Expected one ${prefix} chunk`);
  return `/assets/js/${found[0]}`;
}
const main = chunk("main-");
const auth = chunk("auth-");
const originalHtml = await readFile(resolve(DIST, "index.html"), "utf8");
assert.equal(originalHtml.split(`src="${main}"`).length, 2);
const html = originalHtml.replace(`src="${main}"`, 'src="/__r06-bootstrap.mjs"');
const user = { id: "synthetic-r06-admin", username: "synthetic-r06", slug: "synthetic-r06", displayName: "Prueba sintética R06", email: "r06@example.invalid", role: "admin", roles: ["admin"], active: true };
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const token = `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub: user.id, role: "admin", exp: 4102444800 })}.synthetic-not-a-signature`;
const bootstrap = `import * as namespace from ${JSON.stringify(auth)};
const Auth = Object.values(namespace).find(value => value && typeof value.applySession === 'function' && typeof value.isAuthenticated === 'function');
if (!Auth) throw new Error('Actual Auth export not found');
if (location.pathname !== '/') {
  Auth.applySession(${JSON.stringify({ token, user, hasRefreshToken: false })});
  if (!Auth.isAuthenticated()) throw new Error('Synthetic session did not initialize');
}
await import(${JSON.stringify(main)});`;
const types = { ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon" };
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
    let body, type;
    if (path === "/__r06-bootstrap.mjs") { body = bootstrap; type = "text/javascript"; }
    else if (!extname(path) && !path.startsWith("/api/")) { body = html; type = "text/html"; }
    else {
      const file = resolve(DIST, path.replace(/^\/+/, ""));
      assert.ok(file.startsWith(`${DIST}${sep}`));
      assert.ok((await stat(file)).isFile());
      body = await readFile(file); type = types[extname(file)] || "application/octet-stream";
    }
    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }).end(body);
  } catch { response.writeHead(404).end("Not found"); }
});
await new Promise((done, fail) => { server.once("error", fail); server.listen(0, "127.0.0.1", done); });
const origin = `http://127.0.0.1:${server.address().port}`;
const conversations = Array.from({ length: 60 }, (_, index) => ({ id: `synthetic-conversation-${index}`, conversationId: `synthetic-conversation-${index}`, waId: `000000${String(index).padStart(6, "0")}`, whatsappProfileName: `Conversación sintética ${index}`, lastMessageAt: "2026-09-11T10:00:00.000Z" }));
let browser;
const results = [];
try {
  let executablePath;
  for (const candidate of [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean)) {
    try { await access(candidate); executablePath = candidate; break; } catch { /* next installed browser */ }
  }
  assert.ok(executablePath, "Chrome/Chromium is required; set CHROME_BIN");
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  for (const [name, width, height] of [["desktop", 1440, 1000], ["tablet", 1024, 768], ["mobile", 390, 844], ["landscape", 844, 390]]) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: "light", serviceWorkers: "block", reducedMotion: "reduce" });
    const requests = [], writes = [], errors = [], stylesheetRequests = [];
    await context.route("**/*", async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname.startsWith("/api/")) {
        requests.push({ method: request.method(), path: url.pathname });
        const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": request.headers()["access-control-request-headers"] || "authorization,content-type", "Access-Control-Allow-Methods": "GET,OPTIONS" };
        if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
        if (request.method() === "POST" && url.pathname.endsWith("/auth/refresh")) return route.fulfill({ status: 401, headers, json: { ok: false, code: "SYNTHETIC_NO_REFRESH_SESSION" } });
        if (request.method() !== "GET") { writes.push(url.pathname); return route.fulfill({ status: 405, headers, json: { ok: false, code: "SYNTHETIC_READ_ONLY" } }); }
        let data = { ok: true, items: [], count: 0, data: {} };
        if (url.pathname.endsWith("/whatsapp/_meta")) data = { ok: true, service: "whatsapp", enabled: true, configured: true, ready: true };
        else if (url.pathname.endsWith("/whatsapp/conversations")) data = { ok: true, items: conversations };
        else if (/\/whatsapp\/conversations\/[^/]+\/messages$/.test(url.pathname)) {
          const conversationId = url.pathname.split("/").at(-2);
          data = { ok: true, conversationId, items: Array.from({ length: 120 }, (_, index) => ({ id: `synthetic-message-${index}`, conversationId, type: "text", direction: index % 2 ? "inbound" : "outbound", status: "delivered", timestamp: "2026-09-11T10:00:00.000Z", content: { text: `Mensaje sintético ${index}. ${"Texto largo para comprobar ajuste de línea y scroll. ".repeat(4)}` } })) };
        } else if (url.pathname.endsWith("/auth/me")) data = { ok: true, user };
        return route.fulfill({ status: 200, headers, json: data });
      }
      if (url.origin !== origin) return route.abort();
      if (url.pathname.endsWith(".css")) stylesheetRequests.push(url.pathname);
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      // Anonymous Home must not request the fingerprinted private stylesheet.
      await page.goto(origin, { waitUntil: "load" });
      await page.waitForFunction(() => window.__ONION_MAIN__?.state === "ready");
      assert.equal(stylesheetRequests.some((path) => /\/private-[^/]+\.css$/.test(path)), false);
      stylesheetRequests.length = 0;
      await page.goto(`${origin}/whatsapp`, { waitUntil: "load" });
      await page.locator(".whatsapp-conversation").first().waitFor({ state: "visible" });
      await page.locator(".whatsapp-conversation").first().click();
      await page.locator(".whatsapp-message").first().waitFor({ state: "visible" });
      assert.ok(stylesheetRequests.some((path) => /\/private-[^/]+\.css$/.test(path)), "Authenticated route must request built private CSS");
      assert.equal(stylesheetRequests.includes("/src/css/private.css"), false, "Normal build must not need raw fallback");
      assert.ok(requests.some(({ path }) => path.endsWith("/whatsapp/conversations")));

      async function geometry(label) {
        const state = await page.evaluate(() => {
          const selectors = [".main-content", "#app-content", "#view-container", '.route-view-host[data-view-key="whatsapp"]:not([hidden])', ".whatsapp-page", ".whatsapp-workspace", ".whatsapp-thread-pane", ".whatsapp-thread-scroll", ".whatsapp-composer"];
          return Object.fromEntries(selectors.map((selector) => {
            const node = document.querySelector(selector);
            if (!node) return [selector, null];
            const box = node.getBoundingClientRect(), css = getComputedStyle(node);
            return [selector, { top: box.top, bottom: box.bottom, width: box.width, height: box.height, display: css.display, overflowY: css.overflowY, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight }];
          }));
        });
        const mainBox = state[".main-content"], workspace = state[".whatsapp-workspace"], thread = state[".whatsapp-thread-scroll"], composer = state[".whatsapp-composer"];
        assert.ok(mainBox && workspace && thread && composer, `${name}/${label}: actual height chain exists`);
        assert.ok(workspace.height > 100 && workspace.height >= mainBox.height * 0.75, `${name}/${label}: full-height workspace ${JSON.stringify(state)}`);
        assert.ok(workspace.bottom <= mainBox.bottom + 2 && workspace.bottom >= mainBox.bottom - 24, `${name}/${label}: no missing bottom height`);
        assert.ok(composer.height > 0 && composer.bottom <= workspace.bottom + 2, `${name}/${label}: composer remains within workspace`);
        assert.ok(thread.clientHeight > 20 && thread.scrollHeight > thread.clientHeight, `${name}/${label}: long history scrolls inside its panel`);
        assert.ok(["auto", "scroll"].includes(thread.overflowY), `${name}/${label}: thread owns vertical scroll`);
        const moved = await page.locator(".whatsapp-thread-scroll").evaluate((node) => { node.scrollTop = 0; node.scrollTop = 75; return node.scrollTop; });
        assert.ok(moved > 0, `${name}/${label}: inner scroll is operable`);
        results.push({ viewport: name, label, workspaceHeight: workspace.height, threadHeight: thread.clientHeight, composerHeight: composer.height });
      }
      await geometry("direct-light");
      const draft = page.locator("[data-whatsapp-draft='true']");
      await draft.fill("Borrador sintético, no enviar.\n".repeat(12));
      await draft.press("Shift+Enter");
      assert.equal(await draft.evaluate((node) => document.activeElement === node), true, "Keyboard focus stays in composer");
      await geometry("long-draft");
      await page.emulateMedia({ colorScheme: "dark" });
      await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
      await geometry("system-dark");
      await page.emulateMedia({ colorScheme: "light" });
      if (await page.locator(".whatsapp-mobile-back").isVisible()) {
        await page.locator(".whatsapp-mobile-back").click();
        await page.locator(".whatsapp-conversation").first().waitFor({ state: "visible" });
        await page.locator(".whatsapp-conversation").first().click();
        await page.locator(".whatsapp-message").first().waitFor({ state: "visible" });
        await geometry("mobile-panel-return");
      }
      // The real document click handler owns these fixture navigation links.
      await page.evaluate(() => { const link = document.createElement("a"); link.id = "r06-nav"; link.href = "/cuenta"; link.textContent = "Ruta sintética"; document.body.append(link); link.click(); link.remove(); });
      await page.waitForFunction(() => !document.querySelector(".whatsapp-page") && location.pathname.endsWith("/cuenta"));
      await page.goBack();
      await page.locator(".whatsapp-conversation").first().waitFor({ state: "visible" });
      await page.locator(".whatsapp-conversation").first().click();
      await page.locator(".whatsapp-message").first().waitFor({ state: "visible" });
      await geometry("route-back");
      await page.goForward();
      await page.waitForFunction(() => !document.querySelector(".whatsapp-page") && location.pathname.endsWith("/cuenta"));
      assert.deepEqual(writes, [], "Layout checks must never attempt financial or communication mutations");
      assert.deepEqual(errors, [], "No uncaught browser errors");
      console.log(`WhatsApp layout: PASS ${name} · actual route/direct/back/forward · private CSS request · long history/draft · system theme · focus`);
    } catch (error) {
      const diagnostic = await page.evaluate(() => ({ path: location.pathname, hosts: [...document.querySelectorAll(".route-view-host")].map((host) => ({ key: host.dataset.viewKey, hidden: host.hidden })), main: window.__ONION_MAIN__?.state, whatsapp: Boolean(document.querySelector(".whatsapp-page")) })).catch(() => ({}));
      console.error(JSON.stringify({ viewport: name, diagnostic, requests, writes, errors, stylesheetRequests }));
      throw error;
    } finally { await context.close(); }
  }
  console.log(JSON.stringify({ schema: "onionsupport.whatsapp-layout.v1", results, boundaries: "in-memory synthetic Auth session; all API intercepted, all external network aborted; no sends" }, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise((done, fail) => server.close((error) => error ? fail(error) : done()));
}
