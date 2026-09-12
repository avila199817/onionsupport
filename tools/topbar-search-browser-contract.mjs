import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

// Real Core, Topbar controller/templates and Usuarios confirmation. Only the
// HTTP boundary is injected; deferred requests deliberately ignore abort.
const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  if (path === "/fixture") {
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><html><body><div id="topbar-mount"></div><main></main></body></html>');
    return;
  }
  try {
    const target = resolve(root, "." + path);
    if (!target.startsWith(root + "/")) throw Error("Invalid fixture path");
    response.setHeader("Content-Type", extname(target) === ".js" ? "text/javascript" : "text/css");
    response.end(await readFile(target));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({
  executablePath: [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(existsSync),
  headless: true, args: ["--no-sandbox"],
});
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = await browser.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin + "/fixture");
  await page.evaluate(async () => {
    const { AppCore } = await import("/src/core/index.js");
    const { default: Http } = await import("/src/core/http.js");
    const { TopbarUI } = await import("/src/ui/topbar/index.js");
    const Usuarios = await import("/src/views/usuarios/usuarios.api.js");
    const { notifyDomainChanged } = await import("/src/core/domain-events.js");
    window.fixture = { AppCore, TopbarUI, Usuarios, notifyDomainChanged };
    window.reads = 0;
    window.hold = false;
    window.pending = [];
    window.items = [
      { type: "user", userId: "ON-TOPBAR-A", name: 'Ana <img src=x onerror="window.xss=1">' },
      { type: "user", userId: "ON-TOPBAR-B", name: "Bea Consulta" },
      { type: "cliente", clienteId: "CL-TOPBAR", name: "Cliente Consulta" },
      { type: "factura", facturaId: "F-TOPBAR", name: "Factura Consulta" },
      { type: "incidencia", ticketId: "INC-TOPBAR", name: "Incidencia Consulta" },
    ];
    Http.get = async (path, options) => {
      if (path !== "/api/search") throw Error("Unexpected fixture HTTP: " + path);
      if (options.auth !== true || !options.query.q) throw Error("Missing search contract");
      window.reads += 1;
      if (window.hold) return new Promise((resolve, reject) => window.pending.push({ resolve, reject, signal: options.signal }));
      return { items: structuredClone(window.items) };
    };
    Http.patch = async (path, body) => {
      if (path !== "/api/users/ON-TOPBAR-A") throw Error("Unexpected fixture write");
      window.items[0].name = body.name;
      return { user: { userId: "ON-TOPBAR-A", name: body.name } };
    };
    let session = 0;
    window.login = (role = "admin", userId = "ON-TOPBAR-A") => AppCore.applySession({
      user: { userId, name: "Cuenta fixture", role }, token: "fixture-token-" + ++session,
      session: { sessionId: "fixture-session-" + session },
    });
    window.login("ADMIN");
    TopbarUI.init();
    TopbarUI.sync({ title: "Cuenta" });
    window.search = async (query, force = true) => {
      document.querySelector("[data-topbar-search-input]").value = query;
      if (force) return TopbarUI.searchAsync(query);
      return TopbarUI.search(query, { immediate: true });
    };
    window.labels = () => [...document.querySelectorAll(".topbar-search-result-label")].map((node) => node.textContent.trim());
  });

  const admin = await page.evaluate(() => window.search("Consulta"));
  for (const route of ["/cuenta", "/usuarios?usuario=ON-TOPBAR-B", "/clientes?cliente=CL-TOPBAR", "/facturas?factura=F-TOPBAR", "/incidencias?ticket=INC-TOPBAR"]) {
    assert.ok(admin.some((item) => item.route === route), `Admin route ${route}`);
  }
  assert.equal(await page.locator("#topbar-mount img").count(), 0);
  assert.equal(await page.evaluate(() => window.xss), undefined);
  assert.ok((await page.evaluate(() => window.labels())).includes('Ana <img src=x onerror="window.xss=1">'));
  const cachedReads = await page.evaluate(() => window.reads);
  await page.evaluate(() => window.search("Consulta", false));
  assert.equal(await page.evaluate(() => window.reads), cachedReads, "Stable scope preserves the existing cache fast path");

  await page.evaluate(() => window.login("user"));
  assert.equal(await page.locator(".topbar-search-result-label").count(), 0, "Role change clears the previous authority's visible results");
  const user = await page.evaluate(() => window.search("Consulta"));
  assert.ok(user.some((item) => item.route === "/cuenta"));
  assert.equal(user.some((item) => /^\/(usuarios|clientes)(?:\?|$)/.test(item.route)), false);
  assert.ok(user.some((item) => item.route === "/facturas?factura=F-TOPBAR"));
  assert.equal(await page.evaluate(() => window.fixture.AppCore.getState().role), "user");

  await page.evaluate(async () => { window.login(); await window.search("Ana"); });
  const beforeRename = await page.evaluate(() => window.reads);
  await page.evaluate(() => window.fixture.Usuarios.updateUsuarioRequest("ON-TOPBAR-A", { name: "Ana confirmada" }));
  await page.getByText("Ana confirmada", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.reads), beforeRename + 1, "Confirmed Usuarios updates refresh an open query once");
  assert.equal((await page.evaluate(() => window.labels())).some((name) => name.includes("<img")), false);
  await page.evaluate(() => window.search("Ana", false));
  assert.equal(await page.evaluate(() => window.reads), beforeRename + 1, "The refreshed result replaces the cached identity");

  await page.evaluate(() => { window.hold = true; window.oldSearch = window.search("Pendiente"); });
  const beforePendingRename = await page.evaluate(() => window.reads);
  await page.evaluate(async () => {
    window.hold = false;
    await window.fixture.Usuarios.updateUsuarioRequest("ON-TOPBAR-A", { name: "Ana definitiva" });
  });
  await page.getByText("Ana definitiva", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.reads), beforePendingRename + 1);
  await page.evaluate(async () => {
    window.pending.shift().resolve({ items: [{ type: "user", userId: "ON-TOPBAR-A", name: "Nombre obsoleto" }] });
    await window.oldSearch;
  });
  assert.equal(await page.getByText("Nombre obsoleto", { exact: true }).count(), 0);
  assert.equal(await page.getByText("Ana definitiva", { exact: true }).count(), 1);

  for (const sameUser of [false, true]) {
    await page.evaluate(() => { window.hold = true; window.oldSearch = window.search("Cambio de sesión"); });
    const reads = await page.evaluate(() => window.reads);
    await page.evaluate((same) => {
      const id = window.fixture.AppCore.getState().user.userId;
      window.login("admin", same ? id : "ON-TOPBAR-B");
    }, sameUser);
    assert.equal(await page.locator(".topbar-search-result-label").count(), 0);
    await page.evaluate(async (same) => {
      const pending = window.pending.shift();
      if (same) pending.reject(Error("Old session failure"));
      else pending.resolve({ items: [{ type: "user", userId: "ON-TOPBAR-A", name: "Persona anterior" }] });
      await window.oldSearch;
      window.hold = false;
    }, sameUser);
    assert.equal(await page.evaluate(() => window.reads), reads, "A new session never automatically repeats the previous query");
    assert.equal(await page.locator(".topbar-search-result-label").count(), 0);
    await page.evaluate(() => window.search("Cambio de sesión", false));
    await page.getByText("Ana definitiva", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.reads), reads + 1, "A new session does not reuse the previous session's cache");
  }

  await page.evaluate(() => { window.hold = true; window.currentSearch = window.search("Token rotado"); window.fixture.AppCore.setToken("fixture-rotated-token"); });
  await page.evaluate(async () => { window.pending.shift().resolve({ items: structuredClone(window.items) }); await window.currentSearch; });
  assert.equal(await page.getByText("Ana definitiva", { exact: true }).count(), 1, "Token rotation within the same session preserves in-flight work");

  const beforeDestroy = await page.evaluate(() => window.reads);
  await page.evaluate(() => { window.fixture.TopbarUI.destroy({ unmount: true }); window.fixture.notifyDomainChanged("usuarios"); });
  assert.equal(await page.evaluate(() => window.reads), beforeDestroy);
  assert.equal(await page.locator("[data-topbar-root]").count(), 0);
  assert.deepEqual(errors, []);
  console.log("Topbar search browser: PASS · canonical roles/routes · HTML escaped · stable cache · confirmed user refresh · stale/session results discarded · token rotation · clean teardown · injected HTTP only");
} finally { await browser.close(); await new Promise((done) => server.close(done)); }
