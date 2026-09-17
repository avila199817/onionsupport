/* =========================================================
   Onion Support · Recorrido integrado de sesión SPA
   Archivo: /tools/spa-session-contract.mjs

   DIECISÉIS PASOS, UNA SOLA SESIÓN, NINGUNA RECARGA.

   No comprueba piezas sueltas: abre la aplicación construida y recorre lo que
   hace una persona, en continuidad, porque en continuidad es donde se rompió.
   Se ejecuta dos veces --escritorio y emulación móvil-- y además con entradas
   EN FRÍO que no pasan antes por Incidencias, para que ningún paso dependa de
   un orden afortunado.

   Negativas que acompañan al recorrido. Una negativa sólo cuenta si se ha
   comprobado que RETIRAR la corrección la hace fallar; se declara aquí si
   reproduce un defecto que existió o si es una guarda verificada por mutación:
     N1 · un clic sin identidad no resuelve al primer registro     [defecto]
     N2 · cancelar un alta no deja bloqueada la siguiente          [defecto]
     N3 · una carga abortada no impide ni contamina la siguiente   [guarda]
     N4 · la fotografía vigente no se ignora                       [defecto]
     N5 · ningún código del backend se lee como etiqueta           [defecto]
     N6 · el icono de una acción no desaparece                     [defecto]
     N7 · no se pierden la posición de lectura ni el borrador      [guarda]

   N3 es una GUARDA, no la reproducción de un defecto observado: no encontré
   ningún camino en el que la aplicación reutilice hoy una lectura abortada.
   La mutación que la hace fallar son las dos condiciones que lo impiden, a la
   vez: que la hidratación del detalle lea siempre forzada
   (incidencias.detail-integrity.js) y que el vuelo compartido se retire
   también cuando la lectura es rechazada (incidencias.api.js). Con las dos
   retiradas, reabrir la ficha abortada no vuelve a leer y no se pinta. Tres
   mutaciones más resultaron inertes y su razón está medida en el informe:
   reutilizar un único AbortController (cada apertura estrena controlador),
   compartir la tarea en vuelo del implementation y dejar de limpiar el vuelo
   rechazado por separado (la lectura de la UI va siempre forzada).

   Datos sintéticos. Ninguna persona real, ninguna escritura de dominio.
========================================================= */

import assert from "node:assert/strict";

import {
  clickInPage, DETAIL_HYDRATION_MARK, FOTO_A, FOTO_B, launchBrowser, openSpaSession,
  PNG_1X1, serveBuiltApp, syntheticWorld, untilTrue,
} from "./spa-session-harness.mjs";

const RUTA = "/@u-admin-1";
const FILA = "[data-ticket-row='true']";
const DETALLE = "#incidencias-detail-modal-panel";
const HERO = "[data-modal-hero='true'] [data-modal-avatar-frame='true']";
const CUERPO = ".ui-detail-modal-body";
const BORRADOR = "#incidencias-modal-comment-input";
const VISOR = "[data-incidencias-media-viewer='true']";
const ALTA = "#incidencias-create-modal-panel";
const TECNICO = "[data-technician-profile-trigger='true'], [data-modal-technician='true']";
const PERFIL_TECNICO = "#incidencias-technician-profile-panel";
const VALORACIONES = "[data-fpc-retry-action='true']";

const ENTORNOS = [
  { nombre: "escritorio", viewport: { width: 1440, height: 900 } },
  { nombre: "móvil", viewport: { width: 390, height: 844 }, movil: true },
];

/* El mundo del recorrido: el usuario conectado es también titular y cliente,
   que es el caso en el que su fotografía vive dentro de documentos ajenos. */
function mundo() {
  const world = syntheticWorld();
  const yo = { ...world.conectado, email: "admin@example.test", avatarUrl: FOTO_A, hasAvatar: true };
  world.conectado = yo;
  world.tickets = world.tickets.map((t, i) => (i === 0
    ? { ...t, userId: yo.userId, clientId: yo.userId, fullName: yo.name, name: yo.name, email: yo.email, avatarUrl: FOTO_A, hasAvatar: true }
    : t));
  world.facturas = world.facturas.map((f) => ({
    ...f,
    clienteId: yo.userId, userId: yo.userId, clienteEmail: yo.email, clienteAvatar: FOTO_A,
    clienteNombre: "SOCIEDAD SINTÉTICA SL", nombreFiscal: "SOCIEDAD SINTÉTICA SL", razonSocial: "SOCIEDAD SINTÉTICA SL",
    cliente: { id: yo.userId, userId: yo.userId, nombre: "SOCIEDAD SINTÉTICA SL", razonSocial: "SOCIEDAD SINTÉTICA SL", email: yo.email, avatarUrl: FOTO_A },
  }));
  /* Reservadas para los pasos de aborto y de respuestas fuera de orden: una
     carrera sólo existe si la lectura sale de verdad a la red. Reutilizar una
     incidencia ya abierta la sirve la caché y no se prueba nada. */
  const base = world.tickets[0];
  for (const n of [5, 6, 7, 8]) {
    world.tickets.push({
      ...base, id: `INC-SINT-${n}`, ticketId: `INC-SINT-${n}`,
      subject: `Incidencia sintética ${n}`, description: `Descripción sintética ${n}.`,
      attachments: [], category: "software", status: "open", priority: "medium",
    });
  }
  return world;
}

const espera = (ms) => new Promise((sigue) => setTimeout(sigue, ms));

async function recorrer(entorno) {
  const pasos = [];
  const paso = (n, texto) => pasos.push(`${String(n).padStart(2, " ")} · ${texto}`);
  const world = mundo();
  const retrasos = new Map();
  let confirmada = FOTO_A;

  const { origin, close: cerrarServidor } = await serveBuiltApp({ spaFallback: true });
  const browser = await launchBrowser();
  const sesion = await openSpaSession(browser, origin, {
    world,
    viewport: entorno.viewport,
    api: async ({ method, path, respond, world: w }) => {
      const retraso = retrasos.get(path);
      if (retraso) { retrasos.delete(path); await espera(retraso); }
      if (path !== "/api/users/avatar") return false;
      confirmada = method === "DELETE" ? "" : FOTO_B;
      const usuario = { ...w.conectado, avatarUrl: confirmada, avatar: confirmada, photoUrl: confirmada, hasAvatar: Boolean(confirmada) };
      w.conectado = usuario;
      await respond({ ok: true, success: true, user: usuario, data: usuario, ...usuario });
      return true;
    },
  });
  const page = sesion.page;
  const detalleGet = () => sesion.calls.filter(({ method, path }) => method === "GET" && /^\/api\/tickets\/INC-/u.test(path));
  const escrituras = () => sesion.writes.filter(({ path }) => !path.startsWith("/api/auth/") && path !== "/api/users/avatar");
  const abrirFila = async (id) => {
    await clickInPage(page, `${FILA}[data-ticket-id='${id}']`);
    await page.waitForSelector(DETALLE);
    await untilTrue(page, () => Boolean(document.querySelector("[data-modal-hero='true']")), { message: `el detalle ${id} no se pintó` });
  };
  const cerrar = async (selector) => {
    await page.keyboard.press("Escape");
    await page.waitForSelector(selector, { state: "detached" });
  };
  const marco = () => page.evaluate((sel) => {
    const host = document.querySelector(sel);
    if (!host) return null;
    return { estado: host.dataset.avatarState || null, identidad: host.dataset.avatarIdentity || null, src: host.querySelector("img")?.getAttribute("src") || null };
  }, HERO);

  try {
    /* 1 · Arranque en frío. */
    await page.goto(`${origin}${RUTA}/incidencias`, { waitUntil: "load" });
    await page.waitForSelector(FILA);
    assert.equal(await page.locator(FILA).count(), 8, "La lista sintética trae sus ocho incidencias");
    paso(1, `arranque en frío en ${RUTA}/incidencias`);

    /* 2 · Zonas sin identidad ni acción: ningún detalle. (N1) */
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
          elegidos.push({ x, y });
        }
      }
      return elegidos.slice(0, 40);
    });
    assert.ok(puntos.length >= 8, `El barrido necesita zonas vacías reales: sólo ${puntos.length}`);
    const antesDelBarrido = detalleGet().length;
    for (const { x, y } of puntos) await page.mouse.click(x, y);
    await untilTrue(page, (sel) => !document.querySelector(sel), { arg: DETALLE, message: "Un clic en una zona vacía abrió un detalle" });
    assert.equal(detalleGet().length - antesDelBarrido, 0, `Clics sin identidad pidieron ${JSON.stringify(detalleGet().slice(antesDelBarrido))}`);
    paso(2, `${puntos.length} zonas vacías pulsadas · 0 aperturas · 0 peticiones (N1)`);

    /* 3 · La fila abre SU incidencia, no la primera. */
    const primera = await page.locator(FILA).first().getAttribute("data-ticket-id");
    await abrirFila("INC-SINT-1");
    const titulo = await page.evaluate(() => document.querySelector("#incidencias-modal-title")?.textContent?.trim() || "");
    assert.ok(titulo.includes("1"), `El detalle abierto no es el pulsado: ${JSON.stringify(titulo)}`);
    assert.notEqual(primera, "INC-SINT-1", "La fila elegida debe ser distinta de la primera pintada");
    paso(3, `pulsada INC-SINT-1 (la primera pintada es ${primera}) y abre la suya`);

    /* 4 · Cambios pendientes: el borrador y la posición de lectura. */
    const texto = "Borrador sintético que no debe perderse.";
    await page.locator(BORRADOR).fill(texto);
    const lectura = await page.evaluate((sel) => {
      const cuerpo = document.querySelector(sel);
      cuerpo.scrollTop = Math.floor((cuerpo.scrollHeight - cuerpo.clientHeight) * 0.6);
      return cuerpo.scrollTop;
    }, CUERPO);
    assert.ok(lectura > 0, "El cuerpo del detalle debe poder desplazarse");
    paso(4, `borrador escrito y lectura fijada en ${lectura} px`);

    /* 5 · Visor: abrir, cambiar contenido, cerrar; lectura y borrador intactos. (N7) */
    await clickInPage(page, "[data-detail-action='detail-attachment-open']");
    await page.waitForSelector(VISOR);
    const aislado = await page.evaluate((sel) => ({ inert: document.querySelector(sel)?.hasAttribute("inert"), oculto: document.querySelector(sel)?.getAttribute("aria-hidden") }), DETALLE);
    assert.equal(aislado.inert, true, "Con la capa abierta el detalle queda aislado");
    assert.equal(aislado.oculto, "true", "Con la capa abierta el detalle sale del árbol accesible");
    const antesDelCambio = await page.evaluate((sel) => document.querySelector(`${sel} img`)?.getAttribute("src") || "", VISOR);
    await clickInPage(page, `${VISOR} [data-media-gallery-action='next']`);
    await untilTrue(page, ({ sel, previo }) => {
      const actual = document.querySelector(`${sel} img`)?.getAttribute("src") || "";
      return Boolean(actual) && actual !== previo;
    }, { arg: { sel: VISOR, previo: antesDelCambio }, message: "El contenido de la capa no cambió" });
    assert.equal(await page.locator(VISOR).count(), 1, "Cambiar de archivo no reabre la capa");
    await cerrar(VISOR);
    await untilTrue(page, (sel) => !document.querySelector(sel)?.hasAttribute("inert"), { arg: DETALLE, message: "Cerrar la capa no liberó el aislamiento" });
    const conservado = await page.evaluate(({ cuerpo, borrador }) => ({
      lectura: document.querySelector(cuerpo)?.scrollTop,
      texto: document.querySelector(borrador)?.value,
      foco: Boolean(document.activeElement?.closest("#incidencias-detail-modal-panel")),
    }), { cuerpo: CUERPO, borrador: BORRADOR });
    assert.equal(conservado.lectura, lectura, `La lectura cambió de ${lectura} a ${conservado.lectura}`);
    assert.equal(conservado.texto, texto, "El borrador debe sobrevivir a la capa superior");
    assert.equal(conservado.foco, true, "El foco vuelve al detalle que abrió la capa");
    paso(5, `visor abierto, contenido cambiado y cerrado · lectura ${conservado.lectura} px y borrador intactos (N7)`);

    /* 6 · Perfil del técnico: apertura y retorno sin perder lo de debajo. */
    const hayTecnico = await page.locator(TECNICO).count();
    assert.ok(hayTecnico > 0, "La incidencia sintética tiene técnico asignado y su tarjeta debe existir");
    await clickInPage(page, TECNICO);
    await page.waitForSelector(PERFIL_TECNICO, { timeout: 15000 });
    await cerrar(PERFIL_TECNICO);
    const trasTecnico = await page.evaluate(({ cuerpo, borrador }) => ({
      lectura: document.querySelector(cuerpo)?.scrollTop,
      texto: document.querySelector(borrador)?.value,
    }), { cuerpo: CUERPO, borrador: BORRADOR });
    assert.equal(trasTecnico.lectura, lectura, "El perfil del técnico no mueve la lectura del detalle");
    assert.equal(trasTecnico.texto, texto, "El perfil del técnico no se lleva el borrador");
    paso(6, "perfil del técnico abierto y cerrado · lectura y borrador intactos");

    /* Cerrar el detalle: un borrador vivo se defiende antes de perderse. */
    await page.keyboard.press("Escape");
    await page.waitForSelector("[data-detail-close-confirm-dialog='true']");
    assert.equal(await page.locator(DETALLE).count(), 1, "La confirmación no cierra el detalle por su cuenta");
    await clickInPage(page, "[data-detail-action='detail-discard-close-confirm']");
    await page.waitForSelector(DETALLE, { state: "detached" });

    /* 7 · Nueva incidencia: abrir, cancelar y volver a abrir. (N2) */
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
          deshabilitado: boton.hasAttribute("disabled") || boton.getAttribute("aria-disabled") === "true",
        };
      });
      assert.equal(alcanzable.existe, true, `Intento ${intento}: el botón de alta desapareció`);
      assert.equal(alcanzable.tapado, false, `Intento ${intento}: una capa invisible (${alcanzable.quien}) cubre «Nueva incidencia»`);
      assert.equal(alcanzable.inerte, false, `Intento ${intento}: «Nueva incidencia» quedó en una zona inerte`);
      assert.equal(alcanzable.deshabilitado, false, `Intento ${intento}: «Nueva incidencia» quedó deshabilitado`);
      await page.locator("[data-incidencias-action='create-open']").first().click({ timeout: 5000 });
      await untilTrue(page, (sel) => Boolean(document.querySelector(sel)), { arg: ALTA, timeout: 10000, message: `Intento ${intento}: «Nueva incidencia» no abrió; recargar no es una solución` });
      await page.keyboard.press("Escape");
      await untilTrue(page, (sel) => !document.querySelector(sel), { arg: ALTA, timeout: 10000, message: `Intento ${intento}: el alta no se cerró` });
    }
    assert.deepEqual(escrituras(), [], `Abrir el alta no escribe nada: ${JSON.stringify(escrituras())}`);
    paso(7, "alta abierta y cancelada 3 veces sin recarga y sin escribir (N2)");

    /* 8 · Cambio de ruta y regreso. */
    await clickInPage(page, `a[href='${RUTA}/facturas']`);
    await page.waitForSelector("[data-factura-id]", { timeout: 15000 });
    await clickInPage(page, `a[href='${RUTA}/incidencias']`);
    await page.waitForSelector(FILA, { timeout: 15000 });
    paso(8, "ida y vuelta entre rutas por el router, sin recargar");

    /* 9 · Carga abortada y nueva apertura. (N3)

       Se reabre LA MISMA incidencia abortada, no otra: el vuelo compartido de
       lecturas de detalle está indexado por identificador, así que sólo ahí
       puede quedar envenenado por un aborto. Reabrir otra ficha comprobaría
       una llave distinta y no probaría nada sobre la abortada. */
    retrasos.set("/api/tickets/INC-SINT-5", 2500);
    const gets5 = () => detalleGet().filter(({ path }) => path.endsWith("INC-SINT-5")).length;
    const antesDeAbortar = gets5();
    await clickInPage(page, `${FILA}[data-ticket-id='INC-SINT-5']`);
    await page.waitForSelector(DETALLE, { timeout: 15000 });
    await page.keyboard.press("Escape");
    await page.waitForSelector(DETALLE, { state: "detached", timeout: 15000 });
    await abrirFila("INC-SINT-5");
    /* No basta con que se pinte: el modal ya sabe pintarse con lo que traía la
       fila. Lo que demuestra que la lectura NUEVA ha terminado con una señal
       propia es su hidratación, que sólo viene en la respuesta del detalle. */
    await untilTrue(page, (marca) => (
      (document.querySelector("#incidencias-detail-modal-panel")?.textContent || "").includes(`${marca} INC-SINT-5.`)
    ), { arg: DETAIL_HYDRATION_MARK, timeout: 15000, message: "Tras abortar su carga, reabrir la misma incidencia no llegó a hidratarse: se reutilizó una lectura abortada" });
    assert.ok(gets5() > antesDeAbortar + 1, "La reapertura hace su propia lectura autoritativa, no hereda la abortada");
    await cerrar(DETALLE);

    /* Y la respuesta tardía de la abortada no puede aterrizar en otra ficha. */
    await abrirFila("INC-SINT-6");
    await untilTrue(page, (marca) => (
      (document.querySelector("#incidencias-detail-modal-panel")?.textContent || "").includes(`${marca} INC-SINT-6.`)
    ), { arg: DETAIL_HYDRATION_MARK, timeout: 15000, message: "La apertura siguiente no llegó a hidratarse" });
    const cuerpoTras = await page.evaluate(() => document.querySelector("#incidencias-detail-modal-panel")?.textContent || "");
    assert.equal(cuerpoTras.includes(`${DETAIL_HYDRATION_MARK} INC-SINT-5.`), false, "La respuesta tardía de la anterior no puede pintarse en la nueva");
    await cerrar(DETALLE);
    paso(9, "carga abortada · la misma ficha se reabre con lectura propia y la respuesta tardía no contamina a otra (N3)");

    /* 12 · Cambio entre entidades con respuestas fuera de orden. */
    retrasos.set("/api/tickets/INC-SINT-7", 2000);
    await clickInPage(page, `${FILA}[data-ticket-id='INC-SINT-7']`);
    await page.waitForSelector(DETALLE, { timeout: 15000 });
    await page.keyboard.press("Escape");
    await page.waitForSelector(DETALLE, { state: "detached", timeout: 15000 });
    await abrirFila("INC-SINT-8");
    await espera(2600); // la respuesta de la primera llega ahora, fuera de orden
    const fueraDeOrden = await page.evaluate(() => ({
      titulo: document.querySelector("#incidencias-modal-title")?.textContent?.trim() || "",
      cuerpo: document.querySelector("#incidencias-detail-modal-panel")?.textContent || "",
    }));
    assert.ok(fueraDeOrden.titulo.includes("8"), `Una respuesta fuera de orden cambió el detalle: ${JSON.stringify(fueraDeOrden.titulo)}`);
    assert.equal(fueraDeOrden.cuerpo.includes(`${DETAIL_HYDRATION_MARK} INC-SINT-7.`), false, "La hidratación de la entidad anterior no puede aterrizar en la abierta");
    await cerrar(DETALLE);
    paso(12, "respuesta fuera de orden descartada: manda la entidad abierta");

    /* 13 · Etiquetas: conocidas en castellano, desconocidas nombradas. (N5) */
    const etiquetas = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((fila) => ({
      id: fila.dataset.ticketId,
      categoria: fila.querySelector(".incidencias-category-pill")?.textContent.trim() || "",
      textos: [...fila.querySelectorAll("span")].map((n) => n.textContent.trim()).filter(Boolean),
    })), FILA);
    const CON_NOMBRE_PROPIO = new Set(["technical", "billing", "access", "network", "documentation", "sales", "account",
      "open", "pending", "closed", "resolved", "in progress", "low", "medium", "high", "urgent", "critical", "normal"]);
    const esCrudo = (t) => CON_NOMBRE_PROPIO.has(t.toLowerCase()) || /[a-z]_[a-z]/u.test(t) || /^[a-záéíóúüñ]{4,}$/u.test(t);
    const crudos = etiquetas.flatMap(({ id, textos }) => textos.filter((t) => t.split(/\s+/u).length <= 3 && esCrudo(t)).map((t) => `${id}: ${t}`));
    assert.deepEqual(crudos, [], `La lista enseña códigos del backend: ${JSON.stringify(crudos)}`);
    const porId = Object.fromEntries(etiquetas.map(({ id, categoria }) => [id, categoria]));
    assert.equal(porId["INC-SINT-1"], "Técnica");
    assert.equal(porId["INC-SINT-2"], "Facturación");
    assert.equal(porId["INC-SINT-3"], "Redes");
    assert.equal(porId["INC-SINT-4"], "Tipo no reconocido", "Un código no declarado se nombra, no se capitaliza");
    paso(13, `categorías ${JSON.stringify(porId)} · 0 códigos crudos (N5)`);

    /* 10-11 · Fotografía confirmada por el flujo real y superficies autorizadas. (N4) */
    await clickInPage(page, `a[href='${RUTA}/cuenta']`);
    await page.waitForSelector("input[type='file'][data-cuenta-field='avatar']", { timeout: 15000 });
    await page.setInputFiles("input[type='file'][data-cuenta-field='avatar']", { name: "retrato.png", mimeType: "image/png", buffer: PNG_1X1 });
    await untilTrue(page, () => /actualizada/iu.test(document.body.textContent || ""), { timeout: 15000, message: "El servidor no confirmó la fotografía" });
    assert.equal(confirmada, FOTO_B, "El servidor confirma la nueva fotografía");
    paso(10, "fotografía subida por el input real y confirmada");

    await clickInPage(page, `a[href='${RUTA}/incidencias']`);
    await page.waitForSelector(FILA, { timeout: 15000 });
    await untilTrue(page, (sel) => document.querySelector(sel)?.querySelector("img")?.getAttribute("src") === "/@sintetico/retrato-b.png", {
      arg: "[data-ticket-id='INC-SINT-1'] [data-avatar-host='true']", timeout: 15000, message: "La fila no recogió la fotografía vigente",
    });
    await abrirFila("INC-SINT-1");
    const conFoto = await marco();
    assert.equal(conFoto.src, FOTO_B, "El detalle pinta la fotografía vigente (N4)");
    await cerrar(DETALLE);
    paso(11, `fila y detalle con la fotografía vigente · identidad ${conFoto.identidad} (N4)`);

    /* 14 · Factura histórica: foto vigente, documento intacto, cero escrituras. */
    await clickInPage(page, `a[href='${RUTA}/facturas']`);
    await page.waitForSelector("[data-factura-id]", { timeout: 15000 });
    await clickInPage(page, "[data-factura-id='F-SINT-2']");
    await page.waitForSelector("[data-facturas-detail-modal='true']", { timeout: 15000 });
    const factura = await page.evaluate(() => {
      const host = document.querySelector("[data-facturas-detail-modal='true'] [data-modal-avatar-frame='true']");
      const texto = document.querySelector("[data-facturas-detail-modal='true']")?.textContent?.replace(/\s+/gu, " ") || "";
      return {
        src: host?.querySelector("img")?.getAttribute("src") || null,
        iniciales: host?.dataset.avatarInitials || null,
        razonSocial: texto.includes("SOCIEDAD SINTÉTICA SL"),
        total: texto.includes("48,40"),
      };
    });
    assert.equal(factura.src, FOTO_B, "La factura muestra la fotografía vigente del cliente");
    assert.equal(factura.iniciales, "SS", "Las iniciales siguen saliendo del nombre fiscal");
    assert.equal(factura.razonSocial, true, "El nombre fiscal del documento no se toca");
    assert.equal(factura.total, true, "El importe del documento no se toca");
    assert.deepEqual(escrituras(), [], "Ninguna escritura de documento en todo el recorrido");
    paso(14, "factura con foto vigente, razón social e importe intactos y 0 escrituras");

    /* 15 · Valoraciones: icono visible y acción correcta. (N6) */
    await cerrar("[data-facturas-detail-modal='true']");
    world.facturas = world.facturas.map((f) => (f.id === "F-SINT-2" ? { ...f } : f));
    await clickInPage(page, "[data-factura-id='F-SINT-2']");
    await page.waitForSelector(VALORACIONES, { timeout: 15000 });
    const boton = await page.evaluate((sel) => {
      const nodo = document.querySelector(sel);
      const svg = nodo.querySelector("svg");
      const trazo = svg?.querySelector("path, circle, rect, line, polyline, polygon");
      const estilo = trazo ? getComputedStyle(trazo) : null;
      const caja = svg?.getBoundingClientRect();
      return {
        texto: nodo.textContent.replace(/\s+/gu, " ").trim(), aria: nodo.getAttribute("aria-label"), tipo: nodo.getAttribute("type"),
        ancho: caja ? Math.round(caja.width) : 0, alto: caja ? Math.round(caja.height) : 0,
        stroke: estilo?.stroke || "", grosor: estilo?.strokeWidth || "",
      };
    }, VALORACIONES);
    assert.equal(boton.texto, "Valoraciones");
    assert.equal(boton.aria, "Consultar valoraciones", "El nombre accesible acompaña a la etiqueta");
    assert.equal(boton.tipo, "button", "Una acción del pie no envía un formulario");
    assert.ok(boton.ancho === 16 && boton.alto === 16, `El icono mide lo mismo que sus vecinos: ${boton.ancho}×${boton.alto}`);
    assert.notEqual(boton.stroke, "none", "Un SVG sin trazo es un hueco (N6)");
    assert.equal(boton.grosor, "2px", "El grosor es el de los demás iconos del pie");
    await page.locator(VALORACIONES).focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector("#onion-facturas-paid-confirm-root [data-fpc-dialog='true']", { timeout: 10000 });
    assert.equal(await page.locator("[data-fpc-dialog='true']").count(), 1, "La acción no abre dos capas");
    /* Y ocupa su capa de verdad: un z-index correcto con el velo de la capa de
       debajo todavía vivo seguiría siendo una interfaz bloqueada, así que se
       comprueba quién recibe el clic, no qué dice el z-index. */
    await espera(240);
    const superposicion = await page.evaluate(() => {
      const dialogo = document.querySelector("[data-fpc-dialog='true']");
      const caja = dialogo.getBoundingClientRect();
      const recibe = document.elementFromPoint(Math.round(caja.x + caja.width / 2), Math.round(caja.y + caja.height / 2));
      const raices = [...document.querySelectorAll(".ui-detail-modal-root")].map((raiz) => ({
        z: Number(getComputedStyle(raiz).zIndex) || 0,
        retenida: Boolean(raiz.querySelector("[data-modal-stack-held='true']")),
        velo: getComputedStyle(raiz.querySelector(":scope > .ui-detail-modal-overlay") || raiz).pointerEvents,
      }));
      return { dentro: Boolean(recibe && dialogo.contains(recibe)), recibe: recibe?.className?.toString?.().split(" ")[0] || "", raices };
    });
    assert.equal(superposicion.dentro, true, `Valoraciones recibe sus propios clics, no la capa de debajo (llegó a ${superposicion.recibe})`);
    const retenida = superposicion.raices.find((r) => r.retenida);
    const activa = superposicion.raices.find((r) => !r.retenida);
    assert.ok(activa && retenida && activa.z > retenida.z, `La capa activa se pinta encima (${JSON.stringify(superposicion.raices)})`);
    assert.equal(retenida.velo, "none", "El velo de la capa retenida no se queda con los clics");
    await cerrar("[data-fpc-dialog='true']");
    await cerrar("[data-facturas-detail-modal='true']");
    paso(15, `«Valoraciones» con icono ${boton.ancho}×${boton.alto} y apertura única (N6)`);

    /* 16 · Cierre limpio: sin hosts prestados, sin bloqueos, sin capas huérfanas. */
    await clickInPage(page, `a[href='${RUTA}/incidencias']`);
    await page.waitForSelector(FILA, { timeout: 15000 });
    const limpieza = await page.evaluate(() => ({
      capas: document.querySelectorAll("#incidencias-detail-modal-panel, #incidencias-create-modal-panel, [data-facturas-detail-modal='true'], [data-incidencias-media-viewer='true'], [data-fpc-dialog='true']").length,
      prestados: [...document.querySelectorAll("[data-incidencias-modal-host]")].filter((n) => n.getAttribute("data-incidencias-modal-host-superseded") === "true").length,
      inertes: document.querySelectorAll("[inert]").length,
      cuerpoConModal: document.body.className.includes("modal-open") || document.body.className.includes("payment-confirm-open"),
    }));
    assert.equal(limpieza.capas, 0, "No queda ninguna capa abierta al final del recorrido");
    assert.equal(limpieza.prestados, 0, "No queda ningún anfitrión de modal en cuarentena");
    assert.equal(limpieza.inertes, 0, "No queda nada aislado sin una capa que lo justifique");
    assert.equal(limpieza.cuerpoConModal, false, "El cuerpo no se queda marcado como si hubiera un modal");
    await page.locator("[data-incidencias-action='create-open']").first().click({ timeout: 5000 });
    await untilTrue(page, (sel) => Boolean(document.querySelector(sel)), { arg: ALTA, timeout: 10000, message: "Tras todo el recorrido, el alta sigue bloqueada" });
    await page.keyboard.press("Escape");
    await untilTrue(page, (sel) => !document.querySelector(sel), { arg: ALTA, timeout: 10000, message: "el alta no cerró" });
    paso(16, "cierre limpio: 0 capas, 0 anfitriones prestados, 0 inertes y el alta sigue abriendo");

    /* Invariantes de toda la sesión. */
    assert.equal(sesion.loads.length, 1, `La sesión cargó el documento ${sesion.loads.length} veces`);
    assert.equal(sesion.documents.length, 1, `Se pidieron ${sesion.documents.length} documentos`);
    assert.deepEqual(sesion.offOrigin, [], `Salió de su origen: ${JSON.stringify(sesion.offOrigin)}`);
    assert.deepEqual(sesion.pageErrors, [], `Errores de página: ${JSON.stringify(sesion.pageErrors)}`);
    assert.deepEqual(sesion.uncovered, [], `Llamadas que el arnés no reproduce: ${JSON.stringify(sesion.uncovered)}`);
    assert.deepEqual(escrituras(), [], "El recorrido completo no escribe en ningún dominio");

    return { pasos, llamadas: sesion.calls.length };
  } finally {
    await browser.close();
    await cerrarServidor();
  }
}

/* Entradas EN FRÍO: cada ruta debe sostenerse sin haber pasado por Incidencias. */
async function entradaEnFrio(ruta, selector, entorno) {
  const { origin, close: cerrarServidor } = await serveBuiltApp({ spaFallback: true });
  const browser = await launchBrowser();
  const sesion = await openSpaSession(browser, origin, { world: mundo(), viewport: entorno.viewport });
  try {
    await sesion.page.goto(`${origin}${RUTA}${ruta}`, { waitUntil: "load" });
    await sesion.page.waitForSelector(selector, { timeout: 20000 });
    assert.deepEqual(sesion.pageErrors, [], `${ruta} en frío dejó errores: ${JSON.stringify(sesion.pageErrors)}`);
    assert.deepEqual(sesion.offOrigin, [], `${ruta} en frío salió de su origen`);
    assert.equal(sesion.loads.length, 1, `${ruta} en frío recargó el documento`);
    return true;
  } finally {
    await browser.close();
    await cerrarServidor();
  }
}

const informe = [];
for (const entorno of ENTORNOS) {
  const { pasos, llamadas } = await recorrer(entorno);
  informe.push({ entorno: entorno.nombre, pasos, llamadas });
  for (const [ruta, selector] of [["/facturas", "[data-factura-id]"], ["/cuenta", "[data-cuenta-field]"]]) {
    await entradaEnFrio(ruta, selector, entorno);
  }
}

console.log(`SPA session contract: PASS · 16 pasos · ${ENTORNOS.length} entornos · 2 entradas en frío por entorno · 7 negativas`);
for (const { entorno, pasos, llamadas } of informe) {
  console.log(`  [${entorno}] ${llamadas} llamadas a la API · 1 documento · 0 fuera de origen · 0 errores · 0 escrituras`);
  for (const linea of pasos) console.log(`    ${linea}`);
}
console.log(`  entradas en frío verificadas: /facturas y /cuenta, sin pasar por Incidencias, en ${ENTORNOS.map((e) => e.nombre).join(" y ")}`);
