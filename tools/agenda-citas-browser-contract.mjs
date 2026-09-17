import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

/*
  AGENDA · CITAS · RECORRIDO REAL EN NAVEGADOR

  Monta la vista Agenda REAL (controlador, plantillas, sistema modal, hojas
  de estilo y cascada de producción) y aísla ÚNICAMENTE la frontera HTTP:
  las peticiones a la API se responden localmente con datos sintéticos. No
  se envía ningún correo ni se toca ningún dato de cliente.

  Recorrido: seleccionar un día → «+» → «Crear cita» → elegir usuario, hora
  y lugar → guardar una vez → la cita aparece → recargar y sigue ahí.
*/

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));

const CSS = [
  "src/css/tokens/variables.css",
  "src/css/tokens/light.css",
  "src/css/core/guardrails.css",
  "src/css/components/ui.css",
  "src/css/components/status-system.css",
  "src/css/components/detail-modal.css",
  "src/css/compositions/private-create-modal.css",
  "src/css/views/agenda/index.css",
];

const API_ORIGIN = "https://api.onionsupport.com";

/* Fecha del recorrido: siempre futura, para que el aviso de pasado no
   interfiera con el camino normal. */
const TODAY = new Date();
const ANCHOR_DATE = new Date(Date.UTC(TODAY.getFullYear(), TODAY.getMonth() + 1, 17));
const ANCHOR = ANCHOR_DATE.toISOString().slice(0, 10);
const ANCHOR_YEAR = ANCHOR_DATE.getUTCFullYear();
const ANCHOR_MONTH = ANCHOR_DATE.getUTCMonth();

function gridRange(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, month, 1 - mondayOffset));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 41));
  return { desde: start.toISOString().slice(0, 10), hasta: end.toISOString().slice(0, 10) };
}

const USERS = [
  { userId: "usr-ana", id: "usr-ana", name: "Ana Pérez", email: "ana@example.test", phone: "600111222" },
  { userId: "usr-bea", id: "usr-bea", name: "Bea López", email: "bea@example.test", phone: "600333444" },
];

/* ---------------------------------------------------------
   Servidor local de los módulos reales
--------------------------------------------------------- */

const PAGE = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${CSS.map((href) => `<link rel="stylesheet" href="/${href}">`).join("")}
<style>html,body{margin:0;block-size:100%}#view{block-size:100vh}</style>
</head><body>
<div id="view" class="panel-content" data-view="agenda"></div>
<script type="module">
  import { AgendaView } from "/src/views/agenda/index.js";
  window.__mount = (context) => {
    window.__controller = AgendaView(document.getElementById("view"), context || {});
    return Boolean(window.__controller);
  };
  window.__unmount = () => { window.__controller?.destroy?.(); window.__controller = null; return true; };
  window.__ready = true;
</script>
</body></html>`;

const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;

  if (path === "/" || path === "/agenda") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(PAGE);
    return;
  }

  try {
    const type = path.endsWith(".css") ? "text/css" : "text/javascript";
    response.writeHead(200, { "Content-Type": `${type}; charset=utf-8` })
      .end(await readFile(resolve(ROOT, `.${path}`), "utf8"));
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;

/* ---------------------------------------------------------
   Doble de la API
--------------------------------------------------------- */

function createApi({ admin = true, citas = [] } = {}) {
  const state = {
    citas: [...citas],
    calls: { list: 0, create: 0, detail: 0, patch: 0, cancel: 0, users: 0 },
    createdPayloads: [],
    idempotencyKeys: [],
    ifMatch: [],
    seq: 0,
  };

  function project(cita) {
    const base = {
      id: cita.id,
      fechaLocal: cita.fechaLocal,
      horaLocal: cita.horaLocal,
      zona: "Europe/Madrid",
      inicioUtc: `${cita.fechaLocal}T08:00:00.000Z`,
      asunto: "Cita de soporte",
      lugar: cita.lugar,
      nota: cita.nota || "",
      estado: cita.estado,
      canceladaEn: cita.canceladaEn || "",
      version: cita.version,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    if (!admin) return base;
    return {
      ...base,
      userId: cita.userId,
      destinatarioNombre: cita.destinatarioNombre,
      organizadorNombre: "Admin Onion",
      etag: `"etag-${cita.version}-${cita.id}"`,
      cancelacion: cita.estado === "cancelada" ? { at: cita.canceladaEn, porNombre: "Admin Onion", motivo: cita.motivo || null } : null,
      notificacion: {
        tipo: cita.notifKind || "creada",
        estado: cita.notifState || "pendiente",
        etiqueta: cita.notifState === "aceptada" ? "Aceptada por el proveedor de correo" : "Pendiente de envío",
        intentos: 1,
        versionComunicada: cita.version,
        motivo: "",
      },
    };
  }

  async function handle(route) {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (url.pathname === "/api/users") {
      state.calls.users += 1;
      const q = (url.searchParams.get("q") || "").toLowerCase();
      return json({
        ok: true,
        usuarios: USERS.filter((user) =>
          user.name.toLowerCase().includes(q) || user.email.includes(q) || user.userId.includes(q)
        ),
      });
    }

    if (url.pathname === "/api/citas" && method === "GET") {
      state.calls.list += 1;
      const desde = url.searchParams.get("desde") || "";
      const hasta = url.searchParams.get("hasta") || "";
      return json({
        ok: true,
        citas: state.citas
          .filter((cita) => cita.fechaLocal >= desde && cita.fechaLocal <= hasta)
          .sort((a, b) => (a.fechaLocal + a.horaLocal + a.id).localeCompare(b.fechaLocal + b.horaLocal + b.id))
          .map(project),
        rango: { desde, hasta, dias: 42 },
        zona: "Europe/Madrid",
        truncado: false,
        limite: 300,
        puedeCrear: admin,
      });
    }

    if (url.pathname === "/api/citas" && method === "POST") {
      state.calls.create += 1;
      const payload = JSON.parse(request.postData() || "{}");
      const key = request.headers()["idempotency-key"] || "";
      state.createdPayloads.push(payload);
      state.idempotencyKeys.push(key);

      /* Idempotencia real: la misma clave devuelve la misma cita. */
      const existing = state.citas.find((cita) => cita.idempotencyKey === key && key);
      if (existing) return json({ ok: true, cita: project(existing), repetida: true });

      state.seq += 1;
      const cita = {
        id: `CITA-${payload.fechaLocal.replace(/-/g, "")}-${String(state.seq).padStart(4, "0")}`,
        userId: payload.userId,
        destinatarioNombre: USERS.find((user) => user.userId === payload.userId)?.name || "",
        fechaLocal: payload.fechaLocal,
        horaLocal: payload.horaLocal,
        lugar: payload.lugar,
        nota: payload.nota || "",
        estado: "programada",
        version: 1,
        idempotencyKey: key,
      };
      state.citas.push(cita);
      return json({ ok: true, cita: project(cita), repetida: false }, 201);
    }

    const detailMatch = url.pathname.match(/^\/api\/citas\/([^/]+)$/u);
    if (detailMatch && method === "GET") {
      state.calls.detail += 1;
      const cita = state.citas.find((item) => item.id === decodeURIComponent(detailMatch[1]));
      if (!cita) return json({ ok: false, code: "CITA_NO_ENCONTRADA", message: "No se ha encontrado la cita." }, 404);
      return json({ ok: true, cita: project(cita) });
    }

    if (detailMatch && method === "PATCH") {
      state.calls.patch += 1;
      state.ifMatch.push(request.headers()["if-match"] || "");
      const cita = state.citas.find((item) => item.id === decodeURIComponent(detailMatch[1]));
      if (!cita) return json({ ok: false, code: "CITA_NO_ENCONTRADA" }, 404);
      const payload = JSON.parse(request.postData() || "{}");
      Object.assign(cita, payload, { version: cita.version + 1, notifKind: "actualizada" });
      return json({ ok: true, cita: project(cita), cambios: Object.keys(payload) });
    }

    const cancelMatch = url.pathname.match(/^\/api\/citas\/([^/]+)\/cancelar$/u);
    if (cancelMatch && method === "POST") {
      state.calls.cancel += 1;
      state.ifMatch.push(request.headers()["if-match"] || "");
      const cita = state.citas.find((item) => item.id === decodeURIComponent(cancelMatch[1]));
      if (!cita) return json({ ok: false, code: "CITA_NO_ENCONTRADA" }, 404);
      const payload = JSON.parse(request.postData() || "{}");
      Object.assign(cita, {
        estado: "cancelada",
        canceladaEn: "2026-01-02T00:00:00.000Z",
        motivo: payload.motivo || null,
        version: cita.version + 1,
        notifKind: "cancelada",
      });
      return json({ ok: true, cita: project(cita) });
    }

    return json({ ok: false, code: "CITA_RUTA_NO_ENCONTRADA" }, 404);
  }

  return { state, handle };
}

async function openAgenda(browser, { admin = true, citas = [], width = 1280, query = "" } = {}) {
  const api = createApi({ admin, citas });
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.route(`${API_ORIGIN}/**`, api.handle);
  await page.goto(`${origin}/agenda${query}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__ready === true);
  await page.evaluate(() => window.__mount({ role: "admin" }));
  /* Con un enlace directo el detalle se abre encima del calendario; navegar
     de mes ahí no tiene sentido y además el diálogo lo tapa. */
  if (!query) await gotoAnchorMonth(page);
  return { page, api };
}

/*
  El calendario abre en el mes de hoy; el recorrido usa un mes futuro para que
  el aviso de fecha pasada no interfiera. Se navega con el control real de
  «mes siguiente», no manipulando el estado.
*/
async function gotoAnchorMonth(page) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const visible = await page.evaluate(() => window.__controller?.getSnapshot?.().visible || "");
    if (visible.slice(0, 7) === `${ANCHOR.slice(0, 7)}`) break;
    await page.locator('.agenda-toolbar [data-agenda-action="next-month"]').click();
    await page.waitForTimeout(60);
  }
  await page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"]`).waitFor({ state: "visible" });
}

/*
  El diálogo de detalle se hace visible con su estado de carga: la cabecera
  ya dice «Cita · Detalle de la cita» mientras el `GET /api/citas/:id` sigue
  en vuelo. Leer su texto en ese instante es leer el spinner, no la cita.
  La rejilla de lectura sólo existe cuando el servidor ha respondido, así
  que esperarla es esperar A LA CITA, no a un tiempo arbitrario.
*/
async function openedDetail(page) {
  const modal = page.locator("#agenda-detail-modal");
  await modal.waitFor({ state: "visible" });
  await page.locator("#agenda-detail-modal .agenda-detail-grid").waitFor({ state: "visible" });
  return modal;
}

/* ---------------------------------------------------------
   Recorrido
--------------------------------------------------------- */

let browser;
const results = [];

function ok(label) {
  results.push(label);
  console.log(`OK   ${label}`);
}

try {
  let executablePath;
  for (const candidate of [
    process.env.CHROME_BIN,
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/opt/pw-browsers/chromium/chrome-linux/chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean)) {
    try { await access(candidate); executablePath = candidate; break; } catch { /* siguiente */ }
  }
  assert.ok(executablePath, "hace falta un Chromium local (CHROME_BIN)");

  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  /* 1 · SELECCIONAR UN DÍA MUESTRA EL «+» EN SU ESQUINA */
  {
    const { page, api } = await openAgenda(browser);
    await page.waitForFunction(() => window.__controller?.getSnapshot?.().canCreate === true);

    const cell = page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"]`);
    await assert.doesNotReject(cell.waitFor({ state: "visible" }));

    const before = await cell.locator(".agenda-day-create").evaluate((node) => getComputedStyle(node).opacity);
    assert.equal(before, "0", "sin selección el «+» no se muestra");

    const numberBefore = await cell.locator(".agenda-day-number").boundingBox();

    await cell.locator(".agenda-day-surface").click();
    await page.waitForFunction(
      (key) => document.querySelector(`[data-agenda-cell="true"][data-agenda-date="${key}"]`)?.getAttribute("aria-selected") === "true",
      ANCHOR
    );

    const after = await cell.locator(".agenda-day-create").evaluate((node) => getComputedStyle(node).opacity);
    assert.equal(after, "1", "el «+» aparece por SELECCIÓN, no sólo por hover");

    const numberAfter = await cell.locator(".agenda-day-number").boundingBox();
    assert.deepEqual(
      { x: Math.round(numberBefore.x), y: Math.round(numberBefore.y) },
      { x: Math.round(numberAfter.x), y: Math.round(numberAfter.y) },
      "el «+» no desplaza el número del día"
    );

    const cellBox = await cell.boundingBox();
    const plusBox = await cell.locator(".agenda-day-create").boundingBox();
    assert.ok(plusBox.x + plusBox.width <= cellBox.x + cellBox.width + 1, "el «+» está dentro de la casilla");
    assert.ok(plusBox.x > cellBox.x + cellBox.width / 2, "en la mitad derecha");
    assert.ok(plusBox.y < cellBox.y + cellBox.height / 2, "en la mitad superior");

    const label = await cell.locator(".agenda-day-create-btn").getAttribute("aria-label");
    assert.match(label, /^Crear cita para el /u, "nombre accesible del «+»");
    assert.match(label, new RegExp(String(ANCHOR_DATE.getUTCDate()), "u"), "el nombre nombra el día");
    assert.equal(api.state.calls.list >= 1, true, "se consultó el intervalo visible");

    ok("1 · seleccionar un día muestra el «+» en su esquina superior derecha, sin mover el número");
    await page.close();
  }

  /* 2 · UN DÍA ADYACENTE DE OTRO MES LLEVA SU FECHA COMPLETA REAL */
  {
    const { page } = await openAgenda(browser);
    await page.waitForFunction(() => window.__controller?.getSnapshot?.().canCreate === true);

    /* Primera celda de la rejilla: puede pertenecer al mes anterior. */
    const outside = page.locator('.agenda-month-grid .agenda-day.is-outside').first();
    const outsideKey = await outside.getAttribute("data-agenda-date");
    assert.ok(/^\d{4}-\d{2}-\d{2}$/u.test(outsideKey), "la celda declara su fecha completa");

    await outside.locator(".agenda-day-create-btn").click({ force: true });
    await page.locator("#agenda-create-modal").waitFor({ state: "visible" });

    const subtitle = await page.locator("#agenda-create-subtitle").textContent();
    const hidden = await page.locator('#agenda-create-form input[name="fechaLocal"]').inputValue();

    assert.equal(hidden, outsideKey, "el formulario lleva la fecha real de la casilla, no el mes visible");
    const [, year] = subtitle.match(/de (\d{4})$/u) || [];
    assert.equal(year, outsideKey.slice(0, 4), "el año del texto coincide con la fecha real");
    assert.ok(subtitle.startsWith("Día seleccionado: "), "la cabecera destaca el día");

    ok("2 · un día adyacente de otro mes abre el alta con su fecha completa correcta");
    await page.close();
  }

  /* 3 · CREAR UNA CITA VÁLIDA: UNA SOLA PERSISTENCIA */
  {
    const { page, api } = await openAgenda(browser);
    await page.waitForFunction(() => window.__controller?.getSnapshot?.().canCreate === true);

    const cell = page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"]`);
    await cell.locator(".agenda-day-surface").click();
    await cell.locator(".agenda-day-create-btn").click();
    await page.locator("#agenda-create-modal").waitFor({ state: "visible" });

    /* El botón principal está deshabilitado mientras faltan datos. */
    assert.equal(await page.locator("#agenda-create-submit-btn").isDisabled(), true, "sin datos no se puede guardar");

    await page.locator('[data-create-user-search-input="true"]').fill("Ana");
    await page.locator('[data-create-action="create-user-select"]').first().waitFor({ state: "visible" });

    /* Un texto libre no vale como usuario: hace falta seleccionar. */
    assert.equal(await page.locator("#agenda-create-submit-btn").isDisabled(), true, "escribir no es seleccionar");

    await page.locator('[data-create-action="create-user-select"]').first().click();
    await page.locator('[data-create-selected-user="true"]').waitFor({ state: "visible" });

    await page.locator('[data-field="horaLocal"]').fill("10:00");
    await page.locator('[data-field="lugar"]').fill("Oficina de Sant Vicenç");
    await page.locator('[data-field="nota"]').fill("Trae el portátil");

    await page.waitForFunction(() => document.querySelector("#agenda-create-submit-btn")?.disabled === false);

    await page.locator("#agenda-create-submit-btn").click();
    await page.locator("#agenda-create-modal").waitFor({ state: "detached" });

    assert.equal(api.state.calls.create, 1, "una sola persistencia");
    assert.equal(api.state.citas.length, 1, "una sola cita");
    assert.equal(api.state.createdPayloads[0].userId, "usr-ana", "va el identificador, no el texto");
    assert.equal(api.state.createdPayloads[0].fechaLocal, ANCHOR);
    assert.equal(api.state.createdPayloads[0].horaLocal, "10:00");
    assert.ok(api.state.idempotencyKeys[0], "la creación lleva clave de idempotencia");

    const chip = cell.locator(".agenda-day-event").first();
    await chip.waitFor({ state: "visible" });
    assert.match(await chip.textContent(), /10:00/u, "la cita aparece en su casilla con su hora");
    assert.match(await chip.textContent(), /Ana/u, "y con el nombre del usuario");

    ok("3 · crear una cita válida: una sola persistencia y la cita aparece en el calendario");
    await page.close();
  }

  /* 4 · DOBLE ENVÍO: NI DOS CITAS NI DOS PETICIONES */
  {
    const { page, api } = await openAgenda(browser);
    await page.waitForFunction(() => window.__controller?.getSnapshot?.().canCreate === true);

    const cell = page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"]`);
    await cell.locator(".agenda-day-surface").click();
    await cell.locator(".agenda-day-create-btn").click();
    await page.locator("#agenda-create-modal").waitFor({ state: "visible" });

    await page.locator('[data-create-user-search-input="true"]').fill("Ana");
    await page.locator('[data-create-action="create-user-select"]').first().click();
    await page.locator('[data-field="horaLocal"]').fill("11:30");
    await page.locator('[data-field="lugar"]').fill("Atención telefónica");
    await page.waitForFunction(() => document.querySelector("#agenda-create-submit-btn")?.disabled === false);

    /* Dos clics inmediatos sobre el botón principal. */
    await page.evaluate(() => {
      const button = document.querySelector("#agenda-create-submit-btn");
      button.click();
      button.click();
    });

    await page.locator("#agenda-create-modal").waitFor({ state: "detached" });

    assert.equal(api.state.calls.create, 1, "el doble clic no duplica la petición");
    assert.equal(api.state.citas.length, 1, "ni la cita");

    ok("4 · doble clic sobre «Crear cita»: una sola petición y una sola cita");
    await page.close();
  }

  /* 5 · RECARGAR: LA CITA SIGUE AHÍ */
  {
    const seeded = [{
      id: "CITA-SEED-0001",
      userId: "usr-ana",
      destinatarioNombre: "Ana Pérez",
      fechaLocal: ANCHOR,
      horaLocal: "09:15",
      lugar: "Oficina de Sant Vicenç",
      nota: "Trae el portátil",
      estado: "programada",
      version: 1,
    }];

    const { page, api } = await openAgenda(browser, { citas: seeded });
    const cell = page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"]`);
    await cell.locator(".agenda-day-event").first().waitFor({ state: "visible" });
    assert.match(await cell.locator(".agenda-day-event").first().textContent(), /09:15/u);

    /* Recarga completa de la página: el estado vuelve de la base, no del
       navegador. */
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.__ready === true);
    await page.evaluate(() => window.__mount({ role: "admin" }));
    await gotoAnchorMonth(page);
    await cell.locator(".agenda-day-event").first().waitFor({ state: "visible" });

    assert.match(await cell.locator(".agenda-day-event").first().textContent(), /09:15/u, "sigue tras recargar");
    assert.ok(api.state.calls.list >= 2, "se volvió a consultar al servidor");

    const range = gridRange(ANCHOR_YEAR, ANCHOR_MONTH);
    assert.ok(range.desde <= ANCHOR && ANCHOR <= range.hasta, "el rango consultado cubre el día");

    ok("5 · tras recargar, la cita sigue visible en su día y a su hora");
    await page.close();
  }

  /* 6 · VARIAS CITAS: ORDEN, «+N MÁS» Y ACCESO AL CONJUNTO */
  {
    const many = ["16:00", "08:30", "12:45", "19:00"].map((horaLocal, index) => ({
      id: `CITA-MANY-${index}`,
      userId: "usr-ana",
      destinatarioNombre: "Ana Pérez",
      fechaLocal: ANCHOR,
      horaLocal,
      lugar: `Sitio ${index}`,
      nota: "",
      estado: "programada",
      version: 1,
    }));

    const { page } = await openAgenda(browser, { citas: many });
    const cell = page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"]`);
    await cell.locator(".agenda-day-event").first().waitFor({ state: "visible" });

    const times = await cell.locator(".agenda-day-event-time").allTextContents();
    assert.deepEqual(times, ["08:30", "12:45"], "orden estable por hora y tope por casilla");

    const more = cell.locator(".agenda-day-more");
    assert.equal(await more.count(), 1, "se ofrece acceso al resto");
    assert.equal(await more.textContent(), "+2 más");

    /* Sin desbordamiento horizontal en la rejilla. */
    const overflow = await page.evaluate(() => {
      const grid = document.querySelector(".agenda-month-grid");
      return grid.scrollWidth - grid.clientWidth;
    });
    assert.ok(overflow <= 1, "la rejilla no desborda horizontalmente");

    /* El «+» y el número siguen visibles con varias citas. La franja
       superior de la casilla, donde vive el número, queda siempre libre de
       citas: ahí se selecciona el día aunque esté lleno. */
    await cell.click({ position: { x: 8, y: 8 } });
    await page.waitForFunction(
      (key) => document.querySelector(`[data-agenda-cell="true"][data-agenda-date="${key}"]`)?.getAttribute("aria-selected") === "true",
      ANCHOR
    );
    assert.equal(await cell.locator(".agenda-day-number").isVisible(), true);
    assert.equal(await cell.locator(".agenda-day-create-btn").isVisible(), true);

    /* Y el conjunto completo se consulta desde el inspector del día. */
    await more.click();
    const listed = await page.locator(".agenda-inspector-item").count();
    assert.equal(listed, 4, "el inspector muestra todas las citas del día");

    const inspectorTimes = await page.locator(".agenda-inspector-item-time").allTextContents();
    assert.deepEqual(inspectorTimes, ["08:30", "12:45", "16:00", "19:00"], "orden estable también aquí");

    ok("6 · varias citas: orden estable, «+N más» y acceso al conjunto completo");
    await page.close();
  }

  /* 7 · EL USUARIO NO VE NI EL «+» NI LAS ACCIONES DE GESTIÓN */
  {
    const seeded = [{
      id: "CITA-USER-0001",
      userId: "usr-ana",
      destinatarioNombre: "Ana Pérez",
      fechaLocal: ANCHOR,
      horaLocal: "10:00",
      lugar: "Oficina de Sant Vicenç",
      nota: "Trae el portátil",
      estado: "programada",
      version: 1,
    }];

    const api = createApi({ admin: false, citas: seeded });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.route(`${API_ORIGIN}/**`, api.handle);
    await page.goto(`${origin}/agenda`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__ready === true);
    await page.evaluate(() => window.__mount({ role: "user" }));
    await gotoAnchorMonth(page);

    const cell = page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"]`);
    await cell.locator(".agenda-day-event").first().waitFor({ state: "visible" });

    assert.equal(await page.locator(".agenda-day-create-btn").count(), 0, "el usuario no ve «+» en ninguna casilla");

    await cell.locator(".agenda-day-event").first().click();
    const detailModal = await openedDetail(page);

    const detail = await detailModal.textContent();
    assert.match(detail, /Oficina de Sant Vicen/u, "ve dónde acudir");
    assert.match(detail, /10:00/u, "y a qué hora");
    assert.match(detail, /Europe\/Madrid/u, "con su zona");
    assert.match(detail, /Trae el port/u, "y la nota visible");

    assert.equal(await page.locator('[data-detail-action="detail-edit"]').count(), 0, "sin editar");
    assert.equal(await page.locator('[data-detail-action="detail-cancel-cita"]').count(), 0, "sin cancelar");
    assert.equal(detail.includes("Comunicación"), false, "sin estado de notificación");

    ok("7 · el destinatario ve su cita y no ve ninguna acción de gestión");
    await page.close();
  }

  /* 8 · EDITAR Y CANCELAR CON CONTROL DE VERSIÓN */
  {
    const seeded = [{
      id: "CITA-EDIT-0001",
      userId: "usr-ana",
      destinatarioNombre: "Ana Pérez",
      fechaLocal: ANCHOR,
      horaLocal: "10:00",
      lugar: "Oficina de Sant Vicenç",
      nota: "",
      estado: "programada",
      version: 1,
    }];

    const { page, api } = await openAgenda(browser, { citas: seeded });
    const cell = page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"]`);
    await cell.locator(".agenda-day-event").first().click();
    await openedDetail(page);

    await page.locator('[data-detail-action="detail-edit"]').click();
    await page.locator('[data-agenda-detail-form="true"]').waitFor({ state: "visible" });
    await page.locator('#agenda-detail-modal [data-field="horaLocal"]').fill("17:30");
    await page.locator('[data-detail-action="detail-save"]').click();

    await page.waitForFunction(() => !document.querySelector('[data-agenda-detail-form="true"]'));

    assert.equal(api.state.calls.patch, 1);
    assert.equal(api.state.ifMatch[0], '"etag-1-CITA-EDIT-0001"', "la edición envía If-Match con la versión leída");
    assert.equal(api.state.citas[0].horaLocal, "17:30");

    /* El calendario se actualiza sin recargar la SPA. */
    await page.waitForFunction(() =>
      document.querySelector(".agenda-day-event-time")?.textContent?.trim() === "17:30");

    await page.locator('[data-detail-action="detail-cancel-cita"]').click();
    await page.locator(".agenda-detail-confirm").waitFor({ state: "visible" });
    await page.locator('#agenda-detail-modal [data-field="motivo"]').fill("El cliente no puede");
    await page.locator('[data-detail-action="detail-cancel-confirm"]').click();

    await page.waitForFunction(() => document.querySelector(".agenda-day-event.is-cancelada"));

    assert.equal(api.state.calls.cancel, 1);
    assert.equal(api.state.ifMatch[1], '"etag-2-CITA-EDIT-0001"', "la cancelación usa la versión vigente");
    assert.equal(api.state.citas[0].estado, "cancelada", "el registro se conserva cancelado");
    assert.equal(api.state.citas[0].motivo, "El cliente no puede", "con su motivo");

    ok("8 · editar y cancelar: If-Match correcto, calendario actualizado y registro conservado");
    await page.close();
  }

  /* 9 · ENLACE AUTENTICADO A UNA CITA */
  {
    const seeded = [{
      id: "CITA-LINK-0001",
      userId: "usr-ana",
      destinatarioNombre: "Ana Pérez",
      fechaLocal: ANCHOR,
      horaLocal: "10:00",
      lugar: "Oficina de Sant Vicenç",
      nota: "",
      estado: "programada",
      version: 1,
    }];

    const { page, api } = await openAgenda(browser, { citas: seeded, query: "?citaId=CITA-LINK-0001" });
    assert.match(await (await openedDetail(page)).textContent(), /Oficina de Sant Vicen/u);
    assert.ok(api.state.calls.detail >= 1, "el detalle se pidió al servidor por su identificador");

    ok("9 · un enlace con ?citaId= abre esa cita en la ruta canónica");
    await page.close();
  }

  /* 10 · CONTINUIDAD SPA: MONTAR, DESMONTAR Y VOLVER */
  {
    const { page } = await openAgenda(browser);
    await page.waitForFunction(() => window.__controller?.getSnapshot?.().canCreate === true);

    const cell = page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"]`);
    await cell.locator(".agenda-day-surface").click();
    await cell.locator(".agenda-day-create-btn").click();
    await page.locator("#agenda-create-modal").waitFor({ state: "visible" });

    /* Cancelar sin datos cierra sin confirmación y sin crear nada. */
    await page.locator('[data-create-action="create-cancel"]').click();
    await page.locator("#agenda-create-modal").waitFor({ state: "detached" });

    const leftovers = await page.evaluate(() => ({
      hosts: document.querySelectorAll("#agenda-create-modal-root, #agenda-detail-modal-root").length,
      bodyClasses: [...document.body.classList].filter((name) => name.startsWith("agenda-")),
      overflow: document.body.style.overflow || "",
    }));
    assert.equal(leftovers.hosts, 0, "el portal se retira al cerrar");
    assert.deepEqual(leftovers.bodyClasses, [], "y sus clases de body");
    assert.equal(leftovers.overflow, "", "y el scroll se restaura");

    /* Desmontar la vista y volver: sin listeners duplicados ni hosts vivos. */
    await page.evaluate(() => window.__unmount());
    await page.evaluate(() => { document.getElementById("view").innerHTML = ""; });
    await page.evaluate(() => window.__mount({ role: "admin" }));
    await page.waitForFunction(() => window.__controller?.getSnapshot?.().canCreate === true);
    await gotoAnchorMonth(page);

    await cell.locator(".agenda-day-surface").click();
    await cell.locator(".agenda-day-create-btn").click();
    await page.locator("#agenda-create-modal").waitFor({ state: "visible" });

    const openDialogs = await page.locator('[data-modal-shell="ui-modal-shell.v1"]').count();
    assert.equal(openDialogs, 1, "un solo diálogo, sin duplicados por listeners repetidos");

    ok("10 · Agenda → crear → cancelar → salir → volver → crear: un solo diálogo y sin residuos");
    await page.close();
  }

  /* 11 · MÓVIL */
  {
    const { page } = await openAgenda(browser, { width: 390 });
    await page.waitForFunction(() => window.__controller?.getSnapshot?.().canCreate === true);

    const cell = page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"]`);
    await cell.locator(".agenda-day-surface").click({ force: true });
    await cell.locator(".agenda-day-create-btn").click({ force: true });
    await page.locator("#agenda-create-modal").waitFor({ state: "visible" });

    const panel = await page.locator('[data-agenda-create-modal-panel="true"]').boundingBox();
    assert.ok(panel.width <= 390, "el panel cabe en la pantalla");

    const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(bodyOverflow <= 1, "sin desbordamiento horizontal en móvil");

    /* El pie y su acción principal siguen accesibles. */
    assert.equal(await page.locator("#agenda-create-submit-btn").isVisible(), true);
    assert.equal(await page.locator('[data-create-action="create-cancel"]').isVisible(), true);

    ok("11 · móvil 390 px: panel a medida, sin desbordamiento y con el pie accesible");
    await page.close();
  }

  console.log(`\nAgenda citas browser contract: PASS · ${results.length} escenarios · build real, red aislada, ningún correo enviado`);
} catch (error) {
  console.error("AGENDA CITAS BROWSER CONTRACT FAILED");
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.close();
}
