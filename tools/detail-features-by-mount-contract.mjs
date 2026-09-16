import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

// EL MISMO DETALLE DISPONE DE SUS FUNCIONES VENGA DE DONDE VENGA.
//
// El detalle de una incidencia no vive sólo en /incidencias: la capa de entidad lo abre
// desde Home, desde Facturas, desde una relación o desde un enlace profundo. Mientras el
// ámbito de features salía únicamente del `pathname`, ese mismo modal llegaba SIN el ojo del
// técnico, sin el estado del detalle, sin la sincronización en vivo y sin los dos juegos de
// avatares en 11 de las 13 rutas.
//
// Aquí se recorre con el registro real (`src/app/enhancements.js`), la capa de entidad real
// y el controlador real de Incidencias, sobre una página cuya ruta NO nombra el dominio.
// Nada se reimplementa y nada se adelanta: lo que se comprueba es que la señal de carga
// perezosa incluye el montaje real del portal, y que sigue sin cargarse lo que no se usa.
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
let checks = 0;
try {
  let executablePath;
  for (const candidate of [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/tmp/chromium"].filter(Boolean)) {
    try { await access(candidate); executablePath = candidate; break; } catch { /* next */ }
  }
  assert.ok(executablePath, "CHROME_BIN must identify a local Chromium executable");
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(15000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  // Frontera del fixture, no del producto: tres features declaran `import "./style.css"`, que
  // resuelve el empaquetador. Servidas como fuente cruda, el navegador rechaza la hoja como
  // módulo. Se entrega un módulo vacío SÓLO cuando la petición llega como script; la hoja
  // sigue sirviéndose como CSS a quien la enlaza. El estilo no es lo que este contrato mide.
  const rewrittenStyles = new Set();
  await page.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith("/src/features/") && url.pathname.endsWith("/style.css") && request.resourceType() === "script") {
      rewrittenStyles.add(url.pathname);
      return route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: "" });
    }
    return route.continue();
  });

  await page.goto(`${origin}/@fixture`);
  await page.waitForFunction(() => window.__fixtureReady === true);
  // Datos de prueba, nunca de producción: la incidencia del fixture lleva técnico asignado,
  // que es la condición para que el detalle pinte su tarjeta y la feature pueda decorarla.
  await page.evaluate(() => {
    window.__autoResolve = { incidencia: true };
    Object.assign(window.__fixtureData.incidencia, {
      assignedTo: "fixture-technician",
      assignedToName: "Marta Técnica Prueba",
      assignedToEmail: "tecnica@example.test",
    });
  });

  // 1 · La ruta no nombra ningún dominio y no hay nada montado.
  const before = await page.evaluate(async () => {
    const module = await import("/src/app/enhancements.js");
    window.__enhancements = module.AppEnhancements;
    const snapshot = module.getAppEnhancementsSnapshot();
    return {
      path: location.pathname,
      routeScopes: snapshot.routeScopes,
      mountedScopes: snapshot.mountedScopes,
      activeScopes: snapshot.activeScopes,
      profile: snapshot.features["incidencias-technician-profile"].state,
      mountedDomainScopes: snapshot.policy.mountedDomainScopes,
      speculative: snapshot.policy.speculativeRoutePreload,
    };
  });
  assert.equal(before.routeScopes.includes("incidencias"), false, "The fixture route does not name the incidencias domain");
  assert.deepEqual(before.mountedScopes, [], "Nothing of the domain is mounted yet");
  assert.equal(before.activeScopes.includes("incidencias"), false);
  assert.equal(before.profile, "idle");
  assert.equal(before.mountedDomainScopes, true, "The registry declares that a mounted portal activates its scope");
  assert.equal(before.speculative, false, "No speculative preloading");
  checks += 1;
  console.log(`PASS 1 · ${before.path}: the route names no domain, nothing of it is mounted, nothing of it is loaded`);

  // 2 · Arranque real del registro: sólo lo global. Nada de Incidencias, nada de Facturas.
  await page.evaluate(() => window.__enhancements.initPostRouter());
  const started = await page.evaluate(() => {
    const snapshot = window.__enhancements.getSnapshot();
    const byState = {};
    for (const [key, value] of Object.entries(snapshot.features)) byState[key] = value.state;
    return { byState, observer: snapshot.observerActive, mountTriggers: snapshot.mountTriggers };
  });
  const domainKeys = Object.keys(started.byState).filter((key) => key.startsWith("incidencias-") || key.startsWith("facturas-") || key.startsWith("public-"));
  assert.deepEqual(
    domainKeys.filter((key) => started.byState[key] === "ready"),
    [],
    "Starting the registry loads no domain feature: the fix is not 'load everything at startup'"
  );
  assert.equal(started.observer, true, "The registry observes instead of preloading");
  assert.equal(started.mountTriggers, 0);
  checks += 1;
  console.log(`PASS 2 · registry started: 0 of ${domainKeys.length} domain features loaded, observer active`);

  // 3 · Se abre el detalle real desde un origen que no es su ruta.
  await page.locator("#open-incidencia").click();
  await page.locator("[data-incidencias-modal-panel='true']").waitFor();
  await page.waitForFunction(
    () => window.__enhancements.getSnapshot().features["incidencias-technician-profile"].state === "ready",
    null,
    { timeout: 15000 }
  );
  const opened = await page.evaluate(() => {
    const snapshot = window.__enhancements.getSnapshot();
    const states = {};
    for (const [key, value] of Object.entries(snapshot.features)) states[key] = value.state;
    return {
      mountedScopes: snapshot.mountedScopes,
      activeScopes: snapshot.activeScopes,
      routeScopes: snapshot.routeScopes,
      mountTriggers: snapshot.mountTriggers,
      incidencias: Object.entries(states).filter(([key]) => key.startsWith("incidencias-")).map(([key, state]) => `${key}:${state}`),
      facturas: Object.entries(states).filter(([key]) => key.startsWith("facturas-")).map(([, state]) => state),
      publicFeatures: Object.entries(states).filter(([key]) => key.startsWith("public-")).map(([, state]) => state),
    };
  });
  assert.deepEqual(opened.mountedScopes, ["incidencias"], "The mounted portal is what activates the scope");
  assert.equal(opened.routeScopes.includes("incidencias"), false, "The route still does not name it");
  assert.equal(opened.activeScopes.includes("incidencias"), true);
  assert.ok(opened.mountTriggers >= 1, "The mount is what triggered the lazy sync");
  assert.deepEqual(
    opened.incidencias.filter((entry) => !entry.endsWith(":ready")),
    [],
    "Every incidencias feature is available for a detail opened outside its route"
  );
  assert.deepEqual(opened.facturas.filter((state) => state === "ready"), [], "A domain that is not mounted stays unloaded");
  assert.deepEqual(opened.publicFeatures.filter((state) => state === "ready"), [], "Public features stay unloaded on a private page");
  checks += 1;
  console.log(`PASS 3 · detail opened off-route: ${opened.incidencias.length} incidencias features ready, facturas and public still idle`);

  // 4 · Y la función se ve: el ojo del técnico existe, es alcanzable y está en castellano.
  await page.waitForFunction(() => Boolean(document.querySelector("[data-technician-profile-trigger='true']")));
  const eye = await page.evaluate(() => {
    const trigger = document.querySelector("[data-technician-profile-trigger='true']");
    const label = document.querySelector("[data-technician-profile-eye='true']");
    const panel = document.querySelector("[data-incidencias-modal-panel='true']");
    return {
      insideDetail: Boolean(panel && trigger && panel.contains(trigger)),
      role: trigger?.getAttribute("role"),
      tabIndex: trigger?.getAttribute("tabindex"),
      haspopup: trigger?.getAttribute("aria-haspopup"),
      accessibleName: trigger?.getAttribute("aria-label"),
      text: label?.textContent?.trim(),
      visible: Boolean(label?.getClientRects?.().length),
    };
  });
  assert.equal(eye.insideDetail, true, "The technician control lives inside the detail that was opened");
  assert.equal(eye.role, "button");
  assert.equal(eye.tabIndex, "0", "The control is reachable by keyboard");
  assert.equal(eye.haspopup, "dialog");
  assert.ok(/^Ver perfil del técnico /u.test(eye.accessibleName || ""), `Accessible name in Spanish: ${eye.accessibleName}`);
  assert.equal(eye.text, "Ver perfil");
  assert.equal(eye.visible, true, "The control is really painted, not just present in the markup");
  checks += 1;
  console.log("PASS 4 · the technician control is present, visible, keyboard reachable and named in Spanish");

  // 5 · Idempotencia: reabrir el mismo detalle no duplica el control ni vuelve a disparar.
  await page.locator("[data-detail-action='detail-close']").first().click();
  await page.waitForFunction(() => !document.querySelector("[data-incidencias-modal-panel='true']"));
  const triggersAfterClose = await page.evaluate(() => window.__enhancements.getSnapshot().mountTriggers);
  await page.locator("#open-incidencia").click();
  await page.locator("[data-incidencias-modal-panel='true']").waitFor();
  await page.waitForFunction(() => Boolean(document.querySelector("[data-technician-profile-trigger='true']")));
  const again = await page.evaluate(() => ({
    triggers: window.__enhancements.getSnapshot().mountTriggers,
    controls: document.querySelectorAll("[data-technician-profile-trigger='true']").length,
    eyes: document.querySelectorAll("[data-technician-profile-eye='true']").length,
    lazyLoads: window.__enhancements.getSnapshot().features["incidencias-technician-profile"].state,
  }));
  assert.equal(again.controls, 1, "Reopening does not duplicate the control");
  assert.equal(again.eyes, 1, "Reopening does not duplicate the label");
  assert.equal(again.lazyLoads, "ready");
  assert.ok(again.triggers - triggersAfterClose <= 1, `Reopening the same domain re-syncs at most once (${triggersAfterClose} -> ${again.triggers})`);
  checks += 1;
  console.log(`PASS 5 · mounting is idempotent: one control, one label, ${again.triggers} mount syncs in the whole run`);

  const bundlerOnlyStyles = [
    "/src/features/incidencias-comment-avatars/style.css",
    "/src/features/incidencias-followup-avatars/style.css",
    "/src/features/incidencias-technician-profile/style.css",
  ];
  assert.deepEqual(
    [...rewrittenStyles].filter((path) => !bundlerOnlyStyles.includes(path)),
    [],
    "Only the declared bundler-only stylesheet imports are served as empty modules"
  );
  assert.ok(rewrittenStyles.size >= 1, "The bundler-only stylesheet boundary is really exercised");
  assert.deepEqual(await page.evaluate(() => window.__forbiddenCalls), [], "No forbidden boundary is reached");
  assert.deepEqual(pageErrors, [], "No browser errors");
  console.log(`Detail features by mount contract: PASS · ${checks} checks · real registry, real overlay, real incidencias controller`);
} finally {
  await browser?.close();
  fixture.kill();
}
