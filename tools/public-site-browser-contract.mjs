import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { PUBLIC_SITE, pageMetadata } from "../src/core/public-site.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
const server = createServer(async (request, response) => {
  try {
    let path = new URL(request.url, "http://localhost").pathname;
    if (path === "/") path = "/index.html";
    if (path === "/login") path = "/login.html";
    const target = resolve(ROOT, "." + path);
    if (!target.startsWith(ROOT) || /\/\.[^/]/.test(path)) throw new Error("Invalid test path");
    const data = await readFile(target);
    response.writeHead(200, { "Content-Type": types[extname(target)] || "application/octet-stream", "Cache-Control": "no-store" }).end(data);
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
  const context = await browser.newContext();
  await context.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function inspect(path) {
    await page.waitForFunction((expected) => window.location.pathname === expected && document.documentElement.dataset.appReady === "true", path, { timeout: 30000 });
    const actual = await page.evaluate(() => ({ title: document.title, canonical: [...document.querySelectorAll('head link[rel="canonical"]')].map((node) => node.href), robots: ["robots", "googlebot", "bingbot"].map((name) => [...document.querySelectorAll(`meta[name="${name}"]`)].map((node) => node.content)), description: document.querySelector('meta[name="description"]')?.content, schemaCount: document.querySelectorAll('script[type="application/ld+json"]').length }));
    const expected = pageMetadata(path);
    assert.equal(actual.title, expected.title);
    assert.deepEqual(actual.canonical, [PUBLIC_SITE.origin + path]);
    assert.deepEqual(actual.robots, Array(3).fill([path === "/" ? "index, follow" : "noindex, follow"]));
    assert.equal(actual.schemaCount, path === "/" ? 1 : 0);
    assert.equal(actual.description, expected.description);
  }
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await inspect("/");
  await page.waitForSelector("[data-public-support-form] [name='phone']");
  const mutationInvalidation = await page.evaluate(async () => {
    const { mutationsTouchSelector } = await import("/src/core/dom-mutations.js");
    const root = document.createElement("div");
    root.innerHTML = '<section data-public-home><form data-public-support-form><p>0 / 4000</p></form></section>';
    const observer = new MutationObserver(() => {});
    observer.observe(root, { childList: true, subtree: true });
    const relevant = "[data-public-home], [data-public-support-form]";
    const counts = [];
    for (let index = 1; index <= 20; index += 1) {
      root.querySelector("p").textContent = `${index} / 4000`;
      counts.push(mutationsTouchSelector(observer.takeRecords(), relevant));
    }
    const form = root.querySelector("form");
    form.replaceWith(form.cloneNode(true));
    const replacement = mutationsTouchSelector(observer.takeRecords(), relevant);
    root.innerHTML = '<div class="route-view-host"><section data-public-home></section></div>';
    const navigation = mutationsTouchSelector(observer.takeRecords(), relevant);
    observer.disconnect();
    return { textChanges: counts.filter(Boolean).length, replacement, navigation };
  });
  assert.deepEqual(mutationInvalidation, { textChanges: 0, replacement: true, navigation: true }, "typing must not rescan the home, while form replacements and SPA mounts still do");
  assert.equal(await page.evaluate(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("/mobile-datalist/"))), false, "public home must not load private table enhancement");
  const navigationToken = await page.evaluate(() => (window.__metadataNavigationProbe = Math.random()));
  for (const path of ["/login", "/", "/login", "/"]) {
    await page.evaluate(async (target) => { const { default: router } = await import("/src/router/index.js"); await router.navigate(target); }, path);
    await inspect(path);
    assert.equal(await page.evaluate(() => window.__metadataNavigationProbe), navigationToken, "navigation must stay in the same document");
    if (path === "/") {
      await page.waitForSelector("[data-public-support-form] [name='phone']");
      assert.equal(await page.locator("[data-public-support-form]").count(), 1, "returning to home must mount one support form");
    }
  }
  await page.goto(origin + "/login", { waitUntil: "domcontentloaded" });
  await inspect("/login");
  assert.deepEqual(errors, [], "frontend must not throw during metadata navigation");
  await context.close();
  console.log("Public site browser: PASS · direct home/login · real Router home↔login twice · same document · no inherited metadata");
} finally {
  if (browser) await browser.close();
  await new Promise((done) => server.close(done));
}
