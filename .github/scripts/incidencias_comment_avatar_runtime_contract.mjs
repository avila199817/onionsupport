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
if (!executablePath) throw new Error("Chrome/Chromium is required for the comment avatar runtime contract.");

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname;
  if (pathname === "/") {
    response.writeHead(200, { "Content-Type": "text/html" }).end('<!doctype html><html><body><main id="fixture"></main></body></html>');
    return;
  }
  if (pathname === "/photo.svg") {
    response.writeHead(200, { "Content-Type": "image/svg+xml" }).end('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="red"/></svg>');
    return;
  }
  if (pathname === "/src/views/incidencias/incidencias.api.js") {
    response.writeHead(200, { "Content-Type": "text/javascript" }).end("export async function loadIncidenciaDetail() { window.detailLoads = (window.detailLoads || 0) + 1; return window.detail; }");
    return;
  }
  const target = resolve(ROOT, `.${pathname}`);
  if (!target.startsWith(`${ROOT.replace(/\/$/, "")}${sep}src${sep}`)) {
    response.writeHead(404).end(); return;
  }
  try {
    // CSS is a bundler side effect; this fixture exercises the actual JS
    // adapters and AvatarSystem against browser DOM and image events.
    const contents = (await readFile(target, "utf8")).replace(/^import\s+["'][^"']+\.css["'];\s*$/gm, "");
    response.writeHead(200, { "Content-Type": "text/javascript" }).end(contents);
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page.evaluate(async () => {
    window.detail = {
      userId: "requester-user", email: "shared@example.test", username: "requester",
      assignedToUserId: "technician-user", assignedToEmail: "shared@example.test", assignedToUsername: "technician",
      comments: [
        { id: "requester-comment", byName: "Alex Gómez", byUserId: "requester-user", byEmail: "shared@example.test" },
        { id: "technician-comment", byName: "Alex Gómez", byUserId: "technician-user", byEmail: "shared@example.test" },
        { id: "third-comment", byName: "Alex Gómez", byUserId: "third-user", byEmail: "shared@example.test", byUsername: "third" },
      ],
    };
    const fixture = document.querySelector("#fixture");
    fixture.innerHTML = `<section data-incidencias-modal-root="true" data-ticket-id="fixture-ticket">
      <div class="incidencias-modal-avatar" title="Alex Gómez" data-avatar-system="off" data-avatar-managed="false"><img src="/photo.svg" data-modal-avatar-img="true"></div>
      <div data-modal-technician="true" data-technician-assigned="true"><div class="incidencias-modal-technician-copy"><strong>Alex Gómez</strong></div><img src="/photo.svg" data-modal-technician-avatar-img="true"></div>
      ${detail.comments.map((comment) => `<article class="incidencias-timeline-card is-comment" data-comment-id="${comment.id}"><div class="incidencias-timeline-meta"><strong>${comment.byName}</strong></div></article>
        <article class="incidencias-modal-description-comment" data-comment-id="${comment.id}"><div class="incidencias-modal-description-comment-head"><strong>${comment.byName}</strong><span class="incidencias-modal-description-comment-date">Hoy</span></div></article>`).join("")}
    </section>`;
    window.avatars = await import("/src/features/avatar-system/index.js");
    avatars.mountAvatarSystem();
    window.timeline = await import("/src/features/incidencias-comment-avatars/index.js");
    window.followup = await import("/src/features/incidencias-followup-avatars/index.js");
    window.commentHost = (id, kind = "followup") => document.querySelector(`[data-comment-id="${id}"] .${kind === "timeline" ? "incidencias-timeline-comment-avatar" : "incidencias-modal-description-comment-avatar"}`);
    window.syncComments = () => {
      timeline.syncIncidenciasCommentAvatars(document);
      followup.syncIncidenciasFollowupAvatars(document);
      avatars.synchronizeAvatars(document);
    };
  });
  await page.waitForFunction(() => commentHost("third-comment")?.dataset.avatarUserId === "third-user");
  await page.evaluate(() => syncComments());
  const initial = await page.evaluate(() => ({
    requester: commentHost("requester-comment")?.dataset.avatarUserId,
    technician: commentHost("technician-comment")?.dataset.avatarUserId,
    third: commentHost("third-comment")?.dataset.avatarUserId,
    thirdPhoto: Boolean(commentHost("third-comment")?.querySelector("img")),
    thirdTimeline: Boolean(commentHost("third-comment", "timeline")),
    timelineRequest: commentHost("requester-comment", "timeline")?.dataset.avatarUserId,
    timelineTech: commentHost("technician-comment", "timeline")?.dataset.avatarUserId,
    followupCount: document.querySelectorAll(".incidencias-modal-description-comment-avatar").length,
    timelineCount: document.querySelectorAll(".incidencias-timeline-comment-avatar").length,
  }));
  assert.deepEqual(initial, {
    requester: "requester-user", technician: "technician-user", third: "third-user", thirdPhoto: false,
    thirdTimeline: false, timelineRequest: "requester-user", timelineTech: "technician-user", followupCount: 3, timelineCount: 2,
  });

  await page.evaluate(() => {
    window.before = [commentHost("requester-comment"), commentHost("requester-comment", "timeline"), commentHost("third-comment")].map((node) => ({ node, fingerprint: node.dataset.avatarIdentity, tone: node.dataset.avatarTone }));
  });
  for (const aliases of [
    { email: "changed@example.test", username: "changed-user" },
    { email: "", username: "" },
  ]) {
    await page.evaluate((next) => {
      detail.email = next.email;
      detail.username = next.username;
      detail.comments[2].byEmail = next.email;
      detail.comments[2].byUsername = next.username;
      syncComments();
    }, aliases);
    await page.waitForFunction((email) => commentHost("requester-comment")?.dataset.avatarEmail === email && commentHost("requester-comment", "timeline")?.dataset.avatarEmail === email && commentHost("third-comment")?.dataset.avatarEmail === email, aliases.email);
    const after = await page.evaluate(() => before.map(({ node, fingerprint, tone }, index) => {
      const current = index === 2 ? commentHost("third-comment") : commentHost("requester-comment", index ? "timeline" : "followup");
      return { sameNode: current === node, sameFingerprint: current.dataset.avatarIdentity === fingerprint, sameTone: current.dataset.avatarTone === tone, email: current.dataset.avatarEmail, username: current.dataset.avatarUsername };
    }));
    for (const result of after) assert.deepEqual(result, { sameNode: true, sameFingerprint: true, sameTone: true, ...aliases });
  }

  async function renderRealDetail(comments, { historyOpen = false, name = "First Person", email = "a@example.test", assigned = true } = {}) {
    const previousLoads = await page.evaluate(async ({ comments, historyOpen, name, email, assigned }) => {
      const previousLoads = window.detailLoads || 0;
      window.detail = {
        ticketId: "real-comment-fixture", id: "real-comment-fixture", subject: "Identity fixture", description: "Real template",
        status: "open", userId: "user-a", name, displayName: name, email, avatarUrl: "/photo.svg", comments,
        ...(assigned ? { assignedToUserId: "user-b", assignedToName: "Second Person", assignedToEmail: "b@example.test", assignedToAvatarUrl: "/photo.svg" } : {}),
      };
      const templates = await import("/src/views/incidencias/incidencias.template.modal.js");
      document.querySelector("#fixture").innerHTML = templates.renderIncidenciasDetailModal({ open: true, detail, admin: true, historyOpen });
      syncComments();
      return previousLoads;
    }, { comments, historyOpen, name, email, assigned });
    await page.waitForFunction((previous) => window.detailLoads > previous, previousLoads);
    if (!historyOpen) await page.waitForFunction((count) => document.querySelectorAll(".incidencias-modal-description-comment-avatar").length === count, comments.length);
    await page.evaluate(() => syncComments());
    return page.evaluate((historyOpen) => [...document.querySelectorAll(historyOpen ? ".incidencias-timeline-card.is-comment" : ".incidencias-modal-description-comment")].map((card) => {
      const avatar = card.querySelector(historyOpen ? ".incidencias-timeline-comment-avatar" : ".incidencias-modal-description-comment-avatar");
      return {
        author: card.querySelector(historyOpen ? ".incidencias-timeline-meta strong" : ".incidencias-modal-description-comment-head strong")?.textContent?.trim(),
        commentId: card.getAttribute("data-comment-id"),
        userId: avatar?.dataset.avatarUserId ?? null,
        email: avatar?.dataset.avatarEmail ?? null,
        hasPhoto: Boolean(avatar?.querySelector("img")),
        identity: avatar?.dataset.avatarIdentity ?? null,
      };
    }).sort((a, b) => a.author.localeCompare(b.author)), historyOpen);
  }

  // Real production normalizers/renderers must not promote synthetic UI IDs
  // into the persisted record namespace or drop the real colliding record.
  for (const persistedId of ["comment_0", "entry_0"]) {
    const comments = [
      { byName: "First Person", byUserId: "user-a", body: "First body" },
      { id: persistedId, byName: "Second Person", byUserId: "user-b", body: "Second body" },
    ];
    for (const historyOpen of [false, true]) {
      const cards = await renderRealDetail(comments, { historyOpen });
      assert.equal(cards.length, 2, "both records survive a synthetic/persisted ID collision");
      assert.deepEqual(cards.map(({ author, commentId, userId }) => ({ author, commentId, userId })), [
        { author: "First Person", commentId: null, userId: "user-a" },
        { author: "Second Person", commentId: persistedId, userId: historyOpen ? null : "user-b" },
      ]);
      assert.equal(cards[0].hasPhoto, true, "the first author keeps its real photo despite the ID collision");
      assert.equal(cards[1].hasPhoto, !historyOpen, "history does not invent a photo when that profile is absent");
    }
  }

  for (const legacy of [{ byEmail: "b@example.test" }, { byEmail: "a@example.test" }, {}]) {
    const mixedAliases = [
      { byName: "Alex Gómez", byUserId: "user-a", byEmail: "a@example.test", body: "Known author" },
      { byName: "Alex Gómez", ...legacy, body: "Unlinked homonym" },
    ];
    for (const historyOpen of [false, true]) {
      const cards = await renderRealDetail(mixedAliases, { historyOpen, name: "Alex Gómez", assigned: false });
      assert.equal(cards.length, 2);
      assert.ok(cards.every((card) => card.commentId === null && !card.hasPhoto));
      assert.ok(cards.every((card) => card.userId === (historyOpen ? null : "")), "the legacy homonym cannot inherit the other author's UID");
    }
  }

  for (const historyOpen of [false, true]) {
    const cards = await renderRealDetail([
      { byName: "Legacy Author", by: "legacy@example.test", byEmail: "legacy@example.test", body: "Historical email-only comment" },
    ], { historyOpen, name: "Legacy Author", email: "legacy@example.test", assigned: false });
    assert.equal(cards.length, 1);
    assert.equal(cards[0].userId, "", "a legacy photo match cannot promote email to a user ID");
    assert.equal(cards[0].email, "legacy@example.test");
    assert.equal(cards[0].hasPhoto, true, "unambiguous legacy photos remain available");
    const expected = await page.evaluate(() => avatars.resolveAvatarPresentation({ name: "Legacy Author", email: "legacy@example.test" }).fingerprint);
    assert.equal(cards[0].identity, expected);
  }

  const signatures = await page.evaluate(async () => {
    const templates = await import("/src/views/incidencias/incidencias.template.modal.js");
    const signatureFor = (comment) => {
      const html = templates.renderIncidenciasDetailModal({ open: true, detail: { ticketId: "signature-fixture", description: "Fixture", comments: [comment] } });
      return new DOMParser().parseFromString(html, "text/html").querySelector("[data-description-comments='true']")?.dataset.commentSignature;
    };
    const base = { byName: "Original Author", body: "Unchanged body", createdAt: "2026-09-01T10:00:00Z" };
    return {
      synthetic: signatureFor(base),
      persisted: signatureFor({ ...base, id: "comment_0" }),
      original: signatureFor({ ...base, id: "fixed-id" }),
      renamed: signatureFor({ ...base, id: "fixed-id", byName: "Corrected Author" }),
    };
  });
  assert.ok(Object.values(signatures).every(Boolean));
  assert.notEqual(signatures.synthetic, signatures.persisted, "persisting a formerly synthetic UI id must refresh the comment's DOM association");
  assert.notEqual(signatures.original, signatures.renamed, "correcting author text must refresh the thread with unchanged id/body/date");
  assert.deepEqual(errors, []);
  console.log("Incidencias comment avatar runtime contract: PASS · persisted comment IDs · partial homonyms isolated · no legacy UID promotion · stable UID alias updates");
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
