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
  import { AppCore } from "/src/core/index.js";
  /* EL ROL SE ESTABLECE EN LA SESIÓN, NO EN EL MONTAJE.
     El Router monta las vistas con un contexto que no lleva rol; montar aquí
     con { role: "admin" } era inventar una entrada que la aplicación no
     produce, y por eso este recorrido daba verde mientras en producción el pie
     del detalle se componía vacío. Se hace lo que hace la aplicación: la
     sesión primero, y el montaje con el contexto VACÍO del Router. */
  window.__mount = (rol) => {
    AppCore.applySession({
      accessToken: "token-sintetico-de-agenda",
      user: {
        id: "usr-sesion", userId: "usr-sesion",
        name: "Sesión Sintética", fullName: "Sesión Sintética",
        email: "sesion@example.test",
        role: rol === "admin" ? "admin" : "user",
      },
    });
    window.__controller = AgendaView(document.getElementById("view"), {});
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

/* El `_etag` real de Cosmos rota cada vez que el outbox reescribe el documento
   --lease, estado del envío, resultado--, sin que la VERSIÓN de negocio cambie.
   El doble lo reproduce con un contador aparte, `etagSalt`, para poder provocar
   ese conflicto sin simular una edición ajena. */
function etagDe(cita) {
  return `"etag-${cita.version}.${cita.etagSalt || 0}-${cita.id}"`;
}

function createApi({ admin = true, citas = [], fallosDetalle = 0, pasado = false, sinCambios = false } = {}) {
  const state = {
    fallosDetallePendientes: fallosDetalle,
    sinCambios,
    citas: citas.map((cita) => ({ etagSalt: 0, ...cita })),
    calls: { list: 0, create: 0, detail: 0, patch: 0, cancel: 0, users: 0 },
    createdPayloads: [],
    idempotencyKeys: [],
    ifMatch: [],
    patchPayloads: [],
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
      etag: etagDe(cita),
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
      if (pasado && payload.confirmarPasado !== true) {
        return json({ ok: false, code: "CITA_EN_PASADO",
                      message: "La fecha y hora indicadas ya han pasado." }, 409);
      }
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
      if (state.fallosDetallePendientes > 0) {
        state.fallosDetallePendientes -= 1;
        return json({ ok: false, code: "CITAS_ALMACENAMIENTO_NO_DISPONIBLE",
                      message: "El almacenamiento de citas todavía no está disponible." }, 503);
      }
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
      state.patchPayloads.push(payload);
      /* Precondición real: un If-Match que no es el vigente no aplica nada. */
      if ((request.headers()["if-match"] || "") !== etagDe(cita)) {
        return json({ ok: false, code: "CITA_VERSION_CONFLICTO",
                      message: "La cita ha cambiado desde que la leíste." }, 409);
      }
      if (state.sinCambios) {
        return json({ ok: false, code: "CITA_SIN_CAMBIOS",
                      message: "No hay ningún cambio que guardar." }, 400);
      }
      if (pasado && payload.confirmarPasado !== true) {
        return json({ ok: false, code: "CITA_EN_PASADO",
                      message: "La fecha y hora indicadas ya han pasado." }, 409);
      }
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
      if (cita.estado === "cancelada") {
        return json({ ok: false, code: "CITA_YA_CANCELADA",
                      message: "Esta cita ya está cancelada." }, 409);
      }
      if ((request.headers()["if-match"] || "") !== etagDe(cita)) {
        return json({ ok: false, code: "CITA_VERSION_CONFLICTO",
                      message: "La cita ha cambiado desde que la leíste." }, 409);
      }
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

async function openAgenda(browser, { admin = true, citas = [], width = 1280, query = "", fallosDetalle = 0, pasado = false, sinCambios = false } = {}) {
  const api = createApi({ admin, citas, fallosDetalle, pasado, sinCambios });
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.route(`${API_ORIGIN}/**`, api.handle);
  await page.goto(`${origin}/agenda${query}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__ready === true);
  await page.evaluate(() => window.__mount("admin"));
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
    await page.evaluate(() => window.__mount("admin"));
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
    await page.evaluate(() => window.__mount("user"));
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
    assert.equal(await page.locator('[data-detail-action="detail-eliminar"]').count(), 0, "sin eliminar");
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
    assert.equal(api.state.ifMatch[0], '"etag-1.0-CITA-EDIT-0001"', "la edición envía If-Match con la versión leída");
    assert.equal(api.state.citas[0].horaLocal, "17:30");

    /* El calendario se actualiza sin recargar la SPA. */
    await page.waitForFunction(() =>
      document.querySelector(".agenda-day-event-time")?.textContent?.trim() === "17:30");

    /* «Eliminar cita» abre la confirmación COMPARTIDA, no una caja propia. */
    await page.locator('[data-detail-action="detail-eliminar"]').click();
    await page.locator('[data-agenda-delete-confirm-dialog="true"]').waitFor({ state: "visible" });
    await page.locator('[data-agenda-delete-confirm] [data-field="motivo"]').fill("El cliente no puede");
    await page.locator('[data-detail-action="detail-eliminar-confirmar"]').click();

    await page.waitForFunction(() => document.querySelector(".agenda-day-event.is-cancelada"));

    assert.equal(api.state.calls.cancel, 1);
    assert.equal(api.state.ifMatch[1], '"etag-2.0-CITA-EDIT-0001"', "la cancelación usa la versión vigente");
    assert.equal(api.state.citas[0].estado, "cancelada", "el registro se conserva cancelado");
    assert.equal(api.state.citas[0].motivo, "El cliente no puede", "con su motivo");

    ok("8 · editar y eliminar: If-Match correcto, calendario actualizado y registro conservado");
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
    await page.evaluate(() => window.__mount("admin"));
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

  const SEMILLA = (id) => ({
    id, userId: "usr-ana", destinatarioNombre: "Ana Pérez",
    fechaLocal: ANCHOR, horaLocal: "10:00", lugar: "Oficina de Sant Vicenç",
    nota: "", estado: "programada", version: 1,
  });

  /* 12 · H1 · EL REINTENTO DEL DETALLE EXISTE Y RECARGA DE VERDAD */
  {
    const { page, api } = await openAgenda(browser, { citas: [SEMILLA("CITA-RETRY-0001")], fallosDetalle: 1 });
    const cell = page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"]`);
    await cell.locator(".agenda-day-event").first().click();
    await page.locator("#agenda-detail-modal").waitFor({ state: "visible" });

    /* 1 · el estado de error aparece */
    await page.locator("#agenda-detail-modal .modal-state, #agenda-detail-modal [data-detail-action='detail-retry']")
      .first().waitFor({ state: "visible" });
    assert.equal(api.state.calls.detail, 1, "el primer intento falló y se pidió una sola vez");

    /* 2 · el botón EXISTE en el DOM (antes se descartaba en silencio) */
    const retry = page.locator('#agenda-detail-modal [data-detail-action="detail-retry"]');
    assert.equal(await retry.count(), 1, "el botón Reintentar existe");
    assert.equal(await retry.isVisible(), true, "y es visible");

    /* 3 y 4 · se activa y provoca una nueva petición */
    await retry.click();
    await page.waitForFunction(() => true);
    await page.locator("#agenda-detail-modal .agenda-detail-grid").waitFor({ state: "visible" });
    assert.equal(api.state.calls.detail, 2, "el reintento produce exactamente una petición más");

    /* 5 · la respuesta correcta sustituye el error por el detalle */
    assert.equal(await retry.count(), 0, "el estado de error ha desaparecido");
    const texto = await page.locator("#agenda-detail-modal").textContent();
    assert.match(texto, /Oficina de Sant Vicen/u, "y se ve el detalle cargado");

    ok("12 · H1 · el reintento del detalle existe, se activa y recarga");
    await page.close();
  }

  /* 13 · H2 · EL FOCO VUELVE A UN OBJETIVO VIVO, NO AL BODY */
  {
    const { page } = await openAgenda(browser, { citas: [SEMILLA("CITA-FOCO-0001")] });
    const cell = page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"]`);

    /* 1 y 2 · seleccionar el día repinta la rejilla */
    await cell.click({ position: { x: 8, y: 8 } });
    await page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"] .agenda-day-create-btn`)
      .waitFor({ state: "visible" });

    /* 3 · el nodo original del «+» queda reemplazado por el repintado */
    const original = await page.evaluateHandle((key) =>
      document.querySelector(`[data-agenda-date="${key}"] .agenda-day-create-btn`), ANCHOR);
    await cell.click({ position: { x: 8, y: 8 } });
    await page.waitForTimeout(50);
    const seguiaConectado = await page.evaluate((el) => el.isConnected, original);

    /* 4 y 5 · abrir y cerrar el alta */
    await page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"] .agenda-day-create-btn`).click();
    await page.locator("#agenda-create-modal").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await page.locator("#agenda-create-modal").waitFor({ state: "detached" });

    const foco = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { tag: el.tagName.toLowerCase(), conectado: el.isConnected,
               visible: r.width > 0 && r.height > 0,
               esCrear: el.classList.contains("agenda-day-create-btn") };
    });
    assert.ok(foco, "hay un elemento con el foco");
    assert.notEqual(foco.tag, "body", "el foco NO cae al body");
    assert.equal(foco.conectado, true, "el objetivo del foco está conectado");
    assert.equal(foco.visible, true, "y es visible");
    assert.equal(foco.esCrear, true, "y es el «+» del día, un destino razonable");

    /* El mismo criterio para el detalle, tras refrescarse el rango. */
    await page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"] .agenda-day-event`).first().click();
    await page.locator("#agenda-detail-modal .agenda-detail-grid").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await page.locator("#agenda-detail-modal").waitFor({ state: "detached" });
    const focoDetalle = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? { tag: el.tagName.toLowerCase(), conectado: el.isConnected } : null;
    });
    assert.ok(focoDetalle, "el detalle también devuelve el foco");
    assert.notEqual(focoDetalle.tag, "body", "tampoco cae al body al cerrar el detalle");
    assert.equal(focoDetalle.conectado, true, "y su objetivo está conectado");

    ok(`13 · H2 · el foco vuelve a un objetivo vivo (el nodo original ${seguiaConectado ? "seguía" : "ya no estaba"} conectado)`);
    await page.close();
  }

  /* 14 · H9 · REPROGRAMAR AL PASADO: AVISO, RECHAZO SIN PETICIÓN, ACEPTACIÓN CON confirmarPasado */
  {
    const { page, api } = await openAgenda(browser, { citas: [SEMILLA("CITA-PASADO-0001")], pasado: true });
    const cell = page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"]`);
    const abrirEdicion = async () => {
      await cell.locator(".agenda-day-event").first().click();
      await page.locator("#agenda-detail-modal .agenda-detail-grid").waitFor({ state: "visible" });
      await page.locator('[data-detail-action="detail-edit"]').click();
      await page.locator('[data-agenda-detail-form="true"]').waitFor({ state: "visible" });
    };

    /* 1‑3 · editar hacia el pasado y guardar: una petición SIN confirmarPasado, 409 */
    await abrirEdicion();
    await page.locator('#agenda-detail-modal [data-field="horaLocal"]').fill("09:00");
    await page.locator('[data-detail-action="detail-save"]').click();
    await page.waitForFunction(() => Boolean(document.querySelector(".inc-create-alert.is-warning")));
    assert.equal(api.state.calls.patch, 1, "una sola petición");
    assert.equal(api.state.patchPayloads[0].confirmarPasado, undefined, "la primera no confirma el pasado");

    /* 4 · el aviso aparece */
    assert.equal(await page.locator(".inc-create-alert.is-warning").isVisible(), true, "aparece el aviso de fecha pasada");

    /* 5 · rechazar NO produce una segunda petición */
    await page.locator('[data-detail-action="detail-edit-cancel"]').click();
    await page.waitForTimeout(120);
    assert.equal(api.state.calls.patch, 1, "descartar no envía nada");

    /* 6‑8 · repetir y aceptar: exactamente una petición más, con confirmarPasado */
    await page.locator('[data-detail-action="detail-edit"]').click();
    await page.locator('[data-agenda-detail-form="true"]').waitFor({ state: "visible" });
    await page.locator('#agenda-detail-modal [data-field="horaLocal"]').fill("09:15");
    await page.locator('[data-detail-action="detail-save"]').click();
    await page.waitForFunction(() => Boolean(document.querySelector(".inc-create-alert.is-warning")));
    assert.equal(api.state.calls.patch, 2, "el reintento manda una segunda petición");
    await page.locator('[data-detail-action="detail-save"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-agenda-detail-form="true"]'));
    assert.equal(api.state.calls.patch, 3, "aceptar produce UNA petición más");
    assert.equal(api.state.patchPayloads[2].confirmarPasado, true, "y esa petición confirma el pasado");

    /* 9 y 10 · respuesta satisfactoria y la interfaz refleja el cambio */
    assert.equal(api.state.citas[0].horaLocal, "09:15", "el cambio se ha aplicado");
    await page.waitForFunction(() =>
      document.querySelector(".agenda-day-event-time")?.textContent?.trim() === "09:15");

    ok("14 · H9 · aviso, rechazo sin petición y aceptación con confirmarPasado");
    await page.close();
  }

  /* 15 · PRESENTACIÓN CON ESTILOS COMPUTADOS, SIN PASAR POR INCIDENCIAS */
  {
    const { page } = await openAgenda(browser, { citas: [] });
    const cell = page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"]`);
    await cell.click({ position: { x: 8, y: 8 } });
    await page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"] .agenda-day-create-btn`).click();
    await page.locator("#agenda-create-modal").waitFor({ state: "visible" });

    /* Buscador y resultados */
    const input = page.locator('#agenda-create-modal [data-create-field="userQuery"], #agenda-create-modal input[type="search"], #agenda-create-modal [data-field="userQuery"]').first();
    await input.fill("ana");
    await page.locator(".agenda-create-user-result").first().waitFor({ state: "visible" });

    const estiloResultado = await page.locator(".agenda-create-user-result").first().evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { alto: r.height, display: cs.display, cursor: cs.cursor };
    });
    assert.ok(estiloResultado.alto > 20, "el resultado tiene altura real, no está sin estilo");

    /* Avatar: contrato compartido y caja real */
    const avatar = await page.locator(".agenda-create-user-avatar").first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { ancho: r.width, alto: r.height,
               iniciales: el.getAttribute("data-avatar-initials") || "",
               tono: el.getAttribute("data-avatar-tone") || "",
               sistema: el.getAttribute("data-avatar-system") || "",
               fallback: Boolean(el.querySelector("[data-avatar-fallback]")),
               textoFallback: (el.querySelector("[data-avatar-fallback]")?.textContent || "").trim() };
    });
    assert.ok(avatar.ancho > 10 && avatar.alto > 10, "el avatar tiene caja, no está sin estilo");
    assert.equal(avatar.sistema, "true", "emite el contrato del sistema de avatar");
    assert.ok(avatar.iniciales.length > 0, "la autoridad compartida da iniciales");
    assert.ok(avatar.tono.length > 0, "y un tono");
    assert.equal(avatar.fallback, true, "con su hueco de reserva");
    assert.equal(avatar.textoFallback, avatar.iniciales, "que muestra esas mismas iniciales");

    /* Selección: el chip también está vestido */
    await page.locator(".agenda-create-user-result").first().click();
    await page.locator(".agenda-create-selected-user, [data-create-action='create-user-clear']").first().waitFor({ state: "visible" });

    /* Alertas: dos columnas reales y el copy fuera de la columna del icono */
    const alerta = await page.evaluate(() => {
      const host = document.querySelector("#agenda-create-modal .inc-create-body") || document.body;
      const div = document.createElement("div");
      div.className = "inc-create-alert is-warning";
      div.innerHTML = '<span class="agenda-alert-icon"></span><div class="agenda-alert-copy"><strong>T</strong><p>C</p></div>';
      host.appendChild(div);
      const base = document.createElement("div");
      base.className = "inc-create-alert";
      host.appendChild(base);
      const cs = getComputedStyle(div);
      const icono = div.querySelector(".agenda-alert-icon").getBoundingClientRect();
      const copy = div.querySelector(".agenda-alert-copy").getBoundingClientRect();
      const res = { columnas: cs.gridTemplateColumns, display: cs.display,
                    copyALaDerecha: copy.left > icono.right - 1,
                    fondoAviso: cs.backgroundColor,
                    fondoBase: getComputedStyle(base).backgroundColor };
      div.remove(); base.remove();
      return res;
    });
    assert.equal(alerta.display, "grid", "la alerta es la rejilla compartida");
    assert.equal(alerta.columnas.split(" ").length, 2, "con dos columnas: icono y texto");
    assert.equal(alerta.copyALaDerecha, true, "el texto ocupa la columna del texto, no la del icono");
    assert.notEqual(alerta.fondoAviso, alerta.fondoBase, "el aviso tiene su propio tono, no el informativo");

    ok("15 · presentación: buscador, avatar con su autoridad y alertas en dos columnas");
    await page.close();
  }


  /* =========================================================
     AGENDA V1.1 · ACCIONES DEL DETALLE
  ========================================================= */

  const sembrar = (extra = {}) => ([{
    id: "CITA-V11-0001",
    userId: "usr-ana",
    destinatarioNombre: "Ana Pérez",
    fechaLocal: ANCHOR,
    horaLocal: "10:00",
    lugar: "Oficina de Sant Vicenç",
    nota: "Traer el portátil",
    estado: "programada",
    version: 1,
    ...extra,
  }]);

  async function abrirDetalle(opciones = {}) {
    const abierto = await openAgenda(browser, { citas: sembrar(opciones.cita || {}), ...opciones });
    const cell = abierto.page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"]`);
    await cell.locator(".agenda-day-event").first().click();
    await openedDetail(abierto.page);
    return abierto;
  }

  /* 16 · QUIÉN VE LAS ACCIONES */
  {
    const { page } = await abrirDetalle();
    assert.equal(await page.locator('[data-detail-action="detail-edit"]').count(), 1,
      "el administrador ve Editar sobre una cita programada");
    const eliminar = page.locator('[data-detail-action="detail-eliminar"]');
    assert.equal(await eliminar.count(), 1, "y ve Eliminar cita");
    assert.equal((await eliminar.textContent()).trim(), "Eliminar cita",
      "la acción de producto se llama «Eliminar cita»");
    assert.ok(await eliminar.evaluate((node) => node.className.includes("danger")),
      "y tiene tratamiento destructivo");
    await page.close();

    /* Una cita cancelada es de sólo lectura, incluso para el administrador. */
    const cancelada = await abrirDetalle({ cita: { estado: "cancelada", canceladaEn: "2026-01-02T00:00:00.000Z" } });
    assert.equal(await cancelada.page.locator('[data-detail-action="detail-edit"]').count(), 0,
      "una cita cancelada no ofrece edición");
    assert.equal(await cancelada.page.locator('[data-detail-action="detail-eliminar"]').count(), 0,
      "ni eliminación");
    await cancelada.page.close();

    /* El rol usuario lo acredita el escenario 7, con su montaje real. */

    ok("16 · Editar y Eliminar cita: presentes para el administrador, ausentes sobre una cita cancelada");
  }

  /* 17 · EDITAR · PRECARGA, DESCARTE SIN PETICIÓN, CUERPO SIN userId, SIN DOBLE ENVÍO */
  {
    const { page, api } = await abrirDetalle();

    await page.locator('[data-detail-action="detail-edit"]').click();
    await page.locator('[data-agenda-detail-form="true"]').waitFor({ state: "visible" });

    const precargado = await page.evaluate(() => {
      const raiz = document.querySelector("#agenda-detail-modal");
      const leer = (campo) => raiz.querySelector(`[data-field="${campo}"]`)?.value ?? null;
      return { fechaLocal: leer("fechaLocal"), horaLocal: leer("horaLocal"),
               lugar: leer("lugar"), nota: leer("nota") };
    });
    assert.deepEqual(precargado, { fechaLocal: ANCHOR, horaLocal: "10:00",
      lugar: "Oficina de Sant Vicenç", nota: "Traer el portátil" },
      "la edición precarga exactamente los valores actuales");

    /* Descartar no hace ninguna petición. */
    await page.locator('[data-detail-action="detail-edit-cancel"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-agenda-detail-form="true"]'));
    assert.equal(api.state.calls.patch, 0, "descartar la edición no envía ningún PATCH");

    /* Guardar: doble clic, una sola petición. */
    await page.locator('[data-detail-action="detail-edit"]').click();
    await page.locator('[data-agenda-detail-form="true"]').waitFor({ state: "visible" });
    await page.locator('#agenda-detail-modal [data-field="lugar"]').fill("Sala 2");
    const guardar = page.locator('[data-detail-action="detail-save"]');
    await guardar.click();
    await guardar.click({ force: true }).catch(() => {});
    await page.waitForFunction(() => !document.querySelector('[data-agenda-detail-form="true"]'));

    assert.equal(api.state.calls.patch, 1, "el envío repetido no duplica el PATCH");
    const cuerpo = api.state.patchPayloads[0];
    assert.equal("userId" in cuerpo, false, "el cuerpo del PATCH no lleva el destinatario");
    assert.deepEqual(Object.keys(cuerpo).sort(), ["fechaLocal", "horaLocal", "lugar", "nota"],
      "sólo viajan los campos editables");
    assert.equal(api.state.citas[0].lugar, "Sala 2");

    ok("17 · editar: precarga exacta, descarte sin petición, cuerpo sin userId y sin doble envío");
    await page.close();
  }

  /* 18 · EL OUTBOX ROTA EL ETAG SIN TOCAR LA VERSIÓN: UNA RECONCILIACIÓN */
  {
    const { page, api } = await abrirDetalle();

    await page.locator('[data-detail-action="detail-edit"]').click();
    await page.locator('[data-agenda-detail-form="true"]').waitFor({ state: "visible" });
    await page.locator('#agenda-detail-modal [data-field="lugar"]').fill("Sala 3");

    /* Entre la lectura fresca y la escritura, el outbox reescribe el documento:
       el ETag cambia, la versión de negocio NO. Nadie ha editado nada. */
    let rotado = false;
    const original = api.handle;
    api.rotarUnaVez = true;
    await page.unroute(`${API_ORIGIN}/**`).catch(() => {});
    await page.route(`${API_ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (!rotado && route.request().method() === "PATCH" && url.pathname.includes("/api/citas/")) {
        rotado = true;
        api.state.citas[0].etagSalt = (api.state.citas[0].etagSalt || 0) + 1;
      }
      return original(route);
    });

    await page.locator('[data-detail-action="detail-save"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-agenda-detail-form="true"]'));

    assert.equal(api.state.calls.patch, 2, "el conflicto por rotación se reconcilia con UNA petición más");
    assert.equal(api.state.citas[0].lugar, "Sala 3", "y el cambio se aplica");
    assert.equal(api.state.citas[0].version, 2, "la versión de negocio avanza una sola vez");

    ok("18 · conflicto de ETag causado sólo por el outbox: una reconciliación y el cambio se guarda");
    await page.close();
  }

  /* 19 · LA VERSIÓN DE NEGOCIO CAMBIÓ: NO SE PISA, Y EL BORRADOR SOBREVIVE */
  {
    const { page, api } = await abrirDetalle();

    await page.locator('[data-detail-action="detail-edit"]').click();
    await page.locator('[data-agenda-detail-form="true"]').waitFor({ state: "visible" });
    await page.locator('#agenda-detail-modal [data-field="lugar"]').fill("Mi borrador");

    /* Otra persona guarda mientras tanto: la versión de negocio avanza. */
    api.state.citas[0].version = 5;
    api.state.citas[0].lugar = "Lo que puso el otro";

    await page.locator('[data-detail-action="detail-save"]').click();
    await page.locator('[data-detail-conflict="true"]').waitFor({ state: "visible" });

    assert.equal(api.state.calls.patch, 0, "no se escribe nada: el conflicto se detecta antes de intentarlo");
    assert.equal(
      await page.locator('#agenda-detail-modal [data-field="lugar"]').inputValue(),
      "Mi borrador",
      "el borrador del usuario se conserva intacto");
    assert.equal(api.state.citas[0].lugar, "Lo que puso el otro", "y el servidor no se ha pisado");

    ok("19 · versión de negocio distinta: cero escrituras, aviso visible y borrador preservado");
    await page.close();
  }

  /* 20 · CITA_SIN_CAMBIOS NO DESTRUYE EL BORRADOR */
  {
    const { page, api } = await abrirDetalle({ sinCambios: true });

    await page.locator('[data-detail-action="detail-edit"]').click();
    await page.locator('[data-agenda-detail-form="true"]').waitFor({ state: "visible" });
    await page.locator('#agenda-detail-modal [data-field="lugar"]').fill("Sigue aquí");
    await page.locator('[data-detail-action="detail-save"]').click();

    /* El error se pinta EN LÍNEA, sin tragarse el formulario. */
    await page.locator('[data-detail-error="true"]').waitFor({ state: "visible" });
    assert.match(await page.locator('[data-detail-error="true"]').textContent(), /cambio/iu,
      "el mensaje sale de la autoridad de errores compartida");

    assert.equal(api.state.calls.patch, 1, "se intentó una vez y no se reintentó");
    assert.equal(await page.locator('[data-agenda-detail-form="true"]').count(), 1,
      "el formulario sigue en pie");
    assert.equal(
      await page.locator('#agenda-detail-modal [data-field="lugar"]').inputValue(),
      "Sigue aquí",
      "el borrador sobrevive al rechazo");

    ok("20 · CITA_SIN_CAMBIOS: un solo intento, mensaje comprensible y borrador intacto");
    await page.close();
  }

  /* 21 · ELIMINAR · CONFIRMACIÓN COMPARTIDA Y RECHAZO SIN ESCRITURA */
  {
    const { page, api } = await abrirDetalle();

    await page.locator('[data-detail-action="detail-eliminar"]').click();
    const dialogo = page.locator('[data-agenda-delete-confirm-dialog="true"]');
    await dialogo.waitFor({ state: "visible" });

    const copia = await page.locator("#agenda-delete-confirm-description").textContent();
    assert.match(copia, /cancelada/u, "el texto dice que se marcará como cancelada");
    assert.match(copia, /no se eliminará/iu, "y que no se elimina físicamente");

    await page.locator('[data-detail-action="detail-eliminar-volver"]').click();
    await dialogo.waitFor({ state: "detached" });
    assert.equal(api.state.calls.cancel, 0, "rechazar la confirmación no escribe nada");
    assert.equal(api.state.citas[0].estado, "programada");

    /* Y el detalle sigue ahí, utilizable. */
    assert.equal(await page.locator('[data-detail-action="detail-eliminar"]').count(), 1);

    ok("21 · Eliminar cita: confirmación compartida, texto honesto y rechazo sin escritura");
    await page.close();
  }

  /* 22 · ELIMINAR · CONFLICTO Y ESTADO FINAL */
  {
    /* a) conflicto por rotación del ETag: una reconciliación, una cancelación. */
    const conflicto = await abrirDetalle();
    let rotado = false;
    const originalConflicto = conflicto.api.handle;
    await conflicto.page.unroute(`${API_ORIGIN}/**`).catch(() => {});
    await conflicto.page.route(`${API_ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (!rotado && route.request().method() === "POST" && url.pathname.endsWith("/cancelar")) {
        rotado = true;
        conflicto.api.state.citas[0].etagSalt = (conflicto.api.state.citas[0].etagSalt || 0) + 1;
      }
      return originalConflicto(route);
    });

    await conflicto.page.locator('[data-detail-action="detail-eliminar"]').click();
    await conflicto.page.locator('[data-agenda-delete-confirm-dialog="true"]').waitFor({ state: "visible" });
    await conflicto.page.locator('[data-detail-action="detail-eliminar-confirmar"]').click();
    await conflicto.page.waitForFunction(() => document.querySelector(".agenda-day-event.is-cancelada"));

    assert.equal(conflicto.api.state.calls.cancel, 2, "un conflicto de versión permite UNA reconciliación");
    assert.equal(conflicto.api.state.citas[0].estado, "cancelada");
    await conflicto.page.close();

    /* b) ya estaba cancelada: estado final, sin ninguna segunda escritura. */
    const yaCancelada = await abrirDetalle();
    yaCancelada.api.state.citas[0].estado = "cancelada";
    yaCancelada.api.state.citas[0].canceladaEn = "2026-01-02T00:00:00.000Z";

    await yaCancelada.page.locator('[data-detail-action="detail-eliminar"]').click();
    await yaCancelada.page.locator('[data-agenda-delete-confirm-dialog="true"]').waitFor({ state: "visible" });
    await yaCancelada.page.locator('[data-detail-action="detail-eliminar-confirmar"]').click();
    await yaCancelada.page.waitForFunction(() =>
      !document.querySelector('[data-detail-action="detail-eliminar"]'));

    assert.equal(yaCancelada.api.state.calls.cancel, 0,
      "si ya está cancelada no se vuelve a escribir");
    assert.equal(yaCancelada.api.state.citas[0].version, 1, "y la versión no se toca");
    await yaCancelada.page.close();

    ok("22 · eliminar: una reconciliación por conflicto de versión; ya cancelada es estado final sin escritura");
  }

  /* 23 · FOCO Y LEYENDA RETIRADA */
  {
    const { page } = await abrirDetalle();

    /* Eliminar → rechazar → el foco vuelve a un objetivo vivo, no al body. */
    await page.locator('[data-detail-action="detail-eliminar"]').click();
    await page.locator('[data-agenda-delete-confirm-dialog="true"]').waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await page.locator('[data-agenda-delete-confirm-dialog="true"]').waitFor({ state: "detached" });

    const focoTrasRechazo = await page.evaluate(() => {
      const activo = document.activeElement;
      return { esBody: activo === document.body, conectado: Boolean(activo?.isConnected) };
    });
    assert.equal(focoTrasRechazo.esBody, false, "el foco no cae al body tras rechazar la eliminación");
    assert.equal(focoTrasRechazo.conectado, true, "y apunta a un nodo vivo");

    /* Editar → descartar → el foco sigue dentro del detalle. */
    await page.locator('[data-detail-action="detail-edit"]').click();
    await page.locator('[data-agenda-detail-form="true"]').waitFor({ state: "visible" });
    await page.locator('[data-detail-action="detail-edit-cancel"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-agenda-detail-form="true"]'));
    assert.equal(await page.evaluate(() => document.activeElement === document.body), false,
      "descartar la edición tampoco deja el foco en el body");

    /* La leyenda «Aquí ves tus citas» no existe: ni texto, ni punto, ni caja. */
    const leyenda = await page.evaluate(() => ({
      texto: document.body.textContent.toLowerCase().includes("ves tus citas"),
      variante: document.body.textContent.toLowerCase().includes("puedes crear citas"),
      caja: document.querySelectorAll(".agenda-side-note").length,
      punto: document.querySelectorAll(".agenda-side-note-dot").length,
    }));
    assert.deepEqual(leyenda, { texto: false, variante: false, caja: 0, punto: 0 },
      "la leyenda, su variante, su caja y su punto verde han desaparecido del DOM");

    ok("23 · foco vivo tras rechazar eliminación y tras descartar edición; la leyenda ya no existe");
    await page.close();
  }

  /* 24 · UN DÍA CON CITAS SE SELECCIONA DESDE LA REJILLA PRINCIPAL */
  {
    const seeded = ["09:15", "10:30", "12:00", "16:45"].map((horaLocal, index) => ({
      id: `CITA-SEL-000${index + 1}`,
      userId: "usr-ana",
      destinatarioNombre: "Ana Pérez",
      fechaLocal: ANCHOR,
      horaLocal,
      lugar: "Oficina de Sant Vicenç",
      nota: "",
      estado: "programada",
      version: 1,
    }));

    const { page, api } = await openAgenda(browser, { citas: seeded });
    const cell = page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"]`);
    await cell.locator(".agenda-day-event").first().waitFor({ state: "visible" });
    assert.equal(await cell.getAttribute("aria-selected"), "false", "el día con citas empieza sin seleccionar");

    /* Un clic real (ratón, sin forzar) en el hueco entre citas y borde inferior
       de la casilla: la lista de citas no se lo queda. */
    const box = await cell.boundingBox();
    const eventsBox = await cell.locator(".agenda-day-events").boundingBox();
    await page.mouse.click(eventsBox.x + eventsBox.width - 3, box.y + box.height - 3);
    await page.waitForFunction(
      (key) => document.querySelector(`[data-agenda-cell="true"][data-agenda-date="${key}"]`)?.getAttribute("aria-selected") === "true",
      ANCHOR
    );
    assert.equal(await page.locator("#agenda-detail-modal").count(), 0, "seleccionar el día no abre ninguna cita");
    assert.equal(api.state.calls.detail || 0, 0, "y no pide ningún detalle");

    /* La mini y la rejilla principal son UNA sola fecha seleccionada. */
    const miniSelected = await page.locator(`.agenda-mini-day[data-agenda-date="${ANCHOR}"]`).getAttribute("aria-selected");
    assert.equal(miniSelected, "true", "la mini refleja la selección hecha en la rejilla principal");
    const inspector = await page.locator("[data-agenda-inspector]").textContent();
    assert.match(inspector, /09:15/u, "el inspector del día muestra las citas del día seleccionado");

    /* La cita sigue abriéndose con su propio clic y no altera la selección. */
    await cell.locator(".agenda-day-event").first().click();
    await openedDetail(page);
    assert.equal(await cell.getAttribute("aria-selected"), "true");
    await page.keyboard.press("Escape");
    await page.locator("#agenda-detail-modal").waitFor({ state: "detached" });

    /* Cuatro citas: la cuarta queda tras «+1 más», que también selecciona. */
    /* Un vecino del mismo mes: cambiar de mes desde la mini es otro camino
       (ya cubierto) y retiraría la casilla del ancla de la rejilla principal. */
    const neighbour = page.locator(`.agenda-mini-day:not(.is-outside):not([data-agenda-date="${ANCHOR}"])`).first();
    const neighbourKey = await neighbour.getAttribute("data-agenda-date");
    await neighbour.click();
    await page.waitForFunction(
      (key) => document.querySelector(`[data-agenda-cell="true"][data-agenda-date="${key}"]`)?.getAttribute("aria-selected") === "true",
      neighbourKey
    );
    assert.equal(await cell.getAttribute("aria-selected"), "false", "la mini mueve la selección de la rejilla principal");
    await cell.locator(".agenda-day-more").click();
    await page.waitForFunction(
      (key) => document.querySelector(`[data-agenda-cell="true"][data-agenda-date="${key}"]`)?.getAttribute("aria-selected") === "true",
      ANCHOR
    );
    assert.equal(await page.locator(`.agenda-mini-day[data-agenda-date="${ANCHOR}"]`).getAttribute("aria-selected"), "true");

    ok("24 · un día con citas se selecciona desde la rejilla principal; mini y principal comparten la fecha; la cita sigue abriéndose");
    await page.close();
  }

  /* 25 · TECLADO: LA SUPERFICIE DEL DÍA CON CITAS SIGUE SIENDO ALCANZABLE */
  {
    const seeded = [{
      id: "CITA-KEY-0001",
      userId: "usr-ana",
      destinatarioNombre: "Ana Pérez",
      fechaLocal: ANCHOR,
      horaLocal: "09:15",
      lugar: "Oficina de Sant Vicenç",
      nota: "",
      estado: "programada",
      version: 1,
    }];
    const { page } = await openAgenda(browser, { citas: seeded });
    const cell = page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"]`);
    await cell.locator(".agenda-day-event").first().waitFor({ state: "visible" });
    await cell.locator(".agenda-day-surface").focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      (key) => document.querySelector(`[data-agenda-cell="true"][data-agenda-date="${key}"]`)?.getAttribute("aria-selected") === "true",
      ANCHOR
    );
    const surfaceStyle = await cell.locator(".agenda-day-surface").evaluate((node) => getComputedStyle(node).cursor);
    assert.equal(surfaceStyle, "pointer", "la superficie del día ofrece cursor de acción");
    const eventsPointer = await cell.locator(".agenda-day-events").evaluate((node) => getComputedStyle(node).pointerEvents);
    const chipPointer = await cell.locator(".agenda-day-event").first().evaluate((node) => getComputedStyle(node).pointerEvents);
    assert.deepEqual({ eventsPointer, chipPointer }, { eventsPointer: "none", chipPointer: "auto" },
      "la lista no captura clics; sus botones sí");
    ok("25 · con teclado, Enter sobre la superficie selecciona el día aunque tenga citas; la lista no bloquea el puntero");
    await page.close();
  }

  /* 26 · IDENTIDAD VIGENTE: UN CLIENTE RENOMBRADO NO SIGUE APARECIENDO CON EL NOMBRE ANTIGUO */
  {
    const seeded = [{
      id: "CITA-NAME-0001",
      userId: "usr-ana",
      destinatarioNombre: "Ismael Ejemplo",
      fechaLocal: ANCHOR,
      horaLocal: "11:00",
      lugar: "Oficina de Sant Vicenç",
      nota: "",
      estado: "programada",
      version: 1,
    }];
    const { page, api } = await openAgenda(browser, { citas: seeded });
    const cell = page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"]`);
    await cell.locator(".agenda-day-event").first().waitFor({ state: "visible" });
    assert.match(await cell.locator(".agenda-day-event-text").first().textContent(), /Ismael Ejemplo/u);

    /* El cliente se renombra en otra vista (Clientes): la Agenda se desmonta,
       y al volver relee el intervalo. El backend proyecta el nombre vigente
       del usuario; el frontend no conserva ninguna copia propia entre
       montajes (la caché del intervalo muere con la vista). */
    api.state.citas[0].destinatarioNombre = "Moha Ejemplo";
    await page.evaluate(() => window.__unmount());
    await page.evaluate(() => { document.getElementById("view").innerHTML = ""; });
    await page.evaluate(() => window.__mount("admin"));
    await page.waitForFunction(() => window.__controller?.getSnapshot?.().canCreate === true);
    await gotoAnchorMonth(page);
    await page.waitForFunction(() => document.querySelector(".agenda-day-event-text")?.textContent?.includes("Moha Ejemplo"));
    assert.equal(await page.evaluate(() => document.body.textContent.includes("Ismael Ejemplo")), false,
      "ningún resto del nombre antiguo en las superficies de identidad actual");
    assert.match(await cell.locator(".agenda-day-event").first().getAttribute("title"), /Moha Ejemplo/u, "el título del chip también es vigente");

    await cell.locator(".agenda-day-surface").click();
    await page.waitForFunction(() => document.querySelector("[data-agenda-inspector]")?.textContent?.includes("Moha Ejemplo"));
    await cell.locator(".agenda-day-event").first().click();
    await openedDetail(page);
    await page.waitForFunction(() => document.querySelector("#agenda-detail-modal")?.textContent?.includes("Moha Ejemplo"));
    ok("26 · un cliente renombrado aparece con su nombre vigente en chip, inspector y detalle; no queda rastro del antiguo");
    await page.close();
  }

  /* 27 · PINTURA DE CITAS · SIN OPACIDAD LAVADA, CON TOKENS DEL SISTEMA */
  {
    const citas = [
      {
        id: "CITA-PAINT-1",
        userId: "usr-ana",
        destinatarioNombre: "Ana Pérez",
        fechaLocal: ANCHOR,
        horaLocal: "10:00",
        lugar: "Oficina",
        nota: "",
        estado: "programada",
        version: 1,
      },
      {
        id: "CITA-PAINT-2",
        userId: "usr-bea",
        destinatarioNombre: "Bea López",
        fechaLocal: ANCHOR,
        horaLocal: "11:00",
        lugar: "Oficina",
        nota: "",
        estado: "cancelada",
        canceladaEn: "2026-01-02T00:00:00.000Z",
        version: 1,
      },
    ];
    const { page } = await openAgenda(browser, { citas });
    const cell = page.locator(`[data-agenda-cell="true"][data-agenda-date="${ANCHOR}"]`);

    for (const theme of ["dark", "light"]) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      const paints = await cell.locator(".agenda-day-event").evaluateAll((nodes) =>
        nodes.map((node) => {
          const style = getComputedStyle(node);
          return {
            cancelada: node.classList.contains("is-cancelada"),
            background: style.backgroundColor,
            color: style.color,
            opacity: style.opacity,
          };
        })
      );

      const programada = paints.find((paint) => !paint.cancelada);
      const cancelada = paints.find((paint) => paint.cancelada);
      assert.equal(programada?.opacity, "1", `${theme}: la cita programada no reduce opacidad`);
      assert.equal(cancelada?.opacity, "1", `${theme}: la cita cancelada no reduce opacidad`);
      assert.equal(programada?.background, "rgb(15, 108, 189)",
        `${theme}: la cita programada usa --agenda-blue-strong sin mezcla translúcida`);
      assert.notEqual(cancelada?.background, "rgba(0, 0, 0, 0)",
        `${theme}: la cita cancelada conserva una superficie semántica visible`);
      assert.equal(programada?.color, "rgb(255, 255, 255)",
        `${theme}: texto operativo conserva contraste sobre el azul fuerte`);
    }

    ok("27 · citas programadas/canceladas usan pintura intensa del sistema en light y dark, sin opacity");
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
