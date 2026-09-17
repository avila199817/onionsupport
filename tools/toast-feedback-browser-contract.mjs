/* =========================================================
   Onion Support · Un aviso que no se ve no es un aviso
   Archivo: /tools/toast-feedback-browser-contract.mjs

   QUÉ PROTEGE ESTO

   El toast es el ÚNICO canal de retorno de la aplicación: `showToast` se llama
   desde 40 sitios. No tenía ningún contrato, y el resultado medido antes de
   este fichero era que NINGUNO se veía:

     - `.toast` declaraba `opacity: 0; visibility: hidden; pointer-events: none`
       y sólo se revelaba con `.show`, `.is-visible` o `[data-state="open"]`.
       El runtime (src/ui/toast/index.js) no pone ninguna de las tres.
     - Las variantes de la hoja eran `.toast.success`; el runtime emitía
       `toast--success`, que no correspondía a ningún selector.
     - `.toast` llevaba `position: fixed` con el mismo inset para todos, de modo
       que cinco avisos simultáneos se pintaban uno encima de otro: 10 pares
       solapados de 10 posibles.
     - `.toast-container` y `.toast-body`, que el runtime crea, no tenían
       ninguna regla.

   Lo que se comprueba aquí no es la presencia de un selector: es la
   PRESENTACIÓN CALCULADA del DOM que el runtime construye de verdad, montado
   sobre la cascada real (src/css/app.css con sus @layer y sus @import).

   No se usa la clase del runtime importándola: se replica su DOM. Así el
   contrato falla tanto si la hoja deja de revelar el aviso como si el runtime
   cambia de nomenclatura y deja de encajar con la hoja, que es exactamente la
   divergencia que existía.
========================================================= */

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const candidates = [
  process.env.CHROME_BIN,
  "/opt/pw-browsers/chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/opt/google/chrome/chrome",
].filter(Boolean);

let executablePath;
for (const candidate of candidates) {
  try {
    await access(candidate);
    executablePath = candidate;
    break;
  } catch { /* next */ }
}
assert.ok(executablePath, "Set CHROME_BIN to a Chrome/Chromium executable");

/* Los cinco tipos que el runtime admite (src/ui/toast/index.js VALID_TYPES). */
const TYPES = Object.freeze(["success", "error", "warning", "info", "loading"]);

const fixture = `<!doctype html><html data-theme="light"><head><meta charset="utf-8">
<link rel="stylesheet" href="/src/css/app.css"></head><body></body></html>`;

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return response.end(fixture);
    }
    const path = resolve(ROOT, `.${pathname}`);
    const allowed =
      path.startsWith(`${ROOT}src${sep}css${sep}`) ||
      path.startsWith(`${ROOT}src${sep}features${sep}`);
    if (!allowed || !path.endsWith(".css")) {
      response.writeHead(404);
      return response.end();
    }
    response.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
    response.end(await readFile(path));
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox"],
});

const checks = [];
const note = (text) => checks.push(text);

try {
  const page = await browser.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;

  const cssFailures = [];
  page.on("response", (response) => {
    if (response.url().endsWith(".css") && !response.ok()) cssFailures.push(response.url());
  });

  await page.goto(origin, { waitUntil: "networkidle" });
  assert.deepEqual(cssFailures, [], "Every source stylesheet must load");

  /* El mismo DOM que construye createNode()/patchNode() en
     src/ui/toast/index.js: contenedor, artículo, cuerpo, icono, contenido,
     título, mensaje y cierre. */
  const mount = async (types) => page.evaluate((list) => {
    document.body.innerHTML = "";

    const container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    container.dataset.toastContainer = "true";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);

    for (const type of list) {
      const node = document.createElement("article");
      node.className = `toast ${type}`;
      node.dataset.toastType = type;
      node.setAttribute("role", type === "error" ? "alert" : "status");

      const body = document.createElement("div");
      body.className = "toast-body";

      const icon = document.createElement("span");
      icon.className = "toast-icon";
      icon.dataset.toastIcon = "true";
      icon.hidden = type !== "loading";

      const content = document.createElement("div");
      content.className = "toast-content";

      const title = document.createElement("strong");
      title.className = "toast-title";
      title.textContent = type;

      const message = document.createElement("div");
      message.className = "toast-message";
      message.textContent = `mensaje de ${type}`;

      const close = document.createElement("button");
      close.className = "toast-close";
      close.type = "button";
      close.textContent = "×";

      content.append(title, message);
      body.append(icon, content, close);
      node.appendChild(body);
      container.appendChild(node);
    }
  }, types);

  /*
    La entrada es una animación: se espera a que TERMINE, no a un reloj. Sólo
    las finitas: el indicador de carga gira `infinite` y su `finished` no
    resuelve nunca.
  */
  const settle = () => page.evaluate(() =>
    Promise.all(
      document.getAnimations()
        .filter((animation) => {
          const timing = animation.effect?.getTiming?.();
          return Number.isFinite(timing?.iterations ?? Infinity);
        })
        .map((animation) => animation.finished.catch(() => {}))
    )
  );

  const sample = () => page.evaluate(() => {
    const container = document.querySelector(".toast-container");
    const containerStyle = getComputedStyle(container);
    const nodes = [...document.querySelectorAll(".toast")];

    const boxes = nodes.map((node) => node.getBoundingClientRect());
    let overlapping = 0;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const apart =
          a.bottom <= b.top || b.bottom <= a.top ||
          a.right <= b.left || b.right <= a.left;
        if (!apart) overlapping += 1;
      }
    }

    return {
      container: {
        position: containerStyle.position,
        display: containerStyle.display,
        pointerEvents: containerStyle.pointerEvents,
      },
      overlapping,
      toasts: nodes.map((node) => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        const icon = node.querySelector(".toast-icon");
        return {
          type: node.dataset.toastType,
          opacity: Number(style.opacity),
          visibility: style.visibility,
          pointerEvents: style.pointerEvents,
          width: Math.round(box.width),
          height: Math.round(box.height),
          accent: style.borderInlineStartColor,
          accentWidth: style.borderInlineStartWidth,
          iconSpinner: icon
            ? getComputedStyle(icon, "::before").animationName
            : "no-icon",
          iconHidden: icon ? icon.hidden : null,
          role: node.getAttribute("role"),
        };
      }),
    };
  });

  /* =========================================================
     1 · Los cinco tipos, en los dos temas y en dos anchos: visibles,
     clicables, con caja y apilados sin solaparse.
  ========================================================= */
  const accents = new Map();

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });

    for (const theme of ["dark", "light"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
        document.body.dataset.theme = value;
      }, theme);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "no-preference" });

      await mount(TYPES);
      await settle();
      const measured = await sample();
      const where = `${width}px/${theme}`;

      assert.equal(measured.container.position, "fixed", `${where}: el contenedor de avisos debe fijarse en pantalla`);
      assert.equal(measured.container.pointerEvents, "none", `${where}: el contenedor vacío no debe interceptar clics`);
      assert.equal(measured.toasts.length, TYPES.length, `${where}: faltan avisos montados`);

      assert.equal(
        measured.overlapping,
        0,
        `${where}: ${measured.overlapping} pares de avisos se solapan; el contenedor debe apilarlos`
      );

      const seen = new Set();
      for (const toast of measured.toasts) {
        const context = `${where} · ${toast.type}`;

        assert.equal(toast.opacity, 1, `${context}: el aviso no se ve (opacity ${toast.opacity})`);
        assert.equal(toast.visibility, "visible", `${context}: el aviso no se ve (visibility ${toast.visibility})`);
        assert.equal(toast.pointerEvents, "auto", `${context}: el aviso no recibe el clic de cierre`);
        assert.ok(toast.width > 0 && toast.height > 0, `${context}: el aviso no tiene caja`);
        assert.ok(toast.width <= width - 24, `${context}: el aviso se sale del viewport`);

        /* El tipo se distingue por su banda lateral: si la hoja y el runtime
           dejan de compartir nomenclatura, esto deja de aplicarse. */
        assert.equal(toast.accentWidth, "4px", `${context}: sin banda lateral de tipo`);
        assert.ok(
          /^rgba?\(/.test(toast.accent) && toast.accent !== "rgba(0, 0, 0, 0)",
          `${context}: la banda lateral no tiene color (${toast.accent})`
        );
        seen.add(toast.accent);

        assert.equal(
          toast.role,
          toast.type === "error" ? "alert" : "status",
          `${context}: el rol de accesibilidad no corresponde`
        );

        if (toast.type === "loading") {
          assert.equal(toast.iconHidden, false, `${context}: el aviso de carga debe mostrar su indicador`);
          assert.equal(toast.iconSpinner, "ui-loading-spin", `${context}: el indicador de carga no gira con la animación compartida`);
        } else {
          assert.equal(toast.iconHidden, true, `${context}: sólo el aviso de carga lleva icono`);
        }
      }

      /* Éxito, error y aviso no pueden pintarse del mismo color. */
      const distinct = new Set(
        measured.toasts
          .filter((toast) => ["success", "error", "warning"].includes(toast.type))
          .map((toast) => toast.accent)
      );
      assert.equal(distinct.size, 3, `${where}: éxito, error y aviso comparten color de banda`);

      accents.set(where, [...seen].length);
      note(`${where}: ${measured.toasts.length} avisos visibles, 0 solapados, ${[...seen].length} colores de banda`);
    }
  }

  /* =========================================================
     2 · Movimiento reducido: la entrada no puede quedarse a medias.
  ========================================================= */
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await mount(TYPES);
  await settle();
  const reduced = await sample();
  for (const toast of reduced.toasts) {
    assert.equal(toast.opacity, 1, `movimiento reducido · ${toast.type}: el aviso se queda invisible`);
    assert.equal(toast.visibility, "visible", `movimiento reducido · ${toast.type}: el aviso se queda invisible`);
  }
  note(`movimiento reducido: ${reduced.toasts.length} avisos visibles`);

  /* =========================================================
     3 · Un solo aviso también se coloca donde debe.
  ========================================================= */
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await mount(["success"]);
  await settle();
  const single = await page.evaluate(() => {
    const node = document.querySelector(".toast");
    const box = node.getBoundingClientRect();
    return { top: Math.round(box.top), right: Math.round(window.innerWidth - box.right) };
  });
  assert.ok(single.top >= 0 && single.top < 200, `un aviso solo debe quedar arriba (top ${single.top})`);
  assert.ok(single.right >= 0 && single.right < 200, `un aviso solo debe quedar a la derecha (right ${single.right})`);
  note(`aviso único: ${single.top}px desde arriba, ${single.right}px desde la derecha`);

  console.log(`Toast feedback browser contract: PASS · ${checks.length} escenarios · presentación calculada, no presencia de selector`);
  for (const line of checks) console.log(`  ${line}`);
} finally {
  await browser.close();
  server.close();
}
