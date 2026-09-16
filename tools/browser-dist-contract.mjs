/* El build se sirve y el navegador se localiza desde el arnés común
   (tools/spa-session-harness.mjs): una sola autoridad para levantar la
   aplicación real, en vez de dos servidores que puedan divergir. */
import { launchBrowser, serveBuiltApp } from "./spa-session-harness.mjs";

const { origin, close: closeServer } = await serveBuiltApp();
const browser = await launchBrowser();
const executablePath = browser.onionExecutablePath;

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
  await closeServer();
}
