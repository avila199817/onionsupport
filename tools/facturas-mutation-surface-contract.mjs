import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/*
  Contrato: superficie de mutación de facturas alineada con el backend.

  El backend (oniontech router/facturas/index.js) solo expone mutaciones por
  comandos POST: creación, envío y registro de pago. No existe PUT, PATCH ni
  DELETE sobre /api/facturas/:id (404). El frontend mantenía esas tres
  operaciones en cuatro capas (base → boundary → alias-core → facade) sin
  ningún consumidor y con un fallback que degradaba PUT→PATCH→POST. Este
  contrato impide que reaparezcan sin una ruta backend real.
*/

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API_FILES = [
  "src/views/facturas/facturas.api.base.js",
  "src/views/facturas/facturas.api.boundary.js",
  "src/views/facturas/facturas.api.alias-core.js",
  "src/views/facturas/facturas.api.canonical.js",
  "src/views/facturas/facturas.api.js",
];
const RETIRED = /\b(?:update|patch|remove|delete)(?:Factura|Invoice)(?:Request)?\b/u;
const RETIRED_HELPERS = /\b(?:putJson|patchJson|deleteJson)\b/u;

const read = (path) => readFileSync(resolve(ROOT, path), "utf8");

for (const file of API_FILES) {
  const source = read(file);
  assert.doesNotMatch(source, RETIRED, `${file}: la mutación PUT/PATCH/DELETE de facturas está retirada (el backend no la expone)`);
  assert.doesNotMatch(source, RETIRED_HELPERS, `${file}: helpers de escritura sin ruta backend`);
}

const base = read("src/views/facturas/facturas.api.base.js");
assert.doesNotMatch(base, /method === "(?:PUT|PATCH|DELETE)"/u, "httpRequest ya no enruta PUT/PATCH/DELETE");
assert.doesNotMatch(base, /Http\.(?:put|patch|delete|del)\b/u, "sin transporte PUT/PATCH/DELETE en facturas");
assert.doesNotMatch(base, /return httpRequest\("(?:PATCH|POST)", endpoint, body, options\)/u, "sin degradación de método (PUT→PATCH→POST)");
assert.match(base, /async function postJson\(/u, "los comandos POST siguen existiendo");
for (const name of ["createFacturaRequest", "createFactura", "sendFacturaRequest", "sendFactura", "markFacturaPaidRequest", "markFacturaPaid"]) {
  assert.match(base, new RegExp(`export async function ${name}\\(`, "u"), `${name} se conserva`);
}
assert.match(base, /CREATE \/ SEND \/ PAYMENT/u, "la sección documenta la superficie real");

// Ningún consumidor fuera de la API puede depender de la superficie retirada.
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(?:js|mjs)$/u.test(entry)) out.push(full);
  }
  return out;
}
const offenders = walk(resolve(ROOT, "src"))
  .map((full) => relative(ROOT, full))
  .filter((file) => !API_FILES.includes(file))
  .filter((file) => RETIRED.test(read(file)));
assert.deepEqual(offenders, [], "consumidores de la superficie retirada");

const pkg = JSON.parse(read("package.json"));
assert.match(pkg.scripts["validate:source"], /node tools\/facturas-mutation-surface-contract\.mjs/u, "el contrato se ejecuta en validate:source");

console.log("facturas-mutation-surface-contract: OK · sin PUT/PATCH/DELETE de facturas en 5 capas · sin consumidores · comandos POST intactos");
