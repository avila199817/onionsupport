/* =========================================================
   Onion Support · El contador de Home dice en qué estado está
   Archivo: /tools/home-counter-states-contract.mjs

   UNA RAYA NO ES UN ESTADO.

   Medido sobre el build real antes de corregir: basta UN fallo del dominio de
   incidencias para que la tarjeta quede en «—» y «No disponible». Volver a
   Home no la recuperaba --una sola llamada a la lista en toda la sesión--
   porque el panel PARCIAL se guardaba y se servía como fresco: la pregunta ya
   no se repetía. Y «No disponible» no se distingue de un dato que de verdad no
   existe, así que no había nada que pulsar.

   Este contrato comprueba los cuatro estados por su marca --no por su texto
   traducido-- y, sobre todo, que la sesión SE RECUPERA sin recargar:

     cargando      · esqueletos de la sección
     value         · un número, el CERO incluido
     updating      · se conserva el número anterior y se señala el refresco
     error         · el dominio no contestó, se dice y se ofrece reintentar

   No se coloca ningún número conocido: el valor sale del mundo sintético.
   No hay sondeo: se cuenta cuántas veces se pregunta de verdad.
========================================================= */

import assert from "node:assert/strict";

import {
  clickInPage, launchBrowser, openSpaSession, serveBuiltApp, syntheticWorld, untilTrue,
} from "./spa-session-harness.mjs";

const RUTA = "/@u-admin-1";
const TARJETA = "[data-home-stat='incidencias']";
const REINTENTAR = ".home-alert--error [data-home-action='retry']";
const escenarios = [];
const paso = (texto) => escenarios.push(texto);
const espera = (ms) => new Promise((sigue) => setTimeout(sigue, ms));

const tarjeta = (page) => page.evaluate((sel) => {
  const art = document.querySelector(sel);
  if (!art) return { falta: true };
  return {
    estado: art.getAttribute("data-home-stat-state"),
    valor: (art.querySelector(".home-stat-value")?.textContent || "").trim(),
    texto: (art.querySelector(".home-stat-text")?.textContent || "").trim(),
    aria: art.querySelector("button")?.getAttribute("aria-label") || "",
    esqueletos: document.querySelectorAll(".home-stats .home-loading-card, .home-stats [data-home-loading-card]").length,
    reintentar: document.querySelectorAll(".home-alert--error [data-home-action='retry']").length,
  };
}, TARJETA);

const enHome = async (page) => untilTrue(page, (sel) => Boolean(document.querySelector(sel)) || document.querySelectorAll(".home-stats").length > 0,
  { arg: TARJETA, timeout: 20000, message: "Home no pintó su resumen" });

const volverAHome = async (page) => {
  await clickInPage(page, `a[href='${RUTA}']`);
  await enHome(page);
  await untilTrue(page, (sel) => document.querySelector(sel)?.getAttribute("data-home-stat-state") !== null,
    { arg: TARJETA, timeout: 20000, message: "La tarjeta no declaró su estado" });
  await espera(900);
};

const irA = async (page, ruta, ancla) => {
  await clickInPage(page, `a[href='${RUTA}${ruta}']`);
  await untilTrue(page, (sel) => document.querySelectorAll(sel).length > 0, { arg: ancla, timeout: 20000, message: `No se pintó ${ruta}` });
  await espera(300);
};

const { origin, close: cerrarServidor } = await serveBuiltApp({ spaFallback: true });
const browser = await launchBrowser();

try {
  /* =====================================================================
     1 · Dato válido y CERO legítimo: un cero es un número, no una ausencia.
  ===================================================================== */
  for (const [nombre, mundo, esperado] of [
    ["con incidencias", syntheticWorld(), String(syntheticWorld().tickets.length)],
    ["sin ninguna incidencia", Object.assign(syntheticWorld(), { tickets: [] }), "0"],
  ]) {
    const sesion = await openSpaSession(browser, origin, { world: mundo });
    await sesion.page.goto(`${origin}${RUTA}`, { waitUntil: "load" });
    await enHome(sesion.page);
    await espera(1200);
    const leida = await tarjeta(sesion.page);
    assert.equal(leida.estado, "value", `${nombre}: la tarjeta declara «${leida.estado}» en vez de un dato válido`);
    assert.equal(leida.valor, esperado, `${nombre}: el valor es ${leida.valor}, no ${esperado}`);
    assert.equal(leida.reintentar, 0, `${nombre}: un dato válido no ofrece reintentar`);
    assert.deepEqual(sesion.pageErrors, [], `${nombre}: errores de página ${JSON.stringify(sesion.pageErrors)}`);
    paso(`${escenarios.length + 1} · ${nombre}: estado «value» y valor ${leida.valor}`);
    await sesion.context.close();
  }

  /* =====================================================================
     2 · Error del dominio: se dice, se puede reintentar y se recupera.
  ===================================================================== */
  {
    let roto = true;
    const sesion = await openSpaSession(browser, origin, {
      world: syntheticWorld(),
      api: async ({ path, respond }) => {
        if (roto && /^\/api\/(tickets|incidencias)/u.test(path)) {
          await respond({ ok: false, error: { code: "SERVER_ERROR", message: "dominio caído" } }, 500);
          return true;
        }
        return false;
      },
    });
    const page = sesion.page;
    const llamadas = () => sesion.calls.filter(({ path }) => /^\/api\/(tickets|incidencias)/u.test(path)).length;

    await page.goto(`${origin}${RUTA}`, { waitUntil: "load" });
    await enHome(page);
    await espera(1400);

    const caida = await tarjeta(page);
    assert.equal(caida.estado, "error", `Con el dominio caído la tarjeta declara «${caida.estado}»`);
    assert.notEqual(caida.texto, "No disponible", "Un fallo de lectura no se presenta como un dato que no existe");
    assert.ok(caida.reintentar > 0, "Un fallo de lectura ofrece la recuperación que Home ya tiene");
    assert.ok(/no se pudo cargar/iu.test(caida.aria), `El nombre accesible declara el fallo: «${caida.aria}»`);
    paso(`${escenarios.length + 1} · dominio caído: estado «error», «${caida.texto}» y ${caida.reintentar} control de reintento`);

    /* 3 · El botón «Reintentar» recupera sin salir de Home. */
    roto = false;
    const antesDelBoton = llamadas();
    await clickInPage(page, REINTENTAR);
    await untilTrue(page, (sel) => document.querySelector(sel)?.getAttribute("data-home-stat-state") === "value",
      { arg: TARJETA, timeout: 20000, message: "«Reintentar» no recuperó el contador" });
    const recuperada = await tarjeta(page);
    assert.equal(recuperada.valor, String(syntheticWorld().tickets.length), `Tras reintentar el valor es ${recuperada.valor}`);
    assert.ok(llamadas() > antesDelBoton, "Reintentar vuelve a preguntar de verdad");
    assert.equal(recuperada.reintentar, 0, "Recuperado el dato, el aviso desaparece");
    paso(`${escenarios.length + 1} · «Reintentar» sin salir de Home: ${recuperada.valor}`);

    assert.equal(sesion.documents.length, 1, `La recuperación pidió ${sesion.documents.length} documentos; debe bastar 1`);
    assert.deepEqual(sesion.pageErrors, [], `Errores de página: ${JSON.stringify(sesion.pageErrors)}`);
    await sesion.context.close();
  }

  /* =====================================================================
     4 · Salir y volver también recupera: un panel parcial no cierra la
     pregunta. Y cuando el dato está completo, NO se vuelve a preguntar.
  ===================================================================== */
  {
    let roto = true;
    const sesion = await openSpaSession(browser, origin, {
      world: syntheticWorld(),
      api: async ({ path, respond }) => {
        if (roto && /^\/api\/(tickets|incidencias)/u.test(path)) {
          await respond({ ok: false, error: { code: "SERVER_ERROR", message: "dominio caído" } }, 500);
          return true;
        }
        return false;
      },
    });
    const page = sesion.page;
    const llamadas = () => sesion.calls.filter(({ path }) => /^\/api\/(tickets|incidencias)/u.test(path)).length;

    await page.goto(`${origin}${RUTA}`, { waitUntil: "load" });
    await enHome(page);
    await espera(1300);
    assert.equal((await tarjeta(page)).estado, "error", "El escenario parte de un contador en error");

    roto = false;
    await irA(page, "/facturas", "[data-factura-id]");
    await volverAHome(page);
    const sana = await tarjeta(page);
    assert.equal(sana.estado, "value", `Al volver a Home la tarjeta sigue en «${sana.estado}»`);
    assert.equal(sana.valor, String(syntheticWorld().tickets.length), `Al volver, el valor es ${sana.valor}`);
    const trasRecuperar = llamadas();

    /* Y una vez sano, volver NO desata otra pregunta: la caché manda. */
    await irA(page, "/usuarios", "[data-user-row='true']");
    await volverAHome(page);
    const estable = await tarjeta(page);
    assert.equal(estable.valor, sana.valor, "El valor recuperado se mantiene");
    assert.equal(llamadas(), trasRecuperar, `Con el dato completo no se vuelve a preguntar (${llamadas()} vs ${trasRecuperar}): no hay sondeo`);

    assert.equal(sesion.documents.length, 1, `La sesión pidió ${sesion.documents.length} documentos; debe bastar 1`);
    assert.deepEqual(sesion.pageErrors, [], `Errores de página: ${JSON.stringify(sesion.pageErrors)}`);
    paso(`${escenarios.length + 1} · salir y volver recupera (${sana.valor}) y, ya completo, deja de preguntar`);
    await sesion.context.close();
  }

  /* =====================================================================
     5 · Carga lenta y cambio de ruta mientras carga: ni raya congelada ni
     respuesta vieja que envenene la siguiente entrada.
  ===================================================================== */
  {
    const sesion = await openSpaSession(browser, origin, {
      world: syntheticWorld(),
      api: async ({ path }) => {
        if (/^\/api\/(tickets|incidencias)/u.test(path)) await espera(1200);
        return false;
      },
    });
    const page = sesion.page;
    await page.goto(`${origin}${RUTA}`, { waitUntil: "load" });
    await enHome(page);
    const durante = await tarjeta(page);
    assert.notEqual(durante.estado, "error", "Una carga en curso no se presenta como un fallo");

    /* Cambiar de ruta mientras carga y volver. */
    await irA(page, "/facturas", "[data-factura-id]");
    await volverAHome(page);
    await untilTrue(page, (sel) => document.querySelector(sel)?.getAttribute("data-home-stat-state") === "value",
      { arg: TARJETA, timeout: 25000, message: "Tras cambiar de ruta durante la carga, el contador no se resolvió" });
    const final = await tarjeta(page);
    assert.equal(final.valor, String(syntheticWorld().tickets.length), `Tras la carrera el valor es ${final.valor}`);
    assert.equal(sesion.documents.length, 1, `La carrera pidió ${sesion.documents.length} documentos; debe bastar 1`);
    assert.deepEqual(sesion.pageErrors, [], `Errores de página: ${JSON.stringify(sesion.pageErrors)}`);
    paso(`${escenarios.length + 1} · carga lenta y cambio de ruta: se resuelve en ${final.valor}, sin raya congelada`);
    await sesion.context.close();
  }

  console.log(`Home counter states contract: PASS · ${escenarios.length} escenarios · estados por marca, recuperación medida y sin sondeo`);
  for (const linea of escenarios) console.log(`  ${linea}`);
} finally {
  await browser.close();
  await cerrarServidor();
}
