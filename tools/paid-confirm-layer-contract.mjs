/* =========================================================
   Onion Support · Valoraciones ocupa su capa, y la devuelve
   Archivo: /tools/paid-confirm-layer-contract.mjs

   NO BASTA CON LEER UN z-index.

   Con el detalle de Facturas abierto, pulsar «Valoraciones» abría su diálogo
   DEBAJO y dejaba la interfaz bloqueada. Medido en el navegador, sobre el build
   real, antes de corregir:

     - `#onion-facturas-paid-confirm-root` es el hijo 6 de `body`; lo crea su
       módulo al importarse y no se mueve nunca.
     - `#facturas-detail-root` es el hijo 7; se destruye al cerrar y se vuelve a
       añadir al final de `body` en cada apertura.
     - Las dos raíces declaran el MISMO `--z-modal` (80) y `body` aísla, así que
       el empate lo resolvía el orden del árbol: ganaba el detalle.
     - Y el velo del detalle retenido seguía con `pointer-events: auto`: el clic
       en el centro del diálogo Y el clic en su propio botón aterrizaban los dos
       en `.ui-detail-modal-overlay`.

   Por eso este contrato no lee `z-index`: hace PRUEBA DE IMPACTO con
   `elementFromPoint` sobre el diálogo y sobre su botón, y comprueba que el
   fondo no recibe nada. Un `z-index` correcto con un velo vivo encima seguiría
   siendo una interfaz bloqueada.

   Datos sintéticos. No se confirma ningún pago ni se envía ninguna valoración:
   los controles que se usan son cerrar y releer.
========================================================= */

import assert from "node:assert/strict";

import {
  clickInPage, launchBrowser, openSpaSession, serveBuiltApp, syntheticWorld, untilTrue,
} from "./spa-session-harness.mjs";

const RUTA = "/@u-admin-1";
const FILA = "[data-factura-id]";
const DETALLE = "[data-facturas-detail-modal='true']";
const DIALOGO = "[data-fpc-dialog='true']";
const VALORACIONES = "[data-fpc-retry-action='true']";
const ALTA = "#incidencias-create-modal-panel";

const espera = (ms) => new Promise((sigue) => setTimeout(sigue, ms));
const escenarios = [];
const paso = (texto) => escenarios.push(texto);

/* Quién recibe de verdad el clic en un punto, con el nombre de su cadena. */
const impacto = (page, selector, donde) => page.evaluate(({ sel, donde }) => {
  const nodo = document.querySelector(sel);
  if (!nodo) return { error: `no existe ${sel}` };
  const objetivo = donde ? nodo.querySelector(donde) : nodo;
  if (!objetivo) return { error: `no existe ${donde} dentro de ${sel}` };
  const caja = objetivo.getBoundingClientRect();
  const recibe = document.elementFromPoint(
    Math.round(caja.x + caja.width / 2),
    Math.round(caja.y + caja.height / 2)
  );
  return { dentro: Boolean(recibe && nodo.contains(recibe)), recibe: recibe ? `${recibe.tagName}.${(recibe.className || "").toString().split(" ")[0]}` : null };
}, { sel: selector, donde });

const capas = (page) => page.evaluate(() => [...document.querySelectorAll(".ui-detail-modal-root")].map((raiz) => ({
  anfitrion: raiz.parentElement?.id || "(sin id)",
  z: Number(getComputedStyle(raiz).zIndex) || 0,
  retenida: Boolean(raiz.querySelector("[data-modal-stack-held='true']")),
  veloRecibeClics: getComputedStyle(raiz.querySelector(":scope > .ui-detail-modal-overlay") || raiz).pointerEvents !== "none",
})));

const activo = (page) => page.evaluate(() => {
  const nodo = document.activeElement;
  return { etiqueta: `${nodo?.tagName}.${(nodo?.className || "").toString().split(" ")[0]}`, enDialogo: Boolean(nodo?.closest("[data-fpc-dialog='true']")) };
});

const { origin, close: cerrarServidor } = await serveBuiltApp({ spaFallback: true });
const browser = await launchBrowser();

try {
  let retrasoValoraciones = 0;
  const sesion = await openSpaSession(browser, origin, {
    world: syntheticWorld(),
    viewport: { width: 1440, height: 900 },
    api: async ({ path }) => {
      if (retrasoValoraciones && /reviews|valoracion/iu.test(path)) await espera(retrasoValoraciones);
      return false;
    },
  });
  const page = sesion.page;
  const escrituras = () => sesion.writes.filter(({ path }) => !path.startsWith("/api/auth/"));

  const abrirFactura = async () => {
    await clickInPage(page, FILA);
    await page.waitForSelector(DETALLE, { timeout: 15000 });
  };
  const abrirValoraciones = async () => {
    await clickInPage(page, VALORACIONES);
    await page.waitForSelector(DIALOGO, { timeout: 15000 });
    await espera(260);
  };

  await page.goto(`${origin}${RUTA}/facturas`, { waitUntil: "load" });
  await page.waitForSelector(FILA, { timeout: 20000 });
  await abrirFactura();

  /* 1 · El orden de montaje de producción, comprobado, no supuesto. */
  const orden = await page.evaluate(() => {
    const hijos = [...document.body.children].map((nodo) => nodo.id);
    return { dialogo: hijos.indexOf("onion-facturas-paid-confirm-root"), detalle: hijos.indexOf("facturas-detail-root") };
  });
  assert.ok(orden.dialogo >= 0 && orden.detalle >= 0, `Las dos raíces cuelgan de body: ${JSON.stringify(orden)}`);
  assert.ok(orden.detalle > orden.dialogo,
    `El detalle se monta DESPUÉS del portal del diálogo, que es el caso desfavorable y el de producción: ${JSON.stringify(orden)}`);
  paso(`1 · orden real de montaje: portal del diálogo en body[${orden.dialogo}], detalle en body[${orden.detalle}]`);

  /* 2 · Valoraciones encima: prueba de impacto, no lectura de z-index. */
  await abrirValoraciones();
  const enCentro = await impacto(page, DIALOGO);
  assert.equal(enCentro.dentro, true, `El clic en el centro del diálogo lo recibe el diálogo, no otra capa: llegó a ${enCentro.recibe}`);
  const enBoton = await impacto(page, DIALOGO, "[data-fpc-action='done']");
  assert.equal(enBoton.dentro, true, `El clic en su botón lo recibe el diálogo: llegó a ${enBoton.recibe}`);

  const conDialogo = await capas(page);
  const cubierta = conDialogo.find((capa) => capa.retenida);
  const encima = conDialogo.find((capa) => !capa.retenida);
  assert.ok(cubierta && encima, `Dos capas, una retenida y otra activa: ${JSON.stringify(conDialogo)}`);
  assert.ok(encima.z > cubierta.z, `La capa activa se pinta por encima de la retenida (${encima.z} > ${cubierta.z})`);
  assert.equal(cubierta.veloRecibeClics, false, "El velo de la capa retenida no se queda con los clics");
  paso(`2 · el diálogo recibe sus propios clics · activa z=${encima.z} sobre retenida z=${cubierta.z}`);

  /* 3 · El fondo no recibe interacciones. */
  const fondo = await impacto(page, DETALLE);
  assert.equal(fondo.dentro, false, `Un punto sobre la factura cubierta no llega a la factura: llegó a ${fondo.recibe}`);
  paso("3 · el fondo cubierto no recibe interacciones");

  /* 4 · El foco y el tabulador se quedan en la capa correcta. */
  assert.equal((await activo(page)).enDialogo, true, "El foco entra en el diálogo al abrirlo");
  for (let vuelta = 0; vuelta < 6; vuelta += 1) {
    await page.keyboard.press("Tab");
    assert.equal((await activo(page)).enDialogo, true, `Tab ${vuelta + 1}: el foco no se escapa de la capa activa`);
  }
  for (let vuelta = 0; vuelta < 3; vuelta += 1) {
    await page.keyboard.press("Shift+Tab");
    assert.equal((await activo(page)).enDialogo, true, `Shift+Tab ${vuelta + 1}: el foco no se escapa de la capa activa`);
  }
  paso("4 · Tab ×6 y Shift+Tab ×3 se quedan en el diálogo");

  /* 5 · Escape cierra SÓLO su capa; la factura recupera estado y foco. */
  const lecturaAntes = await page.evaluate((sel) => document.querySelector(sel)?.querySelector(".ui-detail-modal-body")?.scrollTop ?? 0, DETALLE);
  await page.keyboard.press("Escape");
  await page.waitForSelector(DIALOGO, { state: "detached", timeout: 15000 });
  await espera(220);
  assert.equal(await page.locator(DETALLE).count(), 1, "Escape no cierra también la factura");
  const trasCerrar = await capas(page);
  assert.equal(trasCerrar.length, 1, `Sólo queda la factura: ${JSON.stringify(trasCerrar)}`);
  assert.equal(trasCerrar[0].retenida, false, "La factura deja de estar retenida al descubrirse");
  assert.equal(trasCerrar[0].veloRecibeClics, true, "La factura recupera sus clics");
  assert.equal(await page.evaluate((sel) => document.querySelector(sel)?.querySelector(".ui-detail-modal-body")?.scrollTop ?? 0, DETALLE), lecturaAntes,
    "La factura conserva su posición de lectura");
  const foco = await activo(page);
  assert.equal(foco.enDialogo, false, "El foco sale del diálogo cerrado");
  assert.ok(await page.evaluate((sel) => Boolean(document.activeElement?.closest(sel)), DETALLE),
    `El foco vuelve al disparador vivo dentro de la factura, no al body: está en ${foco.etiqueta}`);
  const propioDelDetalle = await impacto(page, DETALLE);
  assert.equal(propioDelDetalle.dentro, true, `La factura vuelve a recibir sus clics: llegó a ${propioDelDetalle.recibe}`);
  paso(`5 · Escape cierra sólo el diálogo · lectura ${lecturaAntes} px · foco en ${foco.etiqueta}`);

  /* 6 · Reapertura, doble clic y cierre por teclado. */
  await abrirValoraciones();
  await page.locator(DIALOGO).locator("[data-fpc-action='done']").first().click();
  await page.waitForSelector(DIALOGO, { state: "detached", timeout: 15000 });
  /* «Cerrar» devuelve la factura a su propio ciclo y su pie se vuelve a pintar:
     se espera a que el disparador esté vivo otra vez, no un número de ms. */
  await untilTrue(page, ({ sel, capa }) => Boolean(document.querySelector(sel)) && !document.querySelector(capa),
    { arg: { sel: VALORACIONES, capa: DIALOGO }, timeout: 15000, message: "Tras «Cerrar», el disparador de Valoraciones no volvió" });
  /* Doble clic de verdad, con el ratón y sin forzar: el primero abre y el
     segundo cae donde caiga --sobre el velo del propio diálogo, que cierra por
     diseño--. Lo que no puede pasar es que abra DOS capas o que deje la
     interfaz atascada. Medido: queda 0 ó 1 diálogo, nunca 2. */
  const disparador = await page.locator(VALORACIONES).first().boundingBox();
  await page.mouse.dblclick(Math.round(disparador.x + disparador.width / 2), Math.round(disparador.y + disparador.height / 2));
  await espera(900);
  const tras = await page.locator(DIALOGO).count();
  assert.ok(tras <= 1, `Un doble clic nunca abre dos capas: ${tras}`);
  assert.equal((await capas(page)).filter((capa) => !capa.retenida).length, 1, "Siempre hay exactamente una capa activa");
  assert.equal(await page.locator(DETALLE).count(), 1, "La factura sigue abierta tras el doble clic");
  assert.equal(await page.locator(VALORACIONES).count(), 1, "El disparador sigue vivo tras el doble clic");
  if (tras) {
    await page.keyboard.press("Escape");
    await page.waitForSelector(DIALOGO, { state: "detached", timeout: 15000 });
  }
  /* Y tras el doble clic la capa vuelve a abrirse: no queda nada bloqueado. */
  await abrirValoraciones();
  assert.equal((await impacto(page, DIALOGO)).dentro, true, "Tras el doble clic, Valoraciones vuelve a abrirse encima");
  await page.keyboard.press("Escape");
  await page.waitForSelector(DIALOGO, { state: "detached", timeout: 15000 });
  paso(`6 · reapertura, doble clic (${tras} capa) y cierre por teclado: nunca dos, nunca atascado`);

  /* 7 · Cerrar durante una lectura lenta no deja la capa colgada. */
  retrasoValoraciones = 1800;
  await abrirValoraciones();
  await page.locator(DIALOGO).locator("[data-fpc-action='refresh-reviews']").first().click().catch(() => {});
  await espera(220);
  await page.keyboard.press("Escape");
  await page.waitForSelector(DIALOGO, { state: "detached", timeout: 15000 });
  await espera(2000); // la lectura lenta termina ahora, con su capa ya cerrada
  assert.equal(await page.locator(DIALOGO).count(), 0, "Una respuesta tardía no resucita la capa cerrada");
  assert.equal(await page.locator(DETALLE).count(), 1, "La factura sigue abierta y utilizable");
  assert.equal((await capas(page))[0].veloRecibeClics, true, "La factura no se queda muda tras un cierre durante la carga");
  retrasoValoraciones = 0;
  paso("7 · cierre durante una lectura lenta: sin capa colgada ni factura muda");

  /* 8 · Cerrar todo devuelve una SPA utilizable, sin recargar. */
  await page.keyboard.press("Escape");
  await page.waitForSelector(DETALLE, { state: "detached", timeout: 15000 });
  await espera(260);
  const limpieza = await page.evaluate(() => ({
    capas: document.querySelectorAll(".ui-detail-modal-root").length,
    retenidos: document.querySelectorAll("[data-modal-stack-held='true']").length,
    inertes: document.querySelectorAll("[inert]").length,
    cuerpoMarcado: /modal-open|payment-confirm-open/u.test(document.body.className),
    velos: [...document.querySelectorAll(".ui-detail-modal-overlay")].length,
  }));
  assert.deepEqual(limpieza, { capas: 0, retenidos: 0, inertes: 0, cuerpoMarcado: false, velos: 0 },
    `Al cerrar todo no queda nada interceptando: ${JSON.stringify(limpieza)}`);

  await clickInPage(page, FILA);
  await page.waitForSelector(DETALLE, { timeout: 15000 });
  await abrirValoraciones();
  assert.equal((await impacto(page, DIALOGO)).dentro, true, "Valoraciones vuelve a abrirse encima tras un ciclo completo");
  await page.keyboard.press("Escape");
  await page.waitForSelector(DIALOGO, { state: "detached", timeout: 15000 });
  await page.keyboard.press("Escape");
  await page.waitForSelector(DETALLE, { state: "detached", timeout: 15000 });

  await clickInPage(page, `a[href='${RUTA}/incidencias']`);
  await page.waitForSelector("[data-ticket-row='true']", { timeout: 20000 });
  await page.locator("[data-incidencias-action='create-open']").first().click({ timeout: 8000 });
  await untilTrue(page, (sel) => Boolean(document.querySelector(sel)), { arg: ALTA, timeout: 15000, message: "Tras la pila de Facturas, «Nueva incidencia» no abre" });
  await page.keyboard.press("Escape");
  await untilTrue(page, (sel) => !document.querySelector(sel), { arg: ALTA, timeout: 15000, message: "el alta no cerró" });

  assert.equal(sesion.loads.length, 1, `La sesión cargó el documento ${sesion.loads.length} veces`);
  assert.deepEqual(sesion.pageErrors, [], `Errores de página: ${JSON.stringify(sesion.pageErrors)}`);
  assert.deepEqual(escrituras(), [], `El recorrido no escribe en ningún dominio: ${JSON.stringify(escrituras())}`);
  paso("8 · cerrar todo: 0 capas, 0 retenidos, 0 inertes · Facturas, Valoraciones y Nueva incidencia reabren sin recargar");
} finally {
  await browser.close();
  await cerrarServidor();
}

console.log(`Paid confirm layer contract: PASS · ${escenarios.length} escenarios · prueba de impacto, no lectura de z-index`);
for (const linea of escenarios) console.log(`  ${linea}`);
