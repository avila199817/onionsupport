import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

// Real cascade, without starting auth, HTTP or any application enhancement.
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const candidates = [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/opt/google/chrome/chrome"].filter(Boolean);
let executablePath;
for (const candidate of candidates) {
  try { await access(candidate); executablePath = candidate; break; } catch { /* next */ }
}
assert.ok(executablePath, "Set CHROME_BIN to a Chrome/Chromium executable");

const skeletons = [
  ["ui-skeleton", 11], ["ui-skeleton card", 120],
  ["incidencias-skeleton", 11], ["facturas-skeleton", 11],
  ["clientes-skeleton", 11], ["usuarios-skeleton", 11],
  ["cuenta-skeleton", 11], ["cuenta-skeleton cuenta-skeleton--title", 24],
  ["cuenta-skeleton cuenta-skeleton--control", 46],
  ["home-skeleton", 11], ["home-skeleton home-skeleton--icon", 38],
  ["home-skeleton home-skeleton--value", 28],
  ["home-skeleton home-skeleton--billing-value", 32],
];
const spinners = [
  ["ui-progress-spinner", 14], ["incidencias-spinner", 14],
  ["incidencias-inline-spinner", 14], ["facturas-inline-spinner", 14],
  ["clientes-inline-spinner", 14], ["usuarios-inline-spinner", 14],
  ["facturas-detail-spinner", 14],
  ...["inc", "cli", "fac", "usr"].flatMap((prefix) => [
    [`${prefix}-create-spinner`, 16], [`${prefix}-create-loading-spinner`, 24],
  ]),
  ["usr-create-submit-spinner", 16],
  ["ui-spinner", 28], ["ui-spinner sm", 18], ["ui-spinner lg", 42],
  ["server-spinner", 18], ["topbar-search-loading-dot", 26],
  ["incidencias-modal-live-sync-spinner", 16],
  ["entity-overlay-spinner", 32],
  ["incidencia-bridge-feedback-spinner", 23],
  ["factura-bridge-feedback-spinner", 23],
  ["fpc-spinner", 22], ["fpc-spinner fpc-spinner--button", 15],
];
const styles = [
  "/src/css/app.css",
  ...["home/index", "cuenta/index", "correo/index", "servidor/index", "incidencias/create", "incidencias/detail", "incidencias/media-preview", "clientes/create", "facturas/create", "facturas/detail", "usuarios/create", "public/public-support-progress"].map((name) => `/src/css/views/${name}.css`),
  "/src/css/auth/login.css", "/src/css/features/entity-overlay.css",
  ...["factura-modal-bridge", "incidencia-modal-bridge", "facturas-paid-confirm"].map((name) => `/src/features/${name}/style.css`),
];
const fixture = `<!doctype html><html><head><meta charset="utf-8">${styles.map((href) => `<link rel="stylesheet" href="${href}">`).join("")}
<style>.sample { display: flex; align-items: center; inline-size: 300px; min-block-size: 50px; color: var(--text-strong); } body { overflow: auto; }</style>
</head><body>
${skeletons.map(([klass, height], i) => `<div class="sample"><span id="s${i}" data-kind="skeleton" data-height="${height}" class="${klass}"></span></div>`).join("")}
${spinners.map(([klass, height], i) => `<div class="sample"><span id="p${i}" data-kind="spinner" data-height="${height}" class="${klass}" aria-hidden="true"></span></div>`).join("")}
<div class="sample incidencias-modal-inline-spinner"><span data-kind="spinner" data-height="14"></span><span>Guardando</span></div>
<div class="sample incidencias-modal-loading-box"><span data-kind="spinner" data-height="20"></span><span>Preparando</span></div>
<div data-correo-host="true"><div class="correo-workspace--boot">
<span class="correo-boot-account" data-kind="skeleton" data-height="54"></span>
<span class="correo-boot-line" data-kind="skeleton" data-height="34"></span>
<span class="correo-boot-title" data-kind="skeleton" data-height="38"></span>
</div><div class="correo-message-skeleton"><span data-kind="skeleton" data-height="34"></span><div><i data-kind="skeleton" data-height="7"></i></div></div></div>
<div class="sample"><span class="incidencias-skeleton incidencias-skeleton--main" data-kind="silhouette" data-height="105"></span></div>
<div class="sample"><div class="facturas-detail-skeleton" data-kind="skeleton"></div></div>
<div class="sample"><span class="animate-spin" data-kind="spinner"></span></div>
<div class="sample"><svg class="correo-spin" data-kind="spinner" width="18" height="18" data-height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg></div>
<div class="sample"><span class="public-support-submit-spinner" data-kind="spinner" data-height-mobile="58" data-height="66"></span></div>
<div class="sample incidencias-modal-video-loader"><span data-kind="spinner" data-height="16"></span><strong>Preparando vídeo</strong></div>
<div class="sample"><button class="auth-submit" aria-busy="true" data-pseudo="after" data-kind="spinner" data-height="15">Acceder</button></div>
<div class="toast loading"><span class="toast-icon" data-pseudo="before" data-kind="spinner"></span></div>
</body></html>`;

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return response.end(fixture);
    }
    const path = resolve(ROOT, `.${pathname}`);
    if ((!path.startsWith(`${ROOT}src${sep}css${sep}`) && !path.startsWith(`${ROOT}src${sep}features${sep}`)) || !path.endsWith(".css")) {
      response.writeHead(404); return response.end();
    }
    response.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
    response.end(await readFile(path));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const failures = [];
  page.on("response", (response) => { if (response.url().endsWith(".css") && !response.ok()) failures.push(response.url()); });
  await page.goto(origin, { waitUntil: "networkidle" });
  assert.deepEqual(failures, [], "Every source stylesheet must load");
  let scenarios = 0;
  const themePaint = new Map();
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["dark", "light"]) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; document.body.dataset.theme = value; }, theme);
      for (const reducedMotion of ["no-preference", "reduce"]) {
        await page.emulateMedia({ colorScheme: theme, reducedMotion, forcedColors: "none" });
        const samples = await page.locator("[data-kind]").evaluateAll((nodes) => nodes.map((node) => {
          const style = getComputedStyle(node, node.dataset.pseudo ? `::${node.dataset.pseudo}` : null);
          return {
            name: node.getAttribute("class"), kind: node.dataset.kind,
            height: Number(innerWidth <= 560 && node.dataset.heightMobile ? node.dataset.heightMobile : node.dataset.height) || null,
            actualHeight: parseFloat(style.blockSize), animation: style.animationName, duration: style.animationDuration,
            paint: style.backgroundImage, opacity: style.opacity,
            afterContent: getComputedStyle(node, "::after").content,
            afterAnimation: getComputedStyle(node, "::after").animationName,
          };
        }));
        for (const sample of samples) {
          const context = `${width}/${theme}/${reducedMotion}: ${sample.name}`;
          if (sample.height) assert.equal(sample.actualHeight, sample.height, `${context}: semantic geometry changed`);
          if (sample.kind === "silhouette") {
            assert.equal(sample.afterAnimation, reducedMotion === "reduce" ? "none" : "ui-skeleton-shimmer", context);
          } else {
            assert.equal(sample.animation, reducedMotion === "reduce" ? "none" : sample.kind === "spinner" ? "ui-loading-spin" : "ui-skeleton-shimmer", context);
          }
          if (sample.kind === "spinner" && reducedMotion === "no-preference") {
            assert.equal(sample.duration, "0.72s", `${context}: indicator timing escaped the shared authority`);
          }
          if (sample.kind === "skeleton") {
            assert.match(sample.paint, /^linear-gradient\(/, `${context}: missing canonical paint`);
            assert.equal(sample.opacity, "1", `${context}: local opacity changed canonical paint`);
            assert.ok(["none", "normal"].includes(sample.afterContent), `${context}: second pseudo shimmer remains`);
          }
        }
        const paints = samples.filter((sample) => sample.kind === "skeleton").map((sample) => sample.paint);
        assert.equal(new Set(paints).size, 1, `${width}/${theme}: every skeleton must share one paint`);
        themePaint.set(theme, paints[0]);
        scenarios++;
      }
    }
  }
  assert.notEqual(themePaint.get("dark"), themePaint.get("light"), "Both themes must resolve their own global tokens");
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  // The reset retains a 1ms transition under reduced motion. Let the new
  // system color paint once before inspecting the resulting visible state.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const highContrast = await page.locator('[data-kind="skeleton"]').evaluateAll((nodes) => nodes.map((node) => ({ name: node.className, paint: getComputedStyle(node).backgroundImage, color: getComputedStyle(node).backgroundColor })));
  assert.deepEqual(highContrast.filter((sample) => sample.paint !== "none" || ["transparent", "rgba(0, 0, 0, 0)"].includes(sample.color)), [], "High contrast placeholders must remain solid and visible");
  console.log(`UI loading browser OK · ${scenarios} viewport/theme/motion combinations · ${skeletons.length + spinners.length + 15} primitives · single paint/motion · forced colors`);
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
