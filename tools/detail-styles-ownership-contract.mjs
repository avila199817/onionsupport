/* =========================================================
   Onion Support · El detalle lleva sus estilos, venga de donde venga
   Archivo: /tools/detail-styles-ownership-contract.mjs

   NO BASTA CON ENCONTRAR UN <link>.

   Al cambiar de ruta, el router no borra las hojas de la anterior: las APARCA
   con `media="not all"` para no volver a descargarlas. Siguen en el `<head>` y
   su `.sheet` sigue sin ser nulo --medido en el navegador--, así que quien las
   buscaba por href las daba por puestas. El detalle transversal abierto desde
   otra vista encontraba su hoja de dominio, la creía aplicada y se montaba sin
   ella: sólo sobrevivía el armazón estructural compartido.

   Por eso este contrato NO comprueba que exista un `<link>` ni lleva una lista
   manual de hojas, y el arnés NO precarga el CSS cuya ausencia buscamos: cada
   sesión arranca limpia y las hojas llegan como llegan en producción.

   Lo que se compara es la HUELLA COMPLETA del panel: para cada nodo del
   detalle, su caja, color, fondo, radio, tipografía, relleno, borde y
   distribución calculados. El mismo registro abierto en frío desde su propia
   ruta es la referencia; abierto en caliente desde cualquier otra entrada real
   tiene que dar exactamente lo mismo. Una hoja aparcada cambia 171 de 212
   nodos en Incidencias y 143 de 151 en Facturas: eso es lo que se detecta.

   Las entradas no se enumeran de memoria: se descubren en el árbol construido.

   Datos sintéticos. Cero escrituras de dominio: sólo se abre, se lee y se
   cierra.
========================================================= */

import assert from "node:assert/strict";

import {
  clickInPage, launchBrowser, openSpaSession, serveBuiltApp, syntheticWorld, untilTrue,
} from "./spa-session-harness.mjs";

const RUTA = "/@u-admin-1";
const INCIDENCIA = "INC-SINT-1";
const FACTURA = "F-SINT-1";
const PANEL_INCIDENCIA = "#incidencias-detail-modal-panel";
const PANEL_FACTURA = "[data-facturas-detail-modal='true']";
const FILA_INCIDENCIA = `[data-ticket-row='true'][data-ticket-id='${INCIDENCIA}']`;
const FILA_FACTURA = `[data-factura-id='${FACTURA}']`;
const ESCRITORIO = { width: 1440, height: 900 };
const MOVIL = { width: 390, height: 844 };

const escenarios = [];
const paso = (texto) => escenarios.push(texto);

/* El mundo sintético sin tocar, salvo el vínculo que la lista de Facturas ya
   pinta cuando una factura nombra su incidencia: es la entrada que queremos. */
function mundo() {
  const world = syntheticWorld();
  world.facturas = world.facturas.map((factura, indice) => (
    indice === 0 ? { ...factura, ticketId: INCIDENCIA, incidenciaId: INCIDENCIA } : factura
  ));
  return world;
}

/* HUELLA · todo el panel, no cuatro nodos escogidos. Sin posición absoluta:
   el desplazamiento de lectura no es un estilo perdido. */
const huella = (page, selector) => page.evaluate((sel) => {
  const panel = document.querySelector(sel);
  if (!panel) return null;
  return [...panel.querySelectorAll("*")].map((nodo, indice) => {
    const estilo = getComputedStyle(nodo);
    const caja = nodo.getBoundingClientRect();
    return [
      indice,
      `${nodo.tagName}.${(nodo.className || "").toString().trim().split(/\s+/)[0] || "-"}`,
      `${Math.round(caja.width)}x${Math.round(caja.height)}`,
      estilo.backgroundColor, estilo.color, estilo.borderRadius, estilo.fontSize,
      estilo.fontWeight, estilo.padding, estilo.borderTopWidth, estilo.display, estilo.gap,
    ].join("|");
  });
}, selector);

/* Estado real de las hojas gestionadas, leído del `<head>`, no de una lista. */
const hojas = (page) => page.evaluate(() => [...document.querySelectorAll("link[rel='stylesheet']")]
  .filter((link) => link.dataset.onionRouteStyle === "true" || link.dataset.entityOverlayStyle === "true")
  .map((link) => ({
    nombre: (link.getAttribute("href") || "").split("/").slice(-2).join("/"),
    media: link.getAttribute("media") || "all",
    puesta: Boolean(link.sheet) && link.media !== "not all" && !link.disabled,
    reclamaciones: Number(link.getAttribute("data-modal-style-claim") || 0),
  })));

const diferencias = (base, otra) => {
  if (!base || !otra) return ["(falta un panel)"];
  const total = Math.max(base.length, otra.length);
  const lista = [];
  for (let i = 0; i < total; i += 1) if (base[i] !== otra[i]) lista.push(`frío: ${base[i]} · fuera: ${otra[i]}`);
  return lista;
};

const { origin, close: cerrarServidor } = await serveBuiltApp({ spaFallback: true });
const browser = await launchBrowser();

try {
  const sesionNueva = async (viewport = ESCRITORIO) => openSpaSession(browser, origin, { world: mundo(), viewport });

  const navegar = async (page, ruta, ancla) => {
    await clickInPage(page, `a[href='${RUTA}${ruta}']`);
    await untilTrue(page, (sel) => document.querySelectorAll(sel).length > 0,
      { arg: ancla, timeout: 20000, message: `No se pintó ${ancla} al ir a ${ruta || "/"}` });
  };

  /* ASENTAR ES ESPERAR A LO QUE SE VA A MEDIR, no a un alto ni a un reloj.
     Medido: la fotografía confirmada añade `data-has-avatar`, que entra en la
     regla compartida de avatares y cambia el `display` del hueco. Esperar el
     alto del panel no lo veía --el hueco mide igual-- y la referencia en frío
     se tomaba un instante antes que la caliente. Se espera, pues, a que la
     HUELLA COMPLETA repita: dos muestras iguales seguidas. Una hoja ausente da
     una huella estable y DISTINTA, así que esto no tapa el defecto. */
  const asentar = async (page, panel) => {
    let previa = null;
    for (let intento = 0; intento < 60; intento += 1) {
      const actual = await huella(page, panel);
      if (previa && JSON.stringify(previa) === JSON.stringify(actual)) return actual;
      previa = actual;
      await page.waitForTimeout(150); // intervalo de muestreo, no espera a ojo
    }
    throw new Error(`El detalle ${panel} no deja de cambiar de presentación`);
  };

  const abrir = async (page, disparador, panel) => {
    await clickInPage(page, disparador);
    await untilTrue(page, (sel) => Boolean(document.querySelector(sel)),
      { arg: panel, timeout: 20000, message: `No se pintó el detalle con ${disparador}` });
    return asentar(page, panel);
  };

  const cerrar = async (page, panel) => {
    await page.keyboard.press("Escape");
    await untilTrue(page, (sel) => !document.querySelector(sel),
      { arg: panel, timeout: 20000, message: `El detalle ${panel} no se cerró` });
  };

  /* =========================================================
     1 · Las entradas no se recitan: se descubren en el árbol construido.
  ========================================================= */
  let entradas = [];
  {
    const sesion = await sesionNueva();
    const page = sesion.page;
    await page.goto(`${origin}${RUTA}`, { waitUntil: "load" });
    await untilTrue(page, () => document.querySelectorAll("[data-entity-overlay-trigger='true']").length > 0,
      { timeout: 20000, message: "Home no pintó ningún disparador de detalle" });
    const enHome = await page.evaluate(() => [...document.querySelectorAll("[data-entity-overlay-trigger='true']")]
      .map((nodo) => `${nodo.getAttribute("data-home-entity-source")}:${nodo.getAttribute("data-entity-type")}`));

    await navegar(page, "/facturas", "[data-factura-id]");
    const enFacturas = await page.evaluate(() => [...document.querySelectorAll("[data-entity-type='incidencia']")]
      .filter((nodo) => !nodo.closest(".ui-detail-modal-root")).map(() => "facturas.lista:incidencia"));

    entradas = [...new Set([...enHome, ...enFacturas])].sort();
    for (const exigida of ["facturas.lista:incidencia", "home.activity:factura", "home.activity:incidencia", "home.invoices:factura"]) {
      assert.ok(entradas.includes(exigida), `Falta la entrada externa ${exigida}. Descubiertas: ${JSON.stringify(entradas)}`);
    }

    /* Medido, no supuesto: desde el detalle de una incidencia NO se abre una
       factura. El identificador viaja como texto escapado, sin acción. */
    await abrir(page, FILA_FACTURA, PANEL_FACTURA);
    const desdeFactura = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-entity-type]`)]
      .map((nodo) => nodo.getAttribute("data-entity-type")), PANEL_FACTURA);
    await cerrar(page, PANEL_FACTURA);

    assert.deepEqual(sesion.pageErrors, [], `Errores de página: ${JSON.stringify(sesion.pageErrors)}`);
    paso(`1 · entradas externas descubiertas: ${entradas.join(", ")} · desde el detalle de Factura: ${desdeFactura.length ? desdeFactura.join(",") : "ninguna"}`);
    await sesion.context.close();
  }

  /* =========================================================
     2-7 · La misma ficha, desde su ruta en frío y desde cada entrada real en
     una sesión caliente: tiene que verse exactamente igual.
  ========================================================= */
  const recorridos = [
    {
      nombre: "Incidencias · su ruta, en frío", referencia: true, panel: PANEL_INCIDENCIA,
      pasos: async (page) => {
        await page.goto(`${origin}${RUTA}/incidencias`, { waitUntil: "load" });
        await untilTrue(page, (sel) => Boolean(document.querySelector(sel)), { arg: FILA_INCIDENCIA, timeout: 20000, message: "La lista de Incidencias no pintó" });
        await abrir(page, FILA_INCIDENCIA, PANEL_INCIDENCIA);
      },
    },
    {
      nombre: "Incidencias · desde la lista de Facturas, en caliente", panel: PANEL_INCIDENCIA,
      pasos: async (page) => {
        await page.goto(`${origin}${RUTA}/incidencias`, { waitUntil: "load" });
        await untilTrue(page, (sel) => Boolean(document.querySelector(sel)), { arg: FILA_INCIDENCIA, timeout: 20000, message: "La lista de Incidencias no pintó" });
        await abrir(page, FILA_INCIDENCIA, PANEL_INCIDENCIA);
        await cerrar(page, PANEL_INCIDENCIA);
        await navegar(page, "/facturas", "[data-factura-id]");
        await abrir(page, ".facturas-incidencia-link", PANEL_INCIDENCIA);
      },
    },
    {
      nombre: "Incidencias · desde la actividad de Home, en caliente", panel: PANEL_INCIDENCIA,
      pasos: async (page) => {
        await page.goto(`${origin}${RUTA}/incidencias`, { waitUntil: "load" });
        await untilTrue(page, (sel) => Boolean(document.querySelector(sel)), { arg: FILA_INCIDENCIA, timeout: 20000, message: "La lista de Incidencias no pintó" });
        await abrir(page, FILA_INCIDENCIA, PANEL_INCIDENCIA);
        await cerrar(page, PANEL_INCIDENCIA);
        await navegar(page, "", "[data-home-entity-source='home.activity']");
        await abrir(page, `[data-home-entity-source='home.activity'][data-entity-type='incidencia'][data-entity-id='${INCIDENCIA}']`, PANEL_INCIDENCIA);
      },
    },
    {
      nombre: "Facturas · su ruta, en frío", referencia: true, panel: PANEL_FACTURA,
      pasos: async (page) => {
        await page.goto(`${origin}${RUTA}/facturas`, { waitUntil: "load" });
        await untilTrue(page, (sel) => Boolean(document.querySelector(sel)), { arg: FILA_FACTURA, timeout: 20000, message: "La lista de Facturas no pintó" });
        await abrir(page, FILA_FACTURA, PANEL_FACTURA);
      },
    },
    {
      nombre: "Facturas · desde la tarjeta de Home, en caliente", panel: PANEL_FACTURA,
      pasos: async (page) => {
        await page.goto(`${origin}${RUTA}/facturas`, { waitUntil: "load" });
        await untilTrue(page, (sel) => Boolean(document.querySelector(sel)), { arg: FILA_FACTURA, timeout: 20000, message: "La lista de Facturas no pintó" });
        await abrir(page, FILA_FACTURA, PANEL_FACTURA);
        await cerrar(page, PANEL_FACTURA);
        await navegar(page, "", "[data-home-entity-source='home.invoices']");
        await abrir(page, `[data-home-entity-source='home.invoices'][data-entity-id='${FACTURA}']`, PANEL_FACTURA);
      },
    },
    {
      nombre: "Facturas · desde la actividad de Home, en caliente", panel: PANEL_FACTURA,
      pasos: async (page) => {
        await page.goto(`${origin}${RUTA}/facturas`, { waitUntil: "load" });
        await untilTrue(page, (sel) => Boolean(document.querySelector(sel)), { arg: FILA_FACTURA, timeout: 20000, message: "La lista de Facturas no pintó" });
        await abrir(page, FILA_FACTURA, PANEL_FACTURA);
        await cerrar(page, PANEL_FACTURA);
        await navegar(page, "", "[data-home-entity-source='home.activity']");
        await abrir(page, `[data-home-entity-source='home.activity'][data-entity-type='factura'][data-entity-id='${FACTURA}']`, PANEL_FACTURA);
      },
    },
  ];

  const referencias = new Map();
  for (const recorrido of recorridos) {
    const sesion = await sesionNueva();
    const page = sesion.page;
    await recorrido.pasos(page);
    const medida = await huella(page, recorrido.panel);
    assert.ok(medida?.length, `${recorrido.nombre}: el panel no tiene nodos que medir`);

    if (recorrido.referencia) {
      referencias.set(recorrido.panel, medida);
      paso(`${escenarios.length + 1} · ${recorrido.nombre}: referencia de ${medida.length} nodos`);
    } else {
      const base = referencias.get(recorrido.panel);
      const distintos = diferencias(base, medida);
      assert.deepEqual(distintos, [],
        `${recorrido.nombre}: ${distintos.length} de ${base.length} nodos pierden su presentación. Primero: ${distintos[0]}`);
      paso(`${escenarios.length + 1} · ${recorrido.nombre}: ${medida.length} nodos idénticos a su referencia en frío`);
    }

    assert.deepEqual(sesion.pageErrors, [], `${recorrido.nombre}: errores de página ${JSON.stringify(sesion.pageErrors)}`);
    assert.equal(sesion.documents.length, 1, `${recorrido.nombre}: la SPA cargó ${sesion.documents.length} documentos; debe bastar 1`);
    assert.deepEqual(sesion.writes.filter(({ path }) => !path.startsWith("/api/auth/")), [],
      `${recorrido.nombre}: leer un detalle no escribe en el dominio`);
    await sesion.context.close();
  }

  /* =========================================================
     8 · Propiedad compartida: cerrar un consumidor no le retira el recurso a
     los demás, y soltar devuelve el mando a la ruta activa.
  ========================================================= */
  {
    const sesion = await sesionNueva();
    const page = sesion.page;
    await page.goto(`${origin}${RUTA}/incidencias`, { waitUntil: "load" });
    await untilTrue(page, (sel) => Boolean(document.querySelector(sel)), { arg: FILA_INCIDENCIA, timeout: 20000, message: "La lista de Incidencias no pintó" });

    /* 8a · En su PROPIA ruta: el detalle y la vista comparten las hojas.
       Cerrar el detalle no puede dejar a la lista sin las suyas. */
    const antesEnRuta = await hojas(page);
    await abrir(page, FILA_INCIDENCIA, PANEL_INCIDENCIA);
    await cerrar(page, PANEL_INCIDENCIA);
    const despuesEnRuta = await hojas(page);
    for (const hoja of antesEnRuta.filter((h) => h.puesta)) {
      const ahora = despuesEnRuta.find((h) => h.nombre === hoja.nombre);
      assert.equal(ahora?.puesta, true, `Cerrar el detalle retiró ${hoja.nombre} a la ruta que también la usa`);
    }
    assert.equal(despuesEnRuta.every((h) => h.reclamaciones === 0), true,
      `Quedaron reclamaciones sin soltar: ${JSON.stringify(despuesEnRuta.filter((h) => h.reclamaciones))}`);

    /* 8b · Fuera de su ruta: mientras el detalle vive, sus hojas están puestas
       y reclamadas; al cerrarlo vuelven al estado que dicta la ruta activa. */
    await navegar(page, "/facturas", "[data-factura-id]");
    const enFacturasSinDetalle = await hojas(page);
    await abrir(page, ".facturas-incidencia-link", PANEL_INCIDENCIA);
    const conDetalle = await hojas(page);
    const reclamadas = conDetalle.filter((h) => h.reclamaciones > 0);
    assert.ok(reclamadas.length > 0, "Abrir el detalle fuera de su ruta no reclamó ninguna hoja");
    assert.equal(reclamadas.every((h) => h.puesta), true,
      `Una hoja reclamada sigue sin aplicarse: ${JSON.stringify(reclamadas.filter((h) => !h.puesta))}`);

    await cerrar(page, PANEL_INCIDENCIA);
    const trasCerrar = await hojas(page);
    assert.deepEqual(
      trasCerrar.map(({ nombre, puesta }) => `${nombre}:${puesta}`),
      enFacturasSinDetalle.map(({ nombre, puesta }) => `${nombre}:${puesta}`),
      "Soltar la reclamación no devolvió el `<head>` al estado de la ruta activa",
    );
    assert.equal(trasCerrar.every((h) => h.reclamaciones === 0), true, "Quedó una reclamación viva tras cerrar");

    assert.deepEqual(sesion.pageErrors, [], `Errores de página: ${JSON.stringify(sesion.pageErrors)}`);
    paso(`${escenarios.length + 1} · propiedad compartida: ${reclamadas.length} hojas reclamadas mientras vive el detalle, 0 al cerrarlo, y la ruta conserva las suyas`);
    await sesion.context.close();
  }

  /* =========================================================
     9 · Ida y vuelta en caliente, en un solo documento: abrir, cerrar, cambiar
     de ruta y volver a abrir desde OTRA entrada. Sin cambiar de ruta para que
     los estilos aparezcan: se mide donde el usuario abre.
  ========================================================= */
  {
    const sesion = await sesionNueva();
    const page = sesion.page;
    await page.goto(`${origin}${RUTA}/incidencias`, { waitUntil: "load" });
    await untilTrue(page, (sel) => Boolean(document.querySelector(sel)), { arg: FILA_INCIDENCIA, timeout: 20000, message: "La lista de Incidencias no pintó" });
    await abrir(page, FILA_INCIDENCIA, PANEL_INCIDENCIA);
    const referencia = await huella(page, PANEL_INCIDENCIA);
    await cerrar(page, PANEL_INCIDENCIA);

    const vueltas = [];
    for (const entrada of ["facturas", "home", "facturas"]) {
      if (entrada === "facturas") {
        await navegar(page, "/facturas", "[data-factura-id]");
        await abrir(page, ".facturas-incidencia-link", PANEL_INCIDENCIA);
      } else {
        await navegar(page, "", "[data-home-entity-source='home.activity']");
        await abrir(page, `[data-home-entity-source='home.activity'][data-entity-type='incidencia'][data-entity-id='${INCIDENCIA}']`, PANEL_INCIDENCIA);
      }
      const medida = await huella(page, PANEL_INCIDENCIA);
      const distintos = diferencias(referencia, medida);
      assert.deepEqual(distintos, [], `Vuelta ${vueltas.length + 1} desde ${entrada}: ${distintos.length} nodos pierden su presentación. Primero: ${distintos[0]}`);
      vueltas.push(entrada);
      await cerrar(page, PANEL_INCIDENCIA);
    }

    assert.equal(sesion.documents.length, 1, `La ida y vuelta cargó ${sesion.documents.length} documentos; debe bastar 1`);
    assert.deepEqual(sesion.pageErrors, [], `Errores de página: ${JSON.stringify(sesion.pageErrors)}`);
    paso(`${escenarios.length + 1} · ida y vuelta en caliente: ${vueltas.join(" → ")} idénticas en 1 solo documento`);
    await sesion.context.close();
  }

  /* =========================================================
     10 · Móvil emulado: la entrada crítica, en el otro tamaño real.
  ========================================================= */
  {
    const frio = await sesionNueva(MOVIL);
    await frio.page.goto(`${origin}${RUTA}/incidencias`, { waitUntil: "load" });
    await untilTrue(frio.page, (sel) => Boolean(document.querySelector(sel)), { arg: FILA_INCIDENCIA, timeout: 20000, message: "La lista de Incidencias no pintó en móvil" });
    await abrir(frio.page, FILA_INCIDENCIA, PANEL_INCIDENCIA);
    const referencia = await huella(frio.page, PANEL_INCIDENCIA);
    await frio.context.close();

    const caliente = await sesionNueva(MOVIL);
    const page = caliente.page;
    await page.goto(`${origin}${RUTA}/incidencias`, { waitUntil: "load" });
    await untilTrue(page, (sel) => Boolean(document.querySelector(sel)), { arg: FILA_INCIDENCIA, timeout: 20000, message: "La lista de Incidencias no pintó en móvil" });
    await abrir(page, FILA_INCIDENCIA, PANEL_INCIDENCIA);
    await cerrar(page, PANEL_INCIDENCIA);
    await navegar(page, "/facturas", "[data-factura-id]");
    await abrir(page, ".facturas-incidencia-link", PANEL_INCIDENCIA);
    const medida = await huella(page, PANEL_INCIDENCIA);
    const distintos = diferencias(referencia, medida);
    assert.deepEqual(distintos, [], `Móvil: ${distintos.length} nodos pierden su presentación. Primero: ${distintos[0]}`);
    assert.deepEqual(caliente.pageErrors, [], `Errores de página en móvil: ${JSON.stringify(caliente.pageErrors)}`);
    paso(`${escenarios.length + 1} · móvil ${MOVIL.width}×${MOVIL.height}: ${medida.length} nodos idénticos abriendo desde Facturas`);
    await caliente.context.close();
  }

  console.log(`Detail styles ownership contract: PASS · ${escenarios.length} escenarios · huella completa del panel, no presencia de <link>`);
  for (const linea of escenarios) console.log(`  ${linea}`);
} finally {
  await browser.close();
  await cerrarServidor();
}
