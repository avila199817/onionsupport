import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();

function read(relative) {
  return fs.readFileSync(
    path.join(root, relative),
    "utf8"
  );
}

const service = read("src/features/entity-overlay/index.js");
const facturaAdapter = read(
  "src/features/entity-overlay/adapters/factura.js"
);
const incidenciaAdapter = read(
  "src/features/entity-overlay/adapters/incidencia.js"
);
const clienteAdapter = read(
  "src/features/entity-overlay/adapters/cliente.js"
);
const usuarioAdapter = read(
  "src/features/entity-overlay/adapters/usuario.js"
);
const facturas = read("src/views/facturas/index.js");
const incidencias = read("src/views/incidencias/index.js");
const homeTemplate = read("src/views/home/home.template.js");
const homeIndex = read("src/views/home/index.js");
const enhancements = read("src/app/enhancements.js");

for (const token of [
  "ENTITY_OVERLAY_VERSION",
  "data-entity-open='true'",
  'factura: () => import("./adapters/factura.js")',
  'incidencia: () => import("./adapters/incidencia.js")',
  'cliente: () => import("./adapters/cliente.js")',
  'usuario: () => import("./adapters/usuario.js")',
  'AppCore?.registerModule?.(',
  "noRouterNavigationRequired: true",
  "_adapterClosed",
]) {
  assert.ok(
    service.includes(token),
    `entity-overlay: falta ${token}`
  );
}

for (const [name, source] of [
  ["factura", facturaAdapter],
  ["incidencia", incidenciaAdapter],
  ["cliente", clienteAdapter],
  ["usuario", usuarioAdapter],
]) {
  assert.ok(
    source.includes("createEntityAdapter"),
    `${name}: factory ausente`
  );
  assert.ok(
    source.includes("async open"),
    `${name}: open ausente`
  );
  assert.ok(
    source.includes("async close"),
    `${name}: close ausente`
  );
}

for (const token of [
  "export function createFacturasController",
  "mountDetailOnly()",
  "suppressEntityOverlayCallback",
]) {
  assert.ok(
    facturas.includes(token),
    `facturas: falta ${token}`
  );
}

for (const token of [
  "export function createIncidenciasController",
  "mountDetailOnly()",
  "suppressEntityOverlayCallback",
]) {
  assert.ok(
    incidencias.includes(token),
    `incidencias: falta ${token}`
  );
}

for (const token of [
  'OPEN_ENTITY: "open-entity"',
  'data-entity-open="true"',
  'data-entity-type="${attr(type)}"',
  'data-entity-id="${attr(id)}"',
]) {
  assert.ok(
    homeTemplate.includes(token),
    `home template: falta ${token}`
  );
}

for (const token of [
  "openEntityFromNode",
  '../../features/entity-overlay/index.js',
  "HOME_ACTIONS.OPEN_ENTITY",
]) {
  assert.ok(
    homeIndex.includes(token),
    `home controller: falta ${token}`
  );
}

assert.ok(
  enhancements.includes('key: "entity-overlay"'),
  "enhancements: feature entity-overlay ausente"
);
assert.ok(
  enhancements.includes('scope: "private"'),
  "enhancements: scope private ausente"
);
assert.ok(
  enhancements.includes('scopes.add("private")'),
  "enhancements: activación private ausente"
);

console.log(
  "Entity Overlay contract: PASS · canonical adapters=4 · cross-view=true"
);
