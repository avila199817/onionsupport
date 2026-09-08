import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

// Source integration test: the entity dispatcher, both owner controllers,
// templates, identity presentation and modal lifecycle are the production code.
// Only session/HTTP/API boundaries are replaced. No production endpoint is used.
const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const HOME_PATH = "/@fixture";
const INC_ID = "INC-20260908-ABC123";
const FACTURA_ID = "fixture-factura-1";
const CSS = [
  "/src/css/tokens/variables.css",
  "/src/css/tokens/light.css",
  "/src/css/components/detail-modal.css",
  "/src/css/features/entity-overlay.css",
  "/src/css/views/facturas/detail.css",
  "/src/css/views/facturas/resend-confirm.css",
  "/src/css/views/incidencias/detail.css",
  "/src/features/incidencias-comment-avatars/style.css",
  "/src/features/incidencias-followup-avatars/style.css",
];
const CSS_IMPORTS = new Map([
  ["/src/features/entity-overlay/index.js", 'import "../../css/features/entity-overlay.css";'],
  ["/src/features/incidencias-comment-avatars/index.js", 'import "./style.css";'],
  ["/src/features/incidencias-followup-avatars/index.js", 'import "./style.css";'],
]);
const OWNER_PANEL = "[data-facturas-detail-modal='true'], [data-incidencias-modal-panel='true']";
const ANY_PANEL = `${OWNER_PANEL}, [data-entity-overlay-panel='true']`;
const selectors = {
  factura: {
    panel: "[data-facturas-detail-modal='true']",
    close: "[data-facturas-action='close-factura-detail']",
    backdrop: "[data-facturas-detail-overlay='true']",
  },
  incidencia: {
    panel: "[data-incidencias-modal-panel='true']",
    close: "[data-detail-action='detail-close']",
    backdrop: "[data-incidencias-modal-overlay='true']",
  },
};

const mocks = new Map([
  ["/src/core/index.js", `
    const user = { id:"fixture-admin", fullName:"Administradora Prueba", email:"admin@example.test", role:"admin", slug:"fixture" };
    const session = { authenticated:true, role:"admin", user, currentUser:user };
    window.__setFixtureRole = (role) => { session.role = role; user.role = role; };
    export const AppCore = {
      hasRole:(roles) => session.authenticated && (!roles.length || roles.includes(session.role)),
      runtimeState:{ read:() => session }, getState:() => session,
      getCurrentUser:() => user, getCurrentRole:() => session.role,
      normalizeRole:(value) => value === "admin" ? "admin" : "user",
      isAuthenticated:() => true,
      registerModule(name, value) { this[name] = value; },
      getModule(name) { return this[name]; },
      getHttpClient:() => ({ request: (...args) => window.__forbidden("http", args) }),
      request:(...args) => window.__forbidden("http", args),
    };
    export default AppCore;
  `],
  ["/src/core/http.js", `
    const call = (...args) => window.__forbidden("http", args);
    export default { request:call, get:call, post:call, put:call, patch:call, delete:call };
  `],
  ["/src/views/facturas/facturas.api.js", `
    export const getFacturaById = (id, options) => window.__detailRequest("factura", id, options);
    export const hydrateFacturasFromCache = () => ({ items:[], total:0, totalKnown:false });
    export const getFacturasListContextKey = () => "fixture-admin";
    export const computeFacturasStats = () => ({ total:0, totalAmount:0, paidAmount:0, pendingAmount:0 });
    ${["listFacturas", "loadFacturasStats", "syncFacturasListCache", "createFactura", "sendFactura", "markFacturaPaid", "viewFacturaPdfRequest", "downloadFacturaPdfRequest"].map((name) => `export const ${name} = (...args) => window.__forbidden(${JSON.stringify(name)}, args);`).join("\n")}
  `],
  ["/src/views/incidencias/incidencias.api.js", `
    export const loadIncidenciaDetail = (id, options) => window.__detailRequest("incidencia", id, options);
    export const INCIDENCIAS_LIST_LIMIT = 48;
    export const INCIDENCIAS_CACHE_TTL_MS = 60000;
    export const hydrateIncidenciasFromCache = () => ({ items:[], total:0, totalKnown:false });
    export const computeIncidenciasStats = () => ({ total:0, open:0, closed:0, pending:0 });
    ${["listIncidencias", "loadIncidenciasPage", "createIncidencia", "updateIncidencia", "commentIncidencia", "reopenIncidencia", "closeIncidencia", "uploadIncidenciaAttachments", "openIncidenciaAttachment", "downloadIncidenciaAttachment", "deleteIncidenciaAttachment", "searchIncidenciaUsers"].map((name) => `export const ${name} = (...args) => window.__forbidden(${JSON.stringify(name)}, args);`).join("\n")}
  `],
]);

const fixture = `<!doctype html><html lang="es" data-theme="dark"><head>
  <meta charset="utf-8"><title>Canonical private owner modal contract</title>
  <style>@layer reset, tokens, base, components, views, features, utilities;</style>
  ${CSS.map((path) => `<link rel="stylesheet" href="${path}">`).join("\n")}
  <style>
    body { margin:0; background:#171717; color:#eee; font:16px sans-serif }
    #main-content { height:100dvh; overflow:auto }
    #fixture-home { padding:20px; min-height:1800px }
    #fixture-controls { margin-top:360px; display:flex; gap:12px; flex-wrap:wrap }
    #fixture-controls button { padding:12px; min-height:44px }
  </style>
</head><body><main id="main-content" class="main-content" data-main-content="true">
  <div id="view-container" data-router-view="true"><section id="fixture-home" data-home-view="true" data-route-host="true" data-route-host-state="ready">
    <h1>Inicio operativo</h1><p id="fixture-stable-data">Datos del inicio conservados</p>
    <div id="fixture-controls"><button id="open-incidencia">Abrir incidencia</button><button id="open-factura">Abrir factura</button></div>
  </section></div>
</main>
<script type="module">
  window.__forbiddenCalls = [];
  window.__requests = [];
  window.__operations = [];
  window.__maxPanels = 0;
  window.__detailCache = new Map();
  window.__forbidden = (name, args) => {
    window.__forbiddenCalls.push({ name, args });
    throw new Error("Forbidden fixture boundary: " + name);
  };
  window.__detailRequest = (type, id, options) => {
    const key = type + ":" + id;
    if (window.__detailCache.has(key)) return window.__detailCache.get(key);
    // The API boundary shares a detail response with the real avatar/policy
    // decorators, just as the production coordinator does. Tests below cover
    // controller ownership, not API cache implementation.
    const task = new Promise((resolve, reject) => {
      // Ignore cancellation deliberately: a late transport response must still
      // be rejected by the old controller after releaseOrigin.
      window.__requests.push({ type, id, options, resolve, reject });
    }).catch((error) => { window.__detailCache.delete(key); throw error; });
    window.__detailCache.set(key, task);
    return task;
  };
  window.__homeHost = document.querySelector("#view-container");
  window.__homeNode = document.querySelector("#fixture-home");
  window.__homeHTML = window.__homeHost.innerHTML;
  history.replaceState({ fixture:"unchanged" }, "", location.href);
  window.__historyLength = history.length;
  const { EntityOverlay } = await import("/src/features/entity-overlay/index.js");
  window.__overlay = EntityOverlay;
  EntityOverlay.init({
    Router:{ navigate:(...args) => window.__forbidden("navigate", args), go:(...args) => window.__forbidden("go", args) },
  });
  for (const type of ["incidencia", "factura"]) {
    const opener = document.querySelector("#open-" + type);
    opener.addEventListener("click", () => {
      // Reopening through the Home button simulates an expired API cache.
      window.__detailCache.clear();
      window.__operations.push(EntityOverlay.open({
        type, id:type === "incidencia" ? ${JSON.stringify(INC_ID)} : ${JSON.stringify(FACTURA_ID)},
        opener, openMode:"in-place", source:"private-owner-browser-contract",
      }));
    });
  }
  new MutationObserver(() => {
    const visible = [...document.querySelectorAll(${JSON.stringify(ANY_PANEL)})].filter((node) => {
      const style = getComputedStyle(node);
      return node.getClientRects().length && style.display !== "none" && style.visibility !== "hidden";
    }).length;
    window.__maxPanels = Math.max(window.__maxPanels, visible);
  }).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:["hidden", "style", "class"] });
  window.__fixtureReady = true;
</script></body></html>`;

const servedSources = new Set();
const serverErrors = [];
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  try {
    if (path === HOME_PATH) {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(fixture);
      return;
    }
    let body = mocks.get(path);
    if (body === undefined) {
      const target = resolve(ROOT, `.${path}`);
      assert.ok(target.startsWith(`${ROOT}/src/`) && /\.(?:js|css)$/.test(path), `Forbidden fixture source: ${path}`);
      body = await readFile(target, "utf8");
      servedSources.add(path);
      // Native ESM cannot execute a Vite CSS side-effect import. Each allowed
      // transformation names one known source/import; its real CSS is linked.
      const cssImport = CSS_IMPORTS.get(path);
      if (cssImport) {
        assert.equal(body.split(cssImport).length, 2, `transform exactly the known CSS import: ${path}`);
        body = body.replace(cssImport, "");
      }
    }
    response.writeHead(200, {
      "Content-Type": path.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    }).end(body);
  } catch (error) {
    if (path !== "/favicon.ico") serverErrors.push(`${path}: ${error.message}`);
    response.writeHead(404).end();
  }
});

const ticket = {
  id:INC_ID, ticketId:INC_ID, subject:"Equipo de prueba sin conexión", description:"Diagnóstico de una incidencia de prueba.",
  status:"open", priority:"normal", category:"hardware", createdAt:"2026-09-08T09:00:00.000Z", updatedAt:"2026-09-08T09:30:00.000Z",
  userId:"fixture-customer", fullName:"Alejandro Cliente Prueba", email:"cliente@example.test",
  user:{ id:"fixture-customer", fullName:"Alejandro Cliente Prueba", email:"cliente@example.test" },
  requester:{ userId:"fixture-customer", fullName:"Alejandro Cliente Prueba", email:"cliente@example.test" },
  comments:[], history:[], attachments:[], canComment:true, canUpdate:true,
};
const invoice = {
  id:FACTURA_ID, facturaId:FACTURA_ID, numero:"2026000123", facturaNumero:"2026000123", subject:"Servicio técnico de prueba",
  total:48.4, subtotal:40, baseImponible:40, iva:8.4, impuesto:8.4, importeTotal:48.4, moneda:"EUR",
  estado:"pagada", estadoPago:"pagada", pagado:48.4, pendiente:0, fechaEmision:"2026-09-08T09:00:00.000Z",
  cliente:{ id:"fixture-customer", nombre:"Alejandro Cliente Prueba", fullName:"Alejandro Cliente Prueba", email:"cliente@example.test" },
  ticketId:INC_ID, incidenciaId:INC_ID, ticket:{ id:INC_ID, ticketId:INC_ID, subject:ticket.subject },
  conceptos:[{ descripcion:"Diagnóstico técnico", cantidad:1, precioUnitario:40, total:40 }],
};

await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
let completed = 0;
try {
  let executablePath;
  for (const candidate of [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/opt/google/chrome/chrome", "/tmp/chromium"].filter(Boolean)) {
    try { await access(candidate); executablePath = candidate; break; } catch { /* next executable */ }
  }
  assert.ok(executablePath, "CHROME_BIN must identify a local Chromium executable");
  browser = await chromium.launch({ executablePath, headless:true, args:["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport:{ width:1280, height:900 }, reducedMotion:"reduce", serviceWorkers:"block" });
  const external = [];
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.setDefaultTimeout(10000);

  async function load(width = 1280) {
    await page.setViewportSize({ width, height:900 });
    await page.goto(origin + HOME_PATH, { waitUntil:"load" });
    await page.waitForFunction(() => window.__fixtureReady === true);
    await page.locator("#main-content").evaluate((main) => { main.scrollTop = 260; });
    await page.evaluate(() => { window.__initialScrollTop = document.querySelector("#main-content").scrollTop; });
  }
  async function invariant({ closed = false, focus = "" } = {}) {
    const state = await page.evaluate(() => ({
      path:location.pathname + location.search + location.hash,
      history:history.state, historyLength:history.length, initialHistoryLength:window.__historyLength,
      sameHost:document.querySelector("#view-container") === window.__homeHost,
      sameHome:document.querySelector("#fixture-home") === window.__homeNode,
      sameMarkup:window.__homeHost.innerHTML === window.__homeHTML,
      scrollTop:document.querySelector("#main-content").scrollTop, initialScrollTop:window.__initialScrollTop,
      mainChildren:window.__homeHost.children.length,
      listNodes:document.querySelectorAll(".incidencias-main, .facturas-main, [data-modal-bridge-root], #incidencia-modal-bridge-root, #factura-modal-bridge-root").length,
      forbidden:window.__forbiddenCalls, maxPanels:window.__maxPanels,
      focus:document.activeElement?.id || "",
      panels:document.querySelectorAll("[data-facturas-detail-modal='true'], [data-incidencias-modal-panel='true'], [data-entity-overlay-panel='true']").length,
      bodyOverflow:document.body.style.overflow,
    }));
    assert.equal(state.path, HOME_PATH);
    assert.deepEqual(state.history, { fixture:"unchanged" });
    assert.equal(state.historyLength, state.initialHistoryLength);
    assert.equal(state.sameHost, true); assert.equal(state.sameHome, true); assert.equal(state.sameMarkup, true);
    assert.equal(state.mainChildren, 1); assert.equal(state.listNodes, 0);
    assert.equal(state.scrollTop, state.initialScrollTop);
    assert.deepEqual(state.forbidden, []);
    assert.ok(state.maxPanels <= 1, `At most one owner/loading modal may be interactive: ${state.maxPanels}`);
    if (closed) { assert.equal(state.panels, 0); assert.equal(state.bodyOverflow, ""); }
    if (focus) assert.equal(state.focus, focus);
  }
  async function clickOpen(type, count = 1) {
    await page.locator(`#open-${type}`).click();
    await page.waitForFunction((count) => window.__requests.length === count, count);
    await page.waitForSelector(selectors[type].panel);
    assert.equal(await page.locator(OWNER_PANEL).count(), 1);
    await invariant();
  }
  async function settle(index, { reject = false, status = 503 } = {}) {
    await page.evaluate(({ index, reject, status, ticket, invoice }) => {
      const request = window.__requests[index];
      if (reject) {
        const error = new Error(status === 403 ? "No tienes permiso para consultar este registro." : "Error temporal al consultar el detalle.");
        error.status = status;
        request.reject(error);
      } else request.resolve(request.type === "incidencia" ? ticket : invoice);
    }, { index, reject, status, ticket, invoice });
  }
  async function resolvedOpen(type) {
    await clickOpen(type);
    await settle(0);
    await page.waitForFunction(() => window.__operations.length > 0 && window.__requests.length > 0);
    await page.evaluate(() => window.__operations.at(-1));
    await page.locator(selectors[type].panel).waitFor({ state:"visible" });
  }
  async function expectClosed(focus = "") {
    await page.waitForFunction((selector) => !document.querySelector(selector), ANY_PANEL);
    await invariant({ closed:true, focus });
  }
  async function scenario(name, fn) {
    const previousErrors = pageErrors.length;
    try {
      await fn();
      assert.deepEqual(pageErrors.slice(previousErrors), [], name);
      assert.deepEqual(serverErrors, []);
      assert.deepEqual(external, [], "Fixture must not initiate any external network traffic");
    } catch (error) {
      const state = await page.evaluate(() => ({
        ready:window.__fixtureReady === true,
        requests:window.__requests?.map(({ type, id }) => ({ type, id })),
        forbidden:window.__forbiddenCalls?.map(({ name }) => name),
        dialogs:[...document.querySelectorAll("[role='dialog']")].map((node) => ({
          id:node.id, text:node.innerText.slice(0, 500), visible:node.getClientRects().length > 0,
        })),
      })).catch(() => null);
      console.error(JSON.stringify({ scenario:name, pageErrors, serverErrors, external, state }, null, 2));
      throw error;
    }
    completed += 1;
    console.log(`PASS private owner ${name}`);
  }

  await scenario("quick views obey the canonical route role policy before loading data", async () => {
    await load();
    const result = await page.evaluate(async () => {
      window.__setFixtureRole("user");
      const denied = [];
      for (const type of ["cliente", "usuario"]) {
        denied.push(window.__overlay.canOpen(type, "fixture-person"));
        denied.push(await window.__overlay.open({ type, id:"fixture-person" }));
      }
      return { denied, normal:window.__overlay.canOpen("incidencia", "INC-20260908-ABC123"), requests:window.__requests.length };
    });
    assert.deepEqual(result, { denied:[false,false,false,false], normal:true, requests:0 });
    await invariant({ closed:true });
  });

  await scenario("declarative Home buttons use the single document dispatcher", async () => {
    await load();
    await page.evaluate((id) => {
      const opener = document.querySelector("#open-incidencia");
      Object.assign(opener.dataset, { entityOverlayTrigger:"true", entityOverlayOpen:"true", entityType:"incidencia", entityId:id, entityOpenMode:"in-place" });
      window.__homeHTML = window.__homeHost.innerHTML;
    }, INC_ID);
    await clickOpen("incidencia");
    assert.equal(await page.evaluate(() => window.__operations.length), 0, "capture dispatcher consumes the click before the fixture API handler");
    await settle(0);
    await page.locator("[data-detail-field='comment']").waitFor({ state:"visible" });
    await page.keyboard.press("Escape");
    await expectClosed("open-incidencia");
  });

  await scenario("Home refresh preserves the open owner and restores focus to the renewed semantic row", async () => {
    await load();
    await page.evaluate((id) => {
      const opener = document.querySelector("#open-incidencia");
      Object.assign(opener.dataset, { entityType:"incidencia", entityId:id });
      window.__homeHTML = window.__homeHost.innerHTML;
      window.__operations.push(window.__overlay.open({ type:"incidencia", id, opener }));
    }, INC_ID);
    await page.waitForFunction(() => window.__requests.length === 1);
    await settle(0);
    await page.locator("[data-detail-field='comment']").waitFor({ state:"visible" });
    await page.evaluate(() => {
      const previous = document.querySelector("#open-incidencia");
      previous.replaceWith(previous.cloneNode(true));
      window.__homeHTML = window.__homeHost.innerHTML;
    });
    await invariant();
    await page.keyboard.press("Escape");
    await expectClosed("open-incidencia");
  });

  await scenario("failed staged route mount leaves the current Home incident modal interactive", async () => {
    await load(); await resolvedOpen("incidencia");
    const result = await page.evaluate(async () => {
      const { IncidenciasView, getIncidenciasViewBoundarySnapshot } = await import("/src/views/incidencias/index.js");
      const previousPanel = document.querySelector("[data-incidencias-modal-panel='true']");
      const previousHost = previousPanel.closest("[data-incidencias-modal-owner-id]");
      const staged = document.createElement("section");
      Object.assign(staged.dataset, { routeHost:"true", routeHostState:"preparing", viewKey:"incidencias" });
      staged.addEventListener = () => { throw new Error("Fixture failure while mounting the staged route"); };
      let failed = false;
      try { await IncidenciasView(staged); } catch { failed = true; }
      const layers = getIncidenciasViewBoundarySnapshot().modalLayers;
      return {
        failed, samePanel:document.querySelector("[data-incidencias-modal-panel='true']") === previousPanel,
        hidden:previousHost.hidden, inert:previousHost.hasAttribute("inert"),
        superseded:previousHost.getAttribute("data-incidencias-modal-host-superseded"),
        interactive:layers.interactive, duplicate:layers.duplicateInteractive,
      };
    });
    assert.deepEqual(result, { failed:true, samePanel:true, hidden:false, inert:false, superseded:null, interactive:1, duplicate:false });
    await invariant();
    await page.keyboard.press("Escape"); await expectClosed("open-incidencia");
  });

  for (const width of [1280, 390]) {
    for (const type of ["factura", "incidencia"]) {
      await scenario(`${type}: in-place single modal, viewport ${width}, keyboard and close focus`, async () => {
        await load(width); await resolvedOpen(type);
        const panel = page.locator(selectors[type].panel);
        const bounds = await panel.boundingBox();
        assert.ok(bounds && bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= 901);
        for (const key of ["Tab", "Shift+Tab", "Tab"]) {
          await page.keyboard.press(key);
          assert.equal(await panel.evaluate((node) => node.contains(document.activeElement)), true);
        }
        await page.locator(selectors[type].close).first().click();
        await expectClosed(`open-${type}`);
      });
    }
  }
  for (const type of ["factura", "incidencia"]) {
    await scenario(`${type}: Escape and backdrop close the canonical controller`, async () => {
      await load(); await resolvedOpen(type);
      await page.keyboard.press("Escape"); await expectClosed(`open-${type}`);
      await clickOpen(type, 2); await settle(1);
      await page.evaluate(() => window.__operations.at(-1));
      await page.locator(selectors[type].backdrop).click({ position:{ x:2, y:2 } });
      await expectClosed(`open-${type}`);
    });
  }

  await scenario("invoice relation opens the real incident controller over the same Home", async () => {
    await load(); await resolvedOpen("factura");
    await page.locator("[data-facturas-action='open-incidencia']").first().click();
    await page.waitForFunction(() => window.__requests.length === 2);
    assert.deepEqual(await page.evaluate(() => window.__requests.map(({ type, id }) => ({ type, id }))), [
      { type:"factura", id:FACTURA_ID }, { type:"incidencia", id:INC_ID },
    ]);
    await settle(1);
    await page.locator("[data-detail-field='comment']").waitFor({ state:"visible" });
    assert.equal(await page.locator(selectors.factura.panel).count(), 0);
    assert.equal(await page.locator(selectors.incidencia.panel).count(), 1);
    await invariant();
    await page.keyboard.press("Escape"); await expectClosed("open-factura");
  });

  await scenario("incident draft blocks close, cancellation preserves content, discard closes without writes", async () => {
    await load(); await resolvedOpen("incidencia");
    await page.locator("[data-detail-field='comment']").fill("Borrador de prueba\nSegunda línea sin enviar.");
    await page.keyboard.press("Escape");
    await page.locator("[data-detail-confirm-dialog='true']").waitFor({ state:"visible" });
    await page.locator("[data-detail-action='detail-discard-close-cancel']").click();
    assert.equal(await page.locator("[data-detail-field='comment']").inputValue(), "Borrador de prueba\nSegunda línea sin enviar.");
    await invariant();
    await page.locator(selectors.incidencia.close).click();
    await page.locator("[data-detail-action='detail-discard-close-confirm']").click();
    await expectClosed("open-incidencia");
  });

  await scenario("incident forbidden detail stays in its owner shell and retries without route navigation", async () => {
    await load(); await clickOpen("incidencia"); await settle(0, { reject:true, status:403 });
    await page.locator("[data-detail-action='detail-retry']").waitFor({ state:"visible" });
    assert.match(await page.locator(selectors.incidencia.panel).innerText(), /No tienes permiso/);
    assert.equal(await page.locator("[data-detail-field='comment']").count(), 0);
    await invariant();
    await page.locator("[data-detail-action='detail-retry']").click();
    await page.waitForFunction(() => window.__requests.length === 2);
    await settle(1);
    await page.locator("[data-detail-field='comment']").waitFor({ state:"visible" });
    await page.keyboard.press("Escape"); await expectClosed("open-incidencia");
  });

  await scenario("invoice detail failure shows retry and loads the same owner on recovery", async () => {
    await load(); await clickOpen("factura"); await settle(0, { reject:true, status:503 });
    await page.locator("[data-entity-overlay-action='retry']").waitFor({ state:"visible" });
    assert.equal(await page.locator(selectors.factura.panel).count(), 0);
    await invariant();
    await page.locator("[data-entity-overlay-action='retry']").click();
    await page.waitForFunction(() => window.__requests.length === 2);
    await settle(1);
    await page.locator("[data-facturas-action='open-incidencia']").first().waitFor({ state:"visible" });
    await page.keyboard.press("Escape"); await expectClosed("open-factura");
  });

  for (const type of ["factura", "incidencia"]) {
    await scenario(`${type}: repeated open shares the pending owner and a single modal`, async () => {
      await load(); await clickOpen(type);
      await page.evaluate(({ type, id }) => {
        window.__operations.push(window.__overlay.open({ type, id, opener:document.querySelector("#open-" + type), openMode:"in-place" }));
      }, { type, id:type === "incidencia" ? INC_ID : FACTURA_ID });
      assert.equal(await page.evaluate(() => window.__requests.length), 1);
      await settle(0);
      await page.evaluate(() => Promise.all(window.__operations));
      await invariant();
      await page.keyboard.press("Escape"); await expectClosed(`open-${type}`);
    });
    await scenario(`${type}: origin release cancels pending detail and rejects late response`, async () => {
      await load(); await clickOpen(type);
      await page.evaluate(() => window.__overlay.releaseOrigin(window.__homeNode));
      await expectClosed();
      await settle(0);
      await page.evaluate(async () => {
        await Promise.all(window.__operations);
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      });
      await expectClosed();
      assert.equal(await page.evaluate(() => window.__requests.length), 1);
    });
    await scenario(`${type}: origin release while owner module is downloading prevents late mount`, async () => {
      let releaseImport;
      let notifyRequested;
      const importGate = new Promise((done) => { releaseImport = done; });
      const importRequested = new Promise((done) => { notifyRequested = done; });
      const moduleUrl = `${origin}/src/views/${type === "factura" ? "facturas" : "incidencias"}/index.js`;
      await page.route(moduleUrl, async (route) => { notifyRequested(); await importGate; await route.continue(); });
      try {
        await load();
        await page.locator(`#open-${type}`).click();
        let timeout;
        try {
          await Promise.race([importRequested, new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error(`Owner module was never requested: ${moduleUrl}`)), 10000);
          })]);
        } finally { clearTimeout(timeout); }
        await page.evaluate(() => window.__overlay.releaseOrigin(window.__homeNode));
        releaseImport();
        await page.evaluate(async () => {
          await Promise.all(window.__operations);
          await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        });
        await expectClosed();
        assert.equal(await page.evaluate(() => window.__requests.length), 0);
      } finally {
        releaseImport();
        await page.unroute(moduleUrl);
      }
    });
  }

  for (const path of [
    "/src/features/entity-overlay/index.js", "/src/features/entity-overlay/modal-lifecycle.js",
    "/src/views/facturas/index.js", "/src/views/facturas/facturas.template.modal.base.js",
    "/src/views/incidencias/index.js", "/src/views/incidencias/index.impl.js", "/src/views/incidencias/incidencias.template.modal.impl.js",
  ]) assert.ok(servedSources.has(path), `Real production source must be exercised: ${path}`);
  console.log(`PASS private owner modal browser contract (${completed} scenarios; real controllers/templates, isolated APIs, no external network)`);
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
