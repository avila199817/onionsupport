/* =========================================================
   Onion Support · Usuarios carga su directorio, y sólo el suyo
   Archivo: /tools/usuarios-directory-contract.mjs

   LA VISTA NO ESTABA "SIN ESTILO": ESTABA SIN DATOS.

   `usuarios.cursor.js` llamaba a `directoryKey` en dos sitios sin definirlo ni
   importarlo. El barrido de claves por semántica (#646) retiró la copia local
   --que era `slugKey` letra por letra-- clasificándola como muerta, pero tenía
   dos llamadas vivas. Cada carga de página lanzaba
   `ReferenceError: directoryKey is not defined`; el `catch` del controlador lo
   convertía en «No se pudieron cargar los usuarios» con el texto del motor
   pegado detrás, y la lista quedaba vacía.

   POR QUÉ NO BASTA CON QUE DESAPAREZCA EL ERROR. Esa clave decide el límite
   entre el directorio funcional y las identidades internas. Una corrección que
   devolviera cualquier cosa --identidad, cadena vacía, un `catch`-- haría
   desaparecer el mensaje y metería a los empleados en la lista de usuarios.
   Por eso el escenario 1 no cuenta filas: comprueba QUIÉNES están y quiénes no,
   con roles escritos de todas las formas que la clave tiene que colapsar.

   Datos sintéticos, endpoint controlado, ninguna escritura.
========================================================= */

import assert from "node:assert/strict";

import {
  clickInPage, launchBrowser, openSpaSession, serveBuiltApp, syntheticWorld, untilTrue,
} from "./spa-session-harness.mjs";

const RUTA = "/@u-admin-1";
const FILA = "[data-user-row='true']";
const BUSCAR = "[data-usuarios-search-input='true']";
const DETALLE = "#usuarios-detail-modal-title";

/* El directorio funcional: tres personas que Usuarios SÍ debe listar. */
const DIRECTORIO = [
  { id: "u-dir-1", userId: "u-dir-1", name: "Ana Directorio", fullName: "Ana Directorio", email: "ana@directorio.test", role: "user", status: "active" },
  { id: "u-dir-2", userId: "u-dir-2", name: "Carlos Directorio", fullName: "Carlos Directorio", email: "carlos@directorio.test", role: "client", status: "pending" },
  { id: "u-dir-3", userId: "u-dir-3", name: "Diana Directorio", fullName: "Diana Directorio", email: "diana@directorio.test", role: "customer", status: "blocked" },
];

/* Identidades internas, cada una marcada por un campo distinto y escrita con
   una forma que la clave tiene que colapsar: mayúsculas, espacios, guiones y
   acentos. Si la clave deja de normalizar, se cuelan en el directorio.

   Medido antes de escribirlas: `normalizeUsuariosCollection` CANONICALIZA
   `role` contra el conjunto conocido --«Super Admin» llega como `admin`, y un
   valor que el producto no conoce, como «team-member», se convierte en `user`
   y entonces esa persona pertenece de verdad al directorio--. En cambio
   `roles[]`, `personType` e `isStaff` llegan al filtro tal cual. Por eso los
   casos de abajo usan esos campos: son los que ejercitan la clave de verdad. */
const INTERNAS = [
  { id: "u-int-1", userId: "u-int-1", name: "Elena Interna", email: "elena@interno.test", role: "Super Admin", status: "active" },
  { id: "u-int-2", userId: "u-int-2", name: "Félix Interno", email: "felix@interno.test", personType: "Team Member", status: "active" },
  { id: "u-int-3", userId: "u-int-3", name: "Gema Interna", email: "gema@interno.test", roles: ["Soporte", "ADMINISTRADOR"], status: "active" },
  { id: "u-int-4", userId: "u-int-4", name: "Hugo Interno", email: "hugo@interno.test", accountType: "empleado", status: "active" },
  { id: "u-int-5", userId: "u-int-5", name: "Irene Interna", email: "irene@interno.test", isStaff: true, status: "active" },
];

const TODOS = [...DIRECTORIO, ...INTERNAS];
const espera = (ms) => new Promise((sigue) => setTimeout(sigue, ms));

/* Endpoint controlado: filtra de verdad por búsqueda y estado, como el
   backend, para que lo que se comprueba sea la vista y no el arnés. */
function directorio({ search = "", status = "" } = {}) {
  const texto = String(search || "").trim().toLowerCase();
  const estado = String(status || "").trim().toLowerCase();
  return TODOS.filter((persona) => {
    if (estado && String(persona.status || "").toLowerCase() !== estado) return false;
    if (!texto) return true;
    return `${persona.name} ${persona.email}`.toLowerCase().includes(texto);
  });
}

async function abrir(browser, origin, responder, { onResend = null } = {}) {
  const sesion = await openSpaSession(browser, origin, {
    world: syntheticWorld(),
    api: async ({ route, method, path, url, respond }) => {
      const reenvio = /^\/api\/users\/([^/]+)\/resend-activation$/u.exec(path);
      if (reenvio) {
        const id = decodeURIComponent(reenvio[1]);
        if (typeof onResend === "function") {
          await onResend({ id, route, method, respond });
        } else {
          await respond({ ok: false, code: "NOT_IMPLEMENTED" }, 501);
        }
        return true;
      }

      /* El detalle lee su propia ficha: el endpoint controlado también la
         sirve, para que abrir un usuario no dependa del mundo por defecto. */
      const ficha = /^\/api\/users\/([^/]+)$/u.exec(path);
      if (ficha && decodeURIComponent(ficha[1]) !== "avatar") {
        const id = decodeURIComponent(ficha[1]);
        const persona = TODOS.find((quien) => quien.userId === id || quien.id === id);
        if (!persona) { await respond({ ok: false, error: { code: "USER_NOT_FOUND" } }, 404); return true; }
        await respond({ ok: true, user: persona, data: persona, ...persona });
        return true;
      }
      if (path !== "/api/users") return false;
      await responder({ url, respond });
      return true;
    },
  });
  return sesion;
}

const filasDe = (page) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((fila) => ({
  id: fila.getAttribute("data-user-id") || "",
  texto: (fila.textContent || "").replace(/\s+/gu, " ").trim(),
})), FILA);

const pantalla = (page) => page.evaluate(() => (document.body.innerText || "").replace(/\s+/gu, " "));

const escenarios = [];
const paso = (texto) => escenarios.push(texto);

const { origin, close: cerrarServidor } = await serveBuiltApp({ spaFallback: true });
const browser = await launchBrowser();

try {
  /* 1 · Arranque en frío: el directorio funcional, y nadie más. */
  {
    const reenvios = [];
    const sesion = await abrir(
      browser,
      origin,
      async ({ url, respond }) => {
        const items = directorio({ search: url.searchParams.get("search"), status: url.searchParams.get("status") });
        await respond({ ok: true, items, total: items.length });
      },
      {
        onResend: async ({ id, route, method, respond }) => {
          let body = null;
          try {
            body = route.request().postDataJSON();
          } catch {
            body = route.request().postData();
          }
          reenvios.push({ id, method, body });
          await espera(140);
          await respond({
            ok: true,
            success: true,
            code: "ACTIVATION_LINK_RESENT",
            message: "Se ha enviado un nuevo enlace de activación.",
            userId: id,
            email: "carlos@directorio.test",
            expiresAt: "2026-09-19T00:00:00.000Z",
            activationUrl: "https://activation.invalid/SECRET-QUE-NUNCA-DEBE-LLEGAR-AL-DOM",
            mail: { sent: true, status: "sent" },
          });
        },
      }
    );
    const page = sesion.page;
    await page.goto(`${origin}${RUTA}/usuarios`, { waitUntil: "load" });
    await untilTrue(page, (sel) => document.querySelectorAll(sel).length > 0, { arg: FILA, timeout: 20000, message: "Usuarios no pintó ninguna fila en frío" });

    const filas = await filasDe(page);
    assert.deepEqual(filas.map((f) => f.id).sort(), ["u-dir-1", "u-dir-2", "u-dir-3"],
      `El directorio funcional es exactamente el esperado, no lo que devuelve el endpoint: ${JSON.stringify(filas.map((f) => f.id))}`);
    for (const interna of INTERNAS) {
      assert.equal(filas.some((f) => f.id === interna.id), false,
        `${interna.id} es una identidad interna y no pertenece al directorio de Usuarios`);
    }
    for (const persona of DIRECTORIO) {
      const fila = filas.find((f) => f.id === persona.userId);
      assert.ok(fila.texto.includes(persona.name), `La fila de ${persona.userId} muestra su nombre`);
      assert.ok(fila.texto.includes(persona.email), `La fila de ${persona.userId} muestra su correo`);
    }
    const texto = await pantalla(page);
    assert.equal(/is not defined|is not a function|Cannot read propert/u.test(texto), false,
      "Ninguna falta del motor puede presentarse como mensaje al usuario");
    assert.deepEqual(sesion.pageErrors, [], `Errores de página: ${JSON.stringify(sesion.pageErrors)}`);
    paso(`1 · en frío: ${filas.length} del directorio, ${INTERNAS.length} identidades internas fuera, 0 texto del motor`);

    /* 2 · Búsqueda. */
    await page.fill(BUSCAR, "Carlos");
    await untilTrue(page, (sel) => document.querySelectorAll(sel).length === 1, { arg: FILA, timeout: 15000, message: "La búsqueda no redujo la lista" });
    assert.equal((await filasDe(page))[0].id, "u-dir-2", "La búsqueda deja la fila que corresponde");

    await page.fill(BUSCAR, "");
    await untilTrue(page, (sel) => document.querySelectorAll(sel).length === 3, { arg: FILA, timeout: 15000, message: "Vaciar la búsqueda no restauró la lista" });
    paso("2 · búsqueda: filtra y se deshace sin recargar");

    /* 3 · Filtros de estado, contra el mismo endpoint. */
    /* CONTAR FILAS NO ES ESPERAR: dos filtros distintos pueden dejar el mismo
       número. Se espera por QUIÉNES están, que es lo que se va a afirmar. */
    const porEstado = async (etiqueta, esperados) => {
      const firma = [...esperados].sort().join("|");
      const boton = page.locator(`[data-usuarios-action="filter"]`).filter({ hasText: etiqueta }).first();
      await boton.click();
      await untilTrue(page, ({ sel, esperada }) => [...document.querySelectorAll(sel)]
        .map((fila) => fila.getAttribute("data-user-id") || "").sort().join("|") === esperada,
      { arg: { sel: FILA, esperada: firma }, timeout: 15000, message: `El filtro ${etiqueta} no dejó ${firma}` });
      assert.deepEqual((await filasDe(page)).map((f) => f.id).sort(), [...esperados].sort(), `Filtro ${etiqueta}`);
    };
    await porEstado("Bloqueados", ["u-dir-3"]);
    await porEstado("Activos", ["u-dir-1"]);
    await porEstado("Todos", ["u-dir-1", "u-dir-2", "u-dir-3"]);
    paso("3 · filtros de estado: bloqueados, activos y todos");

    /* 4 · Pendiente es una acción explícita de reenvío; Activo/Bloqueado no. */
    const selectorReenvio = `${FILA}[data-user-id='u-dir-2'] [data-usuarios-action='resend-activation']`;
    assert.equal(await page.locator(selectorReenvio).count(), 1, "Pendiente expone un único botón de reenvío");
    assert.equal(await page.locator(`${FILA}[data-user-id='u-dir-1'] [data-usuarios-action='resend-activation']`).count(), 0,
      "Activo nunca se convierte en acción de reenvío");
    assert.equal(await page.locator(`${FILA}[data-user-id='u-dir-3'] [data-usuarios-action='resend-activation']`).count(), 0,
      "Bloqueado nunca se convierte en acción de reenvío");

    const opener = page.locator(selectorReenvio);
    await opener.click();
    await page.waitForSelector("[data-usuarios-resend-confirm-dialog='true']", { timeout: 15000 });
    assert.equal(reenvios.length, 0, "Abrir la confirmación todavía no escribe");
    const confirmacion = await page.locator("[data-usuarios-resend-confirm-dialog='true']").evaluate((node) => ({
      role: node.getAttribute("role"),
      texto: (node.textContent || "").replace(/\s+/gu, " ").trim(),
    }));
    assert.equal(confirmacion.role, "alertdialog", "La confirmación usa el shell accesible de producto");
    assert.ok(confirmacion.texto.includes("carlos@directorio.test"), "La confirmación dice a qué correo se reenviará");
    assert.ok(confirmacion.texto.includes("24 horas"), "La confirmación explica la nueva caducidad");
    assert.ok(/anterior dejará de ser válido/u.test(confirmacion.texto), "La confirmación explica la rotación del token");
    assert.equal(await page.locator(DETALLE).count(), 0, "Pulsar Pendiente no abre por accidente el detalle de la fila");

    const confirm = page.locator("[data-usuarios-resend-confirm-action='confirm']");
    await confirm.click();
    await untilTrue(page, (sel) => document.querySelector(sel)?.getAttribute("aria-busy") === "true",
      { arg: selectorReenvio, timeout: 5000, message: "El chip Pendiente no anunció el envío en curso" });
    await untilTrue(page, (sel) => document.querySelector(sel)?.getAttribute("aria-busy") === "false",
      { arg: selectorReenvio, timeout: 10000, message: "El chip Pendiente no terminó el reenvío" });

    assert.equal(reenvios.length, 1, "Confirmar dispara exactamente un reenvío");
    assert.deepEqual(reenvios[0], { id: "u-dir-2", method: "POST", body: {} },
      "El comando usa POST /api/users/:id/resend-activation con body vacío");
    assert.equal(await page.locator("[data-usuarios-resend-confirm-dialog='true']").count(), 0,
      "La confirmación se desmonta después de aceptar");
    assert.ok((await pantalla(page)).includes("Nuevo enlace de activación enviado a carlos@directorio.test."),
      "El administrador recibe confirmación visible de entrega");
    assert.equal((await pantalla(page)).includes("SECRET-QUE-NUNCA-DEBE-LLEGAR-AL-DOM"), false,
      "activationUrl no cruza la frontera API ni aparece en el DOM");

    await opener.click();
    await page.waitForSelector("[data-usuarios-resend-confirm-dialog='true']", { timeout: 15000 });
    await page.locator("[data-usuarios-resend-confirm-action='cancel']").click();
    await page.waitForSelector("[data-usuarios-resend-confirm-dialog='true']", { state: "detached", timeout: 5000 });
    assert.equal(reenvios.length, 1, "Cancelar no dispara un segundo reenvío");
    paso("4 · Pendiente → confirmación accesible → POST único → feedback, sin filtrar activationUrl");

    /* 5 · Orden: la vista declara su sentido y lo cambia. */
    const sentido = () => page.evaluate(() => document.querySelector("[data-usuarios-action='sort-toggle']")?.getAttribute("data-sort-order")
      || document.querySelector("[data-usuarios-scope='true']")?.getAttribute("data-sort-order") || "");
    const antes = await sentido();
    await clickInPage(page, "[data-usuarios-action='sort-toggle']");
    await untilTrue(page, (previo) => {
      const nodo = document.querySelector("[data-usuarios-action='sort-toggle']") || document.querySelector("[data-usuarios-scope='true']");
      return (nodo?.getAttribute("data-sort-order") || "") !== previo;
    }, { arg: antes, timeout: 15000, message: "El orden no cambió al pulsar su control" });
    assert.notEqual(await sentido(), antes, "El control de orden cambia el sentido declarado");
    assert.equal((await filasDe(page)).length, 3, "Ordenar no pierde filas");
    paso(`5 · orden: ${antes || "(sin declarar)"} → ${await sentido()}`);

    /* 6 · Abrir el usuario correcto. */
    await clickInPage(page, `${FILA}[data-user-id='u-dir-2'] [data-usuarios-action='detail'], ${FILA}[data-user-id='u-dir-2']`);
    await page.waitForSelector(DETALLE, { timeout: 15000 });
    const enDetalle = await page.evaluate((sel) => (document.querySelector(sel)?.textContent || "").replace(/\s+/gu, " "), DETALLE);
    assert.ok(enDetalle.includes("Carlos Directorio"), `El detalle abre el usuario pulsado: ${enDetalle.slice(0, 120)}`);
    assert.equal(enDetalle.includes("Ana Directorio"), false, "El detalle no muestra otro usuario");
    await page.keyboard.press("Escape");
    await page.waitForSelector(DETALLE, { state: "detached", timeout: 15000 });
    paso("6 · abre el usuario pulsado y lo cierra");

    /* 7 · Salir de la ruta y volver, sin recargar el documento. */
    await clickInPage(page, `a[href='${RUTA}/facturas']`);
    await page.waitForSelector("[data-factura-id]", { timeout: 15000 });
    await clickInPage(page, `a[href='${RUTA}/usuarios']`);
    await untilTrue(page, (sel) => document.querySelectorAll(sel).length === 3, { arg: FILA, timeout: 20000, message: "Al volver a Usuarios no reapareció el directorio" });
    assert.equal(sesion.loads.length, 1, `La sesión cargó el documento ${sesion.loads.length} veces`);
    assert.deepEqual(sesion.pageErrors, [], `Errores de página tras el regreso: ${JSON.stringify(sesion.pageErrors)}`);
    paso("7 · salir y volver por el router, con 1 solo documento");
    await page.close();
  }

  /* 8 · Lista vacía legítima NO es un fallo de carga. */
  {
    const sesion = await abrir(browser, origin, async ({ respond }) => { await respond({ ok: true, items: [], total: 0 }); });
    const page = sesion.page;
    await page.goto(`${origin}${RUTA}/usuarios`, { waitUntil: "load" });
    await untilTrue(page, () => /Todav[ií]a no hay usuarios/u.test(document.body.innerText || ""), { timeout: 20000, message: "Una lista vacía legítima no anunció su estado vacío" });
    const texto = await pantalla(page);
    assert.equal(/No se pudieron cargar los usuarios/u.test(texto), false, "Una lista vacía no se presenta como fallo de carga");
    assert.equal(await page.locator("button", { hasText: /Reintentar/u }).count(), 0, "Una lista vacía no ofrece reintentar");
    paso("8 · vacío legítimo: su propio estado, sin «Reintentar»");
    await page.close();
  }

  /* 9 · Fallo de carga y reintento con el endpoint sano. */
  {
    let caido = true;
    const sesion = await abrir(browser, origin, async ({ url, respond }) => {
      if (caido) { await respond({ ok: false, message: "El servidor no está disponible.", error: { code: "UPSTREAM_DOWN" } }, 503); return; }
      const items = directorio({ search: url.searchParams.get("search"), status: url.searchParams.get("status") });
      await respond({ ok: true, items, total: items.length });
    });
    const page = sesion.page;
    await page.goto(`${origin}${RUTA}/usuarios`, { waitUntil: "load" });
    await untilTrue(page, () => /No se pudieron cargar los usuarios/u.test(document.body.innerText || ""), { timeout: 20000, message: "Un fallo de carga no anunció su estado de error" });
    const conError = await pantalla(page);
    assert.ok(conError.includes("El servidor no está disponible."), "El texto del backend sí se muestra: la regla de faltas no lo silencia");
    assert.equal(/is not defined/u.test(conError), false, "Nunca el texto del motor");

    caido = false;
    await page.locator("button", { hasText: /Reintentar/u }).first().click();
    await untilTrue(page, (sel) => document.querySelectorAll(sel).length === 3, { arg: FILA, timeout: 20000, message: "El reintento no recuperó el directorio" });
    assert.equal(/No se pudieron cargar los usuarios/u.test(await pantalla(page)), false, "Tras reintentar no queda el estado de error");
    assert.equal(sesion.loads.length, 1, "El reintento no recarga el documento");
    paso("9 · error controlado → «Reintentar» → directorio completo, sin recargar");
    await espera(120);
    await page.close();
  }
} finally {
  await browser.close();
  await cerrarServidor();
}

console.log(`Usuarios directory contract: PASS · ${escenarios.length} escenarios · endpoint controlado, ${DIRECTORIO.length} del directorio y ${INTERNAS.length} identidades internas`);
for (const linea of escenarios) console.log(`  ${linea}`);
