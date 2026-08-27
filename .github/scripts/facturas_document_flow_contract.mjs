import assert from "node:assert/strict";
import fs from "node:fs";

const apiPath = new URL("../../src/views/facturas/facturas.api.js", import.meta.url);
const basePath = new URL("../../src/views/facturas/facturas.api.base.js", import.meta.url);
const controllerPath = new URL("../../src/views/facturas/index.js", import.meta.url);

const api = fs.readFileSync(apiPath, "utf8");
const base = fs.readFileSync(basePath, "utf8");
const controller = fs.readFileSync(controllerPath, "utf8");

assert.match(api, /FACTURAS_DOCUMENT_FLOW_VERSION/);
assert.match(api, /import \* as Base from "\.\/facturas\.api\.base\.js"/);
assert.match(api, /export \* from "\.\/facturas\.api\.base\.js"/);

// Create debe hidratar inmediatamente con el detalle canónico antes de devolver
// el objeto al controlador, evitando insertar el snapshot parcial del POST.
assert.match(api, /export async function createFactura\(/);
assert.match(api, /const hydrated = await getFacturaById\(id/);
assert.match(api, /dedupe: false/);
assert.match(api, /return canonicalizeFactura\(created, response\)/);

// Detail debe pasar por la misma normalización documental.
assert.match(api, /export async function fetchFacturaDetailRequest\(/);
assert.match(api, /canonicalizeFactura\(response\?\.item\)/);
assert.match(api, /documentReady:/);

// Un Azure Blob privado sin SAS nunca puede ser una URL de acción.
assert.match(api, /isUnsignedAzureBlobUrl/);
assert.match(api, /\.blob\\\.core\\\.windows\\\.net/);
assert.match(api, /url\.searchParams\.get\("sig"\)/);
assert.match(api, /return !isUnsignedAzureBlobUrl\(raw\)/);

// PDF usa sólo una repetición acotada para aprovechar el self-heal backend.
assert.match(api, /requestPdfWithSingleRetry/);
assert.match(api, /force: true/);
assert.match(api, /hasActionablePdf/);

// La implementación histórica completa permanece disponible y no se duplica
// dentro del nuevo boundary.
assert.ok(base.length > api.length * 2, "base API should retain the historical implementation");
assert.match(base, /export async function listFacturas/);
assert.match(base, /export async function createFacturaRequest/);
assert.match(base, /export async function viewFacturaPdfRequest/);
assert.match(base, /export function syncFacturasListCache/);

// El controlador sigue consumiendo exclusivamente facturas.api.js; por tanto
// el boundary nuevo gobierna create/detail/PDF sin duplicar listeners o DOM.
assert.match(controller, /from "\.\/facturas\.api\.js"/);
assert.doesNotMatch(controller, /facturas\.api\.base\.js/);

console.log("Facturas document flow contract: PASS");
