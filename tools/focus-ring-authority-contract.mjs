/* =========================================================
   Onion Support · El anillo de foco lo declara una sola hoja
   Archivo: /tools/focus-ring-authority-contract.mjs

   QUÉ PROTEGE ESTO

   El indicador de foco se pintaba con `box-shadow`, y dos `box-shadow` sobre
   el mismo elemento no se suman: se sustituyen. De ahí salieron 67 reglas
   repartidas por 29 hojas repitiendo `box-shadow: var(--focus-ring)`, cada una
   intentando recuperar un anillo que la regla de al lado le borraba.

   Llevar la autoridad a la última capa dejó el problema al revés: entonces era
   el ANILLO el que borraba la sombra del componente. Medido en navegador sobre
   `.ui-btn-primary`, con la transición asentada: dos sombras en reposo, una
   sola --el anillo-- al enfocar.

   El anillo es ahora un `outline`, que es otra propiedad y convive con la
   sombra. Con eso las 67 sobran; pero si alguien vuelve a escribir una, se
   pintarían DOS anillos, uno de sombra y otro de contorno, y nadie lo vería en
   un diff.

   Este contrato es barato y se ejecuta en `validate:source`: el que mide que
   el anillo se VE es `tools/focus-visible-browser-contract.mjs`.
========================================================= */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const postcss = require("postcss");
const { list } = postcss;

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const AUTHORITY = "src/css/components/focus-system.css";

/* El piloto de onboarding usa el token del anillo para ILUMINAR la tarjeta que
   la guía señala, junto con un velo de pantalla completa. No es un indicador
   de foco --la tarjeta no está enfocada-- y no compite con nadie. */
const DECORATIVE = new Map([
  ["src/css/compositions/home-onboarding-pilot.css", 2],
]);

const walk = (dir, out = []) => {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (path.endsWith(".css")) out.push(path);
  }
  return out;
};

const files = [...walk("src/css"), ...walk("src/features")];
assert.ok(files.length >= 60, `se esperaban al menos 60 hojas y hay ${files.length}`);

/* =========================================================
   1 · LA AUTORIDAD DECLARA UN CONTORNO, NO UNA SOMBRA
========================================================= */

const authority = readFileSync(join(ROOT, AUTHORITY), "utf8");
const authorityRoot = postcss.parse(authority);

let ringRule = null;
authorityRoot.walkRules((rule) => {
  if (ringRule || rule.parent.type === "atrule") return;
  if (/:focus-visible\s*$/.test(rule.selector)) ringRule = rule;
});
assert.ok(ringRule, `${AUTHORITY} ya no declara la regla del anillo`);

const props = ringRule.nodes.filter((n) => n.type === "decl").map((n) => n.prop);
assert.ok(props.includes("outline"), `${AUTHORITY}: el anillo tiene que ser un outline`);
assert.ok(
  !props.includes("box-shadow"),
  `${AUTHORITY}: el anillo ha vuelto a ser una sombra; volvería a competir con la de cada componente`
);

const outline = ringRule.nodes.find((n) => n.type === "decl" && n.prop === "outline");
assert.ok(
  /var\(--focus-ring-width\)/.test(outline.value) && /var\(--focus-ring-color\)/.test(outline.value),
  `${AUTHORITY}: el anillo no sale de los tokens (${outline.value})`
);
assert.ok(
  !/transparent/.test(outline.value),
  `${AUTHORITY}: el anillo es transparente; era el hueco del mecanismo anterior`
);

/* Los cuatro tramos de tema declaran los tokens. */
for (const [file, count] of [["src/css/tokens/light.css", 2], ["src/css/tokens/variables.css", 2]]) {
  const css = readFileSync(join(ROOT, file), "utf8");
  for (const token of ["--focus-ring-width", "--focus-ring-color"]) {
    const found = css.split(`${token}:`).length - 1;
    assert.equal(found, count, `${file}: ${token} declarado ${found} veces, se esperaban ${count}`);
  }
}

/* =========================================================
   2 · NADIE VUELVE A PINTAR EL ANILLO CON UNA SOMBRA
========================================================= */

const offenders = [];
const decorativeSeen = new Map();

for (const file of files) {
  if (file === AUTHORITY) continue;
  const css = readFileSync(join(ROOT, file), "utf8");
  if (!css.includes("--focus-ring")) continue;

  postcss.parse(css).walkDecls("box-shadow", (decl) => {
    const terms = list.comma(decl.value).filter((term) => /var\(--focus-ring(-strong)?\)/.test(term));
    if (!terms.length) return;
    if (DECORATIVE.has(file)) {
      decorativeSeen.set(file, (decorativeSeen.get(file) || 0) + 1);
      return;
    }
    offenders.push(`${file}  ${decl.parent.selector.replace(/\s+/g, " ").trim()}\n     box-shadow: ${decl.value.replace(/\s+/g, " ")}`);
  });
}

assert.deepEqual(
  offenders,
  [],
  `hay ${offenders.length} regla(s) pintando el anillo con una sombra. Se verían DOS anillos, ` +
    `uno de sombra y otro de contorno:\n  ${offenders.join("\n  ")}`
);

/* Y los usos decorativos declarados siguen siendo exactamente los que se
   revisaron: si aparece uno nuevo, hay que mirarlo, no darlo por decorativo. */
for (const [file, expected] of DECORATIVE) {
  assert.equal(
    decorativeSeen.get(file) || 0,
    expected,
    `${file}: se declararon ${expected} usos decorativos del token y hay ${decorativeSeen.get(file) || 0}`
  );
}

console.log(
  `Focus ring authority contract: PASS · ${files.length} hojas revisadas · ` +
    `el anillo es un outline y ninguna hoja lo repite con box-shadow ` +
    `(${[...DECORATIVE.values()].reduce((a, b) => a + b, 0)} usos decorativos declarados)`
);
