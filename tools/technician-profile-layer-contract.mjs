/* =========================================================
   Onion Support · El perfil del técnico ocupa su capa
   Archivo: /tools/technician-profile-layer-contract.mjs

   ABRIR NO ES LO MISMO QUE PODER USARSE.

   El perfil se pintaba siempre y el foco entraba siempre: por eso una prueba
   que sólo mirase si el panel existe --o que pulsara con un evento
   sintético-- lo daba por bueno. Lo que fallaba era el ORDEN DE PINTADO.

   Medido en el navegador, sobre el build real, antes de corregir:

     sesión recién cargada        perfil body[8] · detalle body[7] → usable
     tras cambiar de vista        perfil body[6] · detalle body[9] → BLOQUEADO
     detalle abierto desde Home   perfil body[6] · detalle body[8] → BLOQUEADO

   El host del perfil se crea una vez y no se retira; el del detalle se destruye
   y se vuelve a añadir al final de `body` con cada controlador nuevo. Ambas
   raíces declaran el mismo `--z-modal`, así que el empate lo decide el orden
   del árbol, y el velo de la capa de abajo se quedaba con los clics. Con el
   ratón no se podía; con el teclado sí. De ahí que «se arreglara» al recargar.

   Por eso este contrato NO lee `z-index` para juzgar: hace PRUEBA DE IMPACTO
   con `elementFromPoint` y pulsa con el RATÓN REAL, en el orden de montaje
   desfavorable.

   Datos sintéticos. Cero escrituras de dominio.
========================================================= */

import assert from "node:assert/strict";

import {
  clickInPage, launchBrowser, openSpaSession, serveBuiltApp, syntheticWorld, untilTrue,
} from "./spa-session-harness.mjs";

const RUTA = "/@u-admin-1";
const FILA = "[data-ticket-row='true']";
const DETALLE = "#incidencias-detail-modal-panel";
const PERFIL = "#incidencias-technician-profile-panel";
const OJO = "[data-incidencias-modal-root='true'] [data-technician-profile-eye='true']";
const INSIGNIA = ".incidencias-assigned-badge[data-technician-profile-trigger='true']";
const ALTA = "#incidencias-create-modal-panel";

const escenarios = [];
const paso = (texto) => escenarios.push(texto);
const espera = (ms) => new Promise((sigue) => setTimeout(sigue, ms));

/* Quién recibe de verdad el clic en el centro de un nodo. */
const impacto = (page, selector) => page.evaluate((sel) => {
  const nodo = document.querySelector(sel);
  if (!nodo) return { error: `no existe ${sel}` };
  const caja = nodo.getBoundingClientRect();
  const recibe = document.elementFromPoint(
    Math.round(caja.x + caja.width / 2),
    Math.round(caja.y + caja.height / 2)
  );
  return {
    suyo: Boolean(recibe && nodo.contains(recibe)),
    recibe: recibe ? `${recibe.tagName}.${(recibe.className || "").toString().split(" ")[0]}` : null,
  };
}, selector);

const capas = (page) => page.evaluate(() => [...document.querySelectorAll(".ui-detail-modal-root")].map((raiz) => ({
  anfitrion: raiz.parentElement?.id || "(sin id)",
  indice: [...document.body.children].indexOf(raiz.parentElement),
  z: Number(getComputedStyle(raiz).zIndex) || 0,
  retenida: Boolean(raiz.querySelector("[data-modal-stack-held='true']")),
  velo: getComputedStyle(raiz.querySelector(":scope > .ui-detail-modal-overlay") || raiz).pointerEvents,
})));

const limpieza = (page) => page.evaluate(() => ({
  capas: document.querySelectorAll(".ui-detail-modal-root").length,
  retenidos: document.querySelectorAll("[data-modal-stack-held='true']").length,
  inertes: document.querySelectorAll("[inert]").length,
  cuerpo: document.body.className,
}));

/* El segundo técnico ya vive en el mundo sintético --INC-SINT-2 e INC-SINT-4 son
   suyas--, así que este contrato dejó de fabricarse el suyo. La copia local
   nombraba a otra persona con el MISMO identificador, y el directorio manda
   sobre el nombre que trae el ticket: la ficción chocaba con el mundo. */
const mundo = () => syntheticWorld();

const { origin, close: cerrarServidor } = await serveBuiltApp({ spaFallback: true });
const browser = await launchBrowser();

try {
  const sesion = await openSpaSession(browser, origin, { world: mundo(), viewport: { width: 1440, height: 900 } });
  const page = sesion.page;
  const escrituras = () => sesion.writes.filter(({ path }) => !path.startsWith("/api/auth/"));

  const irA = async (ruta, ancla) => {
    await clickInPage(page, `a[href='${RUTA}${ruta}']`);
    await untilTrue(page, (sel) => document.querySelectorAll(sel).length > 0, { arg: ancla, timeout: 20000, message: `No se pintó ${ruta || "/"}` });
    await espera(350);
  };
  const cerrar = async (selector) => {
    await page.keyboard.press("Escape");
    await untilTrue(page, (sel) => !document.querySelector(sel), { arg: selector, timeout: 10000, message: `No se cerró ${selector}` });
    await espera(250);
  };
  const abrirDetalle = async (id) => {
    await clickInPage(page, `${FILA}[data-ticket-id='${id}']`);
    await untilTrue(page, (sel) => Boolean(document.querySelector(sel)), { arg: DETALLE, timeout: 20000, message: `No abrió ${id}` });
    await espera(700);
  };
  /* Con el RATÓN, sobre el punto real: un evento sintético saltaría el
     hit-testing y daría por bueno un panel enterrado. */
  const pulsarConRaton = async (selector) => {
    const caja = await page.locator(selector).first().boundingBox({ timeout: 8000 });
    assert.ok(caja, `No hay nada que pulsar en ${selector}`);
    await page.mouse.click(Math.round(caja.x + caja.width / 2), Math.round(caja.y + caja.height / 2));
  };
  const abrirPerfil = async (selector = OJO) => {
    await pulsarConRaton(selector);
    await untilTrue(page, (sel) => Boolean(document.querySelector(sel)), { arg: PERFIL, timeout: 15000, message: "El perfil no se pintó" });
    await espera(500);
  };

  await page.goto(`${origin}${RUTA}/incidencias`, { waitUntil: "load" });
  await untilTrue(page, (sel) => document.querySelectorAll(sel).length > 0, { arg: FILA, timeout: 20000, message: "La lista no pintó" });

  /* =====================================================================
     1 · Orden de montaje DESFAVORABLE: el detalle se añade DESPUÉS del
     perfil, que es el caso que fallaba. Y aun así el perfil recibe sus clics.
  ===================================================================== */
  await abrirDetalle("INC-SINT-1");
  await abrirPerfil();
  await cerrar(PERFIL);
  await cerrar(DETALLE);
  await irA("/facturas", "[data-factura-id]");
  await irA("/incidencias", FILA);
  await abrirDetalle("INC-SINT-1");
  await abrirPerfil();

  const orden = await capas(page);
  const perfil = orden.find((capa) => capa.anfitrion === "incidencias-technician-profile-host");
  const cubierta = orden.find((capa) => capa.anfitrion !== "incidencias-technician-profile-host");
  assert.ok(perfil && cubierta, `Deben coexistir el perfil y la capa que cubre: ${JSON.stringify(orden)}`);
  assert.ok(cubierta.indice > perfil.indice,
    `Este escenario sólo prueba algo con el detalle montado DESPUÉS: ${JSON.stringify(orden)}`);
  assert.equal(cubierta.retenida, true, "La capa cubierta queda marcada por la pila");
  assert.ok(perfil.z > cubierta.z, `La capa activa se pinta encima (${JSON.stringify(orden)})`);
  assert.equal(cubierta.velo, "none", "El velo de la capa retenida no se queda con los clics");

  const golpe = await impacto(page, PERFIL);
  assert.equal(golpe.suyo, true, `El perfil recibe sus propios clics, no la capa de debajo (llegó a ${golpe.recibe})`);
  paso(`${escenarios.length + 1} · orden desfavorable (perfil body[${perfil.indice}], detalle body[${cubierta.indice}]): el perfil recibe sus clics · ${perfil.z} sobre ${cubierta.z}`);

  /* 2 · Teclado dentro de la capa, y Escape cierra SÓLO el perfil. */
  const dentro = [];
  for (let vuelta = 0; vuelta < 5; vuelta += 1) {
    await page.keyboard.press("Tab");
    dentro.push(await page.evaluate((sel) => Boolean(document.activeElement?.closest(sel)), PERFIL));
  }
  assert.equal(dentro.every(Boolean), true, `El tabulador se queda dentro del perfil: ${JSON.stringify(dentro)}`);
  await cerrar(PERFIL);
  assert.ok(await page.locator(DETALLE).count(), "Escape cierra el perfil, no el detalle");
  const trasCerrar = await impacto(page, DETALLE);
  assert.equal(trasCerrar.suyo, true, `Cerrado el perfil, el detalle recupera sus clics (llegó a ${trasCerrar.recibe})`);
  const sueltos = await limpieza(page);
  assert.equal(sueltos.retenidos, 0, "Al cerrar el perfil no queda ningún panel retenido");
  paso(`${escenarios.length + 1} · teclado dentro, Escape cierra sólo el perfil y el detalle recupera sus clics`);

  /* 3 · Ciclos repetidos y doble clic: nunca dos capas, nunca atascado. */
  for (const vuelta of [1, 2, 3]) {
    await abrirPerfil();
    assert.equal(await page.locator(PERFIL).count(), 1, `La vuelta ${vuelta} no abre dos perfiles`);
    assert.equal((await impacto(page, PERFIL)).suyo, true, `La vuelta ${vuelta} sigue recibiendo sus clics`);
    await cerrar(PERFIL);
  }
  const caja = await page.locator(OJO).first().boundingBox();
  await page.mouse.dblclick(Math.round(caja.x + caja.width / 2), Math.round(caja.y + caja.height / 2));
  await espera(700);
  await abrirPerfil();
  assert.equal((await impacto(page, PERFIL)).suyo, true, "Tras un doble clic el perfil sigue abriéndose y recibiendo sus clics");
  await cerrar(PERFIL);
  paso(`${escenarios.length + 1} · 3 ciclos y un doble clic: una sola capa y nunca atascado`);

  /* 4 · Dos técnicos: cada perfil es el suyo. */
  const nombreDelPerfil = () => page.evaluate((sel) => (document.querySelector(sel)?.textContent || "").replace(/\s+/gu, " "), PERFIL);
  await abrirPerfil();
  const primero = await nombreDelPerfil();
  assert.ok(/Beatriz Técnica Sintética/u.test(primero), `El perfil del técnico asignado a INC-SINT-1: «${primero.slice(0, 80)}»`);
  await cerrar(PERFIL);
  await cerrar(DETALLE);
  await abrirDetalle("INC-SINT-2");
  await abrirPerfil();
  const segundo = await nombreDelPerfil();
  assert.ok(/Damián Técnico Sintético/u.test(segundo), `El perfil del técnico asignado a INC-SINT-2: «${segundo.slice(0, 80)}»`);
  assert.equal(/Beatriz Técnica Sintética/u.test(segundo), false, "El contenido de un técnico no aparece en el perfil de otro");
  await cerrar(PERFIL);
  await cerrar(DETALLE);
  paso(`${escenarios.length + 1} · dos técnicos: cada perfil es el suyo y no se mezclan`);

  /* 5 · Desde la INSIGNIA de la lista no se cubre ninguna capa: no se retiene
     nada, y el perfil sigue recibiendo sus clics. */
  await abrirPerfil(INSIGNIA);
  const desdeLista = await capas(page);
  assert.equal(desdeLista.filter((capa) => capa.retenida).length, 0,
    `Sin capa debajo no se retiene nada: ${JSON.stringify(desdeLista)}`);
  assert.equal((await impacto(page, PERFIL)).suyo, true, "El perfil abierto desde la lista recibe sus clics");
  await cerrar(PERFIL);
  paso(`${escenarios.length + 1} · desde la insignia de la lista: 0 retenidos y clics propios`);

  /* 6 · Desde Home, con el detalle en el anfitrión del overlay. */
  await irA("", "[data-home-entity-source='home.activity']");
  await clickInPage(page, "[data-home-entity-source='home.activity'][data-entity-type='incidencia'][data-entity-id='INC-SINT-1']");
  await untilTrue(page, (sel) => Boolean(document.querySelector(sel)), { arg: DETALLE, timeout: 20000, message: "El detalle no abrió desde Home" });
  await espera(800);
  await abrirPerfil();
  assert.equal((await impacto(page, PERFIL)).suyo, true, "Abierto desde Home, el perfil recibe sus clics");
  await cerrar(PERFIL);
  await cerrar(DETALLE);
  paso(`${escenarios.length + 1} · detalle abierto desde Home: el perfil sigue encima`);

  /* 7 · Cerrado todo, la SPA sigue entera. */
  await irA("/incidencias", FILA);
  const final = await limpieza(page);
  assert.equal(final.capas, 0, "No queda ninguna capa abierta");
  assert.equal(final.retenidos, 0, "No queda ningún panel retenido");
  assert.equal(final.inertes, 0, "No queda nada aislado sin una capa que lo justifique");
  await page.locator("[data-incidencias-action='create-open']").first().click({ timeout: 8000 });
  await untilTrue(page, (sel) => Boolean(document.querySelector(sel)), { arg: ALTA, timeout: 15000, message: "«Nueva incidencia» dejó de abrir" });
  await cerrar(ALTA);
  await irA("/usuarios", "[data-user-row='true']");
  paso(`${escenarios.length + 1} · cerrado todo: 0 capas, 0 retenidos, 0 inertes · «Nueva incidencia» y Usuarios siguen abriendo`);

  assert.equal(sesion.documents.length, 1, `La sesión pidió ${sesion.documents.length} documentos; debe bastar 1`);
  assert.deepEqual(sesion.pageErrors, [], `Errores de página: ${JSON.stringify(sesion.pageErrors)}`);
  assert.deepEqual(escrituras(), [], "Consultar un perfil no escribe en ningún dominio");
  await sesion.context.close();

  console.log(`Technician profile layer contract: PASS · ${escenarios.length} escenarios · prueba de impacto y ratón real, no lectura de z-index`);
  for (const linea of escenarios) console.log(`  ${linea}`);
} finally {
  await browser.close();
  await cerrarServidor();
}
