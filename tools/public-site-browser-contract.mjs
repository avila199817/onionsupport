import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { PUBLIC_SITE, PUBLIC_SERVICES, pageMetadata } from "../src/core/public-site.js";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const DIST = resolve(ROOT, process.env.ONION_BUILD_OUT_DIR || "dist");
let serveDist = false;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
const server = createServer(async (request, response) => {
  try {
    let path = new URL(request.url, "http://localhost").pathname;
    if (path === "/") path = "/index.html";
    if (path === "/login") path = "/login.html";
    const service = PUBLIC_SERVICES.find((item) => item.path === path);
    if (service) path = "/" + service.file;
    if (["/password-request", "/password-reset", "/activate-account"].includes(path)) path = "/index.html";
    const directory = serveDist ? DIST : ROOT;
    const target = resolve(directory, "." + path);
    if (!target.startsWith(directory + "/") || /\/\.[^/]/.test(path)) throw new Error("Invalid test path");
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
  async function inspectHomeScroll() {
    await page.locator(".public-home-brand").click();
    await page.waitForFunction(() => Number(document.querySelector("[data-public-home]")?.dataset.scrollProgress) === 0);
    await page.getByRole("link", { name: "Ver servicios", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".main-content").scrollTop > 20);
    const rail = page.locator("[data-public-home-scrollbar]");
    if (await rail.isVisible()) {
      const bounds = await rail.boundingBox();
      await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.waitForFunction(() => {
        const host = document.querySelector(".main-content");
        const progress = host.scrollTop / (host.scrollHeight - host.clientHeight);
        const track = document.querySelector("[data-public-home-scrollbar]").getBoundingClientRect();
        const thumb = document.querySelector("[data-public-home-scrollbar-thumb]").getBoundingClientRect();
        return progress > 0.35 && progress < 0.65 && thumb.top > track.top + 5 && thumb.bottom < track.bottom;
      });
    }
    const rootMetrics = await page.locator("[data-public-home]").evaluate((root) => [...root.style].filter((name) => name.startsWith("--public-home-scroll")));
    assert.deepEqual(rootMetrics, [], "scrollbar metrics must not invalidate the entire home through inherited CSS variables");
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
    const identity = document.createElement("span");
    identity.className = "public-support-account";
    root.querySelector("section").append(identity);
    const identityChange = mutationsTouchSelector(observer.takeRecords(), ".public-support-account");
    root.innerHTML = '<div class="route-view-host"><section data-public-home></section></div>';
    const navigation = mutationsTouchSelector(observer.takeRecords(), relevant);
    observer.disconnect();
    return { textChanges: counts.filter(Boolean).length, replacement, identityChange, navigation };
  });
  assert.deepEqual(mutationInvalidation, { textChanges: 0, replacement: true, identityChange: true, navigation: true }, "typing must not rescan the home, while form/identity replacements and SPA mounts still do");
  await page.waitForFunction(() => window.__ONION_MAIN__?.enhancementsReady === true);
  assert.equal(await page.evaluate(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("/mobile-datalist/"))), false, "public home must not load private table enhancement");
  await inspectHomeScroll();
  const navigationToken = await page.evaluate(() => (window.__metadataNavigationProbe = Math.random()));
  for (const path of ["/login", "/", "/login", "/"]) {
    await page.evaluate(async (target) => { const { default: router } = await import("/src/router/index.js"); await router.navigate(target); }, path);
    await inspect(path);
    assert.equal(await page.evaluate(() => window.__metadataNavigationProbe), navigationToken, "navigation must stay in the same document");
    if (path === "/") {
      await page.waitForSelector("[data-public-support-form] [name='phone']");
      assert.equal(await page.locator("[data-public-support-form]").count(), 1, "returning to home must mount one support form");
      await inspectHomeScroll();
    }
  }
  await page.setViewportSize({ width: 412, height: 915 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await inspect("/");
  await inspectHomeScroll();
  await page.goto(origin + "/login", { waitUntil: "domcontentloaded" });
  await inspect("/login");

  async function inspectPublicLayout() {
    const reject = page.getByRole("button", { name: "Rechazar", exact: true });
    if (await reject.isVisible()) await reject.click();
    const layout = await page.evaluate(() => {
      const visible = (node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden";
      const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
      const headings = [...document.querySelectorAll("h1")].filter(visible);
      const footer = document.querySelector(".public-legal-footer");
      const clippedHeadings = [...document.querySelectorAll("h1,h2")].filter(visible).filter((node) => {
        const range = document.createRange(); range.selectNodeContents(node);
        const text = range.getBoundingClientRect(); const box = node.getBoundingClientRect();
        return text.width > box.width + 3 && getComputedStyle(node).overflowX !== "visible";
      }).map((node) => node.textContent.trim());
      return {
        visibleH1: headings.length,
        nestedMain: document.querySelectorAll("main main").length,
        duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        innerOverflow: [...document.querySelectorAll(".main-content,.public-auth-body")].some((node) => node.scrollWidth > node.clientWidth + 1),
        footerCount: document.querySelectorAll(".public-legal-footer").length,
        footerLogin: !!footer?.querySelector('a[href="/login"]'),
        clippedHeadings,
      };
    });
    assert.deepEqual(layout, { visibleH1: 1, nestedMain: 0, duplicateIds: [], overflow: false, innerOverflow: false, footerCount: 1, footerLogin: false, clippedHeadings: [] }, `${page.url()} must remain readable and coherent at ${JSON.stringify(page.viewportSize())}`);
    for (const id of ["public-legal-notice", "public-privacy", "public-cookies"]) {
      const disclosure = page.locator(`#${id}`);
      await disclosure.locator("summary").click();
      assert.equal(await disclosure.evaluate((node) => node.open), true);
      await disclosure.locator("summary").click();
    }
  }

  // Responsive and theme coverage of every public surface, using source and
  // the actual compiled release with isolated network fixtures. These checks
  // never submit real credentials or substitute the public page markup.
  await access(resolve(DIST, "index.html"));
  serveDist = true;
  for (const colorScheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const width of [360, 900, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/", "/login", "/password-request", "/password-reset", "/activate-account", ...PUBLIC_SERVICES.map((service) => service.path)]) {
        await page.goto(origin + path, { waitUntil: "domcontentloaded" });
        if (!PUBLIC_SERVICES.some((service) => service.path === path)) {
          await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
        }
        await inspectPublicLayout();
        if (path === "/password-reset" || path === "/activate-account") {
          const form = page.locator("form");
          assert.equal(await form.locator('input[type="password"]:enabled, button[type="submit"]:enabled').count(), 0, "a missing token must disable unusable controls");
        }
      }
    }
  }

  for (const hash of ["#incidencia", "#public-privacy"]) {
    await page.goto(origin + "/" + hash, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(hash);
    await page.waitForFunction((targetHash) => {
      const host = document.querySelector(".main-content");
      const target = document.querySelector(targetHash);
      const bounds = target.getBoundingClientRect();
      return host.scrollTop > 20 && bounds.top >= 0 && bounds.top < 200;
    }, hash);
    assert.equal(new URL(page.url()).hash, hash, "deep links must survive mounting Home");
    if (hash === "#public-privacy") assert.equal(await page.locator(hash).evaluate((node) => node.open), true, "privacy deep link must open the disclosure");
  }
  assert.deepEqual(errors, [], "frontend must not throw during metadata navigation");
  await context.close();
  console.log("Public site browser: PASS · real Router home↔login · 10 public routes × 3 widths × 2 themes · unique visible headings/footer · disclosures · safe invalid tokens · intake/privacy deep links");
} finally {
  if (browser) await browser.close();
  await new Promise((done) => server.close(done));
}
