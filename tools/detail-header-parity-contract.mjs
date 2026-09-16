import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

// MISMA RESPONSABILIDAD, MISMA VARIANTE.
//
// La cabecera de un detalle de entidad tiene un avatar, un bloque de identidad y un cierre.
// Incidencias y Facturas hacían lo mismo de dos maneras: Facturas con una variante propia
// (58/52/46/50 px, radio 14 px) e Incidencias con la compartida, que además NO daba tamaño al
// marco fuera de las media queries -- medido: 66x21 px en escritorio, sin recorte ni radio.
//
// Aquí se exige que la MISMA responsabilidad se resuelva con la MISMA variante: mismas
// dimensiones, mismo recorte, mismo fallback, mismo hueco reservado antes de cargar la imagen.
// No se exige que las dos cabeceras digan lo mismo: cada dominio conserva sus identificadores.
const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const CSS = [
  "src/css/tokens/variables.css", "src/css/tokens/light.css", "src/css/core/guardrails.css",
  "src/css/components/ui.css", "src/css/components/detail-modal.css",
  "src/css/views/incidencias/detail.css", "src/css/views/facturas/detail.css",
];

const { renderIncidenciasDetailModal } = await import("../src/views/incidencias/incidencias.template.modal.js");
const { renderFacturasDetailModal } = await import("../src/views/facturas/facturas.template.modal.js");

const LARGO = "Corporación Internacional de Servicios Técnicos Avanzados del Mediterráneo y Archipiélagos";
const FOTO_OK = "/@foto.png";
const FOTO_ROTA = "/@rota.png";

const incidencia = (o = {}) => ({
  id: "INC-2026-0001", ticketId: "INC-2026-0001", subject: "El equipo pierde la conexión cada mañana",
  status: "open", priority: "high", category: "technical", createdAt: "2026-09-08T09:00:00.000Z",
  fullName: "Alejandro Cliente Prueba", email: "cliente@example.test",
  comments: [], history: [], attachments: [], ...o,
});
const factura = (o = {}) => ({
  id: "F-1", facturaId: "F-1", numero: "2026000123", baseImponible: 40, iva: 8.4, total: 48.4,
  moneda: "EUR", estado: "emitida", estadoPago: "pendiente", pagado: 0, pendiente: 48.4,
  fechaEmision: "2026-09-08T09:00:00.000Z",
  cliente: { id: "c1", nombre: "Alejandro Cliente Prueba", email: "cliente@example.test" }, ...o,
});

const PAGES = {
  "inc-base": renderIncidenciasDetailModal({ open: true, detail: incidencia(), admin: true, role: "admin" }),
  "fac-base": renderFacturasDetailModal({ open: true, factura: factura(), detail: factura(), admin: true, role: "admin" }),
  "inc-foto": renderIncidenciasDetailModal({ open: true, detail: incidencia({ avatarUrl: FOTO_OK }), admin: true, role: "admin" }),
  "fac-foto": renderFacturasDetailModal({ open: true, factura: factura({ cliente: { id: "c1", nombre: "Alejandro Cliente Prueba", email: "cliente@example.test", avatarUrl: FOTO_OK } }), detail: factura({ cliente: { id: "c1", nombre: "Alejandro Cliente Prueba", email: "cliente@example.test", avatarUrl: FOTO_OK } }), admin: true, role: "admin" }),
  "inc-rota": renderIncidenciasDetailModal({ open: true, detail: incidencia({ avatarUrl: FOTO_ROTA }), admin: true, role: "admin" }),
  "inc-sin-nombre": renderIncidenciasDetailModal({ open: true, detail: incidencia({ fullName: "", email: "" }), admin: true, role: "admin" }),
  "fac-sin-nombre": renderFacturasDetailModal({ open: true, factura: factura({ cliente: {} }), detail: factura({ cliente: {} }), admin: true, role: "admin" }),
  "inc-largo": renderIncidenciasDetailModal({ open: true, detail: incidencia({ fullName: LARGO, subject: `${LARGO} ${LARGO}` }), admin: true, role: "admin" }),
  "fac-largo": renderFacturasDetailModal({ open: true, factura: factura({ cliente: { id: "c1", nombre: LARGO, razonSocial: LARGO, email: "cliente@example.test" } }), detail: factura({ cliente: { id: "c1", nombre: LARGO, razonSocial: LARGO, email: "cliente@example.test" } }), admin: true, role: "admin" }),
};

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  if (path === FOTO_OK) { response.writeHead(200, { "Content-Type": "image/png" }).end(PNG); return; }
  if (path === FOTO_ROTA) { response.writeHead(500).end(); return; }
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

const GEOMETRIA = () => {
  const panel = document.querySelector(".ui-detail-modal-panel");
  const header = panel?.querySelector(":scope > .ui-detail-modal-header");
  const avatar = header?.querySelector(".ui-detail-modal-avatar");
  const frame = header?.querySelector(".ui-detail-modal-avatar-frame");
  const fallback = header?.querySelector(".ui-detail-modal-avatar-fallback");
  const close = header?.querySelector(".ui-detail-modal-close-btn");
  const box = (n) => (n ? { w: Math.round(n.getBoundingClientRect().width), h: Math.round(n.getBoundingClientRect().height) } : null);
  const fs = frame && getComputedStyle(frame);
  const img = frame?.querySelector("img");
  return {
    avatar: box(avatar), marco: box(frame), fallback: box(fallback),
    radio: fs?.borderRadius, recorte: fs?.overflow,
    imgFit: img ? getComputedStyle(img).objectFit : null,
    inicialesVisibles: Boolean(fallback && fallback.textContent.trim().length),
    iniciales: fallback?.textContent.trim() ?? "",
    cierreVisible: Boolean(close && close.getBoundingClientRect().width > 0 && close.getBoundingClientRect().right <= innerWidth + 1),
    cierreArriba: close && header ? Math.round(close.getBoundingClientRect().top - header.getBoundingClientRect().top) : null,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    solape: (() => {
      const a = document.querySelector(".ui-detail-modal-avatar")?.getBoundingClientRect();
      const t = document.querySelector(".ui-detail-modal-title, .facturas-detail-title")?.getBoundingClientRect();
      return Boolean(a && t && a.right > t.left + 1 && a.bottom > t.top + 1 && a.top < t.bottom - 1);
    })(),
  };
};

let browser;
try {
  let executablePath;
  for (const candidate of [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/chromium", "/tmp/chromium"].filter(Boolean)) {
    try { await access(candidate); executablePath = candidate; break; } catch { /* siguiente */ }
  }
  assert.ok(executablePath, "CHROME_BIN must identify a local Chromium executable");
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

  // 1 · La misma variante y las mismas dimensiones en escritorio, ancho intermedio y móvil.
  for (const [width, label] of [[1280, "escritorio"], [900, "intermedio"], [390, "móvil"]]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const medido = {};
    for (const name of ["inc-base", "fac-base"]) {
      await page.goto(`${origin}/@${name}`, { waitUntil: "load" });
      medido[name] = await page.evaluate(GEOMETRIA);
      assert.ok(medido[name].avatar, `${label} · ${name}: la cabecera usa la variante compartida`);
      assert.equal(medido[name].cierreVisible, true, `${label} · ${name}: el cierre es visible y alcanzable`);
      assert.equal(medido[name].overflowX, false, `${label} · ${name}: sin desbordamiento horizontal`);
      assert.equal(medido[name].solape, false, `${label} · ${name}: el avatar no solapa el título`);
      assert.equal(medido[name].recorte, "hidden", `${label} · ${name}: el marco recorta la imagen`);
    }
    assert.deepEqual(medido["fac-base"].avatar, medido["inc-base"].avatar, `${label}: mismas dimensiones de avatar`);
    assert.deepEqual(medido["fac-base"].marco, medido["inc-base"].marco, `${label}: mismo marco`);
    assert.equal(medido["fac-base"].radio, medido["inc-base"].radio, `${label}: mismo recorte`);
    assert.equal(medido["fac-base"].avatar.w, medido["fac-base"].avatar.h, `${label}: el avatar es cuadrado`);
    console.log(`PASS 1 · ${label}: avatar ${medido["inc-base"].avatar.w}x${medido["inc-base"].avatar.h} r=${medido["inc-base"].radio} idéntico en los dos detalles`);
    await page.close();
  }

  // 2 · Estados de la fotografía: válida, ausente y fallida. El hueco no cambia nunca.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const estados = {};
    for (const name of ["inc-base", "inc-foto", "inc-rota", "fac-base", "fac-foto"]) {
      await page.goto(`${origin}/@${name}`, { waitUntil: "load" });
      await page.waitForTimeout(250);
      estados[name] = await page.evaluate(GEOMETRIA);
    }
    for (const name of ["inc-foto", "inc-rota"]) {
      assert.deepEqual(estados[name].marco, estados["inc-base"].marco, `2 · ${name}: el hueco reservado no depende de la imagen`);
    }
    assert.deepEqual(estados["fac-foto"].marco, estados["fac-base"].marco, "2 · fac-foto: el hueco reservado no depende de la imagen");
    assert.equal(estados["inc-foto"].imgFit, "cover", "2 · la imagen se cubre, no se deforma");
    assert.equal(estados["inc-rota"].inicialesVisibles, true, "2 · una foto que falla deja las iniciales debajo");
    console.log(`PASS 2 · foto válida, ausente y fallida: hueco ${estados["inc-base"].marco.w}x${estados["inc-base"].marco.h} en los tres casos`);
    await page.close();
  }

  // 3 · Identidad sin nombre utilizable: fallback neutral, nunca un hueco vacío.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    for (const name of ["inc-sin-nombre", "fac-sin-nombre"]) {
      await page.goto(`${origin}/@${name}`, { waitUntil: "load" });
      const m = await page.evaluate(GEOMETRIA);
      assert.ok(m.marco.w > 0, `3 · ${name}: el hueco se mantiene`);
      assert.equal(m.inicialesVisibles, true, `3 · ${name}: hay fallback neutral del sistema`);
    }
    console.log("PASS 3 · sin nombre utilizable: fallback del sistema en los dos dominios");
    await page.close();
  }

  // 4 · Nombres y subtítulos largos: ni desbordan ni empujan el cierre fuera.
  for (const [width, label] of [[1280, "escritorio"], [390, "móvil"]]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    for (const name of ["inc-largo", "fac-largo"]) {
      await page.goto(`${origin}/@${name}`, { waitUntil: "load" });
      const m = await page.evaluate(GEOMETRIA);
      assert.equal(m.overflowX, false, `4 · ${label} · ${name}: sin desbordamiento horizontal`);
      assert.equal(m.cierreVisible, true, `4 · ${label} · ${name}: el cierre sigue alcanzable`);
      assert.equal(m.solape, false, `4 · ${label} · ${name}: sin solape`);
    }
    await page.close();
  }
  console.log("PASS 4 · nombres largos en las dos anchuras: sin overflow, sin solape, cierre alcanzable");

  // 5 · Dos entidades distintas seguidas: la identidad no se hereda.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${origin}/@inc-foto`, { waitUntil: "load" });
    await page.waitForTimeout(200);
    const primera = await page.evaluate(() => ({
      identidad: document.querySelector(".ui-detail-modal-avatar-frame")?.getAttribute("data-avatar-identity"),
      foto: Boolean(document.querySelector(".ui-detail-modal-avatar-frame img")),
      iniciales: document.querySelector(".ui-detail-modal-avatar-fallback")?.textContent.trim(),
    }));
    await page.goto(`${origin}/@inc-sin-nombre`, { waitUntil: "load" });
    await page.waitForTimeout(200);
    const segunda = await page.evaluate(() => ({
      identidad: document.querySelector(".ui-detail-modal-avatar-frame")?.getAttribute("data-avatar-identity"),
      foto: Boolean(document.querySelector(".ui-detail-modal-avatar-frame img")),
      iniciales: document.querySelector(".ui-detail-modal-avatar-fallback")?.textContent.trim(),
    }));
    assert.notEqual(segunda.identidad, primera.identidad, "5 · la identidad declarada cambia con la entidad");
    assert.equal(segunda.foto, false, "5 · no queda la fotografía de la entidad anterior");
    assert.notEqual(segunda.iniciales, primera.iniciales, "5 · ni sus iniciales");
    console.log(`PASS 5 · dos entidades seguidas: ${primera.iniciales} -> ${segunda.iniciales}, sin herencia de fotografía`);
    await page.close();
  }

  // 6 · Ninguna hoja de dominio vuelve a declarar una variante propia de avatar de cabecera.
  {
    for (const sheet of ["src/css/views/facturas/detail.css", "src/css/views/incidencias/detail.css"]) {
      const css = await readFile(resolve(ROOT, sheet), "utf8");
      const bloques = css.match(/\.[a-z-]*detail-avatar[^{]*\{[^}]*\}/gu) ?? [];
      const dimensiona = bloques.filter((bloque) => /(?:inline-size|block-size|width|height)\s*:\s*\d+px/u.test(bloque));
      assert.deepEqual(dimensiona, [], `6 · ${sheet} no puede dimensionar su propio avatar de cabecera`);
    }
    const authority = await readFile(resolve(ROOT, "src/css/components/detail-modal.css"), "utf8");
    assert.match(authority, /--ui-detail-modal-avatar-size/u, "6 · el tamaño sale de un token de la autoridad");
    assert.match(authority, /--ui-detail-modal-avatar-radius/u, "6 · y el recorte también");
    console.log("PASS 6 · una sola autoridad declara tamaño y recorte; ninguna hoja de dominio los repite");
  }

  // 7 · El cuerpo de Facturas ocupa su pista hasta el tope de legibilidad, sin encogerse a
  //     contenido y sin desbordar. El tope se comprueba, no se elimina.
  {
    for (const [width, label, minimo] of [[1280, "escritorio", 1100], [900, "intermedio", 780], [390, "móvil", 330]]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`${origin}/@fac-base`, { waitUntil: "load" });
      const m = await page.evaluate(() => {
        const body = document.querySelector(".facturas-detail-body");
        const track = document.querySelector(".ui-detail-modal-body");
        const card = document.querySelector(".facturas-detail-section");
        const inner = track && (track.clientWidth - parseFloat(getComputedStyle(track).paddingInlineStart) - parseFloat(getComputedStyle(track).paddingInlineEnd));
        return {
          cuerpo: Math.round(body.getBoundingClientRect().width),
          pista: Math.round(inner),
          tarjeta: Math.round(card.getBoundingClientRect().width),
          tope: parseFloat(getComputedStyle(body).maxInlineSize),
          overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });
      assert.ok(m.cuerpo >= minimo, `7 · ${label}: el contenido aprovecha su pista (${m.cuerpo}px < ${minimo}px)`);
      assert.ok(m.cuerpo <= Math.min(m.pista, m.tope) + 1, `7 · ${label}: nunca supera su pista ni el tope de legibilidad`);
      assert.equal(m.tarjeta, m.cuerpo, `7 · ${label}: las tarjetas quedan alineadas al ancho útil`);
      assert.equal(m.overflowX, false, `7 · ${label}: sin desbordamiento horizontal`);
      console.log(`PASS 7 · ${label}: cuerpo ${m.cuerpo}px sobre pista ${m.pista}px, tope ${m.tope}px`);
      await page.close();
    }
  }

  console.log("Detail header parity contract: PASS · Incidencias y Facturas, 3 anchuras, 5 estados de identidad, ancho útil");
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
