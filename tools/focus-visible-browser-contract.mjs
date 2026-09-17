/* =========================================================
   Onion Support · El foco de teclado se ve, y sigue viéndose
   Archivo: /tools/focus-visible-browser-contract.mjs

   QUÉ PROTEGE ESTO

   Tres cosas rompían el indicador de foco, y las tres en silencio:

   1 · Estaba declarado en @layer core, la tercera de diez, y se pintaba con
       `box-shadow`. Las sombras no se suman: se sustituyen. Cualquier regla
       posterior con `box-shadow` sobre el mismo elemento borraba el indicador.
       Por eso 67 reglas del proyecto lo volvían a declarar.

   2 · El anillo no tenía contraste suficiente. WCAG 2.4.11 pide 3:1 para un
       indicador de foco. Medido contra la superficie real, antes de
       corregirlo: 1,19:1 en claro y 1,79:1 en oscuro.

   3 · Llevarlo a la última capa arregló el 1 al revés: al ganar siempre, el
       anillo BORRABA la sombra del componente. Medido en navegador sobre
       `.ui-btn-primary`, con la transición ya asentada: dos sombras en reposo,
       UNA sola al enfocar. Las doce reglas que declaraban
       `box-shadow: <su sombra>, var(--focus-ring)` para conservar las dos no
       conservaban ninguna.

   El anillo es ahora un `outline`, que es otra propiedad y convive con la
   sombra. Este contrato mide, en los dos temas y en tres casos --un botón sin
   sombra propia, uno con sombra en @layer components y otro con sombra en
   @layer views--:

     - que el anillo EXISTE como outline y no es transparente;
     - su CONTRASTE REAL sobre la superficie real;
     - y que la sombra decorativa del componente SIGUE ahí al enfocar, que es
       lo que el mecanismo anterior no podía dar.

   No comprueba que exista una regla: comprueba que el anillo se vea y que no
   se lleve nada por delante.
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

/* WCAG 2.4.11 · Focus Appearance. */
const MINIMUM_CONTRAST = 3;

/* Las superficies reales sobre las que se pinta un control enfocado:
   --card-bg en cada tema (tokens/light.css:1179 y tokens/variables.css). */
const SURFACES = Object.freeze({
  light: { css: "#ffffff", rgb: [255, 255, 255] },
  dark: { css: "#242424", rgb: [36, 36, 36] },
});

const fixture = `<!doctype html><html data-theme="light"><head><meta charset="utf-8">
<link rel="stylesheet" href="/src/css/app.css">
<style>
  body { padding: 40px; }
  button { padding: 12px 20px; }
  /* Sombra decorativa en capa, como la declaran las hojas del proyecto. */
  @layer components { .in-components { box-shadow: 0 8px 24px rgba(0,0,0,.18); } }
  @layer views { .in-views { box-shadow: 0 8px 24px rgba(0,0,0,.18); } }
</style></head><body>
<button id="plain">sin sombra propia</button>
<button id="in-components" class="in-components">sombra en components</button>
<button id="in-views" class="in-views">sombra en views</button>
</body></html>`;

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

/* =========================================================
   CONTRASTE · WCAG 2.1 relative luminance
========================================================= */

const channel = (value) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = ([r, g, b]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

const contrast = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};

const composite = ({ rgb, alpha }, background) =>
  rgb.map((value, index) => value * alpha + background[index] * (1 - alpha));

/* El primer color de la sombra calculada. `box-shadow` serializa el color
   delante de las longitudes. */
const parseShadowColor = (shadow) => {
  const match = String(shadow).match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some(Number.isNaN)) return null;
  return { rgb: parts.slice(0, 3), alpha: parts.length > 3 ? parts[3] : 1 };
};

/* Cuenta las sombras de un `box-shadow` calculado, respetando los paréntesis
   de `rgba(...)` y `color-mix(...)`. */
const countShadows = (value) =>
  String(value) === "none" ? 0 : String(value).split(/,(?![^(]*\))/).length;

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox"],
});

const measured = [];

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  const origin = `http://127.0.0.1:${server.address().port}`;

  const cssFailures = [];
  page.on("response", (response) => {
    if (response.url().endsWith(".css") && !response.ok()) cssFailures.push(response.url());
  });

  await page.goto(origin, { waitUntil: "networkidle" });
  assert.deepEqual(cssFailures, [], "Every source stylesheet must load");

  for (const [theme, surface] of Object.entries(SURFACES)) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
      document.body.dataset.theme = value;
    }, theme);
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate((value) => { document.body.style.background = value; }, surface.css);

    for (const id of ["plain", "in-components", "in-views"]) {
      /* La sombra decorativa ANTES de enfocar, para poder comprobar después
         que el anillo no se la ha llevado por delante. */
      const restShadows = countShadows(
        await page.evaluate((selector) => getComputedStyle(document.querySelector(selector)).boxShadow, `#${id}`)
      );

      /* Foco de TECLADO: `:focus-visible` no se activa con .focus() en un
         botón, así que se llega tabulando. */
      await page.evaluate(() => document.body.focus());
      await page.keyboard.press("Tab");
      let guard = 0;
      while (await page.evaluate(() => document.activeElement?.id) !== id && guard < 10) {
        await page.keyboard.press("Tab");
        guard += 1;
      }
      assert.equal(
        await page.evaluate(() => document.activeElement?.id),
        id,
        `${theme}/${id}: no se pudo enfocar con el teclado`
      );

      /* Las hojas declaran transiciones sobre box-shadow y sobre el color del
         outline. Leer inmediatamente devuelve valores a medio interpolar: hay
         que esperar a que la transición termine. */
      await page.evaluate(() => Promise.all(
        document.querySelectorAll("*").length ? [new Promise((r) => setTimeout(r, 400))] : []
      ));

      const style = await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        const computed = getComputedStyle(element);
        return {
          boxShadow: computed.boxShadow,
          outlineStyle: computed.outlineStyle,
          outlineWidth: computed.outlineWidth,
          outlineColor: computed.outlineColor,
          matchesFocusVisible: element.matches(":focus-visible"),
        };
      }, `#${id}`);

      assert.ok(style.matchesFocusVisible, `${theme}/${id}: el control no está en :focus-visible`);

      /* 1 · El anillo existe, es un contorno de verdad y tiene grosor. */
      assert.notEqual(
        style.outlineStyle,
        "none",
        `${theme}/${id}: el indicador de foco no está: no hay outline.`
      );
      assert.ok(
        parseFloat(style.outlineWidth) > 0,
        `${theme}/${id}: el outline tiene grosor ${style.outlineWidth}`
      );

      const color = parseShadowColor(style.outlineColor);
      assert.ok(color, `${theme}/${id}: no se pudo leer el color del anillo (${style.outlineColor})`);
      assert.ok(
        color.alpha > 0,
        `${theme}/${id}: el anillo es transparente (${style.outlineColor}). ` +
          `Era el hueco del mecanismo anterior: un outline invisible que sólo servía para forced-colors.`
      );

      /* 2 · Contraste real sobre la superficie real. */
      const ratio = contrast(composite(color, surface.rgb), surface.rgb);
      assert.ok(
        ratio >= MINIMUM_CONTRAST,
        `${theme}/${id}: el anillo de foco tiene ${ratio.toFixed(2)}:1 sobre ${surface.css}; ` +
          `WCAG 2.4.11 pide ${MINIMUM_CONTRAST}:1`
      );

      /* 3 · La sombra del componente sigue ahí. Esto es lo que el mecanismo
         anterior no podía dar: el anillo la sustituía. */
      const focusShadows = countShadows(style.boxShadow);
      assert.ok(
        focusShadows >= restShadows,
        `${theme}/${id}: al enfocar se pierden sombras del componente ` +
          `(${restShadows} en reposo, ${focusShadows} enfocado). El anillo vuelve a competir con ellas.`
      );

      measured.push(
        `${theme}/${id}: ${ratio.toFixed(2)}:1 sobre ${surface.css} · ` +
          `outline ${style.outlineWidth} · sombras ${restShadows}->${focusShadows}`
      );
    }
  }

  console.log(`Focus visible browser contract: PASS · ${measured.length} medidas · contraste real del anillo, no presencia de regla`);
  for (const line of measured) console.log(`  ${line}`);
} finally {
  await browser.close();
  server.close();
}
