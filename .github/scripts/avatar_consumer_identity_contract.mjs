import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let executablePath = "";
for (const candidate of [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/chromium", chromium.executablePath()].filter(Boolean)) {
  try { await access(candidate); executablePath = candidate; break; } catch {}
}
if (!executablePath) throw new Error("Set CHROME_BIN to run the avatar consumer identity contract.");

// Only the external data boundaries are fixtures. Rendering, hydration, events
// and AvatarSystem run their production modules in the browser.
const fixtures = new Map([
  ["/src/core/index.js", "export const AppCore = window.fixtureCore;"],
  ["/src/core/http.js", "export default {};"],
  ["/src/views/incidencias/incidencias.api.js", `
    export async function loadIncidenciaDetail() { return window.ticketDetail; }
    export async function loadIncidenciasPage({ query }) {
      window.metricQueries.push(query);
      return { total: 0 };
    }
  `],
  ["/src/views/usuarios/usuarios.api.js", `
    export async function getUsuarioByIdRequest(id) {
      window.requestedUserIds.push(id);
      if (window.expectedUserId && id !== window.expectedUserId) return null;
      return window.userDetail;
    }
  `],
]);
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname;
  if (pathname === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<!doctype html><html><body>
      <main id="view-container">
        <section data-public-home><a data-public-home-login href="/login">Panel cliente</a><div data-public-support-section></div></section>
        <div id="ticket-fixture" data-ticket-row="true" data-ticket-id="ticket-fixture" data-user-id="requester-other">
          <span id="technician-trigger" class="incidencias-assigned-badge" data-assigned="true" data-technician-user-id="ON-TECH-1">
            <span data-avatar-host="true" data-avatar-system="true" data-avatar-user-id="on-tech-1" data-avatar-name="Ana Técnica" data-avatar-email="ana@example.test" data-avatar-username="ana">
              <span data-avatar-fallback="true"></span>
            </span><strong>Texto antiguo</strong>
          </span>
        </div>
      </main>
    </body></html>`);
    return;
  }
  if (fixtures.has(pathname)) {
    response.writeHead(200, { "Content-Type": "text/javascript" }).end(fixtures.get(pathname));
    return;
  }
  if (pathname === "/avatar-fixture.svg") {
    response.writeHead(200, { "Content-Type": "image/svg+xml" }).end('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="red"/></svg>');
    return;
  }
  const target = resolve(ROOT, `.${pathname}`);
  if (!target.startsWith(`${ROOT.replace(/\/$/, "")}${sep}src${sep}`)) {
    response.writeHead(404).end(); return;
  }
  try {
    let contents = await readFile(target, "utf8");
    if (pathname === "/src/features/incidencias-technician-profile/index.js") {
      // Native browser modules need the build's CSS side-effect import removed.
      contents = contents.replace('import "./style.css";', "");
    }
    response.writeHead(200, { "Content-Type": target.endsWith(".css") ? "text/css" : "text/javascript" }).end(contents);
  } catch { response.writeHead(404).end(); }
});
await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.route("**/*", (route) => {
    if (route.request().url() === "https://onionassets.blob.core.windows.net/avatars/stale-technician.svg") {
      return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="red"/></svg>' });
    }
    return new URL(route.request().url()).origin === origin ? route.continue() : route.abort();
  });
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto(origin);
  await page.evaluate(async () => {
    window.fixtureState = {
      authenticated: true,
      homePath: "/@account",
      currentUser: { userId: "account-1", name: "Cuenta Persona", email: "old@example.test", username: "old-alias" },
    };
    window.fixtureCore = {
      getState: () => fixtureState,
      isAuthenticated: () => fixtureState.authenticated,
    };
    window.requestedUserIds = [];
    window.metricQueries = [];
    window.userDetail = null;
    window.avatars = await import("/src/features/avatar-system/index.js");
    window.support = (await import("/src/features/public-support/index.js")).default;
    await import("/src/features/incidencias-technician-profile/index.js");
    window.readPublicCard = () => {
      const wrap = document.querySelector(".public-support-account");
      const host = wrap.querySelector("[data-avatar-host]");
      return {
        email: wrap.querySelector(".public-support-account-email").textContent,
        label: wrap.getAttribute("aria-label"),
        emailDataset: host.dataset.avatarEmail,
        username: host.dataset.avatarUsername,
        userId: host.dataset.avatarUserId,
        fingerprint: host.dataset.avatarIdentity,
      };
    };
    window.readTechnician = () => {
      const host = document.querySelector("[data-avatar-source='incidencias-technician-profile']");
      return host && {
        name: host.dataset.avatarName,
        email: host.dataset.avatarEmail,
        userId: host.dataset.avatarUserId,
        username: host.dataset.avatarUsername,
        fingerprint: host.dataset.avatarIdentity,
        image: host.querySelector("img")?.getAttribute("src") || "",
      };
    };
    window.openTechnician = () => document.querySelector("#technician-trigger").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    window.closeTechnician = () => document.querySelector("[data-technician-profile-action='close']").click();
    support.scan();
  });

  const originalCard = await page.evaluate(() => readPublicCard());
  assert.equal(originalCard.email, "old@example.test");
  const changedCard = await page.evaluate(() => {
    fixtureState.currentUser.email = "new@example.test";
    fixtureState.currentUser.username = "new-alias";
    support.scan();
    return readPublicCard();
  });
  assert.equal(changedCard.email, "new@example.test");
  assert.equal(changedCard.emailDataset, "new@example.test");
  assert.equal(changedCard.username, "new-alias");
  assert.equal(changedCard.label, "Cuenta Persona, new@example.test");
  assert.equal(changedCard.fingerprint, originalCard.fingerprint, "Account aliases must not change the UID identity");

  const clearedCard = await page.evaluate(() => {
    delete fixtureState.currentUser.email;
    delete fixtureState.currentUser.username;
    support.scan();
    return readPublicCard();
  });
  assert.equal(clearedCard.email, "");
  assert.equal(clearedCard.emailDataset, "");
  assert.equal(clearedCard.username, "");
  assert.equal(clearedCard.label, "Cuenta Persona");
  assert.equal(clearedCard.userId, "account-1");
  assert.equal(clearedCard.fingerprint, originalCard.fingerprint);
  assert.equal(await page.evaluate(() => {
    const node = document.querySelector(".public-support-account");
    support.scan();
    return node === document.querySelector(".public-support-account");
  }), true, "Unchanged account content must reuse the card");

  // The projected nested avatar is authoritative before the ticket request ends.
  await page.evaluate(() => {
    window.ticketDetail = new Promise((resolveTicket) => { window.resolveTicket = resolveTicket; });
    window.expectedUserId = "ON-TECH-1";
    window.userDetail = { id: "ON-TECH-1", avatarUrl: "/avatar-fixture.svg" };
    openTechnician();
  });
  const loading = await page.evaluate(() => readTechnician());
  const expectedIdentity = await page.evaluate(() => avatars.resolveAvatarPresentation({ userId: "on-tech-1" }).fingerprint);
  assert.deepEqual(loading, {
    name: "Ana Técnica", email: "ana@example.test", userId: "ON-TECH-1", username: "ana", fingerprint: expectedIdentity, image: "",
  });
  await page.evaluate(() => resolveTicket({ ticketId: "ticket-fixture", assignedToName: "Ana Técnica Actualizada" }));
  await page.waitForSelector("[data-technician-rating='true']");
  const hydrated = await page.evaluate(() => readTechnician());
  assert.equal(hydrated.userId, "ON-TECH-1", "An incomplete ticket must retain the original technician UID");
  assert.equal(hydrated.fingerprint, loading.fingerprint);
  assert.equal(hydrated.name, "Ana Técnica Actualizada");
  assert.equal(hydrated.email, "ana@example.test");
  assert.equal(hydrated.username, "ana");
  assert.deepEqual(await page.evaluate(() => requestedUserIds), ["ON-TECH-1"], "User detail transport must preserve the exact domain ID");
  assert.equal(hydrated.image, "/avatar-fixture.svg");
  await page.waitForFunction(() => document.querySelector("[data-avatar-source='incidencias-technician-profile'] img")?.naturalWidth > 0);
  assert.equal(await page.evaluate(() => metricQueries.every((query) => query.q === "ON-TECH-1" && query.technicianUserId === "ON-TECH-1" && query.assignedToUserId === "ON-TECH-1")), true);

  // Detail cards project the original ID on the nested frame, not the outer trigger.
  await page.evaluate(() => {
    closeTechnician();
    const trigger = document.querySelector("#technician-trigger");
    delete trigger.dataset.technicianUserId;
    trigger.querySelector("[data-avatar-host]").dataset.technicianUserId = "ON-TECH-1";
    window.requestedUserIds = [];
    window.ticketDetail = { assignedToName: "Ana Técnica" };
    window.userDetail = { userId: "ON-TECH-1", name: "Ana Hidratada" };
    openTechnician();
  });
  await page.waitForSelector("[data-technician-rating='true']");
  const canonical = await page.evaluate(() => readTechnician());
  assert.equal(canonical.name, "Ana Hidratada");
  assert.equal(canonical.email, "ana@example.test", "Canonical UID casing must not discard the same person's known aliases");
  assert.equal(canonical.fingerprint, loading.fingerprint);
  assert.deepEqual(await page.evaluate(() => requestedUserIds), ["ON-TECH-1"]);

  // A wrong user-detail ID must not enrich the selected technician by shared email.
  await page.evaluate(() => {
    closeTechnician();
    window.ticketDetail = { assignedToUserId: "ON-TECH-1" };
    window.userDetail = { userId: "ON-TECH-2", name: "Otra Persona", email: "ana@example.test", avatarUrl: "/wrong-photo.webp" };
    openTechnician();
  });
  await page.waitForSelector("[data-technician-rating='true']");
  const conflict = await page.evaluate(() => readTechnician());
  assert.equal(conflict.userId, "ON-TECH-1");
  assert.equal(conflict.name, "Ana Técnica");
  assert.equal(conflict.fingerprint, loading.fingerprint);
  assert.equal(conflict.image, "");

  // A ticket reassignment may change UID, but must not inherit the old person's aliases.
  await page.evaluate(() => {
    closeTechnician();
    window.ticketDetail = { assignedToUserId: "ON-TECH-2" };
    window.expectedUserId = "ON-TECH-2";
    window.userDetail = null;
    openTechnician();
  });
  await page.waitForSelector("[data-technician-rating='true']");
  const reassigned = await page.evaluate(() => readTechnician());
  assert.equal(reassigned.userId, "ON-TECH-2");
  assert.equal(reassigned.name, "Técnico");
  assert.equal(reassigned.email, "");
  assert.equal(reassigned.username, "");
  assert.notEqual(reassigned.fingerprint, loading.fingerprint);

  // A visual alias alone can seed the avatar, but cannot become an exact HTTP ID.
  await page.evaluate(() => {
    closeTechnician();
    delete document.querySelector("#technician-trigger [data-avatar-host]").dataset.technicianUserId;
    window.ticketDetail = { assignedToName: "Ana Técnica" };
    window.requestedUserIds = [];
    window.metricQueries = [];
    window.expectedUserId = "ON-TECH-1";
    window.userDetail = { id: "ON-TECH-1", avatarUrl: "/avatar-fixture.svg" };
    openTechnician();
  });
  await page.waitForSelector("[data-technician-rating='true']");
  const visualOnly = await page.evaluate(() => readTechnician());
  assert.equal(visualOnly.userId, "on-tech-1");
  assert.equal(visualOnly.fingerprint, loading.fingerprint);
  assert.equal(visualOnly.image, "");
  assert.deepEqual(await page.evaluate(() => requestedUserIds), []);
  assert.equal(await page.evaluate(() => metricQueries.every((query) => query.technicianUserId === "" && query.assignedToUserId === "" && query.q !== "on-tech-1")), true);

  await page.evaluate(() => {
    closeTechnician();
    window.ticketDetail = { assignedToUserId: "ON-TECH-1" };
    openTechnician();
  });
  await page.waitForSelector("[data-technician-rating='true']");
  const fromTicket = await page.evaluate(() => readTechnician());
  assert.deepEqual(await page.evaluate(() => requestedUserIds), ["ON-TECH-1"], "A hydrated ticket may supply the original transport ID");
  assert.equal(fromTicket.fingerprint, visualOnly.fingerprint);
  assert.equal(fromTicket.image, "/avatar-fixture.svg");

  // Keep a valid old photo for the same user in the DOM: the profile must not
  // recover it after current ticket/user data explicitly clears that photo.
  await page.evaluate(() => {
    closeTechnician();
    const trigger = document.querySelector("#technician-trigger");
    trigger.dataset.technicianUserId = "ON-TECH-1";
    const host = trigger.querySelector("[data-avatar-host]");
    const image = document.createElement("img");
    image.dataset.avatarImage = "true";
    image.src = "https://onionassets.blob.core.windows.net/avatars/stale-technician.svg";
    host.prepend(image);
    avatars.synchronizeAvatarHost(host);
  });
  await page.waitForFunction(() => document.querySelector("#technician-trigger img")?.naturalWidth > 0);
  const clears = [
    {
      label: "ticket explicit null/empty aliases",
      ticket: { assignedToUserId: "ON-TECH-1", assignedToEmail: "", assignedToUsername: null, assignedToAvatarUrl: null },
      user: null,
    },
    {
      label: "ticket technician hasAvatar false",
      ticket: { assignedToUserId: "ON-TECH-1", tecnico: { email: null, username: "", hasAvatar: false, avatar: null }, assignment: { hasAvatar: false } },
      user: { id: "ON-TECH-1", hasAvatar: false, avatarUrl: null },
    },
    {
      label: "current user clears override old ticket/profile aliases",
      ticket: { assignedToUserId: "ON-TECH-1", assignedToEmail: "ana@example.test", assignedToUsername: "ana", assignedToAvatarUrl: "/avatar-fixture.svg" },
      user: { id: "ON-TECH-1", email: "", username: null, avatarUrl: null, raw: { email: "stale@example.test", username: "stale", avatar: "/avatar-fixture.svg" } },
    },
    {
      label: "current user hasAvatar false overrides an old URL",
      ticket: { assignedToUserId: "ON-TECH-1" },
      user: { id: "ON-TECH-1", email: null, username: "", hasAvatar: false, avatarUrl: "/avatar-fixture.svg" },
    },
  ];
  for (const fixture of clears) {
    await page.evaluate(({ ticket, user }) => {
      window.ticketDetail = ticket;
      window.userDetail = user;
      openTechnician();
    }, fixture);
    await page.waitForSelector("[data-technician-rating='true']");
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const cleared = await page.evaluate(() => readTechnician());
    assert.equal(cleared.userId, "ON-TECH-1", fixture.label);
    assert.equal(cleared.email, "", fixture.label);
    assert.equal(cleared.username, "", fixture.label);
    assert.equal(cleared.image, "", fixture.label);
    assert.equal(cleared.fingerprint, loading.fingerprint, fixture.label);
    assert.equal(await page.evaluate(() => {
      const wrapper = document.querySelector("#incidencias-technician-profile-root .ui-detail-modal-avatar");
      return wrapper.dataset.avatarSystem === "off" && wrapper.dataset.avatarManaged === "false" && !wrapper.hasAttribute("data-avatar-host") && wrapper.querySelectorAll("[data-avatar-host='true']").length === 1;
    }), true, "The layout wrapper must never become another avatar host");
    await page.evaluate(() => closeTechnician());
  }
  assert.deepEqual(failures, []);
  console.log("Avatar consumer identity contract OK: mutable account aliases, nested technician identity, exact transport IDs, incomplete hydration and conflicting UIDs.");
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
