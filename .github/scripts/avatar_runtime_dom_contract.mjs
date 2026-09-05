import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let executablePath = "";
for (const candidate of [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", chromium.executablePath()].filter(Boolean)) {
  try { await access(candidate); executablePath = candidate; break; } catch {}
}
if (!executablePath) throw new Error("Chrome/Chromium is required; set CHROME_BIN for the avatar DOM contract.");
const transparentImage = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="2" height="2" fill="red"/></svg>';
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname;
  if (pathname === "/") {
    response.writeHead(200, { "Content-Type": "text/html" }).end('<!doctype html><html><head><link rel="stylesheet" href="/src/css/components/avatar-system.css"></head><body><main id="fixture"></main></body></html>');
    return;
  }
  if (pathname === "/transparent.svg") {
    response.writeHead(200, { "Content-Type": "image/svg+xml" }).end(transparentImage);
    return;
  }
  const target = resolve(ROOT, `.${pathname}`);
  if (!target.startsWith(`${ROOT.replace(/\/$/, "")}${sep}src${sep}`)) {
    response.writeHead(404).end(); return;
  }
  try {
    const contents = await readFile(target);
    response.writeHead(200, { "Content-Type": target.endsWith(".css") ? "text/css" : "text/javascript" }).end(contents);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto(origin);
  await page.addScriptTag({ type: "module", url: `${origin}/src/ui/sidebar/template.js` });
  await page.evaluate(async () => {
    window.avatars = await import("/src/features/avatar-system/index.js");
    window.makeHost = (name = "Ana López", parent = document.querySelector("#fixture")) => {
      const host = document.createElement("span");
      host.className = "ui-avatar";
      if (name) host.dataset.avatarName = name;
      host.innerHTML = '<span data-avatar-fallback="true"></span>';
      parent.append(host);
      return host;
    };
    avatars.mountAvatarSystem();
    window.host = makeHost();
  });
  await page.waitForFunction(() => host.dataset.avatarInitials === "AL");
  assert.equal(await page.evaluate(() => host.dataset.avatarAuthority), "global");
  await page.evaluate(() => { host.dataset.avatarName = "Beatriz Moreno"; });
  await page.waitForFunction(() => host.dataset.avatarInitials === "BM");
  assert.equal(await page.evaluate(() => host.dataset.avatarTone), String(await page.evaluate(() => avatars.resolveAvatarPresentation({ name: "Beatriz Moreno" }).tone)));
  const nameIdentity = await page.evaluate(() => host.dataset.avatarIdentity);
  await page.evaluate(() => { host.dataset.avatarUserId = "fixture-beatriz"; });
  await page.waitForFunction((previous) => host.dataset.avatarIdentity !== previous, nameIdentity);
  const userIdentity = await page.evaluate(() => host.dataset.avatarIdentity);
  await page.evaluate(() => { host.dataset.avatarEmail = "beatriz@example.test"; });
  await page.waitForFunction((previous) => host.dataset.avatarIdentity !== previous, userIdentity);

  await page.evaluate(() => {
    window.row = document.createElement("div");
    row.dataset.userRow = "true";
    row.dataset.userName = "Carlos Pérez";
    document.querySelector("#fixture").append(row);
    window.rowHost = makeHost("", row);
  });
  await page.waitForFunction(() => rowHost.dataset.avatarInitials === "CP");
  await page.evaluate(() => { row.dataset.userName = "Diana Navarro"; });
  await page.waitForFunction(() => rowHost.dataset.avatarInitials === "DN");

  let heldImage;
  await page.route("**/slow.svg", (route) => { heldImage = route; });
  await page.evaluate(() => {
    window.photo = document.createElement("img");
    photo.src = "/slow.svg";
    host.prepend(photo);
  });
  await page.waitForFunction(() => host.dataset.avatarState === "loading");
  // The loading state must keep the canonical fallback visible until decode.
  assert.equal(await page.evaluate(() => getComputedStyle(host.querySelector("[data-avatar-fallback]")).visibility), "visible");
  for (let attempt = 0; !heldImage && attempt < 20; attempt += 1) await new Promise((r) => setTimeout(r, 10));
  assert.ok(heldImage, "The image request must be held before completion");
  await heldImage.fulfill({ contentType: "image/svg+xml", body: transparentImage });
  await page.waitForFunction(() => host.dataset.avatarState === "image");
  const alphaState = await page.evaluate(() => ({
    background: getComputedStyle(host).backgroundColor,
    fallback: getComputedStyle(host.querySelector("[data-avatar-fallback]")).visibility,
    image: getComputedStyle(photo).visibility,
  }));
  assert.equal(alphaState.background, "rgba(0, 0, 0, 0)");
  assert.equal(alphaState.fallback, "hidden");
  assert.equal(alphaState.image, "visible");

  await page.evaluate(() => { photo.remove(); });
  await page.waitForFunction(() => host.dataset.avatarState === "fallback");
  await page.evaluate(() => {
    window.photo = document.createElement("img");
    photo.src = "/missing-avatar.svg";
    host.prepend(photo);
  });
  await page.waitForFunction(() => host.dataset.avatarState === "error" && photo.hidden);
  const settled = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 30));
    const before = avatars.getAvatarSystemSnapshot().counters.scans;
    await new Promise((r) => setTimeout(r, 50));
    return before === avatars.getAvatarSystemSnapshot().counters.scans;
  });
  assert.equal(settled, true, "Broken-image reconciliation must settle without an observer loop");
  await page.evaluate(() => { photo.src = "/transparent.svg"; });
  await page.waitForFunction(() => host.dataset.avatarState === "image" && !photo.hidden);
  await page.evaluate(() => {
    window.transient = makeHost("Elena Díaz");
    avatars.destroyAvatarSystem();
  });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 20)));
  assert.equal(await page.evaluate(() => transient.hasAttribute("data-avatar-state")), false, "Destroy must cancel queued DOM reconciliation");
  await page.evaluate(() => avatars.mountAvatarSystem());
  await page.waitForFunction(() => transient.dataset.avatarInitials === "ED");

  // Existing private adapters must yield failed-image recovery to the same engine.
  await page.evaluate(async () => {
    const facturas = await import("/src/views/facturas/facturas.template.js");
    await import("/src/features/incidencias-detail-state/index.js");
    window.invoiceHost = makeHost("Factura Persona");
    invoiceHost.dataset.facturasAvatar = "true";
    invoiceHost.innerHTML = '<img data-facturas-avatar-img="true" src="/missing-invoice.svg"><span data-avatar-fallback="true"></span>';
    facturas.bindFacturasTemplateDom(invoiceHost);
    window.technicianHost = makeHost("Técnico Persona");
    technicianHost.dataset.modalTechnicianAvatarFrame = "true";
    technicianHost.innerHTML = '<img data-modal-technician-avatar-img="true" src="/missing-technician.svg"><span data-avatar-fallback="true"></span>';
  });
  await page.waitForFunction(() => invoiceHost.dataset.avatarState === "error" && technicianHost.dataset.avatarState === "error");
  assert.equal(await page.evaluate(() => technicianHost.querySelector("img")?.hidden), true, "Incidencias must preserve the failed image for canonical source recovery");
  await page.evaluate(() => {
    invoiceHost.querySelector("img").src = "/transparent.svg";
    technicianHost.querySelector("img").src = "/transparent.svg";
  });
  await page.waitForFunction(() => invoiceHost.dataset.avatarState === "image" && technicianHost.dataset.avatarState === "image");

  await page.evaluate(async () => {
    const sidebar = await import("/src/ui/sidebar/template.js");
    const footer = sidebar.createSidebarFooter({ name: "Maria del Carmen Ortiz", userId: "fixture-sidebar", avatarUrl: "/missing-sidebar.svg" });
    document.querySelector("#fixture").append(footer);
    window.sidebarHost = footer.querySelector("[data-sidebar-user-avatar]");
    for (const image of footer.querySelectorAll("img")) image.loading = "eager";
  });
  await page.waitForFunction(() => sidebarHost.dataset.avatarState === "error");
  assert.equal(await page.evaluate(() => sidebarHost.dataset.avatarInitials), "M", "Sidebar must use canonical initials before image completion");
  assert.equal(await page.evaluate(() => sidebarHost.querySelector("img").getAttribute("src")), "/missing-sidebar.svg", "Sidebar must retain the source for canonical error/recovery tracking");
  await page.evaluate(() => { sidebarHost.querySelector("img").src = "/transparent.svg"; });
  await page.waitForFunction(() => sidebarHost.dataset.avatarState === "image");

  await page.evaluate(async () => {
    window.userModal = await import("/src/views/usuarios/usuarios.template.modal.js");
    userModal.openUsuariosModal({ id: "fixture-user", name: "Usuario Persona", email: "fixture@example.test", avatarUrl: "/missing-user.svg" });
    window.userHost = document.querySelector("[data-usuarios-avatar-frame='true']");
    const image = userHost?.querySelector("img");
    if (image) image.loading = "eager";
  });
  await page.waitForFunction(() => userHost?.dataset.avatarState === "error");
  assert.equal(await page.evaluate(() => userHost.dataset.avatarTone), String(await page.evaluate(() => avatars.resolveAvatarPresentation({ name: "Usuario Persona" }).tone)));
  assert.equal(await page.evaluate(() => userHost.dataset.avatarInitials), "UP");
  await page.evaluate(() => { userHost.querySelector("img").src = "/transparent.svg"; });
  await page.waitForFunction(() => userHost.dataset.avatarState === "image");
  await page.evaluate(() => userModal.closeUsuariosModal());

  await page.evaluate(async () => {
    const mail = await import("/src/views/correo/correo.template.js");
    const container = document.createElement("div");
    container.innerHTML = mail.renderConnectionCard({ connected: true, mailbox: "fixture@example.test" }, { displayName: "Ana Maria López", avatarUrl: "/missing-mail-avatar.svg" });
    document.querySelector("#fixture").append(container);
    window.mailHost = container.querySelector(".correo-account-avatar");
  });
  await page.waitForFunction(() => mailHost.dataset.avatarState === "error");
  assert.equal(await page.evaluate(() => mailHost.querySelector("[data-avatar-fallback]").textContent), "AL");
  await page.evaluate(() => { mailHost.querySelector("img").src = "/transparent.svg"; });
  await page.waitForFunction(() => mailHost.dataset.avatarState === "image");

  // Exercise the actual public account adapter with a fixture session, no API.
  await page.evaluate(async () => {
    const { AppCore } = await import("/src/core/index.js");
    window.publicCore = AppCore;
    AppCore.runtimeState.write({ token: "fixture.header.payload", user: { userId: "fixture-user", username: "ana", name: "Ana López", email: "ana@example.test", role: "user", avatarUrl: "https://untrusted.example.test/avatar.svg" } });
    const root = document.createElement("section");
    root.dataset.publicHome = "true";
    root.innerHTML = '<section data-public-support-section="true"></section><div class="public-home-nav-actions"><a data-public-home-login="true">Panel</a></div><div data-public-home-account-slot="true"></div>';
    document.querySelector("#fixture").append(root);
    window.publicSupport = (await import("/src/features/public-support/index.js")).default;
    publicSupport.scan();
    window.publicExperience = (await import("/src/features/public-home-experience/index.js")).default;
    publicExperience.scan();
    window.publicHost = root.querySelector(".public-support-account-avatar");
  });
  await page.waitForFunction(() => publicHost?.dataset.avatarState === "fallback");
  assert.equal(await page.evaluate(() => publicHost.querySelector("img")), null, "Untrusted HTTPS image hosts must be rejected by the shared media policy");
  assert.equal(await page.evaluate(() => publicHost.dataset.avatarInitials), "AL");
  assert.equal(await page.evaluate(() => publicHost.closest("[data-public-home-account-slot]") !== null), true);
  assert.equal(await page.evaluate(() => getComputedStyle(publicHost).width), "36px", "Public topbar must use the shared shell avatar geometry");
  assert.deepEqual(
    await page.evaluate(() => ({
      name: document.querySelector(".public-support-account-name")?.textContent,
      email: document.querySelector(".public-support-account-email")?.textContent,
      cardChildren: [...(document.querySelector(".public-support-account")?.children || [])].map((node) => node.className),
      nameHasTitle: document.querySelector(".public-support-account-name")?.hasAttribute("title"),
      emailHasTitle: document.querySelector(".public-support-account-email")?.hasAttribute("title"),
      hasHoverTooltip: "publicSupportAccountTooltip" in (document.querySelector(".public-support-account")?.dataset || {}),
      ariaLabel: document.querySelector("[data-public-home-account-toggle]")?.getAttribute("aria-label"),
    })),
    {
      name: "Ana López",
      email: "ana@example.test",
      cardChildren: ["public-support-account-avatar", "public-support-account-copy"],
      nameHasTitle: false,
      emailHasTitle: false,
      hasHoverTooltip: false,
      ariaLabel: "Abrir accesos rápidos de Ana López, ana@example.test",
    },
    "La cuenta pública debe mostrar nombre completo y correo dentro de una única tarjeta del avatar"
  );
  await page.evaluate(() => {
    const state = publicCore.getState();
    publicCore.runtimeState.write({
      user: {
        ...state.user,
        name: "Cristian Ávila Luque",
        displayName: "Cristian Ávila Luque",
        email: "CRISTIAN@ONIONSUPPORT.COM",
      },
    });
    publicSupport.scan();
    publicExperience.scan();
    window.publicHost = document.querySelector(".public-support-account-avatar");
  });
  await page.waitForFunction(() => document.querySelector(".public-support-account-name")?.textContent === "Cristian Ávila Luque");
  assert.deepEqual(
    await page.evaluate(() => ({
      name: document.querySelector(".public-support-account-name")?.textContent,
      email: document.querySelector(".public-support-account-email")?.textContent,
      cardChildren: [...(document.querySelector(".public-support-account")?.children || [])].map((node) => node.className),
      nameHasTitle: document.querySelector(".public-support-account-name")?.hasAttribute("title"),
      emailHasTitle: document.querySelector(".public-support-account-email")?.hasAttribute("title"),
      hasHoverTooltip: "publicSupportAccountTooltip" in (document.querySelector(".public-support-account")?.dataset || {}),
      ariaLabel: document.querySelector("[data-public-home-account-toggle]")?.getAttribute("aria-label"),
    })),
    {
      name: "Cristian Ávila Luque",
      email: "cristian@onionsupport.com",
      cardChildren: ["public-support-account-avatar", "public-support-account-copy"],
      nameHasTitle: false,
      emailHasTitle: false,
      hasHoverTooltip: false,
      ariaLabel: "Abrir accesos rápidos de Cristian Ávila Luque, cristian@onionsupport.com",
    },
    "La identidad larga debe conservarse dentro de una única tarjeta sin titles ni tooltip duplicado"
  );
  await page.evaluate(() => {
    const state = publicCore.getState();
    publicCore.runtimeState.write({ user: { ...state.user, avatarUrl: "/transparent.svg" } });
    publicSupport.scan();
    window.publicHost = document.querySelector(".public-support-account-avatar");
  });
  await page.waitForFunction(() => publicHost.dataset.avatarState === "image");
  assert.equal(await page.evaluate(() => publicHost.dataset.avatarAuthority), "global");
  assert.equal(await page.evaluate(() => getComputedStyle(publicHost).backgroundColor), "rgba(0, 0, 0, 0)");
  await page.evaluate(() => { publicHost.querySelector("img").remove(); });
  await page.waitForFunction(() => publicHost.dataset.avatarState === "fallback");
  assert.deepEqual(failures, []);
  console.log("Avatar DOM contract: PASS · public/shared authority · dynamic identity · loading/error/recovery · image removal · transparent alpha · observer settles · teardown/remount · media policy");
} finally {
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
