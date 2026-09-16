import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

// UNA REGLA SIN DECLARACIONES NO EXISTE, Y NADIE SE ENTERA.
//
// Al retirar un selector de una lista compartida es fácil llevarse también el bloque de
// declaraciones y dejar la lista terminada en coma. El resultado es una regla que el
// navegador descarta entera: los otros selectores de la lista pierden silenciosamente su
// declaración. Ocurrió al unificar el avatar del detalle — se quedó
// `.facturas-detail-btn,` seguido de `}` dentro de `@media (forced-colors: active)`, y con
// ello ocho superficies perdieron `forced-color-adjust: auto` en alto contraste.
//
// Ni el build, ni `check:dist`, ni los 23 contratos de navegador lo rechazaron. Este
// contrato sí: es sintaxis, no estilo.

async function* sheets(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sheets(path);
    else if (entry.name.endsWith(".css")) yield path;
  }
}

const roots = ["src/css", "src/features"];
const checked = [];

for (const root of roots) {
  for await (const path of sheets(root)) {
    const source = await readFile(path, "utf8");
    // Los comentarios pueden contener llaves y comas de ejemplo: no son sintaxis.
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, "");

    const open = (code.match(/\{/gu) || []).length;
    const close = (code.match(/\}/gu) || []).length;
    assert.equal(open, close, `${path}: llaves descompensadas (${open} frente a ${close})`);

    const dangling = code.match(/,\s*[{}]/u);
    assert.equal(
      dangling,
      null,
      `${path}: una lista de selectores termina en coma antes de ${dangling?.[0].trim().at(-1)} — la regla entera se descarta`
    );

    checked.push(path);
  }
}

assert.ok(checked.length >= 60, `se esperaban las hojas del proyecto, se leyeron ${checked.length}`);
assert.ok(
  checked.includes("src/css/views/facturas/detail.css") && checked.includes("src/css/components/detail-modal.css"),
  "las hojas del detalle deben estar dentro del barrido"
);

console.log(
  `CSS block integrity contract: PASS · ${checked.length} hojas · llaves equilibradas · ` +
    `ninguna lista de selectores sin bloque de declaraciones`
);
