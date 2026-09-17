/* =========================================================
   Onion Support · Las acciones del detalle de la Agenda
   Archivo: /tools/agenda-detalle-acciones-contract.mjs

   POR QUÉ ESTE CONTRATO EXISTE

   El recorrido de `agenda-citas-browser-contract.mjs` monta la vista LLAMANDO
   a `AgendaView(host, { role: "admin" })`. Esa llamada no ocurre en ninguna
   parte de la aplicación: el Router monta las vistas con un contexto que NO
   lleva `role` ni `isAdmin`. Por eso aquel recorrido daba verde mientras en
   producción un administrador abría una cita y el pie del detalle no existía.

   Aquí NO se fabrica el contexto. Se arranca la aplicación CONSTRUIDA, se
   entra por su ruta real, la sesión la resuelve el propio front con la
   respuesta de `/api/auth/me`, y el Router monta la Agenda como la monta en
   producción. Lo que se afirma es lo que ve una persona: los botones están en
   el DOM, están visibles, están habilitados y responden.

   Datos sintéticos. Ninguna escritura de dominio, ningún correo.
========================================================= */

import assert from "node:assert/strict";

import {
  clickInPage, launchBrowser, openSpaSession, serveBuiltApp, syntheticWorld, untilTrue,
} from "./spa-session-harness.mjs";

const PANEL = "[data-agenda-detail-modal-panel='true']";
const EDITAR = `${PANEL} [data-detail-action='detail-edit']`;
const ELIMINAR = `${PANEL} [data-detail-action='detail-eliminar']`;
const CONFIRMAR = "[data-detail-action='detail-eliminar-confirmar']";
const CHIP = "[data-agenda-action='open-cita'][data-agenda-opener^='dia:']";

const ZONA = "Europe/Madrid";

function sumarDias(clave = "", dias = 0) {
  const [year, month, day] = clave.split("-").map(Number);
  const fecha = new Date(Date.UTC(year, month - 1, day + dias));
  return fecha.toISOString().slice(0, 10);
}

/* Una cita con la MISMA forma que proyecta el backend para el administrador:
   con `etag`, con destinatario y con `notificacion`. */
function citaSintetica(fechaLocal, { estado = "programada", id = "CITA-SINT-1" } = {}) {
  return {
    id,
    fechaLocal,
    horaLocal: "10:30",
    zona: ZONA,
    inicioUtc: `${fechaLocal}T08:30:00.000Z`,
    asunto: "Cita de soporte",
    lugar: "Oficina sintética",
    nota: "Nota sintética de la cita.",
    estado,
    canceladaEn: estado === "cancelada" ? `${fechaLocal}T09:00:00.000Z` : "",
    version: 1,
    updatedAt: `${fechaLocal}T08:00:00.000Z`,
    userId: "u-cliente-1",
    destinatarioNombre: "Ana Cliente Sintética",
    organizadorNombre: "Admin Sintético",
    etag: '"etag-1-CITA-SINT-1"',
    notificacion: { tipo: "alta", estado: "enviada", etiqueta: "Avisada", intentos: 1, versionComunicada: 1, motivo: "" },
  };
}

/* La frontera de citas del mundo sintético. La fecha se deriva del intervalo
   que PIDE la aplicación, para que la cita caiga siempre dentro de la rejilla
   visible sin depender del día en que se ejecute la prueba. */
function fronteraCitas({ estado = "programada", puedeCrear = true } = {}) {
  const estadoLocal = { fechaLocal: "", cita: null };

  return async ({ method, path, url, respond }) => {
    if (path === "/api/citas" && method === "GET") {
      const desde = url.searchParams.get("desde") || "";
      if (!estadoLocal.cita) {
        estadoLocal.fechaLocal = sumarDias(desde, 10);
        estadoLocal.cita = citaSintetica(estadoLocal.fechaLocal, { estado });
      }
      await respond({
        ok: true,
        citas: [estadoLocal.cita],
        zona: ZONA,
        truncado: false,
        limite: 200,
        puedeCrear,
      });
      return true;
    }

    const detalle = path.match(/^\/api\/citas\/([^/]+)$/u);
    if (detalle && method === "GET") {
      if (!estadoLocal.cita) return false;
      await respond({ ok: true, cita: estadoLocal.cita });
      return true;
    }

    return false;
  };
}

/* Visible DE VERDAD: en el DOM, con caja, sin `display:none`, sin
   `visibility:hidden`, sin transparencia total y sin estar deshabilitado.
   «Está en el HTML» no es «se ve». */
async function medirBoton(page, selector) {
  return page.evaluate((target) => {
    const node = document.querySelector(target);
    if (!node) return { existe: false };
    const estilo = getComputedStyle(node);
    const caja = node.getBoundingClientRect();
    return {
      existe: true,
      texto: (node.textContent || "").trim(),
      display: estilo.display,
      visibility: estilo.visibility,
      opacity: Number(estilo.opacity),
      ancho: caja.width,
      alto: caja.height,
      deshabilitado: node.disabled === true || node.getAttribute("aria-disabled") === "true",
      /* Lo que recibiría el clic en el centro del botón: si otra cosa lo tapa,
         el botón se ve pero no se puede pulsar. */
      recibeElClic: (() => {
        const encima = document.elementFromPoint(caja.left + caja.width / 2, caja.top + caja.height / 2);
        return Boolean(encima && (encima === node || node.contains(encima)));
      })(),
    };
  }, selector);
}

function exigirVisible(medida, etiqueta) {
  assert.equal(medida.existe, true, `${etiqueta}: no está en el DOM.`);
  assert.equal(medida.texto, etiqueta, `${etiqueta}: el texto del botón es «${medida.texto}».`);
  assert.notEqual(medida.display, "none", `${etiqueta}: display:none.`);
  assert.notEqual(medida.visibility, "hidden", `${etiqueta}: visibility:hidden.`);
  assert.ok(medida.opacity > 0.01, `${etiqueta}: transparente (opacity ${medida.opacity}).`);
  assert.ok(medida.ancho > 0 && medida.alto > 0, `${etiqueta}: sin caja (${medida.ancho}×${medida.alto}).`);
  assert.equal(medida.deshabilitado, false, `${etiqueta}: deshabilitado.`);
  assert.equal(medida.recibeElClic, true, `${etiqueta}: hay algo por encima que se lleva el clic.`);
}

async function abrirAgenda(browser, origin, { rol = "admin", estado = "programada", puedeCrear = true } = {}) {
  const world = syntheticWorld();
  if (rol !== "admin") {
    world.conectado = { ...world.titular };
  }
  const slug = `/@${world.conectado.userId}`;

  const sesion = await openSpaSession(browser, origin, {
    world,
    api: fronteraCitas({ estado, puedeCrear }),
  });

  const { page } = sesion;
  await page.goto(`${origin}${slug}/agenda`, { waitUntil: "load" });

  await untilTrue(page, (target) => document.querySelectorAll(target).length > 0, {
    arg: CHIP,
    message: "La cita sintética no ha llegado a pintarse en la rejilla del mes",
  });

  await clickInPage(page, CHIP);

  /* «Abierto» no es «pintado»: mientras carga, el panel enseña el estado de
     carga compartido. Se espera al dato que sólo existe con la cita leída. */
  await untilTrue(page, (target) => {
    const panel = document.querySelector(target);
    const texto = panel?.textContent || "";
    return Boolean(panel) && !texto.includes("Cargando la cita") && texto.includes("Oficina sintética");
  }, { arg: PANEL, message: "El detalle de la cita no ha terminado de abrirse" });

  /* El estado que se afirma es el CONTRACTUAL, no la etiqueta traducida. */
  await untilTrue(page, (esperado) => {
    const raiz = document.querySelector("[data-agenda-detail-root='true']");
    return raiz?.getAttribute("data-cita-id") === esperado;
  }, { arg: "CITA-SINT-1", message: "El detalle abierto no es el de la cita sintética" });

  return { ...sesion, slug, world };
}

/* =========================================================
   PASOS
========================================================= */

const pasos = [];
function paso(nombre) { pasos.push(nombre); process.stdout.write(`  ✓ ${nombre}\n`); }

async function main() {
  const browser = await launchBrowser();
  const { origin, close: cerrarServidor } = await serveBuiltApp({ spaFallback: true });

  try {
    /* A · ADMINISTRADOR REAL · las dos acciones existen, se ven y se pueden pulsar. */
    {
      const sesion = await abrirAgenda(browser, origin, { rol: "admin" });
      const { page } = sesion;

      const editar = await medirBoton(page, EDITAR);
      const eliminar = await medirBoton(page, ELIMINAR);
      exigirVisible(editar, "Editar");
      exigirVisible(eliminar, "Eliminar cita");
      paso("A · un administrador ve EDITAR y ELIMINAR CITA en una cita programada");

      /* B · La fila que comparte la misma puerta que el pie. Si el pie se pierde
         por el rol, esta fila se pierde con él: comprobarlas juntas impide
         «arreglar» sólo los botones y dejar el rol mal resuelto. */
      const filaUsuario = await page.evaluate((target) => {
        const panel = document.querySelector(target);
        return (panel?.textContent || "").includes("Ana Cliente Sintética");
      }, PANEL);
      assert.equal(filaUsuario, true, "El detalle del administrador no muestra la fila «Usuario».");
      paso("B · el mismo permiso trae la fila del usuario destinatario");

      /* C · El estado que se compara es el CONTRACTUAL, el que viaja en el
         documento --`programada`--, no la etiqueta traducida que se pinta. Así
         no se puede explicar la ausencia de acciones diciendo que la cita
         estaba cancelada. */
      const estadoContractual = await page.evaluate((target) => {
        const chip = document.querySelector(target);
        return [...(chip?.classList || [])].filter((clase) => clase.startsWith("is-")).join(",");
      }, CHIP);
      assert.equal(estadoContractual, "is-programada", `El estado contractual de la cita es «${estadoContractual}».`);
      paso("C · el estado de la cita abierta es el contractual «programada»");

      /* D · EDITAR responde: el detalle pasa a modo edición. */
      await clickInPage(page, EDITAR);
      await untilTrue(page, (target) => {
        const panel = document.querySelector(target);
        return Boolean(panel?.querySelector("[data-detail-action='detail-save']"));
      }, { arg: PANEL, message: "Pulsar EDITAR no ha abierto el modo edición" });
      paso("D · pulsar EDITAR abre el modo edición con «Guardar cambios»");

      await clickInPage(page, `${PANEL} [data-detail-action='detail-edit-cancel']`);
      await untilTrue(page, (target) => {
        const panel = document.querySelector(target);
        return Boolean(panel) && !panel.querySelector("[data-detail-action='detail-save']");
      }, { arg: PANEL, message: "Descartar la edición no ha devuelto el detalle a lectura" });

      /* E · ELIMINAR CITA responde: abre la confirmación compartida. */
      await clickInPage(page, ELIMINAR);
      await untilTrue(page, (target) => Boolean(document.querySelector(target)), {
        arg: CONFIRMAR,
        message: "Pulsar ELIMINAR CITA no ha abierto la confirmación",
      });
      paso("E · pulsar ELIMINAR CITA abre la confirmación compartida");

      /* Se sale por «Volver»: la prueba NO cancela nada. */
      await clickInPage(page, "[data-detail-action='detail-eliminar-volver']");
      await untilTrue(page, (target) => !document.querySelector(target), {
        arg: CONFIRMAR,
        message: "«Volver» no ha cerrado la confirmación",
      });

      /* El arranque de la sesión hace su `POST /api/auth/refresh`: eso es la
         propia aplicación autenticándose, no una escritura de dominio. Lo que
         se exige es que NADA haya escrito una cita. */
      const escriturasDeDominio = sesion.writes.filter((llamada) => llamada.path.startsWith("/api/citas"));
      assert.deepEqual(escriturasDeDominio, [], `La prueba ha escrito citas: ${JSON.stringify(escriturasDeDominio)}`);
      assert.deepEqual(sesion.pageErrors, [], `Errores de página: ${sesion.pageErrors.join(" · ")}`);
      paso("F · el recorrido no ha escrito ni una sola cita");

      await sesion.context.close();
    }

    /* G · CONTROL NEGATIVO · un usuario que no es administrador NO las ve. */
    {
      const sesion = await abrirAgenda(browser, origin, { rol: "user", puedeCrear: false });
      const { page } = sesion;

      const editar = await medirBoton(page, EDITAR);
      const eliminar = await medirBoton(page, ELIMINAR);
      assert.equal(editar.existe, false, "Un usuario no administrador ve EDITAR.");
      assert.equal(eliminar.existe, false, "Un usuario no administrador ve ELIMINAR CITA.");

      const cuerpo = await page.evaluate((target) => (document.querySelector(target)?.textContent || ""), PANEL);
      assert.ok(cuerpo.includes("Oficina sintética"), "El usuario tampoco ve el detalle de su cita.");
      paso("G · un usuario no administrador abre su cita y NO ve ninguna de las dos acciones");

      await sesion.context.close();
    }

    /* H · CONTROL NEGATIVO · administrador, pero la cita está cancelada. */
    {
      const sesion = await abrirAgenda(browser, origin, { rol: "admin", estado: "cancelada" });
      const { page } = sesion;

      const editar = await medirBoton(page, EDITAR);
      const eliminar = await medirBoton(page, ELIMINAR);
      assert.equal(editar.existe, false, "Una cita cancelada ofrece EDITAR.");
      assert.equal(eliminar.existe, false, "Una cita cancelada ofrece ELIMINAR CITA.");

      const cuerpo = await page.evaluate((target) => (document.querySelector(target)?.textContent || ""), PANEL);
      assert.ok(cuerpo.includes("Ana Cliente Sintética"), "El administrador pierde la fila «Usuario» en una cita cancelada.");
      paso("H · una cita cancelada no ofrece acciones, pero sigue siendo la vista del administrador");

      await sesion.context.close();
    }
  } finally {
    await cerrarServidor();
    await browser.close();
  }

  process.stdout.write(`\nAgenda · acciones del detalle: ${pasos.length} comprobaciones sobre el build real.\n`);
}

await main();
