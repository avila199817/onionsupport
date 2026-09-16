import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

// LA ACCIÓN PRINCIPAL DE UN MODAL VIVE EN EL PIE DEL SHELL, NO DENTRO DEL CUERPO.
//
// Las cuatro altas dejaban su fila de acciones dentro del `<form>`, o sea dentro del cuerpo
// desplazable: sin borde que la separe, sin aire propio y desplazándose con el contenido.
// El detalle ya usa el pie estructural del shell. Aquí se comprueba que los cinco comparten
// EXACTAMENTE la misma geometría, que sale de una sola hoja, sin margen de dominio ni
// `!important`.
const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const CSS = [
  "src/css/tokens/variables.css", "src/css/tokens/light.css", "src/css/core/guardrails.css",
  "src/css/components/ui.css", "src/css/components/detail-modal.css",
  "src/css/compositions/private-create-modal.css",
  "src/css/views/incidencias/create.css", "src/css/views/incidencias/detail.css",
  "src/css/views/clientes/create.css", "src/css/views/usuarios/create.css",
  "src/css/views/facturas/create.css", "src/css/views/facturas/detail.css",
];

const { renderIncidenciasCreateModal } = await import("../src/views/incidencias/incidencias.template.create.js");
const { renderIncidenciasDetailModal } = await import("../src/views/incidencias/incidencias.template.modal.js");
const { renderClientesCreateModal } = await import("../src/views/clientes/clientes.template.create.js");
const { renderFacturasCreateModal } = await import("../src/views/facturas/facturas.template.create.js");

const DETAIL = {
  id: "INC-1", ticketId: "INC-1", subject: "Equipo sin conexión", description: "Diagnóstico.",
  status: "open", priority: "high", category: "technical", createdAt: "2026-09-08T09:00:00.000Z",
  fullName: "Alejandro Cliente Prueba", email: "cliente@example.test",
  comments: [], history: [], attachments: [], canUpdate: true, canComment: true,
};
const PAGES = Object.freeze({
  "incidencias-create": renderIncidenciasCreateModal({ open: true, role: "admin", admin: true }),
  "clientes-create": renderClientesCreateModal({ open: true, role: "admin", admin: true }),
  "facturas-create": renderFacturasCreateModal({ open: true, role: "admin", admin: true }),
  "incidencias-detail": renderIncidenciasDetailModal({ open: true, detail: DETAIL, admin: true, role: "admin" }),
});

const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  const page = PAGES[path.replace(/^\/@/u, "")];
  if (page !== undefined) {
    const links = CSS.map((href) => `<link rel="stylesheet" href="/${href}">`).join("");
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      .end(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${links}<style>body{margin:0}</style></head><body>${page}</body></html>`);
    return;
  }
  try {
    response.writeHead(200, { "Content-Type": path.endsWith(".css") ? "text/css" : "text/javascript" })
      .end(await readFile(resolve(ROOT, `.${path}`), "utf8"));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;

let browser;
try {
  let executablePath;
  for (const candidate of [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/chromium", "/tmp/chromium"].filter(Boolean)) {
    try { await access(candidate); executablePath = candidate; break; } catch { /* next */ }
  }
  assert.ok(executablePath, "CHROME_BIN must identify a local Chromium executable");
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

  for (const [width, label] of [[1280, "desktop"], [390, "móvil"]]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const measured = {};
    for (const name of Object.keys(PAGES)) {
      await page.goto(`${origin}/@${name}`, { waitUntil: "load" });
      measured[name] = await page.evaluate(() => {
        const panel = document.querySelector(".ui-detail-modal-panel");
        const footer = panel?.querySelector(":scope > .ui-detail-modal-footer");
        if (!footer) return null;
        const style = getComputedStyle(footer);
        const body = panel.querySelector(":scope > .ui-detail-modal-body");
        const primary = footer.querySelector("button[type='submit'], button[data-detail-action], button");
        return {
          padding: `${style.paddingBlockStart}/${style.paddingInlineStart}/${style.paddingBlockEnd}/${style.paddingInlineEnd}`,
          border: `${style.borderBlockStartWidth} ${style.borderBlockStartStyle}`,
          background: style.backgroundColor,
          insideBody: Boolean(body && primary && body.contains(primary)),
          scrollsWithBody: Boolean(body && footer && body.contains(footer)),
          hasPrimary: Boolean(primary),
          // El botón puede vivir fuera de su formulario: lo declara por atributo.
          formAttribute: primary?.getAttribute("form") || "",
          important: [...document.styleSheets].some(() => false),
        };
      });
      assert.ok(measured[name], `${label} · ${name}: the modal must expose the shell footer slot`);
      assert.equal(measured[name].hasPrimary, true, `${label} · ${name}: the footer carries the primary action`);
      assert.equal(measured[name].insideBody, false, `${label} · ${name}: the primary action must not live inside the scrollable body`);
      assert.equal(measured[name].scrollsWithBody, false, `${label} · ${name}: the footer must not scroll with the body`);
    }

    const [reference, ...rest] = Object.entries(measured);
    for (const [name, value] of rest) {
      assert.equal(value.padding, reference[1].padding, `${label} · ${name} padding differs from ${reference[0]}`);
      assert.equal(value.border, reference[1].border, `${label} · ${name} border differs from ${reference[0]}`);
      assert.equal(value.background, reference[1].background, `${label} · ${name} background differs from ${reference[0]}`);
    }
    for (const name of ["incidencias-create", "clientes-create", "facturas-create"]) {
      assert.match(measured[name].formAttribute, /-create-form$/u, `${name}: a submit outside its form declares it with the form attribute`);
    }
    console.log(`PASS ${label} · ${Object.keys(measured).length} modals share one footer: ${reference[1].padding}, border ${reference[1].border}`);
    await page.close();
  }

  // Usuarios no expone su HTML: `renderCreateModal` monta y parchea, y su marcado sale de un
  // `renderModalHtml()` privado. No se reimplementa para poder medirlo: se comprueba en la
  // fuente que su shell declara el mismo slot y que su acción no vuelve al cuerpo, y su
  // comportamiento vivo lo cubre su propia batería. Limitación declarada, no disimulada.
  const usuarios = await readFile(resolve(ROOT, "src/views/usuarios/usuarios.template.create.js"), "utf8");
  assert.match(usuarios, /^\s*footer: `$/mu, "Usuarios Create declares the shared footer slot");
  assert.match(usuarios, /form="\$\{FORM_ID\}"/u, "its submit declares its form while living in the footer");
  const usuariosBody = usuarios.slice(usuarios.indexOf("<form"), usuarios.indexOf("</form>"));
  assert.equal(usuariosBody.includes("usr-create-actions"), false, "its action row no longer sits inside the scrollable form");
  console.log("PASS usuarios · same slot, asserted in source: its markup is not exported to be measured");

  // Ninguna hoja de dominio reestiliza el pie estructural ni lo fuerza con !important.
  for (const href of CSS.filter((path) => path.includes("/views/") || path.includes("/compositions/"))) {
    const sheet = await readFile(resolve(ROOT, href), "utf8");
    assert.equal(
      /\.ui-detail-modal-footer[^{]*\{/u.test(sheet),
      false,
      `${href} must not restyle the structural footer: that belongs to detail-modal.css`
    );
  }
  const composition = await readFile(resolve(ROOT, "src/css/compositions/private-create-modal.css"), "utf8");
  const actions = composition.slice(composition.indexOf(".inc-create-actions,"), composition.indexOf("create-actions-note"));
  assert.equal(/!important/u.test(actions), false, "the shared action row never wins with !important");
  console.log("PASS authority · no domain sheet restyles the structural footer and no !important in the shared action row");

  console.log("Modal footer parity contract: PASS · 3 measured create modals + Usuarios in source + 1 detail, desktop and mobile, one structural footer");
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
