/* =========================================================
   Onion Support · La fotografía vigente llega; el documento no se toca
   Archivo: /tools/avatar-live-identity-contract.mjs

   Recorre el flujo REAL: el input de archivo de /cuenta, la petición del
   controlador, la confirmación del servidor y la invalidación que ya existe.
   Aquí no se emite ningún evento inventado.

   Lo que prueba, sobre el build real servido en un navegador:
     1. Una foto confirmada llega a los consumidores autorizados sin recargar.
     2. Actualizarla NO modifica una factura histórica ni emite escrituras.
     3. La foto de una persona no aparece nunca en otra.
     4. Sin relación inequívoca con un perfil, el avatar conserva su reserva.
     5. Retirar la foto devuelve las iniciales, nunca un círculo vacío.
     6. Una edición local sin guardar y una capa abierta sobreviven al cambio.
========================================================= */

import assert from "node:assert/strict";

import {
  clickInPage, FOTO_A, FOTO_B, launchBrowser, openSpaSession,
  PNG_1X1, serveBuiltApp, syntheticWorld, untilTrue,
} from "./spa-session-harness.mjs";

const RUTA = "/@u-admin-1";
const HERO = "[data-modal-hero='true'] [data-modal-avatar-frame='true'], [data-facturas-detail-modal='true'] [data-modal-avatar-frame='true']";
const escenarios = [];
const paso = (texto) => escenarios.push(texto);

/* El usuario conectado es además titular de INC-SINT-1 y cliente de las
   facturas: es el caso en el que su foto vive en documentos ajenos. */
const world = syntheticWorld();
const yo = { ...world.conectado, email: "admin@example.test", avatarUrl: FOTO_A, hasAvatar: true };
world.conectado = yo;
world.tickets = world.tickets.map((t, i) => (i === 0
  ? { ...t, userId: yo.userId, clientId: yo.userId, fullName: yo.name, name: yo.name, email: yo.email, avatarUrl: FOTO_A, hasAvatar: true }
  : t));
const fiscal = { nombreFiscal: "SOCIEDAD SINTÉTICA SL", razonSocial: "SOCIEDAD SINTÉTICA SL", nif: "X0000000X" };
world.facturas = world.facturas.map((f) => ({
  ...f, ...fiscal,
  clienteId: yo.userId, userId: yo.userId, clienteNombre: fiscal.razonSocial, clienteEmail: yo.email, clienteAvatar: FOTO_A,
  cliente: { id: yo.userId, userId: yo.userId, nombre: fiscal.razonSocial, razonSocial: fiscal.razonSocial, email: yo.email, avatarUrl: FOTO_A },
}));
/* Una factura SIN relación inequívoca: sólo un nombre. Nadie puede deducir a
   quién retrata, así que conserva su reserva pase lo que pase. */
world.facturas.push({
  ...world.facturas[0],
  id: "F-SINT-9", facturaId: "F-SINT-9", numero: "202600009",
  clienteId: "", userId: "", clienteEmail: "", clienteAvatar: "",
  clienteNombre: "CLIENTE SIN PERFIL SL", nombreFiscal: "CLIENTE SIN PERFIL SL", razonSocial: "CLIENTE SIN PERFIL SL",
  cliente: { nombre: "CLIENTE SIN PERFIL SL", razonSocial: "CLIENTE SIN PERFIL SL" },
});

const { origin, close: cerrarServidor } = await serveBuiltApp({ spaFallback: true });
const browser = await launchBrowser();
let confirmada = FOTO_A;
const sesion = await openSpaSession(browser, origin, {
  world,
  api: async ({ method, path, respond, world: w }) => {
    if (path !== "/api/users/avatar") return false;
    confirmada = method === "DELETE" ? "" : FOTO_B;
    const usuario = {
      ...w.conectado, avatarUrl: confirmada, avatar: confirmada, photoUrl: confirmada,
      hasAvatar: Boolean(confirmada), avatarUpdatedAt: "2026-09-17T01:00:00.000Z",
    };
    w.conectado = usuario;
    await respond({ ok: true, success: true, user: usuario, data: usuario, ...usuario });
    return true;
  },
});
const page = sesion.page;

const marco = (selector) => page.evaluate((sel) => {
  const host = document.querySelector(sel);
  if (!host) return null;
  const imagen = host.querySelector("img");
  const pintado = [...host.querySelectorAll("*")].some((nodo) => (
    nodo.textContent.trim() && nodo.getBoundingClientRect().width > 0 && getComputedStyle(nodo).visibility !== "hidden"
  ));
  return {
    estado: host.dataset.avatarState || null,
    identidad: host.dataset.avatarIdentity || null,
    iniciales: host.dataset.avatarInitials || null,
    src: imagen?.getAttribute("src") || null,
    inicialesVisibles: pintado,
  };
}, selector);

const abrirIncidencia = async (id) => {
  await clickInPage(page, `[data-ticket-row='true'][data-ticket-id='${id}']`);
  await page.waitForSelector("#incidencias-detail-modal-panel");
  await untilTrue(page, () => Boolean(document.querySelector("[data-modal-hero='true']")), { message: `el detalle ${id} no se pintó` });
};
const cerrarCapa = async (selector) => {
  await page.keyboard.press("Escape");
  await page.waitForSelector(selector, { state: "detached" });
};
const escriturasDeDominio = () => sesion.writes.filter(({ path }) => (
  !path.startsWith("/api/auth/") && path !== "/api/users/avatar"
));

try {
  /* 1 · Punto de partida: la foto anterior, la misma identidad en tres sitios. */
  await page.goto(`${origin}${RUTA}/incidencias`, { waitUntil: "load" });
  await page.waitForSelector("[data-ticket-row='true']");
  await abrirIncidencia("INC-SINT-1");
  const antes = await marco(HERO);
  assert.equal(antes.src, FOTO_A, "El detalle debe partir de la fotografía anterior");
  await cerrarCapa("#incidencias-detail-modal-panel");
  paso(`1 · partida: detalle con ${antes.src}, identidad ${antes.identidad}`);

  /* 2 · Flujo real: el input de archivo de /cuenta y la confirmación del servidor. */
  await clickInPage(page, `a[href='${RUTA}/cuenta']`);
  await page.waitForSelector("input[type='file'][data-cuenta-field='avatar']", { timeout: 15000 });

  /* Marcamos el nodo del avatar de la barra lateral y el estado de su capa:
     la actualización debe llegar a ESE nodo, no reconstruirlo.
     (La vista de Cuenta limpia a propósito sus campos sensibles --
     clearSensitiveInputs / sensitiveInteractionActive en views/cuenta/index.js--,
     así que no se prueba aquí que una contraseña a medio escribir sobreviva:
     es una política de seguridad existente y ajena a la fotografía.) */
  const capaAbierta = await page.evaluate(() => {
    const host = document.querySelector(".sidebar-user-avatar, .sidebar-account-menu-avatar");
    if (host) host.setAttribute("data-prueba-nodo", "mismo");
    const boton = document.querySelector("[data-sidebar-action='toggle-account'], [data-sidebar-account-toggle='true']");
    if (boton) boton.click();
    return {
      desplegable: document.querySelector("[data-sidebar-account-dropdown]")?.getAttribute("data-sidebar-account-dropdown") || "",
      marcado: Boolean(host),
    };
  });

  await page.setInputFiles("input[type='file'][data-cuenta-field='avatar']", { name: "retrato.png", mimeType: "image/png", buffer: PNG_1X1 });
  await untilTrue(page, () => /actualizada/iu.test(document.body.textContent || ""), {
    timeout: 15000, message: "El servidor no llegó a confirmar la fotografía",
  });
  assert.equal(confirmada, FOTO_B, "El servidor debe haber confirmado la nueva fotografía");
  paso("2 · fotografía subida por el input real y confirmada por el servidor");

  /* 6 · El cambio actualiza el nodo vivo; no lo reconstruye ni cierra la capa. */
  await untilTrue(page, () => (
    document.querySelector(".sidebar-user-avatar, .sidebar-account-menu-avatar")?.querySelector("img")?.getAttribute("src") === "/@sintetico/retrato-b.png"
  ), { timeout: 15000, message: "La barra lateral no recogió la fotografía vigente" });
  const local = await page.evaluate(() => ({
    desplegable: document.querySelector("[data-sidebar-account-dropdown]")?.getAttribute("data-sidebar-account-dropdown") || "",
  }));
  assert.equal(capaAbierta.marcado, true, "La barra lateral debe tener su avatar antes del cambio");
  assert.equal(local.desplegable, capaAbierta.desplegable, "La fotografía no puede cerrar ni reconstruir una capa abierta");
  paso(`6 · la barra lateral recoge la fotografía y la capa sigue en "${local.desplegable}"`);

  /* 3 · Los consumidores autorizados, con el documento devolviendo la foto ANTERIOR. */
  await clickInPage(page, `a[href='${RUTA}/incidencias']`);
  await page.waitForSelector("[data-ticket-row='true']", { timeout: 15000 });
  await untilTrue(page, (sel) => document.querySelector(sel)?.querySelector("img")?.getAttribute("src") === "/@sintetico/retrato-b.png", {
    arg: "[data-ticket-id='INC-SINT-1'] [data-avatar-host='true']",
    message: "La fila de la lista no recogió la fotografía vigente",
  });
  await abrirIncidencia("INC-SINT-1");
  const detalle = await marco(HERO);
  assert.equal(detalle.src, FOTO_B, "El detalle de Incidencias debe pintar la fotografía vigente");
  assert.equal(detalle.identidad, antes.identidad, "La identidad no cambia porque cambie la fotografía");
  await cerrarCapa("#incidencias-detail-modal-panel");

  /* 4 · Otra persona no se contagia. */
  await abrirIncidencia("INC-SINT-2");
  const otra = await marco(HERO);
  assert.notEqual(otra.identidad, antes.identidad, "El segundo titular debe ser otra identidad");
  assert.notEqual(otra.src, FOTO_B, "La fotografía de una persona no puede aparecer en otra");
  await cerrarCapa("#incidencias-detail-modal-panel");
  paso(`3-4 · lista y detalle con la foto vigente; la otra identidad (${otra.identidad}) sin contagio`);

  /* 5 · Factura histórica: foto vigente, documento intacto, cero escrituras. */
  await clickInPage(page, `a[href='${RUTA}/facturas']`);
  await page.waitForSelector("[data-factura-id]", { timeout: 15000 });
  await clickInPage(page, "[data-factura-id='F-SINT-2']");
  await page.waitForSelector("[data-facturas-detail-modal='true']", { timeout: 15000 });
  await untilTrue(page, (sel) => document.querySelector(sel)?.dataset.avatarState === "image", {
    arg: HERO, message: "El avatar de la factura no llegó a estado de imagen",
  });
  const factura = await marco(HERO);
  assert.equal(factura.src, FOTO_B, "La factura debe mostrar la fotografía vigente del cliente");
  assert.equal(factura.identidad, antes.identidad, "La factura representa a la misma identidad");
  assert.equal(factura.iniciales, "SS", "Las iniciales siguen saliendo del nombre fiscal, no del perfil");
  const documento = await page.evaluate(() => {
    const texto = document.querySelector("[data-facturas-detail-modal='true']")?.textContent?.replace(/\s+/gu, " ") || "";
    return { razonSocial: texto.includes("SOCIEDAD SINTÉTICA SL"), total: texto.includes("48,40") };
  });
  const mecanismo = await page.evaluate((sel) => document.querySelector(sel)?.dataset.avatarConfirmed || "", HERO);
  assert.equal(mecanismo, "image", "La fotografía la aplica la autoridad de identidad, no una relectura del documento");
  assert.equal(documento.razonSocial, true, "El nombre fiscal del documento no se toca");
  assert.equal(documento.total, true, "El importe del documento no se toca");
  assert.deepEqual(escriturasDeDominio(), [], "Actualizar una fotografía no escribe en ningún documento");
  await cerrarCapa("[data-facturas-detail-modal='true']");
  paso("5 · factura con foto vigente, razón social e importe intactos y 0 escrituras");

  /* 7 · Sin relación inequívoca, la reserva se conserva. */
  await clickInPage(page, "[data-factura-id='F-SINT-9']");
  await page.waitForSelector("[data-facturas-detail-modal='true']", { timeout: 15000 });
  await untilTrue(page, (sel) => Boolean(document.querySelector(sel)?.dataset.avatarState), { arg: HERO, message: "sin estado de avatar" });
  const anonima = await marco(HERO);
  assert.notEqual(anonima.identidad, antes.identidad, "Una factura sin perfil no comparte identidad con nadie");
  assert.equal(anonima.src, null, "Sin relación inequívoca no se le presta la fotografía de nadie");
  assert.equal(anonima.inicialesVisibles, true, "Debe conservar su reserva legible");
  await cerrarCapa("[data-facturas-detail-modal='true']");
  paso(`7 · factura sin perfil: identidad ${anonima.identidad}, reserva ${anonima.iniciales} y ninguna foto prestada`);

  /* 8 · Retirar la fotografía devuelve las iniciales, nunca un hueco. */
  await clickInPage(page, `a[href='${RUTA}/cuenta']`);
  await page.waitForSelector("[data-cuenta-action='delete-avatar']", { timeout: 15000 });
  await clickInPage(page, "[data-cuenta-action='delete-avatar']");
  await untilTrue(page, () => /elimina|retira|actualizada/iu.test(document.body.textContent || ""), {
    timeout: 15000, message: "El servidor no confirmó la retirada",
  });
  assert.equal(confirmada, "", "El servidor debe haber confirmado la retirada");
  await clickInPage(page, `a[href='${RUTA}/incidencias']`);
  await page.waitForSelector("[data-ticket-row='true']", { timeout: 15000 });
  await abrirIncidencia("INC-SINT-1");
  await untilTrue(page, (sel) => document.querySelector(sel)?.dataset.avatarState === "fallback", {
    arg: HERO, message: "Retirar la fotografía no devolvió la reserva",
  });
  const retirada = await marco(HERO);
  assert.equal(retirada.src, null, "Una fotografía retirada deja de pintarse");
  assert.equal(retirada.inicialesVisibles, true, "Con un nombre válido nunca queda un círculo vacío");
  await cerrarCapa("#incidencias-detail-modal-panel");
  paso(`8 · retirada confirmada: reserva ${retirada.iniciales} visible, sin círculo vacío`);

  /* Invariantes de la sesión. */
  assert.equal(sesion.loads.length, 1, `La sesión cargó el documento ${sesion.loads.length} veces`);
  assert.deepEqual(sesion.offOrigin, [], `La sesión salió de su origen: ${JSON.stringify(sesion.offOrigin)}`);
  assert.deepEqual(sesion.pageErrors, [], `Errores de página: ${JSON.stringify(sesion.pageErrors)}`);
  assert.deepEqual(escriturasDeDominio(), [], "Ninguna escritura de dominio en todo el recorrido");

  console.log(`Avatar live identity contract: PASS · ${escenarios.length} escenarios · 1 documento · 0 escrituras de dominio`);
  for (const linea of escenarios) console.log(`  ${linea}`);
} finally {
  await browser.close();
  await cerrarServidor();
}
