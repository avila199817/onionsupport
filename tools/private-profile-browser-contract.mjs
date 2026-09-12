import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

// Real Core, profile reconciliation, domain APIs, Cuenta/Sidebar/Home controllers,
// templates, CSS and avatar runtime. Only Http methods are injected in the page.
const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const types = { ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp" };
const css = [
  "/src/css/app.css", "/src/css/views/cuenta/index.css", "/src/css/views/home/index.css",
];
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/fixture") {
    response.writeHead(200, { "Content-Type": "text/html" }).end(`<!doctype html><html lang="es" data-theme="light"><head>
      <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private profile fixture</title>
      ${css.map((path) => `<link rel="stylesheet" href="${path}">`).join("")}
      <style>body{margin:0}#fixture-main{margin-left:280px;padding:24px;overflow:auto;height:100vh}#fixture-home{margin-top:24px}</style>
      </head><body><div id="sidebar-mount" data-sidebar-mount></div><main id="fixture-main"><section id="fixture-cuenta"></section><section id="fixture-home"></section></main></body></html>`);
    return;
  }
  if (/^\/fixture-photo-[a-z]+\.svg$/.test(pathname)) {
    response.writeHead(200, { "Content-Type": "image/svg+xml" }).end('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#28795b"/><circle cx="16" cy="12" r="7" fill="white"/></svg>');
    return;
  }
  try {
    const target = resolve(root, "." + pathname);
    if (!target.startsWith(root + "/") || /\/\.[^/]/.test(pathname)) throw new Error("Invalid fixture path");
    const content = await readFile(target);
    response.writeHead(200, { "Content-Type": types[extname(target)] || "application/octet-stream" }).end(content);
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  let executablePath;
  for (const candidate of [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/chromium", "/tmp/chromium"].filter(Boolean)) {
    try { await access(candidate); executablePath = candidate; break; } catch {}
  }
  if (!executablePath) throw new Error("Set CHROME_BIN to a local Chromium executable");
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 }, reducedMotion: "reduce" });
  const externalRequests = [];
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + "/fixture");
  await page.evaluate(async () => {
    const [{ AppCore }, { default: Http }, Cuenta, CuentaApi, Usuarios, { SidebarUI }, Home, Avatars] = await Promise.all([
      import("/src/core/index.js"), import("/src/core/http.js"),
      import("/src/views/cuenta/index.js"), import("/src/views/cuenta/cuenta.api.js"),
      import("/src/views/usuarios/usuarios.api.js"), import("/src/ui/sidebar/index.js"),
      import("/src/views/home/index.js"), import("/src/features/avatar-system/index.js"),
    ]);
    window.__api = { AppCore, Http, Cuenta, CuentaApi, Usuarios, SidebarUI, Home, Avatars };
    window.__calls = [];
    window.__unexpectedHttp = [];
    window.__pendingRequests = [];
    window.__held = "";
    window.__sessionNumber = 0;
    window.__current = {
      userId: "ON-BROWSER-PROFILE", id: "ON-BROWSER-PROFILE", username: "fixture-profile", slug: "fixture-profile",
      name: "Ana Nombre Inicial", email: "profile@example.test", role: "admin", permissions: ["users:write"],
      avatarUrl: "/fixture-photo-old.svg", hasAvatar: true,
    };
    const request = (method, path, body) => {
      window.__calls.push({ method, path });
      const type = path === "/api/auth/me" ? "load" : path === "/api/users/avatar" ? method === "DELETE" ? "delete" : "upload" : "";
      if (type && window.__held === type) {
        return new Promise((resolve, reject) => window.__pendingRequests.push({ type, resolve, reject }));
      }
      if (type === "load") return Promise.resolve({ user: structuredClone(window.__current) });
      if (type === "upload") {
        window.__current.avatarUrl = "/fixture-photo-new.svg";
        window.__current.hasAvatar = true;
        return Promise.resolve({ avatarUrl: window.__current.avatarUrl });
      }
      if (type === "delete") {
        window.__current.avatarUrl = "";
        window.__current.hasAvatar = false;
        return Promise.resolve({ ok: true });
      }
      if (method === "PATCH" && path === "/api/users/ON-BROWSER-PROFILE") {
        window.__current.name = body.name;
        return Promise.resolve({ ok: true, user: { userId: window.__current.userId, name: body.name } });
      }
      if (path === "/api/users/me/onboarding") return Promise.resolve({ onboarding: { required: false } });
      if (method === "GET" && /\/stats$/.test(path)) return Promise.resolve({ ok: true, total: 0, totalKnown: true, totalAmount: 0, paidAmount: 0, pendingAmount: 0, currency: "EUR" });
      if (method === "GET" && /^\/api\/(tickets|incidencias|facturas|clientes|users)(\/page)?$/.test(path)) {
        return Promise.resolve({ ok: true, items: [], total: 0, totalKnown: true, hasMore: false, nextCursor: "" });
      }
      window.__unexpectedHttp.push({ method, path });
      return Promise.reject(new Error("Unexpected fixture HTTP: " + method + " " + path));
    };
    for (const [method, name] of [["GET", "get"], ["POST", "post"], ["PATCH", "patch"], ["PUT", "put"], ["DELETE", "del"], ["DELETE", "delete"]]) {
      Http[name] = (path, body) => request(method, path, body);
    }
    window.__applySession = () => {
      AppCore.applySession({ user: structuredClone(window.__current), token: "fixture-only-token-" + ++window.__sessionNumber,
        session: { sessionId: "fixture-only-session-" + window.__sessionNumber } });
      AppCore.setRoute("/cuenta");
      AppCore.setPublicPath("/@fixture-profile/cuenta");
    };
    window.__mountCuenta = () => Cuenta.CuentaView(document.querySelector("#fixture-cuenta"), { path: "/cuenta" });
    window.__applySession();
    SidebarUI.init();
    Avatars.mountAvatarSystem({ AppCore, Auth: { getCurrentUser: () => AppCore.getCurrentUser() } });
    window.__cuenta = window.__mountCuenta();
    window.__home = Home.HomeView(document.querySelector("#fixture-home"), { path: "/@fixture-profile" });
  });

  const surfaces = [
    { name: "Cuenta", host: "#fixture-cuenta .cuenta-avatar--hero", fallback: ".cuenta-avatar-fallback", label: "#fixture-cuenta .cuenta-profile-name" },
    { name: "Sidebar", host: "[data-sidebar-action='account-menu'] [data-sidebar-user-avatar]", fallback: "[data-sidebar-avatar-fallback]", label: ".sidebar-user-name" },
    { name: "Home", host: ".home-current-user-avatar", fallback: "[data-avatar-fallback]", label: ".home-title" },
  ];
  async function assertNames(name) {
    for (const surface of surfaces) {
      await page.waitForFunction(({ selector, name }) => document.querySelector(selector)?.textContent?.includes(name), { selector: surface.label, name });
      assert.equal(await page.locator(surface.label).isVisible(), true, `${surface.name}: nombre visible`);
    }
  }
  async function assertPhotos(suffix) {
    for (const surface of surfaces) {
      await page.locator(surface.host).scrollIntoViewIfNeeded();
      await page.waitForFunction(({ selector, suffix }) => {
        const image = document.querySelector(selector)?.querySelector("img");
        return image?.src?.endsWith(suffix) && image.complete && image.naturalWidth > 0;
      }, { selector: surface.host, suffix }).catch(async (error) => {
        const detail = await page.locator(surface.host).evaluate((node) => ({ html: node.outerHTML, width: node.querySelector("img")?.naturalWidth }));
        throw new Error(`${surface.name}: ${JSON.stringify(detail)}; ${error.message}`);
      });
      assert.equal(await page.locator(surface.host + " img").isVisible(), true, `${surface.name}: imagen visible`);
      assert.equal(await page.locator(surface.host + " img").evaluate((node) => Number(getComputedStyle(node).opacity) > 0), true);
    }
  }
  async function identities() {
    return page.evaluate((surfaces) => surfaces.map(({ name, host }) => {
      const node = document.querySelector(host);
      return { name, userId: node?.dataset.avatarUserId, identity: node?.dataset.avatarIdentity, tone: node?.dataset.avatarTone };
    }), surfaces);
  }
  await assertNames("Ana Nombre Inicial");
  await assertPhotos("/fixture-photo-old.svg");
  const initialIdentities = await identities();
  for (const item of initialIdentities) {
    assert.equal(item.userId.toLowerCase(), "on-browser-profile");
    assert.ok(item.identity && item.tone);
  }
  assert.equal(new Set(initialIdentities.map((item) => item.identity)).size, 1, "los tres avatares comparten identidad");
  assert.equal(new Set(initialIdentities.map((item) => item.tone)).size, 1, "los tres avatares comparten tone");

  await page.evaluate(() => window.__api.Usuarios.updateUsuarioRequest("ON-BROWSER-PROFILE", { name: "Beatriz Nombre Confirmado" }));
  await assertNames("Beatriz Nombre Confirmado");
  assert.deepEqual(await identities(), initialIdentities, "el cambio de nombre conserva userId, fingerprint y tone");
  await assertPhotos("/fixture-photo-old.svg");

  const upload = { name: "fixture.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nXkAAAAASUVORK5CYII=", "base64") };
  await page.locator('[data-cuenta-field="avatar"]').setInputFiles(upload);
  await assertPhotos("/fixture-photo-new.svg");
  await page.locator('[data-cuenta-action="delete-avatar"]').click();
  for (const surface of surfaces) {
    await page.waitForFunction((selector) => !document.querySelector(selector)?.querySelector("img"), surface.host);
    const fallback = page.locator(surface.host).locator(surface.fallback);
    assert.equal(await fallback.isVisible(), true, `${surface.name}: fallback visible tras borrar la foto`);
    assert.equal(await fallback.evaluate((node) => Number(getComputedStyle(node).opacity) > 0), true,
      `${surface.name}: el fallback no conserva la opacidad de la foto eliminada`);
    assert.equal(await fallback.innerText(), "BC", `${surface.name}: iniciales del nombre confirmado`);
  }
  assert.deepEqual(await identities(), initialIdentities);

  // Deliberately ignore transport cancellation, rotate the session while keeping
  // the same userId, and mount the new Cuenta in the same DOM host before resolve.
  for (const operation of ["upload", "delete", "load"]) {
    await page.evaluate(async (operation) => {
      window.__cuenta.destroy();
      window.__held = "";
      window.__current = { ...window.__current, name: "Sesión anterior", avatarUrl: "/fixture-photo-old.svg", hasAvatar: true };
      window.__applySession();
      window.__api.SidebarUI.sync();
      window.__cuenta = window.__mountCuenta();
      await window.__cuenta.refresh();
      window.__held = operation;
      window.__pendingRequests = [];
      window.__oldController = window.__cuenta;
      if (operation === "upload") window.__oldOperation = window.__cuenta.uploadAvatar(new File(["fixture"], "fixture.png", { type: "image/png" }));
      else if (operation === "delete") window.__oldOperation = window.__cuenta.deleteAvatar();
      else window.__oldOperation = window.__cuenta.refresh();
    }, operation);
    await page.waitForFunction(() => window.__pendingRequests.length === 1);
    if (operation !== "load") {
      assert.equal(await page.locator("#fixture-cuenta").getAttribute("data-cuenta-saving"), "true");
      assert.equal(await page.locator('[data-cuenta-action="choose-avatar"]').isDisabled(), true);
      await page.evaluate((operation) => {
        if (operation === "upload") void window.__cuenta.uploadAvatar(new File(["fixture"], "fixture.png", { type: "image/png" }));
        else void window.__cuenta.deleteAvatar();
      }, operation);
      assert.equal(await page.evaluate(() => window.__pendingRequests.length), 1, "un control ocupado no repite una mutación");
    }
    await page.evaluate(async () => {
      window.__held = "";
      window.__current = { ...window.__current, name: "Nueva Sesión Vigente", avatarUrl: "/fixture-photo-current.svg", hasAvatar: true };
      window.__applySession();
      window.__api.SidebarUI.sync();
      window.__cuenta = window.__mountCuenta();
      await window.__cuenta.refresh();
      await window.__home.refresh();
    });
    await assertNames("Nueva Sesión Vigente");
    await assertPhotos("/fixture-photo-current.svg");
    const before = await page.locator("#fixture-cuenta").innerHTML();
    await page.evaluate(async (operation) => {
      window.__pendingRequests[0].resolve(operation === "delete" ? { ok: true } : {
        user: { ...window.__current, name: "Respuesta Antigua Prohibida", avatarUrl: "/fixture-photo-stale.svg" },
        avatarUrl: "/fixture-photo-stale.svg",
      });
      await window.__oldOperation;
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    }, operation);
    assert.equal(await page.locator("#fixture-cuenta").innerHTML(), before, `${operation}: la respuesta vieja no repinta la nueva Cuenta`);
    await assertNames("Nueva Sesión Vigente");
    await assertPhotos("/fixture-photo-current.svg");
    assert.equal(await page.evaluate(() => window.__api.AppCore.getCurrentUser().name), "Nueva Sesión Vigente");
    assert.equal(await page.evaluate(() => window.__api.AppCore.getCurrentUser().avatarUrl), "/fixture-photo-current.svg");
    assert.equal(await page.evaluate(() => window.__oldController.getSnapshot().destroyed), true);
  }
  assert.deepEqual(await page.evaluate(() => window.__unexpectedHttp), []);
  assert.deepEqual(errors, []);
  assert.equal(externalRequests.filter((url) => /\/api\//.test(url)).length, 0, "ninguna operación usa una API externa");
  console.log("Private profile browser contract: PASS · real Cuenta/Sidebar/Home · visible name/photo/fallback · stable identity · pending/session/late destroy · injected HTTP only");
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
