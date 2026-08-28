import { access, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = resolve(ROOT, process.env.ONION_BUILD_OUT_DIR || "dist");

const chromeCandidates = [
  process.env.CHROME_BIN,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/opt/google/chrome/chrome",
].filter(Boolean);

let executablePath = "";
for (const candidate of chromeCandidates) {
  try {
    await access(candidate);
    executablePath = candidate;
    break;
  } catch {
    // Try the next trusted system-browser location.
  }
}

if (!executablePath) {
  throw new Error("Chrome/Chromium not found; set CHROME_BIN to run the dist browser contract.");
}

const contentTypes = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
});

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    let path = decodeURIComponent(url.pathname);
    if (path === "/") path = "/index.html";
    if (path === "/login") path = "/login.html";

    const canonical = posix.normalize(path).replace(/^\/+/, "");
    if (!canonical || canonical.startsWith("../") || canonical.includes("/../")) {
      response.writeHead(400).end("Bad path");
      return;
    }

    const target = resolve(DIST, canonical);
    const targetStat = await stat(target);
    if (!targetStat.isFile()) throw new Error("Not a regular file");
    const contents = await readFile(target);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentTypes[extname(target)] || "application/octet-stream",
    });
    response.end(contents);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

await new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(0, "127.0.0.1", resolveListen);
});

const address = server.address();
if (!address || typeof address === "string") throw new Error("Static test server did not bind.");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--disable-dev-shm-usage", "--no-sandbox"],
});

try {
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const noJsPage = await noJs.newPage();
  const noJsResponse = await noJsPage.goto(origin, { waitUntil: "load" });
  if (!noJsResponse?.ok()) throw new Error("No-JavaScript index did not load successfully.");
  if (!await noJsPage.locator("[data-noscript-root='true']").isVisible()) {
    throw new Error("No-JavaScript fallback is not visible.");
  }
  const noJsStyles = await noJsPage.evaluate(() => (
    [...document.styleSheets].map((sheet) => sheet.href || "")
  ));
  if (!noJsStyles.some((href) => href.endsWith("/src/css/core/noscript.css"))) {
    throw new Error("No-JavaScript context did not load its conditional stylesheet.");
  }
  await noJs.close();

  const jsOn = await browser.newContext({ javaScriptEnabled: true });
  const jsPage = await jsOn.newPage();
  const noscriptRequests = [];
  jsPage.on("request", (request) => {
    if (request.url().includes("/src/css/core/noscript.css")) noscriptRequests.push(request.url());
  });
  await jsPage.route("**/*", async (route) => {
    const target = new URL(route.request().url());
    if (target.origin === origin) await route.continue();
    else await route.abort();
  });
  const jsResponse = await jsPage.goto(origin, { waitUntil: "domcontentloaded" });
  if (!jsResponse?.ok()) throw new Error("JavaScript-enabled index did not load successfully.");
  await jsPage.waitForTimeout(500);

  const jsContract = await jsPage.evaluate(() => {
    document.documentElement.dataset.chrome = "visible";
    document.documentElement.dataset.routeMode = "app";
    document.body.dataset.chrome = "visible";
    document.body.dataset.routeMode = "app";
    document.body.classList.remove("auth-screen", "route-shell-hidden");

    const displays = {};
    for (const className of ["sidebar", "topbar", "table-head"]) {
      const element = document.createElement("div");
      element.className = className;
      document.body.appendChild(element);
      displays[className] = getComputedStyle(element).display;
      element.remove();
    }

    return {
      displays,
      noscriptStyles: [...document.styleSheets]
        .map((sheet) => sheet.href || "")
        .filter((href) => href.endsWith("/src/css/core/noscript.css")),
    };
  });

  if (noscriptRequests.length || jsContract.noscriptStyles.length) {
    throw new Error("JavaScript-enabled context loaded the no-JavaScript stylesheet.");
  }
  for (const [className, display] of Object.entries(jsContract.displays)) {
    if (display === "none") throw new Error(`${className} is globally hidden with JavaScript enabled.`);
  }
  await jsOn.close();

  console.log(`Browser dist contract: PASS (${executablePath})`);
  console.log("- JS off: fallback visible and conditional CSS loaded");
  console.log("- JS on: conditional CSS absent and chrome selectors remain renderable");
} finally {
  await browser.close();
  await new Promise((resolveClose, rejectClose) => server.close((error) => (
    error ? rejectClose(error) : resolveClose()
  )));
}
