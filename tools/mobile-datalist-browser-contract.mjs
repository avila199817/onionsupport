import assert from "node:assert/strict";

import {
  clickInPage, launchBrowser, openSpaSession, serveBuiltApp, syntheticWorld, untilTrue,
} from "./spa-session-harness.mjs";

// Exercise the deployed CSS graph, real route renderers and their real controls.
// Synthetic API responses are the only replacement; no test stylesheet or DOM.
const ACCOUNT = "/@u-admin-1";
const SCENARIOS = [...[320, 390, 520, 680, 1280].map((width) => ({ width, theme: "light" })), { width: 390, theme: "dark" }];
const VIEWS = { incidencias: 6, facturas: 6, clientes: 5, usuarios: 6 };
const LONG_EMAIL = `${"cliente.".repeat(9)}sintetico@example.test`;
const LONG_ID = `INC-${"IDENTIFICADOR".repeat(8)}`;
const LONG_TITLE = "Diagnóstico de conectividad y recuperación del equipo con una descripción extensa que debe poder leerse en móvil";

function fixtureWorld() {
  const world = syntheticWorld();
  Object.assign(world.titular, { email: LONG_EMAIL, createdAt: "2026-09-08T09:00:00Z", city: "Localidad sintética de nombre largo" });
  Object.assign(world.segundoTitular, { status: "pending", createdAt: "2026-09-08T09:00:00Z" });
  Object.assign(world.tickets[0], { id: LONG_ID, ticketId: LONG_ID, subject: LONG_TITLE, email: LONG_EMAIL });
  for (const invoice of world.facturas) {
    invoice.clienteEmail = LONG_EMAIL;
    invoice.cliente.email = LONG_EMAIL;
    invoice.ticketId = LONG_ID;
    invoice.incidenciaId = LONG_ID;
  }
  world.clientes = [world.titular, world.segundoTitular].map((person, index) => ({
    id: `CLI-SINT-${index}`, clienteId: `CLI-SINT-${index}`, userId: person.userId,
    nombreFiscal: index ? "Segundo cliente sintético" : "Cliente sintético con razón social extensa para comprobar el ajuste de texto",
    email: person.email, contactoEmail: person.email, phone: "+34 600 000 000", telefono: "+34 600 000 000",
    city: person.city || "Ciudad sintética", createdAt: person.createdAt,
    status: "active", tipo: "empresa", totalAmount: 12345.67,
  }));
  return world;
}

async function newSession(browser, origin, width, pending = null, theme = "light") {
  const session = await openSpaSession(browser, origin, {
    viewport: { width, height: 900 }, world: fixtureWorld(),
    api: async ({ path, world, respond }) => {
      if (pending?.path === path) await pending.promise;
      if (path !== "/api/clientes/page") return false;
      await respond({ ok: true, items: world.clientes, total: world.clientes.length, totalKnown: true, hasMore: false, nextCursor: "" });
      return true;
    },
  });
  await session.page.emulateMedia({ colorScheme: theme });
  return session;
}

const selectorFor = (view) => `.${view}-table tbody tr:not([aria-hidden='true'])`;

async function ready(page, view) {
  await untilTrue(page, (selector) => {
    const rows = [...document.querySelectorAll(selector)];
    return rows.length > 0 && rows.every((row) => row.dataset.mobileCard === "true");
  }, { arg: selectorFor(view), message: `${view}: no se pintaron las filas anotadas` });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
}

async function snapshot(page, view) {
  return page.evaluate(({ selector, view }) => {
    const rect = (node) => {
      const value = node.getBoundingClientRect();
      return { x: value.x, y: value.y, width: value.width, height: value.height, right: value.right, bottom: value.bottom };
    };
    const surface = (node) => {
      const style = getComputedStyle(node);
      return { radius: style.borderRadius, background: style.backgroundColor, padding: style.padding, border: style.borderTopWidth };
    };
    const rows = [...document.querySelectorAll(selector)].map((row) => {
      const style = getComputedStyle(row);
      const box = rect(row);
      return {
        box, surface: surface(row), display: style.display,
        contentX: box.x + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
        overflow: row.scrollWidth > row.clientWidth + 1,
        identityClips: [...row.querySelectorAll(".incidencias-ticket-id, .incidencias-client-email, .facturas-system-id, .facturas-factura-email, .clientes-contact-link span, .usuarios-email-inline")]
          .filter((node) => node.scrollWidth > node.clientWidth + 1)
          .map((node) => node.className || node.parentElement.className),
        cells: [...row.children].map((cell) => {
          const css = getComputedStyle(cell);
          return {
            slot: cell.dataset.mobileSlot, box: rect(cell), display: css.display, visibility: css.visibility,
            padding: css.padding, border: [css.borderTopWidth, css.borderRightWidth, css.borderBottomWidth, css.borderLeftWidth],
            text: cell.textContent.trim(), overflow: cell.scrollWidth > cell.clientWidth + 1,
          };
        }),
        controls: [...row.querySelectorAll("button, a[href]")].map((node) => ({
          box: rect(node), label: node.textContent.trim(), disabled: node.disabled === true,
        })),
      };
    });
    const table = document.querySelector(`.${view}-table`);
    const shell = table.closest(`.${view}-table-shell`);
    const heading = table.querySelector("thead");
    const shellBox = rect(shell);
    const layout = (node) => {
      const style = getComputedStyle(node);
      return {
        node: `${node.tagName}.${String(node.className).replaceAll(" ", ".")}`,
        box: rect(node), scrollWidth: node.scrollWidth, clientWidth: node.clientWidth,
        display: style.display, position: style.position, width: style.width,
        minWidth: style.minWidth, maxWidth: style.maxWidth, boxSizing: style.boxSizing,
        overflowX: style.overflowX, overflowY: style.overflowY, font: style.font,
        margin: style.margin, padding: style.padding,
        transition: style.transition,
        animations: node.getAnimations().map((animation) => ({
          property: animation.transitionProperty || animation.animationName,
          state: animation.playState, time: animation.currentTime,
        })),
      };
    };
    const shellOverflow = shell.scrollWidth > shell.clientWidth + 1;
    return {
      rows, tableDisplay: getComputedStyle(table).display,
      shellOverflow,
      shellDiagnostics: shellOverflow ? {
        shell: layout(shell), table: layout(table),
        outside: [...shell.querySelectorAll("*")].filter((node) => {
          const box = rect(node);
          return box.width > 0 && (box.x < shellBox.x - 1 || box.right > shellBox.right + 1);
        }).map(layout).slice(0, 24),
      } : null,
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      heading: { box: rect(heading), display: getComputedStyle(heading).display, clip: getComputedStyle(heading).clipPath },
    };
  }, { selector: selectorFor(view), view });
}

function verifyGeometry(data, view, width, homeSurface) {
  const label = `${view} @ ${width}`;
  assert.equal(data.pageOverflow, false, `${label}: overflow horizontal de página`);
  for (const row of data.rows) {
    assert.equal(row.cells.length, VIEWS[view], `${label}: se perdió una celda`);
    if (width > 680) {
      assert.equal(row.display, "table-row", `${label}: desktop debe conservar filas de tabla`);
      assert.ok(row.cells.every((cell) => cell.display === "table-cell"), `${label}: desktop debe conservar celdas de tabla`);
      continue;
    }
    assert.equal(data.shellOverflow, false, `${label}: overflow horizontal del listado: ${JSON.stringify(data.shellDiagnostics)}`);
    assert.equal(row.overflow, false, `${label}: contenido desborda la fila`);
    assert.deepEqual(row.identityClips, [], `${label}: identidad o email largo truncado`);
    assert.deepEqual(row.surface, homeSurface, `${label}: superficie distinta de Home`);
    let lineY = -Infinity;
    let previousRight = row.contentX;
    for (const cell of row.cells) {
      assert.notEqual(cell.display, "none", `${label}: ${cell.slot} oculto`);
      assert.notEqual(cell.visibility, "hidden", `${label}: ${cell.slot} invisible`);
      assert.ok(cell.box.width > 0 && cell.box.height > 0, `${label}: ${cell.slot} sin caja visible`);
      assert.ok(cell.box.x >= row.box.x - 1 && cell.box.right <= row.box.right + 1, `${label}: ${cell.slot} sale de la tarjeta`);
      assert.equal(cell.overflow, false, `${label}: ${cell.slot} desborda o queda recortado`);
      assert.equal(cell.padding, "0px", `${label}: ${cell.slot} hereda padding de tabla desktop`);
      assert.ok(cell.border.every((value) => value === "0px"), `${label}: ${cell.slot} hereda separadores de tabla desktop`);
      if (cell.box.y > lineY + 1) {
        assert.ok(Math.abs(cell.box.x - row.contentX) <= 1, `${label}: ${cell.slot} inicia una fila escalonada`);
        lineY = cell.box.y;
      } else {
        assert.ok(Math.abs(cell.box.y - lineY) <= 1 && cell.box.x >= previousRight - 1, `${label}: orden de lectura discontinuo en ${cell.slot}`);
      }
      previousRight = cell.box.right;
    }
    for (const control of row.controls) {
      assert.ok(control.box.width > 0 && control.box.height > 0, `${label}: control ${control.label} oculto`);
      assert.ok(control.box.x >= row.box.x - 1 && control.box.right <= row.box.right + 1, `${label}: control ${control.label} recortado`);
      assert.ok(control.box.y >= row.box.y - 1 && control.box.bottom <= row.box.bottom + 1, `${label}: control ${control.label} fuera de la tarjeta`);
    }
  }
  if (width > 680) {
    assert.equal(data.tableDisplay, "table");
    assert.equal(data.heading.display, "table-header-group");
    assert.ok(data.heading.box.height > 1 && data.heading.clip === "none", `${label}: cabecera desktop oculta`);
  }
}

function geometryKey(data) {
  return data.rows.map((row) => ({
    surface: row.surface, width: Math.round(row.box.width), height: Math.round(row.box.height),
    cells: row.cells.map((cell) => [cell.slot, Math.round(cell.box.x - row.box.x), Math.round(cell.box.y - row.box.y), Math.round(cell.box.width), Math.round(cell.box.height)]),
  }));
}

async function homeSurface(page) {
  await untilTrue(page, () => Boolean(document.querySelector(".home-activity-list .home-entity-row")), { message: "Home no pintó actividad" });
  await page.evaluate(() => document.fonts.ready);
  return page.locator(".home-activity-list .home-entity-row").first().evaluate((row) => {
    const style = getComputedStyle(row);
    return { radius: style.borderRadius, background: style.backgroundColor, padding: style.padding, border: style.borderTopWidth };
  });
}

async function focusRing(page, locator) {
  await page.keyboard.press("Tab");
  await locator.focus();
  return locator.evaluate((node) => {
    const style = getComputedStyle(node);
    return { visible: node.matches(":focus-visible"), width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor, offset: style.outlineOffset };
  });
}

async function verifyImmediateAdaptation(page, view) {
  const adaptation = await page.evaluate((name) => {
    const table = document.querySelector(`.${name}-table`);
    const shell = table.closest(`.${name}-table-shell`);
    // Reproduce the real adapter's class change from the unannotated table.
    // Settle only the fixture's starting state, then measure in the same task
    // as annotation: waiting for an animation would conceal a visible jump.
    table.classList.remove("ui-datalist");
    getComputedStyle(table).minWidth;
    for (const animation of table.getAnimations()) animation.finish();
    const before = table.getBoundingClientRect().width;
    table.classList.add("ui-datalist");
    return {
      before, after: table.getBoundingClientRect().width, available: shell.clientWidth,
      minWidth: getComputedStyle(table).minWidth,
      animations: table.getAnimations().map((animation) => ({ property: animation.transitionProperty, state: animation.playState })),
    };
  }, view);
  assert.ok(adaptation.before > adaptation.available, `${view}: la regresión debe partir del ancho desktop`);
  assert.ok(adaptation.after <= adaptation.available + 1, `${view}: la adaptación móvil debe ser inmediata con reduced motion: ${JSON.stringify(adaptation)}`);
  assert.equal(adaptation.animations.some(({ property }) => /(?:width|height|size)/.test(property || "")), false,
    `${view}: no debe animarse la geometría al adaptar la tabla: ${JSON.stringify(adaptation)}`);
}

async function verifyInteractions(page, view, homeFocus) {
  if (view === "incidencias") {
    const row = page.locator(selectorFor(view)).first();
    const focused = await focusRing(page, row);
    assert.equal(focused.visible, true, "La fila tiene foco de teclado visible");
    assert.ok(parseFloat(focused.width) > 0 && focused.style !== "none", "El indicador de foco de teclado es visible");
    assert.deepEqual(focused, homeFocus, "Home y la fila consumen el mismo indicador de foco");
    assert.equal(await row.evaluate((node) => node === document.activeElement), true, "La fila de Incidencias recibe foco");
    await page.keyboard.press("Enter");
    await page.locator("#incidencias-detail-modal-panel").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await page.locator("#incidencias-detail-modal-panel").waitFor({ state: "hidden" });
  }
  if (view === "facturas") {
    const actions = page.locator(`${selectorFor(view)} .facturas-actions`).last();
    assert.equal(await actions.locator("button").count(), 4, "Las cuatro acciones de Facturas siguen presentes");
    for (const button of await actions.locator("button:not(:disabled)").all()) {
      await button.focus();
      assert.equal(await button.evaluate((node) => document.activeElement === node), true, "Acción de Facturas recibe foco");
    }
  }
  if (view === "clientes") {
    assert.ok(await page.locator(`${selectorFor(view)} a[href^='mailto:']`).count(), "Contacto email conservado");
    assert.ok(await page.locator(`${selectorFor(view)} a[href^='tel:']`).count(), "Contacto teléfono conservado");
  }
  if (view === "usuarios") {
    const activation = page.locator(`${selectorFor(view)} button[data-usuarios-action='resend-activation']`);
    assert.ok(await activation.count(), "Acción de activación pendiente conservada");
    await activation.first().focus();
    assert.equal(await activation.first().evaluate((node) => document.activeElement === node), true);
  }
}

const server = await serveBuiltApp({ spaFallback: true });
let browser;
let cases = 0;
try {
  browser = await launchBrowser();
  for (const { width, theme } of SCENARIOS) {
    const warm = await newSession(browser, server.origin, width, null, theme);
    try {
      await warm.page.goto(`${server.origin}${ACCOUNT}`, { waitUntil: "load" });
      const surface = await homeSurface(warm.page);
      assert.equal(await warm.page.locator("html").getAttribute("data-theme"), theme, "El tema solicitado está activo");
      const homeFocus = width === 390 ? await focusRing(warm.page, warm.page.locator(".home-activity-list .home-entity-row").first()) : null;
      for (const view of Object.keys(VIEWS)) {
        const cold = await newSession(browser, server.origin, width, null, theme);
        try {
          await cold.page.goto(`${server.origin}${ACCOUNT}/${view}`, { waitUntil: "load" });
          await ready(cold.page, view);
          const first = await snapshot(cold.page, view);
          verifyGeometry(first, view, width, surface);
          await clickInPage(warm.page, `a[href='${ACCOUNT}/${view}']`);
          await ready(warm.page, view);
          const afterHome = await snapshot(warm.page, view);
          verifyGeometry(afterHome, view, width, surface);
          assert.deepEqual(geometryKey(afterHome), geometryKey(first), `${view} @ ${width}: estilos dependen de haber visitado Home`);
          if (width === 390 && theme === "light") {
            await verifyImmediateAdaptation(cold.page, view);
            cases += 1;
          }
          if (width === 390) await verifyInteractions(cold.page, view, homeFocus);
          assert.deepEqual(cold.pageErrors, [], `${view} @ ${width}: errores de navegador`);
          assert.equal(cold.writes.filter(({ path }) => !path.startsWith("/api/auth/")).length, 0, "Ninguna escritura de dominio");
          cases += 1;
        } finally {
          await cold.context.close();
        }
      }
      assert.deepEqual(warm.pageErrors, [], `Sesión caliente @ ${width}: errores de navegador`);
    } finally {
      await warm.context.close();
    }
  }

  // Hold the list response until the real loading state has been measured.
  for (const [view, path, skeletonSelector] of [
    ["incidencias", "/api/tickets", ".incidencias-row--skeleton"],
    ["facturas", "/api/facturas", ".facturas-table-loading-row"],
    ["clientes", "/api/clientes/page", ".clientes-table-loading-row"],
  ]) {
    let release;
    const pending = { path, promise: new Promise((done) => { release = done; }) };
    const session = await newSession(browser, server.origin, 320, pending);
    try {
      await session.page.goto(`${server.origin}${ACCOUNT}/${view}`, { waitUntil: "load" });
      const skeleton = session.page.locator(skeletonSelector).first();
      await skeleton.waitFor({ state: "visible" });
      await session.page.evaluate(() => document.fonts.ready);
      // Stats may replace a visible loading row before its list response arrives.
      // Measure the connected DOM and wait for stable geometry, never for a pass.
      let loading = null;
      let previous = null;
      for (let frame = 0; frame < 60; frame += 1) {
        await session.page.evaluate(() => new Promise((done) => requestAnimationFrame(done)));
        loading = await session.page.evaluate((selector) => {
          const row = document.querySelector(selector);
          if (!row?.isConnected) return null;
          const bounds = row.getBoundingClientRect();
          const style = getComputedStyle(row);
          const rows = [...document.querySelectorAll(selector)];
          return {
            fits: bounds.width > 0 && bounds.x >= 0 && bounds.right <= innerWidth + 1 && row.scrollWidth <= row.clientWidth + 1,
            x: bounds.x, right: bounds.right, width: bounds.width,
            scrollWidth: row.scrollWidth, clientWidth: row.clientWidth,
            columns: style.gridTemplateColumns,
            rowCount: rows.length,
            parts: rows.map((placeholder) => {
              const rowBox = placeholder.getBoundingClientRect();
              return [...placeholder.querySelectorAll(".incidencias-skeleton")].map((part) => {
                const box = part.getBoundingClientRect();
                return {
                  name: part.className, width: box.width, height: box.height,
                  fits: box.x >= rowBox.x - 1 && box.right <= rowBox.right + 1 && box.y >= rowBox.y - 1 && box.bottom <= rowBox.bottom + 1,
                };
              });
            }),
          };
        }, skeletonSelector);
        if (loading?.width > 0 && JSON.stringify(previous) === JSON.stringify(loading)) break;
        previous = loading;
      }
      assert.ok(loading?.width > 0, `${view}: skeleton desmontado antes de medir`);
      assert.equal(loading.fits, true, `${view}: el skeleton se desborda a 320px: ${JSON.stringify(loading)}`);
      if (view === "incidencias") {
        assert.equal(loading.rowCount, 6, "Incidencias debe crear sólo seis filas de carga");
        for (const parts of loading.parts) {
          assert.equal(parts.length, 6, "Cada fila de carga conserva sus seis columnas");
          for (const part of parts) {
            assert.ok(part.width > 0 && part.height > 0 && part.fits,
              `Incidencias: cada placeholder debe tener dimensión visible sin desbordar: ${JSON.stringify(part)}`);
          }
        }
      }
      release();
      await ready(session.page, view);
      cases += 1;
    } finally {
      release();
      await session.context.close();
    }
  }
  console.log(`Mobile datalist browser: PASS (${cases} escenarios, entrada fría/caliente, Home, texto largo, acciones, carga y adaptación inmediata).`);
} finally {
  await browser?.close();
  await server.close();
}
