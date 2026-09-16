/* =========================================================
   Onion Support · Recorrido integrado de sesión SPA
   Archivo: /tools/spa-session-contract.mjs

   UNA SOLA SESIÓN, DIECISÉIS PASOS, NINGUNA RECARGA.

   Este contrato no comprueba piezas sueltas: abre la aplicación construida una
   vez y recorre lo que hace una persona —listar, abrir, leer, escribir un
   borrador, abrir una capa encima, cambiarla, cerrarla, dar de alta, cancelar,
   navegar a Facturas— sin volver a cargar el documento ni una sola vez. Lo que
   se rompió en la validación visual se rompió así: en continuidad, no en una
   pantalla recién cargada.

   Cada paso deja además su prueba NEGATIVA, que es la que evita la recaída:
     N1 · un clic sin identidad no resuelve a la primera incidencia
     N2 · cancelar un alta no deja bloqueada la siguiente
     N3 · no se reutiliza una instancia ni una señal ya abortada
     N4 · la fotografía vigente no se ignora al volver a abrir
     N5 · ningún token crudo del backend se lee en la lista
     N6 · el icono de una acción no desaparece
     N7 · no se pierde la posición de lectura ni el borrador

   Datos sintéticos, ninguna persona real, ninguna escritura de dominio.
========================================================= */

import assert from "node:assert/strict";

import { clickInPage, FOTO_A, FOTO_B, launchBrowser, openSpaSession, serveBuiltApp, untilTrue } from "./spa-session-harness.mjs";

const RUTA = "/@u-admin-1";
const FILA = "[data-ticket-row='true']";
const DETALLE = "#incidencias-detail-modal-panel";
const HERO = "[data-modal-hero='true'] [data-modal-avatar-frame='true']";
const CUERPO = ".ui-detail-modal-body";
const BORRADOR = "#incidencias-modal-comment-input";
const VISOR = "[data-incidencias-media-viewer='true']";
const ALTA = "#incidencias-create-modal-panel";
const VALORACIONES = "[data-fpc-retry-action='true']";

const pasos = [];
const paso = (numero, titulo) => pasos.push(`${String(numero).padStart(2, " ")} · ${titulo}`);

const { origin, close: cerrarServidor } = await serveBuiltApp({ spaFallback: true });
const browser = await launchBrowser();
const sesion = await openSpaSession(browser, origin, {
  fixtures: { "/@sintetico/adjunto-2.png": { delayMs: 120 } },
});
const page = sesion.page;
const detalleGet = () => sesion.calls.filter(({ method, path }) => method === "GET" && /^\/api\/tickets\/INC-/u.test(path));

try {
  /* 1 · La sesión arranca una sola vez. */
  await page.goto(`${origin}${RUTA}/incidencias`, { waitUntil: "load" });
  await page.waitForSelector(FILA);
  const filas = await page.locator(FILA).count();
  assert.equal(filas, 4, "La lista sintética debe traer sus cuatro incidencias");
  paso(1, `sesión iniciada en ${RUTA}/incidencias con ${filas} incidencias`);

  /* 2 · Zonas vacías: ni una sola apertura. (N1) */
  const puntos = await page.evaluate(() => {
    const region = document.querySelector(".incidencias-view-root, main.main-content") || document.body;
    const caja = region.getBoundingClientRect();
    const accionable = "a[href], button, input, select, textarea, summary, [role='button'], [role='link'], [tabindex]:not([tabindex='-1']), [data-ticket-row='true'], [data-incidencias-action], [data-detail-target='true']";
    const elegidos = [];
    for (let fila = 0; fila < 14; fila += 1) {
      for (let columna = 0; columna < 9; columna += 1) {
        const x = Math.round(caja.left + ((columna + 0.5) * caja.width) / 9);
        const y = Math.round(caja.top + ((fila + 0.5) * caja.height) / 14);
        if (x < 2 || y < 2 || x > innerWidth - 2 || y > innerHeight - 2) continue;
        const nodo = document.elementFromPoint(x, y);
        if (!nodo || nodo.closest(accionable)) continue;
        elegidos.push({ x, y, donde: `${nodo.tagName.toLowerCase()}.${String(nodo.className || "").split(" ")[0]}` });
      }
    }
    return elegidos.slice(0, 40);
  });
  assert.ok(puntos.length >= 12, `El barrido necesita zonas vacías reales: sólo ${puntos.length}`);
  const antesDelBarrido = detalleGet().length;
  for (const { x, y } of puntos) await page.mouse.click(x, y);
  await untilTrue(page, (selector) => !document.querySelector(selector), {
    arg: DETALLE, message: "Un clic en una zona vacía abrió un detalle",
  });
  assert.equal(
    detalleGet().length - antesDelBarrido, 0,
    `Clics sin identidad pidieron el detalle de ${JSON.stringify(detalleGet().slice(antesDelBarrido))}`
  );
  paso(2, `${puntos.length} zonas vacías pulsadas · 0 detalles abiertos · 0 peticiones de detalle (N1)`);

  /* 3 · La fila abre SU incidencia, no la primera de la lista. */
  const primera = await page.locator(FILA).first().getAttribute("data-ticket-id");
  await clickInPage(page, `${FILA}[data-ticket-id='INC-SINT-2']`);
  await page.waitForSelector(DETALLE);
  await untilTrue(page, () => Boolean(document.querySelector("[data-modal-hero='true']")), { message: "El detalle no llegó a pintarse" });
  const abierta = await page.evaluate(() => document.querySelector("#incidencias-modal-title")?.textContent?.trim() || "");
  assert.ok(abierta.includes("2"), `El detalle abierto no es el pulsado: ${JSON.stringify(abierta)}`);
  assert.notEqual(primera, "INC-SINT-2", "La fila elegida debe ser distinta de la primera de la lista");
  paso(3, `pulsada INC-SINT-2 (la primera de la lista es ${primera}) y se abre INC-SINT-2`);

  /* 4 · Avatar del titular sin fotografía: iniciales, nunca un círculo vacío. */
  const sinFoto = await page.evaluate((selector) => {
    const marco = document.querySelector(selector);
    const texto = marco?.textContent?.replace(/\s+/gu, " ").trim() || "";
    const pintado = [...(marco?.querySelectorAll("*") || [])].some((nodo) => (
      nodo.textContent.trim() && nodo.getBoundingClientRect().width > 0 && getComputedStyle(nodo).visibility !== "hidden"
    ));
    return { estado: marco?.dataset.avatarState || "", iniciales: marco?.dataset.avatarInitials || "", texto, pintado, src: marco?.querySelector("img")?.getAttribute("src") || null };
  }, HERO);
  assert.equal(sinFoto.estado, "fallback", "Sin fotografía el marco debe declararse en reserva");
  assert.equal(sinFoto.iniciales, "CS", "Las iniciales deben salir del nombre del titular");
  assert.equal(sinFoto.pintado, true, "Con un nombre válido no puede quedar un círculo vacío");
  assert.equal(sinFoto.src, null, "Sin fotografía no debe haber imagen que cargar");
  paso(4, `titular sin fotografía → iniciales ${sinFoto.iniciales} visibles, sin círculo vacío`);

  await page.keyboard.press("Escape");
  await page.waitForSelector(DETALLE, { state: "detached" });

  /* 5 · Etiquetas: la lista habla el idioma del producto. (N5) */
  const etiquetas = await page.evaluate((selector) => [...document.querySelectorAll(selector)].map((fila) => ({
    id: fila.dataset.ticketId,
    categoria: fila.querySelector(".incidencias-category-pill")?.textContent.trim() || "",
    textos: [...fila.querySelectorAll("span")].map((nodo) => nodo.textContent.trim()).filter(Boolean),
  })), FILA);
  /* Un token crudo es una de estas tres cosas, y ninguna es «un valor que la
     aplicación no declara»: el término inglés de un valor que SÍ tiene nombre en
     castellano, un identificador con guion bajo, o un slug en minúsculas. Que un
     valor desconocido se lea «Trivial» o «Chimney Sweeping» es lo correcto: se
     hace legible, no se traduce el dato de nadie. */
  const CON_NOMBRE_PROPIO = new Set([
    "technical", "billing", "access", "network", "documentation", "sales", "account",
    "open", "pending", "closed", "resolved", "in progress",
    "low", "medium", "high", "urgent", "critical", "normal",
  ]);
  const esCrudo = (texto) => (
    CON_NOMBRE_PROPIO.has(texto.toLowerCase())
    || /[a-z]_[a-z]/u.test(texto)
    || /^[a-záéíóúüñ]{4,}$/u.test(texto)
  );
  const crudos = etiquetas.flatMap(({ id, textos }) => textos.filter((texto) => texto.split(/\s+/u).length <= 3 && esCrudo(texto)).map((texto) => `${id}: ${texto}`));
  assert.deepEqual(crudos, [], `La lista enseña tokens del backend: ${JSON.stringify(crudos)}`);
  const porId = Object.fromEntries(etiquetas.map(({ id, categoria }) => [id, categoria]));
  assert.equal(porId["INC-SINT-1"], "Técnica");
  assert.equal(porId["INC-SINT-2"], "Facturación");
  assert.equal(porId["INC-SINT-3"], "Redes");
  assert.equal(porId["INC-SINT-4"], "Chimney Sweeping", "Un valor no declarado se lee, no se traduce ni se inventa");
  paso(5, `categorías ${JSON.stringify(porId)} · 0 tokens crudos (N5)`);

  /* 6 · La misma incidencia se lee igual en la lista y en el detalle. */
  await clickInPage(page, `${FILA}[data-ticket-id='INC-SINT-1']`);
  await page.waitForSelector(DETALLE);
  await untilTrue(page, () => Boolean(document.querySelector("[data-modal-header-chips='true']")), { message: "La cabecera del detalle no se pintó" });
  const chips = await page.evaluate(() => [...document.querySelectorAll("[data-modal-header-chips='true'] > *")].map((nodo) => nodo.textContent.replace(/\s+/gu, " ").trim()));
  assert.ok(chips.includes("Técnica"), `El detalle debe leer la misma categoría que la lista: ${JSON.stringify(chips)}`);
  paso(6, `lista y detalle coinciden en la categoría · chips ${JSON.stringify(chips)}`);

  /* 7 · Fotografía del titular: identidad y carga reales. */
  await untilTrue(page, (selector) => document.querySelector(selector)?.dataset.avatarState === "image", {
    arg: HERO, message: "La fotografía del titular no llegó a mostrarse",
  });
  const conFoto = await page.evaluate((selector) => {
    const marco = document.querySelector(selector);
    const imagen = marco?.querySelector("img");
    return { estado: marco?.dataset.avatarState, iniciales: marco?.dataset.avatarInitials, src: imagen?.getAttribute("src"), cargada: Boolean(imagen?.complete && imagen.naturalWidth > 0), visible: getComputedStyle(imagen).display !== "none" };
  }, HERO);
  assert.equal(conFoto.estado, "image");
  assert.equal(conFoto.src, FOTO_A, "El detalle debe pintar la fotografía del titular de ESA incidencia");
  assert.equal(conFoto.cargada, true, "La imagen del avatar debe llegar a cargarse");
  assert.equal(conFoto.visible, true, "Un envoltorio no puede ocultar la imagen del marco que sí la tiene");
  paso(7, `fotografía del titular cargada (${conFoto.src}) e identidad ${conFoto.iniciales}`);

  /* 8 · Borrador y posición de lectura. */
  const texto = "Borrador sintético que no debe perderse.";
  await page.locator(BORRADOR).fill(texto);
  const lectura = await page.evaluate((selector) => {
    const cuerpo = document.querySelector(selector);
    cuerpo.scrollTop = Math.floor((cuerpo.scrollHeight - cuerpo.clientHeight) * 0.6);
    return cuerpo.scrollTop;
  }, CUERPO);
  assert.ok(lectura > 0, "El cuerpo del detalle debe poder desplazarse para que la prueba signifique algo");
  paso(8, `borrador escrito y posición de lectura fijada en ${lectura} px`);

  /* 9 · Capa superior encima del detalle. */
  await clickInPage(page, "[data-detail-action='detail-attachment-open']");
  await page.waitForSelector(VISOR);
  const aislado = await page.evaluate((selector) => {
    const panel = document.querySelector(selector);
    return { inert: panel?.hasAttribute("inert"), ariaHidden: panel?.getAttribute("aria-hidden") };
  }, DETALLE);
  assert.equal(aislado.inert, true, "Con la capa abierta el detalle queda aislado");
  assert.equal(aislado.ariaHidden, "true", "Con la capa abierta el detalle queda fuera del árbol accesible");
  paso(9, "capa superior abierta sobre el detalle, que queda aislado");

  /* 10 · Cambiar el contenido de la capa NO es cerrarla y volver a abrirla. */
  const antesDelCambio = await page.evaluate((selector) => document.querySelector(selector)?.dataset.mediaViewerFile || document.querySelector(`${selector} img`)?.getAttribute("src") || "", VISOR);
  await clickInPage(page, `${VISOR} [data-media-gallery-action='next']`);
  await untilTrue(page, ({ selector, previo }) => {
    const actual = document.querySelector(selector)?.dataset.mediaViewerFile || document.querySelector(`${selector} img`)?.getAttribute("src") || "";
    return Boolean(actual) && actual !== previo;
  }, { arg: { selector: VISOR, previo: antesDelCambio }, message: "El contenido de la capa no llegó a cambiar" });
  assert.equal(await page.locator(VISOR).count(), 1, "Cambiar de archivo no puede reabrir la capa");
  paso(10, "contenido de la capa cambiado sin cerrarla ni reabrirla");

  /* 11 · Cerrar la capa devuelve el detalle intacto. (N7) */
  await page.keyboard.press("Escape");
  await page.waitForSelector(VISOR, { state: "detached" });
  await untilTrue(page, (selector) => !document.querySelector(selector)?.hasAttribute("inert"), {
    arg: DETALLE, message: "Cerrar la capa no liberó el aislamiento del detalle",
  });
  const conservado = await page.evaluate(({ cuerpo, borrador }) => ({
    lectura: document.querySelector(cuerpo)?.scrollTop,
    texto: document.querySelector(borrador)?.value,
    foco: Boolean(document.activeElement?.closest("#incidencias-detail-modal-panel")),
  }), { cuerpo: CUERPO, borrador: BORRADOR });
  assert.equal(conservado.lectura, lectura, `La posición de lectura cambió de ${lectura} a ${conservado.lectura}`);
  assert.equal(conservado.texto, texto, "El borrador debe sobrevivir a la capa superior");
  assert.equal(conservado.foco, true, "El foco vuelve al detalle que abrió la capa");
  paso(11, `capa cerrada · lectura ${conservado.lectura} px y borrador intactos (N7)`);

  /* 12 · Cerrar el detalle: un borrador vivo se defiende antes de perderse. */
  await page.keyboard.press("Escape");
  await page.waitForSelector("[data-detail-close-confirm-dialog='true']");
  assert.equal(await page.locator(DETALLE).count(), 1, "La confirmación no cierra el detalle por su cuenta");
  await clickInPage(page, "[data-detail-action='detail-discard-close-confirm']");
  await page.waitForSelector(DETALLE, { state: "detached" });
  paso(12, "el borrador pide confirmación antes de perderse y el detalle cierra sin recargar");

  /* 13 · «Nueva incidencia» abre, cancela y VUELVE A ABRIR. (N2)
     Aquí se pulsa con el ratón de verdad, no con `element.click()`: el bloqueo
     que sufrió una persona era una capa invisible sobre el botón, y un clic
     sintético la habría atravesado sin enterarse. */
  for (const intento of [1, 2, 3]) {
    const alcanzable = await page.evaluate(() => {
      const boton = document.querySelector("[data-incidencias-action='create-open']");
      if (!boton) return { existe: false };
      const caja = boton.getBoundingClientRect();
      const encima = document.elementFromPoint(Math.round(caja.left + caja.width / 2), Math.round(caja.top + caja.height / 2));
      const tapado = Boolean(encima) && encima !== boton && !boton.contains(encima);
      return {
        existe: true, tapado,
        quien: tapado ? `${encima.tagName.toLowerCase()}.${String(encima.className || "").split(" ")[0]}` : "",
        inerte: Boolean(boton.closest("[inert]")),
        oculto: Boolean(boton.closest("[aria-hidden='true']")),
        deshabilitado: boton.hasAttribute("disabled") || boton.getAttribute("aria-disabled") === "true",
      };
    });
    assert.equal(alcanzable.existe, true, `Intento ${intento}: el botón de alta desapareció`);
    assert.equal(alcanzable.tapado, false, `Intento ${intento}: una capa invisible (${alcanzable.quien}) cubre «Nueva incidencia»`);
    assert.equal(alcanzable.inerte, false, `Intento ${intento}: «Nueva incidencia» quedó dentro de una zona inerte`);
    assert.equal(alcanzable.oculto, false, `Intento ${intento}: «Nueva incidencia» quedó fuera del árbol accesible`);
    assert.equal(alcanzable.deshabilitado, false, `Intento ${intento}: «Nueva incidencia» quedó deshabilitado`);

    await page.locator("[data-incidencias-action='create-open']").first().click({ timeout: 5000 });
    await untilTrue(page, (selector) => Boolean(document.querySelector(selector)), {
      arg: ALTA, timeout: 10000,
      message: `Intento ${intento}: «Nueva incidencia» no abrió; la única salida no puede ser recargar la página`,
    });
    await page.keyboard.press("Escape");
    await untilTrue(page, (selector) => !document.querySelector(selector), {
      arg: ALTA, timeout: 10000, message: `Intento ${intento}: el alta no llegó a cerrarse`,
    });
  }
  const escriturasDeDominio = sesion.writes.filter(({ path }) => !path.startsWith("/api/auth/"));
  assert.deepEqual(escriturasDeDominio, [], `Abrir el alta no puede escribir nada: ${JSON.stringify(escriturasDeDominio)}`);
  paso(13, "«Nueva incidencia» abierta y cancelada 3 veces seguidas sin recarga y sin escribir (N2)");

  /* 14 · Tras cancelar, el detalle sigue funcionando: nada aborta lo siguiente. (N3) */
  const antesDeReabrir = detalleGet().length;
  await clickInPage(page, `${FILA}[data-ticket-id='INC-SINT-3']`);
  await page.waitForSelector(DETALLE);
  await untilTrue(page, () => Boolean(document.querySelector("#incidencias-modal-title")?.textContent?.includes("3")), {
    message: "El detalle abierto tras cancelar el alta no llegó a su contenido",
  });
  assert.ok(detalleGet().length > antesDeReabrir, "El detalle debe volver a pedir su lectura autoritativa");
  await page.keyboard.press("Escape");
  await page.waitForSelector(DETALLE, { state: "detached" });
  paso(14, "tras cancelar el alta el detalle vuelve a abrirse y a leer (N3)");

  /* 15 · La fotografía vigente llega al detalle. (N4) */
  sesion.world.tickets[0].avatarUrl = FOTO_B;
  sesion.world.titular.avatarUrl = FOTO_B;
  await clickInPage(page, `${FILA}[data-ticket-id='INC-SINT-1']`);
  await page.waitForSelector(DETALLE);
  await untilTrue(page, (selector) => document.querySelector(selector)?.dataset.avatarState === "image", {
    arg: HERO, message: "La fotografía actualizada no llegó a mostrarse",
  });
  const vigente = await page.evaluate((selector) => document.querySelector(selector)?.querySelector("img")?.getAttribute("src"), HERO);
  assert.equal(vigente, FOTO_B, "El detalle debe pintar la fotografía vigente, no la anterior");
  await page.keyboard.press("Escape");
  await page.waitForSelector(DETALLE, { state: "detached" });
  paso(15, `fotografía actualizada visible en el detalle (${vigente}) (N4)`);

  /* 16 · Facturas por el router: el botón de valoraciones lleva su icono. (N6) */
  await clickInPage(page, `a[href='${RUTA}/facturas']`);
  await page.waitForSelector("[data-factura-id]");
  await clickInPage(page, "[data-factura-id='F-SINT-2']");
  await page.waitForSelector(VALORACIONES, { timeout: 15000 });
  const boton = await page.evaluate((selector) => {
    const nodo = document.querySelector(selector);
    const svg = nodo.querySelector("svg");
    const trazo = svg?.querySelector("path, circle, rect, line, polyline, polygon");
    const estilo = trazo ? getComputedStyle(trazo) : null;
    const caja = svg?.getBoundingClientRect();
    return {
      texto: nodo.textContent.replace(/\s+/gu, " ").trim(),
      aria: nodo.getAttribute("aria-label"),
      tipo: nodo.getAttribute("type"),
      ancho: caja ? Math.round(caja.width) : 0,
      alto: caja ? Math.round(caja.height) : 0,
      stroke: estilo?.stroke || "",
      grosor: estilo?.strokeWidth || "",
    };
  }, VALORACIONES);
  assert.equal(boton.texto, "Valoraciones");
  assert.equal(boton.aria, "Consultar valoraciones", "El nombre accesible debe acompañar a la etiqueta");
  assert.equal(boton.tipo, "button", "Una acción del pie no puede enviar un formulario");
  assert.ok(boton.ancho === 16 && boton.alto === 16, `El icono debe medir lo mismo que sus vecinos: ${boton.ancho}×${boton.alto}`);
  assert.notEqual(boton.stroke, "none", "Un SVG sin trazo es un hueco: el icono no se ve (N6)");
  assert.equal(boton.grosor, "2px", "El grosor debe ser el de los demás iconos del pie");
  paso(16, `botón «Valoraciones» con icono ${boton.ancho}×${boton.alto}, trazo ${boton.stroke} (N6)`);

  /* Invariantes de toda la sesión. */
  assert.equal(sesion.loads.length, 1, `La sesión cargó el documento ${sesion.loads.length} veces: no debe recargarse nunca`);
  assert.equal(sesion.documents.length, 1, `Se pidieron ${sesion.documents.length} documentos: ${JSON.stringify(sesion.documents)}`);
  assert.deepEqual(sesion.offOrigin, [], `La sesión salió a la red: ${JSON.stringify(sesion.offOrigin)}`);
  assert.deepEqual(sesion.pageErrors, [], `La sesión dejó errores de página: ${JSON.stringify(sesion.pageErrors)}`);
  assert.deepEqual(sesion.uncovered, [], `Hay llamadas que el arnés no reproduce: ${JSON.stringify(sesion.uncovered)}`);
  assert.deepEqual(
    sesion.writes.filter(({ path }) => !path.startsWith("/api/auth/")), [],
    "El recorrido completo no escribe en ningún dominio"
  );

  console.log("SPA session contract: PASS · 16 pasos en una sola sesión · 7 negativas");
  for (const linea of pasos) console.log(`  ${linea}`);
  console.log(`  invariantes · 1 documento · ${sesion.calls.length} llamadas a la API · 0 fuera de origen · 0 errores · 0 escrituras de dominio`);
} finally {
  await browser.close();
  await cerrarServidor();
}
